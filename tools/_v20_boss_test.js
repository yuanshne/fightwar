// node tools/_v20_boss_test.js —— 地图二「回响之厅」五只 Boss 机制验收（v20）
// 真值唯一来源：engine.js 的 BAL.boss7~boss11（表即规格）+ chapter4.js 的关卡数据。
//
// 断言口径一律是「玩家该感受到的现象」，不是「某个函数被调用了」：
//   T1 去同质化：五只的招式池与 map1 六只、以及彼此之间，除 nova（P2）外零交集；v20.3 起地图二池不含公共弹幕。
//   T2 烬（kind7）：打得多→热量涨；停手 idleAfter 后散热加速（这才是「停一拍」有意义）；热量满自爆。
//   T3 秤（kind8）：同侧连击到上限→偷血；左右交替→承伤 ×goodMul 并打出「对秤」。
//   T4 茧（kind9）：产卵 3 枚且不超 cap；打碎卵不消失而是进化一级（打早了=提前放出来）；
//                  成虫被打死给能量（这是「等它长大」的唯一回报）。
//   T5 喉（kind10）：吸气会吞掉玩家弹体并把血量回给它；嘴里的弹被 roar 全吐回去（喂多的代价）。
//   T6 钟（kind11）：非休止拍完全免伤、休止拍 ×restMul；曲谱固定（轮两次顺序不变）。
//   T7 清场：换关后 hazards 里不残留 laser/weight/hammer/crawler/egg/web。
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const glue = '\n;return {PHY,Level,game,loadLevel,respawn,updateWorld,BAL,aggregateLevels,'
  + '_engHurtPlayer,_engBossHurt,_engMkBoss,_engBossTable,_engBossPick,_engBossScore,'
  + '_engBossDur,_engGroundY,_engB7Flare,_engB8Swap,_engB9Spawn,_engB9Web,_engB10Roar,_engUpdateHazards};';
const themes = {};
['grass', 'cave', 'sky', 'factory', 'lava', 'tower', 'boss', 'wind', 'castle', 'star', 'sea', 'nether',
 'ember', 'aether', 'husk', 'maw', 'bell'].forEach(k => themes[k] = {});
const sb = new Function('THEMES', read('levels.js') + read('chapter2.js') + read('chapter3.js')
  + read('chapter4.js') + read('engine.js') + glue)(themes);
sb.aggregateLevels();          // 章节注册表在 levels.js 之后才 push，测试里手动再聚合一次（幂等）

