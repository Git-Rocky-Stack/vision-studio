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
  WorkflowStepState,
  WorkflowStepRecord,
  WorkflowRunRecord,
  WorkflowRunInput,
  WorkflowExecutionIssue,
  WorkflowExecutionSummary,
  WorkflowRuntimeState,
  WorkflowExecutionContext,
  WorkflowExecutionValidationResult,
  WorkflowGraph,
  WorkflowGraphNode,
  WorkflowGraphInput,
  WorkflowGraphEdge,
  WorkflowRecord,
} from '@/types/workflow';

export type { ProjectTemplate } from '@/types/template';

export type { ModelInfo, ModelStatus } from '@/types/model';

export type { AspectRatio, ResolutionTier } from '@/types/resolution';

export type {
  TimelineMode,
  PlayState,
  KeyframeInterpolation,
  Keyframe,
  TimelinePlayRange,
  TimelineSequence,
  TimelineTrack,
  TimelineClip,
  TimelineClipMoveOptions,
  TimelineClipTrimOptions,
  TimelineSplitResult,
  TimelineTransition,
  TimelineTransitionEdge,
  ClipGenerationBinding,
} from '@/types/timeline';

export type {
  MediaAsset,
  MediaAssetType,
  MediaAssetSource,
  ReferenceSet,
  ReferenceSetItem,
  ReferenceSlotType,
} from '@/types/media';

export type {
  PipelineStepType,
  PipelineStep,
  PipelineDefinition,
  StepExecutionStatus,
  StepExecutionResult,
  PipelineExecution,
} from '@/types/pipeline';

// ---------------------------------------------------------------------------
// Imports used only internally by AppState (not re-exported)
// ---------------------------------------------------------------------------

import type {
  Project,
  Scene,
  CharacterRef,
  ImportDraft,
  RegionLock,
  CanvasControlLayer,
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
  GenerationMode,
} from '@/types/generation';

import type {
  AssetJobStatus,
  AssetRecord,
  DerivedAssetResult,
} from '@/types/assets';

import type {
  WorkflowRunInput,
  WorkflowRuntimeState,
  WorkflowGraphNode,
  WorkflowGraphEdge,
  WorkflowGraph,
  WorkflowRecord,
} from '@/types/workflow';

import type { ProjectTemplate } from '@/types/template';
import type { ModelInfo } from '@/types/model';

import type { AspectRatio, ResolutionTier } from '@/types/resolution';

import type { ActiveTab, ActiveSubMode, CenterView } from '@/types/navigation';

import type {
  IterationNode,
  IterationBranch,
  IterationView,
  ComparisonMode as IterationComparisonMode,
  ComparisonIds,
} from '@/types/iteration';
import type { Collection, AssetTag, AssetMetadata, TaggingMode, SmartQuery } from '@/types/collections';

import type { PromptTemplate, CompositionLayerState } from '@/types/promptStudio';

import type {
  TimelineMode,
  PlayState,
  Keyframe,
  TimelineSequence,
  TimelineTrack,
  TimelineClip,
  TimelineTransition,
  ClipGenerationBinding,
} from '@/types/timeline';

import type {
  MediaAsset,
  ReferenceSet,
  ReferenceSetItem,
} from '@/types/media';

import type { PipelineDefinition, PipelineExecution } from '@/types/pipeline';
import type { GenerateCollapsibleSectionId, ReviewDensity } from './layoutPreferences';

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
  template?: ProjectTemplate;
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

export interface LayoutPreferences {
  leftDockWidth: number;
  rightDockWidth: number;
  rightDockCanvasRatios: [number, number];
  rightDockDualRatios: [number, number];
  rightDockTripleRatios: [number, number, number];
  reviewDensity: ReviewDensity;
  collapsedGenerateSections: GenerateCollapsibleSectionId[];
}

// ---------------------------------------------------------------------------
// AppState - the central type for the entire store
// ---------------------------------------------------------------------------

export interface AppState {
  // ─── UI State ────────────────────────────────────────────────────────────
  activeViewerItemId: string | null;
  darkMode: boolean;
  layoutPreferences: LayoutPreferences;

  // Navigation model
  activeTab: ActiveTab;
  activeSubMode: ActiveSubMode;
  centerView: CenterView;

  // Resolution
  aspectRatio: AspectRatio;
  resolutionTier: ResolutionTier;
  customWidth: number;
  customHeight: number;

