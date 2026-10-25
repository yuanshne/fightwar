// tools/_audit_tiles.js —— 瓦片四方口径审计（渲染表 / 碰撞表 / 伤害表 / levels 断言表）
// 用法：node tools/_audit_tiles.js
// 产出：
//   ① 16 关实际出现的每个瓦片字符 × 五列事实（绘制 / 实心 / 可站立 / 伤害 / 实体化）
//   ② 四类缺陷清单（隐形墙 / 纯贴图 / 危险物伤不到 / 主题缺美术键）
//   ③ 危险瓦片逐帧实测（几何重叠检测 + 4 种典型站位物理回放）
//   ④ 主题美术键齐全性（静态解析 art.js buildThemeArt）
// 只读工程文件，不修改任何共享文件。
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* ================= 0. 源码切片（按大括号配对，跳过字符串/注释） ================= */
function sliceBlock(src, startIdx) {
  let d = 0, i = startIdx, mode = 0;
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (mode === 0) {
      if (c === '/' && n === '/') { mode = 4; i++; continue; }
      if (c === '/' && n === '*') { mode = 5; i++; continue; }
      if (c === "'") { mode = 1; continue; }
      if (c === '"') { mode = 2; continue; }
      if (c === '`') { mode = 3; continue; }
      if (c === '{') d++;
      else if (c === '}') { d--; if (d === 0) return i + 1; }
    } else if (mode === 1) { if (c === '\\') i++; else if (c === "'") mode = 0; }
    else if (mode === 2) { if (c === '\\') i++; else if (c === '"') mode = 0; }
    else if (mode === 3) { if (c === '\\') i++; else if (c === '`') mode = 0; }
    else if (mode === 4) { if (c === '\n') mode = 0; }
    else if (mode === 5) { if (c === '*' && n === '/') { mode = 0; i++; } }
  }
  throw new Error('大括号未配对');
}
function fnBody(src, signature) {
  const at = src.indexOf(signature);
  if (at < 0) throw new Error('找不到 ' + signature);
  const brace = src.indexOf('{', at);
  const end = sliceBlock(src, brace);
  return { body: src.slice(brace + 1, end - 1), text: src.slice(at, end) };
}
function objKeys(src, marker) {
  const at = src.indexOf(marker);
  if (at < 0) return [];
  const brace = src.indexOf('{', at);
  const end = sliceBlock(src, brace);
  const body = src.slice(brace + 1, end - 1);
  const keys = [];
  let d = 0, mode = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (mode === 0) {
      if (c === '/' && body[i + 1] === '/') { mode = 4; i++; continue; }
      if (c === "'" || c === '"' || c === '`') { mode = c === "'" ? 1 : c === '"' ? 2 : 3; continue; }
      if (c === '{' || c === '[' || c === '(') { d++; continue; }
      if (c === '}' || c === ']' || c === ')') { d--; continue; }
      if (d === 0) {
        const m = /^([A-Za-z_$][\w$]*)\s*:/.exec(body.slice(i));
        if (m && (i === 0 || /[\s,{]/.test(body[i - 1]))) { keys.push(m[1]); i += m[0].length - 1; }
      }
    } else if (mode === 1) { if (c === '\\') i++; else if (c === "'") mode = 0; }
    else if (mode === 2) { if (c === '\\') i++; else if (c === '"') mode = 0; }
    else if (mode === 3) { if (c === '\\') i++; else if (c === '`') mode = 0; }
    else if (mode === 4) { if (c === '\n') mode = 0; }
  }
  return keys;
}

/* ================= 1. 渲染表：ui.js renderTiles 的 case 标签 ================= */
const uiSrc = read('ui.js');
const rt = fnBody(uiSrc, 'function renderTiles');
const drawCases = [];
for (const m of rt.body.matchAll(/case\s+'([^']+)'\s*:/g)) if (!drawCases.includes(m[1])) drawCases.push(m[1]);
const drawSet = new Set(drawCases);
const tileRefs = [...new Set([...rt.body.matchAll(/\bT\.([A-Za-z_$][\w$]*)/g)].map(m => m[1]))];
const sprRefs = [...new Set([...rt.body.matchAll(/\bSPR\.([A-Za-z_$][\w$]*)/g)].map(m => m[1]))];
const caseBody = {};
{
  const re = /case\s+'([^']+)'\s*:/g;
  const hits = [];
  let m;
  while ((m = re.exec(rt.body))) hits.push({ ch: m[1], at: m.index });
  for (let i = 0; i < hits.length; i++) {
    const end = i + 1 < hits.length ? hits[i + 1].at : rt.body.length;
    caseBody[hits[i].ch] = rt.body.slice(hits[i].at, end);
  }
}

