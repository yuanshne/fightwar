// node tools/_v29_arcade_reach.js —— v29 街机关「真实输入可达性」验收
// 用户口径：「普通的关卡你应该测试可达性，同时有一定的难度，要不然太无聊了」。
// 本文件不调用 _forceWin：每关起一局，用和玩家完全相同的 inp（方向/攻击/冲刺/鼠标）
// 驱动 ARCADE.step，逐关证明存在一条合法操作序列能自然通关；同时用同种子空输入
// 跑一段，证明关卡不会自己赢（不是无聊的自动播放）。
// 机器人可以读局面（相当于完美信息玩家），但不修改 game/ARCADE 的胜负状态。
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const DT = 1 / 60;
const W = 384;

/* ---------------- 确定性随机 ---------------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const SEEDS = (process.env.REACH_SEEDS || '1,7,19').split(',').map(Number);

/* ---------------- 与 _arcade_test.js 相同的浏览器桩 ---------------- */
const themes = {};
['grass', 'cave', 'sky', 'factory', 'lava', 'tower', 'boss', 'wind', 'castle', 'star', 'sea', 'nether',
  'ember', 'aether', 'husk', 'maw', 'bell', 'anthem', 'mirror', 'abyss'].forEach(k => themes[k] = { skyT: '#101020', skyB: '#202040' });
const levels = new Function('THEMES', read('levels.js') + read('chapter2.js') + read('chapter3.js')
  + read('chapter4.js') + read('chapter5.js') + '\n;return {ALL_LEVELS,aggregateLevels};')(themes);
const ALL = levels.aggregateLevels();
const cv = { width: 384, height: 224 };
const ctx2d = new Proxy({}, {
  get(t, p) {
    if (p === 'measureText') return () => ({ width: 6 });
    if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() { } });
    if (p === 'canvas') return cv;
    if (p in t) return t[p];
    return () => { };
  },
  set(t, p, v) { t[p] = v; return true; }
});
cv.getContext = () => ctx2d;
const documentStub = { getElementById: id => (id === 'game' ? cv : null) };
const windowStub = { ArcadeBridge: { sfx() { }, tone() { } } };
const game = {
  sfxQueue: [], time: 0, deaths: 0, coins: 0, state: 'title', level: null, levelIdx: -1,
  paused: false, cam: { x: 0, y: 0 }, player: null, boss: null, seal: null,
  puzzleActive: false, puzzleNear: -1, solvedPuzzles: {}, hitStop: 0, tick: 0, shake: 0
};
new Function('window', 'document', 'ALL_LEVELS', 'THEMES', 'drawCNText', 'drawPixelText', 'game',
  read('arcade.js'))(windowStub, documentStub, ALL, themes, () => { }, () => { }, game);
const A = windowStub.ARCADE;
const ONLY = (process.env.REACH_ONLY || '').split(',').filter(Boolean).map(Number);
const NONBOSS = ALL.map((l, i) => (l.boss ? -1 : i)).filter(i => i >= 0 && (!ONLY.length || ONLY.includes(i)));

