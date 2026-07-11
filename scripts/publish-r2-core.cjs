/**
 * Pure planning core for the R2 release publish (no network; unit-tested by
 * tests/publish-r2-core.test.ts). The CLI wrapper is scripts/publish-r2.cjs.
 *
 * Key layout MUST match electron-builder's generic publish URL
 * (https://updates.vision-studio-x.com/win/ -> objects under win/) - the pair is
 * pinned by tests/packaging-config.test.ts + tests/publish-r2-core.test.ts.
 */
const path = require('path');

// What a release publish ships: the web-installer stub .exe, the .nsis.7z
// app package it downloads at install time, blockmaps, the portable zip,
// and the electron-updater feed. builder-debug.yml, READMEs, and any other
// build noise are never published. A missing .7z pattern would publish a
// stub that 404s mid-install - tests pin it.
const RELEASE_ARTIFACT_PATTERNS = [
  /\.exe$/i,
  /\.exe\.blockmap$/i,
  /\.nsis\.7z$/i,
  /\.zip$/i,
  /^latest[^/\\]*\.yml$/i,
];

// Feed files upload LAST: a latest.yml that points at a not-yet-uploaded
// installer would 404 for every client that polls mid-publish.
const FEED_PATTERN = /^latest[^/\\]*\.yml$/i;

const CONTENT_TYPES = [
  [/\.yml$/i, 'text/yaml'],
  [/\.json$/i, 'application/json'],
  [/\.zip$/i, 'application/zip'],
  [/./, 'application/octet-stream'],
];

function contentTypeFor(name) {
  return CONTENT_TYPES.find(([re]) => re.test(name))[1];
}

function planUploads(fileNames, { dir, prefix }) {
  return fileNames
    .filter((name) => RELEASE_ARTIFACT_PATTERNS.some((re) => re.test(name)))
    .map((name) => ({
      filePath: path.join(dir, name),
      key: `${prefix}${name}`,
      contentType: contentTypeFor(name),
    }));
}

/**
 * Model-mirror publish plan (docs/R2-DELIVERY.md section 5): upload EVERY
 * staged file - weights are .safetensors/.onnx/.ckpt, which the release
 * filter above rightly excludes. Input is dir-relative paths (may be nested,
 * either separator); keys are always forward-slash so a Windows staging dir
 * cannot produce backslash object keys the DownloadManager would never fetch.
 */
function planMirrorUploads(relPaths, { dir, prefix }) {
  return relPaths.map((rel) => {
    // Normalize BOTH separators (not path.sep): keys must be identical no
    // matter which host stages the upload, and model file names never
    // legitimately contain backslashes (manifest validation refuses them).
    const key = rel.split(/[\\/]/).join('/');
    return {
      filePath: path.join(dir, rel),
      key: `${prefix}${key}`,
      contentType: contentTypeFor(key),
    };
  });
}

function orderForFeedSafety(uploads) {
  const isFeed = (upload) => FEED_PATTERN.test(path.basename(upload.key));
  return [...uploads.filter((u) => !isFeed(u)), ...uploads.filter(isFeed)];
}

module.exports = {
  planUploads,
  planMirrorUploads,
  orderForFeedSafety,
  RELEASE_ARTIFACT_PATTERNS,
  FEED_PATTERN,
  contentTypeFor,
};
