"""Tiny-VAE (taesd) preview decoders (#33).

Maps checkpoint families to the shipped AutoencoderTiny decoder weights and
turns in-flight diffusion latents into small JPEG data URIs for the live
step preview. Every failure path degrades to "no preview" - never into a
generation failure. Error strings stay path-free (they can reach the UI).
"""

import base64
import io
import os
import sys
import threading
from typing import Any, Dict, Optional

# base_architecture (verified catalog) -> decoder weights dir name.
FAMILY_DECODERS: Dict[str, str] = {
    "sd15": "taesd",
    "sdxl": "taesdxl",
    "sd35": "taesd3",
    "flux": "taef1",
}

ENV_DECODERS_DIR = "VISION_STUDIO_PREVIEW_DECODERS_DIR"

MAX_PREVIEW_EDGE = 512
JPEG_QUALITY = 70


class PreviewDecoderUnavailable(Exception):
    """No decoder can serve this family (unsupported, or weights missing)."""


def _backend_root() -> str:
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def resolve_decoders_dir() -> Optional[str]:
    """Locate the preview-decoders root, or None when previews are disabled.

    Precedence: explicit env override (an override pointing nowhere disables
    previews rather than silently falling through), the PyInstaller bundle's
    sibling dir, the dev checkout's resources/, then the packaged
    backend-source fallback's sibling dir.
    """
    env_dir = os.environ.get(ENV_DECODERS_DIR, "").strip()
    if env_dir:
        return env_dir if os.path.isdir(env_dir) else None

    candidates = []
    if getattr(sys, "frozen", False):
        candidates.append(
            os.path.join(os.path.dirname(sys.executable), "preview-decoders"))
    backend_root = _backend_root()
    candidates.append(os.path.normpath(
        os.path.join(backend_root, "..", "resources", "preview-decoders")))
    candidates.append(os.path.normpath(
        os.path.join(backend_root, "..", "preview-decoders")))

    for candidate in candidates:
        if os.path.isdir(candidate):
            return candidate
    return None


def decoder_dir_for_family(family: Optional[str]) -> str:
    name = FAMILY_DECODERS.get(family or "")
    if not name:
        raise PreviewDecoderUnavailable(
            f"No step-preview decoder exists for the '{family or 'unknown'}' family.")
    root = resolve_decoders_dir()
    if not root:
        raise PreviewDecoderUnavailable(
            "Step-preview decoder weights are not installed.")
    path = os.path.join(root, name)
    if not os.path.isdir(path):
        raise PreviewDecoderUnavailable(
            f"The step-preview decoder '{name}' is not installed.")
    return path


_decoder_cache: Dict[str, Any] = {}
_cache_lock = threading.Lock()


def _clear_decoder_cache() -> None:
    with _cache_lock:
        _decoder_cache.clear()


def load_decoder(family: Optional[str], device: str = "cpu"):
    """Cached AutoencoderTiny for the family, eval-mode, float32, on device."""
    path = decoder_dir_for_family(family)
    key = f"{family}::{device}"
    with _cache_lock:
        cached = _decoder_cache.get(key)
    if cached is not None:
        return cached

    try:
        import torch
        from diffusers import AutoencoderTiny
    except ImportError as exc:
        raise PreviewDecoderUnavailable(
            "torch/diffusers are not available for step previews.") from exc

    try:
        decoder = AutoencoderTiny.from_pretrained(path, torch_dtype=torch.float32)
        decoder = decoder.to(device)
        decoder.eval()
    except Exception as exc:
        raise PreviewDecoderUnavailable(
            f"The step-preview decoder '{FAMILY_DECODERS[family]}' failed to load."
        ) from exc

    with _cache_lock:
        _decoder_cache[key] = decoder
    return decoder


def _unpack_flux_latents(latents, width: int, height: int):
    """Packed FLUX latents [B, (H/16)(W/16), 64] -> [B, 16, H/8, W/8].

    Mirrors FluxPipeline._unpack_latents with vae_scale_factor=8 (kept local:
    the pipeline helper is private API).
    """
    batch_size, _, channels = latents.shape
    lat_h = 2 * (int(height) // 16)
    lat_w = 2 * (int(width) // 16)
    latents = latents.view(batch_size, lat_h // 2, lat_w // 2, channels // 4, 2, 2)
    latents = latents.permute(0, 3, 1, 4, 2, 5)
    return latents.reshape(batch_size, channels // 4, lat_h, lat_w)


def decode_latents_to_data_uri(
    latents, family: Optional[str], width: int, height: int
) -> str:
    """Decode one latent batch into a JPEG data URI (longest edge <= 512).

    Raises PreviewDecoderUnavailable (or any decode error) - the calling
    service converts every exception into "preview disabled for this job".
    """
    import torch
    from PIL import Image

    decoder = load_decoder(family)
    with torch.no_grad():
        lat = latents.detach()
        if family == "flux" and lat.dim() == 3:
            lat = _unpack_flux_latents(lat, width, height)
        lat = lat[:1].to(device=decoder.device, dtype=decoder.dtype)
        config = decoder.config
        scaling = float(getattr(config, "scaling_factor", 1.0) or 1.0)
        shift = float(getattr(config, "shift_factor", 0.0) or 0.0)
        lat = lat / scaling + shift
        image = decoder.decode(lat).sample[0]
        image = (image / 2 + 0.5).clamp(0, 1)
        array = (image.permute(1, 2, 0).cpu().float().numpy() * 255).round().astype("uint8")

    pil = Image.fromarray(array)
    longest = max(pil.size)
    if longest > MAX_PREVIEW_EDGE:
        scale = MAX_PREVIEW_EDGE / longest
        pil = pil.resize(
            (max(1, round(pil.width * scale)), max(1, round(pil.height * scale))),
            Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    pil.convert("RGB").save(buffer, format="JPEG", quality=JPEG_QUALITY)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"
