// tools/_v77_skins_art.js —— v7.7 换色皮肤系统自检（node tools/_v77_skins_art.js 直跑）
// 覆盖四件事：① 17 套帧键集合 == 现有 SPR.hero* 键集合（逐 id 报缺键）；② 帧都是有效 canvas；
// ③ 惰性生成/缓存/未知 id 回落；④ 色彩审计（k 非纯黑、B<b<W、o<s<y、两两色相角差 ≥12°）
// ⑤ buildSprites 的 v7.7 额外耗时（对比「去掉 getHeroSkin('blue') 那一行」的同源构建）。
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'art.js'), 'utf8');
const fails = [];

/* ---------- 最小 canvas 桩（art.js 全程只用到 2D 上下文的最小面） ---------- */
function mkGrad() { return { addColorStop() {} }; }
function mkCtx(cv) {
  const noop = () => {};
  return new Proxy({
    canvas: cv, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1,
    globalCompositeOperation: 'source-over', font: '', textAlign: '', textBaseline: '',
    imageSmoothingEnabled: false, filter: 'none', shadowBlur: 0, shadowColor: '#000',
    createLinearGradient: mkGrad, createRadialGradient: mkGrad, createPattern: () => null,
    getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }),
    putImageData: noop, createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }),
    measureText: () => ({ width: 4 })
  }, { get(t, k) { if (k in t) return t[k]; return noop; }, set(t, k, v) { t[k] = v; return true; } });
}
function mkCanvas(w, h) {
  const cv = { width: w | 0 || 1, height: h | 0 || 1 };
  cv.getContext = () => (cv._c || (cv._c = mkCtx(cv)));
  return cv;
}
function sandbox(code) { // 每次独立上下文（art.js 顶层零 DOM，只在函数体内取 document）
  const doc = { createElement: t => (t === 'canvas' ? mkCanvas(1, 1) : {}), getElementById: () => null };
  return new Function('document', 'window', code
    + '\n;return {SPR,HERO_SKINS,getHeroSkin,buildSprites,GRIDS:{' // 主角网格（内部 const，此处只为「调色板键齐不齐」审计导出）
    + 'idle1:_H_IDLE1,idle2:_H_IDLE2,run:_H_RUNS,jump:_H_JUMP,fall:_H_FALL,attack:_H_ATTACK,'
    + 'dash:_H_DASH,squash:_H_SQUASH,dashWind:_H_DASHWIND}};')(doc, {});
}

