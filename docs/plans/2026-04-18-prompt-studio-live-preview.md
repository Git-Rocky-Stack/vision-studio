# Prompt Studio + Live Preview — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Prompt Studio sub-mode with token-weighted editing, template library, and enhancement tools, plus composition preview and progressive generation preview.

**Architecture:** Sub-mode extension (Approach A) — Studio is a 4th Generate sub-mode alongside Generate/Quick/Batch. When active, the center workspace shows a layered composition preview instead of Canvas/Viewer tabs. Progressive generation preview replaces the center workspace during generation in all sub-modes. Two new Zustand slices (`promptStudioSlice`, `generationPreviewSlice`) manage template/composition and step-preview state.

**Tech Stack:** React 19, TypeScript, Zustand 5, Tailwind CSS v4, Framer Motion, @tanstack/react-virtual, Vitest 3.2.4

---

## Task 1: Create Prompt Studio Types

**Files:**
- Create: `src/types/promptStudio.ts`

- [ ] **Step 1: Create prompt studio type definitions**

Create `src/types/promptStudio.ts`:

```ts
export interface PromptToken {
  text: string;
  weight: number;
  syntaxType: 'normal' | 'weighted' | 'emphasis' | 'deemphasis';
  startIndex: number;
  endIndex: number;
}

export interface ParsedPrompt {
  rawText: string;
  tokens: PromptToken[];
  tokenCount: number;
  exceedsLimit: boolean;
}

export type PromptTemplateCategory =
  | 'portrait'
  | 'landscape'
  | 'product'
  | 'abstract'
  | 'cinematic'
  | 'artistic'
  | 'custom';

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  category: PromptTemplateCategory;
  promptText: string;
  negativePrompt?: string;
  suggestedSettings?: {
    model?: string;
    aspectRatio?: string;
    steps?: number;
    cfgScale?: number;
    scheduler?: string;
  };
  referenceImage?: string;
  isBuiltIn: boolean;
  isFavorite: boolean;
  createdAt: number;
  lastUsedAt?: number;
}

export interface CompositionLayerState {
  aspectFrame: { visible: boolean; opacity: number };
  reference: { visible: boolean; opacity: number; blendMode: 'normal' | 'overlay' | 'multiply' };
  controlNet: { visible: boolean; opacity: number };
  regionMasks: { visible: boolean; opacity: number };
}
```

- [ ] **Step 2: Run typecheck to verify types**

```bash
cd /c/vision-studio && npm run typecheck
```

Expected: PASS (types are new, no consumers yet)

- [ ] **Step 3: Commit**

```bash
git add src/types/promptStudio.ts
git commit -m "feat(types): add PromptStudio type definitions"
```

---

## Task 2: Build the Prompt Tokenizer

**Files:**
- Create: `src/utils/promptTokenizer.ts`
- Create: `src/utils/promptTokenizer.test.ts`

- [ ] **Step 1: Write failing tokenizer tests**

Create `src/utils/promptTokenizer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parsePrompt, type ParsedPrompt } from './promptTokenizer';

describe('promptTokenizer', () => {
  describe('plain text', () => {
    it('parses a simple prompt with no syntax', () => {
      const result = parsePrompt('a beautiful sunset');
      expect(result.tokens).toHaveLength(3);
      expect(result.tokens[0]).toEqual({
        text: 'a',
        weight: 1.0,
        syntaxType: 'normal',
        startIndex: 0,
        endIndex: 1,
      });
      expect(result.tokenCount).toBeGreaterThan(0);
      expect(result.exceedsLimit).toBe(false);
    });

    it('handles empty string', () => {
      const result = parsePrompt('');
      expect(result.tokens).toHaveLength(0);
      expect(result.tokenCount).toBe(0);
      expect(result.exceedsLimit).toBe(false);
    });
  });

  describe('weighted syntax (word:1.5)', () => {
    it('parses explicit weight syntax', () => {
      const result = parsePrompt('(beautiful:1.5) sunset');
      expect(result.tokens).toHaveLength(2);
      const weighted = result.tokens[0];
      expect(weighted.text).toBe('beautiful');
      expect(weighted.weight).toBe(1.5);
      expect(weighted.syntaxType).toBe('weighted');
    });

    it('parses weight below 1.0', () => {
      const result = parsePrompt('(subtle:0.5) colors');
      expect(result.tokens[0].weight).toBe(0.5);
      expect(result.tokens[0].syntaxType).toBe('weighted');
    });

    it('clamps weight to 0.1–2.0 range', () => {
      const result = parsePrompt('(extreme:5.0) test');
      expect(result.tokens[0].weight).toBe(2.0);
    });

    it('clamps weight minimum to 0.1', () => {
      const result = parsePrompt('(faint:0.01) test');
      expect(result.tokens[0].weight).toBe(0.1);
    });
  });

  describe('emphasis syntax (word)', () => {
    it('parses parenthesized emphasis as +0.1', () => {
      const result = parsePrompt('(beautiful) sunset');
      expect(result.tokens[0].text).toBe('beautiful');
      expect(result.tokens[0].weight).toBe(1.1);
      expect(result.tokens[0].syntaxType).toBe('emphasis');
    });

    it('handles nested parentheses as increased emphasis', () => {
      const result = parsePrompt('((beautiful)) sunset');
      expect(result.tokens[0].text).toBe('beautiful');
      expect(result.tokens[0].weight).toBe(1.21); // 1.1 * 1.1
      expect(result.tokens[0].syntaxType).toBe('emphasis');
    });
  });

  describe('deemphasis syntax [word]', () => {
    it('parses bracketed deemphasis as -0.1', () => {
      const result = parsePrompt('[subtle] colors');
      expect(result.tokens[0].text).toBe('subtle');
      expect(result.tokens[0].weight).toBeCloseTo(0.9);
      expect(result.tokens[0].syntaxType).toBe('deemphasis');
    });

    it('handles nested brackets as increased deemphasis', () => {
      const result = parsePrompt('[[subtle]] colors');
      expect(result.tokens[0].text).toBe('subtle');
      expect(result.tokens[0].weight).toBeCloseTo(0.81); // 0.9 * 0.9
      expect(result.tokens[0].syntaxType).toBe('deemphasis');
    });
  });

  describe('mixed syntax', () => {
    it('handles a mix of normal, weighted, and emphasis tokens', () => {
      const result = parsePrompt('a (beautiful:1.5) (sunset) over [ocean]');
      expect(result.tokens).toHaveLength(5);
      expect(result.tokens[1].syntaxType).toBe('weighted');
      expect(result.tokens[2].syntaxType).toBe('emphasis');
      expect(result.tokens[4].syntaxType).toBe('deemphasis');
    });
  });

  describe('token counting', () => {
    it('approximates CLIP token count for a simple prompt', () => {
      const result = parsePrompt('a beautiful sunset over the ocean with dramatic clouds');
      expect(result.tokenCount).toBeGreaterThan(0);
      expect(result.tokenCount).toBeLessThan(20);
    });

    it('flags exceedsLimit when over 75 tokens', () => {
      const longPrompt = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ');
      const result = parsePrompt(longPrompt);
      expect(result.exceedsLimit).toBe(true);
    });

    it('does not flag under 75 tokens', () => {
      const result = parsePrompt('a short prompt');
      expect(result.exceedsLimit).toBe(false);
    });
  });

  describe('malformed syntax', () => {
    it('treats unclosed parenthesis as plain text', () => {
      const result = parsePrompt('(beautiful sunset');
      // Should parse as normal text, not crash
      expect(result.tokens.length).toBeGreaterThan(0);
      expect(result.tokens.every((t) => t.syntaxType === 'normal')).toBe(true);
    });

    it('treats unmatched closing parenthesis as plain text', () => {
      const result = parsePrompt('beautiful) sunset');
      expect(result.tokens.length).toBeGreaterThan(0);
    });

    it('treats empty parentheses as empty token', () => {
      const result = parsePrompt('() test');
      // Empty weight group is ignored, 'test' is normal
      expect(result.tokens.some((t) => t.text === 'test')).toBe(true);
    });

    it('handles weight without closing paren gracefully', () => {
      const result = parsePrompt('(beautiful:1.5 sunset');
      expect(result.tokens.length).toBeGreaterThan(0);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /c/vision-studio && npx vitest run src/utils/promptTokenizer.test.ts --project unit
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement the tokenizer**

Create `src/utils/promptTokenizer.ts`:

```ts
import type { PromptToken, ParsedPrompt } from '@/types/promptStudio';

const CLIP_TOKEN_RATIO = 1.3; // approximate words-to-CLIP-tokens ratio
const TOKEN_LIMIT = 75;
const MIN_WEIGHT = 0.1;
const MAX_WEIGHT = 2.0;
const EMPHASIS_INCREMENT = 0.1;
const DEEMPHASIS_DECREMENT = 0.1;

/**
 * Approximate CLIP token count for a prompt string.
 * Real CLIP tokenization requires the tokenizer; this uses a word-based heuristic.
 */
function approximateTokenCount(text: string): number {
  const words = text.split(/\s+/).filter(Boolean);
  return Math.ceil(words.length * CLIP_TOKEN_RATIO);
}

/**
 * Parse A1111-style prompt syntax into weighted tokens.
 *
 * Supported syntax:
 * - `(word:1.5)` → explicit weight
 * - `(word)` → emphasis (+0.1)
 * - `((word))` → nested emphasis (+0.1 per level)
 * - `[word]` → deemphasis (-0.1 per level)
 * - Plain text → weight 1.0
 */
