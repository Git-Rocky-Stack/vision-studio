import { useAppStore } from '@/store/appStore';
import { cn } from '@/utils/cn';

function formatLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatTimestamp(value: string) {
  const [date, time] = value.split('T');

  return time ? `${date} ${time.slice(0, 5)}` : value;
}

export function WorkflowWorkbench() {
  const { workflowRecords, activeWorkflowId, setActiveWorkflow } = useAppStore();
  const activeWorkflow =
    workflowRecords.find((workflow) => workflow.id === activeWorkflowId) ?? workflowRecords[0];

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(220px,280px)_minmax(0,1fr)_minmax(260px,320px)] bg-void">
      <aside className="flex min-h-0 flex-col border-r border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <h2 className="type-title">Workflow</h2>
          <p className="mt-1 type-section">{activeWorkflow.name}</p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-4 py-4">
          <div>
            <p className="type-ui text-text-muted">Status</p>
            <span className="mt-2 inline-flex rounded-md border border-accent-primary-border bg-accent-primary-muted px-2.5 py-1 type-ui text-accent-primary">
              {formatLabel(activeWorkflow.status)}
            </span>
          </div>

          <div>
            <p className="type-ui text-text-muted">Profile</p>
            <p className="mt-2 type-section">{activeWorkflow.profile}</p>
            <p className="mt-1 type-caption">{activeWorkflow.summary}</p>
          </div>

          <div>
            <p className="type-ui text-text-muted">Description</p>
            <p className="mt-2 type-caption">
              {activeWorkflow.description || 'No description yet.'}
            </p>
          </div>

          <div>
            <p className="type-ui text-text-muted">Tags</p>
            {activeWorkflow.tags.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {activeWorkflow.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md border border-border bg-elevated px-2 py-1 type-ui text-text-body"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 type-caption">No tags yet.</p>
            )}
          </div>

          <div>
            <p className="type-ui text-text-muted">Notes</p>
            <p className="mt-2 type-caption">{activeWorkflow.notes || 'No notes yet.'}</p>
          </div>

          <div>
            <p className="type-ui text-text-muted">Inputs</p>
            <div className="mt-2 space-y-2">
              {activeWorkflow.inputs.map((input) => (
                <div key={input} className="rounded-md border border-border bg-elevated px-3 py-2">
                  <p className="type-ui text-text-primary">{input}</p>
                  <p className="mt-1 type-caption">Uses current workbench context.</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>

      <main className="flex min-h-0 flex-col">
        <div className="border-b border-border bg-surface px-5 py-3">
          <p className="type-caption">Run Plan</p>
          <h3 className="mt-1 type-section">Linear execution path</h3>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-5">
          <ol aria-label="Workflow run plan" className="flex flex-col gap-3">
            {activeWorkflow.steps.map((step, index) => (
              <li
                key={step.label}
                className="grid grid-cols-[2.5rem_minmax(0,1fr)_5rem] items-start gap-3 rounded-md border border-border bg-surface px-3 py-3"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-elevated type-meta text-text-body">
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block type-section">{step.label}</span>
                  <span className="mt-1 block type-caption">{step.detail}</span>
                </span>
                <span className="justify-self-end rounded-md border border-border bg-elevated px-2 py-1 type-ui text-text-body">
                  {formatLabel(step.state)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </main>

      <aside className="flex min-h-0 flex-col border-l border-border bg-surface">
        <section className="flex min-h-0 flex-1 flex-col border-b border-border">
          <div className="border-b border-border px-4 py-3">
            <h3 className="type-section">Workflow Library</h3>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-3">
            <div className="flex flex-col gap-2">
              {workflowRecords.map((workflow) => {
                const isActive = workflow.id === activeWorkflow.id;

                return (
                  <button
                    key={workflow.id}
                    type="button"
                    onClick={() => setActiveWorkflow(workflow.id)}
                    className={cn(
                      'rounded-md border px-3 py-2 text-left type-ui transition-all hover:border-border-hover hover:text-text-primary',
                      isActive
                        ? 'border-accent-primary-border bg-accent-primary-muted text-accent-primary'
                        : 'border-border bg-elevated text-text-body'
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
            <h3 className="type-section">Run Output</h3>
          </div>
          <div
            className={cn(
              'min-h-0 flex-1',
              activeWorkflow.runHistory.length > 0
                ? 'overflow-auto p-3'
                : 'flex items-center justify-center px-4 text-center'
            )}
          >
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
            ) : (
              <p className="type-caption">No run output yet.</p>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}
