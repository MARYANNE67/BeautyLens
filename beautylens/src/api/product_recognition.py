"""
Product Text Recognition
Uses Google Cloud Vision API to extract brand/product text from
a cropped bounding box region, then matches against known brands.
"""
import base64
import re
import httpx
from typing import Optional
import os

VISION_API_URL = "https://vision.googleapis.com/v1/images:annotate"

# Known makeup brands for matching
KNOWN_BRANDS = [
    "MAC", "YSL", "Yves Saint Laurent", "Fenty Beauty", "Charlotte Tilbury",
    "NARS", "Maybelline", "L'Oreal", "Loreal", "NYX", "Revlon", "CoverGirl",
    "Estee Lauder", "Clinique", "Bobbi Brown", "Urban Decay", "Too Faced",
    "Anastasia Beverly Hills", "ABH", "Morphe", "e.l.f", "ELF", "Rare Beauty",
    "Huda Beauty", "Pat McGrath", "Dior", "Chanel", "Givenchy", "Lancôme",
    "Lancome", "Giorgio Armani", "Tom Ford", "Haus Labs", "Makeup Forever",
    "MAKE UP FOR EVER", "Smashbox", "Bare Minerals", "bareMinerals",
    "Tarte", "Benefit", "INGLOT", "Milani", "Wet n Wild", "Rimmel",
    "Max Factor", "Bourjois", "Catrice", "essence", "KIKO", "hudabeauty", "Huda Beauty", "MAC", "M·A·C", "M.A.C",
]

# Product type keywords to extract shade/finish info
SHADE_PATTERNS = [
    r'\b(NW|NC|N|W|C)\s*\d+\b',          # MAC shade codes e.g. NW45
    r'\b\d+(\.\d+)?\s*(ml|oz|g|fl)\b',    # sizes — exclude these
    r'\b(matte|satin|glossy|gloss|sheer|full coverage|medium)\b',
    r'\b(SPF\s*\d+)\b',
    r'#[A-Fa-f0-9]{3,6}\b',               # hex color codes sometimes printed
]


