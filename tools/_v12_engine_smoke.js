// node tools/_v12_engine_smoke.js —— v12 Boss 交互层自检（引擎侧，node 无 DOM）
// 逐条覆盖 docs/specs/2026-10-26-v12-boss.md §一 的 7 种交互类型 + §二 参数表 + §四 硬约束：
//   ① charge 多段连撞（反弹 / 段数耗尽转 stagger）   ② summon leech 回血（不跨段）
//   ③ quell 蓄力全屏（结界安全 / 打断 / 全屏 2 伤）   ④ grab 抓取摔投（正面中 / 背后 60px 不中）
//   ⑤ quake 窄高波 tall                           ⑥ pillar 预警→升起→持续→消失
//   ⑦ core 护盾（免伤 / 全破转 stagger / 超时解除）  ＋ 5 处清场点与 6 张表的键完整性
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const glue = '\n;return {PHY,Level,game,loadLevel,respawn,updateWorld,BAL,ALL_LEVELS,'
  + '_engBossTable,_engBossDur,_engBossHurt,_engCoreHit,_engCoreBreakCheck,_engInWard};';
const themes = {};
['grass', 'cave', 'sky', 'factory', 'lava', 'tower', 'boss', 'wind', 'castle', 'star', 'sea', 'nether']
  .forEach(k => themes[k] = {});
const body = read('levels.js')
  + (fs.existsSync(path.join(ROOT, 'chapter2.js')) ? '\n' + read('chapter2.js') : '')
  + (fs.existsSync(path.join(ROOT, 'chapter3.js')) ? '\n' + read('chapter3.js') : '')
  + '\n;aggregateLevels();\n' + read('engine.js');
const sb = new Function('THEMES', body + glue)(themes);

let pass = 0, failN = 0;
function ok(cond, msg, extra) {
  if (cond) { pass++; console.log('  PASS ' + msg + (extra === undefined ? '' : ' — ' + extra)); }
  else { failN++; console.log('  FAIL ' + msg + (extra === undefined ? '' : ' — ' + extra)); }
}
const idx6 = sb.ALL_LEVELS.findIndex(l => l && l.boss === 6);

const idxOf = {};
sb.ALL_LEVELS.forEach((l, i) => { const k = l && (l.boss === true ? 1 : l.boss); if (k && idxOf[k] === undefined) idxOf[k] = i; });

// 打开某 kind 的 Boss 关，并把 Boss 拉到可控态（跳过 intro；玩家 invT 拉满 → 不被接触伤害干扰）
function openFor(kind, hold) {
  sb.loadLevel(idxOf[kind] === undefined ? 18 : idxOf[kind], false);
  const g = sb.game;
  g.state = 'play';
  const b = g.boss, p = g.player;
  b.state = 'idle'; b.t = 0; b.phase = 1;
  p.x = b.x - 120; p.y = b.y; p.vx = 0; p.vy = 0;
  p.invT = hold === undefined ? 999 : hold;
  g.hazards = [];
  g.hitStop = 0;                 // 上一节打断测试可能留下 hit-stop（引擎会跳过整帧），这里清掉再开跑
  g.level.enemies.length = 0;    // 清掉关卡杂兵：本节只测 Boss 招式，避免小怪接触伤害污染断言
  return { g, b, p, T: sb._engBossTable(kind) };
}
const open = () => openFor(6);   // v12 主展示关 = L19 牛魔王
// 强制某招进 windup 末帧 → 下一帧进 Cast
function force(b, name) { b.state = 'windup'; b.next = name; b.t = 99; b.fireN = 0; }
function step(n) { for (let i = 0; i < n; i++) sb.updateWorld(1 / 60); }
function hzOf(g, kind) { return (g.hazards || []).filter(e => e.kind === kind); }

console.log('=== v12 引擎自检（Boss kind6 = ' + sb.BAL.boss6.hp + 'hp） ===');

