# Spike A - Download Telemetry (Model Foundry M2)

> Time-boxed throwaway exploration mandated by the Model Foundry spec
> (`docs/superpowers/specs/2026-05-30-model-foundry-design.md`, section 8.1, spike A)
> before any M2 (Acquisition) production code. Exploration code is throwaway and was
> NOT held to TDD. This document is the durable artifact: chosen mechanism, the
> precise-vs-fast tradeoff verdict, required spec adjustments, and the seeded
> DownloadManager test list that feeds the M2 plan.

**Date:** 2026-06-01
**Branch:** `feat/model-foundry-m2`
**Verdict:** **GO (with adjustments)** - the planned approach holds, but the
acceleration mechanism in the spec is obsolete and must be re-pointed.

---

## 1. The question (from spec section 8.1)

> Can we get granular progress/speed/ETA from `huggingface_hub`, and how does
> `hf_transfer` trade off against it? Compare: (a) custom tqdm-subclass injection,
> (b) per-file accounting (HfApi sizes + manual loop), (c) self-driven download
> (`hf_hub_url` + streamed `requests`/`hf_transfer`).
> **Output:** chosen progress mechanism; precise-vs-fast tradeoff confirmed.

## 2. Method

Two complementary passes, both against the **actual installed library**, not docs
from memory:

1. **Source analysis** of `huggingface_hub` as installed in the backend venv
   (`C:\vision-studio\backend\venv\Lib\site-packages\huggingface_hub`).
2. **Empirical probe** (throwaway): a custom `tqdm.auto.tqdm` subclass passed to
   `hf_hub_download` for a tiny public ungated file (`bert-base-uncased/config.json`)
   into a temp cache with `force_download=True`, plus a `get_paths_info` size lookup.

## 3. Headline finding: the installed reality is NOT what the spec assumed

| Assumption in spec | Installed reality |
| --- | --- |
| `huggingface-hub>=0.19.0` | **`1.10.1`** - a major version line ahead. |
| Accelerate with `hf_transfer` (`HF_HUB_ENABLE_HF_TRANSFER=1`) | **`hf_transfer` is dead.** `constants.py:250-255`: *"hf_transfer is not used anymore"*; setting the env var now only emits a **deprecation warning**. |
| `hf_transfer` trades progress granularity for speed; needs a "precise-progress" fallback | The modern accelerator is **`hf_xet`** (Xet protocol), **already installed** as a default dependency, and it reports **byte-granular** progress through the same hook as plain HTTP. The tradeoff does not exist in 1.x. |
| Resume via `resume_download=...` kwarg | In 1.x resume is **automatic** from the `.incomplete` file (append mode + HTTP `Range`); the explicit kwarg is gone. |

This is exactly the class of surprise the spike exists to surface. None of it blocks
M2; it simplifies it.

## 4. The three candidate mechanisms, evaluated against the real 1.x API

### (a) Custom tqdm-subclass injection - CHOSEN
`hf_hub_download` / `snapshot_download` expose a **public, documented** `tqdm_class`
parameter (`file_download.py:760,784,808,832`; docstring `:909` - "must inherit from
`tqdm.auto.tqdm` or at least mimic its behavior"). It threads end-to-end into **both**
download backends:

- **HTTP path** `http_get` (`file_download.py:320`): streams
  `response.iter_bytes(chunk_size=DOWNLOAD_CHUNK_SIZE)` and calls
  `progress.update(len(chunk))` **per chunk** (`:421-425`). Byte-granular.
- **Xet path** `xet_get` (`file_download.py:456`): wires
  `progress_updater(progress_bytes) -> progress.update(...)` **into**
  `hf_xet.download_files(..., progress_updater=[...])` (`:553-565`). Byte-granular on
  the fast path too.

`utils/tqdm.py` confirms a **non-hf** subclass is "fully responsible for its own
behavior" (no `disable`/`name` injected), so we run it **headless** (`disable=True`,
no terminal bar) and still receive every `update(n)`. `__init__` gives us `total`
(= `expected_size`) and `initial` (= resume offset); `update(n)` gives byte deltas.
From those we compute `progress` (fraction), `speed` (EWMA bytes/s), and `eta`.

