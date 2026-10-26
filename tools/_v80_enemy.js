// v8.0 三种新敌实测（任务4 验收）：状态机 / 伤害 / 酸弹弹道 / 落地烟尘震屏 / 冲撞不可踩踏
// 用法：node tools/_v80_enemy.js
//
// 关卡里暂时还没有 'i'/'k'/'n'（levels 队并行），所以这里用合成关把三种敌人按工单尺寸摆出来，
// 逐帧驱动真物理，检查状态名（ui 按名取帧，必须逐字一致）与关键行为。
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const THEMES = {};
['grass','cave','sky','factory','lava','tower','boss','wind','castle','star','sea','nether']
  .forEach(k => { THEMES[k] = {}; });
const DT = 1 / 60;

function buildSandbox() {
  let body = read('levels.js');
  for (const f of ['chapter2.js', 'chapter3.js']) if (fs.existsSync(path.join(ROOT, f))) body += '\n' + read(f);
  body += '\n;aggregateLevels();\n' + read('engine.js')
    + '\n;return {Level,LG,ALL_LEVELS,game,loadLevel,updateWorld,PHY,BAL};';
  return new Function('THEMES', body)(THEMES);
}

// 合成关：40×10，地面 row9，主角站 col6，敌人按字符摆进去（走引擎真正的提取路径）
function mkArena(sb, chars) {
  const w = 40, h = 10;
  sb.ALL_LEVELS.push({ name: 'arena', theme: 'grass', w: w, h: h, par: 1, hint: '', build(g) {
    g.fill(0, h - 1, w - 1, h - 1, '#');
    g.set(6, h - 2, '@');
    for (const c of chars) g.set(c[0], h - 2, c[1]);
    return g;
  } });
  const li = sb.ALL_LEVELS.length - 1;
  sb.loadLevel(li, false);
  sb.game.state = 'play';
  return li;
}

function idle(g) {
  g.input.left = 0; g.input.right = 0; g.input.jump = 0; g.input.jumpHit = 0;
  g.input.attackHit = 0; g.input.dashHit = 0; g.input.down = 0;
  g.input.skillUHit = 0; g.input.skillIHit = 0; g.input.skillOHit = 0; g.input.skillLHit = 0;
}

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('  [PASS] ' + msg); }
  else { fail++; console.log('  [FAIL] ' + msg); }
}

