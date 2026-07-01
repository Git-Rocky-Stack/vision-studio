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
