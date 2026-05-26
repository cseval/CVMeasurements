// Port of measure.py — pure math, no DOM dependencies

const HEAD_OFFSET_RATIO = 0.13; // nose sits ~13% below crown (empirically derived)

// MediaPipe Pose landmark indices (identical between Python and JS)
const PoseLM = {
  NOSE:        0,
  LEFT_WRIST:  15,
  RIGHT_WRIST: 16,
  LEFT_PINKY:  17,
  RIGHT_PINKY: 18,
  LEFT_INDEX:  19,
  RIGHT_INDEX: 20,
  LEFT_THUMB:  21,
  RIGHT_THUMB: 22,
  LEFT_HEEL:   29,
  RIGHT_HEEL:  30,
};

// MediaPipe Hand landmark indices
const HandLM = {
  MIDDLE_TIP: 12, // longest finger — used for wingspan endpoint
  INDEX_MCP:   5, // knuckle at base of index finger
  PINKY_MCP:  17, // knuckle at base of pinky
};

function pxDist(a, b, w, h) {
  const dx = (a.x - b.x) * w;
  const dy = (a.y - b.y) * h;
  return Math.hypot(dx, dy);
}

/**
 * Vertical distance from estimated crown to lower heel, in cm.
 * poseLms: array of NormalizedLandmark from MediaPipe Tasks Vision
 */
export function measureHeight(poseLms, frameH, pxPerCm) {
  const nose      = poseLms[PoseLM.NOSE];
  const leftHeel  = poseLms[PoseLM.LEFT_HEEL];
  const rightHeel = poseLms[PoseLM.RIGHT_HEEL];

  const heelY  = Math.max(leftHeel.y, rightHeel.y);
  const span   = heelY - nose.y;
  const crownY = nose.y - span * HEAD_OFFSET_RATIO;

  return ((heelY - crownY) * frameH) / pxPerCm;
}

/**
 * Returns [leftPt, rightPt] pixel coords for wingspan endpoints.
 * Uses middle fingertips from hands model when both hands detected,
 * falls back to pose index fingertip landmarks.
 * "left/right" = image-left and image-right.
 */
export function wingspanTips(poseLms, frameW, frameH, allHandsLms) {
  if (allHandsLms && allHandsLms.length >= 2) {
    const tips = allHandsLms.map((hlm) => {
      const tip = hlm[HandLM.MIDDLE_TIP];
      return [Math.round(tip.x * frameW), Math.round(tip.y * frameH)];
    });
    tips.sort((a, b) => a[0] - b[0]);
    return [tips[0], tips[tips.length - 1]];
  }

  const li = poseLms[PoseLM.LEFT_INDEX];
  const ri = poseLms[PoseLM.RIGHT_INDEX];
  const ptA = [Math.round(li.x * frameW), Math.round(li.y * frameH)];
  const ptB = [Math.round(ri.x * frameW), Math.round(ri.y * frameH)];
  return ptA[0] < ptB[0] ? [ptA, ptB] : [ptB, ptA];
}

/**
 * Fingertip-to-fingertip distance in cm.
 */
export function measureWingspan(poseLms, frameW, frameH, pxPerCm, allHandsLms) {
  const [leftPt, rightPt] = wingspanTips(poseLms, frameW, frameH, allHandsLms);
  return Math.hypot(rightPt[0] - leftPt[0], rightPt[1] - leftPt[1]) / pxPerCm;
}

/**
 * Index-MCP to pinky-MCP distance in cm (knuckle width across palm).
 */
export function measureHandWidth(handLms, frameW, frameH, pxPerCm) {
  return pxDist(handLms[HandLM.INDEX_MCP], handLms[HandLM.PINKY_MCP], frameW, frameH) / pxPerCm;
}

// Expose indices needed by pipeline.js for hand cropping
export { PoseLM, HandLM };
