import { useState, useRef, useEffect } from 'react';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/Button';
import { Slider } from '@/components/ui/Slider';
import { Switch } from '@/components/ui/Switch';
import { ColorPicker } from '@/components/edit/ColorPicker';
import {
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Italic,
  Underline,
  Plus,
  Trash2,
  ChevronDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const FONTS = [
  'DM Sans',
  'Instrument Sans',
  'JetBrains Mono',
  'Playfair Display',
  'Bebas Neue',
  'Montserrat',
  'Oswald',
  'Roboto Slab',
  'Merriweather',
  'Fira Code',
];

const FONT_WEIGHTS = [
  { value: 300, label: 'Light' },
  { value: 400, label: 'Regular' },
  { value: 500, label: 'Medium' },
  { value: 600, label: 'Semi-bold' },
  { value: 700, label: 'Bold' },
];

export function TextControls() {
  const [fontFamily, setFontFamily] = useState('DM Sans');
  const [fontSize, setFontSize] = useState(48);
  const [fontWeight, setFontWeight] = useState(400);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('center');
  const [textColor, setTextColor] = useState('#FFFFFF');
  const [shadowEnabled, setShadowEnabled] = useState(false);
  const [shadowOffsetX, setShadowOffsetX] = useState(2);
  const [shadowOffsetY, setShadowOffsetY] = useState(2);
  const [shadowBlur, setShadowBlur] = useState(4);
  const [shadowColor, setShadowColor] = useState('#000000');
  const [strokeEnabled, setStrokeEnabled] = useState(false);
  const [strokeWidth, setStrokeWidth] = useState(1);
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [letterSpacing, setLetterSpacing] = useState(0);
  const [lineHeight, setLineHeight] = useState(1.4);
  const [opacity, setOpacity] = useState(100);
  const [hasSelection] = useState(false);

  const [recentColors, setRecentColors] = useState<string[]>([]);
  const [showFontDropdown, setShowFontDropdown] = useState(false);
  const fontDropdownRef = useRef<HTMLDivElement>(null);

  const handleColorChange = (color: string) => {
    setTextColor(color);
    setRecentColors((prev) => {
      const filtered = prev.filter((c) => c !== color);
      return [color, ...filtered].slice(0, 8);
    });
  };

  const handleAddText = () => {
    // TODO: integrate with canvas to add text layer
  };

  const handleDeleteSelected = () => {
    // TODO: integrate with canvas to delete selected text
  };

  useEffect(() => {
    if (!showFontDropdown) return;
    const handleClick = (e: MouseEvent) => {
      if (fontDropdownRef.current && !fontDropdownRef.current.contains(e.target as Node)) {
        setShowFontDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showFontDropdown]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Type className="w-3.5 h-3.5 text-red-primary" />
        <span className="text-label text-text-primary">Text</span>
      </div>

      {/* Font Family */}
      <div className="space-y-1.5 relative" ref={fontDropdownRef}>
        <label className="text-label text-text-body">Font Family</label>
        <button
          onClick={() => setShowFontDropdown(!showFontDropdown)}
          aria-expanded={showFontDropdown}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-elevated border border-border hover:border-border-hover transition-all text-left"
        >
          <span className="text-sm text-text-primary" style={{ fontFamily }}>
            {fontFamily}
          </span>
          <ChevronDown className={cn('w-3.5 h-3.5 text-text-muted transition-transform', showFontDropdown && 'rotate-180')} />
        </button>
        <AnimatePresence>
          {showFontDropdown && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute z-50 left-0 right-0 top-full mt-1 bg-elevated border border-border rounded-xl shadow-cinematic overflow-hidden max-h-48 overflow-y-auto"
            >
              {FONTS.map((font) => (
                <button
                  key={font}
                  onClick={() => {
                    setFontFamily(font);
                    setShowFontDropdown(false);
                  }}
                  className={cn(
                    'w-full px-3 py-2 text-left text-sm transition-all',
                    fontFamily === font
                      ? 'bg-red-aura text-red-primary'
                      : 'text-text-primary hover:bg-surface'
                  )}
                  style={{ fontFamily: font }}
                >
                  {font}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Font Size + Weight */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-label text-text-body mb-1 block">Size</label>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setFontSize(Math.max(12, fontSize - 2))}
              aria-label="Decrease font size"
              className="p-2 rounded bg-elevated border border-border text-text-body hover:text-text-primary transition-all text-xs font-mono"
            >
              −
            </button>
            <input
              type="number"
              value={fontSize}
              onChange={(e) => setFontSize(Math.max(12, Math.min(200, Number(e.target.value))))}
              className="w-full bg-elevated border border-border rounded-lg px-2 py-2 text-sm font-mono text-text-primary text-center focus:border-red-primary transition-all"
            />
            <button
              onClick={() => setFontSize(Math.min(200, fontSize + 2))}
              aria-label="Increase font size"
              className="p-2 rounded bg-elevated border border-border text-text-body hover:text-text-primary transition-all text-xs font-mono"
            >
              +
            </button>
          </div>
        </div>
        <div>
          <label className="text-label text-text-body mb-1 block">Weight</label>
          <select
            value={fontWeight}
            onChange={(e) => setFontWeight(Number(e.target.value))}
            className="w-full bg-elevated border border-border rounded-lg px-2 py-2 text-sm font-display text-text-primary focus:border-red-primary transition-all"
          >
            {FONT_WEIGHTS.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Style Toggles */}
      <div className="flex gap-2">
        <button
          onClick={() => setIsItalic(!isItalic)}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-display transition-all',
            isItalic
              ? 'bg-red-primary text-text-primary'
              : 'bg-elevated text-text-body border border-border hover:border-border-hover'
          )}
        >
          <Italic className="w-3.5 h-3.5" />
          Italic
        </button>
        <button
          onClick={() => setIsUnderline(!isUnderline)}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-display transition-all',
            isUnderline
              ? 'bg-red-primary text-text-primary'
              : 'bg-elevated text-text-body border border-border hover:border-border-hover'
          )}
        >
          <Underline className="w-3.5 h-3.5" />
          Underline
        </button>
      </div>

      {/* Text Alignment */}
      <div className="space-y-1.5">
        <label className="text-label text-text-body">Alignment</label>
        <div className="flex gap-2">
          {([
            { id: 'left', icon: AlignLeft },
            { id: 'center', icon: AlignCenter },
            { id: 'right', icon: AlignRight },
          ] as const).map(({ id, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTextAlign(id)}
              className={cn(
                'flex-1 flex items-center justify-center py-2 rounded-lg transition-all',
                textAlign === id
                  ? 'bg-red-primary text-text-primary'
                  : 'bg-elevated text-text-body border border-border hover:border-border-hover'
              )}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>
      </div>

      {/* Text Color */}
      <div className="space-y-1.5">
        <label className="text-label text-text-body">Color</label>
        <ColorPicker
          value={textColor}
          onChange={handleColorChange}
          recentColors={recentColors}
        />
      </div>

      {/* Text Shadow */}
      <div className="space-y-2 border-t border-border pt-3">
        <div className="flex items-center justify-between">
          <span className="text-label text-text-body">Text Shadow</span>
          <Switch
            label="Text shadow"
            checked={shadowEnabled}
            onChange={setShadowEnabled}
          />
        </div>
        {shadowEnabled && (
          <div className="space-y-3 pl-1">
            <Slider label="X Offset" value={shadowOffsetX} min={-20} max={20} onChange={setShadowOffsetX} />
            <Slider label="Y Offset" value={shadowOffsetY} min={-20} max={20} onChange={setShadowOffsetY} />
            <Slider label="Blur" value={shadowBlur} min={0} max={30} onChange={setShadowBlur} />
            <div className="space-y-1">
              <label className="text-label text-text-body">Shadow Color</label>
              <ColorPicker value={shadowColor} onChange={setShadowColor} recentColors={recentColors} />
            </div>
          </div>
        )}
      </div>

      {/* Text Stroke */}
      <div className="space-y-2 border-t border-border pt-3">
        <div className="flex items-center justify-between">
          <span className="text-label text-text-body">Text Stroke</span>
          <Switch
            label="Text stroke"
            checked={strokeEnabled}
            onChange={setStrokeEnabled}
          />
        </div>
        {strokeEnabled && (
          <div className="space-y-3 pl-1">
            <Slider label="Width" value={strokeWidth} min={0} max={10} step={0.5} onChange={setStrokeWidth} />
            <div className="space-y-1">
              <label className="text-label text-text-body">Stroke Color</label>
              <ColorPicker value={strokeColor} onChange={setStrokeColor} recentColors={recentColors} />
            </div>
          </div>
        )}
      </div>

      {/* Spacing */}
      <div className="space-y-3 border-t border-border pt-3">
        <Slider label="Letter Spacing" value={letterSpacing} min={-5} max={20} onChange={setLetterSpacing} />
        <Slider label="Line Height" value={lineHeight} min={0.8} max={3} step={0.1} onChange={setLineHeight} />
        <Slider label="Opacity" value={opacity} min={0} max={100} onChange={setOpacity} valueFormatter={(v) => `${v}%`} />
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 pt-2 border-t border-border">
        <Button variant="primary" size="sm" icon={Plus} fullWidth onClick={handleAddText}>
          Add Text
        </Button>
        {hasSelection && (
          <Button variant="danger" size="sm" icon={Trash2} onClick={handleDeleteSelected}>
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}
