# -*- coding: utf-8 -*-
import pathlib, json
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = 'file:///' + str(ROOT / 'index.html').replace('\\', '/')

with sync_playwright() as pw:
    br = pw.chromium.launch(headless=True)
    pg = br.new_page(viewport={'width': 960, 'height': 640})
    errs = []
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.goto(BASE + '?level=7&hero=mage&god=1', wait_until='load')
    pg.wait_for_function("() => window.game && game.player && game.state === 'play'", timeout=15000)
    pg.wait_for_timeout(1200)
    pg.evaluate("""() => {
      const p = game.player;
      p.x = 60; p.y = 100; p.vx = 0; p.vy = 0; p.onGround = true; p.dead = 0; p.hp = 99;
      game.mana = 100; game.skills.u = 0; game.cdMul = 1;
    }""")
    pg.wait_for_timeout(100)
    print('player', pg.evaluate("() => ({x:game.player.x,y:game.player.y,w:game.player.w,h:game.player.h,top:(typeof _engSpriteTop==='function'?_engSpriteTop(game.player):null)})"))
    print('tiles around', pg.evaluate("() => { const p=game.player, L=game.level; const out=[]; for(let ty=Math.floor((p.y-30)/16); ty<=Math.floor((p.y+30)/16); ty++){let row=''; for(let tx=Math.floor((p.x-30)/16); tx<=Math.floor((p.x+30)/16); tx++){ row += (L.solid(tx,ty,game.switchState)?'#':'.'); } out.push(ty+':'+row);} return out; }"))
    pg.keyboard.press('u')
    pg.wait_for_timeout(30)
    shots = pg.evaluate("() => game.shots.map(s=>({x:+s.x.toFixed(2),y:+s.y.toFixed(2),vx:+s.vx.toFixed(1),vy:+s.vy.toFixed(1),life:+s.life.toFixed(3),kind:s.kind,seq:s.novaSeq}))")
    print('after 30ms:', json.dumps(shots, ensure_ascii=False))
    pg.wait_for_timeout(80)
    shots2 = pg.evaluate("() => game.shots.map(s=>({x:+s.x.toFixed(2),y:+s.y.toFixed(2),life:+s.life.toFixed(3)}))")
    print('after 110ms:', json.dumps(shots2, ensure_ascii=False), 'count=', len(shots2))
    pg.wait_for_timeout(300)
    print('after 410ms count=', pg.evaluate("() => game.shots.length"))
    print('errs', errs[:5])
    br.close()
