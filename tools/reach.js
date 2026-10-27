// v7.5 可达性求解器：验证「神龛 / 终点」能从出生点**物理走到**，并输出可复现的按键序列（witness）。
//
// 为什么需要：v7.4 只证明了「谜题数据可解」，没有证明「玩家走得到神龛」。
// 神龛如果悬在虚空里、卡在实心块后、或高出最大跳跃高度，谜题再完美也白搭——整关仍然不可通关。
//
// 做法：不用简化的跳跃弧线公式（那样漏掉二段跳/冲刺/弹簧/风柱/移动平台/拉杆开关砖就会误判），
// 而是**直接驱动 engine.js 的 updateWorld 逐帧跑真物理**，把「地面落脚点」当作搜索节点，
// 每个节点展开一组宏动作（等待 / 走 / 跳×跳跃高度×二段跳时机×冲刺时机），落地即成为新节点。
// 用 A*（启发式=到目标的像素距离）挑节点，命中目标触发区即停。
//
// 输出的是「帧级按键序列」而非抽象路径——因此可以原样回放验证：
// 在全新关卡实例上重放该序列，若仍能命中目标，才算真正证明（witness 即证据）。
// 回放失败 = 搜索过程中世界相位漂移导致结论不成立，如实报 WARN，不谎报 PASS。
//
// 抽象边界（明确写死，避免误读为「绝对可通关」）：
//   - 敌人 / 锯齿 / 炮台 / 吊灯摆锤被清空：它们是可击杀或可躲避的周期性障碍，不构成几何阻断。
//   - 尖刺（'^' 瓦片）保留真实伤害：路径累计扣血 ≥ 玩家上限（5）判为致命，不算可达。
//   - 玩家 HP 临时抬到 99 仅用于「允许受伤但记录伤害」，不参与判定。
//   - 按键以固定 60Hz 注入，等价于稳定 60Hz 操作；不覆盖高刷丢帧/手感差异（那是 latency.py 的活）。
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const THEME_KEYS = ['grass', 'cave', 'sky', 'factory', 'lava', 'tower', 'boss', 'wind', 'castle', 'star', 'sea', 'nether'];
const DT = 1 / 60;
const HP_MAX = 5;          // 真实玩家血量上限（BAL.player.hpBase=5；装备加成不参与，取保守值）
const PROBE_HP = 99;       // 搜索期临时血量：允许受伤，靠「累计伤害 < HP_MAX」判定生死

function buildSandbox() {
  const themes = {};
  THEME_KEYS.forEach(k => { themes[k] = {}; });
  let body = read('levels.js');
  for (const f of ['chapter2.js', 'chapter3.js']) if (fs.existsSync(path.join(ROOT, f))) body += '\n' + read(f);
  body += '\n;aggregateLevels();\n' + read('engine.js')
    + '\n;return {Level,ALL_LEVELS,game,loadLevel,updateWorld,PHY,BAL,_ENG_DECOR_HIT};';
  return new Function('THEMES', body)(themes);
}

