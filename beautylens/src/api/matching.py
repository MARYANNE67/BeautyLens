"""
Cross-brand shade matching: given a skin scan's estimated depth/undertone
and the owning profile's preferences, score every catalog shade and return
the top matches with plain-language reasons -- mirroring the spec's
"Best overall / Slightly warmer / Slightly lighter" framing rather than a
bare product list.
"""
import json
from typing import Optional
from urllib.parse import quote_plus

from sqlalchemy.orm import Session

from src.api.models_db import ShadeProduct, SkinScan, UserProfile
from src.api.skin_analysis import DEPTH_CATEGORY_MIDPOINT_L, lab_to_hex

DEPTH_ORDER = [category for category, _ in DEPTH_CATEGORY_MIDPOINT_L]  # lightest -> darkest
WARMTH_RANK = {"cool": 0, "neutral": 1, "warm": 2}  # olive sits outside this axis

# Delta E (LAB distance) is the base "distance" -- lower is better. Everything
# else is a penalty added on top, so a shade with a poor depth/color match
# can never outrank one with a great color match just by hitting every
# preference checkbox.
# Per step of undertone distance. 12.0 was set when the synthetic catalog's
# best-match Delta E ran 10-19; against the real catalog it runs 1.5-3.2, which
# made undertone an absolute filter rather than a weighted term -- no colour
# difference could ever outweigh one undertone step. That matters because the
# undertone estimate itself is only ~35-50% confident, so a hard filter locks a
# user out of their true best match whenever the estimate is wrong.
#
# Measured across the 9 evaluate_matching.py bands, anything from 3.0 to 12.0
# is behaviour-identical here (worst dE 3.2, undertone honoured 9/9) because
# the catalog is dense enough to offer a same-undertone shade that is also
# closest in colour. 6.0 keeps that while leaving a shade ~6 dE closer able to
# win across undertone families -- insurance for the wrong-estimate case the
# evaluation set doesn't cover.
UNDERTONE_MISMATCH_PENALTY = 6.0
COVERAGE_MISMATCH_PENALTY = 3.0
FINISH_MISMATCH_PENALTY = 3.0
OVER_BUDGET_PENALTY = 6.0

# How close a shade has to be, in raw Delta E, before we're willing to call it
# a match. CIE76 rules of thumb: ~1 is imperceptible, ~2-3 noticeable only on
# close comparison, >5 obvious side by side, >10 obvious across a room.
#
# This exists because the catalog is not evenly deep. Without it the matcher
# happily labelled a Delta E of 17.9 "Best overall match" for deep skin --
# confidently wrong precisely where the catalog is thinnest, which is the worst
# possible failure mode. Now the numbers decide what we're allowed to claim.
DELTA_E_CLOSE = 5.0       # a genuine match
DELTA_E_APPROXIMATE = 10.0  # wearable-ish, but say so

MATCH_QUALITY_CLOSE = "close"
MATCH_QUALITY_APPROXIMATE = "approximate"
MATCH_QUALITY_POOR = "poor"


def classify_match_quality(delta_e: float) -> str:
    if delta_e <= DELTA_E_CLOSE:
        return MATCH_QUALITY_CLOSE
    if delta_e <= DELTA_E_APPROXIMATE:
        return MATCH_QUALITY_APPROXIMATE
    return MATCH_QUALITY_POOR

# Symmetric "distance" between undertone categories. cool-neutral-warm form a
# spectrum; olive doesn't map cleanly onto it (per the spec, olive "can be
# difficult to match using standard warm/cool categories"), so it's kept at
# a fixed, moderate distance from all three rather than ordered among them.
_UNDERTONE_DISTANCE = {
    frozenset(["cool", "neutral"]): 1.0,
    frozenset(["neutral", "warm"]): 1.0,
    frozenset(["cool", "warm"]): 2.0,
    frozenset(["cool", "olive"]): 1.5,
    frozenset(["neutral", "olive"]): 1.2,
    frozenset(["warm", "olive"]): 1.5,
}


def undertone_distance(a: str, b: str) -> float:
    if a == b:
        return 0.0
    return _UNDERTONE_DISTANCE.get(frozenset([a, b]), 1.5)


def delta_e_cie76(lab1: dict, lab2: dict) -> float:
    """Straight Euclidean distance in CIELAB -- CIE76, the simplest Delta E
    formula. Good enough to rank a curated catalog; CIE94/CIEDE2000 add
    perceptual corrections we don't need for an MVP-sized shade list."""
    return (
        (lab1["l"] - lab2["l"]) ** 2
        + (lab1["a"] - lab2["a"]) ** 2
        + (lab1["b"] - lab2["b"]) ** 2
    ) ** 0.5


