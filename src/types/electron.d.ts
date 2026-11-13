/**
 * Type definitions for the Electron API exposed via contextBridge.
 *
 * Derived from the single IPC contract (shared/ipcContract.ts) that the
 * preload builds `window.electron` from and the main process validates every
 * call against. Do not hand-write bridge signatures here: change the contract.
 */

import type { ImageGenerationRequestPayload } from './generation';
import type {
  BatchRequest,
  ElectronAPI as ContractElectronAPI,
  TimelineExportRequest,
  VideoGenerationRequest,
} from '../../shared/ipcContract';

export type ElectronAPI = ContractElectronAPI;

export type {
  BackendStatus,
  BackendStatusChangedEvent,
  BackendStatusSnapshot,
  BridgeFailure,
  DerivedImageResult,
  ExtractedFrameResult,
  GenerationProgressEvent,
  ImportedAssetFile,
  JobResponse,
  JobStatus,
  OpenRouterKeyInfo,
  OpenRouterModelSummary,
  OpenRouterUsageSnapshot,
  ProvisionModelEntry,
  ProvisionStatusSnapshot,
  ResolvedAppSettings,
  StepImageEvent,
  SystemInfo,
  UpdaterStatus,
  UserAccountSummary,
  UserAccountsSnapshot,
} from '../../shared/ipcTypes';

export type GenerationParams = ImageGenerationRequestPayload;
export type VideoGenerationParams = VideoGenerationRequest;
export type BatchParams = BatchRequest;
export type TimelineExportParams = TimelineExportRequest;
export type TimelineExportFrameParams = TimelineExportParams['frames'][number];
export type TimelineExportLayerParams = TimelineExportFrameParams['layers'][number];
export type TimelineExportAudioLayerParams = TimelineExportParams['audio_layers'][number];

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

export {};
