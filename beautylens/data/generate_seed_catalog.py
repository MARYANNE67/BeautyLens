"""
Generates data/shade_catalog_seed.json.

The (brand, product line, shade name, category, depth, undertone, finish,
coverage, skin types, price) columns below are hand-curated from public
brand shade-range/spec pages. The CIELAB (lab_l, lab_a, lab_b) columns are
NOT measured colorimetry -- no colorimeter data exists for an indie seed
catalog like this -- they're a documented heuristic approximation derived
from the depth category and undertone category, used only so
src/api/matching.py has something numeric to compute Delta E distance over.
If real measured/scraped LAB data ever replaces this, this script and its
approximation can be deleted.

Run: python data/generate_seed_catalog.py
"""
import json
from pathlib import Path

# Midpoint L* per depth category (lighter skin ~= higher L*).
DEPTH_L = {
    "fair": 78,
    "light": 71,
    "light-medium": 65,
    "medium": 58,
    "medium-deep": 51,
    "deep": 44,
    "rich-deep": 34,
}

# a*/b* offsets per undertone category (a* = green-red, b* = blue-yellow).
# warm = more yellow (high b*), cool = more pink/less yellow, olive = muted/greenish (low a*).
UNDERTONE_AB = {
    "warm": (6, 16),
    "neutral": (7, 11),
    "cool": (9, 6),
    "olive": (3, 13),
}


def lab_for(depth: str, undertone: str) -> tuple[float, float, float]:
    l = DEPTH_L[depth]
    a, b = UNDERTONE_AB[undertone]
    return float(l), float(a), float(b)


