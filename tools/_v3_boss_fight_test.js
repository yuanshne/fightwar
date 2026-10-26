// node tools/_v3_boss_fight_test.js —— 引擎工单 F.4/F.5：Boss 战冒烟 + 技能冒烟（node 无 DOM 环境）
// F.4：载入 L7 → 玩家传送进激活半径 → 1800 帧混合输入（每 21 帧攻击 + 每 120 帧右移 60 帧）
//      断言：全程无异常、boss.state 至少经历 'idle','windup'、boss.hp<60、无 NaN。
// F.5：重载 L7 激活 Boss 后——U 星陨（断言 meteors 出现且 Boss hp 下降）、
//      O 流星连斩（注入 combo=8，断言 flashT>0、bullets 清空、combo 消耗、CD 置位）。
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..');
const glue = '\n;return {PHY,Level,game,loadLevel,respawn,killPlayer,levelClear,updateWorld,LEVELS};';
const themes = {}; ['grass', 'cave', 'sky', 'factory', 'lava', 'tower', 'boss'].forEach(k => themes[k] = {});
const sb = new Function('THEMES', fs.readFileSync(path.join(ROOT, 'levels.js'), 'utf8')
  + fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8') + glue)(themes);
function fail(msg) { console.error('FIGHT TEST FAIL: ' + msg); process.exit(1); }

/* ---------------- F.4 Boss 战冒烟 ---------------- */
sb.loadLevel(6, false);
let g = sb.game;
g.state = 'play';
g.player.x = g.boss.x - 140; // 进入激活半径 176px（Boss 中心 840，玩家中心 ≈ 840-135）
const seen = new Set();
let nanHit = false, bossHurt = false;   // v12：死亡复活会把段回满，必须逐帧记录「掉过血」
for (let f = 0; f < 1800; f++) {
  if (f % 21 === 0) g.input.attackHit = 1;
  g.input.right = (f % 120 < 60) ? 1 : 0;
  sb.updateWorld(1 / 60);
  seen.add(g.boss.state);
  if (g.boss.hpTotal < g.boss.maxHp) bossHurt = true;
  if (!Number.isFinite(g.player.x) || !Number.isFinite(g.player.y) || !Number.isFinite(g.player.hp) ||
      !Number.isFinite(g.boss.x) || !Number.isFinite(g.boss.y) || !Number.isFinite(g.boss.hp)) { nanHit = true; break; }
}
g.input.right = 0; g.input.attackHit = 0;
console.log('F.4: states=[' + Array.from(seen).join(',') + '] boss.hp=' + g.boss.hp +
  ' phase=' + g.boss.phase + ' deaths=' + g.deaths + ' game.state=' + g.state);
if (nanHit) fail('出现 NaN');
if (!seen.has('idle')) fail('boss.state 未经历 idle');
if (!seen.has('windup')) fail('boss.state 未经历 windup');
if (!bossHurt) fail('整场 1800 帧内 Boss 一次血都没掉（hpTotal 恒 = ' + g.boss.maxHp + '）');
if (g.deaths < 0) fail('deaths 异常');

/* ---------------- F.5 技能冒烟 ---------------- */
sb.loadLevel(6, false); // 重载：Boss 回满血 dormant
g = sb.game;
g.state = 'play';
g.player.x = g.boss.x - 140;
let activated = false;
for (let f = 0; f < 300 && !activated; f++) { // 等 intro（1.8s）结束进入可受击态
  sb.updateWorld(1 / 60);
  if (g.boss.state !== 'dormant' && g.boss.state !== 'intro') activated = true;
}
if (!activated) fail('Boss 未激活（300 帧内仍 dormant/intro）');
const hpBefore = g.boss.hp;
let sawMeteor = false, uOk = false;
for (let f = 0; f < 900 && !uOk; f++) { // 星陨：周期重给边沿（死亡/CD 期间重试），直到命中 Boss
  if (f % 30 === 0 && g.skills.u <= 0) g.input.skillUHit = 1;
  sb.updateWorld(1 / 60);
  if (g.meteors.length > 0) sawMeteor = true;
  if (sawMeteor && g.boss.hp < hpBefore) uOk = true;
}
console.log('F.5-U: meteors 出现=' + sawMeteor + ' boss.hp ' + hpBefore + '->' + g.boss.hp +
  ' drops=' + g.drops.length);
if (!sawMeteor) fail('流星未出现（game.meteors 恒空）');
if (!(g.boss.hp < hpBefore)) fail('星陨未命中 Boss（hp 未下降）');

/* O 流星连斩：注入连击 8 → 白屏 + 清弹 + 消耗连击 */
let sawFlash = false, bulletsCleared = false;
for (let f = 0; f < 600 && !sawFlash; f++) {
  if (g.ultCharge < 100) g.ultCharge = 100; // v7.1：O 已改能量制（combo≥8 的门槛废除）
  if (g.skills.o <= 0) g.input.skillOHit = 1;
  sb.updateWorld(1 / 60);
  if (g.flashT > 0) { sawFlash = true; bulletsCleared = (g.bullets.length === 0); }
}
console.log('F.5-O: flashT>0=' + sawFlash + ' bullets清空=' + bulletsCleared +
  ' ultCharge=' + g.ultCharge + ' skills.o=' + g.skills.o.toFixed(1));
if (!sawFlash) fail('连斩白屏未出现（game.flashT 恒 0）');
if (!bulletsCleared) fail('连斩未清空弹幕');
// 能量消耗不能用终值断言：连斩本身每命中一次就回 10 点，放完立刻又被自己打满；CD 置位才是释放证据
if (g.skills.o <= 0) fail('O CD 未置位');

/* I 护盾冒烟（补充）：护盾期 Boss 接触不掉血 */
let shieldUp = false;
for (let f = 0; f < 300 && !shieldUp; f++) { // 玩家死亡/边沿被清时重试，直到护盾生效
  if (g.player.shieldT <= 0) g.input.skillIHit = 1;
  sb.updateWorld(1 / 60);
  shieldUp = !g.player.dead && g.player.shieldT > 0;
}
if (!shieldUp) fail('护盾未置位（p.shieldT≤0）');
const hpAtShield = g.player.hp;
for (let f = 0; f < 90; f++) sb.updateWorld(1 / 60); // 1.5s 内 Boss 大概率接触玩家（护盾 3s 内）
console.log('F.5-I: hp ' + hpAtShield + '->' + g.player.hp + '（护盾期接触）');
if (g.player.hp < hpAtShield) fail('护盾期内玩家掉血（护盾未免伤）');

console.log('_v3_boss_fight_test OK: F.4+F.5 全部通过');
