import { memo, useCallback, useId, useRef, useState, useMemo, type FormEvent } from 'react';
import { BookmarkPlus, Search } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAppStore } from '@/store/appStore';
import { useFocusWhen } from '@/hooks/useFocusWhen';
import type { PromptTemplate, PromptTemplateCategory } from '@/types/promptStudio';
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
  /** The draft prompt "Save as template" captures. Omit to hide the save form. */
  currentPrompt?: string;
  /** The draft negative prompt saved alongside the prompt. */
  currentNegativePrompt?: string;
  /** Reports a save or delete so the host can confirm it to the user. */
  onTemplatesChanged?: (message: string) => void;
}

/** Categories a saved template can be filed under (every filter except "All"). */
const SAVE_CATEGORIES = CATEGORIES.filter(
  (cat): cat is { value: PromptTemplateCategory; label: string } => cat.value !== 'all',
);

const TEMPLATE_NAME_MAX = 60;
const DESCRIPTION_MAX = 140;

/** One-line description derived from the saved prompt (the card clamps it to two lines). */
export function describeSavedPrompt(prompt: string): string {
  const flat = prompt.replace(/\s+/g, ' ').trim();
  return flat.length > DESCRIPTION_MAX ? `${flat.slice(0, DESCRIPTION_MAX - 3).trimEnd()}...` : flat;
}

