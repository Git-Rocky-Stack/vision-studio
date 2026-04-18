import { useState } from 'react';
import { cn } from '@/utils/cn';
import { Textarea } from '@/components/ui/Textarea';
import { PromptToolbar } from './PromptToolbar';
import { Sparkles, ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

interface PromptAreaProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  negativePrompt: string;
  onNegativePromptChange: (value: string) => void;
  generationType: 'image' | 'video';
  isFavorited: boolean;
  onRandomize: () => void;
  onEnhance: () => void;
  onShowHistory: () => void;
  onToggleFavorite: () => void;
}

export function PromptArea({
  prompt,
  onPromptChange,
  negativePrompt,
  onNegativePromptChange,
  generationType,
  isFavorited,
  onRandomize,
  onEnhance,
  onShowHistory,
  onToggleFavorite,
}: PromptAreaProps) {
  const [showNegative, setShowNegative] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div className="space-y-3">
      {/* Label */}
      <div className="flex items-center justify-between">
        <label htmlFor="prompt-input" className="text-label text-text-body">
          Prompt
        </label>
        <span className="font-mono text-xs text-text-muted" aria-live="polite">{prompt.length}</span>
      </div>

      {/* Prompt textarea with focus glow wrapper */}
      <div
        className={cn(
          'rounded-md transition-shadow duration-200',
          isFocused && 'shadow-accent-subtle'
        )}
      >
        <Textarea
          id="prompt-input"
          data-testid="prompt-input"
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={
            generationType === 'image'
              ? 'Describe the image you want to create...'
              : 'Describe the video you want to create...'
          }
          rows={6}
          className="resize-none"
        />
      </div>

      {/* Toolbar */}
      <PromptToolbar
        prompt={prompt}
        isFavorited={isFavorited}
        onRandomize={onRandomize}
        onEnhance={onEnhance}
        onShowHistory={onShowHistory}
        onToggleFavorite={onToggleFavorite}
      />

      {/* Negative prompt toggle */}
      <button
        onClick={() => setShowNegative(!showNegative)}
        aria-expanded={showNegative}
        className="flex items-center gap-2 text-xs text-text-muted hover:text-text-body transition-colors"
      >
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 transition-transform duration-200',
            showNegative && 'rotate-180'
          )}
        />
        Negative prompt
      </button>

      <AnimatePresence>
        {showNegative && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <Textarea
              id="negative-prompt-input"
              data-testid="negative-prompt-input"
              value={negativePrompt}
              onChange={(e) => onNegativePromptChange(e.target.value)}
              placeholder="Things to avoid in the generation..."
              rows={3}
              className="resize-none"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
