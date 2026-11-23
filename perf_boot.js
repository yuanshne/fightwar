/* perf_boot.js — 首屏/加载性能探针 + 轻量优化层（卡点 E 独占，可回退）
 * ---------------------------------------------------------------------------
 * 职责：
 *   1. 生命周期打点：domReady / scriptsDone / aiHeroReady / aiMageReady /
 *      firstTick / playable，配合 init 注入脚本采集每个 Image 的加载/解码耗时；
 *   2. FPS 采样（独立 rAF 计数，不干扰游戏主循环）与内存快照；
 *   3. 生产路径零阻塞：探针仅在打点/采样，不改动任何游戏数值与视觉管线。
 * 入口约定：window.PQ_PERF_BOOT = { ready, mark, marks, report }
 * 注意：本文件在页面所有业务脚本之后加载，跨脚本可见的全局（如 game）以
 * 防御性 try 读取，探针自身任何异常都不得外抛影响启动。
 */
(function () {
  'use strict';
  if (window.PQ_PERF_BOOT && window.PQ_PERF_BOOT.__stub !== true) return;

  function now() {
    return (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Date.now();
  }

  var T0 = now();
  var marks = { scriptsDone: 0 };
  var frames = [];            // 探针 rAF 时间戳（ms，相对 T0）
  var memory = [];
  var playableAt = null;

  function mark(name) {
    if (!name) return;
    if (marks[name] == null) marks[name] = now() - T0;
  }

  /* ---------- 可操作判定：game.player 存在且 tick 连续推进 ---------- */
  function readGame() {
    try { if (typeof game !== 'undefined' && game) return game; } catch (e) {}
    try { if (window.game) return window.game; } catch (e2) {}
    return null;
  }

  var lastTick = -1, stable = 0, poll = null;
  function pollPlayable() {
    var g = readGame();
    if (!g) return;
    mark('firstTick');
    if (typeof g.tick === 'number') {
      if (g.tick !== lastTick) {
        lastTick = g.tick;
        stable++;
        // 平台关有 game.player；街机关 game.player=null 但 state='play'，tick 推进即代表可操作
        var active = g.player || g.state === 'play';
        if (stable >= 2 && active && playableAt == null) {
          playableAt = now() - T0;
          marks.playable = playableAt;
          snapMemory('playable');
        }
      }
    }
  }

  /* ---------- AI 层就绪标记（只读既有窗口标志，不等待） ---------- */
  function pollFlags() {
    try {
      var h = window.PQ_HERO_SKIN_AI;
      if (h && h.ready) mark('aiHeroReady');
      var m = window.PQ_MAGE_SKIN_AI;
      if (m && m.ready) mark('aiMageReady');
      if (window.PQAI_BG && window.PQAI_BG.ready) mark('aiBgReady');
      if (window.PQAI_TILES_READY) mark('aiTilesReady');
      if (window.PQAI_BOSS_GALLERY_READY) mark('aiBossReady');
    } catch (e) { /* 只读，异常吞掉 */ }
  }

  /* ---------- FPS 独立采样循环 ---------- */
  var rafOk = (typeof requestAnimationFrame === 'function');
  function fpsLoop() {
    frames.push(now() - T0);
    if (rafOk) requestAnimationFrame(fpsLoop);
  }

  /* ---------- 内存快照 ---------- */
  function snapMemory(stage) {
    try {
      var heap = null, detail = {};
      if (performance.memory && typeof performance.memory.usedJSHeapSize === 'number') {
        heap = performance.memory.usedJSHeapSize;
        detail.usedJSHeapSize = heap;
        detail.totalJSHeapSize = performance.memory.totalJSHeapSize || null;
        detail.limit = performance.memory.jsHeapSizeLimit || null;
      }
      var canvases = 0, px = 0;
      try {
        var list = document.querySelectorAll('canvas');
        for (var i = 0; i < list.length; i++) {
          canvases++;
          px += (list[i].width || 0) * (list[i].height || 0);
        }
      } catch (e2) {}
      memory.push({
        stage: stage,
        at: now() - T0,
        heapBytes: heap,
        canvasCount: canvases,
        canvasPixels: px,
        canvasEstBytes: px * 4
      });
    } catch (e) { /* 无内存 API 时跳过 */ }
  }

  /* ---------- FPS 汇总：可操作之后的帧窗口 ---------- */
  function summarizeFps() {
    var start = playableAt != null ? playableAt : 0;
    var dt = [];
    var prev = null;
    for (var i = 0; i < frames.length; i++) {
      if (frames[i] < start) continue;
      if (prev != null && frames[i] > prev) dt.push(frames[i] - prev);
      prev = frames[i];
    }
    if (!dt.length) return { frames: 0, span: 0, mean: null, min: null, lowShare: null };
    var span = (frames[frames.length - 1] - start) / 1000;
    var mean = dt.length / span;
    var min = Math.min.apply(null, dt);
    var low = 0;
    for (var j = 0; j < dt.length; j++) if (dt[j] > 33.34) low++;
    return {
      frames: dt.length + 1,
      span: +span.toFixed(3),
      meanFps: +mean.toFixed(2),
      minFrameMs: +min.toFixed(2),
      lowFpsShare: +(low / dt.length).toFixed(3),
      dts: dt.map(function (x) { return +x.toFixed(2); })
    };
  }

  function report() {
    snapMemory('report');
    return {
      t0: T0,
      marks: marks,
      playableAt: playableAt,
      fps: summarizeFps(),
      memory: memory,
      assetCount: (window.__PERF_ASSETS || []).length,
      fetchCount: (window.__PERF_FETCH || []).length
    };
  }

  var api = {
    __stub: false,
    ready: false,
    mark: mark,
    marks: function () { return marks; },
    report: report
  };
  window.PQ_PERF_BOOT = api;

  try {
    mark('scriptsDone');
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { mark('domReady'); }, { once: true });
    } else {
      mark('domReady');
    }
    snapMemory('boot');
    if (rafOk) requestAnimationFrame(fpsLoop);
    poll = setInterval(function () {
      pollPlayable();
      pollFlags();
      if (playableAt != null && ++api._n > 40) { clearInterval(poll); } // 2s 后停止轮询可操作
    }, 50);
  } catch (e) { /* 探针异常不得影响游戏 */ }
})();