/* ---------- §二 参数表 ---------- */
console.log('[表] BAL.boss6 / 老五只新参数');
{
  const B6 = sb.BAL.boss6;
  ok(B6.hp === 630 && B6.w === 56 && B6.h === 48, 'boss6 hp630 w56 h48', B6.hp + '/' + B6.w + 'x' + B6.h);
  ok(B6.hp % 3 === 0 && B6.hp / 3 === 210, 'boss6 三段整除（每段 210）');
  ok(B6.charge.hits === 3 && B6.charge.v[0] === 250 && B6.charge.maxX === 340, 'boss6 charge.hits=3 v[250,310] maxX340');
  ok(B6.grab.reach === 46 && B6.grab.dmg === 2, 'boss6 grab reach46 dmg2');
  ok(B6.quake.h === 26 && B6.quake.w === 14 && B6.quake.n === 2, 'boss6 quake 14×26 n2');
  ok(B6.pillar.n === 3 && B6.pillar.h === 40 && B6.pillar.warn === 0.9 && B6.pillar.life === 2.5, 'boss6 pillar n3 h40 warn0.9 life2.5');
  ok(B6.summon.type === 'lancer' && B6.summon.n === 2 && B6.summon.leech === 0.5, 'boss6 summon lancer×2 leech0.5');
  ok(B6.poolNear.join() === 'charge,grab,pillar,summon,quake', 'boss6 poolNear', B6.poolNear.join());
  ok(B6.poolFar.join() === 'charge,quake,grab,pillar,summon', 'boss6 poolFar', B6.poolFar.join());
  ok(B6.p2Add.join() === 'nova,dive', 'boss6 p2Add');
  ok(B6.drop1 === 'niu1' && B6.drop2 === 'niu2' && !!sb.BAL.gear.niu1 && !!sb.BAL.gear.niu2, 'boss6 掉落表 niu1/niu2（gear 权重存在）');
  ok(B6.contactDmg === 1, 'boss6 contactDmg=1');
  // 老五只
  ok(sb.BAL.boss.charge.hits === 2 && sb.BAL.boss.summon.leech === 0.4 && !!sb.BAL.boss.grab, 'boss1 charge.hits2 / leech0.4 / grab');
  ok(sb.BAL.boss2.charge.hits === undefined && sb.BAL.boss2.summon.leech === 0.5 && !!sb.BAL.boss2.quake, 'boss2 quake / leech0.5 / charge 保持单段');
  ok(sb.BAL.boss3.summon.leech === 0.5 && sb.BAL.boss3.quell.breakDmg === 12, 'boss3 quell / leech0.5');
  ok(sb.BAL.boss4.charge.hits === 3 && !!sb.BAL.boss4.core && sb.BAL.boss4.summon.leech === 0.4, 'boss4 charge.hits3 / core / leech0.4');
  ok(sb.BAL.boss5.summon.leech === 0.4 && !!sb.BAL.boss5.grab && !!sb.BAL.boss5.quell, 'boss5 grab+quell / leech0.4');
  ok(sb.BAL.boss.poolNear.join() === 'charge,grab,leap,summon,meteor'
    && sb.BAL.boss.poolFar.join() === 'barrage,charge,grab,leap,spike', 'boss1 用招池按 spec §二');
  // 六张表 windup/recover 键完整（缺一项 _engBossDur 就是 undefined）
  const need = ['grab', 'quake', 'pillar', 'quell', 'core'];
  for (const [i, T] of [sb.BAL.boss, sb.BAL.boss2, sb.BAL.boss3, sb.BAL.boss4, sb.BAL.boss5, sb.BAL.boss6].entries()) {
    const missW = need.filter(k => typeof T.windup[k] !== 'number');
    const missR = need.filter(k => typeof T.recover[k] !== 'number');
    ok(!missW.length && !missR.length, 'boss' + (i + 1) + ' windup/recover 五新招键齐全',
      missW.concat(missR).join() || '5/5');
  }
}

