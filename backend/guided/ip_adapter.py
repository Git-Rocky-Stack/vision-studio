"""#34 PR4: reference-image layers -> per-family IP-Adapter execution.

THE multi-reference honesty seam, mirroring controlnet_registry: two or more
visible reference layers either resolve to installed adapter + encoder
records for the active family, or raise GuidedValidationError with a
user-facing, path-free message. SD 1.5 / SDXL honor per-layer masks via
diffusers ip_adapter_masks; FLUX applies references globally and says so
through an explicit notice; SD 3.5 declines (diffusers 0.37.x ships a
single-image SD3 IP-Adapter - verified against the venv source). Keep
src/features/generation/referenceSupport.ts in sync with every map and
message below. No heavy imports at module scope - loads on stub CI.
"""
from __future__ import annotations

import os
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

# Same installed-record gate and message shape as the ControlNet seam - the
# two registries must decline identically, so share the helper.
from guided.controlnet_registry import _require_installed
from guided.passes import GuidedValidationError

RecordResolver = Callable[[str], Optional[Dict[str, Any]]]

FAMILY_LABELS = {"sd15": "SD 1.5", "sdxl": "SDXL", "flux": "FLUX", "sd35": "SD 3.5"}

# Loader vocabulary consumed by ip_adapter_applied / direct_generator.
# "ip-sd": IPAdapterMixin - ONE adapter, a list of images, per-image masks.
# "ip-flux": FluxIPAdapterMixin - one adapter INSTANCE per image, no masks.
LOADER_SD = "ip-sd"
LOADER_FLUX = "ip-flux"

_ADAPTERS: Dict[str, Dict[str, Any]] = {
    "sd15": {
        "adapter_record": "ip-adapter-sd15",
        "adapter_subfolder": "models",
        "weight_name": "ip-adapter_sd15.safetensors",
        "encoder_record": "ip-adapter-encoder-vit-h",
        "encoder_subpath": os.path.join("models", "image_encoder"),
        "loader": LOADER_SD,
        "masked": True,
    },
    "sdxl": {
        "adapter_record": "ip-adapter-sdxl",
        "adapter_subfolder": "sdxl_models",
        "weight_name": "ip-adapter_sdxl_vit-h.safetensors",
        "encoder_record": "ip-adapter-encoder-vit-h",
        "encoder_subpath": os.path.join("models", "image_encoder"),
        "loader": LOADER_SD,
        "masked": True,
    },
    "flux": {
        "adapter_record": "ip-adapter-flux",
        "adapter_subfolder": "",
        "weight_name": "ip_adapter.safetensors",
        "encoder_record": "ip-adapter-encoder-clip-vit-l",
        "encoder_subpath": "",
        "loader": LOADER_FLUX,
        "masked": False,
    },
}

SUPPORTED_FAMILIES = set(_ADAPTERS)

# Known-incompatible catalog checkpoints inside supported families (the PR3
# ControlNet decline precedent). User imports resolve by family and fail
# loudly at load time if truly mismatched.
_CHECKPOINT_DECLINES = {
    "flux-schnell": (
        "FLUX.1 [schnell] is a distilled checkpoint the FLUX IP-Adapter does "
        "not support - switch to FLUX.1 [dev]."
    ),
}

MSG_SD35_SINGLE_IMAGE = (
    "The SD 3.5 IP-Adapter accepts a single image, so multiple reference "
    "layers cannot run on SD 3.5 - keep one visible reference image layer "
    "or switch to SD 1.5, SDXL, or FLUX.1 [dev]."
)

NOTICE_REFERENCE_MASKS_GLOBAL = (
    "Reference masks are not supported on FLUX - every reference image was "
    "applied to the whole generation."
)


@dataclass(frozen=True)
class ResolvedIPAdapterStack:
    adapter_record_id: str
    encoder_record_id: str
    adapter_subfolder: str
    weight_name: str
    encoder_subpath: str
    loader: str
    masked: bool
    references: List[Dict[str, Any]] = field(default_factory=list)

    @property
    def instances(self) -> int:
        """Adapter copies loaded into memory (FLUX: one per reference)."""
        return len(self.references) if self.loader == LOADER_FLUX else 1

    @property
    def notices(self) -> List[str]:
        return [] if self.masked else [NOTICE_REFERENCE_MASKS_GLOBAL]