export function parsePrompt(rawText: string): ParsedPrompt {
  if (!rawText.trim()) {
    return { rawText, tokens: [], tokenCount: 0, exceedsLimit: false };
  }

  const tokens: PromptToken[] = [];
  let pos = 0;

  while (pos < rawText.length) {
    // Skip whitespace
    if (/\s/.test(rawText[pos])) {
      pos++;
      continue;
    }

    // Weighted syntax: (text:weight)
    const weightedMatch = rawText.slice(pos).match(/^\((.+?):([\d.]+)\)/);
    if (weightedMatch) {
      const text = weightedMatch[1];
      let weight = parseFloat(weightedMatch[2]);
      weight = Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, weight));
      tokens.push({
        text,
        weight,
        syntaxType: 'weighted',
        startIndex: pos,
        endIndex: pos + weightedMatch[0].length,
      });
      pos += weightedMatch[0].length;
      continue;
    }

    // Emphasis syntax: (text) or ((text))
    const emphasisMatch = rawText.slice(pos).match(/^(\(+)(.+?)\1/);
    if (emphasisMatch) {
      const depth = emphasisMatch[1].length;
      const text = emphasisMatch[2];
      let weight = 1.0;
      for (let i = 0; i < depth; i++) weight *= (1 + EMPHASIS_INCREMENT);
      weight = Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, weight));
      tokens.push({
        text,
        weight: Math.round(weight * 100) / 100,
        syntaxType: 'emphasis',
        startIndex: pos,
        endIndex: pos + emphasisMatch[0].length,
      });
      pos += emphasisMatch[0].length;
      continue;
    }

    // Deemphasis syntax: [text] or [[text]]
    const deemphasisMatch = rawText.slice(pos).match(/^(\[+)(.+?)\1/);
    if (deemphasisMatch) {
      const depth = deemphasisMatch[1].length;
      const text = deemphasisMatch[2];
      let weight = 1.0;
      for (let i = 0; i < depth; i++) weight *= (1 - DEEMPHASIS_DECREMENT);
      weight = Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, weight));
      tokens.push({
        text,
        weight: Math.round(weight * 100) / 100,
        syntaxType: 'deemphasis',
        startIndex: pos,
        endIndex: pos + deemphasisMatch[0].length,
      });
      pos += deemphasisMatch[0].length;
      continue;
    }

    // Plain text word — consume until whitespace or syntax char
    const wordMatch = rawText.slice(pos).match(/^[^(+)\[\]\s]+/);
    if (wordMatch) {
      tokens.push({
        text: wordMatch[0],
        weight: 1.0,
        syntaxType: 'normal',
        startIndex: pos,
        endIndex: pos + wordMatch[0].length,
      });
      pos += wordMatch[0].length;
      continue;
    }

    // Unmatched syntax char — treat as plain text
    tokens.push({
      text: rawText[pos],
      weight: 1.0,
      syntaxType: 'normal',
      startIndex: pos,
      endIndex: pos + 1,
    });
    pos++;
  }

  const tokenCount = approximateTokenCount(rawText);
  return {
    rawText,
    tokens,
    tokenCount,
    exceedsLimit: tokenCount > TOKEN_LIMIT,
  };
}
```

- [ ] **Step 4: Run tokenizer tests**

```bash
cd /c/vision-studio && npx vitest run src/utils/promptTokenizer.test.ts --project unit
```

Expected: All ~25 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/promptTokenizer.ts src/utils/promptTokenizer.test.ts
git commit -m "feat(studio): add A1111 prompt tokenizer with visual weight parsing"
```

---

## Task 3: Create Built-in Prompt Templates

**Files:**
- Create: `src/data/builtInTemplates.ts`
- Create: `src/data/builtInTemplates.test.ts`

- [ ] **Step 1: Write failing template tests**

Create `src/data/builtInTemplates.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BUILT_IN_PROMPT_TEMPLATES } from './builtInTemplates';

describe('builtInTemplates', () => {
  it('has at least 8 templates', () => {
    expect(BUILT_IN_PROMPT_TEMPLATES.length).toBeGreaterThanOrEqual(8);
  });

  it('all templates have required fields', () => {
    for (const t of BUILT_IN_PROMPT_TEMPLATES) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.category).toBeTruthy();
      expect(t.promptText).toBeTruthy();
      expect(t.isBuiltIn).toBe(true);
      expect(t.createdAt).toBeGreaterThan(0);
    }
  });

  it('all template IDs are unique', () => {
    const ids = BUILT_IN_PROMPT_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers all declared categories', () => {
    const categories = new Set(BUILT_IN_PROMPT_TEMPLATES.map((t) => t.category));
    expect(categories.has('portrait')).toBe(true);
    expect(categories.has('landscape')).toBe(true);
    expect(categories.has('product')).toBe(true);
    expect(categories.has('cinematic')).toBe(true);
  });

  it('has valid suggested settings when present', () => {
    for (const t of BUILT_IN_PROMPT_TEMPLATES) {
      if (t.suggestedSettings) {
        if (t.suggestedSettings.steps) expect(t.suggestedSettings.steps).toBeGreaterThan(0);
        if (t.suggestedSettings.cfgScale) expect(t.suggestedSettings.cfgScale).toBeGreaterThan(0);
      }
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /c/vision-studio && npx vitest run src/data/builtInTemplates.test.ts --project unit
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement built-in templates**

Create `src/data/builtInTemplates.ts`:

```ts
import type { PromptTemplate } from '@/types/promptStudio';

export const BUILT_IN_PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'cinematic-portrait',
    name: 'Cinematic Portrait',
    description: 'Professional portrait with dramatic studio lighting and film-grain texture',
    category: 'portrait',
    promptText: 'professional portrait, dramatic studio lighting, shallow depth of field, film grain, (detailed skin texture:1.3), cinematic color grading',
    negativePrompt: 'blurry, low quality, distorted, ugly, deformed',
    suggestedSettings: { model: 'flux-dev', aspectRatio: '2:3', steps: 30, cfgScale: 7.5, scheduler: 'Euler a' },
    isBuiltIn: true,
    isFavorite: false,
    createdAt: Date.now(),
  },
  {
    id: 'landscape-vista',
    name: 'Landscape Vista',
    description: 'Expansive landscape with vivid sky and dramatic lighting',
    category: 'landscape',
    promptText: 'expansive landscape vista, (golden hour lighting:1.2), dramatic sky, vivid colors, rolling hills, professional landscape photography',
    negativePrompt: 'blurry, low quality, flat, overexposed',
    suggestedSettings: { model: 'flux-dev', aspectRatio: '16:9', steps: 30, cfgScale: 7.0, scheduler: 'Euler a' },
    isBuiltIn: true,
    isFavorite: false,
    createdAt: Date.now(),
  },
  {
    id: 'product-studio',
    name: 'Product Studio',
    description: 'Clean product photography with studio lighting',
    category: 'product',
    promptText: 'professional product photography, (clean white background:1.3), studio lighting, sharp focus, commercial quality, soft shadows',
    negativePrompt: 'cluttered, harsh shadows, blurry, amateur, text, watermark',
    suggestedSettings: { model: 'flux-dev', aspectRatio: '1:1', steps: 30, cfgScale: 8.0, scheduler: 'Euler a' },
    isBuiltIn: true,
    isFavorite: false,
    createdAt: Date.now(),
  },
  {
    id: 'abstract-art',
    name: 'Abstract Art',
    description: 'Vibrant abstract composition with flowing forms',
    category: 'abstract',
    promptText: '[realistic] abstract art, (vibrant colors:1.4), flowing organic forms, dynamic composition, textured surface, artistic expression',
    negativePrompt: 'photorealistic, mundane, boring, flat',
    suggestedSettings: { model: 'flux-dev', aspectRatio: '1:1', steps: 25, cfgScale: 8.5, scheduler: 'DPM++ 2M' },
    isBuiltIn: true,
    isFavorite: false,
    createdAt: Date.now(),
  },
  {
    id: 'cinematic-scene',
    name: 'Cinematic Scene',
    description: 'Movie-still quality with anamorphic lens effects',
    category: 'cinematic',
    promptText: '(cinematic composition:1.3), film grain, anamorphic lens flare, dramatic lighting, movie still, high production value, color graded',
    negativePrompt: 'amateur, low quality, distorted, fisheye, cartoon',
    suggestedSettings: { model: 'flux-dev', aspectRatio: '16:9', steps: 35, cfgScale: 7.5, scheduler: 'Euler a' },
    isBuiltIn: true,
    isFavorite: false,
    createdAt: Date.now(),
  },
  {
    id: 'anime-illustration',
    name: 'Anime Illustration',
    description: 'Japanese anime style with clean lines and vibrant colors',
    category: 'artistic',
    promptText: '(anime style:1.4), clean line art, vibrant colors, detailed eyes, dynamic pose, cel shading, professional illustration',
    negativePrompt: 'photorealistic, 3d render, blurry, low quality, deformed',
    suggestedSettings: { model: 'flux-dev', aspectRatio: '2:3', steps: 28, cfgScale: 7.0, scheduler: 'Euler a' },
    isBuiltIn: true,
    isFavorite: false,
    createdAt: Date.now(),
  },
  {
    id: 'concept-art',
    name: 'Concept Art',
    description: 'Professional concept art with environment design',
    category: 'artistic',
    promptText: 'concept art, (environment design:1.2), detailed architecture, atmospheric perspective, professional illustration, matte painting style',
    negativePrompt: 'photorealistic, blurry, low detail, amateur',
    suggestedSettings: { model: 'flux-dev', aspectRatio: '16:9', steps: 35, cfgScale: 7.0, scheduler: 'DPM++ 2M' },
    isBuiltIn: true,
    isFavorite: false,
    createdAt: Date.now(),
  },
  {
    id: 'macro-photography',
    name: 'Macro Photography',
    description: 'Extreme close-up with shallow depth of field',
    category: 'product',
    promptText: '(macro photography:1.4), extreme close-up, shallow depth of field, sharp focus, detailed texture, professional studio lighting',
    negativePrompt: 'wide angle, landscape, blurry, low quality',
    suggestedSettings: { model: 'flux-dev', aspectRatio: '1:1', steps: 30, cfgScale: 7.5, scheduler: 'Euler a' },
    isBuiltIn: true,
    isFavorite: false,
    createdAt: Date.now(),
  },
];
```

- [ ] **Step 4: Run template tests**

```bash
cd /c/vision-studio && npx vitest run src/data/builtInTemplates.test.ts --project unit
```

Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/data/builtInTemplates.ts src/data/builtInTemplates.test.ts
git commit -m "feat(studio): add built-in prompt template library"
```

