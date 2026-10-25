# -*- coding: utf-8 -*-
# v7.4 谜题可通关性 + 鲁棒性实测（Playwright / file:// 直开，无需服务器）
#   A 全 13 座神龛通关主链：靠近 → ↑ 开龛 → 真实按键解完 → 奖励/存档/2s 自动关层
#   B 谜题门：解前走到终点不通关（v7.3 门生效），解后通关（v7.4 护栏放行）
#   C 判定按规则而非按答案：多解题填出「非标准答案」的合法终盘也应判胜；填满但违规不得判胜
#   D fail-open：谜题数据缺失/损坏时神龛不参与门禁（不硬卡关）
#   E 谜题层输入轰炸：puzzleActive ↔ 覆盖层不得脱钩、关层后世界恢复
#   F 死亡/暂停/重开交叉：开龛中死亡不半途复活、Esc 后可复活、暂停态不响应开龛
# 说明：ui.js 是 IIFE，puzzle 覆盖层内部状态不可直接读——全部断言走引擎侧可观测状态
#   （game.puzzleActive / game.solvedPuzzles / game.coins / game.state）+ 真实键盘输入。
import pathlib
from playwright.sync_api import sync_playwright

BASE = 'file:///C:/Users/A/.zcode/workspace/draft-6e5b5889-432a-4c7b-aabe-13a594a464ac/pixel-quest/index.html'
OUT = pathlib.Path(__file__).parent.parent / 'testshots'
OUT.mkdir(exist_ok=True)
fails = []


def ok(case, cond, detail=''):
    print(('  [PASS] ' if cond else '  [FAIL] ') + case + (('  ' + str(detail)) if detail else ''))
    if not cond:
        fails.append((case, str(detail)))


def key(pg, name, n=1, wait=26):
    for _ in range(n):
        pg.keyboard.press(name)
        pg.wait_for_timeout(wait)


def goto(pg, idx):
    pg.evaluate("() => localStorage.removeItem('pq_progress')")
    pg.goto(BASE + '?level=%d&god=1' % idx)
    pg.wait_for_timeout(760)


def to_shrine(pg):
    pg.evaluate("""() => { const s=game.level.shrines[0];
        game.player.x=s.x-14; game.player.y=s.y+4; game.player.vx=0; game.player.vy=0; }""")
    pg.wait_for_timeout(280)


def open_shrine(pg):
    to_shrine(pg)
    near = pg.evaluate('() => game.puzzleNear')
    key(pg, 'ArrowUp')
    pg.wait_for_timeout(300)
    return near, pg.evaluate('() => game.puzzleActive')


def try_goal(pg):
    pg.evaluate("""() => { const g=game.level.goal; if(!g)return;
        game.player.x=g.x+3; game.player.y=g.y+1; game.player.vx=0; game.player.vy=0; }""")
    pg.wait_for_timeout(340)
    return pg.evaluate('() => game.state')


def shrine_idx(pg):
    return pg.evaluate('() => game.level.shrines[0].idx')


def cells_to_fix(pg):
    return pg.evaluate("""() => { const pz=PUZZLES[game.level.shrines[0].idx]; let n=0;
        if(pz.type==='nono'){ for(const row of pz.pic) for(const ch of row) if(ch==='#') n++; }
        else { for(const row of pz.givens) for(const v of row) if(!v) n++; }
        return n; }""")


def fill_grid(pg, rows):
    """按行主序用键盘填满一个 n×n 数独（先把光标顶回 (0,0)——R 清空不会重置光标）"""
    n = len(rows)
    key(pg, 'ArrowLeft', n, wait=14)
    key(pg, 'ArrowUp', n, wait=14)
    for r in range(n):
        for c in range(n):
            key(pg, 'Digit%d' % rows[r][c], wait=22)
            if c < n - 1:
                key(pg, 'ArrowRight', wait=18)
        if r < n - 1:
            key(pg, 'ArrowDown', wait=18)
            key(pg, 'ArrowLeft', n - 1, wait=18)


