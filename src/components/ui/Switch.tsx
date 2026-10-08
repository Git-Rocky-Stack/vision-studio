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
        // The border is present in both states (transparent when on) so the knob's
        // containing box never changes size between them.
        'w-9 h-5 rounded-full border transition-colors relative flex-shrink-0',
        checked ? 'bg-accent-primary border-transparent' : 'bg-surface border-border',
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
          // Anchored to the left edge: an absolutely positioned child of a button
          // with no inset takes the button's centred static position, which put
          // the off knob mid-track and pushed the on knob out past the end.
          'absolute left-px top-px w-4 h-4 rounded-full transition-transform',
          // Raised knob that inverts against its track in both themes: the accent
          // flips between themes, and void is the token that flips opposite it.
          checked ? 'translate-x-4 bg-void' : 'translate-x-0 bg-accent-primary'
        )}
        style={{
          boxShadow: '0 1px 2px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.5)',
        }}
      />
    </button>
  );
}
