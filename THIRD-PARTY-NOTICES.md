# Third-Party Notices

Vision Studio is released under the MIT License (see `LICENSE`). It bundles and
depends on third-party software listed below. Each component remains under its own
license. This file is curated to the runtime dependencies actually shipped with
the app; the complete dependency licenses are reproducible with:

```bash
npx license-checker --production            # JavaScript / Electron
cd backend && python -m piplicenses         # Python backend
```

The tables below were reconciled against that scan output (run 2026-11-11). The
JavaScript table lists every production dependency in `package.json` (licenses
read from each installed package's own `package.json`); the Python table lists
the backend runtime set installed from `backend/requirements.txt` plus the AI
runtimes `build-backend.cjs` installs into the frozen backend (licenses read from
each project's PyPI metadata).

## JavaScript / Electron runtime

| Package | License |
|---------|---------|
| electron | MIT |
| react, react-dom | MIT |
| zustand | MIT |
| @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities | MIT |
| @floating-ui/react | MIT |
| @tanstack/react-virtual | MIT |
| @huggingface/inference | MIT |
| framer-motion | MIT |
| konva, react-konva | MIT |
| axios | MIT |
| zod | MIT |
| ws | MIT |
| electron-store, electron-updater | MIT |
| clsx | MIT |
| tailwind-merge | MIT |
| lucide-react | ISC |
| @fontsource/ibm-plex-sans, @fontsource/ibm-plex-sans-condensed, @fontsource/ibm-plex-mono | OFL-1.1 (IBM Plex fonts) |

Production JavaScript dependency licenses (99 packages, the full transitive
closure): MIT (87), ISC (3), OFL-1.1 (3), BSD-2-Clause, BSD-3-Clause,
BlueOak-1.0.0, 0BSD, Python-2.0 (`argparse`), and `(MIT OR CC0-1.0)`
(`type-fest`). All are permissive and MIT-compatible for redistribution.

## Python / backend runtime

| Package | License |
|---------|---------|
| torch | BSD-3-Clause (with bundled Apache-2.0, BSD-2-Clause, BSL-1.0, ISC, MIT and Zlib components) |
| torchvision | BSD-3-Clause |
| torchaudio | BSD-2-Clause |
| diffusers | Apache-2.0 |
| transformers | Apache-2.0 |
| accelerate | Apache-2.0 |
| peft | Apache-2.0 |
| controlnet_aux | Apache-2.0 |
| safetensors | Apache-2.0 |
| tokenizers | Apache-2.0 |
| huggingface-hub, hf-xet | Apache-2.0 |
| onnxruntime | MIT |
| spandrel | MIT |
| facexlib | Apache-2.0 |
| fastapi | MIT |
| starlette | BSD-3-Clause |
| uvicorn | BSD-3-Clause |
| websockets | BSD-3-Clause |
| httpx | BSD-3-Clause |
| aiohttp | Apache-2.0 AND MIT |
| pydantic | MIT |
| Pillow | MIT-CMU (HPND) |
| numpy | BSD-3-Clause (with bundled 0BSD, MIT, Zlib, CC0-1.0 components) |
| opencv-python | Apache-2.0 |
| imageio | BSD-2-Clause |
| imageio-ffmpeg | BSD-2-Clause (the bundled `ffmpeg` executable is GPL; see below) |
| python-multipart | Apache-2.0 |
| python-dotenv | BSD-3-Clause |
| slowapi | MIT |
| aiofiles | Apache-2.0 |
| gdown | MIT |
| tqdm | MPL-2.0 AND MIT |
| certifi | MPL-2.0 |

`pytest` and `pytest-benchmark` appear in `backend/requirements.txt` for the test
suite only and are not part of the shipped runtime.

## Copyleft review

The production scan was reviewed for copyleft conflicts with MIT redistribution.
Findings:

- **PyInstaller (GPLv2) and pyinstaller-hooks-contrib (Apache-2.0 / GPLv2)** are
  **build-only tools** (not listed in `backend/requirements.txt`; installed only
  to produce the bundled backend executable). PyInstaller's license carries the
  standard exception that applications you build and distribute with it are not
  required to be GPL. They are not redistributed inside the app, so there is no
  conflict.
- **certifi (MPL-2.0)** and **tqdm (MPL-2.0 AND MIT)** are shipped runtime
  dependencies. MPL-2.0 is file-level weak copyleft: it is compatible with
  redistribution inside a larger MIT-licensed work, and only obliges publishing
  modifications to the MPL-licensed files themselves. Vision Studio does not
  modify these packages, so there is no obligation beyond preserving their notices.
- **FFmpeg (GPL), via imageio-ffmpeg.** The imageio-ffmpeg Python wrapper is
  BSD-2-Clause, but its platform wheels carry a prebuilt `ffmpeg` executable
  pinned in imageio-ffmpeg's
  [`tools/ffmpeg-sources.json`](https://github.com/imageio/imageio-ffmpeg/blob/main/tools/ffmpeg-sources.json);
  the Windows x64 and Linux binaries are the
  [BtbN FFmpeg-Builds `gpl` variant](https://github.com/BtbN/FFmpeg-Builds#package-list).
  PyInstaller's standard `imageio_ffmpeg` hook collects that binary into the
  frozen backend. The backend runs it as a separate process (timeline audio
  muxing in `backend/main.py`) and never links it, so it is an aggregate that
  does not change Vision Studio's MIT license. Redistributing the executable
  still carries the GPL's own conditions for that binary: ship the GPL text with
  it and point recipients at its corresponding source (the BtbN release it was
  built from).

No GPL, AGPL, or LGPL license appears in the shipped Python or JavaScript
*libraries*; the FFmpeg executable above is the one GPL component in the
distributable.

Reconcile this file against the live scan before each release; flag any new
GPL/AGPL/LGPL entry that enters the shipped runtime set.
