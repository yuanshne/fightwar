# -*- coding: utf-8 -*-
"""
_v56_gate_check.py —— B 卡点「启动就绪门」冷启动压力验证。

每轮：全新 page + 清 localStorage + 固定存档 ?level=7&hero=knight&god=1，
等 PQ_ASSET_GATE 放行（wait(cb, 3000)，超时兜底）后采样：
  - SPR 键数（基线 ≥171，含 __built 幂等标志）
  - required 缺键清单（gate.report().missing）
  - 6 个 *White 敌人帧是否全在
  - drawImage TypeError 数 / 其他 console error / pageerror 数
  - gate.report().waitedMs / timedOut

用法：
  D:\\python\\python.exe tools\\_v56_gate_check.py            # 默认 20 轮
  D:\\python\\python.exe tools\\_v56_gate_check.py --runs 3   # 短冒烟

产物（.screenshots/b_gate/）：
  after_gate_ready_L7.png   门放行后的局内截图（首轮）
  gate_log_20runs.txt        逐轮键数/missing/waitedMs/timedOut/报错 + 汇总统计
"""
import argparse
import json
import pathlib
import statistics
import sys

from playwright.sync_api import sync_playwright  # noqa: E402

ROOT = pathlib.Path(r'C:\Users\A\Desktop\youxi')
SHOTS = ROOT / '.screenshots' / 'b_gate'
INDEX = ROOT / 'index.html'
URL = 'file:///' + str(INDEX).replace('\\', '/')

WHITE6 = ['batWhite', 'spitterWhite', 'beetleWhite', 'hopperWhite',
          'boomerWhite', 'jellyWhite']

PROBE_JS = r"""
(white6) => {
  const g = (typeof window !== 'undefined') ? window.PQ_ASSET_GATE : null;
  const rep = g ? g.report() : null;
  const keys = (typeof SPR !== 'undefined' && SPR) ? Object.keys(SPR) : [];
  const white = {};
  for (const k of white6) white[k] = !!(SPR && SPR[k]);
  return {
    count: keys.length,
    missing: rep ? rep.missing : ['gate 未定义'],
    ready: rep ? !!rep.ready : false,
    released: rep ? !!rep.released : false,
    waitedMs: rep ? rep.waitedMs : -1,
    timedOut: rep ? !!rep.timedOut : null,
    requiredCount: rep ? rep.requiredCount : 0,
    white: white,
    built: !!(typeof SPR !== 'undefined' && SPR && SPR.__built)
  };
}
"""

WAIT_JS = r"""
() => new Promise((res) => {
  const g = window.PQ_ASSET_GATE;
  if (!g) return res({ ready: false, released: false, missing: ['PQ_ASSET_GATE 未定义'],
                       waitedMs: -1, timedOut: null, requiredCount: 0 });
  let done = false;
  const guard = setTimeout(() => {
    if (done) return; done = true;
    res({ ready: false, released: false, missing: ['外部兜底超时'], waitedMs: 3500,
          timedOut: true, requiredCount: g.required.length });
  }, 3500);
  g.wait((r) => {
    if (done) return; done = true; clearTimeout(guard); res(r);
  }, 3000);
})
"""

PROFILE = {
    'unlocked': 31,
    'stars': {str(i): 3 for i in range(31)},
    'equip': {'w': -1, 'h': -1, 'c': -1},
    'inv': [],
    'shards': {},
    'nextId': 2,
    'unlockAll': True,
    'skin': 'blue',
    'hero': 'knight',
    'skins': ['blue', 'sprout', 'crystal', 'azure', 'steel', 'ember', 'ivory',
              'starcore', 'jade', 'sunset', 'nebula', 'abyss', 'coral', 'tide',
              'wraith', 'magma', 'judge', 'spectra', 'holy', 'inferno'],
}