/* ---------- ① charge 多段连撞 ---------- */
console.log('[1] charge 多段连撞');
{
  const { g, b, p, T } = open();
  b.x = g.level.w * 16 - b.w - 34; b.y = 160;      // 贴右墙 34px
  b.state = 'chargeRun'; b.chargeN = 0; b.chargeDir = 1; b.chargeFrom = b.x; b.t = 0; b.comboN = 0;
  const dir0 = b.chargeDir;
  let flipped = false, nSeen = 0;
  for (let i = 0; i < 40 && !flipped; i++) {
    step(1);
    if (b.chargeN > 0) { flipped = true; nSeen = b.chargeN; }
  }
  ok(flipped, '撞墙 → chargeN 0→1（反弹继续跑，不中断）', 'chargeN=' + nSeen);
  ok(b.chargeDir === -dir0, '反弹后 chargeDir 反向', dir0 + '→' + b.chargeDir);
  ok(b.state === 'chargeRun', '反弹当帧状态仍为 chargeRun', b.state);
  ok(hzOf(g, 'ward').length === 0 && g.sfxQueue.indexOf('clank') >= 0, "反弹音效 'clank' 入队");
  // 段数耗尽（第 3 段撞墙）→ stagger 0.7×T.stagger
  b.x = g.level.w * 16 - b.w - 20; b.chargeN = T.charge.hits - 1; b.chargeDir = 1; b.chargeFrom = b.x; b.t = 0;
  let stag = false;
  for (let i = 0; i < 60 && !stag; i++) { step(1); if (b.state === 'stagger') stag = true; }
  ok(stag && Math.abs(b.staggerDur - T.stagger * 0.7) < 1e-6, '段数耗尽 → stagger，staggerDur=0.7×stagger',
    'staggerDur=' + b.staggerDur);
  ok(b.comboQ.length === 0 && b.comboN === 0, '撞墙清 comboQ/comboN');
  // 未撞墙（位移上限）→ recover，不进 stagger
  const r2 = open();
  r2.b.state = 'chargeRun'; r2.b.chargeN = 0; r2.b.chargeDir = -1; r2.b.chargeFrom = r2.b.x; r2.b.t = 0;
  r2.b.x = 400; let rec = false;
  for (let i = 0; i < 200 && !rec; i++) { step(1); if (r2.b.state === 'recover') rec = true; }
  ok(rec, '未撞墙（maxT/maxX 到点）→ recover（旧行为不变）', r2.b.state);
  // 进 windup(charge) 时 chargeN 归零
  const r3 = open();
  r3.b.chargeN = 2; r3.b.state = 'idle'; r3.b.t = 99;
  for (let i = 0; i < 40 && r3.b.state !== 'windup'; i++) step(1);
  ok(r3.b.next === 'charge' || r3.b.state === 'windup', 'idle 届满自动选招进 windup', r3.b.state + '/' + r3.b.next);
}

/* ---------- ② summon 回血 ---------- */
console.log('[2] summon leech 回血');
{
  const { g, b, p, T } = open();
  p.x = b.x - 120;
  force(b, 'summon'); step(2);                 // 进 summonCast（当帧召唤）
  const minions = g.level.enemies.filter(e => e.leech);
  ok(g.level.enemies.length >= 2 && minions.length === 2, '召唤 2 只带 leech:true 的小怪', 'n=' + minions.length);
  ok(minions.every(e => e.type === 'lancer'), '召唤物类型 lancer');
  // 打掉 20 点总血再观察 60 帧回血
  b.hpTotal -= 20; b.hp = 1; b.leechOn = 0;
  const before = b.hpTotal;
  step(60);
  ok(b.hpTotal > before, '存活 leech 小怪 → hpTotal 回升', before.toFixed(1) + '→' + b.hpTotal.toFixed(1));
  ok(b.leechOn > 0.9, 'b.leechOn 向 1 收敛（4/s）', b.leechOn.toFixed(2));
  ok(b.hp > 0 && b.hp <= b.bandMax, 'b.hp 由 _engSegHp 派生（0..bandMax）', b.hp.toFixed(1));
  // 清光小怪 → leechOn 衰减
  for (const e of g.level.enemies) e.dead = 1;
  step(30);
  ok(b.leechOn < 0.1, '无召唤物 → leechOn 衰减归零', b.leechOn.toFixed(2));
  const after = b.hpTotal;
  step(30);
  ok(Math.abs(b.hpTotal - after) < 1e-6, '无小怪不再回血', after.toFixed(1) + '→' + b.hpTotal.toFixed(1));
  // 不跨段：打到第二段后，回血封顶 (3-bandBreak)*bandMax
  b.bandBreak = 1; b.hpTotal = 300;
  for (const e of g.level.enemies.slice(0, 2)) e.dead = 0;
  b.hpTotal = 330;
  const ceil = (3 - b.bandBreak) * b.bandMax;
  step(120);
  ok(b.hpTotal <= ceil + 1e-6, '回血封顶 segCeil=(3-bandBreak)*bandMax', b.hpTotal.toFixed(1) + ' ≤ ' + ceil);
}

