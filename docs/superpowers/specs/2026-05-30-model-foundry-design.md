# Model Foundry — Design Spec

**Project:** Vision Studio
**Pillar:** 1 of 6 — *The Model Foundry (Hugging Face, native)*
**Date:** 2026-05-30
**Status:** Approved design → ready for implementation planning
**Branch context:** authored during the post-MIT public-release "next level" program (local-first, HF + OpenRouter integration, CUDA acceleration, agentic core)

---

## 0. Why this exists

Vision Studio is a local-first, on-device AI image/video generation desktop app (Electron 33 + React 19 + TypeScript + Vite + Tailwind v4, with a Python FastAPI/PyTorch backend). It just flipped to MIT and went public. The goal of this pillar is to make Vision Studio a *must-have* for the GPU-rich, local-first audience by turning model acquisition and management from a hardcoded afterthought into a **professional-grade, Hugging Face-native Model Foundry**: browse the whole Hub, own every model you already have, download fast and safely, and have any recognized model wire itself to the correct pipeline automatically.

This is the first of six pillars (Foundry → Accelerator → Routing Fabric → Director → Provenance → Platform). It is the supply chain everything downstream eats from.

### Current reality (what we are extending, not replacing wholesale)

- **Backend** (`backend/utils/model_manager.py`): a real `ModelManager` on `huggingface_hub` (`snapshot_download` / `hf_hub_download`, resume on), but the catalog is a **hardcoded `PREDEFINED_MODELS` dict (~13 models)**. No search, no browse, no `hf_transfer`; **HF download progress jumps 0→100** (only the CivitAI path streams real progress); the `download_tasks` dict exists but is never wired into a queue; tokens are passed per-call with no secure storage and no gated-license handling; model `type` is hand-set; `_detect_model_type` guesses from filename substrings.
- **Frontend** (`src/components/generate/ModelSelector.tsx`): a **separate hardcoded** `IMAGE_MODELS` / `VIDEO_MODELS` list with richer UI metadata (`runtime`, `availability`, `hardware`, `quality`, `vram`). It already gestures at importing external models (`runtime: 'byom' | 'comfyui'`, `availability: 'import-required'`).
- **Consequence:** two independent sources of truth that **already drift**. Unifying them is unavoidably job one and is the single highest-value, lowest-risk win.

---

## 1. Locked decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | Catalog philosophy | **Hybrid: Verified shelf + full Hub search** | Curated, tested, one-click front door; full Hugging Face Hub search behind a clearly-marked boundary; every repo classified Verified / Compatible / Experimental. Maximum power with honest, professional posture. |
| D2 | Storage + existing libraries | **Unified library + import/link** | App library is canonical, but the Foundry also indexes the existing HF cache (`HF_HOME`) and lets users import/link external folders (ComfyUI, A1111, raw drives) **by reference** — no re-download, no duplication. Biggest adoption lever. |
| D3 | v1 artifact + source scope | **Full ecosystem** | v1 covers image + video pipelines, LoRAs, ControlNets, VAEs, embeddings/IP-adapters — Hugging Face primary, **CivitAI first-class secondary**. Matches the "gift to the world" maximalism and leverages existing ControlNet/LoRA panels + CivitAI plumbing. |
| D4 | Build architecture | **Approach A — registry-first, incremental** | Unify into one backend-owned registry first (drift dies day one), then layer acquisition → indexer → search/classifier → hardware-fit/auto-wiring. Shippable at every step; keeps `main` green; absorbs HF-native tactics internally. |
| D5 | Download concurrency | **User-configurable, default 2** (clamp 1–6) | Sane resting state; fat-pipe users can raise it; clamp avoids self-inflicted stalls. |
| D6 | First-run behavior | **Auto-detect-and-offer, opt-in** | Detect existing ComfyUI / A1111 / HF cache and *offer* one-click import. Wins users in the first ninety seconds; never touches anything without a yes. |
| D7 | Pickle weights (`.ckpt`/`.bin`/`.pt`) | **Allow with explicit consent + offer convert** | safetensors flows freely; pickle loads only after a one-time per-model "this can run code" consent and is auto-tagged Experimental; offer one-click convert-to-safetensors where possible. Safe by default, ecosystem stays open. |
| D8 | Auto-wiring aggressiveness | **Automatic, visible, overridable** | Auto-select pipeline/precision/offload and auto-fetch missing components, but surface the resolved plan and let power users override anything. Progressive disclosure: effortless for all, full control for the few. |
| D9 | Quality / de-risking | **Dev spikes + TDD + Codex gates** | Time-boxed throwaway spikes before each high-uncertainty milestone; every milestone built red-green-refactor; independent Codex review at the four highest-leverage gates. Public-repo insurance against expensive embedded mistakes. |

