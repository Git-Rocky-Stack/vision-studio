"""#34 PR2/PR3: per-family preprocessor -> installed ControlNet Foundry record.

THE ControlNet honesty seam, mirroring resolve_guided_pass: a layer either
resolves to an installed record (and installed annotator weights, when the
preprocessor needs them) or raises GuidedValidationError with a user-facing,
path-free message. main.py 422s through it pre-flight; the generator
re-resolves in the worker.

PR3: FLUX and SD 3.5 Large land, and the SDXL union model unlocks scribble +
normal. Union stacks resolve every layer to ONE record with a per-layer
control_mode; dedicated stacks keep the PR2 one-record-per-preprocessor
shape. Known-incompatible checkpoints (flux-schnell, sd3.5-medium) and
pipeline combos diffusers does not ship decline with the exact reason.
Keep src/features/generation/controlnetSupport.ts in sync with every map
and message below. No heavy imports - loads on stub CI.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional

from guided.passes import GuidedValidationError
from guided.preprocessors import PREPROCESSORS

RecordResolver = Callable[[str], Optional[Dict[str, Any]]]

FAMILY_LABELS = {"sd15": "SD 1.5", "sdxl": "SDXL", "flux": "FLUX", "sd35": "SD 3.5"}

# Loader vocabulary consumed by guided.pipelines (one diffusers model class
# and pipeline-variant family per value).
LOADER_CONTROLNET = "controlnet"
LOADER_UNION_SDXL = "controlnet-union"
LOADER_FLUX = "flux-controlnet"
LOADER_SD3 = "sd3-controlnet"

# Dedicated one-record-per-preprocessor stacks (PR2 shape). Annotator ids come
# from PREPROCESSORS - single source of truth for preprocessor requirements.
_DEDICATED: Dict[str, Dict[str, str]] = {
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
    "sd35": {
        "canny": "controlnet-canny-sd35",
        "depth": "controlnet-depth-sd35",
    },
}

# Union stacks: ONE record serves several preprocessors via control_mode.
# Mode indices come from the model cards (xinsir/controlnet-union-sdxl-1.0;
# InstantX/FLUX.1-dev-Controlnet-Union) - diffusers' own union example uses
# the same numbering.
_UNIONS: Dict[str, Dict[str, Any]] = {
    "sdxl": {
        "record_id": "controlnet-union-sdxl",
        "loader": LOADER_UNION_SDXL,
        "modes": {"openpose": 0, "depth": 1, "scribble": 2, "canny": 3, "normal": 4},
    },
    "flux": {
        "record_id": "controlnet-union-flux",
        "loader": LOADER_FLUX,
        "modes": {"canny": 0, "depth": 2, "openpose": 4},
    },
}

_FAMILY_LOADERS = {"sd15": LOADER_CONTROLNET, "sdxl": LOADER_CONTROLNET,
                   "sd35": LOADER_SD3}

SUPPORTED_FAMILIES = set(_DEDICATED) | set(_UNIONS)

# Known-incompatible catalog checkpoints inside supported families. User
# imports resolve by family and fail loudly at load time if truly mismatched.
_CHECKPOINT_DECLINES = {
    "flux-schnell": (
        "FLUX.1 [schnell] is a distilled checkpoint the FLUX ControlNet union "
        "does not support - switch to FLUX.1 [dev]."
    ),
    "sd3.5-medium": (
        "The SD 3.5 ControlNets are trained for SD 3.5 Large only - switch to "
        "the SD 3.5 Large checkpoint."
    ),
}

# ControlNet composes only where diffusers ships the combined pipeline class.
_UNSUPPORTED_KINDS = {
    "flux": {
        "inpaint": (
            "FLUX inpainting runs on FLUX.1 Fill, which has no ControlNet "
            "path - hide the ControlNet layer(s) or clear the inpaint mask."
        ),
    },
    "sd35": {
        "img2img": (
            "ControlNet with a reference image is not supported on SD 3.5 - "
            "remove the reference layer or switch to SD 1.5, SDXL, or FLUX."
        ),
        "inpaint": (
            "ControlNet with inpainting is not supported on SD 3.5 - clear "
            "the inpaint mask or switch to SD 1.5 or SDXL."
        ),
    },
}


@dataclass(frozen=True)
class ResolvedControlLayer:
    record_id: str
    annotator_record_id: Optional[str]
    layer: Dict[str, Any]
    loader: str = LOADER_CONTROLNET
    control_mode: Optional[int] = None


def _require_installed(record_id: str, resolve_record: RecordResolver, kind: str) -> None:
    record = resolve_record(record_id) or {}
    if record.get("status") != "ready":
        name = record.get("name") or record_id
        raise GuidedValidationError(
            f"The {kind} '{name}' is not installed - install '{record_id}' "
            "from the Foundry first."
        )


def _raise_unsupported_preprocessor(name: str, family: str, supported: List[str]) -> None:
    label = FAMILY_LABELS.get(family, family or "this model")
    raise GuidedValidationError(
        f"No ControlNet model is available for the '{name}' preprocessor on "
        f"{label} - supported on {label}: {', '.join(supported)}."
    )


def _require_annotator(preprocessor: str, resolve_record: RecordResolver) -> Optional[str]:
    spec = PREPROCESSORS[preprocessor]
    if spec.annotator_record_id:
        _require_installed(spec.annotator_record_id, resolve_record, "preprocessor annotator")
    return spec.annotator_record_id


def resolve_controlnet_stack(
    layers: Optional[List[Dict[str, Any]]],
    family: Optional[str],
    resolve_record: RecordResolver,
    model_id: Optional[str] = None,
    kind: str = "none",
) -> List[ResolvedControlLayer]:
    layers = layers or []
    if not layers:
        return []

    family = family or ""
    if family not in SUPPORTED_FAMILIES:
        label = FAMILY_LABELS.get(family, family or "this model")
        raise GuidedValidationError(
            f"ControlNet is not supported on {label} - switch to an SD 1.5, "
            "SDXL, FLUX, or SD 3.5 Large checkpoint, or hide the ControlNet "
            "layer(s)."
        )
    decline = _CHECKPOINT_DECLINES.get(model_id or "")
    if decline:
        raise GuidedValidationError(decline)
    kind_reason = _UNSUPPORTED_KINDS.get(family, {}).get(kind)
    if kind_reason:
        raise GuidedValidationError(kind_reason)

    dedicated = _DEDICATED.get(family, {})
    union = _UNIONS.get(family)
    names = [(layer.get("preprocessor") or "").strip() for layer in layers]
    supported = sorted(set(dedicated) | set((union or {}).get("modes", {})))

    # Dedicated + union models cannot mix in one MultiControlNet: when any
    # layer needs the union, the whole stack rides it (deterministic routing,
    # independent of what happens to be installed).
    use_union = union is not None and (
        family not in _DEDICATED or any(name not in dedicated for name in names)
    )

    resolved: List[ResolvedControlLayer] = []
    if use_union:
        modes = union["modes"]
        for name in names:
            if name not in modes:
                _raise_unsupported_preprocessor(name, family, supported)
        _require_installed(union["record_id"], resolve_record, "ControlNet model")
        for layer, name in zip(layers, names):
            resolved.append(ResolvedControlLayer(
                record_id=union["record_id"],
                annotator_record_id=_require_annotator(name, resolve_record),
                layer=dict(layer),
                loader=union["loader"],
                control_mode=modes[name],
            ))
        return resolved

    loader = _FAMILY_LOADERS[family]
    for layer, name in zip(layers, names):
        record_id = dedicated.get(name)
        if record_id is None:
            _raise_unsupported_preprocessor(name, family, supported)
        _require_installed(record_id, resolve_record, "ControlNet model")
        resolved.append(ResolvedControlLayer(
            record_id=record_id,
            annotator_record_id=_require_annotator(name, resolve_record),
            layer=dict(layer),
            loader=loader,
            control_mode=None,
        ))
    return resolved