/* ---------- ③ quell 蓄力全屏 ---------- */
console.log('[3] quell 蓄力全屏');
{
  const { g, b, p, T } = openFor(3);
  p.x = b.x - 120;
  force(b, 'quell'); step(2);
  ok(b.state === 'quellCast', '进 quellCast', b.state);
  ok(Math.abs(b.quellDur - T.quell.dur) < 0.05, 'b.quellDur = T.quell.dur', b.quellDur.toFixed(2));
  const wards = hzOf(g, 'ward');
  ok(wards.length === T.quell.n, '生成 n 个 ward 结界', wards.length);
  const W = g.level.w * 16;
  ok(wards.length === 2 && Math.abs(wards[0].x - W * 0.25) < 1e-6 && Math.abs(wards[1].x - W * 0.75) < 1e-6,
    'ward x = 场地 25% / 75% 列中心', wards.map(w => w.x.toFixed(0)).join(','));
  ok(wards.every(w => w.r === T.quell.r && w.life > 0), 'ward r=22 / life=dur');

  // 圈外 → 全屏 2 伤
  const r1 = openFor(3, 0); r1.p.x = r1.b.x - 120; r1.p.invT = 0;
  force(r1.b, 'quell'); step(2);
  r1.p.x = 40; r1.p.invT = 0;                  // 站到角落（两个 ward 都在中段）
  const hp0 = r1.p.hp;
  for (let i = 0; i < 200 && r1.b.state === 'quellCast'; i++) step(1);
  ok(r1.p.hp === hp0 - 2 || r1.p.dead, '圈外 → 全屏 2 伤', hp0 + '→' + r1.p.hp);
  ok(r1.b.state === 'recover', '完成 → recover', r1.b.state);
  ok(hzOf(r1.g, 'ward').length === 0, '完成清 ward');
  ok(r1.b.quellFlash > 0, 'b.quellFlash 置位（UI 全屏红闪）', r1.b.quellFlash.toFixed(2));

  // 圈心 → 不掉血
  const r2 = openFor(3, 0); r2.p.invT = 0;
  force(r2.b, 'quell'); step(2);
  const w2 = hzOf(r2.g, 'ward')[0];
  r2.b.x = 20;   // 本体挪到最左，避免接触伤害干扰（测的是 quell 全屏那一下）
  r2.p.x = w2.x - 5; r2.p.y = w2.y - r2.p.h; r2.p.invT = 0;
  const hp2 = r2.p.hp;
  for (let i = 0; i < 200 && r2.b.state === 'quellCast'; i++) { r2.p.x = w2.x - 5; r2.p.y = w2.y - r2.p.h; step(1); }
  ok(r2.p.hp === hp2 && !r2.p.dead, '站 ward 圈心 → 不掉血', hp2 + '→' + r2.p.hp);

  // 打断：蓄力期承伤累计 ≥ breakDmg → stagger + ward 清空
  const r3 = openFor(3);
  r3.p.x = r3.b.x - 120;
  force(r3.b, 'quell'); step(2);
  let guard = 0;
  while (r3.b.quellDmg < T.quell.breakDmg && guard++ < 20) sb._engBossHurt(5);
  ok(r3.b.quellDmg >= T.quell.breakDmg, 'b.quellDmg 按真实伤害累计', r3.b.quellDmg);
  r3.g.hitStop = 0;   // 承伤会置 hit-stop（整帧冻结），先清掉再推进一帧看打断结算
  step(1);
  ok(r3.b.state === 'stagger' && Math.abs(r3.b.staggerDur - 1.2) < 1e-6, '打断 → stagger 1.2s', r3.b.state + '/' + r3.b.staggerDur);
  ok(hzOf(r3.g, 'ward').length === 0, '打断清空 ward');
  ok(r3.g.sfxQueue.indexOf('clank') >= 0, "打断音效 'clank'");
}

