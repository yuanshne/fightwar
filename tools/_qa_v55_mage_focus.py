# -*- coding: utf-8 -*-
"""法师装备/脱装世界帧定向补拍：钉相机对准玩家、invT=0 排除闪烁遮蔽，连抓两帧。"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from playwright.sync_api import sync_playwright  # noqa: E402
from _qa_v54_common import AFTER_HTML, AFTER_DIR, file_url, seed_profile  # noqa: E402

PIN = r"""() => {
  const p = game.player; if (!p) return null;
  p.vx = 0; p.vy = 0; p.onGround = true; p.dead = false; p.invT = 0;
  const L = game.level || {};
  const maxX = Math.max(0, (L.w || 24) * 16 - 384);
  const maxY = Math.max(0, (L.h || 14) * 16 - 224);
  game.cam.x = Math.max(0, Math.min(maxX, p.x - 120));
  game.cam.y = Math.max(0, Math.min(maxY, p.y - 100));
  return { x: Math.round(p.x), y: Math.round(p.y), w: p.w, h: p.h, face: p.face, tick: game.tick };
}"""

STATES = [
    ('equipped', 'sprout', {'w': 1, 'h': 2, 'c': 3},
     [{'id': 1, 'slot': 'w', 'r': 4}, {'id': 2, 'slot': 'h', 'r': 2}, {'id': 3, 'slot': 'c', 'r': 3}]),
    ('unequipped', 'sprout', {'w': -1, 'h': -1, 'c': -1}, []),
]

with sync_playwright() as pw:
    for state, skin, equip, inv in STATES:
        prof = seed_profile(hero='mage', skin=skin, equip=equip, inv=inv)
        br = pw.chromium.launch()
        pg = br.new_page(viewport={'width': 1280, 'height': 800})
        pg.goto(file_url(AFTER_HTML))
        pg.evaluate("() => localStorage.clear()")
        pg.evaluate("(p) => localStorage.setItem('pq_progress', JSON.stringify(p))", prof)
        pg.goto(file_url(AFTER_HTML) + '?level=7&hero=mage&god=1')
        pg.wait_for_timeout(3000)
        pg.evaluate("(a) => { game.player.x = a.x; game.player.y = a.y; }", {'x': 170, 'y': 180})
        pg.wait_for_timeout(300)
        pos = pg.evaluate(PIN)
        pg.wait_for_timeout(180)
        pg.evaluate(PIN)
        out = AFTER_DIR / ('after_equip_mage_%s_world_focus.png' % state)
        pg.locator('#game').screenshot(path=str(out))
        print(state, pos, '->', out)
        br.close()
