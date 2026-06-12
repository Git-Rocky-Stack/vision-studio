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
import contextlib
import gc
import json
import logging
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

# main.py runs setup_logging() at import time: it prints a JSON log line to
# stdout AND pins a StreamHandler to the real stdout object. Both would
# corrupt the stdout-is-pure-JSON patch contract - and a handler bound to
# the real stream object bypasses any later redirect_stdout. Import main
# (and the generator modules, whose import-failure prints also hit stdout)
# under a stderr quarantine HERE, before resolve_plan or the registry can
# trigger the import uncontrolled, then retarget every stdout-bound logging
# handler onto stderr.
_REAL_STDOUT = sys.stdout
with contextlib.redirect_stdout(sys.stderr):
    import main as _main  # noqa: E402, F401  - forces setup_logging under quarantine
    from utils.direct_generator import ModelLoadRefusedError, resolve_plan  # noqa: E402
    from utils.direct_video_generator import DirectVideoGenerator  # noqa: E402

for _logger in [logging.getLogger()] + [
    logging.getLogger(_name) for _name in list(logging.root.manager.loggerDict)
]:
    for _handler in list(getattr(_logger, "handlers", [])):
        if getattr(_handler, "stream", None) is _REAL_STDOUT and hasattr(_handler, "setStream"):
            _handler.setStream(sys.stderr)


# ---------------------------------------------------------------------------
# Registry helpers
# ---------------------------------------------------------------------------

