/* v1：6 种小怪独立 AI 外观（蝙蝠/吐弹花/甲虫/跳虫/炸弹鬼/水母）
 * 资源：assets/ai/enemies/{bat,spitter,beetle,hopper,boomer,jelly}_N.png
 * 已抠洋红、逐帧底部居中，尺寸与原 SPR 首帧一致（12×10 / 14×16 / 14×12 / 12×12 / 10×10 / 12×12）。
 * 只在 minion_anim.js 之后覆盖 SPR 对应键；每帧带 _aiEnemy/_aiFoot/_aiBaseW，
 * ui.js 仍按原精灵底边/中心对齐，不改命中框、速度与 AI。
 * 缺图时静默跳过该组，保留原素材。
 * v56 修复：图片解码可能早于 boot 的 buildSprites 填充 SPR；finish 时若原帧尚不存在，
 * 不再永久放弃——保留已解码帧，由 500ms 看门狗在 SPR 就绪后补建（消除冷启动偶发缺 *White）。 */
(function(){
  if(typeof window==='undefined'||typeof document==='undefined')return;
  var BASE='assets/ai/enemies/';
  var DEFS=[
    // bat 的 ui 取帧是 %3，必须保留 3 帧，否则第三帧 undefined
    {key:'bat',     files:['bat_0.png','bat_1.png','bat_2.png','bat_3.png'],        pick:[0,1,2]},
    {key:'spitter', files:['spitter_0.png','spitter_1.png','spitter_2.png'],         pick:[0,2]},
    {key:'beetle',  files:['beetle_0.png','beetle_1.png','beetle_2.png','beetle_3.png'], pick:[0,3]},
    {key:'hopper',  files:['hopper_0.png','hopper_1.png','hopper_2.png','hopper_3.png'], pick:[0,1]},
    {key:'boomer',  files:['boomer_0.png','boomer_1.png','boomer_2.png'],            pick:[0,1]},
    {key:'jelly',   files:['jelly_0.png','jelly_1.png','jelly_2.png'],               pick:[0,1]}
  ];
  var orig={}, built={}, pending={}, started=false, tries=0, timer=null, ready=0;

  function make(w,h){var c=document.createElement('canvas');c.width=w;c.height=h;return c;}
  function ctx2(c){var g=c.getContext('2d');g.imageSmoothingEnabled=false;return g;}

  function tag(img,foot,baseW){
    if(!img)return img;
    img._aiEnemy=true;img._aiFoot=foot;img._aiBaseW=baseW;
    return img;
  }

  function whiteOf(img){
    var c=make(img.width,img.height),g=ctx2(c);
    g.drawImage(img,0,0);
    g.globalCompositeOperation='source-atop';
    g.globalAlpha=0.9;g.fillStyle='#ffffff';g.fillRect(0,0,c.width,c.height);
    g.globalAlpha=1;g.globalCompositeOperation='source-over';
    return c;
  }

  // 原尺寸只取一次；若上游 minion_anim 已换帧，沿用它带的锚点，避免锚点漂移。
  // 注意：取不到时不写缓存，留给看门狗重试（SPR 可能晚于图片解码就绪）。
  function origOf(key){
    if(orig[key])return orig[key];
    var v;
    try{v=SPR[key];}catch(e){return null;}
    var f=Array.isArray(v)?v[0]:v;
    if(!f||typeof f.width!=='number'||typeof f.height!=='number')return null;
    orig[key]={
      foot:(f._aiFoot!=null?f._aiFoot:f.height),
      baseW:(f._aiBaseW!=null?f._aiBaseW:f.width)
    };
    return orig[key];
  }

  // 待建组：SPR 原帧就绪后，用已解码帧补 val/white 并写入 SPR。
  function tryBuild(key){
    if(built[key])return;
    var p=pending[key];
    if(!p)return;
    var o=origOf(key);
    if(!o)return;
    var arr=[],j;
    for(j=0;j<p.d.pick.length;j++){
      var im=p.out[p.d.pick[j]];
      if(!im)continue;
      arr.push(tag(im,o.foot,o.baseW));
    }
    if(!arr.length)return;
    var val=arr.length>1?arr:[arr[0],arr[0]];
    var white=[];
    for(j=0;j<val.length;j++)white.push(tag(whiteOf(val[j]),o.foot,o.baseW));
    built[key]={val:val,white:white};
    delete pending[key];
    apply();
  }

  function apply(){
    if(typeof SPR==='undefined'||!SPR)return;
    for(var i=0;i<DEFS.length;i++){
      var d=DEFS[i],b=built[d.key];
      if(!b)continue;
      try{if(!SPR[d.key])continue;}catch(e){continue;}
      try{SPR[d.key]=b.val;}catch(e){continue;}
      try{SPR[d.key+'White']=b.white;}catch(e){}
      // 若存在同名 L（左向）变体，一并覆盖；本作当前没有这些键，保持静默
      try{
        if(Object.prototype.hasOwnProperty.call(SPR,d.key+'L'))SPR[d.key+'L']=b.val;
      }catch(e){}
    }
  }

  function start(){
    if(started)return;
    started=true;
    apply();
    // 12 秒内每 500ms 压回，压住 ai_sprites / sprites_external 的后写覆盖；
    // 同时补建图片先于 SPR 就绪而挂起的组。
    timer=setInterval(function(){
      for(var k in pending)tryBuild(k);
      apply();
      if(++tries>=24){clearInterval(timer);timer=null;}
    },500);
    if(timer&&timer.unref)timer.unref();
    try{window.PQAI_ENEMY_READY=true;}catch(e){}
  }

  function done(){
    ready++;
    if(ready>=DEFS.length)start();
  }

  // 先取一次快照，避免异步加载期间被后续脚本改写
  for(var k=0;k<DEFS.length;k++)origOf(DEFS[k].key);

  for(var i=0;i<DEFS.length;i++){
    (function(d){
      var list=d.files,out=[],left=list.length,failed=false;
      function finish(){
        if(failed){done();return;}
        pending[d.key]={d:d,out:out};
        tryBuild(d.key);   // SPR 已就绪则立刻建；否则挂起等看门狗补建
        done();
      }
      for(var n=0;n<list.length;n++){
        (function(idx){
          var im=new Image();
          im.onload=function(){
            if(failed)return;
            out[idx]=im;
            if(--left===0)finish();
          };
          im.onerror=function(){
            if(failed)return;
            failed=true;left=0;finish();
          };
          im.src=BASE+list[idx]+'?v=1';
        })(n);
      }
    })(DEFS[i]);
  }
})();
