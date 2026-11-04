/* ============================================================
   arcade.js —— v26：小关街机模式（独立单屏小游戏运行时）
   ------------------------------------------------------------
   设计口径（用户 2026-11-04 澄清）：
     · 14 个非 Boss 关**完全放弃**横屏从左向右的跑图玩法，改成固定单屏小游戏；
     · Boss 关仍是原来的平台动作 Boss 战，不动；
     · 选关屏仍是全部关卡按钮与 Boss 放在一起，只在详情里标出「街机 · 类型」。
   本文件只做街机局：固定 384×224 画布、自带输入消费、自带通关/失败判定。
   它与 engine.js 的契约：
     · 读 game（时间/金币/死亡/state/cam）、ALL_LEVELS、THEMES、drawCNText/drawPixelText；
     · 写 game.state='clear'/'fail'、game.time/coins/deaths、game.level（伪关卡对象，
       供 ui 的结算/星级/解锁逻辑复用）；
     · 音效一律经 window.ArcadeBridge（ui.js 注入），缺省回落 game.sfxQueue。
   输入由 ui.js 以 inp 对象逐步传入（不再全局监听键盘，避免和 ui 的 KEYMAP 抢键）。
   ============================================================ */
'use strict';
(function () {
  const W = 384, H = 224;
  const cv = document.getElementById('game');
  const ax = cv.getContext('2d');
  ax.imageSmoothingEnabled = false;
  const TAU = Math.PI * 2;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function metaOf(idx) {
    try { return ALL_LEVELS[idx] || { name: '', theme: 'grass' }; }
    catch (e) { return { name: '', theme: 'grass' }; }
  }
  function themeOf(name) {
    try { return THEMES[name] || THEMES.grass || {}; }
    catch (e) { return {}; }
  }
  function txt(s, x, y, size, color, align) { drawCNText(s, x, y, size, color, align); }
  function pix(s, x, y, scale, color, align) { drawPixelText(s, x, y, scale, color, align); }
  function sfx(name) {
    if (window.ArcadeBridge && window.ArcadeBridge.sfx) window.ArcadeBridge.sfx(name);
    else if (game.sfxQueue) game.sfxQueue.push(name);
  }
  function tone(f, d) {
    if (window.ArcadeBridge && window.ArcadeBridge.tone) window.ArcadeBridge.tone(f, d || 0.16);
  }
  function fmtTime(t) {
    t = Math.max(0, Math.floor(t));
    return (t / 60 | 0) + ':' + String(t % 60).padStart(2, '0');
  }

  /* ---------------- 通用绘制 ---------------- */
  function cutPath(x, y, w, h, c) {
    ax.beginPath();
    ax.moveTo(x + c, y); ax.lineTo(x + w - c, y); ax.lineTo(x + w, y + c);
    ax.lineTo(x + w, y + h - c); ax.lineTo(x + w - c, y + h); ax.lineTo(x + c, y + h);
    ax.lineTo(x, y + h - c); ax.lineTo(x, y + c); ax.closePath();
  }
  function panel(x, y, w, h, alpha, border) {
    const c = 4;
    ax.save(); cutPath(x, y, w, h, c);
    ax.fillStyle = 'rgba(8,14,32,' + (alpha == null ? 0.84 : alpha) + ')'; ax.fill();
    ax.strokeStyle = border || 'rgba(240,200,96,0.72)'; ax.lineWidth = 1; ax.stroke();
    ax.strokeStyle = 'rgba(174,196,236,0.20)';
    cutPath(x + 1.5, y + 1.5, w - 3, h - 3, Math.max(2, c - 1)); ax.stroke();
    ax.restore();
  }
  const HEART = ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000'];
  function drawHeart(x, y, on) {
    ax.fillStyle = on ? '#f85878' : '#3a2430';
    for (let r = 0; r < HEART.length; r++) for (let c = 0; c < 7; c++)
      if (HEART[r][c] === '1') ax.fillRect(x + c, y + r, 1, 1);
    if (on) { ax.fillStyle = '#ffd0d8'; ax.fillRect(x + 2, y + 1, 1, 1); }
  }
  function addFloat(s, color, x, y) {
    A.floats.push({ s: s, c: color, x: x, y: y, t: 0 });
  }

  /* ---------------- 14 个小关的街机配置 ----------------
     键 = ALL_LEVELS 下标；只有非 Boss 关有配置，Boss 关返回 false 走平台动作。
     par = 三星计时目标（秒）；totalCoin = 奖励目标（结算星）；limit = 超时失败。 */
  const STAGES = {
    0: {
      type: 'mine', genre: '动作扫雷', title: '草原寻雷',
      cols: 7, rows: 5, mines: 7, par: 36, limit: 120, totalCoin: 1,
      objective: '挥剑翻开所有安全格，避开 7 颗地雷',
      controls: '方向移动 · J/空格 翻开 · K 插旗 · 鼠标点格',
      hint: '攻击=翻开格子，K=插旗。第一剑必定安全；踩雷扣 1 心。'
    },
    1: {
      type: 'mole', genre: '打地鼠', title: '洞窟敲击',
      quota: 10, cols: 3, rows: 2, rate: 0.62, upMin: 0.70, upMax: 1.05, bomb: 0,
      par: 32, limit: 60, totalCoin: 3,
      objective: '敲中 10 只地鼠；金鼠会多给 1 枚奖励币',
      controls: '方向移动 · J/空格 敲击 · 鼠标点地鼠',
      hint: '地鼠冒头再打；每 3 只里有一只是金鼠，别放过。'
    },
    2: {
      type: 'lights', genre: '点灯', title: '天空灯阵',
      cols: 4, rows: 4, scramble: 6, parMoves: 9, par: 48, limit: 140, totalCoin: 1,
      objective: '把所有灯点亮；每次会翻转自己与上下左右',
      controls: '方向移动 · J/空格 翻转 · 鼠标点灯',
      hint: '先想后按：步数 ≤ 目标步数可拿满奖励，乱点会把灯按回去。'
    },
    3: {
      type: 'memory', genre: '记忆翻牌', title: '齿轮配对',
      pairs: 6, cols: 4, par: 55, limit: 130, totalCoin: 1,
      objective: '翻开并配对 6 对图案，零失误可拿满奖励',
      controls: '方向移动 · J/空格 翻牌 · 鼠标点牌',
      hint: '先连续翻两张记位置；配错会盖回去，但不会扣心。'
    },
    4: {
      type: 'sokoban', genre: '推箱子', title: '烈焰货仓',
      map: ['#########', '#.......#', '#.o.....#', '#..#....#', '#..b....#', '#...p...#', '#########'],
      parMoves: 8, par: 45, limit: 150, totalCoin: 1,
      objective: '把木箱推到金色目标上；只能推，不能拉',
      controls: '方向移动 · K 撤销一步 · 鼠标不参与',
      hint: '箱子推进死角就 K 撤销；先把箱子挪到目标正下方再往上推。'
    },
    5: {
      type: 'snake', genre: '贪吃蛇', title: '塔内灵蛇',
      target: 8, cols: 18, rows: 10, speed: 0.16, par: 58, limit: 130, totalCoin: 1,
      objective: '吃掉 8 颗灵果；撞墙、撞自己会扣心',
      controls: '方向键 / WASD 转向 · 鼠标不参与',
      hint: '不能原地掉头；吃到灵果会长一节，撞一次扣 1 心。'
    },
    7: {
      type: 'gold', genre: '矿脉寻宝', title: '翡翠矿脉',
      quota: 6, emeralds: 4, rocks: 2, par: 55, limit: 140, totalCoin: 3,
      objective: '放钩抓取 6 颗宝石；翡翠每次 +1 奖励币',
      controls: 'J/空格 放钩 · 鼠标点击放钩',
      hint: '钩子左右摆动，看准翡翠再放；石头很重，会拖慢回收。'
    },
    8: {
      type: 'tetris', genre: '落块筑墙', title: '王城筑墙',
      quota: 4, cols: 10, rows: 16, par: 60, limit: 150, totalCoin: 1,
      objective: '消掉 4 行城墙；堆到顶会塌一段并扣 1 心',
      controls: '←→ 移动 · ↑/J 旋转 · ↓ 加速 · 空格 直落',
      hint: '先铺平再消行；一次消多行也只算 1 行进度，稳比快重要。'
    },
    9: {
      type: 'dodge', genre: '弹幕生存', title: '星屑风暴',
      survive: 30, shards: 8, par: 48, limit: 90, totalCoin: 1,
      objective: '撑过 30 秒并收集 8 枚星屑；被陨星擦到扣 1 心',
      controls: '方向键 / WASD 移动 · 鼠标不参与',
      hint: '陨星会越来越密；先保命，再趁空档绕去捡星屑。'
    },
    10: {
      type: 'simon', genre: '编钟', title: '龙宫编钟',
      bells: 5, rounds: 5, par: 75, limit: 190, totalCoin: 1,
      objective: '听钟声顺序并复敲；每一轮多一个音',
      controls: '←→ 选钟 · J/空格 敲响 · 鼠标点钟',
      hint: '一轮比一轮长；敲错扣 1 心并重听本轮，3 心用完失败。'
    },
    11: {
      type: 'bubble', genre: '泡泡消除', title: '珊瑚泡泡',
      cols: 11, rows: 9, fillRows: 5, colors: 5, dangerRow: 7, par: 70, limit: 180, totalCoin: 1,
      objective: '打空所有珊瑚泡泡；3 颗同色相连即破',
      controls: '←→ 调整角度 · J/空格 发射 · 鼠标瞄准点击',
      hint: '瞄准同色扎堆处；打空支撑后，悬空的泡泡会一起掉下来。'
    },
    13: {
      type: 'maze', genre: '迷宫追逃', title: '冥途迷踪',
      map: [
        '###############',
        '#.....#......E#',
        '#.###.#.#####.#',
        '#.#o..#.....#.#',
        '#.#.#####.#.#.#',
        '#o..#...#.#...#',
        '###.#.#.#.###.#',
        '#S..o.#o.o..o.#',
        '###############'
      ],
      par: 65, limit: 150, totalCoin: 1,
      objective: '捡齐 6 张灵符，再走到右上角鬼门；被鬼差碰到扣 1 心',
      controls: '方向键 / WASD 移动 · 鼠标不参与',
      hint: '鬼差走最短路径，绕转角甩开；灵符捡完鬼门才会开。'
    },
    14: {
      type: 'jumper', genre: '垂直攀跃', title: '熔渊攀跃',
      target: 900, par: 75, limit: 150, totalCoin: 1,
      objective: '踩着浮石向上攀 900 尺；掉进熔岩扣 1 心',
      controls: '←→ / AD 移动 · 落到浮石上自动弹跳',
      hint: '左右可穿屏；浮石会左右移动，提前落位别犹豫。'
    },
    16: {
      type: 'breakout', genre: '打砖块', title: '冥渊封印',
      cols: 9, rows: 5, par: 90, limit: 200, totalCoin: 1,
      objective: '击碎封印墙上的全部砖块；球掉下去扣 1 心',
      controls: '←→ / 鼠标移动挡板 · J/空格 发射',
      hint: '挡板边缘反弹角度更斜；先打穿一侧，再救中间的赤核。'
    }
  };

  /* ---------------- 运行时状态 ---------------- */
  let A = null;
  function has(idx) { return !!STAGES[idx]; }
  function start(idx) {
    const st = STAGES[idx];
    if (!st) return false;
    const meta = metaOf(idx);
    A = {
      active: true, idx: idx, st: st, type: st.type, theme: meta.theme || 'grass',
      t: 0, hearts: 3, status: '', floats: [], shake: 0, flash: 0,
      finish: 0, done: false, win: false, failReason: '', data: {}
    };
    game.level = {
      meta: meta, name: meta.name, theme: themeOf(A.theme), boss: false,
      totalCoin: st.totalCoin || 1, par: st.par, shrines: [], decor: [], minis: [],
      tw: 0, th: 0, tiles: null
    };
    game.levelIdx = idx;
    game.state = 'play'; game.paused = false;
    game.time = 0; game.deaths = 0; game.coins = 0;
    game.clearT = 0; game.failT = 0; game.shake = 0;
    game.cam = { x: 0, y: 0 };
    game.player = null; game.boss = null; game.seal = null;
    game.puzzleActive = false; game.puzzleNear = -1; game.solvedPuzzles = {};
    game.hitStop = 0;
    INIT[st.type](st, A.data);
    return true;
  }
  function stop() { if (A) A.active = false; }

  function win() {
    if (!A || A.done) return;
    A.done = true; A.win = true; A.finish = 0.75; A.flash = 0.4;
    game.coins = clamp(game.coins, 0, A.st.totalCoin || 1);
    sfx('clear');
  }
  function fail(reason) {
    if (!A || A.done) return;
    A.done = true; A.win = false; A.failReason = reason || '挑战失败';
    A.finish = 0.85; A.flash = 0.55; A.shake = 8;
    A.hearts = 0; game.deaths = 3;
    sfx('die');
  }
  function loseHeart() {
    if (!A || A.done) return;
    A.hearts = Math.max(0, A.hearts - 1);
    game.deaths = Math.min(3, game.deaths + 1);
    A.shake = 6; sfx('hurt');
    if (A.hearts <= 0) fail('生命耗尽');
  }
  function mistake() {
    if (!A || A.done) return;
    game.deaths = Math.min(3, game.deaths + 1);
    sfx('hurt');
  }
  function commitWin() { game.state = 'clear'; game.clearT = 0; sfx('gem'); }
  function commitFail() { game.state = 'fail'; game.failT = 0; }

  function step(dt, inp) {
    if (!A || !A.active) return;
    // v26 首测修复：结算演出期间 A.done=true，但 finish 倒计时仍必须推进，
    // 否则 win()/fail() 之后永远到不了 commitWin/commitFail（画面卡在"胜利瞬间"不进结算）。
    if (A.done) {
      A.t += dt;
      A.shake = Math.max(0, A.shake - dt * 20);
      A.flash = Math.max(0, A.flash - dt * 1.8);
      for (let i = A.floats.length - 1; i >= 0; i--) {
        const f = A.floats[i]; f.t += dt; f.y -= dt * 26;
        if (f.t > 0.9) A.floats.splice(i, 1);
      }
      if (A.finish > 0) {
        A.finish -= dt;
        if (A.finish <= 0) { if (A.win) commitWin(); else commitFail(); }
      }
      return;
    }
    A.t += dt; game.time += dt;
    A.shake = Math.max(0, A.shake - dt * 20);
    A.flash = Math.max(0, A.flash - dt * 1.8);
    for (let i = A.floats.length - 1; i >= 0; i--) {
      const f = A.floats[i]; f.t += dt; f.y -= dt * 26;
      if (f.t > 0.9) A.floats.splice(i, 1);
    }
    if (game.time >= A.st.limit) { fail('时间到'); return; }
    UPDATE[A.type](dt, inp || {});
  }

  /* ---------------- 背景 / HUD ---------------- */
  function drawBg(tick) {
    const th = themeOf(A.theme);
    const g = ax.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, th.skyT || '#0e1238');
    g.addColorStop(1, th.skyB || '#2c3472');
    ax.fillStyle = g; ax.fillRect(0, 0, W, H);
    ax.fillStyle = 'rgba(6,10,24,0.38)'; ax.fillRect(0, 0, W, H);
    // 浮尘：确定性与 tick 驱动，不依赖 Math.random
    for (let i = 0; i < 26; i++) {
      const x = (i * 97 + A.idx * 41 + A.t * (7 + (i % 4) * 3)) % W;
      const y = (i * 53 + A.idx * 19) % H;
      ax.globalAlpha = 0.10 + 0.10 * ((i % 3) / 2);
      ax.fillStyle = i % 5 === 0 ? '#f8d048' : '#d8e8ff';
      ax.fillRect(x | 0, y | 0, 1, 1);
    }
    ax.globalAlpha = 1;
    ax.save();
    ax.globalAlpha = 0.05; ax.fillStyle = '#ffffff';
    ax.font = 'bold 72px "Microsoft YaHei","PingFang SC",sans-serif';
    ax.textAlign = 'center'; ax.textBaseline = 'middle';
    ax.fillText(A.st.genre, W / 2, 118);
    ax.restore();
  }
  function drawHeader() {
    panel(0, 0, W, 32, 0.88);
    txt('L' + (A.idx + 1) + ' · ' + A.st.genre, 8, 4, 10, '#f8d048');
    txt(A.status || A.st.title, 8, 18, 9, '#c8d4ec');
    const over = game.time > A.st.par;
    pix(fmtTime(game.time), W - 8, 6, 1, over ? '#f87858' : '#a8f0b0', 'right');
    for (let i = 0; i < 3; i++) drawHeart(W - 42 + i * 10, 18, A.hearts > i);
  }
  function drawFooter() {
    panel(0, 204, W, 20, 0.82);
    txt(A.st.controls, W / 2, 207, 8, '#c8d4ec', 'center');
    pix('P PAUSE   R RESTART   ESC MENU', W / 2, 216, 1, '#7a86a8', 'center');
  }
  function drawIntro() {
    if (A.t > 2.3) return;
    const a = clamp(A.t < 0.35 ? A.t / 0.35 : (2.3 - A.t) / 0.55, 0, 1);
    ax.save(); ax.globalAlpha = a;
    panel(30, 64, W - 60, 62, 0.9);
    txt(A.st.title, W / 2, 70, 16, '#f8d048', 'center');
    txt(A.st.objective, W / 2, 93, 9, '#f0f4ff', 'center');
    txt(A.st.hint, W / 2, 108, 8, '#a8b4d8', 'center');
    ax.restore();
  }
  function drawFloats() {
    for (const f of A.floats) {
      ax.save(); ax.globalAlpha = clamp(1 - f.t / 0.9, 0, 1);
      txt(f.s, f.x, f.y, 10, f.c, 'center');
      ax.restore();
    }
  }
  function render(tick) {
    if (!A || !A.active) return;
    ax.setTransform(1, 0, 0, 1, 0, 0);
    ax.globalAlpha = 1;
    drawBg(tick);
    ax.save();
    if (A.shake > 0) ax.translate((Math.random() * 2 - 1) * A.shake, (Math.random() * 2 - 1) * A.shake);
    drawHeader();
    RENDER[A.type](tick);
    drawFooter();
    drawIntro();
    drawFloats();
    ax.restore();
    if (A.flash > 0) {
      ax.setTransform(1, 0, 0, 1, 0, 0);
      ax.fillStyle = 'rgba(255,248,220,' + (0.55 * A.flash).toFixed(3) + ')';
      ax.fillRect(0, 0, W, H);
    }
  }

  /* ============================================================
     1) 动作扫雷
     ============================================================ */
  const INIT = {}, UPDATE = {}, RENDER = {};

  INIT.mine = function (st, d) {
    d.cols = st.cols; d.rows = st.rows; d.mines = st.mines;
    d.cell = Math.min(26, Math.floor(330 / d.cols), Math.floor(152 / d.rows));
    d.bw = d.cols * d.cell; d.bh = d.rows * d.cell;
    d.bx = Math.round((W - d.bw) / 2);
    d.by = 36 + Math.round((150 - d.bh) / 2);
    d.cells = [];
    for (let y = 0; y < d.rows; y++) for (let x = 0; x < d.cols; x++)
      d.cells.push({ x: x, y: y, mine: false, rev: false, flag: false, n: 0 });
    d.cur = { x: (d.cols / 2) | 0, y: (d.rows / 2) | 0 };
    d.ready = false; d.safeTotal = d.cols * d.rows - d.mines; d.revealed = 0;
    d.boomT = 0; d.slashT = 0; d.boom = null;
  };
  function msAt(d, x, y) { return (x >= 0 && x < d.cols && y >= 0 && y < d.rows) ? d.cells[y * d.cols + x] : null; }
  function msPlace(d, sx, sy) {
    const pool = [];
    for (let y = 0; y < d.rows; y++) for (let x = 0; x < d.cols; x++) {
      if (Math.abs(x - sx) <= 1 && Math.abs(y - sy) <= 1) continue;
      pool.push({ x: x, y: y });
    }
    for (let i = pool.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    for (let i = 0; i < d.mines && i < pool.length; i++) msAt(d, pool[i].x, pool[i].y).mine = true;
    for (const c of d.cells) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const o = msAt(d, c.x + dx, c.y + dy);
        if (o && o.mine) n++;
      }
      c.n = n;
    }
    d.ready = true;
  }
  function msFlagCount(d) { let n = 0; for (const c of d.cells) if (c.flag && !c.rev) n++; return n; }
  function msReveal(d, x, y) {
    const c = msAt(d, x, y);
    if (!c || c.rev || c.flag || A.done) return;
    if (!d.ready) msPlace(d, x, y);
    if (c.mine) {
      c.rev = true; d.boom = { x: x, y: y, t: 0.4 }; d.boomT = 0.4;
      addFloat('踩雷 -1 心', '#f85868', d.bx + x * d.cell + d.cell / 2, d.by + y * d.cell);
      loseHeart();
      return;
    }
    const stack = [c];
    while (stack.length) {
      const q = stack.pop();
      if (!q || q.rev || q.flag) continue;
      q.rev = true; d.revealed++;
      if (q.n === 0) {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const o = msAt(d, q.x + dx, q.y + dy);
          if (o && !o.rev && !o.flag && !o.mine) stack.push(o);
        }
      }
    }
    d.slashT = 0.14; sfx('hit');
    if (d.revealed >= d.safeTotal) {
      game.coins = game.deaths === 0 ? 1 : 0;
      A.status = '全部安全格已翻开';
      win();
    }
  }
  function msFlag(d, x, y) {
    const c = msAt(d, x, y);
    if (!c || c.rev) return;
    c.flag = !c.flag; sfx('select');
  }
  UPDATE.mine = function (dt, inp) {
    const d = A.data;
    d.boomT = Math.max(0, d.boomT - dt);
    d.slashT = Math.max(0, d.slashT - dt);
    if (inp.leftHit) d.cur.x = clamp(d.cur.x - 1, 0, d.cols - 1);
    if (inp.rightHit) d.cur.x = clamp(d.cur.x + 1, 0, d.cols - 1);
    if (inp.upHit) d.cur.y = clamp(d.cur.y - 1, 0, d.rows - 1);
    if (inp.downHit) d.cur.y = clamp(d.cur.y + 1, 0, d.rows - 1);
    if (inp.mx >= d.bx && inp.mx < d.bx + d.bw && inp.my >= d.by && inp.my < d.by + d.bh) {
      const x = ((inp.mx - d.bx) / d.cell) | 0, y = ((inp.my - d.by) / d.cell) | 0;
      d.cur.x = clamp(x, 0, d.cols - 1); d.cur.y = clamp(y, 0, d.rows - 1);
      if (inp.click) msReveal(d, d.cur.x, d.cur.y);
    }
    if (inp.attackHit || inp.confirmHit) msReveal(d, d.cur.x, d.cur.y);
    if (inp.dashHit) msFlag(d, d.cur.x, d.cur.y);
    const flags = msFlagCount(d);
    A.status = '安全格 ' + d.revealed + '/' + d.safeTotal + '　旗 ' + flags + '/' + d.mines;
  };
  RENDER.mine = function () {
    const d = A.data;
    panel(d.bx - 6, d.by - 6, d.bw + 12, d.bh + 12, 0.9);
    for (const c of d.cells) {
      const x = d.bx + c.x * d.cell, y = d.by + c.y * d.cell;
      if (!c.rev) {
        ax.fillStyle = '#34405e'; ax.fillRect(x, y, d.cell - 1, d.cell - 1);
        ax.fillStyle = '#56688c'; ax.fillRect(x, y, d.cell - 1, 2); ax.fillRect(x, y, 2, d.cell - 1);
        ax.fillStyle = '#1c2438'; ax.fillRect(x + 2, y + d.cell - 3, d.cell - 3, 2);
        if (c.flag) {
          ax.fillStyle = '#e8eef8'; ax.fillRect(x + d.cell / 2 - 1, y + 5, 2, d.cell - 10);
          ax.fillStyle = '#f84858'; ax.beginPath();
          ax.moveTo(x + d.cell / 2 + 1, y + 6);
          ax.lineTo(x + d.cell / 2 + 1 + d.cell * 0.34, y + 10);
          ax.lineTo(x + d.cell / 2 + 1, y + 14); ax.closePath(); ax.fill();
        }
      } else {
        ax.fillStyle = '#141c30'; ax.fillRect(x, y, d.cell - 1, d.cell - 1);
        ax.strokeStyle = 'rgba(120,140,180,0.22)'; ax.strokeRect(x + 0.5, y + 0.5, d.cell - 2, d.cell - 2);
        if (c.mine) {
          const mx = x + d.cell / 2, my = y + d.cell / 2;
          ax.fillStyle = d.boom && d.boom.x === c.x && d.boom.y === c.y ? '#f85848' : '#30384e';
          ax.beginPath(); ax.arc(mx, my, d.cell * 0.24, 0, TAU); ax.fill();
          ax.strokeStyle = '#f8d048'; ax.lineWidth = 1;
          for (let i = 0; i < 8; i++) {
            const a = i * TAU / 8;
            ax.beginPath();
            ax.moveTo(mx + Math.cos(a) * d.cell * 0.24, my + Math.sin(a) * d.cell * 0.24);
            ax.lineTo(mx + Math.cos(a) * d.cell * 0.38, my + Math.sin(a) * d.cell * 0.38);
            ax.stroke();
          }
          ax.fillStyle = '#fff0b0'; ax.fillRect(mx - 2, my - 3, 2, 2);
        } else if (c.n > 0) {
          const cols = ['', '#8ae8f8', '#78f878', '#f8d048', '#f8a030', '#f87858', '#d878f8', '#f8f0ff', '#ffffff'];
          pix(String(c.n), x + d.cell / 2, y + d.cell / 2 - 5, 2, cols[c.n] || '#fff', 'center');
        }
      }
    }
    // 光标：金色双线框 + 一把小剑（攻击反馈）
    const cx = d.bx + d.cur.x * d.cell, cy = d.by + d.cur.y * d.cell;
    ax.strokeStyle = A.t % 0.6 < 0.3 ? '#fff8c8' : '#f8c860'; ax.lineWidth = 2;
    ax.strokeRect(cx + 0.5, cy + 0.5, d.cell - 2, d.cell - 2);
    if (d.slashT > 0) {
      ax.strokeStyle = 'rgba(255,255,255,' + (d.slashT / 0.14).toFixed(2) + ')';
      ax.lineWidth = 2; ax.beginPath();
      ax.arc(cx + d.cell / 2, cy + d.cell / 2, d.cell * 0.55, -0.7, 1.3); ax.stroke();
    }
    if (!d.ready) txt('第一剑必定安全', W / 2, d.by + d.bh + 8, 9, '#8ae8f8', 'center');
    else txt('数字 = 周围 8 格的雷数', W / 2, d.by + d.bh + 8, 8, '#7e8cb0', 'center');
  };

  /* ============================================================
     2) 打地鼠
     ============================================================ */
  INIT.mole = function (st, d) {
    d.cols = st.cols; d.rows = st.rows; d.cur = 0; d.hits = 0;
    d.spawnT = 0.6; d.spawnCount = 0; d.goldLeft = 3;
    d.hw = 58; d.hh = 42;
    const totalW = d.cols * d.hw, totalH = d.rows * 62;
    const x0 = (W - totalW) / 2 + d.hw / 2;
    const y0 = 88 - (totalH - 124) / 2;
    d.holes = [];
    for (let y = 0; y < d.rows; y++) for (let x = 0; x < d.cols; x++) {
      d.holes.push({
        cx: x0 + x * d.hw, cy: y0 + y * 62, up: false, upT: 0, rise: 0,
        cool: 0, flash: 0, kind: 'normal', dur: 0.8
      });
    }
  };
  function moleSpawn(d) {
    const free = [];
    for (let i = 0; i < d.holes.length; i++) {
      const h = d.holes[i];
      if (!h.up && h.cool <= 0) free.push(h);
    }
    if (!free.length) return;
    const h = free[(Math.random() * free.length) | 0];
    let kind = 'normal';
    if (Math.random() < (A.st.bomb || 0)) kind = 'bomb';
    else if (d.goldLeft > 0 && d.spawnCount % 3 === 2) { kind = 'gold'; d.goldLeft--; }
    d.spawnCount++;
    h.kind = kind; h.up = true; h.upT = 0; h.dur = A.st.upMin + Math.random() * (A.st.upMax - A.st.upMin);
    h.rise = 0; h.flash = 0;
  }
  function moleHit(d, h) {
    if (!h.up || A.done) return;
    if (h.kind === 'bomb') {
      h.up = false; h.cool = 0.35; h.flash = 0.3;
      addFloat('炸弹 -1 心', '#f85868', h.cx, h.cy - 26);
      loseHeart();
      return;
    }
    d.hits++;
    h.up = false; h.cool = 0.22; h.flash = 0.28;
    A.shake = Math.max(A.shake, 2); sfx('hit');
    if (h.kind === 'gold') {
      game.coins = Math.min(A.st.totalCoin, game.coins + 1);
      addFloat('金鼠 +1', '#f8d048', h.cx, h.cy - 28);
    } else addFloat('+1', '#c8f0ff', h.cx, h.cy - 26);
    if (d.hits >= A.st.quota) {
      A.status = '敲中 ' + d.hits + ' 只';
      win();
    }
  }
  UPDATE.mole = function (dt, inp) {
    const d = A.data;
    d.spawnT -= dt;
    if (d.spawnT <= 0) { moleSpawn(d); d.spawnT = A.st.rate * (0.72 + Math.random() * 0.55); }
    for (const h of d.holes) {
      h.flash = Math.max(0, h.flash - dt);
      h.cool = Math.max(0, h.cool - dt);
      if (h.up) {
        h.rise = Math.min(1, h.rise + dt * 7);
        h.upT += dt;
        if (h.upT >= h.dur) { h.up = false; h.cool = 0.22; }
      } else h.rise = Math.max(0, h.rise - dt * 7);
    }
    if (inp.leftHit) d.cur = (d.cur % d.cols === 0) ? d.cur : d.cur - 1;
    if (inp.rightHit) d.cur = (d.cur % d.cols === d.cols - 1) ? d.cur : d.cur + 1;
    if (inp.upHit) d.cur = d.cur < d.cols ? d.cur : d.cur - d.cols;
    if (inp.downHit) d.cur = d.cur >= (d.rows - 1) * d.cols ? d.cur : d.cur + d.cols;
    if (inp.mx >= 0) {
      for (let i = 0; i < d.holes.length; i++) {
        const h = d.holes[i];
        if (Math.abs(inp.mx - h.cx) < 26 && inp.my > h.cy - 34 && inp.my < h.cy + 12) { d.cur = i; break; }
      }
      if (inp.click) { const h = d.holes[d.cur]; if (Math.abs(inp.mx - h.cx) < 26 && Math.abs(inp.my - h.cy) < 30) moleHit(d, h); }
    }
    if (inp.attackHit || inp.confirmHit) moleHit(d, d.holes[d.cur]);
    A.status = '命中 ' + d.hits + '/' + A.st.quota + '　金鼠 ' + game.coins + '/' + A.st.totalCoin;
  };
  RENDER.mole = function () {
    const d = A.data;
    // 草地/岩地背景带
    const th = themeOf(A.theme);
    ax.fillStyle = 'rgba(30,44,48,0.55)'; ax.fillRect(0, 38, W, 160);
    ax.fillStyle = th.accent || '#38c860'; ax.globalAlpha = 0.10; ax.fillRect(0, 38, W, 160); ax.globalAlpha = 1;
    for (const h of d.holes) {
      ax.fillStyle = '#2a2018'; ax.beginPath(); ax.ellipse(h.cx, h.cy + 3, 22, 9, 0, 0, TAU); ax.fill();
      ax.fillStyle = '#120e14'; ax.beginPath(); ax.ellipse(h.cx, h.cy + 2, 17, 6, 0, 0, TAU); ax.fill();
      if (h.rise > 0.01) {
        ax.save();
        ax.beginPath(); ax.rect(h.cx - 24, h.cy - 40, 48, 44); ax.clip();
        const by = h.cy + 4 - h.rise * 22;
        let body = '#a86a3c', dark = '#7a4828', belly = '#d8a070';
        if (h.kind === 'gold') { body = '#e8b838'; dark = '#b88818'; belly = '#ffe890'; }
        if (h.kind === 'bomb') { body = '#30343e'; dark = '#1c2028'; belly = '#505866'; }
        ax.fillStyle = body; ax.beginPath(); ax.ellipse(h.cx, by, 14, 15, 0, 0, TAU); ax.fill();
        ax.fillStyle = dark;
        ax.beginPath(); ax.arc(h.cx - 10, by - 11, 4, 0, TAU); ax.fill();
        ax.beginPath(); ax.arc(h.cx + 10, by - 11, 4, 0, TAU); ax.fill();
        ax.fillStyle = belly; ax.beginPath(); ax.ellipse(h.cx, by + 5, 8, 8, 0, 0, TAU); ax.fill();
        ax.fillStyle = '#20140c';
        ax.fillRect(h.cx - 7, by - 5, 3, 4); ax.fillRect(h.cx + 4, by - 5, 3, 4);
        if (h.kind === 'bomb') {
          ax.strokeStyle = '#f8b048'; ax.lineWidth = 1;
          ax.beginPath(); ax.moveTo(h.cx + 2, by - 14); ax.quadraticCurveTo(h.cx + 9, by - 22, h.cx + 5, by - 26); ax.stroke();
          ax.fillStyle = '#f85838'; ax.fillRect(h.cx + 4, by - 28, 2, 2);
        } else {
          ax.fillStyle = h.kind === 'gold' ? '#fff8c8' : '#f0a0a8';
          ax.fillRect(h.cx - 1, by + 2, 3, 2);
        }
        ax.restore();
        // 洞口前沿，压住地鼠下半身
        ax.fillStyle = '#2a2018'; ax.beginPath();
        ax.ellipse(h.cx, h.cy + 3, 22, 9, 0, 0.05, Math.PI - 0.05); ax.lineTo(h.cx - 22, h.cy + 3); ax.fill();
      }
      if (h.flash > 0) {
        ax.strokeStyle = 'rgba(255,248,200,' + (h.flash / 0.28).toFixed(2) + ')';
        ax.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
          const a = i * TAU / 4 + 0.4;
          ax.beginPath(); ax.moveTo(h.cx + Math.cos(a) * 12, h.cy - 12 + Math.sin(a) * 12);
          ax.lineTo(h.cx + Math.cos(a) * 24, h.cy - 12 + Math.sin(a) * 24); ax.stroke();
        }
      }
    }
    const h = d.holes[d.cur];
    ax.strokeStyle = '#fff8c8'; ax.lineWidth = 2;
    ax.beginPath(); ax.ellipse(h.cx, h.cy + 3, 25, 11, 0, 0, TAU); ax.stroke();
    ax.fillStyle = '#f8d048';
    const bob = Math.sin(A.t * 6) * 2;
    ax.beginPath();
    ax.moveTo(h.cx, h.cy - 42 + bob);
    ax.lineTo(h.cx - 4, h.cy - 49 + bob);
    ax.lineTo(h.cx + 4, h.cy - 49 + bob);
    ax.closePath(); ax.fill();
  };

  /* ============================================================
     3) 点灯（Lights Out）
     ============================================================ */
  INIT.lights = function (st, d) {
    d.cols = st.cols; d.rows = st.rows;
    d.cell = Math.min(54, Math.floor(300 / d.cols), Math.floor(140 / d.rows));
    d.bw = d.cols * d.cell; d.bh = d.rows * d.cell;
    d.bx = Math.round((W - d.bw) / 2);
    d.by = 38 + Math.round((150 - d.bh) / 2);
    d.on = new Array(d.cols * d.rows).fill(true);
    d.flash = new Array(d.cols * d.rows).fill(0);
    d.cur = { x: (d.cols / 2) | 0, y: (d.rows / 2) | 0 };
    d.moves = 0;
    for (let attempt = 0; attempt < 30; attempt++) {
      d.on.fill(true);
      for (let i = 0; i < st.scramble; i++) {
        const x = (Math.random() * d.cols) | 0, y = (Math.random() * d.rows) | 0;
        lightToggle(d, x, y, false);
      }
      if (d.on.some(v => !v)) break;
    }
  };
  function lightToggle(d, x, y, count) {
    const pts = [[x, y], [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
    for (const p of pts) {
      if (p[0] < 0 || p[0] >= d.cols || p[1] < 0 || p[1] >= d.rows) continue;
      const i = p[1] * d.cols + p[0];
      d.on[i] = !d.on[i]; d.flash[i] = 0.18;
    }
    if (count !== false) { d.moves++; sfx('switch'); }
  }
  UPDATE.lights = function (dt, inp) {
    const d = A.data;
    for (let i = 0; i < d.flash.length; i++) d.flash[i] = Math.max(0, d.flash[i] - dt);
    if (inp.leftHit) d.cur.x = clamp(d.cur.x - 1, 0, d.cols - 1);
    if (inp.rightHit) d.cur.x = clamp(d.cur.x + 1, 0, d.cols - 1);
    if (inp.upHit) d.cur.y = clamp(d.cur.y - 1, 0, d.rows - 1);
    if (inp.downHit) d.cur.y = clamp(d.cur.y + 1, 0, d.rows - 1);
    if (inp.mx >= d.bx && inp.mx < d.bx + d.bw && inp.my >= d.by && inp.my < d.by + d.bh) {
      d.cur.x = clamp(((inp.mx - d.bx) / d.cell) | 0, 0, d.cols - 1);
      d.cur.y = clamp(((inp.my - d.by) / d.cell) | 0, 0, d.rows - 1);
      if (inp.click) lightToggle(d, d.cur.x, d.cur.y, true);
    }
    if (inp.attackHit || inp.confirmHit) lightToggle(d, d.cur.x, d.cur.y, true);
    let lit = 0; for (const v of d.on) if (v) lit++;
    A.status = '亮灯 ' + lit + '/' + d.on.length + '　步数 ' + d.moves + ' · 目标 ≤ ' + A.st.parMoves;
    if (lit === d.on.length) {
      game.coins = d.moves <= A.st.parMoves ? 1 : 0;
      A.status = '全灯点亮 · ' + d.moves + ' 步';
      win();
    }
  };
  RENDER.lights = function () {
    const d = A.data;
    panel(d.bx - 8, d.by - 8, d.bw + 16, d.bh + 16, 0.9);
    // 光标十字预览
    ax.fillStyle = 'rgba(248,208,72,0.10)';
    ax.fillRect(d.bx, d.by + d.cur.y * d.cell, d.bw, d.cell);
    ax.fillRect(d.bx + d.cur.x * d.cell, d.by, d.cell, d.bh);
    for (let y = 0; y < d.rows; y++) for (let x = 0; x < d.cols; x++) {
      const i = y * d.cols + x;
      const cx = d.bx + x * d.cell + d.cell / 2;
      const cy = d.by + y * d.cell + d.cell / 2;
      ax.fillStyle = '#182238'; ax.fillRect(d.bx + x * d.cell + 2, d.by + y * d.cell + 2, d.cell - 4, d.cell - 4);
      ax.strokeStyle = 'rgba(120,140,180,0.28)'; ax.strokeRect(d.bx + x * d.cell + 2.5, d.by + y * d.cell + 2.5, d.cell - 5, d.cell - 5);
      const R = d.cell * 0.24;
      if (d.on[i]) {
        ax.globalAlpha = 0.20 + 0.12 * Math.sin(A.t * 4 + i);
        ax.fillStyle = '#f8d048'; ax.beginPath(); ax.arc(cx, cy, R * 1.75, 0, TAU); ax.fill();
        ax.globalAlpha = 0.55; ax.beginPath(); ax.arc(cx, cy, R * 1.25, 0, TAU); ax.fill();
        ax.globalAlpha = 1;
        ax.fillStyle = '#ffe880'; ax.beginPath(); ax.arc(cx, cy, R, 0, TAU); ax.fill();
        ax.fillStyle = '#fffbe0'; ax.beginPath(); ax.arc(cx - R * 0.25, cy - R * 0.25, R * 0.45, 0, TAU); ax.fill();
      } else {
        ax.fillStyle = '#4a5470'; ax.beginPath(); ax.arc(cx, cy, R, 0, TAU); ax.fill();
        ax.fillStyle = '#2c3448'; ax.beginPath(); ax.arc(cx, cy, R * 0.72, 0, TAU); ax.fill();
        ax.fillStyle = '#6a7694'; ax.fillRect(cx - R * 0.4, cy - R * 0.6, R * 0.45, R * 0.45);
      }
      if (d.flash[i] > 0) {
        ax.globalAlpha = d.flash[i] / 0.18;
        ax.strokeStyle = '#ffffff'; ax.lineWidth = 2;
        ax.beginPath(); ax.arc(cx, cy, R * 1.5, 0, TAU); ax.stroke();
        ax.globalAlpha = 1;
      }
    }
    ax.strokeStyle = '#fff8c8'; ax.lineWidth = 2;
    ax.strokeRect(d.bx + d.cur.x * d.cell + 1.5, d.by + d.cur.y * d.cell + 1.5, d.cell - 3, d.cell - 3);
  };

  /* ============================================================
     4) 记忆翻牌
     ============================================================ */
  const ICON_COLORS = ['#d8e8ff', '#f85878', '#f8d048', '#f8b030', '#48e0e8', '#f8d048', '#e8eef8', '#68d878', '#f8c860', '#c888f8'];
  function drawIcon(id, cx, cy, r) {
    const col = ICON_COLORS[id % ICON_COLORS.length];
    ax.save(); ax.translate(cx, cy);
    ax.fillStyle = col; ax.strokeStyle = col; ax.lineWidth = Math.max(1, r * 0.14);
    if (id === 0) { // 剑
      ax.rotate(-Math.PI / 4);
      ax.fillRect(-r * 0.10, -r * 0.95, r * 0.20, r * 1.25);
      ax.fillStyle = '#8a94b0'; ax.fillRect(-r * 0.55, r * 0.28, r * 1.10, r * 0.16);
      ax.fillStyle = '#c88848'; ax.fillRect(-r * 0.16, r * 0.34, r * 0.32, r * 0.58);
    } else if (id === 1) { // 心
      for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) if (!(x === -1 && y === -1) && !(x === 1 && y === -1))
        ax.fillRect(x * r * 0.33 - r * 0.16, y * r * 0.30 - r * 0.08, r * 0.32, r * 0.30);
      ax.fillRect(-r * 0.33, r * 0.05, r * 0.66, r * 0.22);
      ax.fillRect(-r * 0.12, r * 0.25, r * 0.24, r * 0.18);
      ax.fillStyle = '#ffd0d8'; ax.fillRect(-r * 0.45, -r * 0.18, r * 0.15, r * 0.12);
    } else if (id === 2) { // 星
      ax.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5;
        const rr = i % 2 ? r * 0.40 : r * 0.92;
        i ? ax.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ax.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ax.closePath(); ax.fill();
    } else if (id === 3) { // 金币
      ax.beginPath(); ax.arc(0, 0, r * 0.82, 0, TAU); ax.fill();
      ax.fillStyle = '#a86a18'; ax.beginPath(); ax.arc(0, 0, r * 0.58, 0, TAU); ax.fill();
      ax.fillStyle = '#ffe890'; ax.fillRect(-r * 0.16, -r * 0.44, r * 0.32, r * 0.88);
    } else if (id === 4) { // 宝石
      ax.beginPath(); ax.moveTo(0, -r * 0.9); ax.lineTo(r * 0.78, -r * 0.2);
      ax.lineTo(0, r * 0.92); ax.lineTo(-r * 0.78, -r * 0.2); ax.closePath(); ax.fill();
      ax.fillStyle = '#c8fbff'; ax.beginPath(); ax.moveTo(0, -r * 0.72); ax.lineTo(r * 0.4, -r * 0.18);
      ax.lineTo(0, r * 0.2); ax.lineTo(-r * 0.4, -r * 0.18); ax.closePath(); ax.fill();
    } else if (id === 5) { // 钥匙
      ax.beginPath(); ax.arc(-r * 0.35, -r * 0.28, r * 0.38, 0, TAU); ax.lineWidth = r * 0.22; ax.stroke();
      ax.fillRect(-r * 0.12, -r * 0.04, r * 0.72, r * 0.18);
      ax.fillRect(r * 0.34, r * 0.10, r * 0.16, r * 0.28);
      ax.fillRect(r * 0.56, r * 0.10, r * 0.14, r * 0.20);
    } else if (id === 6) { // 骷髅
      ax.beginPath(); ax.arc(0, -r * 0.16, r * 0.72, 0, TAU); ax.fill();
      ax.fillRect(-r * 0.46, r * 0.30, r * 0.92, r * 0.38);
      ax.fillStyle = '#202838';
      ax.fillRect(-r * 0.34, -r * 0.28, r * 0.22, r * 0.26);
      ax.fillRect(r * 0.12, -r * 0.28, r * 0.22, r * 0.26);
      ax.fillRect(-r * 0.06, r * 0.10, r * 0.12, r * 0.16);
    } else if (id === 7) { // 叶
      ax.beginPath(); ax.ellipse(-r * 0.12, 0, r * 0.78, r * 0.46, -0.5, 0, TAU); ax.fill();
      ax.strokeStyle = '#204828'; ax.lineWidth = Math.max(1, r * 0.10);
      ax.beginPath(); ax.moveTo(-r * 0.62, r * 0.46); ax.lineTo(r * 0.55, -r * 0.46); ax.stroke();
    } else if (id === 8) { // 钟
      ax.beginPath(); ax.moveTo(-r * 0.70, r * 0.42); ax.quadraticCurveTo(-r * 0.52, -r * 0.58, 0, -r * 0.74);
      ax.quadraticCurveTo(r * 0.52, -r * 0.58, r * 0.70, r * 0.42); ax.closePath(); ax.fill();
      ax.fillRect(-r * 0.78, r * 0.38, r * 1.56, r * 0.18);
      ax.beginPath(); ax.arc(0, r * 0.68, r * 0.20, 0, TAU); ax.fill();
    } else { // 灵珠
      ax.beginPath(); ax.arc(0, 0, r * 0.78, 0, TAU); ax.fill();
      ax.fillStyle = '#f0d0ff'; ax.beginPath(); ax.arc(-r * 0.22, -r * 0.24, r * 0.30, 0, TAU); ax.fill();
      ax.strokeStyle = 'rgba(216,160,255,0.5)'; ax.lineWidth = 1;
      ax.beginPath(); ax.arc(0, 0, r * 1.02, 0, TAU); ax.stroke();
    }
    ax.restore();
  }
  INIT.memory = function (st, d) {
    d.pairs = st.pairs; d.cols = st.cols;
    // 卡片数=对数×2（不是对数）——v26 首测 L4 第三行被画到面板外、鼠标点不到，
    // 就是这里把 6 对算成 6 张、行数少算了一行。
    d.rows = Math.ceil(st.pairs * 2 / st.cols);
    d.cw = Math.min(66, Math.floor((W - 40 - (d.cols - 1) * 7) / d.cols));
    d.ch = Math.min(54, Math.floor((164 - (d.rows - 1) * 7) / d.rows));
    d.bw = d.cols * d.cw + (d.cols - 1) * 7;
    d.bh = d.rows * d.ch + (d.rows - 1) * 7;
    d.bx = Math.round((W - d.bw) / 2); d.by = 34 + Math.round((164 - d.bh) / 2);
    d.cards = [];
    for (let i = 0; i < d.pairs; i++) { d.cards.push({ icon: i, open: false, matched: false, wrong: 0 }); d.cards.push({ icon: i, open: false, matched: false, wrong: 0 }); }
    for (let i = d.cards.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = d.cards[i]; d.cards[i] = d.cards[j]; d.cards[j] = t;
    }
    d.cur = 0; d.first = -1; d.lock = 0; d.matches = 0; d.mistakes = 0;
  };
  function memXY(d, i) {
    const cx = i % d.cols, cy = (i / d.cols) | 0;
    return [d.bx + cx * (d.cw + 7), d.by + cy * (d.ch + 7)];
  }
  function memFlip(d, i) {
    const c = d.cards[i];
    if (A.done || d.lock > 0 || !c || c.open || c.matched) return;
    c.open = true; sfx('select');
    if (d.first < 0) { d.first = i; return; }
    const a = d.cards[d.first];
    if (a.icon === c.icon) {
      a.matched = c.matched = true; d.matches++; d.first = -1; sfx('coin');
      if (d.matches >= d.pairs) {
        game.coins = d.mistakes === 0 ? 1 : 0;
        game.deaths = d.mistakes;
        A.status = '全部配对完成';
        win();
      }
    } else {
      d.lock = 0.68; d.mistakes++; game.deaths = Math.min(3, d.mistakes);
      a.wrong = c.wrong = 0.68; sfx('hurt');
    }
  }
  UPDATE.memory = function (dt, inp) {
    const d = A.data;
    if (d.lock > 0) {
      d.lock -= dt;
      if (d.lock <= 0) {
        for (const c of d.cards) { c.open = false; c.wrong = 0; }
        d.first = -1;
      }
    }
    if (inp.leftHit) d.cur = Math.max(0, d.cur - 1);
    if (inp.rightHit) d.cur = Math.min(d.cards.length - 1, d.cur + 1);
    if (inp.upHit) d.cur = Math.max(0, d.cur - d.cols);
    if (inp.downHit) d.cur = Math.min(d.cards.length - 1, d.cur + d.cols);
    if (inp.mx >= d.bx && inp.mx < d.bx + d.bw && inp.my >= d.by && inp.my < d.by + d.bh) {
      const cx = clamp(((inp.mx - d.bx) / (d.cw + 7)) | 0, 0, d.cols - 1);
      const cy = clamp(((inp.my - d.by) / (d.ch + 7)) | 0, 0, d.rows - 1);
      const i = cy * d.cols + cx;
      if (i >= 0 && i < d.cards.length) { d.cur = i; if (inp.click) memFlip(d, i); }
    }
    if (inp.attackHit || inp.confirmHit) memFlip(d, d.cur);
    A.status = '配对 ' + d.matches + '/' + d.pairs + '　失误 ' + d.mistakes;
  };
  RENDER.memory = function () {
    const d = A.data;
    panel(d.bx - 8, d.by - 8, d.bw + 16, d.bh + 16, 0.9);
    for (let i = 0; i < d.cards.length; i++) {
      const c = d.cards[i], xy = memXY(d, i);
      const x = xy[0], y = xy[1];
      const lift = c.matched ? 1 : 0;
      ax.fillStyle = c.matched ? '#173a2c' : '#1e2c4c';
      ax.fillRect(x, y + lift, d.cw, d.ch - lift);
      ax.strokeStyle = c.matched ? '#68e8a0' : '#f0c860'; ax.lineWidth = 1;
      ax.strokeRect(x + 0.5, y + 0.5 + lift, d.cw - 1, d.ch - 1 - lift);
      if (c.wrong > 0) { ax.strokeStyle = '#f85868'; ax.lineWidth = 2; ax.strokeRect(x + 1, y + 1, d.cw - 2, d.ch - 2); }
      if (c.open || c.matched) {
        drawIcon(c.icon, x + d.cw / 2, y + d.ch / 2 + lift, Math.min(d.cw, d.ch) * 0.30);
      } else {
        ax.fillStyle = 'rgba(120,150,220,0.14)';
        ax.fillRect(x + 5, y + 5, d.cw - 10, d.ch - 10);
        pix('?', x + d.cw / 2, y + d.ch / 2 - 6, 2, '#7e92c8', 'center');
      }
      if (i === d.cur) {
        ax.strokeStyle = A.t % 0.6 < 0.3 ? '#fff8c8' : '#f8c860'; ax.lineWidth = 2;
        ax.strokeRect(x + 1, y + 1, d.cw - 2, d.ch - 2);
      }
    }
  };

  /* ============================================================
     5) 推箱子
     ============================================================ */
  function sokKey(x, y) { return x + ',' + y; }
  INIT.sokoban = function (st, d) {
    const rows = st.map;
    d.cols = rows[0].length; d.rows = rows.length;
    d.cell = Math.min(36, Math.floor(320 / d.cols), Math.floor(164 / d.rows));
    d.bw = d.cols * d.cell; d.bh = d.rows * d.cell;
    d.bx = Math.round((W - d.bw) / 2);
    d.by = 34 + Math.round((164 - d.bh) / 2);
    d.walls = new Set(); d.targets = new Set(); d.boxes = [];
    d.player = { x: 0, y: 0 }; d.face = 1; d.moves = 0; d.undo = []; d.cd = 0;
    for (let y = 0; y < d.rows; y++) for (let x = 0; x < d.cols; x++) {
      const ch = rows[y][x];
      if (ch === '#') d.walls.add(sokKey(x, y));
      if (ch === 'o' || ch === '*' || ch === '+') d.targets.add(sokKey(x, y));
      if (ch === 'b' || ch === '*') d.boxes.push({ x: x, y: y });
      if (ch === 'p' || ch === '+') d.player = { x: x, y: y };
    }
  };
  function sokBoxAt(d, x, y) {
    for (let i = 0; i < d.boxes.length; i++) if (d.boxes[i].x === x && d.boxes[i].y === y) return i;
    return -1;
  }
  function sokSnapshot(d) {
    d.undo.push({ px: d.player.x, py: d.player.y, boxes: d.boxes.map(b => ({ x: b.x, y: b.y })), moves: d.moves, face: d.face });
    if (d.undo.length > 60) d.undo.shift();
  }
  function sokMove(d, dx, dy) {
    if (A.done) return;
    d.face = dx < 0 ? -1 : dx > 0 ? 1 : d.face;
    const nx = d.player.x + dx, ny = d.player.y + dy;
    if (d.walls.has(sokKey(nx, ny))) { sfx('clank'); return; }
    const bi = sokBoxAt(d, nx, ny);
    if (bi >= 0) {
      const bx = nx + dx, by = ny + dy;
      if (d.walls.has(sokKey(bx, by)) || sokBoxAt(d, bx, by) >= 0) { sfx('clank'); return; }
      sokSnapshot(d);
      d.boxes[bi].x = bx; d.boxes[bi].y = by;
      d.player.x = nx; d.player.y = ny; d.moves++;
      sfx('land');
    } else {
      sokSnapshot(d);
      d.player.x = nx; d.player.y = ny; d.moves++;
      sfx('select');
    }
    if (d.boxes.every(b => d.targets.has(sokKey(b.x, b.y)))) {
      game.coins = d.moves <= A.st.parMoves ? 1 : 0;
      A.status = '双箱归位 · ' + d.moves + ' 步';
      win();
    }
  }
  function sokUndo(d) {
    const s = d.undo.pop();
    if (!s) return;
    d.player.x = s.px; d.player.y = s.py; d.face = s.face;
    d.boxes = s.boxes.map(b => ({ x: b.x, y: b.y }));
    d.moves = s.moves;
    sfx('switch');
  }
  function sokDead(d) {
    for (const b of d.boxes) {
      if (d.targets.has(sokKey(b.x, b.y))) continue;
      const up = d.walls.has(sokKey(b.x, b.y - 1)), dn = d.walls.has(sokKey(b.x, b.y + 1));
      const lf = d.walls.has(sokKey(b.x - 1, b.y)), rt = d.walls.has(sokKey(b.x + 1, b.y));
      if ((up || dn) && (lf || rt)) return true;
    }
    return false;
  }
  UPDATE.sokoban = function (dt, inp) {
    const d = A.data;
    d.cd = Math.max(0, d.cd - dt);
    let dx = 0, dy = 0;
    if (inp.upHit) dy = -1; else if (inp.downHit) dy = 1;
    else if (inp.leftHit) dx = -1; else if (inp.rightHit) dx = 1;
    else if (d.cd <= 0) {
      if (inp.up) dy = -1; else if (inp.down) dy = 1;
      else if (inp.left) dx = -1; else if (inp.right) dx = 1;
    }
    if (dx || dy) { sokMove(d, dx, dy); d.cd = 0.17; }
    if (inp.dashHit) sokUndo(d);
    const on = d.boxes.filter(b => d.targets.has(sokKey(b.x, b.y))).length;
    A.status = '归位 ' + on + '/' + d.boxes.length + '　步数 ' + d.moves + ' · 目标 ≤ ' + A.st.parMoves;
    if (sokDead(d)) A.status += '　死局？K 撤销';
  };
  RENDER.sokoban = function () {
    const d = A.data;
    const cs = d.cell;
    panel(d.bx - 8, d.by - 8, d.bw + 16, d.bh + 16, 0.92);
    for (let y = 0; y < d.rows; y++) for (let x = 0; x < d.cols; x++) {
      const px0 = d.bx + x * cs, py0 = d.by + y * cs;
      if (d.walls.has(sokKey(x, y))) {
        ax.fillStyle = '#343c58'; ax.fillRect(px0, py0, cs, cs);
        ax.fillStyle = '#525e82'; ax.fillRect(px0, py0, cs, 3); ax.fillRect(px0, py0, 3, cs);
        ax.fillStyle = '#1c2236'; ax.fillRect(px0 + 3, py0 + cs - 3, cs - 3, 3);
        ax.fillStyle = 'rgba(120,140,190,0.18)'; ax.fillRect(px0 + 4, py0 + 4, cs - 8, 2);
      } else {
        ax.fillStyle = ((x + y) & 1) ? '#141c30' : '#182238';
        ax.fillRect(px0, py0, cs, cs);
        ax.fillStyle = 'rgba(120,140,180,0.10)'; ax.fillRect(px0, py0, cs, 1);
        if (d.targets.has(sokKey(x, y))) {
          const cx = px0 + cs / 2, cy = py0 + cs / 2;
          ax.strokeStyle = '#f8d048'; ax.lineWidth = 1;
          ax.beginPath(); ax.arc(cx, cy, cs * 0.22, 0, TAU); ax.stroke();
          ax.fillStyle = 'rgba(248,208,72,0.22)';
          ax.beginPath(); ax.arc(cx, cy, cs * 0.13, 0, TAU); ax.fill();
        }
      }
    }
    for (const b of d.boxes) {
      const x = d.bx + b.x * cs, y = d.by + b.y * cs;
      const on = d.targets.has(sokKey(b.x, b.y));
      ax.fillStyle = on ? '#6a5428' : '#8a5428';
      ax.fillRect(x + 3, y + 3, cs - 6, cs - 6);
      ax.strokeStyle = on ? '#f8d048' : '#e8b060'; ax.lineWidth = 2;
      ax.strokeRect(x + 3.5, y + 3.5, cs - 7, cs - 7);
      ax.strokeStyle = on ? 'rgba(255,248,200,0.9)' : 'rgba(60,30,10,0.8)'; ax.lineWidth = 1;
      ax.beginPath(); ax.moveTo(x + 6, y + 6); ax.lineTo(x + cs - 6, y + cs - 6);
      ax.moveTo(x + cs - 6, y + 6); ax.lineTo(x + 6, y + cs - 6); ax.stroke();
      if (on) { ax.fillStyle = 'rgba(248,208,72,0.18)'; ax.fillRect(x + 1, y + 1, cs - 2, cs - 2); }
    }
    const pxx = d.bx + d.player.x * cs, pyy = d.by + d.player.y * cs;
    ax.fillStyle = '#2858a8'; ax.fillRect(pxx + cs * 0.22, pyy + cs * 0.34, cs * 0.56, cs * 0.48);
    ax.fillStyle = '#48c8f8'; ax.fillRect(pxx + cs * 0.26, pyy + cs * 0.14, cs * 0.48, cs * 0.34);
    ax.fillStyle = '#e8f4ff'; ax.fillRect(pxx + cs * 0.30, pyy + cs * 0.20, cs * 0.16, cs * 0.10);
    ax.fillRect(pxx + cs * 0.54, pyy + cs * 0.20, cs * 0.16, cs * 0.10);
    ax.fillStyle = '#182850'; ax.fillRect(pxx + cs * 0.38, pyy + cs * 0.34, cs * 0.10, cs * 0.12);
    ax.fillRect(pxx + cs * 0.52, pyy + cs * 0.34, cs * 0.10, cs * 0.12);
    ax.fillStyle = '#f8d048';
    ax.fillRect(pxx + (d.face < 0 ? cs * 0.18 : cs * 0.70), pyy + cs * 0.26, cs * 0.12, cs * 0.08);
  };

  /* ============================================================
     6) 贪吃蛇
     ============================================================ */
  function snakeFood(d) {
    for (let i = 0; i < 300; i++) {
      const x = (Math.random() * d.cols) | 0, y = (Math.random() * d.rows) | 0;
      if (d.walls.has(x + ',' + y)) continue;
      if (d.snake.some(s => s.x === x && s.y === y)) continue;
      d.food = { x: x, y: y }; return;
    }
    d.food = { x: 0, y: 0 };
  }
  function snakeReset(d) {
    const cx = (d.cols / 2) | 0, cy = (d.rows / 2) | 0;
    d.snake = [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }];
    d.dir = { x: 1, y: 0 }; d.next = null; d.acc = 0;
  }
  INIT.snake = function (st, d) {
    d.cols = st.cols; d.rows = st.rows; d.cell = 14;
    d.bw = d.cols * d.cell; d.bh = d.rows * d.cell;
    d.bx = Math.round((W - d.bw) / 2);
    d.by = 36 + Math.round((150 - d.bh) / 2);
    d.walls = new Set();
    for (const w of (st.walls || [])) d.walls.add(w[0] + ',' + w[1]);
    d.eaten = 0; d.acc = 0; d.dir = { x: 1, y: 0 }; d.next = null;
    d.snake = [{ x: (d.cols / 2) | 0, y: (d.rows / 2) | 0 }];
    d.snake.push({ x: d.snake[0].x - 1, y: d.snake[0].y }, { x: d.snake[0].x - 2, y: d.snake[0].y });
    snakeFood(d);
  };
  function snakeStep(d) {
    if (d.next && !(d.next.x === -d.dir.x && d.next.y === -d.dir.y)) d.dir = d.next;
    d.next = null;
    const head = { x: d.snake[0].x + d.dir.x, y: d.snake[0].y + d.dir.y };
    if (head.x < 0 || head.x >= d.cols || head.y < 0 || head.y >= d.rows || d.walls.has(head.x + ',' + head.y)) {
      addFloat('撞墙 -1 心', '#f85868', W / 2, 120);
      snakeReset(d); loseHeart();
      if (!A.done) snakeFood(d);
      return;
    }
    const eat = d.food && head.x === d.food.x && head.y === d.food.y;
    const body = eat ? d.snake : d.snake.slice(0, d.snake.length - 1);
    if (body.some(s => s.x === head.x && s.y === head.y)) {
      addFloat('咬到自己 -1 心', '#f85868', W / 2, 120);
      snakeReset(d); loseHeart();
      if (!A.done) snakeFood(d);
      return;
    }
    d.snake.unshift(head);
    if (eat) {
      d.eaten++; sfx('coin');
      addFloat('+1', '#f8d048', d.bx + head.x * d.cell + 7, d.by + head.y * d.cell - 4);
      if (d.eaten >= A.st.target) {
        game.coins = game.deaths === 0 ? 1 : 0;
        A.status = '灵果 ' + d.eaten + '/' + A.st.target;
        win(); return;
      }
      snakeFood(d);
    } else d.snake.pop();
  }
  UPDATE.snake = function (dt, inp) {
    const d = A.data;
    if (inp.up && d.dir.y === 0) d.next = { x: 0, y: -1 };
    else if (inp.down && d.dir.y === 0) d.next = { x: 0, y: 1 };
    else if (inp.left && d.dir.x === 0) d.next = { x: -1, y: 0 };
    else if (inp.right && d.dir.x === 0) d.next = { x: 1, y: 0 };
    d.acc += dt;
    const stp = A.st.speed;
    while (d.acc >= stp) {
      d.acc -= stp; snakeStep(d);
      if (A.done) break;
    }
    A.status = '灵果 ' + d.eaten + '/' + A.st.target + '　长度 ' + d.snake.length;
  };
  RENDER.snake = function () {
    const d = A.data;
    const cs = d.cell;
    panel(d.bx - 8, d.by - 8, d.bw + 16, d.bh + 16, 0.92);
    for (let y = 0; y < d.rows; y++) for (let x = 0; x < d.cols; x++) {
      ax.fillStyle = ((x + y) & 1) ? '#101828' : '#141e32';
      ax.fillRect(d.bx + x * cs, d.by + y * cs, cs, cs);
    }
    for (const w of d.walls) {
      const p = w.split(','), x = +p[0], y = +p[1];
      ax.fillStyle = '#5a3a2a'; ax.fillRect(d.bx + x * cs + 1, d.by + y * cs + 1, cs - 2, cs - 2);
      ax.fillStyle = '#f87838'; ax.fillRect(d.bx + x * cs + 3, d.by + y * cs + 3, cs - 6, 2);
    }
    if (d.food) {
      const fx = d.bx + d.food.x * cs + cs / 2, fy = d.by + d.food.y * cs + cs / 2;
      const pulse = 0.85 + 0.15 * Math.sin(A.t * 8);
      ax.globalAlpha = 0.25; ax.fillStyle = '#f8d048';
      ax.beginPath(); ax.arc(fx, fy, cs * 0.70 * pulse, 0, TAU); ax.fill();
      ax.globalAlpha = 1;
      ax.fillStyle = '#f8d048'; ax.beginPath(); ax.arc(fx, fy, cs * 0.32, 0, TAU); ax.fill();
      ax.fillStyle = '#fff8c8'; ax.fillRect(fx - 2, fy - 3, 2, 2);
    }
    for (let i = d.snake.length - 1; i >= 0; i--) {
      const s = d.snake[i];
      const x = d.bx + s.x * cs, y = d.by + s.y * cs;
      ax.fillStyle = i === 0 ? '#8af8b0' : (i % 2 ? '#38c878' : '#2aa868');
      ax.fillRect(x + 1, y + 1, cs - 2, cs - 2);
      ax.fillStyle = i === 0 ? '#d8ffe8' : 'rgba(200,255,220,0.20)';
      ax.fillRect(x + 2, y + 2, cs - 4, 2);
      if (i === 0) {
        ax.fillStyle = '#102818';
        const ex = d.dir.x, ey = d.dir.y;
        if (ex) {
          ax.fillRect(x + (ex > 0 ? cs - 5 : 2), y + 3, 2, 2);
          ax.fillRect(x + (ex > 0 ? cs - 5 : 2), y + cs - 5, 2, 2);
        } else {
          ax.fillRect(x + 3, y + (ey > 0 ? cs - 5 : 2), 2, 2);
          ax.fillRect(x + cs - 5, y + (ey > 0 ? cs - 5 : 2), 2, 2);
        }
      }
    }
  };

  /* ============================================================
     7) 编钟（Simon）
     ============================================================ */
  const BELL_FREQ = [523, 587, 659, 784, 880];
  const BELL_NAME = ['宫', '商', '角', '徵', '羽'];
  function simonBellRect(d, i) {
    return { x: 36 + i * 66, y: 84, w: 48, h: 70 };
  }
  INIT.simon = function (st, d) {
    d.bells = st.bells; d.rounds = st.rounds;
    d.seq = [];
    let last = -1;
    for (let i = 0; i < st.rounds + 2; i++) {
      let v = (Math.random() * st.bells) | 0;
      if (v === last) v = (v + 1 + ((Math.random() * (st.bells - 1)) | 0)) % st.bells;
      d.seq.push(v); last = v;
    }
    d.round = 0; d.phase = 'wait'; d.waitT = 0.8; d.showIdx = 0; d.showT = 0;
    d.inputIdx = 0; d.cursor = 2; d.flash = new Array(st.bells).fill(0);
    d.msg = '准备聆听…'; d.mistakes = 0;
  };
  function simonShow(d) {
    d.phase = 'show'; d.showIdx = 0; d.showT = 0.55; d.msg = '聆听钟声…';
  }
  function simonInput(d, bell) {
    if (d.phase !== 'input' || A.done) return;
    d.flash[bell] = 0.3; tone(BELL_FREQ[bell], 0.2);
    if (bell === d.seq[d.inputIdx]) {
      d.inputIdx++;
      if (d.inputIdx >= 2 + d.round) {
        d.round++;
        if (d.round >= d.rounds) {
          game.coins = A.hearts === 3 ? 1 : 0;
          game.deaths = 3 - A.hearts;
          A.status = '五轮全对';
          win();
        } else {
          d.phase = 'wait'; d.waitT = 0.9; d.msg = '正确！下一轮…';
        }
      }
    } else {
      d.mistakes++; A.hearts--; game.deaths = Math.min(3, game.deaths + 1);
      A.shake = 4; sfx('hurt'); d.msg = '敲错了…再听一遍';
      if (A.hearts <= 0) { fail('编钟错音'); return; }
      d.phase = 'wait'; d.waitT = 1.15;
    }
  }
  UPDATE.simon = function (dt, inp) {
    const d = A.data;
    for (let i = 0; i < d.flash.length; i++) d.flash[i] = Math.max(0, d.flash[i] - dt);
    if (d.phase === 'wait') {
      d.waitT -= dt;
      if (d.waitT <= 0) simonShow(d);
    } else if (d.phase === 'show') {
      d.showT -= dt;
      if (d.showT <= 0) {
        if (d.showIdx < 2 + d.round) {
          const b = d.seq[d.showIdx];
          d.flash[b] = 0.34; tone(BELL_FREQ[b], 0.22);
          d.showIdx++; d.showT = 0.62;
        } else { d.phase = 'input'; d.inputIdx = 0; d.msg = '按顺序敲响'; }
      }
    } else if (d.phase === 'input') {
      if (inp.leftHit) d.cursor = (d.cursor + d.bells - 1) % d.bells;
      if (inp.rightHit) d.cursor = (d.cursor + 1) % d.bells;
      for (let i = 0; i < d.bells; i++) {
        const r = simonBellRect(d, i);
        if (inp.mx >= r.x && inp.mx <= r.x + r.w && inp.my >= r.y && inp.my <= r.y + r.h) {
          d.cursor = i;
          if (inp.click) simonInput(d, i);
          break;
        }
      }
      if (inp.attackHit || inp.confirmHit) simonInput(d, d.cursor);
    }
    A.status = '第 ' + Math.min(d.round + 1, d.rounds) + '/' + d.rounds + ' 轮　错音 ' + d.mistakes;
  };
  RENDER.simon = function () {
    const d = A.data;
    const y0 = 44;
    txt(d.msg, W / 2, y0, 11, d.phase === 'input' ? '#8af8b0' : '#f8d048', 'center');
    // 轮次圆点
    for (let i = 0; i < d.rounds; i++) {
      ax.fillStyle = i < d.round ? '#f8d048' : '#3a4468';
      ax.beginPath(); ax.arc(W / 2 - (d.rounds - 1) * 7 + i * 14, 62, 3, 0, TAU); ax.fill();
    }
    // 编钟架
    ax.fillStyle = '#6a3c20'; ax.fillRect(20, 74, W - 40, 5);
    ax.fillStyle = '#8a542c'; ax.fillRect(20, 74, W - 40, 2);
    for (let i = 0; i < d.bells; i++) {
      const r = simonBellRect(d, i);
      const cx = r.x + r.w / 2;
      const on = d.flash[i] > 0;
      const sel = i === d.cursor && d.phase === 'input';
      // 吊绳
      ax.strokeStyle = '#8a94b0'; ax.lineWidth = 1;
      ax.beginPath(); ax.moveTo(cx, 79); ax.lineTo(cx, r.y + 2); ax.stroke();
      // 钟体
      ax.fillStyle = on ? '#ffe890' : '#b07a38';
      ax.beginPath();
      ax.moveTo(r.x + 9, r.y + 12);
      ax.quadraticCurveTo(r.x + 4, r.y + 30, r.x + 2, r.y + 52);
      ax.lineTo(r.x + r.w - 2, r.y + 52);
      ax.quadraticCurveTo(r.x + r.w - 4, r.y + 30, r.x + r.w - 9, r.y + 12);
      ax.quadraticCurveTo(cx, r.y - 2, r.x + 9, r.y + 12);
      ax.closePath(); ax.fill();
      ax.strokeStyle = on ? '#fff8c8' : '#6a4018'; ax.lineWidth = 1; ax.stroke();
      ax.fillStyle = on ? '#fff8c8' : '#d8a050';
      ax.fillRect(r.x + 4, r.y + 50, r.w - 8, 4);
      ax.fillStyle = on ? '#fff8c8' : '#805020';
      ax.font = 'bold 13px "Microsoft YaHei","PingFang SC",sans-serif';
      ax.textAlign = 'center'; ax.textBaseline = 'middle';
      ax.fillText(BELL_NAME[i], cx, r.y + 34);
      ax.fillStyle = on ? '#f8d048' : '#5a4020';
      ax.beginPath(); ax.arc(cx, r.y + 60, 3, 0, TAU); ax.fill();
      if (sel) {
        ax.strokeStyle = '#fff8c8'; ax.lineWidth = 2;
        ax.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
        ax.fillStyle = '#f8d048';
        const bob = Math.sin(A.t * 7) * 2;
        ax.beginPath(); ax.moveTo(cx, r.y - 12 + bob); ax.lineTo(cx - 4, r.y - 19 + bob);
        ax.lineTo(cx + 4, r.y - 19 + bob); ax.closePath(); ax.fill();
      }
    }
    if (d.phase === 'input') {
      const prog = Math.min(d.inputIdx, 2 + d.round);
      pix(prog + ' / ' + (2 + d.round), W / 2, 188, 1, '#a8b4d8', 'center');
    }
  };

  /* ============================================================
     8) 打砖块
     ============================================================ */
  INIT.breakout = function (st, d) {
    d.cols = st.cols; d.rows = st.rows;
    d.gap = 3;
    d.brickW = Math.floor((W - 40 - (d.cols - 1) * d.gap) / d.cols);
    d.brickH = 12;
    d.left = Math.round((W - (d.cols * d.brickW + (d.cols - 1) * d.gap)) / 2);
    d.top = 42;
    d.bricks = [];
    for (let r = 0; r < d.rows; r++) for (let c = 0; c < d.cols; c++) {
      let hp = r === 0 ? 2 : 1;
      if (r === 2 && c === (d.cols / 2 | 0)) hp = 3;
      d.bricks.push({
        x: d.left + c * (d.brickW + d.gap), y: d.top + r * (d.brickH + d.gap),
        w: d.brickW, h: d.brickH, hp: hp, max: hp, row: r, core: r === 2 && c === (d.cols / 2 | 0)
      });
    }
    d.paddle = { x: W / 2 - 26, y: 193, w: 52, h: 7 };
    d.ball = { x: W / 2, y: 185, vx: 0, vy: 0, r: 3, stuck: true };
    d.speed = 158; d.trail = []; d.bump = 0;
  };
  function breakoutResetBall(d) {
    d.ball.stuck = true; d.ball.vx = 0; d.ball.vy = 0;
    d.ball.x = d.paddle.x + d.paddle.w / 2;
    d.ball.y = d.paddle.y - 8;
    d.trail.length = 0;
  }
  function breakoutHitBrick(d, b, prevX, prevY) {
    const ball = d.ball;
    if (ball.x + ball.r < b.x || ball.x - ball.r > b.x + b.w || ball.y + ball.r < b.y || ball.y - ball.r > b.y + b.h) return false;
    if (prevY + ball.r <= b.y || ball.y < prevY) ball.vy = -Math.abs(ball.vy);
    else if (prevY - ball.r >= b.y + b.h) ball.vy = Math.abs(ball.vy);
    else if (prevX + ball.r <= b.x) ball.vx = -Math.abs(ball.vx);
    else if (prevX - ball.r >= b.x + b.w) ball.vx = Math.abs(ball.vx);
    else ball.vy = -ball.vy;
    b.hp--; sfx('hit'); d.bump = 0.12;
    addFloat(b.core ? '赤核裂开' : '碎', b.core ? '#f85868' : '#f8d048', b.x + b.w / 2, b.y);
    if (b.hp <= 0) {
      b.dead = true;
      d.speed = Math.min(242, d.speed + 1.7);
      const sp = Math.hypot(ball.vx, ball.vy) || 1;
      ball.vx = ball.vx / sp * d.speed; ball.vy = ball.vy / sp * d.speed;
    }
    return true;
  }
  function breakoutBounceWalls(d) {
    const ball = d.ball;
    if (ball.x - ball.r < 8) { ball.x = 8 + ball.r; ball.vx = Math.abs(ball.vx); sfx('clank'); }
    if (ball.x + ball.r > W - 8) { ball.x = W - 8 - ball.r; ball.vx = -Math.abs(ball.vx); sfx('clank'); }
    if (ball.y - ball.r < 36) { ball.y = 36 + ball.r; ball.vy = Math.abs(ball.vy); sfx('clank'); }
  }
  UPDATE.breakout = function (dt, inp) {
    const d = A.data;
    d.bump = Math.max(0, d.bump - dt);
    if (inp.mx >= 0) d.paddle.x = clamp(inp.mx - d.paddle.w / 2, 8, W - 8 - d.paddle.w);
    else {
      if (inp.left) d.paddle.x -= 220 * dt;
      if (inp.right) d.paddle.x += 220 * dt;
      d.paddle.x = clamp(d.paddle.x, 8, W - 8 - d.paddle.w);
    }
    const ball = d.ball;
    if (ball.stuck) {
      ball.x = d.paddle.x + d.paddle.w / 2;
      ball.y = d.paddle.y - 8;
      if (inp.attackHit || inp.confirmHit || inp.click) {
        ball.stuck = false;
        ball.vx = (Math.random() * 2 - 1) * 74;
        ball.vy = -Math.sqrt(Math.max(40, d.speed * d.speed - ball.vx * ball.vx));
        sfx('shot');
      }
    } else {
      let rem = dt;
      while (rem > 0) {
        const h = Math.min(0.004, rem); rem -= h;
        const prevX = ball.x, prevY = ball.y;
        ball.x += ball.vx * h; ball.y += ball.vy * h;
        breakoutBounceWalls(d);
        if (ball.vy > 0 && ball.y + ball.r >= d.paddle.y && ball.y - ball.r <= d.paddle.y + d.paddle.h &&
            ball.x >= d.paddle.x - ball.r && ball.x <= d.paddle.x + d.paddle.w + ball.r) {
          ball.y = d.paddle.y - ball.r;
          const rel = clamp((ball.x - (d.paddle.x + d.paddle.w / 2)) / (d.paddle.w / 2), -1, 1);
          const ang = -Math.PI / 2 + rel * 1.02;
          ball.vx = Math.cos(ang) * d.speed;
          ball.vy = Math.sin(ang) * d.speed;
          sfx('clank'); d.bump = 0.16;
        }
        for (const b of d.bricks) {
          if (b.dead) continue;
          if (breakoutHitBrick(d, b, prevX, prevY)) break;
        }
        if (ball.y - ball.r > 205) break;
      }
      d.trail.push({ x: ball.x, y: ball.y, t: 0 });
      for (let i = d.trail.length - 1; i >= 0; i--) { d.trail[i].t += dt; if (d.trail[i].t > 0.22) d.trail.splice(i, 1); }
      if (ball.y - ball.r > 205) {
        A.hearts--; game.deaths = Math.min(3, game.deaths + 1);
        A.shake = 6; sfx('die');
        addFloat('球落 -1 心', '#f85868', W / 2, 150);
        if (A.hearts <= 0) { fail('三球落空'); return; }
        breakoutResetBall(d);
      }
      if (d.bricks.every(b => b.dead)) {
        game.coins = game.deaths === 0 ? 1 : 0;
        A.status = '封印墙已碎';
        win();
      }
    }
    const left = d.bricks.filter(b => !b.dead).length;
    A.status = '砖块 ' + left + '/' + d.bricks.length + '　球速 ' + Math.round(d.speed);
  };
  RENDER.breakout = function () {
    const d = A.data;
    panel(6, 34, W - 12, 168, 0.86);
    // 砖块
    const rowCol = ['#b04858', '#a04888', '#5868c8', '#3c88a8', '#3c9868'];
    for (const b of d.bricks) {
      if (b.dead) continue;
      const flash = d.bump > 0 && b.hp < b.max;
      ax.fillStyle = b.core ? (b.hp > 1 ? '#d83048' : '#802030') : (rowCol[b.row] || '#5868c8');
      ax.fillRect(b.x, b.y, b.w, b.h);
      ax.fillStyle = 'rgba(255,255,255,0.28)'; ax.fillRect(b.x, b.y, b.w, 2);
      ax.fillStyle = 'rgba(0,0,0,0.28)'; ax.fillRect(b.x, b.y + b.h - 2, b.w, 2);
      if (b.core) {
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        ax.fillStyle = '#ffe890'; ax.beginPath(); ax.ellipse(cx, cy, 5, 3, 0, 0, TAU); ax.fill();
        ax.fillStyle = '#301018'; ax.fillRect(cx - 1, cy - 2, 2, 4);
      } else if (b.hp < b.max) {
        ax.strokeStyle = 'rgba(16,10,20,0.75)'; ax.lineWidth = 1;
        ax.beginPath(); ax.moveTo(b.x + 4, b.y + 2); ax.lineTo(b.x + 9, b.y + b.h - 3);
        ax.moveTo(b.x + b.w - 6, b.y + 2); ax.lineTo(b.x + b.w - 11, b.y + b.h - 3); ax.stroke();
      }
      if (flash) { ax.strokeStyle = '#ffffff'; ax.lineWidth = 1; ax.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1); }
    }
    // 球与拖尾
    for (const t of d.trail) {
      ax.globalAlpha = clamp(1 - t.t / 0.22, 0, 1) * 0.4;
      ax.fillStyle = '#8ae8f8'; ax.fillRect(t.x - 2, t.y - 2, 4, 4);
    }
    ax.globalAlpha = 1;
    const bx = d.ball.x, by = d.ball.y;
    ax.globalAlpha = 0.25; ax.fillStyle = '#8ae8f8';
    ax.beginPath(); ax.arc(bx, by, 8, 0, TAU); ax.fill();
    ax.globalAlpha = 1;
    ax.fillStyle = '#f0fbff'; ax.beginPath(); ax.arc(bx, by, d.ball.r, 0, TAU); ax.fill();
    ax.fillStyle = '#ffffff'; ax.fillRect(bx - 1, by - 2, 1, 1);
    // 挡板
    const p = d.paddle;
    ax.fillStyle = '#2c3a62'; ax.fillRect(p.x, p.y, p.w, p.h);
    ax.fillStyle = '#8ab0e8'; ax.fillRect(p.x, p.y, p.w, 2);
    ax.fillStyle = '#f8d048'; ax.fillRect(p.x + 3, p.y + 2, p.w - 6, 1);
    ax.fillStyle = '#182038'; ax.fillRect(p.x, p.y + p.h - 2, p.w, 2);
    if (d.ball.stuck) {
      txt('J / 空格 发射', W / 2, 172, 10, '#f8d048', 'center');
      ax.strokeStyle = 'rgba(248,208,72,0.45)'; ax.lineWidth = 1;
      ax.beginPath(); ax.moveTo(p.x + p.w / 2, p.y - 4); ax.lineTo(p.x + p.w / 2, 130); ax.stroke();
    }
  };

  /* ============================================================
     9) 矿脉寻宝（黄金矿工式）
     ============================================================ */
  INIT.gold = function (st, d) {
    d.ax = W / 2; d.ay = 52;
    d.angle = 0; d.dir = 1; d.swing = 1.45;
    d.len = 12; d.maxLen = 152;
    d.state = 'swing'; d.hold = null; d.pull = 0;
    d.quota = st.quota; d.got = 0; d.em = 0; d.emTotal = st.emeralds;
    d.gems = []; d.spark = 0;
    function put(kind) {
      for (let t = 0; t < 120; t++) {
        const r = kind === 'rock' ? 11 : 8;
        const x = 20 + Math.random() * (W - 40);
        const y = 112 + Math.random() * 78;
        if (d.gems.some(g => Math.hypot(g.x - x, g.y - y) < 26)) continue;
        d.gems.push({
          x: x, y: y, kind: kind, r: r,
          w: kind === 'rock' ? 2.5 : kind === 'emerald' ? 1.15 : 1, taken: false
        });
        return;
      }
    }
    for (let i = 0; i < st.emeralds; i++) put('emerald');
    for (let i = 0; i < st.rocks; i++) put('rock');
    for (let i = 0; i < 8; i++) put('gem');
  };
  function goldTip(d) {
    return { x: d.ax + Math.sin(d.angle) * d.len, y: d.ay + Math.cos(d.angle) * d.len };
  }
  function goldCollect(d, g, px, py) {
    if (g.kind === 'emerald') {
      d.em++; game.coins = Math.min(A.st.totalCoin, game.coins + 1);
      addFloat('翡翠 +1', '#68f8a8', px, py);
      sfx('gem');
    } else if (g.kind === 'rock') {
      addFloat('石头…', '#8a94b0', px, py);
      sfx('clank');
    } else {
      addFloat('宝石 +1', '#8ae8f8', px, py);
      sfx('coin');
    }
    if (g.kind !== 'rock') {
      d.got++;
      if (d.got >= d.quota) {
        A.status = '宝石 ' + d.got + '/' + d.quota + '　翡翠 ' + d.em;
        win();
      }
    }
  }
  UPDATE.gold = function (dt, inp) {
    const d = A.data;
    d.spark = Math.max(0, d.spark - dt);
    if (d.state === 'swing') {
      d.angle += d.dir * d.swing * dt;
      if (d.angle > 1.15) { d.angle = 1.15; d.dir = -1; }
      if (d.angle < -1.15) { d.angle = -1.15; d.dir = 1; }
      if (inp.attackHit || inp.confirmHit || inp.click) { d.state = 'extend'; sfx('shot'); }
    } else if (d.state === 'extend') {
      d.len += 250 * dt;
      const tip = goldTip(d);
      for (const g of d.gems) {
        if (g.taken) continue;
        if (Math.hypot(g.x - tip.x, g.y - tip.y) < g.r + 7) {
          g.taken = true; d.hold = g; d.state = 'pull';
          d.pull = 230 / g.w; d.spark = 0.2; sfx('clank'); break;
        }
      }
      if (d.state === 'extend' && d.len >= d.maxLen) { d.state = 'pull'; d.pull = 420; }
    } else if (d.state === 'pull') {
      d.len -= d.pull * dt;
      if (d.len <= 14) {
        d.len = 12;
        if (d.hold) {
          const g = d.hold, tip = goldTip(d);
          d.hold = null;
          goldCollect(d, g, tip.x, tip.y);
        }
        if (!A.done) d.state = 'swing';
      }
    }
    A.status = '宝石 ' + d.got + '/' + d.quota + '　翡翠 ' + d.em + '/' + d.emTotal;
  };
  RENDER.gold = function () {
    const d = A.data;
    panel(6, 34, W - 12, 168, 0.9);
    ax.fillStyle = '#20263c'; ax.fillRect(6, 34, W - 12, 18);
    for (let i = 0; i < 20; i++) {
      const x = 10 + (i * 37) % (W - 20);
      ax.fillStyle = i % 3 ? '#2c3350' : '#38405e';
      ax.fillRect(x, 36 + (i * 13) % 12, 8, 2);
    }
    for (const g of d.gems) {
      if (g.taken) continue;
      const pulse = 1 + 0.08 * Math.sin(A.t * 4 + g.x);
      if (g.kind === 'rock') {
        ax.fillStyle = '#343c54'; ax.beginPath();
        ax.ellipse(g.x, g.y, g.r * 1.25, g.r, 0.2, 0, TAU); ax.fill();
        ax.fillStyle = '#59627e'; ax.fillRect(g.x - g.r * 0.5, g.y - g.r * 0.6, g.r, 2);
      } else {
        const col = g.kind === 'emerald' ? '#58f0a0' : '#78d8f8';
        const dark = g.kind === 'emerald' ? '#1e8a58' : '#2878a0';
        ax.globalAlpha = 0.16; ax.fillStyle = col;
        ax.beginPath(); ax.arc(g.x, g.y, g.r * 1.7 * pulse, 0, TAU); ax.fill();
        ax.globalAlpha = 1;
        ax.fillStyle = dark; ax.beginPath();
        ax.moveTo(g.x, g.y - g.r * 1.3); ax.lineTo(g.x + g.r, g.y);
        ax.lineTo(g.x, g.y + g.r * 1.1); ax.lineTo(g.x - g.r, g.y); ax.closePath(); ax.fill();
        ax.fillStyle = col; ax.beginPath();
        ax.moveTo(g.x, g.y - g.r * 0.95); ax.lineTo(g.x + g.r * 0.62, g.y);
        ax.lineTo(g.x, g.y + g.r * 0.7); ax.lineTo(g.x - g.r * 0.62, g.y); ax.closePath(); ax.fill();
        ax.fillStyle = '#eaffff'; ax.fillRect(g.x - 2, g.y - 4, 2, 2);
      }
    }
    // 矿工 + 吊臂
    const mx = d.ax, my = d.ay;
    ax.fillStyle = '#4a5a7c'; ax.fillRect(mx - 7, my - 4, 14, 10);
    ax.fillStyle = '#f0c890'; ax.fillRect(mx - 5, my - 10, 10, 8);
    ax.fillStyle = '#f8d048'; ax.fillRect(mx - 8, my - 13, 16, 4);
    ax.fillStyle = '#a86a20'; ax.fillRect(mx - 8, my - 9, 16, 2);
    ax.fillStyle = '#202838'; ax.fillRect(mx - 3, my - 7, 2, 2); ax.fillRect(mx + 2, my - 7, 2, 2);
    const tip = goldTip(d);
    ax.strokeStyle = '#d8c890'; ax.lineWidth = 1;
    ax.beginPath(); ax.moveTo(mx, my + 4); ax.lineTo(tip.x, tip.y); ax.stroke();
    ax.fillStyle = '#a8b4d8';
    ax.save(); ax.translate(tip.x, tip.y); ax.rotate(-d.angle);
    ax.beginPath();
    ax.moveTo(0, -4); ax.lineTo(-6, 6); ax.lineTo(-2, 4);
    ax.lineTo(0, 9); ax.lineTo(2, 4); ax.lineTo(6, 6); ax.closePath(); ax.fill();
    ax.restore();
    if (d.hold) {
      const col = d.hold.kind === 'emerald' ? '#58f0a0' : d.hold.kind === 'rock' ? '#4a5470' : '#78d8f8';
      ax.fillStyle = col; ax.beginPath(); ax.arc(tip.x, tip.y + 6, d.hold.r, 0, TAU); ax.fill();
    }
    if (d.spark > 0) {
      ax.strokeStyle = 'rgba(255,248,200,' + (d.spark / 0.2).toFixed(2) + ')';
      ax.lineWidth = 2; ax.beginPath(); ax.arc(tip.x, tip.y, 12, 0, TAU); ax.stroke();
    }
    txt(d.state === 'swing' ? '看准了再放钩' : d.state === 'pull' ? '回收中…' : '钩子下探…',
      W / 2, 193, 8, '#8a96b8', 'center');
  };

  /* ============================================================
     10) 落块筑墙（俄罗斯方块）
     ============================================================ */
  const TET_COL = ['#68c8f8', '#f8d048', '#b878f8', '#68e888', '#f87868', '#f8a048', '#4898f8'];
  const TET_SHAPE = [
    [[1, 1, 1, 1]],
    [[1, 1], [1, 1]],
    [[0, 1, 0], [1, 1, 1]],
    [[0, 1, 1], [1, 1, 0]],
    [[1, 1, 0], [0, 1, 1]],
    [[1, 0, 0], [1, 1, 1]],
    [[0, 0, 1], [1, 1, 1]]
  ];
  function tetCopy(m) { return m.map(r => r.slice()); }
  function tetRot(m) {
    const h = m.length, w = m[0].length, out = [];
    for (let x = 0; x < w; x++) {
      const row = [];
      for (let y = h - 1; y >= 0; y--) row.push(m[y][x]);
      out.push(row);
    }
    return out;
  }
  function tetRandom() {
    const i = (Math.random() * 7) | 0;
    return { m: tetCopy(TET_SHAPE[i]), ci: i, x: 0, y: 0 };
  }
  function tetSolid(d, m, x, y) {
    for (let r = 0; r < m.length; r++) for (let c = 0; c < m[r].length; c++) {
      if (!m[r][c]) continue;
      const bx = x + c, by = y + r;
      if (bx < 0 || bx >= d.cols || by >= d.rows) return true;
      if (by >= 0 && d.board[by * d.cols + bx] >= 0) return true;
    }
    return false;
  }
  function tetSpawn(d) {
    d.piece = d.next; d.next = tetRandom();
    d.piece.x = ((d.cols - d.piece.m[0].length) / 2) | 0;
    d.piece.y = 0; d.fallT = 0;
    if (tetSolid(d, d.piece.m, d.piece.x, d.piece.y)) {
      d.board.fill(-1); d.lockFlash = 0.5;
      addFloat('城墙塌了 -1 心', '#f85868', W / 2, 110);
      loseHeart();
    }
  }
  function tetMove(d, dx, dy) {
    const p = d.piece;
    if (!p) return false;
    if (!tetSolid(d, p.m, p.x + dx, p.y + dy)) { p.x += dx; p.y += dy; return true; }
    return false;
  }
  function tetRotate(d) {
    const p = d.piece;
    if (!p) return;
    const r = tetRot(p.m);
    for (const k of [0, -1, 1, -2, 2]) {
      if (!tetSolid(d, r, p.x + k, p.y)) { p.m = r; p.x += k; sfx('switch'); return; }
    }
  }
  function tetClearLines(d) {
    let n = 0;
    for (let r = d.rows - 1; r >= 0; r--) {
      let full = true;
      for (let c = 0; c < d.cols; c++) if (d.board[r * d.cols + c] < 0) { full = false; break; }
      if (!full) continue;
      d.board.splice(r * d.cols, d.cols);
      d.board = new Array(d.cols).fill(-1).concat(d.board);
      n++; r++;
    }
    if (!n) return;
    d.lines += n; d.lockFlash = 0.3; A.shake = Math.max(A.shake, 5);
    sfx('gem');
    addFloat('消行 +' + n, '#f8d048', W / 2, 90);
    if (d.lines >= d.quota) {
      game.coins = game.deaths === 0 ? 1 : 0;
      A.status = '城墙合拢 · 消行 ' + d.lines;
      win();
    }
  }
  function tetLock(d) {
    const p = d.piece;
    if (!p) return;
    for (let r = 0; r < p.m.length; r++) for (let c = 0; c < p.m[r].length; c++) {
      if (!p.m[r][c]) continue;
      const bx = p.x + c, by = p.y + r;
      if (by >= 0 && bx >= 0 && bx < d.cols) d.board[by * d.cols + bx] = p.ci;
    }
    sfx('land');
    tetClearLines(d);
    if (!A.done) tetSpawn(d);
  }
  INIT.tetris = function (st, d) {
    d.cols = st.cols; d.rows = st.rows; d.cell = 10;
    d.bx = Math.round((W - d.cols * d.cell) / 2); d.by = 38;
    d.board = new Array(d.cols * d.rows).fill(-1);
    d.quota = st.quota; d.lines = 0; d.fall = 0.55; d.fallT = 0;
    d.softT = 0; d.lockFlash = 0;
    d.next = tetRandom(); d.piece = null;
    tetSpawn(d);
  };
  UPDATE.tetris = function (dt, inp) {
    const d = A.data;
    d.lockFlash = Math.max(0, d.lockFlash - dt);
    if (!d.piece) return;
    if (inp.leftHit) tetMove(d, -1, 0);
    if (inp.rightHit) tetMove(d, 1, 0);
    if (inp.upHit || inp.attackHit) tetRotate(d);
    if (inp.confirmHit) {
      while (tetMove(d, 0, 1)) { }
      tetLock(d);
    } else if (inp.down) {
      d.softT -= dt;
      if (d.softT <= 0) {
        if (!tetMove(d, 0, 1)) tetLock(d);
        d.softT = 0.055;
      }
    } else {
      d.fallT += dt;
      if (d.fallT >= d.fall) {
        d.fallT = 0;
        if (!tetMove(d, 0, 1)) tetLock(d);
      }
    }
    let top = d.rows;
    for (let r = 0; r < d.rows; r++) {
      let any = false;
      for (let c = 0; c < d.cols; c++) if (d.board[r * d.cols + c] >= 0) { any = true; break; }
      if (any) { top = r; break; }
    }
    A.status = '消行 ' + d.lines + '/' + d.quota + '　堆高 ' + (d.rows - top) + '/' + d.rows;
  };
  RENDER.tetris = function () {
    const d = A.data;
    panel(6, 34, W - 12, 168, 0.86);
    const bw = d.cols * d.cell, bh = d.rows * d.cell;
    panel(d.bx - 4, d.by - 4, bw + 8, bh + 8, 0.92);
    for (let r = 0; r < d.rows; r++) for (let c = 0; c < d.cols; c++) {
      const x = d.bx + c * d.cell, y = d.by + r * d.cell;
      ax.fillStyle = ((r + c) & 1) ? '#10182a' : '#141e34';
      ax.fillRect(x, y, d.cell - 1, d.cell - 1);
      const v = d.board[r * d.cols + c];
      if (v >= 0) {
        ax.fillStyle = TET_COL[v];
        ax.fillRect(x, y, d.cell - 1, d.cell - 1);
        ax.fillStyle = 'rgba(255,255,255,0.34)'; ax.fillRect(x, y, d.cell - 1, 2);
        ax.fillStyle = 'rgba(0,0,0,0.28)'; ax.fillRect(x, y + d.cell - 3, d.cell - 1, 2);
      }
    }
    const p = d.piece;
    if (p) {
      // 落点预览
      let gy = p.y;
      while (!tetSolid(d, p.m, p.x, gy + 1)) gy++;
      for (let r = 0; r < p.m.length; r++) for (let c = 0; c < p.m[r].length; c++) {
        if (!p.m[r][c]) continue;
        const x = d.bx + (p.x + c) * d.cell, y = d.by + (gy + r) * d.cell;
        if (gy + r < d.rows) {
          ax.strokeStyle = 'rgba(248,240,200,0.35)'; ax.lineWidth = 1;
          ax.strokeRect(x + 1.5, y + 1.5, d.cell - 3, d.cell - 3);
        }
      }
      for (let r = 0; r < p.m.length; r++) for (let c = 0; c < p.m[r].length; c++) {
        if (!p.m[r][c]) continue;
        const x = d.bx + (p.x + c) * d.cell, y = d.by + (p.y + r) * d.cell;
        if (p.y + r < 0) continue;
        ax.fillStyle = TET_COL[p.ci];
        ax.fillRect(x, y, d.cell - 1, d.cell - 1);
        ax.fillStyle = 'rgba(255,255,255,0.45)'; ax.fillRect(x, y, d.cell - 1, 2);
        ax.fillStyle = 'rgba(0,0,0,0.3)'; ax.fillRect(x, y + d.cell - 3, d.cell - 1, 2);
      }
    }
    // 右侧：下一块 + 进度
    txt('下一块', W - 54, 62, 8, '#8a96b8', 'center');
    if (d.next) {
      const n = d.next, ox = W - 54 - (n.m[0].length * 7) / 2, oy = 76;
      for (let r = 0; r < n.m.length; r++) for (let c = 0; c < n.m[r].length; c++) {
        if (!n.m[r][c]) continue;
        ax.fillStyle = TET_COL[n.ci];
        ax.fillRect(ox + c * 7, oy + r * 7, 6, 6);
      }
    }
    for (let i = 0; i < d.quota; i++) {
      ax.fillStyle = i < d.lines ? '#f8d048' : '#3a4468';
      ax.beginPath(); ax.arc(W - 64 + (i % 2) * 14, 112 + ((i / 2) | 0) * 14, 4, 0, TAU); ax.fill();
    }
    txt('消行', W - 50, 160, 8, '#8a96b8', 'center');
    if (d.lockFlash > 0) {
      ax.strokeStyle = 'rgba(255,248,200,' + (d.lockFlash / 0.5).toFixed(2) + ')';
      ax.lineWidth = 2; ax.strokeRect(d.bx - 2, d.by - 2, bw + 4, bh + 4);
    }
  };

  /* ============================================================
     11) 弹幕生存
     ============================================================ */
  INIT.dodge = function (st, d) {
    d.p = { x: W / 2, y: 150 };
    d.need = st.shards; d.got = 0; d.elapsed = 0; d.survive = st.survive;
    d.bullets = []; d.picks = []; d.spawnT = 0.7; d.pickT = 1.0;
    d.inv = 0; d.trail = [];
  };
  function dodgeSpawn(d) {
    d.bullets.push({
      x: 14 + Math.random() * (W - 28), y: 38,
      vx: (Math.random() - 0.5) * 34, vy: 58 + Math.random() * 54,
      r: 2.6 + Math.random() * 2.2
    });
  }
  UPDATE.dodge = function (dt, inp) {
    const d = A.data;
    d.elapsed = Math.min(d.survive, d.elapsed + dt);
    d.inv = Math.max(0, d.inv - dt);
    const sp = 138;
    let vx = 0, vy = 0;
    if (inp.left) vx -= 1;
    if (inp.right) vx += 1;
    if (inp.up) vy -= 1;
    if (inp.down) vy += 1;
    if (vx || vy) {
      const l = Math.hypot(vx, vy);
      d.p.x += vx / l * sp * dt; d.p.y += vy / l * sp * dt;
    }
    d.p.x = clamp(d.p.x, 10, W - 10); d.p.y = clamp(d.p.y, 42, 166);
    d.trail.push({ x: d.p.x, y: d.p.y, t: 0 });
    for (let i = d.trail.length - 1; i >= 0; i--) {
      d.trail[i].t += dt; if (d.trail[i].t > 0.26) d.trail.splice(i, 1);
    }
    d.spawnT -= dt;
    if (d.spawnT <= 0) {
      dodgeSpawn(d);
      d.spawnT = Math.max(0.22, 0.56 - d.elapsed * 0.010) * (0.72 + Math.random() * 0.62);
    }
    for (let i = d.bullets.length - 1; i >= 0; i--) {
      const b = d.bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y > 206 || b.x < -12 || b.x > W + 12) { d.bullets.splice(i, 1); continue; }
      if (d.inv <= 0 && Math.hypot(b.x - d.p.x, b.y - d.p.y) < b.r + 4.5) {
        d.bullets.splice(i, 1);
        addFloat('被陨星击中 -1 心', '#f85868', d.p.x, d.p.y - 12);
        d.inv = 1.2; A.shake = 7; loseHeart();
        if (A.done) return;
        for (let j = d.bullets.length - 1; j >= 0; j--) {
          if (Math.hypot(d.bullets[j].x - d.p.x, d.bullets[j].y - d.p.y) < 38) d.bullets.splice(j, 1);
        }
      }
    }
    d.pickT -= dt;
    if (d.pickT <= 0 && d.picks.length < 3) {
      d.picks.push({ x: 24 + Math.random() * (W - 48), y: 40, vy: 36 + Math.random() * 16 });
      d.pickT = 1.5 + Math.random() * 0.8;
    }
    for (let i = d.picks.length - 1; i >= 0; i--) {
      const k = d.picks[i];
      k.y += k.vy * dt;
      if (k.y > 196) { d.picks.splice(i, 1); continue; }
      if (Math.hypot(k.x - d.p.x, k.y - d.p.y) < 13) {
        d.picks.splice(i, 1); d.got++; sfx('gem');
        addFloat('星屑 +1', '#8ae8f8', k.x, k.y);
      }
    }
    if (d.elapsed >= d.survive && d.got >= d.need) {
      game.coins = game.deaths === 0 ? 1 : 0;
      A.status = '星屑 ' + d.got + '/' + d.need + ' · 撑满 ' + d.survive + 's';
      win();
    }
    A.status = '坚持 ' + d.elapsed.toFixed(1) + '/' + d.survive + 's　星屑 ' + d.got + '/' + d.need;
  };
  RENDER.dodge = function () {
    const d = A.data;
    panel(6, 34, W - 12, 168, 0.86);
    // 生存进度
    ax.fillStyle = '#1a2440'; ax.fillRect(12, 37, W - 24, 3);
    ax.fillStyle = '#8ae8f8'; ax.fillRect(12, 37, (W - 24) * d.elapsed / d.survive, 3);
    ax.fillStyle = '#f8d048'; ax.fillRect(12 + (W - 24) - 2, 36, 2, 5);
    for (const k of d.picks) {
      const pulse = 1 + 0.2 * Math.sin(A.t * 8 + k.x);
      ax.globalAlpha = 0.2; ax.fillStyle = '#8ae8f8';
      ax.beginPath(); ax.arc(k.x, k.y, 10 * pulse, 0, TAU); ax.fill();
      ax.globalAlpha = 1;
      ax.fillStyle = '#eaffff'; ax.beginPath();
      ax.moveTo(k.x, k.y - 7); ax.lineTo(k.x + 5, k.y);
      ax.lineTo(k.x, k.y + 7); ax.lineTo(k.x - 5, k.y); ax.closePath(); ax.fill();
      ax.fillStyle = '#58c8e8'; ax.fillRect(k.x - 1, k.y - 3, 2, 2);
    }
    for (const t of d.trail) {
      ax.globalAlpha = clamp(1 - t.t / 0.26, 0, 1) * 0.30;
      ax.fillStyle = '#b8f0ff'; ax.fillRect(t.x - 2, t.y - 2, 4, 4);
    }
    ax.globalAlpha = 1;
    for (const b of d.bullets) {
      ax.globalAlpha = 0.28; ax.fillStyle = '#f87838';
      ax.beginPath(); ax.arc(b.x, b.y - 4, b.r * 1.6, 0, TAU); ax.fill();
      ax.globalAlpha = 1;
      ax.fillStyle = '#f8b048'; ax.beginPath(); ax.arc(b.x, b.y, b.r, 0, TAU); ax.fill();
      ax.fillStyle = '#f85838'; ax.beginPath(); ax.arc(b.x + b.r * 0.35, b.y + b.r * 0.2, b.r * 0.45, 0, TAU); ax.fill();
      ax.fillStyle = '#fff0c0'; ax.fillRect(b.x - 1, b.y - b.r - 1, 2, 2);
    }
    const blink = d.inv > 0 && ((A.t * 16) | 0) % 2 === 0;
    if (!blink) {
      ax.globalAlpha = 0.22; ax.fillStyle = '#8ae8f8';
      ax.beginPath(); ax.arc(d.p.x, d.p.y, 11, 0, TAU); ax.fill();
      ax.globalAlpha = 1;
      ax.fillStyle = '#d8f8ff'; ax.beginPath();
      ax.moveTo(d.p.x, d.p.y - 8); ax.lineTo(d.p.x + 7, d.p.y + 6);
      ax.lineTo(d.p.x, d.p.y + 3); ax.lineTo(d.p.x - 7, d.p.y + 6); ax.closePath(); ax.fill();
      ax.fillStyle = '#58b8d8'; ax.fillRect(d.p.x - 1, d.p.y - 3, 2, 5);
    }
    txt('躲陨星 · 收集星屑', W / 2, 193, 8, '#8a96b8', 'center');
  };

  /* ============================================================
     12) 泡泡消除
     ============================================================ */
  const BUB_COL = ['#f87898', '#58d8c8', '#f8d048', '#b878f8', '#78c8f8'];
  function bubX(d, r, c) { return d.bx + c * d.d + ((r & 1) ? d.r : 0); }
  function bubY(d, r) { return d.by + r * d.rowH; }
  function bubIdx(d, r, c) { return r * d.cols + c; }
  function bubNb(d, r, c) {
    const out = [];
    if (c > 0) out.push([r, c - 1]);
    if (c < d.cols - 1) out.push([r, c + 1]);
    const odd = r & 1;
    const cand = odd
      ? [[r - 1, c], [r - 1, c + 1], [r + 1, c], [r + 1, c + 1]]
      : [[r - 1, c - 1], [r - 1, c], [r + 1, c - 1], [r + 1, c]];
    for (const p of cand) {
      if (p[0] < 0 || p[0] >= d.rows || p[1] < 0 || p[1] >= d.cols) continue;
      out.push(p);
    }
    return out;
  }
  function bubCount(d) {
    let n = 0;
    for (let i = 0; i < d.grid.length; i++) if (d.grid[i] >= 0) n++;
    return n;
  }
  function bubResolve(d, r0, c0) {
    const col = d.grid[bubIdx(d, r0, c0)];
    const seen = new Set(), stack = [[r0, c0]], cl = [];
    while (stack.length) {
      const p = stack.pop(), k = bubIdx(d, p[0], p[1]);
      if (seen.has(k) || d.grid[k] !== col) continue;
      seen.add(k); cl.push(p);
      for (const q of bubNb(d, p[0], p[1])) stack.push(q);
    }
    if (cl.length < 3) return;
    for (const p of cl) d.grid[bubIdx(d, p[0], p[1])] = -1;
    addFloat('消除 +' + cl.length, '#f8d048', bubX(d, r0, c0), bubY(d, r0));
    A.shake = Math.max(A.shake, 3); sfx('gem');
    const conn = new Set(), q = [];
    for (let c = 0; c < d.cols; c++) {
      const k = bubIdx(d, 0, c);
      if (d.grid[k] >= 0) { conn.add(k); q.push([0, c]); }
    }
    while (q.length) {
      const p = q.pop();
      for (const o of bubNb(d, p[0], p[1])) {
        const k = bubIdx(d, o[0], o[1]);
        if (d.grid[k] >= 0 && !conn.has(k)) { conn.add(k); q.push(o); }
      }
    }
    let drop = 0;
    for (let r = 0; r < d.rows; r++) for (let c = 0; c < d.cols; c++) {
      const k = bubIdx(d, r, c);
      if (d.grid[k] >= 0 && !conn.has(k)) { d.grid[k] = -1; drop++; }
    }
    if (drop) addFloat('悬空掉落 +' + drop, '#8ae8f8', W / 2, bubY(d, 1));
  }
  function bubSnap(d, px, py, hitR, hitC) {
    const cands = [];
    if (hitR >= 0) {
      for (const p of bubNb(d, hitR, hitC))
        if (d.grid[bubIdx(d, p[0], p[1])] < 0) cands.push(p);
    }
    if (!cands.length) {
      for (let r = 0; r < d.rows; r++) for (let c = 0; c < d.cols; c++)
        if (d.grid[bubIdx(d, r, c)] < 0) cands.push([r, c]);
    }
    let best = null, bd = 1e9;
    for (const p of cands) {
      const dx = bubX(d, p[0], p[1]) - px, dy = bubY(d, p[0]) - py;
      const dd = dx * dx + dy * dy;
      if (dd < bd) { bd = dd; best = p; }
    }
    const s = d.shot;
    if (!best || !s) { d.shot = null; return; }
    const r = best[0], c = best[1];
    d.grid[bubIdx(d, r, c)] = s.color;
    d.shot = null;
    if (r >= d.dangerRow) {
      d.grid[bubIdx(d, r, c)] = -1;
      addFloat('触底 -1 心', '#f85868', bubX(d, r, c), bubY(d, r));
      A.shake = 6; loseHeart();
      return;
    }
    bubResolve(d, r, c);
    if (!A.done && bubCount(d) === 0) {
      game.coins = A.hearts === 3 ? 1 : 0;
      A.status = '珊瑚泡泡清空';
      win();
    }
  }
  function bubStep(d, dt) {
    const s = d.shot;
    let rem = dt;
    while (rem > 0 && d.shot && !A.done) {
      const h = Math.min(1 / 240, rem); rem -= h;
      s.x += s.vx * h; s.y += s.vy * h;
      const left = d.bx - d.r, right = d.bx + (d.cols - 1) * d.d + d.r;
      if (s.x < left) { s.x = left; s.vx = Math.abs(s.vx); }
      if (s.x > right) { s.x = right; s.vx = -Math.abs(s.vx); }
      if (s.y <= d.top + d.r) { bubSnap(d, s.x, d.top + d.r, -1, 0); return; }
      let hit = null;
      for (let r = 0; r < d.rows && !hit; r++) for (let c = 0; c < d.cols; c++) {
        if (d.grid[bubIdx(d, r, c)] < 0) continue;
        if (Math.hypot(bubX(d, r, c) - s.x, bubY(d, r) - s.y) < d.r * 2 - 2) { hit = [r, c]; break; }
      }
      if (hit) { bubSnap(d, s.x, s.y, hit[0], hit[1]); return; }
      if (s.y > 210) { d.shot = null; return; }
    }
  }
  function bubFire(d) {
    if (d.shot || A.done) return;
    d.shot = {
      x: d.shooter.x, y: d.shooter.y - 10,
      vx: Math.sin(d.angle) * 330, vy: -Math.cos(d.angle) * 330, color: d.cur
    };
    d.cur = d.next; d.next = (Math.random() * d.colors) | 0;
    d.shots++; sfx('shot');
  }
  INIT.bubble = function (st, d) {
    d.cols = st.cols; d.rows = st.rows; d.r = 9; d.d = 18; d.rowH = 15.6;
    d.bx = Math.round((W - ((d.cols - 1) * d.d + d.r)) / 2);
    d.by = 44; d.top = 38;
    d.grid = new Array(d.cols * d.rows).fill(-1);
    d.colors = st.colors; d.dangerRow = st.dangerRow;
    for (let r = 0; r < st.fillRows; r++) for (let c = 0; c < d.cols; c++)
      d.grid[bubIdx(d, r, c)] = (Math.random() * d.colors) | 0;
    d.shooter = { x: W / 2, y: 193 };
    d.angle = 0;
    d.cur = (Math.random() * d.colors) | 0; d.next = (Math.random() * d.colors) | 0;
    d.shot = null; d.shots = 0;
  };
  UPDATE.bubble = function (dt, inp) {
    const d = A.data;
    if (inp.left) d.angle = clamp(d.angle - 1.5 * dt, -1.15, 1.15);
    if (inp.right) d.angle = clamp(d.angle + 1.5 * dt, -1.15, 1.15);
    if (inp.mx >= 0 && inp.my < 180) {
      const a = Math.atan2(inp.mx - d.shooter.x, d.shooter.y - inp.my);
      d.angle = clamp(a, -1.15, 1.15);
      if (inp.click) bubFire(d);
    }
    if (inp.attackHit || inp.confirmHit) bubFire(d);
    if (d.shot) bubStep(d, dt);
    A.status = '剩余 ' + bubCount(d) + '　发射 ' + d.shots;
  };
  RENDER.bubble = function () {
    const d = A.data;
    panel(6, 34, W - 12, 168, 0.86);
    // 危险线
    const dy = bubY(d, d.dangerRow) - d.r;
    ax.save();
    ax.strokeStyle = 'rgba(248,88,104,0.35)'; ax.lineWidth = 1;
    for (let x = 14; x < W - 14; x += 10) {
      ax.beginPath(); ax.moveTo(x, dy); ax.lineTo(x + 5, dy); ax.stroke();
    }
    ax.restore();
    for (let r = 0; r < d.rows; r++) for (let c = 0; c < d.cols; c++) {
      const v = d.grid[bubIdx(d, r, c)];
      if (v < 0) continue;
      const cx = bubX(d, r, c), cy = bubY(d, r);
      const col = BUB_COL[v] || '#fff';
      ax.fillStyle = 'rgba(0,0,0,0.28)'; ax.beginPath(); ax.arc(cx + 1, cy + 2, d.r, 0, TAU); ax.fill();
      ax.fillStyle = col; ax.beginPath(); ax.arc(cx, cy, d.r, 0, TAU); ax.fill();
      ax.fillStyle = 'rgba(255,255,255,0.5)'; ax.beginPath(); ax.arc(cx - 3, cy - 4, 3, 0, TAU); ax.fill();
      ax.strokeStyle = 'rgba(10,16,32,0.35)'; ax.lineWidth = 1;
      ax.beginPath(); ax.arc(cx, cy, d.r - 0.5, 0, TAU); ax.stroke();
    }
    if (d.shot) {
      const s = d.shot;
      ax.fillStyle = BUB_COL[s.color] || '#fff';
      ax.beginPath(); ax.arc(s.x, s.y, d.r, 0, TAU); ax.fill();
      ax.fillStyle = 'rgba(255,255,255,0.6)';
      ax.beginPath(); ax.arc(s.x - 3, s.y - 4, 3, 0, TAU); ax.fill();
    }
    // 瞄准虚线
    if (!d.shot) {
      const dx = Math.sin(d.angle), dyv = -Math.cos(d.angle);
      for (let i = 1; i <= 7; i++) {
        const px = d.shooter.x + dx * i * 11, py = d.shooter.y - 10 + dyv * i * 11;
        ax.globalAlpha = 0.55 - i * 0.055;
        ax.fillStyle = '#f8f0c8'; ax.fillRect(px - 1, py - 1, 2, 2);
      }
      ax.globalAlpha = 1;
    }
    // 炮台与待发泡泡
    ax.fillStyle = '#2a3450'; ax.fillRect(d.shooter.x - 14, d.shooter.y + 2, 28, 8);
    ax.fillStyle = '#f87898'; ax.fillRect(d.shooter.x - 10, d.shooter.y + 4, 20, 3);
    const col = BUB_COL[d.cur] || '#fff';
    ax.fillStyle = col; ax.beginPath(); ax.arc(d.shooter.x, d.shooter.y - 10, d.r, 0, TAU); ax.fill();
    ax.fillStyle = 'rgba(255,255,255,0.55)';
    ax.beginPath(); ax.arc(d.shooter.x - 3, d.shooter.y - 14, 3, 0, TAU); ax.fill();
    ax.fillStyle = BUB_COL[d.next] || '#fff';
    ax.beginPath(); ax.arc(d.shooter.x + 34, d.shooter.y - 2, 6, 0, TAU); ax.fill();
    txt('下一颗', d.shooter.x + 34, d.shooter.y + 12, 7, '#7e8ca8', 'center');
  };

  /* ============================================================
     13) 迷宫追逃
     ============================================================ */
  function mazeCk(d, r, c) { return r + ',' + c; }
  function mazeNb(d, r, c) {
    const out = [];
    if (r > 0) out.push([r - 1, c]);
    if (r < d.rows - 1) out.push([r + 1, c]);
    if (c > 0) out.push([r, c - 1]);
    if (c < d.cols - 1) out.push([r, c + 1]);
    return out;
  }
  function mazeDist(d, tr, tc) {
    const dist = new Array(d.cols * d.rows).fill(-1);
    const q = [[tr, tc]];
    dist[tr * d.cols + tc] = 0;
    while (q.length) {
      const p = q.shift(), base = dist[p[0] * d.cols + p[1]];
      for (const n of mazeNb(d, p[0], p[1])) {
        if (d.walls.has(mazeCk(d, n[0], n[1]))) continue;
        const k = n[0] * d.cols + n[1];
        if (dist[k] >= 0) continue;
        dist[k] = base + 1; q.push(n);
      }
    }
    return dist;
  }
  INIT.maze = function (st, d) {
    const rows = st.map;
    d.cols = rows[0].length; d.rows = rows.length; d.cell = 18;
    d.bw = d.cols * d.cell; d.bh = d.rows * d.cell;
    d.bx = Math.round((W - d.bw) / 2);
    d.by = 36 + Math.round((150 - d.bh) / 2);
    d.walls = new Set(); d.talismans = new Set();
    d.start = { x: 1, y: 1 }; d.exit = { x: d.cols - 2, y: 1 };
    d.total = 0;
    for (let y = 0; y < d.rows; y++) for (let x = 0; x < d.cols; x++) {
      const ch = rows[y][x];
      if (ch === '#') d.walls.add(mazeCk(d, y, x));
      if (ch === 'o') { d.talismans.add(mazeCk(d, y, x)); d.total++; }
      if (ch === 'S') d.start = { x: x, y: y };
      if (ch === 'E') d.exit = { x: x, y: y };
    }
    d.player = { x: d.start.x, y: d.start.y };
    d.px = mazePixelX(d, d.player.x); d.py = mazePixelY(d, d.player.y);
    d.face = 1; d.cd = 0; d.freeze = 0; d.got = 0; d.open = false;
    d.ghostSpawns = [{ x: d.cols - 2, y: 3 }, { x: 7, y: 5 }];
    d.ghosts = d.ghostSpawns.map(p => ({
      x: p.x, y: p.y, px: mazePixelX(d, p.x), py: mazePixelY(d, p.y), t: 0
    }));
    d.rate = 0.46;
    // 开局 2.6 秒鬼差不动，给玩家看清地图的时间；被抓重置后也给 1.2 秒喘息。
    d.hold = 2.6;
  };
  function mazePixelX(d, cx) { return d.bx + cx * d.cell + d.cell / 2; }
  function mazePixelY(d, cy) { return d.by + cy * d.cell + d.cell / 2; }
  function mazeCatch(d) {
    if (d.freeze > 0 || A.done) return;
    d.freeze = 0.9; A.shake = 8;
    addFloat('被鬼差抓住 -1 心', '#f85868', d.px, d.py - 10);
    loseHeart();
    if (A.done) return;
    d.player = { x: d.start.x, y: d.start.y };
    d.px = mazePixelX(d, d.player.x); d.py = mazePixelY(d, d.player.y);
    for (let i = 0; i < d.ghosts.length; i++) {
      const s = d.ghostSpawns[i], g = d.ghosts[i];
      g.x = s.x; g.y = s.y; g.px = mazePixelX(d, g.x); g.py = mazePixelY(d, g.y);
    }
    d.cd = 0.9;
    d.hold = 1.2;
  }
  function mazeGhostStep(d, g) {
    const dist = mazeDist(d, d.player.y, d.player.x);
    let best = null, bd = 1e9;
    for (const n of mazeNb(d, g.y, g.x)) {
      if (d.walls.has(mazeCk(d, n[0], n[1]))) continue;
      const dd = dist[n[0] * d.cols + n[1]];
      if (dd >= 0 && dd < bd) { bd = dd; best = n; }
    }
    if (best) { g.x = best[1]; g.y = best[0]; }
  }
  UPDATE.maze = function (dt, inp) {
    const d = A.data;
    d.freeze = Math.max(0, d.freeze - dt);
    d.cd = Math.max(0, d.cd - dt);
    d.hold = Math.max(0, d.hold - dt);
    if (d.freeze > 0) {
      A.status = '被抓住…灵符 ' + d.got + '/' + d.total;
      return;
    }
    let dx = 0, dy = 0;
    if (inp.upHit) dy = -1; else if (inp.downHit) dy = 1;
    else if (inp.leftHit) dx = -1; else if (inp.rightHit) dx = 1;
    else if (d.cd <= 0) {
      if (inp.up) dy = -1; else if (inp.down) dy = 1;
      else if (inp.left) dx = -1; else if (inp.right) dx = 1;
    }
    if (dx || dy) {
      d.face = dx < 0 ? -1 : dx > 0 ? 1 : d.face;
      const nx = d.player.x + dx, ny = d.player.y + dy;
      if (!d.walls.has(mazeCk(d, ny, nx))) {
        d.player.x = nx; d.player.y = ny;
        d.cd = 0.135;
        const k = mazeCk(d, ny, nx);
        if (d.talismans.has(k)) {
          d.talismans.delete(k); d.got++;
          sfx('coin');
          addFloat('灵符 +1', '#f8d048', mazePixelX(d, nx), mazePixelY(d, ny) - 8);
          if (d.got >= d.total) {
            d.open = true;
            addFloat('鬼门开启！', '#68f8a0', mazePixelX(d, d.exit.x), mazePixelY(d, d.exit.y) - 10);
            sfx('gem');
          }
        }
        if (d.open && nx === d.exit.x && ny === d.exit.y) {
          game.coins = game.deaths === 0 ? 1 : 0;
          A.status = '灵符 ' + d.got + '/' + d.total + ' · 逃出鬼道';
          win();
        }
      } else sfx('clank');
    }
    if (d.hold <= 0) for (const g of d.ghosts) {
      g.t += dt;
      if (g.t >= d.rate) { g.t -= d.rate; mazeGhostStep(d, g); }
      if (g.x === d.player.x && g.y === d.player.y) { mazeCatch(d); break; }
    }
    d.px += (mazePixelX(d, d.player.x) - d.px) * Math.min(1, dt * 20);
    d.py += (mazePixelY(d, d.player.y) - d.py) * Math.min(1, dt * 20);
    for (const g of d.ghosts) {
      g.px += (mazePixelX(d, g.x) - g.px) * Math.min(1, dt * 12);
      g.py += (mazePixelY(d, g.y) - g.py) * Math.min(1, dt * 12);
    }
    A.status = '灵符 ' + d.got + '/' + d.total + '　鬼门 ' + (d.open ? '开' : '封') +
      (d.hold > 0 && d.freeze <= 0 ? '　鬼差将至…' : '');
  };
  RENDER.maze = function () {
    const d = A.data;
    const cs = d.cell;
    panel(d.bx - 6, d.by - 6, d.bw + 12, d.bh + 12, 0.92);
    for (let y = 0; y < d.rows; y++) for (let x = 0; x < d.cols; x++) {
      const px0 = d.bx + x * cs, py0 = d.by + y * cs;
      if (d.walls.has(mazeCk(d, y, x))) {
        ax.fillStyle = '#2c3048'; ax.fillRect(px0, py0, cs, cs);
        ax.fillStyle = '#3e4564'; ax.fillRect(px0, py0, cs, 2);
        ax.fillStyle = '#1a1d2e'; ax.fillRect(px0, py0 + cs - 2, cs, 2);
        ax.fillStyle = 'rgba(88,240,160,0.18)'; ax.fillRect(px0 + 2, py0 + 2, cs - 4, 1);
      } else {
        ax.fillStyle = ((x + y) & 1) ? '#10182a' : '#131d31';
        ax.fillRect(px0, py0, cs, cs);
        ax.fillStyle = 'rgba(120,150,190,0.08)'; ax.fillRect(px0, py0, 1, cs);
      }
    }
    for (const t of d.talismans) {
      const p = t.split(','), cx = mazePixelX(d, +p[1]), cy = mazePixelY(d, +p[0]);
      const bob = Math.sin(A.t * 5 + cx) * 1.5;
      ax.globalAlpha = 0.2; ax.fillStyle = '#f8d048';
      ax.beginPath(); ax.arc(cx, cy + bob, 9, 0, TAU); ax.fill();
      ax.globalAlpha = 1;
      ax.fillStyle = '#f8e8a0'; ax.fillRect(cx - 4, cy - 6 + bob, 8, 11);
      ax.fillStyle = '#c83048'; ax.fillRect(cx - 2, cy - 4 + bob, 4, 6);
      ax.fillStyle = '#a87820'; ax.fillRect(cx - 1, cy + 4 + bob, 2, 2);
    }
    // 鬼门
    const ex = mazePixelX(d, d.exit.x), ey = mazePixelY(d, d.exit.y);
    ax.fillStyle = d.open ? '#184830' : '#2a2030';
    ax.fillRect(ex - 8, ey - 9, 16, 18);
    ax.strokeStyle = d.open ? '#68f8a0' : '#8a5a6a'; ax.lineWidth = 2;
    ax.strokeRect(ex - 7.5, ey - 8.5, 15, 17);
    if (d.open) {
      ax.globalAlpha = 0.25 + 0.15 * Math.sin(A.t * 6);
      ax.fillStyle = '#68f8a0'; ax.fillRect(ex - 5, ey - 6, 10, 14);
      ax.globalAlpha = 1;
    }
    // 鬼差
    for (const g of d.ghosts) {
      ax.globalAlpha = 0.24; ax.fillStyle = '#a8f8e8';
      ax.beginPath(); ax.arc(g.px, g.py, 10, 0, TAU); ax.fill();
      ax.globalAlpha = 1;
      ax.fillStyle = '#7ae8d0'; ax.beginPath();
      ax.moveTo(g.px, g.py - 8);
      ax.quadraticCurveTo(g.px + 8, g.py, g.px + 5, g.py + 7);
      ax.lineTo(g.px + 2, g.py + 4); ax.lineTo(g.px, g.py + 7);
      ax.lineTo(g.px - 2, g.py + 4); ax.lineTo(g.px - 5, g.py + 7);
      ax.quadraticCurveTo(g.px - 8, g.py, g.px, g.py - 8);
      ax.closePath(); ax.fill();
      ax.fillStyle = '#102020'; ax.fillRect(g.px - 3, g.py - 3, 2, 3); ax.fillRect(g.px + 1, g.py - 3, 2, 3);
    }
    // 玩家
    if (d.freeze <= 0) {
      ax.fillStyle = '#2858a8'; ax.fillRect(d.px - 4, d.py - 1, 8, 8);
      ax.fillStyle = '#48c8f8'; ax.fillRect(d.px - 4, d.py - 8, 8, 7);
      ax.fillStyle = '#e8f4ff'; ax.fillRect(d.px - 2, d.py - 6, 2, 2); ax.fillRect(d.px + 1, d.py - 6, 2, 2);
      ax.fillStyle = '#f8d048';
      ax.fillRect(d.px + (d.face < 0 ? -7 : 5), d.py - 5, 2, 3);
    } else {
      ax.strokeStyle = 'rgba(248,88,104,0.7)'; ax.lineWidth = 2;
      ax.strokeRect(d.px - 7, d.py - 10, 14, 14);
    }
  };

  /* ============================================================
     14) 垂直攀跃
     ============================================================ */
  function jumpGen(d) {
    d.genCount++;
    const w = 38 + ((Math.random() * 26) | 0);
    const cx = clamp(d.lastCx + (Math.random() * 2 - 1) * 72, 30, W - 30);
    const x = clamp(cx - w / 2, 8, W - 8 - w);
    d.lastCx = x + w / 2;
    const moving = d.genCount % 5 === 0;
    d.plats.push({
      x: x, y: d.genY, w: w, baseX: x,
      move: moving ? 1 : 0, amp: moving ? 18 : 0,
      phase: Math.random() * TAU, speed: moving ? 0.9 : 0
    });
    d.genY -= 42 + Math.random() * 16;
  }
  function jumpBurn(d) {
    addFloat('熔岩灼烧 -1 心', '#f87838', W / 2, 120);
    A.shake = 8; loseHeart();
    if (A.done) return;
    d.p.y = d.camY + 96; d.p.x = W / 2; d.p.vy = -180;
    d.lavaY = d.p.y + 150;
    d.plats.push({
      x: W / 2 - 32, y: d.p.y + 42, w: 64, baseX: W / 2 - 32,
      move: 0, amp: 0, phase: 0, speed: 0
    });
    d.lastCx = W / 2;
    d.genY = Math.min(d.genY, d.camY - 80);
  }
  INIT.jumper = function (st, d) {
    d.p = { x: W / 2, y: 118, vx: 0, vy: 0, w: 12, h: 14 };
    d.plats = []; d.camY = 0; d.startY = d.p.y; d.maxH = 0;
    d.lavaY = 236; d.genY = 140; d.genCount = 0; d.lastCx = W / 2;
    d.plats.push({
      x: W / 2 - 32, y: 140, w: 64, baseX: W / 2 - 32,
      move: 0, amp: 0, phase: 0, speed: 0
    });
    d.genY = 92;
    while (d.genY > d.camY - 320) jumpGen(d);
    d.target = st.target;
  };
  UPDATE.jumper = function (dt, inp) {
    const d = A.data;
    for (const pl of d.plats) {
      if (pl.move) pl.x = clamp(pl.baseX + Math.sin(A.t * pl.speed + pl.phase) * pl.amp, 8, W - 8 - pl.w);
    }
    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    d.p.x += dir * 132 * dt;
    if (d.p.x < -10) d.p.x = W + 10;
    if (d.p.x > W + 10) d.p.x = -10;
    const prevBottom = d.p.y + d.p.h;
    d.p.vy += 800 * dt;
    d.p.y += d.p.vy * dt;
    const bottom = d.p.y + d.p.h;
    if (d.p.vy > 0) {
      for (const pl of d.plats) {
        if (prevBottom <= pl.y + 2 && bottom >= pl.y &&
            d.p.x + d.p.w / 2 >= pl.x - 5 && d.p.x + d.p.w / 2 <= pl.x + pl.w + 5) {
          d.p.y = pl.y - d.p.h;
          d.p.vy = -310;
          sfx('land');
          break;
        }
      }
    }
    if (d.p.y - d.camY < 78) d.camY = d.p.y - 78;
    d.maxH = Math.max(d.maxH, d.startY - d.p.y);
    d.lavaY -= 7 * dt;
    if (d.p.y + d.p.h >= d.lavaY || d.p.y > d.camY + 226) {
      jumpBurn(d);
      if (A.done) return;
    }
    while (d.genY > d.camY - 320) jumpGen(d);
    if (d.plats.length > 90)
      d.plats = d.plats.filter(pl => pl.y > d.camY - 360 && pl.y < d.camY + 280);
    if (d.maxH >= d.target) {
      game.coins = game.deaths === 0 ? 1 : 0;
      A.status = '攀上 ' + Math.floor(d.maxH) + ' 尺';
      win();
    }
    A.status = '高度 ' + Math.floor(Math.max(0, d.maxH)) + '/' + d.target + ' 尺　熔岩在涨';
  };
  RENDER.jumper = function () {
    const d = A.data;
    panel(0, 34, W, 168, 0.55);
    // 高度进度尺
    ax.fillStyle = '#1a2038'; ax.fillRect(W - 10, 40, 4, 158);
    const ph = clamp(d.maxH / d.target, 0, 1);
    ax.fillStyle = '#f8d048'; ax.fillRect(W - 10, 198 - 158 * ph, 4, 158 * ph);
    ax.fillStyle = '#f8f0c8'; ax.fillRect(W - 11, 198 - 158 * ph - 1, 6, 2);
    // 浮石
    for (const pl of d.plats) {
      const sy = pl.y - d.camY;
      if (sy < 32 || sy > 206) continue;
      ax.fillStyle = '#3a3a52'; ax.fillRect(pl.x, sy, pl.w, 7);
      ax.fillStyle = '#5a5a78'; ax.fillRect(pl.x, sy, pl.w, 2);
      ax.fillStyle = pl.move ? '#f8a048' : '#8a5a3a';
      ax.fillRect(pl.x + 3, sy + 3, pl.w - 6, 1);
      ax.fillStyle = '#22223a'; ax.fillRect(pl.x + 2, sy + 7, pl.w - 4, 2);
    }
    // 熔岩
    const ly = d.lavaY - d.camY;
    if (ly < 210) {
      ax.fillStyle = '#c83818'; ax.fillRect(0, Math.max(34, ly), W, 224 - Math.max(34, ly));
      ax.fillStyle = '#f87838';
      for (let x = 0; x < W; x += 8) {
        const h = 3 + Math.sin(A.t * 3 + x * 0.12) * 2;
        ax.fillRect(x, ly - h, 8, h + 2);
      }
      ax.fillStyle = '#ffd060';
      for (let x = 0; x < W; x += 16) ax.fillRect(x + 4, ly - 1 + Math.sin(A.t * 4 + x) * 1.5, 6, 1);
    }
    // 玩家
    const pyx = d.p.x, pyy = d.p.y - d.camY;
    ax.fillStyle = '#2858a8'; ax.fillRect(pyx - 5, pyy + 4, 10, 8);
    ax.fillStyle = '#48c8f8'; ax.fillRect(pyx - 5, pyy - 4, 10, 8);
    ax.fillStyle = '#e8f4ff'; ax.fillRect(pyx - 3, pyy - 2, 2, 2); ax.fillRect(pyx + 1, pyy - 2, 2, 2);
    ax.fillStyle = '#f8d048'; ax.fillRect(pyx - 6, pyy - 6, 12, 2);
    // 顶部目标提示
    if (d.target - d.maxH < 140) {
      const a = 0.6 + 0.4 * Math.sin(A.t * 5);
      ax.globalAlpha = a;
      txt('终点 ' + Math.floor(d.target - d.maxH) + ' 尺', W / 2, 48, 9, '#68f8a0', 'center');
      ax.globalAlpha = 1;
    }
  };

  /* ---------------- 导出 ---------------- */
  window.ARCADE = {
    stages: STAGES,
    has: has,
    start: start,
    stop: stop,
    step: step,
    render: render,
    get active() { return !!(A && A.active); },
    _state: function () { return A; },
    _forceWin: function (idx) {
      if (!start(idx)) return false;
      A.done = false; A.win = true;
      game.coins = A.st.totalCoin;
      commitWin();
      return true;
    },
    _forceFail: function (idx) {
      if (!start(idx)) return false;
      A.done = false;
      fail('测试');
      commitFail();
      return true;
    }
  };
})();

