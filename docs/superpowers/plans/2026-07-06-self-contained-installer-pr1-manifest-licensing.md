# Self-Contained Installer — PR1: Provisioning Manifest + Licensing Foundation

> Executes the foundation slice of `docs/superpowers/specs/2026-07-06-self-contained-installer-design.md` (§5, §4, §8·PR1). Pure Python + data + tests. Stub-CI-safe (no torch), CI-green, no heavy build. TDD, commit per task. Branch: `feat/installer-provisioning-manifest`.

**Goal:** a validated, license-clean provisioning manifest for the comprehensive auto-set (entire `verified-catalog.json` minus the FLUX-dev non-commercial family), plus a license-classification module and a generated `THIRD-PARTY-LICENSES.md` — all guarded by honesty-rail tests. This is the source of truth every later PR (backend orchestrator, first-run UX, delivery) builds on.

## Global constraints

- No network in tests/CI. `sha256` is literal where the catalog already provides it (the `github` `download_url` edit-models); for HuggingFace single-file/repo records it is `null` **with** a declared `sha256_source` (`"hf-lfs@<repo>@<rev>/<file>"`) that PR2 resolves against HF LFS metadata and verifies at fetch time. The test asserts the literal-or-source invariant — never a silent "trust me".
- The FLUX-nc family (`flux-dev`, `flux-fill`, `controlnet-union-flux`, `ip-adapter-flux`) is provably absent from the auto-set and present in `excluded_non_commercial`.
- Every auto-set entry maps to a **redistribution-compatible** license (permissive / OpenRAIL / Stability-Community). A model whose license is unknown or non-redistributable cannot enter the auto-set (test-enforced) — it stays Foundry-manual.
- No emoji/decorative glyphs; backend pytest via `backend/venv/Scripts/python.exe`; commit via the Bash tool with `export PATH="/c/Program Files/nodejs:$PATH"` and `git branch --show-current` in the same call; never `git add -A`.

---

### Task 1: `backend/foundry/licenses.py` — license classification

**Files:** create `backend/foundry/licenses.py`; test `backend/tests/test_foundry_licenses.py`.

**Interfaces:** `classify_license(license_id: Optional[str]) -> LicenseInfo` where `LicenseInfo = {category, redistributable: bool, requires_attribution: bool, attribution: Optional[str], url}`. Categories: `permissive | openrail | stability-community | non-commercial | unknown`. `flux-1-dev-non-commercial → redistributable=False`. `stabilityai-community → redistributable=True, requires_attribution=True, attribution="Powered by Stability AI"`. `None/unknown → redistributable=False` (fail-closed).

**Tests (write first, expect fail):** apache/mit/bsd → permissive+redistributable; creativeml-openrail-m/openrail/openrail++ → openrail+redistributable; stabilityai-community → attribution "Powered by Stability AI"; flux-1-dev-non-commercial → not redistributable; `None` and an invented id → unknown + not redistributable (fail-closed).

**Commit:** `feat(installer): license classification for bundle redistribution (#NN)`

---

### Task 2: `backend/foundry/provisioning.py` — build + validate the auto-set

**Files:** create `backend/foundry/provisioning.py`; create data `backend/foundry/provision-overrides.json`; test `backend/tests/test_provisioning.py`.

`provision-overrides.json` carries only what the catalog can't: fragile-upstream repins (e.g. `sd-1-5.primary.repo_id = "stable-diffusion-v1-5/stable-diffusion-v1-5"` at a pinned revision — the catalog's `runwayml/stable-diffusion-v1-5` is deleted from HF), optional VS mirror URLs, literal `sha256`/`sha256_source` per file, and per-model `attribution`.

**Interfaces:**
- `EXCLUDED_NON_COMMERCIAL = ("flux-dev", "flux-fill", "controlnet-union-flux", "ip-adapter-flux")`.
- `build_provision_manifest(catalog: dict, overrides: dict) -> dict` → the §5 shape (`schema`, `auto_set[]`, `excluded_non_commercial[]`). Each auto-set entry: `id`, `files[] ({name, sha256|null, sha256_source?, bytes})`, `primary`, `mirror?`, `license`, `attribution`. Skips FLUX-nc; skips records `classify_license(...).redistributable is False` (and records the skip reason); requires every included record resolve to a source + at least one file with `sha256` or `sha256_source`.
- `load_provision_manifest() -> dict` reads the catalog + overrides from disk and builds it.

