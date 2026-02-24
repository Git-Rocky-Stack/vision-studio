import { useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/Button';
import { Slider } from '@/components/ui/Slider';
import {
  Layers,
  Plus,
  Trash2,
  Play,
  Pause,
  Sparkles,
  CheckCircle2,
  XCircle,
  Loader2,
  Download,
  Wand2,
  FileJson,
  GripVertical,
  Heart,
  ImageIcon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface BatchPrompt {
  id: string;
  prompt: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  result?: string;
  seed?: number;
}

export function BatchPanel() {
  const { addBatchJob, batchResults, toggleBatchResultFavorite } = useAppStore();
  const [prompts, setPrompts] = useState<BatchPrompt[]>([
    { id: '1', prompt: '', status: 'pending' },
  ]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Generation settings
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [steps, setSteps] = useState(25);
  const [cfgScale, setCfgScale] = useState(7.5);
  const [model, setModel] = useState('flux-dev');

  const addPrompt = () => {
    setPrompts([
      ...prompts,
      { id: crypto.randomUUID(), prompt: '', status: 'pending' },
    ]);
  };

  const removePrompt = (id: string) => {
    if (prompts.length > 1) {
      setPrompts(prompts.filter((p) => p.id !== id));
    }
  };

  const updatePrompt = (id: string, value: string) => {
    setPrompts(prompts.map((p) => (p.id === id ? { ...p, prompt: value } : p)));
  };

  const generateVariations = (basePrompt: string, count: number = 4) => {
    const modifiers = [
      'highly detailed, 8k resolution',
      'cinematic lighting, dramatic atmosphere',
      'vibrant colors, bold composition',
      'minimalist, clean design, subtle tones',
      'vintage style, film grain, nostalgic',
      'futuristic, neon lights, cyberpunk aesthetic',
      'natural lighting, soft shadows, realistic',
      'abstract, artistic interpretation, painterly',
    ];

    const newPrompts = Array.from({ length: count }, (_, i) => ({
      id: crypto.randomUUID(),
      prompt: `${basePrompt}, ${modifiers[i % modifiers.length]}`,
      status: 'pending' as const,
    }));

    setPrompts([...prompts, ...newPrompts]);
  };

  const handleStartBatch = async () => {
    const validPrompts = prompts.filter((p) => p.prompt.trim());
    if (validPrompts.length === 0) return;

    setIsGenerating(true);
    setPrompts(prompts.map((p) => (p.prompt.trim() ? { ...p, status: 'pending' } : p)));

    const batchId = crypto.randomUUID();
    addBatchJob({
      id: batchId,
      name: `Batch ${new Date().toLocaleTimeString()}`,
      prompts: validPrompts.map((p) => p.prompt),
      currentIndex: 0,
      completedJobs: [],
      failedJobs: [],
      status: 'running',
      createdAt: new Date(),
    });

    try {
      const result = await window.electron.generation.batch({
        prompts: validPrompts.map((p) => p.prompt),
        width,
        height,
        steps,
        cfg_scale: cfgScale,
        model,
      });

      if (result.success && result.jobIds) {
        let jobIndex = 0;
        setPrompts(
          prompts.map((p) => {
            if (p.prompt.trim() && jobIndex < result.jobIds!.length) {
              return { ...p, status: 'generating', id: result.jobIds![jobIndex++] };
            }
            return p;
          })
        );
        pollBatchProgress(result.jobIds);
      }
    } catch (error) {
      console.error('Batch generation failed:', error);
      setIsGenerating(false);
    }
  };

  const pollBatchProgress = async (jobIds: string[]) => {
    const checkInterval = setInterval(async () => {
      let allCompleted = true;
      const updatedPrompts = [...prompts];

      for (let i = 0; i < jobIds.length; i++) {
        try {
          const status = await window.electron.generation.getStatus(jobIds[i]);
          const promptIndex = updatedPrompts.findIndex((p) => p.id === jobIds[i]);

          if (promptIndex !== -1) {
            if (status.status === 'completed') {
              updatedPrompts[promptIndex].status = 'completed';
              updatedPrompts[promptIndex].result = status.result?.images?.[0];
            } else if (status.status === 'failed') {
              updatedPrompts[promptIndex].status = 'failed';
            } else {
              allCompleted = false;
            }
          }
        } catch (e) {
          console.error('Failed to get job status:', e);
        }
      }

      setPrompts(updatedPrompts);

      if (allCompleted) {
        clearInterval(checkInterval);
        setIsGenerating(false);
      }
    }, 1000);
  };

  const handleCancel = () => {
    setIsGenerating(false);
    prompts.forEach((p) => {
      if (p.status === 'generating') {
        window.electron.generation.cancel(p.id);
      }
    });
  };

  const handleExport = () => {
    const data = {
      prompts: prompts.map((p) => p.prompt).filter(Boolean),
      settings: { width, height, steps, cfgScale, model },
      createdAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch-prompts-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const completedCount = prompts.filter((p) => p.status === 'completed').length;
  const progress =
    prompts.length > 0 ? (completedCount / prompts.length) * 100 : 0;

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <Layers className="w-5 h-5 text-red-primary" />
          <h2 className="font-display text-lg font-semibold text-text-primary">
            Batch Generation
          </h2>
        </div>
        <p className="text-sm text-text-body">
          Generate multiple images at once with different prompts
        </p>
      </div>

      {/* Progress Bar */}
      {isGenerating && (
        <div className="px-4 py-3 border-b border-border bg-elevated">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-text-body font-display">
              Progress: {completedCount} / {prompts.length}
            </span>
            <span className="font-mono text-sm text-red-primary">
              {Math.round(progress)}%
            </span>
          </div>
          <div className="h-1.5 bg-void rounded-full overflow-hidden border border-border">
            <motion.div
              className="h-full rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
              style={{
                background: 'linear-gradient(90deg, #c1121f, #e63946)',
                boxShadow: '0 0 8px rgba(230, 57, 70, 0.4)',
              }}
            />
          </div>
        </div>
      )}

      {/* Prompts List */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-3">
          <AnimatePresence>
            {prompts.map((prompt, index) => (
              <motion.div
                key={prompt.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className={cn(
                  'relative p-3 rounded-lg border transition-all',
                  prompt.status === 'generating' &&
                    'border-yellow-500/30 bg-yellow-500/5',
                  prompt.status === 'completed' &&
                    'border-green-500/30 bg-green-500/5',
                  prompt.status === 'failed' &&
                    'border-red-primary/30 bg-red-primary/5',
                  prompt.status === 'pending' && 'border-border bg-elevated'
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Drag handle */}
                  <div className="flex flex-col items-center gap-1 pt-2">
                    <GripVertical className="w-3.5 h-3.5 text-text-muted cursor-grab" />
                    <span className="font-mono text-[10px] text-text-muted">
                      {index + 1}
                    </span>
                  </div>

                  {/* Input */}
                  <div className="flex-1">
                    <textarea
                      value={prompt.prompt}
                      onChange={(e) => updatePrompt(prompt.id, e.target.value)}
                      placeholder="Enter prompt..."
                      disabled={isGenerating}
                      rows={2}
                      className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-red-primary focus:ring-1 focus:ring-red-primary/40 resize-none disabled:opacity-50"
                    />
                  </div>

                  {/* Status/Actions */}
                  <div className="flex flex-col gap-1 pt-1">
                    {prompt.status === 'generating' && (
                      <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />
                    )}
                    {prompt.status === 'completed' && (
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                    )}
                    {prompt.status === 'failed' && (
                      <XCircle className="w-4 h-4 text-red-primary" />
                    )}

                    {!isGenerating && (
                      <button
                        onClick={() => removePrompt(prompt.id)}
                        className="p-1 rounded text-text-muted hover:text-red-primary hover:bg-red-aura transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Add Buttons */}
        {!isGenerating && (
          <div className="flex gap-2 mt-4">
            <Button variant="secondary" size="sm" icon={Plus} onClick={addPrompt}>
              Add Prompt
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={Wand2}
              onClick={() => {
                const lastPrompt = prompts[prompts.length - 1]?.prompt || '';
                if (lastPrompt) generateVariations(lastPrompt);
              }}
            >
              Generate Variations
            </Button>
          </div>
        )}
      </div>

      {/* Settings */}
      <div className="border-t border-border">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="w-full flex items-center justify-between p-4 text-sm text-text-body hover:text-text-primary transition-all font-display"
        >
          <span className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Generation Settings
          </span>
          <span className="font-mono text-xs text-text-muted">
            {width}&times;{height} &middot; {steps} steps
          </span>
        </button>

        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              exit={{ height: 0 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-label text-text-body mb-1 block">
                      Width
                    </label>
                    <select
                      value={width}
                      onChange={(e) => setWidth(Number(e.target.value))}
                      className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text-primary font-mono"
                    >
                      <option value={512}>512px</option>
                      <option value={768}>768px</option>
                      <option value={1024}>1024px</option>
                      <option value={1280}>1280px</option>
                      <option value={1920}>1920px</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-label text-text-body mb-1 block">
                      Height
                    </label>
                    <select
                      value={height}
                      onChange={(e) => setHeight(Number(e.target.value))}
                      className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text-primary font-mono"
                    >
                      <option value={512}>512px</option>
                      <option value={768}>768px</option>
                      <option value={1024}>1024px</option>
                      <option value={1280}>1280px</option>
                      <option value={1920}>1920px</option>
                    </select>
                  </div>
                </div>

                <Slider
                  label="Steps"
                  value={steps}
                  min={10}
                  max={50}
                  onChange={setSteps}
                />

                <Slider
                  label="CFG Scale"
                  value={cfgScale}
                  min={1}
                  max={20}
                  step={0.5}
                  onChange={setCfgScale}
                />

                <div>
                  <label className="text-label text-text-body mb-1 block">
                    Model
                  </label>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text-primary font-display"
                  >
                    <option value="flux-dev">FLUX.1 [dev]</option>
                    <option value="flux-schnell">FLUX.1 [schnell]</option>
                    <option value="sdxl">Stable Diffusion XL</option>
                    <option value="sd-1-5">Stable Diffusion 1.5</option>
                  </select>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-border flex gap-2">
        {isGenerating ? (
          <Button variant="danger" icon={Pause} fullWidth onClick={handleCancel}>
            Cancel Batch
          </Button>
        ) : (
          <>
            <Button variant="secondary" icon={FileJson} onClick={handleExport}>
              Export
            </Button>
            <Button
              variant="cinema"
              icon={Play}
              fullWidth
              onClick={handleStartBatch}
              disabled={!prompts.some((p) => p.prompt.trim())}
            >
              Start Batch ({prompts.filter((p) => p.prompt.trim()).length})
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
