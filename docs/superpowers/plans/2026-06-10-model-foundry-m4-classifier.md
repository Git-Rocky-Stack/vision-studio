# Model Foundry M4 - Search + Classifier + Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hub search across HF + CivitAI with the tri-tier compatibility classifier (Verified/Compatible/Experimental, every verdict carrying a one-line `tier_reason`), and the security rails: `trust_remote_code` deny-by-default, pickle-only-with-consent + convert-to-safetensors, CivitAI NSFW filtered by default.

**Architecture:** A pure, corpus-tested classification core (`hub_signals.py` parses metadata into `RepoSignals`; `classifier.py` applies the Spike C precedence ladder) consumed by three feeds: HF search (`hub_search.py` via `HfApi.list_models`), CivitAI search (`civitai_search.py` via REST with cache-the-failure offline degrade), and the M3 indexer (post-index tier reconciliation). Search results register as a transient registry layer so `get`/`download` work on them; a `ConsentStore` (same hardening pattern as `RootsStore`) gates pickle and remote-code acquisition at the download route. Frontend gets slice + IPC + types; panel composition is the design agent's pass (same split as M3, spec section 7.3).

**Tech Stack:** Python 3.12 / FastAPI / `huggingface_hub` 1.10.1 (lazy import) / `requests` (CivitAI) / safetensors+torch (lazy, convert only); Electron IPC (axios, `backendAuthHeaders` pattern); React 19 + Zustand.

**Ground rules (non-negotiable, from project history):**
- ALL backend tests are `unittest.TestCase` subclasses (CI runs `python -m unittest discover` which silently skips bare pytest functions). `tests/conftest.py` auto-tags `test_*_api.py` as integration.
- No torch / no network at import time or in tests. `HfApi`, `requests`, and torch are always mocked or lazily imported. `scan_hf_cache` is ALWAYS mocked in service tests.
- Routes: literal paths BEFORE dynamic `{model_id}` paths in `main.py`. Every route gets `@limiter.limit` (60/min reads, 30/min mutations, 5/min heavy).
- Tokens arrive per-request in headers (`X-HF-Token`, new `X-Civitai-Token`), passed as local params, never stored or logged in Python.
- The Spike C corpus (`backend/tests/fixtures/classifier_corpus/`) is the regression gate: **false-Compatible = 0 is an asserted invariant**.
- Keep `docs/API_ENDPOINTS.md` + `docs/api/openapi.json` (BOTH hand-curated - never regenerate) in sync in the same PR.
- Frontend slice actions follow the existing local-first pattern in `modelsSlice.ts`; IPC channel names mirrored between `electron/preload.ts` and `electron/ipc-handlers/generation.ts`.

**Spike C inputs honored throughout** (`docs/superpowers/spikes/2026-06-10-classifier-confidence.md`): positive-signal-or-Experimental ladder; gated repos classify from tags; tree-scoped safetensors; "Compatible" bounded by load paths that exist today (no `from_single_file` in the app -> single-file checkpoints stay Experimental with an honest reason until M5; standalone loras ARE Compatible via `load_lora_weights`); kohya-before-DiT key ordering; `unavailable` as a distinct outcome; CivitAI vocabulary mapping + `PickleTensor` detection + sha256 verification + mandatory timeout/backoff.

---

## File structure

```
backend/foundry/hub_signals.py          NEW   RepoSignals + pure parsers (fixture / model_info / listing) + network fetch
backend/foundry/classifier.py           NEW   TierVerdict + classify_repo ladder + indexed_tier + family helpers
backend/foundry/hub_search.py           NEW   HF search via HfApi.list_models -> classified SearchResult list
backend/foundry/civitai_search.py       NEW   CivitAI REST search: NSFW-off default, vocab map, format/hashes
backend/foundry/security_policy.py      NEW   ConsentStore (atomic, corrupt-tolerant, audited)
backend/foundry/convert.py              NEW   pickle -> safetensors (lazy torch, weights_only=True)
backend/foundry/model_record.py         MOD   + tier_reason, format, trust_remote_code, nsfw, download_url, sha256
backend/foundry/schemas.py              MOD   + same fields; + SearchResultSchema, SearchResponseSchema, ConsentSchema, ConvertResultSchema
backend/foundry/safetensors_header.py   MOD   + controlnet_cond_embedding pattern, + XLabs lora pattern
backend/foundry/registry.py             MOD   + transient search layer (get/download-able, not listed)
backend/foundry/index_service.py        MOD   artifact_to_record gains classifier-driven tier + tier_reason
backend/foundry/download_manager.py     MOD   + CivitAI direct-URL branch (stream -> sha256 verify -> atomic move)
backend/main.py                         MOD   + GET /api/models/search, POST /api/models/consent,
                                              POST /api/models/{id}/convert-safetensors, consent enforcement on download
electron/services/backendAuth.ts        MOD   + setCivitaiToken / civitaiTokenHeaders
electron/main.ts                        MOD   + auth:setCivitaiToken handler
electron/ipc-handlers/generation.ts     MOD   + models:search, models:consent, models:convert handlers
electron/preload.ts                     MOD   + models.search/consent/convert, auth.setCivitaiToken
src/types/electron.d.ts                 MOD   + the 4 new methods
src/types/model.ts                      MOD   + tier_reason etc. on ModelRecord; SearchResult, SearchResponse, ConsentKind
src/store/slices/modelsSlice.ts         MOD   + search state/actions, consent, convert, nsfwOptIn
src/store/appStore.types.ts             MOD   + new slice fields
backend/tests/test_foundry_hub_signals.py        NEW
backend/tests/test_foundry_classifier.py         NEW
backend/tests/test_foundry_classifier_corpus.py  NEW   (the 41-fixture regression gate)
backend/tests/test_foundry_hub_search.py         NEW
backend/tests/test_foundry_civitai_search.py     NEW
backend/tests/test_foundry_security_policy.py    NEW
backend/tests/test_foundry_convert.py            NEW
backend/tests/test_foundry_search_api.py         NEW   (integration; TestClient)
backend/tests/test_foundry_consent_api.py        NEW   (integration)
backend/tests/test_foundry_civitai_download.py   NEW
backend/tests/test_foundry_safetensors_header.py MOD   (new pattern cases from corpus detection_keys)
backend/tests/test_foundry_index_service.py      MOD   (tier reconciliation cases)
src/store/slices/librarySelectors.test.ts        MOD   (search/consent selector cases)
tests/integration/api-contracts.test.ts          MOD   (SearchResult/SearchResponse contracts)
docs/API_ENDPOINTS.md, docs/api/openapi.json     MOD   (hand-curated additions)
```

Execution branch: `feat/model-foundry-m4`.

---

### Task 1: Record + schema + TS field plumbing (`tier_reason`, `format`, `trust_remote_code`, `nsfw`, `download_url`, `sha256`)

**Files:**
- Modify: `backend/foundry/model_record.py`
- Modify: `backend/foundry/schemas.py`
- Modify: `src/types/model.ts`
- Test: `backend/tests/test_foundry_model_record.py` (extend existing)
- Test: `tests/integration/api-contracts.test.ts` (extend existing)

- [ ] **Step 1: Write the failing test**

Append to the existing test class in `backend/tests/test_foundry_model_record.py`:

```python
    def test_m4_fields_default_and_serialize(self):
        record = ModelRecord(
            id="x", name="X", artifact_type="checkpoint", capability="image",
            base_architecture="sdxl", source="huggingface",
        )
        data = record.to_dict()
        self.assertIsNone(data["tier_reason"])
        self.assertIsNone(data["format"])
        self.assertFalse(data["trust_remote_code"])
        self.assertFalse(data["nsfw"])
        self.assertIsNone(data["download_url"])
        self.assertIsNone(data["sha256"])

    def test_m4_fields_round_trip(self):
        record = ModelRecord(
            id="x", name="X", artifact_type="lora", capability="image",
            base_architecture="sdxl", source="civitai",
            tier="compatible", tier_reason="standalone sdxl lora - safetensors",
            format="safetensors", nsfw=False,
            download_url="https://civitai.com/api/download/models/1",
            sha256="ab" * 32,
        )
        data = record.to_dict()
        self.assertEqual(data["tier_reason"], "standalone sdxl lora - safetensors")
        self.assertEqual(data["format"], "safetensors")
        self.assertEqual(data["sha256"], "ab" * 32)
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd backend && venv/Scripts/python.exe -m pytest tests/test_foundry_model_record.py -q`
Expected: FAIL with `TypeError: ... unexpected keyword argument 'tier_reason'` / KeyError.

- [ ] **Step 3: Implement**

In `backend/foundry/model_record.py`, after the M3 location block inside `ModelRecord`, add:

```python
    # Classification + security (M4)
    tier_reason: Optional[str] = None       # one-line "why this tier" (spec 5.2)
    format: Optional[str] = None            # safetensors | pickle | diffusers
    trust_remote_code: bool = False         # repo requires running its own code
    nsfw: bool = False                      # CivitAI channel; HF results always False

    # Acquisition provenance (CivitAI direct-URL path, M4)
    download_url: Optional[str] = None
    sha256: Optional[str] = None
```

In `backend/foundry/schemas.py`, mirror on `ModelRecordSchema` (after `library_root_id`):

```python
    tier_reason: Optional[str] = None
    format: Optional[str] = None
    trust_remote_code: bool = False
    nsfw: bool = False
    download_url: Optional[str] = None
    sha256: Optional[str] = None
```

In `src/types/model.ts`, inside `ModelRecord` after the M3 optional block:

```typescript
  // M4 classification + security fields (absent on older payloads):
  tier_reason?: string | null;
  format?: 'safetensors' | 'pickle' | 'diffusers' | null;
  trust_remote_code?: boolean;
  nsfw?: boolean;
  download_url?: string | null;
  sha256?: string | null;
```

- [ ] **Step 4: Extend the frontend contract test**

In `tests/integration/api-contracts.test.ts`, find the ModelRecord contract case and add a record literal carrying all six new fields typed as `ModelRecord` (compile-time contract). Follow the file's existing pattern exactly.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && venv/Scripts/python.exe -m pytest tests/test_foundry_model_record.py tests/test_foundry_registry.py -q`
Expected: PASS.
Run: `npm run typecheck && npx vitest run tests/integration/api-contracts.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/foundry/model_record.py backend/foundry/schemas.py src/types/model.ts backend/tests/test_foundry_model_record.py tests/integration/api-contracts.test.ts
git commit -m "feat(foundry): add M4 classification + provenance fields to ModelRecord"
```

---

### Task 2: Header pattern additions (diffusers-layout controlnet, XLabs flux lora)

Spike C gaps 11: real diffusers-layout controlnets (`controlnet_cond_embedding`) and XLabs loras (`*_lora{1,2}.{down,up}` under `double_blocks.`/`single_blocks.`) currently classify `unknown`.

**Files:**
- Modify: `backend/foundry/safetensors_header.py`
- Test: `backend/tests/test_foundry_safetensors_header.py`

- [ ] **Step 1: Write the failing tests** (cases drawn from corpus `detection_keys` - cite the fixture in a comment)

Add to the `cases` table in `test_table_driven_classification`:

```python
            # Spike C gap: diffusers-layout controlnet (lllyasviel--sd-controlnet-canny fixture)
            ({"controlnet_cond_embedding.conv_in.weight": [4, 4], "down_blocks.0.attentions.0.proj_in.weight": [4, 4]}, "controlnet"),
            # Spike C gap: XLabs flux lora (XLabs-AI--flux-RealismLora fixture)
            ({"double_blocks.0.processor.qkv_lora1.down.weight": [4, 4], "double_blocks.0.processor.proj_lora1.up.weight": [4, 4]}, "lora"),
            ({"single_blocks.1.processor.qkv_lora.down.weight": [4, 4]}, "lora"),
```

- [ ] **Step 2: Run to verify red**

Run: `cd backend && venv/Scripts/python.exe -m pytest tests/test_foundry_safetensors_header.py -q`
Expected: 3 SUBFAILED.

- [ ] **Step 3: Implement** - in `classify_safetensors`, extend the lora predicate and add the controlnet pattern:

```python
def classify_safetensors(header: Dict[str, Any]) -> str:
    """checkpoint | lora | vae | controlnet | unknown — from tensor-key patterns."""
    keys = [key for key in header if key != "__metadata__"]
    if any(
        key.startswith(("lora_unet_", "lora_te_")) or ".lora_down." in key or ".lora_up." in key
        # XLabs flux format: double_blocks.N.processor.qkv_lora1.down.weight (Spike C)
        or ("_lora" in key and ("double_blocks." in key or "single_blocks." in key))
        for key in keys
    ):
        return "lora"
    if any(key.startswith("model.diffusion_model.") for key in keys):
        return "checkpoint"
    if any(
        key.startswith(("control_model.", "input_hint_block."))
        # diffusers-layout controlnet (Spike C, measured on real controlnet repos)
        or "controlnet_cond_embedding" in key
        for key in keys
    ):
        return "controlnet"
```

