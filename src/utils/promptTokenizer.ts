import type { ParsedPrompt, PromptToken } from '@/types/promptStudio';

const MIN_WEIGHT = 0.1;
const MAX_WEIGHT = 2.0;
const CLIP_TOKEN_MULTIPLIER = 1.3;
const CLIP_TOKEN_LIMIT = 75;

/**
 * Parses A1111-style prompt syntax into structured tokens with computed weights.
 *
 * Supported syntax:
 * - Plain text → weight 1.0, syntaxType 'normal'
 * - `(word:1.5)` → explicit weight, syntaxType 'weighted', clamped to [0.1, 2.0]
 * - `(word)` → emphasis (+0.1 per layer), syntaxType 'emphasis'
 * - `((word))` → nested emphasis (1.1 * 1.1 = 1.21)
 * - `[word]` → deemphasis (-0.1 per layer), syntaxType 'deemphasis'
 * - `[[word]]` → nested deemphasis (0.9 * 0.9 = 0.81)
 *
 * Malformed syntax (unclosed parens, unmatched brackets) is treated as plain text.
 */
export function parsePrompt(rawText: string): ParsedPrompt {
  if (!rawText) {
    return { rawText: '', tokens: [], tokenCount: 0, exceedsLimit: false };
  }

  const tokens: PromptToken[] = [];
  let pos = 0;

  while (pos < rawText.length) {
    // Try structured syntax first
    const structured = tryParseStructured(rawText, pos);
    if (structured) {
      tokens.push(structured.token);
      pos = structured.endIndex;
      continue;
    }

    // Accumulate contiguous plain text into a single token
    const start = pos;
    let end = pos;
    while (end < rawText.length && !tryParseStructured(rawText, end)) {
      end++;
    }
    tokens.push({
      text: rawText.slice(start, end),
      weight: 1.0,
      syntaxType: 'normal',
      startIndex: start,
      endIndex: end,
    });
    pos = end;
  }

  const tokenCount = approximateClipTokens(tokens);
  const exceedsLimit = tokenCount > CLIP_TOKEN_LIMIT;

  return { rawText, tokens, tokenCount, exceedsLimit };
}

/**
 * Result of parsing a single structured token at a given position.
 */
interface TokenParseResult {
  token: PromptToken;
  endIndex: number;
}

/**
 * Attempts to parse a structured token (weighted, emphasis, or deemphasis) at `pos`.
 * Returns null if no structured syntax starts at `pos`.
 */
function tryParseStructured(text: string, pos: number): TokenParseResult | null {
  // Try weighted syntax: (text:weight)
  const weighted = tryParseWeighted(text, pos);
  if (weighted) return weighted;

  // Try emphasis: (text) or nested ((text))
  const emphasis = tryParseEmphasis(text, pos);
  if (emphasis) return emphasis;

  // Try deemphasis: [text] or nested [[text]]
  const deemphasis = tryParseDeemphasis(text, pos);
  if (deemphasis) return deemphasis;

  return null;
}

/**
 * Tries to parse weighted syntax `(text:weight)` starting at `pos`.
 * Returns null if the character at `pos` is not '(' or the syntax is malformed.
 */
function tryParseWeighted(text: string, pos: number): TokenParseResult | null {
  if (text[pos] !== '(') return null;

  const closeIndex = findMatchingParen(text, pos);
  if (closeIndex === -1) return null;

  const inner = text.slice(pos + 1, closeIndex);

  // Check for explicit weight: (text:1.5)
  const colonIndex = inner.lastIndexOf(':');
  if (colonIndex === -1) return null; // no weight separator -- let emphasis handle it

  const content = inner.slice(0, colonIndex);
  const weightStr = inner.slice(colonIndex + 1);

  const weight = parseFloat(weightStr);
  if (isNaN(weight)) return null;

  if (content.length === 0) return null;

  const clampedWeight = clampWeight(weight);

  return {
    token: {
      text: content,
      weight: clampedWeight,
      syntaxType: 'weighted',
      startIndex: pos,
      endIndex: closeIndex + 1,
    },
    endIndex: closeIndex + 1,
  };
}

/**
 * Tries to parse emphasis syntax `(text)` with nesting support.
 * Each nesting level multiplies weight by 1.1.
 * `((word))` → 1.1 * 1.1 = 1.21
 */
function tryParseEmphasis(text: string, pos: number): TokenParseResult | null {
  if (text[pos] !== '(') return null;

  // Weighted syntax would have already matched if there's a colon,
  // so this must be pure emphasis

  const closeIndex = findMatchingParen(text, pos);
  if (closeIndex === -1) return null;

  // Count nesting depth of opening parens
  let depth = 0;
  let currentPos = pos;
  while (currentPos < text.length && text[currentPos] === '(') {
    depth++;
    currentPos++;
  }

  // Find depth consecutive closing parens
  const closePattern = ')'.repeat(depth);
  const closePos = text.indexOf(closePattern, currentPos);
  if (closePos === -1) return null;

  const content = text.slice(currentPos, closePos);
  if (content.length === 0) return null;

  // Ensure content doesn't contain a colon-weight pattern (that would be weighted)
  // Since weighted already didn't match, we know there's no valid weight after colon

  const weight = Math.pow(1.1, depth);

  return {
    token: {
      text: content,
      weight: clampWeight(weight),
      syntaxType: 'emphasis',
      startIndex: pos,
      endIndex: closePos + depth,
    },
    endIndex: closePos + depth,
  };
}

/**
 * Tries to parse deemphasis syntax `[text]` with nesting support.
 * Each nesting level multiplies weight by 0.9.
 * `[[word]]` → 0.9 * 0.9 = 0.81
 */
function tryParseDeemphasis(text: string, pos: number): TokenParseResult | null {
  if (text[pos] !== '[') return null;

  // Count nesting depth of opening brackets
  let depth = 0;
  let currentPos = pos;
  while (currentPos < text.length && text[currentPos] === '[') {
    depth++;
    currentPos++;
  }

  // Find depth consecutive closing brackets
  const closePattern = ']'.repeat(depth);
  const closePos = text.indexOf(closePattern, currentPos);
  if (closePos === -1) return null;

  const content = text.slice(currentPos, closePos);
  if (content.length === 0) return null;

  const weight = Math.pow(0.9, depth);

  return {
    token: {
      text: content,
      weight: clampWeight(weight),
      syntaxType: 'deemphasis',
      startIndex: pos,
      endIndex: closePos + depth,
    },
    endIndex: closePos + depth,
  };
}

/**
 * Finds the matching closing parenthesis for the '(' at `openPos`.
 * Returns the index of ')', or -1 if unmatched.
 */
function findMatchingParen(text: string, openPos: number): number {
  let depth = 0;
  for (let i = openPos; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Clamps a weight value to the [0.1, 2.0] range.
 */
function clampWeight(weight: number): number {
  return Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, Math.round(weight * 100) / 100));
}

/**
 * Approximates CLIP token count from parsed tokens.
 * Uses ~1.3x word count as an approximation.
 */
function approximateClipTokens(tokens: PromptToken[]): number {
  let wordCount = 0;
  for (const token of tokens) {
    const words = token.text.trim().split(/\s+/).filter(Boolean);
    wordCount += words.length;
  }
  return Math.ceil(wordCount * CLIP_TOKEN_MULTIPLIER);
}