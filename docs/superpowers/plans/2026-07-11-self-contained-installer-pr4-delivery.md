# Self-Contained Installer PR4 — Delivery: Heavy Installer, R2 Hosting, Updater, Mirror Fallback

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the delivery leg of the self-contained installer track (spec `docs/superpowers/specs/2026-07-06-self-contained-installer-design.md` §7 / §8·PR4 / §9 / §10): the electron-updater feed served from Cloudflare R2, the R2 publish tooling for the ~6 GB NSIS installer, the VS-mirror fallback path in the backend acquisition pipeline, the `VS_REAL_SMOKE` end-to-end gate, packaging-config honesty rails in CI, and the §10 cost model + operational runbook.

**Architecture:** Nothing heavy runs in CI. The NSIS installer is already produced locally (`npm run package:win` / `package:win:signed`, gated heavy-by-design by `scripts/assert-native-backend.cjs`); PR4 redirects electron-builder's `publish` from GitHub (2 GB/asset cap — a 6 GB installer cannot ship there) to a `generic` R2-backed feed, adds a main-process updater service driven entirely by real `electron-updater` events (no progress theater), a multipart S3-API publish script (binaries first, `latest.yml` last so the feed can never point at a missing artifact), and an optional per-model `mirror` stanza in the provisioning manifest that the `DownloadManager` falls back to only on infrastructure failure — never for gates, disk, or cancellation — with mandatory per-file sha256 (fail closed).

**Tech Stack:** electron-updater 6 (already a dependency, currently unwired), electron-builder `generic` provider, `@aws-sdk/client-s3` + `@aws-sdk/lib-storage` (devDependencies; multipart for 6 GB), `yaml` (devDependency; config honesty-rail tests), FastAPI/Python backend (stub-CI-safe mirror tests), Vitest + pytest.

## Global Constraints