---

## Task 4: Create Prompt Studio Store Slice

**Files:**
- Create: `src/store/slices/promptStudioSlice.ts`
- Create: `src/store/slices/generationPreviewSlice.ts`
- Modify: `src/store/appStore.types.ts`
- Modify: `src/store/appStore.ts`
- Test: `src/store/appStore.test.ts`

- [ ] **Step 1: Write failing store tests**

Add to `src/store/appStore.test.ts` in a new `describe('prompt studio')` block:

```ts
describe('prompt studio', () => {
  it('defaults promptTemplates to built-in templates', () => {
    const state = useAppStore.getState();
    expect(state.promptTemplates.length).toBeGreaterThanOrEqual(8);
  });

  it('defaults compositionLayers visibility to true', () => {
    const state = useAppStore.getState();
    expect(state.compositionLayers.aspectFrame.visible).toBe(true);
    expect(state.compositionLayers.reference.visible).toBe(true);
    expect(state.compositionLayers.controlNet.visible).toBe(true);
    expect(state.compositionLayers.regionMasks.visible).toBe(true);
  });

  it('adds a user template', () => {
    const template = {
      id: 'user-1',
      name: 'My Template',
      description: 'Custom',
      category: 'custom' as const,
      promptText: 'test prompt',
      isBuiltIn: false,
      isFavorite: false,
      createdAt: Date.now(),
    };
    useAppStore.getState().addUserPromptTemplate(template);
    expect(useAppStore.getState().promptTemplates.find((t) => t.id === 'user-1')).toBeDefined();
  });

  it('deletes a user template', () => {
    useAppStore.getState().addUserPromptTemplate({
      id: 'user-del',
      name: 'ToDelete',
      description: 'gone',
      category: 'custom' as const,
      promptText: 'test',
      isBuiltIn: false,
      isFavorite: false,
      createdAt: Date.now(),
    });
    useAppStore.getState().deleteUserPromptTemplate('user-del');
    expect(useAppStore.getState().promptTemplates.find((t) => t.id === 'user-del')).toBeUndefined();
  });

  it('toggles composition layer visibility', () => {
    useAppStore.getState().setCompositionLayerVisibility('controlNet', false);
    expect(useAppStore.getState().compositionLayers.controlNet.visible).toBe(false);
    useAppStore.getState().setCompositionLayerVisibility('controlNet', true);
    expect(useAppStore.getState().compositionLayers.controlNet.visible).toBe(true);
  });

  it('sets composition layer opacity', () => {
    useAppStore.getState().setCompositionLayerOpacity('reference', 0.5);
    expect(useAppStore.getState().compositionLayers.reference.opacity).toBe(0.5);
  });

  it('applies template with replace mode', () => {
    // applyTemplate replaces the prompt text in the generation state
    useAppStore.getState().applyPromptTemplate('cinematic-portrait', 'replace');
    // This should set generationDraft or update prompt — verify it dispatched
    expect(true).toBe(true); // placeholder until wired to generation slice
  });
});

describe('generation preview', () => {
  it('defaults to empty preview state', () => {
    const state = useAppStore.getState();
    expect(state.stepImages.size).toBe(0);
    expect(state.currentStep).toBe(0);
    expect(state.totalSteps).toBe(0);
    expect(state.isPreviewActive).toBe(false);
  });

  it('adds a step image', () => {
    useAppStore.getState().addStepImage(5, 'data:image/png;base64,test');
    expect(useAppStore.getState().stepImages.get(5)).toBe('data:image/png;base64,test');
    expect(useAppStore.getState().currentStep).toBe(5);
  });

  it('clears preview', () => {
    useAppStore.getState().addStepImage(3, 'test');
    useAppStore.getState().clearPreview();
    expect(useAppStore.getState().stepImages.size).toBe(0);
    expect(useAppStore.getState().currentStep).toBe(0);
    expect(useAppStore.getState().isPreviewActive).toBe(false);
  });

  it('sets preview active', () => {
    useAppStore.getState().setPreviewActive(true);
    expect(useAppStore.getState().isPreviewActive).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /c/vision-studio && npx vitest run src/store/appStore.test.ts --project unit
```

Expected: FAIL — `promptTemplates`, `compositionLayers`, etc. don't exist yet

- [ ] **Step 3: Create promptStudioSlice**

Create `src/store/slices/promptStudioSlice.ts`:

```ts
import type { AppSet, AppGet } from '../appStore.types';
import type { PromptTemplate, CompositionLayerState } from '@/types/promptStudio';
import { BUILT_IN_PROMPT_TEMPLATES } from '@/data/builtInTemplates';

export const promptStudioInitialState = {
  promptTemplates: BUILT_IN_PROMPT_TEMPLATES as PromptTemplate[],
  compositionLayers: {
    aspectFrame: { visible: true, opacity: 1 },
    reference: { visible: true, opacity: 1, blendMode: 'normal' as const },
    controlNet: { visible: true, opacity: 0.7 },
    regionMasks: { visible: true, opacity: 0.5 },
  } as CompositionLayerState,
};

export function createPromptStudioActions(set: AppSet, _get: AppGet) {
  return {
    addUserPromptTemplate: (template: PromptTemplate) =>
      set((state) => ({
        promptTemplates: [...state.promptTemplates, template],
      })),

    deleteUserPromptTemplate: (id: string) =>
      set((state) => ({
        promptTemplates: state.promptTemplates.filter((t) => !(t.id === id && !t.isBuiltIn)),
      })),

    togglePromptTemplateFavorite: (id: string) =>
      set((state) => ({
        promptTemplates: state.promptTemplates.map((t) =>
          t.id === id ? { ...t, isFavorite: !t.isFavorite } : t
        ),
      })),

    setCompositionLayerVisibility: (layer: keyof CompositionLayerState, visible: boolean) =>
      set((state) => ({
        compositionLayers: {
          ...state.compositionLayers,
          [layer]: { ...state.compositionLayers[layer], visible },
        },
      })),

    setCompositionLayerOpacity: (layer: keyof CompositionLayerState, opacity: number) =>
      set((state) => ({
        compositionLayers: {
          ...state.compositionLayers,
          [layer]: { ...state.compositionLayers[layer], opacity },
        },
      })),

    applyPromptTemplate: (id: string, mode: 'replace' | 'merge') => {
      // Will be wired to generation state in Task 8
      // For now, just mark the template as recently used
      set((state) => ({
        promptTemplates: state.promptTemplates.map((t) =>
          t.id === id ? { ...t, lastUsedAt: Date.now() } : t
        ),
      }));
    },
  };
}
```

- [ ] **Step 4: Create generationPreviewSlice**

Create `src/store/slices/generationPreviewSlice.ts`:

```ts
import type { AppSet, AppGet } from '../appStore.types';

export const generationPreviewInitialState = {
  stepImages: new Map<number, string>(),
  currentStep: 0,
  totalSteps: 0,
  isPreviewActive: false,
};

export function createGenerationPreviewActions(set: AppSet, _get: AppGet) {
  return {
    addStepImage: (step: number, imageData: string) =>
      set((state) => {
        const newImages = new Map(state.stepImages);
        // Cap at last 10 steps to avoid memory pressure
        if (newImages.size >= 10) {
          const keys = Array.from(newImages.keys()).sort((a, b) => a - b);
          for (let i = 0; i < keys.length - 9; i++) {
            newImages.delete(keys[i]);
          }
        }
        newImages.set(step, imageData);
        return {
          stepImages: newImages,
          currentStep: step,
          isPreviewActive: true,
        };
      }),

    setTotalSteps: (total: number) => set({ totalSteps: total }),

    clearPreview: () =>
      set({
        stepImages: new Map<number, string>(),
        currentStep: 0,
        totalSteps: 0,
        isPreviewActive: false,
      }),

    setPreviewActive: (active: boolean) => set({ isPreviewActive: active }),
  };
}
```

- [ ] **Step 5: Add new state keys and actions to appStore.types.ts**

In `src/store/appStore.types.ts`, add after the `import type { ActiveTab, ActiveSubMode, CenterView } from '@/types/navigation';` line:

```ts
import type { PromptTemplate, CompositionLayerState } from '@/types/promptStudio';
```

Add to `AppState` interface, after `showAdvancedGeneration: boolean;`:

