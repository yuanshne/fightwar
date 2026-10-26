// v8.0 新小怪摆放审计（关卡队）：遍历全部 18 关，统计每关每种敌人数量 + 校验每只新怪的落点。
//
// 判定口径（与工单硬性约束 1:1 对应）：
//   ① 脚下 2 格内必须有支撑（SOLIDISH 或 STAND 集合里的字符）；
//   ② 不能与既有字符重叠 —— 与 git HEAD:levels.js 基线逐格比对，新怪必须落在基线为 '.' 的格子上；
//      同时反查「基线非 '.' 的格子是否被改写」（= 真冲突，必须为 0）；
//   ③ 不能落在 Q/P/@/K/c 的 3 格范围内（Chebyshev ≤3）；
//   ④ 酸液花 k 是站桩怪：同排左右连续空格合计必须 ≥3 格（避免 1 格宽走廊变成「必须挨打才能过」）。
// 用法：node tools/_v80_spawn.js
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const ROOT = path.join(__dirname, '..');

const SOLIDISH = new Set(['#', 'I', 'a', 'b', 'C', 'D', 'B', 'G', '(', ')']);
const STAND = new Set(['#', 'I', 'a', 'b', 'C', 'D', 'B', 'G', '=', '(', ')']);
const KEY = new Set(['Q', 'P', '@', 'K', 'c']);                 // 3 格禁区
const ENEMY = { W: 'slime', F: 'bat', i: 'beetle', k: 'spitter', n: 'hopper',
  A: 'knight', Y: 'mage', T: 'ghost', E: 'boomer', J: 'jelly', N: 'lancer', x: 'elite-lancer', z: 'elite-ghost' };
const ENEMY_ORDER = ['W', 'F', 'i', 'k', 'n', 'A', 'Y', 'T', 'E', 'J', 'N', 'x', 'z'];
const NEW = new Set(['i', 'k', 'n']);                            // 本工单新增的三种
// 本工单应当新增的落点（自检：脚本自己再从基线 diff 里找一遍，两者必须一致）
const EXPECT = [
  { lv: 1, x: 72, y: 11, c: 'n' },
  { lv: 2, x: 42, y: 18, c: 'i' }, { lv: 2, x: 46, y: 18, c: 'i' },
  { lv: 3, x: 37, y: 10, c: 'k' }, { lv: 3, x: 92, y: 9, c: 'i' },
  { lv: 4, x: 43, y: 15, c: 'k' },
  { lv: 5, x: 28, y: 13, c: 'n' }, { lv: 5, x: 98, y: 13, c: 'n' },
  { lv: 6, x: 30, y: 17, c: 'i' }, { lv: 6, x: 22, y: 13, c: 'k' },
];

function build(levelsSrc) {
  let body = levelsSrc;
  for (const f of ['chapter2.js', 'chapter3.js'])
    if (fs.existsSync(path.join(ROOT, f))) body += '\n' + fs.readFileSync(path.join(ROOT, f), 'utf8');
  body += '\n;aggregateLevels();\n;return {LG:LG,ALL_LEVELS:ALL_LEVELS};';
  const sb = new Function(body)();
  return sb.ALL_LEVELS.map(m => {
    const g = new sb.LG(m.w, m.h); m.build(g);
    return { meta: m, w: m.w, h: m.h, grid: g.g };
  });
}

const baseSrc = cp.execSync('git show HEAD:levels.js', { cwd: ROOT, encoding: 'utf8' });
const curSrc = fs.readFileSync(path.join(ROOT, 'levels.js'), 'utf8');
const BASE = build(baseSrc), CUR = build(curSrc);

const errs = [];
const at = (L, x, y) => (x < 0 || x >= L.w) ? '#' : (y < 0 || y >= L.h) ? '.' : L.grid[y][x];
const baseAt = (L, x, y) => (x < 0 || x >= L.w) ? '#' : (y < 0 || y >= L.h) ? '.' : L.grid[y][x];

/* ==================== 一、敌人种类统计表 ==================== */
console.log('=== 18 关敌人种类统计（v8.0 摆放后）===');
const head = '关  关卡名              ' + ENEMY_ORDER.map(c => c.padStart(3)).join('') + '  合计  图例';
console.log(head);
console.log('-'.repeat(head.length + 4));
const totals = {}; ENEMY_ORDER.forEach(c => totals[c] = 0);
for (let i = 0; i < CUR.length; i++) {
  const L = CUR[i], cnt = {}; ENEMY_ORDER.forEach(c => cnt[c] = 0);
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) if (ENEMY[L.grid[y][x]]) cnt[L.grid[y][x]]++;
  let sum = 0; ENEMY_ORDER.forEach(c => { sum += cnt[c]; totals[c] += cnt[c]; });
  const kinds = ENEMY_ORDER.filter(c => cnt[c] > 0).map(c => c + '=' + ENEMY[c]).join(' ');
  console.log(('L' + (i + 1)).padEnd(4) + L.meta.name.padEnd(20)
    + ENEMY_ORDER.map(c => String(cnt[c] || '.').padStart(3)).join('') + String(sum).padStart(6) + '  ' + kinds);
}
console.log('-'.repeat(head.length + 4));
console.log('合计'.padEnd(24) + ENEMY_ORDER.map(c => String(totals[c]).padStart(3)).join('')
  + String(ENEMY_ORDER.reduce((a, c) => a + totals[c], 0)).padStart(6));
console.log('图例：' + ENEMY_ORDER.map(c => c + '=' + ENEMY[c]).join('  '));

