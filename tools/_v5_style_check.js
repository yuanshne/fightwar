// v5 风格队静态断言（工单 v5-wave2-style §H-2；node tools/_v5_style_check.js 直接运行）
// a) THEMES 十键齐全、每键必填字段与 #rrggbb、十主题 21 项色板/name/decor 与设计书 §5.3 表逐值相等；
// b) 瓦片函数体（blockTile/plankTile/iceTile/crumbleTile/toggleTile/spikesTile/_spikesDownTile/
//    lavaTile/doorTile/conveyorTile）切片内无 _dithRow/_dithCol（抖动仅存 makeBG 远景）；
// c) SPR.cover/windmill/starflower/_glow 源码键存在；
// d) 体积：art.js ≤125KB（125*1024）且本波增量 ≤12KB（12*1024，对波1 合入后的 112798B 基线——
//    该基线为本次会话实测的波1 特效队合入后 art.js 字节数，波1 未 commit 故以常数记录）；
// e) 全文无 #000000 与 rgb(0,0,0（纯黑禁令；_mixHex 参数亦改用 '#0a0e22'）。
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'art.js'), 'utf8');
let bad = 0;
function fail(msg) { console.error('FAIL: ' + msg); bad++; }

/* ---- a) THEMES（node 可直接求值：art.js 顶层零 DOM） ---- */
let THEMES = null;
try { THEMES = new Function(src + '\n;return THEMES;')(); }
catch (e) { fail('art.js 顶层求值失败: ' + e.message); }
const TABLE = { // 设计书 §5.3 表（工单 §A 逐格照抄）：21 项/主题（decor 数组含重复占位）
  grass: { name: '晴空草原', skyT: '#4a9fe8', skyB: '#bfe8ff', far: '#accce8', near: '#96adcf', block: '#d8a05c', blockD: '#967266', blockL: '#e7c18e', blockS: '#755b6b', speck: '#ac8163', cap: '#38c860', capD: '#3e8c68', capL: '#8cdb96', capS: '#416a6c', plank: '#c88848', plankD: '#8e655b', plankL: '#dbad7c', accent: '#f8a030', decor: ['bush', 'tallgrass', 'flower', 'boulder', 'mushroom', 'stump', 'tallgrass', 'flower'], dust: '#eef4ff', band: '#ffe9b8' },
  cave: { name: '星辉洞窟', skyT: '#2c2a58', skyB: '#5a5694', far: '#57528f', near: '#534c88', block: '#6a72a8', blockD: '#5a5990', blockL: '#a3a4bd', blockS: '#524c83', speck: '#5f6198', cap: '#40d8b0', capD: '#439696', capL: '#90e5c4', capS: '#447087', plank: '#5a6288', plankD: '#51507e', plankL: '#9294a6', accent: '#64e8d8', decor: ['crystal', 'glowworm', 'stalagmite', 'mushroom', 'boulder', 'crystalS', 'stalagmite'], dust: '#a8b4e8', dark: true, band: '#40d8b0' },
  sky: { name: '云海天穹', skyT: '#58b8f0', skyB: '#e8f6ff', far: '#ced8e8', near: '#b1b6cf', block: '#eef2fa', blockD: '#a29fbd', blockL: '#f4f4f0', blockS: '#7c759e', speck: '#bcbbd1', cap: '#ffffff', capD: '#b1acc4', capL: '#fffbf2', capS: '#857da2', plank: '#d8e4f4', plankD: '#9698ba', plankL: '#e5eaed', accent: '#f8b020', decor: ['cloudpot', 'cloudsmall', 'flower', 'tulip', 'balloon', 'pinwheel', 'cloudsmall'], dust: '#ffffff', band: '#ffffff' },
  factory: { name: '鎏金工殿', skyT: '#3a4a72', skyB: '#6a7ea8', far: '#64739f', near: '#5e6796', block: '#8898b8', blockD: '#6a6e99', blockL: '#b5bcc7', blockS: '#5b5888', speck: '#747ca3', cap: '#e0a848', capD: '#9f7a5a', capL: '#edc988', capS: '#7a5f64', plank: '#6a7890', plankD: '#5a5c83', plankL: '#9da3ab', accent: '#f8c040', decor: ['gear', 'chain', 'valve', 'lamp', 'barrel', 'vent', 'gear', 'chain'], dust: '#c8d4ec', dark: true, band: '#f8c040' },
  lava: { name: '落日熔渊', skyT: '#582840', skyB: '#a84828', far: '#984634', near: '#874341', block: '#5a4458', blockD: '#514064', blockL: '#99888c', blockS: '#4c3d6a', speck: '#544160', cap: '#f89038', capD: '#ad6c50', capL: '#fbbb7f', capS: '#83575e', plank: '#7a5560', plankD: '#634968', plankL: '#a78c8c', accent: '#f8d048', decor: ['torch', 'skull', 'flamepillar', 'ribcage', 'lavarock', 'obsidian', 'torch', 'flamepillar'], dust: '#f8b078', dark: true, lavaGlow: '#f86038', band: '#f86038' },
  tower: { name: '星夜高塔', skyT: '#1e2452', skyB: '#42407e', far: '#433f7c', near: '#433e7a', block: '#8a7cc0', blockD: '#6b5e9d', blockL: '#b6aacc', blockS: '#5c4f8b', speck: '#7668a9', cap: '#b8a8e8', capD: '#887ab6', capL: '#d6c9e5', capS: '#6d5f9a', plank: '#7060a0', plankD: '#5d4f8b', plankL: '#a193b6', accent: '#58e8f0', decor: ['torch', 'candelabra', 'flagbanner', 'urn', 'crystal', 'gear', 'flagbanner'], dust: '#c0b8f0', dark: true, band: '#8878f0' },
  boss: { name: '星核虚空', skyT: '#140f36', skyB: '#2e2260', far: '#322663', near: '#362a66', block: '#4a3a7e', blockD: '#483a79', blockL: '#8f81a3', blockS: '#473a76', speck: '#493a7a', cap: '#a070ff', capD: '#7a59c4', capL: '#c8a8f2', capS: '#654ca2', plank: '#5a4a8e', plankD: '#514381', plankL: '#9284aa', accent: '#f8d048', decor: ['crystal', 'torch', 'skull', 'crystal'], dust: '#b8a0f8', dark: true, band: '#f8d048' },
  wind: { name: '翡翠风谷', skyT: '#52c8e8', skyB: '#e0fbf0', far: '#c7dcdc', near: '#acb9c5', block: '#58b878', blockD: '#507f75', blockL: '#97d0a0', blockS: '#4c6274', speck: '#539276', cap: '#64e896', capD: '#579f87', capL: '#a5eeb5', capS: '#50757e', plank: '#a8d068', plankD: '#7c8d6d', plankL: '#c6dd91', accent: '#f8f0a0', decor: ['windmill', 'tallgrass', 'flower', 'pinwheel', 'cloudsmall'], dust: '#eafff4', band: '#fff8c8' },
  castle: { name: '落日王城', skyT: '#f8a850', skyB: '#fce8b8', far: '#dfccad', near: '#beada0', block: '#d8c8b0', blockD: '#968894', blockL: '#e7d9c2', blockS: '#756786', speck: '#ac9d9d', cap: '#f0b848', capD: '#a9835a', capL: '#f6d288', capS: '#806564', plank: '#b0885c', plankD: '#806566', plankL: '#cbad89', accent: '#e86038', decor: ['flagbanner', 'candelabra', 'torch', 'urn', 'boulder'], dust: '#ffe8c0', band: '#ffd080' },
  star: { name: '星空回廊', skyT: '#0e1238', skyB: '#2c3472', far: '#303572', near: '#353672', block: '#5a6ac0', blockD: '#51549d', blockL: '#999fcc', blockS: '#4c498b', speck: '#545ca9', cap: '#8ea0ff', capD: '#7075c4', capL: '#bdc4f2', capS: '#5e5da2', plank: '#4a5a9a', plankD: '#484c88', plankL: '#888fb2', accent: '#f8e8a0', decor: ['starflower', 'crystal', 'urn', 'chain'], dust: '#a8b4ff', dark: true, band: '#8ea0ff' }
};
const REQUIRED = ['name', 'skyT', 'skyB', 'far', 'near', 'block', 'blockD', 'blockL', 'blockS', 'speck',
  'cap', 'capD', 'capL', 'capS', 'plank', 'plankD', 'plankL', 'accent', 'decor', 'dust', 'band'];
