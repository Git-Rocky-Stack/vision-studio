import { memo } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { SettingsDiff } from '@/types/iteration';

interface SettingsDiffPanelProps {
  diff: SettingsDiff;
  className?: string;
}

export const SettingsDiffPanel = memo(function SettingsDiffPanel({
  diff,
  className,
}: SettingsDiffPanelProps) {
  const entries = Object.entries(diff).filter(([, v]) => v !== undefined);

  if (entries.length === 0) return null;

  return (
    <div className={cn('recessed-well p-2', className)}>
      <h4 className="type-micro font-medium text-text-muted mb-1.5">Settings Changes</h4>
      <div className="space-y-1">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-center gap-2 type-micro">
            <span className="text-text-muted">{key}</span>
            <ArrowRight className="w-3 h-3 text-accent-primary flex-shrink-0" />
            <span className="text-text-primary font-medium truncate">
              {typeof value === 'number' ? value : String(value ?? '')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});