(vae block and the rest unchanged.)

- [ ] **Step 4: Verify green + neighbors**

Run: `cd backend && venv/Scripts/python.exe -m pytest tests/test_foundry_safetensors_header.py tests/test_foundry_indexer.py -q`
Expected: PASS, no regressions.

- [ ] **Step 5: Commit**

```bash
git add backend/foundry/safetensors_header.py backend/tests/test_foundry_safetensors_header.py
git commit -m "feat(foundry): detect diffusers-layout controlnets and XLabs flux loras in headers"
```

---

### Task 3: `hub_signals.py` - RepoSignals + pure parsers

**Files:**
- Create: `backend/foundry/hub_signals.py`
- Test: `backend/tests/test_foundry_hub_signals.py`

- [ ] **Step 1: Write the failing tests**

```python
"""RepoSignals parsing - pure, no network. Fixture-driven where possible."""

import json
import unittest
from pathlib import Path

from foundry.hub_signals import (
    RepoSignals,
    signals_from_fixture,
    signals_from_listing,
)

CORPUS = Path(__file__).parent / "fixtures" / "classifier_corpus"


class FixtureParsingTests(unittest.TestCase):
    def _load(self, name):
        return json.loads((CORPUS / name).read_text(encoding="utf-8"))

    def test_gated_repo_class_from_diffusers_tag(self):
        sig = signals_from_fixture(self._load("black-forest-labs--FLUX.1-dev.json"))
        self.assertEqual(sig.class_name, "FluxPipeline")
        self.assertTrue(sig.gated)
        self.assertTrue(sig.reachable)

    def test_model_index_class_beats_tag(self):
        fixture = self._load("Qwen--Qwen-Image.json")
        sig = signals_from_fixture(fixture)
        self.assertEqual(sig.class_name, "QwenImagePipeline")

    def test_unreachable_fixture(self):
        sig = signals_from_fixture(self._load("stabilityai--stable-diffusion-2-1.json"))
        self.assertFalse(sig.reachable)
        self.assertEqual(sig.repo_id, "stabilityai/stable-diffusion-2-1")

    def test_remote_code_signals(self):
        sig = signals_from_fixture(self._load("THUDM--chatglm3-6b.json"))
        self.assertTrue(sig.has_auto_map)
        self.assertGreater(sig.py_file_count, 0)

    def test_none_library_tolerated(self):
        sig = signals_from_fixture(self._load("tencent--HunyuanVideo.json"))
        self.assertIsNone(sig.library_name)

    def test_per_file_keys_present_for_lora_repo(self):
        sig = signals_from_fixture(self._load("latent-consistency--lcm-lora-sdxl.json"))
        keys = sig.per_file_keys["pytorch_lora_weights.safetensors"]
        self.assertTrue(any(k.startswith("lora_unet_") for k in keys))


class ListingParsingTests(unittest.TestCase):
    def test_listing_minimal(self):
        sig = signals_from_listing(
            {
                "id": "stabilityai/sdxl-turbo",
                "library_name": "diffusers",
                "pipeline_tag": "text-to-image",
                "tags": ["diffusers:StableDiffusionXLPipeline", "safetensors"],
                "gated": False,
                "downloads": 100,
                "author": "stabilityai",
            }
        )
        self.assertEqual(sig.class_name, "StableDiffusionXLPipeline")
        self.assertTrue(sig.partial)  # listing carries no file census

    def test_listing_missing_everything(self):
        sig = signals_from_listing({"id": "x/y"})
        self.assertIsNone(sig.class_name)
        self.assertEqual(sig.tags, [])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify red**

Run: `cd backend && venv/Scripts/python.exe -m pytest tests/test_foundry_hub_signals.py -q`
Expected: FAIL `ModuleNotFoundError: foundry.hub_signals`.

- [ ] **Step 3: Implement `backend/foundry/hub_signals.py`**

```python
"""RepoSignals - everything the tier classifier consumes, parsed pre-download.

Pure parsing only; network fetch lives in fetch_repo_signals (lazy hub import,
always mocked in tests). Fixture parsing mirrors the Spike C corpus schema so
the corpus is the regression gate for this module too.
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Union


@dataclass
class RepoSignals:
    repo_id: str
    reachable: bool = True
    gated: Union[bool, str] = False          # False | "auto" | "manual"
    library_name: Optional[str] = None
    pipeline_tag: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    class_name: Optional[str] = None         # model_index > diffusers:<Class> tag > config
    has_auto_map: bool = False
    py_file_count: int = 0
    siblings: List[str] = field(default_factory=list)
    has_safetensors: bool = False
    per_file_keys: Dict[str, List[str]] = field(default_factory=dict)
    downloads: int = 0
    author: Optional[str] = None
    license: Optional[str] = None
    partial: bool = False                    # listing-level: no file census available


def _class_name(model_index: Optional[dict], tags: List[str], config: Optional[dict]) -> Optional[str]:
    if model_index and model_index.get("_class_name"):
        return model_index["_class_name"]
    for tag in tags:
        if tag.startswith("diffusers:"):
            return tag.split(":", 1)[1]
    if config and config.get("_class_name"):
        return config["_class_name"]
    return None


def signals_from_fixture(fixture: Dict[str, Any]) -> RepoSignals:
    """Parse a Spike C corpus fixture (see classifier_corpus/README.md schema)."""
    repo_id = fixture["repo_id"]
    if not fixture.get("reachable"):
        return RepoSignals(repo_id=repo_id, reachable=False)
    tags = fixture.get("tags") or []
    config = fixture.get("config") or {}
    siblings = [s["name"] for s in fixture.get("siblings") or []]
    per_file = {
        name: (meta.get("detection_keys") or meta.get("sample_keys") or [])
        for name, meta in (fixture.get("safetensors_per_file") or {}).items()
    }
    return RepoSignals(
        repo_id=repo_id,
        reachable=True,
        gated=fixture.get("gated") or False,
        library_name=fixture.get("library_name"),
        pipeline_tag=fixture.get("pipeline_tag"),
        tags=tags,
        class_name=_class_name(fixture.get("model_index"), tags, config),
        has_auto_map="auto_map" in config,
        py_file_count=len(fixture.get("py_files") or []),
        siblings=siblings,
        has_safetensors=bool(fixture.get("has_safetensors")),
        per_file_keys=per_file,
        downloads=fixture.get("downloads") or 0,
        author=fixture.get("author"),
        license=fixture.get("license"),
    )


def signals_from_listing(listing: Dict[str, Any]) -> RepoSignals:
    """Parse one HfApi.list_models item (dict-ified). No file census at this level."""
    tags = listing.get("tags") or []
    return RepoSignals(
        repo_id=listing["id"],
        reachable=True,
        gated=listing.get("gated") or False,
        library_name=listing.get("library_name"),
        pipeline_tag=listing.get("pipeline_tag"),
        tags=tags,
        class_name=_class_name(None, tags, None),
        has_safetensors="safetensors" in tags,
        downloads=listing.get("downloads") or 0,
        author=listing.get("author"),
        partial=True,
    )


def fetch_repo_signals(repo_id: str, token: Optional[str] = None) -> RepoSignals:
    """Full-fidelity signals for one repo (detail view / pre-acquisition).

    Lazy hub import; any failure -> RepoSignals(reachable=False). Token is a
    LOCAL parameter, never stored or logged.
    """
    try:
        from huggingface_hub import HfApi

        api = HfApi(token=token)
        info = api.model_info(repo_id, files_metadata=False)
    except Exception:
        return RepoSignals(repo_id=repo_id, reachable=False)
    tags = info.tags or []
    siblings = [s.rfilename for s in (info.siblings or [])]
    return RepoSignals(
        repo_id=repo_id,
        reachable=True,
        gated=info.gated or False,
        library_name=info.library_name,
        pipeline_tag=info.pipeline_tag,
        tags=tags,
        class_name=_class_name(None, tags, None),
        py_file_count=sum(1 for s in siblings if s.endswith(".py")),
        siblings=siblings,
        has_safetensors=any(s.endswith(".safetensors") for s in siblings),
        downloads=info.downloads or 0,
        author=info.author,
    )
```

- [ ] **Step 4: Verify green**

Run: `cd backend && venv/Scripts/python.exe -m pytest tests/test_foundry_hub_signals.py -q`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/foundry/hub_signals.py backend/tests/test_foundry_hub_signals.py
git commit -m "feat(foundry): RepoSignals parsing from corpus fixtures, listings, and live hub"
```

---

### Task 4: `classifier.py` - the tier ladder

**Files:**
- Create: `backend/foundry/classifier.py`
- Test: `backend/tests/test_foundry_classifier.py`

- [ ] **Step 1: Write the failing tests** (precedence permutations + null tolerance; the corpus gate is Task 5)

```python
"""Tier ladder unit tests - precedence, guards, lora channels, null tolerance."""

import unittest

from foundry.classifier import (
    TierVerdict,
    classify_repo,
    lora_family_from_keys,
    tree_weight_format,
)
from foundry.hub_signals import RepoSignals

VERIFIED = {"black-forest-labs/FLUX.1-dev"}


def sig(**kw) -> RepoSignals:
    return RepoSignals(repo_id=kw.pop("repo_id", "org/repo"), **kw)


class PrecedenceTests(unittest.TestCase):
    def test_catalog_beats_everything_even_unreachable(self):
        v = classify_repo(sig(repo_id="black-forest-labs/FLUX.1-dev", reachable=False), VERIFIED)
        self.assertEqual(v.tier, "verified")
        self.assertTrue(v.available is False)

    def test_unreachable_non_catalog_is_unavailable_not_a_tier_error(self):
        v = classify_repo(sig(reachable=False), VERIFIED)
        self.assertFalse(v.available)
        self.assertEqual(v.tier, "experimental")

    def test_library_guard_beats_class_signal(self):
        v = classify_repo(
            sig(library_name="transformers", class_name="StableDiffusionXLPipeline"),
            VERIFIED,
        )
        self.assertEqual(v.tier, "experimental")
        self.assertIn("transformers", v.reason)

    def test_remote_code_guard_beats_class_signal(self):
        v = classify_repo(
            sig(library_name="diffusers", class_name="StableDiffusionXLPipeline",
                has_auto_map=True, has_safetensors=True),
            VERIFIED,
        )
        self.assertEqual(v.tier, "experimental")
        self.assertIn("code", v.reason)

    def test_shipped_class_safetensors_compatible(self):
        v = classify_repo(
            sig(library_name="diffusers", class_name="StableDiffusionXLPipeline",
                siblings=["unet/diffusion_pytorch_model.safetensors"], has_safetensors=True),
            VERIFIED,
        )
        self.assertEqual(v.tier, "compatible")
        self.assertIn("sdxl", v.reason)

    def test_shipped_class_gated_compatible_with_disclosure(self):
        v = classify_repo(
            sig(library_name="diffusers", class_name="FluxPipeline", gated="auto"),
            VERIFIED,
        )
        self.assertEqual(v.tier, "compatible")
        self.assertIn("license", v.reason)

    def test_shipped_class_pickle_only_tree_experimental(self):
        v = classify_repo(
            sig(library_name="diffusers", class_name="StableDiffusionPipeline",
                siblings=["unet/diffusion_pytorch_model.bin", "root-extra.safetensors"],
                has_safetensors=True),
            VERIFIED,
        )
        # Tree-scoped: the loadable tree is pickle; root extras don't vouch (Spike C adj 3).
        self.assertEqual(v.tier, "experimental")
        self.assertIn("consent", v.reason)

    def test_unshipped_class_named_in_reason(self):
        v = classify_repo(sig(library_name="diffusers", class_name="WanPipeline"), VERIFIED)
        self.assertEqual(v.tier, "experimental")
        self.assertIn("WanPipeline", v.reason)

    def test_default_is_experimental_never_silent_compatible(self):
        v = classify_repo(sig(library_name="diffusers"), VERIFIED)
        self.assertEqual(v.tier, "experimental")


class LoraChannelTests(unittest.TestCase):
    def test_lora_tag_with_catalog_base_compatible(self):
        v = classify_repo(
            sig(library_name="diffusers",
                tags=["lora", "base_model:stabilityai/stable-diffusion-xl-base-1.0"],
                has_safetensors=True),
            VERIFIED,
        )
        self.assertEqual(v.tier, "compatible")
        self.assertIn("sdxl", v.reason)

    def test_lora_tag_unresolvable_base_experimental(self):
        v = classify_repo(
            sig(library_name="diffusers", tags=["lora", "base_model:Qwen/Qwen-Image"],
                has_safetensors=True),
            VERIFIED,
        )
        self.assertEqual(v.tier, "experimental")

    def test_header_lora_kohya_sdxl_before_dit(self):
        # kohya sdxl keys CONTAIN transformer_blocks; unet prefix must win (Spike C).
        fam = lora_family_from_keys(
            ["lora_unet_input_blocks_4_1_transformer_blocks_0_attn1_to_k.lora_down.weight"]
        )
        self.assertEqual(fam, "sd-unet-family")

    def test_header_lora_xlabs_flux(self):
        fam = lora_family_from_keys(["double_blocks.0.processor.qkv_lora1.down.weight"])
        self.assertEqual(fam, "flux")

    def test_mixed_artifact_repo_experimental(self):
        v = classify_repo(
            sig(library_name="diffusers", has_safetensors=True,
                siblings=["a_lora.safetensors", "full_ckpt.safetensors"],
                per_file_keys={
                    "a_lora.safetensors": ["lora_unet_x.lora_down.weight"],
                    "full_ckpt.safetensors": ["model.diffusion_model.x.weight"],
                }),
            VERIFIED,
        )
        self.assertEqual(v.tier, "experimental")
        self.assertIn("ambiguous", v.reason)


class HelperTests(unittest.TestCase):
    def test_tree_weight_format_scopes_components(self):
        comp_st, comp_pickle, root_st, root_pickle = tree_weight_format(
            ["unet/diffusion_pytorch_model.bin", "loose.safetensors", "vae/x.safetensors"]
        )
        self.assertEqual((comp_st, comp_pickle, root_st, root_pickle), (1, 1, 1, 0))

    def test_classifier_never_raises_on_empty_signals(self):
        v = classify_repo(RepoSignals(repo_id="x/y"), set())
        self.assertIsInstance(v, TierVerdict)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify red**

Run: `cd backend && venv/Scripts/python.exe -m pytest tests/test_foundry_classifier.py -q`
Expected: FAIL `ModuleNotFoundError`.

- [ ] **Step 3: Implement `backend/foundry/classifier.py`**

```python
"""Tri-tier compatibility classifier - the Spike C precedence ladder.

