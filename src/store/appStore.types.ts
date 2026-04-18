/**
 * Central type definitions for the Vision Studio app store.
 *
 * This file owns the `AppState` interface and all locally-defined types
 * consumed by the store and its slices. Re-exports of external types are
 * also centralized here so consumers need only import from this module.
 */

// ---------------------------------------------------------------------------
// Re-exports of types from other modules
// ---------------------------------------------------------------------------

export type {
  WorkbenchView,
  WorkflowStepState,
  WorkflowStepRecord,
  WorkflowRunRecord,
  WorkflowRunInput,
  WorkflowGraph,
  WorkflowGraphNode,
  WorkflowGraphInput,
  WorkflowGraphEdge,
  WorkflowRecord,
} from '@/types/workflow';

export type { ProjectTemplate } from '@/types/template';

export type { ModelInfo, ModelStatus } from '@/types/model';

// ---------------------------------------------------------------------------
// Imports used only internally by AppState (not re-exported)
// ---------------------------------------------------------------------------

import type {
  Project,
  Scene,
  CharacterRef,
  RegionLock,
  SceneStatus,
  GenerationConfig,
  MaskType,
} from '@/types/project';

import type {
  EditTool,
  Layer,
  EditHistoryEntry,
  ImageAdjustments,
} from '@/types/editor';

import type {
  PromptHistoryEntry,
  StylePreset,
  GenerationQueueItem,
  BatchResult,
  GenerationDraft,
} from '@/types/generation';

import type {
  AssetJobStatus,
  AssetRecord,
  DerivedAssetResult,
} from '@/types/assets';

import type {
  WorkbenchView,
  WorkflowRunInput,
  WorkflowGraphNode,
  WorkflowGraphEdge,
  WorkflowGraph,
  WorkflowRecord,
} from '@/types/workflow';

import type { ProjectTemplate } from '@/types/template';
import type { ModelInfo } from '@/types/model';

// ---------------------------------------------------------------------------
// Local type definitions
// ---------------------------------------------------------------------------

/** Lightweight recent-project entry (file-system project, not the storyboard Project). */
export interface RecentProject {
  id: string;
  name: string;
  path: string;
  createdAt: Date;
  updatedAt: Date;
  thumbnail?: string;
}

export interface GenerationJobParams {
  prompt?: string;
  negativePrompt?: string;
  model?: string;
  steps?: number;
  cfgScale?: number;
  seed?: number;
  width?: number;
  height?: number;
  scheduler?: string;
  [key: string]: string | number | boolean | null | undefined;
}

export interface GenerationJobResult {
  images?: string[];
  video?: string;
  seed?: number;
  [key: string]: string | number | boolean | null | undefined;
}

