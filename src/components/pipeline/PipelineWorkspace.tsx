import { memo } from 'react';
import { Plus, Workflow } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/appStore';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PipelineBuilder } from './PipelineBuilder';

/**
 * Pipelines sub-mode: a picker over every pipeline (built-in and user) that
 * drives activePipelineId, and the builder for the picked one. Subscribed
 * reactively, so creating, deleting or switching pipelines re-renders.
 */
export const PipelineWorkspace = memo(function PipelineWorkspace() {
  const { pipelines, activePipelineId, setActivePipelineId, createPipeline } = useAppStore(
    useShallow((s) => ({
      pipelines: s.pipelines,
      activePipelineId: s.activePipelineId,
      setActivePipelineId: s.setActivePipelineId,
      createPipeline: s.createPipeline,
    })),
  );

  const active = pipelines.find((p) => p.id === activePipelineId) ?? pipelines[0] ?? null;

  const handleNew = () => {
    createPipeline({ name: 'New Pipeline', description: '', steps: [] });
    const created = useAppStore.getState().pipelines.at(-1);
    if (created) setActivePipelineId(created.id);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <label htmlFor="pipeline-picker" className="mono-label text-text-muted">
          Pipeline
        </label>
        <select
          id="pipeline-picker"
          value={active?.id ?? ''}
          onChange={(e) => setActivePipelineId(e.target.value || null)}
          disabled={pipelines.length === 0}
          className="recessed-well min-w-0 flex-1 px-2 py-1 text-sm text-text-primary"
        >
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.isBuiltIn ? `${p.name} (built-in)` : p.name}
            </option>
          ))}
        </select>
        <Button variant="secondary" size="xs" icon={Plus} onClick={handleNew}>
          New
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        {active ? (
          <PipelineBuilder key={active.id} pipeline={active} />
        ) : (
          <EmptyState
            icon={Workflow}
            title="No pipelines available"
            description="Create a pipeline to chain edit steps."
          />
        )}
      </div>
    </div>
  );
});