Tier = "will it load with the pipelines Vision Studio ships today".
Every verdict carries a one-line human reason (spec 5.2). The ladder demands a
POSITIVE signal for Compatible; the default is Experimental. False-Compatible=0
over the Spike C corpus is an asserted regression invariant.
"""

import re
from dataclasses import dataclass
from typing import List, Optional, Set, Tuple

from foundry.hub_signals import RepoSignals

SHIPPED_PIPELINES = {
    "StableDiffusionPipeline",
    "StableDiffusionXLPipeline",
    "StableDiffusion3Pipeline",
    "FluxPipeline",
    "FluxFillPipeline",
    "AnimateDiffPipeline",
    "LTXPipeline",
    "StableVideoDiffusionPipeline",
    "StableDiffusionControlNetPipeline",
}
SHIPPED_COMPONENTS = {"ControlNetModel", "MotionAdapter", "AutoencoderKL"}

FAMILY_BY_CLASS = {
    "StableDiffusionPipeline": "sd15",
    "StableDiffusionXLPipeline": "sdxl",
    "StableDiffusion3Pipeline": "sd35",
    "FluxPipeline": "flux",
    "FluxFillPipeline": "flux",
    "AnimateDiffPipeline": "animatediff",
    "LTXPipeline": "ltx",
    "StableVideoDiffusionPipeline": "svd",
    "StableDiffusionControlNetPipeline": "sd15",
}

# Lora base-repo -> family. Catalog repo_ids + known hub mirrors (Spike C).
BASE_FAMILY_BY_REPO = {
    "runwayml/stable-diffusion-v1-5": "sd15",
    "stable-diffusion-v1-5/stable-diffusion-v1-5": "sd15",
    "stabilityai/stable-diffusion-xl-base-1.0": "sdxl",
    "black-forest-labs/FLUX.1-dev": "flux",
    "black-forest-labs/FLUX.1-schnell": "flux",
    "stabilityai/stable-diffusion-3.5-large": "sd35",
    "stabilityai/stable-diffusion-3.5-medium": "sd35",
}

_ALLOWED_LIBRARIES = (None, "diffusers", "stable-diffusion", "safetensors")
_COMPONENT_DIR_RE = re.compile(
    r"^(unet|transformer|vae|text_encoder\w*|prior|decoder|image_encoder|motion_adapter|controlnet)/"
)
_PICKLE_SUFFIXES = (".ckpt", ".bin", ".pt", ".pth")


@dataclass
class TierVerdict:
    tier: str            # verified | compatible | experimental
    reason: str          # one-line tier_reason, always set
    available: bool = True
    trust_remote_code: bool = False
    format: Optional[str] = None  # safetensors | pickle | diffusers


def tree_weight_format(siblings: List[str]) -> Tuple[int, int, int, int]:
    """(component_safetensors, component_pickle, root_safetensors, root_pickle).

    Tree-scoped (Spike C adjustment 3): the diffusers component dirs are what
    from_pretrained loads; root-level extras neither vouch nor taint.
    """
    comp_st = comp_pickle = root_st = root_pickle = 0
    for name in siblings:
        low = name.lower()
        in_comp = bool(_COMPONENT_DIR_RE.match(name))
        if low.endswith(".safetensors"):
            if in_comp:
                comp_st += 1
            elif "/" not in name:
                root_st += 1
        elif low.endswith(_PICKLE_SUFFIXES):
            if in_comp:
                comp_pickle += 1
            elif "/" not in name:
                root_pickle += 1
    return comp_st, comp_pickle, root_st, root_pickle


def file_is_lora(keys: List[str]) -> bool:
    return any(
        ".lora_down." in k or ".lora_up." in k or ".lora_A." in k or ".lora_B." in k
        or k.startswith(("lora_unet_", "lora_te", "lora_transformer_"))
        or ("_lora" in k and ("double_blocks." in k or "single_blocks." in k))
        for k in keys
    )


def lora_family_from_keys(keys: List[str]) -> Optional[str]:
    """Order matters: sd/sdxl unet attention paths CONTAIN 'transformer_blocks'
    (kohya), so unet-style prefixes are checked BEFORE DiT patterns (Spike C)."""
    if not file_is_lora(keys):
        return None
    if any("lora_te2" in k or "text_encoder_2" in k for k in keys):
        return "sdxl"
    if any(k.startswith(("lora_unet_", "lora_te")) or ".unet." in k or k.startswith("unet.") for k in keys):
        return "sd-unet-family"
    if any("double_blocks." in k or "single_blocks." in k for k in keys):
        return "flux"
    if any("transformer_blocks" in k or k.startswith("transformer.") for k in keys):
        return "dit-unknown"
    return "unrecognized"


def lora_base_family(tags: List[str]) -> Optional[str]:
    if "lora" not in tags:
        return None
    for tag in tags:
        if tag.startswith("base_model:"):
            base = tag.split(":")[-1]
            if base in BASE_FAMILY_BY_REPO:
                return BASE_FAMILY_BY_REPO[base]
    return None


def classify_repo(signals: RepoSignals, verified_repo_ids: Set[str]) -> TierVerdict:
    """The 8-rule ladder. First match wins; default Experimental."""
    # 1 - catalog authority (even if the hub copy is gone; bytes may be local).
    if signals.repo_id in verified_repo_ids:
        return TierVerdict("verified", "in verified catalog",
                           available=signals.reachable, format="safetensors")

    # 2 - unreachable, non-catalog.
    if not signals.reachable:
        return TierVerdict("experimental", "repo unreachable (removed, renamed, or offline)",
                           available=False)

    # 3 - non-diffusion libraries are never Compatible.
    if signals.library_name not in _ALLOWED_LIBRARIES:
        return TierVerdict(
            "experimental",
            f"library '{signals.library_name}' is not an image/video generation artifact we load",
        )

    # 4 - remote-code suspicion: deny by default (spec 5.3).
    if signals.has_auto_map or signals.py_file_count > 0:
        return TierVerdict(
            "experimental",
            "repo ships custom code - runs code authored by the repo (denied by default)",
            trust_remote_code=True,
        )

    comp_st, comp_pickle, root_st, root_pickle = tree_weight_format(signals.siblings)

    # 5 - explicit class signal.
    if signals.class_name:
        family = FAMILY_BY_CLASS.get(signals.class_name)
        if signals.class_name in SHIPPED_PIPELINES:
            if signals.gated:
                return TierVerdict(
                    "compatible",
                    f"diffusers {family} ({signals.class_name}) - gated; format verified after license accept",
                    format="diffusers",
                )
            if comp_st:
                return TierVerdict(
                    "compatible",
                    f"diffusers {family} ({signals.class_name}) - safetensors - no remote code",
                    format="diffusers",
                )
            if signals.partial and signals.has_safetensors:
                return TierVerdict(
                    "compatible",
                    f"diffusers {family} ({signals.class_name}) - safetensors tag - no remote code",
                    format="diffusers",
                )
            return TierVerdict(
                "experimental",
                f"{signals.class_name} but pickle-only weights - requires explicit consent",
                format="pickle",
            )
        if signals.class_name in SHIPPED_COMPONENTS:
            if comp_st or root_st or signals.has_safetensors:
                return TierVerdict(
                    "compatible",
                    f"{signals.class_name} component - safetensors - no remote code",
                    format="safetensors",
                )
            return TierVerdict(
                "experimental",
                f"{signals.class_name} component but pickle-only weights",
                format="pickle",
            )
        return TierVerdict(
            "experimental",
            f"pipeline class {signals.class_name} not supported by shipped pipelines",
        )

    # 5.5 - hub lora channel: lora tag + base_model tag resolving to a shipped family.
    tag_family = lora_base_family(signals.tags)
    if tag_family:
        if signals.has_safetensors:
            return TierVerdict(
                "compatible",
                f"standalone {tag_family} lora (base_model tag) - safetensors - loads via load_lora_weights",
                format="safetensors",
            )
        return TierVerdict("experimental", f"{tag_family} lora but pickle-only weights", format="pickle")

    # 6 - header lora channel (loose files), with the mixed-repo guard.
    lora_hit = None
    saw_non_lora = False
    for name, keys in signals.per_file_keys.items():
        if not keys:
            continue
        if file_is_lora(keys):
            lora_hit = lora_hit or lora_family_from_keys(keys)
        else:
            saw_non_lora = True
    if lora_hit:
        if saw_non_lora:
            return TierVerdict(
                "experimental",
                "mixed loose artifacts (loras + full/bare weights) - artifact role ambiguous pre-import",
            )
        if lora_hit in ("sdxl", "sd-unet-family", "flux"):
            return TierVerdict(
                "compatible",
                f"standalone lora ({lora_hit}) - safetensors - loads via load_lora_weights",
                format="safetensors",
            )
        return TierVerdict(
            "experimental",
            "lora with unrecognized family signals (DiT base unprovable from header alone)",
        )

    # 7/8 - defaults, honestly reasoned.
    if signals.has_safetensors:
        return TierVerdict(
            "experimental",
            "loose safetensors without class metadata - typed only after local header index",
            format="safetensors",
        )
    if root_pickle or comp_pickle:
        return TierVerdict(
            "experimental",
            "pickle-only weights, no metadata - requires explicit consent",
            format="pickle",
        )
    return TierVerdict("experimental", "insufficient metadata to classify")
```

- [ ] **Step 4: Verify green**

Run: `cd backend && venv/Scripts/python.exe -m pytest tests/test_foundry_classifier.py -q`
Expected: 16 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/foundry/classifier.py backend/tests/test_foundry_classifier.py
git commit -m "feat(foundry): tri-tier classifier ladder with tier reasons (Spike C rules)"
```

---

### Task 5: Corpus regression gate (41 fixtures, false-Compatible = 0)

**Files:**
- Test: `backend/tests/test_foundry_classifier_corpus.py`

- [ ] **Step 1: Write the test** (this is the gate - it should pass immediately if Task 4 is faithful; any red here is a Task 4 bug, fix THERE)

```python
"""The Spike C corpus is the classifier's regression gate.

