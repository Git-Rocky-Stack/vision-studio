# Bundling the Python Backend

How Vision Studio packages its Python backend (PyTorch, diffusers, transformers,
and the CUDA/MPS runtime) inside the Electron app.

## One approach: the native bundle is mandatory

Vision Studio is **heavy-by-design**. Every distributable carries the full
PyInstaller backend — there is no "slim", "hybrid", or "download PyTorch on first
run" variant. `scripts/assert-native-backend.cjs` runs as electron-builder's
`beforePack` hook and **aborts the build** unless
`resources/VisionStudio-Backend[.exe]` exists and clears a platform-calibrated
size floor (0.5 GB on Windows/Linux where CUDA is bundled; 0.25 GB on the macOS
MPS wheel). The same gate also requires the Studio step-preview decoders
(`resources/preview-decoders/`, the taesd family).

What a user downloads on first run is model **weights** — consent-gated through
the in-app Foundry, following each model's license — never the runtime.

The one runtime alternative is a power-user choice, not a packaging variant:
setting `COMFYUI_URL` (or the external-backend mode) points the app at an
existing ComfyUI/backend instead of launching the bundled one. The shipped
package is identical either way.

## Building the bundle

```bash
npm run build:backend      # build-backend.cjs -> resources/VisionStudio-Backend[.exe]
```

`build-backend.cjs`:

1. Finds a compatible Python (3.10-3.12; PyTorch has no 3.13+ wheels yet).
2. Creates `backend/venv` and installs PyTorch via a fallback ladder
   (cu121 -> cu118 -> the default index, which on macOS arm64 is the MPS wheel).
3. Installs the rest of `requirements.txt` plus the bundled AI runtimes
   (`diffusers`, `transformers`, `accelerate`, `peft`, `controlnet-aux`,
   `onnxruntime`, `spandrel`, `facexlib`, `aiohttp`).
4. Runs an **import gate** — the venv must import every runtime the app needs, or
   the build stops before producing a silently broken bundle.
5. Builds a one-file executable with PyInstaller (`backend/main.spec`).
6. Copies it to `resources/` (and, on macOS, ad-hoc signs it so it stays
   spawnable — see below).

Time: ~30-60 min for a clean build, dominated by the CUDA torch download.

### Reuse when the backend hasn't changed

The bundle is a pure function of `backend/`. If `backend/` is unchanged since the
last release, **do not rebuild** — the existing `resources/VisionStudio-Backend.exe`
is byte-for-byte what a rebuild would produce and the packaging gate accepts it:

```bash
git diff <last-release-commit>..HEAD -- backend/   # empty -> reuse the exe
```

## What ships, and where

`electron-builder.yml` copies two things as `extraResources`:

```yaml
extraResources:
  - from: resources/            # the backend exe + preview decoders + license doc
    to: .
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
`tests/packaging-config.test.ts` — shipping weights would be multi-GB and, for
some models, an unlicensed redistribution.

## Platform notes

**Windows** — `VisionStudio-Backend.exe`; needs the Visual C++ Redistributable
(usually already present).

**macOS** — `VisionStudio-Backend`, **Apple Silicon only** (PyTorch dropped macOS
x64 wheels at 2.3). With no Developer ID identity, electron-builder skips signing
and leaves Electron's prebuilt seal broken, which Apple Silicon refuses to launch;
`scripts/adhoc-sign-mac.cjs` reseals the app (`codesign --force --deep --sign -`)
in `afterPack`. `PYTORCH_ENABLE_MPS_FALLBACK=1` is set before torch import.

**Linux** — `VisionStudio-Backend`, real CUDA 12.1 torch (the AppImage lands
around 3.3 GB). The backend is device-agnostic (`backend/utils/device.py`:
CUDA > MPS > CPU), so it runs on a CPU-only machine, just slowly.

## PyInstaller spec (`backend/main.spec`)

The spec must bundle every **data file** the runtime opens at import time — a
missing data file or Python-metadata entry disables generation *without crashing*
(HTTP 200 but `generation_available: false`). It therefore includes the foundry
JSONs, the retrieval `prompting_kb`, and the `transformers`-checked metadata.
`backend/tests/test_backend_bundle_spec.py` guards these (it discovers the
foundry JSONs dynamically).

## Testing the bundle

```bash
# 1. Build
npm run build:backend

# 2. Confirm it exists
ls resources/VisionStudio-Backend.exe   # Windows
ls resources/VisionStudio-Backend       # macOS/Linux

# 3. Run it directly and hit health — status ok AND generation available
resources/VisionStudio-Backend.exe &
curl -s http://127.0.0.1:8000/api/health
# expect: "status":"ok"  AND  "generation_available":true
```

`generation_available: true` (not merely HTTP 200) is the real pass condition —
it's the check the CI smoke gate enforces before packaging macOS/Linux.

## Troubleshooting

**"Native backend bundle missing" at package time** — run `npm run build:backend`
(or restore the exe from the last release). The `beforePack` gate is intentional.

**Backend resolves but generation is disabled** (`generation_available: false`) —
a data file or package metadata didn't make it into the bundle. Check
`backend/main.spec` `datas` and the transformers metadata set; run
`backend/tests/test_backend_bundle_spec.py`.

**"Backend not found" at runtime** — the app looks for the backend in order:
`resources/VisionStudio-Backend[.exe]` (production) ->
`backend/dist/VisionStudio-Backend[.exe]` (local build) -> system Python with
`backend-source/` (dev fallback).

## References

- [PyInstaller](https://pyinstaller.org/)
- [electron-builder](https://www.electron.build/)
- [PyTorch install matrix](https://pytorch.org/get-started/locally/)
