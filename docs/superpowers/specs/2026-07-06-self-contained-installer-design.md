# Self-Contained Installer — Design

**Status:** Draft for review
**Date:** 2026-07-06
**Owner:** Rocky (approver) / implementation TBD
**Related:** `build-backend.cjs`, `backend/main.spec`, `backend/foundry/download_manager.py`, `backend/foundry/verified-catalog.json`, `BUNDLING.md`, `WINDOWS_BUILD.md`

## 1. Problem

Vision Studio is a local-first, MIT-licensed desktop product. Today the **runtime** (Python, PyTorch/CUDA, diffusers, transformers, onnxruntime, spandrel, facexlib) is already frozen into `VisionStudio-Backend.exe` by PyInstaller and bundled into the installer — `scripts/assert-native-backend.cjs` refuses to build a slim installer, so "heavy by design" is enforced. But **model weights** are not bundled: they install per-user, one at a time, through the consent-gated Foundry. A new user therefore lands in an app that can't generate anything until they hunt down and install models themselves.

**Goal:** a world-class, zero-friction first-run experience. Users never chase an external dependency for the core product. The runtime is baked into the installer; the comprehensive model set is provisioned **automatically and seamlessly on first launch**, with real progress, integrity verification, and full license compliance. Heavy installer + large first-run download are acceptable and expected — this is a comprehensive professional tool, not a slim demo.

## 2. Decisions (locked with Rocky, 2026-07-06)

| Decision | Choice | Consequence |
|---|---|---|
| **Model scope** | **Comprehensive** — the entire `verified-catalog.json` set **minus the FLUX.1-dev non-commercial family** | Every advertised local capability works out of the box. FLUX-dev/-fill/controlnet-union-flux/ip-adapter-flux stay Foundry-manual (gated, user accepts non-commercial terms). |
| **Delivery** | **Runtime baked + first-run auto-provision** | Installer ≈ 6 GB (app + Python + torch/diffusers). Models (~50–60 GB) auto-fetch on first launch from a pinned manifest. Sidesteps GitHub's 2 GB asset cap for the model payload. |
| **License posture** | **Include Stability-Community models with attribution** | SD3.5 / SVD / LTX ship in the auto-set with `THIRD-PARTY-LICENSES` + "Powered by Stability AI" attribution. Users inherit the SAI Community $1M-revenue-cap term for those specific models (surfaced in-app). |

## 3. Non-Goals

- Slim / model-less installer variant (explicitly rejected — heavy is the point).
- Bundling FLUX.1-dev-licensed weights (non-commercial redistribution — legal hard stop).
- macOS/Linux packaging parity in the first delivery (Windows-first, mirroring the current release pipeline; architecture stays cross-platform-clean).
- Re-hosting weights we lack redistribution rights to.

## 4. Licensing audit (authoritative — drives §5 manifest)

Bundling/hosting weights = **redistribution**; each model keeps its own license. From `verified-catalog.json` (39 records):

| Class | Licenses | Auto-set? | Obligation |
|---|---|---|---|
| Permissive | MIT, Apache-2.0, BSD-3 | ✅ | Attribution in `THIRD-PARTY-LICENSES` |
| OpenRAIL / ++ | CreativeML-OpenRAIL-M, OpenRAIL, OpenRAIL++ (SD1.5, SDXL, SD15/SDXL ControlNets, AnimateDiff) | ✅ | Pass through license + use-based restrictions |
| Stability Community | SD3.5-large/medium, SVD, SD3.5 ControlNets, LTX-Video | ✅ (per decision) | NOTICES + "Powered by Stability AI"; $1M-revenue-cap term surfaced |
| **FLUX.1-dev non-commercial** | flux-dev, flux-fill, controlnet-union-flux, ip-adapter-flux (~78 GB) | 🚫 **excluded** | Foundry-manual only; user accepts gate + non-commercial |
| Unknown/missing | 3 annotators, ip-adapter-encoder-clip-vit-l | ⏳ verify before inclusion | Resolve exact upstream license in PR1; include only if redistribution-compatible |

