"""Measured acceleration benchmark + correctness sweep (M9 S8).

Run MANUALLY on a CUDA machine:  python tools/benchmark_accel.py [model-id ...]
For each model it runs an UNACCELERATED reference pass and an ACCELERATED pass,
measures latency + peak VRAM, and verifies the accelerated output stays within
tolerance of the reference. A config that fails correctness is reported
"FAILED" and excluded from the allowlist - this is how the per-family quant/TRT
allowlists are populated with EVIDENCE, not assertion.

Prints a JSON perf patch to stdout ONLY (a human catalog data edit); never
writes the catalog. Refuses to run without CUDA: measured must never masquerade
as estimated.

Design note (differs from calibrate_vram.py): the CUDA gate fires inside
``main()``, NOT at import. The torch-free helpers (outputs_within_tolerance,
build_perf_patch) must import on a CPU CI box for their unit tests, so this
module imports torch / diffusers / main lazily inside the sweep functions and
defers ``_check_cuda()`` to run entry. ``python tools/benchmark_accel.py`` on a
CPU box still exits 2 because ``main()`` calls the gate before any model work.
"""

from __future__ import annotations

import argparse
import contextlib
import gc
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

# Backend root on sys.path so `from foundry...` / `from main...` / `import
# tools.benchmark_accel` resolve whether run as `python tools/benchmark_accel.py`
# from backend/, via `python -m tools.benchmark_accel`, or imported by a test.
# CPU-safe (pathlib only): no torch import here, so the pure helpers below stay
# importable on a stub-CI box.
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

# Tuning constants for the sweep. The downscaled comparison dimension keeps the
# correctness check cheap and resolution-independent; the threshold is a
# conservative max-pixel-delta bound that absorbs the small numeric drift
# torch.compile / quantization introduce while still catching a broken config.
_SEED = 0
_COMPARE_DIM = 64
_CORRECTNESS_THRESHOLD = 0.08
_BENCH_PROMPT = "a red circle on a white background"
_BENCH_RES = 512
_BENCH_STEPS = 20
_BENCH_VIDEO_RES = 256
_BENCH_VIDEO_STEPS = 10
_BENCH_VIDEO_FRAMES = 8


# --- pure, torch-free helpers (importable on CI for unit tests) -------------

def outputs_within_tolerance(reference: Sequence[Sequence[float]],
                             candidate: Sequence[Sequence[float]],
                             threshold: float) -> bool:
    """True when the max absolute per-element delta is <= threshold. A simple,
    deterministic proxy for the LPIPS/max-pixel-delta check (the CUDA path may
    substitute a perceptual metric)."""
    ref = [v for row in reference for v in row]
    cand = [v for row in candidate for v in row]
    if len(ref) != len(cand) or not ref:
        return False
    return max(abs(r - c) for r, c in zip(ref, cand)) <= threshold


def build_perf_patch(model_id: str, *, baseline_s: float, accel_s: float,
                     vram_bytes: int, accel_label: str, correct: bool) -> Dict[str, Any]:
    """Shape one model's perf result. Speedup is recorded ONLY when correct."""
    patch: Dict[str, Any] = {
        "accel": accel_label,
        "baseline_s": round(baseline_s, 4),
        "accel_s": round(accel_s, 4),
        "measured_vram_bytes": int(vram_bytes),
        "correctness": "OK" if correct else "FAILED",
    }
    if correct and accel_s > 0:
        patch["speedup"] = round(baseline_s / accel_s, 4)
    return patch


# --- CUDA gate (deferred to run entry; see module docstring) ----------------

def _check_cuda() -> None:
    try:
        import torch as _torch  # noqa: PLC0415
    except ImportError:
        print("ERROR: torch is not installed; cannot benchmark.", file=sys.stderr)
        sys.exit(2)
    if not _torch.cuda.is_available():
        print(
            "ERROR: CUDA is not available; acceleration benchmarking requires a "
            "real CUDA GPU. Measured must never masquerade as estimated.",
            file=sys.stderr,
        )
        sys.exit(2)


# --- CUDA-only sweep (mirrors calibrate_vram's quarantine + entry point) -----
# Everything below imports torch / diffusers / main lazily, so the module stays
# importable on CI for the pure-helper tests above. These functions are only
# reached after _check_cuda() passes in main(), on a real CUDA machine.

def _ready_model_ids() -> List[str]:
    """All catalog ids whose record currently reports status == 'ready'.

    main was already imported (stdout-quarantined) in main(); this is a cache
    hit. Mirrors calibrate_vram._ready_model_ids - re-uses main's registry so
    the status-provider wiring is not duplicated.
    """
    from main import model_registry  # noqa: PLC0415

    return [
        record_id
        for record_id in model_registry.records
        if (model_registry.get_record(record_id) or {}).get("status") == "ready"
    ]


