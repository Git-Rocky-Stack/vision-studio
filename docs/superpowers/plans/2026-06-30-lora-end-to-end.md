# LoRA End-to-End Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing multi-LoRA mixer end-to-end — real installed-LoRA library, a `loras` field carried through the request, and real diffusers load/stack/unload on the local image **and** video pipelines — with compatibility safety, trigger-word insert, Local-only routing, and retirement of the orphaned LoRA stub.

**Architecture:** A LoRA is an installed `ModelRecord` (`artifact_type === 'lora'`) surfaced from the existing models store; the mixer emits `LoRAConfig[]`; a minimal `{id, weight}[]` projection travels through both request payloads, the IPC surface, and both backend Pydantic schemas; the backend applies them via **approach A** (runtime named adapters — `load_lora_weights(adapter_name)` → `set_adapters(weights)` → `unload_lora_weights`) inside `_generate_sync`, bracketed by a `loras_applied()` context manager so the cached pipeline is never mutated. Application is **fail-soft** (missing/incompatible/corrupt LoRAs are skipped and reported).

**Tech Stack:** TypeScript / React 19 / Zustand / Vitest (frontend); Python / FastAPI / diffusers 0.37.1 / PyTorch 2.5.1 / pytest (backend). New backend dependency: `peft` (multi-adapter stacking).

## Global Constraints

- **Approach A only:** load named adapters, `set_adapters` per job, `unload_lora_weights` after — never `fuse_lora` on the cached pipeline.
- **Contract is minimal:** `loras: { id: string; weight: number }[]`. Trigger words are NOT in the payload (UI prompt-insert only). Weight range `0.0`–`2.0`.
- **Local-only:** a non-empty `loras` array forces the Local route; hosted providers (OpenRouter / HuggingFace) are declined with a surfaced message.
- **Fail-soft backend:** a LoRA that is not installed, incompatible, or corrupt is skipped and reported in the job result — it never raises out of generation.
- **Video reality:** LoRA enabled for `animatediff` + `ltx`; disabled with a reason for `svd`.
- **Design system:** `lucide-react` icons only, no emoji / decorative glyphs (ui-glyphs guard), machined radii + Carbon tokens, keyboard-navigable controls.
- **Path alias:** `@/` resolves to `src/`. Store multi-field selectors use `useShallow`.
- **Gates (all green before PR):** `npm run typecheck`, `npm test`, `npm run build`, and `python -m pytest backend/tests -q`.
- **Commit hygiene:** husky pre-commit runs the FULL vitest suite + typecheck on any staged `.ts/.tsx` (slow). Commit via the Bash tool with `export PATH="/c/Program Files/nodejs:$PATH"` and `git branch --show-current` in the same call; never `git add -A` (leave `LICENSE.txt` untracked); never `--no-verify`.

---

### Task 1: Model type LoRA metadata + store selector

**Files:**
- Modify: `src/types/model.ts:68-71` (add optional LoRA metadata to `ModelRecord`)
- Modify: `src/store/slices/modelsSlice.ts:210-224` (add `selectInstalledLoras` + `isLoraCompatible`)
- Test: `src/store/slices/modelsSlice.lora.test.ts` (new)

**Interfaces:**
- Produces: `selectInstalledLoras(models: ModelRecord[]): ModelRecord[]`; `isLoraCompatible(checkpointFamily: string | null, loraFamily: string): boolean`; optional `ModelRecord` fields `trigger_words?: string[]`, `default_weight?: number` (compat family reuses existing `base_architecture`).
- Consumes: `ModelRecord` (`src/types/model.ts`).

- [ ] **Step 1: Write the failing test**

```ts
// src/store/slices/modelsSlice.lora.test.ts
import { describe, expect, it } from 'vitest';
import { selectInstalledLoras, isLoraCompatible } from './modelsSlice';
import type { ModelRecord } from '@/types/model';

function rec(over: Partial<ModelRecord>): ModelRecord {
  return {
    id: 'x', name: 'X', artifact_type: 'checkpoint', capability: 'image',
    base_architecture: 'sdxl', source: 'local', repo_id: null, revision: null,
    aux_repo_id: null, size: '144 MB', status: 'ready', tier: 'compatible',
    quality: 'balanced', runtime: 'local', hardware_class: 'creator', vram: '',
    description: '', license: null, gated: false, ...over,
  };
}

describe('selectInstalledLoras', () => {
  it('returns only installed lora records', () => {
    const models = [
      rec({ id: 'a', artifact_type: 'lora', base_architecture: 'sdxl' }),
      rec({ id: 'b', artifact_type: 'checkpoint' }),
      rec({ id: 'c', artifact_type: 'lora', availability: 'unavailable' }),
    ];
    expect(selectInstalledLoras(models).map((m) => m.id)).toEqual(['a']);
  });
});

describe('isLoraCompatible', () => {
  it('accepts matching and sd-unet-family loras, rejects cross-family', () => {
    expect(isLoraCompatible('sdxl', 'sdxl')).toBe(true);
    expect(isLoraCompatible('sdxl', 'sd-unet-family')).toBe(true);
    expect(isLoraCompatible('sdxl', 'flux')).toBe(false);
    expect(isLoraCompatible('animatediff', 'sd-unet-family')).toBe(true);
  });
  it('rejects everything for svd and a null checkpoint', () => {
    expect(isLoraCompatible('svd', 'sd15')).toBe(false);
    expect(isLoraCompatible(null, 'sdxl')).toBe(false);
    expect(isLoraCompatible('flux', 'unrecognized')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/slices/modelsSlice.lora.test.ts`
Expected: FAIL — `selectInstalledLoras`/`isLoraCompatible` are not exported.

- [ ] **Step 3: Add the optional metadata fields to `ModelRecord`**

In `src/types/model.ts`, inside `interface ModelRecord`, after line 67 (`measured_vram_bytes?: number | null;`) add:

```ts
  // #136 LoRA metadata (best-effort; absent on older/loose-scanned records).
  trigger_words?: string[];
  default_weight?: number;
```

- [ ] **Step 4: Add the selector + compat helper**

In `src/store/slices/modelsSlice.ts`, append after `selectModelsByCapability` (ends line 219):

```ts
/**
 * #136: families a checkpoint of the given base architecture can load LoRAs
 * from. 'sd-unet-family' is the classifier's label for sd15/sdxl non-DiT loras
 * (kohya/diffusers unet- or te-targeting), so it is accepted by both bases and
 * by AnimateDiff (SD1.5 spatial UNet).
 */
const LORA_COMPATIBILITY: Record<string, string[]> = {
  flux: ['flux'],
  sdxl: ['sdxl', 'sd-unet-family'],
  sd15: ['sd15', 'sd-unet-family'],
  sd35: ['sd35'],
  animatediff: ['animatediff', 'sd15', 'sd-unet-family'],
  ltx: ['ltx'],
  svd: [],
};

/** True when a LoRA of `loraFamily` can stack on a `checkpointFamily` pipeline. */
export function isLoraCompatible(
  checkpointFamily: string | null,
  loraFamily: string,
): boolean {
  if (!checkpointFamily) return false;
  const allowed = LORA_COMPATIBILITY[checkpointFamily];
  return allowed ? allowed.includes(loraFamily) : false;
}

/** Installed LoRA records (artifact_type 'lora'), present on disk. */
export function selectInstalledLoras(models: ModelRecord[]): ModelRecord[] {
  return models.filter(
    (model) =>
      model.artifact_type === 'lora' &&
      (model.availability ?? 'available') !== 'unavailable',
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/store/slices/modelsSlice.lora.test.ts`
Expected: PASS (5 assertions across 2 suites).