# (brand, product_line, shade_name, category, depth, undertone, finish, coverage, skin_types, price)
FOUNDATIONS = [
    ("Fenty Beauty", "Pro Filt'r Soft Matte Longwear Foundation", "110", "foundation", "fair", "neutral", "matte", "full", "oily,combination", 40),
    ("Fenty Beauty", "Pro Filt'r Soft Matte Longwear Foundation", "190", "foundation", "light-medium", "warm", "matte", "full", "oily,combination", 40),
    ("Fenty Beauty", "Pro Filt'r Soft Matte Longwear Foundation", "240", "foundation", "medium", "neutral", "matte", "full", "oily,combination", 40),
    ("Fenty Beauty", "Pro Filt'r Soft Matte Longwear Foundation", "350", "foundation", "deep", "warm", "matte", "full", "oily,combination", 40),

    ("MAC", "Studio Fix Fluid SPF 15 Foundation", "NC15", "foundation", "fair", "warm", "matte", "full", "oily,combination", 41),
    ("MAC", "Studio Fix Fluid SPF 15 Foundation", "NW20", "foundation", "light", "cool", "matte", "full", "oily,combination", 41),
    ("MAC", "Studio Fix Fluid SPF 15 Foundation", "NC42", "foundation", "medium", "warm", "matte", "full", "oily,combination", 41),
    ("MAC", "Studio Fix Fluid SPF 15 Foundation", "NW50", "foundation", "deep", "cool", "matte", "full", "oily,combination", 41),

    ("NARS", "Sheer Glow Foundation", "Mont Blanc", "foundation", "fair", "neutral", "radiant", "medium", "dry,combination", 49),
    ("NARS", "Sheer Glow Foundation", "Punjab", "foundation", "light-medium", "warm", "radiant", "medium", "dry,combination", 49),
    ("NARS", "Sheer Glow Foundation", "Vallauris", "foundation", "medium", "neutral", "radiant", "medium", "dry,combination", 49),
    ("NARS", "Sheer Glow Foundation", "New Orleans", "foundation", "deep", "warm", "radiant", "medium", "dry,combination", 49),

    ("Maybelline", "Fit Me Matte + Poreless Foundation", "112 Natural Ivory", "foundation", "fair", "warm", "matte", "medium", "oily,combination", 9),
    ("Maybelline", "Fit Me Matte + Poreless Foundation", "220 Natural Beige", "foundation", "light-medium", "neutral", "matte", "medium", "oily,combination", 9),
    ("Maybelline", "Fit Me Matte + Poreless Foundation", "310 Sun Beige", "foundation", "medium", "warm", "matte", "medium", "oily,combination", 9),
    ("Maybelline", "Fit Me Matte + Poreless Foundation", "355 Coconut", "foundation", "deep", "neutral", "matte", "medium", "oily,combination", 9),

    ("L'Oreal Paris", "True Match Foundation", "N1 Ivory Nude", "foundation", "fair", "neutral", "natural", "medium", "combination", 13),
    ("L'Oreal Paris", "True Match Foundation", "W3 Nude Beige", "foundation", "light-medium", "warm", "natural", "medium", "combination", 13),
    ("L'Oreal Paris", "True Match Foundation", "C5 Classic Beige", "foundation", "medium", "cool", "natural", "medium", "combination", 13),
    ("L'Oreal Paris", "True Match Foundation", "W8 Warm Ebony", "foundation", "deep", "warm", "natural", "medium", "combination", 13),

    ("Estee Lauder", "Double Wear Stay-in-Place Foundation", "1C0 Shell", "foundation", "fair", "cool", "matte", "full", "oily,combination", 47),
    ("Estee Lauder", "Double Wear Stay-in-Place Foundation", "2W1 Dawn", "foundation", "light-medium", "warm", "matte", "full", "oily,combination", 47),
    ("Estee Lauder", "Double Wear Stay-in-Place Foundation", "3N1 Ivory Beige", "foundation", "medium", "neutral", "matte", "full", "oily,combination", 47),
    ("Estee Lauder", "Double Wear Stay-in-Place Foundation", "5W1 Bronze", "foundation", "deep", "warm", "matte", "full", "oily,combination", 47),

    ("NYX Professional Makeup", "Can't Stop Won't Stop Foundation", "Pale", "foundation", "fair", "neutral", "matte", "full", "oily,combination", 15),
    ("NYX Professional Makeup", "Can't Stop Won't Stop Foundation", "Light Ivory", "foundation", "light", "warm", "matte", "full", "oily,combination", 15),
    ("NYX Professional Makeup", "Can't Stop Won't Stop Foundation", "Medium Olive", "foundation", "medium", "olive", "matte", "full", "oily,combination", 15),
    ("NYX Professional Makeup", "Can't Stop Won't Stop Foundation", "Deep Sable", "foundation", "deep", "neutral", "matte", "full", "oily,combination", 15),

    ("e.l.f. Cosmetics", "Flawless Satin Foundation", "Porcelain", "foundation", "fair", "cool", "radiant", "medium", "dry,combination", 8),
    ("e.l.f. Cosmetics", "Flawless Satin Foundation", "Buff", "foundation", "light-medium", "warm", "radiant", "medium", "dry,combination", 8),
    ("e.l.f. Cosmetics", "Flawless Satin Foundation", "Sand", "foundation", "medium", "warm", "radiant", "medium", "dry,combination", 8),
    ("e.l.f. Cosmetics", "Flawless Satin Foundation", "Espresso", "foundation", "rich-deep", "neutral", "radiant", "medium", "dry,combination", 8),

    ("IT Cosmetics", "CC+ Cream SPF 50", "Fair", "foundation", "fair", "neutral", "radiant", "medium", "dry,combination", 42),
    ("IT Cosmetics", "CC+ Cream SPF 50", "Light", "foundation", "light-medium", "neutral", "radiant", "medium", "dry,combination", 42),
    ("IT Cosmetics", "CC+ Cream SPF 50", "Medium", "foundation", "medium", "warm", "radiant", "medium", "dry,combination", 42),
    ("IT Cosmetics", "CC+ Cream SPF 50", "Rich", "foundation", "deep", "warm", "radiant", "medium", "dry,combination", 42),

    ("Charlotte Tilbury", "Airbrush Flawless Foundation", "2 Fair", "foundation", "fair", "cool", "natural", "medium", "combination", 49),
    ("Charlotte Tilbury", "Airbrush Flawless Foundation", "5 Light", "foundation", "light-medium", "neutral", "natural", "medium", "combination", 49),
    ("Charlotte Tilbury", "Airbrush Flawless Foundation", "8 Medium", "foundation", "medium", "neutral", "natural", "medium", "combination", 49),
    ("Charlotte Tilbury", "Airbrush Flawless Foundation", "12 Tan", "foundation", "medium-deep", "warm", "natural", "medium", "combination", 49),
]

