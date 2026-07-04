# Current To-Dos — Remaining Work Audit (2026-07-04)

> Point-in-time snapshot of every known remaining to-do, stub, and unwired
> feature, taken immediately after PR #40 ("Phase 1: LoRA end-to-end (#136)")
> merged to `main` at `86f7443a`. Verified against the code on that commit —
> every claim below was re-checked in-source, not carried forward from older
> audits. Supersedes nothing; the M10 waive-with-issue dispositions remain the
> canonical triage.

## Context

The M10 release-hardening pass (see
`superpowers/plans/2026-06-20-m10-release-hardening.md`) audited every
TODO/stub in the tree and either fixed it or waived it with a tracked GitHub
issue. This document is the post-#136 refresh of that picture: what is still
open, what has since closed, and what is intentionally out of scope.

Roadmap state: M1–M10 are all Complete/Baselined per
`superpowers/specs/2026-06-15-vision-studio-path-to-v1-roadmap-design.md`.
Launch-readiness Phase 1 items #135 (Model Foundry UI, PR #39) and #136 (LoRA
end-to-end, PR #40) are both shipped.

## 1. Tracked open issues (the real remaining work)

Priority order: **#34 → #33 → #32**, then the newly promoted **#43 → #42 →
#41** (see §3 and the full order in §5). Backend capability first; the two
UI wires are smaller and partially depend on backend behavior being real.

### #34 — Backend edit + ControlNet services are stubs

Originally "replace LoRA/edit/ControlNet stubs"; **the LoRA third closed with
PR #40** (real diffusers named-adapter integration in `backend/foundry/lora.py`;
the orphaned `/api/v1/lora` stub was deleted). Remaining:

- `backend/services/edit_service.py` (`Tracked: #34`, module docstring) — the
  whole service is a stub:
  - "Background removal" converts to RGBA without removing anything
    (lines ~165–177).
  - "Upscale" is a plain PIL resize, no SR model (lines ~228–248).
  - "Face restoration" returns the original image, `faces_detected = 0`
    (lines ~301–321).
  - `load_models()` only flips a flag ("stub mode", lines ~340–347).
- `backend/services/controlnet_service.py` (`Tracked: #34`, module docstring) —
  emits gray placeholder images as a 200 OK instead of real ControlNet
  conditioning (placeholder generation at ~line 333; unload/reset note at
  ~line 215).

Scope of the real work: diffusers/model-backed background removal,
upscale (super-resolution), face restoration, and ControlNet preprocessing +
conditioned generation, following the same patterns #136 established
(fail-soft, cached-pipeline hygiene, Local-only routing, stub-CI-safe tests).

### #33 — CompositionPreview: generation action unwired

`src/components/studio/CompositionPreview.tsx:48` — `handleGenerate` only
flips the preview to active; it never triggers a generation. Needs the real
generation action with step-image streaming via `generationPreviewSlice`.
(M10 waive-with-issue; comment in-source reads "Tracked: #33".)

### #32 — Canvas text tool: add/delete text layer unwired

`src/components/edit/TextControls.tsx:75,79` — `handleAddText` and
`handleDeleteSelected` are no-ops. Needs integration with the canvas layer
model to add and delete text layers. (M10 waive-with-issue; comments read
"Tracked: #32".)

## 2. Manual / infrastructure items (not code stubs)

- **TensorRT pre-ship verification** — M9 implementation landed, but the
  CUDA correctness sweep + real TRT engine build are an off-CI maintainer
  pass on a real GPU, per the runbook in `TENSORRT_VERIFICATION.md`. TRT
  stays auto-off until that sweep blesses a model family (honesty rail:
  measured never masquerades as estimated).
- **Code signing** — `.github/workflows/release.yml` is manually disabled
  because no `WIN_CSC_*` / `AZURE_*` signing secrets exist; releases are
  published locally via `gh`. Note `electron-builder.yml` sets
  `verifyUpdateCodeSignature: true`, so auto-updates will fail signature
  checks against unsigned builds. See `code-signing.md`.
- **`LICENSE.txt` untracked on `main`** — deliberately left out of the #136
  branch commits; still sitting untracked in the working tree. Decide whether
  it should be committed (and with what header/holder) or removed.

## 3. Promoted to tracked work (2026-07-04 — no more deferrals)

These three were the #136 design spec's explicit out-of-scope exclusions
(`superpowers/specs/2026-06-30-lora-end-to-end-design.md`). Per the
2026-07-04 direction they are now tracked issues, not by-design exclusions:

- **#43 — ComfyUI-graph "LoRA Loader" node** (`src/features/workflow/`) —
  wire the node to the real installed-LoRA library: populate options from
  installed LoRAs, validate base-architecture compatibility, map to
  ComfyUI-visible names for graph execution. Most tractable of the three.
- **#42 — LoRA on hosted providers** — the M6 router currently declines
  LoRA-bearing jobs for all hosted routes. Spike-gated: enumerate which
  provider APIs can accept adapter references at all, add per-provider
  capability flags + payload mapping where supported, keep clear reasoned
  declines where the API cannot accept adapters.
- **#41 — LoRA on SVD** — mixer currently disabled for SVD with a reason;
  backend skips SVD. Spike-gated: diffusers has no standard SVD adapter
  path and the public SVD LoRA ecosystem is thin, so the spike must prove
  the loading path and real-world adapter availability first; if upstream
  support is genuinely absent, the evidence gets documented on the issue
  before choosing an alternative (honesty rail — no fabricated capability).

Still out of scope by design: **LoRA training/creation** (product decision,
unchanged).

## 4. Process gap worth closing

The "launch-readiness plan" that numbered tasks #135/#136 is referenced by
both Phase 1 design specs but is **not checked into the repo** (it lived in a
planning-session task list). If that plan contained Phase 2+ items beyond
#135/#136, they are recorded nowhere. Action: reconstruct and commit it as a
doc, or confirm Phase 1 was its entire content.

## 5. Execution order (approved 2026-07-04)

1. **#34** — real diffusers integration for `edit_service` +
   `controlnet_service` (largest capability gap; brainstorm → design spec →
   plan → execute, per the superpowers workflow used for #135/#136).
2. **#33** — CompositionPreview full generation + step streaming (benefits
   from #34's backend patterns being settled).
3. **#32** — canvas text layer add/delete (self-contained UI/canvas work).
4. **#43** — ComfyUI LoRA Loader node wired to the installed-LoRA library
   (tractable, extends the #136 momentum).
5. **#42** — hosted-provider LoRA (spike first: provider API capability).
6. **#41** — SVD LoRA (spike first: upstream diffusers support + adapter
   ecosystem; evidence documented on the issue either way).
7. Opportunistic: commit `LICENSE.txt` decision, reconstruct the
   launch-readiness plan doc, schedule the TRT maintainer sweep before the
   next release, revisit code signing when certificates are available.
