"""
Builds the shade catalog from REAL measured swatch colour, replacing the
synthetic LAB values that generate_seed_catalog.py produces.

Source: The Pudding's `allShades.csv` (MIT licensed) -- 6,816 foundation and
concealer shades scraped from Sephora/Ulta in Jan 2021, each with the swatch
hex the retailer published. Attribution belongs in the app's credits:
    https://github.com/the-pudding/data/tree/master/foundation-names

Why this matters: the old catalog derived lab_l from the depth *label*, so
every "deep" shade shared one L* value and Delta E could not tell three
different products apart. Here the direction of inference is reversed --
colour is measured first, and the depth/undertone labels are derived from it.

    Usage:
        python data/build_catalog_from_shades.py --source data/sources/allShades.csv
        python data/build_catalog_from_shades.py --brands "Fenty Beauty,NARS"

What this script does NOT get from the source, and how it fills the gap:
    price      -- absent upstream. Approximated per brand; treat as indicative.
    finish     -- inferred from the product-line name, else "natural".
    coverage   -- inferred from the product-line name, else "medium".
    skin_types -- not modelled upstream; left empty.
Only the colour columns carry real measurement. Everything else is metadata,
and the app should not imply otherwise.
"""
import argparse
import csv
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.api.skin_analysis import bgr_patch_to_lab, classify_depth  # noqa: E402

OUT_PATH = Path(__file__).resolve().parent / "shade_catalog_seed.json"

# Real skin occupies a narrow wedge in a*/b* at every depth. The source
# contains a few non-skin rows (a literal "Blue" shade) and blank #FEFEFE
# placeholders where the retailer never rendered a swatch; these would sit at
# implausible coordinates and drag matches toward them, so drop them.
SKIN_GAMUT = {"a": (0.5, 30.0), "b": (5.0, 45.0), "l": (10.0, 98.0)}

# Undertone is assigned RELATIVE to each depth band, not against absolute a*/b*
# reference points. Measured across the source, hue angle drifts from ~66 deg
# (fair) to ~51 deg (rich-deep), so any fixed threshold would label deep skin
# "cool" purely because it is deep -- encoding depth twice and calling the
# second copy undertone. Percentiles within a band remove that confound.
# The split is a modelling assumption about how undertone is distributed,
# not a measurement; it is stated here so it can be argued with.
DEPTH_BANDS = ["fair", "light", "light-medium", "medium", "medium-deep", "deep", "rich-deep"]
UNDERTONE_ORDER = ["warm", "neutral", "cool", "olive"]

UNDERTONE_PERCENTILES = [
    (30.0, "cool"),     # least yellow within its depth band
    (60.0, "neutral"),
    (85.0, "warm"),
    (100.0, "olive"),   # most yellow-green within its band; 100 == the band max,
                        # so this arm catches everything above the 85th pct.
]

FINISH_KEYWORDS = [
    ("matte", "matte"), ("velvet", "matte"), ("blur", "matte"),
    ("radiant", "radiant"), ("luminous", "radiant"), ("glow", "radiant"),
    ("dewy", "radiant"), ("illuminating", "radiant"), ("serum", "radiant"),
    ("natural", "natural"), ("satin", "natural"), ("nude", "natural"),
]
COVERAGE_KEYWORDS = [
    ("full", "full"), ("24 hour", "full"), ("stay-in-place", "full"),
    ("ultimate", "full"), ("high", "full"),
    ("sheer", "light"), ("light", "light"), ("tinted", "light"),
    ("skin tint", "light"), ("bb", "light"), ("cc", "light"),
    ("medium", "medium"), ("buildable", "medium"),
]