Every fixture must reproduce its ground-truth tier, and the false-Compatible
count must be exactly zero. If a fixture's ground truth ever changes, that is
an evidence-based relabel documented in the spike doc - never a test tweak.
"""

import json
import os
import unittest
from pathlib import Path

from foundry.classifier import classify_repo
from foundry.hub_signals import signals_from_fixture
from foundry.model_record import load_catalog

CORPUS = Path(__file__).parent / "fixtures" / "classifier_corpus"
CATALOG = os.path.join(os.path.dirname(__file__), "..", "foundry", "verified-catalog.json")


def verified_repo_ids():
    return {
        record.repo_id
        for record in load_catalog(CATALOG).values()
        if record.repo_id
    }


class CorpusRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.verified = verified_repo_ids()
        cls.fixtures = [
            json.loads(p.read_text(encoding="utf-8"))
            for p in sorted(CORPUS.glob("*.json"))
            if p.name != "index.json"
        ]

    def test_corpus_is_complete(self):
        self.assertEqual(len(self.fixtures), 41)

    def test_every_fixture_reproduces_ground_truth(self):
        for fixture in self.fixtures:
            gt = fixture["ground_truth"]["tier"]
            with self.subTest(repo=fixture["repo_id"]):
                verdict = classify_repo(signals_from_fixture(fixture), self.verified)
                if gt == "unavailable" or not fixture.get("reachable", False):
                    if fixture["repo_id"] not in self.verified:
                        self.assertFalse(verdict.available)
                        continue
                self.assertEqual(verdict.tier, gt)
                self.assertTrue(verdict.reason)

    def test_false_compatible_is_zero(self):
        offenders = []
        for fixture in self.fixtures:
            verdict = classify_repo(signals_from_fixture(fixture), self.verified)
            if verdict.tier == "compatible" and fixture["ground_truth"]["tier"] != "compatible":
                offenders.append(fixture["repo_id"])
        self.assertEqual(offenders, [])

    def test_every_verdict_has_a_reason(self):
        for fixture in self.fixtures:
            verdict = classify_repo(signals_from_fixture(fixture), self.verified)
            self.assertTrue(verdict.reason, fixture["repo_id"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run**

Run: `cd backend && venv/Scripts/python.exe -m pytest tests/test_foundry_classifier_corpus.py -q`
Expected: 4 passed (41 subtests). If ANY subtest fails: the ladder in Task 4 deviates from the spike - fix `classifier.py`/`hub_signals.py`, never the fixture.

Note: the corpus ground truth for `stabilityai/stable-diffusion-2-1` is the
pre-churn label `unavailable`-shaped (`reachable: false`); the test handles it
via the `available` flag. `runwayml/stable-diffusion-v1-5` is in the catalog ->
`verified` regardless of redirects.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_foundry_classifier_corpus.py
git commit -m "test(foundry): corpus regression gate - 41 fixtures, false-Compatible=0 invariant"
```

---

### Task 6: Post-index tier reconciliation (indexer artifacts get classifier-driven tier + tier_reason)

Spec 5.2: "upgrades/downgrades post-index on real header inspection." Concretely: indexed standalone loras of a recognizable family upgrade to `compatible` (the `load_lora_weights` path exists today); checkpoints/vaes/controlnets/unknown stay `experimental` with an honest reason (no `from_single_file` until M5).

**Files:**
- Modify: `backend/foundry/classifier.py` (add `indexed_tier`)
- Modify: `backend/foundry/indexer.py` (`artifact_to_record` consumes it)
- Test: `backend/tests/test_foundry_classifier.py`, `backend/tests/test_foundry_indexer.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_foundry_classifier.py`:

```python
class IndexedTierTests(unittest.TestCase):
    def test_indexed_lora_known_family_upgrades_to_compatible(self):
        from foundry.classifier import indexed_tier
        tier, reason = indexed_tier("lora", ["lora_unet_a.lora_down.weight", "lora_te2_b.lora_down.weight"])
        self.assertEqual(tier, "compatible")
        self.assertIn("load_lora_weights", reason)

    def test_indexed_checkpoint_stays_experimental_with_reason(self):
        from foundry.classifier import indexed_tier
        tier, reason = indexed_tier("checkpoint", ["model.diffusion_model.x.weight"])
        self.assertEqual(tier, "experimental")
        self.assertIn("single-file", reason)

    def test_indexed_unknown_stays_experimental(self):
        from foundry.classifier import indexed_tier
        tier, reason = indexed_tier("unknown", [])
        self.assertEqual(tier, "experimental")
```

Append to `backend/tests/test_foundry_indexer.py` (follow its existing fixture-building helpers - it crafts real safetensors files via `foundry_fixtures.make_safetensors`):

```python
    def test_indexed_lora_record_carries_compatible_tier_and_reason(self):
        # Build a lora safetensors file in the scanned tree using the existing
        # make_safetensors helper + LORA_TENSORS, scan, then:
        record = ...  # the scanned lora's IndexedArtifact -> artifact_to_record(...)
        self.assertEqual(record.tier, "compatible")
        self.assertIn("load_lora_weights", record.tier_reason)

    def test_indexed_checkpoint_record_stays_experimental(self):
        record = ...  # same pattern with CHECKPOINT_TENSORS
        self.assertEqual(record.tier, "experimental")
        self.assertIn("single-file", record.tier_reason)
```

(The implementer writes these two against the file's real helper names - read
`test_foundry_indexer.py` first; the `...` above is the existing scan-then-convert
flow already used by neighboring tests, not new machinery.)

- [ ] **Step 2: Run to verify red**

Run: `cd backend && venv/Scripts/python.exe -m pytest tests/test_foundry_classifier.py tests/test_foundry_indexer.py -q`
Expected: new cases FAIL (`ImportError: indexed_tier` / tier == "experimental" asserts).

- [ ] **Step 3: Implement**

Append to `backend/foundry/classifier.py`:

```python
def indexed_tier(artifact_type: str, keys: List[str]) -> Tuple[str, str]:
    """Post-index tier for a locally indexed artifact (spec 5.2 upgrade/downgrade).

    Bounded by load paths that exist today (Spike C adjustment 4): standalone
    loras load via load_lora_weights -> compatible; single-file checkpoints
    wait for from_single_file wiring in M5 -> experimental, honestly reasoned.
    """
    if artifact_type == "lora":
        family = lora_family_from_keys(keys)
        if family in ("sdxl", "sd-unet-family", "flux"):
            return "compatible", f"indexed {family} lora - loads via load_lora_weights"
        return "experimental", "indexed lora - base family unrecognized from header"
    if artifact_type == "checkpoint":
        return "experimental", "indexed single-file checkpoint - load path lands with M5 from_single_file"
    if artifact_type in ("vae", "controlnet"):
        return "experimental", f"indexed loose {artifact_type} - wiring lands with M5 runtime resolution"
    return "experimental", "indexed artifact of unrecognized type"
```

In `backend/foundry/indexer.py`, `artifact_to_record` currently hardcodes
`tier="experimental"`. Change it to call `indexed_tier(artifact.artifact_type, artifact.header_keys or [])`
and set both `tier=` and `tier_reason=`. `IndexedArtifact` gains a
`header_keys: List[str]` field populated by `scan_tree` from the already-read
header (`list(header.keys())`, excluding `__metadata__`) - the header is ALREADY
read for classification, so this adds no I/O. Keep the field out of the
incremental-scan signature tuple (signature stays `[mtime_ns, size, type, identity]`);
on signature-hit (unchanged file) re-derive tier from the cached type with
`keys=[]` - lora family then unknown -> document that unchanged loras keep
their prior tier via the cached record path, and only re-read headers when the
file changes. Simplest correct approach: persist `tier`+`tier_reason` into the
scan-state entry alongside type/identity so signature hits reuse them:
extend the persisted entry to `[mtime_ns, size, type, identity, tier, tier_reason]`
with backward-compat (old 4-entry lists -> recompute by re-reading the header once).

- [ ] **Step 4: Verify green + full indexer/service neighbors**

Run: `cd backend && venv/Scripts/python.exe -m pytest tests/test_foundry_classifier.py tests/test_foundry_indexer.py tests/test_foundry_index_service.py tests/test_foundry_library_api.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/foundry/classifier.py backend/foundry/indexer.py backend/tests/test_foundry_classifier.py backend/tests/test_foundry_indexer.py
git commit -m "feat(foundry): post-index tier reconciliation - indexed loras upgrade to compatible"
```

---

### Task 7: `security_policy.py` - ConsentStore + consent API + download enforcement

**Files:**
- Create: `backend/foundry/security_policy.py`
- Modify: `backend/main.py` (singleton, `POST /api/models/consent`, enforcement in `enqueue_download`)
- Modify: `backend/foundry/schemas.py` (`ConsentSchema`, `ConsentStateSchema`)
- Test: `backend/tests/test_foundry_security_policy.py`
- Test: `backend/tests/test_foundry_consent_api.py` (integration)

- [ ] **Step 1: Write the failing unit tests**

```python
"""ConsentStore - per-model pickle / remote-code consent. Deny by default.

Same hardening pattern as RootsStore: atomic saves (mkstemp + os.replace),
corrupt file -> .corrupt sidecar + start empty (deny-everything fail-safe),
every grant/revoke appended to an audit trail.
"""

import json
import os
import tempfile
import unittest

from foundry.security_policy import ConsentStore


class ConsentStoreTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.path = os.path.join(self.dir, "consents.json")

    def test_default_is_deny_everything(self):
        store = ConsentStore(self.path)
        state = store.get("any-model")
        self.assertFalse(state["pickle"])
        self.assertFalse(state["trust_remote_code"])

    def test_grant_persists_and_reloads(self):
        store = ConsentStore(self.path)
        store.grant("m1", "pickle")
        reloaded = ConsentStore(self.path)
        self.assertTrue(reloaded.get("m1")["pickle"])
        self.assertFalse(reloaded.get("m1")["trust_remote_code"])

    def test_revoke(self):
        store = ConsentStore(self.path)
        store.grant("m1", "trust_remote_code")
        store.revoke("m1", "trust_remote_code")
        self.assertFalse(store.get("m1")["trust_remote_code"])

    def test_invalid_kind_rejected(self):
        store = ConsentStore(self.path)
        with self.assertRaises(ValueError):
            store.grant("m1", "root-access")

    def test_corrupt_file_fails_safe_to_deny(self):
        with open(self.path, "w", encoding="utf-8") as fh:
            fh.write("{not json")
        store = ConsentStore(self.path)
        self.assertFalse(store.get("m1")["pickle"])
        self.assertTrue(os.path.exists(self.path + ".corrupt"))

    def test_audit_trail_records_every_action(self):
        store = ConsentStore(self.path)
        store.grant("m1", "pickle")
        store.revoke("m1", "pickle")
        audit = store.audit()
        self.assertEqual(len(audit), 2)
        self.assertEqual(audit[0]["action"], "grant")
        self.assertEqual(audit[1]["action"], "revoke")
        self.assertIn("at", audit[0])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify red**

Run: `cd backend && venv/Scripts/python.exe -m pytest tests/test_foundry_security_policy.py -q`
Expected: FAIL `ModuleNotFoundError`.

- [ ] **Step 3: Implement `backend/foundry/security_policy.py`**

```python
"""Per-model consent for pickle weights and trust_remote_code. Deny by default.

