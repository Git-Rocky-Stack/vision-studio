/**
 * #34 installer PR3: minimal parser for THIRD-PARTY-LICENSES.md.
 *
 * The document is GENERATED (backend/foundry/notices.py) and drift-guarded by
 * backend/tests/test_notices.py, so its structure is a closed set: h1-h3
 * headings, "- " list items, **bold**, [text](url) links, plain paragraphs.
 * Parsing that fixed grammar here keeps the About > Licenses screen bound to
 * the exact shipped compliance artifact - one source of truth, no markdown
 * dependency, no dangerouslySetInnerHTML.
 */

export type LicenseSpan =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'link'; text: string; url: string };

export type LicensesBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'paragraph'; spans: LicenseSpan[] }
  | { kind: 'listItem'; spans: LicenseSpan[] };

const INLINE = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;

function parseInlineSpans(text: string): LicenseSpan[] {
  const spans: LicenseSpan[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last) spans.push({ kind: 'text', text: text.slice(last, index) });
    if (match[1] !== undefined) {
      spans.push({ kind: 'link', text: match[1], url: match[2] });
    } else {
      spans.push({ kind: 'bold', text: match[3] });
    }
    last = index + match[0].length;
  }
  if (last < text.length) spans.push({ kind: 'text', text: text.slice(last) });
  return spans;
}

export function parseLicensesMarkdown(markdown: string): LicensesBlock[] {
  const blocks: LicensesBlock[] = [];
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({
        kind: 'heading',
        level: heading[1].length as 1 | 2 | 3,
        text: heading[2],
      });
      continue;
    }
    if (line.startsWith('- ')) {
      blocks.push({ kind: 'listItem', spans: parseInlineSpans(line.slice(2)) });
      continue;
    }
    blocks.push({ kind: 'paragraph', spans: parseInlineSpans(line) });
  }
  return blocks;
}
