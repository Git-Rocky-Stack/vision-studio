import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import config, { PREVIEW_URL } from '../playwright.config';

/**
 * The performance suite is the only spec file that measures a served
 * production build, and it is the only one whose result is a number rather
 * than a pass/fail on behaviour. That makes it uniquely vulnerable to
 * measuring the wrong thing quietly.
 *
 * It has done exactly that. `vite preview` defaults to :4173 and `vite dev` to
 * :5173, so every Vite project on the machine reaches for the same two ports.
 * With `reuseExistingServer` on, Playwright probes the URL first and skips its
 * own `command` entirely when something answers - so a preview server from an
 * unrelated project owned the port and would have been measured as if it were
 * Vision Studio. Captured while writing this test:
 *
 *   $ netstat -ano | grep 4173
 *     TCP  0.0.0.0:4173  LISTENING  19248
 *   $ curl -s http://127.0.0.1:4173/ | head -c 120
 *     <!DOCTYPE html><html lang="en" ...
 *     <title>WealthWise OS - The AI Financial OS for Self-Employed ...
 *
 * Two invariants keep that from recurring, and both are asserted here rather
 * than left to a comment:
 *
 *   1. the preview port is unique to this project, so no other Vite project
 *      claims it by default, and
 *   2. the preview server is never reused, so the bundle measured is always
 *      the one built from the current source - which is what the config
 *      comment has always claimed and did not enforce.
 */
const VITE_DEFAULT_PORTS = new Set([4173, 5173]);
const repoRoot = join(__dirname, '..');

function portOf(url: string): number {
  return Number(new URL(url).port);
}

describe('Playwright web servers', () => {
  it('serves the performance build on a port no other Vite project claims by default', () => {
    expect(VITE_DEFAULT_PORTS.has(portOf(PREVIEW_URL))).toBe(false);
  });

  it('points the preview web server at the exported PREVIEW_URL', () => {
    const servers = Array.isArray(config.webServer) ? config.webServer : [config.webServer];
    const preview = servers.find((server) => server?.url === PREVIEW_URL);

    expect(preview, `no webServer entry serves ${PREVIEW_URL}`).toBeDefined();
  });

  it('rebuilds rather than reusing the preview server, so the numbers describe the current source', () => {
    const servers = Array.isArray(config.webServer) ? config.webServer : [config.webServer];
    const preview = servers.find((server) => server?.url === PREVIEW_URL);

    // Reuse is what let a foreign server be measured, and it also lets a stale
    // build from an earlier run be measured. Either way the number stops
    // describing the current source.
    expect(preview?.reuseExistingServer).toBe(false);
  });

  it('keeps the preview:web script on the same port the config measures', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(pkg.scripts['preview:web']).toContain(`--port ${portOf(PREVIEW_URL)}`);
    // --strictPort makes a taken port a hard failure instead of a silent
    // fallback to a port nothing is measuring.
    expect(pkg.scripts['preview:web']).toContain('--strictPort');
  });

  it('leaves the performance spec no second copy of the address to drift from', () => {
    const spec = readFileSync(
      join(repoRoot, 'tests', 'e2e', 'performance', 'performance.spec.ts'),
      'utf8'
    );

    expect(spec).toContain('PREVIEW_URL');
    expect(spec).not.toMatch(/['"]http:\/\/127\.0\.0\.1:\d+/);
  });
});
