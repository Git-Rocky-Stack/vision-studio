"""HardwareProfile - the truthful probe behind /api/hardware (spec 6.1).

Lazy imports, never raises: a probe failure degrades the affected fields to
their zero/None defaults rather than erroring. gpu_available is true ONLY
when every CUDA query succeeded - a wedged driver reads as no-GPU, and the
fit logic then reports cpu-only honestly instead of planning against
numbers that do not exist (Spike D: this dev machine has no CUDA device).
"""

import os
import shutil
from dataclasses import dataclass
from typing import Optional


@dataclass
class HardwareProfile:
    gpu_available: bool = False
    gpu_name: Optional[str] = None
    vram_total_bytes: int = 0
    vram_free_bytes: int = 0
    compute_major: int = 0
    compute_minor: int = 0
    cuda_version: Optional[str] = None
    torch_available: bool = False
    system_ram_total_bytes: int = 0
    system_ram_available_bytes: int = 0
    disk_free_bytes: int = 0

    @property
    def supports_bf16(self) -> bool:
        return self.gpu_available and (self.compute_major, self.compute_minor) >= (8, 0)

    @property
    def supports_fp8(self) -> bool:
        return self.gpu_available and (self.compute_major, self.compute_minor) >= (8, 9)


def probe_hardware(models_dir: str) -> HardwareProfile:
    profile = HardwareProfile()
    try:
        import torch  # noqa: PLC0415

        profile.torch_available = True
        if torch.cuda.is_available():
            free, total = torch.cuda.mem_get_info(0)
            major, minor = torch.cuda.get_device_capability(0)
            profile.gpu_available = True
            profile.gpu_name = torch.cuda.get_device_name(0)
            profile.vram_free_bytes = int(free)
            profile.vram_total_bytes = int(total)
            profile.compute_major = int(major)
            profile.compute_minor = int(minor)
            profile.cuda_version = torch.version.cuda
    except Exception:
        # Truthful degrade: a half-probed GPU must never look usable.
        profile.gpu_available = False
        profile.gpu_name = None
        profile.vram_free_bytes = 0
        profile.vram_total_bytes = 0
    try:
        import psutil  # noqa: PLC0415

        memory = psutil.virtual_memory()
        profile.system_ram_total_bytes = int(memory.total)
        profile.system_ram_available_bytes = int(memory.available)
    except Exception:
        pass
    try:
        probe = models_dir if os.path.isdir(models_dir) else os.path.dirname(models_dir)
        profile.disk_free_bytes = int(shutil.disk_usage(probe or ".").free)
    except Exception:
        pass
    return profile
