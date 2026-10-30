# -*- coding: utf-8 -*-
# _v20_shots.py —— 地图二（v20）实机冒烟 + 目检截图（playwright + file://）
#   ① 选关屏四章布局（压缩档：章头 10px、卡 46×30、行距 44）——4 行必须都进 224 画布
#   ② L20~L24 逐关：进关拍本体，再逐招强制 windup 拍前摇特效（ui 侧新加的 15 个 case）
#   ③ 五种新场地实体：laser / weight / hammer / crawler / egg / web 一次铺满拍一张
# 说明：ui.js 是 IIFE，startLevel/uiState 在页面外拿不到；入关一律走 ?level=NN（正式调试入口），
#      选关屏走「标题按 Enter」。判定只看 pageerror / console.error 是否为 0。
import pathlib
from playwright.sync_api import sync_playwright

BASE = ('file:///C:/Users/A/.zcode/workspace/draft-6e5b5889-432a-4c7b-aabe-13a594a464ac'
        '/pixel-quest/index.html')
OUT = pathlib.Path(__file__).parent.parent / 'testshots'
OUT.mkdir(exist_ok=True)
errors = []

# 每关的招牌三招（与 BAL.bossN 的池一致），用于逐个拍前摇
SIG = {20: ['flare', 'sear', 'lash'], 21: ['weight', 'swap', 'beam'], 22: ['spawn', 'web', 'swarm'],
       23: ['inhale', 'roar', 'bite'], 24: ['pendulum', 'chime', 'hammer']}

with sync_playwright() as p:
    br = p.chromium.launch()
    pg = br.new_page(viewport={'width': 960, 'height': 600})
    pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: errors.append('console.error: ' + m.text) if m.type == 'error' else None)
    pg.goto(BASE, wait_until='load')
    pg.wait_for_timeout(900)

    # ① 选关屏（四章）：标题按 Enter 进选关，再按 ↓ 三次把光标移到第四章
    pg.keyboard.press('Enter')
    pg.wait_for_timeout(600)
    pg.screenshot(path=str(OUT / '_v20_select.png'))
    for _ in range(3):
        pg.keyboard.press('ArrowDown')
        pg.wait_for_timeout(120)
    pg.wait_for_timeout(300)
    pg.screenshot(path=str(OUT / '_v20_select_ch4.png'))

    # ② 逐关
    for lv, moves in SIG.items():
        pg.goto(BASE + '?level=%d' % lv, wait_until='load')
        pg.wait_for_timeout(900)
        r = pg.evaluate("""() => {
          game.state='play'; game.paused=false; game.puzzleActive=false; game.hitStop=0;
          game.level.enemies.length=0; game.bullets.length=0; game.waves.length=0; game.hazards.length=0;
          const b=game.boss, p=game.player;
          b.state='idle'; b.t=0; b.hpTotal=b.maxHp; b.hp=b.bandMax; b.bandBreak=0; b.phase=1;
          // 相机推到 Boss 身上（render 会向玩家 lerp，所以把人一起挪过去），否则拍到的是空场
          p.x = b.x - 70; p.y = b.y + b.h - p.h; p.invT=9e9;
          game.cam.x = Math.max(0, b.x + b.w/2 - 192);
          return {kind:b.kind, name:game.level.meta.name};
        }""")
        pg.wait_for_timeout(500)
        pg.screenshot(path=str(OUT / ('_v20_boss%d.png' % r['kind'])))
        print('  L%d boss kind=%d %s' % (lv, r['kind'], r['name']))

        # 逐招前摇：摆到 windup 中段（t=0.35s），让特效吃满 k
        for mv in moves:
            pg.evaluate("""(mv) => {
              const b=game.boss, p=game.player;
              b.next=mv; b.state='windup'; b.t=0.35; b.fireN=0;
              game.hitStop=0; game.paused=false;
              b.face = (p.x+p.w/2) < (b.x+b.w/2) ? -1 : 1;
              if(mv==='flare') game.heat=78;
              if(mv==='spawn'||mv==='web') game.hazards.length=0;
            }""", mv)
            pg.wait_for_timeout(180)
            pg.screenshot(path=str(OUT / ('_v20_fx_%s.png' % mv)))

    # ③ 五种场地实体一次铺满（L22 孵化之间：石板底最接近实际战斗背景）
    pg.goto(BASE + '?level=22', wait_until='load')
    pg.wait_for_timeout(900)
    pg.evaluate("""() => {
      game.state='play'; game.paused=false; game.puzzleActive=false; game.hitStop=0;
      game.level.enemies.length=0; game.bullets.length=0; game.waves.length=0; game.hazards.length=0;
      const b=game.boss, p=game.player;
      b.state='stagger'; b.staggerDur=99; b.t=0;
      p.invT=9e9;
      const gy = b.y + b.h;
      game.hazards.push({kind:'laser', x:p.x+10,  y:gy-96, w:300, h:12, t:0.2,  dur:9, dmg:1, hitCd:0, dir:0, beam:true});
      game.hazards.push({kind:'laser', x:p.x+10,  y:gy-46, w:220, h:10, t:0.15, dur:9, dmg:1, hitCd:0, dir:1});
      game.hazards.push({kind:'weight', x:p.x+56, y:-20, vy:0, r:12, dmg:1, warn:0.7, warnT:9, t:0, fall:false});
      game.hazards.push({kind:'hammer', x:p.x+96, y:gy-72, vy:0, r:20, dmg:2, warn:0.7, warnT:0, t:0, fall:true, splash:90});
      game.hazards.push({kind:'crawler', x:p.x+36, y:gy-8, w:10, h:8, vx:130, dmg:1, life:9, t:0.4});
      game.hazards.push({kind:'egg', x:p.x+124, y:gy-16, w:16, h:16, t:1.1, stage:0, hp:2, maxHp:2, stageT:3, flashT:0, hitCd:0});
      game.hazards.push({kind:'egg', x:p.x+146, y:gy-16, w:16, h:16, t:0.6, stage:1, hp:3, maxHp:3, stageT:3, flashT:0, hitCd:0});
      game.hazards.push({kind:'egg', x:p.x+170, y:gy-16, w:16, h:16, t:0.2, stage:2, hp:5, maxHp:5, stageT:3, flashT:0, hitCd:0});
      game.hazards.push({kind:'web', x:p.x+196, y:gy-12, w:64, h:12, life:9, slow:0.4, noJump:true, t:0.2});
      game.cam.x = Math.max(0, p.x-40);
    }""")
    pg.wait_for_timeout(320)
    pg.screenshot(path=str(OUT / '_v20_hz.png'))
    br.close()

print('errors =', len(errors), errors[:5])
raise SystemExit(1 if errors else 0)
