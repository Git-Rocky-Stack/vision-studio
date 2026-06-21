# Third-Party Notices

Vision Studio-X is released under the MIT License (see `LICENSE`). It bundles and
depends on third-party software listed below. Each component remains under its own
license. This file is curated to the major runtime dependencies actually shipped
with the app; the complete dependency licenses are reproducible with:

```bash
npx license-checker --production            # JavaScript / Electron
cd backend && python -m piplicenses         # Python backend
```

The tables below were reconciled against that scan output (run 2026-06-20).

## JavaScript / Electron runtime

| Package | License |
|---------|---------|
| electron | MIT |
| react, react-dom | MIT |
| zustand | MIT |
| @dnd-kit/core | MIT |
| framer-motion | MIT |
| konva, react-konva | MIT |
| dockview | MIT |
| axios | MIT |
| zod | MIT |
| ws | MIT |
| electron-store, electron-updater | MIT |
| clsx | MIT |
| lucide-react | ISC |
| @fontsource/ibm-plex-sans, @fontsource/ibm-plex-mono | OFL-1.1 (IBM Plex fonts) |

Production JavaScript dependency licenses (103 packages): MIT, ISC, OFL-1.1,
BSD-2-Clause, BSD-3-Clause, BlueOak-1.0.0, 0BSD, Python-2.0 (`argparse`),
and `(MIT OR CC0-1.0)`. All are permissive and MIT-compatible for redistribution.

## Python / backend runtime

| Package | License |
|---------|---------|
| torch | BSD-3-Clause |
| diffusers | Apache-2.0 |
| transformers | Apache-2.0 |
| accelerate | Apache-2.0 |
| safetensors | Apache-2.0 |
| tokenizers | Apache-2.0 |
| huggingface-hub | Apache-2.0 |
| fastapi | MIT |
| starlette | BSD-3-Clause |
| uvicorn | BSD-3-Clause |
| websockets | BSD-3-Clause |
| httpx | BSD-3-Clause |
| pydantic | MIT |
| Pillow | MIT-CMU (HPND) |
| numpy | BSD-3-Clause (with bundled 0BSD, MIT, Zlib, CC0-1.0 components) |
| opencv-python | Apache-2.0 |
| imageio | BSD-2-Clause |
| python-multipart | Apache-2.0 |
| slowapi | MIT |
| aiofiles | Apache-2.0 |
| tqdm | MPL-2.0 AND MIT |
| certifi | MPL-2.0 |

## Copyleft review

The production scan was reviewed for copyleft conflicts with MIT redistribution.
Findings, all cleared:

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
- **No GPL, AGPL, or LGPL license appears in the shipped runtime dependencies.**

Reconcile this file against the live scan before each release; flag any new
GPL/AGPL/LGPL entry that enters the shipped runtime set.
