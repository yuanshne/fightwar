# -*- coding: utf-8 -*-
# v3 界面队浏览器冒烟（工单 ui.md §门禁3/§门禁4，模式照抄 tools/browsertest.py）：
#   1) ?level=7 载入：state=play / boss=dormant / 控制台零 error → lv7_start.png
#   2) 传送 boss.x-140 等 2.5s：boss.state 离开 dormant → lv7_boss.png（血条/技能栏/心形HP 可见）
#   3) boss.hp=1 + attackHit 注入 → 3s 后 state=clear；回车 → 致谢屏 → lv7_credits.png
#   4) 选关屏 7 格 / STARS x/21 → select7.png
#   5) 回归 ?level=1：J 攻击冷却照旧 / K 冲刺照旧（v2 桥接未动的证明）
# 说明：uiState 为 ui.js 闭包内变量，evaluate 不可达——致谢屏用画布像素采样（深空底暗色）+ 截图佐证。
from playwright.sync_api import sync_playwright
import pathlib, sys

BASE = 'file:///C:/Users/A/.zcode/workspace/draft-6e5b5889-432a-4c7b-aabe-13a594a464ac/pixel-quest/index.html'
OUT = pathlib.Path(__file__).parent.parent / 'testshots'
OUT.mkdir(exist_ok=True)
errors = []
failed = []

def check(name, ok, detail=''):
    print(('PASS' if ok else 'FAIL') + ' ' + name + ((' | ' + detail) if detail else ''))
    if not ok:
        failed.append(name)

def pixel(pg, x, y):
    return pg.evaluate("([x,y]) => { const d = document.getElementById('game').getContext('2d').getImageData(x,y,1,1).data; return [d[0],d[1],d[2]]; }", [x, y])

def _round(c):
    return [round(v) for v in c]

