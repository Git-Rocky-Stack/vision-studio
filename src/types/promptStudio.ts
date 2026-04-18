export interface PromptToken {
  text: string;
  weight: number;
  syntaxType: 'normal' | 'weighted' | 'emphasis' | 'deemphasis';
  startIndex: number;
  endIndex: number;
}

export interface ParsedPrompt {
  rawText: string;
  tokens: PromptToken[];
  tokenCount: number;
  exceedsLimit: boolean;
}

export type PromptTemplateCategory =
  | 'portrait'
  | 'landscape'
  | 'product'
  | 'abstract'
  | 'cinematic'
  | 'artistic'
  | 'custom';

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  category: PromptTemplateCategory;
  promptText: string;
  negativePrompt?: string;
  suggestedSettings?: {
    model?: string;
    aspectRatio?: string;
    steps?: number;
    cfgScale?: number;
    scheduler?: string;
  };
  referenceImage?: string;
  isBuiltIn: boolean;
  isFavorite: boolean;
  createdAt: number;
  lastUsedAt?: number;
}

export interface CompositionLayerState {
  aspectFrame: { visible: boolean; opacity: number };
  reference: { visible: boolean; opacity: number; blendMode: 'normal' | 'overlay' | 'multiply' };
  controlNet: { visible: boolean; opacity: number };
  regionMasks: { visible: boolean; opacity: number };
}