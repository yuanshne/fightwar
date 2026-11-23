# -*- coding: utf-8 -*-
"""L30/L31 定点复测：盯防并行编辑中间态留下的 bakeAvailable 报错。"""
import pathlib, sys
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = 'file:///' + str(ROOT / 'index.html').replace('\\', '/')

def run(pg, lv):
    errs, cons = [], []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: cons.append(m.text) if m.type == 'error' else None)
    pg.goto(BASE + '?level=%d' % lv)
    pg.wait_for_timeout(2600)
    info = pg.evaluate("() => { const g = game; return { state: g.state, tick: g.tick, "
                      "tiles: (window.PQAI_TILES && PQAI_TILES.ready) || 'n/a', "
                      "spr: Object.keys(SPR).length }; }")
    bad = [c for c in cons if 'Fetch API cannot load' not in c and 'scheme' not in c]
    return info, errs, bad

with sync_playwright() as p:
    br = p.chromium.launch()
    pg = br.new_page()
    ok = True
    for lv in (30, 31):
        info, errs, bad = run(pg, lv)
        print('L%d state=%s tick=%s tiles=%s spr=%s pageerror=%d consoleErr=%d'
              % (lv, info['state'], info['tick'], info['tiles'], info['spr'], len(errs), len(bad)))
        for b in bad[:3]: print('   console:', b[:160])
        for e in errs[:3]: print('   pageerror:', e[:160])
        if errs or bad: ok = False
    br.close()
print('结果:', 'PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)
