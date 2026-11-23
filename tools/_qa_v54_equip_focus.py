# -*- coding: utf-8 -*-
"""装备态定向补拍：钉相机对准玩家，回读站位，截图 + 玩家包围盒裁剪放大。"""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from playwright.sync_api import sync_playwright  # noqa: E402
from _qa_v54_common import AFTER_HTML, QA_DIR, AFTER_DIR, file_url, seed_profile  # noqa: E402
from PIL import Image  # noqa: E402

PROFILE = seed_profile(hero='knight', skin='sprout',
                       equip={'w': 1, 'h': 2, 'c': 3},
                       inv=[{'id': 1, 'slot': 'w', 'r': 4},
                            {'id': 2, 'slot': 'h', 'r': 2},
                            {'id': 3, 'slot': 'c', 'r': 3}])

PIN = r"""() => {
  const p = game.player; if (!p) return null;
  p.vx = 0; p.vy = 0; p.onGround = true; p.dead = false; p.invT = 0;
  const L = game.level || {};
  const maxX = Math.max(0, (L.w || 24) * 16 - 384);
  const maxY = Math.max(0, (L.h || 14) * 16 - 224);
  game.cam.x = Math.max(0, Math.min(maxX, p.x - 120));
  game.cam.y = Math.max(0, Math.min(maxY, p.y - 100));
  return { x: Math.round(p.x), y: Math.round(p.y), w: p.w, h: p.h,
           camX: Math.round(game.cam.x), camY: Math.round(game.cam.y), face: p.face,
           tick: game.tick, invT: p.invT, hp: p.hp };
}"""

def main():
    with sync_playwright() as pw:
        br = pw.chromium.launch()
        pg = br.new_page(viewport={'width': 1280, 'height': 800})
        pg.goto(file_url(AFTER_HTML))
        pg.evaluate("() => localStorage.clear()")
        pg.evaluate("(p) => localStorage.setItem('pq_progress', JSON.stringify(p))", PROFILE)
        pg.goto(file_url(AFTER_HTML) + '?level=7&hero=knight&god=1')
        pg.wait_for_timeout(2500)
        pg.evaluate("(a) => { game.player.x = a.x; game.player.y = a.y; }", {'x': 170, 'y': 180})
        pg.wait_for_timeout(300)
        pos = pg.evaluate(PIN)
        pg.wait_for_timeout(180)
        pg.evaluate(PIN)
        full = AFTER_DIR / 'after_equip_equipped_world_focus.png'
        pg.locator('#game').screenshot(path=str(full))
        pg.wait_for_timeout(260)
        pg.evaluate(PIN)
        full2 = AFTER_DIR / 'after_equip_equipped_world_focus2.png'
        pg.locator('#game').screenshot(path=str(full2))
        print('pos', pos)
        br.close()

    for tag, full in (('1', full), ('2', full2)):
        im = Image.open(full)
        W, H = im.size
        sx = W / 768.0
        p = pos
        x0 = (p['x'] - p['w'] / 2 - 6) * 2 * sx
        x1 = (p['x'] + p['w'] / 2 + 6) * 2 * sx
        y0 = (p['y'] - 10) * 2 * sx
        y1 = (p['y'] + p['h'] + 2) * 2 * sx
        crop = im.crop((max(0, int(x0)), max(0, int(y0)), min(W, int(x1)), min(H, int(y1))))
        crop = crop.resize((crop.width * 4, crop.height * 4), Image.NEAREST)
        out = AFTER_DIR / ('_zoom_equipped_player_%s.png' % tag)
        crop.save(out)
        print('crop box', x0, y0, x1, y1, '->', out)

if __name__ == '__main__':
    main()