Spec 5.3: no silent trust elevation, ever - each step up is a deliberate,
logged user action. Storage hardening mirrors RootsStore (atomic replace,
corrupt -> sidecar + deny-everything).
"""

import json
import os
import tempfile
from datetime import datetime, timezone
from typing import Any, Dict, List

CONSENT_KINDS = ("pickle", "trust_remote_code")


class ConsentStore:
    def __init__(self, path: str):
        self.path = path
        self._consents: Dict[str, Dict[str, bool]] = {}
        self._audit: List[Dict[str, Any]] = []
        self._load()

    def get(self, model_id: str) -> Dict[str, bool]:
        entry = self._consents.get(model_id, {})
        return {kind: bool(entry.get(kind)) for kind in CONSENT_KINDS}

    def grant(self, model_id: str, kind: str) -> None:
        self._set(model_id, kind, True, "grant")

    def revoke(self, model_id: str, kind: str) -> None:
        self._set(model_id, kind, False, "revoke")

    def audit(self) -> List[Dict[str, Any]]:
        return list(self._audit)

    # -- internals -----------------------------------------------------------
    def _set(self, model_id: str, kind: str, value: bool, action: str) -> None:
        if kind not in CONSENT_KINDS:
            raise ValueError(f"unknown consent kind: {kind!r}")
        self._consents.setdefault(model_id, {})[kind] = value
        self._audit.append(
            {
                "model_id": model_id,
                "kind": kind,
                "action": action,
                "at": datetime.now(timezone.utc).isoformat(),
            }
        )
        self._save()

    def _load(self) -> None:
        if not os.path.exists(self.path):
            return
        try:
            with open(self.path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            self._consents = {
                str(k): {kind: bool(v.get(kind)) for kind in CONSENT_KINDS}
                for k, v in dict(data.get("consents", {})).items()
            }
            self._audit = list(data.get("audit", []))
        except (OSError, ValueError, TypeError, AttributeError):
            # Fail-safe: deny everything rather than trust a corrupt file.
            try:
                os.replace(self.path, self.path + ".corrupt")
            except OSError:
                pass
            self._consents, self._audit = {}, []

    def _save(self) -> None:
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        payload = {"consents": self._consents, "audit": self._audit}
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(self.path), suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(payload, fh, indent=2)
            os.replace(tmp, self.path)
        except OSError:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise
```

- [ ] **Step 4: Schemas + routes + enforcement**

In `backend/foundry/schemas.py`:

```python
class ConsentRequestSchema(BaseModel):
    model_config = {"protected_namespaces": ()}

    model_id: str
    kind: str          # pickle | trust_remote_code
    granted: bool


class ConsentStateSchema(BaseModel):
    model_config = {"protected_namespaces": ()}

    model_id: str
    pickle: bool
    trust_remote_code: bool
```

In `backend/main.py`:
- Singleton next to `roots_store`/`index_service`:
  `consent_store = ConsentStore(os.path.join(MODELS_DIR, ".foundry", "consents.json"))`
- New route, placed in the literal-route block BEFORE `GET /api/models/{model_id}`:

```python
@app.post("/api/models/consent", response_model=ConsentStateSchema, tags=["Models"])
@limiter.limit("30/minute")
async def set_consent(request: Request, body: ConsentRequestSchema):
    """Grant/revoke per-model consent. Deliberate, logged; deny is the default."""
    try:
        if body.granted:
            consent_store.grant(body.model_id, body.kind)
        else:
            consent_store.revoke(body.model_id, body.kind)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    state = consent_store.get(body.model_id)
    return ConsentStateSchema(model_id=body.model_id, **state)
```

- Enforcement at the top of `enqueue_download` (after the record lookup, before enqueueing):

```python
    consent = consent_store.get(model_id)
    record_format = record.get("format")
    if record_format == "pickle" and not consent["pickle"]:
        raise HTTPException(
            status_code=409,
            detail={"error_code": "pickle-consent-required",
                    "message": "This model ships pickle weights. Explicit consent is required (Settings > Model Trust)."},
        )
    if record.get("trust_remote_code") and not consent["trust_remote_code"]:
        raise HTTPException(
            status_code=409,
            detail={"error_code": "remote-code-consent-required",
                    "message": "This model requires running code authored by the repo. Explicit per-model consent is required."},
        )
```

- [ ] **Step 5: Write the integration test** `backend/tests/test_foundry_consent_api.py` (TestClient; mirrors `test_foundry_library_api.py` setup incl. `_empty_cache()` mock; conftest auto-tags it integration):

```python
"""Consent API + download enforcement. Verified models are never blocked."""

import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

import main


class ConsentApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)

    def test_grant_and_read_back(self):
        resp = self.client.post(
            "/api/models/consent",
            json={"model_id": "m-test", "kind": "pickle", "granted": True},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["pickle"])
        resp = self.client.post(
            "/api/models/consent",
            json={"model_id": "m-test", "kind": "pickle", "granted": False},
        )
        self.assertFalse(resp.json()["pickle"])

    def test_unknown_kind_400(self):
        resp = self.client.post(
            "/api/models/consent",
            json={"model_id": "m", "kind": "sudo", "granted": True},
        )
        self.assertEqual(resp.status_code, 400)

    def test_pickle_record_download_409_without_consent(self):
        record = main.registry.get_record("flux-dev")
        self.assertIsNotNone(record)  # catalog baseline sanity
        with patch.object(main.registry, "get_record", return_value={
            **record, "id": "pickle-model", "format": "pickle", "trust_remote_code": False,
        }):
            resp = self.client.post("/api/models/pickle-model/download")
        self.assertEqual(resp.status_code, 409)
        self.assertEqual(resp.json()["detail"]["error_code"], "pickle-consent-required")

    def test_verified_safetensors_record_not_blocked_by_consent_gate(self):
        # Catalog records (format None/safetensors, no remote code) pass the gate;
        # whatever the download manager does next is out of scope here.
        consent = main.consent_store.get("flux-dev")
        self.assertFalse(consent["pickle"])  # nothing granted, yet not blocked:
        with patch.object(main.download_manager, "enqueue") as enqueue:
            enqueue.return_value = main.download_manager.enqueue.__annotations__ and None
            # Use the real route; only assert it is NOT a 409 consent error.
            resp = self.client.post("/api/models/flux-dev/download")
        self.assertNotEqual(resp.status_code, 409)


if __name__ == "__main__":
    unittest.main()
```

(The implementer adapts the last test to the actual enqueue mock shape used in
`test_foundry_download_api.py` - copy its established pattern for stubbing
`download_manager.enqueue` so no real download starts. ConsentStore writes to
`MODELS_DIR/.foundry/consents.json`; tests must point `main.consent_store` at a
tmp path in `setUp` (patch the singleton, mirroring how library API tests patch
stores) so no repo-tree state leaks; remove the file in `tearDown`.)

- [ ] **Step 6: Run everything**

Run: `cd backend && venv/Scripts/python.exe -m pytest tests/test_foundry_security_policy.py tests/test_foundry_consent_api.py tests/test_foundry_download_api.py -q`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/foundry/security_policy.py backend/foundry/schemas.py backend/main.py backend/tests/test_foundry_security_policy.py backend/tests/test_foundry_consent_api.py
git commit -m "feat(foundry): ConsentStore + consent API + pickle/remote-code download enforcement"
```

---

### Task 8: `hub_search.py` - HF search via `HfApi.list_models`

**Files:**
- Create: `backend/foundry/hub_search.py`
- Modify: `backend/foundry/schemas.py` (`SearchResultSchema`, `SearchResponseSchema`)
- Test: `backend/tests/test_foundry_hub_search.py`

- [ ] **Step 1: Write the failing tests** (HfApi fully mocked - construct listing dicts, never the network)

```python
"""HF search - list_models mocked; every result classified with a reason."""

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock

from foundry.hub_search import search_hf

VERIFIED = {"stabilityai/stable-diffusion-xl-base-1.0"}


def listing(**kw):
    base = {
        "id": "org/model",
        "library_name": "diffusers",
        "pipeline_tag": "text-to-image",
        "tags": [],
        "gated": False,
        "downloads": 1000,
        "likes": 10,
        "author": "org",
    }
    base.update(kw)
    return SimpleNamespace(**base)


class HfSearchTests(unittest.TestCase):
    def test_results_classified_with_reasons(self):
        api = MagicMock()
        api.list_models.return_value = iter([
            listing(id="stabilityai/sdxl-turbo",
                    tags=["diffusers:StableDiffusionXLPipeline", "safetensors"]),
            listing(id="Wan-AI/Wan2.2-TI2V-5B-Diffusers",
                    tags=["diffusers:WanPipeline", "safetensors"]),
        ])
        results = search_hf(api, query="turbo", verified_repo_ids=VERIFIED)
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0].tier, "compatible")
        self.assertIn("sdxl", results[0].tier_reason)
        self.assertEqual(results[1].tier, "experimental")
        self.assertIn("WanPipeline", results[1].tier_reason)

    def test_verified_catalog_id_marked_verified(self):
        api = MagicMock()
        api.list_models.return_value = iter([
            listing(id="stabilityai/stable-diffusion-xl-base-1.0",
                    tags=["diffusers:StableDiffusionXLPipeline"]),
        ])
        results = search_hf(api, query="sdxl", verified_repo_ids=VERIFIED)
        self.assertEqual(results[0].tier, "verified")

    def test_pagination_and_filters_forwarded(self):
        api = MagicMock()
        api.list_models.return_value = iter([])
        search_hf(api, query="x", verified_repo_ids=set(), task="text-to-video",
                  sort="likes", page=3, page_size=20)
        kwargs = api.list_models.call_args.kwargs
        self.assertEqual(kwargs["search"], "x")
        self.assertEqual(kwargs["pipeline_tag"], "text-to-video")
        self.assertEqual(kwargs["sort"], "likes")
        self.assertEqual(kwargs["limit"], 60)  # page 3 * 20, sliced client-side

    def test_result_ids_are_stable_registry_slugs(self):
        api = MagicMock()
        api.list_models.return_value = iter([listing(id="org/Some Model")])
        results = search_hf(api, query="x", verified_repo_ids=set())
        self.assertTrue(results[0].id.startswith("search-hf--"))
        self.assertNotIn("/", results[0].id)
        self.assertNotIn(" ", results[0].id)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify red**, then **Step 3: Implement `backend/foundry/hub_search.py`**

```python
"""HF hub search -> classified SearchResult list. Network only via the passed api."""

import re
from dataclasses import dataclass, field
from typing import List, Optional, Set

from foundry.classifier import classify_repo
from foundry.hub_signals import signals_from_listing

_SORT_FIELDS = {"downloads", "likes", "lastModified"}


@dataclass
class SearchResult:
    id: str                      # registry slug: search-hf--<sanitized repo>
    source: str                  # "huggingface" | "civitai"
    name: str
    repo_id: Optional[str]
    tier: str
    tier_reason: str
    artifact_type: str = "diffusers-pipeline"
    base_architecture: str = "unknown"
    downloads: int = 0
    likes: int = 0
    author: Optional[str] = None
    license: Optional[str] = None
    gated: bool = False
    nsfw: bool = False
    format: Optional[str] = None
    trust_remote_code: bool = False
    size: str = "Unknown"
    download_url: Optional[str] = None
    sha256: Optional[str] = None
    capability: str = "image"
    tags: List[str] = field(default_factory=list)


def _slug(repo_id: str) -> str:
    return "search-hf--" + re.sub(r"[^A-Za-z0-9._-]", "-", repo_id)


_FAMILY_CAPABILITY = {"ltx": "video", "svd": "video", "animatediff": "video"}


def search_hf(
    api,
    query: str,
    verified_repo_ids: Set[str],
    task: Optional[str] = None,
    sort: str = "downloads",
    page: int = 1,
    page_size: int = 20,
    author: Optional[str] = None,
    tags: Optional[List[str]] = None,
) -> List[SearchResult]:
    """One page of classified HF results. Caller owns error handling/offline."""
    page = max(1, page)
    sort_field = sort if sort in _SORT_FIELDS else "downloads"
    listings = api.list_models(
        search=query or None,
        pipeline_tag=task,
        library="diffusers",
        author=author,
        tags=tags,
        sort=sort_field,
        direction=-1,
        limit=page * page_size,
        full=False,
    )
    items = list(listings)[(page - 1) * page_size : page * page_size]
    results: List[SearchResult] = []
    for item in items:
        raw = {
            "id": item.id,
            "library_name": getattr(item, "library_name", None),
            "pipeline_tag": getattr(item, "pipeline_tag", None),
            "tags": getattr(item, "tags", None) or [],
            "gated": getattr(item, "gated", False),
            "downloads": getattr(item, "downloads", 0) or 0,
            "author": getattr(item, "author", None),
        }
        signals = signals_from_listing(raw)
        verdict = classify_repo(signals, verified_repo_ids)
        family = _family_from_reason(verdict.reason)
        results.append(
            SearchResult(
                id=_slug(item.id),
                source="huggingface",
                name=item.id.split("/")[-1],
                repo_id=item.id,
                tier=verdict.tier,
                tier_reason=verdict.reason,
                base_architecture=family or "unknown",
                capability=_FAMILY_CAPABILITY.get(family or "", "image"),
                downloads=raw["downloads"],
                likes=getattr(item, "likes", 0) or 0,
                author=raw["author"],
                gated=bool(raw["gated"]),
                format=verdict.format,
                trust_remote_code=verdict.trust_remote_code,
                tags=[t for t in raw["tags"] if not t.startswith("diffusers:")][:12],
            )
        )
    return results


def _family_from_reason(reason: str) -> Optional[str]:
    for family in ("sdxl", "sd15", "sd35", "flux", "ltx", "svd", "animatediff"):
        if f" {family} " in f" {reason} " or f"{family} " in reason:
            return family
    return None
```

Add to `backend/foundry/schemas.py`:

```python
class SearchResultSchema(BaseModel):
    id: str
    source: str
    name: str
    repo_id: Optional[str] = None
    tier: str
    tier_reason: str
    artifact_type: str = "diffusers-pipeline"
    base_architecture: str = "unknown"
    capability: str = "image"
    downloads: int = 0
    likes: int = 0
    author: Optional[str] = None
    license: Optional[str] = None
    gated: bool = False
    nsfw: bool = False
    format: Optional[str] = None
    trust_remote_code: bool = False
    size: str = "Unknown"
    tags: List[str] = []


class SearchResponseSchema(BaseModel):
    source: str
    query: str
    page: int
    results: List[SearchResultSchema] = []
    offline: bool = False
    warning: Optional[str] = None
```

- [ ] **Step 4: Verify green**

Run: `cd backend && venv/Scripts/python.exe -m pytest tests/test_foundry_hub_search.py -q`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/foundry/hub_search.py backend/foundry/schemas.py backend/tests/test_foundry_hub_search.py
git commit -m "feat(foundry): HF hub search with per-result tier + reason"
```

---

### Task 9: `civitai_search.py` - NSFW-off default, vocab map, format + hashes

**Files:**
- Create: `backend/foundry/civitai_search.py`
- Test: `backend/tests/test_foundry_civitai_search.py`

- [ ] **Step 1: Write the failing tests** (requests fully mocked)

```python
"""CivitAI search - REST mocked. NSFW filtered by default; pickle detected."""

import unittest
from unittest.mock import MagicMock

from foundry.civitai_search import CIVITAI_BASE_FAMILY, search_civitai


def civitai_item(**kw):
    base = {
        "id": 42,
        "name": "Pixel Lora",
        "type": "LORA",
        "nsfw": False,
        "nsfwLevel": 1,
        "creator": {"username": "artist"},
        "stats": {"downloadCount": 5000, "thumbsUpCount": 100},
        "modelVersions": [
            {
                "id": 99,
                "baseModel": "SDXL 1.0",
                "files": [
                    {
                        "name": "pixel.safetensors",
                        "sizeKB": 100000,
                        "metadata": {"format": "SafeTensor"},
                        "hashes": {"SHA256": "AB" * 32},
                        "downloadUrl": "https://civitai.com/api/download/models/99",
                        "pickleScanResult": "Success",
                        "virusScanResult": "Success",
                    }
                ],
            }
        ],
    }
    base.update(kw)
    return base


class CivitaiSearchTests(unittest.TestCase):
    def _session(self, items):
        session = MagicMock()
        session.get.return_value = MagicMock(
            status_code=200, json=MagicMock(return_value={"items": items, "metadata": {}})
        )
        return session

    def test_safetensor_sdxl_lora_compatible(self):
        results = search_civitai("pixel", session=self._session([civitai_item()]))
        self.assertEqual(results[0].tier, "compatible")
        self.assertEqual(results[0].base_architecture, "sdxl")
        self.assertEqual(results[0].format, "safetensors")
        self.assertEqual(results[0].sha256, "ab" * 32)
        self.assertTrue(results[0].download_url.startswith("https://civitai.com/"))

    def test_checkpoint_stays_experimental_until_m5(self):
        item = civitai_item(type="Checkpoint")
        results = search_civitai("x", session=self._session([item]))
        self.assertEqual(results[0].tier, "experimental")
        self.assertIn("single-file", results[0].tier_reason)

    def test_pickle_tensor_experimental_with_consent_reason(self):
        item = civitai_item()
        item["modelVersions"][0]["files"][0]["metadata"]["format"] = "PickleTensor"
        results = search_civitai("x", session=self._session([item]))
        self.assertEqual(results[0].tier, "experimental")
        self.assertEqual(results[0].format, "pickle")
        self.assertIn("consent", results[0].tier_reason)

    def test_unknown_base_vocab_experimental_never_a_guess(self):
        item = civitai_item()
        item["modelVersions"][0]["baseModel"] = "SomeFutureBase 9.0"
        results = search_civitai("x", session=self._session([item]))
        self.assertEqual(results[0].tier, "experimental")

    def test_nsfw_excluded_by_default_and_param_sent(self):
        session = self._session([civitai_item(nsfw=True)])
        results = search_civitai("x", session=session)
        self.assertEqual(results, [])  # client-side guard even if API leaks one
        params = session.get.call_args.kwargs["params"]
        self.assertEqual(params["nsfw"], "false")

    def test_nsfw_opt_in_includes_and_flags(self):
        session = self._session([civitai_item(nsfw=True)])
        results = search_civitai("x", session=session, include_nsfw=True)
        self.assertTrue(results[0].nsfw)

    def test_token_header_injected_never_in_params(self):
        session = self._session([])
        search_civitai("x", session=session, token="civ_SECRET")
        headers = session.get.call_args.kwargs["headers"]
        self.assertEqual(headers["Authorization"], "Bearer civ_SECRET")
        self.assertNotIn("civ_SECRET", str(session.get.call_args.kwargs.get("params")))

    def test_pony_and_illustrious_map_to_sdxl(self):
        self.assertEqual(CIVITAI_BASE_FAMILY["Pony"], "sdxl")
        self.assertEqual(CIVITAI_BASE_FAMILY["Illustrious"], "sdxl")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify red**, then **Step 3: Implement `backend/foundry/civitai_search.py`**

```python
"""CivitAI search. Spike C bonus findings applied: format=PickleTensor is the
pickle channel, baseModel is CivitAI vocabulary (mapped, never guessed), NSFW
is filtered by default with explicit opt-in, latency variance is real ->
hard timeouts; the caller layers offline-degrade.
"""

from dataclasses import dataclass
from typing import List, Optional

from foundry.hub_search import SearchResult

CIVITAI_API = "https://civitai.com/api/v1/models"
_TIMEOUT = (5, 30)  # connect, read - uncached CivitAI queries measured >20s

# CivitAI baseModel vocabulary -> our families. Unknown -> None -> experimental.
CIVITAI_BASE_FAMILY = {
    "SD 1.4": "sd15",
    "SD 1.5": "sd15",
    "SD 1.5 LCM": "sd15",
    "SDXL 0.9": "sdxl",
    "SDXL 1.0": "sdxl",
    "SDXL 1.0 LCM": "sdxl",
    "SDXL Turbo": "sdxl",
    "SDXL Lightning": "sdxl",
    "Pony": "sdxl",
    "Illustrious": "sdxl",
    "NoobAI": "sdxl",
    "Flux.1 D": "flux",
    "Flux.1 S": "flux",
    "SD 3.5": "sd35",
    "SD 3.5 Medium": "sd35",
    "SD 3.5 Large": "sd35",
    "SD 3.5 Large Turbo": "sd35",
    "SVD": "svd",
    "SVD XT": "svd",
    "LTXV": "ltx",
}

_TYPE_TO_ARTIFACT = {
    "Checkpoint": "checkpoint",
    "LORA": "lora",
    "LoCon": "lora",
    "DoRA": "lora",
    "TextualInversion": "embedding",
    "VAE": "vae",
    "Controlnet": "controlnet",
}


def _classify_civitai(item_type: str, family: Optional[str], fmt: Optional[str]):
    """(tier, reason). Compatible is loras-of-known-family + SafeTensor only -
    the only one-click load path that exists today (Spike C adjustment 4)."""
    if fmt == "pickle":
        return "experimental", "pickle weights - requires explicit consent (convert to safetensors offered)"
    if family is None:
        return "experimental", "base model vocabulary unrecognized - never guessed"
    artifact = _TYPE_TO_ARTIFACT.get(item_type, "unknown")
    if artifact == "lora" and family in ("sd15", "sdxl", "flux", "sd35"):
        return "compatible", f"standalone {family} lora - safetensors - loads via load_lora_weights"
    if artifact == "checkpoint":
        return "experimental", f"{family} single-file checkpoint - load path lands with M5 from_single_file"
    return "experimental", f"{item_type} for {family} - wiring lands with M5 runtime resolution"


def search_civitai(
    query: str,
    session=None,
    types: Optional[List[str]] = None,
    base_models: Optional[List[str]] = None,
    include_nsfw: bool = False,
    sort: str = "Most Downloaded",
    page_size: int = 20,
    token: Optional[str] = None,
) -> List[SearchResult]:
    """One page of classified CivitAI results. Caller owns offline handling."""
    if session is None:
        import requests

        session = requests
    params = {
        "query": query,
        "limit": page_size,
        "sort": sort,
        "nsfw": "true" if include_nsfw else "false",
    }
    if types:
        params["types"] = types
    if base_models:
        params["baseModels"] = base_models
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    resp = session.get(CIVITAI_API, params=params, headers=headers, timeout=_TIMEOUT)
    resp.raise_for_status() if hasattr(resp, "raise_for_status") else None
    items = resp.json().get("items", [])

    results: List[SearchResult] = []
    for item in items:
        nsfw = bool(item.get("nsfw"))
        if nsfw and not include_nsfw:
            continue  # client-side guard on top of the API param
        versions = item.get("modelVersions") or []
        if not versions:
            continue
        version = versions[0]
        files = version.get("files") or []
        primary = files[0] if files else {}
        meta = primary.get("metadata") or {}
        fmt = {"SafeTensor": "safetensors", "PickleTensor": "pickle"}.get(meta.get("format"))
        family = CIVITAI_BASE_FAMILY.get(version.get("baseModel") or "")
        tier, reason = _classify_civitai(item.get("type") or "", family, fmt)
        sha256 = ((primary.get("hashes") or {}).get("SHA256") or "").lower() or None
        download_url = primary.get("downloadUrl")
        size_kb = primary.get("sizeKB") or 0
        results.append(
            SearchResult(
                id=f"search-civitai--{item['id']}-{version.get('id', 0)}",
                source="civitai",
                name=item.get("name") or f"civitai-{item['id']}",
                repo_id=None,
                tier=tier,
                tier_reason=reason,
                artifact_type=_TYPE_TO_ARTIFACT.get(item.get("type") or "", "unknown"),
                base_architecture=family or "unknown",
                downloads=(item.get("stats") or {}).get("downloadCount", 0),
                likes=(item.get("stats") or {}).get("thumbsUpCount", 0),
                author=(item.get("creator") or {}).get("username"),
                nsfw=nsfw,
                format=fmt,
                size=f"{size_kb / 1024 / 1024:.1f} GB" if size_kb else "Unknown",
                download_url=download_url,
                sha256=sha256,
            )
        )
    return results
```

- [ ] **Step 4: Verify green**

Run: `cd backend && venv/Scripts/python.exe -m pytest tests/test_foundry_civitai_search.py -q`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/foundry/civitai_search.py backend/tests/test_foundry_civitai_search.py
git commit -m "feat(foundry): CivitAI search - NSFW-off default, vocab map, pickle detection, sha256 capture"
```

---

### Task 10: Search route + transient registry layer

**Files:**
- Modify: `backend/foundry/registry.py` (transient layer)
- Modify: `backend/main.py` (`GET /api/models/search`)
- Test: `backend/tests/test_foundry_registry.py` (transient cases)
- Test: `backend/tests/test_foundry_search_api.py` (integration)

- [ ] **Step 1: Write the failing registry tests** (append to `test_foundry_registry.py`)

```python
class TransientLayerTests(unittest.TestCase):
    # Build registry the same way the file's existing tests do (tmp catalog).
    def test_transient_records_resolvable_but_not_listed(self):
        registry = make_registry()  # the file's existing module-level helper (add `from foundry.model_record import ModelRecord` to the imports)
        record = ModelRecord(
            id="search-hf--org-model", name="model", artifact_type="diffusers-pipeline",
            capability="image", base_architecture="sdxl", source="huggingface",
            repo_id="org/model", tier="compatible", tier_reason="x",
        )
        registry.register_transient([record])
        self.assertIsNotNone(registry.get_record("search-hf--org-model"))
        listed_ids = {r["id"] for r in registry.list_records()}
        self.assertNotIn("search-hf--org-model", listed_ids)

    def test_transient_never_shadows_catalog_or_indexed(self):
        registry = make_registry()
        catalog_id = next(iter(registry.records))
        shadow = ModelRecord(
            id=catalog_id, name="shadow", artifact_type="checkpoint",
            capability="image", base_architecture="flux", source="huggingface",
        )
        registry.register_transient([shadow])
        self.assertNotEqual(registry.get_record(catalog_id)["name"], "shadow")

    def test_register_transient_replaces_wholesale(self):
        registry = make_registry()
        a = ModelRecord(id="search-hf--a", name="a", artifact_type="checkpoint",
                        capability="image", base_architecture="sdxl", source="huggingface")
        b = ModelRecord(id="search-hf--b", name="b", artifact_type="checkpoint",
                        capability="image", base_architecture="sdxl", source="huggingface")
        registry.register_transient([a])
        registry.register_transient([b])
        self.assertIsNone(registry.get_record("search-hf--a"))
        self.assertIsNotNone(registry.get_record("search-hf--b"))

    def test_transient_status_is_not_found(self):
        registry = make_registry()
        a = ModelRecord(id="search-hf--a", name="a", artifact_type="checkpoint",
                        capability="image", base_architecture="sdxl", source="huggingface",
                        status="ready")  # lies from outside are normalized
        registry.register_transient([a])
        self.assertEqual(registry.get_record("search-hf--a")["status"], "not_found")
```

- [ ] **Step 2: Run red**, then **Step 3: Implement in `registry.py`**

Add to `__init__`: `self._transient: Dict[str, ModelRecord] = {}`.

```python
    def register_transient(self, records: List[ModelRecord]) -> None:
        """Replace the transient search layer (spec 2.3: results merge transiently).

        Transient records are get-able and download-able but never listed -
        the search response is their listing surface. They never shadow
        catalog or indexed records and always report not_found until acquired.
        """
        merged: Dict[str, ModelRecord] = {}
        for record in records:
            if record.id in self.records or record.id in self._indexed:
                continue
            owned = copy.copy(record)
            owned.locations = list(record.locations)
            owned.status = "not_found"
            merged[record.id] = owned
        self._transient = merged
```

In `get_record`, extend the lookup chain:
`record = self.records.get(canonical) or self._indexed.get(canonical) or self._transient.get(canonical)`.
`list_records` is untouched (transient never listed). In `_live_status`, transient
records short-circuit: if the record object is in `self._transient.values()`
(check `canonical in self._transient and record is self._transient[canonical]`),
return the provider status if any, else `"not_found"` - simplest: transient
records take the same path; `_is_present` will be False for them and the
catalog-default fallthrough returns their stored `"not_found"`. Verify with the
tests rather than adding special cases.

- [ ] **Step 4: Add the search route to `main.py`** - in the literal block, BEFORE `GET /api/models/{model_id}` (route order is load-bearing: `/api/models/search` would otherwise match `{model_id}`):

```python
@app.get("/api/models/search", response_model=SearchResponseSchema, tags=["Models"])
@limiter.limit("30/minute")
async def search_models(
    request: Request,
    q: str = "",
    source: str = "hf",
    task: Optional[str] = None,
    sort: str = "downloads",
    page: int = 1,
    nsfw: bool = False,
    author: Optional[str] = None,
):
    """Search HF or CivitAI. Offline-degrading: failures return offline=True,
    never a 5xx - the local library stays fully operational (spec 5.1)."""
    if source not in ("hf", "civitai"):
        raise HTTPException(status_code=400, detail="source must be 'hf' or 'civitai'")
    loop = asyncio.get_running_loop()
    try:
        if source == "hf":
            from huggingface_hub import HfApi

            hf_token = request.headers.get("X-HF-Token")
            api = HfApi(token=hf_token)
            results = await loop.run_in_executor(
                None,
                lambda: hub_search.search_hf(
                    api, query=q, verified_repo_ids=_verified_repo_ids(),
                    task=task, sort=sort, page=page, author=author,
                ),
            )
        else:
            civitai_token = request.headers.get("X-Civitai-Token")
            results = await loop.run_in_executor(
                None,
                lambda: civitai_search.search_civitai(
                    q, include_nsfw=nsfw, token=civitai_token,
                ),
            )
    except Exception as exc:
        return SearchResponseSchema(
            source=source, query=q, page=page, results=[],
            offline=True, warning=f"search unavailable: {type(exc).__name__}",
        )
    registry.register_transient([_search_result_to_record(r) for r in results])
    return SearchResponseSchema(
        source=source, query=q, page=page,
        results=[SearchResultSchema(**asdict(r)) for r in results],
    )
```

With module-level helpers near the other foundry wiring in `main.py`:

```python
def _verified_repo_ids() -> set:
    return {r.repo_id for r in registry.records.values() if r.repo_id}


def _search_result_to_record(result) -> ModelRecord:
    return ModelRecord(
        id=result.id, name=result.name, artifact_type=result.artifact_type,
        capability=result.capability, base_architecture=result.base_architecture,
        source=result.source, repo_id=result.repo_id, size=result.size,
        status="not_found", tier=result.tier, tier_reason=result.tier_reason,
        quality="local", license=result.license, gated=result.gated,
        format=result.format, trust_remote_code=result.trust_remote_code,
        nsfw=result.nsfw, download_url=result.download_url, sha256=result.sha256,
    )
```

(`from dataclasses import asdict` and `from foundry import hub_search, civitai_search`
join the existing foundry import block. `SearchResult` already has `capability`.)

- [ ] **Step 5: Integration test** `backend/tests/test_foundry_search_api.py` - patch `hub_search.search_hf` / `civitai_search.search_civitai` at the `main` import site; cases: (1) hf happy path returns classified results AND `GET /api/models/{transient-id}` then resolves, (2) network exception -> 200 with `offline: true`, (3) bad source -> 400, (4) civitai nsfw param default false forwarded, (5) `X-HF-Token` reaches `HfApi` ctor (patch `huggingface_hub.HfApi` in `main`'s scope and assert `token=` kwarg) and is never logged. Mirror the setup/teardown style of `test_foundry_library_api.py`.

- [ ] **Step 6: Run**

Run: `cd backend && venv/Scripts/python.exe -m pytest tests/test_foundry_registry.py tests/test_foundry_search_api.py -q`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/foundry/registry.py backend/main.py backend/tests/test_foundry_registry.py backend/tests/test_foundry_search_api.py
git commit -m "feat(foundry): /api/models/search with transient registry layer + offline degrade"
```

---

### Task 11: CivitAI acquisition - direct-URL branch in DownloadManager with sha256 verification

**Files:**
- Modify: `backend/foundry/download_manager.py`
- Test: `backend/tests/test_foundry_civitai_download.py`

- [ ] **Step 1: Write the failing tests** (requests mocked; tmp dirs; follow the existing `test_foundry_download_manager.py` harness for registry/record stubs)

```python
"""CivitAI direct-URL download: stream -> .incomplete -> sha256 verify -> atomic move.

