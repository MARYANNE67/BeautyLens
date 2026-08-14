"""
Unit tests for product_classes.py
Tests the normalize_class_name(), get_display_name(), and is_valid_class() helpers.
"""

import pytest
from src.api.product_classes import (
    ProductClass,
    normalize_class_name,
    get_display_name,
    is_valid_class,
)


# ════════════════════════════════════════════════════════════════════════════
# normalize_class_name()
# ════════════════════════════════════════════════════════════════════════════

class TestNormalizeClassName:

    # ── exact matches ────────────────────────────────────────────────────────
    @pytest.mark.parametrize("raw,expected", [
        ("lip stick",       ProductClass.LIP_STICK),
        ("eye liner",       ProductClass.EYE_LINER),
        ("eye shadow",      ProductClass.EYE_SHADOW),
        ("beauty blender",  ProductClass.BEAUTY_BLENDER),
        ("eyelash curler",  ProductClass.EYELASH_CURLER),
        ("setting spray",   ProductClass.SETTING_SPRAY),
        ("foundation",      ProductClass.FOUNDATION),
        ("concealer",       ProductClass.CONCEALER),
        ("mascara",         ProductClass.MASCARA),
        ("blush",           ProductClass.BLUSH),
        ("bronzer",         ProductClass.BRONZER),
        ("highlighter",     ProductClass.HIGHLIGHTER),
        ("primer",          ProductClass.PRIMER),
        ("powder",          ProductClass.POWDER),
        ("nail polish",     ProductClass.NAIL_POLISH),
        ("lip balm",        ProductClass.LIP_BALM),
        ("lip gloss",       ProductClass.LIP_GLOSS),
        ("lip liner",       ProductClass.LIP_LINER),
        ("brush",           ProductClass.BRUSH),
    ])
    def test_exact_match(self, raw, expected):
        assert normalize_class_name(raw) == expected

    # ── case insensitive ─────────────────────────────────────────────────────
    @pytest.mark.parametrize("raw", [
        "Lip Stick", "LIP STICK", "LiP sTiCk", "EYE LINER", "Eye Shadow",
    ])
    def test_case_insensitive(self, raw):
        assert normalize_class_name(raw) is not None

    # ── underscore + hyphen separators ───────────────────────────────────────
    @pytest.mark.parametrize("raw,expected", [
        ("eye_liner",       ProductClass.EYE_LINER),
        ("eye-liner",       ProductClass.EYE_LINER),
        ("lip_stick",       ProductClass.LIP_STICK),
        ("lip-stick",       ProductClass.LIP_STICK),
        ("nail_polish",     ProductClass.NAIL_POLISH),
        ("nail-polish",     ProductClass.NAIL_POLISH),
        ("beauty_blender",  ProductClass.BEAUTY_BLENDER),
        ("beauty-blender",  ProductClass.BEAUTY_BLENDER),
        ("eyelash_curler",  ProductClass.EYELASH_CURLER),
        ("eyelash-curler",  ProductClass.EYELASH_CURLER),
        ("setting_spray",   ProductClass.SETTING_SPRAY),
    ])
    def test_separator_variants(self, raw, expected):
        assert normalize_class_name(raw) == expected

    # ── concatenated variations ──────────────────────────────────────────────
    @pytest.mark.parametrize("raw,expected", [
        ("eyeliner",    ProductClass.EYE_LINER),
        ("eyeshadow",   ProductClass.EYE_SHADOW),
        ("lipstick",    ProductClass.LIP_STICK),
        ("lipliner",    ProductClass.LIP_LINER),
        ("lipgloss",    ProductClass.LIP_GLOSS),
        ("lipbalm",     ProductClass.LIP_BALM),
        ("nailpolish",  ProductClass.NAIL_POLISH),
    ])
    def test_concatenated_variants(self, raw, expected):
        assert normalize_class_name(raw) == expected

    # ── invalid / unknown ────────────────────────────────────────────────────
    @pytest.mark.parametrize("raw", [
        "unknown product", "shampoo", "perfume", "lotion", "",
    ])
    def test_unknown_returns_none(self, raw):
        assert normalize_class_name(raw) is None

    def test_none_like_empty_string(self):
        assert normalize_class_name("") is None

    def test_whitespace_stripped(self):
        assert normalize_class_name("  lip stick  ") == ProductClass.LIP_STICK


# ════════════════════════════════════════════════════════════════════════════
# get_display_name()
# ════════════════════════════════════════════════════════════════════════════

class TestGetDisplayName:

    def test_returns_title_case(self):
        assert get_display_name(ProductClass.LIP_STICK) == "Lip Stick"
        assert get_display_name(ProductClass.EYE_LINER) == "Eye Liner"
        assert get_display_name(ProductClass.BEAUTY_BLENDER) == "Beauty Blender"

    def test_all_classes_have_display_name(self):
        for cls in ProductClass:
            name = get_display_name(cls)
            assert isinstance(name, str) and len(name) > 0


# ════════════════════════════════════════════════════════════════════════════
# is_valid_class()
# ════════════════════════════════════════════════════════════════════════════

class TestIsValidClass:

    def test_valid_classes_return_true(self):
        assert is_valid_class("lip stick") is True
        assert is_valid_class("foundation") is True
        assert is_valid_class("eyeliner") is True

    def test_invalid_class_returns_false(self):
        assert is_valid_class("shampoo") is False
        assert is_valid_class("") is False

    def test_all_19_classes_valid(self):
        for cls in ProductClass:
            assert is_valid_class(cls.value) is True


# ════════════════════════════════════════════════════════════════════════════
# ProductClass enum
# ════════════════════════════════════════════════════════════════════════════

class TestProductClassEnum:

    def test_class_count_is_19(self):
        assert ProductClass.get_class_count() == 19

    def test_get_all_classes_returns_list_of_19(self):
        all_classes = ProductClass.get_all_classes()
        assert len(all_classes) == 19

    def test_all_classes_are_strings(self):
        for cls in ProductClass.get_all_classes():
            assert isinstance(cls, str)