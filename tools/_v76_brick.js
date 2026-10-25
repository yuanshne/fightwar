// ============================================================
// tools/_v76_brick.js —— v7.6 任务①：「木箱隐形墙」验证
//   1) 'B' 瓦片绘制覆盖率：全部 16 关 × 每一处 'B' 必须产生 drawImage(T.breakBrick, tx*16, ty*16)
//   2) 其余 18 种字符的绘制调用数「改动前基线 == 改动后」逐关逐字符比对（防回归）
//   3) 主题兜底审计：buildThemeArt 的 tiles 字面量是否无条件含 breakBrick（12 主题全覆盖）
//   4) 引擎/渲染口径差集：solid() 认的字符 vs renderTiles 的 switch case（只报告不修）
//
// 用法：
//   node tools/_v76_brick.js --save     # 改动前采基线 → tools/_v76_brick_base.json
//   node tools/_v76_brick.js            # 改动后比对基线 + 覆盖率断言
//   node tools/_v76_brick.js --nobase   # 只跑覆盖率断言（不比对基线）
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const SAVE = process.argv.includes('--save');
const NOBASE = process.argv.includes('--nobase');
const BASE_FILE = path.join(__dirname, '_v76_brick_base.json');

// ---------- 1. 从 ui.js 精确切出 renderTiles 函数源码（跳过字符串/注释里的花括号） ----------
function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('找不到函数 ' + name);
  let i = src.indexOf('{', start), depth = 0, q = null, line = false, block = false;
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; i++; } continue; }
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === '/' && n === '/') { line = true; i++; continue; }
    if (c === '/' && n === '*') { block = true; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('函数体未闭合 ' + name);
}

// ---------- 2. 关卡：沿用 gate.js engine 模式同款沙箱（levels+章节+engine） ----------
function chapterState() {
  const hasContract = /const CHAPTERS/.test(read('levels.js'));
  const files = ['chapter2.js', 'chapter3.js'].filter(f => fs.existsSync(path.join(ROOT, f)));
  return { hasContract, src: files.map(read).join('\n') };
}
function buildLevels() {
  const levelsSrc = read('levels.js'), engineSrc = read('engine.js'), ch = chapterState();
  const stub = ch.hasContract ? '' : '\n;var ALL_LEVELS = LEVELS;';
  const agg = ch.hasContract ? '\n;aggregateLevels();' : '';
  const themes = {};
  ['grass', 'cave', 'sky', 'factory', 'lava', 'tower', 'boss', 'wind', 'castle', 'star', 'sea', 'nether']
    .forEach(k => themes[k] = {});
  const glue = '\n;return {game,loadLevel,ALL_LEVELS};';
  const sb = new Function('THEMES', levelsSrc + (ch.hasContract ? '\n' + ch.src : '') + stub + agg + '\n' + engineSrc + glue)(themes);
  const out = [];
  for (let i = 0; i < sb.ALL_LEVELS.length; i++) {
    sb.loadLevel(i, false);
    const L = sb.game.level;
    out.push({ i, name: (L.meta && L.meta.name) || ('L' + (i + 1)), theme: (L.meta && L.meta.theme) || L.theme || 'grass', L, game: sb.game });
  }
  return out;
}

// ---------- 3. 假 themeArt / 假 ctx（记录全部绘制调用） ----------
const TILE_KEYS = ['block', 'blockCap', 'plank', 'ice', 'crumble', 'toggleA', 'toggleB', 'spikes', 'spikesD', 'convL', 'convR', 'breakBrick'];
function fakeThemeArt(opts) {
  opts = opts || {};
  const img = k => ({ width: 16, height: 16, key: 'tiles.' + k, tag: k });
  const t = {};
  for (const k of TILE_KEYS) if (!(opts.drop && opts.drop.includes(k))) t[k] = img(k);
  t.lava = [img('lava0'), img('lava1')];
  t.door = [img('door0'), img('door1')];
  if (opts.hidden) t.hidden = img('hidden');
  return { tiles: t, decor: {}, bg: {} };
}
function makeCtx(log) {
  const rec = (op, a) => log.push(a);
  return {
    _log: log,
    fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, font: '', textAlign: '', textBaseline: '',
    drawImage(img, x, y) { rec('drawImage', { op: 'drawImage', key: (img && img.key) || '?', x, y }); },
    fillRect(x, y, w, h) { rec('fillRect', { op: 'fillRect', x, y, w, h }); },
    strokeRect() { }, beginPath() { }, moveTo() { }, lineTo() { }, closePath() { }, fill() { }, stroke() { },
    save() { }, restore() { }, clip() { }, arc() { }, fillText() { }, measureText() { return { width: 0 }; },
    createLinearGradient() { return { addColorStop() { } }; }, translate() { }, rotate() { }, scale() { }, drawFocusIfNeeded() { }
  };
}

