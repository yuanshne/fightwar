// tools/_v10_art.js —— v10 危险物素材（地刺 SPR.spike / Boss 分身 SPR.bossGhost）自检
// 跑法：node tools/_v10_art.js（退出码 0=全过，1=有失败）
// 覆盖：
//   ① SPR.spike 是长度 4 的数组，每帧 20×24；SPR.bossGhost 是 canvas 52×48（与 Boss 本体同尺寸）；
//   ② 四角 alpha===0（没整块填底，否则 ui 贴上去是一块紫/灰方块）；
//   ③ 四帧「越长越往上」：逐帧统计不透明像素最上行 y，断言 y0 > y1 > y2 >= y3
//      —— ui.js:1791 把整帧纵向压到 20×hh 再贴，只有底对齐+逐帧变高，压缩后才读得出「长出来」；
//   ④ 色彩审计：每张 ≥3 个明度层级、描边色存在且非纯黑、无纯黑像素；
//   ⑤ buildSprites() 增量 < 3ms（A/B：同源去掉两行注册，各自反复重建取中位数）；
//   ⑥ 导出 testshots/_v10_hazard_art.png（6× 放大 + 1×/2× 实尺寸条）供目检。
// 沙箱手法照抄 tools/gate.js / tools/_v80_enemy_art.js：art.js 顶层零 DOM，document 只出现在函数体内，
// 故注入最小 document 后整份源码作为一个函数体执行（经典 script 同作用域）。
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
 * globalAlpha / globalCompositeOperation(source-over|source-atop)。 */
const _colorCache = new Map(); // 颜色串 → rgba（fillRect 每次都要解析，缓存后 mock 才不至于把解析开销算进增量）
function parseColor(s) {
  if (typeof s !== 'string') return [0, 0, 0, 255];
  const hit = _colorCache.get(s);
  if (hit) return hit;
  let out = [0, 0, 0, 255];
  if (s[0] === '#') {
    if (s.length === 7) out = [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), 255];
    else if (s.length === 4) out = [parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16), parseInt(s[3] + s[3], 16), 255];
  } else {
    const m = /^rgba?\(([^)]+)\)$/.exec(s);
    if (m) {
      const p = m[1].split(',').map(v => parseFloat(v));
      out = [p[0] | 0, p[1] | 0, p[2] | 0, p.length > 3 ? Math.round(p[3] * 255) : 255];
    }
  }
  _colorCache.set(s, out);
  return out;
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
function sandbox(code) { // 每次独立上下文（art.js 顶层零 DOM）
  const doc = { createElement: t => (t === 'canvas' ? mkCanvas(1, 1) : {}), getElementById: () => null };
  return new Function('document', 'window', code
    + '\n;return {SPR,buildSprites,_spikeGrid,_spikeFrames,_bossGhostGrid,_bossGhostSprite,_P_SPIKE,_P_BOSSGHOST};')(doc, {});
}

const A = sandbox(src);
A.buildSprites();
const S = A.SPR;

/* 工具 */
const px = cv => cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
const hex2rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const topRow = cv => { // 不透明像素的最上行 y（无像素返回 -1）
  const d = px(cv), W = cv.width, H = cv.height;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 0) return y;
  return -1;
};

/* ---------- ① 存在性 + 尺寸 ---------- */
console.log('\n① 契约键与尺寸');
const SP = S.spike;
ok(Array.isArray(SP), 'SPR.spike 是数组（实得 ' + (Array.isArray(SP) ? '数组' : typeof SP) + '）');
ok(Array.isArray(SP) && SP.length === 4, 'SPR.spike.length = ' + (SP ? SP.length : '-') + '（要 4）');
(SP || []).forEach(function (cv, i) {
  ok(cv && typeof cv.getContext === 'function', 'SPR.spike[' + i + '] 是 canvas');
  if (cv) ok(cv.width === 20 && cv.height === 24, 'SPR.spike[' + i + '] = ' + cv.width + '×' + cv.height + '（要 20×24）');
});
const GH = S.bossGhost;
ok(!!GH && typeof GH.getContext === 'function' && typeof GH.width === 'number', 'SPR.bossGhost 是 canvas（整张画布形态）');
ok(!!GH && GH.width === 52 && GH.height === 48, 'SPR.bossGhost = ' + (GH ? GH.width + '×' + GH.height : '-') + '（要 52×48，与 Boss 本体同尺寸）');

/* ---------- ② 四角透明 ---------- */
console.log('\n② 四角 alpha===0（没有整块填底）');
const cornerList = (SP || []).map((cv, i) => ['SPR.spike[' + i + ']', cv]);
cornerList.push(['SPR.bossGhost', GH]);
cornerList.forEach(function (p) {
  const cv = p[1]; if (!cv) return;
  const d = px(cv), W = cv.width, H = cv.height;
  const a = (x, y) => d[(y * W + x) * 4 + 3];
  const c = [a(0, 0), a(W - 1, 0), a(0, H - 1), a(W - 1, H - 1)];
  ok(c.every(v => v === 0), p[0] + ' 四角 alpha = [' + c.join(',') + ']');
});

