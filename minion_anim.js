/* v35：小怪多帧动画皮肤
 * 资源：assets/ai/minions/{soldier_0..3,ghost_0..2,beast_0..3}.png（洋红已抠、底部居中）
 * 把 SPR 小怪键换成 2 帧循环；每帧打 _aiEnemy/_aiFoot/_aiBaseW，
 * 让 ui.js 的 _drawSprite 继续按「原精灵底边 + 原宽度居中」对齐，不再贴地。
 * 必须在 ai_sprites.js 之后加载：后注册的 500ms 定时器在同一 tick 里后执行，
 * 可压过 minion_human/minion_small 的静态帧；加载失败时保留原素材不动。
 */
(function(){
  if(typeof window==='undefined'||typeof document==='undefined')return;
  var BASE='assets/ai/minions/';
  var SHEETS={
    soldier:['soldier_0.png','soldier_1.png','soldier_2.png','soldier_3.png'],
    ghost:['ghost_0.png','ghost_1.png','ghost_2.png'],
    beast:['beast_0.png','beast_1.png','beast_2.png','beast_3.png']
  };
  // key=SPR 键；sheet=素材表；pick=取用帧；scale=相对成品尺寸的缩放；tint=[色,透明度]
  var DEFS=[
    {key:'slime',      sheet:'beast',  pick:[0,2], scale:0.80},
    {key:'spitter',    sheet:'soldier',pick:[0,2], scale:0.78, tint:['#57d68a',0.26]},
    {key:'beetle',     sheet:'beast',  pick:[0,2], scale:0.86, tint:['#57d68a',0.26]},
    {key:'knight',     sheet:'soldier',pick:[0,2], scale:1.00},
    {key:'lancer',     sheet:'soldier',pick:[0,2], scale:0.98, tint:['#b45cff',0.28]},
    {key:'mage',       sheet:'ghost',  pick:[0,2], scale:0.96, tint:['#b45cff',0.30]},
    {key:'hopper',     sheet:'soldier',pick:[0,2], scale:0.78, tint:['#58b8ff',0.30]},
    {key:'jelly',      sheet:'ghost',  pick:[0,2], scale:0.84, tint:['#5cb8ff',0.32]},
    {key:'ghost',      sheet:'ghost',  pick:[0,2], scale:1.00},
    {key:'knightGuard',sheet:'soldier',pick:[1,3], scale:1.00},
    {key:'mageCast',   sheet:'ghost',  pick:[2],   scale:0.96, tint:['#b45cff',0.30], single:true}
  ];
  var frames={soldier:null,ghost:null,beast:null};
  var orig={}, built={}, started=false, tries=0, timer=null;

  function make(w,h){var c=document.createElement('canvas');c.width=w;c.height=h;return c;}
  function ctx2(c){var g=c.getContext('2d');g.imageSmoothingEnabled=false;return g;}

  function loadSheet(name,cb){
    var list=SHEETS[name],out=[],left=list.length,failed=false;
    function one(i){
      var im=new Image();
      im.onload=function(){
        if(failed)return;
        out[i]=im;
        if(--left===0)cb(out);
      };
      im.onerror=function(){if(failed)return;failed=true;cb(null);};
      im.src=BASE+list[i]+'?v=1';
    }
    for(var i=0;i<list.length;i++)one(i);
  }

  function build(img,scale,color,alpha){
    var w=Math.max(1,Math.round(img.width*scale));
    var h=Math.max(1,Math.round(img.height*scale));
    var c=make(w,h),g=ctx2(c);
    // 缩小时开双线性，避免 22px 像素被硬删导致描边断裂；放大/原尺寸保持硬边
    g.imageSmoothingEnabled=scale<1;
    g.drawImage(img,0,0,w,h);
    g.imageSmoothingEnabled=false;
    if(color){ // source-atop 只给不透明像素上色，轮廓/透明边不变
      g.globalCompositeOperation='source-atop';
      g.globalAlpha=alpha;g.fillStyle=color;g.fillRect(0,0,w,h);
      g.globalAlpha=1;g.globalCompositeOperation='source-over';
    }
    return c;
  }

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

  // 原始帧尺寸只取一次：若上游 ai_sprites 已覆盖，直接沿用它的 _aiFoot/_aiBaseW，
  // 避免把自己的放大帧当成「原尺寸」而导致锚点逐次漂移。
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

  function apply(){
    if(typeof SPR==='undefined'||!SPR)return;
    for(var i=0;i<DEFS.length;i++){
      var d=DEFS[i],pool=frames[d.sheet];
      if(!pool)continue;
      try{if(!SPR[d.key])continue;}catch(e){continue;}
      var o=origOf(d.key);
      if(!o)continue;
      var b=built[d.key];
      if(!b){
        var arr=[];
        for(var j=0;j<d.pick.length;j++){
          var src=pool[d.pick[j]];
          if(!src)continue;
          arr.push(tag(build(src,d.scale,d.tint&&d.tint[0],d.tint&&d.tint[1]),o.foot,o.baseW));
        }
        if(!arr.length)continue;
        b={val:d.single?arr[0]:(arr.length>1?arr:[arr[0],arr[0]])};
        b.white=Array.isArray(b.val)
          ? b.val.map(function(f){return tag(whiteOf(f),f._aiFoot,f._aiBaseW);})
          : tag(whiteOf(b.val),b.val._aiFoot,b.val._aiBaseW);
        built[d.key]=b;
      }
      SPR[d.key]=b.val;
      // 原 SPR 若带同名 *White 受击白闪键，用同尺寸白色剪影同步（锚点一并带上）
      var wk=d.key+'White';
      try{
        if(Object.prototype.hasOwnProperty.call(SPR,wk))SPR[wk]=b.white;
      }catch(e){}
    }
  }

  function start(){
    if(started)return;
    started=true;
    apply();
    // 12 秒内每 500ms 压回一次，压住 ai_sprites / sprites_external 的后写覆盖。
    timer=setInterval(function(){
      apply();
      if(++tries>=24){clearInterval(timer);timer=null;}
    },500);
  }

  var ready=0;
  function done(list){
    if(!list){ready++;if(ready>=3)start();return;}
    ready++;
    if(ready>=3)start();else apply();
  }
  for(var name in SHEETS){
    if(!Object.prototype.hasOwnProperty.call(SHEETS,name))continue;
    (function(nm){
      loadSheet(nm,function(list){
        if(list){
          frames[nm]=list;
          if(typeof window.PQAI_MINIONS_READY==='undefined')window.PQAI_MINIONS_READY=true;
        }
        done(list);
      });
    })(name);
  }
})();
