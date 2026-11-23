# -*- coding: utf-8 -*-
"""
_qa_v55_v222.py —— v222 冲刺侧键测试的基线对照定性。
同一套流程分别跑 .snap_before 基线与主目录，对比断言失败是否一致（存量 vs 本轮引入）。
用法: D:/python/python.exe tools/_qa_v55_v222.py <before|after>
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
SB = ROOT / '.snap_before' / 'index.html'
AF = ROOT / 'index.html'
OUT = ROOT / '.screenshots' / 'qa' / 'v222_control'
OUT.mkdir(parents=True, exist_ok=True)

target = sys.argv[1] if len(sys.argv) > 1 else 'after'
BASE = 'file:///' + str(SB if target == 'before' else AF).replace('\\', '/')

ok_n = 0
fail = []
checks = []


def ck(name, cond, detail=''):
    global ok_n
    if cond:
        ok_n += 1
        checks.append((name, 'OK', detail))
        print('  [OK]  %s  %s' % (name, detail))
    else:
        fail.append(name)
        checks.append((name, 'FAIL', detail))
        print('  [FAIL] %s  %s' % (name, detail))


def btn_click(pg):
    r = pg.evaluate("() => { const r = document.querySelector('canvas').getBoundingClientRect();"
                    " return { l: r.left, t: r.top, w: r.width, h: r.height }; }")
    pg.mouse.click(r['l'] + 192 * (r['w'] / 384.0), r['t'] + 109 * (r['h'] / 224.0))
    pg.wait_for_timeout(300)


def side_down(pg, button):
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

    pg.keyboard.press('Enter')
    pg.wait_for_timeout(900)
    pg.keyboard.press('Enter')
    pg.wait_for_timeout(900)
    st = pg.evaluate("() => ({ state: game.state })")
    ck('进入 L1', st['state'] == 'play', str(st))

    pg.keyboard.press('P')
    pg.wait_for_timeout(400)
    btn_click(pg)
    pg.screenshot(path=str(OUT / ('v222_%s_listening.png' % target)))
    side_down(pg, 3)
    side_up(pg, 3)
    st = pg.evaluate("() => localStorage.getItem('pq_dashkey')")
    ck('监听态按侧键(后退) → pq_dashkey=Mouse4', st == 'Mouse4', repr(st))
    st = pg.evaluate("() => ({ paused: game.paused })")
    ck('绑定后监听态自动结束（仍暂停）', st['paused'] is True, str(st))

    pg.keyboard.press('P')
    pg.wait_for_timeout(400)
    side_down(pg, 3)
    st = wait_dash(pg)
    ck('侧键(后退)触发冲刺 dashT/dashCd>0', st['dashT'] > 0 or st['dashCd'] > 0, str(st))
    side_up(pg, 3)

    pg.evaluate("() => { const p = game.player; if (p) { p.dashT = 0; p.dashCd = 0; } }")
    side_down(pg, 4)
    side_up(pg, 4)
    pg.wait_for_timeout(400)
    st = pg.evaluate("() => { const p = game.player; return p ? { dashT: p.dashT || 0, dashCd: p.dashCd || 0 } : { dashT: -1, dashCd: -1 }; }")
    ck('未绑定的侧键(前进)不触发冲刺', st['dashT'] <= 0 and st['dashCd'] <= 0, str(st))

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

    pg.keyboard.press('P')
    pg.wait_for_timeout(400)
    btn_click(pg)
    pg.keyboard.press('N')
    pg.wait_for_timeout(300)
    st = pg.evaluate("() => localStorage.getItem('pq_dashkey')")
    ck('监听态按 N 改回键盘', st == 'KeyN', repr(st))

    ck('全程零 pageerror', len(errors) == 0, '; '.join(errors[:3]))
    br.close()

print('\n=== v222 [%s]: %d OK / %d FAIL ===' % (target, ok_n, len(fail)))
import json
(OUT / ('v222_%s_result.json' % target)).write_text(
    json.dumps({'target': target, 'ok': ok_n, 'fail': fail, 'checks': checks, 'pageerror': errors},
               ensure_ascii=False, indent=2), encoding='utf-8')
sys.exit(1 if fail else 0)