Never trusts the URL: https + civitai.com host required. A hash mismatch
deletes the partial and surfaces a typed error - corrupt bytes never present
as ready (spec 3.5 discipline, CivitAI hashes from Spike C).
"""

import hashlib
import os
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from foundry.download_manager import DownloadManager, validate_civitai_url


class UrlValidationTests(unittest.TestCase):
    def test_https_civitai_ok(self):
        validate_civitai_url("https://civitai.com/api/download/models/99")

    def test_http_rejected(self):
        with self.assertRaises(ValueError):
            validate_civitai_url("http://civitai.com/api/download/models/99")

    def test_other_host_rejected(self):
        with self.assertRaises(ValueError):
            validate_civitai_url("https://evil.example.com/file.safetensors")

    def test_userinfo_spoof_rejected(self):
        with self.assertRaises(ValueError):
            validate_civitai_url("https://civitai.com@evil.example.com/x")


class CivitaiDownloadTests(unittest.TestCase):
    # The implementer wires these through the SAME harness the existing
    # download-manager tests use (stub registry/record dicts, run the private
    # method synchronously). Core assertions:

    def test_happy_path_verifies_sha256_and_moves_atomically(self):
        payload = b"weights-bytes"
        digest = hashlib.sha256(payload).hexdigest()
        # record: source=civitai, download_url valid, sha256=digest,
        # artifact_type=lora -> target loras/<id>.safetensors
        # mock requests.get -> iter_content yielding payload chunks
        # assert: final file exists with payload; no .incomplete remains;
        # job.status == "ready"

    def test_sha256_mismatch_deletes_partial_and_errors(self):
        ...  # record sha256 = "0"*64; assert job.status == "error",
        # "sha256" in job.error, no final file, no .incomplete file

    def test_missing_download_url_is_typed_error(self):
        ...  # job.status == "error", "download_url" in job.error

    def test_token_sent_as_bearer_header_only(self):
        ...  # assert Authorization: Bearer <token> in requests.get headers,
        # token absent from job/record/error strings


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run red**, then **Step 3: Implement**

In `backend/foundry/download_manager.py`:

```python
from urllib.parse import urlparse


def validate_civitai_url(url: str) -> None:
    """Supply-chain guard: only https://civitai.com/... download URLs."""
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "civitai.com":
        raise ValueError(f"refusing non-civitai download url: {url[:80]}")
