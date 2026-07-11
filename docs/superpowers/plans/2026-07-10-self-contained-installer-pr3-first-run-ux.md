# Self-Contained Installer — PR3: First-Run Provisioning UX + About > Licenses

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (inline execution — no subagents, per Rocky's standing instruction). Steps use checkbox (`- [ ]`) syntax for tracking.

> Executes spec `docs/superpowers/specs/2026-07-06-self-contained-installer-design.md` §6 (UX), §4 (compliance screen), §8·PR3, §9 (UX honesty rails). Builds directly on PR2 (#55): `ProvisionOrchestrator` + `/api/models/provision/*` + `window.electron.provisioning.*` + `ProvisionStatus`/`ProvisionModel` wire types.

**Goal:** A world-class first-run experience — the renderer detects the incomplete auto-set, presents a one-click "install everything" screen with honest progress / pause / resume / retry / continue-in-background, surfaces the informed-auto-consent disclosure and a disk pre-flight, adds the verify-and-repair path, and ships the About > Licenses compliance screen with the Stability attribution.

**Architecture:** A `provisioningSlice` (Zustand) owns the `ProvisionStatus` snapshot + first-run-dismissed flag; every user action calls the existing IPC and stores the returned snapshot (the API already returns fresh status from every call — zero invented state). An App-level hook polls only while a job is live. The overlay, Header pill, and Foundry card are pure renderings of that one snapshot. The Licenses screen renders the committed, drift-guarded `THIRD-PARTY-LICENSES.md` via a raw import + tiny purpose-built parser (single source of truth, no new deps). Backend delta is minimal: rows gain `format`/`gated` (so the disclosure is data-derived, never hardcoded) and the PR2-deferred `reverify` action gets its endpoint.

**Tech Stack:** React 19 + TypeScript + Zustand (`useShallow`) + Tailwind v4 Carbon Pro tokens + lucide-react + Vitest/RTL; FastAPI + pytest (stub-CI-safe); Playwright (guard spec only).

## Global Constraints

- **No progress theater.** Progress renders exclusively from store snapshots; no timer ever advances a bar. Component tests assert fake-timer advancement alone changes nothing (spec §9).
- **Informed auto-consent must be visible before Install** (locked 2026-07-07): the disclosure derives the pickle list from live rows (`format === 'pickle'`) — never hardcoded names.
- **Honest disabled/error/empty states** for every control; a disk-blocked Install is disabled with the exact GB shortfall; gated rows surface their `gate_url`.
- **DESIGN.md governs all UI:** `.mono-label` for labels, `.raised-panel`/`.recessed-well`/`.btn-chrome` depth (one layer per element), machined radii (2/4/8, never 16), lucide icons only, no emoji and no decorative middot/em-dash/bullet glyphs in `src/` (`ui-glyphs.test.ts`), no `--spacing-*` tokens.
- **Stub-CI-safe backend:** new backend tests import no torch, hit no network; pytest via `backend/venv/Scripts/python.exe` (bare `python` is a dep-less 3.14).
- **IPC channel names stay in sync** across `electron/preload.ts`, `electron/ipc-handlers/generation.ts`, and `src/types/electron.d.ts`.
- Multi-field store selectors use `useShallow`. RTL: wrap post-render `useAppStore.setState` in `act()` before firing events on store-gated controls.
- Commit via the **Bash tool** with `export PATH="/c/Program Files/nodejs:$PATH"` and `git branch --show-current` in the same call; never `git add -A`; never stage the untracked `LICENSE.txt`. Pre-commit runs the full vitest suite + typecheck (slow — expected).
- Branch: `feat/installer-first-run-ux` from current `main`.

## File Map

| File | Role |
|---|---|
| M `backend/foundry/provision_orchestrator.py` | rows gain `format` (registry lookup) + `gated` (manifest passthrough) |
| M `backend/foundry/schemas.py` | `ProvisionModelSchema` += `format`, `gated` |
| M `backend/main.py` | `reverify` joins the provision control actions |
| M `backend/tests/test_provision_orchestrator.py` / `test_provision_api.py` | new coverage |
| M `electron/preload.ts`, `electron/ipc-handlers/generation.ts`, `src/types/electron.d.ts` | `provisioning.reverify()` |
| M `src/types/model.ts` | `ProvisionModel` += `format`, `gated` |
| M `src/utils/formatUtils.ts` (+test) | shared `formatBytes` / `formatSpeed` / `formatEta` |
| M `src/components/foundry/DownloadRow.tsx` | consume shared formatters (drop local copies) |
| C `src/store/slices/provisioningSlice.ts` (+test) | snapshot + actions + `hasLiveProvisionJob` |
| M `src/store/appStore.types.ts`, `src/store/appStore.ts` | compose slice; persist `firstRunProvisionDismissed` |
| C `src/hooks/useProvisioningStatus.ts` (+test) | backend-up fetch + live-job poll |
| C `src/components/provisioning/FirstRunProvisioning.tsx` (+test) | the first-run overlay (+ pure `diskCheck`) |
| M `src/App.tsx` | mount hook + overlay |
| M `src/components/layout/Header.tsx` (+ C test) | provisioning status pill case |
| C `src/components/foundry/ProvisioningCard.tsx` (+test); M `src/pages/FoundryPage.tsx` | durable re-entry + verify-and-repair |
| C `src/features/licenses/parseLicensesMarkdown.ts` (+test) | pure md-section parser |
| C `src/components/settings/AboutSection.tsx` (+test); M `src/pages/SettingsPanel.tsx` | About tab + Licenses screen + attribution |
| C `tests/e2e/first-run-overlay.spec.ts` | overlay-absent-without-backend guard |

---

### Task 1: Branch + plan doc

- [ ] **Step 1:** `git checkout -b feat/installer-first-run-ux` (verify `git branch --show-current` prints it).
- [ ] **Step 2:** Commit this document.

```bash
git add docs/superpowers/plans/2026-07-10-self-contained-installer-pr3-first-run-ux.md
git commit -m "docs(installer): PR3 first-run UX plan"
```

---

### Task 2: Backend — rows carry `format` + `gated`

The disclosure and gated-model notice must derive from data. `gated` already sits on every manifest entry (pure passthrough); `format` lives on the registry record, so `status()` passes a lookup map into the pure `model_rows`.

**Files:**
- Modify: `backend/foundry/provision_orchestrator.py` (`model_rows`, `ProvisionOrchestrator.status`)
- Modify: `backend/foundry/schemas.py:67-79` (`ProvisionModelSchema`)
- Test: `backend/tests/test_provision_orchestrator.py`

**Interfaces:**
- Produces: `model_rows(entries, jobs_by_id, present_ids, formats_by_id=None)`; each row dict += `"format": Optional[str]`, `"gated": bool`. `ProvisionModelSchema.format: Optional[str] = None`, `.gated: bool = False`. Task 4's TS wire type mirrors this exactly.

- [ ] **Step 1: Write the failing tests** — append to `ModelRowsTests` in `backend/tests/test_provision_orchestrator.py` (the existing `_entry` helper spreads `**kw`, so `gated=True` needs adding to the helper dict — extend `_entry` with `"gated": kw.get("gated", False)`):

```python
    def test_rows_carry_format_and_gated(self):
        entries = [
            _entry("edit-gfpgan-v14", gated=False),
            _entry("sd3.5-large", gated=True),
            _entry("plain"),
        ]
        formats = {"edit-gfpgan-v14": "pickle", "sd3.5-large": "safetensors"}
        rows = {r["id"]: r for r in po.model_rows(entries, {}, set(), formats_by_id=formats)}
        self.assertEqual(rows["edit-gfpgan-v14"]["format"], "pickle")
        self.assertFalse(rows["edit-gfpgan-v14"]["gated"])
        self.assertTrue(rows["sd3.5-large"]["gated"])
        self.assertIsNone(rows["plain"]["format"])  # unknown format -> None

    def test_rows_default_format_none_without_map(self):
        rows = po.model_rows([_entry("a")], {}, set())
        self.assertIsNone(rows[0]["format"])
        self.assertFalse(rows[0]["gated"])
```

And to `OrchestratorTests` (status threads registry formats):

```python
    def test_status_rows_carry_registry_format(self):
        entries = [_entry("edit-gfpgan-v14")]
        records = {"edit-gfpgan-v14": {
            "id": "edit-gfpgan-v14", "status": "not_found", "format": "pickle"}}
        orch, *_ = self._orch(entries, records)
        row = orch.status()["models"][0]
        self.assertEqual(row["format"], "pickle")
```

- [ ] **Step 2:** Run: `backend/venv/Scripts/python.exe -m pytest backend/tests/test_provision_orchestrator.py -q` — expected: FAIL (`KeyError: 'format'` / unexpected kwarg).
- [ ] **Step 3: Implement.** In `provision_orchestrator.py`:

```python
def model_rows(
    entries: List[Dict[str, Any]],
    jobs_by_id: Dict[str, Any],
    present_ids: Set[str],
    formats_by_id: Optional[Dict[str, Optional[str]]] = None,
) -> List[Dict[str, Any]]:
    """Per-model status rows for the first-run screen."""
    formats = formats_by_id or {}
    rows: List[Dict[str, Any]] = []
    for entry in entries:
        job = jobs_by_id.get(entry["id"])
        rows.append({
            "id": entry["id"],
            "name": entry.get("name") or entry["id"],
            "license": entry.get("license"),
            "attribution": entry.get("attribution"),
            "approx_bytes": int(entry.get("approx_bytes") or 0),
            # Registry-known weight format (pickle/safetensors/onnx) so the
            # first-run disclosure derives the informed-auto-consent list from
            # data, and manifest 'gated' so HF-account needs surface pre-start.
            "format": formats.get(entry["id"]),
            "gated": bool(entry.get("gated", False)),
            "status": _status_for(entry, job, present_ids),
            "progress": round(_fraction_done(entry, job, present_ids), 6),
            "error": getattr(job, "error", None) if job is not None else None,
            "gate_url": getattr(job, "gate_url", None) if job is not None else None,
        })
    return rows
```

In `ProvisionOrchestrator`, add below `_jobs_by_id` and thread into `status()`:

```python
    def _formats_by_id(self) -> Dict[str, Optional[str]]:
        formats: Dict[str, Optional[str]] = {}
        for entry in self._entries:
            record = self._registry.get_record(entry["id"]) or {}
            formats[entry["id"]] = record.get("format")
        return formats

    def status(self) -> Dict[str, Any]:
        present = self.present_ids()
        jobs = self._jobs_by_id()
        payload = aggregate(self._entries, jobs, present)
        payload["schema_version"] = SCHEMA
        payload["attribution"] = set_attribution(self._entries)
        payload["models"] = model_rows(
            self._entries, jobs, present, formats_by_id=self._formats_by_id())
        return payload
```

In `schemas.py` `ProvisionModelSchema`, after `approx_bytes`:

```python
    format: Optional[str] = None
    gated: bool = False
```

- [ ] **Step 4:** Run: `backend/venv/Scripts/python.exe -m pytest backend/tests/test_provision_orchestrator.py backend/tests/test_provision_api.py -q` — expected: PASS.
- [ ] **Step 5: Commit:** `git add backend/foundry/provision_orchestrator.py backend/foundry/schemas.py backend/tests/test_provision_orchestrator.py && git commit -m "feat(installer): provision rows carry weight format + gated flag"`

---

### Task 3: Backend — `reverify` control action

PR2 implemented + unit-tested `start(reverify=True)`; this exposes it. It joins the existing dynamic control route (no route-ordering hazard — same literal prefix).

**Files:**
- Modify: `backend/main.py:1886-1898` (`provision_control_endpoint`)
- Test: `backend/tests/test_provision_api.py`

**Interfaces:**
- Produces: `POST /api/models/provision/reverify` → 200 `ProvisionStatusSchema`; forwards `X-HF-Token`; calls `orchestrator.start(hf_token=..., reverify=True)`. Task 4's IPC handler posts to it.

- [ ] **Step 1: Write the failing tests** — append to `ProvisionApiTests`:

```python
    def test_reverify_calls_start_with_reverify_true(self):
        with mock.patch.object(main.provision_orchestrator, "start", return_value=_SNAPSHOT) as start:
            response = client.post(
                "/api/models/provision/reverify", headers={"X-HF-Token": "hf_TT"})
        self.assertEqual(response.status_code, 200)
        _args, kwargs = start.call_args
        self.assertTrue(kwargs.get("reverify"))
        self.assertEqual(kwargs.get("hf_token"), "hf_TT")

    def test_resume_does_not_reverify(self):
        with mock.patch.object(main.provision_orchestrator, "start", return_value=_SNAPSHOT) as start:
            client.post("/api/models/provision/resume")
        _args, kwargs = start.call_args
        self.assertFalse(kwargs.get("reverify", False))
```

- [ ] **Step 2:** Run: `backend/venv/Scripts/python.exe -m pytest backend/tests/test_provision_api.py -q` — expected: FAIL (404 on reverify).
- [ ] **Step 3: Implement** — replace the body of `provision_control_endpoint`:

```python
    if action not in {"pause", "resume", "cancel", "reverify"}:
        raise HTTPException(status_code=404, detail=f"Unknown action '{action}'")
    if action == "resume":
        return provision_orchestrator.start(hf_token=request.headers.get("X-HF-Token"))
    if action == "reverify":
        # PR2-deferred repair path: re-hash present direct-URL entries against
        # the manifest sha256 and re-fetch any corrupt copy (spec 6, PR3).
        return provision_orchestrator.start(
            hf_token=request.headers.get("X-HF-Token"), reverify=True)
    return getattr(provision_orchestrator, action)()
```

Also extend the docstring line to mention reverify. Update `_SNAPSHOT` in `test_provision_api.py` — the model row gains `"format": None, "gated": False` (schema tolerance, keeps fixture representative).

- [ ] **Step 4:** Run: `backend/venv/Scripts/python.exe -m pytest backend/tests -q` — expected: PASS (+ existing skips).
- [ ] **Step 5: Commit:** `git add backend/main.py backend/tests/test_provision_api.py && git commit -m "feat(installer): provision reverify endpoint (verify-and-repair)"`

---

### Task 4: IPC bridge `reverify` + TS wire types

**Files:**
- Modify: `electron/preload.ts:332-338` (type) + `:469-475` (impl)
- Modify: `electron/ipc-handlers/generation.ts` (after the `provision:cancel` handler, ~line 1132)
- Modify: `src/types/electron.d.ts:440-446`
- Modify: `src/types/model.ts:239-249` (`ProvisionModel`)

**Interfaces:**
- Produces: `window.electron.provisioning.reverify(): Promise<ProvisionStatus | {success:false; error:string}>` over channel `provision:reverify`; `ProvisionModel` += `format: string | null; gated: boolean;`. Tasks 6–12 consume both.

- [ ] **Step 1:** preload type block — add `reverify: () => Promise<any>;`; impl block — add `reverify: () => ipcRenderer.invoke('provision:reverify'),`.
- [ ] **Step 2:** `generation.ts` — after the `provision:cancel` handler:

```ts
ipcMain.handle('provision:reverify', async () => {
  try {
    const response = await requestBackend(() =>
      axios.post(`${BACKEND_URL}/api/models/provision/reverify`, undefined, {
        // Reverify re-runs start(): the HF token is forwarded for any gated
        // auto-set model a repair re-fetch may need.
        headers: { ...backendAuthHeaders(), ...hfTokenHeaders() },
      }),
    );
    return response.data;
  } catch (error: any) {
    console.error('Provision reverify error:', error instanceof Error ? error.message : error);
    return { success: false, error: toSafeRendererError(error, 'Provision verify failed') };
  }
});
```

- [ ] **Step 3:** `src/types/electron.d.ts` provisioning block — add `reverify: () => Promise<ProvisionStatus | { success: false; error: string }>;` and extend the block comment: reverify re-hashes present direct-URL weights and re-fetches corrupt copies.
- [ ] **Step 4:** `src/types/model.ts` `ProvisionModel` — after `approx_bytes`:

```ts
  /** Registry weight format (e.g. 'pickle' | 'safetensors' | 'onnx'); null when unknown. */
  format: string | null;
  /** Upstream repo is license-gated (needs an HF account/token). */
  gated: boolean;
```

- [ ] **Step 5:** Run: `npm run typecheck` — expected: PASS.
- [ ] **Step 6: Commit:** `git add electron/preload.ts electron/ipc-handlers/generation.ts src/types/electron.d.ts src/types/model.ts && git commit -m "feat(installer): provisioning reverify IPC + format/gated wire types"`

---

### Task 5: Shared formatters (`formatBytes` / `formatSpeed` / `formatEta`)

`DownloadRow` owns private `formatSpeed`/`formatEta`; the provisioning surfaces need those plus `formatBytes`, and multi-hour ETAs need an hours form. Extract + extend, DRY.

**Files:**
- Modify: `src/utils/formatUtils.ts`
- Modify: `src/components/foundry/DownloadRow.tsx:12-31` (delete local helpers, import shared)
- Test: `src/utils/formatUtils.test.ts` (create)

**Interfaces:**
- Produces: `formatBytes(bytes: number): string` ("128.4 GB", 1024-based, "0 B" for <=0); `formatSpeed(bytesPerSecond: number): string` ("12.4 MB/s", '' for <=0); `formatEta(seconds: number | null): string` ("1h 12m left" >= 1h, "4:32 left" < 1h, '' unknown). Consumed by Tasks 8–10.

- [ ] **Step 1: Write the failing tests** — `src/utils/formatUtils.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatBytes, formatEta, formatSpeed } from './formatUtils';

describe('formatBytes', () => {
  it('walks binary units', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(4 * 1024 ** 2)).toBe('4.0 MB');
    expect(formatBytes(137_975_824_384)).toBe('128.5 GB');
  });
  it('zero and negatives read as 0 B', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-5)).toBe('0 B');
  });
});

describe('formatSpeed', () => {
  it('formats bytes/second', () => {
    expect(formatSpeed(12.4 * 1024 ** 2)).toBe('12.4 MB/s');
  });
  it('empty when idle', () => {
    expect(formatSpeed(0)).toBe('');
  });
});

describe('formatEta', () => {
  it('minutes:seconds under an hour', () => {
    expect(formatEta(272)).toBe('4:32 left');
  });
  it('hours form at an hour and beyond', () => {
    expect(formatEta(4_320)).toBe('1h 12m left');
  });
  it('empty when unknown or non-positive', () => {
    expect(formatEta(null)).toBe('');
    expect(formatEta(0)).toBe('');
    expect(formatEta(Number.NaN)).toBe('');
  });
});
```

- [ ] **Step 2:** Run: `npx vitest run src/utils/formatUtils.test.ts` — expected: FAIL (not exported).
- [ ] **Step 3: Implement** — append to `src/utils/formatUtils.ts`:

```ts
const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/** Human-readable byte size, 1024-based (matches the Foundry's GB convention). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return unit === 0 ? `${Math.round(value)} B` : `${value.toFixed(1)} ${BYTE_UNITS[unit]}`;
}

/** Format a bytes/second rate as a human string, e.g. "12.4 MB/s". */
export function formatSpeed(bytesPerSecond: number): string {
  if (!bytesPerSecond || bytesPerSecond <= 0) return '';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  let value = bytesPerSecond;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

/** Seconds-to-go as "1h 12m left" / "4:32 left" / '' when unknown. */
export function formatEta(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return '';
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m left`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')} left`;
}
```

In `DownloadRow.tsx`: delete the two local helpers (lines 12-31) and add `import { formatEta, formatSpeed } from '@/utils/formatUtils';`.

- [ ] **Step 4:** Run: `npx vitest run src/utils/formatUtils.test.ts src/components/foundry/DownloadRow.test.tsx` — expected: PASS.
- [ ] **Step 5: Commit:** `git add src/utils/formatUtils.ts src/utils/formatUtils.test.ts src/components/foundry/DownloadRow.tsx && git commit -m "refactor(foundry): shared byte/speed/eta formatters"`

---

### Task 6: `provisioningSlice`

**Files:**
- Create: `src/store/slices/provisioningSlice.ts`
- Modify: `src/store/appStore.types.ts` (AppState fields + actions; import `ProvisionStatus`)
- Modify: `src/store/appStore.ts` (compose slice; partialize `firstRunProvisionDismissed`)
- Test: `src/store/slices/provisioningSlice.test.ts`

**Interfaces:**
- Consumes: `window.electron.provisioning.{status,start,pause,resume,cancel,reverify}` (Task 4).
- Produces (AppState):
  - `provisionStatus: ProvisionStatus | null` (last-known snapshot; transient)
  - `provisionBusy: boolean` (one in-flight user action at a time)
  - `provisionActionError: string | null` (surfaced envelope failure from a user action)
  - `firstRunProvisionDismissed: boolean` (persisted)
  - `refreshProvisionStatus() / startProvisioning() / pauseProvisioning() / resumeProvisioning() / cancelProvisioning() / reverifyProvisioning(): Promise<void>`
  - `dismissFirstRunProvisioning() / openFirstRunProvisioning(): void`
  - module exports: `isProvisionStatus(v: unknown): v is ProvisionStatus`, `hasLiveProvisionJob(status: ProvisionStatus | null): boolean`, `provisioningInitialState`, `createProvisioningActions`.

- [ ] **Step 1: Write the failing tests** — `src/store/slices/provisioningSlice.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../appStore';
import { hasLiveProvisionJob, provisioningInitialState } from './provisioningSlice';
import type { ProvisionModel, ProvisionStatus } from '@/types/model';

function model(over: Partial<ProvisionModel> = {}): ProvisionModel {
  return {
    id: 'sd-1-5', name: 'Stable Diffusion 1.5', license: 'creativeml-openrail-m',
    attribution: null, approx_bytes: 100, format: null, gated: false,
    status: 'missing', progress: 0, error: null, gate_url: null, ...over,
  };
}

function snapshot(over: Partial<ProvisionStatus> = {}): ProvisionStatus {
  return {
    schema_version: 1, overall_progress: 0.5, total_bytes: 200, present_bytes: 100,
    remaining_bytes: 100, speed: 0, eta: null, total_count: 2, ready_count: 1,
    active_count: 0, error_count: 0, complete: false,
    attribution: 'Powered by Stability AI', models: [model()], ...over,
  };
}

function stubProvisioning(overrides: Record<string, ReturnType<typeof vi.fn>> = {}) {
  const bridge = {
    status: vi.fn().mockResolvedValue(snapshot()),
    start: vi.fn().mockResolvedValue(snapshot({ active_count: 1 })),
    pause: vi.fn().mockResolvedValue(snapshot()),
    resume: vi.fn().mockResolvedValue(snapshot()),
    cancel: vi.fn().mockResolvedValue(snapshot()),
    reverify: vi.fn().mockResolvedValue(snapshot()),
    ...overrides,
  };
  (globalThis as any).window = { electron: { provisioning: bridge } };
  return bridge;
}

describe('provisioningSlice', () => {
  beforeEach(() => {
    useAppStore.setState({ ...provisioningInitialState });
  });

  it('refreshProvisionStatus stores a valid snapshot', async () => {
    stubProvisioning();
    await useAppStore.getState().refreshProvisionStatus();
    expect(useAppStore.getState().provisionStatus?.total_count).toBe(2);
  });

  it('refresh keeps the last-known snapshot on an envelope failure', async () => {
    useAppStore.setState({ provisionStatus: snapshot({ ready_count: 2 }) });
    stubProvisioning({ status: vi.fn().mockResolvedValue({ success: false, error: 'down' }) });
    await useAppStore.getState().refreshProvisionStatus();
    expect(useAppStore.getState().provisionStatus?.ready_count).toBe(2);
  });

  it('refresh swallows a rejected bridge call (local-first)', async () => {
    useAppStore.setState({ provisionStatus: snapshot() });
    stubProvisioning({ status: vi.fn().mockRejectedValue(new Error('ipc')) });
    await useAppStore.getState().refreshProvisionStatus();
    expect(useAppStore.getState().provisionStatus).not.toBeNull();
  });

  it('startProvisioning stores the returned snapshot and clears the action error', async () => {
    useAppStore.setState({ provisionActionError: 'stale' });
    const bridge = stubProvisioning();
    await useAppStore.getState().startProvisioning();
    expect(bridge.start).toHaveBeenCalledOnce();
    expect(useAppStore.getState().provisionStatus?.active_count).toBe(1);
    expect(useAppStore.getState().provisionActionError).toBeNull();
    expect(useAppStore.getState().provisionBusy).toBe(false);
  });

  it('a user action surfaces an envelope failure (never vanishes)', async () => {
    stubProvisioning({ start: vi.fn().mockResolvedValue({ success: false, error: 'no space' }) });
    await useAppStore.getState().startProvisioning();
    expect(useAppStore.getState().provisionActionError).toBe('no space');
  });

  it('busy guard drops a second concurrent action', async () => {
    let release: (v: ProvisionStatus) => void = () => {};
    const gate = new Promise<ProvisionStatus>((resolve) => { release = resolve; });
    const bridge = stubProvisioning({ start: vi.fn().mockReturnValue(gate) });
    const first = useAppStore.getState().startProvisioning();
    await useAppStore.getState().startProvisioning(); // dropped by the guard
    release(snapshot());
    await first;
    expect(bridge.start).toHaveBeenCalledOnce();
  });

  it('pause / resume / cancel / reverify dispatch to their channels', async () => {
    const bridge = stubProvisioning();
    await useAppStore.getState().pauseProvisioning();
    await useAppStore.getState().resumeProvisioning();
    await useAppStore.getState().cancelProvisioning();
    await useAppStore.getState().reverifyProvisioning();
    expect(bridge.pause).toHaveBeenCalledOnce();
    expect(bridge.resume).toHaveBeenCalledOnce();
    expect(bridge.cancel).toHaveBeenCalledOnce();
    expect(bridge.reverify).toHaveBeenCalledOnce();
  });

  it('dismiss and open toggle the persisted first-run flag', () => {
    useAppStore.getState().dismissFirstRunProvisioning();
    expect(useAppStore.getState().firstRunProvisionDismissed).toBe(true);
    useAppStore.getState().openFirstRunProvisioning();
    expect(useAppStore.getState().firstRunProvisionDismissed).toBe(false);
  });
});

describe('hasLiveProvisionJob', () => {
  it('true only for queued/downloading/verifying rows', () => {
    expect(hasLiveProvisionJob(null)).toBe(false);
    expect(hasLiveProvisionJob(snapshot({ models: [model({ status: 'paused' })] }))).toBe(false);
    expect(hasLiveProvisionJob(snapshot({ models: [model({ status: 'downloading' })] }))).toBe(true);
    expect(hasLiveProvisionJob(snapshot({ models: [model({ status: 'queued' })] }))).toBe(true);
    expect(hasLiveProvisionJob(snapshot({ models: [model({ status: 'verifying' })] }))).toBe(true);
  });
});
```

- [ ] **Step 2:** Run: `npx vitest run src/store/slices/provisioningSlice.test.ts` — expected: FAIL (module missing).
- [ ] **Step 3: Implement** — `src/store/slices/provisioningSlice.ts`:

```ts
import type { AppSet, AppGet } from '../appStore.types';
import type { ProvisionStatus } from '@/types/model';

/**
 * #34 installer PR3: first-run auto-provisioning state.
 *
 * The backend orchestrator is the single source of truth - every action
 * returns a fresh ProvisionStatus snapshot which is stored verbatim. The
 * renderer never invents progress (no progress theater, spec 9).
 */
export const provisioningInitialState = {
  // Last-known snapshot. Transient - excluded from the persist allowlist.
  provisionStatus: null as ProvisionStatus | null,
  // One in-flight user action at a time (start/pause/resume/cancel/reverify).
  provisionBusy: false,
  // Envelope failure from a user action. Unlike the local-first refresh
  // swallow, a failed user action must surface (mirrors consent/convert).
  provisionActionError: null as string | null,
  // First-run overlay dismissal ("Continue in background" / "Skip for now").
  // Persisted so a restart does not re-take-over the workspace.
  firstRunProvisionDismissed: false,
};

/** Runtime guard: an IPC provisioning result is a snapshot, not an error envelope. */
export function isProvisionStatus(value: unknown): value is ProvisionStatus {
  return (
    typeof value === 'object' &&
    value !== null &&
    'schema_version' in value &&
    'models' in value &&
    Array.isArray((value as ProvisionStatus).models)
  );
}

/** Statuses that are actively progressing and warrant continued polling
 * (mirrors ACTIVE_DOWNLOAD_STATUSES in FoundryPage - paused is user-parked). */
const LIVE_STATUSES = new Set(['queued', 'downloading', 'verifying']);

export function hasLiveProvisionJob(status: ProvisionStatus | null): boolean {
  return status !== null && status.models.some((m) => LIVE_STATUSES.has(m.status));
}

type ProvisioningBridge = NonNullable<Window['electron']>['provisioning'];

export function createProvisioningActions(set: AppSet, get: AppGet) {
  const mergeSnapshot = (result: unknown) => {
    if (isProvisionStatus(result)) {
      set({ provisionStatus: result, provisionActionError: null });
      return true;
    }
    return false;
  };

  /** User actions share one shape: busy-guarded, snapshot-merged, error-surfaced. */
  const action = (invoke: (bridge: ProvisioningBridge) => Promise<unknown>) => async () => {
    const bridge = window.electron?.provisioning;
    if (!bridge || get().provisionBusy) return;
    set({ provisionBusy: true });
    try {
      const result = await invoke(bridge);
      if (!mergeSnapshot(result)) {
        const error =
          typeof result === 'object' && result !== null && 'error' in result
            ? String((result as { error: unknown }).error)
            : 'Provisioning request failed';
        set({ provisionActionError: error });
      }
    } catch {
      set({ provisionActionError: 'Provisioning request failed' });
    } finally {
      set({ provisionBusy: false });
    }
  };

  return {
    refreshProvisionStatus: async () => {
      const bridge = window.electron?.provisioning;
      if (!bridge) return;
      try {
        mergeSnapshot(await bridge.status());
        // Envelope failure: keep the last-known snapshot (local-first).
      } catch {
        // Local-first: an IPC hiccup must not wipe known provisioning state.
      }
    },
    startProvisioning: action((bridge) => bridge.start()),
    pauseProvisioning: action((bridge) => bridge.pause()),
    resumeProvisioning: action((bridge) => bridge.resume()),
    cancelProvisioning: action((bridge) => bridge.cancel()),
    reverifyProvisioning: action((bridge) => bridge.reverify()),
    dismissFirstRunProvisioning: () => set({ firstRunProvisionDismissed: true }),
    openFirstRunProvisioning: () => set({ firstRunProvisionDismissed: false }),
  };
}
```

- [ ] **Step 4:** Wire into the store. `appStore.types.ts`: add `ProvisionStatus` to the `@/types/model` type-import list; add the state fields under a `// ─── Provisioning (#34 installer PR3) ───` group and the eight action signatures under Actions (exact signatures from Interfaces above). `appStore.ts`: import + spread `...provisioningInitialState, ...createProvisioningActions(set, get)` after the models slice; add `firstRunProvisionDismissed: state.firstRunProvisionDismissed,` to `partialize`.
- [ ] **Step 5:** Run: `npx vitest run src/store/slices/provisioningSlice.test.ts src/store/appStore.test.ts && npm run typecheck` — expected: PASS.
- [ ] **Step 6: Commit:** `git add src/store/slices/provisioningSlice.ts src/store/slices/provisioningSlice.test.ts src/store/appStore.types.ts src/store/appStore.ts && git commit -m "feat(installer): provisioning store slice with persisted first-run dismissal"`

---

### Task 7: `useProvisioningStatus` hook

App-level: fetch when the backend comes up; re-arm a 2.5s poll only while a job is live (paused/terminal sets stop polling — next change is user-driven, mirroring the FoundryPage poller).

**Files:**
- Create: `src/hooks/useProvisioningStatus.ts`
- Test: `src/hooks/useProvisioningStatus.test.ts`

**Interfaces:**
- Consumes: `systemInfo.backendConnected`, `provisionStatus`, `refreshProvisionStatus` (Task 6), `hasLiveProvisionJob`.
- Produces: `useProvisioningStatus(): void` + `PROVISION_POLL_INTERVAL_MS = 2500`. Mounted once in `App` (Task 8).

- [ ] **Step 1: Write the failing tests** — `src/hooks/useProvisioningStatus.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAppStore } from '@/store/appStore';
import { provisioningInitialState } from '@/store/slices/provisioningSlice';
import { PROVISION_POLL_INTERVAL_MS, useProvisioningStatus } from './useProvisioningStatus';
import type { ProvisionModel, ProvisionStatus } from '@/types/model';

function model(over: Partial<ProvisionModel> = {}): ProvisionModel {
  return {
    id: 'sd-1-5', name: 'Stable Diffusion 1.5', license: null, attribution: null,
    approx_bytes: 100, format: null, gated: false, status: 'missing',
    progress: 0, error: null, gate_url: null, ...over,
  };
}

function snapshot(over: Partial<ProvisionStatus> = {}): ProvisionStatus {
  return {
    schema_version: 1, overall_progress: 0, total_bytes: 100, present_bytes: 0,
    remaining_bytes: 100, speed: 0, eta: null, total_count: 1, ready_count: 0,
    active_count: 0, error_count: 0, complete: false, attribution: null,
    models: [model()], ...over,
  };
}

describe('useProvisioningStatus', () => {
  let statusMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    statusMock = vi.fn().mockResolvedValue(snapshot());
    window.electron = { provisioning: { status: statusMock } } as unknown as Window['electron'];
    useAppStore.setState({
      ...provisioningInitialState,
      systemInfo: { ...useAppStore.getState().systemInfo, backendConnected: false },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches once the backend connects', async () => {
    renderHook(() => useProvisioningStatus());
    expect(statusMock).not.toHaveBeenCalled();
    await act(async () => {
      useAppStore.setState({
        systemInfo: { ...useAppStore.getState().systemInfo, backendConnected: true },
      });
    });
    expect(statusMock).toHaveBeenCalledOnce();
  });

  it('re-polls while a job is live', async () => {
    renderHook(() => useProvisioningStatus());
    await act(async () => {
      useAppStore.setState({
        provisionStatus: snapshot({ models: [model({ status: 'downloading' })] }),
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PROVISION_POLL_INTERVAL_MS);
    });
    expect(statusMock).toHaveBeenCalled();
  });

  it('does not poll a paused set', async () => {
    renderHook(() => useProvisioningStatus());
    await act(async () => {
      useAppStore.setState({
        provisionStatus: snapshot({ models: [model({ status: 'paused' })] }),
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PROVISION_POLL_INTERVAL_MS * 3);
    });
    expect(statusMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2:** Run: `npx vitest run src/hooks/useProvisioningStatus.test.ts` — expected: FAIL (module missing).
- [ ] **Step 3: Implement** — `src/hooks/useProvisioningStatus.ts`:

```ts
import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/appStore';
import { hasLiveProvisionJob } from '@/store/slices/provisioningSlice';

/** How often the auto-set snapshot is re-polled while a download is in flight
 * (matches the Foundry download-queue poller cadence). */
export const PROVISION_POLL_INTERVAL_MS = 2500;

/**
 * #34 installer PR3: app-level provisioning status keeper.
 *
 * Fetches the auto-set snapshot whenever the backend comes up, then re-arms a
 * short poll only while a provisioning job is actually moving. Paused and
 * terminal sets stop polling - the next state change is user-driven and every
 * user action already returns a fresh snapshot.
 */
export function useProvisioningStatus(): void {
  const { backendConnected, provisionStatus, refreshProvisionStatus } = useAppStore(
    useShallow((s) => ({
      backendConnected: s.systemInfo.backendConnected,
      provisionStatus: s.provisionStatus,
      refreshProvisionStatus: s.refreshProvisionStatus,
    })),
  );

  useEffect(() => {
    if (!backendConnected || !window.electron?.provisioning) return;
    void refreshProvisionStatus();
  }, [backendConnected, refreshProvisionStatus]);

  useEffect(() => {
    if (!hasLiveProvisionJob(provisionStatus)) return;
    const timer = setTimeout(() => {
      void refreshProvisionStatus();
    }, PROVISION_POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [provisionStatus, refreshProvisionStatus]);
}
```

- [ ] **Step 4:** Run: `npx vitest run src/hooks/useProvisioningStatus.test.ts` — expected: PASS.
- [ ] **Step 5: Commit:** `git add src/hooks/useProvisioningStatus.ts src/hooks/useProvisioningStatus.test.ts && git commit -m "feat(installer): app-level provisioning status poll hook"`

---

### Task 8: `FirstRunProvisioning` overlay + App mount

The centerpiece. A full-screen takeover shown only when a **valid** snapshot proves the set incomplete and the user has not dismissed it. Pre-start: summary, disk pre-flight, the informed-auto-consent disclosure, one-click Install. Active: aggregate + per-model progress, pause/resume/retry-failed, cancel (confirmed), continue-in-background. Every state renders purely from the store.

**Files:**
- Create: `src/components/provisioning/FirstRunProvisioning.tsx`
- Modify: `src/App.tsx` (mount hook + overlay)
- Test: `src/components/provisioning/FirstRunProvisioning.test.tsx`

**Interfaces:**
- Consumes: Task 6 state/actions; Task 5 formatters; `hardwareProfile` + `loadHardwareProfile` (existing modelsSlice); `ConfirmDialog` (`@/components/ui/ConfirmDialog`: `open/title/message/confirmLabel/cancelLabel/variant/onConfirm/onCancel`); `window.electron.app.openExternal`.
- Produces: `FirstRunProvisioning` component (default overlay); exported pure `diskCheck(freeBytes: number | null, remainingBytes: number): DiskCheck` with `DiskCheck = { level: 'unknown' | 'ok' | 'tight' | 'insufficient'; message: string }`; `STABILITY_LICENSE_URL`. Test ids: `first-run-provisioning`, `provision-install`, `provision-background`, `provision-skip`, `provision-pause`, `provision-resume`, `provision-retry`, `provision-cancel`, `provision-disk-recheck`, `provision-disclosure`, `provision-row-<id>`.

- [ ] **Step 1: Write the failing tests** — `src/components/provisioning/FirstRunProvisioning.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useAppStore } from '@/store/appStore';
import { provisioningInitialState } from '@/store/slices/provisioningSlice';
import { FirstRunProvisioning, diskCheck } from './FirstRunProvisioning';
import type { HardwareProfile, ProvisionModel, ProvisionStatus } from '@/types/model';

const GB = 1024 ** 3;

function model(over: Partial<ProvisionModel> = {}): ProvisionModel {
  return {
    id: 'sd-1-5', name: 'Stable Diffusion 1.5', license: 'creativeml-openrail-m',
    attribution: null, approx_bytes: 4 * GB, format: 'safetensors', gated: false,
    status: 'missing', progress: 0, error: null, gate_url: null, ...over,
  };
}

function snapshot(over: Partial<ProvisionStatus> = {}): ProvisionStatus {
  return {
    schema_version: 1, overall_progress: 0, total_bytes: 8 * GB, present_bytes: 0,
    remaining_bytes: 8 * GB, speed: 0, eta: null, total_count: 2, ready_count: 0,
    active_count: 0, error_count: 0, complete: false,
    attribution: 'Powered by Stability AI',
    models: [
      model(),
      model({ id: 'edit-gfpgan-v14', name: 'GFPGAN v1.4', format: 'pickle' }),
    ],
    ...over,
  };
}

function hardware(freeBytes: number): HardwareProfile {
  return { disk_free_bytes: freeBytes } as HardwareProfile;
}

function seed(status: ProvisionStatus | null, extra: Record<string, unknown> = {}) {
  useAppStore.setState({ ...provisioningInitialState, provisionStatus: status, ...extra });
}

describe('FirstRunProvisioning visibility', () => {
  beforeEach(() => {
    window.electron = { app: { openExternal: vi.fn() } } as unknown as Window['electron'];
    seed(null);
  });

  it('hidden without a valid snapshot', () => {
    render(<FirstRunProvisioning />);
    expect(screen.queryByTestId('first-run-provisioning')).toBeNull();
  });

  it('hidden when the set is complete', () => {
    seed(snapshot({ complete: true }));
    render(<FirstRunProvisioning />);
    expect(screen.queryByTestId('first-run-provisioning')).toBeNull();
  });

  it('hidden when dismissed', () => {
    seed(snapshot(), { firstRunProvisionDismissed: true });
    render(<FirstRunProvisioning />);
    expect(screen.queryByTestId('first-run-provisioning')).toBeNull();
  });

  it('visible for a valid incomplete snapshot', () => {
    seed(snapshot());
    render(<FirstRunProvisioning />);
    expect(screen.getByTestId('first-run-provisioning')).toBeInTheDocument();
  });
});

describe('pre-start view', () => {
  beforeEach(() => {
    window.electron = { app: { openExternal: vi.fn() } } as unknown as Window['electron'];
    seed(snapshot(), { hardwareProfile: hardware(500 * GB) });
  });

  it('summarizes the set and derives the disclosure from row data', () => {
    render(<FirstRunProvisioning />);
    const disclosure = screen.getByTestId('provision-disclosure');
    expect(disclosure).toHaveTextContent('GFPGAN v1.4'); // pickle list is data-derived
    expect(disclosure).toHaveTextContent('Stability AI Community License');
    expect(screen.getByText(/2 models/)).toBeInTheDocument();
    expect(screen.getByText(/8\.0 GB/)).toBeInTheDocument();
  });

  it('names gated models needing a Hugging Face account', () => {
    seed(snapshot({
      models: [model(), model({ id: 'sd3.5-large', name: 'SD 3.5 Large', gated: true })],
    }), { hardwareProfile: hardware(500 * GB) });
    render(<FirstRunProvisioning />);
    expect(screen.getByTestId('provision-disclosure')).toHaveTextContent(/Hugging Face/);
  });

  it('Install starts provisioning', () => {
    const startProvisioning = vi.fn();
    useAppStore.setState({ startProvisioning });
    render(<FirstRunProvisioning />);
    fireEvent.click(screen.getByTestId('provision-install'));
    expect(startProvisioning).toHaveBeenCalledOnce();
  });

  it('Skip dismisses the overlay', () => {
    render(<FirstRunProvisioning />);
    fireEvent.click(screen.getByTestId('provision-skip'));
    expect(useAppStore.getState().firstRunProvisionDismissed).toBe(true);
  });

  it('blocks Install with the exact shortfall when disk is insufficient', () => {
    seed(snapshot(), { hardwareProfile: hardware(1 * GB) });
    render(<FirstRunProvisioning />);
    expect(screen.getByTestId('provision-install')).toBeDisabled();
    expect(screen.getByText(/Not enough disk space/)).toBeInTheDocument();
    expect(screen.getByTestId('provision-disk-recheck')).toBeInTheDocument();
  });
});

describe('active view', () => {
  beforeEach(() => {
    window.electron = { app: { openExternal: vi.fn() } } as unknown as Window['electron'];
    seed(snapshot({
      overall_progress: 0.42, active_count: 1, speed: 10 * 1024 ** 2, eta: 600,
      models: [
        model({ status: 'ready', progress: 1 }),
        model({ id: 'edit-gfpgan-v14', name: 'GFPGAN v1.4', status: 'downloading', progress: 0.5 }),
      ],
    }));
  });

  it('renders aggregate progress from the snapshot only', () => {
    render(<FirstRunProvisioning />);
    const bar = screen.getByRole('progressbar', { name: /overall/i });
    expect(bar).toHaveAttribute('aria-valuenow', '42');
  });

  it('fake timers alone never advance progress (no progress theater)', () => {
    vi.useFakeTimers();
    render(<FirstRunProvisioning />);
    const bar = screen.getByRole('progressbar', { name: /overall/i });
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(bar).toHaveAttribute('aria-valuenow', '42');
    vi.useRealTimers();
  });

  it('renders per-model rows with honest statuses', () => {
    render(<FirstRunProvisioning />);
    expect(screen.getByTestId('provision-row-sd-1-5')).toHaveTextContent(/ready/i);
    expect(screen.getByTestId('provision-row-edit-gfpgan-v14')).toHaveTextContent(/downloading/i);
  });

  it('surfaces a gated row with an Accept license action', () => {
    const openExternal = vi.fn();
    window.electron = { app: { openExternal } } as unknown as Window['electron'];
    seed(snapshot({
      active_count: 1,
      models: [model({ status: 'error', error: 'gated', gate_url: 'https://hf.co/gate' })],
    }));
    render(<FirstRunProvisioning />);
    fireEvent.click(screen.getByRole('button', { name: /accept license/i }));
    expect(openExternal).toHaveBeenCalledWith('https://hf.co/gate');
  });

  it('Pause all / Continue in background wire to the store', () => {
    const pauseProvisioning = vi.fn();
    useAppStore.setState({ pauseProvisioning });
    render(<FirstRunProvisioning />);
    fireEvent.click(screen.getByTestId('provision-pause'));
    expect(pauseProvisioning).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId('provision-background'));
    expect(useAppStore.getState().firstRunProvisionDismissed).toBe(true);
  });

  it('a paused set offers Resume all', () => {
    const resumeProvisioning = vi.fn();
    seed(snapshot({
      active_count: 1,
      models: [model({ status: 'paused', progress: 0.3 })],
    }));
    useAppStore.setState({ resumeProvisioning });
    render(<FirstRunProvisioning />);
    fireEvent.click(screen.getByTestId('provision-resume'));
    expect(resumeProvisioning).toHaveBeenCalledOnce();
  });

  it('errors offer Retry failed and Cancel asks for confirmation', () => {
    const resumeProvisioning = vi.fn();
    const cancelProvisioning = vi.fn();
    seed(snapshot({
      active_count: 1, error_count: 1,
      models: [model({ status: 'error', error: 'network' })],
    }));
    useAppStore.setState({ resumeProvisioning, cancelProvisioning });
    render(<FirstRunProvisioning />);
    fireEvent.click(screen.getByTestId('provision-retry'));
    expect(resumeProvisioning).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId('provision-cancel'));
    expect(cancelProvisioning).not.toHaveBeenCalled(); // confirm gate first
    fireEvent.click(screen.getByRole('button', { name: /stop downloads/i }));
    expect(cancelProvisioning).toHaveBeenCalledOnce();
  });

  it('a surfaced action error renders', () => {
    seed(snapshot(), { provisionActionError: 'no space' });
    render(<FirstRunProvisioning />);
    expect(screen.getByText(/no space/)).toBeInTheDocument();
  });

  it('Escape continues in background', () => {
    render(<FirstRunProvisioning />);
    fireEvent.keyDown(screen.getByTestId('first-run-provisioning'), { key: 'Escape' });
    expect(useAppStore.getState().firstRunProvisionDismissed).toBe(true);
  });
});

