import { defineConfig } from 'vite';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// 复用 phase0 自签证书 —— HTTPS 安全上下文是硬需求：
// WebGPU 与 Cache API 均只在 secure context 可用（Phase 0 实测）
// 2026-09-22: 改仓库相对定位（项目自 /root/workspace 迁至 NAS；逻辑零改动）
const here = dirname(fileURLToPath(import.meta.url));
const cert = readFileSync(join(here, '../internal/phase0/cert.pem'));
const key = readFileSync(join(here, '../internal/phase0/key.pem'));

export default defineConfig(({ mode }) => ({
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
  // Pages 构建模式：base 指向子路径（GitHub Pages 项目页部署在 /zimugo/ 下）
  base: mode === 'pages' ? '/app/' : '/',
  publicDir: 'public',
}));
