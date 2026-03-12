"""
LabelIt AI Sidecar — FastAPI server running on localhost:7842
Provides SAM smart-polygon and YOLO auto-label endpoints.
All models are lazy-loaded on first request to keep startup time < 2s.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import health, sam, yolo


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Models are lazy-loaded in their respective services
    yield
    # Cleanup on shutdown
    try:
        from services.sam_service import sam_service
        sam_service.unload()
    except Exception:
        pass


app = FastAPI(
    title="LabelIt AI Sidecar",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restricted to localhost by OS firewall
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, tags=["health"])
app.include_router(sam.router, prefix="/sam", tags=["sam"])
app.include_router(yolo.router, prefix="/yolo", tags=["yolo"])