/* ==================== 世界动态状态快照 ==================== */
// 宏动作模拟会推进机关相位（移动平台位置、崩塌砖计时、拉杆开关、已开门、已捡钥匙）。
// 若不快照，不同分支会互相污染，搜出来的路径在全新关卡上复现不了。
// 这里用 JSON 整体快照（不关心具体字段，新增机关也不会漏），每个节点存一份。
function snapWorld(L, g) {
  return JSON.stringify({
    plats: L.plats, crumbles: [...L.crumbles], springs: L.springs,
    // 传送门两端互相引用（partner），直接 JSON 会循环；只存标量 + 伙伴下标，恢复时重建链接
    portals: L.portals.map(pt => ({ x: pt.x, y: pt.y, w: pt.w, h: pt.h, cd: pt.cd,
      pi: pt.partner ? L.portals.indexOf(pt.partner) : -1 })),
    coins: L.coins, doors: [...L.doors.keys()], saws: L.saws, cannons: L.cannons,
    pends: L.pends, levers: L.levers, chests: L.chests,
    sw: g.switchState, keys: g.keys, coinsN: g.coins, time: g.time,
  });
}
function restoreWorld(L, g, s) {
  const o = JSON.parse(s);
  L.plats = o.plats; L.crumbles = new Map(o.crumbles); L.springs = o.springs;
  L.portals = o.portals.map(pt => ({ x: pt.x, y: pt.y, w: pt.w, h: pt.h, cd: pt.cd, partner: null }));
  o.portals.forEach((pt, i) => { if (pt.pi >= 0) L.portals[i].partner = L.portals[pt.pi]; });
  L.coins = o.coins; L.doors = new Map(o.doors.map(k => [k, { x: 0, y: 0 }]));
  L.saws = o.saws; L.cannons = o.cannons; L.pends = o.pends; L.levers = o.levers; L.chests = o.chests;
  g.switchState = o.sw; g.keys = o.keys; g.coins = o.coinsN; g.time = o.time;
  g.bullets.length = 0; g.parts.length = 0;
  if (g.fxParts) g.fxParts.length = 0;
  if (g.floats) g.floats.length = 0;
  if (g.gearDrops) g.gearDrops.length = 0;
  if (g.pickups) g.pickups.length = 0;
  g.hitStop = 0;
  if (g.ult) g.ult = { on: false, t: 0, fired: false, flashed: false };
}

