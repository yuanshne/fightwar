// node tools/_v19_mage_test.js —— v19 第二角色「星语法师」引擎验收（node，无依赖）
// 真值唯一来源：docs/specs/2026-10-29-v19-mage.md §1/§2/§5.1
//
// 加载方式与 gate.js engine 模式同构：levels.js + chapter2.js + chapter3.js + engine.js，
// THEMES 全键空桩（art 需要 DOM，不加载），aggregateLevels() 后取真实 19 关。
// 断言口径全部是「玩家该看到的现象」：法力扣减、CD、弹体、击杀、破盾、陨星、碎砖、复活。
// 确定性：清杂兵、把敌人钉在指定坐标、连击/充能/技能 CD 全部清零后再测，不依赖随机掉落。
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const themes = {};
['grass', 'cave', 'sky', 'factory', 'lava', 'tower', 'boss', 'wind', 'castle', 'star', 'sea', 'nether']
  .forEach(k => themes[k] = {});

const glue = '\n;return {PHY,Level,game,loadLevel,respawn,killPlayer,updateWorld,BAL,HEROES,'
  + 'aggregateLevels,getLevels:()=>ALL_LEVELS,'
  + '_engMkEnemy,_engHurtPlayer,_engBossHurt,_engGroundY};';
const sb = new Function('THEMES',
  read('levels.js') + read('chapter2.js') + read('chapter3.js') + read('engine.js') + glue)(themes);
const ALL = sb.aggregateLevels(); // 章节注册表在 levels.js 之后 push，测试里手动聚合（幂等）
const G = sb.game;
const INITIAL_HERO = G.hero;      // 引擎初始 hero（knight 回归的基准，任何赋值之前取）