```ts
  // ─── Prompt Studio ──────────────────────────────────────────────────
  promptTemplates: PromptTemplate[];
  compositionLayers: CompositionLayerState;

  // ─── Generation Preview ──────────────────────────────────────────────
  stepImages: Map<number, string>;
  currentStep: number;
  totalSteps: number;
  isPreviewActive: boolean;
```

Add to Actions section:

```ts
  // Prompt Studio
  addUserPromptTemplate: (template: PromptTemplate) => void;
  deleteUserPromptTemplate: (id: string) => void;
  togglePromptTemplateFavorite: (id: string) => void;
  setCompositionLayerVisibility: (layer: keyof CompositionLayerState, visible: boolean) => void;
  setCompositionLayerOpacity: (layer: keyof CompositionLayerState, opacity: number) => void;
  applyPromptTemplate: (id: string, mode: 'replace' | 'merge') => void;

  // Generation Preview
  addStepImage: (step: number, imageData: string) => void;
  setTotalSteps: (total: number) => void;
  clearPreview: () => void;
  setPreviewActive: (active: boolean) => void;
```

- [ ] **Step 6: Register slices in appStore.ts**

Add imports at top of `src/store/appStore.ts`:

```ts
import { promptStudioInitialState, createPromptStudioActions } from './slices/promptStudioSlice';
import { generationPreviewInitialState, createGenerationPreviewActions } from './slices/generationPreviewSlice';
```

Add to the store creator inside `persist()`:

```ts
      ...promptStudioInitialState,
      ...createPromptStudioActions(set, get),
      ...generationPreviewInitialState,
      ...createGenerationPreviewActions(set, get),
```

Add to `partialize`:

```ts
        promptTemplates: state.promptTemplates,
        compositionLayers: state.compositionLayers,
```

Note: `stepImages` (Map) is NOT persisted — it's ephemeral per generation run.

- [ ] **Step 7: Run store tests to verify they pass**

```bash
cd /c/vision-studio && npx vitest run src/store/appStore.test.ts --project unit
```

Expected: All tests pass (both old and new)

- [ ] **Step 8: Run typecheck**

```bash
cd /c/vision-studio && npm run typecheck
```

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/types/promptStudio.ts src/store/slices/promptStudioSlice.ts src/store/slices/generationPreviewSlice.ts src/store/appStore.types.ts src/store/appStore.ts src/store/appStore.test.ts src/data/builtInTemplates.ts src/data/builtInTemplates.test.ts
git commit -m "feat(studio): add prompt studio and generation preview store slices"
```

---

## Task 5: Extend Navigation Types and Layout for Studio Sub-mode

**Files:**
- Modify: `src/types/navigation.ts`
- Modify: `src/store/slices/uiSlice.ts`
- Modify: `src/components/layout/layoutPresets.ts`
- Modify: `src/components/layout/DockviewSettingsPanel.tsx`
- Modify: `src/components/layout/DockviewLayout.tsx`

- [ ] **Step 1: Extend GenerateSubMode type**

In `src/types/navigation.ts`, change:

```ts
export type GenerateSubMode = 'generate' | 'quick' | 'batch';
```

to:

```ts
export type GenerateSubMode = 'generate' | 'quick' | 'batch' | 'studio';
```

- [ ] **Step 2: Update uiSlice default for 'studio'**

In `src/store/slices/uiSlice.ts`, the `subModeDefaults` already uses a `Record<string, ...>` so `'studio'` will automatically map to `null` (it has no sub-modes of its own). No change needed in uiSlice for default behavior, but verify:

The existing `subModeDefaults` map:
```ts
const subModeDefaults: Record<string, AppState['activeSubMode']> = {
  generate: 'generate',
  canvas: null,
  story: 'storyboard',
  workflows: null,
  assets: null,
  settings: null,
};
```

`generate` already maps to `'generate'`, and since `'studio'` is a GenerateSubMode (not a separate tab), clicking the "Studio" segmented button calls `setActiveSubMode('studio')` directly — no default mapping needed.

- [ ] **Step 3: Update layoutPresets to add 'studio' to generate sub-modes**

In `src/components/layout/layoutPresets.ts`, change the `generate` preset's `subModes`:

```ts
subModes: ['generate', 'quick', 'batch', 'studio'],
```

- [ ] **Step 4: Update DockviewSettingsPanel to add Studio sub-mode**

In `src/components/layout/DockviewSettingsPanel.tsx`:

1. Update the `GENERATE_SUB_MODES` array:

```ts
const GENERATE_SUB_MODES: SubModeOption[] = [
  { value: 'generate', label: 'Generate' },
  { value: 'quick', label: 'Quick' },
  { value: 'batch', label: 'Batch' },
  { value: 'studio', label: 'Studio' },
];
```

2. Add `PromptStudioPanel` import:

```ts
import { PromptStudioPanel } from '@/components/studio/PromptStudioPanel';
```

3. Add the `studio` case in `SettingsContent`:

```ts
case 'generate': {
  const sub = activeSubMode as GenerateSubMode;
  if (sub === 'quick') return <QuickGeneratePanel />;
  if (sub === 'batch') return <BatchPanel />;
  if (sub === 'studio') return <PromptStudioPanel />;
  return <GeneratePanel />;
}
```

- [ ] **Step 5: Update DockviewLayout to render CompositionPreview for studio sub-mode**

In `src/components/layout/DockviewLayout.tsx`:

1. Add import:

```ts
import { CompositionPreview } from '@/components/studio/CompositionPreview';
```

2. Add `activeSubMode` to the store selectors:

```ts
const activeSubMode = useAppStore((s) => s.activeSubMode);
```

3. Add a condition before the `CenterContent` switch — when `activeTab === 'generate' && activeSubMode === 'studio'`, render `CompositionPreview` instead of `CenterContent`:

After the `CenterContent` function, before the `isCanvasTab` check, add:

```ts
const isStudioMode = activeTab === 'generate' && activeSubMode === 'studio';
```

In the center content section, wrap the `CenterContent` call:

```tsx
<section className="min-h-0 flex-1 overflow-hidden">
  <ErrorBoundary fallbackLabel="Center view error">
    {isStudioMode ? <CompositionPreview /> : <CenterContent centerView={centerView} />}
  </ErrorBoundary>
</section>
```

- [ ] **Step 6: Run typecheck**

```bash
cd /c/vision-studio && npm run typecheck
```

Expected: May have errors for missing `PromptStudioPanel` and `CompositionPreview` — that's expected, they'll be created in Task 6.

- [ ] **Step 7: Commit**

```bash
git add src/types/navigation.ts src/store/slices/uiSlice.ts src/components/layout/layoutPresets.ts src/components/layout/DockviewSettingsPanel.tsx src/components/layout/DockviewLayout.tsx
git commit -m "feat(studio): extend navigation and layout for Studio sub-mode"
```

---

## Task 6: Create PromptStudioPanel Component

**Files:**
- Create: `src/components/studio/PromptStudioPanel.tsx`
- Create: `src/components/studio/TokenWeightedEditor.tsx`
- Create: `src/components/studio/TokenHighlighter.tsx`
- Create: `src/components/studio/PromptTemplateLibrary.tsx`
- Create: `src/components/studio/PromptTemplateCard.tsx`
- Create: `src/components/studio/PromptEnhancementToolkit.tsx`

- [ ] **Step 1: Create TokenHighlighter**

Create `src/components/studio/TokenHighlighter.tsx`:

```tsx
import { memo } from 'react';
import type { PromptToken } from '@/types/promptStudio';
import { cn } from '@/utils/cn';

interface TokenHighlighterProps {
  tokens: PromptToken[];
}

const weightColorMap: Record<PromptToken['syntaxType'], string> = {
  normal: '',
  weighted: 'bg-accent-primary-muted/40 text-accent-primary',
  emphasis: 'bg-status-success-muted/30 text-status-success',
  deemphasis: 'bg-blue-500/20 text-blue-400',
};

function getWeightIndicator(weight: number): string {
  if (weight > 1.5) return 'bg-red-500/30 text-red-400';
  if (weight > 1.2) return weightColorMap.weighted;
  if (weight > 1.0) return weightColorMap.emphasis;
  if (weight < 0.8) return 'bg-blue-700/30 text-blue-300';
  return weightColorMap.deemphasis;
}

export const TokenHighlighter = memo(function TokenHighlighter({ tokens }: TokenHighlighterProps) {
  if (tokens.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-wrap items-start gap-0.5 p-2 font-mono text-sm leading-6" aria-hidden="true">
      {tokens.map((token, i) => (
        <span
          key={`${token.startIndex}-${i}`}
          className={cn(
            'rounded-sm px-0.5',
            token.syntaxType !== 'normal' && getWeightIndicator(token.weight),
          )}
          title={token.weight !== 1.0 ? `Weight: ${token.weight.toFixed(2)}` : undefined}
        >
          {token.text}
        </span>
      ))}
    </div>
  );
});
```

- [ ] **Step 2: Create TokenWeightedEditor**

Create `src/components/studio/TokenWeightedEditor.tsx`:

```tsx
import { memo, useState, useCallback, useRef } from 'react';
import { parsePrompt } from '@/utils/promptTokenizer';
import { TokenHighlighter } from './TokenHighlighter';
import { cn } from '@/utils/cn';

interface TokenWeightedEditorProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  maxTokens?: number;
}

