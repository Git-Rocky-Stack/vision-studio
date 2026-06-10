# Classifier corpus (Spike C, 2026-06-10)

Labeled real-world HF-repo metadata snapshots that gate the M4 tri-tier
compatibility classifier. Produced by Spike C
(`docs/superpowers/spikes/2026-06-10-classifier-confidence.md`); this corpus is
the spike's mandated durable output ("labeled fixture corpus -> becomes M4 test
data", design spec section 8.1).

## Contents

- `index.json` - manifest: every repo, its ground-truth tier, stratum, reachability.
- `<repo-slug>.json` - one fixture per repo: the signals available
  **pre-download and unauthenticated** (the app's default state) plus the
  hand-verified ground truth.

## Fixture schema (per repo)

| Field | Meaning |
| --- | --- |
| `ground_truth.tier` | `verified \| compatible \| experimental` - what a correct classifier must output (`unavailable` repos keep their label; the expected classifier outcome for them is `unavailable`). |
| `ground_truth.reason` / `.stratum` | Why, and which corpus stratum the repo exercises. |
| `reachable`, `gated`, `error` | Hub reachability at capture time (`stabilityai/stable-diffusion-2-1` 401s - deliberately kept). |
| `library_name`, `pipeline_tag`, `tags`, `diffusers_class_tags` | hub metadata channels. `diffusers:<Class>` tags survive gating; tiny-file fetches do not. |
| `model_index`, `config` | `model_index.json` (full) and the classification-relevant subset of `config.json` (`_class_name`, `auto_map`, ...). |
| `siblings`, `ext_census`, `py_files`, `has_safetensors` | file census - feeds the tree-scoped safetensors rule and remote-code suspicion. |
| `safetensors_per_file.<file>` | server-parsed header signals: `tensor_count`, `key_prefixes` (depth-2 histogram), `sample_keys` (12), `detection_keys` (every key matching a type/family-detection pattern, capped at 200 with a head+tail spread). Raw full key lists are not committed - the classifiers only consume pattern-relevant keys (verified at distill time). |
| `safetensors_errors` | real failure shapes (`NotASafetensorsRepoError` on lora repos, gating errors). |

## Invariants M4 tests must enforce over this corpus

1. **False-Compatible = 0** - no fixture with ground truth `experimental`
   may ever classify `compatible`. This is the spike's critical metric.
2. Tier requires a positive signal; the default is `experimental`.
3. Unreachable non-catalog repos -> `unavailable`, never an error.

## Regeneration

Snapshots were captured unauthenticated on 2026-06-10 with `huggingface_hub`
1.10.1 (probe scripts were spike-throwaway, not committed - see the spike doc
for the capture method). The hub moves: repos get gated, renamed, deleted
(SD 2.1 vanished; runwayml/sd-1-5 now redirects). **Do not silently
re-capture** - label changes must go through the same evidence-based review the
spike applied (relabels are documented in the spike doc).
