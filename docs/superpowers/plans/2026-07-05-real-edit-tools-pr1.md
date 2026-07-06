# Real Edit Tools PR1 Implementation Plan (#34 second half)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the three model-backed Edit tools real — Background Removal (U²-Net), AI Upscale (Real-ESRGAN), Face Enhancement (GFPGAN) — end-to-end: six Foundry weight records, job-based backend execution, honest panel wiring, and retirement of every fake surface they replace.

**Architecture:** New `backend/edit_tools/` package (import-guarded like `backend/guided/`) resolves weights from consent-gated Foundry records and runs under the existing `job_manager`; `/api/v1/edit/*` becomes 202 job submitters (the `api/comfy_graph.py` configure() pattern); the renderer gets a `runEditTool` feature function + `useEditTool` hook mirroring `runStudioGeneration`, wired into `AIToolsPanel` and `ImagePreviewModal`.

**Tech Stack:** Python (FastAPI, PIL, numpy, onnxruntime, spandrel, facexlib, torch), Electron IPC, React 19 + Zustand, Vitest, pytest.

**Spec:** `docs/superpowers/specs/2026-07-05-real-edit-tools-design.md`

## Global Constraints

- Branch: `feat/real-edit-tools`. Commit via the Bash tool with `export PATH="/c/Program Files/nodejs:$PATH"` first and `git branch --show-current` in the same call. Never `git add -A` (LICENSE.txt stays untracked). Never `--no-verify`.
- Backend tests run with `backend/venv/Scripts/python.exe -m pytest` (bare `python` is a dep-less system 3.14). Frontend: `npx vitest run <file>`, full gates `npm run typecheck && npm test && npm run build`.
- Stub-CI-safe: every new backend module must import cleanly with NO torch/onnxruntime/spandrel/facexlib installed. Heavy imports are module-level `try/except ImportError` (PyInstaller must see them statically).
- User-facing error messages NEVER contain filesystem paths.
- No emoji in app source; lucide-react icons only; `.test.tsx` for anything needing jsdom.
- Foundry copy convention: missing weights → `install '<record-id>' from the Foundry first.`; incomplete on disk → `reinstall '<record-id>' from the Foundry.`
- New records: `capability: "edit"`, `artifact_type: "edit-model"`, `source: "github"`; every `.pth` is `format: "pickle"` (consent-gated at download), `u2net.onnx` is `format: "onnx"` (no consent).
- On-disk layout: `<models>/edit-model/<record-id>/<record-id>.<ext>` where ext is `.onnx` for onnx format, `.ckpt` for pickle.

## File Structure

| Path | Role |
| --- | --- |
| `backend/foundry/verified-catalog.json` | +6 edit-model records; duplicate-key fix |
| `backend/foundry/download_manager.py` | direct-URL branch generalized (github), format-aware filenames, edit-model target dir |
| `backend/foundry/registry.py` | `_ARTIFACT_SUBDIR` gains edit-model |
| `backend/utils/model_manager.py` | edit-model legacy type + per-id dir + self-healing `get_record_status` |
| `backend/edit_tools/{__init__,weights,background,upscale,faces,service}.py` | NEW package — the real implementations |
| `backend/api/edit.py`, `backend/schemas/edit.py` | rewritten as job submitters |
| `backend/services/edit_service.py` | DELETED (stub) |
| `backend/main.py` | edit router configure(); `/api/images/upscale` retired; `process` unchanged |
| `backend/utils/image_ops.py` | `upscale_image_file` retired |
| `backend/main.spec`, `build-backend.cjs`, `backend/requirements.txt` | packaging: hiddenimports + import preflight + commented dep declarations |
| `electron/ipc-handlers/generation.ts`, `electron/preload.ts`, `src/types/electron.d.ts` | `generation:edit-image` added; `generation:upscale-image` retired |
| `src/features/edit/runEditTool.ts` (+`useEditTool.ts`) | NEW — submit/poll/handoff lifecycle |
| `src/components/edit/AIToolsPanel.tsx` | 3 real tools; fake knobs removed; guided tools honestly gated |
| `src/components/shared/ImagePreviewModal.tsx` | upscale rerouted to the real job |
| `src/store/slices/modelsSlice.ts`, `src/types/model.ts`, `src/types/assets.ts`, `src/store/appStore.types.ts` | picker allowlist; 'github' source; 'edit' job type |
| `backend/tests/test_foundry_edit_records.py`, `test_foundry_direct_download.py`, `test_edit_tools_*.py`, `test_edit_api.py` (rewrite), `test_edit_tools_smoke_local.py` | tests |

---

### Task 1: Catalog — six edit-model records + duplicate-key hygiene

**Files:**
- Modify: `backend/foundry/verified-catalog.json`
- Modify: `backend/foundry/model_record.py` (comment enums only)
- Create: `backend/tests/test_foundry_edit_records.py`

**Interfaces:**
- Produces: record ids `edit-u2net`, `edit-realesrgan-x4plus`, `edit-realesrgan-x4plus-anime`, `edit-gfpgan-v14`, `edit-face-detection`, `edit-face-parsing` — consumed by Tasks 2-16.

- [ ] **Step 1: Pin the sha256 hashes** — download each asset once to the scratchpad and hash it:

```bash
cd "$SCRATCHPAD" # the session scratchpad dir
for u in \
  "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx" \
  "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth" \
  "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/RealESRGAN_x4plus_anime_6B.pth" \
  "https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.4.pth" \
  "https://github.com/xinntao/facexlib/releases/download/v0.1.0/detection_Resnet50_Final.pth" \
  "https://github.com/xinntao/facexlib/releases/download/v0.2.2/parsing_parsenet.pth" ; do
  curl -sSLo "$(basename "$u")" "$u" && sha256sum "$(basename "$u")"; done
```

Record each 64-hex digest. Also note exact byte sizes (`ls -l`) to fill the `size` fields (use `~NNN MB` rounded). If any URL 404s, find the corrected release tag on the SAME official repo (do not switch to mirrors) and update both this plan's URL and the record.

- [ ] **Step 2: Write the failing catalog test** — `backend/tests/test_foundry_edit_records.py`:

```python
"""#34 second half: the six edit-model records (u2net / Real-ESRGAN / GFPGAN stack)."""
import json
import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

CATALOG_PATH = BACKEND_ROOT / "foundry" / "verified-catalog.json"

EDIT_RECORD_IDS = [
    "edit-u2net",
    "edit-realesrgan-x4plus",
    "edit-realesrgan-x4plus-anime",
    "edit-gfpgan-v14",
    "edit-face-detection",
    "edit-face-parsing",
]


def _reject_duplicates(pairs):
    seen = {}
    for key, value in pairs:
        if key in seen:
            raise ValueError(f"duplicate key: {key}")
        seen[key] = value
    return seen


class EditRecordTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(CATALOG_PATH, "r", encoding="utf-8") as handle:
            cls.raw = handle.read()
        cls.catalog = json.loads(cls.raw)

    def test_no_duplicate_keys_anywhere_in_the_catalog(self):
        # Regression: controlnet-depth-sdxl / controlnet-openpose-sdxl carried
        # a duplicate "companions" key (leftover from the files addition).
        json.loads(self.raw, object_pairs_hook=_reject_duplicates)

    def test_all_six_records_exist_with_edit_shape(self):
        for record_id in EDIT_RECORD_IDS:
            record = self.catalog.get(record_id)
            self.assertIsNotNone(record, record_id)
            self.assertEqual(record["artifact_type"], "edit-model", record_id)
            self.assertEqual(record["capability"], "edit", record_id)
            self.assertEqual(record["source"], "github", record_id)
            self.assertEqual(record["tier"], "verified", record_id)
            self.assertFalse(record["gated"], record_id)
            self.assertFalse(record.get("trust_remote_code", False), record_id)

    def test_direct_urls_are_pinned_official_https_github_releases(self):
        for record_id in EDIT_RECORD_IDS:
            record = self.catalog[record_id]
            url = record.get("download_url") or ""
            self.assertTrue(url.startswith("https://github.com/"), record_id)
            self.assertIn("/releases/download/", url, record_id)
            sha = (record.get("sha256") or "").strip().lower()
            self.assertRegex(sha, r"^[0-9a-f]{64}$", record_id)

    def test_formats_route_the_consent_gate_correctly(self):
        self.assertEqual(self.catalog["edit-u2net"]["format"], "onnx")
        for record_id in EDIT_RECORD_IDS:
            if record_id == "edit-u2net":
                continue
            self.assertEqual(self.catalog[record_id]["format"], "pickle", record_id)

    def test_gfpgan_companions_close_over_the_facexlib_weights(self):
        record = self.catalog["edit-gfpgan-v14"]
        self.assertEqual(
            sorted(record["companions"]),
            ["edit-face-detection", "edit-face-parsing"],
        )
        for companion_id in record["companions"]:
            self.assertIn(companion_id, self.catalog)

    def test_licenses_are_declared(self):
        self.assertEqual(self.catalog["edit-u2net"]["license"], "apache-2.0")
        self.assertEqual(self.catalog["edit-realesrgan-x4plus"]["license"], "bsd-3-clause")
        self.assertEqual(self.catalog["edit-realesrgan-x4plus-anime"]["license"], "bsd-3-clause")
        self.assertEqual(self.catalog["edit-gfpgan-v14"]["license"], "apache-2.0")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Run it to verify it fails**

Run: `backend/venv/Scripts/python.exe -m pytest backend/tests/test_foundry_edit_records.py -v` (from repo root; if pytest rootdir issues arise, run from `backend/` with `venv/Scripts/python.exe -m pytest tests/test_foundry_edit_records.py -v`)
Expected: FAIL — duplicate-key ValueError AND missing records.

- [ ] **Step 4: Fix the duplicate keys.** In `verified-catalog.json`, records `controlnet-depth-sdxl` (~line 207-208) and `controlnet-openpose-sdxl` (~line 218-219) each contain `"companions": [...]` twice. Keep ONE occurrence (the values are identical), merging onto the line that carries `files`:

```json
    "companions": ["annotator-midas"], "measured_vram_bytes": null,
    "files": ["config.json", "diffusion_pytorch_model.safetensors"]
```

(and the `annotator-openpose` equivalent for the openpose record).

- [ ] **Step 5: Add the six records** at the end of the catalog (before the closing brace), with the Step 1 hashes/sizes substituted for the `<sha256-*>` / `<~size>` markers:

```json
  "edit-u2net": {
    "id": "edit-u2net", "name": "U2-Net Background Removal", "artifact_type": "edit-model",
    "capability": "edit", "base_architecture": "unknown", "source": "github",
    "repo_id": null, "revision": null, "aux_repo_id": null,
    "size": "<~176 MB>", "status": "not_found", "tier": "verified", "quality": "balanced",
    "runtime": "local", "hardware_class": "laptop", "vram": "Unknown",
    "description": "Salient-object segmentation for the Edit page's Background Removal tool (ONNX, CPU-friendly).",
    "license": "apache-2.0", "gated": false, "format": "onnx",
    "download_url": "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx",
    "sha256": "<sha256-u2net>",
    "companions": [], "measured_vram_bytes": null
  },
  "edit-realesrgan-x4plus": {
    "id": "edit-realesrgan-x4plus", "name": "Real-ESRGAN x4plus", "artifact_type": "edit-model",
    "capability": "edit", "base_architecture": "unknown", "source": "github",
    "repo_id": null, "revision": null, "aux_repo_id": null,
    "size": "<~64 MB>", "status": "not_found", "tier": "verified", "quality": "balanced",
    "runtime": "local", "hardware_class": "laptop", "vram": "Unknown",
    "description": "General-purpose 4x super-resolution for the Edit page's AI Upscale tool (2x runs the 4x model and downsamples).",
    "license": "bsd-3-clause", "gated": false, "format": "pickle",
    "download_url": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth",
    "sha256": "<sha256-x4plus>",
    "companions": [], "measured_vram_bytes": null
  },
  "edit-realesrgan-x4plus-anime": {
    "id": "edit-realesrgan-x4plus-anime", "name": "Real-ESRGAN x4plus Anime", "artifact_type": "edit-model",
    "capability": "edit", "base_architecture": "unknown", "source": "github",
    "repo_id": null, "revision": null, "aux_repo_id": null,
    "size": "<~18 MB>", "status": "not_found", "tier": "verified", "quality": "balanced",
    "runtime": "local", "hardware_class": "laptop", "vram": "Unknown",
    "description": "Anime-optimized 4x super-resolution variant for the Edit page's AI Upscale tool.",
    "license": "bsd-3-clause", "gated": false, "format": "pickle",
    "download_url": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/RealESRGAN_x4plus_anime_6B.pth",
    "sha256": "<sha256-anime>",
    "companions": [], "measured_vram_bytes": null
  },
  "edit-gfpgan-v14": {
    "id": "edit-gfpgan-v14", "name": "GFPGAN v1.4", "artifact_type": "edit-model",
    "capability": "edit", "base_architecture": "unknown", "source": "github",
    "repo_id": null, "revision": null, "aux_repo_id": null,
    "size": "<~333 MB>", "status": "not_found", "tier": "verified", "quality": "balanced",
    "runtime": "local", "hardware_class": "laptop", "vram": "Unknown",
    "description": "Face restoration for the Edit page's Face Enhancement tool. Installs its RetinaFace detection and ParseNet parsing companions automatically.",
    "license": "apache-2.0", "gated": false, "format": "pickle",
    "download_url": "https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.4.pth",
    "sha256": "<sha256-gfpgan>",
    "companions": ["edit-face-detection", "edit-face-parsing"], "measured_vram_bytes": null
  },
  "edit-face-detection": {
    "id": "edit-face-detection", "name": "RetinaFace ResNet50 (face detection)", "artifact_type": "edit-model",
    "capability": "edit", "base_architecture": "unknown", "source": "github",
    "repo_id": null, "revision": null, "aux_repo_id": null,
    "size": "<~104 MB>", "status": "not_found", "tier": "verified", "quality": "balanced",
    "runtime": "local", "hardware_class": "laptop", "vram": "Unknown",
    "description": "Face detection weights GFPGAN uses to find and align faces (facexlib companion).",
    "license": "mit", "gated": false, "format": "pickle",
    "download_url": "https://github.com/xinntao/facexlib/releases/download/v0.1.0/detection_Resnet50_Final.pth",
    "sha256": "<sha256-retinaface>",
    "companions": [], "measured_vram_bytes": null
  },
  "edit-face-parsing": {
    "id": "edit-face-parsing", "name": "ParseNet (face parsing)", "artifact_type": "edit-model",
    "capability": "edit", "base_architecture": "unknown", "source": "github",
    "repo_id": null, "revision": null, "aux_repo_id": null,
    "size": "<~81 MB>", "status": "not_found", "tier": "verified", "quality": "balanced",
    "runtime": "local", "hardware_class": "laptop", "vram": "Unknown",
    "description": "Face-region parsing weights GFPGAN uses to paste restored faces back seamlessly (facexlib companion).",
    "license": "mit", "gated": false, "format": "pickle",
    "download_url": "https://github.com/xinntao/facexlib/releases/download/v0.2.2/parsing_parsenet.pth",
    "sha256": "<sha256-parsenet>",
    "companions": [], "measured_vram_bytes": null
  }
```

License note (test expects these exact strings): u2net + GFPGAN `apache-2.0`, Real-ESRGAN `bsd-3-clause`, facexlib weights `mit` (the facexlib repo license). If the Step 6 licence check disagrees with the repos, fix BOTH the records and the test to the repos' truth.

- [ ] **Step 6: Update the comment enums** in `backend/foundry/model_record.py`: `artifact_type` comment gains `| edit-model`, `format` comment (line ~51) becomes `# safetensors | pickle | diffusers | onnx`.