/* ================= 2. 主题美术键（静态解析 art.js） ================= */
const artSrc = read('art.js');
const bta = fnBody(artSrc, 'function buildThemeArt');
const baseTileKeys = objKeys(bta.body, 'tiles:');
const condTileKeys = {};
{
  const re = /art\.tiles\.([A-Za-z_$][\w$]*)\s*=/g;
  let m;
  while ((m = re.exec(bta.body))) {
    const before = bta.body.slice(Math.max(0, m.index - 400), m.index);
    const ifM = /if\s*\(([^)]*)\)\s*\{[^}]*$/.exec(before);
    condTileKeys[m[1]] = ifM ? [...ifM[1].matchAll(/'(\w+)'/g)].map(x => x[1]) : [];
  }
}
const themeKeys = objKeys(artSrc, 'const THEMES');
const themeTileKeys = {};
for (const t of themeKeys) {
  const ks = baseTileKeys.slice();
  for (const k of Object.keys(condTileKeys)) if (condTileKeys[k].includes(t)) ks.push(k);
  themeTileKeys[t] = ks;
}

/* ================= 3. 沙箱（照 tools/gate.js engine 模式） ================= */
const levelsSrc = read('levels.js');
const chapterSrc = ['chapter2.js', 'chapter3.js'].map(f => read(f)).join('\n');
const engineSrc = read('engine.js');
const themes = {};
['grass', 'cave', 'sky', 'factory', 'lava', 'tower', 'boss', 'wind', 'castle', 'star', 'sea', 'nether'].forEach(k => themes[k] = {});
const glue = '\n;return {PHY,Level,game,loadLevel,respawn,killPlayer,updateWorld,LEVELS,ALL_LEVELS,LG};';
const sb = new Function('THEMES', levelsSrc + '\n' + chapterSrc + '\n;aggregateLevels();\n' + engineSrc + glue)(themes);
const ALL = sb.ALL_LEVELS;
// levels.js 的静态断言集合（声明在 validateLevels 内，只能源码解析）
const SOLIDISH = new Set([...(/const SOLIDISH\s*=\s*new Set\(\[([^\]]*)\]\)/.exec(levelsSrc)[1].matchAll(/'([^']+)'/g))].map(m => m[1]));
const STAND = new Set([...(/const STAND\s*=\s*new Set\(\[([^\]]*)\]\)/.exec(levelsSrc)[1].matchAll(/'([^']+)'/g))].map(m => m[1]));

/* ================= 4. 原始网格（实体字符尚未被提取） ================= */
const raw = [];
ALL.forEach((meta, i) => {
  const lg = new sb.LG(meta.w, meta.h);
  const r = meta.build(lg);
  raw.push({ idx: i, meta: meta, grid: (r && r.g) ? r.g : lg.g, w: meta.w, h: meta.h });
});
const occ = new Map();
for (const L of raw) for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
  const ch = L.grid[y][x];
  if (ch === '.') continue;
  if (!occ.has(ch)) occ.set(ch, []);
  occ.get(ch).push({ lv: L.idx + 1, tx: x, ty: y });
}
const usedChars = [...occ.keys()].sort();

/* ================= 5. 实体化字符：Level 构造 switch(ch) ================= */
const ctor = fnBody(engineSrc, 'class Level');
const entAt = ctor.text.indexOf('switch (ch)');
const entBrace = ctor.text.indexOf('{', entAt);
const entBody = ctor.text.slice(entBrace + 1, sliceBlock(ctor.text, entBrace) - 1);
const entityChars = new Set(), clearsTile = new Set();
{
  const re = /case\s+'([^']+)'\s*:/g;
  const hits = [];
  let m;
  while ((m = re.exec(entBody))) hits.push({ ch: m[1], at: m.index });
  for (let i = 0; i < hits.length; i++) {
    const seg = entBody.slice(hits[i].at, i + 1 < hits.length ? hits[i + 1].at : entBody.length);
    entityChars.add(hits[i].ch);
    if (/this\.tiles\[y\]\[x\]\s*=\s*'\.'/.test(seg)) clearsTile.add(hits[i].ch);
  }
}