**Empirical confirmation:** probe instantiated the subclass with `total=570`, received
`update(570)` summing exactly to the 570-byte file. PASS.

### (b) Per-file accounting (HfApi sizes + manual loop) - ADOPTED AS COMPLEMENT, not an alternative
`get_paths_info(repo_id, paths)` (`hf_api.py:4014`) and
`model_info(files_metadata=True)` (`:3076`) return `RepoFile.size` (+ `lfs.size`)
**without downloading** (`:775,:808`). Probe returned `config.json size=570` and
`pytorch_model.bin size=440473133 (lfs)` in one cheap call. This is how we compute the
**aggregate total** for the disk preflight and the denominator for whole-repo progress.
It does not replace (a) - it feeds it. We download **per file** in a loop (not via
`snapshot_download`'s internal parallelism) so the queue owns file-level pause/cancel
and per-file accounting; (a) supplies in-flight bytes, (b) supplies the totals.

### (c) Self-driven download (`hf_hub_url` + streamed requests/`hf_transfer`) - REJECTED
Re-implements what the library already does correctly and would **lose** Xet
acceleration, Xet content-addressed chunk dedup/caching, the built-in resume, the
size-consistency check, and atomic move. `hf_transfer` is moot (dead). Strictly worse.

## 5. Precise-vs-fast tradeoff: CONFIRMED - it has collapsed

The spec budgeted for a dual-mode telemetry design (fast/coarse vs slow/byte-exact).
**Not needed in 1.x.** Both the HTTP path and the accelerated Xet path drive the same
`tqdm_class.update()` byte stream, so we get **speed and byte-exact progress at once**.
M2 ships **one** telemetry path, not two. (Optional tuning knob `HF_XET_HIGH_PERFORMANCE`,
default `False`, trades memory for throughput; not required and not part of M2 scope.)

**One honest caveat - cancellation granularity:** mid-file cooperative cancel is
cleanest on the **HTTP** path (we can abort inside the per-chunk `update()`); on the
**Xet** path cancel may only take effect at file boundaries (the Rust `download_files`
chunk fetch is not interruptible mid-call from Python). Pause/resume still works in both
cases; worst case a resumed Xet file re-fetches the in-flight file, which Xet's
content-addressed chunk cache largely deduplicates anyway. This is a plan-level design
note, not a blocker.

## 6. What the library already does for us (do NOT re-implement)

`_download_to_tmp_and_move` (`file_download.py:1792`) per file already:
- downloads to `<blob>.incomplete` in **append mode** -> automatic resume (`:1828`),
- runs a **per-file disk-space check** `_check_disk_space(expected_size, dir)` (`:1836`),
- enforces a **size-consistency check** - `expected_size != temp_file.tell()` raises
  `OSError` (`http_get:448`) so a short/corrupt file never completes,
- performs an **atomic move** `_chmod_and_move(incomplete, dest)` -> `shutil.move`
  (`:1868`).

So per-file atomicity, resume, and a disk backstop are **built in**. The DownloadManager
layers on top of this, it does not duplicate it:
- a **bounded-concurrency queue** (D5: configurable, default 2, clamp 1-6), each job an
  `asyncio.Task` keyed by model id;
- an **aggregate** disk preflight (sum of `get_paths_info` sizes + headroom vs
  `shutil.disk_usage(target).free`) so we refuse a whole multi-file pull up front
  rather than dying near the end;
- **lifecycle** (pause = cancel task + keep `.incomplete`; resume = re-invoke,
  auto-resumes; cancel = stop + clean partials; reorder/priority);
- **registry status** transitions (queued -> downloading -> verifying -> ready / error);
- **token injection** per call (`token=...` from Electron main-process `safeStorage`,
  never persisted in Python, never logged);
- **gated-license** detection (401/403 -> typed error carrying the repo gate URL ->
  "Accept license on Hugging Face" CTA -> retry on return);
- **typed resilience** (network drop -> resume; transient 5xx -> backoff; partial ->
  re-fetch).

## 7. Required spec adjustments (section 3 of the design)

1. **Drop `hf_transfer` / `HF_HUB_ENABLE_HF_TRANSFER=1` entirely.** Replace section 3.1
   "Fast transfers" with: rely on **`hf_xet`** (already a transitive dep of
   `huggingface_hub` 1.x; pin `hf_xet` explicitly in `requirements.txt` for
   reproducibility). No env toggle, no dual-mode.
2. **Section 3.2 "True progress"** stands, mechanism now pinned: custom **silent
   `tqdm_class`** + `get_paths_info` totals. Remove the implication that byte-exact
   progress is a "precise fallback" - it is the single default path.
3. **Section 3.3 pause/resume:** resume needs no `resume_download` kwarg - re-invoking
   `hf_hub_download` auto-resumes from `.incomplete`. Document the Xet mid-file cancel
   caveat (section 5 above).
4. **Section 3.5 atomic completion:** note the library already does `.incomplete` ->
   size-check -> atomic move per file; our layer adds repo-level verify + the
   `verifying -> ready` registry transition.

## 8. Seeded DownloadManager test list (feeds the M2 TDD plan)

All mockable with **no network** (patch `huggingface_hub.hf_hub_download`,
`get_paths_info`, `shutil.disk_usage`); fast on CI; real-model integration opt-in
behind an env flag locally. CI runs Linux AND Windows -> all path logic via `pathlib`.

1. **enqueue** - adds a job in `queued` keyed by model id; duplicate enqueue of an
   active id is idempotent (no second task).
2. **concurrency** - with limit=2 a 3rd enqueue stays `queued` until a slot frees;
   configured concurrency is clamped to `[1,6]`.
3. **progress accounting** - mock `tqdm.update()` deltas drive ModelRecord `progress`
   (0..1), `speed` (bytes/s), `eta`; multi-file aggregate = (sum completed + in-flight)
   / total-from-`get_paths_info`.
4. **disk preflight** - aggregate size + headroom > free -> typed `InsufficientDiskSpace`
   raised BEFORE any `hf_hub_download` call; size < free -> proceeds.
5. **pause** - cancels the running task, status -> `paused`, `.incomplete` partials
   preserved (asserted not deleted).
6. **resume** - re-invokes download, status -> `downloading`, progress continues from
   the partial offset (initial != 0), not restarted at 0.
7. **cancel** - stops the task, deletes `.incomplete`/partial blobs, status ->
   `cancelled`/`not_found`.
8. **atomic verified completion** - on success the file is present at the final path and
   status -> `ready`; a simulated size-consistency `OSError` mid-download leaves status
   `error` and the file absent from the ready set (never a partial shown as ready).
9. **gated license** - a mocked 401/`GatedRepoError` maps to a typed `GatedModelError`
   carrying the repo gate URL; status surfaces the license CTA, not a generic error.
10. **token discipline** - token is passed per call to `hf_hub_download(token=...)` and
    never written to disk or logs (assert against a captured log + any persisted state).
11. **typed resilience** - transient 5xx -> bounded backoff then a typed surfaced error;
    network drop -> resume path re-invoked.
12. **path-safety (cross-cutting, spec 8.2)** - destination join is correct across
    separators, Windows drive letters, and long paths (pure `pathlib`, asserted on both
    OSes).
13. **API contracts** - `POST /models/{id}/download`, `/download/pause|resume|cancel`,
    `GET /models/downloads` return the documented shapes; unknown id -> 404.

## 9. Environment snapshot (for reproducibility)

- `huggingface_hub` **1.10.1**; `hf_xet` **installed**; `hf_transfer` **absent**;
  `requests`, `tqdm` present; `HF_XET_HIGH_PERFORMANCE=False`.
- Probe: `bert-base-uncased/config.json`, 570 bytes, fresh download to temp cache;
  custom `tqdm_class` init `total=570`, one `update(570)`; `get_paths_info` returned
  `config.json=570`, `pytorch_model.bin=440473133 (lfs)`.
