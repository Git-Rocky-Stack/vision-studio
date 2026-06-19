# Vision Studio - M7 AI Director: RAG + Context Optimization (Design Spec)

> **Status:** Approved design (2026-06-18). Elaborates the M7 section of the
> Path-to-v1 Program Roadmap
> (`docs/superpowers/specs/2026-06-15-vision-studio-path-to-v1-roadmap-design.md`).
> This spec is the just-in-time elaboration of an already-locked milestone; it
> does **not** re-open program scope. It inherits the program's cross-cutting
> engineering rails by reference and resolves M7's three open decisions. Next
> artifact: the implementation plan via the writing-plans skill.

## 1. Context and goal

Pillar 4 (the Director). **Goal:** a local-first retrieval + context-assembly
layer that makes the app's LLM prompt-assist genuinely *informed*. Given a
prompt-assist request, retrieve relevant material - the user's own prior prompts
and their outcomes, the user's asset-library metadata, and a curated
model-prompting knowledge base - then select, rank, and assemble the most useful
context within an explicit token budget and inject it into the LLM-assist
request. The assist becomes retrieval-augmented rather than zero-context, and the
user sees exactly what was used.

**Current surface this builds on (verified against the code):**

- `electron/ipc-handlers/generation.ts` - the prompt-assist seam:
  `generation:enhance-prompt` (~L360-430) and `generation:suggest-negative-prompt`
  (~L432-507) each branch three ways on
  `activeAccount.preferences.promptEnhancementProvider` (`openrouter` ->
  `openRouterService.enhancePrompt`; `huggingface` ->
  `huggingFaceService.enhancePrompt`; else local POST to
  `/api/prompts/enhance`). This is the single place where prompt, account, and
  provider converge - the **one injection seam**.
- `electron/services/openRouter.ts` - `enhancePrompt({apiKey,prompt,mode,model?,signal?})`
  (~L790-864); `buildUserTextMessage` (~L154-159) already documents that the
  user-message `content` array leaves room to append parts; the system prompt is a
  cache-pinned module constant with `cache_control: ephemeral` (~L125-145).
- `electron/services/huggingfaceInference.ts` - `enhancePrompt`/`suggestNegativePrompt`
  funnel through `chatJson(token, model, system, user, signal)` (~L279-301).
- `src/components/studio/PromptStudioPanel.tsx` / `PromptEnhancementToolkit.tsx` -
  the enhance/expand/negative-suggest trigger UI (renderer handlers ~L151-272).
- The retrieval corpus, as it exists **today**, lives entirely in the renderer
  Zustand store, persisted to localStorage (`src/store/appStore.ts` partialize
  ~L1129-1175; state/actions in `src/store/slices/generationSlice.ts`):
  `promptHistory` (cap 50), `favoritePrompts`, `assetLibrary` (cap 500, the
  generated-asset metadata), `batchResults` (cap 200). Types: `src/types/assets.ts`
  (`AssetRecord`), `src/types/generation.ts` (`PromptHistoryEntry`, `BatchResult`).
  The only outcome signal beyond job-terminal status is a boolean `favorite`.
- Backend lazy-ML + mock patterns to mirror: `backend/api/lora.py` (router +
  lazily-initialized `get_service()`), `backend/services/lora_service.py` and
  `backend/utils/direct_generator.py` (`try/except ImportError -> *_AVAILABLE`,
  single patchable seam), `backend/utils/prompt_service.py` (the deterministic
  local enhancer). Heavy ML deps in `requirements.txt` are commented out; code
  must run with them absent.
- Foundry catalog/classifier - the source of a selected model's **family /
  architecture**, used to match curated KB entries to the model being prompted for.

**What does not exist yet (this milestone is greenfield):** no embedding, vector,
FTS, or retrieval code anywhere; the backend SQLite `images`/`jobs` tables are
provisioned but never written and there is no runtime DB access layer; SQLite
loadable extensions are not enabled; there is no real LLM token counter
(`src/utils/promptTokenizer.ts` is a CLIP 75-token weight parser, not an
LLM-context budgeter). `numpy` is already a backend dependency.

