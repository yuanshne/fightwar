// node tools/_v4_puzzle_smoke.js —— v4 谜题神龛引擎冒烟（工单 docs/specs/2026-10-24-v4-puzzles.md 引擎队 1~5）
// 断言：'Q' 提取 / puzzleNear 接近检测 / puzzleActive 世界冻结 / puzzleSolved 结算 / loadLevel 复位。
// 合成关卡 push 进 LEVELS（不改动 levels.js 任何一行）；七关回归由 node tools/gate.js engine 覆盖。
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..');
const glue = '\n;return {PHY,Level,game,loadLevel,respawn,killPlayer,levelClear,updateWorld,puzzleSolved,LEVELS};';
const themes = {}; ['grass', 'cave', 'sky', 'factory', 'lava', 'tower', 'boss'].forEach(k => themes[k] = {});
const sb = new Function('THEMES', fs.readFileSync(path.join(ROOT, 'levels.js'), 'utf8')
  + fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8') + glue)(themes);

let failed = 0;
function ok(cond, label) {
  if (cond) { console.log('  OK  ' + label); }
  else { console.error('  FAIL ' + label); failed++; }
}

/* ---------- 合成神龛关卡：地板 y=8，@ 在(2,7)，Q 在(6,7)，P 在(12,7) ---------- */
const fakeIdx = sb.LEVELS.length; // 追加为第 8 关（idx=7）→ 神龛 idx=8
sb.LEVELS.push({
  name: 'T · 谜题冒烟', theme: 'grass', par: 40, hint: '', w: 16, h: 10,
  build(g) { g.ground(0, 15, 8); g.set(2, 7, '@'); g.set(6, 7, 'Q'); g.set(12, 7, 'P'); return g; }
});

/* ---------- ① 'Q' 提取 ---------- */
sb.loadLevel(fakeIdx, false);
let L = sb.game.level, g = sb.game;
ok(L.shrines.length === 1, "① 'Q' 提取：shrines.length===1（实际 " + L.shrines.length + "）");
const sh = L.shrines[0];
ok(sh && sh.x === 6 * 16 && sh.w === 16 && sh.h === 24, "① 神龛几何 x=96 w=16 h=24（实际 " + JSON.stringify(sh) + "）");
ok(sh && sh.y === 7 * 16 - 8, "① 碑底对齐支撑瓦片顶面 y=104（实际 " + (sh && sh.y) + "）");
ok(sh && sh.idx === fakeIdx + 1, '① idx=关卡号(1起)=' + (fakeIdx + 1) + '（实际 ' + (sh && sh.idx) + '）');
ok(L.tiles[7][6] === '.', "① 网格 'Q' 已换 '.'（实际 '" + L.tiles[7][6] + "'）");
ok(!L.solid(6, 7, 0), "① 神龛瓦片非实心（可通行）");
ok(g.puzzleActive === false && g.puzzleNear === -1, '① loadLevel 复位 puzzleActive/puzzleNear');

/* ---------- ③ puzzleNear 接近检测 ---------- */
g.state = 'play';
for (let f = 0; f < 30; f++) sb.updateWorld(1 / 60); // 出生点空转（远离神龛）
ok(g.puzzleNear === -1, '③ 远离时 puzzleNear===-1（实际 ' + g.puzzleNear + '）');
g.player.x = 92; g.player.y = 8 * 16 - 14; g.player.vx = 0; g.player.vy = 0; // 站到神龛旁（脚踩地板）
sb.updateWorld(1 / 60);
ok(g.puzzleNear === fakeIdx + 1, '③ 相邻 8px 外扩内 puzzleNear===' + (fakeIdx + 1) + '（实际 ' + g.puzzleNear + '）');
g.player.x = 35; sb.updateWorld(1 / 60); // 走远
ok(g.puzzleNear === -1, '③ 离开恢复 -1（实际 ' + g.puzzleNear + '）');

/* ---------- ② puzzleActive 世界冻结 ---------- */
g.player.x = 50; g.player.y = 60; g.player.vy = 100; // 悬空 + 下落中
g.time = 0; g.sfxQueue.length = 0; g.coins = 0;
g.puzzleActive = true;
for (let f = 0; f < 60; f++) sb.updateWorld(1 / 60);
ok(g.player.y === 60 && g.player.vy === 100, '② 冻结：玩家物理停摆 y/vy 不变（y=' + g.player.y + ' vy=' + g.player.vy + '）');
ok(g.time === 0, '② 冻结：关卡计时停摆 time=0（实际 ' + g.time + '）');
g.puzzleActive = false;
sb.updateWorld(1 / 60);
ok(g.player.y > 60, '② 解除后世界恢复推进（y=' + g.player.y.toFixed(2) + '）');
g.puzzleActive = true; // 复位现场，避免后续断言被坠落干扰
g.player.y = 8 * 16 - 14; g.player.vy = 0; g.puzzleActive = false;

/* ---------- ④ puzzleSolved 结算 ---------- */
g.coins = 0; g.sfxQueue.length = 0; g.parts.length = 0;
sb.puzzleSolved(sh.idx);
ok(g.solvedPuzzles[sh.idx] === true, '④ solvedPuzzles[' + sh.idx + ']=true');
ok(g.coins === 5, '④ 金币 +5（实际 ' + g.coins + '）');
ok(g.sfxQueue.indexOf('puzzle') >= 0 && g.sfxQueue.indexOf('gem') >= 0, "④ sfxQueue 含 'puzzle'+'gem'（实际 " + JSON.stringify(g.sfxQueue) + "）");
ok(g.parts.length === 24, '④ 金色烟花 24 粒（实际 ' + g.parts.length + '）');
ok(g.parts.every(p => p.color === '#f8d048'), '④ 粒子全为金色 #f8d048');
sb.puzzleSolved(sh.idx); // 重复调用（防御）
ok(g.coins === 5 && g.parts.length === 24, '④ 重复调用不重复发奖');

/* ---------- ui 注入兼容：已解神龛从 localStorage 注入后不重复结算 ---------- */
g.solvedPuzzles = { '1': true }; g.coins = 100;
sb.puzzleSolved(1);
ok(g.coins === 100, '④ ui 注入已解状态后 puzzleSolved(1) 幂等跳过');

/* ---------- ⑤ loadLevel 复位 ---------- */
sb.loadLevel(fakeIdx, false);
g = sb.game;
ok(g.puzzleActive === false && g.puzzleNear === -1 && Object.keys(g.solvedPuzzles).length === 0,
  '⑤ loadLevel 重置 puzzleActive/puzzleNear/solvedPuzzles（实际 ' + g.puzzleActive + '/' + g.puzzleNear + '/' + JSON.stringify(g.solvedPuzzles) + '）');

/* ---------- 合成关卡期间真实七关不受污染（LEVELS 长度供人工核对，回归由 gate 覆盖） ---------- */
console.log(failed ? ('冒烟失败: ' + failed + ' 项') : 'v4 谜题神龛引擎冒烟全部通过（LEVELS.length=' + sb.LEVELS.length + '，含 1 合成关）');
process.exit(failed ? 1 : 0);
