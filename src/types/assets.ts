export interface AssetRecord {
  id: string;
  jobId: string;
  name: string;
  type: 'image' | 'video' | 'audio';
  path: string;
  previewUrl: string;
  thumbnail: string;
  createdAt: string;
  prompt: string;
  negativePrompt: string;
  model?: string;
  width?: number;
  height?: number;
  fps?: number;
  duration?: number;
  seed?: number;
  favorite: boolean;
  params: Record<string, unknown>;
}

export interface AssetJobStatus {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  type: 'image' | 'video';
  created_at: string;
  completed_at?: string;
  error?: string;
  result?: {
    images?: string[];
    video?: string;
    duration?: number;
    seed?: number;
    [key: string]: unknown;
  };
  params?: Record<string, unknown>;
}

export interface DerivedAssetResult {
  image: string;
  output_path: string;
  width: number;
  height: number;
}
