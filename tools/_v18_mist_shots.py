# -*- coding: utf-8 -*-
# _v18_mist_shots.py —— v18 水雾减速实机验证（playwright + file://）
#   L13 蛟龙关：塞一团参数表同款雾，采样 雾外基准 / 雾内穿行 / 出雾恢复 三段实时 vx，
#   附雾中实机截图。教训沿用：真实按键驱动（game.input 会被 ui 层覆写）/ 相机 lerp 等待。
import pathlib
from playwright.sync_api import sync_playwright

BASE = 'file:///C:/Users/A/.zcode/workspace/draft-6e5b5889-432a-4c7b-aabe-13a594a464ac/pixel-quest/index.html'
OUT = pathlib.Path(__file__).parent.parent / 'testshots'
OUT.mkdir(exist_ok=True)
errors = []

SAMPLE = "() => { const p=game.player; return [Math.round(p.x), p.mistT>0?1:0]; }"

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

    # --- 准备：L13(idx12) 蛟龙关，清场塞雾（参数表同款，life 拉长给采样留时间） ---
    r = pg.evaluate("""() => {
      loadLevel(12, false);
      game.paused=false; game.puzzleActive=false;
      game.level.enemies.length=0; game.bullets.length=0; game.hazards.length=0;
      if(game.boss) game.boss=null;
      const L=game.level, p=game.player;
      p.x = 200; p.vx = 0; p.vy = 0; p.invT = 9e9;
      const MX = p.x + 240;
      game.hazards.push({ kind:'mist', x: MX-28, y: p.y + p.h, w:56, h:96, t:0,
                          life:8.0, tickT:0, dmg:0, slow:0.5 });
      return {px: p.x, py: p.y, mistX: MX-28, mistR: MX+28};
    }""")
    print('准备: 玩家@(%d,%d) 雾带[%d,%d]' % (r['px'], r['py'], r['mistX'], r['mistR']))
    mistL, mistR = r['mistX'], r['mistR']

    # --- 实验 A：雾外基准（先无雾跑 0.5s）——重进关卡再测，保证 A/B 同起点 ---
    # （A 与 B 共用一次进关：先采样雾前段 [200, mistL-10]，本身就是「雾外基准」）
    # --- 实验 B：从 200 一路向右穿过雾带，每 25ms 采样 ---
    pg.keyboard.down('ArrowRight')
    xs = []
    for _ in range(160):                     # 最长 4s
        xs.append(pg.evaluate(SAMPLE))
        pg.wait_for_timeout(25)
        if xs[-1][0] >= mistR + 40:
            break
    pg.keyboard.up('ArrowRight')

    # 分段速度：雾外前段 / 雾内 / 出雾后段（px/s，按采样间隔 25ms 折算）
    def seg(a, b):
        pts = xs[a:b]
        if len(pts) < 2:
            return None
        return (pts[-1][0] - pts[0][0]) / (len(pts) - 1) / 0.025
    inIdx = [i for i, s in enumerate(xs) if s[1]]
    if inIdx:
        i0, i1 = inIdx[0], inIdx[-1]
        vB = seg(0, i0) if i0 > 1 else None
        vI = seg(i0, i1 + 1)
        vA = seg(i1 + 1, len(xs)) if len(xs) - i1 > 3 else None
        print('B 穿雾: 雾内采样 %d 帧（i0=%d i1=%d 总 %d）' % (i1 - i0 + 1, i0, i1, len(xs)))
        if vB: print('   雾外前段 vx≈%.0f px/s（预期≈120）' % vB)
        print('   雾内     vx≈%.0f px/s（预期≈60）' % vI)
        if vA: print('   出雾后   vx≈%.0f px/s（预期≈120）' % vA)
    else:
        print('B: 未检测到雾内接触标记（mistT 全程 0）——雾没碰到玩家？')
    # 玩家已停在雾带后方，直接拍实机截图
    pg.wait_for_timeout(200)
    pg.screenshot(path=str(OUT / '_v18_l13_mist_slow.png'))

    br.close()

print('errors =', len(errors), errors[:3])