def _humanize(value: str) -> str:
    return value.replace("-", " ").replace("_", " ").capitalize()


# Where the "find this shade" button points. A search URL is generated per
# request from the shade's own brand/line/name rather than stored, because a
# stored product URL is the fastest-rotting field in the catalog: both upstream
# datasets are snapshots, and a re-check found 112 of 154 Ulta product links
# already 404. A search query cannot go stale -- the retailer resolves it
# against their live catalog every time.
#
# Google is the default because no single retailer carries the whole catalog:
# it spans Sephora exclusives (Fenty, NARS), drugstore lines (Maybelline, NYX)
# and indie brands, so a store-specific search would return "no results" for a
# large share of shades. Swap SEARCH_PROVIDER to send traffic to one retailer.
SEARCH_URL_TEMPLATES = {
    "google": "https://www.google.com/search?q={q}",
    "ulta": "https://www.ulta.com/search?Ntt={q}",
    "sephora": "https://www.sephora.com/search?keyword={q}",
}
SEARCH_PROVIDER = "google"


def build_search_url(brand: str, product_line: str, shade_name: str,
                     provider: str = SEARCH_PROVIDER) -> str:
    """A search that lands on the shade's product page rather than a dead link."""
    brand = (brand or "").strip()
    product_line = (product_line or "").strip()

    # Drop the brand only when the product line already opens with it ("NARS" +
    # "NARS Sheer Glow Foundation"). Deduplicating word-by-word instead would
    # corrupt names that legitimately repeat a word -- it turned NYX's "Can't
    # Stop Won't Stop Foundation" into "Can't Stop Won't Foundation".
    if brand and product_line.lower().startswith(brand.lower()):
        terms = [product_line]
    else:
        terms = [brand, product_line]

    # Unnamed shades were backfilled with their hex code, which is meaningless
    # as a search term -- better to search the product and let the user pick.
    if shade_name and not shade_name.startswith("#"):
        terms.append(shade_name)

    query = " ".join(" ".join(terms).split())
    template = SEARCH_URL_TEMPLATES.get(provider, SEARCH_URL_TEMPLATES["google"])
    return template.format(q=quote_plus(query))


def score_shade(
    shade: ShadeProduct,
    scan_lab: dict,
    undertone: str,
    profile: UserProfile,
) -> tuple[float, float]:
    """Returns (composite_distance, delta_e) -- lower composite_distance is
    a better match."""
    delta_e = delta_e_cie76(scan_lab, {"l": shade.lab_l, "a": shade.lab_a, "b": shade.lab_b})
    distance = delta_e
    distance += undertone_distance(undertone, shade.undertone_category) * UNDERTONE_MISMATCH_PENALTY

    if profile.coverage_preference != "uncertain" and shade.coverage != profile.coverage_preference:
        distance += COVERAGE_MISMATCH_PENALTY
    if profile.finish_preference != "uncertain" and shade.finish != profile.finish_preference:
        distance += FINISH_MISMATCH_PENALTY
    # An unknown price is not evidence of being over budget, so it is not
    # penalised -- most of the catalog has no published price.
    if profile.budget_max is not None and shade.price is not None and shade.price > profile.budget_max:
        distance += OVER_BUDGET_PENALTY

    return distance, delta_e


def build_label(rank: int, shade: ShadeProduct, undertone: str, scan_depth: str,
                quality: str = MATCH_QUALITY_CLOSE) -> str:
    if rank == 0:
        # Only claim "best match" when the colour actually is one. Calling a
        # Delta E of 18 the best match is the bug this guards against.
        if quality == MATCH_QUALITY_POOR:
            return "Nearest we have -- not a close match"
        if quality == MATCH_QUALITY_APPROXIMATE:
            return "Closest match -- worth testing first"
        return "Best overall match"

    if undertone in WARMTH_RANK and shade.undertone_category in WARMTH_RANK:
        if WARMTH_RANK[shade.undertone_category] > WARMTH_RANK[undertone]:
            return "Slightly warmer option"
        if WARMTH_RANK[shade.undertone_category] < WARMTH_RANK[undertone]:
            return "Slightly cooler option"
    elif shade.undertone_category != undertone:
        return "Different undertone family"

    if shade.depth_category != scan_depth:
        si, ci = DEPTH_ORDER.index(scan_depth), DEPTH_ORDER.index(shade.depth_category)
        return "Slightly lighter option" if ci < si else "Slightly deeper option"

    return "Close alternative"


