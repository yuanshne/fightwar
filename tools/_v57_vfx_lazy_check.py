# -*- coding: utf-8 -*-
"""_v57_vfx_lazy_check.py — T2 特效懒加载独立 QA（只读源码，只写 .screenshots/vfx_lazy 与本工具）。

校验：
  · 首屏：7 张 vfx2 大图在首个 game tick 之前请求数 ≤1（期望 0）；
  · 首次使用：攻击命中后 slash 才发起请求并就绪；技能命中后 fire 等技能源图懒加载、SPR 烘焙；
  · shieldBubble 启动阶段键在位（程序化兜底）；
  · 20 次冷启动：0 pageerror、0 非 Fetch 类 console error、SPR 键数稳定；
  · before 基线取自 .snap_v57（只读）。

用法：D:/python/python.exe tools/_v57_vfx_lazy_check.py
产物：.screenshots/vfx_lazy/*.png、vfx_before.json、vfx_after.json
"""
import json
import pathlib
import re
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SNAP_HTML = ROOT / '.snap_v57' / 'index.html'
AFTER_HTML = ROOT / 'index.html'
OUT = ROOT / '.screenshots' / 'vfx_lazy'
OUT.mkdir(parents=True, exist_ok=True)

NAMES = ['slash', 'wave', 'fire', 'poison', 'heal', 'lightning', 'shadow']
FILES = {
    'slash': 'slash_gold.png', 'wave': 'wave_cyan.png', 'fire': 'burst_fire.png',
    'poison': 'orb_poison.png', 'heal': 'heal_holy.png', 'lightning': 'bolt_lightning.png',
    'shadow': 'orb_shadow.png',
}
DISK = {n: (ROOT / 'assets' / 'ai' / 'vfx2' / FILES[n]).stat().st_size for n in NAMES}

PROF = {"unlocked": 24, "stars": {}, "skin": "sprout",
        "skins": ["blue", "sprout", "crystal", "azure", "steel", "ember", "ivory",
                  "starcore", "jade", "sunset", "nebula", "abyss", "coral", "tide",
                  "wraith", "magma", "judge", "spectra", "holy", "inferno"]}

RUNS = 20
WAIT_BOOT = 2500

INIT_JS = r"""
(function () {
  window.__vfxReqs = [];
  window.__firstTick = null;
  const proto = window.Image.prototype;
  const srcDesc = Object.getOwnPropertyDescriptor(proto, 'src');
  const OrigImg = window.Image;
  function WrappedImage() {
    const img = new OrigImg();
    let rec = null;
    Object.defineProperty(img, 'src', {
      configurable: true,
      set(v) {
        if (typeof v === 'string' && /vfx2\/[^?]+\.png/.test(v)) {
          rec = { url: v, t0: performance.now(), t1: null, error: false };
          window.__vfxReqs.push(rec);
          img.addEventListener('load', () => { rec.t1 = performance.now(); });
          img.addEventListener('error', () => { rec.t1 = performance.now(); rec.error = true; });
        }
        srcDesc.set.call(img, v);
      },
      get() { return srcDesc.get.call(img); }
    });
    return img;
  }
  WrappedImage.prototype = proto;
  WrappedImg = OrigImg;
  window.Image = WrappedImage;

  const origRAF = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function (cb) {
    return origRAF(function (ts) {
      if (window.__firstTick === null) window.__firstTick = performance.now();
      cb(ts);
    });
  };
})();
"""

PROBE_JS = r"""
() => {
  const spr = (typeof SPR !== 'undefined') ? SPR : null;
  const keys = spr ? Object.keys(spr) : [];
  const v = window.PQAI_VFX && window.PQAI_VFX.__snapshot
    ? window.PQAI_VFX.__snapshot() : null;
  const sb = spr && spr.shieldBubble
    ? { w: spr.shieldBubble.width, h: spr.shieldBubble.height } : null;
  const gate = window.PQ_ASSET_GATE ? window.PQ_ASSET_GATE.report() : null;
  const dim = (x) => { const c = Array.isArray(x) ? x[0] : x;
    return c && c.width ? c.width + 'x' + c.height : null; };
  return {
    keys: keys.length,
    shieldBubble: sb,
    vfx: v,
    gate: gate,
    skillFrames: {
      meteor: spr ? dim(spr.meteor) : null,
      fireball: spr ? dim(spr.fireball) : null,
      starMeteor: spr ? dim(spr.starMeteor) : null,
      iceShard: spr ? dim(spr.iceShard) : null,
      bossGhost: spr ? dim(spr.bossGhost) : null
    }
  };
}
"""


def file_url(p):
    return 'file:///' + str(p).replace('\\', '/')


def name_for_url(url):
    m = re.search(r'vfx2/([^?/]+\.png)', url or '')
    if not m:
        return None
    fn = m.group(1)
    for n in NAMES:
        if FILES[n] == fn:
            return n
    return None


