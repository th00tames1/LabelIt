# pyright: reportMissingImports=false, reportAttributeAccessIssue=false, reportUnknownMemberType=false

"""Segment Anything service via Ultralytics.

Point prompts use local `sam3.pt` when available and fall back to an auto-downloading
`sam2.1_b.pt` checkpoint so click-based segmentation works out of the box.
"""

import io
import importlib
import os
import shutil
from pathlib import Path
import numpy as np
from PIL import Image as PILImage
from typing import Any
from services.runtime_service import get_runtime_info as detect_runtime_info
from utils.mask_utils import mask_to_contours


class SAMService:
    def __init__(self):
        self._model: Any | None = None
        self._runtime_info = None
        self._models_dir = Path(os.path.dirname(__file__)).resolve().parent / "models"
        self._sam3_local_path = self._models_dir / "sam3.pt"
        self._sam2_local_path = self._models_dir / "sam2.1_b.pt"

    def _ensure_point_model_path(self) -> str:
        if self._sam3_local_path.exists():
            return str(self._sam3_local_path)
        if self._sam2_local_path.exists():
            return str(self._sam2_local_path)

        downloads = importlib.import_module("ultralytics.utils.downloads")
        resolved = Path(downloads.attempt_download_asset("sam2.1_b.pt"))
        if resolved.exists():
            self._models_dir.mkdir(parents=True, exist_ok=True)
            if resolved.resolve() != self._sam2_local_path.resolve():
                shutil.copy2(resolved, self._sam2_local_path)
            return str(self._sam2_local_path if self._sam2_local_path.exists() else resolved)

        raise RuntimeError("SAM point model is unavailable.")

    def get_runtime_info(self):
        if self._runtime_info is not None:
            return {
                **self._runtime_info,
                "sam_model_loaded": self._model is not None,
                "sam_text_model_loaded": False,
            }

        info = detect_runtime_info()
        self._runtime_info = info
        return {
            **info,
            "sam_model_loaded": self._model is not None,
            "sam_text_model_loaded": False,
        }

    # ── Model Loading ────────────────────────────────────────────────────────

    def _load_point_model(self):
        """Load interactive point/box prompt model."""
        if self._model is not None:
            return
        try:
            ultralytics = importlib.import_module("ultralytics")
            sam_ctor = getattr(ultralytics, "SAM")
            model_path = self._ensure_point_model_path()
            self._model = sam_ctor(model_path)
            runtime = self.get_runtime_info()
            print(f"[SAM] Point model loaded: {model_path} on {runtime['device_label']}")
        except Exception as e:
            raise RuntimeError(f"Failed to load interactive SAM model: {e}") from e

    # ── Public API ───────────────────────────────────────────────────────────

    def predict(
        self,
        image_bytes: bytes,
        points: list,
        point_labels: list,
        box=None,
        multimask: bool = True,
    ):
        """
        Run SAM point-prompt inference.

        Returns:
            (contours, score)
            contours: list of polygons, each polygon = list of [nx, ny] normalized 0-1
            score:    confidence float 0-1
        """
        _ = multimask
        image = PILImage.open(io.BytesIO(image_bytes)).convert("RGB")
        img_w, img_h = image.size
        img_array = np.array(image)
        return self._predict_points(img_array, img_w, img_h, points, point_labels, box)

    # ── Point / Box Prompt Mode ──────────────────────────────────────────────

    def _predict_points(self, img_array, img_w, img_h, points, point_labels, box):
        self._load_point_model()
        runtime = self.get_runtime_info()
        model = self._model
        if model is None:
            raise RuntimeError("SAM 3 point model is not available")

        # Convert normalized coords to pixel coords for Ultralytics
        abs_points = [[int(p[0] * img_w), int(p[1] * img_h)] for p in points]
        abs_box = None
        if box is not None:
            abs_box = [[
                box[0] * img_w, box[1] * img_h,
                box[2] * img_w, box[3] * img_h,
            ]]

        try:
            results = model.predict(
                source=img_array,
                points=[abs_points] if abs_points else None,
                labels=[point_labels] if point_labels else None,
                bboxes=abs_box,
                device=runtime["device"],
                verbose=False,
            )
        except Exception as e:
            raise RuntimeError(f"SAM 3 point inference failed: {e}") from e

        return self._parse_results(results, img_w, img_h)

    # ── Result Parsing ────────────────────────────────────────────────────────

    def _parse_results(self, results, img_w, img_h):
        """
        Convert Ultralytics Result objects to normalized contours.
        Prefer binary mask -> OpenCV contour extraction for stable point ordering,
        then fall back to Ultralytics masks.xy when needed.
        """
        if not results or results[0].masks is None:
            return [], 0.0

        result = results[0]
        contours = []

        # Path A: masks.data (binary tensors -> compute contours via OpenCV)
        if hasattr(result.masks, "data") and result.masks.data is not None:
            for mask_tensor in result.masks.data:
                mask_np = mask_tensor.cpu().numpy()
                if mask_np.shape != (img_h, img_w):
                    mask_img = PILImage.fromarray((mask_np * 255).astype(np.uint8))
                    mask_img = mask_img.resize((img_w, img_h), 0)
                    mask_np = np.array(mask_img) > 127
                else:
                    mask_np = mask_np > 0.5
                polys = mask_to_contours(mask_np.astype(bool), img_w, img_h)
                contours.extend(polys)

        # Path B: masks.xy (pre-computed polygon contours)
        if not contours and hasattr(result.masks, "xy") and result.masks.xy is not None:
            for mask_xy in result.masks.xy:
                if len(mask_xy) < 3:
                    continue
                norm_contour = [
                    [float(pt[0]) / img_w, float(pt[1]) / img_h]
                    for pt in mask_xy
                ]
                contours.append(norm_contour)

        # Confidence score
        score = 0.9
        try:
            if hasattr(result, "boxes") and result.boxes is not None and len(result.boxes.conf) > 0:
                score = float(result.boxes.conf.max().item())
        except Exception:
            pass

        return contours, score

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    def unload(self):
        """Release model from memory (called on sidecar shutdown)."""
        self._model = None


sam_service = SAMService()
