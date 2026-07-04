"""#34 PR2: per-family preprocessor -> installed ControlNet Foundry record.

THE ControlNet honesty seam, mirroring resolve_guided_pass: a layer either
resolves to an installed record (and installed annotator weights, when the
preprocessor needs them) or raises GuidedValidationError with a user-facing,
path-free message. main.py 422s through it pre-flight; the generator
re-resolves in the worker. FLUX/SD3.5 and the SDXL union model land in PR3.
No heavy imports - loads on stub CI.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional

from guided.passes import GuidedValidationError
from guided.preprocessors import PREPROCESSORS

RecordResolver = Callable[[str], Optional[Dict[str, Any]]]

FAMILY_LABELS = {"sd15": "SD 1.5", "sdxl": "SDXL", "flux": "FLUX", "sd35": "SD 3.5"}

# (family -> preprocessor -> ControlNet catalog record id). Annotator ids come
# from PREPROCESSORS - single source of truth for preprocessor requirements.
_STACKS: Dict[str, Dict[str, str]] = {
    "sd15": {
        "canny": "controlnet-canny-sd15",
        "depth": "controlnet-depth-sd15",
        "openpose": "controlnet-openpose-sd15",
        "scribble": "controlnet-scribble-sd15",
        "normal": "controlnet-normal-sd15",
    },
    "sdxl": {
        "canny": "controlnet-canny-sdxl",
        "depth": "controlnet-depth-sdxl",
        "openpose": "controlnet-openpose-sdxl",
    },
}

SUPPORTED_FAMILIES = set(_STACKS)


@dataclass(frozen=True)
class ResolvedControlLayer:
    record_id: str
    annotator_record_id: Optional[str]
    layer: Dict[str, Any]


def _require_installed(record_id: str, resolve_record: RecordResolver, kind: str) -> None:
    record = resolve_record(record_id) or {}
    if record.get("status") != "ready":
        name = record.get("name") or record_id
        raise GuidedValidationError(
            f"The {kind} '{name}' is not installed - install '{record_id}' "
            "from the Foundry first."
        )


def resolve_controlnet_stack(
    layers: Optional[List[Dict[str, Any]]],
    family: Optional[str],
    resolve_record: RecordResolver,
) -> List[ResolvedControlLayer]:
    layers = layers or []
    if not layers:
        return []

    stacks = _STACKS.get(family or "")
    if stacks is None:
        label = FAMILY_LABELS.get(family or "", family or "this model")
        raise GuidedValidationError(
            f"ControlNet on {label} is not supported yet - it lands in the next "
            "update (#34 PR3). Switch to an SD 1.5 or SDXL checkpoint, or hide "
            "the ControlNet layer(s)."
        )

    resolved: List[ResolvedControlLayer] = []
    for layer in layers:
        preprocessor = (layer.get("preprocessor") or "").strip()
        record_id = stacks.get(preprocessor)
        if record_id is None:
            label = FAMILY_LABELS.get(family or "", family or "this model")
            supported = ", ".join(sorted(stacks))
            raise GuidedValidationError(
                f"No ControlNet model is available for the '{preprocessor}' "
                f"preprocessor on {label} yet - supported on {label}: {supported}."
            )
        spec = PREPROCESSORS[preprocessor]
        _require_installed(record_id, resolve_record, "ControlNet model")
        if spec.annotator_record_id:
            _require_installed(spec.annotator_record_id, resolve_record, "preprocessor annotator")
        resolved.append(ResolvedControlLayer(
            record_id=record_id,
            annotator_record_id=spec.annotator_record_id,
            layer=dict(layer),
        ))
    return resolved
