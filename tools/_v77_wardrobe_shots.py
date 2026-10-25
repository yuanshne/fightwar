# -*- coding: utf-8 -*-
# _v77_wardrobe_shots.py —— v7.7 衣橱面板目检截图（模式照抄 _v6_ui_hover_check.py：file:// + playwright）
#  A. 封面：全关开放开关（关/开两态）+ 衣橱入口（G 键徽标）
#  B. 衣橱面板（title 入口）：4 套已解锁 + 装备中金框 + 未解锁锁形/??? + 光标白描边
#  C. 衣橱面板（select 入口，全关开放态）：选关屏顶栏只剩「衣橱」入口（金币/成长已随撤销删除）
#  D. 通关结算：L1 首次通关掉草绿 → 「获得新衣 · 草绿」行 + NEW 角标
# 输出 testshots/_v77_*.png（画布 3× 缩放，便于像素目检）
import pathlib, sys
from playwright.sync_api import sync_playwright

BASE = 'file:///C:/Users/A/.zcode/workspace/draft-6e5b5889-432a-4c7b-aabe-13a594a464ac/pixel-quest/index.html'
OUT = pathlib.Path(__file__).parent.parent / 'testshots'
OUT.mkdir(exist_ok=True)
errors = []

def shot(pg, name):
    pg.locator('#game').screenshot(path=str(OUT / name))
    print('  截图 ' + name)

def seed(pg, prof):
    pg.evaluate("""(p) => { localStorage.setItem('pq_progress', JSON.stringify(p)); }""", prof)

with sync_playwright() as pw:
    br = pw.chromium.launch()
    pg = br.new_page(viewport={'width': 1280, 'height': 800})
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append(str(e)))

    # ---- A/B：封面 + 衣橱（4 套已解锁，装备草绿） ----
    pg.goto(BASE)
    seed(pg, {'unlocked': 6, 'stars': {'0': 3, '1': 2}, 'equip': {'w': -1, 'h': -1, 'c': -1},
              'inv': [], 'shards': {}, 'nextId': 1, 'unlockAll': False,
              'skin': 'sprout', 'skins': ['blue', 'sprout', 'crystal', 'azure']})
    pg.reload()
    pg.wait_for_timeout(700)
    shot(pg, '_v77_title.png')
    pg.keyboard.press('KeyG')
    pg.wait_for_timeout(300)
    shot(pg, '_v77_wardrobe.png')
    # 光标移到第 3 格（未解锁紫晶的位置被解锁了 → 移到第 5 格天青后的未解锁区）
    pg.keyboard.press('ArrowRight'); pg.keyboard.press('ArrowRight')
    pg.keyboard.press('ArrowRight'); pg.keyboard.press('ArrowRight')
    pg.wait_for_timeout(250)
    shot(pg, '_v77_wardrobe_locked.png')
    pg.keyboard.press('Enter')          # 装备光标所在格（已解锁天青）→ 浮字「已装备 · 天青」
    pg.wait_for_timeout(220)
    shot(pg, '_v77_wardrobe_equip.png')
    pg.keyboard.press('KeyG')
    pg.wait_for_timeout(250)

    # ---- C：选关屏 + 全关开放态 ----
    pg.keyboard.press('KeyF')          # 开全关开放
    pg.wait_for_timeout(250)
    shot(pg, '_v77_title_unlock.png')
    pg.keyboard.press('Enter')         # 进选关
    pg.wait_for_timeout(400)
    shot(pg, '_v77_select.png')
    pg.keyboard.press('KeyG')          # 选关屏衣橱入口
    pg.wait_for_timeout(300)
    shot(pg, '_v77_wardrobe_select.png')
    pg.keyboard.press('Escape')
    pg.wait_for_timeout(250)

    # ---- D：通关结算掉皮（新档：只解锁 blue → L1 掉草绿） ----
    pg.evaluate("() => { localStorage.removeItem('pq_progress'); }")
    pg.goto(BASE + '?level=1')
    pg.wait_for_timeout(900)
    pg.evaluate("() => { game.state = 'clear'; }")
    pg.wait_for_timeout(1400)
    shot(pg, '_v77_clear_skin.png')

    br.close()

if errors:
    print('console/page errors:')
    for e in errors: print('  ' + e)
    sys.exit(1)
print('OK：7 张目检图已输出到 testshots/')
