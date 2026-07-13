/**
 * #42 live verification: one funded round-trip of the HuggingFace LoRA
 * adapter-by-model-id contract, using the exact dispatch the app ships
 * (official @huggingface/inference client, provider 'auto', Hub LoRA repo id
 * AS the model - see electron/services/huggingfaceInference.ts).
 *
 * Usage (PowerShell):
 *   $env:HF_TOKEN = 'hf_...'; node scripts/verify-hf-lora-adapter.mjs
 * Usage (bash):
 *   HF_TOKEN=hf_... node scripts/verify-hf-lora-adapter.mjs
 *
 * Cost: one flux-LoRA text-to-image run on the resolved provider (fal-ai as
 * of 2026-07-12), billed to the token's HuggingFace account. The token is
 * read from the environment only and never written anywhere.
 */
import { writeFileSync } from 'node:fs';
import { textToImage } from '@huggingface/inference';

const ADAPTER_REPO_ID = process.argv[2] ?? 'XLabs-AI/flux-RealismLora';
const OUTPUT_PATH = 'verify-hf-lora-adapter.png';

const token = process.env.HF_TOKEN ?? process.env.HUGGING_FACE_HUB_TOKEN;
if (!token) {
  console.error('Set HF_TOKEN (a funded HuggingFace token) before running.');
  process.exit(1);
}

const IMAGE_MAGIC = [
  { mime: 'image/png', test: (b) => b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: 'image/jpeg', test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/webp',
    test: (b) =>
      b.length >= 12 && b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP',
  },
];

console.log(`Adapter: ${ADAPTER_REPO_ID} (passed AS the model - adapter-by-model-id)`);
const startedAt = Date.now();

try {
  // Mirrors defaultAdapterTextToImage in huggingfaceInference.ts exactly.
  const blob = await textToImage(
    {
      accessToken: token,
      model: ADAPTER_REPO_ID,
      provider: 'auto',
      inputs: 'a weathered lighthouse at dusk, photorealistic',
      parameters: { width: 512, height: 512, seed: 42 },
    },
    { retry_on_error: false, outputType: 'blob' },
  );

  const buffer = Buffer.from(await blob.arrayBuffer());
  const match = IMAGE_MAGIC.find((candidate) => candidate.test(buffer));
  if (!match) {
    console.error(`FAIL: response is not a recognized image payload (${buffer.length} bytes).`);
    process.exit(1);
  }

  writeFileSync(OUTPUT_PATH, buffer);
  console.log(`PASS: ${match.mime}, ${buffer.length} bytes in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  console.log(`Saved to ${OUTPUT_PATH} - inspect it, then delete it.`);
} catch (error) {
  console.error('FAIL:', error.constructor?.name ?? 'Error');
  console.error('message:', String(error?.message ?? error).slice(0, 400));
  if (error?.httpRequest?.url) console.error('dispatch URL:', error.httpRequest.url);
  if (error?.httpResponse?.status) console.error('status:', error.httpResponse.status);
  process.exit(1);
}
