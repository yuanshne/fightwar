/* asset_gate.js — 启动就绪门（卡点 B）
 * 目标：把「关键 AI 帧 + 6 个 *White 敌人帧」纳入启动就绪条件（全部完成或超时兜底），
 *       消除 2.5s 探针时点偶发缺 6 个 *White 键（165/171）的抖动。
 * 入口：window.PQ_ASSET_GATE = {
 *   ready:boolean, required:[], missing(), wait(cb, timeoutMs), report(), notify()
 * }
 * 契约：
 *   - 本门只是观察者，不挂主循环、不改 SPR；未就绪时游戏照常可玩。
 *   - 超时兜底放行：最长等待 ~3s，超时即回调（缺键只是视觉降级，绝不卡死黑屏）。
 *   - 本文件任何异常都不得阻断启动；wait/report 内部全部 try-catch。
 */
(function () {
  'use strict';
  if (window.PQ_ASSET_GATE && window.PQ_ASSET_GATE.__stub !== true) return;

  var DEFAULT_TIMEOUT = 3000;   // 超时兜底上限 ~3s（>3s 视为首屏延迟不合格）
  var POLL_MS = 50;             // 轮询粒度；AI 模块就绪后也会主动 notify() 触发复查

  // 关键帧清单（均为 v54 基线上真实存在的键；按 主角基线 / 主角 AI 覆盖 / 法师 /
  // 小怪 / Boss 基线 / UI 核心 / 6 个 *White 受击白闪帧 分组）。
  // 6 个 *White 由 enemy_art.js 异步构建（bat/spitter/beetle/hopper/boomer/jelly），
  // 是此前 2.5s 探针抖动缺键的来源，必须被等待，而不是碰运气晚到。
  var REQUIRED = [
    // —— 主角基线帧（art.js buildSprites 同步产出） ——
    'heroIdle1', 'heroIdle2', 'heroJump', 'heroFall', 'heroAttack', 'heroDash',
    'heroSquash', 'heroDashWind', 'heroAttackGold', 'heroRun',
    // —— 主角 AI 覆盖帧（ai_sprites.js applyHero 异步写入） ——
    'idle1', 'idle2', 'run', 'jump', 'fall', 'attack', 'dash', 'squash',
    'dashWind', 'attackGold',
    // —— 法师帧（mage_ai.js 异步写入 mg*） ——
    'mgIdle1', 'mgIdle2', 'mgJump', 'mgFall', 'mgAttack', 'mgCast', 'mgDash',
    'mgRun', 'mgDashWind', 'mgSquash',
    // —— 小怪基线帧 ——
    'slime', 'slimeDead', 'bat', 'beetle', 'beetleDead', 'spitter', 'spitterDead',
    'hopper', 'hopperDead', 'jelly', 'boomer', 'mage', 'mageCast', 'knight',
    'knightDead', 'knightGuard', 'lancer', 'ghost',
    // —— Boss 基线（art.js 同步部件对象；AI 原画走 PQAI_BOSS_DRAW 覆盖） ——
    'boss', 'boss2', 'boss3', 'boss4', 'boss5', 'boss6', 'boss7', 'boss8',
    'boss9', 'boss10', 'boss11', 'boss12', 'boss13', 'boss14',
    // —— UI / 核心道具与机关（基线从不缺失，纳入做完整性兜底） ——
    'coin', 'checkOn', 'checkOff', 'flag', 'look', 'heartFull', 'heartEmpty',
    'gem', 'lever', 'springC', 'springX', 'key', 'chest', 'lantern', 'portal',
    'bossGhost', 'cover', 'puzzleUI', 'eliteCrown', 'saw', 'cannon', 'bullet',
    'spike', 'bomb', 'mirror', 'pushwall', 'totem', 'shrineOff', 'shrineOn',
    'icoW', 'icoH', 'icoC', 'icoBag',
    // —— AI 技能特效帧（ai_skillfx.js 异步构建；shieldBubble 此前 ~300ms 晚到） ——
    'shieldBubble',
    // —— 6 个 *White 敌人受击白闪帧（异步 enemy_art.js 构建，本门重点等待对象） ——
    'batWhite', 'spitterWhite', 'beetleWhite', 'hopperWhite', 'boomerWhite',
    'jellyWhite'
  ];

  var state = {
    resolved: false,      // 门是否已放行（全部就绪或超时兜底）
    ready: false,         // 全部 required 是否在位
    timedOut: false,
    waitedMs: 0,
    waitStart: 0,
    callbacks: [],
    pollTimer: null,
    fallbackTimer: null
  };

  function spr() {
    try { return (typeof SPR !== 'undefined' && SPR) ? SPR : null; } catch (e) { return null; }
  }

  function has(k) {
    var s = spr();
    if (!s) return false;
    var v;
    try { v = s[k]; } catch (e) { return false; }
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  }

  function missing() {
    var out = [];
    for (var i = 0; i < REQUIRED.length; i++) {
      if (!has(REQUIRED[i])) out.push(REQUIRED[i]);
    }
    return out;
  }

  function totalKeys() {
    var s = spr();
    if (!s) return 0;
    try { return Object.keys(s).length; } catch (e) { return 0; }
  }

  function report() {
    return {
      ready: state.ready,            // required 是否全部在位
      released: state.resolved,     // 门是否已放行（就绪或超时兜底）
      missing: missing(),           // 仍缺的键（超时兜底后也如实列出）
      waitedMs: state.waitedMs,     // 从 wait() 首次调用到放行的耗时
      timedOut: state.timedOut,     // 是否走了超时兜底
      requiredCount: REQUIRED.length,
      totalKeys: totalKeys(),
      stub: false
    };
  }

  function finish(timedOut) {
    if (state.resolved) return;
    state.resolved = true;
    state.timedOut = !!timedOut;
    state.ready = missing().length === 0;
    state.waitedMs = state.waitStart ? (Date.now() - state.waitStart) : 0;
    try { window.PQ_ASSET_GATE.ready = state.ready; } catch (e) {}
    if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
    if (state.fallbackTimer) { clearTimeout(state.fallbackTimer); state.fallbackTimer = null; }
    var cbs = state.callbacks.slice();
    state.callbacks.length = 0;
    var rep = report();
    for (var i = 0; i < cbs.length; i++) {
      try { cbs[i](rep); } catch (e) { /* 单个回调异常不影响其他等待者 */ }
    }
  }

  function check() {
    if (state.resolved) return;
    if (missing().length === 0) finish(false);
  }

  // AI 模块（ai_sprites.js 等）就绪写帧后主动调用，触发即时复查（回调优先于轮询）。
  function notify() { try { check(); } catch (e) {} }

  // wait(cb, timeoutMs)：全部就绪或超时兜底时回调一次；cb 收到 report() 快照。
  function wait(cb, timeoutMs) {
    var to = (typeof timeoutMs === 'number' && isFinite(timeoutMs) && timeoutMs > 0)
      ? timeoutMs : DEFAULT_TIMEOUT;
    if (!state.waitStart) state.waitStart = Date.now();
    if (state.resolved) { if (typeof cb === 'function') { try { cb(report()); } catch (e) {} } return; }
    if (typeof cb === 'function') state.callbacks.push(cb);

    if (missing().length === 0) { finish(false); return; }

    if (!state.pollTimer) {
      state.pollTimer = setInterval(function () {
        if (state.resolved) return;
        check();
        if (!state.resolved && state.waitStart && Date.now() - state.waitStart >= to) finish(true);
      }, POLL_MS);
    }
    // 独立兜底定时器：即使轮询被节流，到点也一定放行，绝不卡死黑屏。
    if (!state.fallbackTimer) {
      state.fallbackTimer = setTimeout(function () { finish(true); }, to);
    }
  }

  window.PQ_ASSET_GATE = {
    __stub: false,
    ready: false,
    required: REQUIRED.slice(),
    missing: missing,
    wait: wait,
    report: report,
    notify: notify
  };
})();