def classify_reqs(reqs, first_tick):
    """返回 {name: {phase, t0, t1, ms, error}}；phase=boot/lazy。"""
    out = {}
    cutoff = first_tick if first_tick is not None else 800
    for r in reqs:
        n = name_for_url(r['url'])
        if not n:
            continue
        phase = 'boot' if r['t0'] < cutoff else 'lazy'
        ms = None
        if r['t1'] is not None:
            ms = round(r['t1'] - r['t0'], 1)
        out[n] = {'phase': phase, 't0': round(r['t0'], 1), 't1': r['t1'],
                  'ms': ms, 'error': bool(r.get('error'))}
    return out


def new_page(pw, html_path, record):
    br = pw.chromium.launch(headless=True)
    pg = br.new_page(viewport={'width': 1280, 'height': 800})
    perr, cerr = [], []
    pg.on('pageerror', lambda e: perr.append(str(e)))
    pg.on('console', lambda m: cerr.append(m.text) if m.type == 'error' else None)

    bytes_map = {}

    def on_response(resp):
        n = name_for_url(resp.url)
        if not n:
            return
        try:
            body = resp.body()
            bytes_map[n] = len(body)
        except Exception:
            bytes_map[n] = DISK.get(n)

    pg.on('response', on_response)
    pg.add_init_script(INIT_JS)
    pg.goto(file_url(html_path) + '?level=7')
    pg.evaluate("(p) => localStorage.setItem('pq_progress', JSON.stringify(p))", PROF)
    pg.reload()
    pg.wait_for_timeout(WAIT_BOOT)

    reqs = pg.evaluate("() => ({ reqs: window.__vfxReqs, tick: window.__firstTick })")
    reqs_class = classify_reqs(reqs['reqs'], reqs['tick'])
    probe = pg.evaluate(PROBE_JS)

    record['perr'] = perr
    record['cerr'] = cerr
    record['reqs'] = reqs_class
    record['bytes'] = bytes_map
    record['probe'] = probe
    record['first_tick'] = reqs['tick']
    return br, pg


def boot_summary(record):
    reqs = record['reqs']
    boot_names = [n for n, r in reqs.items() if r['phase'] == 'boot']
    lazy_names = [n for n, r in reqs.items() if r['phase'] == 'lazy']
    boot_bytes = sum(record['bytes'].get(n, DISK.get(n, 0)) for n in boot_names)
    return {
        'boot_requests': len(boot_names),
        'boot_names': boot_names,
        'lazy_names': lazy_names,
        'boot_bytes': boot_bytes,
        'probe': record['probe'],
        'perr': record['perr'],
        'cerr': record['cerr'],
    }


def wait_status(pg, name, state='loaded', timeout=3000):
    """轮询 PQAI_VFX.status(name)；返回 (ok, elapsed_ms)。"""
    t0 = pg.evaluate("() => performance.now()")
    deadline = t0 + timeout
    while True:
        st = pg.evaluate("(n) => window.PQAI_VFX ? window.PQAI_VFX.status(n) : 'missing'", name)
        if st == state:
            elapsed = pg.evaluate("() => performance.now()") - t0
            return True, round(elapsed, 1)
        if pg.evaluate("() => performance.now()") > deadline:
            return False, round(pg.evaluate("() => performance.now()") - t0, 1)
        pg.wait_for_timeout(60)


def draw_timeline(path, record, title, max_ms=2500):
    from PIL import Image, ImageDraw
    W, H = 920, 240
    img = Image.new('RGB', (W, H), (18, 18, 24))
    d = ImageDraw.Draw(img)
    d.text((12, 10), title, fill=(235, 235, 235))
    # 轴
    y0 = 60
    d.line([(60, y0), (W - 20, y0)], fill=(90, 90, 100), width=1)
    cutoff = record.get('first_tick') or 800
    cx = 60 + (W - 80) * min(cutoff, max_ms) / max_ms
    d.line([(cx, y0 - 10), (cx, 190)], fill=(255, 120, 120), width=1)
    d.text((cx + 4, y0 - 24), 'first tick', fill=(255, 150, 150))
    colors = {'slash': (255, 215, 106), 'wave': (79, 227, 255), 'fire': (255, 154, 60),
              'poison': (156, 224, 80), 'heal': (232, 255, 200),
              'lightning': (138, 232, 255), 'shadow': (180, 140, 255)}
    rows = list(record['reqs'].items())
    for i, (n, r) in enumerate(rows):
        y = y0 + 16 + i * 18
        t0 = min(r['t0'], max_ms)
        x0 = 60 + (W - 80) * t0 / max_ms
        x1 = 60 + (W - 80) * min(r['t1'] or r['t0'], max_ms) / max_ms
        d.rectangle([x0, y - 6, max(x1, x0 + 3), y + 4], fill=colors.get(n, 200))
        d.text((12, y - 6), n, fill=colors.get(n, 220))
        d.text((x1 + 6, y - 6), ('%s %sms' % (r['phase'], r['ms'])), fill=(190, 190, 190))
    if not rows:
        d.text((60, y0 + 30), 'Boot phase: 0 large VFX images requested', fill=(120, 220, 140))
    img.save(path)


