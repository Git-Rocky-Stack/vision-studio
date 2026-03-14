import { cn } from '@/utils/cn';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}

export function Switch({ checked, onChange, label, disabled, className }: SwitchProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'w-9 h-5 rounded-full transition-colors relative flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-primary focus-visible:ring-offset-2 focus-visible:ring-offset-void',
        checked ? 'bg-red-primary' : 'bg-surface border border-border',
        disabled && 'opacity-40 cursor-not-allowed',
        className
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 w-4 h-4 rounded-full bg-text-primary transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5'
        )}
      />
    </button>
  );
}
