import { defineConfig } from 'vite';
import { readFileSync } from 'fs';

// 复用 phase0 自签证书 —— HTTPS 安全上下文是硬需求：
// WebGPU 与 Cache API 均只在 secure context 可用（Phase 0 实测）
const cert = readFileSync('/root/workspace/localsub/phase0/cert.pem');
const key = readFileSync('/root/workspace/localsub/phase0/key.pem');

export default defineConfig({
  server: {
    port: 5181,
    host: true,
    https: { cert, key },
    allowedHosts: true, // 局域网主机名访问（omv 等）
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
  publicDir: 'public',
});
