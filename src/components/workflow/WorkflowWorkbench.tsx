import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, Play, ShieldCheck } from 'lucide-react';

import type { UserAccountSummary } from '@/types/electron';
import type { WorkflowExecutionIssue, WorkflowExecutionSummary } from '@/types/workflow';
import {
  getActiveUserAccount,
  isHostedStillImageRoute,
  resolveStillImageRoute,
} from '@/features/accounts/providerRouting';
import { exportWorkflowGraphToComfyPrompt, type ComfyPrompt } from '@/features/workflow/comfyExport';
import { importComfyPromptToWorkflowGraph, type ImportFidelityReport } from '@/features/workflow/comfyImport';
import { evaluateGraphSafety } from '@/features/workflow/comfyImportSafety';
import { createWorkflowNodeFromClassType } from '@/features/workflow/nodeDefaults';
import { runWorkflowExecution } from '@/features/workflow/runWorkflowExecution';
import { validateWorkflowExecution } from '@/features/workflow/validateWorkflowExecution';
import {
  buildLoraNodeOptions,
  graphCheckpointName,
  resolveCheckpointRecord,
} from '@/features/workflow/workflowLoras';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/appStore';
import { getElectronBridge } from '@/utils/electronBridge';
import { cn } from '@/utils/cn';
import { formatLabel } from '@/utils/formatUtils';
import { WorkflowGraphEditor } from './WorkflowGraphEditor';
import { WorkflowLibraryPanel } from './WorkflowLibraryPanel';

interface WorkflowWorkbenchProps {
  /**
   * Where the workflow library is shown. 'inline' draws it as the workbench's
   * third column. 'docked' means the host already shows it (the Workflows tab's
   * left dock), so the workbench leaves it out and the graph gets the room.
   */
  library?: 'inline' | 'docked';
}

// The side columns take a share of the workbench instead of a fixed 280/320px:
// in the 840px centre of the default window those fixed widths left the graph
// editor a 240px strip.
const GRID_COLUMNS = {
  inline: 'grid-cols-[minmax(180px,min(22%,280px))_minmax(0,1fr)_minmax(180px,min(24%,320px))]',
  docked: 'grid-cols-[minmax(180px,min(26%,280px))_minmax(0,1fr)]',
} as const;

