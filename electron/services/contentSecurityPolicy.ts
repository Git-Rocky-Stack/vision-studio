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

const BACKEND_OUTPUT_URL = /^http:\/\/(?:localhost|127\.0\.0\.1):8000\/outputs\//i;

type ResponseHeaders = Record<string, string | string[]>;

/**
 * The packaged renderer runs from file://, so the generated images it loads
 * from the backend's /outputs mount are cross-origin, and drawing one taints
 * the Canvas editor (no adjustments, eyedropper or Export). The backend's own
 * CORS allow-list only names the dev server, and widening it would expose
 * outputs to every page in the user's browser. Instead, this session - the
 * app's own window and nothing else - marks just the backend's static output
 * GETs as readable. They are already auth-exempt and served to any client;
 * this only lets the app read back pixels it is displaying anyway.
 */
export function withBackendOutputCors(
  url: string,
  method: string | undefined,
  headers: ResponseHeaders | undefined,
): ResponseHeaders {
  const next: ResponseHeaders = { ...(headers ?? {}) };
  if ((method ?? 'GET').toUpperCase() !== 'GET' || !BACKEND_OUTPUT_URL.test(url)) {
    return next;
  }
  for (const key of Object.keys(next)) {
    if (key.toLowerCase() === 'access-control-allow-origin') delete next[key];
  }
  next['Access-Control-Allow-Origin'] = ['*'];
  return next;
}

export function registerContentSecurityPolicy(session: Session) {
  session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...withBackendOutputCors(details.url, details.method, details.responseHeaders),
        'Content-Security-Policy': [CONTENT_SECURITY_POLICY],
      },
    });
  });
}