/** Builds a user template from the current draft. */
export function createUserPromptTemplate(input: {
  name: string;
  category: PromptTemplateCategory;
  prompt: string;
  negativePrompt?: string;
  now?: number;
}): PromptTemplate {
  const now = input.now ?? Date.now();
  const negativePrompt = input.negativePrompt?.trim();
  return {
    id: `user-template-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: input.name.trim(),
    description: describeSavedPrompt(input.prompt),
    category: input.category,
    promptText: input.prompt.trim(),
    ...(negativePrompt ? { negativePrompt } : {}),
    isBuiltIn: false,
    isFavorite: false,
    createdAt: now,
  };
}

export const PromptTemplateLibrary = memo(function PromptTemplateLibrary({
  onApply,
  currentPrompt,
  currentNegativePrompt,
  onTemplatesChanged,
}: PromptTemplateLibraryProps) {
  const {
    templates,
    applyPromptTemplate,
    togglePromptTemplateFavorite,
    addUserPromptTemplate,
    deleteUserPromptTemplate,
  } = useAppStore(
    useShallow((s) => ({
      templates: s.promptTemplates,
      applyPromptTemplate: s.applyPromptTemplate,
      togglePromptTemplateFavorite: s.togglePromptTemplateFavorite,
      addUserPromptTemplate: s.addUserPromptTemplate,
      deleteUserPromptTemplate: s.deleteUserPromptTemplate,
    })),
  );

  const formId = useId();
  const [isSaving, setIsSaving] = useState(false);
  const templateNameRef = useRef<HTMLInputElement>(null);
  // Opening the save form replaces its trigger: focus follows into the name.
  useFocusWhen(templateNameRef, isSaving);
  const [templateName, setTemplateName] = useState('');
  const [templateCategory, setTemplateCategory] = useState<PromptTemplateCategory>('custom');
  const [nameError, setNameError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PromptTemplate | null>(null);

  const canSave = currentPrompt !== undefined;
  const hasPrompt = Boolean(currentPrompt?.trim());

  const closeSaveForm = useCallback(() => {
    setIsSaving(false);
    setTemplateName('');
    setTemplateCategory('custom');
    setNameError(null);
  }, []);

  const handleSave = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const name = templateName.trim();
      if (!name) {
        setNameError('Name the template so you can find it later.');
        return;
      }
      if (!currentPrompt?.trim()) return;
      const duplicate = templates.some(
        (t) => !t.isBuiltIn && t.name.toLowerCase() === name.toLowerCase(),
      );
      if (duplicate) {
        setNameError(`A saved template is already named "${name}".`);
        return;
      }
      addUserPromptTemplate(
        createUserPromptTemplate({
          name,
          category: templateCategory,
          prompt: currentPrompt,
          negativePrompt: currentNegativePrompt,
        }),
      );
      onTemplatesChanged?.(`Saved "${name}" to your templates.`);
      closeSaveForm();
    },
    [
      addUserPromptTemplate,
      closeSaveForm,
      currentNegativePrompt,
      currentPrompt,
      onTemplatesChanged,
      templateCategory,
      templateName,
      templates,
    ],
  );

  const requestDelete = useCallback(
    (id: string) => setPendingDelete(templates.find((t) => t.id === id && !t.isBuiltIn) ?? null),
    [templates],
  );
  const cancelDelete = useCallback(() => setPendingDelete(null), []);
  const confirmDelete = useCallback(() => {
    if (!pendingDelete) return;
    deleteUserPromptTemplate(pendingDelete.id);
    onTemplatesChanged?.(`Deleted "${pendingDelete.name}".`);
    setPendingDelete(null);
  }, [deleteUserPromptTemplate, onTemplatesChanged, pendingDelete]);

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
      {canSave ? (
        isSaving ? (
          <form
            onSubmit={handleSave}
            aria-label="Save prompt as template"
            className="recessed-well flex flex-col gap-2 px-3 py-3"
          >
            <div className="flex flex-col gap-1">
              <label htmlFor={`${formId}-name`} className="mono-label text-text-muted">
                Template name
              </label>
              <input
                ref={templateNameRef}
                id={`${formId}-name`}
                type="text"
                value={templateName}
                maxLength={TEMPLATE_NAME_MAX}
                onChange={(e) => {
                  setTemplateName(e.target.value);
                  if (nameError) setNameError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    closeSaveForm();
                  }
                }}
                aria-invalid={nameError !== null}
                aria-describedby={nameError ? `${formId}-error` : undefined}
                placeholder="e.g. Moody product hero"
                className={cn(
                  'w-full rounded-md border bg-void px-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted transition-colors duration-normal focus:border-accent-primary-border',
                  nameError ? 'border-status-error-border' : 'border-border hover:border-border-hover',
                )}
              />
              {nameError ? (
                <p id={`${formId}-error`} role="alert" className="type-caption text-status-error">
                  {nameError}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${formId}-category`} className="mono-label text-text-muted">
                Category
              </label>
              <select
                id={`${formId}-category`}
                value={templateCategory}
                onChange={(e) => setTemplateCategory(e.target.value as PromptTemplateCategory)}
                className="w-full rounded-md border border-border bg-void px-2 py-1.5 text-xs text-text-primary focus:border-accent-primary-border"
              >
                {SAVE_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" size="xs" onClick={closeSaveForm}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="xs" disabled={!hasPrompt}>
                Save template
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-1">
            <Button
              type="button"
              variant="secondary"
              size="xs"
              icon={BookmarkPlus}
              onClick={() => setIsSaving(true)}
              disabled={!hasPrompt}
              aria-describedby={hasPrompt ? undefined : `${formId}-save-hint`}
            >
              Save prompt as template
            </Button>
            {hasPrompt ? null : (
              <p id={`${formId}-save-hint`} className="type-caption text-text-muted">
                Write a prompt in the editor to save it as a template.
              </p>
            )}
          </div>
        )
      ) : null}

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
          className="w-full rounded-md border border-border bg-void py-1.5 pl-8 pr-3 text-xs text-text-primary placeholder:text-text-muted/40 transition-colors duration-normal hover:border-border-hover focus:border-accent-primary-border"
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
              'rounded-full border px-2.5 py-0.5 mono-label transition-colors duration-normal',
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
              onDelete={requestDelete}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Search}
          title="No templates found"
          description="Try a different search or category"
          className="h-auto"
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete ? `Delete "${pendingDelete.name}"?` : 'Delete template?'}
        message="This removes the saved template. Prompts already in your drafts and generations are not affected."
        confirmLabel="Delete template"
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </div>
  );
});