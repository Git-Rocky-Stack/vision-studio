import { isLoraCompatible, selectInstalledLoras } from '@/store/slices/modelsSlice';
import type { WorkflowGraph } from '@/types/workflow';

/**
 * LoRA Loader node wiring to the installed-LoRA library (#43).
 *
 * ComfyUI identifies a LoRA by its filename under models/loras; the Foundry
 * identifies it by record id. These helpers translate between the two so the
 * workflow graph stays Comfy-faithful (lora_name literals export verbatim)
 * while execution maps selections onto installed records for the #136 mixer
 * contract ({ id, weight }).
 */

/** The subset of the execution context's model entries these helpers read. */
export interface WorkflowModelEntry {
  id?: string;
  name?: string;
  artifact_type?: string;
  base_architecture?: string;
  locations?: string[];
  availability?: string;
}

export interface WorkflowLoraOption {
  /** ComfyUI-visible filename stored in the node's lora_name input. */
  value: string;
  /** Display name from the installed record. */
  label: string;
  /** False when the record's family cannot load on the graph checkpoint. */
  compatible: boolean;
}

function basename(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const segments = normalized.split('/');
  return segments[segments.length - 1] ?? normalized;
}

/** ComfyUI-visible name for an installed LoRA record. */
export function comfyLoraName(record: WorkflowModelEntry): string {
  const firstLocation = record.locations?.[0];
  return firstLocation ? basename(firstLocation) : `${record.id ?? 'lora'}.safetensors`;
}

function installedLoras(models: WorkflowModelEntry[]): WorkflowModelEntry[] {
  return selectInstalledLoras(models);
}

/**
 * Options for the LoRA Loader node picker: every installed LoRA, flagged for
 * base-architecture compatibility against the graph's checkpoint family.
 * When the checkpoint family is unknown, nothing is flagged - the backend's
 * fail-soft loader (#136) is the final authority and skips bad stacks cleanly.
 */
export function buildLoraNodeOptions(
  models: WorkflowModelEntry[],
  checkpointBaseArchitecture: string | null,
): WorkflowLoraOption[] {
  return installedLoras(models).map((record) => ({
    value: comfyLoraName(record),
    label: record.name ?? record.id ?? 'LoRA',
    compatible: checkpointBaseArchitecture
      ? isLoraCompatible(checkpointBaseArchitecture, record.base_architecture ?? '')
      : true,
  }));
}

/**
 * Resolve a lora_name literal back to the installed record. Matches the
 * ComfyUI-visible filename first (case-insensitive), then record id, then
 * display name - never a non-LoRA record.
 */
export function resolveLoraByComfyName(
  loraName: string,
  models: WorkflowModelEntry[],
): WorkflowModelEntry | null {
  const wanted = loraName.trim().toLowerCase();
  if (!wanted) return null;

  const loras = installedLoras(models);
  return (
    loras.find((record) => comfyLoraName(record).toLowerCase() === wanted) ??
    loras.find((record) => record.id?.toLowerCase() === wanted) ??
    loras.find((record) => record.name?.toLowerCase() === wanted) ??
    null
  );
}

const CHECKPOINT_EXTENSION = /\.(safetensors|ckpt|pt|gguf)$/i;

/**
 * Resolve a workflow model string (record id, display name, or Comfy-style
 * checkpoint filename) to the indexed checkpoint record, or null when the
 * string is not in the library (base-arch validation is then skipped).
 */
export function resolveCheckpointRecord(
  model: string,
  models: WorkflowModelEntry[],
): WorkflowModelEntry | null {
  const wanted = model.trim().toLowerCase();
  if (!wanted) return null;
  const stem = basename(wanted).replace(CHECKPOINT_EXTENSION, '');

  const checkpoints = models.filter((record) => record.artifact_type !== 'lora');
  return (
    checkpoints.find((record) => record.id?.toLowerCase() === wanted) ??
    checkpoints.find((record) => record.name?.toLowerCase() === wanted) ??
    checkpoints.find((record) => record.id?.toLowerCase() === stem) ??
    checkpoints.find((record) =>
      record.locations?.some((location) => basename(location).toLowerCase() === basename(wanted)),
    ) ??
    null
  );
}

/** The first checkpoint loader's ckpt_name literal in a graph, if any. */
export function graphCheckpointName(graph: WorkflowGraph): string | null {
  for (const node of Object.values(graph.nodes)) {
    if (node.classType !== 'CheckpointLoaderSimple') continue;
    const input = node.inputs.ckpt_name;
    if (input?.kind === 'literal' && typeof input.value === 'string' && input.value.trim()) {
      return input.value.trim();
    }
  }
  return null;
}
