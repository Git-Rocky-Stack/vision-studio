# M4 Codex Supply-Chain Review - Gate Record

> Spec 8.4 gate: independent second-model review after M4 (pickle consent,
> `trust_remote_code`, NSFW defaults, classifier safety). Reviewer: OpenAI
> Codex CLI 0.136.0 (gpt-5.5, reasoning effort high), run read-only against
> the merged M4 surface on `main` at `29dcde87`, 2026-06-11. Every finding
> was independently verified against the code before acceptance.

**Initial verdict:** FAIL (2 High, 2 Medium, 1 Low)
**Post-remediation:** all accepted findings fixed in `fix/m4-codex-supply-chain-gate`, TDD (22 new tests). Re-review outcome recorded at the bottom.

---

## 1. Findings and dispositions

| # | Severity | Finding | Disposition | Remediation |
| --- | --- | --- | --- | --- |
| H-1 | High | HF search classifies from PARTIAL listing data (tags, no file/config census): a repo advertising `diffusers:<ShippedClass>` + `safetensors` tags while shipping custom `.py`/`auto_map` reaches **Compatible** with `trust_remote_code=False`, bypassing the remote-code consent gate and violating the false-Compatible=0 invariant. | **Accepted** - verified: `classifier.py` rule 4 needs `has_auto_map`/`py_file_count`, both unset for `signals_from_listing`; the `partial and has_safetensors` branch then grants Compatible. | Two layers. **Display:** `hub_search` re-verifies every would-be-Compatible partial verdict against full repo signals (`fetch_repo_signals`, riding the same per-request token); fetch failure fails closed to Experimental ("full repo signals unverifiable"). Non-Compatible partials never trigger the fetch (no amplification). **Boundary:** `enqueue_download` re-fetches full signals for transient HF records, reclassifies, writes the fresh verdict back onto the record (`registry.update_transient`), THEN runs the consent checks; unreachable signals -> 503 `repo-signals-unverifiable`, zero bytes moved. |
| H-2 | High | `_resolve_files` downloads EVERY repo path for diffusers repos: pickle sidecars (`bonus.ckpt`, component `.bin`) and repo-authored `.py` land on disk with no pickle consent (the gate only checked `record.format == "pickle"`). | **Accepted** - verified: repo branch lists all paths via `get_paths_info(repo_id, [])` unfiltered. | Repo file lists are filtered at resolution: `.py` is NEVER fetched (no loader executes repo code in M4; M5 revisits with loader-side consent); pickle suffixes (`.ckpt/.pt/.pth/.bin/.pkl`) are fetched only with per-model pickle consent (`consent_lookup` wired from `ConsentStore`, failing closed on None/error). Byte preflight budgets only the filtered list. |
| M-1 | Medium | CivitAI URL allowlist applies only to the first request; `requests` then follows redirects automatically (any scheme/host), with the Bearer header subject to library-internal stripping behavior. | **Accepted, fix adjusted** - redirects are now walked MANUALLY: every hop must be https; the Bearer token attaches only while the hop host is `civitai.com` (delivery CDNs never see it); chain capped at 5 hops; relative `Location` resolved explicitly. CDN hostnames are deliberately NOT allowlisted by name - they are infrastructure-volatile; integrity comes from the mandatory sha256 over the final bytes (hashless records already refused) and confidentiality from confining the secret to the first-party host. |
| M-2 | Medium | `page` is unbounded and drives `limit = page * page_size` on the HF call - one local request can amplify into an unbounded hub request. | **Accepted.** | FastAPI `Query` constraints on the search route: `page` 1-50, `q` <= 256 chars, `author` <= 128, `task` <= 64, `sort`/`source` length-capped. Violations are native 422s. |
| L-1 | Low | Convert errors can leak absolute local paths; the success response returns an absolute `safetensors_path`. | **Partially accepted.** Error messages: fixed - `convert.py` raises with basename only and the route surfaces only the exception type for `OSError` (full detail to server logs). The `safetensors_path` response field is **retained by design**: Vision Studio is a local-first desktop app whose API already returns local paths (`locations`, `local_path`) as product surface. |

### Reviewer claims verified sound (no action)

Codex's positive assurance was spot-checked and stands: consent store deny-by-default with corrupt-file fail-closed; `torch.load(weights_only=True)` as the only conversion path; tokens main-process-only with setter-only exposure and per-source routing; CivitAI hashless refusal + pre-replace sha256; 100 MB header cap; NSFW off-by-default and not persisted; search error responses leaking exception TYPE only.

## 2. Residual risks carried to M5 (tracked)

- **Loader-side enforcement** (Codex + plan): no `trust_remote_code=True` load without consent, no pickle load outside the `weights_only=True` conversion path, no safetensors->pickle fallback. Lands with `resolve_model_runtime` (M5).
- **Revision pinning** for transient HF downloads (download the revision the signals were classified at).
- `.py` exclusion means a future remote-code-consented load path must re-fetch code files explicitly under that consent (deliberate M4 posture).

## 3. Verification

- TDD: 22 new tests across `test_foundry_hub_search` (verification layer, fail-closed, no-amplification), `test_foundry_consent_api` (`SupplyChainGateTests` boundary reclassification incl. 503 + record refresh), `test_foundry_download_manager` (`DownloadFileFilterTests`), `test_foundry_civitai_download` (`RedirectPolicyTests`), `test_foundry_search_api` (param bounds), `test_foundry_registry` (transient helpers), `test_foundry_convert` (path-free errors).
- Backend foundry suite: 307 passed, 2 skipped. Full gates green before ship (typecheck / vitest / build / pytest).

## 4. Re-review outcome

_Recorded after the focused Codex re-review of the remediation diff:_ see the addendum commit on this file.
