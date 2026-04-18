export type ModelStatus = 'ready' | 'downloading' | 'error' | 'not_found';

export interface ModelInfo {
  id: string;
  name: string;
  size?: string;
  status: ModelStatus;
  progress?: number;
  type?: string;
  format?: string;
}