def classify_errors(errs):
    """返回 (drawImageTypeError, drawImageOther, fetchApi, otherConsole) 四组明细。
    Fetch API file:// 限制是已知环境限制（旧基线脚本同样剔除），不计入失败。"""
    draw_type, draw_other, fetch_api, other = [], [], [], []
    for m in errs:
        if 'drawImage' in m:
            (draw_type if 'TypeError' in m else draw_other).append(m)
        elif 'Fetch API' in m or 'file' in m and 'scheme' in m:
            fetch_api.append(m)
        else:
            other.append(m)
    return draw_type, draw_other, fetch_api, other


def trial(pw, idx, shot_path=None):
    br = pw.chromium.launch(headless=True)
    pg = br.new_page(viewport={'width': 1280, 'height': 800})
    pageerr, console_err = [], []
    pg.on('pageerror', lambda e: pageerr.append(str(e)))
    pg.on('console', lambda m: console_err.append(m.text) if m.type == 'error' else None)

    # 第一次落地后清存档，再带关卡参数冷启动（与 _qa_v54_coldstart 同口径）
    pg.goto(URL)
    pg.evaluate("() => { try { localStorage.clear(); } catch (e) {} }")
    pg.evaluate("(p) => { try { localStorage.setItem('pq_progress', JSON.stringify(p)); } catch (e) {} }",
                PROFILE)
    pg.goto(URL + '?level=7&hero=knight&god=1')

    wait_rep = pg.evaluate(WAIT_JS)
    probe = pg.evaluate(PROBE_JS, WHITE6)
    pg.wait_for_timeout(300)  # 留一小段渲染窗口，捕获迟到帧引发的 drawImage 报错

    draw_type, draw_other, fetch_api, other = classify_errors(console_err)
    white_missing = [k for k, v in probe['white'].items() if not v]

    rec = {
        'idx': idx,
        'count': probe['count'],
        'built': probe['built'],
        'missing': probe['missing'],
        'white_missing': white_missing,
        'ready': probe['ready'],
        'released': probe['released'],
        'waitedMs': probe['waitedMs'],
        'timedOut': probe['timedOut'],
        'requiredCount': probe['requiredCount'],
        'drawImageTypeErrors': len(draw_type),
        'drawImageOther': len(draw_other),
        'fetchApiErrors': len(fetch_api),
        'otherConsole': len(other),
        'pageerror': len(pageerr),
        'drawTypeMsgs': draw_type[:3],
        'pageerrMsgs': pageerr[:3],
        'otherMsgs': other[:3],
    }

    if shot_path is not None:
        SHOTS.mkdir(parents=True, exist_ok=True)
        pg.locator('#game').screenshot(path=str(shot_path))

    br.close()
    return rec


