import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'electron/**/*.test.ts', 'shared/**/*.test.ts', 'tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    // Headroom for full-suite runs (e.g. the husky pre-commit gate), where high
    // worker parallelism saturates CPU and slows individual tests; the default
    // 5s/10s timeouts flake under that load even though every file passes in
    // isolation. Generous ceilings keep the gate reliable without masking hangs.
    testTimeout: 20000,
    projects: [
      {
        // Node tests (pure logic + Electron services + integration)
        test: {
          include: ['src/**/*.test.ts', 'electron/**/*.test.ts', 'shared/**/*.test.ts', 'tests/**/*.test.ts'],
          environment: 'node',
          name: 'unit',
        },
        resolve: { alias: { '@': resolve(__dirname, 'src') } },
      },
      {
        // jsdom tests (React components)
        test: {
          include: ['src/**/*.test.tsx', 'tests/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['./tests/setup.ts'],
          name: 'component',
          testTimeout: 40000,
        },
        resolve: { alias: { '@': resolve(__dirname, 'src') } },
      },
    ],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
