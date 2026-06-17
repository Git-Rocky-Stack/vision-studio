import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'electron/**/*.test.ts', 'shared/**/*.test.ts', 'tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
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
          testTimeout: 10000,
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