/* ================= 6. 逐关构造 Level，实测 solid() ================= */
const lvCache = [];
for (let i = 0; i < ALL.length; i++) { sb.loadLevel(i, false); lvCache.push(sb.game.level); }
const solidOf = (lv, tx, ty, st) => { try { return !!lvCache[lv - 1].solid(tx, ty, st); } catch (e) { return false; } };

/* ================= 7. 伤害表（updateWorld ⑪ 几何口径） ================= */
const HAZARD = { '^': '下半', 'v': '上半', '~': '水位以下' };

/* ================= 8. 危险瓦片逐帧实测 =================
   每个危险瓦片跑 4 个典型站位探针，逐帧记录「玩家矩形是否与瓦片重叠」与「是否 p.dead」：
     below 站在瓦片正下方一格的地面（脚下是实心才成立）
     top   脚底踩在瓦片顶面（瓦片嵌在可行走地板里时成立）
     fall  从瓦片上方 20px 自由落体穿过
     jump  从下方最近实心地面起跳（按住跳 40 帧）
   判据：出现过几何重叠却全程不死 → 伤害判定够不到（类别③）。 */
function isolate() {
  const g = sb.game, L = g.level;
  L.enemies.length = 0; L.saws.length = 0; L.pends.length = 0; L.cannons.length = 0; L.springs.length = 0;
  g.bullets.length = 0; g.meteors.length = 0; g.waves.length = 0; g.boss = null;
  g.parts.length = 0; g.floats.length = 0; g.fxParts.length = 0; g.drops.length = 0;
  g.hitStop = 0; g.puzzleActive = false; g.bagActive = false; g.paused = false;
  g.ult = { on: false, t: 0, fired: false, flashed: false };
  g.input.right = 0; g.input.left = 0; g.input.jump = 0; g.input.jumpHit = 0; g.input.down = 0;
}
function overlap(p, tx, ty) {
  return p.x < tx * 16 + 16 && p.x + p.w > tx * 16 && p.y < ty * 16 + 16 && p.y + p.h > ty * 16;
}
function probe(lv, tx, ty, kind) {
  sb.loadLevel(lv - 1, false);
  const g = sb.game; g.state = 'play'; isolate();
  const L = g.level, p = g.player;
  // 找瓦片下方最近的实心面（jump/below 用）
  let surf = -1;
  for (let y = ty + 1; y < L.h; y++) if (solidOf(lv, tx, y, 0) || solidOf(lv, tx, y, 1)) { surf = y; break; }
  if (kind === 'below') {
    if (surf !== ty + 1) return { ok: false };
    p.x = tx * 16 + 3; p.y = (ty + 1) * 16 - p.h;
  } else if (kind === 'top') {
    p.x = tx * 16 + 3; p.y = ty * 16 - p.h;
  } else if (kind === 'fall') {
    p.x = tx * 16 + 3; p.y = ty * 16 - 20;
  } else if (kind === 'jump') {
    if (surf < 0) return { ok: false };
    p.x = tx * 16 + 3; p.y = surf * 16 - p.h;
    g.input.jump = 1; g.input.jumpHit = 1;
  }
  p.vx = 0; p.vy = 0; p.dead = false; p.deadT = 0; p.invT = 0; p.hp = p.maxHp;
  p.onGround = false; p.coyote = 0; p.jbuf = 0;
  g.respawnAt = { x: p.x, y: p.y, p: 0 };
  let hit = false, died = false, cause = '', atF = -1;
  for (let f = 0; f < 45; f++) {
    if (f === 1) g.input.jumpHit = 0;
    sb.updateWorld(1 / 60);
    if (overlap(p, tx, ty)) hit = true;
    if (p.dead) { died = true; atF = f; cause = (p.y > L.h * 16 + 24) ? 'fall' : 'hazard'; break; }
  }
  g.input.jump = 0; g.input.jumpHit = 0;
  return { ok: true, hit: hit, died: died, cause: cause, f: atF };
}
const hz = []; // {ch,lv,tx,ty,probes:{},verdict}
for (const ch of Object.keys(HAZARD)) {
  for (const o of (occ.get(ch) || [])) {
    const pr = { below: probe(o.lv, o.tx, o.ty, 'below'), top: probe(o.lv, o.tx, o.ty, 'top'),
                 fall: probe(o.lv, o.tx, o.ty, 'fall'), jump: probe(o.lv, o.tx, o.ty, 'jump') };
    const anyHit = Object.values(pr).some(x => x.ok && x.hit);
    const anyDie = Object.values(pr).some(x => x.ok && x.died);
    const dieKinds = Object.keys(pr).filter(k => pr[k].ok && pr[k].died);
    hz.push({ ch: ch, lv: o.lv, tx: o.tx, ty: o.ty, pr: pr,
      verdict: !anyHit ? '够不到' : anyDie ? '致死' : '重叠却不死', dieKinds: dieKinds });
  }
}

