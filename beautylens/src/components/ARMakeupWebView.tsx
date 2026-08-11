/**
 * ARMakeupWebView  v6
 *
 * Canvas 2D makeup renderer — no external SDK dependency.
 *
 * New in v6:
 *  • Camera resolution raised to 1280×720; FaceMesh confidence thresholds
 *    raised to 0.6 for more stable tracking.
 *  • Skin-tone sampling: samples forehead landmark every frame to compute
 *    a darkness score (0=light, 1=dark) used to scale multiply opacity so
 *    makeup reads clearly on all skin tones.
 *  • Lipstick: 3-pass renderer — adaptive-alpha base multiply and edge-depth
 *    liner stroke (both clipped to the lip ring so the mouth interior is
 *    never painted), plus multi-spot gloss (cupid's bow + lower-lip centre +
 *    corner gleams).
 *  • Eyeshadow: 5-zone renderer — deep lash-line band, mid-lid main colour,
 *    crease-definition ellipse, brow-bone highlight, deterministic 8-dot
 *    shimmer grid (no Math.random).
 *  • Blush: face-width-aware ellipse (landmarks 116/345) + diffusion halo pass.
 *  • Mascara: dedicated drawMascara renderer — thick lash line with shadow
 *    thickening and 8 individually angled lash strokes in a fan pattern.
 *  • Eyeliner: slightly thicker (3.2 px) with a soft glow pre-pass.
 *  • Foundation: second wide-radius (280 px) blending-halo pass.
 *  • dist2(a,b) helper added for Euclidean distance calculations.
 *  • extractColors({ category, url }[]) — tells the WebView to load each
 *    product image URL in a hidden canvas, sample the most-vibrant pixel,
 *    and post { type:'colorsExtracted', results:[{category,color}] } back.
 *    Requires no native rebuild — all JS/Canvas inside the WebView.
 *  • onColorsExtracted prop wires the result back to React Native.
 */

