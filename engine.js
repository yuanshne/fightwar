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
   v2 增量（docs/specs/2026-10-24-v2-optimization.md P0+P1，引擎工程师）：
     - P1 手感：coyote/buffer 0.12/0.18、起跳/落地粒子加强、死亡震屏 8、击杀震屏 3；
     - P1 动作：攻击（J/X：冷却 0.35s、身前 18×14 框 0.12s、命中敌→hit-stop 0.06s 不弹跳、
       命中 'B' 砖→碎+1 金币、斩碎炮弹）、冲刺（K/Shift：冷却 0.8s、0.18s vx=±260 免摩擦、
       重力减半）、连击（击杀/碎砖 2s 窗口累计 game.combo，断档清零）；
     - 'B' 可碎木箱砖入 solid/电锯轨道语义、内含金币计入 totalCoin（P3 关卡侧配套）。
   v3 增量（docs/specs/2026-10-24-v3-boss-design.md，引擎工单 docs/workorders/engine.md）：
     - 玩家 HP 系统：hp:5 / invT 无敌帧 / shieldT 护盾 / castT 施法姿态；
       _engHurtPlayer 统一 HP 伤害入口（敌人接触/炮弹/冲击波/Boss 接触 → -1），
       尖刺/熔岩/电锯/挤压/坠落保持 killPlayer 即死（护盾不挡即死物）；
     - Boss 星核巨兽：'X' 锚点解析 → _engMkBoss，_engUpdateBoss 十二态状态机
       （dormant/intro/idle/windup/leapAir/barrageFire/chargeRun/stagger/summonCast/
       novaCast/recover/enrage/dying/dead），_engBossHurt 唯一承伤入口（五态免伤）；
     - 三技能（U 星陨 8s / I 护盾 12s / O 连斩 20s+连击8）+ meteor/wave/drop 实体循环；
     - 击杀统一入口 _engKillEnemy（30% 掉回复心）；sfx 新事件
       'roar','meteor','shield','ult','heart','hurt','bosshit'（只 push 不发声）。
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
  lava: ['torch', 'skull'], tower: ['torch', 'crystal'],
  boss: ['crystal', 'torch', 'skull'] // v3：星核虚空复用既有 decor 类型（设计 §0）
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
  maxRun: 120, jumpV: 330, springV: 520,
  coyote: 0.12, buffer: 0.18 // v2 P1 手感调优：土狼 0.09→0.12、缓冲 0.11→0.18（任务书指定）
};

/* ==================== v2 P1 动作常量（内部；不入 PHY——契约键名不得变） ==================== */
const _engAtkCd = 0.35;   // 内部：攻击冷却（s）
const _engAtkDur = 0.12;  // 内部：攻击判定框存在时长（s）
const _engAtkW = 18, _engAtkH = 14; // 内部：攻击判定框尺寸（身前 18×14）
const _engDashCd = 0.8;   // 内部：冲刺冷却（s）
const _engDashDur = 0.18; // 内部：冲刺持续时间（s）
const _engDashV = 260;    // 内部：冲刺水平速度
const _engDashGrav = 0.5; // 内部：冲刺期间重力倍率（减半）
const _engHitStop = 0.06; // 内部：攻击命中敌人的全局冻结时长（s）
const _engComboWin = 2;   // 内部：连击计数窗口（s）

/* ==================== v3 Boss/技能常量（内部） ==================== */
const _engBossActDist = 176; // 内部：Boss 激活半径（px，玩家中心距 Boss 中心，设计 §2）

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
    this.spawn = { x: 32, y: 32 }; this.goal = null; this.bossSpawn = null; // v3：Boss 锚点
    let brickN = 0; // v2 P3：'B' 可碎木箱砖计数（每箱内含 1 金币，计入 totalCoin）
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
          case 'B': brickN++; break; // v2 P3：木箱砖是实心瓦片（留在网格），仅攻击可碎（碎于 _engResolveAttack）
          case 'X': this.bossSpawn = { x: px + 8, y: py }; this.tiles[y][x] = '.'; break; // v3：Boss 锚点（不入 SOLIDISH/STAND，solid() 无需改）
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

    this.totalCoin = this.coins.reduce((a, c) => a + (c.key ? 0 : (c.gem ? 5 : 1)), 0) + brickN; // 木箱内含金币一并计入
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
    return ch === '#' || ch === 'I' || ch === 'a' || ch === 'b' || ch === 'D' || ch === 'C' || ch === 'B';
  }

  tileAt(tx, ty) { // 越界规则：x 方向返回'#'（左右墙），y<0 与 y≥h 返回'.'
    if (tx < 0 || tx >= this.w) return '#';
    if (ty < 0 || ty >= this.h) return '.';
    return this.tiles[ty][tx];
  }

  solid(tx, ty, switchState) { // '#'/'I'/'B' 恒实；a/b 随全局开关；D 未开门时实；C 崩塌态<2 时实
    const ch = this.tileAt(tx, ty);
    if (ch === '#' || ch === 'I' || ch === 'B') return true; // 'B' 木箱砖：实心，碎后网格改'.'自然失效
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
  // v2 P1：input 新增 attack/dash 边沿与持键（ui 写入，engine 只读并消费边沿）
  // v3：追加技能边沿 skillUHit/skillIHit/skillOHit（ui 写、engine 消费并清零，同 attackHit/dashHit）
  input: { left: 0, right: 0, jump: 0, jumpHit: 0, attack: 0, attackHit: 0, dash: 0, dashHit: 0,
           skillUHit: 0, skillIHit: 0, skillOHit: 0 },
  paused: false, tick: 0,
  combo: 0, comboT: 0,   // v2 P1：连击计数 / 窗口剩余（断档清零）
  hitStop: 0,            // v2 P1：攻击命中的全局冻结计时（>0 时世界暂停推进）
  // v3：Boss 战与技能系统（沿 v2 先例扩展字段，不新增顶层全局符号）
  boss: null,            // Boss 实体（loadLevel 按 L.bossSpawn 创建，L1-L6 恒 null）
  drops: [],             // 掉落回复心（击杀 30% 概率）
  meteors: [],           // 星陨术流星
  waves: [],             // Boss 落地冲击波
  skills: { u: 0, i: 0, o: 0 }, // 三技能 CD 剩余秒（U/I/O）
  flashT: 0              // 流星连斩白屏剩余（s）
};

