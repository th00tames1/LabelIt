from fastapi import APIRouter
from services.sam_service import sam_service

router = APIRouter()


@router.get("/health")
async def health():
    return {
        "status": "ok",
        "version": "1.0.0",
        "runtime": sam_service.get_runtime_info(),
    }