  // ─── Workflow ────────────────────────────────────────────────────────────
  workflowRecords: WorkflowRecord[];
  activeWorkflowId: string;
  workflowRuntimeById: Record<string, WorkflowRuntimeState>;

  // ─── Recent Projects (file-system level, not storyboard) ────────────────
  currentProject: RecentProject | null;
  recentProjects: RecentProject[];

  // ─── Projects (Storyboard) ───────────────────────────────────────────────
  projects: Project[];
  activeProjectId: string | null;
  activeSceneId: string | null;
  storyboardImportDrafts: ImportDraft[];
  activeStoryboardImportDraftId: string | null;

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
  generationMode: GenerationMode;
  startFrameImage: string | null;
  endFrameImage: string | null;
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
    backendRunning?: boolean;
    bundledBackend?: boolean;
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

  // ─── Media Timeline Domain ───────────────────────────────────────────────
  mediaAssets: MediaAsset[];
  referenceSets: ReferenceSet[];
  timelineSequences: TimelineSequence[];
  timelineTracks: TimelineTrack[];
  timelineClips: TimelineClip[];
  clipGenerationBindings: ClipGenerationBinding[];
  activeTimelineSequenceId: string | null;
  activeTimelineClipId: string | null;

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

  // ─── Prompt Studio ──────────────────────────────────────────────────────────
  promptTemplates: PromptTemplate[];
  compositionLayers: CompositionLayerState;

  // ─── Generation Preview ──────────────────────────────────────────────────────
  stepImages: Map<number, string>;
  currentStep: number;
  totalSteps: number;
  isPreviewActive: boolean;

  // ─── Iteration History ──────────────────────────────────────────────────────
  iterationNodes: Map<string, IterationNode>;
  iterationBranches: IterationBranch[];
  activeIterationId: string | null;
  iterationView: IterationView;
  iterationComparisonMode: IterationComparisonMode;
  comparisonIds: ComparisonIds;

  // ─── Collections ──────────────────────────────────────────────────────────
  collections: Collection[];
  assetMetadata: Map<string, AssetMetadata>;
  availableTags: AssetTag[];
  taggingMode: TaggingMode;
  taggingQueue: string[];
  activeCollectionId: string | null;

  // ─── Timeline ──────────────────────────────────────────────────────────
  timelineMode: TimelineMode;
  playState: PlayState;
  currentTime: number;
  timelineFps: number;
  timelineLoop: boolean;
  timelineSpeed: number;
  onionSkinEnabled: boolean;
  onionSkinFrameCount: number;
  onionSkinOpacity: number;
  onionSkinDirection: 'prev' | 'next' | 'both';
  keyframes: Keyframe[];
  activeKeyframeId: string | null;

  // ─── Pipeline ──────────────────────────────────────────────────────────
  pipelines: PipelineDefinition[];
  activePipelineId: string | null;
  pipelineExecutions: PipelineExecution[];
  isPipelineBuilderOpen: boolean;

  // ─── Actions ─────────────────────────────────────────────────────────────

  // UI
  setActiveViewerItemId: (itemId: string | null) => void;
  setLeftDockWidth: (width: number) => void;
  setRightDockWidth: (width: number) => void;
  setRightDockCanvasRatios: (ratios: [number, number]) => void;
  setRightDockDualRatios: (ratios: [number, number]) => void;
  setRightDockTripleRatios: (ratios: [number, number, number]) => void;
  setReviewDensity: (density: ReviewDensity) => void;
  setGenerateSectionCollapsed: (sectionId: GenerateCollapsibleSectionId, collapsed: boolean) => void;
  setActiveTab: (tab: ActiveTab) => void;
  setActiveSubMode: (subMode: ActiveSubMode) => void;
  setCenterView: (view: CenterView) => void;

  // Resolution
  setAspectRatio: (ratio: AspectRatio) => void;
  setResolutionTier: (tier: ResolutionTier) => void;
  setCustomWidth: (width: number) => void;
  setCustomHeight: (height: number) => void;

  // Workflow
  setActiveWorkflow: (workflowId: string) => void;
  createWorkflow: (name: string) => WorkflowRecord;
  setWorkflowStatus: (workflowId: string, status: WorkflowRecord['status']) => void;
  setWorkflowRuntimeState: (workflowId: string, patch: Partial<WorkflowRuntimeState>) => void;
  resetWorkflowRuntimeState: (workflowId: string) => void;
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
  deleteCompletedJob: (jobId: string) => void;
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

