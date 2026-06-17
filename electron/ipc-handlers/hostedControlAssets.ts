import { promises as fs } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/**
 * Hosted ControlNet / inpaint asset preparation (M6 PR2, main process).
 *
 * HuggingFace's Inference Providers image-to-image endpoints want raw base64
 * images: a control image, an init image, and a raster mask. In Vision Studio,
 * those arrive at the IPC boundary as on-disk file paths plus a *vector* mask
 * ({type, points, bounds} in intrinsic image-pixel coordinates - see
 * RegionMaskDrawer). This module turns them into the bytes HF needs, entirely
 * in the main process:
 *   - readImageFileAsBase64: path-guarded fs read (never reads outside the
 *     app's known asset roots, so a stray path can't exfiltrate an arbitrary
 *     local file to a remote provider).
 *   - rasterizeMaskToPng: pure-JS polygon fill + zlib PNG encode (no native
 *     dependency, fully unit-tested in the node env), sized to the init image
 *     so HF receives a same-dimension init/mask pair.
 *
 * Rasterization lives here (not the renderer canvas) so the geometry is
 * unit-testable and outbound bytes pass through a single security locus.
 */

export interface MaskGeometry {
  /** RegionMaskDrawer tool: 'rectangle' | 'polygon' | 'brush' | 'erase'. */
  type: string;
  points: Array<{ x: number; y: number }>;
  bounds: { x: number; y: number; width: number; height: number };
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function ihdrChunk(width: number, height: number): Buffer {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = 8; // bit depth
  data[9] = 0; // color type: grayscale
  data[10] = 0; // compression
  data[11] = 0; // filter
  data[12] = 0; // interlace
  return data;
}

function pointInPolygon(points: MaskGeometry['points'], x: number, y: number): boolean {
  // Ray casting against pixel centers so adjacent pixels tile cleanly.
  const px = x + 0.5;
  const py = y + 0.5;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;
    const intersects = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function inBounds(bounds: MaskGeometry['bounds'], x: number, y: number): boolean {
  return x >= bounds.x && x < bounds.x + bounds.width && y >= bounds.y && y < bounds.y + bounds.height;
}

/**
 * True when pixel (x, y) belongs to the masked region. Rectangles (and any
 * freehand mask with fewer than three points) fall back to the bounding box;
 * polygon / brush strokes are filled as a closed path.
 */
export function maskCoverage(mask: MaskGeometry, x: number, y: number): boolean {
  if (mask.type === 'rectangle' || mask.points.length < 3) {
    return inBounds(mask.bounds, x, y);
  }
  return pointInPolygon(mask.points, x, y);
}

/** Rasterize a vector mask into an 8-bit grayscale PNG (white = masked region). */
export function rasterizeMaskToPng(mask: MaskGeometry, width: number, height: number): Buffer {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));

  // The mask is empty outside its bounds, so only scan the clamped bbox.
  const x0 = Math.max(0, Math.floor(mask.bounds.x));
  const y0 = Math.max(0, Math.floor(mask.bounds.y));
  const x1 = Math.min(w, Math.ceil(mask.bounds.x + mask.bounds.width));
  const y1 = Math.min(h, Math.ceil(mask.bounds.y + mask.bounds.height));

  const stride = 1 + w; // leading filter byte (0 = None) per scanline
  const raw = Buffer.alloc(h * stride); // zero-filled => black + None filter

  for (let y = y0; y < y1; y += 1) {
    const rowStart = y * stride + 1;
    for (let x = x0; x < x1; x += 1) {
      if (maskCoverage(mask, x, y)) {
        raw[rowStart + x] = 255;
      }
    }
  }

  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdrChunk(w, h)),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function readPngDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24 || !PNG_SIGNATURE.every((byte, index) => buffer[index] === byte)) {
    return null;
  }
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') {
    return null;
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readJpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    let marker = buffer[offset + 1];
    while (marker === 0xff && offset + 2 < buffer.length) {
      offset += 1;
      marker = buffer[offset + 1];
    }
    // Standalone markers carry no length field.
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      offset += 2;
      continue;
    }
    const segmentLength = buffer.readUInt16BE(offset + 2);
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isStartOfFrame) {
      return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
    }
    offset += 2 + segmentLength;
  }
  return null;
}

function readWebpDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (
    buffer.length < 16 ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    return null;
  }
  const fourCc = buffer.toString('ascii', 12, 16);
  if (fourCc === 'VP8X' && buffer.length >= 30) {
    return { width: buffer.readUIntLE(24, 3) + 1, height: buffer.readUIntLE(27, 3) + 1 };
  }
  if (fourCc === 'VP8 ' && buffer.length >= 30) {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  if (fourCc === 'VP8L' && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

function readGifDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 10 || buffer.toString('ascii', 0, 3) !== 'GIF') {
    return null;
  }
  return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
}

/** Read intrinsic pixel dimensions from a PNG / JPEG / WebP / GIF payload. */
export function readImageDimensions(buffer: Buffer): { width: number; height: number } {
  const dimensions =
    readPngDimensions(buffer) ??
    readJpegDimensions(buffer) ??
    readWebpDimensions(buffer) ??
    readGifDimensions(buffer);
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    throw new Error('Could not read image dimensions from the provided payload.');
  }
  return dimensions;
}

function sniffImageMime(buffer: Buffer): string {
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (buffer.toString('ascii', 0, 3) === 'GIF') return 'image/gif';
  return 'application/octet-stream';
}

/**
 * Resolve `filePath` and confirm it sits under one of `allowedRoots`. Throws
 * otherwise so a renderer-supplied path can never read outside the app's own
 * asset roots (no traversal, no arbitrary-file exfiltration to a hosted provider).
 */
export function assertPathUnderRoots(filePath: string, allowedRoots: string[]): string {
  const resolved = path.resolve(filePath);
  for (const root of allowedRoots) {
    if (!root) continue;
    const resolvedRoot = path.resolve(root);
    if (resolved === resolvedRoot || resolved.startsWith(resolvedRoot + path.sep)) {
      return resolved;
    }
  }
  throw new Error(`Refusing to read "${filePath}": it is outside the allowed asset roots.`);
}

export interface ReadImageResult {
  base64: string;
  mimeType: string;
  dimensions: { width: number; height: number };
}

/** Path-guarded read of a local image into base64 + sniffed mime + dimensions. */
export async function readImageFileAsBase64(
  filePath: string,
  allowedRoots: string[],
): Promise<ReadImageResult> {
  const safePath = assertPathUnderRoots(filePath, allowedRoots);
  const buffer = await fs.readFile(safePath);
  return {
    base64: buffer.toString('base64'),
    mimeType: sniffImageMime(buffer),
    dimensions: readImageDimensions(buffer),
  };
}
