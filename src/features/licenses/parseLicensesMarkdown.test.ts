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