def _ready_model_ids() -> List[str]:
    """Return all catalog ids whose record currently reports status == 'ready'.

    get_record consults the registry's status_provider (model_manager), so
    each id's status reflects live disk state. On a calibration machine the
    models are expected to be present, so this usually resolves to 'ready'
    via the dir-presence fallback.

    Import choice: resolve_plan already drags in `main` (it needs MODELS_DIR,
    consent_store, and probe_hardware to build the plan), so re-using main's
    model_registry is consistent and adds no new surface. A standalone
    ModelRegistry would give us the same result on a calibration machine but
    would duplicate the status-provider wiring; the `main` import is the
    intended seam (Task 11 design).
    """
    # main was already imported (stdout-quarantined) at module level; this
    # is a cache hit, never a fresh import.
    from main import model_registry  # noqa: PLC0415

    return [
        record_id
        for record_id in model_registry.records
        if (model_registry.get_record(record_id) or {}).get("status") == "ready"
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


def _run_inpaint_inference(pipeline: Any) -> None:
    """One 128x128 / 2-step image+mask pass for inpaint pipelines.

    Inpaint pipelines (FluxFillPipeline) require image and mask_image and
    crash in preprocess on a prompt-only call — feed a tiny dummy canvas
    with a full-white mask (inpaint everything). Kwarg names verified
    against the installed diffusers FluxFillPipeline.__call__ signature.
    """
    from PIL import Image as _Image  # noqa: PLC0415

    image = _Image.new("RGB", (128, 128))
    mask = _Image.new("L", (128, 128), 255)
    with torch.inference_mode():
        pipeline(
            prompt="a red circle",
            image=image,
            mask_image=mask,
            num_inference_steps=2,
            height=128,
            width=128,
        )


def _run_video_inference(pipeline: Any, plan: Any) -> None:
    """One minimal-frame inference pass for video pipelines."""
    with torch.inference_mode():
        # svd is the only image-conditioned video pipeline in the catalog;
        # key on the plan's own pipeline_class field (exact equality against
        # the plan-declared class — never substring-sniffing the live object).
        if str(plan.pipeline_class) == "StableVideoDiffusionPipeline":
            from PIL import Image as _Image  # noqa: PLC0415
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


def _measured_precision(pipeline: Any) -> Optional[str]:
    """Map the pipeline's ACTUAL weight dtype to a catalog precision string.

    DiffusionPipeline.dtype is a property returning the first nn.Module
    component's dtype; fall back to the transformer/unet component directly
    if it is unreadable. Returns None when no recognizable dtype is found.
    """
    dtype = getattr(pipeline, "dtype", None)
    if not isinstance(dtype, torch.dtype):
        for component_name in ("transformer", "unet"):
            component_dtype = getattr(
                getattr(pipeline, component_name, None), "dtype", None
            )
            if isinstance(component_dtype, torch.dtype):
                dtype = component_dtype
                break
    return {
        torch.bfloat16: "bf16",
        torch.float16: "fp16",
        torch.float32: "fp32",
    }.get(dtype)


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
    patch of real numbers is better than an aborted run. All generator
    chatter (construction banners, "Loading model:", OOM rung messages) is
    redirected to stderr so stdout carries ONLY the final JSON patch.
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

    # -- route by the record's capability (never name-sniffed) ---------------
    # Cache hit - main was imported (stdout-quarantined) at module level.
    from main import model_registry  # noqa: PLC0415

    record = model_registry.get_record(model_id) or {}
    capability = record.get("capability") or "image"

    torch.cuda.reset_peak_memory_stats(0)

    gen: Any = None
    pipeline: Any = None
    result: Optional[Dict[str, Any]] = None
    try:
        # The Task 11 generators print progress to stdout; the redirect keeps
        # the stdout-is-pure-JSON contract intact without touching them.
        with contextlib.redirect_stdout(sys.stderr):
            if capability == "video":
                gen = DirectVideoGenerator(models_dir=models_dir, output_dir=output_dir)
            else:
                from utils.direct_generator import DirectGenerator  # noqa: PLC0415
                gen = DirectGenerator(models_dir=models_dir, output_dir=output_dir)

            pipeline = gen.load_model(model_id)

            if capability == "video":
                _run_video_inference(pipeline, plan)
            elif capability == "inpaint":
                _run_inpaint_inference(pipeline)
            else:
                _run_image_inference(pipeline)

        # Peak numbers are captured BEFORE the finally-block cleanup frees
        # anything. reserved is what the allocator actually held at peak —
        # the number the user's GPU must accommodate, not just what tensors
        # occupied.
        reserved = torch.cuda.max_memory_reserved(0)
        allocated = torch.cuda.max_memory_allocated(0)

        # load_model resolves its OWN plan and may consume OOM fallback rungs
        # (precision:fp16, offload:cpu) — the tool-side plan can therefore lie
        # about the dtype the measurement was actually taken at. Bless the
        # pipeline's REAL dtype, never the planned one.
        planned_precision = str(plan.precision)
        measured_precision = _measured_precision(pipeline)
        if measured_precision is None:
            print(
                f"  WARN  {model_id}: pipeline dtype unreadable; "
                f"reporting planned precision '{planned_precision}'",
                file=sys.stderr,
            )
            measured_precision = planned_precision
        elif measured_precision != planned_precision:
            print(
                f"  NOTE  {model_id}: ladder fired: planned {planned_precision}, "
                f"measured at {measured_precision}",
                file=sys.stderr,
            )

        print(
            f"  OK    {model_id}: reserved={reserved / 1e9:.2f} GB  "
            f"allocated={allocated / 1e9:.2f} GB",
            file=sys.stderr,
        )

        result = {
            "measured_vram_bytes": reserved,
            "precision": measured_precision,
            "torch": torch.__version__,
            "gpu": torch.cuda.get_device_name(0),
        }
    except torch.cuda.OutOfMemoryError as exc:
        print(f"  FAIL {model_id}: OOM — {exc}", file=sys.stderr)
    except Exception as exc:  # noqa: BLE001
        print(f"  FAIL {model_id}: load/infer error — {exc}", file=sys.stderr)
    finally:
        # Cross-model isolation: drop the generator's held ref and the locals
        # FIRST, then gc.collect() (offload hooks create reference cycles that
        # survive `del`), THEN empty_cache() so the allocator actually releases
        # the blocks before the next model resets peak stats and measures.
        if gen is not None:
            gen.pipelines.pop(model_id, None)
        gen = None
        pipeline = None
        gc.collect()
        torch.cuda.empty_cache()

    return result


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
