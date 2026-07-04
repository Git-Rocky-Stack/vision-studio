"""#34 PR1: resolve the request's guided-pass fields into one validated plan.

THE honesty seam: everything the schema accepts either resolves into a pass
that will really run, or raises GuidedValidationError with a user-facing,
path-free message. main.py converts that to a pre-flight 422; the generator
re-resolves in the worker (pure + cheap) so there is one source of truth.
No heavy imports - loads on stub CI.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

# User-facing decline messages (honesty rails - see the PR1 spec).
MSG_CONTROLNET_NOT_YET = (
    "ControlNet layers are not supported by the local engine yet - hide or "
    "remove the ControlNet layer(s) to generate. ControlNet support lands in "
    "the next update (#34)."
)
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

    if controlnet:
        raise GuidedValidationError(MSG_CONTROLNET_NOT_YET)
    if len(reference_images) > 1:
        raise GuidedValidationError(MSG_MULTI_REFERENCE_NOT_YET)
    if inpaint and reference_images:
        raise GuidedValidationError(MSG_INPAINT_PLUS_REFERENCE)

    if inpaint:
        return GuidedPassPlan(
            kind="inpaint",
            image_path=inpaint.get("image_path"),
            mask=inpaint.get("mask"),
            strength=denoising_strength,
            prompt_override=_clean(inpaint.get("prompt")),
            negative_prompt_override=_clean(inpaint.get("negative_prompt")),
        )

    if reference_images:
        reference = reference_images[0]
        return GuidedPassPlan(
            kind="img2img",
            image_path=reference.get("source_path"),
            mask=None,  # honestly not applied - see the notice
            strength=denoising_strength,
            notices=[NOTICE_REFERENCE_MASK_IGNORED],
        )

    return GuidedPassPlan()
