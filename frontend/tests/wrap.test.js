import { describe, it, expect } from 'vitest';
import { wrapByWords, splitCueByChars, tokenize } from '../src/editor/wrap.js';

describe('wrapByWords (DP-002)', () => {
  it('短文本不拆', () => {
    expect(wrapByWords('便利店是24小时亮着的', 11)).toEqual(['便利店是24小时亮着的']);
    expect(wrapByWords('短句', 10)).toEqual(['短句']);
  });
  it('超长文本按词边界折行且每行 ≤ maxChars', () => {
    const lines = wrapByWords('这个城市里只有便利店和路灯不会关灯我守着的不是一家店', 10);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(10);
    expect(lines.join('')).toBe('这个城市里只有便利店和路灯不会关灯我守着的不是一家店');
  });
  it('词不被切断（守着/便利店保持完整）', () => {
    const lines = wrapByWords('我守着的不是一家店', 3);
    expect(lines.some((l) => l.includes('守着'))).toBe(true);
    expect(lines.join('')).toBe('我守着的不是一家店');
  });
});

describe('splitCueByChars', () => {
  it('时间按字符比例分配，首尾对齐原 cue', () => {
    const cue = { id: 'x', start: 10, end: 14, text: '这个城市里只有便利店和路灯不会关灯', status: 'draft' };
    const parts = splitCueByChars(cue, 10);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0].start).toBe(10);
    expect(parts[parts.length - 1].end).toBe(14);
    // 连续无缝
    for (let i = 1; i < parts.length; i++) expect(parts[i].start).toBeCloseTo(parts[i - 1].end, 6);
  });
  it('单行 cue 原样返回', () => {
    const cue = { id: 'x', start: 0, end: 2, text: '短句', status: 'draft' };
    expect(splitCueByChars(cue, 10)).toEqual([cue]);
  });
});

describe('tokenize', () => {
  it('词典词优先', () => {
    const t = tokenize('便利店不关灯');
    expect(t).toContain('便利店');
    expect(t).toContain('关灯');
  });
});
