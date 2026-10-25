# -*- coding: utf-8 -*-
# bagtest.py —— v7.8 背包升阶回归（跨稀有度扣碎片 + 3 行碎片栏 + 按钮进度）
# 跑法：python tools/bagtest.py   （退出码 0=全过；截图落在 testshots/_bag_v78_*.png）
#  1. 打开 L1（god=1）
#  2. 注入存档 w0=2 / w1=1（合计 3，恰好够升一阶），背包里一把 r=0 的铁制长剑
#  3. 按 B 开背包 → 截图 before → 按 C 升阶 → 读 localStorage 断言 → 截图 after
# 断言：inv[0].r==1 / shards.w0==0 / shards.w1==0（低稀有度先扣）
import pathlib, sys
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).parent.parent
BASE = (ROOT / 'index.html').as_uri() + '?level=1&god=1'
OUT = ROOT / 'testshots'
OUT.mkdir(exist_ok=True)
errors = []
bad = []

PROF = {
    'unlocked': 16, 'stars': {}, 'puzzles': {}, 'v5m': 1, 'unlockAll': True,
    'equip': {'w': 9001, 'h': -1, 'c': -1},
    'inv': [{'id': 9001, 'slot': 'w', 'r': 0}],
    'shards': {'w0': 2, 'w1': 1, 'h0': 0, 'c0': 0},
    'skin': 'blue',
}


def shot(pg, name):
    pg.locator('#game').screenshot(path=str(OUT / name))
    print('  截图 ' + name)


def check(label, got, want):
    ok = got == want
    print('  [%s] %s = %r（期望 %r）' % ('OK' if ok else 'FAIL', label, got, want))
    if not ok:
        bad.append(label)
    return ok


with sync_playwright() as pw:
    br = pw.chromium.launch()
    pg = br.new_page(viewport={'width': 1280, 'height': 800})
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append(str(e)))

    pg.goto(BASE)
    pg.wait_for_timeout(400)
    pg.evaluate("""(p) => { localStorage.setItem('pq_progress', JSON.stringify(p)); }""", PROF)
    pg.reload()
    pg.wait_for_timeout(900)

    # 开背包（B）→ 选中项默认 bagSelBag=0（就是那把 r=0 的剑，且已穿着）
    pg.keyboard.press('KeyB')
    pg.wait_for_timeout(400)
    shot(pg, '_bag_v78_before.png')

    before = pg.evaluate("() => JSON.parse(localStorage.getItem('pq_progress'))")
    print('  升阶前 shards = %r' % (before.get('shards'),))

    # 升阶（C）
    pg.keyboard.press('KeyC')
    pg.wait_for_timeout(500)
    shot(pg, '_bag_v78_after.png')

    after = pg.evaluate("() => JSON.parse(localStorage.getItem('pq_progress'))")
    print('  升阶后 shards = %r  inv[0] = %r' % (after.get('shards'), after.get('inv', [{}])[0]))

    check('inv[0].r', after['inv'][0]['r'], 1)
    check('shards.w0', after['shards'].get('w0'), 0)
    check('shards.w1', after['shards'].get('w1'), 0)
    # 额外：键保留（不 delete）+ 无关槽位未被误动
    print('  shards 键集合 = %r（w0/w1 键应仍在）' % (sorted(after['shards'].keys()),))
    check('h0 未被误动', after['shards'].get('h0'), 0)

    # ---- 附：进度态目检（w0=2 时按钮应显示「升阶 2/3」且拒绝升阶） ----
    pg.keyboard.press('Escape')
    pg.wait_for_timeout(300)
    prof2 = dict(PROF)
    prof2['shards'] = {'w0': 2, 'w1': 0, 'h0': 0, 'c0': 0}
    pg.evaluate("""(p) => { localStorage.setItem('pq_progress', JSON.stringify(p)); }""", prof2)
    pg.reload()
    pg.wait_for_timeout(900)
    pg.keyboard.press('KeyB')
    pg.wait_for_timeout(400)
    shot(pg, '_bag_v78_progress.png')
    pg.keyboard.press('KeyC')
    pg.wait_for_timeout(400)
    p2 = pg.evaluate("() => JSON.parse(localStorage.getItem('pq_progress'))")
    check('碎片 2/3 时拒绝升阶：r 仍为 0', p2['inv'][0]['r'], 0)
    check('碎片 2/3 时未被扣：w0 仍为 2', p2['shards'].get('w0'), 2)

    # ---- 附：碎片栏焦点导航（Tab 进 shard 区 → 右移越界应停在 2） ----
    # 注：每次按键之间必须留一帧以上——游戏按帧消费 pressed 边沿，连按会被吞成一次（本脚本第一版踩过）
    pg.keyboard.press('Tab')
    pg.wait_for_timeout(120)
    for _ in range(4):
        pg.keyboard.press('ArrowRight')
        pg.wait_for_timeout(90)
    pg.wait_for_timeout(300)
    shot(pg, '_bag_v78_shardfocus.png')
    print('  碎片栏焦点目检：选中框应停在第 3 行（斗篷），不越出 3 行')

    br.close()

if errors:
    print('console/page errors:')
    for e in errors:
        print('  ' + e)
    sys.exit(1)
if bad:
    print('断言失败：' + ', '.join(bad))
    sys.exit(1)
print('OK：v7.8 背包升阶（跨稀有度扣碎片）验收通过')