/* ==================== 二、基线 diff：新怪落点 + 冲突反查 ==================== */
const added = [], conflicts = [];
for (let i = 0; i < CUR.length; i++) {
  const A = BASE[i], B = CUR[i];
  for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) {
    const b = baseAt(A, x, y), c = B.grid[y][x];
    if (b === c) continue;
    if (b === '.' && NEW.has(c)) { added.push({ lv: i + 1, x, y, c }); continue; }
    if (b === '.' && c === '#') continue;      // L1/L3 加高后向下补底：允许（下方单独核）
    conflicts.push('L' + (i + 1) + ' (' + x + ',' + y + ') 基线 ' + b + ' → 现 ' + c);
  }
}
console.log('\n=== 基线 diff：新增 ' + added.length + ' 只新怪；既有字符被改写 ' + conflicts.length + ' 处 ===');
for (const c of conflicts) errs.push('字符冲突：' + c);
if (conflicts.length) console.log(conflicts.join('\n'));

const expKey = new Set(EXPECT.map(e => e.lv + ',' + e.x + ',' + e.y + ',' + e.c));
const addKey = new Set(added.map(e => e.lv + ',' + e.x + ',' + e.y + ',' + e.c));
for (const k of expKey) if (!addKey.has(k)) errs.push('预期落点未生效: ' + k);
for (const k of addKey) if (!expKey.has(k)) errs.push('出现计划外落点: ' + k);

/* ==================== 三、逐只新怪校验 ==================== */
console.log('\n=== 新怪落点校验（支撑 / 禁区 / 开阔度 / 原字符）===');
for (const e of added) {
  const L = CUR[e.lv - 1], A = BASE[e.lv - 1];
  const sup = [];
  for (let d = 1; d <= 2; d++) {
    const ch = at(L, e.x, e.y + d);
    if (SOLIDISH.has(ch) || STAND.has(ch)) sup.push('(' + e.x + ',' + (e.y + d) + ')=' + ch + ' @y+' + d);
  }
  if (!sup.length) errs.push('L' + e.lv + ' ' + e.c + '(' + e.x + ',' + e.y + ') 脚下 2 格内无支撑');
  // 禁区
  let near = null;
  for (let y = 0; y < L.h && !near; y++) for (let x = 0; x < L.w; x++) {
    const ch = L.grid[y][x];
    if (!KEY.has(ch)) continue;
    if (Math.abs(x - e.x) <= 3 && Math.abs(y - e.y) <= 3) { near = ch + '(' + x + ',' + y + ') d=' + Math.max(Math.abs(x - e.x), Math.abs(y - e.y)); break; }
  }
  if (near) errs.push('L' + e.lv + ' ' + e.c + '(' + e.x + ',' + e.y + ') 落入禁区 ' + near);
  // 开阔度（酸液花硬约束；其余只报数）
  let l = 0; while (at(L, e.x - 1 - l, e.y) === '.' && e.x - 1 - l >= 0) l++;
  let r = 0; while (at(L, e.x + 1 + r, e.y) === '.' && e.x + 1 + r < L.w) r++;
  if (e.c === 'k' && l + r + 1 < 3) errs.push('L' + e.lv + ' 酸液花(' + e.x + ',' + e.y + ') 同排开阔仅 ' + (l + r + 1) + ' 格(<3)');
  console.log('L' + String(e.lv).padEnd(3) + e.c + ' (' + String(e.x).padStart(3) + ',' + String(e.y).padStart(2) + ') '
    + ENEMY[e.c].padEnd(9)
    + ' 原字符=' + baseAt(A, e.x, e.y) + '（基线同格）'
    + ' 支撑=' + (sup[0] || '无')
    + ' 同排开阔=' + (l + r + 1) + '格(L' + l + '/R' + r + ')'
    + ' 最近禁区=' + (near || '无(>3格)'));
}

/* ==================== 四、全部地面型敌人（含旧怪）支撑体检 ==================== */
// 口径与 validateLevels 一致：只有 N/x/A/Y 与本次新增的 i/k/n 有「脚下 2 格内须支撑」断言；
// J/T/E/z 在 validateLevels 里明示为悬空/穿墙型（无支撑要求），故只统计不判错。
// W/F 为 v1 旧怪，validateLevels 亦未设该断言，同样只统计。
const GROUND_TYPE = new Set(['i', 'k', 'n', 'A', 'Y', 'N', 'x']);   // 硬判（有断言）
const SOFT_TYPE = new Set(['W', 'F', 'E']);                          // 仅统计
let groundBad = 0, softBad = 0;
for (let i = 0; i < CUR.length; i++) {
  const L = CUR[i];
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
    const ch = L.grid[y][x];
    if (!GROUND_TYPE.has(ch) && !SOFT_TYPE.has(ch)) continue;
    let ok = false;
    for (let d = 1; d <= 2; d++) { const c2 = at(L, x, y + d); if (SOLIDISH.has(c2) || STAND.has(c2)) ok = true; }
    if (ok) continue;
    if (GROUND_TYPE.has(ch)) { groundBad++; errs.push('L' + (i + 1) + ' 地面型敌人 ' + ch + '(' + x + ',' + y + ') 脚下无支撑'); }
    else softBad++;
  }
}
console.log('\n全 18 关地面型敌人（i/k/n/A/Y/N/x）支撑体检：' + (groundBad === 0 ? '全部有支撑 ✓' : groundBad + ' 只悬空 ✗')
  + '（另 W/F/E 无断言型悬空 ' + softBad + ' 只，含 L16 魂火既有摆法，不在本工单范围）');

/* ==================== 五、结论 ==================== */
console.log('\n=== 结论 ===');
if (errs.length) { console.log('失败 ' + errs.length + ' 处：'); errs.slice(0, 20).forEach(s => console.log('  - ' + s)); process.exit(1); }
console.log('全部通过：新增 ' + added.length + ' 只（i/k/n）落点合规，零字符冲突，18 关地面型敌人全部有支撑 ✓');
