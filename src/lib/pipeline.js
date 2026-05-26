// Port of pipeline.py — orchestrates marker detection, pose, hands, and measurements

import { detectMarker } from './opencv.js';
import { detectHandsVideo } from './mediapipe.js';
import { measureHeight, measureWingspan, measureHandWidth, PoseLM } from './measure.js';

const HAND_PADDING    = 0.3;
const MIN_HAND_CROP_PX = 400;

// Pose landmark index groups for hand crop bounding box
const HAND_ANCHOR_LMS = {
  right: [PoseLM.RIGHT_WRIST, PoseLM.RIGHT_INDEX, PoseLM.RIGHT_PINKY, PoseLM.RIGHT_THUMB],
  left:  [PoseLM.LEFT_WRIST,  PoseLM.LEFT_INDEX,  PoseLM.LEFT_PINKY,  PoseLM.LEFT_THUMB],
};

/**
 * Crop and upsample the hand region from a canvas using pose landmarks.
 * Returns { canvas, scale } where scale converts crop pixels back to original pixels,
 * or null if the crop region is invalid.
 */
function cropHand(sourceCanvas, poseLms, side) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const anchors = HAND_ANCHOR_LMS[side].map((i) => poseLms[i]);

  const xs   = anchors.map((lm) => lm.x);
  const ys   = anchors.map((lm) => lm.y);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));

  const x0 = Math.max(0, Math.floor((Math.min(...xs) - span * HAND_PADDING) * w));
  const x1 = Math.min(w, Math.ceil( (Math.max(...xs) + span * HAND_PADDING) * w));
  const y0 = Math.max(0, Math.floor((Math.min(...ys) - span * HAND_PADDING) * h));
  const y1 = Math.min(h, Math.ceil( (Math.max(...ys) + span * HAND_PADDING) * h));

  if (x1 <= x0 || y1 <= y0) return null;

  const cropW  = x1 - x0;
  const scale  = Math.max(MIN_HAND_CROP_PX, cropW) / cropW;
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width  = Math.round(cropW       * scale);
  cropCanvas.height = Math.round((y1 - y0)   * scale);

  cropCanvas
    .getContext('2d')
    .drawImage(sourceCanvas, x0, y0, x1 - x0, y1 - y0, 0, 0, cropCanvas.width, cropCanvas.height);

  return { canvas: cropCanvas, scale };
}

/**
 * Run the full measurement pipeline on a frozen canvas frame.
 *
 * @param {HTMLCanvasElement} canvas   - The captured frame
 * @param {object} poseResult          - Latest PoseLandmarkerResult from live loop
 * @param {object} handsResult         - Latest HandLandmarkerResult from live loop
 * @param {number} timestamp           - Current timestamp (ms) for VIDEO mode calls
 * @returns {{ results, warnings }}
 *   results: { pxPerCm, height_cm?, wingspan_cm?, hand_width_cm? }
 *   warnings: string[]
 */
export function runPipeline(canvas, poseResult, handsResult, timestamp) {
  const w = canvas.width;
  const h = canvas.height;
  const warnings = [];

  // 1. ArUco marker — hard fail
  const markerResult = detectMarker(canvas);
  if (!markerResult) {
    throw new Error(
      'ArUco marker not detected. Make sure the printed 20 cm marker is fully visible and flat against the wall.'
    );
  }
  const { pxPerCm, corners: markerCorners } = markerResult;

  const results = {
    pxPerCm:     Math.round(pxPerCm * 100) / 100,
    markerCorners,
  };

  // 2. Pose landmarks
  const poseLms = poseResult?.landmarks?.[0];
  if (!poseLms) {
    warnings.push('No pose detected — check that the full body is in frame.');
    return { results, warnings };
  }

  results.height_cm   = Math.round(measureHeight(poseLms, h, pxPerCm) * 10) / 10;
  results.wingspan_cm = Math.round(measureWingspan(poseLms, w, h, pxPerCm) * 10) / 10;

  // 3. Hand width — try full-image result first
  const allHandsLms = handsResult?.landmarks ?? [];

  if (allHandsLms.length > 0) {
    results.hand_width_cm = Math.round(
      measureHandWidth(allHandsLms[0], w, h, pxPerCm) * 10
    ) / 10;

    // Upgrade wingspan to middle fingertips when both hands visible
    if (allHandsLms.length >= 2) {
      results.wingspan_cm = Math.round(
        measureWingspan(poseLms, w, h, pxPerCm, allHandsLms) * 10
      ) / 10;
    }
  } else {
    // Fallback: crop + upsample each hand region and retry
    for (const side of ['right', 'left']) {
      const crop = cropHand(canvas, poseLms, side);
      if (!crop) continue;

      const cropResult = detectHandsVideo(crop.canvas, timestamp);
      if (cropResult?.landmarks?.length > 0) {
        const scaledPxPerCm = pxPerCm * crop.scale;
        results.hand_width_cm = Math.round(
          measureHandWidth(
            cropResult.landmarks[0],
            crop.canvas.width,
            crop.canvas.height,
            scaledPxPerCm
          ) * 10
        ) / 10;
        break;
      }
    }

    if (results.hand_width_cm == null) {
      warnings.push('Hand width could not be detected. Try better lighting or move hands closer.');
    }
  }

  return { results, warnings };
}
