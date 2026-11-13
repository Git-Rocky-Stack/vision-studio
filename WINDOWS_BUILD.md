# Vision Studio - Windows Build Guide

How to build and publish the Windows installer. For the cross-platform picture
(macOS/Linux, R2 delivery, signing) see [`DEPLOYMENT.md`](DEPLOYMENT.md); for how
the backend bundle is produced see [`BUNDLING.md`](BUNDLING.md).

Signed Windows releases are built in CI by
[`release.yml`](.github/workflows/release.yml) (`Build Windows`, on a
`windows-latest` runner), which packages with `npm run package:win:signed` and
signs through Azure Artifact Signing. A manual run
(`gh workflow run release.yml`) builds and signs without publishing; a `v*` tag
also publishes the R2 update feed and the GitHub Release. Local builds below are
for development and are unsigned unless you supply a signing mode yourself. (macOS and Linux are built in CI by
[`release-mac-linux.yml`](.github/workflows/release-mac-linux.yml) because
PyInstaller can't cross-compile.)

## Prerequisites

- **Windows 10/11 64-bit**
- **Node.js** `^22.22.2 || ^24.15.0 || >=26` (the `engines` range in
  `package.json`; Node 22 LTS, as pinned in `.nvmrc`, is recommended) —
  <https://nodejs.org/>
- **Git** — <https://git-scm.com/>
- **Python 3.12** — only if you need to (re)build the backend bundle; the
  hash-locked backend dependencies (torch 2.14.1+cu132, torch-tensorrt
  2.14.0 + TensorRT 11.1, and the rest) are compiled for 3.12
- **~25 GB free disk** for a full backend rebuild (the CUDA torch + TensorRT
  venv and the PyInstaller output are both large)

## The build is heavy-by-design

Every Windows package ships the native PyInstaller backend (PyTorch + CUDA 13.2
+ TensorRT + diffusers) as a **one-folder** bundle in `resources/backend/`
(`VisionStudio-Backend.exe` plus its `_internal/` folder; it runs in place, it
does not unpack to `%TEMP%`). `scripts/assert-native-backend.cjs` runs before
packaging and **aborts** if that bundle is missing or truncated, or if its own
`--self-check --expect-cuda --expect-tensorrt` fails — there is no
frontend-only or CPU-only Windows build.

The bundled CUDA 13.2 build needs an NVIDIA driver from the R580 branch or
newer on the user's machine and runs on RTX 20-series / GTX 16-series (Turing)
through RTX 50-series (Blackwell); GTX 10-series and older cards run on the CPU.

## Build steps

### 1. Backend bundle — only if `backend/` changed

```powershell
npm run build:backend      # ~30-60 min; -> resources/backend/ (~6.1 GB on disk: ~3.7 GB torch/CUDA 13.2/diffusers + ~2.4 GB TensorRT)
```

If `backend/` is unchanged since the last release, **skip this** — the existing
`resources/backend/` bundle is what a rebuild would produce and is reused.
Check with:

```powershell
git diff <last-release-commit>..HEAD -- backend/ build-backend.cjs    # empty -> reuse the bundle
```

### 2. Frontend + package

```powershell
Remove-Item -Recurse -Force release   # clear stale artifacts
npm run build                          # Vite -> dist/
npm run package:win                    # electron-builder (electron-builder.yml)
```

## Build outputs

`npm run package:win` targets **nsis-web** + a portable **zip**, written to
`release/` and `release/nsis-web/`:

| File | Size | Description |
|------|------|-------------|
| `nsis-web/Vision-Studio-<ver>-Setup.exe` | ~1 MB | Web-installer **stub** |
| `nsis-web/vision-studio-<ver>-x64.nsis.7z` | ~4.07 GB (3.5.0) | App package the stub downloads |
| `nsis-web/latest.yml` | <1 KB | electron-updater feed |
| `Vision Studio-<ver>-win.zip` | ~2.6 GB | Portable ZIP (no install) |

The `.nsis.7z` size is measured from the signed 3.5.0 CI build
(4,067,427,706 bytes, CUDA 13.2 + TensorRT); the zip figure is still from the
CUDA 12.1 releases and will grow by a similar amount. The CUDA 13.2 + TensorRT
backend measures 6.06 GB uncompressed (5,783 MiB, of which TensorRT is 2,252 MiB
/ 2.36 GB - measured on a local build).

### Why nsis-web (not a single-file `.exe`)

The ~2.5 GB payload exceeds the 32-bit `makensis` mmap ceiling, so a monolithic
NSIS installer cannot build. The tiny stub downloads the `.nsis.7z` app package
from `nsisWeb.appPackageUrl` (`https://updates.vision-studio-x.com/win`) during
installation — the same zero-egress host that serves the update feed. The stub
and the `.nsis.7z` must be published together (see Publishing below), or the
installer 404s mid-install.

The installer still runs the full NSIS wizard (`oneClick: false`):
install-directory choice, per-machine install, desktop + Start Menu shortcuts,
and a proper uninstaller (`installer.nsh`). There is no licence step —
`computeLicensePage` in app-builder-lib emits one only for a `license.*` or
`eula.*` file in `build/` (`directories.buildResources`), or an explicit
`nsis.license`, and Vision Studio sets neither; the MIT terms ship as the root
`LICENSE` extraResource instead.

## Publishing to R2

Windows artifacts are split across two directories, so publishing is **two
invocations**, both into the `win/` prefix, feed last:

```powershell
node scripts/publish-r2.cjs --dir release --prefix win/           # portable zip
node scripts/publish-r2.cjs --dir release/nsis-web --prefix win/  # stub + 7z + latest.yml
```

Requires `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
After uploading, HEAD each object and confirm its `Content-Length` matches the
local file (a silently truncated multi-GB upload is the failure mode to catch):

```powershell
curl.exe -sI https://updates.vision-studio-x.com/win/vision-studio-<ver>-x64.nsis.7z
```

## Code signing

Windows releases are code-signed from 3.5.0 on through **Azure Artifact
Signing** (publisher `Sharif Elsalaymeh`; account, profile, CI identity and
secret rotation are in [`docs/code-signing.md`](docs/code-signing.md)). Unsigned
local builds trigger a "Windows protected your PC" SmartScreen warning ("More
info" -> "Run anyway"). Release signing is gated by
`scripts/verify-release-signing.cjs`:

```powershell
npm run package:win           # unsigned local/dev build (default)
npm run package:win:signed    # production; fails fast unless a signing mode is set
npm run release:signing:check # validate signing config without packaging
```

Configure exactly one mode via environment variables:

1. **CSC / PFX** — `WIN_CSC_LINK` (or `CSC_LINK`) + `WIN_CSC_KEY_PASSWORD`.
2. **Windows certificate store** — `WIN_CSC_SUBJECT_NAME` (or
   `WINDOWS_CERTIFICATE_SUBJECT_NAME`) or `WIN_CSC_SHA1`.
3. **Azure Artifact Signing** (formerly Trusted Signing; the variable names
   keep the old name) — `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`,
   `AZURE_TRUSTED_SIGNING_ENDPOINT`, `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`,
   `AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME`, plus an auth secret.

`electron-builder.yml` sets `win.signtoolOptions.publisherName` and
`verifyUpdateCodeSignature: true`, so auto-update only installs signed builds.
electron-builder 26 moved every signtool option under `signtoolOptions`; the
Azure path ignores that block, so `scripts/verify-release-signing.cjs` mirrors
the same publisher name into `azureSignOptions` when it selects Azure.

## Troubleshooting

**"Native backend bundle missing" during packaging** — run `npm run build:backend`
(or restore the `resources/backend/` folder from the last release). The
`beforePack` gate refuses to produce a package without it. A leftover
one-file `resources/VisionStudio-Backend.exe` from an older build is refused
too: delete it (`npm run build:backend` does).

**"Python not found" / wrong Python during `build:backend`** — install Python
3.12 and ensure it's on `PATH` (`py -3.12 --version`) or let `uv` provide it
(`uv python install 3.12`). The dependency locks install on 3.12 only.

**Out of disk space** — a full backend rebuild needs the CUDA torch + TensorRT
venv (~12 GB) plus the PyInstaller output (twice: `backend/dist/` and the copy
in `resources/backend/`). Clean with `npm run clean` (build artifacts) or `npm run clean:all`
(also removes `node_modules` and the backend venv).

**PyTorch / TensorRT download slow/fails** — `build-backend.cjs` installs torch
2.14.1+cu132 from `https://download.pytorch.org/whl/cu132` against the hashes in
`backend/requirements/torch-windows-cu132.txt`, then torch-tensorrt 2.14.0+cu132
and TensorRT 11.1 (the `tensorrt-cu13-libs` wheel, ~1.9 GB, comes from
`https://pypi.nvidia.com`) against `backend/requirements/tensorrt-windows-cu132.txt`.
There is no fallback to CPU wheels or to a build without TensorRT (that would
ship an installer that cannot use the GPU, or fails the packaging self-check):
re-run the build after a network failure. A hash mismatch means the download
was corrupted or tampered with - never edit the hashes by hand.

## Related npm scripts

| Script | Purpose |
|--------|---------|
| `npm run build:backend` | PyInstaller one-folder backend bundle -> `resources/backend/` |
| `npm run build` | Vite frontend -> `dist/` |
| `npm run package:win` | nsis-web + portable zip (delivery build) |
| `npm run package:win:signed` | signed production build (requires a signing mode) |
| `npm run release:publish:r2` | publish `release/` (the portable zip) to the R2 `win/` prefix; run it again as `npm run release:publish:r2 -- --dir release/nsis-web` for the stub, `.nsis.7z` and `latest.yml` - see [Publishing to R2](#publishing-to-r2) |
| `npm run clean` / `clean:all` | remove build artifacts (and deps/venv) |