def summarize(recs):
    counts = [r['count'] for r in recs]
    waited = [r['waitedMs'] for r in recs if isinstance(r['waitedMs'], (int, float)) and r['waitedMs'] >= 0]
    bad_missing = [r for r in recs if r['missing']]
    bad_white = [r for r in recs if r['white_missing']]
    bad_count = [r for r in recs if r['count'] < 171]
    n_draw_type = sum(r['drawImageTypeErrors'] for r in recs)
    n_pageerr = sum(r['pageerror'] for r in recs)
    n_fetch = sum(r['fetchApiErrors'] for r in recs)
    n_other = sum(r['otherConsole'] for r in recs)
    n_timeout = sum(1 for r in recs if r['timedOut'])

    def stats(xs):
        if not xs:
            return 'n/a'
        return 'min=%d  median=%d  max=%d  mean=%.1f' % (
            min(xs), statistics.median(xs), max(xs), statistics.mean(xs))

    lines = []
    lines.append('==== B 卡点就绪门 冷启动汇总（n=%d）====' % len(recs))
    lines.append('SPR 键数分布: %s' % counts)
    lines.append('  键数 <171 轮次: %d' % len(bad_count))
    lines.append('required 缺键轮次: %d' % len(bad_missing))
    lines.append('6*White 缺帧轮次: %d' % len(bad_white))
    lines.append('drawImage TypeError 总数: %d' % n_draw_type)
    lines.append('pageerror 总数: %d' % n_pageerr)
    lines.append('Fetch API file:// 限制（已知环境限制，不计失败）: %d' % n_fetch)
    lines.append('其他 console error（非 Fetch/drawImage）: %d' % n_other)
    lines.append('走超时兜底轮次: %d / %d' % (n_timeout, len(recs)))
    lines.append('waitedMs 分布: %s' % stats(waited))
    lines.append('')

    ok = (not bad_count and not bad_missing and not bad_white
          and n_draw_type == 0 and n_pageerr == 0 and n_other == 0
          and (not waited or max(waited) <= 3000))
    lines.append('判定: %s' % ('PASS ✅' if ok else 'FAIL ❌'))
    if bad_count:
        lines.append('  - 键数不足: ' + ', '.join('#%d(%d)' % (r['idx'], r['count']) for r in bad_count))
    if bad_missing:
        for r in bad_missing:
            lines.append('  - #%d missing=%s' % (r['idx'], r['missing']))
    if bad_white:
        for r in bad_white:
            lines.append('  - #%d white_missing=%s' % (r['idx'], r['white_missing']))
    if n_draw_type:
        lines.append('  - drawImage TypeError 明细: ' + json.dumps(
            [m for r in recs for m in r['drawTypeMsgs']], ensure_ascii=False))
    if n_pageerr:
        lines.append('  - pageerror 明细: ' + json.dumps(
            [m for r in recs for m in r['pageerrMsgs']], ensure_ascii=False))
    if n_other:
        lines.append('  - 其他 console error 明细: ' + json.dumps(
            [m for r in recs for m in r['otherMsgs']], ensure_ascii=False))
    if waited and max(waited) > 3000:
        lines.append('  - 注意: waitedMs 最大值 >3s，首屏延迟不合格')
    return '\n'.join(lines), ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--runs', type=int, default=20)
    ap.add_argument('--log', default='gate_log_20runs.txt')
    args = ap.parse_args()

    SHOTS.mkdir(parents=True, exist_ok=True)
    recs = []
    with sync_playwright() as pw:
        for i in range(args.runs):
            shot = SHOTS / 'after_gate_ready_L7.png' if i == 0 else None
            rec = trial(pw, i + 1, shot)
            recs.append(rec)
            print('#%2d  count=%d  missing=%s  white_miss=%s  waitedMs=%s  timedOut=%s  '
                  'drawType=%d pageerr=%d other=%d' % (
                      rec['idx'], rec['count'], rec['missing'], rec['white_missing'],
                      rec['waitedMs'], rec['timedOut'], rec['drawImageTypeErrors'],
                      rec['pageerror'], rec['otherConsole']))

    summary, ok = summarize(recs)
    print()
    print(summary)

    log_path = SHOTS / args.log
    with log_path.open('w', encoding='utf-8') as f:
        f.write('逐轮明细\n')
        f.write('--------\n')
        for r in recs:
            f.write('#%02d count=%d built=%s missing=%s white_missing=%s ready=%s '
                    'released=%s waitedMs=%s timedOut=%s drawImageType=%d drawOther=%d '
                    'fetchApi=%d otherConsole=%d pageerror=%d\n' % (
                        r['idx'], r['count'], r['built'], r['missing'], r['white_missing'],
                        r['ready'], r['released'], r['waitedMs'], r['timedOut'],
                        r['drawImageTypeErrors'], r['drawImageOther'], r['fetchApiErrors'],
                        r['otherConsole'], r['pageerror']))
            if r['drawTypeMsgs']:
                f.write('    drawType: %s\n' % r['drawTypeMsgs'])
            if r['pageerrMsgs']:
                f.write('    pageerr: %s\n' % r['pageerrMsgs'])
        f.write('\n' + summary + '\n')

    # 机器可读附带
    (SHOTS / 'gate_report_20runs.json').write_text(
        json.dumps({'ok': ok, 'runs': recs}, ensure_ascii=False, indent=2), encoding='utf-8')

    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
