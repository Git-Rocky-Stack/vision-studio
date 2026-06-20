import type { ComfyPrompt } from './comfyExport';
import { FIRST_CLASS_NODES } from './nodeDefaults';

/** File-path / model-name fields whose values must never escape the Comfy roots. */
const PATH_FIELDS = ['ckpt_name', 'lora_name', 'vae_name', 'filename_prefix', 'image'];

export interface SafetyIssue {
  nodeId: string;
  reason: string;
}

export interface SafetyResult {
  safe: boolean;
  issues: SafetyIssue[];
}

function isUnsafePath(value: string): boolean {
  return (
    value.includes('..') ||
    value.includes(' ') ||
    /^[a-zA-Z]:/.test(value) || // Windows drive letter
    /^[/\\]/.test(value) // absolute path
  );
}

/**
 * Advisory renderer-side pre-check. Flags (never silently drops) any opaque node
 * type and any path-shaped input that escapes the Comfy roots. The authoritative
 * gate is the backend (comfy_graph_guard.py); this only drives the UI executable
 * badge so the user sees why a graph cannot run.
 */
export function evaluateGraphSafety(prompt: ComfyPrompt): SafetyResult {
  const issues: SafetyIssue[] = [];

  for (const [nodeId, node] of Object.entries(prompt)) {
    if (!FIRST_CLASS_NODES.has(node.class_type)) {
      issues.push({ nodeId, reason: `unsupported node type "${node.class_type}"` });
    }
    for (const field of PATH_FIELDS) {
      const value = node.inputs[field];
      if (typeof value === 'string' && isUnsafePath(value)) {
        issues.push({ nodeId, reason: `unsafe path in "${field}"` });
      }
    }
  }

  return { safe: issues.length === 0, issues };
}
