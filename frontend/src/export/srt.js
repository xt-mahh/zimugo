// SRT 导出/解析（spec B006）
const pad = (n, w) => String(n).padStart(w, '0');

export function fmtTimestamp(sec) {
  if (!Number.isFinite(sec) || sec < 0) throw new Error(`INVALID_TIME_RANGE: ${sec}`);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  const msStr = ms === 1000 ? '000' : pad(ms, 3); // 舍入进位保护
  const sAdj = ms === 1000 ? s + 1 : s;
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(sAdj, 2)},${msStr}`;
}

export function exportSrt(cues, opts = {}) {
  if (!Array.isArray(cues) || cues.length === 0) throw new Error('EMPTY_CUES');
  const sorted = [...cues].sort((a, b) => a.start - b.start);
  const blocks = sorted.map((c, i) =>
    `${i + 1}\n${fmtTimestamp(c.start)} --> ${fmtTimestamp(c.end)}\n${c.text.replace(/\n/g, ' ')}`
  );
  const content = blocks.join('\n\n') + '\n';
  if (opts.asBlob) {
    // UTF-8 无 BOM：Blob 构造默认不加 BOM
    return new Blob([content], { type: 'application/x-subrip;charset=utf-8' });
  }
  if (opts.returnObject) return { content, cueCount: sorted.length };
  return content;
}

export function parseSrt(text) {
  const blocks = text.replace(/\r\n/g, '\n').split('\n\n').filter((b) => b.trim());
  const cues = [];
  for (const b of blocks) {
    const m = b.match(/(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/);
    if (!m) continue;
    const g = m.slice(1).map(Number);
    const start = g[0] * 3600 + g[1] * 60 + g[2] + g[3] / 1000;
    const end = g[4] * 3600 + g[5] * 60 + g[6] + g[7] / 1000;
    const lines = b.split('\n').filter((l, i) =>
      !/^\d+$/.test(l.trim()) && !l.includes('-->')
    );
    cues.push({
      id: `c${cues.length + 1}`,
      start, end,
      text: lines.join(' ').trim(),
      status: 'draft',
    });
  }
  return cues;
}
