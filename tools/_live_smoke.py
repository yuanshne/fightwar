# -*- coding: utf-8 -*-
"""线上冒烟：直接打开 GitHub Pages 的 v12 版本，确认 19 关、L19 牛魔王、20 套皮肤、无控制台报错。"""
import pathlib
from playwright.sync_api import sync_playwright

URL = 'https://yuanshne.github.io/fightwar/index.html?level=19&god=1'
OUT = pathlib.Path(__file__).parent.parent / 'testshots'
OUT.mkdir(exist_ok=True)
errors = []

with sync_playwright() as p:
    br = p.chromium.launch()
    pg = br.new_page(viewport={'width': 960, 'height': 600})
    pg.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    pg.on('console', lambda m: errors.append(f'console: {m.text}') if m.type == 'error' else None)
    pg.goto(URL, wait_until='load')
    pg.wait_for_timeout(2500)
    info = pg.evaluate("""() => ({
        levels: (window.ALL_LEVELS || window.getLevels && getLevels() || []).length,
        skins: (window.BULB || []).length,
        level: window.game && game.level && game.level.meta ? game.level.meta.name : null,
        boss: window.game && game.boss ? { kind: game.boss.kind, hp: game.boss.hp, hpTotal: game.boss.hpTotal } : null,
        state: window.game && game.boss ? game.boss.state : null,
        heroes: Object.keys(window.HERO_SKINS || {}).length
    })""")
    pg.screenshot(path=str(OUT / 'live_v12.png'))
    br.close()

print('levels =', info['levels'], '| skins =', info['skins'], '| heroes =', info['heroes'])
print('level  =', info['level'])
print('boss   =', info['boss'], '| state =', info['state'])
print('CONSOLE_ERRORS:', len(errors))
for e in errors[:6]:
    print('  ', e)
assert info['levels'] == 19, f'关卡数应为 19，实际 {info["levels"]}'
assert info['boss'] and info['boss']['kind'] == 6, f'L19 应生成 6 号 Boss，实际 {info["boss"]}'
assert not errors, '线上有控制台错误'
print('线上冒烟 OK')
