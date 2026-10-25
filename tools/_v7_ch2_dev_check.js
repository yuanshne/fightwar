// tools/_v7_ch2_dev_check.js —— v7 章节队开发期自查（临时脚本；独立于 levels.js v7 契约块）
// 来源：docs/specs/2026-10-24-v7-design.md §11 附录 A 全文照抄；仅 CONFIG 三行为本章值；
//   数独解数器按附录注记从 gate.js:22-63 复制（sudokuBoxCands/sudokuSolValid/sudokuSolveCount）。
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
/* ===== CONFIG（章节队改这三行）===== */
const CH_FILE = 'chapter2.js';          // 本队章节文件
const CH_THEME = 'sea';                  // 本章新关主题
const CH_SPEC = { first: 11, n: 3, bossKind: 2, eliteChar: 'x', bossIdx: 12 }; // 首关号/关数/kind/精英字符/Boss 关 0 基下标
/* ================================== */
const lvSrc = fs.readFileSync(path.join(ROOT, 'levels.js'), 'utf8');
const chSrc = fs.readFileSync(path.join(ROOT, CH_FILE), 'utf8');
const hasContract = /const CHAPTERS/.test(lvSrc);
const sandbox = new Function('THEMES',
  lvSrc + (hasContract ? '' : '\nconst CHAPTERS=[];') + '\n' + chSrc + '\n;'
  + (hasContract ? 'aggregateLevels();' : 'var ALL_LEVELS=LEVELS.concat(CHAPTERS.reduce(function(a,c){return a.concat(c.levels||[]);},[]));for(const c of CHAPTERS)Object.assign(PUZZLES,c.puzzles||{});')
  + '\n;return {LG,LEVELS,CHAPTERS,ALL_LEVELS,PUZZLES,validateLevels:(typeof validateLevels==="function")?validateLevels:null};'
)({ sea: {}, nether: {} });
const errs = [];
const A = sandbox.ALL_LEVELS;
if (A.length !== 10 + CH_SPEC.n) errs.push('聚合关数=' + A.length + '（应 ' + (10 + CH_SPEC.n) + '，注册对象 levels 数错？）');
const lv = A.slice(CH_SPEC.first - 1, CH_SPEC.first - 1 + CH_SPEC.n);
// ① meta/主题/boss 值域
lv.forEach((m, i) => {
  if (m.theme !== CH_THEME) errs.push('L' + (CH_SPEC.first + i) + ' theme=' + m.theme + '（应 ' + CH_THEME + '）');
  if (!(m.w >= 60 && m.h >= 14 && m.w <= 140 && m.h <= 24)) errs.push('L' + (CH_SPEC.first + i) + ' 网格 ' + m.w + 'x' + m.h + ' 越界');
  if (typeof m.par !== 'number' || m.par < 60 || m.par > 200) errs.push('L' + (CH_SPEC.first + i) + ' par=' + m.par + ' 越界');
});
if (lv[CH_SPEC.bossIdx - CH_SPEC.first + 1].boss !== CH_SPEC.bossKind) errs.push('Boss 关 meta.boss 应为 ' + CH_SPEC.bossKind);
// ② 网格内容统计
const SOLID = new Set(['#', 'I', 'a', 'b', 'C', 'D', 'B', 'G']);
const STAND = new Set(['#', 'I', 'a', 'b', 'C', 'D', 'B', 'G', '=', '(', ')']);
let nElite = 0, nG = 0, nChest = 0;
lv.forEach((m, i) => {
  const no = CH_SPEC.first + i, g = new sandbox.LG(m.w, m.h); m.build(g);
  const at = (x, y) => (x < 0 || x >= m.w) ? '#' : (y < 0 || y >= m.h) ? '.' : g.g[y][x];
  let nAt = 0, nP = 0, nQ = 0, nB = 0, nE = 0, spawn = null;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const c = g.g[y][x];
    if (c === '@') { nAt++; spawn = { x: x, y: y };
      let sup = false; for (let d = 1; d <= 2; d++) if (SOLID.has(at(x, y + d))) sup = true;
      if (!sup) errs.push('L' + no + ' 出生点(' + x + ',' + y + ') 下方 2 格无支撑');
    }
    if (c === 'P') nP++;
    if (c === 'Q') nQ++;
    if (c === 'B') nB++;
    if (c === 'e') nE++;
    if (c === CH_SPEC.eliteChar) nElite++;
    if (c === 'G') nG++;
    if (c === 'g') nChest++;
    if (c === 'N' || c === CH_SPEC.eliteChar || c === 'g' || c === 'Q') {
      let sup = false; for (let d = 1; d <= 2; d++) if (STAND.has(at(x, y + d))) sup = true;
      if (!sup) errs.push('L' + no + ' ' + c + '(' + x + ',' + y + ') 下方 2 格无支撑');
    }
    if (c === 'T' || c === 'E' || c === 'z') {
      // 距出生点 ≥176px（本脚本的章不摆 T/E/z 时天然跳过；第三章必须摆）
      if (spawn && Math.hypot((x - spawn.x) * 16, (y - spawn.y) * 16) < 176)
        errs.push('L' + no + ' ' + c + '(' + x + ',' + y + ') 距 @ <176px（门禁空转会触发）');
    }
    if (c === '{' || c === '}') {
      if (spawn && Math.abs(x - spawn.x) + Math.abs(y - spawn.y) <= 3)
        errs.push('L' + no + ' 水流(' + x + ',' + y + ') 距 @ ≤3 格');
    }
    if (c === '~' && !['~', '#', 'I'].includes(at(x, y + 1)) && y < m.h - 1)
      errs.push('L' + no + ' 熔岩(' + x + ',' + y + ') 悬空');
  }
  const isBoss = !!m.boss;
  if (nAt !== 1) errs.push('L' + no + ' 出生点=' + nAt);
  if (!isBoss && nP !== 1) errs.push('L' + no + ' 终点=' + nP);
  if (isBoss && nP !== 0) errs.push('L' + no + ' Boss 关不应有 P');
  if (nB < 4) errs.push('L' + no + ' 木箱=' + nB + '（应≥4）');
  if (nE % 2 === 1) errs.push('L' + no + ' 传送门 e=' + nE + '（应为偶数）');
  const wantQ = sandbox.PUZZLES[no] ? 1 : 0;
  if (nQ !== wantQ) errs.push('L' + no + ' 神龛=' + nQ + '（puzzles 键存在性=' + wantQ + ' 应一致）');
});
if (nElite !== 1) errs.push('精英 ' + CH_SPEC.eliteChar + ' 合计=' + nElite + '（应恰 1）');
if (nG < 1 || nChest < 1) errs.push('隐藏房 G=' + nG + ' g=' + nChest + '（各应≥1）');
// ③ 谜题数据（奇偶/尺寸/givens⊂sol/数独解唯一——数织画稿只查尺寸，唯一解由设计书交付时已验）
for (const k of Object.keys(sandbox.PUZZLES).map(Number)) {
  if (k < CH_SPEC.first) continue;
  const p = sandbox.PUZZLES[k];
  if (k % 2 === 1 && p.type !== 'nono') errs.push('P' + k + ' 奇数关应数织');
  if (k % 2 === 0 && p.type !== 'sudoku') errs.push('P' + k + ' 偶数关应数独');
  if (p.type === 'nono' && (!Array.isArray(p.pic) || p.pic.length !== p.size || p.pic.some(r => r.length !== p.size)))
    errs.push('P' + k + ' 数织画稿尺寸');
  if (p.type === 'sudoku') {
    for (let r = 0; r < p.size; r++) for (let c = 0; c < p.size; c++)
      if (p.givens[r][c] !== 0 && p.givens[r][c] !== p.sol[r][c]) errs.push('P' + k + ' givens⊄sol');
    // 解唯一（块尺寸自解析同 gate）
    const cands = p.size === 4 ? [[2, 2]] : p.size === 9 ? [[3, 3]] : [[2, 3], [3, 2]];
    // 解数器（与 gate.js sudokuSolveCount/sudokuSolValid 同构，照抄 gate.js:22-63——附录注记允许）
    const okBoxes = cands.filter(b => sudokuSolValid(p, b[0], b[1]));
    if (!okBoxes.length) errs.push('P' + k + ' sol 行/列/块存在重复(不合法终盘)');
    else if (!okBoxes.some(b => sudokuSolveCount(p, b[0], b[1]) === 1)) errs.push('P' + k + ' givens 解不唯一');
  }
}
// ④ 仓库级断言（若 levels.js v7 断言段已合入则一并跑）
if (sandbox.validateLevels) { const v = sandbox.validateLevels(); if (!v.ok) errs.push('validateLevels: ' + v.msg); }
if (errs.length) { console.error('[FAIL] ' + errs.length + ' 处:\n  ' + errs.join('\n  ')); process.exit(1); }
console.log('[OK] ' + CH_FILE + ' 开发期自查通过（聚合 ' + A.length + ' 关；若 levels.js v7 契约块未合入，本结果为桩聚合口径）');

