# Keyboard Shortcuts

Every keyboard shortcut Vision Studio binds, taken from the key handlers in the
source as it stands now. Where the in-app overlay (press **?**) and this page
differ, this page follows the code. For the rest of the app, see
[`USER_GUIDE.md`](./USER_GUIDE.md).

On macOS, read **Ctrl** as **Cmd** wherever a row says Ctrl/Cmd: the handlers
accept either modifier.

## How the keys are scoped

- **Typing is safe.** Single-letter shortcuts and the global undo, redo and `?`
  keys are ignored while focus is in a text field, text area, select, or
  editable text. (The Timeline and Generate-canvas handlers skip text fields
  and text areas; the Generate-canvas zoom keys do not skip selects.)
- **Panel shortcuts are live only while that panel is on screen.** The Canvas
  tab tools exist only on the Canvas tab; the Timeline keys exist only while the
  Timeline is shown under the canvas on the Generate tab.
- **Packaged builds lock down reload and DevTools.** See
  [Window and menu keys](#window-and-menu-keys).

## Global

| Keys | Action | Where it is active | Source file |
|------|--------|--------------------|-------------|
| `?` | Show or hide the keyboard shortcuts overlay | Anywhere, outside text fields | `src/App.tsx` |
| Ctrl/Cmd+Z | Undo the last Canvas edit (layers, strokes, adjustments, filters) | Anywhere, outside text fields. It only undoes Canvas tab edits | `src/App.tsx`, `src/store/slices/editSlice.ts` |
| Ctrl/Cmd+Y | Redo the last undone Canvas edit | Anywhere, outside text fields | `src/App.tsx` |
| Ctrl/Cmd+Shift+Z | Redo the last undone Canvas edit | Anywhere, outside text fields | `src/App.tsx` |
| Esc | Close the keyboard shortcuts overlay | While the overlay is open | `src/components/ui/KeyboardShortcuts.tsx` |

The Canvas edit history holds up to 100 steps; quick repeats of the same edit
(one slider drag) merge into a single step.

## Navigation bar

| Keys | Action | Where it is active | Source file |
|------|--------|--------------------|-------------|
| Arrow Down / Arrow Right | Open the next workspace tab (wraps to the first) | Focus on a navigation bar tab | `src/components/layout/NavBar.tsx` |
| Arrow Up / Arrow Left | Open the previous workspace tab (wraps to the last) | Focus on a navigation bar tab | `src/components/layout/NavBar.tsx` |
| Home | Open the first workspace tab | Focus on a navigation bar tab | `src/components/layout/NavBar.tsx` |
| End | Open the last workspace tab | Focus on a navigation bar tab | `src/components/layout/NavBar.tsx` |

## Dock layout

| Keys | Action | Where it is active | Source file |
|------|--------|--------------------|-------------|
| Arrow Left / Arrow Right | Resize the left or right dock by 16 px | Focus on a vertical dock resize handle | `src/components/layout/DockviewLayout.tsx` |
| Shift+Arrow Left / Shift+Arrow Right | Resize the dock by 48 px | Focus on a vertical dock resize handle | `src/components/layout/DockviewLayout.tsx` |
| Arrow Up / Arrow Down | Move the split between stacked right-dock panels by 4 percent | Focus on a horizontal panel resize handle | `src/components/layout/DockviewLayout.tsx` |
| Shift+Arrow Up / Shift+Arrow Down | Move the split by 8 percent | Focus on a horizontal panel resize handle | `src/components/layout/DockviewLayout.tsx` |
| Double-click | Reset the handle to its default size | A dock or panel resize handle (mouse) | `src/components/layout/DockviewLayout.tsx` |
| Esc | Close the review dock drawer | While the review dock is open as a drawer (narrow windows) | `src/components/layout/DockviewLayout.tsx` |

## Canvas tab (layer editor)

| Keys | Action | Where it is active | Source file |
|------|--------|--------------------|-------------|
| V | Move tool | Canvas tab, outside text fields, region mode off | `src/features/edit/useEditToolShortcuts.ts` |
| T | Scale tool | Canvas tab, region mode off | `src/features/edit/useEditToolShortcuts.ts` |
| C | Crop tool (also opens the Crop tab) | Canvas tab, region mode off | `src/features/edit/useEditToolShortcuts.ts`, `src/components/edit/EditPropertiesPanel.tsx` |
| R | Rotate tool | Canvas tab, region mode off | `src/features/edit/useEditToolShortcuts.ts` |
| B | Brush tool | Canvas tab, region mode off | `src/features/edit/useEditToolShortcuts.ts` |
| E | Eraser tool | Canvas tab, region mode off | `src/features/edit/useEditToolShortcuts.ts` |
| X | Text tool | Canvas tab, region mode off | `src/features/edit/useEditToolShortcuts.ts` |
| H | Hand tool (drag to pan) | Canvas tab, region mode off | `src/features/edit/useEditToolShortcuts.ts` |
| Z | Zoom tool (click to zoom in, Shift+click to zoom out) | Canvas tab, region mode off | `src/features/edit/useEditToolShortcuts.ts`, `src/components/edit/EditCanvas.tsx` |
| I | Eyedropper tool | Canvas tab, region mode off | `src/features/edit/useEditToolShortcuts.ts` |
| Mouse wheel | Zoom the editor view | Over the Canvas tab editor, any tool | `src/components/edit/EditCanvas.tsx` |

The letter keys do nothing with Ctrl, Cmd or Alt held. Clone Stamp, Heal, Shape
and Pen are shown in the tool strip but are not available yet, and have no key.

### Region mask tools (Canvas tab, Control or Region tab open)

Opening the Control or Region tab in the Properties panel turns region mode on,
and the same letters then drive the mask tools instead.

| Keys | Action | Where it is active | Source file |
|------|--------|--------------------|-------------|
| V | Select mask tool | Region mode on | `src/features/edit/useEditToolShortcuts.ts` |
| R | Rectangle mask tool | Region mode on | `src/features/edit/useEditToolShortcuts.ts` |
| L | Lasso (polygon) mask tool | Region mode on | `src/features/edit/useEditToolShortcuts.ts` |
| B | Mask brush | Region mode on | `src/features/edit/useEditToolShortcuts.ts` |
| E | Mask eraser | Region mode on | `src/features/edit/useEditToolShortcuts.ts` |
| I | Invert the mask | Region mode on | `src/features/edit/useEditToolShortcuts.ts` |

### Layers panel

| Keys | Action | Where it is active | Source file |
|------|--------|--------------------|-------------|
| Arrow Up / Arrow Down | Move the layer up or down the stack | Focus on a layer's drag handle | `src/components/edit/LayerPanel.tsx` |
| Enter | Save the new layer name | Layer rename field (double-click a name to rename) | `src/components/edit/LayerPanel.tsx` |

### Properties panel

| Keys | Action | Where it is active | Source file |
|------|--------|--------------------|-------------|
| Esc | Close the edit history popover | While the history popover is open | `src/components/edit/EditPropertiesPanel.tsx` |

## Generate tab canvas

The centre canvas on the Generate tab (and other tabs that show the generation
canvas) is a different surface from the Canvas tab editor.

| Keys | Action | Where it is active | Source file |
|------|--------|--------------------|-------------|
| `+` or `=` | Zoom in 10 percent (up to 200) | While the generation canvas is shown, outside text fields | `src/components/layout/Canvas.tsx` |
| `-` | Zoom out 10 percent (down to 25) | While the generation canvas is shown, outside text fields | `src/components/layout/Canvas.tsx` |
| `0` | Reset zoom and pan | While the generation canvas is shown, outside text fields | `src/components/layout/Canvas.tsx` |
| Mouse wheel | Zoom in or out 5 percent | Over the generation canvas | `src/components/layout/Canvas.tsx` |
| Shift+drag, or middle-button drag | Pan | Over the generation canvas | `src/components/layout/Canvas.tsx` |
| Right-click, Shift+F10, or the Menu key | Open the canvas context menu | Generation canvas (the keys need focus on the canvas) | `src/components/layout/Canvas.tsx` |
| V R L B E, I | Mask tools and invert, as in the Canvas tab | Generation canvas while region mode is on | `src/components/layout/Canvas.tsx` |

### Canvas context menu

| Keys | Action | Where it is active | Source file |
|------|--------|--------------------|-------------|
| Arrow Down / Arrow Up | Move to the next or previous item (wraps) | Context menu open | `src/components/canvas/CanvasContextMenu.tsx` |
| Home / End | First or last item | Context menu open | `src/components/canvas/CanvasContextMenu.tsx` |
| A letter | Jump to the next item starting with that letter | Context menu open | `src/components/canvas/CanvasContextMenu.tsx` |
| Esc | Close the menu | Context menu open | `src/components/canvas/CanvasContextMenu.tsx` |

## Timeline

Active while the Timeline is shown under the canvas on the Generate tab. The
handler listens on the whole window and skips only text fields, text areas and
selects.

| Keys | Action | Where it is active | Source file |
|------|--------|--------------------|-------------|
| Space | Play or pause | Timeline shown | `src/components/layout/Timeline.tsx` |
| Home | Jump to the start of the play range (or 0) | Timeline shown | `src/components/layout/Timeline.tsx` |
| End | Jump to the end of the play range (or the sequence) | Timeline shown | `src/components/layout/Timeline.tsx` |
| Arrow Left / Arrow Right | Seek 250 ms back or forward | Timeline shown | `src/components/layout/Timeline.tsx` |
| Shift+Arrow Left / Shift+Arrow Right | Seek 1 second back or forward | Timeline shown | `src/components/layout/Timeline.tsx` |
| Alt+Arrow Left / Alt+Arrow Right | Nudge the selected clip one frame earlier or later | Timeline shown, a clip selected | `src/components/layout/Timeline.tsx` |
| S | Split the selected clip at the playhead | Timeline shown, a clip selected | `src/components/layout/Timeline.tsx` |
| Ctrl/Cmd+D | Duplicate the selected clip | Timeline shown, a clip selected | `src/components/layout/Timeline.tsx` |
| Delete or Backspace | Delete the selected clip (asks first) | Timeline shown, a clip selected | `src/components/layout/Timeline.tsx` |
| Esc | Close the export dialog | Export MP4 dialog open, not while exporting | `src/components/timeline/TimelineExportDialog.tsx` |
| Enter or Space | Select a frame | Focus on a filmstrip frame | `src/components/timeline/FrameFilmstrip.tsx` |

Mark In, Mark Out, Clear Range and the retake range controls are toolbar
buttons with no keyboard shortcut.

## Iteration timeline

| Keys | Action | Where it is active | Source file |
|------|--------|--------------------|-------------|
| Arrow Left / Arrow Up | Select the previous iteration | Focus on an iteration timeline node | `src/components/iteration/IterationTimeline.tsx` |
| Arrow Right / Arrow Down | Select the next iteration | Focus on an iteration timeline node | `src/components/iteration/IterationTimeline.tsx` |
| Home / End | Select the first or last iteration | Focus on an iteration timeline node | `src/components/iteration/IterationTimeline.tsx` |
| Enter or Space | Activate the iteration node (same as a click) | Focus on an iteration graph node | `src/components/iteration/IterationNode.tsx` |

## Workflows and Pipelines

| Keys | Action | Where it is active | Source file |
|------|--------|--------------------|-------------|
| Arrow keys | Move the node 16 px | Focus on a workflow graph node | `src/components/workflow/WorkflowGraphEditor.tsx` |
| Shift+Arrow keys | Move the node 64 px | Focus on a workflow graph node | `src/components/workflow/WorkflowGraphEditor.tsx` |
| Enter | Save the pipeline name | Pipeline name field | `src/components/pipeline/PipelineBuilder.tsx` |
| Esc | Cancel the rename | Pipeline name field | `src/components/pipeline/PipelineBuilder.tsx` |
| Enter or Space | Select the step | Focus on a pipeline step | `src/components/pipeline/PipelineNode.tsx` |
| Enter or Space | Expand or collapse the step settings | Focus on a step settings header | `src/components/pipeline/PipelineNodeConfig.tsx` |

## Story

| Keys | Action | Where it is active | Source file |
|------|--------|--------------------|-------------|
| Enter or Space | Select the scene | Focus on a scene card | `src/components/storyboard/SceneCard.tsx` |
| Space or Enter, then Arrow keys, then Space or Enter (Esc cancels) | Pick up, move and drop a scene (keyboard drag) | Focus on a scene's drag handle | `src/pages/StoryboardPanel.tsx` (dnd-kit keyboard sensor) |
| Enter or Space | Assign or unassign the character on the active scene | Focus on a character card | `src/components/storyboard/CharacterRefCard.tsx` |
| Esc | Close the script import dialog | Import Script open, not while generating | `src/components/storyboard/ScriptImportDialog.tsx` |

## Generate, Batch and Templates

| Keys | Action | Where it is active | Source file |
|------|--------|--------------------|-------------|
| Esc | Close prompt history | Prompt history open | `src/components/generate/PromptHistory.tsx` |
| Esc | Close the add-style popover | Style presets add popover open | `src/components/generate/StylePresetsBar.tsx` |
| Enter or Space | Open the file picker | Focus on an image drop zone (Start Frame, End Frame, references) | `src/components/generate/CompactImageDropZone.tsx` |
| Enter or Space | Expand or collapse the video controls | Focus on the video controls header | `src/components/generate/VideoControls.tsx` |
| Esc | Cancel | Over-budget dialog open | `src/components/generate/OverBudgetFallbackDialog.tsx` |
| Enter or Space | Select the result | Focus on a batch result card | `src/components/batch/ResultCard.tsx` |
| Esc | Close the preview | Image preview open | `src/components/shared/ImagePreviewModal.tsx` |
| Arrow Left / Arrow Right | Previous or next image | Image preview open | `src/components/shared/ImagePreviewModal.tsx` |
| Enter or Space | Open the template preview | Focus on a template card | `src/pages/TemplatesPanel.tsx` |
| Esc | Close the dialog | Template creator or template preview open | `src/components/templates/TemplateCreator.tsx`, `src/components/templates/TemplatePreviewModal.tsx` |

## Collections, projects and Settings

| Keys | Action | Where it is active | Source file |
|------|--------|--------------------|-------------|
| Enter or Space | Open the collection | Focus on a collection card | `src/components/collections/CollectionCard.tsx` |
| Enter | Save the new collection name | Collection rename field | `src/components/collections/CollectionCard.tsx` |
| Esc | Cancel the rename | Collection rename field | `src/components/collections/CollectionCard.tsx` |
| Esc | Close the menu | Add to collection menu open | `src/components/collections/AddToCollectionMenu.tsx` |
| Enter | Create the collection | Add to collection menu, new collection name field | `src/components/collections/AddToCollectionMenu.tsx` |
| Esc | Close the project menu | Project menu open (and not renaming or confirming a delete) | `src/components/layout/ProjectDropdown.tsx` |
| Enter / Esc | Save or cancel the project rename | Project rename field | `src/components/layout/ProjectDropdown.tsx` |
| Enter | Save the account name | Settings > AI & Models, Account name field | `src/pages/SettingsPanel.tsx` |
| Esc | Dismiss the first-run model setup | First-run provisioning overlay, no cancel confirm open | `src/components/provisioning/FirstRunProvisioning.tsx` |

## Common controls

| Keys | Action | Where it is active | Source file |
|------|--------|--------------------|-------------|
| Arrow Right / Arrow Up | Increase by one step | Focus on a slider | `src/components/ui/Slider.tsx` |
| Arrow Left / Arrow Down | Decrease by one step | Focus on a slider | `src/components/ui/Slider.tsx` |
| Page Up / Page Down | Change by a tenth of the range | Focus on a slider | `src/components/ui/Slider.tsx` |
| Home / End | Jump to the minimum or maximum | Focus on a slider | `src/components/ui/Slider.tsx` |
| Esc | Cancel | Any confirm dialog | `src/components/ui/ConfirmDialog.tsx` |
| Tab / Shift+Tab | Cycle focus inside the dialog (focus stays trapped) | Confirm, over-budget, image preview and template dialogs | `src/components/ui/ConfirmDialog.tsx` and the dialogs above |

## Window and menu keys

The window uses a hidden title bar, so the application menu is never drawn, but
its accelerators still apply.

- **Packaged (installed) builds** replace Electron's default menu with one that
  keeps only the Edit roles (undo, redo, cut, copy, paste, delete, select all;
  plus paste and match style on macOS), the Window roles (minimize, close; on
  macOS minimize, zoom, bring to front) and, on macOS, the app menu (about,
  hide, quit). There is no View menu, so reload, force reload, DevTools,
  fullscreen and page zoom have no accelerator. In addition, these keys are
  swallowed before the page sees them: F5, F12, Ctrl/Cmd+R (with or without
  Shift), and Ctrl+Shift+I / J / C (Cmd+Alt+I / J / C on macOS). Source:
  `electron/services/applicationMenu.ts`, `electron/services/mainWindow.ts`.
- **Development builds** keep Electron's default menu, so Ctrl/Cmd+R reloads
  the window (and loses unsaved in-memory state), the DevTools shortcut opens
  DevTools, and Ctrl/Cmd with `=`, `-` or `0` zooms the whole page.
