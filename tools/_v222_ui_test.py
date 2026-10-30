# -*- coding: utf-8 -*-
"""v22 UI 端到端冒烟（playwright）：冲刺键绑定鼠标侧键。

链路：暂停面板点「冲刺键」→ 监听态 → 按鼠标侧键（MouseEvent button=3/4）→ 生效 + 持久化。
  1. 进 L1 → P 暂停 → 点按钮进监听态 → 派发 mousedown(button=3) → pq_dashkey=Mouse4（截图）
  2. P 恢复 → 派发 mousedown(button=3) → 玩家 dashT/dashCd > 0（侧键真实触发冲刺）
  3. mouseup(button=3) 释放 → 未绑定侧键(button=4)不触发冲刺
  4. reload → 存档保留 → 侧键仍能冲刺（持久化生效）（截图）
  5. 改回键盘 K：监听态按 K → pq_dashkey=KeyK
  6. 全程零 pageerror
用法：D:/python/python.exe tools/_v222_ui_test.py
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


def btn_click(pg):
    """点击暂停面板「冲刺键」按钮：VIEW(192,109) → canvas 实坐标"""
    r = pg.evaluate("() => { const r = document.querySelector('canvas').getBoundingClientRect();"
                    " return { l: r.left, t: r.top, w: r.width, h: r.height }; }")
    pg.mouse.click(r['l'] + 192 * (r['w'] / 384.0), r['t'] + 109 * (r['h'] / 224.0))
    pg.wait_for_timeout(300)


def side_down(pg, button):
    """派发鼠标侧键按下（button 3=后退 / 4=前进）。合成事件不经过 Playwright mouse（其只支持左/中/右）。"""
    pg.evaluate("(b) => { document.querySelector('canvas').dispatchEvent("
                "new MouseEvent('mousedown', { button: b, bubbles: true })); }", button)
    pg.wait_for_timeout(150)


def side_up(pg, button):
    pg.evaluate("(b) => { window.dispatchEvent("
                "new MouseEvent('mouseup', { button: b, bubbles: true })); }", button)
    pg.wait_for_timeout(100)


def wait_dash(pg):
    st = {'dashT': -1, 'dashCd': -1}
    for _ in range(20):
        pg.wait_for_timeout(100)
        st = pg.evaluate("() => { const p = game.player;"
                         " return { dashT: p ? (p.dashT || 0) : -1, dashCd: p ? (p.dashCd || 0) : -1 }; }")
        if st['dashT'] > 0 or st['dashCd'] > 0:
            return st
    return st


with sync_playwright() as pw:
    br = pw.chromium.launch()
    pg = br.new_page(viewport={'width': 1024, 'height': 768})
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(BASE)
    pg.wait_for_timeout(1800)

    # 标题屏 → 选关 → 进 L1
    pg.keyboard.press('Enter')
    pg.wait_for_timeout(900)
    pg.keyboard.press('Enter')
    pg.wait_for_timeout(900)
    st = pg.evaluate("() => ({ state: game.state })")
    ck('进入 L1', st['state'] == 'play', str(st))

    # ① 监听态绑定鼠标侧键（button=3 后退键）
    pg.keyboard.press('P')
    pg.wait_for_timeout(400)
    btn_click(pg)
    pg.screenshot(path=str(OUT / 'v222_listening.png'))
    side_down(pg, 3)
    side_up(pg, 3)
    st = pg.evaluate("() => localStorage.getItem('pq_dashkey')")
    ck('监听态按侧键(后退) → pq_dashkey=Mouse4', st == 'Mouse4', repr(st))
    st = pg.evaluate("() => ({ paused: game.paused })")
    ck('绑定后监听态自动结束（仍暂停）', st['paused'] is True, str(st))
    pg.screenshot(path=str(OUT / 'v222_bound.png'))

    # ② 侧键真实触发冲刺
    pg.keyboard.press('P')
    pg.wait_for_timeout(400)
    side_down(pg, 3)
    st = wait_dash(pg)
    ck('侧键(后退)触发冲刺 dashT/dashCd>0', st['dashT'] > 0 or st['dashCd'] > 0, str(st))
    side_up(pg, 3)

    # ③ 未绑定的另一颗侧键（前进）不触发任何输入
    pg.evaluate("() => { const p = game.player; p.dashT = 0; p.dashCd = 0; }")
    side_down(pg, 4)
    side_up(pg, 4)
    pg.wait_for_timeout(400)
    st = pg.evaluate("() => { const p = game.player; return { dashT: p.dashT || 0, dashCd: p.dashCd || 0 }; }")
    ck('未绑定的侧键(前进)不触发冲刺', st['dashT'] <= 0 and st['dashCd'] <= 0, str(st))

    # ④ reload 持久化：侧键仍能冲刺
    pg.reload()
    pg.wait_for_timeout(1800)
    pg.keyboard.press('Enter')
    pg.wait_for_timeout(900)
    pg.keyboard.press('Enter')
    pg.wait_for_timeout(900)
    st = pg.evaluate("() => ({ state: game.state })")
    ck('reload 后重新进入 L1', st['state'] == 'play', str(st))
    st = pg.evaluate("() => localStorage.getItem('pq_dashkey')")
    ck('reload 后存档保留 Mouse4', st == 'Mouse4', repr(st))
    side_down(pg, 3)
    st = wait_dash(pg)
    ck('reload 后侧键仍触发冲刺（存档生效）', st['dashT'] > 0 or st['dashCd'] > 0, str(st))
    side_up(pg, 3)
    pg.screenshot(path=str(OUT / 'v222_dash.png'))

    # ⑤ 改回键盘键（用 N：未被任何动作占用；K 被数织·叉格占用、J 被普攻占用，监听态会拒绝）
    pg.keyboard.press('P')
    pg.wait_for_timeout(400)
    btn_click(pg)
    pg.keyboard.press('N')
    pg.wait_for_timeout(300)
    st = pg.evaluate("() => localStorage.getItem('pq_dashkey')")
    ck('监听态按 N 改回键盘（K/J 会被既有占用拒绝，属 v20.8 既有语义）', st == 'KeyN', repr(st))

    ck('全程零 pageerror', len(errors) == 0, '; '.join(errors[:3]))
    br.close()

print('\n=== v22 UI 冒烟: %d OK / %d FAIL ===' % (ok_n, len(fail)))
sys.exit(1 if fail else 0)
