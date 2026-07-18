import type { Session } from 'electron';

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  // Fonts are bundled locally via @fontsource (src/fonts.ts); no runtime font CDN,
  // so style-src/font-src need only 'self'. Kept in sync with the index.html meta CSP
  // (contentSecurityPolicy.test.ts locks the two together).
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  // Generated media is served by the local backend (http://localhost:8000/outputs/...) and
  // imported assets resolve to file:// URLs. Both render into <img>/<video> elements, whose
  // loads are governed by img-src/media-src (NOT connect-src) - so the backend origins and the
  // file: scheme must be allowlisted here or previews fail with a CSP violation.
  "img-src 'self' data: blob: file: http://localhost:* http://127.0.0.1:*",
  "connect-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*",
  "media-src 'self' blob: file: http://localhost:* http://127.0.0.1:*",
].join('; ');

export function registerContentSecurityPolicy(session: Session) {
  session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CONTENT_SECURITY_POLICY],
      },
    });
  });
}
