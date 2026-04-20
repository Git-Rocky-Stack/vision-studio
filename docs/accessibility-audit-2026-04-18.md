# WCAG 2.1 AA Accessibility Audit

**Application:** Vision Studio (Electron + React desktop app)
**Date:** 2026-04-18
**Auditor:** Claude (Automated + Manual Code Review)
**Scope:** `src/components/**/*.tsx`, `src/pages/**/*.tsx`, `src/index.css`, `index.html`
**Standard:** WCAG 2.1 Level AA

---

## Executive Summary

**Total Findings:** 31
**P0 (Critical):** 4 | **P1 (High):** 9 | **P2 (Medium):** 11 | **P3 (Low):** 5 | **P4 (Advisory):** 2

The application demonstrates strong accessibility foundations in many areas -- NavBar, ConfirmDialog, Slider, Switch, Tooltip, ModelSelector, and ProjectDropdown all implement proper ARIA patterns. However, several systemic issues require attention: missing skip links, no reduced-motion support, form label associations, incomplete tab panel semantics, small touch targets, and absent heading hierarchy on most pages.

### Remediation Update - 2026-04-19

The requested P2 accessibility remediation pass is complete.

Resolved P2 items:

| ID | Status | Notes |
|----|--------|-------|
| A-014 | Fixed | `type-micro` now uses a 12px token. |
| A-015 | Fixed | Muted text tokens were raised for dark and light themes. |
| A-016 | Fixed | NavBar now uses tablist/tab semantics with `aria-selected` and roving focus. |
| A-017 | Fixed | TemplateCreator now has modal dialog semantics, Escape close, focus containment, and focus restoration. |
| A-018 | Fixed | EditCanvas exposes an accessible application region and live canvas summary. |
| A-019 | Fixed | WorkflowGraphEditor SVG includes accessible title/description, and nodes support keyboard movement. |
| A-020 | Fixed | Timeline action buttons have expanded targets and keyboard-visible focus states. |
| A-021 | Fixed | RegionLockOverlay dynamic labels are announced through polite status regions. |
| A-022 | Fixed | Workflow nodes support keyboard movement; scenes expose Move up/down controls; layer reorder handles support Arrow Up/Down. |
| A-023 | Fixed | Canvas context menu opens by keyboard using Shift+F10 or the Context Menu key. |
| A-024 | Fixed | Button loading spinner is hidden from assistive technology while text communicates loading state. |

Regression coverage added or updated for NavBar, Canvas, EditCanvas, WorkflowGraphEditor, RegionLockOverlay, TemplateCreator, and SceneCard keyboard reordering. Full verification passed with `npm test` reporting 68 files and 645 tests.

---

## P0 Findings (Critical -- Blocks users)

### A-001: No Skip-to-Content Link
- **WCAG:** 2.4.1 Bypass Blocks (Level A)
- **File:** `src/App.tsx` (root layout)
- **Issue:** No skip-navigation link exists. Keyboard users must tab through the entire NavBar before reaching main content.
- **Fix:** Add a visually-hidden skip link as the first focusable element that jumps to `<main>`:

```tsx
<a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-surface focus:text-text-primary">
  Skip to main content
</a>
```

Add `id="main-content"` to the `<main>` element in `DockviewLayout.tsx`.

---

### A-002: Form Labels Not Associated with Inputs
- **WCAG:** 1.3.1 Info and Relationships (Level A), 3.3.2 Labels or Instructions (Level A)
- **Files:**
  - `src/components/ui/Input.tsx` (lines 18-21)
  - `src/components/ui/Textarea.tsx` (lines 15-18)
  - `src/components/edit/CropControls.tsx` (custom width/height inputs)
  - `src/components/templates/TemplateCreator.tsx` (multiple inputs)
  - `src/pages/SettingsPanel.tsx` (multiple inputs)
- **Issue:** Labels render as `<label>` elements but lack `htmlFor` attributes, and inputs lack matching `id` attributes. Screen readers cannot determine which label belongs to which input.
- **Fix:** Generate unique IDs and associate labels:

