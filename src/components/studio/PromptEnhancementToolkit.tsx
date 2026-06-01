import { memo } from 'react';
import { Wand2, Sparkles, ArrowDownToLine, Shuffle } from 'lucide-react';
import { cn } from '@/utils/cn';

interface PromptEnhancementToolkitProps {
  onEnhance: () => void;
  onExpand: () => void;
  onNegativeSuggest: () => void;
  onStyleTransfer: () => void;
  isEnhancing?: boolean;
  isExpanding?: boolean;
  isNegativeSuggesting?: boolean;
  isStyleTransferActive?: boolean;
}

interface ToolButtonConfig {
  id: string;
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  isLoading: boolean;
  description: string;
  isActive?: boolean;
}

/**
 * Grid of 4 enhancement tool buttons:
 * AI Enhance, Style Transfer, Expand, Negative Suggest.
 * Each button shows icon + label, uses design tokens, and supports loading state.
 */
export const PromptEnhancementToolkit = memo(
  function PromptEnhancementToolkit({
    onEnhance,
    onExpand,
    onNegativeSuggest,
    onStyleTransfer,
    isEnhancing = false,
    isExpanding = false,
    isNegativeSuggesting = false,
    isStyleTransferActive = false,
  }: PromptEnhancementToolkitProps) {
    const tools: ToolButtonConfig[] = [
      {
        id: 'enhance',
        label: 'AI Enhance',
        icon: Wand2,
        onClick: onEnhance,
        isLoading: isEnhancing,
        description: 'Automatically improve prompt quality with AI',
      },
      {
        id: 'style-transfer',
        label: 'Style Transfer',
        icon: Sparkles,
        onClick: onStyleTransfer,
        isLoading: false,
        description: 'Apply artistic style modifiers to prompt',
        isActive: isStyleTransferActive,
      },
      {
        id: 'expand',
        label: 'Expand',
        icon: ArrowDownToLine,
        onClick: onExpand,
        isLoading: isExpanding,
        description: 'Expand prompt with additional detail keywords',
      },
      {
        id: 'negative-suggest',
        label: 'Negative Suggest',
        icon: Shuffle,
        onClick: onNegativeSuggest,
        isLoading: isNegativeSuggesting,
        description: 'Generate smart negative prompt suggestions',
      },
    ];

    return (
      <div className="grid grid-cols-2 gap-2">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.id}
              type="button"
              onClick={tool.onClick}
              disabled={tool.isLoading}
              title={tool.description}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-md border p-3 transition-all duration-normal',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/30',
                tool.isLoading
                  ? 'cursor-wait border-border bg-elevated/50 text-text-muted/50'
                  : tool.isActive
                    ? 'border-accent-primary-border bg-accent-primary-muted/50 text-accent-primary'
                  : 'border-border bg-surface text-text-muted hover:border-border-hover hover:bg-elevated hover:text-text-primary active:bg-void',
              )}
            >
              <Icon
                size={18}
                className={cn(
                  tool.isLoading && 'animate-pulse',
                )}
              />
              <span className="mono-label">
                {tool.isLoading ? 'Working...' : tool.label}
              </span>
            </button>
          );
        })}
      </div>
    );
  },
);