/* ---------------- 输入小工具 ---------------- */
function blankInp() {
  return {
    left: false, right: false, up: false, down: false,
    leftHit: false, rightHit: false, upHit: false, downHit: false,
    attackHit: false, confirmHit: false, dashHit: false,
    mx: -1, my: -1, click: false
  };
}
function hit(inp, dir) { inp[dir] = true; inp[dir + 'Hit'] = true; }
function hold(inp, dir) { inp[dir] = true; }
function clickAt(inp, x, y) { inp.mx = x; inp.my = y; inp.click = true; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function manhattan(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

/* ---------------- 通用跑局 ---------------- */
function runBot(idx, bot, seed, opts) {
  Math.random = mulberry32(seed);
  game.state = 'title'; game.level = null; game.levelIdx = -1;
  if (!A.start(idx)) return { ok: false, why: 'start 拒绝' };
  const s = A._state();
  const ctx = { frames: 0, data: bot.init ? bot.init(s) : {}, seed: seed };
  const maxFrames = Math.ceil((s.st.limit + 0.5) / DT);
  const inp = blankInp();
  let err = '';
  try {
    while (!s.done && ctx.frames < maxFrames) {
      const cur = blankInp();
      bot.act(s, cur, ctx);
      A.step(DT, cur);
      ctx.frames++;
    }
  } catch (e) { err = e && e.stack ? e.stack : String(e); }
  const won = !!(s.done && s.win);
  const time = game.time, hearts = s.hearts;
  // 自然胜利后还要能走完结算演出（不是卡在 win 瞬间）
  let settled = false;
  if (won && !err) {
    for (let i = 0; i < 70; i++) A.step(DT, blankInp());
    settled = game.state === 'clear';
  }
  const summary = (opts && opts.summary && bot.summary) ? bot.summary(s) : '';
  A.stop();
  return {
    ok: won && !err && (opts && opts.needSettle ? settled : true),
    won: won, settled: settled, err: err, time: time, hearts: hearts,
    frames: ctx.frames, data: s.data, status: s.status, summary: summary
  };
}

/* ---------------- 空输入负例：不能自己赢 ---------------- */
function runIdle(idx, seconds) {
  Math.random = mulberry32(4242);
  if (!A.start(idx)) return { ok: false, why: 'start 拒绝' };
  const s = A._state();
  const maxFrames = Math.min(Math.ceil((s.st.limit + 0.1) / DT), Math.ceil(seconds / DT));
  for (let f = 0; f < maxFrames && !s.done; f++) A.step(DT, blankInp());
  const won = !!(s.done && s.win);
  const done = s.done;
  A.stop();
  return { won: won, done: done, time: game.time };
}

/* ============================================================
   1) 动作扫雷：逐格用鼠标翻开所有非雷格
   ============================================================ */
const botMine = {
  init() { return {}; },
  act(s, inp, ctx) {
    const d = s.data;
    for (const c of d.cells) {
      if (c.rev || c.mine) continue;
      clickAt(inp, d.bx + c.x * d.cell + d.cell / 2, d.by + c.y * d.cell + d.cell / 2);
      return;
    }
  }
};

/* ============================================================
   2) 打地鼠：冒头且不是炸弹就点
   ============================================================ */
const botMole = {
  init() { return {}; },
  act(s, inp) {
    const d = s.data;
    let target = null;
    for (const h of d.holes) {
      if (!h.up || h.kind === 'bomb') continue;
      if (!target || h.kind === 'gold') target = h;
      if (h.kind === 'gold') break;
    }
    if (target) clickAt(inp, target.cx, target.cy);
  }
};

/* ============================================================
   3) 点灯：GF(2) 解出最优点击集合，再逐个用鼠标点
   ============================================================ */
function solveLights(d) {
  const n = d.cols * d.rows;
  const m = Array.from({ length: n }, () => new Array(n + 1).fill(0));
  for (let y = 0; y < d.rows; y++) for (let x = 0; x < d.cols; x++) {
    const i = y * d.cols + x;
    for (const p of [[x, y], [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (p[0] < 0 || p[0] >= d.cols || p[1] < 0 || p[1] >= d.rows) continue;
      m[i][p[1] * d.cols + p[0]] ^= 1;
    }
    m[i][n] = d.on[i] ? 0 : 1;
  }
  const pivots = [];
  let row = 0;
  for (let col = 0; col < n && row < n; col++) {
    let sel = -1;
    for (let r = row; r < n; r++) if (m[r][col]) { sel = r; break; }
    if (sel < 0) continue;
    const t = m[row]; m[row] = m[sel]; m[sel] = t;
    for (let r = 0; r < n; r++) if (r !== row && m[r][col])
      for (let c = col; c <= n; c++) m[r][c] ^= m[row][c];
    pivots.push(col); row++;
  }
  for (let r = row; r < n; r++) if (m[r][n]) return null;
  const free = [];
  for (let c = 0; c < n; c++) if (!pivots.includes(c)) free.push(c);
  let best = null, bestW = 1e9;
  for (let mask = 0; mask < (1 << free.length); mask++) {
    const x = new Array(n).fill(0);
    for (let i = 0; i < free.length; i++) x[free[i]] = (mask >> i) & 1;
    for (let i = 0; i < pivots.length; i++) {
      const p = pivots[i];
      let v = m[i][n];
      for (const f of free) if (m[i][f] && x[f]) v ^= 1;
      x[p] = v;
    }
    const w = x.reduce((a, b) => a + b, 0);
    if (w < bestW) { bestW = w; best = x; }
  }
  return best;
}
const botLights = {
  init(s) { return { sol: null, i: 0, moves0: 0 }; },
  act(s, inp, ctx) {
    const d = s.data;
    if (!ctx.data.sol) ctx.data.sol = solveLights(d);
    const sol = ctx.data.sol;
    if (!sol) return;
    const idx = sol.map((v, i) => v ? i : -1).filter(i => i >= 0);
    if (ctx.data.i >= idx.length) return;
    const k = idx[ctx.data.i++];
    const x = k % d.cols, y = (k / d.cols) | 0;
    clickAt(inp, d.bx + x * d.cell + d.cell / 2, d.by + y * d.cell + d.cell / 2);
  },
  summary(s) { return 'moves=' + s.data.moves; }
};

/* ============================================================
   4) 记忆翻牌：按记忆逐对翻
   ============================================================ */
function memClick(d, i, inp) {
  const cx = i % d.cols, cy = (i / d.cols) | 0;
  clickAt(inp, d.bx + cx * (d.cw + 7) + d.cw / 2, d.by + cy * (d.ch + 7) + d.ch / 2);
}
const botMemory = {
  init() { return {}; },
  act(s, inp) {
    const d = s.data;
    if (d.lock > 0 || s.done) return;
    if (d.first < 0) {
      const i = d.cards.findIndex(c => !c.matched && !c.open);
      if (i >= 0) memClick(d, i, inp);
    } else {
      const want = d.cards[d.first].icon;
      const i = d.cards.findIndex((c, k) => k !== d.first && !c.matched && !c.open && c.icon === want);
      if (i >= 0) memClick(d, i, inp);
    }
  },
  summary(s) { return 'mistakes=' + s.data.mistakes; }
};

/* ============================================================
   5) 推箱子：BFS 求最短推法，再按路径走
   ============================================================ */
function sokKey(d, p, boxes) {
  return p.x + ',' + p.y + '|' + boxes.map(b => b.x + ',' + b.y).sort().join(';');
}
function sokPlan(d) {
  const dirs = [[0, -1, 'up'], [0, 1, 'down'], [-1, 0, 'left'], [1, 0, 'right']];
  const startB = d.boxes.map(b => ({ x: b.x, y: b.y }));
  const start = { x: d.player.x, y: d.player.y };
  const q = [{ p: start, b: startB, path: [] }];
  const seen = new Set([sokKey(d, start, startB)]);
  for (let qi = 0; qi < q.length; qi++) {
    const cur = q[qi];
    if (cur.b.every(b => d.targets.has(b.x + ',' + b.y))) return cur.path;
    for (const dv of dirs) {
      const nx = cur.p.x + dv[0], ny = cur.p.y + dv[1];
      if (d.walls.has(nx + ',' + ny)) continue;
      const b = cur.b.map(o => ({ x: o.x, y: o.y }));
      const bi = b.findIndex(o => o.x === nx && o.y === ny);
      if (bi >= 0) {
        const bx = nx + dv[0], by = ny + dv[1];
        if (d.walls.has(bx + ',' + by) || b.some(o => o.x === bx && o.y === by)) continue;
        b[bi] = { x: bx, y: by };
      }
      const np = { x: nx, y: ny };
      const k = sokKey(d, np, b);
      if (seen.has(k)) continue;
      seen.add(k);
      q.push({ p: np, b: b, path: cur.path.concat([dv[2]]) });
    }
  }
  return null;
}
const botSokoban = {
  init(s) { return { path: sokPlan(s.data), i: 0 }; },
  act(s, inp, ctx) {
    const d = s.data;
    if (d.cd > 0 || ctx.data.i >= ctx.data.path.length) return;
    hit(inp, ctx.data.path[ctx.data.i++]);
  },
  summary(s) { return 'moves=' + s.data.moves; }
};

/* ============================================================
   6) 贪吃蛇：BFS 追果 + 落子后空间安全校验 + 追尾兜底
   ============================================================ */
function snakeNeighbors(d, p) {
  return [[0, -1], [0, 1], [-1, 0], [1, 0]].filter(v => {
    const x = p.x + v[0], y = p.y + v[1];
    return x >= 0 && x < d.cols && y >= 0 && y < d.rows && !d.walls.has(x + ',' + y);
  }).map(v => ({ x: p.x + v[0], y: p.y + v[1] }));
}
function snakeSearch(d, from, goal, blocked) {
  const q = [{ p: from, path: [] }];
  const seen = new Set([from.x + ',' + from.y]);
  for (let qi = 0; qi < q.length; qi++) {
    const cur = q[qi];
    if (cur.p.x === goal.x && cur.p.y === goal.y) return cur.path;
    for (const n of snakeNeighbors(d, cur.p)) {
      const k = n.x + ',' + n.y;
      if (seen.has(k) || blocked(k, n)) continue;
      seen.add(k);
      q.push({ p: n, path: cur.path.concat([n]) });
    }
  }
  return null;
}
function snakeSpace(d, body) {
  const head = body[0];
  const seen = new Set([head.x + ',' + head.y]);
  const q = [head];
  for (let qi = 0; qi < q.length; qi++) {
    const p = q[qi];
    for (const n of snakeNeighbors(d, p)) {
      const k = n.x + ',' + n.y;
      if (seen.has(k) || body.some(b => b.x === n.x && b.y === n.y)) continue;
      seen.add(k); q.push(n);
    }
  }
  return seen.size;
}
const botSnake = {
  init() { return {}; },
  act(s, inp) {
    const d = s.data;
    if (!d.food) return;
    const body = d.snake;
    const head = body[0];
    const blocked = (k, n) => body.some(b => b.x === n.x && b.y === n.y);
    const path = snakeSearch(d, head, d.food, blocked);
    const cands = snakeNeighbors(d, head).filter(n => {
      if (n.x === head.x - d.dir.x && n.y === head.y - d.dir.y) return false;
      return !body.some(b => b.x === n.x && b.y === n.y);
    });
    let move = path && path.length ? path[0] : null;
    if (move) {
      const nb = [{ x: move.x, y: move.y }].concat(body.slice(0, body.length - 1).map(b => ({ x: b.x, y: b.y })));
      if (snakeSpace(d, nb) < nb.length + 2) move = null;
    }
    if (!move) {
      let best = null, bs = -1;
      for (const n of cands) {
        const eat = d.food && n.x === d.food.x && n.y === d.food.y;
        const nb = [{ x: n.x, y: n.y }].concat(body.slice(0, eat ? body.length : body.length - 1).map(b => ({ x: b.x, y: b.y })));
        const sp = snakeSpace(d, nb);
        const sc = sp * 10 - (eat ? 0 : manhattan(n, d.food));
        if (sc > bs) { bs = sc; best = n; }
      }
      move = best;
    }
    // 追尾兜底：连最短路径都没有时，朝尾巴走
    if (!move) {
      const tail = body[body.length - 1];
      const tp = snakeSearch(d, head, tail, blocked);
      if (tp && tp.length) move = tp[0];
    }
    if (!move) return;
    const dx = move.x - head.x, dy = move.y - head.y;
    if (dx < 0) hold(inp, 'left'); else if (dx > 0) hold(inp, 'right');
    if (dy < 0) hold(inp, 'up'); else if (dy > 0) hold(inp, 'down');
  },
  summary(s) { return 'eaten=' + s.data.eaten; }
};

/* ============================================================
   7) 矿脉寻宝：等钩子对准可抓宝石再放
   ============================================================ */
const botGold = {
  init() { return { target: null }; },
  act(s, inp, ctx) {
    const d = s.data;
    if (d.state !== 'swing') return;
    if (!ctx.data.target || ctx.data.target.taken) {
      let best = null, bd = 1e9;
      for (const g of d.gems) {
        if (g.taken || g.kind === 'rock') continue;
        const ang = Math.atan2(g.x - d.ax, g.y - d.ay);
        if (Math.abs(ang) > 1.15) continue;
        if (Math.hypot(g.x - d.ax, g.y - d.ay) > d.maxLen) continue;
        const dd = Math.abs(d.angle - ang);
        if (dd < bd) { bd = dd; best = g; }
      }
      ctx.data.target = best;
      if (!best) return;
    }
    const g = ctx.data.target;
    const ang = Math.atan2(g.x - d.ax, g.y - d.ay);
    if (Math.abs(ang - d.angle) < 0.035 && Math.abs(ang) <= 1.15) hit(inp, 'attack');
  },
  summary(s) { return 'got=' + s.data.got + '/em=' + s.data.em; }
};

/* ============================================================
   8) 落块筑墙：枚举旋转/落点，启发式打分，再逐帧操作
   ============================================================ */
function tetRot(m) {
  const h = m.length, w = m[0].length, out = [];
  for (let x = 0; x < w; x++) { const row = []; for (let y = h - 1; y >= 0; y--) row.push(m[y][x]); out.push(row); }
  return out;
}
function tetSame(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function tetSolidBoard(board, cols, rows, m, x, y) {
  for (let r = 0; r < m.length; r++) for (let c = 0; c < m[r].length; c++) {
    if (!m[r][c]) continue;
    const bx = x + c, by = y + r;
    if (bx < 0 || bx >= cols || by >= rows) return true;
    if (by >= 0 && board[by * cols + bx] >= 0) return true;
  }
  return false;
}
function tetPlacements(d) {
  const p = d.piece;
  const rots = [];
  let cur = p.m.map(r => r.slice());
  for (let i = 0; i < 4; i++) {
    if (!rots.some(o => tetSame(o, cur))) rots.push(cur.map(r => r.slice()));
    cur = tetRot(cur);
  }
  const out = [];
  for (const m of rots) {
    for (let x = -m[0].length + 1; x < d.cols; x++) {
      let y = -m.length;
      if (tetSolidBoard(d.board, d.cols, d.rows, m, x, y)) continue;
      while (!tetSolidBoard(d.board, d.cols, d.rows, m, x, y + 1)) y++;
      const b = d.board.slice();
      let ok = true;
      for (let r = 0; r < m.length; r++) for (let c = 0; c < m[r].length; c++) {
        if (!m[r][c]) continue;
        const by = y + r, bx = x + c;
        if (by < 0) { ok = false; continue; }
        b[by * d.cols + bx] = p.ci;
      }
      if (!ok) continue;
      let lines = 0;
      for (let r = d.rows - 1; r >= 0; r--) {
        let full = true;
        for (let c = 0; c < d.cols; c++) if (b[r * d.cols + c] < 0) { full = false; break; }
        if (full) { b.splice(r * d.cols, d.cols); b.unshift(...new Array(d.cols).fill(-1)); lines++; r++; }
      }
      const h = new Array(d.cols).fill(0);
      let holes = 0, agg = 0, maxH = 0;
      for (let c = 0; c < d.cols; c++) {
        let seen = false;
        for (let r = 0; r < d.rows; r++) {
          const v = b[r * d.cols + c] >= 0;
          if (v) { if (!seen) { h[c] = d.rows - r; seen = true; } }
          else if (seen) holes++;
        }
        agg += h[c]; maxH = Math.max(maxH, h[c]);
      }
      let bump = 0;
      for (let c = 0; c + 1 < d.cols; c++) bump += Math.abs(h[c] - h[c + 1]);
      const score = lines * 120 - holes * 32 - bump * 3 - agg * 1.5 - maxH * 4;
      out.push({ m: m, x: x, score: score, lines: lines });
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}
const botTetris = {
  init() { return { plan: null, piece: null, stuck: 0 }; },
  act(s, inp, ctx) {
    const d = s.data;
    if (!d.piece || s.done) return;
    if (ctx.data.piece !== d.piece) {
      const ps = tetPlacements(d);
      ctx.data.plan = ps.length ? ps[0] : null;
      ctx.data.piece = d.piece;
      ctx.data.stuck = 0;
    }
    const plan = ctx.data.plan;
    if (!plan) { hit(inp, 'confirm'); return; }
    if (!tetSame(d.piece.m, plan.m)) { hit(inp, 'attack'); ctx.data.stuck++; return; }
    if (d.piece.x < plan.x) { hit(inp, 'right'); ctx.data.stuck++; return; }
    if (d.piece.x > plan.x) { hit(inp, 'left'); ctx.data.stuck++; return; }
    hit(inp, 'confirm');
  },
  summary(s) { return 'lines=' + s.data.lines + '/h=' + s.hearts; }
};

/* ============================================================
   9) 弹幕生存：采样方向，避弹幕 + 捡星屑
   ============================================================ */
const botDodge = {
  init() { return {}; },
  act(s, inp) {
    const d = s.data;
    const dirs = [[0, 0], [1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 1], [-1, -1], [-1, 1]];
    const speed = 138;
    // 走位评分：各方向前瞻 1.2s，躲避陨星 + 顺路接星屑（按预测位置，不是当前位置）
    let best = null, bestScore = -1e18;
    for (const dv of dirs) {
      const l = Math.hypot(dv[0], dv[1]) || 1;
      const vx = dv[0] / l * speed, vy = dv[1] / l * speed;
      let sc = 0;
      for (let ti = 0; ti <= 12; ti++) {
        const t = ti * 0.1;
        const px = clamp(d.p.x + vx * t, 10, W - 10), py = clamp(d.p.y + vy * t, 42, 166);
        for (const b of d.bullets) {
          const bx = b.x + b.vx * t, by = b.y + b.vy * t;
          const dd = Math.hypot(bx - px, by - py);
          const danger = b.r + 9;
          if (dd < danger) sc -= 2400 * (1 - t / 1.6) + (danger - dd) * 90;
          else if (dd < danger * 2.4) sc -= (danger * 2.4 - dd) * 2.2;
        }
        for (const k of d.picks) {
          const ky = k.y + k.vy * t;
          if (ky > 196) continue;
          const dd = Math.hypot(k.x - px, ky - py);
          if (dd < 14) sc += 260 * (1 - t / 1.4);       // 到达即拾取
          else if (dd < 46) sc += (46 - dd) * 1.4 * (1 - t / 1.4);
        }
      }
      sc -= Math.abs(d.p.x - (W / 2)) * 0.02;
      if (sc > bestScore) { bestScore = sc; best = dv; }
    }
    if (best) {
      if (best[0] < 0) hold(inp, 'left'); else if (best[0] > 0) hold(inp, 'right');
      if (best[1] < 0) hold(inp, 'up'); else if (best[1] > 0) hold(inp, 'down');
    }
  },
  summary(s) { return 'got=' + s.data.got + '/time=' + s.data.elapsed.toFixed(1); }
};

/* ============================================================
   10) 编钟：读谱面，按顺序点钟
   ============================================================ */
function simonRect(i) { return { x: 36 + i * 66, y: 84, w: 48, h: 70 }; }
const botSimon = {
  init() { return {}; },
  act(s, inp) {
    const d = s.data;
    if (d.phase !== 'input' || s.done) return;
    const bell = d.seq[d.inputIdx];
    if (bell == null) return;
    const r = simonRect(bell);
    clickAt(inp, r.x + r.w / 2, r.y + r.h / 2);
  },
  summary(s) { return 'round=' + s.data.round + '/mist=' + s.data.mistakes; }
};

/* ============================================================
   11) 泡泡消除：121 个角度各模拟一次落点，挑消除最多的
   ============================================================ */
function bubX(d, r, c) { return d.bx + c * d.d + ((r & 1) ? d.r : 0); }
function bubY(d, r) { return d.by + r * d.rowH; }
function bubIdx(d, r, c) { return r * d.cols + c; }
function bubNb(d, r, c) {
  const out = [];
  if (c > 0) out.push([r, c - 1]);
  if (c < d.cols - 1) out.push([r, c + 1]);
  const odd = r & 1;
  const cand = odd ? [[r - 1, c], [r - 1, c + 1], [r + 1, c], [r + 1, c + 1]]
    : [[r - 1, c - 1], [r - 1, c], [r + 1, c - 1], [r + 1, c]];
  for (const p of cand) if (p[0] >= 0 && p[0] < d.rows && p[1] >= 0 && p[1] < d.cols) out.push(p);
  return out;
}
function bubSnapSim(d, grid, px, py, hitR, hitC, color) {
  const cands = [];
  if (hitR >= 0) for (const p of bubNb(d, hitR, hitC)) if (grid[bubIdx(d, p[0], p[1])] < 0) cands.push(p);
  if (!cands.length) for (let r = 0; r < d.rows; r++) for (let c = 0; c < d.cols; c++)
    if (grid[bubIdx(d, r, c)] < 0) cands.push([r, c]);
  let best = null, bd = 1e9;
  for (const p of cands) {
    const dx = bubX(d, p[0], p[1]) - px, dy = bubY(d, p[0]) - py;
    const dd = dx * dx + dy * dy;
    if (dd < bd) { bd = dd; best = p; }
  }
  if (!best) return { miss: true };
  const r = best[0], c = best[1];
  grid[bubIdx(d, r, c)] = color;
  if (r >= d.dangerRow) { grid[bubIdx(d, r, c)] = -1; return { popped: 0, dropped: 0, row: r, fail: true }; }
  const col = grid[bubIdx(d, r, c)];
  const seen = new Set(), stack = [[r, c]], cl = [];
  while (stack.length) {
    const p = stack.pop(), k = bubIdx(d, p[0], p[1]);
    if (seen.has(k) || grid[k] !== col) continue;
    seen.add(k); cl.push(p);
    for (const q of bubNb(d, p[0], p[1])) stack.push(q);
  }
  let popped = 0, dropped = 0;
  if (cl.length >= 3) {
    for (const p of cl) grid[bubIdx(d, p[0], p[1])] = -1;
    popped = cl.length;
    const conn = new Set(), q = [];
    for (let cc = 0; cc < d.cols; cc++) {
      const k = bubIdx(d, 0, cc);
      if (grid[k] >= 0) { conn.add(k); q.push([0, cc]); }
    }
    while (q.length) {
      const p = q.pop();
      for (const o of bubNb(d, p[0], p[1])) {
        const k = bubIdx(d, o[0], o[1]);
        if (grid[k] >= 0 && !conn.has(k)) { conn.add(k); q.push(o); }
      }
    }
    for (let rr = 0; rr < d.rows; rr++) for (let cc = 0; cc < d.cols; cc++) {
      const k = bubIdx(d, rr, cc);
      if (grid[k] >= 0 && !conn.has(k)) { grid[k] = -1; dropped++; }
    }
  }
  return { popped: popped, dropped: dropped, row: r, fail: false };
}
function bubSimShot(d, angle, color) {
  const grid = d.grid.slice();
  let x = d.shooter.x, y = d.shooter.y - 10, vx = Math.sin(angle) * 330, vy = -Math.cos(angle) * 330;
  for (let step = 0; step < 2600; step++) {
    const h = 1 / 240;
    x += vx * h; y += vy * h;
    const left = d.bx - d.r, right = d.bx + (d.cols - 1) * d.d + d.r;
    if (x < left) { x = left; vx = Math.abs(vx); }
    if (x > right) { x = right; vx = -Math.abs(vx); }
    if (y <= d.top + d.r) return bubSnapSim(d, grid, x, d.top + d.r, -1, 0, color);
    let hit = null;
    for (let r = 0; r < d.rows && !hit; r++) for (let c = 0; c < d.cols; c++) {
      if (grid[bubIdx(d, r, c)] < 0) continue;
      if (Math.hypot(bubX(d, r, c) - x, bubY(d, r) - y) < d.r * 2 - 2) { hit = [r, c]; break; }
    }
    if (hit) return bubSnapSim(d, grid, x, y, hit[0], hit[1], color);
    if (y > 210) return { miss: true };
  }
  return { miss: true };
}
function bubEval(d, res, color) {
  if (!res || res.miss) return -1e6;
  if (res.fail) return -5000;
  let count = 0, maxRow = 0;
  for (let r = 0; r < d.rows; r++) for (let c = 0; c < d.cols; c++) {
    if (d.grid[bubIdx(d, r, c)] >= 0) { count++; maxRow = Math.max(maxRow, r); }
  }
  // 模拟后的局面直接算：重跑一次拿剩余数量
  // bubSimShot 返回的 grid 没带出来，这里用 popped/dropped 近似 + 局面高度
  let sc = res.popped * 30 + res.dropped * 45;
  if (res.popped >= 3) sc += 25;
  sc -= res.row * 6;
  return sc;
}
const botBubble = {
  init() { return {}; },
  act(s, inp) {
    const d = s.data;
    if (d.shot || s.done) return;
    const color = d.cur;
    let bestA = 0, bestS = -1e18;
    for (let i = 0; i <= 120; i++) {
      const a = -1.15 + (i / 120) * 2.3;
      const res = bubSimShot(d, a, color);
      let sc = bubEval(d, res, color);
      // 同色堆叠奖励：落点附近有同色球时更容易凑三连
      if (res && !res.miss && !res.fail) {
        sc -= Math.abs(a - d.angle) * 0.8;
      }
      if (sc > bestS) { bestS = sc; bestA = a; }
    }
    // 用鼠标瞄准（与玩家操作同口径），而不是直接改 d.angle
    clickAt(inp, d.shooter.x + Math.sin(bestA) * 100, d.shooter.y - Math.cos(bestA) * 100);
  },
  summary(s) { return 'pops=' + s.data.pops + '/' + s.data.quota + ' shots=' + s.data.shots; }
};

/* ============================================================
   12) 迷宫追逃：BFS 追灵符，鬼差近身则先拉开
   ============================================================ */
function mazeBFSPath(d, from, to) {
  const q = [{ p: from, path: [] }];
  const seen = new Set([from.x + ',' + from.y]);
  for (let qi = 0; qi < q.length; qi++) {
    const cur = q[qi];
    if (cur.p.x === to.x && cur.p.y === to.y) return cur.path;
    for (const v of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = cur.p.x + v[0], ny = cur.p.y + v[1];
      const k = nx + ',' + ny;
      if (d.walls.has(ny + ',' + nx) || seen.has(k)) continue;
      seen.add(k);
      q.push({ p: { x: nx, y: ny }, path: cur.path.concat([{ x: nx, y: ny }]) });
    }
  }
  return null;
}
// 图距离场：从 (sx,sy) 出发对所有可走格做 BFS（迷宫内曼哈顿距离会被墙骗，必须用图距）
function mazeDistField(d, sx, sy) {
  const dist = new Array(d.cols * d.rows).fill(-1);
  const q = [[sx, sy]];
  dist[sy * d.cols + sx] = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const p = q[qi], base = dist[p[1] * d.cols + p[0]];
    for (const v of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = p[0] + v[0], ny = p[1] + v[1];
      if (nx < 0 || ny < 0 || nx >= d.cols || ny >= d.rows) continue;
      if (d.walls.has(ny + ',' + nx)) continue;
      const k = ny * d.cols + nx;
      if (dist[k] >= 0) continue;
      dist[k] = base + 1; q.push([nx, ny]);
    }
  }
  return dist;
}
function mazeDegree(d, x, y) {
  let n = 0;
  for (const v of [[0, -1], [0, 1], [-1, 0], [1, 0]])
    if (!d.walls.has((y + v[1]) + ',' + (x + v[0]))) n++;
  return n;
}
// 时间余量：沿路径第 k 步（玩家每步约 0.15s）到达时，最近的鬼差还要 graphDist*rate 秒才到。
// 余量 = 鬼到该格的时间 - 玩家到该格的时间；<0 表示鬼差会先到（或已在该格），路径判死。
const MAZE_PT = 0.15;
function mazeSlack(d, path, fields) {
  let m = 1e9, worst = -1;
  for (let k = 0; k < path.length; k++) {
    const idx = path[k].y * d.cols + path[k].x;
    let gd = 99;
    for (const f of fields) if (f[idx] >= 0 && f[idx] < gd) gd = f[idx];
    const sl = gd * d.rate - (k + 1) * MAZE_PT;
    if (sl < m) { m = sl; worst = k; }
  }
  return { slack: m, at: worst };
}
const botMaze = {
  init() { return { frozen: false, tgt: null, esc: null, escLeft: 0 }; },
  act(s, inp, ctx) {
    const d = s.data;
    if (d.freeze > 0 && !ctx.data.frozen && process.env.REACH_DEBUG) {
      console.log('  [maze-debug] caught at', ctx.data.lastP, 'got=' + d.got + ' t=' + (ctx.frames / 60).toFixed(1) +
        ' ghosts=' + (ctx.data.lastG || '') + ' esc=' + JSON.stringify(ctx.data.esc));
    }
    ctx.data.frozen = d.freeze > 0;
    if (d.freeze > 0) { ctx.data.esc = null; ctx.data.escLeft = 0; return; }
    if (s.done) return;
    if (d.cd > 0) return; // 等冷却，不和鬼差抢帧
    ctx.data.lastP = { x: d.player.x, y: d.player.y };
    ctx.data.lastG = d.ghosts.map(g => g.x + ',' + g.y).join(' ');
    const ghosts = d.ghosts.map(g => ({ x: g.x, y: g.y }));
    const fields = ghosts.map(g => mazeDistField(d, g.x, g.y));
    const pIdx = d.player.y * d.cols + d.player.x;
    const gmin = Math.min.apply(null, fields.map(f => f[pIdx] < 0 ? 99 : f[pIdx]));
    if (process.env.REACH_DEBUG && (ctx.frames % 60 === 0)) {
      console.log('  [maze] t=' + (ctx.frames / 60).toFixed(1) + ' p=' + d.player.x + ',' + d.player.y +
        ' g=' + ghosts.map(g => g.x + ',' + g.y).join(' ') + ' got=' + d.got + '/' + d.total + ' gmin=' + gmin);
    }
    const dangerous = (c) => ghosts.some(g => g.x === c.x && g.y === c.y);
    // 目标：剩余灵符（或鬼门）。按整条路径的最差时间余量选，余量相同时取短路径。
    // 用 ctx.data.tgt 做滞后，避免两个目标来回抖。
    let target = null, tgtSlack = -1e9;
    if (d.talismans.size) {
      let cands = [];
      for (const k of d.talismans) {
        const p = k.split(','), tp = { x: +p[1], y: +p[0] };
        const path = mazeBFSPath(d, d.player, tp);
        if (!path) continue;
        cands.push({ key: k, path: path, sl: mazeSlack(d, path, fields).slack });
      }
      if (cands.length) {
        const cur = cands.find(c => c.key === ctx.data.tgt);
        let best = null;
        for (const c of cands) if (!best || c.sl > best.sl + 1e-6) best = c;
        // 滞后：原目标余量只要不比最佳差 1.2s 以上就继续追
        if (cur && cur.sl > best.sl - 1.2) best = cur;
        ctx.data.tgt = best.key;
        target = best.path; tgtSlack = best.sl;
      }
    } else if (d.open) {
      target = mazeBFSPath(d, d.player, d.exit);
      if (target) tgtSlack = mazeSlack(d, target, fields).slack;
    }
    let step = target && target.length ? target[0] : null;
    // 逃生：只在鬼差贴脸（图距≤3）或下一步就是鬼时启用；一旦启用就沿选定路线连续跑，
    // 不在两个几乎同分的格子之间来回抖（抖动是此前被夹死的主因）。
    const needEsc = gmin <= 3 || (step && dangerous(step));
    if (!needEsc) ctx.data.escPath = null;
    if (needEsc) {
      let path = ctx.data.escPath;
      if (path && path.length && dangerous(path[0])) path = ctx.data.escPath = null;
      if (!path || !path.length) {
        // 找「路径时间余量最大」的远点：先按静态余量粗排，再逐条算整条路径的余量
        let best = null, bScore = -1e9, bPath = null;
        const pf = mazeDistField(d, d.player.x, d.player.y);
        const raw = [];
        for (let y = 1; y < d.rows - 1; y++) for (let x = 1; x < d.cols - 1; x++) {
          const k = y * d.cols + x;
          if (d.walls.has(y + ',' + x) || pf[k] < 3) continue; // 至少要跑出 3 格
          const gm = Math.min.apply(null, fields.map(f => f[k] < 0 ? 99 : f[k]));
          raw.push({ x: x, y: y, gm: gm, pd: pf[k] });
        }
        raw.sort((a, b) => (b.gm - b.pd * 0.15) - (a.gm - a.pd * 0.15));
        for (const c of raw.slice(0, 36)) {
          if (mazeDegree(d, c.x, c.y) <= 1) continue; // 死胡同不躲
          const p = mazeBFSPath(d, d.player, c);
          if (!p) continue;
          const sl = mazeSlack(d, p, fields).slack;
          let sc = sl * 10 + Math.min(c.gm, 10) * 0.8 - c.pd * 0.1;
          if (mazeDegree(d, c.x, c.y) >= 3) sc += 0.5;
          if (d.talismans.has(c.y + ',' + c.x)) sc += 2.5; // 顺路摸灵符
          if (sc > bScore) { bScore = sc; best = c; bPath = p; }
        }
        if (bPath && bPath.length) {
          ctx.data.escPath = path = bPath.slice();
          if (process.env.REACH_DEBUG) console.log('  [maze-esc] p=' + d.player.x + ',' + d.player.y + ' -> ' + best.x + ',' + best.y + ' len=' + bPath.length + ' slack=' + (bScore / 10).toFixed(2) + ' gmin=' + gmin);
        }
      }
      if (path && path.length) step = path[0];
    }
    if (step && !dangerous(step) && ctx.data.escPath && ctx.data.escPath.length && ctx.data.escPath[0].x === step.x && ctx.data.escPath[0].y === step.y)
      ctx.data.escPath.shift();
    if (!step) return;
    const dx = step.x - d.player.x, dy = step.y - d.player.y;
    if (dx < 0) hit(inp, 'left'); else if (dx > 0) hit(inp, 'right');
    if (dy < 0) hit(inp, 'up'); else if (dy > 0) hit(inp, 'down');
  },
  summary(s) { return 'got=' + s.data.got + '/open=' + s.data.open; }
};

/* ============================================================
   13) 垂直攀跃：追下一块更高的浮石
   ============================================================ */
const botJumper = {
  init() { return {}; },
  act(s, inp) {
    const d = s.data;
    if (s.done) return;
    // 1.5s 物理前瞻：左/中/右三种按住方式的真实重力+落台模拟，选落点最高的那块。
    // 相比「追最近平台」不会在空中来回换目标导致左右抖。
    const simulate = (dir) => {
      let px = d.p.x, py = d.p.y, vy = d.p.vy;
      const step = 1 / 60;
      for (let f = 0; f < 90; f++) {
        px += dir * 132 * step;
        if (px < -10) px = W + 10;
        if (px > W + 10) px = -10;
        const prevBottom = py + d.p.h;
        vy += 800 * step;
        py += vy * step;
        const bottom = py + d.p.h;
        if (vy > 0) {
          for (const pl of d.plats) {
            if (prevBottom <= pl.y + 2 && bottom >= pl.y &&
                px + d.p.w / 2 >= pl.x - 5 && px + d.p.w / 2 <= pl.x + pl.w + 5) {
              return { y: pl.y, pl: pl };
            }
          }
        }
        if (py + d.p.h >= d.lavaY || py > d.camY + 226) return null;
      }
      return null;
    };
    let bestDir = 0, bestSc = -1e18;
    for (const dir of [0, -1, 1]) {
      const r = simulate(dir);
      // 落点越高（y 越小）越好；能落地就远胜落空；贴着当前脚下回弹的平台也给分。
      const sc = r ? (-r.y * 10 + (r.pl.move ? -4 : 0)) : -1e9;
      if (sc > bestSc + 1e-6) { bestSc = sc; bestDir = dir; }
    }
    if (bestDir < 0) hold(inp, 'left'); else if (bestDir > 0) hold(inp, 'right');
  },
  summary(s) { return 'maxH=' + Math.round(s.data.maxH); }
};

/* ============================================================
   14) 打砖块：预测落点，挡板偏移把球打向剩余砖块
   ============================================================ */
const botBreakout = {
  init() { return {}; },
  act(s, inp) {
    const d = s.data;
    const b = d.ball, p = d.paddle;
    if (b.stuck) { inp.attackHit = true; inp.mx = p.x + p.w / 2; return; }
    const minX = 8 + b.r, maxX = W - 8 - b.r;
    // 1) 把「来球」向前模拟到挡板平面，拿到真实接球点（含左右墙反射）
    let cx = b.x, cy = b.y, vx = b.vx, vy = b.vy;
    if (vy > 0) {
      for (let i = 0; i < 4000 && cy < p.y - b.r; i++) {
        const h = 1 / 240;
        cx += vx * h; cy += vy * h;
        if (cx < minX) { cx = minX; vx = Math.abs(vx); }
        if (cx > maxX) { cx = maxX; vx = -Math.abs(vx); }
      }
    }
    // 2) 枚举挡板接触偏移 rel，模拟出射后第一块被撞的砖，选能命中的角度
    const alive = d.bricks.filter(br => !br.dead);
    const simOut = (rel) => {
      const ang = -Math.PI / 2 + rel * 1.02;
      let x = cx, y = p.y - b.r, ux = Math.cos(ang) * d.speed, uy = Math.sin(ang) * d.speed;
      let hits = 0, first = null;
      for (let i = 0; i < 8000; i++) {
        const h = 1 / 240;
        const px = x, py = y;
        x += ux * h; y += uy * h;
        if (x < minX) { x = minX; ux = Math.abs(ux); }
        if (x > maxX) { x = maxX; ux = -Math.abs(ux); }
        if (y - b.r < 36) { y = 36 + b.r; uy = Math.abs(uy); }
        for (const br of alive) {
          if (x + b.r < br.x || x - b.r > br.x + br.w || y + b.r < br.y || y - b.r > br.y + br.h) continue;
          // 命中：按来向翻转主轴（与 breakoutHitBrick 同口径），记数后继续
          if (py + b.r <= br.y || y < py) uy = -Math.abs(uy);
          else if (py - b.r >= br.y + br.h) uy = Math.abs(uy);
          else if (px + b.r <= br.x) ux = -Math.abs(ux);
          else if (px - b.r >= br.x + br.w) ux = Math.abs(ux);
          else uy = -uy;
          hits++;
          if (!first) first = br;
          if (hits >= 2) return { hits: hits, first: first };
          break;
        }
        if (y - b.r > p.y + 4) break;
      }
      return { hits: hits, first: first };
    };
    let bestRel = 0, bestSc = -1e9;
    for (let i = -10; i <= 10; i++) {
      const rel = i / 10;
      const r = simOut(rel);
      let sc = r.hits * 100;
      if (r.first) sc += 40 - r.first.y * 0.02; // 优先先啃下方砖，减少回程遮挡
      if (sc > bestSc) { bestSc = sc; bestRel = rel; }
    }
    if (bestSc > 0) {
      const targetCenter = cx - bestRel * (p.w / 2);
      inp.mx = clamp(targetCenter, 8 + p.w / 2, W - 8 - p.w / 2);
      return;
    }
    // 3) 兜底：打不到砖时先接住球，偏向剩余砖块一侧
    let target = null, bd = 1e9;
    for (const br of alive) {
      const bx = br.x + br.w / 2;
      const dd = Math.abs(bx - cx) + Math.abs(br.y - b.y) * 0.15;
      if (dd < bd) { bd = dd; target = br; }
    }
    let off = 0;
    if (target && vy > 0) off = (target.x + target.w / 2 < cx ? -0.62 : 0.62) * (p.w / 2);
    inp.mx = clamp(cx - off, 8 + p.w / 2, W - 8 - p.w / 2);
  },
  summary(s) { return 'left=' + s.data.bricks.filter(b => !b.dead).length + '/hearts=' + s.hearts; }
};

/* ============================================================
   15) 幽冥炮台（v30 · L19）：只打鬼火/金火，避开魂雷；转到射线干净再开炮
   ============================================================ */
const botCannon = {
  init() { return {}; },
  act(s, inp) {
    const d = s.data;
    if (s.done) return;
    let best = null, bestDiff = 1e9, bestTol = 0;
    for (const t of d.targets) {
      if (t.kind === 'bomb') continue;
      const ang = Math.atan2(t.y - d.cy, t.x - d.cx);
      if (ang < -Math.PI + 0.28 || ang > -0.28) continue;
      const dx = Math.cos(ang), dy = Math.sin(ang);
      const dist = Math.hypot(t.x - d.cx, t.y - d.cy);
      let blocked = false, nearest = 1e9;
      for (const o of d.targets) {
        const rx = o.x - d.cx, ry = o.y - d.cy;
        const proj = rx * dx + ry * dy;
        if (proj <= 4 || proj > 300) continue;
        const perp = Math.abs(rx * dy - ry * dx);
        if (perp <= o.r + 3 && proj < nearest) { nearest = proj; blocked = o.kind === 'bomb'; }
      }
      if (blocked) continue;
      let diff = ang - d.ang;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const tol = Math.min(0.10, Math.atan2(t.r + 2, Math.max(20, dist)));
      if (Math.abs(diff) < bestDiff) { bestDiff = Math.abs(diff); best = diff; bestTol = tol; }
    }
    if (best === null) return;
    if (bestDiff > 0.02) { hold(inp, best > 0 ? 'right' : 'left'); return; }
    if (d.cd <= 0) hit(inp, 'attack');
  },
  summary(s) { return 'hits=' + s.data.hits + '/coin=' + game.coins; }
};

/* ============================================================
   16) 回响节拍（v30 · L22）：缩环进入金环窗口时敲响
   ============================================================ */
const botRhythm = {
  init() { return {}; },
  act(s, inp) {
    const d = s.data;
    if (s.done || d.beat >= d.beats) return;
    const r = 64 * (1 - clamp(d.bt / d.interval, 0, 1));
    if (!d.beatHit && r >= 7 && r <= 26) hit(inp, 'attack');
  },
  summary(s) { return 'hits=' + s.data.hits + '/' + s.data.beats + ' combo=' + s.data.best; }
};

/* ============================================================
   主流程
   ============================================================ */
const BOTS = {
  0: botMine, 1: botMole, 2: botLights, 3: botMemory, 4: botSokoban, 5: botSnake,
  7: botGold, 8: botTetris, 9: botDodge, 10: botSimon, 11: botBubble, 13: botMaze,
  14: botJumper, 16: botBreakout, 18: botCannon, 21: botRhythm,
  24: botGold, 28: botDodge
};
const NAMES = {
  0: '动作扫雷', 1: '打地鼠', 2: '点灯', 3: '记忆翻牌', 4: '推箱子', 5: '贪吃蛇',
  7: '矿脉寻宝', 8: '落块筑墙', 9: '弹幕生存', 10: '编钟', 11: '泡泡消除', 13: '迷宫追逃',
  14: '垂直攀跃', 16: '打砖块', 18: '幽冥炮台', 21: '回响节拍',
  24: '喉中拾遗', 28: '镜海流星'
};
let pass = 0, fail = 0;
function ok(cond, msg, extra) {
  if (cond) { pass++; console.log('  PASS ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? '   [' + extra + ']' : '')); }
}

console.log('v29 街机关可达性（真实输入，种子 ' + SEEDS.join('/') + '）');
for (const idx of NONBOSS) {
  const bot = BOTS[idx], name = NAMES[idx], st = A.stages[idx];
  ok(!!bot, 'L' + (idx + 1) + ' ' + (name || '?') + ' 有可达性机器人');
  if (!bot) continue;
  let allWin = true, times = [], detail = [];
  for (const seed of SEEDS) {
    const r = runBot(idx, bot, seed, { needSettle: true, summary: true });
    allWin = allWin && r.ok;
    times.push(r.time.toFixed(1));
    detail.push('s' + seed + ':' + (r.won ? 'WIN' : 'LOSE') + ' ' + r.time.toFixed(1) + 's/' +
      r.summary + (r.err ? ' ERR ' + r.err.split('\n')[0] : ''));
  }
  ok(allWin, 'L' + (idx + 1) + ' ' + name + ' 三个种子均自然通关（限时 ' + st.limit + 's）', detail.join(' | '));
  if (process.env.REACH_VERBOSE) console.log('    L' + (idx + 1) + ' ' + name + ' 用时 ' + times.join('/') + 's（限时 ' + st.limit + 's）');
  // 空输入负例：25 秒内不能自己赢
  let idleWin = false, idleTime = 0, idleDone = false;
  for (const seed of SEEDS) {
    const r = runIdle(idx, 25);
    idleWin = idleWin || r.won; idleTime = Math.max(idleTime, r.time); idleDone = idleDone || r.done;
  }
  ok(!idleWin, 'L' + (idx + 1) + ' ' + name + ' 空输入不会自动通关', 'idle ' + idleTime.toFixed(1) + 's done=' + idleDone);
}
console.log('\nRESULT ' + (fail ? 'FAIL' : 'PASS') + '  pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
