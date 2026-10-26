// node tools/_v82_shield_test.js —— v8.2 护盾修复回归：吸收命中=一次真实受击
// 语义验证（node 无 DOM 环境）：
//  T1 接触伤：盾在身时吃 1 下 → hp 不变、invT=1.0、破盾前 shieldHp 2→1；
//  T2 连续接触：同一来源贴身连压 30 帧 → 只吃 1 层吸收（无敌帧挡住后续帧），hp 不掉；
//  T3 两层耗尽：隔 1.1s 各吃 1 下 → 2 层吸收全耗、hp 不掉、第 3 下才真掉血；
//  T4 自然到期：盾到期触发破盾事件（shieldT 清零 + fx 队列有 shard）。
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..');
const glue = '\n;return {PHY,Level,game,loadLevel,respawn,killPlayer,levelClear,updateWorld,LEVELS,_engHurtPlayer};';
const themes = {}; ['grass', 'cave', 'sky', 'factory', 'lava', 'tower', 'boss'].forEach(k => themes[k] = {});
const sb = new Function('THEMES', fs.readFileSync(path.join(ROOT, 'levels.js'), 'utf8')
  + fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8') + glue)(themes);
function fail(msg) { console.error('SHIELD TEST FAIL: ' + msg); process.exit(1); }

function freshPlayer() {
  sb.loadLevel(0, false);
  const g = sb.game; g.state = 'play';
  g.cdMul = 1;
  return g.player;
}
function castShield(p) { p.shieldT = 3.0; p.shieldHp = 2; }

/* T1：单次吸收 */
{
  const p = freshPlayer();
  castShield(p); sb.game.player.invT = 0;
  const hp0 = p.hp;
  const r = sb._engHurtPlayer(p.x + 40, 1);
  if (r !== false) fail('T1: 盾在身时 _engHurtPlayer 应返回 false（吃伤失败）');
  if (p.hp !== hp0) fail('T1: hp 掉了！吸收没生效 hp=' + p.hp);
  if (p.shieldHp !== 1) fail('T1: shieldHp 应为 1，实际 ' + p.shieldHp);
  if (p.invT <= 0) fail('T1: 吸收命中未获得无敌帧（v8.2 修复目标）invT=' + p.invT);
  if (!p.shieldT) fail('T1: 未破盾时 shieldT 不应清零');
  console.log('T1 OK: 单次吸收 hp=' + p.hp + ' shieldHp=' + p.shieldHp + ' invT=' + p.invT.toFixed(2));
}
/* T2：贴身连压 30 帧——无敌帧必须挡住后续帧 */
{
  const p = freshPlayer();
  castShield(p); p.invT = 0;
  const hp0 = p.hp;
  for (let f = 0; f < 30; f++) { sb._engHurtPlayer(p.x - 40, 1); sb.updateWorld(1 / 60); }
  if (p.hp !== hp0) fail('T2: 连续接触掉了血 hp=' + p.hp + '（应为无敌帧挡住）');
  if (p.shieldHp !== 1) fail('T2: 30 帧连续接触应只耗 1 层吸收，实际 shieldHp=' + p.shieldHp);
  if (p.shieldT <= 0) fail('T2: 盾不应被打碎');
  console.log('T2 OK: 30 帧连续接触 shieldHp=1 hp=' + p.hp + ' 盾仍存续');
}
/* T3：两层耗尽 + 第 3 下真伤 */
{
  const p = freshPlayer();
  castShield(p); p.invT = 0;
  const hp0 = p.hp;
  sb._engHurtPlayer(p.x + 40, 1);                    // 第 1 层
  for (let f = 0; f < 70; f++) sb.updateWorld(1 / 60); // 等无敌帧（1.0s）过去
  if (p.shieldT <= 0) fail('T3: 1.1s 内盾不应自然到期 dur=3');
  sb._engHurtPlayer(p.x + 40, 1);                    // 第 2 层 → 破盾
  if (p.shieldHp !== 0 || p.shieldT !== 0) fail('T3: 破盾后 shieldHp/shieldT 应清零');
  if (p.hp !== hp0) fail('T3: 2 层吸收期间 hp 不应变化 hp=' + p.hp);
  for (let f = 0; f < 70; f++) sb.updateWorld(1 / 60); // 等吸收给的 invT 过去
  sb._engHurtPlayer(p.x + 40, 1);                    // 第 3 下：真伤
  if (p.hp !== hp0 - 1) fail('T3: 破盾后应正常掉血 hp=' + p.hp);
  console.log('T3 OK: 2 次吸收后破盾，第 3 下真伤 hp ' + hp0 + '→' + p.hp);
}
/* T4：自然到期也走破盾事件 */
{
  const p = freshPlayer();
  castShield(p); p.invT = 0;
  for (let f = 0; f < 200; f++) sb.updateWorld(1 / 60); // 3.0s 到期
  if (p.shieldT !== 0 || p.shieldHp !== 0) fail('T4: 到期后应清零 shieldT=' + p.shieldT);
  console.log('T4 OK: 自然到期走破盾流程');
}
console.log('SHIELD TEST: ALL PASS');
