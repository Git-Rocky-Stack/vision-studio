# Spike B - Windows Linking + Library Indexing (Model Foundry M3)

> Time-boxed throwaway exploration mandated by the Model Foundry spec
> (`docs/superpowers/specs/2026-05-30-model-foundry-design.md`, section 8.1, spike B)
> before any M3 (Indexer + import/link) production code. Exploration code is throwaway
> and was NOT held to TDD. This document is the durable artifact: the validated linking
> strategy, long-path confirmation, required spec adjustments, and the seeded indexer
> test list that feeds the M3 plan.

**Date:** 2026-06-09
**Branch:** `docs/model-foundry-spike-b`
**Verdict:** **GO (with adjustments)** - junction/hardlink + copy-fallback holds on real
Windows, fully unelevated. Three findings adjust the M3 design: junction detection must
not use `islink`, reparse-point source files need a copy-only rule, and `scan_cache_dir`
emits warnings for broken cache entries that the indexer must consume gracefully.

---

## 1. The question (from spec section 8.1)

> Do junction/hardlink + copy-fallback + `scan_cache_dir` + real ComfyUI/A1111 indexing
> work on real Windows (cross-volume, long-path, OneDrive)?
> **Output:** linking strategy validated (or copy-only decision); long-path handling confirmed.

## 2. Method

A single throwaway probe script run via the backend venv Python (3.12.12) on real
Windows 11 Pro (10.0.26200), **as a non-admin user** (`IsUserAnAdmin() == False`) -
deliberately, because the spec mandates "no elevation, ever." Ten experiments: hardlink
semantics, junction semantics, volume predicate + copy-fallback timing, long paths
(>260 chars), `shutil.rmtree` safety across junctions, `scan_cache_dir` against the
real 17 GB HF cache, simulated ComfyUI/A1111 layout indexing with hand-crafted valid
safetensors files, header reads through links, and incremental scan signatures.

## 3. Headline findings