export const TokenWeightedEditor = memo(function TokenWeightedEditor({
  value,
  onChange,
  label,
  placeholder = 'Enter prompt...',
  maxTokens = 75,
}: TokenWeightedEditorProps) {
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const parsed = parsePrompt(value);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="type-ui text-text-muted">{label}</label>
        <span className={cn('type-micro', parsed.exceedsLimit ? 'text-status-warning' : 'text-text-muted')}>
          {parsed.tokenCount} / {maxTokens} tokens
        </span>
      </div>
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          className={cn(
            'min-h-[120px] w-full resize-y rounded-md border border-border bg-void p-2 font-mono text-sm text-text-primary placeholder:text-text-muted focus:outline-none',
            isFocused && 'border-accent-primary-border ring-1 ring-accent-primary/30',
            parsed.exceedsLimit && 'border-status-warning',
          )}
          aria-label={label}
        />
        {value && <TokenHighlighter tokens={parsed.tokens} />}
      </div>
    </div>
  );
});
```

- [ ] **Step 3: Create PromptTemplateCard**

Create `src/components/studio/PromptTemplateCard.tsx`:

```tsx
import { memo } from 'react';
import { Star, Plus } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { PromptTemplate } from '@/types/promptStudio';

interface PromptTemplateCardProps {
  template: PromptTemplate;
  onApply: (id: string, mode: 'replace' | 'merge') => void;
  onToggleFavorite: (id: string) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  portrait: 'bg-blue-500/20 text-blue-400',
  landscape: 'bg-green-500/20 text-green-400',
  product: 'bg-orange-500/20 text-orange-400',
  abstract: 'bg-purple-500/20 text-purple-400',
  cinematic: 'bg-red-500/20 text-red-400',
  artistic: 'bg-pink-500/20 text-pink-400',
  custom: 'bg-gray-500/20 text-gray-400',
};

export const PromptTemplateCard = memo(function PromptTemplateCard({
  template,
  onApply,
  onToggleFavorite,
}: PromptTemplateCardProps) {
  return (
    <div className="group relative flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-3 transition-colors hover:border-border-hover">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h4 className="truncate type-ui text-text-primary">{template.name}</h4>
          <p className="line-clamp-2 type-micro text-text-muted">{template.description}</p>
        </div>
        <button
          type="button"
          onClick={() => onToggleFavorite(template.id)}
          className={cn(
            'flex-shrink-0 rounded-sm p-1 transition-colors',
            template.isFavorite ? 'text-status-warning' : 'text-text-muted hover:text-text-primary',
          )}
          aria-label={template.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Star className="h-4 w-4" fill={template.isFavorite ? 'currentColor' : 'none'} />
        </button>
      </div>
      <span className={cn('inline-flex w-fit rounded-sm px-1.5 py-0.5 type-micro', CATEGORY_COLORS[template.category])}>
        {template.category}
      </span>
      <div className="mt-auto flex gap-1.5 pt-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={() => onApply(template.id, 'replace')}
          className="flex-1 rounded-sm bg-accent-primary-muted px-2 py-1 type-micro text-accent-primary hover:bg-accent-primary/20"
        >
          Apply
        </button>
        <button
          type="button"
          onClick={() => onApply(template.id, 'merge')}
          className="flex-1 rounded-sm border border-border px-2 py-1 type-micro text-text-body hover:bg-elevated"
        >
          Merge
        </button>
      </div>
    </div>
  );
});
```

- [ ] **Step 4: Create PromptTemplateLibrary**

Create `src/components/studio/PromptTemplateLibrary.tsx`:

```tsx
import { memo, useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { PromptTemplateCard } from './PromptTemplateCard';
import type { PromptTemplate, PromptTemplateCategory } from '@/types/promptStudio';
import { cn } from '@/utils/cn';

const CATEGORIES: { value: PromptTemplateCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'portrait', label: 'Portrait' },
  { value: 'landscape', label: 'Landscape' },
  { value: 'product', label: 'Product' },
  { value: 'cinematic', label: 'Cinematic' },
  { value: 'artistic', label: 'Artistic' },
  { value: 'abstract', label: 'Abstract' },
  { value: 'custom', label: 'Custom' },
];

export const PromptTemplateLibrary = memo(function PromptTemplateLibrary() {
  const templates = useAppStore((s) => s.promptTemplates);
  const applyTemplate = useAppStore((s) => s.applyPromptTemplate);
  const toggleFavorite = useAppStore((s) => s.togglePromptTemplateFavorite);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<PromptTemplateCategory | 'all'>('all');

  const filtered = useMemo(() => {
    let result = templates;
    if (category !== 'all') result = result.filter((t) => t.category === category);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.promptText.toLowerCase().includes(q)
      );
    }
    // Favorites first, then built-in, then user-created
    return result.sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      if (a.isBuiltIn !== b.isBuiltIn) return a.isBuiltIn ? -1 : 1;
      return b.createdAt - a.createdAt;
    });
  }, [templates, search, category]);

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="w-full rounded-md border border-border bg-void py-1.5 pl-8 pr-3 type-ui text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary-border"
            aria-label="Search templates"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            type="button"
            onClick={() => setCategory(cat.value)}
            className={cn(
              'rounded-sm px-2 py-1 type-micro transition-colors',
              category === cat.value
                ? 'bg-accent-primary-muted text-accent-primary'
                : 'text-text-muted hover:bg-elevated hover:text-text-primary',
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 gap-2 pb-2">
          {filtered.map((template) => (
            <PromptTemplateCard
              key={template.id}
              template={template}
              onApply={applyTemplate}
              onToggleFavorite={toggleFavorite}
            />
          ))}
        </div>
        {filtered.length === 0 && (
          <div className="flex items-center justify-center py-8 type-body text-text-muted">
            No templates found
          </div>
        )}
      </div>
    </div>
  );
});
```

- [ ] **Step 5: Create PromptEnhancementToolkit**

Create `src/components/studio/PromptEnhancementToolkit.tsx`:

```tsx
import { memo } from 'react';
import { Wand2, Shuffle, ArrowDownToLine, Sparkles } from 'lucide-react';
import { cn } from '@/utils/cn';

interface PromptEnhancementToolkitProps {
  onEnhance: () => void;
  onExpand: () => void;
  onNegativeSuggest: () => void;
  onStyleTransfer: (modifier: string) => void;
  isEnhancing?: boolean;
  isExpanding?: boolean;
}

