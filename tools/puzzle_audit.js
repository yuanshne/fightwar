// 谜题适定性审计（可解性 / 唯一解 / 神龛配对）——供 gate.js 与 CLI 共用。
// 背景：v7.3 谜题门要求「本关神龛全解」才放行终点，于是「谜题不可解」=「整关不可通关」。
// 本模块回答两个问题：
//   ① 每题是否唯一解？（多解 → 玩家按线索/规则推出的合法解会被旧版「对答案」判定误判为错）
//   ② 每个神龛是否都有可玩数据？（缺数据 → 谜题门永久锁死）
// 用法：node tools/puzzle_audit.js [--json]    退出码 0=合格 / 1=不合格
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---------- 数独 ----------
function sudokuSolValid(sol, n, bh, bw) {
  const uniq = get => { const s = new Set(); for (let i = 0; i < n; i++) { const v = get(i); if (v < 1 || v > n || s.has(v)) return false; s.add(v); } return true; };
  for (let r = 0; r < n; r++) if (!uniq(c => sol[r][c])) return false;
  for (let c = 0; c < n; c++) if (!uniq(r => sol[r][c])) return false;
  for (let br = 0; br < n; br += bh) for (let bc = 0; bc < n; bc += bw) {
    const s = new Set();
    for (let r = br; r < br + bh; r++) for (let c = bc; c < bc + bw; c++) { const v = sol[r][c]; if (v < 1 || v > n || s.has(v)) return false; s.add(v); }
  }
  return true;
}
function sudokuBoxDims(pz) { // 与 ui.js sudokuBoxDims / gate.js sudokuBoxCands 同规则
  if (pz.size === 4) return [2, 2];
  if (pz.size === 9) return [3, 3];
  for (const d of [[2, 3], [3, 2]]) if (sudokuSolValid(pz.sol, pz.size, d[0], d[1])) return d;
  return null;
}
function sudokuSolutionCount(grid, n, bh, bw, cap) {
  // MRV 回溯计数，数到 cap 即停
  let best = -1, bestCand = null;
  for (let i = 0; i < n * n; i++) {
    const r = (i / n) | 0, c = i % n;
    if (grid[r][c]) continue;
    const used = new Set();
    for (let k = 0; k < n; k++) { used.add(grid[r][k]); used.add(grid[k][c]); }
    const r0 = ((r / bh) | 0) * bh, c0 = ((c / bw) | 0) * bw;
    for (let a = r0; a < r0 + bh; a++) for (let b = c0; b < c0 + bw; b++) used.add(grid[a][b]);
    const cand = [];
    for (let v = 1; v <= n; v++) if (!used.has(v)) cand.push(v);
    if (!cand.length) return 0;
    if (!bestCand || cand.length < bestCand.length) { best = i; bestCand = cand; if (cand.length === 1) break; }
  }
  if (best < 0) return 1;
  const r = (best / n) | 0, c = best % n;
  let total = 0;
  for (const v of bestCand) {
    grid[r][c] = v;
    total += sudokuSolutionCount(grid, n, bh, bw, cap - total);
    grid[r][c] = 0;
    if (total >= cap) break;
  }
  return total;
}

