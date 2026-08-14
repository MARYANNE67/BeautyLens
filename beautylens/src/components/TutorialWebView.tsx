/**
 * TutorialWebView — real-time face-shape placement guidance.
 *
 * Ported from feat/tutorial-placement-guidance, which ran this on the legacy
 * path: capture a photo every 500ms, send it to the Python backend for
 * face-mesh detection, draw flat SVG polygons from the response. That's
 * bottlenecked by a network round-trip on every single update.
 *
 * This version runs MediaPipe FaceMesh entirely client-side inside the
 * WebView (the same approach ARMakeupWebView.tsx uses for AR try-on) --
 * zero per-frame network calls, so the overlay tracks live instead of
 * updating twice a second.
 *
 * Ported faithfully from src/utils/faceGeometry.ts (face-shape
 * classification from landmark ratios) and src/utils/tutorialZones.ts
 * (the PLACEMENT_RULES table: which bands/markers to draw per
 * category+face-shape, sourced from published face-shape makeup guides --
 * see the original file's citations). Real hairline segmentation
 * (`hairlineOr` sources in the original) was NOT ported -- it required a
 * one-off backend call and a capture step; every hairlineOr zone here uses
 * its landmark-approximation fallback instead, which the original rules
 * already treat as a graceful, documented degradation, not a special case.
 *
 * Face shape is learned once per session (sampled for the first ~20 frames
 * after a face is detected, then locked to the most frequent classification)
 * rather than re-classified every frame, matching the original's design.
 */

import React, { forwardRef, useImperativeHandle, useRef, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

export type PlacementCategory = 'contour' | 'concealer' | 'highlighter' | 'blush' | 'bronzer';
export type FaceShape = 'oval' | 'round' | 'square' | 'heart' | 'long';
/** Nose contour is keyed to NOSE shape, not face shape -- every published
 *  guide varies it by the nose's own proportions (wide noses get the side
 *  lines drawn closer together, long noses get shadow under the tip, etc.).
 *  Classified from landmark measurements; see classifyNoseShape in the
 *  WebView script. 'balanced' is the no-pronounced-deviation default. */
export type NoseShape = 'balanced' | 'wide' | 'slim' | 'long' | 'short';

export const CATEGORY_COLOR: Record<PlacementCategory, string> = {
  contour: '#D98A4E',
  concealer: '#F5D9B8',
  highlighter: '#F5E6A3',
  blush: '#E8748A',
  bronzer: '#B87840',
};

export interface TutorialLabelItem {
  category: PlacementCategory;
  label: string;
}

export interface TutorialWebViewProps {
  /** Categories active at mount. Only read once -- toggling categories after
   *  that must go through the `setCategory` ref method (a message to the
   *  already-running WebView), never by changing this prop, or the whole
   *  camera/FaceMesh pipeline would reload from scratch on every toggle. */
  initialCategories: PlacementCategory[];
  onReady?: () => void;
  onError?: (message: string) => void;
  onShapeLocked?: (shape: FaceShape, noseShape: NoseShape) => void;
  /** One entry per currently-active category whose placement rule has
   *  resolved (i.e. the face shape has locked in). Empty while nothing is
   *  active or the shape hasn't locked yet. */
  onLabels?: (items: TutorialLabelItem[]) => void;
  onCaptured?: (base64DataUrl: string) => void;
  style?: object;
}

export interface TutorialWebViewRef {
  /** Turns a single category's overlay on or off; other active categories
   *  keep drawing untouched, so multiple can be layered at once. */
  setCategory(category: PlacementCategory, active: boolean): void;
  capture(): void;
}

function buildTutorialHtml(initialCategories: PlacementCategory[]): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    html,body{width:100%;height:100%;background:#000;overflow:hidden}
    #cam{display:none}
    #out{
      position:fixed;top:0;left:0;
      width:100%;height:100%;
      object-fit:cover;
      transform:scaleX(-1);
    }
    #pill{
      position:fixed;top:20px;left:50%;transform:translateX(-50%);
      background:rgba(0,0,0,0.6);color:#fff;
      font:600 13px/1 -apple-system,sans-serif;
      padding:7px 18px;border-radius:20px;
      white-space:nowrap;pointer-events:none;
      transition:opacity 0.5s;z-index:30;
    }
  </style>
