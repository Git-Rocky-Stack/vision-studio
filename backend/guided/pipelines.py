"""#34: derive guided-pass pipeline variants from the cached base pipeline.

from_pipe() shares the already-loaded components (no second checkpoint copy),
which is why guided passes cost no extra VRAM beyond the base model (ControlNet
weights are the one addition - loaded per job and always released). The kwargs
filter handles per-family __call__ differences (FluxFill has no
strength/negative_prompt) by signature inspection - never name-sniffing -
and callers report the dropped names in the job result.
PR3 adds loader-specific model classes and explicit union/FLUX/SD3 variant
classes (from_pipe's name surgery cannot derive the union pipeline).
"""
from __future__ import annotations

import inspect
from contextlib import contextmanager
from typing import Any, Dict, List, Tuple

try:
    import diffusers
except ImportError:  # stub CI - the API surface still imports
    diffusers = None  # type: ignore[assignment]

_VARIANT_CLASSES = {
    "none": "AutoPipelineForText2Image",
    "img2img": "AutoPipelineForImage2Image",
    "inpaint": "AutoPipelineForInpainting",
}

# Loader vocabulary (guided.controlnet_registry) -> diffusers model class.
_LOADER_MODEL_CLASSES = {
    "controlnet": "ControlNetModel",
    "controlnet-union": "ControlNetUnionModel",
    "flux-controlnet": "FluxControlNetModel",
    "sd3-controlnet": "SD3ControlNetModel",
}

# ControlNet pipeline variants from_pipe's name surgery cannot derive: the
# union classes depend on the MODEL type (pure class-name string surgery
# never inserts "Union"), and flux/sd3 are pinned explicitly rather than
# trusting auto-mapping drift. Combos the registry declines have no entry -
# a missing key here is the defensive backstop, not the primary gate.
_CONTROLNET_VARIANT_CLASSES = {
    ("controlnet-union", "none"): "StableDiffusionXLControlNetUnionPipeline",
    ("controlnet-union", "img2img"): "StableDiffusionXLControlNetUnionImg2ImgPipeline",
    ("controlnet-union", "inpaint"): "StableDiffusionXLControlNetUnionInpaintPipeline",
    ("flux-controlnet", "none"): "FluxControlNetPipeline",
    ("flux-controlnet", "img2img"): "FluxControlNetImg2ImgPipeline",
    ("sd3-controlnet", "none"): "StableDiffusion3ControlNetPipeline",
}


def derive_variant(base_pipeline: Any, kind: str, controlnet: Any = None,
                   loader: str = "controlnet") -> Any:
    """Derive a guided-pass variant of a loaded pipeline via from_pipe.

    kind "none" is only meaningful WITH a controlnet (txt2img + ControlNet);
    an unguided pass calls the base pipeline directly. Non-dedicated loaders
    resolve their explicit pipeline class (see _CONTROLNET_VARIANT_CLASSES).
    """
    if kind not in _VARIANT_CLASSES:
        raise ValueError(f"no pipeline variant for guided pass '{kind}'")
    if kind == "none" and controlnet is None:
        raise ValueError("an unguided pass needs no variant - call the base pipeline")
    if diffusers is None:
        raise RuntimeError("diffusers is not available - guided passes need the full backend")
    if controlnet is not None and loader != "controlnet":
        class_name = _CONTROLNET_VARIANT_CLASSES.get((loader, kind))
        if class_name is None:
            raise ValueError(
                f"diffusers ships no '{kind}' ControlNet pipeline for loader '{loader}'"
            )
        return getattr(diffusers, class_name).from_pipe(base_pipeline, controlnet=controlnet)
    auto_class = getattr(diffusers, _VARIANT_CLASSES[kind])
    if controlnet is not None:
        return auto_class.from_pipe(base_pipeline, controlnet=controlnet)
    return auto_class.from_pipe(base_pipeline)


@contextmanager
def controlnets_attached(model_dirs: List[str], torch_dtype: Any, device: str,
                         loader: str = "controlnet"):
    """Load ControlNet weights for one generation; always release afterward."""
    if diffusers is None:
        raise RuntimeError("diffusers is not available - guided passes need the full backend")
    class_name = _LOADER_MODEL_CLASSES.get(loader)
    if class_name is None:
        raise ValueError(f"unknown ControlNet loader '{loader}'")
    model_class = getattr(diffusers, class_name)
    models: List[Any] = []
    try:
        for model_dir in model_dirs:
            model = model_class.from_pretrained(model_dir, torch_dtype=torch_dtype)
            models.append(model.to(device))
        yield models
    finally:
        models.clear()
        try:
            from utils.device import empty_device_cache

            empty_device_cache()
        except Exception:
            pass


def combine_controlnets(models: List[Any], loader: str) -> Any:
    """Shape loaded ControlNet models the way the target pipeline expects.

    Union stacks share ONE instance across every condition; FLUX and SD3
    always ride their Multi wrapper (the documented pattern, and it makes
    the per-condition scale/mode lists uniform); dedicated SD/SDXL keeps the
    PR2 plain-list MultiControlNet shape.
    """
    if loader == "controlnet-union":
        return models[0]
    if loader == "flux-controlnet":
        return diffusers.FluxMultiControlNetModel(models)
    if loader == "sd3-controlnet":
        return diffusers.SD3MultiControlNetModel(models)
    return models


def filter_call_kwargs(pipeline: Any, kwargs: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    """Keep only kwargs pipeline.__call__ accepts; report what was dropped."""
    parameters = inspect.signature(pipeline.__call__).parameters
    if any(p.kind is inspect.Parameter.VAR_KEYWORD for p in parameters.values()):
        return dict(kwargs), []
    filtered = {k: v for k, v in kwargs.items() if k in parameters}
    dropped = sorted(k for k in kwargs if k not in parameters)
    return filtered, dropped
