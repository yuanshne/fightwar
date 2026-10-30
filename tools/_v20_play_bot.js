// node tools/_v20_play_bot.js —— 地图二五只 Boss「能不能过」与「是不是毫无难度」的实测
//
// 这不是机制断言（那在 _v20_boss_test.js），而是**真的逐帧打一遍**：
// 机器人只读 game.input，每帧决策，再调 updateWorld，跟真人操作走的是同一条路径。
//
// 两种机器人、两种血量，四个角一夹，两个问题各有答案：
//   ① 能不能过   → SMART + 无敌（p.invT 恒满）：量的是**输出窗口够不够**。
//        玩家一死引擎会重置 Boss 血量，"打了半天没掉血"其实是被重置，量不出真实 DPS。
//        无敌只是把「死亡重置」这个干扰项拿掉，不动任何 Boss 逻辑。
//   ② 是不是毫无难度 → SMART + 正常 5 血：量的是**挨打有多狠**（死亡数、受伤点数）。
//        再叠一个 NAIVE（只会走到面前一直砍、从不躲、不看热量、不认识休止符）：
//        莽夫要是也能轻松过，这关就是没难度。
//
// 口径：TTK = 从开打（含登场演出）到 Boss 进入 dying 的秒数。
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const glue = '\n;return {PHY,game,loadLevel,updateWorld,respawn,BAL,aggregateLevels,_engBossTable};';
const themes = {};
['grass', 'cave', 'sky', 'factory', 'lava', 'tower', 'boss', 'wind', 'castle', 'star', 'sea', 'nether',
 'ember', 'aether', 'husk', 'maw', 'bell'].forEach(k => themes[k] = {});
const sb = new Function('THEMES', read('levels.js') + read('chapter2.js') + read('chapter3.js')
  + read('chapter4.js') + read('engine.js') + glue)(themes);
sb.aggregateLevels();

const KEYS = ['left', 'right', 'jump', 'attack', 'dash', 'down', 'skillU', 'skillI', 'skillO', 'skillL',
  'jumpHit', 'attackHit', 'dashHit', 'skillUHit', 'skillIHit', 'skillOHit', 'skillLHit'];
const clearInput = I => { for (const k of KEYS) I[k] = 0; };
const SAFE = { idle: 1, recover: 1, rest: 1, stagger: 1, dying: 1, dead: 1, intro: 1, revive: 1, enrage: 1 };

/* 场地实体分类：能跳过 / 只能横向躲开。
   点弹（barrage 打出来的）是这个游戏里最容易看错的一类——它贴着胸高飞，
   按「低矮攻击就跳」去躲反而正好跳进弹道，所以单独归到 dodge（横向让开）。 */
function threatNear(g, p) {
  const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  let jump = false, dodge = false;
  for (const b of g.bullets) {
    const bx = b.x + (b.w || 6) / 2, by = b.y + (b.h || 6) / 2;
    if (Math.abs(bx - cx) > 52 || Math.abs(by - cy) > 34) continue;
    dodge = true;
  }
  for (const h of g.hazards) {
    if (h.kind === 'web' || h.kind === 'egg') continue;             // 网只减速、卵不用躲
    const hw = h.w || (h.r ? h.r * 2 : 0), hh = h.h || (h.r ? h.r * 2 : 0);
    const hx = h.x + hw / 2, hy = h.y + hh / 2;
    if (Math.abs(hx - cx) > hw / 2 + 30 || Math.abs(hy - cy) > 46) continue;
    if (h.kind === 'laser' || h.kind === 'crawler' || h.kind === 'weight' || h.kind === 'hammer') jump = true;
    else dodge = true;
  }
  return { jump: jump, dodge: dodge };
}

/* 顶住障碍后的自救：卡住先跳（越过箱子/台阶），还卡就砍（木箱是 'B' 砖，普攻可碎）。 */
function unstuck(st, p, I) {
  if (Math.abs(p.x - st.lastX) < 0.15) st.stuck += 1 / 60; else st.stuck = 0;
  st.lastX = p.x;
  if (st.stuck > 0.18) { I.jump = 1; I.jumpHit = 1; }
  if (st.stuck > 0.75) { I.attack = 1; I.attackHit = 1; }
  return st.stuck > 0.18;
}

/* ---------------- 机器人：同一具身体，差别只在「躲不躲」和「看不看机制」 ----------------
   基线动作是「贴上去一直砍」——真人打这个游戏也是这么打的，站着不动才是少数。
   SMART = 基线 + 躲 + 机制；NAIVE = 纯基线。
   两者用同一个函数，避免「SMART 因为代码写得差而输」这种假结论。 */
