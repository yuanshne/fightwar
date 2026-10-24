/* ============================================================
   engine.js —— 《像素勇者 Pixel Quest》引擎模块
   ------------------------------------------------------------------
   本文件职责（契约第 3 节）：
     1. PHY 物理常量表；
     2. Level 类：解析 LEVELS[idx] —— 实体提取（实体字符换'.'，瓦片字符保留）、
        门分组（相邻 D 连通分量）、电锯轨道扫描（左右/上下各 ≤7 格遇实心停）、
        装饰物确定性摆放（seed=99+idx*17）、totalCoin 统计；
        提供 tileAt / solid 瓦片语义；
     3. game 世界状态（含 input 与 sfxQueue）；
     4. loadLevel / respawn / killPlayer / levelClear / updateWorld。
   硬性约束（契约第 0 节）：
     - 普通 script 文件：无 import/export；顶层只做声明，
       顶层零 DOM / 零音频 / 零键盘（node 门禁会在无 DOM 环境执行本文件）；
     - 不 draw；音效只 push 到 game.sfxQueue；输入只读 game.input；
     - 内部辅助符号一律 _eng 前缀并注明「内部」，不新增契约外全局符号，
       _eng 前缀同时避免与 art/levels 模块的内部符号在全局作用域撞名。
   ============================================================ */

/* ==================== 内部工具（内部） ==================== */
const _engTile = 16;              // 内部：瓦片像素边长
const _engVW = 384, _engVH = 224; // 内部：内部分辨率（相机钳制用）
const _engEps = 0.01;             // 内部：AABB 右/下缘取整前的回退量（恰好压线不算重叠）
const _engDecorFallback = {       // 内部：THEMES 桩（门禁环境）无 decor 字段时的兜底装饰表
  grass: ['bush', 'flower', 'mushroom'], cave: ['crystal', 'mushroom'],
  sky: ['cloudpot', 'flower'], factory: ['gear', 'chain'],
  lava: ['torch', 'skull'], tower: ['torch', 'crystal']
};
function _engClamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function _engSign(v) { return v < 0 ? -1 : v > 0 ? 1 : 0; }
function _engAabb(a, b) { // a/b 均为 {x,y,w,h}
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function _engMulberry(seed) { // 内部：种子随机（装饰摆放必须确定性）
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function _engAddParts(x, y, n, color, spd, grav) { // 内部：粒子（game.parts 为引擎自有状态，ui 只读渲染）
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, s = spd * (0.3 + Math.random() * 0.7);
    game.parts.push({
      x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - spd * 0.3,
      life: 0.5 + Math.random() * 0.4, color: color || '#ffffff',
      size: 1 + Math.random() * 2, grav: grav === undefined ? 300 : grav
    });
  }
}
function _engRectTiles(L, rx, ry, rw, rh, cb) { // 内部：遍历矩形覆盖到的瓦片，回调 cb(tx,ty,ch)
  const x0 = Math.floor(rx / _engTile), x1 = Math.floor((rx + rw - _engEps) / _engTile);
  const y0 = Math.floor(ry / _engTile), y1 = Math.floor((ry + rh - _engEps) / _engTile);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) cb(tx, ty, L.tileAt(tx, ty));
}

/* ==================== 物理常量（契约导出；键名固定，数值可 ±15%） ==================== */
const PHY = {
  grav: 1500, maxFall: 360, acc: 1400, fric: 1800, fricIce: 180,
  maxRun: 120, jumpV: 330, springV: 520, coyote: 0.09, buffer: 0.11
};