/* ==================== 宏动作 ==================== */
// 一帧输入：dir(-1/0/1) / jump(持键) / jumpHit(起跳边沿) / dashHit(冲刺边沿)
function mkFrames(o) {
  const maxF = o.maxF || 100, fr = [];
  for (let f = 0; f < maxF; f++) {
    let dir = (o.revAt >= 0 && f >= o.revAt) ? -o.dir : o.dir;
    if (o.stopAt >= 0 && f >= o.stopAt) dir = 0;   // 点按方向 N 帧后松手（进风柱悬停 / 精确落点）
    let jump = 0, jumpHit = 0;
    if (o.hold > 0) {
      if (f === 0) { jump = 1; jumpHit = 1; }
      else if (f < o.hold) jump = 1;
    }
    if (o.djAt >= 0) {                       // 二段跳：到点补一次边沿，之后短持键
      if (f === o.djAt) { jump = 1; jumpHit = 1; }
      else if (f > o.djAt && f < o.djAt + 8) jump = 1;
    }
    fr.push({ dir, jump, jumpHit, dashHit: (o.dashAt >= 0 && f === o.dashAt) ? 1 : 0 });
  }
  return fr;
}
// 分段脚本：mkFrames 只能表达「一个方向 + 一次反向」，表达不了
// 「跳进风柱 → 反向刹车 → 松手悬停爬升 → 借风横移 → 冲刺越渊」这种多段变速走位。
// 风柱关（L8/L11）必须靠这个，否则求解器会把「要在风柱里悬停」误判成死路。
function mkScript(segs, dashAt) {
  const fr = []; let prevJ = 0;
  for (const s of segs) {
    for (let i = 0; i < s.n; i++) {
      const J = s.jump ? 1 : 0;
      fr.push({ dir: s.dir, jump: J, jumpHit: (J && !prevJ) ? 1 : 0,
        dashHit: (dashAt >= 0 && fr.length === dashAt) ? 1 : 0 });
      prevJ = J;
    }
  }
  return fr;
}
function buildMacros() {
  const M = [];
  M.push({ tag: 'wait24', fr: mkFrames({ dir: 0, maxF: 24 }) });
  M.push({ tag: 'wait60', fr: mkFrames({ dir: 0, maxF: 60 }) });
  for (const d of [-1, 1]) {
    // 走宏给多档时长：短档保证平地上也能产出近距离节点（否则一步跨 500px 会跳过落脚点），
    // 长档覆盖「踩弹簧被连续弹飞」的弹道——springV 488 单次滞空 44 帧，弹簧链可连续两三次，
    // 110 帧的窗口会在落地前就截断，整段弹道丢失（L15 弹簧链卡死的真实原因）。
    for (const dur of [20, 50, 120, 260]) {
      M.push({ tag: 'walk' + d + '_' + dur, fr: mkFrames({ dir: d, maxF: dur }) });
    }
    for (const dur of [50, 120]) {
      // 空中冲刺时机要多档：走下平台后「下落一段再冲」是常规操作（起跳即冲会飞过头，
      // 冲早了距离不够）。只有 dashAt=0 一档时，窄落脚区（1 格宽）几乎必然错过。
      for (const dashAt of [0, 8, 16, 26]) {
        M.push({ tag: 'walk' + d + 'dash' + dur + 'x' + dashAt, fr: mkFrames({ dir: d, dashAt, maxF: dur }) });
      }
    }
  }
  // 跳跃：3 方向 × 2 跳跃高度（短跳/满跳）× 6 二段跳时机 × 6 冲刺时机
  // 时机网格必须够密：L4 吊刺带的可通过窗口只有 hold∈{2..8} / dj∈[20..32] / dash∈[0..34]，
  // 二段跳时机差 1 帧就撞刺（实测 dj=20 死、dj=24 活）。粗网格会把「差一帧」判成死路。
  for (const d of [-1, 0, 1]) {
    for (const hold of [4, 16]) {
      for (const djAt of [-1, 8, 16, 20, 24, 28]) {
        for (const dashAt of [-1, 2, 8, 16, 20, 24]) {
          if (d === 0 && dashAt >= 0) continue;       // 原地不跳不冲的组合无意义
          const tag = 'j' + d + 'h' + hold + (djAt >= 0 ? 'd' + djAt : '') + (dashAt >= 0 ? 'D' + dashAt : '');
          M.push({ tag, fr: mkFrames({ dir: d, hold, djAt, dashAt, maxF: 160 }) });
        }
      }
    }
  }
  // 空中反向（起跳后折返）：覆盖「跳起来再往回贴墙」这类走位
  for (const d of [-1, 1]) {
    M.push({ tag: 'jrev' + d, fr: mkFrames({ dir: d, hold: 16, revAt: 10, maxF: 160 }) });
  }
  // 先走下悬崖、下落途中再二段跳：空中起跳的常见走位（不能只靠地面起跳覆盖）
  for (const d of [-1, 1]) {
    for (const djAt of [5, 12, 22]) {
      M.push({ tag: 'fall' + d + 'dj' + djAt, fr: mkFrames({ dir: d, hold: 0, djAt, maxF: 160 }) });
    }
  }
  // 点按方向 N 帧后松手 + 很晚才二段跳：风柱关专用。
  // 风柱只有 2 格宽（32px），一直按方向会直接横穿出柱（吃不到足够风力）；
  // 正确玩法是「点一下进柱 → 松手悬停被吹上去 → 到顶补二段跳」。二段跳时机要 90 帧量级，
  // 现有 fall*dj* 最晚只到 22 帧，整类走位无法表达。
  for (const d of [-1, 1]) {
    for (const stopAt of [10, 12]) {
      for (const djAt of [92, 96, 100, 104, 108]) {
        M.push({ tag: 'tap' + d + '_' + stopAt + 'dj' + djAt,
          fr: mkFrames({ dir: d, stopAt, djAt, maxF: 200 }) });
      }
    }
  }
  // 风柱内多段变速：跳入 → 反向刹车 → 松手悬停爬升 → 借风横移 → 冲刺越渊
  for (const d of [-1, 1]) {
    for (const hoverF of [18, 21, 24]) {
      for (const runF of [16, 20]) {
        const segs = [
          { dir: d, jump: 1, n: 17 },
          { dir: -d, jump: 0, n: 3 },
          { dir: 0, jump: 0, n: hoverF },
          { dir: d, jump: 0, n: runF },
          { dir: d, jump: 0, n: 70 },
        ];
        M.push({ tag: 'wind' + d + 'h' + hoverF + 'r' + runF, fr: mkScript(segs, 17 + 3 + hoverF + runF) });
      }
    }
  }
  return M;
}

