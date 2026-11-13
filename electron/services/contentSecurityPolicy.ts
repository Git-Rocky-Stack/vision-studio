import type { Session } from 'electron';

/**
 * Hash of the one inline script the Vite dev server injects: @vitejs/plugin-react's
 * React Refresh preamble (base '/'). Allowing exactly that script, instead of
 * 'unsafe-inline', keeps HMR working in development while every other inline
 * script - including any injected markup - stays blocked. In a production build
 * no inline script exists for it to match (the pre-paint theme script ships as
 * public/theme-init.js). contentSecurityPolicy.test.ts recomputes the hash from
 * the installed plugin, so a plugin upgrade that changes the preamble fails CI.
 */
export const REACT_REFRESH_PREAMBLE_HASH = "'sha256-Z2/iFzh9VMlVkEOar1f/oSHWwQk3ve1qk/C2WdsC4Xk='";

/** The only backend the renderer talks to (K5: port 8000, both loopback spellings). */
const BACKEND_HTTP_ORIGINS = ['http://127.0.0.1:8000', 'http://localhost:8000'];
const BACKEND_WS_ORIGINS = ['ws://127.0.0.1:8000', 'ws://localhost:8000'];

/**
 * Directives shared by the session header and the index.html meta tag.
 * The browser enforces the intersection of both, so they must stay identical
 * (contentSecurityPolicy.test.ts locks them together).
 */
export const CSP_DIRECTIVES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['default-src', ["'self'"]],
  ['script-src', ["'self'", REACT_REFRESH_PREAMBLE_HASH]],
  // Fonts are bundled locally via @fontsource (src/fonts.ts); no runtime font CDN,
  // so style-src/font-src need only 'self'. React style attributes need 'unsafe-inline'.
  ['style-src', ["'self'", "'unsafe-inline'"]],
  ['font-src', ["'self'"]],
  // Generated media is served by the local backend (http://localhost:8000/outputs/...) and
  // imported assets resolve to file:// URLs. Both render into <img>/<video> elements, whose
  // loads are governed by img-src/media-src (NOT connect-src) - so the backend origins and the
  // file: scheme must be allowlisted here or previews fail with a CSP violation.
  ['img-src', ["'self'", 'data:', 'blob:', 'file:', ...BACKEND_HTTP_ORIGINS]],
  // fetch()/XHR: the backend (Canvas copy-image, pixel reads of backend outputs).
  // 'self' also covers the Vite dev server and its same-origin HMR WebSocket.
  ['connect-src', ["'self'", ...BACKEND_HTTP_ORIGINS, ...BACKEND_WS_ORIGINS]],
  ['media-src', ["'self'", 'blob:', 'file:', ...BACKEND_HTTP_ORIGINS]],
  ['object-src', ["'none'"]],
  ['base-uri', ["'none'"]],
  ['form-action', ["'none'"]],
];

/**
 * Directives a <meta> CSP cannot carry (the browser ignores them there), so
 * they are sent only in the session header.
 */
export const HEADER_ONLY_CSP_DIRECTIVES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['frame-ancestors', ["'none'"]],
];

function serialize(directives: ReadonlyArray<readonly [string, readonly string[]]>) {
  return directives.map(([name, sources]) => `${name} ${sources.join(' ')}`).join('; ');
}

/** The policy as it appears in index.html's meta tag. */
export const META_CONTENT_SECURITY_POLICY = serialize(CSP_DIRECTIVES);

/** The policy sent as the session's Content-Security-Policy response header. */
export const CONTENT_SECURITY_POLICY = serialize([...CSP_DIRECTIVES, ...HEADER_ONLY_CSP_DIRECTIVES]);

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