```tsx
// Input.tsx
const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, icon: Icon, helper, type, ...props }, ref) => {
    const inputId = useId();
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="text-label text-text-body">
            {label}
          </label>
        )}
        <input
          id={inputId}
          ref={ref}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${inputId}-error` : helper ? `${inputId}-helper` : undefined}
          ...
        />
        {helper && !error && (
          <p id={`${inputId}-helper`} className="text-xs text-text-muted">{helper}</p>
        )}
        {error && (
          <p id={`${inputId}-error`} className="text-xs text-red-primary" role="alert">{error}</p>
        )}
      </div>
    );
  }
);
```

Apply the same pattern to Textarea.tsx.

---

### A-003: No Reduced-Motion Support
- **WCAG:** 2.3.3 Animation from Interactions (Level AAA, recommended for Level AA under 2.3.1)
- **Files:** `src/index.css` (global), all components using Framer Motion
- **Issue:** Zero `prefers-reduced-motion` media queries exist in the entire codebase. Framer Motion `AnimatePresence` and `motion` elements animate regardless of user preference. Tailwind's `animate-spin` and `animate-pulse` also lack reduced-motion fallbacks.
- **Fix:** Add global CSS:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

For Framer Motion, wrap animations with a `useReducedMotion()` hook:

```tsx
const prefersReducedMotion = useReducedMotion();
<motion.div
  initial={prefersReducedMotion ? false : { opacity: 0 }}
  animate={prefersReducedMotion ? {} : { opacity: 1 }}
/>
```

---

### A-004: Missing Page-Level Headings (h1)
- **WCAG:** 1.3.1 Info and Relationships (Level A), 2.4.2 Page Titled (Level A)
- **Files:**
  - `src/pages/GeneratePanel.tsx` -- no `<h1>`
  - `src/pages/BatchPanel.tsx` -- no `<h1>`
  - `src/pages/AssetsPanel.tsx` -- no `<h1>`
  - `src/pages/SettingsPanel.tsx` -- starts at `<h2>` with no `<h1>`
  - `src/pages/EditPanel.tsx` -- no `<h1>`
  - `src/pages/StoryboardPanel.tsx` -- no `<h1>`
  - `src/pages/QuickGeneratePanel.tsx` -- no `<h1>`
  - `src/pages/CollectionsPage.tsx` -- has `<h1>` (only page that does)
- **Issue:** Most pages lack a top-level heading. Screen reader users navigate by headings; without an h1, they cannot quickly understand page context or orient themselves.
- **Fix:** Add a visually-hidden or visible `<h1>` to each page that identifies the current view.

---

## P1 Findings (High -- Significant barrier)

### A-005: Tab Panels Missing ARIA Linkage
- **WCAG:** 1.3.1 Info and Relationships (Level A), 4.1.2 Name, Role, Value (Level A)
- **File:** `src/components/layout/DockviewLayout.tsx` (lines 140-172)
- **Issue:** The center tab bar has `role="tablist"` and buttons with `role="tab"` and `aria-selected`, but:
  1. Tabs lack `id` and `aria-controls` attributes linking them to their tab panels.
  2. The content `<section>` does not have `role="tabpanel"`, `aria-labelledby`, or `id`.
  3. Arrow key navigation between tabs is missing (WCAG tablist pattern requires Left/Right arrow keys).
- **Fix:**

```tsx
{centerTabs.map((tab) => (
  <button
    key={tab.id}
    id={`tab-${tab.id}`}
    role="tab"
    aria-selected={centerView === tab.id}
    aria-controls={`panel-${tab.id}`}
    tabIndex={centerView === tab.id ? 0 : -1}
    onClick={() => handleCenterTabClick(tab.id)}
    onKeyDown={handleTabKeyDown}  // Arrow key navigation
    ...
  >
    {tab.label}
  </button>
))}

<section
  id={`panel-${centerView}`}
  role="tabpanel"
  aria-labelledby={`tab-${centerView}`}
  ...
