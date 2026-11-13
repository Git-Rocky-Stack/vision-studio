# TensorRT Verification Runbook

Vision Studio's TensorRT path has shipped **code-complete but auto-off** since 3.1.0.
Since the CUDA 13.2 backend, the TensorRT runtime itself is **bundled** in every
Windows and Linux build (torch 2.14.1+cu132, torch-tensorrt 2.14.0+cu132,
TensorRT 11.1 - see `build-backend.cjs`); macOS has no TensorRT.

The `TRT_PROVEN_FAMILIES` allowlist (`backend/foundry/tensorrt_engine.py`) is
still empty, so:

- `auto` acceleration never builds a TRT engine, and records
  `tensorrt off: No model family has been verified for TensorRT yet` in the
  result's `acceleration.skipped`;
- `GET /api/system/info` reports `availability.tensorrt` as unavailable with the
  reason **"No model family has been verified for TensorRT yet"**, so the
  Performance panel disables the toggle and shows that sentence;
- explicit `tensorrt="on"` (API / this runbook) still builds, with a
  hard-fallback to eager on any failure - nothing it does can fail a generation.

This runbook is how a maintainer with a CUDA GPU verifies the path and
**blesses** a family so `auto` may use it. **It has not been run yet: it must be
run on real NVIDIA hardware** (no CI runner has a GPU). Bundling the runtime
changes nothing about that.

> Honesty rail: a family is added to `TRT_PROVEN_FAMILIES` **only** after it
> passes the correctness sweep on real hardware. Evidence, not assertion.

## 1. Prerequisites

- NVIDIA GPU of compute capability 7.5 or newer (RTX 20 / GTX 16 and newer,
  including RTX 50), NVIDIA driver R580 or newer (CUDA 13.2). No CUDA toolkit is
  needed: the torch and TensorRT wheels carry their own runtime.
- A backend venv built from the locks: `node build-backend.cjs` creates
  `backend/venv` with the exact release set, or follow CONTRIBUTING.md's
  by-hand steps including the TensorRT lock.

## 2. Confirm the TensorRT stack

The release build installs it from `backend/requirements/tensorrt-<platform>-cu132.txt`
(hash-locked; never `pip install torch-tensorrt` unpinned - a build for another
torch minor fails at engine build time):

```bash
cd backend
venv/Scripts/python.exe -m pip install --require-hashes --no-deps --no-build-isolation --extra-index-url https://pypi.nvidia.com --extra-index-url https://download.pytorch.org/whl/cu132 -r requirements/tensorrt-windows-cu132.txt
venv/Scripts/python.exe -c "import torch, torch_tensorrt, tensorrt; print(torch.__version__, torch_tensorrt.__version__, tensorrt.__version__)"
# expect: 2.14.1+cu132 2.14.0+cu132 11.1.0.106
venv/Scripts/python.exe selfcheck.py --expect-cuda --expect-tensorrt
```

For the frozen app, run `resources/backend/VisionStudio-Backend.exe --self-check --expect-cuda --expect-tensorrt`.

## 3. Single-model smoke test

Force a TRT build for one SDXL or SD1.5 model and confirm the engine builds,
caches, and the second run binds the cached `<key>.plan`:

```bash
cd backend
VS_TRT_CACHE_DIR=.cache/tensorrt venv/Scripts/python.exe - <<'PY'
from utils.direct_generator import DirectGenerator
from foundry.accelerator import AccelerationSettings
gen = DirectGenerator(models_dir="models", output_dir="outputs")
pipe = gen.load_model("<your-sdxl-model-id>", acceleration_settings=AccelerationSettings(tensorrt="on"))
print("applied:", gen.applied_acceleration["<your-sdxl-model-id>"].applied)
PY
```

Expect `tensorrt:built` on the first run and `tensorrt:cached` on the second.
A `tensorrt (build/load failed: ...)` in `fell_back` means the build failed and
the pipeline ran eager - inspect the stderr trace and adjust
`build_example_inputs` (the forward-arg plumbing is the most likely culprit).

## 4. Correctness + benchmark sweep

The sweep runs an unaccelerated reference and the `tensorrt` config, compares
outputs within tolerance, and prints a JSON perf patch. It refuses to run
without CUDA (measured never masquerades as estimated):

```bash
cd backend
venv/Scripts/python.exe tools/benchmark_accel.py <your-sdxl-model-id>
```

Read the stderr verdict line: `OK` (within tolerance) blesses the family;
`DRIFT` means the TRT output diverged - do **not** bless it.

## 5. Bless a family

When a family passes correctness on your hardware, add it to the allowlist:

```python
# backend/foundry/tensorrt_engine.py
TRT_PROVEN_FAMILIES: set[str] = {"sdxl"}  # blessed 2026-..-.. on <GPU>, sweep OK
```

Update `backend/tests/test_accelerator_tensorrt.py::AllowlistTests` if you want
the production-allowlist assertion to reflect the newly blessed set, then run the
accel suite. This is a small post-merge data edit; it does not block a
release.

Once the allowlist is non-empty, `availability.tensorrt` turns `available: true`
on any machine with the bundled runtime and a compute-capability 7.5+ NVIDIA GPU,
and `auto` builds engines for the blessed families only (other families keep
reporting `tensorrt off: <family> has not been verified for TensorRT`). Record
the GPU, driver and date next to the entry, as above.
