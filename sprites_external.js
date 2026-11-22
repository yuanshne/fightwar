/* sprites_external.js —— 用 Kenney CC0 高完成度精灵覆盖 art.js 程序化 SPR。
 * 约束：
 *   · 只读取 assets/kenney/sprites.png + sprites.json（或 assets_loader 暴露的 manifest/PQASSETS）。
 *   · 每个覆盖帧的 canvas 尺寸 = 被覆盖的原 SPR 帧尺寸（保持比例、底部居中、透明补边），
 *     因此 ui.js 现有绘制偏移、命中框、缩放/翻转逻辑全部不变。
 *   · 任何加载/解析/绘制失败 → 静默不操作。成功覆盖后置 window.PQSPRITES_READY = true。
 * 加载顺序：assets_loader.js（可选）→ art.js → ui.js → 本文件（放最后即可，资产就绪后自动 patch）。 */
(function (root) {
  'use strict';

  var IMG_PATH = 'assets/kenney/sprites.png?v=45';
  var ATLAS_PATH = 'assets/kenney/sprites.json?v=45';
  var MANIFEST_PATH = 'assets/kenney/manifest.json?v=45';

  var FRAMES = null;       // name -> {x,y,w,h}
  var ATLAS_IMG = null;    // HTMLImageElement
  var started = false;
  var patchStarted = false;

  root.PQSPRITES_READY = false;

  /* ---------- 基础绘制工具 ---------- */
  function makeCanvas(w, h) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    var c = document.createElement('canvas');
    c.width = Math.max(1, w | 0);
    c.height = Math.max(1, h | 0);
    return c;
  }

  function ctx2d(c) {
    var g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    if ('mozImageSmoothingEnabled' in g) g.mozImageSmoothingEnabled = false;
    if ('webkitImageSmoothingEnabled' in g) g.webkitImageSmoothingEnabled = false;
    if ('msImageSmoothingEnabled' in g) g.msImageSmoothingEnabled = false;
    return g;
  }

  function normalizeFrame(def) {
    if (!def) return null;
    var f = def.frame || def;
    if (typeof f.x !== 'number' || typeof f.y !== 'number' ||
        typeof f.w !== 'number' || typeof f.h !== 'number' || f.w <= 0 || f.h <= 0) return null;
    return { x: f.x, y: f.y, w: f.w, h: f.h };
  }

  function frameRect(name) {
    return normalizeFrame(FRAMES && FRAMES[name]);
  }

  /* 裁剪单帧 → 可选 tint → nearest-neighbor 等比缩放并底部居中到目标尺寸 */
  function makeFrame(name, tw, th, tintColor, tintAmount) {
    var r = frameRect(name);
    if (!r || !ATLAS_IMG) return null;
    var crop = makeCanvas(r.w, r.h);
    if (!crop) return null;
    var g = ctx2d(crop);
    g.drawImage(ATLAS_IMG, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    if (tintColor) crop = tintCanvas(crop, tintColor, tintAmount);
    return fitCanvas(crop, tw, th);
  }

  function fitCanvas(src, tw, th) {
    var sw = src.width, sh = src.height;
    if (!sw || !sh) return null;
    var scale = Math.min(tw / sw, th / sh);
    var dw = Math.max(1, Math.min(tw, Math.round(sw * scale)));
    var dh = Math.max(1, Math.min(th, Math.round(sh * scale)));
    var c = makeCanvas(tw, th);
    if (!c) return null;
    var g = ctx2d(c);
    g.drawImage(src, Math.round((tw - dw) / 2), th - dh, dw, dh);
    return c;
  }

  function flipCanvas(src) {
    var c = makeCanvas(src.width, src.height);
    if (!c) return null;
    var g = ctx2d(c);
    g.translate(src.width, 0);
    g.scale(-1, 1);
    g.drawImage(src, 0, 0);
    return c;
  }

  function tintCanvas(src, color, amount) {
    var c = makeCanvas(src.width, src.height);
    if (!c) return null;
    var g = ctx2d(c);
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = typeof amount === 'number' ? amount : 0.55;
    g.fillStyle = color;
    g.fillRect(0, 0, src.width, src.height);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    return c;
  }

  /* 受击白闪：优先复用全局 whiteOf/_whiteVariant，否则 source-atop 全白剪影 */
  function makeWhite(src) {
    try {
      if (typeof root.whiteOf === 'function') {
        var w1 = root.whiteOf(src);
        if (w1) return w1;
      }
      if (typeof root._whiteVariant === 'function') {
        var w2 = root._whiteVariant(src);
        if (w2) return w2;
      }
    } catch (e) { /* 继续走本地兜底 */ }
    var c = makeCanvas(src.width, src.height);
    if (!c) return src;
    var g = ctx2d(c);
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = 0.88;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, src.width, src.height);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    return c;
  }

  /* ---------- 帧数据加载 ---------- */
  function atlasFrames(json) {
    return json && json.frames && typeof json.frames === 'object' ? json.frames : null;
  }

  function manifestFrames(manifest) {
    return manifest && manifest.sprites && manifest.sprites.frames &&
      typeof manifest.sprites.frames === 'object' ? manifest.sprites.frames : null;
  }

  function fetchJSON(url, cb) {
    if (typeof fetch !== 'function') return cb(null);
    try {
      fetch(url)
        .then(function (res) {
          if (!res || !res.ok) throw new Error('request failed');
          return res.json();
        })
        .then(function (json) { cb(json); })
        .catch(function () { cb(null); });
    } catch (e) { cb(null); }
  }

  function loadFrames(cb) {
    if (FRAMES) return cb(true);
    fetchJSON(ATLAS_PATH, function (json) {
      var f = atlasFrames(json);
      if (f) { FRAMES = f; return cb(true); }
      fetchJSON(MANIFEST_PATH, function (manifest) {
        var mf = manifestFrames(manifest);
        if (mf) { FRAMES = mf; return cb(true); }
        cb(false);
      });
    });
  }

  function handleAssets(api) {
    if (!api || typeof api.get !== 'function') return;
    ATLAS_IMG = api.get('sprites');
    if (!ATLAS_IMG) return;
    if (!FRAMES) FRAMES = manifestFrames(api.manifest);
    loadFrames(function (ok) {
      if (ok) waitAndPatch();
    });
  }

  /* PQASSETS 缺失时的自加载（页面未挂 assets_loader 也能工作；失败即无操作） */
  function fallbackLoad() {
    if (typeof document === 'undefined' || typeof Image !== 'function') return;
    var img = new Image();
    img.onload = function () {
      ATLAS_IMG = img;
      loadFrames(function (ok) {
        if (ok) waitAndPatch();
      });
    };
    img.onerror = function () { /* 加载失败：无操作 */ };
    img.src = IMG_PATH;
  }

  function begin() {
    if (started) return;
    started = true;
    if (root.PQASSETS && typeof root.PQASSETS.onReady === 'function') {
      root.PQASSETS.onReady(function (api) { handleAssets(api); });
      return;
    }
    fallbackLoad();
  }

  /* ---------- 覆盖 SPR ---------- */
  function currentSize(key) {
    var v;
    try { v = SPR[key]; } catch (e) { return null; }
    var f = Array.isArray(v) ? v[0] : v;
    if (f && typeof f.width === 'number' && typeof f.height === 'number' &&
        f.width > 0 && f.height > 0) return { w: f.width, h: f.height };
    return null;
  }

  function waitAndPatch() {
    if (patchStarted) return;
    patchStarted = true;
    var tries = 0;
    function poll() {
      var ready = false;
      try { ready = (typeof SPR !== 'undefined') && SPR && !!SPR.heroIdle1; } catch (e) { ready = false; }
      if (ready) { applyPatch(); return; }
      if (++tries > 900) return; // ~15s 后放弃（无操作）
      setTimeout(poll, 16);
    }
    poll();
  }

  function applyPatch() {
    try {
      // AI 高精度皮肤已就绪时，不再用 Kenney 帧覆盖主角/敌人，避免后加载把 AI 帧压回去。
      if (root.PQAI_ART_READY) { root.PQSPRITES_READY = true; return; }
      var sizeKeys = [
        'heroIdle1', 'heroIdle2', 'heroRun', 'heroJump', 'heroFall',
        'heroAttack', 'heroDash', 'heroSquash',
        'heroIdle1L', 'heroIdle2L', 'heroRunL', 'heroJumpL', 'heroFallL',
        'heroAttackL', 'heroDashL', 'heroSquashL',
        'slime', 'bat', 'beetle', 'beetleDead', 'spitter', 'hopper',
        'hopperDead', 'jelly', 'mage', 'lancer', 'knight'
      ];
      var sizes = {};
      for (var si = 0; si < sizeKeys.length; si++) sizes[sizeKeys[si]] = currentSize(sizeKeys[si]);
      // L 键原尺寸缺失时沿用本体尺寸
      var lPairs = [
        ['heroIdle1L', 'heroIdle1'], ['heroIdle2L', 'heroIdle2'], ['heroRunL', 'heroRun'],
        ['heroJumpL', 'heroJump'], ['heroFallL', 'heroFall'], ['heroAttackL', 'heroAttack'],
        ['heroDashL', 'heroDash'], ['heroSquashL', 'heroSquash']
      ];
      for (var li = 0; li < lPairs.length; li++) {
        if (!sizes[lPairs[li][0]]) sizes[lPairs[li][0]] = sizes[lPairs[li][1]];
      }

      var plan = {};
      function build(key, srcNames, asArray, tintColor, tintAmount) {
        var s = sizes[key];
        if (!s) return null;
        var out = [];
        for (var i = 0; i < srcNames.length; i++) {
          var c = makeFrame(srcNames[i], s.w, s.h, tintColor, tintAmount);
          if (!c) return null;
          out.push(c);
        }
        if (!out.length) return null;
        return asArray ? out : out[0];
      }
      function addFlip(key, baseKey, asArray) {
        var v = plan[baseKey];
        if (!v) return;
        plan[key] = asArray ? v.map(flipCanvas) : flipCanvas(v);
      }

      // 玩家：pip-big 系列 → 原 hero* 的 16×16 目标框
      plan.heroIdle1 = build('heroIdle1', ['pip-big-idle'], false);
      plan.heroIdle2 = build('heroIdle2', ['pip-big-walk'], false);
      plan.heroRun = build('heroRun', [
        'pip-big-walk', 'pip-big-walk-b', 'pip-big-walk',
        'pip-big-walk-b', 'pip-big-walk', 'pip-big-walk-b'
      ], true);
      plan.heroJump = build('heroJump', ['pip-big-jump'], false);
      plan.heroFall = build('heroFall', ['pip-big-fall'], false);
      plan.heroAttack = build('heroAttack', ['pip-big-skid'], false);
      plan.heroDash = build('heroDash', ['pip-big-jump'], false);
      plan.heroSquash = build('heroSquash', ['pip-big-duck'], false);

      // 所有 *L 键 = 已缩放帧的水平翻转
      addFlip('heroIdle1L', 'heroIdle1', false);
      addFlip('heroIdle2L', 'heroIdle2', false);
      addFlip('heroRunL', 'heroRun', true);
      addFlip('heroJumpL', 'heroJump', false);
      addFlip('heroFallL', 'heroFall', false);
      addFlip('heroAttackL', 'heroAttack', false);
      addFlip('heroDashL', 'heroDash', false);
      addFlip('heroSquashL', 'heroSquash', false);

      // 敌人：目标尺寸一律取原 SPR 帧（数组取首帧）尺寸
      plan.slime = build('slime', ['walker-0', 'walker-1'], true);
      plan.bat = build('bat', ['flyer-0', 'flyer-1', 'flyer-2'], true);
      plan.beetle = build('beetle', ['shelled-0', 'shelled-1'], true);
      plan.beetleDead = build('beetleDead', ['shelled-shell'], false);
      plan.spitter = build('spitter', ['spitter-0', 'spitter-1'], true);
      plan.hopper = build('hopper', ['jumper-0', 'jumper-1'], true);
      plan.hopperDead = build('hopperDead', ['walker-flat'], false);
      plan.jelly = build('jelly', ['flyer-0', 'flyer-1'], true, '#5cb8ff', 0.55);
      plan.mage = build('mage', ['spitter-0', 'spitter-1'], true, '#9a5cff', 0.60);
      plan.lancer = build('lancer', ['spiker-0', 'spiker-1'], true);

      // 骑士：仅当原帧确为 14×18 时才用 spiker 两帧放大；否则保留程序化
      var kf = null;
      try { kf = SPR.knight && SPR.knight[0]; } catch (e) { kf = null; }
      if (kf && kf.width === 14 && kf.height === 18) {
        plan.knight = build('knight', ['spiker-0', 'spiker-1'], true);
      }

      var count = 0;
      for (var key in plan) {
        if (!Object.prototype.hasOwnProperty.call(plan, key) || !plan[key]) continue;
        SPR[key] = plan[key];
        count++;
      }
      if (!count) return;

      // 若存在同名 *White 受击白闪键，则按新帧同步重建（Boss 的 White 是部件对象，不会被这里触碰）
      for (var wk in plan) {
        if (!Object.prototype.hasOwnProperty.call(plan, wk)) continue;
        var wkey = wk + 'White';
        var oldWhite;
        try {
          if (!Object.prototype.hasOwnProperty.call(SPR, wkey)) continue;
          oldWhite = SPR[wkey];
        } catch (e) { continue; }
        var newVal = SPR[wk];
        if (oldWhite && typeof oldWhite.getContext === 'function' &&
            newVal && typeof newVal.getContext === 'function') {
          SPR[wkey] = makeWhite(newVal);
        } else if (Array.isArray(oldWhite) && Array.isArray(newVal)) {
          SPR[wkey] = newVal.map(makeWhite);
        }
      }

      // ui 默认皮肤 blue 在 buildSprites 末尾缓存的是旧 hero* 引用；删除后按新键重建
      try {
        if (typeof SPR !== 'undefined' && SPR.skins && SPR.skins.blue) {
          delete SPR.skins.blue;
          if (typeof getHeroSkin === 'function') getHeroSkin('blue');
        }
      } catch (e) { /* 皮肤缓存重建失败不影响 SPR 已覆盖帧 */ }

      root.PQSPRITES_READY = true;
    } catch (e) {
      // 任一步异常 → 不置 READY；已成功写入的键保持（覆盖是纯增益，不会破坏兜底）
    }
  }

  /* ---------- 启动 ---------- */
  if (typeof document === 'undefined') return;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', begin);
  } else {
    begin();
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
