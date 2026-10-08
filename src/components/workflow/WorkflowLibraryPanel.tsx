import { useShallow } from 'zustand/react/shallow';

import { useAppStore } from '@/store/appStore';
import { cn } from '@/utils/cn';
import { formatLabel, formatTimestamp } from '@/utils/formatUtils';

interface WorkflowLibraryPanelProps {
  /**
   * True when the panel is the Workflows tab's left dock rather than a column
   * inside the workbench. A docked panel is the first thing on the page, so it
   * carries the page heading and its sections sit one level higher.
   */
  docked?: boolean;
  className?: string;
}

/**
 * The saved workflows and the run output of the active one.
 *
 * Everything here is read from the store, so the same panel can sit inside the
 * workbench (Generate tab, where the left dock holds the Generate settings) or
 * in the left dock (Workflows tab) and stay in step with the graph editor.
 */
export function WorkflowLibraryPanel({ docked = false, className }: WorkflowLibraryPanelProps) {
  const { workflowRecords, activeWorkflowId, setActiveWorkflow, workflowRuntimeById } = useAppStore(
    useShallow((s) => ({
      workflowRecords: s.workflowRecords,
      activeWorkflowId: s.activeWorkflowId,
      setActiveWorkflow: s.setActiveWorkflow,
      workflowRuntimeById: s.workflowRuntimeById,
    })),
  );

  const activeWorkflow =
    workflowRecords.find((workflow) => workflow.id === activeWorkflowId) ?? workflowRecords[0];
  const activeJobId = workflowRuntimeById[activeWorkflow.id]?.activeJobId ?? null;
  const isRunning = activeWorkflow.status === 'running' || Boolean(activeJobId);
  const hasRunOutput = activeWorkflow.runHistory.length > 0 || isRunning;
  const SectionHeading = docked ? 'h2' : 'h3';

  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-surface', className)}>
      {docked ? <h1 className="sr-only">Workflows</h1> : null}

      <section className="flex min-h-0 flex-1 flex-col border-b border-border">
        <div className="border-b border-border px-4 py-3">
          <SectionHeading className="type-section">Workflow Library</SectionHeading>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <div className="flex flex-col gap-2">
            {workflowRecords.map((workflow) => {
              const isActive = workflow.id === activeWorkflow.id;

              return (
                <button
                  key={workflow.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setActiveWorkflow(workflow.id)}
                  className={cn(
                    'rounded-md border px-3 py-2 text-left type-ui transition hover:border-border-hover hover:text-text-primary',
                    isActive
                      ? 'border-accent-primary-border bg-accent-primary-muted text-accent-primary'
                      : 'border-border bg-elevated text-text-body',
                  )}
                >
                  {workflow.name}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-border px-4 py-3">
          <SectionHeading className="type-section">Run Output</SectionHeading>
        </div>
        <div
          className={cn(
            'min-h-0 flex-1',
            hasRunOutput ? 'overflow-auto p-3' : 'flex items-center justify-center px-4 text-center',
          )}
        >
          {hasRunOutput ? (
            <div className="flex flex-col gap-2">
              {isRunning ? (
                <div className="rounded-md border border-accent-primary-border bg-accent-primary-muted px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 type-ui text-accent-primary">Workflow run in progress</p>
                    <span className="shrink-0 rounded-md border border-accent-primary-border bg-surface px-2 py-1 type-ui text-accent-primary">
                      Running
                    </span>
                  </div>
                  {activeJobId ? <p className="mt-2 type-caption text-text-body">Job {activeJobId}</p> : null}
                </div>
              ) : null}
              {activeWorkflow.runHistory.length > 0 ? (
                <ul aria-label="Workflow run history" className="flex flex-col gap-2">
                  {activeWorkflow.runHistory.map((run) => (
                    <li key={run.id} className="rounded-md border border-border bg-elevated px-3 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 type-ui text-text-primary">{run.summary}</p>
                        <span className="shrink-0 rounded-md border border-border bg-surface px-2 py-1 type-ui text-text-body">
                          {formatLabel(run.status)}
                        </span>
                      </div>
                      <time dateTime={run.createdAt} className="mt-2 block type-caption">
                        {formatTimestamp(run.createdAt)}
                      </time>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className="type-caption">No run output yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
