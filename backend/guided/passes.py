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
MSG_INPAINT_PLUS_REFERENCE = (
    "Use either an inpaint mask or a reference image layer for a single "
    "generation - combining them is not supported yet (#34)."
)
MSG_OUTPAINT_PLUS_INPAINT = (
    "Use either an inpaint mask or AI Expand for a single generation - "
    "not both."
)
MSG_OUTPAINT_PLUS_REFERENCE = (
    "Use either AI Expand or a reference image layer for a single "
    "generation - combining them is not supported yet (#34)."
)
MSG_BG_REPLACE_CONFLICT = (
    "Use only one of background replacement, an inpaint mask, AI Expand, "
    "or reference layers for a single generation."
)
NOTICE_REFERENCE_MASK_IGNORED = (
    "Reference mask not applied: a single reference image runs full-image "
    "img2img - add a second visible reference layer to use masked "
    "IP-Adapter referencing."
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
    # #34 PR4: 2+ reference layers -> IP-Adapter multi-reference (kind stays
    # "none"; family/record validation lives in guided.ip_adapter).
    ip_references: List[Dict[str, Any]] = field(default_factory=list)
    # #34 PR2 (edit tools): AI Expand pre-step; only set when kind=="inpaint".
    # The generator grows the canvas and computes the border mask itself.
    outpaint: Optional[Dict[str, Any]] = None
    # #34 PR2 (edit tools): background replacement - the generator computes an
    # inverted U2-Net subject mask itself; only set when kind=="inpaint".
    background_replace: bool = False


def _clean(text: Optional[str]) -> Optional[str]:
    text = (text or "").strip()
    return text or None


def resolve_guided_pass(
    controlnet: Optional[List[Dict[str, Any]]],
    reference_images: Optional[List[Dict[str, Any]]],
    inpaint: Optional[Dict[str, Any]],
    denoising_strength: float,
    outpaint: Optional[Dict[str, Any]] = None,
    background_replace: Optional[Dict[str, Any]] = None,
) -> GuidedPassPlan:
    controlnet = controlnet or []
    reference_images = reference_images or []

    if inpaint and reference_images:
        raise GuidedValidationError(MSG_INPAINT_PLUS_REFERENCE)
    if outpaint and inpaint:
        raise GuidedValidationError(MSG_OUTPAINT_PLUS_INPAINT)
    if outpaint and reference_images:
        raise GuidedValidationError(MSG_OUTPAINT_PLUS_REFERENCE)
    if background_replace and (inpaint or outpaint or reference_images):
        raise GuidedValidationError(MSG_BG_REPLACE_CONFLICT)

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

    if outpaint:
        directions = list(outpaint.get("directions") or [])
        if not directions or any(
                d not in ("up", "down", "left", "right") for d in directions):
            raise GuidedValidationError(
                "AI Expand needs at least one valid direction "
                "(up, down, left or right)."
            )
        pixels = int(outpaint.get("pixels") or 0)
        if pixels <= 0:
            raise GuidedValidationError(
                "AI Expand needs a positive pixel amount."
            )
        return GuidedPassPlan(
            kind="inpaint",
            image_path=outpaint.get("image_path"),
            mask=None,
            strength=denoising_strength,
            prompt_override=_clean(outpaint.get("prompt")),
            negative_prompt_override=_clean(outpaint.get("negative_prompt")),
            notices=notices,
            controlnet=controlnet,
            outpaint={"directions": directions, "pixels": pixels},
        )

    if background_replace:
        return GuidedPassPlan(
            kind="inpaint",
            image_path=background_replace.get("image_path"),
            mask=None,
            strength=denoising_strength,
            prompt_override=_clean(background_replace.get("prompt")),
            negative_prompt_override=_clean(background_replace.get("negative_prompt")),
            notices=notices,
            controlnet=controlnet,
            background_replace=True,
        )

    if len(reference_images) >= 2:
        return GuidedPassPlan(
            kind="none",
            notices=notices,
            controlnet=controlnet,
            ip_references=[dict(ref) for ref in reference_images],
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