// ---------- 数织 ----------
function runsOf(str) {
  const out = []; let cur = 0;
  for (const ch of str) { if (ch === '#') cur++; else if (cur) { out.push(cur); cur = 0; } }
  if (cur) out.push(cur);
  return out;
}
function rowPatterns(n, runs) { // 枚举长度 n、线索 runs 的全部行模式
  const out = [];
  const m = runs.length;
  if (m === 0) { out.push('.'.repeat(n)); return out; }
  const total = runs.reduce((a, b) => a + b, 0) + m - 1;
  if (total > n) return out;
  const buf = Array(n).fill('.');
  (function place(ri, pos) {
    if (ri === m) { out.push(buf.join('')); return; }
    let rest = 0;
    for (let j = ri + 1; j < m; j++) rest += runs[j];
    rest += Math.max(0, m - ri - 2);
    const last = n - runs[ri] - rest;
    for (let s = pos; s <= last; s++) {
      for (let k = 0; k < runs[ri]; k++) buf[s + k] = '#';
      place(ri + 1, s + runs[ri] + 1);
      for (let k = 0; k < runs[ri]; k++) buf[s + k] = '.';
    }
  })(0, 0);
  return out;
}
function colFeasible(prefix, runs, n) { // 列前缀能否扩展成满足线索的整列
  const k = prefix.length, rem = n - k, m = runs.length;
  const groups = []; let cur = 0;
  for (const ch of prefix) { if (ch === '#') cur++; else if (cur) { groups.push(cur); cur = 0; } }
  const open = prefix.endsWith('#');
  if (open) groups.push(cur);
  const sumFrom = i => { let s = 0; for (let j = i; j < m; j++) s += runs[j]; return s; };
  if (open) {
    const j = groups.length - 1;
    for (let i = 0; i < j; i++) if (groups[i] !== runs[i]) return false;
    if (j >= m || groups[j] > runs[j]) return false;
    let need = runs[j] - groups[j];
    if (j + 1 < m) need += 1 + sumFrom(j + 1) + (m - 1 - (j + 1));
    return need <= rem;
  }
  if (groups.length > m) return false;
  for (let i = 0; i < groups.length; i++) if (groups[i] !== runs[i]) return false;
  if (groups.length === m) return true;
  return sumFrom(groups.length) + (m - groups.length - 1) <= rem;
}
function nonoSolutionCount(pic, cap) {
  const n = pic.length;
  const rowRuns = pic.map(runsOf);
  const colRuns = [];
  for (let c = 0; c < n; c++) { let s = ''; for (let r = 0; r < n; r++) s += pic[r][c]; colRuns.push(runsOf(s)); }
  const rows = rowRuns.map(rr => rowPatterns(n, rr));
  if (rows.some(r => !r.length)) return 0;
  const cols = Array.from({ length: n }, () => '');
  let total = 0;
  (function dfs(r) {
    if (total >= cap) return;
    if (r === n) { total++; return; }
    for (const pat of rows[r]) {
      let ok = true;
      for (let c = 0; c < n; c++) if (!colFeasible(cols[c] + pat[c], colRuns[c], n)) { ok = false; break; }
      if (!ok) continue;
      for (let c = 0; c < n; c++) cols[c] += pat[c];
      dfs(r + 1);
      for (let c = 0; c < n; c++) cols[c] = cols[c].slice(0, -1);
      if (total >= cap) return;
    }
  })(0);
  return total;
}

