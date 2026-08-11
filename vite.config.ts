import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative asset URLs, so a build can be served from any path — the root of
  // a domain, a GitHub Pages project subdirectory, or straight off the disk —
  // without rebuilding for each one.
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // The airport table and the coastline are generated data that changes
        // only when regenerated, while the code around them changes constantly.
        // Splitting them out means a deploy invalidates the ~30 KB of app and
        // leaves the ~150 KB of data in the browser's cache where it was.
        manualChunks: {
          airports: ['./src/airports-data.ts'],
          basemap: ['./src/coastline.ts'],
        },
      },
    },
    // The data chunks are large on purpose; see above.
    chunkSizeWarningLimit: 700,
  },
});
