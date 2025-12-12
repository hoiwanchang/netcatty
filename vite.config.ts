import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
    return {
      base: "./",
      server: {
        port: 5173,
        host: '127.0.0.1',
        headers: {
          // Required for SharedArrayBuffer and WASM in some browsers
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'require-corp',
        },
      },
      build: {
        chunkSizeWarningLimit: 1500,
        target: 'esnext', // Required for top-level await in WASM modules
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (!id.includes('node_modules')) return;
              if (id.includes('@xterm') || id.includes('xterm')) return 'xterm';
              if (id.includes('@radix-ui')) return 'radix';
              if (id.includes('react')) return 'react';
              return 'vendor';
            },
          },
        },
      },
      plugins: [tailwindcss(), react()],
      optimizeDeps: {
        exclude: ['ghostty-web'], // Don't pre-bundle ghostty-web to preserve WASM imports
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
