// v5 关卡队自测（内部工具，不属游戏导出）：node tools/_v5_levels_check.js
// 断言：①LEVELS.length===10；②新机关分布（L8 有 w、L9 有 A+H、L10 有 e+w）；
// ③PUZZLES 键=1..6,8..10；④新三关 B≥4/@/P/Q 恰1、e 偶数；⑤P8/P10 数独唯一解、
// P9 数织唯一解（独立求解器复验）；⑥旧七关 build 输出与 git HEAD 逐瓦片一致（防误改）。
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

const cur = new Function(fs.readFileSync(path.join(ROOT, 'levels.js'), 'utf8') + '\n;return {LG,LEVELS,PUZZLES};')();

// ---- ① 关数 ----
ok(cur.LEVELS.length === 10, 'LEVELS.length=' + cur.LEVELS.length + '(应为10)');

const gridOf = (LG, L) => { const g = new LG(L.w, L.h); L.build(g); return g.g; };
const grids = cur.LEVELS.map(L => gridOf(cur.LG, L));
const joined = grids.map(g => g.map(r => r.join('')).join('\n'));

// ---- ② 新机关分布 ----
ok(joined[7].includes('w'), 'L8 应含风柱 w');
ok(!joined[7].includes('e') && !joined[7].includes('A') && !joined[7].includes('H'), 'L8 不应含 e/A/H');
ok(joined[8].includes('A') && joined[8].includes('H'), 'L9 应含骑士 A 与吊灯 H');
ok(!joined[8].includes('w') && !joined[8].includes('e'), 'L9 不应含 w/e');
ok(joined[9].includes('e') && joined[9].includes('w'), 'L10 应含传送门 e 与风柱 w');

// ---- ③ PUZZLES 键 ----
const keys = Object.keys(cur.PUZZLES).map(Number).sort((a, b) => a - b);
ok(JSON.stringify(keys) === JSON.stringify([1, 2, 3, 4, 5, 6, 8, 9, 10]),
  'PUZZLES 键=' + keys.join(',') + '(应为 1..6,8..10)');

// ---- ④ 每关实体计数（validateLevels 已查，此处按工单 §F 复核新三关） ----
const count = (g, ch) => g.reduce((n, row) => n + row.filter(c => c === ch).length, 0);
for (let i = 7; i < 10; i++) {
  const nB = count(grids[i], 'B'), nAt = count(grids[i], '@'), nP = count(grids[i], 'P'), nQ = count(grids[i], 'Q');
  ok(nB >= 4, 'L' + (i + 1) + ' B=' + nB + '(应≥4)');
  ok(nAt === 1 && nP === 1 && nQ === 1, 'L' + (i + 1) + ' @/P/Q=' + nAt + '/' + nP + '/' + nQ + '(应各1)');
}
ok(count(grids[9], 'e') % 2 === 0 && count(grids[9], 'e') === 4, 'L10 e=' + count(grids[9], 'e') + '(应4=两对)');

// ---- ⑤ 新谜题唯一解独立复验 ----
function sudokuSolveCount(givens, n, bh, bw) {
  const g = givens.map(r => r.slice()); let cnt = 0;
  function go() {
    if (cnt > 1) return;
    let br = -1, bc = -1, best = null;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!g[r][c]) {
      const used = new Set();
      for (let i = 0; i < n; i++) { if (g[r][i]) used.add(g[r][i]); if (g[i][c]) used.add(g[i][c]); }
      const r0 = Math.floor(r / bh) * bh, c0 = Math.floor(c / bw) * bw;
      for (let i = r0; i < r0 + bh; i++) for (let j = c0; j < c0 + bw; j++) if (g[i][j]) used.add(g[i][j]);
      const cs = []; for (let v = 1; v <= n; v++) if (!used.has(v)) cs.push(v);
      if (!cs.length) return;
      if (br < 0 || cs.length < best.length) { br = r; bc = c; best = cs; }
    }
    if (br < 0) { cnt++; return; }
    for (const v of best) { g[br][bc] = v; go(); g[br][bc] = 0; if (cnt > 1) return; }
  }
  go(); return cnt;
}
ok(sudokuSolveCount(cur.PUZZLES[8].givens, 6, 2, 3) === 1, 'P8 数独6×6(块2×3) 解数应=1');
// P8 sol 与 givens 一致性
for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++)
  if (cur.PUZZLES[8].givens[r][c] !== 0) ok(cur.PUZZLES[8].givens[r][c] === cur.PUZZLES[8].sol[r][c], 'P8 givens[' + r + '][' + c + '] 与 sol 不符');
