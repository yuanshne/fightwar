# -*- coding: utf-8 -*-
# _v16_shots.py —— v16 圣像审判（totem）实机目检
#   为什么要拍：v13 的教训是「断言全绿 ≠ 画面对」。totem 的可读性全靠三个元素同屏——
#   血点(还有几刀)、引信条(什么时候炸)、半径虚线(跑多远算安全)，必须肉眼确认都看得见。
#   手法：让引擎自己 spawn（不走桩，避免桩和真实字段不一致），spawn 完把 updateWorld 换成空函数冻住引信，
#   然后手工改 e.t 拍三个阶段：刚出 / 过半 / 临爆（<1s 才出红圈）。
import pathlib, sys
from playwright.sync_api import sync_playwright

BASE = 'file:///C:/Users/A/.zcode/workspace/draft-6e5b5889-432a-4c7b-aabe-13a594a464ac/pixel-quest/index.html?level=18&god=1'
OUT = pathlib.Path(__file__).parent.parent / 'testshots'
OUT.mkdir(exist_ok=True)
errors = []

FORCE = """
() => {
  // L18 首发是 boss4，圣裁者是第二棒 —— 用引擎自己的 _engMkBoss 换人（R4：不自己造 Boss）
  const o = game.boss, py = o.y + o.h - 16;
  const nb = _engMkBoss(o.x + o.w / 2, py, 5);
  nb.state = 'idle'; nb.t = 0; nb.phase = 1;
  nb.hpTotal = nb.maxHp; nb.hp = nb.bandMax; nb.bandBreak = 0;
  game.boss = nb;
  game.player.x = nb.x - 70; game.player.y = nb.y + nb.h - game.player.h;
  game.player.vx = 0; game.player.vy = 0;
  // 直接进 totemCast 首帧生成
  nb.next = 'totem'; nb.state = 'windup'; nb.t = 0; nb.fireN = 0;
  return { kind: nb.kind, state: nb.state };
}
"""

FREEZE = """
(t) => {
  // 冻住世界：引信不再自己走，改由外部指定。
  window.updateWorld = function () {};
  const tot = (game.hazards || []).filter(h => h.kind === 'totem');
  tot.forEach((e, i) => { e.t = t + i * 0.05; e.flashT = 0; });
  return tot.map(e => ({ x: Math.round(e.x), y: Math.round(e.y), w: e.w, h: e.h, hp: e.hp, maxHp: e.maxHp,
                         t: +e.t.toFixed(2), life: e.life, r: e.r }));
}
"""

with sync_playwright() as pw:
    br = pw.chromium.launch()
    pg = br.new_page(viewport={'width': 1280, 'height': 800})
    pg.on('console', lambda m: errors.append('console.error: ' + m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append('PAGEERROR: ' + str(e)))
    pg.goto(BASE)
    pg.wait_for_timeout(1400)
    print('换人:', pg.evaluate(FORCE))
    pg.wait_for_timeout(1100)          # 让它真的 spawn（引擎前摇 0.7s）

    n = pg.evaluate("() => (game.hazards||[]).filter(h=>h.kind==='totem').length")
    print('spawn 后 totem 数量:', n)
    if n != 2:
        print('!! 生成数量不对，先把状态打出来')
        print(pg.evaluate("() => ({boss:game.boss.state, hz:(game.hazards||[]).map(h=>h.kind)})"))
        sys.exit(1)

    for t, name in [(0.15, '_v16_totem_fresh.png'), (2.2, '_v16_totem_half.png'), (3.45, '_v16_totem_almost.png')]:
        info = pg.evaluate(FREEZE, t)
        pg.wait_for_timeout(220)
        # 只截两根柱子附近（整屏 1280 宽会把 144px 间距摊成两根相隔 480px，一根出框）；
        # 换算用画布 CSS 缩放：屏幕 = (世界 - cam) × scale + 画布原点。
        box = pg.evaluate("""() => {
          const c = document.getElementById('game'), r = c.getBoundingClientRect();
          const s = r.width / 384, cam = game.cam || {x:0,y:0};
          const ts = (game.hazards||[]).filter(h=>h.kind==='totem');
          const xs = ts.map(h => r.left + (h.x + h.w/2 - cam.x) * s);
          const ys = ts.map(h => r.top  + (h.y - h.h - cam.y) * s);
          return { left: Math.min(...xs) - 90, top: Math.min(...ys) - 70,
                   right: Math.max(...xs) + 90, bottom: Math.max(...ys) + 130, scale: s };
        }""")
        clip = {'x': max(0, box['left']), 'y': max(0, box['top']),
                'width': min(1280, box['right']) - max(0, box['left']),
                'height': min(800, box['bottom']) - max(0, box['top'])}
        pg.screenshot(path=str(OUT / name), clip=clip)
        print('  截图 %-24s %s' % (name, info))
        print('     clip=%s scale=%.2f' % ({k: round(v) for k, v in clip.items()}, box['scale']))
    br.close()

print('CONSOLE_ERRORS:', len(errors))
for e in errors[:6]:
    print('  ' + e)
