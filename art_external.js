/* art_external.js — 外部素材（Kenney CC0 bake）替换/增强瓦片与背景
 * ---------------------------------------------------------------------------
 * 加载顺序：art.js → art_remaster.js → 本文件（最外层再包一次 buildThemeArt）。
 * 只做两件事，全部构建期预烘焙，运行期不创建 canvas：
 *   1. 从 assets/kenney/tiles.png（18px 网格）按 manifest 名称取 16×16 格，
 *      裁掉四周 1px，按主题族映射到 art.tiles 各键，并做轻 tint + 1px 受光/暗影；
 *   2. 用 assets/kenney/bg/bg-*.png 生成 512×224 的 far / near 两层背景，
 *      mid / fore 保留 art_remaster 的结果。
 * 兜底：PQASSETS 缺失、图片未就绪或任何异常时原样返回程序化 art，绝不外抛；
 *      单个瓦片找不到时保留原键。资源到位后由 PQASSETS.onReady / 直接加载唤醒。
 * 暴露 window.PQART_EXTERNAL_READY（布尔）。
 * ------------------------------------------------------------------------- */
(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var TILE_SRC = 18, GRID_COLS = 20, TS = 16, TILE_LIMIT = 290;
  var W = 512, H = 224;

  var state = {
    ready: false,
    started: false,
    tiles: null,
    base: null,
    manifest: null,
    bgs: {},
    tileCache: {},
    bgPairCache: {},
    rawCache: {}
  };
  window.PQART_EXTERNAL_READY = false;

  /* ==================== 基础工具 ==================== */
  function makeCanvas(w, h) {
    if (typeof _makeCanvas === 'function') {
      try { return _makeCanvas(w, h); } catch (e) { /* 落到本地实现 */ }
    }
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function isHex(v) { return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v); }
  function toRgb(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  function mixHex(a, b, t) {
    a = isHex(a) ? a : '#ffffff'; b = isHex(b) ? b : '#000000';
    var pa = toRgb(a), pb = toRgb(b), out = '#';
    for (var i = 0; i < 3; i++) {
      var v = Math.round(pa[i] + (pb[i] - pa[i]) * t);
      if (v < 0) v = 0; if (v > 255) v = 255;
      out += ('0' + v.toString(16)).slice(-2);
    }
    return out;
  }
  function rgba(h, a) {
    var p = toRgb(isHex(h) ? h : '#ffffff');
    return 'rgba(' + p[0] + ',' + p[1] + ',' + p[2] + ',' + a + ')';
  }
  function smallRng(seed) {
    var s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  /* ==================== manifest 名称 → gid ====================
   * 优先 PQASSETS.manifest.tiles.names；缺 manifest 时用内置兜底表（与 bake 结果一致）。 */
  var GID = {
    GRASS_TOP_M: 3, GRASS_SURF_M: 7, GRASS_BODY_M: 11, DIRT_FILL: 49,
    SAND_TOP_M: 19, SANDSTONE_MM: 109, SANDSTONE_ROUGH_MM: 118,
    SNOW_TOP_M: 35, ICE_MM: 127, ICE_ROUGH_MM: 136,
    STONE_TM: 52, STONE_MM: 55, STONE_ROUGH_MM: 64,
    ROCK_TM: 70, ROCK_MM: 73,
    MARBLE_TM: 88, MARBLE_MM: 91,
    CASTLE_TM: 144, CASTLE_MM: 150,
    NIGHT_ROCK_TM: 180, NIGHT_ROCK_MM: 186, NIGHT_ROCK_ROUGH_MM: 204,
    BRICK: 213, BRICK_DARK: 214, BLOCK_Q: 216, BLOCK_COIN: 217, CRATE: 221,
    DOOR_TOP: 225, DOOR_BOTTOM: 226, PLATFORM_LEFT: 227, PLATFORM_RIGHT: 228,
    BRIDGE_MID: 230, LAVA_TOP: 235, LAVA: 236, SPIKES: 237,
    WATER: 239, WATER_DEEP: 240
  };

  function manifestNames() {
    var m = state.manifest;
    if (m && m.tiles && m.tiles.names && typeof m.tiles.names === 'object') return m.tiles.names;
    return null;
  }
  function gidOf(name, keyword) {
    var names = manifestNames();
    if (names && typeof names[name] === 'number') return names[name];
    if (GID[name]) return GID[name];
    if (keyword && names) {
      for (var k in names) {
        if (Object.prototype.hasOwnProperty.call(names, k) && k.indexOf(keyword) >= 0) return names[k];
      }
    }
    return 0;
  }

  /* ==================== 主题族 / 瓦片映射 ==================== */
  var FAMILY = {
    grass: 'green', wind: 'green', sky: 'green', sea: 'green',
    cave: 'stone', factory: 'stone', tower: 'stone', mirror: 'stone', boss: 'stone',
    husk: 'stone', abyss: 'stone',
    lava: 'lava', ember: 'lava', nether: 'lava',
    ice: 'ice', snow: 'ice',
    desert: 'desert',
    castle: 'castle', aether: 'castle', bell: 'castle', anthem: 'castle',
    star: 'night', night: 'night', maw: 'night'
  };

  var SPEC = {
    green: { block: 'GRASS_BODY_M', cap: 'GRASS_TOP_M', alt: 'GRASS_SURF_M', crumble: 'DIRT_FILL', alpha: 0.12 },
    stone: { block: 'STONE_MM', cap: 'STONE_TM', alt: 'STONE_ROUGH_MM', crumble: 'BRICK_DARK', alpha: 0.10 },
    lava: { block: 'ROCK_MM', cap: 'ROCK_TM', alt: 'STONE_ROUGH_MM', crumble: 'BRICK_DARK', alpha: 0.26 },
    ice: { block: 'ICE_MM', cap: 'SNOW_TOP_M', alt: 'ICE_ROUGH_MM', crumble: 'ICE_ROUGH_MM', alpha: 0.20 },
    desert: { block: 'SANDSTONE_MM', cap: 'SAND_TOP_M', alt: 'SANDSTONE_ROUGH_MM', crumble: 'SANDSTONE_ROUGH_MM', alpha: 0.18 },
    castle: { block: 'MARBLE_MM', cap: 'CASTLE_TM', alt: 'CASTLE_MM', crumble: 'BRICK_DARK', alpha: 0.14 },
    night: { block: 'NIGHT_ROCK_MM', cap: 'NIGHT_ROCK_TM', alt: 'NIGHT_ROCK_ROUGH_MM', crumble: 'BRICK_DARK', alpha: 0.18 }
  };

  function themeInfo(key) {
    var themes = null;
    try { if (typeof THEMES !== 'undefined') themes = THEMES; } catch (e) { /* 常量绑定 */ }
    if (!themes) themes = window.THEMES;
    var known = !!(themes && Object.prototype.hasOwnProperty.call(themes, key));
    var k = known ? key : 'grass';
    var th = (themes && (known ? themes[key] : themes.grass)) || {};
    return { key: k, th: th, family: FAMILY[k] || 'green' };
  }

  /* 18px 网格裁 1px 边框 → 16×16，nearest-neighbor */
  function rawTile(gid) {
    if (!gid) return null;
    if (state.rawCache[gid]) return state.rawCache[gid];
    var img = state.tiles;
    if (!img) return null;
    var i = gid - 1;
    if (i < 0 || i >= TILE_LIMIT) return null;
    var sx = (i % GRID_COLS) * TILE_SRC;
    var sy = Math.floor(i / GRID_COLS) * TILE_SRC;
    var c = makeCanvas(TS, TS), g = c.getContext('2d');
    if (!g) return null;
    g.imageSmoothingEnabled = false;
    try {
      g.drawImage(img, sx + 1, sy + 1, TS, TS, 0, 0, TS, TS);
    } catch (e) { return null; }
    state.rawCache[gid] = c;
    return c;
  }

  function flipTile(src, horiz, vert) {
    var c = makeCanvas(TS, TS), g = c.getContext('2d');
    if (!g) return src;
    g.imageSmoothingEnabled = false;
    g.save();
    g.translate(horiz ? TS : 0, vert ? TS : 0);
    g.scale(horiz ? -1 : 1, vert ? -1 : 1);
    g.drawImage(src, 0, 0);
    g.restore();
    return c;
  }

  /* 轻 tint + 1px 顶部受光/底部暗影；source-atop 保证透明瓦片（刺/水）不被填成方块 */
  function styledTile(gid, tint, alpha) {
    var src = rawTile(gid);
    if (!src) return null;
    var c = makeCanvas(TS, TS), g = c.getContext('2d');
    if (!g) return null;
    g.imageSmoothingEnabled = false;
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    if (isHex(tint) && alpha > 0) {
      g.fillStyle = rgba(tint, alpha);
      g.fillRect(0, 0, TS, TS);
    }
    g.fillStyle = 'rgba(255,255,255,0.20)';
    g.fillRect(0, 0, TS, 1);
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(0, TS - 1, TS, 1);
    g.globalCompositeOperation = 'source-over';
    return c;
  }

  /* 只加细节（裂纹/苔藓），不改轮廓 */
  function variantOf(base, seed, idx, isCap) {
    if (!base) return null;
    var c = makeCanvas(TS, TS), g = c.getContext('2d');
    if (!g) return null;
    g.imageSmoothingEnabled = false;
    g.drawImage(base, 0, 0);
    var r = smallRng(seed + idx * 977);
    if (idx === 0 && !isCap) {
      // 裂纹：从瓦片中部向下岔开
      var cx = 5 + Math.floor(r() * 6), cy = 3 + Math.floor(r() * 3);
      g.fillStyle = 'rgba(12,10,18,0.55)';
      for (var s = 0; s < 7; s++) {
        g.fillRect(cx, cy + s, 1, 1);
        cx += (s % 2) ? -1 : 1;
        if (cx < 2) cx = 2; if (cx > 13) cx = 13;
      }
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.fillRect(cx + 1, cy + 3, 1, 2);
      g.fillRect(10 + Math.floor(r() * 2), 11, 2, 1);
    } else {
      // 苔藓/苔痕：贴着上缘和角落
      g.fillStyle = 'rgba(96,170,92,0.72)';
      g.fillRect(2, 2, 3 + Math.floor(r() * 2), 1);
      g.fillRect(4, 3, 2, 1);
      g.fillRect(12, 11, 2, 1);
      g.fillRect(11, 12, 2, 1);
      g.fillStyle = 'rgba(46,96,52,0.66)';
      g.fillRect(3, 3, 1, 1);
      g.fillRect(12, 12, 1, 1);
      if (isCap) {
        g.fillStyle = 'rgba(120,200,108,0.75)';
        g.fillRect(3, 1, 1, 2);
        g.fillRect(4, 1, 2, 1);
      }
    }
    return c;
  }

  function plankVariant(base, idx) {
    if (!base) return null;
    var c = makeCanvas(TS, TS), g = c.getContext('2d');
    if (!g) return null;
    g.imageSmoothingEnabled = false;
    g.drawImage(base, 0, 0);
    var r = smallRng(4409 + idx * 613);
    // 木纹：两道浅槽 + 钉头/节疤，只改细节
    g.fillStyle = 'rgba(20,12,8,0.28)';
    var gy = 4 + idx * 4;
    for (var x = 2; x < TS - 2; x += 3) g.fillRect(x, gy, 2, 1);
    g.fillRect(3 + Math.floor(r() * 8), 11, 1, 2);
    g.fillStyle = 'rgba(255,240,200,0.28)';
    g.fillRect(2, 1, 2, 1);
    g.fillRect(TS - 4, TS - 3, 2, 1);
    return c;
  }

  function tileSetFor(key) {
    if (state.tileCache[key]) return state.tileCache[key];
    var info = themeInfo(key), spec = SPEC[info.family] || SPEC.green;
    var accent = isHex(info.th.accent) ? info.th.accent : '#ffffff';
    var a = spec.alpha;
    var out = {};

    function take(name, keyword, tint, alpha) {
      var gid = gidOf(name, keyword);
      if (!gid) return null;
      return styledTile(gid, tint === undefined ? accent : tint, alpha === undefined ? a : alpha);
    }

    var block = take(spec.block, 'STONE');
    if (!block) block = take(spec.alt, 'ROCK');
    if (block) {
      out.block = block;
      out.blockAlt = [variantOf(block, 1301, 0, false), variantOf(block, 1301, 1, false)];
    }
    var cap = take(spec.cap, 'GRASS');
    if (cap) {
      out.blockCap = cap;
      out.blockCapAlt = [variantOf(cap, 2207, 0, true), variantOf(cap, 2207, 1, true)];
    }

    var plank = take('BRIDGE_MID', 'BRIDGE');
    if (plank) {
      out.plank = plank;
      out.plankAlt = [plankVariant(plank, 0), plankVariant(plank, 1)];
    }
    var crumble = take(spec.crumble, 'BRICK');
    if (crumble) out.crumble = crumble;
    var ice = take('ICE_MM', 'ICE', mixHex(accent, '#a8e8ff', 0.7), a + 0.04);
    if (ice) out.ice = ice;

    var spikes = take('SPIKES', 'SPIKE');
    if (spikes) { out.spikes = spikes; out.spikesD = flipTile(spikes, false, true); }

    var lavaTint = mixHex(accent, '#f86038', 0.7);
    var lava0 = take('LAVA_TOP', 'LAVA', lavaTint, 0.24);
    var lava1 = take('LAVA', 'LAVA', lavaTint, 0.24);
    if (lava0 && lava1) out.lava = [lava0, lava1];

    var doorT = take('DOOR_TOP', 'DOOR');
    var doorB = take('DOOR_BOTTOM', 'DOOR');
    if (doorT && doorB) out.door = [doorT, doorB];

    var togA = take('BLOCK_Q', 'BLOCK_Q', mixHex(accent, '#e88830', 0.75), 0.20);
    var togB = take('BLOCK_COIN', 'BLOCK_COIN', mixHex(accent, '#4890d8', 0.75), 0.20);
    if (togA) out.toggleA = togA;
    if (togB) out.toggleB = togB;

    var convL = take('PLATFORM_LEFT', 'PLATFORM');
    var convR = take('PLATFORM_RIGHT', 'PLATFORM');
    if (convL && convR) { out.convL = convL; out.convR = convR; }

    var crate = take('CRATE', 'CRATE');
    if (crate) out.breakBrick = crate;
    var hidden = take('BRICK', 'BRICK');
    if (hidden) out.hidden = hidden;

    var waterTint = mixHex(accent, '#48b8e8', 0.7);
    var water = take('WATER', 'WATER', waterTint, 0.18);
    if (water) { out.waterL = flipTile(water, true, false); out.waterR = water; }

    state.tileCache[key] = out;
    return out;
  }

  /* ==================== 背景 ==================== */
  var BG_FILES = ['bg-grass', 'bg-sky', 'bg-water', 'bg-cave',
    'bg-castle', 'bg-night', 'bg-ice', 'bg-desert'];

  var BG_MAP = {
    grass: 'bg-grass', wind: 'bg-grass',
    sky: 'bg-sky',
    sea: 'bg-water', abyss: 'bg-water',
    cave: 'bg-cave', husk: 'bg-cave', lava: 'bg-cave', ember: 'bg-cave',
    factory: 'bg-castle', aether: 'bg-castle', tower: 'bg-castle',
    bell: 'bg-castle', castle: 'bg-castle', anthem: 'bg-castle',
    star: 'bg-night', boss: 'bg-night', maw: 'bg-night',
    nether: 'bg-night', night: 'bg-night',
    ice: 'bg-ice', snow: 'bg-ice', desert: 'bg-desert'
  };

  function usableImage(v) {
    if (!v) return null;
    if (v.image) v = v.image;
    else if (v.img) v = v.img;
    if (typeof v.width !== 'number') return null;
    if (v.complete === false) return null;
    return v.width > 0 ? v : null;
  }

  function pqGet(keys) {
    var pq = window.PQASSETS;
    if (!pq || typeof pq.get !== 'function') return null;
    for (var i = 0; i < keys.length; i++) {
      var v = null;
      try { v = pq.get(keys[i]); } catch (e) { v = null; }
      v = usableImage(v);
      if (v) return v;
    }
    return null;
  }

  function bgImage(file) {
    if (state.bgs[file]) return state.bgs[file];
    var img = pqGet(['kenney/bg/' + file, 'bg/' + file, file, file + '.png', 'kenney/bg/' + file + '.png']);
    if (img) state.bgs[file] = img;
    return img;
  }

  function bgPair(file) {
    if (state.bgPairCache[file]) return state.bgPairCache[file];
    var img = bgImage(file);
    if (!img) return null;
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) return null;

    var far = makeCanvas(W, H), gf = far.getContext('2d');
    if (!gf) return null;
    gf.imageSmoothingEnabled = true;
    try { gf.drawImage(img, 0, 0, iw, ih, 0, 0, W, H); } catch (e) { return null; }
    // 上下衔接渐变：天光微亮 → 透明 → 底部压暗
    var grad = gf.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(255,255,255,0.10)');
    grad.addColorStop(0.42, 'rgba(255,255,255,0)');
    grad.addColorStop(0.68, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.26)');
    gf.fillStyle = grad;
    gf.fillRect(0, 0, W, H);

    var near = makeCanvas(W, H), gn = near.getContext('2d');
    if (!gn) return { far: far, near: far };
    gn.imageSmoothingEnabled = true;
    try { gn.drawImage(img, 0, 0, iw, ih, 0, 0, W, H); } catch (e) { return { far: far, near: far }; }
    gn.fillStyle = 'rgba(8,10,22,0.52)';       // 同图压暗做近景
    gn.fillRect(0, 0, W, H);
    var ng = gn.createLinearGradient(0, H * 0.55, 0, H);
    ng.addColorStop(0, 'rgba(8,10,22,0)');
    ng.addColorStop(1, 'rgba(8,10,22,0.42)');
    gn.fillStyle = ng;
    gn.fillRect(0, Math.floor(H * 0.55), W, H - Math.floor(H * 0.55));

    var pair = { far: far, near: near };
    state.bgPairCache[file] = pair;
    return pair;
  }

  /* ==================== 应用到 art ==================== */
  function applyTiles(art, key) {
    var set = tileSetFor(key);
    var t = art.tiles;
    if (!t || typeof t !== 'object') return;
    for (var name in set) {
      if (!Object.prototype.hasOwnProperty.call(set, name)) continue;
      if (Object.prototype.hasOwnProperty.call(t, name)) {
        t[name] = set[name];
      } else if ((name === 'blockAlt' || name === 'blockCapAlt') && (t.block || t.blockCap)) {
        t[name] = set[name];
      }
    }
  }

  function applyBG(art, key) {
    if (!art.bg || typeof art.bg !== 'object') return;
    var file = BG_MAP[key] || 'bg-grass';
    var pair = bgPair(file);
    if (!pair) return;
    art.bg.far = pair.far;
    art.bg.near = pair.near; // mid / fore 保留 remaster 程序化结果
  }

  function decorate(art, key) {
    if (!state.ready || !state.tiles || !art || typeof art !== 'object') return art;
    var info = themeInfo(key);
    applyTiles(art, info.key);
    applyBG(art, info.key);
    return art;
  }

  /* ==================== 资源加载（PQASSETS 优先，内置直接加载兜底） ==================== */
  function markReady() {
    if (state.ready || !state.tiles) return;
    state.ready = true;
    window.PQART_EXTERNAL_READY = true;
  }

  function loadBackgrounds() {
    if (!state.base) state.base = BASES[0]; // 瓦片由 PQASSETS 提供时仍按约定路径补背景
    for (var i = 0; i < BG_FILES.length; i++) {
      (function (file) {
        if (state.bgs[file]) return;
        var pq = pqGet(['kenney/bg/' + file, 'bg/' + file, file]);
        if (pq) { state.bgs[file] = pq; return; }
        if (!state.base) return;
        var im = new Image();
        im.onload = function () { state.bgs[file] = im; };
        im.onerror = function () { /* 该背景缺失则保留程序化背景 */ };
        try { im.src = state.base + 'bg/' + file + '.png'; } catch (e) { /* 静默 */ }
      })(BG_FILES[i]);
    }
  }

  var BASES = ['assets/kenney/', './assets/kenney/', 'kenney/', '../assets/kenney/'];

  function loadDirectTiles(i) {
    if (state.tiles || i >= BASES.length) return;
    var base = BASES[i];
    var im = new Image();
    im.onload = function () {
      if (state.tiles) return;
      state.tiles = im;
      state.base = base;
      markReady();
      loadBackgrounds();
    };
    im.onerror = function () { loadDirectTiles(i + 1); };
    try { im.src = base + 'tiles.png'; } catch (e) { loadDirectTiles(i + 1); }
  }

  function adoptPQ() {
    var pq = window.PQASSETS;
    if (!pq) return false;
    if (!state.manifest && pq.manifest) {
      try {
        var m = typeof pq.manifest === 'function' ? pq.manifest() : pq.manifest;
        if (m && typeof m.then === 'function') {
          m.then(function (mm) { state.manifest = mm; }, function () {});
        } else if (m) {
          state.manifest = m;
        }
      } catch (e) { /* 静默 */ }
    }
    var t = pqGet(['kenney/tiles', 'tiles', 'kenney/tiles.png', 'tiles.png']);
    if (t && !state.tiles) {
      state.tiles = t;
      markReady();
      loadBackgrounds();
      return true;
    }
    return !!state.tiles;
  }

  function start() {
    if (state.started) return;
    state.started = true;
    var pq = window.PQASSETS;
    if (pq && typeof pq.onReady === 'function') {
      try {
        pq.onReady(function () { try { adoptPQ(); } catch (e) { /* 静默 */ } });
      } catch (e) { /* 静默 */ }
    }
    if (!adoptPQ()) loadDirectTiles(0);
  }

  /* ==================== 包装 buildThemeArt（最外层） ==================== */
  function install() {
    var orig = null;
    try { if (typeof buildThemeArt === 'function') orig = buildThemeArt; } catch (e) { orig = null; }
    if (!orig) orig = window.buildThemeArt;
    if (typeof orig !== 'function') return false;
    if (orig.__external) return true;

    var wrapped = function (themeKey) {
      var art = orig(themeKey);
      try { decorate(art, themeKey); } catch (e) { /* 外部增强失败不影响原美术 */ }
      return art;
    };
    wrapped.__external = true;

    try { buildThemeArt = wrapped; } catch (e) { /* 常量绑定时走 window */ }
    try { window.buildThemeArt = wrapped; } catch (e2) { /* 静默 */ }
    return true;
  }

  try {
    if (!install()) window.addEventListener('load', install, { once: true });
  } catch (e) { /* 静默 */ }
  try { start(); } catch (e2) { /* 静默 */ }
})();
