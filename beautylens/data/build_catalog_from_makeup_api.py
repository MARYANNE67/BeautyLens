"""
Adds shades from the Makeup API (makeup-api.herokuapp.com) to the catalog.

Why this source, alongside The Pudding CSV that build_catalog_from_shades.py
reads: it publishes a hex per shade *and* a product page URL per product, and
it carries real concealer ranges. The Pudding scrape is a foundation dataset --
it contains exactly one standalone concealer line, which left the concealer
category with 19 shades and no usable match below `light-medium`. This source
brings concealer to ~169 shades across all seven depth bands.

It does NOT replace The Pudding data. That file still supplies ~5,100 foundation
shades against this API's ~1,060; running both and merging is the point.

    Usage:
        python data/build_catalog_from_shades.py --source data/sources/allShades.csv
        python data/build_catalog_from_makeup_api.py          # merges into the above
        python data/build_catalog_from_makeup_api.py --only-api   # ignore existing

Caveats carried by this source, and how they are handled:
    price     -- only 72 of 166 products state USD. Another 12 are CAD/GBP and
                 82 state no currency at all. Only explicit USD is kept; the
                 rest become NULL (unknown) rather than being silently treated
                 as dollars. No FX conversion is invented.
    finish/coverage -- not published; inferred from the product name, same as
                 the other builder.
    freshness -- the dataset behind this API stopped being updated years ago,
                 so some products are discontinued. Shade *colour* is still
                 valid; availability is not guaranteed.
"""
import argparse
import json
import math
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from data.build_catalog_from_shades import (  # noqa: E402
    COVERAGE_KEYWORDS,
    DEPTH_BANDS,
    FINISH_KEYWORDS,
    OUT_PATH,
    _keyword_match,
    assign_undertones,
    dedupe,
    hex_to_lab,
    in_skin_gamut,
)
from src.api.skin_analysis import classify_depth  # noqa: E402

API_URL = "https://makeup-api.herokuapp.com/api/v1/products.json?product_type=foundation"

# The API's `product_type=foundation` bucket holds concealers too, tagged by
# `category`. Everything else in that bucket is a face base of some kind.
CONCEALER_CATEGORIES = {"concealer"}


def fetch(url: str) -> list:
    with urllib.request.urlopen(url, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _price(product) -> tuple:
    """(price, currency) -- only when the source states USD explicitly.

    82 of 166 products carry a price with no currency and no price sign. Those
    could be USD, CAD or GBP; guessing would put a wrong number next to a buy
    button and feed a wrong comparison into the budget penalty."""
    currency = (product.get("currency") or "").strip().upper()
    raw = product.get("price")
    if currency != "USD" or raw in (None, "", "0.0", "0"):
        return None, None
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None, None
    return (value, "USD") if value > 0 else (None, None)


def build_rows(products) -> tuple:
    rows = []
    dropped = defaultdict(int)

    for product in products:
        brand = (product.get("brand") or "").strip()
        product_line = (product.get("name") or "").strip()
        if not brand or not product_line:
            dropped["no brand or product name"] += 1
            continue

        colors = product.get("product_colors") or []
        if not colors:
            dropped["product has no shades"] += 1
            continue

        category = ("concealer" if product.get("category") in CONCEALER_CATEGORIES
                    else "foundation")
        price, currency = _price(product)
        finish = _keyword_match(product_line, FINISH_KEYWORDS, "natural")
        coverage = _keyword_match(product_line, COVERAGE_KEYWORDS, "medium")

        for color in colors:
            shade_name = (color.get("colour_name") or "").strip()
            lab = hex_to_lab(color.get("hex_value") or "")
            if lab is None:
                dropped["unparseable hex"] += 1
                continue
            l, a, b = lab
            if not in_skin_gamut(l, a, b):
                dropped["outside skin gamut"] += 1
                continue
            if not shade_name:
                # A shade with colour but no published name still matches fine;
                # name it by its hex so it stays identifiable in the UI.
                shade_name = (color.get("hex_value") or "").strip()

            rows.append({
                "brand": brand,
                "product_line": product_line,
                "shade_name": shade_name,
                "category": category,
                "depth_category": classify_depth(l),
                "lab_l": round(float(l), 1),
                "lab_a": round(float(a), 1),
                "lab_b": round(float(b), 1),
                "finish": finish,
                "coverage": coverage,
                "skin_types": "",
                "price": price,
                "currency": currency,
                "source_url": (product.get("product_link") or "").strip() or None,
            })

    return rows, dropped


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--url", default=API_URL)
    ap.add_argument("--out", default=str(OUT_PATH))
    ap.add_argument("--only-api", action="store_true",
                    help="write only API shades instead of merging into --out")
    ap.add_argument("--cache", default=str(Path(__file__).resolve().parent / "sources" / "makeup_api_foundation.json"),
                    help="read from this file if it exists instead of hitting the network")
    args = ap.parse_args()

    cache = Path(args.cache)
    if cache.exists():
        print(f"reading cached response: {cache}")
        products = json.loads(cache.read_text(encoding="utf-8"))
    else:
        print(f"fetching {args.url}")
        products = fetch(args.url)
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(products, indent=2), encoding="utf-8")
        print(f"cached -> {cache}")

    rows, dropped = build_rows(products)
    print(f"\n{len(rows)} shades from {len(products)} API products")
    for reason, n in sorted(dropped.items(), key=lambda kv: -kv[1]):
        print(f"  dropped {n:5} {reason}")

    out = Path(args.out)
    if not args.only_api and out.exists():
        existing = json.loads(out.read_text(encoding="utf-8"))
        # Existing rows predate the price/source_url columns being nullable.
        for r in existing:
            r.setdefault("source_url", None)
        print(f"merging with {len(existing)} existing shades in {out}")
        rows = existing + rows

    before = len(rows)
    rows = dedupe(rows)
    print(f"deduped {before} -> {len(rows)}")

    # assign_undertones() ranks on hue angle. Rows read back from the seed file
    # have already had it stripped, so recompute it for every row from the LAB
    # values -- the same definition build_catalog_from_shades.py uses.
    for r in rows:
        r["hue"] = math.degrees(math.atan2(r["lab_b"], r["lab_a"]))

    # Undertone percentiles are recomputed over the merged catalog: a cut point
    # derived from only one source would mislabel the other.
    assign_undertones(rows)
    for r in rows:
        r.pop("hue", None)

    out.write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nwrote {len(rows)} shades -> {out}")

    print("\ncoverage per depth band:")
    for band in DEPTH_BANDS:
        sub = [r for r in rows if r["depth_category"] == band]
        f = sum(1 for r in sub if r["category"] == "foundation")
        c = sum(1 for r in sub if r["category"] == "concealer")
        print(f"  {band:13} {len(sub):5}   foundation {f:5}   concealer {c:4}")

    priced = sum(1 for r in rows if r["price"] is not None)
    linked = sum(1 for r in rows if r.get("source_url"))
    print(f"\nwith a known price : {priced:5} / {len(rows)}")
    print(f"with a buy link    : {linked:5} / {len(rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
