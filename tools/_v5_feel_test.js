// ============================================================
// _v5_feel_test.js —— v5 手感队自测（工单 docs/workorders/v5-wave1-feel.md §N）
// node 直跑；桩环境同 tools/gate.js engine 模式（THEMES 七主题空对象桩，
// levels.js+engine.js 串接进同一 Function 作用域，顶层零 DOM/音频/键盘）。
// 断言 a~h 全部真实执行，结果打印到 stdout；任一失败退出码 1。
// 边沿帧用 dt=1/600 细步进（物理 dt 感知，保证 vy 断言精度，工单 §N.a 的
// vy<-290 / §N.b 的 vy<-500 阈值按"起跳当帧 vy≈-303.6/-520"口径校验）。
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const levelsSrc = fs.readFileSync(path.join(ROOT, 'levels.js'), 'utf8');
const engineSrc = fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8');
const themes = {};
['grass', 'cave', 'sky', 'factory', 'lava', 'tower', 'boss'].forEach(k => { themes[k] = {}; });
// 内部辅助（_engAddParts/_engFloat/_engFx）仅用于 §N.g 容量红线灌压测试
const glue = '\n;return {PHY,Level,game,loadLevel,respawn,killPlayer,levelClear,updateWorld,LEVELS,'
  + '_engAddParts:_engAddParts,_engFloat:_engFloat,_engFx:_engFx};';
const api = new Function('THEMES', levelsSrc + '\n' + engineSrc + glue)(themes);

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('  ok  ' + msg); }
  else { fail++; console.error('  FAIL ' + msg); }
}
function step(n, dt) { for (let i = 0; i < n; i++) api.updateWorld(dt || 1 / 60); }
function clearInput() {
  const i = api.game.input;
  i.left = 0; i.right = 0; i.jump = 0; i.jumpHit = 0; i.attack = 0; i.attackHit = 0;
  i.dash = 0; i.dashHit = 0; i.skillUHit = 0; i.skillIHit = 0; i.skillOHit = 0;
}
function loadIdle(idx) { // 载入关卡并空转站稳
  api.loadLevel(idx, false);
  api.game.state = 'play';
  clearInput();
  step(5);
}
function firstSlime() {
  return api.game.level.enemies.find(e => e.type === 'slime' && !(e.dead > 0));
}
// 星陨瞄准圈落点复算（与 engine _engGroundY 同口径，用于 §N.e 交叉验证）
function expectGroundY(tx, yFrom) {
  const L = api.game.level, col = Math.floor(tx / 16);
  for (let ty = Math.max(0, Math.floor(yFrom / 16)); ty < L.h; ty++)
    if (L.solid(col, ty, api.game.switchState)) return ty * 16;
  return (L.h - 1) * 16;
}

console.log('== §N.a 二段跳：边沿消费/系数 0.92/落地重置 ==');
loadIdle(0);
api.game.input.jump = 1; api.game.input.jumpHit = 1;
step(1, 1 / 600); clearInput(); // 地面跳（细步进：vy=-330+1500/600）
ok(!api.game.player.onGround && api.game.player.vy < -100,
  'a1 地面跳离地 vy=' + api.game.player.vy.toFixed(1));
api.game.input.jumpHit = 1;
step(1, 1 / 600); clearInput(); // 空中二段跳（vy=-330*0.92+1500/600）
ok(api.game.player.airJumps === 0, 'a2 airJumps===0（边沿直接消费）');
ok(api.game.player.vy < -290, 'a3 二段跳 vy=' + api.game.player.vy.toFixed(1) + ' < -290（0.92×330=303.6）');
step(180);
ok(api.game.player.onGround && api.game.player.airJumps === 1, 'a4 落地后 airJumps===1');

console.log('== §N.b 弹簧锁：弹跳全程禁二段跳/落地解锁 ==');
loadIdle(0);
const sp = api.game.level.springs[0]; // L1 弹簧①=工单所指 (33,H-2)
api.game.player.x = sp.x + 2; api.game.player.y = sp.y - 14 - 30; api.game.player.vy = 0;
let guard = 0;
while (!(api.game.player.vy < -500) && guard++ < 90) step(1);
ok(api.game.player.vy < -500 && api.game.player.springAir === true,
  'b1 弹簧触发 vy=' + api.game.player.vy.toFixed(1) + ' springAir=true');
