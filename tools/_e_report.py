# -*- coding: utf-8 -*-
"""汇总 before/after 数据并绘制资源加载时间线图（E 线交付辅助脚本）。"""
import json, pathlib, statistics
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(r'C:\Users\A\Desktop\youxi')
OUT = ROOT / '.screenshots' / 'e_perf'
before = json.load(open(OUT / 'perf_before.json', encoding='utf-8'))
after = json.load(open(OUT / 'perf_after.json', encoding='utf-8'))


def group_assets(g):
    groups = {}
    for a in g['assets']:
        url = a['url']
        if '/vfx2/' in url:
            key = 'vfx2 skill FX (8 PNG)'
        elif '/vfx/' in url:
            key = 'vfx dragon.png'
        elif '/tiles/' in url:
            key = 'tiles AI tex (10 JPG)'
        elif '/bg/' in url:
            key = 'bg backgrounds (5 JPG)'
        elif '/bosses/' in url:
            key = 'bosses portraits (14)'
        elif '/mage/' in url:
            key = 'mage frames'
        elif '/minions/' in url:
            key = 'minion frames'
        elif '/hero_anim/' in url:
            key = 'hero_anim frames'
        elif '/processed/' in url:
            key = 'processed base sprites'
        elif 'kenney' in url:
            key = 'kenney CC0'
        else:
            key = 'other'
        e = groups.setdefault(key, {'start': [], 'end': [], 'bytes': 0, 'n': 0})
        if a.get('avgStartMs') is not None:
            e['start'].append(a['avgStartMs'])
        if a.get('avgEndMs') is not None:
            e['end'].append(a['avgEndMs'])
        e['bytes'] += a.get('sizeBytes') or 0
        e['n'] += 1
    return groups


def chart(before_g, after_g, title, out_path):
    gb, ga = group_assets(before_g), group_assets(after_g)
    keys = sorted(gb.keys(), key=lambda k: -(gb[k]['bytes']))
    W, H = 1000, 60 + len(keys) * 56
    img = Image.new('RGB', (W, H), (18, 18, 26))
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype('consola.ttf', 14)
        font_s = ImageFont.truetype('consola.ttf', 12)
    except Exception:
        font = font_s = ImageFont.load_default()
    d.text((10, 10), title, fill=(255, 255, 255), font=font)
    max_t = 1400
    x0, x1 = 250, 960
    for i, k in enumerate(keys):
        y = 40 + i * 56
        d.text((10, y + 6), k, fill=(220, 220, 220), font=font_s)
        for tag, g, color, off in (('before', gb, (220, 90, 90), 0), ('after', ga, (90, 200, 120), 18)):
            e = g.get(k)
            if not e or not e['start']:
                continue
            s = min(e['start']); en = max(e['end'])
            sx = x0 + (s / max_t) * (x1 - x0)
            ex = x0 + (min(en, max_t) / max_t) * (x1 - x0)
            d.rectangle([sx, y + off, ex, y + off + 14], fill=color)
            d.text((ex + 4, y + off), '%d-%dms' % (s, en), fill=color, font=font_s)
        kb = gb[k]['bytes'] / 1024
        d.text((10, y + 34), '%.0f KB' % kb, fill=(150, 150, 160), font=font_s)
    img.save(out_path)
    print('chart', out_path)


# file transport, boss 关（资源最全）
chart(before['file']['boss'], after['file']['boss'],
      'Asset load timeline  file://  Boss L7  (red=before  green=after)',
      OUT / 'asset_timeline_boss.png')
chart(before['file']['normal'], after['file']['normal'],
      'Asset load timeline  file://  Normal L1  (red=before  green=after)',
      OUT / 'asset_timeline_normal.png')

# 文本汇总
def row(g):
    return {
        'play_med': g['playableMs']['median'], 'play_p90': g['playableMs']['p90'],
        'play_samples': g['playableMs']['samples'],
        'fps': g['fps']['mean'], 'low': g['fps']['lowShare'],
        'earlyKB': round((g.get('earlyBytesBeforePlayable') or 0) / 1024, 1),
        'lateKB': round((g.get('lateBytesAfterPlayable') or 0) / 1024, 1),
        'dup': g['duplicateUrls'],
    }

for trans in ('file', 'http'):
    for lab in ('normal', 'boss'):
        print('==', trans, lab)
        print('  before', row(before[trans][lab]))
        print('  after ', row(after[trans][lab]))

# 最慢 5 资源（after, file boss）
print('\n-- after file boss slowest by dur --')
for a in sorted(after['file']['boss']['assets'], key=lambda x: -(x['maxDurMs'] or 0))[:8]:
    print('  %7.1f ms  %8.1f KB  %sx%s  %s' % (
        a['maxDurMs'] or 0, (a['sizeBytes'] or 0) / 1024, a['px'][0], a['px'][1], a['url']))
print('\n-- before file boss duplicates --')
print(before['file']['boss']['duplicateUrls'])
print('-- after file boss duplicates --')
print(after['file']['boss']['duplicateUrls'])