- [ ] **Step 6: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && git branch --show-current \
  && git add src/types/model.ts src/store/slices/modelsSlice.ts src/store/slices/modelsSlice.lora.test.ts \
  && git commit -m "feat(lora): installed-LoRA selector + compatibility helper (#136)"
```

---

### Task 2: Request contract + payload projection util

**Files:**
- Modify: `src/types/generation.ts:151` (add `LoraSelectionPayload` + `loras?` on `ImageGenerationRequestPayload`)
- Modify: `src/types/electron.d.ts:5,39` (import `LoraSelectionPayload`; add `loras?` on `VideoGenerationParams`)
- Create: `src/utils/loraPayload.ts` (`toLoraSelections`, `appendTrigger`)
- Test: `src/utils/loraPayload.test.ts` (new)

**Interfaces:**
- Produces: `interface LoraSelectionPayload { id: string; weight: number }`; `toLoraSelections(configs: LoRAConfig[]): LoraSelectionPayload[]`; `appendTrigger(prompt: string, trigger: string): string`.
- Consumes: `LoRAConfig` (`src/types/generation.ts:57-63`).

- [ ] **Step 1: Write the failing test**

```ts
// src/utils/loraPayload.test.ts
import { describe, expect, it } from 'vitest';
import { toLoraSelections, appendTrigger } from './loraPayload';
import type { LoRAConfig } from '@/types/generation';

const cfg = (over: Partial<LoRAConfig>): LoRAConfig => ({
  id: 'a', name: 'A', triggerWord: 'trig', weight: 1, color: '#000', ...over,
});

describe('toLoraSelections', () => {
  it('projects LoRAConfig[] down to {id, weight}[]', () => {
    expect(toLoraSelections([cfg({ id: 'x', weight: 0.8 }), cfg({ id: 'y', weight: 1.2 })]))
      .toEqual([{ id: 'x', weight: 0.8 }, { id: 'y', weight: 1.2 }]);
  });
});

