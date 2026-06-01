import { memo, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, Cloud } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';

import { getActiveUserAccount, resolvePromptEnhancementRoute } from '@/features/accounts/providerRouting';
import { useAppStore } from '@/store/appStore';
import type { AppState } from '@/store/appStore.types';
import type { UserAccountSummary } from '@/types/electron';
import type { GenerationDraft, StylePreset } from '@/types/generation';
import { BUILT_IN_STYLE_PRESETS } from '@/types/generation';
import { computeDimensions } from '@/types/resolution';
import { cn } from '@/utils/cn';
import { Led } from '@/components/hardware';
import { PromptEnhancementToolkit } from './PromptEnhancementToolkit';
import { PromptTemplateLibrary } from './PromptTemplateLibrary';
import { TokenWeightedEditor } from './TokenWeightedEditor';

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

type StudioBannerState = {
  tone: 'success' | 'error' | 'info';
  message: string;
};

const FEATURED_STYLE_PRESET_IDS = new Set([
  'cinematic',
  'photorealistic',
  'anime',
  'oil-painting',
  'storybook',
  'neon',
]);

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
        className="mono-label flex w-full items-center gap-1.5 py-1 text-text-muted transition-colors duration-normal hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/30"
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

export const PromptStudioPanel = memo(function PromptStudioPanel() {
  const {
    generationDraft,
    setGenerationDraft,
    applyPromptTemplate,
    advancedGeneration,
    aspectRatio,
    resolutionTier,
    customWidth,
    customHeight,
  } = useAppStore(
    useShallow((state) => ({
      generationDraft: state.generationDraft,
      setGenerationDraft: state.setGenerationDraft,
      applyPromptTemplate: state.applyPromptTemplate,
      advancedGeneration: state.advancedGeneration,
      aspectRatio: state.aspectRatio,
      resolutionTier: state.resolutionTier,
      customWidth: state.customWidth,
      customHeight: state.customHeight,
    })),
  );

  const [activeAccount, setActiveAccount] = useState<UserAccountSummary | null>(null);
  const [banner, setBanner] = useState<StudioBannerState | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isExpanding, setIsExpanding] = useState(false);
  const [isNegativeSuggesting, setIsNegativeSuggesting] = useState(false);
  const [isStyleTransferOpen, setIsStyleTransferOpen] = useState(false);
  const [activeStylePresets, setActiveStylePresets] = useState<string[]>([]);

  const draft = useMemo(
    () =>
      generationDraft ??
      buildDefaultGenerationDraft({
        advancedGeneration,
        aspectRatio,
        resolutionTier,
        customWidth,
        customHeight,
      }),
    [advancedGeneration, aspectRatio, customHeight, customWidth, generationDraft, resolutionTier],
  );
  const promptRoute = resolvePromptEnhancementRoute(activeAccount);
  const featuredStylePresets = useMemo(
    () => BUILT_IN_STYLE_PRESETS.filter((preset) => FEATURED_STYLE_PRESET_IDS.has(preset.id)),
    [],
  );

  const updateDraft = useCallback(
    (patch: Partial<GenerationDraft>) => {
      const nextDraft = {
        ...draft,
        ...patch,
      };
      setGenerationDraft(nextDraft);
    },
    [draft, setGenerationDraft],
  );

  const syncActiveAccount = useCallback(async () => {
    const snapshot = await window.electron.accounts.list();
    const nextActiveAccount = getActiveUserAccount(snapshot);
    setActiveAccount(nextActiveAccount);
    return nextActiveAccount;
  }, []);

  useEffect(() => {
    void syncActiveAccount().catch(() => {
      setActiveAccount(null);
    });
  }, [syncActiveAccount]);

  const handleApplyTemplate = useCallback(
    (id: string, mode: 'replace' | 'merge') => {
      applyPromptTemplate(id, mode);
      setBanner({
        tone: 'info',
        message: mode === 'replace' ? 'Template replaced the current draft prompt.' : 'Template merged into the current draft prompt.',
      });
    },
    [applyPromptTemplate],
  );

  const handleEnhance = useCallback(async () => {
    if (!draft.prompt.trim()) {
      setBanner({ tone: 'error', message: 'Enter a prompt before running AI enhancement.' });
      return;
    }

    const nextActiveAccount = await syncActiveAccount().catch(() => activeAccount);
    const nextRoute = resolvePromptEnhancementRoute(nextActiveAccount ?? null);
    if (nextRoute.error) {
      setBanner({ tone: 'error', message: nextRoute.error });
      return;
    }

    setIsEnhancing(true);
    try {
      const result = await window.electron.generation.enhancePrompt({
        prompt: draft.prompt,
        mode: 'clarify',
      });
      if (!result.success || !result.prompt) {
        throw new Error(result.error || 'Prompt enhancement failed.');
      }

      updateDraft({ prompt: result.prompt });
      setBanner({
        tone: 'success',
        message:
          nextRoute.provider === 'openrouter'
            ? 'Prompt enhanced through the active OpenRouter account.'
            : 'Prompt enhanced with the local prompt tools.',
      });
    } catch (error) {
      setBanner({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Prompt enhancement failed.',
      });
    } finally {
      setIsEnhancing(false);
    }
  }, [activeAccount, draft.prompt, syncActiveAccount, updateDraft]);

  const handleExpand = useCallback(async () => {
    if (!draft.prompt.trim()) {
      setBanner({ tone: 'error', message: 'Enter a prompt before expanding it.' });
      return;
    }

    const nextActiveAccount = await syncActiveAccount().catch(() => activeAccount);
    const nextRoute = resolvePromptEnhancementRoute(nextActiveAccount ?? null);
    if (nextRoute.error) {
      setBanner({ tone: 'error', message: nextRoute.error });
      return;
    }

    setIsExpanding(true);
    try {
      const result = await window.electron.generation.enhancePrompt({
        prompt: draft.prompt,
        mode: 'expand',
      });
      if (!result.success || !result.prompt) {
        throw new Error(result.error || 'Prompt expansion failed.');
      }

      updateDraft({ prompt: result.prompt });
      setBanner({
        tone: 'success',
        message: 'Prompt expanded with richer detail and context.',
      });
    } catch (error) {
      setBanner({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Prompt expansion failed.',
      });
    } finally {
      setIsExpanding(false);
    }
  }, [activeAccount, draft.prompt, syncActiveAccount, updateDraft]);

  const handleNegativeSuggest = useCallback(async () => {
    if (!draft.prompt.trim()) {
      setBanner({ tone: 'error', message: 'Enter a prompt before requesting negative suggestions.' });
      return;
    }

    const nextActiveAccount = await syncActiveAccount().catch(() => activeAccount);
    const nextRoute = resolvePromptEnhancementRoute(nextActiveAccount ?? null);
    if (nextRoute.provider === 'openrouter' && nextRoute.error) {
      setBanner({ tone: 'error', message: nextRoute.error });
      return;
    }

    setIsNegativeSuggesting(true);
    try {
      const result = await window.electron.generation.suggestNegativePrompt({
        prompt: draft.prompt,
        negativePrompt: draft.negativePrompt,
      });
      if (!result.success || !result.negativePrompt) {
        throw new Error(result.error || 'Negative prompt suggestion failed.');
      }

      updateDraft({ negativePrompt: result.negativePrompt });
      const suggestionCount = result.suggestions?.length ?? 0;
      setBanner({
        tone: 'info',
        message:
          suggestionCount > 0
            ? `Updated negative prompt with ${suggestionCount} ${suggestionCount === 1 ? 'suggestion' : 'suggestions'}.`
            : 'Negative prompt suggestions are ready.',
      });
    } catch (error) {
      setBanner({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Negative prompt suggestion failed.',
      });
    } finally {
      setIsNegativeSuggesting(false);
    }
  }, [activeAccount, draft.negativePrompt, draft.prompt, syncActiveAccount, updateDraft]);

  const handleStyleTransferToggle = useCallback(() => {
    setIsStyleTransferOpen((prev) => !prev);
    setBanner(null);
  }, []);

  const handleToggleStylePreset = useCallback(
    (preset: StylePreset) => {
      if (activeStylePresets.includes(preset.id)) {
        setActiveStylePresets((prev) => prev.filter((entry) => entry !== preset.id));
        updateDraft({
          prompt: draft.prompt.replace(`, ${preset.modifier}`, '').replace(preset.modifier, '').trim(),
        });
        return;
      }

      setActiveStylePresets((prev) => [...prev, preset.id]);
      updateDraft({
        prompt: draft.prompt ? `${draft.prompt}, ${preset.modifier}` : preset.modifier,
      });
      setBanner({
        tone: 'info',
        message: `${preset.name} style modifiers added to the current draft prompt.`,
      });
    },
    [activeStylePresets, draft.prompt, updateDraft],
  );

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-3">
      <div className="recessed-well px-3 py-3">
        <div className="flex items-start gap-3">
          <div className="raised-control mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center text-text-body">
            <Cloud className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Led color={promptRoute.error ? 'cue' : 'play'} size={7} />
              <p className="type-section text-text-primary">{promptRoute.providerLabel}</p>
            </div>
            <p className="mt-1 type-caption text-text-body">
              {promptRoute.provider === 'openrouter'
                ? `Account ${activeAccount?.name ?? 'No active account'} / Model ${promptRoute.model || 'OpenRouter default router'}`
                : 'Prompt Studio stays connected to the local draft and local prompt helpers by default.'}
            </p>
            {promptRoute.error ? (
              <p className="mt-2 type-caption text-status-warning">{promptRoute.error}</p>
            ) : null}
          </div>
        </div>
      </div>

      {banner ? (
        <div
          role="status"
          className={cn(
            'rounded-md border px-3 py-3 type-caption',
            banner.tone === 'success' && 'border-status-success-border bg-status-success-muted text-status-success',
            banner.tone === 'error' && 'border-status-error-border bg-status-error-muted text-status-error',
            banner.tone === 'info' && 'border-border bg-elevated text-text-body',
          )}
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{banner.message}</p>
          </div>
        </div>
      ) : null}

      <CollapsibleSection title="Prompt Editor" defaultOpen>
        <div className="flex flex-col gap-4">
          <TokenWeightedEditor
            value={draft.prompt}
            onChange={(value) => updateDraft({ prompt: value })}
            label="Positive Prompt"
            placeholder="Describe what you want to generate..."
          />
          <TokenWeightedEditor
            value={draft.negativePrompt}
            onChange={(value) => updateDraft({ negativePrompt: value })}
            label="Negative Prompt"
            placeholder="What to avoid in the generation..."
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Enhancement" defaultOpen={false}>
        <div className="space-y-3">
          <PromptEnhancementToolkit
            onEnhance={handleEnhance}
            onExpand={handleExpand}
            onNegativeSuggest={handleNegativeSuggest}
            onStyleTransfer={handleStyleTransferToggle}
            isEnhancing={isEnhancing}
            isExpanding={isExpanding}
            isNegativeSuggesting={isNegativeSuggesting}
            isStyleTransferActive={isStyleTransferOpen}
          />

          {isStyleTransferOpen ? (
            <div className="recessed-well px-3 py-3">
              <p className="type-ui text-text-primary">Style Presets</p>
              <p className="mt-1 type-caption text-text-body">
                Apply or remove built-in modifiers without leaving Prompt Studio.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {featuredStylePresets.map((preset) => {
                  const isActive = activeStylePresets.includes(preset.id);

                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleToggleStylePreset(preset)}
                      aria-pressed={isActive}
                      className={cn(
                        'rounded-md border px-3 py-2 type-ui transition-all',
                        isActive
                          ? 'border-accent-primary-border bg-accent-primary-muted text-accent-primary'
                          : 'border-border bg-surface text-text-body hover:border-border-hover hover:text-text-primary',
                      )}
                    >
                      {preset.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Templates" defaultOpen={false}>
        <PromptTemplateLibrary onApply={handleApplyTemplate} />
      </CollapsibleSection>
    </div>
  );
});

function buildDefaultGenerationDraft(
  state: Pick<
    AppState,
    'advancedGeneration' | 'aspectRatio' | 'resolutionTier' | 'customWidth' | 'customHeight'
  >,
): GenerationDraft {
  const dimensions = computeDimensions(
    state.aspectRatio,
    state.resolutionTier,
    state.customWidth,
    state.customHeight,
  );

  return {
    generationType: 'image',
    prompt: '',
    negativePrompt: '',
    width: dimensions.width,
    height: dimensions.height,
    steps: state.advancedGeneration.steps,
    cfgScale: state.advancedGeneration.cfgScale,
    model: 'flux-dev',
    scheduler: state.advancedGeneration.scheduler,
    seed: state.advancedGeneration.seed,
  };
}