---

## 2. Architecture spine — the Model Registry

One backend service, `ModelRegistry`, becomes the sole authority on *what models exist, where they are, what state they're in, and whether they'll run on this machine.* It is assembled from three feeds — the shipped **Verified Catalog** manifest, the **Library Index** (downloaded + HF cache + linked external), and live **Hub / CivitAI search** — and exposes one unified `ModelRecord` over all of them. `ModelSelector` and every generation path read from it. Nothing hardcodes a model list again.

### 2.1 The atomic unit — `ModelRecord`

A superset reconciling backend `ModelInfo` + frontend `ModelOption` so no metadata from either is lost.

```
ModelRecord
  # Identity
  id                 stable slug ("flux-dev")
  name               display ("FLUX.1 [dev]")
  artifact_type      checkpoint | diffusers-pipeline | lora | vae | controlnet
                     | embedding | ip-adapter | motion-adapter
  capability         image | video | edit | inpaint          (drives UI routing)
  base_architecture  flux | sdxl | sd15 | sd35 | ltx | svd | animatediff | unknown

  # Origin
  source             huggingface | civitai | local | linked
  repo_id, revision  HF coordinates — revision PINNED (reproducibility → Pillar 5)
  aux_repo_id        e.g. animatediff motion adapter
  files[]            specific files/patterns for single-file artifacts
  model_card_url

  # Location  (realizes D2 — unified library)
  backing            app-managed | hf-cache | linked-external | not-present
  path               resolved on-disk path | null
  link_type          junction | hardlink | copy | none
  bytes, sha256      integrity + true size

  # State
  status             not-present | queued | downloading | verifying | ready
                     | error | update-available | unavailable
  progress, speed, eta

  # Compatibility  (the professional layer)
  tier               verified | compatible | experimental
  tier_reason        short machine-readable explanation of the tier
  vram_required      estimate (or measured) per precision
  hardware_fit       fits | fits-with-offload | over-budget   (vs detected GPU)
  precision_options  [bf16, fp16, fp8, ...]                    (bridge → Pillar 2)

  # Provenance / trust
  license, gated     license id + bool
  format             safetensors | pickle | diffusers
  trust_remote_code  required? (default: deny)
```

### 2.2 Load-bearing rules

- **Verified Catalog is a versioned manifest, not code.** `PREDEFINED_MODELS` becomes `verified-catalog.json` shipped with the app (later refreshable over the network). Blessing a model is a *data edit*, not a release. The manifest also encodes per-model **dependency graphs** (companion VAE/text-encoders/adapters) and **measured** VRAM numbers from Spike D.
- **Assembly + reconciliation on boot:** load manifest → index the library (§4) → merge by `(repo_id, revision, files)`. A Verified model already present shows `ready` with full curated metadata; a stray local file shows `local / experimental` with detected type/arch. Search results (§5) merge transiently on top.
- **Single source of truth, enforced.** `ModelSelector`'s `IMAGE_MODELS` / `VIDEO_MODELS` are deleted; it fetches `ModelRecord[]` (filtered by capability) over IPC→FastAPI. A **regression test asserts there is exactly one catalog source** so the drift cannot silently return.
- **Stable slugs + legacy mapping.** Existing model ids referenced by saved projects/jobs keep their slugs; a legacy-id map + migration test guarantees no saved project breaks.

### 2.3 Data flow

```
verified-catalog.json ─┐
HF cache / app tree  ──┼──>  ModelRegistry  ──(IPC / REST)──>  ModelSelector + generation paths
linked external dirs ──┤          │
Hub / CivitAI search ──┘          └─ compatibility classifier + hardware-fit overlay
```

