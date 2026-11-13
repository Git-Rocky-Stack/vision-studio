import { memo, useEffect, useId, useRef, useState } from 'react';
import type { FocusEvent, KeyboardEvent } from 'react';

import { cn } from '@/utils/cn';
import type { SceneTransition, TransitionType } from '@/types/project';

import { TRANSITION_CONFIG, TransitionIndicator } from './TransitionIndicator';

/** Every transition the storyboard model supports, in picker order. */
export const TRANSITION_TYPES: readonly TransitionType[] = [
  'cut',
  'fade',
  'dissolve',
  'wipe-left',
  'wipe-right',
  'zoom',
];

/** A cut is instantaneous; every other transition needs a visible duration. */
export const DEFAULT_TRANSITION_DURATION_MS = 500;
export const MIN_TRANSITION_DURATION_MS = 100;
export const MAX_TRANSITION_DURATION_MS = 5000;

export function clampTransitionDuration(ms: number): number {
  return Math.min(MAX_TRANSITION_DURATION_MS, Math.max(MIN_TRANSITION_DURATION_MS, Math.round(ms)));
}

/** The transition that results from picking `type`, keeping a usable duration. */
export function withTransitionType(current: SceneTransition, type: TransitionType): SceneTransition {
  if (type === 'cut') return { type, duration: 0 };
  return {
    type,
    duration: current.duration > 0 ? clampTransitionDuration(current.duration) : DEFAULT_TRANSITION_DURATION_MS,
  };
}

function toSecondsText(ms: number): string {
  return (ms / 1000).toFixed(1);
}

interface TransitionPickerProps {
  sceneId: string;
  sceneName: string;
  transition: SceneTransition;
  /** Receives the scene id so a list can pass one stable callback to every picker. */
  onChange: (sceneId: string, transition: SceneTransition) => void;
}

/**
 * The transition between a scene and the next one: the indicator opens a
 * popover listing every transition type (radio group, arrow keys move) and a
 * duration field. Escape closes it and returns focus to the indicator without
 * reaching the workspace shortcuts behind it; clicking or tabbing away closes it.
 */
export const TransitionPicker = memo(function TransitionPicker({
  sceneId,
  sceneName,
  transition,
  onChange,
}: TransitionPickerProps) {
  const [open, setOpen] = useState(false);
  const [durationText, setDurationText] = useState(() => toSecondsText(transition.duration));
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();
  const durationId = useId();
  const durationHelpId = useId();
  const isCut = transition.type === 'cut';

  // Re-seed the draft when the stored duration changes (type switch, undo).
  useEffect(() => {
    setDurationText(toSecondsText(transition.duration));
  }, [transition.duration]);

  // Opening moves focus to the checked type, the radio group's entry point.
  useEffect(() => {
    if (!open) return;
    popoverRef.current?.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.focus();
  }, [open]);

  // A pointer press outside the picker dismisses it.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !wrapperRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || !open) return;
    // Contain the key: the timeline and canvas listen on the window.
    event.preventDefault();
    event.stopPropagation();
    close(true);
  };

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (open && next instanceof Node && !wrapperRef.current?.contains(next)) {
      setOpen(false);
    }
  };

  const commitDuration = (text: string) => {
    const seconds = Number.parseFloat(text);
    if (!Number.isFinite(seconds)) {
      setDurationText(toSecondsText(transition.duration));
      return;
    }
    const duration = clampTransitionDuration(seconds * 1000);
    setDurationText(toSecondsText(duration));
    if (duration !== transition.duration) {
      onChange(sceneId, { ...transition, duration });
    }
  };

  return (
    // Presentation: the wrapper captures keys and focus leaving from the
    // trigger and the popover (Escape closes, blur outside dismisses).
    <div ref={wrapperRef} role="presentation" className="relative" onKeyDown={handleKeyDown} onBlur={handleBlur}>
      <TransitionIndicator
        ref={triggerRef}
        type={transition.type}
        duration={transition.duration}
        expanded={open}
        controlsId={popoverId}
        onClick={() => setOpen((value) => !value)}
      />

      {open ? (
        <div
          ref={popoverRef}
          id={popoverId}
          role="dialog"
          aria-label={`Transition after ${sceneName}`}
          data-testid="transition-picker"
          className="absolute left-1/2 top-full z-[var(--z-dropdown)] mt-1 w-64 -translate-x-1/2 space-y-3 rounded-overlay border border-border bg-elevated p-3 shadow-overlay"
        >
          <fieldset>
            <legend className="mono-label text-text-muted">Transition</legend>
            <div className="mt-2 grid grid-cols-2 gap-1">
              {TRANSITION_TYPES.map((type) => {
                const config = TRANSITION_CONFIG[type];
                const Icon = config.icon;
                const checked = transition.type === type;
                return (
                  <label
                    key={type}
                    className={cn(
                      'flex min-h-8 cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 type-ui transition-colors duration-150',
                      checked
                        ? 'border-accent-primary-border bg-accent-primary-muted text-text-primary'
                        : 'border-transparent text-text-body hover:bg-surface hover:text-text-primary',
                    )}
                  >
                    <input
                      type="radio"
                      name={`transition-type-${popoverId}`}
                      value={type}
                      checked={checked}
                      onChange={() => onChange(sceneId, withTransitionType(transition, type))}
                      className="h-3.5 w-3.5 flex-none cursor-pointer accent-accent-primary"
                    />
                    <Icon className={cn('h-3.5 w-3.5 flex-none', config.className)} aria-hidden="true" />
                    <span>{config.label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div>
            <label htmlFor={durationId} className="mono-label text-text-muted">
              Duration (s)
            </label>
            <input
              id={durationId}
              type="number"
              inputMode="decimal"
              min={MIN_TRANSITION_DURATION_MS / 1000}
              max={MAX_TRANSITION_DURATION_MS / 1000}
              step={0.1}
              disabled={isCut}
              aria-describedby={durationHelpId}
              value={isCut ? '' : durationText}
              placeholder={isCut ? 'Instant' : undefined}
              onChange={(event) => setDurationText(event.target.value)}
              onBlur={(event) => commitDuration(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitDuration(event.currentTarget.value);
                }
              }}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 data-mono text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
            />
            <p id={durationHelpId} className="mt-1 type-caption text-text-muted">
              {isCut
                ? 'A cut is instantaneous. Pick another transition to set a duration.'
                : `${MIN_TRANSITION_DURATION_MS / 1000}s to ${MAX_TRANSITION_DURATION_MS / 1000}s.`}
            </p>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => close(true)}
              className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-3 type-ui text-text-primary transition-colors duration-150 hover:bg-panel-raised"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
});
