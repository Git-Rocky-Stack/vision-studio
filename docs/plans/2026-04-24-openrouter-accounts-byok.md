# 2026-04-24 OpenRouter, Local Accounts, and BYOK

## Goal

Add a local-first account layer to Vision Studio so each user profile can keep its own OpenRouter configuration and bring its own API key without introducing mandatory cloud login.

## Implemented In This Slice

- Local account profiles persisted in Electron main-process storage
- One active account at a time, with account create/update/delete/select flows
- OpenRouter API keys stored per account and encrypted with Electron `safeStorage`
- OpenRouter verification against `/api/v1/key`
- OpenRouter prompt-model catalog loading from `/api/v1/models`
- Prompt enhancement routed through OpenRouter when the active account selects `OpenRouter`
- Settings UI for active account management, secure key entry, verification, and prompt-model selection

## Deliberate Scope Boundary

This slice only routes **prompt enhancement** through OpenRouter.

Core image and video generation still run through the existing local backend and model runtime. That keeps the current job queue, progress reporting, asset syncing, and export flow stable while the provider/account foundation lands.

## Architecture

### Local Accounts

- Store key: `userAccounts`
- Shape:
  - `activeAccountId`
  - `accounts[]`
  - `secrets` map keyed by account id

### Secret Handling

- Account metadata is safe to expose to the renderer.
- OpenRouter API keys are **not** exposed to the renderer.
- Keys are encrypted with `safeStorage.encryptString(...)` before being persisted.
- If `safeStorage` is unavailable, saving OpenRouter keys is rejected rather than falling back to plaintext.

### IPC

- `accounts:list`
- `accounts:create`
- `accounts:update`
- `accounts:delete`
- `accounts:set-active`
- `accounts:set-openrouter-api-key`
- `accounts:clear-openrouter-api-key`
- `openrouter:test-connection`
- `openrouter:list-models`

### Prompt Enhancement Routing

- Existing renderer call remains `window.electron.generation.enhancePrompt(...)`
- Electron main now checks the active account:
  - `local` provider -> existing backend `/api/prompts/enhance`
  - `openrouter` provider -> OpenRouter chat completion request with JSON-mode response

## Next Recommended Slices

1. Add per-account usage/credit visibility from OpenRouter key metadata.
2. Extend account-aware provider routing into Prompt Studio, tagging, workflow execution, and batch surfaces.
3. Decide whether video stays local-only or gets a separate hosted-provider strategy.
4. Add richer OpenRouter feature coverage beyond prompt-only stills, or keep advanced canvas controls explicitly local-only.

## Follow-Up Slice Landed

- Added per-account still-image routing preferences:
  - `imageGenerationProvider`
  - `openRouterImageModel`
- Added OpenRouter image-model catalog loading from `/api/v1/models?output_modalities=image`
- Added OpenRouter still-image generation through `/api/v1/chat/completions`
- Wrapped OpenRouter still-image requests in a main-process in-memory job registry so renderer flows still use:
  - `generateImage(...) -> jobId`
  - `getStatus(jobId)`
  - asset syncing from completed job results
- Saved returned base64 image payloads into the managed output root so generated OpenRouter images land in the normal asset library path
- Added explicit still-image provider controls to the account settings UI
- Updated Generate and Quick Generate to recognize the active account's OpenRouter still-image route, bypass the local-backend-online requirement for that path, and surface current-slice limitations

## Scope Boundary For This Slice

- OpenRouter still-image routing is limited to prompt-only stills plus negative prompt, aspect ratio, and seed
- ControlNet, inpaint, reference-image canvas passes, and video remain on the local path
- Timeline/workflow calls that rely on simple image requests can reuse the shared OpenRouter image handler, but there is not yet a dedicated end-to-end UX pass for every surface that submits image jobs

## Verification Notes

- Static review only in this environment
- Node-based `vitest` / `typecheck` remain blocked in the current sandbox by the existing Node crypto startup failure

