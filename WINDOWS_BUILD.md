# Vision Studio - Windows Build Guide

How to build and publish the Windows installer. For the cross-platform picture
(macOS/Linux, R2 delivery, signing) see [`DEPLOYMENT.md`](DEPLOYMENT.md); for how
the backend bundle is produced see [`BUNDLING.md`](BUNDLING.md).

Windows is built **locally** — it is the delivery build. (macOS and Linux are
built in CI because PyInstaller can't cross-compile.)

## Prerequisites

- **Windows 10/11 64-bit**
- **Node.js 20+** — <https://nodejs.org/>
- **Git** — <https://git-scm.com/>
- **Python 3.10-3.12** — only if you need to (re)build the backend bundle;
  PyTorch has no 3.13+ wheels yet
- **~15 GB free disk** for a full backend rebuild (the CUDA torch venv is large)

## The build is heavy-by-design

Every Windows package ships the native PyInstaller backend (PyTorch + CUDA +
diffusers). `scripts/assert-native-backend.cjs` runs before packaging and
**aborts** if `resources/VisionStudio-Backend.exe` is missing or truncated —
there is no frontend-only Windows build.

## Build steps

### 1. Backend bundle — only if `backend/` changed

```powershell
npm run build:backend      # ~30-60 min; -> resources/VisionStudio-Backend.exe (~2.6 GB)
```

If `backend/` is unchanged since the last release, **skip this** — the existing
`resources/VisionStudio-Backend.exe` is byte-for-byte what a rebuild would
produce and is reused. Check with:

```powershell
git diff <last-release-commit>..HEAD -- backend/    # empty -> reuse the exe
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
| `nsis-web/vision-studio-<ver>-x64.nsis.7z` | ~2.56 GB | App package the stub downloads |
| `nsis-web/latest.yml` | <1 KB | electron-updater feed |
| `Vision Studio-<ver>-win.zip` | ~2.6 GB | Portable ZIP (no install) |

### Why nsis-web (not a single-file `.exe`)

The ~2.5 GB payload exceeds the 32-bit `makensis` mmap ceiling, so a monolithic
NSIS installer cannot build. The tiny stub downloads the `.nsis.7z` app package
from `nsisWeb.appPackageUrl` (`https://updates.vision-studio-x.com/win`) during
installation — the same zero-egress host that serves the update feed. The stub
and the `.nsis.7z` must be published together (see Publishing below), or the
installer 404s mid-install.

The installer still provides the full NSIS experience: license page (auto-uses
`LICENSE.txt`), install-directory choice, per-machine install, desktop + Start
Menu shortcuts, and a proper uninstaller (`installer.nsh`).

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

## Code signing (not yet configured)

Unsigned installers trigger a "Windows protected your PC" SmartScreen warning
("More info" -> "Run anyway"). Release signing is gated by
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
3. **Azure Trusted Signing** — `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`,
   `AZURE_TRUSTED_SIGNING_ENDPOINT`, `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`,
   `AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME`, plus an auth secret.

`electron-builder.yml` sets `publisherName` and `verifyUpdateCodeSignature: true`,
so auto-update only installs signed builds.

## Troubleshooting

**"Native backend bundle missing" during packaging** — run `npm run build:backend`
(or restore `resources/VisionStudio-Backend.exe` from the last release). The
`beforePack` gate refuses to produce a package without it.

**"Python not found" / wrong Python during `build:backend`** — install Python
3.10-3.12 and ensure it's on `PATH` (`py -3.12 --version`). PyTorch has no 3.13+
wheels yet.

**Out of disk space** — a full backend rebuild needs the CUDA torch venv (~10 GB
transient). Clean with `npm run clean` (build artifacts) or `npm run clean:all`
(also removes `node_modules` and the backend venv).

**PyTorch download slow/fails** — `build-backend.cjs` tries cu121 -> cu118 ->
the default index in order; a failure on one falls through to the next.

## Related npm scripts

| Script | Purpose |
|--------|---------|
| `npm run build:backend` | PyInstaller backend bundle -> `resources/` |
| `npm run build` | Vite frontend -> `dist/` |
| `npm run package:win` | nsis-web + portable zip (delivery build) |
| `npm run package:win:signed` | signed production build (requires a signing mode) |
| `npm run release:publish:r2` | publish `release/` to the R2 `win/` prefix |
| `npm run clean` / `clean:all` | remove build artifacts (and deps/venv) |
