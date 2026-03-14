/**
 * UI_STRINGS — centralised string constants for all hardcoded UI text.
 *
 * Purpose: i18n preparation (Suggestion 16 from design review).
 * Usage:   import { UI_STRINGS } from '@/constants/strings';
 *
 * Do NOT import this file from hot paths that run at render time without
 * memoisation — the object is `as const` and therefore referentially stable,
 * so direct property access is zero-cost.
 */

export const UI_STRINGS = {
  // ─── Common actions ───────────────────────────────────────────────────────
  actions: {
    generate: 'Generate',
    cancel: 'Cancel',
    delete: 'Delete',
    save: 'Save',
    export: 'Export',
    retry: 'Retry',
    close: 'Close',
    browse: 'Browse',
    download: 'Download',
    remove: 'Remove',
    clearCache: 'Clear Cache',
    selectAll: 'Select all',
    deselectAll: 'Deselect all',
  },

  // ─── Status messages ──────────────────────────────────────────────────────
  status: {
    loading: 'Loading...',
    generating: 'Generating...',
    processing: 'Processing...',
    complete: 'Complete',
    failed: 'Failed',
    idle: 'Idle',
    ready: 'Ready',
  },

  // ─── Empty states ─────────────────────────────────────────────────────────
  empty: {
    noAssets: 'No assets yet',
    noAssetsHint: 'Generate some content to see it here',
    noResults: 'No results yet',
    noLayers: 'No layers',
    noLayersHint: 'Load an image to start',
    noModels: 'No models reported by the backend yet.',
    noGenerations: 'No generations to compare',
    canvasPlaceholder: 'Create something extraordinary',
    canvasHint: 'Generate images and videos to see them here',
    editPlaceholder: 'Load an image to start editing',
    editHint: 'Generate an image or drag one onto the canvas',
  },

  // ─── Panel titles (sidebar navigation labels) ─────────────────────────────
  panels: {
    generate: 'Generate',
    edit: 'Edit',
    assets: 'Assets',
    settings: 'Settings',
    templates: 'Templates',
    batch: 'Batch',
  },

  // ─── Settings section titles and descriptions ─────────────────────────────
  settings: {
    generalTitle: 'General Settings',
    generalDescription: 'Manage your project and output preferences',
    aiTitle: 'AI & Models',
    aiDescription: 'Configure AI generation settings and hardware',
    appearanceTitle: 'Appearance',
    appearanceDescription: 'Customize the look and feel of the app',
    notificationsTitle: 'Notifications',
    notificationsDescription: 'Control desktop alerts for generation and model events.',
  },

  // ─── Prompt textarea placeholders ─────────────────────────────────────────
  prompts: {
    imagePlaceholder: 'Describe the image you want to create...',
    videoPlaceholder: 'Describe the video you want to create...',
    negativePlaceholder: 'Things to avoid in the generation...',
  },

  // ─── Error messages ───────────────────────────────────────────────────────
  errors: {
    imageLoadFailed: 'Failed to load image',
    imageCorrupted: 'The file may be corrupted or missing',
    somethingWentWrong: 'Something went wrong',
    unexpectedError: 'An unexpected error occurred',
  },
} as const;

export type UIStrings = typeof UI_STRINGS;
