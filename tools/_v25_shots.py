"""v25/v25.5 实机截图：四类盘面 + 两种新光柱/棘柱。仅本地验证用。"""
from playwright.sync_api import sync_playwright
import pathlib, sys

OUT = pathlib.Path(__file__).parent / '_shots'
OUT.mkdir(exist_ok=True)
BASE = 'http://localhost:8123/index.html'

def settle(page, ms=400):
    page.wait_for_timeout(ms)

def place(page, x, y, camx=None, camy=None):
    page.evaluate("""([x,y,camx,camy])=>{
      const p=game.player, L=game.level;
      p.x=x; p.y=y; p.vx=0; p.vy=0; p.dead=false; p.hp=5;
      if(camx!==null){ game.cam.x=camx; }
      if(camy!==null){ game.cam.y=camy; }
    }""", [x, y, camx, camy])

def shot(page, name):
    page.locator('#game').screenshot(path=str(OUT / (name + '.png')))
    print('saved', name)

with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True)
    page = b.new_page(viewport={'width': 960, 'height': 640})
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('console', lambda m: errs.append('console:' + m.text) if m.type == 'error' else None)

    # 1) L1 扫雷盘：站在盘前
    page.goto(BASE + '?level=01', wait_until='networkidle')
    settle(page, 900)
    place(page, 27 * 16 - 30, 12 * 16 - 14, 27 * 16 - 384 / 2, 0)
    settle(page, 500)
    shot(page, '01_mine_L1')

    # 攻击一格看翻开反馈
    page.keyboard.press('j')                     # 若默认攻击键不是 J 也无妨，下面直接调用运行时
    page.evaluate("""()=>{
      const L=game.level, m=L.minis.find(x=>x.type==='mine');
      const c=m.cells.find(c=>!c.mine && c.adj===0);
      _engMiniHit({x:c.cx,y:c.cy,w:c.w,h:c.h});
    }""")
    settle(page, 350)
    shot(page, '02_mine_open_L1')

    # 2) L1 地鼠盘：等冒头
    place(page, 95 * 16 - 24, 10 * 16 - 14, 95 * 16 - 384 / 2, 0)
    settle(page, 900)
    page.evaluate("()=>{const m=game.level.minis.find(x=>x.type==='mole'); m.t=0; m.hideT=0;}")
    settle(page, 500)
    shot(page, '03_mole_L1')

    # 3) L3 点灯盘
    page.goto(BASE + '?level=03', wait_until='networkidle')
    settle(page, 900)
    place(page, 116 * 16 - 30, 12 * 16 - 14)
    settle(page, 700)
    shot(page, '04_lights_L3')

    # 4) L12 编钟盘
    page.goto(BASE + '?level=12', wait_until='networkidle')
    settle(page, 900)
    page.evaluate("""()=>{const L=game.level; const m=L.minis.find(x=>x.type==='bells');
      const p=game.player; p.x=m.x-34; p.y=m.y-14; p.vx=0;p.vy=0;
      game.cam.x=Math.max(0,m.x-170); game.cam.y=Math.max(0,m.y-150);}""")
    settle(page, 700)
    shot(page, '05_bells_L12')

    # 5) L21 秤：天穹光柱（预警帧 + 命中帧）
    page.goto(BASE + '?level=21', wait_until='networkidle')
    settle(page, 900)
    page.evaluate("""()=>{
      const b=game.boss, p=game.player;
      b.state='idle'; b.t=0; b.next='column'; b.landX=p.x;
      b.hpTotal=b.maxHp; b.hp=b.bandMax; b.bandBreak=0; b.phase=1;
      p.x=b.x+90; p.y=b.y+b.h-p.h;
      game.cam.x=Math.max(0,b.x-120); game.cam.y=Math.max(0,b.y-120);
    }""")
    page.evaluate("()=>{const b=game.boss; b.next='column'; b.state='columnCast'; b.t=0; b.fireN=0;}")
    settle(page, 150)
    # 直接推演到刚落下光柱
    page.evaluate("()=>{for(let i=0;i<52;i++){ game.hitStop=0; updateWorld(1/60);} }")
    shot(page, '06_column_warn_L21')
    page.evaluate("()=>{for(let i=0;i<24;i++){ game.hitStop=0; updateWorld(1/60);} }")
    shot(page, '07_column_hit_L21')

    # 6) L7 星核晶棘（pillar tone）
    page.goto(BASE + '?level=07', wait_until='networkidle')
    settle(page, 900)
    page.evaluate("""()=>{
      const b=game.boss, p=game.player;
      b.state='idle'; b.t=0; b.next='pillar'; b.hpTotal=b.maxHp; b.hp=b.bandMax; b.bandBreak=0; b.phase=1;
      p.x=b.x+95; p.y=b.y+b.h-p.h;
      game.cam.x=Math.max(0,b.x-120); game.cam.y=Math.max(0,b.y-120);
      b.state='pillarCast'; b.t=0; b.fireN=0;
    }""")
    page.evaluate("()=>{for(let i=0;i<58;i++){ game.hitStop=0; updateWorld(1/60);} }")
    shot(page, '08_pillar_warn_L7')
    page.evaluate("()=>{for(let i=0;i<18;i++){ game.hitStop=0; updateWorld(1/60);} }")
    shot(page, '09_pillar_hit_L7')

    if errs:
        print('PAGE ERRORS:')
        for e in errs[:10]:
            print(' ', e)
    b.close()
