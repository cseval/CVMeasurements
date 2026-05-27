import cv2
import numpy as np

ARUCO_DICT = cv2.aruco.DICT_5X5_50
MARKER_ID  = 0
MARKER_CM  = 18.0  # printed size of the black square in cm

SKEW_WARN_THRESHOLD = 0.05  # warn if diagonals differ by more than 5%


def detect_marker(frame: np.ndarray) -> tuple[float, np.ndarray] | tuple[None, None]:
    """
    Detect the ArUco marker in frame and return (px_per_cm, corners).

    corners is a float32 array of shape (4, 2) in pixel coordinates,
    ordered top-left, top-right, bottom-right, bottom-left.
    Returns (None, None) if the target marker is not found.

    Scale is computed by averaging the four side lengths and both diagonals.
    Subpixel corner refinement is applied first. A warning is printed if the
    marker appears skewed (diagonal mismatch > 5%).
    """
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    detector = cv2.aruco.ArucoDetector(
        cv2.aruco.getPredefinedDictionary(ARUCO_DICT),
        cv2.aruco.DetectorParameters(),
    )
    corners, ids, _ = detector.detectMarkers(gray)

    if ids is None or len(ids) == 0:
        return None, None

    # Find the marker with the expected ID rather than blindly using index 0.
    target_idx = next(
        (i for i, mid in enumerate(ids.flatten()) if mid == MARKER_ID),
        None,
    )
    if target_idx is None:
        return None, None

    raw_corners = corners[target_idx]  # shape (1, 4, 2)

    # Subpixel refinement for more accurate corner locations.
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.01)
    refined = cv2.cornerSubPix(gray, raw_corners, (5, 5), (-1, -1), criteria)[0]

    # Check for perspective skew: a flat, square marker has equal diagonals.
    d1 = float(np.linalg.norm(refined[2] - refined[0]))
    d2 = float(np.linalg.norm(refined[3] - refined[1]))
    if abs(d1 - d2) / max(d1, d2) > SKEW_WARN_THRESHOLD:
        print(
            "WARNING: ArUco marker appears skewed "
            f"(diagonal mismatch {abs(d1 - d2) / max(d1, d2):.1%}). "
            "Ensure the marker lies flat and faces the camera directly."
        )

    # Scale from side lengths.
    side_px = float(np.mean([
        np.linalg.norm(refined[(i + 1) % 4] - refined[i]) for i in range(4)
    ]))
    side_px_per_cm = side_px / MARKER_CM

    # Scale from diagonals (spans the whole marker, less sensitive to print warp).
    diag_expected_cm = MARKER_CM * np.sqrt(2)
    diag_px_per_cm = float(np.mean([d1, d2])) / diag_expected_cm

    px_per_cm = float(np.mean([side_px_per_cm, diag_px_per_cm]))
    return px_per_cm, refined


def get_pixels_per_cm(frame: np.ndarray) -> float | None:
    """Convenience wrapper around detect_marker that returns only the scale."""
    px_per_cm, _ = detect_marker(frame)
    return px_per_cm