let pass = 0, fail = 0;
function ok(cond, msg, extra) {
  if (cond) { pass++; console.log('  PASS ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? '   [' + extra + ']' : '')); }
}
const KINDS = [7, 8, 9, 10, 11];
const tableOf = k => sb._engBossTable(k);
const poolOf = k => { const T = tableOf(k); return [].concat(T.poolNear || [], T.poolFar || []); };
const uniq = a => Array.from(new Set(a));

/* 夹具：直接进对应关卡，把 Boss 摆成可控的 idle，清掉杂兵与残留实体 */
function world(kind) {
  const idx = 19 + (kind - 7);              // L20~L24 ← kind 7~11
  sb.loadLevel(idx, false);
  const g = sb.game;
  g.state = 'play';
  g.boss.state = 'idle'; g.boss.t = 0; g.boss.vx = 0; g.boss.vy = 0;
  g.boss.hpTotal = g.boss.maxHp; g.boss.hp = g.boss.bandMax; g.boss.bandBreak = 0; g.boss.phase = 1;
  g.level.enemies.length = 0;
  g.bullets.length = 0; g.waves.length = 0; g.hazards.length = 0;
  g.heat = 0; g.heatT = 0; g.mawMeals = [];
  if (g.shots) g.shots.length = 0;
  return g;
}
/* 让玩家站到 Boss 左侧/右侧（side=-1 左 / +1 右），并清无敌帧 */
function stand(g, side) {
  const p = g.player, b = g.boss;
  p.x = b.x + b.w / 2 + side * 30 - p.w / 2;
  p.y = b.y + b.h - p.h;
  p.vx = 0; p.vy = 0; p.invT = 0; p.dead = false;
  p.hp = p.maxHp || 9;
  return p;
}
/* 测「场地实体自己的时间线」时必须把 Boss 摁住：idle 的 Boss 会自己出招，
   打两下就把玩家打死，复活清场会顺手把被测的 egg/web 一起清掉——测的就不是实体了。 */
function freezeBoss(g) {
  g.boss.state = 'stagger'; g.boss.staggerDur = 99; g.boss.t = 0; g.boss.vx = 0;
  g.player.invT = 99;                     // 免疫接触伤，别让站桩的玩家被打死
  g.boss.x = 40; g.boss.y = g.boss.y;     // 远离玩家，避免接触判定
  return g;
}
function park(g, farX) {                  // 把玩家挪到指定 x（不跟 Boss 重叠）
  const p = g.player;
  p.x = farX; p.vx = 0; p.vy = 0; p.invT = 99; p.dead = false;
  return p;
}
const hurtBoss = (dmg) => sb._engBossHurt(dmg, false);

/* ==================== T1 去同质化矩阵 ==================== */
console.log('[T1] 五只招牌与 map1 六只零交集（nova 之外；地图二池已无公共弹幕）');
{
  // 1) 逐字对表：表被人改动/换顺序时这里立刻红
  const SPEC = {
    7: { near: ['flare', 'lash'], far: ['sear', 'flare'] },
    8: { near: ['weight', 'swap'], far: ['weight', 'beam', 'swap'] },
    9: { near: ['spawn', 'web', 'swarm'], far: ['spawn', 'swarm'] },
    10: { near: ['inhale', 'bite', 'roar'], far: ['roar', 'inhale'] },
    11: { near: ['pendulum', 'chime', 'hammer'], far: ['chime', 'hammer'] }
  };
  for (const k of KINDS) {
    const T = tableOf(k), S = SPEC[k];
    const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
    ok(same(T.poolNear || [], S.near) && same(T.poolFar || [], S.far),
      'boss' + k + ' 池与设计表逐字一致（含顺序）',
      'near[' + (T.poolNear || []).join('/') + ']');
  }
  // 2) 与 map1 六只求差集：除 barrage/nova 外必须为空
  const OK_SHARED = ['barrage', 'nova'];
  for (const k of KINDS) {
    const mine = uniq(poolOf(k).concat(tableOf(k).p2Add || []));
    const collide = [];
    for (const j of [1, 2, 3, 4, 5, 6]) {
      const other = uniq(poolOf(j).concat(tableOf(j).p2Add || []));
      for (const n of mine) if (other.indexOf(n) >= 0 && OK_SHARED.indexOf(n) < 0) collide.push('boss' + j + ':' + n);
    }
    ok(collide.length === 0, 'boss' + k + ' 与 map1 无重复招式', collide.join(','));
  }
  // 3) 新五只彼此之间也不许重合（"每个 boss 都要有自己独特的技能"）
  const all = [];
  for (const k of KINDS) for (const n of uniq(poolOf(k))) if (OK_SHARED.indexOf(n) < 0) all.push(k + ':' + n);
  const seen = {}, dup = [];
  for (const s of all) {
    const n = s.split(':')[1];
    if (seen[n]) dup.push(n); else seen[n] = 1;
  }
  ok(dup.length === 0, '五只之间零重复招式', uniq(dup).join(','));
}

/* ==================== T2 烬（kind7）：热量 ==================== */
console.log('[T2] 烬：打得多→升温；停一拍→快速散热；满值受伤');
{
  const g = world(7), H = tableOf(7).heat;
  const p = stand(g, -1);

  hurtBoss(10);
  const h1 = g.heat;
  ok(h1 > 0, '一次 10 伤后热量上升', 'heat=' + h1.toFixed(1));
  ok(Math.abs(h1 - 10 * H.perDmg) < 0.01, '热量 = 伤害 × perDmg', 'heat=' + h1 + ' want=' + 10 * H.perDmg);

  // 停手：idleAfter 前按 cool 散，之后按 idleCool 散（加速段才是「停手划算」的依据）
  g.heatT = 0; g.hitStop = 0;                    // 承伤的 hit-stop 会冻结世界，先清掉再推帧
  sb.updateWorld(1 / 60);
  const before = g.heat;
  ok(before < h1, '不停手也在散热（cool）', h1.toFixed(2) + '→' + before.toFixed(2));
  for (let f = 0; f < 60; f++) { g.hitStop = 0; sb.updateWorld(1 / 60); }   // 满 1s > idleAfter=0.6
  const afterIdle = g.heat;
  ok(h1 - afterIdle > (h1 - before) * 3, '停手 1s 的散热远快于单帧（idleCool 生效）',
    h1.toFixed(1) + '→' + afterIdle.toFixed(1));

  // flare 引爆：热量清零，且热量越高伤害越高
  g.heat = 30; g.heatT = 0;
  const hp0 = g.boss.hpTotal;
  sb._engB7Flare(g.boss);
  ok(g.heat === 0, '引燃后热量清零');
  const d30 = (g.player.maxHp || 9) - g.player.hp;

  const g2 = world(7); const p2 = stand(g2, -1); p2.hp = p2.maxHp;
  g2.heat = 90;
  sb._engB7Flare(g2.boss);
  const d90 = (g2.player.maxHp || 9) - g2.player.hp;
  ok(d90 > d30, '热量越高引爆越疼（90 > 30）', d30 + ' → ' + d90);

  // 热量不足 30：抬手也炸不着（这是玩家能主动运营的空间）
  const g3 = world(7); const p3 = stand(g3, -1); p3.hp = p3.maxHp;
  g3.heat = 20;
  sb._engB7Flare(g3.boss);
  ok(g3.player.hp === g3.player.maxHp, '热量低于 minHeat 时引燃打不着');
}

/* ==================== T3 秤（kind8）：方位 ==================== */
console.log('[T3] 秤：同侧连击被偷血，左右交替承伤更高');
{
  const g = world(8), SK = tableOf(8).skew;
  const b = g.boss;

  // 同侧连击：skew 会累积到 max 并触发回血
  let p = stand(g, -1);
  b.skew = 0;
  const hp0 = b.hpTotal;
  for (let i = 0; i < SK.max; i++) { stand(g, -1); hurtBoss(5); }
  ok(b.hpTotal >= hp0 - 5 * SK.max + 1, '同侧连击被偷血（净损失小于表面伤害）',
    hp0.toFixed(1) + ' → ' + b.hpTotal.toFixed(1));
  ok(b.skew === 0, '失衡后 skew 归零（可以重新来一轮）');

  // 换边奖励：交替打，单下伤害应高于同侧单下
  const g2 = world(8), b2 = g2.boss;
  stand(g2, -1); b2.skew = 0;
  const s0 = b2.hpTotal;
  hurtBoss(10); const sameSide = s0 - b2.hpTotal;         // 第一次：无奖励（首次不算换边）
  stand(g2, 1); const s1 = b2.hpTotal;
  hurtBoss(10); const altSide = s1 - b2.hpTotal;          // 换边：×goodMul
  ok(altSide > sameSide, '换边承伤高于同侧', sameSide + ' → ' + altSide);
  ok(altSide >= Math.round(10 * SK.goodMul) - 1, '换边倍率 ≈ goodMul', altSide);
}

/* ==================== T4 茧（kind9）：卵 ==================== */
console.log('[T4] 茧：产卵 / 进化 / 打早了只是提前放出来');
{
  const g = world(9), T = tableOf(9).spawn;
  const p = stand(g, -1);
  sb._engB9Spawn(g.boss);
  const eggs = g.hazards.filter(e => e.kind === 'egg');
  ok(eggs.length === T.n, '一次产卵 ' + T.n + ' 枚', eggs.length);
  ok(eggs.every(e => e.hp === T.hp && e.stage === 0), '卵初始 1 阶、血量对表');

  // 自然进化：推进 stageT 秒 → 升到幼虫（血量换成幼虫血）
  freezeBoss(g);
  const e0 = eggs[0];
  for (let f = 0; f < Math.ceil(T.stageT * 60) + 4; f++) { g.hitStop = 0; sb.updateWorld(1 / 60); }
  ok(e0.stage === 1 && e0.hp === T.larvaHp, 'stageT 后进化为幼虫（血量换表）', 'stage=' + e0.stage + ' hp=' + e0.hp);

  /* 打碎卵不消失：攻击路径只扣 hp、**绝不 splice**（这是引擎的分工契约）；
     收尸/进化统一在 _engUpdateHazards 里做，所以这里扣到 0 再推一帧就是在模拟「一刀打碎」。 */
  const g2 = world(9);
  stand(g2, -1);
  sb._engB9Spawn(g2.boss);
  const eg = g2.hazards.filter(e => e.kind === 'egg')[0];
  eg.hp = 0;                                          // = 攻击路径把血扣空
  for (let f = 0; f < 4; f++) { g2.hitStop = 0; sb.updateWorld(1 / 60); }
  ok(g2.hazards.indexOf(eg) >= 0 && eg.stage === 1, '打碎卵后不消失，而是进化一级（打早了=提前放出来）',
    'stage=' + eg.stage + ' alive=' + (g2.hazards.indexOf(eg) >= 0));

  // 成虫被打死才给能量
  eg.stage = 2; eg.hp = 0; eg.maxHp = 1; eg.t = 0;
  const ult0 = g2.ultCharge || 0;
  for (let f = 0; f < 4; f++) { g2.hitStop = 0; sb.updateWorld(1 / 60); }
  ok(g2.hazards.indexOf(eg) < 0, '成虫被打死才真正消失');
  ok((g2.ultCharge || 0) > ult0, '打成虫给能量（等它长大的回报）', ult0 + ' → ' + (g2.ultCharge || 0));

  // 蛛网：减速 + 禁跳，且不叠乘（走 mist 同一通道）
  const g3 = world(9);
  freezeBoss(g3);
  sb._engB9Web(g3.boss);
  const web = g3.hazards.filter(e => e.kind === 'web')[0];
  ok(!!web, '蛛网已生成');
  if (web) {
    const p3 = park(g3, web.x + web.w / 2 - 5);
    p3.y = web.y + web.h - p3.h;
    for (let f = 0; f < 3; f++) { g3.hitStop = 0; p3.invT = 99; sb.updateWorld(1 / 60); }
    ok(p3.mistSlow > 0 && p3.mistSlow < 1, '网内减速（复用 mistSlow 通道，不另开乘数）', p3.mistSlow);
    ok(p3.webNoJump > 0, '网内禁跳标记已置');
  }
}

/* ==================== T5 喉（kind10）：吞弹 ==================== */
console.log('[T5] 喉：吸气吞弹回血，反刍把积食全吐回去');
{
  const g = world(10), T = tableOf(10).inhale, b = g.boss;
  const p = stand(g, +1);
  ok(!!g.shots, '法师弹体容器存在');
  const cx = b.x + b.w / 2, cy = b.y + b.h - 22;
  g.shots.length = 0;
  for (let i = 0; i < 6; i++) g.shots.push({ x: cx + 20 + i * 6, y: cy, vx: 0, vy: 0, kind: 'mg', dmg: 1, life: 9 });
  b.hpTotal -= 60; b.hp = 60;                              // 留出回血空间（不然 ceil 卡住）
  const hp0 = b.hpTotal;
  b.state = 'inhaleCast'; b.t = 0; b.fireN = 0;
  for (let f = 0; f < 6; f++) sb.updateWorld(1 / 60);
  ok(g.shots.length < 6, '吸气吞掉了射程内的弹体', '6 → ' + g.shots.length);
  ok(b.hpTotal > hp0, '吞下的弹变成它的血', hp0.toFixed(1) + ' → ' + b.hpTotal.toFixed(1));
  ok((g.mawMeals || []).length > 0, '嘴里的积食被记账（后面 roar 要用）', (g.mawMeals || []).length);

  // 反刍：积食全吐回去 → 变成弹体，嘴空
  const nMeal = (g.mawMeals || []).length;
  g.bullets.length = 0;
  sb._engB10Roar(b);
  ok(g.bullets.length >= nMeal, '反刍把积食吐成弹幕', 'meals=' + nMeal + ' bullets=' + g.bullets.length);
  ok((g.mawMeals || []).length === 0, '吐完嘴空');

  // 嘴空时 roar 白放（不凭空造弹）
  g.bullets.length = 0;
  sb._engB10Roar(b);
  ok(g.bullets.length === 0, '空嘴反刍不产生弹');
}

/* ==================== T6 钟（kind11）：曲谱 ==================== */
console.log('[T6] 钟：非休止拍完全免伤，休止拍加倍，谱固定可背');
{
  const g = world(11), SC = tableOf(11).score, b = g.boss;
  const p = stand(g, -1);

  // 曲谱固定：连取两轮，序列逐字相同
  b.scoreI = 0;
  const seq1 = [];
  for (let i = 0; i < SC.beats.length; i++) { sb._engBossScore(b); seq1.push(b.state === 'rest' ? null : b.next); }
  b.scoreI = 0;
  const seq2 = [];
  for (let i = 0; i < SC.beats.length; i++) { sb._engBossScore(b); seq2.push(b.state === 'rest' ? null : b.next); }
  ok(JSON.stringify(seq1) === JSON.stringify(seq2), '曲谱两轮完全一致（可以背）', seq1.join(','));
  ok(seq1.indexOf(null) >= 0, '曲谱里有休止符（唯一的输出窗口）', seq1.join(','));

  // 非休止拍：完全免伤（hpTotal 一滴不掉，返回 false）
  b.state = 'idle'; b.scoreI = 0;                      // beats[0] = pendulum（非休止）
  const hp0 = b.hpTotal;
  const r0 = hurtBoss(10);
  ok(r0 === false && b.hpTotal === hp0, '非休止拍完全免伤（不是减伤，血条不动）', 'ret=' + r0 + ' d=' + (hp0 - b.hpTotal));

  // 休止拍：×restMul
  b.scoreI = 3; b.state = 'rest';                      // beats[3] = null
  const hp1 = b.hpTotal;
  hurtBoss(10);
  const dealt = hp1 - b.hpTotal;
  ok(dealt >= Math.round(10 * SC.restMul) - 1, '休止拍承伤 ×restMul', dealt);
}

/* ==================== T7 清场 ==================== */
console.log('[T7] 清场：换关后地图二的实体不留残留');
{
  const g = world(9);
  stand(g, -1);
  sb._engB9Spawn(g.boss); sb._engB9Web(g.boss);
  g.hazards.push({ kind: 'laser', x: 0, y: 40, w: 200, h: 10, t: 0, dur: 9, dmg: 1, hitCd: 0 });
  g.hazards.push({ kind: 'weight', x: 100, y: -20, vy: 300, r: 12, dmg: 1, warn: 0.7, warnT: 0.7, t: 0, fall: false });
  const kinds0 = g.hazards.map(e => e.kind);
  ok(kinds0.indexOf('egg') >= 0 && kinds0.indexOf('web') >= 0, '测试前置：实体已铺好', kinds0.join(','));

  sb.loadLevel(19, false);                              // 换到 L20
  const left = (sb.game.hazards || []).filter(e => ['egg', 'web', 'laser', 'weight', 'hammer', 'crawler'].indexOf(e.kind) >= 0);
  ok(left.length === 0, '换关后无残留（继承 hazards 的三条清场规则）', left.map(e => e.kind).join(','));
}

console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + ': ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
