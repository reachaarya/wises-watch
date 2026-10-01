import { defineConfig } from 'vite';

export default defineConfig({
  base: './',                      // built site works from any folder on a static host
  server: { open: true, port: 5173 },
  preview: { open: true, port: 4173 },
});
