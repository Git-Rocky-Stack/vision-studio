const chips = ['Planned', 'Linear UI', 'Node Canvas'];

export function WorkflowPlaceholder() {
  return (
    <div className="flex h-full min-h-[280px] items-center justify-center bg-void px-6">
      <section className="w-full max-w-md text-center">
        <h2 className="font-display text-xl font-semibold text-text-primary">Workflow</h2>
        <p className="mt-3 text-sm font-display text-text-body">
          Node workflows are coming to this workbench.
        </p>
        <p className="mt-1 text-xs font-display text-text-muted">
          For now, keep building through Canvas and Viewer.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {chips.map((chip) => (
            <span
              key={chip}
              className="rounded-md border border-accent-primary-border bg-accent-primary-muted px-2.5 py-1 font-mono text-micro uppercase text-accent-primary"
            >
              {chip}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
