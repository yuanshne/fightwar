# -*- coding: utf-8 -*-
# _v13_shots.py —— v13 五种新交互类型目检截图（playwright + file://）
#   mist（L13 蛟龙）/ mirror（L16 判官）/ push+parry（L18 双 Boss）/ bomb（L19 牛魔王）
#   手法沿用 _v12_shots.py：setInterval(16ms) 钉住 state/next/hazards + 屏蔽玩家受伤，
#   否则引擎每帧重放 spawn 分支，截出来的图会叠成一堆同心特效。
#   断言 pageerror 与 console.error 为空。
import pathlib
from playwright.sync_api import sync_playwright

BASE = 'file:///C:/Users/A/.zcode/workspace/draft-6e5b5889-432a-4c7b-aabe-13a594a464ac/pixel-quest/index.html'
OUT = pathlib.Path(__file__).parent.parent / 'testshots'
OUT.mkdir(exist_ok=True)
errors = []

SETUP = """
(s) => {
  // 允许把 L18 的首发 boss4 换成 boss5（圣裁者的招要在它自己身上截）
  if (s.forceKind && game.boss && (game.boss.kind|0) !== s.forceKind) {
    const o = game.boss, py = o.y + o.h - 16;
    const nb = _engMkBoss(o.x + o.w/2, py, s.forceKind);
    nb.state = 'idle'; nb.t = 0;
    nb.hpTotal = nb.maxHp; nb.hp = nb.bandMax; nb.bandBreak = 0; nb.phase = 1;
    game.boss = nb;
  }
  const p = game.player, b = game.boss;
  // ⚠️ 先定玩家位置再算坐标：之前 gy/cx 取在传送前，雾被画到屏幕外（截图空白，白查一轮）
  p.x = b.x - 92; p.y = b.y + 12;
  const gy = p.y + p.h, cx = p.x + p.w / 2, bcx = b.x + b.w / 2;
  const hz = [];
  if (s.kind === 'mist') {
    for (let i = 0; i < 3; i++) {
      const x = cx + (i - 1) * 120;          // 玩家左右各一道 + 脚下正中一道
      hz.push({ kind:'mist', x:x-28, y:gy, w:56, h:96, t:1.2, life:4.0, tickT:0.2, dmg:1 });
    }
  } else if (s.kind === 'mirror') {
    const n = 3, off = 96;
    for (let i = 0; i < n; i++) {
      hz.push({ kind:'mirror', x: bcx - b.w/2 + (i - (n-1)/2) * off, y: b.y,
                w: b.w, h: b.h, t: 0.8, life: 5.0, hp: 1, flashT: 0, real: i === 1 });
    }
  } else if (s.kind === 'push' || s.kind === 'pushWarn') {
    hz.push({ kind:'pushwall', x: p.x - 150, y: gy - 64, w: 24, h: 64, v: 88, dir: 1,
              warnT: s.kind === 'pushWarn' ? 0.6 : 0, dmg: 2, hitT: 0 });
  } else if (s.kind === 'bomb') {
    hz.push({ kind:'bomb', x: cx - 70, y: gy - 120, r: 8, vx: 110, vy: -40, t: 0, fuse: 0.9, bounceN: 2, dmg: 1, armed: false });
    hz.push({ kind:'bomb', x: cx + 6,  y: gy - 8,   r: 8, vx: 0,   vy: 0,   t: 0.5, fuse: 0.9, bounceN: 0, dmg: 1, armed: true });
    hz.push({ kind:'bomb', x: cx + 76, y: gy - 60,  r: 8, vx: 60,  vy: 90,  t: 0, fuse: 0.9, bounceN: 1, dmg: 1, armed: false });
  }
  window.__v13 = { state: s.state, next: s.next || '', t: s.t || 0,
                   parryOn: !!s.parryOn, breakT: s.breakT || 0, hazards: hz };
  if (!window.__v13noHurt && typeof _engHurtPlayer === 'function') {
    window.__v13noHurt = 1; window._engHurtPlayer = _engHurtPlayer; _engHurtPlayer = function () {};
  }
  if (p) { p.vx = 0; p.vy = 0; p.pullV = 0;
           if (p.hp < 1) p.hp = p.maxHp || 5; p.dead = false; p.deadT = 0; }
  if (!window.__v13iv) window.__v13iv = setInterval(() => {
    const b2 = game.boss; if (!b2) return;
    const v = window.__v13, p2 = game.player;
    if (p2) { p2.hp = p2.maxHp || 5; p2.dead = false; p2.deadT = 0; p2.invT = 0; }
    if (v.state) { b2.state = v.state; b2.t = v.t; }
    b2.next = v.next; b2.parryOn = v.parryOn; b2.breakT = v.breakT;
    game.hazards = v.hazards.map(o => Object.assign({}, o));
  }, 16);
  return { kind: b.kind, state: b.state, hz: hz.length };
}
"""


def shot(pg, name):
    pg.locator('#game').screenshot(path=str(OUT / name))
    print('  截图 ' + name)


SCENES = [
    # (关卡 URL 参数, 文件名, 场景)
    ('level=13&god=1', '_v13_mist.png',      {'state': 'mistCast',   'next': 'mist',   't': 0.8, 'kind': 'mist'}),
    ('level=16&god=1', '_v13_mirror.png',    {'state': 'mirrorCast', 'next': 'mirror', 't': 0.8, 'kind': 'mirror'}),
    ('level=18&god=1', '_v13_push_warn.png', {'state': 'pushCast',   'next': 'push',   't': 0.3, 'kind': 'pushWarn'}),
    ('level=18&god=1', '_v13_push.png',      {'state': 'pushCast',   'next': 'push',   't': 0.9, 'kind': 'push'}),
    ('level=18&god=1', '_v13_parry.png',     {'state': 'parryCast',  'next': 'parry',  't': 0.9, 'kind': 'none',
                                              'forceKind': 5, 'parryOn': True}),
    ('level=18&god=1', '_v13_break.png',     {'state': 'stagger',    'next': 'parry',  't': 0.2, 'kind': 'none',
                                              'forceKind': 5, 'breakT': 1.6}),
    ('level=19&god=1', '_v13_bomb.png',      {'state': 'bombCast',   'next': 'bomb',   't': 0.8, 'kind': 'bomb'}),
]

with sync_playwright() as pw:
    br = pw.chromium.launch()
    seen = {}
    for url, name, sc in SCENES:
        # 每张图重开页面：不同关卡的 Boss 种类不同，同页切关卡会残留上一个 Boss 的 hazards
        pg = br.new_page(viewport={'width': 1280, 'height': 800})
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errors.append('PAGEERROR: ' + str(e)))
        pg.goto(BASE + '?' + url)
        pg.wait_for_timeout(1200)
        pg.evaluate("""() => { if (game.boss && game.player) {
            game.player.x = game.boss.x - 92; game.player.y = game.boss.y + 12;
            game.player.vx = 0; game.player.vy = 0; } }""")
        pg.wait_for_timeout(1500)
        info = pg.evaluate(SETUP, sc)
        pg.wait_for_timeout(500)
        print('  ' + name + ' → ' + str(info))
        shot(pg, name)
        seen[name] = pg.evaluate("() => ({kind:game.boss.kind, state:game.boss.state, hz:(game.hazards||[]).length})")
        pg.close()
    br.close()

print('末态:', seen)
print('CONSOLE_ERRORS:', len(errors))
for e in errors[:8]:
    print('  ' + e)
