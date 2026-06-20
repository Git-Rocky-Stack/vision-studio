# M10 - Release Hardening, Cleanup & Documentation (3.1.0) - Design Spec

**Status:** Approved (brainstorm 2026-06-20). Ready for the writing-plans skill.

**Milestone:** M10, the final milestone of the Path-to-v1 roadmap
(`2026-06-15-vision-studio-path-to-v1-roadmap-design.md`). M1-M9 are complete and
merged to `main`.

---

## S1. Overview & Goal

M10 delivers the **3.1.0** release of Vision Studio: the whole surface hardened,
stub-free, cleaned, fully documented, and published. It folds everything M6-M9
added - provider routing fabric (M6), RAG director + context (M7), ComfyUI interop
deepening (M8), and accelerator + inference enhancement (M9) - into a coherent,
shippable release on top of the already-public 3.0.0.

**Version framing (corrected from the roadmap).** The roadmap calls M10 "the gate
before a v1 tag," but 3.0.0 already shipped as the first public MIT release
(CHANGELOG `[3.0.0] - 2026-05-30`). M10 is therefore accurately the **post-M9
hardening + feature-consolidation release, tagged `v3.1.0`** - not a maiden v1.
M6-M9 are additive (no known breaking changes), so a semver **minor** bump is
correct. The acceptance bar is unchanged; only the version wording is corrected.

**Delivery.** Three PRs + a final release gate (Approach A - multi-PR by concern),
in the established M6-M9 rhythm: each PR independently CI-gated and squash-merged,
with a review pause between PRs.

---

## S2. Scope

### In scope (locked by the roadmap M10 section)
- **Universal green gates:** `npm run typecheck`, `npm test`, `npm run build`, the
  full backend test suite, and both CI paths (Linux pr-gate + Windows release incl.
  the Playwright visual suite) all green.
- **Zero loose ends:** no outstanding TODOs, no incomplete stubs, no dead modules -
  audited and each resolved or explicitly waived-with-issue.
- **Repo cleanup:** remove temp files, stale build artifacts, deprecated/dead files;
  verify `.gitignore` coverage.
- **Documentation:** comprehensive user guide; current build docs (`BUNDLING.md`,
  `WINDOWS_BUILD.md`, `DEPLOYMENT.md`); release docs (`CHANGELOG.md`, version bump,
  signing/notes); README refresh + publish.
- **Licensing/attribution:** MIT LICENSE confirmed; `THIRD-PARTY-NOTICES.md` added;
  license-compatibility scan.
- **Codex final gate:** security, supply-chain, licensing, doc accuracy.
- **Clean-clone build-from-scratch** verification.

### Out of scope (per roadmap)
- New features. Any feature gap surfaced here is logged for post-3.1.0, not built.
- Post-v1 pillars (Provenance, Platform).

### Not applicable
- The web SEO/GEO post-edit checklist (sitemap, IndexNow, llms.txt). Vision Studio
  is a desktop app; the README is GitHub markdown, not web pages.

### Definition of done
Every gate green on both CI paths; clean-clone build succeeds; TODO/stub/dead-module
audit returns zero (or explicitly waived-with-issue); docs complete and accurate;
README published; `v3.1.0` tagged per the release process; Codex final-sweep findings
closed.

---

## S3. PR1 - TensorRT Implementation

**Goal.** Replace the two M9 `NotImplementedError` scaffolds
(`tensorrt_engine._bind_engine` / `_build_engine`) with a real, best-effort
`torch_tensorrt` integration - structured, guarded, and CI-safe. Verification is
**async on hardware** (decision: "implement now, verify async"); I cannot run CUDA
here, so the code is written against the documented API and verified later by the
maintainer.

**Approach - Dynamo frontend.** Use the modern `torch_tensorrt` Dynamo path
(`torch_tensorrt.compile(module, ir="dynamo", inputs=..., enabled_precisions=...)`
-> `torch_tensorrt.save` / `torch_tensorrt.load`), not the legacy TorchScript path.
All `torch_tensorrt` imports stay lazy inside the build/load helpers so the module
is import-safe on stub CI.

