// v6 第一波·特效队自检（工单 v6-wave1-fx 交付自测 2/3 + 硬约束 H2/H3/H5/H6/H7）
// node tools/_v6_fx_check.js 直跑；仅静态断言（art.js 渲染需浏览器，目检截图另跑 _v6_fx_shots.py）。
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'art.js'), 'utf8');
const fails = [];

// 1) 语法编译（H1 同门禁口径：new Function 只编译不执行）
try { new Function(src); } catch (e) { fails.push('1) art.js 编译失败: ' + e.message); }

// 2) 顶层零 DOM（H2）：node 环境无 document——整文件顶层执行若触 DOM 即抛 ReferenceError
try { (new Function(src))(); } catch (e) { fails.push('2) 顶层执行异常（疑触 DOM）: ' + e.message); }

// 3) 新键齐全（H3/H4：键名逐字对工单/ui 波1 消费代码）
for (const k of ['SPR.blade', 'SPR.skL', 'SPR.knightGuard', 'SPR.mage', 'SPR.mageCast', 'SPR.fireball'])
  if (!new RegExp('\\b' + k.replace('.', '\\.') + '\\b').test(src)) fails.push('3) 缺少新键: ' + k);

// 3b) 契约 7 导出仍在（顶层导出不增不减）
for (const k of ['SPR', 'THEMES', 'buildSprites', 'buildThemeArt', 'drawPixelText', 'drawCNText', 'flipSprite'])
  if (!new RegExp('\\b' + k + '\\b').test(src)) fails.push('3b) 缺少契约导出: ' + k);

