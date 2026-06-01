import { useAppStore } from '@/store/appStore';
import { useShallow } from 'zustand/react/shallow';
import { Slider } from '@/components/ui/Slider';
import { Dice5 } from 'lucide-react';

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

export function AdvancedGenerationSettings() {
  const {
    advancedGeneration,
    updateAdvancedGeneration,
  } = useAppStore(
    useShallow((s) => ({
      advancedGeneration: s.advancedGeneration,
      updateAdvancedGeneration: s.updateAdvancedGeneration,
    }))
  );

  const generationType = advancedGeneration.generationType;

  const randomizeSeed = () =>
    updateAdvancedGeneration({ seed: Math.floor(Math.random() * 2147483647) });

  return (
    <div className="space-y-4">
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

          <div className="space-y-1.5">
            <label className="text-label text-text-body">Scheduler</label>
            <select
              value={advancedGeneration.scheduler}
              onChange={(e) => updateAdvancedGeneration({ scheduler: e.target.value })}
              className="w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/40 transition-all"
            >
              {SCHEDULERS.map((scheduler) => (
                <option key={scheduler} value={scheduler}>
                  {scheduler}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-label text-text-body">CLIP Skip</label>
            <div className="flex gap-2">
              {[1, 2].map((value) => (
                <button
                  key={value}
                  onClick={() => updateAdvancedGeneration({ clipSkip: value })}
                  className={
                    advancedGeneration.clipSkip === value
                      ? 'flex-1 py-2 rounded-md data-mono font-medium transition-all bg-accent-primary text-void shadow-accent-subtle'
                      : 'flex-1 py-2 rounded-md data-mono font-medium transition-all bg-elevated text-text-body border border-border hover:border-border-hover'
                  }
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-label text-text-body">Seed</label>
              <button
                onClick={randomizeSeed}
                className="p-1 rounded text-text-muted hover:text-accent-primary transition-all"
                title="Randomize"
              >
                <Dice5 className="w-4 h-4" />
              </button>
            </div>
            <input
              type="number"
              value={advancedGeneration.seed}
              onChange={(e) => updateAdvancedGeneration({ seed: Number(e.target.value) })}
              className="w-full bg-elevated border border-border rounded-md px-3 py-2 data-mono text-text-primary focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/40 transition-all"
            />
            <p className="text-xs text-text-muted">
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
  );
}