- **No heavy build in CI.** PR-gate stays 4 fast jobs + the new config tests inside the existing Frontend job. The 6 GB build/publish is a local release-time operation (release process memory: releases are published locally via `gh`; `release.yml` is signing-gated/dormant).
- **No progress theater.** Every updater/mirror progress value comes from a real `electron-updater` event or a real `ProgressSink`; timers exist only for check *policy* (initial delay + 4 h re-check), never to animate progress.
- **Fail closed on integrity.** Mirror files without a `sha256` are refused; hash mismatch deletes the partial. Mirror stanzas are refused at manifest-generation time for any non-redistributable license category (extends the PR1 honesty rail; FLUX-nc can never acquire a mirror).
- **No fallback across trust boundaries.** `GatedModelError` (user must accept a license), `DiskSpaceError`, and `DownloadCancelledError` never trigger the mirror; only infrastructure failures do.
- **Secrets via env only** (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`) — never in code, config, or logs.
- **Design system:** any renderer UI follows `DESIGN.md` (`.mono-label`, machined radii, lucide icons, no emoji — `ui-glyphs.test.ts` enforces).
- **IPC channel names stay in sync** between `electron/preload.ts`, `src/types/electron.d.ts`, and the handlers (CLAUDE.md convention).
- Canonical delivery hosts: update feed `https://updates.visionstudio.app/win/` (R2 custom domain), model mirror `https://models.visionstudio.app/` (same bucket or sibling, spec §5/§7). DNS + bucket creation are release-time ops in the runbook (Rocky's Cloudflare account), not code.
- **Signed-build prerequisite:** `verifyUpdateCodeSignature: true` stays. Auto-update *installation* requires signed artifacts; flipping the feed live is gated on signing in the runbook. The updater surfaces real verification errors honestly — it must never be "fixed" by disabling verification.
- Tests: `npm run typecheck`, `npm test`, backend `venv/Scripts/python.exe -m pytest`, `npm run build` all green before shipping.

## File Structure

| File | Responsibility |
|---|---|
| `tests/packaging-config.test.ts` (new) | Honesty rails over `electron-builder.yml` + `package.json` (publish shape, feed URL path ↔ publish-script key layout, hooks exist) |
| `electron-builder.yml` (modify) | `publish` → generic R2 feed; ship `THIRD-PARTY-LICENSES.md` as an extraResource |
| `scripts/publish-r2-core.cjs` (new) | Pure, testable core: artifact discovery, S3 key layout, content types, upload ordering |
| `scripts/publish-r2.cjs` (new) | CLI wrapper: env validation, S3 client construction, multipart upload, `--dry-run` |
| `tests/publish-r2-core.test.ts` (new) | Unit tests for the core (no network) |
| `electron/services/updater.ts` (new) | Main-process updater service over injected `electron-updater` (DI, event-driven status, policy timers, disabled in dev) |
| `electron/services/updater.test.ts` (new) | Service tests with a fake autoUpdater |
| `electron/services/mainIpc.ts` (modify) | `updater:get-status` / `updater:check` / `updater:install` handlers |
| `electron/services/mainProcess.ts` (modify) | Construct + start the updater service |
| `electron/main.ts` (modify) | Inject the real `electron-updater` module |
| `electron/preload.ts`, `src/types/electron.d.ts` (modify) | `window.electron.updater` namespace |
| `src/components/settings/AboutSection.tsx` + `.test.tsx` (modify) | "Updates" block: version, live status, Check / Restart-to-update actions |
| `backend/foundry/provisioning.py` (modify) | Emit optional `mirror` stanza from `provision-overrides.json`, license-gated |
| `backend/foundry/provision-overrides.json` (modify) | Empty `mirrors: {}` scaffold + comment (stanzas added when weights actually land on R2) |
| `backend/foundry/download_manager.py` (modify) | `mirror_lookup` ctor param; `_download_hf` extraction; `_download_from_mirror` fallback |
| `backend/main.py` (modify) | Wire `mirror_lookup` from the loaded manifest |
| `backend/tests/test_provisioning_manifest.py`, `backend/tests/test_download_manager.py` (modify) | Mirror emission rails + fallback behavior tests |
| `backend/tests/test_provision_real_smoke.py` (new) | `VS_REAL_SMOKE=1` end-to-end real small-model provision (local only) |
| `docs/R2-DELIVERY.md` (new) | Runbook: bucket layout, DNS, credentials, publish order, signing prerequisite, §10 cost model (R2 vs B2), open-question resolutions |
| `.github/workflows/release.yml` (modify) | Optional secrets-gated R2 publish step in the dormant release workflow |
| `docs/superpowers/specs/2026-07-06-self-contained-installer-design.md` (modify) | Mark §10 questions 1 & 3 resolved with pointers |

Task boundaries below are reviewer-gateable: config rails, publish tooling, updater backend, updater UI, manifest mirrors, download fallback, smoke gate, docs — each lands with its own tests and commit.

---

### Task 1: Commit this plan

- [ ] **Step 1:** `git add docs/superpowers/plans/2026-07-11-self-contained-installer-pr4-delivery.md && git commit -m "docs(installer): PR4 delivery implementation plan"`

---

### Task 2: Packaging-config honesty rails + electron-builder publish → R2 generic feed

**Files:** Create `tests/packaging-config.test.ts`; Modify `electron-builder.yml`; add devDependency `yaml`.

**Interfaces:** Produces the canonical feed constants consumed by Task 3's key layout: feed URL `https://updates.visionstudio.app/win/`, artifact keys under `win/`.

- [ ] **Step 1:** `npm install --save-dev yaml`
- [ ] **Step 2: Write the failing test** — `tests/packaging-config.test.ts` (node project):

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parse } from 'yaml';

const ROOT = resolve(__dirname, '..');
const config = parse(readFileSync(resolve(ROOT, 'electron-builder.yml'), 'utf8'));

describe('packaging config honesty rails', () => {
  it('publishes the update feed to the generic R2 host, not GitHub', () => {
    // GitHub caps release assets at 2 GB; the ~6 GB heavy installer cannot
    // ship there. The electron-updater feed (latest.yml + blockmap) lives on
    // the R2 custom domain.
    expect(config.publish.provider).toBe('generic');
    expect(config.publish.url).toBe('https://updates.visionstudio.app/win/');
  });

  it('disables multi-range differential requests (unsupported by R2/S3)', () => {
    expect(config.publish.useMultipleRangeRequest).toBe(false);
  });

  it('keeps update signature verification on', () => {
    expect(config.win.verifyUpdateCodeSignature).toBe(true);
  });

  it('keeps the heavy-by-design beforePack gate wired and present', () => {
    expect(config.beforePack).toBe('scripts/assert-native-backend.cjs');
    expect(() => readFileSync(resolve(ROOT, config.beforePack))).not.toThrow();
  });

  it('ships the third-party license compliance doc as an extra resource', () => {
    const entries = (config.extraResources ?? []).map((e: { from: string }) => e.from);
    expect(entries).toContain('THIRD-PARTY-LICENSES.md');
  });
});
```

- [ ] **Step 3:** Run `npx vitest run tests/packaging-config.test.ts` — expect FAIL (publish is github, no extraResource).
- [ ] **Step 4:** Edit `electron-builder.yml`: replace the whole `publish:` block with:

```yaml
# =============================================================================
# Auto-Update Feed (Cloudflare R2, generic provider)
# =============================================================================
# GitHub caps release assets at 2 GB - the heavy installer cannot ship there.
# latest.yml + installer + blockmap are published to R2 (scripts/publish-r2.cjs,
# binaries first, feed last) behind the updates.visionstudio.app custom domain.
# R2/S3 serve a single range per request, so multi-range differential
# downloads must be disabled or blockmap updates fail.
publish:
  provider: generic
  url: https://updates.visionstudio.app/win/
  useMultipleRangeRequest: false
