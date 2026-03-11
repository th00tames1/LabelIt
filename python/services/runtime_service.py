import os
import subprocess


def get_ai_device_mode() -> str:
    mode = os.getenv("LABELING_TOOL_AI_DEVICE", "auto").strip().lower()
    if mode in {"auto", "cpu", "gpu"}:
        return mode
    return "auto"


def get_runtime_info() -> dict:
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

        preferred_mode = get_ai_device_mode()
        if preferred_mode in {"auto", "gpu"} and cuda_available:
            info.update({
                "device": "cuda:0",
                "device_label": f"CUDA GPU ({torch.cuda.get_device_name(0)})",
                "acceleration": "gpu",
                "half_precision": True,
            })
        elif preferred_mode in {"auto", "gpu"} and mps_available:
            info.update({
                "device": "mps",
                "device_label": "Apple Metal GPU (MPS)",
                "acceleration": "gpu",
                "half_precision": False,
            })
        elif preferred_mode == "cpu":
            info.update({
                "device": "cpu",
                "device_label": "CPU (manual)",
                "acceleration": "cpu",
                "half_precision": False,
            })
        else:
            info.update({
                "device": "cpu",
                "device_label": "CPU (auto)",
                "acceleration": "cpu",
                "half_precision": False,
            })
    except Exception:
        pass

    if info["nvidia_gpu_detected"] and get_ai_device_mode() in {"auto", "gpu"} and not info["cuda_available"]:
        info["setup_hint"] = "NVIDIA GPU detected, but this Python environment is still using CPU-only PyTorch."

    return info
