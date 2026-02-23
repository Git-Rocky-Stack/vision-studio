#!/usr/bin/env node
/**
 * First-time setup: Download AI models
 * This runs on first launch to download models (too large to bundle)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const MODELS_DIR = path.join(process.resourcesPath, 'models');

const MODELS = [
  {
    id: 'sd-1-5',
    name: 'Stable Diffusion 1.5',
    repo: 'runwayml/stable-diffusion-v1-5',
    file: 'v1-5-pruned-emaonly.safetensors',
    size: '4.3 GB',
    required: true
  },
  {
    id: 'sdxl-base',
    name: 'Stable Diffusion XL',
    repo: 'stabilityai/stable-diffusion-xl-base-1.0',
    file: 'sd_xl_base_1.0.safetensors',
    size: '6.9 GB',
    required: false
  },
];

async function downloadModel(model, onProgress) {
  console.log(`Downloading ${model.name}...`);
  // Implementation would download from HuggingFace
  // For now, just create directory structure
  const modelDir = path.join(MODELS_DIR, 'checkpoints');
  if (!fs.existsSync(modelDir)) {
    fs.mkdirSync(modelDir, { recursive: true });
  }
}

module.exports = { MODELS, downloadModel };
