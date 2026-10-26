// tools/_v80_enemy_art.js —— v8.0 三种新小怪（铁甲虫 / 酸液花 / 跳跳蛛）精灵自检
// 跑法：node tools/_v80_enemy_art.js
// 覆盖：① 6 个契约键存在且类型正确（数组长度 2 / canvas 有 getContext）；
//      ② 尺寸精确（14×12 / 14×16 / 12×12，死亡帧同尺寸）——engine.js 命中框逐像素依赖，错 1px=看得见打不到；
//      ③ 四角 alpha===0（确认没整块填底，否则 ui.js 的 'foot' 锚点会画出一块方砖）；
//      ④ 色彩审计：描边色真实存在且非纯黑 / ≥3 个明度层级 / 左右非完全镜像（有朝向感）/ 无纯饱和原色；
//      ⑤ 两帧像素数据必须不同（否则动画是死的）；
//      ⑥ buildSprites() 增量 < 5ms（9 张 canvas）。
// 附带：把 9 张精灵放大 8 倍导出 testshots/_v80_enemies.png 供人工目检。
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'art.js'), 'utf8');
const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); console.log((cond ? '  ok   ' : '  FAIL ') + msg); };

/* ---------- 最小软件 canvas（本文件断言真实像素，故必须真填充而非 noop） ----------
 * 只实现 art.js 用到的面：fillRect / drawImage / getImageData / putImageData / fillStyle /
 * globalAlpha / globalCompositeOperation(source-over|source-atop)。手法照抄 tools/gate.js。 */
function parseColor(s) {
  if (typeof s !== 'string') return [0, 0, 0, 255];
  if (s[0] === '#') {
    if (s.length === 7) return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), 255];
    if (s.length === 4) return [parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16), parseInt(s[3] + s[3], 16), 255];
  }
  const m = /^rgba?\(([^)]+)\)$/.exec(s);
  if (m) {
    const p = m[1].split(',').map(v => parseFloat(v));
    return [p[0] | 0, p[1] | 0, p[2] | 0, p.length > 3 ? Math.round(p[3] * 255) : 255];
  }
  return [0, 0, 0, 255];
}
function mkCanvas(w, h) {
  const cv = { width: Math.max(1, w | 0), height: Math.max(1, h | 0) };
  const buf = () => {
    const n = cv.width * cv.height * 4;
    if (!cv._buf || cv._buf.length !== n) cv._buf = new Uint8ClampedArray(n);
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
          if (b[i + 3] === 0) continue;
          b[i] = r; b[i + 1] = g; b[i + 2] = bl;
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
    + '\n;return {SPR,buildSprites,_makeSprite,_BEETLE1,_BEETLE2,_BEETLE_DEAD,_P_BEETLE,_P_BEETLE_DEAD,'
    + '_SPITTER1,_SPITTER2,_SPITTER_DEAD,_P_SPITTER,_P_SPITTER_DEAD,'
    + '_HOPPER1,_HOPPER2,_HOPPER_DEAD,_P_HOPPER,_P_HOPPER_DEAD};')(doc, {});
}

/* ---------- 构建 ---------- */
const A = sandbox(src);
const t0 = process.hrtime.bigint();
A.buildSprites();
const t1 = process.hrtime.bigint();
const S = A.SPR;

/* 工具：取像素 / 色值 */
const px = cv => cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
const hex2rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

const SPEC = [
  { id: 'beetle', name: '铁甲虫', w: 14, h: 12, pal: '_P_BEETLE', dpal: '_P_BEETLE_DEAD' },
  { id: 'spitter', name: '酸液花', w: 14, h: 16, pal: '_P_SPITTER', dpal: '_P_SPITTER_DEAD' },
  { id: 'hopper', name: '跳跳蛛', w: 12, h: 12, pal: '_P_HOPPER', dpal: '_P_HOPPER_DEAD' }
];

/* ---------- ① 键存在 + 类型 ---------- */
console.log('\n① 契约键（6 个，名字一个都不能改）');
SPEC.forEach(function (s) {
  const arr = S[s.id], dead = S[s.id + 'Dead'];
  ok(Array.isArray(arr) && arr.length === 2, 'SPR.' + s.id + '（' + s.name + '）是长度 2 的数组（实得 ' +
    (Array.isArray(arr) ? '长度 ' + arr.length : typeof arr) + '）');
  if (Array.isArray(arr)) arr.forEach(function (c, i) {
    ok(c && typeof c.getContext === 'function' && typeof c.width === 'number' && typeof c.height === 'number',
      'SPR.' + s.id + '[' + i + '] 是 canvas（有 getContext/width/height）');
  });
  ok(dead && typeof dead.getContext === 'function' && typeof dead.width === 'number',
    'SPR.' + s.id + 'Dead 是 canvas（非数组）');
});

