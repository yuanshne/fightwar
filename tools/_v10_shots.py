# -*- coding: utf-8 -*-
# _v10_shots.py —— v10 Boss 新招式目检截图（file:// + playwright，写法同 tools/browsertest.py / _v79_bossbar.py）
#  用 ?level=7 进 Boss 关（星核巨兽 kind=1），把玩家挪到 Boss 左侧，等 intro 演完；
#  再用一个 16ms 的 setInterval 把 game.boss.state / next / t 与 game.hazards 钉住（引擎每帧会改状态，
#  不钉住截到的是下一招），逐个新招式截图：
#    meteor / spike / homing / clone / pull 五种前摇+危险物，外加连段、破绽、189/567 两档血条。
#  断言 page.on('pageerror') 与 console.error 为空。
import pathlib, sys
from playwright.sync_api import sync_playwright

BASE = 'file:///C:/Users/A/.zcode/workspace/draft-6e5b5889-432a-4c7b-aabe-13a594a464ac/pixel-quest/index.html'
OUT = pathlib.Path(__file__).parent.parent / 'testshots'
OUT.mkdir(exist_ok=True)
errors = []

# 在页面里构造场景：s = {state, next, t, comboN, comboQ, kind, bar}
# 危险物坐标全部按玩家当前位置推导，保证落在镜头内；y 给「地面以上」，陨石预警圈由 ui 自己吸附到地面。
SETUP = """
(s) => {
  const p = game.player, b = game.boss;
  const gy = p.y + p.h, cx = p.x + p.w / 2;
  const hz = [];
  if (s.kind === 'meteor') {
    // 引擎口径：预警期 y = 该列地面顶（UI 在此画收缩圈），下落期 y = 陨石球心
    hz.push({ kind:'meteor', x:cx-58, y:gy,      vy:260, r:9, warnT:0.80 });
    hz.push({ kind:'meteor', x:cx+36, y:gy,      vy:260, r:9, warnT:0.30 });
    hz.push({ kind:'meteor', x:cx+94, y:gy-56,   vy:260, r:9, warnT:0 });
  } else if (s.kind === 'spike') {
    hz.push({ kind:'spike', x:cx-64, y:gy, h:24, t:1.0, life:3 });
    hz.push({ kind:'spike', x:cx+36, y:gy, h:18, t:0.6, life:3 });
    hz.push({ kind:'spike', x:cx+70, y:gy, h:6,  t:0.12, life:3 });
  } else if (s.kind === 'homing') {
    hz.push({ kind:'homing', x:cx+120, y:gy-70, vx:-90, vy:20, turn:2.4, life:3, t:1.1 });
    hz.push({ kind:'homing', x:cx+160, y:gy-40, vx:-70, vy:-30, turn:2.0, life:3, t:0.6 });
  } else if (s.kind === 'clone') {
    hz.push({ kind:'clone', x:b.x-196, y:b.y, w:b.w, h:b.h, hp:60, face:1, flashT:0, t:0.5 });
    hz.push({ kind:'clone', x:b.x-128, y:b.y, w:b.w, h:b.h, hp:60, face:-1, flashT:0.1, t:0.9 });
  } else if (s.kind === 'pull') {
    hz.push({ kind:'pull', x:cx, y:gy-40, r:56, t:0.7, life:2, cx:cx, cy:gy-40 });
  }
  window.__v10 = { state:s.state, next:s.next, t:s.t, comboN:s.comboN||0, comboQ:s.comboQ||null,
                   hazards:hz, bar:s.bar||null };
  // 截图专用：把引擎唯一的承伤入口换成空函数（_engHurtPlayer 是经典 script 的顶层声明，可重赋值），
  // 否则危险物每帧判定会把玩家打死/触发复活重载，截到的就是「空血条 + 主角不在场」。
  if (!window.__v10noHurt && typeof _engHurtPlayer === 'function') {
    window.__v10noHurt = 1; window._engHurtPlayer = _engHurtPlayer; _engHurtPlayer = function () {};
  }
  // 每张图前把玩家摆回 Boss 左侧固定位（上一张图里可能被打飞/被吸走，镜头会跟着跑）
  if (p) { p.x = b.x - 96; p.y = b.y + 12; p.vx = 0; p.vy = 0; p.pullV = 0;
           if (p.hp < 1) p.hp = p.maxHp || 5; p.dead = false; p.deadT = 0; }
  if (!window.__v10iv) window.__v10iv = setInterval(() => {
    const b2 = game.boss; if (!b2) return;
    const v = window.__v10;
    // 危险物每帧都会判定伤害，截图期间必须把玩家「钉活」+ 血量拉满、invT 清零（否则 HUD 心形与主角
    // 会按无敌帧隔帧闪烁，截到的那一帧正好是空的，看着像玩家死了）
    const p2 = game.player;
    if (p2) { p2.hp = p2.maxHp || 5; p2.dead = false; p2.deadT = 0; p2.invT = 0; }
    if (v.state) { b2.state = v.state; b2.t = v.t; b2.hidden = false; }
    if (v.next) b2.next = v.next;
    b2.comboN = v.comboN; b2.comboQ = v.comboQ;
    if (v.bar) { b2.maxHp = v.bar.maxHp; b2.bandMax = v.bar.maxHp/3; b2.bandBreak = v.bar.brk;
                 b2.hp = Math.round(b2.bandMax * v.bar.frac); }
    // 引擎的 _engUpdateHazards 会就地 splice 掉落地/超时的危险物，所以每帧从模板重新克隆一份，
    // 否则等 0.4s 截图时陨石已经砸完消失（截图脚本专用手法，不涉及游戏内逻辑）。
    game.hazards = v.hazards.map(function (o) { return Object.assign({}, o); });
  }, 16);
  return { bossState: b.state, next: b.next, hazards: hz.length };
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

    pg.goto(BASE + '?level=7&god=1')
    pg.wait_for_timeout(1200)
    pg.evaluate("""() => { if (game.boss && game.player) {
        game.player.x = game.boss.x - 96; game.player.y = game.boss.y + 12;
        game.player.vx = 0; game.player.vy = 0; } }""")
    pg.wait_for_timeout(2400)          # intro 1.8s 演完 → 常态，血条常显
    print('Boss:', pg.evaluate("() => ({kind:game.boss.kind, maxHp:game.boss.maxHp, state:game.boss.state})"))

    SCENES = [
        ('_v10_meteor.png',  {'state': 'windup', 'next': 'meteor', 't': 0.30, 'kind': 'meteor'}),
        ('_v10_spike.png',   {'state': 'windup', 'next': 'spike',  't': 0.30, 'kind': 'spike'}),
        ('_v10_homing.png',  {'state': 'windup', 'next': 'homing', 't': 0.30, 'kind': 'homing'}),
        ('_v10_clone.png',   {'state': 'windup', 'next': 'clone',  't': 0.30, 'kind': 'clone'}),
        ('_v10_pull.png',    {'state': 'windup', 'next': 'pull',   't': 0.30, 'kind': 'pull'}),
        ('_v10_combo.png',   {'state': 'windup', 'next': 'spike',  't': 0.30, 'kind': 'spike',
                              'comboN': 2, 'comboQ': ['meteor', 'spike']}),
        ('_v10_stagger.png', {'state': 'stagger', 't': 0.40, 'kind': 'pull'}),
    ]
    for name, sc in SCENES:
        pg.evaluate(SETUP, sc)
        pg.wait_for_timeout(420)
        info = pg.evaluate("() => ({state:game.boss.state, next:game.boss.next, hz:(game.hazards||[]).length,"
                           " comboN:game.boss.comboN})")
        print('  场景 ' + name + ' → ' + str(info))
        shot(pg, name)

    # 血条三段刻度：189 / 567 两档（每段 63 / 189），刻度应落在同一像素（比例恒 1/3）
    for mx, name in [(189, '_v10_bar_189.png'), (567, '_v10_bar_567.png')]:
        pg.evaluate(SETUP, {'state': 'windup', 'next': 'meteor', 't': 0.2, 'kind': 'meteor',
                            'bar': {'maxHp': mx, 'brk': 0, 'frac': 0.55}})
        pg.wait_for_timeout(420)
        print('  血条 maxHp=' + str(mx) + ' 刻度 x=' + str(pg.evaluate(
            "() => { const b=game.boss, inner=172, x0=129, bm=b.bandMax||b.maxHp/3, tot=b.maxHp||bm*3;"
            "return [Math.round(x0+inner*(bm/tot)), Math.round(x0+inner*(2*bm/tot))]; }")))
        shot(pg, name)

    br.close()

if errors:
    print('console/page errors:')
    for e in errors:
        print('  ' + e)
    sys.exit(1)
print('OK：9 张 v10 目检图已输出到 testshots/_v10_*.png')