- [ ] **Step 7: Run the new test + the existing catalog/foundry suites**

Run: `backend/venv/Scripts/python.exe -m pytest backend/tests/test_foundry_edit_records.py backend/tests/test_foundry_model_record.py backend/tests/test_model_manager.py -v`
Expected: new file PASS. If `test_foundry_model_record.py` (or any other suite) asserts a fixed record count / iterates all records asserting old enums, update those assertions to include the new values.

- [ ] **Step 8: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && git branch --show-current && \
git add backend/foundry/verified-catalog.json backend/foundry/model_record.py backend/tests/test_foundry_edit_records.py && \
git commit -m "feat(edit): six edit-model Foundry records, catalog duplicate-key fix (#34)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Download manager — generalize the direct-URL branch

**Files:**
- Modify: `backend/foundry/download_manager.py`
- Create: `backend/tests/test_foundry_direct_download.py`

**Interfaces:**
- Produces: `validate_direct_url(url, source)`, `_direct_filename(model_id, record)` (formats: pickle→`.ckpt`, onnx→`.onnx`, else `.safetensors`), `_target_dir` routing `edit-model` → `<models>/edit-model/<id>/`, `_execute` routing any record with `download_url` through the direct branch.
- Consumes: Task 1's records.

- [ ] **Step 1: Write the failing tests** — `backend/tests/test_foundry_direct_download.py`:

```python
"""#34 second half: direct-URL download generalization (github release assets)."""
import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.download_manager import (  # type: ignore[import-not-found]
    _direct_filename,
    validate_direct_url,
)


class ValidateDirectUrlTests(unittest.TestCase):
    def test_accepts_https_github_for_github_source(self):
        validate_direct_url(
            "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth",
            "github",
        )

    def test_accepts_https_civitai_for_civitai_source(self):
        validate_direct_url("https://civitai.com/api/download/models/1", "civitai")

    def test_rejects_cross_source_hosts(self):
        with self.assertRaises(ValueError):
            validate_direct_url("https://github.com/x/y", "civitai")
        with self.assertRaises(ValueError):
            validate_direct_url("https://civitai.com/api/download/models/1", "github")

    def test_rejects_http_and_userinfo_spoofs(self):
        with self.assertRaises(ValueError):
            validate_direct_url("http://github.com/x/y", "github")
        with self.assertRaises(ValueError):
            validate_direct_url("https://github.com@evil.example.com/x", "github")

    def test_rejects_sources_without_a_direct_path(self):
        with self.assertRaises(ValueError):
            validate_direct_url("https://github.com/x/y", "huggingface")


class DirectFilenameTests(unittest.TestCase):
    def test_pickle_records_get_ckpt(self):
        self.assertEqual(
            _direct_filename("edit-gfpgan-v14", {"format": "pickle"}),
            "edit-gfpgan-v14.ckpt",
        )

    def test_onnx_records_get_onnx(self):
        self.assertEqual(
            _direct_filename("edit-u2net", {"format": "onnx"}), "edit-u2net.onnx"
        )

    def test_default_stays_safetensors(self):
        self.assertEqual(_direct_filename("x", {}), "x.safetensors")


class TargetDirTests(unittest.TestCase):
    def test_edit_model_records_get_a_per_id_dir(self):
        from foundry.download_manager import DownloadManager

        manager = DownloadManager.__new__(DownloadManager)  # no init needed
        manager._models_dir = "models"
        path = manager._target_dir({"artifact_type": "edit-model", "id": "edit-u2net"})
        self.assertEqual(
            path.replace("\\", "/"), "models/edit-model/edit-u2net"
        )


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify failure**

Run: `backend/venv/Scripts/python.exe -m pytest backend/tests/test_foundry_direct_download.py -v`
Expected: FAIL — `ImportError: cannot import name '_direct_filename'`.

- [ ] **Step 3: Implement in `download_manager.py`.** Rename-and-generalize (update every internal reference and docstring):

1. Replace `validate_civitai_url` with:

```python
# First-hop host allowlist per record source. Delivery CDNs behind redirects
# are deliberately NOT allowlisted (infrastructure-volatile) - integrity comes
# from the mandatory sha256 over the final bytes.
_DIRECT_URL_HOSTS = {"civitai": "civitai.com", "github": "github.com"}


def validate_direct_url(url: str, source: str) -> None:
    """Supply-chain guard for direct-URL records.

    ``urlparse(...).hostname`` strips any userinfo, so spoofs of the form
    ``https://github.com@evil.example.com/x`` resolve to the REAL host and
    are refused, as are subdomains and plain http.
    """
    allowed = _DIRECT_URL_HOSTS.get(source or "")
    if allowed is None:
        raise ValueError(f"records from source '{source}' have no direct-download path")
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != allowed:
        raise ValueError(f"refusing direct download url outside https://{allowed}: {url[:80]}")
```

2. Rename `_civitai_filename` → `_direct_filename` with format-aware extensions:

```python
_FORMAT_EXTENSIONS = {"pickle": ".ckpt", "onnx": ".onnx"}


def _direct_filename(model_id: str, record: dict) -> str:
    """Deterministic on-disk name for a direct-URL single-file artifact.

    The registry keys direct-URL records by record id, so the id is the
    filename. The extension MUST track the record format: a pickle record
    downloaded after explicit consent is a real, live path (a
    .safetensors-named pickle would break the indexer's header parse and the
    convert flow), and an .onnx must never masquerade as safetensors.
    """
    fmt = (record.get("format") or "safetensors").lower()
    return f"{model_id}{_FORMAT_EXTENSIONS.get(fmt, '.safetensors')}"
```

3. Rename `_download_civitai` → `_download_direct` and `_civitai_get` → `_direct_get`. Inside `_download_direct`: `validate_civitai_url(url)` becomes `validate_direct_url(url, record.get("source") or "")`; error strings drop the civitai-only wording (`"no download_url on civitai record"` → `"record has no download_url"`; `"civitai responded HTTP {status}"` → `f"{record.get('source') or 'direct'} responded HTTP {status}"`). `_direct_get` keeps the Bearer-token-only-on-`civitai.com` rule verbatim (github assets need no token; the hostname check already confines it) and its redirect-walk error strings may keep generic wording (`"refusing non-https hop in direct-download redirect chain"` etc.).

4. In `_execute`, change the routing condition from `if record.get("source") == "civitai":` to `if record.get("download_url"):` (civitai records all carry `download_url`; HF-repo records never do), and update the two call sites `_download_civitai`/`_civitai_filename` to the new names.

5. In `_target_dir`, extend the per-id-dir branch:

```python
        if artifact_type in {"controlnet", "ip-adapter", "edit-model"}:
```

- [ ] **Step 4: Run the new tests + the whole download suite**

Run: `backend/venv/Scripts/python.exe -m pytest backend/tests/test_foundry_direct_download.py backend/tests/test_foundry_download_api.py -v`
Expected: new tests PASS. `test_foundry_download_api.py` may reference the old names (`_civitai_filename`, `validate_civitai_url`, `_download_civitai`) — update those references to the new names/signature, keeping every existing behavioral assertion (civitai token confinement, sha256 fail-closed, atomic move) green.

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && git branch --show-current && \
git add backend/foundry/download_manager.py backend/tests/test_foundry_direct_download.py backend/tests/test_foundry_download_api.py && \
git commit -m "feat(edit): generalize direct-URL downloads to github records, edit-model layout (#34)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Presence detection — edit-model type + self-healing status

**Files:**
- Modify: `backend/utils/model_manager.py`
- Modify: `backend/foundry/registry.py`
- Test: `backend/tests/test_model_manager.py` (extend)

**Interfaces:**
- Produces: records with `artifact_type: "edit-model"` report `ready` when `<models>/edit-model/<id>/` is non-empty, including installs that finish AFTER the startup scan (self-heal — a pre-existing staleness wart for every non-safetensors record).

- [ ] **Step 1: Write the failing tests** — append to `backend/tests/test_model_manager.py` (match its existing `unittest.IsolatedAsyncioTestCase` style and imports):

```python
    async def test_edit_model_record_reports_ready_from_per_id_dir(self):
        models_dir = tempfile.mkdtemp()
        manager = ModelManager(models_dir)
        target = os.path.join(models_dir, "edit-model", "edit-u2net")
        os.makedirs(target, exist_ok=True)
        with open(os.path.join(target, "edit-u2net.onnx"), "w", encoding="utf-8") as handle:
            handle.write("stub")
        await manager.scan_models()
        self.assertEqual(manager.get_record_status("edit-u2net"), "ready")

    async def test_get_record_status_self_heals_after_a_post_scan_install(self):
        # Pre-existing wart fixed in #34: a Foundry install completing after
        # the startup scan must flip to ready without a backend restart.
        models_dir = tempfile.mkdtemp()
        manager = ModelManager(models_dir)
        await manager.scan_models()
        self.assertEqual(manager.get_record_status("edit-u2net"), "not_found")
        target = os.path.join(models_dir, "edit-model", "edit-u2net")
        os.makedirs(target, exist_ok=True)
        with open(os.path.join(target, "edit-u2net.onnx"), "w", encoding="utf-8") as handle:
            handle.write("stub")
        self.assertEqual(manager.get_record_status("edit-u2net"), "ready")
```

- [ ] **Step 2: Run to verify failure**

Run: `backend/venv/Scripts/python.exe -m pytest backend/tests/test_model_manager.py -v`
Expected: the two new tests FAIL (`not_found`).

- [ ] **Step 3: Implement.** In `backend/utils/model_manager.py`:

1. `_ARTIFACT_TYPE_TO_LEGACY` gains `"edit-model": "edit-model",`
2. `self.subdirs` gains `'edit-model': os.path.join(models_dir, 'edit-model'),`
3. `_get_local_paths` first branch becomes `if model_info.type in ("diffusers", "controlnet", "edit-model"):`
4. `get_record_status` self-heals before mapping:

```python
    def get_record_status(self, model_id: str) -> Optional[str]:
        """Live status for a catalog model in ModelRecord vocabulary.

        Returns None when this manager has no entry for the id ... (keep the
        existing docstring paragraphs). A 'not_downloaded' verdict re-checks
        the disk first: this provider shadows the registry's own on-disk
        fallback, so a Foundry install completing after the startup scan must
        flip to ready here, not wait for a backend restart (#34).
        """
        model = self.available_models.get(model_id)
        if model is None:
            return None
        if model.status == "not_downloaded":
            paths = self._get_local_paths(model)
            if paths and all(_path_present(path) for path in paths):
                model.local_path = paths[0]
                model.status = "ready"
        return _MANAGER_STATUS_TO_RECORD.get(model.status, "not_found")
