"""v30 实机验收：31 关选关分章（7/6/7/7/4）+ 4 个街机间奏 + 旧档迁移。
仅本地验证用（python tools/_v30_qa.py，需要 8123 静态服务器）。"""
from playwright.sync_api import sync_playwright
import pathlib, json

OUT = pathlib.Path(__file__).parent / '_shots_v30'
OUT.mkdir(exist_ok=True)
BASE = 'http://127.0.0.1:8123/index.html'
MINI = [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 14, 15, 17, 19, 22, 25, 29]
NEW = [19, 22, 25, 29]


def shot(page, name):
    page.locator('#game').screenshot(path=str(OUT / (name + '.png')))
    print('  shot', name)


def info(page):
    return page.evaluate("""()=>{
      const s=(window.ARCADE&&ARCADE.active)?ARCADE._state():null;
      return {active:!!(window.ARCADE&&ARCADE.active), idx:game.levelIdx, state:game.state,
        type:s&&s.type, hearts:s&&s.hearts, data:s&&s.data};
    }""")


with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True)
    errs = []
    failures = []

    def ok(cond, msg, extra=''):
        print(('  PASS ' if cond else '  FAIL ') + msg + ('' if cond else '  [' + str(extra) + ']'))
        if not cond:
            failures.append(msg)

    # ---------- A. 选关分章 ----------
    page = b.new_page(viewport={'width': 960, 'height': 640})
    page.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    page.on('console', lambda m: errs.append('console: ' + m.text) if m.type == 'error' else None)
    page.add_init_script("localStorage.setItem('pq_progress',JSON.stringify({unlocked:31,stars:{},unlockAll:true,v30m:1}))")
    page.goto(BASE, wait_until='networkidle')
    page.wait_for_timeout(900)
    page.keyboard.press('Enter')
    page.wait_for_timeout(900)
    print('[A] 选关分章')
    for key, name in [('1', 'ch1'), ('3', 'ch3_7cards'), ('4', 'ch4_7cards'), ('5', 'ch5_4cards')]:
        page.keyboard.press(key)
        page.wait_for_timeout(500)
        shot(page, 'menu_' + name)
    print('  menu shots done')

    # ---------- B. 18 个街机小关逐一可进入 ----------
    print('[B] 18 个小关可进入')
    seen = []
    for lv in MINI:
        page.goto(BASE + '?level=%02d' % lv, wait_until='domcontentloaded')
        page.wait_for_timeout(700)
        i = info(page)
        seen.append(i['type'])
        ok(i['active'] and i['idx'] == lv - 1 and i['state'] == 'play',
           'L%d 进入街机（%s）' % (lv, i['type']), i)
    ok(len(set(seen)) == 16 and seen.count('gold') == 2 and seen.count('dodge') == 2,
       '18 关覆盖 16 种玩法（矿脉/弹幕各 2）', seen)

    # ---------- C. 四个间奏的真实按键 ----------
    print('[C] 四个间奏真实按键')
    # L19 幽冥炮台：放一只鬼火正上方，J 命中
    page.goto(BASE + '?level=19', wait_until='domcontentloaded')
    page.wait_for_timeout(2200)
    page.evaluate("""()=>{const s=ARCADE._state(),d=s.data;
      d.spawnT=999;d.targets=[{x:192,y:80,vx:0,vy:0,r:7,kind:'wisp',t:0}];d.ang=-Math.PI/2;d.cd=0;}""")
    page.keyboard.press('j')
    page.wait_for_timeout(250)
    c = info(page)['data']
    ok(c['hits'] == 1, 'L19 J 开炮命中鬼火', c['hits'])
    shot(page, 'L19_cannon')

    # L22 回响节拍：把缩环拨进金环窗口后 J
    page.goto(BASE + '?level=22', wait_until='domcontentloaded')
    page.wait_for_timeout(2000)
    page.evaluate("""()=>{const d=ARCADE._state().data;d.bt=d.interval*0.75;d.beatHit=false;d.beatMiss=false;}""")
    page.keyboard.press('j')
    page.wait_for_timeout(200)
    r = info(page)['data']
    ok(r['hits'] == 1 and r['combo'] == 1, 'L22 金环内 J 敲响', (r['hits'], r['combo']))
    shot(page, 'L22_rhythm')

    # L25 喉中拾遗：J 放钩
    page.goto(BASE + '?level=25', wait_until='domcontentloaded')
    page.wait_for_timeout(2200)
    st0 = info(page)['data']['state']
    page.keyboard.press('j')
    page.wait_for_timeout(300)
    st1 = info(page)['data']['state']
    ok(st0 == 'swing' and st1 != 'swing', 'L25 J 放钩', (st0, st1))
    shot(page, 'L25_gold')

    # L29 镜海流星：→ 移动
    page.goto(BASE + '?level=29', wait_until='domcontentloaded')
    page.wait_for_timeout(2000)
    p0 = page.evaluate("()=>{const p=ARCADE._state().data.p;return [p.x,p.y];}")
    page.keyboard.down('ArrowRight')
    page.wait_for_timeout(500)
    page.keyboard.up('ArrowRight')
    p1 = page.evaluate("()=>{const d=ARCADE._state().data;return [d.p.x,d.p.y,d.survive,d.need];}")
    ok(p1[0] > p0[0], 'L29 → 移动', (p0, p1))
    ok(p1[2] == 45 and p1[3] == 12, 'L29 参数 45s / 12 星屑', p1[2:])
    shot(page, 'L29_dodge')

    # ---------- D. 旧档迁移 ----------
    print('[D] v29 旧档迁移')
    p2 = b.new_page(viewport={'width': 960, 'height': 640})
    p2.on('pageerror', lambda e: errs.append('pageerror(migrate): ' + str(e)))
    old = {'unlocked': 27, 'stars': {str(k): (k % 3) + 1 for k in range(18, 27)},
           'puzzles': {}, 'v5m': 1}
    p2.add_init_script("if(!sessionStorage.getItem('v30_seed')){localStorage.setItem('pq_progress',%s);"
                       "sessionStorage.setItem('v30_seed','1')}" % json.dumps(json.dumps(old)))
    p2.goto(BASE, wait_until='networkidle')
    p2.wait_for_timeout(500)
    mp = p2.evaluate("()=>JSON.parse(localStorage.getItem('pq_progress'))")
    want = ['19', '20', '22', '23', '25', '26', '27', '29', '30']
    ok(mp.get('v30m') == 1, '迁移标记 v30m=1', mp.get('v30m'))
    ok(mp.get('unlocked') == 31, 'unlocked 27 → 31', mp.get('unlocked'))
    ok(sorted(mp.get('stars', {}).keys(), key=int) == want, '星级键平移到新下标', sorted(mp.get('stars', {}).keys(), key=int))
    ok(mp['stars']['19'] == old['stars']['18'] and mp['stars']['30'] == old['stars']['26'],
       '星级值随关卡一起平移', (mp['stars']['19'], mp['stars']['30']))

    # 二次启动不重复迁移：先加一颗星，再刷新，值不变
    p2.evaluate("()=>{const p=JSON.parse(localStorage.getItem('pq_progress'));p.stars['18']=2;localStorage.setItem('pq_progress',JSON.stringify(p));}")
    p2.reload(wait_until='networkidle')
    p2.wait_for_timeout(400)
    mp2 = p2.evaluate("()=>JSON.parse(localStorage.getItem('pq_progress'))")
    ok(mp2['stars'].get('18') == 2 and mp2['stars'].get('19') == old['stars']['18'],
       'v30m 后旧键 18 不再被改写', (mp2['stars'].get('18'), mp2['stars'].get('19')))

    print('\nCONSOLE_ERRORS:', len(errs))
    for e in errs[:8]:
        print('  ', e)
    print('RESULT ' + ('FAIL' if failures or errs else 'PASS') + '  checks=' + str(len(MINI) + 12) + ' fail=' + str(len(failures)))
    b.close()
    raise SystemExit(1 if failures or errs else 0)
