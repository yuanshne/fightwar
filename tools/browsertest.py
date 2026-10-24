# -*- coding: utf-8 -*-
# 浏览器集成实测：加载/控制台错误/逐关截图/按键模拟
from playwright.sync_api import sync_playwright
import pathlib, sys

BASE = 'file:///C:/Users/A/.zcode/workspace/draft-6e5b5889-432a-4c7b-aabe-13a594a464ac/pixel-quest/index.html'
OUT = pathlib.Path(__file__).parent.parent / 'testshots'
OUT.mkdir(exist_ok=True)
errors = []

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={'width': 1152, 'height': 680})
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append('PAGEERROR: ' + str(e)))
    pg.goto(BASE); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(900)
    pg.screenshot(path=str(OUT / 'title.png'))
    pg.keyboard.press('Enter'); pg.wait_for_timeout(700)
    pg.screenshot(path=str(OUT / 'select.png'))
    for lv in range(1, 8):
        pg.goto(f'{BASE}?level={lv}')
        pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(600)
        s1 = pg.evaluate("() => ({x:Math.round(game.player.x), y:Math.round(game.player.y), state:game.state, name:game.level.meta.name, coins:game.level.coins.filter(c=>!c.got).length, parts:game.parts.length})")
        pg.screenshot(path=str(OUT / f'lv{lv}_start.png'))
        pg.keyboard.down('ArrowRight'); pg.wait_for_timeout(700)
        pg.keyboard.down('ArrowUp'); pg.wait_for_timeout(220); pg.keyboard.up('ArrowUp')
        pg.wait_for_timeout(600)
        s2 = pg.evaluate("() => ({x:Math.round(game.player.x), y:Math.round(game.player.y), dead:game.player.dead, deaths:game.deaths, onG:game.player.onGround})")
        pg.keyboard.up('ArrowRight'); pg.wait_for_timeout(250)
        pg.screenshot(path=str(OUT / f'lv{lv}_move.png'))
        moved = s2['x'] - s1['x']
        print(f"L{lv} [{s1['name']}] state={s1['state']} spawn=({s1['x']},{s1['y']}) coins={s1['coins']} | after-input=({s2['x']},{s2['y']}) dx={moved} dead={s2['dead']} deaths={s2['deaths']}")
    b.close()

print('CONSOLE_ERRORS:', len(errors))
for e in errors[:8]:
    print(' -', e[:240])
sys.exit(1 if errors else 0)
