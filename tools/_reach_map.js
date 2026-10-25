// 临时：打印关卡局部 ASCII（排查求解器卡点）
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const themes = {};
['grass','cave','sky','factory','lava','tower','boss','wind','castle','star','sea','nether'].forEach(k => themes[k] = {});
let body = read('levels.js');
for (const f of ['chapter2.js', 'chapter3.js']) if (fs.existsSync(path.join(ROOT, f))) body += '\n' + read(f);
body += '\n;aggregateLevels();\n' + read('engine.js') + '\n;return {Level,ALL_LEVELS,game,loadLevel};';
const sb = new Function('THEMES', body)(themes);
const li = +process.argv[2] - 1, x0 = +process.argv[3], x1 = +process.argv[4];
sb.loadLevel(li, false);
const L = sb.game.level;
const tx0 = Math.max(0, Math.floor(x0 / 16)), tx1 = Math.min(L.w - 1, Math.floor(x1 / 16));
console.log('L' + (li + 1) + ' ' + L.meta.name + ' ' + L.w + 'x' + L.h + ' 列 ' + tx0 + '..' + tx1);
let head = '     ';
for (let x = tx0; x <= tx1; x++) head += (x % 10 === 0 ? String(Math.floor(x / 10) % 10) : ' ');
console.log(head);
let head2 = '     ';
for (let x = tx0; x <= tx1; x++) head2 += String(x % 10);
console.log(head2);
for (let y = 0; y < L.h; y++) {
  let row = String(y).padStart(3, ' ') + ' |';
  for (let x = tx0; x <= tx1; x++) row += L.tiles[y][x];
  console.log(row);
}
console.log('神龛', JSON.stringify(L.shrines), '终点', JSON.stringify(L.goal), '出生', JSON.stringify(L.spawn));
console.log('弹簧', JSON.stringify(L.springs.map(s => [s.x, s.y])), '平台', JSON.stringify(L.plats.map(p => [p.x, p.y])));
