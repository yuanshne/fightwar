/* v50：AI 立绘统一风格化（消除「抠图贴纸感」）
 * 只做像素级后处理，不改尺寸、不写游戏状态：
 *   1. 深色剪影 8 向 ±1px 叠加 → 1px 暗轮廓；
 *   2. 顶部 1px 金/冷色边缘光（lighter，偏移 0,-1，低透明度，不成光环）；
 *   3. source-atop 冷调 + saturation 灰降饱和，把高饱和 AI 色压进像素场景；
 *   4. 复制 _aiEnemy/_aiFoot/_aiBaseW，打 _pqStyled；WeakMap 按源图缓存，不重复描边。
 * 加载顺序：ai_sprites.js 之后、boss_gallery.js 之前。
 */
(function(){
  'use strict';
  if(typeof window==='undefined'||typeof document==='undefined')return;
  if(window.PQAI_STYLE&&typeof window.PQAI_STYLE.stylize==='function')return;

  var OUTLINE='#05070f';
  var CACHE=(typeof WeakMap==='function')?new WeakMap():null;
  var SKIN_CACHE=(typeof WeakMap==='function')?new WeakMap():null;

  function make(w,h){var c=document.createElement('canvas');c.width=w;c.height=h;return c;}
  function ctx2(c){
    try{
      var g=c.getContext('2d');
      if(g)g.imageSmoothingEnabled=false;
      return g;
    }catch(e){return null;}
  }
  function dim(img){
    var w=0,h=0;
    try{w=Math.round(+img.width||+img.naturalWidth||0);}catch(e){}
    try{h=Math.round(+img.height||+img.naturalHeight||0);}catch(e){}
    return (w>0&&h>0)?{w:w,h:h}:null;
  }
  function rimColor(kind){
    var s=String(kind==null?'':kind);
    return (s.indexOf('boss')>=0||s.indexOf('hero')>=0)?'#ffd36a':'#9fd8ff';
  }
  function copyTags(src,dst){
    if(!dst)return dst;
    try{
      if(src._aiEnemy)dst._aiEnemy=true;
      if(src._aiFoot!=null)dst._aiFoot=src._aiFoot;
      if(src._aiBaseW!=null)dst._aiBaseW=src._aiBaseW;
      dst._pqStyled=true;
    }catch(e){}
    return dst;
  }

  /* 同尺寸重绘：描边 → 原图 → 边缘光 → 调色 */
  function render(img,kind){
    var d=dim(img);
    if(!d)return img;
    var w=d.w,h=d.h;
    var out=make(w,h),g=ctx2(out);
    if(!g)return img;

    /* 1) 深色剪影，8 向偏移叠加。描边只在原图外侧可见。 */
    var sil=make(w,h),sg=ctx2(sil);
    if(sg){
      sg.drawImage(img,0,0);
      sg.globalCompositeOperation='source-atop';
      sg.fillStyle=OUTLINE;
      sg.fillRect(0,0,w,h);
      var dirs=[
        [-1,0,0.55],[1,0,0.55],[0,-1,0.55],[0,1,0.55],
        [-1,-1,0.45],[1,-1,0.45],[-1,1,0.45],[1,1,0.45]
      ];
      for(var i=0;i<dirs.length;i++){
        g.globalAlpha=dirs[i][2];
        g.drawImage(sil,dirs[i][0],dirs[i][1]);
      }
      g.globalAlpha=1;
    }

    /* 2) 原图覆盖，保留原有细节与透明边。 */
    g.globalCompositeOperation='source-over';
    g.drawImage(img,0,0);

    /* 3) 顶部/面向侧 1px 边缘光：上移 1px 的着色剪影减去原图剪影，
     *    只留下顶缘一条窄带，再以 lighter + 0.10 叠加，避免糊成光环。 */
    var rim=make(w,h),rg=ctx2(rim);
    if(rg){
      rg.drawImage(img,0,-1);
      rg.globalCompositeOperation='source-atop';
      rg.fillStyle=rimColor(kind);
      rg.fillRect(0,0,w,h);
      rg.globalCompositeOperation='destination-out';
      rg.drawImage(img,0,0);
      g.globalCompositeOperation='lighter';
      g.globalAlpha=0.10;
      g.drawImage(rim,0,0);
      g.globalAlpha=1;
    }

    /* 4) 轻微调色：只用 source-atop（严格跟随原图 alpha），
     *    不再用 saturation 混合——该混合会把透明画布也染成矩形底板。 */
    g.globalCompositeOperation='source-atop';
    g.globalAlpha=0.06;g.fillStyle='rgb(24,32,52)';g.fillRect(0,0,w,h);
    g.globalAlpha=0.08;g.fillStyle='#8c93a3';g.fillRect(0,0,w,h);
    g.globalAlpha=1;g.globalCompositeOperation='source-over';

    copyTags(img,out);
    return out;
  }

  /* 公开入口：同一源对象只渲染一次（_pqStyled 或 WeakMap 命中直接返回）。 */
  function stylize(img,kind){
    try{
      if(!img||typeof img!=='object')return img;
      if(img._pqStyled)return img;
      if(CACHE){
        var hit=CACHE.get(img);
        if(hit)return hit;
      }
      var out=render(img,kind);
      if(out&&out!==img&&CACHE){try{CACHE.set(img,out);}catch(e){}}
      return out;
    }catch(e){return img;}
  }

  function minionSized(img){
    var d=dim(img);
    return !!(d&&d.w>=18&&d.w<=26&&d.h>=18&&d.h<=26);
  }
  function styleFrame(img,kind,aiOnly){
    if(!img||typeof img!=='object')return img;
    if(img._pqStyled)return img;
    if(aiOnly&&!img._aiEnemy&&!minionSized(img))return img;
    return stylize(img,kind);
  }
  function styleValue(v,kind,aiOnly){
    if(!v)return v;
    if(!Array.isArray(v))return styleFrame(v,kind,aiOnly);
    var out=new Array(v.length),changed=false;
    for(var i=0;i<v.length;i++){
      out[i]=styleFrame(v[i],kind,aiOnly);
      if(out[i]!==v[i])changed=true;
    }
    return changed?out:v;
  }

  /* ---------- 3. SPR 扫描：主角 / 法师 / 小怪 ---------- */
  var HERO_KEYS=[
    'heroIdle1','heroIdle2','heroRun','heroJump','heroFall','heroAttack',
    'heroDash','heroSquash','heroAttackFrames','heroAttackGold',
    'heroIdle1L','heroIdle2L','heroRunL','heroJumpL','heroFallL','heroAttackL',
    'heroDashL','heroSquashL','heroAttackFramesL','heroAttackGoldL'
  ];
  var MINION_KEYS=[
    'slime','knight','lancer','mage','spitter','beetle','hopper','jelly','ghost','boomer'
  ];

  function setKey(k,v){try{SPR[k]=v;}catch(e){}}
  function scanKey(k,kind,aiOnly){
    try{
      var v=SPR[k];
      if(!v)return;
      var s=styleValue(v,kind,aiOnly);
      if(s!==v)setKey(k,s);
    }catch(e){}
  }
  function scanSPR(){
    if(typeof SPR==='undefined'||!SPR)return;
    var i,k;
    for(i=0;i<HERO_KEYS.length;i++)scanKey(HERO_KEYS[i],'hero',false);
    try{ // 法师全部 mg* 键（含数组逐帧）
      for(k in SPR){
        if(!Object.prototype.hasOwnProperty.call(SPR,k))continue;
        if(k.slice(0,2)!=='mg')continue;
        scanKey(k,'mage',false);
      }
    }catch(e){}
    for(i=0;i<MINION_KEYS.length;i++){
      scanKey(MINION_KEYS[i],'minion',true);
      scanKey(MINION_KEYS[i]+'White','minion',true);
    }
  }

  /* ---------- 2. Boss 原画注入包装 ---------- */
  var bossWrapped=false;
  function wrapBoss(){
    if(bossWrapped)return true;
    if(typeof window.PQAI_SET_BOSS_IMAGE!=='function')return false;
    var orig=window.PQAI_SET_BOSS_IMAGE;
    window.PQAI_SET_BOSS_IMAGE=function(kind,img){
      var styled=img;
      try{styled=styleFrame(img,'boss',false);}catch(e){styled=img;}
      return orig.call(this,kind,styled);
    };
    bossWrapped=true;
    return true;
  }
  if(!wrapBoss()){
    var bossTries=0;
    var bossTimer=setInterval(function(){
      if(wrapBoss()||++bossTries>=100)clearInterval(bossTimer);
    },100);
    if(bossTimer&&bossTimer.unref)bossTimer.unref();
  }

  /* ---------- 4. getHeroSkin 包装：blue 返回风格化浅拷贝 ---------- */
  var skinWrapped=false;
  function styleFrameset(src){
    if(!src||typeof src!=='object')return src;
    if(SKIN_CACHE){
      var hit=SKIN_CACHE.get(src);
      if(hit)return hit;
    }
    var out={},k;
    for(k in src){
      if(!Object.prototype.hasOwnProperty.call(src,k))continue;
      out[k]=styleValue(src[k],'hero',false);
    }
    if(SKIN_CACHE){try{SKIN_CACHE.set(src,out);}catch(e){}}
    return out;
  }
  function wrapSkin(){
    if(skinWrapped)return true;
    if(typeof window.getHeroSkin!=='function')return false;
    var orig=window.getHeroSkin;
    var fn=function(id){
      var src=orig.apply(this,arguments);
      if(id===undefined||id==='blue'){
        try{return styleFrameset(src);}catch(e){return src;}
      }
      return src;
    };
    fn.__pqStyle=true;
    fn.__pqHeroAnim=true; // 保持在外层，避免 hero_anim 再包一层绕开风格化
    window.getHeroSkin=fn;
    skinWrapped=true;
    return true;
  }
  wrapSkin();

  /* ---------- 定时扫描：立即一次 + 每 500ms，累计 12s ---------- */
  try{scanSPR();}catch(e){}
  var tries=0;
  var timer=setInterval(function(){
    try{scanSPR();}catch(e){}
    if(++tries>=24)clearInterval(timer);
  },500);
  if(timer&&timer.unref)timer.unref();

  window.PQAI_STYLE={stylize:stylize,version:'50'};
})();