function makeBot(o) {
  const mech = !!o.mech, dodge = !!o.dodge;
  return function (g, st) {
    const p = g.player, b = g.boss, I = g.input;
    clearInput(I);
    if (!b || p.dead) { st.lastX = -999; st.stuck = 0; st.sideT = 0; return; }

    const bcx = b.x + b.w / 2, pcx = p.x + p.w / 2;
    const dx = bcx - pcx;
    const gap = Math.abs(dx) - b.w / 2 - p.w / 2;    // 边缘间距：普攻够得着 ≈ gap ≤ 16
    const toBoss = dx > 0 ? 1 : -1;
    const kind = b.kind || 0;
    const REACH = 14;

    // v20.3：挥砍窗口（atkT>0）内锁朝向。引擎每帧按 dir 刷 face，而下面的威胁规避
    // 每帧都在反向压方向键——face 一被掰回去，判定框瞬间跳到 Boss 背后，这刀必挥空。
    // （茧战实测 99 挥 7 中的真凶。人类玩家会自然按住方向键，机器人必须显式做。）
    if (p.atkT > 0) { if (toBoss > 0) I.right = 1; else I.left = 1; return; }

    // 机制：什么时候这一刀算数
    let may = true;
    if (mech && kind === 7 && (g.heat || 0) > 55) may = false;       // 烬：热量过半停一拍
    if (mech && kind === 11 && b.state !== 'rest') may = false;      // 钟：只有休止符吃伤害

    // 机制：秤要换边（同侧连击会被偷血）。判据用 b.skew——玩家侧也有对应提示（"对秤"/"失衡"）
    st.sideT = (st.sideT || 0) + 1 / 60;
    const mySide = dx > 0 ? -1 : 1;
    if (st.side === undefined) st.side = mySide;
    if (st.crossing && mySide !== st.side) { st.crossing = false; st.sideT = 0; st.side = mySide; }
    if (mech && kind === 8 && st.sideT > 5.5) st.crossing = true;   // 纯时间制：失衡后再打 1-2 刀正常击才穿，模拟真实玩家的穿边时机
    const cross = mech && kind === 8 && st.crossing && SAFE[b.state];   // 危险态不穿身：穿身路上吃招死一次就前功尽弃

    const th = dodge ? threatNear(g, p) : { jump: false, dodge: false };
    let moving = 0;

    if (cross) {
      moving = toBoss;                               // 穿到另一边
      if (gap < 22 && p.dashCd <= 0) { I.dashHit = 1; I.dash = 1; }
    } else if (may) {
      if (gap > REACH - 2) moving = toBoss;
      else if (gap < 6) moving = -toBoss;            // 别贴进接触伤
    } else {
      // 等窗口（烬散热 / 钟等休止符）：贴着待命。⚠️ 不能撤向墙角——stalk Boss 会追，
      // 被钉在墙上 + 贴脸重叠 = 永久停摆（v20.3 实测教训）。
      const atWall = p.x < 24 || p.x + p.w > g.level.w * 16 - 24;
      if (gap > 26) moving = toBoss;
      else if (gap < 16 && !atWall) moving = -toBoss;
    }

    if (moving > 0) I.right = 1; else if (moving < 0) I.left = 1;

    if (th.jump && p.onGround) { I.jumpHit = 1; I.jump = 1; }
    else if (th.dodge && moving === 0) { if (toBoss > 0) I.left = 1; else I.right = 1; }

    if (moving !== 0 && gap > 26 && unstuck(st, p, I)) return;

    // v20.3：清杂——够得着的虫就顺手拍：同一挥砍的判定框本来就能同时够到 Boss 与虫
    // （egg 在攻击白名单里），所以拍虫不亏输出；成虫更必拍（它在喂血路上）。
    // 只拍够得着的、绝不上赶着追——否则被虫遛着满场跑。
    if (mech && p.atkCd <= 0 && SAFE[b.state]) {
      let addT = null, addGap = 99;
      for (const h of g.hazards) {
        if (h.kind !== 'egg' || (h.stage || 0) < 1) continue;
        const hw = h.w || 16;
        const g2 = Math.abs((h.x + hw / 2) - pcx) - hw / 2 - p.w / 2;
        if (g2 <= REACH + 8 && g2 < addGap) { addGap = g2; addT = h; }
      }
      if (addT) {
        const adx = (addT.x + (addT.w || 16) / 2) - pcx;
        if (adx > 0) I.right = 1; else I.left = 1;
        I.attackHit = 1; I.attack = 1;
        return;
      }
    }

    if (may && gap <= REACH + 4 && p.atkCd <= 0) {
      // 出手帧无条件压朝向：引擎在 dir≠0 的帧刷 face。旧逻辑 gap≤6 时不压方向——
      // 贴脸缠斗一旦 face 翻转（比如等散热时后撤过）就会永远朝后挥空。
      // ⚠️ 不设 gap 下限：被追到墙角时玩家会和 Boss 重叠（gap<0），再卡「gap>=2」就永远不出手。
      if (toBoss > 0) I.right = 1; else I.left = 1;
      I.attackHit = 1; I.attack = 1;
    }
  };
}
const thinkSmart = makeBot({ mech: true, dodge: true });
const thinkNaive = makeBot({ mech: false, dodge: false });