// ---- v4 数独校验辅助（照抄 gate.js:22-63；仅本临时脚本内部使用） ----
function sudokuBoxCands(size) {
  return size === 4 ? [[2, 2]] : size === 9 ? [[3, 3]] : [[2, 3], [3, 2]];
}
function sudokuSolValid(pz, bh, bw) {
  const n = pz.size, sol = pz.sol;
  const uniq = get => { const s = new Set(); for (let i = 0; i < n; i++) { const v = get(i); if (v < 1 || v > n || s.has(v)) return false; s.add(v); } return true; };
  for (let r = 0; r < n; r++) if (!uniq(c => sol[r][c])) return false;
  for (let c = 0; c < n; c++) if (!uniq(r => sol[r][c])) return false;
  for (let br = 0; br < n; br += bh) for (let bc = 0; bc < n; bc += bw) {
    const s = new Set();
    for (let r = br; r < br + bh; r++) for (let c = bc; c < bc + bw; c++) {
      const v = sol[r][c]; if (v < 1 || v > n || s.has(v)) return false; s.add(v);
    }
  }
  return true;
}
function sudokuSolveCount(pz, bh, bw) { // 回溯解计数（>1 早退；min 候选格分支，4/6/9 规模毫秒级）
  const n = pz.size, g = pz.givens.map(r => r.slice());
  let count = 0;
  function cands(r, c) {
    const used = new Set();
    for (let i = 0; i < n; i++) { if (g[r][i]) used.add(g[r][i]); if (g[i][c]) used.add(g[i][c]); }
    const r0 = Math.floor(r / bh) * bh, c0 = Math.floor(c / bw) * bw;
    for (let i = r0; i < r0 + bh; i++) for (let j = c0; j < c0 + bw; j++) if (g[i][j]) used.add(g[i][j]);
    const out = [];
    for (let v = 1; v <= n; v++) if (!used.has(v)) out.push(v);
    return out;
  }
  function go() {
    if (count > 1) return;
    let br = -1, bc = -1, bcands = null;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!g[r][c]) {
      const cs = cands(r, c);
      if (!cs.length) return;
      if (br < 0 || cs.length < bcands.length) { br = r; bc = c; bcands = cs; }
    }
    if (br < 0) { count++; return; }
    for (const v of bcands) { g[br][bc] = v; go(); g[br][bc] = 0; if (count > 1) return; }
  }
  go();
  return count;
}