/* ==================== 搜索 ==================== */
function hitRect(p, r) {
  return p.x < r.x + r.w && p.x + p.w > r.x && p.y < r.y + r.h && p.y + p.h > r.y;
}
function makeCtx(sb) {
  const g = sb.game, L = g.level, p = g.player;
  // 清掉周期性障碍（可击杀/可躲避，不构成几何阻断）；尖刺是瓦片，保留真实伤害
  L.enemies.length = 0; L.saws.length = 0; L.cannons.length = 0; L.pends.length = 0;
  L.chests.length = 0;
  // v17：交互装饰（尖刺/火/水晶/可碎物）同属「可躲避软层」——16px 随机散布、一步可跨、不构成
  // 几何阻断，与敌人同类清理掉；瓦片尖刺保留（levels.js 数据契约、validateLevels 断言间距）。
  for (let i = L.decor.length - 1; i >= 0; i--) if (sb._ENG_DECOR_HIT[L.decor[i].type]) L.decor.splice(i, 1);
  L.decorFx.length = 0;
  g.bullets.length = 0; g.boss = null;
  p.hp = PROBE_HP; p.maxHp = PROBE_HP;
  g.state = 'play'; g.paused = false; g.puzzleActive = false; g.bagActive = false;
}
function setInput(g, f) {
  const inp = g.input;
  inp.left = f.dir < 0 ? 1 : 0; inp.right = f.dir > 0 ? 1 : 0;
  inp.jump = f.jump; inp.jumpHit = f.jumpHit;
  inp.dash = f.dashHit; inp.dashHit = f.dashHit;
  inp.attack = 0; inp.attackHit = 0; inp.down = 0;
  inp.skillUHit = 0; inp.skillIHit = 0; inp.skillOHit = 0; inp.skillLHit = 0;
}
function clearInput(g) { setInput(g, { dir: 0, jump: 0, jumpHit: 0, dashHit: 0 }); }

// 玩家状态快照/还原。standOn 是「站在哪块移动平台上」的对象引用，
// 直接 JSON 会丢、清成 null 又会丢一帧平台带人位移（p.x += standOn.dx）——
// L3 有 6 块移动平台，每换一次分支就差一帧，整条链累积偏移，witness 回放必然对不上。
// 因此按「在 L.plats 里的下标」存，还原时重新指回当前世界里的那块平台。
function saveP(p, L) {
  const s = Object.assign({}, p);
  s.soIdx = p.standOn ? L.plats.indexOf(p.standOn) : -1;
  delete s.standOn;
  return s;
}
function loadP(p, L, s) {
  Object.assign(p, s);
  p.standOn = (s.soIdx >= 0 && L.plats[s.soIdx]) ? L.plats[s.soIdx] : null;
}

