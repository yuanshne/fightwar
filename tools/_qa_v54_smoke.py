# -*- coding: utf-8 -*-
"""主目录快速冒烟：引导 / 错误 / 帧审计 / 就绪标记。"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from playwright.sync_api import sync_playwright  # noqa: E402
from _qa_v54_common import (  # noqa: E402
    AFTER_HTML, audit_frames, goto_level, seed_profile, summarize_16x16,
)

with sync_playwright() as pw:
    br = pw.chromium.launch()
    pg = br.new_page(viewport={'width': 1280, 'height': 800})
    errs = {'pageerror': [], 'console_error': []}
    pg.on('pageerror', lambda e: errs['pageerror'].append(str(e)))
    pg.on('console', lambda m: errs['console_error'].append(m.text) if m.type == 'error' else None)

    goto_level(pg, AFTER_HTML, level=7, hero='knight', profile=seed_profile(), wait=2000)
    st = pg.evaluate("() => ({ state: game.state, hero: game.hero,"
                     " boss: game.boss ? { kind: game.boss.kind, state: game.boss.state } : null })")
    print('state:', st)
    a = audit_frames(pg)
    n16, bad = summarize_16x16(a)
    print('16x16:', n16, 'bad total:', len(bad))
    for b in bad[:30]:
        print('  ', b)
    print('flags:', a['flags'])
    print('pageerror:', errs['pageerror'])
    print('console_error count:', len(errs['console_error']))
    for e in errs['console_error'][:10]:
        print('  ', e[:140])
    br.close()