</head>
<body>
  <video id="cam" playsinline muted autoplay></video>
  <canvas id="out"></canvas>
  <div id="pill">Loading tutorial…</div>

  <script src="https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/face_mesh.js" crossorigin="anonymous"></script>
  <script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3.1675466862/camera_utils.js" crossorigin="anonymous"></script>

  <script>
  (function(){
    var rnPost = function(o){ if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(o)); };
    var pill   = document.getElementById('pill');
    function setPill(t, hide){
      pill.textContent = t;
      if(hide){ setTimeout(function(){ pill.style.opacity='0'; }, 2000); }
    }

    // ── Landmark index groups (see faceGeometry.ts for provenance/citations) ──
    var JAWLINE_INDICES = [454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234];
    var CHIN_INDICES = [148,152,377];
    var LEFT_TEMPLE_INDEX = 127;
    var RIGHT_TEMPLE_INDEX = 356;
    var FOREHEAD_INDICES = [127,162,21,54,103,67,109,10,338,297,332,284,251,389,356];
    var LEFT_FOREHEAD_SIDE_INDICES = [127,162,21];
    var RIGHT_FOREHEAD_SIDE_INDICES = [356,389,251];
    var LEFT_CHEEKBONE_INDEX = 234;
    var RIGHT_CHEEKBONE_INDEX = 454;
    var LEFT_CHEEK_INDEX = 50;
    var RIGHT_CHEEK_INDEX = 280;
    var LEFT_CHEEK_HOLLOW_INDEX = 205;
    var RIGHT_CHEEK_HOLLOW_INDEX = 425;
    var FACE_TOP_INDEX = 10;
    var FACE_BOTTOM_INDEX = 152;
    var LEFT_JAW_WIDTH_INDEX = 172;
    var RIGHT_JAW_WIDTH_INDEX = 397;
    var CUPIDS_BOW_INDEX = 0;
    var FOREHEAD_CENTER_INDEX = 10;
    var CHIN_BUTTON_INDEX = 199;
    var LEFT_MOUTH_CORNER_INDEX = 61;
    var RIGHT_MOUTH_CORNER_INDEX = 291;
    var NOSE_BRIDGE_INDEX = 6;
    var LEFT_JAW_CORNER_INDEX = 58;
    var RIGHT_JAW_CORNER_INDEX = 288;
    // Nose-measurement anchors. GLABELLA (9) is documented in faceGeometry.ts
    // as the between-the-brows reference. The rest are commonly cited
    // canonical midline/nose indices -- moderate confidence, same status as
    // the other single-point anchors (not yet annotated on a real portrait
    // in this codebase): 2 = columella base under the tip (subnasale proxy),
    // 4 = midline just above the tip, 129/358 = outer alar/nose-wing points
    // (the standard face-mesh proxy for nose width), 133/362 = inner eye
    // corners. Left/right follows the same side convention as 61/291 and
    // 50/280 (the lower index of each mirrored pair is the same side).
    var GLABELLA_INDEX = 9;
    var SUBNASALE_INDEX = 2;
    var NOSE_LOWER_DORSUM_INDEX = 4;
    var LEFT_NOSE_ALA_INDEX = 129;
    var RIGHT_NOSE_ALA_INDEX = 358;
    var LEFT_INNER_EYE_CORNER_INDEX = 133;
    var RIGHT_INNER_EYE_CORNER_INDEX = 362;
    // From src/api/face_mesh.py's get_facial_regions() -- same indices the
    // backend detector already uses for these two named regions.
    var LEFT_UNDER_EYE_INDICES = [23,24,25,110,226,31,228,229,230,231,232,233];
    var RIGHT_UNDER_EYE_INDICES = [253,254,255,339,446,261,448,449,450,451,452,453];

    var CATEGORY_COLOR = {
      contour: '#D98A4E',
      concealer: '#F5D9B8',
      highlighter: '#F5E6A3',
      blush: '#E8748A',
      bronzer: '#B87840'
    };

    var LEFT_CHEEK_MARKER  = { indices: [LEFT_CHEEK_INDEX] };
    var RIGHT_CHEEK_MARKER = { indices: [RIGHT_CHEEK_INDEX] };
    var LEFT_HOLLOW  = { indices: [LEFT_CHEEK_HOLLOW_INDEX] };
    var RIGHT_HOLLOW = { indices: [RIGHT_CHEEK_HOLLOW_INDEX] };

    // ── Placement rules table (ported from tutorialZones.ts's PLACEMENT_RULES) ──
    // See that file for the published-guide citations behind each zone.
    //
    // Forehead-contour zones for oval/round/square (heart and long already
    // had theirs) are sourced from face-shape-specific guides:
    //  - charlottetilbury.com/us/secrets/how-to-contour-every-face-shape
    //    (oval: "place your product on either side of the forehead for a
    //    shading effect that helps it to look smaller and shorter"; square:
    //    diagonal strokes on the four corners of the face incl. temples)
    //  - treasurehouseofmakeup.co.uk/blog/how-to-contour-face/ (round:
    //    "contouring around the forehead and temples can elongate the face";
    //    square: "contour around the sides of the forehead and temples to
    //    soften the face's edges")
    // Round reuses heart's temple->forehead-side band shape: the sourced
    // techniques genuinely describe the same placement (same situation as
    // blush's round/long note in tutorialZones.ts), differing only in stated
    // goal (elongate vs narrow).
    var PLACEMENT_RULES = {
      contour: {
        oval: { label: 'Light contour along the cheek hollows + sides of the forehead', zones: [
          { key:'contour-left-hollow', kind:'band', opacity:0.4, strokeWidth:8, source:{ sequence:[LEFT_HOLLOW, { interpolate:{ a:LEFT_CHEEK_HOLLOW_INDEX, b:LEFT_MOUTH_CORNER_INDEX, t:0.55 } }] } },
          { key:'contour-right-hollow', kind:'band', opacity:0.4, strokeWidth:8, source:{ sequence:[RIGHT_HOLLOW, { interpolate:{ a:RIGHT_CHEEK_HOLLOW_INDEX, b:RIGHT_MOUTH_CORNER_INDEX, t:0.55 } }] } },
          { key:'contour-left-forehead-side', kind:'band', opacity:0.35, strokeWidth:8, source:{ hairlineOr:{ keys:['left'], fallback:{ newRegion:'left_forehead_side' } } } },
          { key:'contour-right-forehead-side', kind:'band', opacity:0.35, strokeWidth:8, source:{ hairlineOr:{ keys:['right'], fallback:{ newRegion:'right_forehead_side' } } } }
        ] },
        round: { label: 'Contour jaw + cheek hollows, temples up toward the forehead to elongate', zones: [
          { key:'contour-jawline', kind:'band', opacity:0.5, strokeWidth:8, source:{ newRegion:'jawline' } },
          { key:'contour-left-hollow', kind:'band', opacity:0.55, strokeWidth:10, source:{ sequence:[LEFT_HOLLOW, { interpolate:{ a:LEFT_CHEEK_HOLLOW_INDEX, b:LEFT_MOUTH_CORNER_INDEX, t:0.55 } }] } },
          { key:'contour-right-hollow', kind:'band', opacity:0.55, strokeWidth:10, source:{ sequence:[RIGHT_HOLLOW, { interpolate:{ a:RIGHT_CHEEK_HOLLOW_INDEX, b:RIGHT_MOUTH_CORNER_INDEX, t:0.55 } }] } },
          { key:'contour-left-forehead-side', kind:'band', opacity:0.4, strokeWidth:8, source:{ sequence:[{ indices:[LEFT_TEMPLE_INDEX] }, { hairlineOr:{ keys:['left'], fallback:{ newRegion:'left_forehead_side' } } }] } },
          { key:'contour-right-forehead-side', kind:'band', opacity:0.4, strokeWidth:8, source:{ sequence:[{ indices:[RIGHT_TEMPLE_INDEX] }, { hairlineOr:{ keys:['right'], fallback:{ newRegion:'right_forehead_side' } } }] } }
        ] },
        square: { label: 'Soften jaw corners, temples + forehead corners, light diagonal strokes only', zones: [
          { key:'contour-left-hollow', kind:'band', opacity:0.4, strokeWidth:8, source:{ sequence:[LEFT_HOLLOW, { interpolate:{ a:LEFT_CHEEK_HOLLOW_INDEX, b:LEFT_MOUTH_CORNER_INDEX, t:0.55 } }] } },
          { key:'contour-right-hollow', kind:'band', opacity:0.4, strokeWidth:8, source:{ sequence:[RIGHT_HOLLOW, { interpolate:{ a:RIGHT_CHEEK_HOLLOW_INDEX, b:RIGHT_MOUTH_CORNER_INDEX, t:0.55 } }] } },
          { key:'contour-left-temple', kind:'band', opacity:0.3, strokeWidth:6, source:{ sequence:[{ indices:[LEFT_TEMPLE_INDEX] }, { indices:[LEFT_JAW_CORNER_INDEX] }] } },
          { key:'contour-right-temple', kind:'band', opacity:0.3, strokeWidth:6, source:{ sequence:[{ indices:[RIGHT_TEMPLE_INDEX] }, { indices:[RIGHT_JAW_CORNER_INDEX] }] } },
          { key:'contour-left-forehead-corner', kind:'band', opacity:0.3, strokeWidth:6, source:{ hairlineOr:{ keys:['left'], fallback:{ newRegion:'left_forehead_side' } } } },
          { key:'contour-right-forehead-corner', kind:'band', opacity:0.3, strokeWidth:6, source:{ hairlineOr:{ keys:['right'], fallback:{ newRegion:'right_forehead_side' } } } }
        ] },
        heart: { label: 'Contour temples/forehead sides to narrow', zones: [
          { key:'contour-left-forehead-side', kind:'band', opacity:0.5, strokeWidth:8, source:{ sequence:[{ indices:[LEFT_TEMPLE_INDEX] }, { hairlineOr:{ keys:['left'], fallback:{ newRegion:'left_forehead_side' } } }] } },
          { key:'contour-right-forehead-side', kind:'band', opacity:0.5, strokeWidth:8, source:{ sequence:[{ indices:[RIGHT_TEMPLE_INDEX] }, { hairlineOr:{ keys:['right'], fallback:{ newRegion:'right_forehead_side' } } }] } }
        ] },
        long: { label: 'Contour hairline + jaw + chin to shorten, skip vertical lines', zones: [
          { key:'contour-forehead', kind:'band', opacity:0.4, strokeWidth:8, source:{ hairlineOr:{ keys:['left','center','right'], fallback:{ newRegion:'forehead' } } } },
          { key:'contour-jawline', kind:'band', opacity:0.35, strokeWidth:8, source:{ newRegion:'jawline' } },
          { key:'contour-chin', kind:'band', opacity:0.35, strokeWidth:6, source:{ newRegion:'chin' } }
        ] }
      },

      concealer: (function(){
        var rule = { label: 'Concealer: under-eyes, nose bridge, chin, smile lines', zones: [
          { key:'concealer-left-under-eye', kind:'band', opacity:0.6, strokeWidth:10, source:{ regionToward:{ region:'left_under_eye', toward:LEFT_MOUTH_CORNER_INDEX, t:0.09 } } },
          { key:'concealer-right-under-eye', kind:'band', opacity:0.6, strokeWidth:10, source:{ regionToward:{ region:'right_under_eye', toward:RIGHT_MOUTH_CORNER_INDEX, t:0.09 } } },
          { key:'concealer-forehead', kind:'marker', opacity:0.5, radius:8, source:{ indices:[FOREHEAD_CENTER_INDEX] } },
          { key:'concealer-chin', kind:'marker', opacity:0.5, radius:8, source:{ indices:[CHIN_BUTTON_INDEX] } },
          { key:'concealer-nose-bridge', kind:'marker', opacity:0.5, radius:6, source:{ indices:[NOSE_BRIDGE_INDEX] } },
          { key:'concealer-left-smile-line', kind:'marker', opacity:0.4, radius:6, source:{ indices:[LEFT_MOUTH_CORNER_INDEX] } },
          { key:'concealer-right-smile-line', kind:'marker', opacity:0.4, radius:6, source:{ indices:[RIGHT_MOUTH_CORNER_INDEX] } }
        ] };
        return { oval:rule, round:rule, square:rule, heart:rule, long:rule };
      })(),

      // Opacities here are deliberately lower than the other categories' --
      // highlighter markers read as a soft sheen, not a solid patch, and the
      // cupid's-bow marker in particular sits right on the top lip (a real,
      // sourced technique -- dabbing highlighter there for a fuller-lip
      // illusion -- not a placement bug), so it gets a smaller radius too so
      // it doesn't visually cover the lip at the larger global marker scale.
      highlighter: {
        oval: { label: "Highlight: cheekbones, nose bridge, cupid's bow, chin, under-eyes", zones: [
          { key:'highlighter-left-cheekbone', kind:'marker', opacity:0.4, radius:9, source:LEFT_CHEEK_MARKER },
          { key:'highlighter-right-cheekbone', kind:'marker', opacity:0.4, radius:9, source:RIGHT_CHEEK_MARKER },
          { key:'highlighter-nose-bridge', kind:'marker', opacity:0.32, radius:6, source:{ indices:[NOSE_BRIDGE_INDEX] } },
          { key:'highlighter-cupids-bow', kind:'marker', opacity:0.3, radius:3.5, source:{ indices:[CUPIDS_BOW_INDEX] } },
          { key:'highlighter-chin', kind:'marker', opacity:0.32, radius:8, source:{ indices:[CHIN_BUTTON_INDEX] } },
          { key:'highlighter-left-under-eye', kind:'band', opacity:0.18, strokeWidth:6, source:{ regionToward:{ region:'left_under_eye', toward:LEFT_MOUTH_CORNER_INDEX, t:0.09 } } },
          { key:'highlighter-right-under-eye', kind:'band', opacity:0.18, strokeWidth:6, source:{ regionToward:{ region:'right_under_eye', toward:RIGHT_MOUTH_CORNER_INDEX, t:0.09 } } }
        ] },
        round: { label: 'Highlight cheekbones, blending up toward temples to lift', zones: [
          { key:'highlighter-left-cheek-lift', kind:'band', opacity:0.3, strokeWidth:8, source:{ sequence:[LEFT_CHEEK_MARKER, { indices:[LEFT_TEMPLE_INDEX] }] } },
          { key:'highlighter-right-cheek-lift', kind:'band', opacity:0.3, strokeWidth:8, source:{ sequence:[RIGHT_CHEEK_MARKER, { indices:[RIGHT_TEMPLE_INDEX] }] } },
          { key:'highlighter-cupids-bow', kind:'marker', opacity:0.3, radius:3.5, source:{ indices:[CUPIDS_BOW_INDEX] } },
          { key:'highlighter-chin', kind:'marker', opacity:0.32, radius:8, source:{ indices:[CHIN_BUTTON_INDEX] } }
        ] },
        square: { label: 'Highlight cheekbones + nose bridge + chin for radiance', zones: [
          { key:'highlighter-left-cheekbone', kind:'marker', opacity:0.4, radius:9, source:LEFT_CHEEK_MARKER },
          { key:'highlighter-right-cheekbone', kind:'marker', opacity:0.4, radius:9, source:RIGHT_CHEEK_MARKER },
          { key:'highlighter-nose-bridge', kind:'marker', opacity:0.32, radius:6, source:{ indices:[NOSE_BRIDGE_INDEX] } },
          { key:'highlighter-chin', kind:'marker', opacity:0.28, radius:7, source:{ indices:[CHIN_BUTTON_INDEX] } }
        ] },
        heart: { label: 'Highlight the chin to add balance, plus the cheekbones', zones: [
          { key:'highlighter-left-cheekbone', kind:'marker', opacity:0.36, radius:8, source:LEFT_CHEEK_MARKER },
          { key:'highlighter-right-cheekbone', kind:'marker', opacity:0.36, radius:8, source:RIGHT_CHEEK_MARKER },
          { key:'highlighter-chin', kind:'marker', opacity:0.4, radius:11, source:{ indices:[CHIN_BUTTON_INDEX] } },
          { key:'highlighter-cupids-bow', kind:'marker', opacity:0.3, radius:3.5, source:{ indices:[CUPIDS_BOW_INDEX] } }
        ] },
        long: { label: 'Highlight chin + cheekbones; sweep under-eyes toward temples to widen', zones: [
          { key:'highlighter-left-cheekbone', kind:'marker', opacity:0.36, radius:9, source:LEFT_CHEEK_MARKER },
          { key:'highlighter-right-cheekbone', kind:'marker', opacity:0.36, radius:9, source:RIGHT_CHEEK_MARKER },
          { key:'highlighter-chin', kind:'marker', opacity:0.36, radius:11, source:{ indices:[CHIN_BUTTON_INDEX] } },
          { key:'highlighter-left-under-eye-wide', kind:'band', opacity:0.2, strokeWidth:8, source:{ sequence:[{ regionToward:{ region:'left_under_eye', toward:LEFT_MOUTH_CORNER_INDEX, t:0.09 } }, { indices:[LEFT_TEMPLE_INDEX] }] } },
          { key:'highlighter-right-under-eye-wide', kind:'band', opacity:0.2, strokeWidth:8, source:{ sequence:[{ regionToward:{ region:'right_under_eye', toward:RIGHT_MOUTH_CORNER_INDEX, t:0.09 } }, { indices:[RIGHT_TEMPLE_INDEX] }] } }
        ] }
      },

      blush: {
        oval: { label: 'Blush: highest point of the cheekbones, diffused outward', zones: [
          { key:'blush-left-cheek', kind:'marker', opacity:0.5, radius:14, source:LEFT_CHEEK_MARKER },
          { key:'blush-right-cheek', kind:'marker', opacity:0.5, radius:14, source:RIGHT_CHEEK_MARKER }
        ] },
        round: { label: 'Blush: straight line from ear toward center, along the cheekbone, skip the apples', zones: [
          { key:'blush-left-line', kind:'band', opacity:0.5, strokeWidth:10, source:{ sequence:[{ indices:[LEFT_TEMPLE_INDEX] }, LEFT_CHEEK_MARKER] } },
          { key:'blush-right-line', kind:'band', opacity:0.5, strokeWidth:10, source:{ sequence:[{ indices:[RIGHT_TEMPLE_INDEX] }, RIGHT_CHEEK_MARKER] } }
        ] },
        square: { label: 'Blush: soft, rounded on the apples, avoid sharp diagonal lines', zones: [
          { key:'blush-left-cheek', kind:'marker', opacity:0.45, radius:18, source:LEFT_CHEEK_MARKER },
          { key:'blush-right-cheek', kind:'marker', opacity:0.45, radius:18, source:RIGHT_CHEEK_MARKER }
        ] },
        heart: { label: 'Blush: tops of the cheekbones, blended up toward the brow tail', zones: [
          { key:'blush-left-up', kind:'band', opacity:0.5, strokeWidth:9, source:{ sequence:[LEFT_CHEEK_MARKER, { indices:[LEFT_TEMPLE_INDEX] }] } },
          { key:'blush-right-up', kind:'band', opacity:0.5, strokeWidth:9, source:{ sequence:[RIGHT_CHEEK_MARKER, { indices:[RIGHT_TEMPLE_INDEX] }] } }
        ] },
        long: { label: "Blush: short straight line on the apples, don't blend too far out", zones: [
          { key:'blush-left-line', kind:'band', opacity:0.4, strokeWidth:8, source:{ sequence:[{ indices:[LEFT_TEMPLE_INDEX] }, LEFT_CHEEK_MARKER] } },
          { key:'blush-right-line', kind:'band', opacity:0.4, strokeWidth:8, source:{ sequence:[{ indices:[RIGHT_TEMPLE_INDEX] }, RIGHT_CHEEK_MARKER] } }
        ] }
      },

      bronzer: {
        oval: { label: 'Bronzer: light sweep from temple, under the cheekbone, to the jaw', zones: [
          { key:'bronzer-left-sweep', kind:'band', opacity:0.45, strokeWidth:12, source:{ sequence:[{ indices:[LEFT_TEMPLE_INDEX] }, LEFT_HOLLOW, { indices:[LEFT_JAW_CORNER_INDEX] }] } },
          { key:'bronzer-right-sweep', kind:'band', opacity:0.45, strokeWidth:12, source:{ sequence:[{ indices:[RIGHT_TEMPLE_INDEX] }, RIGHT_HOLLOW, { indices:[RIGHT_JAW_CORNER_INDEX] }] } }
        ] },
        round: { label: 'Bronzer: cheekbones blending up toward the temples to lift', zones: [
          { key:'bronzer-left-lift', kind:'band', opacity:0.48, strokeWidth:12, source:{ sequence:[LEFT_CHEEK_MARKER, { indices:[LEFT_TEMPLE_INDEX] }] } },
          { key:'bronzer-right-lift', kind:'band', opacity:0.48, strokeWidth:12, source:{ sequence:[RIGHT_CHEEK_MARKER, { indices:[RIGHT_TEMPLE_INDEX] }] } }
        ] },
        square: { label: 'Bronzer: temples toward the hairline, plus light jaw + chin contour', zones: [
          { key:'bronzer-left-temple-hairline', kind:'band', opacity:0.48, strokeWidth:12, source:{ sequence:[{ indices:[LEFT_TEMPLE_INDEX] }, { hairlineOr:{ keys:['left'], fallback:{ newRegion:'forehead' } } }] } },
          { key:'bronzer-right-temple-hairline', kind:'band', opacity:0.48, strokeWidth:12, source:{ sequence:[{ indices:[RIGHT_TEMPLE_INDEX] }, { hairlineOr:{ keys:['right'], fallback:{ newRegion:'forehead' } } }] } },
          { key:'bronzer-jawline', kind:'band', opacity:0.4, strokeWidth:10, source:{ newRegion:'jawline' } },
          { key:'bronzer-chin', kind:'band', opacity:0.4, strokeWidth:8, source:{ newRegion:'chin' } }
        ] },
        heart: { label: 'Bronzer: general sweep, temple, cheek hollow, jaw', zones: [
          { key:'bronzer-left-sweep', kind:'band', opacity:0.45, strokeWidth:12, source:{ sequence:[{ indices:[LEFT_TEMPLE_INDEX] }, LEFT_HOLLOW, { indices:[LEFT_JAW_CORNER_INDEX] }] } },
          { key:'bronzer-right-sweep', kind:'band', opacity:0.45, strokeWidth:12, source:{ sequence:[{ indices:[RIGHT_TEMPLE_INDEX] }, RIGHT_HOLLOW, { indices:[RIGHT_JAW_CORNER_INDEX] }] } }
        ] },
        long: { label: 'Bronzer: hairline + cheek hollows + jaw + chin to shorten the face', zones: [
          { key:'bronzer-forehead', kind:'band', opacity:0.48, strokeWidth:12, source:{ hairlineOr:{ keys:['left','center','right'], fallback:{ newRegion:'forehead' } } } },
          { key:'bronzer-left-hollow', kind:'band', opacity:0.48, strokeWidth:10, source:{ sequence:[LEFT_HOLLOW, { interpolate:{ a:LEFT_CHEEK_HOLLOW_INDEX, b:LEFT_MOUTH_CORNER_INDEX, t:0.55 } }] } },
          { key:'bronzer-right-hollow', kind:'band', opacity:0.48, strokeWidth:10, source:{ sequence:[RIGHT_HOLLOW, { interpolate:{ a:RIGHT_CHEEK_HOLLOW_INDEX, b:RIGHT_MOUTH_CORNER_INDEX, t:0.55 } }] } },
          { key:'bronzer-jawline', kind:'band', opacity:0.48, strokeWidth:10, source:{ newRegion:'jawline' } },
          { key:'bronzer-chin', kind:'band', opacity:0.48, strokeWidth:8, source:{ newRegion:'chin' } }
        ] }
      }
    };

    // ── Nose-contour rules, keyed by NOSE shape (see classifyNoseShape) ───
    // Drawn in addition to the face-shape contour zones whenever the contour
    // category is active. Base technique from
    // charlottetilbury.com/us/secrets/how-to-contour-nose: thin vertical
    // lines down the sides of the bridge ("the closer the lines, the smaller
    // the nose"), shadow under the tip to shorten a long nose. Side lines
    // are built from interpolations between already-trusted anchors -- top
    // point partway from the bridge midline (6) toward the same-side inner
    // eye corner, bottom point partway from the midline above the tip (4)
    // toward the same-side ala -- so line spacing is a single t knob per
    // nose shape, directly implementing the "closer together for a wider
    // nose" instruction. The slim rule intentionally has NO zones: a nose
    // with no width to take away shouldn't be told to slim itself further.
    function noseSideLines(tTop, tBottom, opacity){
      return [
        { key:'contour-nose-left-line', kind:'band', opacity:opacity, strokeWidth:3, source:{ sequence:[
          { interpolate:{ a:NOSE_BRIDGE_INDEX, b:LEFT_INNER_EYE_CORNER_INDEX, t:tTop } },
          { interpolate:{ a:NOSE_LOWER_DORSUM_INDEX, b:LEFT_NOSE_ALA_INDEX, t:tBottom } }
        ] } },
        { key:'contour-nose-right-line', kind:'band', opacity:opacity, strokeWidth:3, source:{ sequence:[
          { interpolate:{ a:NOSE_BRIDGE_INDEX, b:RIGHT_INNER_EYE_CORNER_INDEX, t:tTop } },
          { interpolate:{ a:NOSE_LOWER_DORSUM_INDEX, b:RIGHT_NOSE_ALA_INDEX, t:tBottom } }
        ] } }
      ];
    }
    var NOSE_CONTOUR_RULES = {
      balanced: {
        label: 'Nose: thin lines down both sides of the bridge.',
        zones: noseSideLines(0.45, 0.5, 0.45)
      },
      wide: {
        label: 'Nose (wider): side lines drawn closer together, light shading on the nostril wings.',
        zones: noseSideLines(0.3, 0.35, 0.45).concat([
          { key:'contour-nose-left-ala', kind:'marker', opacity:0.3, radius:4, source:{ indices:[LEFT_NOSE_ALA_INDEX] } },
          { key:'contour-nose-right-ala', kind:'marker', opacity:0.3, radius:4, source:{ indices:[RIGHT_NOSE_ALA_INDEX] } }
        ])
      },
      slim: {
        label: 'Nose already slim: skip nose contour.',
        zones: []
      },
      long: {
        label: 'Nose (longer): side lines plus a soft shadow under the tip to shorten.',
        zones: noseSideLines(0.45, 0.5, 0.45).concat([
          { key:'contour-nose-under-tip', kind:'band', opacity:0.45, strokeWidth:3, source:{ sequence:[
            { interpolate:{ a:SUBNASALE_INDEX, b:LEFT_NOSE_ALA_INDEX, t:0.3 } },
            { interpolate:{ a:SUBNASALE_INDEX, b:RIGHT_NOSE_ALA_INDEX, t:0.3 } }
          ] } }
        ])
      },
      short: {
        label: 'Nose (shorter): side lines started up near the brows to lengthen.',
        zones: [
          { key:'contour-nose-left-line', kind:'band', opacity:0.45, strokeWidth:3, source:{ sequence:[
            { interpolate:{ a:GLABELLA_INDEX, b:LEFT_INNER_EYE_CORNER_INDEX, t:0.4 } },
            { interpolate:{ a:NOSE_LOWER_DORSUM_INDEX, b:LEFT_NOSE_ALA_INDEX, t:0.5 } }
          ] } },
          { key:'contour-nose-right-line', kind:'band', opacity:0.45, strokeWidth:3, source:{ sequence:[
            { interpolate:{ a:GLABELLA_INDEX, b:RIGHT_INNER_EYE_CORNER_INDEX, t:0.4 } },
            { interpolate:{ a:NOSE_LOWER_DORSUM_INDEX, b:RIGHT_NOSE_ALA_INDEX, t:0.5 } }
          ] } }
        ]
      }
    };

    // ── Helpers (same conventions as ARMakeupWebView.tsx) ──────────────────
    function pts(lms, indices, W, H){
      return indices.map(function(i){ return [lms[i].x*W, lms[i].y*H]; });
    }
    function hexToRgb(hex){
      var h = hex.replace('#','');
      if(h.length===3) h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
      return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
    }
    function smoothPath(ctx, points, close){
      if(points.length < 2) return;
      ctx.beginPath();
      // Exactly 2 points: the loop below never runs (nothing between two
      // endpoints to curve through), so moveTo-to-a-midpoint alone leaves an
      // empty path -- stroke() then draws nothing. Many rule-table bands are
      // literal 2-point straight lines, so this isn't an edge case to skip.
      if(points.length === 2){
        ctx.moveTo(points[0][0], points[0][1]);
        ctx.lineTo(points[1][0], points[1][1]);
        return;
      }
      ctx.moveTo((points[0][0]+points[1][0])/2,(points[0][1]+points[1][1])/2);
      for(var i=1;i<points.length-1;i++){
        var mx=(points[i][0]+points[i+1][0])/2;
        var my=(points[i][1]+points[i+1][1])/2;
        ctx.quadraticCurveTo(points[i][0],points[i][1],mx,my);
      }
      if(close){
        var mx0=(points[points.length-1][0]+points[0][0])/2;
        var my0=(points[points.length-1][1]+points[0][1])/2;
        ctx.quadraticCurveTo(points[points.length-1][0],points[points.length-1][1],mx0,my0);
        ctx.closePath();
      }
    }
    function dist2(a, b){
      return Math.sqrt((a[0]-b[0])*(a[0]-b[0])+(a[1]-b[1])*(a[1]-b[1]));
    }

    // ── Face-shape classification ────────────────────────────────────────
    function computeRatios(lms, W, H){
      function P(i){ return pts(lms,[i],W,H)[0]; }
      var top=P(FACE_TOP_INDEX), bottom=P(FACE_BOTTOM_INDEX);
      var leftCheek=P(LEFT_CHEEKBONE_INDEX), rightCheek=P(RIGHT_CHEEKBONE_INDEX);
      var leftJaw=P(LEFT_JAW_WIDTH_INDEX), rightJaw=P(RIGHT_JAW_WIDTH_INDEX);
      var leftForehead=P(LEFT_TEMPLE_INDEX), rightForehead=P(RIGHT_TEMPLE_INDEX);
      var cheekboneWidth = dist2(leftCheek, rightCheek);
      var jawWidth = dist2(leftJaw, rightJaw);
      if(cheekboneWidth===0 || jawWidth===0) return null;
      return {
        lengthToWidthRatio: dist2(top,bottom) / cheekboneWidth,
        jawToCheekRatio: jawWidth / cheekboneWidth,
        foreheadToCheekRatio: dist2(leftForehead,rightForehead) / cheekboneWidth,
        foreheadToJawRatio: dist2(leftForehead,rightForehead) / jawWidth
      };
    }
    // Cutoffs/method: see faceGeometry.ts's classifyFaceShape doc comment
    // for sourcing (Farkas facial index + aggregated face-shape calculators).
    function classifyFaceShape(lms, W, H){
      var r = computeRatios(lms, W, H);
      if(!r) return null;
      if(r.lengthToWidthRatio >= 1.6) return 'long';
      if(r.foreheadToJawRatio >= 1.15) return 'heart';
      if(r.jawToCheekRatio >= 0.92 && r.foreheadToCheekRatio >= 0.92 && r.lengthToWidthRatio < 1.25) return 'square';
      if(r.lengthToWidthRatio <= 1.25 && r.jawToCheekRatio >= 0.9) return 'round';
      return 'oval';
    }

    // ── Nose-shape classification ────────────────────────────────────────
    // Nose contour is keyed to the nose's own proportions, not face shape
    // (every published guide varies it this way -- e.g.
    // charlottetilbury.com/us/secrets/how-to-contour-nose: wide noses get
    // the side lines drawn closer together, long noses get shadow under the
    // tip). Two established anthropometric references ground the ratios:
    //  - Nasal index (alar width / nose height): population-classification
    //    cutoffs are leptorrhine <0.70 and platyrrhine >0.85. Those describe
    //    populations, not cosmetics, so guidance only changes for PRONOUNCED
    //    deviations -- thresholds sit outside those cutoffs (>=0.92 wide,
    //    <=0.60 slim), leaving a generous 'balanced' middle.
    //  - Neoclassical facial-thirds canon (glabella->subnasale should about
    //    equal subnasale->menton): ratio >=1.15 reads long, <=0.82 short.
    // Frontal 2D projection is fine for both: every distance involved lies
    // in the frontal plane. What is NOT classifiable from a front view:
    // dorsal bumps, crookedness, tip shape (all depth/profile features) --
    // those variants from the guides are deliberately not modeled.
    // Ordered checks like classifyFaceShape: a nose can be e.g. both wide
    // and long; the first match wins.
    function classifyNoseShape(lms, W, H){
      function P(i){ return pts(lms,[i],W,H)[0]; }
      var alaL = P(LEFT_NOSE_ALA_INDEX), alaR = P(RIGHT_NOSE_ALA_INDEX);
      var glabella = P(GLABELLA_INDEX), subnasale = P(SUBNASALE_INDEX), chin = P(FACE_BOTTOM_INDEX);
      if(!alaL || !alaR || !glabella || !subnasale || !chin) return null;
      var alarWidth  = dist2(alaL, alaR);
      var noseHeight = dist2(glabella, subnasale);
      var lowerThird = dist2(subnasale, chin);
      if(noseHeight === 0 || lowerThird === 0) return null;
      var nasalIndex  = alarWidth / noseHeight;
      var lengthRatio = noseHeight / lowerThird;
      if(nasalIndex >= 0.92) return 'wide';
      if(nasalIndex <= 0.60) return 'slim';
      if(lengthRatio >= 1.15) return 'long';
      if(lengthRatio <= 0.82) return 'short';
      return 'balanced';
    }

    // ── Zone resolution + drawing ────────────────────────────────────────
    function buildRegions(lms, W, H){
      return {
        jawline: pts(lms, JAWLINE_INDICES, W, H),
        chin: pts(lms, CHIN_INDICES, W, H),
        forehead: pts(lms, FOREHEAD_INDICES, W, H),
        left_forehead_side: pts(lms, LEFT_FOREHEAD_SIDE_INDICES, W, H),
        right_forehead_side: pts(lms, RIGHT_FOREHEAD_SIDE_INDICES, W, H),
        left_under_eye: pts(lms, LEFT_UNDER_EYE_INDICES, W, H),
        right_under_eye: pts(lms, RIGHT_UNDER_EYE_INDICES, W, H)
      };
    }
    // hairlineOr always takes 'fallback' -- real hairline segmentation
    // wasn't ported (see file header), and the rules already treat that as
    // a documented, graceful degradation rather than a special case.
    function resolvePoints(source, regions, lms, W, H){
      if(source.sequence){
        return source.sequence.reduce(function(acc, s){
          return acc.concat(resolvePoints(s, regions, lms, W, H));
        }, []);
      }
      if(source.region) return regions[source.region] || [];
      if(source.newRegion) return regions[source.newRegion] || [];
      if(source.hairlineOr) return resolvePoints(source.hairlineOr.fallback, regions, lms, W, H);
      if(source.interpolate){
        var a = pts(lms,[source.interpolate.a],W,H)[0];
        var b = pts(lms,[source.interpolate.b],W,H)[0];
        if(!a || !b) return [];
        var t = source.interpolate.t;
        return [[ a[0]+t*(b[0]-a[0]), a[1]+t*(b[1]-a[1]) ]];
      }
      if(source.regionToward){
        var target = pts(lms,[source.regionToward.toward],W,H)[0];
        if(!target) return [];
        var t2 = source.regionToward.t;
        return (regions[source.regionToward.region] || []).map(function(p){
          return [ p[0]+t2*(target[0]-p[0]), p[1]+t2*(target[1]-p[1]) ];
        });
      }
      if(source.indices) return pts(lms, source.indices, W, H);
      return [];
    }

    // Zones mark general placement *areas*, not exact points -- scaled up
    // from the rule table's base strokeWidth/radius in one place, same
    // reasoning as ARMakeupWebView.tsx's BAND_WIDTH_SCALE/MARKER_RADIUS_SCALE.
    var BAND_WIDTH_SCALE = 2.6;
    var MARKER_RADIUS_SCALE = 2.3;

    function drawZones(ctx, lms, W, H, rule, category){
      var regions = buildRegions(lms, W, H);
      var rgb = hexToRgb(CATEGORY_COLOR[category]);
      rule.zones.forEach(function(zone){
        var rawPoints = resolvePoints(zone.source, regions, lms, W, H);
        if(zone.kind === 'band'){
          if(rawPoints.length < 2) return;
          ctx.save();
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = zone.opacity;
          ctx.strokeStyle = 'rgb('+rgb[0]+','+rgb[1]+','+rgb[2]+')';
          ctx.lineWidth = (zone.strokeWidth||8) * BAND_WIDTH_SCALE;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          smoothPath(ctx, rawPoints, false);
          ctx.stroke();
          ctx.restore();
        } else {
          rawPoints.forEach(function(p){
            ctx.save();
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = zone.opacity;
            ctx.fillStyle = 'rgb('+rgb[0]+','+rgb[1]+','+rgb[2]+')';
            ctx.beginPath();
            ctx.arc(p[0], p[1], (zone.radius||8)*MARKER_RADIUS_SCALE, 0, Math.PI*2);
            ctx.fill();
            ctx.restore();
          });
        }
      });
    }

    // ── Boot ────────────────────────────────────────────────────────────────
    function waitForGlobals(maxMs, cb){
      var start = Date.now();
      (function check(){
        if(typeof window.FaceMesh!=='undefined'&&typeof window.Camera!=='undefined'){
          cb(null);
        } else if(Date.now()-start>maxMs){
          cb(new Error('MediaPipe globals not ready after '+maxMs+'ms'));
        } else {
          setTimeout(check,100);
        }
      })();
    }

    var videoEl  = document.getElementById('cam');
    var canvasEl = document.getElementById('out');
    var ctx = null;

    // Set of currently-active categories -- several can draw at once, each
    // toggled independently via the 'setCategory' message below.
    var activeCategories = {};
    (${JSON.stringify(initialCategories.filter((c) => c in CATEGORY_COLOR)).replace(/</g, '\\u003c')}).forEach(function(c){ activeCategories[c] = true; });
    // Learned once per session: sample the first SHAPE_SAMPLE_TARGET
    // classifications after a face is detected, lock to the most frequent
    // one, then stop re-classifying -- matches the ported design (a face
    // briefly turning or a bad-angle frame shouldn't re-flip the shape
    // mid-session).
    var SHAPE_SAMPLE_TARGET = 20;
    var shapeSamples = [];
    var noseSamples = [];
    var lockedShape = null;
    var lockedNoseShape = null;
    var lastLabelsKey = null;

    function modeOf(samples){
      var counts = {};
      samples.forEach(function(x){ counts[x]=(counts[x]||0)+1; });
      var best=null, bestCount=0;
      Object.keys(counts).forEach(function(k){ if(counts[k]>bestCount){best=k;bestCount=counts[k];} });
      return best;
    }

    function ruleFor(category){
      if(!lockedShape) return null;
      var byShape = PLACEMENT_RULES[category];
      return byShape ? byShape[lockedShape] : null;
    }
    function noseRule(){
      return lockedNoseShape ? NOSE_CONTOUR_RULES[lockedNoseShape] : null;
    }
    // Nothing is sent until the shape locks in -- RN shows its own "learning
    // your face shape" message from the shapeLocked callback until then, so
    // there's no need for a placeholder label per (still-inactive) category.
    function maybeSendLabels(){
      if(!lockedShape) return;
      var items = [];
      Object.keys(activeCategories).forEach(function(cat){
        if(!activeCategories[cat]) return;
        var rule = ruleFor(cat);
        if(!rule) return;
        var text = rule.label;
        if(cat === 'contour'){
          var nr = noseRule();
          if(nr && nr.label) text += ' ' + nr.label;
        }
        items.push({ category:cat, label:text });
      });
      var key = JSON.stringify(items);
      if(key !== lastLabelsKey){
        lastLabelsKey = key;
        rnPost({type:'labels', items:items});
      }
    }

    waitForGlobals(15000, function(err){
      if(err){ setPill('Error: '+err.message); rnPost({type:'error',message:err.message}); return; }

      ctx = canvasEl.getContext('2d');

      var faceMesh = new window.FaceMesh({
        locateFile: function(f){
          return 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/'+f;
        }
      });
      faceMesh.setOptions({
        maxNumFaces:1, refineLandmarks:true,
        minDetectionConfidence:0.6, minTrackingConfidence:0.6
      });

      var faceDetected = false;
      faceMesh.onResults(function(results){
        var img = results.image;
        var W = img.width||videoEl.videoWidth||1280;
        var H = img.height||videoEl.videoHeight||720;
        if(canvasEl.width!==W||canvasEl.height!==H){
          canvasEl.width=W; canvasEl.height=H;
          ctx = canvasEl.getContext('2d');
        }
        ctx.clearRect(0,0,W,H);
        ctx.drawImage(img,0,0,W,H);

        if(results.multiFaceLandmarks&&results.multiFaceLandmarks.length>0){
          var lms = results.multiFaceLandmarks[0];
          if(!faceDetected){ faceDetected=true; setPill('Look natural, learning your face shape…',false); }

          if(!lockedShape){
            var s = classifyFaceShape(lms, W, H);
            if(s) shapeSamples.push(s);
            var n = classifyNoseShape(lms, W, H);
            if(n) noseSamples.push(n);
            if(shapeSamples.length >= SHAPE_SAMPLE_TARGET){
              lockedShape = modeOf(shapeSamples);
              lockedNoseShape = modeOf(noseSamples) || 'balanced';
              setPill('Guide is live',true);
              rnPost({type:'shapeLocked', shape:lockedShape, noseShape:lockedNoseShape});
            }
          }

          if(lockedShape){
            Object.keys(activeCategories).forEach(function(cat){
              if(!activeCategories[cat]) return;
              var rule = ruleFor(cat);
              if(rule) drawZones(ctx, lms, W, H, rule, cat);
              // Nose contour rides along with the contour category, keyed to
              // the classified nose shape rather than the face shape.
              if(cat === 'contour'){
                var nr = noseRule();
                if(nr && nr.zones.length) drawZones(ctx, lms, W, H, nr, cat);
              }
            });
          }
          maybeSendLabels();
        } else {
          if(faceDetected) setPill('Face lost, move closer',false);
        }
      });

      setPill('Starting camera…');
      var camera = new window.Camera(videoEl,{
        onFrame:async function(){ await faceMesh.send({image:videoEl}); },
        width:1280, height:720
      });
      camera.start().then(function(){
        rnPost({type:'ready'});
      }).catch(function(e){
        setPill('Camera error: '+e.message);
        rnPost({type:'error',message:e.message});
      });

      // ── RN → WebView message bus ────────────────────────────────────────────
      function handleMsg(event){
        var msg;
        try{ msg=JSON.parse(event.data||(event.nativeEvent&&event.nativeEvent.data)); }
        catch(e){return;}
        if(!msg) return;
        if(msg.type==='setCategory'){
          if(msg.active){ activeCategories[msg.category] = true; }
          else { delete activeCategories[msg.category]; }
          lastLabelsKey = null; // force re-send so RN's labels update immediately
          maybeSendLabels();
        } else if(msg.type==='capture'){
          var prevTransform = canvasEl.style.transform;
          canvasEl.style.transform = 'none';
          var dataUrl = canvasEl.toDataURL('image/jpeg',0.92);
          canvasEl.style.transform = prevTransform;
          rnPost({type:'captured', data:dataUrl});
        }
      }
      window.addEventListener('message',   handleMsg);
      document.addEventListener('message', handleMsg);
    });
  })();
  </script>