**Real engine parameters.** `_run_tensorrt` (in `accelerator.py`) stops passing the
M9 placeholder values. It derives the cache-key dimensions from reality:
- `precision` from the pipeline's actual dtype,
- `compute_capability` from `torch.cuda.get_device_capability()`,
- `trt_version` from the installed `tensorrt` / `torch_tensorrt` version,
- `resolution_bucket` from the plan's shape (a small set of canonical buckets).

So a cached engine (`<key>.plan`) is correctly specific to the GPU + shape it was
built for; a different GPU or resolution misses the cache and rebuilds.

**Per-pipeline example inputs.** A denoiser needs correctly-shaped example inputs to
build (UNet vs transformer differ; SDXL needs `added_cond_kwargs`). PR1 ships an
example-input builder for the two TRT-relevant families (SDXL, SD15), keyed on the
resolution bucket. Other families are not auto-targeted (see allowlist below).

**Auto-off until blessed (honesty rail).** Because I cannot verify, the
`TRT_PROVEN_FAMILIES` allowlist is **emptied** pending the maintainer's sweep (so
`is_trt_eligible` returns False for every family) - so `auto` mode never auto-builds
a TRT engine in 3.1.0. Explicit `tensorrt="on"` still
builds, with the existing hard-fallback to eager on any failure, so the maintainer
(or a curious user) can exercise it safely. Blessing a family later is a one-line
allowlist data-edit after its sweep result passes correctness - the same
"evidence, not assertion" pattern as `calibrate_vram.py`.

**Tests (CI-green without `torch_tensorrt`).**
- Decision tests patch the allowlist, decoupling "the decision respects the
  allowlist" from the allowlist's production contents (which are now empty/gated).
- Apply tests keep the patched `_run_tensorrt` seam (the real build/load is never
  executed on CI).
- New unit tests cover the engine-parameter derivation and the example-input builder
  shapes (pure/torch-light where possible; `torch`-needing assertions guarded).

**Deliverable for the maintainer.** `docs/TENSORRT_VERIFICATION.md` - a runbook with
install steps (`torch_tensorrt` / TensorRT), a single-model smoke test, then the
`benchmark_accel.py` correctness sweep that blesses families. TRT verification is
**not** a 3.1.0 release blocker.

---

## S4. PR2 - Loose-Ends Audit + Repo Cleanup

**Goal.** Drive the codebase to "zero loose ends" and strip cruft - purely
subtractive; no functional change.

**Marker audit.** PR1 removes the 2 TRT `NotImplementedError`s; PR2 re-scans `src` +
`electron` + `backend` for the remaining `TODO`/`FIXME`/`HACK`/`XXX`/stub markers
(~6 at brainstorm time). Each gets exactly one disposition, none left un-triaged:
- **Fix/complete** - small and in scope.
- **Delete** - marks dead/unreachable code.
- **Waive-with-issue** - a real post-3.1.0 item: a tracked GitHub issue is filed and
  the code comment is rewritten to reference it (`Tracked: #NN`), so "waived" is
  auditable rather than hand-waved.

**Dead-module sweep.** Find orphaned files (modules never imported from the real
entry points). Method: import-graph reachability (`knip`/`ts-prune` for TS where
available, `vulture` for Python), with **manual confirmation before any deletion** -
never delete on a tool's say-so alone. Each candidate is confirmed unreferenced,
then removed, with the justification in the commit message.

**Cruft + gitignore.** Remove any tracked temp files, stale build artifacts
(`dist/`, `dist-electron/`, coverage, `.cache`), and deprecated files; verify
`.gitignore` actually covers them so they cannot re-creep.

**Guardrail.** The full green-gates run after cleanup confirms nothing live was
removed; any red gate reverts the offending deletion.

