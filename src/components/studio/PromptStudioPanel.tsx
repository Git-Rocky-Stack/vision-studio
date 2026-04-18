import { memo, useState, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/utils/cn';
import { TokenWeightedEditor } from './TokenWeightedEditor';
import { PromptEnhancementToolkit } from './PromptEnhancementToolkit';
import { PromptTemplateLibrary } from './PromptTemplateLibrary';

// ---------------------------------------------------------------------------
// CollapsibleSection - local helper with chevron toggle
// ---------------------------------------------------------------------------

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center gap-1.5 py-1 text-xs font-medium uppercase tracking-wider text-text-muted transition-colors duration-normal hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/30"
        aria-expanded={isOpen}
      >
        <ChevronDown
          size={14}
          className={cn(
            'shrink-0 transition-transform duration-normal',
            isOpen ? 'rotate-0' : '-rotate-90',
          )}
        />
        {title}
      </button>
      {isOpen && <div className="mt-2">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PromptStudioPanel - full implementation
// ---------------------------------------------------------------------------

/**
 * Main Prompt Studio panel with three collapsible sections:
 * 1. Prompt Editor (positive + negative prompts with token highlighting)
 * 2. Enhancement Toolkit (AI enhance, style transfer, expand, negative suggest)
 * 3. Template Library (searchable/filterable template grid)
 *
 * Prompt state is managed locally with useState; will be wired to
 * generation draft in a future task.
 */
export const PromptStudioPanel = memo(function PromptStudioPanel() {
  const [positivePrompt, setPositivePrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isExpanding, setIsExpanding] = useState(false);

  // --- Enhancement handlers (placeholder - TODO: wire in Task 10) ----------

  const handleEnhance = useCallback(() => {
    // TODO: Wire to AI enhancement service
    setIsEnhancing(true);
    setTimeout(() => setIsEnhancing(false), 2000);
  }, []);

  const handleExpand = useCallback(() => {
    // TODO: Wire to prompt expansion service
    setIsExpanding(true);
    setTimeout(() => setIsExpanding(false), 2000);
  }, []);

  const handleNegativeSuggest = useCallback(() => {
    // TODO: Wire to negative prompt suggestion service
  }, []);

  const handleStyleTransfer = useCallback(
    (_modifier: string) => {
      // TODO: Wire to style transfer service
    },
    [],
  );

  // --------------------------------------------------------------------------

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-3">
      {/* Section 1: Prompt Editor */}
      <CollapsibleSection title="Prompt Editor" defaultOpen>
        <div className="flex flex-col gap-4">
          <TokenWeightedEditor
            value={positivePrompt}
            onChange={setPositivePrompt}
            label="Positive Prompt"
            placeholder="Describe what you want to generate..."
          />
          <TokenWeightedEditor
            value={negativePrompt}
            onChange={setNegativePrompt}
            label="Negative Prompt"
            placeholder="What to avoid in the generation..."
          />
        </div>
      </CollapsibleSection>

      {/* Section 2: Enhancement Toolkit */}
      <CollapsibleSection title="Enhancement" defaultOpen={false}>
        <PromptEnhancementToolkit
          onEnhance={handleEnhance}
          onExpand={handleExpand}
          onNegativeSuggest={handleNegativeSuggest}
          onStyleTransfer={handleStyleTransfer}
          isEnhancing={isEnhancing}
          isExpanding={isExpanding}
        />
      </CollapsibleSection>

      {/* Section 3: Template Library */}
      <CollapsibleSection title="Templates" defaultOpen={false}>
        <PromptTemplateLibrary />
      </CollapsibleSection>
    </div>
  );
});