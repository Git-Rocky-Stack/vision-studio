import { memo, useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import type { PromptTemplateCategory } from '@/types/promptStudio';
import { cn } from '@/utils/cn';
import { PromptTemplateCard } from './PromptTemplateCard';

/** Filter categories shown as pill buttons. */
const CATEGORIES: Array<{ value: PromptTemplateCategory | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'portrait', label: 'Portrait' },
  { value: 'landscape', label: 'Landscape' },
  { value: 'product', label: 'Product' },
  { value: 'cinematic', label: 'Cinematic' },
  { value: 'artistic', label: 'Artistic' },
  { value: 'abstract', label: 'Abstract' },
  { value: 'custom', label: 'Custom' },
];

/**
 * Template grid with search input and category filter.
 * Reads promptTemplates from the store and provides apply/favorite callbacks.
 * Sort order: favorites first, then built-in, then by createdAt desc.
 */
interface PromptTemplateLibraryProps {
  onApply?: (id: string, mode: 'replace' | 'merge') => void;
}

export const PromptTemplateLibrary = memo(function PromptTemplateLibrary({
  onApply,
}: PromptTemplateLibraryProps) {
  const templates = useAppStore((s) => s.promptTemplates);
  const applyPromptTemplate = useAppStore((s) => s.applyPromptTemplate);
  const togglePromptTemplateFavorite = useAppStore(
    (s) => s.togglePromptTemplateFavorite,
  );

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<
    PromptTemplateCategory | 'all'
  >('all');

  const filteredTemplates = useMemo(() => {
    // Filter by category
    const categoryFiltered =
      activeCategory === 'all'
        ? templates
        : templates.filter((t) => t.category === activeCategory);

    // Filter by search text
    const lowerSearch = search.toLowerCase().trim();
    const searchFiltered = lowerSearch
      ? categoryFiltered.filter(
          (t) =>
            t.name.toLowerCase().includes(lowerSearch) ||
            t.description.toLowerCase().includes(lowerSearch) ||
            t.promptText.toLowerCase().includes(lowerSearch),
        )
      : categoryFiltered;

    // Sort: favorites first, then built-in, then newest
    return [...searchFiltered].sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      if (a.isBuiltIn !== b.isBuiltIn) return a.isBuiltIn ? -1 : 1;
      return b.createdAt - a.createdAt;
    });
  }, [templates, activeCategory, search]);

  return (
    <div className="flex flex-col gap-3">
      {/* Search input */}
      <div className="relative">
        <Search
          size={14}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted/50"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates..."
          aria-label="Search templates"
          className="w-full rounded-lg border border-border bg-void py-1.5 pl-8 pr-3 text-xs text-text-primary placeholder:text-text-muted/40 transition-colors duration-normal hover:border-border-hover focus:border-accent-primary-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/30"
        />
      </div>

      {/* Category filter pills */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            type="button"
            onClick={() => setActiveCategory(cat.value)}
            aria-pressed={activeCategory === cat.value}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider transition-colors duration-normal',
              activeCategory === cat.value
                ? 'border-accent-primary-border bg-accent-primary/15 text-accent-primary'
                : 'border-border text-text-muted hover:border-border-hover hover:text-text-primary',
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Template grid */}
      {filteredTemplates.length > 0 ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {filteredTemplates.map((template) => (
            <PromptTemplateCard
              key={template.id}
              template={template}
              onApply={(id) => onApply ? onApply(id, 'replace') : applyPromptTemplate(id, 'replace')}
              onToggleFavorite={togglePromptTemplateFavorite}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-text-muted">
          <p className="text-sm">No templates found</p>
          <p className="text-xs text-text-muted/60">
            Try a different search or category
          </p>
        </div>
      )}
    </div>
  );
});