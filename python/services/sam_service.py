"""
SAM 3 (Segment Anything Model 3) service via Ultralytics.
Released by Meta AI on November 19, 2025.

Supports two prompt modes:
  1. Point prompts  — click-based (left=positive, right=negative), backward-compatible
  2. Text prompts   — concept-based ("car", "person"), NEW in SAM 3

Model: sam3.pt (~3.4 GB)
  - Auto-downloaded by Ultralytics on first use (~/.ultralytics/assets/)
  - Or place manually at python/models/sam3.pt

Performance:
  - CPU: ~60–180s per image (heavy model — GPU strongly recommended)
  - GPU (CUDA): ~1–5s per image

Ultralytics SAM 3 docs: https://docs.ultralytics.com/models/sam-3/
"""

import io
import os
import numpy as np
from PIL import Image as PILImage
from typing import Optional
from utils.mask_utils import mask_to_contours


class SAMService:
    def __init__(self):
        self._model = None
        self._text_predictor = None
        # Prefer local model file; Ultralytics will auto-download "sam3.pt" otherwise
        local_model = os.path.join(os.path.dirname(__file__), "..", "models", "sam3.pt")
        self._model_path = local_model if os.path.exists(local_model) else "sam3.pt"

    # ── Model Loading ────────────────────────────────────────────────────────

    def _load_point_model(self):
        """Load SAM 3 for point/box prompt inference."""
        if self._model is not None:
            return
        try:
            from ultralytics import SAM
            self._model = SAM(self._model_path)
            print(f"[SAM3] Point model loaded: {self._model_path}")
        except Exception as e:
            raise RuntimeError(
                f"Failed to load SAM 3 model: {e}\n"
                "Install Ultralytics: pip install -U ultralytics\n"
                "Model will auto-download on first use (~3.4 GB)."
            ) from e

    def _load_text_predictor(self):
        """Load SAM 3 SemanticPredictor for text/concept prompt inference."""
        if self._text_predictor is not None:
            return
        try:
            from ultralytics.models.sam import SAM3SemanticPredictor
            self._text_predictor = SAM3SemanticPredictor(overrides={
                "conf": 0.25,
                "task": "segment",
                "mode": "predict",
                "model": self._model_path,
                "save": False,
                "verbose": False,
                "half": False,   # CPU safe — set True only with CUDA GPU
            })
            print(f"[SAM3] Text predictor loaded: {self._model_path}")
        except ImportError as e:
            raise RuntimeError(
                f"SAM3SemanticPredictor not available: {e}\n"
                "Upgrade Ultralytics: pip install -U ultralytics"
            ) from e

    # ── Public API ───────────────────────────────────────────────────────────

    def predict(
        self,
        image_bytes: bytes,
        points: list,
        point_labels: list,
        box=None,
        text=None,
        multimask: bool = True,
    ):
        """
        Run SAM 3 inference.

        Returns:
            (contours, score)
            contours: list of polygons, each polygon = list of [nx, ny] normalized 0-1
            score:    confidence float 0-1
        """
        image = PILImage.open(io.BytesIO(image_bytes)).convert("RGB")
        img_w, img_h = image.size
        img_array = np.array(image)

        if text and text.strip():
            return self._predict_text(img_array, img_w, img_h, text.strip())
        else:
            return self._predict_points(img_array, img_w, img_h, points, point_labels, box)

    # ── Text Prompt Mode (SAM 3 concept segmentation) ───────────────────────

    def _predict_text(self, img_array, img_w, img_h, text):
        self._load_text_predictor()
        try:
            self._text_predictor.set_image(img_array)
            results = self._text_predictor(text=[text])
        except Exception as e:
            raise RuntimeError(f"SAM 3 text inference failed: {e}") from e
        return self._parse_results(results, img_w, img_h)

    # ── Point / Box Prompt Mode ──────────────────────────────────────────────

    def _predict_points(self, img_array, img_w, img_h, points, point_labels, box):
        self._load_point_model()

        # Convert normalized coords to pixel coords for Ultralytics
        abs_points = [[int(p[0] * img_w), int(p[1] * img_h)] for p in points]
        abs_box = None
        if box is not None:
            abs_box = [[
                box[0] * img_w, box[1] * img_h,
                box[2] * img_w, box[3] * img_h,
            ]]

        try:
            results = self._model.predict(
                source=img_array,
                points=[abs_points] if abs_points else None,
                labels=[point_labels] if point_labels else None,
                bboxes=abs_box,
                verbose=False,
            )
        except Exception as e:
            raise RuntimeError(f"SAM 3 point inference failed: {e}") from e

        return self._parse_results(results, img_w, img_h)

    # ── Result Parsing ────────────────────────────────────────────────────────

    def _parse_results(self, results, img_w, img_h):
        """
        Convert Ultralytics Result objects to normalized contours.
        Tries masks.xy (pre-computed polygon) first,
        falls back to masks.data (binary mask -> contour extraction).
        """
        if not results or results[0].masks is None:
            return [], 0.0

        result = results[0]
        contours = []

        # Path A: masks.xy (pre-computed polygon contours, fastest)
        if hasattr(result.masks, "xy") and result.masks.xy is not None:
            for mask_xy in result.masks.xy:
                if len(mask_xy) < 3:
                    continue
                norm_contour = [
                    [float(pt[0]) / img_w, float(pt[1]) / img_h]
                    for pt in mask_xy
                ]
                contours.append(norm_contour)

        # Path B: masks.data (binary tensors -> compute contours via OpenCV)
        if not contours and hasattr(result.masks, "data") and result.masks.data is not None:
            for mask_tensor in result.masks.data:
                mask_np = mask_tensor.cpu().numpy()
                if mask_np.shape != (img_h, img_w):
                    mask_img = PILImage.fromarray((mask_np * 255).astype(np.uint8))
                    mask_img = mask_img.resize((img_w, img_h), PILImage.NEAREST)
                    mask_np = np.array(mask_img) > 127
                else:
                    mask_np = mask_np > 0.5
                polys = mask_to_contours(mask_np.astype(bool), img_w, img_h)
                contours.extend(polys)

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
        self._text_predictor = None


sam_service = SAMService()
