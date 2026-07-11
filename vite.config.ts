import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import electron from 'vite-plugin-electron/simple';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function splitRendererVendorChunk(id: string): string | undefined {
  const normalizedId = id.replace(/\\/g, '/');

  if (!normalizedId.includes('/node_modules/')) {
    return undefined;
  }

  if (
    normalizedId.includes('/node_modules/react/') ||
    normalizedId.includes('/node_modules/react-dom/') ||
    normalizedId.includes('/node_modules/scheduler/')
  ) {
    return 'vendor-react';
  }

  if (
    normalizedId.includes('/node_modules/framer-motion/') ||
    normalizedId.includes('/node_modules/motion-dom/') ||
    normalizedId.includes('/node_modules/motion-utils/')
  ) {
    return 'vendor-motion';
  }

  if (normalizedId.includes('/node_modules/lucide-react/')) {
    return 'vendor-icons';
  }

  if (
    normalizedId.includes('/node_modules/konva/') ||
    normalizedId.includes('/node_modules/react-konva/')
  ) {
    return 'vendor-canvas';
  }

  return 'vendor';
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: [
                'electron',
                'electron-store',
                // Main-process runtime dep (like electron-store): resolved
                // from node_modules at runtime, packed by electron-builder.
                // Inlining it breaks its own package.json/version resolution.
                'electron-updater',
                'bufferutil',
                'utf-8-validate',
              ],
              output: {
                format: 'es',
                entryFileNames: '[name].mjs',
              },
            },
          },
        },
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              output: {
                format: 'cjs',
                entryFileNames: '[name].cjs',
              },
            },
          },
        },
      },
      renderer: {},
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    // The renderer uses vendor chunk splitting (below) and route/panel-level code
    // splitting (heavy non-startup surfaces are React.lazy'd in
    // DockviewSettingsPanel). That trimmed the entry chunk from ~825 kB to ~620 kB.
    // The limit stays at 800 kB as a regression guard with modest headroom.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: splitRendererVendorChunk,
      },
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
});
