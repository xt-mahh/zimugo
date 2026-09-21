#!/usr/bin/env node
/**
 * localsub 项目收集器（C-arch-def2/def3，JS/ESM 版）
 * 按 references/evidence-contract.md 构造；构造即固化——修改须在 commit message 说明理由。
 * 输出与 check_arch.py --with-imports --json 同构的 facts：
 *   { import_graph, dir_facts, violations }  violations 非空 = fail（exit 1）
 *
 * 规则：
 *   - ESM import 解析：import ... from '<spec>'（含动态 import()）；正则实现，
 *     相对路径解析到模块 path 归属，包名（非相对）记为外部依赖不参与 def2
 *   - def2: 实际跨模块依赖 ⊆ 声明 depends_on（越界 = violation）
 *   - def3: 模块 path 存在且含代码文件；import 指向不存在的本地文件 = 违规（防幽灵）
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const ARCH = path.join(ROOT, 'sddl', 'architecture.yaml');

// 极简 YAML 模块段解析（architecture.yaml 是受控格式，避免引依赖）
const raw = fs.readFileSync(ARCH, 'utf8');
const modules = [];
let cur = null;
for (const line of raw.split('\n')) {
  const m = line.match(/^  - name: "(.+)"$/);
  if (m) { cur = { name: m[1] }; modules.push(cur); continue; }
  if (!cur) continue;
  const dep = line.match(/^\s+depends_on: \[(.*?)\]/);
  if (dep) cur.deps = dep[1] ? dep[1].split(',').map(s => s.trim().replace(/"/g, '').replace(/#.*/, '').trim()).filter(Boolean) : [];
  const p = line.match(/^\s+path: "(.+?)"/);
  if (p) cur.path = p[1];
}

const violations = [];
const import_graph = {};
const dir_facts = {};

const IMPORT_RE = /(?:^|\n)\s*(?:import\s[^'"]*?from\s*|import\s*|export\s[^'"]*?from\s*)['"]([^'"]+)['"]|(?:^|\n)\s*import\(\s*['"]([^'"]+)['"]\s*\)/g;

for (const mod of modules) {
  const modDir = path.join(ROOT, mod.path);
  if (!fs.existsSync(modDir)) {
    dir_facts[mod.name] = 'missing';
    violations.push(`C-arch-def3: 模块 ${mod.name} 目录不存在: ${mod.path}`);
    continue;
  }
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'dist') continue;
      if (e.isDirectory()) walk(path.join(d, e.name));
      else if (/\.(js|mjs|cjs)$/.test(e.name)) files.push(path.join(d, e.name));
    }
  })(modDir);
  if (!files.length) {
    dir_facts[mod.name] = 'empty';
    violations.push(`C-arch-def3: 模块 ${mod.name} 目录无代码文件: ${mod.path}`);
    continue;
  }
  dir_facts[mod.name] = 'ok';
  const deps = new Set();
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    let mch;
    while ((mch = IMPORT_RE.exec(src))) {
      const spec = mch[1] || mch[2];
      if (!spec.startsWith('.')) continue; // 外部包不参与 def2
      const resolved = require('path').resolve(path.dirname(f), spec);
      const rel = path.relative(ROOT, resolved);
      const target = modules.find(o => rel === o.path || rel.startsWith(o.path + '/'));
      if (target && target.name !== mod.name) deps.add(target.name);
      else if (!target && !fs.existsSync(resolved + '.js') && !fs.existsSync(resolved)) {
        violations.push(`C-arch-def3: ${path.relative(ROOT, f)} import 不存在的文件: ${spec}`);
      }
    }
  }
  import_graph[mod.name] = [...deps].sort();
  const undeclared = deps.difference
    ? [...deps].filter(d => !(mod.deps || []).includes(d))
    : [...deps].filter(d => !(mod.deps || []).includes(d));
  if (undeclared.length) {
    violations.push(`C-arch-def2: 模块 ${mod.name} 越界 import（未声明依赖）: ${undeclared.join(', ')}`);
  }
}

const out = {
  collector: 'localsub project collector (JS/ESM) v1',
  evidence_contract: 'references/evidence-contract.md',
  import_graph, dir_facts, violations,
  pass: violations.length === 0,
};
console.log(JSON.stringify(out, null, 2));
process.exit(out.pass ? 0 : 1);
