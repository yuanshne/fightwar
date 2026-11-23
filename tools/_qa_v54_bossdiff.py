# -*- coding: utf-8 -*-
"""
_qa_v54_bossdiff.py —— 用基线/后置记录的 Boss 世界坐标 + 相机，裁剪 Boss 局部做像素比对，
排除背景/玩家/随机装饰干扰。结果回写 after.json 的 boss[*].idle_diff_crop。
"""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from PIL import Image, ImageChops  # noqa: E402
from _qa_v54_common import QA_DIR, BEFORE_DIR, AFTER_DIR  # noqa: E402


def crop_box(entry, img_w, img_h, pad=20):
    info = entry['info']
    cam_x, cam_y = info['camX'], info['camY']
    bx, by, bw, bh = info['x'], info['y'], info['w'], info['h']
    x0 = max(0, (bx - cam_x) * 2 - pad)
    y0 = max(0, (by - cam_y) * 2 - pad)
    x1 = min(img_w, (bx - cam_x) * 2 + bw * 2 + pad)
    y1 = min(img_h, (by - cam_y) * 2 + bh * 2 + pad)
    return (int(x0), int(y0), int(x1), int(y1))


def diff_stats(ib, ia):
    if ib.size != ia.size:
        return {'error': 'size mismatch', 'before': ib.size, 'after': ia.size}
    diff = ImageChops.difference(ib, ia)
    px = list(diff.getdata())
    mean = sum(sum(p) for p in px) / (3 * len(px))
    changed = sum(1 for p in px if max(p) > 10) / len(px)
    return {'mean_abs_diff': round(mean, 3), 'changed_ratio': round(changed, 5),
            'pixels': len(px)}


def main():
    base = json.loads((QA_DIR / 'baseline.json').read_text(encoding='utf-8'))
    after_p = QA_DIR / 'after.json'
    after = json.loads(after_p.read_text(encoding='utf-8'))

    before_by_kind = {e['kind']: e for e in base['boss'] if e['state'] == 'idle'}
    summary = []
    for e in after['boss']:
        kind = e['kind']
        b = before_by_kind.get(kind)
        if not b:
            continue
        bp = BEFORE_DIR / b['file']
        ap = AFTER_DIR / e['idle_file']
        if not bp.exists() or not ap.exists():
            e['idle_diff_crop'] = {'error': 'missing'}
            continue
        ib = Image.open(bp).convert('RGB')
        ia = Image.open(ap).convert('RGB')
        cb = crop_box(b, ib.width, ib.height)
        ca = crop_box(e, ia.width, ia.height)
        crop_b = ib.crop(cb)
        crop_a = ia.crop(ca)
        crop_diff = diff_stats(crop_b, crop_a)
        full = diff_stats(ib, ia)
        e['idle_diff_crop'] = {'box_before': cb, 'box_after': ca, **crop_diff}
        e['idle_diff_full'] = full
        summary.append({'kind': kind, 'crop': crop_diff, 'full': full})

    after_p.write_text(json.dumps(after, ensure_ascii=False, indent=2), encoding='utf-8')
    print('kind  crop_mean  crop_changed  full_mean  full_changed')
    for s in summary:
        print('k%02d  %8.3f  %12.4f  %9.3f  %12.4f' % (
            s['kind'], s['crop']['mean_abs_diff'], s['crop']['changed_ratio'],
            s['full']['mean_abs_diff'], s['full']['changed_ratio']))


if __name__ == '__main__':
    main()
