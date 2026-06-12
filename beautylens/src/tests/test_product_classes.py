"""
Unit tests for src/api/product_classes.py

Tests:
- normalize_class_name() — all 19 classes, case variations, separators, edge cases
- get_display_name() — title casing
- is_valid_class() — valid and invalid inputs
- ProductClass.get_all_classes() — count and content
- ProductClass.get_class_count() — returns 19
"""
import pytest
from src.api.product_classes import (
    ProductClass,
    normalize_class_name,
    get_display_name,
    is_valid_class,
)


# ── normalize_class_name ─────────────────────────────────────────────────────

class TestNormalizeClassName:

    def test_all_19_classes_exact_match(self):
        """Every ProductClass enum value should normalize to itself."""
        for product_class in ProductClass:
            result = normalize_class_name(product_class.value)
            assert result == product_class, (
                f"Expected {product_class} for input '{product_class.value}', got {result}"
            )

    def test_uppercase_input(self):
        assert normalize_class_name("EYE LINER") == ProductClass.EYE_LINER
        assert normalize_class_name("LIP STICK") == ProductClass.LIP_STICK
        assert normalize_class_name("FOUNDATION") == ProductClass.FOUNDATION

    def test_title_case_input(self):
        assert normalize_class_name("Eye Liner") == ProductClass.EYE_LINER
        assert normalize_class_name("Lip Stick") == ProductClass.LIP_STICK
        assert normalize_class_name("Beauty Blender") == ProductClass.BEAUTY_BLENDER
        assert normalize_class_name("Eyelash Curler") == ProductClass.EYELASH_CURLER
        assert normalize_class_name("Setting Spray") == ProductClass.SETTING_SPRAY

    def test_underscore_separator(self):
        assert normalize_class_name("eye_liner") == ProductClass.EYE_LINER
        assert normalize_class_name("lip_stick") == ProductClass.LIP_STICK
        assert normalize_class_name("nail_polish") == ProductClass.NAIL_POLISH
        assert normalize_class_name("eyelash_curler") == ProductClass.EYELASH_CURLER
        assert normalize_class_name("beauty_blender") == ProductClass.BEAUTY_BLENDER
        assert normalize_class_name("setting_spray") == ProductClass.SETTING_SPRAY

    def test_hyphen_separator(self):
        assert normalize_class_name("eye-liner") == ProductClass.EYE_LINER
        assert normalize_class_name("lip-stick") == ProductClass.LIP_STICK
        assert normalize_class_name("lip-gloss") == ProductClass.LIP_GLOSS
        assert normalize_class_name("lip-balm") == ProductClass.LIP_BALM
        assert normalize_class_name("lip-liner") == ProductClass.LIP_LINER

    def test_concatenated_variations(self):
        assert normalize_class_name("eyeliner") == ProductClass.EYE_LINER
        assert normalize_class_name("eyeshadow") == ProductClass.EYE_SHADOW
        assert normalize_class_name("lipstick") == ProductClass.LIP_STICK
        assert normalize_class_name("lipgloss") == ProductClass.LIP_GLOSS
        assert normalize_class_name("lipbalm") == ProductClass.LIP_BALM
        assert normalize_class_name("lipliner") == ProductClass.LIP_LINER
        assert normalize_class_name("nailpolish") == ProductClass.NAIL_POLISH
        assert normalize_class_name("settingspray") == ProductClass.SETTING_SPRAY
        assert normalize_class_name("beautyblender") == ProductClass.BEAUTY_BLENDER
        assert normalize_class_name("eyelashcurler") == ProductClass.EYELASH_CURLER

    def test_leading_trailing_whitespace(self):
        assert normalize_class_name("  lip stick  ") == ProductClass.LIP_STICK
        assert normalize_class_name("\tfoundation\n") == ProductClass.FOUNDATION

    def test_extra_internal_spaces(self):
        assert normalize_class_name("eye  liner") == ProductClass.EYE_LINER
        assert normalize_class_name("lip  stick") == ProductClass.LIP_STICK

    def test_unknown_input_returns_none(self):
        assert normalize_class_name("toothbrush") is None
        assert normalize_class_name("unknown_product") is None
        assert normalize_class_name("shoe") is None
        assert normalize_class_name("xyz123") is None

    def test_empty_string_returns_none(self):
        assert normalize_class_name("") is None

    def test_none_input_returns_none(self):
        assert normalize_class_name(None) is None

    def test_whitespace_only_returns_none(self):
        assert normalize_class_name("   ") is None

    def test_all_lip_products(self):
        assert normalize_class_name("lip stick") == ProductClass.LIP_STICK
        assert normalize_class_name("lip gloss") == ProductClass.LIP_GLOSS
        assert normalize_class_name("lip liner") == ProductClass.LIP_LINER
        assert normalize_class_name("lip balm") == ProductClass.LIP_BALM

    def test_all_eye_products(self):
        assert normalize_class_name("eye liner") == ProductClass.EYE_LINER
        assert normalize_class_name("eye shadow") == ProductClass.EYE_SHADOW
        assert normalize_class_name("mascara") == ProductClass.MASCARA
        assert normalize_class_name("eyelash curler") == ProductClass.EYELASH_CURLER

    def test_all_face_products(self):
        assert normalize_class_name("foundation") == ProductClass.FOUNDATION
        assert normalize_class_name("powder") == ProductClass.POWDER
        assert normalize_class_name("primer") == ProductClass.PRIMER
        assert normalize_class_name("blush") == ProductClass.BLUSH
        assert normalize_class_name("bronzer") == ProductClass.BRONZER
        assert normalize_class_name("highlighter") == ProductClass.HIGHLIGHTER
        assert normalize_class_name("concealer") == ProductClass.CONCEALER


