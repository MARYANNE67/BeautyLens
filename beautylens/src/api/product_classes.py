"""
Product class definitions and utilities for makeup product detection.
"""
from enum import Enum
from typing import Optional


class ProductClass(str, Enum):
    """Enumeration of all makeup product classes that can be detected."""
    BEAUTY_BLENDER = "beauty blender"
    BLUSH = "blush"
    BRONZER = "bronzer"
    BRUSH = "brush"
    CONCEALER = "concealer"
    EYE_LINER = "eye liner"
    EYE_SHADOW = "eye shadow"
    EYELASH_CURLER = "eyelash curler"
    FOUNDATION = "foundation"
    HIGHLIGHTER = "highlighter"
    LIP_BALM = "lip balm"
    LIP_GLOSS = "lip gloss"
    LIP_LINER = "lip liner"
    LIP_STICK = "lip stick"
    MASCARA = "mascara"
    NAIL_POLISH = "nail polish"
    POWDER = "powder"
    PRIMER = "primer"
    SETTING_SPRAY = "setting spray"

    @classmethod
    def get_all_classes(cls) -> list[str]:
        """Get all product class names as a list."""
        return [item.value for item in cls]

    @classmethod
    def get_class_count(cls) -> int:
        """Get the total number of product classes."""
        return len(cls)


def normalize_class_name(class_name: str) -> Optional[ProductClass]:
    """
    Convert model output string to ProductClass enum.
    
    Handles variations in naming:
    - Case insensitive
    - Handles spaces, hyphens, underscores
    - Normalizes common variations
    
    Args:
        class_name: Raw class name from model (e.g., "eye liner", "Eye Liner", "eye_liner")
    
    Returns:
        ProductClass enum value if found, None otherwise
    
    Examples:
        >>> normalize_class_name("eye liner")
        <ProductClass.EYE_LINER: 'eye liner'>
        >>> normalize_class_name("Lip Stick")
        <ProductClass.LIP_STICK: 'lip stick'>
        >>> normalize_class_name("eyelash_curler")
        <ProductClass.EYELASH_CURLER: 'eyelash curler'>
    """
    if not class_name:
        return None
    
    # Normalize: lowercase, strip whitespace
    normalized = class_name.lower().strip()
    
    # Replace common separators with spaces
    normalized = normalized.replace("_", " ").replace("-", " ")
    # Collapse multiple spaces
    normalized = " ".join(normalized.split())
    
    # Try direct match first
    try:
        return ProductClass(normalized)
    except ValueError:
        pass
    
    # Handle common variations
    variations = {
        "eyeliner": ProductClass.EYE_LINER,
        "eye-liner": ProductClass.EYE_LINER,
        "eyeliner": ProductClass.EYE_LINER,
        "eyeshadow": ProductClass.EYE_SHADOW,
        "eye-shadow": ProductClass.EYE_SHADOW,
        "lipstick": ProductClass.LIP_STICK,
        "lip-stick": ProductClass.LIP_STICK,
        "lipliner": ProductClass.LIP_LINER,
        "lip-liner": ProductClass.LIP_LINER,
        "lipgloss": ProductClass.LIP_GLOSS,
        "lip-gloss": ProductClass.LIP_GLOSS,
        "lipbalm": ProductClass.LIP_BALM,
        "lip-balm": ProductClass.LIP_BALM,
        "nailpolish": ProductClass.NAIL_POLISH,
        "nail-polish": ProductClass.NAIL_POLISH,
        "setting spray": ProductClass.SETTING_SPRAY,
        "settingspray": ProductClass.SETTING_SPRAY,
        "beautyblender": ProductClass.BEAUTY_BLENDER,
        "beauty-blender": ProductClass.BEAUTY_BLENDER,
        "eyelashcurler": ProductClass.EYELASH_CURLER,
        "eyelash-curler": ProductClass.EYELASH_CURLER,
    }
    
    return variations.get(normalized)


def get_display_name(product_class: ProductClass) -> str:
    """
    Get a human-readable display name for a product class.
    
    Args:
        product_class: ProductClass enum value
    
    Returns:
        Formatted display name (e.g., "Eye Liner" instead of "eye liner")
    """
    return product_class.value.title()


def is_valid_class(class_name: str) -> bool:
    """
    Check if a class name string is a valid product class.
    
    Args:
        class_name: Class name to validate
    
    Returns:
        True if valid, False otherwise
    """
    return normalize_class_name(class_name) is not None

