import { describe, it, expect } from 'vitest';
import { exportSrt, parseSrt } from '../src/export/srt.js';
import { editSubtitle, validateTimeline } from '../src/editor/cue.js';
import { toSimplified } from '../src/editor/zhconv.js';

// B006: 导出 SRT
describe('exportSrt (B006)', () => {
  it('生成标准 SRT：序号 + HH:MM:SS,mmm --> ... + 文本 + 空行', () => {
    const cues = [
      { id: 'c1', start: 0, end: 3.128, text: '便利店是24小时亮着的' },
      { id: 'c2', start: 3.128, end: 68.08, text: '这个城市里' },
    ];
    const out = exportSrt(cues);
    expect(out).toBe(
      '1\n00:00:00,000 --> 00:00:03,128\n便利店是24小时亮着的\n\n' +
      '2\n00:00:03,128 --> 00:01:08,080\n这个城市里\n'
    );
  });

  it('cueCount = cues 记录数', () => {
    const cues = [
      { id: 'a', start: 0, end: 1, text: 'x' },
      { id: 'b', start: 1, end: 2, text: 'y' },
      { id: 'c', start: 2, end: 3, text: 'z' },
    ];
    const { cueCount, content } = exportSrt(cues, { returnObject: true });
    expect(cueCount).toBe(3);
    expect(content.split('\n\n')).toHaveLength(3);
  });

  it('cues 为空时抛出 EMPTY_CUES', () => {
    expect(() => exportSrt([])).toThrow('EMPTY_CUES');
  });

  it('UTF-8 无 BOM（Blob 输出）', async () => {
    const cues = [{ id: 'x', start: 0, end: 1, text: '测试' }];
    const blob = exportSrt(cues, { asBlob: true });
    const buf = new Uint8Array(await blob.arrayBuffer());
    expect(buf[0]).not.toBe(0xEF); // BOM = EF BB BF
    expect(blob.type).toBe('application/x-subrip;charset=utf-8');
  });
});

// B005: 编辑与时间轴校验
describe('editSubtitle (B005)', () => {
  const base = [
    { id: 'a', start: 0, end: 2, text: '第一句', status: 'draft' },
    { id: 'b', start: 2, end: 4, text: '第二句', status: 'draft' },
  ];

  it('patch 文本后 status 变为 edited 并返回更新后的 Cue', () => {
    const updated = editSubtitle(base, 'a', { text: '改后的句子' });
    expect(updated.text).toBe('改后的句子');
    expect(updated.status).toBe('edited');
  });

  it('cueId 不存在时抛出 CUE_NOT_FOUND', () => {
    expect(() => editSubtitle(base, 'zzz', { text: 'x' })).toThrow('CUE_NOT_FOUND');
  });

  it('start >= end 抛出 INVALID_TIME_RANGE', () => {
    expect(() => editSubtitle(base, 'a', { start: 3, end: 3 })).toThrow('INVALID_TIME_RANGE');
  });

  it('与相邻 cue 重叠抛出 INVALID_TIME_RANGE', () => {
    expect(() => editSubtitle(base, 'a', { end: 2.5 })).toThrow('INVALID_TIME_RANGE');
  });

  it('合法时间微调通过', () => {
    const u = editSubtitle(base, 'a', { end: 1.9 });
    expect(u.end).toBe(1.9);
  });
});

describe('validateTimeline (B001 then: 升序+不重叠)', () => {
  it('end[i] <= start[i+1] 返回 true', () => {
    expect(validateTimeline([
      { id: 'a', start: 0, end: 1, text: '' },
      { id: 'b', start: 1.5, end: 3, text: '' },
    ])).toBe(true);
  });
  it('重叠返回 false', () => {
    expect(validateTimeline([
      { id: 'a', start: 0, end: 2, text: '' },
      { id: 'b', start: 1, end: 3, text: '' },
    ])).toBe(false);
  });
});

// 繁简转换（Phase0 实测 whisper 中文输出繁体）
describe('toSimplified', () => {
  it('繁体转简体', () => {
    expect(toSimplified('這個城市裡只有便利店和路燈不會關燈')).toBe('这个城市里只有便利店和路灯不会关灯');
    expect(toSimplified('我守著的不是一家店，是一盞燈')).toBe('我守着的不是一家店，是一盏灯');
  });
  it('已是简体则不变', () => {
    expect(toSimplified('便利店是24小时亮着的')).toBe('便利店是24小时亮着的');
  });
});

// SRT 解析（编辑器回读自己的导出）
describe('parseSrt', () => {
  it('roundtrip: exportSrt -> parseSrt 保持 cues', () => {
    const cues = [
      { id: 'x1', start: 1.5, end: 3.25, text: '你好世界' },
      { id: 'x2', start: 65.123, end: 3601.999, text: '第二句' },
    ];
    const srt = exportSrt(cues);
    const parsed = parseSrt(srt);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].start).toBeCloseTo(1.5, 3);
    expect(parsed[0].end).toBeCloseTo(3.25, 3);
    expect(parsed[1].start).toBeCloseTo(65.123, 3);
    expect(parsed[1].text).toBe('第二句');
  });
});
