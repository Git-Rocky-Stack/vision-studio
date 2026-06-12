"""Measured-VRAM calibration harness (Spike D adjustment 1).

Run MANUALLY on a CUDA machine:  python tools/calibrate_vram.py [model-id ...]
For each catalog model with local bytes, loads it via resolve_model_runtime's
plan, runs one tiny inference, records torch.cuda.max_memory_allocated /
max_memory_reserved, and prints a JSON patch of measured_vram_bytes values
for verified-catalog.json. Blessing numbers is a DATA EDIT (spec section 3):
review the printed patch and apply it to the catalog by hand in its own
commit - this tool never writes the catalog itself.

Refuses to run without CUDA: estimates must never masquerade as measured.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

# ---------------------------------------------------------------------------
# CUDA gate — must fire BEFORE any heavy import (torch import itself is safe
# on CPU machines; the guard is purely about whether calibration is valid).
# ---------------------------------------------------------------------------

def _check_cuda() -> None:
    """Abort immediately if CUDA is unavailable.

    Called before any model work so a non-CUDA machine never accidentally
    produces numbers that could be mistaken for real GPU measurements.
    """
    try:
        import torch as _torch
    except ImportError:
        print(
            "ERROR: torch is not installed; cannot calibrate VRAM.",
            file=sys.stderr,
        )
        sys.exit(2)

    if not _torch.cuda.is_available():
        print(
            "ERROR: CUDA is not available on this machine; "
            "VRAM calibration requires a real CUDA GPU. "
            "Estimates must never masquerade as measured.",
            file=sys.stderr,
        )
        sys.exit(2)


# Fire the gate at import time so `python calibrate_vram.py` exits 2 cleanly
# even before argparse runs, and before any model imports are attempted.
_check_cuda()

# ---------------------------------------------------------------------------
# Remaining imports (only reached on CUDA machines)
# ---------------------------------------------------------------------------

import torch  # noqa: E402  — safe here; CUDA already confirmed

# Ensure the backend root is on sys.path so `from foundry...` / `from main...`
# resolve correctly whether the script is run as `python tools/calibrate_vram.py`
# from backend/ or via `python -m tools.calibrate_vram`.
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from foundry.model_record import load_catalog  # noqa: E402
from utils.direct_generator import ModelLoadRefusedError, resolve_plan  # noqa: E402
from utils.direct_video_generator import DirectVideoGenerator  # noqa: E402


# ---------------------------------------------------------------------------
# Registry helpers
# ---------------------------------------------------------------------------

def _catalog_path() -> str:
    return str(_BACKEND_ROOT / "foundry" / "verified-catalog.json")


def _ready_model_ids() -> List[str]:
    """Return all catalog ids whose record currently reports status == 'ready'.

    We read the catalog raw and then ask the running registry (via main's
    model_registry) for live status so the status_provider (model_manager)
    is consulted. On a calibration machine models are expected to be present
    so this usually resolves to 'ready' via the dir-presence fallback.

    Import choice: resolve_plan already drags in `main` (it needs MODELS_DIR,
    consent_store, and probe_hardware to build the plan), so re-using main's
    model_registry is consistent and adds no new surface. A standalone
    ModelRegistry would give us the same result on a calibration machine but
    would duplicate the status-provider wiring; the `main` import is the
    intended seam (Task 11 design).
    """
    # Lazy import: only reached on CUDA machines; keeps the import explosion
    # isolated from the gate path.
    from main import model_registry  # noqa: PLC0415

    return [
        record_id
        for record_id, record in model_registry.records.items()
        if model_registry.get_record(record_id, )  # triggers reconciliation
        and (model_registry.get_record(record_id) or {}).get("status") == "ready"
    ]


# ---------------------------------------------------------------------------
# Inference stubs — smallest possible runs to capture peak VRAM
# ---------------------------------------------------------------------------

def _run_image_inference(pipeline: Any) -> None:
    """One 128x128 / 2-step inference pass — just enough to warm all VRAM paths."""
    with torch.inference_mode():
        pipeline(
            prompt="a red circle",
            num_inference_steps=2,
            width=128,
            height=128,
        )


def _run_video_inference(pipeline: Any) -> None:
    """One minimal-frame inference pass for video pipelines."""
    with torch.inference_mode():
        # SVD requires an input image; for the others a plain text prompt works.
        # We detect by checking whether the pipeline class name contains 'Video'.
        cls_name = type(pipeline).__name__
        if "StableVideo" in cls_name:
            from PIL import Image as _Image
            dummy = _Image.new("RGB", (128, 128), color=(128, 128, 128))
            pipeline(
                dummy,
                num_frames=8,
                num_inference_steps=2,
                height=128,
                width=128,
            )
        else:
            pipeline(
                prompt="a red circle",
                num_frames=8,
                num_inference_steps=2,
                height=128,
                width=128,
            )


# ---------------------------------------------------------------------------
# Per-model calibration
# ---------------------------------------------------------------------------

def _calibrate_one(
    model_id: str,
    models_dir: str,
    output_dir: str,
) -> Optional[Dict[str, Any]]:
    """Load model_id, run one tiny inference, return measurement dict or None.

    Returns None on any failure (plan refusal, OOM, load error) — a partial
    patch of real numbers is better than an aborted run.
    """
    print(f"  calibrating {model_id} ...", file=sys.stderr)

    # -- resolve the plan ---------------------------------------------------
    try:
        plan = resolve_plan(model_id)
    except ModelLoadRefusedError as exc:
        print(f"  SKIP {model_id}: plan refused — {exc}", file=sys.stderr)
        return None
    except Exception as exc:  # noqa: BLE001
        print(f"  SKIP {model_id}: resolve_plan error — {exc}", file=sys.stderr)
        return None

    if plan.refusal:
        print(f"  SKIP {model_id}: plan.refusal = {plan.refusal!r}", file=sys.stderr)
        return None

    # -- load via the correct generator -------------------------------------
    # capability comes from the catalog record; read it back via plan indirectly
    # by checking the plan's pipeline_class name for known video classes.
    _VIDEO_PIPELINE_NAMES = {
        "StableVideoDiffusionPipeline",
        "LTXPipeline",
        "AnimateDiffPipeline",
    }
    is_video = str(plan.pipeline_class) in _VIDEO_PIPELINE_NAMES

    torch.cuda.reset_peak_memory_stats(0)

    try:
        if is_video:
            gen = DirectVideoGenerator(models_dir=models_dir, output_dir=output_dir)
            pipeline = gen.load_model(model_id)
            _run_video_inference(pipeline)
            # unload
            del gen.pipelines[model_id]
        else:
            from utils.direct_generator import DirectGenerator  # noqa: PLC0415
            gen = DirectGenerator(models_dir=models_dir, output_dir=output_dir)
            pipeline = gen.load_model(model_id)
            _run_image_inference(pipeline)
            # unload
            del gen.pipelines[model_id]

        del pipeline
    except torch.cuda.OutOfMemoryError as exc:
        print(f"  FAIL {model_id}: OOM — {exc}", file=sys.stderr)
        torch.cuda.empty_cache()
        return None
    except Exception as exc:  # noqa: BLE001
        print(f"  FAIL {model_id}: load/infer error — {exc}", file=sys.stderr)
        torch.cuda.empty_cache()
        return None

    # reserved is what the allocator actually held at peak — this is the
    # number the user's GPU must accommodate, not just what tensors occupied.
    reserved = torch.cuda.max_memory_reserved(0)
    allocated = torch.cuda.max_memory_allocated(0)

    print(
        f"  OK    {model_id}: reserved={reserved / 1e9:.2f} GB  "
        f"allocated={allocated / 1e9:.2f} GB",
        file=sys.stderr,
    )

    torch.cuda.empty_cache()

    return {
        "measured_vram_bytes": reserved,
        "precision": str(plan.precision),
        "torch": torch.__version__,
        "gpu": torch.cuda.get_device_name(0),
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "CUDA-only VRAM calibration harness. "
            "Prints a JSON patch for verified-catalog.json to stdout. "
            "NEVER writes the catalog — patch application is a human data edit."
        )
    )
    parser.add_argument(
        "model_ids",
        nargs="*",
        metavar="model-id",
        help=(
            "Catalog ids to calibrate. "
            "Defaults to all catalog entries with status='ready'."
        ),
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()

    # Resolve which models to calibrate
    if args.model_ids:
        target_ids = list(args.model_ids)
        print(
            f"Calibrating {len(target_ids)} specified model(s): "
            + ", ".join(target_ids),
            file=sys.stderr,
        )
    else:
        target_ids = _ready_model_ids()
        print(
            f"No model ids specified; found {len(target_ids)} ready model(s): "
            + (", ".join(target_ids) if target_ids else "(none)"),
            file=sys.stderr,
        )
        if not target_ids:
            print("{}", flush=True)
            return

    # Resolve runtime directories the same way main.py does
    models_dir = os.getenv(
        "MODELS_DIR",
        str(_BACKEND_ROOT / "models"),
    )
    output_dir = os.getenv(
        "OUTPUT_DIR",
        str(_BACKEND_ROOT / "outputs"),
    )
    os.makedirs(output_dir, exist_ok=True)

    print(
        f"CUDA device: {torch.cuda.get_device_name(0)}  "
        f"(torch {torch.__version__})",
        file=sys.stderr,
    )

    patch: Dict[str, Dict[str, Any]] = {}
    for model_id in target_ids:
        result = _calibrate_one(model_id, models_dir, output_dir)
        if result is not None:
            patch[model_id] = result

    # JSON patch to stdout ONLY — everything else went to stderr.
    # parseable with: python -c "import json,sys; json.load(sys.stdin)"
    print(json.dumps(patch, indent=2))


if __name__ == "__main__":
    main()
