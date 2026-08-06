/**
 * Product class definitions and utilities for makeup product detection.
 */

export const ProductClass = {
  BEAUTY_BLENDER: 'beauty blender',
  BLUSH: 'blush',
  BRONZER: 'bronzer',
  BRUSH: 'brush',
  CONCEALER: 'concealer',
  EYE_LINER: 'eye liner',
  EYE_SHADOW: 'eye shadow',
  EYELASH_CURLER: 'eyelash curler',
  FOUNDATION: 'foundation',
  HIGHLIGHTER: 'highlighter',
  LIP_BALM: 'lip balm',
  LIP_GLOSS: 'lip gloss',
  LIP_LINER: 'lip liner',
  LIP_STICK: 'lip stick',
  MASCARA: 'mascara',
  NAIL_POLISH: 'nail polish',
  POWDER: 'powder',
  PRIMER: 'primer',
  SETTING_SPRAY: 'setting spray',
} as const;

export type ProductClassName = (typeof ProductClass)[keyof typeof ProductClass];

const VARIATIONS: Record<string, ProductClassName> = {
  eyeliner: ProductClass.EYE_LINER,
  'eye-liner': ProductClass.EYE_LINER,
  eyeshadow: ProductClass.EYE_SHADOW,
  'eye-shadow': ProductClass.EYE_SHADOW,
  lipstick: ProductClass.LIP_STICK,
  'lip-stick': ProductClass.LIP_STICK,
  lipliner: ProductClass.LIP_LINER,
  'lip-liner': ProductClass.LIP_LINER,
  lipgloss: ProductClass.LIP_GLOSS,
  'lip-gloss': ProductClass.LIP_GLOSS,
  lipbalm: ProductClass.LIP_BALM,
  'lip-balm': ProductClass.LIP_BALM,
  nailpolish: ProductClass.NAIL_POLISH,
  'nail-polish': ProductClass.NAIL_POLISH,
  settingspray: ProductClass.SETTING_SPRAY,
  beautyblender: ProductClass.BEAUTY_BLENDER,
  'beauty-blender': ProductClass.BEAUTY_BLENDER,
  eyelashcurler: ProductClass.EYELASH_CURLER,
  'eyelash-curler': ProductClass.EYELASH_CURLER,
};

export const getAllClasses = (): string[] => Object.values(ProductClass);

export const getClassCount = (): number => Object.keys(ProductClass).length;

export const normalizeClassName = (className: string | null | undefined): ProductClassName | null => {
  if (!className || typeof className !== 'string') return null;

  let normalized = className.toLowerCase().trim();
  normalized = normalized.replace(/_/g, ' ').replace(/-/g, ' ');
  normalized = normalized.split(/\s+/).join(' ');

  const allClasses = getAllClasses() as string[];
  if (allClasses.includes(normalized)) return normalized as ProductClassName;

  return VARIATIONS[normalized] ?? null;
};

export const getDisplayName = (productClass: ProductClassName | string | null): string => {
  if (!productClass) return 'Unknown';
  return productClass
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export const isValidClass = (className: string): boolean =>
  normalizeClassName(className) !== null;

// Products that don't support a tutorial (no color preview or placement guidance applies)
export const NO_TUTORIAL_PRODUCTS: ProductClassName[] = [
  ProductClass.BRUSH,
  ProductClass.EYELASH_CURLER,
  ProductClass.BEAUTY_BLENDER,
  ProductClass.NAIL_POLISH,
];

export const supportsTutorial = (className: string): boolean => {
  const normalized = normalizeClassName(className);
  if (!normalized) return false;
  return !NO_TUTORIAL_PRODUCTS.includes(normalized);
};
