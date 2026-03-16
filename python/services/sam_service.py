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
        self._preferred_model = "sam2.1"
        # Models dir: use LABELING_TOOL_MODELS_DIR env var (set to %APPDATA%\LabelIt\models\)
        # so models are always in a user-writable location.
        models_env = os.environ.get("LABELING_TOOL_MODELS_DIR")
        self._models_dir = Path(models_env) if models_env else Path(os.path.dirname(__file__)).resolve().parent / "models"
        self._sam3_local_path = self._models_dir / "sam3.pt"
        self._sam2_local_path = self._models_dir / "sam2.1_b.pt"

    def _get_model_descriptor(self) -> tuple[str, str]:
        if self._preferred_model == "sam3" and self._sam3_local_path.exists():
            return "sam3", "SAM3"
        if self._preferred_model == "sam2.1" and self._sam2_local_path.exists():
            return "sam2.1", "SAM2.1"
        if self._sam3_local_path.exists():
            return "sam3", "SAM3"
        if self._sam2_local_path.exists():
            return "sam2.1", "SAM2.1"
        return "sam2.1", "SAM2.1"

    def _ensure_point_model_path(self) -> str:
        if self._preferred_model == "sam3" and self._sam3_local_path.exists():
            return str(self._sam3_local_path)
        if self._preferred_model == "sam2.1" and self._sam2_local_path.exists():
            return str(self._sam2_local_path)
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
        model_name, model_label = self._get_model_descriptor()
        return {
            **self._runtime_info,
            "sam_model_preference": self._preferred_model,
            "sam_model_name": model_name,
            "sam_model_label": model_label,
            "sam_model_loaded": self._predictor is not None,
            "sam_text_model_loaded": False,
            "sam2_available": self._sam2_local_path.exists(),
            "sam3_available": self._sam3_local_path.exists(),
        }

    def _load_point_model(self):
        if self._predictor is not None:
            return

        try:
            predictor_module = importlib.import_module("ultralytics.models.sam")
            model_path = self._ensure_point_model_path()
            model_name = Path(model_path).name.lower()
            predictor_name = (
                "SAM3Predictor" if "sam3" in model_name
                else "SAM2Predictor" if "sam2" in model_name
                else "Predictor"
            )
            predictor_ctor = getattr(predictor_module, predictor_name)
            self._predictor = predictor_ctor(overrides={
                "conf": 0.25,
                "task": "segment",
                "mode": "predict",
                "imgsz": 1024,
                "model": model_path,
                "compile": None,
                "save": False,
                "verbose": False,
            })
            runtime = self.get_runtime_info()
            print(f"[SAM] {predictor_name} loaded: {model_path} on {runtime['device_label']}")
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

        return self._parse_results(results, img_w, img_h, multimask, abs_points, point_labels)

    def _parse_results(self, results, img_w, img_h, multimask, prompt_points=None, prompt_labels=None):
        if not results or results[0].masks is None:
            return [], [], 0.0

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
                        "mask": mask_np.astype(bool),
                    })

        if not mask_candidates and hasattr(result.masks, "xy") and result.masks.xy is not None:
            for index, mask_xy in enumerate(result.masks.xy):
                if len(mask_xy) < 3:
                    continue
                norm_contour = [[float(pt[0]) / img_w, float(pt[1]) / img_h] for pt in mask_xy]
                mask_candidates.append({
                    "contours": [norm_contour],
                    "score": scores[index] if index < len(scores) else 0.0,
                    "mask": None,
                })

        if not mask_candidates:
            return [], [], 0.0

        rated_candidates = []
        for candidate in mask_candidates:
            metrics = self._candidate_metrics(candidate, prompt_points or [], prompt_labels or [])
            rated_candidates.append({ **candidate, **metrics })

        candidate_pool = rated_candidates
        positive_total = sum(1 for label in (prompt_labels or []) if label == 1)
        negative_total = sum(1 for label in (prompt_labels or []) if label == 0)
        if positive_total > 0:
            strict_matches = [
                candidate
                for candidate in rated_candidates
                if candidate["positive_hits"] == positive_total and candidate["soft_negative_free"] == 1
            ]
            all_positive_matches = [
                candidate
                for candidate in rated_candidates
                if candidate["positive_hits"] == positive_total
            ]
            relaxed_matches = [
                candidate
                for candidate in rated_candidates
                if candidate["positive_hits"] > 0 and candidate["soft_negative_free"] == 1
            ]
            partial_matches = [candidate for candidate in rated_candidates if candidate["positive_hits"] > 0]
            candidate_pool = strict_matches or all_positive_matches or relaxed_matches or partial_matches or rated_candidates
        elif negative_total > 0:
            candidate_pool = [candidate for candidate in rated_candidates if candidate["soft_negative_free"] == 1] or rated_candidates

        if not candidate_pool:
            return [], [], 0.0

        ranked_candidates = sorted(candidate_pool, key=self._candidate_rank, reverse=True)
        top_candidates = ranked_candidates[:3]
        best_candidate = top_candidates[0]
        best_score = best_candidate["score"] if best_candidate["score"] > 0 else 0.9
        serialized = [
            {
                "contours": candidate["contours"],
                "score": float(candidate["score"] if candidate["score"] > 0 else 0.9),
                "area": float(self._candidate_area(candidate)),
            }
            for candidate in top_candidates
        ]
        return serialized, best_candidate["contours"], best_score

    def _candidate_metrics(self, candidate, prompt_points, prompt_labels):
        positive_total = sum(1 for label in prompt_labels if label == 1)
        positive_hits = 0
        negative_hits = 0
        negative_soft_penalty = 0.0

        for point, label in zip(prompt_points, prompt_labels):
            inside = self._candidate_contains_point(candidate, point[0], point[1])
            if label == 1:
                positive_hits += 1 if inside else 0
            else:
                negative_hits += 1 if inside else 0
                negative_soft_penalty += self._candidate_negative_penalty(candidate, point[0], point[1])

        soft_negative_free = 1 if negative_soft_penalty <= 0.02 else 0

        return {
            "positive_total": positive_total,
            "positive_hits": positive_hits,
            "negative_hits": negative_hits,
            "negative_soft_penalty": negative_soft_penalty,
            "all_positive": 1 if positive_total > 0 and positive_hits == positive_total else 0,
            "no_negative": 1 if negative_hits == 0 else 0,
            "soft_negative_free": soft_negative_free,
            "area": self._candidate_area(candidate),
        }

    def _candidate_rank(self, candidate):
        return (
            candidate["all_positive"],
            candidate["soft_negative_free"],
            candidate["no_negative"],
            candidate["positive_hits"],
            -candidate["negative_soft_penalty"],
            -candidate["negative_hits"],
            -candidate["area"],
            candidate["score"],
        )

    def _negative_radius_px(self):
        session_size = self._session_size
        if session_size is None:
            return 16
        return max(12, int(round(min(session_size) * 0.02)))

    def _candidate_negative_penalty(self, candidate, x, y):
        mask = candidate.get("mask")
        radius = self._negative_radius_px()
        if mask is not None:
            return self._mask_overlap_in_radius(mask, x, y, radius)

        if self._candidate_contains_point(candidate, x, y):
            return 1.0

        min_distance = min(
            (self._point_to_contour_distance_px(contour, x, y) for contour in candidate["contours"]),
            default=float("inf"),
        )
        if min_distance >= radius:
            return 0.0
        return max(0.0, 1.0 - (min_distance / max(radius, 1)))

    def _mask_overlap_in_radius(self, mask, x, y, radius):
        h, w = mask.shape
        left = max(0, int(round(x - radius)))
        right = min(w - 1, int(round(x + radius)))
        top = max(0, int(round(y - radius)))
        bottom = min(h - 1, int(round(y + radius)))
        if left > right or top > bottom:
            return 0.0

        yy, xx = np.ogrid[top:bottom + 1, left:right + 1]
        circle = ((xx - x) ** 2 + (yy - y) ** 2) <= radius ** 2
        if not np.any(circle):
            return 0.0

        mask_crop = mask[top:bottom + 1, left:right + 1]
        overlap = np.logical_and(mask_crop, circle)
        return float(overlap.sum()) / float(circle.sum())

    def _candidate_contains_point(self, candidate, x, y):
        mask = candidate.get("mask")
        if mask is not None:
            x = int(np.clip(round(x), 0, mask.shape[1] - 1))
            y = int(np.clip(round(y), 0, mask.shape[0] - 1))
            return bool(mask[y, x])

        session_size = self._session_size
        if session_size is None:
            return False
        nx = x / max(session_size[0], 1)
        ny = y / max(session_size[1], 1)
        return any(self._point_in_contour(contour, nx, ny) for contour in candidate["contours"])

    def _candidate_area(self, candidate):
        mask = candidate.get("mask")
        if mask is not None:
            return int(mask.sum())
        return max((self._contour_area(contour) for contour in candidate["contours"]), default=0.0)

    def _point_in_contour(self, contour, x, y):
        inside = False
        for index, (x1, y1) in enumerate(contour):
            x2, y2 = contour[(index + 1) % len(contour)]
            intersects = ((y1 > y) != (y2 > y)) and (x < ((x2 - x1) * (y - y1)) / ((y2 - y1) or 1e-12) + x1)
            if intersects:
                inside = not inside
        return inside

    def _point_to_contour_distance_px(self, contour, x, y):
        session_size = self._session_size
        if session_size is None:
            return float("inf")
        px = x / max(session_size[0], 1)
        py = y / max(session_size[1], 1)

        if self._point_in_contour(contour, px, py):
            return 0.0

        best = float("inf")
        for index, (x1, y1) in enumerate(contour):
            x2, y2 = contour[(index + 1) % len(contour)]
            dist = self._point_to_segment_distance_px(px, py, x1, y1, x2, y2, session_size)
            best = min(best, dist)
        return best

    def _point_to_segment_distance_px(self, px, py, x1, y1, x2, y2, session_size):
        sx, sy = session_size
        p = np.array([px * sx, py * sy], dtype=np.float64)
        a = np.array([x1 * sx, y1 * sy], dtype=np.float64)
        b = np.array([x2 * sx, y2 * sy], dtype=np.float64)
        ab = b - a
        denom = float(np.dot(ab, ab))
        if denom <= 1e-12:
            return float(np.linalg.norm(p - a))
        t = float(np.dot(p - a, ab) / denom)
        t = max(0.0, min(1.0, t))
        proj = a + t * ab
        return float(np.linalg.norm(p - proj))

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

    def set_preferred_model(self, model_name: str):
        if model_name not in {"sam2.1", "sam3"}:
            raise RuntimeError("Unsupported SAM model")
        self._preferred_model = model_name
        self.unload()
        return self.get_runtime_info()


sam_service = SAMService()
