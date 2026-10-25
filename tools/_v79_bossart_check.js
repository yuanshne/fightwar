// tools/_v79_bossart_check.js —— v7.9 Boss 精灵（kind4 冥古龙 / kind5 圣裁者）自检
// 跑法：node tools/_v79_bossart_check.js
// 覆盖：① SPR.boss4/boss5 存在且键集合 == SPR.boss2（逐键差集，双向）；
//      ② body 宽高精确（64×48 / 44×52，引擎命中框依赖，错 1px=看得见打不到）；
//      ③ 白剪影 body/arm/jaw 三件存在且尺寸同源；④ 逐帧像素审计（非空白/非纯黑/无 #000 调色板）。
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'art.js'), 'utf8');
const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); console.log((cond ? '  ok   ' : '  FAIL ') + msg); };

/* ---------- 最小软件 canvas（本文件断言真实像素，故必须真填充而非 noop） ----------
 * 只实现 art.js 用到的面：fillRect / drawImage(含 5 参压缩) / getImageData / putImageData /
 * fillStyle / globalAlpha / globalCompositeOperation(source-over|source-atop)。 */
function parseColor(s) {
  if (typeof s !== 'string') return [0, 0, 0, 255];
  if (s[0] === '#') {
    if (s.length === 7) return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), 255];
    if (s.length === 4) return [parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16), parseInt(s[3] + s[3], 16), 255];
  }
  return [0, 0, 0, 255];
}
function mkCanvas(w, h) {
  const cv = { width: Math.max(1, w | 0), height: Math.max(1, h | 0) };
  const buf = () => {
    const n = cv.width * cv.height * 4;
    if (!cv._buf || cv._buf.length !== n) {
      const old = cv._buf, oldW = cv._ow || 0;
      cv._buf = new Uint8ClampedArray(n);
      if (old) for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
        if (x >= oldW) continue;
        const o = (y * oldW + x) * 4, d = (y * cv.width + x) * 4;
        for (let k = 0; k < 4; k++) cv._buf[d + k] = old[o + k];
      }
      cv._ow = cv.width;
    }
    return cv._buf;
  };
  const ctx = {
    canvas: cv, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1,
    globalCompositeOperation: 'source-over', font: '', textAlign: '', textBaseline: '',
    imageSmoothingEnabled: false, filter: 'none', shadowBlur: 0, shadowColor: '#000',
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createPattern: () => null,
    measureText: () => ({ width: 4 }),
    fillRect(x, y, w, h) {
      const b = buf();
      const [r, g, bl, a0] = parseColor(ctx.fillStyle);
      const a = (a0 / 255) * ctx.globalAlpha;
      const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
      const x1 = Math.min(cv.width, Math.round(x + w)), y1 = Math.min(cv.height, Math.round(y + h));
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const i = (yy * cv.width + xx) * 4;
        if (ctx.globalCompositeOperation === 'source-atop') {
          if (b[i + 3] === 0) continue;                         // 目标透明→不留色
          b[i] = r; b[i + 1] = g; b[i + 2] = bl;                // 覆盖色（alpha 混合到 alpha 上）
          b[i + 3] = Math.max(b[i + 3], Math.round(255 * a));
        } else {
          const na = a + (b[i + 3] / 255) * (1 - a);
          if (na <= 0) continue;
          b[i] = (r * a + b[i] * (b[i + 3] / 255) * (1 - a)) / na;
          b[i + 1] = (g * a + b[i + 1] * (b[i + 3] / 255) * (1 - a)) / na;
          b[i + 2] = (bl * a + b[i + 2] * (b[i + 3] / 255) * (1 - a)) / na;
          b[i + 3] = Math.round(255 * na);
        }
      }
    },
    drawImage(img, dx, dy, dw, dh) {
      if (!img || !img._buf) return;
      const b = buf();
      const sw = img.width, sh = img.height;
      const w2 = dw === undefined ? sw : dw, h2 = dh === undefined ? sh : dh;
      const sx = w2 / sw, sy = h2 / sh;
      const a = ctx.globalAlpha;
      for (let y = 0; y < Math.round(h2); y++) for (let x = 0; x < Math.round(w2); x++) {
        const tx = Math.round(dx + x), ty = Math.round(dy + y);
        if (tx < 0 || ty < 0 || tx >= cv.width || ty >= cv.height) continue;
        const srcX = Math.floor(x / sx), srcY = Math.floor(y / sy);
        if (srcX < 0 || srcY < 0 || srcX >= sw || srcY >= sh) continue;
        const so = (srcY * sw + srcX) * 4, dof = (ty * cv.width + tx) * 4;
        const sa = (img._buf[so + 3] / 255) * a;
        if (sa <= 0) continue;
        if (ctx.globalCompositeOperation === 'source-atop' && b[dof + 3] === 0) continue;
        const da = b[dof + 3] / 255, na = sa + da * (1 - sa);
        b[dof] = (img._buf[so] * sa + b[dof] * da * (1 - sa)) / na;
        b[dof + 1] = (img._buf[so + 1] * sa + b[dof + 1] * da * (1 - sa)) / na;
        b[dof + 2] = (img._buf[so + 2] * sa + b[dof + 2] * da * (1 - sa)) / na;
        b[dof + 3] = Math.round(255 * na);
      }
    },
    getImageData(x, y, w, h) {
      const b = buf(), out = new Uint8ClampedArray(w * h * 4);
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
        const si = ((y + yy) * cv.width + (x + xx)) * 4, di = (yy * w + xx) * 4;
        for (let k = 0; k < 4; k++) out[di + k] = b[si + k];
      }
      return { width: w, height: h, data: out };
    },
    putImageData(im, x, y) {
      const b = buf();
      for (let yy = 0; yy < im.height; yy++) for (let xx = 0; xx < im.width; xx++) {
        const di = ((y + yy) * cv.width + (x + xx)) * 4, si = (yy * im.width + xx) * 4;
        for (let k = 0; k < 4; k++) b[di + k] = im.data[si + k];
      }
    },
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    save() {}, restore() {}, translate() {}, scale() {}, rotate() {}, beginPath() {}, closePath() {},
    moveTo() {}, lineTo() {}, arc() {}, rect() {}, fill() {}, stroke() {}, clearRect() {},
    fillText() {}, strokeText() {}
  };
  cv.getContext = () => ctx;
  buf();
  return cv;
}
function sandbox(code) { // 每次独立上下文（art.js 顶层零 DOM，document 只出现在函数体内）
  const doc = { createElement: t => (t === 'canvas' ? mkCanvas(1, 1) : {}), getElementById: () => null };
  return new Function('document', 'window', code
    + '\n;return {SPR,buildSprites};')(doc, {});
}