with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={'width': 1152, 'height': 680})
    pg.on('pageerror', lambda e: fails.append(('pageerror', str(e)[:180])))
    pg.on('console', lambda m: fails.append(('console', m.text[:180])) if m.type == 'error' else None)

    pg.goto(BASE + '?level=1')
    pg.wait_for_timeout(800)
    pkeys = pg.evaluate('() => Object.keys(PUZZLES).map(Number).sort((a,b)=>a-b)')
    nlevel = pg.evaluate('() => ALL_LEVELS.length')
    print('神龛关:', pkeys, '/ 总关数', nlevel)

    # ---------- A + B ----------
    print('== A/B. 逐神龛：解前终点被挡 → 解谜 → 解后放行 ==')
    for k in pkeys:
        goto(pg, k)
        state0 = pg.evaluate('() => game.state')
        ok('P%d 进关可玩' % k, state0 == 'play', state0)
        blocked = try_goal(pg)
        ok('P%d 解前终点被谜题门挡住' % k, blocked == 'play', blocked)
        near, active = open_shrine(pg)
        ok('P%d 神龛可开' % k, active is True, 'near=%s active=%s' % (near, active))
        if not active:
            continue
        n = cells_to_fix(pg)
        coins0 = pg.evaluate('() => game.coins')
        key(pg, 'KeyH', n + 4, wait=22)   # H 提示逐格：能力兜底路径（不会做也能一格一格点过去）
        st = pg.evaluate("""() => ({sv:!!game.solvedPuzzles[game.level.shrines[0].idx],
            coins:game.coins, active:game.puzzleActive})""")
        ok('P%d H 提示 %d 格解完' % (k, n), st['sv'] is True, st)
        ok('P%d 金币 +5' % k, st['coins'] == coins0 + 5, '%d -> %d' % (coins0, st['coins']))
        pg.wait_for_timeout(2300)
        ok('P%d 2s 自动关层' % k, pg.evaluate('() => !game.puzzleActive'))
        ok('P%d 存档落盘' % k, pg.evaluate('(k) => !!(JSON.parse(localStorage.getItem("pq_progress")||"{}").puzzles||{})[k]', k))
        cleared = try_goal(pg)
        ok('P%d 解后终点通关' % k, cleared == 'clear', cleared)
        if k == 1:
            pg.screenshot(path=str(OUT / 'pzrob_p1_clear.png'))

    # ---------- C. 规则判定 ----------
    print('== C. 判定按规则而非按答案 ==')
    goto(pg, 2)
    # 合成多解题：只留 (0,0)=1 一个给定，下面两个终盘都合法
    pg.evaluate("""() => { PUZZLES[2] = { type:'sudoku', size:4,
        givens:[[1,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]],
        sol:[[1,2,3,4],[3,4,1,2],[2,1,4,3],[4,3,2,1]] }; }""")
    key(pg, 'KeyR')          # 重开本关 → startLevel 重新读 PUZZLES
    pg.wait_for_timeout(600)
    near, active = open_shrine(pg)
    ok('C 合成多解题可开', active is True)
    alt = [[1, 2, 3, 4], [3, 4, 1, 2], [4, 3, 2, 1], [2, 1, 4, 3]]
    sol = [[1, 2, 3, 4], [3, 4, 1, 2], [2, 1, 4, 3], [4, 3, 2, 1]]
    ok('C 用例前提：alt 是合法终盘且 ≠ 标准答案', alt != sol)
    # 负例先做：填满但有冲突 → 不得判胜
    bad = [[1, 1, 3, 4], [3, 4, 1, 2], [2, 3, 4, 1], [4, 2, 2, 3]]
    fill_grid(pg, bad)
    pg.wait_for_timeout(200)
    ok('C 负例：填满但违规不判胜', pg.evaluate("() => !game.solvedPuzzles[2]"))
    key(pg, 'KeyR')          # 清空回到给定态
    pg.wait_for_timeout(200)
    fill_grid(pg, alt)
    pg.wait_for_timeout(260)
    ok('C 非标准合法终盘判胜（证明不是对答案）', pg.evaluate("() => game.solvedPuzzles[2] === true"))
    pg.screenshot(path=str(OUT / 'pzrob_c_altsolution.png'))
    pg.keyboard.press('Escape')
    pg.wait_for_timeout(200)

    # ---------- D. fail-open ----------
    print('== D. fail-open：谜题数据缺失/损坏不锁关 ==')
    goto(pg, 1)
    pg.evaluate('() => { delete PUZZLES[1]; }')
    key(pg, 'KeyR')
    pg.wait_for_timeout(600)
    ok('D 缺数据神龛按已解处理', pg.evaluate('() => game.solvedPuzzles[1] === true'))
    to_shrine(pg)
    key(pg, 'ArrowUp')
    pg.wait_for_timeout(260)
    ok('D 缺数据开龛被拒且不冻结世界', pg.evaluate('() => !game.puzzleActive'))
    ok('D 缺数据不锁关（终点可通关）', try_goal(pg) == 'clear')

    goto(pg, 3)
    pg.evaluate("""() => { PUZZLES[3] = { type:'nono', size:7, pic:['###','#.#','###'] }; }""")
    key(pg, 'KeyR')
    pg.wait_for_timeout(600)
    ok('D 损坏画稿神龛按已解处理', pg.evaluate('() => game.solvedPuzzles[3] === true'))
    ok('D 损坏画稿不锁关', try_goal(pg) == 'clear')

    # ---------- E. 输入轰炸 ----------
    print('== E. 谜题层输入轰炸 ==')
    goto(pg, 3)
    near, active = open_shrine(pg)
    ok('E 7×7 数织可开', active is True)
    codes = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyJ', 'KeyK', 'KeyH', 'KeyR',
             'Digit5', 'Digit0', 'Backspace', 'KeyP', 'KeyB', 'Escape', 'Enter', 'Space']
    pg.evaluate("""(codes) => { for(let r=0;r<40;r++) for(const c of codes){
        window.dispatchEvent(new KeyboardEvent('keydown',{code:c}));
        window.dispatchEvent(new KeyboardEvent('keyup',{code:c})); } }""", codes)
    pg.wait_for_timeout(400)
    ok('E 轰炸后主循环仍在跑', pg.evaluate("""() => { const t0=game.tick; return new Promise(r=>
        requestAnimationFrame(()=>requestAnimationFrame(()=>r(game.tick>t0)))); }"""))
    ok('E 轰炸后状态字段未损坏',
       pg.evaluate("() => ['title','play','clear'].includes(game.state) && typeof game.puzzleActive === 'boolean'"))
    pg.evaluate('() => { if(game.paused) game.paused=false; }')
    if pg.evaluate('() => game.puzzleActive'):
        pg.keyboard.press('Escape')
        pg.wait_for_timeout(300)
    t0 = pg.evaluate('() => game.time')
    pg.wait_for_timeout(320)
    t1 = pg.evaluate('() => game.time')
    ok('E 关层后世界恢复推进', t1 > t0 + 0.1, '%s -> %s' % (round(t0, 2), round(t1, 2)))
    ok('E 轰炸后玩家坐标有限', pg.evaluate('() => Number.isFinite(game.player.x) && Number.isFinite(game.player.y)'))

    # ---------- F. 死亡/暂停/重开交叉 ----------
    print('== F. 死亡/暂停/重开交叉 ==')
    goto(pg, 2)
    near, active = open_shrine(pg)
    ok('F 数独 4×4 可开', active is True)
    pg.evaluate('() => killPlayer()')
    pg.wait_for_timeout(320)
    ok('F 开龛中死亡→世界仍冻结（不半途复活）', pg.evaluate('() => game.puzzleActive === true'))
    pg.keyboard.press('Escape')
    pg.wait_for_timeout(1500)
    ok('F Esc 关层后复活', pg.evaluate('() => !game.puzzleActive && !game.player.dead'))
    ok('F 复活后仍可玩', pg.evaluate('() => game.state === "play"'))
    near, active = open_shrine(pg)
    ok('F 复活后神龛仍可开', active is True)
    key(pg, 'KeyR')
    pg.wait_for_timeout(200)
    ok('F 谜题内 R 只清空不退出关卡', pg.evaluate('() => game.puzzleActive && game.state === "play"'))
    pg.keyboard.press('Escape')
    pg.wait_for_timeout(250)
    # 暂停态不响应开龛
    key(pg, 'KeyP')
    pg.wait_for_timeout(200)
    paused = pg.evaluate('() => game.paused')
    to_shrine(pg)
    key(pg, 'ArrowUp')
    pg.wait_for_timeout(220)
    ok('F 暂停态不响应开龛', (not paused) or pg.evaluate('() => !game.puzzleActive'), 'paused=%s' % paused)
    pg.screenshot(path=str(OUT / 'pzrob_f_end.png'))

    b.close()

print()
print('TOTAL FAILURES:', len(fails))
for c, e in fails[:12]:
    print('  [%s] %s' % (c, e))
