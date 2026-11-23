# -*- coding: utf-8 -*-
"""_qa_v57_vfx.py — T3 QA：ai_vfx.js 特效图懒加载独立验证（只读源码，不改 .js/.html）。

用法：
  D:/python/python.exe tools/_qa_v57_vfx.py baseline   # .snap_v57 冻结副本
  D:/python/python.exe tools/_qa_v57_vfx.py after        # 主目录 index.html

校验项：
  · 启动阶段 vfx2 PNG 请求数 / 字节（baseline 预期 7 张 / ~3.03MB；after 期望 0~1）
  · 首次攻击(J)/技能(U)命中后对应图加载并出特效；加载耗时
  · SPR 键数仍 171；PQAI_VFX 接口兼容
  · 20 次冷启动 0 pageerror / 0 非 file-Fetch console error
输出：.screenshots/vfx_lazy/qa_<before|after>_*.png + qa_vfx_<mode>.json
"""
import json
import pathlib
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(r'C:\Users\A\Desktop\youxi')
SNAP = ROOT / '.snap_v57' / 'index.html'
MAIN = ROOT / 'index.html'
OUT = ROOT / '.screenshots' / 'vfx_lazy'
OUT.mkdir(parents=True, exist_ok=True)

MODE = sys.argv[1] if len(sys.argv) > 1 else 'baseline'
HTML = SNAP if MODE == 'baseline' else MAIN
PREFIX = 'qa_before' if MODE == 'baseline' else 'qa_after'
COLD_RUNS = 20

VFX_DIR = ROOT / 'assets' / 'ai' / 'vfx2'
VFX_NAMES = ['slash', 'wave', 'fire', 'poison', 'heal', 'lightning', 'shadow']


def disk_vfx_bytes():
    out = {}
    if VFX_DIR.exists():
        for f in VFX_DIR.glob('*.png'):
            out[f.name] = f.stat().st_size
    return out


def is_vfx(url):
    return '/ai/vfx2/' in url and url.lower().endswith('.png')


def noise_console(text):
    # file:// 下 kenney manifest/sprites Fetch 失败是已知环境噪音，不计入 QA 失败
    return ('Fetch API cannot load file://' in text and
            ('manifest.json' in text or 'sprites.json' in text))


def read_state(pg):
    return pg.evaluate(r"""
    () => {
      const v = window.PQAI_VFX || null;
      const names = ['slash','wave','fire','poison','heal','lightning','shadow'];
      const vfx = {};
      if (v) {
        for (const n of names) {
          const im = v[n];
          vfx[n] = im ? { width: im.width || 0, height: im.height || 0,
                           complete: !!(im.complete !== false) } : null;
        }
      }
      return {
        sprKeys: Object.keys(SPR).length,
        vfxReady: v ? !!v.ready : null,
        vfxLoaded: v ? v.loaded : null,
        vfxTotal: v ? v.total : null,
        vfx: vfx,
        vfxSnapshot: (v && typeof v.__snapshot === 'function') ? v.__snapshot() : null,
        skillfxReady: !!window.PQAI_SKILLFX_READY,
        spr: {
          meteor: !!(SPR.meteor), fireball: !!(SPR.fireball),
          starMeteor: !!(SPR.starMeteor), iceShard: !!(SPR.iceShard),
          bossGhost: !!(SPR.bossGhost), shieldBubble: !!(SPR.shieldBubble)
        }
      };
    }""")


INIT_JS = r"""
(() => {
  const Req = []; window.__qaImgReqs = Req;
  try {
    const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      set(v) { Req.push({ src: String(v), at: performance.now() }); desc.set.call(this, v); },
      get: desc.get, configurable: true
    });
  } catch (e) { window.__qaImgErr = String(e); }
})();
"""


