# R2 Delivery Runbook — Installer Hosting, Update Feed, Model Mirror

**Track:** self-contained installer PR4 (spec `docs/superpowers/specs/2026-07-06-self-contained-installer-design.md` §7/§10)
**Status:** code + tooling shipped; the bucket/DNS/signing steps below are release-time operations.

Vision Studio's heavy installer (~6 GB) cannot ship as a GitHub release asset
(2 GB/asset cap). Delivery runs on Cloudflare R2 instead: the installer + the
`electron-updater` feed live behind `updates.vision-studio-x.com`, and permitted
model weights can be mirrored behind `models.vision-studio-x.com` as a fallback
for fragile upstreams. GitHub Releases still carry the notes and a download
pointer — never the multi-GB binaries.

## 1. Bucket layout

One R2 bucket (suggested name `vision-studio-delivery`):

```
win/                                  <- Windows feed + artifacts
  Vision-Studio-<ver>-Setup.exe       <- nsis-web stub (~1 MB)
  vision-studio-<ver>-x64.nsis.7z     <- app package the stub downloads (blockmap embedded)
  vision-studio-<ver>-win.zip         <- portable
  latest.yml                          <- electron-updater feed (uploaded LAST)
mac/                                  <- macOS feed + artifacts (Apple Silicon only)
  Vision-Studio-<ver>-arm64.dmg       <- human download
  Vision-Studio-<ver>-arm64.zip       <- electron-updater updates from the zip
  latest-mac.yml                      <- feed (uploaded LAST)
linux/                                <- Linux feed + artifacts
  Vision-Studio-<ver>-x86_64.AppImage <- electron-builder renders ${arch} as x86_64 for AppImage
  latest-linux.yml                    <- feed (uploaded LAST)
models/<model-id>/<file-path>         <- VS mirror weights (see section 5)
```

Each platform prefix must match that platform's electron-builder `publish.url`
path (`https://updates.vision-studio-x.com/<win|mac|linux>/` — publish is
declared per-platform in `electron-builder.yml`) —
`tests/packaging-config.test.ts` and `tests/publish-r2-core.test.ts` pin the
pairs.

## 2. One-time setup (Cloudflare account)

1. **Create the bucket** (dashboard → R2 → Create bucket, or `wrangler r2 bucket create vision-studio-delivery`).
2. **Custom domains** (bucket → Settings → Custom Domains): attach
   `updates.vision-studio-x.com` (and `models.vision-studio-x.com` at mirror
   go-live). R2 custom domains are served through Cloudflare — **zero egress
   fees** and normal CDN caching. Do not use the `r2.dev` development URL for
   production (rate-limited, no cache).
3. **API token** (R2 → Manage API Tokens): *Object Read & Write*, scoped to
   this bucket only. Record the Access Key ID / Secret Access Key.
4. **Local env** (never committed):

```powershell
$env:R2_ACCOUNT_ID = "<cloudflare account id>"
$env:R2_ACCESS_KEY_ID = "<token key id>"
$env:R2_SECRET_ACCESS_KEY = "<token secret>"
$env:R2_BUCKET = "vision-studio-delivery"
```

The same four names are the GitHub Actions secrets consumed by the optional
release-workflow publish step.

## 3. Publishing a release

### Windows (built on this machine or the signing-gated release.yml job)

```powershell
npm run build:backend          # PyInstaller backend -> resources/ (heavy-by-design gate)
npm run build                  # renderer + main
npm run package:win:signed     # nsis-web stub + .nsis.7z + latest.yml (release/nsis-web/) + zip (release/)
npm run release:publish:r2 -- --dry-run   # review the ordered plan (zip)
npm run release:publish:r2                             # 1) portable zip from release/
npm run release:publish:r2 -- --dir release/nsis-web   # 2) stub + .nsis.7z + latest.yml
gh release create v<ver> --notes-file <notes>   # notes + pointer, NO >2GB assets
```

### macOS + Linux (CI only — PyInstaller cannot cross-compile)

