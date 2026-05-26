"""
Single-photo measurement pipeline.

Photo setup:
  - Stand in a T-pose (arms extended horizontally, hands flat, fingers together,
    palms facing the camera)
  - Tape the printed ArUco marker to the wall at wrist height beside you
  - Camera at chest height, far enough back that your full body fits in frame
  - Keep the marker flat and facing the lens directly (no tilt)

Usage:
    python pipeline.py <image_path>

Example:
    python pipeline.py samples/tpose.jpg
"""

import argparse
import cv2
import mediapipe.python.solutions.pose  as mp_pose
import mediapipe.python.solutions.hands as mp_hands
import numpy as np
from pathlib import Path

from calibrate  import detect_marker
from measure    import measure_height, measure_wingspan, measure_hand_width, wingspan_tips
from visualize  import draw_diagnostics

POSE_CONF        = 0.7
HAND_CONF        = 0.5
MIN_HAND_CROP_PX = 400   # upsample hand crop to this size for better detection
HAND_PADDING     = 0.3   # fractional padding around hand bounding box

PoseLM = mp_pose.PoseLandmark


def _load_image(path: str) -> np.ndarray:
    """Load JPEG, PNG, or HEIC — returns a BGR numpy array."""
    if Path(path).suffix.lower() in (".heic", ".heif"):
        from pillow_heif import register_heif_opener
        from PIL import Image
        register_heif_opener()
        pil_img = Image.open(path).convert("RGB")
        return cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
    frame = cv2.imread(path)
    if frame is None:
        raise FileNotFoundError(f"Could not read image: {path}")
    return frame


def _crop_hand(frame: np.ndarray, pose_lms, side: str = "right"):
    """
    Crop and upsample the hand region using pose landmarks.
    Returns (crop_rgb, scale_factor) where scale_factor converts crop pixels
    back to original-image pixels (crop_px / scale_factor = original_px).
    """
    h, w = frame.shape[:2]

    if side == "right":
        anchors = [PoseLM.RIGHT_WRIST, PoseLM.RIGHT_INDEX,
                   PoseLM.RIGHT_PINKY, PoseLM.RIGHT_THUMB]
    else:
        anchors = [PoseLM.LEFT_WRIST, PoseLM.LEFT_INDEX,
                   PoseLM.LEFT_PINKY, PoseLM.LEFT_THUMB]

    xs = [pose_lms[lm].x for lm in anchors]
    ys = [pose_lms[lm].y for lm in anchors]
    span = max(max(xs) - min(xs), max(ys) - min(ys))

    x0 = max(0, int((min(xs) - span * HAND_PADDING) * w))
    x1 = min(w, int((max(xs) + span * HAND_PADDING) * w))
    y0 = max(0, int((min(ys) - span * HAND_PADDING) * h))
    y1 = min(h, int((max(ys) + span * HAND_PADDING) * h))

    crop = frame[y0:y1, x0:x1]
    if crop.size == 0:
        return None, None

    crop_w = x1 - x0
    target = max(MIN_HAND_CROP_PX, crop_w)
    scale  = target / crop_w
    resized = cv2.resize(crop, (0, 0), fx=scale, fy=scale,
                         interpolation=cv2.INTER_CUBIC)
    rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
    return rgb, scale


def _hand_width_from_crop(frame: np.ndarray, pose_lms,
                           px_per_cm: float) -> tuple:
    """
    Try MediaPipe Hands on a cropped+upsampled hand region.
    Returns (width_cm, source_label) or (None, None) on failure.
    """
    for side in ("right", "left"):
        crop_rgb, scale = _crop_hand(frame, pose_lms, side)
        if crop_rgb is None:
            continue

        crop_h, crop_w = crop_rgb.shape[:2]
        with mp_hands.Hands(
            static_image_mode=True,
            max_num_hands=1,
            min_detection_confidence=HAND_CONF,
        ) as hands:
            out = hands.process(crop_rgb)
            if out.multi_hand_landmarks:
                width_cm = measure_hand_width(
                    out.multi_hand_landmarks[0],
                    crop_w, crop_h,
                    px_per_cm * scale   # scale px/cm up to match the upsampled crop
                )
                return round(width_cm, 1), f"MediaPipe Hands (cropped {side} hand)"

    return None, None