class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(n) {
    const a = this.a; a.push(n); let i = a.length - 1;
    while (i > 0) { const j = (i - 1) >> 1; if (a[j].f <= a[i].f) break; [a[j], a[i]] = [a[i], a[j]]; i = j; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}

// 单目标搜索：从出生点找一条能碰到 target 矩形（已按引擎语义外扩）的按键序列
function search(sb, target, opt) {
  const g = sb.game, L = g.level, p = g.player;
  const macros = opt.macros;
  const cx = target.x + target.w / 2, cy = target.y + target.h / 2;
  const open = new Heap();
  const seen = new Set();
  const rootWorld = snapWorld(L, g);
  const rootP = saveP(p, L);
  // 去重键必须带「冲刺是否就绪」：原地等待（wait 宏）不改变坐标但会走完冲刺冷却，
  // 若只按坐标去重，等待后的状态会被判成重复节点丢弃，导致「冷却中无法再冲」被误当成死路。
  const keyOf = (px, py, sw, ready) => (Math.round(px / 7) + ',' + Math.round(py / 7) + ',' + sw + ',' + ready);
  seen.add(keyOf(p.x, p.y, g.switchState, p.dashCd <= 0 ? 1 : 0));
  open.push({ x: p.x, y: p.y, hp: p.hp, world: rootWorld, psnap: rootP, parent: null, macro: null,
    frames: 0, f: 0, sw: g.switchState });
  let nodes = 0, sims = 0, best = null;
  const t0 = Date.now();

  while (open.size && nodes < opt.nodeCap && Date.now() - t0 < opt.msCap) {
    const nd = open.pop();
    nodes++;
    // 还原到该节点状态
    restoreWorld(L, g, nd.world);
    loadP(p, L, nd.psnap);
    clearInput(g);
    if (hitRect(p, target)) return buildResult(nd, nodes, sims, true);

    for (const mac of macros) {
      // 回到节点初态再跑宏
      restoreWorld(L, g, nd.world);
      loadP(p, L, nd.psnap);
      clearInput(g);
      sims++;
      let landed = null, reached = -1, wasAir = false;
      for (let f = 0; f < mac.fr.length; f++) {
        setInput(g, mac.fr[f]);
        sb.updateWorld(DT); g.tick++;
        if (p.dead) break;
        const dmg = PROBE_HP - p.hp;
        if (dmg >= HP_MAX) break;                       // 累计伤害致命
        if (hitRect(p, target)) { reached = f; break; }
        if (!p.onGround) wasAir = true;
        else if (wasAir) { landed = f; break; }          // 首次落地 = 新节点
      }
      // 纯地面行走（含贴墙走、走上斜坡）全程不离开地面，永远等不到「落地」——
      // 若不在这里补节点，走宏就完全不产出，玩家只能靠跳跃位移（低矮通道直接判死）。
      if (landed === null && !p.dead && p.onGround && reached < 0 && PROBE_HP - p.hp < HP_MAX) {
        landed = mac.fr.length - 1;
      }
      if (reached >= 0) {
        const leaf = { x: p.x, y: p.y, hp: p.hp, world: snapWorld(L, g), psnap: saveP(p, L),
          parent: nd, macro: mac, frames: nd.frames + 1, f: 0, sw: g.switchState, endF: reached + 1 };
        return buildResult(leaf, nodes, sims, true);
      }
      if (landed === null || p.dead) continue;
      const k = keyOf(p.x, p.y, g.switchState, p.dashCd <= 0 ? 1 : 0);
      if (seen.has(k)) continue;
      seen.add(k);
      if (process.env.REACH_DEBUG) console.log('    node (' + Math.round(p.x) + ',' + Math.round(p.y) + ') via ' + mac.tag);
      const dx = (p.x + p.w / 2) - cx, dy = (p.y + p.h / 2) - cy;
      const h = Math.hypot(dx, dy) * 0.5;               // 120px/s ⇒ 0.5 帧/px
      const leaf = { x: p.x, y: p.y, hp: p.hp, world: snapWorld(L, g), psnap: saveP(p, L),
        parent: nd, macro: mac, frames: nd.frames + 1, f: 0, sw: g.switchState, endF: landed + 1 };
      leaf.f = leaf.frames + h * opt.hWeight;
      if (!best || h < best.h) best = { x: p.x, y: p.y, h, frames: leaf.frames };
      open.push(leaf);
    }
  }
  return { ok: false, nodes, sims, ms: Date.now() - t0, best, target: { x: cx, y: cy } };
}

function buildResult(leaf, nodes, sims, ok) {
  // 回溯父链 → 逐帧输入序列
  const chain = [];
  for (let n = leaf; n && n.macro; n = n.parent) chain.push(n);
  chain.reverse();
  const seq = [];
  for (const n of chain) {
    const mac = n.macro;
    // 必须用实际跑过的帧数（endF）：宏本身有 100 帧，落地时只跑了前 endF 帧，
    // 多放一帧就会把角色从落脚点继续推走，回放必然对不上。
    const upto = n.endF || mac.fr.length;
    for (let i = 0; i < upto; i++) seq.push(mac.fr[i]);
  }
  return { ok, nodes, sims, frames: seq.length, seq };
}

/* ==================== witness 回放验证 ==================== */
// 在全新关卡实例上原样重放按键序列：能再次命中才算证明。
function replay(sb, levelIdx, target, seq) {
  sb.loadLevel(levelIdx, false);
  makeCtx(sb);
  const g = sb.game, p = g.player;
  for (let i = 0; i < seq.length; i++) {
    setInput(g, seq[i]);
    sb.updateWorld(DT); g.tick++;
    if (p.dead) return { ok: false, why: '回放中死亡@帧' + i };
    if (PROBE_HP - p.hp >= HP_MAX) return { ok: false, why: '回放中伤害致命@帧' + i };
    if (hitRect(p, target)) return { ok: true, frames: i + 1 };
  }
  return { ok: false, why: '回放走完未命中（' + seq.length + ' 帧）' };
}

/* ==================== 主流程 ==================== */
// 供 gate.js 与 CLI 共用的审计入口（收敛在此处，禁止在 gate 内另写一份）。
// opts: { onlyLevel(0-based) / onRow(row) / nodeCap / msCap }
function auditReach(opts) {
  const o = opts || {};
  const sb = buildSandbox();
  const macros = buildMacros();
  const N = sb.ALL_LEVELS.length;
  const opt = { macros, nodeCap: o.nodeCap || 5000, msCap: o.msCap || 45000, hWeight: 1.0 };
  const rows = [];
  let fail = 0, warn = 0;
  for (let i = 0; i < N; i++) {
    if (o.onlyLevel !== undefined && o.onlyLevel !== i) continue;
    sb.loadLevel(i, false);
    const L0 = sb.game.level;
    const targets = [];
    for (const sh of L0.shrines) targets.push({ kind: 'shrine', idx: sh.idx, name: 'P' + sh.idx,
      rect: { x: sh.x - 8, y: sh.y - 8, w: sh.w + 16, h: sh.h + 16 } });
    if (L0.goal) targets.push({ kind: 'goal', name: '终点',
      rect: { x: L0.goal.x - 2, y: L0.goal.y - 2, w: L0.goal.w + 4, h: L0.goal.h + 4 } });
    for (const t of targets) {
      sb.loadLevel(i, false);
      makeCtx(sb);
      const r = search(sb, t.rect, opt);
      let row;
      if (!r.ok) {
        row = { lv: i + 1, name: L0.meta.name, t: t.name, kind: t.kind, ok: false,
          msg: '搜索未找到路径（节点 ' + r.nodes + '）'
            + (r.best ? '；最近落脚点 (' + Math.round(r.best.x) + ',' + Math.round(r.best.y) + ')'
              + ' 距目标 ' + Math.round(r.best.h * 2) + 'px' : '') };
        fail++;
      } else {
        const v = replay(sb, i, t.rect, r.seq);
        if (v.ok) {
          row = { lv: i + 1, name: L0.meta.name, t: t.name, kind: t.kind, ok: true,
            msg: r.frames + ' 帧 / ' + r.nodes + ' 节点 / 回放命中@' + v.frames };
        } else {
          row = { lv: i + 1, name: L0.meta.name, t: t.name, kind: t.kind, ok: false, warn: true,
            msg: '搜到但回放失败：' + v.why };
          warn++;
        }
      }
      rows.push(row);
      if (o.onRow) o.onRow(row);
    }
  }
  return { rows, fail, warn, pass: rows.length - fail - warn, total: rows.length };
}

function main() {
  const argv = process.argv.slice(2);
  const onlyLevel = argv.find(a => /^--level=/.test(a));
  const r = auditReach({
    onlyLevel: onlyLevel ? (+onlyLevel.split('=')[1] - 1) : undefined,
    onRow: row => console.log('  ' + (row.ok ? '[PASS]' : (row.warn ? '[WARN]' : '[FAIL]'))
      + ' L' + row.lv + ' ' + row.name + ' ' + row.t + '  ' + row.msg),
  });
  console.log('\n可达性：' + r.pass + '/' + r.total + ' 命中（FAIL ' + r.fail + ' / WARN ' + r.warn + '）');
  if (r.fail || r.warn) process.exit(1);
}
if (require.main === module) main();
module.exports = { buildSandbox, buildMacros, search, replay, makeCtx, snapWorld, restoreWorld, auditReach };
