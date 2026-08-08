"""
Unit tests for the column-scan logic in src.api.hair_segmentation:
find_hairline_points (pure function, no model loading needed).
"""
import numpy as np

from src.api.hair_segmentation import (
    find_hairline_points,
    FACE_SKIN_CLASS_INDEX,
    MIN_CONSECUTIVE_SKIN_ROWS,
)

WIDTH = 20
HEIGHT = 60  # tall enough to fit a real run comfortably above MIN_CONSECUTIVE_SKIN_ROWS


def make_mask(skin_rows_by_column: dict) -> np.ndarray:
    """All background (0) except FACE_SKIN_CLASS_INDEX rows at the given columns."""
    mask = np.zeros((HEIGHT, WIDTH), dtype=np.uint8)
    for x, rows in skin_rows_by_column.items():
        for y in rows:
            mask[y, x] = FACE_SKIN_CLASS_INDEX
    return mask


def sustained_run(start: int, length: int = MIN_CONSECUTIVE_SKIN_ROWS + 5) -> list:
    return list(range(start, start + length))


def test_finds_top_of_first_sustained_skin_run_per_column():
    mask = make_mask({5: sustained_run(10), 15: sustained_run(3)})
    points = find_hairline_points(mask, x_pixels=[5, 15])
    assert points == [{'x': 5.0, 'y': 10.0}, {'x': 15.0, 'y': 3.0}]


def test_returns_none_for_column_with_no_face_skin():
    mask = make_mask({5: sustained_run(10)})
    points = find_hairline_points(mask, x_pixels=[5, 8])
    assert points[0] == {'x': 5.0, 'y': 10.0}
    assert points[1] is None


def test_all_columns_empty_returns_all_none():
    mask = make_mask({})
    points = find_hairline_points(mask, x_pixels=[0, 5, 10])
    assert points == [None, None, None]


def test_preserves_input_order_and_count():
    mask = make_mask({2: sustained_run(1), 7: sustained_run(2), 12: sustained_run(3)})
    points = find_hairline_points(mask, x_pixels=[12, 2, 7])
    assert [p['x'] if p else None for p in points] == [12.0, 2.0, 7.0]
    assert [p['y'] if p else None for p in points] == [3.0, 1.0, 2.0]


def test_clamps_out_of_range_x_but_echoes_original_x():
    mask = make_mask({WIDTH - 1: sustained_run(4)})
    points = find_hairline_points(mask, x_pixels=[WIDTH + 50, -20])
    # Clamped to the last/first column for the lookup, but the *original*
    # requested x is echoed back so the caller can still correlate it.
    assert points[0] == {'x': float(WIDTH + 50), 'y': 4.0}
    assert points[1] is None  # column 0 has no face-skin in this fixture


def test_ignores_hair_pixels_above_the_face_skin_boundary():
    """A column with hair (class 1) above a sustained face-skin run (class 3)
    -- as a real forehead column would have -- should report the face-skin
    boundary, not anything about the hair region above it."""
    mask = np.zeros((HEIGHT, WIDTH), dtype=np.uint8)
    x = 5
    mask[0:8, x] = 1  # hair from the top of the image down to row 7
    mask[8:HEIGHT, x] = 3  # face-skin starts at row 8, sustained to the bottom
    points = find_hairline_points(mask, x_pixels=[x])
    assert points == [{'x': 5.0, 'y': 8.0}]


def test_rejects_a_single_noise_pixel_deep_inside_a_hair_region():
    """A lone misclassified face-skin pixel surrounded by hair (the exact
    failure mode this MIN_CONSECUTIVE_SKIN_ROWS check exists to reject --
    confirmed against a real device capture where the boundary landed
    visibly inside the hair) must not be reported as the hairline; the
    real, sustained boundary further down should be found instead."""
    mask = np.zeros((HEIGHT, WIDTH), dtype=np.uint8)
    x = 5
    mask[:, x] = 1  # hair everywhere in this column by default
    mask[3, x] = 3  # single noise pixel, deep inside the hair region
    mask[30:HEIGHT, x] = 3  # the real, sustained hairline boundary

    points = find_hairline_points(mask, x_pixels=[x])
    assert points == [{'x': 5.0, 'y': 30.0}]


def test_rejects_a_short_run_shorter_than_the_minimum():
    """A run just below the minimum length is still noise, not a boundary."""
    mask = np.zeros((HEIGHT, WIDTH), dtype=np.uint8)
    x = 5
    short_len = MIN_CONSECUTIVE_SKIN_ROWS - 1
    mask[10:10 + short_len, x] = 3  # too short to count
    mask[30:HEIGHT, x] = 3  # the real boundary

    points = find_hairline_points(mask, x_pixels=[x])
    assert points == [{'x': 5.0, 'y': 30.0}]
