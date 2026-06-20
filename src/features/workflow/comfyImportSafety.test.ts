import { describe, expect, it } from 'vitest';
import { evaluateGraphSafety } from './comfyImportSafety';
import type { ComfyPrompt } from './comfyExport';

const safe: ComfyPrompt = {
  '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'flux1-dev.safetensors' } },
  '2': { class_type: 'SaveImage', inputs: { filename_prefix: 'vision_studio', images: ['1', 0] } },
};

describe('evaluateGraphSafety', () => {
  it('passes a first-class graph with clean paths', () => {
    expect(evaluateGraphSafety(safe)).toEqual({ safe: true, issues: [] });
  });

  it('flags an unsupported node type', () => {
    const result = evaluateGraphSafety({ '1': { class_type: 'ExecCustomNode', inputs: {} } });
    expect(result.safe).toBe(false);
    expect(result.issues[0].reason).toContain('unsupported node');
  });

  it('flags traversal, absolute, and drive-letter path inputs', () => {
    const result = evaluateGraphSafety({
      '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: '../../etc/passwd' } },
      '2': { class_type: 'SaveImage', inputs: { filename_prefix: '/abs/path', images: ['1', 0] } },
      '3': { class_type: 'VAELoader', inputs: { vae_name: 'C:\\windows\\vae' } },
    });
    expect(result.safe).toBe(false);
    expect(result.issues.length).toBeGreaterThanOrEqual(3);
  });
});
