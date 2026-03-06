"""
YOLO detection service using the already-installed Ultralytics library.
Models are lazy-loaded and cached by model_path.
"""

import io
import numpy as np
from PIL import Image
from typing import Any


class YOLOService:
    def __init__(self):
        self._models: dict[str, Any] = {}

    def _load_model(self, model_path: str) -> Any:
        if model_path not in self._models:
            from ultralytics import YOLO
            self._models[model_path] = YOLO(model_path)
        return self._models[model_path]

    def detect(
        self,
        image_bytes: bytes,
        model_path: str,
        conf: float = 0.25,
        iou: float = 0.45,
    ) -> list[dict]:
        model = self._load_model(model_path)
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        w, h = image.size

        results = model.predict(
            source=np.array(image),
            conf=conf,
            iou=iou,
            verbose=False,
        )

        detections = []
        for result in results:
            boxes = result.boxes
            if boxes is None:
                continue
            for box in boxes:
                cls_idx = int(box.cls[0])
                class_name = model.names.get(cls_idx, str(cls_idx))
                confidence = float(box.conf[0])
                # xyxy absolute → xywh normalized
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                cx = (x1 + x2) / 2 / w
                cy = (y1 + y2) / 2 / h
                bw = (x2 - x1) / w
                bh = (y2 - y1) / h
                detections.append({
                    "class_name": class_name,
                    "confidence": confidence,
                    "bbox": [cx, cy, bw, bh],
                })

        return detections


yolo_service = YOLOService()