`.github/workflows/release-mac-linux.yml` builds each platform on its native
runner (macos-14 arm64 / ubuntu-22.04 x64): per-OS torch, the full diffusers
stack, PyInstaller bundle, a live `/api/health` smoke gate asserting
`generation_available: true` (the class of failure #60 fixed), then
electron-builder packaging and an R2 publish to `mac/` / `linux/`.

- Runs on `v*` tags automatically, or on demand:

```powershell
gh workflow run release-mac-linux.yml --ref main -f publish_r2=true
gh run watch   # ~40-70 min per platform
```

- Publish only happens when the four `R2_*` repo secrets exist; binaries
  upload before the `latest-*.yml` feed, per platform, same as Windows.
- macOS is **Apple Silicon only**: PyTorch dropped macOS x64 wheels at 2.3,
  so an Intel backend bundle cannot be built.
- Linux ships **AppImage only**: the one format electron-updater can
  auto-update; per-distro deb/rpm variants of a multi-GB payload are pure
  storage cost with no delivery win.

electron-builder writes the nsis-web artifacts into `release/nsis-web/`, so
the publish is **two invocations in this order** — the feed (`latest.yml`)
rides the second call and still uploads absolutely last. Within each call
`scripts/publish-r2.cjs` uploads **sequentially, binaries first and
`latest.yml` last**, so a client polling the feed mid-publish can never
resolve an update whose installer is missing. Any failure aborts before the
feed flips. Multipart uploads (`@aws-sdk/lib-storage`) handle the multi-GB
app package; re-running the script simply overwrites the objects.

### Unsigned-build posture per platform

- **Windows**: the nsis-web stub runs but SmartScreen warns until Azure
  Trusted Signing lands.
- **macOS**: electron-builder ad-hoc signs the bundle when no Developer ID
  identity is configured (mandatory for arm64 to launch at all; the CI job
  verifies with `codesign --verify --deep --strict`). Gatekeeper still
  requires **right-click → Open** (or `xattr -d com.apple.quarantine`) on
  first launch until real signing + notarization land.
- **Linux**: no signing gate; users `chmod +x` the AppImage and run.

### Signing prerequisite (read before flipping the feed live)

`win.verifyUpdateCodeSignature: true` means the packaged app **refuses to
install an unsigned update**. Publishing an unsigned build to the feed does
not compromise clients — the updater downloads, fails signature verification,
and surfaces an honest error — but it delivers no updates either. macOS is
stricter still: electron-updater on macOS requires a Developer-ID-signed app
before it will apply any update, so the mac feed stays dormant exactly like
Windows until real signing lands. Order of operations:

1. Azure Trusted Signing secrets land (`release.yml` already carries the env
   plumbing; `npm run release:signing:check` validates locally).
2. First **signed** release is published to `win/`.
3. From then on auto-update is live for every installed copy.

Never disable `verifyUpdateCodeSignature` to "make updates work" — that trades
a delivery inconvenience for an update-hijack surface.

Note: `useMultipleRangeRequest: false` is required in the publish config — R2
(like S3) serves a single range per request, and electron-updater's
multi-range differential download breaks against it. Blockmap differentials
still work; they just issue one range at a time.

## 4. Cost model — §10 open question 1 (RESOLVED: Cloudflare R2)

Rates as of 2026-07 (verify at
[R2 pricing](https://developers.cloudflare.com/r2/pricing/) and
[B2 pricing](https://www.backblaze.com/cloud-storage/pricing)):

| | Cloudflare R2 | Backblaze B2 |
|---|---|---|
| Storage | $0.015/GB-month | $0.006/GB-month |
| **Egress** | **$0** (incl. custom domain) | free up to 3× stored/month, then $0.01/GB |
| Writes (Class A) | $4.50/M ops | first 2,500/day free, then $0.004/10k |
| Reads (Class B) | $0.36/M ops | first 2,500/day free, then $0.004/10k |

Worked example — 6 GB installer + ~60 GB mirrored weights stored, 1,000
installs/month (each pulling the installer + up to the full model set):

- **Storage:** 66 GB ≈ **$0.99/mo** on R2 (vs $0.40 on B2 — negligible either way).
- **Egress:** up to ~66 TB/month. **R2: $0.** B2: ~66 TB − 0.2 TB free ≈
  **~$660/mo** (B2 through Cloudflare's CDN can reduce this, but that
  re-introduces R2's own architecture with more moving parts).
- Update deltas ride the blockmap, so recurring update egress is a fraction of
  installer size.

**Egress dominates at any adoption level; R2's zero-egress custom domain wins
decisively.** Storage-price differences are cents. Decision: **R2.**

## 5. Model mirror go-live — §10 open question 3 (RESOLVED: upstream-primary + fallback)

Strategy: models provision from their pinned upstreams (HF LFS-verified);
the VS mirror is a **fallback only**, added per-model for fragile or
high-value upstreams (first candidate: `sd-1-5`, whose original
`runwayml` repo was deleted). This is the spec's own recommendation — lowest
cost, full resilience where it matters.

To put a model on the mirror:

1. Stage the exact files locally (the same paths the primary serves).
2. Upload: `node scripts/publish-r2.cjs --mirror --dir <staging-dir> --prefix models/<model-id>/`
   (`--mirror` uploads every staged file recursively — weights are
   `.safetensors`/`.onnx`/`.ckpt`, which the release-artifact filter
   deliberately excludes — and requires explicit `--dir`/`--prefix` so
   weights can never land under the `win/` feed by accident.)
3. Hash every uploaded file: `Get-FileHash -Algorithm SHA256 <file>`.
4. Add the stanza to `backend/foundry/provision-overrides.json`:

```jsonc
"mirrors": {
  "sd-1-5": {
    "base_url": "https://models.vision-studio-x.com/models/sd-1-5",
    "files": [
      { "name": "model_index.json", "sha256": "<real hash>", "bytes": 541 },
      { "name": "unet/diffusion_pytorch_model.safetensors", "sha256": "<real hash>", "bytes": 3438167540 }
    ]
  }
}
```

5. Regenerate the manifest (`backend/venv/Scripts/python.exe -m foundry.provisioning`)
   and ship through a normal PR.

The build refuses a mirror stanza for anything outside the redistributable
auto-set (hosting weights **is** redistribution — FLUX-nc and CMU OpenPose can
never acquire one), refuses missing/invalid sha256, non-https URLs, and unsafe
file names. At runtime the `DownloadManager` uses the mirror only on
infrastructure failure — never for license gates, disk refusals, or user
cancellation — and verifies every mirrored file's sha256 before it can land.
**Never fabricate hashes; they come from the files you uploaded.**

## 6. Web-installer stub — IMPLEMENTED (2026-07-11, by necessity)

Originally deferred, then made mandatory by reality: the app payload
(~2.5 GB PyInstaller backend + app) exceeds the 32-bit `makensis` mmap
ceiling, so a single-file NSIS installer **physically cannot build**
(`File: failed creating mmap of ...nsis.7z`). The Windows target is now
`nsis-web`:

- `Vision-Studio-<ver>-Setup.exe` — tiny stub, safe to build and sign.
- `vision-studio-<ver>-x64.nsis.7z` — the app package; the stub downloads it
  at install time from `nsisWeb.appPackageUrl`
  (`https://updates.vision-studio-x.com/win`) — the same zero-egress R2
  prefix as the update feed. `scripts/publish-r2.cjs` ships it automatically
  (the `.nsis.7z` pattern is a pinned release artifact, uploaded before
  `latest.yml`).
- electron-updater consumes nsis-web feeds natively; nothing changes for the
  updater service.

The portable zip remains the offline-friendly alternative for users who
cannot download during install.

## 7. Real-provision smoke gate (spec §9)

```powershell
$env:VS_REAL_SMOKE = "1"
backend/venv/Scripts/python.exe -m pytest backend/tests/test_provision_real_smoke.py -v
```

Provisions the smallest auto-set model end-to-end (real registry, real
orchestrator, real DownloadManager, real upstream, throwaway models dir) and
asserts the bytes land and verify. Run it before any release that touches the
provisioning pipeline; it is skipped everywhere by default.
