// node tools/_v16_boss_test.js —— v16 Boss 招牌去同质化 + 圣像审判（totem）验收
// 真值唯一来源：docs/specs/2026-10-27-v16-boss-exclusive.md（六张冻结表 §二 / totem 参数与字段 §三）
//
// 断言口径全是「玩家该看到的现象」，不是「某个函数被调用了」：
//   T1 独占矩阵：六只招式池除了 barrage（普攻）/ nova（P2 追加）之外零重合；
//                 charge（三连撞）只属于牛魔王；dive 已不在任何池；每只 P1 恰好 5 招（4 招牌 + 弹幕）。
//   T2 totem 生成：举手后左右各升起一座圣像，恰好 2 座、尺寸/血量/引信对表、y 落在地面线。
//   T3 打掉不炸：站进圣像脚下，把两座 hp 打空 → 引信到点也不掉血（拆场是正解）。
//   T4 不拆就炸：原地不动 → 至少扣 2 心；站到半径外 → 一点血都不掉。
//   T5 自删与清场：引信超时后 totem 全部消失不留残留；换关（loadLevel）后 hazards 里没有 totem。
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const glue = '\n;return {PHY,Level,game,loadLevel,respawn,updateWorld,BAL,aggregateLevels,getLevels:()=>ALL_LEVELS,'
  + '_engHurtPlayer,_engBossHurt,_engMkBoss,_engBossTable,_engBossPick,_engBossDur,_engGroundY};';
const themes = {};
['grass', 'cave', 'sky', 'factory', 'lava', 'tower', 'boss', 'wind', 'castle', 'star', 'sea', 'nether']
  .forEach(k => themes[k] = {});
const sb = new Function('THEMES', read('levels.js') + read('chapter2.js') + read('chapter3.js')
  + read('engine.js') + glue)(themes);
sb.aggregateLevels();          // 章节注册表在 levels.js 之后才 push，测试里手动再聚合一次（幂等）

