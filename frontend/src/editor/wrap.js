// 字幕分行（DP-002）：每条 ≤ maxChars 字，切词不切断词语
// 轻量中文切词：贪心正向最大匹配（内置词典），足够分行用途
const DICT = new Set([
  '便利店','小时','这个','城市','只有','和','路灯','不会','关灯','一家','一盏灯',
  '守着','不是','那些','不想','回家','的人','亮着','明天','他说','这个字','很短',
  '看完','觉得','还没','来得及','三年','搬了','四次','每一次','别人','告诉',
  '该走了','不知道','哪里','没有','房子','桌子','专门','留灯','谁的','声音',
  '需要','一点','什么','外面','坐会儿','如果','今晚','有人','这样','不说',
  '只是','一杯','热的','可能','就是','不会','蹲在','雨里','距离','有时候',
  '递出去','接住','然后','各自','走进','每个','地方','一个','等谁','灭了',
  '我们','你们','他们','因为','所以','但是','可是','然后','已经','还是',
  '真的','觉得','开始','最后','突然','原来','如果','也许','大概','应该',
]);
const MAX_WORD = 5;

export function tokenize(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    let matched = '';
    for (let len = Math.min(MAX_WORD, text.length - i); len >= 1; len--) {
      const w = text.slice(i, i + len);
      if (DICT.has(w)) { matched = w; break; }
    }
    if (matched) { out.push(matched); i += matched.length; }
    else { out.push(text[i]); i += 1; }
  }
  return out;
}

/** 按词切分行长：每条 ≤ maxChars 字，超长行在词边界折行 */
export function wrapByWords(text, maxChars = 10) {
  const words = tokenize(text);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (cur.length + w.length > maxChars && cur.length > 0) { lines.push(cur); cur = w; }
    else cur += w;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** 把一个 cue 按时间-字符比例拆成多条（时长按字符数加权） */
export function splitCueByChars(cue, maxChars = 10) {
  const lines = wrapByWords(cue.text, maxChars);
  if (lines.length <= 1) return [cue];
  const totalChars = lines.reduce((a, l) => a + l.length, 0);
  const dur = cue.end - cue.start;
  const out = [];
  let t = cue.start;
  for (let i = 0; i < lines.length; i++) {
    const share = (lines[i].length / totalChars) * dur;
    const end = i === lines.length - 1 ? cue.end : t + share;
    out.push({ ...cue, start: t, end, text: lines[i] });
    t = end;
  }
  return out;
}
