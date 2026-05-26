// Port of calibrate.py — ArUco marker detection via OpenCV.js (loaded from CDN)

const MARKER_ID = 0;
const MARKER_CM = 20.0;
const SKEW_WARN_THRESHOLD = 0.05;

export function waitForOpenCV() {
  return new Promise((resolve) => {
    if (window._opencvReady && window.cv?.Mat) {
      resolve();
      return;
    }
    window.addEventListener('opencv-loaded', () => resolve(), { once: true });
  });
}

export function isOpenCVReady() {
  return !!(window._opencvReady && window.cv?.Mat);
}

/**
 * Detect the ArUco marker in a canvas element.
 * Returns { pxPerCm, corners: [[x,y]×4] } or null if not found.
 * Corners are ordered: top-left, top-right, bottom-right, bottom-left.
 */
export function detectMarker(canvas) {
  const cv = window.cv;
  if (!cv?.Mat) return null;

  let src, gray, corners, ids, rejected;
  try {
    src = cv.imread(canvas);
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    const dict = cv.getPredefinedDictionary(cv.aruco_DICT_5X5_50);
    const params = new cv.aruco_DetectorParameters();
    const detector = new cv.aruco_ArucoDetector(dict, params);

    corners = new cv.MatVector();
    ids = new cv.Mat();
    rejected = new cv.MatVector();
    detector.detectMarkers(gray, corners, ids, rejected);

    detector.delete();
    dict.delete();
    params.delete();

    if (ids.rows === 0) return null;

    // Find the target marker ID
    let targetIdx = -1;
    for (let i = 0; i < ids.rows; i++) {
      if (ids.intAt(i, 0) === MARKER_ID) {
        targetIdx = i;
        break;
      }
    }
    if (targetIdx === -1) return null;

    // corners[i] is a Mat with data32F: [x0,y0, x1,y1, x2,y2, x3,y3]
    const corner = corners.get(targetIdx);
    const d = corner.data32F;
    const pts = [
      [d[0], d[1]],
      [d[2], d[3]],
      [d[4], d[5]],
      [d[6], d[7]],
    ];
    corner.delete();

    // Skew check: a flat square marker has equal diagonals
    const d1 = Math.hypot(pts[2][0] - pts[0][0], pts[2][1] - pts[0][1]);
    const d2 = Math.hypot(pts[3][0] - pts[1][0], pts[3][1] - pts[1][1]);
    const skew = Math.abs(d1 - d2) / Math.max(d1, d2);
    if (skew > SKEW_WARN_THRESHOLD) {
      console.warn(
        `ArUco marker skewed ${(skew * 100).toFixed(1)}% — keep it flat and facing the camera.`
      );
    }

    // Scale from side lengths
    let sidePx = 0;
    for (let i = 0; i < 4; i++) {
      const a = pts[i], b = pts[(i + 1) % 4];
      sidePx += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    sidePx /= 4;
    const sidePxPerCm = sidePx / MARKER_CM;

    // Scale from diagonals (less sensitive to print warp)
    const diagExpectedCm = MARKER_CM * Math.sqrt(2);
    const diagPxPerCm = ((d1 + d2) / 2) / diagExpectedCm;

    const pxPerCm = (sidePxPerCm + diagPxPerCm) / 2;
    return { pxPerCm, corners: pts };
  } finally {
    src?.delete();
    gray?.delete();
    corners?.delete();
    ids?.delete();
    rejected?.delete();
  }
}