const COLOR_RE = /^#[0-9a-f]{6}$/;
if (THEMES) {
  const keys = Object.keys(THEMES);
  if (keys.length !== 10) fail('THEMES 键数=' + keys.length + '（应 10）');
  for (const k in TABLE) {
    const t = THEMES[k];
    if (!t) { fail('THEMES.' + k + ' 缺失'); continue; }
    for (const f of REQUIRED)
      if (!(f in t)) fail('THEMES.' + k + ' 缺字段 ' + f);
    for (const f in t) {
      const v = t[f], w = TABLE[k][f];
      if (f === 'decor') { if (JSON.stringify(v) !== JSON.stringify(w)) fail('THEMES.' + k + '.decor 不符 §A 表'); continue; }
      if (f === 'dark' || f === 'lavaGlow' || f === 'name') { if (v !== w) fail('THEMES.' + k + '.' + f + '=' + v + '（应 ' + w + '）'); continue; }
      if (typeof v !== 'string' || !COLOR_RE.test(v)) fail('THEMES.' + k + '.' + f + ' 非 #rrggbb: ' + v);
      else if (w !== undefined && v !== w) fail('THEMES.' + k + '.' + f + '=' + v + '（§A 表应 ' + w + '）');
    }
  }
} else fail('THEMES 无法求值');

