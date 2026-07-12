import { useState, useRef, useEffect } from 'react';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/Button';
import { Slider } from '@/components/ui/Slider';
import { Switch } from '@/components/ui/Switch';
import { ColorPicker } from '@/components/edit/ColorPicker';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  CANVAS_TEXT_FONTS,
  TEXT_LAYER_DEFAULT_STYLE,
  createTextLayer,
  isTextLayer,
  textLayerName,
} from '@/features/edit/textLayers';
import type { TextStyle } from '@/types/editor';
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

const FONT_WEIGHTS = [
  { value: 300, label: 'Light' },
  { value: 400, label: 'Regular' },
  { value: 500, label: 'Medium' },
  { value: 600, label: 'Semi-bold' },
  { value: 700, label: 'Bold' },
];

const DEFAULT_TEXT_CONTENT = 'New text';

export function TextControls() {
  const {
    editLayers,
    selectedEditLayerId,
    currentImageSize,
    addEditLayer,
    updateEditLayer,
    removeEditLayer,
    setSelectedEditLayerId,
    pushEditHistory,
  } = useAppStore(
    useShallow((s) => ({
      editLayers: s.editLayers,
      selectedEditLayerId: s.selectedEditLayerId,
      currentImageSize: s.currentImageSize,
      addEditLayer: s.addEditLayer,
      updateEditLayer: s.updateEditLayer,
      removeEditLayer: s.removeEditLayer,
      setSelectedEditLayerId: s.setSelectedEditLayerId,
      pushEditHistory: s.pushEditHistory,
    }))
  );

  const selectedLayer = editLayers.find((l) => l.id === selectedEditLayerId);
  const selectedTextLayer = selectedLayer && isTextLayer(selectedLayer) ? selectedLayer : null;

  // Draft style + content: seeds new layers, and mirrors the selected text
  // layer so every control below writes through to it (#32).
  const [style, setStyle] = useState<TextStyle>(TEXT_LAYER_DEFAULT_STYLE);
  const [content, setContent] = useState('');
  const [opacityPercent, setOpacityPercent] = useState(100);

  const [recentColors, setRecentColors] = useState<string[]>([]);
  const [showFontDropdown, setShowFontDropdown] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const fontDropdownRef = useRef<HTMLDivElement>(null);

  // When the selection moves to a text layer, mirror its state in the panel.
  const selectedTextLayerId = selectedTextLayer?.id ?? null;
  useEffect(() => {
    if (!selectedTextLayerId) return;
    const layer = useAppStore.getState().editLayers.find((l) => l.id === selectedTextLayerId);
    if (!layer || !isTextLayer(layer)) return;
    const { text, x: _x, y: _y, rotation: _r, scaleX: _sx, scaleY: _sy, ...layerStyle } = layer.data;
    setStyle(layerStyle);
    setContent(text);
    setOpacityPercent(Math.round(layer.opacity * 100));
  }, [selectedTextLayerId]);

  const applyStyle = (patch: Partial<TextStyle>) => {
    setStyle((prev) => ({ ...prev, ...patch }));
    if (selectedTextLayer) {
      updateEditLayer(selectedTextLayer.id, {
        data: { ...selectedTextLayer.data, ...patch },
      });
    }
  };

  const handleContentChange = (text: string) => {
    setContent(text);
    if (selectedTextLayer) {
      updateEditLayer(selectedTextLayer.id, {
        name: textLayerName(text),
        data: { ...selectedTextLayer.data, text },
      });
    }
  };

  const handleOpacityChange = (value: number) => {
    setOpacityPercent(value);
    if (selectedTextLayer) {
      updateEditLayer(selectedTextLayer.id, { opacity: value / 100 });
    }
  };

  const handleColorChange = (color: string) => {
    applyStyle({ fill: color });
    setRecentColors((prev) => {
      const filtered = prev.filter((c) => c !== color);
      return [color, ...filtered].slice(0, 8);
    });
  };

  const handleAddText = () => {
    const text = content.trim() ? content : DEFAULT_TEXT_CONTENT;
    const position = currentImageSize
      ? { x: currentImageSize.width / 2, y: currentImageSize.height / 2 }
      : { x: 64, y: 64 };
    const layer = createTextLayer({ text, position, style, opacity: opacityPercent / 100 });

    addEditLayer(layer);
    setSelectedEditLayerId(layer.id);
    pushEditHistory({
      id: crypto.randomUUID(),
      action: `Add text layer "${layer.name}"`,
      timestamp: new Date(),
    });
  };

  const confirmDeleteSelected = () => {
    if (!selectedTextLayer) return;
    const { id, name } = selectedTextLayer;
    removeEditLayer(id);
    pushEditHistory({
      id: crypto.randomUUID(),
      action: `Delete text layer "${name}"`,
      timestamp: new Date(),
    });
    setShowDeleteConfirm(false);
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

  const hasSelection = Boolean(selectedTextLayer);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 min-w-0">
        <Type className="w-3.5 h-3.5 text-accent-primary" />
        <span className="text-label text-text-primary">Text</span>
        {selectedTextLayer && (
          <span className="data-mono text-text-muted truncate">
            {selectedTextLayer.name}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="space-y-1.5">
        <label className="text-label text-text-body" htmlFor="text-layer-content">
          Content
        </label>
        <textarea
          id="text-layer-content"
          aria-label="Text content"
          value={content}
          onChange={(e) => handleContentChange(e.target.value)}
          placeholder={DEFAULT_TEXT_CONTENT}
          rows={2}
          className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none transition-all resize-y"
        />
      </div>

      {/* Font Family */}
      <div className="space-y-1.5 relative" ref={fontDropdownRef}>
        <label className="text-label text-text-body">Font Family</label>
        <button
          onClick={() => setShowFontDropdown(!showFontDropdown)}
          aria-expanded={showFontDropdown}
          aria-haspopup="listbox"
          className="w-full flex items-center justify-between px-3 py-2 rounded-md bg-elevated border border-border hover:border-border-hover transition-all text-left"
        >
          <span className="text-sm text-text-primary" style={{ fontFamily: style.fontFamily }}>
            {style.fontFamily}
          </span>
          <ChevronDown className={cn('w-3.5 h-3.5 text-text-muted transition-transform', showFontDropdown && 'rotate-180')} />
        </button>
        <AnimatePresence>
          {showFontDropdown && (
            <motion.div
              role="listbox"
              aria-label="Font family"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute z-50 left-0 right-0 top-full mt-1 bg-elevated border border-border rounded-xl shadow-cinematic overflow-hidden max-h-48 overflow-y-auto"
            >
              {CANVAS_TEXT_FONTS.map((font) => (
                <button
                  key={font}
                  role="option"
                  aria-selected={style.fontFamily === font}
                  onClick={() => {
                    applyStyle({ fontFamily: font });
                    setShowFontDropdown(false);
                  }}
                  className={cn(
                    'w-full px-3 py-2 text-left text-sm transition-all',
                    style.fontFamily === font
                      ? 'bg-accent-primary-muted text-accent-primary'
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
              onClick={() => applyStyle({ fontSize: Math.max(12, style.fontSize - 2) })}
              aria-label="Decrease font size"
              className="p-2 rounded bg-elevated border border-border text-text-body hover:text-text-primary transition-all text-xs"
            >
              -
            </button>
            <input
              type="number"
              value={style.fontSize}
              aria-label="Font size"
              onChange={(e) =>
                applyStyle({ fontSize: Math.max(12, Math.min(200, Number(e.target.value))) })
              }
              className="w-full bg-elevated border border-border rounded-md px-2 py-2 data-mono text-text-primary text-center focus:border-accent-primary transition-all"
            />
            <button
              onClick={() => applyStyle({ fontSize: Math.min(200, style.fontSize + 2) })}
              aria-label="Increase font size"
              className="p-2 rounded bg-elevated border border-border text-text-body hover:text-text-primary transition-all text-xs"
            >
              +
            </button>
          </div>
        </div>
        <div>
          <label className="text-label text-text-body mb-1 block">Weight</label>
          <select
            value={style.fontWeight}
            aria-label="Font weight"
            onChange={(e) => applyStyle({ fontWeight: Number(e.target.value) })}
            className="w-full bg-elevated border border-border rounded-md px-2 py-2 text-sm text-text-primary focus:border-accent-primary transition-all"
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
          onClick={() => applyStyle({ italic: !style.italic })}
          aria-pressed={style.italic}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-2 rounded-md border text-xs transition-all',
            style.italic
              ? 'border-accent-primary-border bg-accent-primary-muted text-accent-primary'
              : 'border-border bg-elevated text-text-body hover:border-border-hover'
          )}
        >
          <Italic className="w-3.5 h-3.5" />
          Italic
        </button>
        <button
          onClick={() => applyStyle({ underline: !style.underline })}
          aria-pressed={style.underline}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-2 rounded-md border text-xs transition-all',
            style.underline
              ? 'border-accent-primary-border bg-accent-primary-muted text-accent-primary'
              : 'border-border bg-elevated text-text-body hover:border-border-hover'
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
              onClick={() => applyStyle({ align: id })}
              aria-label={`Align ${id}`}
              aria-pressed={style.align === id}
              className={cn(
                'flex-1 flex items-center justify-center py-2 rounded-md border transition-all',
                style.align === id
                  ? 'border-accent-primary-border bg-accent-primary-muted text-accent-primary'
                  : 'border-border bg-elevated text-text-body hover:border-border-hover'
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
          value={style.fill}
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
            checked={style.shadowEnabled}
            onChange={(checked) => applyStyle({ shadowEnabled: checked })}
          />
        </div>
        {style.shadowEnabled && (
          <div className="space-y-3 pl-1">
            <Slider label="X Offset" value={style.shadowOffsetX} min={-20} max={20} onChange={(v) => applyStyle({ shadowOffsetX: v })} />
            <Slider label="Y Offset" value={style.shadowOffsetY} min={-20} max={20} onChange={(v) => applyStyle({ shadowOffsetY: v })} />
            <Slider label="Blur" value={style.shadowBlur} min={0} max={30} onChange={(v) => applyStyle({ shadowBlur: v })} />
            <div className="space-y-1">
              <label className="text-label text-text-body">Shadow Color</label>
              <ColorPicker value={style.shadowColor} onChange={(color) => applyStyle({ shadowColor: color })} recentColors={recentColors} />
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
            checked={style.strokeEnabled}
            onChange={(checked) => applyStyle({ strokeEnabled: checked })}
          />
        </div>
        {style.strokeEnabled && (
          <div className="space-y-3 pl-1">
            <Slider label="Width" value={style.strokeWidth} min={0} max={10} step={0.5} onChange={(v) => applyStyle({ strokeWidth: v })} />
            <div className="space-y-1">
              <label className="text-label text-text-body">Stroke Color</label>
              <ColorPicker value={style.strokeColor} onChange={(color) => applyStyle({ strokeColor: color })} recentColors={recentColors} />
            </div>
          </div>
        )}
      </div>

      {/* Spacing */}
      <div className="space-y-3 border-t border-border pt-3">
        <Slider label="Letter Spacing" value={style.letterSpacing} min={-5} max={20} onChange={(v) => applyStyle({ letterSpacing: v })} />
        <Slider label="Line Height" value={style.lineHeight} min={0.8} max={3} step={0.1} onChange={(v) => applyStyle({ lineHeight: v })} />
        <Slider label="Opacity" value={opacityPercent} min={0} max={100} onChange={handleOpacityChange} valueFormatter={(v) => `${v}%`} />
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 pt-2 border-t border-border">
        <Button variant="primary" size="sm" icon={Plus} fullWidth onClick={handleAddText}>
          Add Text
        </Button>
        {hasSelection && (
          <Button variant="danger" size="sm" icon={Trash2} onClick={() => setShowDeleteConfirm(true)}>
            Delete
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Text Layer"
        message={`Are you sure you want to delete "${selectedTextLayer?.name ?? 'this text layer'}"?`}
        confirmLabel="Delete Text Layer"
        variant="danger"
        onConfirm={confirmDeleteSelected}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