describe('appendTrigger', () => {
  it('appends comma-separated, trims, and de-dups', () => {
    expect(appendTrigger('a portrait', 'trig')).toBe('a portrait, trig');
    expect(appendTrigger('', 'trig')).toBe('trig');
    expect(appendTrigger('a trig scene', 'trig')).toBe('a trig scene');
    expect(appendTrigger('x', '  ')).toBe('x');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/loraPayload.test.ts`
Expected: FAIL — module `./loraPayload` not found.

- [ ] **Step 3: Add the contract type**

In `src/types/generation.ts`, immediately before `export interface ImageGenerationRequestPayload {` (line 132) add:

```ts
/** #136: one LoRA adapter to stack, by installed model id + weight (0-2). */
export interface LoraSelectionPayload {
  id: string;
  weight: number;
}
```

Then inside `ImageGenerationRequestPayload`, after line 150 (`acceleration_settings?: AccelerationRequestPayload;`) add:

```ts
  /** #136: local-only LoRA adapters to stack (Local route only). */
  loras?: LoraSelectionPayload[];
```

- [ ] **Step 4: Add `loras` to the video IPC params**

In `src/types/electron.d.ts`, extend the generation import (line 5):

```ts
import type { AccelerationRequestPayload, ImageGenerationRequestPayload, LoraSelectionPayload } from './generation';
```

Then inside `interface VideoGenerationParams`, after line 39 (`acceleration_settings?: AccelerationRequestPayload;`) add:

```ts
  /** #136: local-only LoRA adapters to stack (Local route only). */
  loras?: LoraSelectionPayload[];
```

- [ ] **Step 5: Create the projection util**

```ts
// src/utils/loraPayload.ts
import type { LoRAConfig, LoraSelectionPayload } from '@/types/generation';

/** Project the mixer's LoRAConfig[] down to the minimal request contract. */
export function toLoraSelections(configs: LoRAConfig[]): LoraSelectionPayload[] {
  return configs.map((config) => ({ id: config.id, weight: config.weight }));
}

/**
 * Append a LoRA trigger word to a prompt: comma-separated, trimmed, and
 * de-duplicated against whitespace/comma-delimited tokens already present.
 */
export function appendTrigger(prompt: string, trigger: string): string {
  const token = trigger.trim();
  if (!token) return prompt;
  const existing = prompt.split(/[\s,]+/).filter(Boolean);
  if (existing.includes(token)) return prompt;
  const base = prompt.trim();
  return base ? `${base}, ${token}` : token;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/utils/loraPayload.test.ts && npm run typecheck`
Expected: PASS (2 suites); typecheck clean.

- [ ] **Step 7: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && git branch --show-current \
  && git add src/types/generation.ts src/types/electron.d.ts src/utils/loraPayload.ts src/utils/loraPayload.test.ts \
  && git commit -m "feat(lora): loras request contract + payload projection util (#136)"
```

---

### Task 3: LoRAMixer real library, compatibility, trigger insert

**Files:**
- Modify: `src/components/generate/LoRAMixer.tsx` (replace hardcoded library; add props)
- Test: `src/components/generate/LoRAMixer.test.tsx` (new)

**Interfaces:**
- Produces: `LoRAMixer` props `{ configs: LoRAConfig[]; onChange: (c: LoRAConfig[]) => void; baseArchitecture: string | null; onInsertTrigger: (trigger: string) => void; disabledReason?: string | null }`. Selected `LoRAConfig.id` is the installed model id (used verbatim by the payload).
- Consumes: `selectInstalledLoras`, `isLoraCompatible` (Task 1); `useAppStore`; `ModelRecord`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/generate/LoRAMixer.test.tsx
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoRAMixer } from './LoRAMixer';
import { useAppStore } from '@/store/appStore';
import type { ModelRecord } from '@/types/model';

function lora(over: Partial<ModelRecord>): ModelRecord {
  return {
    id: 'l1', name: 'Detail SDXL', artifact_type: 'lora', capability: 'image',
    base_architecture: 'sdxl', source: 'local', repo_id: null, revision: null,
    aux_repo_id: null, size: '144 MB', status: 'ready', tier: 'compatible',
    quality: 'balanced', runtime: 'local', hardware_class: 'creator', vram: '',
    description: '', license: null, gated: false, trigger_words: ['det_sdxl'], ...over,
  };
}

describe('LoRAMixer', () => {
  beforeEach(() => {
    useAppStore.setState({
      availableModels: [
        lora({ id: 'l1', name: 'Detail SDXL', base_architecture: 'sdxl', trigger_words: ['det_sdxl'] }),
        lora({ id: 'l2', name: 'Flux Film', base_architecture: 'flux' }),
      ],
    });
  });
  afterEach(cleanup);

  it('lists only base-compatible installed LoRAs in the picker', async () => {
    const user = userEvent.setup();
    render(<LoRAMixer configs={[]} onChange={vi.fn()} baseArchitecture="sdxl" onInsertTrigger={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /add lora/i }));
    expect(screen.getByText('Detail SDXL')).toBeInTheDocument();
    expect(screen.queryByText('Flux Film')).not.toBeInTheDocument();
  });

  it('adds a LoRA keyed by the model id', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<LoRAMixer configs={[]} onChange={onChange} baseArchitecture="sdxl" onInsertTrigger={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /add lora/i }));
    await user.click(screen.getByText('Detail SDXL'));
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'l1', name: 'Detail SDXL', weight: 1 }),
    ]);
  });

  it('reveals incompatible LoRAs behind the override toggle', async () => {
    const user = userEvent.setup();
    render(<LoRAMixer configs={[]} onChange={vi.fn()} baseArchitecture="sdxl" onInsertTrigger={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /add lora/i }));
    await user.click(screen.getByRole('button', { name: /show incompatible/i }));
    expect(screen.getByText('Flux Film')).toBeInTheDocument();
  });

  it('inserts a trigger word from a selected LoRA', async () => {
    const user = userEvent.setup();
    const onInsertTrigger = vi.fn();
    render(
      <LoRAMixer
        configs={[{ id: 'l1', name: 'Detail SDXL', triggerWord: 'det_sdxl', weight: 1, color: '#000' }]}
        onChange={vi.fn()}
        baseArchitecture="sdxl"
        onInsertTrigger={onInsertTrigger}
      />,
    );
    await user.click(screen.getByRole('button', { name: /insert trigger det_sdxl/i }));
    expect(onInsertTrigger).toHaveBeenCalledWith('det_sdxl');
  });

  it('renders a disabled reason instead of the picker', () => {
    render(
      <LoRAMixer configs={[]} onChange={vi.fn()} baseArchitecture="svd" onInsertTrigger={vi.fn()}
        disabledReason="LoRA is not supported for this video model." />,
    );
    expect(screen.getByText(/not supported for this video model/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add lora/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/generate/LoRAMixer.test.tsx`
Expected: FAIL — props/behavior not implemented (still using `AVAILABLE_LORAS`).

- [ ] **Step 3: Rewrite the library source + props**

In `src/components/generate/LoRAMixer.tsx`:

Replace the imports block additions — add near the top (after line 4):

```ts
import { useAppStore } from '@/store/appStore';
import { useShallow } from 'zustand/react/shallow';
import { selectInstalledLoras, isLoraCompatible } from '@/store/slices/modelsSlice';
import type { ModelRecord } from '@/types/model';
```

Delete the `AVAILABLE_LORAS` placeholder array (lines 43-53).

Replace the props interface (lines 55-58) with:

```ts
interface LoRAMixerProps {
  configs: LoRAConfig[];
  onChange: (configs: LoRAConfig[]) => void;
  /** base_architecture of the currently selected checkpoint/video model. */
  baseArchitecture: string | null;
  onInsertTrigger: (triggerWord: string) => void;
  /** When set, the mixer renders a disabled note instead of the picker. */
  disabledReason?: string | null;
}
```

- [ ] **Step 4: Wire the store, compatibility, and trigger insert**

Replace the component body from `export function LoRAMixer({ configs, onChange }: LoRAMixerProps) {` (line 140) through the end of `addLoRA`/`filteredLoRAs` with a store-driven version. Concretely:

Update the signature and add store + toggle state (replace lines 140-143):

```ts
export function LoRAMixer({
  configs,
  onChange,
  baseArchitecture,
  onInsertTrigger,
  disabledReason = null,
}: LoRAMixerProps) {
  const [showBrowser, setShowBrowser] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showIncompatible, setShowIncompatible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(configs.length > 0);

  const installed = useAppStore(useShallow((s) => selectInstalledLoras(s.availableModels)));
```

Replace `addLoRA` (lines 163-178) to build a config from a `ModelRecord` keyed by model id:

```ts
  const addLoRA = useCallback(
    (record: ModelRecord) => {
      const newConfig: LoRAConfig = {
        id: record.id,
        name: record.name,
        triggerWord: record.trigger_words?.[0] ?? '',
        weight: record.default_weight ?? 1.0,
        color: LORA_COLORS[configs.length % LORA_COLORS.length],
      };
      onChange([...configs, newConfig]);
      setShowBrowser(false);
      setSearchQuery('');
      setIsExpanded(true);
    },
    [configs, onChange],
  );
```

Replace `filteredLoRAs` (lines 194-201) with a store + compatibility filter:

```ts
  const selectedIds = new Set(configs.map((c) => c.id));
  const matchesQuery = (r: ModelRecord) =>
    !searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase());
  const compatibleLoras = installed.filter(
    (r) => !selectedIds.has(r.id) && matchesQuery(r) && isLoraCompatible(baseArchitecture, r.base_architecture),
  );
  const incompatibleLoras = installed.filter(
    (r) => !selectedIds.has(r.id) && matchesQuery(r) && !isLoraCompatible(baseArchitecture, r.base_architecture),
  );
  const browserLoras = showIncompatible ? [...compatibleLoras, ...incompatibleLoras] : compatibleLoras;
```

- [ ] **Step 5: Render disabled state, real picker rows, override toggle, trigger chips**

Add the disabled short-circuit at the top of the returned JSX (before the collapsed `if (!isExpanded ...)` block, line 203):

```tsx
  if (disabledReason) {
    return (
      <div className="rounded-md border border-dashed border-border bg-elevated/40 px-3 py-3">
        <p className="text-xs text-text-muted">{disabledReason}</p>
      </div>
    );
  }
```

In the active-LoRA card (`SortableLoRACard`, after the `<Slider .../>` at line 134) add a trigger chip when a trigger exists. Update `SortableLoRACard`'s props to accept `onInsertTrigger?: () => void` and render:

```tsx
        {config.triggerWord && (
          <button
            type="button"
            onClick={onInsertTrigger}
            aria-label={`Insert trigger ${config.triggerWord}`}
            className="mt-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 type-badge text-text-muted hover:text-text-primary hover:bg-elevated transition-all"
          >
            <Plus className="w-3 h-3" />
            {config.triggerWord}
          </button>
        )}
```

Pass it down where `SortableLoRACard` is rendered (line 243):

```tsx
                    onInsertTrigger={() => onInsertTrigger(config.triggerWord)}
```

Replace the browser list `.map` (lines 279-300) to iterate `browserLoras` (a `ModelRecord[]`), showing size and an incompatible marker; and add the override toggle above/below the list:

```tsx
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {browserLoras.map((record) => {
                    const compatible = isLoraCompatible(baseArchitecture, record.base_architecture);
                    return (
                      <button
                        key={record.id}
                        onClick={() => addLoRA(record)}
                        className="w-full flex items-center justify-between px-2.5 py-2 rounded-md hover:bg-elevated transition-all text-left"
                      >
                        <div>
                          <p className="text-xs font-medium text-text-primary">{record.name}</p>
                          <p className="type-badge text-text-muted">
                            {record.size}{!compatible ? ' - incompatible' : ''}
                          </p>
                        </div>
                        <Plus className="w-3.5 h-3.5 text-text-muted" />
                      </button>
                    );
                  })}
                  {browserLoras.length === 0 && (
                    <p className="text-xs text-text-muted text-center py-3">
                      {installed.length === 0 ? 'No LoRAs installed - add some in the Foundry' : 'No compatible LoRAs found'}
                    </p>
                  )}
                </div>

                {incompatibleLoras.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowIncompatible((v) => !v)}
                    className="w-full text-xs text-text-muted hover:text-text-primary text-center py-1"
                  >
                    {showIncompatible ? 'Hide incompatible' : `Show incompatible (may fail) (${incompatibleLoras.length})`}
                  </button>
                )}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/components/generate/LoRAMixer.test.tsx && npm run typecheck`
Expected: PASS (5 tests); typecheck clean.

- [ ] **Step 7: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && git branch --show-current \
  && git add src/components/generate/LoRAMixer.tsx src/components/generate/LoRAMixer.test.tsx \
  && git commit -m "feat(lora): real installed-LoRA library + compatibility + trigger insert in the mixer (#136)"
```

---

### Task 4: Wire LoRA through the image generation path (GeneratePanel)

**Files:**
- Modify: `src/pages/GeneratePanel.tsx` (base-arch lookup; mixer props; image payload `loras`; Local-only routing; trigger insert)
- Test: `src/pages/GeneratePanel.test.tsx` (add cases)

**Interfaces:**
- Consumes: `toLoraSelections`, `appendTrigger` (Task 2); `LoRAMixer` new props (Task 3); `availableModels` from store.
- Produces: the image request now carries `loras`; a LoRA-bearing hosted-image job is blocked with a message.

- [ ] **Step 1: Write the failing test**

Add to `src/pages/GeneratePanel.test.tsx` (follow the existing harness in that file; seed a ready SDXL checkpoint + one installed SDXL LoRA in the store, select image mode, add a LoRA, click Generate, and assert the IPC payload):

```tsx
it('carries selected LoRAs in the image generation payload', async () => {
  const generateImage = vi.fn().mockResolvedValue({ success: true, jobId: 'job-1' });
  // installElectronMock() must expose window.electron.generation.generateImage = generateImage
  // and seed availableModels with an sdxl checkpoint (id 'sdxl-base') + an sdxl lora (id 'l1').
  // ...render <GeneratePanel/>, add LoRA 'l1' via the mixer, trigger Generate...
  await waitFor(() => expect(generateImage).toHaveBeenCalled());
  const payload = generateImage.mock.calls[0][0];
  expect(payload.loras).toEqual([{ id: 'l1', weight: 1 }]);
});
```

> Note: reuse the file's existing `installElectronMock`/render helpers; only the LoRA-specific seeding + assertion is new. If the existing harness lacks `generation.generateImage`, extend the mock there (do not fabricate a second harness).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/GeneratePanel.test.tsx -t "carries selected LoRAs"`
Expected: FAIL — payload has no `loras` key.

- [ ] **Step 3: Import the utils + resolve base architecture**

In `src/pages/GeneratePanel.tsx`, add to the imports:

```ts
import { toLoraSelections, appendTrigger } from '@/utils/loraPayload';
```

Add an `availableModels` selection near the other store selectors and derive the selected image base architecture (place after the `imageConfig` state, ~line 349):

```ts
  const availableModels = useAppStore((s) => s.availableModels);
  const selectedImageBaseArch =
    availableModels.find((m) => m.id === imageConfig.model)?.base_architecture ?? null;
```

- [ ] **Step 4: Force Local for LoRA-bearing hosted image jobs**

Extend both unsupported-input guards. In `openRouterUnsupportedInputs` (line 592) and `huggingFaceUnsupportedInputs` (line 603), add a LoRA clause to each disjunction:

```ts
        resolvedCanvasControlLayers.errors.length > 0 ||
        refConfig.loraConfigs.length > 0);
```

And update the two block messages (lines 674-675 and 685-686) to mention LoRA, e.g.:

```ts
          'OpenRouter still-image routing supports prompt-only generations. Switch the active account back to Local for ControlNet, inpaint, reference-image, or LoRA passes.',
```

- [ ] **Step 5: Attach `loras` to the image payload + mixer props + trigger insert**

In the image request literal (after line 824's inpaint spread, before `acceleration_settings`) add:

```ts
          ...(refConfig.loraConfigs.length > 0
            ? { loras: toLoraSelections(refConfig.loraConfigs) }
            : {}),
```

Update the `<LoRAMixer .../>` render (lines 1542-1545):

```tsx
              <LoRAMixer
                configs={refConfig.loraConfigs}
                onChange={(value) => updateRefConfig({ loraConfigs: value })}
                baseArchitecture={selectedImageBaseArch}
                onInsertTrigger={(trigger) =>
                  updateImageConfig({ prompt: appendTrigger(imageConfig.prompt, trigger) })
                }
              />
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/pages/GeneratePanel.test.tsx && npm run typecheck`
Expected: PASS (new case + existing cases green); typecheck clean.

- [ ] **Step 7: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && git branch --show-current \
  && git add src/pages/GeneratePanel.tsx src/pages/GeneratePanel.test.tsx \
  && git commit -m "feat(lora): wire LoRAs through the image generation payload + Local-only routing (#136)"
```

---

### Task 5: Wire LoRA through the video generation path (GeneratePanel)

**Files:**
- Modify: `src/pages/GeneratePanel.tsx` (render mixer for video with SVD-disable; video payload `loras`; Local-only for HF video)
- Test: `src/pages/GeneratePanel.test.tsx` (add cases)

**Interfaces:**
- Consumes: `selectedVideoBaseArch`; `isLoraCompatible`; `toLoraSelections`.
- Produces: video payload carries `loras` for LoRA-capable models; SVD disables the mixer; HF video + LoRA is blocked.

- [ ] **Step 1: Write the failing test**

Add to `src/pages/GeneratePanel.test.tsx`:

```tsx
it('disables the LoRA mixer for SVD video and omits loras', async () => {
  // seed videoModel 'svd'; render in video mode; the mixer shows the disabled note
  // and the video payload has no loras key.
  // ...assert screen.getByText(/not supported for this video model/i)...
});

it('carries selected LoRAs in the video payload for animatediff', async () => {
  // seed videoModel 'animate-diff' (base 'animatediff') + an sd-unet-family lora;
  // add it, Generate, assert generateVideo payload.loras === [{ id, weight }]
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/GeneratePanel.test.tsx -t "video"`
Expected: FAIL — mixer not rendered in the video branch; payload lacks `loras`.

- [ ] **Step 3: Derive the video base arch + disabled reason + enabled flag**

Near the image base-arch derivation (Task 4 Step 3) add:

```ts
  const selectedVideoBaseArch =
    availableModels.find((m) => m.id === imageConfig.videoModel)?.base_architecture ?? null;
  const videoLorasEnabled = LORA_CAPABLE_VIDEO.has(selectedVideoBaseArch ?? '');
```

Add near the top of the file (module scope) the capable set:

```ts
const LORA_CAPABLE_VIDEO = new Set(['animatediff', 'ltx']);
```

- [ ] **Step 4: Render the mixer in the video section**

In the video branch (inside the `GenerateSectionCard` around line 1521, after `<VideoControls />`), add:

```tsx
              <LoRAMixer
                configs={refConfig.loraConfigs}
                onChange={(value) => updateRefConfig({ loraConfigs: value })}
                baseArchitecture={selectedVideoBaseArch}
                onInsertTrigger={(trigger) =>
                  updateImageConfig({ prompt: appendTrigger(imageConfig.prompt, trigger) })
                }
                disabledReason={
                  videoLorasEnabled ? null : 'LoRA is not supported for this video model.'
                }
              />
```

- [ ] **Step 5: Block HF video + LoRA, attach `loras` to the video payload**

Add a guard alongside the other HF-video guards (after line 669):

```ts
    if (useHuggingFaceVideo && refConfig.loraConfigs.length > 0) {
      updateGenStatus({
        status: 'error',
        errorMessage: 'HuggingFace video routing supports prompt-only generations. Switch the active account back to Local to use LoRAs.',
        isGenerating: false,
      });
      isGeneratingRef.current = false;
      return;
    }
```

In the video request literal (inside `generation.generateVideo({...})`, after `seed:` at line 865, before `acceleration_settings`) add:

```ts
          ...(videoLorasEnabled && refConfig.loraConfigs.length > 0
            ? { loras: toLoraSelections(refConfig.loraConfigs) }
            : {}),
```

Add the `isLoraCompatible` note: no code needed — the mixer already filters. (`videoLorasEnabled` prevents sending stale image-mode LoRAs to an SVD job.)

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/pages/GeneratePanel.test.tsx && npm run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 7: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && git branch --show-current \
  && git add src/pages/GeneratePanel.tsx src/pages/GeneratePanel.test.tsx \
  && git commit -m "feat(lora): wire LoRAs through the video path (animatediff/ltx) with SVD-disable (#136)"
```

---

### Task 6: Backend LoRA applier (pure, CI-testable)

**Files:**
- Create: `backend/foundry/lora.py`
- Test: `backend/tests/test_lora_apply.py`

**Interfaces:**
- Produces: `resolve_lora_path(record) -> Optional[str]`; `apply_loras(pipeline, loras, resolve_record, *, logger=None) -> {"applied": [...], "skipped": [...]}`; `clear_loras(pipeline) -> None`; `loras_applied(pipeline, loras, resolve_record, *, logger=None)` (context manager yielding the apply result and always clearing).
- Consumes: a `resolve_record: Callable[[str], Optional[dict]]` (the caller passes `model_registry.get_record`), and a diffusers pipeline exposing `load_lora_weights`, `set_adapters`, `unload_lora_weights`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_lora_apply.py
from contextlib import suppress
from unittest.mock import MagicMock

from foundry.lora import apply_loras, clear_loras, loras_applied, resolve_lora_path


def _record(path):
    return {"locations": [path]}


def test_resolve_lora_path_picks_local_safetensors(tmp_path):
    f = tmp_path / "a.safetensors"; f.write_bytes(b"x")
    assert resolve_lora_path(_record(str(f))) == str(f)
    assert resolve_lora_path({"locations": ["/nope/x.safetensors"]}) is None
    assert resolve_lora_path(None) is None


def test_apply_loads_named_adapters_and_sets_weights(tmp_path):
    a = tmp_path / "a.safetensors"; a.write_bytes(b"x")
    b = tmp_path / "b.safetensors"; b.write_bytes(b"x")
    resolve = {"a": _record(str(a)), "b": _record(str(b))}.get
    pipe = MagicMock()
    result = apply_loras(pipe, [{"id": "a", "weight": 0.8}, {"id": "b", "weight": 1.2}], resolve)
    assert pipe.load_lora_weights.call_count == 2
    pipe.set_adapters.assert_called_once_with(["a", "b"], [0.8, 1.2])
    assert [x["id"] for x in result["applied"]] == ["a", "b"]
    assert result["skipped"] == []


def test_apply_skips_uninstalled():
    pipe = MagicMock()
    result = apply_loras(pipe, [{"id": "ghost", "weight": 1.0}], lambda _id: None)
    pipe.load_lora_weights.assert_not_called()
    pipe.set_adapters.assert_not_called()
    assert result["skipped"] == [{"id": "ghost", "reason": "not installed"}]


def test_apply_is_failsoft_on_load_error(tmp_path):
    good = tmp_path / "g.safetensors"; good.write_bytes(b"x")
    bad = tmp_path / "b.safetensors"; bad.write_bytes(b"x")
    resolve = {"good": _record(str(good)), "bad": _record(str(bad))}.get
    pipe = MagicMock()
    pipe.load_lora_weights.side_effect = [None, RuntimeError("size mismatch")]
    result = apply_loras(pipe, [{"id": "good", "weight": 1.0}, {"id": "bad", "weight": 1.0}], resolve)
    assert [x["id"] for x in result["applied"]] == ["good"]
    assert result["skipped"][0]["id"] == "bad"
    pipe.set_adapters.assert_called_once_with(["good"], [1.0])
    assert pipe.unload_lora_weights.call_count == 1  # cleared partial state on failure


def test_loras_applied_clears_even_on_error(tmp_path):
    a = tmp_path / "a.safetensors"; a.write_bytes(b"x")
    pipe = MagicMock()
    with suppress(ValueError):
        with loras_applied(pipe, [{"id": "a", "weight": 1.0}], lambda _id: _record(str(a))):
            raise ValueError("boom")
    pipe.unload_lora_weights.assert_called_once()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_lora_apply.py -q`
Expected: FAIL — module `foundry.lora` does not exist.

- [ ] **Step 3: Implement the applier**

```python
# backend/foundry/lora.py
"""#136: apply installed LoRA adapters onto a diffusers pipeline (approach A).

Runtime named adapters: load each LoRA as a named adapter, set the stack weights
for the job, and unload afterward so the cached base pipeline is never mutated.
Fail-soft: a LoRA that is not installed or fails to load is skipped and reported,
never crashing the generation. Multi-adapter set_adapters requires `peft`.

Intentionally free of heavy imports (no torch/diffusers) so it loads on CI and is
unit-testable with a mock pipeline and a fake record resolver.
"""
from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Any, Callable, Dict, List, Optional

RecordResolver = Callable[[str], Optional[Dict[str, Any]]]


def resolve_lora_path(record: Optional[Dict[str, Any]]) -> Optional[str]:
    """First local .safetensors location for a LoRA record, else None."""
    if not record:
        return None
    for location in record.get("locations") or []:
        if isinstance(location, str) and location.endswith(".safetensors") and os.path.isfile(location):
            return location
    return None


def apply_loras(
    pipeline,
    loras: List[Dict[str, Any]],
    resolve_record: RecordResolver,
    *,
    logger=None,
) -> Dict[str, List[Dict[str, Any]]]:
    """Load + activate the requested LoRAs on `pipeline`. Fail-soft per adapter."""
    applied: List[Dict[str, Any]] = []
    skipped: List[Dict[str, Any]] = []
    for selection in loras or []:
        lora_id = selection.get("id")
        if not lora_id:
            continue
        weight = float(selection.get("weight", 1.0))
        path = resolve_lora_path(resolve_record(lora_id))
        if path is None:
            skipped.append({"id": lora_id, "reason": "not installed"})
            continue
        try:
            pipeline.load_lora_weights(path, adapter_name=lora_id)
            applied.append({"id": lora_id, "weight": weight})
        except Exception as exc:  # incompatible base / corrupt weights: fail-soft
            skipped.append({"id": lora_id, "reason": f"load failed: {type(exc).__name__}"})
            try:
                pipeline.unload_lora_weights()
            except Exception:
                pass
    if applied:
        pipeline.set_adapters([a["id"] for a in applied], [a["weight"] for a in applied])
    if logger and skipped:
        logger.info("LoRA skipped: %s", skipped)
    return {"applied": applied, "skipped": skipped}


def clear_loras(pipeline) -> None:
    """Restore the cached base pipeline to a LoRA-free state (best-effort)."""
    unload = getattr(pipeline, "unload_lora_weights", None)
    if callable(unload):
        try:
            unload()
        except Exception:
            pass


@contextmanager
def loras_applied(pipeline, loras: List[Dict[str, Any]], resolve_record: RecordResolver, *, logger=None):
    """Apply LoRAs for the duration of one generation, then always clear them."""
    result = apply_loras(pipeline, loras, resolve_record, logger=logger)
    try:
        yield result
    finally:
        clear_loras(pipeline)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest backend/tests/test_lora_apply.py -q`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && git branch --show-current \
  && git add backend/foundry/lora.py backend/tests/test_lora_apply.py \
  && git commit -m "feat(lora): backend LoRA applier - named adapters, fail-soft, always-clear (#136)"
```

---

### Task 7: Backend request schema + thread `loras` to the generators

**Files:**
- Modify: `backend/main.py` (add `LoraSelection`; `loras` on both request models; thread into `generate_direct` + `process_video_generation`)
- Test: `backend/tests/test_lora_request.py` (new)

**Interfaces:**
- Consumes: `ImageGenerationRequest` / `VideoGenerationRequest` (`backend/main.py:431,445`); `direct_generator.generate_image` / `direct_video_generator.generate_video` (extended in Tasks 8-9).
- Produces: both request schemas accept `loras: List[LoraSelection]`; `generate_direct` and `process_video_generation` pass `loras=[l.dict() for l in request.loras]`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_lora_request.py
from main import ImageGenerationRequest, VideoGenerationRequest


def test_image_request_accepts_and_clamps_loras():
    req = ImageGenerationRequest(prompt="x", loras=[{"id": "l1", "weight": 0.8}])
    assert req.loras[0].id == "l1"
    assert req.loras[0].weight == 0.8


def test_video_request_defaults_loras_empty():
    req = VideoGenerationRequest(prompt="x")
    assert req.loras == []


def test_weight_out_of_range_is_rejected():
    import pytest
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        ImageGenerationRequest(prompt="x", loras=[{"id": "l1", "weight": 5.0}])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_lora_request.py -q`
Expected: FAIL — `ImageGenerationRequest` has no `loras` field.

- [ ] **Step 3: Add the `LoraSelection` model + `loras` fields**

In `backend/main.py`, ensure `List` is imported from `typing` (add to the existing typing import if absent). Immediately before `class ImageGenerationRequest` (line 431) add:

```python
class LoraSelection(BaseModel):
    id: str = Field(..., description="Installed LoRA model id")
    weight: float = Field(default=1.0, ge=0.0, le=2.0, description="Adapter weight (0-2)")
```

Add to `ImageGenerationRequest` (after line 442) and `VideoGenerationRequest` (after line 456):

```python
    loras: List[LoraSelection] = Field(default_factory=list, description="#136 local LoRA adapters")
```

- [ ] **Step 4: Thread `loras` into the generators**

In `generate_direct` (line 1335) add the kwarg to the `direct_generator.generate_image(...)` call:

```python
        loras=[l.dict() for l in request.loras],
```

In `process_video_generation` (line 1446) add the same to `direct_video_generator.generate_video(...)`:

```python
        loras=[l.dict() for l in request.loras],
```

- [ ] **Step 5: Run test to verify it passes**

Run: `python -m pytest backend/tests/test_lora_request.py -q`
Expected: PASS (3 tests).

> Note: `generate_image`/`generate_video` must accept `loras` (Tasks 8-9). Sequence Task 7 before running the full backend suite, or land 7-9 together; the schema test above is independent and passes now.

- [ ] **Step 6: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && git branch --show-current \
  && git add backend/main.py backend/tests/test_lora_request.py \
  && git commit -m "feat(lora): loras on both request schemas + threaded to the generators (#136)"
```

---

### Task 8: Apply LoRAs on the image pipeline (`direct_generator.py`)

**Files:**
- Modify: `backend/utils/direct_generator.py` (`generate_image` + `_generate_sync` accept `loras`; bracket the pipeline call with `loras_applied`)
- Test: `backend/tests/test_direct_generator_loras.py` (new, `HAS_DEPS`-gated for the torch path)

**Interfaces:**
- Consumes: `foundry.lora.loras_applied`; `model_registry.get_record` (lazy import from `main`, mirroring `resolve_plan`).
- Produces: `generate_image(..., loras=None)`; the returned result dict gains `"loras": {"applied": [...], "skipped": [...]}`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_direct_generator_loras.py
import os
import pytest

HAS_DEPS = False
try:
    import torch  # noqa: F401
    import diffusers  # noqa: F401
    HAS_DEPS = True
except Exception:
    pass

pytestmark = pytest.mark.skipif(not HAS_DEPS, reason="requires torch + diffusers")


def test_generate_sync_brackets_pipeline_call_with_loras(monkeypatch, tmp_path):
    """_generate_sync must apply LoRAs, call the pipeline once, then clear."""
    from utils import direct_generator as dg

    gen = dg.DirectGenerator.__new__(dg.DirectGenerator)  # bypass heavy __init__
    gen.device = "cpu"
    gen.output_dir = str(tmp_path)
    gen.applied_acceleration = {}

    calls = []
    fake_pipeline = _FakePipeline(calls)
    monkeypatch.setattr(gen, "load_model", lambda *a, **k: fake_pipeline)
    monkeypatch.setattr(gen, "_configure_scheduler", lambda p, s: p)

    result = gen._generate_sync(
        prompt="x", negative_prompt="", width=64, height=64, steps=1,
        cfg_scale=7.5, seed=1, model_name="sdxl-base", scheduler="euler",
        progress_callback_fn=lambda *a: None, output_dir=str(tmp_path),
        loras=[{"id": "l1", "weight": 1.0}],
    )
    assert calls == ["load_lora_weights", "set_adapters", "__call__", "unload_lora_weights"]
    assert "loras" in result
```

> `_FakePipeline` records `load_lora_weights`/`set_adapters`/`__call__`/`unload_lora_weights` and returns an object with `.images = [PIL.Image]`; place it in the test module. Because `resolve_lora_path` requires a real file, the test also monkeypatches the record resolver to point at a temp `.safetensors` (or patches `dg.resolve_lora_path` to return that path).

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_direct_generator_loras.py -q`
Expected: FAIL (locally, with deps) — `_generate_sync` has no `loras` parameter. (Skips on CI.)

- [ ] **Step 3: Import the applier + a record resolver**

At the top of `backend/utils/direct_generator.py` add:

```python
from foundry.lora import loras_applied
```

Add a small module-level resolver (mirrors `resolve_plan`'s lazy `main` import) near `resolve_plan` (after line 95):

```python
def _resolve_lora_record(model_id: str):
    from main import model_registry
    return model_registry.get_record(model_id)
```

- [ ] **Step 4: Thread `loras` through `generate_image` -> `_generate_sync`**

Add `loras: Optional[List[Dict[str, Any]]] = None,` to the `generate_image` signature (after `acceleration_settings=None,` at line 310) and pass it into the executor call (`_generate_sync` args at line 336-351) as the final argument.

Add `loras: Optional[List[Dict[str, Any]]] = None,` to the `_generate_sync` signature (after `acceleration_settings=None,` at line 372).

- [ ] **Step 5: Bracket the pipeline call**

In `_generate_sync`, wrap the `with torch.inference_mode(): output = pipeline(...)` block (lines 395-405) with the context manager and capture the result:

```python
        with loras_applied(pipeline, loras or [], _resolve_lora_record) as lora_result:
            with torch.inference_mode():
                output = pipeline(
                    prompt=prompt,
                    negative_prompt=negative_prompt if negative_prompt else None,
                    width=width,
                    height=height,
                    num_inference_steps=steps,
                    guidance_scale=cfg_scale,
                    generator=generator,
                    callback_on_step_end=_on_step_end,
                )
```

Then add `"loras": lora_result,` to the returned result dict (the dict beginning at line 414).

- [ ] **Step 6: Run test to verify it passes**

Run: `python -m pytest backend/tests/test_direct_generator_loras.py -q`
Expected: PASS locally (with deps); SKIP on CI. Also run `python -m pytest backend/tests/test_lora_apply.py backend/tests/test_lora_request.py -q` → PASS.

- [ ] **Step 7: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && git branch --show-current \
  && git add backend/utils/direct_generator.py backend/tests/test_direct_generator_loras.py \
  && git commit -m "feat(lora): apply/clear LoRAs around the image pipeline call (#136)"
```

---

### Task 9: Apply LoRAs on the video pipeline (`direct_video_generator.py`)

**Files:**
- Modify: `backend/utils/direct_video_generator.py` (`generate_video` + `_generate_sync` accept `loras`; bracket the pipeline call; skip for SVD)
- Test: `backend/tests/test_direct_video_generator_loras.py` (new, `HAS_DEPS`-gated)

**Interfaces:**
- Consumes: `foundry.lora.loras_applied`; `_resolve_lora_record` (add a local copy, mirroring Task 8).
- Produces: `generate_video(..., loras=None)`; both the text-to-video and image-to-video pipeline calls are bracketed; `svd` never applies LoRAs.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_direct_video_generator_loras.py
import pytest

HAS_DEPS = False
try:
    import torch  # noqa: F401
    import diffusers  # noqa: F401
    HAS_DEPS = True
except Exception:
    pass

pytestmark = pytest.mark.skipif(not HAS_DEPS, reason="requires torch + diffusers")


def test_video_generate_sync_brackets_loras_for_animatediff(monkeypatch, tmp_path):
    from utils import direct_video_generator as dvg
    gen = dvg.DirectVideoGenerator.__new__(dvg.DirectVideoGenerator)
    gen.device = "cpu"; gen.output_dir = str(tmp_path); gen.applied_acceleration = {}
    calls = []
    fake_pipeline = _FakeVideoPipeline(calls)
    monkeypatch.setattr(gen, "load_model", lambda *a, **k: fake_pipeline)
    monkeypatch.setattr(dvg, "resolve_video_model_strategy", lambda *a, **k: "text-to-video")
    monkeypatch.setattr(gen, "_export_frames_to_video", lambda *a, **k: None)
    gen._generate_sync(
        prompt="x", image_path=None, width=64, height=64, fps=8, duration=1,
        steps=1, model_name="animate-diff", seed=0, output_dir=str(tmp_path),
        loras=[{"id": "l1", "weight": 1.0}],
    )
    assert calls[:2] == ["load_lora_weights", "set_adapters"]
    assert "unload_lora_weights" in calls
```

> `_FakeVideoPipeline` returns an object with `.frames = [[frame, ...]]`; monkeypatch `resolve_lora_path`/resolver to a temp file as in Task 8.

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_direct_video_generator_loras.py -q`
Expected: FAIL locally (no `loras` param); SKIP on CI.

- [ ] **Step 3: Import applier + resolver; thread `loras`**

Add to the top of `backend/utils/direct_video_generator.py`:

```python
from foundry.lora import loras_applied
```

Add the local resolver near the module top-level (mirroring Task 8):

```python
def _resolve_lora_record(model_id: str):
    from main import model_registry
    return model_registry.get_record(model_id)
```

Add `loras: Optional[List[Dict[str, Any]]] = None,` to `generate_video` (after `acceleration_settings=None,` at line 357) and thread it into the executor call to `_generate_sync`. Add the same parameter to `_generate_sync` (after `acceleration_settings=None,` at line 289).

- [ ] **Step 4: Bracket both pipeline calls; skip SVD**

In `_generate_sync`, compute the effective LoRAs (empty for SVD) and wrap both `pipeline(...)` calls (lines 299-322) in a single `loras_applied` block:

```python
        # svd (StableVideoDiffusionPipeline) has no text/LoRA conditioning path.
        effective_loras = [] if strategy != "text-to-video" and model_name == "svd" else (loras or [])
        with loras_applied(pipeline, effective_loras, _resolve_lora_record) as lora_result:
            if strategy == "text-to-video":
                output = pipeline(
                    prompt=prompt,
                    negative_prompt="worst quality, blurry, distorted",
                    width=width,
                    height=height,
                    num_frames=frame_count,
                    num_inference_steps=steps,
                    generator=generator,
                )
            else:
                with decode_data_url_to_image(image_path) as source_image:
                    source = source_image.convert("RGB").resize(
                        (width, height), Image.Resampling.LANCZOS,
                    )
                output = pipeline(
                    source,
                    height=height,
                    width=width,
                    num_frames=frame_count,
                    num_inference_steps=steps,
                    generator=generator,
                )
```

Add `result["loras"] = lora_result` where the result dict is assembled (after line 334).

- [ ] **Step 5: Run test to verify it passes**

Run: `python -m pytest backend/tests/test_direct_video_generator_loras.py -q`
Expected: PASS locally; SKIP on CI.

- [ ] **Step 6: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && git branch --show-current \
  && git add backend/utils/direct_video_generator.py backend/tests/test_direct_video_generator_loras.py \
  && git commit -m "feat(lora): apply/clear LoRAs around the video pipeline call, skip SVD (#136)"
```

---

### Task 10: Retire the orphaned LoRA stub + add `peft`

**Files:**
- Delete: `backend/services/lora_service.py`, `backend/api/lora.py`, `backend/schemas/lora.py`, `backend/tests/test_lora_service.py`, `backend/tests/test_lora_api.py`, `backend/tests/test_lora_schemas.py`
- Modify: `backend/main.py` (remove `lora_router` import + `app.include_router(lora_router)` at line 404)
- Modify: `backend/requirements.txt` (add `peft`)
- Test: `backend/tests/test_no_lora_stub.py` (new)

**Interfaces:**
- Consumes: nothing (removal only).
- Produces: no `/api/v1/lora` route; `peft` declared.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_no_lora_stub.py
from pathlib import Path


def test_standalone_lora_route_is_gone():
    from main import app
    paths = {getattr(route, "path", "") for route in app.routes}
    assert not any(p.startswith("/api/v1/lora") for p in paths)


def test_peft_declared_in_requirements():
    req = Path(__file__).resolve().parents[1] / "requirements.txt"
    assert "peft" in req.read_text().lower()


def test_stub_modules_removed():
    import importlib
    for name in ("services.lora_service", "api.lora", "schemas.lora"):
        try:
            importlib.import_module(name)
            raise AssertionError(f"{name} should have been removed")
        except ModuleNotFoundError:
            pass
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_no_lora_stub.py -q`
Expected: FAIL — the route + modules still exist; `peft` absent.

- [ ] **Step 3: Remove the router wiring**

In `backend/main.py`: delete the `lora_router` import (search for `lora_router` / `from api.lora import`) and delete `app.include_router(lora_router)` (line 404).

- [ ] **Step 4: Delete the stub files**

```bash
git rm backend/services/lora_service.py backend/api/lora.py backend/schemas/lora.py \
       backend/tests/test_lora_service.py backend/tests/test_lora_api.py backend/tests/test_lora_schemas.py
```

- [ ] **Step 5: Add `peft` to requirements**

In `backend/requirements.txt`, under the `# AI/ML` block (after line 13) add:

```
peft>=0.11.0
```

- [ ] **Step 6: Run test to verify it passes**

Run: `python -m pytest backend/tests/test_no_lora_stub.py -q`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && git branch --show-current \
  && git add backend/main.py backend/requirements.txt backend/tests/test_no_lora_stub.py \
  && git commit -m "chore(lora): retire orphaned /api/v1/lora stub, add peft dependency (#136)"
```

---

### Task 11: Integration — green gates, build, PR

**Files:**
- No source changes expected (fix drift only).

- [ ] **Step 1: Backend suite**

Run: `python -m pytest backend/tests -q`
Expected: PASS (LoRA-dependent generator tests SKIP without torch on CI; PASS locally).

- [ ] **Step 2: Frontend typecheck + tests + build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all green (typecheck clean; full Vitest suite green; Vite + electron build succeed).

- [ ] **Step 3: Fix any drift**

If a shared type or the GeneratePanel harness surfaced a failure, fix it minimally and re-run the specific suite, then re-run Step 2.

- [ ] **Step 4: Push + open PR**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && git branch --show-current \
  && git push -u origin feat/lora-end-to-end
gh pr create --title "Phase 1: LoRA end-to-end (#136)" \
  --body "Wires the multi-LoRA mixer end-to-end (image + video): real installed-LoRA library, loras[] contract, runtime named-adapter load/stack/unload on the diffusers pipeline, base-family compatibility filtering, trigger-word prompt insert, Local-only routing, and retirement of the orphaned /api/v1/lora stub. Adds peft. Spec: docs/superpowers/specs/2026-06-30-lora-end-to-end-design.md"
```

- [ ] **Step 5: Watch CI; PAUSE for review before squash-merge**

Run: `gh pr checks --watch`
Expected: all checks green. Then PAUSE — do not merge without the user's go-ahead (per release process).

---

## Self-Review

**Spec coverage** (`2026-06-30-lora-end-to-end-design.md`):
- Real library → Task 1 (selector) + Task 3 (mixer). ✓
- `loras` contract → Task 2 (frontend) + Task 7 (backend). ✓
- Backend load, approach A → Task 6 (applier) + Tasks 8-9 (bracketed at `_generate_sync`, keeping the cached pipeline clean — the faithful realization of "keep cached pipeline clean"; note this refines the spec's "post-construction in `_load_from_plan`" wording, which would have poisoned the cache). ✓
- Compatibility (default-hide + override) → Task 1 helper + Task 3 UI; backend fail-soft → Task 6. ✓
- Trigger words (insert, not auto) → Task 2 `appendTrigger` + Task 3 chip + Tasks 4-5 wiring. ✓
- Video (animatediff/ltx enabled, svd disabled) → Task 5 (UI) + Task 9 (backend skip). ✓
- Local-only routing → Task 4 (image) + Task 5 (HF video guard). ✓
- Stub retirement + peft → Task 10. ✓
- Gates → Task 11. ✓

**Placeholder scan:** every code step carries real code; test steps carry real assertions. The two GeneratePanel test steps (Tasks 4-5) intentionally reuse the file's existing `installElectronMock`/render harness rather than duplicating ~200 lines — flagged inline as "reuse, do not fabricate."

**Type consistency:** `LoraSelectionPayload {id, weight}` is used identically in `generation.ts`, `electron.d.ts`, `toLoraSelections`, and the backend `LoraSelection`. `selectInstalledLoras`/`isLoraCompatible` signatures match between Task 1 (definition) and Tasks 3-5 (use). `loras_applied`/`apply_loras`/`clear_loras` signatures match between Task 6 (definition) and Tasks 8-9 (use). `LoRAConfig.id` is redefined as the installed model id (Task 3) and consumed as such by `toLoraSelections` → payload → backend registry lookup.

**Risk note (carried):** installed-LoRA records must expose their compatible family in `base_architecture` for the picker's default filter. The classifier computes this family (`classifier.py:110-136,151-154`); if a loose-scanned LoRA lands with an empty `base_architecture`, `isLoraCompatible(..., '')` returns false → it appears under the "show incompatible" override (never silently hidden-as-compatible, never crashing). Backend `apply_loras` is fail-soft regardless. No blocking dependency on backend metadata completeness.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-30-lora-end-to-end.md`. Two execution options:

**1. Subagent-Driven (recommended)** — a fresh subagent per task with two-stage review between tasks; fast iteration, tight review loop.

**2. Inline Execution** — execute the tasks in this session (executing-plans), batching with checkpoints for review.

Which approach?
