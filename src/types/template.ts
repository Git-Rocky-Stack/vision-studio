export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  category: 'social' | 'youtube' | 'marketing' | 'art';
  thumbnail: string;
  settings: {
    width: number;
    height: number;
    model: string;
    steps: number;
    cfgScale: number;
    prompt: string;
    negativePrompt: string;
  };
  isCustom?: boolean;
}