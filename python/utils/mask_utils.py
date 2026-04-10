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
    contours, _ = cv2.findContours(mask_uint8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)

    filtered = [contour for contour in contours if cv2.contourArea(contour) >= min_area]
    filtered.sort(key=cv2.contourArea, reverse=True)

    result = []
    for contour in filtered:
        # Simplify contour (Douglas-Peucker)
        # Higher epsilon = smoother polygon with fewer vertices.
        # 0.005 × perimeter gives clean boundaries similar to Roboflow.
        epsilon = max(2.5, 0.005 * cv2.arcLength(contour, True))
        approx = cv2.approxPolyDP(contour, epsilon, True)

        if len(approx) < 3:
            continue

        approx_points = approx.reshape(-1, 2).tolist()
        normalized = [
            [float(x) / img_w, float(y) / img_h]
            for x, y in approx_points
        ]
        result.append(normalized)

    return result
