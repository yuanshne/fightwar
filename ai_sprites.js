/* v34：AI 高精度角色/Boss 皮肤
 * 资源：assets/ai/processed/{hero_small,minion_small,minion_human,boss}.png
 * 主角 32×38；小怪按原精灵底边对齐（_aiFoot/_aiBaseW）；Boss 加呼吸、前摇、攻击前倾、
 * 冲刺残影、砸地冲击波、受击白闪与阶段光环。
 */
(function(){
  if(typeof window==='undefined'||typeof document==='undefined')return;
  var BASE='assets/ai/processed/';
  var hero=null,minionSmall=null,minionHuman=null,boss=null;
  var bossWhite=null,bossTints=[];
  var bossByKind={},bossWhiteByKind={};
  var aiBlue=null,skinWrapped=false;

  function make(w,h){var c=document.createElement('canvas');c.width=w;c.height=h;return c;}
  function ctx2(c){var g=c.getContext('2d');g.imageSmoothingEnabled=false;return g;}
  function load(name,cb){
    var im=new Image();
    im.onload=function(){try{cb(im);}catch(e){}};
    im.onerror=function(){};
    im.src=BASE+name+'?v=46';
  }
  function flip(img){
    var c=make(img.width,img.height),g=ctx2(c);
    g.translate(img.width,0);g.scale(-1,1);g.drawImage(img,0,0);
    return c;
  }
  function shift(img,dy){
    var c=make(img.width,img.height),g=ctx2(c);
    g.drawImage(img,0,dy);
    return c;
  }
  function tint(img,color,alpha){
    var c=make(img.width,img.height),g=ctx2(c);
    g.drawImage(img,0,0);
    g.globalCompositeOperation='source-atop';
    g.globalAlpha=alpha;g.fillStyle=color;g.fillRect(0,0,c.width,c.height);
    return c;
  }
  function tag(img,foot,baseW){img._aiEnemy=true;img._aiFoot=foot;img._aiBaseW=baseW;return img;}
  function firstFrame(v){return Array.isArray(v)?v[0]:v;}

  function heroFrames(){
    if(!hero||typeof SPR==='undefined')return null;
    var R=flip(hero);                 // 源图朝左，非 L 键翻转朝右
    var up=shift(R,-1),dn=shift(R,1);
    var L=hero, Lup=shift(L,-1), Ldn=shift(L,1);
    var gold=tint(R,'#ffd36a',0.34);
    var run=[R,up,R,dn,R,up];
    var runL=[L,Lup,L,Ldn,L,Lup];
    return {
      idle1:R,idle2:dn,run:run,jump:up,fall:dn,attack:R,dash:R,squash:R,
      dashWind:dn,attackGold:gold,
      idle1L:L,idle2L:Ldn,runL:runL,jumpL:Lup,fallL:Ldn,attackL:L,
      dashL:L,squashL:L,dashWindL:Ldn,attackGoldL:tint(L,'#ffd36a',0.34)
    };
  }

  function applyHero(){
    if(typeof SPR==='undefined')return;
    var f=heroFrames();if(!f)return;
    for(var k in f)SPR[k]=f[k];
    aiBlue=Object.freeze(f);
    try{if(SPR.skins)SPR.skins.blue=aiBlue;}catch(e){}
    wrapSkin();
  }

  // sprites_external.js 会重建 SPR.skins.blue；这里包一层，确保默认 blue 皮肤始终取 AI 帧。
  function wrapSkin(){
    if(skinWrapped||typeof window.getHeroSkin!=='function')return;
    var orig=window.getHeroSkin;
    window.getHeroSkin=function(id){
      if(aiBlue&&(id===undefined||id==='blue'))return aiBlue;
      return orig.apply(this,arguments);
    };
    skinWrapped=true;
  }

  function minionFrame(base,ow,oh,color,alpha){
    var tw=ow+4,th=oh+6;
    var c=make(tw,th),g=ctx2(c);
    var s=Math.min(tw/base.width,(th-1)/base.height);
    var w=Math.max(1,Math.round(base.width*s)),h=Math.max(1,Math.round(base.height*s));
    g.drawImage(base,Math.round((tw-w)/2),th-h,w,h);
    if(color){
      g.globalCompositeOperation='source-atop';
      g.globalAlpha=alpha;g.fillStyle=color;g.fillRect(0,0,tw,th);
    }
    return tag(c,oh,ow);
  }

  function applyEnemies(){
    if(!minionSmall||!minionHuman||typeof SPR==='undefined')return;
    var defs=[
      ['slime','small',null,0],
      ['spitter','small','#57d68a',0.30],
      ['beetle','small','#57d68a',0.30],
      ['knight','human',null,0],
      ['lancer','human','#b45cff',0.30],
      ['mage','human','#b45cff',0.30],
      ['hopper','human','#58b8ff',0.30]
    ];
    for(var i=0;i<defs.length;i++){
      var key=defs[i][0],kind=defs[i][1],color=defs[i][2],alpha=defs[i][3];
      var old=SPR[key];if(!old)continue;
      var ff=firstFrame(old);if(!ff)continue;
      var base=kind==='human'?minionHuman:minionSmall;
      var f0=minionFrame(base,ff.width,ff.height,color,alpha);
      SPR[key]=[f0,shift(f0,-1)];
    }
    // 施法/举盾等姿态键若存在，也换成 AI 魔兵，避免切姿态时跳回旧素材。
    var extras=['mageCast','knightGuard'];
    for(var j=0;j<extras.length;j++){
      var ek=extras[j],ev=SPR[ek];if(!ev)continue;
      var ef=firstFrame(ev);if(!ef)continue;
      var e0=minionFrame(minionHuman,ef.width,ef.height,'#b45cff',0.24);
      SPR[ek]=[e0,shift(e0,-1)];
    }
  }

  // 白剪影：仅对已绘制像素上色，保留原图 alpha（白闪用）。
  function makeBossWhite(img){
    if(!img)return null;
    var c=make(img.width,img.height),g=ctx2(c);
    g.drawImage(img,0,0);
    g.globalCompositeOperation='source-atop';
    g.fillStyle='#ffffff';g.fillRect(0,0,c.width,c.height);
    return c;
  }

  function buildBossAssets(){
    if(!boss)return;
    bossWhite=makeBossWhite(boss);
    bossTints=[
      boss,
      tint(boss,'#ff5a48',0.26),
      tint(boss,'#5c9cff',0.28),
      tint(boss,'#b45cff',0.26),
      tint(boss,'#ffd36a',0.24),
      tint(boss,'#57d68a',0.24)
    ];
  }

  // Boss 专属原画注入（boss_gallery.js 调用）；未注入的 kind 回退 bossTints。
  window.PQAI_SET_BOSS_IMAGE=function(kind,img){
    kind=+kind||0;
    bossByKind[kind]=img;
    bossWhiteByKind[kind]=makeBossWhite(img);
  };

  function _c01(v){v=+v;if(!isFinite(v))return 0;return v<0?0:(v>1?1:v);}
  function _h01(i,s){var x=Math.sin(i*127.1+s*311.7)*43758.5453;return x-Math.floor(x);}
  function _star(ctx,x,y,r,a){
    ctx.save();ctx.globalAlpha=a;ctx.fillStyle='#fff';ctx.beginPath();
    for(var i=0;i<8;i++){
      var an=i*0.785398-1.570796,rr=(i%2?r*0.38:r);
      var px=x+Math.cos(an)*rr,py=y+Math.sin(an)*rr;
      if(i)ctx.lineTo(px,py);else ctx.moveTo(px,py);
    }
    ctx.closePath();ctx.fill();ctx.restore();
  }

  // 每只 Boss 的 VFX 主色（1..14），避免全部走绿色。
  var BOSS_PAL=[
    null,
    {c:'#b45cff',c2:'#e6c8ff',rgb:'180,92,255'},   // 1 紫
    {c:'#38d8e0',c2:'#a8f6ff',rgb:'56,216,224'},   // 2 青
    {c:'#57d68a',c2:'#c8ffd8',rgb:'87,214,138'},   // 3 绿
    {c:'#7b8cff',c2:'#c0c8ff',rgb:'123,140,255'},  // 4 紫蓝
    {c:'#ffd36a',c2:'#fff0b8',rgb:'255,211,106'},  // 5 金
    {c:'#ff6a3c',c2:'#ffc098',rgb:'255,106,60'},   // 6 橙红
    {c:'#ff8a3c',c2:'#ffd8a8',rgb:'255,138,60'},   // 7 余烬橙
    {c:'#ffcf5a',c2:'#fff4c0',rgb:'255,207,90'},   // 8 金
    {c:'#6fe06a',c2:'#c8ffc0',rgb:'111,224,106'},  // 9 绿
    {c:'#a3202a',c2:'#ff7a6a',rgb:'163,32,42'},    // 10 暗红
    {c:'#c98a4b',c2:'#f0d0a0',rgb:'201,138,75'},   // 11 青铜
    {c:'#c9a0ff',c2:'#ffd36a',rgb:'201,160,255'},  // 12 紫金
    {c:'#a8c8ff',c2:'#ffffff',rgb:'168,200,255'},  // 13 银蓝
    {c:'#5a8cff',c2:'#a8d0ff',rgb:'90,140,255'}    // 14 幽蓝
  ];
  function _bossPal(kind){
    var k=Math.floor(Math.abs(+kind||1));
    if(!isFinite(k)||k<1||k>14)k=1;
    return BOSS_PAL[k];
  }
  // 招式分类：重击 / 冲锋 / 施法 / 召唤 / 咆哮 / 通用。
  var BOSS_CLS={
    heavy:{slam:1,hammer:1,hchain:1,quake:1,weight:1,crush:1,bite:1,push:1},
    charge:{charge:1,dash:1,leap:1,dive:1,march:1,swap:1},
    cast:{pillar:1,column:1,beam:1,nova:1,meteor:1,spike:1,homing:1,halo:1,
          prism:1,rain:1,flare:1,sear:1,breath:1,spew:1,focus:1,stare:1,
          fracture:1,cinder:1,furnace:1,burst:1},
    summon:{summon:1,spawn:1,hatch:1,swarm:1,clone:1,mirror:1},
    roar:{roar:1,quell:1,tutti:1,fermata:1,chime:1,pendulum:1}
  };
  function _bossClass(n){
    n=String(n||'').toLowerCase();
    if(!n)return 'generic';
    if(n==='heavy'||n==='charge'||n==='cast'||n==='summon'||n==='roar')return n;
    if(BOSS_CLS.heavy[n])return 'heavy';
    if(BOSS_CLS.charge[n])return 'charge';
    if(BOSS_CLS.cast[n])return 'cast';
    if(BOSS_CLS.summon[n])return 'summon';
    if(BOSS_CLS.roar[n])return 'roar';
    return 'generic';
  }
  // 各状态的近似时长：b.dur / staggerDur 优先，其余按招式类型取经验值。
  function _bossDur(b,ph,cls){
    var own=+b.dur;
    if(isFinite(own)&&own>0.05)return own;
    if(ph==='stagger'){
      var sd=+b.staggerDur;
      if(isFinite(sd)&&sd>0.1)return sd;
      return 1.4;
    }
    if(ph==='recover')return 0.5;
    if(ph==='windup'){
      return cls==='heavy'?0.62:cls==='charge'?0.55:cls==='cast'?0.60:
             cls==='summon'?0.65:cls==='roar'?0.70:0.55;
    }
    return cls==='heavy'?0.60:cls==='charge'?0.55:cls==='cast'?0.70:
           cls==='summon'?0.60:cls==='roar'?0.70:0.60;
  }
  // 各类招式的“爆发帧”定格姿态；收势按该姿态平滑回正。
  function _atkPose(cls){
    if(cls==='heavy')return {lean:0.24,sx:1.12,sy:0.82,dy:2};
    if(cls==='charge')return {lean:0.28,sx:1.14,sy:0.92,dy:0};
    if(cls==='cast')return {lean:0.06,sx:1.02,sy:1.02,dy:0};
    if(cls==='summon')return {lean:-0.06,sx:1.10,sy:1.01,dy:-2};
    if(cls==='roar')return {lean:0.20,sx:1.08,sy:0.96,dy:-1};
    return {lean:0.12,sx:1.04,sy:0.98,dy:0};
  }
  function _easeOut(t){t=_c01(t);return 1-Math.pow(1-t,3);}

  var visTick=0;
  function drawBoss(ctx,game,tick,b){
    if(!b||!boss)return false;
    visTick=(visTick+1)%1000000;
    var st=String(b.state||'rest');
    var nxt=String(b.next||'');
    var face=(+b.face<0)?-1:1;
    var W=96,H=110;
    var bw=+b.w;if(!isFinite(bw)||bw<=0)bw=48;
    var bh=+b.h;if(!isFinite(bh)||bh<=0)bh=48;
    var cx=Math.round((+b.x||0)+bw/2);
    var feet=Math.round((+b.y||0)+bh+3);
    // tick 兜底：外部 tick 缺失/冻结时用内部帧计数；b.t 缺失时用同一内部时钟推进，
    // 保证任何状态（含 dormant）都有可见运动，不依赖外部计时字段。
    var tk=+tick;if(!isFinite(tk))tk=visTick;tk=tk||0;
    var prevTK=+b._aiVTick;
    var dtSec=isFinite(prevTK)?((tk-prevTK)/60):(1/60);
    if(!isFinite(dtSec)||dtSec<=0||dtSec>0.25)dtSec=1/60;
    b._aiVTick=tk;
    var vt=((+b._aiVT||0)+dtSec);if(!isFinite(vt))vt=0;vt%=1000;b._aiVT=vt;
    var bt=+b.t,btOK=isFinite(bt)&&bt>=0;
    if(!btOK)bt=vt;
    var speed=Math.abs(+b.vx||0);if(!isFinite(speed))speed=0;
    var kindN=Math.floor(Math.abs(+b.kind||1));if(!isFinite(kindN)||kindN<1)kindN=1;
    // 另一 agent 会写 window.PQAI_BOSS_VIS_SCALE[kind]；有就乘到绘制尺度，缺表/非法值一律 1。
    var vis=1;
    try{
      var vm=window.PQAI_BOSS_VIS_SCALE;
      if(vm&&typeof vm==='object'){
        var vv=+vm[kindN];if(!isFinite(vv))vv=+vm[b.kind];
        if(isFinite(vv)&&vv>=0.2&&vv<=4)vis=vv;
      }
    }catch(e){}
    var Wd=W*vis,Hd=H*vis;
    var pal=_bossPal(kindN);

    // 状态分组：已知状态走各自关键帧；未命中时按 b.next 归类，避免未知状态退化成静态贴图。
    var isWind=(st==='windup'||st==='read');
    var isBlink=(st==='blinkCast'||st==='mirrorCast');
    var isChargeSt=(st==='charge'||st==='dash'||st==='chargeRun'||st==='leapAir');
    var isCastSt=(st==='cast'||st==='barrageFire'||st==='summon'||st==='spawn'||/Cast$/.test(st));
    var isAtk=isChargeSt||isCastSt||st==='attack'||st==='slam';
    var isStag=(st==='stagger');
    var isRage=(st==='enrage'||st==='roar');
    var isRec=(st==='recover');
    var isIdle=(st==='dormant'||st==='idle'||st==='intro'||st==='rest'||st==='');
    var known=isWind||isAtk||isStag||isRage||isRec||isBlink||isIdle;
    if(!known&&nxt&&(_bossClass(nxt)!=='generic'||/^(slam|attack|charge|dash|leap|cast|summon|spawn|roar)$/i.test(nxt)))isAtk=true;
    if(!known&&!isAtk&&!isIdle)isIdle=true;
    var ph=isWind?'windup':isAtk?'attack':isStag?'stagger':isRage?'enrage':isRec?'recover':'rest';
    var clsKey=(isWind||isAtk||isRec)?(nxt||st):st;
    var cls=_bossClass(clsKey||nxt);
    var dur=_bossDur(b,ph,cls);if(!isFinite(dur)||dur<=0.05)dur=0.6;
    var u=_c01(bt/dur);
    if(!btOK)u=_c01((vt%dur)/dur);

    // 关键帧：前摇下蹲/上浮 → 爆发前扑/纵跳 → 收势回正。
    var bobAmp=1.4,bobRate=0.055,lean=0,sx=1,sy=1,dy=0,dx=0,hop=0,glow=0;
    var ap=_atkPose(cls);
    if(ph==='windup'){
      var wk=_easeOut(u),trem=0.03*Math.sin(tk*1.9);
      if(cls==='heavy'){sx=1+0.05*wk;sy=1-0.08*wk;dy=4*wk;lean=-0.14*wk;}
      else if(cls==='charge'){sx=1+0.10*wk;sy=1-0.14*wk;dy=6*wk;lean=-0.10*wk;}
      else if(cls==='cast'){sx=1-0.02*wk;sy=1+0.06*wk;dy=-5*wk;lean=-0.05*wk;}
      else if(cls==='summon'){sx=1+0.06*wk;sy=1+0.02*wk;dy=-2*wk;lean=-0.12*wk;}
      else if(cls==='roar'){sx=1+0.04*wk;sy=1+0.03*wk;dy=-1*wk;lean=-0.18*wk;}
      else{sx=1+0.02*wk;sy=1-0.02*wk;dy=2*wk;lean=-0.06*wk;}
      lean+=trem;glow=0.55+0.25*Math.sin(tk*0.22);bobRate=0.13;bobAmp=1.2;
    }else if(ph==='attack'){
      var ae=_easeOut(Math.min(1,u*1.7));
      lean=ap.lean*ae;sx=1+(ap.sx-1)*ae;sy=1+(ap.sy-1)*ae;dy=ap.dy*ae;
      if(cls==='charge'){dx=12*Math.sin(Math.PI*u);hop=-18*Math.sin(Math.PI*u);}
      glow=1;bobRate=0.09;bobAmp=1.1;
    }else if(ph==='recover'){
      var rr=Math.pow(1-u,1.4)*0.8;
      lean=ap.lean*rr;sx=1+(ap.sx-1)*rr;sy=1+(ap.sy-1)*rr;dy=ap.dy*rr;
      glow=0.2+0.3*(1-u);bobRate=0.045;bobAmp=1.0;
    }else if(ph==='stagger'){
      lean=0.16+Math.sin(tk*0.33)*0.03;sy=0.95;dy=3;bobRate=0.29;bobAmp=1.1;
    }else if(ph==='enrage'){
      sx=1+0.04*Math.sin(tk*0.08);sy=1+0.04*Math.sin(tk*0.08+1);
      lean=-0.02*Math.sin(tk*0.05);glow=0.9;bobRate=0.16;bobAmp=2.2;
    }else{ // rest / idle / dormant / intro：呼吸 ±2% + 1~2px 浮动 + 披风/龙气脉动
      var brw=vt*2.2,br=Math.sin(brw);
      sx=1+0.02*br;sy=1-0.02*br;
      lean=Math.sin(brw*0.5+1.1)*0.018;
      glow=0.22+0.16*(0.5+0.5*Math.sin(brw+0.6));
      bobRate=0.075;bobAmp=2.0;
    }

    var bob=Math.sin(tk*bobRate)*bobAmp;
    if(ph!=='enrage'&&ph!=='stagger')bob+=Math.sin(tk*0.031)*0.45;
    if(ph==='stagger')bob+=Math.sin(tk*0.5)*1.2;
    if(ph==='rest')bob=Math.sin(vt*2.2)*2.0; // dormant/idle：固定 ±2px 浮动，影子留在脚底

    var hidden=(isBlink&&b.hidden===true);
    var bodyA=hidden?0.12:1;
    var img=bossByKind[kindN]||bossByKind[b.kind]||(bossTints.length?bossTints[kindN%bossTints.length]:null)||boss;
    if(!img)return false;
    var white=bossWhiteByKind[kindN]||bossWhiteByKind[b.kind]||bossWhite;

    // 受击/命中：0.1s 抖动 + 白闪。b.flashT 由引擎写（0.06~0.2s），只在上升沿重置内部 0.1s 计时。
    var ht0=Math.max(+(b.flashT||0),+(b.hurtT||0));
    if(!isFinite(ht0))ht0=0;
    var flashSeen=+(b._aiFlashSeen||0);
    if(!isFinite(flashSeen))flashSeen=0;
    if(ht0>flashSeen+0.0001)b._aiHitT=0.1;
    b._aiFlashSeen=ht0;
    var hitT=+(b._aiHitT||0);if(!isFinite(hitT)||hitT<0)hitT=0;
    if(hitT>0){hitT=Math.max(0,hitT-dtSec);b._aiHitT=hitT;}
    var jit=hitT>0?Math.min(1,hitT/0.1):0;
    var impact=((cls==='heavy'||cls==='charge')&&ph==='attack'&&u>0.26&&u<0.40)?1:0;
    if(impact>jit)jit=impact*0.7;
    var jx=jit?Math.sin(tk*2.7)*2.0*jit:0;
    var jy=jit?Math.sin(tk*3.3+1.0)*1.4*jit:0;

    // 地面阴影（纵跳时收缩，保留原有脚底投影；只随 vis 缩放，不随呼吸/浮动漂移）
    var hopK=hop<0?Math.min(1,-hop/18):0;
    ctx.save();
    ctx.globalAlpha=0.36*bodyA*(1-0.35*hopK);
    ctx.fillStyle='#000';
    ctx.beginPath();
    ctx.ellipse(cx,feet,(W*0.30*vis+(ph==='enrage'?3:0))*(1-0.25*hopK),3.5*vis*(1-0.2*hopK),0,0,6.283);
    ctx.fill();
    ctx.restore();

    // 冲刺/冲锋 2 层残影；dormant/idle 也保留 2 层摆动的披风残影（让待机有可见动作）。
    var ghostN=((cls==='charge'&&ph==='attack')||speed>30)?2:(ph==='rest'&&!hidden?2:0);
    for(var gi=ghostN;gi>=1;gi--){
      var isIdleGhost=(ph==='rest');
      var goff=isIdleGhost?(Math.sin(vt*2.1+gi*0.9)*1.3+gi*1.5):gi*(isChargeSt?10:8);
      var gy=isIdleGhost?Math.sin(vt*1.7+gi*0.7)*1.5:0;
      ctx.save();
      ctx.globalAlpha=(isIdleGhost?(0.13/gi+0.03):(0.04+0.08/gi))*bodyA;
      ctx.translate(cx-face*goff*vis,feet+bob+gy);
      ctx.scale(face*vis,vis);
      ctx.rotate(lean*0.7+(isIdleGhost?Math.sin(vt*1.9+gi)*0.008:0));
      ctx.drawImage(img,-W/2,-H,W,H);
      ctx.restore();
    }
    // 镜像/闪烁未隐身：半透明残影
    if(isBlink&&!hidden){
      ctx.save();
      ctx.globalAlpha=0.26;
      ctx.translate(cx-face*11*vis,feet+bob);
      ctx.scale(face*vis,vis);ctx.rotate(lean);
      ctx.drawImage(img,-W/2,-H,W,H);
      ctx.restore();
    }

    // 本体：呼吸缩放、披风/残影双层摆动、状态姿态、受击白闪
    ctx.save();
    ctx.translate(cx+face*dx*vis+jx,feet+bob+dy*vis+hop*vis+jy);
    ctx.scale(face*vis,vis);
    ctx.rotate(lean);
    ctx.scale(sx,sy);
    ctx.globalAlpha=0.15*bodyA;
    ctx.drawImage(img,-W/2-2-Math.sin(vt*2.1+1.7)*2.2,-H+Math.sin(vt*1.7+0.5)*1.2,W,H);
    ctx.globalAlpha=0.07*bodyA;
    ctx.drawImage(img,-W/2-1+Math.sin(vt*1.6+2)*2.6,-H+Math.sin(vt*1.3+1.2)*1.6,W,H);
    ctx.globalAlpha=bodyA;
    ctx.drawImage(img,-W/2,-H,W,H);
    if((hitT>0||impact)&&white){
      ctx.globalAlpha=Math.min(0.8,(hitT>0?hitT/0.1*0.65:0)+impact*0.18)*bodyA;
      ctx.drawImage(white,-W/2,-H,W,H);
      ctx.globalAlpha=1;
    }
    ctx.restore();

    // 眼部龙气（按 Boss kind 上色，隐身时压暗；idle 下明暗呼吸）
    if(glow>0.02&&bodyA>0.2){
      var gA=glow*(0.86+0.14*Math.sin(vt*3.1));
      var gx=cx+face*10*vis,gy=feet+bob+dy*vis-Hd+22*vis;
      var grd=ctx.createRadialGradient(gx,gy,0,gx,gy,10*vis);
      grd.addColorStop(0,'rgba('+pal.rgb+','+(0.5*gA)+')');
      grd.addColorStop(1,'rgba('+pal.rgb+',0)');
      ctx.save();ctx.globalCompositeOperation='lighter';
      ctx.fillStyle=grd;ctx.fillRect(gx-12*vis,gy-12*vis,24*vis,24*vis);
      ctx.restore();
    }

    // ---- 招式专属特效（每帧几何 ≤12） ----
    if(bodyA>0.2){
      // 施法：面向侧旋转符文环 + 聚能球（攻击帧爆光）
      if(cls==='cast'&&(ph==='windup'||ph==='attack'||ph==='recover')){
        var ca=ph==='windup'?(0.35+0.45*u):ph==='attack'?1:(0.5*(1-u));
        var rpx=cx+face*(18+7*u)*vis,rpy=feet+bob+dy*vis-Hd*0.52;
        var rot=tk*0.07*(ph==='attack'?1.8:1);
        ctx.save();ctx.globalCompositeOperation='lighter';
        ctx.strokeStyle=pal.c;ctx.lineWidth=1.5;
        for(var ci=0;ci<2;ci++){
          ctx.globalAlpha=0.55*ca*(0.75+0.25*Math.sin(tk*0.3+ci));
          ctx.beginPath();ctx.arc(rpx,rpy,(10+ci*4)*vis,rot+ci*2.2,rot+ci*2.2+1.8);ctx.stroke();
        }
        ctx.fillStyle=pal.c2;
        for(var rt=0;rt<4;rt++){
          var ra=rot*1.35+rt*1.5708;
          ctx.globalAlpha=0.6*ca;
          ctx.fillRect(Math.round(rpx+Math.cos(ra)*15*vis)-1,Math.round(rpy+Math.sin(ra)*15*vis)-1,2,2);
        }
        var orb=ph==='attack'?(5+6*Math.sin(Math.PI*Math.min(1,u*1.15))):(2+3*u);
        var og=ctx.createRadialGradient(rpx,rpy,0,rpx,rpy,orb*2.1*vis);
        og.addColorStop(0,pal.c2);og.addColorStop(0.45,pal.c);
        og.addColorStop(1,'rgba('+pal.rgb+',0)');
        ctx.globalAlpha=0.85*ca;ctx.fillStyle=og;
        ctx.beginPath();ctx.arc(rpx,rpy,orb*2.1*vis,0,6.283);ctx.fill();
        ctx.restore();
      }
      // 召唤：脚下 2 圈反向旋转召唤阵 + 4 枚符文
      if(cls==='summon'&&(ph==='windup'||ph==='attack'||ph==='recover')){
        var sa=ph==='windup'?(0.3+0.5*u):ph==='attack'?0.95:(0.5*(1-u));
        ctx.save();ctx.globalCompositeOperation='lighter';
        ctx.strokeStyle=pal.c;ctx.lineWidth=1.6;
        for(var si=0;si<2;si++){
          var sr=(18+si*8)*vis;
          ctx.globalAlpha=0.55*sa;
          ctx.beginPath();
          ctx.ellipse(cx,feet+2,sr,sr*0.30,si?tk*0.035:-tk*0.035,
                      si?1.0:0,si?4.6:3.8);
          ctx.stroke();
        }
        ctx.fillStyle=pal.c2;
        for(var sj=0;sj<4;sj++){
          var ja=tk*0.05*(sj%2?1:-1)+sj*1.5708;
          ctx.globalAlpha=0.6*sa;
          ctx.fillRect(Math.round(cx+Math.cos(ja)*(22+(sj%2)*5)*vis)-1,
                       Math.round(feet+2+Math.sin(ja)*7*vis)-1,2,2);
        }
        ctx.restore();
      }
      // 咆哮：头部 2 圈声波 + 咽喉亮点
      if(cls==='roar'&&(ph==='windup'||ph==='attack'||ph==='enrage'||ph==='recover')){
        var roa=ph==='windup'?(0.3+0.5*u):ph==='attack'?1:(ph==='enrage'?0.8:0.5*(1-u));
        var rhy=feet+bob+dy*vis-Hd*0.80;
        ctx.save();ctx.globalCompositeOperation='lighter';
        ctx.strokeStyle=pal.c;ctx.lineWidth=2;
        for(var wi=0;wi<2;wi++){
          var wr=((bt*1.3+wi*0.5)%1);
          ctx.globalAlpha=0.45*roa*(1-wr);
          ctx.beginPath();ctx.arc(cx+face*5*vis,rhy,(8+22*wr)*vis,-1.15,1.15);ctx.stroke();
        }
        ctx.globalAlpha=0.5*roa;ctx.fillStyle=pal.c2;
        ctx.beginPath();ctx.arc(cx+face*5*vis,rhy,3*vis,0,6.283);ctx.fill();
        ctx.restore();
      }
      // 重击：u>0.35 时 2 圈地裂冲击波 + 4 块确定性碎屑
      if(cls==='heavy'&&ph==='attack'&&u>0.35){
        var hq=_c01((u-0.35)/0.65);
        ctx.save();ctx.globalCompositeOperation='lighter';
        for(var hi=0;hi<2;hi++){
          var hq2=_c01((hq-hi*0.20)/(1-hi*0.20));
          ctx.globalAlpha=0.42*(1-hq2);
          ctx.strokeStyle=hi?pal.c2:pal.c;
          ctx.lineWidth=2-hi*0.6;
          ctx.beginPath();
          ctx.ellipse(cx,feet,(24+58*hq2)*(1-hi*0.16)*vis,
                      (3+8*hq2)*(1-hi*0.16)*vis,0,0,6.283);
          ctx.stroke();
        }
        var hseed=(cx*0.37+feet*0.11)%97;
        ctx.fillStyle=pal.c2;
        for(var di=0;di<4;di++){
          var d1=_h01(di,hseed),d2=_h01(di+7,hseed),d3=_h01(di+13,hseed);
          var dbx=(d1<0.5?-1:1)*(10+d1*44)*hq*vis;
          var dby=-Math.sin(hq*3.14159)*(3+d2*7)*vis;
          ctx.globalAlpha=0.75*(1-hq);
          ctx.fillRect(Math.round(cx+dbx),Math.round(feet+dby),2+(d3>0.5?1:0),2+(d3>0.5?1:0));
        }
        ctx.restore();
      }
      // 冲锋：2 道速度线，强化贴地前冲读感
      if(cls==='charge'&&ph==='attack'){
        ctx.save();ctx.globalCompositeOperation='lighter';
        ctx.strokeStyle=pal.c;ctx.lineWidth=1.5;
        for(var spi=0;spi<2;spi++){
          ctx.globalAlpha=0.25+0.25*Math.sin(tk*0.4+spi);
          var spy=feet+bob-Hd*(0.35+spi*0.18);
          ctx.beginPath();
          ctx.moveTo(cx-face*(26+spi*5)*vis,spy);
          ctx.lineTo(cx-face*(46+spi*6)*vis,spy);
          ctx.stroke();
        }
        ctx.restore();
      }
      // 未知招式：保留原有前摇聚光/刀弧，按 kind 上色
      if(cls==='generic'&&(ph==='windup'||ph==='attack')){
        var gp=ph==='windup'?u:_c01((bt%0.65)/0.65);
        ctx.save();ctx.globalCompositeOperation='lighter';
        ctx.strokeStyle=pal.c;ctx.lineWidth=2;
        for(var ai=0;ai<2;ai++){
          var ar=(ph==='windup'?(26-9*gp+ai*6):(18+16*gp+ai*7))*vis;
          var ax=cx+face*(16+ai*5)*vis,ay=feet+bob-Hd*0.55;
          ctx.globalAlpha=(ph==='windup'?(0.25+0.4*(1-gp)):(0.65*(1-gp)+0.10))
                          *(0.8+0.2*Math.sin(tk*0.3+ai));
          ctx.beginPath();ctx.arc(ax,ay,ar,-1.35+ai*0.16,0.72+ai*0.16);ctx.stroke();
        }
        ctx.restore();
      }
    }

    // 破绽：头顶 3 颗旋转白星
    if(isStag){
      var hy=feet+bob-Hd*0.96;
      for(var si=0;si<3;si++){
        var an=tk*0.09+si*2.094;
        _star(ctx,cx+Math.cos(an)*13*vis,hy+Math.sin(an)*4*vis-8,3.2*vis,0.65+0.3*Math.sin(tk*0.25+si));
      }
    }

    // 狂暴/咆哮：红金径向光环 + 双圈冲击波
    if(isRage){
      var ey=feet-42*vis,egr=(60+6*Math.sin(tk*0.2))*vis;
      var grd2=ctx.createRadialGradient(cx,ey,4,cx,ey,egr);
      grd2.addColorStop(0,'rgba(255,90,50,0.40)');
      grd2.addColorStop(0.55,'rgba(255,196,90,0.15)');
      grd2.addColorStop(1,'rgba(255,196,90,0)');
      ctx.save();ctx.globalCompositeOperation='lighter';
      ctx.globalAlpha=0.55+0.25*Math.sin(tk*0.2);
      ctx.fillStyle=grd2;ctx.beginPath();ctx.arc(cx,ey,66*vis,0,6.283);ctx.fill();
      for(var qi=0;qi<2;qi++){
        var rq=(bt*0.9+qi*0.5)%1;
        ctx.globalAlpha=0.4*(1-rq);
        ctx.strokeStyle=qi?'#ffd36a':'#ff5a48';
        ctx.lineWidth=2;
        ctx.beginPath();ctx.ellipse(cx,feet,(26+54*rq)*vis,(4+9*rq)*vis,0,0,6.283);ctx.stroke();
      }
      ctx.restore();
    }
    return true;
  }

  function applyAll(){
    applyHero();
    applyEnemies();
    if(boss)window.PQAI_BOSS_DRAW=drawBoss;
  }

  load('hero_small.png',function(im){hero=im;window.PQAI_HERO_READY=true;applyHero();});
  load('minion_small.png',function(im){minionSmall=im;applyEnemies();});
  load('minion_human.png',function(im){minionHuman=im;applyEnemies();});
  load('boss.png',function(im){boss=im;buildBossAssets();window.PQAI_BOSS_DRAW=drawBoss;});
  // 三张角色素材到齐后置总就绪标志，sprites_external.js 会据此放弃 Kenney 覆盖。
  var markTimer=setInterval(function(){
    if(hero&&minionSmall&&minionHuman&&boss){window.PQAI_ART_READY=true;clearInterval(markTimer);}
  },100);
  // sprites_external.js 异步加载 Kenney 帧，可能之后覆盖；12 秒内每 500ms 压回一次 AI 帧。
  var tries=0;
  var timer=setInterval(function(){
    applyAll();
    if(++tries>=24)clearInterval(timer);
  },500);
})();
