// node tools/_diag_mist.js —— 量化「水雾区到底在罚什么、罚多少」
//   坑（本文件第一版踩过）：cast 完不把 Boss 冻住，3 秒的取样窗口里 Boss 会自己出招把玩家打死，
//   玩家一死就 respawn 回出生点 → 所有「站桩掉血」读数全变 0。取样前必须 b.state='idle' + b.t=-9999 + 清弹幕。
//   跳跃也必须给 game.input.jumpHit 边沿，只设 jump=true 起跳不了（引擎读的是边沿）。
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..');
const glue = '\n;return {PHY,Level,game,loadLevel,respawn,updateWorld,ALL_LEVELS,aggregateLevels,'
  + '_engHurtPlayer,_engMkBoss,_engBossTable,BAL};';
const themes = {}; ['grass','cave','sky','factory','lava','tower','boss','wind','castle','star','sea','nether']
  .forEach(k => themes[k] = {});
const sb = new Function('THEMES', fs.readFileSync(path.join(ROOT, 'levels.js'), 'utf8')
  + fs.readFileSync(path.join(ROOT, 'chapter2.js'), 'utf8')
  + fs.readFileSync(path.join(ROOT, 'chapter3.js'), 'utf8')
  + fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8') + glue)(themes);
sb.aggregateLevels();

const DT = 1 / 60, M = sb.BAL;

/* 建一个「只有雾、没有 Boss」的干净取样场：
   玩家站在出生点（引擎已保证脚下是地），Boss 在身旁放一次 mist 后立刻搬到 600px 外并冻住。 */
function arena() {
  sb.loadLevel(12, false);                     // L13 蛟龙
  const g = sb.game, p = g.player, b = g.boss;
  g.state = 'play';
  g.level.enemies.length = 0; g.bullets.length = 0; g.waves.length = 0; g.hazards.length = 0;
  p.hp = p.maxHp; p.invT = 0; p.dead = 0;
  // 让 Boss 贴着玩家放雾（招式本体按 pcx 定坐标）
  b.x = p.x + 60; b.y = p.y + p.h - b.h;
  b.hpTotal = b.maxHp; b.hp = b.bandMax; b.bandBreak = 0; b.phase = 1;
  b.next = 'mist'; b.state = 'windup'; b.t = 0; b.fireN = 0;
  for (let f = 0; f < 120; f++) {
    sb.updateWorld(DT);
    if (b.state === 'mistCast' && b.fireN) break;
  }
  // 冻住 Boss，搬到远处：之后的读数只反映水雾
  b.state = 'idle'; b.t = -1e9; b.x = p.x + 600; b.vx = 0;
  g.bullets.length = 0; g.waves.length = 0;
  for (let e of g.level.enemies) e.dead = 1;
  g.level.enemies.length = 0;
  return g;
}
const mists = g => (g.hazards || []).filter(h => h.kind === 'mist');
const inMist = (g, p) => mists(g).some(h => p.x + p.w > h.x && p.x < h.x + h.w
  && p.y + p.h > h.y - h.h && p.y < h.y);

console.log('== 参数 ==');
console.log('  mist =', JSON.stringify(M.boss2.mist));
console.log('  玩家 maxHp =', M.player.hpBase, '受伤无敌 invT =', M.player.invT, 's  跑速 =', M.PHY.maxRun || sb.PHY.maxRun);

/* ---------- 1) 站桩 4 秒 ---------- */
{
  const g = arena(), p = g.player;
  const hp0 = p.hp, x0 = p.x;
  let t = 0, hits = 0, last = p.hp, leftAt = -1;
  while (t < 4.05) {
    sb.updateWorld(DT); t += DT;
    if (p.hp < last) { hits++; last = p.hp; }
    if (leftAt < 0 && !inMist(g, p)) leftAt = t;
  }
  console.log('\n== 1) 站桩不动 ==');
  console.log('  4s 内扣 ' + (hp0 - p.hp) + ' 心 / 命中 ' + hits + ' 次；被击退位移 ' + Math.round(p.x - x0) + 'px');
  console.log('  结束位置还在雾里 = ' + inMist(g, p) + '；剩余 hp ' + Math.max(0, p.hp) + '/' + hp0 +
    '（击退把玩家推出雾的时刻 t=' + (leftAt < 0 ? '没推出' : leftAt.toFixed(2) + 's') + '）');
}

/* ---------- 2) 看到雾后 0.2s 起步走开 ---------- */
{
  const g = arena(), p = g.player;
  const hp0 = p.hp;
  let t = 0, outAt = -1, hits = 0, last = p.hp;
  while (t < 4.05) {
    g.input.right = t >= 0.2;
    sb.updateWorld(DT); t += DT;
    if (p.hp < last) { hits++; last = p.hp; }
    if (outAt < 0 && !inMist(g, p)) outAt = t;
  }
  g.input.right = false;
  console.log('\n== 2) 反应 0.2s 后往右走 ==');
  console.log('  脱身用时 ' + (outAt < 0 ? '>4s' : outAt.toFixed(2) + 's') + '；全程扣 ' + (hp0 - p.hp) + ' 心（命中 ' + hits + '）');
}

/* ---------- 3) 跳跃能不能越过 96px 雾墙 ---------- */
{
  const g = arena(), p = g.player;
  const m = mists(g)[0];
  const feet0 = p.y + p.h;
  let maxUp = 0, used = 1;
  for (let f = 0; f < 100; f++) {
    if (f === 0) { g.input.jump = true; g.input.jumpHit = 1; }
    else if (f === 12 && p.vy > 0) { g.input.jumpHit = 1; used = 2; }   // 顶点后补二段
    else g.input.jumpHit = 0;
    sb.updateWorld(DT);
    maxUp = Math.max(maxUp, feet0 - (p.y + p.h));
  }
  g.input.jump = false;
  console.log('\n== 3) 能不能跳过去 ==');
  console.log('  单跳 / 二段跳实测最高离地 ' + Math.round(maxUp) + 'px（用了 ' + used + ' 段）；雾高 ' + m.h + 'px → ' +
    (maxUp >= m.h ? '能越' : '越不过，只能横向跑出去'));
}

/* ---------- 4) 覆盖形状 ---------- */
{
  const g = arena(), p = g.player;
  const ms = mists(g).sort((a, b) => a.x - b.x), pc = p.x + p.w / 2;
  console.log('\n== 4) 覆盖（以玩家中心为 0）==');
  ms.forEach((h, i) => console.log('  雾' + (i + 1) + '  ' + Math.round(h.x - pc) + ' ~ ' +
    Math.round(h.x + h.w - pc) + '  宽' + h.w + ' 高' + h.h));
  for (let i = 1; i < ms.length; i++) {
    const gap = ms[i].x - (ms[i - 1].x + ms[i - 1].w);
    console.log('  缝隙' + i + ' 宽 ' + Math.round(gap) + 'px / 玩家宽 ' + p.w + 'px → ' + (gap > p.w ? '钻得过去' : '钻不过去'));
  }
  const lo = ms[0].x, hi = ms[ms.length - 1].x + ms[ms.length - 1].w;
  console.log('  总封锁 ' + Math.round(hi - lo) + 'px = 关卡宽 ' + g.level.w * 16 + 'px 的 ' +
    Math.round((hi - lo) / (g.level.w * 16) * 100) + '%');
}

/* ---------- 5) 出招频率与轮转 ---------- */
{
  const T = sb._engBossTable(2);
  console.log('\n== 5) 出现频率 ==');
  console.log('  近身池 ' + T.poolNear.length + ' 招 ' + JSON.stringify(T.poolNear));
  console.log('  水雾在前摇表里的 dur = ' + (T.windup && T.windup.mist) + 's；recover 后摇 ' + (T.recover && T.recover.mist) + 's');
}
