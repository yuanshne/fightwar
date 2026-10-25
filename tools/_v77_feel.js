// v7.7 手感量化探针：对照空洞骑士逐项实测「动作连贯度」8 指标（改动前/后各跑一次即可做对照表）。
// 沙箱手法照抄 tools/gate.js 的 engine 模式（new Function('THEMES', src+glue)），
// 关卡用一个合成平地关（w80×h24，第 22 行整行实心）——保证 8 项指标只反映引擎物理，不掺地形。
// 用法：
//   node tools/_v77_feel.js                 直接打印 8 指标 + metaBonus 三处生效点
//   node tools/_v77_feel.js --save base.json 追加写出 JSON（供改动后对比）
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const THEME_KEYS = ['grass', 'cave', 'sky', 'factory', 'lava', 'tower', 'boss', 'wind', 'castle', 'star', 'sea', 'nether'];
const DT = 1 / 60;
// A/B 对照用：V77_ENGINE=<旧 engine 副本路径> 可把探针指向改动前的引擎（默认读仓库内的 engine.js）
const ENGINE = process.env.V77_ENGINE || 'engine.js';

function buildSandbox() {
  const themes = {};
  THEME_KEYS.forEach(k => { themes[k] = {}; });
  let body = read('levels.js');
  for (const f of ['chapter2.js', 'chapter3.js']) if (fs.existsSync(path.join(ROOT, f))) body += '\n' + read(f);
  const hasContract = /const CHAPTERS/.test(body);
  if (hasContract) body += '\n;aggregateLevels();';
  else body += '\n;var ALL_LEVELS = LEVELS;';
  body += '\n' + (ENGINE === 'engine.js' ? read('engine.js') : fs.readFileSync(ENGINE, 'utf8'))
    + '\n;return {Level,ALL_LEVELS,game,loadLevel,updateWorld,PHY,BAL};';
  return new Function('THEMES', body)(themes);
}

const sb = buildSandbox();
const g = sb.game;
const PHY = sb.PHY, BAL = sb.BAL;
// 合成平地关：第 22 行起实心，出生点 (4,21) 脚底正好贴 (4,22) 顶面
sb.ALL_LEVELS.push({ name: '_v77_flat', theme: 'grass', par: 9, w: 80, h: 24,
  build(lg) { lg.ground(0, 79, 22, 23); lg.set(4, 21, '@'); return lg; } });
const LV = sb.ALL_LEVELS.length - 1;
const inp = g.input;
let p = null;

function clearInput() {
  inp.left = 0; inp.right = 0; inp.jump = 0; inp.jumpHit = 0;
  inp.attack = 0; inp.attackHit = 0; inp.dash = 0; inp.dashHit = 0; inp.down = 0;
  inp.skillUHit = 0; inp.skillIHit = 0; inp.skillOHit = 0; inp.skillLHit = 0;
}
function step() { sb.updateWorld(DT); g.tick++; }
function reset() {
  sb.loadLevel(LV, false);
  g.state = 'play'; g.paused = false; g.puzzleActive = false; g.bagActive = false;
  const L = g.level;
  L.enemies.length = 0; L.saws.length = 0; L.cannons.length = 0; L.pends.length = 0;
  L.chests.length = 0; L.springs.length = 0;
  g.bullets.length = 0; g.boss = null;
  p = g.player;
  p._realMaxHp = p.maxHp;                 // metaBonus 断言用（下面把血抬到 99 防尖刺）
  p.hp = 99; p.maxHp = 99; p.invT = 0;
  clearInput();
  for (let f = 0; f < 12; f++) step(); // 静置 12 帧：落到地面并清掉残余速度
  return p;
}

/* ---------- 1/2 跳跃高度 ---------- */
function jumpHeight(holdFrames) {
  reset();
  const y0 = p.y; let minY = y0;
  for (let f = 0; f < 100; f++) {
    inp.jump = f < holdFrames ? 1 : 0;
    inp.jumpHit = f === 0 ? 1 : 0;
    step();
    if (p.y < minY) minY = p.y;
  }
  return +(y0 - minY).toFixed(2);
}

/* ---------- 3 满速跑 1 秒水平位移 ---------- */
function run1s() {
  reset();
  const x0 = p.x;
  inp.right = 1;
  for (let f = 0; f < 60; f++) step();
  return +(p.x - x0).toFixed(2);
}

/* ---------- 4 冲刺距离（按下 → dashT 归零的总位移） ---------- */
function dashDist() {
  reset();
  const x0 = p.x;
  inp.right = 1; inp.dash = 1; inp.dashHit = 1;
  let frames = 0;
  for (let f = 0; f < 60; f++) {
    if (f > 0) inp.dashHit = 0;
    step(); frames++;
    if (f > 0 && p.dashT <= 0) break;
  }
  return { dist: +(p.x - x0).toFixed(2), frames };
}

