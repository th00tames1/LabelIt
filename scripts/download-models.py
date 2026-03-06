#!/usr/bin/env python3
"""
SAM 3 Model Setup Script
========================
SAM 3 (Segment Anything Model 3) by Meta AI — released November 2025.
Ultralytics handles automatic model download on first use.

This script verifies/pre-downloads the SAM 3 model and prints setup instructions.

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
    print("The model will be downloaded automatically by Ultralytics on first use.")
    print("  Download size: ~3.4 GB")
    print("  Download URL:  https://github.com/ultralytics/assets/releases/")
    print()
    print("To pre-download now, run:")
    print()
    print("  python -c \"from ultralytics import SAM; SAM('sam3.pt')\"")
    print()
    print("Or activate the Python venv first:")
    print("  python\\Scripts\\activate")
    print("  python -c \"from ultralytics import SAM; SAM('sam3.pt')\"")
    print()
    print("Then optionally copy to the project models directory for reproducibility:")
    print(f"  copy %USERPROFILE%\\.ultralytics\\assets\\sam3.pt \"{SAM3_PATH}\"")
    print()

    # Offer auto-download
    try:
        answer = input("Download SAM 3 now? (requires internet) [y/N]: ").strip().lower()
    except (EOFError, KeyboardInterrupt):
        answer = "n"

    if answer == "y":
        print()
        print("Importing Ultralytics (this may install/update packages)...")
        try:
            from ultralytics import SAM  # noqa: F401
            print("Triggering SAM 3 download via Ultralytics...")
            model = SAM("sam3.pt")
            del model
            print()
            print("[OK] SAM 3 downloaded successfully.")
            # Copy to local models dir
            if os.path.exists(SAM3_ULTRALYTICS_CACHE) and not os.path.exists(SAM3_PATH):
                import shutil
                shutil.copy2(SAM3_ULTRALYTICS_CACHE, SAM3_PATH)
                print(f"[OK] Copied to: {SAM3_PATH}")
        except ImportError:
            print()
            print("[ERROR] Ultralytics not installed. Run setup first:")
            print("  scripts\\setup-python-env.bat")
            sys.exit(1)
        except Exception as e:
            print(f"[ERROR] Download failed: {e}")
            sys.exit(1)
    else:
        print("Skipped. SAM 3 will auto-download on first prediction.")

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
