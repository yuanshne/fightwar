// v11 终点封印自测：node tools/_v11_seal.js
// 沙箱手法照抄 tools/gate.js 的 engine 模式（new Function + THEMES 桩，无 DOM/无构建）。
// 断言六组：①18 关封印数值口径 ②Boss 关豁免 ③三条路各测一遍（L1）④封印不挡物理 ⑤防卡关兜底 ⑥金币口径（不读 game.coins）
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const themes = {};
['grass', 'cave', 'sky', 'factory', 'lava', 'tower', 'boss', 'wind', 'castle', 'star', 'sea', 'nether']
  .forEach(k => themes[k] = {});
const body = read('levels.js') + '\n' + read('chapter2.js') + '\n' + read('chapter3.js')
  + '\n;aggregateLevels();\n' + read('engine.js')
  + '\n;return {PHY,Level,game,loadLevel,respawn,killPlayer,levelClear,updateWorld,ALL_LEVELS,'
  + 'puzzleSolved:(typeof puzzleSolved==="undefined")?undefined:puzzleSolved};';
const sb = new Function('THEMES', body)(themes);
const { game, loadLevel, updateWorld, ALL_LEVELS } = sb;
const N = ALL_LEVELS.length;
const DT = 1 / 60;

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('  [PASS] ' + msg); }
  else { fail++; console.log('  [FAIL] ' + msg); }
}
// 进关并把状态摆成可推进的一帧（与 gate.js 的 engine 空转同口径）
function enter(idx, keep) {
  loadLevel(idx, keep);
  game.state = 'play'; game.paused = false; game.puzzleActive = false; game.bagActive = false;
  game.player.dead = false; game.player.deadT = 0;
  game.input.left = 0; game.input.right = 0; game.input.jump = 0; game.input.jumpHit = 0;
}
function drive(n) { for (let i = 0; i < (n || 1); i++) updateWorld(DT); }
// 把玩家矩形整体塞进终点（不改终点、不加碰撞，模拟「跑图党直接走进终点」）
function standOnGoal() {
  const L = game.level, p = game.player;
  p.x = L.goal.x + (L.goal.w - p.w) / 2;
  p.y = L.goal.y + L.goal.h - p.h;
  p.vx = 0; p.vy = 0; p.dead = false;
}

console.log('=== ① 18 关封印数值口径 ===');
for (let i = 0; i < N; i++) {
  enter(i, false);
  const L = game.level, s = game.seal;
  const eNeed = Math.ceil(L.enemyTotal * 0.6), cNeed = Math.ceil(L.coins.length * 0.4);
  ok(s && s.enemyTotal === L.enemyTotal && s.coinTotal === L.coins.length
    && s.enemyNeed === eNeed && s.coinNeed === cNeed && s.enemyNeed >= 1 && s.coinNeed >= 1
    && s.enemyKilled === 0 && s.coinGot === 0 && s.blockT === 0 && s.relaxed === false,
    'L' + (i + 1) + ' enemyTotal=' + L.enemyTotal + ' enemyNeed=' + (s && s.enemyNeed) + '(ceil60%=' + eNeed + ')'
    + ' coinTotal=' + L.coins.length + ' coinNeed=' + (s && s.coinNeed) + '(ceil40%=' + cNeed + ')'
    + ' hasShrine=' + (s && s.hasShrine));
}

console.log('=== ② Boss 关豁免 ===');
for (const bi of [6, 12, 15, 17]) {
  enter(bi, false);
  ok(!!ALL_LEVELS[bi].boss && game.seal.open === true && game.seal.via === 'boss',
    'L' + (bi + 1) + ' Boss 豁免: open=' + game.seal.open + ' via=' + game.seal.via);
}

