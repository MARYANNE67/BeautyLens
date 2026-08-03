"""
Measures how well the shade matcher actually performs, per depth band.

Why this exists: "the matching got better" is unfalsifiable without a number.
This runs a fixed set of synthetic scans spanning the full range of human skin
lightness through the real matching pipeline and reports the Delta E of the
best match for each. Run it before and after any change to matching.py,
skin_analysis.py, undertone.py or the seed catalog.

The headline metric is WORST-BAND Delta E, not the mean. A mean hides exactly
the failure this project has: excellent matches for fair skin averaging away
unusable ones for deep skin.

Usage:  python data/evaluate_matching.py
Exit code is 1 if any band regresses past DELTA_E_APPROXIMATE, so this can
gate CI once the catalog is real.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.api.db import SessionLocal  # noqa: E402
from src.api.matching import (  # noqa: E402
    DELTA_E_APPROXIMATE,
    DELTA_E_CLOSE,
    classify_match_quality,
    find_matches,
)
from src.api.models_db import SkinScan, UserProfile  # noqa: E402
from src.api.skin_analysis import classify_depth  # noqa: E402
from src.api.undertone import estimate_undertone  # noqa: E402

# Representative mean facial CIELAB across the human range. b* (yellow) rises
# with melanin, so these are not just L* steps -- using a fixed a*/b* would
# understate how far deep skin sits from the catalog's colour assumptions.
TEST_SKINS = [
    ("very fair",   {"l": 80.0, "a": 6.0,  "b": 13.0}),
    ("fair",        {"l": 74.0, "a": 8.0,  "b": 15.0}),
    ("light",       {"l": 68.0, "a": 10.0, "b": 17.0}),
    ("light-med",   {"l": 62.0, "a": 11.0, "b": 18.0}),
    ("medium",      {"l": 56.0, "a": 12.0, "b": 20.0}),
    ("medium-deep", {"l": 49.0, "a": 13.0, "b": 21.0}),
    ("deep",        {"l": 42.0, "a": 14.0, "b": 22.0}),
    ("rich-deep",   {"l": 34.0, "a": 13.0, "b": 21.0}),
    ("very deep",   {"l": 26.0, "a": 12.0, "b": 19.0}),
]

CATEGORIES = ("foundation", "concealer")


def evaluate() -> int:
    db = SessionLocal()
    # Neutral profile: no preference penalties, so we measure colour matching
    # rather than how well the catalog happens to fit one person's taste.
    profile = UserProfile(
        id=-1, skin_type="uncertain", coverage_preference="uncertain",
        finish_preference="uncertain", budget_max=None,
    )

    worst = 0.0
    failures = []
    rows = []

    for label, lab in TEST_SKINS:
        depth = classify_depth(lab["l"])
        undertone = estimate_undertone(
            mean_a=lab["a"], mean_b=lab["b"],
            foundation_problem="uncertain",
            jewelry_preference="uncertain",
            vein_color="uncertain",
            depth_category=depth,
        )
        scan = SkinScan(
            id=-1, profile_id=-1, quality_passed=True,
            depth_category=depth, undertone_category=undertone["category"],
            analysis_json=json.dumps({"mean_lab": lab}),
        )

        for category in CATEGORIES:
            matches = find_matches(db, scan, profile, category=category, top_n=1)
            if not matches:
                failures.append(f"{label}/{category}: no matches at all")
                continue

            best = matches[0]
            de = best["delta_e"]
            worst = max(worst, de)
            if de > DELTA_E_APPROXIMATE:
                failures.append(f"{label}/{category}: dE {de}")

            rows.append((
                label, category, depth, undertone["category"],
                undertone["confidence"], de, best["match_quality"],
                f'{best["brand"]} {best["shade_name"]}',
            ))

    db.close()

    print(f'{"skin":<12} {"cat":<11} {"depth":<12} {"undertone":<10} '
          f'{"conf":>5} {"dE":>6}  {"quality":<12} best match')
    print("-" * 100)
    for label, category, depth, ut, conf, de, quality, name in rows:
        flag = "  <-- unusable" if de > DELTA_E_APPROXIMATE else ""
        print(f"{label:<12} {category:<11} {depth:<12} {ut:<10} "
              f"{conf:>4}% {de:>6.1f}  {quality:<12} {name}{flag}")

    print()
    print(f"worst-band Delta E : {worst:.1f}   "
          f"(close <= {DELTA_E_CLOSE}, approximate <= {DELTA_E_APPROXIMATE})")
    print(f"overall quality    : {classify_match_quality(worst)}")

    if failures:
        print(f"\n{len(failures)} band(s) beyond usable:")
        for f in failures:
            print(f"  - {f}")
        return 1

    print("\nAll depth bands within usable range.")
    return 0


if __name__ == "__main__":
    raise SystemExit(evaluate())
