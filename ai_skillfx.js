/* v37：技能 SPR 的 AI 化补丁
 * 只替换 ui.js 直接 drawImage 的技能帧（陨石/火球/星陨/冰锥/残影），
 * 不改技能伤害、碰撞、生成频率；所有帧烘焙成小尺寸 canvas。
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

  function apply(){
    var v=window.PQAI_VFX;
    if(!v||!v.ready)return false;
    try{
      var fireA=keyBlack(v.fire,28,0);
      var fireB=keyBlack(v.fire,28,0.35);
      var fireBig=keyBlack(v.fire,40,0.15);
      var poison=keyBlack(v.poison,18,0);
      var bolt=keyBlack(v.lightning,20,0);
      var shadow=keyBlack(v.shadow,20,-0.2);
      var holy=keyBlack(v.heal,24,0);

      // 陨石：两帧火球（保留 ui 原有 %2 取帧）
      SPR.meteor=[fireA,fireB];
      // 法师追踪火球
      SPR.fireball=[fireB,poison];
      // 星陨大招
      SPR.starMeteor=fireBig;
      // 冰锥/碎片：雷光小帧
      SPR.iceShard=bolt;
      // 残影/克隆
      SPR.bossGhost=shadow;
      // 圣光盾/治疗
      if(!SPR.shieldBubble)SPR.shieldBubble=holy;
      READY=true;
      window.PQAI_SKILLFX_READY=true;
      return true;
    }catch(e){return false;}
  }

  function tick(){
    if(apply())return;
    if(++tries>40)return;
    setTimeout(tick,300);
  }
  tick();

  // 12 秒内反复压过 art.js/ui.js 的后续写帧。
  var n=0,iv=setInterval(function(){
    apply();
    if(++n>=24)clearInterval(iv);
  },500);
})();