/* ==================== Level 关卡解析（契约导出） ==================== */
class Level {
  constructor(idx) {
    const meta = LEVELS[idx];
    if (!meta) throw new Error('Level 不存在: ' + idx);
    this.idx = idx;
    this.meta = meta;
    // 主题对象：门禁桩环境下 THEMES[theme] 为空对象，字段访问处均有兜底
    this.theme = (typeof THEMES !== 'undefined' && THEMES && THEMES[meta.theme]) || {};

    // 网格构建：LG 来自 levels.js（加载顺序保证先于本文件）
    const lg = new LG(meta.w, meta.h);
    const ret = meta.build(lg);
    const grid = (ret && ret.g) ? ret : lg;
    this.tiles = grid.g;
    // w/h/tw/th 均为网格尺寸（瓦片数）；tileAt 的越界判定使用 w/h（契约明确 y≥h 返回'.'）。
    // 像素尺寸 = 值 × 16。
    this.w = meta.w; this.h = meta.h;
    this.tw = meta.w; this.th = meta.h;

    /* ---------- 实体提取：实体字符从网格换成'.'，瓦片字符保留 ---------- */
    this.coins = []; this.enemies = []; this.plats = []; this.saws = [];
    this.cannons = []; this.springs = []; this.levers = []; this.checkpoints = [];
    this.crumbles = new Map(); this.doors = new Map();
    this.spawn = { x: 32, y: 32 }; this.goal = null;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const ch = this.tiles[y][x];
        const px = x * _engTile, py = y * _engTile;
        // 确定性动画相位（代替旧文件的 Math.random，保证门禁/重放一致）
        const phase = (x * 0.7 + y * 1.3) % 6.283;
        switch (ch) {
          case '@': this.spawn = { x: px + 3, y: py + 2 }; this.tiles[y][x] = '.'; break;
          case 'P': this.goal = { x: px, y: py - 16, w: 16, h: 32 }; this.tiles[y][x] = '.'; break;
          case 'o': this.coins.push({ x: px + 4, y: py + 4, w: 8, h: 8, got: false, t: phase }); this.tiles[y][x] = '.'; break;
          case '*': this.coins.push({ x: px + 4, y: py + 3, w: 8, h: 10, got: false, gem: true, t: phase }); this.tiles[y][x] = '.'; break;
          case 'K': this.coins.push({ x: px + 3, y: py + 5, w: 10, h: 6, got: false, key: true, t: 0 }); this.tiles[y][x] = '.'; break;
          case 'W': // 史莱姆：巡逻，可踩踏
            this.enemies.push({ type: 'slime', x: px + 2, y: py + 6, w: 12, h: 10, vx: -28, vy: 0, hx: px + 2, hy: py + 6, dead: 0, t: phase, grounded: false });
            this.tiles[y][x] = '.'; break;
          case 'F': // 蝙蝠：水平巡逻 + 正弦浮动
            this.enemies.push({ type: 'bat', x: px + 2, y: py + 3, w: 12, h: 10, ax: px + 2, ay: py + 3, vx: 40, dead: 0, t: phase, rng: 44 });
            this.tiles[y][x] = '.'; break;
          case 'M': this.plats.push(this._mkPlat(px, py, 1)); this.tiles[y][x] = '.'; break;
          case 'V': this.plats.push(this._mkPlat(px, py, 0)); this.tiles[y][x] = '.'; break;
          case 'Z': // 横电锯（圆心在瓦片中心）
            this.saws.push({ x: px + 8, y: py + 8, r: 7.5, hz: 1, dir: 1, spd: 52, tx: x, ty: y, t: phase, minX: px, maxX: px });
            this.tiles[y][x] = '.'; break;
          case 'U': // 竖电锯
            this.saws.push({ x: px + 8, y: py + 8, r: 7.5, hz: 0, dir: 1, spd: 52, tx: x, ty: y, t: phase, minX: px, maxX: px });
            this.tiles[y][x] = '.'; break;
          case '<': this.cannons.push({ x: px, y: py, dir: -1, t: (x * 0.37) % 1.9, flash: 0 }); this.tiles[y][x] = '.'; break;
          case '>': this.cannons.push({ x: px, y: py, dir: 1, t: (x * 0.37) % 1.9, flash: 0 }); this.tiles[y][x] = '.'; break;
          case 'S': this.springs.push({ x: px + 2, y: py + 8, w: 12, h: 8, t: 0 }); this.tiles[y][x] = '.'; break;
          case 'L': this.levers.push({ x: px + 2, y: py + 2, w: 12, h: 14, cd: 0 }); this.tiles[y][x] = '.'; break;
          case 'c': this.checkpoints.push({ x: px, y: py - 8, w: 16, h: 24, on: false }); this.tiles[y][x] = '.'; break;
          case 'C': this.crumbles.set(x + ',' + y, { x: x, y: y, state: 0, t: 0, dy: 0, dvy: 0 }); break; // 0稳 1抖 2落 3无
          case 'D': this.doors.set(x + ',' + y, { x: x, y: y }); break;
        }
      }
    }

    /* ---------- 门分组：相邻（4 向）D 的连通分量 ---------- */
    this.doorGroups = [];
    const seen = new Set();
    for (const k of this.doors.keys()) {
      if (seen.has(k)) continue;
      const grp = [], q = [k];
      seen.add(k);
      while (q.length) {
        const cur = q.pop();
        grp.push(cur);
        const ci = cur.indexOf(',');
        const cx = +cur.slice(0, ci), cy = +cur.slice(ci + 1);
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (let i = 0; i < 4; i++) {
          const nk = (cx + nb[i][0]) + ',' + (cy + nb[i][1]);
          if (this.doors.has(nk) && !seen.has(nk)) { seen.add(nk); q.push(nk); }
        }
      }
      this.doorGroups.push(grp);
    }

    /* ---------- 电锯轨道扫描：左右/上下各扫 ≤7 格，遇实心停 ---------- */
    for (const s of this.saws) {
      let l = 0, r = 0;
      if (s.hz) {
        while (l < 7 && !this._railSolid(s.tx - 1 - l, s.ty)) l++;
        while (r < 7 && !this._railSolid(s.tx + 1 + r, s.ty)) r++;
        s.minX = (s.tx - l) * _engTile + 10;
        s.maxX = (s.tx + r) * _engTile + 6;
        if (s.minX > s.maxX) { s.minX = s.x; s.maxX = s.x; } // 两侧皆堵：原位自旋
      } else {
        while (l < 7 && !this._railSolid(s.tx, s.ty - 1 - l)) l++;
        while (r < 7 && !this._railSolid(s.tx, s.ty + 1 + r)) r++;
        s.minY = (s.ty - l) * _engTile + 10;
        s.maxY = (s.ty + r) * _engTile + 6;
        if (s.minY > s.maxY) { s.minY = s.y; s.maxY = s.y; }
      }
    }

    /* ---------- 装饰物：seed=99+idx*17 的确定性随机，贴在实心砖顶面 ---------- */
    this.decor = [];
    const rnd = _engMulberry(99 + idx * 17);
    const dset = (this.theme && this.theme.decor && this.theme.decor.length)
      ? this.theme.decor : (_engDecorFallback[meta.theme] || ['bush']);
    for (let y = 1; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.tiles[y][x] === '#' && this.tiles[y - 1][x] === '.' && rnd() < 0.16) {
          this.decor.push({
            x: x * _engTile + (rnd() * 8 | 0), y: y * _engTile,
            type: dset[(rnd() * dset.length) | 0], f: (rnd() * 2) | 0
          });
        }
      }
    }

    this.totalCoin = this.coins.reduce((a, c) => a + (c.key ? 0 : (c.gem ? 5 : 1)), 0);
    this.par = meta.par;
  }

  _mkPlat(px, py, hz) { // 内部（类成员）：移动平台实体 48×8
    return {
      x: px, y: py, w: 48, h: 8, hz: hz, dir: 1, spd: 36,
      minX: px - 56, maxX: px + 56, minY: py - 48, maxY: py + 48,
      dx: 0, dy: 0
    };
  }

  _railSolid(tx, ty) { // 内部（类成员）：电锯轨道的「实心」语义（构造期恒实的瓦片）
    const ch = this.tileAt(tx, ty);
    return ch === '#' || ch === 'I' || ch === 'a' || ch === 'b' || ch === 'D' || ch === 'C';
  }

  tileAt(tx, ty) { // 越界规则：x 方向返回'#'（左右墙），y<0 与 y≥h 返回'.'
    if (tx < 0 || tx >= this.w) return '#';
    if (ty < 0 || ty >= this.h) return '.';
    return this.tiles[ty][tx];
  }

  solid(tx, ty, switchState) { // '#'/'I' 恒实；a/b 随全局开关；D 未开门时实；C 崩塌态<2 时实
    const ch = this.tileAt(tx, ty);
    if (ch === '#' || ch === 'I') return true;
    if (ch === 'a') return switchState === 0;
    if (ch === 'b') return switchState === 1;
    if (ch === 'D') return this.doors.has(tx + ',' + ty);
    if (ch === 'C') { const c = this.crumbles.get(tx + ',' + ty); return !!c && c.state < 2; }
    return false;
  }
}

