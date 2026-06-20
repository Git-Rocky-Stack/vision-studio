/**
 * Named-output <-> integer-slot reconciliation for first-class Comfy nodes.
 * In-app graphs label links by named output (e.g. 'CONDITIONING'); ComfyUI link
 * tuples require the integer output-slot index. This map bridges the two so
 * exports are genuinely ComfyUI-loadable and imports stay internally consistent.
 * Slots follow ComfyUI's canonical output ordering for each node.
 */
export const NODE_OUTPUT_SLOTS: Record<string, string[]> = {
  CheckpointLoaderSimple: ['MODEL', 'CLIP', 'VAE'],
  CLIPTextEncode: ['CONDITIONING'],
  EmptyLatentImage: ['LATENT'],
  KSampler: ['LATENT'],
  VAEDecode: ['IMAGE'],
  VAELoader: ['VAE'],
  LoraLoader: ['MODEL', 'CLIP'],
  // SaveImage / PreviewImage are terminal (no outputs).
};

export function namedOutputToSlot(classType: string, output: string): number | null {
  const slots = NODE_OUTPUT_SLOTS[classType];
  if (!slots) return null;
  const index = slots.indexOf(output);
  return index === -1 ? null : index;
}

export function slotToNamedOutput(classType: string, slot: number): string | null {
  const slots = NODE_OUTPUT_SLOTS[classType];
  if (!slots) return null;
  return slots[slot] ?? null;
}
