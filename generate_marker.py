"""
Generates an ArUco marker PNG + PDF at the requested physical size.

The PDF is the reliable format for printing — it encodes the exact page
dimensions so the printer renders at the correct physical size regardless
of what print application is used.  Open the PDF and print at 100% / actual
size with no scaling.

Usage:
    python generate_marker.py             # generates all three sizes (12, 16, 20 cm)
    python generate_marker.py --cm 20     # generates only the 20 cm marker
"""

import argparse
import io
import cv2
import numpy as np
from pathlib import Path
from PIL import Image

MARKER_ID   = 0
DICT_TYPE   = cv2.aruco.DICT_5X5_50
PRINT_DPI   = 300
BORDER_CM   = 1.0
LABEL_CM    = 0.3
ALL_SIZES   = [12, 16, 20]


def cm_to_px(cm: float) -> int:
    return round(cm / 2.54 * PRINT_DPI)


def _raw_marker_array(marker_cm: float) -> np.ndarray:
    """The bare black/white ArUco pattern, no border or label."""
    marker_px = cm_to_px(marker_cm)
    aruco_dict = cv2.aruco.getPredefinedDictionary(DICT_TYPE)
    marker_img = np.zeros((marker_px, marker_px), dtype=np.uint8)
    cv2.aruco.generateImageMarker(aruco_dict, MARKER_ID, marker_px, marker_img, 1)
    return marker_img


def build_marker_image(marker_cm: float) -> Image.Image:
    """Render the bordered, labeled ArUco marker for the given physical size."""
    marker_img = _raw_marker_array(marker_cm)
    border_px = cm_to_px(BORDER_CM)
    label_px  = cm_to_px(LABEL_CM)

    bordered = cv2.copyMakeBorder(
        marker_img,
        border_px, border_px + label_px, border_px, border_px,
        cv2.BORDER_CONSTANT,
        value=255,
    )

    label = f"Print at 100% / actual size -- black square must be exactly {int(marker_cm)} cm x {int(marker_cm)} cm"
    cv2.putText(
        bordered, label,
        (border_px, marker_img.shape[0] + border_px + label_px - 4),
        cv2.FONT_HERSHEY_SIMPLEX, 0.55, 0, 1, cv2.LINE_AA,
    )

    return Image.fromarray(bordered)


def marker_square_png_bytes(marker_cm: float) -> bytes:
    """The bare marker square as PNG bytes, for printing inline from the web app."""
    pil_img = Image.fromarray(_raw_marker_array(marker_cm))
    buf = io.BytesIO()
    pil_img.save(buf, format="PNG", dpi=(PRINT_DPI, PRINT_DPI))
    return buf.getvalue()


def generate(marker_cm: float):
    pil_img = build_marker_image(marker_cm)

    out_dir = Path("marker")
    out_dir.mkdir(parents=True, exist_ok=True)

    png_path = out_dir / f"marker_{int(marker_cm)}cm.png"
    pil_img.save(str(png_path), dpi=(PRINT_DPI, PRINT_DPI))

    # PDF encodes physical page size directly — more reliable for printing
    # at correct dimensions than a PNG with embedded DPI metadata.
    pdf_path = out_dir / f"marker_{int(marker_cm)}cm.pdf"
    pil_img.save(str(pdf_path), resolution=PRINT_DPI)

    print(f"  {int(marker_cm)} cm — saved {png_path}  and  {pdf_path}")
    print(f"           Print the PDF at 100% / actual size. Black square = {marker_cm} cm × {marker_cm} cm.")


def main():
    parser = argparse.ArgumentParser(description="Generate ArUco marker PNG + PDF")
    parser.add_argument("--cm", type=float, default=None,
                        help=f"Marker size in cm (default: generate all sizes {ALL_SIZES})")
    args = parser.parse_args()

    sizes = [args.cm] if args.cm else ALL_SIZES
    print(f"Generating {len(sizes)} marker(s)…")
    for s in sizes:
        generate(s)


if __name__ == "__main__":
    main()