/* ================= 9. 汇总五列 ================= */
const rows = [];
for (const ch of usedChars) {
  const list = occ.get(ch);
  const lvs = [...new Set(list.map(o => o.lv))];
  const s0 = [], s1 = [];
  for (const lv of lvs) {
    const o = list.find(q => q.lv === lv);
    s0.push(solidOf(lv, o.tx, o.ty, 0)); s1.push(solidOf(lv, o.tx, o.ty, 1));
  }
  const anySolid = s0.some(Boolean) || s1.some(Boolean);
  let topFree2 = 0, topBlocked = 0;
  for (const o of list) {
    const b1 = solidOf(o.lv, o.tx, o.ty - 1, 0) || solidOf(o.lv, o.tx, o.ty - 1, 1);
    const b2 = solidOf(o.lv, o.tx, o.ty - 2, 0) || solidOf(o.lv, o.tx, o.ty - 2, 1);
    if (!b1 && !b2) topFree2++; else topBlocked++;
  }
  rows.push({ ch: ch, n: list.length, lvs: lvs, list: list, drawn: drawSet.has(ch),
    s0: s0, s1: s1, anySolid: anySolid,
    standEngine: anySolid || ch === '=', standLevels: STAND.has(ch), solidish: SOLIDISH.has(ch),
    topFree2: topFree2, topBlocked: topBlocked, hazard: !!HAZARD[ch],
    entity: entityChars.has(ch), clears: clearsTile.has(ch) });
}

/* ================= 10. 输出 ================= */
const pad = (s, n) => { s = String(s); let w = 0; for (const c of s) w += /[\u4e00-\u9fa5（）：，]/.test(c) ? 2 : 1; return s + ' '.repeat(Math.max(0, n - w)); };
const solidStr = r => {
  if (r.s0.every(Boolean) && r.s1.every(Boolean)) return '恒实';
  const a = r.s0.filter(Boolean).length, b = r.s1.filter(Boolean).length;
  return '0:' + a + '/' + r.s0.length + ' 1:' + b + '/' + r.s1.length;
};
console.log('='.repeat(124));
console.log('瓦片四方口径审计 | 16 关实际出现 ' + usedChars.length + ' 种字符 | renderTiles case ' + drawCases.length + ' 个：' + drawCases.join(' '));
console.log('实心列 = Level.solid() 实测（切换态 0 / 1）；可站立 = 实心（任一切换态）或单向平台 "="；伤害 = updateWorld ⑪');
console.log('='.repeat(124));
console.log(pad('字符', 5) + pad('绘制', 6) + pad('实心(0/1实测)', 16) + pad('可站立', 8) + pad('伤害', 10) + pad('实体化', 10) + pad('关数', 6) + pad('次数', 6) + 'levels(SOLIDISH/STAND)');
for (const r of rows) {
  console.log(pad(JSON.stringify(r.ch), 5) + pad(r.drawn ? 'Y' : '-', 6) + pad(r.anySolid || r.s0.some(Boolean) || r.s1.some(Boolean) ? solidStr(r) : '否', 16)
    + pad(r.standEngine ? 'Y' : '-', 8) + pad(r.hazard ? HAZARD[r.ch] : '-', 10)
    + pad(r.clears ? '提取' : r.entity ? '提取(留)' : '-', 10) + pad(r.lvs.length, 6) + pad(r.n, 6)
    + (r.solidish ? 'S' : '-') + '/' + (r.standLevels ? 'S' : '-'));
}