def resolve_ip_reference_stack(
    references: Optional[List[Dict[str, Any]]],
    family: Optional[str],
    resolve_record: RecordResolver,
    model_id: Optional[str] = None,
) -> Optional[ResolvedIPAdapterStack]:
    """2+ references -> installed records, or a user-facing decline.

    A single reference is img2img (guided.passes) - not this seam's business.
    """
    references = references or []
    if len(references) < 2:
        return None

    family = family or ""
    if family == "sd35":
        raise GuidedValidationError(MSG_SD35_SINGLE_IMAGE)
    spec = _ADAPTERS.get(family)
    if spec is None:
        label = FAMILY_LABELS.get(family, family or "this model")
        raise GuidedValidationError(
            f"Multiple reference images are not supported on {label} - keep "
            "one visible reference image layer or switch to an SD 1.5, SDXL, "
            "or FLUX.1 [dev] checkpoint."
        )
    decline = _CHECKPOINT_DECLINES.get(model_id or "")
    if decline:
        raise GuidedValidationError(decline)

    _require_installed(spec["adapter_record"], resolve_record, "IP-Adapter model")
    _require_installed(spec["encoder_record"], resolve_record, "IP-Adapter image encoder")
    return ResolvedIPAdapterStack(
        adapter_record_id=spec["adapter_record"],
        encoder_record_id=spec["encoder_record"],
        adapter_subfolder=spec["adapter_subfolder"],
        weight_name=spec["weight_name"],
        encoder_subpath=spec["encoder_subpath"],
        loader=spec["loader"],
        masked=spec["masked"],
        references=[dict(ref) for ref in references],
    )


def ip_adapter_scales(stack: ResolvedIPAdapterStack) -> List[Any]:
    """Layer strengths -> the exact shape set_ip_adapter_scale expects.

    SD/SDXL: ONE adapter with a per-image scale list (list-of-lists - the
    attention processor zips scale[i] per masked image). FLUX: one scalar
    per adapter instance.
    """
    scales = [float(ref.get("strength", 1.0)) for ref in stack.references]
    if stack.loader == LOADER_FLUX:
        return scales
    return [scales]


def ip_adapter_mask_tensor(mask_images: List[Any], height: int, width: int) -> List[Any]:
    """Rasterized PIL masks -> [tensor(1, N, H, W)] for ip_adapter_masks.

    IPAdapterMaskProcessor.preprocess returns (N, 1, H, W); diffusers'
    masking contract wants one (1, num_images, H, W) tensor per adapter.
    """
    from diffusers.image_processor import IPAdapterMaskProcessor

    masks = IPAdapterMaskProcessor().preprocess(mask_images, height=height, width=width)
    return [masks.reshape(1, masks.shape[0], masks.shape[2], masks.shape[3])]


def _load_image_encoder(encoder_dir: str, torch_dtype: Any, device: str) -> Any:
    """CLIPVisionModelWithProjection from an installed encoder record dir.

    Module-level seam so unit tests can stub the heavy load. Both the ViT-H
    (h94) and CLIP ViT-L (openai) records load through this class.
    """
    from transformers import CLIPVisionModelWithProjection

    return CLIPVisionModelWithProjection.from_pretrained(
        encoder_dir, torch_dtype=torch_dtype
    ).to(device)


@contextmanager
def ip_adapter_applied(pipeline: Any, stack: ResolvedIPAdapterStack,
                       adapter_dir: str, encoder_dir: str, device: str):
    """Load adapter + encoder for ONE generation; ALWAYS restore afterward.

    The encoder registers on the pipeline BEFORE load_ip_adapter so diffusers
    skips its own hub-download path entirely (installed records are the only
    weight source) and derives the feature extractor from the real encoder
    config. unload_ip_adapter restores the original attention processors on
    the SHARED unet/transformer - without it the cached base pipeline would
    keep IP cross-attention wired on the next unguided job.
    """
    encoder = _load_image_encoder(encoder_dir, getattr(pipeline, "dtype", None), device)
    weights = [stack.weight_name] * stack.instances
    try:
        pipeline.register_modules(image_encoder=encoder)
        if stack.loader == LOADER_FLUX:
            pipeline.load_ip_adapter(
                adapter_dir,
                weight_name=weights,
                subfolder=stack.adapter_subfolder,
            )
        else:
            pipeline.load_ip_adapter(
                adapter_dir,
                subfolder=stack.adapter_subfolder,
                weight_name=weights,
                image_encoder_folder=None,
            )
        pipeline.set_ip_adapter_scale(ip_adapter_scales(stack))
        yield
    finally:
        pipeline.unload_ip_adapter()
        try:
            from utils.device import empty_device_cache

            empty_device_cache()
        except Exception:
            pass