# ── get_display_name ─────────────────────────────────────────────────────────

class TestGetDisplayName:

    def test_eye_liner_display(self):
        assert get_display_name(ProductClass.EYE_LINER) == "Eye Liner"

    def test_lip_stick_display(self):
        assert get_display_name(ProductClass.LIP_STICK) == "Lip Stick"

    def test_foundation_display(self):
        assert get_display_name(ProductClass.FOUNDATION) == "Foundation"

    def test_beauty_blender_display(self):
        assert get_display_name(ProductClass.BEAUTY_BLENDER) == "Beauty Blender"

    def test_eyelash_curler_display(self):
        assert get_display_name(ProductClass.EYELASH_CURLER) == "Eyelash Curler"

    def test_setting_spray_display(self):
        assert get_display_name(ProductClass.SETTING_SPRAY) == "Setting Spray"

    def test_all_display_names_are_title_case(self):
        for product_class in ProductClass:
            display = get_display_name(product_class)
            assert display == display.title(), (
                f"Display name '{display}' for {product_class} is not title case"
            )


# ── is_valid_class ────────────────────────────────────────────────────────────

class TestIsValidClass:

    def test_valid_exact_classes(self):
        assert is_valid_class("lip stick") is True
        assert is_valid_class("foundation") is True
        assert is_valid_class("mascara") is True

    def test_valid_case_variations(self):
        assert is_valid_class("Lip Stick") is True
        assert is_valid_class("FOUNDATION") is True
        assert is_valid_class("eye_liner") is True

    def test_invalid_classes(self):
        assert is_valid_class("toothbrush") is False
        assert is_valid_class("unknown") is False
        assert is_valid_class("") is False

    def test_none_is_invalid(self):
        assert is_valid_class(None) is False


# ── ProductClass enum ─────────────────────────────────────────────────────────

class TestProductClassEnum:

    def test_get_class_count_returns_19(self):
        assert ProductClass.get_class_count() == 19

    def test_get_all_classes_returns_list_of_19(self):
        classes = ProductClass.get_all_classes()
        assert isinstance(classes, list)
        assert len(classes) == 19

    def test_get_all_classes_contains_expected_values(self):
        classes = ProductClass.get_all_classes()
        assert "lip stick" in classes
        assert "foundation" in classes
        assert "mascara" in classes
        assert "eye liner" in classes
        assert "setting spray" in classes
        assert "beauty blender" in classes

    def test_get_all_classes_no_duplicates(self):
        classes = ProductClass.get_all_classes()
        assert len(classes) == len(set(classes))

    def test_enum_values_are_lowercase(self):
        for product_class in ProductClass:
            assert product_class.value == product_class.value.lower(), (
                f"Enum value '{product_class.value}' is not lowercase"
            )