def boot_run(pw, record_post_interaction=False):
    br = pw.chromium.launch(headless=True)
    pg = br.new_page(viewport={'width': 960, 'height': 640})
    pg.add_init_script(INIT_JS)
    vfx_reqs = []
    perr, cerr = [], []

    def on_resp(resp):
        u = resp.url
        if is_vfx(u):
            try:
                size = resp.encoded_body_size
            except Exception:
                size = -1
            vfx_reqs.append({'url': u.split('/')[-1].split('?')[0],
                             'bytes': size, 'status': resp.status,
                             'at': time.time()})

    pg.on('response', on_resp)
    pg.on('pageerror', lambda e: perr.append(str(e)))
    pg.on('console', lambda m: cerr.append(m.text) if m.type == 'error' else None)

    t0 = time.time()
    pg.goto('file:///' + str(HTML).replace('\\', '/') + '?level=7&hero=mage&god=1')
    pg.wait_for_function("() => window.game && game.player && game.state === 'play'", timeout=15000)
    pg.wait_for_timeout(2000)
    boot_state = read_state(pg)

    disk = disk_vfx_bytes()

    def vfx_img_reqs():
        return pg.evaluate(r"""
          () => (window.__qaImgReqs || [])
            .filter(r => /vfx2\/[^?]+\.png/.test(r.src))
            .map(r => ({ name: r.src.split('/').pop().split('?')[0], at: +r.at.toFixed(1) }))
        """)

    def with_bytes(reqs):
        out = []
        for r in reqs:
            out.append({'name': r['name'], 'at': r['at'],
                        'bytes': disk.get(r['name'], -1)})
        return out

    all_reqs = with_bytes(vfx_img_reqs())
    boot_reqs = list(all_reqs)
    boot_bytes = sum(r['bytes'] for r in boot_reqs if r['bytes'] > 0)

    post = []
    first_use_ms = None
    if record_post_interaction:
        interact_t = pg.evaluate("() => performance.now()")
        # 普攻 J（bolt → lightning/slash 贴图）；技能 U（新星 → iceShard/bolt 烘焙）
        for _ in range(4):
            pg.keyboard.press('j')
            pg.wait_for_timeout(120)
        pg.keyboard.press('u')
        pg.wait_for_timeout(1500)
        after_reqs = with_bytes(vfx_img_reqs())
        post = [r for r in after_reqs if r['at'] >= interact_t - 0.05]
        post_bytes = sum(r['bytes'] for r in post if r['bytes'] > 0)
        after_state = read_state(pg)
        if post:
            first_use_ms = round(max(r['at'] for r in post) - interact_t, 1)
        pg.locator('#game').screenshot(path=str(OUT / ('%s_firstuse.png' % PREFIX)))
    else:
        post, post_bytes, after_state, first_use_ms = [], 0, boot_state, None

    perf = [{'name': r['name'], 'startTime': r['at'], 'duration': 0, 'size': r['bytes']}
            for r in all_reqs]

    nonfetch_err = [c for c in cerr if not noise_console(c)]
    br.close()
    return {
        'boot': {'reqs': boot_reqs, 'count': len(boot_reqs), 'bytes': boot_bytes},
        'post': {'reqs': post, 'count': len(post), 'bytes': post_bytes,
                 'firstUseMs': first_use_ms},
        'boot_state': boot_state, 'after_state': after_state,
        'perf': perf, 'pageerror': perr, 'console_error': nonfetch_err,
    }


def draw_timeline(perf, out_path, title):
    from PIL import Image, ImageDraw
    W, H = 900, 260
    img = Image.new('RGB', (W, H), (18, 22, 32))
    d = ImageDraw.Draw(img)
    d.text((12, 8), title, fill=(230, 235, 245))
    if not perf:
        d.text((12, 60), '启动阶段无 vfx2 PNG 请求', fill=(150, 220, 150))
        img.save(out_path)
        return
    tmax = max((p['startTime'] + p['duration']) for p in perf) or 1
    row_h = 26
    y = 40
    colors = [(120, 200, 255), (255, 210, 120), (180, 230, 150), (220, 160, 255)]
    for i, p in enumerate(sorted(perf, key=lambda x: x['startTime'])):
        x0 = 180 + (p['startTime'] / tmax) * (W - 220)
        x1 = 180 + ((p['startTime'] + p['duration']) / tmax) * (W - 220)
        d.text((12, y + 6), p['name'][:22], fill=(210, 215, 225))
        d.rectangle([x0, y + 4, max(x1, x0 + 4), y + 18], fill=colors[i % len(colors)])
        d.text((x1 + 6, y + 6), '%dms/%dB' % (round(p['duration']), p['size']),
               fill=(200, 205, 215))
        y += row_h
    img.save(out_path)


def main():
    report = {'mode': MODE, 'html': str(HTML), 'diskVfx': disk_vfx_bytes(),
              'diskTotal': sum(disk_vfx_bytes().values()), 'cold': []}

    with sync_playwright() as pw:
        # 单次详细：启动 + 首次使用
        detail = boot_run(pw, record_post_interaction=True)
        report['detail'] = detail
        draw_timeline(detail['perf'], OUT / ('%s_boot_timeline.png' % PREFIX),
                      'VFX boot resource timeline [%s]' % MODE)

        # 20 次冷启动
        for i in range(1, COLD_RUNS + 1):
            r = boot_run(pw, record_post_interaction=False)
            report['cold'].append({
                'i': i, 'vfxCount': r['boot']['count'], 'vfxBytes': r['boot']['bytes'],
                'sprKeys': r['boot_state']['sprKeys'],
                'pageerror': len(r['pageerror']), 'consoleError': len(r['console_error']),
            })

    # 汇总
    cold = report['cold']
    report['summary'] = {
        'bootVfxCount': detail['boot']['count'],
        'bootVfxBytes': detail['boot']['bytes'],
        'postVfxCount': detail['post']['count'],
        'postVfxBytes': detail['post']['bytes'],
        'firstUseMs': detail['post']['firstUseMs'],
        'sprKeys': detail['boot_state']['sprKeys'],
        'coldRuns': COLD_RUNS,
        'coldPageerror': sum(c['pageerror'] for c in cold),
        'coldConsoleError': sum(c['consoleError'] for c in cold),
        'coldSprKeysMin': min(c['sprKeys'] for c in cold),
        'coldSprKeysMax': max(c['sprKeys'] for c in cold),
        'coldVfxCount': [c['vfxCount'] for c in cold],
    }

    out_json = OUT / ('qa_vfx_%s.json' % MODE)
    out_json.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report['summary'], ensure_ascii=False, indent=2))
    print('written', out_json)


if __name__ == '__main__':
    main()