>
```

---

### A-006: Modal Dialogs Missing Focus Traps
- **WCAG:** 2.4.3 Focus Order (Level A), 4.1.2 Name, Role, Value (Level A)
- **Files:**
  - `src/components/shared/ImagePreviewModal.tsx` -- Has Escape handler but no focus trap
  - `src/components/templates/TemplatePreviewModal.tsx` -- Has Escape handler but no focus trap
- **Issue:** These modals have `role="dialog"` and `aria-modal="true"` but allow Tab to escape the dialog, which traps keyboard users in the page behind the modal overlay.
- **Fix:** Implement focus trapping similar to `ConfirmDialog.tsx` and `KeyboardShortcuts.tsx`, which already have correct focus traps. Extract a reusable `useFocusTrap` hook.

---

### A-007: Error Messages Not Linked to Form Fields
- **WCAG:** 3.3.1 Error Identification (Level A), 3.3.3 Error Suggestion (Level AA)
- **Files:**
  - `src/components/ui/Input.tsx` (lines 46-48)
  - `src/components/ui/Textarea.tsx` (lines 31-34)
- **Issue:** Error messages render as `<p>` elements but are not associated with the input via `aria-describedby` or `aria-errormessage`. Inputs also lack `aria-invalid` when errors exist.
- **Fix:** See A-002 fix pattern above for complete `id`/`htmlFor`/`aria-describedby`/`aria-invalid` associations.

---

### A-008: Small Touch Targets on Icon Buttons
- **WCAG:** 2.5.5 Target Size (Level AAA, strongly recommended for AA)
- **Files:**
  - `src/components/storyboard/SceneCard.tsx` -- Duplicate/delete buttons (p-1.5 = ~20px)
  - `src/components/layout/Timeline.tsx` -- Mute/visibility/lock toggle buttons (p-0.5 = ~16px)
  - `src/components/generate/PromptToolbar.tsx` -- Toolbar buttons (w-7 h-7 = 28px)
  - `src/components/edit/ToolStrip.tsx` -- Tool buttons (w-7 h-7 = 28px)
  - Various p-1 buttons throughout (~24px)
- **Issue:** Multiple interactive elements fall below the 44px minimum touch target size.
- **Fix:** Add `min-w-[44px] min-h-[44px]` or increase padding to meet the 44px minimum. Use a visually-hidden approach if visual size must stay small:

```tsx
<button
  className="relative p-1.5 ..."  // Keep visual padding
  style={{ minWidth: 44, minHeight: 44 }}  // Expand touch target
>
```

Or use a transparent hit area:

```tsx
<button className="group ...">
  <span className="absolute inset-0" /> {/* Expands hit area */}
  <Icon className="w-3.5 h-3.5" />
