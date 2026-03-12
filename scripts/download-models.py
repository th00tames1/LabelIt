#!/usr/bin/env python3
"""
SAM 3 Model Setup Script
========================
SAM 3 (Segment Anything Model 3) by Meta AI — released November 2025.
The weights are not auto-downloaded; you need to place sam3.pt manually after approval.

This script verifies the SAM 3 model location and prints setup instructions.

Usage:
  python scripts/download-models.py

Or let Ultralytics auto-download on first SAM prediction (requires internet on first run).
"""

import os
import sys

MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "python", "models")
os.makedirs(MODELS_DIR, exist_ok=True)

SAM3_PATH = os.path.join(MODELS_DIR, "sam3.pt")
SAM3_ULTRALYTICS_CACHE = os.path.expanduser("~/.ultralytics/assets/sam3.pt")

print("=" * 60)
print("  LabelingTool — SAM 3 Model Setup")
print("=" * 60)
print()
print("Model: SAM 3 (Segment Anything Model 3)")
print("By:    Meta AI — released November 19, 2025")
print("Size:  ~3.4 GB (sam3.pt)")
print()
print("Supports:")
print("  • Point prompts  — left-click positive, right-click negative")
print("  • Text prompts   — describe what to segment ('car', 'person', ...)")
print()

# ── Check manual placement ────────────────────────────────────────────────────
if os.path.exists(SAM3_PATH):
    size_mb = os.path.getsize(SAM3_PATH) / 1024 / 1024
    print(f"[OK] Model found at: {SAM3_PATH}")
    print(f"     Size: {size_mb:.0f} MB")
# ── Check Ultralytics cache ───────────────────────────────────────────────────
elif os.path.exists(SAM3_ULTRALYTICS_CACHE):
    size_mb = os.path.getsize(SAM3_ULTRALYTICS_CACHE) / 1024 / 1024
    print(f"[OK] Model found in Ultralytics cache:")
    print(f"     {SAM3_ULTRALYTICS_CACHE}")
    print(f"     Size: {size_mb:.0f} MB")
    print()
    print("Tip: Copy to python/models/sam3.pt for faster startup:")
    print(f"     copy \"{SAM3_ULTRALYTICS_CACHE}\" \"{SAM3_PATH}\"")
# ── Offer to download via Ultralytics ────────────────────────────────────────
else:
    print("[INFO] SAM 3 model not found locally.")
    print()
    print("The model is not present locally yet.")
    print("  Download size: ~3.4 GB")
    print("  Request access and download from: https://huggingface.co/facebook/sam3")
    print()
    print("Once approved, place the file here:")
    print()
    print(f"  {SAM3_PATH}")
    print()
    print("If you already downloaded it somewhere else, copy it into the project models directory.")

print()
print("=" * 60)
print("  Performance Notes")
print("=" * 60)
print()
print("  CPU (e.g. Intel/AMD without GPU):  ~60–180 seconds per image")
print("  GPU (NVIDIA CUDA):                 ~1–5 seconds per image")
print()
print("  For best performance, install PyTorch with CUDA support:")
print("  https://pytorch.org/get-started/locally/")
print()
print("Done.")