api.game.input.jumpHit = 1;
step(1, 1 / 600); clearInput();
ok(api.game.player.airJumps === 1, 'b2 弹簧锁定：jumpHit 未消耗二段跳（airJumps 仍 1）');
ok(api.game.player.vy < -500, 'b3 vy=' + api.game.player.vy.toFixed(1) + ' 仍 < -500（弹簧不受影响）');
api.game.input.right = 1; step(120); api.game.input.right = 0; // 漂离弹簧落上高空平台
ok(api.game.player.onGround && api.game.player.springAir === false, 'b4 落地解锁 springAir=false');

console.log('== §N.c 暴击与击退：hp/kb/flashT/一击毙 ==');
loadIdle(0);
const sc = firstSlime();
sc.x = api.game.player.x + 14; sc.y = api.game.player.y + 4; sc.vx = 0; sc.vy = 0;
api.game.input.attackHit = 1; step(1); clearInput(); step(15);
ok(sc.hp === 1, 'c1 第一击后 hp===1（史莱姆 hp2 - 普通伤 1）');
ok(sc.kb !== 0, 'c2 击退 kb=' + sc.kb.toFixed(0) + ' !==0');
ok(sc.flashT > 0, 'c3 白闪 flashT=' + sc.flashT.toFixed(2) + ' >0');
api.game.combo = 3; // 本击使 combo+1=4 → 暴击 ×2
step(25); // 攻击冷却走完（0.35s=21 帧；首击后仍有余量）
ok(api.game.player.atkCd <= 0, 'c4p 攻击冷却恢复 atkCd=' + api.game.player.atkCd.toFixed(2));
sc.x = api.game.player.x + 14; sc.y = api.game.player.y + 4; sc.vx = 0; sc.vy = 0;
api.game.input.attackHit = 1; step(1); clearInput(); step(15);
ok(sc.dead > 0, 'c4 combo=3 时再命中暴击一击毙（dead=' + sc.dead + '）');

console.log('== §N.d O 流星连斩：状态机时轴/冻结/结算/复位 ==');
loadIdle(0);
api.game.combo = 8; api.game.skills.o = 0;
api.game.input.skillOHit = 1; step(1); clearInput();
ok(api.game.ult.on === true, 'd1 skillOHit → ult.on===true');
const t0 = api.game.time;
step(30); // 距施放共 31 帧，u.t≈0.50 < 0.55 仍冻结
ok(api.game.time === t0, 'd2 冻结期 game.time 不增（t=' + (api.game.ult.t).toFixed(2) + 's）');
step(10); // 共 41 帧，u.t≈0.67
ok(api.game.ult.fired === true, 'd3 t≥0.55 结算 fired===true');
ok(api.game.time > t0, 'd4 结算后解冻 time 恢复推进');
ok(api.game.level.enemies.some(e => e.dead > 0), 'd5 屏内普通敌被清算 dead>0');
step(34); // 共 75 帧，u.t≈1.23 ≥ 1.2
ok(api.game.ult.on === false, 'd6 t≥1.2 ult 复位 on===false');

console.log('== §N.e U 星陨：三流星 delay 0.50/0.75/1.00 + ring=地面 y ==');
loadIdle(0);
api.game.skills.u = 0;
api.game.input.skillUHit = 1; step(1); clearInput();
const ms = api.game.meteors;
ok(ms.length === 3, 'e1 三流星');
ok(ms[0].delay === 0.50 && ms[1].delay === 0.75 && ms[2].delay === 1.00,
  'e2 delay=' + ms.map(m => m.delay).join('/'));
const tx = ms[0].x + 24, gy = expectGroundY(tx, api.game.player.y);
ok(ms.every(m => m.ring === gy), 'e3 ring 全部=地面 y=' + gy + '（tx=' + tx + ' 列实心行顶）');

