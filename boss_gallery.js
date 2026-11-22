/* v53：Boss 专属原画注入 + 内容等比归一
 * 资源：assets/ai/bosses/boss_1.png .. boss_14.png（png 缺失时尝试同路径 .jpg）
 * 每张图按 alpha 内容 bbox 等比缩放到内容高≈106px（同时受画布 96 宽 / 110 高限制），
 * 最近邻、不改长宽比，底部居中贴回 96×110；白剪影仍由 ai_sprites 按注入图生成。
 * 实际缩放比写入 window.PQAI_BOSS_VIS_SCALE[kind]（相对原图，1=原尺寸）。
 * 加载成功即调 PQAI_SET_BOSS_IMAGE(kind,img)；全部尝试结束后置 PQAI_BOSS_GALLERY_READY=true。
 * 缺图/读取失败静默回退原图，不抛错；不改命中框与关卡数据。
 */
(function(){
  'use strict';
  if(typeof window==='undefined'||typeof document==='undefined')return;
  var BASE='assets/ai/bosses/boss_';
  var VER='?v=53';
  var TOTAL=14;
  var TW=96,TH=110,TARGET_H=106;
  var left=TOTAL;
  var SCALE=window.PQAI_BOSS_VIS_SCALE;
  if(!SCALE||typeof SCALE!=='object')SCALE=window.PQAI_BOSS_VIS_SCALE={};

  function make(w,h){var c=document.createElement('canvas');c.width=w;c.height=h;return c;}
  function ctx2(c){var g=c.getContext('2d');if(g)g.imageSmoothingEnabled=false;return g;}

  function finish(){
    if(--left<=0)window.PQAI_BOSS_GALLERY_READY=true;
  }
  function fail(kind){
    if(!isFinite(SCALE[kind]))SCALE[kind]=1;
    finish();
  }

  /* alpha>8 的内容边界；读不到像素（file:// 污染画布等）时返回 null，调用方直通原图。 */
  function contentBox(img){
    var w=Math.round(+img.width||+img.naturalWidth||0);
    var h=Math.round(+img.height||+img.naturalHeight||0);
    if(!(w>0&&h>0))return null;
    var c=make(w,h),g=c&&ctx2(c);
    if(!g)return null;
    var d;
    try{
      g.drawImage(img,0,0);
      d=g.getImageData(0,0,w,h).data;
    }catch(e){return null;}
    var x0=w,y0=h,x1=-1,y1=-1;
    for(var y=0;y<h;y++){
      var row=y*w*4;
      for(var x=0;x<w;x++){
        if(d[row+x*4+3]<=8)continue;
        if(x<x0)x0=x;
        if(x>x1)x1=x;
        if(y<y0)y0=y;
        if(y>y1)y1=y;
      }
    }
    if(x1<x0||y1<y0)return null;
    return {x:x0,y:y0,w:x1-x0+1,h:y1-y0+1};
  }

  /* 等比缩放到内容高≈TARGET_H；宽图受 96 宽上限约束（不裁切、不拉伸），
   * 最近邻绘制，底部居中贴到 96×110。 */
  function normalize(img){
    var b=contentBox(img);
    if(!b)return null;
    var s=TARGET_H/b.h;
    if(s*b.w>TW)s=TW/b.w;
    if(s*b.h>TH)s=TH/b.h;
    if(!(s>0)||!isFinite(s))return null;
    var dw=Math.max(1,Math.min(TW,Math.round(b.w*s)));
    var dh=Math.max(1,Math.min(TH,Math.round(b.h*s)));
    var c=make(TW,TH),g=c&&ctx2(c);
    if(!g)return null;
    g.drawImage(img,b.x,b.y,b.w,b.h,Math.round((TW-dw)/2),TH-dh,dw,dh);
    var sc=(dw/b.w+dh/b.h)/2;          // 实际落图缩放（两轴差异≤1px）
    return {img:c,scale:Math.round(sc*1000)/1000};
  }

  function apply(kind,img){
    var out=normalize(img);
    SCALE[kind]=out?out.scale:1;
    if(typeof window.PQAI_SET_BOSS_IMAGE!=='function')return;
    try{window.PQAI_SET_BOSS_IMAGE(kind,out?out.img:img);}catch(e){}
  }

  function tryLoad(kind,ext,onFail){
    var im=new Image();
    im.onload=function(){
      if(!im.width||!im.height){onFail();return;}
      try{apply(kind,im);}catch(e){SCALE[kind]=1;}
      finish();
    };
    im.onerror=function(){onFail();};
    im.src=BASE+kind+'.'+ext+VER;
  }

  for(var k=1;k<=TOTAL;k++){
    (function(kind){
      tryLoad(kind,'png',function(){
        tryLoad(kind,'jpg',function(){fail(kind);});
      });
    })(k);
  }
})();
