// ============================================================
// ui.js —— 渲染 / 输入 / 音频 / 界面状态机 / 主循环
// 契约：只读 engine 的 game/Level 与 art 的 SPR/THEMES/buildThemeArt
// v2 增量（2026-10-24 任务书 P0+P1，引擎工程师）：
//   P0 修复：pressed 边沿改为「每个物理 step 之后」清空（挪入 while 循环），
//            高刷屏零步进渲染帧不再吞跳跃/攻击输入；
//   P1：攻击 J/X、冲刺 K/Shift 按键映射与边沿桥接；slash/dash/break/combo 四新音效；
//   渲染：落地 squash（landT 变换）、冲刺残影（0.04s×4 快照）、挥击弧光
//        （slashArc[3] 就位自动启用，此前程序化弧兜底）、连击 HUD 弹字、
//        heroRun 取帧按帧数自适应（3/6 帧）。
// v3 增量（2026-10-24-v3-boss-design §4/§5/§7/§8，界面队）：
//   技能 U/I/O 输入桥接；Boss 部件装配/星弹/流星/冲击波/掉落心渲染（§B）；
//   心形 HP、Boss 血条、技能栏+连斩充能（§C）；登场横幅/连斩白屏/nova 预警环（§D）；
//   选关 7 格、通关进致谢屏（§E）；roar/meteor/shield/ult/heart/hurt/bosshit 音效（§G）。
//   注：消费 engine v3 字段（game.boss/drops/meteors/waves/skills/flashT 等）与
//   art v3 SPR 键；v2 基线（未合入时）经 ||[] 与 SPR 存在性守卫照常运行 L1-L6。
// ============================================================
'use strict';
(function(){

const canvas=document.getElementById('game');
const ctx=canvas.getContext('2d');
ctx.imageSmoothingEnabled=false;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;

// ---------- 画布适配 ----------
function fitScreen(){
  const fs=Math.min(innerWidth/VIEW_W,(innerHeight-26)/VIEW_H);
  const s=fs<1?fs:Math.max(1,Math.floor(fs));
  canvas.style.width=(VIEW_W*s)+'px';canvas.style.height=(VIEW_H*s)+'px';
}
addEventListener('resize',fitScreen);

// ---------- 输入 → game.input ----------
const KEYMAP={
  left:['ArrowLeft','KeyA'],right:['ArrowRight','KeyD'],
  jump:['ArrowUp','KeyW','Space'],down:['ArrowDown','KeyS'],
  up:['ArrowUp','KeyW'], // v3 §E2：选关上移键（hit('up') 依赖；新增行，不动既有键）
  attack:['KeyJ','KeyX'],dash:['KeyK','ShiftLeft','ShiftRight'], // v2 P1：攻击/冲刺
  skillU:['KeyU'],skillI:['KeyI'],skillO:['KeyO'], // v3 §A：技能三键（同 attack/dash 边沿模式，不动既有键）
  pause:['KeyP'],mute:['KeyM'],restart:['KeyR'],back:['Escape'],
  confirm:['Enter','Space','KeyW','ArrowUp']
};
const keys={},pressed={};
function kd(name){return KEYMAP[name].some(c=>keys[c]);}
function hit(name){return KEYMAP[name].some(c=>pressed[c]);}
addEventListener('keydown',e=>{
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  if(!keys[e.code])pressed[e.code]=true;
  keys[e.code]=true;audioUnlock();
  if(e.code==='KeyM'){toggleAudio();return;}
});
addEventListener('keyup',e=>{keys[e.code]=false;});
function clearPressed(){for(const k in pressed)pressed[k]=false;}

// ---------- 音频合成 ----------
let AC=null,masterGain=null,musicGain=null,sfxGain=null,audioOn=true,musicOn=true,musicTimer=null,musicStep=0;
try{audioOn=localStorage.getItem('pq_audio')!=='0';musicOn=localStorage.getItem('pq_music')!=='0';}catch(e){}
function audioUnlock(){
  if(AC)return;
  try{
    AC=new (window.AudioContext||window.webkitAudioContext)();
    masterGain=AC.createGain();masterGain.gain.value=audioOn?1:0;masterGain.connect(AC.destination);
    musicGain=AC.createGain();musicGain.gain.value=musicOn?0.5:0;musicGain.connect(masterGain);
    sfxGain=AC.createGain();sfxGain.gain.value=0.8;sfxGain.connect(masterGain);
    startMusic();
  }catch(e){AC=null;}
}
function toggleAudio(){audioOn=!audioOn;if(masterGain)masterGain.gain.value=audioOn?1:0;
  try{localStorage.setItem('pq_audio',audioOn?'1':'0');}catch(e){}}
function tone(o){
  if(!AC||!audioOn)return;
  const t0=AC.currentTime+(o.at||0);
  const osc=AC.createOscillator(),g=AC.createGain();
  osc.type=o.type||'square';
  osc.frequency.setValueAtTime(o.f,t0);
  if(o.f2)osc.frequency.exponentialRampToValueAtTime(Math.max(1,o.f2),t0+o.d);
  g.gain.setValueAtTime(0.0001,t0);
  g.gain.linearRampToValueAtTime(o.v||0.3,t0+0.005);
  g.gain.exponentialRampToValueAtTime(0.0001,t0+o.d);
  osc.connect(g);g.connect(o.music?musicGain:sfxGain);
  osc.start(t0);osc.stop(t0+o.d+0.02);
}
function noiseSfx(o){
  if(!AC||!audioOn)return;
  const t0=AC.currentTime,len=Math.floor(AC.sampleRate*o.d);
  const buf=AC.createBuffer(1,len,AC.sampleRate),data=buf.getChannelData(0);
  for(let i=0;i<len;i++)data[i]=(Math.random()*2-1)*(1-i/len);
  const src=AC.createBufferSource();src.buffer=buf;
  const g=AC.createGain();g.gain.value=o.v||0.25;
  src.connect(g);g.connect(sfxGain);src.start(t0);
}
const SFX={
  jump(){tone({f:220,f2:520,d:0.12,v:0.22});},
  coin(){tone({f:988,d:0.06,v:0.18});tone({f:1319,d:0.18,v:0.18,at:0.06});},
  gem(){[784,988,1319,1568].forEach((f,i)=>tone({f,d:0.1,v:0.16,at:i*0.05}));},
  stomp(){noiseSfx({d:0.12,v:0.3});tone({f:180,f2:80,d:0.12,v:0.2,type:'triangle'});},
  die(){tone({f:440,f2:110,d:0.5,v:0.25,type:'sawtooth'});noiseSfx({d:0.3,v:0.2});},
  spring(){tone({f:150,f2:700,d:0.18,v:0.25,type:'triangle'});},
  key(){[659,880,1175].forEach((f,i)=>tone({f,d:0.09,v:0.18,at:i*0.06}));},
  door(){tone({f:98,d:0.25,v:0.3,type:'triangle'});noiseSfx({d:0.2,v:0.18});},
  switch(){tone({f:660,d:0.05,v:0.2});tone({f:440,d:0.08,v:0.2,at:0.05});},
  crumble(){noiseSfx({d:0.25,v:0.25});},
  checkpoint(){[523,659,784].forEach((f,i)=>tone({f,d:0.12,v:0.2,at:i*0.07}));},
  clear(){[523,659,784,1047,784,1047,1319].forEach((f,i)=>tone({f,d:i===6?0.5:0.13,v:0.2,at:i*0.11}));},
  select(){tone({f:880,d:0.05,v:0.15});},
  land(){noiseSfx({d:0.05,v:0.12,fc:500});tone({f:120,d:0.05,v:0.1,type:'triangle'});},
  shot(){tone({f:330,f2:120,d:0.1,v:0.14,type:'sawtooth'});},
  // v2 P1 新增音效事件（engine 经 sfxQueue 推送）
  slash(){noiseSfx({d:0.07,v:0.18});tone({f:980,f2:320,d:0.09,v:0.15,type:'sawtooth'});}, // 挥击
  dash(){noiseSfx({d:0.16,v:0.22});tone({f:180,f2:640,d:0.18,v:0.16,type:'triangle'});}, // 冲刺
  break(){noiseSfx({d:0.14,v:0.3});tone({f:150,f2:55,d:0.12,v:0.22,type:'square'});},     // 碎砖/斩弹
  combo(){tone({f:784,d:0.06,v:0.16});tone({f:1046,d:0.09,v:0.16,at:0.06});},            // 连击
  // v3 §G 新增音效事件（engine 经 sfxQueue 推送）
  roar(){tone({f:90,f2:45,d:0.5,v:0.35,type:'sawtooth'});noiseSfx({d:0.35,v:0.25});},
  meteor(){tone({f:1200,f2:200,d:0.25,v:0.2,type:'square'});noiseSfx({d:0.2,v:0.18});},
  shield(){[659,880,1319].forEach((f,i)=>tone({f,d:0.12,v:0.18,at:i*0.05,type:'triangle'}));},
  ult(){noiseSfx({d:0.4,v:0.35});[523,659,880,1047,1319].forEach((f,i)=>tone({f,d:0.1,v:0.2,at:i*0.04}));},
  heart(){tone({f:784,d:0.08,v:0.18,type:'triangle'});tone({f:1046,d:0.12,v:0.18,at:0.07,type:'triangle'});},
  hurt(){tone({f:220,f2:90,d:0.18,v:0.28,type:'square'});noiseSfx({d:0.1,v:0.2});},
  bosshit(){tone({f:150,f2:60,d:0.1,v:0.22,type:'square'});},
};
const MUSIC_LEAD=[440,523,659,0,587,659,784,0,659,523,440,0,494,587,494,0,
 440,523,659,0,587,659,784,0,880,784,659,523,587,494,440,0];
const MUSIC_BASS=[110,0,165,0,110,0,165,0,131,0,196,0,131,0,196,0,
 110,0,165,0,110,0,165,0,147,0,110,0,165,0,110,0];
function startMusic(){
  if(musicTimer||!AC)return;
  const stepDur=0.155;let nextT=AC.currentTime+0.1;
  musicTimer=setInterval(()=>{
    if(!AC)return;
    while(nextT<AC.currentTime+0.35){
      const i=musicStep%MUSIC_LEAD.length;
      if(MUSIC_LEAD[i])tone({f:MUSIC_LEAD[i],d:stepDur*0.9,v:0.09,type:'square',music:true,at:nextT-AC.currentTime});
      if(MUSIC_BASS[i])tone({f:MUSIC_BASS[i],d:stepDur*1.6,v:0.15,type:'triangle',music:true,at:nextT-AC.currentTime});
      nextT+=stepDur;musicStep++;
    }
  },120);
}

// ---------- 进度存档 ----------
function loadProgress(){
  try{const p=JSON.parse(localStorage.getItem('pq_progress')||'');
    if(p&&typeof p.unlocked==='number'&&p.stars)return p;}catch(e){}
  return {unlocked:1,stars:{}};
}
function saveProgress(p){try{localStorage.setItem('pq_progress',JSON.stringify(p));}catch(e){}}
let progress=loadProgress();

// ---------- UI 状态 ----------
const q=new URLSearchParams(location.search);
const GOD=q.get('god')==='1';
let uiState='title',menuSel=0,fade=1,fadeDir=-1,hintT=0,lastLevelIdx=-1;
let clearStars=0,clearShown=0,creditsT=0; // v3 §E：致谢屏计时
// god 模式：吞掉击杀（调试用）
if(GOD&&typeof killPlayer==='function'){const orig=killPlayer;window.killPlayer=function(){};}

function startLevel(idx){
  loadLevel(idx,false);
  uiState='play';game.state='play';
  hintT=3.5;lastLevelIdx=idx;menuSel=idx;
  themeArt=buildThemeArt(LEVELS[idx].theme);
  fade=1;fadeDir=-1;
  // v2 P1：进关清残留输入锁存，防止上一状态的边沿在新关卡被缓冲触发
  game.input.jumpHit=0;game.input.attackHit=0;game.input.dashHit=0;
  game.input.skillUHit=0;game.input.skillIHit=0;game.input.skillOHit=0; // v3 §A：技能边沿同清，防 stale
  ghosts.length=0;comboPop=0;lastCombo=0;
}

// ---------- 渲染 ----------
let themeArt=null;
function px(v){return Math.round(v);}

function render(){
  const tick=game.tick;
  ctx.setTransform(1,0,0,1,0,0);
  // 摄像机（含震屏）
  let sx=0,sy=0;
  if(game.shake>0){sx=(Math.random()*2-1)*game.shake;sy=(Math.random()*2-1)*game.shake;}
  const camX=game.cam.x,camY=game.cam.y;
  const L=game.level,th=L?L.theme:THEMES.grass;

  if(uiState==='title'||uiState==='select'){renderMenu(th,tick);}
  else if(L){
    // 天空
    const grad=ctx.createLinearGradient(0,0,0,VIEW_H);
    grad.addColorStop(0,th.skyT);grad.addColorStop(1,th.skyB);
    ctx.fillStyle=grad;ctx.fillRect(0,0,VIEW_W,VIEW_H);
    // 视差
    drawParallax(themeArt.bg,camX,camY);
    ctx.save();
    ctx.translate(px(-camX+sx),px(-camY+sy));
    renderDecor(L,tick);
    renderTiles(L,tick);
    renderEntities(L,tick);
    renderBoss(tick); // v3 §B1：Boss 部件装配（renderEntities 后、renderPlayer 前）
    renderGhosts();   // v2 P1：冲刺残影（玩家之下层）
    renderPlayer(tick);
    renderSlash();    // v2 P1：挥击弧光（玩家之上层）
    renderParts();
    ctx.restore();
    renderHUD();
    renderIntro();  // v3 §D1：登场横幅（intro 态）
    renderFlash();  // v3 §D2：流星连斩全屏演出（flashT>0）
    if(hintT>0&&uiState==='play'){
      const a=Math.min(1,hintT);
      ctx.globalAlpha=a;
      drawCNText(L.meta.hint,VIEW_W/2,VIEW_H-42,11,'#ffffff','center');
      ctx.globalAlpha=1;
    }
    if(GOD)drawPixelText('GOD MODE',VIEW_W/2,VIEW_H-16,1,'#f8d020','center');
    if(game.paused)renderPause();
    if(uiState==='clear')renderClear(tick);
  }
  // 渐变遮罩
  if(fade>0){ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='rgba(0,0,0,'+clamp(fade,0,1)+')';ctx.fillRect(0,0,VIEW_W,VIEW_H);}
}

function drawParallax(bg,camX,camY){
  const layers=[[bg.far,0.25],[bg.near,0.5]];
  for(const[cv,par]of layers){
    const offX=((camX*par)%512+512)%512;
    const y=px(-camY*par*0.5);
    for(let x=-offX;x<VIEW_W;x+=512)ctx.drawImage(cv,px(x),y);
  }
}

function renderDecor(L,tick){
  for(const d of L.decor){
    const img=themeArt.decor[d.type];
    if(!img)continue;
    if(Array.isArray(img))ctx.drawImage(img[(tick*4|0)%img.length],px(d.x),px(d.y-img[0].height));
    else ctx.drawImage(img,px(d.x),px(d.y-img.height));
  }
}

function renderTiles(L,tick){
  const T=themeArt.tiles;
  const x0=Math.max(0,Math.floor(game.cam.x/16)),x1=Math.min(L.tw-1,Math.ceil((game.cam.x+VIEW_W)/16));
  const y0=Math.max(0,Math.floor(game.cam.y/16)),y1=Math.min(L.th-1,Math.ceil((game.cam.y+VIEW_H)/16));
  const lavaF=(tick*3|0)%2;
  const convOff=(tick*26|0)%16;
  for(let ty=y0;ty<=y1;ty++)for(let tx=x0;tx<=x1;tx++){
    const ch=L.tiles[ty][tx];
    if(ch==='.'||ch==='@'||ch==='P')continue;
    const dx=tx*16,dy=ty*16;
    switch(ch){
      case '#':{
        const above=ty>0?L.tiles[ty-1][tx]:'#';
        const cap=above!=='#'&&above!=='I';
        ctx.drawImage(cap?T.blockCap:T.block,dx,dy);break;}
      case 'I':ctx.drawImage(T.ice,dx,dy);break;
      case '=':ctx.drawImage(T.plank,dx,dy);break;
      case '^':ctx.drawImage(T.spikes,dx,dy);break;
      case 'v':ctx.drawImage(T.spikesD,dx,dy);break;
      case '~':ctx.drawImage(T.lava[lavaF],dx,dy);break;
      case 'a':case 'b':{
        const solid=(ch==='a')===(game.switchState===0);
        if(solid)ctx.drawImage(ch==='a'?T.toggleA:T.toggleB,dx,dy);
        else{ctx.globalAlpha=0.25;ctx.drawImage(ch==='a'?T.toggleA:T.toggleB,dx,dy);ctx.globalAlpha=1;}
        break;}
      case 'C':{
        const c=L.crumbles.get(tx+','+ty);
        if(!c)break;
        if(c.state===3)break;
        if(c.state===1)ctx.drawImage(T.crumble,dx+(tick*20|0)%2,dy);
        else if(c.state===2){ctx.globalAlpha=Math.max(0,1-c.t/1.2);
          ctx.drawImage(T.crumble,dx,px(dy+c.dy));ctx.globalAlpha=1;}
        else ctx.drawImage(T.crumble,dx,dy);
        break;}
      case 'D':{
        const below=ty<L.th-1?L.tiles[ty+1][tx]:'.';
        ctx.drawImage(below==='D'?T.door[0]:T.door[1],dx,dy);break;}
      case '(':case ')':{
        const img=ch==='('?T.convL:T.convR;
        const dir=ch==='('?-1:1;
        const off=dir>0?convOff:16-convOff;
        ctx.drawImage(img,dx-off,dy);ctx.drawImage(img,dx-off+16,dy);
        break;}
    }
  }
  // 门提示：持钥匙时门高亮
  if(game.keys>0){
    for(const k of L.doors.keys()){
      const[dx,dy]=k.split(',').map(Number);
      ctx.fillStyle='rgba(248,208,32,'+(0.4+0.3*Math.sin(tick*6))+')';
      ctx.fillRect(dx*16+6,dy*16+6,4,4);
    }
  }
}

function renderEntities(L,tick){
  // 弹簧
  for(const s of L.springs)ctx.drawImage(s.t>0?SPR.springX:SPR.springC,px(s.x),px(s.y-2));
  // 拉杆
  for(const lv of L.levers)ctx.drawImage(SPR.lever[game.switchState],px(lv.x-2),px(lv.y-2));
  // 检查点
  for(const c of L.checkpoints)ctx.drawImage(c.on?SPR.checkOn:SPR.checkOff,px(c.x),px(c.y+4));
  // 终点旗：旗杆 + 旗
  if(L.goal){
    const g=L.goal;
    ctx.fillStyle='#8a8a9a';ctx.fillRect(px(g.x+7),px(g.y),2,g.h);
    ctx.fillStyle='#5a5a6a';ctx.fillRect(px(g.x+4),px(g.y+g.h-3),8,3);
    ctx.drawImage(SPR.flag[(tick*3|0)%2],px(g.x-6),px(g.y+1));
  }
  // 金币/宝石/钥匙
  for(const c of L.coins){
    if(c.got)continue;
    if(c.key){ctx.drawImage(SPR.key,px(c.x),px(c.y+Math.sin(tick*3+c.t)*1.5));}
    else if(c.gem){ctx.save();ctx.globalAlpha=0.75+0.25*Math.sin(tick*5);
      ctx.drawImage(SPR.gem,px(c.x-1),px(c.y));ctx.restore();}
    else ctx.drawImage(SPR.coin[((tick*6|0)+((c.t*10)|0))%4],px(c.x),px(c.y));
  }
  // 移动平台
  for(const p of L.plats){
    ctx.fillStyle='#3a4050';ctx.fillRect(px(p.x),px(p.y),p.w,p.h);
    ctx.fillStyle='#585f70';ctx.fillRect(px(p.x),px(p.y),p.w,2);
    ctx.fillStyle='#20242c';ctx.fillRect(px(p.x),px(p.y+p.h-2),p.w,2);
    ctx.fillStyle='#f8b020';
    ctx.fillRect(px(p.x+4),px(p.y+3),2,2);ctx.fillRect(px(p.x+p.w-6),px(p.y+3),2,2);
  }
  // 电锯
  for(const s of L.saws)ctx.drawImage(SPR.saw[(tick*10|0)%2],px(s.x-8),px(s.y-8));
  // 大炮
  for(const c of L.cannons){
    ctx.drawImage(c.dir>0?SPR.cannon:SPR.cannonL,px(c.x),px(c.y));
    if(c.flash>0){ctx.fillStyle='#f8f8c8';ctx.fillRect(px(c.x+(c.dir>0?15:-3)),px(c.y+5),4,4);}
  }
  // 炮弹（v3 §B2：Boss 星弹 star=true 用 bossBullet 双帧；大炮弹 vy 未定义行为不变）
  for(const b of game.bullets)ctx.drawImage(b.star&&SPR.bossBullet?SPR.bossBullet[(game.tick*8|0)%2]:SPR.bullet,px(b.x),px(b.y));
  // 敌人
  for(const e of L.enemies){
    if(e.dead>0.6)continue;
    if(e.type==='slime'){
      if(e.dead>0)ctx.drawImage(SPR.slimeDead,px(e.x-1),px(e.y));
      else ctx.drawImage(SPR.slime[(tick*4|0)%2],px(e.x-1),px(e.y));
    }else{
      if(e.dead>0){ctx.globalAlpha=0.5;ctx.drawImage(SPR.bat[0],px(e.x),px(e.y));ctx.globalAlpha=1;}
      else ctx.drawImage(SPR.bat[(tick*8|0)%3],px(e.x),px(e.y));
    }
  }
  // v3 §B2：流星（delay>0 尚未落地不画；素材键以 art 工单为准，缺省跳过）
  for(const m of game.meteors||[]){
    if(m.delay>0)continue;
    if(SPR.meteor)ctx.drawImage(SPR.meteor[(game.tick*10|0)%2],px(m.x),px(m.y));
  }
  // v3 §B2：落地冲击波（vx<0 用翻转帧，翻转结果缓存一次）
  for(const w of game.waves||[]){
    if(!SPR.waveFx)continue;
    const img=SPR.waveFx[(game.tick*12|0)%2];
    ctx.drawImage(w.vx<0?flipCache(img):img,px(w.x-2),px(w.y));
  }
  // v3 §B2：掉落回复心（寿命最后 2s 闪烁）
  for(const d of game.drops||[]){
    if(!SPR.heartFull)continue;
    if(d.life<2&&game.tick%8<4)continue;
    ctx.drawImage(SPR.heartFull,px(d.x),px(d.y+Math.sin(game.tick*4)*1.5));
  }
}

// v3 §B2：翻转帧缓存——同一画布只 flipSprite 一次（冲击波/右臂共用）
const _flipCacheMap=new Map();
function flipCache(img){let f=_flipCacheMap.get(img);if(!f){f=flipSprite(img);_flipCacheMap.set(img,f);}return f;}

// v3 §B1：Boss 部件装配（renderEntities 后、renderPlayer 前调用）。
// 画序 body→armL/armR→jaw→eyes+瞳孔→core→白闪覆盖；状态偏移表 [bodyDy,armDy,jaw开?,eyeType]，
// eyeType：eye 普通眼 / rage 红眼 / dizzy 晕眼（不画瞳）/ dark 暗眼（alpha .5）。
function renderBoss(tick){
  const b=game.boss; if(!b||b.state==='dead')return;
  if(!SPR.boss)return; // 美术 v3 未合入兜底（合入序 art→engine→ui，正常不命中）
  const p=game.player,R=b.phase===2;                 // 换装组选择
  const B=R?SPR.boss.bodyRage:SPR.boss.body,A=R?SPR.boss.armRage:SPR.boss.arm,
        J=R?SPR.boss.jawRage:SPR.boss.jaw;
  // §D3 nova 预警环：Boss 中心扩张圆环，玩家可读的躲避提示（世界坐标，画在身体之下层）
  if(b.state==='novaCast'){
    ctx.strokeStyle='#f86030';
    ctx.globalAlpha=clamp(.6-.5*b.t,0,1);
    ctx.beginPath();ctx.arc(b.x+b.w/2,b.y+b.h/2,b.t*90,0,Math.PI*2);ctx.stroke();
    ctx.globalAlpha=1;
  }
  let dy=0,ad=14,jaw=0,eye='eye';                    // 默认 idle 行
  switch(b.state){
    case 'dormant': eye='dark';break;                                     // 0/14/闭/暗眼
    case 'windup':
      if(b.next==='leap'){dy=3;ad=6;jaw=1;}                               // +3/6/开/眼
      else if(b.next==='charge'){dy=2;ad=18;eye='rage';}                  // +2/18/闭/红眼
      else{ad=10;jaw=1;eye='rage';}                                       // barrage|nova: 0/10/开/红眼
      break;
    case 'leapAir': dy=-4;ad=0;jaw=1;break;                               // -4/0/开/眼
    case 'chargeRun': dy=1;ad=16;jaw=1;eye='rage';break;                  // +1/16/开/红眼
    case 'stagger': dy=5;ad=20;eye='dizzy';break;                         // +5/20/闭/晕眼
    case 'recover': dy=2;ad=16;break;                                     // +2/16/闭/眼
    case 'novaCast': dy=-2;ad=2;jaw=1;eye='rage';break;                   // -2/2/开/红眼
    case 'summonCast': ad=8;jaw=1;break;                                  // 0/8/开/眼
    case 'intro': case 'enrage': dy=-2;ad=4;jaw=1;eye='rage';break;       // -2/4/开/红眼
    case 'dying': dy=12;ad=12;jaw=1;eye='dizzy';break;                    // 随引擎 y 下沉 +12/12/开/晕眼
  }
  const baseA=(b.state==='dying'&&(tick%8<4))?0.5:1; // dying：(tick%8<4) 整体 alpha .5
  ctx.globalAlpha=baseA;
  ctx.drawImage(B[(tick*3|0)%B.length],px(b.x-6),px(b.y-2+dy));          // body（呼吸帧=B 慢周期取 0/1）
  ctx.drawImage(A,px(b.x-10),px(b.y+12+ad));                             // armL
  ctx.drawImage(flipCache(A),px(b.x+b.w-10),px(b.y+12+ad));              // armR=翻转帧
  ctx.drawImage(J[jaw?1:0],px(b.x+16),px(b.y+36));                       // jaw 闭/开
  const eyeImg=eye==='rage'?SPR.boss.eyeRage:eye==='dizzy'?SPR.boss.eyeDizzy:SPR.boss.eye;
  for(const ex0 of[b.x+8,b.x+b.w-20]){                                   // eyeL / eyeR
    ctx.globalAlpha=baseA*(eye==='dark'?0.5:1);
    ctx.drawImage(eyeImg,px(ex0),px(b.y+10));
    if(eye!=='dizzy'&&p&&SPR.boss.pupil){                                // 瞳孔 ±2px 追踪（晕眼不画瞳）
      const cx=ex0+6,cy=b.y+15;
      const ox=clamp((p.x-cx)/40,-1,1)*2,oy=clamp((p.y-cy)/40,-1,1)*2;
      ctx.drawImage(SPR.boss.pupil,px(cx-2+ox),px(cy-2+oy));
    }
  }
  ctx.globalAlpha=baseA;
  ctx.drawImage(SPR.boss.core[(tick*(R?10:6)|0)%SPR.boss.core.length],px(b.x+20),px(b.y+20)); // core 狂暴加倍
  if(b.flashT>0&&SPR.bossWhite){                                         // 白闪：同偏移再画一遍
    ctx.globalAlpha=baseA*clamp(b.flashT/0.12,0,1);
    const W=SPR.bossWhite;
    ctx.drawImage(W.body,px(b.x-6),px(b.y-2+dy));
    ctx.drawImage(W.arm,px(b.x-10),px(b.y+12+ad));
    ctx.drawImage(flipCache(W.arm),px(b.x+b.w-10),px(b.y+12+ad));
    ctx.drawImage(W.jaw,px(b.x+16),px(b.y+36)); // bossWhite.jaw=开口白剪影单张（art.js §C5，非数组）
  }
  ctx.globalAlpha=1;
}

// v2 P1：英雄姿态选择（渲染与残影快照共用）。heroAttack/heroDash/heroSquash 为 P2 画师
// 待交付键——就位前自动回退既有帧，取帧式按 SPR.heroRun.length 自适应（3 帧现状/6 帧 P2 均可）。
function heroPoseImg(tick){
  const p=game.player,faceL=p.face<0;
  let anim;
  if(!p.onGround)anim=p.vy<0?'jump':'fall';
  else anim=Math.abs(p.vx)>10?'run':'idle';
  let img;
  if(anim==='idle')img=(tick%40<38)?(faceL?SPR.heroIdle1L:SPR.heroIdle1):(faceL?SPR.heroIdle2L:SPR.heroIdle2);
  else if(anim==='run'){const fr=faceL?SPR.heroRunL:SPR.heroRun;img=fr[(p.animT*12|0)%fr.length];} // v2：6 帧取帧适配（animT*12%帧数）
  else if(anim==='jump')img=faceL?SPR.heroJumpL:SPR.heroJump;
  else img=faceL?SPR.heroFallL:SPR.heroFall;
  if(p.landT>0&&SPR.heroSquash)img=faceL?SPR.heroSquashL:SPR.heroSquash; // 落地压扁帧（P2 就位后生效）
  if(p.dashT>0&&SPR.heroDash)img=faceL?SPR.heroDashL:SPR.heroDash;       // 冲刺帧（P2 就位后生效）
  if(p.atkT>0&&SPR.heroAttack)img=faceL?SPR.heroAttackL:SPR.heroAttack; // 挥击帧优先级最高（P2 就位后生效）
  if(p.castT>0){ // v3 §C4：技能施法金色姿态（缺素材回退 heroAttack，同 v2 模式）
    const gold=faceL?SPR.heroAttackGoldL:SPR.heroAttackGold;
    if(gold)img=gold;
    else if(SPR.heroAttack)img=faceL?SPR.heroAttackL:SPR.heroAttack;
  }
  return img;
}

function renderPlayer(tick){
  const p=game.player;
  if(!p)return;
  if(p.dead){ // 死亡表现：旋转上抛渐隐（替代 v1 的 0.9s 完全隐形）
    const df=SPR.heroFall;
    ctx.save();
    ctx.translate(px(p.x-3)+df.width/2,px(p.y-2)+df.height-2);
    ctx.rotate(p.deadT*9);
    ctx.globalAlpha=clamp(1-p.deadT/0.85,0,1);
    ctx.drawImage(df,-df.width/2,-df.height);
    ctx.restore();
    return;
  }
  const img=heroPoseImg(tick);
  const blink=p.invT>0&&game.tick%6<3; // v3 §C4：受伤无敌隔帧隐藏（同心形 HP 节拍）
  if(!blink){
    if(p.landT>0){ // v2 P1：落地 squash——landT(0.15s) 内以脚底中心为锚 y 向压缩、x 微胀
      const k=clamp(p.landT/0.15,0,1);
      ctx.save();
      ctx.translate(px(p.x-3)+img.width/2,px(p.y-2)+img.height);
      ctx.scale(1+0.25*k,1-0.32*k);
      ctx.drawImage(img,-img.width/2,-img.height);
      ctx.restore();
    }else ctx.drawImage(img,px(p.x-3),px(p.y-2)); // 16×16 精灵相对 10×14 命中框的居中偏移
  }
  if(p.shieldT>0){ // v3 §C4：星光护盾金泡泡双圈
    ctx.strokeStyle='#f8d048';
    ctx.globalAlpha=0.5+0.3*Math.sin(tick*8);
    ctx.beginPath();ctx.arc(p.x+5,p.y+7,14,0,Math.PI*2);ctx.stroke();
    ctx.beginPath();ctx.arc(p.x+5,p.y+7,10,0,Math.PI*2);ctx.stroke();
    ctx.globalAlpha=1;
  }
}

// v2 P1：冲刺残影——0.04s 间隔记录姿态快照，0.16s 生命期=共 4 帧半透明剪影
function updateGhosts(dt){
  const p=game.player;
  for(let i=0;i<ghosts.length;i++)ghosts[i].t+=dt;
  while(ghosts.length&&ghosts[0].t>=0.16)ghosts.shift();
  if(p&&p.dashT>0&&uiState==='play'){
    ghostTick-=dt;
    if(ghostTick<=0){ghostTick=0.04;ghosts.push({img:heroPoseImg(game.tick),x:p.x-3,y:p.y-2,t:0});}
  }else ghostTick=0;
}
function renderGhosts(){
  for(const g of ghosts){
    ctx.globalAlpha=clamp(0.45*(1-g.t/0.16),0,1);
    ctx.drawImage(g.img,px(g.x),px(g.y));
  }
  ctx.globalAlpha=1;
}

// v2 P1：挥击弧光——画师 slashArc[3]（18×14 白→蓝渐隐）就位后自动启用，此前程序化弧兜底
function renderSlash(){
  const p=game.player;
  if(!p||!(p.atkT>0))return;
  const prog=clamp(1-p.atkT/0.12,0,1); // 判定框存在期 0.12s 内的进度 0→1
  ctx.save();
  ctx.translate(px(p.x+p.w/2+p.face*13),px(p.y+p.h/2));
  if(p.face<0)ctx.scale(-1,1);
  ctx.globalAlpha=clamp(0.9-prog*0.55,0,1);
  if(SPR.slashArc&&SPR.slashArc.length){
    const arc=SPR.slashArc;
    const img=arc[Math.min(arc.length-1,(prog*arc.length)|0)];
    ctx.drawImage(img,-img.width/2,-img.height/2);
  }else{
    ctx.strokeStyle=prog<0.5?'#ffffff':'#48d8e8';
    ctx.lineWidth=2;
    ctx.beginPath();
    ctx.arc(0,0,8+prog*6,-1.25+prog*1.5,0.45+prog*1.5);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha=1;
}

function renderParts(){
  for(const pt of game.parts){
    ctx.globalAlpha=clamp(pt.life*2,0,1);
    ctx.fillStyle=pt.color;
    ctx.fillRect(px(pt.x),px(pt.y),pt.size,pt.size);
  }
  ctx.globalAlpha=1;
}

function renderHUD(){
  const L=game.level;
  // 顶栏底
  ctx.fillStyle='rgba(10,10,18,0.45)';ctx.fillRect(0,0,VIEW_W,16);
  drawCNText(L.meta.name,5,3,10,'#f0f0f8');
  // 金币
  ctx.drawImage(SPR.coin[0],100,4);
  drawPixelText(game.coins+'/'+L.totalCoin,111,5,1,'#f8d020');
  // 钥匙
  if(game.keys>0||L.meta.theme==='cave'||L.meta.theme==='tower'){
    ctx.drawImage(SPR.key,158,5);
    drawPixelText('x'+game.keys,170,5,1,'#f8f0a0');
  }
  // 时间
  const t=Math.floor(game.time);
  const mm=String(Math.floor(t/60)),ss=String(t%60).padStart(2,'0');
  drawPixelText(mm+':'+ss,VIEW_W-6,5,1,game.time<=L.par?'#f0f0f8':'#f87858','right');
  // 死亡数
  if(game.deaths>0)drawPixelText('X '+game.deaths,VIEW_W-46,5,1,'#f87858','right');
  // v2 P1：连击弹字（n≥2 显示；2s 断档清零由引擎负责，弹跳动画由 comboPop 驱动）
  if(game.combo>=2){
    const pop=clamp(comboPop/0.3,0,1);
    const dy=pop>0?-Math.round(pop*3):0;
    const col=(game.tick%10<5)?'#f8d020':'#ffffff';
    drawPixelText('COMBO X'+game.combo,VIEW_W-6,24+dy,2,col,'right');
  }
  // v3 §C①：心形 HP ×5（顶栏下方；HP 系统随 engine v3 全局生效，缺字段/缺素材时整块跳过）
  const p=game.player;
  if(p&&typeof p.hp==='number'&&SPR.heartFull&&SPR.heartEmpty){
    for(let i=0;i<5;i++){
      if(p.invT>0&&game.tick%6<3)continue;               // 无敌闪烁：整排隔帧隐藏
      ctx.drawImage(i<p.hp?SPR.heartFull:SPR.heartEmpty,4+i*11,19);
    }
    if(p.hp<=2&&game.tick%30<15){ctx.strokeStyle='#f84848';ctx.strokeRect(2.5,17.5,58,11);} // 低血红框脉冲
  }
  // v3 §C②：Boss 血条（仅 boss 存在且非 dormant 显示）
  const b=game.boss;
  if(b&&b.state!=='dormant'){
    ctx.globalAlpha=b.state==='dying'?clamp(1-b.t/2.2,0,1):1; // dying：随 2.2s 渐隐
    ctx.fillStyle='rgba(10,10,18,.85)';ctx.fillRect(82,17,52,11);          // 名牌黑底
    drawCNText('星核巨兽',84,18,8,'#f8d048');
    ctx.fillStyle='rgba(10,10,18,.7)';ctx.fillRect(128,19,174,9);          // 条底
    const mx=b.maxHp||60,bw=clamp(172*b.hp/mx,0,172);
    ctx.fillStyle=b.phase===2?'#f84848':'#f8d048';                          // P2 变红
    ctx.fillRect(128,19,px(bw),9);
    ctx.fillStyle='#f0f0f8';ctx.fillRect(128+86,19,1,9);                    // 50% 刻度线
    if(b.flashT>0.09){ctx.fillStyle='#ffffff';ctx.fillRect(128,19,174,9);}  // 受击 2 帧整条白
    ctx.globalAlpha=1;
  }
  // v3 §C③：技能栏 3 槽（L1-L6 常显；CD 秒来自 game.skills，缺省视为就绪）
  const sk=game.skills||{u:0,i:0,o:0};
  const skDef=[['U',SPR.skU,8,sk.u],['I',SPR.skI,12,sk.i],['O',SPR.skO,20,sk.o]];
  for(let i=0;i<3;i++){
    const x=162+i*22,y=198;
    ctx.fillStyle='rgba(10,10,18,.55)';ctx.fillRect(x,y,16,16);
    ctx.strokeStyle='#4a4a5a';ctx.strokeRect(x+0.5,y+0.5,15,15);
    const letter=skDef[i][0],icon=skDef[i][1],max=skDef[i][2],cd=skDef[i][3];
    if(icon)ctx.drawImage(icon,x+2,y+2);
    drawPixelText(letter,x+11,y+9,1,'#f0f0f8');
    if(cd>0){ctx.fillStyle='rgba(0,0,0,.6)';ctx.fillRect(x,y,16,clamp(16*cd/max,0,16));} // CD 罩自顶向下回收
    else if(game.tick%20<10){ctx.strokeStyle='#f8d048';ctx.strokeRect(x+0.5,y+0.5,15,15);} // 就绪金色脉冲
  }
  for(let i=0;i<8;i++){ // O 槽连斩充能 8 点（min(combo,8) 点亮）
    ctx.fillStyle=i<Math.min(game.combo,8)?'#f8d048':'#3a3a4a';
    ctx.fillRect(234+i*4,206,2,2);
  }
  if(game.combo>=8&&sk.o<=0&&SPR.skO){ // 充能满且就绪：O 图标发亮描边
    ctx.strokeStyle='#fff8c8';ctx.strokeRect(162+2*22+1.5,198+1.5,13,13);
  }
}

// v3 §D1：登场横幅——intro 态上下黑边各 24px（前 8 帧滑入、最后 12 帧滑出，按 b.t 插值）
function renderIntro(){
  const b=game.boss;
  if(!b||b.state!=='intro')return;
  const IN=8/60,OUT=12/60,DUR=1.8; // intro 时长 108 帧=1.8s（设计 §2）
  const h=24*Math.min(clamp(b.t/IN,0,1),clamp((DUR-b.t)/OUT,0,1));
  ctx.fillStyle='rgba(0,0,0,.8)';
  ctx.fillRect(0,0,VIEW_W,px(h));ctx.fillRect(0,VIEW_H-px(h),VIEW_W,px(h));
  let bx=VIEW_W/2;
  if(b.t<0.3)bx+=Math.random()*4-2; // 名字打入抖动
  drawCNText('星核巨兽',bx,86,26,'#f8d048','center');
  drawPixelText('STARCORE BEHEMOTH',VIEW_W/2,120,1,'#f0f0f8','center');
}

// v3 §D2：流星连斩全屏演出——白屏渐隐 + 两条对角斩线随 flashT 衰减退场
function renderFlash(){
  const ft=game.flashT;
  if(!(ft>0))return;
  const k=clamp(ft/0.15,0,1);
  ctx.fillStyle='rgba(255,255,240,'+k+')';ctx.fillRect(0,0,VIEW_W,VIEW_H);
  ctx.save();
  ctx.globalAlpha=k;
  ctx.lineWidth=1+3*k; // lineWidth 4→1
  ctx.strokeStyle='#ffffff';ctx.beginPath();ctx.moveTo(0,54);ctx.lineTo(VIEW_W,170);ctx.stroke();
  ctx.strokeStyle='#f8d048';ctx.beginPath();ctx.moveTo(0,170);ctx.lineTo(VIEW_W,54);ctx.stroke();
  ctx.restore();
}

function renderPause(){
  ctx.fillStyle='rgba(8,8,16,0.7)';ctx.fillRect(0,0,VIEW_W,VIEW_H);
  drawCNText('暂停',VIEW_W/2,88,18,'#f0f0f8','center');
  drawPixelText('P: CONTINUE',VIEW_W/2,118,1,'#a0a0b8','center');
  drawPixelText('R: RESTART  ESC: MENU',VIEW_W/2,130,1,'#a0a0b8','center');
}

function renderClear(tick){
  clearShown+=1/60;
  const a=clamp(clearShown*2,0,0.88);
  ctx.fillStyle='rgba(8,8,20,'+a+')';ctx.fillRect(0,28,VIEW_W,150);
  if(clearShown>0.3){
    drawCNText('关卡完成！',VIEW_W/2,42,18,'#f8d020','center');
    const L=game.level;
    drawCNText('用时 '+Math.floor(game.time)+' 秒　金币 '+game.coins+'/'+L.totalCoin+'　阵亡 '+game.deaths,
      VIEW_W/2,72,11,'#f0f0f8','center');
    // 三颗星
    for(let i=0;i<3;i++){
      const on=clearStars>i;
      const x=VIEW_W/2-34+i*34;
      drawCNText(on?'★':'☆',x,92,22,on?'#f8d020':'#5a5a72','center');
    }
    if(clearShown>1){
      const blink=tick%50<32;
      if(blink)drawCNText(game.levelIdx<LEVELS.length-1?'回车 · 下一关　Esc · 选关':'回车 · 通关结算',
        VIEW_W/2,138,11,'#ffffff','center');
    }
  }
}

function renderMenu(th,tick){
  const grad=ctx.createLinearGradient(0,0,0,VIEW_H);
  grad.addColorStop(0,th.skyT);grad.addColorStop(1,th.skyB);
  ctx.fillStyle=grad;ctx.fillRect(0,0,VIEW_W,VIEW_H);
  if(!themeArt)themeArt=buildThemeArt('grass');
  drawParallax(themeArt.bg,tick*6,0);
  // 地面
  const T=themeArt.tiles;
  for(let x=0;x<VIEW_W;x+=16){ctx.drawImage(T.blockCap,x,VIEW_H-24);ctx.drawImage(T.block,x,VIEW_H-8);}
  if(uiState==='title'){
    const bob=Math.sin(tick*2)*3;
    drawCNText('像素勇者',VIEW_W/2,46+bob*0.4,34,'#ffffff','center');
    drawPixelText('PIXEL QUEST',VIEW_W/2,96,2,'#f8d020','center');
    ctx.drawImage(SPR.heroRun[(tick*8|0)%SPR.heroRun.length],VIEW_W/2-14,VIEW_H-46+bob); // v2：按帧数自适应（3/6 帧）
    if(tick%50<32)drawCNText('按 回车/空格 开始',VIEW_W/2,150,13,'#ffffff','center');
    drawPixelText('ARROWS/WASD MOVE  SPACE JUMP  M SOUND',VIEW_W/2,204,1,'#f0f0f8','center');
  }else{
    drawCNText('选择关卡',VIEW_W/2,18,16,'#ffffff','center');
    for(let i=0;i<LEVELS.length;i++){ // v3 §E1：3×3 网格 7 格（行高压缩 66→56）
      const col=i%3,row=Math.floor(i/3);
      const x=22+col*118,y=38+row*56;
      const locked=i+1>progress.unlocked;
      const sel=menuSel===i;
      ctx.fillStyle=sel?'rgba(248,208,32,0.9)':locked?'rgba(30,30,44,0.8)':'rgba(50,50,72,0.85)';
      ctx.fillRect(x,y,104,50);
      ctx.strokeStyle=sel?'#fff':'#2a2a3a';ctx.strokeRect(x+0.5,y+0.5,103,49);
      drawCNText(locked?'???':LEVELS[i].name,x+52,y+6,11,locked?'#5a5a72':'#f0f0f8','center');
      const st=progress.stars[i]||0;
      drawCNText(st?('★'.repeat(st)+'☆'.repeat(3-st)):'☆☆☆',x+52,y+26,13,locked?'#3a3a4a':'#f8d020','center');
      if(sel&&tick%40<24){ctx.fillStyle='#fff';ctx.fillRect(x-8,y+26,5,2);ctx.fillRect(x+107,y+26,5,2);}
    }
    drawCNText('←→↑↓ 选择　回车 进入　Esc 返回',VIEW_W/2,204,11,'#c0c0d0','center');
    const total=Object.values(progress.stars).reduce((a,b)=>a+b,0);
    drawPixelText('STARS '+total+'/21',VIEW_W/2,215,1,'#f8d020','center');
  }
}

function renderVictory(tick){
  ctx.fillStyle='rgba(8,8,20,0.85)';ctx.fillRect(0,0,VIEW_W,VIEW_H);
  drawCNText('～ 通关啦 ～',VIEW_W/2,60,26,'#f8d020','center');
  drawCNText('七关全通，星核巨兽已倒下！',VIEW_W/2,110,13,'#f0f0f8','center');
  const total=Object.values(progress.stars).reduce((a,b)=>a+b,0);
  drawPixelText('TOTAL STARS '+total+'/21',VIEW_W/2,140,1,'#f8d020','center');
  if(tick%50<32)drawCNText('回车 · 返回标题',VIEW_W/2,170,12,'#ffffff','center');
}

// v3 §E3：致谢屏——深空底 + 彩带粒子雨 + 滚动制作名单；回车（creditsT>1）回标题
const CREDITS_LINES=[ // [文案, 字号, 颜色]
  ['像素勇者',20,'#ffffff'],['PIXEL QUEST',11,'#f8d048'],['v3 · BOSS·星核巨兽',11,'#f0f0f8'],
  ['——',11,'#5a5a72'],
  ['企划·数值：GLM-5.3 设计师',11,'#c0c0d0'],['引擎：Flash 引擎队',11,'#c0c0d0'],
  ['关卡：Flash 关卡队',11,'#c0c0d0'],['美术：Flash 美术队',11,'#c0c0d0'],
  ['界面·音效：Flash 界面队',11,'#c0c0d0'],['——',11,'#5a5a72'],
  ['风格致敬：4399《冒险王》/ 闪翼双星',11,'#c0c0d0'],['——',11,'#5a5a72'],
  ['特别感谢：正在游玩的你！',13,'#f8d048'],
];
function renderCredits(tick){
  const g=ctx.createLinearGradient(0,0,0,VIEW_H); // 深空底
  g.addColorStop(0,'#141434');g.addColorStop(1,'#050510');
  ctx.fillStyle=g;ctx.fillRect(0,0,VIEW_W,VIEW_H);
  const cols=['#f8d048','#f86030','#48d8e8','#f0f0f8'];
  for(let i=0;i<60;i++){ // 彩带雨：60 条 4 色矩形，x 均布、y=(t*spd+i*37)%260
    const y=(creditsT*(30+(i%5)*14)+i*37)%260-18;
    ctx.fillStyle=cols[i%4];
    ctx.fillRect(px(i*(VIEW_W/60))+i%5,px(y),2,5);
  }
  const y0=230-creditsT*26; // 名单滚动：y 230 → -160
  for(let i=0;i<CREDITS_LINES.length;i++){
    drawCNText(CREDITS_LINES[i][0],VIEW_W/2,y0+i*26,CREDITS_LINES[i][1],CREDITS_LINES[i][2],'center');
  }
  if(tick%50<32)drawCNText('回车 · 返回标题',VIEW_W/2,206,11,'#ffffff','center'); // 底部常驻
}

// ---------- 状态机与主循环 ----------
let lastState='';
// v2 P1：冲刺残影快照（0.04s 间隔，共 4 帧半透明剪影）+ 连击弹字动画状态
const ghosts=[];let ghostTick=0,comboPop=0,lastCombo=0;
function step(dt){
  game.tick+=dt*60;
  fade=clamp(fade+fadeDir*dt*3,0,1);
  hintT-=dt;
  if(game.shake>0)game.shake=Math.max(0,game.shake-dt*18);

  // 输入桥接（持键直写；边沿锁存只在 play 且未暂停时写入——暂停/结算期不积累 stale 边沿）
  game.input.left=kd('left')?1:0;
  game.input.right=kd('right')?1:0;
  game.input.jump=kd('jump')?1:0;
  game.input.attack=kd('attack')?1:0;
  game.input.dash=kd('dash')?1:0;
  if(uiState==='play'&&!game.paused){
    if(hit('jump'))game.input.jumpHit=1;
    if(hit('attack'))game.input.attackHit=1;
    if(hit('dash'))game.input.dashHit=1;
    if(hit('skillU'))game.input.skillUHit=1;   // v3 §A：技能边沿（engine 写入消费）
    if(hit('skillI'))game.input.skillIHit=1;
    if(hit('skillO'))game.input.skillOHit=1;
  }

  // v2 P1：残影记录与连击弹字计时
  updateGhosts(dt);
  if(game.combo!==lastCombo){if(game.combo>lastCombo)comboPop=0.3;lastCombo=game.combo;}
  comboPop-=dt;

  if(uiState==='title'){
    if(hit('confirm')){SFX.select();uiState='select';fade=1;fadeDir=-1;}
  }else if(uiState==='select'){
    if(hit('right')){menuSel=Math.min(LEVELS.length-1,menuSel+1);SFX.select();} // v3 §E2：7 关边界
    if(hit('left')){menuSel=Math.max(0,menuSel-1);SFX.select();}
    if(hit('down')&&menuSel+3<LEVELS.length){menuSel+=3;SFX.select();} // v3 §E2：下移条件自适应
    if(hit('up')&&menuSel>=3){menuSel-=3;SFX.select();} // v3 §E2：补上移键（原缺）
    if(hit('confirm')){
      if(menuSel+1<=progress.unlocked){SFX.select();startLevel(menuSel);}
      else SFX.shot();
    }
    if(hit('back')){uiState='title';fade=1;fadeDir=-1;}
  }else if(uiState==='play'){
    if(hit('pause')){
      game.paused=!game.paused;SFX.select();
      if(game.paused){game.input.jumpHit=0;game.input.attackHit=0;game.input.dashHit=0; // 暂停瞬间的 stale 边沿不带入恢复后
        game.input.skillUHit=0;game.input.skillIHit=0;game.input.skillOHit=0;} // v3 §A：技能边沿同清
    }
    if(hit('restart')){startLevel(game.levelIdx);return;}
    if(hit('back')&&!game.paused){uiState='select';fade=1;fadeDir=-1;return;}
    if(!game.paused)updateWorld(dt);
  }else if(uiState==='clear'){
    game.clearT+=dt;
    if(hit('confirm')&&game.clearT>0.8){
      if(game.levelIdx<LEVELS.length-1){startLevel(game.levelIdx+1);}
      else{uiState='credits';creditsT=0;fade=1;fadeDir=-1;} // v3 §E3：L7 结算不再进 victory，进致谢屏
    }
    if(hit('back')){uiState='select';fade=1;fadeDir=-1;}
  }else if(uiState==='credits'){ // v3 §E3：致谢屏计时与退场
    creditsT+=dt;
    if(hit('confirm')&&creditsT>1){SFX.select();uiState='title';fade=1;fadeDir=-1;}
  }

  // 检测引擎置 clear
  if(game.state==='clear'&&lastState!=='clear'){
    uiState='clear';game.clearT=0;clearShown=0;
    clearStars=1+(game.coins>=game.level.totalCoin?1:0)+(game.time<=game.level.par?1:0);
    const k=game.levelIdx+'';
    progress.stars[k]=Math.max(progress.stars[k]||0,clearStars);
    progress.unlocked=Math.max(progress.unlocked,Math.min(LEVELS.length,game.levelIdx+2));
    saveProgress(progress);
  }
  if(game.state==='play'&&lastState==='clear'&&!fadeDir)fadeDir=-1;
  lastState=game.state;

  // 音效队列
  for(const name of game.sfxQueue){if(SFX[name])SFX[name]();}
  game.sfxQueue.length=0;
}

let acc=0,last=performance.now();
function frame(now){
  acc+=Math.min(0.1,(now-last)/1000);last=now;
  // P0 修复（任务书 2026-10-24-v2 §P0）：pressed 边沿只在真实跑过至少一个物理 step 之后清空。
  // 清空动作挪进 while 循环、逐 step 执行——零步进的渲染帧（高刷屏 acc<1/60）不再吞输入；
  // 一帧多 step 时第一步消费后即清，边沿只消费一次（不丢不重）。
  while(acc>=1/60){step(1/60);clearPressed();acc-=1/60;}
  render();
  if(uiState==='victory')renderVictory(game.tick);
  if(uiState==='credits')renderCredits(game.tick); // v3 §E3：致谢屏
  requestAnimationFrame(frame);
}

// ---------- 启动 ----------
function boot(){
  buildSprites();
  fitScreen();
  const lvl=q.get('level');
  if(lvl){
    const idx=clamp(parseInt(lvl)-1,0,LEVELS.length-1);
    startLevel(idx);
  }else{
    game.state='title';
  }
  requestAnimationFrame(frame);
}
if(document.readyState==='loading')addEventListener('DOMContentLoaded',boot);
else boot();

})();
