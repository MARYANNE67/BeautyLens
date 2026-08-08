/**
 * Shared TypeScript types for BeautyLens
 */

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Detection {
  id: string;
  label: string;
  displayName: string;
  brand?: string;
  productName?: string;
  shade?: string;
  productImageUrl?: string;
  boundingBox: BoundingBox;
  confidence: number;
  priceRange?: string;
}

export interface ApiDetection {
  class_name: string;
  display_name: string;
  raw_class_name: string;
  confidence: number;
  bbox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
  productName?: string;
  productImageUrl?: string;
  priceRange?: string;
}

export interface ImageShape {
  width: number;
  height: number;
}

export interface DetectionResult {
  status: string;
  detections: ApiDetection[];
  count: number;
  image_shape?: ImageShape;
}

/**
 * A single MediaPipe landmark in pixel space (already scaled by the
 * backend to the source photo's width/height — NOT normalised 0-1).
 */
export interface Landmark {
  x: number;
  y: number;
  z: number;
}

/**
 * facial_regions as returned by get_facial_regions() in src/api/face_mesh.py.
 * Each key is already an ORDERED ARRAY OF RESOLVED {x,y,z} POINTS forming
 * (in most cases) a closed loop ready to render directly as a polygon —
 * there is no separate indices[] array and no client-side lookup needed.
 */
export interface FacialRegions {
  outer_lip: Landmark[];
  inner_lip: Landmark[];
  upper_lip: Landmark[];
  lower_lip: Landmark[];
  left_eye: Landmark[];
  right_eye: Landmark[];
  face_oval: Landmark[];
  left_under_eye: Landmark[];
  right_under_eye: Landmark[];
  around_mouth: Landmark[];
  left_eyeshadow: Landmark[];
  right_eyeshadow: Landmark[];
}

export interface FaceMeshResult {
  status: string;
  face_detected: boolean;
  landmarks: Landmark[];
  num_landmarks: number;
  bbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  image_dimensions?: ImageShape;
  facial_regions?: FacialRegions;
  message?: string;
}

/**
 * Matches POST /detect-hairline response. One point per requested x
 * position (in the same order), or null where no clean hair->skin
 * transition was found in that column (hat, hair fully covering the
 * forehead, low-confidence segmentation) -- see src/api/hair_segmentation.py.
 */
export interface HairlineResult {
  status: string;
  points: (Pick<Landmark, 'x' | 'y'> | null)[];
  message?: string;
}

export interface HealthStatus {
  status: string;
  model_loaded: boolean;
  model_path?: string;
  confidence_threshold?: number;
}

export type ApiStatus = 'ready' | 'no_model' | 'offline' | 'unknown';

/**
 * Beauty profile — matches src/api/routers/profile.py's ProfileOut.
 * 'uncertain' is a first-class value for every field, not just an
 * absence: the target user is not assumed to know these terms.
 */
export type SkinType = 'dry' | 'oily' | 'combination' | 'uncertain';
export type CoveragePreference = 'light' | 'medium' | 'full' | 'uncertain';
export type FinishPreference = 'matte' | 'natural' | 'radiant' | 'uncertain';

export interface BeautyProfile {
  id: number;
  skin_type: SkinType;
  coverage_preference: CoveragePreference;
  finish_preference: FinishPreference;
  budget_max: number | null;
}

/**
 * Where the profile returned by POST /auth/session came from:
 *  - existing: this account already had one
 *  - claimed:  it adopted the device's pre-auth profile, keeping its scans
 *  - created:  a brand-new empty profile, so the user needs onboarding
 */
export type ProfileOrigin = 'existing' | 'claimed' | 'created';

export interface AuthSession {
  profile_id: number;
  firebase_uid: string;
  email: string | null;
  display_name: string | null;
  skin_type: SkinType;
  coverage_preference: CoveragePreference;
  finish_preference: FinishPreference;
  budget_max: number | null;
  profile_origin: ProfileOrigin;
}

export interface BeautyProfileInput {
  skin_type: SkinType;
  coverage_preference: CoveragePreference;
  finish_preference: FinishPreference;
  budget_max: number | null;
}

/**
 * Quality-gate result for a single skin-scan capture frame — matches
 * src/api/skin_analysis.py's QualityCheckResult.to_dict().
 */
export interface QualityCheckMetrics {
  brightness_mean?: number;
  blur_variance?: number;
  overexposed_fraction?: number;
  color_cast?: number;
  face_detected?: boolean;
  face_area_ratio?: number;
  offcenter_x?: number;
  offcenter_y?: number;
  shadow_diff?: number | null;
}