```

In `backend/foundry/registry.py`, `_ARTIFACT_SUBDIR` (bottom of file) gains `"edit-model": "edit-model",` so the registry's no-provider fallback agrees on the layout.

- [ ] **Step 4: Run the full model-manager + registry suites**

Run: `backend/venv/Scripts/python.exe -m pytest backend/tests/test_model_manager.py backend/tests/test_foundry_runtime_resolver.py -v` — all PASS (fix any test that asserted the old staleness as intended behavior — none is expected to).

- [ ] **Step 5: Commit** (`feat(edit): edit-model presence detection + self-healing post-install status (#34)` — same git ritual as Task 1 Step 8, staging `backend/utils/model_manager.py backend/foundry/registry.py backend/tests/test_model_manager.py`).

---

### Task 4: Backend dependencies + packaging gates

**Files:**
- Modify: `backend/requirements.txt`, `backend/main.spec`, `build-backend.cjs`

**Interfaces:**
- Produces: `onnxruntime`, `spandrel`, `facexlib` importable in `backend/venv`; the PyInstaller bundle ships them; the build refuses a venv without them.

- [ ] **Step 1: Install into the venv** (this machine has torch already):

```bash
cd /c/vision-studio/backend && venv/Scripts/python.exe -m pip install "onnxruntime>=1.17" "spandrel>=0.4.0" "facexlib>=0.3.0"
```

- [ ] **Step 2: Live-verify the load stack** (knowledge check before writing Tasks 6-8 code):

```bash
cd /c/vision-studio/backend && venv/Scripts/python.exe - <<'EOF'
import onnxruntime, spandrel, facexlib, inspect
from facexlib.utils.face_restoration_helper import FaceRestoreHelper
from facexlib.detection import init_detection_model
print("onnxruntime", onnxruntime.__version__)
print("spandrel", spandrel.__version__)
print("FaceRestoreHelper:", inspect.signature(FaceRestoreHelper.__init__))
print("init_detection_model:", inspect.signature(init_detection_model))
import spandrel.architectures as arch
print("GFPGAN supported:", hasattr(arch, "GFPGAN"))
EOF
```

Confirm: (a) `FaceRestoreHelper.__init__` accepts `model_rootpath` (or the installed version's equivalent — if the parameter is named differently, e.g. newer facexlib dropped it, note the actual mechanism and adapt Task 8's `_make_helper` to pass weight locations through the installed API; the weight files themselves stay Foundry-resolved); (b) spandrel lists a GFPGAN architecture. If spandrel lacks GFPGAN in the installed version, install the extra arch package that carries it ONLY if MIT-licensed — otherwise STOP and surface the licensing decision.

- [ ] **Step 3: Declare in `backend/requirements.txt`** — append to the commented AI/ML block after the `controlnet_aux` line:

```
# onnxruntime>=1.17  # u2net background removal (#34); CPU EP sufficient, no torch needed
# spandrel>=0.4.0  # Real-ESRGAN / GFPGAN checkpoint loader (#34); install alongside torch
# facexlib>=0.3.0  # RetinaFace detect + ParseNet parse for GFPGAN paste-back (#34)
```

- [ ] **Step 4: PyInstaller spec** — in `backend/main.spec`, add to the explicit `hiddenimports` list (alongside the fastapi/uvicorn entries):

```python
        # #34 real edit tools
        'onnxruntime',
        'spandrel',
        'facexlib',
        'facexlib.utils.face_restoration_helper',
        'facexlib.detection',
        'facexlib.parsing',
```

and add `'onnxruntime'` and `'spandrel'` to the `metadata_packages` list.

- [ ] **Step 5: Build preflight** — in `build-backend.cjs` (repo root), locate where the venv python is resolved before PyInstaller runs and add an import preflight (adapt variable names to the script):

```js
// #34: heavy-by-design gate - the bundle must carry the edit-tool runtimes.
const editDepsCheck = spawnSync(venvPython, ['-c', 'import onnxruntime, spandrel, facexlib'], { stdio: 'inherit' });
if (editDepsCheck.status !== 0) {
  throw new Error(
    'Backend venv is missing edit-tool runtimes (onnxruntime/spandrel/facexlib). ' +
    'Install them into backend/venv before building the bundle.'
  );
}
```

(Read `build-backend.cjs` first; if it already has an equivalent torch/diffusers preflight, extend that check instead of adding a second spawn.)

- [ ] **Step 6: Sanity + commit.** `backend/venv/Scripts/python.exe -c "import onnxruntime, spandrel, facexlib; print('ok')"` prints ok. Commit staged `backend/requirements.txt backend/main.spec build-backend.cjs` as `feat(edit): declare + bundle onnxruntime/spandrel/facexlib (#34)`.

---

### Task 5: `edit_tools/weights.py` — record resolution

**Files:**
- Create: `backend/edit_tools/__init__.py` (empty), `backend/edit_tools/weights.py`
- Create: `backend/tests/test_edit_tools_weights.py`

**Interfaces:**
- Produces: `EditModelUnavailable(RuntimeError)`, `EditToolError(RuntimeError)`, `EditCancelled(RuntimeError)`, `expected_weights_filename(record_id, record) -> str`, `require_edit_weights(record_id, resolve_record, models_dir, label) -> str`. Consumed by Tasks 6-10.

- [ ] **Step 1: Failing tests** — `backend/tests/test_edit_tools_weights.py`:

```python
"""#34: Foundry-record resolution for the edit tools (stub-CI-safe)."""
import os
import pathlib
import sys
import tempfile
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from edit_tools.weights import (  # type: ignore[import-not-found]
    EditModelUnavailable,
    expected_weights_filename,
    require_edit_weights,
)


def _resolver(record):
    return lambda record_id: record if record is not None else None


class ExpectedFilenameTests(unittest.TestCase):
    def test_tracks_format(self):
        self.assertEqual(expected_weights_filename("edit-u2net", {"format": "onnx"}), "edit-u2net.onnx")
        self.assertEqual(expected_weights_filename("edit-gfpgan-v14", {"format": "pickle"}), "edit-gfpgan-v14.ckpt")
        self.assertEqual(expected_weights_filename("x", {}), "x.safetensors")


class RequireEditWeightsTests(unittest.TestCase):
    def test_missing_record_refuses_with_foundry_copy(self):
        with self.assertRaises(EditModelUnavailable) as ctx:
            require_edit_weights("edit-u2net", _resolver(None), "models", "background removal")
        self.assertIn("install 'edit-u2net' from the Foundry first", str(ctx.exception))
        self.assertNotIn("models", str(ctx.exception).replace("edit-model", ""))  # no paths

    def test_not_ready_record_refuses(self):
        record = {"status": "not_found", "format": "onnx"}
        with self.assertRaises(EditModelUnavailable):
            require_edit_weights("edit-u2net", _resolver(record), "models", "background removal")

    def test_ready_but_file_missing_refuses_with_reinstall_copy(self):
        record = {"status": "ready", "format": "onnx"}
        with tempfile.TemporaryDirectory() as models_dir:
            with self.assertRaises(EditModelUnavailable) as ctx:
                require_edit_weights("edit-u2net", _resolver(record), models_dir, "background removal")
        self.assertIn("reinstall 'edit-u2net' from the Foundry", str(ctx.exception))

    def test_ready_with_file_returns_the_path(self):
        record = {"status": "ready", "format": "onnx"}
        with tempfile.TemporaryDirectory() as models_dir:
            target = os.path.join(models_dir, "edit-model", "edit-u2net")
            os.makedirs(target)
            path = os.path.join(target, "edit-u2net.onnx")
            with open(path, "w", encoding="utf-8") as handle:
                handle.write("stub")
            self.assertEqual(
                require_edit_weights("edit-u2net", _resolver(record), models_dir, "background removal"),
                path,
            )


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify failure** (`ModuleNotFoundError: edit_tools`).

- [ ] **Step 3: Implement** — `backend/edit_tools/weights.py`:

```python
"""Foundry-record resolution for the real edit tools (#34 second half).

Weights arrive ONLY as consent-gated Foundry records under
``<models>/edit-model/<record-id>/`` (the download manager's direct-URL
layout). No module here ever downloads anything; missing weights refuse
loudly with the record id so the user knows exactly what to install.
User-facing messages never contain filesystem paths.
"""

from __future__ import annotations

import os
from typing import Any, Callable, Dict, Optional

RecordResolver = Callable[[str], Optional[Dict[str, Any]]]

_FORMAT_EXTENSIONS = {"pickle": ".ckpt", "onnx": ".onnx"}


class EditModelUnavailable(RuntimeError):
    """Missing runtime dependency or uninstalled weights (user-facing)."""


class EditToolError(RuntimeError):
    """Invalid input or processing failure (user-facing, path-free)."""


class EditCancelled(RuntimeError):
    """The job was cancelled between tiles/faces."""


def expected_weights_filename(record_id: str, record: Dict[str, Any]) -> str:
    """Mirrors download_manager._direct_filename so resolution and
    acquisition can never disagree on the on-disk name."""
    fmt = (record.get("format") or "safetensors").lower()
    return f"{record_id}{_FORMAT_EXTENSIONS.get(fmt, '.safetensors')}"


def require_edit_weights(
    record_id: str,
    resolve_record: RecordResolver,
    models_dir: str,
    label: str,
) -> str:
    """Installed weight-file path for a record, or a loud, honest refusal."""
    record = resolve_record(record_id) or {}
    if record.get("status") != "ready":
        raise EditModelUnavailable(
            f"The {label} weights are not installed - "
            f"install '{record_id}' from the Foundry first."
        )
    path = os.path.join(
        models_dir, "edit-model", record_id, expected_weights_filename(record_id, record)
    )
    if not os.path.isfile(path):
        raise EditModelUnavailable(
            f"The {label} weights look incomplete on disk - "
            f"reinstall '{record_id}' from the Foundry."
        )
    return path
```

- [ ] **Step 4: Run to verify pass**, then **Step 5: Commit** (`feat(edit): edit_tools package - Foundry weight resolution (#34)`, staging the package + test).

---

### Task 6: `edit_tools/background.py` — real U²-Net background removal

**Files:**
- Create: `backend/edit_tools/background.py`
- Create: `backend/tests/test_edit_tools_background.py`

**Interfaces:**
- Produces: `remove_background(image, edge_refinement, model_path=None, run=None) -> Image (RGBA)`, `feather_radius_px(edge_refinement) -> float`. `run` is the injectable session seam: `Callable[[np.ndarray (1,3,320,320)], np.ndarray (1,1,320,320)]`.

- [ ] **Step 1: Failing tests** — `backend/tests/test_edit_tools_background.py`:

```python
"""#34: u2net pre/post-processing against an injected fake session (no onnxruntime)."""
import pathlib
import sys
import unittest

import numpy as np
from PIL import Image

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from edit_tools.background import (  # type: ignore[import-not-found]
    feather_radius_px,
    remove_background,
)
from edit_tools.weights import EditModelUnavailable  # type: ignore[import-not-found]


def _left_half_foreground(inputs: np.ndarray) -> np.ndarray:
    """Fake u2net: saliency 1.0 on the left half, 0.0 on the right."""
    assert inputs.shape == (1, 3, 320, 320), inputs.shape
    assert inputs.dtype == np.float32
    pred = np.zeros((1, 1, 320, 320), dtype=np.float32)
    pred[:, :, :, :160] = 1.0
    return pred


class RemoveBackgroundTests(unittest.TestCase):
    def test_alpha_follows_the_saliency_map(self):
        image = Image.new("RGB", (64, 32), (200, 30, 30))
        result = remove_background(image, edge_refinement=0, run=_left_half_foreground)
        self.assertEqual(result.mode, "RGBA")
        self.assertEqual(result.size, (64, 32))
        alpha = np.asarray(result.split()[-1])
        self.assertGreater(int(alpha[16, 8]), 240)    # left = kept
        self.assertLess(int(alpha[16, 56]), 15)       # right = removed
        rgb = np.asarray(result.convert("RGB"))
        self.assertEqual(tuple(rgb[16, 8]), (200, 30, 30))  # subject pixels intact

    def test_feather_blurs_the_edge(self):
        image = Image.new("RGB", (64, 32), (0, 0, 0))
        hard = np.asarray(remove_background(image, 0, run=_left_half_foreground).split()[-1])
        soft = np.asarray(remove_background(image, 100, run=_left_half_foreground).split()[-1])
        # A feathered edge has strictly more intermediate alpha values.
        hard_mid = int(((hard > 20) & (hard < 235)).sum())
        soft_mid = int(((soft > 20) & (soft < 235)).sum())
        self.assertGreater(soft_mid, hard_mid)

    def test_feather_radius_mapping(self):
        self.assertEqual(feather_radius_px(0), 0.0)
        self.assertAlmostEqual(feather_radius_px(50), 4.0)
        self.assertAlmostEqual(feather_radius_px(100), 8.0)
        self.assertEqual(feather_radius_px(-5), 0.0)
        self.assertAlmostEqual(feather_radius_px(500), 8.0)

    def test_missing_runtime_refuses_loudly(self):
        import edit_tools.background as bg
        original = bg.onnxruntime
        bg.onnxruntime = None
        try:
            with self.assertRaises(EditModelUnavailable):
                remove_background(Image.new("RGB", (8, 8)), 0, model_path="whatever")
        finally:
            bg.onnxruntime = original


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** — `backend/edit_tools/background.py`:

```python
"""Real background removal: U^2-Net salient-object segmentation (#34).

Runs the Foundry-installed u2net.onnx directly on onnxruntime (CPU EP) -
deliberately NOT via the rembg wrapper, whose session layer auto-downloads
weights to ~/.u2net (a hidden network path the consent-gated Foundry
contract forbids). Pre/post-processing follows the reference u2net recipe:
320x320 bilinear, max-normalize, ImageNet mean/std, min-max rescale of the
saliency map, bilinear upscale back, alpha composition. The Edge Refinement
slider is a real Gaussian feather on the alpha mask (0-100 -> 0-8 px).
"""

from __future__ import annotations

from typing import Any, Callable, Dict, Optional

import numpy as np
from PIL import Image, ImageFilter

from edit_tools.weights import EditModelUnavailable

try:  # stub CI / slim install - refuse loudly at run time, import fine
    import onnxruntime
except ImportError:
    onnxruntime = None

_SESSIONS: Dict[str, Any] = {}
_SIDE = 320
_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
_MAX_FEATHER_PX = 8.0

RunSession = Callable[[np.ndarray], np.ndarray]


def feather_radius_px(edge_refinement: int) -> float:
    """Edge Refinement slider (0-100) -> Gaussian feather radius in px."""
    clamped = max(0, min(100, int(edge_refinement)))
    return clamped * _MAX_FEATHER_PX / 100.0


def _session_runner(model_path: str) -> RunSession:
    if onnxruntime is None:
        raise EditModelUnavailable(
            "this build is missing the onnxruntime runtime - reinstall Vision Studio."
        )
    if model_path not in _SESSIONS:
        _SESSIONS[model_path] = onnxruntime.InferenceSession(
            model_path, providers=["CPUExecutionProvider"]
        )
    session = _SESSIONS[model_path]
    input_name = session.get_inputs()[0].name

    def run(inputs: np.ndarray) -> np.ndarray:
        return session.run(None, {input_name: inputs})[0]

    return run


def _preprocess(image: Image.Image) -> np.ndarray:
    resized = image.convert("RGB").resize((_SIDE, _SIDE), Image.Resampling.BILINEAR)
    arr = np.asarray(resized, dtype=np.float32)
    arr = arr / max(float(arr.max()), 1e-6)
    arr = (arr - _MEAN) / _STD
    return arr.transpose(2, 0, 1)[np.newaxis, :].astype(np.float32)


def _postprocess(pred: np.ndarray, size: tuple) -> Image.Image:
    saliency = pred[0, 0, :, :]
    lo, hi = float(saliency.min()), float(saliency.max())
    saliency = (saliency - lo) / max(hi - lo, 1e-6)
    mask = Image.fromarray((saliency * 255.0).astype(np.uint8), mode="L")
    return mask.resize(size, Image.Resampling.BILINEAR)


def remove_background(
    image: Image.Image,
    edge_refinement: int,
    model_path: Optional[str] = None,
    run: Optional[RunSession] = None,
) -> Image.Image:
    """RGBA cutout of ``image`` with the u2net saliency map as alpha."""
    if run is None:
        run = _session_runner(model_path or "")
    mask = _postprocess(run(_preprocess(image)), image.size)
    radius = feather_radius_px(edge_refinement)
    if radius > 0:
        mask = mask.filter(ImageFilter.GaussianBlur(radius))
    result = image.convert("RGBA")
    result.putalpha(mask)
    return result
```

- [ ] **Step 4: Run to verify pass**, then **Step 5: Commit** (`feat(edit): real u2net background removal (#34)`).

---

### Task 7: `edit_tools/upscale.py` — tiled Real-ESRGAN

**Files:**
- Create: `backend/edit_tools/upscale.py`
- Create: `backend/tests/test_edit_tools_upscale.py`

**Interfaces:**
- Produces: `upscale(image, scale, model_path=None, progress_cb=None, cancel_check=None, run_tile=None, model_scale=4) -> Image`, `TILE = 256`, `OVERLAP = 16`. `run_tile: Callable[[Image], Image]` (test seam); `progress_cb(done, total)`; `cancel_check() -> bool` raises `EditCancelled` between tiles when true.

- [ ] **Step 1: Failing tests** — `backend/tests/test_edit_tools_upscale.py`:

```python
"""#34: tiled super-resolution assembly against a fake x4 tile runner (no torch)."""
import pathlib
import sys
import unittest

import numpy as np
from PIL import Image

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from edit_tools.upscale import upscale  # type: ignore[import-not-found]
from edit_tools.weights import EditCancelled, EditModelUnavailable  # type: ignore[import-not-found]


def _nearest_x4(tile: Image.Image) -> Image.Image:
    return tile.resize((tile.width * 4, tile.height * 4), Image.Resampling.NEAREST)


def _gradient_image(width: int, height: int) -> Image.Image:
    xs = np.linspace(0, 255, width, dtype=np.uint8)
    row = np.stack([xs, xs[::-1], np.full(width, 40, dtype=np.uint8)], axis=-1)
    return Image.fromarray(np.tile(row[np.newaxis, :, :], (height, 1, 1)))


class UpscaleTests(unittest.TestCase):
    def test_output_matches_single_pass_exactly_across_tile_seams(self):
        # 300x280 forces a 2x2 tile grid (TILE=256). Nearest-neighbor x4 is
        # deterministic, so tiled assembly must equal the untiled reference.
        image = _gradient_image(300, 280)
        tiled = upscale(image, 4, run_tile=_nearest_x4, model_scale=4)
        reference = _nearest_x4(image)
        self.assertEqual(tiled.size, (1200, 1120))
        np.testing.assert_array_equal(np.asarray(tiled), np.asarray(reference))

    def test_scale_two_downsamples_the_x4_output(self):
        image = _gradient_image(100, 60)
        result = upscale(image, 2, run_tile=_nearest_x4, model_scale=4)
        self.assertEqual(result.size, (200, 120))

    def test_progress_is_monotonic_and_complete(self):
        calls = []
        upscale(_gradient_image(300, 280), 4, run_tile=_nearest_x4, model_scale=4,
                progress_cb=lambda done, total: calls.append((done, total)))
        self.assertEqual(calls[-1][0], calls[-1][1])
        self.assertEqual(len(calls), 4)  # 2x2 grid
        self.assertEqual([c[0] for c in calls], sorted(c[0] for c in calls))

    def test_cancellation_between_tiles(self):
        ran = []

        def cancelling_tile(tile):
            ran.append(1)
            return _nearest_x4(tile)

        with self.assertRaises(EditCancelled):
            upscale(_gradient_image(300, 280), 4, run_tile=cancelling_tile,
                    model_scale=4, cancel_check=lambda: len(ran) >= 1)
        self.assertEqual(len(ran), 1)  # stopped after the first tile

    def test_invalid_scale_refuses(self):
        with self.assertRaises(ValueError):
            upscale(_gradient_image(10, 10), 3, run_tile=_nearest_x4, model_scale=4)

    def test_missing_runtime_refuses_loudly(self):
        with self.assertRaises(EditModelUnavailable):
            upscale(_gradient_image(10, 10), 4, model_path="whatever")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** — `backend/edit_tools/upscale.py`:

```python
"""Real AI upscaling: Real-ESRGAN via spandrel, tiled for bounded memory (#34).

spandrel (MIT - ComfyUI's loader) loads the .pth checkpoints into clean
reimplementations; the unmaintained basicsr/realesrgan packages never enter
the tree. Tiles are processed with an overlap margin and center-cropped on
paste, so tiled output is pixel-identical to a single pass. 2x runs the 4x
model and LANCZOS-downsamples (reported honestly by the service layer).
"""

from __future__ import annotations

from typing import Any, Callable, Dict, Optional, Tuple

from PIL import Image

from edit_tools.weights import EditCancelled, EditModelUnavailable

try:  # stub CI / slim install
    import torch
except ImportError:
    torch = None

try:
    import numpy as np
except ImportError:  # numpy is a base dep; guard anyway for symmetry
    np = None

try:
    from spandrel import ModelLoader
except ImportError:
    ModelLoader = None

TILE = 256
OVERLAP = 16

_RUNNERS: Dict[str, Tuple[Callable[[Image.Image], Image.Image], int]] = {}

RunTile = Callable[[Image.Image], Image.Image]
ProgressCb = Callable[[int, int], None]
CancelCheck = Callable[[], bool]


def _make_runner(model_path: str) -> Tuple[RunTile, int]:
    if torch is None or ModelLoader is None or np is None:
        raise EditModelUnavailable(
            "this build is missing the spandrel/torch runtime - reinstall Vision Studio."
        )
    if model_path in _RUNNERS:
        return _RUNNERS[model_path]

    device = "cuda" if torch.cuda.is_available() else "cpu"
    descriptor = ModelLoader().load_from_file(model_path).to(device).eval()

    def run(tile: Image.Image) -> Image.Image:
        arr = np.asarray(tile.convert("RGB"), dtype=np.float32) / 255.0
        tensor = torch.from_numpy(arr).permute(2, 0, 1).unsqueeze(0).to(device)
        with torch.no_grad():
            out = descriptor(tensor)
        out = out.squeeze(0).permute(1, 2, 0).clamp(0.0, 1.0).cpu().numpy()
        return Image.fromarray((out * 255.0).round().astype(np.uint8))

    _RUNNERS[model_path] = (run, int(descriptor.scale))
    return _RUNNERS[model_path]


def upscale(
    image: Image.Image,
    scale: int,
    model_path: Optional[str] = None,
    progress_cb: Optional[ProgressCb] = None,
    cancel_check: Optional[CancelCheck] = None,
    run_tile: Optional[RunTile] = None,
    model_scale: int = 4,
) -> Image.Image:
    """Super-resolve ``image`` by ``scale`` (2 or 4) with seam-free tiling."""
    if scale not in (2, 4):
        raise ValueError(f"Unsupported scale factor: {scale}. Must be 2 or 4.")
    if run_tile is None:
        run_tile, model_scale = _make_runner(model_path or "")

    source = image.convert("RGB")
    width, height = source.size
    tiles = [
        (x, y, min(TILE, width - x), min(TILE, height - y))
        for y in range(0, height, TILE)
        for x in range(0, width, TILE)
    ]
    output = Image.new("RGB", (width * model_scale, height * model_scale))
    for index, (x, y, w, h) in enumerate(tiles):
        if cancel_check is not None and cancel_check():
            raise EditCancelled("upscale cancelled")
        x0, y0 = max(0, x - OVERLAP), max(0, y - OVERLAP)
        x1, y1 = min(width, x + w + OVERLAP), min(height, y + h + OVERLAP)
        scaled = run_tile(source.crop((x0, y0, x1, y1)))
        left, top = (x - x0) * model_scale, (y - y0) * model_scale
        output.paste(
            scaled.crop((left, top, left + w * model_scale, top + h * model_scale)),
            (x * model_scale, y * model_scale),
        )
        if progress_cb is not None:
            progress_cb(index + 1, len(tiles))

    if scale != model_scale:
        output = output.resize((width * scale, height * scale), Image.Resampling.LANCZOS)
    return output
```

- [ ] **Step 4: Run to verify pass**, then **Step 5: Commit** (`feat(edit): tiled Real-ESRGAN upscaling via spandrel (#34)`).

---

### Task 8: `edit_tools/faces.py` — GFPGAN restoration with honest detection

**Files:**
- Create: `backend/edit_tools/faces.py`
- Create: `backend/tests/test_edit_tools_faces.py`

**Interfaces:**
- Produces: `restore_faces(image, strength, gfpgan_path=None, detection_path=None, parsing_path=None, progress_cb=None, cancel_check=None, helper=None, restore_crop=None) -> Tuple[Image, int]`. Seams: `helper` (facexlib FaceRestoreHelper protocol), `restore_crop: Callable[[np.ndarray BGR 512], np.ndarray BGR 512]`.

- [ ] **Step 1: Failing tests** — `backend/tests/test_edit_tools_faces.py`:

```python
"""#34: GFPGAN orchestration against fake helper/restorer seams (no torch/facexlib)."""
import pathlib
import sys
import unittest

import numpy as np
from PIL import Image

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from edit_tools.faces import restore_faces  # type: ignore[import-not-found]
from edit_tools.weights import EditCancelled, EditModelUnavailable  # type: ignore[import-not-found]


class FakeHelper:
    """Mimics facexlib.FaceRestoreHelper's orchestration surface."""

    def __init__(self, face_count: int):
        self._face_count = face_count
        self.cropped_faces = []
        self.restored = []
        self.pasted = None

    def clean_all(self):
        self.cropped_faces = []
        self.restored = []

    def read_image(self, bgr):
        self._image = bgr

    def get_face_landmarks_5(self, **kwargs):
        return self._face_count

    def align_warp_face(self):
        self.cropped_faces = [
            np.full((512, 512, 3), 100, dtype=np.uint8) for _ in range(self._face_count)
        ]

    def add_restored_face(self, face):
        self.restored.append(face)

    def get_inverse_affine(self, _):
        pass

    def paste_faces_to_input_image(self):
        self.pasted = np.full_like(self._image, 200)
        return self.pasted


def _brighten(crop: np.ndarray) -> np.ndarray:
    return np.full_like(crop, 220)


class RestoreFacesTests(unittest.TestCase):
    def test_zero_faces_returns_the_input_unchanged(self):
        image = Image.new("RGB", (32, 32), (10, 20, 30))
        result, count = restore_faces(image, 50, helper=FakeHelper(0), restore_crop=_brighten)
        self.assertEqual(count, 0)
        np.testing.assert_array_equal(np.asarray(result), np.asarray(image))

    def test_detected_faces_are_restored_and_counted(self):
        helper = FakeHelper(2)
        image = Image.new("RGB", (64, 64), (10, 20, 30))
        result, count = restore_faces(image, 100, helper=helper, restore_crop=_brighten)
        self.assertEqual(count, 2)
        self.assertEqual(len(helper.restored), 2)
        self.assertIsNotNone(helper.pasted)
        # strength 100 -> the restored crop lands verbatim
        np.testing.assert_array_equal(helper.restored[0], np.full((512, 512, 3), 220, np.uint8))

    def test_strength_blends_restored_over_original(self):
        helper = FakeHelper(1)
        restore_faces(Image.new("RGB", (64, 64)), 50, helper=helper, restore_crop=_brighten)
        # original crop 100, restored 220, strength 0.5 -> 160
        self.assertEqual(int(helper.restored[0][0, 0, 0]), 160)

    def test_strength_zero_keeps_the_original_crop(self):
        helper = FakeHelper(1)
        restore_faces(Image.new("RGB", (64, 64)), 0, helper=helper, restore_crop=_brighten)
        self.assertEqual(int(helper.restored[0][0, 0, 0]), 100)

    def test_cancellation_between_faces(self):
        helper = FakeHelper(3)
        seen = []

        def restore(crop):
            seen.append(1)
            return _brighten(crop)

        with self.assertRaises(EditCancelled):
            restore_faces(Image.new("RGB", (64, 64)), 50, helper=helper,
                          restore_crop=restore, cancel_check=lambda: len(seen) >= 1)
        self.assertEqual(len(seen), 1)

    def test_missing_runtime_refuses_loudly(self):
        with self.assertRaises(EditModelUnavailable):
            restore_faces(Image.new("RGB", (8, 8)), 50,
                          gfpgan_path="x", detection_path="y", parsing_path="z")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** — `backend/edit_tools/faces.py` (adapt the facexlib constructor call to the Task 4 Step 2 findings — the code below assumes the `model_rootpath` API; if the installed facexlib differs, keep the staging-dir contract and change only `_make_helper`):

```python
"""Real face restoration: GFPGAN v1.4 via spandrel + facexlib (#34).

facexlib provides the canonical detect -> align -> paste-back pipeline
(RetinaFace ResNet50 + ParseNet). Its weights arrive ONLY as Foundry
records; a staging directory with facexlib's canonical filenames is
assembled beside the records so its loader finds them and never downloads.
``strength`` (0-100) alpha-blends each restored 512x512 crop over the
original crop BEFORE paste-back - GFPGAN exposes no finer controls, so the
panel offers none. faces_detected is the honest RetinaFace count; zero
faces returns the input unchanged.
"""

from __future__ import annotations

import os
import shutil
from typing import Any, Callable, Dict, Optional, Tuple

import numpy as np
from PIL import Image

from edit_tools.weights import EditCancelled, EditModelUnavailable

try:  # stub CI / slim install
    import torch
except ImportError:
    torch = None

try:
    from spandrel import ModelLoader
except ImportError:
    ModelLoader = None

try:
    from facexlib.utils.face_restoration_helper import FaceRestoreHelper
except ImportError:
    FaceRestoreHelper = None

# facexlib resolves weights by URL basename; the staging dir maps our
# record-id filenames onto the names its loader expects.
_STAGED_NAMES = {
    "detection": "detection_Resnet50_Final.pth",
    "parsing": "parsing_parsenet.pth",
}

_GFPGAN_RUNNERS: Dict[str, Callable[[np.ndarray], np.ndarray]] = {}

RestoreCrop = Callable[[np.ndarray], np.ndarray]
ProgressCb = Callable[[int, int], None]
CancelCheck = Callable[[], bool]


def _require_runtime() -> None:
    if torch is None or ModelLoader is None or FaceRestoreHelper is None:
        raise EditModelUnavailable(
            "this build is missing the facexlib/spandrel runtime - reinstall Vision Studio."
        )


def _staging_dir(detection_path: str, parsing_path: str) -> str:
    """Assemble <models>/edit-model/.facexlib/ with canonical filenames."""
    root = os.path.join(os.path.dirname(os.path.dirname(detection_path)), ".facexlib")
    os.makedirs(root, exist_ok=True)
    for source, name in ((detection_path, _STAGED_NAMES["detection"]),
                         (parsing_path, _STAGED_NAMES["parsing"])):
        target = os.path.join(root, name)
        if not os.path.isfile(target) or os.path.getsize(target) != os.path.getsize(source):
            shutil.copy2(source, target)
    return root


def _make_helper(detection_path: str, parsing_path: str) -> Any:
    _require_runtime()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    staging = _staging_dir(detection_path, parsing_path)
    return FaceRestoreHelper(
        upscale_factor=1,
        face_size=512,
        crop_ratio=(1, 1),
        det_model="retinaface_resnet50",
        save_ext="png",
        use_parse=True,
        device=device,
        model_rootpath=staging,
    )


def _make_gfpgan_runner(gfpgan_path: str) -> RestoreCrop:
    _require_runtime()
    if gfpgan_path in _GFPGAN_RUNNERS:
        return _GFPGAN_RUNNERS[gfpgan_path]
    device = "cuda" if torch.cuda.is_available() else "cpu"
    descriptor = ModelLoader().load_from_file(gfpgan_path).to(device).eval()

    def restore(crop_bgr: np.ndarray) -> np.ndarray:
        rgb = crop_bgr[:, :, ::-1].astype(np.float32) / 255.0
        tensor = torch.from_numpy(rgb.copy()).permute(2, 0, 1).unsqueeze(0).to(device)
        with torch.no_grad():
            out = descriptor(tensor)
        out = out.squeeze(0).permute(1, 2, 0).clamp(0.0, 1.0).cpu().numpy()
        return (out[:, :, ::-1] * 255.0).round().astype(np.uint8)

    _GFPGAN_RUNNERS[gfpgan_path] = restore
    return restore


def restore_faces(
    image: Image.Image,
    strength: int,
    gfpgan_path: Optional[str] = None,
    detection_path: Optional[str] = None,
    parsing_path: Optional[str] = None,
    progress_cb: Optional[ProgressCb] = None,
    cancel_check: Optional[CancelCheck] = None,
    helper: Optional[Any] = None,
    restore_crop: Optional[RestoreCrop] = None,
) -> Tuple[Image.Image, int]:
    """(restored image, honest face count). Zero faces -> input unchanged."""
    if helper is None:
        helper = _make_helper(detection_path or "", parsing_path or "")
    if restore_crop is None:
        restore_crop = _make_gfpgan_runner(gfpgan_path or "")

    weight = max(0, min(100, int(strength))) / 100.0
    source = image.convert("RGB")
    bgr = np.asarray(source)[:, :, ::-1].copy()

    helper.clean_all()
    helper.read_image(bgr)
    helper.get_face_landmarks_5(only_center_face=False, resize=640, eye_dist_threshold=5)
    helper.align_warp_face()

    faces = list(helper.cropped_faces)
    if not faces:
        return source, 0

    for index, cropped in enumerate(faces):
        if cancel_check is not None and cancel_check():
            raise EditCancelled("face restoration cancelled")
        restored = restore_crop(cropped)
        blended = (
            cropped.astype(np.float32) * (1.0 - weight)
            + restored.astype(np.float32) * weight
        ).round().astype(np.uint8)
        helper.add_restored_face(blended)
        if progress_cb is not None:
            progress_cb(index + 1, len(faces))

    helper.get_inverse_affine(None)
    pasted = helper.paste_faces_to_input_image()
    return Image.fromarray(pasted[:, :, ::-1]), len(faces)
```

- [ ] **Step 4: Run to verify pass**, then **Step 5: Commit** (`feat(edit): GFPGAN face restoration with honest detection counts (#34)`).

---

### Task 9: `edit_tools/service.py` — operation dispatch

**Files:**
- Create: `backend/edit_tools/service.py`
- Create: `backend/tests/test_edit_tools_service.py`

**Interfaces:**
- Produces: `run_edit_operation(job_id, operation, params, output_root, models_dir, resolve_record, progress_cb=None, cancel_check=None) -> Dict` returning `{"images": ["/outputs/<job_id>/<name>.png"], ...metadata}`. Record-id routing: remove-background→`edit-u2net`; upscale→`edit-realesrgan-x4plus`(-anime); restore-faces→`edit-gfpgan-v14`+`edit-face-detection`+`edit-face-parsing`. Consumed by Task 10.

- [ ] **Step 1: Failing tests** — `backend/tests/test_edit_tools_service.py`:

```python
"""#34: edit operation dispatch (weights + heavy passes monkeypatched)."""
import os
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

from PIL import Image

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import edit_tools.service as service  # type: ignore[import-not-found]
from edit_tools.weights import EditModelUnavailable, EditToolError  # type: ignore[import-not-found]


def _write_source(directory: str) -> str:
    path = os.path.join(directory, "source.png")
    Image.new("RGB", (32, 16), (50, 60, 70)).save(path)
    return path


def _ready_resolver(record_id):
    return {"status": "ready", "format": "onnx" if record_id == "edit-u2net" else "pickle"}


class RunEditOperationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.source = _write_source(self.tmp.name)
        self.output_root = os.path.join(self.tmp.name, "outputs")

    def _run(self, operation, params, **kwargs):
        return service.run_edit_operation(
            "job-1", operation, {"source_path": self.source, **params},
            self.output_root, self.tmp.name, kwargs.pop("resolve_record", _ready_resolver),
            **kwargs,
        )

    def test_unreadable_source_is_a_path_free_edit_error(self):
        broken = os.path.join(self.tmp.name, "broken.png")
        with open(broken, "w", encoding="utf-8") as handle:
            handle.write("not an image")
        with self.assertRaises(EditToolError) as ctx:
            service.run_edit_operation(
                "job-1", "remove-background", {"source_path": broken},
                self.output_root, self.tmp.name, _ready_resolver,
            )
        self.assertNotIn(self.tmp.name, str(ctx.exception))

    def test_missing_weights_surface_the_foundry_refusal(self):
        with self.assertRaises(EditModelUnavailable) as ctx:
            self._run("remove-background", {}, resolve_record=lambda _record_id: None)
        self.assertIn("edit-u2net", str(ctx.exception))

    def test_remove_background_writes_rgba_and_reports_it(self):
        with mock.patch.object(service, "require_edit_weights", return_value="w.onnx"), \
             mock.patch.object(service, "remove_background",
                               return_value=Image.new("RGBA", (32, 16))) as passthrough:
            result = self._run("remove-background", {"edge_refinement": 80})
        passthrough.assert_called_once()
        self.assertEqual(passthrough.call_args.kwargs.get("model_path"), "w.onnx")
        self.assertEqual(result["images"], ["/outputs/job-1/edit_remove-background.png"])
        saved = Image.open(os.path.join(self.output_root, "job-1", "edit_remove-background.png"))
        self.assertEqual(saved.mode, "RGBA")

    def test_upscale_routes_models_and_reports_scales_honestly(self):
        with mock.patch.object(service, "require_edit_weights", return_value="m.ckpt") as req, \
             mock.patch.object(service, "upscale",
                               return_value=Image.new("RGB", (64, 32))):
            result = self._run("upscale", {"scale": 2, "model": "anime"})
        self.assertEqual(req.call_args.args[0], "edit-realesrgan-x4plus-anime")
        self.assertEqual(result["model_used"], "edit-realesrgan-x4plus-anime")
        self.assertEqual(result["model_scale"], 4)
        self.assertEqual(result["output_scale"], 2)
        self.assertEqual(result["original_size"], [32, 16])
        self.assertEqual(result["new_size"], [64, 32])

    def test_upscale_face_enhance_runs_the_face_pass_on_the_result(self):
        with mock.patch.object(service, "require_edit_weights", return_value="w"), \
             mock.patch.object(service, "upscale", return_value=Image.new("RGB", (64, 32))), \
             mock.patch.object(service, "restore_faces",
                               return_value=(Image.new("RGB", (64, 32)), 1)) as faces:
            result = self._run("upscale", {"scale": 2, "face_enhance": True})
        faces.assert_called_once()
        self.assertEqual(result["faces_detected"], 1)

    def test_restore_faces_reports_honest_zero(self):
        with mock.patch.object(service, "require_edit_weights", return_value="w"), \
             mock.patch.object(service, "restore_faces",
                               return_value=(Image.new("RGB", (32, 16)), 0)):
            result = self._run("restore-faces", {"strength": 70})
        self.assertEqual(result["faces_detected"], 0)

    def test_unknown_operation_refuses(self):
        with self.assertRaises(EditToolError):
            self._run("sharpen", {})


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** — `backend/edit_tools/service.py`:

```python
"""Edit-operation dispatch: validated source file -> tool pass -> saved PNG (#34).

Runs inside a worker thread under the job manager (api/edit.py); everything
here is synchronous. Results use the image-job shape ({"images": [relative
URLs]}) so job polling, WS updates, asset sync, and orphan cleanup work
untouched. Every raised message is user-facing and path-free.
"""

from __future__ import annotations

import os
from typing import Any, Callable, Dict, Optional

from PIL import Image, ImageOps

from edit_tools.background import remove_background
from edit_tools.faces import restore_faces
from edit_tools.upscale import upscale
from edit_tools.weights import (
    EditToolError,
    RecordResolver,
    require_edit_weights,
)

UPSCALE_RECORDS = {
    "general": "edit-realesrgan-x4plus",
    "anime": "edit-realesrgan-x4plus-anime",
}
MODEL_SCALE = 4  # both Real-ESRGAN records are 4x models
FACE_ENHANCE_STRENGTH = 50  # fixed blend for the upscale face_enhance pass

ProgressCb = Callable[[int, int], None]
CancelCheck = Callable[[], bool]


def _load_source(source_path: str) -> Image.Image:
    try:
        image = Image.open(source_path)
        image.load()
        return ImageOps.exif_transpose(image)
    except Exception:
        raise EditToolError(
            "The source image could not be read - re-export the frame and try again."
        )


def _face_paths(models_dir: str, resolve_record: RecordResolver) -> Dict[str, str]:
    return {
        "gfpgan_path": require_edit_weights(
            "edit-gfpgan-v14", resolve_record, models_dir, "face restoration"),
        "detection_path": require_edit_weights(
            "edit-face-detection", resolve_record, models_dir, "face detection"),
        "parsing_path": require_edit_weights(
            "edit-face-parsing", resolve_record, models_dir, "face parsing"),
    }


def run_edit_operation(
    job_id: str,
    operation: str,
    params: Dict[str, Any],
    output_root: str,
    models_dir: str,
    resolve_record: RecordResolver,
    progress_cb: Optional[ProgressCb] = None,
    cancel_check: Optional[CancelCheck] = None,
) -> Dict[str, Any]:
    image = _load_source(params["source_path"])
    metadata: Dict[str, Any] = {}

    if operation == "remove-background":
        model_path = require_edit_weights(
            "edit-u2net", resolve_record, models_dir, "background removal")
        result = remove_background(
            image, int(params.get("edge_refinement", 50)), model_path=model_path)

    elif operation == "upscale":
        record_id = UPSCALE_RECORDS.get(params.get("model") or "general",
                                        UPSCALE_RECORDS["general"])
        model_path = require_edit_weights(
            record_id, resolve_record, models_dir, "AI upscale")
        scale = int(params.get("scale", 2))
        face_enhance = bool(params.get("face_enhance"))
        face_paths = _face_paths(models_dir, resolve_record) if face_enhance else None

        # face_enhance splits the progress budget: tiles 0-80%, faces 80-100%.
        def tile_progress(done: int, total: int) -> None:
            if progress_cb is not None:
                span = 80 if face_enhance else 100
                progress_cb(done * span, total * 100)

        result = upscale(image, scale, model_path=model_path,
                         progress_cb=tile_progress, cancel_check=cancel_check)
        metadata.update({
            "model_used": record_id,
            "model_scale": MODEL_SCALE,
            "output_scale": scale,
            "original_size": [image.width, image.height],
        })
        if face_enhance:
            def face_progress(done: int, total: int) -> None:
                if progress_cb is not None:
                    progress_cb(80 * total + done * 20, total * 100)

            result, faces_detected = restore_faces(
                result, FACE_ENHANCE_STRENGTH, progress_cb=face_progress,
                cancel_check=cancel_check, **face_paths)
            metadata["faces_detected"] = faces_detected
        metadata["new_size"] = [result.width, result.height]

    elif operation == "restore-faces":
        face_paths = _face_paths(models_dir, resolve_record)
        result, faces_detected = restore_faces(
            image, int(params.get("strength", 50)), progress_cb=progress_cb,
            cancel_check=cancel_check, **face_paths)
        metadata["faces_detected"] = faces_detected

    else:
        raise EditToolError(f"Unknown edit operation '{operation}'.")

    output_dir = os.path.join(output_root, job_id)
    os.makedirs(output_dir, exist_ok=True)
    name = f"edit_{operation}.png"
    result.save(os.path.join(output_dir, name))
    return {"images": [f"/outputs/{job_id}/{name}"], **metadata}
```

Note the progress convention: `progress_cb(done, total)` where the service pre-scales for split budgets — Task 10's `_process` divides `done * 100 / total`. Keep them consistent (the tests in Task 10 pin it).

- [ ] **Step 4: Run to verify pass** (plus `test_edit_tools_background/upscale/faces` still green), then **Step 5: Commit** (`feat(edit): edit operation dispatch service (#34)`).

---

### Task 10: API rewrite — job submitters + main.py wiring + LANCZOS retirement

**Files:**
- Rewrite: `backend/api/edit.py`, `backend/schemas/edit.py`
- Delete: `backend/services/edit_service.py`, `backend/tests/test_edit_service.py`
- Rewrite: `backend/tests/test_edit_api.py`, `backend/tests/test_edit_schemas.py`
- Modify: `backend/main.py` (configure call; delete `/api/images/upscale` + `ImageUpscaleRequest`), `backend/utils/image_ops.py` (delete `upscale_image_file`)

**Interfaces:**
- Produces: `POST /api/v1/edit/{remove-background,upscale,restore-faces}` → 202 `{job_id, status, message}`; `GET /api/v1/edit/models` → per-tool readiness; `configure(job_manager, output_dir, models_dir, resolve_record)`. Job type `"edit"`. Consumed by Task 11.

- [ ] **Step 1: Rewrite `backend/schemas/edit.py`:**

```python
"""Request/response schemas for the real edit tools (#34 second half).

The stub-era synchronous base64 contract is gone (it had zero consumers);
edit operations are jobs. Requests carry a source file path (the crop/
guided-pass convention) and the tool's real parameters - nothing fake.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class BackgroundRemoveRequest(BaseModel):
    source_path: str = Field(min_length=1)
    edge_refinement: int = Field(default=50, ge=0, le=100)


class UpscaleRequest(BaseModel):
    source_path: str = Field(min_length=1)
    scale: Literal[2, 4] = 2
    model: Literal["general", "anime"] = "general"
    face_enhance: bool = False


class FaceRestoreRequest(BaseModel):
    source_path: str = Field(min_length=1)
    strength: int = Field(default=50, ge=0, le=100)


class EditJobResponse(BaseModel):
    job_id: str
    status: str
    message: str
```

- [ ] **Step 2: Rewrite `backend/api/edit.py`** (the `api/comfy_graph.py` configure() pattern):

```python
"""Edit API router: real AI edit tools as job submitters (#34 second half).

Each POST validates, registers a GenerationJob(type="edit"), schedules the
synchronous edit pass on a worker thread, and answers 202 with the job id -
the renderer polls GET /api/jobs/{job_id} exactly like generation jobs.
Missing weights surface as a FAILED job carrying the Foundry-pointer copy,
so the panel has one consistent error path. Cancellation flows through the
existing cancel endpoint; the tool passes check it between tiles/faces.
"""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from datetime import datetime
from typing import Any, Callable, Dict, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

from edit_tools.service import run_edit_operation
from edit_tools.weights import EditCancelled, EditModelUnavailable, EditToolError
from middleware.rate_limit import LIMITS, limiter
from schemas.edit import (  # type: ignore[import-not-found]
    BackgroundRemoveRequest,
    EditJobResponse,
    FaceRestoreRequest,
    UpscaleRequest,
)
from utils.job_manager import GenerationJob, JobStatus

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/edit", tags=["Edit"])

# Configured by main.py at startup (the api/comfy_graph.py pattern).
_job_manager: Any = None
_output_dir: str = "outputs"
_models_dir: str = "models"
_resolve_record: Optional[Callable[[str], Optional[Dict[str, Any]]]] = None

# Tool -> every record it needs (upscale readiness = the general model;
# anime and face_enhance surface their own refusals at run time).
TOOL_RECORDS = {
    "remove-background": ["edit-u2net"],
    "upscale": ["edit-realesrgan-x4plus"],
    "restore-faces": ["edit-gfpgan-v14", "edit-face-detection", "edit-face-parsing"],
}


def configure(job_manager: Any, output_dir: str, models_dir: str,
              resolve_record: Callable[[str], Optional[Dict[str, Any]]]) -> None:
    global _job_manager, _output_dir, _models_dir, _resolve_record
    _job_manager = job_manager
    _output_dir = output_dir
    _models_dir = models_dir
    _resolve_record = resolve_record


async def _process(job_id: str, operation: str, params: Dict[str, Any]) -> None:
    _job_manager.update_job(job_id, status=JobStatus.PROCESSING, progress=0.0)

    def cancel_check() -> bool:
        job = _job_manager.get_job(job_id)
        return bool(job and job.status == JobStatus.CANCELLED)

    def progress_cb(done: int, total: int) -> None:
        _job_manager.update_job(
            job_id, progress=round(done * 100.0 / max(total, 1), 1))

    try:
        result = await asyncio.to_thread(
            run_edit_operation, job_id, operation, params, _output_dir,
            _models_dir, _resolve_record, progress_cb, cancel_check)
        _job_manager.update_job(
            job_id, status=JobStatus.COMPLETED, progress=100.0,
            result=result, completed_at=datetime.now())
    except EditCancelled:
        _job_manager.update_job(
            job_id, status=JobStatus.CANCELLED, completed_at=datetime.now())
    except (EditModelUnavailable, EditToolError) as exc:
        _job_manager.update_job(
            job_id, status=JobStatus.FAILED, error=str(exc),
            completed_at=datetime.now())
    except Exception:
        logger.exception(f"[Job {job_id}] edit operation '{operation}' failed")
        _job_manager.update_job(
            job_id, status=JobStatus.FAILED,
            error=f"The {operation} operation failed unexpectedly - check the backend logs.",
            completed_at=datetime.now())


def _submit(operation: str, source_path: str, params: Dict[str, Any],
            background_tasks: BackgroundTasks) -> EditJobResponse:
    if not os.path.exists(source_path):  # the /api/images/crop convention
        raise HTTPException(status_code=404, detail="Source image not found")

    job_id = str(uuid.uuid4())
    _job_manager.add_job(GenerationJob(
        id=job_id,
        type="edit",
        status=JobStatus.PENDING,
        params={"source": "edit-tool", "operation": operation, **params},
        output_dir=os.path.join(_output_dir, job_id),
    ))
    background_tasks.add_task(
        _process, job_id, operation, {"source_path": source_path, **params})
    return EditJobResponse(job_id=job_id, status="pending",
                           message=f"Edit job started: {operation}")


@router.post("/remove-background", response_model=EditJobResponse, status_code=202)
@limiter.limit(LIMITS["edit"])
async def remove_background(request: Request, body: BackgroundRemoveRequest,
                            background_tasks: BackgroundTasks) -> EditJobResponse:
    """AI background removal (U^2-Net). Poll GET /api/jobs/{job_id}."""
    return _submit("remove-background", body.source_path,
                   {"edge_refinement": body.edge_refinement}, background_tasks)


@router.post("/upscale", response_model=EditJobResponse, status_code=202)
@limiter.limit(LIMITS["edit"])
async def upscale_image(request: Request, body: UpscaleRequest,
                        background_tasks: BackgroundTasks) -> EditJobResponse:
    """AI super-resolution (Real-ESRGAN, optional GFPGAN face pass)."""
    return _submit("upscale", body.source_path,
                   {"scale": body.scale, "model": body.model,
                    "face_enhance": body.face_enhance}, background_tasks)


@router.post("/restore-faces", response_model=EditJobResponse, status_code=202)
@limiter.limit(LIMITS["edit"])
async def restore_faces(request: Request, body: FaceRestoreRequest,
                        background_tasks: BackgroundTasks) -> EditJobResponse:
    """AI face restoration (GFPGAN v1.4). faces_detected lands on the job result."""
    return _submit("restore-faces", body.source_path,
                   {"strength": body.strength}, background_tasks)


@router.get("/models")
@limiter.limit(LIMITS["default"])
async def list_edit_models(request: Request) -> dict:
    """Per-tool readiness from the Foundry registry (no fake 'loaded' flags)."""
    def ready(record_ids):
        if _resolve_record is None:
            return False
        return all(
            (_resolve_record(record_id) or {}).get("status") == "ready"
            for record_id in record_ids
        )

    return {
        "tools": {
            operation: {"ready": ready(record_ids), "records": record_ids}
            for operation, record_ids in TOOL_RECORDS.items()
        }
    }
```

- [ ] **Step 3: Delete the stub + rewrite its tests.** Delete `backend/services/edit_service.py` and `backend/tests/test_edit_service.py` (its behavior now lives in `edit_tools/` with Tasks 5-9 coverage). Rewrite `backend/tests/test_edit_schemas.py` to assert the new schemas (defaults, bounds: `edge_refinement=101` invalid, `scale=8` invalid, `strength=-1` invalid, `source_path` required). Rewrite `backend/tests/test_edit_api.py`:

```python
"""#34: the edit API as job submitters (fake job manager, patched service)."""
import pathlib
import sys
import time
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

import api.edit as edit_api
from edit_tools.weights import EditModelUnavailable
from utils.job_manager import JobStatus


class FakeJobManager:
    def __init__(self):
        self.jobs = {}

    def add_job(self, job):
        self.jobs[job.id] = job

    def get_job(self, job_id):
        return self.jobs.get(job_id)

    def update_job(self, job_id, **updates):
        job = self.jobs.get(job_id)
        if job is None:
            return
        for key, value in updates.items():
            setattr(job, key, value)


def _make_client(tmp_path, resolve_record=lambda _record_id: {"status": "ready"}):
    app = FastAPI()
    app.include_router(edit_api.router)
    manager = FakeJobManager()
    edit_api.configure(manager, str(tmp_path / "outputs"), str(tmp_path / "models"),
                       resolve_record)
    return TestClient(app), manager


class EditApiTests(unittest.TestCase):
    def setUp(self):
        import tempfile
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.tmp_path = pathlib.Path(self.tmp.name)
        self.source = self.tmp_path / "source.png"
        Image.new("RGB", (8, 8)).save(self.source)

    def _wait_terminal(self, manager, job_id, timeout=5.0):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            job = manager.get_job(job_id)
            if job.status in (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED):
                return job
            time.sleep(0.01)
        self.fail("job never reached a terminal state")

    def test_submit_returns_202_with_a_pending_job(self):
        client, manager = _make_client(self.tmp_path)
        with mock.patch.object(edit_api, "run_edit_operation",
                               return_value={"images": ["/outputs/x/edit.png"]}):
            response = client.post("/api/v1/edit/remove-background",
                                   json={"source_path": str(self.source)})
        self.assertEqual(response.status_code, 202)
        job_id = response.json()["job_id"]
        job = self._wait_terminal(manager, job_id)
        self.assertEqual(job.type, "edit")
        self.assertEqual(job.status, JobStatus.COMPLETED)
        self.assertEqual(job.result["images"], ["/outputs/x/edit.png"])

    def test_params_thread_through_to_the_service(self):
        client, manager = _make_client(self.tmp_path)
        with mock.patch.object(edit_api, "run_edit_operation",
                               return_value={"images": []}) as run:
            response = client.post("/api/v1/edit/upscale", json={
                "source_path": str(self.source), "scale": 4,
                "model": "anime", "face_enhance": True,
            })
        self._wait_terminal(manager, response.json()["job_id"])
        args = run.call_args.args
        self.assertEqual(args[1], "upscale")
        self.assertEqual(args[2]["scale"], 4)
        self.assertEqual(args[2]["model"], "anime")
        self.assertTrue(args[2]["face_enhance"])

    def test_missing_weights_fail_the_job_with_foundry_copy(self):
        client, manager = _make_client(self.tmp_path)
        with mock.patch.object(
                edit_api, "run_edit_operation",
                side_effect=EditModelUnavailable(
                    "The background removal weights are not installed - "
                    "install 'edit-u2net' from the Foundry first.")):
            response = client.post("/api/v1/edit/remove-background",
                                   json={"source_path": str(self.source)})
        job = self._wait_terminal(manager, response.json()["job_id"])
        self.assertEqual(job.status, JobStatus.FAILED)
        self.assertIn("install 'edit-u2net' from the Foundry", job.error)

    def test_missing_source_is_404(self):
        client, _manager = _make_client(self.tmp_path)
        response = client.post("/api/v1/edit/restore-faces",
                               json={"source_path": str(self.tmp_path / "nope.png")})
        self.assertEqual(response.status_code, 404)

    def test_invalid_params_are_422(self):
        client, _manager = _make_client(self.tmp_path)
        self.assertEqual(client.post("/api/v1/edit/upscale", json={
            "source_path": str(self.source), "scale": 8}).status_code, 422)
        self.assertEqual(client.post("/api/v1/edit/restore-faces", json={
            "source_path": str(self.source), "strength": 101}).status_code, 422)

    def test_models_reports_registry_readiness(self):
        ready_ids = {"edit-u2net"}
        client, _manager = _make_client(
            self.tmp_path,
            resolve_record=lambda record_id: {
                "status": "ready" if record_id in ready_ids else "not_found"})
        payload = client.get("/api/v1/edit/models").json()["tools"]
        self.assertTrue(payload["remove-background"]["ready"])
        self.assertFalse(payload["upscale"]["ready"])
        self.assertFalse(payload["restore-faces"]["ready"])


if __name__ == "__main__":
    unittest.main()
```

(TestClient runs BackgroundTasks after the response; `_wait_terminal` tolerates either immediate or slightly-deferred completion.)

- [ ] **Step 4: main.py wiring.** Next to the existing `app.include_router(edit_router)` (~line 408), add the configuration (module scope, after `model_registry`/`job_manager` exist):

```python
edit_api_module.configure(
    job_manager=job_manager,
    output_dir=OUTPUT_DIR,
    models_dir=MODELS_DIR,
    resolve_record=model_registry.get_record,
)
```

Match the actual import style at main.py:100 (if it's `from api.edit import router as edit_router`, add `import api.edit as edit_api_module`). Then DELETE from `main.py`: the `/api/images/upscale` endpoint (lines ~1068-1096), the `ImageUpscaleRequest` schema (~lines 567-569), and the `upscale_image_file` import. DELETE `upscale_image_file` from `backend/utils/image_ops.py`. Grep `upscale_image_file` across `backend/` — update/remove any test referencing it (e.g. in `test_image_ops.py` if present).

- [ ] **Step 5: Run the backend suite**

Run: `backend/venv/Scripts/python.exe -m pytest backend/tests -x -q`
Expected: ALL PASS (the deleted endpoint/service tests are gone; any other suite importing `services.edit_service` or `/api/images/upscale` gets updated in this step).

- [ ] **Step 6: Commit** (`feat(edit): /api/v1/edit as real job submitters, retire stub service + LANCZOS endpoint (#34)`).

---

### Task 11: Electron IPC + preload + shared types

**Files:**
- Modify: `electron/ipc-handlers/generation.ts`, `electron/preload.ts`, `src/types/electron.d.ts`, `src/store/appStore.types.ts`, `src/types/assets.ts`

**Interfaces:**
- Produces: `window.electron.generation.editImage(params) -> {success, jobId?, error?}`; `upscaleImage` GONE from all three surfaces; `GenerationJob.type` and `AssetJobStatus.type` unions include `'edit'`.

- [ ] **Step 1:** In `electron/ipc-handlers/generation.ts`, replace the whole `generation:upscale-image` handler (lines ~590-602) with:

```ts
ipcMain.handle('generation:edit-image', async (_event, params) => {
  try {
    const { operation, ...body } = params ?? {};
    const response = await requestBackend(() =>
      axios.post(`${BACKEND_URL}/api/v1/edit/${operation}`, body, { headers: backendAuthHeaders() }),
    );
    return { success: true, jobId: response.data.job_id };
  } catch (error: any) {
    return {
      success: false,
      error: toSafeRendererError(error, 'Edit operation failed'),
    };
  }
});
```

- [ ] **Step 2:** In `electron/preload.ts`, in the generation section of the api object (~line 412), replace the `upscaleImage` line with `editImage: (params) => ipcRenderer.invoke('generation:edit-image', params),` AND in the file's inline `ElectronAPI` interface (~line 262-265) replace the `upscaleImage` signature with:

```ts
    editImage: (params: {
      operation: string;
      source_path: string;
      edge_refinement?: number;
      scale?: number;
      model?: string;
      face_enhance?: boolean;
      strength?: number;
    }) => Promise<{ success: boolean; jobId?: string; error?: string }>;
```

(BOTH places — preload.ts has its own interface separate from electron.d.ts; missing one is a typecheck failure.)

- [ ] **Step 3:** In `src/types/electron.d.ts` (~line 385-388) replace the `upscaleImage` signature with the strictly-typed version:

```ts
    editImage: (params: {
      operation: 'remove-background' | 'upscale' | 'restore-faces';
      source_path: string;
      edge_refinement?: number;
      scale?: 2 | 4;
      model?: 'general' | 'anime';
      face_enhance?: boolean;
      strength?: number;
    }) => Promise<{ success: boolean; jobId?: string; error?: string }>;
```

- [ ] **Step 4:** Widen the job unions: `src/store/appStore.types.ts` line ~231 `type: 'image' | 'video'` → `type: 'image' | 'video' | 'edit'`; `src/types/assets.ts` line ~25 same widening. Then grep `status.type === 'video'` / `type === 'video'` in `src/features/assets/assetRecords.ts` — confirm the non-video branch produces image asset records (so `'edit'` statuses flow as images); if the logic switches on `=== 'image'` instead, extend it to `('image', 'edit')` and note it in the Task 12 tests.

- [ ] **Step 5: Typecheck** — `export PATH="/c/Program Files/nodejs:$PATH" && npm run typecheck`. `ImagePreviewModal.tsx` now FAILS (it still calls `upscaleImage`) — expected; Task 14 fixes it. If the failure list contains ONLY ImagePreviewModal, proceed; park this commit until Task 14 if the pre-commit hook would block, OR (preferred) do the minimal Task 14 reroute now and commit Tasks 11+14 together. (Decision point: to keep commits green, Tasks 11-14 may land as two commits: 11+12 with a temporary `@ts-expect-error`-free ordering is NOT possible — so implement 11, 12, 13, 14 and commit them as logical units once each unit typechecks: commit A = 11+14 (IPC + modal, both sides of the retirement), commit B = 12 (feature), commit C = 13 (panel).)

---

### Task 12: `runEditTool` feature function + `useEditTool` hook

**Files:**
- Create: `src/features/edit/runEditTool.ts`, `src/features/edit/useEditTool.ts`
- Test: `src/features/edit/runEditTool.test.ts` (node env — no DOM needed)

**Interfaces:**
- Produces: `runEditTool(operation, params, options) -> Promise<{ok, jobId?, error?, notice?}>`; exported messages `EDIT_BACKEND_DOWN_MESSAGE`, `EDIT_POLL_LOST_MESSAGE`, `NO_FACES_NOTICE`; `useEditTool() -> {run, cancel, isRunning, runningOperation, progress, error, notice, clearFeedback}`. Consumed by Tasks 13-14.

- [ ] **Step 1: Failing tests** — `src/features/edit/runEditTool.test.ts`, mirroring the `runStudioGeneration` test conventions (injected fake electron + real store via `useAppStore`, `pollIntervalMs: 0`):

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import {
  EDIT_BACKEND_DOWN_MESSAGE,
  NO_FACES_NOTICE,
  runEditTool,
} from './runEditTool';

function makeElectron(overrides: Record<string, unknown> = {}) {
  return {
    app: { getPath: vi.fn().mockResolvedValue('C:/users/u/AppData/Roaming/vision-studio') },
    settings: { get: vi.fn().mockResolvedValue({ defaultOutputPath: '' }) },
    generation: {
      editImage: vi.fn().mockResolvedValue({ success: true, jobId: 'job-1' }),
      getStatus: vi.fn().mockResolvedValue({
        job_id: 'job-1', status: 'completed', progress: 100, type: 'edit',
        created_at: '2026-07-05T00:00:00Z',
        result: { images: ['/outputs/job-1/edit_upscale.png'] },
      }),
      cancel: vi.fn().mockResolvedValue({ success: true }),
    },
    ...overrides,
  } as any;
}

describe('runEditTool', () => {
  beforeEach(() => {
    useAppStore.setState({
      systemInfo: { ...useAppStore.getState().systemInfo, backendConnected: true },
      activeJobs: [],
      assetLibrary: [],
      currentImage: null,
      currentImageAssetPath: null,
    });
  });

  it('submits, polls to completion, and hands the result to the canvas', async () => {
    const electron = makeElectron();
    const result = await runEditTool('upscale', { source_path: 'C:/img.png', scale: 2 }, {
      electron, pollIntervalMs: 0,
    });
    expect(result.ok).toBe(true);
    expect(electron.generation.editImage).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'upscale', source_path: 'C:/img.png', scale: 2 }),
    );
    const state = useAppStore.getState();
    expect(state.currentImage).toContain('/outputs/job-1/edit_upscale.png');
    expect(state.activeJobs.find((j) => j.id === 'job-1')?.status).toBe('completed');
    expect(state.assetLibrary.length).toBeGreaterThan(0);
  });

  it('refuses when the backend is down', async () => {
    useAppStore.setState({
      systemInfo: { ...useAppStore.getState().systemInfo, backendConnected: false },
    });
    const result = await runEditTool('upscale', { source_path: 'C:/img.png' }, {
      electron: makeElectron(), pollIntervalMs: 0,
    });
    expect(result).toEqual({ ok: false, error: EDIT_BACKEND_DOWN_MESSAGE });
  });

  it('surfaces a failed job error verbatim (Foundry pointer preserved)', async () => {
    const message = "The AI upscale weights are not installed - install 'edit-realesrgan-x4plus' from the Foundry first.";
    const electron = makeElectron();
    electron.generation.getStatus = vi.fn().mockResolvedValue({
      job_id: 'job-1', status: 'failed', progress: 0, error: message,
      created_at: '2026-07-05T00:00:00Z',
    });
    const result = await runEditTool('upscale', { source_path: 'C:/img.png' }, {
      electron, pollIntervalMs: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe(message);
  });

  it('reports the zero-faces notice on restore-faces', async () => {
    const electron = makeElectron();
    electron.generation.getStatus = vi.fn().mockResolvedValue({
      job_id: 'job-1', status: 'completed', progress: 100,
      created_at: '2026-07-05T00:00:00Z',
      result: { images: ['/outputs/job-1/edit_restore-faces.png'], faces_detected: 0 },
    });
    const result = await runEditTool('restore-faces', { source_path: 'C:/img.png' }, {
      electron, pollIntervalMs: 0,
    });
    expect(result.ok).toBe(true);
    expect(result.notice).toBe(NO_FACES_NOTICE);
  });

  it('cancelled jobs resolve silently without an error', async () => {
    const electron = makeElectron();
    electron.generation.getStatus = vi.fn().mockResolvedValue({
      job_id: 'job-1', status: 'cancelled', progress: 10,
      created_at: '2026-07-05T00:00:00Z',
    });
    const result = await runEditTool('upscale', { source_path: 'C:/img.png' }, {
      electron, pollIntervalMs: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run src/features/edit/runEditTool.test.ts` fails (module missing).

- [ ] **Step 3: Implement `src/features/edit/runEditTool.ts`** — structural mirror of `runStudioGeneration.ts` minus the preview-slice writes:

```ts
import type { StoreApi, UseBoundStore } from 'zustand';

import { useAppStore } from '@/store/appStore';
import type { AppState } from '@/store/appStore.types';
import { toPreviewUrl, resolveStoredAssetPath } from '@/features/assets/assetRecords';
import {
  makePollErrorBudget,
  recordPollError,
  recordPollSuccess,
} from '@/features/generation/pollErrorBudget';
import { delay, resolveOutputRoot } from '@/features/workflow/runWorkflowExecution';
import type { JobStatus } from '@/types/electron';

type EditStore = UseBoundStore<StoreApi<AppState>>;

export type EditOperation = 'remove-background' | 'upscale' | 'restore-faces';

export interface EditToolParams {
  source_path: string;
  edge_refinement?: number;
  scale?: 2 | 4;
  model?: 'general' | 'anime';
  face_enhance?: boolean;
  strength?: number;
}

const POLL_INTERVAL_MS = 500;
const POLL_RETRY_MS = 2000;
const POLL_ERROR_CAP = 5;

export const EDIT_BACKEND_DOWN_MESSAGE =
  'The AI backend is not running. Please restart the app or start the backend from Settings.';
export const EDIT_POLL_LOST_MESSAGE =
  'Lost connection to the AI backend while processing. Please retry.';
export const NO_FACES_NOTICE = 'No faces detected - the image is unchanged.';

interface EditToolElectronApi {
  app: { getPath: (name: 'userData') => Promise<string> };
  settings: { get: () => Promise<{ defaultOutputPath: string }> };
  generation: {
    editImage: (params: { operation: EditOperation } & EditToolParams) =>
      Promise<{ success: boolean; jobId?: string; error?: string }>;
    getStatus: (jobId: string) => Promise<JobStatus>;
    cancel: (jobId: string) => Promise<{ success: boolean; error?: string }>;
  };
}

export interface RunEditToolOptions {
  electron?: EditToolElectronApi;
  store?: EditStore;
  pollIntervalMs?: number;
  pollRetryMs?: number;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}

export interface EditToolResult {
  ok: boolean;
  jobId?: string;
  error?: string;
  notice?: string;
}

/**
 * Real edit-tool run (#34): submits one /api/v1/edit job through the preload
 * bridge, polls it like a generation job, and lands the finished frame on
 * the Edit canvas (asset sync + setCurrentImage - the Studio handoff).
 * Failures surface the backend's honest message verbatim, including the
 * "install '<record>' from the Foundry first." pointers; cancels are silent.
 */
export async function runEditTool(
  operation: EditOperation,
  params: EditToolParams,
  {
    electron = window.electron as unknown as EditToolElectronApi,
    store = useAppStore,
    pollIntervalMs = POLL_INTERVAL_MS,
    pollRetryMs = POLL_RETRY_MS,
    signal,
    onProgress,
  }: RunEditToolOptions = {},
): Promise<EditToolResult> {
  const state = store.getState();
  if (!state.systemInfo.backendConnected) {
    return { ok: false, error: EDIT_BACKEND_DOWN_MESSAGE };
  }

  let jobId: string;
  let outputRoot: string;
  try {
    const appSettings = await electron.settings.get();
    const userDataPath = await electron.app.getPath('userData');
    outputRoot = resolveOutputRoot(appSettings.defaultOutputPath, userDataPath);

    const submitted = await electron.generation.editImage({ operation, ...params });
    if (!submitted.success || !submitted.jobId) {
      throw new Error(submitted.error || 'Edit operation failed');
    }
    jobId = submitted.jobId;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Edit operation failed';
    return { ok: false, error: message };
  }

  store.getState().addJob({
    id: jobId,
    type: 'edit',
    status: 'pending',
    progress: 0,
    params: { operation, ...params, output_root: outputRoot, source: 'edit-tool' },
    createdAt: new Date(),
  });

  let budget = makePollErrorBudget(POLL_ERROR_CAP);
  for (;;) {
    if (signal?.aborted) {
      await electron.generation.cancel(jobId).catch(() => undefined);
      store.getState().updateJob(jobId, { status: 'cancelled', completedAt: new Date() });
      return { ok: false, jobId };
    }

    let status: JobStatus;
    try {
      status = await electron.generation.getStatus(jobId);
      if (typeof status?.status !== 'string') {
        throw new Error('Job status unavailable');
      }
      budget = recordPollSuccess(budget);
    } catch {
      const outcome = recordPollError(budget);
      budget = outcome.budget;
      if (outcome.exhausted) {
        store.getState().updateJob(jobId, {
          status: 'failed',
          error: EDIT_POLL_LOST_MESSAGE,
          completedAt: new Date(),
        });
        return { ok: false, jobId, error: EDIT_POLL_LOST_MESSAGE };
      }
      await delay(pollRetryMs, signal).catch(() => undefined);
      continue;
    }

    if (status.status === 'completed') {
      const existingJob = store.getState().activeJobs.find((job) => job.id === jobId);
      store.getState().updateJob(jobId, {
        status: 'completed',
        progress: status.progress ?? 100,
        result: status.result,
        completedAt: status.completed_at ? new Date(status.completed_at) : new Date(),
      });
      store.getState().syncAssetsFromJobStatus({
        ...status,
        params: { ...(existingJob?.params ?? {}), output_root: outputRoot },
      });
      const outputPath = status.result?.images?.[0];
      if (outputPath) {
        const asset = store
          .getState()
          .assetLibrary.find((entry) => entry.id === `${jobId}::${outputPath}`);
        store.getState().setCurrentImage(
          asset?.previewUrl ?? toPreviewUrl(outputPath),
          asset?.path ?? resolveStoredAssetPath(outputPath, { output_root: outputRoot }),
        );
      }
      const facesDetected = status.result?.faces_detected;
      const notice =
        operation === 'restore-faces' && facesDetected === 0 ? NO_FACES_NOTICE : undefined;
      return { ok: true, jobId, notice };
    }

    if (status.status === 'failed' || status.status === 'cancelled') {
      store.getState().updateJob(jobId, {
        status: status.status,
        progress: status.progress ?? 0,
        error: status.error,
        completedAt: status.completed_at ? new Date(status.completed_at) : new Date(),
      });
      if (status.status === 'failed') {
        return { ok: false, jobId, error: status.error || 'Edit operation failed' };
      }
      return { ok: false, jobId };
    }

    store.getState().updateJob(jobId, {
      status: status.status === 'pending' ? 'pending' : 'processing',
      progress: status.progress ?? 0,
    });
    onProgress?.(status.progress ?? 0);
    await delay(pollIntervalMs, signal).catch(() => undefined);
  }
}
```

If `status.result?.faces_detected` trips typecheck (JobStatus result typing), read the `JobStatus` type in `src/types/electron.d.ts` and access via its indexable result bag (`status.result?.['faces_detected']` typed as number | undefined) — match the existing convention.

- [ ] **Step 4: Implement `src/features/edit/useEditTool.ts`** — thin state wrapper:

```ts
import { useCallback, useRef, useState } from 'react';

import {
  runEditTool,
  type EditOperation,
  type EditToolParams,
  type EditToolResult,
} from './runEditTool';

/**
 * Panel-facing lifecycle for one edit-tool run at a time (#34): progress,
 * honest error/notice feedback, and cancel via AbortSignal. Re-entrant run()
 * calls while a job is in flight are no-ops.
 */
export function useEditTool() {
  const [isRunning, setIsRunning] = useState(false);
  const [runningOperation, setRunningOperation] = useState<EditOperation | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (operation: EditOperation, params: EditToolParams): Promise<EditToolResult> => {
      if (abortRef.current) {
        return { ok: false };
      }
      const controller = new AbortController();
      abortRef.current = controller;
      setIsRunning(true);
      setRunningOperation(operation);
      setProgress(0);
      setError(null);
      setNotice(null);
      try {
        const result = await runEditTool(operation, params, {
          signal: controller.signal,
          onProgress: setProgress,
        });
        if (!result.ok && result.error) {
          setError(result.error);
        }
        if (result.notice) {
          setNotice(result.notice);
        }
        return result;
      } finally {
        abortRef.current = null;
        setIsRunning(false);
        setRunningOperation(null);
      }
    },
    [],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearFeedback = useCallback(() => {
    setError(null);
    setNotice(null);
  }, []);

  return { run, cancel, isRunning, runningOperation, progress, error, notice, clearFeedback };
}
```

- [ ] **Step 5: Run to verify pass** (`npx vitest run src/features/edit/runEditTool.test.ts`), then commit per the Task 11 Step 5 ordering (commit B: `feat(edit): runEditTool submit/poll/handoff lifecycle (#34)`).

---

### Task 13: AIToolsPanel — three real tools, zero theater

**Files:**
- Modify: `src/components/edit/AIToolsPanel.tsx`
- Create: `src/components/edit/AIToolsPanel.test.tsx`

- [ ] **Step 1: Failing tests** — `src/components/edit/AIToolsPanel.test.tsx` (jsdom; follow the store-seeding style of existing component tests):

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { AIToolsPanel } from './AIToolsPanel';
import { useAppStore } from '@/store/appStore';

const runMock = vi.fn().mockResolvedValue({ ok: true });
const hookState = {
  run: runMock,
  cancel: vi.fn(),
  isRunning: false,
  runningOperation: null as string | null,
  progress: 0,
  error: null as string | null,
  notice: null as string | null,
  clearFeedback: vi.fn(),
};

vi.mock('@/features/edit/useEditTool', () => ({
  useEditTool: () => hookState,
}));

function seedImage(path: string | null) {
  useAppStore.setState({
    currentImage: path ? 'http://localhost:8000/outputs/x/img.png' : null,
    currentImageAssetPath: path,
  });
}

describe('AIToolsPanel (#34 real tools)', () => {
  beforeEach(() => {
    runMock.mockClear();
    hookState.isRunning = false;
    hookState.error = null;
    hookState.notice = null;
    seedImage('C:/outputs/x/img.png');
  });

  it('contains no fake-processing setTimeout theater', () => {
    const source = readFileSync(
      resolve(__dirname, './AIToolsPanel.tsx'), 'utf-8');
    expect(source).not.toMatch(/setTimeout/);
    expect(source).not.toMatch(/Simulate processing/i);
  });

  it('background removal dispatches the real operation with mapped params', () => {
    render(<AIToolsPanel />);
    fireEvent.click(screen.getByText('Background Removal'));
    fireEvent.click(screen.getByRole('button', { name: /process with background removal/i }));
    expect(runMock).toHaveBeenCalledWith('remove-background', {
      source_path: 'C:/outputs/x/img.png',
      edge_refinement: 50,
    });
  });

  it('upscale maps the face model onto face_enhance', () => {
    render(<AIToolsPanel />);
    fireEvent.click(screen.getByText('AI Upscale'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'face' } });
    fireEvent.click(screen.getByRole('button', { name: /process with ai upscale/i }));
    expect(runMock).toHaveBeenCalledWith('upscale', {
      source_path: 'C:/outputs/x/img.png',
      scale: 2,
      model: 'general',
      face_enhance: true,
    });
  });

  it('face enhancement sends strength and offers no fake eye/skin knobs', () => {
    render(<AIToolsPanel />);
    fireEvent.click(screen.getByText('Face Enhancement'));
    expect(screen.queryByText(/eye enhancement/i)).toBeNull();
    expect(screen.queryByText(/skin smoothing/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /process with face enhancement/i }));
    expect(runMock).toHaveBeenCalledWith('restore-faces', {
      source_path: 'C:/outputs/x/img.png',
      strength: 50,
    });
  });

  it('background removal offers no fake replace-background prompt', () => {
    render(<AIToolsPanel />);
    fireEvent.click(screen.getByText('Background Removal'));
    expect(screen.queryByPlaceholderText(/describe new background/i)).toBeNull();
  });

  it('apply is disabled without an image', () => {
    seedImage(null);
    render(<AIToolsPanel />);
    fireEvent.click(screen.getByText('Background Removal'));
    expect(
      screen.getByRole('button', { name: /process with background removal/i }),
    ).toBeDisabled();
  });

  it('guided tools are gated honestly until PR2', () => {
    render(<AIToolsPanel />);
    fireEvent.click(screen.getByText('Style Transfer'));
    expect(screen.getByRole('button', { name: /process with style transfer/i })).toBeDisabled();
    expect(screen.getAllByText(/ships with the guided-pass update/i).length).toBeGreaterThan(0);
    expect(runMock).not.toHaveBeenCalled();
  });

  it('renders the honest error strip with a Foundry action', () => {
    hookState.error =
      "The AI upscale weights are not installed - install 'edit-realesrgan-x4plus' from the Foundry first.";
    render(<AIToolsPanel />);
    expect(screen.getByTestId('edit-tool-error')).toHaveTextContent(/install 'edit-realesrgan-x4plus'/);
    expect(screen.getByRole('button', { name: /open foundry/i })).toBeInTheDocument();
  });

  it('renders the zero-faces notice as a notice, not an error', () => {
    hookState.notice = 'No faces detected - the image is unchanged.';
    render(<AIToolsPanel />);
    expect(screen.getByTestId('edit-tool-notice')).toHaveTextContent(/no faces detected/i);
    expect(screen.queryByTestId('edit-tool-error')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Rewire `AIToolsPanel.tsx`.** Keep the card/expansion structure, styling, and lucide icons. Changes:

1. Store + hook wiring at the top of the component:

```tsx
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/appStore';
import { isLikelyVideoPath } from '@/components/ui/MediaPreview';
import { useEditTool } from '@/features/edit/useEditTool';

  const { currentImage, currentImageAssetPath, setActiveTab } = useAppStore(
    useShallow((s) => ({
      currentImage: s.currentImage,
      currentImageAssetPath: s.currentImageAssetPath,
      setActiveTab: s.setActiveTab,
    })),
  );
  const { run, isRunning, runningOperation, progress, error, notice, clearFeedback } =
    useEditTool();
  const isVideoSource = isLikelyVideoPath(currentImageAssetPath ?? currentImage);
  const canApply = Boolean(currentImageAssetPath) && !isVideoSource && !isRunning;
```

2. Delete `processingTool` state and `handleApply`'s `setTimeout` block entirely. New dispatch:

```tsx
  const REAL_OPERATIONS: Record<string, () => void> = {
    'bg-removal': () => {
      void run('remove-background', {
        source_path: currentImageAssetPath!,
        edge_refinement: edgeRefinement,
      });
    },
    upscale: () => {
      void run('upscale', {
        source_path: currentImageAssetPath!,
        scale: upscaleFactor,
        model: upscaleModel === 'anime' ? 'anime' : 'general',
        face_enhance: upscaleModel === 'face',
      });
    },
    'face-enhance': () => {
      void run('restore-faces', {
        source_path: currentImageAssetPath!,
        strength: faceStrength,
      });
    },
  };

  const handleApply = (toolId: string) => {
    if (!canApply) return;
    REAL_OPERATIONS[toolId]?.();
  };
```

3. Delete the fake knobs: the whole "Replace Background" block (bg-removal), the Eye Enhancement `Switch` row and Skin Smoothing `Slider` (face-enhance) — and their now-unused state (`bgReplacePrompt`, `eyeEnhance`, `skinSmoothing`) and imports (`Switch` if unused).
4. `isProcessing` per card becomes `isRunning && runningOperation === OPERATION_BY_TOOL[tool.id]` where `OPERATION_BY_TOOL = {'bg-removal': 'remove-background', upscale: 'upscale', 'face-enhance': 'restore-faces'}`. The three real Apply buttons get `disabled={!canApply}` and show `progress` while running (e.g. append `{isProcessing && progress > 0 ? \` \${Math.round(progress)}%\` : ''}` to the label).
5. Guided tools (`style-transfer`, `gen-fill`, `object-removal`, `outpaint`): keep the config UI; their Apply buttons become `disabled` with a caption underneath each:

```tsx
<p className="type-caption text-text-muted">Ships with the guided-pass update.</p>
```

6. Feedback strips above the tool list (after the header), status-error tokens for error, muted for notice:

```tsx
      {error && (
        <div
          data-testid="edit-tool-error"
          className="flex items-start gap-2 rounded-sm border border-status-error/30 bg-status-error/10 px-3 py-2"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-status-error" />
          <p className="flex-1 text-xs text-status-error">{error}</p>
          {/install .* from the Foundry/i.test(error) && (
            <button
              onClick={() => setActiveTab('foundry')}
              className="text-xs font-medium text-status-error underline underline-offset-2"
              aria-label="Open Foundry"
            >
              Open Foundry
            </button>
          )}
          <button onClick={clearFeedback} aria-label="Dismiss error">
            <X className="h-3.5 w-3.5 text-status-error" />
          </button>
        </div>
      )}
      {notice && !error && (
        <div
          data-testid="edit-tool-notice"
          className="flex items-start gap-2 rounded-sm border border-border bg-elevated px-3 py-2"
        >
          <p className="flex-1 text-xs text-text-body">{notice}</p>
          <button onClick={clearFeedback} aria-label="Dismiss notice">
            <X className="h-3.5 w-3.5 text-text-muted" />
          </button>
        </div>
      )}
```

(import `AlertCircle`, `X` from lucide-react; verify the exact status-error token names against `src/index.css` / existing error strips like CompositionPreview's `studio-preview-error` and match them.)

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/components/edit/AIToolsPanel.test.tsx`, then commit (commit C: `feat(edit): AIToolsPanel drives the real edit jobs - theater deleted (#34)`).

---

### Task 14: ImagePreviewModal — real upscale reroute

**Files:**
- Modify: `src/components/shared/ImagePreviewModal.tsx`
- Test: extend `src/components/shared/ImagePreviewModal.test.tsx` if it exists (Glob for it), else create with just the upscale cases.

- [ ] **Step 1:** Replace `handleUpscale` (lines ~194-225): mount `useEditTool()` in the component; new body:

```tsx
  const editTool = useEditTool();

  const handleUpscale = async () => {
    if (!result?.assetPath || editTool.isRunning) {
      return;
    }
    const outcome = await editTool.run('upscale', {
      source_path: result.assetPath,
      scale: 2,
      model: 'general',
    });
    if (!outcome.ok) {
      return; // editTool.error carries the honest message (rendered below)
    }
    setActiveTab('canvas');
    useAppStore.getState().setActiveSubMode(null);
    onClose();
  };
```

(The completion handoff — asset sync + `setCurrentImage` — now happens inside `runEditTool`; delete the modal's manual `upsertDerivedAsset`/`setCurrentImage` upscale block and any now-unused imports.) The Upscale button: show progress while `editTool.isRunning && editTool.runningOperation === 'upscale'`, disable during the run; render `editTool.error` near the button with the same status-error treatment as Task 13 (`data-testid="modal-upscale-error"`).

- [ ] **Step 2: Tests** — dispatch assertion (`editImage`-backed hook mocked exactly like Task 13), disabled-while-running, error rendering. Run the file.

- [ ] **Step 3: Full typecheck now green** — `npm run typecheck` passes (the Task 11 retirement is fully consumed). Commit A lands here if Task 11's ordering was followed: stage `electron/ipc-handlers/generation.ts electron/preload.ts src/types/electron.d.ts src/store/appStore.types.ts src/types/assets.ts src/components/shared/ImagePreviewModal.tsx` (+ its test) as `feat(edit): edit-image IPC, retire the LANCZOS upscale path end-to-end (#34)`.

---

### Task 15: Model picker allowlist + github source ripple

**Files:**
- Modify: `src/store/slices/modelsSlice.ts`, `src/types/model.ts`
- Test: extend `src/store/slices/modelsSlice.test.ts`

- [ ] **Step 1: Failing test** (in `modelsSlice.test.ts`, using its existing record builder):

```ts
describe('selectModelsByCapability artifact-type allowlist (#34)', () => {
  it('keeps auxiliary records out of the generation pickers', () => {
    const models = [
      rec({ id: 'sd-1-5', artifact_type: 'checkpoint', capability: 'image' }),
      rec({ id: 'pipeline', artifact_type: 'diffusers-pipeline', capability: 'image' }),
      rec({ id: 'controlnet-canny-sd15', artifact_type: 'controlnet', capability: 'image' }),
      rec({ id: 'annotator-midas', artifact_type: 'annotator', capability: 'image' }),
      rec({ id: 'some-lora', artifact_type: 'lora', capability: 'image' }),
      rec({ id: 'edit-u2net', artifact_type: 'edit-model', capability: 'edit' }),
    ];
    expect(selectModelsByCapability(models, 'image').map((m) => m.id)).toEqual([
      'sd-1-5',
      'pipeline',
    ]);
  });
});
```

(Adapt `rec` to the file's actual builder name/shape.)

- [ ] **Step 2:** Implement in `modelsSlice.ts`:

```ts
// Only records a generation pipeline can actually load belong in the model
// pickers. Auxiliary records (loras, controlnets, annotators, ip-adapters,
// edit-model weights) are capability-tagged too, but they are not
// checkpoints - listing them was a pre-existing leak fixed in #34.
const SELECTABLE_ARTIFACT_TYPES = new Set(['checkpoint', 'diffusers-pipeline']);

export function selectModelsByCapability(
  models: ModelRecord[],
  generationType: 'image' | 'video',
): ModelRecord[] {
  const wanted: ModelCapability[] =
    generationType === 'video' ? ['video'] : ['image', 'edit', 'inpaint'];
  return models.filter(
    (model) =>
      SELECTABLE_ARTIFACT_TYPES.has(model.artifact_type) &&
      wanted.includes(model.capability),
  );
}
```

- [ ] **Step 3:** `src/types/model.ts` line ~38: `source: 'huggingface' | 'civitai' | 'local' | 'linked' | 'github';`. Then grep `source ===` and source-label maps under `src/components/foundry/` — wherever source badges/labels render (e.g. a `{hf: ..., civitai: ...}` record), add a `github: 'GitHub'` entry so the six records render an honest origin badge. If labels fall through to raw strings, no change needed — note which in the commit body.

- [ ] **Step 4:** Run `npx vitest run src/store/slices/modelsSlice.test.ts src/components/generate/ModelSelector.test.tsx src/pages/GeneratePanel.test.tsx` — fix any test that seeded auxiliary records and asserted they appear in a picker (they were asserting the leak; align them with the honest behavior). Commit (`fix(models): picker allowlist - auxiliary records out of generation pickers (#34)`).

---

### Task 16: Full gates, live install, real-weight acceptance smokes

**Files:**
- Create: `backend/tests/test_edit_tools_smoke_local.py`

- [ ] **Step 1: Full local gates**

```bash
cd /c/vision-studio/backend && venv/Scripts/python.exe -m pytest tests -q ; echo "EXIT:$?"
export PATH="/c/Program Files/nodejs:$PATH" && cd /c/vision-studio && npm run typecheck && npm test && npm run build
```

All green before proceeding.

- [ ] **Step 2: Live Foundry install through the REAL consent flow** (the #65 procedure). Start the backend (`venv/Scripts/python.exe -m uvicorn main:app --port 8000` with the same `MODELS_DIR`/auth env the app uses), then via authenticated HTTP: grant pickle consent for the five `.pth` records (`POST /api/models/consent` with `{"model_id": ..., "kind": "pickle", "grant": true}` — match `ConsentRequestSchema`'s actual field names in main.py), `POST /api/models/edit-u2net/download`, `POST /api/models/edit-realesrgan-x4plus/download`, `POST /api/models/edit-realesrgan-x4plus-anime/download`, `POST /api/models/edit-gfpgan-v14/download` (companions auto-enqueue), poll `GET /api/models/downloads` until every job is ready. Verify: `GET /api/models` shows all six records `status: "ready"` WITHOUT restarting the backend (this validates the Task 3 self-heal live), files exist under `<models>/edit-model/<id>/`, and a consent-DENIED download attempt on a pickle record 403s with `pickle-consent-required` (revoke one, attempt, re-grant).

- [ ] **Step 3: Write the acceptance smokes** — `backend/tests/test_edit_tools_smoke_local.py`, gated exactly like `test_step_preview_smoke_local.py` (copy its `VS_REAL_SMOKE`/`VS_MODELS_DIR` gating and SD1.5 generation harness):

```python
"""#34 acceptance: real-weight edit-tool smokes (VS_REAL_SMOKE=1 only).

Requires: onnxruntime/spandrel/facexlib importable, the six edit-model
records installed under VS_MODELS_DIR, and the SD1.5 record for the source
images. Generates a subject image and a portrait with the real pipeline,
then asserts each tool does real work - not identity passthrough.
"""
import os
import pathlib
import sys
import unittest

import numpy as np
from PIL import Image

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

RUN_REAL = os.environ.get("VS_REAL_SMOKE") == "1"
MODELS_DIR = os.environ.get("VS_MODELS_DIR", "")


def _weights(record_id, ext):
    return os.path.join(MODELS_DIR, "edit-model", record_id, f"{record_id}{ext}")


def _have(record_id, ext):
    return os.path.isfile(_weights(record_id, ext))


def _laplacian_variance(image):
    gray = np.asarray(image.convert("L"), dtype=np.float32)
    lap = (
        -4 * gray
        + np.roll(gray, 1, 0) + np.roll(gray, -1, 0)
        + np.roll(gray, 1, 1) + np.roll(gray, -1, 1)
    )
    return float(lap.var())


@unittest.skipUnless(RUN_REAL, "VS_REAL_SMOKE=1 required")
class EditToolSmokeTests(unittest.TestCase):
    # In setUpClass: generate (once) a 512px "product photo of a single red
    # apple on a white table, centered" and a 512px "portrait photo of a
    # person's face, looking at the camera" via the same direct_generator
    # harness test_step_preview_smoke_local.py uses (copy its setup verbatim,
    # including the sd-1-5 skip guard), saving both under a class tmp dir.

    @unittest.skipUnless(_have("edit-u2net", ".onnx"), "edit-u2net not installed")
    def test_background_removal_produces_a_real_cutout(self):
        from edit_tools.background import remove_background
        result = remove_background(self.subject_image, 50,
                                   model_path=_weights("edit-u2net", ".onnx"))
        alpha = np.asarray(result.split()[-1], dtype=np.float32)
        height, width = alpha.shape
        center = alpha[height // 3: 2 * height // 3, width // 3: 2 * width // 3]
        corners = np.concatenate([
            alpha[:20, :20].ravel(), alpha[:20, -20:].ravel(),
            alpha[-20:, :20].ravel(), alpha[-20:, -20:].ravel(),
        ])
        self.assertGreater(float(center.mean()), 180.0)   # subject kept
        self.assertLess(float(corners.mean()), 60.0)       # background removed
        rgb_in = np.asarray(self.subject_image.convert("RGB"))
        rgb_out = np.asarray(result.convert("RGB"))
        np.testing.assert_array_equal(rgb_in, rgb_out)      # pixels untouched

    @unittest.skipUnless(_have("edit-realesrgan-x4plus", ".ckpt"), "x4plus not installed")
    def test_upscale_beats_the_lanczos_baseline(self):
        from edit_tools.upscale import upscale
        result = upscale(self.subject_image, 4,
                         model_path=_weights("edit-realesrgan-x4plus", ".ckpt"))
        self.assertEqual(result.size,
                         (self.subject_image.width * 4, self.subject_image.height * 4))
        baseline = self.subject_image.resize(result.size, Image.Resampling.LANCZOS)
        self.assertGreater(_laplacian_variance(result), _laplacian_variance(baseline))

    @unittest.skipUnless(
        _have("edit-gfpgan-v14", ".ckpt") and _have("edit-face-detection", ".ckpt")
        and _have("edit-face-parsing", ".ckpt"), "gfpgan stack not installed")
    def test_face_restore_detects_and_changes_a_real_face(self):
        from edit_tools.faces import restore_faces
        result, faces = restore_faces(
            self.portrait_image, 80,
            gfpgan_path=_weights("edit-gfpgan-v14", ".ckpt"),
            detection_path=_weights("edit-face-detection", ".ckpt"),
            parsing_path=_weights("edit-face-parsing", ".ckpt"))
        self.assertGreaterEqual(faces, 1)
        diff = np.abs(
            np.asarray(result, dtype=np.int16)
            - np.asarray(self.portrait_image.convert("RGB"), dtype=np.int16))
        self.assertGreater(float(diff.mean()), 0.5)  # measurably restored

    def test_face_restore_is_honest_about_zero_faces(self):
        if not (_have("edit-gfpgan-v14", ".ckpt") and _have("edit-face-detection", ".ckpt")
                and _have("edit-face-parsing", ".ckpt")):
            self.skipTest("gfpgan stack not installed")
        from edit_tools.faces import restore_faces
        result, faces = restore_faces(
            self.subject_image, 80,
            gfpgan_path=_weights("edit-gfpgan-v14", ".ckpt"),
            detection_path=_weights("edit-face-detection", ".ckpt"),
            parsing_path=_weights("edit-face-parsing", ".ckpt"))
        self.assertEqual(faces, 0)
        np.testing.assert_array_equal(
            np.asarray(result), np.asarray(self.subject_image.convert("RGB")))


if __name__ == "__main__":
    unittest.main()
```

(Fill the `setUpClass` generation harness from the step-preview smoke file — same model guard, same output temp handling. If the apple image's saliency corners land above 60 because SD put texture there, tighten the prompt, not the assertion.)

- [ ] **Step 4: Run the smokes**

```bash
cd /c/vision-studio/backend && VS_REAL_SMOKE=1 VS_MODELS_DIR="<the models dir>" venv/Scripts/python.exe -m pytest tests/test_edit_tools_smoke_local.py -v -s ; echo "EXIT:$?"
```

Expected: all real assertions PASS (multi-minute run on CPU — the tiled 512→2048 upscale dominates). Iterate on any real-model wiring surprises (facexlib constructor drift, spandrel GFPGAN input expectations) HERE, updating Tasks 7/8 modules + their unit tests to match reality.

- [ ] **Step 5: Re-run the FULL gates** (Step 1 commands verbatim) — everything green including the new smoke file being skipped without `VS_REAL_SMOKE`.

- [ ] **Step 6: Commit** (`test(edit): real-weight acceptance smokes for the three edit tools (#34)`), then push and open the PR per the release process (PAUSE for merge approval after CI).

---

## Self-Review Notes

- Spec coverage: §4.2→Task 1, §4.3→Task 2, presence/self-heal (§4.2/§4.4 implications)→Task 3, §4.1/§8→Task 4, §4.4→Tasks 5-9, §4.5→Task 10, §4.6→Tasks 11-14, §4.7→Task 15, §4.8→Task 1, §6 error copy→Tasks 5/9/10/12/13, §7→every task + Task 16. PR2 (§5) is deliberately not in this plan.
- Progress convention between service (`progress_cb(done, total)`) and API (`done*100/max(total,1)`) is pinned by Task 9's split-budget helpers and Task 10's `_process` — keep both sides if either changes.
- Type names used across tasks: `EditModelUnavailable`/`EditToolError`/`EditCancelled` (Task 5) consumed verbatim in Tasks 6-10; `EditOperation`/`EditToolParams` (Task 12) consumed in Tasks 13-14.
