// node tools/_v205_sword_fail_test.js —— v20.5 引擎验收（node，无依赖）
// 两件事：① 勇者普攻改「剑」（BAL.atk.boxW 18→32，攻击距离=剑的范围，实证：28px 外的敌人
//          旧框 18+2=20px 够不到、新框 32+2=34px 够得到）；② 死亡三振——本关阵亡 3 次判负
//          （state='fail'，不再 respawn），且防卡关兜底（relaxed）提前到第 2 次阵亡触发。
// 加载方式与 _v19_mage_test.js 同构：levels.js + chapter2.js + chapter3.js + engine.js，THEMES 空桩。
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const themes = {};
['grass', 'cave', 'sky', 'factory', 'lava', 'tower', 'boss', 'wind', 'castle', 'star', 'sea', 'nether']
  .forEach(k => themes[k] = {});

const glue = '\n;return {PHY,Level,game,loadLevel,respawn,killPlayer,failLevel,updateWorld,BAL,HEROES,'
  + 'aggregateLevels,getLevels:()=>ALL_LEVELS,_engMkEnemy};';
const sb = new Function('THEMES',
  read('levels.js') + read('chapter2.js') + read('chapter3.js') + read('engine.js') + glue)(themes);
const G = sb.game;

let pass = 0, fail = 0;
function ok(cond, msg, extra) {
  if (cond) { pass++; console.log('  PASS ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? '   [' + extra + ']' : '')); }
}

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
function putEnemy(g, type, x, y, hp) {
  const e = sb._engMkEnemy(type, x - 2, y + 2, false);
  e.x = x; e.y = y; e.vx = 0; e.vy = 0; e._x = x; e._y = y;
  if (hp !== undefined) e.hp = hp;
  g.level.enemies.push(e);
  return e;
}
function pinE(e) { return () => { e.x = e._x; e.y = e._y; e.vx = 0; e.vy = 0; }; }
function stepHold(g, n, extra) {
  const p = g.player, x = p.x, y = p.y;
  for (let f = 0; f < n; f++) {
    if (!p.dead) { p.x = x; p.y = y; p.vx = 0; p.vy = 0; }
    if (extra) extra(f);
    sb.updateWorld(1 / 60);
  }
}
function stepFree(g, n) { for (let f = 0; f < n; f++) sb.updateWorld(1 / 60); }

/* ==================== T1 剑范围 ==================== */
console.log('[T1] 勇者普攻改剑：BAL.atk.boxW=32，攻击距离=剑的范围');
{
  ok(sb.BAL.atk.boxW === 32 && sb.BAL.atk.boxH === 14, 'BAL.atk = 32×14（v20.5：18→32）',
    JSON.stringify(sb.BAL.atk));
  const g = fresh('knight');
  // 敌人钉在玩家前方 28px：旧框（身前 18+2=20px）永远够不到，新框（32+2=34px）第一刀就该中
  const e = putEnemy(g, 'slime', 240 + 28, 178, 10);
  g.player.invT = 9e9;
  g.input.attackHit = 1;
  let hitF = -1;
  for (let f = 0; f < 60 && hitF < 0; f++) {
    stepHold(g, 1, pinE(e));
    if (e.hp < 10) hitF = f + 1;
  }
  ok(hitF > 0, '28px 外的敌人被剑命中（第 ' + hitF + ' 帧，hp 10→' + e.hp + '）——旧 18px 框不可能够到', hitF);
  ok(e.hp === 8, '剑伤害 = 2（atkBase，无装备）', e.hp);
}

/* ==================== T2 死亡三振 ==================== */
console.log('[T2] 死亡三振：阵亡 3 次 → state=fail，不再 respawn');
{
  const g = fresh('knight');
  ok(g.deaths === 0 && g.state === 'play', '初始 deaths=0 / state=play');
  // 第 1 次死亡 → 正常 respawn
  sb.killPlayer(); stepFree(g, 60);
  ok(g.deaths === 1 && !g.player.dead && g.state === 'play', '第 1 次死亡：正常复活（deaths=1）',
    g.deaths + '/' + g.state);
  // 第 2 次死亡 → 正常 respawn
  sb.killPlayer(); stepFree(g, 60);
  ok(g.deaths === 2 && !g.player.dead && g.state === 'play', '第 2 次死亡：正常复活（deaths=2）',
    g.deaths + '/' + g.state);
  // 第 3 次死亡 → 判负
  sb.killPlayer(); stepFree(g, 60);
  ok(g.deaths === 3, '第 3 次死亡：deaths=3', g.deaths);
  ok(g.state === 'fail', 'state=fail（判负）', g.state);
  ok(g.player.dead === true, '判负后不再 respawn（p.dead 保持 true）', g.player.dead);
  // 判负后世界再推进也不翻转（engine 侧自洽；ui 侧由 uiState!=‘play’ 冻结世界）
  stepFree(g, 60);
  ok(g.state === 'fail' && g.player.dead === true, '失败后再推进 1s：state 仍 fail、仍不复活',
    g.state + '/' + g.player.dead);
}

/* ==================== T3 relaxed 兜底提前（第 2 次阵亡触发） ==================== */
console.log('[T3] 防卡关兜底提前：第 2 次阵亡即松绑（三振制下死满 5 次不可达）');
{
  const g = fresh('knight');
  ok(!!g.seal, '本关有封印状态（seal 存在）');
  ok(g.seal && !g.seal.relaxed, '初始 relaxed=false', g.seal && g.seal.relaxed);
  sb.killPlayer(); stepFree(g, 60);
  ok(g.seal && !g.seal.relaxed, '第 1 次阵亡：不松绑', g.seal && g.seal.relaxed);
  sb.killPlayer(); stepFree(g, 60);
  ok(g.seal && g.seal.relaxed === true, '第 2 次阵亡：relaxed=true（封印门槛各降 20%）',
    g.seal && g.seal.relaxed);
}

console.log('\n=== v20.5 引擎验收: ' + pass + ' PASS / ' + fail + ' FAIL ===');
process.exit(fail ? 1 : 0);