```

and append to `extraResources`:

```yaml
  - from: THIRD-PARTY-LICENSES.md
    to: THIRD-PARTY-LICENSES.md
```

- [ ] **Step 5:** Re-run the test file — expect PASS.
- [ ] **Step 6:** Commit: `feat(delivery): point the update feed at the R2 generic provider`

---

### Task 3: R2 publish tooling (`publish-r2-core.cjs` + CLI)

**Files:** Create `scripts/publish-r2-core.cjs`, `scripts/publish-r2.cjs`, `tests/publish-r2-core.test.ts`; Modify `package.json` (devDeps `@aws-sdk/client-s3` + `@aws-sdk/lib-storage`, script `release:publish:r2`).

**Interfaces:** Produces `planUploads(files: string[], opts) -> Array<{ filePath, key, contentType }>` and `orderForFeedSafety(uploads) -> uploads` (feed files last). CLI: `node scripts/publish-r2.cjs [--dir release] [--prefix win/] [--dry-run]`.

- [ ] **Step 1: Failing tests** — `tests/publish-r2-core.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
// CJS import is fine under vitest's node project
import { planUploads, orderForFeedSafety, RELEASE_ARTIFACT_PATTERNS } from '../scripts/publish-r2-core.cjs';

describe('publish-r2 core', () => {
  const files = [
    'Vision Studio Setup 3.1.1.exe',
    'Vision Studio Setup 3.1.1.exe.blockmap',
    'vision-studio-3.1.1-win.zip',
    'latest.yml',
    'builder-debug.yml', // never published
  ];

  it('plans keys under the prefix with correct content types', () => {
    const plan = planUploads(files, { dir: 'release', prefix: 'win/' });
    const byKey = Object.fromEntries(plan.map((u) => [u.key, u]));
    expect(byKey['win/Vision Studio Setup 3.1.1.exe'].contentType).toBe('application/octet-stream');
    expect(byKey['win/latest.yml'].contentType).toBe('text/yaml');
    expect(byKey['win/vision-studio-3.1.1-win.zip'].contentType).toBe('application/zip');
    expect(plan.some((u) => u.key.includes('builder-debug'))).toBe(false);
  });

  it('orders the feed file last so clients never see a feed for missing binaries', () => {
    const plan = orderForFeedSafety(planUploads(files, { dir: 'release', prefix: 'win/' }));
    expect(plan[plan.length - 1].key).toBe('win/latest.yml');
  });

  it('publishes only release artifacts', () => {
    expect(RELEASE_ARTIFACT_PATTERNS.some((re: RegExp) => re.test('latest.yml'))).toBe(true);
    expect(RELEASE_ARTIFACT_PATTERNS.some((re: RegExp) => re.test('builder-debug.yml'))).toBe(false);
  });
});
```

- [ ] **Step 2:** Run — expect FAIL (module missing).
- [ ] **Step 3: Implement** `scripts/publish-r2-core.cjs`:

```js
/**
 * Pure planning core for the R2 release publish (no network, unit-tested).
 *
 * Key layout MUST match electron-builder's generic publish URL
 * (https://updates.visionstudio.app/win/ -> objects under win/), asserted by
 * tests/packaging-config.test.ts + tests/publish-r2-core.test.ts together.
 */
const path = require('path');

// What a release publish ships: installer, portable zip, updater feed + blockmap.
// builder-debug.yml and friends are build noise, never published.
const RELEASE_ARTIFACT_PATTERNS = [
  /\.exe$/i,
  /\.exe\.blockmap$/i,
  /\.zip$/i,
  /^latest.*\.yml$/i,
];

// Feed files are uploaded LAST: a latest.yml that points at a not-yet-uploaded
// installer would 404 every client mid-publish.
const FEED_PATTERN = /^latest.*\.yml$/i;

const CONTENT_TYPES = [
  [/\.yml$/i, 'text/yaml'],
  [/\.zip$/i, 'application/zip'],
  [/./, 'application/octet-stream'],
];

function contentTypeFor(name) {
  return CONTENT_TYPES.find(([re]) => re.test(name))[1];
}