let pass = 0, fail = 0;
function ok(cond, msg, extra) {
  if (cond) { pass++; console.log('  PASS ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? '   [' + extra + ']' : '')); }
}
const near = (a, b, eps) => Math.abs(a - b) <= (eps === undefined ? 0.2 : eps);
const fin = v => typeof v === 'number' && Number.isFinite(v);

/* ==================== 夹具 ==================== */
function resetInput(g) {
  const i = g.input;
  i.left = 0; i.right = 0; i.jump = 0; i.jumpHit = 0; i.attack = 0; i.attackHit = 0;
  i.dash = 0; i.dashHit = 0; i.skillUHit = 0; i.skillIHit = 0; i.skillOHit = 0;
  i.down = 0; i.skillLHit = 0;
}
// L1 草原：地面顶 y=192（第 12 行），玩家站 x=240 / y=178，右侧 14~36 格是平坦草场。
// 没有平台/尖刺/沟，适合当「射击场」；所有实体每帧重钉坐标，排除 AI 巡逻干扰。
function fresh(hero, idx) {
  const g = G;
  g.hero = hero;
  sb.loadLevel(idx === undefined ? 0 : idx, false);
  g.state = 'play'; g.paused = false; g.puzzleActive = false; g.bagActive = false;
  g.level.enemies.length = 0; g.bullets.length = 0; g.waves.length = 0; g.hazards.length = 0;
  g.meteors.length = 0; g.shots.length = 0; g.blades.length = 0;
  g.hitStop = 0; g.combo = 0; g.comboT = 0; g.ultCharge = 0; g.flashT = 0;
  g.ult = { on: false, t: 0, fired: false, flashed: false };
  g.sfxQueue.length = 0;
  g.skills = { u: 0, i: 0, o: 0, l: 0 };
  g.cdMul = 1;
  resetInput(g);
  const p = g.player;
  p.x = 240; p.y = 178; p.vx = 0; p.vy = 0; p.face = 1;
  p.dead = false; p.deadT = 0; p.hp = p.maxHp; p.invT = 9e9;
  p.shieldT = 0; p.shieldHp = 0; p.castT = 0;
  p.atkCd = 0; p.atkT = 0; p.atkWind = 0; p.abuf = 0; p.atkSeq = 0; p.shotSeq = 0;
  return g;
}
function putEnemy(g, type, x, y, hp) {
  const e = sb._engMkEnemy(type, x - 2, y + 2, false);
  e.x = x; e.y = y; e.vx = 0; e.vy = 0; e._x = x; e._y = y;
  if (hp !== undefined) e.hp = hp;
  g.level.enemies.push(e);
  return e;
}
function pinE(e) { return () => { e.x = e._x; e.y = e._y; e.vx = 0; e.vy = 0; }; }
function pins() {
  const fs2 = Array.prototype.slice.call(arguments).filter(Boolean);
  return () => { for (const f of fs2) f(); };
}
// 玩家钉在原地（防止重力/输入让他走位），但不碰 invT（护盾测试要自己控制无敌帧）
function stepHold(g, n, extra) {
  const p = g.player, x = p.x, y = p.y;
  for (let f = 0; f < n; f++) {
    if (!p.dead) { p.x = x; p.y = y; p.vx = 0; p.vy = 0; }
    if (extra) extra(f);
    sb.updateWorld(1 / 60);
  }
}
function stepFree(g, n) { for (let f = 0; f < n; f++) sb.updateWorld(1 / 60); }
function atk(g) { g.input.attackHit = 1; }
// 等弹体出现 / 等敌人掉血（每帧重钉），返回经历帧数，超时返回 -1
function waitShots(g, max, extra) {
  for (let f = 0; f < max; f++) {
    stepHold(g, 1, extra);
    if (g.shots.length > 0) return f + 1;
  }
  return -1;
}
function waitEnemyHurt(g, e, hp0, max, extra) {
  for (let f = 0; f < max; f++) {
    stepHold(g, 1, extra);
    if (e.hp < hp0) return f + 1;
  }
  return -1;
}

/* ==================== T1 英雄注册表 + BAL.heroes.mage ==================== */
console.log('[T1] HEROES 注册表 / BAL.heroes.mage 完整性');
{
  const H = sb.HEROES, M = sb.BAL.heroes && sb.BAL.heroes.mage;
  ok(!!(H && H.knight && H.mage), 'HEROES.knight 与 HEROES.mage 都存在');
  ok(H && Object.keys(H).join(',') === 'knight,mage', 'HEROES 顺序固定 knight → mage', H && Object.keys(H).join(','));
  ok(!!(M && M.hpBase === 4 && sb.BAL.player.hpBase === 5), 'mage.hpBase=4（勇者 5）',
    M && M.hpBase + '/' + sb.BAL.player.hpBase);
  ok(!!(H && H.mage.hpBase === 4 && H.mage.usesMana === true && H.mage.id === 'mage'),
    'HEROES.mage = hpBase 4 / usesMana true / id mage');
  ok(!!(H && H.knight.usesMana === false && H.knight.hpBase === sb.BAL.player.hpBase),
    'HEROES.knight usesMana=false 且 hpBase 引用 BAL.player.hpBase');

  const mk = M || {}, keys = ['hpBase', 'manaMax', 'manaRegen', 'manaPerHit', 'manaPerKill', 'bolt', 'u', 'i', 'o', 'l'];
  const missing = keys.filter(k => mk[k] === undefined);
  ok(missing.length === 0, 'BAL.heroes.mage 键完整（hp/mana/bolt/u/i/o/l）', '缺 ' + missing.join(','));
  ok(mk.manaMax === 100 && mk.manaRegen === 3 && mk.manaPerHit === 5 && mk.manaPerKill === 12,
    '法力循环参数 100 / +3s（v20.4：5→3）/ 命中+5（v20.4：8→5）/ 击杀+12');
  const b = mk.bolt || {}, u = mk.u || {}, i = mk.i || {}, o = mk.o || {}, l = mk.l || {};
  ok(b.cd === 0.46 && b.dmg === 2 && b.v === 300 && b.life === 0.60 && b.w === 8 && b.h === 6
    && b.homeR === 85 && b.homeDeg === 26 && b.turn === 4,
    'bolt 表（v20.4：0.38→0.46 / 0.85→0.70；v20.6：追踪 110→85 / 6→4；v20.7：life 0.70→0.60）：0.46s / 2 伤 / 300px/s / 0.60s / 8×6 / 追踪 85px±26°', JSON.stringify(b));
  ok(u.cd === 7 && u.mana === 25 && u.n === 8 && u.dmg === 3 && u.freeze === 0.8 && u.v === 300 && u.life === 0.36,
    'u 表（v19.3 霜爆新星）：7s / 25 蓝 / 8 道 / 3 伤 / 冻结 0.8s / 300px/s / 0.36s', JSON.stringify(u));
  ok(i.cd === 10 && i.mana === 25 && i.dur === 2.5 && i.absorb === 2, 'i 表：10s / 25 蓝 / 2.5s / 吸 2 次', JSON.stringify(i));
  ok(o.cd === 20 && o.mana === 0 && o.n === 6 && o.dmg === 2 && o.aoe === 30 && o.fallV === 340 && o.gap === 0.08
    && Array.isArray(o.t) && o.t.join(',') === '0.35,0.9,1.2',
    'o 表：20s / 0 蓝 / 6 颗 / 2 伤（v20.6：3→2）/ AoE30 / 0.35-0.9-1.2', JSON.stringify(o));
  ok(l.cd === 8 && l.mana === 30 && l.dmg === 4 && l.v === 150 && l.stopT === 0.5 && l.hold === 1.1
    && l.radius === 100 && l.pull === 90,
    'l 表（v19.3 引力奇点）：8s / 30 蓝 / 4 伤 / 150px/s / 0.5s 停驻 / 1.1s 存续 / 半径 100 / 吸力 90', JSON.stringify(l));

  // 注册表必须引用 BAL 求值，不得另抄数字（改了 BAL 两处一起变）
  const hk = (H && H.mage && H.mage.skills) || {};
  ok(hk.u && hk.i && hk.o && hk.l
    && hk.u.cd === u.cd && hk.u.mana === u.mana
    && hk.i.cd === i.cd && hk.i.mana === i.mana
    && hk.o.cd === o.cd && hk.o.mana === o.mana
    && hk.l.cd === l.cd && hk.l.mana === l.mana,
    'HEROES.mage.skills 的 cd/mana 与 BAL 逐项相等（同一真值）');
  ok(Object.keys(hk).join(',') === 'u,i,o,l' && hk.u.name === '霜爆新星' && hk.i.name === '星辉屏障'
    && hk.o.name === '陨星风暴' && hk.l.name === '引力奇点' && hk.o.ult === true,
    'mage 四技能名与 ult 标记正确（霜爆新星/星辉屏障/陨星风暴/引力奇点）');
}

/* ==================== T2 knight 回归 ==================== */
console.log('[T2] knight 回归：默认英雄 / 5 血 / 无 shots / 普攻仍近战');
{
  ok(INITIAL_HERO === 'knight', '引擎初始 game.hero = knight', INITIAL_HERO);
  G.hero = 'knight';
  sb.loadLevel(0, false);
  const g = G;
  g.state = 'play'; g.level.enemies.length = 0;
  g.meteors.length = 0; g.bullets.length = 0; g.hitStop = 0; g.combo = 0; g.comboT = 0;
  resetInput(g);
  g.shots.length = 0;
  const p = g.player;
  p.x = 240; p.y = 178; p.vx = 0; p.vy = 0; p.face = 1; p.invT = 9e9; p.hp = p.maxHp;
  p.atkCd = 0; p.atkT = 0; p.atkWind = 0; p.abuf = 0; p.atkSeq = 0;
  ok(p.maxHp === 5, 'knight loadLevel 后 maxHp=5', p.maxHp);
  ok(g.manaMax === 0 && g.mana === 0, 'knight 无法力（manaMax=0 / mana=0）', g.manaMax + '/' + g.mana);
  ok(Array.isArray(g.shots) && g.shots.length === 0, 'knight 空 shots（远程池为空）', g.shots && g.shots.length);

  const e = putEnemy(g, 'slime', 256, 182, 10);
  const hp0 = e.hp;
  atk(g);
  stepHold(g, 20, pinE(e));
  ok(e.hp === hp0 - 2, 'knight 普攻仍是近战判定框（史莱姆 10→' + e.hp + '，2 伤）', e.hp);
  ok(g.shots.length === 0, 'knight 普攻不产生 game.shots', g.shots.length);
  ok(p.atkSeq >= 1 && p.atkT <= 0, 'knight 攻击序号推进且判定窗已结束（起手/判定时序未变）',
    'atkSeq=' + p.atkSeq + ' atkT=' + p.atkT.toFixed(3));
}

/* ==================== T3 mage 普攻 ==================== */
console.log('[T3] mage：4 血 / 满蓝 / 普攻生成弹体并在 1s 内命中');
{
  const g = fresh('mage');
  const p = g.player;
  ok(p.maxHp === 4, 'mage loadLevel 后 maxHp=4', p.maxHp);
  ok(g.mana === 100 && g.manaMax === 100, 'mage loadLevel 后 mana=100 / manaMax=100', g.mana + '/' + g.manaMax);
  ok(g.shots.length === 0, 'mage 进场 shots 为空', g.shots.length);

  const e = putEnemy(g, 'slime', p.x + 70, 182, 10);
  const hp0 = e.hp;
  atk(g);
  const fShot = waitShots(g, 24, pinE(e));   // 0.4s = 24 帧
  ok(fShot > 0 && g.shots.length === 1, '普攻 0.4s 内生成 1 发弹体（第 ' + fShot + ' 帧）', g.shots.length);
  const s = g.shots[0] || {};
  ok(s.kind === 'bolt' && s.w === 8 && s.h === 6 && Math.abs(s.vx) === 300 && near(s.life, 0.60, 0.02),
    '弹体形态：kind=bolt / 8×6 / ±300px/s / life≈0.60（v20.7：0.70→0.60，射程 180px）', JSON.stringify({ k: s.kind, vx: s.vx, life: s.life }));
  let hitF = -1;
  for (let f = 0; f < 60 && hitF < 0; f++) { stepHold(g, 1, pinE(e)); if (e.hp < hp0) hitF = fShot + f + 1; }
  ok(hitF > 0 && hitF <= 60, '弹体飞行并在 1s 内命中敌人（总第 ' + hitF + ' 帧，hp 10→' + e.hp + '）', hitF);
  ok(e.hp === hp0 - 2, '普攻命中伤害 = 2（atkBase，无装备）', e.hp);
}

/* ==================== T4 远程击杀计入封印 ==================== */
console.log('[T4] 远程击杀：seal.enemyKilled +1（唯一击杀入口）');
{
  const g = fresh('mage');
  const p = g.player;
  const e = putEnemy(g, 'slime', p.x + 70, 182, 1);
  const before = g.seal ? g.seal.enemyKilled : -1;
  atk(g);
  let killed = false;
  for (let f = 0; f < 60; f++) {
    stepHold(g, 1, pinE(e));
    if (e.dead > 0) { killed = true; break; }
  }
  stepHold(g, 10, pinE(e)); // 击杀当帧有 0.06s hit-stop，封印计数在冻结解除后才刷新
  ok(before === 0, '开打前 seal.enemyKilled=0', before);
  ok(killed, '1 血史莱姆被远程弹体击杀（dead>0）', e.dead);
  ok(g.seal && g.seal.enemyKilled === 1, 'seal.enemyKilled 计数 +1（远程击杀计入封印）', g.seal && g.seal.enemyKilled);
}

/* ==================== T5 U 霜爆新星 ==================== */
console.log('[T5] U：扣 25 蓝 / 7s CD / 八向冰锥 / 命中冻结 0.8s；0 蓝不扣不进 CD');
{
  const g = fresh('mage');
  const p = g.player;
  g.mana = 100;
  const a = putEnemy(g, 'slime', p.x + 26, 182, 9);
  const b = putEnemy(g, 'slime', p.x - 26, 182, 9);
  const c = putEnemy(g, 'slime', p.x + 2, 158, 9);      // 正上方：验证「身周」而不是「前方」
  const hpA = a.hp, hpB = b.hp, hpC = c.hp;
  g.input.skillUHit = 1;
  stepHold(g, 1);
  ok(near(100 - g.mana, 25, 0.2), 'U 扣 25 法力（100→' + g.mana.toFixed(2) + '）', (100 - g.mana).toFixed(2));
  ok(g.skills.u > 6.9 && g.skills.u <= 7.0, 'U 进入 7s CD', g.skills.u);
  const shards = g.shots.filter(s => s.kind === 'shard');
  ok(shards.length === 8, 'U 一次炸出 8 枚 shard 弹体', shards.length);
  ok(shards.every(s => Math.abs(Math.hypot(s.vx, s.vy) - 300) < 0.5), '八枚速度均为 300px/s',
    shards.map(s => Math.hypot(s.vx, s.vy).toFixed(1)).join(','));
  const angs = shards.map(s => Math.atan2(s.vy, s.vx)).sort((x, y) => x - y);
  let maxGap = 0;
  for (let i = 1; i < angs.length; i++) maxGap = Math.max(maxGap, angs[i] - angs[i - 1]);
  ok(maxGap > 0 && maxGap < 0.80, '八枚方向均分（最大相邻夹角 ' + (maxGap * 180 / Math.PI).toFixed(1) + '°）', maxGap.toFixed(3));
  ok(g.sfxQueue.indexOf('nova') >= 0, 'U 推送 nova 音效事件', g.sfxQueue.slice(-4).join(','));

  stepHold(g, 10, pins(pinE(a), pinE(b), pinE(c)));
  ok(a.hp === hpA - 3 && b.hp === hpB - 3 && c.hp === hpC - 3,
    '左右 + 正上方三个敌人都吃 3 伤（身周 360°）', [a.hp, b.hp, c.hp].join('/'));
  ok((a.freezeT || 0) > 0.6 && (b.freezeT || 0) > 0.6 && (c.freezeT || 0) > 0.6,
    '命中即冻结（freezeT 剩余 >0.6s）', [a.freezeT, b.freezeT, c.freezeT].map(v => (v || 0).toFixed(2)).join('/'));

  // 冻结必须真的定身：不钉坐标，走 20 帧看它会不会自己动
  const fx0 = a.x, fy0 = a.y;
  stepHold(g, 20);
  ok(Math.abs(a.x - fx0) < 0.5 && Math.abs(a.y - fy0) < 0.5 && a.vx === 0,
    '冻结期间敌人原地不动（x/y 位移 <0.5px、vx=0）', (a.x - fx0).toFixed(2) + '/' + (a.y - fy0).toFixed(2));

  // 同一次新星对同一敌人只结算一次：把敌人怼在玩家身上，八枚全中也不该吃 8 份伤
  const g3 = fresh('mage');
  const p3 = g3.player;
  g3.mana = 100;
  const on = putEnemy(g3, 'slime', p3.x + 1, p3.y + 2, 30);
  g3.input.skillUHit = 1;
  stepHold(g3, 12, pinE(on));
  ok(on.hp === 27, '贴身敌人只吃 1 份 3 伤（八枚冰锥不叠加，30→' + on.hp + '）', on.hp);

  // 0 蓝：不扣蓝、不进 CD、manaToast>0、推一次 nomana
  const g2 = fresh('mage');
  g2.mana = 0; g2.skills.u = 0; g2.shots.length = 0;
  const q0 = g2.sfxQueue.length;
  g2.input.skillUHit = 1;
  stepHold(g2, 1);
  ok(g2.mana < 1, '0 蓝按 U 不扣蓝（mana=' + g2.mana.toFixed(2) + '）', g2.mana);
  ok(g2.skills.u === 0, '0 蓝按 U 不进 CD', g2.skills.u);
  ok(g2.shots.length === 0, '0 蓝按 U 不生成冰锥', g2.shots.length);
  ok(g2.manaToast > 0.8, '0 蓝按 U 置 manaToast=0.9', g2.manaToast);
  ok(g2.sfxQueue.slice(q0).indexOf('nomana') >= 0, '0 蓝按 U 推送 nomana 音效', g2.sfxQueue.slice(q0).join(','));
}

/* ==================== T6 I 星辉屏障 ==================== */
console.log('[T6] I：2.5s 吸 2 次，第 3 次才掉血');
{
  const g = fresh('mage');
  const p = g.player;
  g.mana = 100;
  g.input.skillIHit = 1;
  stepHold(g, 1);
  ok(near(100 - g.mana, 25, 0.2), 'I 扣 25 法力', (100 - g.mana).toFixed(2));
  ok(near(p.shieldT, 2.5, 0.05) && p.shieldHp === 2, 'I 开盾 2.5s / 可吸 2 次', p.shieldT.toFixed(2) + ' / ' + p.shieldHp);
  ok(g.skills.i > 9.9 && g.skills.i <= 10.0, 'I 进入 10s CD', g.skills.i);

  const hp0 = p.hp;
  p.invT = 0;
  const r1 = sb._engHurtPlayer(p.x + 100, 1);
  ok(r1 === false && p.hp === hp0 && p.shieldHp === 1, '第一次受击：护盾吸掉，血量不变（2→1 层）',
    p.hp + ' / hp' + p.shieldHp);
  p.invT = 0;
  const r2 = sb._engHurtPlayer(p.x + 100, 1);
  ok(r2 === false && p.hp === hp0 && p.shieldHp === 0 && p.shieldT === 0,
    '第二次受击：护盾吸掉并破碎（2 次后破盾，血量仍 4）', p.hp + ' / shieldT=' + p.shieldT);
  p.invT = 0;
  const r3 = sb._engHurtPlayer(p.x + 100, 1);
  ok(r3 === true && p.hp === hp0 - 1, '第三次受击：无盾掉 1 心（4→' + p.hp + '）', p.hp);
}

/* ==================== T7 L 引力奇点 ==================== */
console.log('[T7] L：扣 30 蓝 / 8s CD / 0.5s 停驻 → 吸敌 → 1.1s 引爆 4 伤');
{
  const g = fresh('mage');
  const p = g.player;
  g.mana = 100;
  g.input.skillLHit = 1;
  stepHold(g, 1);
  ok(near(100 - g.mana, 30, 0.2), 'L 扣 30 法力', (100 - g.mana).toFixed(2));
  ok(g.skills.l > 7.9 && g.skills.l <= 8.0, 'L 进入 8s CD', g.skills.l);
  ok(g.wells.length === 1, 'L 生成 1 个奇点实体', g.wells.length);
  const w0 = g.wells[0] || {};
  ok(w0.w === 14 && w0.h === 14 && Math.abs(w0.vx) === 150 && w0.stopped === false && w0.r === 100,
    '奇点初始：14×14 / ±150px/s / 飞行态 / 吸附半径 100',
    JSON.stringify({ w: w0.w, vx: w0.vx, stopped: w0.stopped, r: w0.r }));
  ok(g.sfxQueue.indexOf('well') >= 0, 'L 推送 well 音效事件', g.sfxQueue.slice(-4).join(','));

  stepHold(g, 32);                                   // 0.5s（31 帧起算有浮点余量）：飞行 75px 后停驻
  const ws = g.wells[0] || {};
  ok(ws.stopped === true, '0.5s（150px/s×0.5≈75px）后停驻', JSON.stringify({ t: (ws.t || 0).toFixed(2), stopped: ws.stopped }));
  const sx = ws.x, sy = ws.y;
  stepHold(g, 4);
  ok(g.wells[0] && g.wells[0].x === sx && g.wells[0].y === sy, '停驻后位置不再漂移');

  // 吸附：站桩敌人（spitter 不巡逻）放在 90px 外，0.33s 后应被拉近 ≥20px
  const e = putEnemy(g, 'spitter', sx + 90, sy, 30);
  const d0 = Math.abs((e.x + e.w / 2) - (sx + 7));
  stepHold(g, 20);
  const d1 = Math.abs((e.x + e.w / 2) - (sx + 7));
  ok(d1 < d0 - 20, '奇点把 90px 外的敌人拉近（' + d0.toFixed(0) + '→' + d1.toFixed(0) + 'px）',
    d0.toFixed(1) + '→' + d1.toFixed(1));

  // 引爆：存续 1.1s 到点 → 半径内 4 伤 + 实体清空
  const hp0 = e.hp;
  stepHold(g, 46);
  ok(e.hp === hp0 - 4, '引爆对半径内敌人结算 4 伤（30→' + e.hp + '）', e.hp);
  ok(g.wells.length === 0, '引爆后奇点实体清空', g.wells.length);
  ok(g.sfxQueue.indexOf('wellBoom') >= 0, '引爆推送 wellBoom 音效', g.sfxQueue.slice(-4).join(','));

  // 半径外不吃伤：引爆时把敌人放到 140px 外
  const g2 = fresh('mage');
  g2.mana = 100;
  g2.input.skillLHit = 1;
  stepHold(g2, 1);
    // 放在奇点「背后」140px：奇点会往前飞 75px，只会越飞越远，永进不了半径 100
  const far = putEnemy(g2, 'spitter', g2.wells[0].x - 140, g2.wells[0].y, 20);
  const farHp = far.hp;
  stepHold(g2, 105);                                  // 0.5s 飞行 + 1.1s 存续 = 1.6s（96 帧）+ 余量
  ok(far.hp === farHp, '半径 100 外的敌人不吃引爆伤害（仍 ' + far.hp + '）', far.hp);
  ok(g2.wells.length === 0, '第二个奇点同样按时引爆', g2.wells.length);
}

/* ==================== T8 O 陨星风暴 + Boss ==================== */
console.log('[T8] O：ultCharge=100 → kind=mage / 0.35s 生成 6 颗 mage 陨星 / Boss 3 伤 / breakT');
{
  const g = fresh('mage');
  g.ultCharge = 100;
  g.input.skillOHit = 1;
  stepHold(g, 1);
  ok(g.ult && g.ult.on && g.ult.kind === 'mage', 'O 触发：game.ult.kind = mage', g.ult && g.ult.kind);
  ok(g.ultCharge === 0 && near(g.skills.o, 20, 0.1), 'O 清空充能并进入 20s CD（不耗蓝）', g.ultCharge + ' / ' + g.skills.o);
  ok(g.mana === 100, 'O 不消耗法力（mana 仍 100）', g.mana);
  ok(g.meteors.length === 0, '吟唱 0.35s 内不落星', g.meteors.length);
  let firedF = -1;
  for (let f = 0; f < 30; f++) { stepHold(g, 1); if (g.meteors.length) { firedF = f + 1; break; } }
  const mm = g.meteors.filter(m => m.mage);
  ok(firedF > 0 && near((firedF + 1) / 60, 0.35, 0.03), '0.35s 时一次性落星（第 ' + (firedF + 1) + ' 帧）', (firedF + 1) / 60);
  ok(mm.length === 6, '恰好生成 6 颗 mage:true 陨星', mm.length + '/' + g.meteors.length);
  ok(mm.every(m => m.dmg === 2 && m.bossDmg === 2 && m.aoe === 30 && m.vy === 340),
    '每颗陨星 dmg=2（v20.6：3→2）/ bossDmg=2 / aoe=30 / fallV=340');
  // 注意：陨星在 t=0.35 用**当时**的 cam.x 生成，之后相机还会 lerp；这里按「相邻间距 64px、
  // 总跨度 320px、全部落在当前屏内」断言，避免拿刷新后的 cam.x 去反推生成点（会差几像素）。
  ok(mm.every((m, i) => near(m.delay, i * 0.08, 0.02)   // 生成当帧已步进 1 帧，delay 允许差 1/60
      && (i === 0 || near(m.x - mm[0].x, 64 * i, 0.01))
      && m.x >= g.cam.x - 16 && m.x <= g.cam.x + 400),
    '6 颗按 0.08s 间隔在屏内均匀铺开（跨度 ' + (mm.length ? (mm[mm.length - 1].x - mm[0].x).toFixed(1) : 0) + 'px）',
    mm.map(m => (m.x - g.cam.x).toFixed(1)).join(','));
  ok(g.sfxQueue.indexOf('storm') >= 0, '落星推送 storm 音效', g.sfxQueue.slice(-5).join(','));

  // Boss 关卡：mage 大招同样生成 6 颗
  let bossIdx = -1;
  for (let i = 0; i < ALL.length; i++) if (ALL[i] && ALL[i].boss) { bossIdx = i; break; }
  ok(bossIdx >= 0, '找到首个 Boss 关（L' + (bossIdx + 1) + '）', bossIdx);
  const gb = fresh('mage', bossIdx);
  const b = gb.boss;
  ok(!!b, 'Boss 关 loadLevel 生成 game.boss', !!b);
  b.state = 'idle'; b.t = 0; b.vx = 0;
  gb.ultCharge = 100;
  gb.input.skillOHit = 1;
  let bossFired = -1;
  for (let f = 0; f < 35; f++) {
    b.state = 'idle'; b.t = 0; b.vx = 0;
    sb.updateWorld(1 / 60);
    if (gb.meteors.filter(m => m.mage).length >= 6) { bossFired = f + 1; break; }
  }
  ok(bossFired > 0 && gb.meteors.filter(m => m.mage).length === 6,
    'Boss 关 mage 大招同样生成 6 颗陨星', gb.meteors.length);

  // 单颗陨星砸 Boss：掉 3 血（走 §⑨″ 真实陨星更新路径）
  gb.meteors.length = 0;
  gb.ult = { on: false, t: 0, fired: false, flashed: false };
  gb.hitStop = 0;
  b.state = 'idle'; b.t = 0; b.vx = 0; b.parryOn = false; b.breakT = 0; b.coreOn = false;
  const hp0 = b.hpTotal;
  gb.meteors.push({ x: b.x + b.w / 2 - 5, y: b.y - 16, vy: 340, w: 10, h: 12, delay: 0,
    ring: sb._engGroundY(b.x + b.w / 2, b.y), dmg: 3, bossDmg: 3, aoe: 30, mage: true });
  let hitBossF = -1;
  for (let f = 0; f < 30; f++) {
    b.state = 'idle'; b.t = 0; b.vx = 0;
    const hv = b.hpTotal;
    sb.updateWorld(1 / 60);
    if (b.hpTotal < hv) { hitBossF = f + 1; break; }
  }
  ok(hitBossF > 0 && hp0 - b.hpTotal === 3, 'mage 陨星命中 Boss 单次 3 伤（' + hp0 + '→' + b.hpTotal + '）', hp0 - b.hpTotal);

  // isUlt 破 parry：parryOn 的 Boss 被 mage 陨星打中 → 架势解除 + breakT>0
  gb.meteors.length = 0; gb.hitStop = 0;
  b.state = 'idle'; b.t = 0; b.vx = 0; b.parryOn = true; b.breakT = 0; b.coreOn = false;
  gb.meteors.push({ x: b.x + b.w / 2 - 5, y: b.y - 16, vy: 340, w: 10, h: 12, delay: 0,
    ring: sb._engGroundY(b.x + b.w / 2, b.y), dmg: 3, bossDmg: 3, aoe: 30, mage: true });
  for (let f = 0; f < 30; f++) {
    b.state = b.state === 'idle' ? 'idle' : b.state; b.vx = 0;
    sb.updateWorld(1 / 60);
    if (b.breakT > 0) break;
  }
  ok(b.parryOn === false && b.breakT > 0, 'mage 陨星 isUlt=true 可破 parry（breakT=' + (b.breakT || 0).toFixed(2) + '）',
    'parryOn=' + b.parryOn + ' breakT=' + b.breakT);
}

/* ==================== T9 法师弹破砖 ==================== */
console.log('[T9] mage 弹体：破 B 砖 +1 金币 / 破 G 隐藏砖');
{
  const g = fresh('mage');
  const p = g.player;
  g.level.tiles[11][16] = 'B';        // 玩家右侧 1 格、弹道高度：256..272 × 176..192
  const c0 = g.coins;
  atk(g);
  let brokeB = false;
  for (let f = 0; f < 40; f++) {
    stepHold(g, 1);
    if (g.level.tiles[11][16] === '.') { brokeB = true; break; }
  }
  ok(brokeB, 'bolt 击碎 B 木箱砖（瓦片变 .）', g.level.tiles[11][16]);
  ok(g.coins === c0 + 1, 'B 砖碎后金币 +1（' + c0 + '→' + g.coins + '）', g.coins);

  const g2 = fresh('mage');
  g2.level.tiles[11][16] = 'G';
  const c1 = g2.coins;
  atk(g2);
  let brokeG = false;
  for (let f = 0; f < 40; f++) {
    stepHold(g2, 1);
    if (g2.level.tiles[11][16] === '.') { brokeG = true; break; }
  }
  ok(brokeG, 'bolt 击碎 G 隐藏砖（瓦片变 .）', g2.level.tiles[11][16]);
  ok(g2.coins === c1, 'G 砖碎后不加金币（探索奖励口径不变）', g2.coins);
}

/* ==================== T10 复活复位 ==================== */
console.log('[T10] respawn：法力回满 / shots 清空 / shotSeq 复位');
{
  const g = fresh('mage');
  const p = g.player;
  g.mana = 30;
  p.shotSeq = 4;
  g.shots.push({ kind: 'bolt', x: p.x, y: p.y, w: 8, h: 6, vx: 300, vy: 0, life: 1, dmg: 2, pierce: 0, hitList: [] });
  sb.killPlayer();
  ok(p.dead === true, 'killPlayer 后进入死亡态', p.dead);
  stepFree(g, 70);                    // 0.9s 死亡冻结后自动 respawn
  ok(p.dead === false, '0.9s 后自动复活', p.dead);
  ok(g.mana === g.manaMax && g.mana === 100, '复活后法力回满 100', g.mana + '/' + g.manaMax);
  ok(g.shots.length === 0, '复活后 shots 清空', g.shots.length);
  ok(p.shotSeq === 0, '复活后 shotSeq 复位为 0', p.shotSeq);
  ok(p.hp === p.maxHp && p.maxHp === 4, '复活后 4 血满血（hp/maxHp=' + p.hp + '/' + p.maxHp + '）', p.maxHp);
}

/* ==================== T11 全 19 关 mage 空转 ==================== */
console.log('[T11] 全 ' + ALL.length + ' 关：hero=mage 空转 120 帧不抛异常 / 法力与坐标有限');
{
  ok(ALL.length === 19, 'ALL_LEVELS 共 19 关', ALL.length);
  let thrown = null;
  for (let i = 0; i < ALL.length; i++) {
    try {
      G.hero = 'mage';
      sb.loadLevel(i, false);
      G.state = 'play';
      for (let f = 0; f < 120; f++) sb.updateWorld(1 / 60);
      const p = G.player;
      ok(fin(G.mana) && G.mana >= 0 && G.mana <= 100 && fin(p.x) && fin(p.y) && fin(G.manaMax),
        'L' + (i + 1) + ' mage 空转 120 帧：mana=' + G.mana.toFixed(1) + ' 玩家@(' + Math.round(p.x) + ',' + Math.round(p.y) + ')');
    } catch (e) {
      thrown = 'L' + (i + 1) + ': ' + (e && e.message ? e.message : e);
      ok(false, 'L' + (i + 1) + ' mage 空转抛异常', thrown);
      break;
    }
  }
  ok(!thrown, '19 关 mage 空转无异常', thrown || '');
}

/* ==================== T12 复活后仍 4 血 ==================== */
console.log('[T12] mage respawn 后仍是 4 血（不回落骑士 5）');
{
  const g = fresh('mage');
  const p = g.player;
  ok(p.maxHp === 4, '死前 maxHp=4', p.maxHp);
  sb.killPlayer();
  stepFree(g, 70);
  ok(p.dead === false, '已复活', p.dead);
  ok(g.hero === 'mage' && p.maxHp === 4 && p.hp === 4,
    '复活后 hero 仍 mage / maxHp=4 / hp=4（不会退回 5）', g.hero + ' / ' + p.hp + '/' + p.maxHp);
  ok(g.manaMax === 100 && g.mana === 100, '复活后法力上限仍 100 且已回满', g.manaMax + '/' + g.mana);
}

/* ==================== 汇总 ==================== */
console.log('\n=== v19 法师引擎验收: ' + pass + ' PASS / ' + fail + ' FAIL ===');
process.exit(fail ? 1 : 0);