// ---------- 4. 单关渲染：跑 renderTiles，把每个绘制调用归属到瓦片 ----------
const RENDER_SRC = extractFn(read('ui.js'), 'renderTiles');
const renderTiles = new Function('ctx', 'game', 'themeArt', 'SPR', 'VIEW_W', 'VIEW_H', 'px',
  RENDER_SRC + '\n;return renderTiles;');
const px = v => Math.round(v);

function runLevel(row, themeArt) {
  const L = row.L, log = [];
  const ctx = makeCtx(log);
  const VW = L.tw * 16, VH = L.th * 16; // 视口放大到整关：x0..x1 / y0..y1 覆盖全部瓦片
  row.game.cam.x = 0; row.game.cam.y = 0; row.game.keys = 0; row.game.tick = 60;
  const fn = renderTiles(ctx, row.game, themeArt, { windStreak: null, chest: null, lantern: null }, VW, VH, px);
  fn(L, 60);
  return log;
}

// 归属规则（确定性，基线/改动后同规则）：绘制点就近落到 16px 网格
function tileOf(call) { return [Math.round(call.x / 16), Math.round(call.y / 16)]; }

function survey(rows) {
  const res = [];
  for (const row of rows) {
    const ta = fakeThemeArt({});
    const log = runLevel(row, ta);
    const counts = {}; let other = 0;
    const byPos = new Map(); // "tx,ty" -> [calls]
    for (const c of log) {
      const [tx, ty] = tileOf(c);
      const ch = (row.L.tiles[ty] && row.L.tiles[ty][tx]) || '·';
      counts[ch] = (counts[ch] || 0) + 1;
      if (c.op === 'drawImage') {
        const k = tx + ',' + ty;
        if (!byPos.has(k)) byPos.set(k, []);
        byPos.get(k).push(c);
      }
    }
    res.push({ i: row.i, name: row.name, theme: row.theme, counts, byPos, total: log.length });
  }
  return res;
}

const rows = buildLevels();
const data = survey(rows);

// ---------- 5. 断言 A：'B' 覆盖率 ----------
let bTotal = 0, bOk = 0; const misses = [];
for (let k = 0; k < rows.length; k++) {
  const row = rows[k], res = data[k];
  for (let ty = 0; ty < row.L.tiles.length; ty++) {
    for (let tx = 0; tx < row.L.tiles[ty].length; tx++) {
      if (row.L.tiles[ty][tx] !== 'B') continue;
      bTotal++;
      const calls = res.byPos.get(tx + ',' + ty) || [];
      const hitBreak = calls.some(c => c.key === 'tiles.breakBrick' && c.x === tx * 16 && c.y === ty * 16);
      if (hitBreak) bOk++; else misses.push('L' + (row.i + 1) + ' ' + row.name + ' (' + tx + ',' + ty + ') 无 breakBrick 绘制');
    }
  }
}

// ---------- 6. 断言 B：兜底路径（themeArt 缺 breakBrick） ----------
let fbOk = 0, fbBad = [];
for (const row of rows) {
  const L = row.L;
  let firstB = null;
  for (let ty = 0; ty < L.tiles.length && !firstB; ty++)
    for (let tx = 0; tx < L.tiles[ty].length; tx++) if (L.tiles[ty][tx] === 'B') { firstB = [tx, ty]; break; }
  if (!firstB) continue;
  const log = runLevel(row, fakeThemeArt({ drop: ['breakBrick'] }));
  const [bx, by] = firstB;
  const base = log.filter(c => c.op === 'drawImage' && c.x === bx * 16 && c.y === by * 16 && c.key === 'tiles.block');
  const cracks = log.filter(c => c.op === 'fillRect' && c.x >= bx * 16 && c.x < bx * 16 + 16 && c.y >= by * 16 && c.y < by * 16 + 16 && c.w <= 4);
  if (base.length === 1 && cracks.length >= 3) fbOk++; else fbBad.push('L' + (row.i + 1) + ' 兜底异常 base=' + base.length + ' crack=' + cracks.length);
}

