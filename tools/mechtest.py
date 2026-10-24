# -*- coding: utf-8 -*-
# 机关定点测试：终点结算+星级存档 / 拉杆切换 / 钥匙开门
from playwright.sync_api import sync_playwright
import pathlib

BASE = 'http://127.0.0.1:8765/index.html'
OUT = pathlib.Path(__file__).parent.parent / 'testshots'
errors = []

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={'width': 1152, 'height': 680})
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)

    # 1) L1 终点旗 → 结算界面 + 星级存档
    pg.goto(BASE + '?level=1'); pg.wait_for_timeout(600)
    pg.evaluate("() => { game.player.x = game.level.goal.x - 2; game.player.y = game.level.goal.y + 4; }")
    pg.wait_for_timeout(1500)
    st = pg.evaluate("() => ({state: game.state, stars: JSON.parse(localStorage.getItem('pq_progress')||'{}').stars, unlocked: JSON.parse(localStorage.getItem('pq_progress')||'{}').unlocked})")
    pg.screenshot(path=str(OUT / 'clear.png'))
    print('终点测试:', st)

    # 2) L4 拉杆 → switchState 翻转 + a/b 砖实心互换
    pg.goto(BASE + '?level=4'); pg.wait_for_timeout(600)
    before = pg.evaluate("() => ({sw: game.switchState, aSolid: game.level.solid(13, 15, game.switchState), bSolid: game.level.solid(15, 14, game.switchState)})")
    pg.evaluate("() => { game.player.x = 5*16; game.player.y = 15*16 + 1; }")  # 站到拉杆上
    pg.keyboard.down('ArrowRight'); pg.wait_for_timeout(400); pg.keyboard.up('ArrowRight')
    pg.wait_for_timeout(600)
    after = pg.evaluate("() => ({sw: game.switchState, aSolid: game.level.solid(13, 15, game.switchState), bSolid: game.level.solid(15, 14, game.switchState)})")
    print('拉杆测试: before', before, '-> after', after)

    # 3) L6 钥匙+门
    pg.goto(BASE + '?level=6'); pg.wait_for_timeout(600)
    pg.evaluate("() => { game.player.x = 27*16; game.player.y = 4*16; }")      # 传送到钥匙
    pg.wait_for_timeout(800)
    k = pg.evaluate("() => ({keys: game.keys})")
    pg.evaluate("() => { game.player.x = 25*16 - 6; game.player.y = 3*16; }")  # 贴门
    pg.wait_for_timeout(800)
    d = pg.evaluate("() => ({doors: game.level.doors.size, keys: game.keys, tile: game.level.tiles[3][25]})")
    print('钥匙门测试:', k, '->', d)

    b.close()

print('ERRORS:', len(errors))
for e in errors[:5]:
    print(' -', e[:200])
