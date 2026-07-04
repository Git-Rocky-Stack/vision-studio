"""#34 PR1: derive guided-pass pipeline variants from the cached base pipeline.

from_pipe() shares the already-loaded components (no second checkpoint copy),
which is why guided passes cost no extra VRAM beyond the base model. The
kwargs filter handles per-family __call__ differences (FluxFill has no
strength/negative_prompt) by signature inspection - never name-sniffing -
and callers report the dropped names in the job result.
"""
from __future__ import annotations

import inspect
from typing import Any, Dict, List, Tuple

try:
    import diffusers
except ImportError:  # stub CI - the API surface still imports
    diffusers = None  # type: ignore[assignment]

_VARIANT_CLASSES = {
    "img2img": "AutoPipelineForImage2Image",
    "inpaint": "AutoPipelineForInpainting",
}


def derive_variant(base_pipeline: Any, kind: str) -> Any:
    """Derive the img2img/inpaint variant of a loaded pipeline via from_pipe."""
    class_name = _VARIANT_CLASSES.get(kind)
    if class_name is None:
        raise ValueError(f"no pipeline variant for guided pass '{kind}'")
    if diffusers is None:
        raise RuntimeError("diffusers is not available - guided passes need the full backend")
    auto_class = getattr(diffusers, class_name)
    return auto_class.from_pipe(base_pipeline)


def filter_call_kwargs(pipeline: Any, kwargs: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    """Keep only kwargs pipeline.__call__ accepts; report what was dropped."""
    parameters = inspect.signature(pipeline.__call__).parameters
    if any(p.kind is inspect.Parameter.VAR_KEYWORD for p in parameters.values()):
        return dict(kwargs), []
    filtered = {k: v for k, v in kwargs.items() if k in parameters}
    dropped = sorted(k for k in kwargs if k not in parameters)
    return filtered, dropped