describe('diskCheck', () => {
  it('unknown without a profile', () => {
    expect(diskCheck(null, 10 * GB).level).toBe('unknown');
  });
  it('ok with ample headroom', () => {
    expect(diskCheck(100 * GB, 10 * GB).level).toBe('ok');
  });
  it('tight under 10 percent headroom', () => {
    expect(diskCheck(10.5 * GB, 10 * GB).level).toBe('tight');
  });
  it('insufficient below the requirement, message carries exact sizes', () => {
    const check = diskCheck(1 * GB, 10 * GB);
    expect(check.level).toBe('insufficient');
    expect(check.message).toContain('10.0 GB');
    expect(check.message).toContain('1.0 GB');
  });
});
```

- [ ] **Step 2:** Run: `npx vitest run src/components/provisioning/FirstRunProvisioning.test.tsx` — expected: FAIL (module missing).
- [ ] **Step 3: Implement** — `src/components/provisioning/FirstRunProvisioning.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  AlertTriangle, Check, Download, ExternalLink, HardDrive, Loader2, Pause, Play,
  RefreshCw, ShieldCheck, X,
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { cn } from '@/utils/cn';
import { formatBytes, formatEta, formatSpeed } from '@/utils/formatUtils';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { ProvisionModel } from '@/types/model';