function planUploads(fileNames, { dir, prefix }) {
  return fileNames
    .filter((name) => RELEASE_ARTIFACT_PATTERNS.some((re) => re.test(name)))
    .map((name) => ({
      filePath: path.join(dir, name),
      key: `${prefix}${name}`,
      contentType: contentTypeFor(name),
    }));
}

function orderForFeedSafety(uploads) {
  const binaries = uploads.filter((u) => !FEED_PATTERN.test(path.basename(u.key)));
  const feeds = uploads.filter((u) => FEED_PATTERN.test(path.basename(u.key)));
  return [...binaries, ...feeds];
}

module.exports = { planUploads, orderForFeedSafety, RELEASE_ARTIFACT_PATTERNS, contentTypeFor };
```

- [ ] **Step 4:** Re-run tests — PASS.
- [ ] **Step 5:** `npm install --save-dev @aws-sdk/client-s3 @aws-sdk/lib-storage`
- [ ] **Step 6: CLI** `scripts/publish-r2.cjs` — env validation (all four `R2_*` vars, clear message listing the missing ones), reads `--dir` (default `release`), `--prefix` (default `win/`), `--dry-run`. Constructs `S3Client({ region: 'auto', endpoint: https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com, credentials })`, iterates `orderForFeedSafety(planUploads(fs.readdirSync(dir), ...))` **sequentially** (feed-last ordering is meaningless if uploads race), each via `new Upload({ client, params: { Bucket, Key, Body: fs.createReadStream(filePath), ContentType } }).done()` with byte-size logging. `--dry-run` prints the ordered plan and exits 0 without a client. Exit non-zero on any failure **before** the feed file uploads.
- [ ] **Step 7:** `package.json` scripts: `"release:publish:r2": "node scripts/publish-r2.cjs"`.
- [ ] **Step 8:** Verify by hand: `node scripts/publish-r2.cjs --dry-run` against an empty/missing `release/` dir prints an ordered empty plan (and a warning), exits 0; with fake env unset, non-dry run exits 1 naming the missing vars.
- [ ] **Step 9:** Commit: `feat(delivery): R2 release publish tooling (multipart, feed-last ordering)`

---

### Task 4: Updater service (main process, TDD)

**Files:** Create `electron/services/updater.ts`, `electron/services/updater.test.ts`.

**Interfaces:** Produces `createUpdaterService(deps)` returning `{ start(), dispose(), getStatus(): UpdaterStatus, check(): Promise<UpdaterStatus>, install(): void }` and exported `UPDATE_INITIAL_DELAY_MS = 15_000`, `UPDATE_RECHECK_INTERVAL_MS = 14_400_000`. `UpdaterStatus = { state: 'disabled'|'idle'|'checking'|'available'|'not-available'|'downloading'|'downloaded'|'error'; version?: string; percent?: number; bytesPerSecond?: number; transferred?: number; total?: number; message?: string }`. Status pushes to the renderer over channel `updater:status`.

Deps (all injected for tests): `autoUpdater` (structural `AutoUpdaterLike`: `autoDownload`, `autoInstallOnAppQuit`, `setFeedURL`, `checkForUpdates`, `quitAndInstall`, `on`), `isPackaged: boolean`, `env: NodeJS.ProcessEnv`, `getMainWindow: () => { webContents: { send(channel: string, payload: unknown) } } | null`, `logger`.

Behavior to pin with tests (fake autoUpdater = tiny EventEmitter-backed stub; `vi.useFakeTimers()` for the policy timers only):

- [ ] **Step 1: Failing tests** covering:
  1. **Disabled in dev:** `isPackaged: false` → `getStatus().state === 'disabled'`; `start()` never touches `autoUpdater`; `check()` resolves to the disabled status without calling `checkForUpdates`.
  2. **Disabled by env:** `VISION_STUDIO_DISABLE_UPDATES: '1'` with `isPackaged: true` → same.
  3. **Policy timers:** enabled service `start()` → `checkForUpdates` not called synchronously; after `vi.advanceTimersByTime(UPDATE_INITIAL_DELAY_MS)` called once; after another `UPDATE_RECHECK_INTERVAL_MS` called again; `dispose()` stops future checks.
  4. **Event → status mapping:** emitting `update-available` (`{ version: '3.2.0' }`) → status `{ state: 'available', version: '3.2.0' }` AND `webContents.send` called with `('updater:status', <that status>)`; `download-progress` (`{ percent: 42.5, bytesPerSecond: 1048576, transferred: 10, total: 100 }`) → `state: 'downloading'` with those exact numbers (no rounding invention); `update-downloaded` → `state: 'downloaded'`; `error` (`new Error('sig mismatch')`) → `{ state: 'error', message: 'sig mismatch' }`.
  5. **No window, no crash:** `getMainWindow: () => null` while events fire → status still updates, nothing throws.
  6. **install():** in `downloaded` state calls `quitAndInstall()`; in any other state does NOT call it and logs a warning (never restart the app on a non-downloaded update).
  7. **Feed override:** `env.VISION_STUDIO_UPDATE_URL = 'https://staging.example/win/'` → `setFeedURL({ provider: 'generic', url })` called during `start()`; without the env var `setFeedURL` is never called (packaged app reads `app-update.yml` from the Task 2 publish config).
  8. **Flags:** `start()` sets `autoDownload = true`, `autoInstallOnAppQuit = true`.
- [ ] **Step 2:** Run `npx vitest run electron/services/updater.test.ts` — FAIL (module missing).
- [ ] **Step 3: Implement** `electron/services/updater.ts` per the interface above. Status is a single mutable snapshot; every mutation goes through one `setStatus(next)` that also does `getMainWindow()?.webContents.send('updater:status', snapshot)` in a try/catch (a torn-down window must not kill the timer loop). `check()` triggers `checkForUpdates()` (errors mapped into the `error` status, never thrown to IPC) and resolves with the current snapshot.
- [ ] **Step 4:** Re-run — PASS.
- [ ] **Step 5:** Commit: `feat(delivery): event-driven electron-updater service (policy timers only, no theater)`

---

### Task 5: Updater IPC + preload + main wiring

**Files:** Modify `electron/services/mainIpc.ts`, `electron/services/mainProcess.ts`, `electron/main.ts`, `electron/preload.ts`, `src/types/electron.d.ts`; extend `electron/services/mainIpc.test.ts` if handler coverage exists there (follow the file's existing pattern).

**Interfaces:** Renderer consumes `window.electron.updater = { getStatus(): Promise<UpdaterStatus>, check(): Promise<UpdaterStatus>, install(): Promise<void>, onStatus(cb: (s: UpdaterStatus) => void): () => void }`.

- [ ] **Step 1:** `mainProcess.ts` — add `autoUpdater` to `MainProcessDependencies`; construct after `backend`:

```ts
const updater = createUpdaterService({
  autoUpdater,
  isPackaged: app.isPackaged,
  env: process.env,
  getMainWindow: () => mainWindow.getWindow(),
  logger,
});
```

pass `updater` into `registerMainIpcHandlers`, and call `updater.start()` at the end of `start()` (after the backend autostart block — first-run backend extraction takes priority over an update check; the 15 s initial delay also serves this).
- [ ] **Step 2:** `electron/main.ts` — `import electronUpdater from 'electron-updater';` (CJS default-import interop under the ESM main bundle) and pass `autoUpdater: electronUpdater.autoUpdater` into `createMainProcess`.
- [ ] **Step 3:** `mainIpc.ts` — new handlers:

```ts
ipcMain.handle('updater:get-status', () => updater.getStatus());
ipcMain.handle('updater:check', () => updater.check());
ipcMain.handle('updater:install', () => updater.install());
```

- [ ] **Step 4:** `preload.ts` — add the `updater` namespace (type + impl; `onStatus` follows the existing `generation.onProgress` on/off pattern). Mirror the types in `src/types/electron.d.ts` (define `UpdaterStatus` there or import a shared type — match how `ProvisionStatus` is handled).
- [ ] **Step 5:** `npm run typecheck` — PASS. Run `npx vitest run electron/services` — PASS.
- [ ] **Step 6:** Commit: `feat(delivery): updater IPC + preload surface`

---

### Task 6: About → Updates block (renderer, TDD)

**Files:** Modify `src/components/settings/AboutSection.tsx`, `src/components/settings/AboutSection.test.tsx`.

**Interfaces:** Consumes `window.electron.updater` (Task 5). Test ids: `about-updates`, `about-updates-check`, `about-updates-install`.

- [ ] **Step 1: Failing tests** (jsdom; mock `window.electron.updater` with `vi.fn()`s and a captured `onStatus` callback; `afterEach(cleanup)` per house pattern):
  1. Renders the block with the current app version and a "Check for updates" button; `getStatus` is called on mount.
  2. `disabled` state → copy "Automatic updates run in the installed app." and the check button is disabled.
  3. Pushing a `downloading` status through the captured `onStatus` callback renders the real percent (e.g. "42%") — value must come from the pushed status object, no local animation.
  4. `downloaded` state → "Restart to update" button (`about-updates-install`); clicking calls `updater.install()`.
  5. `error` state → the `message` text renders; check button re-enabled.
  6. `onStatus` unsubscribe function is called on unmount.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3: Implement** the Updates block inside `AboutSection` (below the version line, above licenses): `.mono-label` "UPDATES" kicker, status line (`type-ui text-text-body`), buttons `.btn-chrome vx-btn-chrome` for Restart-to-update, plain bordered control for Check (matches existing About affordances), lucide `RefreshCw` / `DownloadCloud` icons. States map 1:1 from `UpdaterStatus.state`; no emoji; percent shown as `Math.round(percent)` with the raw value from the event.
- [ ] **Step 4:** Run the file + `npx vitest run src/components/settings` — PASS.
- [ ] **Step 5:** Commit: `feat(delivery): live Updates block in About (honest states, real event data)`

---

### Task 7: Manifest mirror stanzas (backend, license-gated)

**Files:** Modify `backend/foundry/provisioning.py`, `backend/foundry/provision-overrides.json`, `backend/tests/test_provisioning_manifest.py` (or the PR1 manifest test module — locate by `build_provision_manifest` usages).

**Interfaces:** Produces manifest entries optionally carrying `"mirror": { "base_url": "https://models.visionstudio.app/<id>", "files": [{"name": str, "sha256": str, "bytes": int}] }`. Consumed by Task 8's `mirror_lookup`.

- [ ] **Step 1: Failing tests:**
  1. An override `mirrors: { "sd-1-5": { base_url, files: [{name, sha256, bytes}] } }` (redistribution-compatible category) → the generated entry carries the `mirror` verbatim.
  2. A mirror override whose files lack `sha256` → manifest generation raises (fail closed; message names the model and file).
  3. A mirror override for a **non-redistributable** id (use the openpose non-commercial fixture from PR1) → generation raises: hosting weights on the VS mirror is redistribution, the same legal boundary as bundling.
  4. A mirror `base_url` that is not `https://` → raises.
  5. No `mirrors` key (the shipping state) → entries carry no `mirror` key at all (wire compat: absent, not null).
