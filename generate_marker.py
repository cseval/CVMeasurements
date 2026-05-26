"""
Generates marker/marker_10cm.png — an ArUco marker with a border and
a label showing the required print size.

Print the output at exactly 10 cm × 10 cm (exclude the white border when measuring).
"""

import cv2
import numpy as np
from pathlib import Path
from PIL import Image

MARKER_ID    = 0
DICT_TYPE    = cv2.aruco.DICT_5X5_50
OUTPUT_PATH  = Path("marker/marker_20cm.png")

PRINT_DPI    = 300
MARKER_CM    = 20.0
BORDER_CM    = 1.0
LABEL_CM     = 0.3

def cm_to_px(cm: float) -> int:
    return round(cm / 2.54 * PRINT_DPI)


def main():
    marker_px = cm_to_px(MARKER_CM)
    border_px = cm_to_px(BORDER_CM)
    label_px  = cm_to_px(LABEL_CM)

    aruco_dict = cv2.aruco.getPredefinedDictionary(DICT_TYPE)
    marker_img = np.zeros((marker_px, marker_px), dtype=np.uint8)
    cv2.aruco.generateImageMarker(aruco_dict, MARKER_ID, marker_px, marker_img, 1)

    bordered = cv2.copyMakeBorder(
        marker_img,
        border_px, border_px + label_px, border_px, border_px,
        cv2.BORDER_CONSTANT,
        value=255,
    )

    label = f"Print at 100% scale -- black square must be exactly {int(MARKER_CM)} cm x {int(MARKER_CM)} cm"
    cv2.putText(
        bordered, label,
        (border_px, marker_px + border_px + label_px - 4),
        cv2.FONT_HERSHEY_SIMPLEX, 0.55, 0, 1, cv2.LINE_AA,
    )

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    # Save with explicit DPI so printer renders at correct physical size
    pil_img = Image.fromarray(bordered)
    pil_img.save(str(OUTPUT_PATH), dpi=(PRINT_DPI, PRINT_DPI))

    print(f"Marker saved to {OUTPUT_PATH}  ({pil_img.width}×{pil_img.height} px @ {PRINT_DPI} DPI)")
    print(f"Print at 100% / actual size — black square will be exactly {MARKER_CM} cm × {MARKER_CM} cm.")


if __name__ == "__main__":
    main()
