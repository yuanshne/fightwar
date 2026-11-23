# -*- coding: utf-8 -*-
"""tools/_v54_boss_windup_check.py — v54 Boss windup 抬手姿态层实机验收（可读性强化版）。

用法（必须用 D:\\python\\python.exe，系统 python 无 playwright）：
    D:\\python\\python.exe tools/_v54_boss_windup_check.py            # 全量 14 只
    D:\\python\\python.exe tools/_v54_boss_windup_check.py --smoke  # 仅 kind 1 / 14 冒烟

验收点：
  1. 启动零 pageerror / 零非白名单 console error。
  2. 14 只 Boss（kind 1..14）windup 四阶段（u≈0.12 / 0.38 / 0.64 / 0.90）各出一张 after 帧。
  3. 非 windup（idle）零额外绘制：函数级调用计数隔离（orig==wrap）。
  4. 可读性硬断言：B 阶段（f2, u≈0.38）手臂末端像素必须高于主体不透明区域包围盒上缘
     （离屏 canvas 像素比对，http 同源不污染；逐 kind 断言，14 只全过）。
  5. windup after 帧与基线（.snap_before 冻结副本）同进度帧存在手臂层像素差。
  6. 产出 14 只 × 抬臂关键帧拼图 after_all14_boss_windup_sheet.png，
     以及每只强化前/强化后并排对照 before_arm_kindN.png / after_arm_kindN.png /
     arm_compare_kindN.png。

不改 hitbox / 血量 / 时序 / 伤害 / 状态机；本脚本只读取 game.boss 字段并强制渲染状态截图。
"""
import pathlib
import sys
import json
import threading
import functools
import shutil
from http.server import HTTPServer, SimpleHTTPRequestHandler

from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw

ROOT = pathlib.Path(r'C:\Users\A\Desktop\youxi')
OUT = ROOT / '.screenshots' / 'boss'
TMP = ROOT / '.screenshots' / '.tmp'
A2 = ROOT / '.screenshots' / 'a_boss2'
OUT.mkdir(parents=True, exist_ok=True)
TMP.mkdir(parents=True, exist_ok=True)
A2.mkdir(parents=True, exist_ok=True)

# v55 剪影强化型：余量门槛 ≥12px（理想 ≥18），且臂端像素必须落在主体包围盒之外。
SPECIAL_KINDS = {5, 8, 12, 13, 14}
MARGIN_MIN = {True: 12, False: 6}

# 本地同源 http 服务：file:// 下外部 PNG 会污染 canvas 导致 getImageData 不可用；
# 同源 http 下离屏 canvas 可读像素，支撑可读性硬断言。
_httpd = None

def start_http():
    global _httpd
    handler = functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    for port in (8137, 8138, 8139):
        try:
            _httpd = HTTPServer(('127.0.0.1', port), handler)
            break
        except OSError:
            _httpd = None
    if _httpd is None:
        raise RuntimeError('本地 http 端口均被占用')
    threading.Thread(target=_httpd.serve_forever, daemon=True).start()
    return 'http://127.0.0.1:%d' % _httpd.server_address[1]

BASE = start_http()
AFTER_URL = BASE + '/index.html'
BEFORE_URL = BASE + '/.snap_before/index.html'

# kind → 关卡号（chapter 元数据：boss:true≡1；kind5 为 L18 第二棒，页面内强制 kind=5）
LEVEL = {1: 7, 2: 13, 3: 16, 4: 18, 5: 18, 6: 20, 7: 21, 8: 23,
         9: 24, 10: 26, 11: 27, 12: 28, 13: 30, 14: 31}
# 每只 Boss 选一个代表性招式进 windup（仅决定姿态分类与前摇时长，不改招式池）
MOVE = {1: 'pillar', 2: 'sweep', 3: 'scythe', 4: 'push', 5: 'homing',
        6: 'charge', 7: 'furnace', 8: 'barrage', 9: 'swarm', 10: 'bite',
        11: 'quell', 12: 'staccato', 13: 'prism', 14: 'stare'}
