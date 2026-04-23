# Workflow Real Execution Design

## Goal

Make the existing Workflow workbench execute real text-to-image workflows through the shipped generation pipeline instead of stopping at graph editing and ComfyUI export. The first execution slice should validate the supported graph subset, resolve a real generation request from workflow graph plus current app context, run the job through Electron generation IPC, and hand the result back into the existing Viewer and asset flow.

## Chosen Approach

Use a renderer-side workflow runner over the existing generation pipeline.

Keep workflow execution in the renderer and store layer for this slice. The workbench should validate the active workflow graph, derive a single image-generation request from the current workflow and app context, then submit that request through `window.electron.generation.generateImage`, using the same `addJob`, `updateJob`, polling, notification, and `syncAssetsFromJobStatus` path already used by `GeneratePanel` and `QuickGeneratePanel`.

This approach was chosen over a new Electron-side workflow executor because it delivers real execution now without inventing a second backend contract. It also keeps the first execution slice narrow: one supported workflow subset, one real output path, one existing review handoff.

## Alternatives Considered

### 1. Renderer-side workflow runner

- Reuses the current generation transport and job store.
- Smallest architecture change for the first real execution milestone.
- Recommended.

### 2. Electron-side graph runner

- Better long-term home for broader workflow execution.
- Requires a new IPC contract and execution service before the current workflow subset is even useful.

### 3. Partial real execution with simulated workflow chrome

- Faster to land.
- Leaves the workbench half-fake and does not satisfy the real-execution requirement.

## Supported Workflow Scope

This first execution milestone supports only a narrow executable subset:

- `CLIPTextEncode`
- `CheckpointLoaderSimple`
- `KSampler`
- `PreviewImage`
- `SaveImage`

The first real workflow type is text-to-image only.

Out of scope for this milestone:

- video execution
- img2img or edit-region execution
- arbitrary ComfyUI node-class execution
- backend-owned graph traversal
- multiple sampler runs in one workflow
- workflow batching

## Architecture And State Model

Persisted workflow data remains in `WorkflowRecord`:

- graph
- metadata
- `status`
- `runHistory`
- `runOutputSummary`

Transient execution state should be stored separately in a non-persisted runtime map keyed by `workflowId`.

Expected runtime fields:

- validation errors and warnings
- active job id
- last run id
- last failure message
- resolved request summary for the current validation pass

This split keeps authored workflow content durable while keeping execution UI state local to the current session.

Implementation should live under `src/features/workflow/`:

- `validateWorkflowExecution.ts`
- `resolveWorkflowGenerationRequest.ts`
- `runWorkflowExecution.ts`

## Validation Contract

Validation has three passes.

### 1. Structural validation

Reuse the current graph integrity rules already enforced for ComfyUI export:

- linked inputs cannot reference missing nodes
- edges cannot connect a node to itself
- target inputs cannot receive duplicate links

### 2. Supported-subset validation

Reject workflows that contain unsupported node classes in this milestone. The workbench should surface these as explicit execution errors, not hidden export-only failures.

### 3. Runtime-input validation

The workflow must resolve to exactly one executable image request:

- exactly one `KSampler`
- one prompt source wired to `sampler.positive`
- one model source wired to `sampler.model`
- valid numeric values for `steps`, `cfg`, and `seed`
- usable width and height values from workflow settings

Warnings can be used for soft fallbacks, but execution only proceeds when there are no validation errors.

## Parameter Resolution

Parameter precedence is deterministic.

- Prompt: `CLIPTextEncode.inputs.text` if non-empty, otherwise active scene prompt, otherwise generation draft prompt, otherwise validation error.
- Negative prompt: app context only for this milestone, from active scene or generation draft.
- Model: `CheckpointLoaderSimple.inputs.ckpt_name` first, then app-context fallback, otherwise validation error.
- Steps / CFG / seed: `KSampler` literals first, then workflow defaults, then app-context seed as the last fallback.
- Width / height: workflow `settings` are authoritative in this slice. The normal Generate pane controls do not silently override workflow dimensions.

The resolved request should be visible in the workbench as a compact execution summary before the user runs the workflow.

## Runtime Contract

`Validate` should:

- run structural and execution validation
- update the transient runtime state for the active workflow
- show errors and warnings inline in the workbench
- never submit a job

`Run Workflow` should:

- re-run validation
- block on validation errors
- set the persisted workflow `status` to `running`
- create a queued workflow run entry
- submit one real `generateImage` request through Electron IPC
- register the job in the existing generation store with workflow metadata such as `workflowId` and `source: workflow`
- poll status using the same model already used by Generate and Quick Generate

`PreviewImage` and `SaveImage` act as validation-only downstream sinks in milestone one. They validate that the sampler output is consumed by the intended review/save path, but they do not trigger separate backend actions because the existing generation pipeline already writes outputs and syncs assets.

## Completion Handoff

Success path:

- update the workflow run record from the real job result
- update `runOutputSummary`
- move the workflow `status` to `complete`
- sync assets into the shared asset library
- focus the new asset in Viewer via `activeViewerItemId`
- switch the center workspace to `viewer`

Failure path:

- store the failure in the active workflow runtime state
- add a failed workflow run entry
- restore the persisted workflow status away from `running`
- keep the user on the Workflow surface with the error visible

Rerun should work immediately after failure without a page reload.

## UI Changes

`WorkflowWorkbench` becomes the single execution surface for this slice.

Required UI additions:

- top toolbar actions: `Validate`, `Run Workflow`
- active run state in the top toolbar
- inline validation errors and warnings in the metadata rail
- resolved execution summary in the metadata rail
- richer run history status in the output rail while a run is active

The workbench should not duplicate the full Generate panel. Workflow execution is graph-owned with minimal app-context fallback, not a second copy of the general generation controls.

## Failure Handling

Surface these failure classes explicitly:

- unsupported node types
- missing prompt/model wiring
- invalid numeric sampler inputs
- backend unavailable
- submit-time IPC failure
- poll-time job failure

Execution errors should be visible in the workbench and should also create an honest failed run record so the history reflects what happened.

## Verification Rules

This slice should ship with:

- unit tests for workflow execution validation
- unit tests for request resolution and parameter precedence
- store tests for workflow runtime state and persistence boundaries
- workbench component tests for validate/run controls, disabled states, and error rendering
- one renderer integration-style test with mocked Electron generation IPC
- `npm run typecheck`
- focused workflow test runs
- final build validation once the workflow execution slice is green

## Out Of Scope

- no new Electron workflow IPC contract
- no arbitrary node execution engine
- no workflow batching
- no video workflow execution
- no visual workflow debugger beyond run status and validation output
- no new queue-management screen in this slice
