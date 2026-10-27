# -*- coding: utf-8 -*-
# _live_check.py —— 线上 https://yuanshne.github.io/fightwar/ 实机自检
#   1) 全新 context（不吃缓存）打开首页，收集 pageerror / console.error
#   2) 校验线上 bundle 是否真是 v13：五种新类型的关键符号必须在全局可见
#   3) 真进一局（L1），跑 2 秒，确认 state 推进、无报错
#   4) 存一张截图 testshots/_live.png 供目检
import pathlib, time
from playwright.sync_api import sync_playwright

URL = 'https://yuanshne.github.io/fightwar/?t=%d' % int(time.time())
OUT = pathlib.Path(__file__).parent.parent / 'testshots'
OUT.mkdir(exist_ok=True)
errors = []

PROBE = """
() => ({
  ver:      (window.VERSION || document.documentElement.getAttribute('data-v') || 'n/a'),
  playable: typeof game === 'object' && !!game.level,
  // v13 五类型关键符号
  parryOn:  typeof _engBossHurt === 'function',
  mirrorFn: document.body.innerHTML.length >= 0 && typeof _engMirrorSettle === 'function',
  bombArt:  !!(window.SPR && SPR.bomb && SPR.mirror && SPR.pushwall),
  mistFn:   typeof _hzMist === 'function' || typeof window._hzMist === 'function',
  pushFn:   typeof _hzPushwall === 'function',
  breakT:   (function(){ const b = _engMkBoss(100, 100, 5); return 'breakT' in b; })(),
  summonCd: (function(){ const b = _engMkBoss(100, 100, 1); return 'summonCd' in b; })(),
})
"""

with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={'width': 960, 'height': 600}, bypass_csp=True)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errors.append('pageerror: %s' % e))
    pg.on('console', lambda m: errors.append('console.error: %s' % m.text) if m.type == 'error' else None)
    resp = pg.goto(URL, wait_until='load', timeout=45000)
    print('HTTP', resp.status, '->', resp.url)
    pg.wait_for_timeout(1200)
    info = pg.evaluate(PROBE)
    for k, v in info.items():
        print('  %-9s %s' % (k, v))

    # 真进一局：按 Enter 跳过标题 / 选关
    for _ in range(3):
        pg.keyboard.press('Enter')
        pg.wait_for_timeout(350)
    st = pg.evaluate("() => ({state: game.state, lv: game.levelIndex, enemies: (game.level&&game.level.enemies||[]).length, hp: game.player.hp, boss: !!game.boss})")
    print('after-enter:', st)
    pg.wait_for_timeout(2000)
    st2 = pg.evaluate("() => ({state: game.state, t: Math.round((game.t||0)*10)/10, hp: game.player.hp})")
    print('after-2s   :', st2)
    pg.screenshot(path=str(OUT / '_live.png'))
    br.close()

print('errors =', len(errors))
for e in errors[:10]:
    print(' !', e)
