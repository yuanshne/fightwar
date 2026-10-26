// node tools/_diag_summon.js [kind] [秒数] —— 量化「召唤频率 + 召唤物清场成本」
// 玩家反馈：召唤不能一直召唤，打小怪累死。这里把两件事都量出来：
//   ① 召唤间隔：60 秒内召唤几次（旧版无 CD，清完就再召，玩家一直在打小怪）
//   ② 清场成本：召唤物总血量 ÷ 玩家单刀伤害 = 要砍几刀
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..');
const glue = '\n;return {game,loadLevel,updateWorld,ALL_LEVELS,aggregateLevels,getLevels:()=>ALL_LEVELS,'
  + '_engBossPick,_engBossTable,BAL};';
const themes = {}; ['grass','cave','sky','factory','lava','tower','boss','wind','castle','star','sea','nether']
  .forEach(k => themes[k] = {});
const sb = new Function('THEMES', fs.readFileSync(path.join(ROOT, 'levels.js'), 'utf8')
  + fs.readFileSync(path.join(ROOT, 'chapter2.js'), 'utf8')
  + fs.readFileSync(path.join(ROOT, 'chapter3.js'), 'utf8')
  + fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8') + glue)(themes);
sb.aggregateLevels();

const KIND_LV = { 1: 6, 2: 12, 3: 15, 4: 17, 5: 17, 6: 18 };
const kind = parseInt(process.argv[2] || '6', 10);
const secs = parseFloat(process.argv[3] || '90');
const g = (() => { sb.loadLevel(KIND_LV[kind], false); return sb.game; })();
g.state = 'play';
const b = g.boss, p = g.player;
const T = sb._engBossTable(b.kind);
const S = T.summon || sb.BAL.boss.summon;

// 玩家站远处、全程无敌、顺手秒清小怪 —— 最坏情况：
// 如果连"每帧清场"都压不住召唤频率，实际游戏里只会更糟。
p.x = b.x - 200; p.y = b.y; p.invT = 9e9; p.hp = p.maxHp;
b.state = 'idle'; b.t = 0;                      // 从 dormant 唤醒
g.level.enemies.length = 0;

let summonTimes = [], minionSeen = 0, minionHpSeen = 0;
const dt = 1 / 60;
let prevState = b.state;
for (let f = 0; f < secs * 60; f++) {
  sb.updateWorld(dt);
  if (b.state === 'summonCast' && prevState !== 'summonCast') summonTimes.push(f / 60);
  prevState = b.state;
  const minions = g.level.enemies.filter(e => e.leech && !(e.dead > 0));
  for (const e of minions) { minionSeen++; minionHpSeen = Math.max(minionHpSeen, e.hp); }
  minions.forEach(e => { e.dead = 1; });        // 模拟玩家秒清
}

console.log('Boss kind=' + (b.kind || 0) + '  召唤表: type=' + S.type + ' n=' + S.n + ' cd=' + (S.cd || 0) + 's hp=' + (S.hp || '基础'));
console.log('观测 ' + secs + 's（每帧秒清小怪 = 最坏情况）');
console.log('召唤次数: ' + summonTimes.length + '  首次 @' + (summonTimes[0] || 0).toFixed(1) + 's');
console.log('时间点: ' + summonTimes.map(t => t.toFixed(1)).join(', '));
console.log('实测召唤体最大血量: ' + (minionHpSeen || '（本轮未召唤）'));
if (summonTimes.length > 1) {
  const gaps = summonTimes.slice(1).map((t, i) => t - summonTimes[i]);
  console.log('间隔: ' + gaps.map(v => v.toFixed(1) + 's').join(', ') + '   最短 ' + Math.min(...gaps).toFixed(1) + 's');
}
// 清场成本
const minionHp = S.hp || sb.BAL.enemy[S.type].hp;
const atk = sb.BAL.player.atkBase, cd = sb.BAL.atk.cd;
const totalHp = minionHp * S.n;
console.log('清场成本: ' + S.n + ' 只 × ' + minionHp + ' hp = ' + totalHp + ' hp → 需 ' +
  Math.ceil(totalHp / atk) + ' 刀（' + (totalHp / atk * cd).toFixed(1) + 's 纯输出，不含走位）');
console.log('理论满频上限: ' + (secs / Math.max(S.cd || 1, 1)).toFixed(1) + ' 次/' + secs + 's（cd=' + (S.cd || 0) + 's）');
