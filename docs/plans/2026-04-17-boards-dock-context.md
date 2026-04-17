# Boards Dock Context Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve the right-context Boards dock with derived board metadata, recent-activity ordering, and grouped active-board scenes.

**Architecture:** Keep using existing `Project` records as lightweight boards. Derive display metadata and ordering inside `WorkbenchBoardsDock` without adding new store state or persistence behavior. Group active-board scenes from `Scene.status` and preserve current board/scene selection actions.

**Tech Stack:** React 19, TypeScript, Zustand, Tailwind CSS v4 semantic utilities, Vitest, Testing Library.

---

### Task 1: Board Ordering And Metadata

**Files:**
- Modify: `src/components/layout/WorkbenchBoardsDock.test.tsx`
- Modify: `src/components/layout/WorkbenchBoardsDock.tsx`

**Step 1: Write failing component tests**

Add tests proving:

- board rows render dimensions, frame rate, updated date, and scene count
- boards are rendered by `modified` timestamp descending without mutating store order

Use controlled project records through `useAppStore.setState` so the timestamps are deterministic.

**Step 2: Run the component test and verify failure**

```powershell
npx vitest run src/components/layout/WorkbenchBoardsDock.test.tsx --project component
```

Expected: FAIL because the dock does not yet render board metadata beyond scene count and does not sort by recent activity.

**Step 3: Implement minimal metadata and ordering**

In `WorkbenchBoardsDock.tsx`:

- derive `orderedProjects` with `projects.slice().sort(...)`
- compare `modified`, then `created`, newest first
- render dimensions as `WIDTH x HEIGHT`
- render frame rate as `FPS fps`
- render modified date with `Intl.DateTimeFormat`
- keep existing action behavior

**Step 4: Run the component test and verify pass**

```powershell
npx vitest run src/components/layout/WorkbenchBoardsDock.test.tsx --project component
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add src/components/layout/WorkbenchBoardsDock.tsx src/components/layout/WorkbenchBoardsDock.test.tsx
git commit -m "feat(workbench): show board context metadata"
```

### Task 2: Active Board Scene Grouping

**Files:**
- Modify: `src/components/layout/WorkbenchBoardsDock.test.tsx`
- Modify: `src/components/layout/WorkbenchBoardsDock.tsx`

**Step 1: Write failing component tests**

Add tests proving:

- active-board scenes are grouped under Draft, In Progress, Complete, and Needs Attention headings when matching statuses exist
- scenes within each group render by `orderIndex`
- selecting a grouped scene still updates `activeSceneId`

**Step 2: Run the component test and verify failure**

```powershell
npx vitest run src/components/layout/WorkbenchBoardsDock.test.tsx --project component
```

Expected: FAIL because active-board scenes currently render as one flat list.

**Step 3: Implement minimal grouping**

In `WorkbenchBoardsDock.tsx`:

- add a local scene-group definition
- map `queued` and `generating` into `In Progress`
- render only non-empty groups
- sort each group by `orderIndex`
- keep existing thumbnail and active scene styling

**Step 4: Run the component test and verify pass**

```powershell
npx vitest run src/components/layout/WorkbenchBoardsDock.test.tsx --project component
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add src/components/layout/WorkbenchBoardsDock.tsx src/components/layout/WorkbenchBoardsDock.test.tsx
git commit -m "feat(workbench): group board scenes by status"
```

### Task 3: Focused Verification

**Files:** no planned source changes.

**Step 1: Run focused component checks**

```powershell
npx vitest run src/components/layout/WorkbenchBoardsDock.test.tsx src/components/layout/WorkbenchChromeCarbon.test.tsx --project component
```

Expected: PASS.

**Step 2: Run glyph policy**

```powershell
npx vitest run src/styles/ui-glyphs.test.ts --project unit
```

Expected: PASS.

**Step 3: Run typecheck**

```powershell
npm run typecheck
```

Expected: PASS.

**Step 4: Run diff check**

```powershell
git diff --check
```

Expected: PASS.

**Step 5: Final commit if previous commits were skipped**

```powershell
git add docs/plans/2026-04-17-boards-dock-context-design.md docs/plans/2026-04-17-boards-dock-context.md src/components/layout/WorkbenchBoardsDock.tsx src/components/layout/WorkbenchBoardsDock.test.tsx
git commit -m "feat(workbench): improve boards dock context"
```
