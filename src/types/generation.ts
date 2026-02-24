export interface PromptHistoryEntry {
  id: string;
  prompt: string;
  negativePrompt: string;
  timestamp: Date;
  model: string;
  result?: string; // thumbnail path
}

export interface StylePreset {
  id: string;
  name: string;
  modifier: string;
  color: string; // hex color for the chip
  category: 'cinematic' | 'anime' | 'realistic' | 'artistic' | 'creative';
  isCustom: boolean;
}

export interface GenerationQueueItem {
  id: string;
  prompt: string;
  thumbnail?: string;
  params: Record<string, any>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
}

export interface BatchResult {
  id: string;
  batchId: string;
  promptIndex: number;
  prompt: string;
  imagePath: string;
  seed: number;
  generationTime: number;
  params: Record<string, any>;
  createdAt: Date;
  isFavorite: boolean;
}

export interface LoRAConfig {
  id: string;
  name: string;
  triggerWord: string;
  weight: number;
  color: string;
}

export interface ControlNetConfig {
  enabled: boolean;
  preprocessor: 'canny' | 'depth' | 'openpose' | 'scribble' | 'segmentation' | 'normal';
  referenceImage?: string;
  strength: number;
  startStep: number;
  endStep: number;
}

export const BUILT_IN_STYLE_PRESETS: StylePreset[] = [
  { id: 'cinematic', name: 'Cinematic', modifier: 'cinematic lighting, film grain, dramatic atmosphere, movie still', color: '#e63946', category: 'cinematic', isCustom: false },
  { id: 'anime', name: 'Anime', modifier: 'anime style, cel shading, vibrant colors, Studio Ghibli inspired', color: '#ff6b9d', category: 'anime', isCustom: false },
  { id: 'photorealistic', name: 'Photorealistic', modifier: 'photorealistic, 8k UHD, DSLR, sharp focus, professional photography', color: '#4ecdc4', category: 'realistic', isCustom: false },
  { id: 'oil-painting', name: 'Oil Painting', modifier: 'oil painting, textured brushstrokes, classical art, rich colors', color: '#f4a261', category: 'artistic', isCustom: false },
  { id: 'watercolor', name: 'Watercolor', modifier: 'watercolor painting, soft washes, flowing pigment, paper texture', color: '#a8dadc', category: 'artistic', isCustom: false },
  { id: '3d-render', name: '3D Render', modifier: '3D render, octane render, CGI, volumetric lighting, ray tracing', color: '#6c5ce7', category: 'creative', isCustom: false },
  { id: 'pixel-art', name: 'Pixel Art', modifier: 'pixel art, 16-bit, retro game style, limited palette', color: '#00b894', category: 'creative', isCustom: false },
  { id: 'line-art', name: 'Line Art', modifier: 'line art, ink drawing, clean lines, detailed illustration', color: '#636e72', category: 'artistic', isCustom: false },
  { id: 'comic-book', name: 'Comic Book', modifier: 'comic book art, bold lines, halftone dots, dynamic composition', color: '#fdcb6e', category: 'creative', isCustom: false },
  { id: 'neon', name: 'Neon', modifier: 'neon lights, cyberpunk, glowing, dark background, vivid colors', color: '#e17055', category: 'creative', isCustom: false },
];
