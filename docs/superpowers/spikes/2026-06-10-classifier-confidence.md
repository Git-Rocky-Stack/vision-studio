# Spike C - Classifier Confidence (Model Foundry M4)

> Time-boxed throwaway exploration mandated by the Model Foundry spec
> (`docs/superpowers/specs/2026-05-30-model-foundry-design.md`, section 8.1, spike C)
> before any M4 (Search + classifier + security) production code. Exploration code is
> throwaway and was NOT held to TDD. The durable artifacts are this document and the
> committed labeled fixture corpus (`backend/tests/fixtures/classifier_corpus/`).

**Date:** 2026-06-10
**Branch:** `docs/model-foundry-spike-c`
**Verdict:** **GO (with adjustments)** - header + HF-metadata classification assigns
Verified/Compatible/Experimental across a real 41-repo corpus at **41/41 with a
false-"Compatible" rate of 0**, provided tier assignment demands a *positive* signal
and defaults to Experimental. One live M3 bug was found and fixed red-green along the
way (vae false-positive on text encoders). The corpus is committed as M4 test data.

---

## 1. The question (from spec section 8.1)

> Does header + HF-metadata classification reliably assign
> Verified/Compatible/Experimental across a real ~30-50 repo corpus, with an
> acceptable false-"Compatible" rate?
> **Output:** signal set + thresholds; labeled fixture corpus -> becomes M4 test data.

Per spec section 4.4, Spike C also owes a verdict on the **accuracy of M3's
safetensors-header type detection** against real-world repos.

## 2. Method

A 41-repo corpus stratified across six failure surfaces: 8 Verified-catalog entries,
12 should-be-Compatible (core families, boundary cases, aux components, loose loras),
11 false-Compatible traps (diffusers repos whose pipeline class we do NOT ship -
Qwen-Image, Wan 2.2, CogVideoX, HunyuanVideo, Cascade, Kandinsky-3, AuraFlow,
DeepFloyd-IF, XL-inpaint, x4-upscaler, T2I-Adapter), 5 pickle/remote-code/loose-dump
repos, 4 non-diffusion repos (LLM/ASR/embeddings), 1 mixed-artifact repo
(SDXL-Lightning).

Every signal was captured **pre-download and unauthenticated** (the app's default
state) via `HfApi.model_info(files_metadata=True)`, tiny-file fetches of
`model_index.json`/`config.json` into an isolated cache (never the user's real HF
cache), and **server-parsed safetensors headers**
(`HfApi.get_safetensors_metadata` / `parse_safetensors_file_metadata`). No weights
were downloaded. 41 repos snapshotted in 65 s.

Ground truth for "will it load" = the pipeline classes Vision Studio actually
imports today (`direct_generator.py`, `direct_video_generator.py`,
`controlnet_service.py`, `lora_service.py`): `StableDiffusionPipeline`,
`StableDiffusionXLPipeline`, `StableDiffusion3Pipeline`, `FluxPipeline`,
`FluxFillPipeline`, `AnimateDiffPipeline`, `LTXPipeline`,
`StableVideoDiffusionPipeline`, `StableDiffusionControlNetPipeline` + components
(`ControlNetModel`, `MotionAdapter`, `AutoencoderKL`) + loras via
`load_lora_weights`. **The codebase contains zero `from_single_file` calls** - that
fact shaped the single-file-checkpoint ruling (adjustment 4).

## 3. Headline findings

