# -*- coding: utf-8 -*-
# v6-wave2-bag 背包队 playwright 自测（工单 v6-wave2-bag §交付自测 2；模式参照 _v6_ui_hover_check.py）：
#  A. 迁移（H2）：注入三种旧档（v3 {unlocked,stars} / v4 +puzzles / v5 +v5m）→ 进 L1 消费一次 pickup
#     （触发 saveProgress 落盘）→ 读回断言旧键原值保留 + 新字段默认正确（equip/inv/shards/nextId）；
#     二次 reload 存档字符串逐字节一致（幂等）；pq_audio/pq_music 不动。
#  B. pickup 三选一（§6.4）：金件浮字（金字差分）/ inv 增条+nextId 递增 / 满包 12 条再拾 → shards+1（规则3）
#     / 同名再拾 → 碎片（规则1）；reload 后 inv 仍在（持久化）。
#  C. 键盘路径（H3）：B 开/关包；→+Enter 穿上（game.equip 注入断言）；Tab×2→Enter 卸；
#     C 升阶（shards 扣 3、r+1）；X 分解（+2 碎片、条目移除）；死亡演出中 B 不响应（§7.1）。
#  D. 鼠标路径（H3 全等价）：HUD 背包钮开启；双击格穿上；单击装备槽卸下；装备钮（披风双词条）；
#     升阶钮碎片不足置灰（点击无效）；关闭钮。
#  E. 世界冻结（H7）：开包 1.2s game.time 不增。
#  F. 外观合成（§F）：以已合入的真 SPR.look（art.js v6 外观队）+ 注入假 SPR.look 两路验证——
#     预览区 cape 带（cols0..6→x44..64）差分随穿/脱变化；face=-1 时 cape 带翻到右侧（朝向契约：
#     右向基准合成、heroLook 统一翻转）；delete SPR.look → 直通回基线（守卫）；
#     假件注入后经穿/脱（afterBagChange→_lookDirty）重建缓存再断言。
#  G. 碎片栏渲染冒烟（有 shards 时行文本稀有度色像素>0）。
# 教训（沿 v5/v6 波1）：浮字/合成断言全部同视角差分；pickups 注入必须处于 play 态（title 态 step()
# 不消费）；焦点选择（bagSelBag 等）为闭包私有——键盘路径按「开包默认选中格 0+方向键相对移动」驱动，
# 鼠标路径从 localStorage 反查物品格坐标；注入/删除 SPR.look 后需经一次背包变更触发 _lookDirty。
import pathlib, sys
from playwright.sync_api import sync_playwright

BASE = 'file:///C:/Users/A/.zcode/workspace/draft-6e5b5889-432a-4c7b-aabe-13a594a464ac/pixel-quest/index.html'
OUT = pathlib.Path(__file__).parent / '_v6_ui_shots'
OUT.mkdir(exist_ok=True)
errors = []
results = []

def check(name, ok, detail=''):
    results.append((name, ok, detail))
    print(('PASS ' if ok else 'FAIL ') + name + ('  | ' + detail if detail else ''))

def gold(pg, x, y, w, h):
    return pg.evaluate("""([x, y, w, h]) => {
      const g = document.getElementById('game').getContext('2d');
      const d = g.getImageData(x, y, w, h).data; let n = 0;
      for (let i = 0; i < d.length; i += 4)
        if (d[i] > 200 && d[i+1] > 150 && d[i+2] < 160) n++;
      return n;
    }""", [x, y, w, h])

def count_color(pg, x, y, w, h, cond):
    return pg.evaluate("""([x, y, w, h, cond]) => {
      const g = document.getElementById('game').getContext('2d');
      const d = g.getImageData(x, y, w, h).data; let n = 0;
      for (let i = 0; i < d.length; i += 4)
        if (eval(cond).call(null, d[i], d[i+1], d[i+2])) n++;
      return n;
    }""", [x, y, w, h, cond])