**Compliance artifacts (shipped in the installer):**
1. `THIRD-PARTY-LICENSES.md` — generated, covers every provisioned model + every Python/JS dependency, with license text/URL + attribution.
2. In-app **About → Licenses** screen rendering the same, plus a persistent "Powered by Stability AI" mark while any SAI-Community model is present.
3. A machine-checked honesty rail (test): every auto-set entry has a redistribution-compatible license classification **and** a NOTICES entry; the FLUX-nc family is provably **absent** from the auto-set.

## 5. Provisioning manifest (source of truth)

New `backend/foundry/provision-manifest.json`, validated against `verified-catalog.json`. Each entry pins everything needed to fetch + verify + attribute a model deterministically:

```jsonc
{
  "schema": 1,
  "auto_set": [
    {
      "id": "sd-1-5",
      "files": [{ "name": "v1-5-pruned-emaonly.safetensors",
                  "sha256": "…", "bytes": 4265146304 }],
      "primary": { "kind": "hf", "repo_id": "stable-diffusion-v1-5/stable-diffusion-v1-5", "revision": "<pinned-sha>" },
      "mirror":  { "kind": "url", "url": "https://cdn.visionstudio.app/models/sd-1-5/v1-5-pruned-emaonly.safetensors" },
      "license": "creativeml-openrail-m",
      "attribution": null
    }
    // … every catalog record except the FLUX-nc family
  ],
  "excluded_non_commercial": ["flux-dev", "flux-fill", "controlnet-union-flux", "ip-adapter-flux"]
}
```