| Question | Answer (measured) |
| --- | --- |
| Tier accuracy on the corpus | **41/41 (100%)** after one evidence-driven rule iteration (first pass 37/41, one false-Compatible). In-sample by construction - the honest guarantee is structural: every `compatible` verdict requires a positive signal; everything else defaults to `experimental`. |
| False-Compatible rate (the trust-eroding metric, spec section 10) | **0/41.** The one first-pass false-Compatible (Counterfeit-V2.5) turned out to be a wrong hand label, not a classifier error - the repo's diffusers tree genuinely ships safetensors variants and loads. |
| Strongest pre-download signal | `model_index.json:_class_name` and the hub-derived **`diffusers:<ClassName>` tag agree everywhere both exist** - and the tag **survives gating** (FLUX.1-dev, SD3.5-medium, DeepFloyd-IF all expose their class via tags while file fetches return `GatedRepoError`). Gated repos classify on tags alone. |
| Lora channel | `lora` tag + `base_model:<repo>` tag, where the base repo resolves through our own verified catalog to a family (sdxl/flux/sd15/sd35). Confirmed on lcm-lora-sdxl, pixel-art-xl, XLabs flux-RealismLora. Backup channel: per-file header keys (kohya `lora_unet_*`, peft `.lora_A.`, XLabs `*_lora{1,2}.{down,up}`). |
| Remote-code detectability | `config.json:auto_map` + repo `.py` census catch it pre-download (chatglm3-6b: `auto_map` + 4 `.py` files). Non-diffusers `library_name` is the outer guard. |
| M3 header type detection on real tensors | 15/19 judged files correct. **One live bug found and fixed in this PR**: the vae rule fired on `encoder.` OR `decoder.` prefixes, mis-typing T5/CLIP/BERT text encoders as "vae" (measured on AuraFlow/CogVideoX/Wan text-encoder shards + MiniLM). Fixed: vae now requires BOTH halves; regression cases added from the real key shapes. Remaining 4 misses are conservative `unknown`s (diffusers-layout controlnet, XLabs lora) - M4 pattern additions, fixtures captured. |
| Hub churn is real | `stabilityai/stable-diffusion-2-1` now 401s (removed); `runwayml/stable-diffusion-v1-5` silently **redirects** to the `stable-diffusion-v1-5/` mirror org. Unreachable non-catalog repos need a distinct `unavailable` outcome, never an error. |
| Architecture markers (feeds M5) | Discriminate perfectly across the corpus: `conditioner.embedders.1`/`add_embedding.` (sdxl) vs `cond_stage_model.` (sd15) vs `double_blocks.`/`single_blocks.` (flux/DiT) vs `model.diffusion_model.` (LDM full) vs `encoder.`+`decoder.` (vae) vs `controlnet_cond_embedding` (diffusers controlnet). |

## 4. The classifier decision ladder (the M4 signal set)

Precedence is the threshold. Measured rules, in order; **first match wins, default
is Experimental**:

1. **Catalog**: `repo_id` in `verified-catalog.json` -> **Verified** (authoritative even
   if the hub copy is gone - bytes may exist locally).
2. **Reachability**: unreachable non-catalog repo -> **`unavailable`** (distinct
   outcome; not a tier, never an error storm).
