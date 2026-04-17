const workflowSteps = [
  {
    label: 'Prompt',
    detail: 'Collect prompt, negative prompt, and references.',
    state: 'Ready',
  },
  {
    label: 'Model',
    detail: 'Use the selected generation profile.',
    state: 'Ready',
  },
  {
    label: 'Generate',
    detail: 'Queue the image generation run.',
    state: 'Pending',
  },
  {
    label: 'Review',
    detail: 'Send output to Viewer for comparison.',
    state: 'Pending',
  },
  {
    label: 'Save',
    detail: 'Capture accepted output to Boards and Gallery.',
    state: 'Pending',
  },
];

const workflowPresets = ['Text to image', 'Storyboard frame', 'Edit refinement'];

export function WorkflowWorkbench() {
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(220px,280px)_minmax(0,1fr)_minmax(260px,320px)] bg-void">
      <aside className="flex min-h-0 flex-col border-r border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <h2 className="type-title">Workflow</h2>
          <p className="mt-1 type-section">Image generation baseline</p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-4 py-4">
          <div>
            <p className="type-ui text-text-muted">Status</p>
            <span className="mt-2 inline-flex rounded-md border border-accent-primary-border bg-accent-primary-muted px-2.5 py-1 type-ui text-accent-primary">
              Draft
            </span>
          </div>

          <div>
            <p className="type-ui text-text-muted">Profile</p>
            <p className="mt-2 type-section">Balanced image run</p>
            <p className="mt-1 type-caption">1024 x 1024, 25 steps, CFG 7.5</p>
          </div>

          <div>
            <p className="type-ui text-text-muted">Inputs</p>
            <div className="mt-2 space-y-2">
              <div className="rounded-md border border-border bg-elevated px-3 py-2">
                <p className="type-ui text-text-primary">Prompt</p>
                <p className="mt-1 type-caption">Uses the active Generate prompt.</p>
              </div>
              <div className="rounded-md border border-border bg-elevated px-3 py-2">
                <p className="type-ui text-text-primary">References</p>
                <p className="mt-1 type-caption">Uses selected board and image context.</p>
              </div>
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
            {workflowSteps.map((step, index) => (
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
                  {step.state}
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
              {workflowPresets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className="rounded-md border border-border bg-elevated px-3 py-2 text-left type-ui text-text-body transition-all hover:border-border-hover hover:text-text-primary"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-border px-4 py-3">
            <h3 className="type-section">Run Output</h3>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center px-4 text-center">
            <p className="type-caption">No run output yet.</p>
          </div>
        </section>
      </aside>
    </div>
  );
}
