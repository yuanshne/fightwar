/* ai_tiles.js — v49 AI 材质瓦片（地板/墙体/平台/地刺/熔岩/门/木箱/开关）
 * ---------------------------------------------------------------------------
 * 加载顺序：art.js → art_remaster.js → art_external.js → ai_bg.js → 本文件 → ui.js
 * 职责（只碰 art.tiles，绝不碰 decor/bg/关卡数据/碰撞）：
 *   1. 异步加载 assets/ai/tiles/*.jpg（10 张 1024² 无缝材质）；
 *   2. 就绪后按主题族烘焙 16×16 瓦片（纹理裁切 + 1px 顶光/底影/侧棱 + 主题细节）；
 *   3. 包装 window.buildThemeArt：先调原函数，再按主题族替换 art.tiles 既有键。
 * 兜底：纹理未就绪 / 键缺失 / 任何异常 → 原样返回程序化美术，绝不外抛。
 * 对外：window.PQAI_TILES_READY（布尔）、window.PQAI_TILES（make16 / baked / onReady）。
 * ------------------------------------------------------------------------- */
(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var BASE = ['assets/ai/', './assets/ai/', '../assets/ai/'];

  var FILES = {
    grass: 'tiles/tex_grass.jpg',
    cave: 'tiles/tex_cave.jpg',
    sky: 'tiles/tex_sky.jpg',
    factory: 'tiles/tex_factory.jpg',
    lavaRock: 'tiles/tex_lava_rock.jpg',
    lava: 'tiles/tex_lava.jpg',
    palace: 'tiles/tex_palace.jpg',
    wood: 'tiles/tex_wood.jpg',
    ice: 'tiles/tex_ice.jpg',
    sand: 'tiles/tex_sand.jpg'
  };

  /* 主题 → 材质族（未列出的主题按契约回退 grass） */
  var FAMILY = {
    grass: 'grass', wind: 'grass', forest: 'grass',
    cave: 'cave', tower: 'cave', mirror: 'cave', night: 'cave',
    sky: 'sky', cloud: 'sky',
    factory: 'factory', gear: 'factory',
    lava: 'lava', ember: 'lava', fire: 'lava', nether: 'lava',
    sea: 'palace', coral: 'palace',
    ice: 'ice', snow: 'ice',
    desert: 'sand',
    palace: 'palace', boss: 'palace', temple: 'palace'
  };

  /* 每族的取色/母题（accent 用于符文、铆钉亮面与方向箭头） */
  var FAM = {
    grass: {
      tex: 'grass', capTex: 'grass', wood: 'wood', base: '#74806f',
      metal: '#c8d0c8', metalLo: '#5a6458', accent: '#8fe36a',
      capColor: '#6fbf4a', tuft: true
    },
    cave: {
      tex: 'cave', capTex: 'cave', wood: 'cave', base: '#26323c',
      metal: '#9aa8c0', metalLo: '#4a5468', accent: '#64e8d8',
      capColor: '#3aa8a0', dark: 0.10, crystal: true
    },
    sky: {
      tex: 'sky', capTex: 'sky', wood: 'sky', base: '#dbeaf2',
      metal: '#e8f4ff', metalLo: '#8898a8', accent: '#7fd4ff',
      capColor: '#ffffff', bright: 0.06, cloud: true
    },
    factory: {
      tex: 'factory', capTex: 'factory', wood: 'factory', base: '#3c4c60',
      metal: '#c8d4e8', metalLo: '#5a6478', accent: '#f8c040',
      capColor: '#8a9ab0', rivet: true
    },
    lava: {
      tex: 'lavaRock', capTex: 'lavaRock', wood: 'lavaRock', base: '#2a1a18',
      metal: '#5a5460', metalLo: '#2a2428', accent: '#ff8a2a',
      capColor: '#c85028', dark: 0.12, ember: true
    },
    palace: {
      tex: 'palace', capTex: 'palace', wood: 'palace', base: '#b8e0c8',
      metal: '#f0d080', metalLo: '#8a7040', accent: '#ffd870',
      capColor: '#ffd870', gold: true
    },
    ice: {
      tex: 'ice', capTex: 'ice', wood: 'ice', base: '#bfe8ff',
      metal: '#e8fbff', metalLo: '#7aa8c0', accent: '#bff0ff',
      capColor: '#eefbff', bright: 0.05, frost: true
    },
    sand: {
      tex: 'sand', capTex: 'sand', wood: 'wood', base: '#d8b078',
      metal: '#d8b070', metalLo: '#8a6a40', accent: '#ffd9a0',
      capColor: '#e8c890', dust: true
    }
  };

  var FAM_KEYS = ['grass', 'cave', 'sky', 'factory', 'lava', 'palace', 'ice', 'sand'];

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

  var API = { ready: false, make16: null, map: FAMILY, baked: state.baked, imgs: state.imgs };
  window.PQAI_TILES = API;
  window.PQAI_TILES_READY = false;

  /* ==================== 基础工具 ==================== */
  function mkCanvas(w, h) {
    try { if (typeof _makeCanvas === 'function') return _makeCanvas(w, h); } catch (e) { /* 本地实现 */ }
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function ctx2d(c) {
    try { return c.getContext('2d'); } catch (e) { return null; }
  }

  function px(g, x, y, w, h, col) {
    if (!g) return;
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  }

  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /* ==================== 图片加载（多基路径兜底） ==================== */
  function loadOne(name, i) {
    if (i >= BASE.length) { settle(name, null); return; }
    var im = new Image();
    im.onload = function () {
      if (!im.naturalWidth && !im.width) { loadOne(name, i + 1); return; }
      state.imgs[name] = im;
      settle(name, im);
    };
    im.onerror = function () { loadOne(name, i + 1); };
    try { im.src = BASE[i] + FILES[name]; } catch (e) { loadOne(name, i + 1); }
  }

  function settle(name, img) {
    if (state.waiting[name]) return;
    state.waiting[name] = true;
    state.done++;
    if (!img) state.failed[name] = true;
    if (state.done >= state.total) bakeAll();
  }

  function flush() {
    var q = state.queue;
    state.queue = [];
    for (var i = 0; i < q.length; i++) {
      try { q[i](); } catch (e) { /* 静默 */ }
    }
  }

  function start() {
    if (state.started) return;
    state.started = true;
    var names = Object.keys(FILES);
    state.total = names.length;
    for (var i = 0; i < names.length; i++) loadOne(names[i], 0);
  }

  /* ==================== 16×16 烘焙原语 ==================== */
  /* 从纹理裁一小块缩到 16×16；sx/sy 会回卷到图内，越界自动钳制。 */
  function sample(g, texName, sx, sy, sw) {
    var img = state.imgs[texName];
    if (!img) img = state.imgs.grass;
    if (!img) return false;
    var iw = img.naturalWidth || img.width || 1024;
    var ih = img.naturalHeight || img.height || 1024;
    sw = Math.min(sw || 32, iw, ih);
    var maxX = Math.max(1, iw - sw), maxY = Math.max(1, ih - sw);
    sx = Math.floor(((sx | 0) % maxX + maxX) % maxX);
    sy = Math.floor(((sy | 0) % maxY + maxY) % maxY);
    g.imageSmoothingEnabled = true;
    try { g.drawImage(img, sx, sy, sw, sw, 0, 0, 16, 16); } catch (e) { return false; }
    return true;
  }

  /* 通用：纹理 → 16×16，可加色调/压暗/保底底色 */
  function make16(tex, sx, sy, opt) {
    opt = opt || {};
    var c = mkCanvas(16, 16), g = ctx2d(c);
    if (!g) return c;
    var ok = sample(g, tex, sx, sy, opt.sw || 32);
    if (!ok) {
      g.fillStyle = opt.base || '#5a6068';
      g.fillRect(0, 0, 16, 16);
    }
    if (opt.fadeA) {
      g.globalAlpha = opt.fadeA;
      g.fillStyle = '#000000';
      g.fillRect(0, 0, 16, 16);
      g.globalAlpha = 1;
    }
    if (opt.brightA) {
      g.globalAlpha = opt.brightA;
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, 16, 16);
      g.globalAlpha = 1;
    }
    return c;
  }

  /* 1px 顶光 + 底影 + 左右侧棱（16×16 实体瓦片的统一体积感）
     v52：强度减半——每格都画满高光/黑影会形成明显方格网，压低后只保留轻微体积。 */
  function bevel(c, topA, botA) {
    var g = ctx2d(c);
    if (!g) return;
    var ta = (topA == null ? 0.26 : topA) * 0.45;
    px(g, 0, 0, 16, 1, 'rgba(255,255,255,' + ta + ')');
    px(g, 0, 0, 1, 16, 'rgba(255,255,255,' + (ta * 0.20) + ')');
    px(g, 0, 15, 16, 1, 'rgba(0,0,0,' + ((botA == null ? 0.34 : botA) * 0.50) + ')');
    px(g, 15, 0, 1, 16, 'rgba(0,0,0,0.07)');
  }

  /* 确定性折线裂纹（逐像素竖向下走，不越界） */
  function crack(g, x, y, r, color) {
    for (var i = 0; i < 8; i++) {
      px(g, x, y, 1, 1, color);
      x += (r() < 0.5) ? 1 : -1;
      y += 1;
      if (x < 1) x = 2;
      if (x > 13) x = 12;
      if (y > 14) break;
    }
  }

  function rivet(g, x, y, hi, lo) {
    px(g, x, y, 2, 2, lo);
    px(g, x, y, 1, 1, hi);
  }

  /* 向上尖刺：i=0 为塔尖（顶部 1px），向下逐行变宽 */
  function spikeUp(g, x0, baseY, w, h, hi, mid, lo) {
    for (var i = 0; i < h; i++) {
      var ww = Math.max(1, Math.round((i + 1) * w / h));
      var x = x0 + ((w - ww) >> 1);
      var y = baseY - h + 1 + i;
      px(g, x, y, ww, 1, mid);
      if (ww >= 2) px(g, x + ww - 1, y, 1, 1, lo);
      px(g, x, y, 1, 1, hi);
    }
    px(g, x0 + (w >> 1), baseY - h + 1, 1, 1, '#ffffff');
  }

  /* ==================== 各瓦片绘制 ==================== */
  function blockTile(F, v, r) {
    var c = make16(F.tex, r() * 960, r() * 960, { sw: 32, fadeA: F.dark || 0, brightA: F.bright || 0, base: F.base });
    var g = ctx2d(c);
    if (v === 1) crack(g, 3 + ((r() * 5) | 0), 2, r, 'rgba(0,0,0,0.42)');
    else if (v === 2) {
      px(g, 2 + ((r() * 4) | 0), 9 + ((r() * 3) | 0), 3, 1, 'rgba(255,255,255,0.18)');
      px(g, 12, 3, 1, 2, 'rgba(0,0,0,0.22)');
    } else if (v === 3) {
      for (var i = 0; i < 3; i++) {
        px(g, 2 + ((r() * 11) | 0), 2 + ((r() * 11) | 0), 2, 1, 'rgba(255,255,255,0.14)');
      }
      px(g, 4, 12, 2, 1, F.tuft ? 'rgba(120,190,80,0.45)' : 'rgba(0,0,0,0.20)');
    }
    // v52：熔岩/余烬主题的砖块里加几粒暖色余烬，避免整片地面只剩灰黑格子。
    if (F.ember) {
      for (var e = 0; e < 3; e++) {
        px(g, 2 + ((r() * 12) | 0), 3 + ((r() * 11) | 0), 1, 1,
          e === 0 ? 'rgba(255,150,50,0.55)' : 'rgba(255,92,28,0.38)');
      }
    }
    bevel(c, 0.24, 0.34);
    return c;
  }

  function capTile(F, v, r) {
    var c = make16(F.capTex, r() * 960, r() * 960, { sw: 32, fadeA: F.dark || 0, brightA: F.bright || 0, base: F.base });
    var g = ctx2d(c);
    /* 地表受光：顶部 2px 亮带 + 1px 主题色边 */
    px(g, 0, 0, 16, 2, 'rgba(255,255,255,0.24)');
    px(g, 0, 0, 16, 1, F.capColor);
    /* 主题地表点缀 */
    if (F.tuft) {
      var cols = ['#4c9a34', '#79c84e', '#a8e870'];
      for (var i = 0; i < 6; i++) {
        var gx = (r() * 14) | 0, gh = 1 + ((r() * 3) | 0);
        px(g, gx, 0, 1, gh, cols[i % 3]);
        if (gh > 1) px(g, gx + 1, 1, 1, 1, cols[(i + 1) % 3]);
      }
    } else if (F.crystal) {
      for (var k = 0; k < 3; k++) {
        px(g, 2 + ((r() * 11) | 0), 0, 1, 2, F.accent);
        px(g, 3 + ((r() * 9) | 0), 0, 1, 1, 'rgba(255,255,255,0.7)');
      }
    } else if (F.cloud) {
      for (var m = 0; m < 4; m++) px(g, (r() * 13) | 0, 0, 2 + ((r() * 2) | 0), 1, 'rgba(255,255,255,0.85)');
    } else if (F.ember) {
      for (var e = 0; e < 4; e++) px(g, (r() * 14) | 0, 0, 1, 1, F.accent);
      px(g, 0, 0, 16, 1, 'rgba(255,140,50,0.55)');
    } else if (F.gold) {
      for (var a = 0; a < 3; a++) px(g, 2 + a * 5, 0, 2, 1, F.accent);
    } else if (F.frost) {
      for (var f = 0; f < 4; f++) px(g, (r() * 15) | 0, 0, 1, 1, 'rgba(255,255,255,0.9)');
    } else if (F.rivet) {
      for (var rv = 0; rv < 3; rv++) rivet(g, 2 + rv * 5, 0, F.metal, 'rgba(0,0,0,0.5)');
    } else if (F.dust) {
      for (var d = 0; d < 5; d++) px(g, (r() * 15) | 0, 0, 1, 1, 'rgba(255,240,210,0.55)');
    }
    if (v === 1) crack(g, 5 + ((r() * 4) | 0), 2, r, 'rgba(0,0,0,0.30)');
    /* 与实体砖交界：底部 2px 阴影 */
    px(g, 0, 14, 16, 2, 'rgba(0,0,0,0.30)');
    px(g, 0, 15, 16, 1, 'rgba(0,0,0,0.44)');
    px(g, 0, 0, 1, 16, 'rgba(255,255,255,0.12)');
    px(g, 15, 0, 1, 16, 'rgba(0,0,0,0.18)');
    return c;
  }

  function plankTile(F, v, r) {
    var c = make16(F.wood, r() * 960, r() * 960, { sw: 24, base: F.base, fadeA: 0.06 });
    var g = ctx2d(c);
    /* 木纹/板缝横线 */
    for (var i = 0; i < 3; i++) px(g, 1, 5 + i * 3 + (v % 2), 14, 1, 'rgba(0,0,0,0.13)');
    /* 顶面受光 2px */
    px(g, 0, 0, 16, 1, 'rgba(255,255,255,0.50)');
    px(g, 0, 1, 16, 1, 'rgba(255,255,255,0.20)');
    /* 底面暗影 2px（单向平台下沿） */
    px(g, 0, 14, 16, 2, 'rgba(0,0,0,0.48)');
    px(g, 0, 0, 1, 16, 'rgba(255,255,255,0.18)');
    px(g, 15, 0, 1, 16, 'rgba(0,0,0,0.32)');
    /* 两端钉子 */
    rivet(g, 2, 2, 'rgba(255,255,255,0.55)', 'rgba(0,0,0,0.42)');
    rivet(g, 12, 2, 'rgba(255,255,255,0.55)', 'rgba(0,0,0,0.42)');
    return c;
  }

  function iceTile(F, r) {
    var c = make16('ice', r() * 960, r() * 960, { sw: 32, base: '#bfe8ff' });
    var g = ctx2d(c);
    px(g, 0, 0, 16, 2, 'rgba(255,255,255,0.40)');
    px(g, 0, 0, 16, 1, 'rgba(255,255,255,0.65)');
    crack(g, 7, 1, r, 'rgba(255,255,255,0.55)');
    crack(g, 4, 5, r, 'rgba(90,160,210,0.35)');
    px(g, 0, 15, 16, 1, 'rgba(60,120,170,0.45)');
    px(g, 0, 0, 1, 16, 'rgba(255,255,255,0.35)');
    px(g, 15, 0, 1, 16, 'rgba(60,120,170,0.30)');
    return c;
  }

  function spikesTile(F, down, r) {
    var c = mkCanvas(16, 16), g = ctx2d(c);
    if (!g) return c;
    var hi = 'rgba(255,255,255,0.58)', mid = F.metal, lo = F.metalLo;
    for (var i = 0; i < 4; i++) {
      var x0 = 1 + i * 4;
      if (!down) spikeUp(g, x0, 13, 3, 10, hi, mid, lo);
      else {
        /* 倒刺：i=0 为塔尖（底部 1px），向上逐行变宽 */
        for (var j = 0; j < 10; j++) {
          var ww = Math.max(1, Math.round((j + 1) * 3 / 10));
          var x = x0 + ((3 - ww) >> 1);
          var y = 11 - j;
          px(g, x, y, ww, 1, mid);
          if (ww >= 2) px(g, x + ww - 1, y, 1, 1, lo);
          px(g, x, y, 1, 1, hi);
        }
        px(g, x0 + 1, 11, 1, 1, '#ffffff');
      }
    }
    if (!down) {
      px(g, 0, 14, 16, 2, F.metalLo);
      px(g, 0, 14, 16, 1, 'rgba(255,255,255,0.20)');
      px(g, 0, 15, 16, 1, 'rgba(0,0,0,0.55)');
    } else {
      px(g, 0, 0, 16, 2, F.metalLo);
      px(g, 0, 0, 16, 1, 'rgba(255,255,255,0.18)');
      px(g, 0, 1, 16, 1, 'rgba(0,0,0,0.50)');
    }
    return c;
  }

  function lavaTile(F, frame, r) {
    var c = make16('lava', r() * 960, r() * 960, { sw: 36, base: '#a82808' });
    var g = ctx2d(c);
    var blobs = frame
      ? [[2, 5], [9, 2], [12, 10], [5, 12]]
      : [[8, 4], [3, 9], [13, 6], [6, 13]];
    for (var i = 0; i < blobs.length; i++) {
      var x = blobs[i][0], y = blobs[i][1];
      px(g, x, y, 2, 1, 'rgba(255,150,40,0.80)');
      px(g, x, y, 1, 1, 'rgba(255,242,170,0.95)');
      px(g, x + 1, y - 1, 1, 1, 'rgba(255,90,20,0.55)');
    }
    px(g, 0, 0, 16, 1, 'rgba(255,200,120,0.20)');
    px(g, 0, 15, 16, 1, 'rgba(120,20,0,0.38)');
    return c;
  }

  function toggleTile(F, col, r) {
    var c = make16(F.tex, r() * 960, r() * 960, { sw: 30, base: F.base, fadeA: 0.24 });
    var g = ctx2d(c);
    if (!g) return c;
    g.globalAlpha = 0.55;
    g.fillStyle = col;
    g.fillRect(0, 0, 16, 16);
    g.globalAlpha = 1;
    px(g, 1, 1, 14, 14, 'rgba(0,0,0,0.16)');
    px(g, 0, 0, 16, 1, 'rgba(255,255,255,0.45)');
    px(g, 0, 15, 16, 1, 'rgba(0,0,0,0.52)');
    px(g, 0, 0, 1, 16, 'rgba(255,255,255,0.22)');
    px(g, 15, 0, 1, 16, 'rgba(0,0,0,0.34)');
    rivet(g, 2, 2, 'rgba(255,255,255,0.65)', 'rgba(0,0,0,0.46)');
    rivet(g, 12, 2, 'rgba(255,255,255,0.65)', 'rgba(0,0,0,0.46)');
    rivet(g, 2, 12, 'rgba(255,255,255,0.65)', 'rgba(0,0,0,0.46)');
    rivet(g, 12, 12, 'rgba(255,255,255,0.65)', 'rgba(0,0,0,0.46)');
    /* 中央菱形符文：一眼区分 a/b 开关砖 */
    var rc = '#fff2c8';
    px(g, 7, 5, 2, 1, rc);
    px(g, 6, 6, 1, 1, rc); px(g, 9, 6, 1, 1, rc);
    px(g, 6, 7, 1, 2, rc); px(g, 9, 7, 1, 2, rc);
    px(g, 7, 9, 2, 1, rc);
    px(g, 7, 7, 2, 1, 'rgba(255,255,255,0.85)');
    px(g, 7, 8, 2, 1, 'rgba(0,0,0,0.38)');
    return c;
  }

  function crumbleTile(F, r) {
    var c = make16(F.tex, r() * 960, r() * 960, { sw: 30, base: F.base, fadeA: 0.24 });
    var g = ctx2d(c);
    crack(g, 3, 2, r, 'rgba(0,0,0,0.55)');
    crack(g, 9, 5, r, 'rgba(0,0,0,0.45)');
    /* 右下缺角（崩塌砖的身份标记） */
    px(g, 12, 13, 3, 1, 'rgba(8,6,6,0.90)');
    px(g, 13, 14, 2, 1, 'rgba(8,6,6,0.90)');
    px(g, 14, 15, 1, 1, 'rgba(8,6,6,0.90)');
    bevel(c, 0.12, 0.42);
    return c;
  }

  function doorTile(F, upper, r) {
    var c = make16(F.wood, r() * 960, r() * 960, { sw: 22, base: F.base, fadeA: 0.16 });
    var g = ctx2d(c);
    if (!g) return c;
    /* 门框纵棱 */
    px(g, 0, 0, 1, 16, 'rgba(0,0,0,0.55)');
    px(g, 15, 0, 1, 16, 'rgba(0,0,0,0.55)');
    px(g, 1, 0, 1, 16, 'rgba(255,255,255,0.22)');
    px(g, 2, 0, 1, 16, 'rgba(0,0,0,0.22)');
    px(g, 13, 0, 1, 16, 'rgba(255,255,255,0.10)');
    px(g, 14, 0, 1, 16, 'rgba(0,0,0,0.22)');
    if (upper) {
      /* 门楣金属条 + 锁孔符文 */
      px(g, 0, 0, 16, 2, F.metal);
      px(g, 0, 1, 16, 1, 'rgba(0,0,0,0.35)');
      px(g, 2, 0, 12, 1, 'rgba(255,255,255,0.40)');
      px(g, 6, 5, 4, 4, 'rgba(0,0,0,0.45)');
      px(g, 7, 6, 2, 2, F.accent);
      px(g, 7, 6, 1, 1, '#ffffff');
      px(g, 7, 9, 2, 1, F.accent);
      px(g, 4, 12, 8, 1, 'rgba(0,0,0,0.30)');
    } else {
      /* 下段门板：凹槽 + 四角铆钉 */
      px(g, 4, 3, 8, 1, 'rgba(0,0,0,0.35)');
      px(g, 4, 12, 8, 1, 'rgba(0,0,0,0.35)');
      px(g, 4, 3, 1, 10, 'rgba(255,255,255,0.12)');
      rivet(g, 3, 4, 'rgba(255,255,255,0.60)', 'rgba(0,0,0,0.50)');
      rivet(g, 11, 4, 'rgba(255,255,255,0.60)', 'rgba(0,0,0,0.50)');
      rivet(g, 3, 11, 'rgba(255,255,255,0.60)', 'rgba(0,0,0,0.50)');
      rivet(g, 11, 11, 'rgba(255,255,255,0.60)', 'rgba(0,0,0,0.50)');
    }
    px(g, 0, 15, 16, 1, 'rgba(0,0,0,0.50)');
    return c;
  }

  function hiddenTile(F, r) {
    var c = make16(F.tex, r() * 960, r() * 960, { sw: 30, base: F.base, fadeA: 0.10 });
    var g = ctx2d(c);
    bevel(c, 0.18, 0.34);
    /* 与实心砖几乎同色，仅一道暗裂纹作暗记 */
    crack(g, 5, 3, r, 'rgba(0,0,0,0.50)');
    px(g, 11, 10, 2, 1, 'rgba(0,0,0,0.42)');
    px(g, 12, 11, 1, 1, 'rgba(0,0,0,0.42)');
    return c;
  }

  function crateTile(F, r) {
    var c = make16('wood', r() * 960, r() * 960, { sw: 26, base: '#7a5232', fadeA: 0.10 });
    var g = ctx2d(c);
    if (!g) return c;
    /* 外框 */
    px(g, 0, 0, 16, 1, 'rgba(30,18,10,0.85)');
    px(g, 0, 15, 16, 1, 'rgba(30,18,10,0.85)');
    px(g, 0, 0, 1, 16, 'rgba(30,18,10,0.85)');
    px(g, 15, 0, 1, 16, 'rgba(30,18,10,0.85)');
    px(g, 1, 1, 14, 1, 'rgba(255,255,255,0.20)');
    /* X 斜撑（木箱身份） */
    for (var i = 1; i < 15; i++) {
      px(g, i, i, 1, 1, 'rgba(52,30,16,0.80)');
      px(g, 15 - i, i, 1, 1, 'rgba(52,30,16,0.80)');
    }
    px(g, 1, 7, 14, 2, 'rgba(52,30,16,0.45)');
    /* 四角金属铆钉 */
    rivet(g, 1, 1, 'rgba(240,224,180,0.90)', 'rgba(60,40,20,0.85)');
    rivet(g, 12, 1, 'rgba(240,224,180,0.90)', 'rgba(60,40,20,0.85)');
    rivet(g, 1, 12, 'rgba(240,224,180,0.90)', 'rgba(60,40,20,0.85)');
    rivet(g, 12, 12, 'rgba(240,224,180,0.90)', 'rgba(60,40,20,0.85)');
    return c;
  }

  function waterTile(F, dir, r) {
    var c = make16('sky', r() * 960, r() * 960, { sw: 36, base: '#2c7ac8' });
    var g = ctx2d(c);
    if (!g) return c;
    g.globalAlpha = 0.62;
    g.fillStyle = '#2c7ac8';
    g.fillRect(0, 0, 16, 16);
    g.globalAlpha = 1;
    px(g, 0, 3, 16, 1, 'rgba(255,255,255,0.30)');
    px(g, 0, 9, 16, 1, 'rgba(255,255,255,0.18)');
    /* 双 chevron 水流箭头 */
    var col = 'rgba(255,255,255,0.88)';
    for (var k = 0; k < 2; k++) {
      var bx = 2 + k * 7;
      if (dir < 0) {
        px(g, bx + 2, 5, 1, 1, col); px(g, bx + 1, 6, 1, 1, col); px(g, bx, 7, 1, 1, col);
        px(g, bx + 1, 8, 1, 1, col); px(g, bx + 2, 9, 1, 1, col);
      } else {
        px(g, bx, 5, 1, 1, col); px(g, bx + 1, 6, 1, 1, col); px(g, bx + 2, 7, 1, 1, col);
        px(g, bx + 1, 8, 1, 1, col); px(g, bx, 9, 1, 1, col);
      }
    }
    px(g, 0, 15, 16, 1, 'rgba(0,40,90,0.35)');
    return c;
  }

  function convTile(F, dir, r) {
    var c = make16(F.tex, r() * 960, r() * 960, { sw: 26, base: F.base, fadeA: 0.42 });
    var g = ctx2d(c);
    if (!g) return c;
    /* 上下导轨 */
    px(g, 0, 0, 16, 2, F.metal);
    px(g, 0, 1, 16, 1, 'rgba(0,0,0,0.46)');
    px(g, 0, 0, 16, 1, 'rgba(255,255,255,0.32)');
    px(g, 0, 14, 16, 2, F.metal);
    px(g, 0, 15, 16, 1, 'rgba(0,0,0,0.55)');
    /* 履带纹 */
    for (var x = 1; x < 16; x += 3) px(g, x, 3, 1, 10, 'rgba(255,255,255,0.10)');
    /* 中段方向箭头 */
    var col = F.accent;
    for (var k = 0; k < 2; k++) {
      var bx = 2 + k * 7;
      if (dir < 0) {
        px(g, bx + 2, 5, 1, 1, col); px(g, bx + 1, 6, 1, 1, col); px(g, bx, 7, 1, 1, col);
        px(g, bx + 1, 8, 1, 1, col); px(g, bx + 2, 9, 1, 1, col);
      } else {
        px(g, bx, 5, 1, 1, col); px(g, bx + 1, 6, 1, 1, col); px(g, bx + 2, 7, 1, 1, col);
        px(g, bx + 1, 8, 1, 1, col); px(g, bx, 9, 1, 1, col);
      }
    }
    return c;
  }

  /* ==================== 按族烘焙全套 ==================== */
  function buildFamily(famKey) {
    var F = FAM[famKey] || FAM.grass;
    var r = rng(hash(famKey));
    var out = {};

    out.block = blockTile(F, 0, r);
    out.blockAlt = [blockTile(F, 1, r), blockTile(F, 2, r), blockTile(F, 3, r)];
    out.blockCap = capTile(F, 0, r);
    out.blockCapAlt = [capTile(F, 1, r), capTile(F, 2, r), capTile(F, 3, r)];
    out.plank = plankTile(F, 0, r);
    out.plankAlt = [plankTile(F, 1, r), plankTile(F, 2, r)];
    out.ice = iceTile(F, r);
    out.spikes = spikesTile(F, false, r);
    out.spikesD = spikesTile(F, true, r);
    out.lava = [lavaTile(F, 0, r), lavaTile(F, 1, r)];
    out.toggleA = toggleTile(F, '#e88830', r);
    out.toggleB = toggleTile(F, '#4890d8', r);
    out.crumble = crumbleTile(F, r);
    out.door = [doorTile(F, true, r), doorTile(F, false, r)];
    out.hidden = hiddenTile(F, r);
    out.breakBrick = crateTile(F, r);
    out.waterL = waterTile(F, -1, r);
    out.waterR = waterTile(F, 1, r);
    out.convL = convTile(F, -1, r);
    out.convR = convTile(F, 1, r);
    return out;
  }

  function bakeAll() {
    if (state.ready) return;
    /* 任一纹理加载失败 → 视为未就绪，继续用原美术（不做半套替换） */
    if (Object.keys(state.failed).length) {
      state.ready = false;
      API.ready = false;
      window.PQAI_TILES_READY = false;
      return;
    }
    try {
      for (var i = 0; i < FAM_KEYS.length; i++) {
        var k = FAM_KEYS[i];
        state.baked[k] = buildFamily(k);
      }
      state.ready = true;
      API.ready = true;
      window.PQAI_TILES_READY = true;
      flush();
    } catch (e) {
      /* 任何烘焙异常 → 保持未就绪，buildThemeArt 继续返回原美术 */
      state.ready = false;
      API.ready = false;
      window.PQAI_TILES_READY = false;
    }
  }

  /* ==================== 包装 buildThemeArt ==================== */
  function themeKey(key) {
    var themes = null;
    try { if (typeof THEMES !== 'undefined') themes = THEMES; } catch (e) { themes = null; }
    if (!themes) themes = window.THEMES;
    if (themes && Object.prototype.hasOwnProperty.call(themes, key)) return key;
    return 'grass';
  }

  function decorate(art, keyIn) {
    if (!state.ready || !art || typeof art !== 'object') return art;
    var tiles = art.tiles;
    if (!tiles || typeof tiles !== 'object') return art;
    var fam = FAMILY[themeKey(keyIn)] || 'grass';
    var A = state.baked[fam];
    if (!A) return art;
    for (var k in A) {
      if (!Object.prototype.hasOwnProperty.call(A, k)) continue;
      if (!Object.prototype.hasOwnProperty.call(tiles, k)) continue; // 原美术没有的键不新增
      if (A[k]) tiles[k] = A[k];
    }
    return art;
  }

  function install() {
    if (state.installed) return true;
    var orig = null;
    try { if (typeof buildThemeArt === 'function') orig = buildThemeArt; } catch (e) { orig = null; }
    if (!orig) orig = window.buildThemeArt;
    if (typeof orig !== 'function') return false;
    if (orig.__aiTiles) { state.installed = true; return true; }

    var wrapped = function (themeKeyIn) {
      var art = orig(themeKeyIn);
      try { decorate(art, themeKeyIn); } catch (e) { /* AI 瓦片失败不影响原美术 */ }
      return art;
    };
    wrapped.__aiTiles = true;

    try { buildThemeArt = wrapped; } catch (e) { /* 常量绑定时走 window */ }
    try { window.buildThemeArt = wrapped; } catch (e2) { /* 静默 */ }
    state.installed = true;
    return true;
  }

  API.make16 = make16;
  API.buildFamily = buildFamily;
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
