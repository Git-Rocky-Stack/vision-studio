/**
 * Capture the README / release screenshots from the real application.
 *
 * These images end up in a public repository, where a screenshot is a factual
 * claim about what the app looks like and what it can do. So they are generated
 * rather than hand-collected: this script launches the packaged renderer under
 * Electron, drives the real navigation, and writes to docs/images/. Re-running
 * it after a UI change is how the claim stays true.
 *
 *   npm run build                  # dist/ + dist-electron/ must be current
 *   node scripts/capture-screenshots.mjs
 *
 * The backend is NOT spawned by this script, and this script never spawns one
 * either: run it yourself first if you want the shots to show live state.
 *
 *   VISION_STUDIO_BACKEND_AUTH_TOKEN=<token> backend/venv/Scripts/python.exe backend/main.py
 *   VISION_STUDIO_BACKEND_AUTH_TOKEN=<token> node scripts/capture-screenshots.mjs
 *
 * The token must be the SAME on both sides. Electron and a manually started
 * backend otherwise mint different random tokens, the backend answers every
 * authenticated route with 403 (only /api/health is exempt), and the app
 * renders as disconnected while looking like it should be connected - see
 * externalBackendTokenWarning in electron/services/backendProcess.ts.
 *
 * With a backend up the shots show live state (model counts, device, connected
 * status); without one they show the app's honest offline empty states. Either
 * is publishable. What is not publishable is a mocked panel dressed up as a
 * working one, so nothing here injects fixture data.
 *
 * `--only=hero,foundry` limits the run to named shots.
 */
import { _electron as electron } from 'playwright';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'docs', 'images');

/** Window size for every capture. 16:10 at 1x - legible inline on GitHub. */
const VIEWPORT = { width: 1600, height: 1000 };

const HERO_PROMPT =
  'A weathered lighthouse on a basalt headland at dusk, storm light breaking ' +
  'through low cloud, long exposure, 85mm';

/**
 * One entry per published image. `prepare` receives the window and leaves the
 * app on the surface to be shot; anything it awaits is a real interaction, not
 * a stub.
 */
const SHOTS = [
  {
    name: 'hero',
    caption: 'Generate - the main workbench',
    async prepare(page) {
      await nav(page, 'generate');
      const prompt = page.getByTestId('prompt-input');
      await prompt.waitFor({ state: 'visible', timeout: 15_000 });
      await prompt.fill(HERO_PROMPT);
      // Let the prompt-derived UI (token count, tag preview) settle.
      await page.waitForTimeout(600);
    },
  },
  {
    name: 'foundry',
    caption: 'Model Foundry - search, tier, license and security gating',
    prepare: (page) => nav(page, 'foundry'),
  },
  {
    name: 'canvas',
    caption: 'Canvas - layer editor, tool strip and inspector',
    prepare: (page) => nav(page, 'canvas'),
  },
  {
    name: 'story',
    caption: 'Story - storyboard, board references and continuity elements',
    prepare: (page) => nav(page, 'story'),
  },
  // No `workflows` or `assets` shot. On a fresh profile the Workflows tab
  // renders the same storyboard rail as Story - near pixel-identical, and
  // nothing resembling the graph canvas a caption would have to promise - and
  // Assets is an empty library with no grid to show. Both were captured, looked
  // at, and cut rather than published under a caption they did not support. Add
  // them back when there is something in them worth a reader's attention.
  {
    name: 'performance',
    caption: 'Settings > Performance - per-optimization acceleration controls',
    async prepare(page) {
      await nav(page, 'settings');
      await page.getByRole('button', { name: /^Performance$/ }).click();
      await page.waitForTimeout(700);
    },
  },
  {
    name: 'routing',
    caption: 'Settings > AI & Models - local vs BYOK provider routing',
    async prepare(page) {
      await nav(page, 'settings');
      await page.getByRole('button', { name: /^AI & Models$/ }).click();
      await page.waitForTimeout(700);
    },
  },
];

/**
 * A fresh profile opens on the first-run model setup overlay. It is
 * `aria-modal` and covers the viewport, so every later click lands on it
 * instead of the nav. Dismiss it the way a user can - Escape, handled on the
 * dialog itself (FirstRunProvisioning.tsx:194), with the two dismiss buttons as
 * fallbacks because which one renders depends on provisioning state. Nothing
 * here writes store state directly: the app is only ever left somewhere it
 * could have got to on its own.
 */
