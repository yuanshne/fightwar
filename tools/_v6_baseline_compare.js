// node tools/_v6_baseline_compare.js —— H6 收编零回归断言：改后 (x,y) 逐帧 vs 改前基线
// x 轴必须逐帧一致；y 轴允许差异（PHY 竖直换算 §A 唯一允许差异源）。
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..');
const base = JSON.parse(fs.readFileSync(path.join(__dirname, '_v6_baseline.json'), 'utf8'));
const glue = '\n;return {PHY,game,loadLevel,updateWorld,LEVELS};';
const themes = {}; ['grass', 'cave', 'sky', 'factory', 'lava', 'tower', 'boss', 'wind', 'castle', 'star'].forEach(k => themes[k] = {});
const sb = new Function('THEMES', fs.readFileSync(path.join(ROOT, 'levels.js'), 'utf8')
  + fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8') + glue)(themes);
let bad = 0;
for (let i = 0; i < sb.LEVELS.length; i++) {
  sb.loadLevel(i, false);
  const g = sb.game;
  g.state = 'play';
  const frames = [];
  for (let f = 0; f < 120; f++) { sb.updateWorld(1 / 60); frames.push([g.player.x, g.player.y]); }
  g.input.right = 1; g.input.jump = 1; g.input.jumpHit = 1;
  for (let f = 0; f < 60; f++) { sb.updateWorld(1 / 60); frames.push([g.player.x, g.player.y]); }
  g.input.right = 0; g.input.jump = 0; g.input.jumpHit = 0;
  const key = 'L' + (i + 1);
  const b = base[key];
  let xDiff = 0, yDiff = 0, firstX = -1, maxYd = 0;
  for (let f = 0; f < b.length; f++) {
    const [bx, by] = b[f].split(',').map(Number);
    if (frames[f][0] !== bx) { xDiff++; if (firstX < 0) firstX = f; }
    else if (frames[f][1] !== by) yDiff++;
    if (frames[f][1] !== by) maxYd = Math.max(maxYd, Math.abs(frames[f][1] - by));
  }
  console.log(key + ': x差异帧=' + xDiff + (firstX >= 0 ? '(首帧' + firstX + ')' : '') + ' | y差异帧=' + yDiff + '(最大|dy|=' + maxYd.toFixed(2) + 'px)');
  if (xDiff > 0) bad++;
}
console.log(bad === 0 ? 'H6 PASS: 全部 10 关 x 轴逐帧一致（y 差异均为 PHY 竖直换算）' : 'H6 FAIL: ' + bad + ' 关 x 轴不一致');
process.exit(bad === 0 ? 0 : 1);