def run(image_path: str, debug: bool = False) -> tuple[dict, str | None]:
    frame = _load_image(image_path)
    h, w  = frame.shape[:2]
    rgb   = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    px_per_cm, marker_corners = detect_marker(frame)
    if px_per_cm is None:
        raise RuntimeError(
            "ArUco marker not detected.\n"
            "  - Run generate_marker.py to create marker/marker_20cm.png\n"
            "  - Print it so the black square is exactly 20 cm x 20 cm\n"
            "  - Place it beside you at wrist height, facing the camera flat"
        )

    results           = {"px_per_cm": round(px_per_cm, 2)}
    hand_width_source = None
    pose_lms          = None
    hand_lms          = None
    all_hands_lms     = None

    # Pose: height + wingspan (wingspan may be upgraded below if hands found)
    with mp_pose.Pose(
        static_image_mode=True,
        model_complexity=2,
        min_detection_confidence=POSE_CONF,
    ) as pose:
        out = pose.process(rgb)
        if out.pose_landmarks is None:
            print("WARNING: No pose detected -- check that your full body is in frame.")
        else:
            pose_lms = out.pose_landmarks.landmark
            results["height_cm"]   = round(measure_height(pose_lms, h, px_per_cm), 1)
            results["wingspan_cm"] = round(measure_wingspan(pose_lms, w, h, px_per_cm), 1)

    # Hands: crop-based detection, no pose fallback
    if pose_lms is not None:
        # First try full-image detection (works if hands are large enough)
        with mp_hands.Hands(
            static_image_mode=True,
            max_num_hands=2,
            min_detection_confidence=HAND_CONF,
        ) as hands:
            out = hands.process(rgb)
            if out.multi_hand_landmarks:
                all_hands_lms = out.multi_hand_landmarks
                hand_lms      = all_hands_lms[0]
                results["hand_width_cm"] = round(
                    measure_hand_width(hand_lms, w, h, px_per_cm), 1
                )
                hand_width_source = "MediaPipe Hands (full image)"

                # Upgrade wingspan to hands-model middle fingertips when both
                # hands are visible -- more accurate than pose index landmarks.
                if len(all_hands_lms) >= 2:
                    results["wingspan_cm"] = round(
                        measure_wingspan(pose_lms, w, h, px_per_cm, all_hands_lms), 1
                    )

        # Fall back to cropped detection if full-image failed
        if "hand_width_cm" not in results:
            width_cm, source = _hand_width_from_crop(frame, pose_lms, px_per_cm)
            if width_cm is not None:
                results["hand_width_cm"] = width_cm
                hand_width_source = source
            else:
                print("WARNING: Could not detect hand landmarks. "
                      "Try better lighting or move hands closer to camera.")

    if debug:
        diag = draw_diagnostics(frame, marker_corners, pose_lms, hand_lms,
                                all_hands_lms, results)
        out_path = Path(image_path).with_stem(Path(image_path).stem + "_debug").with_suffix(".jpg")
        cv2.imwrite(str(out_path), diag)
        print(f"Diagnostic image saved to {out_path}")

    return results, hand_width_source


def main():
    parser = argparse.ArgumentParser(
        description="Measure height, wingspan, and hand width from one T-pose photo"
    )
    parser.add_argument("image", help="Path to T-pose photo")
    parser.add_argument("--debug", action="store_true",
                        help="Save a diagnostic overlay image alongside the input")
    args = parser.parse_args()

    measurements, hand_source = run(args.image, debug=args.debug)

    print("\nResults:")
    for key, val in measurements.items():
        if key == "px_per_cm":
            continue
        print(f"  {key}: {val} cm")
    print(f"\n  Scale: {measurements['px_per_cm']} px/cm")
    if hand_source:
        print(f"  Hand width method: {hand_source}")


if __name__ == "__main__":
    main()
