export type MediaAssetType = 'image' | 'video' | 'audio';

export type MediaAssetSource = 'generated' | 'imported' | 'derived';

export type ReferenceSlotType = 'style' | 'composition' | 'character' | 'pose' | 'motion';

export interface MediaAsset {
  id: string;
  legacyAssetId?: string | null;
  jobId?: string | null;
  name: string;
  type: MediaAssetType;
  source: MediaAssetSource;
  path: string;
  previewUrl: string;
  thumbnailUrl: string;
  posterUrl: string | null;
  width?: number;
  height?: number;
  durationMs?: number;
  fps?: number;
  waveformSummary?: number[];
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ReferenceSetItem {
  id: string;
  slot: ReferenceSlotType;
  mediaAssetId?: string | null;
  path?: string | null;
  label?: string;
  notes?: string;
  orderIndex: number;
}

export interface ReferenceSet {
  id: string;
  name: string;
  scope: 'project' | 'scene' | 'clip' | 'adhoc';
  projectId: string | null;
  sceneId: string | null;
  clipId: string | null;
  items: ReferenceSetItem[];
  notes: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}