console.log('== §N.f I 护盾：吸收 2 次 → 破盾事件 ==');
loadIdle(0);
api.game.skills.i = 0;
api.game.input.skillIHit = 1; step(1); clearInput();
ok(api.game.player.shieldT > 0 && api.game.player.shieldHp === 2, 'f1 施放 shieldT>0 shieldHp===2');
const sf = firstSlime();
sf.x = api.game.player.x - 2; sf.y = api.game.player.y + 6; sf.vx = 0; sf.vy = 0;
step(1); // 接触①：吸收（不获得无敌帧）
ok(api.game.player.shieldHp === 1, 'f2 第一次接触吸收 shieldHp===1');
sf.x = api.game.player.x - 2; sf.y = api.game.player.y + 6; sf.vx = 0; sf.vy = 0;
step(1); // 接触②：耗尽 → 破盾
ok(api.game.player.shieldT === 0 && api.game.player.shieldHp === 0, 'f3 破盾 shieldT===0');
ok(api.game.sfxQueue.indexOf('shieldhit') >= 0 && api.game.sfxQueue.indexOf('shieldbreak') >= 0,
  'f4 sfxQueue 含 shieldhit+shieldbreak');
ok(api.game.player.hp === 5, 'f5 两次吸收均未掉血 hp===5');

console.log('== §N.g 容量红线：30 次攻击命中 + 两次 O 后 parts/fxParts/floats 上限 ==');
loadIdle(0);
const slimes = api.game.level.enemies.filter(e => e.type === 'slime');
const target = slimes[0];
for (let i = 1; i < slimes.length; i++) slimes[i].dead = 99; // 其余史莱姆停摆远离（防干扰）
for (let i = 0; i < 30; i++) {
  const hp0 = (i % 2) ? 1 : 2; // 交替存活分支/击杀分支（击杀分支推 12 粒 parts 压容量）
  target.dead = 0; target.hp = hp0; target.kb = 0; target.dvx = 0; target.dvy = 0;
  target.x = api.game.player.x + 14; target.y = api.game.player.y + 4;
  target.vx = 0; target.vy = 0;
  api.game.input.attackHit = 1; step(1); clearInput();
  let w = 0;
  while (w++ < 40 && target.hp === hp0 && !(target.dead > 0)) step(1); // 等命中
  step(30); // 攻击冷却恢复（含 hit-stop 冻结帧）
}
for (let i = 0; i < 2; i++) { // 连放两次 O（CD 手动清零，白盒）
  api.game.combo = 8; api.game.skills.o = 0;
  api.game.input.skillOHit = 1; step(1); clearInput();
  step(80); // 越过 1.2s 演出全程
}
ok(api.game.parts.length <= 240, 'g1 parts=' + api.game.parts.length + ' ≤240');
ok(api.game.fxParts.length <= 60, 'g2 fxParts=' + api.game.fxParts.length + ' ≤60');
ok(api.game.floats.length <= 40, 'g3 floats=' + api.game.floats.length + ' ≤40');
for (let i = 0; i < 300; i++) api._engAddParts(50, 50, 1, '#ffffff', 10, 0); // 灌压超越上限
for (let i = 0; i < 80; i++) api._engFx(50, 50, { life: 9 });
for (let i = 0; i < 60; i++) api._engFloat(50, 50, 'X', '#ffffff', 0);
ok(api.game.parts.length === 240, 'g4 灌压后 parts=' + api.game.parts.length + '（守卫钳在 240）');
ok(api.game.fxParts.length === 60, 'g5 灌压后 fxParts=' + api.game.fxParts.length + '（守卫钳在 60）');
ok(api.game.floats.length === 40, 'g6 灌压后 floats=' + api.game.floats.length + '（shift 钳在 40）');

console.log('== §N.h 空转零副作用：七旧关 120 帧空转+60 帧右移跳，portals/pends 恒空 ==');
for (let i = 0; i < api.LEVELS.length; i++) {
  loadIdle(i);
  step(120);
  api.game.input.right = 1; api.game.input.jump = 1; api.game.input.jumpHit = 1;
  step(60);
  clearInput();
  ok(Array.isArray(api.game.level.portals) && api.game.level.portals.length === 0
     && Array.isArray(api.game.level.pends) && api.game.level.pends.length === 0,
    'h L' + (i + 1) + ' 空转无异常 portals=[] pends=[]');
}

console.log('-----------------------------------------');
console.log('v5 feel 自测: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
