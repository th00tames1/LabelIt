import time
import base64
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.sam_service import sam_service

router = APIRouter()


class SAMPredictRequest(BaseModel):
    image_key: str
    points: list[list[float]]        # [[nx, ny], ...] normalized 0-1
    point_labels: list[int]          # 1=foreground, 0=background
    box: Optional[list[float]] = None   # [x1, y1, x2, y2] normalized, optional
    multimask: bool = False


class SAMPrepareSessionRequest(BaseModel):
    image_key: str
    image_base64: str


class SAMPredictResponse(BaseModel):
    candidates: list[dict]
    contours: list[list[list[float]]]  # [[[nx, ny], ...], ...] normalized
    score: float
    processing_time_ms: float
    mode: str                          # "point"
    runtime: dict


@router.post("/predict", response_model=SAMPredictResponse)
async def predict(request: SAMPredictRequest):
    mode = "point"

    t0 = time.perf_counter()
    try:
        candidates, contours, score = sam_service.predict_session(
            image_key=request.image_key,
            points=request.points,
            point_labels=request.point_labels,
            box=request.box,
            multimask=request.multimask,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SAM inference error: {e}")

    elapsed_ms = (time.perf_counter() - t0) * 1000

    return SAMPredictResponse(
        candidates=candidates,
        contours=contours,
        score=score,
        processing_time_ms=elapsed_ms,
        mode=mode,
        runtime=sam_service.get_runtime_info(),
    )


@router.post("/session")
async def prepare_session(request: SAMPrepareSessionRequest):
    try:
        image_bytes = base64.b64decode(request.image_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image")

    try:
        runtime = sam_service.prepare_session(request.image_key, image_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SAM session error: {e}")

    return {
        "status": "ok",
        "runtime": runtime,
    }


@router.post("/preload")
async def preload():
    try:
        sam_service.preload()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SAM preload error: {e}")

    return {
        "status": "ok",
        "runtime": sam_service.get_runtime_info(),
    }
