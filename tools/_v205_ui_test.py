# -*- coding: utf-8 -*-
"""v20.5 UI 端到端冒烟（playwright）：死亡三振 → 失败界面 → Esc 返回选关 + 剑弧光渲染。

不测数值（node 侧 _v205_sword_fail_test.js 已覆盖），只测「玩家看得到的链路」：
  1. 进 L1 → 引擎连杀 3 次 → game.state=fail → 失败面板渲染（截图人工复核）
  2. Esc → 回选关屏（截图人工复核）
  3. 全程零 pageerror
用法：D:/python/python.exe tools/_v205_ui_test.py
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
    pg.wait_for_timeout(1800)

    # 标题屏 → 进选关 → 进 L1
    pg.keyboard.press('Enter')
    pg.wait_for_timeout(900)
    pg.keyboard.press('Enter')  # 选关屏默认选中 L1，Enter 进关
    pg.wait_for_timeout(900)
    st = pg.evaluate("() => ({ state: game.state, hero: game.hero })")
    ck('进入 L1', st['state'] == 'play', str(st))

    # 引擎连杀 3 次（每轮同步推进 1s 越过 0.9s 复活窗口；rAF 在 evaluate 期间不跑，无并发）
    st = pg.evaluate("""() => {
      for (let i = 0; i < 3; i++) {
        killPlayer();
        for (let f = 0; f < 70; f++) updateWorld(1/60);
        if (game.state === 'fail') break;
      }
      return { state: game.state, deaths: game.deaths, dead: game.player.dead };
    }""")
    ck('三次阵亡判负 state=fail', st['state'] == 'fail', str(st))
    ck('deaths=3 / 玩家保持死亡', st['deaths'] == 3 and st['dead'] is True, str(st))

    pg.wait_for_timeout(1500)  # rAF 跑 step → uiState 切 fail、面板入场
    pg.screenshot(path=str(OUT / 'fail_panel.png'))
    st = pg.evaluate("() => ({ state: game.state, failT: game.failT })")
    ck('失败面板态保持', st['state'] == 'fail' and st['failT'] > 0.5, str(st))

    # Esc → 返回选关
    pg.keyboard.press('Escape')
    pg.wait_for_timeout(900)
    pg.screenshot(path=str(OUT / 'back_to_select.png'))
    st = pg.evaluate("() => ({ state: game.state })")
    ck('Esc 后 game.state 仍 fail（不复活不重置）', st['state'] == 'fail', str(st))

    ck('全程零 pageerror', len(errors) == 0, '; '.join(errors[:3]))
    br.close()

print('\n=== v20.5 UI 冒烟: %d OK / %d FAIL ===' % (ok_n, len(fail)))
sys.exit(1 if fail else 0)
