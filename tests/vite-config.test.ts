import { describe, expect, it } from 'vitest';

import config from '../vite.config';

describe('Vite renderer build config', () => {
  it('splits heavyweight renderer dependencies into named manual chunks', () => {
    const output = config.build?.rollupOptions?.output;
    const manualChunks = Array.isArray(output) ? output[0]?.manualChunks : output?.manualChunks;
    const rollupContext = { getModuleInfo: () => null, getModuleIds: function* () {} };

    // `ManualChunksOption` is a union of a chunking function and a plain
    // `Record<string, string[]>`, so the union has to be collapsed before the
    // calls below - a `typeof` expect does not narrow it. Throwing here fails
    // the test with the same signal the old `expect(typeof ...)` gave, and is
    // what lets these assertions typecheck now that tests/ is covered by
    // tsconfig.tests.json.
    if (typeof manualChunks !== 'function') {
      throw new Error(
        `expected build.rollupOptions.output.manualChunks to be a function, got ${typeof manualChunks}`
      );
    }

    expect(manualChunks('C:/vision-studio/node_modules/react/index.js', rollupContext)).toBe('vendor-react');
    expect(manualChunks('C:/vision-studio/node_modules/react-dom/client.js', rollupContext)).toBe('vendor-react');
    expect(manualChunks('C:/vision-studio/node_modules/framer-motion/dist/es/index.mjs', rollupContext)).toBe(
      'vendor-motion'
    );
    expect(manualChunks('C:/vision-studio/node_modules/lucide-react/dist/esm/icons/check.js', rollupContext)).toBe(
      'vendor-icons'
    );
    expect(manualChunks('C:/vision-studio/node_modules/konva/lib/index.js', rollupContext)).toBe('vendor-canvas');
  });
});