/* ---------- ② 尺寸 ---------- */
console.log('\n② 尺寸精确（engine.js 命中框：beetle 14×12 / spitter 14×16 / hopper 12×12）');
SPEC.forEach(function (s) {
  const arr = S[s.id] || [], dead = S[s.id + 'Dead'];
  const list = [['[' + 0 + ']', arr[0]], ['[1]', arr[1]], ['Dead', dead]];
  list.forEach(function (p) {
    const cv = p[1];
    if (!cv) { fails.push('SPR.' + s.id + p[0] + ' 缺失'); return; }
    ok(cv.width === s.w && cv.height === s.h,
      'SPR.' + s.id + p[0] + ' = ' + cv.width + '×' + cv.height + '（要 ' + s.w + '×' + s.h + '）');
  });
});

/* ---------- ③ 四角透明 ---------- */
console.log('\n③ 四角 alpha===0（没整块填底）');
SPEC.forEach(function (s) {
  const arr = S[s.id] || [], dead = S[s.id + 'Dead'];
  [['[0]', arr[0]], ['[1]', arr[1]], ['Dead', dead]].forEach(function (p) {
    const cv = p[1]; if (!cv) return;
    const d = px(cv), W = cv.width, H = cv.height;
    const a = (x, y) => d[(y * W + x) * 4 + 3];
    const corners = [a(0, 0), a(W - 1, 0), a(0, H - 1), a(W - 1, H - 1)];
    ok(corners.every(v => v === 0), 'SPR.' + s.id + p[0] + ' 四角 alpha = [' + corners.join(',') + ']');
  });
});

/* ---------- ④ 色彩审计 ---------- */
console.log('\n④ 色彩审计（描边/明度层级/朝向/禁色）');
SPEC.forEach(function (s) {
  const arr = S[s.id] || [], dead = S[s.id + 'Dead'];
  const palK = A[s.pal] && A[s.pal].k, deadK = A[s.dpal] && A[s.dpal].k;
  [['[0]', arr[0], palK], ['[1]', arr[1], palK], ['Dead', dead, deadK]].forEach(function (p) {
    const cv = p[1]; if (!cv) return;
    const d = px(cv), W = cv.width, H = cv.height;
    const tag = 'SPR.' + s.id + p[0];
    const colors = new Set(), lums = new Set();
    let solid = 0, pureBlack = 0, satPrimary = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      solid++;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      colors.add(r + ',' + g + ',' + b);
      lums.add(Math.round(lum(r, g, b) / 12));
      if (r === 0 && g === 0 && b === 0) pureBlack++;
      if ((r === 255 && g === 0 && b === 0) || (r === 0 && g === 255 && b === 0) || (r === 0 && g === 0 && b === 255)) satPrimary++;
    }
    const [kr, kg, kb] = hex2rgb(p[2]);
    const kKey = kr + ',' + kg + ',' + kb;
    const hasOutline = colors.has(kKey);
    ok(hasOutline, tag + ' 含描边色 ' + p[2] + '（' + solid + ' 个实心像素中命中）');
    ok(!(kr === 0 && kg === 0 && kb === 0), tag + ' 描边色不是纯黑（' + p[2] + '）');
    ok(pureBlack === 0, tag + ' 无纯黑 #000 像素（实得 ' + pureBlack + '）');
    ok(satPrimary === 0, tag + ' 无纯饱和原色 #ff0000/#00ff00/#0000ff（实得 ' + satPrimary + '）');
    ok(lums.size >= 3, tag + ' 明度层级 ' + lums.size + ' 档 ≥3（描边/主体/暗部/高光）');
    ok(colors.size >= 5, tag + ' 色数 ' + colors.size + ' ≥5（非平涂）');
    // 左右非镜像：逐像素比 (x,y) 与 (W-1-x,y)
    let mirrorDiff = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < Math.floor(W / 2); x++) {
      const i = (y * W + x) * 4, j = (y * W + (W - 1 - x)) * 4;
      if (d[i] !== d[j] || d[i + 1] !== d[j + 1] || d[i + 2] !== d[j + 2] || d[i + 3] !== d[j + 3]) mirrorDiff++;
    }
    ok(mirrorDiff >= 6, tag + ' 左右非镜像像素 ' + mirrorDiff + ' ≥6（有朝向感）');
    console.log('       ' + tag + '：实心 ' + solid + '/' + (W * H) + '  色数 ' + colors.size +
      '  明度档 ' + lums.size + '  镜像差 ' + mirrorDiff);
  });
});

