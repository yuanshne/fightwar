/* scene_live.js —— v33 场景互动层（window.PQSCENE）
   契约：
   - renderBack(ctx,game,tick)                  屏幕坐标；视差/天气之后、世界实体之前（不遮 HUD）
   - renderFront(ctx,game,tick,camX,camY)       世界坐标转屏幕；玩家之后、前景遮挡之前
   约束：IIFE；确定性哈希 + tick；只读 game；字段缺失静默跳过；每帧元素预算 ≤80。 */
(function () {
  'use strict';

  var VIEW_W = 384, VIEW_H = 224, TILE = 16, TAU = Math.PI * 2;

  /* ==================== 小工具 ==================== */
  function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
  function hash(a, b) {
    var h = Math.imul((a | 0) ^ 0x9e3779b9, 374761393) + Math.imul((b | 0) ^ 0x7f4a7c15, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function wrap(v, m) { return ((v % m) + m) % m; }
  function themeKey(game) {
    var L = game && game.level;
    return (L && L.meta && L.meta.theme) || 'grass';
  }
  function camOf(game) {
    var c = game && game.cam;
    return { x: num(c && c.x, 0), y: num(c && c.y, 0) };
  }
  // 与 ui.js 世界层震屏同式：前景挂件随世界一起抖，不脱锚。
  function shakeOf(game, tick) {
    var m = num(game && game.shake, 0);
    if (m <= 0) return { x: 0, y: 0 };
    var st = tick * 0.9;
    return {
      x: (Math.sin(st * 2.7) + Math.sin(st * 1.3) * 0.5) * m * 0.55,
      y: (Math.cos(st * 2.1) + Math.sin(st * 1.7) * 0.5) * m * 0.35
    };
  }
  function playerOf(game) {
    var p = game && game.player;
    return (p && typeof p.x === 'number' && typeof p.y === 'number') ? p : null;
  }
  function rectOf(p, camX, camY, sx, sy) {
    if (!p) return null;
    return {
      x: p.x - camX + sx, y: p.y - camY + sy,
      w: num(p.w, 10), h: num(p.h, 14)
    };
  }
  function solid(L, tx, ty, sw) {
    if (!L) return false;
    if (typeof L.solid === 'function') return !!L.solid(tx, ty, sw);
    var g = L.tiles;
    if (!g || !g[ty] || !g[ty][tx]) return false;
    var ch = g[ty][tx];
    return ch === '#' || ch === 'I' || ch === 'B' || ch === 'G' || ch === 'q' ||
      ch === '(' || ch === ')' || ch === 'a' || ch === 'b' || ch === 'D' || ch === 'C';
  }
  function disc(ctx, x, y, r, col, a) {
    if (a <= 0.01 || r <= 0) return;
    ctx.globalAlpha = a; ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }

  /* ==================== 后景配置 ==================== */
  function backCfg(k) {
    switch (k) {
      case 'grass': return { birds: 2, petals: 6, dust: 3, petalCol: '#ffd0e0' };
      case 'wind': return { birds: 1, petals: 9, dust: 2, petalCol: '#c8ffb0' };
      case 'sky': return { birds: 3, petals: 2, dust: 4, petalCol: '#ffffff' };
      case 'castle': return { birds: 1, petals: 5, dust: 3, petalCol: '#ffd8a0' };
      case 'sea': return { petals: 7, dust: 2, water: 1, petalCol: '#a8f0ff' };
      case 'lava': return { flies: 5, dust: 5, flyCol: '#ff9a50' };
      case 'factory': return { flies: 3, dust: 6, flyCol: '#ffc060' };
      case 'cave': return { flies: 6, dust: 4, flyCol: '#6ef0d8' };
      case 'tower': return { flies: 5, dust: 4, flyCol: '#b8a8ff' };
      case 'star': return { flies: 5, dust: 5, flyCol: '#d8d0ff' };
      case 'nether': return { flies: 5, dust: 4, flyCol: '#88ffb0' };
      case 'boss': return { flies: 4, dust: 5, flyCol: '#c8a8ff' };
      case 'ember': return { flies: 5, dust: 5, flyCol: '#ffa050' };
      case 'aether': return { flies: 4, dust: 5, flyCol: '#ffe8a0' };
      case 'husk': return { flies: 5, dust: 4, flyCol: '#b8e878' };
      case 'maw': return { flies: 4, dust: 4, flyCol: '#88c8d8' };
      case 'bell': return { flies: 4, dust: 5, flyCol: '#d8c890' };
      case 'anthem': return { flies: 4, dust: 5, flyCol: '#f8e8b8' };
      case 'mirror': return { flies: 5, dust: 5, flyCol: '#f0d8ff' };
      default: return { petals: 4, dust: 4, petalCol: '#ffffff' };
    }
  }

  /* ==================== 后景：鸟 / 花 / 萤 / 尘 ==================== */
  function renderBack(ctx, game, tick) {
    if (!ctx) return;
    game = game || {}; tick = num(tick, 0);
    var L = game.level;
    if (!L) return;
    var key = themeKey(game), cfg = backCfg(key);
    var cam = camOf(game);
    var p = playerOf(game), alive = !!(p && !p.dead);
    var pcx = alive ? p.x + num(p.w, 10) / 2 - cam.x : 99999;
    var pcy = alive ? p.y + num(p.h, 14) / 2 - cam.y : 99999;
    var dash = !!(alive && p.dashT > 0);
    var shk = num(game.shake, 0);
    var fear = 70 + (dash ? 52 : 0) + (shk > 3 ? 22 : 0);
    var i, x, y, dx, dy, d, k, h1, h2;

    ctx.globalAlpha = 1;

    /* 尘埃：最底层，慢速漂移 */
    var dustCol = (L.theme && L.theme.dust) || '#ffffff';
    for (i = 0; i < (cfg.dust || 0); i++) {
      h1 = hash(i, 41); h2 = hash(i, 42);
      x = wrap(h1 * 460 + tick * (1.2 + h2 * 2.2) + cam.x * 0.32, 460) - 38;
      y = 36 + hash(i, 43) * 146 + Math.sin(tick * 0.02 + i) * 2;
      if (x < -4 || x > VIEW_W + 4) continue;
      disc(ctx, Math.round(x), Math.round(y), 1, dustCol, 0.16 + hash(i, 44) * 0.2);
    }

    /* 花瓣 / 水主题缓沉 */
    var pcol = cfg.petalCol || '#ffd8e8';
    for (i = 0; i < (cfg.petals || 0); i++) {
      h1 = hash(i, 51); h2 = hash(i, 52);
      x = wrap(h1 * 460 + tick * (cfg.water ? 2.2 : 7 + h2 * 8) +
        Math.sin(tick * 0.025 + i) * 10 + cam.x * 0.6, 460) - 38;
      y = cfg.water
        ? 34 + wrap(h2 * 150 + tick * (1.4 + h1 * 1.2), 150)
        : 34 + wrap(h2 * 150 + tick * (0.7 + h1 * 1.4) + Math.sin(tick * 0.04 + i * 1.7) * 5, 150);
      if (alive) {
        dx = x - pcx; dy = y - pcy; d = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dash && d < fear) { x += (dx >= 0 ? 1 : -1) * 10; y -= 4; }
        else if (d < 34) { x += (dx >= 0 ? 1 : -1) * 2.5; }
      }
      if (x < -6 || x > VIEW_W + 6) continue;
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.rotate(Math.sin(tick * 0.05 + i * 2.1) * 0.9 + (cfg.water ? 0.5 : 0));
      ctx.globalAlpha = 0.55 + hash(i, 53) * 0.28;
      ctx.fillStyle = pcol;
      ctx.fillRect(-1, -1, 3, 2);
      ctx.restore();
    }

    /* 萤火 / 余烬：玩家或冲刺靠近时向外惊散 */
    var fcol = cfg.flyCol || (L.theme && L.theme.accent) || '#c8ffb0';
    for (i = 0; i < (cfg.flies || 0); i++) {
      h1 = hash(i, 31); h2 = hash(i, 32);
      x = wrap(h1 * 440 + tick * (1.5 + h2 * 2) + cam.x * 0.55 +
        Math.sin(tick * 0.02 + i * 1.7) * 14, 440) - 28;
      y = 40 + h2 * 136 + Math.sin(tick * 0.035 + i * 2.1) * 7;
      if (alive) {
        dx = x - pcx; dy = y - pcy; d = Math.sqrt(dx * dx + dy * dy) || 1;
        if (d < fear) {
          k = (1 - d / fear) * (dash ? 24 : 15);
          x += dx / d * k; y += dy / d * k;
        }
      }
      if (x < -8 || x > VIEW_W + 8) continue;
      var pulse = 0.5 + 0.35 * Math.sin(tick * 0.08 + i * 2.3);
      disc(ctx, x, y, 4, fcol, pulse * 0.12);
      disc(ctx, x, y, 2, fcol, pulse * 0.28);
      disc(ctx, x, y, 1, '#ffffff', pulse * 0.7);
    }

    /* 飞鸟：惊散时外飞、抬升、振翅加快 */
    var bcol = (L.theme && L.theme.dark) ? '#d8d0ff' : '#3a4058';
    for (i = 0; i < (cfg.birds || 0); i++) {
      h1 = hash(i, 61); h2 = hash(i, 62);
      x = wrap(h1 * 520 + tick * (5 + i * 1.6) + cam.x * 0.5, 520) - 68;
      y = 38 + h2 * 74 + Math.sin(tick * 0.018 + i * 1.3) * 4;
      k = 0;
      if (alive) {
        dx = x - pcx; dy = y - pcy; d = Math.sqrt(dx * dx + dy * dy) || 1;
        if (d < fear) {
          k = 1 - d / fear;
          x += (dx >= 0 ? 1 : -1) * k * (dash ? 20 : 12);
          y -= k * 7;
        }
      }
      if (x < -14 || x > VIEW_W + 14) continue;
      var wing = Math.sin(tick * (0.16 + (dash ? 0.12 : 0)) + i * 2.1);
      var bw = 3 + k * 1.2, bh = 1.6 + (wing * 0.5 + 0.5) * 2.2;
      ctx.globalAlpha = 0.5 + k * 0.25;
      ctx.strokeStyle = bcol; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - bw, y + 0.5);
      ctx.quadraticCurveTo(x - bw * 0.45, y - bh, x, y + 0.5);
      ctx.moveTo(x + bw, y + 0.5);
      ctx.quadraticCurveTo(x + bw * 0.45, y - bh, x, y + 0.5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /* ==================== 前景配色 ==================== */
  var GRASS_COL = {
    grass: '#48c060', wind: '#7ce890', sky: '#d8f0ff', castle: '#88b848',
    star: '#9ab8ff', sea: '#58d8c0', cave: '#48c8a0', factory: '#88a8a0',
    lava: '#c89048', tower: '#98b8e8', boss: '#a888e8', nether: '#68e8a0'
  };
  var LANTERN_COL = {
    cave: '#ffc870', castle: '#ffd080', tower: '#ffd890', lava: '#ff9a50',
    factory: '#ffc060', nether: '#ffd070', boss: '#ffc080', star: '#ffe0a0',
    ember: '#ff9a50', aether: '#ffe0a0', husk: '#ffd080', maw: '#ffc070',
    bell: '#ffd890', anthem: '#ffd890', mirror: '#ffd8f0', abyss: '#ffcc70'
  };
  var LANTERN_ON = {
    cave: 1, castle: 1, tower: 1, lava: 1, factory: 1, nether: 1, boss: 1,
    star: 1, ember: 1, aether: 1, husk: 1, maw: 1, bell: 1, anthem: 1,
    mirror: 1, abyss: 1
  };
  var LEAF_ON = { grass: 1, wind: 1, sky: 1, castle: 1, sea: 1 };

  /* ==================== 前景：草 / 灯 / 水 / 叶符 ==================== */
  function renderFront(ctx, game, tick, camX, camY) {
    if (!ctx) return;
    game = game || {}; tick = num(tick, 0);
    var L = game.level;
    if (!L || !L.tiles) return;

    var key = themeKey(game);
    var dc = camOf(game);
    var cx = (typeof camX === 'number') ? camX : dc.x;
    var cy = (typeof camY === 'number') ? camY : dc.y;
    var sh = shakeOf(game, tick);
    var p = playerOf(game), alive = !!(p && !p.dead);
    var pr = rectOf(p, cx, cy, sh.x, sh.y);
    var sw = num(game.switchState, 0);
    var shk = num(game.shake, 0);
    var lw = num(L.w, L.tw || 0), lh = num(L.h, L.th || 0);
    if (lw <= 0 || lh <= 0) return;
    var x0 = Math.max(0, Math.floor(cx / TILE) - 1);
    var x1 = Math.min(lw - 1, Math.floor((cx + VIEW_W) / TILE) + 1);
    var y0 = Math.max(0, Math.floor(cy / TILE) - 1);
    var y1 = Math.min(lh - 1, Math.floor((cy + VIEW_H) / TILE) + 1);
    var pcx = alive ? p.x + num(p.w, 10) / 2 - cx + sh.x : 0;
    var pcy = alive ? p.y + num(p.h, 14) / 2 - cy + sh.y : 0;
    var tx, ty, anchored = 0;
    ctx.globalAlpha = 1;

    /* ---- 平台顶边草丛：靠近/冲刺/落地/震屏都会弯 ---- */
    var gcol = GRASS_COL[key] || (L.theme && L.theme.cap) || '#6cc860';
    var galpha = key === 'sky' ? 0.35 : 0.78;
    for (ty = y0; ty <= y1 && anchored < 12; ty++) {
      for (tx = x0; tx <= x1 && anchored < 12; tx++) {
        if (!solid(L, tx, ty, sw) || solid(L, tx, ty - 1, sw)) continue;
        var gh = hash(tx * 7 + 3, ty * 11 + 5);
        if (gh < 0.5) continue;
        var gsx = tx * TILE + 8 - cx + sh.x;
        var gsy = ty * TILE - cy + sh.y;
        if (gsx < -10 || gsx > VIEW_W + 10 || gsy < -6 || gsy > VIEW_H + 6) continue;
        var en = 0, bend = 0;
        if (alive) {
          var gdx = gsx - pcx, gdy = gsy - pcy;
          var gd = Math.sqrt(gdx * gdx + gdy * gdy);
          if (gd < 34) {
            en = Math.max(en, 1 - gd / 34);
            bend += (gdx >= 0 ? 1 : -1) * (0.8 + en * 3.2);
          }
          if (alive && p.dashT > 0 && gd < 50) {
            en = Math.max(en, 0.75);
            bend += (gdx >= 0 ? 1 : -1) * 3;
          }
          if (alive && p.landT > 0 && gd < 40) {
            en = Math.max(en, 0.8);
            bend += (gdx >= 0 ? 1 : -1) * 2;
          }
        }
        if (shk > 3) {
          bend += Math.sin(tick * 0.6 + gh * TAU) * Math.min(2.4, shk * 0.3);
          en = Math.max(en, 0.45);
        }
        var sway = Math.sin(tick * (0.05 + en * 0.07) + gh * TAU) * (0.8 + en * 1.8);
        ctx.strokeStyle = gcol; ctx.lineWidth = 1; ctx.lineCap = 'round';
        ctx.globalAlpha = galpha;
        ctx.beginPath();
        for (var b = 0; b < 3; b++) {
          var bx = Math.round(gsx - 2 + b * 2 + (gh - 0.5) * 2);
          var bh = 3 + hash(tx * 5 + b, ty * 7 + 1) * 4 + en * 1.5;
          var lean = (b - 1) * 1.2 + bend + sway * (0.35 + b * 0.2);
          ctx.moveTo(bx, Math.round(gsy));
          ctx.quadraticCurveTo(bx + lean * 0.35, gsy - bh * 0.55, bx + lean, gsy - bh);
        }
        ctx.stroke();
        anchored++;
      }
    }

    /* ---- 悬灯：平台/洞顶下缘，靠近或震屏时摆动 ---- */
    if (LANTERN_ON[key]) {
      var lcol = LANTERN_COL[key] || '#ffcc70';
      var lastTx = -99, ln = 0;
      for (ty = y0; ty <= y1 && ln < 12; ty++) {
        for (tx = x0; tx <= x1 && ln < 12; tx++) {
          if (tx - lastTx < 3) continue;
          if (!solid(L, tx, ty, sw)) continue;
          if (solid(L, tx, ty + 1, sw) || solid(L, tx, ty + 2, sw)) continue;
          if (!solid(L, tx - 1, ty, sw) && !solid(L, tx + 1, ty, sw)) continue;
          var lh2 = hash(tx * 13 + 1, ty * 17 + 7);
          if (lh2 < 0.62) continue;
          var ax = tx * TILE + 8 - cx + sh.x;
          var ay = (ty + 1) * TILE - cy + sh.y + 1;
          if (ax < 4 || ax > VIEW_W - 4 || ay < 4 || ay > VIEW_H + 4) continue;
          lastTx = tx; ln++;
          var swing = Math.sin(tick * 0.03 + lh2 * TAU) * 0.06;
          if (alive) {
            var ldx = ax - pcx, ldy = ay - pcy;
            var ld = Math.sqrt(ldx * ldx + ldy * ldy);
            if (ld < 56) swing += (ldx >= 0 ? 1 : -1) * (1 - ld / 56) * 0.5;
          }
          if (shk > 3) swing += Math.sin(tick * 0.55 + lh2 * TAU) * Math.min(0.35, shk * 0.04);
          ctx.save();
          ctx.translate(ax, ay);
          ctx.rotate(swing);
          ctx.globalCompositeOperation = 'lighter';
          disc(ctx, 0, 10, 8, lcol, 0.06);
          disc(ctx, 0, 10, 5, lcol, 0.1);
          disc(ctx, 0, 10, 2.5, '#fff2c0', 0.16);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 0.8; ctx.strokeStyle = '#5a3a20'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 4); ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#7a4a20'; ctx.fillRect(-2, 4, 4, 1);
          ctx.fillStyle = lcol; ctx.fillRect(-2, 5, 4, 4);
          ctx.fillStyle = '#ffe8a0'; ctx.fillRect(-1, 6, 1, 2);
          ctx.fillStyle = '#e05830'; ctx.fillRect(-1, 9, 2, 1);
          ctx.restore();
        }
      }
    }

    /* ---- 水面：sea 落地扩散 + 雨滴起泡 ---- */
    if (key === 'sea') {
      ctx.globalAlpha = 1;
      if (alive && p.onGround && p.landT > 0) {
        var maxT = p.landT > 0.16 ? 0.22 : 0.15;
        var age = Math.max(0, maxT - p.landT);
        var kk = Math.min(1, age / maxT);
        var fx = Math.round(p.x + num(p.w, 10) / 2 - cx + sh.x);
        var fy = Math.round(p.y + num(p.h, 14) - cy + sh.y);
        ctx.save();
        ctx.translate(fx, fy); ctx.scale(1, 0.38);
        for (var w = 0; w < 3; w++) {
          var rr = 2 + kk * 14 + w * 3;
          var wa = (1 - kk) * 0.5 - w * 0.07;
          if (wa <= 0) continue;
          ctx.globalAlpha = wa; ctx.strokeStyle = '#c8f8ff'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke();
        }
        ctx.restore(); ctx.globalAlpha = 1;
      }
      for (var bi = 0; bi < 4; bi++) {
        var cyc = (tick + bi * 29) % 110;
        if (cyc > 30) continue;
        var bk = cyc / 30;
        var bx = 30 + hash(bi, 71) * 320;
        var by = 136 + hash(bi, 72) * 44;
        if (pr && Math.abs(bx - (pr.x + pr.w / 2)) < 14 && Math.abs(by - (pr.y + pr.h / 2)) < 18) continue;
        ctx.save();
        ctx.translate(Math.round(bx), Math.round(by)); ctx.scale(1, 0.5);
        ctx.globalAlpha = (1 - bk) * 0.45; ctx.strokeStyle = '#bff4ff'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, 0.8 + bk * 3, 0, TAU); ctx.stroke();
        ctx.restore();
      }
    }

    /* ---- 竹叶 / 符咒：只贴屏幕两侧，中央让位玩家轮廓 ---- */
    if (LEAF_ON[key]) {
      var leafCol = key === 'wind' ? '#8ce890' : key === 'sky' ? '#d8f0ff'
        : key === 'sea' ? '#58d8c0' : key === 'castle' ? '#9ac860' : '#5ab860';
      for (var li = 0; li < 5; li++) {
        var lx = (li & 1) ? VIEW_W - 10 - hash(li, 81) * 54 : 10 + hash(li, 82) * 54;
        var ly = 24 + hash(li, 83) * 40 + Math.sin(tick * 0.03 + li * 1.3) * 3;
        var near = false;
        if (pr) {
          near = Math.abs(lx - (pr.x + pr.w / 2)) < 30 && Math.abs(ly - (pr.y + pr.h / 2)) < 34;
        }
        var lb = Math.sin(tick * 0.045 + li * 1.7) * 0.35;
        if (alive && p.dashT > 0) lb += Math.sin(tick * 0.3 + li) * 0.18;
        if (shk > 3) lb += Math.sin(tick * 0.6 + li * 1.9) * Math.min(0.35, shk * 0.04);
        ctx.save();
        ctx.translate(Math.round(lx), Math.round(ly));
        ctx.rotate(lb);
        ctx.globalAlpha = near ? 0.25 : 0.85;
        ctx.fillStyle = leafCol;
        ctx.beginPath();
        for (var j = 0; j < 3; j++) {
          var ang = -0.55 + j * 0.55;
          var len = 7 + hash(li * 3 + j, 84) * 6;
          var ca = Math.cos(ang), sa = Math.sin(ang);
          var ex = ca * len, ey = sa * len;
          var nx = -sa * 2.2, ny = ca * 2.2;
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(ex * 0.5 + nx, ey * 0.5 + ny, ex, ey);
          ctx.quadraticCurveTo(ex * 0.5 - nx, ey * 0.5 - ny, 0, 0);
        }
        ctx.fill();
        ctx.restore();
      }
    } else {
      for (var ti = 0; ti < 4; ti++) {
        var tsx = (ti & 1) ? VIEW_W - 14 - hash(ti, 91) * 42 : 14 + hash(ti, 92) * 42;
        var tsy = 18 + hash(ti, 93) * 8;
        var near2 = false;
        if (pr) {
          near2 = Math.abs(tsx - (pr.x + pr.w / 2)) < 26 && Math.abs(tsy + 4 - (pr.y + pr.h / 2)) < 30;
        }
        var tb = Math.sin(tick * 0.05 + ti * 1.9) * 0.18;
        if (alive) {
          var tdx = tsx - pcx;
          var td = Math.abs(tdx);
          if (td < 70) tb += (tdx >= 0 ? 1 : -1) * (1 - td / 70) * 0.4;
        }
        if (shk > 3) tb += Math.sin(tick * 0.6 + ti) * Math.min(0.4, shk * 0.05);
        ctx.save();
        ctx.translate(tsx, tsy);
        ctx.rotate(tb);
        ctx.globalAlpha = near2 ? 0.25 : 0.85;
        ctx.strokeStyle = '#8a5a2a'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(0, 0); ctx.stroke();
        ctx.fillStyle = '#f6e2a0'; ctx.fillRect(-2, 0, 4, 9);
        ctx.fillStyle = '#c83838'; ctx.fillRect(-1, 2, 2, 1); ctx.fillRect(-1, 5, 2, 1);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  var API = { renderBack: renderBack, renderFront: renderFront };
  if (typeof window !== 'undefined') window.PQSCENE = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