---

## 3. Acquisition engine + auth / gated / license

1. **Fast transfers + precise/fast toggle.** Use **`hf_xet`** (Xet protocol) for accelerated chunked pulls on large weights — already a transitive dep of `huggingface_hub` 1.x and **byte-granular** through the same progress hook as plain HTTP. `hf_transfer` is **dropped** (removed/deprecated in 1.x; the env var only warns now). A deliberate **fast/precise toggle** is retained as a hedge: **fast** = Xet on (optional `HF_XET_HIGH_PERFORMANCE`); **precise** = `HF_HUB_DISABLE_XET` forces the plain HTTP path for byte-exact per-chunk progress and immediate mid-file cancel. Pin `hf_xet` and bump the `huggingface-hub` floor to `>=1.10.1` in `requirements.txt`. *(Mechanism proven in Spike A → `docs/superpowers/spikes/2026-06-01-download-telemetry.md`.)*
2. **True progress streaming.** Pre-compute total bytes from repo metadata (`HfApi.get_paths_info` / `model_info(files_metadata=True)`), download **per-file**, and harvest in-flight bytes via a headless custom **`tqdm_class`** injected into `hf_hub_download` (the public param threads into both the HTTP and Xet backends). Accumulate completed + in-flight bytes into the `ModelRecord` (`progress`, `speed`, `eta`) — **byte-granular by default** on both paths. Replaces the fake 0→100.
3. **`DownloadManager`.** Bounded-concurrency queue (D5: configurable, default 2, clamp 1–6), each job an `asyncio.Task` keyed by model id — wiring the dormant `download_tasks` dict. Lifecycle: **pause** (cancel task, keep `.incomplete` partials), **resume** (re-invoke `hf_hub_download` — auto-resumes from `.incomplete`; no `resume_download` kwarg in 1.x), **cancel** (stop + clean partials), **reorder / priority**. *(Mid-file cancel is immediate on the HTTP/precise path; file-boundary on the Xet path.)*
4. **Disk-space preflight.** `shutil.disk_usage` on the target volume vs known size + headroom before queueing. Refuse early with a clear message rather than dying near the end of a large pull.
5. **Atomic, verified completion.** Download to `.incomplete` → `verifying` (sha256 / HF etag) → atomic move → register `ready`. An interrupted/corrupt download never presents as `ready`. Brings HF single-file and diffusers-bundle paths under the temp+move discipline the CivitAI path already uses. *(`huggingface_hub` already does per-file `.incomplete` → size-consistency check → atomic move; the manager layers the repo-level `verifying → ready` transition on top.)*
6. **Secure tokens.** HF + CivitAI tokens live in the **Electron main process** (`safeStorage`), passed to the backend per-request — never persisted in Python, never logged. Replaces `os.getenv("CIVITAI_API_TOKEN")`.
7. **Gated-license flow — surface, never bypass.** Detect the gated 401/403 case and present a clear **"Accept this model's license on Hugging Face"** CTA deep-linking the repo gate, then retry on return. `license` + `gated` land on the record for up-front lock state.
8. **Typed resilience.** Network drop → resume; transient 5xx → backoff retry; 401 gated → license CTA; partial/corrupt → re-fetch. Every failure becomes a typed, surfaced error (mirrors the generation path's poll-error-budget discipline).

Download status streams to the frontend the same way generation jobs already do (registry emits → renderer subscribes).

---

## 4. Library indexer + import/link

1. **Three index feeds, merged into the registry:**
   - **App-managed tree** — current `checkpoints/ loras/ vaes/ controlnet/ …` layout.
   - **HF cache** — via `huggingface_hub.scan_cache_dir()` (repos, revisions, sizes, real paths; abstracts the blob+snapshot structure). Weights pulled in a prior `from_pretrained` *just appear*, reconciled against the Verified catalog by `repo_id + revision`.
   - **Linked external roots** — user points at a ComfyUI `models/`, an A1111 install, or a raw drive; indexed **in place**.
2. **Import/link by reference, never copy** (D2). Adding a root registers a *library root* with a layout hint (`comfyui | a1111 | generic`); known layouts type artifacts for free. Bytes are referenced where they live; a link is **materialized only when a pipeline needs a concrete path** — Windows **junction** (dirs) / **hardlink** (files, same volume), **copy-fallback** across volumes; no elevation, ever. *(Validated in Spike B.)*
3. **Identity & dedup without hashing the world.** Cheap identity first — `(size + head/tail block hash + name)` — with **full sha256 computed lazily in the background** for verification + provenance. HF-cache items dedup by `repo_id+revision`; loose files by quick-hash. The same weights in cache *and* an external folder collapse to **one record with multiple backing locations.**
4. **Real type/architecture detection.** Replace substring-guessing by reading the **safetensors header** (small JSON block; tensor names/shapes reveal sdxl vs sd15 vs flux, or `lora_*` keys), and for diffusers folders `model_index.json` / `config.json`. Populates `artifact_type` + `base_architecture`; feeds §6 auto-wiring. *(Accuracy validated in Spike C.)*
5. **Incremental, non-blocking scans.** Persist `(mtime, size)` signatures → incremental re-scans, never a full re-hash. Background worker; root-add triggers a scan; UI never blocks even on thousands of files.
6. **Clean reconciliation + safe removal.** Indexed items merge by identity (Verified-but-present → `ready` + curated metadata; unknown local → `local/experimental`). Removing a root drops its *referenced-only* records and **touches zero original bytes**. `delete model` only removes app-managed copies or our own links — **never** a user's linked source. An unmounted NAS marks records `unavailable`, not an error storm.
7. **First-run (D6).** Auto-detect existing ComfyUI / A1111 / HF cache and *offer* one-click, opt-in import.

---

## 5. Hub search + compatibility classifier + security

1. **Live search across both sources.** HF via `HfApi.list_models()` with real filters — `pipeline_tag` (text-to-image, image-to-image, text-to-video, image-to-video), `library=diffusers`, tags, license, gated, sort (downloads / likes / trending), author/org, free-text — paginated + debounced. CivitAI via its REST API (type + base-model + sort). Results stream into the registry transiently (`status: not-present`) carrying model card (HF README rendered in-app), downloads/likes, size, license, lock state. **Offline-degrading:** no network → search dims, local library stays 100% operational.
2. **Compatibility classifier — tri-tier, with a stated reason:**
   - **Verified** — in `verified-catalog.json`. Tested; one-click; guaranteed to load.
   - **Compatible** — classifier-confident our existing pipelines load it: `library_name == diffusers` + recognized `pipeline_tag`/architecture (flux / sdxl / sd15 / sd35 / ltx / svd / animatediff), or `model_index.json` mapping a pipeline class we ship, or a safetensors header matching a supported family — **and** no remote-code requirement.
   - **Experimental** — recognized but uncertain: unknown architecture, pickle-only, custom pipeline, `trust_remote_code` required, or missing metadata. Behind an honest "this might not work" gate.
   - Classifies from **metadata pre-download**, **upgrades/downgrades post-index** on real header inspection. Every record carries a one-line `tier_reason` ("diffusers FLUX pipeline · safetensors · no remote code"). Tier = "will it load"; `hardware_fit` (§6) = "will it run on *your* GPU". *(Confidence/thresholds set by Spike C; its corpus becomes the test fixtures.)*
3. **Safe by default, powerful on purpose:**
   - **`trust_remote_code` defaults to DENY.** Enabling it is explicit, per-repo, clearly warned ("runs code authored by the repo"). Verified never requires it.
   - **safetensors-first;** **pickle allowed only with explicit per-model consent** (D7), auto-tagged Experimental, with an offered **convert-to-safetensors**.
   - **Verified-org signal** — author, downloads, known-org provenance shown so trust is judged on evidence.
   - **CivitAI NSFW filtered by default**, explicit opt-in toggle.
   - **No silent trust elevation, ever** — each step up is a deliberate, logged user action.

---

## 6. Hardware-fit + architecture auto-detection → pipeline auto-wiring

The Foundry decides *what a model needs, whether it runs here, and how it should load* — **the plan.** Pillar 2 (Accelerator) makes that plan run as fast as physically possible — **the execution.** No overlap.

1. **Hardware probe.** Extend `systemInfo` into a backend `HardwareProfile` (torch/CUDA + psutil): GPU model, total + free VRAM, compute capability (gates fp8 → sm_89+/Ada-Hopper; bf16 → Ampere+), system RAM (offload headroom), CUDA/driver, disk free.
2. **VRAM-fit estimator, per model, per precision.** Verified entries use **measured** numbers (Spike D); Compatible/Experimental get **estimates** from parameter/file size × precision factor + a runtime-overhead band. `hardware_fit` = estimate vs free VRAM → `fits | fits-with-offload | over-budget`. Measured vs estimated is always labeled honestly.
3. **Architecture → pipeline auto-wiring.** Detected `base_architecture` maps to the diffusers pipeline + loader:
   ```
   flux        → FluxPipeline / Img2Img / Fill
   sdxl        → StableDiffusionXLPipeline (+ refiner, VAE)
   sd15        → StableDiffusionPipeline
   sd35        → StableDiffusion3Pipeline
   ltx         → LTXPipeline                 (video)
   svd         → StableVideoDiffusionPipeline
   animatediff → AnimateDiffPipeline + motion adapter
   single-file → from_single_file(<class>, <detected config>)
   ```
   **Auto-resolves companion components** (FLUX → T5 + CLIP; SDXL → VAE; AnimateDiff → motion adapter): Verified catalog encodes the dependency graph; Compatible infers from `model_index.json` submodels; the Foundry **offers to fetch what's missing.**
4. **Recommended runtime config from fit.** Emits a plan — precision (bf16 on Ampere+, fp16 fallback, fp8 where supported) + VAE tiling/slicing, attention slicing, CPU/sequential offload when `fits-with-offload`. One function, `resolve_model_runtime(model_id, hardware) → { pipeline_class, components, precision, offload_flags, vram_plan }`, replaces hardcoded handling in `direct_generator.py`; the generator consumes *that*. **This plan is the input Pillar 2 optimizes within.** Per D8: the plan is **surfaced and fully overridable.**
5. **Run-readiness preflight.** Tier + hardware-fit + dependency-completeness collapse into one honest readout the existing `GeneratePanel` **preflight summary footer** shows pre-launch: "Ready · bf16 · fits" / "Needs T5 encoder (1.2 GB)" / "Runs with CPU offload (~slower)" / "Over budget on 8 GB VRAM." No more OOM three minutes into a run.
6. **Graceful fallback ladder.** On load OOM, auto-step down (lower precision → enable offload → enable tiling) and retry instead of dying. Foundry owns the recommendation + ladder; Pillar 2 makes each rung fast.

---

## 7. API / IPC surface + frontend integration

React → IPC (`window.electron.*` via `preload.ts`) → main process → FastAPI → `ModelRegistry`. **IPC channel names mirrored between `preload.ts` and handlers** (repo convention).

### 7.1 REST (FastAPI)

```
GET    /models                       list (filter: capability|type|tier|status)   ← replaces get_model_list
GET    /models/{id}                  record + model card
GET    /models/search                source=hf|civitai & q/task/sort/page
POST   /models/{id}/download         enqueue
POST   /models/{id}/download/pause | resume | cancel
GET    /models/downloads             queue + progress stream (push, like job-poll)
DELETE /models/{id}                  remove app copy/link  (guarded: never a linked source)
POST   /models/import                add library root (path + layout hint)
POST   /models/scan                  reindex
GET    /models/libraries             list roots
DELETE /models/libraries/{id}        remove root (referenced-only records dropped; bytes untouched)
POST   /models/{id}/convert-safetensors
GET    /hardware                     HardwareProfile
POST   /models/{id}/resolve-runtime  → { pipeline_class, components, precision, offload_flags, vram_plan }
```

Tokens are set/held in the Electron main process (`safeStorage`) and injected per backend request; there is **no** token-persistence endpoint in Python.

### 7.2 IPC channels (mirrored)

`models:list` · `models:get` · `models:search` · `models:download` · `models:download:pause|resume|cancel` · `models:downloads:subscribe` · `models:status` (push) · `models:delete` · `models:import` · `models:scan` · `models:libraries:list|remove` · `models:convert` · `hardware:get` · `models:resolveRuntime` · `auth:setHfToken` · `auth:setCivitaiToken`.

### 7.3 Frontend

- New `modelsSlice` (records, download queue, hardware profile, library roots; `useShallow` selectors).
- `ModelSelector` reads from the slice; hardcoded lists deleted.
- The Foundry **browse/library/downloads surface** is a *new* content panel in the dockview workspace. We define states + data; **the design agent styles it in Carbon Pro.**
- `GeneratePanel` preflight footer consumes run-readiness.

> **Coordination flag (active):** a parallel agent is refreshing the design and will likely touch `ModelSelector` and the panels. **Land M1 first** (data contract + slice), hand the design agent the new states, and ensure a single owner for the selector rewrite to avoid collision.

---

## 8. Quality & de-risking strategy (D9)

### 8.1 Dev spikes — learn before we commit

Each spike is **time-boxed, exploratory, throwaway** (the one explicit exception to TDD). Each ends in a written finding, a **go / no-go / adjust** decision, and a **seeded test list** (and where noted, fixtures the milestone reuses). If a spike shows the planned approach won't hold, we revise the milestone design before any production code.

| Spike | Gate (before) | Question it answers | Output | Timebox |
|-------|---------------|---------------------|--------|---------|
| **A — Download telemetry** | M2 | Can we get granular progress/speed/ETA from `huggingface_hub`, and how does `hf_transfer` trade off against it? Compare: custom tqdm-subclass injection vs per-file accounting (HfApi sizes + manual loop) vs self-driven download (`hf_hub_url` + streamed `requests`/`hf_transfer`). | Chosen progress mechanism; precise-vs-fast tradeoff confirmed. | ~0.5–1 d |
| **B — Windows linking** | M3 | Do junction/hardlink + copy-fallback + `scan_cache_dir` + real ComfyUI/A1111 indexing work on real Windows (cross-volume, long-path, OneDrive)? | Linking strategy validated (or copy-only decision); long-path handling confirmed. | ~1 d |
| **C — Classifier confidence** | M4 | Does header + HF-metadata classification reliably assign Verified/Compatible/Experimental across a real ~30–50 repo corpus, with an acceptable false-"Compatible" rate? | Signal set + thresholds; **labeled fixture corpus → becomes M4 test data.** | ~1 d |
| **D — Fit & auto-wire truth** | M5 | Do VRAM estimates track measured reality on real silicon, and does architecture→pipeline auto-wiring + dependency resolution load each family end-to-end? | Calibrated overhead bands; verified pipeline/dependency map; **measured numbers → Verified catalog.** | ~1–1.5 d |

### 8.2 TDD

Every milestone is built **red-green-refactor**. The design names the exact targets; those are the failing tests written first:

- Registry assembly / merge-by-identity / legacy-id migration
- Classifier tier logic (table-driven over the Spike-C corpus)
- safetensors-header architecture detection (tiny fixtures)
- VRAM-fit estimator math
- `DownloadManager` lifecycle (mocked HF): queue, pause/resume/cancel, disk preflight, atomic verify
- Path-safety across separators + Windows drive letters + long paths
- **Single-source-of-truth drift regression** (fails if any hardcoded model array returns)
- API contracts for `/models/*` + `/hardware`

Spikes are exploratory and **not** held to TDD; their findings feed these test lists.

### 8.3 Test execution constraints (from project history)

- Pre-commit (husky) runs the **full vitest suite + typecheck** on any staged `.ts/.tsx` — keep diffs focused; avoid CPU-contending parallel shell runs.
- Backend tests must stay **fast on CI** (stub / no-torch, no network) — mock `huggingface_hub`, `HfApi`, fs. Real-model integration is **opt-in locally behind an env flag** (mirrors existing real-vs-stub pattern). `test_model_manager.py` is the beachhead.
- CI runs **Linux and Windows** — all path logic via `pathlib`; tested on both.
- Green bar required before ship: `npm run typecheck`, `npm test`, `npm run build`, backend `pytest`.

### 8.4 Codex independent-review gates

Standard green gate + built-in code-review on **every** PR. Independent Codex (second-model) review at the four highest-leverage gates:

- **After M1** — foundation/contract review (most expensive to get wrong once embedded).
- **After M2** — security review (token handling, gated auth, download integrity, secret discipline on a public repo).
- **After M4** — supply-chain/security review (pickle consent, `trust_remote_code`, NSFW defaults, classifier safety).
- **Final after M5** — full-surface sweep before declaring Foundry v1 done.

---

## 9. Build sequence — five shippable slices

Each milestone: spike (where assigned) → TDD build → green gate → review gate → its own PR(s); the design agent styles each surface as it lands.

- **M1 · Registry unification** *(no spike — low uncertainty; carries the legacy-id migration test).*
  `ModelRecord` + `ModelRegistry`; `PREDEFINED_MODELS` → `verified-catalog.json`; delete frontend lists; `ModelSelector` reads `/models`; `modelsSlice`; drift regression test; legacy-id mapping. **→ Codex review (foundation).** *Banks value + kills the latent drift bug immediately.*
- **Spike A → M2 · Acquisition.** `hf_transfer`, true progress, `DownloadManager` (configurable concurrency, pause/resume/cancel), disk preflight, atomic verified completion, secure tokens + gated-license flow. **→ Codex review (security).**
- **Spike B → M3 · Indexer + import/link.** `scan_cache_dir`, external roots, junction/hardlink + copy-fallback, safetensors-header detection, incremental scan, first-run auto-detect-and-offer.
- **Spike C → M4 · Search + classifier + security.** HF/CivitAI search, tri-tier classifier with reasons, pickle-consent + convert, `trust_remote_code` deny-default, NSFW-safe default. **→ Codex review (supply-chain).**
- **Spike D → M5 · Hardware-fit + auto-wiring.** `HardwareProfile`, VRAM-fit, architecture→pipeline resolution, dependency auto-fetch, `resolve_model_runtime` into the generator, preflight readiness, fallback ladder. **→ Codex review (final sweep).**

---

## 10. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Legacy model-id references in saved projects/jobs break | Stable slugs + legacy-id map + migration test (M1) |
| Concurrent design refresh collides on `ModelSelector`/panels | Land M1 contract first; single owner for selector rewrite; hand design agent the new states |
| Windows linking (cross-volume, long path, OneDrive, permissions) | Copy-fallback, `\\?\` long-path prefixes, no elevation; **proven in Spike B** |
| Huge libraries (10k+ files) slow scans | Incremental `(mtime,size)` signatures, background worker, bounded hashing |
| HF/CivitAI API drift, rate limits, outages | Cache + backoff + offline-degrade (local library always works) |
| Fast-vs-precise progress tension | **Dissolved in `huggingface_hub` 1.x** — `hf_xet` is byte-granular through the same hook as HTTP; a `HF_HUB_DISABLE_XET` precise toggle is retained as a hedge (**Spike A**) |
| fp8 on unsupported silicon | Capability-gated; never offer what the card can't do |
| Supply chain (`trust_remote_code`, pickle) | Deny-by-default, explicit per-repo consent, pinned revisions, prefer safetensors |
| Disk full mid-download despite preflight | Atomic `.incomplete` temp + recovery; never present partial as ready |
| Token leakage | Tokens in main-process `safeStorage`, injected per-request, never logged, never persisted in Python |
| False-"Compatible" classification erodes trust | **Spike C** measures the rate + sets thresholds before M4 ships |

---

## 11. Out of scope (this pillar)

- The performance *execution* layer (torch.compile, fused attention, TensorRT, quant kernels) — **Pillar 2 (Accelerator)**; the Foundry only emits the runtime *plan*.
- Provider routing across Local / OpenRouter / HF Inference — **Pillar 3 (Routing Fabric)**.
- The agentic orchestration layer — **Pillar 4 (Director)**.
- Full artifact provenance/recipe export beyond pinned `repo_id+revision` capture — **Pillar 5 (Provenance)**.
- Plugin/custom-pipeline system & public model/recipe sharing — **Pillar 6 (Platform)**.

---

*This spec is the approved design of record for the Model Foundry. Implementation proceeds via the writing-plans skill into a milestone plan (M1→M5) honoring the spikes, TDD discipline, and Codex gates above.*