/* ---------- ⑤ 两帧必须有差异 ---------- */
console.log('\n⑤ 两帧像素差异（否则动画是死的）');
SPEC.forEach(function (s) {
  const arr = S[s.id] || [];
  if (!arr[0] || !arr[1]) { fails.push('SPR.' + s.id + ' 帧缺失'); return; }
  const a = px(arr[0]), b = px(arr[1]);
  let diff = 0;
  for (let i = 0; i < a.length; i += 4)
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) diff++;
  ok(diff > 0, 'SPR.' + s.id + '[0] vs [1] 差异像素 ' + diff + ' >0（' + (diff / (arr[0].width * arr[0].height) * 100).toFixed(1) + '%）');
});

/* ---------- ⑥ buildSprites 增量 ---------- */
console.log('\n⑥ buildSprites() 增量（9 张 canvas）');
(function () { // 预热（JIT + 首次分配），避免首次调用把编译时间算进增量
  const w = sandbox(src);
  for (let i = 0; i < 3; i++) {
    w._makeSprite(w._BEETLE1, w._P_BEETLE); w._makeSprite(w._SPITTER1, w._P_SPITTER);
    w._makeSprite(w._HOPPER1, w._P_HOPPER);
  }
})();
const W9 = sandbox(src);
const N = 200;
const t3 = process.hrtime.bigint();
for (let i = 0; i < N; i++) {
  W9._makeSprite(W9._BEETLE1, W9._P_BEETLE); W9._makeSprite(W9._BEETLE2, W9._P_BEETLE);
  W9._makeSprite(W9._BEETLE_DEAD, W9._P_BEETLE_DEAD);
  W9._makeSprite(W9._SPITTER1, W9._P_SPITTER); W9._makeSprite(W9._SPITTER2, W9._P_SPITTER);
  W9._makeSprite(W9._SPITTER_DEAD, W9._P_SPITTER_DEAD);
  W9._makeSprite(W9._HOPPER1, W9._P_HOPPER); W9._makeSprite(W9._HOPPER2, W9._P_HOPPER);
  W9._makeSprite(W9._HOPPER_DEAD, W9._P_HOPPER_DEAD);
}
const t4 = process.hrtime.bigint();
const incMs = Number(t4 - t3) / 1e6 / N;
const fullMs = Number(t1 - t0) / 1e6;
console.log('       全量 buildSprites()（含主角/皮肤/全部机关）：' + fullMs.toFixed(2) + ' ms（软件 canvas 模拟）');
console.log('       仅 9 张新 sprite：' + (incMs * 1000).toFixed(1) + ' µs/次（' + N + ' 次均值）');
ok(incMs < 5, '新增 9 张 sprite 增量 ' + incMs.toFixed(3) + ' ms < 5 ms');
console.log('       （全量 buildSprites 含主角/皮肤/机关共 300+ 张，非本工单增量，仅作参考）');