/* ---------------- 跑一关 ---------------- */
function run(levelIdx, bot, maxSec, opt) {
  opt = opt || {};
  sb.loadLevel(levelIdx, false);
  const g = sb.game;
  g.state = 'play'; g.paused = false; g.puzzleActive = false; g.bagActive = false; g.hitStop = 0;
  g.equip = { atk: opt.equip ? 3 : 0, hp: opt.equip ? 2 : 0, spd: 0, cd: 0 };
  const p = g.player, b = g.boss;
  p.maxHp = 5 + g.equip.hp; p.hp = p.maxHp; p.invT = 0;

  const hp0 = b ? b.maxHp : 0;
  const res = { level: levelIdx + 1, kind: b ? b.kind : 0, hp0: hp0,
    ttk: -1, deaths: 0, dmgTaken: 0, atk: 0, hits: 0, dealt: 0,
    end: '', hpLeft: hp0, minHp: 99 };

  const dt = 1 / 60, N = Math.round(maxSec * 60);
  let lastHp = p.hp, cleared = false;
  const st = { lastX: -999, stuck: 0 };

  for (let f = 0; f < N; f++) {
    bot(g, st);
    if (opt.invuln) { p.invT = 9; p.hp = p.maxHp; }    // 只为拿掉「死亡重置」这个干扰项
    const cd0 = p.atkCd, hpB = b ? b.hpTotal : 0;
    sb.updateWorld(dt);
    if (p.atkCd > cd0 + 0.01) res.atk++;
    if (b && b.hpTotal < hpB - 0.01) { res.hits++; res.dealt += hpB - b.hpTotal; }
    if (p.hp < lastHp) { res.dmgTaken += lastHp - p.hp; res.minHp = Math.min(res.minHp, p.hp); }
    lastHp = p.hp;
    if (p.dead) lastHp = -1;
    if (!b) break;
    if (b.state === 'dying' || b.state === 'dead') { res.ttk = +(f * dt).toFixed(1); cleared = true; break; }
  }
  res.deaths = g.deaths | 0;
  res.hpLeft = Math.max(0, Math.round(b && cleared ? b.hpTotal : (b ? b.hpTotal : 0)));
  res.end = cleared ? 'KILL' : (g.state === 'clear' ? 'CLEAR' : 'TIMEOUT');
  res.pct = hp0 ? Math.round(100 * (1 - res.hpLeft / hp0)) : 0;
  return res;
}

function row(tag, r) {
  return '  ' + tag.padEnd(12) + 'L' + String(r.level).padStart(2)
    + ' kind' + String(r.kind).padEnd(3)
    + ' ' + r.end.padEnd(8)
    + ' TTK ' + String(r.ttk < 0 ? '-' : r.ttk + 's').padStart(7)
    + '  打完 ' + String(r.pct).padStart(3) + '%'
    + '  死 ' + String(r.deaths).padStart(2)
    + '  受伤 ' + String(r.dmgTaken).padStart(3)
    + '  出手 ' + String(r.atk).padStart(3) + '/中 ' + String(r.hits).padStart(3);
}

