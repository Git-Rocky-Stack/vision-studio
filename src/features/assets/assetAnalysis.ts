import type { AssetRecord } from '@/types/assets';
import type { AssetMetadata, AssetTag } from '@/types/collections';

/**
 * Deterministic asset analysis.
 *
 * Vision Studio is local-first: there is no cloud vision API and no bundled
 * captioning model, so tags are *derived from data the app already holds with
 * certainty* - the prompt the user actually wrote. Nothing here is guessed or
 * fabricated; a tag is emitted only when its term appears verbatim as a whole
 * word in the positive prompt.
 *
 * `confidence` is a real, documented signal rather than a made-up score: it is
 * the term's positional weight in the prompt. Diffusion samplers weight earlier
 * tokens more heavily, so a term leading the prompt describes the image more
 * strongly than one trailing it. The score is the normalised distance from the
 * end of the prompt, floored so an exact match is never reported as worthless.
 *
 * The negative prompt is deliberately excluded: those terms describe what the
 * user asked the model to *avoid*, so tagging with them would be actively wrong.
 */

/** Smallest confidence a verbatim whole-word match can be reported at. */
const MIN_CONFIDENCE = 0.35;

/**
 * Curated term lexicon, keyed by the four categories `AssetTag['category']`
 * exposes to smart queries (`custom` is reserved for user-authored tags).
 * Terms are lowercase and matched whole-word only.
 */
export const TAG_LEXICON: Record<'style' | 'subject' | 'color' | 'mood', readonly string[]> = {
  style: [
    'anime', 'baroque', 'bokeh', 'brutalist', 'cel shaded', 'charcoal', 'cinematic',
    'comic', 'concept art', 'cyberpunk', 'digital art', 'engraving', 'expressionist',
    'film noir', 'flat design', 'glitch', 'gothic', 'hyperrealistic', 'illustration',
    'impressionist', 'ink', 'isometric', 'line art', 'linocut', 'long exposure',
    'low poly', 'macro', 'minimalist', 'oil painting', 'origami', 'photorealistic',
    'pixel art', 'pop art', 'psychedelic', 'realistic', 'retro', 'sketch',
    'steampunk', 'stained glass', 'surreal', 'synthwave', 'tilt shift', 'ukiyo-e',
    'vaporwave', 'vector art', 'vintage', 'watercolor', 'woodcut',
  ],
  subject: [
    'abstract', 'animal', 'architecture', 'astronaut', 'bird', 'building', 'candid',
    'car', 'castle', 'cat', 'character', 'city', 'cityscape', 'creature', 'crowd',
    'desert', 'dog', 'dragon', 'flower', 'food', 'forest', 'fruit', 'galaxy',
    'garden', 'headshot', 'horse', 'interior', 'island', 'jungle', 'knight',
    'landscape', 'logo', 'mountain', 'nebula', 'ocean', 'pattern', 'planet',
    'portrait', 'product', 'river', 'robot', 'ruins', 'seascape', 'ship', 'skyline',
    'space', 'spaceship', 'still life', 'street', 'sunset', 'temple', 'texture',
    'tree', 'vehicle', 'village', 'waterfall', 'wildlife', 'woman', 'man',
  ],
  color: [
    'amber', 'aqua', 'azure', 'beige', 'black', 'blue', 'bronze', 'brown',
    'burgundy', 'charcoal grey', 'copper', 'coral', 'crimson', 'cyan', 'emerald',
    'gold', 'golden', 'green', 'grey', 'indigo', 'ivory', 'jade', 'lavender',
    'lilac', 'lime', 'magenta', 'maroon', 'mint', 'navy', 'ochre', 'olive',
    'orange', 'pastel', 'peach', 'pink', 'purple', 'red', 'rose', 'ruby',
    'salmon', 'sapphire', 'scarlet', 'sepia', 'silver', 'slate', 'teal',
    'turquoise', 'violet', 'white', 'yellow',
  ],
  mood: [
    'bleak', 'bright', 'calm', 'chaotic', 'cheerful', 'cosy', 'dark', 'dramatic',
    'dreamy', 'eerie', 'energetic', 'ethereal', 'foreboding', 'gloomy', 'grim',
    'haunting', 'hopeful', 'intimate', 'joyful', 'lonely', 'melancholic', 'moody',
    'mysterious', 'nostalgic', 'ominous', 'peaceful', 'playful', 'romantic',
    'serene', 'sombre', 'tranquil', 'triumphant', 'uplifting', 'vibrant', 'warm',
    'whimsical',
  ],
};

/**
 * Real sRGB values for the colour terms above. A colour tag resolves to the hex
 * the word actually names, so `dominantColors` reports the palette the user
 * asked for rather than an invented swatch. Terms absent from this map (none by
 * construction - the lexicon and this map are asserted in sync by the tests)
 * simply contribute no hex.
 */