/* ---------- 导出 8× 对比图 ---------- */
const FONT = { // 3×5 像素字模（仅本报告图用）
  A: '010101111101101', B: '110101110101110', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', H: '101101111101101', I: '111010010010111', L: '100100100100111',
  O: '010101101101010', P: '110101110100100', R: '110101110101101', S: '011100010001110',
  T: '111010010010010', '0': '111101101101111', '1': '010110010010111', '2': '111001111100111',
  '3': '111001011001111'
};
const SCALE = 8, PAD = 10, LBL = 44, TOP = 22, STRIP = 112;
const cols = SPEC.map(s => s.w * SCALE + PAD * 2);
const rowsH = [0, 1, 2].map(() => Math.max.apply(null, SPEC.map(s => s.h * SCALE + PAD * 2)));
const sheetW = LBL + cols.reduce((a, b) => a + b, 0);
const sheetH = TOP + rowsH.reduce((a, b) => a + b, 0) + STRIP;
const sheet = new Uint8ClampedArray(sheetW * sheetH * 4);
const put = (x, y, c) => { if (x < 0 || y < 0 || x >= sheetW || y >= sheetH) return; const i = (y * sheetW + x) * 4; sheet[i] = c[0]; sheet[i + 1] = c[1]; sheet[i + 2] = c[2]; sheet[i + 3] = 255; };
const rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, c); };
const text = (str, x, y, c, sc) => {
  for (let n = 0; n < str.length; n++) {
    const g = FONT[str[n]]; if (!g) continue;
    for (let r = 0; r < 5; r++) for (let q = 0; q < 3; q++)
      if (g[r * 3 + q] === '1') rect(x + n * 4 * sc + q * sc, y + r * sc, sc, sc, c);
  }
};
rect(0, 0, sheetW, sheetH, [20, 18, 28]);                     // 深底（模拟游戏内夜景，检查描边是否糊）
SPEC.forEach(function (s, ci) { text(s.id.toUpperCase(), LBL + cols.slice(0, ci).reduce((a, b) => a + b, 0) + PAD, 6, [210, 200, 240], 2); });
['F0', 'F1', 'DEAD'].forEach(function (l, ri) { text(l, 8, TOP + rowsH.slice(0, ri).reduce((a, b) => a + b, 0) + PAD, [150, 160, 190], 2); });
SPEC.forEach(function (s, ci) {
  const x0 = LBL + cols.slice(0, ci).reduce((a, b) => a + b, 0);
  const arr = S[s.id] || [], list = [arr[0], arr[1], S[s.id + 'Dead']];
  list.forEach(function (cv, ri) {
    const y0 = TOP + rowsH.slice(0, ri).reduce((a, b) => a + b, 0);
    rect(x0 + 1, y0 + 1, cols[ci] - 2, rowsH[ri] - 2, [30, 27, 42]);          // 单元底
    for (let x = 0; x < cols[ci] - 2; x += 8) { put(x0 + 1 + x, y0 + 1, [44, 40, 62]); put(x0 + 1 + x, y0 + rowsH[ri] - 2, [44, 40, 62]); }
    if (!cv) return;
    const d = px(cv), W = cv.width, H = cv.height;
    const ox = x0 + Math.round((cols[ci] - W * SCALE) / 2), oy = y0 + Math.round((rowsH[ri] - H * SCALE) / 2);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4; if (d[i + 3] === 0) continue;
      rect(ox + x * SCALE, oy + y * SCALE, SCALE, SCALE, [d[i], d[i + 1], d[i + 2]]);
    }
    // 精灵包围盒描一圈亮线，便于目检"尺寸是否顶格"
    const c = [90, 80, 130];
    for (let x = 0; x < W * SCALE; x++) { put(ox + x, oy - 1, c); put(ox + x, oy + H * SCALE, c); }
    for (let y = 0; y < H * SCALE; y++) { put(ox - 1, oy + y, c); put(ox + W * SCALE, oy + y, c); }
  });
});
/* 底部 1× / 2× 实尺寸条：确认在游戏内真实像素密度下描边不糊、腿不断 */
const sy = TOP + rowsH.reduce((a, b) => a + b, 0);
text('1X 2X', 8, sy + 8, [150, 160, 190], 2);
rect(0, sy, sheetW, 1, [44, 40, 62]);
let sx = 60;
SPEC.forEach(function (s) {
  const arr = S[s.id] || [];
  [1, 2].forEach(function (sc) {
    arr.forEach(function (cv, fi) {
      if (!cv) return;
      const d = px(cv), W = cv.width, H = cv.height;
      const ox = sx, oy = sy + 26 + fi * (H * sc + 3);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4; if (d[i + 3] === 0) continue;
        rect(ox + x * sc, oy + y * sc, sc, sc, [d[i], d[i + 1], d[i + 2]]);
      }
    });
    sx += s.w * sc + 10;
  });
  sx += 8;
});

/* 最小 PNG 编码（zlib 内置，无三方依赖） */
const CRC_T = (function () {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))
  ]);
}
const outDir = path.join(ROOT, 'testshots');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, '_v80_enemies.png');
fs.writeFileSync(outFile, encodePNG(sheetW, sheetH, sheet));
console.log('\n对比图：' + path.relative(ROOT, outFile) + '（' + sheetW + '×' + sheetH + '，每格 ' + SCALE + '×）');

console.log('\n' + (fails.length ? 'FAIL(' + fails.length + '): ' + fails.join(' | ') : 'ALL OK（v8.0 beetle/spitter/hopper 精灵自检）'));
process.exit(fails.length ? 1 : 0);
