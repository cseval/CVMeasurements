import cv2
import numpy as np

ARUCO_DICT = cv2.aruco.DICT_5X5_50
MARKER_ID  = 0
MARKER_CM  = 20.0  # printed size of the black square in cm

SKEW_WARN_THRESHOLD = 0.05  # warn if diagonals differ by more than 5%


def _scale_from_corners(refined: np.ndarray) -> float:
    """Compute px_per_cm from one refined (4, 2) marker corner array."""
    d1 = float(np.linalg.norm(refined[2] - refined[0]))
    d2 = float(np.linalg.norm(refined[3] - refined[1]))
    if abs(d1 - d2) / max(d1, d2) > SKEW_WARN_THRESHOLD:
        print(
            "WARNING: ArUco marker appears skewed "
            f"(diagonal mismatch {abs(d1 - d2) / max(d1, d2):.1%}). "
            "Ensure the marker lies flat and faces the camera directly."
        )
    side_px = float(np.mean([
        np.linalg.norm(refined[(i + 1) % 4] - refined[i]) for i in range(4)
    ]))
    diag_expected_cm = MARKER_CM * np.sqrt(2)
    return float(np.mean([
        side_px / MARKER_CM,
        np.mean([d1, d2]) / diag_expected_cm,
    ]))


def detect_marker(frame: np.ndarray) -> tuple[float, np.ndarray] | tuple[None, None]:
    """
    Detect all ArUco markers with MARKER_ID in frame.

    Returns (px_per_cm, corners) where px_per_cm is averaged across all
    detected instances and corners are from the first detected marker.
    Returns (None, None) if no target marker is found.
    """
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    detector = cv2.aruco.ArucoDetector(
        cv2.aruco.getPredefinedDictionary(ARUCO_DICT),
        cv2.aruco.DetectorParameters(),
    )
    corners, ids, _ = detector.detectMarkers(gray)

    if ids is None or len(ids) == 0:
        return None, None

    target_indices = [i for i, mid in enumerate(ids.flatten()) if mid == MARKER_ID]
    if not target_indices:
        return None, None

    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.01)
    scales = []
    all_refined = []

    for idx in target_indices:
        refined = cv2.cornerSubPix(gray, corners[idx], (5, 5), (-1, -1), criteria)[0]
        scales.append(_scale_from_corners(refined))
        all_refined.append(refined)

    px_per_cm = float(np.mean(scales))
    return px_per_cm, all_refined


def get_pixels_per_cm(frame: np.ndarray) -> float | None:
    """Convenience wrapper around detect_marker that returns only the scale."""
    px_per_cm, _ = detect_marker(frame)
    return px_per_cm