</button>
```

---

### A-009: Dropdown Menus Missing aria-expanded
- **WCAG:** 4.1.2 Name, Role, Value (Level A)
- **Files:**
  - `src/components/generate/ModelSelector.tsx` -- Has `aria-haspopup="listbox"` but no `aria-expanded`
  - `src/components/layout/ProjectDropdown.tsx` -- Has `aria-haspopup="listbox"` but no `aria-expanded`
- **Issue:** Dropdown trigger buttons lack `aria-expanded` to communicate open/closed state to screen readers.
- **Fix:** Add `aria-expanded={isOpen}` to both trigger buttons.

---

### A-010: Skeleton Components Not Announced to Screen Readers
- **WCAG:** 1.3.1 Info and Relationships (Level A), 4.1.2 Name, Role, Value (Level A)
- **File:** `src/components/ui/Skeleton.tsx`
- **Issue:** Skeleton components render as bare `<div>` elements with no ARIA role or label. Screen readers announce nothing, leaving users uncertain whether content is loading or absent.
- **Fix:** Add `role="status"` and `aria-label` to skeleton containers:

```tsx
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      role="status"
      aria-label="Loading content"
      className={cn('animate-pulse rounded-lg bg-elevated', className)}
    />
  );
}
```

---

### A-011: ErrorBoundary Fallback Not Announced
- **WCAG:** 4.1.3 Status Messages (Level AA)
- **File:** `src/components/ui/ErrorBoundary.tsx` (lines 30-54)
- **Issue:** The error boundary fallback UI has no `role="alert"` or `aria-live` region. Screen readers won't announce the error.
- **Fix:** Add `role="alert"` to the error container:

```tsx
<div role="alert" className="flex-1 flex flex-col items-center justify-center p-8 bg-surface">
```

---

### A-012: NavBar Tab Navigation Lacks Arrow Key Support
- **WCAG:** 2.1.1 Keyboard (Level A)
- **File:** `src/components/layout/NavBar.tsx`
- **Issue:** NavBar buttons use native `<button>` elements (keyboard accessible via Tab), but they function as a tab list. WCAG tablist pattern recommends arrow key navigation between tabs with roving tabindex.
- **Fix:** Add `role="tablist"` to the `<nav>`, `role="tab"` to each button, `aria-selected`, and implement arrow key navigation with roving `tabIndex`.

---

### A-013: ImagePreviewModal Missing Focus Return
- **WCAG:** 2.4.3 Focus Order (Level A)
- **File:** `src/components/shared/ImagePreviewModal.tsx`
- **Issue:** While the modal has Escape key support, it does not restore focus to the triggering element when closed. ConfirmDialog correctly implements this pattern.
- **Fix:** Store `document.activeElement` on open and restore focus on close, similar to ConfirmDialog's `previousFocusRef` pattern.

---

## P2 Findings (Medium)

### A-014: type-micro Font Size Below 12px Minimum
- **WCAG:** 1.4.4 Resize Text (Level AA)
- **File:** `src/index.css` (line 79)
- **Issue:** `--font-size-micro: 0.625rem` (10px) is below the minimum readable size. WCAG requires text to be resizable to 200%, making 10px text become 20px -- barely readable. The `type-micro` class is used throughout for timestamps, metadata, and labels.
- **Fix:** Increase `--font-size-micro` to at least `0.6875rem` (11px) or preferably `0.75rem` (12px). Audit all `type-micro` usages and consider if they can use `type-caption` (12px) instead.

---

### A-015: Text-Text-Muted Contrast on Dark Surfaces (Borderline)
- **WCAG:** 1.4.3 Contrast (Minimum) (Level AA)
- **Files:** Throughout the codebase
- **Issue:** `text-text-muted` (#7a7a7a) on `bg-surface` (#0d0d0d) yields approximately 4.5:1 contrast -- barely meeting AA for normal text. On `bg-elevated` (#141414) it yields ~4.8:1. However, when paired with `type-micro` (10px) or `type-caption` (12px), the effective contrast may feel insufficient for users with low vision. The light theme uses `text-muted: #707070` on white backgrounds (~4.6:1) which is also borderline.
- **Fix:** Consider increasing `text-muted` to `#888888` in dark theme (5.4:1 on #0d0d0d) and `#616161` in light theme (4.6:1 on #ffffff minimum, better for small text).

---

### A-016: NavBar Uses aria-current="page" Instead of aria-selected
- **WCAG:** 1.3.1 Info and Relationships (Level A)
- **File:** `src/components/layout/NavBar.tsx` (line 63)
- **Issue:** NavBar buttons use `aria-current="page"` which is correct for navigation links but not for a tab interface that controls main content visibility. Since these tabs swap visible panels, `role="tab"` with `aria-selected` is more semantically accurate.
- **Fix:** See A-012 fix -- convert NavBar to proper tablist pattern.

---

### A-017: TemplateCreator Modal Lacks Focus Trap
- **WCAG:** 2.4.3 Focus Order (Level A)
- **File:** `src/components/templates/TemplateCreator.tsx`
- **Issue:** This is a full-screen modal/overlay wizard but has no focus trap implementation. Focus can leave the modal.
- **Fix:** Implement focus trap using the same pattern as ConfirmDialog.

---

### A-018: Canvas/Editor Lacks Accessible Alternative
- **WCAG:** 1.1.1 Non-Text Content (Level A), 4.1.2 Name, Role, Value (Level A)
- **File:** `src/components/edit/EditCanvas.tsx`
- **Issue:** The Konva canvas renders as a `<canvas>` element with no accessible alternative. Users who cannot see or interact with the canvas have no way to understand or manipulate the content.
- **Fix:** Add `role="application"` and `aria-label` to the canvas container, and provide a text description of the current canvas state for screen readers:

```tsx
<div role="application" aria-label="Image editor canvas" aria-roledescription="canvas editor">
  {/* Canvas content */}
  <div className="sr-only" aria-live="polite">
    {`Editing ${imageName || 'image'}. ${layers.length} layers. Active tool: ${activeTool}.`}
  </div>
</div>
```

---

### A-019: WorkflowGraphEditor Canvas Has No Screen Reader Alternative
- **WCAG:** 1.1.1 Non-Text Content (Level A)
- **File:** `src/components/workflow/WorkflowGraphEditor.tsx`
- **Issue:** The SVG-based graph editor has nodes as `<button>` elements (accessible) but the edge connections are pure SVG `<path>` elements with no accessible labels. The spatial layout cannot be perceived by screen reader users.
- **Fix:** Add `aria-label` to the SVG element describing the graph, and add visually-hidden text describing connections:

```tsx
<svg aria-label={`Workflow graph with ${nodes.length} nodes and ${edges.length} connections`}>
  ...
  <title>Workflow graph editor</title>
  <desc>{`${nodes.length} nodes, ${edges.length} connections`}</desc>
  ...
</svg>
```

---

### A-020: Timeline Small Action Buttons (Mute/Visibility/Lock)
- **WCAG:** 2.5.5 Target Size (Level AAA), 2.1.1 Keyboard (Level A)
- **File:** `src/components/layout/Timeline.tsx`
- **Issue:** Track action buttons (mute, visibility, lock) use `p-0.5` padding with `w-3 h-3` icons, creating approximately 16px touch targets. They are also opacity-hidden until hover, making them invisible to keyboard-only users until focus reveals them.
- **Fix:** Increase minimum size to 44px (use transparent padding or min-w/min-h). Ensure focus-visible styling makes them discoverable.

---

### A-021: RegionLockOverlay Labels Not Announced on Change
- **WCAG:** 4.1.3 Status Messages (Level AA)
- **File:** `src/components/edit/RegionLockOverlay.tsx`
- **Issue:** Region mask labels (tool name, strength percentage) update dynamically but are not announced to screen readers. The label divs use `pointer-events-none` and have no ARIA role.
- **Fix:** Add `role="status"` with `aria-live="polite"` to the region label container, or ensure the parent `role="button"` div's `aria-label` updates when properties change.

---

### A-022: Draggable Elements Lack Drag Accessibility
- **WCAG:** 1.3.1 Info and Relationships (Level A), 2.1.1 Keyboard (Level A)
- **Files:**
  - `src/components/storyboard/SceneCard.tsx` (uses @dnd-kit sortable)
  - `src/components/edit/LayerPanel.tsx` (drag reordering)
  - `src/components/workflow/WorkflowGraphEditor.tsx` (node drag)
- **Issue:** Drag-and-drop interactions use pointer events. SceneCard has a drag handle button (`aria-label="Drag to reorder scene"`) which is good, but there are no keyboard-based reordering controls (e.g., "Move up" / "Move down" buttons).
- **Fix:** Add keyboard-accessible reorder controls or implement the WAI-ARIA drag-and-drop pattern with arrow key support for moving items.

---

### A-023: Canvas Context Menu Missing Keyboard Activation
- **WCAG:** 2.1.1 Keyboard (Level A)
- **File:** `src/components/canvas/CanvasContextMenu.tsx`
- **Issue:** Context menu likely only activates on right-click (pointer event). There is no keyboard equivalent (e.g., Shift+F10 or dedicated context menu key handler).
- **Fix:** Add `onKeyDown` handler on the canvas to open the context menu when Shift+F10 or the Context Menu key is pressed.

---

### A-024: Loading Spinner in Button Lacks Accessible Name
- **WCAG:** 1.1.1 Non-Text Content (Level A), 4.1.2 Name, Role, Value (Level A)
- **File:** `src/components/ui/Button.tsx` (lines 57-62)
- **Issue:** When `isLoading` is true, the spinner SVG has no `aria-label`. The button text changes to "Loading..." which is good, but the SVG should be hidden from screen readers.
- **Fix:** Add `aria-hidden="true"` to the spinner SVG:

```tsx
<svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
```

---

## P3 Findings (Low)

### A-025: CollectionsPage Only Page with h1
- **WCAG:** 1.3.1 Info and Relationships (Level A), 2.4.6 Headings and Labels (Level AA)
- **Files:** All page components except `CollectionsPage.tsx`
- **Issue:** `CollectionsPage.tsx` has `<h1 className="type-heading-3 ...">Collections</h1>` but other pages use `<div>` or `<h2>`/`<h3>` without a parent `<h1>`. The `type-heading-3` class suggests a custom heading level rather than a proper `<h1>`.
- **Fix:** Each page should have exactly one `<h1>` as the page title. Use visually hidden `<h1>` if the visual design doesn't call for a prominent heading.

---

### A-026: Dock Panel Sections Lack Landmark Roles
- **WCAG:** 1.3.1 Info and Relationships (Level A)
- **Files:**
  - `src/components/layout/DockviewGalleryPanel.tsx`
  - `src/components/layout/DockviewLayersPanel.tsx`
  - `src/components/layout/DockviewBoardsPanel.tsx`
  - `src/components/layout/DockviewSettingsPanel.tsx`
- **Issue:** These panels are visually distinct sections but lack `role="region"` or `aria-label` to identify them as landmarks.
- **Fix:** Add `role="region"` and `aria-label` to each panel's root element.

---

### A-027: ComparisonView Toolbar Missing Accessible Label
- **WCAG:** 4.1.2 Name, Role, Value (Level A)
- **File:** `src/components/canvas/ComparisonToolbar.tsx`
- **Issue:** The toolbar is a group of radio-like buttons for comparison modes but lacks `role="toolbar"` or `role="radiogroup"` with `aria-label`.
- **Fix:** Wrap the mode buttons in `<div role="radiogroup" aria-label="Comparison mode">`.

---

### A-028: ResultCard Hover-Only Actions
- **WCAG:** 1.4.13 Content on Hover or Focus (Level AA), 2.1.1 Keyboard (Level A)
- **File:** `src/components/batch/ResultCard.tsx`
- **Issue:** Action buttons (favorite, download, send to edit) appear only on hover (`opacity-0 group-hover:opacity-100`). They need focus-visible equivalents.
- **Fix:** Add `focus-visible:opacity-100` or `focus-within:opacity-100` alongside hover states, and ensure they are keyboard focusable.

---

### A-029: SettingsPanel Theme Selector Missing Radio Group Semantics
- **WCAG:** 1.3.1 Info and Relationships (Level A)
- **File:** `src/pages/SettingsPanel.tsx`
- **Issue:** Theme options are rendered as clickable `<label>` elements with hidden radio inputs, which is accessible. However, they lack `role="radiogroup"` and `aria-label` on the container to communicate the group relationship.
- **Fix:** Add `role="radiogroup"` and `aria-label="Theme"` to the theme options container.

---

### A-030: GenerationProgress Lacks role="progressbar"
- **WCAG:** 4.1.2 Name, Role, Value (Level A)
- **File:** `src/components/canvas/GenerationProgress.tsx`
- **Issue:** The progress indicator likely uses a visual bar without proper `role="progressbar"` attributes.
- **Fix:** Ensure the progress bar has `role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, and `aria-label`.

---

## P4 Findings (Advisory)

### A-031: Global Focus Visible Styles Not Defined in CSS
- **WCAG:** 2.4.7 Focus Visible (Level AA)
- **File:** `src/index.css`
- **Issue:** No global `:focus-visible` outline style is defined. Individual components define their own `focus-visible:ring-2 focus-visible:ring-accent-primary` classes, which is good. However, there is no fallback for elements that might miss component-level focus styles. Adding a global focus-visible style would be a safety net.
- **Fix:** Add to `src/index.css`:

```css
:focus-visible {
  outline: 2px solid var(--color-accent-primary);
  outline-offset: 2px;
}
```

---

### A-032: Light Theme Contrast Audit Recommended
- **WCAG:** 1.4.3 Contrast (Minimum) (Level AA)
- **Files:** `src/index.css` (lines 267-300)
- **Issue:** The light theme defines `--color-text-muted: #707070` which on white backgrounds (#ffffff) yields approximately 4.6:1 -- barely passing AA. A full manual visual audit of the light theme is recommended, as automated code review cannot fully validate rendered contrast.
- **Fix:** Consider increasing `--color-text-muted` in the light theme to `#616161` (5.3:1 on white) for better readability of secondary text.

---

## Summary of Strengths

The following patterns are well-implemented and should be maintained:

1. **NavBar** -- Proper `aria-label`, `aria-current`, `aria-hidden` on decorative icons, separator with `role="separator"` and `aria-orientation`, GPU status icons with `aria-label`.

2. **ConfirmDialog** -- Complete focus trap implementation with Escape key, focus restoration, `role="dialog"`, `aria-modal`, and `aria-label`.

3. **KeyboardShortcuts** -- Complete focus trap, Escape key, focus restoration, `role="dialog"`, `aria-modal`.

4. **Slider** -- Full ARIA slider pattern with `role="slider"`, `aria-label`, `aria-valuemin/max/now/valuetext`, keyboard support for Arrow, Page Up/Down, Home/End.

5. **Switch** -- Proper `role="switch"`, `aria-checked`, `aria-label`, keyboard accessible as `<button>`.

6. **Tooltip** -- Uses @floating-ui/react with proper `role="tooltip"`, keyboard support, hover, and focus triggers.

7. **ModelSelector** -- Implements `aria-haspopup="listbox"`, `role="listbox"`, `role="option"`, `aria-selected`.

8. **ProjectDropdown** -- Implements `aria-haspopup="listbox"`, `role="listbox"`, `role="option"`, `aria-selected`.

9. **SceneCard** -- `role="button"`, `tabIndex={0}`, `onKeyDown` for Enter/Space, `aria-label` with descriptive text, `aria-selected`.

10. **CollectionCard** -- `role="button"`, `tabIndex={0}`, `onKeyDown` for Enter, `aria-label`.

11. **ResultCard** -- `role="button"`, `tabIndex={0}`, `onKeyDown` for Enter/Space.

12. **Various aria-live regions** -- GenerationProgress, PromptArea character count, AssetsPanel item counts, BatchPanel status, Timeline all use `aria-live="polite"` appropriately.

13. **ImageWithFallback** -- Properly handles loading/error states with `alt` attribute passthrough.

14. **html lang** -- `index.html` correctly sets `<html lang="en">`.

---

## Recommended Priority Order

1. **A-001** (skip link) + **A-004** (h1 headings) -- Single-day fix, huge impact
2. **A-002** + **A-007** (form labels + error associations) -- Affects all forms, reusable Input/Textarea fix
3. **A-003** (reduced motion) -- Global CSS fix + Framer Motion hook
4. **A-005** (tab panel ARIA) -- DockviewLayout center tabs
5. **A-006** + **A-013** (modal focus traps) -- Reusable hook extraction
6. **A-008** (touch targets) -- Incremental, per-component
7. **A-009** (aria-expanded) -- Quick fix
8. **A-010** + **A-011** (skeleton + error announcements) -- Quick fix
9. Remaining P2-P4 items -- Ongoing improvement
