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
