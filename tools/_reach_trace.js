// 临时：单宏逐帧轨迹（排查求解器卡点）
'use strict';
const R = require('./reach.js');
const sb = R.buildSandbox();
const li = +process.argv[2] - 1, X = +process.argv[3], Y = +process.argv[4], TAG = process.argv[5] || 'walk1';
sb.loadLevel(li, false);
R.makeCtx(sb);
const g = sb.game, p = g.player;
p.x = X; p.y = Y; p.vx = 0; p.vy = 0; p.onGround = true; p.face = 1;
const mac = R.buildMacros().find(m => m.tag === TAG);
if (!mac) { console.log('no macro', TAG); process.exit(1); }
const inp = g.input;
for (let f = 0; f < mac.fr.length; f++) {
  const d = mac.fr[f];
  inp.left = d.dir < 0 ? 1 : 0; inp.right = d.dir > 0 ? 1 : 0;
  inp.jump = d.jump; inp.jumpHit = d.jumpHit; inp.dash = d.dashHit; inp.dashHit = d.dashHit;
  inp.attack = 0; inp.attackHit = 0; inp.down = 0;
  sb.updateWorld(1 / 60); g.tick++;
  console.log(String(f).padStart(3) + ' x=' + p.x.toFixed(1) + ' y=' + p.y.toFixed(1) +
    ' vx=' + p.vx.toFixed(1) + ' vy=' + p.vy.toFixed(1) +
    ' ground=' + (p.onGround ? 1 : 0) + ' hp=' + p.hp + ' dead=' + (p.dead ? 1 : 0));
  if (p.dead) break;
}
