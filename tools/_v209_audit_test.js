// node tools/_v209_audit_test.js —— v20.9 交互审计验收（node，无依赖；v22 更新茧网口径）
// 覆盖用户点名的四个问题：
//   1. 法师弹体能打破虫卵（v20.8 前弹体直接穿卵 = 无法交互 bug）
//   2. 法师取消连击收益（命中不涨连击、弹体永不暴击；击杀回蓝保留）
//   3. 蛛网（茧母·地网囚天）：v20.9 曾做 2 血可打掉；**v22 按用户口径改回不可打掉**——
//      近战/弹体/陨星三条路径对无 hp 的网全部穿透，网只能等 6.5s 自然消散
//   4. 陨星大招砸得到 hazards（egg/totem 等）
// 加载方式同 _v19_mage_test（levels+chapters+engine 拼接，THEMES 空桩）。
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const themes = {};
['grass', 'cave', 'sky', 'factory', 'lava', 'tower', 'boss', 'wind', 'castle', 'star', 'sea', 'nether']
  .forEach(k => themes[k] = {});

const glue = '\n;return {PHY,Level,game,loadLevel,updateWorld,BAL,HEROES,'
  + 'aggregateLevels,_engMkEnemy,_engPushShot,_engUpdateShots,_engMageMeteorHit,_engBossTable,_engKillEnemy};';
const sb = new Function('THEMES',
  read('levels.js') + read('chapter2.js') + read('chapter3.js') + read('engine.js') + glue)(themes);
const G = sb.game;