/* ---- 缺陷分类 ---- */
const D1 = [], D2 = [], D4 = [];
for (const r of rows) {
  if (r.anySolid && !r.drawn && !r.clears) D1.push(r);                    // ① 实心不画 → 隐形墙
  const region = r.ch === 'w' || r.ch === '{' || r.ch === '}';
  const oneway = r.ch === '=';
  if (r.drawn && !r.anySolid && !r.hazard && !r.entity && !region && !oneway) D2.push(r); // ② 纯贴图
  if (r.drawn) {                                                          // ④ 主题缺键且无守卫
    const seg = caseBody[r.ch] || '';
    const missing = [];
    for (const k of tileRefs) {
      if (!new RegExp('\\bT\\.' + k + '\\b').test(seg)) continue;
      // 守卫识别：if(T.k) / T.k&& / T.k? / const v=T.k … if(v)
      let guarded = new RegExp('if\\s*\\(\\s*T\\.' + k).test(seg) || new RegExp('T\\.' + k + '\\s*(&&|\\?)').test(seg);
      if (!guarded) {
        const asg = new RegExp('(?:const|let|var)\\s+(\\w+)\\s*=\\s*[^;]*T\\.' + k + '\\b').exec(seg);
        if (asg && new RegExp('if\\s*\\(\\s*' + asg[1] + '\\s*\\)').test(seg)) guarded = true;
      }
      if (guarded) continue;
      const lacking = themeKeys.filter(t => !themeTileKeys[t].includes(k));
      if (lacking.length) missing.push('T.' + k + '(缺:' + lacking.length + '主题)');
    }
    if (missing.length) D4.push({ r: r, missing: missing });
  }
}
// ③ 危险物重叠却不死
const D3 = hz.filter(h => h.verdict === '重叠却不死');

console.log('\n' + '='.repeat(124));
console.log('缺陷清单');
console.log('='.repeat(124));
console.log('\n【① 实心但 renderTiles 不画 → 隐形墙】' + (D1.length ? '' : ' 无'));
for (const r of D1) {
  const perLv = new Map();
  for (const o of r.list) { if (!perLv.has(o.lv)) perLv.set(o.lv, []); perLv.get(o.lv).push(o.tx + ',' + o.ty); }
  console.log('  字符 ' + JSON.stringify(r.ch) + '  实心实测=' + solidStr(r) + '  renderTiles case=' + (r.drawn ? '有' : '无')
    + '  levels SOLIDISH/STAND=' + (r.solidish ? 'S' : '-') + '/' + (r.standLevels ? 'S' : '-'));
  for (const [lv, arr] of perLv) console.log('     L' + lv + ' ×' + arr.length + '  (' + arr.join(' ') + ')');
}
console.log('\n【② 画了但引擎零语义 → 纯贴图】' + (D2.length ? '' : ' 无'));
for (const r of D2) console.log('  字符 ' + JSON.stringify(r.ch) + '  关=' + r.lvs.join(',') + '  次数=' + r.n);
console.log('\n【③ 危险物画了却伤不到（几何重叠实测不死）】' + (D3.length ? '' : ' 无'));
for (const h of D3) {
  const pr = h.pr;
  console.log('  ' + JSON.stringify(h.ch) + ' L' + h.lv + ' (' + h.tx + ',' + h.ty + ')'
    + '  below=' + (pr.below.ok ? (pr.below.died ? '死' : '活') : '不适用')
    + ' top=' + (pr.top.died ? '死' : '活') + ' fall=' + (pr.fall.died ? '死' : '活')
    + ' jump=' + (pr.jump.ok ? (pr.jump.died ? '死' : '活') : '不适用'));
}
console.log('\n【④ 主题缺美术键且渲染无守卫 → drawImage(undefined) 抛错】' + (D4.length ? '' : ' 无'));
for (const d of D4) console.log('  字符 ' + JSON.stringify(d.r.ch) + '  ' + d.missing.join(' '));

