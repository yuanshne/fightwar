/* ai_vfx.js — AI 特效贴图懒加载器（纯视觉层）
   7 张大图不再启动并发请求；首次被 ensure(name) 引用时按需加载。
   任一失败都静默置空，combatfx.js / ai_skillfx.js 自动回退程序化/基线特效。
   不参与伤害/判定/时序，也不写 game。

   兼容旧接口（v57 行为）：
     · api[name] 挂引用：未发起为 null；发起后为 Image（width>0 才算就绪）；失败置 null。
     · api.ready / api.loaded / api.total 保留（ready = 当前没有在途加载）。
   新增懒加载接口：
     · api.ensure(name)  首次需要时发起加载；返回就绪图或 null（加载中/失败均为 null）。
     · api.get(name)     只读返回就绪图，不触发加载。
     · api.onReady(cb)   任意一张图结束加载后回调（用于 skillfx 重新烘焙）。
     · api.status(name)  'idle' | 'loading' | 'loaded' | 'error'。
     · api.__snapshot()  QA/调试用内部状态快照。 */
(function (root) {
  'use strict';
  if (!root || root.PQAI_VFX) return;

  var BASE = 'assets/ai/vfx2/';
  var VER = '?v=1';
  var FILES = {
    slash: 'slash_gold.png',
    wave: 'wave_cyan.png',
    fire: 'burst_fire.png',
    poison: 'orb_poison.png',
    heal: 'heal_holy.png',
    lightning: 'bolt_lightning.png',
    shadow: 'orb_shadow.png'
  };
  var NAMES = ['slash', 'wave', 'fire', 'poison', 'heal', 'lightning', 'shadow'];

  var state = {};
  var listeners = [];
  var api = { ready: true, loaded: 0, total: NAMES.length, __lazy: true };

  function isReadyImg(img) {
    return !!(img && img.width > 0 && img.height > 0);
  }

  function recomputeReady() {
    var pending = 0;
    for (var i = 0; i < NAMES.length; i++) {
      if (state[NAMES[i]].status === 'loading') pending++;
    }
    api.ready = pending === 0;
  }

  function notify() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](api); } catch (e) { /* 静默 */ }
    }
  }

  function load(name) {
    var st = state[name];
    var img = new root.Image();
    var t0 = (typeof root.performance !== 'undefined' && root.performance.now)
      ? root.performance.now() : Date.now();
    st.img = img;
    st.status = 'loading';
    st.ms = 0;
    st.url = BASE + FILES[name] + VER;
    api[name] = img;                 // 旧引用先挂上：width>0 才算就绪

    img.onload = function () {
      if (isReadyImg(img)) {
        st.status = 'loaded';
        st.ms = ((typeof root.performance !== 'undefined' && root.performance.now)
          ? root.performance.now() : Date.now()) - t0;
        api.loaded++;
      } else {
        st.status = 'error';
        st.img = null;
        api[name] = null;
      }
      recomputeReady();
      notify();
    };
    img.onerror = function () {
      st.status = 'error';
      st.img = null;
      api[name] = null;              // 静默失败 → 回退程序化绘制
      recomputeReady();
      notify();
    };
    try {
      img.src = st.url;
    } catch (e) {
      st.status = 'error';
      st.img = null;
      api[name] = null;
      recomputeReady();
      notify();
    }
  }

  /** 首次需要时发起加载；已在途/已完成则直接返回当前结果。 */
  function ensure(name) {
    if (!FILES[name]) return null;
    var st = state[name];
    if (!st) return null;
    if (st.status === 'idle') load(name);
    return st.status === 'loaded' ? st.img : null;
  }

  /** 只读取图：不触发网络请求。 */
  function get(name) {
    var st = state[name];
    return (st && st.status === 'loaded') ? st.img : null;
  }

  function status(name) {
    var st = state[name];
    return st ? st.status : 'idle';
  }

  function snapshot() {
    var out = {};
    for (var i = 0; i < NAMES.length; i++) {
      var n = NAMES[i], st = state[n];
      out[n] = {
        status: st.status,
        width: st.img ? st.img.width : 0,
        height: st.img ? st.img.height : 0,
        ms: Math.round(st.ms * 10) / 10,
        url: st.url || null
      };
    }
    out.ready = api.ready;
    out.loaded = api.loaded;
    return out;
  }

  for (var j = 0; j < NAMES.length; j++) {
    state[NAMES[j]] = { status: 'idle', img: null, ms: 0, url: null };
    api[NAMES[j]] = null;
  }

  api.ensure = ensure;
  api.get = get;
  api.status = status;
  api.onReady = function (cb) {
    if (typeof cb === 'function') listeners.push(cb);
  };
  api.__snapshot = snapshot;

  root.PQAI_VFX = api;
}(typeof window !== 'undefined' ? window : null));
