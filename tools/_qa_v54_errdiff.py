# -*- coding: utf-8 -*-
"""
_qa_v54_errdiff.py —— 专项：同一冒烟流程分别跑基线(.snap_before)与主目录，
全量 diff pageerror / console error；统计 SPR 键数量与缺失键名。

输出：.screenshots/qa/errdiff.json
"""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from playwright.sync_api import sync_playwright  # noqa: E402
from _qa_v54_common import BEFORE_HTML, AFTER_HTML, QA_DIR, file_url, seed_profile, goto_level  # noqa: E402

INIT = r"""
window.__errs = { pageerror: [], console_error: [], rejection: [] };
window.addEventListener('error', e => window.__errs.pageerror.push(
  (e.message || '') + ' @ ' + (e.filename || '') + ':' + (e.lineno || '')));
window.addEventListener('unhandledrejection', e => window.__errs.rejection.push(String(e.reason)));
const _ce = console.error;
console.error = function () {
  window.__errs.console_error.push(Array.prototype.map.call(arguments, String).join(' '));
  _ce.apply(console, arguments);
};
"""

SPR_PROBE = r"""() => ({
  keys: Object.keys(SPR).sort(),
  count: Object.keys(SPR).length,
  heroIdle1: !!(SPR.heroIdle1),
  coin: !!SPR.coin, checkOn: !!SPR.checkOn, flag: !!SPR.flag, lever: !!SPR.lever,
  slime: !!SPR.slime, boss1: !!SPR.boss1, heartFull: !!SPR.heartFull,
  gem: !!SPR.gem, springC: !!SPR.springC, icoW: !!SPR.icoW, look: !!SPR.look
})"""


def run_base(pw, label, html):
    br = pw.chromium.launch()
    pg = br.new_page(viewport={'width': 1280, 'height': 800})
    pg.add_init_script(INIT)
    py_errs = {'pageerror': [], 'console_error': []}
    pg.on('pageerror', lambda e: py_errs['pageerror'].append(str(e)))
    pg.on('console', lambda m: py_errs['console_error'].append(m.text) if m.type == 'error' else None)

    pg.goto(file_url(html))
    pg.wait_for_timeout(2200)
    title_spr = pg.evaluate(SPR_PROBE)
    goto_level(pg, html, level=7, hero='knight', profile=seed_profile(), wait=2200)
    l7_spr = pg.evaluate(SPR_PROBE)
    inpage = pg.evaluate("() => window.__errs")
    br.close()
    return {
        'label': label, 'html': str(html),
        'pageerror': sorted(set(py_errs['pageerror'] + inpage['pageerror'])),
        'console_error': sorted(set(py_errs['console_error'] + inpage['console_error'])),
        'rejection': sorted(set(inpage['rejection'])),
        'spr_title': title_spr, 'spr_l7': l7_spr,
    }


def main():
    with sync_playwright() as pw:
        before = run_base(pw, 'before', BEFORE_HTML)
        after = run_base(pw, 'after', AFTER_HTML)

    b_keys = set(before['spr_l7']['keys'])
    a_keys = set(after['spr_l7']['keys'])
    missing = sorted(b_keys - a_keys)
    added = sorted(a_keys - b_keys)

    def env(e):
        return ('file://' in e and 'Fetch API' in e)

    diff = {
        'before': before, 'after': after,
        'spr': {
            'before_count': len(b_keys), 'after_count': len(a_keys),
            'missing_in_after': missing, 'added_in_after': added,
        },
        'errors': {
            'new_pageerror': sorted(set(after['pageerror']) - set(before['pageerror'])),
            'new_console_real': sorted(e for e in (set(after['console_error']) - set(before['console_error'])) if not env(e)),
            'new_console_env_filefetch': sorted(e for e in (set(after['console_error']) - set(before['console_error'])) if env(e)),
            'before_console_env_filefetch': sorted(e for e in before['console_error'] if env(e)),
        },
    }
    out = QA_DIR / 'errdiff.json'
    out.write_text(json.dumps(diff, ensure_ascii=False, indent=2), encoding='utf-8')

    print('SPR 键：before %d / after %d；缺失 %d，新增 %d' %
          (len(b_keys), len(a_keys), len(missing), len(added)))
    print('缺失键：', ', '.join(missing))
    print('新增 pageerror：', diff['errors']['new_pageerror'])
    print('新增 console(真实)：')
    for e in diff['errors']['new_console_real']:
        print('  -', e[:200])
    print('新增 console(file fetch 环境性)：', len(diff['errors']['new_console_env_filefetch']))
    print('基线 file fetch 条数：', len(diff['errors']['before_console_env_filefetch']))


if __name__ == '__main__':
    main()
