import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5180,
    host: true,
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
  publicDir: 'public',
});
