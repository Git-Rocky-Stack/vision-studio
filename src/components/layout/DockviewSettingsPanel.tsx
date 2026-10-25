import { lazy, memo, Suspense, useCallback } from 'react';
import { useAppStore } from '@/store/appStore';
import { cn } from '@/utils/cn';
import { MonoLabel } from '@/components/hardware';
import { GeneratePanel } from '@/pages/GeneratePanel';
import { IterationTimeline } from '@/components/iteration/IterationTimeline';
import { WorkflowLibraryPanel } from '@/components/workflow/WorkflowLibraryPanel';
import type { ActiveSubMode, GenerateSubMode, StorySubMode, WorkflowsSubMode } from '@/types/navigation';

// GeneratePanel is the startup surface and stays in the initial chunk. The other
// sub-mode surfaces (batch, studio, storyboard, templates, the Konva-based edit
// panels, and the pipeline builder) are heavy and never shown at launch, so they
// are code-split out of the initial renderer chunk and loaded on first
// navigation. This trims the entry chunk (less JS parsed/evaluated at startup);
// in an Electron app the split chunks load from local disk with no network cost.
const QuickGeneratePanel = lazy(() =>
  import('@/pages/QuickGeneratePanel').then((m) => ({ default: m.QuickGeneratePanel })),
);
const BatchPanel = lazy(() => import('@/pages/BatchPanel').then((m) => ({ default: m.BatchPanel })));
const PromptStudioPanel = lazy(() =>
  import('@/components/studio/PromptStudioPanel').then((m) => ({ default: m.PromptStudioPanel })),
);
const StoryboardPanel = lazy(() =>
  import('@/pages/StoryboardPanel').then((m) => ({ default: m.StoryboardPanel })),
);
const TemplatesPanel = lazy(() =>
  import('@/pages/TemplatesPanel').then((m) => ({ default: m.TemplatesPanel })),
);
const EditPropertiesPanel = lazy(() =>
  import('@/components/edit/EditPropertiesPanel').then((m) => ({ default: m.EditPropertiesPanel })),
);
const ToolStrip = lazy(() => import('@/components/edit/ToolStrip').then((m) => ({ default: m.ToolStrip })));
const PipelineWorkspace = lazy(() =>
  import('@/components/pipeline/PipelineWorkspace').then((m) => ({ default: m.PipelineWorkspace })),
);

