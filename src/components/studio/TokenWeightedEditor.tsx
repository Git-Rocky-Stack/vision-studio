import { memo, useMemo } from 'react';
import { parsePrompt } from '@/utils/promptTokenizer';
import { cn } from '@/utils/cn';
import { TokenHighlighter } from './TokenHighlighter';

interface TokenWeightedEditorProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  maxTokens?: number;
}

const DEFAULT_MAX_TOKENS = 75;

/**
 * Rich prompt textarea with token highlighting overlay.
 * Parses the input through parsePrompt() to show syntax-colored highlights
 * and a token count indicator with soft warning when exceeding the limit.
 */
export const TokenWeightedEditor = memo(function TokenWeightedEditor({
  value,
  onChange,
  label,
  placeholder,
  maxTokens = DEFAULT_MAX_TOKENS,
}: TokenWeightedEditorProps) {
  const parsed = useMemo(() => parsePrompt(value), [value]);

  const isOverLimit = parsed.tokenCount > maxTokens;
  const tokenRatio = parsed.tokenCount / maxTokens;

  return (
    <div className="flex flex-col gap-1.5">
      {/* Label + token count */}
      <div className="flex items-center justify-between">
        <label className="mono-label text-text-primary">
          {label}
        </label>
        <span
          className={cn(
            'font-mono text-xs tabular-nums',
            isOverLimit
              ? 'text-status-warning'
              : tokenRatio > 0.8
                ? 'text-text-muted'
                : 'text-text-muted/60',
          )}
        >
          {parsed.tokenCount}/{maxTokens}
        </span>
      </div>

      {/* Editor container */}
      <div className="relative">
        {/* Token highlight overlay */}
        <TokenHighlighter tokens={parsed.tokens} />

        {/* Textarea - transparent text so overlay highlights show through,
            but visible when no tokens are parsed */}
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          aria-label={label}
          className={cn(
            'relative z-10 h-32 w-full resize-y rounded-md border bg-transparent p-2 font-mono text-xs leading-relaxed',
            'placeholder:text-text-muted/40',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/30 focus-visible:border-accent-primary-border',
            'transition-colors duration-normal',
            isOverLimit ? 'border-status-warning/60' : 'border-border hover:border-border-hover',
          )}
        />
      </div>

      {/* Over-limit warning */}
      {isOverLimit && (
        <p className="text-status-warning text-xs">
          Token limit exceeded. Consider shortening or using weights to prioritize key terms.
        </p>
      )}
    </div>
  );
});