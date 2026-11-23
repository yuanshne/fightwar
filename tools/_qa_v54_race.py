# -*- coding: utf-8 -*-
"""
_qa_v54_race.py —— 启动竞态采样：重复开若干次页面，统计 SPR 键数好/坏态分布，
坏态留存证据截图与缺失键清单。基线作为对照组。
输出：.screenshots/qa/race.json
"""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from playwright.sync_api import sync_playwright  # noqa: E402
from _qa_v54_common import BEFORE_HTML, AFTER_HTML, QA_DIR, file_url, seed_profile, goto_level  # noqa: E402

PROBE = r"""() => {
  const keys = Object.keys(SPR);
  const need = ['coin','checkOn','flag','lever','slime','heartFull','gem','springC','boss1','look','knight','portal'];
  const miss = need.filter(k => !SPR[k]);
  return { count: keys.length, missing: miss, heroIdle1: !!SPR.heroIdle1,
           heroIdle1Size: SPR.heroIdle1 && SPR.heroIdle1.width ? SPR.heroIdle1.width + 'x' + SPR.heroIdle1.height : null };
}"""

NEED_COUNT = 170


def trial(pw, html, label, idx, out_dir):
    br = pw.chromium.launch()
    pg = br.new_page(viewport={'width': 1280, 'height': 800})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.goto(file_url(html))
    pg.wait_for_timeout(1500)
    title = pg.evaluate(PROBE)
    goto_level(pg, html, level=7, hero='knight', profile=seed_profile(), wait=1500)
    l7 = pg.evaluate(PROBE)
    draw_err = [e for e in errs if 'drawImage' in e]
    rec = {'label': label, 'idx': idx, 'title': title, 'l7': l7,
           'drawImage_errors': len(draw_err), 'other_errors': [e for e in errs if 'drawImage' not in e and 'Fetch API' not in e]}
    if l7['count'] < NEED_COUNT:
        shot_dir = out_dir / ('race_' + label)
        shot_dir.mkdir(parents=True, exist_ok=True)
        pg.locator('#game').screenshot(path=str(shot_dir / ('bad_%02d.png' % idx)))
        rec['evidence'] = str(shot_dir / ('bad_%02d.png' % idx))
    br.close()
    return rec


def main():
    import pathlib as _p
    out_dir = QA_DIR
    results = {'after': [], 'before': []}
    with sync_playwright() as pw:
        for i in range(12):
            results['after'].append(trial(pw, AFTER_HTML, 'after', i + 1, out_dir))
        for i in range(6):
            results['before'].append(trial(pw, BEFORE_HTML, 'before', i + 1, out_dir))

    for label in ('after', 'before'):
        bad = [r for r in results[label] if r['l7']['count'] < NEED_COUNT]
        good = [r for r in results[label] if r['l7']['count'] >= NEED_COUNT]
        print('%s: 总 %d，坏态 %d，好态 %d；坏态 drawImage 错误合计 %d' % (
            label, len(results[label]), len(bad), len(good),
            sum(r['drawImage_errors'] for r in bad)))
        for r in bad:
            print('  坏态 #%d count=%d missing=%s' % (r['idx'], r['l7']['count'], ','.join(r['l7']['missing'])))

    (QA_DIR / 'race.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
