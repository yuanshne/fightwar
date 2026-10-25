# -*- coding: utf-8 -*-
# v6 集成实测：下坠手感/4技能/悬停/敌人技能/装备全链路
from playwright.sync_api import sync_playwright
import pathlib

BASE = 'file:///C:/Users/A/.zcode/workspace/draft-6e5b5889-432a-4c7b-aabe-13a594a464ac/pixel-quest/index.html'
OUT = pathlib.Path(__file__).parent.parent / 'testshots'
errs = []

def shot(pg, name):
    pg.screenshot(path=str(OUT / name))

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={'width': 1152, 'height': 680})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)

    # ---------- 1) 下坠手感 ----------
    pg.goto(BASE + '?level=3'); pg.wait_for_timeout(900)  # 天空关，脚下是空
    pg.evaluate("() => { game.player.x = 300; game.player.y = 20; }")
    pg.wait_for_timeout(500)
    f1 = pg.evaluate("() => ({vy: Math.round(game.player.vy)})")
    pg.evaluate("() => { game.player.x = 300; game.player.y = 20; game.player.vy = 0; }")
    pg.keyboard.down('ArrowDown'); pg.wait_for_timeout(500); pg.keyboard.up('ArrowDown')
    f2 = pg.evaluate("() => ({vy: Math.round(game.player.vy), dead: game.player.dead})")
    print(f'下坠: 普通最大vy≈{f1["vy"]}(应≈285) | 按住↓≈{f2["vy"]}(应≈360)')

    # ---------- 2) 技能4 星刃回旋 ----------
    pg.goto(BASE + '?level=1'); pg.wait_for_timeout(800)
    pg.keyboard.press('KeyL'); pg.wait_for_timeout(200)
    bl = pg.evaluate("() => ({n: (game.blades||[]).length, cdl: +(game.skills.l||0).toFixed(1)})")
    pg.wait_for_timeout(400)
    bl2 = pg.evaluate("() => ({n: (game.blades||[]).length})")
    print(f'技能L星刃: 释放后实体={bl["n"]} CD={bl["cdl"]}s -> 0.4s后回收={bl2["n"]}')

    # ---------- 3) 鼠标悬停技能提示卡 ----------
    pg.mouse.move(1152/2, 1152/2); pg.wait_for_timeout(200)
    # 技能槽在 HUD 右上区域（内部分辨率384宽，技能槽x≈296-360,y≈18-34 → 外部坐标按3x缩放）
    pg.mouse.move(320*3, 26*3); pg.wait_for_timeout(300)
    shot(pg, 'v6_hover.png')
    hov = pg.evaluate("() => 1")  # 悬停状态在闭包内，用截图目检
    print('悬停提示卡: 已截图 v6_hover.png（人工审查）')

    # ---------- 4) 敌人技能（史莱姆弹跳/法师火球） ----------
    pg.evaluate("() => { const e=game.level.enemies.find(x=>x.type==='slime'&&!x.dead); e.x=game.player.x+60; }")
    pg.wait_for_timeout(2500)
    sk = pg.evaluate("() => { const e=game.level.enemies.find(x=>x.type==='slime'); return e.ai? {st:e.ai.st,cd:+e.ai.cd.toFixed(1)} : null; }")
    print('史莱姆技能状态机:', sk)
    pg.goto(BASE + '?level=9'); pg.wait_for_timeout(800)
    mg = pg.evaluate("() => { const m=game.level.enemies.find(x=>x.type==='mage'); if(!m) return null; game.player.x=m.x-100; game.player.y=m.y; return {hp:m.hp, ai:m.ai.st}; }")
    pg.wait_for_timeout(1300)
    mg2 = pg.evaluate("() => { const m=game.level.enemies.find(x=>x.type==='mage'); return {st:m?m.ai.st:'dead', fire: game.bullets.filter(x=>x.fire).length}; }")
    print(f'幽焰法师: 触发前={mg} -> 读条/发射后={mg2}（fire弹出现即技能生效）')

    # ---------- 5) 装备全链路：Boss掉落→拾取→背包→装备→属性+外观 ----------
    pg.goto(BASE + '?level=7&god=1'); pg.wait_for_timeout(900)
    pg.evaluate("() => { game.player.x = game.boss.x - 90; }")
    pg.wait_for_timeout(3200)
    pg.evaluate("() => { game.boss.phase=2; game.boss.hp=1; game.player.x=game.boss.x-22; game.player.y=game.boss.y+20; game.player.face=1; game.input.attackHit=1; }")
    pg.wait_for_timeout(600)
    drops = pg.evaluate("() => ({boss: game.boss.state, drops: (game.gearDrops||[]).map(d=>({slot:d.slot,r:d.r})), clear: game.state})")
    print('Boss 击杀掉落:', drops)
    shot(pg, 'v6_drops.png')
    if drops['drops']:
        pg.evaluate("() => { const d=game.gearDrops[0]; game.player.x=d.x-3; game.player.y=d.y-10; }")
        pg.wait_for_timeout(400)
        pick = pg.evaluate("() => ({pickups: JSON.stringify(game.pickups), left: game.gearDrops.length})")
        print('拾取事件:', pick)
        pg.wait_for_timeout(600)  # ui 消费入包
        inv = pg.evaluate("() => { const p=JSON.parse(localStorage.getItem('pq_progress')); return {inv: p.inv, shards: p.shards}; }")
        print('背包落盘:', inv)
        # 开背包穿装备
        pg.keyboard.press('KeyB'); pg.wait_for_timeout(400)
        shot(pg, 'v6_bag.png')
        pg.keyboard.press('Tab'); pg.keyboard.press('Enter')  # 焦点到背包格→穿着
        pg.wait_for_timeout(400)
        eq = pg.evaluate("() => ({equip: JSON.stringify(game.equip), maxHp: game.player.maxHp})")
        print('穿上后属性:', eq)
        shot(pg, 'v6_look.png')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)

    # ---------- 6) O 引导 ----------
    pg.goto(BASE + '?level=1'); pg.wait_for_timeout(800)
    pg.evaluate("() => { game.combo=8; game.comboT=2; }")
    pg.wait_for_timeout(500)
    shot(pg, 'v6_ohint.png')
    print('O引导横幅: 已截图 v6_ohint.png')

    b.close()

print('ERRORS:', len(errs))
for e in errs[:8]: print(' -', e[:200])