## 2. Decisions locked for M7

1. **Embedding backend + index:** a CPU-friendly **local embedding model**
   (`all-MiniLM-L6-v2`, 384-dim) in the Python backend - lazily imported,
   `*_AVAILABLE`-guarded, mocked in CI via one patchable seam (the Foundry torch
   pattern) - with a **pure-NumPy brute-force cosine** index over the small corpus.
   No sqlite-vec / FAISS / FTS5 (zero native-extension packaging risk; `numpy`
   already present; sub-millisecond at this corpus size). A **deterministic
   lexical fallback** runs whenever the embedder is unavailable (CPU-only machine,
   model still downloading, import error). Semantic when available, lexical
   otherwise; never a hard failure. (Rejected: B local model + sqlite-vec/FTS5 -
   imports a native-extension bundling risk and the first runtime DB layer for
   scale we do not need; C routed embeddings - sends corpus text to a hosted
   provider, violating the local-first privacy rail, so permissible only as a
   future opt-in, never the default.)
2. **Model-prompting knowledge base:** a **curated, repo-shipped** structured KB
   (`backend/data/prompting_kb/*.json`), versioned in-repo and attributed to
   public model cards/docs, keyed by model **architecture/family** (SD 1.5, SDXL,
   FLUX, video families, etc.). Each entry carries positive/negative conventions,
   sampler/steps/cfg hints, resolution notes, and trigger-word patterns. Matched
   to the active model via the Foundry catalog's family classification. License-
   clean, deterministic, network-free, fully testable; kept small and high-signal
   for v1. (Rejected: B catalog-derived hints - low-signal, KB quality coupled to
   catalog metadata richness; C user's own prompts as the KB - cold-starts empty
   and overlaps the prior-prompts corpus already in scope.)
3. **Retrieval scope defaults and user controls:** augmentation is **on by
   default**, drawing on all three corpora (prior prompts/outcomes, asset
   metadata, curated KB) within a token budget, **up-weighting favorites and
   successful outcomes**. Controls: a global toggle, per-source toggles, a visible
   **"context used" disclosure** on each assist, index **clear/rebuild**, and
   secrets **never indexed**. Retrieved and model-authored text is treated strictly
   as **data, never instructions** (prompt-injection defense). (Rejected: B opt-in/
   off-by-default - ships the feature dark; C single global toggle only - thin on
   the "user controls" and privacy-granularity requirement.)

## 3. Architecture: three layers, one job each

```
  Renderer (src/)                Electron main (electron/)         Backend (Python)
  +---------------------+   IPC  +---------------------------+ HTTP +-------------------+
  | ingest triggers     |------->| retrievalClient.ts        |----->| /api/v1/retrieval |
  | controls UI         |        | contextAssembler.ts       |      |  RetrievalService |
  | "context used"      |<-------| generation.ts injection   |<-----|  embedder (lazy)  |
  |  disclosure         | result |  seam (enhance/suggest)    | snip |  index (NumPy cos) |
  +---------------------+        +---------------------------+      |  knowledge base   |
                                                                    +-------------------+
        owns: triggers,            owns: budget, DATA-block            owns: embeddings,
        controls, transparency     assembly, injection into            ranking, KB, the
                                   the LLM user message                 persisted index
```