export const STABILITY_LICENSE_URL = 'https://stability.ai/community-license-agreement';

/** Free-space headroom below which the pre-flight warns instead of passing. */
const TIGHT_HEADROOM = 1.1;

export interface DiskCheck {
  level: 'unknown' | 'ok' | 'tight' | 'insufficient';
  message: string;
}

/** Pure pre-flight verdict for the models volume (spec 6: warn with exact GB). */
export function diskCheck(freeBytes: number | null, remainingBytes: number): DiskCheck {
  if (freeBytes === null || !Number.isFinite(freeBytes) || freeBytes <= 0) {
    return {
      level: 'unknown',
      message: 'Disk check unavailable - free space is still verified per download.',
    };
  }
  const free = formatBytes(freeBytes);
  const needed = formatBytes(remainingBytes);
  if (freeBytes < remainingBytes) {
    return {
      level: 'insufficient',
      message: `Not enough disk space: ${needed} needed, only ${free} free. Free up space, then re-check.`,
    };
  }
  if (freeBytes < remainingBytes * TIGHT_HEADROOM) {
    return { level: 'tight', message: `Space is tight: ${needed} needed, ${free} free.` };
  }
  return { level: 'ok', message: `Disk check: ${free} free - enough for the remaining ${needed}.` };
}

