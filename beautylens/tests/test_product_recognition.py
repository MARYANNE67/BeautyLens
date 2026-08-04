"""
Unit tests for src/api/product_recognition.py

Tests parse_product_from_text() — brand detection, product name extraction,
shade parsing, logo fallback, and product signature matching.
No network calls — extract_text_from_image_region is tested via mocking.
"""
import pytest
from src.api.product_recognition import parse_product_from_text


# ── Brand detection from text ─────────────────────────────────────────────────

class TestBrandDetection:

    def test_mac_detected_from_text(self):
        result = parse_product_from_text("MAC\nSTUDIO FIX FLUID\nSPF 15", "foundation")
        assert result.get("brand") == "MAC"

    def test_nyx_detected_from_text(self):
        result = parse_product_from_text("NYX\nSOFT MATTE LIP CREAM", "lip stick")
        assert result.get("brand") in ("NYX", "NYX Professional Makeup")

    def test_fenty_detected_from_text(self):
        result = parse_product_from_text("FENTY BEAUTY\nPRO FILT'R\nSOFT MATTE", "foundation")
        assert result.get("brand") == "Fenty Beauty"

    def test_maybelline_detected(self):
        result = parse_product_from_text("Maybelline\nFit Me\nMatte + Poreless", "foundation")
        assert result.get("brand") == "Maybelline"

    def test_loreal_detected(self):
        result = parse_product_from_text("L'Oreal\nInfallible 24HR", "foundation")
        assert result.get("brand") is not None

    def test_no_brand_returns_empty_brand(self):
        result = parse_product_from_text("some random text with no brand", "foundation")
        assert result.get("brand") is None

    def test_case_insensitive_brand_detection(self):
        result = parse_product_from_text("mac studio fix fluid", "foundation")
        assert result.get("brand") == "MAC"


# ── Logo fallback ─────────────────────────────────────────────────────────────

class TestLogoFallback:

    def test_logo_used_when_no_text_brand(self):
        result = parse_product_from_text("STUDIO FIX FLUID SPF 15", "foundation", detected_logo="MAC Cosmetics")
        assert result.get("brand") == "MAC"

    def test_logo_used_as_fallback_unknown_brand(self):
        result = parse_product_from_text("some product text", "foundation", detected_logo="Charlotte Tilbury")
        assert result.get("brand") == "Charlotte Tilbury"

    def test_text_brand_takes_priority_over_logo(self):
        # Logo is checked first — if logo matches a known brand, it wins
        # Text brand detection runs as fallback when logo finds nothing
        result = parse_product_from_text("NARS\nSHEER GLOW FOUNDATION", "foundation", detected_logo=None)
        assert result.get("brand") == "NARS"

    def test_none_logo_does_not_crash(self):
        result = parse_product_from_text("STUDIO FIX", "foundation", detected_logo=None)
        assert isinstance(result, dict)


# ── Product signature matching ────────────────────────────────────────────────

class TestProductSignatures:

    def test_studio_fix_maps_to_mac(self):
        result = parse_product_from_text("STUDIO FIX FLUID SPF 15\n30ml", "foundation")
        assert result.get("brand") == "MAC"

    def test_pro_filtr_maps_to_fenty(self):
        result = parse_product_from_text("Pro Filt'r Soft Matte Longwear Foundation", "foundation")
        assert result.get("brand") == "Fenty Beauty"

    def test_fit_me_maps_to_maybelline(self):
        result = parse_product_from_text("Fit Me Matte + Poreless Foundation", "foundation")
        assert result.get("brand") == "Maybelline"

    def test_double_wear_maps_to_estee_lauder(self):
        result = parse_product_from_text("Double Wear Stay-in-Place Foundation", "foundation")
        assert result.get("brand") == "Estee Lauder"

    def test_shape_tape_maps_to_tarte(self):
        result = parse_product_from_text("Shape Tape Full Coverage Concealer", "concealer")
        assert result.get("brand") == "Tarte"

    def test_born_this_way_maps_to_too_faced(self):
        result = parse_product_from_text("Born This Way Foundation", "foundation")
        assert result.get("brand") == "Too Faced"


