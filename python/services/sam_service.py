# pyright: reportMissingImports=false, reportAttributeAccessIssue=false, reportUnknownMemberType=false

"""Segment Anything service via Ultralytics.

Point prompts use local `sam3.pt` when available and fall back to an auto-downloading
`sam2.1_b.pt` checkpoint so click-based segmentation works out of the box.

Text prompts still require a manually downloaded local `sam3.pt` file.
"""

import io
import importlib
import os
import shutil
import subprocess
from pathlib import Path
import numpy as np
from PIL import Image as PILImage
from typing import Any, Optional
from utils.mask_utils import mask_to_contours


class SAMService:
    def __init__(self):
        self._model: Any | None = None
        self._text_predictor: Any | None = None
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

    def _ensure_text_model_path(self) -> str:
        if self._sam3_local_path.exists():
            return str(self._sam3_local_path)

        cwd_model = Path("sam3.pt")
        if cwd_model.exists():
            return str(cwd_model)

        raise RuntimeError(
            "SAM text mode requires a local sam3.pt file. Download it from https://huggingface.co/facebook/sam3 "
            "and place it in python/models/sam3.pt."
        )

    def get_runtime_info(self):
        if self._runtime_info is not None:
            return {
                **self._runtime_info,
                "sam_model_loaded": self._model is not None,
                "sam_text_model_loaded": self._text_predictor is not None,
            }

        info = {
            "device": "cpu",
            "device_label": "CPU",
            "acceleration": "cpu",
            "cuda_available": False,
            "mps_available": False,
            "nvidia_gpu_detected": False,
            "hardware_label": None,
            "half_precision": False,
            "setup_hint": None,
        }

        try:
            result = subprocess.run(
                ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
                capture_output=True,
                text=True,
                timeout=2,
                check=False,
            )
            names = [line.strip() for line in result.stdout.splitlines() if line.strip()]
            if names:
                info["nvidia_gpu_detected"] = True
                info["hardware_label"] = names[0]
        except Exception:
            pass

        try:
            import torch

            cuda_available = bool(torch.cuda.is_available())
            mps_available = bool(
                hasattr(torch.backends, "mps")
                and torch.backends.mps.is_available()
            )

            info["cuda_available"] = cuda_available
            info["mps_available"] = mps_available

            if cuda_available:
                info.update({
                    "device": "cuda:0",
                    "device_label": f"CUDA GPU ({torch.cuda.get_device_name(0)})",
                    "acceleration": "gpu",
                    "half_precision": True,
                })
            elif mps_available:
                info.update({
                    "device": "mps",
                    "device_label": "Apple Metal GPU (MPS)",
                    "acceleration": "gpu",
                    "half_precision": False,
                })
        except Exception:
            pass

        if info["nvidia_gpu_detected"] and not info["cuda_available"]:
            info["setup_hint"] = "NVIDIA GPU detected, but this Python environment is using CPU-only PyTorch."

        self._runtime_info = info
        return {
            **info,
            "sam_model_loaded": self._model is not None,
            "sam_text_model_loaded": self._text_predictor is not None,
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

    def _load_text_predictor(self):
        """Load SAM 3 SemanticPredictor for text/concept prompt inference."""
        if self._text_predictor is not None:
            return
        try:
            from ultralytics.models.sam import SAM3SemanticPredictor
            model_path = self._ensure_text_model_path()
            self._text_predictor = SAM3SemanticPredictor(overrides={
                "conf": 0.25,
                "task": "segment",
                "mode": "predict",
                "model": model_path,
                "device": self.get_runtime_info()["device"],
                "save": False,
                "verbose": False,
                "half": self.get_runtime_info()["half_precision"],
            })
            runtime = self.get_runtime_info()
            print(f"[SAM3] Text predictor loaded: {model_path} on {runtime['device_label']}")
        except ImportError as e:
            raise RuntimeError(
                f"SAM3SemanticPredictor not available: {e}\n"
                "Upgrade Ultralytics: pip install -U ultralytics"
            ) from e
        except Exception as e:
            raise RuntimeError(f"Failed to load SAM 3 text model: {e}") from e

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
        predictor = self._text_predictor
        if predictor is None:
            raise RuntimeError("SAM 3 text predictor is not available")
        try:
            predictor.set_image(img_array)
            results = predictor(text=[text])
        except Exception as e:
            raise RuntimeError(f"SAM 3 text inference failed: {e}") from e
        return self._parse_results(results, img_w, img_h)

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
                    mask_img = mask_img.resize((img_w, img_h), 0)
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