/* ---------- 颜色工具：WCAG 相对亮度 + HSL 色相角 ---------- */
const hex2rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function lum(hx) {
  const c = hex2rgb(hx).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function hueOf(hx) {
  const [r, g, b] = hex2rgb(hx).map(v => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return 0;
  let h;
  if (mx === r) h = ((g - b) / d + 6) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  return h * 60;
}
const isHex = s => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);

/* ---------- ① 构建 + 取基线键集合 ---------- */
const A = sandbox(src);
A.buildSprites();

const heroKeys = Object.keys(A.SPR).filter(k => /^hero[A-Z]/.test(k));
const want = heroKeys.map(k => k[4].toLowerCase() + k.slice(5)).sort();
console.log('基线 SPR.hero* 键 ' + heroKeys.length + ' 个 → 皮肤帧键集合 ' + want.length + ' 个: ' + want.join(', '));

/* ---------- ② 19 套帧完整性 + 有效 canvas ---------- */
const SKINS = A.HERO_SKINS;
if (!Array.isArray(SKINS) || SKINS.length !== 19) fails.push('HERO_SKINS 应为 19 项，实为 ' + (SKINS && SKINS.length));
// 主角网格用到的全部字符（缺任一调色板键 → _makeSprite 静默跳过该像素 → 帧上出现「洞」）
const usedChars = {};
for (const gname of Object.keys(A.GRIDS)) {
  const rows = A.GRIDS[gname];
  const frames = (Array.isArray(rows) && Array.isArray(rows[0])) ? rows : [rows]; // run = 6 帧数组，其余=单帧行数组
  for (const frame of frames) for (const row of frame) for (const ch of row)
    if (ch !== '.' && ch !== ' ') usedChars[ch] = 1; // '.'/' ' 都是透明（_makeSprite 对空字符与空白一律跳过）
}
const blueF = A.getHeroSkin('blue');
const seen = {};
for (const sk of SKINS) {
  if (!sk || typeof sk.id !== 'string' || typeof sk.name !== 'string') { fails.push('皮肤项缺 id/name: ' + JSON.stringify(sk)); continue; }
  if (seen[sk.id]) fails.push('皮肤 id 重复: ' + sk.id);
  seen[sk.id] = 1;
  if (!sk.pal) fails.push(sk.id + ' 缺 pal 字段');
  const missPal = Object.keys(usedChars).filter(ch => !isHex(sk.pal[ch]));
  if (missPal.length) fails.push(sk.id + '.pal 缺网格用到的字符键: ' + missPal.join(',') + '（会挖出透明洞）');
  const f = A.getHeroSkin(sk.id);
  const got = Object.keys(f).sort();
  const miss = want.filter(k => got.indexOf(k) < 0);
  const extra = got.filter(k => want.indexOf(k) < 0);
  if (miss.length) fails.push(sk.id + ' 缺帧: ' + miss.join(','));
  if (extra.length) fails.push(sk.id + ' 多出非契约键: ' + extra.join(','));
  for (const k of got) {
    const v = f[k];
    const list = Array.isArray(v) ? v : [v];
    const ref = blueF[k];
    const refList = Array.isArray(ref) ? ref : [ref];
    if (Array.isArray(v) && v.length !== 6 && k.indexOf('run') === 0) fails.push(sk.id + '.' + k + ' 应为 6 帧，实为 ' + v.length);
    if (Array.isArray(v) !== Array.isArray(ref)) fails.push(sk.id + '.' + k + ' 帧形态与 blue 不一致（数组/单帧）');
    for (let i = 0; i < list.length; i++) {
      const c = list[i], rc = refList[i] || refList[0];
      if (!c || !(c.width > 0) || !(c.height > 0)) fails.push(sk.id + '.' + k + (Array.isArray(v) ? '[' + i + ']' : '') + ' 不是有效 canvas');
      else if (rc && (c.width !== rc.width || c.height !== rc.height))
        fails.push(sk.id + '.' + k + (Array.isArray(v) ? '[' + i + ']' : '') + ' 尺寸 ' + c.width + '×' + c.height + ' ≠ blue ' + rc.width + '×' + rc.height);
    }
  }
  if (!Object.isFrozen(f)) fails.push(sk.id + ' 帧对象未冻结');
}
console.log('帧完整性: ' + SKINS.length + ' 套 × ' + want.length + ' 键 = ' + (SKINS.length * want.length) + ' 个键位，键集合与 SPR.hero* ' + (fails.length ? '有差异' : '完全一致'));

/* ---------- ③ 惰性生成 / 缓存 / 回落 ---------- */
const blue1 = A.getHeroSkin('blue'), blue2 = A.getHeroSkin('blue');
if (blue1 !== blue2) fails.push("getHeroSkin('blue') 两次调用返回不同对象（未命中缓存）");
if (blue1 !== A.SPR.skins.blue) fails.push("getHeroSkin('blue') 未缓存进 SPR.skins.blue");
if (blue1.idle1 !== A.SPR.heroIdle1) fails.push("blue 未复用 SPR.heroIdle1（重复生成了）");
if (blue1.attackGold !== A.SPR.heroAttackGold) fails.push('blue 未复用 SPR.heroAttackGold');
const unk = A.getHeroSkin('不存在的id');
if (unk !== blue1) fails.push("未知 id 未回落到 blue");
// 其余 18 套首次取用时才生成（此刻应已全部在缓存里）
const lazyN = Object.keys(A.SPR.skins).length;
if (lazyN !== 19) fails.push('SPR.skins 缓存数应为 19，实为 ' + lazyN);
console.log('惰性/缓存: blue 复用既有帧=' + (blue1.idle1 === A.SPR.heroIdle1) + '，同 id 同对象=' + (blue1 === blue2) + '，未知 id 回落 blue=' + (unk === blue1));

/* ---------- ④ 色彩审计 ---------- */
console.log('\nid         name        b         hue(°)  lum(B/b/W)               o/s/y 明度               审计');
const hueList = [];
for (const sk of SKINS) {
  const p = sk.pal || {};
  for (const key of ['k', 'b', 'B', 'W', 'w', 'o', 's', 'O', 'y', 'Y', 'e', 'p'])
    if (!isHex(p[key])) fails.push(sk.id + '.pal.' + key + ' 不是 #rrggbb: ' + p[key]);
  if (!isHex(p.b)) continue;
  const lb = lum(p.b), lB = lum(p.B), lW = lum(p.W), lo = lum(p.o), ls = lum(p.s), ly = lum(p.y);
  const bad = [];
  if (p.k === '#000000' || p.k === '#000') bad.push('k 纯黑');
  if (Math.max(...hex2rgb(p.k)) <= 8) bad.push('k 近纯黑');
  if (!(lB < lb)) bad.push('B≥b');
  if (!(lb < lW)) bad.push('b≥W');
  if (!(lo < ls)) bad.push('o≥s');
  if (!(ls < ly)) bad.push('s≥y');
  const h = hueOf(p.b);
  hueList.push({ id: sk.id, h });
  if (bad.length) fails.push(sk.id + ' 色彩违约: ' + bad.join('/'));
  console.log(
    sk.id.padEnd(10) + sk.name.padEnd(11) + p.b.padEnd(9) + h.toFixed(1).padStart(6) + '  ' +
    (lB.toFixed(2) + '<' + lb.toFixed(2) + '<' + lW.toFixed(2)).padEnd(24) +
    (lo.toFixed(2) + '<' + ls.toFixed(2) + '<' + ly.toFixed(2)).padEnd(24) +
    (bad.length ? '*** ' + bad.join('/') : 'ok'));
}
// 两两色相角差（环形最短距离）
let minD = 1e9, pair = '';
for (let i = 0; i < hueList.length; i++) for (let j = i + 1; j < hueList.length; j++) {
  let d = Math.abs(hueList[i].h - hueList[j].h);
  if (d > 180) d = 360 - d;
  if (d < minD) { minD = d; pair = hueList[i].id + '/' + hueList[j].id; }
}
console.log('\n两两 b 色相角差最小值 = ' + minD.toFixed(2) + '°（' + pair + '），阈值 ≥12°');
if (minD < 12) fails.push('色相角差 ' + minD.toFixed(2) + '° < 12°（' + pair + '）');

/* ---------- ⑤ 启动耗时增量：同源构建，唯一差异=buildSprites 末尾那行 getHeroSkin('blue') ---------- */
const noPre = src.replace(/^\s*getHeroSkin\('blue'\);\s*$/m, '');
if (noPre === src) fails.push("未找到 buildSprites 末尾的 getHeroSkin('blue') 预生成行");
function timeBuild(code) { // 单次独立构建耗时（每次全新沙箱，顶层零 DOM）
  const S = sandbox(code);
  const a = process.hrtime.bigint(); S.buildSprites(); const b = process.hrtime.bigint();
  return Number(b - a) / 1e6;
}
// 交替 5 轮取各自最小值：两边同样吃 JIT 预热，差值才是「预生成 blue」的真实成本
let tBuild = Infinity, tBuildNoPre = Infinity;
for (let i = 0; i < 5; i++) {
  tBuild = Math.min(tBuild, timeBuild(src));
  tBuildNoPre = Math.min(tBuildNoPre, timeBuild(noPre));
}
const tDelta = tBuild - tBuildNoPre;
// 单套皮肤惰性生成成本（18 套平均）：全新沙箱里 buildSprites 后逐套首取
const C = sandbox(src); C.buildSprites();
const tA = process.hrtime.bigint();
for (const sk of SKINS) if (sk.id !== 'blue') C.getHeroSkin(sk.id);
const tB = process.hrtime.bigint();
const tLazyAll = Number(tB - tA) / 1e6;
console.log('\n耗时（canvas 桩环境，交替 5 轮取最小）：buildSprites 含预生成 ' + tBuild.toFixed(2) + 'ms / 不含 ' + tBuildNoPre.toFixed(2)
  + 'ms → v7.7 启动增量 ' + (tDelta >= 0 ? '+' : '') + tDelta.toFixed(2) + 'ms（阈值 <30ms；负值=纯噪声，即预生成 blue 不画像素）');
console.log('惰性成本参考：首次取 16 套皮肤 ' + tLazyAll.toFixed(2) + 'ms（均摊 ' + (tLazyAll / 16).toFixed(2) + 'ms/套，只在用到时才付）');
if (tDelta >= 30) fails.push('buildSprites 的 v7.7 启动增量 ≥30ms（' + tDelta.toFixed(2) + 'ms）');

/* ---------- 汇总 ---------- */
if (fails.length) {
  console.error('\n[FAIL] ' + fails.length + ' 项：');
  for (const f of fails) console.error('  - ' + f);
  process.exit(1);
}
console.log('\n[PASS] 19 套皮肤：帧键集合完整、帧有效且冻结、惰性缓存与回落正确、色彩审计全部通过');