```

In `_execute`, branch before the HF path:

```python
        if record.get("source") == "civitai":
            await asyncio.get_running_loop().run_in_executor(
                None, self._download_civitai, model_id, record, token
            )
            ...  # then the same verifying -> ready transition the HF path uses
```

`_download_civitai(self, model_id, record, token)`:
1. `url = record.get("download_url")` - missing -> raise the manager's typed error ("no download_url on civitai record").
2. `validate_civitai_url(url)`.
3. `import requests` (lazy); GET with `stream=True`, `timeout=(5, 60)`, `headers={"Authorization": f"Bearer {token}"}` only when token.
4. Stream chunks (1 MiB) to `<target>.incomplete`, feeding `hashlib.sha256` and the progress sink (`total_bytes` from `Content-Length` when present).
5. If `record.get("sha256")`: compare case-insensitively; mismatch -> delete the `.incomplete`, raise typed error `"sha256 mismatch - corrupt or tampered download"`.
6. `os.replace(incomplete, target)` - complete-or-absent, same discipline as `linker._copy`.
7. Target dir from `artifact_type` via the existing `_target_dir` mapping; filename `<model_id>.safetensors` (or the URL filename if the manager already extracts one for CivitAI legacy paths - match `_target_dir` conventions).

- [ ] **Step 4: Run**

Run: `cd backend && venv/Scripts/python.exe -m pytest tests/test_foundry_civitai_download.py tests/test_foundry_download_manager.py -q`
Expected: PASS, no HF-path regressions.

- [ ] **Step 5: Commit**

```bash
git add backend/foundry/download_manager.py backend/tests/test_foundry_civitai_download.py
git commit -m "feat(foundry): CivitAI direct-URL downloads with sha256 verification + host allowlist"
```

---

### Task 12: Convert-to-safetensors (lazy torch, `weights_only=True`)

**Files:**
- Create: `backend/foundry/convert.py`
- Modify: `backend/main.py` (`POST /api/models/{model_id}/convert-safetensors`)
- Modify: `backend/foundry/schemas.py` (`ConvertResultSchema`)
- Test: `backend/tests/test_foundry_convert.py`

- [ ] **Step 1: Write the failing tests** (torch mocked via `sys.modules` patch - CI has no torch; locally we still never load real weights)

```python
"""pickle -> safetensors conversion. torch.load(weights_only=True) is the
security boundary: tensor deserialization only, never arbitrary unpickling."""

import sys
import unittest
from unittest.mock import MagicMock, patch

from foundry.convert import ConvertUnavailableError, convert_pickle_to_safetensors


class ConvertTests(unittest.TestCase):
    def test_torch_missing_raises_typed_unavailable(self):
        with patch.dict(sys.modules, {"torch": None, "safetensors.torch": None}):
            with self.assertRaises(ConvertUnavailableError):
                convert_pickle_to_safetensors("in.ckpt", "out.safetensors")

    def test_weights_only_true_is_mandatory(self):
        torch = MagicMock()
        torch.load.return_value = {"w": MagicMock(shape=(1,))}
        st = MagicMock()
        with patch.dict(sys.modules, {"torch": torch, "safetensors": MagicMock(torch=st), "safetensors.torch": st}):
            convert_pickle_to_safetensors("in.ckpt", "out.safetensors")
        self.assertTrue(torch.load.call_args.kwargs.get("weights_only"))

    def test_state_dict_container_unwrapped(self):
        inner = {"w": MagicMock(shape=(1,))}
        torch = MagicMock()
        torch.load.return_value = {"state_dict": inner, "epoch": 3}
        st = MagicMock()
        with patch.dict(sys.modules, {"torch": torch, "safetensors": MagicMock(torch=st), "safetensors.torch": st}):
            convert_pickle_to_safetensors("in.ckpt", "out.safetensors")
        saved = st.save_file.call_args.args[0]
        self.assertIn("w", saved)
        self.assertNotIn("epoch", saved)

    def test_save_goes_through_temp_then_replace(self):
        torch = MagicMock()
        torch.load.return_value = {"w": MagicMock(shape=(1,))}
        st = MagicMock()
        with patch.dict(sys.modules, {"torch": torch, "safetensors": MagicMock(torch=st), "safetensors.torch": st}):
            with patch("foundry.convert.os.replace") as replace:
                convert_pickle_to_safetensors("in.ckpt", "out.safetensors")
        tmp_path = st.save_file.call_args.args[1]
        self.assertTrue(tmp_path.endswith(".converting"))
        replace.assert_called_once_with(tmp_path, "out.safetensors")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run red**, then **Step 3: Implement `backend/foundry/convert.py`**

