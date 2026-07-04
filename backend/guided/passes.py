"""#34: resolve the request's guided-pass fields into one validated plan.

THE honesty seam: everything the schema accepts either resolves into a pass
that will really run, or raises GuidedValidationError with a user-facing,
path-free message. main.py converts that to a pre-flight 422; the generator
re-resolves in the worker (pure + cheap) so there is one source of truth.
No heavy imports - loads on stub CI.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

# User-facing decline messages (honesty rails - see the #34 spec).
MSG_MULTI_REFERENCE_NOT_YET = (
    "Multiple reference images need IP-Adapter support, which is not "
    "available yet - keep one visible reference image layer (#34)."
)
MSG_INPAINT_PLUS_REFERENCE = (
    "Use either an inpaint mask or a reference image layer for a single "
    "generation - combining them is not supported yet (#34)."
)
NOTICE_REFERENCE_MASK_IGNORED = (
    "Reference mask not applied: single-reference passes run full-image "
    "img2img until IP-Adapter support lands (#34)."
)
NOTICE_CONTROLNET_PROMPT_IGNORED = (
    "ControlNet layer prompts are not supported by the local engine - the "
    "layer prompt was ignored; use the main prompt (layer prompts stay "
    "inpaint-only)."
)


class GuidedValidationError(ValueError):
    """User-facing guided-pass validation failure (never contains paths)."""


@dataclass
class GuidedPassPlan:
    kind: str = "none"  # "none" | "img2img" | "inpaint"
    image_path: Optional[str] = None
    mask: Optional[Dict[str, Any]] = None
    strength: float = 0.75
    prompt_override: Optional[str] = None
    negative_prompt_override: Optional[str] = None
    notices: List[str] = field(default_factory=list)
    # #34 PR2: validated ControlNet layers; composes with every kind above.
    controlnet: List[Dict[str, Any]] = field(default_factory=list)


def _clean(text: Optional[str]) -> Optional[str]:
    text = (text or "").strip()
    return text or None


def resolve_guided_pass(
    controlnet: Optional[List[Dict[str, Any]]],
    reference_images: Optional[List[Dict[str, Any]]],
    inpaint: Optional[Dict[str, Any]],
    denoising_strength: float,
) -> GuidedPassPlan:
    controlnet = controlnet or []
    reference_images = reference_images or []

    if len(reference_images) > 1:
        raise GuidedValidationError(MSG_MULTI_REFERENCE_NOT_YET)
    if inpaint and reference_images:
        raise GuidedValidationError(MSG_INPAINT_PLUS_REFERENCE)

    # diffusers has no per-layer ControlNet prompting; say so, don't pretend.
    notices: List[str] = []
    if any(_clean(layer.get("prompt")) or _clean(layer.get("negative_prompt"))
           for layer in controlnet):
        notices.append(NOTICE_CONTROLNET_PROMPT_IGNORED)
    controlnet = [dict(layer) for layer in controlnet]

    if inpaint:
        return GuidedPassPlan(
            kind="inpaint",
            image_path=inpaint.get("image_path"),
            mask=inpaint.get("mask"),
            strength=denoising_strength,
            prompt_override=_clean(inpaint.get("prompt")),
            negative_prompt_override=_clean(inpaint.get("negative_prompt")),
            notices=notices,
            controlnet=controlnet,
        )

    if reference_images:
        reference = reference_images[0]
        return GuidedPassPlan(
            kind="img2img",
            image_path=reference.get("source_path"),
            mask=None,  # honestly not applied - see the notice
            strength=denoising_strength,
            notices=notices + [NOTICE_REFERENCE_MASK_IGNORED],
            controlnet=controlnet,
        )

    return GuidedPassPlan(notices=notices, controlnet=controlnet)