def main():
    lines = []

    def log(s):
        print(s)
        lines.append(s)

    result = {'before': {}, 'after': {}, 'cold_starts': {}, 'latency': {}}

    with sync_playwright() as pw:
        # ---------- 1) before 基线（.snap_v57） ----------
        log('== before 基线：.snap_v57 ==')
        rec_b = {}
        br_b, pg_b = new_page(pw, SNAP_HTML, rec_b)
        summ_b = boot_summary(rec_b)
        result['before'] = summ_b
        log('首屏大图请求: %d 张 %s，字节 %d，pageerror=%d，console error=%d' % (
            summ_b['boot_requests'], summ_b['boot_names'], summ_b['boot_bytes'],
            len(summ_b['perr']), len(summ_b['cerr'])))
        log('SPR 键数=%s shieldBubble=%s' % (
            summ_b['probe']['keys'], summ_b['probe']['shieldBubble']))

        # before 首次攻击帧（图已在启动加载完毕）
        pg_b.keyboard.press('KeyJ')
        pg_b.wait_for_timeout(400)
        pg_b.locator('#game').screenshot(path=str(OUT / 'before_first_attack_fx.png'))
        # before 首次技能帧（同帧对比用）
        pg_b.keyboard.press('KeyU')
        pg_b.wait_for_timeout(1200)
        pg_b.locator('#game').screenshot(path=str(OUT / 'before_first_skill_fx.png'))
        draw_timeline(OUT / 'before_boot_timeline.png', rec_b,
                      'BEFORE  boot timeline (.snap_v57)')
        br_b.close()

        # ---------- 2) after：懒加载 ----------
        log('== after：懒加载版本 ==')
        rec_a = {}
        br_a, pg_a = new_page(pw, AFTER_HTML, rec_a)
        summ_a = boot_summary(rec_a)
        result['after'] = summ_a
        log('首屏大图请求: %d 张 %s，字节 %d，pageerror=%d，console error=%d' % (
            summ_a['boot_requests'], summ_a['boot_names'], summ_a['boot_bytes'],
            len(summ_a['perr']), len(summ_a['cerr'])))
        log('SPR 键数=%s shieldBubble=%s' % (
            summ_a['probe']['keys'], summ_a['probe']['shieldBubble']))
        draw_timeline(OUT / 'after_boot_timeline.png', rec_a,
                      'AFTER  boot timeline (lazy load)')

        # 2a) 首次攻击：J → slash 懒加载
        log('-- 首次攻击（KeyJ）--')
        pg_a.keyboard.press('KeyJ')
        pg_a.wait_for_timeout(150)
        ok, el = wait_status(pg_a, 'slash', 'loaded', 3000)
        snap = pg_a.evaluate("() => window.PQAI_VFX.__snapshot()")
        result['latency']['attack_slash'] = {'loaded': ok, 'elapsed_ms': el,
                                             'internal_ms': snap['slash']['ms']}
        log('slash 懒加载: ok=%s 等待 %.1fms（内部 %sms）' % (ok, el, snap['slash']['ms']))
        pg_a.wait_for_timeout(200)
        pg_a.locator('#game').screenshot(path=str(OUT / 'after_first_attack_fx.png'))

        # 2b) 首次技能：新页面按 U（触发交互兜底 + 技能源图）
        log('-- 首次技能（KeyU，新冷启动页面）--')
        rec_skill = {}
        br_s, pg_s = new_page(pw, AFTER_HTML, rec_skill)
        pg_s.keyboard.press('KeyU')
        pg_s.wait_for_timeout(150)
        ok_fire, el_fire = wait_status(pg_s, 'fire', 'loaded', 3000)
        snap_s = pg_s.evaluate("() => window.PQAI_VFX.__snapshot()")
        probe_s = pg_s.evaluate(PROBE_JS)
        skill_src = ['fire', 'poison', 'lightning', 'shadow', 'heal']
        result['latency']['skill_fire'] = {'loaded': ok_fire, 'elapsed_ms': el_fire,
                                           'internal_ms': snap_s['fire']['ms']}
        result['latency']['skill_sources'] = {
            n: {'status': snap_s[n]['status'], 'internal_ms': snap_s[n]['ms']}
            for n in skill_src}
        result['latency']['skill_frames'] = probe_s['skillFrames']
        log('fire 懒加载: ok=%s 等待 %.1fms（内部 %sms）；烘焙帧=%s' % (
            ok_fire, el_fire, snap_s['fire']['ms'], probe_s['skillFrames']))
        pg_s.wait_for_timeout(300)
        pg_s.locator('#game').screenshot(path=str(OUT / 'after_first_skill_fx.png'))

        # 2c) shieldBubble 在位确认
        sb = probe_s['shieldBubble']
        result['shieldBubble'] = {'present': sb is not None, 'dim': sb,
                                  'gate': probe_s['gate']}
        log('shieldBubble: %s（就绪门 ready=%s missing=%s）' % (
            sb, probe_s['gate'] and probe_s['gate']['ready'],
            probe_s['gate'] and probe_s['gate']['missing']))
        pg_s.locator('#game').screenshot(path=str(OUT / 'after_shieldbubble_ok.png'))
        br_s.close()

        # ---------- 3) 20 次冷启动 ----------
        log('== 20 次冷启动 ==')
        cold = {'runs': [], 'pageerror': 0, 'console_error': 0,
                'spr_keys': [], 'boot_req_max': 0}
        for i in range(1, RUNS + 1):
            rec = {}
            br, pg = new_page(pw, AFTER_HTML, rec)
            p = rec['probe']
            non_fetch = [m for m in rec['cerr']
                         if not re.search(r'fetch|Failed to load|net::ERR|resource', m, re.I)]
            cold['pageerror'] += len(rec['perr'])
            cold['console_error'] += len(non_fetch)
            cold['spr_keys'].append(p['keys'])
            cold['boot_req_max'] = max(cold['boot_req_max'],
                                       boot_summary(rec)['boot_requests'])
            cold['runs'].append({'i': i, 'keys': p['keys'],
                                 'perr': len(rec['perr']), 'cerr': len(non_fetch),
                                 'boot_req': boot_summary(rec)['boot_requests'],
                                 'shieldBubble': p['shieldBubble']})
            br.close()
            log('启动 %2d: 键数=%d pageerror=%d consoleErr=%d 首屏大图=%d' % (
                i, p['keys'], len(rec['perr']), len(non_fetch),
                boot_summary(rec)['boot_requests']))
        cold['spr_keys_min'] = min(cold['spr_keys'])
        cold['spr_keys_max'] = max(cold['spr_keys'])
        result['cold_starts'] = cold
        br_a.close()

    # ---------- 4) JSON 产物 ----------
    def strip_bytes(s):
        return {k: v for k, v in s.items() if k not in ('perr', 'cerr')}

    before_json = {'boot': strip_bytes(result['before']),
                   'disk_total_bytes': sum(DISK.values()),
                   'disk_per_file': DISK}
    after_json = {'boot': strip_bytes(result['after']),
                  'latency': result['latency'],
                  'shieldBubble': result['shieldBubble'],
                  'cold_starts': {k: v for k, v in result['cold_starts'].items()
                                  if k != 'runs'}}
    (OUT / 'vfx_before.json').write_text(
        json.dumps(before_json, ensure_ascii=False, indent=2), encoding='utf-8')
    (OUT / 'vfx_after.json').write_text(
        json.dumps(after_json, ensure_ascii=False, indent=2), encoding='utf-8')

    # ---------- 5) 断言 ----------
    failures = []
    if summ_a['boot_requests'] > 1:
        failures.append('首屏大图请求 %d > 1' % summ_a['boot_requests'])
    if cold['pageerror'] != 0:
        failures.append('pageerror %d' % cold['pageerror'])
    if cold['console_error'] != 0:
        failures.append('非 Fetch console error %d' % cold['console_error'])
    if not result['shieldBubble']['present']:
        failures.append('shieldBubble 启动缺失')
    if cold['spr_keys_min'] != summ_b['probe']['keys']:
        failures.append('SPR 键数不一致: after min=%d before=%d' % (
            cold['spr_keys_min'], summ_b['probe']['keys']))
    if not result['latency']['attack_slash']['loaded']:
        failures.append('slash 首次使用未加载')
    if not result['latency']['skill_fire']['loaded']:
        failures.append('fire 首次使用未加载')

    log('')
    log('结论: %s' % ('ALL PASS' if not failures else 'FAIL: ' + '; '.join(failures)))
    log('SPR 键数 before=%d after min/max=%d/%d；首屏字节 before=%d after=%d' % (
        summ_b['probe']['keys'], cold['spr_keys_min'], cold['spr_keys_max'],
        summ_b['boot_bytes'], summ_a['boot_bytes']))

    (OUT / 'vfx_lazy_log.txt').write_text('\n'.join(lines), encoding='utf-8')
    if failures:
        sys.exit(1)


if __name__ == '__main__':
    main()
