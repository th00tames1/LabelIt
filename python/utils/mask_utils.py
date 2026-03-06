"""Convert binary masks to normalized polygon contours using OpenCV."""

import numpy as np


def mask_to_contours(
    mask: np.ndarray,
    img_w: int,
    img_h: int,
    min_area: int = 50,
) -> list[list[list[float]]]:
    """
    Convert a binary mask to a list of polygon contours.

    Args:
        mask: (H, W) boolean or uint8 array
        img_w: original image width (for normalization)
        img_h: original image height (for normalization)
        min_area: minimum contour area in pixels to keep

    Returns:
        List of contours, each contour is [[x_norm, y_norm], ...]
    """
    import cv2

    mask_uint8 = (mask.astype(np.uint8) * 255)
    contours, _ = cv2.findContours(mask_uint8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_TC89_KCOS)

    result = []
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < min_area:
            continue

        # Simplify contour (Douglas-Peucker)
        epsilon = 0.003 * cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, epsilon, True)

        if len(approx) < 3:
            continue

        normalized = [
            [float(pt[0][0]) / img_w, float(pt[0][1]) / img_h]
            for pt in approx
        ]
        result.append(normalized)

    return result
