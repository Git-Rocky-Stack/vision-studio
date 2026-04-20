import { memo } from 'react';
import { SidebarOpen, AlignJustify, Network } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import type { IterationView } from '@/types/iteration';

interface IterationViewSelectorProps {
  className?: string;
}

const VIEWS: { id: IterationView; label: string; icon: typeof SidebarOpen }[] = [
  { id: 'panel', label: 'Panel', icon: SidebarOpen },
  { id: 'timeline', label: 'Timeline', icon: AlignJustify },
  { id: 'overlay', label: 'Overlay', icon: Network },
];

export const IterationViewSelector = memo(function IterationViewSelector({ className }: IterationViewSelectorProps) {
  const iterationView = useAppStore((s) => s.iterationView);
  const setIterationView = useAppStore((s) => s.setIterationView);

  return (
    <div className={cn('flex gap-1', className)} role="tablist" aria-label="Iteration view">
      {VIEWS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={iterationView === id}
          onClick={() => setIterationView(id)}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2 py-1 type-micro transition-colors',
            iterationView === id
              ? 'bg-accent-primary-muted text-accent-primary border border-accent-primary-border'
              : 'text-text-muted hover:text-text-body border border-transparent hover:bg-elevated',
          )}
        >
          <Icon className="w-3.5 h-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
});