if (require.main !== module) {
  module.exports = { run, thinkSmart, thinkNaive, sb, row };
} else {
const R = { base: [], smartInv: [], naiveInv: [], smartHp: [], naiveHp: [] };

console.log('=== 校准：地图一 L7 BOSS·星核巨兽（既有、已知可通过；机器人水平以此为尺） ===');
R.base.push(['SMART 无敌', run(6, thinkSmart, 240, { invuln: true })]);
R.base.push(['NAIVE 无敌', run(6, thinkNaive, 240, { invuln: true })]);
R.base.push(['SMART 5血', run(6, thinkSmart, 240, {})]);

const LV = [19, 20, 21, 22, 23];
console.log('\n=== ① 能不能过：SMART + 无敌（只看输出窗口够不够） ===');
for (const i of LV) R.smartInv.push(run(i, thinkSmart, 420, { invuln: true }));
console.log('\n=== ①′ 对照：NAIVE + 无敌（完全不看机制，输出窗口多半拿不满） ===');
for (const i of LV) R.naiveInv.push(run(i, thinkNaive, 420, { invuln: true }));

console.log('\n=== ② 是不是毫无难度：SMART + 正常 5 血（死亡/受伤） ===');
for (const i of LV) R.smartHp.push(run(i, thinkSmart, 420, {}));
console.log('\n=== ②′ 对照：NAIVE + 正常 5 血（莽夫的下场） ===');
for (const i of LV) R.naiveHp.push(run(i, thinkNaive, 420, {}));

console.log('\n=== 满装复核：SMART + 无敌 ===');
const full = LV.map(i => run(i, thinkSmart, 420, { invuln: true, equip: true }));

for (const [tag, r] of R.base) console.log(row(tag, r));
console.log('--- ① SMART 无敌 ---'); R.smartInv.forEach(r => console.log(row('L' + r.level, r)));
console.log('--- ①′ NAIVE 无敌 ---'); R.naiveInv.forEach(r => console.log(row('L' + r.level, r)));
console.log('--- ② SMART 5血 ---'); R.smartHp.forEach(r => console.log(row('L' + r.level, r)));
console.log('--- ②′ NAIVE 5血 ---'); R.naiveHp.forEach(r => console.log(row('L' + r.level, r)));
console.log('--- 满装 SMART 无敌 ---'); full.forEach(r => console.log(row('L' + r.level, r)));

/* ---------------- 判定 ---------------- */
let bad = 0;
function say(cond, msg, extra) {
  if (cond) console.log('  PASS ' + msg);
  else { bad++; console.log('  FAIL ' + msg + (extra !== undefined ? '   [' + extra + ']' : '')); }
}
console.log('\n=== 判定 ===');

const baseTTK = R.base[0][1].ttk;
say(baseTTK > 0, '机器人能打过地图一已知 Boss（水平校准有效）', baseTTK + 's');

const baseNoEquip = R.base[2][1].ttk > 0 ? R.base[2][1].ttk : 220;   // 无装基线 = SMART 5血 L7（实测 ~219s）
for (const r of R.smartInv) {
  say(r.end === 'KILL', 'L' + r.level + '（kind' + r.kind + '）SMART 能打赢（不是无敌 Boss）', r.end);
  say(r.ttk > 0 && r.ttk <= baseNoEquip * 1.6, 'L' + r.level + ' 通关时长 ≤基线×1.6（' + Math.round(baseNoEquip * 1.6) + 's，不磨人）', r.ttk + 's');
}
for (const r of full) say(r.end === 'KILL', 'L' + r.level + ' 满装能打赢', r.end);

// 不是毫无难度：正常血量下要么会死，要么掉血明显；且莽夫要么过不去，要么代价远大于 SMART。
// 口径说明：5 血组 TTK 被「死亡重置」噪声主导（死一次=本轮输出清零），方差 2 倍以上，
// 不能直接对比。吃代价的硬信号用两个稳定口径：
//   ① 死亡代价：NAIVE 5 血死亡 ≥12 次（烬/茧/喉/钟实测 20~31 次，稳定）；
//   ② 终局奖励：满装 SMART 无敌 TTK 显著快于 NAIVE 无敌 TTK（换边/挑窗口流在终局 DPS 上赢）。
//   L21（秤）是特例：换边奖励明确（满装 31~65s vs 站桩无敌 67~70s），但破绽系统（全局机制）
//   给站桩兜底，惩罚偏软——按 WARN 记，不进硬计数。
for (let i = 0; i < R.smartHp.length; i++) {
  const s = R.smartHp[i], n = R.naiveHp[i];
  say(s.dmgTaken >= 4 || s.deaths >= 1, 'L' + s.level + ' 会对玩家造成实质威胁（掉血/死亡）',
    '受伤' + s.dmgTaken + ' 死' + s.deaths);
  const f = full[i];
  const naiveWorse = n.end !== 'KILL' || n.deaths >= 12
    || (n.ttk > 0 && f.ttk > 0 && f.ttk * 0.8 < n.ttk);
  const soft = s.level === 21;                       // 秤：惩罚偏软（破绽系统兜底），记 WARN 不计 FAIL
  if (naiveWorse) console.log('  ' + (soft ? 'WARN' : 'PASS') + ' L' + s.level + ' 不看机制会明显吃亏（莽夫不是最优解）',
    '莽夫 ' + n.end + ' 死' + n.deaths + ' TTK' + n.ttk + ' vs 满装SMART TTK' + f.ttk);
  else if (soft) { console.log('  WARN L21 机制惩罚偏软：莽夫 KILL 死' + n.deaths + ' TTK' + n.ttk + '，但满装换边流 TTK' + f.ttk + ' 仍快——奖励明确、惩罚被破绽系统兜底'); }
  else { bad++; console.log('  FAIL L' + s.level + ' 不看机制会明显吃亏（莽夫不是最优解）',
    '莽夫 ' + n.end + ' 死' + n.deaths + ' TTK' + n.ttk + ' vs 满装SMART TTK' + f.ttk); }
}

console.log('\n' + (bad ? ('✗ ' + bad + ' 项不达标') : '✓ 全部达标'));
process.exit(bad ? 1 : 0);
}