# Price is absent from this source entirely. It used to be filled in from the
# per-brand table below, with a 29.0 fallback that covered 63% of the catalog --
# a guess, rendered in the UI as "$29" and fed into the budget penalty as if it
# were retail fact. Shades from here now carry price=None ("unknown") and the
# Makeup API builder supplies real prices where it has them.
#
# The table is kept because it is still a reasonable *indicative* range per
# brand, and is the obvious starting point if price scraping lands later.
BRAND_PRICE_INDICATIVE = {
    "Fenty Beauty": 40.0, "NARS": 47.0, "MAC": 37.0, "Estée Lauder": 48.0,
    "Estee Lauder": 48.0, "Clinique": 35.0, "Too Faced": 42.0,
    "Urban Decay Cosmetics": 40.0, "Tarte": 39.0, "bareMinerals": 35.0,
    "Anastasia Beverly Hills": 34.0, "Morphe": 20.0, "KVD Vegan Beauty": 39.0,
    "NYX Professional Makeup": 12.0, "L'Oréal": 13.0, "L'Oreal": 13.0,
    "Maybelline": 11.0, "e.l.f. Cosmetics": 8.0, "BLK/OPL": 12.0,
    "Juvia's Place": 26.0, "Dose Of Colors": 36.0, "BECCA Cosmetics": 44.0,
    "PÜR": 35.0, "IT Cosmetics": 40.0, "Charlotte Tilbury": 46.0,
}
DEFAULT_PRICE = 29.0


def hex_to_lab(raw: str):
    """sRGB hex -> CIELAB, via the same OpenCV path skin_analysis.py uses for
    camera frames. Using a different conversion here would put catalog colour
    and scan colour in subtly different spaces and quietly inflate Delta E."""
    h = raw.strip().lstrip("#")
    if len(h) != 6:
        return None
    try:
        r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    except ValueError:
        return None
    return bgr_patch_to_lab(np.array([[[b, g, r]]], dtype=np.uint8))


def in_skin_gamut(l, a, b) -> bool:
    return (SKIN_GAMUT["l"][0] < l < SKIN_GAMUT["l"][1]
            and SKIN_GAMUT["a"][0] < a < SKIN_GAMUT["a"][1]
            and SKIN_GAMUT["b"][0] < b < SKIN_GAMUT["b"][1])


def classify_category(product_line: str):
    """Foundation is tested FIRST so hybrids resolve to foundation.

    Most "concealer" rows in the source are dual-purpose products -- "Conceal
    + Perfect 2-in-1 Foundation + Concealer", "Beyond Perfecting Foundation +
    Concealer". Testing concealer first pulled those out of the foundation
    pool (where they are legitimate matches) and into the concealer pool,
    where they diluted the category to the point that only one line in the
    whole source, "Un" Cover-up Concealer, was a standalone concealer.
    A shade range sold as a foundation is a foundation.
    """
    name = product_line.lower()
    if "foundation" in name or "skin tint" in name or "bb cream" in name:
        return "foundation"
    if "concealer" in name or "corrector" in name:
        return "concealer"
    return None


def _shade_name(row) -> str:
    """The source leaves `name` as "NA" for 1,861 rows -- but every one of them
    carries the retailer's shade code in `specific` ("2N1", "NC45.5", "W480").
    Reading only `name` discarded those rows outright, most of them foundation
    shades we have real colour for."""
    for column in ("name", "specific"):
        value = (row.get(column) or "").strip()
        if value and value.upper() != "NA":
            return value
    return ""


def _keyword_match(product_line: str, table, default: str) -> str:
    name = product_line.lower()
    for needle, value in table:
        if needle in name:
            return value
    return default


def load_source(path: Path, brands=None):
    rows = []
    dropped = defaultdict(int)
    with path.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            brand = (row.get("brand") or "").strip()
            product_line = (row.get("product") or "").strip()
            shade_name = _shade_name(row)

            if brands and brand not in brands:
                dropped["brand filter"] += 1
                continue
            category = classify_category(product_line)
            if category is None:
                dropped["not a foundation/concealer"] += 1
                continue
            if not shade_name or shade_name.upper() == "NA":
                dropped["no shade name"] += 1
                continue

            lab = hex_to_lab(row.get("hex", ""))
            if lab is None:
                dropped["unparseable hex"] += 1
                continue
            l, a, b = lab
            if not in_skin_gamut(l, a, b):
                dropped["outside skin gamut"] += 1
                continue

            rows.append({
                "brand": brand,
                "product_line": product_line,
                "shade_name": shade_name,
                "category": category,
                "depth_category": classify_depth(l),
                "lab_l": round(float(l), 1),
                "lab_a": round(float(a), 1),
                "lab_b": round(float(b), 1),
                "hue": math.degrees(math.atan2(b, a)),
                "finish": _keyword_match(product_line, FINISH_KEYWORDS, "natural"),
                "coverage": _keyword_match(product_line, COVERAGE_KEYWORDS, "medium"),
                "skin_types": "",
                "price": None,
                "currency": None,
                "source_url": (row.get("url") or "").strip() or None,
            })
    return rows, dropped


