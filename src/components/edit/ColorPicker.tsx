import { useState, useRef, useEffect } from 'react';
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
}

export function ColorPicker({ value, onChange, recentColors }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hexInput, setHexInput] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);

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
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-elevated border border-border hover:border-border-hover transition-all"
      >
        <div
          className="w-5 h-5 rounded border border-border"
          style={{ backgroundColor: value }}
        />
        <span className="font-mono text-xs text-text-primary">{value}</span>
        <ChevronDown className="w-3 h-3 text-text-muted" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute z-50 top-full left-0 mt-1 w-56 p-3 bg-elevated border border-border rounded-xl shadow-cinematic space-y-3"
          >
            {/* Native color input */}
            <div className="flex items-center gap-2">
              <input
                type="color"
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
                className="flex-1 bg-surface border border-border rounded-lg px-2 py-1 text-xs font-mono text-text-primary focus:border-red-primary transition-all"
                placeholder="#ffffff"
              />
            </div>

            {/* Preset colors */}
            <div>
              <p className="text-micro font-display text-text-muted mb-2 uppercase tracking-wider">
                Presets
              </p>
              <div className="grid grid-cols-6 gap-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => {
                      onChange(color);
                      setHexInput(color);
                    }}
                    className={cn(
                      'w-6 h-6 rounded border transition-all',
                      value === color
                        ? 'border-red-primary ring-1 ring-red-primary/40 scale-110'
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
                <p className="text-micro font-display text-text-muted mb-2 uppercase tracking-wider">
                  Recent
                </p>
                <div className="flex gap-2">
                  {recentColors.slice(0, 8).map((color, i) => (
                    <button
                      key={`${color}-${i}`}
                      onClick={() => {
                        onChange(color);
                        setHexInput(color);
                      }}
                      className="w-6 h-6 rounded border border-border hover:scale-110 transition-all"
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
