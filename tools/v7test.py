# -*- coding: utf-8 -*-
# v7 专项实测：双新Boss/精英必掉/隐藏房/水流/章节选关/黑暗层
from playwright.sync_api import sync_playwright
import pathlib

BASE = 'file:///C:/Users/A/.zcode/workspace/draft-6e5b5889-432a-4c7b-aabe-13a594a464ac/pixel-quest/index.html'
OUT = pathlib.Path(__file__).parent.parent / 'testshots'
errs = []

def wait(pg, ms): pg.wait_for_timeout(ms)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={'width': 1152, 'height': 680})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)

    # 1) L13 蛟龙 boss2：激活+承伤+掉落
    pg.goto(BASE + '?level=13&god=1'); wait(pg, 900)
    k = pg.evaluate("() => ({kind: game.boss.kind||game.boss.phase, hp: game.boss.hp, maxHp: game.boss.maxHp, w: game.boss.w})")
    pg.evaluate("() => { game.player.x = game.boss.x - 70; }"); wait(pg, 3200)
    act = pg.evaluate("() => ({st: game.boss.state})")
    pg.evaluate("() => { game.boss.hp = 2; game.player.x = game.boss.x - 20; game.player.y = game.boss.y + 20; game.player.face = 1; game.input.attackHit = 1; }")
    wait(pg, 2600)
    end = pg.evaluate("() => ({st: game.boss.state, drops: (game.gearDrops||[]).length, g: game.state})")
    print(f'L13 蛟龙: 初始={k} 激活={act} 击杀={end}')
    pg.screenshot(path=str(OUT / 'v7_boss2.png'))

    # 2) L16 判官 boss3：blink 隐身抽查
    pg.goto(BASE + '?level=16&god=1'); wait(pg, 900)
    j = pg.evaluate("() => ({maxHp: game.boss.maxHp})")
    pg.evaluate("() => { game.player.x = game.boss.x - 70; }")
    seen = {}
    for i in range(10):
        wait(pg, 400)
        st = pg.evaluate("() => game.boss.state")
        seen[st] = seen.get(st, 0) + 1
    print(f'L16 判官: maxHp={j["maxHp"]} 状态分布={seen}（含 blink/scythe 即新招生效）')
    pg.screenshot(path=str(OUT / 'v7_boss3.png'))

    # 3) L12 精英枪虾王：击杀必掉装备
    pg.goto(BASE + '?level=12&god=1'); wait(pg, 900)
    el = pg.evaluate("() => { const e=game.level.enemies.find(x=>x.elite); return e? {type:e.type,hp:e.hp,elite:true}: null; }")
    if el:
        pg.evaluate("() => { const e=game.level.enemies.find(x=>x.elite); e.hp=1; game.player.x=e.x-14; game.player.y=e.y; game.player.face=1; game.input.attackHit=1; }")
        wait(pg, 700)
        drop = pg.evaluate("() => ({drops: (game.gearDrops||[]).map(d=>({slot:d.slot,r:d.r})), floats: game.floats.filter(f=>String(f.txt).includes('ELITE')).length})")
        print(f'L12 精英: {el} 击杀掉落={drop}')

    # 4) L11 隐藏房：G 砖打碎 + 宝箱
    pg.goto(BASE + '?level=11&god=1'); wait(pg, 900)
    g = pg.evaluate("() => { let t=null; for(let y=0;y<game.level.h&&!t;y++)for(let x=0;x<game.level.w;x++)if(game.level.tiles[y][x]==='G'){t={x,y};break} return t; }")
    if g:
        r = pg.evaluate(f"""() => new Promise(res=>{{
          const t={{x:{g['x']},y:{g['y']}}};
          game.player.x=t.x*16-14; game.player.y=t.y*16; game.player.face=1;
          game.input.attackHit=1;
          let opened=false, coins0=game.coins;
          setTimeout(()=>{{
            const broken = game.level.tiles[t.y][t.x]==='.';
            const chests=game.level.chests||[];
            res({{broken, chests: chests.length, coins0, coins: game.coins}});
          }}, 600);
        }})""")
        print(f'L11 隐藏房: G位置={g} 攻击后={r}')

    # 5) 水流：L11 '{' 推力
    pg.goto(BASE + '?level=11&god=1'); wait(pg, 900)
    fw = pg.evaluate("""() => { let t=null; for(let y=0;y<game.level.h&&!t;y++)for(let x=0;x<game.level.w;x++){const c=game.level.tiles[y][x];if(c==='{'||c==='}'){t={x,y,c};break}} return t; }""")
    if fw:
        pg.evaluate(f"() => {{ const t={{x:{fw['x']},y:{fw['y']}}}; game.player.x=t.x*16+2; game.player.y=t.y*16; }}")
        wait(pg, 400)
        drift = pg.evaluate("() => Math.round(game.player.vx)")
        print(f'L11 水流({fw["c"]}@{fw["x"]},{fw["y"]}): 站入后vx={drift}（正值=向右推）')

    # 6) 章节选关 + 黑暗层截图
    pg.goto(BASE); wait(pg, 2200)
    pg.keyboard.press('Enter'); wait(pg, 700)
    pg.screenshot(path=str(OUT / 'v7_chapters.png'))
    pg.goto(BASE + '?level=14'); wait(pg, 1200)
    pg.screenshot(path=str(OUT / 'v7_nether.png'))
    pg.goto(BASE + '?level=11'); wait(pg, 1200)
    pg.screenshot(path=str(OUT / 'v7_sea.png'))
    b.close()

print('ERRORS:', len(errs))
for e in errs[:8]: print(' -', e[:200])