const ROW_STATUS_LABEL: Record<ProvisionModel['status'], string> = {
  ready: 'Ready',
  missing: 'Waiting',
  queued: 'Queued',
  downloading: 'Downloading',
  paused: 'Paused',
  verifying: 'Verifying',
  error: 'Error',
  cancelled: 'Cancelled',
};

function openExternal(url: string) {
  void window.electron?.app?.openExternal(url);
}

function ModelRow({ row }: { row: ProvisionModel }) {
  const progress = Math.max(0, Math.min(100, Math.round(row.progress * 100)));
  return (
    <div data-testid={`provision-row-${row.id}`} className="recessed-well rounded-md p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {row.status === 'ready' ? (
            <Check aria-hidden="true" className="h-4 w-4 flex-shrink-0 text-status-success" />
          ) : row.status === 'error' ? (
            <AlertTriangle aria-hidden="true" className="h-4 w-4 flex-shrink-0 text-status-error" />
          ) : (
            <Loader2
              aria-hidden="true"
              className={cn(
                'h-4 w-4 flex-shrink-0 text-text-muted',
                row.status === 'downloading' && 'animate-spin',
              )}
            />
          )}
          <span className="truncate text-sm text-text-primary" title={row.name}>
            {row.name}
          </span>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {row.gate_url && (
            <button
              type="button"
              onClick={() => row.gate_url && openExternal(row.gate_url)}
              className="mono-label inline-flex items-center gap-1 rounded border border-accent-primary-border px-2 py-1 text-accent-primary hover:bg-accent-primary-muted"
            >
              <ExternalLink aria-hidden="true" className="h-3 w-3" /> Accept license
            </button>
          )}
          <span className="mono-label text-text-muted">{formatBytes(row.approx_bytes)}</span>
        </div>
      </div>
      <div
        className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface"
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${row.name} provisioning progress`}
      >
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300',
            row.status === 'error' ? 'bg-status-error' : 'bg-accent-primary',
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span
          className={cn(
            'mono-label',
            row.status === 'error' ? 'text-status-error' : 'text-text-muted',
          )}
        >
          {row.status === 'error' ? (row.error ?? 'Failed') : ROW_STATUS_LABEL[row.status]}
        </span>
        <span className="mono-label text-text-muted">{progress}%</span>
      </div>
    </div>
  );
}

/**
 * #34 installer PR3: the first-run provisioning takeover (spec 6).
 *
 * Shown only when a VALID backend snapshot proves the comprehensive auto-set
 * incomplete and the user has not dismissed it - a cold backend can never
 * produce a false takeover. Every number on screen comes from the last
 * ProvisionStatus snapshot; nothing here invents progress.
 */
export function FirstRunProvisioning() {
  const {
    provisionStatus, provisionBusy, provisionActionError, firstRunProvisionDismissed,
    hardwareProfile, startProvisioning, pauseProvisioning, resumeProvisioning,
    cancelProvisioning, dismissFirstRunProvisioning, loadHardwareProfile,
    refreshProvisionStatus,
  } = useAppStore(
    useShallow((s) => ({
      provisionStatus: s.provisionStatus,
      provisionBusy: s.provisionBusy,
      provisionActionError: s.provisionActionError,
      firstRunProvisionDismissed: s.firstRunProvisionDismissed,
      hardwareProfile: s.hardwareProfile,
      startProvisioning: s.startProvisioning,
      pauseProvisioning: s.pauseProvisioning,
      resumeProvisioning: s.resumeProvisioning,
      cancelProvisioning: s.cancelProvisioning,
      dismissFirstRunProvisioning: s.dismissFirstRunProvisioning,
      loadHardwareProfile: s.loadHardwareProfile,
      refreshProvisionStatus: s.refreshProvisionStatus,
    })),
  );

  const [confirmCancel, setConfirmCancel] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const visible =
    provisionStatus !== null && !provisionStatus.complete && !firstRunProvisionDismissed;

  // Pre-flight data: the hardware profile owns disk_free_bytes for the models
  // volume (foundry/hardware.py probes shutil.disk_usage(models_dir)).
  useEffect(() => {
    if (visible) void loadHardwareProfile();
  }, [visible, loadHardwareProfile]);

  useEffect(() => {
    if (visible) panelRef.current?.focus();
  }, [visible]);

  const rows = provisionStatus?.models ?? [];
  const derived = useMemo(() => {
    const pickle = rows.filter((m) => m.format === 'pickle');
    const gated = rows.filter((m) => m.gated);
    const started = rows.some((m) => m.status !== 'missing');
    const paused = rows.some((m) => m.status === 'paused');
    const live = rows.some(
      (m) => m.status === 'queued' || m.status === 'downloading' || m.status === 'verifying',
    );
    return { pickle, gated, started, paused, live };
  }, [rows]);

  if (!visible || provisionStatus === null) return null;

  const disk = diskCheck(hardwareProfile?.disk_free_bytes ?? null, provisionStatus.remaining_bytes);
  const overallPct = Math.max(0, Math.min(100, Math.round(provisionStatus.overall_progress * 100)));
  const speed = formatSpeed(provisionStatus.speed);
  const eta = formatEta(provisionStatus.eta);
  const installBlocked = disk.level === 'insufficient';

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      dismissFirstRunProvisioning();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-void/90 p-6 backdrop-blur-sm"
      data-testid="first-run-provisioning"
      role="dialog"
      aria-modal="true"
      aria-label="First-run model setup"
      onKeyDown={handleKeyDown}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="raised-panel my-auto w-full max-w-3xl rounded-sm p-8 outline-none"
      >
        <p className="mono-label text-text-muted">First-run setup</p>
        <h1 className="mt-2 text-2xl font-semibold text-text-primary">
          Install the model library
        </h1>
        <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-text-body">
          Vision Studio runs entirely on your machine. One click installs the complete
          verified model set - every image, video, and edit capability works out of the box.
          You can keep using the app while models install; each feature unlocks the moment
          its model is ready.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="mono-label text-text-body">
            {provisionStatus.total_count} models
          </span>
          <span className="mono-label text-text-body">
            {formatBytes(provisionStatus.remaining_bytes)} to download
          </span>
          <span
            className={cn(
              'mono-label inline-flex items-center gap-1.5',
              disk.level === 'insufficient' && 'text-status-error',
              disk.level === 'tight' && 'text-status-warning',
              disk.level === 'ok' && 'text-status-success',
              disk.level === 'unknown' && 'text-text-muted',
            )}
          >
            <HardDrive aria-hidden="true" className="h-3.5 w-3.5" />
            {disk.message}
          </span>
          {disk.level === 'insufficient' && (
            <button
              type="button"
              data-testid="provision-disk-recheck"
              onClick={() => {
                void loadHardwareProfile();
                void refreshProvisionStatus();
              }}
              className="mono-label inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-text-body hover:border-border-hover hover:text-text-primary"
            >
              <RefreshCw aria-hidden="true" className="h-3 w-3" /> Re-check
            </button>
          )}
        </div>

        {!derived.started && (
          <div
            data-testid="provision-disclosure"
            className="recessed-well mt-6 rounded-md p-4"
          >
            <p className="mono-label inline-flex items-center gap-1.5 text-text-primary">
              <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
              What installs, and under which terms
            </p>
            <ul className="mt-3 flex flex-col gap-2.5 text-xs leading-relaxed text-text-body">
              <li>
                Every file installs from its pinned upstream source and is
                integrity-verified (SHA-256 / LFS) before use.
              </li>
              {derived.pickle.length > 0 && (
                <li>
                  {derived.pickle.length} curated first-party weights (
                  {derived.pickle.map((m) => m.name).join(', ')}) are pickle-format
                  checkpoints. Vision Studio approves their security consent automatically
                  for exactly this pinned, audited set and records each grant in the
                  consent audit log. Models you add yourself always ask first.
                </li>
              )}
              {provisionStatus.attribution && (
                <li>
                  Stability AI models install under the Stability AI Community License -
                  free for individuals and organizations under $1M annual revenue. This
                  install is marked "{provisionStatus.attribution}".{' '}
                  <button
                    type="button"
                    onClick={() => openExternal(STABILITY_LICENSE_URL)}
                    className="inline-flex items-center gap-1 text-accent-primary underline decoration-border underline-offset-2 hover:text-accent-primary-hover"
                  >
                    Read the license
                    <ExternalLink aria-hidden="true" className="h-3 w-3" />
                  </button>
                </li>
              )}
              {derived.gated.length > 0 && (
                <li>
                  {derived.gated.length} of them ({derived.gated.map((m) => m.name).join(', ')})
                  are gated upstream and need a free Hugging Face account: add your token in
                  Settings, then accept each model's license when prompted here.
                </li>
              )}
              <li>
                Full license text for every model and bundled dependency lives in
                Settings, under About and Licenses.
              </li>
            </ul>
          </div>
        )}

        {derived.started && (
          <div className="mt-6">
            <div
              className="recessed-well h-2.5 w-full overflow-hidden rounded-full"
              role="progressbar"
              aria-valuenow={overallPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Overall provisioning progress"
            >
              <div
                className="h-full rounded-full bg-accent-primary transition-all duration-300"
                style={{ width: `${overallPct}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="mono-label text-text-body">
                {provisionStatus.ready_count}/{provisionStatus.total_count} models ready
              </span>
              <span className="mono-label flex items-center gap-3 text-text-muted">
                {speed && <span>{speed}</span>}
                {eta && <span>{eta}</span>}
                <span>{overallPct}%</span>
              </span>
            </div>
            <div className="mt-4 flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
              {rows.map((row) => (
                <ModelRow key={row.id} row={row} />
              ))}
            </div>
          </div>
        )}

        {provisionActionError && (
          <p className="mt-4 flex items-center gap-2 text-sm text-status-error" role="alert">
            <AlertTriangle aria-hidden="true" className="h-4 w-4 flex-shrink-0" />
            {provisionActionError}
          </p>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {!derived.started ? (
            <>
              <button
                type="button"
                data-testid="provision-install"
                onClick={() => void startProvisioning()}
                disabled={installBlocked || provisionBusy}
                className="btn-chrome inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download aria-hidden="true" className="h-4 w-4" />
                Install all models ({formatBytes(provisionStatus.remaining_bytes)})
              </button>
              <button
                type="button"
                data-testid="provision-skip"
                onClick={dismissFirstRunProvisioning}
                className="rounded-md border border-border px-4 py-2.5 text-sm text-text-body transition-colors hover:border-border-hover hover:text-text-primary"
              >
                Skip for now
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                data-testid="provision-background"
                onClick={dismissFirstRunProvisioning}
                className="btn-chrome inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium"
              >
                Continue in background
              </button>
              {derived.live && (
                <button
                  type="button"
                  data-testid="provision-pause"
                  onClick={() => void pauseProvisioning()}
                  disabled={provisionBusy}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2.5 text-sm text-text-body transition-colors hover:border-border-hover hover:text-text-primary disabled:opacity-50"
                >
                  <Pause aria-hidden="true" className="h-4 w-4" /> Pause all
                </button>
              )}
              {!derived.live && derived.paused && (
                <button
                  type="button"
                  data-testid="provision-resume"
                  onClick={() => void resumeProvisioning()}
                  disabled={provisionBusy}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2.5 text-sm text-text-body transition-colors hover:border-border-hover hover:text-text-primary disabled:opacity-50"
                >
                  <Play aria-hidden="true" className="h-4 w-4" /> Resume all
                </button>
              )}
              {provisionStatus.error_count > 0 && (
                <button
                  type="button"
                  data-testid="provision-retry"
                  onClick={() => void resumeProvisioning()}
                  disabled={provisionBusy}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2.5 text-sm text-text-body transition-colors hover:border-border-hover hover:text-text-primary disabled:opacity-50"
                >
                  <RefreshCw aria-hidden="true" className="h-4 w-4" />
                  Retry failed ({provisionStatus.error_count})
                </button>
              )}
              <button
                type="button"
                data-testid="provision-cancel"
                onClick={() => setConfirmCancel(true)}
                disabled={provisionBusy}
                className="ml-auto inline-flex items-center gap-2 rounded-md px-3 py-2.5 text-sm text-text-muted transition-colors hover:bg-status-error/10 hover:text-status-error disabled:opacity-50"
              >
                <X aria-hidden="true" className="h-4 w-4" /> Cancel setup
              </button>
            </>
          )}
        </div>

        <p className="mt-6 text-xs text-text-muted">
          Features that need a specific model stay honestly disabled until that model is
          installed. You can resume, verify, or add models anytime from the Foundry.
        </p>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel first-run setup?"
        message="Downloads stop and partially downloaded files are kept for resume. Models already installed stay installed. You can resume anytime from the Foundry."
        confirmLabel="Stop downloads"
        cancelLabel="Keep going"
        variant="danger"
        onConfirm={() => {
          setConfirmCancel(false);
          void cancelProvisioning();
        }}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  );
}
```

> Verify against `src/components/ui/ConfirmDialog.tsx` prop names before finalizing (ConsentDialog usage shows `open/title/message/confirmLabel/cancelLabel/variant/onConfirm/onCancel`). If `.btn-chrome` needs a companion radius/padding class in this codebase, mirror an existing `.btn-chrome` usage.

- [ ] **Step 4:** Mount in `src/App.tsx`: `import { FirstRunProvisioning } from '@/components/provisioning/FirstRunProvisioning';` + `import { useProvisioningStatus } from '@/hooks/useProvisioningStatus';`; call `useProvisioningStatus();` inside `App()` (after the store selector); render `<FirstRunProvisioning />` directly after `<KeyboardShortcuts ... />`.
- [ ] **Step 5:** Run: `npx vitest run src/components/provisioning/FirstRunProvisioning.test.tsx src/App.test.tsx` — expected: PASS.
- [ ] **Step 6: Commit:** `git add src/components/provisioning/FirstRunProvisioning.tsx src/components/provisioning/FirstRunProvisioning.test.tsx src/App.tsx && git commit -m "feat(installer): first-run provisioning overlay with consent disclosure + disk preflight"`

---

### Task 9: Header provisioning pill

While provisioning runs in the background, the Header's status pill reports it (between the generation-queue case and the generic downloading case, which would otherwise mislabel provision jobs).

**Files:**
- Modify: `src/components/layout/Header.tsx` (`getBackendStatusPresentation` + component subscription)
- Test: `src/components/layout/Header.provisioning.test.tsx` (create)

**Interfaces:**
- Consumes: `provisionStatus` (Task 6), `hasLiveProvisionJob` (Task 6).
- Produces: pill label `Provisioning models: NN% (R/T)`, tone `accent`, pulse.

- [ ] **Step 1: Write the failing test** — `src/components/layout/Header.provisioning.test.tsx`:

```tsx
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useAppStore } from '@/store/appStore';
import { provisioningInitialState } from '@/store/slices/provisioningSlice';
import { Header } from './Header';
import type { ProvisionStatus } from '@/types/model';

