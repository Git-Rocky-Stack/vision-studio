# Bundling the Python Backend

How Vision Studio packages its Python backend (PyTorch, diffusers, transformers,
and the CUDA/MPS runtime) inside the Electron app.

## One approach: the native bundle is mandatory

Vision Studio is **heavy-by-design**. Every distributable carries the full
PyInstaller backend - there is no "slim", "hybrid", or "download PyTorch on first
run" variant. The backend is a **one-folder** bundle in `resources/backend/`:
`VisionStudio-Backend[.exe]` next to its `_internal/` folder, which runs in place
(a one-file executable would unpack several GB into a temp folder on every launch
and leak it on a hard kill). `scripts/assert-native-backend.cjs` runs as
electron-builder's `beforePack` hook and **aborts the build** unless that folder
exists, clears a platform-calibrated size floor (0.5 GB on Windows/Linux where
CUDA is bundled; 0.25 GB on the macOS MPS wheel), and - when packaging for the
host platform - passes its own `--self-check` (on Windows/Linux with
`--expect-cuda --expect-tensorrt`). The same gate also requires the Studio
step-preview decoders (`resources/preview-decoders/`, the taesd family).

What the runtime is, per platform:

| Platform | torch | GPU support | Extra |
|----------|-------|-------------|-------|
| Windows x64 | 2.14.1+cu132 (CUDA 13.2) | RTX 20 / GTX 16 (Turing) through RTX 50 (Blackwell), NVIDIA driver R580+; GTX 10-series and older run on CPU | torch-tensorrt 2.14.0 + TensorRT 11.1 (+2.36 GB installed) |
| Linux x64 | 2.14.1+cu132 (CUDA 13.2) | same as Windows | torch-tensorrt 2.14.0 + TensorRT 11.1 (+4.55 GB installed) |
| macOS arm64 (14+) | 2.14.1 from PyPI (Metal/MPS) | Apple Silicon | no TensorRT (NVIDIA-only) |

TensorRT is bundled but engines are only built for model families listed in
`TRT_PROVEN_FAMILIES` (`backend/foundry/tensorrt_engine.py`), which stays empty
until [docs/TENSORRT_VERIFICATION.md](docs/TENSORRT_VERIFICATION.md)'s correctness
sweep has been run on real NVIDIA hardware.

What a user downloads on first run is model **weights** - consent-gated through
the in-app Foundry, following each model's license - never the runtime.

Two runtime alternatives are power-user choices, not packaging variants.
Turning backend autostart off (or setting `VISION_STUDIO_SKIP_BACKEND`) makes the
app use a backend you run yourself on `127.0.0.1:8000` instead of launching the
bundled one. Separately, the bundled backend connects at startup to a ComfyUI
server at `http://127.0.0.1:8188` (or the `COMFYUI_URL` environment variable)
and, while connected, sends it plain image jobs and image-to-video jobs
(text-to-video stays on the built-in engine; versions before 3.5.0 sent every video
job). The shipped package is identical either way.

## Building the bundle

```bash
npm run build:backend      # build-backend.cjs -> resources/backend/VisionStudio-Backend[.exe] + _internal/
```

`build-backend.cjs`:

1. Requires Python 3.12 (found through `uv`, the `py` launcher, or `PATH`): every
   dependency lock is compiled for cp312.
2. Creates `backend/venv` and installs torch + torchvision from their hash lock
   (`backend/requirements/torch-<platform>-cu132.txt` from the PyTorch cu132
   index on Windows/Linux; `torch-macos-pypi.txt` on macOS). A failed CUDA install
   fails the build - there is no silent fallback to CPU wheels.
3. Installs everything else the bundle ships from `runtime-<platform>.txt`, then
   on Windows/Linux torch-tensorrt + TensorRT from `tensorrt-<platform>-cu132.txt`
   (`tensorrt-cu13-libs` comes from `pypi.nvidia.com`). Every install is
   `pip install --require-hashes --no-deps`: nothing is resolved at build time.
4. Verifies the venv matches the locks exactly and runs `selfcheck.py` (the same
   module the frozen bundle runs) before freezing.
5. Builds the one-folder bundle with PyInstaller (`backend/main.spec`, UPX off)
   and runs the frozen `--self-check` (`--expect-cuda --expect-tensorrt` on
   Windows/Linux) - any missing module, library or data file fails the build.
6. Copies the folder to `resources/backend/` (and removes any legacy one-file
   `resources/VisionStudio-Backend[.exe]`).

Time: ~30-60 min for a clean build, dominated by the CUDA torch (~2 GB) and
TensorRT (~1.9 GB Windows / ~3.7 GB Linux) downloads. Re-resolve the locks with
`node build-backend.cjs --lock` (needs `uv`) only when deliberately bumping a pin.

### Reuse when the backend hasn't changed

The bundle is a pure function of `backend/` and the locks. If neither changed
since the last release, **do not rebuild** - the existing `resources/backend/`
folder is what a rebuild would produce and the packaging gate accepts it:

```bash
git diff <last-release-commit>..HEAD -- backend/ build-backend.cjs   # empty -> reuse the bundle
```

## What ships, and where

