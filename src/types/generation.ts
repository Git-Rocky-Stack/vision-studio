import type { BoundingBox, MaskType, Point } from './project';

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
  category: 'cinematic' | 'anime' | 'realistic' | 'artistic' | 'creative' | 'photography' | 'illustration' | 'abstract';
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
  assetPath?: string;
  seed: number;
  generationTime: number;
  params: Record<string, any>;
  createdAt: Date;
  isFavorite: boolean;
}

export interface GenerationDraft {
  generationType: 'image' | 'video';
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  model: string;
  scheduler: string;
  seed: number;
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

export interface GenerationMaskPayload {
  type: MaskType;
  points: Point[];
  bounds: BoundingBox;
}

export interface GenerationControlNetLayerPayload {
  layer_id: string;
  layer_name: string;
  source_path: string;
  preprocessor: ControlNetConfig['preprocessor'] | string;
  strength: number;
  start_step: number;
  end_step: number;
  mask: GenerationMaskPayload;
  prompt?: string;
  negative_prompt?: string;
}

export interface GenerationReferenceImageLayerPayload {
  layer_id: string;
  layer_name: string;
  source_path: string;
  mask: GenerationMaskPayload;
}

export interface GenerationInpaintPayload {
  layer_id: string;
  layer_name: string;
  image_path: string;
  mask: GenerationMaskPayload;
  prompt?: string;
  negative_prompt?: string;
}

export type GenerationMode = 'image' | 'video';

export interface VideoFrameInput {
  id: string;
  imageData: string;   // data URL or file path
  label: string;       // 'Start Frame' | 'End Frame'
}

/**
 * M9: per-request acceleration toggles, snake_case for the Python backend.
 * Each optimization is a tri-state string ('auto' | 'on' | 'off'); 'auto' lets
 * the backend decide from the hardware fit, 'on'/'off' force the toggle.
 */
export interface AccelerationRequestPayload {
  master_enable: boolean;
  sdpa: string;
  channels_last: string;
  compile: string;
  quantization: string;
  attention_slicing: string;
  tensorrt: string;
}

/** #136: one LoRA adapter to stack, by installed model id + weight (0-2). */
export interface LoraSelectionPayload {
  id: string;
  weight: number;
}

export interface ImageGenerationRequestPayload {
  prompt: string;
  negative_prompt?: string;
  width: number;
  height: number;
  steps: number;
  cfg_scale: number;
  seed?: number;
  model?: string;
  scheduler?: string;
  controlnet?: GenerationControlNetLayerPayload[];
  reference_images?: GenerationReferenceImageLayerPayload[];
  image_path?: string;
  mask?: GenerationMaskPayload;
  inpaint?: GenerationInpaintPayload;
  /** M6: per-request hosted provider override for over-budget fallback routing. */
  __providerOverride?: 'openrouter' | 'huggingface';
  /** M9: optional per-request acceleration toggles (local generation only). */
  acceleration_settings?: AccelerationRequestPayload;
  /** #136: local-only LoRA adapters to stack (Local route only). */
  loras?: LoraSelectionPayload[];
}

export const BUILT_IN_STYLE_PRESETS: StylePreset[] = [
  // Cinematic
  { id: 'cinematic', name: 'Cinematic', modifier: 'cinematic lighting, film grain, dramatic atmosphere, movie still', color: 'var(--color-feature-01)', category: 'cinematic', isCustom: false },
  { id: 'noir', name: 'Film Noir', modifier: 'film noir, high contrast black and white, dramatic shadows, venetian blinds light', color: '#2d3436', category: 'cinematic', isCustom: false },
  { id: 'golden-hour', name: 'Golden Hour', modifier: 'golden hour lighting, warm tones, long shadows, sunset glow', color: '#f0932b', category: 'cinematic', isCustom: false },
  { id: 'teal-orange', name: 'Teal & Orange', modifier: 'teal and orange color grading, blockbuster movie look, complementary colors', color: '#e17055', category: 'cinematic', isCustom: false },
  // Anime
  { id: 'anime', name: 'Anime', modifier: 'anime style, cel shading, vibrant colors, Studio Ghibli inspired', color: 'var(--color-feature-05)', category: 'anime', isCustom: false },
  { id: 'manga', name: 'Manga', modifier: 'manga style, black and white ink, screentone, dramatic action lines', color: '#636e72', category: 'anime', isCustom: false },
  { id: 'ghibli', name: 'Ghibli', modifier: 'Studio Ghibli style, lush watercolor backgrounds, whimsical, soft lighting', color: '#00b894', category: 'anime', isCustom: false },
  // Realistic / Photography
  { id: 'photorealistic', name: 'Photorealistic', modifier: 'photorealistic, 8k UHD, DSLR, sharp focus, professional photography', color: 'var(--color-feature-06)', category: 'photography', isCustom: false },
  { id: 'portrait', name: 'Portrait', modifier: 'professional portrait photography, bokeh background, soft lighting, 85mm lens', color: '#fd79a8', category: 'photography', isCustom: false },
  { id: 'macro', name: 'Macro', modifier: 'macro photography, extreme close-up, shallow depth of field, razor sharp detail', color: '#00cec9', category: 'photography', isCustom: false },
  { id: 'fashion', name: 'Fashion', modifier: 'fashion photography, editorial, studio lighting, high-end retouching, vogue style', color: '#a29bfe', category: 'photography', isCustom: false },
  { id: 'product', name: 'Product Shot', modifier: 'product photography, clean white background, studio lighting, commercial look', color: '#dfe6e9', category: 'photography', isCustom: false },
  // Artistic
  { id: 'oil-painting', name: 'Oil Painting', modifier: 'oil painting, textured brushstrokes, classical art, rich colors', color: 'var(--color-feature-04)', category: 'artistic', isCustom: false },
  { id: 'watercolor', name: 'Watercolor', modifier: 'watercolor painting, soft washes, flowing pigment, paper texture', color: 'var(--color-feature-08)', category: 'artistic', isCustom: false },
  { id: 'pastel', name: 'Pastel', modifier: 'pastel drawing, soft muted colors, chalky texture, gentle blending', color: '#fab1a0', category: 'artistic', isCustom: false },
  { id: 'pencil-sketch', name: 'Pencil Sketch', modifier: 'pencil sketch, graphite drawing, cross-hatching, detailed shading', color: '#b2bec3', category: 'illustration', isCustom: false },
  { id: 'ink-wash', name: 'Ink Wash', modifier: 'ink wash painting, sumi-e style, black ink gradients, minimalist composition', color: '#2d3436', category: 'artistic', isCustom: false },
  // Illustration
  { id: 'line-art', name: 'Line Art', modifier: 'line art, ink drawing, clean lines, detailed illustration', color: '#636e72', category: 'illustration', isCustom: false },
  { id: 'comic-book', name: 'Comic Book', modifier: 'comic book art, bold lines, halftone dots, dynamic composition', color: 'var(--color-feature-07)', category: 'illustration', isCustom: false },
  { id: 'storybook', name: 'Storybook', modifier: 'childrens book illustration, whimsical, soft colors, hand-drawn feel', color: '#ffeaa7', category: 'illustration', isCustom: false },
  { id: 'concept-art', name: 'Concept Art', modifier: 'concept art, digital painting, matte painting, environment design', color: '#74b9ff', category: 'illustration', isCustom: false },
  // Creative
  { id: '3d-render', name: '3D Render', modifier: '3D render, octane render, CGI, volumetric lighting, ray tracing', color: 'var(--color-feature-02)', category: 'creative', isCustom: false },
  { id: 'pixel-art', name: 'Pixel Art', modifier: 'pixel art, 16-bit, retro game style, limited palette', color: 'var(--color-feature-03)', category: 'creative', isCustom: false },
  { id: 'neon', name: 'Neon', modifier: 'neon lights, cyberpunk, glowing, dark background, vivid colors', color: '#e17055', category: 'creative', isCustom: false },
  { id: 'isometric', name: 'Isometric', modifier: 'isometric view, 3D perspective, clean vector, miniature world', color: '#55efc4', category: 'creative', isCustom: false },
  // Abstract
  { id: 'abstract', name: 'Abstract', modifier: 'abstract art, geometric shapes, bold colors, non-representational', color: '#fd79a8', category: 'abstract', isCustom: false },
  { id: 'psychedelic', name: 'Psychedelic', modifier: 'psychedelic art, trippy colors, morphing patterns, surreal distortion', color: '#a29bfe', category: 'abstract', isCustom: false },
];
