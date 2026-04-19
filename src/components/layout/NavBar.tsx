import { memo } from 'react';
import type { ElementType } from 'react';
import {
  Wand2,
  Palette,
  Clapperboard,
  GitBranch,
  FolderOpen,
  Layers,
  Settings,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/utils/cn';
import type { ActiveTab } from '@/types/navigation';

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

  const renderTab = (tab: NavBarTabDef) => {
    const Icon = tab.icon;
    const isActive = activeTab === tab.id;

    const buttonElement = (
      <button
        key={tab.id}
        data-testid={`nav-${tab.id}`}
        data-active={isActive || undefined}
        onClick={() => setActiveTab(tab.id)}
        aria-label={tab.label}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'w-10 h-10 flex items-center justify-center rounded-lg transition-all duration-150',
          'min-w-[44px] min-h-[44px]', // touch target
          'focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-1 focus-visible:outline-none',
          isActive
            ? 'bg-accent-primary-muted text-accent-primary border border-accent-primary-border shadow-accent-subtle'
            : 'text-text-muted border border-transparent hover:text-text-primary hover:bg-elevated/70 hover:border-border'
        )}
      >
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
        'w-14 h-full flex flex-col items-center',
        'bg-surface border-r border-border',
        'py-3 px-2'
      )}
    >
      {/* Logo */}
      <div className="mb-4 flex-shrink-0">
        <div className="h-8 w-8 rounded-lg border border-accent-primary-border bg-accent-primary-muted flex items-center justify-center">
          <Wand2 className="h-4 w-4 text-accent-primary" aria-hidden="true" />
        </div>
      </div>

      {/* Top cluster */}
      <nav aria-label="Primary navigation" className="flex flex-col items-center gap-1">
        {topTabs.map(renderTab)}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Divider */}
      <div
        role="separator"
        aria-orientation="horizontal"
        className="w-8 h-px bg-border my-2"
      />

      {/* Bottom cluster */}
      <nav aria-label="Secondary navigation" className="flex flex-col items-center gap-1">
        {bottomTabs.map(renderTab)}
      </nav>

      {/* GPU status indicator */}
      <div className="mt-3 flex-shrink-0" data-testid="gpu-status">
        {systemInfo.gpuAvailable ? (
          <CheckCircle2
            className="w-4 h-4 text-status-success"
            aria-label="GPU available"
          />
        ) : (
          <AlertCircle
            className="w-4 h-4 text-status-warning"
            aria-label="GPU unavailable"
          />
        )}
      </div>
    </aside>
  );
});