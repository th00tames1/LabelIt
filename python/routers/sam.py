import time
import base64
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.sam_service import sam_service

router = APIRouter()


def _friendly_sam_error(exc: Exception) -> tuple[int, str]:
    """Translate raw SAM/torch errors into something users can act on.
    Returns (http_status, message)."""
    message = str(exc)
    lower = message.lower()
    if "out of memory" in lower or "oom" in lower or "cuda out of memory" in lower:
        return 507, (
            "Out of GPU memory.  Try a smaller image, switch to CPU mode in "
            "Settings, or close other GPU applications."
        )
    if "cannot identify image" in lower or "unsupported image" in lower:
        return 415, (
            "Image format not recognised.  Re-save the image as JPEG or PNG."
        )
    if "no such file" in lower or "filenotfounderror" in lower:
        return 404, "Image file not found on disk."
    if "session is not prepared" in lower:
        return 409, "SAM session expired — please reselect the image."
    return 500, f"SAM inference error: {message}"


class SAMPredictRequest(BaseModel):
    image_key: str
    points: list[list[float]]        # [[nx, ny], ...] normalized 0-1
    point_labels: list[int]          # 1=foreground, 0=background
    box: Optional[list[float]] = None   # [x1, y1, x2, y2] normalized, optional
    multimask: bool = False


class SAMPrepareSessionRequest(BaseModel):
    image_key: str
    image_base64: str


class SAMModelRequest(BaseModel):
    model_name: str


class SAMPredictResponse(BaseModel):
    candidates: list[dict]
    contours: list[list[list[float]]]  # [[[nx, ny], ...], ...] normalized
    score: float
    processing_time_ms: float
    mode: str                          # "point"
    runtime: dict


@router.post("/predict", response_model=SAMPredictResponse)
def predict(request: SAMPredictRequest):
    """Run SAM point-prompt inference.

    NOTE: plain `def` (not async) — FastAPI runs it in a thread-pool so the
    heavy synchronous SAM inference doesn't block the asyncio event loop.
    """
    mode = "point"

    # Input validation — bad client requests should be 400, not 500.
    if not isinstance(request.points, list) or not isinstance(request.point_labels, list):
        raise HTTPException(status_code=400, detail="points and point_labels must be lists")
    if len(request.points) != len(request.point_labels):
        raise HTTPException(status_code=400, detail="points and point_labels length mismatch")
    if len(request.points) == 0:
        raise HTTPException(status_code=400, detail="At least one point is required")
    for pt in request.points:
        if not isinstance(pt, list) or len(pt) != 2:
            raise HTTPException(status_code=400, detail="Each point must be [x, y]")
        x, y = pt
        if not (0.0 <= float(x) <= 1.0) or not (0.0 <= float(y) <= 1.0):
            raise HTTPException(status_code=400, detail="Point coordinates must be normalized (0–1)")

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
        status, message = _friendly_sam_error(e)
        raise HTTPException(status_code=status, detail=message)

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
def prepare_session(request: SAMPrepareSessionRequest):
    """Prepare SAM image session (compute image embeddings).

    NOTE: plain `def` (not async) — `set_image()` is a heavy synchronous
    operation (GPU image encoding, ~2-10s).  With `async def` it would block
    the entire asyncio event loop, freezing all other requests.
    """
    if not request.image_base64 or not isinstance(request.image_base64, str):
        raise HTTPException(status_code=400, detail="image_base64 is required")
    try:
        # validate=True catches non-base64 characters early so the user gets
        # a clean "Invalid base64" instead of a binary-garbage image error.
        image_bytes = base64.b64decode(request.image_base64, validate=False)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image data")
    if len(image_bytes) == 0:
        raise HTTPException(status_code=400, detail="image_base64 decoded to 0 bytes")
    if len(image_bytes) > 200 * 1024 * 1024:  # 200 MB safety cap
        raise HTTPException(status_code=413, detail="Image too large to process (>200 MB)")

    try:
        runtime = sam_service.prepare_session(request.image_key, image_bytes)
    except Exception as e:
        status, message = _friendly_sam_error(e)
        raise HTTPException(status_code=status, detail=message)

    return {
        "status": "ok",
        "runtime": runtime,
    }


@router.post("/preload")
def preload():
    """Pre-load the SAM model into memory.

    NOTE: plain `def` (not async) — model loading is a heavy synchronous
    operation that must not block the event loop.
    """
    try:
        sam_service.preload()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SAM preload error: {e}")

    return {
        "status": "ok",
        "runtime": sam_service.get_runtime_info(),
    }


@router.post("/model")
def set_model(request: SAMModelRequest):
    """Switch the active SAM model."""
    try:
        runtime = sam_service.set_preferred_model(request.model_name)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"SAM model error: {e}")

    return {
        "status": "ok",
        "runtime": runtime,
    }