/* ==================== 游戏世界状态（契约导出） ==================== */
const game = {
  state: 'title', levelIdx: 0, level: null, player: null,
  cam: { x: 0, y: 0 }, shake: 0,
  time: 0, deaths: 0, coins: 0, keys: 0, switchState: 0,
  bullets: [], parts: [], sfxQueue: [],
  respawnAt: null, clearT: 0,
  input: { left: 0, right: 0, jump: 0, jumpHit: 0 }, // ui 写入，engine 只读
  paused: false, tick: 0
};

/* ==================== 关卡装载 / 出生 / 死亡 / 通关 ==================== */
function _engMkPlayer(x, y) { // 内部：玩家对象（字段 = 契约清单）
  return {
    x: x, y: y, w: 10, h: 14, vx: 0, vy: 0, face: 1,
    onGround: false, coyote: 0, jbuf: 0, anim: 'idle', animT: 0,
    dead: false, deadT: 0, standOn: null, landT: 0
  };
}

function loadLevel(idx, keepStats) {
  game.levelIdx = idx;
  game.level = new Level(idx);
  const L = game.level;
  if (!keepStats) { game.time = 0; game.deaths = 0; game.coins = 0; game.keys = 0; game.switchState = 0; }
  game.bullets = []; game.parts = [];
  // respawnAt.p = 前进度量(x-y)：检查点「只进不退」的比较基准（横版 x 递增 / 纵版 y 递减均单调）
  game.respawnAt = { x: L.spawn.x, y: L.spawn.y, p: L.spawn.x - L.spawn.y };
  game.player = _engMkPlayer(L.spawn.x, L.spawn.y);
  game.cam.x = _engClamp(L.spawn.x + 5 - _engVW / 2, 0, Math.max(0, L.w * _engTile - _engVW));
  game.cam.y = _engClamp(L.spawn.y + 7 - _engVH / 2, 0, Math.max(0, L.h * _engTile - _engVH));
}

