# -*- coding: utf-8 -*-
# v7 界面队 playwright 自测（工单 v7-ui §交付自测 3/4；模式沿 _v6_bag_check.py）：
#  A. ?level=1 全程（载入+移动+跳跃）pageerror/console.error=0；
#  B. 存档迁移（H2/§2.3）：注入三种旧档（v5 纯 unlocked/stars、v6 全字段、v6+stars['9']=3）→
#     载入+强制 saveProgress 落盘 → 断言旧键原值保留 / 第三档 unlocked=11 / 连续两次 reload 存档逐字节一致（幂等）；
#  C. 章节化选关屏（§9.2）：?god=1 注入 unlocked=1/8/13 三档截图；章头亮/灰（#3a4468）像素断言、
#     Boss 卡红描边（#f86048）断言；键盘 ↑↓ 跨章保持列号（ArrowDown+Enter → game.levelIdx===7 → 再 ↑↓+Enter → 13）；
#  D. 章节文件缺省过渡（工单 3d）：HTTP 服务 + chapter2/3.js 空 fulfill → ALL_LEVELS.length===10、
#     选关屏单章 10 卡布局（ArrowRight×7+Enter 进 L8 证明 L8~L10 可选——"照常可用"）；
#  E. 黑暗层（§9.7）：?level=14 60s console 零报错 + 尾段 5s 步进率≥0.9*60（帧率）+ dark 开关全屏均值差分（证明在画）；
#  F. 新实体渲染冒烟：?level=11（sea：水流/宝箱/G 砖）、?level=13/16（boss2/3 部件装配 renderBoss 路径）零异常。
# 说明：c/d 原工单预案为"levels 侧聚合未就绪则替代执行"；实测本轮六队文件均已合入，全部真实执行。
import http.server, pathlib, socket, threading, sys
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).parent.parent
BASE = 'file:///' + str(ROOT).replace('\\', '/') + '/index.html'
OUT = pathlib.Path(__file__).parent / '_v7_ui_shots'
OUT.mkdir(exist_ok=True)
errors = []
results = []

def check(name, ok, detail=''):
    results.append((name, ok, detail))
    print(('PASS ' if ok else 'FAIL ') + name + ('  | ' + detail if detail else ''))

def sum_rgb(pg, x, y, w, h):
    return pg.evaluate("""([x, y, w, h]) => {
      const g = document.getElementById('game').getContext('2d');
      const d = g.getImageData(x, y, w, h).data; let n = 0;
      for (let i = 0; i < d.length; i += 4) n += d[i] + d[i+1] + d[i+2];
      return n;
    }""", [x, y, w, h])

def count_color(pg, x, y, w, h, expr):
    return pg.evaluate("""([x, y, w, h, expr]) => {
      const g = document.getElementById('game').getContext('2d');
      const d = g.getImageData(x, y, w, h).data; let n = 0;
      for (let i = 0; i < d.length; i += 4)
        if (eval(expr).call(null, d[i], d[i+1], d[i+2])) n++;
      return n;
    }""", [x, y, w, h, expr])

GRAY_HDR = "((r,g,b)=>Math.abs(r-58)<34&&Math.abs(g-68)<34&&Math.abs(b-104)<38)"    # 章锁定灰 #3a4468
BRIGHT_TX = "((r,g,b)=>r>225&&g>232&&b>245)"                                        # 亮章头 #f0f4ff
RED_BOSS = "((r,g,b)=>Math.abs(r-248)<26&&Math.abs(g-96)<34&&Math.abs(b-72)<38)"    # Boss 红描边 #f86048

def goto(pg, url, settle=900):
    pg.goto(url); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(settle)

def fresh_save(pg, save):
    pg.evaluate("s => { localStorage.clear(); localStorage.setItem('pq_progress', JSON.stringify(s)); }", save)
    pg.reload(); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(700)

def to_select(pg, settle=500):
    pg.keyboard.press('Enter'); pg.wait_for_timeout(settle)   # title → select

def saved_raw(pg):
    return pg.evaluate("() => localStorage.getItem('pq_progress')")

def saved(pg):
    return pg.evaluate("() => JSON.parse(localStorage.getItem('pq_progress')||'null')")

V6_FIELDS = {'equip': {'w': -1, 'h': -1, 'c': -1},
             'inv': [{'id': 1, 'slot': 'w', 'r': 2}],
             'shards': {'w2': 1}, 'nextId': 2}

