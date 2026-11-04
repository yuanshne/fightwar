"""v28 线上验收：GitHub Pages 是否真的在跑地图三与三只新 Boss。
用法：python tools/_live_v28_check.py
"""
from playwright.sync_api import sync_playwright
import os
import sys

BASE = os.environ.get('LIVE_BASE', "https://yuanshne.github.io/fightwar/index.html")
errs = []
ok = True


def check(cond, label, detail=''):
    global ok
    print(('PASS ' if cond else 'FAIL ') + label + ('  ' + str(detail) if detail != '' else ''))
    if not cond:
        ok = False


def enter(pg, lv):
    pg.goto(BASE + '?level=%d&cb=v28live' % lv, wait_until="load", timeout=60000)
    pg.wait_for_function("() => window.game && game.boss && game.state === 'play'", timeout=15000)
    # 贴近激活，等 intro 走完进 idle（线上不能直接改 state 后测承伤）
    pg.evaluate("""() => { const b = game.boss, p = game.player;
      p.x = Math.max(30, b.x - 120); p.y = b.y + b.h - p.h; p.vx = 0; p.onGround = true; }""")
    pg.wait_for_function("() => game.boss.state === 'idle'", timeout=15000)
    pg.wait_for_timeout(120)


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 960, 'height': 640})
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append(str(e)))

    pg.goto(BASE + '?level=1&cb=v28live', wait_until="load", timeout=60000)
    pg.wait_for_timeout(2200)
    info = pg.evaluate("""() => ({
      scripts: Array.from(document.scripts).map(s => s.getAttribute('src') || ''),
      n: ALL_LEVELS.length,
      last: ALL_LEVELS.slice(-3).map(l => ({ name: l.name, boss: l.boss, theme: l.theme }))
    })""")
    check(all('v=41' in s for s in info['scripts'] if '.js' in s),
          '线上脚本全部 v=41', info['scripts'][-3:])
    check(info['n'] == 27, '线上 27 关', info['n'])
    check([x['boss'] for x in info['last']] == [12, 13, 14],
          'L25~L27 依次是 kind 12/13/14', [x['boss'] for x in info['last']])
    check([x['theme'] for x in info['last']] == ['anthem', 'mirror', 'abyss'],
          'L25~L27 主题 anthem/mirror/abyss', [x['theme'] for x in info['last']])

    # L25：三种招牌齐备 + 合拍 ×2（同一帧内设 beatT=0 再走承伤入口）
    enter(pg, 25)
    a = pg.evaluate("""() => { const b = game.boss, T = _engBossTable(12), before = b.hpTotal;
      b.state = 'idle'; b.t = 0; b.beatT = 0; b.beatStreak = 0;
      _engBossHurt(10, false, false);
      return { kind: b.kind, max: b.maxHp, drop: before - b.hpTotal,
        moves: T.poolNear.concat(T.poolFar).filter((v, i, arr) => arr.indexOf(v) === i) }; }""")
    check(a['kind'] == 12 and a['max'] == 600, 'L25 律动·俄耳甫斯 hp 600', str(a['kind']) + '/' + str(a['max']))
    check(a['drop'] >= 20, 'L25 拍点命中 ×2（10 → ≥20）', a['drop'])
    check(set(a['moves']) >= {'staccato', 'tutti', 'fermata'},
          'L25 三种招牌都在池里', a['moves'])

    # L26：三枚镜片 + 20% 减伤
    enter(pg, 26)
    s = pg.evaluate("""() => { const b = game.boss, before = b.hpTotal;
      const shards = game.hazards.filter(h => h.kind === 'shard').length;
      b.state = 'idle'; b.t = 0; b.breakT = 0; b.beatStreak = 0;
      _engBossHurt(10, false, false);
      return { kind: b.kind, max: b.maxHp, shards: shards, drop: before - b.hpTotal }; }""")
    check(s['kind'] == 13 and s['max'] == 570, 'L26 镜渊·无相 hp 570', str(s['kind']) + '/' + str(s['max']))
    check(s['shards'] == 3, 'L26 登场三枚镜片', s['shards'])
    check(s['drop'] <= 3, 'L26 三镜片时本体只吃 20%（10 → ≤3）', s['drop'])

    # L27：凝视槽 + 660 血
    enter(pg, 27)
    g = pg.evaluate("""() => { const b = game.boss;
      return { kind: b.kind, max: b.maxHp, gaze: b.gaze, cap: _engBossTable(14).gaze.cap }; }""")
    check(g['kind'] == 14 and g['max'] == 660, 'L27 终焉·阿刻戎 hp 660', str(g['kind']) + '/' + str(g['max']))
    check(g['cap'] == 100 and 0 <= g['gaze'] <= 100, 'L27 凝视槽 0~100', str(g['gaze']) + '/' + str(g['cap']))

    # 选关第五章：F 解锁 → Enter → 5 → Enter，应直接进入 L25（index 24）
    pg.goto(BASE, wait_until="load", timeout=60000)
    pg.wait_for_timeout(500)
    pg.keyboard.press('f')
    pg.wait_for_timeout(250)
    pg.keyboard.press('Enter')
    pg.wait_for_timeout(700)
    pg.keyboard.press('Digit5')
    pg.wait_for_timeout(450)
    pg.screenshot(path="tools/_shots/v28_live_select_ch5.png")
    pg.keyboard.press('Enter')
    pg.wait_for_function("() => game.boss && game.state === 'play'", timeout=15000)
    lv = pg.evaluate("() => ({ idx: game.levelIdx, kind: game.boss.kind })")
    check(lv['idx'] == 24 and lv['kind'] == 12, '选关切章到第五章并进入 L25', str(lv['idx']) + '/' + str(lv['kind']))
    pg.screenshot(path="tools/_shots/v28_live_select_ch5.png")
    b.close()

print('CONSOLE_ERRORS:', len(errs))
for e in errs[:8]:
    print(' -', e)
if errs:
    ok = False
print('LIVE RESULT:', 'PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)
