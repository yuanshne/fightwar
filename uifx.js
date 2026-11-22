/* uifx.js — 独立后处理模块（纯 Canvas2D，自包含，不依赖 ui.js 内部符号）。
   暴露 window.PQFX；所有离屏 canvas / 渐变仅在首次创建并缓存。
   屏幕坐标系：384×224；光照掩膜为 192×112 半分辨率。 */
(function(){
  'use strict';
  var VW=384, VH=224, HW=192, HH=112;

  function _mkCanvas(w,h){
    var c=document.createElement('canvas');
    c.width=w; c.height=h;
    return c;
  }
  function _round(v){ return Math.round(v); }

  /* ---------- 主题分档 ---------- */
  var DARKNESS={
    grass:0.06, sky:0.06, wind:0.06,
    cave:0.22, factory:0.22, tower:0.22, star:0.22,
    lava:0.32, nether:0.32, boss:0.32
  };
  var DARK_THEMES={cave:1,factory:1,tower:1,star:1,lava:1,nether:1,boss:1};

  /* 主题色调：alpha 控制在 0.04~0.10，overlay 叠色 */
  var GRADES={
    grass:'rgba(255,204,120,0.060)',
    wind:'rgba(180,255,160,0.040)',
    sky:'rgba(150,210,255,0.045)',
    cave:'rgba(84,142,255,0.080)',
    factory:'rgba(255,170,80,0.050)',
    tower:'rgba(150,130,255,0.060)',
    lava:'rgba(255,96,40,0.085)',
    boss:'rgba(180,110,255,0.060)',
    nether:'rgba(96,255,150,0.070)',
    sea:'rgba(140,120,255,0.070)',
    mirror:'rgba(150,120,255,0.070)',
    abyss:'rgba(120,150,255,0.070)'
  };

  function _themeKey(game){
    var L=game&&game.level;
    if(!L)return '';
    if(L.meta&&L.meta.theme)return String(L.meta.theme);
    if(typeof L.theme==='string')return L.theme;
    if(game.meta&&game.meta.theme)return String(game.meta.theme);
    return '';
  }
  function _cam(game){
    var c=game&&game.cam;
    return { x:+((c&&c.x)||0)||0, y:+((c&&c.y)||0)||0 };
  }

  /* ---------- 光照：半分辨率遮罩 ---------- */
  var _maskCv=null, _maskCtx=null, _lightSpr=null;

  function _ensureLightMask(){
    if(_maskCv)return;
    _maskCv=_mkCanvas(HW,HH);
    _maskCtx=_maskCv.getContext('2d');
  }
  function _ensureLightSprite(){
    if(_lightSpr)return;
    _lightSpr=_mkCanvas(64,64);
    var g=_lightSpr.getContext('2d');
    var rg=g.createRadialGradient(32,32,1,32,32,32);
    rg.addColorStop(0,'rgba(0,0,0,1)');
    rg.addColorStop(0.45,'rgba(0,0,0,0.82)');
    rg.addColorStop(0.72,'rgba(0,0,0,0.32)');
    rg.addColorStop(1,'rgba(0,0,0,0)');
    g.fillStyle=rg;
    g.fillRect(0,0,64,64);
  }

  function renderLighting(ctx,game,tick){
    if(!ctx||!game)return;
    var L=game.level;
    if(!L)return;
    var key=_themeKey(game);
    var dark=+DARKNESS[key];
    if(!isFinite(dark))dark=0.16;
    var cam=_cam(game);
    tick=+tick||0;

    _ensureLightMask(); _ensureLightSprite();
    var o=_maskCtx;
    o.setTransform(1,0,0,1,0,0);
    o.globalCompositeOperation='source-over';
    o.globalAlpha=1;
    o.clearRect(0,0,HW,HH);
    o.fillStyle='rgba(3,6,14,'+dark+')';
    o.fillRect(0,0,HW,HH);

    o.globalCompositeOperation='destination-out';
    o.imageSmoothingEnabled=true;

    /* 屏幕坐标 → 半分辨率坐标；尺寸 r 的半分辨率直径恰好等于 r。 */
    function punch(sx,sy,r,a){
      if(!(r>0))return;
      if(sx<-r||sx>VW+r||sy<-r||sy>VH+r)return;
      if(a==null)a=1;
      o.globalAlpha=a;
      var d=r;
      o.drawImage(_lightSpr,sx*0.5-d*0.5,sy*0.5-d*0.5,d,d);
    }

    var p=game.player;
    if(p){
      var pw=+p.w||12, ph=+p.h||16;
      punch((+p.x||0)+pw*0.5-cam.x,(+p.y||0)+ph*0.5-cam.y,90,1);
    }

    var lts=L.lanterns, i, lt, lx, ly;
    if(lts&&lts.length){
      for(i=0;i<lts.length;i++){
        lt=lts[i]; if(!lt)continue;
        lx=(+lt.x||0)+(+lt.w||16)*0.5;
        ly=(+lt.y||0)+(+lt.h||24)*0.5;
        punch(lx-cam.x,ly-cam.y,120*(0.95+0.05*Math.sin(tick*0.11+i*1.7)),0.96);
      }
    }

    /* 可见 '~' 熔岩格：仅遍历视口内瓦片，最多 60 个光源 */
    var tiles=L.tiles, T=16, used=0;
    if(tiles&&tiles.length){
      var x0=Math.max(0,Math.floor(cam.x/T)-1);
      var x1=Math.min((L.tw||9999)-1,Math.ceil((cam.x+VW)/T)+1);
      var y0=Math.max(0,Math.floor(cam.y/T)-1);
      var y1=Math.min((L.th||tiles.length)-1,Math.ceil((cam.y+VH)/T)+1);
      for(var ty=y0;ty<=y1&&used<60;ty++){
        var row=tiles[ty]; if(!row)continue;
        for(var tx=x0;tx<=x1&&used<60;tx++){
          var c=(typeof row==='string')?row.charAt(tx):row[tx];
          if(c!=='~')continue;
          punch(tx*T+8-cam.x,ty*T+8-cam.y,36,0.9);
          used++;
        }
      }
    }

    if(DARK_THEMES[key]||(L.theme&&L.theme.dark===true)){
      var b=game.boss;
      if(b&&!b.dead&&b.state!=='dead'){
        var bw=+b.w||32, bh=+b.h||32;
        punch((+b.x||0)+bw*0.5-cam.x,(+b.y||0)+bh*0.5-cam.y,80,1);
      }
    }

    var bs=game.bullets;
    if(bs&&bs.length){
      var n=Math.min(bs.length,96);
      for(i=0;i<n;i++){
        var bl=bs[i]; if(!bl)continue;
        punch((+bl.x||0)+(+bl.w||8)*0.5-cam.x,(+bl.y||0)+(+bl.h||8)*0.5-cam.y,18,0.92);
      }
    }

    o.globalAlpha=1;
    o.globalCompositeOperation='source-over';

    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.globalCompositeOperation='source-over';
    ctx.globalAlpha=1;
    ctx.imageSmoothingEnabled=true;
    ctx.drawImage(_maskCv,0,0,VW,VH);
    ctx.restore();
  }

  /* ---------- 主题色调 ---------- */
  function renderColorGrade(ctx,game){
    if(!ctx||!game)return;
    var key=_themeKey(game);
    var col=GRADES[key];
    if(!col)return;
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.globalCompositeOperation='overlay';
    ctx.globalAlpha=1;
    ctx.fillStyle=col;
    ctx.fillRect(0,0,VW,VH);
    ctx.restore();
  }

  /* ---------- 前景视差层 ---------- */
  function renderForeground(ctx,bg,camX,camY,vw,vh){
    if(!ctx||!bg||!bg.fore)return;
    var cv=bg.fore;
    var W=+vw||VW, H=+vh||VH;
    var par=1.2;
    var tw=+cv.width||512, th=+cv.height||VH;
    if(tw<=0)return;
    var offX=(((+camX||0)*par)%tw+tw)%tw;
    var y=_round(-(+camY||0)*par*0.5);
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.imageSmoothingEnabled=false;
    for(var x=-offX;x<W;x+=tw)ctx.drawImage(cv,_round(x),y);
    ctx.restore();
  }

  /* ---------- 精灵 1px 描边（剪影缓存） ---------- */
  var _outlineCache=new WeakMap();

  function _silhouette(img,color){
    var m=_outlineCache.get(img);
    if(!m){ m=new Map(); _outlineCache.set(img,m); }
    var cv=m.get(color);
    if(cv)return cv;
    var w=(+img.width)||(+img.naturalWidth)||0;
    var h=(+img.height)||(+img.naturalHeight)||0;
    if(w<=0||h<=0)return null;
    cv=_mkCanvas(w,h);
    var g=cv.getContext('2d');
    g.imageSmoothingEnabled=false;
    g.drawImage(img,0,0,w,h);
    g.globalCompositeOperation='source-in';
    g.fillStyle=color;
    g.fillRect(0,0,w,h);
    m.set(color,cv);
    return cv;
  }

  function outlineSprite(ctx,img,x,y,color){
    if(!ctx||!img)return;
    var w=(+img.width)||(+img.naturalWidth)||0;
    var h=(+img.height)||(+img.naturalHeight)||0;
    if(w<=0||h<=0)return;
    var col=color||'#0a0a12';
    var sil=_silhouette(img,col);
    if(!sil)return;
    var dx=_round(x), dy=_round(y);
    ctx.save();
    ctx.imageSmoothingEnabled=false;
    for(var oy=-1;oy<=1;oy++){
      for(var ox=-1;ox<=1;ox++){
        if(ox===0&&oy===0)continue;
        ctx.drawImage(sil,dx+ox,dy+oy);
      }
    }
    ctx.drawImage(img,dx,dy);
    ctx.restore();
  }

  /* ---------- 可选：斜向光柱（默认关闭） ---------- */
  var _beamCache=new Map();
  function _beam(color){
    var cv=_beamCache.get(color);
    if(cv)return cv;
    var w=48,h=VH;
    cv=_mkCanvas(w,h);
    var g=cv.getContext('2d');
    var lg=g.createLinearGradient(0,0,w,0);
    lg.addColorStop(0,'rgba(255,255,255,0)');
    lg.addColorStop(0.5,'rgba(255,255,255,0.85)');
    lg.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=lg; g.fillRect(0,0,w,h);
    var vg=g.createLinearGradient(0,0,0,h);
    vg.addColorStop(0,'rgba(0,0,0,1)');
    vg.addColorStop(0.55,'rgba(0,0,0,0.45)');
    vg.addColorStop(1,'rgba(0,0,0,0)');
    g.globalCompositeOperation='destination-in';
    g.fillStyle=vg; g.fillRect(0,0,w,h);
    /* 主题色：在剪影内着色 */
    g.globalCompositeOperation='source-in';
    g.fillStyle=color; g.fillRect(0,0,w,h);
    g.globalCompositeOperation='source-over';
    _beamCache.set(color,cv);
    return cv;
  }

  function renderGodRays(ctx,game,tick){
    if(!ctx||!game)return;
    var key=_themeKey(game);
    if(key!=='cave'&&key!=='grass')return;
    var color=(key==='cave')?'rgba(150,220,255,1)':'rgba(255,240,190,1)';
    var cv=_beam(color);
    tick=+tick||0;
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.globalCompositeOperation='lighter';
    ctx.imageSmoothingEnabled=true;
    var xs=[64,196,300], base=(key==='cave'?0.10:0.07);
    for(var i=0;i<xs.length;i++){
      var sway=Math.sin(tick*0.008+i*2.1)*10;
      var a=base*(0.78+0.22*Math.sin(tick*0.013+i*1.3));
      if(a<=0)continue;
      ctx.save();
      ctx.globalAlpha=a;
      ctx.translate(xs[i]+sway,-18);
      ctx.rotate(0.30+i*0.035);
      ctx.drawImage(cv,0,0);
      ctx.restore();
    }
    ctx.restore();
  }

  window.PQFX={
    renderLighting:renderLighting,
    renderColorGrade:renderColorGrade,
    renderForeground:renderForeground,
    outlineSprite:outlineSprite,
    renderGodRays:renderGodRays,
    godRays:false /* 默认关闭；开启后仅 cave/grass 生效 */
  };
})();
