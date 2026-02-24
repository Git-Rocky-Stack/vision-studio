import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import {
  Sparkles,
  FolderOpen,
  Settings,
  ChevronLeft,
  ChevronRight,
  Wand2,
  Palette,
  LayoutTemplate,
  Layers,
  Zap,
} from 'lucide-react';
import { motion } from 'framer-motion';

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

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, activePanel, setActivePanel, systemInfo } = useAppStore();

  return (
    <motion.aside
      initial={false}
      animate={{ width: sidebarCollapsed ? 72 : 220 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="h-full bg-surface border-r border-border flex flex-col"
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-primary to-red-pressed flex items-center justify-center flex-shrink-0 glow-red-subtle">
            <Sparkles className="w-5 h-5 text-text-primary" />
          </div>
          {!sidebarCollapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="font-display font-bold text-lg text-text-primary whitespace-nowrap"
            >
              Vision<span className="text-red-primary">Studio</span>
            </motion.div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activePanel === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActivePanel(item.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative',
                isActive
                  ? 'bg-red-aura text-red-primary glow-red-subtle'
                  : 'text-text-body hover:text-text-primary hover:bg-elevated'
              )}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <Icon
                className={cn(
                  'w-5 h-5 flex-shrink-0 transition-all',
                  isActive && 'drop-shadow-[0_0_4px_rgba(230,57,70,0.6)]'
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
                  className="ml-auto w-1.5 h-1.5 rounded-full bg-red-primary shadow-[0_0_6px_rgba(230,57,70,0.6)]"
                />
              )}

              {/* Tooltip for collapsed state */}
              {sidebarCollapsed && (
                <div className="absolute left-full ml-2 px-2.5 py-1.5 bg-elevated border border-border rounded-lg text-xs text-text-primary opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 shadow-cinematic font-display">
                  {item.label}
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* GPU Status */}
      {!sidebarCollapsed && (
        <div className="px-3 py-3 border-t border-border">
          <div
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-display',
              systemInfo.gpuAvailable
                ? 'bg-green-500/8 text-green-400 border border-green-500/20'
                : 'bg-yellow-500/8 text-yellow-400 border border-yellow-500/20'
            )}
          >
            <Zap className="w-3.5 h-3.5" />
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
          className="w-full flex items-center justify-center p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-elevated transition-all"
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
}
