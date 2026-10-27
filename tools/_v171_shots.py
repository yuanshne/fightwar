# -*- coding: utf-8 -*-
# _v171_shots.py —— v17.1 两件修复的实机目检（playwright + file://）
#   ① L6 门接触对称：从右侧贴门（玩家必经路线）能开门——修复前这步永远不开=死锁
#   ② L6 齿轮打碎：玩家点名的「轮子没交互」→ break 类，一挥碎 +1 金币
# 沿用 v17 的三条教训：JSON 快照非活引用 / 必须按 Enter 走真实流程 / 每阶段单 evaluate 自包含。
import pathlib
from playwright.sync_api import sync_playwright

BASE = 'file:///C:/Users/A/.zcode/workspace/draft-6e5b5889-432a-4c7b-aabe-13a594a464ac/pixel-quest/index.html'
OUT = pathlib.Path(__file__).parent.parent / 'testshots'
OUT.mkdir(exist_ok=True)
errors = []

with sync_playwright() as p:
    br = p.chromium.launch()
    pg = br.new_page(viewport={'width': 960, 'height': 600})
    pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: errors.append('console.error: ' + m.text) if m.type == 'error' else None)
    pg.goto(BASE, wait_until='load')
    pg.wait_for_timeout(700)
    for _ in range(3):
        pg.keyboard.press('Enter')
        pg.wait_for_timeout(300)

    # --- ① 门接触对称（L6 idx5）：从右贴门 + 向左推 → 整组开门 ---
    r = pg.evaluate("""() => new Promise(res => {
      loadLevel(5, false);
      game.paused=false; game.puzzleActive=false;
      game.level.enemies.length=0; game.bullets.length=0; game.hazards.length=0;
      if(game.boss) game.boss=null;
      const L=game.level, p=game.player;
      game.keys=1;                          // 拿钥匙路径由 reach 27/27 覆盖，这里直接给
      p.x = 26*16; p.y = 80 - p.h;          // 站甲板、左缘精确贴门右面（=碰撞解算落点）
      p.vx=0; p.vy=0; p.invT=0;
      const before = [L.tiles[3][25], L.tiles[4][25]];
      game.input.left = 1;                  // 向左推：先被门顶住 → 门接触扫描
      const t0 = performance.now();
      const iv = setInterval(() => {
        if ((L.tiles[3][25] === '.' && L.tiles[4][25] === '.') || performance.now() - t0 > 1500) {
          clearInterval(iv); game.input.left = 0;
          p.x = 23*16; p.y = 60; p.vx = 0; p.vy = 0;   // 挪开再拍：门框清晰入镜
          res({before, after: [L.tiles[3][25], L.tiles[4][25]], keys: game.keys,
               ms: Math.round(performance.now() - t0)});
        }
      }, 16);
    })""")
    print('① 门: %s -> %s, 钥匙余 %s, 耗时 %dms —— 预期 DD->..、钥匙-1'
          % (r['before'], r['after'], r['keys'], r['ms']))
    pg.wait_for_timeout(900)                 # 相机 lerp 追上门框区域再拍
    pg.screenshot(path=str(OUT / '_v171_l6_door_open.png'))

    # --- ② 齿轮打碎（L6 的 gear×1）：站旁挥击 → dead + 金币+1 ---
    r = pg.evaluate("""() => {
      loadLevel(5, false);
      game.paused=false; game.puzzleActive=false;
      game.level.enemies.length=0; game.bullets.length=0; game.hazards.length=0;
      const L=game.level, p=game.player;
      const gr = L.decorFx.find(d => d.type === 'gear');
      if (!gr) return {err: 'L6 无 gear'};
      const c0 = game.coins, cb0 = game.combo | 0;
      p.x = gr.x - 14; p.y = gr.y - p.h; p.face = 1; p.vx = 0; p.vy = 0;
      p.atkT = 0.12; p.atkSeq++;
      _engResolveAttack(L, p);
      return {gear: gr.type, dead: !!gr.dead, coins: game.coins, c0, combo: game.combo | 0, cb0,
              gx: gr.x, gy: gr.y, px: p.x, py: p.y};
    }""")
    if r.get('err'):
        print('②', r['err'])
    else:
        print('② 齿轮@(%d,%d): dead=%s 金币 %s->%s 连击 %s->%s —— 预期碎、+1、+1'
              % (r['gx'], r['gy'], r['dead'], r['c0'], r['coins'], r['cb0'], r['combo']))
        pg.wait_for_timeout(300)             # 碎屑粒子还在飘时拍
        pg.screenshot(path=str(OUT / '_v171_l6_gear_break.png'))

    br.close()

print('errors =', len(errors), errors[:3])
