// v6 第二波·外观队自检（工单 v6-wave2-look 交付自测 2 + 硬约束 H2/H3/H5/H6）
// node tools/_v6_look_check.js 直跑；仅静态断言（art.js 渲染需浏览器，拼图目检另跑 tools/_v6_look_shots.py）。
// 交付形态：look 部件=字面内容行网格 + 冻结 top 偏移（_lookSprite 补透明行，v3 boss 程序化画法先例），
// 网格数组以顶层 const 导出供本检查正则解析；补齐行由 _lookSprite 构造保证全透明（4c 断言其字面）。
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'art.js'), 'utf8');
const fails = [];

// 1) 语法编译（H1 同门禁口径：new Function 只编译不执行）
try { new Function(src); } catch (e) { fails.push('1) art.js 编译失败: ' + e.message); }

// 2) 顶层零 DOM（H2）：node 环境无 document——顶层执行若触 DOM 即抛 ReferenceError
try { (new Function(src))(); } catch (e) { fails.push('2) 顶层执行异常（疑触 DOM）: ' + e.message); }

// 3) 冻结键名逐字（bag 工单消费接口：v6-wave2-bag §C/§E/§F + 设计书 §7.5 冻结伪代码——错键=外观/背包静默缺失）
for (const k of ['SPR.look', 'SPR.icoW', 'SPR.icoH', 'SPR.icoC', 'SPR.icoBag'])
  if (!new RegExp('\\b' + k.replace('.', '\\.') + '\\b').test(src)) fails.push('3) 缺少冻结键: ' + k);

// 3b) SPR.look 挂载形态：weapon/hat/cape 各 length===3、档1/2/3 依序挂 _LOOK_x1..3、
//     top 偏移冻结（weapon=7 / hat=0 / cape=5——错偏移=部件错位/裁边）
const lookM = src.match(/\bSPR\.look\s*=\s*\{([\s\S]*?)\n  \};/);
function topLen(s) { // 括号深度感知的顶层元素计数（元素内 _makeSprite(...) 的逗号不计）
  let depth = 0, n = 1;
  for (const c of s) {
    if (c === '[' || c === '(') depth++;
    else if (c === ']' || c === ')') depth--;
    else if (c === ',' && depth === 0) n++;
  }
  return n;
}
if (!lookM) fails.push('3b) SPR.look 对象字面量挂载未找到');
else {
  const TOP = { weapon: 7, hat: 0, cape: 5 };
  for (const part of ['weapon', 'hat', 'cape']) {
    const L = part[0].toUpperCase(); // weapon→W / hat→H / cape→C
    const pm = lookM[1].match(new RegExp('\\b' + part + '\\s*:\\s*\\[([^\\]]*)\\]'));
    if (!pm) { fails.push('3b) SPR.look.' + part + ' 数组挂载未找到'); continue; }
    const n = topLen(pm[1]);
    if (n !== 3) fails.push('3b) SPR.look.' + part + ' length ' + n + ' ≠ 3');
    for (let t = 1; t <= 3; t++) {
      const want = '_lookSprite(_LOOK_' + L + t + ', ' + TOP[part] + ', _P_LOOK_' + L + t + ')';
      if (pm[1].indexOf(want) < 0)
        fails.push('3b) SPR.look.' + part + '[' + (t - 1) + '] 应挂 ' + want + '（档序或 top 偏移错=外观错位）');
    }
  }
}
// 3c) 补齐函数字面：_lookSprite 的透明行必须恰为 16 个 '.'（保证 H5 16×16 与分区外全透明）
if (!/function _lookSprite\(rows, top, pal\)/.test(src)) fails.push('3c) _lookSprite(rows, top, pal) 补齐函数未找到');
else if (!/dot = '\.{16}'/.test(src)) fails.push("3c) _lookSprite 补齐行应为 16 个 '.' 的全透明行");