function main() {
  const sb = buildSandbox();
  const BAL = sb.BAL;

  /* ---------- ① 铁甲虫：idle → wind → charge → idle，冲撞不可踩踏 ---------- */
  console.log('① beetle 铁甲虫（\'i\'，14×12，py-2，spd 76）');
  let li = mkArena(sb, [[12, 'i']]);
  let g = sb.game, L = g.level, p = g.player, e = L.enemies[0];
  ok(!!e && e.type === 'beetle', '提取 case \'i\' → type=beetle');
  ok(e.w === 14 && e.h === 12, '尺寸 14×12（实际 ' + e.w + '×' + e.h + '）');
  ok(Math.abs(e.y - ((10 - 2) * 16 - 2)) < 0.01, '锚点 py-2（y=' + e.y + '，应 ' + ((10 - 2) * 16 - 2) + '）');
  ok(e.hp === BAL.enemy.beetle.hp, 'hp=' + e.hp + '（BAL.enemy.beetle.hp）');
  const seen = {};
  let maxSpeed = 0;
  for (let f = 0; f < 400; f++) {
    idle(g);
    sb.updateWorld(DT);
    if (e.ai) seen[e.ai.st] = (seen[e.ai.st] || 0) + 1;
    if (Math.abs(e.vx) > maxSpeed) maxSpeed = Math.abs(e.vx);
  }
  ok(!!seen.wind, '出现 wind 蓄力态（' + (seen.wind || 0) + ' 帧）');
  ok(!!seen.charge, '出现 charge 冲撞态（' + (seen.charge || 0) + ' 帧）');
  ok(Math.abs(maxSpeed - BAL.enemy.beetle.skill.vx) < 1, '冲撞速度 = ' + maxSpeed + '（应 150）');

  // 冲撞期间踩踏无效：把玩家摆到甲虫正上方、给一个下坠速度
  li = mkArena(sb, [[12, 'i']]);
  g = sb.game; L = g.level; p = g.player; e = L.enemies[0];
  p.hp = 99; p.maxHp = 99;
  let stomped = 0;
  for (let f = 0; f < 400; f++) {
    idle(g);
    if (e.ai && e.ai.st === 'charge' && p.vy === 0) { // 冲撞中，从正上方踩下去
      p.x = e.x + 1; p.y = e.y - 20; p.vy = 200; p.onGround = false;
    }
    const hp0 = e.hp;
    sb.updateWorld(DT);
    if (e.hp < hp0) stomped++;
  }
  ok(stomped === 0, '冲撞期间踩踏不扣甲虫血（扣血次数 ' + stomped + '）');

  /* ---------- ② 酸液花：idle → cast → 酸弹（抛物线，复用 game.bullets） ---------- */
  console.log('\n② spitter 酸液花（\'k\'，14×16，py-2，站桩）');
  li = mkArena(sb, [[14, 'k']]);
  g = sb.game; L = g.level; p = g.player; e = L.enemies[0];
  ok(!!e && e.type === 'spitter', '提取 case \'k\' → type=spitter');
  ok(e.w === 14 && e.h === 16, '尺寸 14×16（实际 ' + e.w + '×' + e.h + '）');
  const x0 = e.x;
  let castFrames = 0, acid = null, acidMaxY = -1e9, acidMinY = 1e9;
  for (let f = 0; f < 400; f++) {
    idle(g);
    sb.updateWorld(DT);
    if (e.ai && e.ai.st === 'cast') castFrames++;
    for (const b of g.bullets) if (b.kind === 'acid' && !acid) acid = { b: b, vx: b.vx, vy: b.vy, x: b.x, y: b.y };
    for (const b of g.bullets) if (b.kind === 'acid') {
      if (b.y > acidMaxY) acidMaxY = b.y;
      if (b.y < acidMinY) acidMinY = b.y;
    }
  }
  ok(Math.abs(e.x - x0) < 0.01, '站桩不动（400 帧位移 ' + (e.x - x0).toFixed(2) + 'px）');
  ok(castFrames > 0, '出现 cast 读条态（' + castFrames + ' 帧 ≈ 0.4s×次数）');
  ok(!!acid, '吐出酸弹（game.bullets 里 kind=\'acid\'）');
  if (acid) ok(Math.abs(acid.vx) > 60 && Math.abs(acid.vx) <= BAL.enemy.spitter.skill.boltV + 0.01,
    '水平初速 ≤ boltV 130 且朝玩家（实际 vx=' + acid.vx.toFixed(1) + ' vy=' + acid.vy.toFixed(1) + '）');
  ok(acidMaxY - acidMinY > 8, '弹道是抛物线（纵向跨度 ' + (acidMaxY - acidMinY).toFixed(1) + 'px）');
  ok(g.player.hp < g.player.maxHp, '酸弹命中玩家扣血（hp ' + g.player.hp + '/' + g.player.maxHp + '）');

  /* ---------- ③ 跳跳蛛：idle → crouch → air → 落地（烟尘 + 震屏） ---------- */
  console.log('\n③ hopper 跳跳蛛（\'n\'，12×12，py-2，spd 44）');
  li = mkArena(sb, [[12, 'n']]);
  g = sb.game; L = g.level; p = g.player; e = L.enemies[0];
  ok(!!e && e.type === 'hopper', '提取 case \'n\' → type=hopper');
  ok(e.w === 12 && e.h === 12, '尺寸 12×12（实际 ' + e.w + '×' + e.h + '）');
  const seen3 = {};
  let minVy = 0, dust = 0, shake = 0, airFrames = 0;
  for (let f = 0; f < 400; f++) {
    idle(g);
    const parts0 = g.parts.length, shake0 = g.shake;
    sb.updateWorld(DT);
    if (e.ai) seen3[e.ai.st] = (seen3[e.ai.st] || 0) + 1;
    if (e.ai && e.ai.st === 'air') { airFrames++; if (e.vy < minVy) minVy = e.vy; }
    if (g.parts.length > parts0) dust++;
    if (g.shake > shake0) shake++;
  }
  ok(!!seen3.crouch, '出现 crouch 下蹲态（' + (seen3.crouch || 0) + ' 帧）');
  ok(!!seen3.air, '出现 air 跳跃态（' + (seen3.air || 0) + ' 帧）');
  ok(minVy <= -BAL.enemy.hopper.skill.jumpV + 1, '起跳 vy = ' + minVy.toFixed(1) + '（应 ≤ -300）');
  ok(dust > 0, '落地有烟尘粒子（' + dust + ' 帧新增粒子）');
  ok(shake > 0, '落地有震屏（' + shake + ' 帧 shake 上升）');

  /* ---------- ④ elite 兜底：BAL.elite 三键齐全，工厂不 TypeError ---------- */
  console.log('\n④ elite 变体兜底');
  ok(!!BAL.elite.beetle && !!BAL.elite.spitter && !!BAL.elite.hopper, 'BAL.elite 三键齐全（工厂读 BAL.elite[type].hp）');

  /* ---------- ⑤ 未摆字符时不崩：普通 18 关空转 ---------- */
  console.log('\n⑤ 兜底：levels.js 还没摆 \'i\'/\'k\'/\'n\' 时不能崩');
  for (let i = 0; i < 18; i++) {
    sb.loadLevel(i, false);
    sb.game.state = 'play';
    for (let f = 0; f < 60; f++) { idle(sb.game); sb.updateWorld(DT); }
  }
  ok(true, '18 关 × 60 帧空转无异常');

  console.log('\n合计：PASS ' + pass + ' / FAIL ' + fail);
  if (fail) process.exit(1);
}
main();
