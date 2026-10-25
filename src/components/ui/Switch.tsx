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
        // The track is drawn 20px tall; this extends what can be clicked to 24px
        // (WCAG 2.5.8) without changing the knob-to-track geometry.
        "after:absolute after:inset-x-0 after:inset-y-[-3px] after:content-['']",
        checked ? 'bg-accent-primary border-transparent' : 'bg-surface border-border',
        disabled && 'opacity-40 cursor-not-allowed',
        className
      )}
      style={{
        // Recessed slot: one depth layer, carved in, in both states. The track
        // used to add an outer glow when on, mixing inset and outset shadows on
        // one element; the light now comes from the knob.
        boxShadow: checked ? 'inset 0 1px 2px rgba(0,0,0,0.35)' : 'inset 0 1px 3px rgba(0,0,0,0.8)',
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
          // A raised knob: its own bevel and drop, plus the chrome glow when on.
          boxShadow: checked
            ? '0 1px 2px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.5), 0 0 8px var(--color-accent-primary-glow)'
            : '0 1px 2px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.5)',
        }}
      />
    </button>
  );
}