let pass = 0, fail = 0;
function ok(cond, msg, extra) {
  if (cond) { pass++; console.log('  PASS ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? '   [' + extra + ']' : '')); }
}
const KINDS = [1, 2, 3, 4, 5, 6];

/* ==================== 公共夹具（与 _v13_boss_test.js 同构） ==================== */
function bossworld(kind, lvIdx) {
  sb.loadLevel(lvIdx, false);
  const g = sb.game; g.state = 'play'; g.boss.state = 'idle'; g.boss.t = 0;
  g.boss.hpTotal = g.boss.maxHp; g.boss.hp = g.boss.bandMax; g.boss.bandBreak = 0; g.boss.phase = 1;
  g.level.enemies.length = 0;             // 清杂兵：只测招式本身，别被贴身接触伤污染
  g.bullets.length = 0; g.waves.length = 0; g.hazards.length = 0;
  return g;
}
function cast(b, name) { b.next = name; b.state = 'windup'; b.t = 0; b.fireN = 0; }
/* L18 是双 Boss（boss4 首发、boss5 接力），loadLevel 只会给首发那一棒。
   测 boss5 必须手动换人——用引擎自己的 _engMkBoss 造，锚点按旧 Boss 脚底反推（R4：不另起构造逻辑）。 */
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
const tableOf = k => sb._engBossTable(k);
const unionOf = k => { const T = tableOf(k); return [].concat(T.poolNear || [], T.poolFar || [], T.p2Add || []); };
const uniq = a => Array.from(new Set(a));
const sameSet = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/* ==================== T1 独占矩阵 ==================== */
// spec §二 六张表逐字冻结：顺序也是冻结的一部分（玩家看到的轮转顺序跟着表走）
const SPEC = {
  1: { poolNear: ['meteor', 'spike', 'summon', 'leap', 'barrage'],
       poolFar:  ['barrage', 'meteor', 'spike'],
       p2Add:    ['nova'] },
  2: { poolNear: ['sweep', 'mist', 'pull', 'breath', 'barrage'],
       poolFar:  ['barrage', 'breath', 'pull', 'mist'],
       p2Add:    ['nova'] },
  3: { poolNear: ['scythe', 'blink', 'mirror', 'quell', 'barrage'],
       poolFar:  ['barrage', 'scythe', 'blink', 'quell'],
       p2Add:    ['nova'] },
  4: { poolNear: ['push', 'core', 'quake', 'clone', 'barrage'],
       poolFar:  ['barrage', 'push', 'quake', 'core'],
       p2Add:    ['nova'] },
  5: { poolNear: ['halo', 'parry', 'homing', 'totem', 'barrage'],
       poolFar:  ['barrage', 'halo', 'homing', 'totem'],
       p2Add:    ['nova'] },
  6: { poolNear: ['charge', 'bomb', 'pillar', 'grab', 'barrage'],
       poolFar:  ['barrage', 'charge', 'bomb', 'pillar'],
       p2Add:    ['nova'] }
};
console.log('[T1] 独占矩阵：六只招牌零重合，charge 只归牛魔王，dive 退场');
{
  // 1) 六张表逐字比对（含顺序）——引擎谁改了值/顺序，这里立刻红
  for (const k of KINDS) {
    const T = tableOf(k), S = SPEC[k];
    const got = { poolNear: T.poolNear || [], poolFar: T.poolFar || [], p2Add: T.p2Add || [] };
    ok(sameSet(got.poolNear, S.poolNear) && sameSet(got.poolFar, S.poolFar) && sameSet(got.p2Add, S.p2Add),
      'boss' + k + ' 三张池与 spec §二 逐字一致（含顺序）',
      'near[' + got.poolNear.join('/') + '] far[' + got.poolFar.join('/') + '] p2[' + got.p2Add.join('/') + ']');
  }

  // 2) 两两求交集：public 层只允许 barrage / nova；这两招之外必须为空
  for (let i = 0; i < KINDS.length; i++) for (let j = i + 1; j < KINDS.length; j++) {
    const a = uniq(unionOf(KINDS[i])), b = uniq(unionOf(KINDS[j]));
    const inter = a.filter(n => b.includes(n));
    const core = inter.filter(n => n !== 'barrage' && n !== 'nova');   // 公共层之外还剩什么（必须为空）
    ok(core.length === 0,
      'boss' + KINDS[i] + ' ∩ boss' + KINDS[j] + '：除公共层(barrage/nova)外零重合',
      '交集=[' + inter.join('/') + '] 越界=[' + core.join('/') + ']');
  }

  // 3) barrage 是唯一「六只常驻都带」的招（玩家眼里的普通攻击层）；
  //    nova 只是 P2 追加层，不许混进常规池（否则 P1 也会全屏双环）
  const inAllNear = uniq(tableOf(1).poolNear || [])
    .filter(n => KINDS.every(k => (tableOf(k).poolNear || []).includes(n)));
  ok(inAllNear.length === 1 && inAllNear[0] === 'barrage',
    '六只 P1 池都带的招恰好只有 barrage（nova 只在 P2 追加）', '实际=[' + inAllNear.join('/') + ']');
  const novaLeak = KINDS.filter(k => {
    const T = tableOf(k);
    return (T.poolNear || []).includes('nova') || (T.poolFar || []).includes('nova');
  });
  ok(novaLeak.length === 0, 'nova 只出现在 p2Add，不混进 poolNear/poolFar',
    '出现在 boss' + novaLeak.join('/boss'));

  // 4) charge（三连撞）出现且仅出现在 boss6
  const chargeOwners = KINDS.filter(k => unionOf(k).includes('charge'));
  ok(chargeOwners.length === 1 && chargeOwners[0] === 6,
    'charge 只出现在 boss6（牛魔王专属）', '出现在 boss' + chargeOwners.join('/boss'));
  const T6 = tableOf(6);
  ok((T6.poolNear || []).includes('charge') && (T6.poolFar || []).includes('charge'),
    'boss6 的远近两个池都保留 charge（贴身/远距都该撞）');

  // 5) dive 已从所有池（含 p2Add）移除——它和 leap 是同一套抛物线，等于变相重合
  const diveOwners = KINDS.filter(k => unionOf(k).includes('dive'));
  ok(diveOwners.length === 0, 'dive 不在任何 Boss 的任何池里', '出现在 boss' + diveOwners.join('/boss'));

  // 6) P1 池恰好 5 招 = 4 招牌 + barrage（少一招玩家就少一种读招，多一招就破坏独占）
  for (const k of KINDS) {
    const pool = tableOf(k).poolNear || [];
    const sig = pool.filter(n => n !== 'barrage');
    ok(pool.length === 5 && sig.length === 4 && pool.includes('barrage'),
      'boss' + k + ' P1 恰好 5 招（4 招牌 + barrage）', '实际 ' + pool.length + ' 招：' + pool.join('/'));
    // 4 招招牌必须正好是 spec 表里那 4 个（不能拿公共招凑数）
    const wantSig = SPEC[k].poolNear.filter(n => n !== 'barrage');
    ok(sameSet(uniq(sig).sort(), wantSig.slice().sort()),
      'boss' + k + ' 的 4 招招牌与 spec 一致', '实际=[' + sig.join('/') + ']');
  }

  // 7) 全 24 个招牌槽位互不相同（这是「每只都有自己的特色」的硬指标）
  //    招牌会同时出现在该 Boss 的 poolNear 与 poolFar 里，所以按「每只的招牌集合」去重后再数，
  //    不能把同一条池子里的重复出现算成第二招。
  const sigSlots = [];
  const perBoss = {};
  for (const k of KINDS) {
    perBoss[k] = uniq(unionOf(k).filter(n => n !== 'barrage' && n !== 'nova'));
    sigSlots.push.apply(sigSlots, perBoss[k]);
  }
  ok(KINDS.every(k => perBoss[k].length === 4) && sigSlots.length === 24 && uniq(sigSlots).length === 24,
    '六只合计 24 个招牌槽位零重复',
    '每只 ' + KINDS.map(k => perBoss[k].length).join('/') + ' 招 / 去重 ' + uniq(sigSlots).length + ' 招');

  // 8) barrage 进池就必须带参数：轮转会把 barrage 排上来，barrageFire 读 T.barrage.pairGap，
  //    缺键当场 TypeError（旧版长跑崩过）。「每只都有弹幕普攻」不能只是池里写了个名字。
  const noBarParam = KINDS.filter(k => {
    const B = tableOf(k).barrage;
    return !B || typeof B.pairGap !== 'number' || !Array.isArray(B.deg);
  });
  ok(noBarParam.length === 0, '六只 barrage 参数齐全（排到就能真打，不会读 undefined）',
    '缺参数 boss' + noBarParam.join('/boss'));

  // 9) 同上，但验玩家能看到的结果：牛魔王排到 barrage → 场上真的出弹幕
  const g6 = bossworld(6, 18), b6 = g6.boss, p6 = g6.player;
  p6.x = b6.x - 120; p6.invT = 9e9;
  cast(b6, 'barrage');
  for (let f = 0; f < 45; f++) sb.updateWorld(1 / 60);
  ok((g6.bullets || []).length > 0, 'boss6 排到 barrage 能真打出弹幕（' + (g6.bullets || []).length + ' 发）');
}

/* ==================== totem 公共夹具 ==================== */
// L18 场地是 72 格平板（地面线 240）。玩家站到正中，左右各 72px 都不会撞 clamp，
// 这样才能验「两座分居玩家两侧、中心差 144」这条真实坐标关系。
function totemSetup() {
  const g = forceKind(bossworld(4, 17), 5), p = g.player, b = g.boss, W = g.level.w * 16;
  p.w = p.w || 10; p.h = p.h || 14;
  p.x = Math.round(W / 2 - p.w / 2); p.vx = 0; p.vy = 0;
  p.y = sb._engGroundY(p.x + p.w / 2, 0) - p.h;     // 脚踩地面（不用写死 226）
  p.hp = p.maxHp; p.invT = 999; p.dead = false;
  g.state = 'play'; b.state = 'idle'; b.t = 0;
  return { g, b, p };
}
// 举手 → 等第一座圣像落地（最多 1.5s 前摇 + 若干帧），返回当前 totem 列表
function castTotem(g) {
  const b = g.boss;
  cast(b, 'totem');
  let list = [];
  for (let f = 0; f < 90; f++) {
    sb.updateWorld(1 / 60);
    list = (g.hazards || []).filter(h => h.kind === 'totem');
    if (list.length) break;
  }
  return list;
}
/* 推进 N 帧，同时把 Boss 钉在 idle（防止它插别的招/贴脸接触伤污染血量断言）。
   each(f) 用来每帧重新钉玩家位置（击退会把人推出爆炸半径）。 */
function stepQuiet(g, n, each) {
  const b = g.boss;
  for (let f = 0; f < n; f++) {
    b.state = 'idle'; b.t = 0; b.vx = 0; b.next = '';
    if (each) each(f);
    sb.updateWorld(1 / 60);
  }
}
const totemsOf = g => (g.hazards || []).filter(h => h.kind === 'totem');

/* ==================== T2 totem 生成 ==================== */
console.log('[T2] totem 生成：举手后左右各升起一座圣像');
{
  const T = sb.BAL.boss5.totem || {};
  ok(T.n === 2 && T.hp === 3 && T.fuse === 4.0 && T.w === 16 && T.h === 32
     && T.r === 110 && T.dmg === 2 && Array.isArray(T.off) && T.off[0] === -72 && T.off[1] === 72,
    'BAL.boss5.totem 参数与 spec §三 冻结值一致',
    JSON.stringify(T));

  const { g, p } = totemSetup();
  const pcx = p.x + p.w / 2;
  const ts = castTotem(g);
  ok(ts.length === 2, '举手后场上恰好 2 座圣像（实际 ' + ts.length + ' 座）');

  const sized = ts.length === 2 && ts.every(e => e.w === 16 && e.h === 32);
  ok(sized, '两座尺寸都是 16×32（玩家看到的立牌大小）', ts.map(e => e.w + 'x' + e.h).join(' / '));
  const hpd = ts.length === 2 && ts.every(e => e.hp === 3 && e.maxHp === 3);
  ok(hpd, '两座都是 hp3 / maxHp3（要 3 刀才拆得掉）', ts.map(e => e.hp + '/' + e.maxHp).join(' / '));
  const fused = ts.length === 2 && ts.every(e => Math.abs(e.life - 4.0) < 1e-6);
  ok(fused, '两座引信都是 life=4.0s（spec 冻结的 fuse）', ts.map(e => e.life).join(' / '));

  // 左右分居：以圣像中心算，一座在玩家左侧、一座在右侧，中心距约 144（off ±72）
  const cs = ts.map(e => e.x + e.w / 2).sort((a, b) => a - b);
  const sides = ts.length === 2 && cs[0] < pcx && cs[1] > pcx;
  ok(sides, '两座分居玩家左右（圣像中心 ' + cs.map(v => v.toFixed(0)).join(' , ')
    + ' / 玩家 ' + pcx.toFixed(0) + '）');
  const gap = cs.length === 2 ? Math.abs(cs[1] - cs[0]) : -1;
  ok(Math.abs(gap - 144) <= 2, '两座中心距约 144px（off=-72/+72）', '实测 ' + gap.toFixed(1) + 'px');

  // y = 地面线（h 向上长，与 mist 同口径）：圣像底边应贴着玩家脚底那条地面
  const feet = p.y + p.h;
  const onGround = ts.length === 2 && ts.every(e => {
    const gy = sb._engGroundY(e.x + e.w / 2, p.y);
    return Math.abs(e.y - gy) <= 1 || Math.abs(e.y - feet) <= 1;
  });
  ok(onGround, '两座 y 都落在地面线上（h 向上长，不是悬空/入地）',
    ts.map(e => e.y).join(' / ') + ' / 地面 ' + feet);

  // 只在 fireN===0 那一帧生成：多推 30 帧不许再刷出第三、第四座
  stepQuiet(g, 30);
  ok(totemsOf(g).length === 2, '同一次施法不会逐帧刷新（仍是 2 座）', totemsOf(g).length);
}

/* ==================== T3 打掉不炸 ==================== */
console.log('[T3] 打掉不炸：站在圣像脚下把两座拆掉，引信到点也不掉血');
{
  const { g, p } = totemSetup();
  const ts = castTotem(g);
  const spawned = ts.length;
  ok(spawned === 2, '先确认两座已生成（实际 ' + spawned + ' 座）');

  // 玩家钉在第一座圣像中心：如果「打掉还炸」，这里一定掉血
  const t0c = ts.length ? ts[0].x + ts[0].w / 2 : p.x + p.w / 2;
  const pin = () => { p.x = t0c - p.w / 2; p.y = (ts[0] ? ts[0].y : 240) - p.h; p.vx = 0; p.vy = 0; p.invT = 0; };
  pin();
  const hp0 = p.hp;

  // 模拟玩家 3 刀拆掉：把 hp 打到 0（攻击路径只扣 hp，收尸由 hazard 循环统一做）
  for (const e of ts) e.hp = 0;
  stepQuiet(g, 5, pin);
  ok(spawned === 2 && totemsOf(g).length === 0, '两座被击破后立即从场上移除（不占用引信）',
    '存活 ' + totemsOf(g).length);

  // 引信本来 4s 到点 —— 再推满 5s，拆掉的绝不补一次爆炸
  stepQuiet(g, 300, pin);
  ok(spawned === 2 && p.hp === hp0, '拆掉的两座到点也不炸：玩家满血不动（' + hp0 + '→' + p.hp + '）');
  ok(spawned === 2 && totemsOf(g).length === 0, '5s 后场上没有任何 totem 残留', totemsOf(g).length);
}

/* ==================== T4 不拆就炸 ==================== */
console.log('[T4] 不拆就炸：站进半径至少扣 2 心，站半径外一点不掉');
{
  // A) 原地不动（钉在圣像中心，清掉无敌帧）
  const A = totemSetup();
  const tsA = castTotem(A.g);
  const spawnedA = tsA.length;
  ok(spawnedA === 2, 'A 组：两座圣像已生成', spawnedA);
  const ca = tsA.length ? tsA[0].x + tsA[0].w / 2 : 0;
  const pinA = () => { A.p.x = ca - A.p.w / 2; A.p.y = (tsA[0] ? tsA[0].y : 240) - A.p.h; A.p.vx = 0; A.p.vy = 0; A.p.invT = 0; };
  pinA();
  const hpA0 = A.p.hp;
  stepQuiet(A.g, 300, pinA);            // 5s > fuse 4s，必然跨过爆炸那一帧
  ok(spawnedA === 2 && A.p.hp <= hpA0 - 2,
    '站桩不拆 → 至少扣 2 心（' + hpA0 + '→' + A.p.hp + '，表值 dmg=' + (sb.BAL.boss5.totem || {}).dmg + '）');
  ok(spawnedA === 2 && totemsOf(A.g).length === 0, '炸完两座都消失（不会挂在场上继续炸）', totemsOf(A.g).length);

  // B) 站到半径外（>110px）→ 不掉血
  const B = totemSetup();
  const tsB = castTotem(B.g);
  const spawnedB = tsB.length;
  const leftMost = tsB.length ? Math.min.apply(null, tsB.map(e => e.x + e.w / 2)) : 0;
  const outsideX = Math.max(12, leftMost - 220);          // 离最近的圣像 220px > r=110
  const pinB = () => { B.p.x = outsideX - B.p.w / 2; B.p.y = (tsB[0] ? tsB[0].y : 240) - B.p.h; B.p.vx = 0; B.p.vy = 0; B.p.invT = 0; };
  pinB();
  const hpB0 = B.p.hp;
  stepQuiet(B.g, 300, pinB);
  const distB = tsB.length ? Math.abs((B.p.x + B.p.w / 2) - leftMost) : -1;
  ok(spawnedB === 2 && B.p.hp === hpB0,
    '站到半径外（' + distB.toFixed(0) + 'px > r=' + (sb.BAL.boss5.totem || {}).r + '）→ 一点血都不掉（'
    + hpB0 + '→' + B.p.hp + '）');
}

/* ==================== T5 自删与清场 ==================== */
console.log('[T5] 自删与清场：不留残留');
{
  const { g, p } = totemSetup();
  const ts = castTotem(g);
  ok(ts.length === 2, '引信测试：两座圣像已生成', ts.length);

  // 直接把存活时间推过 life（等价于 fuse 到点）：收尸分支必须删干净
  for (const e of ts) e.t = e.life + 0.01;
  p.x = 12; p.invT = 999;                 // 人躲远，只验自删
  stepQuiet(g, 3);
  ok(ts.length === 2 && totemsOf(g).length === 0, 'e.t 超过 life 后 totem 全部消失（不留残留）', totemsOf(g).length);

  // 换关清场：新开一场、放两座、再 loadLevel → hazards 里不许有 totem
  const W2 = totemSetup();
  const ts2 = castTotem(W2.g);
  ok(ts2.length === 2, '换关测试前：两座圣像已生成', ts2.length);
  sb.loadLevel(17, false);                 // L18 重新加载（换关=整数组清场点之一）
  const after = (sb.game.hazards || []).filter(h => h.kind === 'totem').length;
  ok(after === 0 && (sb.game.hazards || []).length === 0, 'loadLevel 后 hazards 里没有 totem（整数组清场生效）', after);
}

/* ==================== 汇总 ==================== */
console.log('\n=== v16 招牌独占 + totem: ' + pass + ' PASS / ' + fail + ' FAIL ===');
process.exit(fail ? 1 : 0);