/* ---------- ③ 逐帧高度递增 ---------- */
console.log('\n③ 四帧「越长越往上」（ui 会把整帧压到 20×hh，必须底对齐）');
const tops = (SP || []).map(topRow);
console.log('       最上行 y = [' + tops.join(', ') + ']（越小=越高）');
ok(tops[0] > tops[1] && tops[1] > tops[2] && tops[2] >= tops[3],
  'y0 > y1 > y2 >= y3（实得 ' + tops.join(' > ') + '）');
(SP || []).forEach(function (cv, i) {
  if (!cv) return;
  const d = px(cv), W = cv.width, H = cv.height;
  let bottom = 0;
  for (let x = 0; x < W; x++) if (d[((H - 1) * W + x) * 4 + 3] > 0) bottom++;
  ok(bottom > 0, 'SPR.spike[' + i + '] 底边（y=' + (H - 1) + '）有 ' + bottom + ' 个不透明像素（贴地不悬空）');
});

/* ---------- ④ 色彩审计 ---------- */
console.log('\n④ 色彩审计（明度层级 / 描边色 / 禁纯黑）');
const auditList = (SP || []).map((cv, i) => ['SPR.spike[' + i + ']', cv, A._P_SPIKE.k]);
auditList.push(['SPR.bossGhost', GH, A._P_BOSSGHOST.k]);
auditList.forEach(function (p) {
  const cv = p[1]; if (!cv) return;
  const d = px(cv), W = cv.width, H = cv.height;
  const colors = new Set(), lums = new Set();
  let solid = 0, pureBlack = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    solid++;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    colors.add(r + ',' + g + ',' + b);
    lums.add(Math.round(lum(r, g, b) / 14));
    if (r === 0 && g === 0 && b === 0) pureBlack++;
  }
  const [kr, kg, kb] = hex2rgb(p[2]);
  const kKey = kr + ',' + kg + ',' + kb;
  ok(colors.has(kKey), p[0] + ' 含 1px 描边色 ' + p[2] + '（' + solid + ' 实心像素中命中）');
  ok(!(kr === 0 && kg === 0 && kb === 0), p[0] + ' 描边色不是纯黑（' + p[2] + '）');
  ok(pureBlack === 0, p[0] + ' 无纯黑 #000 像素（实得 ' + pureBlack + '）');
  ok(lums.size >= 3, p[0] + ' 明度层级 ' + lums.size + ' 档 ≥3（描边/主体/暗部/高光）');
  ok(colors.size >= 4, p[0] + ' 色数 ' + colors.size + ' ≥4（非平涂）');
  console.log('       ' + p[0] + '：实心 ' + solid + '/' + (W * H) + '  色数 ' + colors.size +
    '  明度档 ' + lums.size + '  描边命中 ' + (colors.has(kKey) ? 'Y' : 'N'));
});

/* ---------- ⑤ buildSprites 增量 ---------- */
console.log('\n⑤ buildSprites() 增量（本工单新增的 5 张 canvas）');
/* 口径同 tools/_v80_enemy_art.js：直接计「新增的那几次建图」，而不是整包 A/B 相减——
 * 全量 buildSprites 是 7~18ms 级（300+ 张），噪声 ±2ms 会把 1ms 级的增量淹掉（实测 A/B 差值正负都出现过）。 */
const sbW = sandbox(src);
sbW.buildSprites();                                      // 预热（JIT + 首次分配）
const N = 15, samples = [];
for (let i = 0; i < N; i++) {
  const t0 = process.hrtime.bigint();
  sbW._spikeFrames(); sbW._bossGhostSprite();
  samples.push(Number(process.hrtime.bigint() - t0) / 1e6);
}
samples.sort((a, b) => a - b);
const incMs = samples[samples.length >> 1];
const sbT = sandbox(src);
const tf0 = process.hrtime.bigint();
sbT.buildSprites();
const fullMs = Number(process.hrtime.bigint() - tf0) / 1e6;
console.log('       全量 buildSprites()（软件 canvas，含主角/皮肤/全部 Boss/机关）：' + fullMs.toFixed(2) + ' ms（仅参考）');
console.log('       本工单 5 张 canvas：' + (incMs * 1000).toFixed(0) + ' µs/次（' + N + ' 次中位数）');
ok(incMs < 3, '增量 ' + incMs.toFixed(3) + ' ms < 3 ms');