3. **Library guard**: `library_name` not in `{diffusers, None, stable-diffusion,
   safetensors}` -> **Experimental** ("library 'transformers' is not an image/video
   generation artifact we load"). Primary defense for LLM/ASR/embedding repos.
4. **Remote-code guard**: `config.auto_map` present or repo ships `.py` files ->
   **Experimental** ("runs code authored by the repo - denied by default").
5. **Class signal** (`model_index._class_name` || `diffusers:<Class>` tag ||
   `config._class_name`):
   - class in shipped set + safetensors in the **component tree** -> **Compatible**
     ("diffusers sdxl (StableDiffusionXLPipeline) - safetensors - no remote code");
   - class in shipped set + gated -> **Compatible** ("gated; format verified after
     license accept");
   - class in shipped set + pickle-only tree -> **Experimental** (consent path);
   - class known but NOT shipped -> **Experimental** ("QwenImagePipeline not
     supported by shipped pipelines"). This rule alone defuses all 11 traps.
6. **Lora tag channel**: `lora` tag + `base_model:` tag resolving through the catalog
   to a shipped family + safetensors -> **Compatible**.
7. **Header lora channel** (loose files): per-file keys match lora patterns AND no
   non-lora weight files alongside (mixed repos -> Experimental, role ambiguous) ->
   **Compatible** for sd/sdxl/flux families.
8. **Default**: -> **Experimental** with an honest reason ("loose safetensors without
   class metadata - typed only after local header index", "pickle-only weights", ...).

Every verdict carries the one-line `tier_reason` shown above - the spec section 5.2
requirement fell out of the rules naturally.

## 5. Evidence-driven corrections (what the corpus taught us)

- **Counterfeit-V2.5 relabeled experimental -> compatible.** Its components ship BOTH
  `.bin` and `.safetensors`; safetensors-first loading genuinely works. The
  classifier was right; the hand label was wrong.
- **OrangeMixs stays experimental** - its diffusers tree is `.bin`-only (pickle);
  loose safetensors at the root belong to *other* models in the dump. This pair
  forced the **tree-scoped** safetensors rule (adjustment 3).
- **lcm-lora-sdxl is kohya-format** (not diffusers-format as assumed) - and sd/sdxl
  unet attention paths CONTAIN `transformer_blocks`, so unet-style prefixes must be
  checked BEFORE DiT-block patterns or sdxl loras misclassify as DiT loras.
- **SDXL-Lightning stays experimental**: full LDM checkpoints + bare unets + kohya
  loras in one repo, no `lora`/`base_model` tags. With no `from_single_file` path in
  the app, none of it is one-click loadable; per-artifact tiering needs the M4
  artifact-picker design.

## 6. The four adjustments (to the M4 design)

1. **Positive-signal-or-Experimental is the threshold.** No probabilistic scoring is
   needed: the precedence ladder with a conservative default measured 0
   false-Compatibles. M4 implements the ladder exactly and keeps the corpus as the
   regression gate.
2. **Gated repos classify from tags alone** - `diffusers:<Class>` + `gated` flag;
   file census and headers are unavailable pre-consent. `tier_reason` must disclose
   "format verified after license accept", and post-acquisition header inspection
   must be able to downgrade (spec's upgrade/downgrade-post-index hook).
3. **Safetensors presence is tree-scoped, not repo-scoped.** Judge the format of the
   diffusers component tree (`unet/`, `transformer/`, `vae/`, `text_encoder*/`, ...)
   that `from_pretrained` will actually pull - root-level extras must not vouch for a
   pickle-only tree (OrangeMixs), nor taint a clean one (Counterfeit).
4. **"Compatible" is bounded by load paths that exist today.** Zero
   `from_single_file` call sites means loose single-file checkpoints are honestly
   Experimental until M5 wires `resolve_model_runtime` (this also retroactively
   validates M3's `tier="experimental"` for indexed artifacts). Standalone loras ARE
   Compatible today via `load_lora_weights`. Revisit this boundary in M5.

## 7. Bonus findings

- **CivitAI API shape confirmed** (one-call probe): `type` (server-side artifact
  typing), `nsfw` + `nsfwLevel` + `sfwOnly` (the safe-default filter has first-class
  API support), `modelVersions[].baseModel` ("Pony", "Flux.1 D" - CivitAI's own
  vocabulary, needs a mapping table), `files[].metadata.format` =
  `SafeTensor|PickleTensor` (**direct pickle detection pre-download**),
  `files[].hashes` (SHA256/BLAKE3/AutoV2 - enables local-file <-> CivitAI identity
  reconciliation against M3's identity layer), `pickleScanResult`/`virusScanResult`.
  Latency variance is real: an uncached query exceeded a 20 s read timeout; the
  cached retry returned in 0.2 s. No rate-limit headers exposed. M4's
  cache + backoff + offline-degrade is mandatory, not defensive.
- **Hub redirects mask renames**: `runwayml/stable-diffusion-v1-5` resolves via
  redirect to the mirror org. The catalog's repo_id keeps working, but M4 should
  record the canonical id it actually resolved to.
- **`NotASafetensorsRepoError`** is the *normal* repo-level response for lora repos
  (no root `model.safetensors`); per-file parsing is the correct channel for
  diffusion artifacts.
- **`library_name` has a long tail**: `None` (HunyuanVideo), `stable-diffusion`
  (CompVis originals) - the guard must treat unknown/absent as "fall through to
  header rules", not as an error.

## 8. Seeded M4 test list (feeds spec section 8.2 "classifier tier logic")

All table-driven over `backend/tests/fixtures/classifier_corpus/` (41 fixtures);
no network, both CI OSes.

1. **Corpus regression** - classifier over all 41 fixtures reproduces every
   ground-truth tier; **false-Compatible = 0 asserted as its own invariant**.
2. **Precedence ladder** - catalog beats class signal; library guard beats class
   signal; remote-code guard beats class signal (synthetic permutations).
3. **Gated-repo path** - class from `diffusers:<Class>` tag with file fetches
   erroring -> Compatible + disclosure reason (FLUX.1-dev, SD3.5, DeepFloyd
   fixtures).
4. **Tree-scoped safetensors** - OrangeMixs (bin-only tree + root safetensors) ->
   Experimental; Counterfeit (dual-format tree) -> Compatible.
5. **Lora tag channel** - base_model resolvable (lcm-lora, pixel-art-xl, XLabs) ->
   Compatible; `lora` tag with unresolvable base -> Experimental.
6. **Mixed-artifact guard** - SDXL-Lightning -> Experimental ("role ambiguous").
7. **Unsupported-class traps** - all 11 trap fixtures -> Experimental with the class
   named in `tier_reason`.
8. **Non-diffusion guard** - 4 fixtures (LLM/ASR/embeddings) -> Experimental, never
   Compatible.
9. **`unavailable` outcome** - sd-2-1 fixture -> `unavailable`, distinct from
   Experimental; no exception.
10. **Null-tolerance** - `library_name=None` (HunyuanVideo), absent tags/config:
    classifier never raises.
11. **Header pattern additions** (red-green from captured `detection_keys`):
    `controlnet_cond_embedding` -> controlnet; XLabs `*_lora{1,2}.{down,up}` +
    `double_blocks.` -> lora. (The vae both-halves regression already landed with
    this spike's fix.)
12. **kohya-before-DiT ordering** - lcm-lora/pixel-art-xl detection_keys classify
    lora with sd/sdxl family, not DiT.
13. **Post-index reconciliation hook** - metadata-tier upgraded/downgraded by local
    header inspection once artifacts land on disk (design-level; fixture pairs
    available).
14. **CivitAI mapper** - `format=PickleTensor` -> Experimental + consent;
    `nsfw`/`nsfwLevel` filtered by default; `baseModel` vocabulary mapping table
    (unknown vocab -> Experimental, never a guess).

## 9. Environment snapshot (for reproducibility)

- Windows 11 Pro 10.0.26200; backend venv Python 3.12.12; `huggingface_hub` 1.10.1;
  `diffusers` 0.37.1; all hub calls **unauthenticated** (the app's default state).
- 41-repo snapshot: 65 s wall. Tiny-file fetches isolated to a temp cache - the
  user's real HF cache was never touched.
- Verified catalog at capture: 13 entries (`backend/foundry/verified-catalog.json`).
- Probe scripts (snapshot / classify / header-replay / distill) were throwaway, run
  from a temp dir, not committed - per spike discipline. Their distilled outputs are
  the committed corpus.

## 10. Ground-truth relabels (evidence-based, per the corpus discipline)

- **2026-07-04 - `diffusers/controlnet-canny-sdxl-1.0`: compatible -> verified.**
  Evidence: the repo became a verified-catalog member when #34 PR2 added the
  `controlnet-canny-sdxl` record (guided-passes ControlNet cycle). Catalog
  membership classifies as Verified by design (spec 5.2); the fixture's signal
  snapshot is unchanged - only the catalog context moved.
