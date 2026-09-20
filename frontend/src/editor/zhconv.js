// 繁->简 转换（离线，映射表由 zhconv 生成，覆盖 CJK 基本区）
import MAP from './zhconv-map.json' with { type: 'json' };

export function toSimplified(text) {
  if (!text) return text;
  // 「著」词级规则：zh-hans 中仅「著名/著述/显著/土著/执著」等词保留，其余转「着」
  let out = '';
  const len = text.length;
  for (let i = 0; i < len; i++) {
    const ch = text[i];
    if (ch === '著') {
      const next = text[i + 1] || '';
      const prev = text[i - 1] || '';
      if (next === '名' || next === '述' || next === '作' || next === '称' || next === '称' ||
          prev === '显' || prev === '土' || prev === '执' || prev === '昭') {
        out += '著';
      } else {
        out += '着';
      }
    } else {
      out += MAP[ch] || ch;
    }
  }
  return out;
}
