# -*- coding: utf-8 -*-
# v3 Boss战全流程实测：激活/攻击/三技能/HP/击杀/演出
from playwright.sync_api import sync_playwright
import pathlib, json

BASE = 'file:///C:/Users/A/.zcode/workspace/draft-6e5b5889-432a-4c7b-aabe-13a594a464ac/pixel-quest/index.html'
OUT = pathlib.Path(__file__).parent.parent / 'testshots'
OUT.mkdir(exist_ok=True)
errs = []

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={'width': 1152, 'height': 680})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)

    pg.goto(BASE + '?level=7&god=1'); pg.wait_for_timeout(1000)
    info = pg.evaluate("() => ({name: game.level.meta.name, boss: !!game.boss, st: game.boss&&game.boss.state, skills: JSON.stringify(game.skills), hpFields: Object.keys(game).filter(k=>/hp|heart|life/i.test(k))})")
    print('L7 装载:', info)
    pg.screenshot(path=str(OUT / 'boss1_arena.png'))

    # 1) 激活：传送到 Boss 附近等登场演出结束
    pg.evaluate("() => { game.player.x = game.boss.x - 90; game.player.y = game.boss.y; }")
    pg.wait_for_timeout(3500)
    st = pg.evaluate("() => ({boss: game.boss.state, hp: game.boss.hp, phase: game.boss.phase})")
    print('靠近激活:', st)
    pg.screenshot(path=str(OUT / 'boss2_active.png'))

    # 2) 普通攻击 J：贴脸砍 → hp 下降
    before = pg.evaluate("() => game.boss.hp")
    pg.evaluate("() => { game.player.x = game.boss.x - 16; game.player.y = game.boss.y + 20; game.input.attackHit = 1; }")
    pg.wait_for_timeout(500)
    after = pg.evaluate("() => game.boss.hp")
    print(f'J 攻击: hp {before} -> {after} (期望下降1+连击加成)')

    # 3) 星陨 U：等冷却就绪 → 释放 → hp 大降
    pg.evaluate("() => { game.skills.u = 0; game.input.skillUHit = 1; }")
    pg.wait_for_timeout(1200)
    st2 = pg.evaluate("() => ({hp: game.boss.hp, cdu: game.skills.u})")
    print('星陨 U:', st2)
    pg.screenshot(path=str(OUT / 'boss3_meteor.png'))

    # 4) 护盾 I：开启后受伤不掉血（对比）
    hp_info = pg.evaluate("() => ({p_hp: game.player.hp, p_max: game.player.maxHp, inv: game.player.invT||game.player.invuln||0})")
    print('玩家HP字段:', hp_info)
    pg.evaluate("() => { game.skills.i = 0; game.input.skillIHit = 1; }")
    pg.wait_for_timeout(400)
    shield = pg.evaluate("() => game.player.shieldT || game.skills.i")
    print('护盾 I 释放:', shield)

    # 5) 大招 O：combo 不足应无效；combo=8 后应释放
    pg.evaluate("() => { game.input.skillOHit = 1; }")
    pg.wait_for_timeout(300)
    no_ult = pg.evaluate("() => game.boss.hp")
    pg.evaluate("() => { game.combo = 8; game.comboT = 2; game.input.skillOHit = 1; }")
    pg.wait_for_timeout(1200)
    ult = pg.evaluate("() => game.boss.hp")
    print(f'大招 O: 无combo时 hp={no_ult} -> combo8释放后 hp={ult} (期望大降)')

    # 6) 击杀：先入 phase2 避开狂暴阈值拦截 → hp 归零 → 死亡演出 → 通关
    pg.evaluate("() => { game.boss.phase = 2; game.boss.hp = 2; game.player.x = game.boss.x - 16; game.player.y = game.boss.y + 20; game.player.face = 1; game.input.attackHit = 1; }")
    pg.wait_for_timeout(2500)
    end = pg.evaluate("() => ({boss: game.boss.state, game: game.state, clearT: Math.round(game.clearT||0)})")
    print('击杀结局:', end)
    pg.screenshot(path=str(OUT / 'boss4_end.png'))
    b.close()

print('ERRORS:', len(errs))
for e in errs[:8]: print(' -', e[:200])