def band_sum(pg, x, y, w, h):
    return pg.evaluate("""([x, y, w, h]) => {
      const g = document.getElementById('game').getContext('2d');
      const d = g.getImageData(x, y, w, h).data; let n = 0;
      for (let i = 0; i < d.length; i += 4) n += d[i] + d[i+1] + d[i+2];
      return n;
    }""", [x, y, w, h])

RED = "((r,g,b)=>r>200&&g<70&&b<70)"       # 假 weapon 色块
MAGENTA = "((r,g,b)=>r>200&&b>200&&g<80)"  # 假 cape 色块

def mouse_v(pg, vx, vy):
    bx = pg.evaluate("() => { const r = document.getElementById('game').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }")
    pg.mouse.move(bx[0] + vx * bx[2] / 384.0, bx[1] + vy * bx[3] / 224.0)

def click_v(pg, vx, vy):
    mouse_v(pg, vx, vy)
    pg.mouse.down(); pg.mouse.up()

def goto_level(pg, lv):
    pg.goto(f'{BASE}?level={lv}')
    pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(900)

def saved(pg):
    return pg.evaluate("() => JSON.parse(localStorage.getItem('pq_progress')||'null')")

def inject_pickups(pg, evs, settle=350):
    pg.evaluate("e => { game.pickups = e; }", evs)
    pg.wait_for_timeout(settle)

