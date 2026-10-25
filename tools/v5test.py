# -*- coding: utf-8 -*-
# v5 特性实测：二段跳/打击感(伤害数字+击退+连击暴击)/大招演出/新机关(风柱/传送门/骑士)
from playwright.sync_api import sync_playwright
import pathlib

BASE = 'file:///C:/Users/A/.zcode/workspace/draft-6e5b5889-432a-4c7b-aabe-13a594a464ac/pixel-quest/index.html'
OUT = pathlib.Path(__file__).parent.parent / 'testshots'
errs = []

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={'width': 1152, 'height': 680})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)

    # ---------- 1) 二段跳 ----------
    pg.goto(BASE + '?level=1'); pg.wait_for_timeout(900)
    pg.evaluate("() => { game.player.x = 100; }")
    pg.wait_for_timeout(300)
    pg.keyboard.down('ArrowUp'); pg.wait_for_timeout(60); pg.keyboard.up('ArrowUp')
    pg.wait_for_timeout(120)
    j1 = pg.evaluate("() => ({vy: Math.round(game.player.vy), air: game.player.airJumps, dj: game.player.djT||0})")
    pg.keyboard.down('ArrowUp'); pg.wait_for_timeout(60); pg.keyboard.up('ArrowUp')
    pg.wait_for_timeout(60)
    j2 = pg.evaluate("() => ({vy: Math.round(game.player.vy), air: game.player.airJumps, dj: +(game.player.djT||0).toFixed(2)})")
    pg.wait_for_timeout(1500)
    j3 = pg.evaluate("() => ({air: game.player.airJumps, g: game.player.onGround})")
    print(f'二段跳: 一跳 vy={j1["vy"]} air={j1["air"]} | 二跳 vy={j2["vy"]} air={j2["air"]} 空翻djT={j2["dj"]} | 落地重置 air={j3["air"]}')

    # ---------- 2) 打击感：J 攻击 → 血量/击退/伤害数字 ----------
    pg.evaluate("() => { const e=game.level.enemies.find(x=>x.type==='slime'&&!x.dead); e.x=game.player.x+14; e.y=game.player.y; game.player.face=1; }")
    pg.wait_for_timeout(200)
    before = pg.evaluate("() => { const e=game.level.enemies.find(x=>x.type==='slime'); return {hp:e.hp, x:Math.round(e.x), fl:game.floats.length}; }")
    pg.keyboard.press('KeyJ'); pg.wait_for_timeout(350)
    after = pg.evaluate("() => { const e=game.level.enemies.find(x=>x.type==='slime'); return {hp:e.hp, x:Math.round(e.x), fl:game.floats.length, txt:game.floats.map(f=>f.txt).slice(0,3)}; }")
    print(f'打击感: 史莱姆 hp {before["hp"]}->{after["hp"]} 击退 x {before["x"]}->{after["x"]} 伤害浮字={after["txt"]}')
    pg.screenshot(path=str(OUT / 'v5_dmg.png'))

    # ---------- 3) 大招演出 ----------
    pg.evaluate("() => { game.combo=8; game.comboT=2; game.input.skillOHit=1; }")
    pg.wait_for_timeout(300)
    u1 = pg.evaluate("() => ({ult: game.ult ? Math.round(game.ult.t*100)/100 : null, dark: true})")
    pg.wait_for_timeout(1100)
    u2 = pg.evaluate("() => ({ult: game.ult, combo: game.combo})")
    print(f'大招: 冻结演出 t={u1["ult"]}s -> 结束 ult={u2["ult"]} combo清零={u2["combo"]}')
    pg.screenshot(path=str(OUT / 'v5_ult.png'))

    # ---------- 4) L8 风柱 ----------
    pg.goto(BASE + '?level=8'); pg.wait_for_timeout(800)
    w = pg.evaluate("() => { let t=null; for(let y=0;y<game.level.h;y++)for(let x=0;x<game.level.w;x++)if(game.level.tiles[y][x]==='w'){t={x,y};break} return t; }")
    print('L8 风柱位置:', w)
    pg.evaluate(f"() => {{ game.player.x={w['x']}*16+3; game.player.y=({w['y']}+2)*16; game.player.vy=0; }}")
    pg.wait_for_timeout(500)
    rise = pg.evaluate("() => ({vy: Math.round(game.player.vy), y: Math.round(game.player.y)})")
    print(f'风柱上升: vy={rise["vy"]} (应显著为负)')

    # ---------- 5) L9 骑士 + L10 传送门 ----------
    pg.goto(BASE + '?level=9'); pg.wait_for_timeout(800)
    kn = pg.evaluate("() => game.level.enemies.filter(e=>e.type==='knight').length")
    print('L9 骑士数量:', kn)
    pg.goto(BASE + '?level=10'); pg.wait_for_timeout(800)
    po = pg.evaluate("() => game.level.portals.length")
    pg.evaluate("() => { const p0=game.level.portals[0]; game.player.x=p0.x+2; game.player.y=p0.y+4; }")
    pg.wait_for_timeout(700)
    tp = pg.evaluate("() => ({x: Math.round(game.player.x), y: Math.round(game.player.y)})")
    p1 = pg.evaluate("() => game.level.portals.map(p=>({x:p.x,y:p.y}))")
    print(f'L10 传送门 {po} 个 {p1} -> 传送到 {tp}')

    # ---------- 6) 封面截图 ----------
    pg.goto(BASE); pg.wait_for_timeout(2500)
    pg.screenshot(path=str(OUT / 'v5_cover.png'))
    pg.keyboard.press('Enter'); pg.wait_for_timeout(600)
    pg.screenshot(path=str(OUT / 'v5_select.png'))
    b.close()

print('ERRORS:', len(errs))
for e in errs[:8]: print(' -', e[:200])