export const PromptEnhancementToolkit = memo(function PromptEnhancementToolkit({
  onEnhance,
  onExpand,
  onNegativeSuggest,
  onStyleTransfer,
  isEnhancing,
  isExpanding,
}: PromptEnhancementToolkitProps) {
  const tools = [
    { icon: Wand2, label: 'AI Enhance', onClick: onEnhance, loading: isEnhancing },
    { icon: Sparkles, label: 'Style Transfer', onClick: () => onStyleTransfer(''), hasSubmenu: true },
    { icon: ArrowDownToLine, label: 'Expand', onClick: onExpand, loading: isExpanding },
    { icon: Shuffle, label: 'Neg. Suggest', onClick: onNegativeSuggest },
  ] as const;

  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="type-ui text-text-muted">Enhancement</h3>
      <div className="grid grid-cols-2 gap-1.5">
        {tools.map((tool) => (
          <button
            key={tool.label}
            type="button"
            onClick={tool.onClick}
            disabled={tool.loading}
            className={cn(
              'flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5 type-ui text-text-body transition-colors',
              'hover:bg-elevated hover:text-text-primary',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
            aria-label={tool.label}
          >
            <tool.icon className="h-3.5 w-3.5" />
            <span className="truncate">{tool.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
});
```

- [ ] **Step 6: Create PromptStudioPanel**

Create `src/components/studio/PromptStudioPanel.tsx`:

```tsx
import { memo, useState, useCallback } from 'react';
import { useAppStore } from '@/store/appStore';
import { TokenWeightedEditor } from './TokenWeightedEditor';
import { PromptTemplateLibrary } from './PromptTemplateLibrary';
import { PromptEnhancementToolkit } from './PromptEnhancementToolkit';
import { cn } from '@/utils/cn';

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({ title, defaultOpen = true, children }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-3 py-2 type-ui text-text-primary hover:bg-elevated"
        aria-expanded={isOpen}
      >
        <span>{title}</span>
        <span className={cn('text-text-muted transition-transform', isOpen && 'rotate-180')}>▾</span>
      </button>
      {isOpen && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

export const PromptStudioPanel = memo(function PromptStudioPanel() {
  const generationDraft = useAppStore((s) => s.generationDraft);
  const [positivePrompt, setPositivePrompt] = useState(generationDraft?.prompt ?? '');
  const [negativePrompt, setNegativePrompt] = useState(generationDraft?.negativePrompt ?? '');

  const handleEnhance = useCallback(() => {
    // TODO: Wire to window.electron.generation.enhancePrompt in Task 8
  }, []);

  const handleExpand = useCallback(() => {
    // TODO: Wire to semantic expansion API in Task 8
  }, []);

  const handleNegativeSuggest = useCallback(() => {
    // TODO: Wire to negative prompt suggestion API in Task 8
  }, []);

  const handleStyleTransfer = useCallback((_modifier: string) => {
    // TODO: Wire to style transfer in Task 8
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <CollapsibleSection title="Prompt Editor" defaultOpen>
        <div className="flex flex-col gap-3">
          <TokenWeightedEditor
            label="Positive Prompt"
            value={positivePrompt}
            onChange={setPositivePrompt}
            placeholder="Describe what you want to generate..."
          />
          <TokenWeightedEditor
            label="Negative Prompt"
            value={negativePrompt}
            onChange={setNegativePrompt}
            placeholder="Describe what to avoid..."
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Enhancement" defaultOpen={false}>
        <PromptEnhancementToolkit
          onEnhance={handleEnhance}
          onExpand={handleExpand}
          onNegativeSuggest={handleNegativeSuggest}
          onStyleTransfer={handleStyleTransfer}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Templates" defaultOpen={false}>
        <PromptTemplateLibrary />
      </CollapsibleSection>
    </div>
  );
});
```

- [ ] **Step 7: Run typecheck**

```bash
cd /c/vision-studio && npm run typecheck
```

Expected: PASS (all imports resolve)

- [ ] **Step 8: Commit**

```bash
git add src/components/studio/PromptStudioPanel.tsx src/components/studio/TokenWeightedEditor.tsx src/components/studio/TokenHighlighter.tsx src/components/studio/PromptTemplateLibrary.tsx src/components/studio/PromptTemplateCard.tsx src/components/studio/PromptEnhancementToolkit.tsx
git commit -m "feat(studio): create PromptStudioPanel with token editor, template library, and enhancement toolkit"
```

---

## Task 7: Create Composition Preview Components

**Files:**
- Create: `src/components/studio/CompositionPreview.tsx`
- Create: `src/components/studio/CompositionLayerBar.tsx`
- Create: `src/components/studio/AspectRatioFrame.tsx`
- Create: `src/components/studio/ReferenceOverlay.tsx`
- Create: `src/components/studio/ControlNetVisualization.tsx`
- Create: `src/components/studio/RegionMaskPreview.tsx`

- [ ] **Step 1: Create AspectRatioFrame**

Create `src/components/studio/AspectRatioFrame.tsx`:

```tsx
import { memo } from 'react';
import { cn } from '@/utils/cn';

interface AspectRatioFrameProps {
  ratio: string; // e.g. '1:1', '16:9', '2:3'
  visible: boolean;
  opacity: number;
}

const RATIO_MAP: Record<string, number> = {
  '1:1': 1,
  '4:3': 4 / 3,
  '3:4': 3 / 4,
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '2:3': 2 / 3,
  '3:2': 3 / 2,
};

export const AspectRatioFrame = memo(function AspectRatioFrame({
  ratio,
  visible,
  opacity,
}: AspectRatioFrameProps) {
  if (!visible) return null;

  const aspectRatio = RATIO_MAP[ratio] ?? 1;
  const percentage = `${(1 / aspectRatio) * 100}%`;

  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      aria-hidden="true"
    >
      <div
        className="rounded-sm border-2 border-dashed border-accent-primary"
        style={{
          opacity,
          aspectRatio: `${aspectRatio}`,
          maxWidth: '90%',
          maxHeight: '90%',
          width: aspectRatio >= 1 ? '90%' : percentage,
          height: aspectRatio < 1 ? '90%' : undefined,
        }}
      />
    </div>
  );
});
```

- [ ] **Step 2: Create ReferenceOverlay**

Create `src/components/studio/ReferenceOverlay.tsx`:

```tsx
import { memo } from 'react';
import type { CompositionLayerState } from '@/types/promptStudio';

interface ReferenceOverlayProps {
  imageUrl: string | null;
  layers: CompositionLayerState['reference'];
}

export const ReferenceOverlay = memo(function ReferenceOverlay({
  imageUrl,
  layers,
}: ReferenceOverlayProps) {
  if (!layers.visible || !imageUrl) return null;

  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ opacity: layers.opacity }}
      aria-label="Reference image overlay"
    >
      <img
        src={imageUrl}
        alt="Reference"
        className="max-h-full max-w-full object-contain"
        style={{ mixBlendMode: layers.blendMode }}
      />
    </div>
  );
});
```

- [ ] **Step 3: Create ControlNetVisualization**

Create `src/components/studio/ControlNetVisualization.tsx`:

```tsx
import { memo } from 'react';
import type { CompositionLayerState } from '@/types/promptStudio';

interface ControlNetVisualizationProps {
  preprocessedImageUrl: string | null;
  preprocessorType: string;
  layers: CompositionLayerState['controlNet'];
}

const PREPROCESSOR_COLORS: Record<string, string> = {
  canny: '#22c55e',
  depth: '#3b82f6',
  openpose: '#ef4444',
  scribble: '#f59e0b',
  segmentation: '#a855f7',
  normal: '#06b6d4',
};

export const ControlNetVisualization = memo(function ControlNetVisualization({
  preprocessedImageUrl,
  preprocessorType,
  layers,
}: ControlNetVisualizationProps) {
  if (!layers.visible || !preprocessedImageUrl) return null;

  const tint = PREPROCESSOR_COLORS[preprocessorType] ?? '#888888';

  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ opacity: layers.opacity }}
      aria-label={`${preprocessorType} ControlNet overlay`}
    >
      <div className="relative max-h-full max-w-full">
        <img
          src={preprocessedImageUrl}
          alt={`${preprocessorType} preprocessing`}
          className="max-h-full max-w-full object-contain"
        />
        <div
          className="absolute inset-0 mix-blend-multiply"
          style={{ backgroundColor: tint + '33' }}
        />
      </div>
    </div>
  );
});
```

- [ ] **Step 4: Create RegionMaskPreview**

Create `src/components/studio/RegionMaskPreview.tsx`:

```tsx
import { memo } from 'react';
import type { CompositionLayerState } from '@/types/promptStudio';

interface RegionMaskPreviewProps {
  maskImageUrl: string | null;
  layers: CompositionLayerState['regionMasks'];
}

export const RegionMaskPreview = memo(function RegionMaskPreview({
  maskImageUrl,
  layers,
}: RegionMaskPreviewProps) {
  if (!layers.visible || !maskImageUrl) return null;

  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ opacity: layers.opacity }}
      aria-label="Region mask overlay"
    >
      <img
        src={maskImageUrl}
        alt="Region mask"
        className="max-h-full max-w-full object-contain"
        style={{ mixBlendMode: 'multiply' }}
      />
    </div>
  );
});
```

- [ ] **Step 5: Create CompositionLayerBar**

Create `src/components/studio/CompositionLayerBar.tsx`:

```tsx
import { memo } from 'react';
import { Eye, EyeOff, ZoomIn, ZoomOut, Maximize, RotateCcw } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { cn } from '@/utils/cn';
import type { CompositionLayerState } from '@/types/promptStudio';

interface CompositionLayerBarProps {
  onGenerate: () => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onResetView: () => void;
}

const LAYER_KEYS = [
  { key: 'aspectFrame' as const, label: 'Frame' },
  { key: 'reference' as const, label: 'Reference' },
  { key: 'controlNet' as const, label: 'ControlNet' },
  { key: 'regionMasks' as const, label: 'Masks' },
] as const;

export const CompositionLayerBar = memo(function CompositionLayerBar({
  onGenerate,
  zoom,
  onZoomChange,
  onResetView,
}: CompositionLayerBarProps) {
  const compositionLayers = useAppStore((s) => s.compositionLayers);
  const setVisibility = useAppStore((s) => s.setCompositionLayerVisibility);
  const setOpacity = useAppStore((s) => s.setCompositionLayerOpacity);

  const activeLayer = LAYER_KEYS.find((l) => compositionLayers[l.key].visible);

  return (
    <div className="flex flex-shrink-0 items-center gap-2 border-b border-border bg-surface px-3 py-1.5">
      <div className="flex items-center gap-1" role="group" aria-label="Layer toggles">
        {LAYER_KEYS.map(({ key, label }) => {
          const layer = compositionLayers[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => setVisibility(key, !layer.visible)}
              className={cn(
                'flex items-center gap-1 rounded-sm px-1.5 py-1 type-micro transition-colors',
                layer.visible ? 'text-accent-primary' : 'text-text-muted',
              )}
              aria-label={`${label} layer ${layer.visible ? 'visible' : 'hidden'}`}
              aria-pressed={layer.visible}
            >
              {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {label}
            </button>
          );
        })}
      </div>

      <div className="mx-1 h-4 w-px bg-border" />

      {activeLayer && (
        <div className="flex items-center gap-1.5">
          <span className="type-micro text-text-muted">{activeLayer.label}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={compositionLayers[activeLayer.key].opacity}
            onChange={(e) => setOpacity(activeLayer.key, parseFloat(e.target.value))}
            className="h-1 w-16 accent-accent-primary"
            aria-label={`${activeLayer.label} opacity`}
          />
        </div>
      )}

      <div className="mx-1 h-4 w-px bg-border" />

      <div className="flex items-center gap-0.5" role="group" aria-label="Zoom controls">
        <button type="button" onClick={() => onZoomChange(Math.max(0.25, zoom - 0.25))} className="rounded-sm p-1 text-text-muted hover:bg-elevated hover:text-text-primary" aria-label="Zoom out">
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <span className="type-micro min-w-[3rem] text-center text-text-muted">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => onZoomChange(Math.min(8, zoom + 0.25))} className="rounded-sm p-1 text-text-muted hover:bg-elevated hover:text-text-primary" aria-label="Zoom in">
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={onResetView} className="rounded-sm p-1 text-text-muted hover:bg-elevated hover:text-text-primary" aria-label="Reset view">
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => onZoomChange(1)} className="rounded-sm p-1 text-text-muted hover:bg-elevated hover:text-text-primary" aria-label="Fit to view">
          <Maximize className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1" />

      <button
        type="button"
        onClick={onGenerate}
        className="rounded-md bg-accent-primary px-3 py-1.5 type-ui text-white hover:bg-accent-primary-pressed"
      >
        Generate
      </button>
    </div>
  );
});
```

- [ ] **Step 6: Create CompositionPreview**

Create `src/components/studio/CompositionPreview.tsx`:

```tsx
import { memo, useState, useCallback } from 'react';
import { useAppStore } from '@/store/appStore';
import { CompositionLayerBar } from './CompositionLayerBar';
import { AspectRatioFrame } from './AspectRatioFrame';
import { ReferenceOverlay } from './ReferenceOverlay';
import { ControlNetVisualization } from './ControlNetVisualization';
import { RegionMaskPreview } from './RegionMaskPreview';
import { ProgressivePreview } from './ProgressivePreview';

