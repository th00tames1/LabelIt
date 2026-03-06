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
async def detect(request: YOLODetectRequest):
    try:
        image_bytes = base64.b64decode(request.image_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image")

    t0 = time.perf_counter()
    detections = yolo_service.detect(
        image_bytes=image_bytes,
        model_path=request.model_path,
        conf=request.confidence_threshold,
        iou=request.iou_threshold,
    )
    elapsed_ms = (time.perf_counter() - t0) * 1000

    return YOLODetectResponse(
        detections=[YOLODetection(**d) for d in detections],
        processing_time_ms=elapsed_ms,
    )