def cell_xy(idx):  # 背包格 idx → 格中心 VIEW 坐标（120+col*24, 64+row*24, 22×22）
    return (120 + (idx % 4) * 24 + 11, 64 + (idx // 4) * 24 + 11)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={'width': 1152, 'height': 680})
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append('PAGEERROR: ' + str(e)))

    # ============ A. 迁移（H2）：三旧档 + 幂等 + 音频键不动 ============
    for tag, save in [
        ('v3', {'unlocked': 3, 'stars': {'0': 2}}),
        ('v4', {'unlocked': 3, 'stars': {'0': 2}, 'puzzles': {'1': True}}),
        ('v5', {'unlocked': 8, 'stars': {'0': 3}, 'v5m': 1})]:
        pg.goto(BASE); pg.wait_for_load_state('networkidle')
        pg.evaluate("s => { localStorage.setItem('pq_progress', JSON.stringify(s)); localStorage.setItem('pq_audio','1'); localStorage.setItem('pq_music','1'); }", save)
        pg.reload(); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(700)
        eq0 = pg.evaluate("() => ({equip: game.equip, cdMul: game.cdMul})")  # boot recomputeEquip 注入
        goto_level(pg, 1)                                    # play 态 step() 才消费 pickups
        inject_pickups(pg, [{'slot': 'w', 'r': 0}])          # 触发 saveProgress → 迁移字段落盘
        s = saved(pg)
        old_ok = s['unlocked'] == save['unlocked'] and s['stars'] == save['stars']
        if 'puzzles' in save: old_ok = old_ok and s['puzzles'] == save['puzzles']
        if 'v5m' in save: old_ok = old_ok and s['v5m'] == save['v5m']
        new_ok = (s.get('equip') == {'w': -1, 'h': -1, 'c': -1} and isinstance(s.get('inv'), list)
                  and s.get('shards') == {} and s.get('nextId') == 2 and len(s['inv']) == 1
                  and s['inv'][0] == {'id': 1, 'slot': 'w', 'r': 0})
        audio_ok = pg.evaluate("() => [localStorage.getItem('pq_audio'), localStorage.getItem('pq_music')].join(',')") == '1,1'
        inject_ok = eq0['equip'] == {'atk': 0, 'hp': 0, 'spd': 0, 'cd': 0} and eq0['cdMul'] == 1
        raw1 = pg.evaluate("() => localStorage.getItem('pq_progress')")
        pg.reload(); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(700)
        raw2 = pg.evaluate("() => localStorage.getItem('pq_progress')")
        check(f'A-{tag} 旧键原值保留+新字段默认正确+音频键不动+boot注入', old_ok and new_ok and audio_ok and inject_ok,
              f'old={old_ok} new={new_ok} audio={audio_ok} inject={inject_ok}')
        check(f'A-{tag} 二次 reload 幂等（存档逐字节一致）', raw1 == raw2)

    # ============ B. pickup 三选一（§6.4）+ 持久化 ============
    pg.goto(BASE); pg.wait_for_load_state('networkidle')
    pg.evaluate("() => { localStorage.removeItem('pq_progress'); }")
    goto_level(pg, 1)
    pg.wait_for_timeout(4200)  # 等 hint/技能条过期，采样区干净
    b0 = gold(pg, 120, 82, 144, 16)
    inject_pickups(pg, [{'slot': 'c', 'r': 4}])           # 金件：浮字 big 金色
    b1 = gold(pg, 120, 82, 144, 16)
    pg.screenshot(path=str(OUT / 'bag_b1_pickup_float.png'))
    s = saved(pg)
    check('B1 金件拾取浮字出现（金字差分>40）', b1 - b0 > 40, f'{b0}->{b1}')
    check('B2 入包条目+nextId 递增（规则2）', len(s['inv']) == 1 and s['inv'][0]['slot'] == 'c'
          and s['inv'][0]['r'] == 4 and s['nextId'] == 2, str(s['inv']))
    pg.reload(); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(700)
    s = saved(pg)
    check('B3 reload 后 inv 仍在（持久化 H2）', len(s['inv']) == 1 and s['inv'][0]['id'] == 1, str(s['inv']))
    goto_level(pg, 1); pg.wait_for_timeout(400)
    eleven = [{'slot': sl, 'r': r} for sl in 'whc' for r in range(4)]  # 12 互异中取 11（c4 已在包）
    eleven = [e for e in eleven if not (e['slot'] == 'c' and e['r'] == 4)]
    inject_pickups(pg, eleven)
    s = saved(pg)
    check('B4 11 互异入包 → 恰好满包 12（容量边界）', len(s['inv']) == 12 and s['nextId'] == 13,
          f"inv={len(s['inv'])} nextId={s['nextId']}")
    inject_pickups(pg, [{'slot': 'w', 'r': 4}])           # 第 13 件互异 + 满包 → 碎片保底（规则3）
    s = saved(pg)
    check('B5 满包拾取 → shards+1（规则3）', s['shards'].get('w4') == 1 and len(s['inv']) == 12, str(s['shards']))
    inject_pickups(pg, [{'slot': 'w', 'r': 2}])           # 与 inv 同名 → 碎片（规则1）
    s = saved(pg)
    check('B6 同名拾取 → 碎片+1（规则1）', s['shards'].get('w2') == 1 and len(s['inv']) == 12, str(s['shards']))

    # ============ C. 键盘路径（H3）：B/Enter/Tab/C/X + 死亡演出 B 不响应 ============
    # 此时 inv[0..11]=[c4,w0,w1,w2,w3,h0,h1,h2,h3,c0,c1,c2]（B4 顺序）
    pg.keyboard.press('KeyB'); pg.wait_for_timeout(250)
    op = pg.evaluate("() => game.bagActive")
    pg.screenshot(path=str(OUT / 'bag_c1_open.png'))
    check('C1 B 键开包（game.bagActive=true）', bool(op), f'bagActive={op}')
    t0 = pg.evaluate("() => game.time")
    pg.wait_for_timeout(1200)
    t1 = pg.evaluate("() => game.time")
    check('C2 开包 1.2s game.time 不增（世界冻结 H7）', abs(t1 - t0) < 0.001, f'{t0} -> {t1}')
    pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(150)  # 选中格 1 = w0
    pg.keyboard.press('Enter'); pg.wait_for_timeout(250)       # bag 区 Enter = 穿上
    e = pg.evaluate("() => game.equip")
    check('C3 Enter 穿上武器（equip.atk=stat.w[0]=1）', e['atk'] == 1 and e['hp'] == 0, str(e))
    inject_pickups(pg, [{'slot': 'w', 'r': 0}] * 3)            # 与穿着件同名（仍在 inv）→ shards.w0=3
    s = saved(pg)
    check('C4 穿着件同名拾取转碎片（×3）', s['shards'].get('w0') == 3, str(s['shards']))
    pg.keyboard.press('Tab'); pg.wait_for_timeout(160)     # 逐次按键（防同 step 合并）
    pg.keyboard.press('Tab'); pg.wait_for_timeout(160)     # bag→shard→equip
    pg.keyboard.press('Enter'); pg.wait_for_timeout(250)   # equip 区 Enter = 卸下（w 槽）
    e = pg.evaluate("() => game.equip")
    check('C5 Tab×2→Enter 卸下（atk 归零）', e['atk'] == 0, str(e))
    pg.keyboard.press('Tab'); pg.wait_for_timeout(160)     # equip→bag（循环 equip→bag→shard）
    pg.keyboard.press('KeyC'); pg.wait_for_timeout(250)    # 选中格仍 1（w0 r0）→ 升阶
    s = saved(pg)
    check('C6 C 键升阶（r0→1、扣 3 碎片）', s['inv'][1]['r'] == 1 and s['shards'].get('w0') == 0
          and len(s['inv']) == 12, f"r={s['inv'][1]['r']} shards={s['shards']}")
    pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(160)  # 选中格 2 = w1（未装备）
    pg.keyboard.press('KeyX'); pg.wait_for_timeout(250)        # 分解 w1
    s = saved(pg)
    check('C7 X 键分解（-1 条、+2 碎片）', s['shards'].get('w1') == 2 and len(s['inv']) == 11,
          f"shards={s['shards']} inv={len(s['inv'])}")
    pg.keyboard.press('KeyB'); pg.wait_for_timeout(200)
    cl = pg.evaluate("() => game.bagActive")
    check('C8 B 键关包', cl is False, f'bagActive={cl}')
    # G. 碎片栏渲染冒烟（shards 非空）：重开包采样碎片栏区稀有度色文字（w4 神话行 EQ_COLOR[4]）
    pg.keyboard.press('KeyB'); pg.wait_for_timeout(300)
    gsh = gold(pg, 224, 24, 128, 110)
    pg.screenshot(path=str(OUT / 'bag_g_shards.png'))
    check('G1 碎片栏行渲染（稀有度色文字像素>12）', gsh > 12, f'gold={gsh}')
    pg.keyboard.press('KeyB'); pg.wait_for_timeout(200)
    pg.evaluate("() => killPlayer()"); pg.wait_for_timeout(300)
    pg.keyboard.press('KeyB'); pg.wait_for_timeout(250)
    dd = pg.evaluate("() => ({bag: game.bagActive, dead: game.player.dead})")
    check('C9 死亡演出中 B 不响应（§7.1）', (not dd['bag']) and dd['dead'], str(dd))

    # ============ D. 鼠标路径（H3 全等价）============
    goto_level(pg, 1); pg.wait_for_timeout(600)
    click_v(pg, 258, 206)                                  # HUD 背包钮 (250,198,16,16) 中心
    pg.wait_for_timeout(250)
    op = pg.evaluate("() => game.bagActive")
    check('D1 HUD 背包钮点击开启', bool(op), f'bagActive={op}')
    def inv_idx(pg, slot, r):
        s = saved(pg)
        for i, it in enumerate(s['inv']):
            if it['slot'] == slot and it['r'] == r: return i
        return -1
    # 双击 w2 格穿上（C6 后 w0=r1 仍占 w 槽？否——C5 已卸下 w0；w 槽空）
    iw2 = inv_idx(pg, 'w', 2)
    cx, cy = cell_xy(iw2)
    click_v(pg, cx, cy); pg.wait_for_timeout(120)
    click_v(pg, cx, cy); pg.wait_for_timeout(250)          # 0.5s 内二击=双击装备
    e = pg.evaluate("() => game.equip")
    check('D2 双击格穿上（atk=stat.w[2]=3）', e['atk'] == 3, str(e))
    click_v(pg, 132, 36); pg.wait_for_timeout(250)         # 单击 w 装备槽 (120..144,24..48) = 卸下
    e = pg.evaluate("() => game.equip")
    check('D3 单击装备槽卸下（atk 归零）', e['atk'] == 0, str(e))
    ic0 = inv_idx(pg, 'c', 0)
    cx, cy = cell_xy(ic0)
    click_v(pg, cx, cy); pg.wait_for_timeout(120)          # 单击选中 c0
    click_v(pg, 318, 157); pg.wait_for_timeout(250)        # 点「装备」钮 (300,150,36,14)
    e = pg.evaluate("() => game.equip")
    check('D4 装备钮穿上披风（spd=cd=4%）', abs(e['spd'] - 0.04) < 1e-9 and abs(e['cd'] - 0.04) < 1e-9, str(e))
    s0 = saved(pg)['inv'][ic0]['r']
    click_v(pg, 318, 189); pg.wait_for_timeout(250)        # 点「升阶」钮（shards.c0=0 → 置灰）
    s1 = saved(pg)['inv'][ic0]['r']
    check('D5 升阶钮碎片不足置灰（点击无效）', s0 == s1 == 0, f'{s0}->{s1}')
    click_v(pg, 349, 15); pg.wait_for_timeout(250)         # 点关闭钮 (344,10,10×10)
    cl = pg.evaluate("() => game.bagActive")
    check('D6 关闭钮关包', cl is False, f'bagActive={cl}')
    pg.screenshot(path=str(OUT / 'bag_d_closed.png'))

    # ============ F. 外观合成（§F）：真 SPR.look（已合入）+ 假注入两路 ============
    # 装备槽中心：w(132,36) h(160,36) c(188,36)；空槽卸下早退不触发 _lookDirty——重建一律用真实变更
    goto_level(pg, 1); pg.wait_for_timeout(400)
    pg.keyboard.press('KeyB'); pg.wait_for_timeout(300)    # 开包（此时 c0 披风穿着中）
    click_v(pg, 188, 36); pg.wait_for_timeout(250)         # 单击 c 装备槽 → 卸下 c0
    e = pg.evaluate("() => game.equip")
    base_l = band_sum(pg, 44, 24, 21, 48)                  # cape 带（cols0..6 → 预览 x44..64）
    base_r = band_sum(pg, 71, 24, 21, 48)                  # 翻转 cape 带（x71..92）
    base_all = band_sum(pg, 44, 24, 48, 48)
    check('F0 卸下全部后 game.equip 清零', e['atk'] == 0 and e['hp'] == 0 and e['spd'] == 0 and e['cd'] == 0, str(e))
    ic0 = inv_idx(pg, 'c', 0)
    cx, cy = cell_xy(ic0)
    click_v(pg, cx, cy); pg.wait_for_timeout(120)
    click_v(pg, cx, cy); pg.wait_for_timeout(300)          # 双击穿 c0（真 cape）→ _lookDirty 重建
    l1 = band_sum(pg, 44, 24, 21, 48); r1 = band_sum(pg, 71, 24, 21, 48)
    pg.screenshot(path=str(OUT / 'bag_f1_cape_real.png'))
    check('F1 穿真 cape 后预览 cape 带变化（合成层生效）', abs(l1 - base_l) + abs(r1 - base_r) > 2000,
          f'dL={l1-base_l} dR={r1-base_r}')
    check('F2 face=1 时真 cape 带偏左（右向基准合成）', l1 - base_l > r1 - base_r, f'L={l1-base_l} R={r1-base_r}')
    pg.evaluate("() => { game.player.face = -1; }"); pg.wait_for_timeout(300)
    l2 = band_sum(pg, 44, 24, 21, 48); r2 = band_sum(pg, 71, 24, 21, 48)
    pg.screenshot(path=str(OUT / 'bag_f2_faceL_real.png'))
    check('F3 face=-1 时 cape 带翻到右（heroLook 统一翻转）', r2 - base_r > l2 - base_l, f'L={l2-base_l} R={r2-base_r}')
    pg.evaluate("() => { game.player.face = 1; }"); pg.wait_for_timeout(150)
    pg.evaluate("() => { delete SPR.look; }")              # 守卫路：SPR.look 缺失 → lookEq 全 -1 → 直通
    pg.wait_for_timeout(300)
    l3 = band_sum(pg, 44, 24, 48, 48)
    check('F4 delete SPR.look → 预览回无装备基线（守卫直通零回归）', abs(l3 - base_all) < 600, f'dAll={l3-base_all}')
    # 假件注入路（可控颜色）：注入后经真实穿/脱（_lookDirty）重建缓存再断言
    pg.evaluate("""() => {
      const mk = (paint) => { const c = document.createElement('canvas'); c.width = 16; c.height = 16;
        const g = c.getContext('2d'); paint(g); return c; };
      SPR.look = {
        weapon: [0,1,2].map(i => mk(g => { g.fillStyle='#ff2020'; g.fillRect(10,7,6,9); })),
        hat:    [0,1,2].map(i => mk(g => { g.fillStyle='#20ff20'; g.fillRect(4,0,8,5); })),
        cape:   [0,1,2].map(i => mk(g => { g.fillStyle='#ff00ff'; g.fillRect(0,5,7,11); }))
      };
    }""")
    click_v(pg, 188, 36); pg.wait_for_timeout(250)         # 单击 c 槽卸下 c0（真实变更）→ _lookDirty 重建（无 cape）
    cx, cy = cell_xy(inv_idx(pg, 'c', 0))
    click_v(pg, cx, cy); pg.wait_for_timeout(120)
    click_v(pg, cx, cy); pg.wait_for_timeout(300)          # 双击再穿 c0 → 重建（假 cape）→ 品红
    mag_l = count_color(pg, 44, 24, 21, 48, MAGENTA)
    mag_r = count_color(pg, 71, 24, 21, 48, MAGENTA)
    pg.screenshot(path=str(OUT / 'bag_f5_cape_fake.png'))
    check('F5 假 cape 注入+重建后品红块出现（_lookDirty 缓存失效）', mag_l > 60, f'L={mag_l} R={mag_r}')
    iw1 = inv_idx(pg, 'w', 1)
    cx, cy = cell_xy(iw1)
    click_v(pg, cx, cy); pg.wait_for_timeout(120)
    click_v(pg, cx, cy); pg.wait_for_timeout(300)          # 双击穿 w1 → 红块
    red = count_color(pg, 44, 24, 48, 48, RED)
    pg.screenshot(path=str(OUT / 'bag_f6_weapon_fake.png'))
    check('F6 穿假 weapon 后红色块出现', red > 40, f'red={red}')
    click_v(pg, 132, 36); pg.wait_for_timeout(300)         # 单击 w 槽卸下 → 红块消失
    red2 = count_color(pg, 44, 24, 48, 48, RED)
    check('F7 卸下后红块消失（合成交互闭环）', red2 < 5, f'off={red2}')
    pg.keyboard.press('KeyB'); pg.wait_for_timeout(200)

    b.close()

# ---------- 汇总 ----------
fails = [r for r in results if not r[1]]
print()
print('CONSOLE_ERRORS:', len(errors))
for e in errors[:8]:
    print(' -', e[:240])
if fails:
    print('FAILED_CHECKS:', len(fails))
    sys.exit(1)
print('ALL_CHECKS_PASS')