function PanelLoadingFallback() {
  return (
    <div role="status" aria-label="Loading panel" className="flex h-full items-center justify-center">
      <div className="h-6 w-6 animate-pulse rounded-full bg-elevated" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-mode configuration per tab                                            */
/* -------------------------------------------------------------------------- */

interface SubModeOption {
  value: ActiveSubMode;
  label: string;
}

const GENERATE_SUB_MODES: SubModeOption[] = [
  { value: 'generate', label: 'Generate' },
  { value: 'quick', label: 'Quick' },
  { value: 'batch', label: 'Batch' },
  { value: 'studio', label: 'Studio' },
];

const STORY_SUB_MODES: SubModeOption[] = [
  { value: 'storyboard', label: 'Storyboard' },
  { value: 'templates', label: 'Templates' },
];

const WORKFLOWS_SUB_MODES: SubModeOption[] = [
  { value: 'workflows', label: 'Workflows' },
  { value: 'pipelines', label: 'Pipelines' },
];

function getSubModesForTab(tab: string): SubModeOption[] {
  if (tab === 'generate') return GENERATE_SUB_MODES;
  if (tab === 'story') return STORY_SUB_MODES;
  if (tab === 'workflows') return WORKFLOWS_SUB_MODES;
  return [];
}

/* -------------------------------------------------------------------------- */
/*  SegmentedControl                                                          */
/* -------------------------------------------------------------------------- */

interface SegmentedControlProps {
  options: SubModeOption[];
  value: ActiveSubMode;
  onChange: (value: ActiveSubMode) => void;
}

function SegmentedControl({ options, value, onChange }: SegmentedControlProps) {
  return (
    <div
      className="recessed-well flex gap-0.5 p-0.5"
      role="tablist"
      id="settings-segmented-control"
      aria-label="Settings sub-mode"
    >
      {options.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex-1 rounded-md px-2.5 py-1.5 text-center transition',
              isActive
                ? 'raised-control text-accent-primary'
                : 'text-text-body hover:text-text-primary'
            )}
          >
            <MonoLabel tone={isActive ? 'chrome' : 'silver'}>{option.label}</MonoLabel>
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Content renderer                                                          */
/* -------------------------------------------------------------------------- */

function SettingsContent({
  activeTab,
  activeSubMode,
}: {
  activeTab: string;
  activeSubMode: ActiveSubMode;
}) {
  switch (activeTab) {
    case 'generate': {
      const sub = activeSubMode as GenerateSubMode;
      if (sub === 'quick') return <QuickGeneratePanel />;
      if (sub === 'batch') return <BatchPanel />;
      if (sub === 'studio') return <PromptStudioPanel />;
      return <GeneratePanel />;
    }

    case 'canvas':
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden">
          <h1 className="sr-only">Canvas</h1>
          <ToolStrip />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <EditPropertiesPanel />
          </div>
        </div>
      );

    case 'story': {
      const sub = activeSubMode as StorySubMode;
      if (sub === 'templates') return <TemplatesPanel />;
      return <StoryboardPanel />;
    }

    case 'workflows': {
      const sub = activeSubMode as WorkflowsSubMode;
      if (sub === 'pipelines') {
        // Reactive picker + builder; reading getState() here during render
        // never re-rendered on pipeline changes.
        return <PipelineWorkspace />;
      }
      // The workbench in the centre leaves its library out on this tab
      // (DockviewLayout passes library="docked"), so this is the only copy.
      return <WorkflowLibraryPanel docked />;
    }

    default:
      return <GeneratePanel />;
  }
}

/* -------------------------------------------------------------------------- */
/*  DockviewSettingsPanel                                                     */
/* -------------------------------------------------------------------------- */

export const DockviewSettingsPanel = memo(function DockviewSettingsPanel() {
  const activeTab = useAppStore((s) => s.activeTab);
  const activeSubMode = useAppStore((s) => s.activeSubMode);
  const iterationView = useAppStore((s) => s.iterationView);
  const setActiveSubMode = useAppStore((s) => s.setActiveSubMode);

  const iterationBranches = useAppStore((s) => s.iterationBranches);

  const subModes = getSubModesForTab(activeTab);

  const handleSubModeChange = useCallback(
    (subMode: ActiveSubMode) => {
      setActiveSubMode(subMode);
    },
    [setActiveSubMode]
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Sub-mode segmented control - only visible when the active tab has sub-modes */}
      {subModes.length > 0 && (
        <div className="flex flex-shrink-0 items-center border-b border-border px-3 py-2">
          <SegmentedControl
            options={subModes}
            value={activeSubMode}
            onChange={handleSubModeChange}
          />
        </div>
      )}

      {/* Content area */}
      <div
        role="tabpanel"
        id="settings-tabpanel"
        aria-labelledby="settings-segmented-control"
        // A flex column, so a panel that pins its own header or footer (flex-1
        // min-h-0) can fill the dock; content-height panels still scroll here.
        className="scroll-shadow-y flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        <Suspense fallback={<PanelLoadingFallback />}>
          <SettingsContent activeTab={activeTab} activeSubMode={activeSubMode} />
        </Suspense>
      </div>

      {/* Iteration timeline for generate/canvas */}
      {(activeTab === 'generate' || activeTab === 'canvas') &&
        iterationBranches.length > 0 &&
        iterationView !== 'timeline' && (
        <div className="flex-shrink-0 border-t border-border">
          <IterationTimeline className="h-16" />
        </div>
      )}
    </div>
  );
});
