# -*- coding: utf-8 -*-
# v6-wave1-ui 界面队 playwright 自测（工单 v6-wave1-ui §N.3；模式参照 _v5_ui_smoke.py）：
#  A. ?level=1：悬停 4 技能槽逐一——提示卡出现断言（面板深色内部像素差分，避开 _panel 1px 描边
#     整数坐标 50% 混色的抗锯齿陷阱）+ 悬停描边存在 + 截图；O 充能点内嵌（点0 暗→combo=8 亮）；
#     心形悬停卡；
#  B. hint 追加行（3.5s 窗口内/过期后同视角差分）；神龛光柱（柱列与邻列黄度差分）+ HUD 左下
#     箭头/距离；L1 技能条 6s 消失（同视角深色内部差分）；
#  C. 速降 toast：清 pq_hint_fall 重载 → Object.defineProperty 钉住玩家空中下落态（interval 方案
#     与引擎 60Hz 步进竞态，onGround 占空比 37% 会不断清零累计器——改属性钉住确定性触发）→
#     toast 出现→2.5s 消失→键='1'；
#  D. ?level=7：传送 boss.x-140（中心距 165<176 激活半径——boss.x-160 时中心距 185 不激活）→
#     Boss 条悬停卡；combo=8 注入 → O 金呼吸（外环跨帧峰值）+大提示出现一次、2.5s 消失、
#     再次注入不再弹；
#  E. 缩放悬停换算（工单 §N.4 手测项自动化）：viewport 1×/2×/非整数倍(0.83×)悬停槽 0 均命中；
#  F. 键盘回放：全程不移动鼠标完成 L1 前 10s（移动/跳/攻/冲刺/技能 U+L）零 console 错误。
# 教训（沿 v5）：play 态按 Esc=回选关，除真实谜题层外不按 Esc；getImageData 读最后一帧，呼吸类
# 动态断言必须逐帧 wait 采样；相机移动会换掉提示区背后的世界内容——所有差分断言同视角内做。
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

def dark(pg, x, y, w, h):
    """深色像素计数——提示卡面板内部 rgba(14,26,58,α) 在亮天空上不可误判"""
    return pg.evaluate("""([x, y, w, h]) => {
      const g = document.getElementById('game').getContext('2d');
      const d = g.getImageData(x, y, w, h).data; let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] < 80 && d[i+1] < 105 && d[i+2] < 150) n++;
      return n;
    }""", [x, y, w, h])

def gold(pg, x, y, w, h):
    """金色文字像素计数（#f8d048 系，实心像素对齐的字形才可靠）"""
    return pg.evaluate("""([x, y, w, h]) => {
      const g = document.getElementById('game').getContext('2d');
      const d = g.getImageData(x, y, w, h).data; let n = 0;
      for (let i = 0; i < d.length; i += 4)
        if (d[i] > 200 && d[i+1] > 150 && d[i+2] < 160) n++;
      return n;
    }""", [x, y, w, h])

def mean_rgb(pg, x, y, w, h):
    return pg.evaluate("""([x, y, w, h]) => {
      const g = document.getElementById('game').getContext('2d');
      const d = g.getImageData(x, y, w, h).data;
      let r = 0, gg = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i+1]; b += d[i+2]; n++; }
      return [r / n, gg / n, b / n];
    }""", [x, y, w, h])

def mouse_v(pg, vx, vy):
    """VIEW 坐标 → 页面 CSS 坐标移动鼠标（fitScreen 缩放换算，反向验证 §A.1 公式）"""
    bx = pg.evaluate("() => { const r = document.getElementById('game').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }")
    pg.mouse.move(bx[0] + vx * bx[2] / 384.0, bx[1] + vy * bx[3] / 224.0)

def goto_level(pg, lv):
    pg.goto(f'{BASE}?level={lv}')
    pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(900)

