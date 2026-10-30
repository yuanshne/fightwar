// node tools/_v211_minion_once_test.js —— 野怪一次性口径验收（v22 修订版，node，无依赖）
// 用户两次定调的分界线（v22 为准）：
//   1. Boss 关野怪「死一次就不要刷新」——respawn() 在 Boss 关不再复活已死野怪（普通关行为不变）【保留】；
//   2. v21 曾把 summon/spawn 全部改成整场限一轮，v22 撤销误削（用户：「技能都写了就别这样了」）：
//      · summon（呼邪唤众/破茧亲卫）恢复冷却语义——cd 结束即可再召，写进招式表的技能就要周期性用；
//      · spawn（茧母·卵潮涌动）保持整场一轮——这是她「什么时候打」的机制本体（用户点名「除了茧母」）。
// 加载方式同 _v20_boss_test（levels+ch2+ch3+ch4+engine 拼接，按关卡名定位 idx）。
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const themes = {};
['grass', 'cave', 'sky', 'factory', 'lava', 'tower', 'boss', 'wind', 'castle', 'star', 'sea', 'nether',
  'ember', 'aether', 'husk', 'maw', 'bell'].forEach(k => themes[k] = {});

const glue = '\n;return {PHY,Level,game,loadLevel,updateWorld,BAL,ALL_LEVELS,aggregateLevels,'
  + 'respawn,_engMkEnemy,_engBossPick,_engBossTable};';
const sb = new Function('THEMES',
  read('levels.js') + read('chapter2.js') + read('chapter3.js')
  + read('chapter4.js') + read('engine.js') + glue)(themes);
sb.aggregateLevels();          // 章节注册表在 levels.js 之后才 push，手动再聚合一次（幂等，同 _v20_boss_test）
const G = sb.game;

