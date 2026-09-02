import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative asset URLs, so a build runs from any path — a domain root, a
  // Pages subdirectory, or straight off the disk — without rebuilding.
  base: './',
  plugins: [react()],
});
