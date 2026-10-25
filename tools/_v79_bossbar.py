# -*- coding: utf-8 -*-
# _v79_bossbar.py —— v7.9 Boss 三段血条目检截图（file:// + playwright，模式同 _v77_wardrobe_shots.py）
#  L16 → 玩家瞬移到 Boss 左侧 80px → 等 intro 演完；再直接改 game.boss 字段造 4 个状态：
#   满血 / bandBreak=1 当前段半血 / bandBreak=1 当前段满血 / bandBreak=2 末段残血
#  当前段填充只看 hp/bandMax（段内比例）；total 仅文案用。
# 断言 page.on('pageerror') 为空
import pathlib, sys
from playwright.sync_api import sync_playwright

BASE = 'file:///C:/Users/A/.zcode/workspace/draft-6e5b5889-432a-4c7b-aabe-13a594a464ac/pixel-quest/index.html'
OUT = pathlib.Path(__file__).parent.parent / 'testshots'
OUT.mkdir(exist_ok=True)
errors = []


def shot(pg, name):
    pg.locator('#game').screenshot(path=str(OUT / name))
    print('  截图 ' + name)


def set_seg(pg, brk, cur_frac):
    # bandMax 缺失（引擎三段血未合入）时按契约 maxHp/3 补上，保证回落分支之外的正路也能被测到
    info = pg.evaluate("""(a) => {
        const b = game.boss;
        if (!b) return null;
        if (!(b.bandMax > 0)) b.bandMax = Math.max(1, Math.round(b.maxHp / 3));
        b.bandBreak = a.brk;
        b.hp = Math.max(1, Math.round(b.bandMax * a.frac));
        b.flashT = 0; b.bandFlashT = 0; b.state = 'idle'; b.t = 0;
        return {kind: b.kind, maxHp: b.maxHp, bandMax: b.bandMax, bandBreak: b.bandBreak, hp: b.hp,
                pct: Math.round(((2 - b.bandBreak) * b.bandMax + b.hp) / b.maxHp * 100)};
    }""", {'brk': brk, 'frac': cur_frac})
    print('    boss 状态:', info)


with sync_playwright() as pw:
    br = pw.chromium.launch()
    pg = br.new_page(viewport={'width': 1280, 'height': 800})
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append(str(e)))

    pg.goto(BASE + '?level=16&god=1')
    pg.wait_for_timeout(1000)
    pg.evaluate("""() => { if (game.boss && game.player) {
        game.player.x = game.boss.x - 80; game.player.y = game.boss.y;
        game.player.vx = 0; game.player.vy = 0; } }""")
    pg.wait_for_timeout(2500)          # intro 1.8s 演完 → idle，血条常显

    print('引擎自带 bandMax:', pg.evaluate("() => !!(game.boss && game.boss.bandMax > 0)"),
          '（False=引擎三段血未合入，下面由脚本注入）')

    set_seg(pg, 0, 1.0);   pg.wait_for_timeout(260); shot(pg, '_v79_bar_fix_full.png')    # 满血：右段满红，另两段暗
    set_seg(pg, 1, 0.5);   pg.wait_for_timeout(260); shot(pg, '_v79_bar_fix_b1_half.png')  # 中段半血，右段已叉
    set_seg(pg, 1, 1.0);   pg.wait_for_timeout(260); shot(pg, '_v79_bar_fix_b1_full.png')  # 中段满红（刚进第二条命）
    set_seg(pg, 2, 0.25);  pg.wait_for_timeout(260); shot(pg, '_v79_bar_fix_b2_low.png')   # 末段残血，右两段已叉

    br.close()

if errors:
    print('console/page errors:')
    for e in errors:
        print('  ' + e)
    sys.exit(1)
print('OK：4 张三段血条目检图已输出到 testshots/_v79_bar_fix_*.png')