function snapshot(over: Partial<ProvisionStatus> = {}): ProvisionStatus {
  return {
    schema_version: 1, overall_progress: 0.42, total_bytes: 100, present_bytes: 42,
    remaining_bytes: 58, speed: 0, eta: null, total_count: 33, ready_count: 14,
    active_count: 1, error_count: 0, complete: false, attribution: null,
    models: [{
      id: 'sd-1-5', name: 'SD 1.5', license: null, attribution: null, approx_bytes: 10,
      format: null, gated: false, status: 'downloading', progress: 0.42,
      error: null, gate_url: null,
    }],
    ...over,
  };
}

describe('Header provisioning pill', () => {
  beforeEach(() => {
    useAppStore.setState({
      ...provisioningInitialState,
      activeJobs: [],
      generationQueue: [],
      availableModels: [],
    });
  });

  it('reports live provisioning with percent and counts', () => {
    useAppStore.setState({ provisionStatus: snapshot() });
    render(<Header />);
    expect(screen.getByText('Provisioning models: 42% (14/33)')).toBeInTheDocument();
  });

  it('stays silent for a paused set', () => {
    useAppStore.setState({
      provisionStatus: snapshot({
        models: [{
          id: 'sd-1-5', name: 'SD 1.5', license: null, attribution: null, approx_bytes: 10,
          format: null, gated: false, status: 'paused', progress: 0.42,
          error: null, gate_url: null,
        }],
      }),
    });
    render(<Header />);
    expect(screen.queryByText(/Provisioning models/)).toBeNull();
  });
});
```

- [ ] **Step 2:** Run: `npx vitest run src/components/layout/Header.provisioning.test.tsx` — expected: FAIL.
- [ ] **Step 3: Implement.** In `Header.tsx`: extend the params of `getBackendStatusPresentation` with `provisionStatus: ReturnType<typeof useAppStore.getState>['provisionStatus'];`, import `hasLiveProvisionJob` from `@/store/slices/provisioningSlice`, and insert after the queue-active branch (before `downloadingCount`):

```ts
  if (
    provisionStatus &&
    !provisionStatus.complete &&
    hasLiveProvisionJob(provisionStatus)
  ) {
    return {
      label: `Provisioning models: ${Math.round(provisionStatus.overall_progress * 100)}% (${provisionStatus.ready_count}/${provisionStatus.total_count})`,
      tone: 'accent',
      pulse: true,
      ariaLabel: 'Model provisioning in progress',
    };
  }
