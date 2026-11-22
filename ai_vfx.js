/* ai_vfx.js — AI 特效贴图加载器（纯视觉层）
   只读提供 7 张特效图；任一失败都静默置空，combatfx.js 自动回退程序化特效。
   不参与伤害/判定/时序，也不写 game。 */
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

  var api = { ready: false, loaded: 0, total: NAMES.length };
  var left = NAMES.length;
  for (var i = 0; i < NAMES.length; i++) api[NAMES[i]] = null;

  function settle() {
    left--;
    if (left <= 0) api.ready = true;
  }

  function load(name) {
    var img = new root.Image();
    api[name] = img;              // 引用先挂上：width>0 才算就绪
    img.onload = function () {
      api.loaded++;
      settle();
    };
    img.onerror = function () {
      api[name] = null;           // 静默失败 → 回退程序化绘制
      settle();
    };
    try {
      img.src = BASE + FILES[name] + VER;
    } catch (e) {
      api[name] = null;
      settle();
    }
  }

  for (var j = 0; j < NAMES.length; j++) load(NAMES[j]);

  root.PQAI_VFX = api;
}(typeof window !== 'undefined' ? window : null));
