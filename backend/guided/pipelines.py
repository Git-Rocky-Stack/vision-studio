"""#34: derive guided-pass pipeline variants from the cached base pipeline.

from_pipe() shares the already-loaded components (no second checkpoint copy),
which is why guided passes cost no extra VRAM beyond the base model (ControlNet
weights are the one addition - loaded per job and always released). The kwargs
filter handles per-family __call__ differences (FluxFill has no
strength/negative_prompt) by signature inspection - never name-sniffing -
and callers report the dropped names in the job result.
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


def derive_variant(base_pipeline: Any, kind: str, controlnet: Any = None) -> Any:
    """Derive a guided-pass variant of a loaded pipeline via from_pipe.

    kind "none" is only meaningful WITH a controlnet (txt2img + ControlNet);
    an unguided pass calls the base pipeline directly.
    """
    class_name = _VARIANT_CLASSES.get(kind)
    if class_name is None:
        raise ValueError(f"no pipeline variant for guided pass '{kind}'")
    if kind == "none" and controlnet is None:
        raise ValueError("an unguided pass needs no variant - call the base pipeline")
    if diffusers is None:
        raise RuntimeError("diffusers is not available - guided passes need the full backend")
    auto_class = getattr(diffusers, class_name)
    if controlnet is not None:
        return auto_class.from_pipe(base_pipeline, controlnet=controlnet)
    return auto_class.from_pipe(base_pipeline)


@contextmanager
def controlnets_attached(model_dirs: List[str], torch_dtype: Any, device: str):
    """Load ControlNet weights for one generation; always release afterward."""
    if diffusers is None:
        raise RuntimeError("diffusers is not available - guided passes need the full backend")
    models: List[Any] = []
    try:
        for model_dir in model_dirs:
            model = diffusers.ControlNetModel.from_pretrained(model_dir, torch_dtype=torch_dtype)
            models.append(model.to(device))
        yield models
    finally:
        models.clear()
        try:
            import torch

            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass


def filter_call_kwargs(pipeline: Any, kwargs: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    """Keep only kwargs pipeline.__call__ accepts; report what was dropped."""
    parameters = inspect.signature(pipeline.__call__).parameters
    if any(p.kind is inspect.Parameter.VAR_KEYWORD for p in parameters.values()):
        return dict(kwargs), []
    filtered = {k: v for k, v in kwargs.items() if k in parameters}
    dropped = sorted(k for k in kwargs if k not in parameters)
    return filtered, dropped