ok(sudokuSolveCount(cur.PUZZLES[10].givens, 9, 3, 3) === 1, 'P10 数独9×9 解数应=1');
for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++)
  if (cur.PUZZLES[10].givens[r][c] !== 0) ok(cur.PUZZLES[10].givens[r][c] === cur.PUZZLES[10].sol[r][c], 'P10 givens[' + r + '][' + c + '] 与 sol 不符');
// P9 数织唯一解：逐行枚举匹配行 run 的 01 串，DFS + 列约束
function nonoSolveCount(pic, n) {
  const runs = s => { const out = []; let c = 0;
    for (const ch of s) { if (ch === '#') c++; else if (c) { out.push(c); c = 0; } }
    if (c) out.push(c); return out; };
  const pats = [];
  for (let m = 0; m < (1 << n); m++) {
    let s = ''; for (let i = 0; i < n; i++) s += (m >> i & 1) ? '#' : '.';
    if (runs(s).join(',') === runs(pic[pats.length ? 0 : 0] /*占位*/) ) {} // 不在此匹配，逐行匹配在下行
    pats.push(m);
  }
  const rowCand = pic.map(rowStr => pats.filter(m => {
    let s = ''; for (let i = 0; i < n; i++) s += (m >> i & 1) ? '#' : '.';
    return runs(s).join(',') === runs(rowStr).join(',');
  }));
  const colRunsEq = (colStates) => {
    for (let c = 0; c < n; c++) {
      let s = ''; for (let r = 0; r < n; r++) s += (colStates[r] >> c & 1) ? '#' : '.';
      if (runs(s).join(',') !== runs(pic.map(row => row[c]).join('')).join(',')) return false;
    } return true;
  };
  let cnt = 0; const chosen = [];
  (function dfs(r) {
    if (cnt > 1) return;
    if (r === n) { if (colRunsEq(chosen)) cnt++; return; }
    for (const m of rowCand[r]) { chosen[r] = m; dfs(r + 1); if (cnt > 1) return; }
  })(0);
  return cnt;
}
ok(nonoSolveCount(cur.PUZZLES[9].pic, 9) === 1, 'P9 数织9×9「王冠」解数应=1');

// ---- ⑥ 旧七关与 git HEAD 逐瓦片一致 ----
const headSrc = cp.execSync('git show HEAD:levels.js', { cwd: ROOT, encoding: 'utf8' });
const old = new Function(headSrc + '\n;return {LG,LEVELS};')();
ok(old.LEVELS.length === 7, 'HEAD levels 应为 7 关，实得 ' + old.LEVELS.length);
for (let i = 0; i < 7; i++) {
  const a = JSON.stringify(gridOf(cur.LG, cur.LEVELS[i]));
  const b = JSON.stringify(gridOf(old.LG, old.LEVELS[i]));
  ok(a === b, 'L' + (i + 1) + ' build 输出与 git HEAD 不一致');
}

if (fails.length) { console.error('v5 levels self-check FAIL: ' + fails.join('; ')); process.exit(1); }
console.log('v5 levels self-check OK: 10关/新机关分布(L8=w,L9=A+H,L10=e+w)/PUZZLES键1..6,8..10/'
  + 'B>=4与@PQ恰1/e偶/P8,P10数独唯一解/P9数织唯一解/旧七关与HEAD逐瓦片一致');