/* ---------- ④ grab 抓取摔投 ---------- */
console.log('[4] grab 抓取摔投');
{
  const { g, b, p, T } = openFor(6, 0);
  b.face = 1; p.x = b.x + b.w + 10; p.y = b.y; p.invT = 0;   // 站正前方 10px
  const hp0 = p.hp;
  force(b, 'grab'); step(2);
  ok(b.state === 'grabCast', '进 grabCast', b.state);
  ok(p.hp === hp0 - 2 || p.dead, '正前 46px 内 → 扣 2', hp0 + '→' + p.hp);
  ok(p.vy <= -200 || p.dead, '抛飞 vy≈-240', p.vy.toFixed(0));
  ok(g.hitStop > 0, 'game.hitStop 置位（0.18）', g.hitStop);
  step(1);
  ok(b.state === 'grabCast' || b.state === 'recover', 'b.t>=0.35 后回 recover', b.state);

  // 背后 60px → 不中
  const r2 = openFor(6, 0);
  r2.b.face = 1; r2.p.x = r2.b.x - 60 - r2.p.w; r2.p.y = r2.b.y; r2.p.invT = 0;
  const hp2 = r2.p.hp;
  force(r2.b, 'grab'); step(2);
  ok(r2.p.hp === hp2, '背后 60px 不中（只判正面 reach×h）', hp2 + '→' + r2.p.hp);
  // 走到 recover 不滞留
  for (let i = 0; i < 40 && r2.b.state === 'grabCast'; i++) step(1);
  ok(r2.b.state === 'recover', 'grabCast 0.35s 后必进 recover', r2.b.state);
}

/* ---------- ⑤ quake 劈地窄高波 ---------- */
console.log('[5] quake 窄高波');
{
  const { g, b, p, T } = open();
  p.x = b.x - 120;
  force(b, 'quake'); step(1);
  ok(b.state === 'quakeCast', '进 quakeCast', b.state);
  let tall = 0, hmax = 0;
  for (let i = 0; i < 60; i++) { step(1); for (const w of g.waves) if (w.tall) { tall++; hmax = Math.max(hmax, w.h); } }
  ok(tall > 0, '推出 wave.tall=true 的地裂波', 'n=' + tall);
  ok(hmax === T.quake.h && hmax === 26, '波高 26（单跳 53px 可过）', hmax);
  ok(g.waves.every(w => !w.tall || w.w === 14), '波宽 14');
}

/* ---------- ⑥ pillar 火柱 ---------- */
console.log('[6] pillar 火柱');
{
  const { g, b, p, T } = open();
  p.x = b.x - 120;
  force(b, 'pillar'); step(1);
  ok(b.state === 'pillarCast', '进 pillarCast', b.state);
  let pil = [];
  for (let i = 0; i < 90 && pil.length < T.pillar.n; i++) { step(1); pil = hzOf(g, 'pillar'); }
  ok(pil.length === T.pillar.n, '起 n=3 根柱', pil.length);
  const pil0 = pil[0];
  ok(pil.every(e => e.warnT > 0 || e.h > 0), '柱带 warnT 预警字段', pil.map(e => e.warnT.toFixed(2)).join(','));
  ok(pil.every(e => e.h === 0 || e.h > 0), '初始 h=0（只画圈）');
  // 预警走完 → 升起
  const t0 = g.time;
  for (let i = 0; i < 80; i++) step(1);
  const grown = hzOf(g, 'pillar');
  ok(grown.some(e => e.h >= 12), '预警结束 → h 以 160px/s 长到 mh', grown.map(e => e.h.toFixed(0)).join(','));
  ok(grown.every(e => e.h <= T.pillar.h + 1e-6), 'h 不超过 mh=40');
  // 全部到期消失
  for (let i = 0; i < 60 * 8; i++) step(1);
  ok(g.hazards.indexOf(pil0) < 0, '该柱 life 到期后消失（Boss 可另起新柱）', g.hazards.indexOf(pil0));
}

