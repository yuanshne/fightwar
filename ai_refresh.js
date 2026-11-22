/* v38：AI 视觉层就绪后热刷新当前关卡主题。
 * 只调用 ui.js 暴露的 PQAI_REFRESH_THEME（重烘焙 themeArt），
 * 不改关卡瓦片、碰撞、实体或技能数值。
 */
(function(){
  'use strict';
  var n=0, kicked=false;
  function ready(){
    return !!(window.PQAI_TILES_READY ||
      (window.PQAI_BG && window.PQAI_BG.ready) ||
      window.PQAI_BOSS_GALLERY_READY);
  }
  function kick(){
    try{
      if(typeof window.PQAI_REFRESH_THEME==='function')window.PQAI_REFRESH_THEME();
    }catch(e){}
  }
  function poll(){
    if(!kicked&&ready()){
      kicked=true;
      kick();
      setTimeout(kick,600);
      setTimeout(kick,1800);
    }
    if(++n>50||kicked)clearInterval(iv);
  }
  var iv=setInterval(poll,300);
  try{
    if(document.readyState==='complete')poll();
    else window.addEventListener('load',function(){setTimeout(poll,0);},{once:true});
  }catch(e){}
})();
