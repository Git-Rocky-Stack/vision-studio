import { useId, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Sparkles, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';

import { Button } from '@/components/ui/Button';
import { DialogCloseButton } from '@/components/ui/DialogCloseButton';
import { Input } from '@/components/ui/Input';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import { useAppStore } from '@/store/appStore';
import type { AssetTag, SmartQuery } from '@/types/collections';
import { cn } from '@/utils/cn';
import { collectSmartQueryMatches, hasSmartQueryCriteria } from '@/utils/smartQueryEvaluator';

/** Longest custom tag accepted; tags are chips, not sentences. */
export const MAX_CUSTOM_TAG_LENGTH = 40;

/** Category order and headings for the tag picker. */
const TAG_GROUPS: { category: AssetTag['category']; label: string }[] = [
  { category: 'custom', label: 'Custom' },
  { category: 'style', label: 'Style' },
  { category: 'subject', label: 'Subject' },
  { category: 'mood', label: 'Mood' },
  { category: 'color', label: 'Color' },
];

/** Stable id for a user-authored tag, derived from its name. */
export function customTagId(name: string): string {
  return `user:${name.trim().toLowerCase().replace(/\s+/g, '-')}`;
}

/** "Smart Collection", then "Smart Collection 2", ... */
export function nextSmartCollectionName(existing: readonly string[]): string {
  const base = 'Smart Collection';
  if (!existing.includes(base)) return base;
  let n = 2;
  while (existing.includes(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

/** Local-midnight epoch ms for a `YYYY-MM-DD` date-input value. */
function startOfDay(value: string): number {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

/** Last epoch ms of the local day for a `YYYY-MM-DD` date-input value. */
function endOfDay(value: string): number {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

interface SmartCollectionDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Builds a smart collection from explicit rules - prompt text, model, tags and
 * a creation-date window - with a live count of the library assets the rules
 * match, so the collection is never created blind. All rules combine with AND;
 * the tag rule matches any one of the chosen tags.
 *
 * Custom tags are authored here too (addUserTag / removeUserTag). Analysis only
 * ever emits its own lexicon, so a custom tag matches assets whose prompt
 * contains it as a whole word - the same rule analysis itself applies.
 */
export function SmartCollectionDialog({ open, onClose }: SmartCollectionDialogProps) {
  return (
    <AnimatePresence>{open ? <SmartCollectionForm onClose={onClose} /> : null}</AnimatePresence>
  );
}

function SmartCollectionForm({ onClose }: { onClose: () => void }) {
  const {
    assetLibrary,
    assetMetadata,
    availableTags,
    collections,
    createSmartCollection,
    refreshSmartCollection,
    setActiveCollection,
    addUserTag,
    removeUserTag,
  } = useAppStore(
    useShallow((s) => ({
      assetLibrary: s.assetLibrary,
      assetMetadata: s.assetMetadata,
      availableTags: s.availableTags,
      collections: s.collections,
      createSmartCollection: s.createSmartCollection,
      refreshSmartCollection: s.refreshSmartCollection,
      setActiveCollection: s.setActiveCollection,
      addUserTag: s.addUserTag,
      removeUserTag: s.removeUserTag,
    })),
  );

  const dialogRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  useDialogFocus(dialogRef, { open: true, onEscape: onClose, initialFocusRef: nameRef });

  const titleId = useId();
  const descriptionId = useId();
  const modelId = useId();
  const tagsLabelId = useId();
  const fromId = useId();
  const toId = useId();
  const dateErrorId = useId();
  const countId = useId();
  const tagInputId = useId();
  const tagHintId = useId();

  const [name, setName] = useState(() => nextSmartCollectionName(collections.map((c) => c.name)));
  const [nameError, setNameError] = useState<string | null>(null);
  const [promptText, setPromptText] = useState('');
  const [model, setModel] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const [tagError, setTagError] = useState<string | null>(null);

  const models = useMemo(
    () =>
      [...new Set(assetLibrary.map((asset) => asset.model).filter((m): m is string => Boolean(m)))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [assetLibrary],
  );

  // One chip per tag name: the registry can hold an analysis tag and a user
  // tag of the same name, and a query matches by name either way.
  const tagGroups = useMemo(() => {
    const byName = new Map<string, AssetTag>();
    for (const tag of availableTags) {
      const key = tag.name.toLowerCase();
      const existing = byName.get(key);
      // A user tag wins the slot so it stays removable.
      if (!existing || (tag.source === 'user' && existing.source !== 'user')) byName.set(key, tag);
    }
    return TAG_GROUPS.map((group) => ({
      ...group,
      tags: [...byName.values()]
        .filter((tag) => tag.category === group.category)
        .sort((a, b) => a.name.localeCompare(b.name)),
    })).filter((group) => group.tags.length > 0);
  }, [availableTags]);

  const dateError = from && to && startOfDay(from) > endOfDay(to) ? 'The start date is after the end date.' : null;

  const query = useMemo<SmartQuery>(() => {
    const next: SmartQuery = {};
    if (promptText.trim()) next.promptText = promptText.trim();
    if (model) next.model = model;
    if (selectedTags.length > 0) next.tags = selectedTags;
    if (from || to) {
      next.dateRange = {
        from: from ? startOfDay(from) : 0,
        to: to ? endOfDay(to) : Number.MAX_SAFE_INTEGER,
      };
    }
    return next;
  }, [promptText, model, selectedTags, from, to]);

  const hasRules = hasSmartQueryCriteria(query);
  const matchCount = useMemo(
    () => (hasRules ? collectSmartQueryMatches(query, assetLibrary, assetMetadata).length : 0),
    [hasRules, query, assetLibrary, assetMetadata],
  );

  const toggleTag = (tagName: string) => {
    const key = tagName.toLowerCase();
    setSelectedTags((current) =>
      current.includes(key) ? current.filter((t) => t !== key) : [...current, key],
    );
  };

  const addCustomTag = () => {
    const tagName = tagDraft.trim().replace(/\s+/g, ' ');
    if (!tagName) {
      setTagError('Type a tag name first.');
      return;
    }
    if (tagName.length > MAX_CUSTOM_TAG_LENGTH) {
      setTagError(`Keep tags to ${MAX_CUSTOM_TAG_LENGTH} characters or fewer.`);
      return;
    }
    const key = tagName.toLowerCase();
    // An existing tag of that name is simply selected, never duplicated.
    if (!availableTags.some((tag) => tag.name.toLowerCase() === key)) {
      addUserTag({ id: customTagId(tagName), name: key, category: 'custom', source: 'user', confidence: 1 });
    }
    setSelectedTags((current) => (current.includes(key) ? current : [...current, key]));
    setTagDraft('');
    setTagError(null);
  };

  const deleteCustomTag = (tag: AssetTag) => {
    removeUserTag(tag.id);
    const key = tag.name.toLowerCase();
    setSelectedTags((current) => current.filter((t) => t !== key));
  };

  const canCreate = hasRules && !dateError;

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('Name the collection.');
      nameRef.current?.focus();
      return;
    }
    if (!canCreate) return;

    const before = new Set(useAppStore.getState().collections.map((c) => c.id));
    createSmartCollection({ name: trimmed, smartQuery: query, isAutoGenerated: false });
    const created = useAppStore.getState().collections.find((c) => !before.has(c.id));
    if (created) {
      // createSmartCollection stores the rule; this fills it from the library.
      refreshSmartCollection(created.id);
      setActiveCollection(created.id);
    }
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-void/80 backdrop-blur-sm" aria-hidden="true" />
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        onClick={(event) => event.stopPropagation()}
        className="raised-panel dialog-shell relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden"
      >
        <form
          className="flex min-h-0 flex-1 flex-col"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            handleCreate();
          }}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
            <div>
              <p className="mono-label inline-flex items-center gap-2 text-text-muted">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Smart collection
              </p>
              <h2 id={titleId} className="mt-2 type-title text-text-primary">
                New smart collection
              </h2>
              <p id={descriptionId} className="mt-1 max-w-[65ch] text-sm leading-relaxed text-text-body">
                Assets that meet every rule are collected automatically and kept current as your
                library changes.
              </p>
            </div>
            <DialogCloseButton label="Close smart collection editor" onClick={onClose} />
          </div>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
            <Input
              ref={nameRef}
              label="Name"
              value={name}
              maxLength={80}
              error={nameError ?? undefined}
              onChange={(event) => {
                setName(event.target.value);
                if (nameError) setNameError(null);
              }}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Prompt contains"
                placeholder="e.g. golden hour"
                value={promptText}
                onChange={(event) => setPromptText(event.target.value)}
              />
              <div className="space-y-1.5">
                <label htmlFor={modelId} className="text-label text-text-body">
                  Model
                </label>
                <select
                  id={modelId}
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  disabled={models.length === 0}
                  className="recessed-well w-full px-3 py-2 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">{models.length === 0 ? 'No models in the library yet' : 'Any model'}</option>
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-label text-text-body">Created between</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor={fromId} className="mono-label text-text-muted">
                    From
                  </label>
                  <input
                    id={fromId}
                    type="date"
                    value={from}
                    max={to || undefined}
                    onChange={(event) => setFrom(event.target.value)}
                    aria-invalid={dateError ? true : undefined}
                    aria-describedby={dateError ? dateErrorId : undefined}
                    className="recessed-well w-full px-3 py-2 data-mono text-text-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor={toId} className="mono-label text-text-muted">
                    To
                  </label>
                  <input
                    id={toId}
                    type="date"
                    value={to}
                    min={from || undefined}
                    onChange={(event) => setTo(event.target.value)}
                    aria-invalid={dateError ? true : undefined}
                    aria-describedby={dateError ? dateErrorId : undefined}
                    className="recessed-well w-full px-3 py-2 data-mono text-text-primary"
                  />
                </div>
              </div>
              {dateError ? (
                <p id={dateErrorId} role="alert" className="text-xs text-status-error">
                  {dateError}
                </p>
              ) : (
                <p className="text-xs text-text-muted">Leave either end open for an open-ended range.</p>
              )}
            </fieldset>

            <div className="space-y-3">
              <p id={tagsLabelId} className="text-label text-text-body">
                Tags <span className="text-text-muted">(any selected tag)</span>
              </p>

              {tagGroups.length === 0 ? (
                <p className="text-sm text-text-muted">
                  No tags yet. Run Analyze to tag your library from its prompts, or add a custom tag below.
                </p>
              ) : (
                <div className="space-y-3" role="group" aria-labelledby={tagsLabelId}>
                  {tagGroups.map((group) => (
                    <div key={group.category} className="space-y-1.5">
                      <p className="mono-label text-text-muted">{group.label}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {group.tags.map((tag) => {
                          const selected = selectedTags.includes(tag.name.toLowerCase());
                          const removable = tag.source === 'user';
                          return (
                            <span
                              key={tag.id}
                              className={cn(
                                'inline-flex items-center rounded-full border transition-colors',
                                selected
                                  ? 'border-accent-primary-border bg-accent-primary-muted text-accent-primary'
                                  : 'border-border bg-surface text-text-body hover:border-border-hover',
                              )}
                            >
                              <button
                                type="button"
                                aria-pressed={selected}
                                onClick={() => toggleTag(tag.name)}
                                className={cn('min-h-8 rounded-full px-3 type-micro', removable && 'pr-1')}
                              >
                                {tag.name}
                              </button>
                              {removable && (
                                <button
                                  type="button"
                                  onClick={() => deleteCustomTag(tag)}
                                  aria-label={`Delete custom tag ${tag.name}`}
                                  title={`Delete custom tag ${tag.name}`}
                                  className="mr-0.5 flex h-7 w-7 items-center justify-center rounded-full text-text-muted hover:bg-sheen-medium hover:text-status-error"
                                >
                                  <X className="h-3 w-3" aria-hidden="true" />
                                </button>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor={tagInputId} className="text-label text-text-body">
                  Add a custom tag
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id={tagInputId}
                    type="text"
                    placeholder="e.g. hero shot"
                    value={tagDraft}
                    aria-describedby={tagHintId}
                    aria-invalid={tagError ? true : undefined}
                    onChange={(event) => {
                      setTagDraft(event.target.value);
                      if (tagError) setTagError(null);
                    }}
                    onKeyDown={(event) => {
                      // Enter adds the tag; it must not submit the whole form.
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addCustomTag();
                      }
                    }}
                    className={cn(
                      'recessed-well min-w-0 flex-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted',
                      tagError && 'border-status-error',
                    )}
                  />
                  <Button type="button" variant="secondary" size="sm" icon={Plus} onClick={addCustomTag}>
                    Add tag
                  </Button>
                </div>
                {tagError ? (
                  <p id={tagHintId} role="alert" className="text-xs text-status-error">
                    {tagError}
                  </p>
                ) : (
                  <p id={tagHintId} className="text-xs text-text-muted">
                    A custom tag matches assets whose prompt contains it as a whole word.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4">
            <p id={countId} className="data-mono text-text-body" aria-live="polite">
              {hasRules
                ? `${matchCount} of ${assetLibrary.length} ${assetLibrary.length === 1 ? 'asset matches' : 'assets match'}`
                : 'Add at least one rule to build the collection.'}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={!canCreate} aria-describedby={countId}>
                Create smart collection
              </Button>
            </div>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