const COLOR_HEX: Record<string, string> = {
  amber: '#ffbf00', aqua: '#00ffff', azure: '#007fff', beige: '#f5f5dc',
  black: '#000000', blue: '#0000ff', bronze: '#cd7f32', brown: '#8b4513',
  burgundy: '#800020', 'charcoal grey': '#36454f', copper: '#b87333',
  coral: '#ff7f50', crimson: '#dc143c', cyan: '#00ffff', emerald: '#50c878',
  gold: '#ffd700', golden: '#ffd700', green: '#008000', grey: '#808080',
  indigo: '#4b0082', ivory: '#fffff0', jade: '#00a86b', lavender: '#e6e6fa',
  lilac: '#c8a2c8', lime: '#00ff00', magenta: '#ff00ff', maroon: '#800000',
  mint: '#3eb489', navy: '#000080', ochre: '#cc7722', olive: '#808000',
  orange: '#ffa500', pastel: '#fddde6', peach: '#ffe5b4', pink: '#ffc0cb',
  purple: '#800080', red: '#ff0000', rose: '#ff007f', ruby: '#e0115f',
  salmon: '#fa8072', sapphire: '#0f52ba', scarlet: '#ff2400', sepia: '#704214',
  silver: '#c0c0c0', slate: '#708090', teal: '#008080', turquoise: '#40e0d0',
  violet: '#7f00ff', white: '#ffffff', yellow: '#ffff00',
};

/** Categories in a fixed order so tag output is stable across runs. */
const CATEGORIES = ['style', 'subject', 'color', 'mood'] as const;

/**
 * Normalise a raw prompt for whole-word matching: lowercase, strip the weight
 * and LoRA syntax diffusion prompts carry (`(term:1.4)`, `[term]`, `<lora:x:1>`),
 * and collapse every remaining separator to a single space. Hyphens survive so
 * hyphenated lexicon terms such as `ukiyo-e` still match.
 */
function normalizePrompt(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/<[^>]*>/g, ' ')
    .replace(/:\s*-?\d+(\.\d+)?/g, ' ')
    .replace(/[^a-z0-9\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Whole-word index of `term` in an already-normalised prompt, or -1. */
function wholeWordIndex(haystack: string, term: string): number {
  const padded = ` ${haystack} `;
  const at = padded.indexOf(` ${term} `);
  return at === -1 ? -1 : at;
}

/**
 * Character used to consume a matched span. It can never appear in a normalised
 * prompt (which is `[a-z0-9- ]` only) and never forms a word boundary, so a
 * consumed span is unmatchable by any later term.
 */
const CONSUMED = '~';

/**
 * Blank out `[at, at + length)` of the *padded* prompt while preserving overall
 * length, so positional confidence for later terms stays accurate.
 */
function consumeSpan(padded: string, at: number, length: number): string {
  return padded.slice(0, at) + CONSUMED.repeat(length) + padded.slice(at + length);
}

/**
 * Positional weight of a term: 1 at the very start of the prompt, decaying to
 * `MIN_CONFIDENCE` at the end. Mirrors how diffusion samplers weight earlier
 * tokens more strongly.
 */
function positionalConfidence(index: number, length: number): number {
  if (length <= 0) return 1;
  const position = Math.min(index / length, 1);
  const score = 1 - position * (1 - MIN_CONFIDENCE);
  return Math.round(score * 1000) / 1000;
}

/** Stable, collision-resistant id for a derived tag. */
function tagId(category: string, name: string): string {
  return `ai:${category}:${name.replace(/\s+/g, '-')}`;
}

/**
 * Derive an {@link AssetMetadata} record from what the asset actually contains.
 * Pure and synchronous: the same asset always yields the same tags, which is
 * what lets smart collections re-evaluate deterministically.
 */
export function analyzeAssetRecord(asset: AssetRecord): AssetMetadata {
  const prompt = normalizePrompt(asset.prompt ?? '');
  const tags: AssetTag[] = [];

  const detected: Record<(typeof CATEGORIES)[number], string[]> = {
    style: [],
    subject: [],
    color: [],
    mood: [],
  };

  // Longest term first so a multi-word term consumes its own text before any
  // shorter term can claim part of it - "charcoal grey" must tag the colour,
  // not also the "grey" colour and the "charcoal" style.
  const candidates = CATEGORIES.flatMap((category) =>
    TAG_LEXICON[category].map((term) => ({ category, term })),
  ).sort((a, b) => b.term.length - a.term.length || a.term.localeCompare(b.term));

  let remaining = ` ${prompt} `;
  for (const { category, term } of candidates) {
    const at = wholeWordIndex(remaining.slice(1, -1), term);
    if (at === -1) continue;
    remaining = consumeSpan(remaining, at + 1, term.length);
    detected[category].push(term);
    tags.push({
      id: tagId(category, term),
      name: term,
      category,
      source: 'ai',
      confidence: positionalConfidence(at, prompt.length),
    });
  }

  // Restore lexicon order within each category so the detected* arrays read
  // predictably regardless of the longest-first match order.
  for (const category of CATEGORIES) {
    const order = TAG_LEXICON[category];
    detected[category].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }

  // Highest-weighted term first, then alphabetically, so the UI ordering is
  // meaningful and stable rather than lexicon-declaration order.
  tags.sort((a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name));

  const colorNames = detected.color;
  const dominantColors = colorNames.map((name) => COLOR_HEX[name]).filter(Boolean);

  return {
    assetId: asset.id,
    tags,
    dominantColors,
    colorNames,
    detectedStyle: detected.style,
    detectedSubject: detected.subject,
    detectedMood: detected.mood,
    analyzedAt: Date.now(),
  };
}