// 4) 数组赋值形态且 length>=2（自测 2：blade/knightGuard/mage/fireball；mageCast 为单帧不查）
function arrayLen(key) { // 解析 SPR.key = [ ... ] 顶层元素数（括号深度感知）
  const m = src.match(new RegExp('\\bSPR\\.' + key + '\\s*=\\s*\\['));
  if (!m) return -1;
  let i = src.indexOf(m[0]) + m[0].length, depth = 1, n = 1;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === '[' || c === '(') depth++;
    else if (c === ']' || c === ')') depth--;
    else if (c === ',' && depth === 1) n++;
    i++;
  }
  return depth === 0 ? n : -1;
}
for (const k of ['blade', 'knightGuard', 'mage', 'fireball']) {
  const n = arrayLen(k);
  if (n < 2) fails.push('4) SPR.' + k + ' 应为 length>=2 的数组赋值形态，实测 ' + (n < 0 ? '非数组字面量' : n + ' 元素'));
}
if (!/\bSPR\.mageCast\s*=\s*_makeSprite\(/.test(src)) fails.push('4) SPR.mageCast 应为单帧 _makeSprite 赋值');

// 5) 字符网格行长/行数断言（自测 3：每行长度===标称宽；行数=标称高 → _makeSprite 画布逐字 H5）
function gridRows(name) {
  const m = src.match(new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\];'));
  if (!m) return null;
  return Array.from(m[1].matchAll(/'([^']*)'/g), function (x) { return x[1]; });
}
const GRIDS = [ // [网格常量, 标称宽, 标称高, 挂载调色板字符集（H4 配色对表）]
  ['_BLADE_F1', 12, 12, 'kyYw'], ['_BLADE_F2', 12, 12, 'kyYw'],
  ['_SK_L', 12, 12, 'kyYw'],
  ['_KN_G1', 14, 18, 'ksSLyebwW'], ['_KN_G2', 14, 18, 'ksSLyebwW'],
  ['_MAGE_1', 14, 18, 'krdfetyoW'], ['_MAGE_2', 14, 18, 'krdfetyoW'],
  ['_MAGE_CAST', 14, 18, 'krdfetyoW'],
  ['_FIREB_F1', 8, 8, 'oiw'], ['_FIREB_F2', 8, 8, 'oiw']
];
for (const [name, w, h, chars] of GRIDS) {
  const rows = gridRows(name);
  if (!rows) { fails.push('5) 网格 ' + name + ' 未找到'); continue; }
  if (rows.length !== h) fails.push('5) ' + name + ' 行数 ' + rows.length + ' ≠ ' + h);
  rows.forEach(function (r, i) {
    if (r.length !== w) fails.push('5) ' + name + ' 行' + i + ' 长度 ' + r.length + ' ≠ ' + w);
    for (const ch of r) if (ch !== '.' && !chars.includes(ch))
      fails.push('5) ' + name + ' 行' + i + ' 字符 \'' + ch + '\' 不在挂载调色板');
  });
}

// 5b) 调色板色值对表（工单指定色逐字）
const PALETTES = [
  ['_P_BLADE', { k: '#1c2450', y: '#f8d048', Y: '#c89010', w: '#ffffff' }],
  ['_P_MAGE', { r: '#3a2a50', d: '#241c38', e: '#f86030', t: '#6a5a48', y: '#f8d048' }],
  ['_P_FIREB', { o: '#f86030', i: '#f8a040', w: '#fff8c8' }]
];
for (const [name, want] of PALETTES) {
  const m = src.match(new RegExp('const ' + name + ' = \\{([^}]*)\\}'));
  if (!m) { fails.push('5b) 调色板 ' + name + ' 未找到'); continue; }
  for (const ch in want)
    if (!new RegExp('\\b' + ch + ":\\s*'" + want[ch] + "'").test(m[1]))
      fails.push('5b) ' + name + ' 缺少/不符 ' + ch + ": '" + want[ch] + "'");
}
if (!/_P_KNIGHT_GUARD = Object\.assign\(\{\}, _P_KNIGHT, \{ W: '#fff8c8' \}\)/.test(src))
  fails.push("5b) _P_KNIGHT_GUARD 应派生自 _P_KNIGHT 且盾沿高光 W='#fff8c8'");

// 6) 体积守卫（H6：基线 124,937B，本工单新增 ≤10KB）
const BASE = 124937, LIMIT = 10240;
const size = fs.statSync(path.join(ROOT, 'art.js')).size;
if (size - BASE > LIMIT) fails.push('6) art.js 体积 ' + size + 'B，增量 ' + (size - BASE) + 'B > ' + LIMIT + 'B');

// 7) 不动既有像素（H7）：git diff 仅纯新增（零删除行），且 THEMES skyT 行零触碰
let del = -1, skyT = -1;
try {
  const diff = cp.execSync('git diff HEAD -- art.js', { cwd: ROOT }).toString();
  const body = diff.split('\n').slice(4).join('\n'); // 跳过 unified diff 头 4 行（diff --git / index / --- / +++）
  del = body.split('\n').filter(function (l) { return /^-/.test(l); }).length;
  skyT = body.split('\n').filter(function (l) { return /^[+-].*skyT/.test(l); }).length;
  if (del !== 0) fails.push('7) art.js diff 含 ' + del + ' 条删除行（本工单应纯新增，既有键像素不得改动）');
  if (skyT !== 0) fails.push('7) THEMES 被改动（diff 中 skyT 行 ' + skyT + ' 条）');
} catch (e) { fails.push('7) git diff 执行失败: ' + e.message); }

if (fails.length) { console.error('v6_fx_check 失败:\n' + fails.join('\n')); process.exit(1); }
console.log('v6_fx_check OK: 1) 编译通过; 2) 顶层零 DOM; 3) 六组新键+契约7导出齐全; 4) blade/knightGuard/mage/fireball 均 length=2 数组' +
  ', mageCast 单帧; 5) 10 张网格行长/行数/字符集全部合规; 5b) 指定色值合规; 6) 体积 ' + size + 'B（基线 ' + BASE + 'B, 增量 ' +
  (size - BASE) + 'B ≤ ' + LIMIT + 'B）; 7) diff 纯新增 删除行=' + del + ' skyT=' + skyT);
