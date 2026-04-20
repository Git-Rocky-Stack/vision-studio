import { useEffect, useState } from 'react';

import { exportWorkflowGraphToComfyPrompt } from '@/features/workflow/comfyExport';
import { createWorkflowNodeFromClassType } from '@/features/workflow/nodeDefaults';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/appStore';
import { cn } from '@/utils/cn';
import { formatLabel, formatTimestamp } from '@/utils/formatUtils';
import { WorkflowGraphEditor } from './WorkflowGraphEditor';

export function WorkflowWorkbench() {
  const {
    workflowRecords,
    activeWorkflowId,
    setActiveWorkflow,
    addWorkflowNode,
    moveWorkflowNode,
    connectWorkflowNodes,
    deleteWorkflowNode,
    deleteWorkflowEdge,
  } = useAppStore(
    useShallow((s) => ({
      workflowRecords: s.workflowRecords,
      activeWorkflowId: s.activeWorkflowId,
      setActiveWorkflow: s.setActiveWorkflow,
      addWorkflowNode: s.addWorkflowNode,
      moveWorkflowNode: s.moveWorkflowNode,
      connectWorkflowNodes: s.connectWorkflowNodes,
      deleteWorkflowNode: s.deleteWorkflowNode,
      deleteWorkflowEdge: s.deleteWorkflowEdge,
    }))
  );
  const [exportedJson, setExportedJson] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const activeWorkflow =
    workflowRecords.find((workflow) => workflow.id === activeWorkflowId) ?? workflowRecords[0];

  useEffect(() => {
    setExportedJson(null);
    setExportError(null);
  }, [activeWorkflow.id]);

  function handleExportComfyJson() {
    try {
      setExportedJson(JSON.stringify(exportWorkflowGraphToComfyPrompt(activeWorkflow.graph), null, 2));
      setExportError(null);
    } catch (error) {
      setExportedJson(null);
      setExportError(error instanceof Error ? error.message : 'Unable to export graph.');
    }
  }

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
        <div className="flex items-center justify-between gap-3 border-b border-border bg-surface px-5 py-3">
          <div>
            <p className="type-caption">Graph Editor</p>
            <h3 className="mt-1 type-section">ComfyUI prompt graph</h3>
          </div>
          <button
            type="button"
            onClick={handleExportComfyJson}
            className="rounded-md border border-border bg-elevated px-3 py-1.5 type-ui text-text-body transition-all hover:border-border-hover hover:text-text-primary"
          >
            Export ComfyUI JSON
          </button>
        </div>

        <WorkflowGraphEditor
          graph={activeWorkflow.graph}
          onMoveNode={(nodeId, position) => moveWorkflowNode(activeWorkflow.id, nodeId, position)}
          onAddNode={(classType) => {
            addWorkflowNode(
              activeWorkflow.id,
              createWorkflowNodeFromClassType(classType, Object.keys(activeWorkflow.graph.nodes).length)
            );
          }}
          onConnectNodes={(edge) => connectWorkflowNodes(activeWorkflow.id, edge)}
          onDeleteSelection={(selection) => {
            if (selection.type === 'node') deleteWorkflowNode(activeWorkflow.id, selection.id);
            if (selection.type === 'edge') deleteWorkflowEdge(activeWorkflow.id, selection.id);
          }}
        />

        {exportedJson && (
          <pre
            role="region"
            aria-label="ComfyUI API JSON export"
            className="max-h-48 overflow-auto border-t border-border bg-canvas p-3 type-meta text-text-body"
          >
            {exportedJson}
          </pre>
        )}
        {exportError && (
          <p className="border-t border-border bg-surface px-4 py-3 type-caption text-error" role="alert">
            {exportError}
          </p>
        )}
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
