# -*- coding: utf-8 -*-
"""v20.8 UI 端到端冒烟（playwright）：冲刺键自定义。

链路：暂停面板点「冲刺键」→ 监听态 → 按新键 → 生效 + 持久化 + 冲突拒绝。
  1. 进 L1 → P 暂停 → 面板显示「冲刺键： K」（截图）
  2. 点击按钮 → 监听态（截图）→ 按 N → localStorage=pq_dashkey=KeyN
  3. P 恢复 → 按 N → 玩家 dashT/dashCd > 0（改键真实生效）
  4. P 暂停 → 点按钮 → 按 J（已被普攻占用）→ 提示红字（截图）+ 存档不变 → Esc 取消监听
  5. reload → localStorage 保留 → 直接按 N 仍能冲刺（持久化生效）
  6. 全程零 pageerror
用法：D:/python/python.exe tools/_v208_keymap_test.py
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
    """点击暂停面板「冲刺键」按钮：VIEW(192,109) → canvas 实坐标（192 恒在按钮内，无需知道宽）"""
    r = pg.evaluate("() => { const r = document.querySelector('canvas').getBoundingClientRect();"
                    " return { l: r.left, t: r.top, w: r.width, h: r.height }; }")
    pg.mouse.click(r['l'] + 192 * (r['w'] / 384.0), r['t'] + 109 * (r['h'] / 224.0))
    pg.wait_for_timeout(300)


def wait_dash(pg):
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

    # ① P 暂停 → 面板显示默认冲刺键 K
    pg.keyboard.press('P')
    pg.wait_for_timeout(400)
    st = pg.evaluate("() => ({ paused: game.paused })")
    ck('P 暂停', st['paused'] is True, str(st))
    pg.screenshot(path=str(OUT / 'v208_pause_default.png'))

    # ② 点击改键按钮 → 监听态 → 按 N
    btn_click(pg)
    pg.screenshot(path=str(OUT / 'v208_listening.png'))
    pg.keyboard.press('N')
    pg.wait_for_timeout(300)
    st = pg.evaluate("() => localStorage.getItem('pq_dashkey')")
    ck('按 N 改键并持久化 pq_dashkey=KeyN', st == 'KeyN', repr(st))

    # ③ P 恢复 → 按 N 冲刺 → dashT/dashCd > 0
    pg.keyboard.press('P')
    pg.wait_for_timeout(400)
    pg.keyboard.press('N')
    st = wait_dash(pg)
    ck('恢复后按 N 触发冲刺', st['dashT'] > 0 or st['dashCd'] > 0, str(st))

    # ④a Esc 取消监听：点按钮进入监听态 → Esc → 应仍处于暂停且不被穿透回选关
    pg.keyboard.press('P')
    pg.wait_for_timeout(400)
    btn_click(pg)
    pg.keyboard.press('Escape')
    pg.wait_for_timeout(300)
    st = pg.evaluate("() => ({ paused: game.paused })")
    ck('Esc 仅取消监听、仍处于暂停', st['paused'] is True, str(st))
    # ④b 冲突拒绝：再进监听态按 J（普攻占用）→ 自动结束监听、存档不变
    btn_click(pg)
    pg.keyboard.press('J')
    pg.wait_for_timeout(300)
    st = pg.evaluate("() => localStorage.getItem('pq_dashkey')")
    ck('按 J 被拒（存档仍是 KeyN）', st == 'KeyN', repr(st))
    pg.screenshot(path=str(OUT / 'v208_conflict.png'))
    st = pg.evaluate("() => ({ paused: game.paused })")
    ck('冲突后仍在暂停（监听已自动结束）', st['paused'] is True, str(st))
    pg.keyboard.press('P')
    pg.wait_for_timeout(300)

    # ⑤ reload 持久化：按 N 直接冲刺
    pg.reload()
    pg.wait_for_timeout(1800)
    pg.keyboard.press('Enter')
    pg.wait_for_timeout(900)
    pg.keyboard.press('Enter')
    pg.wait_for_timeout(900)
    st = pg.evaluate("() => ({ state: game.state })")
    ck('reload 后重新进入 L1', st['state'] == 'play', str(st))
    pg.keyboard.press('N')
    st = wait_dash(pg)
    ck('reload 后按 N 仍触发冲刺（存档生效）', st['dashT'] > 0 or st['dashCd'] > 0, str(st))

    ck('全程零 pageerror', len(errors) == 0, '; '.join(errors[:3]))
    br.close()

print('\n=== v20.8 UI 冒烟: %d OK / %d FAIL ===' % (ok_n, len(fail)))
sys.exit(1 if fail else 0)