**Reliability — the runwayml problem.** `verified-catalog.json` pins `sd-1-5` to `runwayml/stable-diffusion-v1-5`, which **Runway deleted from HuggingFace**. Provisioning against it fails today. The manifest therefore:
- Repins fragile upstreams to permanent community repos (`stable-diffusion-v1-5/stable-diffusion-v1-5`) at an explicit revision, verified by `sha256`.
- Carries an optional **VS-hosted mirror** (Cloudflare R2 / Backblaze B2) per file as primary or fallback, so provisioning is resilient to any single upstream vanishing. Mirror hosting is redistribution — only permitted (permissive/OpenRAIL/SAI-Community) models get a VS mirror; FLUX-nc never does (and isn't in the set).
- `sha256` is mandatory on every file — integrity is verified on download and on startup (corrupt/partial files are re-fetched, never silently used).

## 6. First-run auto-provisioning (the new core feature)

**Detection.** On launch the renderer asks the backend which auto-set models are present under `MODELS_DIR` (`%APPDATA%/Vision Studio/models`). Missing-any → enter provisioning.

**Pre-flight.** Compute total bytes, check free disk on the models volume, and warn (with the exact GB) if space is tight. The user may (a) provision everything, (b) provision a recommended core first and background the rest, or (c) choose a custom subset — but the **default, one-click path provisions the comprehensive set**. "Comprehensive" must still respect physical disk: a clear pre-flight is not a corner cut, it's honesty.

**Orchestration.** A backend orchestrator enqueues the set through the existing `DownloadManager` (`enqueue/pause/resume/cancel/list_jobs/get_record_status`), bounded parallelism, resumable (HTTP range), `sha256`-verified per file. Aggregate + per-model progress stream to the renderer over the existing job/IPC channel.

**UX.** A first-run provisioning screen: total progress, per-model rows, live throughput/ETA, pause/resume/retry-failed, and **Continue in background** so the app is usable immediately — each feature gates on *its* model being ready (honest disabled states + "installing…" affordances, reusing the Foundry refusal patterns), never a fake-ready button.

**Idempotence & recovery.** Provisioning is resumable across restarts; a model already present + `sha256`-valid is skipped. A failed/paused set resumes exactly where it stopped. No progress theater (`setTimeout` sweeps are banned by existing tests — extend that rail here).

## 7. Delivery & updates

- **Installer:** electron-builder NSIS, ~6 GB (app asar + `VisionStudio-Backend.exe` + `THIRD-PARTY-LICENSES` + `provision-manifest.json`). `assert-native-backend.cjs` continues to forbid a runtime-less build.
- **Hosting:** 6 GB > GitHub's 2 GB/asset cap. Publish the full installer **and** the `electron-updater` feed (`latest.yml`) to object storage (Cloudflare R2 / B2); the GitHub Release carries release notes + a pointer (and optionally a <2 GB NSIS **web-installer stub** that pulls the runtime from R2). `electron-updater` is already a dependency — point its feed at R2.
- **Model CDN:** the same object storage backs the §5 mirror URLs.

## 8. Phased delivery (PR breakdown)

1. **PR1 — Manifest + licensing foundation (data + tests; CI-green; no heavy build).**
   `provision-manifest.json` (comprehensive set, pinned sources, `sha256`, license, attribution; FLUX-nc excluded + fragile upstreams repinned), a license-classification module, generated `THIRD-PARTY-LICENSES.md`, and honesty-rail tests (every entry redistribution-compatible + NOTICES-covered + sha256-present; FLUX-nc provably absent). Pure Python/data — ships immediately. *(Detailed plan authored alongside this spec.)*
2. **PR2 — Backend provisioning orchestrator + API.** `provision_all()` over `DownloadManager`, aggregate progress, resumable + `sha256` verification against the manifest, endpoints + IPC. Stub-CI-safe backend tests.
3. **PR3 — First-run provisioning UX + Licenses screen.** React provisioning screen (progress/pause/resume/retry/background), first-run detection, pre-flight disk check, About → Licenses + Stability attribution. Vitest + component tests.
4. **PR4 — Delivery: heavy installer, R2 hosting, updater, mirror fallback.** electron-builder config for the 6 GB installer, R2 publish + `electron-updater` feed, optional web-installer stub, packaging CI, mirror-fallback wiring. Build/packaging validation.

## 9. Testing & honesty rails

- Manifest validation (PR1): schema, `sha256` presence, license redistribution-compatibility, catalog cross-check, FLUX-nc exclusion.
- Provisioning (PR2): resume, corrupt-file re-fetch, aggregate progress math — all stub-safe (no torch); a `VS_REAL_SMOKE` gate for a real end-to-end small-model provision.
- UX (PR3): no progress theater, honest per-feature gating, license screen renders every provisioned model.
- Backward-compat: the Foundry manual flow stays intact for excluded/extra models.

## 10. Open questions / approvals needed

1. **Object storage** — confirm Cloudflare R2 vs Backblaze B2 (cost/egress). Hosting ~60 GB of weights + a 6 GB installer implies real egress cost at scale; a bandwidth/cost model is part of PR4. **Resolved (PR4): Cloudflare R2** — egress dominates at any adoption level and R2's custom-domain egress is $0; see the worked cost model in `docs/R2-DELIVERY.md` §4.
2. **Default provisioning behavior** — one-click "provision everything now" vs "provision recommended core, background the rest." Recommend the latter as the default *presentation* (fastest time-to-first-generation) while still pulling the full set.
3. **VS mirror vs pinned upstream** — host all permitted weights on R2 for maximum reliability (higher cost/control), or pin to upstream + R2-fallback only for fragile ones (lower cost). Recommend the latter to start. **Resolved (PR4): upstream-primary + license-gated R2 mirror fallback for fragile upstreams** (first candidate `sd-1-5`); mechanism shipped dark, go-live procedure in `docs/R2-DELIVERY.md` §5.
4. **Unknown-license models** (annotators, clip-vit-l) — resolve exact licenses in PR1; include only if redistribution-compatible, else keep Foundry-manual.
```