  // Media timeline domain
  setActiveTimelineSequence: (id: string | null) => void;
  setActiveTimelineClip: (id: string | null) => void;
  upsertMediaAsset: (asset: MediaAsset) => void;
  removeMediaAsset: (assetId: string) => void;
  createReferenceSet: (params: {
    name: string;
    scope: ReferenceSet['scope'];
    projectId?: string | null;
    sceneId?: string | null;
    clipId?: string | null;
    items?: ReferenceSetItem[];
    notes?: string;
    tags?: string[];
  }) => ReferenceSet;
  updateReferenceSet: (
    id: string,
    updates: Partial<Omit<ReferenceSet, 'id' | 'createdAt'>>,
  ) => void;
  deleteReferenceSet: (id: string) => void;
  setElementReferenceSetLink: (
    projectId: string,
    elementId: string,
    referenceSetId: string,
    linked: boolean,
  ) => void;
  ensureTimelineSequenceForProject: (
    projectId: string,
    params?: { name?: string; fps?: number },
  ) => TimelineSequence | null;
  createTimelineTrack: (
    sequenceId: string,
    params?: {
      kind?: TimelineTrack['kind'];
      name?: string;
      locked?: boolean;
      muted?: boolean;
      hidden?: boolean;
    },
  ) => TimelineTrack | null;
  updateTimelineTrack: (
    trackId: string,
    updates: Partial<Omit<TimelineTrack, 'id' | 'sequenceId'>>,
  ) => void;
  deleteTimelineTrack: (trackId: string) => void;
  createTimelineClip: (params: {
    trackId: string;
    mediaAssetId: string;
    sceneId?: string | null;
    startMs: number;
    durationMs: number;
    sourceInMs?: number;
    sourceOutMs?: number;
    transitionIn?: TimelineTransition | null;
    transitionOut?: TimelineTransition | null;
    label?: string;
    posterUrl?: string | null;
    referenceSetIds?: string[];
    generationBindingId?: string | null;
  }) => TimelineClip | null;
  updateTimelineClip: (
    clipId: string,
    updates: Partial<Omit<TimelineClip, 'id' | 'trackId' | 'createdAt'>>,
  ) => void;
  moveTimelineClip: (clipId: string, updates: TimelineClipMoveOptions) => void;
  trimTimelineClip: (clipId: string, updates: TimelineClipTrimOptions) => void;
  splitTimelineClip: (clipId: string, splitMs: number) => TimelineSplitResult | null;
  duplicateTimelineClip: (clipId: string) => TimelineClip | null;
  setTimelineClipTransition: (
    clipId: string,
    edge: TimelineTransitionEdge,
    transition: TimelineTransition | null,
  ) => void;
  deleteTimelineClip: (clipId: string) => void;
  setTimelineSequencePlayRange: (sequenceId: string, range: TimelinePlayRange | null) => void;
  upsertClipGenerationBinding: (binding: ClipGenerationBinding) => void;

  // Video generation
  setGenerationMode: (mode: GenerationMode) => void;
  setStartFrameImage: (image: string | null) => void;
  setEndFrameImage: (image: string | null) => void;

  // Generation draft & advanced generation
  setGenerationDraft: (draft: GenerationDraft | null) => void;
  updateAdvancedGeneration: (patch: Partial<AppState['advancedGeneration']>) => void;

  // Prompt Studio
  addUserPromptTemplate: (template: PromptTemplate) => void;
  deleteUserPromptTemplate: (id: string) => void;
  togglePromptTemplateFavorite: (id: string) => void;
  setCompositionLayerVisibility: (layer: keyof CompositionLayerState, visible: boolean) => void;
  setCompositionLayerOpacity: (layer: keyof CompositionLayerState, opacity: number) => void;
  applyPromptTemplate: (id: string, mode: 'replace' | 'merge') => void;

  // Generation Preview
  addStepImage: (step: number, imageData: string) => void;
  setTotalSteps: (total: number) => void;
  clearPreview: () => void;
  setPreviewActive: (active: boolean) => void;

  // Iteration History
  addIteration: (params: { job: GenerationJob; parentId: string | null; thumbnail: string; branchId?: string }) => void;
  forkIteration: (params: { job: GenerationJob; parentId: string; thumbnail: string }) => void;
  pinIteration: (id: string) => void;
  setIterationNote: (id: string, note: string) => void;
  setActiveIteration: (id: string | null) => void;
  setIterationView: (view: IterationView) => void;
  setIterationComparisonMode: (mode: IterationComparisonMode) => void;
  setComparisonIds: (ids: ComparisonIds) => void;
  toggleIterationComparison: (id: string) => void;
  swapIterationComparison: () => void;
  clearIterationComparison: () => void;
  deleteIterationBranch: (branchId: string) => void;

