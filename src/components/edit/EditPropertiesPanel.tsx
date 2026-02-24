import { useState } from 'react';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import { Slider } from '@/components/ui/Slider';
import type { ImageAdjustments } from '@/types/editor';
import {
  Sun,
  Contrast,
  Droplets,
  Thermometer,
  Sparkles,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Layers,
  Palette,
  Wand2,
  RotateCcw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type PropertiesTab = 'adjustments' | 'filters' | 'layers';

interface FilterDef {
  name: string;
  desc: string;
  color: string;
}

const AI_FILTERS: FilterDef[] = [
  { name: 'Cinematic', desc: 'Movie-like color grading', color: '#e63946' },
  { name: 'Vintage', desc: 'Retro film look', color: '#f4a261' },
  { name: 'Cyberpunk', desc: 'Neon futuristic style', color: '#6c5ce7' },
  { name: 'Noir', desc: 'Black and white dramatic', color: '#636e72' },
  { name: 'Dreamy', desc: 'Soft ethereal glow', color: '#a8dadc' },
  { name: 'Vibrant', desc: 'Enhanced saturation', color: '#ff6b6b' },
  { name: 'Moody', desc: 'Dark atmospheric tones', color: '#2d3436' },
  { name: 'Film Grain', desc: 'Classic analog texture', color: '#d4a574' },
];

const ADJUSTMENT_GROUPS: {
  title: string;
  icon: React.ElementType;
  fields: { key: keyof ImageAdjustments; label: string; min: number; max: number }[];
}[] = [
  {
    title: 'Light',
    icon: Sun,
    fields: [
      { key: 'exposure', label: 'Exposure', min: -100, max: 100 },
      { key: 'brightness', label: 'Brightness', min: -100, max: 100 },
      { key: 'contrast', label: 'Contrast', min: -100, max: 100 },
      { key: 'highlights', label: 'Highlights', min: -100, max: 100 },
      { key: 'shadows', label: 'Shadows', min: -100, max: 100 },
      { key: 'whites', label: 'Whites', min: -100, max: 100 },
      { key: 'blacks', label: 'Blacks', min: -100, max: 100 },
    ],
  },
  {
    title: 'Color',
    icon: Palette,
    fields: [
      { key: 'saturation', label: 'Saturation', min: -100, max: 100 },
      { key: 'temperature', label: 'Temperature', min: -100, max: 100 },
      { key: 'tint', label: 'Tint', min: -100, max: 100 },
    ],
  },
  {
    title: 'Detail',
    icon: Sparkles,
    fields: [
      { key: 'sharpness', label: 'Sharpness', min: 0, max: 100 },
      { key: 'noiseReduction', label: 'Noise Reduction', min: 0, max: 100 },
    ],
  },
  {
    title: 'Effects',
    icon: Wand2,
    fields: [
      { key: 'blur', label: 'Blur', min: 0, max: 100 },
      { key: 'vignette', label: 'Vignette', min: 0, max: 100 },
      { key: 'grain', label: 'Grain', min: 0, max: 100 },
    ],
  },
];

export function EditPropertiesPanel() {
  const {
    imageAdjustments,
    setImageAdjustments,
    resetImageAdjustments,
    editLayers,
    updateEditLayer,
  } = useAppStore();
  const [activeTab, setActiveTab] = useState<PropertiesTab>('adjustments');
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['Light', 'Color']);

  const toggleGroup = (title: string) => {
    setExpandedGroups((prev) =>
      prev.includes(title) ? prev.filter((g) => g !== title) : [...prev, title]
    );
  };

  const tabs: { id: PropertiesTab; label: string; icon: React.ElementType }[] = [
    { id: 'adjustments', label: 'Adjust', icon: Sun },
    { id: 'filters', label: 'Filters', icon: Sparkles },
    { id: 'layers', label: 'Layers', icon: Layers },
  ];

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Tabs */}
      <div className="p-2 border-b border-border">
        <div className="grid grid-cols-3 gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex flex-col items-center gap-1 p-2 rounded-lg transition-all font-display text-xs',
                  activeTab === tab.id
                    ? 'bg-red-aura text-red-primary'
                    : 'text-text-body hover:text-text-primary hover:bg-elevated'
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <AnimatePresence mode="wait">
          {activeTab === 'adjustments' && (
            <motion.div
              key="adjustments"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {ADJUSTMENT_GROUPS.map((group) => {
                const Icon = group.icon;
                const isExpanded = expandedGroups.includes(group.title);
                return (
                  <div key={group.title}>
                    <button
                      onClick={() => toggleGroup(group.title)}
                      className="flex items-center gap-2 w-full text-left mb-3"
                    >
                      <Icon className="w-3.5 h-3.5 text-red-primary" />
                      <span className="text-label text-text-primary">{group.title}</span>
                    </button>
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden space-y-4 pl-1"
                        >
                          {group.fields.map((field) => (
                            <Slider
                              key={field.key}
                              label={field.label}
                              value={imageAdjustments[field.key]}
                              min={field.min}
                              max={field.max}
                              onChange={(v) => setImageAdjustments({ [field.key]: v })}
                            />
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}

              <div className="pt-4 border-t border-border">
                <button
                  onClick={resetImageAdjustments}
                  className="flex items-center gap-2 w-full py-2 text-sm text-text-muted hover:text-text-primary transition-all font-display justify-center"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset All Adjustments
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === 'filters' && (
            <motion.div
              key="filters"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-3.5 h-3.5 text-red-primary" />
                <span className="text-label text-text-primary">AI Filters</span>
              </div>

              {AI_FILTERS.map((filter) => (
                <button
                  key={filter.name}
                  className="w-full p-3 rounded-lg bg-elevated border border-border hover:border-border-hover transition-all text-left group"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex-shrink-0"
                      style={{
                        background: `linear-gradient(135deg, ${filter.color}, ${filter.color}80)`,
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-display font-medium text-text-primary group-hover:text-red-primary transition-colors">
                        {filter.name}
                      </h4>
                      <p className="text-xs text-text-muted">{filter.desc}</p>
                    </div>
                  </div>
                </button>
              ))}
            </motion.div>
          )}

          {activeTab === 'layers' && (
            <motion.div
              key="layers"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-2"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-red-primary" />
                  <span className="text-label text-text-primary">Layers</span>
                </div>
                <span className="font-mono text-xs text-text-muted">
                  {editLayers.length}
                </span>
              </div>

              {editLayers.length === 0 ? (
                <div className="py-12 text-center">
                  <Layers className="w-10 h-10 text-text-muted mx-auto mb-3 opacity-30" />
                  <p className="text-sm text-text-muted font-display">No layers yet</p>
                  <p className="text-xs text-text-muted mt-1">
                    Load an image to start editing
                  </p>
                </div>
              ) : (
                editLayers.map((layer) => (
                  <div
                    key={layer.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg bg-elevated border border-border group"
                  >
                    <div className="w-8 h-8 rounded bg-surface border border-border flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary font-display truncate">
                        {layer.name}
                      </p>
                      <p className="font-mono text-[10px] text-text-muted">
                        {layer.type} &middot; {Math.round(layer.opacity * 100)}%
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() =>
                          updateEditLayer(layer.id, { visible: !layer.visible })
                        }
                        className="p-1 rounded text-text-muted hover:text-text-primary transition-all"
                      >
                        {layer.visible ? (
                          <Eye className="w-3.5 h-3.5" />
                        ) : (
                          <EyeOff className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        onClick={() =>
                          updateEditLayer(layer.id, { locked: !layer.locked })
                        }
                        className="p-1 rounded text-text-muted hover:text-text-primary transition-all"
                      >
                        {layer.locked ? (
                          <Lock className="w-3.5 h-3.5" />
                        ) : (
                          <Unlock className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