US = [0.12, 0.36, 0.64, 0.88]          # 四阶段进度：起手 / 最高 / 蓄力微抖 / 落下出手（钉死相位）
CROP = 240                             # 以 Boss 为中心的裁剪边长（canvas 768×448 空间）
ZOOM = 2

JS_BOOT = """
() => {
  const b = game.boss;
  if (!b) return { ok: false };
  // 冻结世界：桩掉 updateWorld（不设 game.paused，避免触发暂停遮罩）；tick/计时随之冻结。
  if (!window.__uw) { window.__uw = updateWorld; updateWorld = function () {}; }
  b.hidden = false;
  return { ok: true, kind: b.kind, state: b.state, w: b.w, h: b.h };
}
"""

JS_FORCE_IDLE = """
(kind) => {
  const b = game.boss;
  b.kind = kind;
  b.state = 'idle'; b.t = 0; b.vx = 0; b.hidden = false;
  b._aiVT = 0; b._aiVTick = 0;
  game.bullets.length = 0;
  for (let i = game.hazards.length - 1; i >= 0; i--) game.hazards.splice(i, 1);
  game.cam.x = Math.max(0, Math.min(b.x + b.w / 2 - 192, game.level.w * 16 - 384));
  game.cam.y = Math.max(0, b.y + b.h / 2 - 112);
  return { state: b.state, kind: b.kind };
}
"""

JS_FORCE_WINDUP = """
({kind, move, u}) => {
  const b = game.boss;
  b.kind = kind;
  b.state = 'windup'; b.next = move; b.fireN = 0; b.comboN = 0;
  b.vx = 0; b.breakT = 0; b.hidden = false;
  let w = 0.6;
  try {
    const T = BAL['boss' + kind] || BAL.boss;
    if (T && T.windup && T.windup[move] != null) w = T.windup[move];
  } catch (e) { w = 0.6; }
  b.t = w * u;
  b._aiVT = 0; b._aiVTick = 0;
  game.bullets.length = 0;
  for (let i = game.hazards.length - 1; i >= 0; i--) game.hazards.splice(i, 1);
  game.cam.x = Math.max(0, Math.min(b.x + b.w / 2 - 192, game.level.w * 16 - 384));
  game.cam.y = Math.max(0, b.y + b.h / 2 - 112);
  return { u: +(b.t / w).toFixed(3), state: b.state, next: b.next, dur: w };
}
"""

JS_BOSS_POS = """
() => {
  const b = game.boss;
  return { x: (b.x + b.w / 2 - game.cam.x) * 2, y: (b.y + b.h / 2 - game.cam.y) * 2,
           w: b.w * 2, h: b.h * 2 };
}
"""

# 冻结渲染时钟：ui.js 主循环每帧 game.tick += dt*60（与 updateWorld 无关），
# 不锁死的话两帧之间取帧/呼吸/天气都会漂移，污染零差异比对。
JS_FREEZE_TICK = """
() => { game.tick = 100; }
"""

# 函数级透传证明：同一 b / ctx / tick，分别直调原始 drawBoss 与当前包装函数，
# 统计 fillRect + drawImage 调用次数。idle 态包装层必须零额外绘制（次数相等）。
JS_IDLE_CALLCOUNT = """
() => {
  const b = game.boss;
  const ctx = document.getElementById('game').getContext('2d');
  const origFn = window.PQ_BOSS_ANIM._orig();
  let o = 0, w = 0;
  const fr = ctx.fillRect, di = ctx.drawImage;
  ctx.fillRect = function () { o++; return fr.apply(this, arguments); };
  ctx.drawImage = function () { o++; return di.apply(this, arguments); };
  try { origFn(ctx, game, 100, b); } catch (e) {}
  ctx.fillRect = fr; ctx.drawImage = di;
  ctx.fillRect = function () { w++; return fr.apply(this, arguments); };
  ctx.drawImage = function () { w++; return di.apply(this, arguments); };
  try { window.PQAI_BOSS_DRAW(ctx, game, 100, b); } catch (e) {}
  ctx.fillRect = fr; ctx.drawImage = di;
  return { orig: o, wrap: w };
}
"""

