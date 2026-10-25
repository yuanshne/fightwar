// v5 第一波·特效队自检（工单 v5-wave1-fx 自测断言 2a-2d；node tools/_v5_fx_check.js 直跑）
// 仅静态断言（art.js 顶层零 DOM，执行需浏览器——浏览器冒烟另行执行并截图）。
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'art.js'), 'utf8');
const fails = [];

// a) 正则断言 art.js 含全部新键（SPR. 限定，防内部符号误判）
for (const k of ['SPR.heroDashWind', 'SPR.heroDashWindL', 'SPR.knight', 'SPR.knightDead',
  'SPR.portal', 'SPR.chandBlade', 'SPR.windStreak', 'SPR.slashArc'])
  if (!new RegExp('\\b' + k.replace('.', '\\.') + '\\b').test(src)) fails.push('a) 缺少新键: ' + k);

// b) _SK_I/_SK_O 每行长度 12、共 12 行、字符集 ⊆ 挂载行调色板键 + '.'
function gridRows(name) {
  const m = src.match(new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\];'));
  if (!m) return null;
  return Array.from(m[1].matchAll(/'([^']*)'/g), function (x) { return x[1]; });
}
function mountPal(spr) {
  const m = src.match(new RegExp('SPR\\.' + spr + ' = _makeSprite\\(_SK_[IO], \\{([^}]*)\\}\\)'));
  if (!m) return null;
  const keys = {};
  for (const mm of m[1].matchAll(/(\w)\s*:/g)) keys[mm[1]] = true;
  return keys;
}
for (const pair of [['_SK_I', 'skI'], ['_SK_O', 'skO']]) {
  const rows = gridRows(pair[0]), pal = mountPal(pair[1]);
  if (!rows || rows.length !== 12) { fails.push('b) ' + pair[0] + ' 行数应为 12，实为 ' + (rows && rows.length)); continue; }
  if (!pal) { fails.push('b) ' + pair[1] + ' 挂载行调色板未匹配'); continue; }
  rows.forEach(function (r, i) {
    if (r.length !== 12) fails.push('b) ' + pair[0] + ' 行' + i + ' 长度 ' + r.length + ' ≠ 12');
    for (const ch of r) if (ch !== '.' && !pal[ch]) fails.push('b) ' + pair[0] + ' 行' + i + ' 字符 \'' + ch + '\' 不在调色板');
  });
}

// c) 文件体积：较基线 106656B 增量 ≤6144B（工单 H3）
const BASE = 106656;
const size = fs.statSync(path.join(ROOT, 'art.js')).size;
if (size - BASE > 6144) fails.push('c) art.js 体积 ' + size + 'B，增量 ' + (size - BASE) + 'B > 6144B');

// d) 禁改区未触碰：THEMES 块 skyT 行在 git diff 中零增删（工单自测 2d）
let skyT = -1;
try {
  const diff = cp.execSync('git diff HEAD -- art.js', { cwd: ROOT }).toString();
  skyT = diff.split('\n').filter(function (l) { return /^[+-].*skyT/.test(l); }).length;
  if (skyT !== 0) fails.push('d) THEMES 被改动（diff 中 skyT 行 ' + skyT + ' 条）');
} catch (e) { fails.push('d) git diff 执行失败: ' + e.message); }

if (fails.length) { console.error('v5_fx_check 失败:\n' + fails.join('\n')); process.exit(1); }
console.log('v5_fx_check OK: a) 新键齐全; b) _SK_I/_SK_O 12×12 且字符集合规; c) 体积 ' + size +
  'B（基线 ' + BASE + 'B，增量 ' + (size - BASE) + 'B ≤ 6144B）; d) THEMES skyT 行 diff=' + skyT);
