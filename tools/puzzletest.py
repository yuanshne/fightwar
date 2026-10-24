# -*- coding: utf-8 -*-
# v4 谜题神龛全流程实测：开龛/世界冻结/按键解题/奖励/持久化/重载/数独
from playwright.sync_api import sync_playwright
import pathlib

BASE = 'file:///C:/Users/A/.zcode/workspace/draft-6e5b5889-432a-4c7b-aabe-13a594a464ac/pixel-quest/index.html'
OUT = pathlib.Path(__file__).parent.parent / 'testshots'
errs = []

def key(pg, name, n=1):
    for _ in range(n):
        pg.keyboard.press(name)
        pg.wait_for_timeout(40)  # 每键间隔一帧：防止同一步内"先移动后填格"的顺序错位

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={'width': 1152, 'height': 680})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)

    # ---- L1 数织 5×5 ----
    pg.goto(BASE + '?level=1'); pg.wait_for_timeout(900)
    sh = pg.evaluate("() => game.level.shrines")
    print('L1 神龛:', sh)
    pg.evaluate("() => { const s=game.level.shrines[0]; game.player.x=s.x-14; game.player.y=s.y+4; }")
    pg.wait_for_timeout(400)
    near = pg.evaluate("() => game.puzzleNear")
    print('靠近后 puzzleNear =', near)
    pg.screenshot(path=str(OUT / 'pz1_near.png'))
    key(pg, 'ArrowUp'); pg.wait_for_timeout(400)
    act = pg.evaluate("() => ({active: game.puzzleActive, t0: game.time})")
    print('开龛:', act)
    pg.wait_for_timeout(800)
    frozen = pg.evaluate("() => ({active: game.puzzleActive, t: game.time})")
    print('世界冻结验证(时间不走):', abs(frozen['t'] - act['t0']) < 0.05, frozen)
    pg.screenshot(path=str(OUT / 'pz2_overlay.png'))

    # 盲解：读画稿，行主序逐格 J(填)/K(叉) + ArrowRight，行尾 ArrowDown + 回退到行首
    pic = pg.evaluate("() => PUZZLES[1].pic")
    size = pg.evaluate("() => PUZZLES[1].size")
    print('谜底(数织):', size, 'x', size)
    for r in range(size):
        for c in range(size):
            key(pg, 'KeyJ' if pic[r][c] == '#' else 'KeyK')
            if c < size - 1:
                key(pg, 'ArrowRight')
        if r < size - 1:
            key(pg, 'ArrowDown')
            key(pg, 'ArrowLeft', size - 1)
    pg.wait_for_timeout(600)
    solved = pg.evaluate("() => ({solved: game.solvedPuzzles, coins: game.coins, active: game.puzzleActive, ls: JSON.parse(localStorage.getItem('pq_progress')||'{}').puzzles})")
    print('解完:', solved)
    pg.wait_for_timeout(2200)  # 2s 自动关层
    after = pg.evaluate("() => ({active: game.puzzleActive, t: game.time})")
    print('自动关层+世界恢复:', after)
    pg.screenshot(path=str(OUT / 'pz3_solved.png'))

    # ---- 重载验证持久化 ----
    pg.reload(); pg.wait_for_timeout(900)
    pg.evaluate("() => { const s=game.level.shrines[0]; game.player.x=s.x-14; game.player.y=s.y+4; }")
    pg.wait_for_timeout(400)
    re = pg.evaluate("() => ({solved: game.solvedPuzzles, near: game.puzzleNear})")
    print('重载后已解状态注入:', re)
    pg.screenshot(path=str(OUT / 'pz4_relit.png'))

    # ---- L2 数独 4×4：开龛+填两格+Esc ----
    pg.goto(BASE + '?level=2'); pg.wait_for_timeout(900)
    pg.evaluate("() => { const s=game.level.shrines[0]; game.player.x=s.x-14; game.player.y=s.y+4; }")
    pg.wait_for_timeout(300)
    key(pg, 'ArrowUp'); pg.wait_for_timeout(400)
    act2 = pg.evaluate("() => game.puzzleActive")
    print('L2 数独开龛:', act2)
    sol = pg.evaluate("() => PUZZLES[2].sol")
    given = pg.evaluate("() => PUZZLES[2].givens")
    # 找第一个空格并填正确数字（数字键1-4）
    filled = False
    for r in range(4):
        for c in range(4):
            if given[r][c] == 0:
                pg.keyboard.press(str(sol[r][c]))
                filled = True
                break
        if filled: break
    pg.wait_for_timeout(300)
    pg.screenshot(path=str(OUT / 'pz5_sudoku.png'))
    key(pg, 'Escape'); pg.wait_for_timeout(300)
    esc = pg.evaluate("() => game.puzzleActive")
    print('填入一正确格(', sol[r][c], ') + Esc 退出:', esc, '(应 False，进度内存保留)')
    b.close()

print('ERRORS:', len(errs))
for e in errs[:8]: print(' -', e[:200])
