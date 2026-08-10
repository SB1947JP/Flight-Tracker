import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative asset URLs, so a build can be served from any path — the root of
  // a domain, a GitHub Pages project subdirectory, or straight off the disk —
  // without rebuilding for each one.
  base: './',
  plugins: [react()],
});
