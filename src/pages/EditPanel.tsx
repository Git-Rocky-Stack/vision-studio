import { useState } from 'react';
import { cn } from '@/utils/cn';
import { 
  Wand2, 
  Sliders, 
  Crop, 
  Type, 
  Layers,
  Sparkles,
  Palette,
  Contrast,
  Sun,
  Droplets
} from 'lucide-react';
import { Slider } from '@/components/ui/Slider';
import { motion } from 'framer-motion';

type EditTool = 'adjust' | 'filters' | 'crop' | 'text';

export function EditPanel() {
  const [activeTool, setActiveTool] = useState<EditTool>('adjust');
  
  // Adjustment values
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [blur, setBlur] = useState(0);

  const tools = [
    { id: 'adjust' as EditTool, label: 'Adjust', icon: Sliders },
    { id: 'filters' as EditTool, label: 'Filters', icon: Sparkles },
    { id: 'crop' as EditTool, label: 'Crop', icon: Crop },
    { id: 'text' as EditTool, label: 'Text', icon: Type },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Tool Tabs */}
      <div className="p-2 border-b border-border">
        <div className="grid grid-cols-4 gap-1">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                onClick={() => setActiveTool(tool.id)}
                className={cn(
                  'flex flex-col items-center gap-1 p-2 rounded-lg transition-all',
                  activeTool === tool.id
                    ? 'bg-red/10 text-red border border-red/30'
                    : 'text-silver hover:text-white hover:bg-charcoal-lighter'
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="text-xs">{tool.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tool Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTool === 'adjust' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="flex items-center gap-2 mb-4">
              <Sun className="w-4 h-4 text-red" />
              <h3 className="text-sm font-medium text-white">Basic Adjustments</h3>
            </div>

            <Slider
              label="Brightness"
              value={brightness}
              min={0}
              max={200}
              onChange={setBrightness}
              valueFormatter={(v) => `${v}%`}
            />

            <Slider
              label="Contrast"
              value={contrast}
              min={0}
              max={200}
              onChange={setContrast}
              valueFormatter={(v) => `${v}%`}
            />

            <Slider
              label="Saturation"
              value={saturation}
              min={0}
              max={200}
              onChange={setSaturation}
              valueFormatter={(v) => `${v}%`}
            />

            <div className="flex items-center gap-2 mb-4 mt-8">
              <Wand2 className="w-4 h-4 text-red" />
              <h3 className="text-sm font-medium text-white">Effects</h3>
            </div>

            <Slider
              label="Blur"
              value={blur}
              min={0}
              max={20}
              onChange={setBlur}
              valueFormatter={(v) => `${v}px`}
            />

            <div className="pt-4 border-t border-border">
              <button className="w-full py-2 text-sm text-silver hover:text-white transition-all">
                Reset All Adjustments
              </button>
            </div>
          </motion.div>
        )}

        {activeTool === 'filters' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-2 mb-4">
              <Palette className="w-4 h-4 text-red" />
              <h3 className="text-sm font-medium text-white">AI Filters</h3>
            </div>

            {[
              { name: 'Cinematic', desc: 'Movie-like color grading' },
              { name: 'Vintage', desc: 'Retro film look' },
              { name: 'Cyberpunk', desc: 'Neon futuristic style' },
              { name: 'Noir', desc: 'Black and white dramatic' },
              { name: 'Dreamy', desc: 'Soft ethereal glow' },
              { name: 'Vibrant', desc: 'Enhanced saturation' },
            ].map((filter) => (
              <button
                key={filter.name}
                className="w-full p-3 rounded-lg bg-charcoal-lighter border border-border hover:border-border-hover transition-all text-left group"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-white group-hover:text-red transition-colors">
                      {filter.name}
                    </h4>
                    <p className="text-xs text-silver mt-0.5">{filter.desc}</p>
                  </div>
                  <div className="w-8 h-8 rounded bg-charcoal border border-border" />
                </div>
              </button>
            ))}
          </motion.div>
        )}

        {activeTool === 'crop' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-2 mb-4">
              <Crop className="w-4 h-4 text-red" />
              <h3 className="text-sm font-medium text-white">Crop & Rotate</h3>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {['Freeform', 'Square', '16:9', '9:16', '4:3', '3:4'].map((ratio) => (
                <button
                  key={ratio}
                  className="p-3 rounded-lg bg-charcoal-lighter border border-border hover:border-border-hover transition-all text-center"
                >
                  <span className="text-sm text-white">{ratio}</span>
                </button>
              ))}
            </div>

            <div className="pt-4 border-t border-border space-y-4">
              <Slider
                label="Rotation"
                value={0}
                min={-180}
                max={180}
                onChange={() => {}}
                valueFormatter={(v) => `${v}°`}
              />

              <Slider
                label="Zoom"
                value={100}
                min={50}
                max={200}
                onChange={() => {}}
                valueFormatter={(v) => `${v}%`}
              />
            </div>
          </motion.div>
        )}

        {activeTool === 'text' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-2 mb-4">
              <Type className="w-4 h-4 text-red" />
              <h3 className="text-sm font-medium text-white">Text Overlay</h3>
            </div>

            <textarea
              placeholder="Enter your text..."
              rows={3}
              className="w-full bg-charcoal border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-silver/50 focus:border-red focus:ring-1 focus:ring-red resize-none"
            />

            <div className="space-y-2">
              <label className="text-xs text-silver">Font</label>
              <select className="w-full bg-charcoal border border-border rounded-lg px-3 py-2 text-sm text-white">
                <option>Inter</option>
                <option>Playfair Display</option>
                <option>JetBrains Mono</option>
                <option>Bebas Neue</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-silver">Size</label>
              <input
                type="range"
                min="12"
                max="120"
                defaultValue="24"
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button className="p-2 rounded-lg bg-red text-white text-sm font-medium">
                Add Text
              </button>
              <button className="p-2 rounded-lg bg-charcoal-lighter text-silver text-sm hover:text-white transition-all">
                AI Generate
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
