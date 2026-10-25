# -*- coding: utf-8 -*-
# v7.6 任务②自测（playwright）：谜题规则说明「右侧常驻栏 + 首次规则卡」
#   A. 真实字体度量：右侧可用宽度 vs 每行文字实际像素宽（决定字号，证明不压盘面/不出框）
#   B. 规则卡：首次进入显示（数织/数独各一次）→ 任意键关闭 / Esc 只关卡不退谜题 / 8s 超时自动关
#   C. ruleSeen：关过后同类不再弹；puzzle.view（回看谜底）永不弹
#   D. 右侧栏像素断言：文字只在盘面右侧空白条内（不越界到盘面），且 4 种题面尺寸都放得下
#   E. 全程 pageerror / console.error = 0
# 运行：/d/python/python.exe tools/_v76_rules_check.py
import pathlib, sys, time
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).parent.parent
BASE = 'file:///' + str(ROOT).replace('\\', '/') + '/index.html'
OUT = ROOT / 'testshots'
OUT.mkdir(exist_ok=True)
errors, results = [], []

def check(name, ok, detail=''):
    results.append((name, ok, detail))
    print(('PASS ' if ok else 'FAIL ') + name + ('  | ' + detail if detail else ''))

# 与 ui.js 同款字体串（drawCNText）
FONT = 'bold {0}px "Microsoft YaHei","PingFang SC",sans-serif'

# 各题面几何（与 ui.js 渲染公式一致，用于算「右侧可用宽度」）
def geom(kind, n):
    if kind == 'sudoku':
        cell = 26 if n == 4 else 22 if n == 6 else 16
        gw = n * cell
        gx = round((384 - gw) / 2)
        return gx + gw, 354 - (gx + gw) - 4
    cell = 18 if n <= 5 else 15 if n <= 7 else 11
    gw = n * cell
    clueW = 5 * 7 + 5          # 9×9 最大行线索 5 段 → clueW=40；其余题面更小，取上界最保守
    gx = round((384 - clueW - gw) / 2) + clueW
    return gx + gw, 354 - (gx + gw) - 4

def probe_card(page):
    """卡片专属信号：底部「任意键开始…」#8ad8a0 绿字，只可能在卡片里（hintN=0 / 非 view 态）"""
    return page.evaluate("""() => {
      const g = document.getElementById('game').getContext('2d');
      const d = g.getImageData(100, 152, 190, 18).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4)
        if (d[i+1] > 190 && d[i] < 175 && d[i+2] > 105 && d[i+2] < 195) n++;
      return n;
    }""")

def probe_rule_col(page, x0, x1):
    """右栏文字 #b8b8c8 像素：返回 (计数, 最左 x)"""
    return page.evaluate("""([x0,x1]) => {
      const g = document.getElementById('game').getContext('2d');
      const d = g.getImageData(x0, 40, x1-x0, 145).data;
      let n = 0, minx = 9999;
      for (let y = 0; y < 145; y++) for (let x = 0; x < x1-x0; x++) {
        const i = (y*(x1-x0)+x)*4;
        if (Math.abs(d[i]-184) < 45 && Math.abs(d[i+1]-184) < 45 && Math.abs(d[i+2]-200) < 45 && d[i+2] > d[i]) {
          n++; if (x0+x < minx) minx = x0+x;
        }
      }
      return [n, minx];
    }""", [x0, x1])

def open_puzzle(page, idx):
    page.evaluate("""(idx) => {
      Object.defineProperty(game, 'puzzleNear', {get: () => idx, set: () => {}, configurable: true});
    }""", idx)
    page.keyboard.press('ArrowUp')
    page.wait_for_timeout(220)

