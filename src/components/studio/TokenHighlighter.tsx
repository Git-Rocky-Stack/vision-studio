import { memo } from 'react';
import type { PromptToken } from '@/types/promptStudio';
import { cn } from '@/utils/cn';

interface TokenHighlighterProps {
  tokens: PromptToken[];
}

/**
 * Renders colored highlight spans over parsed prompt tokens.
 * Positioned as an absolute overlay matching the textarea text layout.
 *
 * Color mapping:
 * - Normal (weight ~1.0): transparent, no highlight
 * - Weighted >1.5: red-orange bg (status-warning tones)
 * - Weighted 1.0-1.5: accent-primary-muted bg
 * - Emphasis: status-success-muted bg
 * - Deemphasis: blue bg
 */
export const TokenHighlighter = memo(function TokenHighlighter({
  tokens,
}: TokenHighlighterProps) {
  if (tokens.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words p-2 font-mono text-xs leading-relaxed" aria-hidden="true">
      {tokens.map((token, index) => {
        const isNormal = token.syntaxType === 'normal' && Math.abs(token.weight - 1.0) < 0.05;

        return (
          <span
            key={`token-${index}-${token.startIndex}`}
            className={cn(
              'rounded-sm px-0.5',
              // Normal tokens: invisible, just occupy space
              isNormal && 'text-transparent',
              // Weighted > 1.5: strong red-orange highlight
              token.syntaxType === 'weighted' &&
                token.weight > 1.5 &&
                'bg-red-500/20 text-red-300',
              // Weighted 1.0-1.5: subtle accent highlight
              token.syntaxType === 'weighted' &&
                token.weight <= 1.5 &&
                'bg-accent-primary-muted text-accent-primary-hover',
              // Emphasis: green/success highlight
              token.syntaxType === 'emphasis' &&
                'bg-emerald-500/15 text-emerald-300',
              // Deemphasis: blue highlight
              token.syntaxType === 'deemphasis' &&
                'bg-blue-500/15 text-blue-300',
            )}
          >
            {token.text}
          </span>
        );
      })}
    </div>
  );
});