/* ---------- 5 冲刺冷却（按下 → 第二次冲刺真正起手的帧数） ---------- */
function dashCdFrames() {
  reset();
  inp.dash = 1; inp.dashHit = 1; inp.right = 1;
  let started = 0, second = -1;
  for (let f = 0; f < 120; f++) {
    if (f > 0) inp.dashHit = 1;          // 之后每帧都按：第一帧能起手就是可再次按下
    const prevT = p.dashT;
    step();
    if (p.dashT > prevT + 0.1) {          // dashT 被重新赋成满值 = 新一次冲刺
      started++;
      if (started === 2) { second = f; break; }
    }
  }
  return second;                          // 第二次冲刺落在第几帧（0=第一帧）
}

/* ---------- 6 攻击起手 → 最早能起跳的间隔帧数 ---------- */
function atkToJumpFrames() {
  for (let k = 0; k < 40; k++) {
    reset();
    inp.attack = 1; inp.attackHit = 1;
    step();                               // f0：攻击起手
    inp.attack = 0; inp.attackHit = 0;
    let ok = false;
    for (let f = 1; f <= k; f++) step();   // 空转 k-1 帧
    inp.jump = 1; inp.jumpHit = 1;
    for (let f = 0; f < 4; f++) { step(); if (p.vy < -1) ok = true; }
    if (ok) return k;
  }
  return -1;
}

/* ---------- 7 落地 → 最早能移动/起跳的间隔帧数 ---------- */
function landToMoveFrames() {
  reset();
  p.y -= 200; p.x = 200; p.vy = 0; p.onGround = false; // 抬高 200px 自由落体
  let landF = -1;
  for (let f = 0; f < 200; f++) { step(); if (p.onGround) { landF = f; break; } }
  if (landF < 0) return { landF, move: -1, jump: -1 };
  // 落地当帧起按住右，看第几帧 |vx|>0
  inp.right = 1;
  let move = -1;
  for (let f = 0; f < 30; f++) { step(); if (Math.abs(p.vx) > 0.001) { move = f; break; } }
  // 落地当帧起按跳，看第几帧离地
  reset();
  p.y -= 200; p.x = 200; p.vy = 0; p.onGround = false;
  for (let f = 0; f < 200; f++) { step(); if (p.onGround) break; }
  inp.jump = 1; inp.jumpHit = 1;
  let jump = -1;
  for (let f = 0; f < 30; f++) { step(); if (p.vy < -1) { jump = f; break; } }
  return { landF, move, jump };
}

/* ---------- 8 上升期二段跳是否可用 ---------- */
function djInRise() {
  reset();
  const a0 = p.airJumps;
  inp.jump = 1; inp.jumpHit = 1;
  for (let f = 0; f < 6; f++) step();      // 上升期（约第 6 帧，vy 仍为负）
  const vyBefore = p.vy, rise = vyBefore < 0;
  inp.jump = 1; inp.jumpHit = 1;           // 上升期补一次边沿
  step();
  const used = a0 - p.airJumps;
  const kicked = used === 1 && p.vy < vyBefore - 20;   // vy 被重新拉高（-jumpV*0.92）
  return { rise, used, kicked, vyBefore: +vyBefore.toFixed(1), vyAfter: +p.vy.toFixed(1) };
}

/* ---------- 附加：冷却中单次按下攻击会不会被吞（v7.7 攻击输入缓冲的证据） ---------- */
function atkQueueFrames() {
  reset();
  inp.attack = 1; inp.attackHit = 1;
  step();                                  // f0 第一摆起手
  const seq0 = p.atkSeq;
  for (let f = 1; f < 40; f++) {
    inp.attack = 1;
    inp.attackHit = (f === 19) ? 1 : 0;    // 冷却结束（第 21 帧）前 2 帧只点一次
    step();
    if (p.atkSeq > seq0) return f;         // 第二摆实际起手帧
  }
  return -1;                               // -1 = 这次输入被吞了
}

