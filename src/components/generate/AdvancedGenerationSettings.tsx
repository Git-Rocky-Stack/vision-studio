import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import { Slider } from '@/components/ui/Slider';
import { Settings2, ChevronDown, Dice5 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const SCHEDULERS = [
  'Euler',
  'Euler a',
  'DPM++ 2M',
  'DPM++ 2M Karras',
  'DPM++ SDE',
  'DPM++ SDE Karras',
  'DDIM',
  'UniPC',
];

interface AdvancedGenerationSettingsProps {
  collapsed?: boolean;
}

export function AdvancedGenerationSettings({
  collapsed = false,
}: AdvancedGenerationSettingsProps) {
  const {
    advancedGeneration,
    updateAdvancedGeneration,
    showAdvancedGeneration,
    setShowAdvancedGeneration,
  } = useAppStore();

  const generationType = advancedGeneration.generationType;

  const randomizeSeed = () =>
    updateAdvancedGeneration({ seed: Math.floor(Math.random() * 2147483647) });

  return (
    <div>
      <button
        onClick={() => setShowAdvancedGeneration(!showAdvancedGeneration)}
        aria-expanded={showAdvancedGeneration}
        className={cn(
          'flex items-center gap-2 text-label text-text-body hover:text-text-primary transition-all w-full',
          collapsed && 'justify-center'
        )}
      >
        <Settings2 className="w-4 h-4 flex-shrink-0" />
        {!collapsed && (
          <>
            <span>Advanced Settings</span>
            <motion.div
              animate={{ rotate: showAdvancedGeneration ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              className="ml-auto"
            >
              <ChevronDown className="w-4 h-4" />
            </motion.div>
          </>
        )}
      </button>

      <AnimatePresence initial={false}>
        {showAdvancedGeneration && !collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="pt-4 space-y-4">
              {generationType === 'image' ? (
                <>
                  <Slider
                    label="Sampling Steps"
                    value={advancedGeneration.steps}
                    min={1}
                    max={50}
                    onChange={(v) => updateAdvancedGeneration({ steps: v })}
                  />
                  <Slider
                    label="CFG Scale"
                    value={advancedGeneration.cfgScale}
                    min={1}
                    max={20}
                    step={0.5}
                    onChange={(v) => updateAdvancedGeneration({ cfgScale: v })}
                  />

                  {/* Scheduler */}
                  <div className="space-y-1.5">
                    <label className="text-label text-text-body">Scheduler</label>
                    <select
                      value={advancedGeneration.scheduler}
                      onChange={(e) => updateAdvancedGeneration({ scheduler: e.target.value })}
                      className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm font-display text-text-primary focus:border-red-primary focus:ring-1 focus:ring-red-primary/40 transition-all"
                    >
                      {SCHEDULERS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Clip Skip */}
                  <div className="space-y-1.5">
                    <label className="text-label text-text-body">CLIP Skip</label>
                    <div className="flex gap-2">
                      {[1, 2].map((v) => (
                        <button
                          key={v}
                          onClick={() => updateAdvancedGeneration({ clipSkip: v })}
                          className={cn(
                            'flex-1 py-2 rounded-lg text-sm font-mono font-medium transition-all',
                            advancedGeneration.clipSkip === v
                              ? 'bg-red-primary text-text-primary glow-red-subtle'
                              : 'bg-elevated text-text-body border border-border hover:border-border-hover'
                          )}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Seed */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-label text-text-body">Seed</label>
                      <button
                        onClick={randomizeSeed}
                        className="p-1 rounded text-text-muted hover:text-red-primary transition-all"
                        title="Randomize"
                      >
                        <Dice5 className="w-4 h-4" />
                      </button>
                    </div>
                    <input
                      type="number"
                      value={advancedGeneration.seed}
                      onChange={(e) => updateAdvancedGeneration({ seed: Number(e.target.value) })}
                      className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-text-primary font-mono text-sm focus:border-red-primary focus:ring-1 focus:ring-red-primary/40 transition-all"
                    />
                    <p className="text-xs text-text-muted font-mono">
                      Use -1 for random seed
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <Slider
                    label="Duration"
                    value={advancedGeneration.duration}
                    min={1}
                    max={10}
                    onChange={(v) => updateAdvancedGeneration({ duration: v })}
                    valueFormatter={(v) => `${v}s`}
                  />
                  <Slider
                    label="Frame Rate"
                    value={advancedGeneration.fps}
                    min={12}
                    max={60}
                    onChange={(v) => updateAdvancedGeneration({ fps: v })}
                    valueFormatter={(v) => `${v}fps`}
                  />
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
