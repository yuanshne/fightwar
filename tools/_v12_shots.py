# -*- coding: utf-8 -*-
# _v12_shots.py —— v12 新交互类型目检截图（L19 牛魔王，file:// + playwright）
#   ?level=19&god=1 进火焰山；玩家钉在 Boss 左侧，用 setInterval 钉住 state/next/hazards，
#   逐招截图：撞墙反弹 / 抓取红爪 / 劈地波 / 火柱预警 / 火柱升起 / 蓄力结界 / 核心护盾。
#   断言 pageerror 与 console.error 为空。
import pathlib
from playwright.sync_api import sync_playwright

BASE = 'file:///C:/Users/A/.zcode/workspace/draft-6e5b5889-432a-4c7b-aabe-13a594a464ac/pixel-quest/index.html'
OUT = pathlib.Path(__file__).parent.parent / 'testshots'
OUT.mkdir(exist_ok=True)
errors = []

SETUP = """
(s) => {
  const p = game.player, b = game.boss;
  const gy = p.y + p.h, cx = p.x + p.w / 2, bcx = b.x + b.w / 2;
  const hz = [];
  if (s.kind === 'pillar') {
    hz.push({ kind:'pillar', x:cx-40, y:gy, w:14, h:0,  mh:40, warnT:0.55, t:0, life:2.5, dmg:1 });
    hz.push({ kind:'pillar', x:cx+6,  y:gy, w:14, h:0,  mh:40, warnT:0.30, t:0, life:2.5, dmg:1 });
    hz.push({ kind:'pillar', x:cx+52, y:gy, w:14, h:0,  mh:40, warnT:0.10, t:0, life:2.5, dmg:1 });
  } else if (s.kind === 'pillarHot') {
    hz.push({ kind:'pillar', x:cx-40, y:gy, w:14, h:40, mh:40, warnT:0, t:0.8, life:2.5, dmg:1 });
    hz.push({ kind:'pillar', x:cx+6,  y:gy, w:14, h:26, mh:40, warnT:0, t:0.5, life:2.5, dmg:1 });
    hz.push({ kind:'pillar', x:cx+52, y:gy, w:14, h:40, mh:40, warnT:0, t:0.9, life:2.5, dmg:1 });
  } else if (s.kind === 'ward') {
    const pc2 = b.x - 92 + 5;                     // 玩家将被摆到 b.x-92（本脚本固定位）
    hz.push({ kind:'ward', x:pc2-120, y:gy, r:22, t:0.6, life:2.2 });
    hz.push({ kind:'ward', x:pc2+120, y:gy, r:22, t:0.6, life:2.2 });
  } else if (s.kind === 'core') {
    hz.push({ kind:'core', x:bcx-150-9, y:b.y+20, w:18, h:18, r:9, hp:3, maxHp:3, t:1.2, life:10, flashT:0 });
    hz.push({ kind:'core', x:bcx+150-9, y:b.y+20, w:18, h:18, r:9, hp:1, maxHp:3, t:1.2, life:10, flashT:0 });
  } else if (s.kind === 'quake') {
    // 波由引擎发出，这里只补一条在途的 tall 波做目检
    game.waves = [{ x:cx+30, y:gy-26, w:14, h:26, vx:0, life:9, tall:true }];
  }
  window.__v12 = { state:s.state, next:s.next, t:s.t, chargeN:s.chargeN||0, chargeDir:s.chargeDir||1,
                   quellDmg:s.quellDmg||0, quellDur:s.quellDur||0, fireN:s.fireN||0,
                   leechOn:s.leechOn||0, coreOn:!!s.coreOn, hazards:hz };
  if (!window.__v12noHurt && typeof _engHurtPlayer === 'function') {
    window.__v12noHurt = 1; window._engHurtPlayer = _engHurtPlayer; _engHurtPlayer = function () {};
  }
  if (p) { p.x = b.x - 92; p.y = b.y + 12; p.vx = 0; p.vy = 0; p.pullV = 0;
           if (p.hp < 1) p.hp = p.maxHp || 5; p.dead = false; p.deadT = 0; }
  if (!window.__v12iv) window.__v12iv = setInterval(() => {
    const b2 = game.boss; if (!b2) return;
    const v = window.__v12;
    const p2 = game.player;
    if (p2) { p2.hp = p2.maxHp || 5; p2.dead = false; p2.deadT = 0; p2.invT = 0; }
    if (v.state) { b2.state = v.state; b2.t = v.t; b2.hidden = false; }
    if (v.next) b2.next = v.next;
    b2.chargeN = v.chargeN; b2.chargeDir = v.chargeDir;
    b2.quellDmg = v.quellDmg; b2.quellDur = v.quellDur; b2.fireN = v.fireN;
    b2.leechOn = v.leechOn; b2.coreOn = v.coreOn;
    game.hazards = v.hazards.map(o => Object.assign({}, o));
  }, 16);
  return { state: b.state, next: b.next, hz: hz.length };
}
"""


def shot(pg, name):
    pg.locator('#game').screenshot(path=str(OUT / name))
    print('  截图 ' + name)


with sync_playwright() as pw:
    br = pw.chromium.launch()
    pg = br.new_page(viewport={'width': 1280, 'height': 800})
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append('PAGEERROR: ' + str(e)))

    pg.goto(BASE + '?level=19&god=1')
    pg.wait_for_timeout(1200)
    pg.evaluate("""() => { if (game.boss && game.player) {
        game.player.x = game.boss.x - 92; game.player.y = game.boss.y + 12;
        game.player.vx = 0; game.player.vy = 0; } }""")
    pg.wait_for_timeout(2400)
    print('Boss:', pg.evaluate("() => ({kind:game.boss.kind, maxHp:game.boss.maxHp, state:game.boss.state})"))

    SCENES = [
        ('_v12_charge.png',  {'state': 'chargeRun', 'next': 'charge', 't': 0.5, 'chargeN': 1, 'chargeDir': -1}),
        ('_v12_grab.png',    {'state': 'windup', 'next': 'grab', 't': 0.50}),
        ('_v12_quake.png',   {'state': 'windup', 'next': 'quake', 't': 0.45, 'kind': 'quake'}),
        ('_v12_pillar_warn.png', {'state': 'pillarCast', 'next': 'pillar', 't': 0.6, 'kind': 'pillar'}),
        ('_v12_pillar_hot.png',  {'state': 'pillarCast', 'next': 'pillar', 't': 0.9, 'kind': 'pillarHot'}),
        ('_v12_quell.png',   {'state': 'quellCast', 'next': 'quell', 't': 0.9, 'quellDmg': 7,
                              'quellDur': 1.2, 'fireN': 1, 'kind': 'ward'}),
        ('_v12_core.png',    {'state': 'coreCast', 'next': 'core', 't': 1.4, 'coreOn': True, 'fireN': 1, 'kind': 'core'}),
        ('_v12_leech.png',   {'state': 'idle', 'next': '', 't': 0.1, 'leechOn': 1}),
    ]
    for name, sc in SCENES:
        pg.evaluate(SETUP, sc)
        pg.wait_for_timeout(450)
        info = pg.evaluate("() => ({state:game.boss.state, next:game.boss.next, hz:(game.hazards||[]).length,"
                           " chargeN:game.boss.chargeN, coreOn:game.boss.coreOn})")
        print('  场景 ' + name + ' → ' + str(info))
        shot(pg, name)

    br.close()

print('CONSOLE_ERRORS:', len(errors))
for e in errors[:8]:
    print('  ' + e)
