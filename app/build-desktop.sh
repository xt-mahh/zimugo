#!/bin/bash
# ZimuGo 桌面版构建（Linux 交叉编译 windows/amd64）
# 2026-09-22 修复：worker 以 /node_modules/@huggingface/... 绝对路径 import transformers，
# 但该路径不在 public/ → vite 不拷贝 → go:embed 的 dist 缺此文件 → 桌面版 Worker init 404。
# 修复 = 构建前把 transformers dist 拷进 public/node_modules/（Web 版同源加载路径不变，一并受益）。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"   # 项目根（脚本在 app/ 下）
cd "$ROOT/frontend"

TJS_SRC="node_modules/@huggingface/transformers/dist/transformers.min.js"
TJS_DST="public/node_modules/@huggingface/transformers/dist/transformers.min.js"

mkdir -p "$(dirname "$TJS_DST")"
cp -f "$TJS_SRC" "$TJS_DST"
echo "[1/3] transformers.min.js → public/node_modules/ ($(du -h "$TJS_DST" | cut -f1))"

# ort wasm 同步（已移出 git，npm 包内容物；Web 版 dev 时 vite 从 node_modules 服务不到 /ort/ 静态路径，需常驻 public/ort）
mkdir -p public/ort
cp -f node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded*.wasm node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded*.mjs public/ort/
echo "[1.5/3] ort wasm → public/ort/"
echo "[2/3] vite build（含 models/workers/ort/node_modules 原样拷贝，约 30s）"
npx vite build > /tmp/zimugo-vite-build.log 2>&1 || { tail -20 /tmp/zimugo-vite-build.log; exit 1; }
grep -E "built in" /tmp/zimugo-vite-build.log || true

echo "[3/3] 同步 dist → app/frontend/dist + wails 交叉编译"
rm -rf ../app/frontend/dist
cp -r dist ../app/frontend/dist
cd ../app
wails build -platform windows/amd64 -s 2>&1 | tail -3   # -s: dist 已由本脚本同步，跳过 wails 前端步骤（其 npm 环节在无 package.json 的 app/frontend 上会 254）
ls -lh build/bin/ZimuGo.exe