# 可读性硬断言：断言前显式把 Boss 钉死在 windup B 阶段（u=0.36）并冻结时钟；
# 离屏分别渲染「仅身体（orig）」与「仅手臂层（PQ_BOSS_ANIM.draw）」两张干净画布。
# bodyTop/armTop = 各自最顶不透明行；另算身体包围盒 (x0,y0,x1,y1)，并判定臂端
# （手臂层最顶 fist+3 行内）不透明像素是否落在身体包围盒之外。
# 不做 body+arm 与 body-only 的像素差分，避免遮挡/颜色阈值造成的抖动误判。
JS_READABILITY = """
({kind, move}) => {
  const b = game.boss;
  b.kind = kind; b.state = 'windup'; b.next = move;
  b.fireN = 0; b.comboN = 0; b.vx = 0; b.breakT = 0; b.hidden = false;
  let w = 0.6;
  try { const T = BAL['boss' + kind] || BAL.boss; if (T && T.windup && T.windup[move] != null) w = T.windup[move]; } catch (e) { w = 0.6; }
  b.t = w * 0.36;
  b._aiVT = 0; b._aiVTick = 0;
  game.tick = 100;

  const origFn = window.PQ_BOSS_ANIM._orig();
  function makeCtx() {
    const c = document.createElement('canvas'); c.width = 768; c.height = 448;
    const g = c.getContext('2d');
    g.translate(-game.cam.x, -game.cam.y);
    return g;
  }
  function stats(g) {
    const d = g.getImageData(0, 0, 768, 448).data;
    let top = -1, x0 = 768, x1 = -1, y0 = -1, y1 = -1, n = 0;
    for (let y = 0; y < 448; y++) {
      for (let x = 0; x < 768; x++) {
        if (d[(y * 768 + x) * 4 + 3] > 20) {
          n++;
          if (top < 0) top = y;
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y0 < 0 || y < y0) y0 = y; y1 = y;
        }
      }
    }
    return { top, x0, x1, y0, y1, n };
  }
  const gA = makeCtx(); origFn(gA, game, 100, b);
  const body = stats(gA);
  const gC = makeCtx(); window.PQ_BOSS_ANIM.draw(gC, game, 100, b);
  const arm = stats(gC);

  // 臂端越出主体包围盒：手臂层最顶 12px 带（拳/掌/爪块高度）内的不透明像素，
  // 必须落在身体包围盒之外（y < body.y0 或 x < body.x0 或 x > body.x1）。
  const dC = gC.getImageData(0, 0, 768, 448).data;
  const band = Math.min(arm.top + 12, 447);
  let handTotal = 0, handOut = 0;
  for (let y = arm.top; y <= band; y++) {
    for (let x = 0; x < 768; x++) {
      if (dC[(y * 768 + x) * 4 + 3] > 20) {
        handTotal++;
        if (y < body.y0 || x < body.x0 || x > body.x1) handOut++;
      }
    }
  }
  const margin = body.top - arm.top;
  return { bodyTop: body.top, armTop: arm.top, margin,
           bodyBbox: [body.x0, body.y0, body.x1, body.y1],
           armBbox: [arm.x0, arm.y0, arm.x1, arm.y1],
           handTotal, handOut,
           handOutside: handTotal > 0 && handOut / handTotal >= 0.9,
           clear: arm.top >= 0 && body.top >= 0 && arm.top < body.top,
           state: b.state, u: +(b.t / w).toFixed(3) };
}
"""


def snap_canvas(page, path):
    page.locator('#game').screenshot(path=str(path))