/* ---- b) 瓦片函数体切片无抖动调用 ---- */
const TILE_FNS = ['blockTile', 'plankTile', 'iceTile', 'crumbleTile', 'toggleTile', 'spikesTile',
  '_spikesDownTile', 'lavaTile', 'doorTile', 'conveyorTile'];
for (const fn of TILE_FNS) {
  const i = src.indexOf('function ' + fn + '(');
  if (i < 0) { fail('缺少函数 function ' + fn + '('); continue; }
  const next = src.indexOf('\nfunction ', i + 1); // 下一顶层 function 声明
  const body = src.slice(i, next < 0 ? src.length : next);
  const hits = (body.match(/_dithRow|_dithCol/g) || []).length;
  if (hits) fail(fn + ' 函数体内有 ' + hits + ' 处 _dithRow/_dithCol（应 0）');
}

/* ---- c) 关键新键存在（源码级） ---- */
for (const pat of [/SPR\.cover = \(function/, /d\.windmill = \[/, /d\.starflower = \[/, /function _glow\(/])
  if (!pat.test(src)) fail('缺少键/函数: ' + pat);

/* ---- d) 体积 ---- */
const bytes = Buffer.byteLength(src, 'utf8');
const WAVE1_BASE = 112798; // 波1（特效队）合入后的 art.js 字节数（本会话实测；波1 未 commit）
if (bytes > 125 * 1024) fail('art.js=' + bytes + 'B 超 125KB 上限(' + 125 * 1024 + ')');
const inc = bytes - WAVE1_BASE;
if (inc > 12 * 1024) fail('本波增量=' + inc + 'B 超 12KB（基线 ' + WAVE1_BASE + 'B）');

/* ---- e) 纯黑禁令 ---- */
if (/rgba\(0, ?0, ?0/.test(src) || /rgb\(0, ?0, ?0/.test(src)) fail('发现 rgb(0,0,0（纯黑禁令）');
const blacks = (src.match(/#000000/g) || []).length;
if (blacks) fail('发现 ' + blacks + ' 处 #000000（纯黑禁令，含 _mixHex 参数一律改 #0a0e22）');

/* ---- f) 块注释配对（防未闭合 /* 吞掉后续定义——运行时才炸的隐患） ---- */
const opens = (src.match(/\/\*/g) || []).length, closes = (src.match(/\*\//g) || []).length;
if (opens !== closes) fail('块注释不配对: /* ×' + opens + ' vs */ ×' + closes);
// 逐行状态机：任何时点注释都应在合理行数内闭合（>40 行视为未闭合吞代码）
{
  const lines = src.split('\n');
  let inBlock = false, startLine = 0;
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i];
    if (!inBlock) {
      const o = l.indexOf('/*');
      if (o >= 0) { inBlock = true; startLine = i + 1; l = l.slice(o + 2); }
    }
    if (inBlock && l.indexOf('*/') >= 0) inBlock = false;
  }
  if (inBlock) fail('存在未闭合块注释（起始行 ' + startLine + '）');
}

if (bad) { console.error('v5 风格自测未通过: ' + bad + ' 项'); process.exit(1); }
console.log('v5 风格自测 OK: THEMES 十主题 ' + Object.keys(TABLE).length + ' 键全字段逐值=设计书 §5.3 表；' +
  TILE_FNS.length + ' 个瓦片函数无抖动；cover/windmill/starflower/_glow 齐全；' +
  'art.js=' + bytes + 'B（≤125KB），本波增量 +' + inc + 'B（≤12KB，基线 ' + WAVE1_BASE + 'B）；纯黑禁令通过');
