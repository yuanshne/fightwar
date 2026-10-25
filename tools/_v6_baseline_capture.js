// node tools/_v6_baseline_capture.js —— H6 对照基线捕获（改码前跑一次，存 JSON）
// 对 L1~L10：空转 120 帧 + 右移起跳 60 帧，逐帧记录玩家 (x,y)（精确到浮点全精度字符串）。
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..');
const glue = '\n;return {PHY,Level,game,loadLevel,respawn,killPlayer,levelClear,updateWorld,LEVELS};';
const themes = {}; ['grass', 'cave', 'sky', 'factory', 'lava', 'tower', 'boss', 'wind', 'castle', 'star'].forEach(k => themes[k] = {});
const sb = new Function('THEMES', fs.readFileSync(path.join(ROOT, 'levels.js'), 'utf8')
  + fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8') + glue)(themes);
const out = {};
for (let i = 0; i < sb.LEVELS.length; i++) {
  sb.loadLevel(i, false);
  const g = sb.game;
  g.state = 'play';
  const frames = [];
  for (let f = 0; f < 120; f++) { sb.updateWorld(1 / 60); frames.push(g.player.x + ',' + g.player.y); }
  g.input.right = 1; g.input.jump = 1; g.input.jumpHit = 1;
  for (let f = 0; f < 60; f++) { sb.updateWorld(1 / 60); frames.push(g.player.x + ',' + g.player.y); }
  g.input.right = 0; g.input.jump = 0; g.input.jumpHit = 0;
  out['L' + (i + 1)] = frames;
  console.log('L' + (i + 1) + ' captured: ' + frames.length + ' frames, end=(' + g.player.x + ',' + g.player.y + ') dead=' + g.player.dead);
}
fs.writeFileSync(path.join(__dirname, '_v6_baseline.json'), JSON.stringify(out));
console.log('baseline saved to tools/_v6_baseline.json');