def force_save(pg, settle=450):
    """play 态注入一个 pickup 触发 saveProgress（迁移后的内存 progress 落盘；不改 unlocked/stars 语义）"""
    pg.evaluate("() => { game.pickups = [{slot:'h', r:3}]; }")
    pg.wait_for_timeout(settle)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={'width': 1152, 'height': 680})
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append('PAGEERROR: ' + str(e)))

    # ============ A. ?level=1 全程零报错 ============
    pg.goto(BASE + '?level=1'); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(800)
    pg.keyboard.down('ArrowRight'); pg.wait_for_timeout(1500); pg.keyboard.up('ArrowRight')
    pg.keyboard.press('Space'); pg.wait_for_timeout(400)
    pg.keyboard.down('ArrowLeft'); pg.wait_for_timeout(900); pg.keyboard.up('ArrowLeft')
    pg.keyboard.press('KeyJ'); pg.wait_for_timeout(600)
    pg.wait_for_timeout(800)
    check('A1 ?level=1 全程 pageerror/console.error=0', len(errors) == 0, 'errors=' + str(errors[:3]))

    # ============ B. 存档迁移三旧档（H2/§2.3）============
    V5 = {'unlocked': 5, 'stars': {'0': 2}}
    V6 = dict(V5, unlocked=8, stars={'0': 3}, puzzles={'1': True}, v5m=1, **V6_FIELDS)
    V6_9 = dict(V6, stars={'0': 3, '9': 3})
    for tag, save, want_unlock in [('v5', V5, 5), ('v6', V6, 8), ('v6+stars9', V6_9, 11)]:
        errors.clear()
        fresh_save(pg, save)
        goto(pg, BASE + '?level=1', 600)
        force_save(pg)                                   # 迁移只写内存 → 落盘需一次 saveProgress
        s = saved(pg)
        keep = (s['unlocked'] == want_unlock and s['stars'] == save['stars']
                and s.get('puzzles') == save.get('puzzles') and s.get('v5m') == save.get('v5m')
                and s['equip'] == V6_FIELDS['equip']
                and (s['shards'].get('w2') == 1 if 'w2' in save.get('shards', {}) else True))
        check(f'B1-{tag} 旧键原值保留（unlocked(含迁移抬升)/stars/puzzles/v5m/equip/shards）', keep,
              'unlocked=' + str(s['unlocked']) + ' stars=' + str(s['stars']))
        check(f'B2-{tag} 载入零报错', len(errors) == 0, str(errors[:2]))
    # 第三档语义断言：stars['9']>=1 → unlocked 抬到 11
    errors.clear()
    fresh_save(pg, V6_9)
    goto(pg, BASE + '?level=1', 600)
    force_save(pg)
    s = saved(pg)
    check('B3 v6+stars[9]=3 → unlocked=11（不必重打 L10）', s['unlocked'] == 11, 'unlocked=' + str(s['unlocked']))
    check('B4 第三档 stars 原值保留', s['stars'] == {'0': 3, '9': 3}, str(s['stars']))
    raw1 = saved_raw(pg)
    pg.reload(); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(700)
    raw2 = saved_raw(pg)
    pg.reload(); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(700)
    raw3 = saved_raw(pg)
    check('B5 连续两次 reload 存档逐字节一致（迁移幂等 R2）', raw1 == raw2 == raw3)

    # ============ C. 章节化选关屏（?god=1；unlocked=1/8/13 三档）============
    # C1：unlocked=1 —— 第一二三章中二三章头灰（章首关 8/14 > 1）
    errors.clear()
    fresh_save(pg, {'unlocked': 1, 'stars': {}})
    goto(pg, BASE + '?god=1', 700)
    to_select(pg)
    g2 = count_color(pg, 0, 82, 200, 16, GRAY_HDR)       # 第二章章头行 y=86±
    g3 = count_color(pg, 0, 144, 200, 16, GRAY_HDR)      # 第三章章头行 y=148±
    pg.screenshot(path=str(OUT / 'select_u1.png'))
    check('C1 unlocked=1：第二/三章章头灰化（#3a4468 像素>10）', g2 > 10 and g3 > 10, f'g2={g2} g3={g3}')
    # C2：unlocked=8 —— 一二章亮、三章灰
    fresh_save(pg, {'unlocked': 8, 'stars': {}})
    pg.reload(); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(700)
    to_select(pg)
    b1h = count_color(pg, 0, 20, 200, 16, BRIGHT_TX)
    b2h = count_color(pg, 0, 82, 200, 16, BRIGHT_TX)
    g3 = count_color(pg, 0, 144, 200, 16, GRAY_HDR)
    pg.screenshot(path=str(OUT / 'select_u8.png'))
    check('C2 unlocked=8：一/二章头亮 + 三章头灰', b1h > 10 and b2h > 10 and g3 > 10,
          f'b1={b1h} b2={b2h} g3={g3}')
    # C3：unlocked=14 —— 三章全亮（章锁定语义=章首关>unlocked：unlocked=13 时 L14 未解锁，
    # 第三章按 §9.2 恰好应为灰态——已在 C2 断言；三章全亮需 unlocked≥14）；L7/L13 Boss 卡红描边
    fresh_save(pg, {'unlocked': 14, 'stars': {}})
    pg.reload(); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(700)
    to_select(pg)
    b1h = count_color(pg, 0, 20, 200, 16, BRIGHT_TX)
    b2h = count_color(pg, 0, 82, 200, 16, BRIGHT_TX)
    b3h = count_color(pg, 0, 144, 200, 16, BRIGHT_TX)
    g3 = count_color(pg, 0, 144, 200, 16, GRAY_HDR)
    r7 = count_color(pg, 318, 30, 60, 52, RED_BOSS)      # L7 卡（x=324..370, y=34..78）
    r13 = count_color(pg, 265, 92, 60, 52, RED_BOSS)     # L13 卡（x=271..317, y=96..140）
    r16 = count_color(pg, 106, 152, 60, 54, RED_BOSS)    # L16 卡（x=112..158, y=158..202）
    pg.screenshot(path=str(OUT / 'select_u13.png'))
    check('C3 unlocked=14：三章头全亮（且三章头非灰）', b1h > 10 and b2h > 10 and b3h > 10 and g3 < 10,
          f'{b1h}/{b2h}/{b3h} g3={g3}')
    check('C4 L7/L13/L16 Boss 卡红描边（#f86048 像素>40）', r7 > 40 and r13 > 40 and r16 > 40,
          f'r7={r7} r13={r13} r16={r16}')
    # C5：键盘 ↑↓ 跨章保持列号（§9.2）——select 初始 menuSel=0 → ↓ 到 L8（idx7）→ Enter 进关
    pg.keyboard.press('ArrowDown'); pg.wait_for_timeout(200)
    pg.keyboard.press('Enter'); pg.wait_for_timeout(900)
    li = pg.evaluate("() => game.levelIdx")
    check('C5 ↓ 跨章到第二章首卡（Enter 进 L8，levelIdx=7）', li == 7, 'levelIdx=' + str(li))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(500)  # 回选关（menuSel=7 保留）
    pg.keyboard.press('ArrowDown'); pg.wait_for_timeout(200)
    pg.keyboard.press('Enter'); pg.wait_for_timeout(1000)
    li = pg.evaluate("() => game.levelIdx")
    dark = pg.evaluate("() => !!(game.level && game.level.theme && game.level.theme.dark===true && game.level.meta && game.level.meta.theme==='nether')")
    pg.screenshot(path=str(OUT / 'select_down_to_L14.png'))
    check('C6 再 ↓ 跨章到第三章首卡（Enter 进 L14，levelIdx=13）', li == 13, 'levelIdx=' + str(li))
    check('C7 L14 nether 主题 dark=true（黑暗层开关命中）', dark is True)
    check('C8 选关/进关过程零报错', len(errors) == 0, str(errors[:3]))

    # ============ E. 黑暗层（?level=14）：60s 零报错 + 帧率 + 开关差分 ============
    errors.clear()
    goto(pg, BASE + '?level=14', 800)
    pg.wait_for_timeout(60000)
    rate = pg.evaluate("""() => new Promise(res => {
      const t0 = game.tick, w0 = performance.now();
      setTimeout(() => res((game.tick - t0) * 1000 / (performance.now() - w0)), 5000);
    })""")
    full_on = sum_rgb(pg, 0, 16, 384, 208)               # 全屏均值（跳过 HUD 行）
    pg.evaluate("() => { game.level.theme.dark = false; }"); pg.wait_for_timeout(400)
    full_off = sum_rgb(pg, 0, 16, 384, 208)
    pg.evaluate("() => { game.level.theme.dark = true; }"); pg.wait_for_timeout(200)
    pg.screenshot(path=str(OUT / 'dark_L14_on.png'))
    check('E1 ?level=14 60s pageerror/console.error=0', len(errors) == 0, str(errors[:3]))
    check('E2 步进率≥54/s（60s 满载无明显掉帧）', rate >= 54, 'rate=' + str(round(rate, 1)))
    check('E3 dark on→off 全屏均值显著变亮（黑暗层在画）', full_off - full_on > 150000,
          f'on={full_on} off={full_off}')

    # ============ F. 新实体渲染冒烟（sea/双新 Boss/精英怪 关零异常）============
    for lv, tag in [(11, 'sea_L11'), (12, 'elite_x_L12'), (13, 'boss2_L13'),
                    (15, 'elite_z_L15'), (16, 'boss3_L16')]:
        errors.clear()
        goto(pg, BASE + '?level=' + str(lv) + '&god=1', 900)
        pg.wait_for_timeout(1200)
        elite = pg.evaluate("() => (game.level.enemies||[]).some(e => e.elite)")
        pg.screenshot(path=str(OUT / f'smoke_{tag}.png'))
        check(f'F-{tag} 载入+2s 零报错（新渲染分支冒烟）', len(errors) == 0, str(errors[:3]))
        if 'elite' in tag:
            check(f'F-{tag} 精英在场（e.elite=true，_eliteFx 路径执行）', elite is True)

    # ============ D. 章节文件缺省过渡（HTTP 服务 + chapter2/3.js 空 fulfill）============
    errors.clear()
    PORT = 8971
    handler = lambda *a, **k: http.server.SimpleHTTPRequestHandler(*a, directory=str(ROOT), **k)
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        pg2 = b.new_page(viewport={'width': 1152, 'height': 680})
        pg2.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        pg2.on('pageerror', lambda e: errors.append('PAGEERROR: ' + str(e)))
        pg2.route('**/chapter2.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=''))
        pg2.route('**/chapter3.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=''))
        U = f'http://127.0.0.1:{PORT}/index.html'
        pg2.evaluate = pg2.evaluate  # noqa（占位可读性）
        pg2.goto(U); pg2.wait_for_load_state('networkidle'); pg2.wait_for_timeout(800)
        n = pg2.evaluate("() => ALL_LEVELS.length")
        check('D1 chapter2/3 空合入 → ALL_LEVELS.length===10', n == 10, 'n=' + str(n))
        pg2.evaluate("() => { localStorage.clear(); localStorage.setItem('pq_progress', JSON.stringify({unlocked: 13, stars: {}})); }")
        pg2.goto(U); pg2.wait_for_load_state('networkidle'); pg2.wait_for_timeout(800)
        pg2.keyboard.press('Enter'); pg2.wait_for_timeout(500)   # title → select（单章 10 卡）
        b2h = count_color(pg2, 0, 20, 200, 16, BRIGHT_TX)        # 第一章章头亮
        g2 = count_color(pg2, 0, 82, 200, 16, BRIGHT_TX)         # y=86 行应无亮章头（第二张卡行=卡片星区）
        pg2.screenshot(path=str(OUT / 'select_10chapters.png'))
        check('D2 10 关过渡：仅第一章章头亮（y=86 无章头）', b2h > 10 and g2 < 5, f'b1={b2h} g2={g2}')
        for _ in range(7):                                       # →×7 到 L8 卡（证明 L8~L10 可选）
            pg2.keyboard.press('ArrowRight'); pg2.wait_for_timeout(120)
        pg2.keyboard.press('Enter'); pg2.wait_for_timeout(900)
        li = pg2.evaluate("() => game.levelIdx")
        check('D3 单章 10 卡：→×7+Enter 进 L8（levelIdx=7，照常可用）', li == 7, 'levelIdx=' + str(li))
        check('D4 过渡路径零 pageerror', len([e for e in errors if e.startswith('PAGEERROR')]) == 0, str(errors[:3]))
        pg2.close()
    finally:
        httpd.shutdown()

    b.close()

# ---------- 汇总 ----------
fails = [r for r in results if not r[1]]
print()
print('CONSOLE_ERRORS_TOTAL:', len(errors))
for e in errors[:8]:
    print(' -', e[:240])
if fails:
    print('FAILED_CHECKS:', len(fails))
    sys.exit(1)
print('ALL_CHECKS_PASS')
