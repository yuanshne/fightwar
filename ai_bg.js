/* ai_bg.js — AI 场景背景 + 青玉龙图接入（不改 art.js / art_external.js / ui.js）
 * ---------------------------------------------------------------------------
 * 加载顺序：art.js → art_remaster.js → art_external.js → 本文件（最外层包装 buildThemeArt）。
 * 三件事：
 *   1. 异步加载 assets/ai/bg/*.jpg 与 assets/ai/vfx/dragon.png；
 *   2. 预烘焙 512×224 的 far / near（含主题调色），替换 art.bg.far / bg.near，保留 mid / fore；
 *   3. 暴露 window.PQAI_BG 供 combatfx.js 取龙图（dragon / dragonGold）。
 * 兜底：图片缺失、解码失败、未就绪或任何异常 → 原样返回程序化 art，绝不外抛。
 * ------------------------------------------------------------------------- */
(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var W = 512, H = 224;
  var BASE = ['assets/ai/', './assets/ai/', '../assets/ai/'];

  var state = {
    ready: false,
    started: false,
    installed: false,
    imgs: {},
    baked: {},
    waiting: {},
    failed: {},
    queue: [],
    done: 0,
    total: 0
  };

  var API = {
    title: null, mountain: null, palace: null, lava: null, sky: null, dragon: null,
    dragonGold: null, dragonHi: null, ready: false
  };
  window.PQAI_BG = API;

  /* ==================== 基础工具 ==================== */
  function makeCanvas(w, h) {
    try {
      if (typeof _makeCanvas === 'function') return _makeCanvas(w, h);
    } catch (e) { /* 落到本地实现 */ }
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function ctx2d(c) {
    try { return c.getContext('2d'); } catch (e) { return null; }
  }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ==================== 图片加载（多基路径兜底） ==================== */
  var FILES = {
    title: { path: 'bg/title_768x432.jpg', kind: 'title' },
    mountain: { path: 'bg/mountain_768x432.jpg', kind: 'bg' },
    palace: { path: 'bg/palace_768x432.jpg', kind: 'bg' },
    lava: { path: 'bg/lava_768x432.jpg', kind: 'bg' },
    sky: { path: 'bg/sky_768x432.jpg', kind: 'bg' }
    // 龙图（vfx/dragon.png，1024² ~1.09MB）移出首屏关键路径：仅 Boss 龙吟演出/
    // 立绘兜底读取，由 ensureDragon() 在背景就绪后懒加载，未到位时消费方回退程序化龙。
  };

  function loadOne(name, i) {
    var def = FILES[name];
    if (!def) { settle(name, null); return; }
    if (i >= BASE.length) { settle(name, null); return; }
    var im = new Image();
    im.onload = function () {
      if (!im.naturalWidth && !im.width) { loadOne(name, i + 1); return; }
      state.imgs[name] = im;
      settle(name, im);
    };
    im.onerror = function () { loadOne(name, i + 1); };
    try { im.src = BASE[i] + def.path; } catch (e) { loadOne(name, i + 1); }
  }

  function settle(name, img) {
    if (state.waiting[name]) return;
    state.waiting[name] = true;
    state.done++;
    if (!img) state.failed[name] = true;
    if (state.done >= state.total && !state.ready) bakeAll();
  }

  function start() {
    if (state.started) return;
    state.started = true;
    for (var key in FILES) {
      if (Object.prototype.hasOwnProperty.call(FILES, key)) state.total++;
    }
    for (var k in FILES) {
      if (Object.prototype.hasOwnProperty.call(FILES, k)) loadOne(k, 0);
    }
  }

  /* ==================== 烘焙 ==================== */
  function imgSize(img) {
    var w = img.naturalWidth || img.width || 0;
    var h = img.naturalHeight || img.height || 0;
    return (w > 0 && h > 0) ? { w: w, h: h } : null;
  }

  /* 16:9 原图 → 512×224：按目标比例做 cover 裁切（纵向偏上，保留天空），等比缩放不压扁 */
  function drawCover(g, img, zoom) {
    var sz = imgSize(img);
    if (!sz) return false;
    var z = zoom || 1;
    var sw = sz.w / z, sh = sz.h / z;
    var sx = (sz.w - sw) / 2;
    var aspect = W / H;
    var ch = sw / aspect;
    if (ch > sh) ch = sh;
    var sy = (sz.h - sh) / 2 + (sh - ch) * 0.34;
    try {
      g.drawImage(img, sx, sy, sw, ch, 0, 0, W, H);
      return true;
    } catch (e) { return false; }
  }

  function tint(g, name) {
    g.save();
    if (name === 'ice' || name === 'snow') {
      g.globalCompositeOperation = 'soft-light';
      g.globalAlpha = 0.85;
      g.fillStyle = '#8fc4ff';
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 0.10;
      g.fillStyle = '#dff1ff';
      g.fillRect(0, 0, W, Math.round(H * 0.45));
    } else if (name === 'desert') {
      g.globalCompositeOperation = 'soft-light';
      g.globalAlpha = 0.90;
      g.fillStyle = '#f0c078';
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 0.07;
      g.fillStyle = '#ffe0a0';
      g.fillRect(0, 0, W, H);
    } else if (name === 'night') {
      g.globalCompositeOperation = 'multiply';
      g.globalAlpha = 1;
      g.fillStyle = '#2a3468';
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 0.16;
      g.fillStyle = '#0a1230';
      g.fillRect(0, 0, W, H);
    }
    g.restore();
  }

  function bottomShade(g, near) {
    var grad = g.createLinearGradient(0, H * 0.52, 0, H);
    grad.addColorStop(0, 'rgba(6,6,16,0)');
    grad.addColorStop(1, near ? 'rgba(4,4,12,0.72)' : 'rgba(4,4,12,0.48)');
    g.fillStyle = grad;
    g.fillRect(0, Math.floor(H * 0.52), W, H - Math.floor(H * 0.52));
    // 顶端一层极淡天光，衔接 HUD
    var top = g.createLinearGradient(0, 0, 0, H * 0.22);
    top.addColorStop(0, 'rgba(255,255,255,0.10)');
    top.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = top;
    g.fillRect(0, 0, W, Math.floor(H * 0.22));
  }

  function bakePair(img, name) {
    if (!img) return null;
    var far = makeCanvas(W, H), gf = ctx2d(far);
    var near = makeCanvas(W, H), gn = ctx2d(near);
    if (!gf || !gn) return null;
    gf.imageSmoothingEnabled = true;
    gn.imageSmoothingEnabled = true;

    if (!drawCover(gf, img, 1)) return null;
    tint(gf, name);
    bottomShade(gf, false);

    if (!drawCover(gn, img, 1.15)) return { far: far, near: far };
    tint(gn, name);
    gn.fillStyle = 'rgba(6,8,20,0.46)';       // 同图更暗做近景
    gn.fillRect(0, 0, W, H);
    bottomShade(gn, true);

    return { far: far, near: near };
  }

  /* 主题族 → 烘焙键 */
  var MAP = {
    grass: 'mountain', wind: 'mountain', sea: 'mountain', sky: 'sky',
    cave: 'palace', factory: 'palace', tower: 'palace', mirror: 'palace',
    castle: 'palace', aether: 'palace', bell: 'palace', anthem: 'palace',
    husk: 'palace', abyss: 'palace',
    lava: 'lava', ember: 'lava', nether: 'lava',
    ice: 'ice', snow: 'ice', desert: 'desert',
    night: 'night', star: 'night', maw: 'night', boss: 'night'
  };

  function themeKey(key) {
    var themes = null;
    try { if (typeof THEMES !== 'undefined') themes = THEMES; } catch (e) { themes = null; }
    if (!themes) themes = window.THEMES;
    if (themes && Object.prototype.hasOwnProperty.call(themes, key)) return key;
    return 'grass';
  }

  function bakeDragon(img) {
    var sz = imgSize(img);
    if (!sz) return;
    var hi = makeCanvas(1024, 1024), gh = ctx2d(hi);
    if (gh) {
      gh.imageSmoothingEnabled = true;
      try { gh.drawImage(img, 0, 0, 1024, 1024); } catch (e) { /* 静默 */ }
    }
    var mid = makeCanvas(256, 256), gm = ctx2d(mid);
    if (!gm) return;
    gm.imageSmoothingEnabled = true;
    try { gm.drawImage(img, 0, 0, 256, 256); } catch (e) { return; }

    // 金色残影版：multiply 只染亮部，纯黑底保持为黑（配合 lighter 混合不产生方框）
    var gold = makeCanvas(256, 256), gg = ctx2d(gold);
    if (gg) {
      gg.drawImage(mid, 0, 0);
      gg.globalCompositeOperation = 'multiply';
      gg.fillStyle = '#ffc25e';
      gg.fillRect(0, 0, 256, 256);
      gg.globalCompositeOperation = 'source-over';
    }

    API.dragon = mid;
    API.dragonGold = (gg ? gold : mid);
    API.dragonHi = hi;
  }

  function bakeAll() {
    if (state.ready) return;
    try {
      var imgs = state.imgs;
      state.baked.mountain = bakePair(imgs.mountain, '');
      state.baked.ice = bakePair(imgs.mountain, 'ice');
      state.baked.desert = bakePair(imgs.mountain, 'desert');
      state.baked.night = bakePair(imgs.mountain, 'night');
      state.baked.palace = bakePair(imgs.palace, '');
      state.baked.lava = bakePair(imgs.lava, '');
      state.baked.sky = bakePair(imgs.sky, '');

      if (imgs.title) {
        var t = makeCanvas(768, 432), gt = ctx2d(t);
        if (gt) {
          gt.imageSmoothingEnabled = true;
          try { gt.drawImage(imgs.title, 0, 0, 768, 432); } catch (e) { /* 静默 */ }
          API.title = t;
        }
      }
      state.ready = true;
      API.ready = true;

      // 暴露可直接引用的字段（同一份 canvas，不再复制）
      API.mountain = state.baked.mountain ? state.baked.mountain.far : null;
      API.palace = state.baked.palace ? state.baked.palace.far : null;
      API.lava = state.baked.lava ? state.baked.lava.far : null;
      API.sky = state.baked.sky ? state.baked.sky.far : null;
      API.layers = state.baked;

      flush();
      setTimeout(ensureDragon, 1000); // 背景就绪 1s 后再取龙图，避开首屏解码高峰
    } catch (e) {
      state.ready = false;
      API.ready = false;
    }
  }

  /* 龙图懒加载：多基路径兜底；失败静默，API.dragon 保持 null 由消费方回退程序化龙 */
  var dragonQueued = false;
  function ensureDragon() {
    if (dragonQueued) return;
    dragonQueued = true;
    var bi = 0;
    var im = new Image();
    function attempt() {
      if (bi >= BASE.length) return;
      im.onload = function () {
        if (!im.naturalWidth && !im.width) { bi++; attempt(); return; }
        try { bakeDragon(im); } catch (e) { /* 静默 */ }
      };
      im.onerror = function () { bi++; if (bi < BASE.length) attempt(); };
      try { im.src = BASE[bi] + 'vfx/dragon.png'; } catch (e) { bi++; attempt(); }
    }
    attempt();
  }
  API.ensureDragon = ensureDragon;

  function flush() {
    var q = state.queue;
    state.queue = [];
    for (var i = 0; i < q.length; i++) {
      try { q[i](); } catch (e) { /* 静默 */ }
    }
  }

  /* ==================== 包装 buildThemeArt ==================== */
  function decorate(art, key) {
    if (!state.ready || !art || typeof art !== 'object') return art;
    if (!art.bg || typeof art.bg !== 'object') return art;
    var name = MAP[themeKey(key)];
    if (!name) return art;
    var pair = state.baked[name];
    if (!pair) return art;
    art.bg.far = pair.far;
    art.bg.near = pair.near;
    // AI 背景已经包含远近层次；旧程序化 mid/fore 会出现扁平土黄台块，
    // 看起来像可站立平台却没有碰撞，直接交给 AI 背景接管。
    art.bg.mid = null;
    art.bg.fore = null;
    return art;
  }

  function install() {
    if (state.installed) return true;
    var orig = null;
    try { if (typeof buildThemeArt === 'function') orig = buildThemeArt; } catch (e) { orig = null; }
    if (!orig) orig = window.buildThemeArt;
    if (typeof orig !== 'function') return false;
    if (orig.__aiBg) { state.installed = true; return true; }

    var wrapped = function (themeKeyIn) {
      var art = orig(themeKeyIn);
      try { decorate(art, themeKeyIn); } catch (e) { /* AI 背景失败不影响原美术 */ }
      return art;
    };
    wrapped.__aiBg = true;

    try { buildThemeArt = wrapped; } catch (e) { /* 常量绑定时走 window */ }
    try { window.buildThemeArt = wrapped; } catch (e2) { /* 静默 */ }
    state.installed = true;
    return true;
  }

  /* 就绪回调（外部模块可等待） */
  API.onReady = function (fn) {
    if (typeof fn !== 'function') return;
    if (state.ready) { try { fn(); } catch (e) { /* 静默 */ } return; }
    state.queue.push(fn);
  };

  try {
    if (!install()) window.addEventListener('load', function () { try { install(); } catch (e) { /* 静默 */ } }, { once: true });
  } catch (e) { /* 静默 */ }
  try { start(); } catch (e2) { /* 静默 */ }
})();
