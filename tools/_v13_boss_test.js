// node tools/_v13_boss_test.js —— v13 五种新交互类型独立验收（不依赖 engine 队自检）
// 每条都按「玩家该做的动作」断言，不是"代码跑了没报错"：
//   T1 parry   反伤架势：普通攻击不掉血但反弹自己 / 大招破招 → 破绽 + 破防窗口
//   T2 mirror  真假身：n 具同貌幻影、真身隐身 / 打假身爆炸扣血 / 打真身显形进破绽 / 超时保底显形
//   T3 pushwall 推进墙：从玩家背后入场朝 Boss 推 / 碰到扣 2 / 出场自删（不留残留）
//   T4 bomb    弹跳炸弹：抛起→落地弹跳→引信到期爆炸 / 最终全部自爆（不会永久留在场上）
//   T5 mist    水雾区：站里面持续掉血 / 站外面不扣 / 到期消失
//   T6 breakT  破防窗口：伤害 ×2（不是 stagger 的 1.5）
//   T7 选招覆盖：5 个 Boss 各自的新招都能被轮转选中
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..');
const glue = '\n;return {PHY,Level,game,loadLevel,respawn,killPlayer,levelClear,updateWorld,LEVELS,'
  + 'ALL_LEVELS,aggregateLevels,getLevels:()=>ALL_LEVELS,_engHurtPlayer,_engBossHurt,_engMkBoss,'
  + '_engBossTable,_engBossPick,BAL};';
const themes = {}; ['grass','cave','sky','factory','lava','tower','boss','wind','castle','star','sea','nether']
  .forEach(k => themes[k] = {});
