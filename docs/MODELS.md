# 获取模型

ZimuGo 的模型文件不进 git（体积原因），从 HuggingFace 一次性下载到
`frontend/public/models/`（相对 `frontend/` 目录执行）：

```bash
# whisper-small（主模型，双后端共用 fp16+q4 量化档，~390MB）
huggingface-cli download onnx-community/whisper-small \
  --include "config.json" "generation_config.json" "preprocessor_config.json" \
           "tokenizer.json" "tokenizer_config.json" \
           "onnx/encoder_model_fp16.onnx" "onnx/decoder_model_merged_q4.onnx" \
  --local-dir public/models/onnx-community/whisper-small

# Silero VAD（~2MB）
huggingface-cli download onnx-community/silero-vad \
  --include "silero_vad.onnx" \
  --local-dir public/models/silero-vad
```

下载后目录结构：

```
frontend/public/models/
├── onnx-community/whisper-small/
│   ├── config.json / tokenizer.json / ...
│   └── onnx/
│       ├── encoder_model_fp16.onnx        (177M, 双后端共用)
│       └── decoder_model_merged_q4.onnx   (233M, 双后端共用)
└── silero-vad/
    └── silero_vad.onnx
```

## dtype 说明

双后端统一 `fp16 encoder + q4 decoder`（int4 MatMulNBits 量化）：

- **WebGPU**：原生路径，RTF ≈ 0.26–0.40
- **WASM 回落**：fp16 内部升 fp32 跑，慢但功能等价
- ⚠️ q8 全量化在 WebGPU 上输出乱码（phase0 实测），**勿替换为 q8 档**

`npm run dev` 前置条件齐了会看到 Vite 输出 `Local: https://localhost:5181/`。