</body>
</html>`;
}

// ─── Component ───────────────────────────────────────────────────────────────

const TutorialWebView = forwardRef<TutorialWebViewRef, TutorialWebViewProps>(
  ({ initialCategories, onReady, onError, onShapeLocked, onLabels, onCaptured, style }, ref) => {
    const webViewRef = useRef<WebView>(null);

    const send = useCallback((payload: object) => {
      webViewRef.current?.injectJavaScript(
        `(function(){
          var e=new MessageEvent('message',{data:${JSON.stringify(JSON.stringify(payload))}});
          window.dispatchEvent(e);
        })();true;`
      );
    }, []);

    useImperativeHandle(ref, () => ({
      setCategory: (category: PlacementCategory, active: boolean) =>
        send({ type: 'setCategory', category, active }),
      capture: () => send({ type: 'capture' }),
    }));

    const handleMessage = useCallback(
      (event: WebViewMessageEvent) => {
        let msg: { type: string; [key: string]: any };
        try { msg = JSON.parse(event.nativeEvent.data); }
        catch { return; }
        switch (msg.type) {
          case 'ready':        onReady?.();                                     break;
          case 'error':        onError?.(msg.message as string);                break;
          case 'shapeLocked':  onShapeLocked?.(msg.shape as FaceShape, msg.noseShape as NoseShape); break;
          case 'labels':       onLabels?.(msg.items as TutorialLabelItem[]);    break;
          case 'captured':     onCaptured?.(msg.data as string);                break;
          default: break;
        }
      },
      [onReady, onError, onShapeLocked, onLabels, onCaptured]
    );

    // Built once at mount, deliberately not reactive to initialCategories
    // changes (see the prop's doc comment) -- rebuilding this string would
    // change `source.html` and reload the whole WebView/camera pipeline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const html = React.useMemo(() => buildTutorialHtml(initialCategories), []);

    return (
      <View style={[styles.container, style]}>
        <WebView
          ref={webViewRef}
          style={styles.webview}
          // Only our own generated HTML (origin = the cdn.jsdelivr.net
          // baseUrl) may load here, and navigation away is refused outright:
          // this WebView holds a live camera stream, so it must never be
          // steerable to an arbitrary URL.
          originWhitelist={['https://cdn.jsdelivr.net', 'about:*']}
          onShouldStartLoadWithRequest={(req) =>
            req.url.startsWith('https://cdn.jsdelivr.net') || req.url.startsWith('about:')
          }
          source={{ html, baseUrl: 'https://cdn.jsdelivr.net' }}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
          allowsFullscreenVideo={false}
          javaScriptEnabled
          domStorageEnabled
          {...({ allowsProtectedMedia: true } as any)}
          onMessage={handleMessage}
          onPermissionRequest={(e: any) => { e.nativeEvent.grant(e.nativeEvent.resources); }}
          onError={(syntheticEvent) => {
            onError?.(`WebView error: ${syntheticEvent.nativeEvent.description}`);
          }}
          onHttpError={(syntheticEvent) => {
            onError?.(`HTTP ${syntheticEvent.nativeEvent.statusCode}: ${syntheticEvent.nativeEvent.url}`);
          }}
        />
      </View>
    );
  }
);

TutorialWebView.displayName = 'TutorialWebView';
export default TutorialWebView;

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  webview:   { flex: 1, backgroundColor: '#000' },
});