```python
"""Offered convert-to-safetensors for consented pickle artifacts (spec 5.3).

Security boundary: torch.load(..., weights_only=True) refuses arbitrary
unpickling - only tensor payloads deserialize. Output is staged to
<dest>.converting then os.replace'd: complete-or-absent.
"""

import os


class ConvertUnavailableError(RuntimeError):
    """torch/safetensors not importable (stub mode) - surface as 503."""


def convert_pickle_to_safetensors(src_path: str, dest_path: str) -> int:
    try:
        import torch
        from safetensors.torch import save_file
    except (ImportError, AttributeError) as exc:
        raise ConvertUnavailableError(f"conversion requires torch: {exc}") from exc

    state = torch.load(src_path, map_location="cpu", weights_only=True)
    if isinstance(state, dict) and isinstance(state.get("state_dict"), dict):
        state = state["state_dict"]
    tensors = {k: v for k, v in state.items() if hasattr(v, "shape")}
    if not tensors:
        raise ValueError(f"no tensors found in {src_path}")

    tmp = dest_path + ".converting"
    save_file(tensors, tmp)
    os.replace(tmp, dest_path)
    return len(tensors)
```

- [ ] **Step 4: Route in `main.py`** (dynamic block, alongside the other `{model_id}` routes; heavy -> 5/minute; consent + file checks; executor):

```python
@app.post("/api/models/{model_id}/convert-safetensors", response_model=ConvertResultSchema, tags=["Models"])
@limiter.limit("5/minute")
async def convert_model_to_safetensors(request: Request, model_id: str):
    record = registry.get_record(model_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"unknown model: {model_id}")
    if not consent_store.get(model_id)["pickle"]:
        raise HTTPException(status_code=409, detail={
            "error_code": "pickle-consent-required",
            "message": "Converting requires reading the pickle file - grant pickle consent first."})
    src = next((p for p in record.get("locations", [])
                if p.lower().endswith((".ckpt", ".pt", ".pth", ".bin"))), None)
    if src is None or not os.path.isfile(src):
        raise HTTPException(status_code=409, detail={
            "error_code": "no-pickle-source",
            "message": "No local pickle file found for this model - download it first."})
    dest = os.path.splitext(src)[0] + ".safetensors"
    loop = asyncio.get_running_loop()
    try:
        tensor_count = await loop.run_in_executor(
            None, convert_pickle_to_safetensors, src, dest)
    except ConvertUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except (ValueError, OSError) as exc:
        raise HTTPException(status_code=422, detail=f"conversion failed: {exc}")
    return ConvertResultSchema(model_id=model_id, safetensors_path=dest, tensor_count=tensor_count)
```

`ConvertResultSchema` in `schemas.py`:

```python
class ConvertResultSchema(BaseModel):
    model_config = {"protected_namespaces": ()}

    model_id: str
    safetensors_path: str
    tensor_count: int
```

Add API-level cases to `test_foundry_consent_api.py` (same file - it owns the
consent surface): 404 unknown id; 409 without consent; 409 no pickle source;
503 when `convert_pickle_to_safetensors` raises `ConvertUnavailableError`
(patch it at `main`'s import site).

- [ ] **Step 5: Run**

Run: `cd backend && venv/Scripts/python.exe -m pytest tests/test_foundry_convert.py tests/test_foundry_consent_api.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/foundry/convert.py backend/foundry/schemas.py backend/main.py backend/tests/test_foundry_convert.py backend/tests/test_foundry_consent_api.py
git commit -m "feat(foundry): consent-gated pickle->safetensors conversion (weights_only boundary)"
```

---

### Task 13: Electron + frontend - tokens, IPC, types, slice

**Files:**
- Modify: `electron/services/backendAuth.ts`, `electron/services/backendAuth.test.ts`
- Modify: `electron/main.ts`
- Modify: `electron/ipc-handlers/generation.ts`
- Modify: `electron/preload.ts`
- Modify: `src/types/electron.d.ts`
- Modify: `src/types/model.ts`
- Modify: `src/store/slices/modelsSlice.ts`, `src/store/appStore.types.ts`
- Test: `src/store/slices/librarySelectors.test.ts`

- [ ] **Step 1: backendAuth - CivitAI token twin** (test-first in `backendAuth.test.ts`, mirroring the existing `setHfToken` cases: set/trim/clear/undefined):

```typescript
export function setCivitaiToken(token: string | undefined): void {
  _civitaiToken = token && token.trim() ? token.trim() : undefined;
}

export function civitaiTokenHeaders(): Record<string, string> {
  return _civitaiToken ? { 'X-Civitai-Token': _civitaiToken } : {};
}
```

with `let _civitaiToken: string | undefined;` beside `_hfToken`. In
`electron/main.ts`, register `auth:setCivitaiToken` exactly like the existing
`auth:setHfToken` handler (type-check the arg, call `setCivitaiToken`).

- [ ] **Step 2: IPC handlers in `generation.ts`** (existing `requestBackend`/`backendAuthHeaders`/`toSafeRendererError` pattern):

```typescript
ipcMain.handle(
  'models:search',
  async (_event, query: string, source: 'hf' | 'civitai', page: number, nsfw: boolean) => {
    try {
      const response = await requestBackend(() =>
        axios.get(`${BACKEND_URL}/api/models/search`, {
          params: { q: query, source, page, nsfw },
          headers: { ...backendAuthHeaders(), ...hfTokenHeaders(), ...civitaiTokenHeaders() },
        }),
      );
      return response.data;
    } catch (error: any) {
      console.error('Model search error:', error);
      return {
        source,
        query,
        page,
        results: [],
        offline: true,
        warning: toSafeRendererError(error, 'Model search failed'),
      };
    }
  },
);

ipcMain.handle(
  'models:consent',
  async (_event, modelId: string, kind: 'pickle' | 'trust_remote_code', granted: boolean) => {
    try {
      const response = await requestBackend(() =>
        axios.post(
          `${BACKEND_URL}/api/models/consent`,
          { model_id: modelId, kind, granted },
          { headers: backendAuthHeaders() },
        ),
      );
      return response.data;
    } catch (error: any) {
      console.error('Model consent error:', error);
      return { success: false, error: toSafeRendererError(error, 'Consent update failed') };
    }
  },
);

ipcMain.handle('models:convert', async (_event, modelId: string) => {
  try {
    const response = await requestBackend(() =>
      axios.post(
        `${BACKEND_URL}/api/models/${encodeURIComponent(modelId)}/convert-safetensors`,
        undefined,
        { headers: backendAuthHeaders() },
      ),
    );
    return response.data;
  } catch (error: any) {
    console.error('Model convert error:', error);
    return { success: false, error: toSafeRendererError(error, 'Conversion failed') };
  }
});
```

(`hfTokenHeaders`/`civitaiTokenHeaders` import from `../services/backendAuth` -
`hfTokenHeaders` is already exported.)

- [ ] **Step 3: preload + d.ts.** `electron/preload.ts` models block gains:

```typescript
    search: (query: string, source: 'hf' | 'civitai', page: number, nsfw: boolean) =>
      ipcRenderer.invoke('models:search', query, source, page, nsfw),
    consent: (modelId: string, kind: 'pickle' | 'trust_remote_code', granted: boolean) =>
      ipcRenderer.invoke('models:consent', modelId, kind, granted),
    convert: (modelId: string) => ipcRenderer.invoke('models:convert', modelId),
```

auth block gains `setCivitaiToken: (token: string) => ipcRenderer.invoke('auth:setCivitaiToken', token),`.
Mirror all four (typed) in BOTH the preload interface near the top of the file
and `src/types/electron.d.ts`.

- [ ] **Step 4: Types in `src/types/model.ts`:**

```typescript
export type SearchSource = 'hf' | 'civitai';
export type ConsentKind = 'pickle' | 'trust_remote_code';

export interface SearchResult {
  id: string;
  source: 'huggingface' | 'civitai';
  name: string;
  repo_id: string | null;
  tier: ModelTier;
  tier_reason: string;
  artifact_type: string;
  base_architecture: string;
  capability: ModelCapability;
  downloads: number;
  likes: number;
  author: string | null;
  license: string | null;
  gated: boolean;
  nsfw: boolean;
  format: 'safetensors' | 'pickle' | 'diffusers' | null;
  trust_remote_code: boolean;
  size: string;
  tags: string[];
}

export interface SearchResponse {
  source: SearchSource;
  query: string;
  page: number;
  results: SearchResult[];
  offline: boolean;
  warning: string | null;
}
```

- [ ] **Step 5: Slice.** In `src/store/slices/modelsSlice.ts` add state
`searchResults: SearchResult[]`, `searchStatus: 'idle' | 'loading' | 'ready' | 'offline'`,
`searchQuery: string`, `searchSource: SearchSource`, `searchPage: number`,
`searchWarning: string | null`, `nsfwOptIn: boolean` (default `false`, session-only),
and actions following the slice's existing local-first async pattern:

```typescript
  searchModels: async (query, source, page = 1) => {
    set({ searchStatus: 'loading', searchQuery: query, searchSource: source, searchPage: page });
    const nsfw = source === 'civitai' ? get().nsfwOptIn : false;
    const response = (await window.electron.models.search(query, source, page, nsfw)) as SearchResponse;
    set({
      searchResults: response.results ?? [],
      searchStatus: response.offline ? 'offline' : 'ready',
      searchWarning: response.warning ?? null,
    });
  },
  setNsfwOptIn: (optIn) => set({ nsfwOptIn: optIn }),
  grantConsent: async (modelId, kind, granted) => {
    await window.electron.models.consent(modelId, kind, granted);
  },
  convertModel: async (modelId) => window.electron.models.convert(modelId),
```

Register the new fields/actions in `src/store/appStore.types.ts` (same shape the
M3 library fields use). Selector tests in `librarySelectors.test.ts`: search
status transitions (loading -> ready, loading -> offline with warning), nsfw
opt-in default false, results replaced per search. Mock `window.electron`
exactly as the file's existing tests do.

- [ ] **Step 6: Full frontend gate**

Run: `npm run typecheck && npm test`
Expected: PASS (husky will re-run on commit - keep the diff staged together).

- [ ] **Step 7: Commit**

```bash
git add electron/services/backendAuth.ts electron/services/backendAuth.test.ts electron/main.ts electron/ipc-handlers/generation.ts electron/preload.ts src/types/electron.d.ts src/types/model.ts src/store/slices/modelsSlice.ts src/store/appStore.types.ts src/store/slices/librarySelectors.test.ts
git commit -m "feat(models): search/consent/convert IPC + slice + CivitAI token channel"
```

---

### Task 14: Docs sync + milestone gate

**Files:**
- Modify: `docs/API_ENDPOINTS.md` (hand-curated)
- Modify: `docs/api/openapi.json` (hand-curated - NEVER regenerate from FastAPI)

- [ ] **Step 1: Document** the 3 new routes (`GET /api/models/search`, `POST /api/models/consent`, `POST /api/models/{model_id}/convert-safetensors`) with params, status codes (incl. 409 consent error codes, 503 convert-unavailable, offline-degrade 200 shape), the 6 new ModelRecord fields, `SearchResult`/`SearchResponse`/`ConsentState`/`ConvertResult` schemas, the 4 new IPC channels (`models:search`, `models:consent`, `models:convert`, `auth:setCivitaiToken`), and the `X-Civitai-Token` header convention - following the existing format of both files exactly.

- [ ] **Step 2: Milestone gate** (all must be green before the PR):

```
cd backend && venv/Scripts/python.exe -m pytest tests/ -q -k "foundry"     # all foundry suites
npm run typecheck
npm test
npm run build
```

Expected: all green. (Full backend suite runs 2h13m locally with real models - the foundry-filtered run plus CI's stub-mode full run is the gate; do NOT pipe pytest through tail, read the summary line.)

- [ ] **Step 3: Commit**

```bash
git add docs/API_ENDPOINTS.md docs/api/openapi.json
git commit -m "docs(api): M4 search/consent/convert routes, schemas, and IPC channels"
```

---

## Out of scope (deliberate, documented)

- **Browse/search panel composition** - slice + IPC + types land here; the dockview panel surface is the design agent's Carbon Pro pass (spec 7.3 coordination flag, same split as M3).
- **`from_single_file` load path** - M5 (`resolve_model_runtime`); until then single-file checkpoints honestly tier Experimental.
- **trust_remote_code enforcement at LOAD time** - the consent record + download gate land here; the loader-side enforcement point arrives with M5 runtime resolution (no loader accepts arbitrary repos today).
- **HF README model-card rendering in-app** - search results carry metadata; card rendering is a UI-pass concern.
- **Search result caching/debounce server-side** - the frontend debounces; CivitAI gets hard timeouts + offline degrade now, response caching when usage data justifies it.

## After the milestone

Per spec 8.4: **Codex independent review (supply-chain gate)** on the merged M4 surface - pickle consent, `trust_remote_code`, NSFW defaults, URL allowlist, token handling. Run it on the PR before starting M5.
