import { describe, expect, it } from 'vitest';
import { parsePrompt } from './promptTokenizer';

describe('parsePrompt', () => {
  // ── Plain text ────────────────────────────────────────────────────────

  describe('plain text', () => {
    it('parses a simple word as a single normal token', () => {
      const result = parsePrompt('beautiful');
      expect(result.rawText).toBe('beautiful');
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]).toMatchObject({
        text: 'beautiful',
        weight: 1.0,
        syntaxType: 'normal',
      });
    });

    it('returns empty result for empty string', () => {
      const result = parsePrompt('');
      expect(result).toEqual({
        rawText: '',
        tokens: [],
        tokenCount: 0,
        exceedsLimit: false,
      });
    });

    it('groups contiguous plain text into a single token', () => {
      const result = parsePrompt('a b');
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0].text).toBe('a b');
      expect(result.tokens[0].syntaxType).toBe('normal');
    });

    it('preserves spaces in grouped plain text', () => {
      const result = parsePrompt('  leading and trailing  ');
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0].text).toBe('  leading and trailing  ');
    });
  });

  // ── Weighted syntax ──────────────────────────────────────────────────

  describe('weighted syntax', () => {
    it('parses (beautiful:1.5) as a weighted token', () => {
      const result = parsePrompt('(beautiful:1.5)');
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]).toMatchObject({
        text: 'beautiful',
        weight: 1.5,
        syntaxType: 'weighted',
        startIndex: 0,
        endIndex: 15,
      });
    });

    it('parses weight below 1.0', () => {
      const result = parsePrompt('(subtle:0.5)');
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]).toMatchObject({
        text: 'subtle',
        weight: 0.5,
        syntaxType: 'weighted',
      });
    });

    it('clamps weight to minimum of 0.1', () => {
      const result = parsePrompt('(word:0.01)');
      expect(result.tokens[0].weight).toBe(0.1);
    });

    it('clamps weight to maximum of 2.0', () => {
      const result = parsePrompt('(word:5.0)');
      expect(result.tokens[0].weight).toBe(2.0);
    });

    it('handles weight of exactly 0.1', () => {
      const result = parsePrompt('(word:0.1)');
      expect(result.tokens[0].weight).toBe(0.1);
    });

    it('handles weight of exactly 2.0', () => {
      const result = parsePrompt('(word:2.0)');
      expect(result.tokens[0].weight).toBe(2.0);
    });

    it('handles negative weight by clamping to 0.1', () => {
      const result = parsePrompt('(word:-1.0)');
      expect(result.tokens[0].weight).toBe(0.1);
    });
  });

  // ── Emphasis syntax ──────────────────────────────────────────────────

  describe('emphasis syntax', () => {
    it('parses (beautiful) as emphasis with weight 1.1', () => {
      const result = parsePrompt('(beautiful)');
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]).toMatchObject({
        text: 'beautiful',
        weight: 1.1,
        syntaxType: 'emphasis',
      });
    });

    it('parses ((beautiful)) as nested emphasis with weight 1.21', () => {
      const result = parsePrompt('((beautiful))');
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]).toMatchObject({
        text: 'beautiful',
        weight: 1.21,
        syntaxType: 'emphasis',
      });
    });

    it('parses (((beautiful))) as triple-nested emphasis', () => {
      const result = parsePrompt('(((beautiful)))');
      expect(result.tokens).toHaveLength(1);
      const expected = Math.round(1.1 * 1.1 * 1.1 * 100) / 100; // 1.331
      expect(result.tokens[0].weight).toBe(expected);
      expect(result.tokens[0].syntaxType).toBe('emphasis');
    });
  });

  // ── Deemphasis syntax ────────────────────────────────────────────────

  describe('deemphasis syntax', () => {
    it('parses [subtle] as deemphasis with weight 0.9', () => {
      const result = parsePrompt('[subtle]');
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]).toMatchObject({
        text: 'subtle',
        weight: 0.9,
        syntaxType: 'deemphasis',
      });
    });

    it('parses [[subtle]] as nested deemphasis with weight 0.81', () => {
      const result = parsePrompt('[[subtle]]');
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]).toMatchObject({
        text: 'subtle',
        weight: 0.81,
        syntaxType: 'deemphasis',
      });
    });

    it('parses [[[subtle]]] as triple-nested deemphasis', () => {
      const result = parsePrompt('[[[subtle]]]');
      expect(result.tokens).toHaveLength(1);
      const expected = Math.round(0.9 * 0.9 * 0.9 * 100) / 100; // 0.73
      expect(result.tokens[0].weight).toBe(expected);
      expect(result.tokens[0].syntaxType).toBe('deemphasis');
    });
  });

  // ── Mixed syntax ─────────────────────────────────────────────────────

  describe('mixed syntax', () => {
    it('parses a prompt with all token types', () => {
      const result = parsePrompt('(beautiful:1.5), (vibrant), [subtle], plain');
      const weighted = result.tokens.find((t) => t.syntaxType === 'weighted');
      const emphasis = result.tokens.find((t) => t.syntaxType === 'emphasis');
      const deemphasis = result.tokens.find((t) => t.syntaxType === 'deemphasis');
      const normals = result.tokens.filter((t) => t.syntaxType === 'normal');

      expect(weighted).toMatchObject({ text: 'beautiful', weight: 1.5 });
      expect(emphasis).toMatchObject({ text: 'vibrant', weight: 1.1 });
      expect(deemphasis).toMatchObject({ text: 'subtle', weight: 0.9 });
      // Plain text segments include commas and spaces between structured tokens
      expect(normals.length).toBeGreaterThan(0);
      // Reconstruct full text from startIndex/endIndex slices
      const reconstructed = result.tokens
        .map((t) => result.rawText.slice(t.startIndex, t.endIndex))
        .join('');
      expect(reconstructed).toBe('(beautiful:1.5), (vibrant), [subtle], plain');
    });

    it('handles emphasis followed by weighted in same prompt', () => {
      const result = parsePrompt('(vibrant)(sky:1.3)');
      expect(result.tokens).toHaveLength(2);
      expect(result.tokens[0]).toMatchObject({
        text: 'vibrant',
        weight: 1.1,
        syntaxType: 'emphasis',
      });
      expect(result.tokens[1]).toMatchObject({
        text: 'sky',
        weight: 1.3,
        syntaxType: 'weighted',
      });
    });

    it('handles deemphasis followed by plain text', () => {
      const result = parsePrompt('[dark]forest');
      const deemphasis = result.tokens.find((t) => t.syntaxType === 'deemphasis');
      expect(deemphasis).toMatchObject({ text: 'dark', weight: 0.9 });
      // 'forest' is a single grouped normal token
      const normal = result.tokens.find((t) => t.syntaxType === 'normal');
      expect(normal!.text).toBe('forest');
    });

    it('handles plain text between structured tokens', () => {
      const result = parsePrompt('hello (world:1.2) goodbye');
      expect(result.tokens).toHaveLength(3);
      expect(result.tokens[0].syntaxType).toBe('normal');
      expect(result.tokens[0].text).toBe('hello ');
      expect(result.tokens[1].syntaxType).toBe('weighted');
      expect(result.tokens[1].text).toBe('world');
      expect(result.tokens[2].syntaxType).toBe('normal');
      expect(result.tokens[2].text).toBe(' goodbye');
    });
  });

  // ── Token counting ───────────────────────────────────────────────────

  describe('token counting', () => {
    it('approximates CLIP tokens at ~1.3x word count', () => {
      // 5 words * 1.3 = 6.5, ceil = 7
      const result = parsePrompt('a beautiful sunset over mountains');
      expect(result.tokenCount).toBe(7); // 5 words * 1.3 = 6.5 → ceil 7
      expect(result.exceedsLimit).toBe(false);
    });

    it('flags exceedsLimit when tokens exceed 75', () => {
      // Create a prompt with >57 words (57 * 1.3 = 74.1, 58 * 1.3 = 75.4)
      const words = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
      const result = parsePrompt(words);
      expect(result.exceedsLimit).toBe(true);
    });

    it('does not flag exceedsLimit for short prompts', () => {
      const result = parsePrompt('short prompt');
      expect(result.exceedsLimit).toBe(false);
    });

    it('counts tokens from weighted syntax', () => {
      const result = parsePrompt('(beautiful:1.5)');
      // 'beautiful' is 1 word, 1 * 1.3 = 1.3 → ceil 2
      expect(result.tokenCount).toBe(2);
    });

    it('counts tokens from mixed syntax', () => {
      const result = parsePrompt('(sky:1.5) and clouds');
      // 'sky' = 1 word, 'and clouds' = 2 words → 3 words total
      // 3 * 1.3 = 3.9 → ceil 4
      expect(result.tokenCount).toBe(4);
    });
  });

  // ── Malformed syntax ─────────────────────────────────────────────────

  describe('malformed syntax', () => {
    it('treats unclosed parens as plain text', () => {
      const result = parsePrompt('(unclosed');
      // '(' starts but no matching ')', so fallback to plain text as single token
      const text = result.tokens.map((t) => t.text).join('');
      expect(text).toBe('(unclosed');
      result.tokens.forEach((t) => {
        expect(t.syntaxType).toBe('normal');
        expect(t.weight).toBe(1.0);
      });
    });

    it('treats unmatched closing paren as plain text', () => {
      const result = parsePrompt('extra)');
      const text = result.tokens.map((t) => t.text).join('');
      expect(text).toBe('extra)');
      result.tokens.forEach((t) => {
        expect(t.syntaxType).toBe('normal');
      });
    });

    it('treats empty parens () as plain text', () => {
      const result = parsePrompt('()');
      // Empty content → treated as plain text
      const text = result.tokens.map((t) => t.text).join('');
      expect(text).toBe('()');
      result.tokens.forEach((t) => {
        expect(t.syntaxType).toBe('normal');
      });
    });

    it('handles weight without closing paren gracefully', () => {
      const result = parsePrompt('(word:1.5');
      // Unclosed -- falls back to plain text
      const text = result.tokens.map((t) => t.text).join('');
      expect(text).toBe('(word:1.5');
      result.tokens.forEach((t) => {
        expect(t.syntaxType).toBe('normal');
      });
    });

    it('handles unmatched opening bracket as plain text', () => {
      const result = parsePrompt('[unclosed');
      const text = result.tokens.map((t) => t.text).join('');
      expect(text).toBe('[unclosed');
      result.tokens.forEach((t) => {
        expect(t.syntaxType).toBe('normal');
      });
    });

    it('handles unmatched closing bracket as plain text', () => {
      const result = parsePrompt('extra]');
      const text = result.tokens.map((t) => t.text).join('');
      expect(text).toBe('extra]');
      result.tokens.forEach((t) => {
        expect(t.syntaxType).toBe('normal');
      });
    });

    it('handles weight with invalid number as emphasis', () => {
      // (word:abc) -- no valid weight, falls through to emphasis parsing
      const result = parsePrompt('(word:abc)');
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0].syntaxType).toBe('emphasis');
      expect(result.tokens[0].text).toBe('word:abc');
    });
  });

  // ── Index tracking ───────────────────────────────────────────────────

  describe('index tracking', () => {
    it('tracks correct startIndex and endIndex for weighted token', () => {
      const result = parsePrompt('(sky:1.3)');
      const token = result.tokens[0];
      expect(token.startIndex).toBe(0);
      expect(token.endIndex).toBe(9);
      expect(result.rawText.slice(token.startIndex, token.endIndex)).toBe('(sky:1.3)');
    });

    it('tracks correct indices for mixed tokens', () => {
      const result = parsePrompt('a (b:1.5) c');
      // Tokens: 'a ' (normal), '(b:1.5)' (weighted), ' c' (normal)
      const weighted = result.tokens.find((t) => t.syntaxType === 'weighted');
      expect(weighted!.startIndex).toBe(2);
      expect(weighted!.endIndex).toBe(9);
    });

    it('covers the full original text via startIndex/endIndex', () => {
      const result = parsePrompt('hello (world:1.2) goodbye');
      // Reconstruct from indices
      const reconstructed = result.tokens
        .map((t) => result.rawText.slice(t.startIndex, t.endIndex))
        .join('');
      expect(reconstructed).toBe('hello (world:1.2) goodbye');
    });
  });
});