def _image_to_rows(image: Any) -> List[List[float]]:
    """Downscale a PIL image to a small normalized grayscale grid for the
    tolerance check - resolution-independent and cheap to compare."""
    small = image.convert("L").resize((_COMPARE_DIM, _COMPARE_DIM))
    data = list(small.getdata())
    return [
        [v / 255.0 for v in data[offset:offset + _COMPARE_DIM]]
        for offset in range(0, len(data), _COMPARE_DIM)
    ]


def _run_capture_inference(pipeline: Any, capability: str, plan: Any,
                           generator: Any) -> Any:
    """One small seed-aligned inference pass; return the first output frame as a
    PIL image. Kwargs mirror calibrate_vram's per-capability calls."""
    from PIL import Image  # noqa: PLC0415

    if capability == "video":
        if str(plan.pipeline_class) == "StableVideoDiffusionPipeline":
            dummy = Image.new("RGB", (_BENCH_VIDEO_RES, _BENCH_VIDEO_RES), color=(128, 128, 128))
            out = pipeline(
                dummy,
                num_frames=_BENCH_VIDEO_FRAMES,
                num_inference_steps=_BENCH_VIDEO_STEPS,
                height=_BENCH_VIDEO_RES,
                width=_BENCH_VIDEO_RES,
                generator=generator,
            )
        else:
            out = pipeline(
                prompt=_BENCH_PROMPT,
                num_frames=_BENCH_VIDEO_FRAMES,
                num_inference_steps=_BENCH_VIDEO_STEPS,
                height=_BENCH_VIDEO_RES,
                width=_BENCH_VIDEO_RES,
                generator=generator,
            )
        return out.frames[0][0]

    if capability == "inpaint":
        image = Image.new("RGB", (_BENCH_RES, _BENCH_RES))
        mask = Image.new("L", (_BENCH_RES, _BENCH_RES), 255)
        out = pipeline(
            prompt=_BENCH_PROMPT,
            image=image,
            mask_image=mask,
            num_inference_steps=_BENCH_STEPS,
            height=_BENCH_RES,
            width=_BENCH_RES,
            generator=generator,
        )
        return out.images[0]

    out = pipeline(
        prompt=_BENCH_PROMPT,
        num_inference_steps=_BENCH_STEPS,
        width=_BENCH_RES,
        height=_BENCH_RES,
        generator=generator,
    )
    return out.images[0]


def _free(gen: Any, model_id: str) -> None:
    """Cross-run isolation: drop the cached pipeline, gc, then empty_cache so the
    next run's peak-memory measurement starts clean (mirrors calibrate_vram)."""
    import torch  # noqa: PLC0415

    if gen is not None:
        gen.pipelines.pop(model_id, None)
    gc.collect()
    torch.cuda.empty_cache()


def _load_and_run(model_id: str, acceleration_settings: Any, models_dir: str,
                  output_dir: str, capability: str, plan: Any):
    """Load model_id with the given accel settings and run one capture pass.

    Returns (elapsed_s, comparison_rows, applied_label, peak_vram_bytes). All
    generator chatter is redirected to stderr so stdout stays pure JSON.
    """
    import torch  # noqa: PLC0415

    gen: Any = None
    try:
        with contextlib.redirect_stdout(sys.stderr):
            if capability == "video":
                from utils.direct_video_generator import DirectVideoGenerator  # noqa: PLC0415
                gen = DirectVideoGenerator(models_dir=models_dir, output_dir=output_dir)
            else:
                from utils.direct_generator import DirectGenerator  # noqa: PLC0415
                gen = DirectGenerator(models_dir=models_dir, output_dir=output_dir)

            torch.cuda.reset_peak_memory_stats(0)
            pipeline = gen.load_model(model_id, acceleration_settings=acceleration_settings)
            generator = torch.Generator(device="cuda").manual_seed(_SEED)

            torch.cuda.synchronize()
            start = time.perf_counter()
            image = _run_capture_inference(pipeline, capability, plan, generator)
            torch.cuda.synchronize()
            elapsed = time.perf_counter() - start

        peak = torch.cuda.max_memory_reserved(0)
        applied = gen.applied_acceleration.get(model_id)
        label = "+".join(applied.applied) if applied and applied.applied else "none"
        return elapsed, _image_to_rows(image), label, peak
    finally:
        _free(gen, model_id)