import React, { forwardRef, useImperativeHandle, useRef, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MakeupLayer {
  category: string;  // 'lipstick' | 'eyeshadow' | 'eyeliner' | 'mascara' | 'blush' | 'foundation'
  color: string;     // hex e.g. '#C2185B'
  finish?: 'matte' | 'shimmer' | 'glossy' | 'glitter';
  pattern?: number;
}

export interface ColorExtractItem {
  category: string;
  url: string;
}

export interface ColorExtractResult {
  category: string;
  color: string | null;   // null when extraction failed (CORS, load error, etc.)
}

export interface ARMakeupWebViewProps {
  layers: MakeupLayer[];
  onReady?: () => void;
  onCaptured?: (base64DataUrl: string) => void;
  onError?: (message: string) => void;
  /** Called when extractColors() results come back from the WebView */
  onColorsExtracted?: (results: ColorExtractResult[]) => void;
  style?: object;
}

export interface ARMakeupWebViewRef {
  capture(): void;
  apply(layer: MakeupLayer): void;
  clear(category: string): void;
  clearAll(): void;
  /** Ask the WebView to extract the dominant colour from each image URL */
  extractColors(items: ColorExtractItem[]): void;
}

// ─── Product resolver ────────────────────────────────────────────────────────

export function resolveLayer(productType: string, overrideColor?: string): MakeupLayer | null {
  const t = productType.toLowerCase().replace(/[\s\-_]+/g, '');
  if (/lipstick|lipgloss|lipbalm|lipliner|lip/.test(t))
    return { category: 'lipstick',   color: overrideColor ?? '#C2185B', finish: 'glossy'  };
  if (/eyeshadow/.test(t))
    return { category: 'eyeshadow',  color: overrideColor ?? '#7B1FA2', finish: 'shimmer' };
  if (/eyeliner/.test(t))
    return { category: 'eyeliner',   color: overrideColor ?? '#1A1A1A', finish: 'matte'   };
  if (/mascara/.test(t))
    return { category: 'mascara',    color: overrideColor ?? '#1A1A1A', finish: 'matte'   };
  if (/blush|bronzer/.test(t))
    return { category: 'blush',      color: overrideColor ?? '#E88FAE', finish: 'shimmer' };
  if (/highlighter/.test(t))
    return { category: 'blush',      color: overrideColor ?? '#F5E6A3', finish: 'glitter' };
  if (/foundation|powder|primer|concealer/.test(t))
    return { category: 'foundation', color: overrideColor ?? '#C8956C', finish: 'matte'   };
  return null;
}

// ─── HTML ────────────────────────────────────────────────────────────────────

function buildARHtml(layers: MakeupLayer[]): string {
  const layersJson = JSON.stringify(layers);

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
  <div id="pill">Loading AR…</div>

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

    // ── MediaPipe landmark index sets ─────────────────────────────────────────────
    var LIP_OUTER = [61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146];
    var LIP_INNER = [78,191,80,81,82,13,312,311,310,415,308,324,318,402,317,14,87,178,88,95];
    var L_LASH_TOP = [33,246,161,160,159,158,157,173,133];
    var R_LASH_TOP = [263,466,388,387,386,385,384,398,362];
    var L_LID = [33,246,161,160,159,158,157,173,133];
    var R_LID = [263,466,388,387,386,385,384,398,362];
    var BLUSH_L = [116,123,147,213,192,214,210,211,212,202,204,194];
    var BLUSH_R = [345,352,376,433,416,434,430,431,432,422,424,418];
    var FACE_OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,
                     397,365,379,378,400,377,152,148,176,149,150,136,
                     172,58,132,93,234,127,162,21,54,103,67,109];

    // ── Helpers ────────────────────────────────────────────────────
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
    function centroid(points){
      var sx=0,sy=0;
      for(var i=0;i<points.length;i++){sx+=points[i][0];sy+=points[i][1];}
      return [sx/points.length,sy/points.length];
    }
    function dist2(a, b){
      return Math.sqrt((a[0]-b[0])*(a[0]-b[0])+(a[1]-b[1])*(a[1]-b[1]));
    }
    // Adds one smoothed closed subpath without starting a new path (for compound paths).
    function addSmoothSubpath(ctx, points){
      if(points.length < 2) return;
      ctx.moveTo((points[0][0]+points[1][0])/2,(points[0][1]+points[1][1])/2);
      for(var i=1;i<points.length-1;i++){
        var mx=(points[i][0]+points[i+1][0])/2;
        var my=(points[i][1]+points[i+1][1])/2;
        ctx.quadraticCurveTo(points[i][0],points[i][1],mx,my);
      }
      var mx0=(points[points.length-1][0]+points[0][0])/2;
      var my0=(points[points.length-1][1]+points[0][1])/2;
      ctx.quadraticCurveTo(points[points.length-1][0],points[points.length-1][1],mx0,my0);
      ctx.closePath();
    }
    // Clips to the lip ring (outer boundary minus inner mouth opening) so the
    // mouth interior — teeth, tongue — is never painted, even when the mouth is open.
    function clipLipRing(ctx, outer, inner){
      ctx.beginPath();
      addSmoothSubpath(ctx, outer);
      addSmoothSubpath(ctx, inner);
      ctx.clip('evenodd');
    }

    // ── Color extraction helper ────────────────────────────────────────
    // Returns the most saturated mid-brightness pixel colour from raw RGBA data.
    // Skips near-black, near-white, and transparent pixels.
    function mostVibrantColor(data){
      var bestScore=0, bestR=180, bestG=80, bestB=80;
      for(var i=0;i<data.length;i+=4){
        var r=data[i],g=data[i+1],b=data[i+2],a=data[i+3];
        if(a<180) continue;
        var bright=(r+g+b)/3;
        if(bright<35||bright>230) continue;
        var max=Math.max(r,g,b), min=Math.min(r,g,b);
        var sat=max===0?0:(max-min)/max;
        var score=sat*(1-Math.abs(bright-135)/135);
        if(score>bestScore){bestScore=score;bestR=r;bestG=g;bestB=b;}
      }
      return '#'+bestR.toString(16).padStart(2,'0')
                +bestG.toString(16).padStart(2,'0')
                +bestB.toString(16).padStart(2,'0');
    }

    // ── Skin tone sampling (runs every frame before drawLayers) ─────────────
    // skinDark: 0 = light skin, 1 = dark skin
    var skinDark = 0;
    function sampleSkinTone(ctx, lms, W, H){
      try{
        var fx = Math.round(lms[10].x * W);
        var fy = Math.round(lms[10].y * H);
        var px = ctx.getImageData(fx, fy, 1, 1).data;
        var sr = px[0], sg = px[1], sb = px[2];
        skinDark = 1 - (sr + sg + sb) / (3 * 255);
      }catch(e){ skinDark = 0; }
    }

    // ── Per-category renderers ─────────────────────────────────────────────────────
    function drawLipstick(ctx, lms, W, H, rgb, finish){
      var outer = pts(lms, LIP_OUTER, W, H);
      var inner = pts(lms, LIP_INNER, W, H);
      var r = rgb[0], g = rgb[1], b = rgb[2];

      // Pass 1 — Base color, split across two passes. Multiply (depth/shadow)
      // alone reads as a flat sticker; a second soft-light pass breaks up that
      // flatness with texture-aware pigment. soft-light brightens wherever the
      // product colour's own channel is >128 (true for most lipstick reds), so
      // its alpha is kept low here specifically to avoid that whitening — this
      // is the one knob to raise/lower depending on how it reads.
      // Clipped to the lip ring so the mouth interior is never painted.
      ctx.save();
      clipLipRing(ctx, outer, inner);
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.6 + skinDark * 0.15;
      ctx.fillStyle = 'rgb('+r+','+g+','+b+')';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();

      ctx.save();
      clipLipRing(ctx, outer, inner);
      ctx.globalCompositeOperation = 'soft-light';
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = 'rgb('+r+','+g+','+b+')';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();

      // Pass 2 — Edge depth / lip liner effect
      ctx.save();
      clipLipRing(ctx, outer, inner);
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = 'rgb('+Math.round(r*0.55)+','+Math.round(g*0.55)+','+Math.round(b*0.55)+')';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      smoothPath(ctx, outer, true);
      ctx.stroke();
      ctx.restore();

      // Pass 3 — Gloss (glossy or shimmer finish only)
      if(finish === 'glossy' || finish === 'shimmer'){
        var cupid      = pts(lms, [0],   W, H)[0];
        var lowerC     = pts(lms, [17],  W, H)[0];
        var lowerShift = [lowerC[0], lowerC[1] - 4];
        var cornerL    = pts(lms, [61],  W, H)[0];
        var cornerR    = pts(lms, [291], W, H)[0];

        // Cupid's bow highlight
        ctx.save();
        clipLipRing(ctx, outer, inner);
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.1;
        var gCupid = ctx.createRadialGradient(cupid[0], cupid[1], 0, cupid[0], cupid[1], 14);
        gCupid.addColorStop(0, 'rgba(255,255,255,1)');
        gCupid.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gCupid;
        ctx.beginPath();
        ctx.arc(cupid[0], cupid[1], 14, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();

        // Lower lip centre highlight
        ctx.save();
        clipLipRing(ctx, outer, inner);
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.12;
        var gLower = ctx.createRadialGradient(lowerShift[0], lowerShift[1], 0, lowerShift[0], lowerShift[1], 18);
        gLower.addColorStop(0, 'rgba(255,255,255,1)');
        gLower.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gLower;
        ctx.beginPath();
        ctx.arc(lowerShift[0], lowerShift[1], 18, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();

        // Corner gleams
        var corners = [cornerL, cornerR];
        for(var ci=0; ci<corners.length; ci++){
          var corner = corners[ci];
          ctx.save();
          clipLipRing(ctx, outer, inner);
          ctx.globalCompositeOperation = 'screen';
          ctx.globalAlpha = 0.05;
          var gCorner = ctx.createRadialGradient(corner[0], corner[1], 0, corner[0], corner[1], 6);
          gCorner.addColorStop(0, 'rgba(255,255,255,1)');
          gCorner.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = gCorner;
          ctx.beginPath();
          ctx.arc(corner[0], corner[1], 6, 0, Math.PI*2);
          ctx.fill();
          ctx.restore();
        }
      }
    }

    function drawEyeshadow(ctx, lms, W, H, rgb, finish){
      var r = rgb[0], g = rgb[1], b = rgb[2];
      var eyeGroups = [L_LASH_TOP, R_LASH_TOP];
      for(var eg=0; eg<eyeGroups.length; eg++){
        var indices  = eyeGroups[eg];
        var lashPts  = pts(lms, indices, W, H);
        var inner    = lashPts[0];
        var outer    = lashPts[lashPts.length-1];
        var eyeW     = dist2(inner, outer);
        var lidH     = eyeW * 0.48;
        var lashMidY = lashPts.reduce(function(s,p){ return s+p[1]; }, 0) / lashPts.length;
        var lashTopY = lashPts.reduce(function(m,p){ return p[1]<m[1]?p:m; })[1];

        // Build lid path at a given vertical fraction (1.0 = full lidH)
        function lidPath(fraction){
          var frac   = (fraction === undefined) ? 1 : fraction;
          var h      = lidH * frac;
          var scaledOuterTop = [outer[0]+eyeW*0.06,   outer[1]-h*0.82];
          var scaledCentTop  = [(inner[0]+outer[0])/2, lashTopY - h];
          var scaledInnerTop = [inner[0],              inner[1]-h*0.55];
          ctx.beginPath();
          ctx.moveTo(inner[0], inner[1]);
          for(var i=1;i<lashPts.length-1;i++){
            var mx=(lashPts[i][0]+lashPts[i+1][0])/2;
            var my=(lashPts[i][1]+lashPts[i+1][1])/2;
            ctx.quadraticCurveTo(lashPts[i][0],lashPts[i][1],mx,my);
          }
          ctx.lineTo(outer[0], outer[1]);
          ctx.quadraticCurveTo(scaledOuterTop[0],scaledOuterTop[1],scaledCentTop[0],scaledCentTop[1]);
          ctx.quadraticCurveTo(scaledInnerTop[0],scaledInnerTop[1]+h*0.15,scaledInnerTop[0],scaledInnerTop[1]);
          ctx.closePath();
        }

        // Zone 1 — Deep lash line (darkest, 40% of lidH)
        ctx.save();
        lidPath(0.4);
        ctx.clip();
        var grad1 = ctx.createLinearGradient(0, lashMidY, 0, lashMidY - lidH*0.4);
        grad1.addColorStop(0, 'rgba('+Math.round(r*0.6)+','+Math.round(g*0.6)+','+Math.round(b*0.6)+',1)');
        grad1.addColorStop(1, 'rgba('+Math.round(r*0.6)+','+Math.round(g*0.6)+','+Math.round(b*0.6)+',0)');
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = grad1;
        lidPath(0.4);
        ctx.fill();
        ctx.restore();

        // Zone 2 — Mid lid (main colour, full height)
        ctx.save();
        lidPath(1.0);
        ctx.clip();
        var grad2 = ctx.createLinearGradient(0, lashMidY + lidH*0.3, 0, lashMidY - lidH);
        grad2.addColorStop(0, 'rgba('+r+','+g+','+b+',1)');
        grad2.addColorStop(1, 'rgba('+r+','+g+','+b+',0)');
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = grad2;
        lidPath(1.0);
        ctx.fill();
        ctx.restore();

        // Zone 3 — Crease definition narrow ellipse at ~65% of lidH
        var creaseX = (inner[0]+outer[0])/2;
        var creaseY = lashMidY - lidH*0.65;
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(creaseX, creaseY, eyeW*0.4, lidH*0.22, 0, 0, Math.PI*2);
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = 'rgb('+Math.round(r*0.5)+','+Math.round(g*0.5)+','+Math.round(b*0.5)+')';
        ctx.fill();
        ctx.restore();

        // Zone 4 — Brow bone highlight (subtle brightening above crease)
        var browX = (inner[0]+outer[0])/2;
        var browY = lashMidY - lidH*1.1;
        var browRad = lidH*0.3;
        ctx.save();
        var browGrad = ctx.createRadialGradient(browX, browY, 0, browX, browY, browRad);
        browGrad.addColorStop(0, 'rgba(255,255,255,1)');
        browGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = browGrad;
        ctx.beginPath();
        ctx.arc(browX, browY, browRad, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();

        // Zone 5 — Shimmer / glitter
        if(finish === 'shimmer' || finish === 'glitter'){
          // Radial shimmer glow
          ctx.save();
          lidPath(1.0);
          ctx.clip();
          ctx.globalCompositeOperation = 'screen';
          ctx.globalAlpha = 0.32;
          var cx2 = (inner[0]+outer[0])/2;
          var sg = ctx.createRadialGradient(cx2, lashMidY-lidH*0.25, 1, cx2, lashMidY-lidH*0.25, lidH*0.65);
          sg.addColorStop(0, 'rgba(255,255,255,0.9)');
          sg.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = sg;
          lidPath(1.0);
          ctx.fill();
          ctx.restore();

          // 8 deterministic shimmer dots at predictable grid positions
          var bbMinX = Math.min(inner[0], outer[0]);
          var bbMaxX = Math.max(inner[0], outer[0]);
          var bbMinY = lashMidY - lidH;
          var bbW2   = bbMaxX - bbMinX;
          var bbH2   = lidH;
          // Grid: xFracs [0.25, 0.5, 0.75] x yFracs [0.3, 0.6] = 6 dots
          // + extras [0.1, 0.4] and [0.9, 0.4] = 8 dots total
          var dotFracs = [
            [0.25,0.3],[0.25,0.6],
            [0.5, 0.3],[0.5, 0.6],
            [0.75,0.3],[0.75,0.6],
            [0.1, 0.4],[0.9, 0.4]
          ];
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          ctx.globalAlpha = 0.7;
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          for(var di=0; di<dotFracs.length; di++){
            var dx = bbMinX + dotFracs[di][0]*bbW2;
            var dy = bbMinY + dotFracs[di][1]*bbH2;
            ctx.beginPath();
            ctx.arc(dx, dy, 1.5, 0, Math.PI*2);
            ctx.fill();
          }
          ctx.restore();
        }
      }
    }

    function drawEyeliner(ctx, lms, W, H, rgb){
      var r = rgb[0], g = rgb[1], b = rgb[2];
      var lidGroups = [L_LID, R_LID];
      for(var li=0; li<lidGroups.length; li++){
        var line = pts(lms, lidGroups[li], W, H);

        // Glow pre-pass (soft halo)
        ctx.save();
        smoothPath(ctx, line, false);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.12;
        ctx.strokeStyle = 'rgb('+r+','+g+','+b+')';
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = 'rgba('+r+','+g+','+b+',0.6)';
        ctx.shadowBlur = 2;
        ctx.stroke();
        ctx.restore();

        // Main liner line
        ctx.save();
        smoothPath(ctx, line, false);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.88;
        ctx.strokeStyle = 'rgb('+r+','+g+','+b+')';
        ctx.lineWidth = 3.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.restore();
      }
    }

    function drawMascara(ctx, lms, W, H, rgb){
      var r = rgb[0], g = rgb[1], b = rgb[2];
      var lidGroups = [L_LID, R_LID];
      for(var li=0; li<lidGroups.length; li++){
        var lashPts = pts(lms, lidGroups[li], W, H);
        var inner   = lashPts[0];
        var outer   = lashPts[lashPts.length-1];
        var eyeW    = dist2(inner, outer);

        // Thick lash line with shadow for thickening
        ctx.save();
        smoothPath(ctx, lashPts, false);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.92;
        ctx.strokeStyle = 'rgb('+r+','+g+','+b+')';
        ctx.lineWidth = 5.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 3;
        ctx.stroke();
        ctx.restore();

        // 8 individual lash strokes radiating upward in a fan
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.75;
        ctx.strokeStyle = 'rgb('+r+','+g+','+b+')';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        for(var i=0; i<8; i++){
          var lmIdx  = Math.round(i * (lashPts.length-1) / 7);
          var baseX  = lashPts[lmIdx][0];
          var baseY  = lashPts[lmIdx][1];
          var angle  = -Math.PI/2 + (i - 3.5) * 0.12;
          var len    = eyeW * 0.04;
          ctx.beginPath();
          ctx.moveTo(baseX, baseY);
          ctx.lineTo(baseX + Math.cos(angle)*len, baseY + Math.sin(angle)*len);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    function drawBlush(ctx, lms, W, H, rgb, finish){
      var r = rgb[0], g = rgb[1], b = rgb[2];
      // Face-width-aware scaling via landmarks 116 (left cheek) and 345 (right cheek)
      var pt116      = [lms[116].x*W, lms[116].y*H];
      var pt345      = [lms[345].x*W, lms[345].y*H];
      var faceWidth  = dist2(pt116, pt345);
      var blushGroups = [BLUSH_L, BLUSH_R];

      for(var bi=0; bi<blushGroups.length; bi++){
        var zone = pts(lms, blushGroups[bi], W, H);
        var bc   = centroid(zone);
        var rx   = faceWidth * 0.19;
        var ry   = faceWidth * 0.12;

        // Pass 1 — Main colour fill
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(bc[0], bc[1], rx, ry, -0.15, 0, Math.PI*2);
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = finish === 'shimmer' ? 0.35 : 0.27;
        var bg = ctx.createRadialGradient(bc[0], bc[1], 0, bc[0], bc[1], rx);
        bg.addColorStop(0, 'rgba('+r+','+g+','+b+',1)');
        bg.addColorStop(1, 'rgba('+r+','+g+','+b+',0)');
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.restore();

        // Pass 2 — Wider diffusion halo
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(bc[0], bc[1], rx*1.5, ry*1.5, -0.15, 0, Math.PI*2);
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.10;
        var bg2 = ctx.createRadialGradient(bc[0], bc[1], 0, bc[0], bc[1], rx*1.5);
        bg2.addColorStop(0, 'rgba('+r+','+g+','+b+',1)');
        bg2.addColorStop(1, 'rgba('+r+','+g+','+b+',0)');
        ctx.fillStyle = bg2;
        ctx.fill();
        ctx.restore();
      }
    }

    function drawFoundation(ctx, lms, W, H, rgb){
      var r = rgb[0], g = rgb[1], b = rgb[2];
      var oval = pts(lms, FACE_OVAL, W, H);
      var fc   = centroid(oval);

      // Primary pass
      ctx.save();
      smoothPath(ctx, oval, true);
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.22;
      var fg = ctx.createRadialGradient(fc[0], fc[1], 0, fc[0], fc[1], 200);
      fg.addColorStop(0, 'rgba('+r+','+g+','+b+',1)');
      fg.addColorStop(1, 'rgba('+r+','+g+','+b+',0)');
      ctx.fillStyle = fg;
      ctx.fill();
      ctx.restore();

      // Second pass — wider blending halo for natural falloff
      ctx.save();
      smoothPath(ctx, oval, true);
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.08;
      var fg2 = ctx.createRadialGradient(fc[0], fc[1], 0, fc[0], fc[1], 280);
      fg2.addColorStop(0, 'rgba('+r+','+g+','+b+',1)');
      fg2.addColorStop(1, 'rgba('+r+','+g+','+b+',0)');
      ctx.fillStyle = fg2;
      ctx.fill();
      ctx.restore();
    }

    function applyLayer(ctx, layer, lms, W, H){
      var rgb = hexToRgb(layer.color);
      var fin = layer.finish || 'matte';
      switch(layer.category){
        case 'lipstick':   drawLipstick(ctx,lms,W,H,rgb,fin);   break;
        case 'eyeshadow':  drawEyeshadow(ctx,lms,W,H,rgb,fin);  break;
        case 'eyeliner':   drawEyeliner(ctx,lms,W,H,rgb);        break;
        case 'mascara':    drawMascara(ctx,lms,W,H,rgb);         break;
        case 'blush':      drawBlush(ctx,lms,W,H,rgb,fin);       break;
        case 'foundation': drawFoundation(ctx,lms,W,H,rgb);      break;
      }
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

    var videoEl    = document.getElementById('cam');
    var canvasEl   = document.getElementById('out');
    var activeLayers = ${layersJson};
    var ctx = null;

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
          if(!faceDetected){ faceDetected=true; setPill('Look natural, AR is live',true); }
          sampleSkinTone(ctx, lms, W, H);
          activeLayers.forEach(function(layer){ applyLayer(ctx,layer,lms,W,H); });
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
        setPill('Detecting face…');
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

        switch(msg.type){
          case 'apply': {
            // Update colour if layer exists, otherwise add it
            var found = false;
            activeLayers = activeLayers.map(function(l){
              if(l.category===msg.category){
                found=true;
                return {
                  category:msg.category,
                  color:(msg.opts&&msg.opts.color)||l.color,
                  finish:(msg.opts&&msg.opts.finish)||l.finish
                };
              }
              return l;
            });
            if(!found) activeLayers.push({
              category:msg.category,
              color:(msg.opts&&msg.opts.color)||'#C2185B',
              finish:(msg.opts&&msg.opts.finish)||'matte'
            });
            break;
          }
          case 'clear':
            activeLayers = activeLayers.filter(function(l){ return l.category!==msg.category; });
            break;
          case 'clearAll':
            activeLayers = [];
            break;
          case 'capture': {
            var prev = canvasEl.style.transform;
            canvasEl.style.transform = 'none';
            var dataUrl = canvasEl.toDataURL('image/jpeg',0.92);
            canvasEl.style.transform = prev;
            rnPost({type:'captured',data:dataUrl});
            break;
          }
          case 'extractColors': {
            // Load each product image URL into a hidden canvas, sample most-vibrant pixel.
            // crossOrigin='anonymous' is required for getImageData; falls back gracefully
            // if CORS is blocked (returns color:null for that item).
            var items   = msg.items;  // [{ category, url }]
            if(!items||!items.length) break;
            var results = [];
            var pending = items.length;
            function finishExtract(){
              if(pending===0) rnPost({type:'colorsExtracted',results:results});
            }
            items.forEach(function(item){
              var img2 = new Image();
              img2.crossOrigin = 'anonymous';
              img2.onload = function(){
                var color = null;
                try{
                  var tmp  = document.createElement('canvas');
                  tmp.width=40; tmp.height=40;
                  var ctx2 = tmp.getContext('2d');
                  ctx2.drawImage(img2,0,0,40,40);
                  var d = ctx2.getImageData(0,0,40,40).data;
                  color = mostVibrantColor(d);
                }catch(e){ /* canvas tainted by CORS — keep null */ }
                results.push({category:item.category,color:color});
                pending--;
                finishExtract();
              };
              img2.onerror = function(){
                results.push({category:item.category,color:null});
                pending--;
                finishExtract();
              };
              img2.src = item.url;
            });
            break;
          }
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

const ARMakeupWebView = forwardRef<ARMakeupWebViewRef, ARMakeupWebViewProps>(
  ({ layers, onReady, onCaptured, onError, onColorsExtracted, style }, ref) => {
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
      capture:  () => send({ type: 'capture' }),
      apply:    (layer: MakeupLayer) =>
        send({ type: 'apply', category: layer.category, opts: { color: layer.color, finish: layer.finish } }),
      clear:    (category: string) => send({ type: 'clear', category }),
      clearAll: ()                  => send({ type: 'clearAll' }),
      extractColors: (items: ColorExtractItem[]) =>
        send({ type: 'extractColors', items }),
    }));

    const handleMessage = useCallback(
      (event: WebViewMessageEvent) => {
        let msg: { type: string; [key: string]: any };
        try { msg = JSON.parse(event.nativeEvent.data); }
        catch { return; }
        switch (msg.type) {
          case 'ready':           onReady?.();                                            break;
          case 'captured':        onCaptured?.(msg.data as string);                      break;
          case 'error':           onError?.(msg.message as string);                      break;
          case 'colorsExtracted': onColorsExtracted?.(msg.results as ColorExtractResult[]); break;
          default: break;
        }
      },
      [onReady, onCaptured, onError, onColorsExtracted]
    );

    const html = buildARHtml(layers);

    return (
      <View style={[styles.container, style]}>
        <WebView
          ref={webViewRef}
          style={styles.webview}
          originWhitelist={['*']}
          source={{ html, baseUrl: 'https://cdn.jsdelivr.net' }}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
          allowsFullscreenVideo={false}
          javaScriptEnabled
          domStorageEnabled
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

ARMakeupWebView.displayName = 'ARMakeupWebView';
export default ARMakeupWebView;

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  webview:   { flex: 1, backgroundColor: '#000' },
});