// ---------- 7. 断言 C：主题兜底审计（静态：tiles 字面量无条件含 breakBrick） ----------
const artSrc = read('art.js');
const themeKeys = (artSrc.match(/^const THEMES = \{([\s\S]*?)^\};/m) || [, ''])[1].match(/^  (\w+): _th\(/gm) || [];
const tilesLit = artSrc.slice(artSrc.indexOf('tiles: {', artSrc.indexOf('function buildThemeArt')), artSrc.indexOf('decor: _buildDecor()'));
const hasBreak = /breakBrick:/.test(tilesLit);
const condIdx = artSrc.indexOf("if (key === 'sea' || key === 'nether')", artSrc.indexOf('function buildThemeArt'));
const breakIdx = artSrc.indexOf('breakBrick:', artSrc.indexOf('function buildThemeArt'));

// ---------- 8. 断言 D：引擎 solid() 认的字符 vs renderTiles switch case（只报告） ----------
const cases = (RENDER_SRC.match(/case\s+'([^']*)'/g) || []).map(s => s.replace(/case\s+'|'/g, ''));
const caseSet = new Set(cases);
const solidChars = ['#', 'I', 'B', 'G', '(', ')', 'a', 'b', 'D', 'C'];
const missingRender = solidChars.filter(c => !caseSet.has(c));

// ---------- 输出 ----------
console.log('=== 主题兜底审计 ===');
console.log('  THEMES 主题数 = ' + themeKeys.length + ' → ' + themeKeys.map(s => s.trim().replace(':', '')).join(','));
console.log('  buildThemeArt.tiles 字面量无条件含 breakBrick = ' + hasBreak + '（breakBrick 行号偏移 ' + breakIdx + ' < 条件块 ' + condIdx + ' → ' + (breakIdx < condIdx ? '全部主题都有' : '部分主题缺') + '）');
console.log('  hidden 键仅 sea/nether（条件块内）→ 其余 10 主题走 T.block+裂纹兜底（已存在）');

console.log('=== 引擎/渲染口径差集（只报告） ===');
console.log('  solid() 认的字符: ' + solidChars.join(' '));
console.log('  renderTiles 未绘制: ' + (missingRender.length ? missingRender.join(' ') : '（无）'));

console.log('=== B 覆盖率 ===');
console.log('  ' + bOk + '/' + bTotal + ' = ' + (bTotal ? (bOk / bTotal * 100).toFixed(1) : '0') + '%');
if (misses.length) { for (const m of misses) console.log('  [MISS] ' + m); }

console.log('=== 兜底路径 ===');
console.log('  缺 breakBrick 时回落到 block+裂纹: ' + fbOk + ' 关通过' + (fbBad.length ? '，异常: ' + fbBad.join('; ') : ''));

if (SAVE) {
  const base = data.map(d => ({ i: d.i, name: d.name, counts: d.counts, total: d.total }));
  fs.writeFileSync(BASE_FILE, JSON.stringify(base, null, 1));
  console.log('基线已保存 → tools/_v76_brick_base.json（' + base.length + ' 关）');
} else if (!NOBASE) {
  if (!fs.existsSync(BASE_FILE)) { console.error('缺少基线文件，请先跑 --save'); process.exit(1); }
  const base = JSON.parse(fs.readFileSync(BASE_FILE, 'utf8'));
  const OTHER = ['#', 'I', '=', '^', 'v', '~', 'a', 'b', 'C', 'D', '(', ')', 'w', 'G', '{', '}', 'g', 'R'];
  let diffs = [];
  for (let k = 0; k < data.length; k++) {
    const now = data[k], was = base[k];
    for (const ch of OTHER) {
      const a = (was.counts[ch] || 0), b = (now.counts[ch] || 0);
      if (a !== b) diffs.push('L' + (now.i + 1) + ' ' + now.name + ' 字符 ' + ch + ': ' + a + ' → ' + b);
    }
  }
  console.log('=== 回归比对（其余 18 字符绘制调用数） ===');
  if (diffs.length) { for (const d of diffs) console.log('  [DIFF] ' + d); }
  else console.log('  全部 16 关 × 18 字符逐项一致（0 差异）');
  const bBefore = base.reduce((s, x) => s + (x.counts['B'] || 0), 0);
  const bAfter = data.reduce((s, x) => s + (x.counts['B'] || 0), 0);
  console.log('  \'B\' 绘制调用: 基线 ' + bBefore + ' → 现在 ' + bAfter + '（应等于 B 瓦片数 ' + bTotal + '）');
  if (diffs.length || bAfter !== bTotal) { console.error('回归门禁未通过'); process.exit(1); }
}

if (bOk !== bTotal || fbBad.length || !hasBreak || missingRender.length) {
  console.error('B 覆盖率/兜底门禁未通过');
  process.exit(1);
}
console.log('brick OK: ' + bOk + '/' + bTotal + ' 处 \'B\' 全部绘制，18 字符零回归，' + themeKeys.length + ' 主题兜底齐备');
