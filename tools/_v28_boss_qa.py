"""v28 第五章三 Boss 实机验收：招牌技能 / 三套底层机制 / 新实体绘制 / 选关第五章。
仅本地验证用（python tools/_v28_boss_qa.py，需要 8123 静态服务器）。
"""
from playwright.sync_api import sync_playwright
import pathlib

OUT = pathlib.Path(__file__).parent / '_shots'
OUT.mkdir(exist_ok=True)
BASE = 'http://localhost:8123/index.html'


def snap(page):
    return page.evaluate("""()=>({
      st: game.boss && game.boss.state, nx: game.boss && game.boss.next,
      hp: game.boss && game.boss.hp, hpT: game.boss && game.boss.hpTotal,
      ph: game.boss && game.boss.phase,
      gz: game.boss ? +(game.boss.gaze || 0).toFixed(2) : null,
      bs: game.boss ? (game.boss.beatStreak || 0) : null,
      bT: game.boss ? +(game.boss.beatT || 0).toFixed(3) : null,
      br: game.boss ? +(game.boss.breakT || 0).toFixed(2) : null,
      sh: game.hazards.filter(h => h.kind === 'shard').length,
      cols: game.hazards.filter(h => h.kind === 'column').length,
      walls: game.hazards.filter(h => h.kind === 'shardwall').length,
      beams: game.hazards.filter(h => h.kind === 'sweepbeam').length,
      spikes: game.hazards.filter(h => h.kind === 'spike').length,
      mets: game.hazards.filter(h => h.kind === 'meteor').length,
      note: game.bullets.filter(b => b.note).length,
      pink: game.bullets.filter(b => b.pink).length,
      php: game.player && game.player.hp,
      bscreen: game.boss ? [(game.boss.x + game.boss.w / 2 - game.cam.x) * 2,
                            (game.boss.y + game.boss.h / 2 - game.cam.y) * 2] : null
    })""")


def shot(page, name, zoom=True, box=(300, 250)):
    """canvas 截图；zoom=True 时以 Boss 屏幕位置为中心裁一块 576x560 CSS 再 1.5x 放大。"""
    path = OUT / (name + '.png')
    page.locator('#game').screenshot(path=str(path))
    if zoom:
        i = snap(page)
        bs = i.get('bscreen')
        if not bs:
            return
        from PIL import Image
        im = Image.open(path)
        W, H = im.size
        bw, bh = box
        x0 = int(bs[0] - bw / 2); y0 = int(bs[1] - bh / 2)
        x0 = max(0, min(x0, W - bw)); y0 = max(0, min(y0, H - bh))
        crop = im.crop((x0, y0, x0 + bw, y0 + bh)).resize((int(bw * 1.5), int(bh * 1.5)), Image.NEAREST)
        crop.save(OUT / (name + '_zoom.png'))
    print('  shot', name)


def force(page, mv, phase=1, dx=150, keep_shards=True):
    page.evaluate("""({mv, phase, dx, keep}) => {
      const b = game.boss, p = game.player;
      b.state = 'windup'; b.next = mv; b.t = 0; b.fireN = 0;
      b.phase = phase || 1; b.comboQ = []; b.comboN = 0; b.vx = 0; b.breakT = 0;
      if (b.kind === 14) b.gaze = 0;
      game.bullets.length = 0;
      for (let i = game.hazards.length - 1; i >= 0; i--) {
        const k = game.hazards[i].kind;
        if (k === 'shard' && keep) continue;
        game.hazards.splice(i, 1);
      }
      p.hp = 99; p.invT = 0; p.vx = 0; p.vy = 0; p.onGround = true; p.dashT = 0;
      p.x = Math.max(40, Math.min(b.x - (dx || 150), b.x + b.w));
      p.y = b.y + b.h - p.h;
    }""", {'mv': mv, 'phase': phase, 'dx': dx, 'keep': keep_shards})


def wait_state(page, name, timeout=6000):
    page.wait_for_function("s => game.boss && game.boss.state === s", arg=name, timeout=timeout)


