# -*- coding: utf-8 -*-
"""
_qa_v54_coldstart.py —— 启动完整性独立复核：每次全新 page + 清 localStorage + 固定存档，
?level=7 等 2.5s，记录 SPR 键数 / 缺键清单 / drawImage 报错 / pageerror。
主目录 10 次冷启动，基线快照 6 次对照。输出 .screenshots/qa/coldstart.json。
"""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from playwright.sync_api import sync_playwright  # noqa: E402
from _qa_v54_common import BEFORE_HTML, AFTER_HTML, QA_DIR, file_url, seed_profile  # noqa: E402

CRITICAL = ['coin', 'checkOn', 'checkOff', 'flag', 'lever', 'slime', 'heartFull',
            'gem', 'springC', 'look', 'knight', 'portal', 'bat', 'beetle', 'bossGhost']

PROBE = r"""(need) => {
  const keys = Object.keys(SPR);
  return { count: keys.length, keys: keys.slice().sort(),
           missing: need.filter(k => !SPR[k]),
           heroIdle1Size: SPR.heroIdle1 && SPR.heroIdle1.width ? SPR.heroIdle1.width + 'x' + SPR.heroIdle1.height : null,
           built: !!SPR.__built };
}"""


def trial(pw, html, label, idx, shots_dir):
    br = pw.chromium.launch()
    pg = br.new_page(viewport={'width': 1280, 'height': 800})
    errs, pageerr = [], []
    pg.on('pageerror', lambda e: pageerr.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.goto(file_url(html))
    pg.evaluate("() => localStorage.clear()")
    prof = seed_profile(hero='knight')
    pg.evaluate("(p) => localStorage.setItem('pq_progress', JSON.stringify(p))", prof)
    pg.goto(file_url(html) + '?level=7&hero=knight&god=1')
    pg.wait_for_timeout(2500)
    probe = pg.evaluate(PROBE, CRITICAL)
    draw = [e for e in errs if 'drawImage' in e]
    other = [e for e in errs if 'drawImage' not in e and 'Fetch API' not in e]
    rec = {'label': label, 'idx': idx, 'probe': probe,
           'drawImage_errors': len(draw), 'pageerror': pageerr, 'other_console': other}
    if probe['missing'] or draw or pageerr:
        shots_dir.mkdir(parents=True, exist_ok=True)
        pg.locator('#game').screenshot(path=str(shots_dir / ('%s_%02d.png' % (label, idx))))
        rec['evidence'] = str(shots_dir / ('%s_%02d.png' % (label, idx)))
    br.close()
    return rec


def main():
    shots = QA_DIR / 'coldstart_evidence'
    results = {'after': [], 'before': []}
    with sync_playwright() as pw:
        for i in range(10):
            results['after'].append(trial(pw, AFTER_HTML, 'after', i + 1, shots))
        for i in range(6):
            results['before'].append(trial(pw, BEFORE_HTML, 'before', i + 1, shots))

    for label in ('after', 'before'):
        rs = results[label]
        counts = [r['probe']['count'] for r in rs]
        bad = [r for r in rs if r['probe']['missing'] or r['drawImage_errors'] or r['pageerror']]
        print('%s: n=%d 键数=%s 坏态=%d' % (label, len(rs), counts, len(bad)))
        for r in bad:
            print('  #%d missing=%s drawErr=%d pageerr=%d' % (
                r['idx'], r['probe']['missing'], r['drawImage_errors'], len(r['pageerror'])))

    (QA_DIR / 'coldstart.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
