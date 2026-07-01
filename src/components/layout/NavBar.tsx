import { memo } from 'react';
import type { ElementType } from 'react';
import {
  Wand2,
  Palette,
  Clapperboard,
  GitBranch,
  FolderOpen,
  Layers,
  Boxes,
  Settings,
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { Tooltip } from '@/components/ui/Tooltip';
import { Led } from '@/components/hardware';
import { cn } from '@/utils/cn';
import type { ActiveTab } from '@/types/navigation';

// Active workspace pad: a lit carbon cap with a chrome edge-ring and glow,
// matching PadButton's selected recipe (DESIGN.md §four-layer depth system).
const ACTIVE_TAB_SHADOW =
  'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.6), 0 0 0 1px var(--color-chrome-edge), 0 0 10px rgba(230,230,230,0.18), 0 4px 8px rgba(0,0,0,0.5)';

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

interface NavBarTabDef {
  id: ActiveTab;
  label: string;
  icon: ElementType;
  cluster: 'top' | 'bottom';
}

const navBarTabs: NavBarTabDef[] = [
  { id: 'generate', label: 'Generate', icon: Wand2, cluster: 'top' },
  { id: 'canvas', label: 'Canvas', icon: Palette, cluster: 'top' },
  { id: 'story', label: 'Story', icon: Clapperboard, cluster: 'top' },
  { id: 'workflows', label: 'Workflows', icon: GitBranch, cluster: 'top' },
  { id: 'assets', label: 'Assets', icon: FolderOpen, cluster: 'bottom' },
  { id: 'collections', label: 'Collections', icon: Layers, cluster: 'bottom' },
  { id: 'foundry', label: 'Foundry', icon: Boxes, cluster: 'bottom' },
  { id: 'settings', label: 'Settings', icon: Settings, cluster: 'bottom' },
];

const topTabs = navBarTabs.filter((t) => t.cluster === 'top');
const bottomTabs = navBarTabs.filter((t) => t.cluster === 'bottom');

// ---------------------------------------------------------------------------
// NavBar component
// ---------------------------------------------------------------------------

export const NavBar = memo(function NavBar() {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const systemInfo = useAppStore((s) => s.systemInfo);

  const focusTab = (tabId: ActiveTab) => {
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(`[data-testid="nav-${tabId}"]`)?.focus();
    });
  };

  const activateTab = (tabId: ActiveTab) => {
    setActiveTab(tabId);
    focusTab(tabId);
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, tab: NavBarTabDef) => {
    const currentIndex = navBarTabs.findIndex((item) => item.id === tab.id);
    const lastIndex = navBarTabs.length - 1;
    let nextIndex: number;

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1;
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = lastIndex;
        break;
      default:
        return;
    }

    event.preventDefault();
    activateTab(navBarTabs[nextIndex].id);
  };

  const renderTab = (tab: NavBarTabDef) => {
    const Icon = tab.icon;
    const isActive = activeTab === tab.id;

    const buttonElement = (
      <button
        key={tab.id}
        data-testid={`nav-${tab.id}`}
        data-active={isActive || undefined}
        role="tab"
        aria-selected={isActive}
        tabIndex={isActive ? 0 : -1}
        onClick={() => activateTab(tab.id)}
        onKeyDown={(event) => handleTabKeyDown(event, tab)}
        aria-label={tab.label}
        className={cn(
          'relative flex h-10 w-10 items-center justify-center rounded-md transition-all duration-150',
          'min-w-[44px] min-h-[44px]', // touch target
          'focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-1 focus-visible:outline-none',
          isActive
            ? 'raised-control vx-pad text-accent-primary'
            : 'text-text-muted hover:bg-elevated/60 hover:text-text-primary'
        )}
        style={isActive ? { boxShadow: ACTIVE_TAB_SHADOW } : undefined}
      >
        {isActive && (
          /* Lit channel-select strip on the pad's leading edge */
          <span
            aria-hidden="true"
            className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full"
            style={{
              background: 'var(--color-accent-primary)',
              boxShadow: '0 0 8px var(--color-accent-primary-glow)',
            }}
          />
        )}
        <Icon className="w-5 h-5" aria-hidden="true" />
      </button>
    );

    return (
      <Tooltip key={tab.id} content={tab.label} placement="right">
        {buttonElement}
      </Tooltip>
    );
  };

  return (
    <aside
      className={cn(
        'relative w-14 h-full flex flex-col items-center',
        'bg-surface border-r border-border',
        'py-3 px-2'
      )}
    >
      {/* Faceplate edge-light down the right seam (DESIGN.md raised-hardware depth) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-px"
        style={{ background: 'linear-gradient(180deg, transparent, rgba(255,255,255,0.10), transparent)' }}
      />

      {/* Maker's-mark badge - recessed instrument port */}
      <div className="mb-4 flex-shrink-0">
        <div
          className="recessed-well flex h-9 w-9 items-center justify-center"
          style={{ borderRadius: 'var(--radius-control)' }}
        >
          <Wand2 className="h-4 w-4 text-accent-primary" aria-hidden="true" />
        </div>
      </div>

      {/* Top cluster */}
      <nav
        aria-label="Primary workspace tabs"
        className="flex flex-col items-center gap-1"
        role="tablist"
        aria-orientation="vertical"
      >
        {topTabs.map(renderTab)}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Divider - machined score line */}
      <div
        role="separator"
        aria-orientation="horizontal"
        className="my-2 h-px w-8"
        style={{ background: 'linear-gradient(90deg, transparent, var(--color-border-hover), transparent)' }}
      />

      {/* Bottom cluster */}
      <nav
        aria-label="Secondary workspace tabs"
        className="flex flex-col items-center gap-1"
        role="tablist"
        aria-orientation="vertical"
      >
        {bottomTabs.map(renderTab)}
      </nav>

      {/* GPU status - instrument LED in a recessed port */}
      <div className="mt-3 flex-shrink-0" data-testid="gpu-status">
        <span
          role="img"
          aria-label={systemInfo.gpuAvailable ? 'GPU available' : 'GPU unavailable'}
          title={systemInfo.gpuAvailable ? 'GPU available' : 'GPU unavailable'}
          className="recessed-well flex h-6 w-6 items-center justify-center"
          style={{ borderRadius: 'var(--radius-pill)' }}
        >
          <Led
            color={systemInfo.gpuAvailable ? 'play' : 'cue'}
            pulse={!systemInfo.gpuAvailable}
            size={7}
          />
        </span>
      </div>
    </aside>
  );
});