async def extract_text_from_image_region(
    image_bytes: bytes,
    bbox: dict,
    image_width: int,
    image_height: int,
) -> Optional[tuple[str, Optional[str]]]:
    """
    Crop the bounding box region from the image and run OCR via Google Vision API.
    Returns raw extracted text or None if OCR fails/finds nothing.
    """
    api_key = os.getenv("GOOGLE_VISION_API_KEY")
    # Log only presence -- no other metadata about the secret.
    print(f"[OCR] API key loaded: {bool(api_key)}")
    if not api_key:
        return None

    try:
        import cv2
        import numpy as np

        # Decode image bytes to numpy array
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return None

        h, w = img.shape[:2]

        # Extract and clamp bounding box coordinates
        x1 = max(0, int(bbox.get("x1", 0)))
        y1 = max(0, int(bbox.get("y1", 0)))
        x2 = min(w, int(bbox.get("x2", w)))
        y2 = min(h, int(bbox.get("y2", h)))

        if x2 <= x1 or y2 <= y1:
            return None

        # Crop and upscale for better OCR accuracy
        cropped = img[y1:y2, x1:x2]
        scale = max(1, 300 // max(cropped.shape[:2]))
        if scale > 1:
            cropped = cv2.resize(
                cropped,
                (cropped.shape[1] * scale, cropped.shape[0] * scale),
                interpolation=cv2.INTER_CUBIC,
            )

        # Encode cropped region as JPEG base64
        _, buffer = cv2.imencode(".jpg", cropped, [cv2.IMWRITE_JPEG_QUALITY, 95])
        encoded = base64.b64encode(buffer.tobytes()).decode("utf-8")

        # Call Google Vision API
        payload = {
            "requests": [{
                "image": {"content": encoded},
                "features": [{"type": "TEXT_DETECTION", "maxResults": 50},   {"type": "LOGO_DETECTION", "maxResults": 5}, ],
                "imageContext": {"languageHints": ["en"]}
            }]
        }

        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.post(
                f"{VISION_API_URL}?key={api_key}",
                json=payload,
            )

        if response.status_code != 200:
            return None

        data = response.json()
        annotations = (
            data.get("responses", [{}])[0].get("textAnnotations", [])
        )
        if not annotations:
            return None

        # Text
        full_text = ""
        if annotations:
            full_text = annotations[0].get("description", "").strip()

        # Logo
        logos = data.get("responses", [{}])[0].get("logoAnnotations", [])
        detected_logo = logos[0].get("description") if logos else None

        return full_text, detected_logo

    except Exception as e:
        print(f"[OCR] Error: {e}")
        return None

def parse_product_from_text(
    raw_text: str,
    product_class: str,
    detected_logo: Optional[str] = None,
) -> dict:
    """
    Parse brand name, product name, and shade from raw OCR text + logo detection.
    Returns enriched product info dict.
    """
    if not raw_text and not detected_logo:
        return {}

    lines = [line.strip() for line in raw_text.split("\n") if line.strip()] if raw_text else []
    text_upper = raw_text.upper() if raw_text else ""

    # ── Brand detection ───────────────────────────────────────────────────────
    # Priority: logo detection > text match (logos handle stylized fonts)
    detected_brand = None

    if detected_logo:
        # Clean up logo string e.g. "MAC Cosmetics" → "MAC"
        logo_clean = detected_logo.strip()
        # Try to match against known brands first
        for brand in sorted(KNOWN_BRANDS, key=len, reverse=True):
            if brand.upper() in logo_clean.upper():
                detected_brand = brand
                break
        # If no known brand matched, use the logo string directly
        if not detected_brand:
            detected_brand = logo_clean

    # Fall back to text matching if logo didn't find a brand
    if not detected_brand and raw_text:
        for brand in sorted(KNOWN_BRANDS, key=len, reverse=True):
            if brand.upper() in text_upper:
                detected_brand = brand
                break

    # ── Product signature matching ────────────────────────────────────────────
    # Catch popular products even when brand logo is unreadable
    PRODUCT_SIGNATURES: dict[str, str] = {
        "studio fix": "MAC",
        "pro filt'r": "Fenty Beauty",
        "pro filtr": "Fenty Beauty",
        "soft matte": "NYX",
        "cant stop wont stop": "NYX",
        "fit me": "Maybelline",
        "infallible": "L'Oreal",
        "born this way": "Too Faced",
        "double wear": "Estee Lauder",
        "skin tint": "Charlotte Tilbury",
        "airbrush flawless": "Charlotte Tilbury",
        "light wonder": "Charlotte Tilbury",
        "all nighter": "Urban Decay",
        "butter gloss": "NYX",
        "longwear": "NARS",
        "sheer glow": "NARS",
        "natural radiant": "NARS",
        "luminous silk": "Giorgio Armani",
        "power fabric": "Giorgio Armani",
        "serum foundation": "Giorgio Armani",
        "tinted moisturizer": "Laura Mercier",
        "bb blur": "Benefit",
        "hello happy": "Benefit",
        "bare skin": "bareMinerals",
        "original foundation": "bareMinerals",
        "amazonian clay": "Tarte",
        "shape tape": "Tarte",
        "stay all day": "Stila",
        "true match": "L'Oreal",
        "age perfect": "L'Oreal",
        "instant age rewind": "Maybelline",
        "dream satin": "Maybelline",
        "bb cream": "Garnier",
        "micellar": "Garnier",
        "naked": "Urban Decay",
        "concealer stick": "NARS",
        "huda beauty": "Huda Beauty",
        "#fauxfilter": "Huda Beauty",
        "faux filter": "Huda Beauty",
        "butter": "Huda Beauty",
    }

    if not detected_brand and raw_text:
        text_lower = raw_text.lower()
        for signature, brand in PRODUCT_SIGNATURES.items():
            if signature in text_lower:
                detected_brand = brand
                break

    # ── Shade / finish extraction ─────────────────────────────────────────────
    SHADE_PATTERNS_LOCAL = [
        r'\b(NW|NC|N|W|C)\s*\d+(\.\d+)?\b',           # MAC shade codes e.g. NW45
        r'\b\d{3}[A-Z]?\b(?!\s*(ml|oz|g))',             # numeric shades e.g. 220, 310C
        r'\b(fair|light|medium|tan|deep|rich|dark)\s+\w+\b',  # descriptive shades
        r'\b(ivory|porcelain|beige|caramel|espresso|mocha|sand|nude|buff|warm|cool|golden|honey|almond|mahogany|chestnut|hazel|walnut|pecan|toffee|cocoa|ebony|sable)\b',
        r'\b(matte|satin|luminous|dewy|natural|radiant|glow|shimmer|glitter)\b',
        r'\b(SPF)\s*\d+\b',
    ]

    detected_shade = None
    for pattern in SHADE_PATTERNS_LOCAL:
        match = re.search(pattern, raw_text, re.IGNORECASE)
        if match:
            val = match.group().strip()
            # Exclude sizes
            if not re.search(r'\d+\s*(ml|oz|g|fl)', val, re.IGNORECASE):
                detected_shade = val
                break

    # ── Product name extraction ───────────────────────────────────────────────
    # Skip: sizes, SPF lines, brand names, single characters, DIN numbers
    SKIP_PATTERNS = [
        r'^\d+(\.\d+)?\s*(ml|oz|g|fl\s*oz)$',
        r'^(SPF|UVA|UVB|DIN|DUPE)\s*[\d\w]+$',
        r'^[\d\s\.\-\/]+$',         # pure numbers/punctuation
        r'^[A-Z]{1,2}$',            # single/double letter codes
    ]
    skip_words = {'spf', 'uvb', 'uva', 'fps', 'din', 'pao', 'ml', 'oz', 'fl'}
    brand_uppers = {b.upper() for b in KNOWN_BRANDS}

    candidate_lines = []
    for line in lines:
        if len(line) <= 3:
            continue
        if line.upper() in brand_uppers:
            continue
        if any(re.match(p, line, re.IGNORECASE) for p in SKIP_PATTERNS):
            continue
        if line.lower() in skip_words:
            continue
        # Skip lines that are just the detected brand repeated
        if detected_brand and line.upper() == detected_brand.upper():
            continue
        candidate_lines.append(line)

    # Build product name from best candidate lines
    # Prefer lines that look like product names (title case, 2+ words, no special chars)
    product_name = None
    for line in sorted(candidate_lines, key=len, reverse=True):
        if len(line) >= 5:
            product_name = line
            break

    # Try to build a richer product name from multiple lines
    # e.g. "STUDIO" + "FIX" + "FLUID SPF 15" → "Studio Fix Fluid SPF 15"
    if len(candidate_lines) >= 2:
        # Take the top 3 non-brand candidate lines and join them
        top = [l for l in candidate_lines if len(l) >= 3][:3]
        combined = " ".join(top)
        if len(combined) > len(product_name or ""):
            product_name = combined

    # Title-case the product name if it's all caps
    if product_name and product_name == product_name.upper():
        product_name = product_name.title()

    # ── Build result ──────────────────────────────────────────────────────────
    result: dict = {}
    if detected_brand:
        result["brand"] = detected_brand
    if product_name and product_name.upper() != (detected_brand or "").upper():
        result["product_name"] = product_name
    if detected_shade:
        result["shade"] = detected_shade
    if raw_text:
        result["raw_ocr_text"] = raw_text[:400]

    # Build display name
    parts = []
    if detected_brand:
        parts.append(detected_brand)
    if product_name and product_name.upper() != (detected_brand or "").upper():
        parts.append(product_name)
    elif product_class:
        parts.append(product_class.title())
    if detected_shade and not any(
        detected_shade.lower() in p.lower() for p in parts
    ):
        parts.append(f"in {detected_shade}")

    if parts:
        result["display_name"] = " ".join(parts)

    return result