---

## S5. PR3 - Docs + Release Prep

**Goal.** Every doc accurate to the M6-M9 surface; the release files staged; version
bumped to 3.1.0.

- **User guide.** The in-app `UserGuidePage` (+ any `docs/` user guide) gets a
  currency pass covering the new surfaces: provider routing / BYOK accounts, the AI
  Director (RAG), ComfyUI interop, the Performance panel, over-budget fallback. Gaps
  filled, stale steps corrected.
- **Build docs.** `BUNDLING.md`, `WINDOWS_BUILD.md`, `DEPLOYMENT.md` verified against
  the current build scripts and electron-builder config - commands, paths, signing
  notes all current.
- **README refresh.** Features list, install, supported GPUs, and prose updated for
  3.1.0. I produce a **screenshot shot-list + README image slots** for the new
  surfaces; the maintainer captures and drops them in. Existing shots verified
  not-contradicted.
- **Attribution.** New `THIRD-PARTY-NOTICES.md` listing the major bundled runtime
  deps (JS + Python) with their licenses, plus a **license-compatibility scan**
  (`license-checker` for npm, `pip-licenses` for Python) whose output is reviewed for
  any GPL/AGPL/copyleft conflict with MIT redistribution - flagged loudly if found.
- **CHANGELOG + version.** A `[3.1.0]` section summarizing M6-M9 (routing fabric, RAG
  director, ComfyUI deepening, accelerator) in the existing CHANGELOG voice; version
  bumped to `3.1.0` in `package.json` and any other source-of-truth (electron-builder
  config; the about screen reads `packageJson.version`, so largely single-source -
  grep for stragglers).

---

## S6. Release Gate (final step, after PR3 merges)

Turns "merged" into "shipped 3.1.0":

- **Universal green.** `typecheck` + `test` + `build` + full backend suite green
  locally; both CI paths green (Linux pr-gate + Windows release incl. Playwright
  visual).
- **Clean-clone build-from-scratch.** Fresh `git clone` into a clean dir -> install
  -> build, proving the release has no hidden dependency on local state or untracked
  files. Any failure is a release blocker.
- **Codex final sweep.** Full-surface review before the tag: security (no leaked
  secrets, IPC/LLM trust boundaries intact), supply-chain (dependency audit + the PR3
  license scan), licensing (MIT posture, NOTICE present + accurate), doc accuracy
  (README/user-guide/build-docs match reality). Findings closed before tagging.
- **Tag + publish.** I prepare release notes from the CHANGELOG `[3.1.0]`; the
  **maintainer** tags `v3.1.0` and publishes per the established release process
  (NSIS + zip, `gh release`, signing-gated CI disabled). The actual tag/publish stays
  the maintainer's manual step - the agent never pushes tags or publishes.

**Async TRT verification is not a release blocker.** TRT ships code-complete but
auto-off (allowlist empty pending the sweep) with safe fallback, so 3.1.0 is honest
and stable without the hardware pass. Blessing families is a small post-merge
data-edit whenever the sweep is run.

---

## S7. Decisions Locked (brainstorm 2026-06-20)

1. **Release version:** `3.1.0` (semver-correct minor; additive M6-M9 on top of the
   released 3.0.0).
2. **Screenshots:** targeted refresh - agent prepares shot-list + README slots for
   the new M6-M9 surfaces; maintainer captures.
3. **Attribution:** curated `THIRD-PARTY-NOTICES.md` (major JS + Python deps +
   licenses) + a license-compatibility scan flagging copyleft conflicts.
4. **TRT disposition:** implement for 3.1.0 (not waive, not remove).
5. **TRT verify loop:** implement now (best-effort real `torch_tensorrt` code +
   tests), verify async on maintainer hardware; TRT opt-in/gated (auto-off) until
   verified.

---

## S8. PR Decomposition & Sequencing

