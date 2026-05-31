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
        'w-9 h-5 rounded-full transition-colors relative flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-void',
        checked ? 'bg-accent-primary' : 'bg-surface border border-border',
        disabled && 'opacity-40 cursor-not-allowed',
        className
      )}
      style={{
        // Recessed slot: a lit chrome channel when on, a dark carved well when off.
        boxShadow: checked
          ? 'inset 0 1px 2px rgba(0,0,0,0.35), 0 0 8px var(--color-accent-primary-glow)'
          : 'inset 0 1px 3px rgba(0,0,0,0.8)',
      }}
    >
      <span
        className={cn(
          'absolute top-0.5 w-4 h-4 rounded-full transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5'
        )}
        style={{
          // Raised knob that inverts for contrast: carbon cap on the lit track,
          // chrome cap on the dark track.
          background: checked
            ? 'linear-gradient(180deg, #2A2A2A 0%, #161616 100%)'
            : 'linear-gradient(180deg, #FFFFFF 0%, #E6E6E6 55%, #C8C8C8 100%)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.5)',
        }}
      />
    </button>
  );
}