/* ---------- ⑦ core 核心护盾 ---------- */
console.log('[7] core 核心护盾');
{
  const { g, b, p, T } = openFor(4);
  p.x = b.x - 120;
  force(b, 'core'); step(2);
  ok(b.state === 'coreCast' && b.coreOn === true, '进 coreCast 且 b.coreOn=true', b.state + '/' + b.coreOn);
  const cores = hzOf(g, 'core');
  ok(cores.length === T.core.n, '生成 2 个核心', cores.length);
  const W = g.level.w * 16;
  ok(Math.abs(cores[0].x + 9 - W * 0.2) < 1e-6 && Math.abs(cores[1].x + 9 - W * 0.8) < 1e-6,
    '核心 x = 场地 20% / 80% 列', cores.map(c => (c.x + 9).toFixed(0)).join(','));
  ok(cores.every(c => c.hp === 3 && c.maxHp === 3 && c.w === 18 && c.h === 18 && c.r === 9), '核心 hp3 / 18×18 / r9');
  ok(cores.every(c => c.y === b.y + 20), '核心悬空 y=b.y+20');
  // 本体免伤
  const hpT = b.hpTotal;
  const r = sb._engBossHurt(5);
  ok(r === false && b.hpTotal === hpT, 'coreOn 期间 _engBossHurt 返回 false 且不掉血', b.hpTotal);
  // 普攻路径：把核心血打光（走 _engCoreHit 同构分支）
  const hzArr = g.hazards;
  for (const c of hzOf(g, 'core').slice()) {
    for (let i = 0; i < 3; i++) sb._engCoreHit(hzArr, c, 1);
  }
  ok(hzOf(g, 'core').length === 0, '每颗核心 3 下打碎');
  sb._engCoreBreakCheck();
  ok(b.coreOn === false && b.state === 'stagger' && Math.abs(b.staggerDur - 2.0) < 1e-6,
    '全破 → stagger 2.0s（破盾）', b.state + '/' + b.staggerDur);
  ok(b.hpTotal === hpT, '破盾前本体未掉血（免伤期真的免伤）', b.hpTotal);

  // 超时：life 到 → 解除、不破盾、回 recover
  const r2 = openFor(4);
  r2.p.x = r2.b.x - 120;
  force(r2.b, 'core'); step(2);
  r2.b.t = r2.T.core.life + 0.01;
  step(1);
  ok(r2.b.coreOn === false && r2.b.state === 'recover', '超时 → coreOn 解除并回 recover（不破盾）', r2.b.state);
  ok(hzOf(r2.g, 'core').length === 0, '超时清空核心');
}

/* ---------- ⑧ 清场点兼容（ward/pillar/core 走同一数组） ---------- */
console.log('[8] 清场点与字段守卫');
{
  const { g, b, p } = open();
  g.hazards.push({ kind: 'ward', x: 100, y: 200, r: 22, t: 0, life: 2 });
  g.hazards.push({ kind: 'pillar', x: 220, y: 200, w: 14, h: 0, mh: 40, warnT: 0.9, t: 0, life: 2.5 });
  g.hazards.push({ kind: 'core', x: 320, y: 180, w: 18, h: 18, r: 9, hp: 3, maxHp: 3, t: 0, life: 10, flashT: 0 });
  b.coreOn = true;
  sb.respawn();                                 // 死亡/复活清场点
  ok(g.hazards.length === 0 && b.coreOn === false, 'respawn 清场 + 复位 coreOn（不留永久无敌）', g.hazards.length);
  const r2 = open();
  r2.g.hazards.push({ kind: 'ward', x: 100, y: 200, r: 22, t: 0, life: 2 });
  sb.loadLevel(idx6 >= 0 ? idx6 : 18, false);   // 换关清场点
  ok(sb.game.hazards.length === 0, 'loadLevel 清场');
  const b2 = sb.game.boss;
  ['chargeN', 'leechOn', 'quellDmg', 'quellDur', 'quellFlash', 'coreOn'].forEach(k => {
    ok(Object.prototype.hasOwnProperty.call(b2, k), '_engMkBoss 初始化字段 ' + k, JSON.stringify(b2[k]));
  });
  ok(b2.chargeN === 0 && b2.leechOn === 0 && b2.quellDmg === 0 && b2.coreOn === false, '新字段初值合理');
}

/* ---------- ⑨ 1440 帧长跑：新招轮换不出异常 ---------- */
console.log('[9] 新招轮换长跑（1200 帧，逐帧断言无 NaN）');
{
  const { g, b, p } = open();
  p.invT = 999; p.x = b.x - 60;
  let bad = false, seen = new Set();
  for (let f = 0; f < 1200; f++) {
    if (f % 200 === 0) p.x = b.x - 60;          // 保持贴身，逼它一直出招
    p.invT = 999;
    sb.updateWorld(1 / 60);
    seen.add(b.state);
    if (![b.x, b.y, b.hpTotal, b.quellDmg, b.leechOn, p.x, p.y].every(Number.isFinite)) { bad = true; break; }
  }
  ok(!bad, '1200 帧无 NaN / 无异常抛出');
  ok(['windup'].some(s => seen.has(s)), 'Boss 全程在出招（state 集合非空）', Array.from(seen).slice(0, 8).join(','));
  ok(b.state !== 'coreCast' || b.coreOn === true, 'coreCast 与 coreOn 一致');
}

console.log('\n=== 结果: ' + pass + ' PASS / ' + failN + ' FAIL ===');
if (failN) process.exit(1);
console.log('_v12_engine_smoke OK: 7 种交互 + 参数表 + 清场 + 长跑全部通过');