| PR | Branch | Deliverable | Gate |
|----|--------|-------------|------|
| PR1 | `feat/release-hardening-m10` | TRT implementation + tests + `TENSORRT_VERIFICATION.md`; spec + plan committed here | Green gates; CI both paths; review pause |
| PR2 | `feat/release-hardening-m10-pr2` | Loose-ends audit + repo cleanup | Green gates; CI; review pause |
| PR3 | `feat/release-hardening-m10-pr3` | Docs + release prep (user guide, build docs, README slots, NOTICE + license scan, CHANGELOG `[3.1.0]`, version bump) | Green gates; CI; review pause |
| Release gate | (post-PR3 on `main`) | Clean-clone build, Codex final sweep, release notes; maintainer tags `v3.1.0` + publishes | All gates green; clean-clone passes |

Ordering rationale: the risky TRT diff is isolated first; the audit/cleanup lands
before docs so docs describe the cleaned state; release prep is last so it reflects
the final shipped surface.

---

## S9. Cross-Cutting Rails (Global Constraints)

- **TDD where there is logic:** the TRT code lands failing-test-first; audit/cleanup/
  docs are verified by the green gates rather than new unit tests.
- **Bite-sized commits via the Bash tool**, with `export PATH="/c/Program Files/nodejs:$PATH"`
  + `git branch --show-current` in the *same* call as each commit; never commit to
  `main`; one foreground git/shell call per message.
- **Green gates before every merge:** `npm run typecheck` / `npm test` /
  `npm run build` + the backend suite; both CI paths green before squash-merge.
- **Import safety:** `torch_tensorrt` (and any optional dep) imported lazily inside
  helpers; `from __future__ import annotations`; stub-CI pytest collection never
  breaks.
- **Design system:** no emoji/decorative glyphs in `src/` (the `ui-glyphs` guard
  scans test files too - build glyph-asserting patterns from code points); Carbon Pro
  tokens per `DESIGN.md`.
- **Contracts untouched:** never modify the M5/M6 `RuntimePlan` contract or resolver.
- **Honesty rails:** measured-never-masquerades-as-estimated (TRT auto-off until the
  sweep blesses it); "waived-with-issue" always means a real tracked issue; the Codex
  final gate is the ship sign-off.
- **PR rhythm:** PR -> `gh pr checks --watch` -> `--squash --delete-branch`; pause for
  maintainer review between PRs.

---

## S10. Acceptance Criteria

- Every gate green on both CI paths; clean-clone build succeeds.
- TODO/stub/dead-module audit returns zero, or explicitly waived-with-issue (tracked).
- TRT path is stub-free in code (no `NotImplementedError`), auto-off until blessed,
  with a maintainer verification runbook.
- Docs complete and accurate; `THIRD-PARTY-NOTICES.md` present; license scan clean (no
  unresolved copyleft conflict); README refreshed with screenshot slots.
- CHANGELOG `[3.1.0]` written; version bumped to 3.1.0 everywhere it is sourced.
- Codex final-sweep findings closed; `v3.1.0` tagged + published per the release
  process (maintainer step).

---

## S11. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Unverified TRT code is wrong on real hardware | Auto-off until blessed + hard-fallback to eager; explicit opt-in only; async verification runbook; not a release blocker |
| Dead-module sweep deletes live code | Import-graph reachability + manual confirmation before deletion; full green gates after cleanup; revert on any red |
| License scan surfaces a copyleft conflict | Flagged loudly in PR3; resolved (replace/remove dep or adjust posture) before the Codex gate, never silently shipped |
| Windows/Linux CI path divergence | Portable fixtures; both CI paths green before each merge (standing rail) |
| Version-string drift (3.0.0 left somewhere) | PR3 greps every source-of-truth for the version; clean-clone build + about-screen check confirm 3.1.0 |
| Clean-clone reveals hidden local-state dependency | Explicit from-scratch build in the release gate before tagging |