// 4) H3 分区红线逐像素断言：内容行按冻结 top 偏移还原绝对坐标（补齐行全透明由 3c 构造保证）
function gridRows(name) {
  const m = src.match(new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\];'));
  if (!m) return null;
  return Array.from(m[1].matchAll(/'([^']*)'/g), function (x) { return x[1]; });
}
function paletteOf(name) {
  const m = src.match(new RegExp('const ' + name + ' = \\{([^}]*)\\}'));
  if (!m) return null;
  const pal = {};
  for (const mm of m[1].matchAll(/([A-Za-z])\s*:\s*'(#[0-9a-fA-F]{6})'/g)) pal[mm[1]] = mm[2];
  return pal;
}
const PARTS = [ // [网格, 挂载调色板, top 偏移, 内容行数, H3 分区 [r0,r1,c0,c1]（含端点）, 标签]
  ['_LOOK_W1', '_P_LOOK_W1', 7, 9, [7, 15, 10, 15], 'weapon档1'],
  ['_LOOK_W2', '_P_LOOK_W2', 7, 9, [7, 15, 10, 15], 'weapon档2'],
  ['_LOOK_W3', '_P_LOOK_W3', 7, 9, [7, 15, 10, 15], 'weapon档3'],
  ['_LOOK_H1', '_P_LOOK_H1', 0, 5, [0, 4, 4, 11], 'hat档1'],
  ['_LOOK_H2', '_P_LOOK_H2', 0, 5, [0, 4, 4, 11], 'hat档2'],
  ['_LOOK_H3', '_P_LOOK_H3', 0, 5, [0, 4, 4, 11], 'hat档3'],
  ['_LOOK_C1', '_P_LOOK_C1', 5, 11, [5, 15, 0, 6], 'cape档1'],
  ['_LOOK_C2', '_P_LOOK_C2', 5, 11, [5, 15, 0, 6], 'cape档2'],
  ['_LOOK_C3', '_P_LOOK_C3', 5, 11, [5, 15, 0, 6], 'cape档3']
];
for (const [grid, pal, top, wantRows, box, label] of PARTS) {
  const rows = gridRows(grid), P = paletteOf(pal);
  if (!rows || !P) { fails.push('4) ' + grid + '/' + pal + ' 未找到'); continue; }
  if (rows.length !== wantRows) fails.push('4) ' + grid + ' 内容行数 ' + rows.length + ' ≠ ' + wantRows);
  rows.forEach(function (row, ly) {
    const y = top + ly; // 绝对行号（_lookSprite 顶部补 top 行透明）
    if (row.length !== 16) fails.push('4) ' + grid + ' 行' + y + ' 长度 ' + row.length + ' ≠ 16（H5: 行长=宽）');
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      if (!P[ch]) { fails.push('4) ' + grid + ' (' + y + ',' + x + ') 字符 \'' + ch + '\' 不在 ' + pal + '（不可渲染）'); continue; }
      if (y < box[0] || y > box[1] || x < box[2] || x > box[3])
        fails.push('4) H3 分区违约 ' + label + ': ' + grid + ' (' + y + ',' + x + ')=\'' + ch + '\' 越出 rows' +
          box[0] + '..' + box[1] + '×cols' + box[2] + '..' + box[3]);
    }
  });
}
// 4b) 武器追加红线（工单设计要点）：剑身不出网格右缘 col15——攻/冲家族合成 dx=+1 时 16×16 画布会裁掉末列
for (const grid of ['_LOOK_W1', '_LOOK_W2', '_LOOK_W3']) {
  const rows = gridRows(grid);
  if (!rows) continue;
  rows.forEach(function (row, ly) {
    if (row[15] && row[15] !== '.') fails.push('4b) ' + grid + ' 行' + (7 + ly) + ' col15 应为空（剑身不出右缘，防 atk 家族 dx+1 裁边）');
  });
}