/* ---- 危险瓦片逐帧实测汇总 ---- */
console.log('\n' + '='.repeat(124));
console.log('危险瓦片逐帧实测汇总（每个瓦片 4 探针 × 45 帧；重叠检测 + p.dead 判定）');
console.log('='.repeat(124));
console.log(pad('字符', 5) + pad('关', 5) + pad('样本', 6) + pad('致死', 6) + pad('重叠却不死', 10) + pad('够不到', 8) + '生效探针');
const hzAgg = new Map();
for (const h of hz) {
  const k = h.ch + '/L' + h.lv;
  if (!hzAgg.has(k)) hzAgg.set(k, { ch: h.ch, lv: h.lv, n: 0, die: 0, noDmg: 0, unreach: 0, kinds: new Set(), ex: [] });
  const e = hzAgg.get(k);
  e.n++;
  if (h.verdict === '致死') e.die++;
  if (h.verdict === '重叠却不死') { e.noDmg++; if (e.ex.length < 3) e.ex.push('(' + h.tx + ',' + h.ty + ')'); }
  if (h.verdict === '够不到') e.unreach++;
  h.dieKinds.forEach(k2 => e.kinds.add(k2));
}
for (const e of [...hzAgg.values()].sort((a, b) => a.ch.localeCompare(b.ch) || a.lv - b.lv)) {
  console.log(pad(JSON.stringify(e.ch), 5) + pad('L' + e.lv, 5) + pad(e.n, 6) + pad(e.die, 6) + pad(e.noDmg + (e.ex.length ? ' ' + e.ex.join(' ') : ''), 10)
    + pad(e.unreach, 8) + [...e.kinds].join(','));
}

/* ---- 主题键齐全性 ---- */
console.log('\n' + '='.repeat(124));
console.log('主题美术键（art.js buildThemeArt 静态解析）');
console.log('='.repeat(124));
console.log('  基础键(' + baseTileKeys.length + '): ' + baseTileKeys.join(', '));
console.log('  条件键: ' + Object.keys(condTileKeys).map(k => k + '←' + condTileKeys[k].join('|')).join(', '));
for (const t of themeKeys) {
  const lack = [...baseTileKeys].filter(k => !themeTileKeys[t].includes(k));
  console.log('  ' + pad(t, 9) + 'tiles=' + pad(themeTileKeys[t].length, 4) + (lack.length ? '缺: ' + lack.join(',') : '基础键齐全'));
}
console.log('\n  renderTiles 引用 T.* = ' + tileRefs.join(', ') + ' | SPR.* = ' + sprRefs.join(', '));
for (const k of tileRefs) {
  const lacking = themeKeys.filter(t => !themeTileKeys[t].includes(k));
  if (!lacking.length) continue;
  const guarded = new RegExp('if\\s*\\(\\s*T\\.' + k).test(rt.body) || new RegExp('T\\.' + k + '\\s*(&&|\\?)').test(rt.body)
    || new RegExp('(?:const|let|var)\\s+(\\w+)\\s*=\\s*[^;]*T\\.' + k + '\\b').test(rt.body);
  console.log('    T.' + k + ' 缺于 ' + lacking.join('/') + '  → 渲染侧守卫: ' + (guarded ? '有（不会 drawImage(undefined)）' : '无（会抛错！）'));
}

