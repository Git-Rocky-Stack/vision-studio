#!/usr/bin/env node
/**
 * Publish release artifacts to Cloudflare R2 (S3-compatible API).
 *
 * Usage:
 *   node scripts/publish-r2.cjs [--dir release] [--prefix win/] [--dry-run]
 *
 * Environment (all required unless --dry-run):
 *   R2_ACCOUNT_ID         Cloudflare account id (bucket endpoint host)
 *   R2_ACCESS_KEY_ID      R2 API token key id (Object Read & Write scope)
 *   R2_SECRET_ACCESS_KEY  R2 API token secret
 *   R2_BUCKET             Target bucket name
 *
 * Uploads run SEQUENTIALLY in feed-safe order (binaries first, latest.yml
 * last) so a client polling the feed mid-publish can never resolve an
 * update whose installer is not yet uploaded. Multipart via
 * @aws-sdk/lib-storage handles the ~6 GB installer. See docs/R2-DELIVERY.md.
 */
const fs = require('fs');
const path = require('path');
const { planUploads, orderForFeedSafety } = require('./publish-r2-core.cjs');

function parseArgs(argv) {
  const args = { dir: 'release', prefix: 'win/', dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--dir') args.dir = argv[++i];
    else if (arg === '--prefix') args.prefix = argv[++i];
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  if (!args.prefix.endsWith('/')) args.prefix += '/';
  return args;
}

function requireEnv() {
  const required = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];
  const missing = required.filter((name) => !(process.env[name] || '').trim());
  if (missing.length) {
    console.error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
        'Create an R2 API token with Object Read & Write on the bucket ' +
        '(docs/R2-DELIVERY.md) and export the four R2_* variables.',
    );
    process.exit(1);
  }
}

function formatBytes(bytes) {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(args.dir)) {
    console.warn(`Source directory not found: ${args.dir} - nothing to publish.`);
    process.exit(args.dryRun ? 0 : 1);
  }

  const names = fs.readdirSync(args.dir).filter((name) => {
    try {
      return fs.statSync(path.join(args.dir, name)).isFile();
    } catch {
      return false;
    }
  });
  const plan = orderForFeedSafety(planUploads(names, { dir: args.dir, prefix: args.prefix }));

  if (!plan.length) {
    console.warn(`No release artifacts found in ${args.dir}/ - nothing to publish.`);
    process.exit(args.dryRun ? 0 : 1);
  }

  console.log(`Publish plan (${plan.length} objects, feed last):`);
  for (const upload of plan) {
    const size = fs.statSync(upload.filePath).size;
    console.log(`  ${upload.key}  (${formatBytes(size)}, ${upload.contentType})`);
  }

  if (args.dryRun) {
    console.log('\n--dry-run: no uploads performed.');
    return;
  }

  requireEnv();
  const { S3Client } = require('@aws-sdk/client-s3');
  const { Upload } = require('@aws-sdk/lib-storage');

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });

  // Sequential on purpose: the feed-last ordering guarantee is void if
  // uploads race, and a failure must abort BEFORE latest.yml flips the feed.
  for (const upload of plan) {
    const size = fs.statSync(upload.filePath).size;
    console.log(`\nUploading ${upload.key} (${formatBytes(size)})...`);
    const started = Date.now();
    await new Upload({
      client,
      params: {
        Bucket: process.env.R2_BUCKET,
        Key: upload.key,
        Body: fs.createReadStream(upload.filePath),
        ContentType: upload.contentType,
      },
    }).done();
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`  done in ${seconds}s`);
  }

  console.log(`\nPublished ${plan.length} objects to ${process.env.R2_BUCKET}/${args.prefix}`);
}

main().catch((error) => {
  console.error(`\nPublish failed: ${error.message}`);
  console.error('The feed file uploads last, so clients were not flipped to a broken update.');
  process.exit(1);
});
