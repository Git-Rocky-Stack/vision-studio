import { useState, useRef, useEffect, useId } from 'react';
import { cn } from '@/utils/cn';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const PRESET_COLORS = [
  '#ffffff',
  '#e63946',
  '#f4a261',
  '#e9c46a',
  '#2a9d8f',
  '#264653',
  '#6c5ce7',
  '#ff6b9d',
  '#000000',
  '#636e72',
  '#00b894',
  '#fdcb6e',
];

export interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  recentColors: string[];
  /** What this colour is for (e.g. "Text colour"); names the trigger and the popover. */
  label?: string;
}

export function ColorPicker({ value, onChange, recentColors, label = 'Colour' }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hexInput, setHexInput] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverId = useId();
  const hexInvalid = hexInput.length > 0 && !/^#[0-9a-fA-F]{6}$/.test(hexInput);

  const close = () => {
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    setHexInput(value);
  }, [value]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  return (
    // Presentation: this wrapper only captures the Escape that bubbles up from
    // the swatch button or the open popover.
    <div
      ref={containerRef}
      role="presentation"
      className="relative"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && isOpen) {
          // The popover owns this Escape; nothing behind it should see it.
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-controls={isOpen ? popoverId : undefined}
        aria-label={`${label}: ${value}`}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-elevated border border-border hover:border-border-hover transition"
      >
        <div
          className="w-5 h-5 rounded border border-border"
          style={{ backgroundColor: value }}
          aria-hidden="true"
        />
        <span className="data-mono text-text-primary">{value}</span>
        <ChevronDown className="w-3 h-3 text-text-muted" aria-hidden="true" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            id={popoverId}
            role="dialog"
            aria-label={label}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute z-50 top-full left-0 mt-1 w-56 p-3 bg-elevated border border-border rounded-xl shadow-overlay space-y-3"
          >
            {/* Native color input */}
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label={`${label} picker`}
                value={value}
                onChange={(e) => {
                  onChange(e.target.value);
                  setHexInput(e.target.value);
                }}
                className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
              />
              <input
                value={hexInput}
                onChange={(e) => {
                  setHexInput(e.target.value);
                  if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) {
                    onChange(e.target.value);
                  }
                }}
                aria-label={`${label} hex value`}
                aria-invalid={hexInvalid}
                className="flex-1 bg-surface border border-border rounded-md px-2 py-1 data-mono text-text-primary focus:border-accent-primary transition"
                placeholder="#ffffff"
              />
            </div>

            {/* Preset colors */}
            <div>
              <p className="mono-label text-text-muted mb-2">
                Presets
              </p>
              <div className="grid grid-cols-6 gap-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Use ${color}`}
                    aria-pressed={value === color}
                    onClick={() => {
                      onChange(color);
                      setHexInput(color);
                    }}
                    className={cn(
                      'w-6 h-6 rounded border transition',
                      value === color
                        ? 'border-accent-primary ring-1 ring-accent-primary/40 scale-110'
                        : 'border-border hover:scale-110'
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            {/* Recent colors */}
            {recentColors.length > 0 && (
              <div>
                <p className="mono-label text-text-muted mb-2">
                  Recent
                </p>
                <div className="flex gap-2">
                  {recentColors.slice(0, 8).map((color, i) => (
                    <button
                      key={`${color}-${i}`}
                      type="button"
                      aria-label={`Use recent ${color}`}
                      onClick={() => {
                        onChange(color);
                        setHexInput(color);
                      }}
                      className="w-6 h-6 rounded border border-border hover:scale-110 transition"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
