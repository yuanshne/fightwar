/* combatfx.js — v33 战斗演出模块（纯 Canvas2D，自包含，不依赖 ui.js 内部符号）。
   暴露 window.PQCOMBAT.renderWorld / renderScreen。
   所有渐变与字体测量按 ctx 缓存；每帧最多 120 次笔画/粒子，预算耗尽时静默降级。
   字段缺失（game/level/enemies/shots/fxEvents/p）一律静默跳过。 */
(function () {
  'use strict';

  /* ---------- AI 特效贴图：确保 ai_vfx.js 先于本模块可用（失败静默） ---------- */
  (function ensureAIVfx() {
    try {
      if (typeof window === 'undefined' || window.PQAI_VFX) return;
      if (typeof document === 'undefined') return;
      // 解析期写入 → 与后续脚本同序执行；若本模块被动态插入则改用 appendChild
      if (document.readyState === 'loading' && typeof document.write === 'function') {
        document.write('<script src="ai_vfx.js?v=1"><\/script>');
      } else {
        var sc = document.createElement('script');
        sc.src = 'ai_vfx.js?v=1';
        (document.head || document.documentElement).appendChild(sc);
      }
    } catch (e) { /* 静默降级到程序化特效 */ }
  })();

  var VW = 384, VH = 224;
  var FONT_BIG = 'bold 26px "KaiTi","STKaiti","SimSun",serif';
  var FONT_SEAL = 'bold 11px "KaiTi","STKaiti","SimSun",serif';
  var CYAN = '#c9fbff', CYAN2 = '#4fe3ff', JADE = '#24c9a6';
  var GOLD = '#ffd76a', GOLD2 = '#e39a32';
  var VERM = '#d23b2d', INK = '#121018', CREAM = '#fff2cf';

  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function round(v) { return Math.round(v); }
  function easeOut(k) { k = clamp(k, 0, 1); return 1 - (1 - k) * (1 - k); }
  function ctxOk(ctx) { return !!ctx && typeof ctx.save === 'function' && typeof ctx.beginPath === 'function'; }

  /* ---------- 字体测量缓存（key=font|text） ---------- */
  var _textW = {};
  function textWidth(ctx, txt, font) {
    var key = font + '|' + txt;
    if (_textW[key] !== undefined) return _textW[key];
    var w = 0;
    if (ctx && typeof ctx.measureText === 'function') {
      try {
        ctx.save(); ctx.font = font;
        var m = ctx.measureText(txt);
        if (m && isFinite(m.width)) w = m.width;
        ctx.restore();
      } catch (e) { w = 0; }
    }
    if (!w) w = txt.length * 14;
    _textW[key] = w;
    return w;
  }

  /* ---------- 渐变缓存（按 ctx 对象，坐标固定为屏幕坐标） ---------- */
  var _gmaps = (typeof WeakMap === 'function') ? new WeakMap() : null;
  var _glist = [];
  function _gmap(ctx) {
    if (_gmaps) {
      var m = _gmaps.get(ctx);
      if (!m) { m = {}; _gmaps.set(ctx, m); }
      return m;
    }
    for (var i = 0; i < _glist.length; i++) if (_glist[i].ctx === ctx) return _glist[i].map;
    var o = { ctx: ctx, map: {} };
    _glist.push(o);
    return o.map;
  }
  function radial(ctx, key, r0, r1, stops) {
    var m = _gmap(ctx), g = m[key];
    if (g) return g;
    if (typeof ctx.createRadialGradient !== 'function') return null;
    try {
      g = ctx.createRadialGradient(VW / 2, VH / 2, r0, VW / 2, VH / 2, r1);
      for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
      m[key] = g;
      return g;
    } catch (e) { return null; }
  }
  var FLASH_STOPS = [
    [0, 'rgba(255,255,255,0.95)'], [0.35, 'rgba(255,246,208,0.80)'],
    [0.75, 'rgba(255,206,102,0.55)'], [1, 'rgba(255,188,66,0.20)']
  ];
  var EDGE_STOPS = [
    [0, 'rgba(255,205,90,0)'], [0.55, 'rgba(255,190,70,0.10)'],
    [0.82, 'rgba(255,168,48,0.38)'], [1, 'rgba(255,140,30,0.90)']
  ];
  var VIG_STOPS = [
    [0, 'rgba(10,4,8,0)'], [0.60, 'rgba(20,6,10,0.05)'],
    [0.86, 'rgba(90,18,14,0.35)'], [1, 'rgba(30,4,6,0.85)']
  ];

  /* ---------- 每帧预算：世界 96 + 屏幕 24 = 120 次笔画/粒子 ---------- */
  var _budget = 120;
  /* AI 贴图每帧最多 6 次 drawImage（与笔画预算独立）；只影响画面，不参与判定 */
  var _imgBudget = 6, _aiShotN = 0;
  function beginWorld() { _budget = 96; _imgBudget = 6; _aiShotN = 0; }
  function beginScreen() { _budget = 24; }
  function take(n) {
    n = n || 1;
    if (_budget < n) return false;
    _budget -= n;
    return true;
  }

  /* ---------- AI 贴图接入（懒加载：首次取图时按需发起；未就绪返回 null，绘制静默跳过） ---------- */
  function aiImg(name) {
    var A = (typeof window !== 'undefined') ? window.PQAI_VFX : null;
    if (!A) return null;
    try { if (typeof A.ensure === 'function') A.ensure(name); } catch (e) { /* 静默 */ }
    var im = (typeof A.get === 'function') ? A.get(name) : A[name];
    return (im && im.width > 0 && im.height > 0) ? im : null;
  }
  function aiDraw(ctx, img, x, y, size, alpha, rot, flipX) {
    if (!img || !(size > 0) || !(alpha > 0.01) || _imgBudget <= 0) return false;
    if (!ctxOk(ctx)) return false;
    _imgBudget--;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    if (flipX) ctx.scale(-1, 1);
    try {
      ctx.drawImage(img, -size * 0.5, -size * 0.5, size, size);
    } catch (e) { /* 静默 */ }
    ctx.restore();
    return true;
  }
  function aiFxImage(type) {
    var tp = String(type || '').toLowerCase();
    function pick(name, base, grow, alpha) {
      var im = aiImg(name);
      return im ? { img: im, base: base, grow: grow, a: alpha } : null;
    }
    if (/fire|flame|burn|explo/.test(tp)) return pick('fire', 26, 58, 0.95);
    if (/poison|toxic|bile|venom|plague|acid/.test(tp)) return pick('poison', 22, 40, 0.90);
    if (/heal|holy|regen|bless/.test(tp)) return pick('heal', 28, 52, 0.85);
    if (/light|bolt|thunder|shock|spark|static/.test(tp)) return pick('lightning', 34, 46, 0.90);
    if (/shadow|dark|void|curse|umbra|nether/.test(tp)) return pick('shadow', 24, 44, 0.90);
    return null;
  }

  function visible(x, y, game, m) {
    var c = game && game.cam;
    if (!c) return true;
    return !(x < num(c.x, 0) - m || x > num(c.x, 0) + VW + m ||
      y < num(c.y, 0) - m || y > num(c.y, 0) + VH + m);
  }

  /* ---------- 通用笔画 ---------- */
  function arc(ctx, cx, cy, r, a0, a1, lw, color, alpha, glow) {
    if (!(alpha > 0) || !(r > 0)) return;
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    if (glow) ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke();
    ctx.restore();
  }

  function calligraphy(ctx, text, x, y, scale, alpha, fill, edge) {
    if (!(alpha > 0) || !text) return;
    ctx.save();
    ctx.translate(round(x), round(y));
    var s = num(scale, 1);
    ctx.scale(s, s);
    ctx.font = FONT_BIG;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(10,6,10,0.88)'; ctx.strokeText(text, 0, 0);
    if (edge) { ctx.lineWidth = 3.5; ctx.strokeStyle = edge; ctx.strokeText(text, 0, 0); }
    ctx.fillStyle = fill || CREAM;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  /* ---------- 攻击刀光拖尾（2~3 层弯月弧） ---------- */
  function drawSlash(ctx, game, p, tick) {
    if (game.hero === 'mage') return;                  // 法师无近战弧光
    var anim = num(p.atkAnim, 0), t = num(p.atkT, 0);
    if (!(anim > 0 || t > 0)) return;
    var prog = anim > 0 ? clamp((0.25 - anim) / 0.25, 0, 1) : clamp(1 - t / 0.12, 0, 1);
    var fade = clamp(1 - prog * 0.65, 0.15, 1);
    var dx = num(p.face, 1) < 0 ? -1 : 1;
    var down = p.atkDir === 'down';
    if (!take(10)) return;

    ctx.save();
    if (down) {
      ctx.translate(round(num(p.x, 0) + num(p.w, 10) / 2), round(num(p.y, 0) + num(p.h, 14) + 2));
      ctx.rotate(Math.PI / 2);
    } else {
      ctx.translate(round(num(p.x, 0) + num(p.w, 10) / 2 + dx * 6), round(num(p.y, 0) + num(p.h, 14) / 2));
      if (dx < 0) ctx.scale(-1, 1);
      ctx.scale(1, 0.9);
    }
    var a0 = down ? -1.35 : -1.2, a1 = down ? 1.35 : 1.0;
    // 由外到内：青色辉光 → 金色外沿 → 青白内芯
    for (var i = 2; i >= 0; i--) {
      var q = prog - i * 0.14;
      if (q <= 0) continue;
      var r = (down ? 10 : 12) + q * (down ? 18 : 16);
      if (i === 2) arc(ctx, 0, 0, r + 2, a0, a1, 8, 'rgba(70,210,255,0.45)', 0.22 * fade, true);
      else if (i === 1) arc(ctx, 0, 0, r, a0, a1, 3.2, GOLD, 0.70 * fade, true);
      else arc(ctx, 0, 0, r, a0 * 0.84, a1 * 0.85, 1.5, '#ffffff', 0.95 * fade, false);
    }
    // 金色火星（沿刃口）
    ctx.globalCompositeOperation = 'lighter';
    for (var j = 0; j < 4; j++) {
      var qa = prog - j * 0.05;
      if (qa <= 0) continue;
      var aa = a0 + (a1 - a0) * (0.18 + 0.74 * qa);
      var rr = (down ? 14 : 15) + qa * 17;
      ctx.globalAlpha = 0.55 * fade;
      ctx.fillStyle = j % 2 ? GOLD : CYAN;
      ctx.fillRect(round(Math.cos(aa) * rr), round(Math.sin(aa) * rr), 2, 2);
    }
    // AI 金色月牙（叠在原刀光之上；face/down 由上方变换继承，未就绪自动跳过）
    var slashImg = aiImg('slash');
    if (slashImg) {
      var ssize = (down ? 20 : 24) + (down ? 34 : 30) * prog;
      aiDraw(ctx, slashImg, 0.20 * ssize, 0, ssize,
        0.55 * fade * (0.35 + 0.65 * prog), 0, false);
    }
    ctx.restore();
  }

  /* ---------- 程序化龙首（分层弧线/犄角/须/鳞片/金色残影） ---------- */
  function dragonHead(ctx, cx, cy, dir, sc, t, alpha) {
    var a = clamp(num(alpha, 1), 0, 1);
    if (a <= 0.01 || !(sc > 0)) return;
    if (!take(24)) return;
    ctx.save();
    ctx.translate(round(cx), round(cy));
    ctx.scale((dir < 0 ? -1 : 1) * sc, sc);
    ctx.globalAlpha = a;

    // 金色残影（向后拖 3 层）
    for (var i = 3; i >= 1; i--) {
      ctx.save();
      ctx.translate(-i * 7, Math.sin(t * 3 + i) * 1.2);
      ctx.globalAlpha = a * 0.12 * (4 - i);
      ctx.fillStyle = GOLD;
      ctx.beginPath();
      ctx.moveTo(9, 0);
      ctx.quadraticCurveTo(1, -6, -8, 0);
      ctx.quadraticCurveTo(1, 5, 9, 0);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // 外发光
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a * 0.35;
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, 14, 0, 6.283); ctx.stroke();
    ctx.restore();
    // 鬃毛：分层弧线
    ctx.lineCap = 'round';
    for (i = 0; i < 3; i++) {
      ctx.globalAlpha = a * (0.55 - i * 0.12);
      ctx.strokeStyle = i === 1 ? CYAN2 : GOLD2;
      ctx.lineWidth = 2 - i * 0.4;
      ctx.beginPath();
      ctx.arc(-7, 0, 7 + i * 3, 1.65 - i * 0.15, 4.55 + i * 0.12);
      ctx.stroke();
    }
    ctx.globalAlpha = a;
    // 头骨
    ctx.beginPath();
    ctx.moveTo(13, 0);
    ctx.quadraticCurveTo(9, -5.5, 2, -7);
    ctx.quadraticCurveTo(-5, -8.5, -10, -4);
    ctx.quadraticCurveTo(-13, -2, -13, 1);
    ctx.quadraticCurveTo(-9, 6, -2, 6);
    ctx.quadraticCurveTo(6, 6, 13, 0);
    ctx.closePath();
    ctx.fillStyle = '#0d3b46'; ctx.fill();
    // 青色高光
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.quadraticCurveTo(5, -4.5, 0, -5);
    ctx.quadraticCurveTo(-4, -5, -7, -2);
    ctx.quadraticCurveTo(-3, 2, 2, 3);
    ctx.quadraticCurveTo(7, 2, 10, 0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(45,205,175,0.85)'; ctx.fill();
    // 犄角
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-4, -6); ctx.quadraticCurveTo(-9, -12, -14, -13); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-1, -6.5); ctx.quadraticCurveTo(-3, -12, -7, -15); ctx.stroke();
    // 龙须（随 t 摆动）
    var w1 = Math.sin(t * 6) * 1.6, w2 = Math.cos(t * 5) * 1.4;
    ctx.strokeStyle = 'rgba(190,250,255,0.9)'; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(11, 0.5); ctx.quadraticCurveTo(17, -2 + w1, 22, -1 + w2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(10, 2.5); ctx.quadraticCurveTo(16, 4 - w1, 20, 4.5 + w2); ctx.stroke();
    // 眼
    ctx.fillStyle = '#fff6d8'; ctx.beginPath(); ctx.arc(6, -2.2, 2.1, 0, 6.283); ctx.fill();
    ctx.fillStyle = VERM; ctx.beginPath(); ctx.arc(6.7, -2.2, 1, 0, 6.283); ctx.fill();
    // 牙
    ctx.fillStyle = '#eefcff';
    ctx.fillRect(9, 2.2, 1.4, 2.2);
    ctx.fillRect(11, 1.2, 1.2, 1.8);
    // 鳞片点
    for (i = 0; i < 6; i++) {
      ctx.globalAlpha = a * (0.5 + 0.08 * i);
      ctx.fillStyle = i % 2 ? GOLD : CYAN2;
      ctx.fillRect(-3 - i * 2.1, -2 + (i % 2), 1.4, 1.4);
    }
    ctx.restore();
  }

  /* ---------- AI 青玉龙图（PQAI_BG 就绪时接管；未就绪返回 false 走程序化龙） ---------- */
  function aiDragonImg(gold) {
    var B = (typeof window !== 'undefined') ? window.PQAI_BG : null;
    if (!B || !B.ready) return null;
    var v = gold ? (B.dragonGold || B.dragon) : (B.dragon || null);
    return (v && v.width) ? v : null;
  }

  function drawDragonImage(ctx, cx, cy, dir, size, alpha, t, after) {
    if (!(size > 0) || !(alpha > 0.01)) return false;
    var img = aiDragonImg(false);
    if (!img) return false;
    if (!take(4)) return false;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(round(cx), round(cy));
    if (dir < 0) ctx.scale(-1, 1);
    // 金色残影：沿运动反向拖 3 层（黑底在 lighter 下不产生方框）
    if (after) {
      var gimg = aiDragonImg(true) || img;
      for (var i = 3; i >= 1; i--) {
        var s2 = size * (1 - i * 0.08);
        ctx.globalAlpha = clamp(alpha * 0.10 * (4 - i), 0, 1);
        try { ctx.drawImage(gimg, -s2 / 2 - i * size * 0.11, -s2 / 2 + i, s2, s2); } catch (e) { /* 静默 */ }
      }
    }
    ctx.globalAlpha = clamp(alpha, 0, 1);
    if (t) ctx.rotate(Math.sin(t * 5) * 0.045);
    try { ctx.drawImage(img, -size / 2, -size / 2, size, size); } catch (e) { /* 静默 */ }
    // 青色外发光，保证在暗背景上仍有轮廓
    ctx.globalAlpha = clamp(alpha * 0.32, 0, 1);
    ctx.strokeStyle = 'rgba(90,240,210,0.75)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, size * 0.48, 0, 6.283); ctx.stroke();
    ctx.restore();
    return true;
  }

  function drawShotDragon(ctx, s, tick) {
    var w = num(s.w, 20), h = num(s.h, 14);
    var cx = num(s.x, 0) + w / 2, cy = num(s.y, 0) + h / 2;
    var dir = num(s.face, 0);
    if (!dir) dir = num(s.vx, 0) < 0 ? -1 : 1;
    var sc = clamp(Math.max(w, h) / 22, 0.55, 1.8);
    var t = num(s.t, num(s.age, tick * 0.05));
    var a = isFinite(+s.life) ? clamp(num(s.life, 1) / 0.18, 0, 1) : 1;
    // AI 龙图：按弹体尺寸取 2.1 倍，随飞行轻微放大
    var grow = 1 + 0.18 * clamp(t / 0.4, 0, 1);
    if (drawDragonImage(ctx, cx, cy, dir, clamp(Math.max(w, h) * 2.1, 42, 96) * grow, a, t, true)) return;
    dragonHead(ctx, cx, cy, dir, sc, t, a);
  }

  /* ---------- 剑波：保留青色月牙，补 2 层残影与更强的扩张 ---------- */
  function drawWave(ctx, s, tick) {
    if (!take(10)) return;
    var w = num(s.w, 14), h = num(s.h, 14);
    var cx = num(s.x, 0) + w / 2, cy = num(s.y, 0) + h / 2;
    var vx = num(s.vx, 0), vy = num(s.vy, 0);
    var dir = vx < 0 ? -1 : 1;
    var t = num(s.t, tick * 0.05);
    var a = isFinite(+s.life) ? clamp(num(s.life, 1) / 0.18, 0, 1) : 1;
    var pulse = 0.92 + 0.08 * Math.sin(t * 10);
    // 飞行进程 0→1：月牙随寿命外扩，末段明显张开
    var k = 1 - clamp(num(s.life, 0.45) / 0.45, 0, 1);
    var grow = 1 + 0.5 * k;
    var sp = Math.sqrt(vx * vx + vy * vy);
    var ux = sp > 1 ? vx / sp : dir, uy = sp > 1 ? vy / sp : 0;
    var tilt = vy ? Math.atan2(vy, Math.abs(vx) || 1) : 0;
    // 2 层运动残影（沿 -v 偏移，alpha 0.18 / 0.10）
    for (var g = 2; g >= 1; g--) {
      ctx.save();
      ctx.translate(round(cx - ux * 6 * g), round(cy - uy * 6 * g));
      if (dir < 0) ctx.scale(-1, 1);
      if (tilt) ctx.rotate(tilt);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (g === 1 ? 0.18 : 0.10) * a;
      ctx.strokeStyle = CYAN2;
      ctx.lineWidth = g === 1 ? 2 : 1.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(-3 - g * 3, 0, (9 + 2 * pulse) * grow * (1 - g * 0.08), -1.1, 1.1);
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(round(cx), round(cy));
    if (dir < 0) ctx.scale(-1, 1);
    if (tilt) ctx.rotate(tilt);
    ctx.globalAlpha = a;
    arc(ctx, -2, 0, (9 + 2 * pulse) * grow, -1.15, 1.15, 6, 'rgba(70,220,255,0.45)', 0.5 * a, true);
    arc(ctx, -3, 0, 9 * pulse * grow, -1.05, 1.05, 2, CYAN2, 0.85 * a, true);
    arc(ctx, -4, 0, 8.5 * pulse * grow, -0.9, 0.9, 1, '#ffffff', 0.95 * a, false);
    // 更明显的扩张：最外圈细弧随进程外扩并淡出
    arc(ctx, -2, 0, 10 + 14 * k, -0.95, 0.95, 1, 'rgba(150,245,255,0.7)', 0.5 * a * (1 - 0.6 * k), true);
    // AI 青蓝剑波（方向由上方 flip 决定；随寿命扩张/微旋/淡出，保留原月牙）
    var waveImg = aiImg('wave');
    if (waveImg) {
      var wsize = (18 + 16 * k) * (0.94 + 0.06 * pulse);
      aiDraw(ctx, waveImg, 0.20 * wsize, 0, wsize,
        0.55 * a * (1 - 0.35 * k), 0.12 * k, false);
    }
    ctx.restore();
  }

  /* ---------- v34：非龙弹体运动层 ----------
     相位只用 s.t（缺省回退 tick）与 s.life，无随机；每弹体常规 4 次几何
     （2 层拖尾 + 本体填充/描边），寿终 0.12s 换成 7 次爆散（2 环 + 5 星火）；
     全部走 take() 预算，同屏非龙弹体上限 14；消失侦测只读 game.shots，不写 game。 */
  var SHOT_STYLES = {
    bolt: { c: '#8ae8ff', c2: '#ffffff', shape: 'spark', spin: 3.2, r: 0.46 },
    shard: { c: '#a8e8ff', c2: '#ffffff', shape: 'shard', spin: 2.4, r: 0.46 },
    star: { c: '#ffd76a', c2: '#fff6d8', shape: 'star', spin: 2.6, r: 0.5 },
    fire: { c: '#ff9a3c', c2: '#ffe6a0', shape: 'orb', spin: 3.6, r: 0.5 },
    bile: { c: '#9ce050', c2: '#e8ffb8', shape: 'orb', spin: 2.2, r: 0.5 },
    note: { c: '#ffd76a', c2: '#fff2cf', shape: 'diamond', spin: 4.0, r: 0.52 },
    pink: { c: '#ff92dc', c2: '#ffe4f6', shape: 'diamond', spin: 3.4, r: 0.52 },
    bossBullet: { c: '#ff8a4a', c2: '#ffdca8', shape: 'star', spin: 2.8, r: 0.55 },
    mg: { c: '#8ae8ff', c2: '#ffffff', shape: 'spark', spin: 3.2, r: 0.46 },
    _: { c: CYAN2, c2: '#ffffff', shape: 'diamond', spin: 2.8, r: 0.5 }
  };

  function shotPath(ctx, shape, r) {
    ctx.beginPath();
    if (shape === 'orb') {
      ctx.arc(0, 0, r, 0, 6.283);
    } else if (shape === 'shard') {
      ctx.moveTo(0, -r * 1.25); ctx.lineTo(r * 0.72, 0);
      ctx.lineTo(0, r * 0.95); ctx.lineTo(-r * 0.72, 0);
    } else if (shape === 'star') {
      ctx.moveTo(0, -r * 1.2); ctx.lineTo(r * 0.34, -r * 0.34);
      ctx.lineTo(r * 1.2, 0); ctx.lineTo(r * 0.34, r * 0.34);
      ctx.lineTo(0, r * 1.2); ctx.lineTo(-r * 0.34, r * 0.34);
      ctx.lineTo(-r * 1.2, 0); ctx.lineTo(-r * 0.34, -r * 0.34);
    } else if (shape === 'spark') {
      ctx.moveTo(-r * 1.3, 0); ctx.lineTo(0, -r * 0.5);
      ctx.lineTo(r * 1.05, 0); ctx.lineTo(0, r * 0.5);
    } else {
      ctx.moveTo(0, -r * 1.1); ctx.lineTo(r * 0.95, 0);
      ctx.lineTo(0, r * 1.1); ctx.lineTo(-r * 0.95, 0);
    }
    ctx.closePath();
  }

  function ringBurst(ctx, x, y, k, st) {
    if (!take(7)) return false;
    var e = clamp(k, 0, 1), fade = 1 - e;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = st.c; ctx.lineWidth = 2;
    ctx.globalAlpha = 0.75 * fade;
    ctx.beginPath(); ctx.arc(x, y, 3 + 11 * e, 0, 6.283); ctx.stroke();
    ctx.strokeStyle = st.c2; ctx.lineWidth = 1;
    ctx.globalAlpha = 0.55 * fade;
    ctx.beginPath(); ctx.arc(x, y, 5 + 17 * e, 0, 6.283); ctx.stroke();
    ctx.fillStyle = st.c2;
    ctx.globalAlpha = 0.85 * fade;
    for (var i = 0; i < 5; i++) {
      var a = i * 1.2566 + e * 1.8, d = 4 + 13 * e;
      ctx.fillRect(round(x + Math.cos(a) * d), round(y + Math.sin(a) * d), 2, 2);
    }
    ctx.restore();
    return true;
  }

  function drawShotMotion(ctx, s, tick, idx) {
    var w = num(s.w, 8), h = num(s.h, 8);
    var cx = num(s.x, 0) + w / 2, cy = num(s.y, 0) + h / 2;
    var vx = num(s.vx, 0), vy = num(s.vy, 0);
    var sp = Math.sqrt(vx * vx + vy * vy);
    var ux = sp > 1 ? vx / sp : (num(s.face, 1) < 0 ? -1 : 1), uy = sp > 1 ? vy / sp : 0;
    var st = SHOT_STYLES[s.kind] || SHOT_STYLES._;
    var t = num(s.t, num(tick, 0) * 0.05) + idx * 1.7;
    var life = num(s.life, 1);
    var a = clamp(life / 0.1, 0, 1);
    var r = clamp(Math.max(w, h) * st.r, 2.6, 6.5);
    var wob = Math.sin(t * st.spin) * 0.42;                 // 小幅旋转/摆动
    var ps = 1 + 0.08 * (0.5 + 0.5 * Math.sin(t * 9));      // 1.00→1.08 脉动
    if (life <= 0.12) {                                     // 末段换成爆散
      ringBurst(ctx, cx, cy, 1 - clamp(life / 0.12, 0, 1), st);
      return;
    }
    // AI 弹体贴图：bolt→雷击 / shard→剑气（每帧最多 2 个弹体，避免压掉刀光/演出预算）
    if (_aiShotN < 2 && (s.kind === 'bolt' || s.kind === 'shard')) {
      var shotImg = aiImg(s.kind === 'bolt' ? 'lightning' : 'slash');
      if (shotImg) {
        _aiShotN++;
        aiDraw(ctx, shotImg, cx, cy,
          s.kind === 'bolt' ? 24 * ps : 20 * ps,
          (s.kind === 'bolt' ? 0.55 : 0.45) * a,
          s.kind === 'bolt' ? wob * 0.5 : Math.atan2(vy, vx || ux), false);
      }
    }
    if (!take(4)) return;
    // 2 层运动拖尾：沿 -v 偏移，alpha 0.18 / 0.10
    var off = clamp(4 + sp * 0.02, 4, 9);
    for (var g = 2; g >= 1; g--) {
      ctx.save();
      ctx.translate(cx - ux * off * g, cy - uy * off * g);
      ctx.rotate(wob * (1 - g * 0.3));
      ctx.scale(ps * (1 - g * 0.1), ps * (1 - g * 0.1));
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (g === 1 ? 0.18 : 0.10) * a;
      ctx.fillStyle = st.c;
      shotPath(ctx, st.shape, r);
      ctx.fill();
      ctx.restore();
    }
    // 本体运动壳：旋转 + 脉动 + 外沿高光（叠在既有精灵之上）
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(wob);
    ctx.scale(ps, ps);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.4 * a;
    ctx.fillStyle = st.c;
    shotPath(ctx, st.shape, r);
    ctx.fill();
    ctx.globalAlpha = 0.7 * a;
    ctx.strokeStyle = st.c2;
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.restore();
  }

  /* 失踪侦测（只读）：上一帧在册、本帧消失且不在寿终窗口 → 视作命中，补一次爆散。 */
  var _bursts = [], _lastShots = [], _lastShotsRef = null, _lastLevelRef = null;
  function trackShotMotion(shots, tick, game) {
    if (_lastLevelRef !== (game && game.level) || _lastShotsRef !== shots) {
      _lastShots.length = 0; _bursts.length = 0;
      _lastShotsRef = shots; _lastLevelRef = game && game.level;
    }
    var i, now = num(tick, 0);
    if (Array.isArray(shots)) {
      for (i = 0; i < _lastShots.length; i++) {
        var rec = _lastShots[i];
        if (shots.indexOf(rec.s) >= 0) continue;
        if (rec.life > 0.14 && _bursts.length < 8 && visible(rec.cx, rec.cy, game, 56)) {
          _bursts.push({ x: rec.cx, y: rec.cy, kind: rec.kind, t0: now, life: 0.16 });
        }
      }
      _lastShots.length = 0;
      var lim = Math.min(shots.length, 64);
      for (i = 0; i < lim && _lastShots.length < 48; i++) {
        var s = shots[i];
        if (!s || s.kind === 'dragon' || s.kind === 'wave' || num(s.born, 0) > 0) continue;
        var scx = num(s.x, 0) + num(s.w, 8) / 2, scy = num(s.y, 0) + num(s.h, 8) / 2;
        if (!visible(scx, scy, game, 56)) continue;
        _lastShots.push({ s: s, cx: scx, cy: scy, kind: s.kind,
          life: isFinite(+s.life) ? num(s.life, 1) : 1 });
      }
    } else {
      _lastShots.length = 0;
    }
    for (i = _bursts.length - 1; i >= 0; i--) {
      if (now >= _bursts[i].t0 + _bursts[i].life) _bursts.splice(i, 1);
    }
  }

  function drawShotBursts(ctx, tick) {
    if (!_bursts.length) return;
    var now = num(tick, 0);
    for (var i = 0; i < _bursts.length; i++) {
      var b = _bursts[i];
      ringBurst(ctx, b.x, b.y, clamp((now - b.t0) / b.life, 0, 1),
        SHOT_STYLES[b.kind] || SHOT_STYLES._);
    }
  }

  /* ---------- 低血处决印章 ---------- */
  function drawSeals(ctx, game, tick) {
    var L = game.level;
    var arr = L && L.enemies;
    if (!arr || !arr.length) return;
    var n = 0;
    for (var i = 0; i < arr.length && n < 16; i++) {
      var e = arr[i];
      if (!e || e.dead || e === game.boss || e.boss || e.isBoss) continue;
      var hp = +e.hp;
      if (!isFinite(hp) || hp > 1 || hp < 0) continue;
      var ex = num(e.x, 0), ey = num(e.y, 0), ew = num(e.w, 12);
      if (!visible(ex + ew / 2, ey, game, 40)) continue;
      if (!take(4)) break;
      n++;
      var ps = 1 + 0.13 * Math.sin(num(tick, 0) * 0.22 + i * 0.7);
      ctx.save();
      ctx.translate(round(ex + ew / 2), round(ey - 9));
      ctx.rotate(-0.08);
      ctx.scale(ps, ps);
      // 朱砂光晕
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = VERM;
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, 6.283); ctx.fill();
      ctx.restore();
      // 印面
      ctx.fillStyle = 'rgba(190,42,34,0.92)';
      ctx.fillRect(-6, -6, 12, 12);
      ctx.strokeStyle = 'rgba(255,226,178,0.95)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-5.5, -5.5, 11, 11);
      ctx.fillStyle = CREAM;
      ctx.font = FONT_SEAL;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('斩', 0, 0.5);
      ctx.restore();
    }
  }

  /* ---------- fxEvents：只在本模块推进 t / 删除过期项 ---------- */
  var _fxTick = null;
  function advanceFx(game, tick) {
    var evs = game.fxEvents;
    if (!Array.isArray(evs)) return null;
    var now = (typeof tick === 'number' && isFinite(tick)) ? tick : null;
    var dt = 0;
    if (now === null) { dt = 1 / 60; _fxTick = null; }
    else if (_fxTick === null) { _fxTick = now; dt = 1 / 60; }
    else if (now > _fxTick) { dt = clamp((now - _fxTick) / 60, 0, 0.1); _fxTick = now; }
    else if (now < _fxTick) { _fxTick = now; dt = 1 / 60; }
    if (dt > 0) {
      for (var i = evs.length - 1; i >= 0; i--) {
        var ev = evs[i];
        if (!ev) { evs.splice(i, 1); continue; }
        ev.t = num(ev.t, 0) + dt;
        var life = num(ev.life, 0.6);
        if (!(life > 0)) life = 0.6;
        if (ev.t >= life) evs.splice(i, 1);
      }
    }
    return evs;
  }

  function drawCounter(ctx, x, y, k, a, tick) {
    if (!take(15)) return;
    var e = easeOut(k), r = 8 + 34 * e;
    var sc = 0.72 + 0.16 * (1 - k);
    var tw = textWidth(ctx, 'PERFECT', FONT_BIG);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a;
    ctx.strokeStyle = CYAN2; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.stroke();
    ctx.strokeStyle = 'rgba(235,255,255,0.9)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, r * 0.72, 0, 6.283); ctx.stroke();
    for (var i = 0; i < 8; i++) {
      var ang = i * 0.785 + num(tick, 0) * 0.02;
      var r0 = r + 2, r1 = r + 6 + 6 * (1 - k);
      ctx.globalAlpha = a * 0.85;
      ctx.strokeStyle = i % 2 ? GOLD : CYAN;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(ang) * r0, y + Math.sin(ang) * r0);
      ctx.lineTo(x + Math.cos(ang) * r1, y + Math.sin(ang) * r1);
      ctx.stroke();
    }
    ctx.restore();
    // 用缓存的字体测量宽度画一道青色基准线，字与线同步缩放
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a * 0.5;
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - tw * 0.36 * sc, y - 14);
    ctx.lineTo(x + tw * 0.36 * sc, y - 14);
    ctx.stroke();
    ctx.restore();
    calligraphy(ctx, 'PERFECT', x, y - 26, sc, a, '#eaffff', CYAN2);
  }

  function drawExecute(ctx, ev, x, y, k, a) {
    if (!take(17)) return;
    var e = easeOut(k);
    var txt = (typeof ev.text === 'string' && ev.text) ? ev.text :
      ((typeof ev.char === 'string' && ev.char) ? ev.char : '斩');
    var sc = 0.75 + 0.55 * e;
    var tw = textWidth(ctx, txt, FONT_BIG);
    // 水墨爆开
    ctx.save();
    ctx.globalAlpha = a * 0.55;
    ctx.fillStyle = INK;
    for (var i = 0; i < 6; i++) {
      var ang = i * 1.047 + 0.4;
      var d = (5 + 16 * e) * (0.7 + ((i * 7) % 10) / 20);
      var r = 3 + 9 * e * (1 + (i % 3) * 0.25);
      ctx.beginPath();
      ctx.arc(x + Math.cos(ang) * d, y + Math.sin(ang) * d * 0.75, r, 0, 6.283);
      ctx.fill();
    }
    // 朱砂冲击环
    ctx.globalAlpha = a * 0.8;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = VERM; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 6 + 30 * e, 0, 6.283); ctx.stroke();
    ctx.restore();
    // 朱砂飞溅
    ctx.save();
    ctx.globalAlpha = a * 0.9;
    ctx.fillStyle = VERM;
    for (i = 0; i < 5; i++) {
      var aa = i * 1.257 + 0.2, dd = 8 + 22 * e;
      ctx.fillRect(round(x + Math.cos(aa) * dd), round(y + Math.sin(aa) * dd * 0.8), 2, 2);
    }
    ctx.restore();
    // 朱砂横斩底光（宽度取缓存测量值，随书法字同步缩放）
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a * 0.4;
    ctx.strokeStyle = VERM;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - tw * 0.5 * sc, y + 2);
    ctx.lineTo(x + tw * 0.5 * sc, y + 2);
    ctx.stroke();
    ctx.restore();
    // 书法打击字
    calligraphy(ctx, txt, x, y, sc, a, CREAM, VERM);
  }

  function drawFxEvents(ctx, evs, game, tick) {
    if (!evs || !evs.length) return;
    var n = 0;
    for (var i = 0; i < evs.length; i++) {
      var ev = evs[i];
      if (!ev) continue;
      var x = num(ev.x, 0), y = num(ev.y, 0);
      if (!visible(x, y, game, 80)) continue;
      var life = num(ev.life, 0.6);
      if (!(life > 0)) life = 0.6;
      var k = clamp(num(ev.t, 0) / life, 0, 1);
      var a = 1 - k;
      if (a <= 0.01) continue;
      if (++n > 8) break;
      var dir = num(ev.face, 1) < 0 ? -1 : 1;
      if (ev.type === 'dragon') {
        if (!take(3)) continue;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a * 0.8;
        ctx.strokeStyle = GOLD; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 8 + 26 * easeOut(k), 0, 6.283); ctx.stroke();
        ctx.restore();
        // AI 龙图优先：58→130px 拔开并淡出；失败时保留程序化龙首
        if (drawDragonImage(ctx, x, y, dir, 58 + 72 * easeOut(k), 0.95 * a, num(tick, 0) * 0.06 + k * 2, true)) {
          /* 已绘制 */
        } else {
          dragonHead(ctx, x, y, dir, 1.6 + 0.7 * k, k, 0.95 * a);
        }
      } else if (ev.type === 'counter') {
        drawCounter(ctx, x, y, k, a, tick);
      } else if (ev.type === 'execute') {
        drawExecute(ctx, ev, x, y, k, a);
      } else {
        // AI 元素演出：fire / poison / heal / lightning / shadow（unknown 类型静默跳过）
        var fx = aiFxImage(ev.type);
        if (fx) {
          var fsize = fx.base + fx.grow * easeOut(k);
          aiDraw(ctx, fx.img, x, y, fsize,
            fx.a * a * (0.55 + 0.45 * a), 0, false);
        }
      }
    }
  }

  /* ==================== 世界坐标渲染 ==================== */
  function renderWorld(ctx, game, tick) {
    if (!ctxOk(ctx) || !game) return;
    var t = num(tick, num(game.tick, 0));
    beginWorld();
    var evs = advanceFx(game, t);

    var p = game.player;
    if (p && !p.dead) drawSlash(ctx, game, p, t);

    var shots = game.shots;
    trackShotMotion(shots, t, game);
    if (Array.isArray(shots)) {
      var dn = 0, wn = 0, sn = 0;
      for (var i = 0; i < shots.length; i++) {
        var s = shots[i];
        if (!s) continue;
        var cx = num(s.x, 0) + num(s.w, 16) / 2;
        var cy = num(s.y, 0) + num(s.h, 14) / 2;
        if (!visible(cx, cy, game, 56)) continue;
        if (s.kind === 'dragon' && dn < 3) { dn++; drawShotDragon(ctx, s, t); }
        else if (s.kind === 'wave' && wn < 10) { wn++; drawWave(ctx, s, t); }
        else if (s.kind !== 'dragon' && s.kind !== 'wave' && sn < 14 && num(s.born, 0) <= 0) {
          sn++; drawShotMotion(ctx, s, t, i);
        }
      }
    }
    drawShotBursts(ctx, t);

    drawSeals(ctx, game, t);
    drawFxEvents(ctx, evs, game, t);
  }

  /* ==================== 屏幕坐标渲染 ==================== */
  function renderScreen(ctx, game, tick) {
    if (!ctxOk(ctx) || !game) return;
    var t = num(tick, num(game.tick, 0));
    beginScreen();

    // 1) 全屏金/白闪光衰减
    var ft = num(game.flashT, 0);
    if (ft > 0) {
      var fa = clamp(ft / 0.35, 0, 1);
      if (take(2)) {
        var fg = radial(ctx, 'flash', 0, 300, FLASH_STOPS);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = fa * 0.9;
        ctx.fillStyle = fg || 'rgba(255,238,180,0.9)';
        ctx.fillRect(0, 0, VW, VH);
        ctx.restore();
      }
    }

    // 2) combo≥8 且终结技就绪时的金色边缘龙气
    var p = game.player;
    var combo = Math.floor(num(game.combo, 0));
    var fc = p ? p.finisherCd : undefined;
    if (p && !p.dead && combo >= 8 && fc !== undefined && num(fc, 0) <= 0) {
      if (take(12)) {
        var pulse = 0.55 + 0.35 * Math.sin(t * 0.18);
        var eg = radial(ctx, 'edge', 70, 280, EDGE_STOPS);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = clamp(0.55 * pulse, 0, 1);
        ctx.fillStyle = eg || 'rgba(255,190,60,0.18)';
        ctx.fillRect(0, 0, VW, VH);
        // 边缘龙气：上下两条波动金线
        ctx.globalAlpha = clamp(0.5 * pulse, 0, 1);
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 1;
        ctx.lineCap = 'round';
        for (var e = 0; e < 2; e++) {
          var yy = e ? VH - 2 : 1;
          ctx.beginPath();
          ctx.moveTo(0, yy);
          for (var x = 0; x <= VW; x += 32) {
            ctx.lineTo(x, yy + (e ? -1 : 1) * (3 + 3 * Math.sin(x * 0.05 + t * 0.12 + e * 2)));
          }
          ctx.stroke();
        }
        // 金色龙气粒子
        ctx.fillStyle = '#ffe9a0';
        for (var i = 0; i < 8; i++) {
          var px = (t * 0.7 + i * 53) % VW;
          var py = (i % 2) ? VH - 4 - ((t * 0.5 + i * 7) % 10) : 2 + ((t * 0.5 + i * 7) % 10);
          ctx.fillRect(round(px), round(py), 2, 1);
        }
        ctx.restore();
      }
    }

    // 3) 冲刺速度线
    if (p && num(p.dashT, 0) > 0 && take(6)) {
      var dir = num(p.dashDir, 1) < 0 ? -1 : 1;
      ctx.save();
      ctx.strokeStyle = 'rgba(226,252,255,0.38)';
      ctx.lineWidth = 1;
      for (var j = 0; j < 6; j++) {
        var ly = 24 + j * 32 + ((t * 9 + j * 11) % 10);
        var len = 18 + ((t * 13 + j * 17) % 36);
        ctx.beginPath();
        if (dir > 0) { ctx.moveTo(0, ly); ctx.lineTo(len, ly); }
        else { ctx.moveTo(VW, ly); ctx.lineTo(VW - len, ly); }
        ctx.stroke();
      }
      ctx.restore();
    }

    // 4) 终结技命中：暗角压迫（execute 事件前段 / zoomPunch 兜底）
    var impact = 0;
    var evs = game.fxEvents;
    if (Array.isArray(evs)) {
      for (var k = 0; k < evs.length; k++) {
        var ev = evs[k];
        if (!ev || ev.type !== 'execute') continue;
        var tt = num(ev.t, 0), lf = num(ev.life, 0.6);
        if (!(lf > 0)) lf = 0.6;
        if (tt < lf * 0.55) impact = Math.max(impact, 1 - tt / (lf * 0.55));
      }
    }
    impact = Math.max(impact, clamp(num(game.zoomPunch, 0), 0, 1) * 0.7);
    if (impact > 0.02 && take(1)) {
      var vg = radial(ctx, 'pressure', VH * 0.22, VH * 0.82, VIG_STOPS);
      ctx.save();
      ctx.globalAlpha = clamp(impact, 0, 1) * 0.7;
      ctx.fillStyle = vg || 'rgba(24,8,10,0.35)';
      ctx.fillRect(0, 0, VW, VH);
      ctx.restore();
    }
  }

  window.PQCOMBAT = {
    renderWorld: renderWorld,
    renderScreen: renderScreen
  };
})();
