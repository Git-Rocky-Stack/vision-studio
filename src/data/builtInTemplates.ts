import type { PromptTemplate } from '../types/promptStudio';

export const BUILT_IN_PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'cinematic-portrait',
    name: 'Cinematic Portrait',
    description:
      'Professional portrait with dramatic studio lighting, shallow depth of field, and cinematic color grading for film-like headshots.',
    category: 'portrait',
    promptText:
      'professional portrait, dramatic studio lighting, shallow depth of field, film grain, (detailed skin texture:1.3), cinematic color grading',
    negativePrompt:
      'blurry, low quality, distorted face, deformed, cartoon, anime, watermark, text, logo',
    suggestedSettings: {
      model: 'sd-xl',
      aspectRatio: '2:3',
      steps: 30,
      cfgScale: 7,
      scheduler: 'DPM++ 2M Karras',
    },
    isBuiltIn: true,
    isFavorite: false,
    createdAt: Date.now(),
  },
  {
    id: 'landscape-vista',
    name: 'Landscape Vista',
    description:
      'Expansive landscape photography with golden hour lighting, dramatic skies, and vivid natural colors for breathtaking scenery.',
    category: 'landscape',
    promptText:
      'expansive landscape vista, (golden hour lighting:1.2), dramatic sky, vivid colors, rolling hills, professional landscape photography',
    negativePrompt:
      'blurry, low quality, overexposed, flat lighting, noisy, grainy, watermark, text',
    suggestedSettings: {
      model: 'sd-xl',
      aspectRatio: '16:9',
      steps: 28,
      cfgScale: 6.5,
      scheduler: 'DPM++ 2M Karras',
    },
    isBuiltIn: true,
    isFavorite: false,
    createdAt: Date.now(),
  },
  {
    id: 'product-studio',
    name: 'Product Studio',
    description:
      'Clean product photography with white background, studio lighting, and commercial-quality rendering for e-commerce and catalog imagery.',
    category: 'product',
    promptText:
      'professional product photography, (clean white background:1.3), studio lighting, sharp focus, commercial quality, soft shadows',
    negativePrompt:
      'dirty background, cluttered, blurry, low quality, watermark, text, logo, distorted',
    suggestedSettings: {
      model: 'sd-xl',
      aspectRatio: '1:1',
      steps: 25,
      cfgScale: 7.5,
      scheduler: 'Euler a',
    },
    isBuiltIn: true,
    isFavorite: false,
    createdAt: Date.now(),
  },
  {
    id: 'abstract-art',
    name: 'Abstract Art',
    description:
      'Vibrant abstract art with flowing organic forms, dynamic composition, and richly textured surfaces for expressive visual pieces.',
    category: 'abstract',
    promptText:
      '[realistic] abstract art, (vibrant colors:1.4), flowing organic forms, dynamic composition, textured surface, artistic expression',
    negativePrompt:
      'photograph, realistic face, text, watermark, blurry, low contrast, muted colors',
    suggestedSettings: {
      model: 'sd-xl',
      aspectRatio: '1:1',
      steps: 30,
      cfgScale: 8,
      scheduler: 'DPM++ SDE Karras',
    },
    isBuiltIn: true,
    isFavorite: false,
    createdAt: Date.now(),
  },
  {
    id: 'cinematic-scene',
    name: 'Cinematic Scene',
    description:
      'Movie-quality scene composition with anamorphic lens flare, film grain, dramatic lighting, and professional color grading.',
    category: 'cinematic',
    promptText:
      '(cinematic composition:1.3), film grain, anamorphic lens flare, dramatic lighting, movie still, high production value, color graded',
    negativePrompt:
      'cartoon, anime, low quality, blurry, watermark, text, amateur, flat lighting',
    suggestedSettings: {
      model: 'sd-xl',
      aspectRatio: '21:9',
      steps: 30,
      cfgScale: 7,
      scheduler: 'DPM++ 2M Karras',
    },
    isBuiltIn: true,
    isFavorite: false,
    createdAt: Date.now(),
  },
  {
    id: 'anime-illustration',
    name: 'Anime Illustration',
    description:
      'Professional anime-style illustration with clean line art, vibrant colors, detailed eyes, and cel shading for character and scene art.',
    category: 'artistic',
    promptText:
      '(anime style:1.4), clean line art, vibrant colors, detailed eyes, dynamic pose, cel shading, professional illustration',
    negativePrompt:
      'photograph, realistic, 3d render, blurry, low quality, watermark, text, rough sketch',
    suggestedSettings: {
      model: 'sd-xl',
      aspectRatio: '3:4',
      steps: 28,
      cfgScale: 7,
      scheduler: 'Euler a',
    },
    isBuiltIn: true,
    isFavorite: false,
    createdAt: Date.now(),
  },
  {
    id: 'concept-art',
    name: 'Concept Art',
    description:
      'Professional concept art with environment design, detailed architecture, atmospheric perspective, and matte painting style for world-building.',
    category: 'artistic',
    promptText:
      'concept art, (environment design:1.2), detailed architecture, atmospheric perspective, professional illustration, matte painting style',
    negativePrompt:
      'photograph, blurry, low quality, watermark, text, amateur, flat, simple',
    suggestedSettings: {
      model: 'sd-xl',
      aspectRatio: '16:9',
      steps: 35,
      cfgScale: 7.5,
      scheduler: 'DPM++ 2M Karras',
    },
    isBuiltIn: true,
    isFavorite: false,
    createdAt: Date.now(),
  },
  {
    id: 'macro-photography',
    name: 'Macro Photography',
    description:
      'Extreme close-up macro photography with shallow depth of field, sharp focus on intricate details, and professional studio lighting.',
    category: 'product',
    promptText:
      '(macro photography:1.4), extreme close-up, shallow depth of field, sharp focus, detailed texture, professional studio lighting',
    negativePrompt:
      'wide angle, landscape, blurry, low quality, noisy, watermark, text, distorted',
    suggestedSettings: {
      model: 'sd-xl',
      aspectRatio: '1:1',
      steps: 30,
      cfgScale: 7.5,
      scheduler: 'DPM++ 2M Karras',
    },
    isBuiltIn: true,
    isFavorite: false,
    createdAt: Date.now(),
  },
];