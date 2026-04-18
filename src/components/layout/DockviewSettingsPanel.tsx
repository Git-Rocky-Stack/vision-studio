import { memo, useCallback } from 'react';
import { useAppStore } from '@/store/appStore';
import { cn } from '@/utils/cn';
import { GeneratePanel } from '@/pages/GeneratePanel';
import { QuickGeneratePanel } from '@/pages/QuickGeneratePanel';
import { BatchPanel } from '@/pages/BatchPanel';
import { StoryboardPanel } from '@/pages/StoryboardPanel';
import { TemplatesPanel } from '@/pages/TemplatesPanel';
import { EditPropertiesPanel } from '@/components/edit/EditPropertiesPanel';
import { ToolStrip } from '@/components/edit/ToolStrip';
import type { ActiveSubMode, GenerateSubMode, StorySubMode } from '@/types/navigation';

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
];

const STORY_SUB_MODES: SubModeOption[] = [
  { value: 'storyboard', label: 'Storyboard' },
  { value: 'templates', label: 'Templates' },
];

function getSubModesForTab(tab: string): SubModeOption[] {
  if (tab === 'generate') return GENERATE_SUB_MODES;
  if (tab === 'story') return STORY_SUB_MODES;
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
      className="flex gap-0.5 rounded-md border border-border bg-surface p-0.5"
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
              'flex-1 rounded-sm px-2.5 py-1.5 text-center type-ui transition-colors',
              isActive
                ? 'bg-elevated text-text-primary shadow-sm'
                : 'text-text-body hover:bg-elevated hover:text-text-primary'
            )}
          >
            {option.label}
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
      return <GeneratePanel />;
    }

    case 'canvas':
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden">
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

    case 'workflows':
      // Placeholder - will become a workflow inspector panel later
      return <StoryboardPanel />;

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
  const setActiveSubMode = useAppStore((s) => s.setActiveSubMode);

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
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <SettingsContent activeTab={activeTab} activeSubMode={activeSubMode} />
      </div>
    </div>
  );
});