/* ---------- metaBonus 三处生效点 ---------- */
function metaChecks() {
  const out = {};
  // ① 未定义：行为必须与旧版一致
  delete g.metaBonus;
  reset();
  out.none = { maxHp: p._realMaxHp, dashCdSec: null, atkDmg: null };
  // ② 定义后：hp / atk / dashCd
  g.metaBonus = { hp: 2, atk: 3, dashCd: 5 };
  reset();
  out.bonus = { maxHp: p._realMaxHp };
  // 攻击伤害：面前放一个 100 血木桩，打一刀读掉血
  const L = g.level;
  const dummy = { type: 'slime', x: p.x + 12, y: p.y + 2, w: 12, h: 10, vx: 0, vy: 0,
    hx: p.x + 12, hy: p.y + 2, dead: 0, t: 0, grounded: true, hp: 100, kb: 0,
    flashT: 0, jitT: 0, dvx: 0, dvy: 0, ai: { st: 'idle', t: 0, cd: 999, cd0: 999, tx: 0, ty: 0 } };
  L.enemies.push(dummy);
  inp.attack = 1; inp.attackHit = 1;
  for (let f = 0; f < 20; f++) { inp.attackHit = f === 0 ? 1 : 0; step(); }
  out.bonus.atkDmg = 100 - dummy.hp;
  // 冲刺冷却：读实际帧数
  delete g.metaBonus;
  out.none.dashCdSec = dashCdFrames();
  g.metaBonus = { hp: 2, atk: 3, dashCd: 5 };
  out.bonus.dashCdSec = dashCdFrames();
  // ③ 全 0 加成 ≡ 未定义；④ 残缺对象（只给 hp）不得算出 NaN 冷却
  const maxHpOf = () => { reset(); return p._realMaxHp; };
  g.metaBonus = { hp: 0, atk: 0, dashCd: 0 };
  out.zero = { maxHp: maxHpOf(), dashCdFrames: dashCdFrames() };
  g.metaBonus = { hp: 1 };
  out.partial = { maxHp: maxHpOf(), dashCdFrames: dashCdFrames() };
  delete g.metaBonus;
  return out;
}

/* ---------- 主流程 ---------- */
const R = {};
R.maxJump = jumpHeight(100);
R.shortJump = jumpHeight(3);
R.run1s = run1s();
const dd = dashDist(); R.dashDist = dd.dist; R.dashFrames = dd.frames;
R.dashCdFrames = dashCdFrames();
R.atkToJump = atkToJumpFrames();
const lm = landToMoveFrames(); R.landToMove = lm.move; R.landToJump = lm.jump;
const dj = djInRise(); R.djRise = dj;
R.atkQueue = atkQueueFrames();
R.meta = metaChecks();
R.phy = { jumpV: PHY.jumpV, grav: PHY.grav, maxRun: PHY.maxRun, dashCd: BAL.dash.cd,
  dashV: BAL.dash.v, dashDur: BAL.dash.dur, buffer: PHY.buffer, coyote: PHY.coyote };

console.log('=== v7.7 手感 8 指标（60Hz 固定步长） ===');
console.log('1 最大跳跃高度        ' + R.maxJump + ' px');
console.log('2 短按跳跃高度(3帧)   ' + R.shortJump + ' px  (' + (R.shortJump / R.maxJump * 100).toFixed(1) + '% of 满跳)');
console.log('3 满速跑 1s 位移      ' + R.run1s + ' px');
console.log('4 冲刺距离            ' + R.dashDist + ' px / ' + R.dashFrames + ' 帧');
console.log('5 冲刺冷却            ' + R.dashCdFrames + ' 帧（' + (R.dashCdFrames / 60).toFixed(3) + 's）');
console.log('6 攻击起手→可起跳     ' + R.atkToJump + ' 帧');
console.log('7 落地→可移动         ' + R.landToMove + ' 帧（落地→可起跳 ' + R.landToJump + ' 帧）');
console.log('8 上升期二段跳        ' + (dj.kicked ? '可用' : '不可用')
  + '（上升=' + dj.rise + ' 消耗=' + dj.used + ' vy ' + dj.vyBefore + '→' + dj.vyAfter + '）');
console.log('附加 冷却中单点攻击→第二摆起手  第 ' + R.atkQueue + ' 帧' + (R.atkQueue < 0 ? '（输入被吞）' : '（缓冲生效）'));
console.log('metaBonus: 未定义 maxHp=' + R.meta.none.maxHp + ' / 加成{hp:2,atk:3,dashCd:5} maxHp='
  + R.meta.bonus.maxHp + ' atkDmg=' + R.meta.bonus.atkDmg
  + ' dashCd=' + R.meta.bonus.dashCdSec + '帧 vs 无加成 ' + R.meta.none.dashCdSec + '帧');
console.log('metaBonus 等价性: 全0 maxHp=' + R.meta.zero.maxHp + ' dashCd=' + R.meta.zero.dashCdFrames
  + '帧 / 残缺{hp:1} maxHp=' + R.meta.partial.maxHp + ' dashCd=' + R.meta.partial.dashCdFrames + '帧（须同无加成）');
console.log('PHY/BAL: ' + JSON.stringify(R.phy));

const saveIdx = process.argv.indexOf('--save');
if (saveIdx > 0 && process.argv[saveIdx + 1]) {
  const f = path.join(__dirname, process.argv[saveIdx + 1]);
  fs.writeFileSync(f, JSON.stringify(R, null, 2));
  console.log('已写出 ' + f);
}
