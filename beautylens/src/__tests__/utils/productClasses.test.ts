/**
 * Unit tests for src/utils/productClasses.ts — the frontend twin of the
 * backend's product_classes.py (which has its own 57-test suite). Same
 * equivalence partitions: exact matches for all 19 classes, separator and
 * case variants, concatenated aliases, and invalid input.
 */
import {
  ProductClass,
  getAllClasses,
  getClassCount,
  getDisplayName,
  isValidClass,
  normalizeClassName,
  supportsVirtualTryOn,
  NO_VIRTUAL_TRYON_PRODUCTS,
} from '../../utils/productClasses';

describe('class inventory', () => {
  it('defines exactly 19 classes', () => {
    expect(getClassCount()).toBe(19);
    expect(getAllClasses()).toHaveLength(19);
  });

  it('has no duplicate class names', () => {
    expect(new Set(getAllClasses()).size).toBe(19);
  });
});

describe('normalizeClassName', () => {
  it.each(getAllClasses())('accepts the exact class name %j', (name) => {
    expect(normalizeClassName(name)).toBe(name);
  });

  it.each([
    ['LIP STICK', ProductClass.LIP_STICK],
    ['LiP sTiCk', ProductClass.LIP_STICK],
    ['Eye Liner', ProductClass.EYE_LINER],
  ])('is case-insensitive: %j', (input, expected) => {
    expect(normalizeClassName(input)).toBe(expected);
  });

  it.each([
    ['eye_liner', ProductClass.EYE_LINER],
    ['eye-liner', ProductClass.EYE_LINER],
    ['lip_gloss', ProductClass.LIP_GLOSS],
    ['nail-polish', ProductClass.NAIL_POLISH],
    ['setting_spray', ProductClass.SETTING_SPRAY],
  ])('normalises separator variants: %j', (input, expected) => {
    expect(normalizeClassName(input)).toBe(expected);
  });

  it.each([
    ['eyeliner', ProductClass.EYE_LINER],
    ['eyeshadow', ProductClass.EYE_SHADOW],
    ['lipstick', ProductClass.LIP_STICK],
    ['lipliner', ProductClass.LIP_LINER],
    ['lipgloss', ProductClass.LIP_GLOSS],
    ['lipbalm', ProductClass.LIP_BALM],
    ['nailpolish', ProductClass.NAIL_POLISH],
    ['settingspray', ProductClass.SETTING_SPRAY],
    ['beautyblender', ProductClass.BEAUTY_BLENDER],
    ['eyelashcurler', ProductClass.EYELASH_CURLER],
  ])('resolves concatenated aliases: %j', (input, expected) => {
    expect(normalizeClassName(input)).toBe(expected);
  });

  it('collapses repeated whitespace and trims', () => {
    expect(normalizeClassName('  lip   stick  ')).toBe(ProductClass.LIP_STICK);
  });

  it.each([null, undefined, ''])('returns null for %j', (input) => {
    expect(normalizeClassName(input as string | null | undefined)).toBeNull();
  });

  it('returns null for an unknown label', () => {
    expect(normalizeClassName('glitter bomb')).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(normalizeClassName(42 as unknown as string)).toBeNull();
  });
});

describe('getDisplayName', () => {
  it('title-cases each word', () => {
    expect(getDisplayName(ProductClass.LIP_STICK)).toBe('Lip Stick');
    expect(getDisplayName(ProductClass.EYELASH_CURLER)).toBe('Eyelash Curler');
  });

  it('returns Unknown for null', () => {
    expect(getDisplayName(null)).toBe('Unknown');
  });
});

describe('isValidClass', () => {
  it('accepts any resolvable variant', () => {
    expect(isValidClass('eye_liner')).toBe(true);
    expect(isValidClass('LIPSTICK')).toBe(true);
  });

  it('rejects unknown labels', () => {
    expect(isValidClass('unicorn dust')).toBe(false);
  });
});

describe('supportsVirtualTryOn', () => {
  it.each(NO_VIRTUAL_TRYON_PRODUCTS)('excludes tool/product %j', (name) => {
    expect(supportsVirtualTryOn(name)).toBe(false);
  });

  it('excludes tools regardless of input format', () => {
    expect(supportsVirtualTryOn('beauty_blender')).toBe(false);
    expect(supportsVirtualTryOn('EYELASH CURLER')).toBe(false);
  });

  it('allows makeup products', () => {
    expect(supportsVirtualTryOn('lip stick')).toBe(true);
    expect(supportsVirtualTryOn('eyeshadow')).toBe(true);
    expect(supportsVirtualTryOn('foundation')).toBe(true);
  });

  it('rejects unknown labels rather than defaulting to try-on', () => {
    expect(supportsVirtualTryOn('mystery item')).toBe(false);
  });
});
