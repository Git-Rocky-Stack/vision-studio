# Workflow Metadata Design

Date: 2026-04-17

## Goal

Add lightweight workflow metadata before introducing linear UI schema or node editing.

## Approach

Workflow records will carry three user-facing metadata fields:

- `description`: a short explanation of what the workflow is for
- `tags`: compact labels for library scanning
- `notes`: operator guidance or handoff context

Default workflows will include meaningful metadata. New draft workflows will start with empty metadata so user-created records do not inherit misleading baseline copy.

## UI

`WorkflowWorkbench` will render the active workflow's description, tags, and notes in the left metadata dock. Tags will render as compact chips. Empty metadata will use small fallback copy so drafts remain readable without adding editing controls in this slice.

## Data Flow

`DEFAULT_WORKFLOWS` seeds metadata. `cloneWorkflow` deep-copies `tags`. `createWorkflow` creates a draft workflow with empty `description`, empty `tags`, and empty `notes`.

## Testing

Store tests will cover default metadata and draft metadata. Component tests will cover active workflow metadata rendering and metadata changes after selecting another workflow from the library.

