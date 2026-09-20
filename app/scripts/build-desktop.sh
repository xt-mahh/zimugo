#!/usr/bin/env bash
# 桌面版构建脚本：前端 dist + 模型资产 → app/frontend/dist → wails build
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP="$ROOT/app"

echo "[1/3] 前端构建..."
cd "$ROOT/frontend" && npx vite build

echo "[2/3] 组装 app/frontend/dist（dist + public 资产）..."
rm -rf "$APP/frontend"
mkdir -p "$APP/frontend"
cp -r "$ROOT/frontend/dist" "$APP/frontend/dist"
# public/ 里的模型与 worker 资产 vite build 已拷入 dist（publicDir），验证存在
test -f "$APP/frontend/dist/models/silero-vad/silero_vad.onnx" || { echo "缺少模型资产"; exit 1; }
test -f "$APP/frontend/dist/workers/transcribe.worker.js" || { echo "缺少 worker"; exit 1; }

echo "[3/3] wails build..."
cd "$APP"
if [ ! -f go.mod ]; then
  GOPROXY=https://goproxy.cn,direct go mod init localsub
  GOPROXY=https://goproxy.cn,direct go get github.com/wailsapp/wails/v2@latest
fi
~/go/bin/wails build || go build .
echo "完成：$APP/build/bin/"
