# pyright: reportMissingImports=false, reportAttributeAccessIssue=false, reportUnknownMemberType=false

"""Segment Anything service via Ultralytics.

This service keeps a cached image session using Ultralytics' SAMPredictor.set_image(),
so repeated point prompts reuse the image embedding instead of recomputing it.
"""

import io
import importlib
import os
import shutil
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image as PILImage

from services.runtime_service import get_runtime_info as detect_runtime_info
from utils.mask_utils import mask_to_contours


class SAMService:
    def __init__(self):
        self._predictor: Any | None = None
        self._runtime_info = None
        self._session_key: str | None = None
        self._session_size: tuple[int, int] | None = None
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
        if self._runtime_info is None:
            self._runtime_info = detect_runtime_info()
        return {
            **self._runtime_info,
            "sam_model_loaded": self._predictor is not None,
            "sam_text_model_loaded": False,
        }

    def _load_point_model(self):
        if self._predictor is not None:
            return

        try:
            predictor_module = importlib.import_module("ultralytics.models.sam")
            model_path = self._ensure_point_model_path()
            model_name = Path(model_path).name.lower()
            predictor_ctor = getattr(
                predictor_module,
                "SAM2Predictor" if "sam2" in model_name else "Predictor",
            )
            self._predictor = predictor_ctor(overrides={
                "conf": 0.25,
                "task": "segment",
                "mode": "predict",
                "imgsz": 1024,
                "model": model_path,
            })
            runtime = self.get_runtime_info()
            print(f"[SAM] Predictor loaded: {model_path} on {runtime['device_label']}")
        except Exception as e:
            raise RuntimeError(f"Failed to load interactive SAM predictor: {e}") from e

    def _decode_image(self, image_bytes: bytes) -> tuple[np.ndarray, int, int]:
        image = PILImage.open(io.BytesIO(image_bytes)).convert("RGB")
        img_w, img_h = image.size
        return np.array(image), img_w, img_h

    def preload(self):
        self._load_point_model()

    def prepare_session(self, image_key: str, image_bytes: bytes):
        self._load_point_model()
        predictor = self._predictor
        if predictor is None:
            raise RuntimeError("SAM predictor is not available")

        if self._session_key == image_key and getattr(predictor, "features", None) is not None:
            return self.get_runtime_info()

        img_array, img_w, img_h = self._decode_image(image_bytes)

        try:
            predictor.reset_image()
            predictor.set_image(img_array)
        except Exception as e:
            self._session_key = None
            self._session_size = None
            raise RuntimeError(f"Failed to prepare SAM image session: {e}") from e

        self._session_key = image_key
        self._session_size = (img_w, img_h)
        return self.get_runtime_info()

    def predict_session(
        self,
        image_key: str,
        points: list,
        point_labels: list,
        box=None,
        multimask: bool = False,
    ):
        self._load_point_model()
        predictor = self._predictor
        if predictor is None:
            raise RuntimeError("SAM predictor is not available")
        if self._session_key != image_key or self._session_size is None:
            raise RuntimeError("SAM image session is not prepared")

        img_w, img_h = self._session_size
        abs_points = [[int(p[0] * img_w), int(p[1] * img_h)] for p in points]
        abs_box = None
        if box is not None:
            abs_box = [[
                box[0] * img_w,
                box[1] * img_h,
                box[2] * img_w,
                box[3] * img_h,
            ]]

        try:
            results = predictor(
                points=[abs_points] if abs_points else None,
                labels=[point_labels] if point_labels else None,
                bboxes=abs_box,
                multimask_output=multimask,
                source=None,
            )
        except Exception as e:
            raise RuntimeError(f"SAM prompt inference failed: {e}") from e

        return self._parse_results(results, img_w, img_h, multimask)

    def _parse_results(self, results, img_w, img_h, multimask):
        if not results or results[0].masks is None:
            return [], 0.0

        result = results[0]
        mask_candidates = []

        scores = []
        try:
            if hasattr(result, "boxes") and result.boxes is not None and len(result.boxes.conf) > 0:
                scores = [float(conf.item()) for conf in result.boxes.conf]
        except Exception:
            scores = []

        if hasattr(result.masks, "data") and result.masks.data is not None:
            for index, mask_tensor in enumerate(result.masks.data):
                mask_np = mask_tensor.cpu().numpy()
                if mask_np.shape != (img_h, img_w):
                    mask_img = PILImage.fromarray((mask_np * 255).astype(np.uint8))
                    mask_img = mask_img.resize((img_w, img_h), 0)
                    mask_np = np.array(mask_img) > 127
                else:
                    mask_np = mask_np > 0.5
                polys = mask_to_contours(mask_np.astype(bool), img_w, img_h)
                if polys:
                    mask_candidates.append({
                        "contours": sorted(polys, key=self._contour_area, reverse=True),
                        "score": scores[index] if index < len(scores) else 0.0,
                    })

        if not mask_candidates and hasattr(result.masks, "xy") and result.masks.xy is not None:
            for index, mask_xy in enumerate(result.masks.xy):
                if len(mask_xy) < 3:
                    continue
                norm_contour = [[float(pt[0]) / img_w, float(pt[1]) / img_h] for pt in mask_xy]
                mask_candidates.append({
                    "contours": [norm_contour],
                    "score": scores[index] if index < len(scores) else 0.0,
                })

        if not mask_candidates:
            return [], 0.0

        if multimask:
            merged_contours = []
            best_score = 0.0
            for candidate in mask_candidates:
                merged_contours.extend(candidate["contours"])
                best_score = max(best_score, candidate["score"])
            return merged_contours, best_score

        best_candidate = max(mask_candidates, key=lambda candidate: candidate["score"])
        best_score = best_candidate["score"] if best_candidate["score"] > 0 else 0.9
        return best_candidate["contours"], best_score

    def _contour_area(self, contour):
        if len(contour) < 3:
            return 0.0
        total = 0.0
        for index, (x1, y1) in enumerate(contour):
            x2, y2 = contour[(index + 1) % len(contour)]
            total += x1 * y2 - x2 * y1
        return abs(total) / 2.0

    def unload(self):
        if self._predictor is not None:
            try:
                self._predictor.reset_image()
            except Exception:
                pass
        self._predictor = None
        self._session_key = None
        self._session_size = None


sam_service = SAMService()