/* ---------- ⑥ 导出 6× 目检图 ---------- */
const FONT = { // 3×5 像素字模（仅本报告图用，抄自 art.js _FONT）
  A: '010101111101101', B: '110101110101110', C: '011100100100011', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111',
  K: '101101110101101', M: '101111111101101', N: '110111101101101', O: '010101101101010',
  P: '110101110100100', S: '011100010001110', T: '111010010010010', U: '101101101101111',
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001011001111'
};
const SCALE = 6, CELL = 16, LBL = 30, TOP = 30, STRIP = 96;
const cells = (SP || []).map((cv, i) => ({ cv: cv, label: 'F' + i }));
cells.push({ cv: GH, label: 'GHOST' });
const colsW = cells.map(c => (c.cv ? c.cv.width * SCALE : 120) + CELL * 2);
const rowH = Math.max.apply(null, cells.map(c => (c.cv ? c.cv.height * SCALE : 288))) + CELL * 2 + LBL;
const sheetW = CELL + colsW.reduce((a, b) => a + b, 0) + CELL;
const sheetH = TOP + rowH + STRIP;
const sheet = new Uint8ClampedArray(sheetW * sheetH * 4);
const put = (x, y, c) => {
  if (x < 0 || y < 0 || x >= sheetW || y >= sheetH) return;
  const i = (y * sheetW + x) * 4;
  sheet[i] = c[0]; sheet[i + 1] = c[1]; sheet[i + 2] = c[2]; sheet[i + 3] = 255;
};
const rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, c); };
const text = (str, x, y, c, sc) => {
  for (let n = 0; n < str.length; n++) {
    const g = FONT[str[n]]; if (!g) continue;
    for (let r = 0; r < 5; r++) for (let q = 0; q < 3; q++)
      if (g[r * 3 + q] === '1') rect(x + n * 4 * sc + q * sc, y + r * sc, sc, sc, c);
  }
};
rect(0, 0, sheetW, sheetH, [22, 20, 32]);                       // 深底：模拟游戏内夜景，检查描边是否糊
text('SPIKE 4F', CELL, 8, [214, 206, 236], 2);
text('BOSSGHOST 52X48', CELL + colsW[0] * 4, 8, [214, 206, 236], 2);
cells.forEach(function (c, ci) {
  const x0 = CELL + colsW.slice(0, ci).reduce((a, b) => a + b, 0);
  const cw = colsW[ci], ch = rowH;
  rect(x0 + 1, TOP + 1, cw - 2, ch - 2, [30, 27, 42]);          // 单元底
  for (let x = 0; x < cw - 2; x += 8) {                          // 棋盘格底纹（对齐 8px 网格，便于数像素）
    put(x0 + 1 + x, TOP + 1, [44, 40, 62]);
    put(x0 + 1 + x, TOP + ch - 2, [44, 40, 62]);
  }
  text(c.label, x0 + 10, TOP + 6, [150, 160, 190], 2);
  if (!c.cv) return;
  const d = px(c.cv), W = c.cv.width, H = c.cv.height;
  const ox = x0 + Math.round((cw - W * SCALE) / 2);
  const oy = TOP + LBL + Math.round((ch - LBL - H * SCALE) / 2);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4; if (d[i + 3] === 0) continue;
    rect(ox + x * SCALE, oy + y * SCALE, SCALE, SCALE, [d[i], d[i + 1], d[i + 2]]);
  }
  const edge = [92, 82, 132];                                    // 包围盒 1px 亮线：确认「顶格/底对齐」
  for (let x = 0; x < W * SCALE; x++) { put(ox + x, oy - 1, edge); put(ox + x, oy + H * SCALE, edge); }
  for (let y = 0; y < H * SCALE; y++) { put(ox - 1, oy + y, edge); put(ox + W * SCALE, oy + y, edge); }
});
/* 底部 1× / 2× 实尺寸条：确认游戏内真实像素密度下描边不糊、尖刺不糊成一根灰条 */
const sy = TOP + rowH;
text('1X 2X', CELL, sy + 6, [150, 160, 190], 2);
rect(0, sy, sheetW, 1, [44, 40, 62]);
let sx = CELL + 40;
cells.forEach(function (c) {
  if (!c.cv) return;
  const d = px(c.cv), W = c.cv.width, H = c.cv.height;
  [1, 2].forEach(function (sc) {
    const ox = sx, oy = sy + 24;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4; if (d[i + 3] === 0) continue;
      rect(ox + x * sc, oy + y * sc, sc, sc, [d[i], d[i + 1], d[i + 2]]);
    }
    sx += W * sc + 12;
  });
});
/* 最小 PNG 编码（zlib 内置，无三方依赖；照抄 tools/_v80_enemy_art.js） */
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
const outFile = path.join(outDir, '_v10_hazard_art.png');
fs.writeFileSync(outFile, encodePNG(sheetW, sheetH, sheet));
console.log('\n对比图：' + path.relative(ROOT, outFile) + '（' + sheetW + '×' + sheetH + '，主图 ' + SCALE + '×）');

console.log('\n' + (fails.length ? 'FAIL(' + fails.length + '): ' + fails.join(' | ')
  : 'ALL OK（v10 spike / bossGhost 素材自检）'));
process.exit(fails.length ? 1 : 0);
