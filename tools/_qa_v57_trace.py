# -*- coding: utf-8 -*-
"""_qa_v57_trace.py — 帧级追踪霜爆冰锥去向（只读，QA 诊断用）。"""
import json
import pathlib

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(r'C:\Users\A\Desktop\youxi')
HTML = ROOT / 'index.html'

PROFILE = {'unlocked': 31, 'stars': {str(i): 3 for i in range(31)},
           'equip': {'w': -1, 'h': -1, 'c': -1}, 'inv': [], 'shards': {}, 'nextId': 2,
           'unlockAll': True, 'skin': 'blue', 'skins': ['blue'], 'hero': 'mage'}

SETUP = r"""
() => {
  const L = game.level, p = game.player;
  L.enemies.length = 0; game.hazards.length = 0; game.bullets.length = 0;
  game.waves.length = 0; game.wells.length = 0; game.shots.length = 0; game.boss = null;
  const solid = (tx, ty) => L.solid(tx, ty, game.switchState);
  let groundTy = -1, runX = -1, runLen = 0;
  outer: for (let ty = 2; ty < L.h - 1; ty++) for (let tx = 2; tx < L.w - 2; tx++) {
    if (!solid(tx, ty) || solid(tx, ty - 1) || solid(tx, ty - 2)) continue;
    let len = 0;
    while (tx + len < L.w - 2 && solid(tx + len, ty) && !solid(tx + len, ty - 1) && !solid(tx + len, ty - 2)) len++;
    if (len >= 14) { groundTy = ty; runX = tx; runLen = len; break outer; }
  }
  const floorY = groundTy * 16, gpx = runX * 16 + Math.floor(runLen / 2) * 16;
  p.x = gpx - 8; p.y = floorY - 30; p.vx = 0; p.vy = 0; p.onGround = true;
  p.dead = false; p.hp = 99; p.invT = 99;
  game.mana = 100; game.skills.u = 0; game.cdMul = 1;
  const cx = p.x + p.w / 2, cy = _engSpriteTop(p) + 19;
  const R = 34, D = 24;
  const mk = (tag, tx, ty) => {
    const e = _engMkEnemy('slime', Math.round(tx - 2), Math.round(ty - 5), false);
    e.w = 12; e.h = 10; e.x = tx - 6; e.y = ty - 5; e.hx = e.x; e.hy = e.y;
    e.hp = 99; e.vx = 0; e.vy = 0; e.kb = 0; e.freezeT = 0; e.novaSeq = 0; e.dead = 0;
    e.tag = tag; e.baseX = e.x; e.baseY = e.y;
    if (e.ai) { e.ai.st = 'idle'; e.ai.cd = 99; e.ai.rng = 0; }
    L.enemies.push(e);
  };
  mk('up', cx, cy - 32); mk('upRight', cx + D, cy - 24); mk('right', cx + R, cy);
  mk('downRight', cx + D, cy + 24); mk('down', cx, cy + 32);
  mk('downLeft', cx - D, cy + 24); mk('left', cx - R, cy); mk('upLeft', cx - D, cy - 24);
  game.cam.x = Math.max(0, Math.min(Math.max(0, L.w * 16 - 384), p.x - 180));
  return { cx, cy, floorY, runX, runLen, groundTy };
}
"""

SNAP = r"""
() => ({
  shots: (game.shots || []).map(s => ({
    g: !!s.grounded, life: +s.life.toFixed(3), vx: +s.vx.toFixed(1), vy: +s.vy.toFixed(1),
    x: Math.round(s.x), y: Math.round(s.y), w: s.w, h: s.h,
    tile: (() => { const tx = Math.floor((s.x + s.w / 2) / 16), ty = Math.floor((s.y + s.h / 2) / 16);
      return game.level.tiles[ty] ? game.level.tiles[ty][tx] : '?'; })()
  })),
  mobs: game.level.enemies.map(e => ({ tag: e.tag, hp: e.hp, fz: +(e.freezeT || 0).toFixed(2), seq: e.novaSeq || 0, x: Math.round(e.x), y: Math.round(e.y) }))
})
"""

with sync_playwright() as pw:
    br = pw.chromium.launch(headless=True)
    pg = br.new_page(viewport={'width': 960, 'height': 640})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file:///' + str(HTML).replace('\\', '/') + '?level=7&hero=mage&god=1')
    pg.wait_for_timeout(300)
    pg.evaluate("(p) => localStorage.setItem('pq_progress', JSON.stringify(p))", PROFILE)
    pg.reload()
    pg.wait_for_function("() => window.game && game.player && game.state === 'play'", timeout=15000)
    pg.wait_for_timeout(800)
    setup = pg.evaluate(SETUP)
    print('setup', json.dumps(setup, ensure_ascii=False))
    pg.evaluate(r"""() => {
      window.__qaRem = []; window.__qaHit = []; window.__qaSolid = [];
      const arr = game.shots;
      const orig = arr.splice.bind(arr);
      arr.splice = function (i, n) {
        const s = arr[i];
        if (s) window.__qaRem.push({
          t: +performance.now().toFixed(1),
          vx: +s.vx.toFixed(1), vy: +s.vy.toFixed(1),
          x: Math.round(s.x), y: Math.round(s.y), w: s.w, h: s.h,
          g: !!s.grounded, life: +s.life.toFixed(3), hitWall: !!s.hitWall
        });
        return orig(i, n);
      };
      if (typeof _engShotHitEnemy === 'function') {
        const origHit = _engShotHitEnemy;
        _engShotHitEnemy = function (s, e) {
          window.__qaHit.push({ vx: +s.vx.toFixed(1), tag: e.tag || e.type, x: Math.round(s.x), y: Math.round(s.y) });
          return origHit(s, e);
        };
      }
      const L = game.level;
      const origSolid = L.solid.bind(L);
      L.solid = function (tx, ty, sw) {
        const r = origSolid(tx, ty, sw);
        if (r) window.__qaSolid.push({ tx, ty, t: +performance.now().toFixed(1) });
        return r;
      };
      window.__qaEnv = {
        decor: (game.level.decorFx || []).map(d => ({ x: Math.round(d.x), y: Math.round(d.y), type: d.type })),
        hazards: (game.hazards || []).map(h => ({ x: Math.round(h.x), y: Math.round(h.y), kind: h.kind })),
        plats: (game.level.plats || []).map(pl => ({ x: Math.round(pl.x), y: Math.round(pl.y) })),
        mini: !!game.mini
      };
    }""")
    print('env', pg.evaluate("() => window.__qaEnv"))
    pg.keyboard.press('u')
    t = 0
    for _ in range(26):
        pg.wait_for_timeout(8)
        t += 8
        snap = pg.evaluate(SNAP)
        desc = ['%s g=%d v=(%5.1f,%5.1f) (%3d,%3d) %dx%d t=%s' % (
            'S', s['g'], s['vx'], s['vy'], s['x'], s['y'], s['w'], s['h'], s['tile'])
            for s in snap['shots']]
        print('t=%3d n=%d' % (t, len(snap['shots'])), ' | '.join(desc))
    print('mobs', json.dumps(snap['mobs'], ensure_ascii=False))
    print('removals', json.dumps(pg.evaluate("() => window.__qaRem"), ensure_ascii=False))
    print('hits', json.dumps(pg.evaluate("() => window.__qaHit"), ensure_ascii=False))
    print('solidHits', json.dumps(pg.evaluate("() => window.__qaSolid"), ensure_ascii=False))
    print('errs', errs[:5])
    br.close()