/* ---- 旁路口径：_railSolid（电锯轨道）vs solid() ---- */
{
  const rb = fnBody(engineSrc, '_railSolid(tx, ty)');
  const railChars = new Set([...rb.body.matchAll(/ch\s*===\s*'([^']+)'/g)].map(m => m[1]));
  const solidChars = new Set();
  {
    const sbf = fnBody(engineSrc, 'solid(tx, ty, switchState)');
    for (const m of sbf.body.matchAll(/ch\s*===\s*'([^']+)'/g)) solidChars.add(m[1]);
  }
  console.log('\n' + '='.repeat(124));
  console.log('旁路口径对比（同一瓦片被不同子系统识别的字符集）');
  console.log('='.repeat(124));
  console.log('  Level.solid() 恒实字符 : ' + [...solidChars].join(' '));
  console.log('  _railSolid() 电锯轨道  : ' + [...railChars].join(' '));
  console.log('  仅 solid 认、rail 不认 : ' + [...solidChars].filter(c => !railChars.has(c)).join(' ') || '无');
  console.log('  仅 rail 认、solid 不认 : ' + [...railChars].filter(c => !solidChars.has(c)).join(' ') || '无');
  console.log('  levels.SOLIDISH         : ' + [...SOLIDISH].join(' '));
  console.log('  仅 solid 认、SOLIDISH 不认 : ' + [...solidChars].filter(c => !SOLIDISH.has(c)).join(' ') || '无');
  console.log('  levels.STAND            : ' + [...STAND].join(' '));
}

/* ---- 单向平台 "=" 上的实体：levels 的 STAND 认、引擎 solid() 不认 ---- */
{
  const GROUND_ENEMY = 'WEANxz'; // 受重力的地面敌（蝙蝠/水母/幽灵漂浮，不受影响）
  const cases = [];
  for (const L of raw) for (let y = 0; y < L.h - 1; y++) for (let x = 0; x < L.w; x++) {
    const ch = L.grid[y][x];
    if (GROUND_ENEMY.indexOf(ch) < 0) continue;
    if (L.grid[y + 1][x] === '=') cases.push({ lv: L.idx + 1, tx: x, ty: y, ch: ch });
  }
  console.log('\n  地面敌摆在 "=" 单向平台上（' + cases.length + ' 处）：');
  for (const c of cases) {
    sb.loadLevel(c.lv - 1, false);
    const g = sb.game; g.state = 'play';
    const e = g.level.enemies.filter(e => Math.abs(e.hx - c.tx * 16) < 20 && Math.abs(e.hy - c.ty * 16) < 24)[0];
    if (!e) { console.log('    L' + c.lv + '(' + c.tx + ',' + c.ty + ') ' + c.ch + ' 未找到实体'); continue; }
    isolate();
    const y0 = e.y;
    // 注意：isolate() 清空的是 L.enemies，实体 e 已取出引用 → 需放回数组才能被 updateWorld 推进
    g.level.enemies.push(e);
    for (let f = 0; f < 90; f++) { g.player.x = e.x; g.player.y = e.y - 40; sb.updateWorld(1 / 60); }
    console.log('    L' + c.lv + '(' + c.tx + ',' + c.ty + ') ' + c.ch + '/' + e.type + '  90 帧后 Δy=' + Math.round(e.y - y0)
      + 'px ' + (Math.abs(e.y - y0) > 4 ? '← 掉下平台（引擎不认 "=" 为实心）' : '站住了'));
  }
}

/* ---- 逐关：未绘制字符 ---- */
console.log('\n' + '='.repeat(124));
console.log('逐关「原始网格有、renderTiles 无 case」的字符');
console.log('='.repeat(124));
for (const L of raw) {
  const cnt = new Map();
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
    const ch = L.grid[y][x];
    if (ch === '.' || drawSet.has(ch)) continue;
    if (!cnt.has(ch)) cnt.set(ch, []);
    cnt.get(ch).push(x + ',' + y);
  }
  const parts = [];
  for (const [ch, arr] of cnt) {
    if (clearsTile.has(ch)) continue; // 实体字符由 renderEntities 画，不算漏画
    parts.push(JSON.stringify(ch) + '×' + arr.length + ' (' + arr.slice(0, 4).join(' ') + ')');
  }
  console.log('  L' + pad(L.idx + 1, 3) + pad(L.meta.name, 16) + (parts.length ? parts.join('  ') : '无'));
}