with sync_playwright() as pw:
    br = pw.chromium.launch(headless=True)
    page = br.new_page(viewport={'width': 960, 'height': 640})
    errs = []
    page.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    page.on('console', lambda m: errs.append('console: ' + m.text) if m.type == 'error' else None)
    failures = []

    def ok(cond, msg, extra=''):
        print(('  PASS ' if cond else '  FAIL ') + msg + ('' if cond else '  [' + str(extra) + ']'))
        if not cond:
            failures.append(msg)

    def activate(lv, dx=150):
        page.goto(BASE + '?level=%02d' % lv, wait_until='networkidle')
        page.wait_for_function("() => window.game && game.state === 'play' && game.boss", timeout=10000)
        page.wait_for_timeout(150)
        page.evaluate("""(dx) => {
          const b = game.boss, p = game.player;
          p.x = Math.max(40, b.x - dx); p.y = b.y + b.h - p.h;
          p.vx = 0; p.vy = 0; p.onGround = true; p.hp = 99; p.invT = 0;
        }""", dx)
        page.wait_for_timeout(250)
        i = snap(page)
        shot(page, 'v28_%d_intro' % lv, box=(320, 280))
        wait_state(page, 'idle', 12000)

    # ================= L25 律动（kind12） =================
    print('[1] L25 律动·俄耳甫斯（kind12）')
    activate(25)
    i = snap(page)
    ok(i['hpT'] == 600, 'L25 血量 600', i)
    shot(page, 'v28_25_idle')

    # 节拍器机制：合拍 ×2 / 踏空 ×0.7 / 四连断拍破防（直接走唯一承伤入口）
    beat = page.evaluate("""() => {
      const b = game.boss, out = {};
      b.state = 'idle'; b.breakT = 0; b.beatStreak = 0; b.beatT = 0;
      let hp = b.hp; _engBossHurt(10); out.good = hp - b.hp; out.s1 = b.beatStreak;
      b.beatT = 0.5; hp = b.hp; _engBossHurt(10); out.off = hp - b.hp; out.s2 = b.beatStreak;
      b.beatStreak = 0; b.state = 'idle'; b.breakT = 0;
      for (let k = 0; k < 4; k++) { b.beatT = 0; _engBossHurt(10); }
      out.st = b.state; out.br = b.breakT;
      return out;
    }""")
    ok(beat['good'] == 20 and beat['s1'] == 1, '合拍 ×2（10 → 20）', beat)
    ok(beat['off'] == 7 and beat['s2'] == 0, '踏空 ×0.7（10 → 7）且清连拍', beat)
    ok(beat['st'] == 'stagger' and beat['br'] >= 2.0, '四连合拍 → 断拍破防', beat)

    # staccato：4 枚音符追踪
    force(page, 'staccato', dx=190)
    page.wait_for_timeout(230)
    shot(page, 'v28_25_staccato_windup')
    wait_state(page, 'staccatoCast')
    page.wait_for_timeout(260)
    shot(page, 'v28_25_staccato_cast')
    page.wait_for_timeout(320)
    i = snap(page)
    ok(i['note'] >= 3, '断奏 ≥3 枚音符在飞（4 发）', i['note'])

    # tutti：两轮 12 向环弹
    force(page, 'tutti', dx=190)
    wait_state(page, 'tuttiCast')
    page.wait_for_timeout(780)
    shot(page, 'v28_25_tutti_cast')
    i = snap(page)
    ok(i['note'] >= 12, '全奏两轮 ≥12 枚环弹（每轮留缝）', i['note'])

    # fermata：三根金色光柱 + 站中间掉 2 心
    force(page, 'fermata', dx=140)
    wait_state(page, 'fermataCast')
    page.wait_for_timeout(260)
    i = snap(page)
    ok(i['cols'] == 3, '延长音柱三根', i)
    shot(page, 'v28_25_fermata_warn')
    page.wait_for_timeout(620)
    i = snap(page)
    ok(i['php'] <= 97, '站在音柱里被夹掉 2 心', i['php'])
    shot(page, 'v28_25_fermata_active')

    # ================= L26 镜渊（kind13） =================
    print('[2] L26 镜渊·无相（kind13）')
    activate(26)
    i = snap(page)
    ok(i['hpT'] == 570 and i['sh'] == 3, 'L26 血量 570 + 登场三枚镜片', i)
    shot(page, 'v28_26_idle')

    # 镜片承伤：三片 20% / 两片 35% / 全碎破防 + 5% 固定扣血 + 16s 再生
    sh = page.evaluate("""() => {
      const b = game.boss, out = {};
      b.state = 'idle'; b.breakT = 0;
      out.sh0 = game.hazards.filter(h => h.kind === 'shard').length;
      let hp = b.hp; _engBossHurt(100); out.d3 = hp - b.hp;
      _engShatterShard(b);
      out.sh1 = game.hazards.filter(h => h.kind === 'shard').length;
      hp = b.hp; b.breakT = 0; b.state = 'idle'; _engBossHurt(100); out.d2 = hp - b.hp;
      _engShatterShard(b); _engShatterShard(b);
      out.shEnd = game.hazards.filter(h => h.kind === 'shard').length;
      return out;
    }""")
    ok(sh['d3'] == 20 and sh['d2'] == 35, '镜壁减伤 20% → 35%', sh)
    ok(sh['sh1'] == 2 and sh['shEnd'] == 0, '冲刺/攻击逐片碎镜', sh)
    page.wait_for_timeout(180)
    i = snap(page)
    ok(i['st'] == 'stagger' and i['br'] > 1.5, '三片全碎 → 破防窗口', i)
    page.evaluate("() => { game.boss.shardT = 0.01; }")
    page.wait_for_timeout(320)
    i = snap(page)
    ok(i['sh'] == 3, '16s 再生（加速验证）重铸三片', i['sh'])

    # prism：两轮粉色扇弹
    force(page, 'prism', dx=190)
    wait_state(page, 'prismCast')
    page.wait_for_timeout(420)
    shot(page, 'v28_26_prism_cast')
    i = snap(page)
    ok(i['pink'] >= 8, '棱镜散射两轮 ≥8 枚粉弹', i['pink'])

    # rain：粉色镜雨
    force(page, 'rain', dx=190)
    wait_state(page, 'rainCast')
    page.wait_for_timeout(360)
    shot(page, 'v28_26_rain_cast')
    i = snap(page)
    ok(i['pink'] >= 3, '镜雨 ≥3 枚粉弹下落', i['pink'])

    # march：镜墙 + 冲刺穿墙碎一片
    force(page, 'march', dx=170)
    wait_state(page, 'marchCast')
    page.wait_for_timeout(350)
    i = snap(page)
    ok(i['walls'] == 1, '镜墙推进已生成', i)
    shot(page, 'v28_26_march_warn')
    before = snap(page)
    dashres = page.evaluate("""() => {
      const h = game.hazards.find(e => e.kind === 'shardwall');
      if (!h) return { ok: false };
      h.warnT = 0.001;
      const p = game.player;
      p.x = h.x + h.w / 2 - p.w / 2; p.y = h.y + h.h - p.h;
      p.dashT = 0.25; p.invT = 0.4;
      return { ok: true };
    }""")
    page.wait_for_timeout(220)
    i = snap(page)
    ok(dashres['ok'] and i['sh'] < before['sh'], '冲刺穿镜墙碎镜（至少一片）', (before['sh'], i['sh']))
    shot(page, 'v28_26_march_shatter')

    # ================= L27 终焉（kind14） =================
    print('[3] L27 终焉·阿刻戎（kind14）')
    activate(27)
    i = snap(page)
    ok(i['hpT'] == 660, 'L27 血量 660', i['hpT'])
    shot(page, 'v28_27_idle')

    # 凝视槽：站定上涨 / 移动回落
    g0 = page.evaluate("""() => { const b = game.boss, p = game.player;
      b.state = 'idle'; b.gaze = 10; p.vx = 0; p.vy = 0; p.dashT = 0; p.onGround = true;
      return b.gaze; }""")
    page.wait_for_timeout(420)
    g1 = snap(page)['gz']
    page.keyboard.down('ArrowRight'); page.wait_for_timeout(420); page.keyboard.up('ArrowRight')
    g2 = snap(page)['gz']
    ok(g1 > g0 + 2, '站定凝视槽上涨', (g0, g1))
    ok(g2 < g1, '移动凝视槽回落', (g1, g2))

    # 满槽强制 stare（不打断其它大招，只在 idle/recover 触发）
    page.evaluate("""() => { const b = game.boss, p = game.player;
      b.state = 'idle'; b.gaze = 99.9; b.comboQ = []; b.comboN = 0;
      p.vx = 0; p.vy = 0; p.onGround = true; p.dashT = 0; p.invT = 0; p.hp = 99; }""")
    page.wait_for_function("() => game.boss.state === 'windup' && game.boss.next === 'stare'", timeout=2000)
    page.wait_for_timeout(100)
    i = snap(page)
    ok(i['st'] == 'windup' and i['nx'] == 'stare', '凝视满槽强制起手 stare', i)
    shot(page, 'v28_27_gaze_windup')

    # stare P2 三根青柱 + 掉血
    force(page, 'stare', phase=2, dx=140)
    wait_state(page, 'stareCast')
    page.wait_for_timeout(650)
    i = snap(page)
    ok(i['cols'] == 3, 'P2 石化凝视三根光柱', i)
    shot(page, 'v28_27_stare_warn')
    page.wait_for_timeout(450)
    i = snap(page)
    ok(i['php'] <= 97, '站进青柱掉 2 心', i['php'])
    shot(page, 'v28_27_stare_active')

    # focus：光带慢速追人
    force(page, 'focus', dx=190)
    wait_state(page, 'focusCast')
    page.wait_for_function("() => game.hazards.some(h => h.kind === 'sweepbeam')", timeout=3000)
    x0 = page.evaluate("() => game.hazards.find(h => h.kind === 'sweepbeam').x")
    page.wait_for_timeout(900)
    i = snap(page)
    x1 = page.evaluate("() => { const h = game.hazards.find(e => e.kind === 'sweepbeam'); return h ? h.x : -1; }")
    ok(i['beams'] == 1 and x1 < x0 - 8, '贯目之光追着玩家左移', (x0, x1))
    shot(page, 'v28_27_focus_active')

    # fracture：四根石牙依次冒出
    force(page, 'fracture', dx=140)
    wait_state(page, 'fractureCast')
    page.wait_for_timeout(480)
    i = snap(page)
    ok(i['spikes'] >= 3, '裂界石牙依次冒出（≥3/4）', i)
    shot(page, 'v28_27_fracture')

    # rain：五颗陨石带青色预警圈
    force(page, 'rain', dx=140)
    wait_state(page, 'rainCast')
    page.wait_for_timeout(420)
    i = snap(page)
    ok(i['mets'] >= 4, '陨石雨 ≥4 颗落点', i)
    shot(page, 'v28_27_rain')

    # ================= 选关屏：五章签 + 第五章三卡 =================
    print('[4] 选关屏第五章')
    page.keyboard.press('Escape')
    page.wait_for_timeout(700)
    n = page.evaluate("() => ALL_LEVELS.length")
    ok(n == 27, 'ALL_LEVELS 27 关', n)
    page.keyboard.press('Digit5')
    page.wait_for_timeout(450)
    shot(page, 'v28_select_ch5', zoom=False)
    page.keyboard.press('ArrowRight'); page.wait_for_timeout(200)
    page.keyboard.press('ArrowRight'); page.wait_for_timeout(350)
    shot(page, 'v28_select_ch5_card3', zoom=False)
    page.wait_for_timeout(200)
    print('\n页面错误：', errs if errs else '无')
    if errs:
        failures.append('页面错误 %d 条' % len(errs))
    print(('RESULT PASS' if not failures else 'RESULT FAIL') + '  failures=' + str(len(failures)))
    for f in failures:
        print('  -', f)
    br.close()
