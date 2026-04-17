import { describe, expect, it } from 'vitest';

import config from '../vite.config';

describe('Vite renderer build config', () => {
  it('splits heavyweight renderer dependencies into named manual chunks', () => {
    const output = config.build?.rollupOptions?.output;
    const manualChunks = Array.isArray(output) ? output[0]?.manualChunks : output?.manualChunks;
    const rollupContext = { getModuleInfo: () => null, getModuleIds: function* () {} };

    expect(typeof manualChunks).toBe('function');
    expect(manualChunks?.('C:/vision-studio/node_modules/react/index.js', rollupContext)).toBe('vendor-react');
    expect(manualChunks?.('C:/vision-studio/node_modules/react-dom/client.js', rollupContext)).toBe('vendor-react');
    expect(manualChunks?.('C:/vision-studio/node_modules/framer-motion/dist/es/index.mjs', rollupContext)).toBe(
      'vendor-motion'
    );
    expect(manualChunks?.('C:/vision-studio/node_modules/lucide-react/dist/esm/icons/check.js', rollupContext)).toBe(
      'vendor-icons'
    );
    expect(manualChunks?.('C:/vision-studio/node_modules/konva/lib/index.js', rollupContext)).toBe('vendor-canvas');
  });
});
