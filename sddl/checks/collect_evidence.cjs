#!/usr/bin/env node
/**
 * SDDL C1-C4 确定性证据收集器（JS 版，对齐 check_c1_c4.py 输出结构）
 * 用途：为 agent LLM 审核提供确定性证据（脚本不做语义判断）。
 * 覆盖：c1_def L1 标签索引（behavior→test 映射）、c2_def 符号表（接口存在性）、
 *       c3 测试执行（vitest）、c4b_def docs↔code 符号表。
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 2026-09-22: ROOT 改为仓库相对定位（原硬编码 /root/workspace/localsub，
// 项目迁至 /nas1/nas1/project/localsub 后失效；逻辑零改动，仅修路径——见 commit message）
const ROOT = path.resolve(__dirname, '..', '..');
const FE = path.join(ROOT, 'frontend');

const specFile = fs.readFileSync(path.join(ROOT, 'sddl/specs/subtitle-tool/spec.yaml'), 'utf8');

// ---------- C1-def L1: behavior → test 映射（从测试文件头注释和断言内容提取） ----------
const testDir = path.join(FE, 'tests');
const testFiles = fs.readdirSync(testDir).filter((f) => f.endsWith('.test.js'));
const testSrc = testFiles.map((f) => fs.readFileSync(path.join(testDir, f), 'utf8')).join('\n');

const behaviorIds = [...specFile.matchAll(/- id: "(B\d+)"/g)].map((m) => m[1]);
const behaviorTests = {};
for (const b of behaviorIds) {
  behaviorTests[b] = testFiles.filter((f) =>
    fs.readFileSync(path.join(testDir, f), 'utf8').includes(b));
}

// ---------- C2-def: 接口符号表 ----------
const srcDir = path.join(FE, 'src');
function walkJs(dir) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walkJs(p));
    else if (p.endsWith('.js') && !p.endsWith('.worker.js')) out.push(p);
  }
  return out;
}
const codeSrc = walkJs(srcDir).map((p) => fs.readFileSync(p, 'utf8')).join('\n');

const interfaces = [...specFile.matchAll(/- name: "(\w+)"/g)].map((m) => m[1]);
const symbolMap = {};
for (const iface of interfaces) {
  const jsName = iface === 'loadEngine' ? 'loadEngine|detectBackend|TranscribePool' : iface;
  symbolMap[iface] = {
    exported: new RegExp(`export (async )?(function|const|class) (${jsName})\\b`).test(codeSrc),
  };
}
const specErrors = [...specFile.matchAll(/errors: \[([^\]]+)\]/g)]
  .flatMap((m) => m[1].split(',').map((s) => s.trim().replace(/"/g, '')));
const errorMap = {};
for (const err of new Set(specErrors)) {
  errorMap[err] = codeSrc.includes(err);
}

// ---------- C3: 测试执行 ----------
let c3;
try {
  execSync('npx vitest run --reporter=json --outputFile=.vitest/json/output.json', { cwd: FE, encoding: 'utf8', timeout: 120000, stdio: 'pipe' });
  const j = JSON.parse(fs.readFileSync(path.join(FE, '.vitest/json/output.json'), 'utf8'));
  c3 = {
    pass: j.numPassedTests === j.numTotalTests && j.numTotalTests > 0,
    passed: j.numPassedTests, total: j.numTotalTests,
    failed: j.numFailedTests, skipped: j.numPendingTests ?? 0,
  };
} catch (e) {
  c3 = { pass: false, raw: String(e.message).slice(0, 200) };
}

// ---------- C4b-def: docs ----------
const docsDir = path.join(ROOT, 'docs');
const docsSrc = docsDir && fs.existsSync(docsDir)
  ? fs.readdirSync(docsDir).flatMap((d) => {
      const sub = path.join(docsDir, d);
      return fs.statSync(sub).isDirectory() ? fs.readdirSync(sub).map((f) => fs.readFileSync(path.join(sub, f), 'utf8')) : [];
    }).join('\n') : '';

const report = {
  c1_def: { behavior_tests: behaviorTests, test_files: testFiles },
  c2_def: { interfaces: symbolMap, errors: errorMap },
  c3,
  c4b_def: { docs_exists: !!docsSrc, docs_declared_apis_in_code: docsSrc ? interfaces.filter((i) => docsSrc.includes(i)) : [] },
};
console.log(JSON.stringify(report, null, 2));