CARD_X = lambda i: max(4, min(162 + i * 22 - 67, 230))          # §B 容器 x 公式
CARD_TOP = lambda i: (CARD_X(i), 146, 150, 24)                  # 卡上半（顶部边框内+名+KEY 行；
                                                                # 不含 y178+ 的 hint 条与 y176+ 主角）

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={'width': 1152, 'height': 680})
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append('PAGEERROR: ' + str(e)))

    # ============ B0. hint 追加行「在」采样（hintT=3.5s 窗口内，同视角） ============
    goto_level(pg, 1)
    hint_on = gold(pg, 100, 164, 200, 14)        # 追加行 y=168..177 9px 金字

    # ============ A. L1：4 槽悬停提示卡 + 悬停描边 + O 点内嵌 + 心形卡 ============
    ok_all = True; diffs = []
    for i in range(4):
        r = CARD_TOP(i)
        d0 = dark(pg, *r)
        mouse_v(pg, 162 + i * 22 + 8, 206); pg.wait_for_timeout(250)
        d1 = dark(pg, *r)
        diffs.append(d1 - d0)
        pg.screenshot(path=str(OUT / f'a_card_slot{i}.png'))
        ok_all = ok_all and (d1 - d0) > 800
        mouse_v(pg, 5, 110); pg.wait_for_timeout(120)  # 移开
    check('A1 悬停 4 槽逐一弹出提示卡（面板深色内部差分>800）', ok_all, 'diff=' + str(diffs))
    # 悬停描边（槽 0 外环 #fff8c8）：环带亮像素差分
    mouse_v(pg, 5, 110); pg.wait_for_timeout(200)
    def ring_bright():
        return pg.evaluate("""() => {
          const g = document.getElementById('game').getContext('2d');
          const bands = [[159,195,24,3],[159,214,24,3],[159,195,3,22],[180,195,3,22]];
          let n = 0;
          for (const [x, y, w, h] of bands) {
            const d = g.getImageData(x, y, w, h).data;
            for (let i = 0; i < d.length; i += 4) if (d[i] > 185 && d[i+1] > 185) n++;
          }
          return n;
        }""")
    rb0 = ring_bright()
    mouse_v(pg, 170, 206); pg.wait_for_timeout(250)
    rb1 = ring_bright()
    check('A2 悬停描边存在（外环亮像素差分>12）', rb1 - rb0 > 12, f'{rb0}->{rb1}')
    mouse_v(pg, 5, 110); pg.wait_for_timeout(200)
    # O 充能点内嵌：槽底行点 0（206,211）暗色（combo=0）
    d0m = mean_rgb(pg, 206, 211, 2, 2)
    check('A3 O 点内嵌渲染（combo=0 点0 暗 r<130）', d0m[0] < 130, str([round(v) for v in d0m]))
    # 心形悬停卡（面板下方 y=35..54）
    hb = dark(pg, 2, 35, 130, 22)
    mouse_v(pg, 53, 23); pg.wait_for_timeout(250)
    hn = dark(pg, 2, 35, 130, 22)
    pg.screenshot(path=str(OUT / 'a_hearts_card.png'))
    check('A4 心形悬停提示卡（深色内部差分>400）', hn - hb > 400, f'{hb}->{hn}')
    mouse_v(pg, 5, 110); pg.wait_for_timeout(150)

    # ============ B1. hint 追加行过期消失（同视角差分，相机未动） ============
    pg.wait_for_timeout(400)                     # 至 ≈4.6s，hint 块整体过期
    hint_off = gold(pg, 100, 164, 200, 14)
    check('B1 hint 追加行出现且随 hint 条过期消失（金字差分>40）', hint_on - hint_off > 40, f'on={hint_on} off={hint_off}')
    # ============ B4. L1 技能条 6s 消失（同视角深色内部差分，传送前采样） ============
    bar_on = dark(pg, 84, 195, 74, 8)            # 面板内部纯行（y195..202，x<160 避开槽区）
    pg.wait_for_timeout(3600)                    # 至 ≈8.4s，skillHintT=6 过期
    bar_off = dark(pg, 84, 195, 74, 8)
    check('B4 L1 技能条 6s 后消失（深色内部差分>80）', bar_on > 80 and bar_on - bar_off > 80, f'on={bar_on} off={bar_off}')

    # ============ A5. §A.3 点技能槽施放=键盘同管线：点 U 槽 → skillUHit 入边沿 → 引擎置 CD ============
    pg.evaluate("() => { game.skills.u = 0; }")
    mouse_v(pg, 170, 206)
    pg.mouse.down(); pg.mouse.up(); pg.wait_for_timeout(300)
    ucd = pg.evaluate("() => game.skills.u")
    check('A5 点技能槽 U 施放（引擎 CD 启动 >0）', ucd > 0, f'skills.u={ucd}')
    mouse_v(pg, 5, 110); pg.wait_for_timeout(150)

    # ============ B2/B3. 传送近神龛 → 光柱 + HUD 左下指引 ============
    pg.evaluate("() => { const s = game.level.shrines[0]; game.player.x = s.x - 60; game.player.y = s.y + 8; }")
    pg.wait_for_timeout(700)                     # 相机跟随稳定
    shr = pg.evaluate("() => { const s = game.level.shrines[0]; return [s.x, s.y, game.cam.x, game.cam.y]; }")
    sx = int(shr[0] + 8 - shr[2]); sy = int(shr[1] - 30 - shr[3])   # 石碑上方 30px 起采样柱身
    col = mean_rgb(pg, sx, sy, 1, 16); nb = mean_rgb(pg, sx + 24, sy, 1, 16)
    pg.screenshot(path=str(OUT / 'b_pillar.png'))
    check('B2 神龛金光柱存在（柱列黄度 r-b 高于邻列 +12）', (col[0] - col[2]) - (nb[0] - nb[2]) > 12,
          f'pillar r-b={col[0]-col[2]:.0f} neighbor={nb[0]-nb[2]:.0f}')
    arrow = gold(pg, 4, 206, 64, 14)
    check('B3 HUD 左下指引（箭头/石碑金像素>8）', arrow > 8, f'gold={arrow}')

    # ============ C. 速降一次性 toast（清 pq_hint_fall 重载 + 属性钉住空中下落态） ============
    pg.evaluate("() => localStorage.removeItem('pq_hint_fall')")
    goto_level(pg, 1)
    tb = dark(pg, 72, 178, 240, 18)
    pg.evaluate("""() => {
      const p = game.player; window.__py = p.y;
      Object.defineProperty(p, 'onGround', { get: () => false, set: () => {}, configurable: true });
      Object.defineProperty(p, 'vy', { get: () => 200, set: () => {}, configurable: true });
      Object.defineProperty(p, 'y', { get: () => window.__py, set: () => {}, configurable: true });
    }""")
    pg.wait_for_timeout(1100)                    # 连续空中下落 >0.8s（确定性）
    tn = dark(pg, 72, 178, 240, 18)
    pg.screenshot(path=str(OUT / 'c_fall_toast.png'))
    flag = pg.evaluate("() => localStorage.getItem('pq_hint_fall')")
    pg.wait_for_timeout(2700)
    tgone = dark(pg, 72, 178, 240, 18)
    check('C1 速降 toast 触发+2.5s 消失+键写入', tn - tb > 800 and tgone < tn and flag == '1',
          f'delta={tn-tb} after2.7s={tgone} key={flag}')

    # ============ F. 键盘回放：不移动鼠标跑完 L1 前 10s ============
    goto_level(pg, 1)
    pg.keyboard.down('ArrowRight')
    for _ in range(6):                           # ≈10s：右移+跳+攻+冲刺+技能 U/L，鼠标零事件
        pg.keyboard.press('Space'); pg.wait_for_timeout(300)
        pg.keyboard.press('KeyJ'); pg.keyboard.press('KeyJ'); pg.wait_for_timeout(400)
        pg.keyboard.press('KeyU'); pg.keyboard.press('KeyL'); pg.keyboard.press('ShiftLeft'); pg.wait_for_timeout(800)
    pg.keyboard.up('ArrowRight'); pg.wait_for_timeout(500)
    st = pg.evaluate("() => ({state: game.state, dead: game.player.dead, blades: (game.blades||[]).length})")
    pg.screenshot(path=str(OUT / 'f_kbd_replay.png'))
    check('F1 键盘全程可玩 10s（play 态未死亡）', st['state'] == 'play' and not st['dead'], str(st))

    # ============ D. L7：Boss 条悬停卡 + combo 注入 O 引导 ============
    # Boss 在 windup/charge 间高速移动会污染提示区背后的世界像素；KeyP 暂停的 0.7 压暗层又会
    # 破坏像素断言（实测呼吸峰 229→74）——改用引擎 v6 bagActive 冻结位（updateWorld 顶部早退
    # engine.js:1307，无任何视觉覆盖层），世界静止而渲染/引导触发/计时全部照常。
    # L7 夜空整体深色 → 面板深色填充不可判，改断言卡内白字/横幅金字。
    goto_level(pg, 7)
    pg.evaluate("() => { game.player.x = game.boss.x - 140; game.player.y = game.boss.y; }")  # 中心距≈165<176
    pg.wait_for_timeout(2600)                    # intro 1.8s 结束
    pg.evaluate("() => { game.bagActive = true; }"); pg.wait_for_timeout(400)  # 冻结世界（渲染照常）
    frozen = pg.evaluate("() => game.bagActive")
    bs = pg.evaluate("() => game.boss.state")
    def white(pg, x, y, w, h):
        return pg.evaluate("""([x, y, w, h]) => {
          const g = document.getElementById('game').getContext('2d');
          const d = g.getImageData(x, y, w, h).data; let n = 0;
          for (let i = 0; i < d.length; i += 4) if (d[i] > 225 && d[i+1] > 225 && d[i+2] > 225) n++;
          return n;
        }""", [x, y, w, h])
    bb = white(pg, 110, 33, 150, 22)
    mouse_v(pg, 182, 22); pg.wait_for_timeout(250)
    bn = white(pg, 110, 33, 150, 22)
    pg.screenshot(path=str(OUT / 'd_bossbar_card.png'))
    check('D1 bagActive 冻结态 Boss 条可见且悬停卡出现（卡内白字差分>40）',
          bool(frozen) and bs != 'dormant' and bn - bb > 40, f'frozen={frozen} state={bs} {bb}->{bn}')
    mouse_v(pg, 5, 110); pg.wait_for_timeout(200)
    # O 金呼吸：槽 2 左外环 (205,206) 跨帧采样（呼吸周期≈0.52s）
    br = mean_rgb(pg, 205, 206, 1, 1)[0]
    ban_b = gold(pg, 72, 160, 240, 18)           # 横幅金字基线（注入前！）
    pg.evaluate("() => { game.combo = 8; }")
    peak = 0
    for _ in range(40):
        pg.wait_for_timeout(16)
        peak = max(peak, pg.evaluate("""() => {
          const g = document.getElementById('game').getContext('2d');
          const d = g.getImageData(205, 206, 1, 1).data; return d[0];
        }"""))
    d0lit = mean_rgb(pg, 206, 211, 2, 2)
    ban_a = gold(pg, 72, 160, 240, 18)
    pg.screenshot(path=str(OUT / 'd_o_banner.png'))
    check('D2 O 金呼吸（外环峰值 r>基线+30）', peak > br + 30, f'base={br:.0f} peak={peak}')
    check('D3 combo=8 O 点全亮（点0 r>180）', d0lit[0] > 180, str([round(v) for v in d0lit]))
    check('D4 大提示横幅出现一次（横幅金字差分>60）', ban_a - ban_b > 60, f'{ban_b}->{ban_a}')
    pg.wait_for_timeout(2800)                    # 2.5s+余量（oHintT 在 step() 顶部递减）
    ban_gone = gold(pg, 72, 160, 240, 18)
    check('D5 大提示 2.5s 后消失', ban_gone - ban_b < 60, f'delta={ban_gone-ban_b}')
    pg.evaluate("() => { game.combo = 0; }"); pg.wait_for_timeout(250)
    pg.evaluate("() => { game.combo = 8; }"); pg.wait_for_timeout(400)
    ban_re = gold(pg, 72, 160, 240, 18)
    check('D6 再次注入 combo 不再弹（每关一次）', ban_re - ban_b < 60, f'delta={ban_re-ban_b}')
    pg.evaluate("() => { game.combo = 0; game.bagActive = false; }")
    pg.wait_for_timeout(300)

    # ============ E. 缩放悬停换算：1× / 2× / 非整数倍 0.83×（全新 L1 静态出生视角） ============
    goto_level(pg, 1)
    pg.wait_for_timeout(4200)                    # 等 hint/技能条过期，画面稳定
    scale_ok = []; scale_detail = []
    for vw, vh, tag in [(500, 400, '1x'), (800, 500, '2x'), (320, 240, '0.83x')]:
        pg.set_viewport_size({'width': vw, 'height': vh})
        pg.wait_for_timeout(400)
        r = CARD_TOP(0)
        bb2 = dark(pg, *r)
        mouse_v(pg, 170, 206); pg.wait_for_timeout(250)
        nn2 = dark(pg, *r)
        pg.screenshot(path=str(OUT / f'e_scale_{tag}.png'))
        scale_ok.append(nn2 - bb2 > 800); scale_detail.append(f'{tag}:{nn2-bb2}')
        mouse_v(pg, 5, 110); pg.wait_for_timeout(120)
    check('E1 缩放 1×/2×/0.83× 悬停换算全部命中', all(scale_ok), ' '.join(scale_detail))

    # ============ G. §A.4 title/select 鼠标路径=hit('confirm') 等价分支 ============
    pg.goto(BASE)  # 无 ?level → title
    pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(900)
    mouse_v(pg, 192, 157)                        # 开始钮中心 (VIEW_W/2-52..+52, 146..168)
    pg.mouse.down(); pg.mouse.up(); pg.wait_for_timeout(500)
    g1 = pg.evaluate("() => !!game.level")       # title→select：尚无 level
    mouse_v(pg, 43, 58)                          # 选关卡 0 卡中心（6+0..68, 32+0..52）
    pg.mouse.down(); pg.mouse.up(); pg.wait_for_timeout(200)   # 单击=选中
    pg.mouse.down(); pg.mouse.up(); pg.wait_for_timeout(700)   # 双击=进入（0.5s 窗内）
    g2 = pg.evaluate("() => game.state === 'play' && !!game.level && game.levelIdx === 0")
    pg.screenshot(path=str(OUT / 'g_title_select.png'))
    check('G1 title 单击开始 → select 双击进 L1（R4 键盘等价路径）', (not g1) and g2, f'onSelect={not g1} entered={g2}')

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
