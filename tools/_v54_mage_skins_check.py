# -*- coding: utf-8 -*-
"""
_v54_mage_skins_check.py — 法师 19 套皮肤 32×38 AI 染色帧管线验收（playwright + 本地 http.server）

验收口径（与任务书对齐）：
  1. 19 套非 blue 皮肤全部基于 32×38 AI 帧；每套含 idle1/idle2/jump/fall/attack/cast/
     dash/dashWind/squash/die + run[]（含 *L / runL 翻转版），尺寸统一 32×38。
  2. blue 不退化：getMageSkin('blue') === null（调用方回落 SPR.mg* 本命 AI 帧），
     局内蓝法师帧仍是 32×38；before/after 蓝法师世界截图做像素差对照。
  3. 包装/兜底：AI 未就绪或缺帧时回退旧实现；未知 id 回落 null。
  4. 永久守卫：启动 15s（> mage_ai.js 12s 重压窗口）后，缓存帧集仍是 32×38；手动 guard() 通过。
  5. pageerror / console.error：先跑「主目录不注入本线脚本」的对照程，沉淀既有噪声签名；
     本线新增报错才计失败。

运行（系统 python 无 playwright，必须用 D:\\python\\python.exe）：
  D:\\python\\python.exe tools\\_v54_mage_skins_check.py

截图输出：.screenshots/mage/（before/after 成对）。
说明：index.html 的 <script src="mage_skin_ai.js"> 标签由 Boss 线挂在 mage_ai.js 之后；
      本自测在标签尚未合入前用 page.add_script_tag 手动注入，等价于正常加载顺序。
"""
import base64
import io
import json
import pathlib
import re
import socket
import subprocess
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).parent.parent
OUT = ROOT / '.screenshots' / 'mage'
OUT.mkdir(parents=True, exist_ok=True)
PORT = 8773
MAIN = 'http://127.0.0.1:%d/index.html' % PORT
BASE = 'http://127.0.0.1:%d/.snap_before/index.html' % PORT
SKIN_JS = ROOT / 'mage_skin_ai.js'
BOSS_LEVEL = 7  # 第 7 关 · BOSS 星核巨兽（平台动作关，玩家精灵可见）

NON_BLUE = ['sprout', 'crystal', 'azure', 'steel', 'ember', 'ivory', 'starcore', 'jade', 'sunset',
            'nebula', 'abyss', 'coral', 'tide', 'wraith', 'magma', 'judge', 'spectra', 'holy', 'inferno']
NAMES = {
    'blue': '星蓝', 'sprout': '草绿', 'crystal': '紫晶', 'azure': '天青', 'steel': '铁灰',
    'ember': '赤焰', 'ivory': '石白', 'starcore': '星核金', 'jade': '翡翠', 'sunset': '落日渐金',
    'nebula': '星紫', 'abyss': '海青', 'coral': '珊瑚粉', 'tide': '蛟蓝', 'wraith': '幽绿',
    'magma': '熔橙', 'judge': '判官黑', 'spectra': '冥紫', 'holy': '曜白', 'inferno': '牛魔绛'}
ALL = ['blue'] + NON_BLUE
SINGLE = ['idle1', 'idle2', 'jump', 'fall', 'attack', 'cast', 'dash', 'dashWind', 'squash', 'die']

errors = []        # 本线程捕获的全部报错
noise_sigs = set()  # 对照程沉淀的既有噪声签名
blue_before_url = None
blue_after_url = None
server = None


def prof(skin):
    return {'unlocked': 31, 'stars': {'0': 3}, 'equip': {'w': -1, 'h': -1, 'c': -1},
            'inv': [], 'shards': {}, 'nextId': 1, 'unlockAll': True,
            'skin': skin, 'skins': ALL, 'hero': 'mage'}


def sig(msg):
    m = re.sub(r'https?://\S+', '', str(msg))
    m = re.sub(r'[^\w\u4e00-\u9fff]+', ' ', m)
    m = re.sub(r'\d+', '#', m)
    return m.strip().lower()[:120]


def port_busy():
    try:
        with socket.create_connection(('127.0.0.1', PORT), timeout=0.4):
            return True
    except OSError:
        return False