- [ ] **Step 2:** Run with `backend/venv/Scripts/python.exe -m pytest backend/tests/<manifest test file> -v` — FAIL.
- [ ] **Step 3: Implement** in `provisioning.py`: a `_mirror(record_id, entry, overrides)` helper called from `_entry`, validating https + per-file sha256/bytes/name (reject absolute paths and `..` segments in names — defense against a hostile stanza) and the license gate (reuse the PR1 redistribution-compatibility classification the honesty rail already uses). Add `"mirrors": {}` with a `_comment` to `provision-overrides.json` (stanzas land when weights are actually uploaded — the runbook's "go live" step; no fabricated hashes).
- [ ] **Step 4:** Tests PASS; regenerate the committed manifest only if emission changes its bytes (`write_manifest()` — with empty `mirrors` it must be byte-identical; assert via `git diff --stat`).
- [ ] **Step 5:** Commit: `feat(delivery): license-gated VS-mirror stanzas in the provisioning manifest`

---

### Task 8: DownloadManager mirror fallback

**Files:** Modify `backend/foundry/download_manager.py`, `backend/main.py`, `backend/tests/test_download_manager.py`.

**Interfaces:** `DownloadManager(..., mirror_lookup: Optional[Callable[[str], Optional[dict]]] = None)`. `main.py` wires `mirror_lookup={e["id"]: e["mirror"] for e in auto_set if e.get("mirror")}.get` next to the existing manager construction.

- [ ] **Step 1: Failing tests** (stub-safe — monkeypatched `huggingface_hub` + injected fake `requests` module, mirroring the existing direct-URL test fixtures):
  1. HF path raises a repo-unavailable error, record has a mirror with 2 files (one nested `unet/model.safetensors`) → both stream from `base_url`, sha256-verified, atomically moved; job ends `ready`; progress came from a real `ProgressSink` (assert `job.total_bytes == sum(bytes)`).
  2. `GatedModelError` from the HF path → **no** mirror attempt; `job.gate_url` preserved.
  3. `DiskSpaceError` → no mirror attempt.
  4. Pause mid-mirror-stream (cancel event set) → job `paused`, `.incomplete` partial retained.
  5. Mirror file sha256 mismatch → partial deleted, job `error`, message names the mirror.
  6. Mirror + primary both fail → job `error`; message carries the mapped **primary** error and notes the mirror failure.
  7. No mirror for the id → behavior identical to today (mapped primary error).
  8. Mirror URL host differing from `base_url` host after join, non-https `base_url`, or a `..`/absolute file name → refused (`DownloadFailedError`), nothing fetched.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3: Implement:**
  - Extract the current HF loop (lines resolving files → preflight → per-file `_download_file` → verify) into `_download_hf(model_id, record, token, job, cancel_event)`.
  - In `_execute`, wrap it:

```python
try:
    self._download_hf(model_id, record, token, job, cancel_event)
except (DownloadCancelledError, DiskSpaceError):
    raise
except Exception as primary_exc:
    mapped = primary_exc if isinstance(primary_exc, DownloadError) else map_hf_exception(
        primary_exc, repo_id=record.get("repo_id") or model_id)
    if isinstance(mapped, GatedModelError):
        raise mapped  # a license gate needs the USER, never infrastructure routing
    mirror = self._mirror_lookup(model_id) if self._mirror_lookup else None
    if not mirror:
        raise mapped
    logger.warning("primary fetch failed for %s (%s); falling back to VS mirror", model_id, mapped)
    try:
        self._download_from_mirror(model_id, record, mirror, job, cancel_event)
    except DownloadCancelledError:
        raise
    except Exception as mirror_exc:
        raise DownloadFailedError(f"{mapped}; VS mirror fallback also failed: {mirror_exc}") from primary_exc
```

  - `_download_from_mirror`: validate `base_url` https; per file: validate name (no absolute/`..`), build URL, single `requests.get(stream=True, allow_redirects=False, timeout=_CIVITAI_TIMEOUT)` (the mirror is first-party — a redirect is unexpected and refused), assert response host == base host by construction, stream to `<target>/<name>.incomplete` hashing sha256 through the shared `ProgressSink` (one sink across all files, `total = sum(bytes)`), verify per-file sha256 (mismatch → delete partial, raise), `os.replace` per file. Caller then runs the existing `verifying → ready` transition (`self._verify([f["name"] for f in mirror["files"]], target_dir)`).
- [ ] **Step 4:** Full backend suite: `backend/venv/Scripts/python.exe -m pytest -v` — PASS (including the untouched orchestrator/API suites).
- [ ] **Step 5:** Wire `main.py` (mirror map built once from the loaded manifest beside the existing `DownloadManager(...)` construction).
- [ ] **Step 6:** Commit: `feat(delivery): sha256-verified VS-mirror fallback in the acquisition pipeline`

---

### Task 9: `VS_REAL_SMOKE` end-to-end provision gate

**Files:** Create `backend/tests/test_provision_real_smoke.py`.

- [ ] **Step 1:** Module-level `pytestmark = pytest.mark.skipif(os.environ.get("VS_REAL_SMOKE") != "1", reason="real-network smoke; set VS_REAL_SMOKE=1 locally")`. The test builds the real registry + `DownloadManager` + `ProvisionOrchestrator` over a `tmp_path` models dir, restricts the manifest to its **smallest** `auto_set` entry by `approx_bytes`, runs `start()`, and polls `status()` (asyncio event loop driven like the existing orchestrator integration tests) until `complete` or a 15-minute deadline; asserts the entry's row is `ready` and its files exist on disk with non-zero size. No mocking anywhere — this is the spec §9 honesty gate.
- [ ] **Step 2:** Verify the skip: plain `backend/venv/Scripts/python.exe -m pytest backend/tests/test_provision_real_smoke.py -v` → SKIPPED.
- [ ] **Step 3:** Run it for real ONCE: `VS_REAL_SMOKE=1 backend/venv/Scripts/python.exe -m pytest backend/tests/test_provision_real_smoke.py -v` → PASS (real download of the smallest model into tmp). Record the model + duration in the commit body.
- [ ] **Step 4:** Commit: `test(delivery): VS_REAL_SMOKE real end-to-end provision gate`

---

### Task 10: Runbook + §10 cost model + release workflow hook + spec resolution

**Files:** Create `docs/R2-DELIVERY.md`; Modify `.github/workflows/release.yml`, `docs/superpowers/specs/2026-07-06-self-contained-installer-design.md`.

- [ ] **Step 1:** `docs/R2-DELIVERY.md` covering, concretely:
  - **Bucket layout:** one bucket, prefixes `win/` (feed + installers) and `models/<id>/` (mirror weights); custom domains `updates.visionstudio.app` + `models.visionstudio.app` (R2 custom-domain = zero-egress Cloudflare-served).
  - **One-time setup:** bucket creation, R2 API token scopes (Object Read & Write on the bucket), DNS, and the four env vars.
  - **Publish procedure:** `npm run build:backend` → `npm run build` → `npm run package:win:signed` → `npm run release:publish:r2 -- --dry-run` (review the ordered plan) → real publish → GitHub Release (notes + pointer, no >2 GB assets) via `gh`.
  - **Signing prerequisite:** `verifyUpdateCodeSignature: true` means clients refuse unsigned updates — the feed goes live only after Azure Trusted Signing lands; until then R2 hosts the installer for download links while auto-update stays dormant. Never disable verification to "make updates work."
  - **Mirror go-live:** upload permitted weights with `node scripts/publish-r2.cjs --dir <staging> --prefix models/<id>/`, compute per-file sha256 (PowerShell `Get-FileHash` or the manifest tooling), add the `mirrors` stanza to `provision-overrides.json`, regenerate the manifest, ship through a normal PR (the honesty rails verify the stanza).
  - **§10 Q1 cost model (R2 chosen):** rates as of 2026-07 with links — R2: $0.015/GB-mo storage, egress $0, Class A $4.50/M, Class B $0.36/M; B2: $6/TB-mo, egress free to 3× storage then $0.01/GB. Worked example: 6 GB installer + ~60 GB mirrored weights ≈ $1/mo storage; 1,000 installs/mo ≈ 6 TB installer egress + up to 60 TB model egress → **$0 on R2** vs ~$600+/mo on B2 without a CDN in front. Blockmap differentials cut update egress further. Verdict: R2, decisively — egress dominates at any adoption level.
  - **§10 Q3 resolution:** upstream-primary + VS-mirror-fallback, mirrors added only for fragile/high-value upstreams (start: `sd-1-5`, the once-deleted repo) — lowest cost, full resilience, spec's own recommendation.
  - **Web-installer stub: deferred** (spec marks it optional): it exists to dodge GitHub's 2 GB cap for users who won't download 6 GB from a release page, but the R2-hosted full installer link removes that constraint; revisit if distribution analytics ever demand it.
- [ ] **Step 2:** `release.yml` — after "Upload release artifact" in `build-windows`, add a secrets-gated step (workflow is dormant until signing secrets exist; this makes it R2-ready the day they do):

```yaml
      - name: Publish update feed to R2
        if: ${{ startsWith(github.ref, 'refs/tags/v') && env.R2_ACCESS_KEY_ID != '' }}
        run: npm run release:publish:r2
        env:
          R2_ACCOUNT_ID: ${{ secrets.R2_ACCOUNT_ID }}
          R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          R2_BUCKET: ${{ secrets.R2_BUCKET }}
```

- [ ] **Step 3:** Spec §10: mark Q1 "**Resolved (PR4):** R2 — see docs/R2-DELIVERY.md cost model" and Q3 "**Resolved (PR4):** upstream-primary + mirror-fallback for fragile upstreams".
- [ ] **Step 4:** Commit: `docs(delivery): R2 runbook, cost model, spec §10 resolutions + release workflow R2 hook`

---

### Task 11: Ship

- [ ] **Step 1:** Full gates: `npm run typecheck` && `npm test` && `backend/venv/Scripts/python.exe -m pytest -v` && `npm run build`.
- [ ] **Step 2:** Push, `gh pr create` (summary: what ships dark vs live — updater code + feed config ship, feed goes live post-signing; mirror mechanism ships, stanzas land at mirror go-live), `gh pr checks --watch`, `gh pr merge --squash --delete-branch`.
- [ ] **Step 3:** Update `installer-provisioning-track` memory: PR4 merged, delivery ops remaining (bucket/DNS/signing/mirror go-live) tracked in docs/R2-DELIVERY.md.

## Self-Review (spec coverage)

- §7 installer: already heavy-by-design (assert-native-backend); PR4 adds licenses extraResource — **Task 2**. §7 hosting/feed: **Tasks 2, 3, 10**. §7 model CDN: **Tasks 7, 8, 10**. §8·PR4 packaging CI: config honesty rails in the existing gate (**Task 2**) + dormant-workflow R2 hook (**Task 10**) — no heavy CI by global constraint. §9 `VS_REAL_SMOKE`: **Task 9**. §10 Q1/Q3: **Task 10**. Web-installer stub: explicitly deferred with rationale (**Task 10**), surfaced in the PR body for Rocky's sign-off.
- Placeholder scan: all code steps carry real code or exact behavioral contracts bound to APIs verified in-repo (`ProgressSink`, `map_hf_exception`, `_CIVITAI_TIMEOUT`, `getMainWindow`, `registerMainIpcHandlers`); no TBDs.
- Type consistency: `UpdaterStatus` defined once (Task 4) and consumed by Tasks 5–6; `mirror` stanza shape identical in Tasks 7–8; feed URL/key-prefix pair asserted consistent by Tasks 2–3 tests.
