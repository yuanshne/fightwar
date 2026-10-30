# -*- coding: utf-8 -*-
"""v20.6 UI 冒烟（playwright）：① 法师 v20.6 再砍数值（o.dmg=2 / bolt 追踪 85/4）；
② Boss 招式预警条——真实按键走进 L7，Boss AI 进 windup 后血条下方应渲染「下一招 ·X」。
（ui.js 整体在 IIFE 内，evaluate 不可达其内部符号 → 走真实输入路径 + 只读 engine 顶层 game）
用法：D:/python/python.exe tools/_v206_ui_test.py
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

BASE = 'file:///' + str(pathlib.Path(__file__).resolve().parent.parent / 'index.html').replace('\\', '/')
OUT = pathlib.Path(__file__).resolve().parent.parent / '_v205_ui_shots'
OUT.mkdir(exist_ok=True)

ok_n = 0
fail = []


def ck(name, cond, detail=''):
    global ok_n
    if cond:
        ok_n += 1
        print('  [OK]  %s  %s' % (name, detail))
    else:
        fail.append(name)
        print('  [FAIL] %s  %s' % (name, detail))


with sync_playwright() as pw:
    br = pw.chromium.launch()
    pg = br.new_page(viewport={'width': 1024, 'height': 768})
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(BASE)
    pg.wait_for_timeout(600)
    # 全解锁存档（新 context 的 localStorage 是空的，L7 进不去）；reload 生效
    pg.evaluate("() => localStorage.setItem('pq_progress', JSON.stringify({unlocked:24, stars:{}}))")
    pg.reload()
    pg.wait_for_timeout(1800)

    # ① 法师 v20.6 数值（BAL 是 engine 顶层，可达）
    st = pg.evaluate("() => { const m = BAL.heroes.mage; return { od: m.o.dmg, hr: m.bolt.homeR, tn: m.bolt.turn }; }")
    ck('法师 o.dmg=2（3→2）', st['od'] == 2, str(st))
    ck('法师 bolt 追踪 85px / 4rad（110/6）', st['hr'] == 85 and st['tn'] == 4, str(st))

    # ② 真实按键进 L7（标题 Enter → 选关屏 right×6 → Enter）
    pg.keyboard.press('Enter')
    pg.wait_for_timeout(800)
    for _ in range(6):
        pg.keyboard.press('ArrowRight')
        pg.wait_for_timeout(120)
    pg.keyboard.press('Enter')
    pg.wait_for_timeout(900)
    st = pg.evaluate("() => ({ state: game.state, hasBoss: !!game.boss, kind: game.boss ? game.boss.kind : -1 })")
    ck('进入 L7 且 Boss 存在', st['state'] == 'play' and st['hasBoss'], str(st))

    # ③ 玩家瞬移到 Boss 面前（激活半径 176px 内；L7 场地有坑，按右走路会摔死，不走图）
    pg.evaluate("""() => {
      const p = game.player, b = game.boss;
      p.x = b.x - 60; p.vx = 0;
      p.y = b.y + b.h - p.h - 2; p.vy = 0;
    }""")
    st = {'state': ''}
    for _ in range(40):  # 40 × 0.2s = 8s 上限
        pg.wait_for_timeout(200)
        st = pg.evaluate("() => ({ state: game.boss ? game.boss.state : '-', next: game.boss ? game.boss.next : '-' })")
        if st['state'] == 'windup':
            break
    ck('Boss 进入 windup（AI 自动选招）', st['state'] == 'windup', str(st))
    pg.wait_for_timeout(300)  # 等 rAF 画预警条
    pg.screenshot(path=str(OUT / 'v206_telegraph.png'))

    ck('全程零 pageerror', len(errors) == 0, '; '.join(errors[:3]))
    br.close()

print('\n=== v20.6 UI 冒烟: %d OK / %d FAIL ===' % (ok_n, len(fail)))
sys.exit(1 if fail else 0)
