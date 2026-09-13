# Release screenshots

The images in [`images/`](./images/), shown in the [README](../README.md), are
**generated, not collected**. A screenshot in a public repository is a factual
claim about what the app looks like and what it can do, so it is produced by a
script that drives the real application, and regenerating it is how the claim
stays true after a UI change.

```bash
npm run build             # dist/ + dist-electron/ must be current
npm run screenshots       # -> docs/images/*.png

# a subset, when only one surface changed
node scripts/capture-screenshots.mjs --only=hero,foundry
```

## What the script does

[`scripts/capture-screenshots.mjs`](../scripts/capture-screenshots.mjs)
launches the packaged renderer under the project's own Electron (42.x, not the
copy Playwright would otherwise fetch), drives the real navigation, and writes
one PNG per shot at 1600x1000 on the dark Carbon Pro theme.

Three details exist to keep the output honest:

| Detail | Why |
| --- | --- |
| Throwaway `--user-data-dir` per run | The first pass of these shots ran against the developer profile and carried a leftover **"E2E Project"** from a test run into every panel. A public screenshot is a claim about the product, not about one machine. |
| No fixture data, ever | Nothing is stubbed or seeded. Panels that are genuinely empty photograph as empty. A mocked panel dressed up as a working one is the one thing that must never ship here. |
| The project is created through the UI | A throwaway profile has no project, so the project-scoped surfaces would all read "No Project Open". The script clicks the real dropdown control, exactly as a user would, rather than writing store state. |

## Backend state

The script never starts a backend. Start one yourself first if the shots should
show live state - model counts, detected device, connected status:

```bash
VISION_STUDIO_BACKEND_AUTH_TOKEN=<token> backend/venv/Scripts/python.exe backend/main.py
VISION_STUDIO_BACKEND_AUTH_TOKEN=<token> node scripts/capture-screenshots.mjs
```

The token must be **the same on both sides**. Electron and a manually started
backend otherwise mint different random tokens, the backend answers every
authenticated route with 403 (only `/api/health` is exempt), and the app renders
as disconnected while looking like it should be connected - see
`externalBackendTokenWarning` in `electron/services/backendProcess.ts`.

Without a backend the shots show the app's honest offline empty states. Either
is publishable.

## Shot list

| Slot | Surface | Shown in |
| --- | --- | --- |
| `hero` | Generate - the main workbench, prompt filled | README, full width |
| `foundry` | Model Foundry - library state and HF/CivitAI search | README grid |
| `performance` | Settings > Performance - tri-state acceleration controls | README grid |
| `routing` | Settings > AI & Models - hardware readout and BYOK provider routing | README grid |
| `story` | Story - storyboard, board references, continuity elements | README grid |
| `canvas` | Canvas - layer editor, tool strip, properties inspector | README, collapsed |

Adding a shot means adding an entry to `SHOTS` in the script and a line here.

### Deliberately absent

`workflows` and `assets` were captured, reviewed, and cut. On a fresh profile
the Workflows tab renders the same storyboard rail as Story - near
pixel-identical to `story.png`, with nothing resembling the graph canvas a
caption would have to promise - and Assets is an empty library with no grid to
show. Publishing either would have meant a caption the image did not support.
Add them back when there is something in them worth a reader's attention.

## Not the visual-regression baselines

These are unrelated to
`tests/e2e/visual/snapshots/`, which are pixel baselines compared by
`npm run test:visual` and are authored on Windows CI. Those exist to fail a
build on unintended visual change; these exist to show the product. Do not point
one at the other.
