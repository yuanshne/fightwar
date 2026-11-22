/* art_remaster.js — v31 画质增强（不改 art.js：加载后包装 buildThemeArt）
 * ---------------------------------------------------------------------------
 * 只做三件事（全部构建期预烘焙，运行期零 canvas 创建）：
 *   1. art.bg.mid  ：512×224 中层剪影（视差 0.38，按主题换轮廓）
 *   2. art.bg.fore ：512×224 前景遮挡（视差 1.2，中央 60% 透明，只画左右下角）
 *   3. art.tiles.blockAlt / blockCapAlt / plankAlt：原瓦片克隆 + 裂纹/苔藓/碎石/砖缝，
 *      数组形式提供 2~3 个变体；原 block / blockCap / plank 键不改，碰撞轮廓不变。
 * 幂等：包装函数带 __remaster 标记，重复加载不会二次包装。
 * 兜底：未知主题按 grass 轮廓；字段缺失静默跳过；任何异常都不外抛。
 * 浏览器专用（顶层无 DOM 时直接退出），不要在 Node 里 require。
 * ------------------------------------------------------------------------- */
(function () {
  'use strict';

  var W = 512, H = 224, TAU = Math.PI * 2;

  /* ==================== 基础工具（缺失时自带兜底） ==================== */
  function makeCanvas(w, h) {
    if (typeof _makeCanvas === 'function') {
      try { return _makeCanvas(w, h); } catch (e) { /* 落到本地实现 */ }
    }
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function isHex(v) { return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v); }
  function col(v, fb) { return isHex(v) ? v : fb; }
  function toRgb(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  function mix(a, b, t) {
    var pa = toRgb(col(a, '#000000')), pb = toRgb(col(b, '#000000')), out = '#';
    for (var i = 0; i < 3; i++) {
      var v = Math.round(pa[i] + (pb[i] - pa[i]) * t);
      if (v < 0) v = 0; if (v > 255) v = 255;
      out += ('0' + v.toString(16)).slice(-2);
    }
    return out;
  }
  function rgba(h, a) {
    var p = toRgb(col(h, '#000000'));
    return 'rgba(' + p[0] + ',' + p[1] + ',' + p[2] + ',' + a + ')';
  }
  function rng(seed) {
    if (typeof _mulberry32 === 'function') {
      try { return _mulberry32(seed); } catch (e) { /* 落到本地实现 */ }
    }
    var s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function wrapX(fn) { fn(0); fn(-W); fn(W); } // 512 宽平铺：跨边形状补画左右副本

  function palette(th) {
    th = th || {};
    var far = col(th.far, '#1a1f3a'), near = col(th.near, '#2e3557');
    var accent = col(th.accent, '#f8d048'), dust = col(th.dust, '#ffffff');
    var mid = mix(far, near, 0.55);
    return {
      far: far, near: near, accent: accent, dust: dust,
      mid: mid,
      deep: mix(mid, '#05050a', 0.42),
      rim: mix(mid, accent, 0.45),
      glow: rgba(accent, 0.55),
      dark: mix(accent, '#08080c', 0.74)
    };
  }

  /* ==================== 主题 → 轮廓类型 ==================== */
  var MID_KIND = {
    grass: 'trees', wind: 'trees',
    cave: 'crystal', star: 'crystal', boss: 'crystal', husk: 'crystal', maw: 'crystal',
    sky: 'cloud',
    factory: 'factory', aether: 'factory',
    lava: 'lava', ember: 'lava',
    tower: 'tower', castle: 'tower', bell: 'tower', anthem: 'tower',
    sea: 'sea', abyss: 'sea',
    nether: 'nether',
    mirror: 'mirror'
  };
  var FORE_KIND = {
    grass: 'blades', wind: 'blades', sky: 'blades',
    cave: 'rocks', star: 'rocks', boss: 'rocks', husk: 'rocks', maw: 'rocks',
    lava: 'rocks', ember: 'rocks', nether: 'rocks',
    factory: 'chain', aether: 'chain', tower: 'chain', castle: 'chain',
    bell: 'chain', anthem: 'chain',
    sea: 'coral', abyss: 'coral',
    mirror: 'shard'
  };

  /* ==================== 中层剪影（512×224） ==================== */
  function ridge(g, color, baseY, amp, freq, phase, step) {
    step = step || 4;
    g.fillStyle = color;
    for (var x = 0; x < W; x += step) {
      var y = baseY +
        Math.sin(x / W * TAU * freq + phase) * amp +
        Math.sin(x / W * TAU * (freq * 2 + 1) + phase * 1.7) * amp * 0.4;
      y = Math.round(y);
      g.fillRect(x, y, step, H - y);
    }
  }

  function midTrees(g, p) {
    ridge(g, p.mid, 168, 8, 2, 0.6, 8);
    var r = rng(9317);
    for (var x = 0; x < W; x += 24) {
      var tx = x + Math.floor(r() * 6);
      var ty = 150 + Math.round(Math.sin(tx / W * TAU * 3 + 1) * 9);
      var rad = 8 + Math.floor(r() * 3);
      wrapX(function (ox) {
        g.fillStyle = p.deep;
        g.fillRect(tx + ox + 7, ty + 2, 3, H - ty);
        g.beginPath(); g.arc(tx + ox + 8, ty - 2, rad, 0, TAU); g.fill();
        g.fillRect(tx + ox + 2, ty + 2, 12, 4);
      });
      if ((x / 24 | 0) % 3 === 0) {
        g.fillStyle = p.rim;
        g.fillRect(tx + 5, ty - 9, 3, 1);
        g.fillRect(tx + 4, ty - 8, 1, 1);
      }
    }
  }

  function midCrystal(g, p) {
    ridge(g, p.deep, 192, 6, 2, 1.1, 8);
    var r = rng(2421);
    var x = 8;
    while (x < W) {
      var w = 6 + Math.floor(r() * 14);
      var top = 96 + Math.floor(r() * 62);
      var tip = 10 + Math.floor(r() * 16);
      (function (px, pw, ptop, ptip) {
        wrapX(function (ox) {
          g.fillStyle = p.mid;
          g.fillRect(px + ox, ptop + ptip, pw, H - ptop - ptip);
          for (var i = 0; i < ptip; i++) {
            var tw = Math.max(1, Math.round(pw * (i / ptip)));
            g.fillRect(px + ox + ((pw - tw) >> 1), ptop + i, tw, 1);
          }
          g.fillStyle = p.rim;
          g.fillRect(px + ox, ptop + ptip, 1, H - ptop - ptip);
          g.fillRect(px + ox + (pw >> 1), ptop + 4, 1, ptip);
        });
      })(x, w, top, tip);
      if (r() > 0.55) {
        var sx = x + w + 2, sh = 12 + Math.floor(r() * 14);
        g.fillStyle = p.mid;
        g.fillRect(sx, H - sh, 4, sh);
        g.fillRect(sx + 1, H - sh - 3, 2, 3);
      }
      x += w + 10 + Math.floor(r() * 18);
    }
  }

  function midCloud(g, p) {
    var r = rng(4242);
    for (var i = 0; i < 7; i++) {
      var cx = Math.floor(r() * W), cy = 92 + Math.floor(r() * 78), cw = 54 + Math.floor(r() * 60);
      (function (x0, y0, w0) {
        wrapX(function (ox) {
          g.fillStyle = p.mid;
          g.beginPath(); g.arc(x0 + ox, y0, 16, 0, TAU); g.fill();
          g.fillRect(x0 + ox - (w0 >> 1), y0, w0, 12);
          g.beginPath(); g.arc(x0 + ox - (w0 >> 2), y0 + 2, 11, 0, TAU); g.fill();
          g.beginPath(); g.arc(x0 + ox + (w0 >> 2), y0 + 3, 13, 0, TAU); g.fill();
          g.fillStyle = p.rim;
          g.fillRect(x0 + ox - (w0 >> 1) + 4, y0 + 11, w0 - 8, 1);
        });
      })(cx, cy, cw);
    }
  }

  function midFactory(g, p) {
    var r = rng(7717);
    for (var x = 0; x < W; x += 64) {
      g.fillStyle = p.mid;
      g.fillRect(x + 8, 86, 10, H - 86);
      g.fillRect(x + 5, 80, 16, 6);
      g.beginPath(); g.arc(x + 40, 152, 13, 0, TAU); g.fill();
      g.fillRect(x + 27, 152, 26, H - 152);
      g.fillStyle = p.deep;
      g.fillRect(x + 8, 100, 3, H - 100);
      g.fillStyle = p.rim;
      g.fillRect(x + 38, 148, 3, 2);
    }
    for (var i = 0; i < 5; i++) {
      var cx = 32 + i * 104, cy = 62 + (i % 2) * 14;
      var rad = 16 + (i % 3) * 4;
      (function (gx, gy, gr) {
        wrapX(function (ox) {
          g.save();
          g.fillStyle = p.mid;
          for (var t = 0; t < 8; t++) {
            var a = t / 8 * TAU;
            g.fillRect(gx + ox + Math.cos(a) * (gr - 3) - 3, gy + Math.sin(a) * (gr - 3) - 3, 6, 6);
          }
          g.beginPath(); g.arc(gx + ox, gy, gr, 0, TAU); g.fill();
          g.globalCompositeOperation = 'destination-out';
          g.beginPath(); g.arc(gx + ox, gy, gr * 0.42, 0, TAU); g.fill();
          g.restore();
        });
      })(cx, cy, rad);
    }
    g.fillStyle = p.mid;
    g.fillRect(0, 118, W, 5);
    g.fillStyle = p.deep;
    g.fillRect(0, 122, W, 1);
    // 管道接缝
    for (var k = 0; k < 8; k++) {
      g.fillStyle = p.deep;
      g.fillRect(64 * k + 10, 118, 1, 5);
    }
  }

  function midLava(g, p) {
    var r = rng(5150);
    for (var i = 0; i < 9; i++) {
      var cx = 20 + i * 58 + Math.floor(r() * 14);
      var ph = 70 + Math.floor(r() * 80);
      var w = 26 + Math.floor(r() * 24);
      (function (x0, w0, h0) {
        wrapX(function (ox) {
          g.fillStyle = p.deep;
          for (var dx = 0; dx < w0; dx++) {
            var t = 1 - Math.abs(dx - w0 / 2 + 0.5) / (w0 / 2);
            var hh = Math.round(h0 * (0.55 + t * 0.45));
            g.fillRect(x0 + ox + dx, H - hh, 1, hh);
          }
          g.fillStyle = p.mid;
          g.fillRect(x0 + ox + (w0 >> 1) - 2, H - h0 * 0.72, 5, h0 * 0.72);
        });
      })(cx, w, ph);
    }
    ridge(g, p.deep, 198, 5, 3, 0.2, 8);
    for (var k = 0; k < 7; k++) {
      var lx = Math.floor(r() * W), ly = 150 + Math.floor(r() * 48);
      g.fillStyle = p.glow;
      g.fillRect(lx, ly, 1, 6);
      g.fillRect(lx + 1, ly + 6, 1, 4);
    }
  }

  function midTower(g, p) {
    var r = rng(8181);
    for (var i = 0; i < 4; i++) {
      var x = 20 + i * 124 + Math.floor(r() * 20);
      var w = 30 + Math.floor(r() * 18);
      var top = 84 + Math.floor(r() * 34);
      (function (x0, w0, y0) {
        wrapX(function (ox) {
          g.fillStyle = p.mid;
          g.fillRect(x0 + ox, y0, w0, H - y0);
          // 城垛
          for (var c = 0; c < 4; c++) {
            g.fillRect(x0 + ox + c * (w0 / 4), y0 - 7, Math.max(3, Math.round(w0 / 8)), 7);
          }
          // 尖顶
          for (var s = 0; s < 10; s++) {
            var tw = Math.round(w0 * (1 - s / 12));
            g.fillRect(x0 + ox + ((w0 - tw) >> 1), y0 - 7 - s, tw, 1);
          }
          // 拱窗
          g.fillStyle = p.deep;
          for (var wy = y0 + 16; wy < H - 24; wy += 26) {
            g.fillRect(x0 + ox + (w0 >> 1) - 3, wy, 6, 10);
            g.beginPath(); g.arc(x0 + ox + (w0 >> 1), wy, 3, Math.PI, TAU); g.fill();
          }
          g.fillStyle = p.rim;
          g.fillRect(x0 + ox, y0, 1, H - y0);
        });
      })(x, w, top);
      if (i < 3) {
        g.fillStyle = p.mid;
        g.fillRect(x + w, top + 30, 124 - w, 5);
        g.fillStyle = p.deep;
        g.fillRect(x + w, top + 34, 124 - w, 1);
      }
    }
    ridge(g, p.mid, 206, 3, 2, 0.4, 8);
  }

  function midSea(g, p) {
    var r = rng(3033);
    ridge(g, p.deep, 208, 4, 2, 0.9, 8);
    // 珊瑚丛
    for (var c = 0; c < 5; c++) {
      var bx = 18 + c * 96 + Math.floor(r() * 22);
      (function (x0) {
        wrapX(function (ox) {
          g.fillStyle = p.mid;
          g.fillRect(x0 + ox, 186, 4, H - 186);
          g.fillRect(x0 + ox - 8, 172, 4, 14);
          g.fillRect(x0 + ox + 8, 166, 4, 20);
          g.fillRect(x0 + ox - 14, 160, 3, 12);
          g.fillRect(x0 + ox + 13, 154, 3, 14);
          g.fillStyle = p.rim;
          g.fillRect(x0 + ox + 1, 182, 1, 8);
        });
      })(bx);
    }
    // 沉船（破帆 + 弯曲船体）
    wrapX(function (ox) {
      g.fillStyle = p.mid;
      g.fillRect(318 + ox, 116, 3, 54);
      g.fillRect(296 + ox, 132, 46, 2);
      for (var i = 0; i < 22; i++) {
        g.fillRect(322 + ox, 134 + i, Math.max(2, 20 - (i >> 1)), 1);
      }
      for (var s = 0; s < 26; s++) {
        var hw = 30 - Math.abs(s - 12) * 0.8;
        g.fillRect(300 + ox + Math.round(30 - hw), 168 + s, Math.round(hw * 2), 1);
      }
      g.fillStyle = p.rim;
      g.fillRect(300 + ox, 167, 60, 1);
    });
  }

  function midNether(g, p) {
    var r = rng(2020);
    ridge(g, p.deep, 204, 6, 2, 0.3, 8);
    // 牌坊
    wrapX(function (ox) {
      g.fillStyle = p.mid;
      g.fillRect(120 + ox, 110, 10, H - 110);   // 柱
      g.fillRect(230 + ox, 110, 10, H - 110);
      g.fillRect(102 + ox, 106, 156, 8);        // 横梁
      g.fillRect(96 + ox, 100, 16, 7);          // 上翘檐口
      g.fillRect(248 + ox, 100, 16, 7);
      g.fillRect(92 + ox, 96, 10, 5);
      g.fillRect(258 + ox, 96, 10, 5);
      g.fillRect(114 + ox, 120, 132, 4);        // 下枋
      g.fillStyle = p.deep;
      g.fillRect(150 + ox, 82, 60, 16);         // 匾额
      g.fillStyle = p.rim;
      g.fillRect(150 + ox, 82, 60, 1);
      g.fillRect(120 + ox, 110, 1, H - 110);
    });
    // 鬼火
    for (var i = 0; i < 9; i++) {
      var fx = Math.floor(r() * W), fy = 120 + Math.floor(r() * 62);
      g.fillStyle = p.glow;
      g.fillRect(fx, fy, 3, 5);
      g.fillStyle = p.rim;
      g.fillRect(fx + 1, fy + 1, 1, 3);
    }
  }

  function midMirror(g, p) {
    var r = rng(6060);
    for (var i = 0; i < 6; i++) {
      var x = 10 + i * 84, w = 34 + Math.floor(r() * 16);
      var top = 100 + Math.floor(r() * 40), h = 60 + Math.floor(r() * 40);
      (function (x0, w0, y0, h0) {
        wrapX(function (ox) {
          g.fillStyle = p.mid;
          g.fillRect(x0 + ox, y0, w0, h0);
          g.fillStyle = p.deep;
          g.fillRect(x0 + ox + 4, y0 + 4, w0 - 8, h0 - 8);
          g.fillStyle = p.rim;
          g.fillRect(x0 + ox + 5, y0 + 5, w0 - 10, 1);
          g.fillRect(x0 + ox + 5, y0 + 6, 1, Math.max(4, h0 - 14));
        });
      })(x, w, top, h);
    }
    // 镜片碎晶
    for (var k = 0; k < 14; k++) {
      var tx = Math.floor(r() * W), ty = 140 + Math.floor(r() * 60);
      var tw = 4 + Math.floor(r() * 8), th = 8 + Math.floor(r() * 14);
      g.fillStyle = p.mid;
      for (var s = 0; s < th; s++) {
        var w2 = Math.round(tw * s / th);
        g.fillRect(tx - (w2 >> 1), ty + s, w2, 1);
      }
    }
  }

  function buildMid(p, kind) {
    var c = makeCanvas(W, H), g = c.getContext('2d');
    if (!g) return c;
    g.imageSmoothingEnabled = false;
    if (kind === 'trees') midTrees(g, p);
    else if (kind === 'crystal') midCrystal(g, p);
    else if (kind === 'cloud') midCloud(g, p);
    else if (kind === 'factory') midFactory(g, p);
    else if (kind === 'lava') midLava(g, p);
    else if (kind === 'tower') midTower(g, p);
    else if (kind === 'sea') midSea(g, p);
    else if (kind === 'nether') midNether(g, p);
    else if (kind === 'mirror') midMirror(g, p);
    else ridge(g, p.mid, 176, 10, 2, 0.5, 8); // 未知主题：通用低矮山脊
    return c;
  }

  /* ==================== 前景遮挡（中央 60% 透明） ==================== */
  function foreSide(g, p, kind) {
    var dark = p.dark, rim = mix(p.dust, '#000000', 0.68);
    var r = rng(9000 + kind.length * 37);

    if (kind === 'blades') {
      for (var i = 0; i < 26; i++) {
        var x = Math.floor(r() * 104);
        var hgt = 34 + Math.floor(r() * 56);
        var bend = Math.floor(r() * 9) - 4;
        g.fillStyle = dark;
        for (var s = 0; s < hgt; s++) {
          var wdec = s < hgt * 0.55 ? 3 : (s < hgt * 0.8 ? 2 : 1);
          g.fillRect(x + Math.round(bend * (s / hgt)), H - s, wdec, 1);
        }
        if (i % 4 === 0) {
          g.fillStyle = rim;
          g.fillRect(x + bend, H - hgt + 2, 1, 6);
        }
      }
      g.fillStyle = dark;
      g.fillRect(0, H - 8, 104, 8);
    } else if (kind === 'rocks') {
      for (var j = 0; j < 7; j++) {
        var rx = Math.floor(r() * 88), rw = 18 + Math.floor(r() * 32), rh = 16 + Math.floor(r() * 30);
        g.fillStyle = dark;
        g.beginPath();
        g.moveTo(rx, H);
        g.lineTo(rx + rw * 0.15, H - rh * 0.7);
        g.lineTo(rx + rw * 0.45, H - rh);
        g.lineTo(rx + rw * 0.85, H - rh * 0.5);
        g.lineTo(rx + rw, H);
        g.closePath(); g.fill();
        g.fillStyle = rim;
        g.fillRect(rx + Math.round(rw * 0.42), H - rh, 2, 1);
        g.fillRect(rx + Math.round(rw * 0.44), H - rh + 1, 1, 3);
      }
      g.fillStyle = dark;
      g.fillRect(0, H - 5, 104, 5);
    } else if (kind === 'chain') {
      for (var c = 0; c < 3; c++) {
        var cx = 8 + c * 33 + Math.floor(r() * 8);
        var cy = 92 + Math.floor(r() * 30);
        for (var s2 = 0; cy + s2 < H; s2 += 10) {
          g.fillStyle = dark;
          g.fillRect(cx, cy + s2, 7, 10);
          g.fillStyle = p.deep;
          g.fillRect(cx + 2, cy + s2 + 2, 3, 6);
          g.fillStyle = rim;
          g.fillRect(cx, cy + s2, 2, 1);
        }
      }
      g.fillStyle = dark;
      g.fillRect(0, H - 26, 96, 26);
      g.fillStyle = rim;
      g.fillRect(0, H - 26, 96, 1);
    } else if (kind === 'coral') {
      for (var m = 0; m < 5; m++) {
        var bx = 8 + m * 19;
        g.fillStyle = dark;
        g.fillRect(bx, 176, 4, H - 176);
        g.fillRect(bx - 7, 162, 4, 16);
        g.fillRect(bx + 7, 152, 4, 24);
        g.fillRect(bx - 12, 146, 3, 14);
        g.fillStyle = rim;
        g.fillRect(bx + 1, 172, 1, 8);
      }
      g.fillStyle = dark;
      g.fillRect(0, H - 12, 104, 12);
    } else if (kind === 'shard') {
      for (var k = 0; k < 9; k++) {
        var tx = 6 + Math.floor(r() * 88), tw = 6 + Math.floor(r() * 12);
        var th2 = 26 + Math.floor(r() * 52);
        g.fillStyle = dark;
        for (var s3 = 0; s3 < th2; s3++) {
          var w3 = Math.round(tw * (1 - s3 / th2));
          g.fillRect(tx - (w3 >> 1), H - s3, w3, 1);
        }
        g.fillStyle = rim;
        g.fillRect(tx - 1, H - th2 + 4, 1, 10);
      }
      g.fillStyle = dark;
      g.fillRect(0, H - 6, 104, 6);
    }
  }

  function buildFore(p, kind) {
    var c = makeCanvas(W, H), g = c.getContext('2d');
    if (!g) return c;
    g.imageSmoothingEnabled = false;
    foreSide(g, p, kind);                 // 左下角
    g.save();
    g.translate(W, 0); g.scale(-1, 1);    // 右下角（镜像）
    foreSide(g, p, kind);
    g.restore();
    return c;
  }

  /* ==================== 瓦片变体（仅叠加细节，尺寸/轮廓不变） ==================== */
  function cloneCanvas(src) {
    var c = makeCanvas(src.width, src.height), g = c.getContext('2d');
    if (g) { g.imageSmoothingEnabled = false; g.drawImage(src, 0, 0); }
    return c;
  }

  function decorateTile(g, w, h, th, kind, v) {
    th = th || {};
    var seam = col(th.blockS, '#141420');
    var light = col(th.blockL, '#ffffff');
    var moss = mix(col(th.capD, '#2a4a2a'), col(th.accent, '#f8d048'), 0.28);
    var r = rng(7000 + v * 397 + kind.length * 41);

    if (kind === 'plank') {
      // 木纹长线 + 节疤 + 钉头
      g.fillStyle = mix(seam, '#000000', 0.15);
      var gy = 4 + (v * 3) % 7;
      for (var x = 2; x < w - 2; x += 3) {
        g.fillRect(x, gy, 2, 1);
        g.fillRect(x, gy + 5, 1, 1);
      }
      g.fillStyle = seam;
      g.fillRect(1, h - 3, w - 2, 1);
      var kx = 4 + Math.floor(r() * (w - 8)), ky = 4 + Math.floor(r() * (h - 10));
      g.fillRect(kx, ky, 2, 1);
      g.fillRect(kx, ky + 1, 1, 1);
      g.fillStyle = light;
      g.fillRect(1, 1, 2, 1);
      g.fillRect(w - 3, 1, 2, 1);
      g.fillStyle = seam;
      g.fillRect(2, 1, 1, 1);
      g.fillRect(w - 3, 1, 1, 1);
      return;
    }

    if (v === 0) { // 裂纹 + 碎石
      g.fillStyle = seam;
      var cx = 3 + Math.floor(r() * 7), cy = 4 + Math.floor(r() * 4);
      for (var s = 0; s < 7; s++) {
        g.fillRect(cx, cy + s, 1, 1);
        if (s % 2 === 0) cx += 1; else cx -= 1;
      }
      g.fillStyle = light;
      g.fillRect(cx + 1, cy + 2, 1, 1);
      g.fillStyle = seam;
      g.fillRect(11, 11, 2, 1);
      g.fillRect(12, 12, 1, 1);
    } else if (v === 1) { // 苔藓 / 苔痕
      g.fillStyle = moss;
      g.fillRect(2, 2, 4, 1);
      g.fillRect(3, 3, 2, 1);
      g.fillRect(12, 10, 3, 1);
      g.fillRect(11, 12, 2, 2);
      g.fillStyle = mix(moss, '#000000', 0.32);
      g.fillRect(2, 3, 1, 1);
      g.fillRect(13, 11, 1, 1);
      g.fillRect(6, 13, 2, 1);
    } else { // 砖缝 + 碎石
      g.fillStyle = seam;
      g.fillRect(1, 8, w - 2, 1);
      g.fillRect(5, 1, 1, 7);
      g.fillRect(10, 9, 1, 6);
      g.fillStyle = light;
      g.fillRect(1, 7, w - 2, 1);
      g.fillStyle = seam;
      g.fillRect(3, 12, 2, 1);
      g.fillRect(12, 3, 2, 1);
    }

    if (kind === 'cap') { // 盖层边缘草簇/苔须（画在盖层内，不越界）
      g.fillStyle = moss;
      g.fillRect(3, 1, 1, 2);
      g.fillRect(4, 1, 2, 1);
      g.fillRect(10, 2, 1, 1);
    }
  }

  function tileVariants(src, th, kind, n) {
    if (!src || typeof src.getContext !== 'function' || !src.width || !src.height) return null;
    var out = [];
    for (var v = 0; v < n; v++) {
      var c = cloneCanvas(src), g = c.getContext('2d');
      if (g) decorateTile(g, c.width, c.height, th, kind, v);
      out.push(c);
    }
    return out;
  }

  /* ==================== 包装 buildThemeArt ==================== */
  function decorate(art, themeKey) {
    if (!art || typeof art !== 'object') return art;

    var key = themeKey, th = null;
    try {
      if (typeof THEMES !== 'undefined' && THEMES) {
        if (Object.prototype.hasOwnProperty.call(THEMES, themeKey)) {
          th = THEMES[themeKey];
        } else {
          key = 'grass'; th = THEMES.grass;
        }
      }
    } catch (e) { th = null; }
    if (!key) key = 'grass';
    if (!th) { key = 'grass'; th = {}; }

    var p = palette(th);

    if (art.bg && typeof art.bg === 'object') {
      if (!art.bg.mid) art.bg.mid = buildMid(p, MID_KIND[key] || 'ridge');
      if (!art.bg.fore) art.bg.fore = buildFore(p, FORE_KIND[key] || 'rocks');
    }

    var tiles = art.tiles;
    if (tiles && typeof tiles === 'object') {
      if (tiles.block && !tiles.blockAlt) {
        var bAlt = tileVariants(tiles.block, th, 'block', 3);
        if (bAlt) tiles.blockAlt = bAlt;
      }
      if (tiles.blockCap && !tiles.blockCapAlt) {
        var cAlt = tileVariants(tiles.blockCap, th, 'cap', 3);
        if (cAlt) tiles.blockCapAlt = cAlt;
      }
      if (tiles.plank && !tiles.plankAlt) {
        var pAlt = tileVariants(tiles.plank, th, 'plank', 2);
        if (pAlt) tiles.plankAlt = pAlt;
      }
    }
    return art;
  }

  function install() {
    if (typeof buildThemeArt !== 'function') return false;
    if (buildThemeArt.__remaster) return true;

    var orig = buildThemeArt;
    var wrapped = function (themeKey) {
      var art = orig(themeKey);
      try { decorate(art, themeKey); } catch (e) { /* 增强失败不影响原美术 */ }
      return art;
    };
    wrapped.__remaster = true;

    try { buildThemeArt = wrapped; } catch (e) { /* 常量绑定时走 window */ }
    try {
      if (typeof window !== 'undefined') window.buildThemeArt = wrapped;
    } catch (e2) { /* 静默 */ }
    return true;
  }

  /* 仅在浏览器执行；art.js 若稍后加载则等 load 再试一次 */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (!install()) {
    try {
      window.addEventListener('load', install, { once: true });
    } catch (e) { /* 静默 */ }
  }
})();