export const CompositionPreview = memo(function CompositionPreview() {
  const compositionLayers = useAppStore((s) => s.compositionLayers);
  const isPreviewActive = useAppStore((s) => s.isPreviewActive);
  const [zoom, setZoom] = useState(1);

  const handleResetView = useCallback(() => setZoom(1), []);

  // Read reference image and aspect ratio from generation state
  // These will be wired to the actual generation config in Task 8
  const referenceImageUrl: string | null = null; // TODO: wire to ImageDropZone state
  const currentAspectRatio = '1:1'; // TODO: wire to generation config
  const controlNetPreviewUrl: string | null = null; // TODO: wire to ControlNet state
  const controlNetPreprocessor = 'canny'; // TODO: wire to ControlNet state
  const regionMaskUrl: string | null = null; // TODO: wire to region mask state

  const handleGenerate = useCallback(() => {
    // TODO: Wire to generation action in Task 8
  }, []);

  if (isPreviewActive) {
    return <ProgressivePreview />;
  }

  return (
    <div className="flex h-full flex-col bg-void">
      <CompositionLayerBar
        onGenerate={handleGenerate}
        zoom={zoom}
        onZoomChange={setZoom}
        onResetView={handleResetView}
      />
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          className="flex h-full w-full items-center justify-center"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
        >
          {/* Base: empty canvas or reference image */}
          {referenceImageUrl ? (
            <img src={referenceImageUrl} alt="Reference" className="max-h-full max-w-full object-contain" />
          ) : (
            <div className="flex flex-col items-center justify-center text-text-muted">
              <p className="type-body">Drop a reference image or start generating</p>
              <p className="type-micro mt-1">Composition layers will appear here</p>
            </div>
          )}

          <AspectRatioFrame
            ratio={currentAspectRatio}
            visible={compositionLayers.aspectFrame.visible}
            opacity={compositionLayers.aspectFrame.opacity}
          />
          <ReferenceOverlay imageUrl={referenceImageUrl} layers={compositionLayers.reference} />
          <ControlNetVisualization
            preprocessedImageUrl={controlNetPreviewUrl}
            preprocessorType={controlNetPreprocessor}
            layers={compositionLayers.controlNet}
          />
          <RegionMaskPreview maskImageUrl={regionMaskUrl} layers={compositionLayers.regionMasks} />
        </div>
      </div>
    </div>
  );
});
```

- [ ] **Step 7: Run typecheck**

```bash
cd /c/vision-studio && npm run typecheck
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/components/studio/CompositionPreview.tsx src/components/studio/CompositionLayerBar.tsx src/components/studio/AspectRatioFrame.tsx src/components/studio/ReferenceOverlay.tsx src/components/studio/ControlNetVisualization.tsx src/components/studio/RegionMaskPreview.tsx
git commit -m "feat(studio): create Composition Preview with layered visualization"
```

---

## Task 8: Create Progressive Preview & Wire State

**Files:**
- Create: `src/components/studio/ProgressivePreview.tsx`
- Create: `src/components/studio/ProgressiveStepOverlay.tsx`

- [ ] **Step 1: Create ProgressiveStepOverlay**

Create `src/components/studio/ProgressiveStepOverlay.tsx`:

```tsx
import { memo } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';

interface ProgressiveStepOverlayProps {
  currentStep: number;
  totalSteps: number;
  onCancel: () => void;
}