with sync_playwright() as pw:
    br = pw.chromium.launch()
    page = br.new_page(viewport={'width': 900, 'height': 620})
    page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    page.on('console', lambda m: errors.append('console.error: ' + m.text) if m.type == 'error' else None)

    # ---------- A. 真实字体度量 ----------
    page.goto(BASE + '?level=1&god=1')
    page.wait_for_timeout(600)
    CASES = [
        ('nono', 5, ['线索 = 该行列连续', '数字 = 黑格段长', '段间至少空一格']),
        ('nono', 9, ['线索 = 该行列连续', '数字 = 黑格段长', '段间至少空一格']),
        ('nono', 10, ['线索 = 该行列连续', '数字 = 黑格段长', '段间至少空一格']),
        ('sudoku', 4, ['每行 1-4 各一次', '每列 1-4 各一次', '每宫 1-4 各一次']),
        ('sudoku', 6, ['每行 1-6 各一次', '每列 1-6 各一次', '每宫 1-6 各一次']),
        ('sudoku', 9, ['每行 1-9 各一次', '每列 1-9 各一次', '每宫 1-9 各一次']),
    ]
    print('=== A. 右侧常驻栏：可用宽度 vs 实际文字宽（Chromium 真实 measureText） ===')
    for kind, n, lines in CASES:
        board_right, avail = geom(kind, n)
        w = page.evaluate("""([lines, font]) => {
          const g = document.createElement('canvas').getContext('2d');
          const out = {};
          for (const fs of [9, 8]) { g.font = font.replace('{0}', fs);
            out[fs] = lines.map(t => Math.round(g.measureText(t).width * 10) / 10); }
          return out;
        }""", [lines, FONT])
        w9 = max(w['9']); w8 = max(w['8'])
        fs = 9 if w9 <= avail else 8
        check('%s %d×%d 右栏' % (kind, n, n), (w9 if fs == 9 else w8) <= avail,
              '盘面右缘=%d 可用=%dpx | 9px 最宽=%.1fpx %s | 8px 最宽=%.1fpx | 采用 %dpx'
              % (board_right, avail, w9, w['9'], w8, fs))

    # ---------- B. 数织规则卡 ----------
    print('=== B. 数织规则卡（idx=1, 5×5） ===')
    open_puzzle(page, 1)
    c1 = probe_card(page)
    page.screenshot(path=str(OUT / '_v76_card_nono.png'))
    check('首次进入显示规则卡', c1 > 8, '绿字像素=%d' % c1)
    page.keyboard.press('KeyX')       # 任意键关闭
    page.wait_for_timeout(180)
    c2 = probe_card(page)
    active = page.evaluate("game.puzzleActive")
    check('任意键关闭规则卡', c2 == 0 and active is True, '关后绿字=%d，谜题仍开=%s' % (c2, active))
    nr, minx = probe_rule_col(page, 266, 354)
    board_right, avail = geom('nono', 5)
    page.screenshot(path=str(OUT / '_v76_board_nono5.png'))
    check('数织 5×5 右栏规则已绘制且不压盘面', nr > 10 and minx > board_right,
          '文字像素=%d 最左x=%d 盘面右缘=%d' % (nr, minx, board_right))

    # ---------- C. 数独规则卡 + Esc 行为 ----------
    print('=== C. 数独规则卡（idx=6, 9×9） ===')
    page.keyboard.press('Escape'); page.wait_for_timeout(150)   # 先退出数织
    open_puzzle(page, 6)
    c3 = probe_card(page)
    page.screenshot(path=str(OUT / '_v76_card_sudoku.png'))
    check('数独首次进入显示规则卡', c3 > 8, '绿字像素=%d' % c3)
    page.keyboard.press('Escape'); page.wait_for_timeout(180)
    c4 = probe_card(page)
    active = page.evaluate("game.puzzleActive")
    check('Esc 只关规则卡、不退出谜题', c4 == 0 and active is True, '绿字=%d，谜题仍开=%s' % (c4, active))
    nr, minx = probe_rule_col(page, 266, 354)
    br9, av9 = geom('sudoku', 9)
    page.screenshot(path=str(OUT / '_v76_board_sudoku9.png'))
    check('数独 9×9 右栏规则已绘制且不压盘面', nr > 10 and minx > br9,
          '文字像素=%d 最左x=%d 盘面右缘=%d' % (nr, minx, br9))
    # Esc 第二次才退出
    page.keyboard.press('Escape'); page.wait_for_timeout(150)
    check('规则卡关后再按 Esc 正常退出谜题', page.evaluate("game.puzzleActive") is False, '')

    # ---------- D. ruleSeen：同类不再弹 ----------
    print('=== D. ruleSeen 记忆 ===')
    open_puzzle(page, 3)               # 另一道数织
    c5 = probe_card(page)
    check('数织第二次进入不再弹卡', c5 == 0, '绿字=%d' % c5)
    page.keyboard.press('Escape'); page.wait_for_timeout(120)
    open_puzzle(page, 4)               # 另一道数独（6×6）
    c6 = probe_card(page)
    page.screenshot(path=str(OUT / '_v76_board_sudoku6.png'))
    check('数独第二次进入不再弹卡', c6 == 0, '绿字=%d' % c6)
    nr, minx = probe_rule_col(page, 266, 354)
    br6, av6 = geom('sudoku', 6)
    check('数独 6×6 右栏规则不压盘面', nr > 10 and minx > br6, '最左x=%d 盘面右缘=%d' % (minx, br6))
    page.keyboard.press('Escape'); page.wait_for_timeout(120)
    open_puzzle(page, 2)               # 4×4
    nr, minx = probe_rule_col(page, 266, 354)
    br4, av4 = geom('sudoku', 4)
    page.screenshot(path=str(OUT / '_v76_board_sudoku4.png'))
    check('数独 4×4 右栏规则不压盘面', nr > 10 and minx > br4, '最左x=%d 盘面右缘=%d' % (minx, br4))

    # ---------- E. 8s 超时自动关（新页面 = ruleSeen 归零） ----------
    print('=== E. 超时自动关闭（新会话） ===')
    page2 = br.new_page(viewport={'width': 900, 'height': 620})
    page2.on('pageerror', lambda e: errors.append('pageerror2: ' + str(e)))
    page2.on('console', lambda m: errors.append('console.error2: ' + m.text) if m.type == 'error' else None)
    page2.goto(BASE + '?level=1&god=1'); page2.wait_for_timeout(600)
    open_puzzle(page2, 1)
    t0 = time.time()
    c7 = probe_card(page2)
    page2.wait_for_timeout(9200)
    c8 = probe_card(page2)
    active = page2.evaluate("game.puzzleActive")
    check('8s 超时自动关规则卡且谜题仍开', c7 > 8 and c8 == 0 and active is True,
          '开卡=%d 超时后=%d 谜题仍开=%s 等待=%.1fs' % (c7, c8, active, time.time() - t0))
    page2.screenshot(path=str(OUT / '_v76_card_timeout.png'))

    # ---------- F. view（回看谜底）不弹卡 ----------
    print('=== F. 回看谜底不弹卡 ===')
    page3 = br.new_page(viewport={'width': 900, 'height': 620})
    page3.on('pageerror', lambda e: errors.append('pageerror3: ' + str(e)))
    page3.add_init_script("try{localStorage.setItem('pq_progress', JSON.stringify({unlocked:16,stars:{},puzzles:{'1':true}}));}catch(e){}")
    page3.goto(BASE + '?level=1&god=1'); page3.wait_for_timeout(600)
    open_puzzle(page3, 1)
    c9 = probe_card(page3)
    page3.screenshot(path=str(OUT / '_v76_view_nono.png'))
    check('view（已解谜底）不弹规则卡', c9 == 0, '绿字=%d' % c9)

    br.close()

print('=== 错误 ===')
print('  pageerror/console.error = %d' % len(errors))
for e in errors[:8]:
    print('  ' + e)
bad = [r for r in results if not r[1]]
print('\n%d/%d 通过' % (len(results) - len(bad), len(results)))
if bad or errors:
    sys.exit(1)
print('rules OK')
