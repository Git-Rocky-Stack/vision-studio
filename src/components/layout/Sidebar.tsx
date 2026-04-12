import { memo } from 'react';
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
  Undo,
  Redo,
  Save,
  Play,
  Download,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { AdvancedGenerationSettings } from '@/components/generate/AdvancedGenerationSettings';

const SIDEBAR_WIDTH_COLLAPSED = 72;
const SIDEBAR_WIDTH_EXPANDED = 224;

interface NavItem {
  id: 'generate' | 'edit' | 'assets' | 'settings' | 'templates' | 'batch';
  label: string;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  { id: 'generate', label: 'Generate', icon: Wand2 },
  { id: 'batch', label: 'Batch', icon: Layers },
  { id: 'templates', label: 'Templates', icon: LayoutTemplate },
  { id: 'edit', label: 'Edit', icon: Palette },
  { id: 'assets', label: 'Assets', icon: FolderOpen },
  { id: 'settings', label: 'Settings', icon: Settings },
];

interface ActionItem {
  id: string;
  label: string;
  icon: React.ElementType;
  variant?: 'default' | 'primary';
  getDisabled?: () => boolean;
  onClick?: () => void;
}

export const Sidebar = memo(function Sidebar() {
  const {
    sidebarCollapsed,
    toggleSidebar,
    activePanel,
    setActivePanel,
    systemInfo,
    editHistory,
    editHistoryIndex,
    undo,
    redo,
  } = useAppStore();

  const canUndo = editHistoryIndex > 0;
  const canRedo = editHistoryIndex < editHistory.length - 1;

  const actionItems: ActionItem[] = [
    { id: 'undo', label: 'Undo', icon: Undo, getDisabled: () => !canUndo, onClick: undo },
    { id: 'redo', label: 'Redo', icon: Redo, getDisabled: () => !canRedo, onClick: redo },
    { id: 'open', label: 'Open', icon: FolderOpen },
    { id: 'save', label: 'Save', icon: Save },
    { id: 'preview', label: 'Preview', icon: Play, variant: 'primary' },
    { id: 'export', label: 'Export', icon: Download },
  ];

  return (
    <motion.aside
      initial={false}
      animate={{ width: sidebarCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="h-full bg-surface border-r border-border flex flex-col"
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-border">
        <div className="flex items-center">
          {!sidebarCollapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="font-display font-bold text-xs text-text-primary whitespace-nowrap tracking-[0.3em]"
            >
              VISION<span className="text-red-primary">STUDIO</span>
            </motion.div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav aria-label="Main navigation" className="flex-1 py-4 px-2 space-y-1">
        {navItems.map((item) => {
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
                'w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 relative min-h-[44px]',
                isActive
                  ? 'bg-red-aura text-red-primary glow-red-subtle'
                  : 'text-text-body hover:text-text-primary hover:bg-elevated'
              )}
            >
              <Icon
                className={cn(
                  'w-5 h-5 flex-shrink-0 transition-all',
                  isActive && 'drop-shadow-red-icon-strong'
                )}
              />
              {!sidebarCollapsed && (
                <span className="font-display font-medium text-sm whitespace-nowrap">
                  {item.label}
                </span>
              )}
              {isActive && !sidebarCollapsed && (
                <motion.div
                  layoutId="activeIndicator"
                  className="ml-auto w-1.5 h-1.5 rounded-full bg-red-primary shadow-red-dot"
                />
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
        })}
      </nav>

      {/* Actions — Undo/Redo, Open, Save, Preview, Export */}
      <div className="px-2 py-3 border-t border-border space-y-1">
        {/* Undo / Redo row — always side-by-side */}
        <div className={cn('flex gap-1', sidebarCollapsed ? 'flex-col' : 'flex-row')}>
          {actionItems.slice(0, 2).map((action) => {
            const Icon = action.icon;
            const isDisabled = action.getDisabled?.() ?? false;

            const btn = (
              <button
                key={action.id}
                onClick={action.onClick}
                disabled={isDisabled}
                aria-label={action.label}
                className={cn(
                  'flex items-center justify-center rounded-lg transition-all duration-200',
                  'text-text-body hover:text-text-primary hover:bg-elevated',
                  'disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-text-body disabled:hover:bg-transparent',
                  sidebarCollapsed ? 'w-full p-3 min-h-[44px]' : 'flex-1 p-2'
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {!sidebarCollapsed && (
                  <span className="font-display text-xs ml-2 whitespace-nowrap">{action.label}</span>
                )}
              </button>
            );

            return sidebarCollapsed ? (
              <Tooltip key={action.id} content={action.label} placement="right">
                {btn}
              </Tooltip>
            ) : btn;
          })}
        </div>

        {/* Remaining actions */}
        {actionItems.slice(2).map((action) => {
          const Icon = action.icon;
          const isPrimary = action.variant === 'primary';

          const btn = (
            <button
              key={action.id}
              onClick={action.onClick}
              aria-label={action.label}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 min-h-[44px]',
                isPrimary
                  ? 'bg-red-primary text-text-primary glow-red-subtle hover:bg-red-highlight'
                  : 'text-text-body hover:text-text-primary hover:bg-elevated'
              )}
            >
              <Icon className="w-4.5 h-4.5 flex-shrink-0" />
              {!sidebarCollapsed && (
                <span className="font-display font-medium text-sm whitespace-nowrap">
                  {action.label}
                </span>
              )}
            </button>
          );

          return sidebarCollapsed ? (
            <Tooltip key={action.id} content={action.label} placement="right">
              {btn}
            </Tooltip>
          ) : btn;
        })}
      </div>

      {/* Advanced Generation Settings — visible only on Generate panel */}
      {activePanel === 'generate' && (
        <div className="px-2 py-3 border-t border-border overflow-y-auto max-h-[40vh]">
          <AdvancedGenerationSettings collapsed={sidebarCollapsed} />
        </div>
      )}

      {/* GPU Status */}
      {!sidebarCollapsed && (
        <div className="px-3 py-3 border-t border-border">
          <div
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-display',
              systemInfo.gpuAvailable
                ? 'bg-status-success-muted text-status-success border border-status-success-border'
                : 'bg-status-warning-muted text-status-warning border border-status-warning-border'
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
          className="w-full flex items-center justify-center p-3 rounded-lg text-text-muted hover:text-text-primary hover:bg-elevated transition-all min-h-[44px]"
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
