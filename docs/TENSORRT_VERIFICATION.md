# TensorRT Verification Runbook (3.1.0)

Vision Studio's TensorRT path ships **code-complete but auto-off** in 3.1.0. The
`TRT_PROVEN_FAMILIES` allowlist (`backend/foundry/tensorrt_engine.py`) is empty,
so `auto` acceleration never builds a TRT engine. Explicit `tensorrt="on"` still
builds, with a hard-fallback to eager on any failure - nothing it does can fail a
generation. This runbook is how a maintainer with a CUDA GPU verifies the path
and **blesses** a family so `auto` may use it.

> Honesty rail: a family is added to `TRT_PROVEN_FAMILIES` **only** after it
> passes the correctness sweep on real hardware. Evidence, not assertion.

## 1. Prerequisites

- NVIDIA GPU, recent driver, CUDA toolkit matching your torch build.
- The backend venv active: `backend/venv/Scripts/python.exe`.

## 2. Install the TensorRT stack

```bash
cd backend
venv/Scripts/python.exe -m pip install torch-tensorrt tensorrt
venv/Scripts/python.exe -c "import torch_tensorrt, tensorrt; print(torch_tensorrt.__version__, tensorrt.__version__)"
```

If `torch-tensorrt` has no wheel for your torch/CUDA combination, follow the
NVIDIA install matrix for a matching build. The app does not require these
packages; they are opt-in for this verification only.

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
accel suite. This is a small post-merge data edit; it is not a 3.1.0 release
blocker.
