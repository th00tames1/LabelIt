"""Utility functions for image processing in the sidecar."""

import base64
import io
from PIL import Image


def image_to_base64(image_path: str, max_size: int = 1024) -> str:
    """Load image, resize to max_size, return base64 JPEG string."""
    with Image.open(image_path) as img:
        img = img.convert("RGB")
        if max(img.size) > max_size:
            img.thumbnail((max_size, max_size), Image.BILINEAR)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        return base64.b64encode(buf.getvalue()).decode()


def bytes_to_pil(image_bytes: bytes) -> Image.Image:
    return Image.open(io.BytesIO(image_bytes)).convert("RGB")