- **Backend (Python)** owns the *retrieval store* - the only heavy/ML + vector-math
  piece, where the lazy-import + mock pattern and `numpy` already live (roadmap
  M7 test strategy: "the embedding backend is lazily loaded and mocked like the
  Foundry's torch pattern").
- **Electron main** owns *context assembly + injection* at the existing
  `generation.ts` prompt-assist seam, where prompt + account + chosen LLM route
  converge. It computes the token budget and is the **trust-boundary owner**:
  retrieved snippets are wrapped as delimited data before they reach any LLM.
- **Renderer** owns *ingestion triggers, the controls UI, and the transparency
  disclosure*. It never talks to the backend directly; the established
  renderer -> IPC -> main -> backend-HTTP path is preserved.

**Index persistence is file-based**, not SQLite: `userData/data/retrieval/`
(`vectors.npz` + `corpus.json`, keyed by content hash). This deliberately avoids
building the first runtime DB access layer and any native-extension/PyInstaller
risk; the corpus is small and a file cache is sufficient and lower-risk.

**Relationship to M6 routing.** Prompt-assist routing is resolved separately from
`shared/resolveRoute.ts` (which owns image/video local-vs-hosted routing) - it
uses the per-account `promptEnhancementProvider` branch in `generation.ts`. M7
attaches to the **prompt-assist** path and does **not** modify `resolveRoute`.

## 4. The retrieval store (backend)

New package `backend/services/retrieval/` plus an `/api/v1/retrieval` router
mirroring `backend/api/lora.py`.

```python
# embedder.py - the one heavy/ML seam, mockable
class Embedder:
    def __init__(self, model_name="all-MiniLM-L6-v2"): ...
    @property
    def available(self) -> bool: ...          # *_AVAILABLE guard
    def embed(self, texts: list[str]) -> "np.ndarray": ...   # (n, 384), L2-normalized

# index_store.py - pure NumPy cosine over the small corpus
class IndexStore:
    def upsert(self, items: list[CorpusItem]) -> None: ...    # content-hash dedupe
    def remove(self, ids: list[str]) -> None: ...
    def clear(self) -> None: ...
    def query(self, vector: "np.ndarray", k: int,
              sources: set[Source]) -> list[ScoredItem]: ...   # cosine, source-filtered
    def persist(self) -> None: ...                            # vectors.npz + corpus.json
    def load(self) -> None: ...

# knowledge_base.py - curated, repo-shipped, family-keyed
class KnowledgeBase:
    def entries_for_family(self, family: str | None) -> list[KbEntry]: ...

# retrieval_service.py - orchestration
class RetrievalService:
    def ingest(self, records: list[IngestRecord]) -> IngestStats: ...   # sanitize + embed + upsert
    def query(self, text: str, model_family: str | None,
              sources: set[Source], max_tokens: int) -> RetrievalResult: ...
    def clear(self) -> None: ...
    def stats(self) -> IndexStats: ...
```

- `Source = 'prompt-history' | 'assets' | 'knowledge-base'`. A `ScoredItem` carries
  `{id, source, text, score, metadata}`; favorited or successfully-completed items
  receive a fixed score multiplier so they rank above otherwise-equal neighbours.
  The available outcome signals are exactly the two that exist today - the boolean
  `favorite` flag and job-terminal `completed` (vs failed) status; M7 builds **no**
  new rating system, it weights on what the store already records.
- `query` ranks each enabled source (semantic via `Embedder`, else the lexical
  fallback - token-overlap / term-frequency scoring reusing the de-dup helpers'
  spirit), merges the curated KB entries for `model_family`, then selects greedily
  by score until `max_tokens` is reached, returning a `RetrievalResult` with the
  chosen snippets **and** per-snippet provenance.
- The embedder follows the `try/except ImportError -> EMBEDDER_AVAILABLE` rail and
  exposes one patchable seam so tests inject deterministic fake vectors; the
  service runs fully in lexical mode when the model is absent.

## 5. Context assembler + injection seam (main)

```ts
// electron/services/retrievalClient.ts - typed client to /api/v1/retrieval
// electron/services/contextAssembler.ts
interface AssembledContext {
  contextBlock: string;          // delimited DATA block, or '' when nothing retrieved
  provenance: ContextProvenanceItem[];   // {source, label, snippetPreview, score}
  estimatedTokens: number;
}
function assembleContext(args: {
  query: string;
  retrieved: RetrievalSnippet[];
  maxTokens: number;
}): AssembledContext
```

At `generation:enhance-prompt` / `suggest-negative-prompt`, when augmentation is
enabled:

1. Resolve the **two** models in play (S8): the LLM doing the enhancement (sets the
   token budget) and the image model being prompted for (sets the KB family match).
2. Compute `maxTokens` from the LLM route's context window and call
   `retrievalClient.query({ text, modelFamily, sources, maxTokens })`.
3. `assembleContext` wraps the snippets in a single clearly-delimited **DATA**
   block (S10) and the handler appends it to the **user** message - never the
   system prompt - via the existing `buildUserTextMessage` seam, preserving the
   cache-pinned prefix.
4. Dispatch to the resolved provider branch unchanged (OpenRouter / HF / local),
   then return `{ ...result, provenance }` so the renderer can disclose what was used.

The injection is identical across all three provider branches because it happens
**before** the branch, on the assembled user message. If retrieval yields nothing
(or is disabled, or the backend is unreachable), `contextBlock` is empty and the
handler behaves exactly as today (graceful, un-augmented).

## 6. The curated prompting knowledge base

Repo-shipped structured data under `backend/data/prompting_kb/`, one file per
family, loaded by `KnowledgeBase`.

```jsonc
// backend/data/prompting_kb/sdxl.json
{
  "family": "sdxl",
  "displayName": "Stable Diffusion XL",
  "source": "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0",
  "entries": [
    { "kind": "positive-convention", "text": "...", "tags": ["composition"] },
    { "kind": "negative-convention", "text": "...", "tags": ["quality"] },
    { "kind": "param-hint", "text": "...", "tags": ["steps","cfg"] },
    { "kind": "resolution", "text": "...", "tags": ["aspect"] }
  ]
}
```

- Family keys align with the Foundry catalog's classification so the active
  model maps to a KB file; an unknown family falls back to a small `generic.json`.
- The KB is always available (repo-shipped, no embedding required for lexical
  matching), so it is the cold-start source when the user corpus is empty.
- A contract test asserts every KB file validates against the entry schema and
  that every referenced `source` is present - the KB cannot silently rot.

## 7. Ingestion pipeline + sanitization

The corpus lives in the renderer; the backend index must be fed.

- **Bulk sync:** on app start (and on demand from the AI Director settings panel),
  the renderer sends a sanitized snapshot of `promptHistory` + `favoritePrompts` +
  `assetLibrary` + `batchResults` through `director:sync-corpus` (IPC) -> main ->
  `POST /api/v1/retrieval/ingest`. The backend embeds only new/changed items
  (content-hash) and persists; unchanged items are skipped.
- **Incremental:** on generation-complete and favorite-toggle, the renderer pushes
  the single affected record through the same path.
- **Sanitization (Codex gate, S10):** ingestion indexes only prompt text, negative
  prompt, model id, generation params, and outcome flags. It **excludes** anything
  secret-shaped - API keys/tokens, absolute filesystem paths, account identifiers -
  via an allow-list mapping from the source records, not a deny-list scrub. The
  sanitizer is unit-tested with adversarial records.

## 8. Token budget and the two-models subtlety

There is no real LLM tokenizer in the codebase, and two different models meet at
the seam:

- The **LLM** performing the enhancement (e.g. Llama via OpenRouter/HF, or the
  local heuristic) determines the **context-token budget**: a conservative
  fraction of that route's known context window, with a fixed hard ceiling. When
  the window is unknown (local heuristic enhancer), a small fixed budget is used.
- The **image model** being prompted for determines the **KB family match**.

Both are known at the seam. Budgeting uses a conservative character-to-token
estimate (never under-counts, so the assembled block cannot exceed the budget);
per-model `contextLength` (e.g. `OpenRouterModelSummary.contextLength`) sizes the
fraction. A precise tokenizer is explicitly out of scope for v1 - the
acceptance criterion is a **respected** budget, which a conservative estimate
guarantees. The estimator lives in a small shared/main module reused by
`contextAssembler` and asserted in tests.

## 9. Renderer: controls and transparency

- **Settings (`SettingsPanel.tsx`) - "AI Director" section:** global enable
  toggle; per-source toggles (prompt history / asset metadata / knowledge base);
  index **clear** and **rebuild** actions with a stats readout (item counts, index
  mode = semantic|lexical); all Carbon Pro, `lucide-react`, 8pt grid, no emoji
  (`DESIGN.md`).
- **Transparency (`PromptStudioPanel.tsx`):** after an augmented assist, render a
  compact, dismissible **"context used"** disclosure built from the returned
  `provenance` - e.g. "Used 3 references: 2 of your prior prompts, 1 SDXL tip."
  Each item shows its source and a short preview; nothing is hidden. When
  retrieval was lexical (embedder absent) the disclosure says so honestly.
- Settings persist in a new `AppSettings.aiDirector` block (S11); the renderer
  reads it to decide whether to request augmentation and which sources to pass.

## 10. Trust boundary, privacy, graceful degradation (Codex gate)

Codex gate focus (from the roadmap): **trust boundary / prompt-injection,
local-index privacy, no secret leakage.**

- **Data, never instructions.** Retrieved and model-authored snippets are wrapped
  in a single delimited DATA block whose preamble instructs the model to treat the
  content as reference material only. An **adversarial-injection test corpus**
  (snippets containing "ignore previous instructions", fake system directives,
  tool-call lookalikes) asserts the assembled request's control structure is
  unchanged and the injection text stays inside the data block.
- **No secret in the index.** Allow-list ingestion (S7); a dedicated test asserts
  that records carrying token/key/path-shaped fields never produce an indexed item
  containing them.
- **Local-first.** Nothing leaves the machine for indexing; the embedder runs
  locally; routed embeddings are explicitly not built in v1.
- **Graceful degradation (no hard fails):** embedder absent -> lexical mode;
  backend unreachable -> assist proceeds un-augmented; empty corpus -> KB-only;
  index rebuilding -> assist uses whatever is ready. Every degraded path is a
  defined, tested state, surfaced honestly in the disclosure where user-visible.
- **Structured errors, never silent-fail** on a malformed ingest/query, mirroring
  the M6 discipline.

## 11. Settings and contracts

- `AppSettings.aiDirector: { enabled: boolean; sources: { promptHistory: boolean;
  assets: boolean; knowledgeBase: boolean }; }` added to the `AppSettings`
  interface and `DEFAULT_SETTINGS` (`electron/services/outputRoots.ts`); the
  existing spread in `settings:get`/`settings:update` carries it through. Default:
  `enabled: true`, all sources `true` (S2 decision 3).
- New IPC channels - `director:sync-corpus`, `director:ingest-record`,
  `director:clear-index`, `director:index-stats` - mirrored across
  `electron/preload.ts`, `electron/services/mainIpc.ts`, and
  `src/types/electron.d.ts`. The `enhance-prompt`/`suggest-negative-prompt`
  payloads widen to carry the augmentation directive and return `provenance`.
- `shared/retrieval.ts` - `Source`, `RetrievalQuery`, `RetrievalSnippet`,
  `ContextProvenanceItem`, budget constants - compiled by both `tsconfig.app.json`
  and `tsconfig.electron.json` (the M6 shared-module pattern; `vitest.config.ts`
  already includes `shared/`).

## 12. Test strategy

No real embedding model and no network in CI; the embedder and HTTP transport are
mocked. Failing test first, implement to green.

- **Backend (`unittest.TestCase`):** mocked embedder (deterministic vectors) for
  cosine-ranking determinism; KB schema/load contract; budget-bounded assembly;
  the lexical fallback path with the embedder forced unavailable; ingest
  sanitization (secret-shaped fields never indexed); the adversarial-injection
  corpus. Router tests mount only the retrieval router on a `TestClient` (the
  `lora.py` pattern), service in mock/stub mode.
- **Frontend (Vitest):** `contextAssembler` budget enforcement + DATA-block
  wrapping; the conservative token estimator never exceeds budget; the provenance
  disclosure renders each source; settings toggles gate the request; the ingest
  adapter sanitizes; the `generation.ts` seam injects the block into the **user**
  message identically across all three provider branches (mocked retrieval client),
  and behaves exactly as today when augmentation is off / backend unreachable.
- **Shared:** contract tests for the `shared/retrieval.ts` types/constants.

## 13. Docs and contracts

- `docs/API_ENDPOINTS.md` - new "Retrieval / AI Director" section: the
  `/api/v1/retrieval/*` REST routes and the new `director:*` IPC channels, the
  ingest/query contract, the provenance shape, and the degradation matrix.
- `docs/api/openapi.json` - hand-curated; updated this time because new **backend
  REST** routes are added (the retrieval router), unlike M6 which added none.
- IPC channel names mirrored across `electron/preload.ts`, `mainIpc.ts`, and
  `src/types/electron.d.ts`.
- No `DATABASE_SCHEMA.md` change - the index is file-based, not SQLite (S3).

## 14. Component decomposition (balanced sprint units)

**PR1 - backend retrieval store (GPU-free, fully tested):**
1. `shared/retrieval.ts` - shared types/constants + contract test.
2. `embedder.py` - lazy `all-MiniLM-L6-v2`, `*_AVAILABLE`, mockable seam.
3. `index_store.py` - NumPy cosine, content-hash upsert, file persistence.
4. `knowledge_base.py` + `backend/data/prompting_kb/*.json` - curated KB + schema test.
5. `retrieval_service.py` + `backend/api/retrieval.py` - ingest/query/clear/stats,
   sanitization, lexical fallback, adversarial-injection tests; openapi.json.

**PR2 - main assembly + injection + renderer (the wiring):**
6. `retrievalClient.ts` + `contextAssembler.ts` + token estimator.
7. `generation.ts` seam - augmentation, DATA-block injection across all branches,
   provenance return; widened IPC payloads.
8. `AppSettings.aiDirector` + `director:*` IPC (preload/mainIpc/electron.d.ts).
9. Renderer - AI Director settings section, ingest triggers/adapter, "context
   used" disclosure.
10. `docs/API_ENDPOINTS.md`; Codex trust-boundary gate.

Each unit is independently testable with a clear interface and explicit
verification - a balanced sprint per the rails. The PR1/PR2 split mirrors M6.

## 15. Out of scope (restated from the baseline)

- Full agentic multi-step orchestration / tool-use Director loop (post-v1 unless
  re-scoped) - M7 delivers retrieval + context, not autonomous orchestration.
- Cloud / shared knowledge bases (-> Pillar 6).
- Routing changes (owned by M6).
- Routed/hosted embeddings (privacy rail; a possible future opt-in, not v1).
- A precise LLM tokenizer (conservative estimate suffices for a respected budget).
- Writing generations into the backend SQLite `images` table (the corpus is
  ingested from the renderer; backing it with SQLite is a post-v1 nicety).

## 16. Acceptance criteria

- Prompt-assist demonstrably uses retrieved context: an integration test asserts
  the injected DATA block is present in the assembled LLM request, within the
  respected token budget, across all three provider branches.
- Retrieval is local-first and privacy-preserving: the embedder runs locally, and
  a test asserts secret-shaped fields never enter the index.
- The adversarial-injection corpus never alters the assembled request's control
  structure (retrieved text stays data).
- Augmentation is on by default with a global toggle, per-source toggles, an index
  clear/rebuild, and a visible "context used" disclosure; the lexical-fallback and
  backend-unreachable paths degrade without a hard failure.
- The curated KB is the cold-start source and matches the active model's family.
- All cross-cutting rails green; Codex trust-boundary findings closed; docs and
  contracts updated in the same PR(s).

## 17. Items deliberately deferred to plan-time

These are implementation details, not open scope - resolved while writing the
plan, not re-brainstormed:

- The exact embedding model acquisition/caching path (bundled vs.
  download-on-first-use via the existing Foundry download surface) and the precise
  `all-MiniLM-L6-v2` runtime (sentence-transformers reusing the app's torch stack
  vs. a standalone ONNX runtime) - chosen at plan-time against bundle-size and the
  `*_AVAILABLE` rail; the lexical fallback makes either safe.
- The concrete content of the initial curated KB family set (which families ship
  first) and the per-family entry counts.
- The exact score weighting for favorites/successful outcomes and the default
  budget fraction/ceiling constants.
- Whether bulk corpus sync runs on every start or is debounced/dirty-tracked.

---

_This spec elaborates one already-locked milestone of the approved program
baseline. It honors the cross-cutting engineering rails and the Codex
trust-boundary gate by reference. Implementation proceeds via the writing-plans
skill._