```

In the component: `const provisionStatus = useAppStore((s) => s.provisionStatus);` and pass it through.

- [ ] **Step 4:** Run: `npx vitest run src/components/layout/Header.provisioning.test.tsx` — expected: PASS.
- [ ] **Step 5: Commit:** `git add src/components/layout/Header.tsx src/components/layout/Header.provisioning.test.tsx && git commit -m "feat(installer): header pill reports background provisioning"`

---

### Task 10: `ProvisioningCard` in the Foundry

The durable re-entry point after first-run: install-remaining / pause / resume, reopen the setup screen, and the **verify-and-repair** path (always available once complete).

**Files:**
- Create: `src/components/foundry/ProvisioningCard.tsx`
- Modify: `src/pages/FoundryPage.tsx` (mount between `<FoundryHeaderBar />` and the tablist)
- Test: `src/components/foundry/ProvisioningCard.test.tsx`

**Interfaces:**
- Consumes: Task 6 state/actions; Task 5 formatters.
- Produces: `ProvisioningCard` — renders `null` when `provisionStatus === null`. Test ids: `provisioning-card`, `provisioning-card-install`, `provisioning-card-pause`, `provisioning-card-resume`, `provisioning-card-verify`, `provisioning-card-open`.

- [ ] **Step 1: Write the failing tests** — `src/components/foundry/ProvisioningCard.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useAppStore } from '@/store/appStore';
import { provisioningInitialState } from '@/store/slices/provisioningSlice';
import { ProvisioningCard } from './ProvisioningCard';
import type { ProvisionModel, ProvisionStatus } from '@/types/model';

function model(over: Partial<ProvisionModel> = {}): ProvisionModel {
  return {
    id: 'sd-1-5', name: 'SD 1.5', license: null, attribution: null, approx_bytes: 100,
    format: null, gated: false, status: 'ready', progress: 1, error: null,
    gate_url: null, ...over,
  };
}

function snapshot(over: Partial<ProvisionStatus> = {}): ProvisionStatus {
  return {
    schema_version: 1, overall_progress: 1, total_bytes: 100, present_bytes: 100,
    remaining_bytes: 0, speed: 0, eta: null, total_count: 33, ready_count: 33,
    active_count: 0, error_count: 0, complete: true,
    attribution: 'Powered by Stability AI', models: [model()], ...over,
  };
}