// 5) 图标 12×12（H5）+ 字符集
const ICOS = [['_ICO_W', '_P_ICO'], ['_ICO_H', '_P_ICO'], ['_ICO_C', '_P_ICO'], ['_ICO_BAG', '_P_ICO_BAG']];
for (const [grid, pal] of ICOS) {
  const rows = gridRows(grid), P = paletteOf(pal);
  if (!rows || !P) { fails.push('5) ' + grid + '/' + pal + ' 未找到'); continue; }
  if (rows.length !== 12) fails.push('5) ' + grid + ' 行数 ' + rows.length + ' ≠ 12（H5: ico 12×12）');
  rows.forEach(function (row, y) {
    if (row.length !== 12) fails.push('5) ' + grid + ' 行' + y + ' 长度 ' + row.length + ' ≠ 12');
    for (const ch of row)
      if (ch !== '.' && !P[ch]) fails.push('5) ' + grid + ' 行' + y + ' 字符 \'' + ch + '\' 不在 ' + pal);
  });
}

// 5b) 工单指定色逐字对表（H4 档位材质：档1 木/布、档2 秘银蓝系、档3 金+星辉；图标灰阶三阶+深藏蓝描边）
const WANT = [
  ['_P_LOOK_W1', { l: '#c89858', m: '#a87848' }],                       // 木剑木色两阶
  ['_P_LOOK_W2', { L: '#8ab8e8', d: '#48a8f8', g: '#f8d048' }],         // 秘银刃+金护手
  ['_P_LOOK_W3', { W: '#e8f4ff', y: '#f8d048' }],                       // 宽刃渐层基色+金圣纹
  ['_P_LOOK_H1', { m: '#a87848' }],                                     // 布帽棕
  ['_P_LOOK_H2', { L: '#8ab8e8', S: '#4878b8' }],                       // 银蓝冠圈
  ['_P_LOOK_H3', { y: '#f8d048', Y: '#c89010', r: '#f86030' }],         // 金三尖冠+红宝石
  ['_P_LOOK_C1', { g: '#8a7a68' }],                                     // 破布灰褐
  ['_P_LOOK_C2', { L: '#8ab8e8', B: '#4878b8' }],                       // 蓝银双层
  ['_P_LOOK_C3', { B: '#2c3a70', y: '#f8d048' }],                       // 深蓝底+金边
  ['_P_ICO', { W: '#ffffff', A: '#a8a8b8', D: '#585868', k: '#1c2450' }], // 灰阶3阶+深藏蓝描边
  ['_P_ICO_BAG', { l: '#c89858', y: '#f8d048' }]                        // 金棕+金扣
];
for (const [name, want] of WANT) {
  const P = paletteOf(name);
  if (!P) { fails.push('5b) 调色板 ' + name + ' 未找到'); continue; }
  for (const ch in want)
    if (P[ch] !== want[ch]) fails.push('5b) ' + name + ' ' + ch + ' 应为 ' + want[ch] + '，实测 ' + (P[ch] || '缺失'));
}

// 6) 体积守卫（H6：波2 look 基线 = v5 124,937B + 波1 fx 增量 7,460B = 132,397B；本工单增量 ≤8KB）
const BASE = 132397, LIMIT = 8192;
const size = fs.statSync(path.join(ROOT, 'art.js')).size;
if (size - BASE > LIMIT) fails.push('6) art.js 体积 ' + size + 'B，增量 ' + (size - BASE) + 'B > ' + LIMIT + 'B');

if (fails.length) { console.error('v6_look_check 失败:\n' + fails.join('\n')); process.exit(1); }
console.log('v6_look_check OK: 1) 编译通过; 2) 顶层零 DOM; 3) 冻结键 SPR.look/icoW/icoH/icoC/icoBag 齐全' +
  ', weapon/hat/cape 各 length=3、档1/2/3 依序、top 偏移 7/0/5 冻结; 3c) _lookSprite 补齐行=16 点全透明' +
  '; 4) 9 张 look 内容行网格按偏移还原后行长/字符集/H3 分区逐像素合规（4b) weapon col15 空=剑身不出右缘）' +
  '; 5) 4 张 12×12 图标合规; 5b) 指定色对表合规; 6) 体积 ' + size + 'B（基线 ' + BASE + 'B, 增量 ' +
  (size - BASE) + 'B ≤ ' + LIMIT + 'B）');
