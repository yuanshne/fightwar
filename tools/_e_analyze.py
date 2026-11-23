# -*- coding: utf-8 -*-
import json, pathlib, statistics

ROOT = pathlib.Path(r'C:\Users\A\Desktop\youxi')
d = json.load(open(ROOT / '.screenshots/e_perf/perf_before.json', encoding='utf-8'))

for trans in ('file', 'http'):
    g = d.get(trans)
    if not g:
        continue
    print('=' * 70)
    print('TRANSPORT', trans)
    for label in ('normal', 'boss'):
        gg = g[label]
        assets = gg['assets']
        total_bytes = sum((a['sizeBytes'] or 0) for a in assets)
        loaded = [a for a in assets if a['errors'] == 0]
        print('-' * 60)
        print('%s: playable %s  fps mean=%s  assets=%d  totalBytes=%d (%.1f KB)' % (
            label, gg['playableMs'], gg['fps']['mean'], len(assets),
            total_bytes, total_bytes / 1024))
        print('marks:', gg.get('sampleMarks'))
        print('memory:', json.dumps(gg.get('sampleMemory'), ensure_ascii=False))
        print('dups:', gg['duplicateUrls'])
        slow = sorted(loaded, key=lambda x: -(x['maxDurMs'] or 0))[:10]
        for a in slow:
            print('  %8.1f ms  %8.1f KB  %sx%s  %s' % (
                a['maxDurMs'] or 0, (a['sizeBytes'] or 0) / 1024,
                a['px'][0], a['px'][1], a['url']))