// ---------- 汇总审计 ----------
// puzzles: PUZZLES 对象；allLevels: 聚合关数组；LG: 网格构建器（可选，用于神龛配对）
function auditPuzzles(puzzles, allLevels, LG) {
  const items = [], pairing = [];
  for (const key of Object.keys(puzzles).map(Number).sort((a, b) => a - b)) {
    const pz = puzzles[key], probs = [];
    if (!pz || (pz.type !== 'nono' && pz.type !== 'sudoku')) {
      items.push({ key, ok: false, msg: '缺失或未知 type=' + (pz && pz.type), count: -1 });
      continue;
    }
    if (key % 2 === 1 && pz.type !== 'nono') probs.push('奇数关应为数织,实为 ' + pz.type);
    if (key % 2 === 0 && pz.type !== 'sudoku') probs.push('偶数关应为数独,实为 ' + pz.type);
    const n = pz.size;
    if (!(Number.isInteger(n) && n >= 2 && n <= 12)) probs.push('size 非法 ' + n);
    let count = -1, detail = '';
    if (!probs.length && pz.type === 'nono') {
      if (!Array.isArray(pz.pic) || pz.pic.length !== n) probs.push('pic 行数≠' + n);
      else pz.pic.forEach((row, r) => {
        if (typeof row !== 'string' || row.length !== n) probs.push('pic[' + r + '] 宽度≠' + n);
        else if (/[^#.]/.test(row)) probs.push('pic[' + r + '] 含非法字符');
      });
      if (!probs.length) {
        count = nonoSolutionCount(pz.pic, 3);
        if (count === 0) probs.push('无解');
        if (count > 1) probs.push('多解（≥' + count + '）→ 线索歧义，玩家按线索推出的合法图案会被判错');
        detail = n + '×' + n + ' 解数' + count;
      }
    } else if (!probs.length) {
      if (!Array.isArray(pz.sol) || pz.sol.length !== n || !Array.isArray(pz.givens) || pz.givens.length !== n) probs.push('矩阵行数≠' + n);
      else {
        const box = sudokuBoxDims(pz);
        if (!box) probs.push('sol 在任何块划分下都不合法');
        else {
          let given = 0, sub = true;
          for (let r = 0; r < n; r++) {
            if (!Array.isArray(pz.sol[r]) || pz.sol[r].length !== n || !Array.isArray(pz.givens[r]) || pz.givens[r].length !== n) { sub = false; break; }
            for (let c = 0; c < n; c++) {
              const g = pz.givens[r][c];
              if (g) { given++; if (g !== pz.sol[r][c]) sub = false; }
            }
          }
          if (!sub) probs.push('givens 不是 sol 的挖空子集');
          else {
            count = sudokuSolutionCount(pz.givens.map(r => r.slice()), n, box[0], box[1], 3);
            if (count === 0) probs.push('无解');
            if (count > 1) probs.push('多解（≥' + count + '）→ 玩家填出合法终盘会被判错');
            detail = '块' + box[0] + '×' + box[1] + ' 给定' + given + ' 解数' + count;
          }
        }
      }
    }
    items.push({ key, ok: !probs.length, msg: probs.join('; ') || ('ok ' + detail), count });
  }
  // 神龛 ↔ 谜题配对（需要 LG + 关卡 build）
  if (LG && allLevels) {
    for (let li = 0; li < allLevels.length; li++) {
      const m = allLevels[li];
      if (!m || !m.build) continue;
      const g = new LG(m.w, m.h);
      m.build(g);
      let nQ = 0;
      for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (g.g[y][x] === 'Q') nQ++;
      const key = li + 1, has = !!puzzles[key];
      if (nQ && !has) pairing.push('L' + key + ' 有神龛但 PUZZLES[' + key + '] 缺失 → 谜题门永久锁死（硬卡关）');
      if (has && !nQ) pairing.push('L' + key + ' 有谜题数据但无神龛（死数据，玩家看不到）');
      if (nQ > 1) pairing.push('L' + key + ' 神龛 ' + nQ + ' 个（每关应 ≤1）');
    }
  }
  const bad = items.filter(i => !i.ok).length + pairing.length;
  return { ok: bad === 0, items, pairing, bad };
}

module.exports = { auditPuzzles, nonoSolutionCount, sudokuSolutionCount, sudokuSolValid, sudokuBoxDims, runsOf };

// ---------- CLI ----------
if (require.main === module) {
  const ROOT = path.resolve(__dirname, '..');
  const sandbox = { console, Math, Set, Map, Array, Object, JSON, Number, String };
  vm.createContext(sandbox);
  for (const f of ['levels.js', 'chapter2.js', 'chapter3.js']) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    vm.runInContext(fs.readFileSync(p, 'utf8'), sandbox, { filename: f });
  }
  vm.runInContext('aggregateLevels(); globalThis.__P=PUZZLES; globalThis.__A=ALL_LEVELS; globalThis.__L=LG;', sandbox, { filename: 'aggregate.js' });
  const r = auditPuzzles(sandbox.__P, sandbox.__A, sandbox.__L);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    console.log('谜题适定性审计（' + r.items.length + ' 题 / ' + sandbox.__A.length + ' 关）');
    for (const it of r.items) console.log((it.ok ? '  [PASS] ' : '  [FAIL] ') + 'P' + it.key + '  ' + it.msg);
    for (const p of r.pairing) console.log('  [FAIL] ' + p);
    console.log(r.ok ? '\n全部合格：每题唯一解、每关神龛都有可玩数据' : '\n不合格 ' + r.bad + ' 项');
  }
  process.exit(r.ok ? 0 : 1);
}