function respawn() { // 死亡序列终点：敌人复活重置、崩塌砖复位、子弹清空；钥匙/门/开关/已收金币保持
  const p = game.player, L = game.level;
  if (!p || !L || !game.respawnAt) return;
  p.x = game.respawnAt.x; p.y = game.respawnAt.y;
  p.vx = 0; p.vy = 0; p.dead = false; p.deadT = 0;
  p.standOn = null; p.onGround = false; p.coyote = 0; p.jbuf = 0;
  game.bullets = [];
  for (const e of L.enemies) {
    e.dead = 0;
    if (e.type === 'bat') { e.x = e.ax; e.y = e.ay; }
    else { e.x = e.hx; e.y = e.hy; e.vy = 0; e.grounded = false; }
  }
  for (const c of L.crumbles.values()) { c.state = 0; c.t = 0; c.dy = 0; c.dvy = 0; }
}

function killPlayer() {
  const p = game.player;
  if (!p || p.dead || game.state !== 'play') return;
  p.dead = true; p.deadT = 0;
  game.deaths++; game.shake = 6;
  game.sfxQueue.push('die'); // 音效只能入队，engine 不发声
  _engAddParts(p.x + 5, p.y + 7, 18, '#f08830', 120);
  _engAddParts(p.x + 5, p.y + 7, 10, '#f8d020', 90);
}

function levelClear() {
  if (game.state !== 'play') return;
  game.state = 'clear'; game.clearT = 0;
  game.sfxQueue.push('clear');
  const p = game.player;
  if (p) {
    const cols = ['#f8d020', '#48d8e8', '#f85888', '#58c848'];
    for (let i = 0; i < 40; i++) {
      _engAddParts(p.x + 5 + (Math.random() * 60 - 30), p.y - 20 - Math.random() * 40, 1, cols[i % 4], 90, 120);
    }
  }
  // 星级/解锁/存档由 ui 层负责，engine 不碰 localStorage
}

/* ==================== 内部判定辅助（内部） ==================== */
function _engPlayerInSolid(L) { // 内部：玩家矩形是否与实心瓦片重叠（平台挤压致死判定用）
  const p = game.player;
  let hit = false;
  _engRectTiles(L, p.x, p.y, p.w, p.h, function (tx, ty) {
    if (L.solid(tx, ty, game.switchState)) hit = true;
  });
  return hit;
}

function _engOnCrumble(p, c) { // 内部：玩家是否正踩在此崩塌砖顶面上
  if (!p.onGround) return false;
  const bx = c.x * _engTile, by = c.y * _engTile;
  return Math.abs(p.y + p.h - by) < 3 && p.x + p.w > bx && p.x < bx + _engTile;
}