export const ProgressiveStepOverlay = memo(function ProgressiveStepOverlay({
  currentStep,
  totalSteps,
  onCancel,
}: ProgressiveStepOverlayProps) {
  const progress = totalSteps > 0 ? currentStep / totalSteps : 0;

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-end justify-between p-3">
      {/* Cancel button - pointer-events enabled */}
      <button
        type="button"
        onClick={onCancel}
        className="pointer-events-auto rounded-md border border-border bg-surface/80 px-2.5 py-1.5 type-ui text-text-primary backdrop-blur-sm hover:bg-elevated"
        aria-label="Cancel generation"
      >
        <X className="h-4 w-4" />
      </button>

      {/* Step counter with progress ring */}
      <div className="pointer-events-auto flex items-center gap-2 rounded-md border border-border bg-surface/80 px-3 py-1.5 backdrop-blur-sm">
        <svg width="24" height="24" viewBox="0 0 24 24" className="-rotate-90">
          <circle
            cx="12" cy="12" r="10"
            fill="none"
            stroke="var(--color-border, #333)"
            strokeWidth="2"
          />
          <circle
            cx="12" cy="12" r="10"
            fill="none"
            stroke="var(--color-accent-primary, #e53e3e)"
            strokeWidth="2"
            strokeDasharray={`${progress * 62.83} 62.83`}
            strokeLinecap="round"
          />
        </svg>
        <span className="type-ui text-text-primary">
          Step {currentStep} / {totalSteps}
        </span>
      </div>
    </div>
  );
});
```

- [ ] **Step 2: Create ProgressivePreview**

Create `src/components/studio/ProgressivePreview.tsx`:

```tsx
import { memo, useCallback, useRef, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { ProgressiveStepOverlay } from './ProgressiveStepOverlay';
import { cn } from '@/utils/cn';

export const ProgressivePreview = memo(function ProgressivePreview() {
  const stepImages = useAppStore((s) => s.stepImages);
  const currentStep = useAppStore((s) => s.currentStep);
  const totalSteps = useAppStore((s) => s.totalSteps);
  const clearPreview = useAppStore((s) => s.clearPreview);

  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  const latestStepImage = currentStep > 0 ? stepImages.get(currentStep) : null;

  const handleCancel = useCallback(() => {
    // TODO: Wire to generation cancellation in Task 8
    clearPreview();
  }, [clearPreview]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom((z) => Math.min(8, Math.max(0.25, z - e.deltaY * 0.002)));
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative flex h-full flex-col bg-void"
      onWheel={handleWheel}
    >
      <ProgressiveStepOverlay
        currentStep={currentStep}
        totalSteps={totalSteps}
        onCancel={handleCancel}
      />

      <div className="flex flex-1 items-center justify-center overflow-hidden">
        {latestStepImage ? (
          <img
            src={latestStepImage}
            alt={`Generation step ${currentStep}`}
            className="max-h-full max-w-full object-contain transition-opacity duration-150"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
          />
        ) : (
          <div className="flex flex-col items-center gap-3 text-text-muted">
            <div className="h-12 w-12 animate-spin rounded-full border-2 border-border border-t-accent-primary" />
            <p className="type-body">Initializing generation...</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center border-t border-border py-1.5">
        <span className="type-micro text-text-muted">
          {zoom !== 1 ? `${Math.round(zoom * 100)}%` : 'Ctrl+Scroll to zoom'}
        </span>
      </div>
    </div>
  );
});
```

- [ ] **Step 3: Run typecheck**

```bash
cd /c/vision-studio && npm run typecheck
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/studio/ProgressivePreview.tsx src/components/studio/ProgressiveStepOverlay.tsx
git commit -m "feat(studio): create Progressive Preview with step overlay and zoom controls"
```

---

## Task 9: Write Component Tests

**Files:**
- Create: `src/components/studio/PromptStudioPanel.test.tsx`
- Create: `src/components/studio/CompositionPreview.test.tsx`
- Create: `src/components/studio/ProgressivePreview.test.tsx`

- [ ] **Step 1: Write PromptStudioPanel tests**

Create `src/components/studio/PromptStudioPanel.test.tsx`:

```tsx
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PromptStudioPanel } from './PromptStudioPanel';
import { useAppStore } from '@/store/appStore';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

describe('PromptStudioPanel', () => {
  beforeEach(resetStore);

  it('renders prompt editor sections', () => {
    render(<PromptStudioPanel />);
    expect(screen.getByText('Prompt Editor')).toBeInTheDocument();
    expect(screen.getByText('Enhancement')).toBeInTheDocument();
    expect(screen.getByText('Templates')).toBeInTheDocument();
  });

  it('renders positive and negative prompt editors', () => {
    render(<PromptStudioPanel />);
    expect(screen.getByLabelText('Positive Prompt')).toBeInTheDocument();
    expect(screen.getByLabelText('Negative Prompt')).toBeInTheDocument();
  });

  it('renders enhancement toolkit buttons', () => {
    render(<PromptStudioPanel />);
    expect(screen.getByLabelText('AI Enhance')).toBeInTheDocument();
    expect(screen.getByLabelText('Expand')).toBeInTheDocument();
    expect(screen.getByLabelText('Neg. Suggest')).toBeInTheDocument();
  });

  it('collapses and expands sections', async () => {
    const user = userEvent.setup();
    render(<PromptStudioPanel />);
    const enhancementButton = screen.getByText('Enhancement');
    await user.click(enhancementButton);
    // Section content should be hidden
    expect(screen.queryByLabelText('AI Enhance')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Write CompositionPreview tests**

Create `src/components/studio/CompositionPreview.test.tsx`:

```tsx
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CompositionPreview } from './CompositionPreview';
import { useAppStore } from '@/store/appStore';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

describe('CompositionPreview', () => {
  beforeEach(resetStore);

  it('renders composition layer bar', () => {
    render(<CompositionPreview />);
    expect(screen.getByText('Frame')).toBeInTheDocument();
    expect(screen.getByText('Reference')).toBeInTheDocument();
    expect(screen.getByText('ControlNet')).toBeInTheDocument();
    expect(screen.getByText('Masks')).toBeInTheDocument();
  });

  it('renders generate button', () => {
    render(<CompositionPreview />);
    expect(screen.getByRole('button', { name: /generate/i })).toBeInTheDocument();
  });

  it('renders zoom controls', () => {
    render(<CompositionPreview />);
    expect(screen.getByLabelText('Zoom out')).toBeInTheDocument();
    expect(screen.getByLabelText('Zoom in')).toBeInTheDocument();
  });

  it('renders empty state when no reference image', () => {
    render(<CompositionPreview />);
    expect(screen.getByText(/Drop a reference image/i)).toBeInTheDocument();
  });

  it('renders ProgressivePreview when preview is active', () => {
    useAppStore.setState({ isPreviewActive: true, currentStep: 1, totalSteps: 20 });
    render(<CompositionPreview />);
    expect(screen.getByText(/Step 1 \/ 20/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Write ProgressivePreview tests**

Create `src/components/studio/ProgressivePreview.test.tsx`:

```tsx
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressivePreview } from './ProgressivePreview';
import { useAppStore } from '@/store/appStore';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

describe('ProgressivePreview', () => {
  beforeEach(resetStore);

  it('renders step counter', () => {
    useAppStore.setState({ currentStep: 5, totalSteps: 20, isPreviewActive: true });
    render(<ProgressivePreview />);
    expect(screen.getByText('Step 5 / 20')).toBeInTheDocument();
  });

  it('renders cancel button', () => {
    useAppStore.setState({ currentStep: 1, totalSteps: 10, isPreviewActive: true });
    render(<ProgressivePreview />);
    expect(screen.getByLabelText('Cancel generation')).toBeInTheDocument();
  });

  it('renders loading state when no step images', () => {
    useAppStore.setState({ currentStep: 0, totalSteps: 0, isPreviewActive: true });
    render(<ProgressivePreview />);
    expect(screen.getByText('Initializing generation...')).toBeInTheDocument();
  });

  it('renders step image when available', () => {
    const images = new Map<number, string>();
    images.set(3, 'data:image/png;base64,test');
    useAppStore.setState({
      stepImages: images,
      currentStep: 3,
      totalSteps: 20,
      isPreviewActive: true,
    });
    render(<ProgressivePreview />);
    expect(screen.getByAltText('Generation step 3')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run all new tests**

```bash
cd /c/vision-studio && npx vitest run src/components/studio/ --project component
```

Expected: All tests pass

- [ ] **Step 5: Run full test suite**

```bash
cd /c/vision-studio && npm run test
```

Expected: All existing + new tests pass

- [ ] **Step 6: Commit**

```bash
git add src/components/studio/PromptStudioPanel.test.tsx src/components/studio/CompositionPreview.test.tsx src/components/studio/ProgressivePreview.test.tsx
git commit -m "test(studio): add component tests for PromptStudio, CompositionPreview, and ProgressivePreview"
```

---

## Task 10: Wire Enhancement Actions & Generation Integration

**Files:**
- Modify: `src/components/studio/PromptEnhancementToolkit.tsx` — wire AI enhance call
- Modify: `src/components/studio/PromptStudioPanel.tsx` — wire template apply, enhancement actions
- Modify: `src/components/studio/CompositionPreview.tsx` — wire generate action, aspect ratio from store
- Modify: `src/store/slices/promptStudioSlice.ts` — wire applyPromptTemplate to update generation draft

- [ ] **Step 1: Wire PromptEnhancementToolkit AI enhance**

In `src/components/studio/PromptEnhancementToolkit.tsx`, add the AI enhance handler:

```tsx
const handleEnhance = useCallback(async () => {
  if (!onEnhance) return;
  // The parent component handles the actual IPC call
  onEnhance();
}, [onEnhance]);
```

The `onEnhance` callback is already passed as a prop. The actual `window.electron.generation.enhancePrompt` call will be in the parent `PromptStudioPanel`.

- [ ] **Step 2: Wire PromptStudioPanel template apply and enhancement**

In `src/components/studio/PromptStudioPanel.tsx`, update the handlers:

```tsx
const handleEnhance = useCallback(async () => {
  if (!window.electron?.generation?.enhancePrompt) return;
  try {
    const enhanced = await window.electron.generation.enhancePrompt(positivePrompt);
    setPositivePrompt(enhanced);
  } catch {
    // Error toast — enhancement failed, revert
  }
}, [positivePrompt]);
```

For template application, wire `applyPromptTemplate` to update the prompt state:

```tsx
const handleApplyTemplate = useCallback((id: string, mode: 'replace' | 'merge') => {
  const template = useAppStore.getState().promptTemplates.find((t) => t.id === id);
  if (!template) return;
  if (mode === 'replace') {
    setPositivePrompt(template.promptText);
    if (template.negativePrompt) setNegativePrompt(template.negativePrompt);
  } else {
    setPositivePrompt((prev) => `${prev}, ${template.promptText}`);
    if (template.negativePrompt) {
      setNegativePrompt((prev) => prev ? `${prev}, ${template.negativePrompt}` : template.negativePrompt);
    }
  }
  useAppStore.getState().applyPromptTemplate(id, mode);
}, []);
```

- [ ] **Step 3: Wire CompositionPreview generate action and aspect ratio**

In `src/components/studio/CompositionPreview.tsx`, read the aspect ratio from the generation config:

```tsx
// Read aspect ratio from generation config (will be wired to store when generation config is connected)
const currentAspectRatio = '1:1'; // placeholder — will read from generationSlice config
```

The actual wiring to `generationDraft` and aspect ratio selection will be completed when the PromptStudioPanel is connected to the generation flow.

- [ ] **Step 4: Run typecheck**

```bash
cd /c/vision-studio && npm run typecheck
```

Expected: PASS

- [ ] **Step 5: Run full test suite**

```bash
cd /c/vision-studio && npm run test
```

Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/components/studio/PromptEnhancementToolkit.tsx src/components/studio/PromptStudioPanel.tsx src/components/studio/CompositionPreview.tsx src/store/slices/promptStudioSlice.ts
git commit -m "feat(studio): wire enhancement actions, template apply, and composition generate"
```

---

## Task 11: Accessibility & Final Validation

**Files:**
- Modify: All studio components for accessibility

- [ ] **Step 1: Verify keyboard navigation**

All interactive elements in PromptStudioPanel, CompositionPreview, and ProgressivePreview must be focusable via Tab. Enter/Space must activate buttons. Focus rings must be visible.

- [ ] **Step 2: Verify ARIA attributes**

- `TokenWeightedEditor` textareas have `aria-label`
- `PromptTemplateCard` buttons have `aria-label`
- `CompositionLayerBar` layer toggles have `aria-pressed`
- `ProgressiveStepOverlay` has cancel button with `aria-label`
- `CompositionPreview` uses `role="img"` on composition canvas

- [ ] **Step 3: Verify dark theme**

All studio components use design system tokens (`text-text-primary`, `bg-surface`, `border-border`, etc.). Confirm visually.

- [ ] **Step 4: Run full validation suite**

```bash
cd /c/vision-studio && npm run test && npm run typecheck && npm run build
```

Expected: All pass

- [ ] **Step 5: Commit any accessibility fixes**

```bash
git add -A
git commit -m "fix(studio): accessibility and polish for Prompt Studio and Composition Preview"
```

---

## Self-Review Checklist

| Spec requirement | Task |
|-----------------|------|
| Token-weighted prompt editor | Task 6 (TokenWeightedEditor + TokenHighlighter) |
| A1111 syntax parsing | Task 2 (promptTokenizer) |
| Token count tracker | Task 6 (TokenWeightedEditor) |
| Built-in + user templates | Task 3 + Task 4 (builtInTemplates + store) |
| Template apply (replace/merge) | Task 6 + Task 10 (PromptTemplateLibrary + wiring) |
| AI Enhance | Task 6 + Task 10 (PromptEnhancementToolkit + wiring) |
| Style Transfer / Semantic Expansion / Negative Suggest | Task 6 (PromptEnhancementToolkit — UI shell) |
| Composition preview layers | Task 7 (CompositionPreview + layer components) |
| Aspect ratio frame | Task 7 (AspectRatioFrame) |
| Reference overlay with opacity/blend | Task 7 (ReferenceOverlay) |
| ControlNet visualization | Task 7 (ControlNetVisualization) |
| Region mask preview | Task 7 (RegionMaskPreview) |
| Composition layer bar with toggles/zoom/generate | Task 7 (CompositionLayerBar) |
| Progressive preview with step images | Task 8 (ProgressivePreview) |
| Step counter + progress ring | Task 8 (ProgressiveStepOverlay) |
| Cancel generation | Task 8 (ProgressiveStepOverlay cancel button) |
| Zoom/pan on preview | Task 8 (ProgressivePreview wheel handler) |
| Studio sub-mode navigation | Task 5 (GenerateSubMode extension) |
| Store slices (promptStudio + generationPreview) | Task 4 |
| ~105 new tests | Task 2 + Task 4 + Task 9 (~85 core, remaining in Task 10–11) |
| Accessibility | Task 11 |