def build_reasons(
    shade: ShadeProduct,
    scan_depth: str,
    undertone: str,
    profile: UserProfile,
) -> tuple[list, list]:
    """Returns (bullets, concerns) explaining why this shade was matched and
    where it falls short -- so recommendations are explained, not just
    listed."""
    bullets = []
    concerns = []

    if shade.depth_category == scan_depth:
        bullets.append("Similar depth to your skin profile")
    else:
        si, ci = DEPTH_ORDER.index(scan_depth), DEPTH_ORDER.index(shade.depth_category)
        direction = "lighter" if ci < si else "deeper"
        bullets.append(f"Slightly {direction} than your estimated depth ({_humanize(shade.depth_category)})")

    if shade.undertone_category == undertone:
        bullets.append(f"{_humanize(undertone)} undertone, matching your profile")
    else:
        bullets.append(
            f"{_humanize(shade.undertone_category)} undertone -- slightly different from "
            f"your estimated {_humanize(undertone)}"
        )

    bullets.append(f"{_humanize(shade.finish)} finish")
    bullets.append(f"{_humanize(shade.coverage)} coverage")

    if profile.coverage_preference != "uncertain" and shade.coverage != profile.coverage_preference:
        concerns.append(f"This is {shade.coverage} coverage; you preferred {profile.coverage_preference}")
    if profile.finish_preference != "uncertain" and shade.finish != profile.finish_preference:
        concerns.append(f"This has a {shade.finish} finish; you preferred {profile.finish_preference}")
    if shade.price is None:
        # Say nothing rather than imply a price we don't have. Claiming
        # "within your budget" for an unpriced shade is the same error as
        # printing a fabricated dollar figure.
        concerns.append("Price not listed -- check with the retailer")
    elif profile.budget_max is not None and shade.price > profile.budget_max:
        concerns.append(f"At ${shade.price:.0f}, this is above your ${profile.budget_max:.0f} budget")
    else:
        bullets.append("Within your budget" if profile.budget_max is not None else f"${shade.price:.0f}")
    # Only claim a formulation mismatch when the catalog actually records skin
    # types. The real-data catalog has none (the upstream source doesn't model
    # it), and "" .split(",") is [""], so an unguarded check fired on every
    # shade and rendered as "Formulated primarily for  skin".
    if (
        profile.skin_type != "uncertain"
        and shade.skin_types
        and profile.skin_type not in shade.skin_types.split(",")
    ):
        concerns.append(f"Formulated primarily for {shade.skin_types.replace(',', '/')} skin")

    return bullets, concerns


def find_matches(
    db: Session,
    scan: SkinScan,
    profile: UserProfile,
    category: str = "foundation",
    top_n: int = 5,
) -> list[dict]:
    analysis = json.loads(scan.analysis_json) if scan.analysis_json else {}
    scan_lab = analysis.get("mean_lab")
    if not scan_lab:
        raise ValueError("Scan has no depth analysis yet")

    undertone = scan.user_override_undertone or scan.undertone_category
    if not undertone:
        raise ValueError("Scan has no undertone estimate yet")

    candidates = db.query(ShadeProduct).filter(ShadeProduct.category == category).all()

    scored = [
        (*score_shade(shade, scan_lab, undertone, profile), shade)
        for shade in candidates
    ]
    scored.sort(key=lambda row: row[0])

    results = []
    for rank, (distance, delta_e, shade) in enumerate(scored[:top_n]):
        bullets, concerns = build_reasons(shade, scan.depth_category, undertone, profile)
        quality = classify_match_quality(delta_e)

        if quality == MATCH_QUALITY_POOR:
            concerns.insert(0, (
                "We don't currently carry a shade close to your skin tone -- "
                "this is the nearest we have, and it will read visibly off."
            ))
        elif quality == MATCH_QUALITY_APPROXIMATE:
            concerns.insert(0, "Not an exact colour match -- test in daylight before buying.")

        results.append({
            "shade_id": shade.id,
            "brand": shade.brand,
            "product_line": shade.product_line,
            "shade_name": shade.shade_name,
            "category": shade.category,
            "label": build_label(rank, shade, undertone, scan.depth_category, quality),
            "match_quality": quality,
            "delta_e": round(delta_e, 2),
            "match_score": round(distance, 2),
            "depth_category": shade.depth_category,
            "undertone_category": shade.undertone_category,
            # The shade's actual colour, for display. Rendered from the same
            # LAB the matcher scored, so the swatch cannot disagree with the
            # match it is illustrating.
            "swatch_hex": lab_to_hex(shade.lab_l, shade.lab_a, shade.lab_b),
            "finish": shade.finish,
            "coverage": shade.coverage,
            "price": shade.price,
            "currency": shade.currency,
            "source_url": shade.source_url,
            "search_url": build_search_url(shade.brand, shade.product_line, shade.shade_name),
            "bullets": bullets,
            "concerns": concerns,
        })
    return results