**Tests (write first, expect fail):**
- FLUX-nc family excluded from `auto_set`, present in `excluded_non_commercial`.
- Every `auto_set` entry: `classify_license(license).redistributable is True`; each file has literal `sha256` **or** a `sha256_source`; `primary` present.
- `sd-1-5.primary.repo_id == "stable-diffusion-v1-5/stable-diffusion-v1-5"` (dead-upstream repin), not `runwayml/...`.
- Stability-Community members (e.g. `sd3.5-large`, `svd`) carry `attribution == "Powered by Stability AI"`.
- The github edit-models (`edit-u2net`, `edit-realesrgan-x4plus`, …) carry the literal `sha256` from the catalog.
- Non-redistributable / unknown-license records never appear in `auto_set`.

**Commit:** `feat(installer): comprehensive provisioning manifest (auto-set minus flux-nc) (#NN)`

---

### Task 3: `THIRD-PARTY-LICENSES.md` generation

**Files:** create `backend/foundry/notices.py`; create `backend/foundry/license-texts.json` (license id → {name, url, spdx?}); create the generator entry `scripts/generate-third-party-licenses.cjs` (or a `python -m foundry.notices` CLI); commit the generated `THIRD-PARTY-LICENSES.md` at repo root; test `backend/tests/test_notices.py`.

**Interfaces:** `render_notices(manifest, license_texts, py_deps, js_deps) -> str`. Sections: **Models** (every `auto_set` entry: name, license, url, attribution) and **Runtime dependencies** (Python from `requirements.txt` + the bundled AI/ML set; JS from `package.json`). Emits the "Powered by Stability AI" block when any SAI-Community model is present.

**Tests (write first, expect fail):** every `auto_set` model id appears in the rendered output; the Stability attribution block is present (SD3.5/SVD in the set); a permissive-only manifest omits the Stability block; the committed `THIRD-PARTY-LICENSES.md` is byte-identical to a fresh render (drift guard — like the repo's asserted-token tests).

**Commit:** `feat(installer): generate THIRD-PARTY-LICENSES from the provision manifest (#NN)`

---

### Task 4: committed manifest artifact + cross-check gate

**Files:** commit generated `backend/foundry/provision-manifest.json`; test `backend/tests/test_provision_manifest_artifact.py`.

**Tests (write first, expect fail):** the committed `provision-manifest.json` equals `build_provision_manifest(catalog, overrides)` (drift guard); its schema validates; total `bytes` sums to a sane range (> 30 GB, < 120 GB) and is logged; every catalog record is either in `auto_set`, in `excluded_non_commercial`, or has a recorded skip reason (no silent drops — completeness rail).

**Commit:** `feat(installer): commit validated provision-manifest artifact + drift guard (#NN)`

---

### Task 5: gates

- Backend: from `backend/`, `venv/Scripts/python.exe -m pytest -q` — all pass (+ skips).
- Frontend unaffected, but run `npm run typecheck` + `npm test` if any `scripts/*.cjs` or root files changed that the suite covers.
- Resolve the four **unknown-license** records (3 annotators, `ip-adapter-encoder-clip-vit-l`): confirm exact upstream licenses; include in the auto-set only if redistribution-compatible, else leave Foundry-manual and document in the overrides `skip_reason`.
- Commit fixes individually.

## Deferred to later PRs (per spec §8)

- PR2: `provision_all()` orchestrator over `DownloadManager`, resumable + `sha256` verify against this manifest, endpoints + IPC.
- PR3: first-run provisioning screen + pre-flight disk check + About→Licenses screen.
- PR4: heavy installer build, R2 hosting + `electron-updater` feed, mirror fallback, packaging CI.
