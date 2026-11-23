# -*- coding: utf-8 -*-
import json, pathlib

d = json.loads(pathlib.Path(r'C:\Users\A\Desktop\youxi\.screenshots\qa\final.json').read_text(encoding='utf-8'))
a = d['audit']

bad16, other = [], []

def scan(dim, path):
    if dim is None:
        return
    if dim['w'] == 16 and dim['h'] == 16:
        bad16.append((path, dim))
    elif dim['w'] != 32 or dim['h'] != 38:
        other.append((path, dim))

for k, v in a['heroTop'].items():
    if isinstance(v, dict) and 'dim' in v:
        for i, dd in enumerate(v['dim'] and [v['dim']] or []):
            scan(dd, 'heroTop.%s[%d]' % (k, i))
    else:
        scan(v, 'heroTop.' + k)

for sid, row in a['mage'].items():
    for access, setd in row.items():
        if setd is None:
            continue
        for fk, dim in setd.items():
            if isinstance(dim, list):
                for i, dd in enumerate(dim):
                    scan(dd, 'mage.%s.%s.%s[%d]' % (sid, access, fk, i))
            else:
                scan(dim, 'mage.%s.%s.%s' % (sid, access, fk))

for k, v in a['mgEnum'].items():
    scan(v, 'mgEnum.' + k)

print('16x16 count:', len(bad16))
for x in bad16:
    print(' ', x)
print('other non-32x38:', len(other))
for x in other:
    print(' ', x)