CONCEALERS = [
    ("Fenty Beauty", "Pro Filt'r Concealer", "110", "concealer", "fair", "neutral", "natural", "full", "combination", 27),
    ("Fenty Beauty", "Pro Filt'r Concealer", "240", "concealer", "medium", "neutral", "natural", "full", "combination", 27),
    ("Fenty Beauty", "Pro Filt'r Concealer", "370", "concealer", "deep", "warm", "natural", "full", "combination", 27),

    ("Maybelline", "Fit Me Concealer", "10 Fair", "concealer", "fair", "neutral", "natural", "medium", "combination", 8),
    ("Maybelline", "Fit Me Concealer", "20 Sand", "concealer", "light-medium", "warm", "natural", "medium", "combination", 8),
    ("Maybelline", "Fit Me Concealer", "40 Deep", "concealer", "deep", "warm", "natural", "medium", "combination", 8),

    ("NYX Professional Makeup", "Bare With Me Concealer Serum", "Fair", "concealer", "fair", "neutral", "natural", "medium", "dry,combination", 12),
    ("NYX Professional Makeup", "Bare With Me Concealer Serum", "Light Medium", "concealer", "light-medium", "neutral", "natural", "medium", "dry,combination", 12),
    ("NYX Professional Makeup", "Bare With Me Concealer Serum", "Deep Golden", "concealer", "deep", "warm", "natural", "medium", "dry,combination", 12),

    ("e.l.f. Cosmetics", "16HR Camo Concealer", "Fair Rose", "concealer", "fair", "cool", "matte", "full", "oily,combination", 7),
    ("e.l.f. Cosmetics", "16HR Camo Concealer", "Medium Sand", "concealer", "medium", "warm", "matte", "full", "oily,combination", 7),
    ("e.l.f. Cosmetics", "16HR Camo Concealer", "Deep Sable", "concealer", "deep", "neutral", "matte", "full", "oily,combination", 7),

    ("Tarte Cosmetics", "Shape Tape Concealer", "Fair Neutral", "concealer", "fair", "neutral", "natural", "full", "combination", 31),
    ("Tarte Cosmetics", "Shape Tape Concealer", "Light Medium", "concealer", "light-medium", "warm", "natural", "full", "combination", 31),
    ("Tarte Cosmetics", "Shape Tape Concealer", "Medium Sand", "concealer", "medium", "neutral", "natural", "full", "combination", 31),

    ("MAC", "Studio Fix Concealer", "NC15", "concealer", "fair", "warm", "matte", "medium", "combination", 27),
    ("MAC", "Studio Fix Concealer", "NC42", "concealer", "medium", "warm", "matte", "medium", "combination", 27),
    ("MAC", "Studio Fix Concealer", "NW45", "concealer", "deep", "cool", "matte", "medium", "combination", 27),
]


def build_catalog() -> list[dict]:
    catalog = []
    for brand, line, shade, category, depth, undertone, finish, coverage, skin_types, price in FOUNDATIONS + CONCEALERS:
        lab_l, lab_a, lab_b = lab_for(depth, undertone)
        catalog.append({
            "brand": brand,
            "product_line": line,
            "shade_name": shade,
            "category": category,
            "depth_category": depth,
            "undertone_category": undertone,
            "lab_l": lab_l,
            "lab_a": lab_a,
            "lab_b": lab_b,
            "finish": finish,
            "coverage": coverage,
            "skin_types": skin_types,
            "price": float(price),
            "currency": "USD",
        })
    return catalog


if __name__ == "__main__":
    catalog = build_catalog()
    out_path = Path(__file__).with_name("shade_catalog_seed.json")
    out_path.write_text(json.dumps(catalog, indent=2), encoding="utf-8")
    print(f"Wrote {len(catalog)} shades to {out_path}")
