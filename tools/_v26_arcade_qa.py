"""v26 街机小关实机验收：14 个非 Boss 关逐关截图 + 8 种玩法真实按键路径。
仅本地验证用（python tools/_v26_arcade_qa.py，需要 8123 静态服务器）。"""
from playwright.sync_api import sync_playwright
import pathlib

OUT = pathlib.Path(__file__).parent / '_shots'
OUT.mkdir(exist_ok=True)
BASE = 'http://localhost:8123/index.html'
LEVELS = [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 14, 15, 17]  # 1-based，14 个非 Boss 关


def shot(page, name):
    page.locator('#game').screenshot(path=str(OUT / (name + '.png')))
    print('  shot', name)


def info(page):
    return page.evaluate("""()=>({
      active: !!(window.ARCADE && ARCADE.active),
      tilesNull: !!(game.level && game.level.tiles === null),
      type: window.ARCADE && ARCADE._state() && ARCADE._state().type,
      idx: game.levelIdx, state: game.state, time: +game.time.toFixed(2),
      coins: game.coins, deaths: game.deaths,
      st: window.ARCADE && ARCADE._state() && ARCADE._state().data
    })""")


with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True)
    page = b.new_page(viewport={'width': 960, 'height': 640})
    errs = []
    page.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    page.on('console', lambda m: errs.append('console: ' + m.text) if m.type == 'error' else None)
    failures = []

    def ok(cond, msg, extra=''):
        print(('  PASS ' if cond else '  FAIL ') + msg + ('' if cond else '  [' + str(extra) + ']'))
        if not cond:
            failures.append(msg)

    # 1) 逐关进场：截图 + 基本断言
    print('[1] 14 关逐一进入')
    for lv in LEVELS:
        page.goto(BASE + '?level=%02d' % lv, wait_until='networkidle')
        page.wait_for_timeout(2600)
        i = info(page)
        ok(i['active'] and i['tilesNull'] and i['idx'] == lv - 1 and i['state'] == 'play',
           'L%d 进入街机（%s）' % (lv, i['type']), i)
        shot(page, 'v26_%02d_%s' % (lv, i['type']))

    # 2) 八种玩法的真实输入
    print('[2] 玩法输入')

    # 扫雷：→ + J 翻格
    page.goto(BASE + '?level=01', wait_until='networkidle'); page.wait_for_timeout(2200)
    before = info(page)['st']['revealed']
    page.keyboard.press('ArrowRight'); page.wait_for_timeout(120)
    page.keyboard.press('j'); page.wait_for_timeout(350)
    after = info(page)['st']['revealed']
    ok(after > before, '扫雷 J 翻开安全格', (before, after))
    shot(page, 'v26_01_mine_action')

    # 打地鼠：强制冒头 + J
    page.goto(BASE + '?level=02', wait_until='networkidle'); page.wait_for_timeout(2200)
    page.evaluate("""()=>{const d=ARCADE._state().data, h=d.holes[0];
      h.up=true;h.kind='normal';h.rise=1;h.upT=0;h.dur=5;h.cool=0;d.cur=0;}""")
    page.wait_for_timeout(150)
    page.keyboard.press('j'); page.wait_for_timeout(300)
    i = info(page)
    ok(i['st']['hits'] >= 1, '打地鼠 J 命中', i['st']['hits'])
    shot(page, 'v26_02_mole_action')

    # 点灯：J 翻转
    page.goto(BASE + '?level=03', wait_until='networkidle'); page.wait_for_timeout(2200)
    before = info(page)['st']['moves']
    page.keyboard.press('j'); page.wait_for_timeout(300)
    i = info(page)
    ok(i['st']['moves'] > before, '点灯 J 计步', (before, i['st']['moves']))
    shot(page, 'v26_03_lights_action')

    # 翻牌：J 两次
    page.goto(BASE + '?level=04', wait_until='networkidle'); page.wait_for_timeout(2200)
    page.keyboard.press('j'); page.wait_for_timeout(260)
    page.keyboard.press('ArrowRight'); page.wait_for_timeout(80)
    page.keyboard.press('j'); page.wait_for_timeout(500)
    i = info(page)
    open_cnt = page.evaluate("()=>ARCADE._state().data.cards.filter(c=>c.open||c.matched).length")
    ok(open_cnt >= 2 or i['st']['matches'] + i['st']['mistakes'] >= 1,
       '翻牌 J 翻两张', (open_cnt, i['st']['matches'], i['st']['mistakes']))
    shot(page, 'v26_04_memory_action')

    # 推箱子：↑ 推
    page.goto(BASE + '?level=05', wait_until='networkidle'); page.wait_for_timeout(2200)
    before = info(page)['st']['moves']
    page.keyboard.press('ArrowUp'); page.wait_for_timeout(250)
    i = info(page)
    ok(i['st']['moves'] > before, '推箱子 ↑ 计步', (before, i['st']['moves']))
    shot(page, 'v26_05_sokoban_action')

    # 贪吃蛇：↓ 转向 + 自动前进
    page.goto(BASE + '?level=06', wait_until='networkidle'); page.wait_for_timeout(2200)
    head0 = page.evaluate("()=>{const s=ARCADE._state().data.snake[0];return [s.x,s.y];}")
    page.keyboard.press('ArrowDown'); page.wait_for_timeout(650)
    head1 = page.evaluate("()=>{const d=ARCADE._state().data,s=d.snake[0];return [s.x,s.y,d.dir.x,d.dir.y];}")
    ok(head0 != head1[:2] or head1[2:] == [0, 1], '贪吃蛇 ↓ 转向/前进', (head0, head1))
    shot(page, 'v26_06_snake_action')

    # 编钟：等到输入阶段敲一下
    page.goto(BASE + '?level=11', wait_until='networkidle'); page.wait_for_timeout(2200)
    page.wait_for_function("()=>ARCADE._state()&&ARCADE._state().data.phase==='input'", timeout=20000)
    before = page.evaluate("()=>{const d=ARCADE._state().data;return [d.inputIdx,d.mistakes];}")
    page.keyboard.press('j'); page.wait_for_timeout(400)
    after = page.evaluate("()=>{const d=ARCADE._state().data;return [d.inputIdx,d.mistakes,d.phase];}")
    ok(after[0] > before[0] or after[1] > before[1] or after[2] != 'input', '编钟 J 输入有效', (before, after))
    shot(page, 'v26_11_simon_action')

    # 打砖块：J 发射
    page.goto(BASE + '?level=17', wait_until='networkidle'); page.wait_for_timeout(2200)
    page.keyboard.press('j'); page.wait_for_timeout(350)
    i = info(page)
    stuck = i['st']['ball']['stuck']
    ok(stuck is False, '打砖块 J 发射', stuck)
    shot(page, 'v26_17_breakout_action')

    # 3) 暂停 / 重开
    print('[3] 暂停 / 重开')
    page.keyboard.press('p'); page.wait_for_timeout(350)
    shot(page, 'v26_pause')
    page.keyboard.press('p'); page.wait_for_timeout(200)
    t0 = info(page)['time']
    page.wait_for_timeout(400)
    t1 = info(page)['time']
    ok(t1 > t0, 'P 暂停后恢复计时', (t0, t1))
    page.keyboard.press('r'); page.wait_for_timeout(300)
    i = info(page)
    ok(i['time'] < 1.0 and i['idx'] == 16, 'R 重开清零', i['time'])

    # 4) 真实通关 → 结算 → 回车下一关（L2 → L3）
    print('[4] 通关与下一关')
    page.goto(BASE + '?level=02', wait_until='networkidle'); page.wait_for_timeout(2200)
    page.evaluate("""()=>{const A=ARCADE._state(),d=A.data;d.hits=A.st.quota-1;
      const h=d.holes[0];h.up=true;h.kind='normal';h.rise=1;h.upT=0;h.dur=5;h.cool=0;d.cur=0;}""")
    page.wait_for_timeout(120)
    page.keyboard.press('j'); page.wait_for_timeout(1200)
    i = info(page)
    ok(i['state'] == 'clear', '打地鼠真实通关落 clear', i['state'])
    shot(page, 'v26_clear')
    # clearT 要 >0.8 才接受确认；上面 1.2s 里约 0.75s 是胜利演出，这里再等满
    page.wait_for_timeout(1200)
    page.keyboard.press('Enter'); page.wait_for_timeout(900)
    i = info(page)
    ok(i['active'] and i['idx'] == 2 and i['type'] == 'lights', '结算回车进入 L3 街机', (i['idx'], i['type']))
    shot(page, 'v26_next_level')

    # 4b) 街机 → Boss：L6 通关后回车进 L7 平台 Boss（ARCADE 必须让位）
    print('[4b] 街机 → Boss')
    page.goto(BASE + '?level=06', wait_until='networkidle'); page.wait_for_timeout(2200)
    page.evaluate("()=>ARCADE._forceWin(5)")
    page.wait_for_timeout(1200)
    page.keyboard.press('Enter'); page.wait_for_timeout(1000)
    i = page.evaluate("""()=>({active:!!(window.ARCADE&&ARCADE.active),
      tiles:!!(game.level&&game.level.tiles), boss:!!(game.level&&game.level.boss),
      idx:game.levelIdx, state:game.state})""")
    ok((not i['active']) and i['tiles'] and i['idx'] == 6 and i['state'] == 'play',
       'L6 通关回车进 L7 平台 Boss（街机已停）', i)
    shot(page, 'v26_to_boss')

    # 5) 失败结算（沿用同一套失败面板：挑战失败 + 原因）
    print('[5] 失败面板')
    page.evaluate("()=>ARCADE._forceFail(2)")
    page.wait_for_timeout(1400)
    i = info(page)
    ok(i['state'] == 'fail', '失败落 fail', i['state'])
    shot(page, 'v26_fail')

    # 6) 选关：MINI 角标 + 街机类型详情
    print('[6] 选关屏')
    page.keyboard.press('Escape'); page.wait_for_timeout(900)
    shot(page, 'v26_select')

    page.wait_for_timeout(300)
    print('\n页面错误：', errs if errs else '无')
    if errs:
        failures.append('页面错误 %d 条' % len(errs))
    print(('RESULT PASS' if not failures else 'RESULT FAIL') + '  failures=' + str(len(failures)))
    for f in failures:
        print('  -', f)
    b.close()
