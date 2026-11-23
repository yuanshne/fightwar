# -*- coding: utf-8 -*-
import json, pathlib

d = json.loads(pathlib.Path(r'C:\Users\A\Desktop\youxi\.screenshots\qa\final.json').read_text(encoding='utf-8'))
a = d['audit']

print('=== heroTop ===')
for k, v in sorted(a['heroTop'].items()):
    print(' ', k, v)
print('=== mgEnum ===')
for k, v in a['mgEnum'].items():
    print(' ', k, v)
print('mageBlue', a['mageBlue'])

bad = []
for sid, row in a['mage'].items():
    for access, setd in row.items():
        if setd is None:
            bad.append((sid, access, 'null', None))
            continue
        for fk, dim in setd.items():
            if isinstance(dim, list):
                for i, dd in enumerate(dim):
                    if dd and (dd['w'] != 32 or dd['h'] != 38):
                        bad.append((sid, access, fk + '[%d]' % i, dd))
            elif dim and (dim['w'] != 32 or dim['h'] != 38):
                bad.append((sid, access, fk, dim))

print('=== mage bad count:', len(bad))
for b in bad[:60]:
    print(' ', b)

# 矩阵完整性：19 套 × 3 口径，每口径 10 帧（9 单帧 + run 6）
missing_sets = []
for sid, row in a['mage'].items():
    for access, setd in row.items():
        if setd is None:
            missing_sets.append((sid, access, 'null'))
print('=== null sets:', missing_sets)

# heroTop 非 32×38
hero_bad = []
for k, v in a['heroTop'].items():
    dim = v['dim'] if isinstance(v, dict) and 'dim' in v else v
    if dim and (dim['w'] != 32 or dim['h'] != 38):
        hero_bad.append((k, v))
print('=== hero non-32x38:', hero_bad)

# mgEnum 非 32×38（图标 mgU/mgI/mgO/mgL 12×12 与剪影除外，这里列全）
print('=== mgEnum non-32x38:')
for k, v in a['mgEnum'].items():
    if v and (v['w'] != 32 or v['h'] != 38):
        print(' ', k, v)
