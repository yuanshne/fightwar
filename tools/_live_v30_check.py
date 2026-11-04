"""v30 线上验收：GitHub Pages 是否真的跑着「31 关 + 后三章间奏 + 缓存 v43」。
用法：python tools/_live_v30_check.py
"""
from playwright.sync_api import sync_playwright
import os
import sys

BASE = os.environ.get('LIVE_BASE', "https://yuanshne.github.io/fightwar/index.html")
# 18 个街机小关（13 个 Boss 关之外的全部）
LEVELS = [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 14, 15, 17, 19, 22, 25, 29]
errs = []
ok = True


def check(cond, label, detail=''):
    global ok
    print(('PASS ' if cond else 'FAIL ') + label + ('  ' + str(detail) if detail != '' else ''))
    if not cond:
        ok = False


def arcade_state(pg, lv):
    pg.goto(BASE + '?level=%02d&cb=v30live' % lv, wait_until="load", timeout=60000)
    pg.wait_for_function("() => window.ARCADE && ARCADE.active && ARCADE._state()", timeout=15000)
    pg.wait_for_timeout(120)
    return pg.evaluate("""() => {
      const A = ARCADE._state(), d = A.data, st = A.st;
      return {
        idx: game.levelIdx, type: A.type, tilesNull: !!(game.level && game.level.tiles === null),
        state: game.state, mines: st.mines, cols: st.cols, rows: st.rows,
        scramble: st.scramble, boxes: d.boxes ? d.boxes.length : -1,
        target: st.target, quota: st.quota, survive: st.survive, shards: st.shards,
        rate: d.rate, hold: d.hold, holdReset: d.holdReset,
        paddle: d.paddle ? d.paddle.w : -1, speed: d.speed,
        gems: d.gems ? d.gems.length : -1,
        em: d.gems ? d.gems.filter(g => g.kind === 'emerald').length : -1,
        emTotal: d.emTotal !== undefined ? d.emTotal : -1,
        rocks: d.gems ? d.gems.filter(g => g.kind === 'rock').length : -1,
        walls: d.walls ? d.walls.size : -1,
        maxTargets: d.maxTargets !== undefined ? d.maxTargets : -1,
        beats: d.beats !== undefined ? d.beats : -1,
        interval: d.interval, minInt: d.minInt,
        need: d.need !== undefined ? d.need : -1,
        coin: st.totalCoin
      };
    }""")


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 960, 'height': 640})
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append(str(e)))

    pg.goto(BASE + '?level=1&cb=v30live', wait_until="load", timeout=60000)
    pg.wait_for_timeout(1800)
    info = pg.evaluate("""() => ({
      scripts: Array.from(document.scripts).map(s => s.getAttribute('src') || ''),
      n: ALL_LEVELS.length,
      arcadeOnly: ALL_LEVELS.map((l, i) => l.arcadeOnly ? i : -1).filter(i => i >= 0),
      bosses: ALL_LEVELS.map((l, i) => l.boss ? i : -1).filter(i => i >= 0)
    })""")
    check(all('v=43' in s for s in info['scripts'] if '.js' in s),
          '线上脚本全部 v=43', info['scripts'][-3:])
    check(info['n'] == 31, '线上 31 关', info['n'])
    check(info['arcadeOnly'] == [18, 21, 24, 28],
          '后三章 4 个间奏关在 L19/L22/L25/L29', info['arcadeOnly'])
    check(len(info['bosses']) == 13, '线上 13 个 Boss 关', len(info['bosses']))

    # 18 关逐一进入：街机 active、伪关卡 tiles=null、无渲染崩溃
    print('[1] 18 关全部可进入')
    for lv in LEVELS:
        s = arcade_state(pg, lv)
        check(s['idx'] == lv - 1 and s['state'] == 'play' and s['tilesNull'],
              'L%d 进入街机（%s）' % (lv, s['type']), s)

    print('[2] v29 难度参数仍在')
    s = arcade_state(pg, 1)
    check(s['type'] == 'mine' and s['cols'] == 9 and s['rows'] == 6 and s['mines'] == 12,
          'L1 扫雷 9×6 / 12 雷', s)
    s = arcade_state(pg, 3)
    check(s['type'] == 'lights' and s['cols'] == 5 and s['rows'] == 5 and s['scramble'] == 10,
          'L3 点灯 5×5 / 打乱 10', s)
    s = arcade_state(pg, 5)
    check(s['type'] == 'sokoban' and s['boxes'] == 2, 'L5 推箱子双箱', s)
    s = arcade_state(pg, 6)
    check(s['type'] == 'snake' and s['target'] == 10 and s['walls'] == 6,
          'L6 贪吃蛇 10 果 / 6 石柱', s)
    s = arcade_state(pg, 8)
    check(s['type'] == 'gold' and s['quota'] == 7 and s['gems'] == 16 and s['em'] == 5 and s['rocks'] == 3,
          'L8 矿脉 7 颗 / 5 翡翠 / 3 石', s)
    s = arcade_state(pg, 10)
    check(s['type'] == 'dodge' and s['survive'] == 40 and s['shards'] == 10,
          'L10 弹幕 40s / 10 星屑', s)
    s = arcade_state(pg, 14)
    check(s['type'] == 'maze' and abs(s['rate'] - 0.40) < 1e-6 and
          0 < s['hold'] <= 2.2 + 1e-6 and abs(s['holdReset'] - 1.0) < 1e-6,
          'L14 迷宫 rate 0.40 / hold ≤2.2 / reset 1.0', s)
    s = arcade_state(pg, 15)
    check(s['type'] == 'jumper' and s['target'] == 1200, 'L15 攀跃 1200 尺', s)
    s = arcade_state(pg, 17)
    check(s['type'] == 'breakout' and s['rows'] == 6 and s['paddle'] == 46 and s['speed'] == 168,
          'L17 打砖块 6 行 / 46px / 球速 168', s)

    print('[3] v30 四个间奏关参数')
    s = arcade_state(pg, 19)
    check(s['type'] == 'cannon' and s['quota'] == 8 and s['maxTargets'] == 5 and s['coin'] == 1,
          'L19 幽冥炮台 8 只 / 同屏 5 / 1 币', s)
    s = arcade_state(pg, 22)
    check(s['type'] == 'rhythm' and s['beats'] == 10 and abs(s['interval'] - 1.2) < 1e-6 and
          abs(s['minInt'] - 0.85) < 1e-6 and s['coin'] == 1,
          'L22 回响节拍 10 拍 / 1.2s→0.85s / 1 币', s)
    s = arcade_state(pg, 25)
    check(s['type'] == 'gold' and s['quota'] == 8 and s['emTotal'] == 6 and
          s['gems'] == 19 and s['em'] == 6 and s['rocks'] == 5,
          'L25 喉中拾遗 8 颗 / 6 翡翠 / 5 石', s)
    s = arcade_state(pg, 29)
    check(s['type'] == 'dodge' and s['survive'] == 45 and s['need'] == 12 and s['shards'] == 12,
          'L29 镜海流星 45s / 12 星屑', s)

    b.close()

print('CONSOLE_ERRORS:', len(errs))
for e in errs[:8]:
    print(' -', e)
if errs:
    ok = False
print('LIVE RESULT:', 'PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)