async function dismissFirstRun(page) {
  const dialog = page.getByTestId('first-run-provisioning');
  if (!(await dialog.isVisible().catch(() => false))) return;

  await dialog.focus().catch(() => {});
  await page.keyboard.press('Escape');
  if (await gone(dialog)) return;

  for (const id of ['provision-skip', 'provision-background']) {
    const btn = page.getByTestId(id);
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ timeout: 5_000 }).catch(() => {});
      if (await gone(dialog)) return;
    }
  }
  throw new Error('first-run overlay would not dismiss; every later click would hit it');
}

/**
 * A throwaway profile has no project, and the project-scoped surfaces (canvas,
 * story, workflows) then render "No Project Open" rather than the thing they
 * exist to show. Create one through the real dropdown control - the same two
 * clicks a user makes - so the panels hold genuine structure. Named by the app
 * itself ("Untitled Project"), not by this script.
 */
async function ensureProject(page) {
  await page.getByRole('button', { name: 'Select project' }).click();
  const create = page.getByRole('button', { name: /^New Project$/ });
  await create.waitFor({ state: 'visible', timeout: 10_000 });
  await create.click();
  await page.waitForTimeout(1200);
}

const gone = async (locator) => {
  await locator.waitFor({ state: 'detached', timeout: 5_000 }).catch(() => {});
  return !(await locator.isVisible().catch(() => false));
};

async function nav(page, tab) {
  await page.getByTestId(`nav-${tab}`).click();
  // Heavy surfaces are React.lazy; wait out the Suspense fallback.
  await page
    .locator('[aria-label="Loading panel"]')
    .waitFor({ state: 'detached', timeout: 10_000 })
    .catch(() => {});
  await page.waitForTimeout(900);
}

async function main() {
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const only = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',')) : null;
  const shots = only ? SHOTS.filter((s) => only.has(s.name)) : SHOTS;
  if (!shots.length) throw new Error('no shots matched --only');

  const mainEntry = join(ROOT, 'dist-electron', 'main.mjs');
  if (!existsSync(mainEntry)) throw new Error(`missing ${mainEntry} - run "npm run build" first`);
  mkdirSync(OUT_DIR, { recursive: true });

  // Launch the project's own Electron (42.x), not the copy Playwright would
  // otherwise fetch for itself - the shots have to come from the runtime the
  // app actually ships on.
  const { createRequire } = await import('module');
  const executablePath = createRequire(join(ROOT, 'package.json'))('electron');
  if (typeof executablePath !== 'string') throw new Error('could not resolve the electron binary');

  // Throwaway profile. Run against the developer's real user-data directory and
  // whatever happens to be sitting in it gets published: the first pass of these
  // shots carried a leftover "E2E Project" from a test run across every panel.
  // A public screenshot is a claim about the product, not about this machine.
  const userDataDir = mkdtempSync(join(tmpdir(), 'vision-studio-shots-'));

  const app = await electron.launch({
    executablePath,
    args: [`--user-data-dir=${userDataDir}`, mainEntry],
    cwd: ROOT,
    env: {
      ...process.env,
      // Never spawn a backend from here. Unpackaged, the app resolves its
      // bundled backend relative to the Electron binary - under
      // node_modules/electron/dist - where nothing is installed, so the spawn
      // fails and the window never opens.
      VISION_STUDIO_SKIP_BACKEND: '1',
      // ...but still probe over HTTP, so a backend the operator started is
      // detected as connected rather than reported missing.
      VISION_STUDIO_BACKEND_EXTERNAL: '1',
    },
  });

  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('[data-testid="nav-generate"]', { timeout: 30_000 });
  await page.setViewportSize(VIEWPORT);

  await dismissFirstRun(page);
  await ensureProject(page);

  // Dark Carbon Pro is the canonical theme (DESIGN.md); force it so a stray
  // persisted light-theme preference cannot change what gets published.
  await page.evaluate(() => {
    document.documentElement.classList.remove('light');
    document.documentElement.classList.add('dark');
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await page.waitForTimeout(500);

  for (const shot of shots) {
    try {
      await shot.prepare(page);
      const file = join(OUT_DIR, `${shot.name}.png`);
      await page.screenshot({ path: file, animations: 'disabled' });
      console.log(`captured  ${shot.name.padEnd(10)} ${shot.caption}`);
    } catch (err) {
      console.error(`FAILED    ${shot.name}: ${err.message}`);
      process.exitCode = 1;
    }
  }

  await app.close();
  rmSync(userDataDir, { recursive: true, force: true });
  console.log(`\nwrote ${shots.length} shot(s) to docs/images/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
