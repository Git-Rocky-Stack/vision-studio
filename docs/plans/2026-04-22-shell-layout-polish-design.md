# Shell Layout And Chrome Polish Design

## Goal

Repair the broken shell-height chain on the main workspace, restore draggable custom window chrome for the Electron build, and use the same pass to clean up the most obvious shell-level styling issues on the primary panes.

## Confirmed Problems

- `#main-content` is not part of a real full-height flex chain, so the workbench grows taller than the viewport instead of turning inner panels into scrollers.
- The Electron window uses a hidden title bar, but the mounted app shell does not expose a real draggable header region.
- The accepted toolbar language from the earlier header pass was lost: no mounted top toolbar, no right-justified `s2.png` brand mark, and no protected right-side reserve for native window controls.
- Primary workbench panes still hide scrollbars or duplicate panel headers, which makes the interface feel less finished and less navigable than it should.

## Design

### 1. App shell

- Mount `Header` at the app level above the workspace body.
- Convert the root shell into a `flex h-full min-h-0 flex-col` stack.
- Give `#main-content` a real `min-h-0 flex-1` body so `DockviewLayout` can occupy the remaining viewport height.

### 2. Window chrome

- Treat `Header` as the custom titlebar surface.
- Add explicit drag and no-drag utility classes in global CSS.
- Keep the backend readiness pill in the header.
- Restore the `public/s2.png` logo to the right action cluster.
- Reserve extra right padding in the header so Windows native controls do not overlap the toolbar content.

### 3. Shell polish

- Upgrade the header styling so it reads like deliberate app chrome rather than a plain divider.
- Remove duplicate title treatment inside the gallery and boards docks where the panel wrapper already provides the title bar.
- Stop hiding scrollbars on the primary gallery and timeline panes.
- Tighten the main empty-state presentation so the canvas and gallery look intentional when the workspace is empty.

### 4. Regression coverage

- Update app-shell tests so they assert that the mounted app includes the header and a full-height `#main-content`.
- Update header tests to cover the mounted logo and drag-region classes.
- Update main-window tests to reflect the custom chrome configuration that supports the draggable header path.

## Out Of Scope

- No major navigation redesign.
- No state-model changes.
- No backend generation changes.
- No broad restyling of every secondary modal or utility panel.
