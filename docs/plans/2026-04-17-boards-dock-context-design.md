# Boards Dock Context Design

Date: 2026-04-17

## Status

Approved direction: keep using existing `Project` records as lightweight boards.

This pass improves the right-context Boards dock without introducing a separate
board model, editor, drag ordering, or persistence migration.

## Goal

Make the Boards dock easier to scan by showing useful board metadata, ordering
boards by recent activity, and grouping active-board scenes by workflow state.

## Approach Options

### Recommended: Derived Project-Based Board Context

Use the existing `Project` and `Scene` records. Derive board metadata from the
project name, dimensions, frame rate, scene counts, active scene, and modified
timestamp. Sort boards by `modified` descending in the dock only. Group scenes
for the active board by status.

Trade-offs:

- lowest implementation risk
- no data migration
- keeps Storyboard and Boards aligned
- does not solve future board-specific editing needs

### Separate Board Model

Introduce a new board store slice and map boards to projects or scenes.

Trade-offs:

- cleaner long-term domain model
- higher risk because Storyboard, Viewer, and project persistence would need new
  relationships
- premature while the board product shape is still lightweight

### Project Metadata Extension

Store board-specific fields inside `Project.metadata`.

Trade-offs:

- reuses persistence and leaves room for future board labels
- can become a loosely typed dumping ground
- unnecessary for this read-only context pass

## Design

The Boards dock remains a compact right-side stack section. Empty state and
actions stay unchanged.

When boards exist, the list is sorted by recent activity. The active board still
comes from `activeProjectId`; sorting does not mutate project order in the store.
Each board row shows:

- board name
- scene count
- dimensions
- frame rate
- updated date

The active board expands inline. Its scenes are grouped by status:

- In Progress: `queued` and `generating`
- Complete: `complete`
- Draft: `draft`
- Needs Attention: `error`

Within each group, scenes use `orderIndex` for stable ordering. Scene buttons
keep thumbnails, active selection styling, and the existing `setActiveScene`
behavior.

## Data Flow

`WorkbenchBoardsDock` reads `projects`, `activeProjectId`, and `activeSceneId`
from `useAppStore`.

The component derives:

- `orderedProjects` from `projects`
- board metadata labels from each `Project`
- grouped active scenes from the selected `Project.scenes`

No new store fields are required for this pass.

## Testing

Add component tests for:

- boards render in most-recently-modified order
- board rows show dimensions, frame rate, updated date, and scene count
- active-board scenes group by status and preserve scene selection
- scene groups order scenes by `orderIndex`

Run the existing Carbon Pro and glyph policy checks because this file is part of
the guarded shell surface.

## Non-Goals

- no separate board model
- no drag-and-drop board or scene reordering
- no board metadata editing UI
- no Storyboard layout refactor
- no migration of existing project records

## Success Criteria

- The Boards dock communicates what each board contains without opening
  Storyboard.
- Recently changed boards appear first.
- Active-board scenes are easier to scan by status.
- Existing board creation, Storyboard opening, scene creation, thumbnail, and
  scene selection behavior still works.
