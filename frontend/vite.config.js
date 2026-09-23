import { defineConfig } from 'vite';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// 复用 internal/phase0 自签证书 —— HTTPS 安全上下文是硬需求：
// WebGPU 与 Cache API 均只在 secure context 可用（Phase 0 实测）
// 证书属内部资产（gitignore），仅本地 dev server 使用；
// CI / 他人 clone 无此文件 → 构建模式跳过加载（Pages 是 https，无需自签证书）
const here = dirname(fileURLToPath(import.meta.url));
const certPath = join(here, '../internal/phase0/cert.pem');
const keyPath = join(here, '../internal/phase0/key.pem');
const hasCert = existsSync(certPath) && existsSync(keyPath);

export default defineConfig(({ mode }) => ({
  server: {
    port: 5181,
    host: true,
    ...(hasCert ? { https: { cert: readFileSync(certPath), key: readFileSync(keyPath) } } : {}),
    allowedHosts: true, // 局域网主机名访问（omv 等）
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
  // Pages 构建模式：base 指向子路径（站点布局：/ 落地页，/app/ 应用）
  base: mode === 'pages' ? '/zimugo/app/' : '/',
  publicDir: 'public',
}));
