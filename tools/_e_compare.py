# -*- coding: utf-8 -*-
import json, pathlib

ROOT = pathlib.Path(r'C:\Users\A\Desktop\youxi')
before = json.load(open(ROOT / '.screenshots/e_perf/perf_before.json', encoding='utf-8'))
after = json.load(open(ROOT / '.screenshots/e_perf/perf_after.json', encoding='utf-8'))

def kb(n):
    return round((n or 0) / 1024, 1)

for trans in ('file', 'http'):
    print('=' * 78)
    print(trans)
    for lab in ('normal', 'boss'):
        b = before[trans][lab]
        a = after[trans][lab]
        print('-' * 66)
        print('%s playable before median=%s p90=%s | after median=%s p90=%s' % (
            lab, b['playableMs']['median'], b['playableMs']['p90'],
            a['playableMs']['median'], a['playableMs']['p90']))
        print('  fps before=%s after=%s' % (b['fps']['mean'], a['fps']['mean']))
        print('  early-bytes before=%s KB after=%s KB | late-bytes before=%s KB after=%s KB' % (
            kb(b.get('earlyBytesBeforePlayable')), kb(a.get('earlyBytesBeforePlayable')),
            kb(b.get('lateBytesAfterPlayable')), kb(a.get('lateBytesAfterPlayable'))))
        for tag, g in (('before', b), ('after', a)):
            slow = sorted(g['assets'], key=lambda x: -(x['maxDurMs'] or 0))[:5]
            print('  %s slow5:' % tag, [(x['url'].split('/')[-1], x['maxDurMs'],
                  kb(x['sizeBytes'])) for x in slow])
        # 龙图与瓦片时点
        for tag, g in (('before', b), ('after', a)):
            for a_ in g['assets']:
                if 'dragon.png' in a_['url'] or a_['url'].endswith('tex_ice.jpg'):
                    print('  %s %s start=%s end=%s dur=%s' % (
                        tag, a_['url'].split('/')[-1], a_.get('avgStartMs'),
                        a_.get('avgEndMs'), a_.get('avgDurMs')))
