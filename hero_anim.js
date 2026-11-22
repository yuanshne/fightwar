/* v35：主角动作帧（32×38）——跑步 4 帧 + 挥剑 3 帧
 * 资源：assets/ai/hero_anim/{run_0..3,attack_0..2}.png（洋红抠图、去紫边、底部居中）
 * 必须在 ai_sprites.js 之后加载：异步覆盖 SPR.heroRun / SPR.heroAttack / SPR.heroAttackGold
 * 及 blue 皮肤，并像 ai_sprites 一样在 12 秒内反复压回，防止被 sprites_external / art.js
 * 的程序化帧覆盖。施法金染色只叠加颜色，保留透明轮廓。
 * 任一帧加载失败 → 静默放弃，保留 ai_sprites 已有静态帧。碰撞/移动数值不改。
 */
(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var BASE = 'assets/ai/hero_anim/';
  var VER = '?v=47';
  var RUN_SRC = ['run_0.png', 'run_1.png', 'run_2.png', 'run_3.png'];
  var ATK_SRC = ['attack_0.png', 'attack_1.png', 'attack_2.png'];

  var runImgs = [];
  var atkImgs = [];
  var run = null, runL = null;
  var atkMid = null, atkMidL = null;
  var atkGold = null, atkGoldL = null;
  var blue = null;
  var ready = false;
  var failed = false;
  var pending = RUN_SRC.length + ATK_SRC.length;

  function flip(img) {
    var c = document.createElement('canvas');
    c.width = img.width || img.naturalWidth;
    c.height = img.height || img.naturalHeight;
    var g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.translate(c.width, 0);
    g.scale(-1, 1);
    g.drawImage(img, 0, 0);
    return c;
  }

  // 施法金色姿态：source-atop 只染不透明像素，透明轮廓不变（同 ai_sprites tint 参数）。
  function goldTint(img) {
    var c = document.createElement('canvas');
    c.width = img.width || img.naturalWidth;
    c.height = img.height || img.naturalHeight;
    var g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = 0.34;
    g.fillStyle = '#ffd36a';
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  function allLoaded() {
    if (failed) return;
    if (runImgs.length !== RUN_SRC.length || atkImgs.length !== ATK_SRC.length) return;
    for (var i = 0; i < runImgs.length; i++) {
      if (!runImgs[i]) return;
    }
    for (var j = 0; j < atkImgs.length; j++) {
      if (!atkImgs[j]) return;
    }
    run = runImgs.slice();
    runL = [];
    for (var k = 0; k < run.length; k++) runL.push(flip(run[k]));
    // 游戏只取单帧攻击姿态（ui.js FR('attack')），取中间帧；三帧仍留给后续扩展。
    atkMid = atkImgs[1];
    atkMidL = flip(atkMid);
    // 施法金色姿态取收势帧（atkImgs[2]），缺帧回退中间帧；只算一次，apply 里反复写回。
    atkGold = goldTint(atkImgs[2] || atkImgs[1]);
    atkGoldL = flip(atkGold);
    ready = true;
    apply();
    startRepress();
  }

  function onFrame() {
    pending--;
    if (pending <= 0) allLoaded();
  }

  function loadOne(list, idx, name) {
    var im = new Image();
    im.onload = function () {
      list[idx] = im;
      onFrame();
    };
    im.onerror = function () {
      failed = true; // 静默回退：不覆盖任何现有帧
      onFrame();
    };
    im.src = BASE + name + VER;
  }

  /* 覆盖 SPR 顶层帧 + blue 皮肤帧，并保证 getHeroSkin('blue') 返回新帧 */
  function apply() {
    if (!ready || typeof SPR === 'undefined') return;
    SPR.heroRun = run;
    SPR.heroRunL = runL;
    SPR.heroAttack = atkMid;
    SPR.heroAttackL = atkMidL;
    SPR.heroAttackFrames = atkImgs.slice();
    SPR.heroAttackFramesL = atkImgs.map(flip);
    // v35：施法帧改为 AI 动作帧金色版，每次重压都写回，压过 art.js 的程序化像素帧。
    SPR.heroAttackGold = atkGold;
    SPR.heroAttackGoldL = atkGoldL;

    var src = null;
    try {
      src = (typeof window.getHeroSkin === 'function') ? window.getHeroSkin('blue') : null;
    } catch (e) { src = null; }
    if (!src) {
      try { src = (SPR.skins && SPR.skins.blue) ? SPR.skins.blue : null; } catch (e) { src = null; }
    }
    blue = {};
    if (src) {
      for (var k in src) {
        if (Object.prototype.hasOwnProperty.call(src, k)) blue[k] = src[k];
      }
    }
    blue.run = run;
    blue.runL = runL;
    blue.attack = atkMid;
    blue.attackL = atkMidL;
    blue.attackFrames = SPR.heroAttackFrames;
    blue.attackFramesL = SPR.heroAttackFramesL;
    blue.attackGold = atkGold;
    blue.attackGoldL = atkGoldL;
    try { if (SPR.skins) SPR.skins.blue = blue; } catch (e) {}
    wrapSkin();
  }

  // ai_sprites.js 也会包装 getHeroSkin；若它是后包装（外层返回旧帧），下一拍再包回来。
  function wrapSkin() {
    if (typeof window.getHeroSkin !== 'function') return;
    if (window.getHeroSkin.__pqHeroAnim) return;
    var orig = window.getHeroSkin;
    var fn = function (id) {
      if (blue && (id === undefined || id === 'blue')) return blue;
      return orig.apply(this, arguments);
    };
    fn.__pqHeroAnim = true;
    window.getHeroSkin = fn;
  }

  // sprites_external.js 可能在之后覆盖；12 秒内每 500ms 重压一次。
  function startRepress() {
    var tries = 0;
    var timer = setInterval(function () {
      apply();
      if (++tries >= 24) clearInterval(timer);
    }, 500);
  }

  for (var i = 0; i < RUN_SRC.length; i++) loadOne(runImgs, i, RUN_SRC[i]);
  for (var j = 0; j < ATK_SRC.length; j++) loadOne(atkImgs, j, ATK_SRC[j]);
})();