export function WorkflowWorkbench({ library = 'inline' }: WorkflowWorkbenchProps = {}) {
  const {
    workflowRecords,
    activeWorkflowId,
    createWorkflowFromGraph,
    addWorkflowNode,
    moveWorkflowNode,
    connectWorkflowNodes,
    deleteWorkflowNode,
    deleteWorkflowEdge,
    updateWorkflowNode,
    workflowRuntimeById,
    setWorkflowRuntimeState,
    systemInfo,
    generationDraft,
    availableModels,
    projects,
    activeProjectId,
    activeSceneId,
  } = useAppStore(
    useShallow((s) => ({
      workflowRecords: s.workflowRecords,
      activeWorkflowId: s.activeWorkflowId,
      createWorkflowFromGraph: s.createWorkflowFromGraph,
      addWorkflowNode: s.addWorkflowNode,
      moveWorkflowNode: s.moveWorkflowNode,
      connectWorkflowNodes: s.connectWorkflowNodes,
      deleteWorkflowNode: s.deleteWorkflowNode,
      deleteWorkflowEdge: s.deleteWorkflowEdge,
      updateWorkflowNode: s.updateWorkflowNode,
      workflowRuntimeById: s.workflowRuntimeById,
      setWorkflowRuntimeState: s.setWorkflowRuntimeState,
      systemInfo: s.systemInfo,
      generationDraft: s.generationDraft,
      availableModels: s.availableModels,
      projects: s.projects,
      activeProjectId: s.activeProjectId,
      activeSceneId: s.activeSceneId,
    }))
  );
  const [exportedJson, setExportedJson] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [importJson, setImportJson] = useState('');
  const [importReport, setImportReport] = useState<ImportFidelityReport | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [activeAccount, setActiveAccount] = useState<UserAccountSummary | null>(null);
  const activeWorkflow =
    workflowRecords.find((workflow) => workflow.id === activeWorkflowId) ?? workflowRecords[0];
  const activeScene = getActiveScene(projects, activeProjectId, activeSceneId);
  const runtime = workflowRuntimeById[activeWorkflow.id] ?? {
    issues: [],
    activeJobId: null,
    lastRunId: null,
    lastFailureMessage: null,
    lastResolvedRequest: null,
  };
  const hasBlockingIssues = runtime.issues.some((issue) => issue.severity === 'error');
  const isRunning = activeWorkflow.status === 'running' || Boolean(runtime.activeJobId);
  const stillImageRoute = resolveStillImageRoute(activeAccount);
  const workflowCanRunWithoutBackend =
    isHostedStillImageRoute(stillImageRoute) && stillImageRoute.configured;
  // #43: LoRA Loader node options from the installed library, compat-flagged
  // against the graph's checkpoint family.
  const workflowLoraOptions = useMemo(() => {
    const checkpointName = graphCheckpointName(activeWorkflow.graph);
    const checkpointFamily = checkpointName
      ? (resolveCheckpointRecord(checkpointName, availableModels)?.base_architecture ?? null)
      : null;
    return buildLoraNodeOptions(availableModels, checkpointFamily);
  }, [activeWorkflow.graph, availableModels]);

  useEffect(() => {
    setExportedJson(null);
    setExportError(null);
  }, [activeWorkflow.id]);

  useEffect(() => {
    // Mount path: outside Electron `window.electron` is undefined despite the
    // type declaring it required (see @/utils/electronBridge), and this threw
    // before first paint. With no bridge there is no account to hydrate, which
    // is the same end state the .catch below already handles.
    const electron = getElectronBridge();
    if (!electron) {
      setActiveAccount(null);
      return;
    }

    let cancelled = false;

    void electron.accounts
      .list()
      .then((snapshot) => {
        if (!cancelled) {
          setActiveAccount(getActiveUserAccount(snapshot));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setActiveAccount(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Export the active graph once per change so the Run-on-ComfyUI gate and click
  // handler share one source; export can throw on an invalid graph, so guard it.
  const activePrompt = useMemo(() => {
    try {
      return exportWorkflowGraphToComfyPrompt(activeWorkflow.graph);
    } catch {
      return null;
    }
  }, [activeWorkflow]);
  const runnableOnComfy = activePrompt ? evaluateGraphSafety(activePrompt).safe : false;

  async function handleRunOnComfy() {
    if (!activePrompt) return;
    const electron = window.electron;
    if (!electron?.workflow) return;
    await electron.workflow.runGraph({ graph: activePrompt, generationType: 'image' });
  }

  function handleExportComfyJson() {
    try {
      setExportedJson(JSON.stringify(exportWorkflowGraphToComfyPrompt(activeWorkflow.graph), null, 2));
      setExportError(null);
    } catch (error) {
      setExportedJson(null);
      setExportError(error instanceof Error ? error.message : 'Unable to export graph.');
    }
  }

  function handleImportGraph() {
    setImportError(null);
    let prompt: ComfyPrompt;
    try {
      prompt = JSON.parse(importJson) as ComfyPrompt;
    } catch {
      setImportError('That is not valid JSON.');
      return;
    }
    const knownModelFilenames = availableModels
      .map((model) => model.name ?? model.id ?? '')
      .filter(Boolean);
    const { graph, report } = importComfyPromptToWorkflowGraph(prompt, { knownModelFilenames });
    createWorkflowFromGraph('Imported graph', graph);
    setImportReport(report);
  }

  async function handleValidate() {
    const snapshot = await window.electron.accounts.list().catch(() => null);
    const nextActiveAccount = getActiveUserAccount(snapshot);
    setActiveAccount(nextActiveAccount);
    const nextStillImageRoute = resolveStillImageRoute(nextActiveAccount);
    const result = validateWorkflowExecution(activeWorkflow, {
      activeScenePrompt: activeScene?.prompt ?? null,
      activeSceneNegativePrompt: activeScene?.negativePrompt ?? null,
      generationDraft,
      availableModels,
    });
    const nextIssues = applyWorkflowExecutionValidationRoute(result.issues, nextStillImageRoute, systemInfo.backendConnected);
    const nextSummary = applyWorkflowExecutionSummaryRoute(result.summary, nextStillImageRoute);

    setWorkflowRuntimeState(activeWorkflow.id, {
      issues: nextIssues,
      lastResolvedRequest: nextSummary,
      lastFailureMessage: null,
    });
  }

  async function handleRunWorkflow() {
    await runWorkflowExecution({ workflowId: activeWorkflow.id });
  }

  return (
    <div className={cn('grid h-full min-h-0 bg-void', GRID_COLUMNS[library])}>
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

          <div>
            <p className="type-ui text-text-muted">Execution</p>
            <div className="mt-2 rounded-md border border-border bg-elevated px-3 py-3">
              <p className="type-ui text-text-primary">{stillImageRoute.providerLabel}</p>
              <p className="mt-1 type-caption text-text-body">
                {isHostedStillImageRoute(stillImageRoute)
                  ? `Account ${activeAccount?.name ?? 'No active account'} / Model ${stillImageRoute.model || 'Not set in Settings'}`
                  : 'Workflow still-image runs use the local backend and installed checkpoints.'}
              </p>
              {!systemInfo.backendConnected ? (
                <p className="mt-2 type-caption text-text-muted">
                  {workflowCanRunWithoutBackend
                    ? 'Local backend is offline, but OpenRouter-hosted still-image runs remain available.'
                    : 'Local backend is offline. Workflow runs stay blocked until it comes back.'}
                </p>
              ) : null}
            </div>
            {runtime.lastResolvedRequest ? (
              <div className="mt-2 rounded-md border border-border bg-elevated px-3 py-3">
                <p className="type-ui text-text-primary">{runtime.lastResolvedRequest.model}</p>
                <p className="mt-1 type-caption">
                  {runtime.lastResolvedRequest.width} x {runtime.lastResolvedRequest.height}, {runtime.lastResolvedRequest.steps} steps, CFG {runtime.lastResolvedRequest.cfgScale}
                </p>
                <p className="mt-2 line-clamp-2 type-caption text-text-body">
                  {runtime.lastResolvedRequest.prompt}
                </p>
              </div>
            ) : (
              <p className="mt-2 type-caption">Validate the workflow to preview the execution request.</p>
            )}
          </div>

          {(runtime.issues.length > 0 || runtime.lastFailureMessage) && (
            <div
              role="alert"
              className="rounded-md border border-error/40 bg-error/10 px-3 py-3 text-error"
            >
              {runtime.lastFailureMessage ? (
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p className="type-caption">{runtime.lastFailureMessage}</p>
                </div>
              ) : null}
              {runtime.issues.length > 0 ? (
                <ul className={cn('space-y-2', runtime.lastFailureMessage ? 'mt-3' : '')}>
                  {runtime.issues.map((issue) => (
                    <li key={`${issue.code}-${issue.nodeId ?? 'global'}-${issue.message}`} className="flex items-start gap-2">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <p className="type-caption">{issue.message}</p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </div>
      </aside>

      {/* min-w-0: without it the header's min-content width pushed the run
          buttons out of this column and over the library beside it. */}
      <main className="flex min-h-0 min-w-0 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border bg-surface px-5 py-3">
          <div className="min-w-0">
            <p className="type-caption">Graph Editor</p>
            <h3 className="mt-1 type-section">ComfyUI prompt graph</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="whitespace-nowrap rounded-md border border-border bg-elevated px-2.5 py-1 type-ui text-text-body">
              {isRunning ? 'Workflow running' : formatLabel(activeWorkflow.status)}
            </span>
            <button
              type="button"
              onClick={handleValidate}
              disabled={isRunning}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-md border border-border bg-elevated px-3 py-1.5 type-ui text-text-body transition hover:border-border-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ShieldCheck className="h-4 w-4" />
              Validate
            </button>
            <button
              type="button"
              onClick={handleRunWorkflow}
              disabled={
                hasBlockingIssues ||
                isRunning ||
                (!systemInfo.backendConnected && !workflowCanRunWithoutBackend) ||
                Boolean(stillImageRoute.error)
              }
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-md border border-accent-primary-border bg-accent-primary-muted px-3 py-1.5 type-ui text-accent-primary transition hover:border-accent-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {isRunning ? 'Running workflow...' : 'Run Workflow'}
            </button>
            <button
              type="button"
              onClick={handleRunOnComfy}
              disabled={!runnableOnComfy}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-elevated px-3 py-1.5 type-ui text-text-body transition hover:border-border-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Run on ComfyUI
            </button>
            <button
              type="button"
              onClick={handleExportComfyJson}
              className="rounded-md border border-border bg-elevated px-3 py-1.5 type-ui text-text-body transition hover:border-border-hover hover:text-text-primary"
            >
              Export ComfyUI JSON
            </button>
          </div>
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
          loraOptions={workflowLoraOptions}
          onUpdateNodeInput={(nodeId, inputName, value) => {
            const node = activeWorkflow.graph.nodes[nodeId];
            if (!node) return;
            updateWorkflowNode(activeWorkflow.id, nodeId, {
              inputs: {
                ...node.inputs,
                [inputName]: { kind: 'literal', value },
              },
            });
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

        <section className="border-t border-border bg-surface px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="type-caption">Import</p>
              <h3 className="mt-1 type-ui text-text-primary">ComfyUI graph</h3>
            </div>
            <button
              type="button"
              onClick={handleImportGraph}
              className="rounded-md border border-border bg-elevated px-3 py-1.5 type-ui text-text-body transition hover:border-border-hover hover:text-text-primary"
            >
              Import graph
            </button>
          </div>
          <label htmlFor="comfy-import" className="sr-only">
            Comfy graph JSON
          </label>
          <textarea
            id="comfy-import"
            aria-label="Comfy graph JSON"
            value={importJson}
            onChange={(event) => setImportJson(event.target.value)}
            placeholder="Paste a ComfyUI API-format prompt"
            className="mt-2 h-20 w-full rounded-md border border-border bg-canvas px-3 py-2 type-meta text-text-body"
          />
          {importError ? (
            <p role="alert" className="mt-2 type-caption text-error">
              {importError}
            </p>
          ) : null}
          {importReport ? (
            <div className="mt-2 rounded-md border border-border bg-elevated px-3 py-2">
              <p className="type-ui text-text-primary">
                {importReport.executable ? 'Executable on ComfyUI' : 'Imported, not executable'}
              </p>
              {importReport.opaqueNodes.length > 0 ? (
                <div className="mt-2">
                  <p className="type-caption text-text-muted">Unsupported nodes</p>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {importReport.opaqueNodes.map((node) => (
                      <li
                        key={node.id}
                        className="rounded-md border border-border bg-surface px-2 py-1 type-caption text-text-body"
                      >
                        {node.classType}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {importReport.unresolvedModels.length > 0 ? (
                <div className="mt-2">
                  <p className="type-caption text-text-muted">Unresolved models</p>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {importReport.unresolvedModels.map((model) => (
                      <li
                        key={`${model.nodeId}:${model.field}`}
                        className="rounded-md border border-border bg-surface px-2 py-1 type-caption text-text-body"
                      >
                        {model.value}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </main>

      {library === 'inline' ? (
        <aside className="flex min-h-0 flex-col border-l border-border">
          <WorkflowLibraryPanel />
        </aside>
      ) : null}
    </div>
  );
}

function getActiveScene(
  projects: ReturnType<typeof useAppStore.getState>['projects'],
  activeProjectId: string | null,
  activeSceneId: string | null
) {
  const activeProject = projects.find((project) => project.id === activeProjectId);
  return activeProject?.scenes.find((scene) => scene.id === activeSceneId) ?? null;
}

function applyWorkflowExecutionValidationRoute(
  issues: WorkflowExecutionIssue[],
  stillImageRoute: ReturnType<typeof resolveStillImageRoute>,
  backendConnected: boolean,
) {
  let nextIssues = [...issues];

  if (!backendConnected && !isHostedStillImageRoute(stillImageRoute)) {
    nextIssues = appendWorkflowIssue(nextIssues, {
      severity: 'error',
      code: 'backend-unavailable',
      message: 'The AI backend is not running.',
    });
  }

  if (isHostedStillImageRoute(stillImageRoute) && stillImageRoute.error) {
    nextIssues = appendWorkflowIssue(nextIssues, {
      severity: 'error',
      code: 'provider-config',
      message: stillImageRoute.error,
    });
  }

  return nextIssues;
}

function applyWorkflowExecutionSummaryRoute(
  summary: WorkflowExecutionSummary | null,
  stillImageRoute: ReturnType<typeof resolveStillImageRoute>,
) {
  if (!summary) {
    return null;
  }

  if (isHostedStillImageRoute(stillImageRoute) && stillImageRoute.model) {
    return {
      ...summary,
      model: stillImageRoute.model,
    };
  }

  return summary;
}

function appendWorkflowIssue(issues: WorkflowExecutionIssue[], issue: WorkflowExecutionIssue) {
  const exists = issues.some(
    (entry) =>
      entry.code === issue.code &&
      entry.message === issue.message &&
      entry.nodeId === issue.nodeId,
  );
  return exists ? issues : [...issues, issue];
}