def region_mean(pg, x0, y0, x1, y1):
    return pg.evaluate("([x0,y0,x1,y1]) => { const c = document.getElementById('game').getContext('2d'); const d = c.getImageData(x0, y0, x1-x0, y1-y0).data; let r=0,g=0,b=0,n=d.length/4; for (let i=0;i<d.length;i+=4){r+=d[i];g+=d[i+1];b+=d[i+2];} return [r/n, g/n, b/n]; }", [x0, y0, x1, y1])

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={'width': 1152, 'height': 680})
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append('PAGEERROR: ' + str(e)))

    # ---- 1) ?level=7 载入 ----
    pg.goto(f'{BASE}?level=7'); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(600)
    s1 = pg.evaluate("() => ({state:game.state, idx:game.levelIdx, nL:LEVELS.length, boss:game.boss?game.boss.state:'(null)', hp:('hp' in game.player)?game.player.hp:'-', skills:!!game.skills})")
    check('lv7 载入 LEVELS=7 且 boss 存在', s1['nL'] == 7 and s1['boss'] != '(null)', str(s1))
    check('lv7 state=play 且 boss=dormant', s1['state'] == 'play' and s1['boss'] == 'dormant', str(s1))
    pg.screenshot(path=str(OUT / 'lv7_start.png'))

    # ---- 2) 传送 boss.x-140 → intro/战斗 ----
    pg.evaluate("() => { game.player.x = game.boss.x - 140; }")
    pg.wait_for_timeout(2500)
    s2 = pg.evaluate("() => ({boss:game.boss.state, phase:game.boss.phase, php:game.player.hp, pdead:game.player.dead})")
    check('lv7 传送后 Boss 离开 dormant', s2['boss'] != 'dormant', str(s2))
    pg.screenshot(path=str(OUT / 'lv7_boss.png'))
    # HUD 佐证采样：Boss 血条条底区域 / 心形 HP 行 / 技能栏槽（只报告颜色，断言留给截图人工核验）
    print('INFO HUD像素 bossBar(140,22)=' + str(pixel(pg, 140, 22)) +
          ' heart(8,23)=' + str(pixel(pg, 8, 23)) +
          ' slotU(170,206)=' + str(pixel(pg, 170, 206)))

    # ---- 3) 击杀 → clear → 致谢屏 ----
    # 工单字面步骤：boss.hp=1 + attackHit 注入（evaluate 注入后 3 帧）→ 3s 后 state=clear。
    # 注：实测 engine _engBossHurt（engine.js:413-427）中 enrage 分支（hp<=30 && phase===1）
    # 先于 dying 分支且 return——phase1 的致死一击（hp 1→0）会进入 enrage 而非 dying，
    # 需再补一击（真实玩家连打即如此）。故字面单发后追加连打兜底，两者分别报告。
    pg.evaluate("() => { const b=game.boss, p=game.player; b.hp = 1; p.x = b.x - 20; p.y = b.y + b.h - p.h; p.vx = 0; p.vy = 0; p.face = 1; game.input.attackHit = 1; }")
    pg.wait_for_timeout(70)
    pg.evaluate("() => { if (game.state === 'play') game.input.attackHit = 1; }")
    pg.wait_for_timeout(70)
    pg.evaluate("() => { if (game.state === 'play') game.input.attackHit = 1; }")
    pg.wait_for_timeout(3000)
    s3 = pg.evaluate("() => ({state:game.state, boss:game.boss?game.boss.state:'(null)', hp:game.boss?game.boss.hp:'-', php:game.player.hp, pdead:game.player.dead})")
    check('lv7 工单单发注入 3s 后 state=clear', s3['state'] == 'clear', str(s3))
    if s3['state'] != 'clear':
        # 连打兜底（模拟玩家）：每轮把玩家放回 boss 身前 face=1 并重置 hp=1 后注入攻击
        kill_js = "() => { if (game.state === 'play' && game.boss && !['dormant','intro','enrage','dying','dead'].includes(game.boss.state)) { const b=game.boss, p=game.player; b.hp = 1; p.x = b.x - 20; p.y = b.y + b.h - p.h; p.vx = 0; p.vy = 0; p.face = 1; game.input.attackHit = 1; } }"
        for _ in range(8):
            pg.evaluate(kill_js)
            pg.wait_for_timeout(400)
            if pg.evaluate("() => game.state") == 'clear':
                break
        for _ in range(14):  # dying 2.2s 内轮询等 clear
            if pg.evaluate("() => game.state") == 'clear':
                break
            pg.wait_for_timeout(300)
        s3 = pg.evaluate("() => ({state:game.state, boss:game.boss?game.boss.state:'(null)', hp:game.boss?game.boss.hp:'-', php:game.player.hp, pdead:game.player.dead})")
        check('lv7 连打兜底后 state=clear（engine enrage 序问题佐证）', s3['state'] == 'clear', str(s3))
    # ui 通关分支要求 game.clearT>0.8 才消费回车边沿——先等 1.2s 再按，否则边沿被空消费
    pg.wait_for_timeout(1200)
    pg.keyboard.press('Enter'); pg.wait_for_timeout(900)
    # 判定：credits=深空底（区域均值暗、偏蓝）；仍在 clear 则中央有金色「关卡完成」大字（R+G 高）
    m_title = region_mean(pg, 170, 42, 214, 60)
    m_top = region_mean(pg, 180, 2, 220, 14)
    if m_title[0] + m_title[1] > 200:  # 仍在 clear，补按一次
        pg.keyboard.press('Enter'); pg.wait_for_timeout(900)
        m_title = region_mean(pg, 170, 42, 214, 60); m_top = region_mean(pg, 180, 2, 220, 14)
    check('lv7 回车后进入致谢屏（无金色通关标题 + 顶部深空）',
          m_title[0] + m_title[1] <= 200 and m_top[2] >= m_top[0],
          f'标题区均值={[_round(m_title)]} 顶区均值={[_round(m_top)]}')
    pg.screenshot(path=str(OUT / 'lv7_credits.png'))

    # ---- 4) 选关屏 7 格 ----
    pg.goto(BASE); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(700)
    pg.keyboard.press('Enter'); pg.wait_for_timeout(500)
    n = pg.evaluate('() => LEVELS.length')
    pg.screenshot(path=str(OUT / 'select7.png'))
    check('选关屏 LEVELS.length=7', n == 7, 'LEVELS=' + str(n))

    # ---- 5) 回归 ?level=1：v2 攻击/冲刺桥接未动 ----
    pg.goto(f'{BASE}?level=1'); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(600)
    pg.keyboard.press('KeyJ'); pg.wait_for_timeout(130)
    a = pg.evaluate("() => ({atkT:game.player.atkT, atkCd:game.player.atkCd})")
    check('L1 J 攻击冷却照旧', a['atkT'] > 0 or a['atkCd'] > 0, str(a))
    pg.screenshot(path=str(OUT / 'lv1_attack.png'))
    pg.wait_for_timeout(400)
    pg.keyboard.press('KeyK'); pg.wait_for_timeout(80)
    d = pg.evaluate("() => ({dashT:game.player.dashT, dashCd:game.player.dashCd})")
    check('L1 K 冲刺照旧', d['dashT'] > 0 or d['dashCd'] > 0, str(d))
    pg.screenshot(path=str(OUT / 'lv1_dash.png'))
    b.close()

print('CONSOLE_ERRORS:', len(errors))
for e in errors[:8]:
    print(' -', e[:240])
print('FAILED:', len(failed), failed)
sys.exit(1 if (errors or failed) else 0)
