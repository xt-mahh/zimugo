#!/usr/bin/env python3
"""Phase 0 质量对比：whisper 输出 vs 人工校对的 ground truth SRT。
输出: CER(字错率, 按拼音豁免同音字另算)、时间轴偏差、分段数对比。
"""
import json, re, sys
from difflib import SequenceMatcher

def parse_srt(path):
    text = open(path, encoding='utf-8').read()
    blocks = [b for b in text.replace('\r\n', '\n').split('\n\n') if b.strip()]
    cues = []
    for b in blocks:
        lines = b.strip().split('\n')
        m = re.search(r'(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)', b)
        if not m: continue
        g = [int(x) for x in m.groups()]
        start = g[0]*3600 + g[1]*60 + g[2] + g[3]/1000
        end = g[4]*3600 + g[5]*60 + g[6] + g[7]/1000
        txt = '\n'.join(lines[1:]) if '-->' not in lines[1] else '\n'.join(lines[2:])
        cues.append({'start': start, 'end': end, 'text': txt.replace('\n', ' ')})
    return cues

def parse_out(path):
    d = json.load(open(path, encoding='utf-8'))
    cues = []
    for c in d['chunks']:
        ts = c['timestamp']
        cues.append({'start': ts[0] or 0, 'end': ts[1] or (ts[0] or 0), 'text': c['text'].strip()})
    return cues, d

def norm(s):
    from zhconv import convert
    s = convert(s, 'zh-hans')  # whisper 常输出繁体，统一转简体再比
    return re.sub(r'[^\u4e00-\u9fff a-z0-9]', '', s.lower())

def cer(ref, hyp):
    r, h = norm(ref), norm(hyp)
    if not r: return 0.0, 0, len(h)
    sm = SequenceMatcher(None, r, h, autojunk=False)
    return 1 - sm.ratio(), len(r), sum(b.size for b in sm.get_matching_blocks())

def main(ref_path, out_path):
    ref = parse_srt(ref_path)
    hyp, meta = parse_out(out_path)
    ref_text = ''.join(c['text'] for c in ref)
    hyp_text = ''.join(c['text'] for c in hyp)
    e, nref, nmatch = cer(ref_text, hyp_text)
    print(f"模型: {meta['model']}  后端: wasm(服务器CPU)")
    print(f"RTF: {meta['rtf']:.2f}  (音频 {meta['audioSec']:.0f}s / 转写 {meta['elapsedSec']:.0f}s)")
    print(f"分段数: ref={len(ref)}  hyp={len(hyp)}")
    print(f"全文 CER(含标点豁免后): {e*100:.1f}%   准确率: {(1-e)*100:.1f}%  [ref {nref}字, 匹配 {nmatch}]")
    # 时间轴: 对每个 ref cue 找时间最近的 hyp cue
    devs = []
    for r in ref:
        best = min(hyp, key=lambda h: abs((h['start']+h['end'])/2 - (r['start']+r['end'])/2), default=None)
        if best: devs.append(abs(best['start'] - r['start']))
    if devs:
        devs.sort()
        print(f"时间轴偏差(最近匹配): 中位 {devs[len(devs)//2]:.2f}s  P90 {devs[int(len(devs)*0.9)]:.2f}s")
    print("\n--- ground truth (前10条) ---")
    for c in ref[:10]: print(f"  [{c['start']:7.2f}-{c['end']:7.2f}] {c['text']}")
    print("\n--- 识别结果 (前10条) ---")
    for c in hyp[:10]: print(f"  [{c['start']:7.2f}-{c['end']:7.2f}] {c['text']}")

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
