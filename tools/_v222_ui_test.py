# -*- coding: utf-8 -*-
"""v222 UI 端到端冒烟（playwright）：冲刺键绑定（键盘 + 鼠标侧键）。

链路：Boss 关暂停面板点「冲刺键」→ 监听态 → 鼠标侧键(button=3) 绑定 Mouse4 → 生效 + 持久化；
      再改绑键盘 N。

v54 现代化（C 任务）定性与调整：
  · v26 起非 Boss 关改为街机小游戏（ARCADE 运行时不构建平台关卡、不生成玩家）。旧脚本从标题流程
    进 L1（索引 0），落到街机关 → game.player=null，暂停面板的改键链路也不在街机关上走。
    本脚本改为 URL `?level=7` 直达首个非街机 Boss 关（kind1 星核巨兽，ARCADE.has(6)=false），
    走 ui 内部 startLevel 链路，与真实玩家进关一致；不再走标题/选关键盘导航。
  · 现行监听态侧键链路可用：canvas mousedown(button=3) → Mouse4（button=4 → Mouse5）；
    合成 MouseEvent 直接派发到 canvas，与 ui 监听目标一致。
  · 键盘改绑用 N：K 是冲刺默认/数织叉格占用、J 普攻占用，监听态按占用键会被 handleKeyListen 拒绝，
    属 v20.8 既有语义，不把它当失败。
  · 路径 BASE 从脚本位置推导（不再写死绝对路径）；截图/输出目录 .screenshots/c_tools。
用法：D:/python/python.exe tools/_v222_ui_test.py
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = 'file:///' + str((ROOT / 'index.html')).replace('\\', '/')
OUT = ROOT / '.screenshots' / 'c_tools'
OUT.mkdir(parents=True, exist_ok=True)

# 直达的非街机 Boss 关：L7 = 索引 6（kind1 星核巨兽）。ARCADE 拥有索引 0/1/2/3/4/5/7/...，
# 选关表按 kind 不写死关卡名；若未来关卡漂移，探针可先在选关表中找第一个 !ARCADE.has 的索引。
BOSS_LEVEL_URL = BASE + '?level=7'

ok_n = 0
fail = []
skip_n = 0
skipped = []


def ck(name, cond, detail=''):
    global ok_n
    if cond:
        ok_n += 1
        print('  [OK]  %s  %s' % (name, detail))
    else:
        fail.append(name)
        print('  [FAIL] %s  %s' % (name, detail))


def skip_case(name, reason):
    global skip_n
    skip_n += 1
    skipped.append(name + ' —— ' + reason)
    print('  [SKIP] %s（%s）' % (name, reason))


def btn_click(pg):
    """点击暂停面板「冲刺键」按钮：VIEW(192,109) → canvas 实坐标（热区几何与 ui keyBtnRect 同源口径）"""
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


def player_state(pg):
    return pg.evaluate("() => { const p = game.player;"
                       " return { present: !!p, dashT: p ? (p.dashT || 0) : -1, dashCd: p ? (p.dashCd || 0) : -1 }; }")


def wait_dash(pg):
    st = {'dashT': -1, 'dashCd': -1}
    for _ in range(20):
        pg.wait_for_timeout(100)
        st = player_state(pg)
        if st['dashT'] > 0 or st['dashCd'] > 0:
            return st
    return st


with sync_playwright() as pw:
    br = pw.chromium.launch()
    pg = br.new_page(viewport={'width': 1024, 'height': 768})
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))

    # 先开到页面清掉旧的 pq_dashkey，避免上一轮运行残留把 ① 绑定断言掩盖掉
    pg.goto(BASE)
    pg.wait_for_timeout(1200)
    pg.evaluate("() => { try { localStorage.removeItem('pq_dashkey'); } catch (e) {} }")

    pg.goto(BOSS_LEVEL_URL)
    pg.wait_for_timeout(1800)
    st = pg.evaluate("() => ({ state: game.state, player: !!game.player, paused: game.paused,"
                     " level: game.level && game.level.meta && game.level.meta.name })")
    ck('直达非街机 Boss 关', st['state'] == 'play' and st['player'], str(st))
    if not st['player']:
        # 平台关玩家缺失属环境/加载问题，不继续往后做空断言；明确报错而不是悄悄 PASS。
        skip_case('冲刺键绑定/触发后续链路', '进关后 game.player=null（疑似落入街机关或关卡未就绪），无法在玩家实体上验冲刺')

    if st['player']:
        # ① 监听态绑定鼠标侧键（button=3 后退键 → Mouse4）
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

        # ③ 未绑定的另一颗侧键（前进=Mouse5）不触发任何冲刺输入
        pg.evaluate("() => { const p = game.player; if (p) { p.dashT = 0; p.dashCd = 0; } }")
        side_down(pg, 4)
        side_up(pg, 4)
        pg.wait_for_timeout(400)
        st = player_state(pg)
        ck('未绑定的侧键(前进)不触发冲刺', st['dashT'] <= 0 and st['dashCd'] <= 0, str(st))

        # ④ reload 持久化：存档保留 → 侧键仍能冲刺
        pg.reload()
        pg.wait_for_timeout(1800)
        st = pg.evaluate("() => ({ state: game.state, player: !!game.player })")
        ck('reload 后重新进入 Boss 关', st['state'] == 'play' and st['player'], str(st))
        st = pg.evaluate("() => localStorage.getItem('pq_dashkey')")
        ck('reload 后存档保留 Mouse4', st == 'Mouse4', repr(st))
        if st == 'Mouse4':
            side_down(pg, 3)
            st = wait_dash(pg)
            ck('reload 后侧键仍触发冲刺（存档生效）', st['dashT'] > 0 or st['dashCd'] > 0, str(st))
            side_up(pg, 3)
        pg.screenshot(path=str(OUT / 'v222_dash.png'))

        # ⑤ 改回键盘键 N（K/J 被既有动作占用，监听态会拒绝，属 v20.8 既有语义）
        pg.keyboard.press('P')
        pg.wait_for_timeout(400)
        btn_click(pg)
        pg.keyboard.press('N')
        pg.wait_for_timeout(300)
        st = pg.evaluate("() => localStorage.getItem('pq_dashkey')")
        ck('监听态按 N 改绑键盘 KeyN', st == 'KeyN', repr(st))

    ck('全程零 pageerror', len(errors) == 0, '; '.join(errors[:3]))
    br.close()

print('\n=== v22 UI 冒烟: %d OK / %d FAIL / %d SKIP ===' % (ok_n, len(fail), skip_n))
if skipped:
    print('--- SKIP 明细 ---')
    for s in skipped:
        print('  * ' + s)
sys.exit(1 if fail else 0)