let pass = 0, fail = 0;
function ok(cond, msg, extra) {
  if (cond) { pass++; console.log('  PASS ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? '   [' + extra + ']' : '')); }
}
function step(g, n) { for (let f = 0; f < n; f++) sb.updateWorld(1 / 60); }
function idxByName(frag) {
  // 注意：glue return 的 ALL_LEVELS 是聚合前的旧引用（shorthand 在 new Function 执行时求值），
  // 必须用 aggregateLevels() 的返回值（幂等，24 关全量）。
  const arr = sb.aggregateLevels();
  for (let i = 0; i < arr.length; i++)
    if ((arr[i].name || '').indexOf(frag) >= 0) return i;
  return -1;
}
function windupCast(b, move) { // 置招并推进到执行帧
  b.next = move; b.state = 'windup'; b.t = 0; b.comboQ = [move]; b.comboN = 0;
  const dur = sb._engBossTable(b.kind || 1).windup[move] || 0.5;
  step(G, Math.ceil(dur * 60) + 4);
}

/* ==================== ① Boss 关 respawn 不复活已死野怪 ==================== */
console.log('[T1] respawn 语义分叉：Boss 关尸体不复活 / 普通关照旧');
{
  const iBoss = idxByName('孵化');
  const iNorm = 0;
  ok(iBoss > 0, '按名字定位 L22（孵化之间）idx=' + iBoss);

  G.hero = 'knight';
  sb.loadLevel(iBoss, false); G.state = 'play';
  const e1 = sb._engMkEnemy('slime', 200, 170, false);
  G.level.enemies.push(e1);
  e1.dead = 0.5;                              // 处于死亡动画态
  sb.respawn();
  ok(e1.dead > 0, 'Boss 关：已死野怪 respawn 后保持死亡', 'dead=' + e1.dead);

  sb.loadLevel(iNorm, false); G.state = 'play';
  const e2 = sb._engMkEnemy('slime', 200, 170, false);
  G.level.enemies.push(e2);
  e2.dead = 0.5;
  sb.respawn();
  ok(e2.dead === 0, '普通关：respawn 复活野怪（原行为不变）', 'dead=' + e2.dead);
}

/* ==================== ② 牛魔王召唤：冷却语义（v22 撤销一次性误削） ==================== */
console.log('[T2] kind1 summon：cd 结束后重新可选（技能写了就要周期性用）');
{
  const iL7 = idxByName('BOSS·星核');
  sb.loadLevel(iL7, false); G.state = 'play';
  const b = G.boss;
  ok(!!b && (b.kind || 1) === 1, 'L7 Boss 激活（kind1）');
  const p = G.player;
  p.x = b.x + b.w / 2 - 60; p.y = b.y;        // 拉进 near 池（adx<=200 含 summon）
  const CD = sb._engBossTable(1).summon.cd;
  windupCast(b, 'summon');
  const slimeN = G.level.enemies.filter(e => e.summoned).length;
  ok(b.summonUsed === undefined && slimeN === 2, '第一轮召唤执行：无一次性标志 + 史莱姆×2', 'n=' + slimeN);
  ok((b.summonCd || 0) > CD - 5, '召唤后进入冷却（表值 ' + CD + 's）', (b.summonCd || 0).toFixed(1));

  // 冷却期内：12 次选招零 summon
  let seenCd = 0;
  for (let i = 0; i < 12; i++) { sb._engBossPick(b); if (b.next === 'summon') seenCd++; b.state = 'idle'; b.t = 0; }
  ok(seenCd === 0, '冷却期内 12 次选招零 summon', 'seen=' + seenCd);

  // 冷却结束（置 b.summonCd=0，同 _v13 T8 口径——不真跑 18s 世界帧，避免 Boss 顺手打死玩家）：
  // 清场 + 站近，30 次选招至少再出一次 summon
  b.summonCd = 0;
  G.level.enemies.forEach(e => { e.dead = 1; });   // 清场：排除 alive>=2 过滤的干扰
  p.x = b.x + b.w / 2 - 60; p.y = b.y;
  let seen = 0;
  for (let i = 0; i < 30; i++) { sb._engBossPick(b); if (b.next === 'summon') seen++; b.state = 'idle'; b.t = 0; }
  ok(seen > 0, '冷却结束后 summon 重新进池（v22 撤销误削）', 'seen=' + seen);
}

/* ==================== ③ 茧母产卵整场一轮（用户点名保留） ==================== */
console.log('[T3] kind9 spawn：真产出才消耗额度，用完永久出池');
{
  const iL22 = idxByName('孵化');
  sb.loadLevel(iL22, false); G.state = 'play';
  const b = G.boss;
  ok(!!b && (b.kind || 0) === 9, 'L22 Boss 激活（kind9）');
  const p = G.player;
  p.x = b.x + b.w / 2 - 60; p.y = b.y;
  const eggN0 = G.hazards.filter(h => h.kind === 'egg').length;
  windupCast(b, 'spawn');
  const eggN1 = G.hazards.filter(h => h.kind === 'egg').length;
  ok(eggN1 - eggN0 === 3 && b.spawnUsed === true, '第一轮产卵执行：卵×3 + spawnUsed', 'eggs=' + (eggN1 - eggN0));
  let seen = 0;
  for (let i = 0; i < 12; i++) { sb._engBossPick(b); if (b.next === 'spawn') seen++; b.state = 'idle'; b.t = 0; }
  ok(seen === 0, '用掉之后 12 次选招永不再出 spawn', 'seen=' + seen);

  // cap 满空放：不消耗额度（池里 spawn 仍可用）
  b.spawnUsed = false;
  G.hazards = G.hazards.filter(h => h.kind !== 'egg');
  for (let i = 0; i < 6; i++) G.hazards.push({ kind: 'egg', x: 100 + i * 20, y: 160, w: 16, h: 16, t: 0, stage: 0, hp: 2, maxHp: 2, stageT: 3, flashT: 0, hitCd: 0 });
  windupCast(b, 'spawn');
  ok(b.spawnUsed === false, 'cap 满空放：额度不消耗（spawnUsed 仍 false）');
}

/* ==================== ④ 茧母破茧亲卫：常规冷却召唤（v22 新招） ==================== */
console.log('[T4] kind9 summon（破茧亲卫）：召唤甲虫×2，cd 14s 后可再召');
{
  const iL22 = idxByName('孵化');
  sb.loadLevel(iL22, false); G.state = 'play';
  const b = G.boss, p = G.player;
  p.x = b.x + b.w / 2 - 60; p.y = b.y;
  const T9 = sb._engBossTable(9);
  ok(T9.summon && T9.summon.type === 'beetle' && T9.summon.cd === 14, '召唤表就位（beetle ×2 / cd 14s）');
  windupCast(b, 'summon');
  const beetles = G.level.enemies.filter(e => e.summoned);
  ok(beetles.length === 2, '破茧亲卫：甲虫×2 上场', 'n=' + beetles.length);
  ok((b.summonCd || 0) > 8, '召唤后进入冷却', (b.summonCd || 0).toFixed(1));
  const hpBefore = b.hpTotal;
  step(G, 60);
  ok(b.hpTotal <= hpBefore + 0.01, '茧母召唤不带回血（leech 未配）', (b.hpTotal - hpBefore).toFixed(2));
}

/* ==================== ⑤ spawn 一次性跨死亡保留 ==================== */
console.log('[T5] spawnUsed 跨玩家死亡保留（respawn 不清）');
{
  const iL22 = idxByName('孵化');
  sb.loadLevel(iL22, false); G.state = 'play';
  const b = G.boss, p = G.player;
  p.x = b.x + b.w / 2 - 60; p.y = b.y;
  windupCast(b, 'spawn');
  ok(b.spawnUsed === true, '产卵已用');
  sb.respawn();                               // 玩家死亡重生（Boss 段血回退，标志不清）
  let seen = 0;
  for (let i = 0; i < 12; i++) { sb._engBossPick(b); if (b.next === 'spawn') seen++; b.state = 'idle'; b.t = 0; }
  ok(b.spawnUsed === true && seen === 0, 'respawn 后产卵仍不再出', 'seen=' + seen);
}

console.log('\n=== v22 野怪口径: ' + pass + ' PASS / ' + fail + ' FAIL ===');
process.exit(fail ? 1 : 0);
