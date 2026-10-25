/**
 * Magic-byte image sniffing shared by the hosted provider clients. Remote
 * bytes are typed by their signature, never by a server-supplied
 * Content-Type, before any caller writes them to disk.
 */
const IMAGE_MAGIC: Array<{ mime: string; test: (buffer: Buffer) => boolean }> = [
  // PNG signature.
  {
    mime: 'image/png',
    test: (buffer) =>
      buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47,
  },
  // JPEG: start-of-image marker.
  {
    mime: 'image/jpeg',
    test: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  },
  // WebP: 'RIFF' container at bytes 0-3 AND 'WEBP' form type at bytes 8-11. A
  // bare RIFF is insufficient - WAV/AVI share the RIFF container - so the form
  // type must also match (mirrors the asset reader's WebP detection).
  {
    mime: 'image/webp',
    test: (buffer) =>
      buffer.length >= 12 &&
      buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
      buffer.slice(8, 12).toString('ascii') === 'WEBP',
  },
  // GIF87a / GIF89a share the 'GIF8' prefix.
  {
    mime: 'image/gif',
    test: (buffer) =>
      buffer.length >= 4 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38,
  },
];

export function sniffImageMime(buffer: Buffer): string | null {
  for (const candidate of IMAGE_MAGIC) {
    if (candidate.test(buffer)) {
      return candidate.mime;
    }
  }
  return null;
}
