const BOT = require('./_v20_play_bot.js');
const sb = BOT.sb;
const idx = +(process.argv[2] || 20);
sb.loadLevel(idx, false);
const g = sb.game; g.state='play'; g.paused=false; g.puzzleActive=false; g.bagActive=false; g.hitStop=0;
const b = g.boss, p = g.player;
p.invT = 9e9;
const bot = BOT.thinkSmart, st = { lastX:-999, stuck:0 };
let atk=0, hits=0, dmg=0, lastHpB=b.hpTotal;
const hitWhen={};
for (let f=0; f<60*90; f++) {
  bot(g, st);
  const hpB=b.hpTotal;
  sb.updateWorld(1/60);
  if (p.atkCd<=0 && p.atkT>0 && p.atkT<0.06) atk++;   // 粗略出手计数
  if (b.hpTotal<hpB-0.01) { hits++; dmg+=hpB-b.hpTotal; hitWhen[b.state]=(hitWhen[b.state]||0)+1; }
  if (f%60===0) console.log((f/60).toFixed(0)+'s b',b.state.padEnd(11),'bhp',b.hpTotal.toFixed(0),'p',p.x.toFixed(0),'gap',Math.round(Math.abs(b.x+b.w/2-(p.x+p.w/2))-b.w/2-p.w/2),'onG',p.onGround?1:0,'atk',p.atkCd.toFixed(2));
}
console.log('hits',hits,'dmg',dmg,'| 命中发生在 Boss 状态:',hitWhen);