/* ---------- 构建 ---------- */
const A = sandbox(src);
A.buildSprites();
const S = A.SPR;

/* ---------- ① 存在性 + 键集合 ---------- */
console.log('\n① 键集合（对比 SPR.boss2）');
const keys2 = Object.keys(S.boss2).sort();
[['boss4', '冥古龙'], ['boss5', '圣裁者']].forEach(function (p) {
  const id = p[0];
  ok(!!S[id], 'SPR.' + id + '（' + p[1] + '）存在');
  if (!S[id]) return;
  const k = Object.keys(S[id]).sort();
  const miss = keys2.filter(x => k.indexOf(x) < 0), extra = k.filter(x => keys2.indexOf(x) < 0);
  ok(miss.length === 0 && extra.length === 0,
    id + ' 键集合 == boss2（缺:' + JSON.stringify(miss) + ' 多:' + JSON.stringify(extra) + '）');
  console.log('       键=' + k.join('/'));
});

/* ---------- ② 尺寸 ---------- */
console.log('\n② body 尺寸（引擎命中框依赖）');
ok(S.boss4.body[0].width === 64 && S.boss4.body[0].height === 48,
  'boss4.body[0] = ' + S.boss4.body[0].width + '×' + S.boss4.body[0].height + '（要 64×48）');
ok(S.boss5.body[0].width === 44 && S.boss5.body[0].height === 52,
  'boss5.body[0] = ' + S.boss5.body[0].width + '×' + S.boss5.body[0].height + '（要 44×52）');