## Additional Follow-Up Slice Landed

- Added OpenRouter still-image support to `generation:batch`
- OpenRouter batch requests now mint local main-process job ids immediately and fan out one hosted job per prompt using the same in-memory job registry used by single-image OpenRouter jobs
- Batch status, polling, cancellation, and asset syncing continue to flow through the existing `jobId -> getStatus -> syncAssetsFromJobStatus` renderer contract
- Updated `BatchPanel` so it:
  - detects the active account's still-image provider
  - routes hosted batches through the configured OpenRouter image model instead of the local model dropdown
  - allows hosted batches to start even when the local backend is offline
  - surfaces hosted-route status and configuration errors instead of silently failing
- Added OpenRouter key-usage visibility in Settings from `/api/v1/key`, including remaining credits, total usage, BYOK usage, and expiry when available

## Scope Boundary For This Slice

- OpenRouter batch support is still limited to prompt-only still-image batches
- Advanced local-only controls such as ControlNet, inpaint, and reference-image canvas passes remain unavailable on the hosted route
- Video generation remains local-only
- Workflow and Prompt Studio surfaces still need an explicit hosted-provider UX pass where they do not already flow through the shared image-generation IPC

## Next Recommended Slices

1. Add explicit provider-awareness to Workflow Workbench and Prompt Studio where the current UX still implies local-only controls.
2. Decide whether hosted still-image routes should expose richer OpenRouter image options such as `image_size` for supported models, or keep that surface intentionally narrow.
3. Decide whether video stays local-only or gets a separate hosted-provider strategy.

## Additional Follow-Up Slice Landed

- Added shared renderer-side provider routing helpers so account-aware generation paths resolve one active account and one hosted/local route consistently
- Workflow Workbench now:
  - validates against provider configuration, not just graph structure
  - shows the active still-image provider and routed model
  - allows still-image workflow runs through OpenRouter even when the local backend is offline
  - overrides local checkpoint ids with the configured OpenRouter still-image model when the hosted route is active
- Timeline clip generation now:
  - resolves the active still-image provider before submit
  - allows prompt-only still-image timeline runs through OpenRouter while the local backend is offline
  - keeps video and retake generation on the local backend path
  - records hosted image runs against the configured OpenRouter model instead of stale local checkpoint ids
- Prompt Studio now uses the shared generation draft instead of isolated local component state
- Prompt Studio actions are no longer placeholders:
  - `AI Enhance` routes through the configured prompt provider with `clarify`
  - `Expand` routes through the configured prompt provider with `expand`
  - `Negative Suggest` uses OpenRouter when selected, otherwise a local heuristic fallback
  - `Style Transfer` exposes preset modifiers that actually apply to the shared draft prompt
- Added a new OpenRouter negative-prompt suggestion path in Electron main plus preload/renderer typings
- Expanded the local backend prompt helper to support `expand` so Prompt Studio behavior stays aligned across local and OpenRouter providers

## Scope Boundary For This Slice

- OpenRouter is now first-class across prompt tooling, single still-image generation, batch still-image generation, workflow still-image execution, and timeline still-image execution
- Hosted still-image routing is still intentionally limited to prompt-only jobs plus negative prompt, aspect ratio, and seed
- ControlNet, inpaint, reference-image canvas passes, timeline export, and all video generation remain local-only
- Prompt Studio now surfaces those route boundaries more explicitly, but it does not yet expose advanced hosted-model-specific image knobs beyond the existing routed fields

## Documentation Follow-Up

- Updated the in-app User Guide under Settings > User Guide to cover:
  - local accounts and OpenRouter BYOK setup
  - prompt and still-image provider routing
  - Prompt Studio, Generate, Quick Generate, Batch, Workflow, Story, Timeline, and retake guidance
  - current hosted-versus-local capability boundaries so the onboarding copy matches the live product