| Question | Answer (measured, unelevated) |
| --- | --- |
| Hardlink (files, same volume) | **Works.** Same NTFS file index, `st_nlink=2`, write-through visibility, deleting the link leaves the source intact. |
| Junction (directories) | **Works.** `_winapi.CreateJunction` (CPython built-in, no dependency) succeeds unelevated; contents list/read normally; `os.path.realpath` resolves to the target; `os.rmdir` removes the junction without touching the source. |
| Copy-fallback | **Cheap.** 64 MB in 0.038 s (~1.7 GB/s NVMe). Falling back to copy is not a meaningful UX penalty on local disks. |
| Long paths | **Confirmed.** A 444-char path works through plain `os` APIs (host has `LongPathsEnabled=1`; `python.exe` manifest is long-path aware). Hardlink at a long path, junction to a long target, and the `\\?\` extended form all pass. |
| Removal safety | **Proven.** `shutil.rmtree` on a tree *containing* a junction removes the junction but does **not** recurse into it - user bytes survive (CPython >=3.8 treats junctions as symlink-like; bpo-37834). The M3 guarantee "removal never touches original bytes" is real. |
| `scan_cache_dir` | **Fast + structured.** 9 repos / 17.04 GB in 0.117 s; per-repo `repo_id`, `repo_type`, `size_on_disk`, revisions with `commit_hash`, `nb_files`, real `snapshot_path`. |
| Layout indexing + safetensors headers | **Works.** Simulated ComfyUI + A1111 trees indexed and type-classified (checkpoint/lora/vae) purely from the 8-byte-length + JSON safetensors header in 8 ms for 5 files; identical bytes across two roots collapse to one identity via `size + head/tail-64KB sha256`. |
| Reads through links | **Works.** safetensors headers read correctly through both a junction and a hardlink - pipelines can consume linked paths transparently. |
| Incremental signature | **Works.** `(st_mtime_ns, st_size)` changes on touch; safe basis for skip-unchanged re-scans. |

## 4. The three adjustments (spec section 4 of the design)

1. **Junction detection must NOT use `os.path.islink()`** - it returns `False` for
   junctions (measured). Detect reparse points via
   `os.lstat(p).st_file_attributes & FILE_ATTRIBUTE_REPARSE_POINT` (0x400), and -
   stronger - record every link the Foundry creates in the registry at creation time.
   "Is this our link?" is answered by the registry first, the filesystem second. This
   also future-proofs `delete model` ("only remove app-managed copies or our own
   links") against lookalike user content.
2. **Reparse-point *source files* are copy-only.** OneDrive is not configured on this
   machine, so cloud-placeholder behavior could not be measured (honest caveat).
   Placeholders are reparse points; hardlinking them is undefined-to-hostile territory
   (may fail, may force a hydrate/pin). Rule: if a *source file* carries
   `FILE_ATTRIBUTE_REPARSE_POINT`, skip link attempts and copy. Combined with rule 3
   this makes OneDrive a degraded-but-correct path rather than a risk.
3. **Link attempts are predicate-first, fallback-always.** Same-volume check via
   `os.stat(a).st_dev == os.stat(b).st_dev` (measured: works as a volume-serial
   predicate) before attempting a hardlink; ANY `OSError` from a link attempt
   (cross-volume `ERROR_NOT_SAME_DEVICE`/WinError 17, permissions, exotic
   filesystems) falls back to copy. A single-volume dev machine cannot physically
   produce WinError 17 (honest caveat) - the fallback is exercised in tests via a
   mocked `os.link` raising it, which is exactly what the fixture-based M3 tests do
   anyway (no-network, no-second-volume CI).

## 5. Bonus discovery: broken HF cache entries are a real input

The real cache on this machine contains **two corrupt entries** (interrupted
pre-Foundry downloads of `Qwen/Qwen-Image-2512` and `Wan-AI/Wan2.2-TI2V-5B` - repo dirs
with no `snapshots/` subdir). `scan_cache_dir` does not crash: it skips them from
`.repos` and reports them in `.warnings` (measured: `repo_count=9` from 12 cache dirs).
The M3 indexer MUST consume `info.warnings`, surface broken entries as a degraded
state (candidate for a "clean up cache" affordance), and never error-storm. This is
spike-found reality, not a hypothetical.

## 6. What the platform already gives us (do NOT re-implement)

- `_winapi.CreateJunction` ships in CPython - no `pywin32`, no shelling out to
  `mklink` (which would need `cmd /c` and quoting care), no elevation.
- `os.link` is the documented hardlink API; NTFS maintains link counts and
  write-through for free.
- `shutil.rmtree` already refuses to recurse through junctions - our removal-safety
  layer is an *invariant test*, not new code.
- Long paths need no special casing in the backend on this host profile: plain
  `pathlib`/`os` calls work at 444 chars. Keep `\\?\` handling out of production code;
  assert behavior in tests (see seeded list #5 - CI hosts may differ from dev hosts).
- `scan_cache_dir` abstracts the entire blob/snapshot cache layout - repo enumeration,
  revision resolution, real file paths, sizes, and corruption warnings.

## 7. Seeded indexer/linker test list (feeds the M3 TDD plan)

All filesystem tests run against `tmp_path` fixtures (fast, no network, both CI OSes);
Windows-only behaviors are `pytest.mark.skipif(sys.platform != "win32")`; the
safetensors fixture builder from this spike (8-byte length + JSON header + zero data)
becomes a shared test helper.

1. **link_artifact strategy ladder** - same-volume file -> hardlink; directory ->
   junction (Windows) / symlink (POSIX); `st_dev` mismatch -> copy without attempting a
   link; `os.link` raising `OSError` (incl. mocked WinError 17) despite the predicate ->
   copy-fallback; result always reports which mechanism was used (`link | junction | copy`).
2. **No-elevation invariant** - the linker never calls symlink-on-Windows (privilege
   trap) or any elevation-requiring API; junction+hardlink+copy only.
3. **Our-link bookkeeping** - every materialized link is recorded (registry entry with
   mechanism + source + dest); `is_foundry_link` answers from the record, junction
   detection via `st_file_attributes & 0x400` (asserting `os.path.islink` is False for
   junctions so nobody "fixes" it back in).
4. **Removal safety** - removing an app tree containing a junction into a user dir
   leaves user bytes intact (the E5 probe becomes a regression test); `remove_root`
   drops referenced-only records and deletes zero source bytes; `delete_model` refuses
   paths that are neither app-managed nor recorded Foundry links.
5. **Long-path handling** - create/index/link a >260-char artifact path via `pathlib`;
   on a host where the plain form fails, the `\\?\`-prefixed retry succeeds (tested via
   mock; dev host has `LongPathsEnabled=1` so the failure leg is simulated).
6. **Reparse-point source rule** - a source file stubbed with
   `FILE_ATTRIBUTE_REPARSE_POINT` routes to copy, never `os.link` (OneDrive
   placeholder defense).
7. **safetensors header detection** - table-driven over tiny crafted fixtures:
   checkpoint (`model.diffusion_model.*`), lora (`lora_unet_*`/`lora_te_*`/
   `.lora_down.`/`.lora_up.`), vae (`encoder.*`/`decoder.*`), controlnet
   (`control_model.*`), unknown; non-safetensors file -> implausible-header-length
   typed error (never a crash); diffusers-folder `model_index.json` detection.
8. **Quick identity + dedup** - same bytes under two roots merge into ONE record with
   two backing locations; `(size + head/tail-64KB sha256)` identity; full sha256
   deferred to a background queue (asserted lazy - not computed during scan).
9. **Incremental scan** - unchanged `(st_mtime_ns, st_size)` -> file not re-read
   (assert via open-call spy); touched file -> only that record re-indexed.
10. **HF-cache adapter** - mocked `HFCacheInfo` with valid repos AND warnings/broken
    entries -> records created per revision (`repo_id+revision` reconciled against the
    verified catalog -> `ready` + curated metadata), warnings surfaced as degraded
    state, no exception; empty/absent cache -> empty result, no error.
11. **Layout hints** - `comfyui` hint types `models/checkpoints|loras|vae|controlnet`;
    `a1111` hint types `models/Stable-diffusion|Lora|VAE` + `embeddings/`; `generic`
    falls back to pure header detection; hint mismatch (lora keys in `checkpoints/`)
    trusts the header, not the folder.
12. **Unavailable root** - root path missing at scan time -> its records flip to
    `unavailable` (not deleted, no error storm); root returning -> records restore on
    next scan.
13. **First-run detection** - probes well-known ComfyUI/A1111/HF-cache locations,
    returns offers only (opt-in; no auto-import side effects).
14. **Path safety (cross-cutting, spec 8.2)** - indexing + linking correct across
    separators, drive letters, and long paths; pure `pathlib`; asserted on both CI OSes.

## 8. Environment snapshot (for reproducibility)

- Windows 11 Pro 10.0.26200, single NVMe volume (C:), **no OneDrive configured**,
  `LongPathsEnabled=1`, probe run unelevated (`IsUserAnAdmin() == False`).
- Backend venv Python 3.12.12; `huggingface_hub` 1.10.1 (`scan_cache_dir` from it).
- Real HF cache: 12 cache dirs -> 9 valid repos / 17.04 GB / 0.117 s scan; 2 broken
  entries (no `snapshots/`) surfaced via `.warnings`; largest repo
  `runwayml/stable-diffusion-v1-5` (5.48 GB, 15 files, snapshot path verified on disk).
- ComfyUI/A1111: no real installs present; layouts simulated with crafted
  valid-header safetensors files (which doubled as the header-detection validation).
- Copy throughput reference: 64 MB in 0.038 s (~1.7 GB/s).