def _benchmark_one(model_id: str, models_dir: str, output_dir: str) -> Optional[Dict[str, Any]]:
    """Reference (unaccelerated) + accelerated pass for one model.

    Returns a perf patch dict or None on any failure (plan refusal, OOM, load
    error) - a partial patch of real numbers beats an aborted run.
    """
    import torch  # noqa: PLC0415
    from utils.direct_generator import ModelLoadRefusedError, resolve_plan  # noqa: PLC0415

    print(f"  benchmarking {model_id} ...", file=sys.stderr)

    try:
        plan = resolve_plan(model_id)
    except ModelLoadRefusedError as exc:
        print(f"  SKIP {model_id}: plan refused - {exc}", file=sys.stderr)
        return None
    except Exception as exc:  # noqa: BLE001
        print(f"  SKIP {model_id}: resolve_plan error - {exc}", file=sys.stderr)
        return None

    if plan.refusal:
        print(f"  SKIP {model_id}: plan.refusal = {plan.refusal!r}", file=sys.stderr)
        return None

    from main import model_registry  # noqa: PLC0415
    from foundry.accelerator import AccelerationSettings, DEFAULT_ACCELERATION_SETTINGS  # noqa: PLC0415

    record = model_registry.get_record(model_id) or {}
    capability = record.get("capability") or "image"

    try:
        # Reference: master_enable=False disables every optimization.
        ref_s, ref_rows, _ref_label, _ref_vram = _load_and_run(
            model_id, AccelerationSettings(master_enable=False),
            models_dir, output_dir, capability, plan)
        # Accelerated: all-auto defaults; the generator records what took effect.
        acc_s, acc_rows, label, peak = _load_and_run(
            model_id, DEFAULT_ACCELERATION_SETTINGS,
            models_dir, output_dir, capability, plan)
    except torch.cuda.OutOfMemoryError as exc:
        print(f"  FAIL {model_id}: OOM - {exc}", file=sys.stderr)
        return None
    except Exception as exc:  # noqa: BLE001
        print(f"  FAIL {model_id}: load/infer error - {exc}", file=sys.stderr)
        return None

    correct = outputs_within_tolerance(ref_rows, acc_rows, threshold=_CORRECTNESS_THRESHOLD)
    verdict = "OK" if correct else "DRIFT"
    print(
        f"  {verdict} {model_id}: baseline={ref_s:.2f}s accel={acc_s:.2f}s "
        f"({label})",
        file=sys.stderr,
    )
    return build_perf_patch(
        model_id, baseline_s=ref_s, accel_s=acc_s,
        vram_bytes=peak, accel_label=label, correct=correct)


def _quarantined_imports() -> None:
    """Import main + the generator modules under a stderr quarantine and retarget
    any stdout-bound logging handler onto stderr.

    main.py runs setup_logging() at import (a JSON log line to stdout AND a
    StreamHandler pinned to the real stdout object). Both would corrupt the
    stdout-is-pure-JSON patch contract, and a handler bound to the real stream
    bypasses any later redirect. Import under quarantine here, then retarget.
    Mirrors calibrate_vram.py.
    """
    real_stdout = sys.stdout
    with contextlib.redirect_stdout(sys.stderr):
        import main  # noqa: PLC0415, F401  - forces setup_logging under quarantine
        from utils.direct_generator import resolve_plan  # noqa: PLC0415, F401
        from utils.direct_video_generator import DirectVideoGenerator  # noqa: PLC0415, F401

    for _logger in [logging.getLogger()] + [
        logging.getLogger(_name) for _name in list(logging.root.manager.loggerDict)
    ]:
        for _handler in list(getattr(_logger, "handlers", [])):
            if getattr(_handler, "stream", None) is real_stdout and hasattr(_handler, "setStream"):
                _handler.setStream(sys.stderr)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "CUDA-only acceleration benchmark + correctness sweep. "
            "Prints a JSON perf patch to stdout. NEVER writes the catalog - "
            "blessing the allowlist is a human data edit."
        )
    )
    parser.add_argument(
        "model_ids",
        nargs="*",
        metavar="model-id",
        help="Catalog ids to benchmark. Defaults to all entries with status='ready'.",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()

    # CUDA gate fires here (run entry), before any model work, so a CPU box
    # exits 2 cleanly while the pure helpers above remain importable on CI.
    _check_cuda()

    import torch  # noqa: PLC0415

    _quarantined_imports()

    if args.model_ids:
        target_ids = list(args.model_ids)
        print(
            f"Benchmarking {len(target_ids)} specified model(s): "
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

    models_dir = os.getenv("MODELS_DIR", str(_BACKEND_ROOT / "models"))
    output_dir = os.getenv("OUTPUT_DIR", str(_BACKEND_ROOT / "outputs"))
    os.makedirs(output_dir, exist_ok=True)

    print(
        f"CUDA device: {torch.cuda.get_device_name(0)}  (torch {torch.__version__})",
        file=sys.stderr,
    )

    patch: Dict[str, Dict[str, Any]] = {}
    for model_id in target_ids:
        result = _benchmark_one(model_id, models_dir, output_dir)
        if result is not None:
            patch[model_id] = result

    # JSON perf patch to stdout ONLY - everything else went to stderr.
    print(json.dumps(patch, indent=2))


if __name__ == "__main__":
    main()
