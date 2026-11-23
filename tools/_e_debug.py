# -*- coding: utf-8 -*-
import pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(r'C:\Users\A\Desktop\youxi')
src = (ROOT / 'tools' / '_v56_perf_probe.py').read_text(encoding='utf-8')
INIT = src.split('INIT_JS = r"""')[1].split('"""')[0]

with sync_playwright() as pw:
    br = pw.chromium.launch(headless=True)
    pg = br.new_page()
    pg.add_init_script(INIT)
    pg.goto('file:///C:/Users/A/Desktop/youxi/index.html?level=7&god=1', wait_until='load')
    pg.wait_for_timeout(3000)
    a = pg.evaluate('()=>window.__PERF_ASSETS||[]')
    for x in a:
        if 'dragon' in x['url'] or 'tex_' in x['url']:
            print('%-40s start=%7.1f end=%7.1f dur=%6.1f err=%s' % (
                x['norm'], x['start'] or -1, x['end'] or -1, x['dur'] or -1, x['error']))
    br.close()