[4, 5].forEach(function (i) {
  const P = S['boss' + i];
  ok(P.body[1].width === P.body[0].width && P.body[1].height === P.body[0].height, 'boss' + i + '.body[1] 同尺寸(呼吸帧)');
  ok(P.bodyRage[0].width === P.body[0].width && P.bodyRage[1].height === P.body[0].height, 'boss' + i + '.bodyRage 同尺寸');
  ok(P.core[0].width === 12 && P.core[0].height === 12, 'boss' + i + '.core 12×12');
  ok(P.eye.width === 12 && P.eye.height === 10, 'boss' + i + '.eye 12×10');
  ok(P.jaw[0].width === 20 && P.jaw[0].height === 8, 'boss' + i + '.jaw 20×8');
});

/* ---------- ③ 白剪影 ---------- */
console.log('\n③ 白剪影三件');
[4, 5].forEach(function (i) {
  const Wv = S['boss' + i + 'White'], P = S['boss' + i];
  ok(!!Wv, 'SPR.boss' + i + 'White 存在');
  if (!Wv) return;
  ok(Wv.body.width === P.body[0].width && Wv.body.height === P.body[0].height, 'boss' + i + 'White.body 同 body 尺寸');
  ok(Wv.arm.width === P.arm.width && Wv.arm.height === P.arm.height, 'boss' + i + 'White.arm 同 arm 尺寸');
  ok(Wv.jaw.width === P.jaw[1].width && Wv.jaw.height === P.jaw[1].height, 'boss' + i + 'White.jaw 同开口 jaw 尺寸');
});

/* ---------- ④ 像素审计 ---------- */
console.log('\n④ 像素审计（空白/纯黑/色彩数）');
[['boss2', 'boss2.body[0]'], ['boss4', 'boss4.body[0]'], ['boss4', 'boss4.bodyRage[0]'], ['boss5', 'boss5.body[0]'], ['boss5', 'boss5.bodyRage[0]']]
  .forEach(function (p) {
    const P = S[p[0]];
    const cv = p[1].indexOf('Rage') >= 0 ? P.bodyRage[0] : P.body[0];
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let solid = 0, pureBlack = 0; const colors = new Set();
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      solid++;
      if (d[i] === 0 && d[i + 1] === 0 && d[i + 2] === 0) pureBlack++;
      colors.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
    }
    const ratio = solid / (cv.width * cv.height);
    console.log('       ' + p[1] + '：实心 ' + (ratio * 100).toFixed(1) + '%  色数 ' + colors.size + '  纯黑 ' + pureBlack);
    ok(ratio > 0.30, p[1] + ' 实心率 >30%（不成一团也不空白）');
    ok(colors.size >= 7, p[1] + ' 色数 ≥7（有 顶高光/基色/暗部/骨白/熔岩 层次）');
    ok(pureBlack === 0, p[1] + ' 无纯黑 #000');
  });

/* ---------- ⑤ 调色板红线 ---------- */
console.log('\n⑤ 调色板红线（禁纯黑 #000 / 必须 6 位 hex）');
const pals = src.match(/const _P_(UND|SERA)\w* = \{[^}]*\}/g) || [];
ok(pals.length === 18, '新增 _P_UND* / _P_SERA* 调色板 18 条（实得 ' + pals.length + '）');
pals.forEach(function (line) {
  const name = (line.match(/const (_P_\w+)/) || [])[1];
  if (/#000(?!\w)/.test(line)) fails.push(name + ' 含纯黑 #000');
  const hexes = line.match(/'#[0-9a-f]{6}'/gi) || [];
  const all = line.match(/'#[^']*'/g) || [];
  if (hexes.length !== all.length) fails.push(name + ' 存在非 6 位 hex 色值');
});
ok(!pals.some(l => /#000(?!\w)/.test(l)), '调色板无 #000');
ok(!fails.length, '全部断言通过');

console.log('\n' + (fails.length ? 'FAIL(' + fails.length + '): ' + fails.join(' | ') : 'ALL OK（v7.9 boss4/boss5 精灵自检）'));
process.exit(fails.length ? 1 : 0);