console.log('=== ③ 三条路（L1） ===');
// ③a 战斗线
enter(0, false);
{
  const L = game.level, s = game.seal;
  for (let i = 0; i < s.enemyNeed - 1; i++) L.enemies[i].dead = 0.01;
  drive(1);
  ok(game.seal.open === false && game.seal.enemyKilled === s.enemyNeed - 1,
    '战斗线 enemyKilled=' + game.seal.enemyKilled + '/need=' + s.enemyNeed + ' → open=false');
  L.enemies[s.enemyNeed - 1].dead = 0.01;
  drive(1);
  ok(game.seal.open === true && game.seal.via === 'battle',
    '战斗线 enemyKilled=' + game.seal.enemyKilled + '/need=' + s.enemyNeed + ' → open=true via=' + game.seal.via);
  ok(game.parts.length > 0 && game.sfxQueue.includes('door') && (game.shake >= 3 || !!game.shakePend),
    '解除特效: 粒子 ' + game.parts.length + ' / sfx 含 door=' + game.sfxQueue.includes('door')
    + ' / 震屏=' + (game.shakePend ? '挂起' + JSON.stringify(game.shakePend) : '已生效 ' + game.shake));
}
// ③a′ Boss 召唤体不计入战斗线（假召唤体：dead 但 summoned）
enter(0, false);
{
  const L = game.level, s = game.seal;
  L.enemies.push({ type: 'slime', x: 0, y: 0, w: 12, h: 10, dead: 0.01, summoned: true, hp: 1 });
  drive(1);
  ok(game.seal.enemyKilled === 0 && game.seal.open === false,
    '召唤体不计入战斗线: enemyKilled=' + game.seal.enemyKilled + '（数组长度 ' + L.enemies.length + '）');
}
// ③b 金币线
enter(0, false);
{
  const L = game.level, s = game.seal;
  for (let i = 0; i < s.coinNeed - 1; i++) L.coins[i].got = true;
  drive(1);
  ok(game.seal.open === false && game.seal.coinGot === s.coinNeed - 1,
    '金币线 coinGot=' + game.seal.coinGot + '/need=' + s.coinNeed + ' → open=false');
  L.coins[s.coinNeed - 1].got = true;
  drive(1);
  ok(game.seal.open === true && game.seal.via === 'coin',
    '金币线 coinGot=' + game.seal.coinGot + '/need=' + s.coinNeed + ' → open=true via=' + game.seal.via);
}
// ③c 谜题线
enter(0, false);
{
  const s = game.seal;
  ok(s.hasShrine === true, 'L1 有神龛（谜题线可用）');
  game.solvedPuzzles[game.level.shrines[0].idx] = true; // ui 层置位口径（引擎只读）
  drive(1);
  ok(game.seal.open === true && game.seal.via === 'puzzle',
    '谜题线 shrineOk=' + game.seal.shrineOk + ' → open=true via=' + game.seal.via);
}

console.log('=== ④ 封印不挡物理 ===');
enter(0, false);
{
  const L = game.level;
  standOnGoal();
  const x0 = game.player.x;
  drive(1);
  const p = game.player;
  ok(game.state === 'play', '玩家矩形在终点内且封印未解 → game.state=' + game.state + '（不是 clear）');
  ok(Math.abs(p.x - x0) < 12 && p.x > L.goal.x - 16,
    '玩家 x 未被钳制到终点之外: x ' + x0.toFixed(1) + ' → ' + p.x.toFixed(1)
    + '（goal.x=' + L.goal.x + ', 仅轻推 vx=' + p.vx.toFixed(1) + '）');
  ok(game.seal.blockT > 0 && game.seal.blockT <= 0.9,
    '弹回提示计时 blockT=' + game.seal.blockT.toFixed(2) + '（ui 读它做闪烁）');
  // blockT 递减：先把玩家挪出终点（否则站在旗里每 0.9s 会被重新推一次，计时永远回满）
  game.player.x = L.spawn.x; game.player.y = L.spawn.y;
  drive(60);
  ok(game.seal.blockT === 0, 'blockT 逐帧递减归零: ' + game.seal.blockT);
  // 反向：封印已开 → 同一位置立刻过关
  enter(0, false);
  game.seal.open = true;
  standOnGoal();
  drive(1);
  ok(game.state === 'clear', '封印已开 → 进终点即过关: state=' + game.state);
}

console.log('=== ⑤ 防卡关兜底（死 5 次降 20%） ===');
enter(0, false);
{
  const s0 = { e: game.seal.enemyNeed, c: game.seal.coinNeed };
  game.deaths = 5;
  drive(1);
  const s = game.seal;
  const wantE = Math.max(1, Math.floor(s0.e * 0.8)), wantC = Math.max(1, Math.floor(s0.c * 0.8));
  ok(s.relaxed === true && s.enemyNeed === wantE && s.coinNeed === wantC,
    '死 5 次: enemyNeed ' + s0.e + '→' + s.enemyNeed + '(应' + wantE + ') / coinNeed '
    + s0.c + '→' + s.coinNeed + '(应' + wantC + ')');
  drive(1); drive(1);
  ok(s.enemyNeed === wantE && s.coinNeed === wantC, '只降一次: enemyNeed=' + s.enemyNeed + ' coinNeed=' + s.coinNeed);
}

console.log('=== ⑥ 金币口径（不读 game.coins） ===');
enter(1, true); // keepStats：带着上一关的余额进关
{
  game.coins = 999;
  drive(1);
  ok(game.seal.coinGot === 0 && game.seal.coinTotal === game.level.coins.length,
    'loadLevel(1,true) + game.coins=999 → coinGot=' + game.seal.coinGot
    + ' / coinTotal=' + game.seal.coinTotal + '（实体数，非 game.coins）');
  // 再证一次：只把实体 got 置位才算数
  const L = game.level;
  for (let i = 0; i < 3; i++) L.coins[i].got = true;
  drive(1);
  ok(game.seal.coinGot === 3, '置位 3 个金币实体 → coinGot=' + game.seal.coinGot);
}

console.log('---');
console.log((fail ? 'v11 封印自测失败' : 'v11 封印自测 OK') + ': PASS ' + pass + ' / FAIL ' + fail);
if (fail) process.exit(1);
