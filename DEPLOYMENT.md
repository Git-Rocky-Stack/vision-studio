# Vision Studio - Deployment Guide

How Vision Studio is built, packaged, and delivered for Windows, macOS, and Linux.

The version in the tree is whatever `package.json` says. `tests/version-sync.test.ts`
pins the README to it: while the changelog heading still reads `Unreleased`, the
README must call it the "Upcoming release" and name the latest published one;
once the heading is dated, the README must call it the "Current release". Which versions
have been tagged and published is a fact about GitHub, not about this file:
list the `v*` tags or see the
[releases page](https://github.com/Git-Rocky-Stack/vision-studio/releases).
Version history lives in [`CHANGELOG.md`](CHANGELOG.md).

## Heavy-by-design: one build shape

Every distributable ships the **native PyInstaller backend** (PyTorch, diffusers,
transformers, and the CUDA/MPS runtime). There is no slim, frontend-only, or
"download PyTorch on first run" variant - `scripts/assert-native-backend.cjs`
runs as electron-builder's `beforePack` hook and **aborts packaging** if the
backend bundle is missing or truncated. What a user downloads on first run is
model *weights* (consent-gated through the in-app Foundry), never the runtime.

See [`BUNDLING.md`](BUNDLING.md) for how the backend bundle itself is produced.

## Where builds run

| Platform | Where it's built | Why |
|----------|------------------|-----|
| Windows x64 | **CI** (`release.yml`, signed) | Built natively on `windows-latest` and signed through Azure Artifact Signing; `npm run package:win` stays available for unsigned local builds. |
| macOS arm64 | **CI only** (`release-mac-linux.yml`) | PyInstaller can't cross-compile; the macOS bundle must be built on macOS (Apple Silicon). |
| Linux x64 | **CI only** (`release-mac-linux.yml`) | Same - the Linux CUDA bundle must be built on Linux. |

macOS is **Apple Silicon only** - PyTorch dropped macOS x64 wheels at 2.3, so an
Intel build would ship without its backend.

## Pre-release checklist

- [ ] Work is merged to `main` and green (`npm run typecheck`, `npm test`, `npm run build`)
- [ ] Bump the version in lockstep: `npm version X.Y.Z --no-git-tag-version`
      (updates `package.json` + `package-lock.json`) and add a `CHANGELOG.md`
      entry. `package.json` is the single source: electron-builder reads it, and
      `scripts/build-windows.cjs` passes it to Inno Setup as
      `/DMyAppVersion=<version>`, so `scripts/installer.iss` has no version to
      edit by hand (it refuses to compile without that define).
      `tests/version-sync.test.ts` checks the README, `SECURITY.md`, the
      changelog heading and the OpenAPI examples against it
- [ ] Only rebuild the backend bundle if `backend/` or `build-backend.cjs` actually
      changed since the last release
      (`git diff <last-release-commit>..HEAD -- backend/ build-backend.cjs`) -
      otherwise the existing one-folder bundle in `resources/backend/` is reused
      as-is

## Build process

### 1. Backend bundle (only if `backend/` changed)

```bash
npm run build:backend          # PyInstaller one-folder -> resources/backend/VisionStudio-Backend[.exe] + _internal/
```

~30-60 min (installs the hash-locked torch 2.14.1 stack - CUDA 13.2 plus
torch-tensorrt 2.14.0 / TensorRT 11.1 on Windows/Linux, MPS on macOS - and
diffusers, runs PyInstaller, then the frozen `--self-check`).
If `backend/` is unchanged since the last release, skip this - the packaged
bundle is identical and the existing one is reused.

### 2. Frontend

```bash
npm run build                  # Vite -> dist/ + dist-electron/
```

### 3. Package (Windows, local)

```bash
rm -rf release                 # clear stale artifacts so publish can't re-upload them
npm run package:win            # electron-builder (electron-builder.yml)
```

Produces, in `release/` and `release/nsis-web/`:

| Artifact | Approx size | Role |
|----------|-------------|------|
| `Vision-Studio-<ver>-Setup.exe` | ~1 MB | **nsis-web stub** - downloads the app package at install time |
| `vision-studio-<ver>-x64.nsis.7z` | ~4.07 GB (3.5.0) | app package the stub pulls from the R2 host |
| `Vision Studio-<ver>-win.zip` | ~4.44 GB (3.5.0) | portable ZIP (no install) |
| `latest.yml` | <1 KB | electron-updater feed |

(Sizes from the CUDA 12.1 releases; the CUDA 13.2 + TensorRT backend is 6.06 GB
uncompressed, 2.36 GB of it TensorRT - see File sizes below.)

**Why nsis-web, not a single-file NSIS installer:** the ~2.5 GB payload exceeds
the 32-bit `makensis` mmap ceiling, so a monolithic NSIS `.exe` physically cannot
build. The tiny web stub downloads `nsis-web/appPackageUrl`
(`https://updates.vision-studio-x.com/win`) at install time - the same zero-egress
host that serves the update feed.

### macOS + Linux (CI)

These are built and published by `.github/workflows/release-mac-linux.yml`
(`macos-15` arm64, building for macOS 14 and gated on it; `ubuntu-22.04`). It builds the native backend, runs a live
`/api/health` smoke gate (asserting `generation_available: true`), packages, and
publishes to R2. Trigger it by **pushing a `v*` tag** (auto-publishes when the R2
secrets are present) or manually:

```bash
gh workflow run release-mac-linux.yml --ref main -f publish_r2=true
```

macOS output: `Vision-Studio-<ver>-arm64.dmg` (~615 MB in 3.5.0) + `.zip` (~605 MB, the
format electron-updater consumes) + blockmaps + `latest-mac.yml`.
Linux output: `Vision-Studio-<ver>-x86_64.AppImage` (~7.25 GB in 3.5.0, with TensorRT) + `latest-linux.yml`.

## Delivery: Cloudflare R2

GitHub caps release assets at 2 GB, so the heavy installers ship from an R2
bucket (`vision-studio-delivery`) behind `updates.vision-studio-x.com`, one prefix
per platform mirroring each platform's electron-updater feed URL:

```
win/     latest.yml        stub .exe + .nsis.7z + portable zip
mac/     latest-mac.yml    dmg + zip + blockmaps
linux/   latest-linux.yml  AppImage
```

### Publishing

`scripts/publish-r2.cjs` uploads sequentially **binaries first, feed last** (a
client polling mid-publish can never resolve an update whose installer is not yet
up). It needs `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and
`R2_BUCKET` in the environment.

Windows is **two invocations** (the artifacts are split across `release/` and
`release/nsis-web/`), both into the `win/` prefix:

```bash
node scripts/publish-r2.cjs --dir release --prefix win/          # portable zip
node scripts/publish-r2.cjs --dir release/nsis-web --prefix win/ # stub + 7z + latest.yml (feed last)
```

macOS and Linux are published by the CI job (`--prefix mac/` / `--prefix linux/`).

After any publish, verify each object is live and complete - HEAD it and confirm
`Content-Length` matches the local file (catches a silently truncated multi-GB
upload):

```bash
curl -sI https://updates.vision-studio-x.com/win/vision-studio-<ver>-x64.nsis.7z
```

### GitHub release

The GitHub release is a version marker + notes; only the ~1 MB Windows stub is
attached (everything else exceeds the 2 GB cap). Point users at the R2 links or
the download page:

```bash
gh release create v<ver> --title "Vision Studio v<ver>" --notes-file notes.md \
  "release/nsis-web/Vision-Studio-<ver>-Setup.exe"
```

## Auto-updates

`electron/services/updater.ts` (electron-updater, generic provider) reads the
per-platform R2 feed. It checks on its own but **never downloads on its own**
(`autoDownload` is off): the user starts the multi-GB download with **Download
update** in **Settings > About**. On Windows it is **dormant until builds are
signed**: `electron-builder.yml` sets `win.verifyUpdateCodeSignature: true`, so
the updater refuses to install an unsigned package. Kill-switch:
`VISION_STUDIO_DISABLE_UPDATES=1`. The updater runs only in packaged builds and
always reads the packaged `app-update.yml`; the old `VISION_STUDIO_UPDATE_URL`
override is ignored. macOS builds are ad-hoc signed, so the updater is off on
macOS unless `VISION_STUDIO_ENABLE_MAC_UPDATES=1`. Installing an update asks
for confirmation while generations are running, and an installer closes a
running Vision Studio and its backend first (interactive installs ask before
they do).

## Code signing

Windows builds are **code-signed** from 3.5.0 on through Azure Artifact Signing
(publisher `Sharif Elsalaymeh`; details in
[`docs/code-signing.md`](docs/code-signing.md)); v3.4.1 and earlier are
unsigned. macOS builds are **ad-hoc signed** (the minimum for Apple Silicon to
launch; `scripts/adhoc-sign-mac.cjs` reseals the bundle in `afterPack`). While
the new Windows identity builds SmartScreen reputation, a signed installer can
still show "Windows protected your PC" with the publisher name ("More info" ->
"Run anyway"). On macOS 15 and later the app has to be
allowed once under System Settings > Privacy & Security ("Open Anyway"), because
Sequoia removed the right-click -> Open override; macOS 14, the oldest release
the build supports, still accepts right-click -> Open.

### Windows

Release signing is gated by `scripts/verify-release-signing.cjs`. Use
`npm run package:win` for unsigned local builds and `npm run package:win:signed`
for production (it fails fast unless one signing mode is configured). Modes:

1. **CSC / PFX** - `WIN_CSC_LINK` (or `CSC_LINK`) + `WIN_CSC_KEY_PASSWORD`.
2. **Windows certificate store** - `WIN_CSC_SUBJECT_NAME` or `WIN_CSC_SHA1`.
3. **Azure Artifact Signing** (formerly Trusted Signing; the variable names
   keep the old name) - `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`,
   `AZURE_TRUSTED_SIGNING_ENDPOINT`, `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`,
   `AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME`, plus an auth secret.

The Azure Artifact Signing secrets are configured in the repository and the
`Release` workflow is enabled. If the secrets are removed, the signed job fails
at its preflight rather than producing an unsigned artifact.

### macOS

Real distribution needs an Apple **Developer ID** identity plus notarization;
electron-updater on macOS refuses updates until the build is Developer-ID-signed.
Set `CSC_LINK`/`CSC_KEY_PASSWORD` (or a Keychain identity) and enable
`hardenedRuntime` + notarization, then the ad-hoc reseal step is superseded.

## File sizes

Approximate, as last measured on the v3.2.0 builds (CUDA 12.1 torch, no
TensorRT). The bundled backend dominates every package; check the files on the
release before quoting them.

| Platform | Installer / package | Notes |
|----------|--------------------|-------|
| Windows | ~1 MB stub + ~4.07 GB app package, or ~4.44 GB portable zip, as of v3.5.0 | nsis-web, signed |
| macOS (Apple Silicon) | ~615 MB dmg as of v3.5.0 | MPS wheel, no CUDA or TensorRT payload |
| Linux x64 | ~7.25 GB AppImage as of v3.5.0 | CUDA 13.2 torch + TensorRT |

From the CUDA 13.2 + TensorRT backend on, the Windows and Linux bundles grow by
the TensorRT runtime - **+2.36 GB (Windows) / +4.55 GB (Linux)** installed
(+1.93 GB / +3.75 GB to download), measured from the TensorRT 11.1 wheels - on
top of the CUDA 13.2 torch build. A local Windows build of that backend measures
6.06 GB uncompressed (`resources/backend/`, 5,783 MiB; TensorRT 2,252 MiB of it).
Re-measure the installers on the first such release and update this table.

## Debugging production builds

```bash
# Windows
"Vision Studio.exe" --enable-logging
# macOS
"/Applications/Vision Studio.app/Contents/MacOS/Vision Studio" --enable-logging
# Linux
./Vision-Studio-<ver>-x86_64.AppImage --enable-logging
```

## Resources

- [Electron Builder](https://www.electron.build/)
- [electron-builder code signing](https://www.electron.build/code-signing)
- [Apple notarization](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [PyInstaller](https://pyinstaller.org/)