export interface QualityCheckResult {
  status: string;
  passed: boolean;
  reason_code: string;
  message: string;
  metrics: QualityCheckMetrics;
}

export type SkinScanAngle = 'front' | 'left' | 'right';

/** Matches src/api/routers/skin_scan.py's POST /skin-scan/analyze response. */
export interface SkinScanAnalysis {
  status: string;
  scan_id: number;
  depth_category: string;
  mean_lab: { l: number; a: number; b: number };
  contributing_regions: string[];
  images_used: SkinScanAngle[];
  images_skipped: SkinScanAngle[];
}

export type UndertoneCategory = 'cool' | 'neutral' | 'warm' | 'olive';
export type FoundationProblem = 'too_orange' | 'too_pink' | 'ashy_grey' | 'uncertain';
export type JewelryPreference = 'gold' | 'silver' | 'both' | 'uncertain';
export type VeinColor = 'green' | 'blue_purple' | 'mixture' | 'uncertain';

export interface UndertoneQuestionnaire {
  foundation_problem: FoundationProblem;
  jewelry_preference: JewelryPreference;
  vein_color: VeinColor;
  owned_undertone?: UndertoneCategory | null;
}

/** Matches src/api/routers/skin_scan.py's POST /skin-scan/undertone response. */
export interface UndertoneResult {
  status: string;
  scan_id: number;
  category: UndertoneCategory;
  confidence: number;
  reasoning: string;
  scores: Record<UndertoneCategory, number>;
}

/** Matches PATCH /skin-scan/{id}/confirm-undertone response. */
export interface UndertoneConfirmResult {
  status: string;
  scan_id: number;
  undertone_category: UndertoneCategory;
  undertone_confirmed: boolean;
  user_override_undertone: UndertoneCategory | null;
}

export type ShadeCategory = 'foundation' | 'concealer';

/**
 * How close the match actually is, straight from Delta E:
 *  - close       (<=5)  a genuine match
 *  - approximate (<=10) wearable, worth testing first
 *  - poor        (>10)  visibly off; the catalog has a gap here
 */
export type MatchQuality = 'close' | 'approximate' | 'poor';

/** One entry in GET /recommendations's `recommendations` array. */
export interface ShadeRecommendation {
  shade_id: number;
  brand: string;
  product_line: string;
  shade_name: string;
  category: ShadeCategory;
  label: string;
  match_quality: MatchQuality;
  delta_e: number;
  match_score: number;
  depth_category: string;
  undertone_category: UndertoneCategory;
  /** The shade's actual colour as "#RRGGBB", rendered from the same LAB the
   *  matcher scored. Safe to use directly as a swatch background. */
  swatch_hex: string;
  finish: string;
  coverage: string;
  /** null when no source publishes a price for this shade -- render as unknown,
   *  never as $0. Most of the catalog has no published price. */
  price: number | null;
  currency: string | null;
  /** Retailer/brand product page from the source dataset. Often stale -- both
   *  upstream sources are snapshots -- so prefer `search_url` for the buy link. */
  source_url: string | null;
  /** Live search for this exact shade, generated per request. Never stale,
   *  never 404s, so it is always safe to render. */
  search_url: string;
  bullets: string[];
  concerns: string[];
}

/** Matches GET /recommendations response. */
export interface RecommendationsResult {
  status: string;
  scan_id: number;
  /** The scan's own measured skin colour as "#RRGGBB", for showing the user's
   *  tone beside each shade swatch. null if the scan stored no LAB. */
  skin_hex: string | null;
  depth_category: string;
  undertone_category: UndertoneCategory;
  category: ShadeCategory;
  best_match_quality: MatchQuality;
  /** True when nothing in the catalog is genuinely close to this skin tone. */
  catalog_gap: boolean;
  recommendations: ShadeRecommendation[];
}

/** Matches GET /skin-scan/{id} response. */
export interface SkinScanStatus {
  status: string;
  scan_id: number;
  profile_id: number;
  depth_category: string | null;
  undertone_category: UndertoneCategory | null;
  undertone_confirmed: boolean;
  user_override_undertone: UndertoneCategory | null;
  mean_lab: { l: number; a: number; b: number } | null;
  is_complete: boolean;
}

/** Matches POST /tryon/preview response. */
export interface ShadePreviewResult {
  status: string;
  shade_id: number;
  category: ShadeCategory;
  /** data:image/jpeg;base64,... -- ready to use directly as an <Image> uri. */
  preview_image: string;
}