  // Collections
  createCollection: (params: { name: string; type: Collection['type']; smartQuery?: SmartQuery; isAutoGenerated?: boolean }) => void;
  deleteCollection: (id: string) => void;
  renameCollection: (id: string, name: string) => void;
  addAssetToCollection: (collectionId: string, assetId: string) => void;
  removeAssetFromCollection: (collectionId: string, assetId: string) => void;
  createSmartCollection: (params: { name: string; smartQuery: SmartQuery; isAutoGenerated?: boolean }) => void;
  refreshSmartCollection: (id: string) => void;
  analyzeAssets: (assetIds: string[]) => void;
  setTaggingMode: (mode: TaggingMode) => void;
  addUserTag: (tag: AssetTag) => void;
  removeUserTag: (tagId: string) => void;
  setActiveCollection: (id: string | null) => void;

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
    updates: Partial<Pick<Project, 'name' | 'dimensions' | 'fps' | 'metadata' | 'timelineSequenceId' | 'referenceSetIds'>>,
  ) => void;
  upsertStoryboardImportDraft: (draft: ImportDraft) => ImportDraft;
  createStoryboardImportDraftFromText: (
    projectId: string,
    sourceText: string,
    options?: {
      title?: string;
    },
  ) => ImportDraft | null;
  commitStoryboardImportDraft: (
    draftId: string,
  ) => {
    projectId: string;
    sceneIds: string[];
    elementIds: string[];
  } | null;
  deleteStoryboardImportDraft: (id: string) => void;
  setActiveStoryboardImportDraft: (id: string | null) => void;

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
  createCanvasControlLayer: (
    sceneId: string,
    config?: Partial<Omit<CanvasControlLayer, 'id' | 'sceneId'>>,
  ) => CanvasControlLayer | null;
  updateCanvasControlLayer: (
    sceneId: string,
    layerId: string,
    updates: Partial<Omit<CanvasControlLayer, 'id' | 'sceneId'>>,
  ) => void;
  deleteCanvasControlLayer: (sceneId: string, layerId: string) => void;
  duplicateCanvasControlLayer: (sceneId: string, layerId: string) => CanvasControlLayer | null;
  reorderCanvasControlLayers: (sceneId: string, layerIds: string[]) => void;
  setActiveCanvasControlLayerId: (sceneId: string, layerId: string | null) => void;

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

  // Timeline
  setTimelineMode: (mode: TimelineMode) => void;
  timelinePlay: () => void;
  timelinePause: () => void;
  timelineStop: () => void;
  toggleTimelinePlayback: () => void;
  seekTo: (time: number) => void;
  seekBy: (deltaMs: number) => void;
  setTimelineFps: (fps: number) => void;
  setTimelineSpeed: (speed: number) => void;
  toggleTimelineLoop: () => void;
  setOnionSkinEnabled: (enabled: boolean) => void;
  setOnionSkinFrameCount: (count: number) => void;
  setOnionSkinOpacity: (opacity: number) => void;
  setOnionSkinDirection: (dir: 'prev' | 'next' | 'both') => void;
  addKeyframe: (kf: Keyframe) => void;
  updateKeyframe: (id: string, updates: Partial<Keyframe>) => void;
  deleteKeyframe: (id: string) => void;
  setActiveKeyframeId: (id: string | null) => void;

  // Pipeline
  createPipeline: (params: { name: string; description: string; steps: import('@/types/pipeline').PipelineStep[] }) => void;
  updatePipeline: (id: string, updates: Partial<Pick<PipelineDefinition, 'name' | 'description' | 'steps'>>) => void;
  deletePipeline: (id: string) => void;
  duplicatePipeline: (id: string, newName: string) => void;
  runPipeline: (pipelineId: string, sourceImageId: string) => void;
  cancelPipelineExecution: (executionId: string) => void;
  setActivePipelineId: (id: string | null) => void;
  setPipelineBuilderOpen: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// Helper types for slice creators
// ---------------------------------------------------------------------------

export type AppSet = (
  partial: Partial<AppState> | ((state: AppState) => Partial<AppState>),
) => void;

export type AppGet = () => AppState;
