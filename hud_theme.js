/* hud_theme.js — 《造梦西游》风 HUD/面板绘制模块（纯 Canvas2D，自包含）。
   暴露 window.PQHUD：panel / button / title / comboBadge / hearts / seal。
   约定：384×224 屏幕坐标；所有云纹角花、玉牌底、心形、印章底在模块加载时
   一次性烘焙到离屏 canvas，绘制期只做 drawImage / fillText / 轻量描边，
   不创建 DOM、不新建渐变；字体测量结果按「字体+文本」缓存。
   坐标语义：panel/button/comboBadge/hearts/seal 的 x,y 均为左上角；
   title 的 x,y 为文字左上角（textBaseline='top'）。 */
(function(){
  'use strict';

  var FONT_FAMILY='"KaiTi","STKaiti","SimSun",serif';
  var CORNER=12, BTN_SLICE=6;

  /* ---------------- 配色：金 / 玉 / 朱砂 ---------------- */
  var ACCENTS={
    gold:    { main:'#e6bf62', sub:'#74d2b4', text:'#f8e8b6', grad:'rgba(230,191,98,' },
    jade:    { main:'#7fdcbc', sub:'#e6bf62', text:'#eafff5', grad:'rgba(127,220,188,' },
    cinnabar:{ main:'#d95548', sub:'#e6bf62', text:'#ffe6dc', grad:'rgba(217,85,72,' }
  };
  var JADE_LINE='#5fb99a';
  var INK_DARK='rgba(8,10,18,0.88)';

  /* ---------------- 基础工具 ---------------- */
  function _n(v,d){ v=+v; return isFinite(v)?v:d; }
  function _str(v){ return v==null?'':String(v); }
  function _clamp(v,a,b){ return v<a?a:(v>b?b:v); }
  function _r(v){ return Math.round(v); }
  function _font(size,bold){ return (bold?'bold ':'')+size+'px '+FONT_FAMILY; }

  function _mulAlpha(ctx,m){
    var a=+ctx.globalAlpha;
    if(!isFinite(a))a=1;
    ctx.globalAlpha=_clamp(a*m,0,1);
  }

  function _mkCanvas(w,h){
    if(typeof document==='undefined'||!document.createElement)return null;
    var c=document.createElement('canvas');
    c.width=w; c.height=h;
    return c;
  }
  function _mk(w,h){
    var c=_mkCanvas(w,h);
    if(!c)return null;
    var g=c.getContext('2d');
    if(!g)return null;
    g.imageSmoothingEnabled=false;
    return { c:c, g:g };
  }
  function _rng(seed){ // 确定性噪声，避免每次刷新纹理不同
    var a=seed>>>0;
    return function(){
      a=(a+0x6D2B79F5)>>>0;
      var t=a;
      t=Math.imul(t^(t>>>15),t|1);
      t^=(t+Math.imul(t^(t>>>7),t|61));
      return ((t^(t>>>14))>>>0)/4294967296;
    };
  }

  /* ---------------- 字体测量缓存 ---------------- */
  var _mcache=new Map();
  function _tw(ctx,text,size,bold){
    var f=_font(size,bold), k=f+'|'+text;
    var v=_mcache.get(k);
    if(v!=null)return v;
    v=0;
    try{
      ctx.save();
      ctx.font=f;
      v=+((ctx.measureText(text)||{}).width)||0;
      ctx.restore();
    }catch(e){ v=0; }
    if(!(v>0))v=_str(text).length*size*0.9;
    if(_mcache.size>512)_mcache.clear();
    _mcache.set(k,v);
    return v;
  }
  function _fit(ctx,text,maxW,size,minSize,bold){
    size=_r(size);
    if(maxW<=0)return minSize;
    while(size>minSize && _tw(ctx,text,size,bold)>maxW)size--;
    return size;
  }

  /* ---------------- 预烘焙素材 ---------------- */
  var _assets={ ok:false, corners:{}, btns:{} };

  function _bakeInk(){
    var o=_mk(64,64); if(!o)return null;
    var g=o.g;
    g.fillStyle='rgba(9,12,20,0.90)'; g.fillRect(0,0,64,64);
    var rg=g.createRadialGradient(16,10,2,16,10,54);
    rg.addColorStop(0,'rgba(84,108,146,0.16)');
    rg.addColorStop(0.55,'rgba(44,58,84,0.05)');
    rg.addColorStop(1,'rgba(2,4,8,0.18)');
    g.fillStyle=rg; g.fillRect(0,0,64,64);
    var rnd=_rng(20261122), i;
    for(i=0;i<46;i++){
      var x=(rnd()*64)|0, y=(rnd()*64)|0;
      g.fillStyle='rgba(170,190,220,'+(0.015+rnd()*0.04).toFixed(3)+')';
      g.fillRect(x,y,1,1);
    }
    var lg=g.createLinearGradient(0,0,0,64);
    lg.addColorStop(0,'rgba(255,255,255,0.05)');
    lg.addColorStop(0.22,'rgba(255,255,255,0)');
    lg.addColorStop(1,'rgba(0,0,0,0.20)');
    g.fillStyle=lg; g.fillRect(0,0,64,64);
    return o.c;
  }

  function _bakeCorner(acc){
    var a=ACCENTS[acc], o=_mk(CORNER,CORNER); if(!o)return null;
    var g=o.g;
    function p(x,y,w,h,col){ g.fillStyle=col; g.fillRect(x,y,w,h); }
    p(0,0,12,1,a.main); p(0,0,1,12,a.main);      // 外框转角
    p(2,2,8,1,a.main);                          // 回纹 / 云头
    p(9,2,1,5,a.main);
    p(5,6,5,1,a.main);
    p(5,4,1,3,a.main);
    p(7,4,2,1,a.main);
    p(2,8,2,1,a.sub);                           // 玉色点睛
    p(2,2,1,1,'rgba(255,255,255,0.55)');
    return o.c;
  }
  function _flip(src,fx,fy){
    var o=_mk(src.width,src.height); if(!o)return src;
    var g=o.g;
    g.translate(fx?src.width:0,fy?src.height:0);
    g.scale(fx?-1:1,fy?-1:1);
    g.drawImage(src,0,0);
    return o.c;
  }

  function _bakeBtn(state){
    var C={
      normal:  {base:'#193430',top:'#42705f',bot:'#08120f',rim:'#e2bd63',inner:'#6fd2b0',tick:'rgba(196,58,46,0.92)'},
      hover:   {base:'#245248',top:'#6bad91',bot:'#0a1a16',rim:'#f6d883',inner:'#9be8cd',tick:'rgba(226,80,62,0.95)'},
      active:  {base:'#10241f',top:'#2a4d43',bot:'#050c0a',rim:'#b89345',inner:'#4c9e86',tick:'rgba(150,44,36,0.9)'},
      disabled:{base:'#252a2c',top:'#3a4144',bot:'#0c0e0f',rim:'#6a6558',inner:'#525b5c',tick:'rgba(60,52,48,0.8)'}
    }[state];
    var o=_mk(24,24); if(!o)return null;
    var g=o.g;
    function path(){
      g.beginPath();
      g.moveTo(2,0); g.lineTo(22,0); g.lineTo(24,2); g.lineTo(24,22);
      g.lineTo(22,24); g.lineTo(2,24); g.lineTo(0,22); g.lineTo(0,2);
      g.closePath();
    }
    path();
    g.fillStyle=C.base; g.fill();
    g.save(); g.clip();
    g.fillStyle=C.top; g.fillRect(2,1,20,1);                 // 内侧上高光
    g.fillStyle='rgba(255,255,255,0.10)'; g.fillRect(2,2,20,2);
    g.fillStyle=C.bot; g.fillRect(2,22,20,2);                // 底部暗影
    g.fillStyle='rgba(0,0,0,0.28)'; g.fillRect(3,20,18,2);
    g.fillStyle='rgba(255,255,255,0.035)';                   // 玉牌细纹
    g.fillRect(6,8,12,1); g.fillRect(6,11,9,1); g.fillRect(8,14,8,1);
    g.restore();
    path();
    g.strokeStyle=C.rim; g.lineWidth=1; g.stroke();          // 金边
    g.save();
    g.globalAlpha=0.55; g.strokeStyle=C.inner;
    g.strokeRect(3.5,3.5,17,17);                             // 玉色内线
    g.restore();
    g.fillStyle=C.tick; g.fillRect(3,9,2,6);                 // 朱砂符纸签
    g.fillStyle=C.rim; g.fillRect(4,4,1,1); g.fillRect(19,4,1,1);
    return o.c;
  }

  function _bakeHeart(full){
    var o=_mk(9,8); if(!o)return null;
    var g=o.g;
    var rows=['..GG.GG..','.GRRGRRG.','GRRRRRRRG','GRRRRRRRG','.GRRRRRG.','..GRRRG..','...GRG...','....G....'];
    var G=full?'#f0c860':'#8a6c38';
    var R=full?'#c8362e':'#3a1418';
    var H=full?'rgba(255,150,128,0.95)':'rgba(90,32,38,0.9)';
    for(var y=0;y<rows.length;y++){
      var row=rows[y];
      for(var x=0;x<row.length;x++){
        var ch=row.charAt(x);
        if(ch==='.')continue;
        g.fillStyle=(ch==='G')?G:R;
        g.fillRect(x,y,1,1);
      }
    }
    g.fillStyle=H; g.fillRect(2,2,1,1); g.fillRect(3,2,1,1);
    return o.c;
  }

  function _bakeSeal(){
    var o=_mk(32,32); if(!o)return null;
    var g=o.g;
    g.fillStyle='rgba(178,42,36,0.96)'; g.fillRect(1,1,30,30);
    g.fillStyle='rgba(205,58,48,0.95)'; g.fillRect(2,2,28,28);
    g.save();
    g.globalAlpha=0.35; g.strokeStyle='#ffe0c4';
    g.strokeRect(4.5,4.5,23,23);
    g.restore();
    var rnd=_rng(7788), i;
    for(i=0;i<28;i++){                                       // 印泥斑驳
      g.fillStyle='rgba(255,230,200,'+(0.03+rnd()*0.05).toFixed(3)+')';
      g.fillRect((rnd()*28+2)|0,(rnd()*28+2)|0,1,1);
    }
    g.clearRect(1,1,2,2); g.clearRect(29,3,2,1);             // 残边缺口
    g.clearRect(3,29,1,2); g.clearRect(27,29,2,1);
    return o.c;
  }

  function _bakeCombo(){
    var o=_mk(24,14); if(!o)return null;
    var g=o.g;
    g.fillStyle='rgba(8,11,18,0.88)'; g.fillRect(0,0,24,14);
    g.strokeStyle='#c9a050'; g.lineWidth=1; g.strokeRect(0.5,0.5,23,13);
    g.fillStyle='rgba(232,192,100,0.28)'; g.fillRect(1,1,22,1);
    g.fillStyle='rgba(178,44,38,0.95)'; g.fillRect(2,10,1,2);
    return o.c;
  }
  function _bakeDragonTag(){
    var o=_mk(30,14); if(!o)return null;
    var g=o.g;
    g.fillStyle='rgba(24,18,8,0.88)'; g.fillRect(0,0,30,14);
    g.strokeStyle='#e6bf62'; g.lineWidth=1; g.strokeRect(0.5,0.5,29,13);
    g.fillStyle='rgba(255,214,104,0.20)'; g.fillRect(1,1,28,1);
    return o.c;
  }
  function _bakeDragon(){
    var o=_mk(12,12); if(!o)return null;
    var g=o.g;
    g.lineCap='round';
    g.shadowColor='rgba(255,196,72,0.85)'; g.shadowBlur=3;
    g.strokeStyle='#ffd76a'; g.lineWidth=1.4;
    g.beginPath(); g.arc(6.5,7,4,0.7,5.5); g.stroke();        // 龙身盘绕
    g.beginPath(); g.arc(8,5.5,1.6,0,4.7); g.stroke();
    g.beginPath(); g.moveTo(9.5,9); g.lineTo(11,11); g.stroke();
    g.shadowBlur=0;
    g.fillStyle='#fff0b0'; g.fillRect(9,2,2,2);              // 龙首
    return o.c;
  }

  function _bakeAll(){
    _assets.ok=false;
    if(typeof document==='undefined'||!document.createElement)return;
    try{
      _assets.ink=_bakeInk();
      ['gold','jade','cinnabar'].forEach(function(k){
        var base=_bakeCorner(k);
        if(!base)return;
        _assets.corners[k]=[
          base,
          _flip(base,true,false),
          _flip(base,true,true),
          _flip(base,false,true)
        ];
      });
      _assets.btns={
        normal:_bakeBtn('normal'),
        hover:_bakeBtn('hover'),
        active:_bakeBtn('active'),
        disabled:_bakeBtn('disabled')
      };
      _assets.heartFull=_bakeHeart(true);
      _assets.heartEmpty=_bakeHeart(false);
      _assets.seal=_bakeSeal();
      _assets.combo=_bakeCombo();
      _assets.dragonTag=_bakeDragonTag();
      _assets.dragon=_bakeDragon();
      _assets.ok=true;
    }catch(e){ _assets.ok=false; }
  }
  _bakeAll(); // 模块加载即烘焙；运行期零 createElement

  /* 九宫格拉伸：四角/四边保持 1:1，只有中心与边中段拉伸 */
  function _nine(ctx,img,dx,dy,dw,dh,s){
    var sw=img.width, sh=img.height;
    if(dw<2*s+1||dh<2*s+1){ ctx.drawImage(img,dx,dy,dw,dh); return; }
    var cw=dw-2*s, ch=dh-2*s, iw=sw-2*s, ih=sh-2*s;
    ctx.drawImage(img,0,0,s,s,dx,dy,s,s);
    ctx.drawImage(img,sw-s,0,s,s,dx+dw-s,dy,s,s);
    ctx.drawImage(img,0,sh-s,s,s,dx,dy+dh-s,s,s);
    ctx.drawImage(img,sw-s,sh-s,s,s,dx+dw-s,dy+dh-s,s,s);
    ctx.drawImage(img,s,0,iw,s,dx+s,dy,cw,s);
    ctx.drawImage(img,s,sh-s,iw,s,dx+s,dy+dh-s,cw,s);
    ctx.drawImage(img,0,s,s,ih,dx,dy+s,s,ch);
    ctx.drawImage(img,sw-s,s,s,ih,dx+dw-s,dy+s,s,ch);
    ctx.drawImage(img,s,s,iw,ih,dx+s,dy+s,cw,ch);
  }

  /* ---------------- 1. 面板 ---------------- */
  function panel(ctx,x,y,w,h,opts){
    if(!ctx)return;
    opts=opts||{};
    x=_n(x,0); y=_n(y,0); w=_n(w,0); h=_n(h,0);
    if(w<=0||h<=0)return;
    var acc=ACCENTS[opts.accent]?opts.accent:'gold';
    var a=ACCENTS[acc];
    var alpha=_clamp(_n(opts.alpha,0.86),0,1);
    ctx.save();
    _mulAlpha(ctx,alpha);
    ctx.imageSmoothingEnabled=false;

    /* 深墨底（预烘焙水墨纹理拉伸） */
    if(_assets.ok&&_assets.ink){
      ctx.drawImage(_assets.ink,x+1,y+1,Math.max(1,w-2),Math.max(1,h-2));
    }else{
      ctx.fillStyle=INK_DARK; ctx.fillRect(x,y,w,h);
    }

    /* 金/玉双线描边 */
    ctx.save();
    ctx.translate(0.5,0.5);
    ctx.strokeStyle=a.main; ctx.lineWidth=1;
    ctx.strokeRect(x,y,w-1,h-1);
    if(w>10&&h>10){
      var ga=ctx.globalAlpha;
      ctx.globalAlpha=ga*0.55;
      ctx.strokeStyle=a.sub;
      ctx.strokeRect(x+3,y+3,w-7,h-7);
      ctx.globalAlpha=ga;
    }
    ctx.restore();

    /* 四角云纹 / 回纹 */
    if(_assets.ok&&_assets.corners[acc]&&w>=CORNER*2&&h>=CORNER*2){
      var cc=_assets.corners[acc];
      ctx.drawImage(cc[0],x,y);
      ctx.drawImage(cc[1],x+w-CORNER,y);
      ctx.drawImage(cc[2],x+w-CORNER,y+h-CORNER);
      ctx.drawImage(cc[3],x,y+h-CORNER);
    }

    /* 可选标题带 */
    var t=_str(opts.title);
    if(t&&h>=20){
      var ts=_clamp(_r(Math.min(11,Math.max(8,h*0.40))),8,11);
      ts=_fit(ctx,t,Math.max(20,w-22),ts,7,true);
      var tw=_tw(ctx,t,ts,true), tx=x+9, ty=y+4;
      ctx.fillStyle='rgba(6,8,14,0.78)';
      ctx.fillRect(x+6,y+3,tw+8,ts+5);
      ctx.fillStyle=a.main;
      ctx.fillRect(x+6,y+3,2,ts+5);
      ctx.font=_font(ts,true); ctx.textAlign='left'; ctx.textBaseline='top';
      ctx.fillStyle='rgba(0,0,0,0.72)'; ctx.fillText(t,tx+1,ty+1);
      ctx.fillStyle=a.text; ctx.fillText(t,tx,ty);
    }
    ctx.restore();
  }

  /* ---------------- 2. 按钮 ---------------- */
  function button(ctx,x,y,w,h,label,state){
    if(!ctx)return;
    x=_n(x,0); y=_n(y,0); w=_n(w,0); h=_n(h,0);
    if(w<=0||h<=0)return;
    var st=(state==='hover'||state==='active'||state==='disabled')?state:'normal';
    var bx=_r(x), by=_r(y), bw=_r(w), bh=_r(h);
    if(bw<1||bh<1)return;
    ctx.save();
    ctx.imageSmoothingEnabled=false;
    if(st==='disabled')_mulAlpha(ctx,0.58);
    var img=_assets.ok&&_assets.btns[st];
    if(img){
      _nine(ctx,img,bx,by,bw,bh,BTN_SLICE);
    }else{
      ctx.fillStyle=(st==='disabled')?'#252a2c':'#193430';
      ctx.fillRect(bx,by,bw,bh);
      ctx.strokeStyle=(st==='hover')?'#f6d883':'#e2bd63';
      ctx.lineWidth=1; ctx.strokeRect(bx+0.5,by+0.5,bw-1,bh-1);
    }
    var txt=_str(label);
    if(txt){
      var size=Math.round(h*0.62);
      size=_clamp(size,6,11);
      size=_fit(ctx,txt,bw-10,size,6,true);
      var cx=bx+bw/2, cy=by+bh/2+(st==='active'?1:0);
      ctx.font=_font(size,true);
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillStyle='rgba(4,8,8,0.78)';
      ctx.fillText(txt,cx,cy+1);
      ctx.fillStyle=(st==='disabled')?'#8f9894':(st==='active'?'#e8d9a0':'#fff0c6');
      ctx.fillText(txt,cx,cy);
    }
    ctx.restore();
  }

  /* ---------------- 3. 标题 ---------------- */
  function title(ctx,text,x,y,size,opt,subtitle){
    if(!ctx)return;
    text=_str(text);
    if(!text)return;
    if(size&&typeof size==='object'){ opt=size; size=opt.size; }
    if(typeof opt==='boolean'){ opt={shadow:opt,subtitle:subtitle}; }
    else if(typeof opt==='string'){ opt={subtitle:opt}; }
    opt=opt||{};

    x=_n(x,0); y=_n(y,0);
    size=_clamp(_r(_n(size,12)),6,40);
    var align=opt.align||'left';
    var shadow=opt.shadow!==false;
    var main=opt.color||'#f6e2a6';
    var ink=opt.ink||'rgba(38,22,10,0.95)';
    var tw=_tw(ctx,text,size,true);

    ctx.save();
    ctx.imageSmoothingEnabled=false;
    ctx.font=_font(size,true);
    ctx.textAlign=align;
    ctx.textBaseline='top';

    if(shadow){
      ctx.fillStyle='rgba(5,7,11,0.62)';
      ctx.fillText(text,x+1,y+2);
    }
    ctx.lineJoin='round';
    ctx.lineWidth=(size>=14)?2:1;              // 金边/墨边 1~2px
    ctx.strokeStyle=ink;
    ctx.strokeText(text,x,y);
    ctx.fillStyle=main;
    ctx.fillText(text,x,y);

    if(opt.rule!==false&&size>=10){
      var lx=x, lw=Math.max(12,tw);
      if(align==='center')lx=x-tw/2;
      else if(align==='right')lx=x-tw;
      ctx.fillStyle='rgba(230,191,98,0.55)';
      ctx.fillRect(_r(lx),y+size+2,_r(lw),1);
      ctx.fillStyle='rgba(255,244,210,0.35)';
      ctx.fillRect(_r(lx),y+size+3,_r(lw*0.55),1);
    }

    var sub=_str(opt.subtitle);
    if(sub){
      var ss=_clamp(_r(size*0.55),7,12);
      ctx.font=_font(ss,false);
      ctx.fillStyle='rgba(5,7,11,0.65)';
      ctx.fillText(sub,x+1,y+size+5);
      ctx.fillStyle=opt.subColor||'#c2d6c9';
      ctx.fillText(sub,x,y+size+4);
    }
    ctx.restore();
  }

  /* ---------------- 4. 连击徽标 ---------------- */
  function comboBadge(ctx,x,y,combo,ready){
    if(!ctx)return;
    combo=Math.floor(_n(combo,0));
    if(combo<=0)return;
    x=_r(_n(x,0)); y=_r(_n(y,0));
    var n=_str(combo).slice(0,4);
    ctx.save();
    ctx.imageSmoothingEnabled=false;

    if(_assets.ok&&_assets.combo)ctx.drawImage(_assets.combo,x,y);
    else{
      ctx.fillStyle='rgba(8,11,18,0.88)'; ctx.fillRect(x,y,24,14);
      ctx.strokeStyle='#c9a050'; ctx.lineWidth=1;
      ctx.strokeRect(x+0.5,y+0.5,23,13);
    }

    var size=_fit(ctx,n,20,11,8,true);
    ctx.font=_font(size,true);
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle='rgba(4,6,10,0.9)'; ctx.fillText(n,x+12,y+8);
    ctx.fillStyle='#ffe08a'; ctx.fillText(n,x+12,y+7);

    if(ready){
      var tx=x+24;
      var pulse=(typeof ready==='number')?(0.82+0.18*Math.sin(ready*0.15)):0.95;
      ctx.save();
      _mulAlpha(ctx,pulse);
      if(_assets.ok&&_assets.dragonTag)ctx.drawImage(_assets.dragonTag,tx,y);
      else{
        ctx.fillStyle='rgba(24,18,8,0.88)'; ctx.fillRect(tx,y,30,14);
        ctx.strokeStyle='#e6bf62'; ctx.lineWidth=1;
        ctx.strokeRect(tx+0.5,y+0.5,29,13);
      }
      if(_assets.ok&&_assets.dragon)ctx.drawImage(_assets.dragon,tx+1,y+1);
      ctx.font=_font(7,true);
      ctx.textAlign='left'; ctx.textBaseline='middle';
      ctx.fillStyle='rgba(20,12,4,0.8)'; ctx.fillText('龙吟',tx+14,y+8);
      ctx.fillStyle='#ffd764'; ctx.fillText('龙吟',tx+13,y+7);
      ctx.restore();
    }
    ctx.restore();
  }

  /* ---------------- 5. 心形血槽 ---------------- */
  function hearts(ctx,x,y,hp,maxHp){
    if(!ctx)return;
    maxHp=Math.floor(_n(maxHp,0));
    if(maxHp<=0)return;
    maxHp=Math.min(maxHp,20);
    hp=Math.round(_n(hp,0));
    hp=_clamp(hp,0,maxHp);
    x=_r(_n(x,0)); y=_r(_n(y,0));
    ctx.save();
    ctx.imageSmoothingEnabled=false;
    for(var i=0;i<maxHp;i++){
      var full=i<hp;
      var img=_assets.ok?(full?_assets.heartFull:_assets.heartEmpty):null;
      var hx=x+i*10;
      if(img)ctx.drawImage(img,hx,y);
      else{
        ctx.fillStyle=full?'#c8362e':'#3a1418';
        ctx.fillRect(hx+1,y+1,6,4); ctx.fillRect(hx+2,y,4,6);
        ctx.strokeStyle=full?'#f0c860':'#8a6c38';
        ctx.lineWidth=1; ctx.strokeRect(hx+0.5,y+0.5,7,5);
      }
    }
    ctx.restore();
  }

  /* ---------------- 6. 朱砂印章 ---------------- */
  function seal(ctx,text,x,y,size){
    if(!ctx)return;
    text=_str(text);
    if(!text)return;
    x=_r(_n(x,0)); y=_r(_n(y,0));
    size=_r(_clamp(_n(size,18),10,48));
    ctx.save();
    ctx.imageSmoothingEnabled=false;
    if(_assets.ok&&_assets.seal)ctx.drawImage(_assets.seal,x,y,size,size);
    else{
      ctx.fillStyle='#b42a24'; ctx.fillRect(x,y,size,size);
      ctx.strokeStyle='#e2705e'; ctx.lineWidth=1;
      ctx.strokeRect(x+2.5,y+2.5,size-5,size-5);
    }
    var fs=_fit(ctx,text,size*0.72,Math.round(size*0.58),7,true);
    ctx.font=_font(fs,true);
    ctx.textAlign='center'; ctx.textBaseline='middle';
    var cx=x+size/2, cy=y+size/2+1;
    ctx.fillStyle='rgba(96,12,8,0.55)';      // 阴刻：先落一层暗红再压白字
    ctx.fillText(text,cx+1,cy+1);
    ctx.fillStyle='#fff4ea';
    ctx.fillText(text,cx,cy);
    ctx.restore();
  }

  window.PQHUD={
    panel:panel,
    button:button,
    title:title,
    comboBadge:comboBadge,
    hearts:hearts,
    seal:seal,
    version:'1.0'
  };
})();
