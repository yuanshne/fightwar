/* v37：技能 SPR 的 AI 化补丁（v57.1 懒加载适配）
 * 只替换 ui.js 直接 drawImage 的技能帧（陨石/火球/星陨/冰锥/残影），
 * 不改技能伤害、碰撞、生成频率；所有帧烘焙成小尺寸 canvas。
 *
 * 懒加载契约：
 *  - ai_vfx.js 的图按需发起；本模块不再等待全局 ready，逐图读取 get(name)。
 *  - 未加载的源图跳过对应帧，保留 art.js 基线 / 程序化兜底，不报错、不丢键。
 *  - shieldBubble 启动阶段先烘焙程序化气泡（就绪门 required 键必须在位），
 *    heal 图懒加载完成后再覆盖升级。
 *  - 技能源图在玩家首次交互（keydown/pointerdown/touchstart）时按需发起。
 */
(function(){
  'use strict';
  if(typeof window==='undefined'||typeof document==='undefined')return;

  var READY=false, tries=0;

  function make(w,h){var c=document.createElement('canvas');c.width=w;c.height=h;return c;}
  function ctx2(c){var g=c.getContext('2d');if(g)g.imageSmoothingEnabled=true;return g;}

  // 黑底特效图去黑：按亮度生成 alpha，保留火焰/雷光/圣光。
  function keyBlack(img,size,rot){
    var s=Math.max(8,size|0);
    var c=make(s,s),g=ctx2(c);if(!g)return c;
    var tmp=make(img.width||img.naturalWidth||s,img.height||img.naturalHeight||s),tg=ctx2(tmp);
    if(!tg)return c;
    tg.drawImage(img,0,0,tmp.width,tmp.height);
    var id;
    try{id=tg.getImageData(0,0,tmp.width,tmp.height);}catch(e){g.drawImage(img,0,0,s,s);return c;}
    var d=id.data;
    for(var i=0;i<d.length;i+=4){
      var r=d[i],gg=d[i+1],b=d[i+2];
      var a=Math.max(r,gg,b);
      if(a<18)a=0; else a=Math.min(255,Math.round(a*1.35));
      d[i+3]=a;
    }
    tg.putImageData(id,0,0);
    g.save();
    g.translate(s/2,s/2);g.rotate(rot||0);
    g.drawImage(tmp,-s/2,-s/2,s,s);
    g.restore();
    return c;
  }

  // 洋红底已抠的图：等比装入方形画布。
  function fit(img,size,rot){
    var s=Math.max(8,size|0);
    var c=make(s,s),g=ctx2(c);if(!g)return c;
    g.save();g.translate(s/2,s/2);g.rotate(rot||0);
    var iw=img.width||img.naturalWidth||s,ih=img.height||img.naturalHeight||s;
    var k=Math.min(s/iw,s/ih),w=iw*k,h=ih*k;
    g.drawImage(img,-w/2,-h/2,w,h);g.restore();
    return c;
  }

  // 程序化圣光盾兜底：无 heal 图时也保证 SPR.shieldBubble 键在位（就绪门 required）。
  function proceduralShield(){
    var c=make(24,24),g=ctx2(c);if(!g)return c;
    var rg=g.createRadialGradient(12,12,2,12,12,11);
    rg.addColorStop(0,'rgba(255,255,255,0)');
    rg.addColorStop(0.7,'rgba(150,225,255,0.16)');
    rg.addColorStop(1,'rgba(180,235,255,0.50)');
    g.fillStyle=rg;g.beginPath();g.arc(12,12,11,0,6.2832);g.fill();
    g.strokeStyle='rgba(220,250,255,0.85)';g.lineWidth=1.2;
    g.beginPath();g.arc(12,12,9.5,0,6.2832);g.stroke();
    g.strokeStyle='rgba(255,255,255,0.35)';g.lineWidth=0.8;
    g.beginPath();g.arc(12,12,6,0,6.2832);g.stroke();
    return c;
  }

  // 启动即落程序化盾帧：heal 未加载也不缺键。
  try{ if(!SPR.shieldBubble) SPR.shieldBubble=proceduralShield(); }catch(e){}

  function vfxImg(name){
    var v=window.PQAI_VFX;
    if(!v)return null;
    var im=(typeof v.get==='function')?v.get(name):v[name];
    return (im&&im.width>0&&im.height>0)?im:null;
  }

  function apply(){
    var v=window.PQAI_VFX;
    if(!v)return false;
    try{
      var fire=vfxImg('fire'),poison=vfxImg('poison'),bolt=vfxImg('lightning'),
          shadow=vfxImg('shadow'),holy=vfxImg('heal');
      var baked=false;

      if(fire){
        var fireA=keyBlack(fire,28,0);
        var fireB=keyBlack(fire,28,0.35);
        var fireBig=keyBlack(fire,40,0.15);
        var poisonFrame=poison?keyBlack(poison,18,0):fireB;
        // 陨石：两帧火球（保留 ui 原有 %2 取帧）
        SPR.meteor=[fireA,fireB];
        // 法师追踪火球（poison 未就绪时退回 fireB 帧）
        SPR.fireball=[fireB,poisonFrame];
        // 星陨大招
        SPR.starMeteor=fireBig;
        baked=true;
      }
      if(bolt){
        // 冰锥/碎片：雷光小帧
        SPR.iceShard=keyBlack(bolt,20,0);
        baked=true;
      }
      if(shadow){
        // 残影/克隆
        SPR.bossGhost=keyBlack(shadow,20,-0.2);
        baked=true;
      }
      if(holy){
        // 圣光盾/治疗：懒加载完成后覆盖启动时的程序化兜底
        SPR.shieldBubble=keyBlack(holy,24,0);
        baked=true;
      }
      if(baked){
        READY=true;
        window.PQAI_SKILLFX_READY=true;
      }
      return baked;
    }catch(e){return false;}
  }

  // 技能源图：首次玩家交互时按需发起（启动阶段零请求）。
  var SKILL_SRC=['fire','poison','lightning','shadow','heal'];
  var armed=false;
  function armLazy(){
    if(armed)return; armed=true;
    var v=window.PQAI_VFX;
    if(v&&typeof v.ensure==='function'){
      for(var i=0;i<SKILL_SRC.length;i++){
        try{v.ensure(SKILL_SRC[i]);}catch(e){}
      }
    }
  }
  (function bindArm(){
    if(typeof window==='undefined')return;
    var evs=['keydown','pointerdown','touchstart'];
    for(var i=0;i<evs.length;i++){
      try{window.addEventListener(evs[i],armLazy,{passive:true});}catch(e){}
    }
  })();

  // 任意一张懒加载完成 → 立即补烘焙；慢轮询兜底覆盖晚到帧。
  (function subscribe(){
    var v=window.PQAI_VFX;
    if(v&&typeof v.onReady==='function'){
      v.onReady(function(){try{apply();}catch(e){}});
    }
  })();

  function tick(){
    if(apply())return;
    if(++tries>40)return;
    setTimeout(tick,300);
  }
  tick();

  // 30 秒内反复压过 art.js/ui.js 的后续写帧，覆盖懒加载晚到的图。
  var n=0,iv=setInterval(function(){
    apply();
    if(++n>=60)clearInterval(iv);
  },500);
})();
