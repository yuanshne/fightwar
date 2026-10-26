// tools/_diag_leech.js —— 量化 Boss「召唤回血」强度：一次召唤能回多少血、多快
// 用法: node tools/_diag_leech.js [kind] [观察秒数]
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..');
const glue = '\n;return {PHY,Level,game,loadLevel,updateWorld,ALL_LEVELS,aggregateLevels,_engBossTable,BAL};';
const themes = {}; ['grass','cave','sky','factory','lava','tower','boss','wind','castle','star','sea','nether']
  .forEach(k => themes[k] = {});
const sb = new Function('THEMES', fs.readFileSync(path.join(ROOT, 'levels.js'), 'utf8')
  + fs.readFileSync(path.join(ROOT, 'chapter2.js'), 'utf8')
  + fs.readFileSync(path.join(ROOT, 'chapter3.js'), 'utf8')
  + fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8') + glue)(themes);
sb.aggregateLevels();

const kind = Number(process.argv[2] || 6);
const secs = Number(process.argv[3] || 15);
const LV = { 1: 6, 2: 12, 3: 15, 4: 16, 5: 17, 6: 18 };
sb.loadLevel(LV[kind] !== undefined ? LV[kind] : 18, false);
const g = sb.game, b = g.boss, p = g.player;
g.state = 'play';
b.state = 'idle'; b.t = 0; b.phase = 1; b.bandBreak = 0;
b.hpTotal = b.maxHp; b.hp = b.bandMax;
p.x = b.x - 140; p.y = b.y; p.invT = 9e9;
g.level.enemies.length = 0;               // 选招有「存活敌人 >=2 不召唤」闸门，先清场

// 强制放一次召唤（走真实 windup → summonCast 路径）
b.next = 'summon'; b.state = 'windup'; b.t = 0; b.fireN = 0;
for (let f = 0; f < 90 && b.state !== 'summonCast'; f++) sb.updateWorld(1 / 60);
const minions = g.level.enemies.filter(e => e.leech);
const T = sb._engBossTable(kind), P = T.summon;

// 血量压到 40%，观察 leech 自己往回涨
b.hpTotal = b.bandMax * 0.4; b.hp = b.hpTotal; b.leechAcc = 0;
const t0 = b.hpTotal;
let healed = 0, prev = t0, firstSec = [];
for (let f = 0; f < secs * 60; f++) {
  sb.updateWorld(1 / 60);
  if (b.hpTotal > prev) healed += b.hpTotal - prev;
  if (f < 180 && f % 60 === 59) firstSec.push(+(b.hpTotal - t0).toFixed(1));
  prev = b.hpTotal;
}
console.log(`kind=${kind}  maxHp=${b.maxHp}  bandMax=${b.bandMax}  召唤 ${minions.length} 只  leech=${P.leech}%/s/只  cap=${P.leechCap === undefined ? 6 : P.leechCap}%`);
console.log(`  ${secs}s 内回血     : ${healed.toFixed(1)} hp = ${(healed / b.maxHp * 100).toFixed(1)}% 总血 = ${(healed / b.bandMax * 100).toFixed(1)}% 段血`);
console.log(`  峰值速率        : 第 1/2/3 秒累计 ${firstSec.join(' / ')} hp`);
console.log(`  折合玩家要多打  : ${(healed / b.bandMax * 100 / 3).toFixed(1)}% 总血（三段口径）`);
