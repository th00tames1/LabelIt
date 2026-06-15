import time
import base64
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.yolo_service import yolo_service

router = APIRouter()


class YOLODetectRequest(BaseModel):
    image_base64: str
    model_path: str = "yolo11n"     # Default: nano model
    confidence_threshold: float = 0.25
    iou_threshold: float = 0.45


class YOLODetection(BaseModel):
    class_name: str
    confidence: float
    bbox: list[float]   # [x_center, y_center, width, height] — normalized 0–1


class YOLODetectResponse(BaseModel):
    detections: list[YOLODetection]
    processing_time_ms: float


@router.post("/detect", response_model=YOLODetectResponse)
def detect(request: YOLODetectRequest):
    if not request.image_base64 or not isinstance(request.image_base64, str):
        raise HTTPException(status_code=400, detail="image_base64 is required")
    try:
        image_bytes = base64.b64decode(request.image_base64, validate=False)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image data")
    if len(image_bytes) == 0:
        raise HTTPException(status_code=400, detail="image_base64 decoded to 0 bytes")
    if len(image_bytes) > 200 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image too large to process (>200 MB)")
    if not (0.0 <= request.confidence_threshold <= 1.0):
        raise HTTPException(status_code=400, detail="confidence_threshold must be 0–1")
    if not (0.0 <= request.iou_threshold <= 1.0):
        raise HTTPException(status_code=400, detail="iou_threshold must be 0–1")

    t0 = time.perf_counter()
    try:
        detections = yolo_service.detect(
            image_bytes=image_bytes,
            model_path=request.model_path,
            conf=request.confidence_threshold,
            iou=request.iou_threshold,
        )
    except Exception as e:
        # Distinguish common failure modes so users get actionable messages
        # instead of raw torch tracebacks.
        msg = str(e).lower()
        if "out of memory" in msg or "cuda out of memory" in msg:
            raise HTTPException(
                status_code=507,
                detail="Out of GPU memory.  Try a smaller image, switch to CPU mode in Settings, or close other GPU applications.",
            )
        if "no such file" in msg or "filenotfounderror" in msg or "model not found" in msg:
            raise HTTPException(
                status_code=404,
                detail=f"YOLO model not found: {request.model_path}.  Re-download the model in the AI setup wizard.",
            )
        if "cannot identify image" in msg or "unsupported image" in msg:
            raise HTTPException(
                status_code=415,
                detail="Image format not recognised.  Re-save the image as JPEG or PNG.",
            )
        raise HTTPException(status_code=500, detail=f"YOLO inference error: {e}")
    elapsed_ms = (time.perf_counter() - t0) * 1000

    return YOLODetectResponse(
        detections=[YOLODetection(**d) for d in detections],
        processing_time_ms=elapsed_ms,
    )