const sb = new Function('THEMES', fs.readFileSync(path.join(ROOT, 'levels.js'), 'utf8')
  + fs.readFileSync(path.join(ROOT, 'chapter2.js'), 'utf8')
  + fs.readFileSync(path.join(ROOT, 'chapter3.js'), 'utf8')
  + fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8') + glue)(themes);
sb.aggregateLevels();   // 章节注册表在 levels.js 之后才 push，测试里手动再聚合一次（幂等）
let pass = 0, fail = 0;
function ok(cond, msg, extra) {
  if (cond) { pass++; console.log('  PASS ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? '   [' + extra + ']' : '')); }
}
function bossworld(kind, lvIdx) {
  sb.loadLevel(lvIdx, false);
  const g = sb.game; g.state = 'play'; g.boss.state = 'idle'; g.boss.t = 0;
  g.boss.hpTotal = g.boss.maxHp; g.boss.hp = g.boss.bandMax; g.boss.bandBreak = 0; g.boss.phase = 1;
  g.level.enemies.length = 0;           // 清杂兵：只测招式本身，别被贴身接触伤污染
  g.bullets.length = 0; g.waves.length = 0; g.hazards.length = 0;
  return g;
}
function cast(b, name) { b.next = name; b.state = 'windup'; b.t = 0; b.fireN = 0; }
/* L18 是双 Boss（boss4 首发、boss5 接力），loadLevel 只会给首发那一棒。
   测 kind5 的参数必须手动换人——用引擎自己的 _engMkBoss 造，锚点按旧 Boss 的脚底反推，
   保证不引入第二份构造逻辑（R4）。 */
function forceKind(g, kind) {
  const old = g.boss;
  if ((old.kind | 0) === kind) return g;
  const py = old.y + old.h - 16;                       // _engMkBoss: y = py+16-h → py = y+h-16
  const nb = sb._engMkBoss(old.x + old.w / 2, py, kind);
  nb.state = 'idle'; nb.t = 0;
  nb.hpTotal = nb.maxHp; nb.hp = nb.bandMax; nb.bandBreak = 0; nb.phase = 1;
  g.boss = nb;
  return g;
}

/* ==================== T1 parry 反伤架势（boss5 圣裁者，L18） ==================== */
console.log('[T1] parry 反伤架势：普通攻击打上去 = 自伤');
{
  const g = forceKind(bossworld(4, 17), 5), b = g.boss, p = g.player;   // L18 首发是 boss4，手动换成圣裁者
  cast(b, 'parry');
  let reached = false;
  for (let f = 0; f < 180 && !reached; f++) { sb.updateWorld(1 / 60); if (b.state === 'parryCast') reached = true; }
  ok(reached, '能进入 parryCast 态（实际 ' + b.state + '）');
  ok(b.parryOn === true, 'parryOn 置位');

  const hp0 = b.hpTotal;
  p.invT = 0; p.hp = p.maxHp;
  const r1 = sb._engBossHurt(2, false);
  ok(b.hpTotal === hp0, '普通攻击被架势挡下，Boss 一滴血不掉（' + hp0 + '→' + b.hpTotal + '）');
  ok(p.hp < p.maxHp, '攻击者自己被反弹掉血（' + p.maxHp + '→' + p.hp + '）');
  ok(r1 === false, '挡下时返回 false（调用方不该放打击特效）');

  // 大招破招
  b.parryOn = true; b.state = 'parryCast'; b.t = 0;
  p.invT = 0; p.hp = p.maxHp;
  const hp1 = b.hpTotal;
  const r2 = sb._engBossHurt(2, true);
  ok(b.parryOn === false, '大招命中 → 架势被打散');
  ok(b.state === 'stagger', '破招后进破绽（实际 ' + b.state + '）');
  ok((b.breakT || 0) > 0, '破防窗口置位（breakT=' + (b.breakT || 0).toFixed(2) + 's）');
  ok(r2 === true && b.hpTotal < hp1, '破招这一击照常扣血（' + hp1 + '→' + b.hpTotal + '）');
  ok(p.hp === p.maxHp, '破招不反弹给玩家（大招是正解，不该罚）');

  // 到期自动收架势
  cast(b, 'parry');
  reached = false;
  for (let f = 0; f < 180 && !reached; f++) { sb.updateWorld(1 / 60); if (b.state === 'parryCast') reached = true; }
  let outT = 0;
  while (b.state === 'parryCast' && outT < 300) { sb.updateWorld(1 / 60); outT++; }
  ok(outT < 300 && b.parryOn === false,
    '架势到期自动解除（' + (outT / 60).toFixed(2) + 's，表值 dur=' + sb.BAL.boss5.parry.dur + '）');
}

/* ==================== T2 mirror 真假身（boss3 判官，L16） ==================== */
console.log('[T2] mirror 真假身：打错目标会炸自己');
{
  const g = bossworld(3, 15), b = g.boss, p = g.player;
  const N = sb.BAL.boss3.mirror.n;
  cast(b, 'mirror');
  for (let f = 0; f < 120; f++) sb.updateWorld(1 / 60);
  const ms = (g.hazards || []).filter(h => h.kind === 'mirror');
  ok(ms.length === N, '生成 ' + N + ' 具幻影（实际 ' + ms.length + '）');
  ok(b.hidden === false, '真身可见——唯一线索是眼睛颜色（v13.1 改判：不隐身才有「看清再打」）');
  const reals = ms.filter(h => h.real), fakes = ms.filter(h => !h.real);
  ok(reals.length === 1 && fakes.length === N - 1, '恰好 1 真 ' + (N - 1) + ' 假（真 ' + reals.length + ' / 假 ' + fakes.length + '）');

  const realXBefore = b.x;                       // 记录真身位置，验证打假身不会挪它
  // 打假身
  if (fakes.length) {
    const fk = fakes[0];
    p.invT = 0; p.hp = p.maxHp;
    fk.hp = 0;                                     // 模拟被打光 → 交给 hazard 循环统一收尸
    for (let f = 0; f < 6; f++) sb.updateWorld(1 / 60);
    ok(!g.hazards.includes(fk), '假幻影被击破后从场上移除');
    ok(p.hp < p.maxHp, '打假身 → 玩家被爆炸扣血（' + p.maxHp + '→' + p.hp + '）');
    ok(b.x === realXBefore, '打假身不会挪动真身（' + realXBefore.toFixed(0) + '）');
  }

  // 打真身
  if (reals.length) {
    const rl = reals[0];
    rl.hp = 0;
    for (let f = 0; f < 6; f++) sb.updateWorld(1 / 60);
    ok(b.hidden === false, '打中真身 → 真身显形');
    ok(b.state === 'stagger', '真身被识破 → 进破绽（实际 ' + b.state + '）');
  }

  // 超时保底（硬约束 6：不允许永久隐身）
  cast(b, 'mirror');
  for (let f = 0; f < 120; f++) sb.updateWorld(1 / 60);
  for (let f = 0; f < 400; f++) sb.updateWorld(1 / 60);
  ok(b.hidden === false && b.state !== 'mirrorCast',
    '超时（life=' + sb.BAL.boss3.mirror.life + 's）后退出招式，不会卡在 mirrorCast');
  ok((g.hazards || []).filter(h => h.kind === 'mirror').length === 0, '超时后幻影全部清除');
}

/* ==================== T3 pushwall 推进墙（boss4 冥古龙，L18） ==================== */
console.log('[T3] pushwall 推进墙：站桩会被推死');
{
  const g = bossworld(4, 17), b = g.boss, p = g.player;
  p.x = b.x - 250; p.y = b.y; p.invT = 9e9;        // 玩家在 Boss 左侧 → 墙从更左边（背后）来
  cast(b, 'push');
  for (let f = 0; f < 150; f++) sb.updateWorld(1 / 60);
  const ws = (g.hazards || []).filter(h => h.kind === 'pushwall');
  ok(ws.length === 1, '生成 1 堵推进墙（实际 ' + ws.length + '）');
  if (ws.length) {
    const w = ws[0];
    ok(w.dir === 1, '从玩家背后出发朝 Boss 推进（dir=' + w.dir + '，玩家在 Boss 左侧）');
    ok(w.x < p.x, '初始位置在玩家背后（墙 ' + w.x.toFixed(0) + ' < 玩家 ' + p.x.toFixed(0) + '）');
    const x0 = w.x;
    for (let f = 0; f < 30; f++) sb.updateWorld(1 / 60);
    ok(w.x > x0 + 20, '墙在推进（0.5s 走了 ' + (w.x - x0).toFixed(0) + 'px，表值 v=' + sb.BAL.boss4.push.v + '）');

    // 撞人
    p.invT = 0; p.hp = p.maxHp; p.x = w.x + 2; p.y = w.y;
    sb.updateWorld(1 / 60);
    ok(p.hp <= p.maxHp - sb.BAL.boss4.push.dmg + 0.001 || p.shieldT > 0,
      '被墙压到扣 ' + sb.BAL.boss4.push.dmg + ' 心（' + p.maxHp + '→' + p.hp + '）');

    // 出场自删（硬约束 6）
    p.invT = 9e9; p.x = 40;
    w.x = g.level.w * 16 - 20;
    for (let f = 0; f < 60; f++) sb.updateWorld(1 / 60);
    ok(!g.hazards.includes(w), '推到场地尽头后自删，不留残留');
  }
}

/* ==================== T4 bomb 弹跳炸弹（boss6 牛魔王，L19） ==================== */
console.log('[T4] bomb 弹跳炸弹：落点会变，站死会被二次命中');
{
  const g = bossworld(6, 18), b = g.boss, p = g.player;
  p.x = 40; p.invT = 9e9;                           // 玩家躲远，只看炸弹行为
  cast(b, 'bomb');
  let sawAir = false, sawBounce = false, maxN = 0;
  for (let f = 0; f < 200; f++) {
    sb.updateWorld(1 / 60);
    const bs = (g.hazards || []).filter(h => h.kind === 'bomb');
    maxN = Math.max(maxN, bs.length);
    for (const e of bs) {
      if ((e.vy || 0) < -20) sawAir = true;
      if ((e.bounceN | 0) < sb.BAL.boss6.bomb.bounce) sawBounce = true;
    }
  }
  ok(maxN >= 1, '抛出炸弹（场上峰值 ' + maxN + ' 颗，表值 n=' + sb.BAL.boss6.bomb.n + '）');
  ok(sawAir, '有抛物线飞行段（vy 向上）');
  ok(sawBounce, '落地发生过弹跳（bounceN 下降）');
  const remaining = (g.hazards || []).filter(h => h.kind === 'bomb').length;
  for (let f = 0; f < 900 && (g.hazards || []).filter(h => h.kind === 'bomb').length; f++) sb.updateWorld(1 / 60);
  ok((g.hazards || []).filter(h => h.kind === 'bomb').length === 0,
    '引信到期后全部自爆消失（中途剩余 ' + remaining + '）');

  // 空中直接命中玩家：必须也炸
  const g2 = bossworld(6, 18), b2 = g2.boss, p2 = g2.player;
  cast(b2, 'bomb');
  for (let f = 0; f < 60; f++) sb.updateWorld(1 / 60);   // 出弹
  const bs2 = (g2.hazards || []).filter(h => h.kind === 'bomb');
  if (bs2.length) {
    const e = bs2[0];
    p2.invT = 0; p2.hp = p2.maxHp;
    e.x = p2.x + p2.w / 2; e.y = p2.y + p2.h / 2;         // 直接把玩家塞进炸弹里
    sb.updateWorld(1 / 60);
    ok(p2.hp < p2.maxHp || !g2.hazards.includes(e), '空中撞到玩家 → 命中扣血或立即引爆');
  }
}

/* ==================== T5 mist 水雾区（boss2 蛟龙，L13） ==================== */
console.log('[T5] mist 水雾区：纯减速零伤害（v18.1）');
{
  const g = bossworld(2, 12), b = g.boss, p = g.player;
  const M = sb.BAL.boss2.mist;
  p.x = b.x - 200; p.invT = 9e9;
  cast(b, 'mist');
  for (let f = 0; f < 130; f++) sb.updateWorld(1 / 60);
  const ms = (g.hazards || []).filter(h => h.kind === 'mist');
  ok(ms.length === M.n, '生成 ' + M.n + ' 片水雾（实际 ' + ms.length + '）');
  if (ms.length) {
    const m = ms[0];
    ok(m.h > 48, '雾墙够高，跳不出去（h=' + m.h + 'px）');

    // 站进去（v18.1：纯减速零伤害——hp 不动，减速标记生效）
    p.invT = 0; p.hp = p.maxHp;
    p.x = m.x + m.w / 2; p.y = m.y - p.h;
    const before = p.hp;
    for (let f = 0; f < Math.ceil(M.tick * 60) + 4; f++) sb.updateWorld(1 / 60);
    ok(p.hp === before, '站在雾里不掉血（dmg=0 纯减速，' + before + '→' + p.hp + '）');
    ok(p.mistT > 0, '雾内减速标记生效（mistT=' + (p.mistT || 0).toFixed(3) + '）');

    // 站外面
    p.invT = 0; p.hp = p.maxHp;
    const farX = ms.reduce((a, c) => Math.min(a, c.x), 1e9) - 160;
    p.x = Math.max(20, farX); p.y = m.y - p.h;
    b.x = g.level.w * 16 - 120; b.y = m.y - b.h;       // Boss 也挪远，避免接触伤干扰
    const before2 = p.hp;
    for (let f = 0; f < Math.ceil(M.tick * 60) + 4; f++) sb.updateWorld(1 / 60);
    ok(p.hp === before2, '离开雾区不再掉血（' + before2 + '→' + p.hp + '）');

    // 到期
    for (let f = 0; f < Math.ceil(M.life * 60) + 30; f++) sb.updateWorld(1 / 60);
    ok((g.hazards || []).filter(h => h.kind === 'mist').length === 0,
      'life=' + M.life + 's 到期后全部消散');
  }

  // ---- v18 §一：雾内减速（slow=0.5）----
  ok(M.slow === 0.5, '参数表 slow=0.5（实际 ' + M.slow + '）');
  {
    const g2 = bossworld(2, 12), b2 = g2.boss, p2 = g2.player;
    p2.invT = 9e9; p2.x = b2.x - 200;
    cast(b2, 'mist');
    for (let f = 0; f < 130; f++) sb.updateWorld(1 / 60);
    const ms2 = (g2.hazards || []).filter(h => h.kind === 'mist');
    ok(ms2.length > 0, '减速组：雾已生成');
    const m2 = ms2[0];
    // 站进雾里：接触标记生效 + 普跑被钳到 maxRun×slow=60
    p2.hp = p2.maxHp; p2.x = m2.x + m2.w / 2; p2.y = m2.y - p2.h;
    for (let f = 0; f < 6; f++) sb.updateWorld(1 / 60);
    ok(p2.mistT > 0, '雾内接触标记 mistT 生效（' + (p2.mistT || 0).toFixed(3) + '）');
    p2.vx = 200;
    sb.updateWorld(1 / 60);
    ok(Math.abs(p2.vx) <= 120 * M.slow + 1e-6,
      '雾内普跑钳制 120→' + (120 * M.slow) + '（实测 ' + Math.abs(p2.vx).toFixed(1) + '）');
    // 冲刺不压速：dash 中爆发段 vx=260，不被雾的普跑钳制碰
    p2.dashT = 0.20; p2.dashDir = 1;
    sb.updateWorld(1 / 60);
    ok(Math.abs(p2.vx) > 120 * M.slow + 1,
      '冲刺不受雾减速（vx=' + Math.abs(p2.vx).toFixed(1) + ' > 60）');
    // 出雾恢复
    p2.dashT = 0; p2.x = 20; p2.y = m2.y - p2.h;
    for (let f = 0; f < 10; f++) sb.updateWorld(1 / 60);
    p2.vx = 200; sb.updateWorld(1 / 60);
    ok(Math.abs(p2.vx) > 100, '出雾后移速恢复（vx=' + Math.abs(p2.vx).toFixed(1) + '）');
  }
}

/* ==================== T6 breakT 破防窗口 ==================== */
console.log('[T6] breakT 破防窗口：伤害 ×2');
{
  const g = forceKind(bossworld(4, 17), 5), b = g.boss;
  b.state = 'idle'; b.breakT = 0;
  const h0 = b.hpTotal; sb._engBossHurt(2, false);
  const plain = h0 - b.hpTotal;
  b.state = 'stagger'; b.breakT = 0;
  const h1 = b.hpTotal; sb._engBossHurt(2, false);
  const stag = h1 - b.hpTotal;
  b.breakT = 2.0;
  const h2 = b.hpTotal; sb._engBossHurt(2, false);
  const brk = h2 - b.hpTotal;
  ok(plain === 2, '普通状态伤害 = 2（实际 ' + plain + '）');
  ok(stag === 3, '破绽期 ×1.5 = 3（实际 ' + stag + '）');
  ok(brk === 4, '破防期 ×2 = 4（实际 ' + brk + '）');

  b.breakT = 1.0;
  for (let f = 0; f < 90; f++) sb.updateWorld(1 / 60);
  ok((b.breakT || 0) === 0 || b.breakT < 0.05, 'breakT 会随时间递减归零（剩 ' + (b.breakT || 0).toFixed(2) + '）');
}

/* ==================== T8 召唤冷却（玩家反馈：不能一直召唤） ==================== */
// v16：summon 已不是牛魔王招牌（spec §二 牛魔王=冲撞/火油弹/火柱/抓取），boss6 池里没有它，
// 留在 boss6 上测「冷却好了还能再召」只会得到一条永远选不中的假 PASS。
// 这条验的是「召唤冷却」这个机制本身，因此换到池里仍带 summon 的 boss1（L7）上测，意图不变。
console.log('[T8] summon 召唤冷却与清场成本');
{
  const g = bossworld(1, 6), b = g.boss, p = g.player;
  const S = sb.BAL.boss.summon;
  p.x = b.x - 200; p.y = b.y; p.invT = 9e9;
  b.state = 'idle'; b.t = 0; b.summonCd = 0;

  cast(b, 'summon');
  for (let f = 0; f < 90; f++) sb.updateWorld(1 / 60);
  const minions = g.level.enemies.filter(e => e.leech);
  ok(minions.length === S.n, '召唤出 ' + S.n + ' 只（实际 ' + minions.length + '）');
  ok(minions.every(e => e.hp === S.hp), '召唤体血量 = 表值 ' + S.hp + '（不是基础血 ' + sb.BAL.enemy[S.type].hp + '）',
    minions.map(e => e.hp).join('/'));
  ok((b.summonCd || 0) > S.cd - 5, '召唤后进入冷却（剩 ' + (b.summonCd || 0).toFixed(1) + 's / 表值 ' + S.cd + 's）');

  // 冷却期内连选 40 次都不许出 summon（这是"不能一直召唤"的核心断言）
  let got = [];
  for (let i = 0; i < 40; i++) { sb._engBossPick(b); got.push(b.next); b.state = 'idle'; b.t = 0; }
  ok(!got.includes('summon'), '冷却期内 40 次选招都不出 summon', got.join('/'));

  // v22 改口径：撤销 v21「整场限一轮」误削（用户：「技能都写了就别这样了」）——
  // 冷却归零 + 清场 + 站近后，summon 必须重新可选（周期技能，cd 18s 控制间隔）。
  // 注意还要先清场 + 站近——排除 alive 过滤与 poolFar 两个无关干扰项。
  b.summonCd = 0;
  g.level.enemies.forEach(e => { e.dead = 1; });
  p.x = b.x + 20; p.y = b.y;
  let got2 = [];
  for (let i = 0; i < 30; i++) { sb._engBossPick(b); got2.push(b.next); b.state = 'idle'; b.t = 0; }
  ok(got2.includes('summon'), 'v22：冷却归零后 summon 重新进池（30 次选招至少出一次）', got2.join('/'));

  // 清场成本：别让「打小怪」变成主玩法
  const totalHp = S.hp * S.n, hits = Math.ceil(totalHp / sb.BAL.player.atkBase);
  ok(totalHp <= 10, '两只召唤体总血 ' + totalHp + ' ≤ 10（' + hits + ' 刀，旧版 18 血要 9 刀）');
}

/* ==================== T9 招式池规模 + 招牌唯一性 ==================== */
// v16 改口径（spec 2026-10-27-v16-boss-exclusive §二）：池子从「每只 ≥7 招」收成
// 「P1 = 4 招招牌 + barrage 普攻」，招牌六只零重合。原断言按旧池子写死「≥7 招」和三组
// 过期的招牌名单（boss3 还在要 clone、boss4 还在要 breath），现在改为按新规格的集合断言：
// 只验「每只都带自己的 4 招招牌 + 弹幕」「24 个招牌槽位互不相同」，池子的具体顺序不钉死。
console.log('[T9] 招式池：每只 = 4 招牌 + barrage，24 个招牌槽位零重合');
{
  const tables = { 1: sb.BAL.boss, 2: sb.BAL.boss2, 3: sb.BAL.boss3, 4: sb.BAL.boss4, 5: sb.BAL.boss5, 6: sb.BAL.boss6 };
  // 招牌招（每只 Boss 独有的记忆点，同时也是玩家要分别学会的应对动作）
  const SIG = { 1: ['meteor', 'spike', 'summon', 'leap'],
                2: ['sweep', 'mist', 'pull', 'breath'],
                3: ['scythe', 'blink', 'mirror', 'quell'],
                4: ['push', 'core', 'quake', 'clone'],
                5: ['halo', 'parry', 'homing', 'totem'],
                6: ['charge', 'bomb', 'pillar', 'grab'] };
  for (const k of [1, 2, 3, 4, 5, 6]) {
    const pool = tables[k].poolNear || [];
    ok(pool.length === 4 + 1, 'boss' + k + ' poolNear 恰好 5 招（4 招牌 + barrage）', pool.join('/'));
    ok(SIG[k].every(n => pool.includes(n)), 'boss' + k + ' 招牌招齐全', SIG[k].join('/'));
    ok(pool.includes('barrage'), 'boss' + k + ' 带公共普攻 barrage');
  }
  // 招牌互斥：任一招牌只属于一个 Boss（全 24 招两两不重合）
  const owner = {};
  let clash = [];
  for (const k of Object.keys(SIG)) for (const n of SIG[k]) {
    if (owner[n] && owner[n] !== +k) clash.push(n + '(' + owner[n] + '/' + k + ')');
    owner[n] = +k;
  }
  ok(clash.length === 0, '6 只 Boss 的 24 招招牌零重合', clash.join(',') || 'none');
  // 公共层只剩 barrage：六只 poolNear 的交集应该恰好是它（nova 只在 P2 的 p2Add 里追加）
  const common = (tables[1].poolNear || []).filter(n => [2, 3, 4, 5, 6].every(k => (tables[k].poolNear || []).includes(n)));
  ok(common.length === 1 && common[0] === 'barrage', '六只 poolNear 的唯一公共招是 barrage', common.join('/'));
  // dive 与 leap 是同一套抛物线（spec §一.4）：已从所有池里撤下，别再回来
  const diveIn = [1, 2, 3, 4, 5, 6].filter(k => (tables[k].poolNear || []).concat(tables[k].poolFar || [], tables[k].p2Add || []).includes('dive'));
  ok(diveIn.length === 0, 'dive 不在任何 Boss 的池里（与 leap 重合，已退场）', 'boss' + diveIn.join('/boss'));
}

/* ==================== T7 选招覆盖 ==================== */
console.log('[T7] 选招覆盖：5 个 Boss 的新招都能轮到');
{
  const cases = [
    { kind: 2, lv: 12, move: 'mist' },
    { kind: 3, lv: 15, move: 'mirror' },
    { kind: 4, lv: 17, move: 'push' },
    { kind: 5, lv: 17, move: 'parry' },
    { kind: 6, lv: 18, move: 'bomb' }
  ];
  for (const c of cases) {
    const g = forceKind(bossworld(c.kind, c.lv), c.kind), b = g.boss, p = g.player;
    p.x = b.x; p.y = b.y;                       // 拉近 → 走 poolNear
    b.state = 'idle'; b.pickN = 0; b.lastPattern = ''; b.phase = 2;
    const seen = new Set();
    for (let i = 0; i < 24; i++) {
      sb._engBossPick(b);
      seen.add(b.next);
      b.state = 'idle'; b.t = 0;
    }
    ok(seen.has(c.move), 'kind' + c.kind + ' 能选出 ' + c.move + '（轮转 24 次共出 ' + seen.size + ' 种）',
      Array.from(seen).join('/'));
  }
}

/* ==================== 汇总 ==================== */
console.log('\n=== v13 交互类型: ' + pass + ' PASS / ' + fail + ' FAIL ===');
process.exit(fail ? 1 : 0);
