import { memo } from 'react';
import type { ElementType } from 'react';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import { Tooltip } from '@/components/ui/Tooltip';
import {
  FolderOpen,
  Settings,
  ChevronLeft,
  ChevronRight,
  Wand2,
  Palette,
  LayoutTemplate,
  Layers,
  CheckCircle2,
  AlertCircle,
  Clapperboard,
  Zap,
} from 'lucide-react';
import { motion } from 'framer-motion';

const SIDEBAR_WIDTH_COLLAPSED = 76;
const SIDEBAR_WIDTH_EXPANDED = 168;

interface NavItem {
  id: 'generate' | 'edit' | 'assets' | 'settings' | 'templates' | 'batch' | 'storyboard' | 'quick';
  label: string;
  icon: ElementType;
  group: 'Create' | 'Sequence' | 'Refine' | 'System';
}

const navItems: NavItem[] = [
  { id: 'generate', label: 'Generate', icon: Wand2, group: 'Create' },
  { id: 'quick', label: 'Quick', icon: Zap, group: 'Create' },
  { id: 'storyboard', label: 'Storyboard', icon: Clapperboard, group: 'Sequence' },
  { id: 'batch', label: 'Batch', icon: Layers, group: 'Sequence' },
  { id: 'templates', label: 'Templates', icon: LayoutTemplate, group: 'Sequence' },
  { id: 'edit', label: 'Edit', icon: Palette, group: 'Refine' },
  { id: 'assets', label: 'Assets', icon: FolderOpen, group: 'Refine' },
  { id: 'settings', label: 'Settings', icon: Settings, group: 'System' },
];

export const Sidebar = memo(function Sidebar() {
  const {
    sidebarCollapsed,
    toggleSidebar,
    activePanel,
    setActivePanel,
    systemInfo,
  } = useAppStore();

  const groupedItems = navItems.reduce<Record<NavItem['group'], NavItem[]>>(
    (groups, item) => {
      groups[item.group].push(item);
      return groups;
    },
    { Create: [], Sequence: [], Refine: [], System: [] }
  );

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon;
    const isActive = activePanel === item.id;

    const buttonElement = (
      <button
        key={item.id}
        data-testid={`nav-${item.id}`}
        onClick={() => setActivePanel(item.id)}
        aria-label={item.label}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'group/nav w-full flex items-center gap-3 px-3 py-2.5 rounded-md transition-all duration-150 relative min-h-[44px]',
          isActive
            ? 'bg-accent-primary-muted text-accent-primary border border-accent-primary-border shadow-accent-subtle'
            : 'text-text-muted border border-transparent hover:text-text-primary hover:bg-elevated/70 hover:border-border'
        )}
      >
        {isActive && (
          <motion.div
            layoutId="activeRailIndicator"
            className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-accent-primary"
          />
        )}
        <Icon className="w-4.5 h-4.5 flex-shrink-0 transition-all" />
        {!sidebarCollapsed && (
          <span className="font-display font-medium text-xs whitespace-nowrap">
            {item.label}
          </span>
        )}
      </button>
    );

    return sidebarCollapsed ? (
      <Tooltip key={item.id} content={item.label} placement="right">
        {buttonElement}
      </Tooltip>
    ) : (
      buttonElement
    );
  };

  return (
    <motion.aside
      initial={false}
      animate={{ width: sidebarCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="h-full bg-[linear-gradient(180deg,var(--color-panel),var(--color-surface))] border-r border-border flex flex-col"
    >
      {/* Logo */}
      <div className="h-12 flex items-center px-3 border-b border-border">
        <div className={cn('flex items-center gap-2 min-w-0', sidebarCollapsed && 'mx-auto')}>
          <div className="h-6 w-6 rounded-md border border-accent-primary-border bg-accent-primary-muted flex items-center justify-center">
            <span className="font-mono text-micro font-bold text-accent-primary">VS</span>
          </div>
          {!sidebarCollapsed && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="font-display font-semibold text-[11px] text-text-primary whitespace-nowrap"
            >
              Vision Studio
            </motion.span>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav aria-label="Main navigation" className="py-3 px-2 space-y-4 flex-1 overflow-y-auto scrollbar-hide">
        {(Object.keys(groupedItems) as NavItem['group'][]).map((group) => (
          <div key={group} className="space-y-1">
            {!sidebarCollapsed && (
              <p className="px-3 pb-1 font-mono text-[9px] uppercase text-text-muted/70">
                {group}
              </p>
            )}
            {groupedItems[group].map(renderNavItem)}
          </div>
        ))}
      </nav>

      {/* GPU Status */}
      {!sidebarCollapsed && (
        <div className="px-3 py-3 border-t border-border">
          <div
            className={cn(
              'flex items-center gap-2 px-2.5 py-2 rounded-md text-xs font-display border',
              systemInfo.gpuAvailable
                ? 'bg-status-success-muted text-status-success border-status-success-border'
                : 'bg-status-warning-muted text-status-warning border-status-warning-border'
            )}
          >
            {systemInfo.gpuAvailable ? (
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span className="font-medium">
              {systemInfo.gpuAvailable
                ? (systemInfo.gpuName?.split(' ').pop() || 'GPU Ready')
                : 'CPU Mode'}
            </span>
          </div>
        </div>
      )}

      {/* Collapse Toggle */}
      <div className="p-2 border-t border-border">
        <button
          onClick={toggleSidebar}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="w-full flex items-center justify-center p-3 rounded-md text-text-muted hover:text-text-primary hover:bg-elevated transition-all min-h-[44px]"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <ChevronLeft className="w-5 h-5" />
          )}
        </button>
      </div>
    </motion.aside>
  );
});
