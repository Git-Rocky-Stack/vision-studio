import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import { 
  Sparkles, 
  Image, 
  Film, 
  FolderOpen, 
  Settings, 
  ChevronLeft, 
  ChevronRight,
  Wand2,
  Palette,
  LayoutTemplate,
  Layers,
  Zap
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
      animate={{ width: sidebarCollapsed ? 72 : 240 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="h-full bg-charcoal border-r border-border flex flex-col"
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red to-red-hover flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          {!sidebarCollapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="font-bold text-lg text-white whitespace-nowrap"
            >
              Vision<span className="text-red">Studio</span>
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
                  ? 'bg-red/10 text-red border border-red/30' 
                  : 'text-silver hover:text-white hover:bg-charcoal-lighter'
              )}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <Icon className={cn(
                'w-5 h-5 flex-shrink-0',
                isActive && 'animate-pulse'
              )} />
              {!sidebarCollapsed && (
                <span className="font-medium whitespace-nowrap">{item.label}</span>
              )}
              {isActive && !sidebarCollapsed && (
                <motion.div
                  layoutId="activeIndicator"
                  className="ml-auto w-1.5 h-1.5 rounded-full bg-red"
                />
              )}
              
              {/* Tooltip for collapsed state */}
              {sidebarCollapsed && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-charcoal-light border border-border rounded text-xs text-white opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
                  {item.label}
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* GPU Status */}
      {!sidebarCollapsed && (
        <div className="px-4 py-3 border-t border-border">
          <div className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg text-xs',
            systemInfo.gpuAvailable 
              ? 'bg-green-500/10 text-green-500 border border-green-500/30'
              : 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/30'
          )}>
            <Zap className="w-3.5 h-3.5" />
            <span className="font-medium">
              {systemInfo.gpuAvailable 
                ? (systemInfo.gpuName?.split(' ').pop() || 'GPU Ready')
                : 'CPU Mode'
              }
            </span>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      {!sidebarCollapsed && (
        <div className="px-4 py-4 border-t border-border">
          <div className="text-xs font-medium text-silver mb-3 uppercase tracking-wider">
            Quick Actions
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button 
              onClick={() => setActivePanel('generate')}
              className="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-charcoal-lighter hover:bg-charcoal-light border border-border hover:border-border-hover transition-all group"
            >
              <Image className="w-5 h-5 text-silver group-hover:text-white" />
              <span className="text-xs text-silver group-hover:text-white">Image</span>
            </button>
            <button 
              onClick={() => setActivePanel('generate')}
              className="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-charcoal-lighter hover:bg-charcoal-light border border-border hover:border-border-hover transition-all group"
            >
              <Film className="w-5 h-5 text-silver group-hover:text-white" />
              <span className="text-xs text-silver group-hover:text-white">Video</span>
            </button>
          </div>
        </div>
      )}

      {/* Collapse Toggle */}
      <div className="p-2 border-t border-border">
        <button
          onClick={toggleSidebar}
          className="w-full flex items-center justify-center p-2 rounded-lg text-silver hover:text-white hover:bg-charcoal-lighter transition-all"
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
