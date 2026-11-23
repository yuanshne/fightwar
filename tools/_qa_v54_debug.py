# -*- coding: utf-8 -*-
"""当前主目录实时 SPR 状态 + 错误采样（3 次启动）。"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from playwright.sync_api import sync_playwright  # noqa: E402
from _qa_v54_common import AFTER_HTML, file_url, goto_level, seed_profile  # noqa: E402

PROBE = r"""() => {
  const keys = Object.keys(SPR);
  const need = ['coin','checkOn','flag','lever','slime','heartFull','gem','springC','boss1','boss2','look','knight','portal','bat','beetle'];
  return { count: keys.length, missing: need.filter(k => !SPR[k]),
    heroIdle1: SPR.heroIdle1 ? SPR.heroIdle1.width + 'x' + SPR.heroIdle1.height : null };
}"""

with sync_playwright() as pw:
    for i in range(3):
        br = pw.chromium.launch()
        pg = br.new_page(viewport={'width': 1280, 'height': 800})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        goto_level(pg, AFTER_HTML, level=7, hero='knight', profile=seed_profile(), wait=2000)
        print(i + 1, pg.evaluate(PROBE))
        print('  errs:', [e[:100] for e in errs if 'Fetch API' not in e])
        br.close()
