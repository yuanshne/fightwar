# -*- coding: utf-8 -*-
"""D 线 QA 结果分析：汇总逐关记录、对比基线、归类报错。只读 JSON，不改源码。"""
import json
import pathlib
import collections

QA = pathlib.Path(r'C:\Users\A\Desktop\youxi\.screenshots\qa56')


def load(name):
    return json.loads((QA / name).read_text(encoding='utf-8'))['records']


def agg(recs):
    out = {}
    for r in recs:
        errs = r.get('pageerror', []) + r.get('console_error', [])
        out[r['level']] = {
            'kind': r.get('kind'), 'state': r.get('state'), 'fps': r.get('fps'),
            'stuck': r.get('stuck'), 'black': r.get('blackScreen'), 'errs': len(errs),
            'msgs': errs, 'shot': r.get('shot'),
            'player': r.get('player'), 'boss': r.get('boss'), 'arcade': r.get('arcade'),
        }
    return out


def main():
    A = agg(load('qa56_levels.json'))
    B = agg(load('qa56_levels_baseline.json'))

    print('=== AFTER 概览 ===')
    for lv, a in sorted(A.items()):
        print('L%02d %-7s state=%-6s fps=%s stuck=%s black=%s errs=%d' % (
            lv, a['kind'], str(a['state']), a['fps'], a['stuck'], a['black'], a['errs']))

    print('\n=== AFTER 独有报错（基线同关没有的消息）===')
    for lv, a in sorted(A.items()):
        bmsgs = set(B.get(lv, {}).get('msgs', []))
        extra = [m for m in a['msgs'] if m not in bmsgs]
        if extra:
            print('L%02d:' % lv)
            for m, c in collections.Counter(extra).items():
                print('   x%d %s' % (c, m[:180]))

    print('\n=== AFTER 报错消息全量去重 ===')
    allm = collections.Counter()
    for a in A.values():
        for m in a['msgs']:
            allm[m] += 1
    for m, c in allm.most_common():
        print('x%d  %s' % (c, m[:200]))

    print('\n=== 基线概览（状态/卡死/黑屏）===')
    for lv, b in sorted(B.items()):
        print('L%02d %-7s state=%-6s fps=%s stuck=%s black=%s errs=%d' % (
            lv, b['kind'], str(b['state']), b['fps'], b['stuck'], b['black'], b['errs']))

    # FPS 最差关卡
    fps = [(a['fps'], lv) for lv, a in A.items() if a['fps'] is not None]
    fps.sort()
    print('\n=== FPS 最低 8 关（AFTER）===')
    for f, lv in fps[:8]:
        print('L%02d fps=%s' % (lv, f))

    # 汇总 JSON 供报告使用
    summary = {'after': {str(k): v for k, v in A.items()},
               'before': {str(k): v for k, v in B.items()}}
    (QA / 'qa56_analysis.json').write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