/* ==================== 玩家物理（契约第 3 节算法 1/2/3/7） ==================== */
function _engUpdatePlayer(dt, L, p) {
  // 死亡冻结 0.9s 后重生（契约算法 12）
  if (p.dead) { p.deadT += dt; if (p.deadT >= 0.9) respawn(); return; }

  /* ---- 输入（只读 game.input） ---- */
  const dir = (game.input.right ? 1 : 0) - (game.input.left ? 1 : 0);

  // 站立地面材质：冰面低摩擦 / 传送带推力（脚下一行瓦片）
  let onIce = false, convL = false, convR = false;
  if (p.onGround) {
    const fy = Math.floor((p.y + p.h + 0.5) / _engTile);
    const fx0 = Math.floor(p.x / _engTile), fx1 = Math.floor((p.x + p.w - _engEps) / _engTile);
    for (let tx = fx0; tx <= fx1; tx++) {
      const ch = L.tileAt(tx, fy);
      if (ch === 'I') onIce = true;
      else if (ch === '(') convL = true;
      else if (ch === ')') convR = true;
    }
  }

  // 水平：加速 / 摩擦 / 限速（冰面用 fricIce）
  if (dir !== 0) { p.vx += dir * PHY.acc * dt; p.face = dir; }
  else {
    const s = _engSign(p.vx);
    p.vx -= s * (onIce ? PHY.fricIce : PHY.fric) * dt;
    if (_engSign(p.vx) !== s) p.vx = 0;
  }
  p.vx = _engClamp(p.vx, -PHY.maxRun, PHY.maxRun);
  if (p.onGround) { // 传送带：站上被推动（可叠加到跑速之上，上限 ±170）
    if (convL) p.vx = _engClamp(p.vx - 520 * dt, -170, 170);
    if (convR) p.vx = _engClamp(p.vx + 520 * dt, -170, 170);
  }

  // 跳跃：缓冲 + 土狼时间（契约算法 2）
  if (game.input.jumpHit) { p.jbuf = PHY.buffer; game.input.jumpHit = 0; } // 消费边沿触发
  p.jbuf -= dt; p.coyote -= dt;
  if (p.onGround) p.coyote = PHY.coyote;
  if (p.jbuf > 0 && p.coyote > 0) {
    p.vy = -PHY.jumpV; p.jbuf = 0; p.coyote = 0;
    p.onGround = false; p.standOn = null;
    game.sfxQueue.push('jump');
    _engAddParts(p.x + 5, p.y + 14, 4, (L.theme && L.theme.dust) || '#ffffff', 40, 200);
  }
  if (p.vy < 0 && !game.input.jump) p.vy *= 0.94; // 松开跳键：上升渐弱（每帧）
  p.vy = Math.min(p.vy + PHY.grav * dt, PHY.maxFall);

  // 移动平台载人：上一帧站其上 → 先随平台位移（契约算法 3）
  if (p.standOn) { p.x += p.standOn.dx; p.y += p.standOn.dy; }

  const wasFeet = p.y + p.h; // 本帧 Y 位移前脚底（单向平台判定基准）

  /* ---- X 轴（契约算法 1：先 X 后 Y） ---- */
  p.x += p.vx * dt;
  {
    const y0 = Math.floor(p.y / _engTile), y1 = Math.floor((p.y + p.h - _engEps) / _engTile);
    if (p.vx > 0) {
      const tx = Math.floor((p.x + p.w - _engEps) / _engTile); // 右缘所在列
      for (let ty = y0; ty <= y1; ty++) {
        if (L.solid(tx, ty, game.switchState)) { p.x = tx * _engTile - p.w; p.vx = 0; break; }
      }
    } else if (p.vx < 0) {
      const tx = Math.floor(p.x / _engTile); // 左缘所在列
      for (let ty = y0; ty <= y1; ty++) {
        if (L.solid(tx, ty, game.switchState)) { p.x = (tx + 1) * _engTile; p.vx = 0; break; }
      }
    }
  }

  /* ---- Y 轴 ---- */
  p.y += p.vy * dt;
  const wasGround = p.onGround;
  p.onGround = false;
  p.standOn = null;
  {
    const x0 = Math.floor(p.x / _engTile), x1 = Math.floor((p.x + p.w - _engEps) / _engTile);
    if (p.vy > 0) {
      const ty = Math.floor((p.y + p.h - _engEps) / _engTile); // 底缘所在行
      for (let tx = x0; tx <= x1; tx++) {
        const ch = L.tileAt(tx, ty);
        if (ch === '=') { // 单向平台：本帧移动前脚底须已在平台顶之上才可落定
          if (wasFeet <= ty * _engTile + 0.5) { p.y = ty * _engTile - p.h; p.vy = 0; p.onGround = true; break; }
        } else if (L.solid(tx, ty, game.switchState)) {
          p.y = ty * _engTile - p.h; p.vy = 0; p.onGround = true; break;
        }
      }
    } else if (p.vy < 0) {
      const ty = Math.floor(p.y / _engTile); // 顶缘所在行（单向平台不挡上升）
      for (let tx = x0; tx <= x1; tx++) {
        if (L.solid(tx, ty, game.switchState)) { p.y = (ty + 1) * _engTile; p.vy = 0; break; }
      }
    }
  }

  /* ---- 移动平台落上吸附（契约算法 3：vy≥0 + 水平重叠 + 脚底穿过平台顶） ---- */
  if (p.vy >= 0) {
    for (const pl of L.plats) {
      if (p.x + p.w > pl.x && p.x < pl.x + pl.w &&
          wasFeet <= pl.y + 6 && p.y + p.h >= pl.y - 1) {
        p.y = pl.y - p.h; p.vy = 0; p.onGround = true; p.standOn = pl;
        break;
      }
    }
  }

  // 落地尘土
  if (p.onGround && !wasGround && p.landT <= 0) {
    _engAddParts(p.x + 5, p.y + 14, 3, (L.theme && L.theme.dust) || '#ffffff', 30, 200);
    p.landT = 0.15;
  }
  p.landT -= dt;

  /* ---- 弹簧（契约算法 7：vy≥0 + 水平重叠 + 脚底在弹簧顶 ±10px） ---- */
  for (const s of L.springs) {
    s.t -= dt;
    if (p.vy >= 0 && p.x + p.w > s.x && p.x < s.x + s.w &&
        p.y + p.h >= s.y - 10 && p.y + p.h <= s.y + 10) {
      p.vy = -PHY.springV; p.onGround = false; p.standOn = null;
      s.t = 0.25; // 压缩动画计时
      game.sfxQueue.push('spring');
      _engAddParts(s.x + 6, s.y, 8, '#f8d020', 70, 250);
    }
  }

  /* ---- 动画状态（ui 渲染取用） ---- */
  p.animT += dt;
  if (!p.onGround) p.anim = p.vy < 0 ? 'jump' : 'fall';
  else if (Math.abs(p.vx) > 10) p.anim = 'run';
  else p.anim = 'idle';
}

