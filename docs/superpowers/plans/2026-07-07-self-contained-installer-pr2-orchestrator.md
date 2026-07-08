# Self-Contained Installer — PR2: Backend Provisioning Orchestrator + API

> Executes spec `docs/superpowers/specs/2026-07-06-self-contained-installer-design.md` §6, §8·PR2, §9. Backend orchestrator over the existing `DownloadManager` + FastAPI endpoints + IPC bridge. Stub-CI-safe (no torch), CI-green, no heavy build. TDD, commit per task. Branch: `feat/installer-provisioning-orchestrator` (from `main` @ `ae2d74f7`, PR1 #53 + catalog fix #54 merged).

**Goal:** a first-run auto-provisioning engine. The renderer asks the backend which comprehensive auto-set models are present; a one-call `start` drives every missing model through the **existing** consent-gated `DownloadManager` (which already owns filename resolution, resumable fetch, and integrity), streams aggregate + per-model progress, and is idempotent + resumable across restarts. The React first-run screen + Licenses UI (PR3) and delivery/hosting (PR4) build on this.

## Locked decision — pickle-format models in the auto-set (2026-07-07)

7 of the 33 auto-set members are `format: "pickle"` (the 5 direct-URL edit-tool weights — RetinaFace, ParseNet, GFPGAN, Real-ESRGAN ×2 — plus the `annotator-midas` and `annotator-normalbae` HF annotators). The manual Foundry flow gates pickle records behind explicit per-model consent (spec 5.3, deny-by-default); `_resolve_files` also strips pickle files from HF repos without consent. There is no consent-free acquisition path today (`edit_tools/weights.py`).

**Rocky's call: informed auto-consent.** `provision/start` grants pickle consent for **exactly** these curated, SHA-256/LFS-pinned, first-party, redistribution-audited records — recorded in the `ConsentStore` audit trail with `action="auto-provision"` (durable provenance, not a silent bypass). One click fetches all 33. The deny-by-default gate stays fully intact for any model the user adds themselves. No auto-set member is `trust_remote_code` (catalog-verified), so pickle is the only gate this path touches. PR3 surfaces the disclosure in the first-run screen.

## Global constraints

- **No re-derivation of sources.** The orchestrator drives the auto-set **by id** through `download_manager.enqueue/resume/pause/cancel/list_jobs` — the same path the manual "Download" button uses. The manifest is the *policy* (which ids, byte budget, license/attribution); the manager+registry own *how* to fetch and verify each id (per `provisioning.py`'s own contract). The manifest `source` block is used only for the byte budget and the direct-URL literal-`sha256` corrupt-refetch check.
- **Stub-CI-safe.** New backend modules/tests import no torch and hit no network. Orchestrator unit tests use small fakes; API tests use `TestClient(main.app)` + `mock.patch.object`, mirroring `test_foundry_download_api.py`.
- **Cheap polling.** `status()` (renderer-polled) uses registry-`ready` presence only — never hashes files. On-disk integrity re-verification runs only inside `start()` (on-demand), and only for direct-URL entries carrying a literal `sha256`.
- **Security posture preserved.** Provisioning never bypasses a gate silently: pickle grants are explicit, audited, and scoped to the curated set. Everything user-added stays deny-by-default.
- No emoji/decorative glyphs; backend pytest via `backend/venv/Scripts/python.exe`; commit via the Bash tool with `export PATH="/c/Program Files/nodejs:$PATH"` and `git branch --show-current` in the same call; never `git add -A`; never stage the untracked `LICENSE.txt`.

---

### Task 1: PR2 plan doc

This document. **Commit:** `docs(installer): PR2 provisioning-orchestrator plan (#NN)`

---

### Task 2: `ConsentStore` — auditable consent action

**Files:** `backend/foundry/security_policy.py`; test `backend/tests/test_foundry_security_policy.py`.

Add an optional `action: str = "grant"` param to `ConsentStore.grant`, threaded into `_set`, so an auto-provision grant is recorded in the audit trail as `action="auto-provision"` while a manual grant stays `"grant"`. Fully backward-compatible (default preserves current behavior + existing tests).

**Tests (write first, expect fail):** a `grant(id, "pickle", action="auto-provision")` records an audit entry with `action == "auto-provision"` and `get(id)["pickle"] is True`; a default `grant(id, "pickle")` still records `action == "grant"`.

**Commit:** `feat(installer): auditable consent action for auto-provision grants (#NN)`

---

### Task 3: `provision_orchestrator.py` — the engine

**Files:** create `backend/foundry/provision_orchestrator.py`; test `backend/tests/test_provision_orchestrator.py`.

**Pure functions (module level, no collaborators):**
- `auto_set(manifest) -> list[dict]` — the `auto_set` entries.
- `aggregate(entries, jobs_by_id, present_ids) -> dict` — byte-weighted (`approx_bytes`) overall progress; an entry is "done" (fraction 1.0) when present OR its job is `ready`, else `job.progress` (0.0 if no job). Returns `overall_progress`, `total_bytes`, `present_bytes`, `remaining_bytes`, `speed` (Σ downloading-job speeds), `eta` (`remaining/speed` or None), counts (`total/present/active/ready/error`), `complete` (all done).
- `model_rows(entries, jobs_by_id, present_ids) -> list[dict]` — per-model `{id, name, license, attribution, approx_bytes, status, progress, error, gate_url}`; status = `ready` if present, else job status, else `missing`.
- `set_attribution(entries) -> Optional[str]` — `"Powered by Stability AI"` when any SAI-Community model is in the set (for the PR3 Licenses screen).

**`ProvisionOrchestrator` class** (injected `registry`, `download_manager`, `consent_store`, `models_dir`):
- `present_ids()` — `{id for id in auto-set if registry.get_record(id)["status"] == "ready"}`.
- `status()` — compose the pure functions from live `list_jobs()` (filtered to auto-set ids) + `present_ids()`.
- `start(hf_token=None, reverify=False)` — for each auto-set entry: skip if present-and-valid; if `reverify` and a present direct-URL entry's on-disk `sha256` mismatches its manifest hash, treat as missing (re-enqueue overwrites via the manager's atomic replace); grant pickle consent (`action="auto-provision"`, logged with provenance) for pickle records before enqueueing; `resume` an existing `paused|error|cancelled` job else `enqueue`. HF token threaded to every enqueue (harmless to non-HF sources). Returns `status()`.
- `pause()` / `cancel()` — fan out `download_manager.pause/cancel` over auto-set ids with an active job. Returns `status()`. (`resume`-all == `start`.)

**Tests (write first, expect fail) — pure + orchestration, all stub-safe:**
- aggregate math: byte-weighted overall; present = full contribution; half-done job proportional; empty set; all-present → `complete`, progress 1.0; speed/eta from downloading jobs.
- model_rows status mapping (ready / missing / downloading / error + gate_url passthrough).
- detection: registry-`ready` ids are present/skipped.
- start: missing non-pickle → `enqueue`; missing pickle → consent granted (audited `auto-provision`) **then** enqueue (assert order); present → not enqueued; `paused`/`error` job → `resume` not `enqueue`; hf_token forwarded.
- corrupt-refetch: a present direct-URL model seeded with wrong bytes → `start(reverify=True)` re-enqueues it; correct bytes → not enqueued.

**Commit:** `feat(installer): first-run provisioning orchestrator over DownloadManager (#NN)`

---

### Task 4: FastAPI endpoints + schemas + wiring

**Files:** `backend/foundry/schemas.py`; `backend/main.py`; test `backend/tests/test_provision_api.py`.

- Schemas: `ProvisionModelSchema` and `ProvisionStatusSchema` (avoid a field literally named `schema`; use `schema_version`).
- `main.py`: `provision_orchestrator = ProvisionOrchestrator(load_provision_manifest(), model_registry, download_manager, consent_store, MODELS_DIR)`.
- Routes (declared **before** the dynamic `/api/models/{model_id}` block — `provision/status` would otherwise be captured by `/{model_id}/status`):
  - `GET /api/models/provision/status` → `ProvisionStatusSchema`.
  - `POST /api/models/provision/start` (202) → forwards `X-HF-Token` → `ProvisionStatusSchema`.
  - `POST /api/models/provision/{action}` for `pause|resume|cancel` (`resume` forwards `X-HF-Token`, calls `start`) → `ProvisionStatusSchema`; unknown action → 404.

**Tests (write first, expect fail):** status returns the schema; start returns 202 and forwards the HF token to `orchestrator.start`; pause/resume/cancel dispatch to the right method; unknown action → 404. Patch `main.provision_orchestrator` methods.

**Commit:** `feat(installer): provisioning API endpoints (#NN)`

---

### Task 5: IPC bridge

**Files:** `electron/preload.ts` (type + impl); `src/types/electron.d.ts` (if it mirrors the surface); `electron/ipc-handlers/generation.ts`.

- preload: `provisioning: { status, start, pause, resume, cancel }` → `ipcRenderer.invoke('provision:status'|'provision:start'|'provision:pause'|'provision:resume'|'provision:cancel')`.
- generation.ts: `provision:*` handlers forwarding to the endpoints via `requestBackend` + `backendAuthHeaders()`; `start`/`resume` also send `hfTokenHeaders()`. `{success:false,error}` envelope on failure (mirrors `models:download*`).
- Keep channel names in sync (preload ↔ handlers); update any IPC contract/type mirror.

**Commit:** `feat(installer): provisioning IPC bridge (#NN)`

---

### Task 6: gates

- Backend: `backend/venv/Scripts/python.exe -m pytest backend/tests -q` — all pass (+ skips); confirm new modules/tests are torch-free.
- Frontend: `npm run typecheck` and `npm test` green (covers preload/generation TS + any IPC contract tests).
- Commit any fixes individually.

## Deferred to later PRs (per spec §8)

- **PR3:** React first-run provisioning screen (aggregate + per-model progress, pause/resume/retry, Continue-in-background), first-run detection, pre-flight disk check (uses PR2 `total/remaining_bytes`), the informed-auto-consent disclosure, About → Licenses screen + Stability attribution, `provisioningSlice`. No progress theater.
- **PR4:** heavy electron-builder installer, R2 hosting + `electron-updater` feed, optional web-installer stub, mirror-fallback wiring, packaging CI. `VS_REAL_SMOKE` real end-to-end small-model provision.
