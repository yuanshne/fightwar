// node tools/_v3_boss_idle_test.js —— 断言：L7 空转 180 帧玩家存活且 Boss 仍 dormant
const fs=require('fs'),path=require('path'),ROOT=path.join(__dirname,'..');
const glue='\n;return {PHY,Level,game,loadLevel,respawn,killPlayer,levelClear,updateWorld,LEVELS};';
const themes={};['grass','cave','sky','factory','lava','tower','boss'].forEach(k=>themes[k]={});
const sb=new Function('THEMES',fs.readFileSync(path.join(ROOT,'levels.js'),'utf8')
  +fs.readFileSync(path.join(ROOT,'engine.js'),'utf8')+glue)(themes);
sb.loadLevel(6,false); sb.game.state='play';
for(let f=0;f<180;f++) sb.updateWorld(1/60);
const g=sb.game;
console.assert(!g.player.dead&&g.player.hp===5&&g.boss&&g.boss.state==='dormant',
  'L7 空转违约: dead='+g.player.dead+' hp='+g.player.hp+' boss='+g.boss.state);
console.log('L7 空转180帧 OK: hp='+g.player.hp+' boss='+g.boss.state+' deaths='+g.deaths);
