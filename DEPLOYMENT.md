# Vision Studio - Deployment Guide

How Vision Studio is built, packaged, and delivered for Windows, macOS, and Linux.

Current release: **v3.2.0**. Version history lives in [`CHANGELOG.md`](CHANGELOG.md).

## Heavy-by-design: one build shape

Every distributable ships the **native PyInstaller backend** (PyTorch, diffusers,
transformers, and the CUDA/MPS runtime). There is no slim, frontend-only, or
"download PyTorch on first run" variant — `scripts/assert-native-backend.cjs`
runs as electron-builder's `beforePack` hook and **aborts packaging** if the
backend bundle is missing or truncated. What a user downloads on first run is
model *weights* (consent-gated through the in-app Foundry), never the runtime.

See [`BUNDLING.md`](BUNDLING.md) for how the backend bundle itself is produced.

## Where builds run

| Platform | Where it's built | Why |
|----------|------------------|-----|
| Windows x64 | **Locally** (`npm run package:win`) | The signed-CI path is gated on secrets; the local build is the delivery build. |
| macOS arm64 | **CI only** (`release-mac-linux.yml`) | PyInstaller can't cross-compile; the macOS bundle must be built on macOS (Apple Silicon). |
| Linux x64 | **CI only** (`release-mac-linux.yml`) | Same — the Linux CUDA bundle must be built on Linux. |

macOS is **Apple Silicon only** — PyTorch dropped macOS x64 wheels at 2.3, so an
Intel build would ship without its backend.

## Pre-release checklist

- [ ] Work is merged to `main` and green (`npm run typecheck`, `npm test`, `npm run build`)
- [ ] Bump the version in lockstep: `npm version X.Y.Z --no-git-tag-version`
      (updates `package.json` + `package-lock.json`), then `scripts/installer.iss`
      (`MyAppVersion`) and add a `CHANGELOG.md` entry
- [ ] Only rebuild the backend bundle if `backend/` actually changed since the last
      release (`git diff <last-release-commit>..HEAD -- backend/`) — otherwise the
      existing `resources/VisionStudio-Backend.exe` is reused as-is

## Build process

### 1. Backend bundle (only if `backend/` changed)

```bash
npm run build:backend          # PyInstaller onefile -> resources/VisionStudio-Backend[.exe]
```

~30-60 min (installs the CUDA torch stack + diffusers, then runs PyInstaller).
If `backend/` is unchanged since the last release, skip this — the packaged
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
| `Vision-Studio-<ver>-Setup.exe` | ~1 MB | **nsis-web stub** — downloads the app package at install time |
| `vision-studio-<ver>-x64.nsis.7z` | ~2.56 GB | app package the stub pulls from the R2 host |
| `Vision Studio-<ver>-win.zip` | ~2.6 GB | portable ZIP (no install) |
| `latest.yml` | <1 KB | electron-updater feed |

**Why nsis-web, not a single-file NSIS installer:** the ~2.5 GB payload exceeds
the 32-bit `makensis` mmap ceiling, so a monolithic NSIS `.exe` physically cannot
build. The tiny web stub downloads `nsis-web/appPackageUrl`
(`https://updates.vision-studio-x.com/win`) at install time — the same zero-egress
host that serves the update feed.

### macOS + Linux (CI)

These are built and published by `.github/workflows/release-mac-linux.yml`
(`macos-14` arm64, `ubuntu-22.04`). It builds the native backend, runs a live
`/api/health` smoke gate (asserting `generation_available: true`), packages, and
publishes to R2. Trigger it by **pushing a `v*` tag** (auto-publishes when the R2
secrets are present) or manually:

```bash
gh workflow run release-mac-linux.yml --ref main -f publish_r2=true
```

macOS output: `Vision-Studio-<ver>-arm64.dmg` (~527 MB) + `.zip` (~519 MB, the
format electron-updater consumes) + blockmaps + `latest-mac.yml`.
Linux output: `Vision-Studio-<ver>-x86_64.AppImage` (~3.3 GB) + `latest-linux.yml`.

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

After any publish, verify each object is live and complete — HEAD it and confirm
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
per-platform R2 feed. It is **dormant until builds are signed**:
`electron-builder.yml` sets `verifyUpdateCodeSignature: true`, so the updater
refuses to install an unsigned package. Kill-switch: `VISION_STUDIO_DISABLE_UPDATES=1`;
staging override: `VISION_STUDIO_UPDATE_URL`.

## Code signing (not yet configured)

Builds currently ship **unsigned** (Windows) and **ad-hoc signed** (macOS — the
minimum for Apple Silicon to launch; `scripts/adhoc-sign-mac.cjs` reseals the
bundle in `afterPack`). Until real signing lands, Windows shows a SmartScreen
warning ("More info" -> "Run anyway") and macOS requires right-click -> Open on
first launch.

### Windows

Release signing is gated by `scripts/verify-release-signing.cjs`. Use
`npm run package:win` for unsigned local builds and `npm run package:win:signed`
for production (it fails fast unless one signing mode is configured). Modes:

1. **CSC / PFX** — `WIN_CSC_LINK` (or `CSC_LINK`) + `WIN_CSC_KEY_PASSWORD`.
2. **Windows certificate store** — `WIN_CSC_SUBJECT_NAME` or `WIN_CSC_SHA1`.
3. **Azure Trusted Signing** — `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`,
   `AZURE_TRUSTED_SIGNING_ENDPOINT`, `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`,
   `AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME`, plus an auth secret.

Once a mode is configured, re-enable the signed-CI release: `gh workflow enable release.yml`.

### macOS

Real distribution needs an Apple **Developer ID** identity plus notarization;
electron-updater on macOS refuses updates until the build is Developer-ID-signed.
Set `CSC_LINK`/`CSC_KEY_PASSWORD` (or a Keychain identity) and enable
`hardenedRuntime` + notarization, then the ad-hoc reseal step is superseded.

## File sizes (v3.2.0)

| Platform | Installer / package | Notes |
|----------|--------------------|-------|
| Windows | ~1 MB stub + ~2.56 GB app package (or ~2.6 GB portable zip) | nsis-web |
| macOS (Apple Silicon) | ~527 MB dmg | MPS wheel, no CUDA payload |
| Linux x64 | ~3.3 GB AppImage | real CUDA 12.1 torch |

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
