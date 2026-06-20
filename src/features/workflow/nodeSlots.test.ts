import { describe, expect, it } from 'vitest';
import { NODE_OUTPUT_SLOTS, namedOutputToSlot, slotToNamedOutput } from './nodeSlots';

describe('nodeSlots reconciliation', () => {
  it('maps checkpoint outputs to their ComfyUI slot order', () => {
    expect(NODE_OUTPUT_SLOTS.CheckpointLoaderSimple).toEqual(['MODEL', 'CLIP', 'VAE']);
    expect(namedOutputToSlot('CheckpointLoaderSimple', 'CLIP')).toBe(1);
    expect(slotToNamedOutput('CheckpointLoaderSimple', 2)).toBe('VAE');
  });

  it('round-trips every first-class output', () => {
    for (const [classType, slots] of Object.entries(NODE_OUTPUT_SLOTS)) {
      slots.forEach((name, slot) => {
        expect(namedOutputToSlot(classType, name)).toBe(slot);
        expect(slotToNamedOutput(classType, slot)).toBe(name);
      });
    }
  });

  it('returns null for unknown class types or outputs', () => {
    expect(namedOutputToSlot('CustomNode', 'OUT')).toBeNull();
    expect(namedOutputToSlot('KSampler', 'NOPE')).toBeNull();
    expect(slotToNamedOutput('KSampler', 9)).toBeNull();
  });
});
