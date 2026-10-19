import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    // Three.js's WebGL renderer is what's left once unused code is shaken out
    // (~570 kB minified, ~140 kB gzipped) and it can't shrink further, so the
    // limit sits just above it. The app's own code is under 80 kB.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Vendor code changes far less often than the app, so keeping it in its
        // own files lets returning visitors reuse them from the browser cache
        // across deploys and keeps each file under the size warning limit.
        manualChunks(id) {
          if (id.includes('node_modules/three/')) return 'three';
          if (id.includes('node_modules/astronomy-engine/')) return 'astronomy';
          return undefined;
        },
      },
    },
  },
});
