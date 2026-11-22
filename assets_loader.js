/* assets_loader.js - Kenney CC0 asset preloader (browser). Exposes window.PQASSETS. */
(function (root) {
  'use strict';

  var CACHE = '?v=45';

  var IMAGE_PATHS = {
    'tiles': 'assets/kenney/tiles.png',
    'sprites': 'assets/kenney/sprites.png',
    'bg-grass': 'assets/kenney/bg/bg-grass.png',
    'bg-cave': 'assets/kenney/bg/bg-cave.png',
    'bg-water': 'assets/kenney/bg/bg-water.png',
    'bg-sky': 'assets/kenney/bg/bg-sky.png',
    'bg-castle': 'assets/kenney/bg/bg-castle.png',
    'bg-ice': 'assets/kenney/bg/bg-ice.png',
    'bg-desert': 'assets/kenney/bg/bg-desert.png',
    'bg-night': 'assets/kenney/bg/bg-night.png'
  };
  var MANIFEST_PATH = 'assets/kenney/manifest.json';

  var images = {};
  var failed = [];
  var callbacks = [];
  var isReady = false;
  var pending = 0;
  var resolveReady;
  var readyPromise = new Promise(function (resolve) { resolveReady = resolve; });

  function markFailed(name) {
    if (failed.indexOf(name) === -1) failed.push(name);
  }

  function finish() {
    if (isReady) return;
    isReady = true;
    api.isReady = true;
    var list = callbacks.slice();
    callbacks.length = 0;
    for (var i = 0; i < list.length; i++) {
      try { list[i](api); } catch (e) { /* isolate listener errors */ }
    }
    resolveReady(api);
  }

  function settle() {
    pending--;
    if (pending <= 0) finish();
  }

  var api = {
    ready: readyPromise,
    isReady: false,
    manifest: null,
    onFail: failed,
    get: function (name) {
      return Object.prototype.hasOwnProperty.call(images, name) ? images[name] : null;
    },
    onReady: function (fn) {
      if (typeof fn !== 'function') return;
      if (isReady) {
        try { fn(api); } catch (e) { /* isolate listener errors */ }
        return;
      }
      callbacks.push(fn);
    }
  };

  root.PQASSETS = api;

  var canLoad = typeof document !== 'undefined' && document &&
                typeof Image === 'function';
  if (!canLoad) {
    finish();
    return;
  }

  function loadImage(name, path) {
    pending++;
    var img = new Image();
    var settled = false;

    function done(ok) {
      if (settled) return;
      settled = true;
      if (ok) {
        images[name] = img;
      } else {
        markFailed(name);
      }
      settle();
    }

    img.onload = function () { done(true); };
    img.onerror = function () { done(false); };
    img.src = path + CACHE;
  }

  var name;
  for (name in IMAGE_PATHS) {
    if (Object.prototype.hasOwnProperty.call(IMAGE_PATHS, name)) {
      loadImage(name, IMAGE_PATHS[name]);
    }
  }

  pending++;
  var manifestSettled = false;
  function manifestDone(ok, json) {
    if (manifestSettled) return;
    manifestSettled = true;
    if (ok) {
      api.manifest = json || null;
    } else {
      api.manifest = null;
      markFailed('manifest');
    }
    settle();
  }

  if (typeof fetch !== 'function') {
    manifestDone(false);
  } else {
    try {
      fetch(MANIFEST_PATH + CACHE)
        .then(function (res) {
          if (!res || !res.ok) throw new Error('manifest request failed');
          return res.json();
        })
        .then(function (json) {
          manifestDone(true, json);
        })
        .catch(function () {
          manifestDone(false);
        });
    } catch (e) {
      manifestDone(false);
    }
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