describe('ProvisioningCard', () => {
  beforeEach(() => {
    useAppStore.setState({ ...provisioningInitialState });
  });

  it('renders nothing without a snapshot', () => {
    render(<ProvisioningCard />);
    expect(screen.queryByTestId('provisioning-card')).toBeNull();
  });

  it('complete set: reports readiness, attribution, and offers verify-and-repair', () => {
    const reverifyProvisioning = vi.fn();
    useAppStore.setState({ provisionStatus: snapshot(), reverifyProvisioning });
    render(<ProvisioningCard />);
    expect(screen.getByText(/All 33 models installed/)).toBeInTheDocument();
    expect(screen.getByText('Powered by Stability AI')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('provisioning-card-verify'));
    expect(reverifyProvisioning).toHaveBeenCalledOnce();
  });

  it('incomplete idle set: offers install-remaining and reopening the setup screen', () => {
    const startProvisioning = vi.fn();
    useAppStore.setState({
      provisionStatus: snapshot({
        complete: false, ready_count: 10, remaining_bytes: 50,
        models: [model({ status: 'missing', progress: 0 })],
      }),
      firstRunProvisionDismissed: true,
      startProvisioning,
    });
    render(<ProvisioningCard />);
    fireEvent.click(screen.getByTestId('provisioning-card-install'));
    expect(startProvisioning).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId('provisioning-card-open'));
    expect(useAppStore.getState().firstRunProvisionDismissed).toBe(false);
  });

  it('live set: shows progress and pause; paused set: shows resume', () => {
    const pauseProvisioning = vi.fn();
    const resumeProvisioning = vi.fn();
    useAppStore.setState({
      provisionStatus: snapshot({
        complete: false, overall_progress: 0.42, ready_count: 14, active_count: 1,
        models: [model({ status: 'downloading', progress: 0.42 })],
      }),
      pauseProvisioning,
      resumeProvisioning,
    });
    const { rerender } = render(<ProvisioningCard />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
    fireEvent.click(screen.getByTestId('provisioning-card-pause'));
    expect(pauseProvisioning).toHaveBeenCalledOnce();

    useAppStore.setState({
      provisionStatus: snapshot({
        complete: false, active_count: 1,
        models: [model({ status: 'paused', progress: 0.42 })],
      }),
    });
    rerender(<ProvisioningCard />);
    fireEvent.click(screen.getByTestId('provisioning-card-resume'));
    expect(resumeProvisioning).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2:** Run: `npx vitest run src/components/foundry/ProvisioningCard.test.tsx` — expected: FAIL.
- [ ] **Step 3: Implement** — `src/components/foundry/ProvisioningCard.tsx`:

```tsx
import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Download, Pause, Play, ShieldCheck } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { hasLiveProvisionJob } from '@/store/slices/provisioningSlice';
import { formatBytes } from '@/utils/formatUtils';

/**
 * #34 installer PR3: set-level provisioning state inside the Foundry - the
 * durable re-entry point after the first-run screen is dismissed, and the
 * home of the verify-and-repair path (spec 6 idempotence and recovery).
 * Renders nothing until a valid backend snapshot exists (cold backend safe).
 */
export function ProvisioningCard() {
  const {
    provisionStatus, provisionBusy, provisionActionError, startProvisioning,
    pauseProvisioning, resumeProvisioning, reverifyProvisioning,
    openFirstRunProvisioning, refreshProvisionStatus,
  } = useAppStore(
    useShallow((s) => ({
      provisionStatus: s.provisionStatus,
      provisionBusy: s.provisionBusy,
      provisionActionError: s.provisionActionError,
      startProvisioning: s.startProvisioning,
      pauseProvisioning: s.pauseProvisioning,
      resumeProvisioning: s.resumeProvisioning,
      reverifyProvisioning: s.reverifyProvisioning,
      openFirstRunProvisioning: s.openFirstRunProvisioning,
      refreshProvisionStatus: s.refreshProvisionStatus,
    })),
  );

  useEffect(() => {
    void refreshProvisionStatus();
  }, [refreshProvisionStatus]);

  if (!provisionStatus) return null;

  const live = hasLiveProvisionJob(provisionStatus);
  const paused = !live && provisionStatus.models.some((m) => m.status === 'paused');
  const pct = Math.max(0, Math.min(100, Math.round(provisionStatus.overall_progress * 100)));
  const attributionShown = provisionStatus.models.some(
    (m) => m.attribution && m.status === 'ready',
  );

  return (
    <section data-testid="provisioning-card" className="raised-panel mt-6 rounded-sm p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="mono-label text-text-muted">Model library</p>
          <p className="mt-1 text-sm text-text-primary">
            {provisionStatus.complete
              ? `All ${provisionStatus.total_count} models installed`
              : `${provisionStatus.ready_count}/${provisionStatus.total_count} models installed - ${formatBytes(provisionStatus.remaining_bytes)} remaining`}
          </p>
          {attributionShown && (
            <p className="mono-label mt-1 text-text-muted">{provisionStatus.attribution}</p>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {!provisionStatus.complete && !live && (
            <>
              <button
                type="button"
                data-testid="provisioning-card-install"
                onClick={() => void (paused ? resumeProvisioning() : startProvisioning())}
                disabled={provisionBusy}
                className="btn-chrome inline-flex items-center gap-2 px-3 py-2 text-sm disabled:opacity-50"
              >
                <Download aria-hidden="true" className="h-4 w-4" />
                {paused ? 'Resume install' : 'Install remaining'}
              </button>
              <button
                type="button"
                data-testid="provisioning-card-open"
                onClick={openFirstRunProvisioning}
                className="rounded-md border border-border px-3 py-2 text-sm text-text-body hover:border-border-hover hover:text-text-primary"
              >
                Open setup screen
              </button>
            </>
          )}
          {live && (
            <button
              type="button"
              data-testid="provisioning-card-pause"
              onClick={() => void pauseProvisioning()}
              disabled={provisionBusy}
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-text-body hover:border-border-hover hover:text-text-primary disabled:opacity-50"
            >
              <Pause aria-hidden="true" className="h-4 w-4" /> Pause
            </button>
          )}
          {paused && (
            <button
              type="button"
              data-testid="provisioning-card-resume"
              onClick={() => void resumeProvisioning()}
              disabled={provisionBusy}
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-text-body hover:border-border-hover hover:text-text-primary disabled:opacity-50"
            >
              <Play aria-hidden="true" className="h-4 w-4" /> Resume
            </button>
          )}
          <button
            type="button"
            data-testid="provisioning-card-verify"
            onClick={() => void reverifyProvisioning()}
            disabled={provisionBusy || live}
            title="Re-hash installed weights against the manifest and re-fetch any corrupt file"
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-text-body hover:border-border-hover hover:text-text-primary disabled:opacity-50"
          >
            <ShieldCheck aria-hidden="true" className="h-4 w-4" /> Verify and repair
          </button>
        </div>
      </div>
      {(live || paused) && (
        <div
          className="recessed-well mt-3 h-1.5 w-full overflow-hidden rounded-full"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Model library provisioning progress"
        >
          <div
            className="h-full rounded-full bg-accent-primary transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {provisionActionError && (
        <p className="mt-2 text-xs text-status-error" role="alert">{provisionActionError}</p>
      )}
    </section>
  );
}
```

- [ ] **Step 4:** Mount in `FoundryPage.tsx`: `import { ProvisioningCard } from '@/components/foundry/ProvisioningCard';` and render `<ProvisioningCard />` directly under the `<FoundryHeaderBar />` wrapper div.
- [ ] **Step 5:** Run: `npx vitest run src/components/foundry/ProvisioningCard.test.tsx src/pages/FoundryPage.test.tsx` — expected: PASS.
- [ ] **Step 6: Commit:** `git add src/components/foundry/ProvisioningCard.tsx src/components/foundry/ProvisioningCard.test.tsx src/pages/FoundryPage.tsx && git commit -m "feat(installer): Foundry provisioning card with verify-and-repair"`

---

### Task 11: `parseLicensesMarkdown`

Pure parser for the fixed, generated structure of `THIRD-PARTY-LICENSES.md` (h1-h3 headings, `- ` list items, `**bold**`, `[text](url)`). No new dependency; drift-guarded upstream by `backend/tests/test_notices.py`.

**Files:**
- Create: `src/features/licenses/parseLicensesMarkdown.ts`
- Test: `src/features/licenses/parseLicensesMarkdown.test.ts`

**Interfaces:**
- Produces:

```ts
export type LicenseSpan =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'link'; text: string; url: string };
export type LicensesBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'paragraph'; spans: LicenseSpan[] }
  | { kind: 'listItem'; spans: LicenseSpan[] };
export function parseLicensesMarkdown(markdown: string): LicensesBlock[];
```

- [ ] **Step 1: Write the failing tests** — `src/features/licenses/parseLicensesMarkdown.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseLicensesMarkdown } from './parseLicensesMarkdown';

const SAMPLE = [
  '# Third-Party Licenses',
  '',
  'Vision Studio is MIT licensed (see `LICENSE.txt`).',
  '',
  '## Bundled AI Models',
  '',
  '- **Stable Diffusion 3.5 Large** (`sd3.5-large`) - [Stability AI Community License](https://stability.ai/community-license-agreement) - Powered by Stability AI',
  '',
  '### Python',
  '',
  '- **PyTorch (torch, torchvision, torchaudio)** - [BSD-3-Clause](https://github.com/pytorch/pytorch/blob/main/LICENSE)',
].join('\n');

describe('parseLicensesMarkdown', () => {
  it('parses headings with levels', () => {
    const blocks = parseLicensesMarkdown(SAMPLE);
    expect(blocks[0]).toEqual({ kind: 'heading', level: 1, text: 'Third-Party Licenses' });
    expect(blocks).toContainEqual({ kind: 'heading', level: 2, text: 'Bundled AI Models' });
    expect(blocks).toContainEqual({ kind: 'heading', level: 3, text: 'Python' });
  });

  it('parses a model list item into bold + link + text spans', () => {
    const item = parseLicensesMarkdown(SAMPLE).find(
      (b) => b.kind === 'listItem' && b.spans.some((s) => s.kind === 'bold' && s.text.includes('3.5')),
    );
    expect(item).toBeDefined();
    if (item?.kind !== 'listItem') throw new Error('expected list item');
    expect(item.spans).toContainEqual({ kind: 'bold', text: 'Stable Diffusion 3.5 Large' });
    expect(item.spans).toContainEqual({
      kind: 'link',
      text: 'Stability AI Community License',
      url: 'https://stability.ai/community-license-agreement',
    });
    expect(item.spans.some((s) => s.kind === 'text' && s.text.includes('Powered by Stability AI'))).toBe(true);
  });

  it('keeps plain lines as paragraphs and drops blanks', () => {
    const blocks = parseLicensesMarkdown(SAMPLE);
    expect(blocks.some((b) => b.kind === 'paragraph')).toBe(true);
    expect(blocks.every((b) => b.kind !== 'paragraph' || b.spans.length > 0)).toBe(true);
  });

  it('handles CRLF input', () => {
    const blocks = parseLicensesMarkdown('## A\r\n- item\r\n');
    expect(blocks).toHaveLength(2);
  });
});
```

- [ ] **Step 2:** Run: `npx vitest run src/features/licenses/parseLicensesMarkdown.test.ts` — expected: FAIL.
- [ ] **Step 3: Implement** — `src/features/licenses/parseLicensesMarkdown.ts`:

```ts
/**
 * #34 installer PR3: minimal parser for THIRD-PARTY-LICENSES.md.
 *
 * The document is GENERATED (backend/foundry/notices.py) and drift-guarded by
 * backend/tests/test_notices.py, so its structure is a closed set: h1-h3
 * headings, "- " list items, **bold**, [text](url) links, plain paragraphs.
 * Parsing that fixed grammar here keeps the About > Licenses screen bound to
 * the exact shipped compliance artifact - one source of truth, no markdown
 * dependency, no dangerouslySetInnerHTML.
 */

export type LicenseSpan =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'link'; text: string; url: string };

export type LicensesBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'paragraph'; spans: LicenseSpan[] }
  | { kind: 'listItem'; spans: LicenseSpan[] };

const INLINE = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;

function parseInlineSpans(text: string): LicenseSpan[] {
  const spans: LicenseSpan[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last) spans.push({ kind: 'text', text: text.slice(last, index) });
    if (match[1] !== undefined) {
      spans.push({ kind: 'link', text: match[1], url: match[2] });
    } else {
      spans.push({ kind: 'bold', text: match[3] });
    }
    last = index + match[0].length;
  }
  if (last < text.length) spans.push({ kind: 'text', text: text.slice(last) });
  return spans;
}

export function parseLicensesMarkdown(markdown: string): LicensesBlock[] {
  const blocks: LicensesBlock[] = [];
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({
        kind: 'heading',
        level: heading[1].length as 1 | 2 | 3,
        text: heading[2],
      });
      continue;
    }
    if (line.startsWith('- ')) {
      blocks.push({ kind: 'listItem', spans: parseInlineSpans(line.slice(2)) });
      continue;
    }
    blocks.push({ kind: 'paragraph', spans: parseInlineSpans(line) });
  }
  return blocks;
}
```

- [ ] **Step 4:** Run: `npx vitest run src/features/licenses/parseLicensesMarkdown.test.ts` — expected: PASS.
- [ ] **Step 5: Commit:** `git add src/features/licenses/parseLicensesMarkdown.ts src/features/licenses/parseLicensesMarkdown.test.ts && git commit -m "feat(installer): licenses markdown parser for the About screen"`

---

### Task 12: About > Licenses screen

New Settings tab: app identity + version, the conditional "Powered by Stability AI" mark, and the full compliance document rendered from the raw-imported `THIRD-PARTY-LICENSES.md` (spec §4: the screen renders the same content the installer ships).

**Files:**
- Create: `src/components/settings/AboutSection.tsx`
- Modify: `src/pages/SettingsPanel.tsx` (`SettingsTab` union + `sections` + render branch)
- Test: `src/components/settings/AboutSection.test.tsx`

**Interfaces:**
- Consumes: Task 11 parser; `provisionStatus` (Task 6); `packageJson.version`; `window.electron.app.openExternal`; raw import `import licensesMarkdown from '../../../THIRD-PARTY-LICENSES.md?raw';` (covered by `vite/client` types; Vitest resolves it through Vite).
- Produces: `AboutSection` component; test ids `settings-about`, `about-licenses`.

- [ ] **Step 1: Write the failing tests** — `src/components/settings/AboutSection.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useAppStore } from '@/store/appStore';
import { provisioningInitialState } from '@/store/slices/provisioningSlice';
import packageJson from '../../../package.json';
import { AboutSection } from './AboutSection';
import type { ProvisionStatus } from '@/types/model';

function saiReadySnapshot(): ProvisionStatus {
  return {
    schema_version: 1, overall_progress: 1, total_bytes: 1, present_bytes: 1,
    remaining_bytes: 0, speed: 0, eta: null, total_count: 1, ready_count: 1,
    active_count: 0, error_count: 0, complete: true,
    attribution: 'Powered by Stability AI',
    models: [{
      id: 'sd3.5-large', name: 'SD 3.5 Large', license: 'stabilityai-community',
      attribution: 'Powered by Stability AI', approx_bytes: 1, format: 'safetensors',
      gated: true, status: 'ready', progress: 1, error: null, gate_url: null,
    }],
  };
}

describe('AboutSection', () => {
  beforeEach(() => {
    window.electron = { app: { openExternal: vi.fn() } } as unknown as Window['electron'];
    useAppStore.setState({ ...provisioningInitialState });
  });

  it('shows the app identity and version', () => {
    render(<AboutSection />);
    expect(screen.getByTestId('settings-about')).toHaveTextContent(
      `v${packageJson.version}`,
    );
    expect(screen.getByText(/MIT License/)).toBeInTheDocument();
  });

  it('renders the shipped compliance document', () => {
    render(<AboutSection />);
    const licenses = screen.getByTestId('about-licenses');
    expect(licenses).toHaveTextContent('Bundled AI Models');
    expect(licenses).toHaveTextContent('Stable Diffusion 3.5 Large');
    expect(licenses).toHaveTextContent('PyTorch');
    expect(licenses).toHaveTextContent('Powered by Stability AI');
  });

  it('license links open externally', () => {
    const openExternal = vi.fn();
    window.electron = { app: { openExternal } } as unknown as Window['electron'];
    render(<AboutSection />);
    fireEvent.click(
      screen.getAllByRole('link', { name: 'Stability AI Community License' })[0],
    );
    expect(openExternal).toHaveBeenCalledWith('https://stability.ai/community-license-agreement');
  });

  it('surfaces the attribution mark when a Stability model is installed', () => {
    useAppStore.setState({ provisionStatus: saiReadySnapshot() });
    render(<AboutSection />);
    expect(screen.getByTestId('about-attribution')).toHaveTextContent('Powered by Stability AI');
  });

  it('hides the live mark when a valid snapshot proves no Stability model is ready', () => {
    const snap = saiReadySnapshot();
    snap.models[0].status = 'missing';
    useAppStore.setState({ provisionStatus: snap });
    render(<AboutSection />);
    expect(screen.queryByTestId('about-attribution')).toBeNull();
  });
});
```

- [ ] **Step 2:** Run: `npx vitest run src/components/settings/AboutSection.test.tsx` — expected: FAIL.
- [ ] **Step 3: Implement** — `src/components/settings/AboutSection.tsx`:

```tsx
import { useMemo } from 'react';
import { ExternalLink } from 'lucide-react';
import packageJson from '../../../package.json';
import licensesMarkdown from '../../../THIRD-PARTY-LICENSES.md?raw';
import { useAppStore } from '@/store/appStore';
import {
  parseLicensesMarkdown,
  type LicenseSpan,
} from '@/features/licenses/parseLicensesMarkdown';

function Spans({ spans }: { spans: LicenseSpan[] }) {
  return (
    <>
      {spans.map((span, index) => {
        if (span.kind === 'bold') {
          return (
            <strong key={index} className="font-medium text-text-primary">
              {span.text}
            </strong>
          );
        }
        if (span.kind === 'link') {
          return (
            <a
              key={index}
              href={span.url}
              onClick={(event) => {
                event.preventDefault();
                void window.electron?.app?.openExternal(span.url);
              }}
              className="inline-flex items-center gap-0.5 text-accent-primary underline decoration-border underline-offset-2 hover:text-accent-primary-hover"
            >
              {span.text}
              <ExternalLink aria-hidden="true" className="h-3 w-3" />
            </a>
          );
        }
        return <span key={index}>{span.text}</span>;
      })}
    </>
  );
}

/**
 * #34 installer PR3: About > Licenses (spec 4 compliance artifacts).
 *
 * Renders the exact THIRD-PARTY-LICENSES.md the installer ships (raw import;
 * the file itself is drift-guarded against the generator by
 * backend/tests/test_notices.py), plus the live "Powered by Stability AI"
 * mark while any Stability-Community model is installed. When the backend is
 * unreachable the mark stays visible - absence can only be proven by a valid
 * snapshot, and over-attribution is the compliance-safe failure mode.
 */
export function AboutSection() {
  const provisionStatus = useAppStore((s) => s.provisionStatus);
  const blocks = useMemo(() => parseLicensesMarkdown(licensesMarkdown), []);

  const attribution =
    provisionStatus === null
      ? 'Powered by Stability AI'
      : provisionStatus.models.find((m) => m.attribution && m.status === 'ready')
          ?.attribution ?? null;

  return (
    <div data-testid="settings-about" className="flex flex-col gap-6">
      <div>
        <p className="mono-label text-text-muted">About</p>
        <h2 className="mt-1 text-xl font-semibold text-text-primary">Vision Studio</h2>
        <p className="data-mono mt-1 text-text-muted">{`v${packageJson.version}`}</p>
        <p className="mt-3 max-w-[65ch] text-sm leading-relaxed text-text-body">
          Professional local-first AI image and video generation. Everything runs on
          your GPU - no cloud, no subscription. Vision Studio's own source code is
          released under the MIT License.
        </p>
        {attribution && (
          <p
            data-testid="about-attribution"
            className="mono-label mt-3 inline-block rounded border border-border px-2 py-1 text-text-body"
          >
            {attribution}
          </p>
        )}
      </div>

      <div data-testid="about-licenses" className="recessed-well rounded-md p-5">
        <div className="flex max-w-[75ch] flex-col gap-2">
          {blocks.map((block, index) => {
            if (block.kind === 'heading') {
              if (block.level === 1) {
                return (
                  <h3 key={index} className="text-lg font-semibold text-text-primary">
                    {block.text}
                  </h3>
                );
              }
              if (block.level === 2) {
                return (
                  <h4 key={index} className="mt-4 text-base font-medium text-text-primary">
                    {block.text}
                  </h4>
                );
              }
              return (
                <p key={index} className="mono-label mt-3 text-text-muted">
                  {block.text}
                </p>
              );
            }
            if (block.kind === 'listItem') {
              return (
                <p key={index} className="pl-4 text-xs leading-relaxed text-text-body">
                  <Spans spans={block.spans} />
                </p>
              );
            }
            return (
              <p key={index} className="text-sm leading-relaxed text-text-body">
                <Spans spans={block.spans} />
              </p>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4:** Wire into `SettingsPanel.tsx`: add `'about'` to the `SettingsTab` union; append `{ id: 'about', label: 'About', icon: Info }` to `sections` (import `Info` from lucide-react); import `AboutSection` and add `{activeTab === 'about' && <AboutSection />}` beside the `guide` branch (line ~1926).
- [ ] **Step 5:** Run: `npx vitest run src/components/settings/AboutSection.test.tsx src/pages/SettingsPanel.test.tsx` — expected: PASS.
- [ ] **Step 6: Commit:** `git add src/components/settings/AboutSection.tsx src/components/settings/AboutSection.test.tsx src/pages/SettingsPanel.tsx && git commit -m "feat(installer): About tab with Licenses screen + Stability attribution"`

---

### Task 13: E2E guard + visual baseline audit

The Electron e2e fixture launches with `VISION_STUDIO_SKIP_BACKEND=1`; without a valid snapshot the overlay must never appear (protects every existing visual baseline by construction — this spec pins that invariant).

**Files:**
- Create: `tests/e2e/first-run-overlay.spec.ts`
- Possibly update: `tests/e2e/visual/snapshots/*settings-panel-all-sections*` (the new About row changes the Settings section list)

- [ ] **Step 1:** `tests/e2e/first-run-overlay.spec.ts`:

```ts
/**
 * #34 installer PR3: the first-run provisioning overlay requires a VALID
 * backend ProvisionStatus snapshot. E2E runs with VISION_STUDIO_SKIP_BACKEND=1,
 * so the overlay must never appear - this guards every other spec (and the
 * visual baselines) against a false first-run takeover.
 */
import { test, expect } from './fixtures/electron.fixture';

test.describe('First-run provisioning overlay', () => {
  test('stays hidden when no backend snapshot exists', async ({ page }) => {
    await expect(page.getByTestId('main-content')).toBeVisible();
    await expect(page.getByTestId('first-run-provisioning')).toHaveCount(0);
  });
});
```

- [ ] **Step 2:** Validate config + spec parse: `npx playwright test --list` (playwright.config.ts is outside the tsc program — this is its check).
- [ ] **Step 3:** `npm run build`, then run the new spec + the visual suite locally: `npx playwright test tests/e2e/first-run-overlay.spec.ts tests/e2e/visual`. Expected: the new spec passes; `settings-panel-all-sections.png` fails on the intentional new About row. Inspect the diff (must show ONLY the added section entry), then regenerate that baseline: `npx playwright test tests/e2e/visual --update-snapshots` and re-run to confirm green. If any other baseline diffs, STOP and investigate — nothing else in this PR may move pixels on those screens.
- [ ] **Step 4: Commit:** `git add tests/e2e/first-run-overlay.spec.ts tests/e2e/visual/snapshots && git commit -m "test(installer): first-run overlay e2e guard + settings visual baseline"`

---

### Task 14: Gates

- [ ] **Step 1:** `npm run typecheck` — PASS.
- [ ] **Step 2:** `npm test` — full Vitest suite PASS (includes `ui-glyphs.test.ts`, `carbon-pro-tokens.test.ts`, `tailwind-source.test.ts` rails).
- [ ] **Step 3:** `backend/venv/Scripts/python.exe -m pytest backend/tests -q` — PASS (+ existing skips).
- [ ] **Step 4:** `npm run build` — PASS.
- [ ] **Step 5:** Fix anything red; commit fixes individually. Then push, open the PR (`gh pr create`, title `feat(installer): first-run provisioning UX + About Licenses (self-contained installer PR3) (#34)`), `gh pr checks --watch`, squash-merge with `--delete-branch`.

## Self-Review (done at authoring time)

- **Spec coverage:** §6 detection (Task 7/8 visibility), pre-flight (Task 8 diskCheck via existing `disk_free_bytes`), orchestration progress/pause/resume/retry/background (Tasks 6/8), per-feature gating honesty (already shipped by the Foundry refusal patterns; overlay copy states it); §4 compliance screen + attribution (Task 12); PR2-deferred reverify endpoint + UX (Tasks 3/4/10); informed-auto-consent disclosure (Task 8, data-derived via Task 2); §9 no-progress-theater (Task 8 fake-timer test); Foundry manual flow untouched (backward-compat).
- **Deliberate scope choices:** spec §6's options (a)/(b)/(c) are served as: (a) one-click comprehensive Install (the locked default), (b) Continue-in-background + per-feature unlock (the "core first" value without a second backend pathway), (c) Skip-for-now + the existing per-model Foundry flow. No subset-start API exists in PR2 and none is invented here. A store-seeded overlay visual snapshot is intentionally omitted: contextBridge properties are non-writable in the packaged e2e app and fabricating store state would violate the seed-via-real-actions rule; the overlay's rendering is covered by component tests and its absence-guard by Task 13.
- **Type consistency:** `format`/`gated` flow backend schema → wire type → slice fixtures → disclosure; all snapshot factories carry both fields; action names match across slice/AppState/components (`startProvisioning`/`pauseProvisioning`/`resumeProvisioning`/`cancelProvisioning`/`reverifyProvisioning`/`refreshProvisionStatus`/`dismissFirstRunProvisioning`/`openFirstRunProvisioning`).