`electron-builder.yml` copies four things as `extraResources`:

```yaml
extraResources:
  - from: resources/            # backend/ (one-folder bundle) + preview-decoders/
    to: .
  - from: THIRD-PARTY-LICENSES.md   # third-party license and attribution list
    to: THIRD-PARTY-LICENSES.md
  - from: LICENSE               # Vision Studio's own MIT terms
    to: LICENSE
  - from: backend/              # Python source (reference / provisioning), with:
    to: backend-source/
    filter:
      - '**/*'
      - '!venv/**/*'            # never ship the multi-GB dev venv
      - '!models/**/*'          # never ship model weights (size + redistribution)
      - '!data/**/*'            # never ship the local database
      - '!outputs/**/*'         # never ship generated content
      - '!__pycache__/**/*'
```

The `models/`, `data/`, and `outputs/` exclusions are pinned by
`tests/packaging-config.test.ts` - shipping weights would be multi-GB and, for
some models, an unlicensed redistribution.

Inside the bundle, `licenses/FFMPEG-NOTICE.md` and `licenses/GPL-3.0.txt`
(from `backend/licenses/`) travel with the GPL `ffmpeg` executable that
imageio-ffmpeg carries; `backend/selfcheck.py` lists them as required data, so
a bundle without them fails its self-check.

## Platform notes

**Windows** - `backend/VisionStudio-Backend.exe` + `_internal/`, CUDA 13.2 torch
and TensorRT. The Visual C++ 2015-2022 runtime DLLs (including
`vcruntime140_threads.dll`, which PyInstaller does not collect on its own) ship
inside the bundle, so no redistributable install is needed; the frozen
self-check confirms them.

**macOS** - `backend/VisionStudio-Backend` + `_internal/`, **Apple Silicon only**
and **macOS 14+** (torch 2.14 publishes `macosx_14_0_arm64` wheels only; PyTorch
dropped macOS x64 wheels at 2.3). No TensorRT. With no Developer ID identity,
electron-builder skips signing and leaves Electron's prebuilt seal broken, which
Apple Silicon refuses to launch; `scripts/adhoc-sign-mac.cjs` reseals the app
(`codesign --force --deep --sign -`) in `afterPack`. `PYTORCH_ENABLE_MPS_FALLBACK=1`
is set before torch import.

**Linux** - `backend/VisionStudio-Backend` + `_internal/`, CUDA 13.2 torch (with
its `nvidia-*` CUDA 13.2 userspace libraries from the runtime lock) and TensorRT.
The backend is device-agnostic (`backend/utils/device.py`: CUDA > MPS > CPU), so
it runs on a CPU-only machine or a pre-Turing GPU, just slowly (on the CPU).

## PyInstaller spec (`backend/main.spec`)

The spec must bundle every **data file** the runtime opens at import time - a
missing data file or Python-metadata entry disables generation *without crashing*
(HTTP 200 but `generation_available: false`). It does not keep its own lists:
it imports them from `backend/selfcheck.py` (required modules, wholesale-collected
packages, TensorRT packages, bundled data, excludes, Windows VC++ runtime DLLs),
so the build and its `--self-check` cannot drift apart, and it copies the
metadata of every installed distribution. `backend/tests/test_selfcheck.py` and
`backend/tests/test_backend_bundle_spec.py` guard this (the latter discovers the
foundry JSONs dynamically).

## Testing the bundle

```bash
# 1. Build
npm run build:backend

# 2. Run the bundle's own self-check (the build already did; this re-runs it)
resources/backend/VisionStudio-Backend.exe --self-check --expect-cuda --expect-tensorrt   # Windows
resources/backend/VisionStudio-Backend --self-check --expect-cuda --expect-tensorrt       # Linux
resources/backend/VisionStudio-Backend --self-check                                       # macOS
# expect: SELF-CHECK PASSED (N checks)

# 3. Run it directly and hit health - status ok AND generation available
resources/backend/VisionStudio-Backend.exe &
curl -s http://127.0.0.1:8000/api/health
# expect: "status":"ok"  AND  "generation_available":true
```

`generation_available: true` (not merely HTTP 200) is the real pass condition -
it's the check the CI smoke gate enforces before packaging macOS/Linux.

## Troubleshooting

**"Native backend bundle missing" at package time** - run `npm run build:backend`
(or restore `resources/backend/` from the last release). The `beforePack` gate is
intentional.

**Backend resolves but generation is disabled** (`generation_available: false`) -
a data file or package metadata didn't make it into the bundle. Run the bundle's
`--self-check`; it names what is missing. The lists live in `backend/selfcheck.py`.

**"Backend not found" at runtime** - the packaged app runs
`<resources>/backend/VisionStudio-Backend[.exe]`; a development run tries
`backend/dist/VisionStudio-Backend/VisionStudio-Backend[.exe]` (fresh
PyInstaller output), then `resources/backend/VisionStudio-Backend[.exe]`, then
system Python with `backend-source/` (packaged) or `backend/` (dev).

## References

- [PyInstaller](https://pyinstaller.org/)
- [electron-builder](https://www.electron.build/)
- [PyTorch install matrix](https://pytorch.org/get-started/locally/)
