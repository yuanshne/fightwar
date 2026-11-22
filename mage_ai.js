/* v36：法师（mage）AI 皮肤
 * 资源：assets/ai/mage/{mg_idle,mg_cast_0..2,mg_run_0..3}.png（洋红四边泛洪抠图、去紫边、
 *       底部居中、统一缩放 32×38）。必须在 ai_sprites.js / hero_anim.js 之后加载。
 * 只覆盖 SPR.mg*（magePoseImg 的 park() 命中 AI 帧）；SPR.skins / SPR.mageSkins 一律不动，
 * 换色皮肤帧集仍优先。缺帧/缺键静默跳过，加载后 12 秒内每 500ms 重压一次，
 * 防止被 sprites_external / art.js 的程序化法师帧覆盖。碰撞与移动数值不改。
 */
(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var BASE = 'assets/ai/mage/';
  var VER = '?v=48';
  var FILES = {
    idle: 'mg_idle.png',
    cast0: 'mg_cast_0.png',
    cast1: 'mg_cast_1.png',
    cast2: 'mg_cast_2.png',
    run0: 'mg_run_0.png',
    run1: 'mg_run_1.png',
    run2: 'mg_run_2.png',
    run3: 'mg_run_3.png'
  };

  var got = {};
  var pending = 0;
  var loadedCount = 0;
  var ALL = 0;
  /* 翻转帧只烘焙一次，重压阶段直接复用，避免反复分配 canvas。 */
  var idleL = null, runL = null, run0L = null, cast1L = null, cast2L = null;

  function make(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function flip(img) {
    var w = img.width || img.naturalWidth;
    var h = img.height || img.naturalHeight;
    var c = make(w, h);
    var g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.translate(w, 0); g.scale(-1, 1);
    g.drawImage(img, 0, 0);
    return c;
  }

  /* 逐键写入：源帧缺失时保留原程序化帧，绝不写 undefined。 */
  function set(k, v) {
    if (v) SPR[k] = v;
  }

  function apply() {
    if (typeof SPR === 'undefined') return;
    var idle = got.idle;
    if (idle) {
      set('mgIdle1', idle);
      set('mgJump', idle);
      set('mgFall', idle);
      set('mgIdle1L', idleL);
      set('mgJumpL', idleL);
      set('mgFallL', idleL);
    }
    if (got.run0) {
      set('mgIdle2', got.run0);
      set('mgIdle2L', run0L);
    }

    var runs = [got.run0, got.run1, got.run2, got.run3];
    if (runL) {
      SPR.mgRun = runs;
      SPR.mgRunL = runL;
    }
    if (got.run0) {
      set('mgDash', got.run0);
      set('mgDashL', run0L);
    }
    if (got.cast2) {
      set('mgAttack', got.cast2);
      set('mgAttackL', cast2L);
    }
    if (got.cast1) {
      set('mgCast', got.cast1);
      set('mgCastL', cast1L);
    }
  }
  function startRepress() {
    var tries = 0;
    var timer = setInterval(function () {
      apply();
      if (++tries >= 24) clearInterval(timer);
    }, 500);
  }

  function loadOne(key, name) {
    var im = new Image();
    im.onload = function () {
      got[key] = im;
      loadedCount++;
      done();
    };
    im.onerror = function () { done(); }; // 静默跳过该帧
    im.src = BASE + name + VER;
  }

  function done() {
    if (--pending > 0) return;
    if (!got.idle) return;                 // 待机帧都没有 → 整体放弃
    idleL = flip(got.idle);
    if (got.run0) run0L = flip(got.run0);
    if (got.run1 && got.run2 && got.run3) {
      runL = [got.run0, got.run1, got.run2, got.run3].map(flip);
    }
    if (got.cast1) cast1L = flip(got.cast1);
    if (got.cast2) cast2L = flip(got.cast2);
    apply();
    startRepress();
    if (loadedCount === ALL) window.PQAI_MAGE_READY = true;
  }

  for (var k in FILES) {
    if (Object.prototype.hasOwnProperty.call(FILES, k)) {
      ALL++;
      pending++;
      loadOne(k, FILES[k]);
    }
  }
})();