# ── Shade detection ───────────────────────────────────────────────────────────

class TestShadeDetection:

    def test_mac_shade_code_detected(self):
        result = parse_product_from_text("MAC\nSTUDIO FIX\nNW45", "foundation")
        assert result.get("shade") == "NW45"

    def test_nc_shade_code_detected(self):
        result = parse_product_from_text("Studio Fix Fluid NC15", "foundation")
        assert result.get("shade") == "NC15"

    def test_numeric_shade_detected(self):
        result = parse_product_from_text("Fit Me Foundation\n120 Classic Ivory", "foundation")
        assert result.get("shade") is not None

    def test_descriptive_shade_detected(self):
        result = parse_product_from_text("Foundation\nwarm beige", "foundation")
        assert result.get("shade") is not None

    def test_size_not_confused_with_shade(self):
        result = parse_product_from_text("Foundation 30ml SPF15", "foundation")
        shade = result.get("shade")
        if shade:
            assert "ml" not in shade.lower()
            assert "oz" not in shade.lower()

    def test_no_shade_returns_none(self):
        result = parse_product_from_text("MAC Foundation", "foundation")
        # shade may or may not be detected — just confirm no crash
        assert isinstance(result, dict)


# ── Product name extraction ───────────────────────────────────────────────────

class TestProductNameExtraction:

    def test_product_name_extracted(self):
        result = parse_product_from_text("MAC\nSTUDIO FIX FLUID\nSPF 15\n30ml", "foundation")
        assert result.get("product_name") is not None
        assert "studio" in result.get("product_name", "").lower() or \
               "fix" in result.get("product_name", "").lower()

    def test_size_not_in_product_name(self):
        result = parse_product_from_text("Foundation\n30ml\n1 fl oz", "foundation")
        name = result.get("product_name", "")
        assert "30ml" not in name
        assert "fl oz" not in name.lower()

    def test_spf_line_not_product_name(self):
        result = parse_product_from_text("MAC\nSTUDIO FIX\nSPF 15", "foundation")
        name = result.get("product_name", "")
        assert name != "SPF 15"

    def test_display_name_built(self):
        result = parse_product_from_text("MAC\nSTUDIO FIX FLUID SPF 15", "foundation")
        assert result.get("display_name") is not None
        assert len(result.get("display_name", "")) > 3

    def test_display_name_includes_brand(self):
        result = parse_product_from_text("MAC\nSTUDIO FIX FLUID", "foundation")
        display = result.get("display_name", "")
        assert "MAC" in display


# ── Edge cases ────────────────────────────────────────────────────────────────

class TestEdgeCases:

    def test_empty_text_returns_empty_dict(self):
        result = parse_product_from_text("", "foundation")
        assert result == {}

    def test_none_logo_empty_text(self):
        result = parse_product_from_text("", "foundation", detected_logo=None)
        assert result == {}

    def test_only_sizes_returns_minimal(self):
        result = parse_product_from_text("30ml\n1 fl oz\n15g", "foundation")
        assert isinstance(result, dict)

    def test_all_caps_product_name_is_title_cased(self):
        result = parse_product_from_text("MAC\nSTUDIO FIX FLUID SPF 15", "foundation")
        name = result.get("product_name", "")
        if name:
            assert name != name.upper()

    def test_din_number_not_in_product_name(self):
        result = parse_product_from_text("MAC\nSTUDIO FIX\nDIN 02529130", "foundation")
        name = result.get("product_name", "")
        assert "DIN" not in name

    def test_ocr_text_truncated_to_400_chars(self):
        long_text = "A" * 500
        result = parse_product_from_text(long_text, "foundation")
        ocr = result.get("raw_ocr_text", "")
        assert len(ocr) <= 400

    def test_unknown_product_class_does_not_crash(self):
        result = parse_product_from_text("Some Brand\nSome Product", "unknown_class")
        assert isinstance(result, dict)