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
              // Weighted > 1.5: heavy weighting is a caution, not an error
              token.syntaxType === 'weighted' &&
                token.weight > 1.5 &&
                'bg-status-warning-muted text-status-warning',
              // Weighted 1.0-1.5: subtle accent highlight
              token.syntaxType === 'weighted' &&
                token.weight <= 1.5 &&
                'bg-accent-primary-muted text-accent-primary-hover',
              // Emphasis: additive weighting
              token.syntaxType === 'emphasis' &&
                'bg-status-success-muted text-status-success',
              // De-emphasis: informational, reduces the token's pull
              token.syntaxType === 'deemphasis' &&
                'bg-status-info-muted text-status-info',
            )}
          >
            {token.text}
          </span>
        );
      })}
    </div>
  );
});