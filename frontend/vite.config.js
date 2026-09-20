import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5180,
    host: true,
    allowedHosts: true, // 局域网主机名访问（omv 等）
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
  publicDir: 'public',
});