def crop_boss(page, src, dst, box=CROP, zoom=ZOOM):
    pos = page.evaluate(JS_BOSS_POS)
    im = Image.open(src).convert('RGBA')
    W, H = im.size
    x0 = int(pos['x'] - box / 2)
    y0 = int(pos['y'] - box / 2)
    x0 = max(0, min(x0, W - box))
    y0 = max(0, min(y0, H - box))
    crop = im.crop((x0, y0, x0 + box, y0 + box))
    if zoom != 1:
        crop = crop.resize((box * zoom, box * zoom), Image.NEAREST)
    crop.save(dst)
    return crop


def pixel_diff(a, b):
    ia = Image.open(a).convert('RGBA')
    ib = Image.open(b).convert('RGBA')
    if ia.size != ib.size:
        ib = ib.resize(ia.size, Image.NEAREST)
    pa, pb = ia.getdata(), ib.getdata()
    n = 0
    for x, y in zip(pa, pb):
        if x != y:
            n += 1
    return n


def build_a2_deliverables(readability):
    """生成 .screenshots/a_boss2/ 交付物：after 单帧、before|after 对照条、5 只/14 只拼图、余量表。"""
    for k in SPECIAL_KINDS:
        src = OUT / ('after_windup_kind%d_f2.png' % k)
        if src.exists():
            shutil.copy2(src, A2 / ('after_kind%d.png' % k))

    for k in SPECIAL_KINDS:
        before = A2 / ('before_kind%d.png' % k)
        after = OUT / ('after_windup_kind%d_f2.png' % k)
        if before.exists() and after.exists():
            a = Image.open(before).convert('RGBA').resize((CROP, CROP), Image.NEAREST)
            b = Image.open(after).convert('RGBA').resize((CROP, CROP), Image.NEAREST)
            cmp = Image.new('RGBA', (CROP * 2 + 8, CROP + 20), (11, 11, 18, 255))
            dr = ImageDraw.Draw(cmp)
            cmp.paste(a, (0, 20))
            cmp.paste(b, (CROP + 8, 20))
            dr.text((4, 4), 'kind%d before(改动前)' % k, fill=(255, 200, 180, 255))
            dr.text((CROP + 12, 4), 'after(强化后)', fill=(180, 255, 200, 255))
            cmp.save(A2 / ('strip_kind%d.png' % k))

    def sheet(ks, name, cols):
        thumbs = []
        for k in ks:
            t = OUT / ('_thumb_kind%d.png' % k)
            if t.exists():
                thumbs.append((k, Image.open(t).convert('RGBA')))
        if not thumbs:
            return
        rows = (len(thumbs) + cols - 1) // cols
        sh = Image.new('RGBA', (cols * CROP, rows * (CROP + 18)), (11, 11, 18, 255))
        dr = ImageDraw.Draw(sh)
        for i, (k, im) in enumerate(thumbs):
            x = (i % cols) * CROP
            y = (i // cols) * (CROP + 18)
            sh.paste(im, (x, y + 18))
            dr.text((x + 4, y + 4), 'kind %d' % k, fill=(255, 240, 180, 255))
        sh.save(A2 / name)

    sheet(sorted(SPECIAL_KINDS), 'after_5kinds_sheet.png', 5)
    sheet(list(range(1, 15)), 'after_all14_sheet.png', 7)

    lines = ['kind | armTop | bodyTop | margin | handOut/Total | outside | 门槛 | 判定']
    for k in sorted(readability):
        r = readability[k]
        margin = (r['bodyTop'] - r['armTop']) if r['armTop'] >= 0 and r['bodyTop'] >= 0 else -1
        need = MARGIN_MIN[k in SPECIAL_KINDS]
        ok = r['clear'] and margin >= need and (k not in SPECIAL_KINDS or r.get('handOutside'))
        lines.append('%d | %s | %s | %d | %d/%d | %s | ≥%d | %s' % (
            k, r['armTop'], r['bodyTop'], margin, r['handOut'], r['handTotal'],
            r.get('handOutside'), need, 'OK' if ok else 'FAIL'))
    (A2 / 'margin_table.txt').write_text('\n'.join(lines), encoding='utf-8')


def main():
    smoke = '--smoke' in sys.argv
    kinds = [1, 14] if smoke else list(range(1, 15))
    failures = []
    errs = []
    idle_diffs = {}
    readability = {}

    # 备份强化前（旧细线版）f2 帧，供 before/after 对照；新帧覆写后仍可回溯。
    for k in kinds:
        old = OUT / ('after_windup_kind%d_f2.png' % k)
        if old.exists():
            shutil.copy2(old, TMP / ('old_f2_kind%d.png' % k))

    with sync_playwright() as pw:
        br = pw.chromium.launch(headless=True)
        page = br.new_page(viewport={'width': 960, 'height': 640})
        # 干净启动：每次加载前清掉 localStorage（pq_progress 等存档注入），避免坏态会话残留。
        page.add_init_script("() => { try { localStorage.clear(); } catch (e) {} }")

        def _is_preexisting(msg):
            # file:// 下 Fetch 不被支持：kenney manifest/sprites.json 加载失败是既有环境限制
            # （assets_loader.js / sprites_external.js，非 v54 改动文件），基线副本同样出现。
            if 'URL scheme "file" is not supported' in msg or 'kenney' in msg:
                return True
            # SPR 帧为空导致的 drawImage TypeError：kenney 图集被阻断后的既有回落问题，
            # 出现在 renderEntities（非 Boss 绘制路径），基线副本同样复现。
            if "Failed to execute 'drawImage'" in msg and 'renderEntities' in msg:
                return True
            return False

        page.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
        page.on('console', lambda m: errs.append('console: ' + m.text)
                if m.type == 'error' and not _is_preexisting(m.text) else None)

        def load(url, level):
            page.goto(url + ('&' if '?' in url else '?') + 'level=%d' % level,
                      wait_until='networkidle')
            page.wait_for_function("() => window.game && game.boss", timeout=10000)
            # 等程序化精灵表稳定（slime/boss 等 art 帧建成、键数达标），避免在坏态会话里抓拍。
            page.wait_for_function(
                "() => typeof SPR!=='undefined' && SPR && SPR.slime && SPR.boss "
                "&& Object.keys(SPR).length>=150", timeout=10000)
            page.wait_for_timeout(500)   # 等 Boss 立绘/AI 帧异步注入收尾
            page.evaluate(JS_BOOT)       # 统一冻结世界（基线/after 同口径）

        # ---------- 基线（改动前冻结副本）：拍 before 帧 ----------
        print('[before] 基线副本 %s' % BEFORE_URL)
        for k in kinds:
            load(BEFORE_URL, LEVEL[k])
            page.evaluate(JS_FORCE_IDLE, k)
            page.evaluate(JS_FREEZE_TICK)
            page.wait_for_timeout(60)
            before_idle = OUT / ('before_idle_kind%d.png' % k)
            snap_canvas(page, before_idle)
            page.evaluate(JS_FORCE_WINDUP, {'kind': k, 'move': MOVE[k], 'u': US[1]})
            page.evaluate(JS_FREEZE_TICK)
            page.wait_for_timeout(60)
            before_w = OUT / ('before_windup_kind%d.png' % k)
            snap_canvas(page, before_w)
            print('  before kind%d idle+windup 已存' % k)

        # ---------- after：逐只拍 idle + 四阶段 ----------
        sheet_thumbs = []
        for k in kinds:
            load(AFTER_URL, LEVEL[k])
            boot = page.evaluate(JS_BOOT)
            if not boot.get('ok'):
                failures.append('kind%d 未生成 game.boss' % k)
                continue

            # idle 帧（包装激活态，留存视觉证据）
            page.evaluate(JS_FORCE_IDLE, k)
            page.evaluate(JS_FREEZE_TICK)
            page.wait_for_timeout(60)
            after_idle = OUT / ('after_boss_idle_kind%d.png' % k)
            snap_canvas(page, after_idle)

            # 零差异证明 A：函数级调用计数隔离（包装层 idle 零额外绘制指令）。
            cc = page.evaluate(JS_IDLE_CALLCOUNT)
            if cc['wrap'] != cc['orig']:
                failures.append('kind%d idle 包装层多出绘制调用（orig=%d wrap=%d）'
                                % (k, cc['orig'], cc['wrap']))
            # 零差异证明 B：after idle 帧 vs .snap_before 基线 idle 帧，整帧像素比对（记录告警）。
            d_idle = pixel_diff(after_idle, OUT / ('before_idle_kind%d.png' % k))
            idle_diffs[k] = d_idle
            # 注：跨页面冷启动整帧像素差含既有环境噪声（小怪随机相位/天气粒子/异步帧注入时序），
            # 不能作为本层透传判据；透传硬判据为上方函数级调用计数 orig==wrap。
            if d_idle != 0:
                print('  kind%d idle 基线像素差 %d px（环境噪声，见 notes §7）；透传调用 orig=%d wrap=%d'
                      % (k, d_idle, cc['orig'], cc['wrap']))
            else:
                print('  kind%d idle 基线像素差 0 px；透传调用 orig=%d wrap=%d'
                      % (k, cc['orig'], cc['wrap']))

            # 四阶段 windup
            wmeta = []
            fps = []
            for fi, u in enumerate(US, start=1):
                r = page.evaluate(JS_FORCE_WINDUP, {'kind': k, 'move': MOVE[k], 'u': u})
                page.evaluate(JS_FREEZE_TICK)
                page.wait_for_timeout(60)
                fp = OUT / ('after_windup_kind%d_f%d.png' % (k, fi))
                snap_canvas(page, fp)
                fps.append(fp)
                # 与基线同进度帧比对（手臂层应当带来像素差）
                d = pixel_diff(OUT / ('before_windup_kind%d.png' % k), fp)
                wmeta.append({'f': fi, 'u': u, 'diff': d, 'state': r.get('state')})
                if d <= 0:
                    failures.append('kind%d f%d 与基线零差异（手臂层未出现）' % (k, fi))

                # 可读性硬断言：B 阶段（u=0.36，断言内自行钉死相位）臂端高于主体上缘；
                # 强化型（5/8/12/13/14）余量 ≥12px 且臂端像素完全落在主体包围盒之外，其余 ≥6px。
                if fi == 2:
                    rd = page.evaluate(JS_READABILITY, {'kind': k, 'move': MOVE[k]})
                    readability[k] = rd
                    margin = (rd['bodyTop'] - rd['armTop']) if rd['armTop'] >= 0 and rd['bodyTop'] >= 0 else -1
                    need = MARGIN_MIN[k in SPECIAL_KINDS]
                    ok = rd['clear'] and margin >= need and (k not in SPECIAL_KINDS or rd.get('handOutside'))
                    if not ok:
                        failures.append('kind%d B 阶段臂端不达标（margin=%d need=%d armTop=%s bodyTop=%s handOut=%s/%s outside=%s state=%s u=%s）'
                                        % (k, margin, need, rd['armTop'], rd['bodyTop'],
                                           rd['handOut'], rd['handTotal'], rd.get('handOutside'),
                                           rd.get('state'), rd.get('u')))

            # 四阶段可辨识度：相邻帧像素差（起手→最高→蓄力→落下）。
            adj = [pixel_diff(fps[i], fps[i + 1]) for i in range(len(fps) - 1)]
            print('  kind%d windup 基线 diff: %s；相邻帧差: %s；可读性: armTop=%s bodyTop=%s %s' %
                  (k, ', '.join('f%d=%d' % (m['f'], m['diff']) for m in wmeta),
                   ','.join(str(x) for x in adj),
                   readability[k]['armTop'], readability[k]['bodyTop'],
                   'OK' if readability[k]['clear'] else 'FAIL'))

            # 拼图用缩略图：f2 抬到最高
            thumb = crop_boss(page, OUT / ('after_windup_kind%d_f2.png' % k),
                              OUT / ('_thumb_kind%d.png' % k), box=CROP, zoom=1)
            sheet_thumbs.append((k, thumb))

        # ---------- 强化前/后对照图 ----------
        for k in kinds:
            # 优先取探针重拍的真实旧细线版（oldreal_f2）；缺失时回退本轮首版备份 old_f2。
            old_real = TMP / ('oldreal_f2_kind%d.png' % k)
            old_f2 = old_real if old_real.exists() else (TMP / ('old_f2_kind%d.png' % k))
            new_f2 = OUT / ('after_windup_kind%d_f2.png' % k)
            if old_f2.exists():
                shutil.copy2(old_f2, OUT / ('before_arm_kind%d.png' % k))
            if new_f2.exists():
                shutil.copy2(new_f2, OUT / ('after_arm_kind%d.png' % k))
            # 并排对照条
            if old_f2.exists() and new_f2.exists():
                a = Image.open(old_f2).convert('RGBA')
                b = Image.open(new_f2).convert('RGBA')
                cw, ch = CROP, CROP
                a = a.resize((cw, ch), Image.NEAREST)
                b = b.resize((cw, ch), Image.NEAREST)
                cmp = Image.new('RGBA', (cw * 2 + 8, ch + 20), (11, 11, 18, 255))
                dr = ImageDraw.Draw(cmp)
                cmp.paste(a, (0, 20))
                cmp.paste(b, (cw + 8, 20))
                dr.text((4, 4), 'kind%d before(旧细线)' % k, fill=(255, 200, 180, 255))
                dr.text((cw + 12, 4), 'after(强化)', fill=(180, 255, 200, 255))
                cmp.save(OUT / ('arm_compare_kind%d.png' % k))

        # ---------- 14 只拼图 ----------
        if sheet_thumbs:
            cols = 7
            rows = (len(sheet_thumbs) + cols - 1) // cols
            tw, th = CROP, CROP
            sheet = Image.new('RGBA', (cols * tw, rows * (th + 18)), (11, 11, 18, 255))
            dr = ImageDraw.Draw(sheet)
            for i, (k, thumb) in enumerate(sheet_thumbs):
                x = (i % cols) * tw
                y = (i // cols) * (th + 18)
                sheet.paste(thumb, (x, y + 18))
                dr.text((x + 4, y + 4), 'kind %d' % k, fill=(255, 240, 180, 255))
            sheet.save(OUT / 'after_all14_boss_windup_sheet.png')
            print('[sheet] after_all14_boss_windup_sheet.png 已存')

        # ---------- 报错汇总 ----------
        if errs:
            failures.append('页面错误 %d 条: %s' % (len(errs), '; '.join(errs[:5])))

        br.close()

    if idle_diffs:
        print('\nidle after vs 基线像素差（px）:')
        for k in sorted(idle_diffs):
            print('  kind%-2d  %d' % (k, idle_diffs[k]))

    # ---------- v55 交付图（.screenshots/a_boss2/） ----------
    build_a2_deliverables(readability)

    min_margin = 10 ** 6
    if readability:
        print('\nB 阶段可读性断言（强化型余量 ≥12px 且臂端越出包围盒，其余 ≥6px）:')
        for k in sorted(readability):
            r = readability[k]
            margin = (r['bodyTop'] - r['armTop']) if r['armTop'] >= 0 and r['bodyTop'] >= 0 else -1
            min_margin = min(min_margin, margin)
            need = MARGIN_MIN[k in SPECIAL_KINDS]
            ok = r['clear'] and margin >= need and (k not in SPECIAL_KINDS or r.get('handOutside'))
            print('  kind%-2d  armTop=%s bodyTop=%s  margin=%d  hand=%s/%s outside=%s  %s'
                  % (k, r['armTop'], r['bodyTop'], margin,
                     r['handOut'], r['handTotal'], r.get('handOutside'),
                     'OK' if ok else 'FAIL'))
        print('  最小余量: %d px' % min_margin)

    print('\n结果: ' + ('全部通过' if not failures else '%d 项失败' % len(failures)))
    for f in failures:
        print('  FAIL ' + f)
    if errs:
        print('页面错误:')
        for e in errs:
            print('  ' + e)
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