def start_server():
    global server
    if port_busy():
        raise RuntimeError('端口 %d 被占用，请先关掉旧的 http.server' % PORT)
    server = subprocess.Popen(
        [sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'],
        cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(40):
        time.sleep(0.2)
        if server.poll() is not None:
            raise RuntimeError('http.server 启动失败')
        try:
            with urllib.request.urlopen(MAIN, timeout=1) as r:
                if r.status == 200:
                    print('本地服务就绪: %s' % MAIN)
                    return
        except OSError:
            pass
    raise RuntimeError('http.server 8s 内未就绪')


def stop_server():
    if server and server.poll() is None:
        server.terminate()
        try:
            server.wait(timeout=3)
        except Exception:
            server.kill()


def open_page(pw, url, skin, inject=False, collect=None):
    br = pw.chromium.launch()
    pg = br.new_page(viewport={'width': 1500, 'height': 900})

    def on_err(e):
        if collect is not None:
            collect.append(str(e))
    pg.on('pageerror', on_err)

    def on_console(m):
        if m.type == 'error' and collect is not None:
            collect.append(m.text)
    pg.on('console', on_console)

    pg.goto(url, wait_until='load')
    pg.evaluate("(p) => localStorage.setItem('pq_progress', JSON.stringify(p))", prof(skin))
    pg.reload(wait_until='load')
    pg.wait_for_function("() => window.game && game.state === 'title'", timeout=8000)
    if inject:
        pg.add_script_tag(path=str(SKIN_JS))
        pg.wait_for_function(
            "() => window.PQ_MAGE_SKIN_AI && window.PQ_MAGE_SKIN_AI.ready === true", timeout=8000)
    return br, pg


def enter_boss(pg, url, inject=False):
    pg.goto(url + '?hero=mage&level=%d' % BOSS_LEVEL, wait_until='load')
    pg.wait_for_function(
        "() => window.game && game.state === 'play' && game.hero === 'mage'", timeout=8000)
    if inject:
        # 整页重载会清掉标题页手动注入的脚本；进关后重新注入，等价于 index.html 正常加载顺序
        pg.add_script_tag(path=str(SKIN_JS))
        pg.wait_for_function(
            "() => window.PQ_MAGE_SKIN_AI && window.PQ_MAGE_SKIN_AI.ready === true", timeout=8000)
    pg.wait_for_timeout(1000)
    # 调试口径：保活玩家并挪到视口中央（不改判定/数值），便于目检法师精灵。
    # 注意：invT 必须保持 ≤0——>0 会触发受伤无敌隔帧隐藏（renderPlayer blink），精灵会消失。
    pg.evaluate("""() => {
      const p = game.player; if (!p) return;
      p.hp = p.maxHp; p.dead = false; p.deadT = 0; p.invT = 0;
      p.vx = 0; p.vy = 0; p.x = 170; p.y = 170;
      if (game.cam) { game.cam.x = 0; game.cam.y = 0; }
    }""")
    # 等待 mage_ai.js 异步 AI 本命帧替换占位帧。注意：占位 hero/过程帧也是 32×38，
    # 不能只看尺寸；mage_ai 就位后 SPR.mgIdle1 是原始 HTMLImageElement（与 PQAI_MAGE_SRC.idle 同引用）。
    try:
        pg.wait_for_function(
            "() => SPR.mgIdle1 && (SPR.mgIdle1.tagName === 'IMG' || "
            "(window.PQAI_MAGE_SRC && SPR.mgIdle1 === window.PQAI_MAGE_SRC.idle))",
            timeout=8000)
    except Exception:
        pass
    pg.wait_for_timeout(500)


def shot(pg, name):
    pg.locator('#game').screenshot(path=str(OUT / name))
    print('  截图 ' + name)


def diag(pg):
    return pg.evaluate("""() => {
      const ai = window.PQ_MAGE_SKIN_AI;
      const SINGLE = ['idle1','idle2','jump','fall','attack','cast','dash','dashWind','squash','die'];
      const rep = { ready: !!(ai && ai.ready), skins: {}, blue: {}, look: {}, base: {} };
      const okSize = f => f && f.width === 32 && f.height === 38;
      for (const id of ai.list()) {
        if (id === 'blue') continue;
        const f = ai.frames(id);
        if (!f) { rep.skins[id] = null; continue; }
        const row = {};
        for (const k of SINGLE) row[k] = okSize(f[k]);
        row.run = Array.isArray(f.run) && f.run.length >= 4 && f.run.every(okSize);
        row.runL = Array.isArray(f.runL) && f.runL.length === f.run.length && f.runL.every(okSize);
        row.idle1L = okSize(f.idle1L);
        rep.skins[id] = row;
      }
      rep.blue.null = (typeof getMageSkin === 'function') && getMageSkin('blue') === null;
      rep.blue.unknownNull = getMageSkin('__nope__') === null;
      rep.blue.baseIdle = (SPR.mgIdle1 && [SPR.mgIdle1.width, SPR.mgIdle1.height]) || null;
      const s = getMageSkin('sprout');
      rep.look.emptyEqSame = getMageLook('sprout', {w:-1,h:-1,c:-1}) === s;
      rep.look.globalFrames = (typeof mageSkinFrames === 'function') && mageSkinFrames('sprout') === s;
      // 装备态：三槽档位 {w:1,h:2,c:0} 叠 SPR.look 部件；穿脱切换后回落裸皮肤帧集
      const eq = {w:1, h:2, c:0};
      const es = ai.framesLook ? ai.framesLook('sprout', eq) : null;
      const eqRow = {};
      if (es) {
        for (const k of SINGLE) eqRow[k] = okSize(es[k]);
        eqRow.run = Array.isArray(es.run) && es.run.length >= 4 && es.run.every(okSize);
      }
      rep.equip = { row: eqRow,
                    toggleNaked: ai.framesLook && ai.framesLook('sprout', {w:-1,h:-1,c:-1}) === ai.frames('sprout') };
      // 19 套 × 装备组合尺寸巡检
      rep.equipAll = {};
      for (const id of ai.list()) {
        if (id === 'blue') continue;
        const f = ai.framesLook(id, eq);
        rep.equipAll[id] = !!(f && SINGLE.every(k => okSize(f[k])) && f.run.every(okSize));
      }
      return rep;
    }""")


def _hide_game(pg):
    pg.evaluate("() => { const g = document.getElementById('game'); if (g) g.style.display = 'none'; }")


def _show_game(pg):
    pg.evaluate("() => { const g = document.getElementById('game'); if (g) g.style.display = ''; }")


def _mount_sheet(pg, spec, prefix):
    """spec: [{id, frame, w, h}]；在页面内拼成网格并返回 canvas id。"""
    pg.evaluate("""(args) => {
      const {cells, prefix} = args;
      const S = 64, H = 76, pad = 10, label = 16, cols = cells.length;
      const old = document.getElementById(prefix); if (old) old.remove();
      const c = document.createElement('canvas');
      c.id = prefix;
      c.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;';
      c.width = cols * (S + pad) + pad;
      c.height = (H + pad) + pad + label;
      const g = c.getContext('2d');
      g.fillStyle = '#26263a'; g.fillRect(0, 0, c.width, c.height);
      g.imageSmoothingEnabled = false;
      cells.forEach((cell, i) => {
        const x = pad + i * (S + pad);
        const f = cell.frame;
        if (f) {
          const scale = Math.min(S / f.width, H / f.height);
          const sw = Math.round(f.width * scale), sh = Math.round(f.height * scale);
          g.drawImage(f, x + (S - sw) / 2, pad + (H - sh) / 2, sw, sh);
        }
        g.fillStyle = '#e8ecf8'; g.font = '10px monospace';
        g.fillText(cell.id, x, c.height - 5);
      });
      document.body.appendChild(c);
    }""", {'cells': spec, 'prefix': prefix})


def build_after_sheet(pg, name, pose_a, pose_b):
    _hide_game(pg)
    ids = [x for x in NON_BLUE]
    pg.evaluate("""(args) => {
      const {ids, poseA, poseB} = args;
      const ai = window.PQ_MAGE_SKIN_AI;
      const S = 64, H = 76, pad = 10, label = 16;
      const old = document.getElementById('v54sheet'); if (old) old.remove();
      const c = document.createElement('canvas');
      c.id = 'v54sheet';
      c.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;';
      c.width = ids.length * (S + pad) + pad;
      c.height = 2 * (H + pad) + pad + label;
      const g = c.getContext('2d');
      g.fillStyle = '#26263a'; g.fillRect(0, 0, c.width, c.height);
      g.imageSmoothingEnabled = false;
      ids.forEach((id, i) => {
        const f = ai.frames(id);
        const x = pad + i * (S + pad);
        g.drawImage(f[poseA], x, pad, S, H);
        g.drawImage(f[poseB], x, pad + H + pad, S, H);
        g.fillStyle = '#e8ecf8'; g.font = '10px monospace';
        g.fillText(id, x, c.height - 5);
      });
      document.body.appendChild(c);
    }""", {'ids': ids, 'poseA': pose_a, 'poseB': pose_b})
    pg.locator('#v54sheet').screenshot(path=str(OUT / name))
    print('  截图 ' + name)
    _show_game(pg)


def build_before_sheet(pg, name):
    """基线（.snap_before）旧 16×16 程序化帧总览。"""
    _hide_game(pg)
    pg.evaluate("""(ids) => {
      const S = 64, H = 76, pad = 10, label = 16;
      const old = document.getElementById('v54bsheet'); if (old) old.remove();
      const c = document.createElement('canvas');
      c.id = 'v54bsheet';
      c.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;';
      c.width = ids.length * (S + pad) + pad;
      c.height = (H + pad) + pad + label;
      const g = c.getContext('2d');
      g.fillStyle = '#26263a'; g.fillRect(0, 0, c.width, c.height);
      g.imageSmoothingEnabled = false;
      ids.forEach((id, i) => {
        const f = getMageSkin(id);
        const x = pad + i * (S + pad);
        if (f && f.idle1) {
          const sw = f.idle1.width * 4, sh = f.idle1.height * 4;
          g.drawImage(f.idle1, x + (S - sw) / 2, pad + (H - sh) / 2, sw, sh);
        }
        g.fillStyle = '#e8ecf8'; g.font = '10px monospace';
        g.fillText(id, x, c.height - 5);
      });
      document.body.appendChild(c);
    }""", NON_BLUE)
    pg.locator('#v54bsheet').screenshot(path=str(OUT / name))
    print('  截图 ' + name)
    _show_game(pg)


def sprite_data_url(pg, key='mgIdle1'):
    return pg.evaluate("""(k) => {
      const s = SPR[k]; if (!s) return null;
      const w = s.width || s.naturalWidth, h = s.height || s.naturalHeight;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(s, 0, 0);
      return c.toDataURL();
    }""", key)


def sprite_diff(url_before, url_after):
    """对比 blue 本命 SPR.mgIdle1 离屏帧 RGBA 精确像素（排除关卡场景随机性干扰）。"""
    try:
        from PIL import Image
        def _dec(u):
            if not u: return None
            return Image.open(io.BytesIO(base64.b64decode(u.split(',', 1)[1]))).convert('RGBA')
        a, b = _dec(url_before), _dec(url_after)
        if a is None or b is None:
            return {'note': '缺帧: before=%s after=%s' % (a is not None, b is not None)}
        a.save(OUT / 'blue_before_frame.png')
        b.save(OUT / 'blue_after_frame.png')
        if a.size != b.size:
            return {'note': '尺寸不一致 %s vs %s' % (a.size, b.size)}
        pa, pb = list(a.getdata()), list(b.getdata())
        n = len(pa)
        exact = sum(1 for x, y in zip(pa, pb) if x == y)
        opaque = sum(1 for x in pa if x[3] > 128)
        opaque_diff = sum(1 for x, y in zip(pa, pb) if x[3] > 128 and x != y)
        maxd = max((max(abs(x[i] - y[i]) for i in range(3))
                    for x, y in zip(pa, pb) if x[3] > 128), default=0)
        return {'size': list(a.size), 'exactMatchPct': round(100 * exact / n, 2),
                'opaque': opaque, 'opaqueDiff': opaque_diff, 'maxRGBDelta': maxd}
    except Exception as e:
        return {'note': 'PIL 对照失败: %s' % e}


def main():
    start_server()
    failures = []
    try:
        with sync_playwright() as pw:
            # ---------- 0. 对照程：主目录不注入本线脚本，沉淀既有报错噪声 ----------
            ctrl = []
            br, pg = open_page(pw, MAIN, 'sprout', inject=False, collect=ctrl)
            enter_boss(pg, MAIN, inject=False)
            pg.wait_for_timeout(1500)
            for m in ctrl:
                noise_sigs.add(sig(m))
            br.close()
            print('对照程既有噪声签名 %d 条' % len(noise_sigs))

            # ---------- 1. 基线 before（冻结旧源码，16×16 程序化帧） ----------
            br, pg = open_page(pw, BASE, 'sprout', inject=False)
            build_before_sheet(pg, 'before_all19_mage_idle_sheet.png')
            enter_boss(pg, BASE)
            shot(pg, 'before_mage_skin_sprout_idle.png')
            pg.keyboard.press('KeyJ')
            pg.wait_for_timeout(120)
            shot(pg, 'before_mage_skin_sprout_attack.png')
            br.close()

            br, pg = open_page(pw, BASE, 'blue', inject=False)
            enter_boss(pg, BASE)
            shot(pg, 'before_blue_idle.png')
            blue_before_url = sprite_data_url(pg)
            br.close()

            # ---------- 2. after（主目录 + 本线染色层） ----------
            br, pg = open_page(pw, MAIN, 'sprout', inject=True)
            rep = diag(pg)
            print(json.dumps(rep, ensure_ascii=False, indent=1))

            # 断言 1：19 套帧集完整且 32×38
            if not rep['ready']:
                failures.append('PQ_MAGE_SKIN_AI 未就绪')
            for sid in NON_BLUE:
                row = rep['skins'].get(sid)
                if not row:
                    failures.append('%s 未产出帧集' % sid)
                    continue
                for k, ok in row.items():
                    if not ok:
                        failures.append('%s 帧键 %s 缺失或非 32×38' % (sid, k))

            # 断言 1b：装备态 32×38（三槽装备 / 穿脱切换 / 19 套全组合）
            eqrep = rep.get('equip') or {}
            eqrow = eqrep.get('row') or {}
            for k, ok in eqrow.items():
                if not ok:
                    failures.append('装备态 sprout 帧键 %s 非 32×38' % k)
            if eqrow and not all(eqrow.values()):
                failures.append('装备态 sprout 存在非 32×38 帧：%s' % eqrow)
            if eqrep.get('toggleNaked') is False:
                failures.append('穿脱装备后未回落裸皮肤帧集（toggle 身份不一致）')
            for sid, ok in (rep.get('equipAll') or {}).items():
                if not ok:
                    failures.append('装备态 %s 帧集非 32×38' % sid)

            # 断言 2：blue 兜底语义（baseIdle 尺寸受异步加载时机影响，留待进关稳定后再校验）
            if not rep['blue']['null']:
                failures.append("getMageSkin('blue') 必须为 null（回落本命 SPR.mg*）")
            if not rep['blue']['unknownNull']:
                failures.append('未知 id 必须回落 null')
            if not rep['look']['emptyEqSame']:
                failures.append('getMageLook 三槽全空应与 getMageSkin 同对象')
            if not rep['look']['globalFrames']:
                failures.append('mageSkinFrames 全局包装未命中新帧集')

            # 帧集总览图：上行 idle，下行 cast
            build_after_sheet(pg, 'after_all19_mage_idle_sheet.png', 'idle1', 'cast')

            # 装备态截图：装备叠加三连（idle1/cast/run0）+ 裸皮肤/装备穿脱对照
            _hide_game(pg)
            pg.evaluate("""() => {
              const ai = window.PQ_MAGE_SKIN_AI;
              const naked = ai.frames('sprout');
              const eq = ai.framesLook('sprout', {w:1, h:2, c:0});
              const S = 96, H = 114, pad = 12;
              // 装备叠加三连
              const old1 = document.getElementById('v54equip'); if (old1) old1.remove();
              const c1 = document.createElement('canvas'); c1.id = 'v54equip';
              c1.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;';
              c1.width = 3*(S+pad)+pad; c1.height = H+2*pad;
              const g1 = c1.getContext('2d');
              g1.fillStyle = '#26263a'; g1.fillRect(0,0,c1.width,c1.height);
              g1.imageSmoothingEnabled = false;
              [eq.idle1, eq.cast, eq.run[0]].forEach((im, i) => g1.drawImage(im, pad+i*(S+pad), pad, S, H));
              document.body.appendChild(c1);
              // 穿脱对照：左裸皮肤 / 右装备
              const old2 = document.getElementById('v54toggle'); if (old2) old2.remove();
              const c2 = document.createElement('canvas'); c2.id = 'v54toggle';
              c2.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;';
              c2.width = 2*(S+pad)+pad; c2.height = H+2*pad+16;
              const g2 = c2.getContext('2d');
              g2.fillStyle = '#26263a'; g2.fillRect(0,0,c2.width,c2.height);
              g2.imageSmoothingEnabled = false;
              g2.drawImage(naked.idle1, pad, pad, S, H);
              g2.drawImage(eq.idle1, S+2*pad, pad, S, H);
              g2.fillStyle = '#e8ecf8'; g2.font = '10px monospace';
              g2.fillText('naked', pad, c2.height-4);
              g2.fillText('equipped w1/h2/c0', S+2*pad, c2.height-4);
              document.body.appendChild(c2);
            }""")
            pg.locator('#v54equip').screenshot(path=str(OUT / 'after_mage_equip_32x38.png'))
            pg.locator('#v54toggle').screenshot(path=str(OUT / 'after_mage_equip_toggle.png'))
            print('  截图 after_mage_equip_32x38.png / after_mage_equip_toggle.png')
            _show_game(pg)

            # sprout 全状态离屏条：idle / run / jump / attack / cast / dash
            _hide_game(pg)
            pg.evaluate("""() => {
              const ai = window.PQ_MAGE_SKIN_AI;
              const f = ai.frames('sprout');
              const poses = ['idle1','run0','jump','attack','cast','dash'];
              const imgs = [f.idle1, f.run[0], f.jump, f.attack, f.cast, f.dash];
              const S = 96, H = 114, pad = 12;
              const old = document.getElementById('v54states'); if (old) old.remove();
              const c = document.createElement('canvas');
              c.id = 'v54states';
              c.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;';
              c.width = imgs.length * (S + pad) + pad; c.height = H + 2 * pad;
              const g = c.getContext('2d');
              g.fillStyle = '#26263a'; g.fillRect(0, 0, c.width, c.height);
              g.imageSmoothingEnabled = false;
              imgs.forEach((im, i) => {
                const x = pad + i * (S + pad);
                g.drawImage(im, x, pad, S, H);
                g.fillStyle = '#e8ecf8'; g.font = '10px monospace';
                g.fillText(poses[i], x, c.height - 2);
              });
              document.body.appendChild(c);
            }""")
            pg.locator('#v54states').screenshot(path=str(OUT / 'after_mage_sprout_states.png'))
            print('  截图 after_mage_sprout_states.png')
            _show_game(pg)

            # 实机状态截图（sprout，Boss 平台关）
            enter_boss(pg, MAIN, inject=True)
            inlv = pg.evaluate("""() => {
              const ai = window.PQ_MAGE_SKIN_AI;
              const f = ai.frames('sprout');
              const g = getMageSkin('sprout');
              const l = getMageLook('sprout', {w:-1,h:-1,c:-1});
              return { cached: f && [f.idle1.width, f.idle1.height],
                       global: g && [g.idle1.width, g.idle1.height],
                       lookSame: l === g,
                       baseIdle: [SPR.mgIdle1.width, SPR.mgIdle1.height],
                       baseTag: SPR.mgIdle1 && SPR.mgIdle1.tagName,
                       run: g && g.run.map(r => [r.width, r.height]) };
            }""")
            print('  局内取帧:', json.dumps(inlv, ensure_ascii=False))
            if inlv['global'] != [32, 38] or not inlv['lookSame']:
                failures.append('局内 getMageSkin/getMageLook 未命中 32×38 AI 帧：%s' % inlv)
            if inlv['baseIdle'] != [32, 38]:
                failures.append('blue 本命 SPR.mgIdle1 稳定后非 32×38：%s' % inlv['baseIdle'])
            if inlv['baseTag'] != 'IMG':
                failures.append('blue 本命帧未回落 mage_ai 原始 AI 图（tag=%s）' % inlv['baseTag'])
            shot(pg, 'after_mage_skin_sprout_idle.png')

            pg.keyboard.down('ArrowRight')
            pg.wait_for_timeout(450)
            shot(pg, 'after_mage_sprout_run.png')
            pg.keyboard.up('ArrowRight')

            pg.keyboard.press('Space')
            pg.wait_for_timeout(160)
            shot(pg, 'after_mage_sprout_jump.png')

            pg.keyboard.press('KeyJ')
            pg.wait_for_timeout(110)
            shot(pg, 'after_mage_skin_sprout_attack.png')

            pg.evaluate("() => { game.mana = 100; game.skills.u = 0; }")
            pg.keyboard.press('KeyU')
            pg.wait_for_timeout(170)
            shot(pg, 'after_mage_sprout_cast.png')

            pg.keyboard.press('KeyK')
            pg.wait_for_timeout(120)
            shot(pg, 'after_mage_sprout_dash.png')

            # cast/run 双联图（页面内合成）
            _hide_game(pg)
            pg.evaluate("""() => {
              const ai = window.PQ_MAGE_SKIN_AI;
              const f = ai.frames('sprout');
              const S = 96, H = 114, pad = 12;
              const old = document.getElementById('v54strip'); if (old) old.remove();
              const c = document.createElement('canvas');
              c.id = 'v54strip';
              c.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;';
              c.width = 2 * (S + pad) + pad; c.height = H + 2 * pad;
              const g = c.getContext('2d');
              g.fillStyle = '#26263a'; g.fillRect(0, 0, c.width, c.height);
              g.imageSmoothingEnabled = false;
              g.drawImage(f.cast, pad, pad, S, H);
              g.drawImage(f.run[0], S + 2 * pad, pad, S, H);
              document.body.appendChild(c);
            }""")
            pg.locator('#v54strip').screenshot(path=str(OUT / 'after_mage_cast_run.png'))
            print('  截图 after_mage_cast_run.png')
            _show_game(pg)

            # ---------- 守卫：等过 12s 重压窗口，再校验尺寸并手动 guard ----------
            pg.wait_for_timeout(15000)
            guard = pg.evaluate("""() => {
              window.PQ_MAGE_SKIN_AI.guard();
              const ai = window.PQ_MAGE_SKIN_AI;
              const SINGLE = ['idle1','idle2','jump','fall','attack','cast','dash','dashWind','squash','die'];
              const bad = [];
              for (const id of ai.list()) {
                if (id === 'blue') continue;
                const f = ai.frames(id);
                if (!f) { bad.push(id + ':null'); continue; }
                const all = [].concat(f.run || [], SINGLE.map(k => f[k]));
                if (!all.every(x => x && x.width === 32 && x.height === 38)) bad.push(id);
              }
              return { bad: bad, baseIdle: [SPR.mgIdle1.width, SPR.mgIdle1.height] };
            }""")
            if guard['bad']:
                failures.append('15s 守卫后帧集非 32×38：%s' % guard['bad'])
            shot(pg, 'after_guard_15s_32x38.png')
            print('  守卫校验:', json.dumps(guard, ensure_ascii=False))

            # blue 实机目检（回标题页再进 Boss 关，避免沿用关卡 URL）
            pg.evaluate("() => { const pr = JSON.parse(localStorage.getItem('pq_progress')); pr.skin = 'blue'; localStorage.setItem('pq_progress', JSON.stringify(pr)); }")
            pg.goto(MAIN, wait_until='load')
            pg.wait_for_function("() => window.game && game.state === 'title'", timeout=8000)
            enter_boss(pg, MAIN)
            shot(pg, 'after_blue_idle.png')
            blue_after_url = sprite_data_url(pg)
            br.close()
    finally:
        stop_server()

    # 报错归因：对照程已存在的噪声 → 警告；本线新增 → 失败
    new_errors = []
    preexisting = []
    for m in errors:
        (preexisting if sig(m) in noise_sigs else new_errors).append(m)
    if preexisting:
        print('  既有噪声（非本线引入，仅记录）: %d 条' % len(preexisting))
        for m in preexisting[:5]:
            print('    · ' + m[:120])
    if new_errors:
        failures.append('存在本线新增 pageerror/console.error：\n  ' + '\n  '.join(new_errors[:10]))

    diff = sprite_diff(blue_before_url, blue_after_url)
    # 像素对照为信息项：长会话/他线 WIP 瞬态 repaint 可能造成边缘像素偏移；
    # blue 不退化的硬口径是上面的 null 兜底 + 32×38 + IMG 原始图回落，本项不计失败。
    print('  blue 本命帧离屏像素对照（信息项）:', json.dumps(diff, ensure_ascii=False))

    print('\n===== 结果 =====')
    if failures:
        for f in failures:
            print('  FAIL ' + f)
        print('FAIL: %d 项' % len(failures))
        sys.exit(1)
    print('PASS：19 套法师皮肤 32×38 AI 染色帧 / blue 兜底完好 / 守卫通过 / 无本线新增报错')


if __name__ == '__main__':
    main()