def assign_undertones(rows) -> None:
    """Label undertone by hue-angle percentile *within* each depth band."""
    by_depth = defaultdict(list)
    for r in rows:
        by_depth[r["depth_category"]].append(r)

    for depth, group in by_depth.items():
        hues = [r["hue"] for r in group]
        cuts = [(np.percentile(hues, p), label) for p, label in UNDERTONE_PERCENTILES]
        for r in group:
            for threshold, label in cuts:
                if r["hue"] <= threshold:
                    r["undertone_category"] = label
                    break
            else:
                r["undertone_category"] = "olive"


def dedupe(rows):
    """The source lists a shade once per retailer, so the same product appears
    twice with identical colour. Left in, duplicates would fill every
    recommendation slot with one product under two names."""
    seen = {}
    for r in rows:
        key = (r["brand"].lower(), r["product_line"].lower(), r["shade_name"].lower())
        seen.setdefault(key, r)
    return list(seen.values())


def emit_anchors(rows) -> None:
    """Print the a*/b* centroid blocks that src/api/undertone.py holds as
    constants. Those constants have to describe the catalog the matcher is
    actually scoring against -- when they drifted out of sync the undertone
    estimate collapsed to "warm" for 8 of 9 depth bands, silently. Printing
    them here makes resyncing mechanical instead of remembered."""
    by = defaultdict(list)
    for r in rows:
        by[(r["depth_category"], r["undertone_category"])].append(r)
        by[(None, r["undertone_category"])].append(r)

    def centroid(key):
        g = by[key]
        return (sum(r["lab_a"] for r in g) / len(g), sum(r["lab_b"] for r in g) / len(g))

    print("\n# paste into src/api/undertone.py")
    print("UNDERTONE_AB_CENTERS = {")
    for ut in UNDERTONE_ORDER:
        a, b = centroid((None, ut))
        print(f'    "{ut}": ({a:.1f}, {b:.1f}),')
    print("}\n")
    print("UNDERTONE_AB_CENTERS_BY_DEPTH = {")
    for band in DEPTH_BANDS:
        if not by[(band, UNDERTONE_ORDER[0])]:
            continue
        cells = ", ".join(
            f'"{ut}": ({centroid((band, ut))[0]:.1f}, {centroid((band, ut))[1]:.1f})'
            for ut in UNDERTONE_ORDER
        )
        print(f'    "{band}": {{{cells}}},')
    print("}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--source", default=str(Path(__file__).resolve().parent / "sources" / "allShades.csv"))
    ap.add_argument("--brands", default="", help="comma-separated brand allowlist")
    ap.add_argument("--out", default=str(OUT_PATH))
    ap.add_argument("--emit-anchors", action="store_true",
                    help="print undertone.py's a*/b* centroid constants for this catalog")
    args = ap.parse_args()

    src = Path(args.source)
    if not src.exists():
        print(f"source not found: {src}", file=sys.stderr)
        print("Download it from:\n  https://raw.githubusercontent.com/"
              "the-pudding/data/master/foundation-names/allShades.csv", file=sys.stderr)
        return 2

    brands = {b.strip() for b in args.brands.split(",") if b.strip()} or None
    rows, dropped = load_source(src, brands)
    rows = dedupe(rows)
    assign_undertones(rows)

    for r in rows:
        r.pop("hue", None)

    out = Path(args.out)
    out.write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"wrote {len(rows)} shades -> {out}")
    if dropped:
        print("\ndropped:")
        for reason, n in sorted(dropped.items(), key=lambda kv: -kv[1]):
            print(f"  {n:6} {reason}")

    if args.emit_anchors:
        emit_anchors(rows)

    print("\ncoverage per depth band:")
    for band in DEPTH_BANDS:
        sub = [r for r in rows if r["depth_category"] == band]
        if not sub:
            print(f"  {band:13}     0   <-- GAP")
            continue
        ls = [r["lab_l"] for r in sub]
        uts = defaultdict(int)
        for r in sub:
            uts[r["undertone_category"]] += 1
        spread = ", ".join(f"{k} {v}" for k, v in sorted(uts.items()))
        print(f"  {band:13} {len(sub):5}   L* {min(ls):5.1f}-{max(ls):5.1f}   {spread}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