/* ==================== 世界更新（契约第 3 节算法 14 的顺序） ==================== */
function updateWorld(dt) {
  if (game.paused || game.state !== 'play') return;
  const L = game.level, p = game.player;
  if (!L || !p) return;
  game.tick++;

  /* ① 拉杆：接触且冷却≤0 → 全局开关翻转、冷却 0.6s（契约算法 9） */
  for (const lv of L.levers) {
    lv.cd -= dt;
    if (lv.cd <= 0 && !p.dead && _engAabb(p, lv)) {
      game.switchState ^= 1;
      lv.cd = 0.6;
      game.sfxQueue.push('switch');
      _engAddParts(lv.x + 6, lv.y + 6, 6, game.switchState ? '#48d848' : '#f87830', 50, 150);
    }
  }

  /* ② 拾取：金币 / 宝石(=5) / 钥匙 */
  if (!p.dead) {
    for (const c of L.coins) {
      if (c.got) continue;
      c.t += dt;
      if (_engAabb(p, c)) {
        c.got = true;
        if (c.key) { game.keys++; game.sfxQueue.push('key'); _engAddParts(c.x + 5, c.y + 3, 10, '#f8d020', 60, 100); }
        else if (c.gem) { game.coins += 5; game.sfxQueue.push('gem'); _engAddParts(c.x + 4, c.y + 5, 14, '#48d8e8', 80, 100); }
        else { game.coins++; game.sfxQueue.push('coin'); _engAddParts(c.x + 4, c.y + 4, 5, '#f8d020', 50, 100); }
      }
    }
  }

  /* ③ 门：持钥匙接触任一 D 瓦片 → 该连通分量整组移除（契约算法 8）
        门是瓦片：玩家会被碰撞解算顶在门面上（边缘恰好相贴、不构成严格重叠），
        因此接触扫描用「含边界」的覆盖范围（相贴即算接触）。 */
  if (!p.dead && game.keys > 0) {
    const dx0 = Math.floor(p.x / _engTile), dx1 = Math.floor((p.x + p.w) / _engTile);
    const dy0 = Math.floor(p.y / _engTile), dy1 = Math.floor((p.y + p.h) / _engTile);
    for (let ty = dy0; ty <= dy1; ty++) {
      for (let tx = dx0; tx <= dx1; tx++) {
        if (L.tileAt(tx, ty) !== 'D' || game.keys <= 0) continue;
        const key = tx + ',' + ty;
        if (!L.doors.has(key)) continue;
        let grp = null;
        for (const g of L.doorGroups) { if (g.indexOf(key) >= 0) { grp = g; break; } }
        if (!grp) continue;
        for (const k of grp) {
          const parts = k.split(',');
          const ddx = +parts[0], ddy = +parts[1];
          L.tiles[ddy][ddx] = '.';
          L.doors.delete(k);
          _engAddParts(ddx * _engTile + 8, ddy * _engTile + 8, 8, '#8a5a2a', 60, 250);
        }
        game.keys--;
        game.sfxQueue.push('door');
      }
    }
  }

  /* ④ 检查点：接触置 on，复活点只进不退（契约算法 11） */
  if (!p.dead) {
    for (const c of L.checkpoints) {
      if (c.on) continue;
      if (_engAabb(p, c)) {
        c.on = true;
        const prog = c.x - c.y; // 与 respawnAt.p 同一度量
        if (prog > game.respawnAt.p) game.respawnAt = { x: c.x + 3, y: c.y + 6, p: prog };
        game.sfxQueue.push('checkpoint');
        _engAddParts(c.x + 8, c.y + 8, 10, '#48d848', 60, 80);
      }
    }
  }

  /* ⑤ 终点判定 */
  if (!p.dead && L.goal && _engAabb(p, L.goal)) { levelClear(); return; }

  /* ⑥ 移动平台：先动并记录本帧 dx,dy；水平推挤，推入实心则死亡（契约算法 3） */
  for (const pl of L.plats) {
    const ox = pl.x, oy = pl.y;
    if (pl.hz) {
      pl.x += pl.dir * pl.spd * dt;
      if (pl.x > pl.maxX) { pl.x = pl.maxX; pl.dir = -1; }
      if (pl.x < pl.minX) { pl.x = pl.minX; pl.dir = 1; }
    } else {
      pl.y += pl.dir * pl.spd * dt;
      if (pl.y > pl.maxY) { pl.y = pl.maxY; pl.dir = -1; }
      if (pl.y < pl.minY) { pl.y = pl.minY; pl.dir = 1; }
    }
    pl.dx = pl.x - ox; pl.dy = pl.y - oy; // 实际位移（含边界反弹帧）
    if (pl.hz && pl.dx !== 0 && !p.dead && p.vy >= 0 && _engAabb(p, pl)) {
      // 沿推动方向推出：右推时玩家左缘贴平台右缘；左推时玩家右缘贴平台左缘
      p.x = pl.dx > 0 ? pl.x + pl.w : pl.x - p.w;
      if (_engPlayerInSolid(L)) killPlayer();      // 推入实心 → 死亡（避免夹卡）
    }
  }

  /* ⑥′ 崩塌砖状态机（契约算法 6；顺序表未单列，置于移动平台之后、玩家物理之前）：
        0稳 → (被踩 0.45s，期间持续被踩压到 ≤0.12s) → 1抖 → 2落(加速下坠 1.6s，期间非实心)
        → 3无(1.2s 后且玩家矩形不重叠 → 回到 0) */
  for (const c of L.crumbles.values()) {
    if (c.state === 0) {
      if (!p.dead && _engOnCrumble(p, c)) {
        c.state = 1; c.t = 0.45;
        game.sfxQueue.push('crumble');
      }
    } else if (c.state === 1) {
      c.t -= dt;
      if (!p.dead && _engOnCrumble(p, c)) c.t = Math.min(c.t, 0.12); // 再踩 → 快落
      if (c.t <= 0) {
        c.state = 2; c.t = 0; c.dy = 0; c.dvy = 0;
        game.sfxQueue.push('crumble');
        _engAddParts(c.x * _engTile + 8, c.y * _engTile + 8, 8, '#9a8a7a', 60, 350);
      }
    } else if (c.state === 2) {
      c.t += dt; c.dvy += 500 * dt; c.dy += c.dvy * dt; // 加速下坠（渲染偏移）
      if (c.t > 1.6) { c.state = 3; c.t = 0; }
    } else { // state 3
      c.t += dt;
      if (c.t > 1.2 && !_engAabb(p, { x: c.x * _engTile, y: c.y * _engTile, w: 16, h: 16 })) {
        c.state = 0; c.t = 0; c.dy = 0; c.dvy = 0;
      }
    }
  }

  /* ⑦ 电锯：轨道往返 + 圆(r7.5) vs 玩家矩形最近点距离（契约算法 5） */
  for (const s of L.saws) {
    s.t += dt;
    if (s.hz) {
      s.x += s.dir * s.spd * dt;
      if (s.x > s.maxX) { s.x = s.maxX; s.dir = -1; }
      if (s.x < s.minX) { s.x = s.minX; s.dir = 1; }
    } else {
      s.y += s.dir * s.spd * dt;
      if (s.y > s.maxY) { s.y = s.maxY; s.dir = -1; }
      if (s.y < s.minY) { s.y = s.minY; s.dir = 1; }
    }
    if (!p.dead) {
      const nx = _engClamp(s.x, p.x, p.x + p.w), ny = _engClamp(s.y, p.y, p.y + p.h);
      const ddx = s.x - nx, ddy = s.y - ny;
      if (ddx * ddx + ddy * ddy < s.r * s.r) killPlayer();
    }
  }

  /* ⑧ 大炮 / 炮弹（契约算法 10：周期 1.9s，8×6 炮弹，速度 105px/s） */
  for (const cn of L.cannons) {
    cn.t -= dt; cn.flash -= dt;
    if (cn.t <= 0) {
      cn.t = 1.9; cn.flash = 0.12;
      game.sfxQueue.push('shot');
      game.bullets.push({ x: cn.x + (cn.dir > 0 ? 16 : -8), y: cn.y + 4, w: 8, h: 6, vx: cn.dir * 105 });
    }
  }
  game.bullets = game.bullets.filter(function (b) {
    b.x += b.vx * dt;
    const tx = Math.floor((b.x + 4) / _engTile), ty = Math.floor((b.y + 3) / _engTile);
    if (L.solid(tx, ty, game.switchState)) { _engAddParts(b.x + 4, b.y + 3, 4, '#f8b020', 50, 150); return false; }
    if (!p.dead && _engAabb(b, p)) { killPlayer(); return false; }
    return b.x > -20 && b.x < L.w * _engTile + 20;
  });

  /* ⑨ 敌人 AI + 踩踏判定（契约算法 4） */
  for (const e of L.enemies) {
    if (e.dead > 0) { e.dead += dt; continue; }
    e.t += dt;
    if (e.type === 'slime') {
      e.vy = Math.min(e.vy + PHY.grav * dt, 300);
      e.y += e.vy * dt;
      e.grounded = false;
      {
        const ty = Math.floor((e.y + e.h - _engEps) / _engTile);
        const ex0 = Math.floor(e.x / _engTile), ex1 = Math.floor((e.x + e.w - _engEps) / _engTile);
        for (let tx = ex0; tx <= ex1; tx++) {
          if (L.solid(tx, ty, game.switchState)) { e.y = ty * _engTile - e.h; e.vy = 0; e.grounded = true; break; }
        }
      }
      e.x += e.vx * dt;
      {
        const d = _engSign(e.vx);
        if (d !== 0) {
          const tx = d > 0 ? Math.floor((e.x + e.w - _engEps) / _engTile) : Math.floor(e.x / _engTile);
          const my = Math.floor((e.y + e.h / 2) / _engTile);
          const fy = Math.floor((e.y + e.h + 2) / _engTile);
          // 前方齐腰有墙，或悬空无落脚点 → 掉头
          if (L.solid(tx, my, game.switchState) || (e.grounded && !L.solid(tx, fy, game.switchState))) e.vx = -e.vx;
        }
      }
      if (e.y > L.h * _engTile + 30) e.dead = 99; // 坠出世界
    } else { // 蝙蝠
      e.x += e.vx * dt;
      if (Math.abs(e.x - e.ax) > e.rng) e.vx = -_engSign(e.x - e.ax) * Math.abs(e.vx);
      e.y = e.ay + Math.sin(e.t * 2.2) * 7;
    }
    // 踩踏：p.vy>60 且玩家脚底深入敌体 <9px → 踩死反弹；否则玩家死
    if (!p.dead && _engAabb(p, e)) {
      if (p.vy > 60 && p.y + p.h - e.y < 9) {
        e.dead = 0.01;
        p.vy = -250;
        game.sfxQueue.push('stomp');
        _engAddParts(e.x + 6, e.y + 4, 10, e.type === 'bat' ? '#8858c8' : '#58c848', 70, 250);
      } else killPlayer();
    }
  }

  /* ⑩ 玩家物理（含死亡冻结计时、弹簧、平台吸附） */
  _engUpdatePlayer(dt, L, p);

  /* ⑪ 危险判定：尖刺 ^ 下半 / 吊刺 v 上半 / 熔岩 ~ y+3 以下 / 坠出底部（契约算法 5） */
  if (!p.dead) {
    let hazard = false;
    _engRectTiles(L, p.x + 1, p.y + 2, p.w - 2, p.h - 3, function (tx, ty, ch) {
      if (ch === '^' && p.y + p.h > ty * _engTile + 8) hazard = true;
      else if (ch === 'v' && p.y < ty * _engTile + 8) hazard = true;
      else if (ch === '~' && p.y + p.h > ty * _engTile + 3) hazard = true;
    });
    if (hazard) killPlayer();
    if (p.y > L.h * _engTile + 24) killPlayer(); // 坠落即死
  }

  /* ⑫ 粒子 */
  game.parts = game.parts.filter(function (pt) {
    pt.life -= dt; pt.vy += pt.grav * dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt;
    return pt.life > 0;
  });

  /* ⑬ 计时 / 震屏 / 相机（跟随 + 面向前瞻 20px + lerp 0.12 + 关卡钳制，契约算法 13） */
  game.time += dt;
  game.shake = Math.max(0, game.shake - 20 * dt);
  const ctx2 = p.x + p.w / 2 - _engVW / 2 + p.face * 20;
  const cty2 = p.y + p.h / 2 - _engVH / 2;
  game.cam.x += (ctx2 - game.cam.x) * 0.12;
  game.cam.y += (cty2 - game.cam.y) * 0.12;
  game.cam.x = _engClamp(game.cam.x, 0, Math.max(0, L.w * _engTile - _engVW));
  game.cam.y = _engClamp(game.cam.y, 0, Math.max(0, L.h * _engTile - _engVH));
}