/* ==================== 关卡装载 / 出生 / 死亡 / 通关 ==================== */
function _engMkPlayer(x, y) { // 内部：玩家对象（字段 = 契约清单 + v2 P1 攻击/冲刺字段）
  return {
    x: x, y: y, w: 10, h: 14, vx: 0, vy: 0, face: 1,
    onGround: false, coyote: 0, jbuf: 0, anim: 'idle', animT: 0,
    dead: false, deadT: 0, standOn: null, landT: 0,
    atkCd: 0, atkT: 0,     // v2 P1：攻击冷却剩余 / 判定框剩余存在时间
    dashCd: 0, dashT: 0, dashDir: 1, // v2 P1：冲刺冷却剩余 / 持续剩余 / 方向
    hp: 5, invT: 0, shieldT: 0, castT: 0, // v3：心形 HP / 受伤无敌剩余 / 护盾剩余 / 施法姿态剩余
    jumpCut: false, prevJump: 0 // v2.6：松手截断只作用于普通跳；prevJump 记录跳键上一帧状态
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
  // v3：Boss 创建 + 新实体/技能字段复位（工单 A「loadLevel 末尾」）
  game.boss = L.bossSpawn ? _engMkBoss(L.bossSpawn.x, L.bossSpawn.y) : null;
  game.drops = []; game.meteors = []; game.waves = []; game.flashT = 0;
  game.skills = { u: 0, i: 0, o: 0 };
}

function respawn() { // 死亡序列终点：敌人复活重置、崩塌砖复位、子弹清空；钥匙/门/开关/已收金币保持
  const p = game.player, L = game.level;
  if (!p || !L || !game.respawnAt) return;
  p.x = game.respawnAt.x; p.y = game.respawnAt.y;
  p.vx = 0; p.vy = 0; p.dead = false; p.deadT = 0;
  p.standOn = null; p.onGround = false; p.coyote = 0; p.jbuf = 0;
  p.atkT = 0; p.dashT = 0; p.atkCd = 0; p.dashCd = 0; // v2 P1：动作状态复位
  p.hp = 5; p.invT = 1.5; p.shieldT = 0; p.castT = 0; // v3：HP 回满 + 1.5s 出生保护；技能 CD 保留计时（设计 §5）
  p.jumpCut = false; p.prevJump = 0;
  // v2 P1：清输入锁存——死亡期间残留的边沿不得在复活后的缓冲窗口内自动触发
  game.input.jumpHit = 0; game.input.attackHit = 0; game.input.dashHit = 0;
  game.input.skillUHit = 0; game.input.skillIHit = 0; game.input.skillOHit = 0; // v3：技能边沿同惯例清零
  game.hitStop = 0;
  game.bullets = []; game.waves = []; game.meteors = []; // v3：弹幕/波/陨石清空（drops 保留自然过期）
  // v3：Boss 重置——HP/阶段保留，状态回 idle（若存在且非 dormant/dead，工单 B）
  if (game.boss && game.boss.state !== 'dormant' && game.boss.state !== 'dead') {
    game.boss.state = 'idle'; game.boss.t = 0; game.boss.vx = 0; game.boss.vy = 0;
  }
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
  p.atkT = 0; p.dashT = 0; // v2 P1：动作状态随死亡终止
  game.deaths++; game.shake = 8; // v2 P1：死亡震屏 6→8
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

/* ==================== v3：HP 伤害 / Boss AI / 技能（内部） ==================== */

function _engHurtPlayer(fromX) { // 内部：一切 HP 伤害的唯一入口（工单 B；即死物不走这里）
  const p = game.player;
  if (!p || p.dead || game.state !== 'play') return false;
  if (p.invT > 0 || p.shieldT > 0) return false;   // 无敌帧/护盾：伤害与击退全免
  p.hp--; p.invT = 1.0;
  p.vx = (p.x + p.w / 2 < fromX ? -1 : 1) * 160;   // 击退方向=离伤害源
  p.vy = -140; p.dashT = 0; p.atkT = 0;
  game.shake = Math.max(game.shake, 5);
  game.sfxQueue.push('hurt');
  _engAddParts(p.x + 5, p.y + 7, 10, '#f85858', 90, 200);
  if (p.hp <= 0) killPlayer();                     // 复用 v2 死亡序列
  return true;
}

function _engKillEnemy(e) { // 内部：击杀统一入口（踩踏/攻击/星陨/连斩共用；30% 掉回复心，设计 §5）
  e.dead = 0.01;
  if (Math.random() < 0.30) game.drops.push({ x: e.x + 2, y: e.y - 4, w: 8, h: 8, vy: -120, life: 6 });
}

function _engOnScreen(e) { // 内部：实体矩形是否在视口内（连斩「屏内普通敌全灭」判定用）
  return e.x + e.w > game.cam.x && e.x < game.cam.x + _engVW &&
         e.y + e.h > game.cam.y && e.y < game.cam.y + _engVH;
}

function _engMkBoss(cx, py) { // 内部：Boss 实体（cx=锚点中心x, py=锚点行顶）
  return {
    x: cx - 26,
    // 【工单偏离·已裁决】伪代码 `y: py` 为笔误——那会把 52×48 命中框嵌入主地板 32px，
    // 与 engine.md A 节「落地脚底 y=208」及设计 §1「脚底站在地面瓦片顶」/§6「落地脚 y=208」矛盾。
    // 按「落地脚底=锚点下一行的地板顶面」实现：y=(锚点行+1)*16-h（不硬编码，随锚点行推导；L7 即 13*16-48=160）。
    y: py + _engTile - 48,
    w: 52, h: 48, vx: 0, vy: 0, face: -1,
    hp: 60, maxHp: 60, phase: 1,
    state: 'dormant', t: 0,          // t：当前状态已累计秒数
    next: '', lastPattern: '', pickN: 0,
    flashT: 0, chargeDir: 1, chargeFrom: 0, landX: 0, fireN: 0
  };
}

function _engBossDur(name, phase) { // 内部：前摇表(秒)，P2 ×0.85（设计 §3）
  const T = { leap: 0.50, barrage: 0.45, charge: 0.60, summon: 0.50, nova: 0.55 };
  return T[name] * (phase === 2 ? 0.85 : 1);
}

function _engBossPick(b) { // 内部：确定性轮转选招（设计 §2，不用随机）
  const p = game.player, bcx = b.x + b.w / 2, adx = Math.abs(p.x + p.w / 2 - bcx);
  let pool = adx <= 200 ? ['charge', 'leap', 'summon', 'charge'] : ['barrage', 'charge', 'leap', 'barrage'];
  if (b.phase === 2) pool = pool.concat(['nova']);
  const alive = game.level.enemies.filter(function (e) { return !(e.dead > 0); }).length;
  if (alive >= 2) pool = pool.filter(function (n) { return n !== 'summon'; });
  pool = pool.filter(function (n) { return n !== b.lastPattern; });
  if (!pool.length) pool = ['barrage'];
  b.next = pool[b.pickN++ % pool.length]; b.lastPattern = b.next;
  b.state = 'windup'; b.t = 0;
}

function _engBossHurt(dmg) { // 内部：Boss 唯一承伤入口（攻击/星陨/连斩都走这里；五态免伤）
  const b = game.boss;
  if (!b || b.state === 'dormant' || b.state === 'intro' || b.state === 'enrage'
        || b.state === 'dying' || b.state === 'dead') return false;
  b.hp -= dmg; b.flashT = 0.12;
  game.hitStop = Math.max(game.hitStop, 0.06);      // 复用 v2 hit-stop
  game.shake = Math.max(game.shake, 3);
  game.sfxQueue.push('bosshit');
  if (b.hp <= 0) { b.hp = 0; b.state = 'dying'; b.t = 0;
    game.bullets = []; game.waves = []; game.shake = 10; return true; } // 死亡优先：大伤害一刀斩不得被狂暴吸收卡 1 血
  if (b.hp <= 30 && b.phase === 1) { b.phase = 2; b.state = 'enrage'; b.t = 0;
    game.sfxQueue.push('roar'); game.shake = 6; return true; }
  return true;
}

function _engBossPhysX(dt, b) { // 内部：Boss X 轴解算（撞墙返回 true）——沿用玩家先X后Y惯例
  b.x += b.vx * dt;
  const y0 = Math.floor(b.y / _engTile), y1 = Math.floor((b.y + b.h - _engEps) / _engTile);
  if (b.vx > 0) { const tx = Math.floor((b.x + b.w - _engEps) / _engTile);
    for (let ty = y0; ty <= y1; ty++) if (game.level.solid(tx, ty, game.switchState)) { b.x = tx * _engTile - b.w; return true; } }
  else if (b.vx < 0) { const tx = Math.floor(b.x / _engTile);
    for (let ty = y0; ty <= y1; ty++) if (game.level.solid(tx, ty, game.switchState)) { b.x = (tx + 1) * _engTile; return true; } }
  return false;
}

function _engBossNovaRing(b, deg) { // 内部：nova 8 向放射弹（第二环 deg=22.5 转角）
  const bcx = b.x + b.w / 2, bcy = b.y + 20;
  for (let i = 0; i < 8; i++) { const a = (i * 45 + deg) * Math.PI / 180;
    game.bullets.push({ x: bcx - 4, y: bcy - 4, w: 8, h: 8,
      vx: Math.cos(a) * 100, vy: Math.sin(a) * 100, star: true }); }
}

function _engUpdateBoss(dt) { // 内部：Boss 状态机（设计 §2/§3；计时单位秒=帧÷60）
  const b = game.boss; if (!b) return;
  const L = game.level, p = game.player;
  b.flashT -= dt; b.t += dt;
  const pcx = p.x + p.w / 2, bcx = b.x + b.w / 2;

  switch (b.state) {
  case 'dormant':                                // 沉睡：无物理（出生即按锚点落地，见 _engMkBoss）
    if (Math.abs(pcx - bcx) < _engBossActDist) {
      b.state = 'intro'; b.t = 0; game.sfxQueue.push('roar'); game.shake = 4;
    } break;

  case 'intro':
    if (b.t >= 1.8) { b.state = 'idle'; b.t = 0; } break;   // 演出期无敌（_engBossHurt 已挡）

  case 'idle': {
    b.face = pcx < bcx ? -1 : 1;
    if (Math.abs(pcx - bcx) > 140) b.vx = b.face * (b.phase === 2 ? 25 : 20); // 缓步逼近
    else b.vx = 0;
    _engBossPhysX(dt, b);
    if (b.t >= (b.phase === 2 ? 0.45 : 0.6)) _engBossPick(b);
    break; }

  case 'windup':
    b.vx = 0; b.face = pcx < bcx ? -1 : 1;
    if (b.next === 'leap') { if (b.t >= _engBossDur('leap', b.phase)) { // 起跳参数在前摇结束瞬间取
        b.landX = _engClamp(pcx, bcx - 300, bcx + 300);
        const T = 0.9; b.vx = (b.landX - bcx) / T; b.vy = -675;         // g=1500 对称抛物线
        b.state = 'leapAir'; b.t = 0; } }
    else if (b.next === 'charge') { if (b.t >= _engBossDur('charge', b.phase)) {
        b.chargeDir = pcx < bcx ? -1 : 1; b.chargeFrom = b.x;
        b.state = 'chargeRun'; b.t = 0; game.sfxQueue.push('roar'); } }
    else if (b.next === 'barrage') { if (b.t >= _engBossDur('barrage', b.phase)) {
        b.state = 'barrageFire'; b.t = 0; b.fireN = 0; } }
    else if (b.next === 'summon') { if (b.t >= _engBossDur('summon', b.phase)) {
        b.state = 'summonCast'; b.t = 0;
        for (const s of [-40, 40]) L.enemies.push({ type: 'slime',     // 双史莱姆（复用 W 实体结构）
          x: bcx + s - 6, y: b.y + b.h - 10, w: 12, h: 10, vx: s < 0 ? -28 : 28, vy: 0,
          hx: bcx + s - 6, hy: b.y + b.h - 10, dead: 0, t: 0, grounded: false }); } }
    else if (b.next === 'nova') { if (b.t >= _engBossDur('nova', b.phase)) {
        b.state = 'novaCast'; b.t = 0; b.fireN = 0; } }
    break;

  case 'leapAir': {
    _engBossPhysX(dt, b);                       // X：可能撞侧墙（跳过横向就贴墙滑）
    b.vy = Math.min(b.vy + 1500 * dt, 520); b.y += b.vy * dt;  // 落速上限 520（非玩家 360）
    if (b.vy > 0) { const ty = Math.floor((b.y + b.h - _engEps) / _engTile);
      const x0 = Math.floor(b.x / _engTile), x1 = Math.floor((b.x + b.w - _engEps) / _engTile);
      for (let tx = x0; tx <= x1; tx++) if (L.solid(tx, ty, game.switchState)) {
        b.y = ty * _engTile - b.h; b.vx = 0; b.vy = 0;
        game.shake = 6; game.sfxQueue.push('roar');
        _engAddParts(bcx, b.y + b.h, 16, '#a890f8', 100, 300);
        for (const d of [-1, 1]) game.waves.push({ x: bcx + d * 20, y: b.y + b.h - 10,
          w: 12, h: 10, vx: d * (b.phase === 2 ? 115 : 90), life: 1.2 });   // 双向贴地冲击波
        b.state = 'recover'; b.t = 0; break; } }
    break; }

  case 'barrageFire': {                          // 3 轮×2 发，每轮间隔 0.15s
    b.face = pcx < bcx ? -1 : 1;
    const want = Math.floor(b.t / 0.15);
    while (b.fireN < want && b.fireN < 3) {
      for (const off of [-8, 8]) {
        const ang = Math.atan2((p.y + p.h / 2) - (b.y + 18), pcx - (bcx)) + off * Math.PI / 180;
        game.bullets.push({ x: bcx - 4, y: b.y + 14, w: 8, h: 8,
          vx: Math.cos(ang) * 130, vy: Math.sin(ang) * 130, star: true }); // star=true: ui 画星弹
      }
      game.sfxQueue.push('shot'); b.fireN++;
    }
    if (b.fireN >= 3 && b.t >= 0.45) { b.state = 'recover'; b.t = 0; }
    break; }

  case 'chargeRun': {
    b.vx = b.chargeDir * (b.phase === 2 ? 290 : 230);
    const hitWall = _engBossPhysX(dt, b);
    if (hitWall) { b.vx = 0; b.state = 'stagger'; b.t = 0;
      game.shake = 8; game.sfxQueue.push('roar');
      _engAddParts(b.x + (b.chargeDir > 0 ? b.w : 0), b.y + b.h / 2, 14, '#c8b8e8', 110, 250); }
    else if (b.t >= 1.5 || Math.abs(b.x - b.chargeFrom) >= 320) { b.vx = 0; b.state = 'recover'; b.t = 0; }
    break; }

  case 'stagger':   if (b.t >= 1.5) { b.state = 'recover'; b.t = 0; } break; // 输出窗口

  case 'summonCast': if (b.t >= 0.30) { b.state = 'recover'; b.t = 0; } break;

  case 'novaCast': {                              // 0.55s 蓄 + 双环(第二环 t=0.95)
    if (b.fireN === 0 && b.t >= 0.55) { _engBossNovaRing(b, 0);   b.fireN = 1; game.sfxQueue.push('shot'); }
    if (b.fireN === 1 && b.t >= 0.95) { _engBossNovaRing(b, 22.5); b.fireN = 2; game.sfxQueue.push('shot'); }
    if (b.fireN === 2 && b.t >= 1.2) { b.state = 'recover'; b.t = 0; }
    break; }

  case 'recover':  b.vx = 0;
    // 注：伪代码 `{...}[b.next] || 0.5` 按 JS 优先级恒真（(b.t>=X)||0.5），此处修正为取值后兜底
    if (b.t >= (({ leap: 0.7, barrage: 0.5, charge: 0.4, summon: 0.5, nova: 0.6 })[b.next] || 0.5))
      { b.state = 'idle'; b.t = 0; }
    break;

  case 'enrage':   b.vx = 0; if (b.t >= 1.2) { b.state = 'idle'; b.t = 0; } break;

  case 'dying': {
    b.vx = 0; b.y += 6 * dt;                      // 慢速下沉
    if ((b.t * 18 | 0) !== ((b.t - dt) * 18 | 0)) {         // 每 ~3.3 帧一圈爆炸粒子
      _engAddParts(bcx + (Math.random() * 44 - 22), b.y + Math.random() * 40, 10,
        ['#f8d048', '#f86020', '#48d8e8'][((b.t * 10) | 0) % 3], 110, 60);
      game.shake = Math.max(game.shake, 4);
    }
    if (b.t >= 2.2) { b.state = 'dead'; levelClear(); }  // 复用 v2 通关（含彩带粒子）
    break; }
  }

  /* 接触伤害（除休眠/演出/死亡态）：吃玩家无敌帧（工单 C 伪代码口径） */
  if (b.state !== 'dormant' && b.state !== 'intro' && b.state !== 'dying' && b.state !== 'dead'
      && !p.dead && _engAabb(b, p)) _engHurtPlayer(bcx);
}

function _engSkillTargetX(p) { // 内部：星陨目标 x——Boss 中心 / 200px 内最近敌 / 面向 44px（设计 §4）
  if (game.boss && game.boss.state !== 'dormant' && game.boss.state !== 'dead'
      && game.boss.state !== 'dying') return game.boss.x + game.boss.w / 2;
  let best = null, bd = 200;
  for (const e of game.level.enemies) if (!(e.dead > 0)) {
    const d = Math.abs(e.x - p.x); if (d < bd) { bd = d; best = e; } }
  return best ? best.x + 6 : p.x + 5 + p.face * 44;
}

function _engUpdateSkills(dt) { // 内部：三技能 U/I/O（边沿消费 + CD 门控；由 _engUpdatePlayer 调用）
  const p = game.player, S = game.skills, inp = game.input;
  if (inp.skillUHit) { inp.skillUHit = 0;
    if (S.u <= 0 && !p.dead) { S.u = 8; p.castT = 0.25; game.sfxQueue.push('meteor');
      const tx = _engSkillTargetX(p);               // Boss中心 / 200px内最近敌 / 面向44px
      game.meteors.push({ x: tx - 24, y: -16, vy: 300, w: 10, h: 14, delay: 0    });
      game.meteors.push({ x: tx - 5,  y: -16, vy: 300, w: 10, h: 14, delay: 0.25 });
      game.meteors.push({ x: tx + 14, y: -16, vy: 300, w: 10, h: 14, delay: 0.50 }); } }
  if (inp.skillIHit) { inp.skillIHit = 0;
    if (S.i <= 0 && !p.dead) { S.i = 12; p.shieldT = 3.0; game.sfxQueue.push('shield');
      _engAddParts(p.x + 5, p.y + 7, 12, '#f8d048', 70, 0); } }
  if (inp.skillOHit) { inp.skillOHit = 0;
    if (S.o <= 0 && game.combo >= 8 && !p.dead) { S.o = 20;
      game.combo = 0; game.comboT = 0;              // 消耗连击
      game.hitStop = Math.max(game.hitStop, 0.12); game.flashT = 0.15; game.shake = 8;
      game.sfxQueue.push('ult');
      if (game.boss) _engBossHurt(5);
      const L = game.level;                          // 屏内普通敌全灭（走 _engKillEnemy 统一掉落）
      for (const e of L.enemies) if (!(e.dead > 0) && _engOnScreen(e)) _engKillEnemy(e);
      for (const bl of game.bullets) _engAddParts(bl.x + 4, bl.y + 4, 3, '#f8d048', 60, 100);
      game.bullets = [];                             // 清全部弹幕
    } }
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

function _engAddCombo() { // 内部：击杀/碎砖连击计数（v2 P1：2s 窗口累计，断档清零在 updateWorld ⑬）
  game.combo++;
  game.comboT = _engComboWin;
  if (game.combo >= 2) game.sfxQueue.push('combo'); // n≥2 才有连击音
}

function _engResolveAttack(L, p) { // 内部：攻击判定（v2 P1）——身前 18×14 框 vs 敌人/炮弹/'B' 砖
  if (!(p.atkT > 0) || p.dead) return;
  const box = { x: p.face > 0 ? p.x + p.w - 2 : p.x - _engAtkW + 2, y: p.y, w: _engAtkW, h: _engAtkH };
  // 敌人：攻击击杀与踩踏等价（史莱姆/蝙蝠均可），但玩家不弹跳；命中→hit-stop 全局冻结
  let hitEnemy = false;
  // v3：Boss 承伤——命中 +2 连击（设计 §4 连斩充能口径；免伤态 _engBossHurt 返回 false 不计数）
  if (game.boss) {
    if (_engAabb(box, game.boss) && _engBossHurt(1)) { _engAddCombo(); _engAddCombo(); hitEnemy = true; }
  }
  // v3：Boss 落地冲击波可斩碎（+1 连击，设计 §3）
  for (let i = game.waves.length - 1; i >= 0; i--) {
    if (_engAabb(box, game.waves[i])) {
      _engAddParts(game.waves[i].x + 6, game.waves[i].y + 5, 6, '#48d8e8', 70, 200);
      game.waves.splice(i, 1); _engAddCombo(); game.sfxQueue.push('break');
    }
  }
  for (const e of L.enemies) {
    if (e.dead > 0 || !_engAabb(box, e)) continue;
    _engKillEnemy(e); // v3：击杀统一入口（30% 掉回复心），表现与 v2 一致
    hitEnemy = true;
    _engAddParts(e.x + 6, e.y + 4, 12, e.type === 'bat' ? '#8858c8' : '#58c848', 90, 250);
    _engAddCombo();
    game.sfxQueue.push('stomp');
  }
  if (hitEnemy) { game.hitStop = _engHitStop; game.shake = Math.max(game.shake, 3); } // v2 P1：击杀震屏 3
  // 炮弹：可被斩碎
  for (let i = game.bullets.length - 1; i >= 0; i--) {
    const b = game.bullets[i];
    if (_engAabb(box, b)) {
      game.bullets.splice(i, 1);
      _engAddParts(b.x + 4, b.y + 3, 8, '#f8b020', 80, 200);
      game.sfxQueue.push('break');
    }
  }
  // 'B' 木箱砖：碎后内含 1 金币粒子 + 1 金币计数（v2 P3 与 levels 侧约定）
  _engRectTiles(L, box.x, box.y, box.w, box.h, function (tx, ty, ch) {
    if (ch !== 'B') return;
    L.tiles[ty][tx] = '.'; // 碎后从网格移除（respawn 不重建网格 → 保持已碎，与已收金币同理）
    game.coins++;
    _engAddParts(tx * _engTile + 8, ty * _engTile + 8, 10, '#c89858', 90, 300);
    _engAddParts(tx * _engTile + 8, ty * _engTile + 8, 4, '#f8d020', 70, 200);
    _engAddCombo();
    game.sfxQueue.push('break');
  });
}

/* ==================== 玩家物理（契约第 3 节算法 1/2/3/7） ==================== */
function _engUpdatePlayer(dt, L, p) {
  // 死亡冻结 0.9s 后重生（契约算法 12）
  if (p.dead) { p.deadT += dt; if (p.deadT >= 0.9) respawn(); return; }

  /* ---- 输入（只读 game.input） ---- */
  const dir = (game.input.right ? 1 : 0) - (game.input.left ? 1 : 0);

  /* ---- v2 P1：攻击 / 冲刺（边沿消费 + 冷却门控） ---- */
  p.atkCd -= dt; p.dashCd -= dt; p.atkT -= dt; p.dashT -= dt;
  p.invT -= dt; p.shieldT -= dt; p.castT -= dt; // v3：无敌/护盾/施法计时（与其他计时器并列）
  if (game.input.attackHit) {
    game.input.attackHit = 0; // 消费边沿（空挥也进入冷却，防止按住刷判定）
    if (p.atkCd <= 0) {
      p.atkCd = _engAtkCd; p.atkT = _engAtkDur;
      game.sfxQueue.push('slash');
    }
  }
  if (game.input.dashHit) {
    game.input.dashHit = 0;
    if (p.dashCd <= 0) {
      p.dashCd = _engDashCd; p.dashT = _engDashDur;
      p.dashDir = dir !== 0 ? dir : p.face; // 有方向输入用输入向，否则用面向
      game.sfxQueue.push('dash');
      _engAddParts(p.x + 5 - p.dashDir * 6, p.y + 7, 6, '#48d8e8', 60, 0);
    }
  }

  /* ---- v3：技能 U/I/O（边沿消费 + CD/连击门控，结构同攻击/冲刺块） ---- */
  _engUpdateSkills(dt);

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

  // 水平：冲刺锁定高速免摩擦（v2 P1）/ 加速 / 摩擦 / 限速（冰面用 fricIce）
  if (p.dashT > 0) {
    p.vx = p.dashDir * _engDashV;
    p.face = p.dashDir;
  } else if (dir !== 0) { p.vx += dir * PHY.acc * dt; p.face = dir; }
  else {
    const s = _engSign(p.vx);
    p.vx -= s * (onIce ? PHY.fricIce : PHY.fric) * dt;
    if (_engSign(p.vx) !== s) p.vx = 0;
  }
  if (p.dashT <= 0) p.vx = _engClamp(p.vx, -PHY.maxRun, PHY.maxRun);
  if (p.onGround && p.dashT <= 0) { // 传送带：站上被推动（可叠加到跑速之上，上限 ±170）；冲刺中不吃传送带
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
    p.jumpCut = true; // 普通跳才吃松手截断；弹簧/踩踏弹跳免疫
    game.sfxQueue.push('jump');
    _engAddParts(p.x + 5, p.y + 14, 8, (L.theme && L.theme.dust) || '#ffffff', 55, 220); // v2 P1：起跳粒子加强 4→8
  }
  if (p.jumpCut && p.vy < 0 && p.prevJump && !game.input.jump) p.vy *= 0.45; // 松键瞬间一次性截断=可变跳高（弹簧/踩踏不受影响）
  p.prevJump = game.input.jump ? 1 : 0;
  p.vy = Math.min(p.vy + PHY.grav * (p.dashT > 0 ? _engDashGrav : 1) * dt, PHY.maxFall); // 冲刺中重力减半（v2 P1）

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

  // 落地尘土（v2 P1：粒子加强 3→8；landT 0.15s 供渲染层做落地 squash）
  if (p.onGround && !wasGround && p.landT <= 0) {
    _engAddParts(p.x + 5, p.y + 14, 8, (L.theme && L.theme.dust) || '#ffffff', 45, 220);
    p.landT = 0.15;
    p.jumpCut = false; game.sfxQueue.push('land'); // 落地解除截断 + 轻落地声
  }
  p.landT -= dt;

  /* ---- 弹簧（契约算法 7：vy≥0 + 水平重叠 + 脚底在弹簧顶 ±10px） ---- */
  for (const s of L.springs) {
    s.t -= dt;
    if (p.vy >= 0 && p.x + p.w > s.x && p.x < s.x + s.w &&
        p.y + p.h >= s.y - 10 && p.y + p.h <= s.y + 10) {
      p.vy = -PHY.springV; p.onGround = false; p.standOn = null;
      p.jbuf = 0; p.coyote = 0; p.jumpCut = false; // 清缓冲防弱跳覆盖弹簧；弹簧不吃松手截断
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
  if (game.hitStop > 0) { // v2 P1：攻击命中 → 全局冻结（世界整体暂停推进，计时到点自动恢复）
    game.hitStop -= dt;
    if (game.hitStop < 0) game.hitStop = 0;
    return;
  }
  const L = game.level, p = game.player;
  if (!L || !p) return;
  // tick 由 ui.js step() 每步统一 +1（覆盖全部界面状态）；此处不再自增——
  // 曾因双自增使 play 态 tick 恒为偶数，(tick*n|0)%2 类取帧全部冻结在第 1 帧

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
    b.y += (b.vy || 0) * dt; // v3：Boss 星弹带 vy（大炮弹 vy 未定义 → +0，轨迹不变，设计 §3）
    const tx = Math.floor((b.x + 4) / _engTile), ty = Math.floor((b.y + 3) / _engTile);
    if (L.solid(tx, ty, game.switchState)) { _engAddParts(b.x + 4, b.y + 3, 4, '#f8b020', 50, 150); return false; }
    if (!p.dead && _engAabb(b, p)) { _engHurtPlayer(b.x + 4); return false; } // v3：炮弹/Boss 弹 → HP 伤害（原即死）
    return b.x > -20 && b.x < L.w * _engTile + 20 && b.y > -20 && b.y < L.h * _engTile + 20; // v3：出界追加 y
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
    // 踩踏：p.vy>60 且玩家脚底深入敌体 <9px → 踩死反弹；否则 HP 伤害（v3：原即死）
    if (!p.dead && _engAabb(p, e)) {
      if (p.vy > 60 && p.y + p.h - e.y < 9) {
        _engKillEnemy(e); // v3：击杀统一入口（30% 掉回复心），其余表现不变
        p.vy = -250; p.jumpCut = false; // 踩踏弹跳不吃松手截断
        game.shake = Math.max(game.shake, 3); // v2 P1：击杀震屏 3
        _engAddCombo();                        // v2 P1：击杀计入连击
        game.sfxQueue.push('stomp');
        _engAddParts(e.x + 6, e.y + 4, 10, e.type === 'bat' ? '#8858c8' : '#58c848', 70, 250);
      } else _engHurtPlayer(e.x + e.w / 2); // v3：接触伤害走 HP 入口（受击无敌内免疫，含击退）
    }
  }

  /* ⑨′ Boss AI（v3）：状态机推进 + Boss 接触伤害（dormant/intro/dying/dead 免接触） */
  _engUpdateBoss(dt);

  /* ⑨″ Boss 战实体（v3）：陨石 / 冲击波 / 掉落心 */
  for (let i = game.meteors.length - 1; i >= 0; i--) { const m = game.meteors[i];
    if (m.delay > 0) { m.delay -= dt; continue; }
    m.y += m.vy * dt;
    let boom = m.y > L.h * _engTile + 20;
    if (game.boss && _engAabb(m, game.boss)) { _engBossHurt(1); _engAddCombo(); boom = true; }
    if (!boom) for (const e of L.enemies)
      if (!(e.dead > 0) && _engAabb(m, e)) { _engKillEnemy(e); boom = true; break; }
    if (!boom) { // 撞实心地面/砸碎 B 砖（AoE 24×24）
      _engRectTiles(L, m.x - 7, m.y + 8, 24, 10, function (tx, ty, ch) {
        if (ch === '#' || ch === 'I' || ch === 'B') { if (ch === 'B') { L.tiles[ty][tx] = '.'; game.coins++; _engAddCombo(); }
          boom = true; } }); }
    if (boom) { game.meteors.splice(i, 1); game.shake = Math.max(game.shake, 3);
      game.sfxQueue.push('meteor'); _engAddParts(m.x + 5, m.y + 10, 12, '#f8d048', 110, 250); } }
  for (let i = game.waves.length - 1; i >= 0; i--) { const w = game.waves[i];
    w.x += w.vx * dt; w.life -= dt;
    const ahead = Math.floor((w.x + (w.vx > 0 ? w.w : 0)) / _engTile), wy = Math.floor((w.y + 5) / _engTile);
    if (w.life <= 0 || L.solid(ahead, wy, game.switchState)) { game.waves.splice(i, 1); continue; }
    if (!p.dead && _engAabb(w, p)) { _engHurtPlayer(w.x + 6); game.waves.splice(i, 1); } }
  for (let i = game.drops.length - 1; i >= 0; i--) { const d = game.drops[i];
    d.vy = Math.min((d.vy || 0) + 1200 * dt, 360); d.y += d.vy * dt; d.life -= dt;
    const ty = Math.floor((d.y + d.h) / _engTile), tx = Math.floor((d.x + 4) / _engTile);
    if (L.solid(tx, ty, game.switchState)) { d.y = ty * _engTile - d.h; d.vy = 0; }
    if (d.life <= 0) { game.drops.splice(i, 1); continue; }
    if (!p.dead && _engAabb(d, p)) { game.drops.splice(i, 1);
      p.hp = Math.min(5, p.hp + 1); game.sfxQueue.push('heart');
      _engAddParts(d.x + 4, d.y + 4, 8, '#f85888', 60, 80); } }

  /* ⑩ 玩家物理（含死亡冻结计时、弹簧、平台吸附、攻击/冲刺） */
  _engUpdatePlayer(dt, L, p);

  /* ⑩′ 攻击判定（v2 P1）：判定框存在 atkDur 秒，每步扫描敌人/炮弹/'B' 砖 */
  _engResolveAttack(L, p);

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

  /* ⑬ 计时 / 震屏 / 连击断档 / 相机（跟随 + 面向前瞻 20px + lerp 0.12 + 关卡钳制，契约算法 13） */
  game.time += dt;
  game.shake = Math.max(0, game.shake - 20 * dt);
  if (game.comboT > 0) { // v2 P1：连击 2s 窗口断档清零
    game.comboT -= dt;
    if (game.comboT <= 0) { game.comboT = 0; game.combo = 0; }
  }
  const ctx2 = p.x + p.w / 2 - _engVW / 2 + p.face * 20;
  const cty2 = p.y + p.h / 2 - _engVH / 2;
  game.cam.x += (ctx2 - game.cam.x) * 0.12;
  game.cam.y += (cty2 - game.cam.y) * 0.12;
  game.cam.x = _engClamp(game.cam.x, 0, Math.max(0, L.w * _engTile - _engVW));
  game.cam.y = _engClamp(game.cam.y, 0, Math.max(0, L.h * _engTile - _engVH));

  /* ⑬′ v3：技能三 CD 递减 / 连斩白屏递减 */
  game.skills.u = Math.max(0, game.skills.u - dt);
  game.skills.i = Math.max(0, game.skills.i - dt);
  game.skills.o = Math.max(0, game.skills.o - dt);
  if (game.flashT > 0) { game.flashT -= dt; if (game.flashT < 0) game.flashT = 0; }
}
