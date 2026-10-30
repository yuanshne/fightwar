const fs=require('fs'),path=require('path'),ROOT=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const glue='\n;return {game,loadLevel,updateWorld,BAL,aggregateLevels,_engBossTable,_engBossHurt};';
const themes={};['grass','cave','sky','factory','lava','tower','boss','wind','castle','star','sea','nether','ember','aether','husk','maw','bell'].forEach(k=>themes[k]={});
const sb=new Function('THEMES',read('levels.js')+read('chapter2.js')+read('chapter3.js')+read('chapter4.js')+read('engine.js')+glue)(themes);
sb.aggregateLevels();
sb.loadLevel(23,false);
const g=sb.game; g.state='play'; g.paused=false; g.puzzleActive=false; g.bagActive=false; g.hitStop=0;
const b=g.boss,p=g.player;
p.x = b.x - 60; p.invT=9;
let last='';
const seen={};
for(let f=0;f<60*40;f++){
  for(const k of Object.keys(g.input)) if(typeof g.input[k]==='number') g.input[k]=0;
  sb.updateWorld(1/60);
  if(b.state!==last){
    const beats = sb._engBossTable(11).score.beats;
    console.log((f/60).toFixed(1)+'s  '+b.state.padEnd(12)+' scoreI='+b.scoreI+'  beats[scoreI]='+String(beats[b.scoreI])+'  → '+(beats[b.scoreI]===null?'**可伤害**':'免疫'));
    last=b.state;
  }
  seen[b.state]=(seen[b.state]||0)+1;
}
console.log('状态占帧',seen);
console.log('\n逐拍直接试伤害（5 点）：');
const beats=sb._engBossTable(11).score.beats;
for(let i=0;i<beats.length;i++){
  b.state = beats[i]===null?'rest':'recover'; b.scoreI=i;
  const h0=b.hpTotal;
  const ok=sb._engBossHurt(5,false);
  g.hitStop=0;
  console.log('  第'+i+'拍 '+(beats[i]===null?'[休止符]':beats[i]).padEnd(10)+' → 承伤'+(ok?(h0-b.hpTotal):'0')+'  (返回值 '+ok+')');
}
