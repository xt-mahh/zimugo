// localsub 主界面逻辑（B001-B006 串接）
import { transcribe, NO_AUDIO_TRACK, TRANSCRIBE_ABORTED } from './engine/transcribe.js';
import { detectBackend, DTYPES } from './engine/engine.js';
import { exportSrt } from './export/srt.js';
import { editSubtitle } from './editor/cue.js';

const $ = (id) => document.getElementById(id);
let file = null, result = null, running = false;

const fmt = (s) => s.toFixed(2);
const isSuspect = (c) =>
  c.text.length <= 4 || /^\(.*\)|（.*）|[（(]\s*(字幕|唱|Oh)/.test(c.text);

// ---- 后端探测 ----
(async () => {
  const { backend, adapter, reason } = await detectBackend();
  $('backendInfo').textContent = backend === 'webgpu'
    ? `WebGPU（${adapter}）`
    : `WASM（${reason}）`;
})();

// ---- 文件选择 / 拖拽 ----
$('file').addEventListener('change', (e) => setFile(e.target.files[0]));
const drop = $('drop');
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('on'); });
drop.addEventListener('dragleave', () => drop.classList.remove('on'));
drop.addEventListener('drop', (e) => {
  e.preventDefault(); drop.classList.remove('on');
  if (e.dataTransfer.files.length) setFile(e.dataTransfer.files[0]);
});

function setFile(f) {
  if (!f) return;
  file = f;
  drop.textContent = `已选择：${f.name}（${(f.size / 1048576).toFixed(1)} MB）`;
  $('run').disabled = false;
  $('err').textContent = '';
}

// ---- 进度 ----
function setProgress(stage, frac, msg) {
  $('prog').style.width = `${Math.round(frac * 100)}%`;
  $('status').textContent = msg || ({
    decode: '解码音频…', vad: 'VAD 检测人声…', transcribe: '转写中…', done: '完成',
  })[stage] || '';
}

// ---- 转写 ----
$('run').addEventListener('click', async () => {
  if (!file || running) return;
  running = true;
  $('run').disabled = true; $('cancel').disabled = false;
  $('err').textContent = '';
  const t0 = performance.now();
  try {
    result = await transcribe(file, {
      backend: $('backendSel').value === 'auto' ? undefined : $('backendSel').value,
      modelKey: $('model').value,
      concurrency: parseInt($('concurrency').value, 10),
      useVad: $('usevad').checked,
      maxCharsPerCue: parseInt($('maxChars').value, 10) || 10,
      onProgress: ({ stage, frac, msg }) => {
        if (msg) { setProgress(stage, frac || 0, msg); }
        else if (stage === 'vad') setProgress('vad', 0.05 + frac * 0.1, `VAD 检测人声 ${(frac * 100) | 0}%`);
        else if (stage === 'done') setProgress('done', 1, '完成');
      },
    });
    const el = (performance.now() - t0) / 1000;
    $('rElapsed').textContent = `${el.toFixed(1)}s`;
    $('rRtf').textContent = (el / result.audioDurationSec).toFixed(2);
    $('rBackend').textContent = `${result.backend}`;
    $('rCount').textContent = result.cues.length;
    $('resultCard').style.display = '';
    renderCues(result.cues);
    $('editorCard').style.display = '';
    setProgress('done', 1, `完成 ✅ ${result.cues.length} 条字幕，可直接编辑后导出`);
  } catch (e) {
    if (e.message === NO_AUDIO_TRACK) $('err').textContent = '未检测到人声（或无音轨），不生成字幕。';
    else if (e.message === TRANSCRIBE_ABORTED) $('err').textContent = '转写已取消，已保留的部分结果未生成。';
    else $('err').textContent = '失败：' + e.message;
    setProgress('', 0, '失败');
  } finally {
    running = false;
    $('run').disabled = false; $('cancel').disabled = true;
  }
});

// ---- 字幕编辑表 ----
function renderCues(cues) {
  const body = $('cueBody');
  body.innerHTML = '';
  cues.forEach((c, i) => {
    const tr = document.createElement('tr');
    const suspect = isSuspect(c);
    tr.innerHTML = `
      <td class="hint">${i + 1}</td>
      <td class="time"><input data-id="${c.id}" data-k="start" value="${fmt(c.start)}"></td>
      <td class="time"><input data-id="${c.id}" data-k="end" value="${fmt(c.end)}"></td>
      <td><input type="text" data-id="${c.id}" data-k="text" value="${c.text.replace(/"/g, '&quot;')}" ${suspect ? 'class="suspect"' : ''}></td>
      <td><span class="badge ${c.status}">${c.status === 'edited' ? '已编辑' : '草稿'}</span></td>
      <td><button class="del" data-id="${c.id}" title="删除">✕</button></td>`;
    body.appendChild(tr);
  });

  body.querySelectorAll('input').forEach((inp) => {
    inp.addEventListener('change', () => {
      const id = inp.dataset.id, k = inp.dataset.k;
      const patch = k === 'text' ? { text: inp.value } : { [k]: parseFloat(inp.value) };
      try {
        const updated = editSubtitle(cues, id, patch);
        Object.assign(cues.find((c) => c.id === id), updated);
        inp.classList.remove('err');
        const badge = inp.closest('tr').querySelector('.badge');
        badge.textContent = '已编辑'; badge.className = 'badge edited';
      } catch (e) {
        inp.classList.add('err');
        $('err').textContent = e.message === 'INVALID_TIME_RANGE'
          ? '时间轴非法（start 须早于 end 且不与相邻条重叠）' : e.message;
      }
    });
  });

  body.querySelectorAll('.del').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = cues.findIndex((c) => c.id === btn.dataset.id);
      if (idx >= 0) { cues.splice(idx, 1); renderCues(cues); }
    });
  });
}

// ---- 导出 ----
$('exportBtn').addEventListener('click', () => {
  try {
    const blob = exportSrt(result.cues, { asBlob: true });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (file.name || 'subtitle').replace(/\.[^.]+$/, '') + '.srt';
    a.click();
    URL.revokeObjectURL(a.href);
    $('err').textContent = '';
  } catch (e) {
    $('err').textContent = e.message === 'EMPTY_CUES' ? '字幕为空，无法导出' : e.message;
  }
});
