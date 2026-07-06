#!/usr/bin/env node
/**
 * Fetches the four MIT-licensed Tiny-VAE (taesd) preview decoders (#33) into
 * resources/preview-decoders/. Heavy-by-design: these SHIP IN THE INSTALLER
 * (MIT allows redistribution), unlike checkpoint weights which stay per-user
 * behind the consent-gated Foundry.
 *
 * Idempotent: files already present with plausible sizes are kept.
 */

const fs = require('fs');
const path = require('path');

const DECODERS = ['taesd', 'taesdxl', 'taesd3', 'taef1'];
const FILES = [
  { name: 'config.json', minBytes: 100 },
  { name: 'diffusion_pytorch_model.safetensors', minBytes: 1024 * 1024 },
];
const TARGET_ROOT = path.join(__dirname, '..', 'resources', 'preview-decoders');

function hasPlausibleFile(filePath, minBytes) {
  try {
    return fs.statSync(filePath).size >= minBytes;
  } catch {
    return false;
  }
}

async function download(url, destination) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Download failed (HTTP ${response.status}) for ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destination, buffer);
  return buffer.length;
}

async function fetchDecoder(name) {
  const dir = path.join(TARGET_ROOT, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const file of FILES) {
    const destination = path.join(dir, file.name);
    if (hasPlausibleFile(destination, file.minBytes)) {
      console.log(`  ${name}/${file.name} already present, skipping`);
      continue;
    }
    const url = `https://huggingface.co/madebyollin/${name}/resolve/main/${file.name}`;
    console.log(`  downloading ${name}/${file.name} ...`);
    const bytes = await download(url, destination);
    if (bytes < file.minBytes) {
      fs.rmSync(destination, { force: true });
      throw new Error(`${name}/${file.name} downloaded truncated (${bytes} bytes)`);
    }
    console.log(`  ${name}/${file.name} done (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
  }
}

async function main() {
  console.log('Fetching Tiny-VAE preview decoders into resources/preview-decoders ...');
  fs.mkdirSync(TARGET_ROOT, { recursive: true });
  for (const name of DECODERS) {
    await fetchDecoder(name);
  }
  fs.writeFileSync(
    path.join(TARGET_ROOT, 'ATTRIBUTION.txt'),
    [
      'Tiny AutoEncoder preview decoders (taesd family)',
      'Source: https://huggingface.co/madebyollin (taesd, taesdxl, taesd3, taef1)',
      'License: MIT (c) Ollin Boer Bohan',
      'Fetched by scripts/fetch-preview-decoders.cjs for the Studio live step preview (#33).',
      '',
    ].join('\n'),
  );
  console.log('Preview decoders ready.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
