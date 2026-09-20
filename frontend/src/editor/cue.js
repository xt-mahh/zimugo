// 字幕编辑与时间轴校验（spec B005）
export function validateTimeline(cues) {
  const sorted = [...cues].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i - 1].end > sorted[i].start) return false;
  }
  return true;
}

export function editSubtitle(cues, cueId, patch) {
  const idx = cues.findIndex((c) => c.id === cueId);
  if (idx === -1) throw new Error('CUE_NOT_FOUND');

  const merged = {
    ...cues[idx],
    ...(patch.text !== undefined ? { text: patch.text } : {}),
    ...(patch.start !== undefined ? { start: patch.start } : {}),
    ...(patch.end !== undefined ? { end: patch.end } : {}),
  };

  // 时间轴校验：start < end
  if (patch.start !== undefined || patch.end !== undefined) {
    if (!(merged.start < merged.end)) throw new Error('INVALID_TIME_RANGE');
    // 与相邻 cue 无非法重叠
    const neighbors = cues.filter((_, i) => i !== idx);
    const probe = [merged, ...neighbors];
    if (!validateTimeline(probe)) throw new Error('INVALID_TIME_RANGE');
  }

  return { ...merged, status: 'edited' };
}