let pass = 0, fail = 0;
function ok(cond, msg, extra) {
  if (cond) { pass++; console.log('  PASS ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? '   [' + extra + ']' : '')); }
}

/* ==================== 夹具（同 _v19_mage_test 口径） ==================== */
function resetInput(g) {
  const i = g.input;
  i.left = 0; i.right = 0; i.jump = 0; i.jumpHit = 0; i.attack = 0; i.attackHit = 0;
  i.dash = 0; i.dashHit = 0; i.skillUHit = 0; i.skillIHit = 0; i.skillOHit = 0;
  i.down = 0; i.skillLHit = 0;
}
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
function stepHold(g, n, extra) {
  const p = g.player, x = p.x, y = p.y;
  for (let f = 0; f < n; f++) {
    if (!p.dead) { p.x = x; p.y = y; p.vx = 0; p.vy = 0; }
    if (extra) extra(f);
    sb.updateWorld(1 / 60);
  }
}
function atk(g) { g.input.attackHit = 1; }
function fireAndWait(g, max) { // 发一发弹并等它出现在 shots；返回是否成功
  for (let f = 0; f < (max || 60); f++) {
    stepHold(g, 1);
    if (g.shots.length > 0) return true;
  }
  return false;
}
function makeEgg(g, x, y, hp) {
  const e = { kind: 'egg', x: x, y: y, w: 16, h: 16, t: 0, stage: 0,
    hp: hp === undefined ? 2 : hp, maxHp: hp === undefined ? 2 : hp, stageT: 3.0, flashT: 0, hitCd: 0 };
  g.hazards.push(e);
  return e;
}
function makeWeb(g, x, y) { // v22：与引擎 _engB9Web 同构——不带 hp（不可打掉）
  const e = { kind: 'web', x: x, y: y, w: 112, h: 12, life: 6.5, slow: 0.4, noJump: true, t: 0,
    flashT: 0 };
  g.hazards.push(e);
  return e;
}

/* ==================== T1 茧母调频表 ==================== */
console.log('[T1] boss9（孵化之间）技能频率');
{
  const T = sb._engBossTable(9);
  ok(T.idleT && T.idleT[0] === 0.80 && T.idleT[1] === 0.60,
    'idleT [0.80,0.60]（v20.9：0.55/0.40 → 拉长喘息窗口）', T.idleT && JSON.stringify(T.idleT));
  ok(T.spawn && T.spawn.cd === 9.0, 'spawn cd 9.0s（v20.9：7→9，卵海放缓）', T.spawn && T.spawn.cd);
  ok(T.spawn && T.spawn.hp === 2 && T.spawn.cap === 6, '卵 hp2 / cap6 不变');
}

/* ==================== T2 法师弹体 × 虫卵（bug 修复） ==================== */
console.log('[T2] 法师 bolt 打得破虫卵');
{
  const g = fresh('mage');
  const egg = makeEgg(g, 276, 176);              // 弹道 y≈183-189 × egg y176-192 相交
  ok(g.hazards.length === 1 && egg.hp === 2, '卵就位 hp2');
  atk(g);
  const shotOk = fireAndWait(g);
  ok(shotOk, '弹体出膛');
  let hurt = -1;
  for (let f = 0; f < 90 && hurt < 0; f++) { stepHold(g, 1); if (egg.hp < 2) hurt = f + 1; }
  ok(hurt > 0, '弹体命中卵：hp 2→1（旧版直接穿卵）', 'hp=' + egg.hp);
  ok(g.combo === 0, '命中卵不涨连击（v20.9 取消法师连击收益）', 'combo=' + g.combo);
  // 第二发打碎 → 卵「提前放出幼虫」：同一对象 stage+1、hp 重置为 larvaHp=3（引擎口径：卵不消失，只提前一格）
  g.shots.length = 0;
  for (let f = 0; f < 40; f++) stepHold(g, 1);   // 等 atkCd 0.46s 过去
  g.combo = 0; egg.hitCd = 0;
  atk(g); fireAndWait(g);
  let hatched = -1;
  for (let f = 0; f < 120 && hatched < 0; f++) { stepHold(g, 1); if (egg.stage >= 1) hatched = f + 1; }
  ok(hatched > 0 && egg.hp === 3 && egg.stage === 1 && g.hazards.includes(egg),
    '第二发打碎卵：原地孵化为幼虫（stage1 hp=larvaHp3，对象不消失）',
    'stage=' + egg.stage + ' hp=' + egg.hp + ' inHaz=' + g.hazards.includes(egg));
}

/* ==================== T3 法师取消连击收益 + 命中回蓝 ==================== */
console.log('[T3] 法师命中敌人：无连击、无暴击、回蓝 +4');
{
  const g = fresh('mage');
  const e = sb._engMkEnemy('slime', 298, 180, false);
  e.x = 300; e.y = 184; e.vx = 0; e.vy = 0; e._x = 300; e._y = 184;
  e.hp = 99;                                      // 打不死，纯命中
  g.level.enemies.push(e);
  g.mana = 50;                                    // 留观测空间
  g.combo = 0;
  atk(g);
  let hurt = -1;
  for (let f = 0; f < 90 && hurt < 0; f++) { stepHold(g, 1); if (e.hp < 99) hurt = f + 1; }
  ok(hurt > 0, '弹体命中敌人', 'hp=' + e.hp);
  ok(g.combo === 0, '命中敌人不涨连击', 'combo=' + g.combo);
  ok(g.mana > 54 && g.mana < 54.7, '命中回蓝 +4（v20.9：5→4；54+飞行期自然回蓝≈0.4）', 'mana=' + g.mana.toFixed(2));
  const s = g.shots[0];
  ok(!s || !s.crit, '出膛弹 crit=0（永不暴击）', s && s.crit);
}

/* ==================== T4 蛛网不可打掉（v22：弹体 + 近战都穿网） ==================== */
console.log('[T4] 茧网不可打掉（用户：茧网不应该被打掉）');
{
  // ① 法师弹体穿网：网不掉血、不消失（弹体也不因撞网而停——白名单直接跳过）
  const g = fresh('mage');
  const web = makeWeb(g, 260, 180);
  atk(g); fireAndWait(g);
  let hit = -1;
  for (let f = 0; f < 90 && hit < 0; f++) { stepHold(g, 1); if (web.hp !== undefined) hit = f + 1; }
  ok(hit < 0 && web.hp === undefined, '弹体不与网结算（hp 保持 undefined）', 'hp=' + web.hp);
  ok(g.hazards.includes(web), '网仍在场（没有被打掉）');
  // ② 骑士近战穿网：两刀下去网不动
  const g2 = fresh('knight');
  const web2 = makeWeb(g2, 262, 180);
  atk(g2); stepHold(g2, 20);
  g2.player.atkCd = 0; g2.player.atkT = 0; g2.player.atkSeq++;
  atk(g2); stepHold(g2, 30);
  ok(web2.hp === undefined && g2.hazards.includes(web2), '近战两刀不破网（hp 仍 undefined、网在场）',
    'hp=' + web2.hp + ' in=' + g2.hazards.includes(web2));
  // ③ 网的机制照旧：减速 + 禁跳（只是不可拆）
  const g3 = fresh('knight');
  const web3 = makeWeb(g3, 240, 170);
  const p3 = g3.player;
  p3.x = web3.x + web3.w / 2 - 5; p3.y = web3.y + web3.h - p3.h;
  for (let f = 0; f < 3; f++) stepHold(g3, 1);
  ok(p3.mistSlow > 0 && p3.mistSlow < 1, '网内减速照旧', p3.mistSlow);
  ok(p3.webNoJump > 0, '网内禁跳照旧');
}

/* ==================== T5 陨星大招砸得到虫卵 ==================== */
console.log('[T5] 法师 O 陨星对 hazards 结算');
{
  const g = fresh('mage');
  const egg = makeEgg(g, 276, 176);
  const m = { x: 270, y: 168, w: 24, h: 24, dmg: 2 };
  sb._engMageMeteorHit(g.level, m);
  ok(egg.hp <= 0, '陨星砸卵：dmg2 一发入碎（hp=' + egg.hp + '）');
  ok(g.combo === 0, '陨星命中不涨连击', 'combo=' + g.combo);
  // v22：陨星对无 hp 的茧网不结算（网不可打掉）
  g.hazards.length = 0;
  const web = makeWeb(g, 260, 180);
  const hitWeb = sb._engMageMeteorHit(g.level, m);
  ok(hitWeb === false && web.hp === undefined && g.hazards.includes(web),
    '陨星对茧网不结算（返回 false=没砸中可打目标）', 'ret=' + hitWeb);
}

/* ==================== T6 法师弹体打不到的东西只剩「真地形」 ==================== */
console.log('[T6] hazards 白名单完整性（静态走查）');
{
  const src = read('engine.js').replace(/\n/g, ' ').replace(/\s+/g, ' ');
  ok(src.indexOf("hz.kind !== 'egg'") >= 0 && src.indexOf("hz.kind !== 'totem'") >= 0
     && src.indexOf("(hz.kind === 'web' && hz.hp !== undefined)") >= 0,
    'shots hazards 白名单：egg/totem + web 仅限带 hp 的旧网（v22 无 hp 网穿透）');
  ok(src.indexOf("(hz2.kind === 'web' && hz2.hp !== undefined)") >= 0,
    '近战 hazards 白名单同样按 web.hp 守卫（v22 防回退）');
}

console.log('\n=== v20.9 交互审计: %d PASS / %d FAIL ===', pass, fail);
console.log('（实际输出）=== v20.9 交互审计: ' + pass + ' PASS / ' + fail + ' FAIL ===');
process.exit(fail ? 1 : 0);