export interface GenerationJob {
  id: string;
  type: 'image' | 'video';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  params: GenerationJobParams;
  result?: GenerationJobResult;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface BatchJob {
  id: string;
  name: string;
  prompts: string[];
  currentIndex: number;
  completedJobs: string[];
  failedJobs: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// AppState - the central type for the entire store
// ---------------------------------------------------------------------------

export interface AppState {
  // ─── UI State ────────────────────────────────────────────────────────────
  sidebarCollapsed: boolean;
  activePanel: 'generate' | 'quick' | 'storyboard' | 'edit' | 'assets' | 'settings' | 'templates' | 'batch';
  activeWorkbenchView: WorkbenchView;
  activeViewerItemId: string | null;
  darkMode: boolean;

  // ─── Workflow ────────────────────────────────────────────────────────────
  workflowRecords: WorkflowRecord[];
  activeWorkflowId: string;

  // ─── Recent Projects (file-system level, not storyboard) ────────────────
  currentProject: RecentProject | null;
  recentProjects: RecentProject[];

  // ─── Projects (Storyboard) ───────────────────────────────────────────────
  projects: Project[];
  activeProjectId: string | null;
  activeSceneId: string | null;

  // ─── Region Lock ─────────────────────────────────────────────────────────
  regionMode: boolean;
  activeRegionId: string | null;
  activeMaskTool: MaskType | 'select';
  maskBrushSize: number;
  maskInverted: boolean;

  // ─── Migration ───────────────────────────────────────────────────────────
  migrationStatus: 'idle' | 'running' | 'complete' | 'error';
  migrationProgress: number; // 0-100

  // ─── Generation ──────────────────────────────────────────────────────────
  activeJobs: GenerationJob[];
  completedJobs: GenerationJob[];

  // ─── Batch ──────────────────────────────────────────────────────────────
  batchJobs: BatchJob[];

  // ─── System ──────────────────────────────────────────────────────────────
  systemInfo: {
    gpuAvailable: boolean;
    gpuName?: string;
    gpuVram?: string;
    cudaVersion?: string;
    comfyuiConnected: boolean;
    modelsCount: number;
    backendConnected: boolean;
  };

  // ─── Models ──────────────────────────────────────────────────────────────
  availableModels: ModelInfo[];

  // ─── Prompt Intelligence ─────────────────────────────────────────────────
  promptHistory: PromptHistoryEntry[];
  favoritePrompts: string[];
  stylePresets: StylePreset[];
  customStylePresets: StylePreset[];

  // ─── Templates ───────────────────────────────────────────────────────────
  userTemplates: ProjectTemplate[];

  // ─── Generation Queue & Batch Results ────────────────────────────────────
  generationQueue: GenerationQueueItem[];
  batchResults: BatchResult[];

  // ─── Comparison ──────────────────────────────────────────────────────────
  comparisonMode: 'off' | 'side-by-side' | 'slider' | 'onion' | 'grid';
  comparisonImages: string[];

  // ─── Assets ──────────────────────────────────────────────────────────────
  assetLibrary: AssetRecord[];

  // ─── Edit Mode ──────────────────────────────────────────────────────────
  activeEditTool: EditTool;
  editLayers: Layer[];
  editHistory: EditHistoryEntry[];
  editHistoryIndex: number; // Current position in history (-1 = no history)
  currentImage: string | null;
  currentImageAssetPath: string | null;
  imageAdjustments: ImageAdjustments;
  generationDraft: GenerationDraft | null;

  // ─── Batch View State ───────────────────────────────────────────────────
  batchViewMode: 'grid' | 'list' | 'large';
  batchSortBy: 'created' | 'prompt' | 'status';
  batchFilterBy: 'all' | 'completed' | 'failed' | 'favorites';

  // ─── Advanced Generation ─────────────────────────────────────────────────
  advancedGeneration: {
    generationType: 'image' | 'video';
    steps: number;
    cfgScale: number;
    scheduler: string;
    clipSkip: number;
    seed: number;
    duration: number;
    fps: number;
  };
  showAdvancedGeneration: boolean;

  // ─── Actions ─────────────────────────────────────────────────────────────

  // UI
  toggleSidebar: () => void;
  setActivePanel: (panel: AppState['activePanel']) => void;
  setActiveWorkbenchView: (view: WorkbenchView) => void;
  setActiveViewerItemId: (itemId: string | null) => void;

  // Workflow
  setActiveWorkflow: (workflowId: string) => void;
  createWorkflow: (name: string) => WorkflowRecord;
  recordWorkflowRun: (workflowId: string, run: WorkflowRunInput) => void;
  addWorkflowNode: (
    workflowId: string,
    node: Omit<WorkflowGraphNode, 'id'>,
  ) => WorkflowGraphNode | null;
  moveWorkflowNode: (
    workflowId: string,
    nodeId: string,
    position: WorkflowGraphNode['position'],
  ) => void;
  updateWorkflowNode: (
    workflowId: string,
    nodeId: string,
    updates: Partial<Omit<WorkflowGraphNode, 'id'>>,
  ) => void;
  deleteWorkflowNode: (workflowId: string, nodeId: string) => void;
  connectWorkflowNodes: (
    workflowId: string,
    edge: Omit<WorkflowGraphEdge, 'id'>,
  ) => WorkflowGraphEdge | null;
  deleteWorkflowEdge: (workflowId: string, edgeId: string) => void;
  setWorkflowGraphViewport: (
    workflowId: string,
    viewport: NonNullable<WorkflowGraph['viewport']>,
  ) => void;

  // Recent project / generation jobs
  setCurrentProject: (project: RecentProject | null) => void;
  addJob: (job: GenerationJob) => void;
  updateJob: (jobId: string, updates: Partial<GenerationJob>) => void;
  removeJob: (jobId: string) => void;
  setSystemInfo: (info: AppState['systemInfo']) => void;
  setAvailableModels: (models: ModelInfo[]) => void;
  addBatchJob: (batchJob: BatchJob) => void;
  updateBatchJob: (batchId: string, updates: Partial<BatchJob>) => void;

  // Prompt intelligence
  addToPromptHistory: (entry: PromptHistoryEntry) => void;
  toggleFavoritePrompt: (prompt: string) => void;
  addCustomStylePreset: (preset: StylePreset) => void;
  removeCustomStylePreset: (id: string) => void;

  // Templates
  addUserTemplate: (template: ProjectTemplate) => void;
  updateUserTemplate: (id: string, updates: Partial<ProjectTemplate>) => void;
  deleteUserTemplate: (id: string) => void;

  // Generation queue
  addToGenerationQueue: (item: GenerationQueueItem) => void;
  removeFromGenerationQueue: (id: string) => void;

  // Batch results
  addBatchResult: (result: BatchResult) => void;
  toggleBatchResultFavorite: (id: string) => void;

  // Comparison
  setComparisonMode: (mode: AppState['comparisonMode']) => void;
  setComparisonImages: (images: string[]) => void;

  // Assets
  syncAssetsFromJobStatus: (status: AssetJobStatus) => void;
  deleteAssetRecord: (assetId: string) => void;
  toggleAssetFavorite: (assetId: string) => void;
  clearAssetLibrary: () => void;
  clearBatchResults: () => void;
  removeAssetsByRoot: (rootPath: string) => void;
  removeAssetRecordsByPaths: (paths: string[]) => void;
  upsertDerivedAsset: (
    result: DerivedAssetResult,
    context: {
      prompt: string;
      negativePrompt?: string;
      model?: string;
      seed?: number;
      params?: Record<string, unknown>;
    },
  ) => void;
  removeBatchResults: (ids: string[]) => void;

  // Generation draft & advanced generation
  setGenerationDraft: (draft: GenerationDraft | null) => void;
  updateAdvancedGeneration: (patch: Partial<AppState['advancedGeneration']>) => void;
  setShowAdvancedGeneration: (show: boolean) => void;

  // Batch view
  setBatchViewMode: (mode: AppState['batchViewMode']) => void;
  setBatchSortBy: (sort: AppState['batchSortBy']) => void;
  setBatchFilterBy: (filter: AppState['batchFilterBy']) => void;

  // Edit mode
  setActiveEditTool: (tool: EditTool) => void;
  addEditLayer: (layer: Layer) => void;
  updateEditLayer: (id: string, updates: Partial<Layer>) => void;
  removeEditLayer: (id: string) => void;
  reorderEditLayers: (layerIds: string[]) => void;
  pushEditHistory: (entry: EditHistoryEntry) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  setCurrentImage: (imagePath: string | null, assetPath?: string | null) => void;
  setImageAdjustments: (adjustments: Partial<ImageAdjustments>) => void;
  resetImageAdjustments: () => void;

  // Project CRUD
  createProject: (name: string, dimensions?: { width: number; height: number }) => Project;
  deleteProject: (id: string) => void;
  setActiveProject: (id: string | null) => void;
  updateProject: (
    id: string,
    updates: Partial<Pick<Project, 'name' | 'dimensions' | 'fps' | 'metadata'>>,
  ) => void;

  // Scene CRUD
  addScene: (projectId: string, config?: Partial<Scene>) => Scene;
  deleteScene: (projectId: string, sceneId: string) => void;
  reorderScenes: (projectId: string, sceneIds: string[]) => void;
  duplicateScene: (projectId: string, sceneId: string) => Scene | undefined;
  setActiveScene: (id: string | null) => void;
  updateScene: (projectId: string, sceneId: string, updates: Partial<Scene>) => void;
  setSceneStatus: (projectId: string, sceneId: string, status: SceneStatus) => void;

  // Character CRUD
  addCharacter: (projectId: string, char: Omit<CharacterRef, 'id' | 'projectId'>) => CharacterRef;
  updateCharacter: (projectId: string, charId: string, updates: Partial<CharacterRef>) => void;
  deleteCharacter: (projectId: string, charId: string) => void;
  assignCharacterToScene: (projectId: string, sceneId: string, charId: string) => void;
  removeCharacterFromScene: (projectId: string, sceneId: string, charId: string) => void;

  // Region lock CRUD
  createRegionLock: (sceneId: string, frameId: string, config: Partial<RegionLock>) => RegionLock;
  updateRegionLock: (sceneId: string, lockId: string, updates: Partial<RegionLock>) => void;
  deleteRegionLock: (sceneId: string, lockId: string) => void;

  // Region mode state
  setRegionMode: (mode: boolean) => void;
  setActiveRegionId: (id: string | null) => void;
  setActiveMaskTool: (tool: MaskType | 'select') => void;
  setMaskBrushSize: (size: number) => void;
  toggleMaskInverted: () => void;

  // Quick Generate
  quickGenerate: (config: GenerationConfig) => void;
  promoteToProject: (sceneId: string, projectId: string) => void;

  // Migration
  runMigration: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Helper types for slice creators
// ---------------------------------------------------------------------------

export type AppSet = (
  partial: Partial<AppState> | ((state: AppState) => Partial<AppState>),
) => void;

export type AppGet = () => AppState;