# -*- coding: utf-8 -*-
"""
_v56_perf_probe.py —— 卡点 E：冷启动/素材/FPS/内存 性能采集探针。
只读源码，只写 .screenshots/e_perf/ 与本脚本；不改任何游戏逻辑/数值/视觉管线。

用法：
  D:\\python\\python.exe tools/_v56_perf_probe.py --transport file --out perf_before.json
  D:\\python\\python.exe tools/_v56_perf_probe.py --transport both --out perf_after.json
  D:\\python\\python.exe tools/_v56_perf_probe.py --transport http  --out perf_http.json

采集口径：
  - 冷启动→可操作：init 脚本 t0 → PQ_PERF_BOOT.mark('playable')（game.player 存在且 tick 连续推进 2 步）
  - 素材耗时：包装 Image 构造器，记录 src 赋值起 → load/error 止、naturalWidth/Height、同 URL 实例数
  - fetch：包装 window.fetch 记录 manifest 等请求耗时
  - FPS：perf_boot.js 独立 rAF 计数，可操作之后窗口内的均值/最低帧/低于 30fps 占比
  - 内存：performance.memory.usedJSHeapSize（不可用时退化为 canvas 像素 ×4 粗算）
"""
import argparse
import json
import pathlib
import statistics
import subprocess
import sys
import time
from urllib.parse import urlparse, unquote

ROOT = pathlib.Path(r'C:\Users\A\Desktop\youxi')
OUT_DIR = ROOT / '.screenshots' / 'e_perf'
OUT_DIR.mkdir(parents=True, exist_ok=True)

NORMAL_LEVEL = 1
BOSS_LEVEL = 7

INIT_JS = r"""
(function () {
  var t0 = performance.now();
  var assets = [], fetches = [], dup = {};
  window.__PERF_T0 = t0;
  window.__PERF_ASSETS = assets;
  window.__PERF_FETCH = fetches;
  window.__PERF_DUP = dup;

  var OrigImage = window.Image;
  var srcDesc = Object.getOwnPropertyDescriptor(OrigImage.prototype, 'src');
  function norm(u) { return String(u || '').split('?')[0].replace(/^\.\//, ''); }

  function WrappedImage() {
    var img = new OrigImage();
    var rec = { url: null, norm: null, start: null, end: null, dur: null,
                w: 0, h: 0, error: false, instances: 0 };
    assets.push(rec);
    Object.defineProperty(img, 'src', {
      set: function (u) {
        rec.url = String(u); rec.norm = norm(u);
        rec.start = performance.now() - t0;
        var n = rec.norm;
        dup[n] = (dup[n] || 0) + 1;
        rec.instances = dup[n];
        srcDesc.set.call(this, u);
      },
      get: function () { return srcDesc.get.call(this); },
      configurable: true
    });
    img.addEventListener('load', function () {
      rec.end = performance.now() - t0;
      rec.dur = rec.start != null ? rec.end - rec.start : null;
      rec.w = img.naturalWidth; rec.h = img.naturalHeight;
    });
    img.addEventListener('error', function () {
      rec.error = true;
      rec.end = performance.now() - t0;
      rec.dur = rec.start != null ? rec.end - rec.start : null;
    });
    return img;
  }
  WrappedImage.prototype = OrigImage.prototype;
  window.Image = WrappedImage;

  if (typeof fetch === 'function') {
    var origFetch = window.fetch;
    window.fetch = function (u) {
      var rec = { url: String(u), start: performance.now() - t0, end: null, dur: null, ok: false };
      fetches.push(rec);
      var p = origFetch.apply(this, arguments);
      Promise.resolve(p).then(function (r) {
        rec.ok = !!(r && r.ok);
        rec.end = performance.now() - t0; rec.dur = rec.end - rec.start;
        return r;
      }).catch(function () {
        rec.end = performance.now() - t0; rec.dur = rec.end - rec.start;
      });
      return p;
    };
  }
})();
"""


def pct(values, q):
    if not values:
        return None
    s = sorted(values)
    k = (len(s) - 1) * q
    lo = int(k)
    hi = min(lo + 1, len(s) - 1)
    if lo == hi:
        return round(s[lo], 2)
    return round(s[lo] + (s[hi] - s[lo]) * (k - lo), 2)


def resolve_local_size(url):
    """把资源 URL 映射回本地文件，返回字节数；找不到返回 None。"""
    if not url:
        return None
    url = str(url).split('?')[0]
    try:
        if '://' in url:
            pr = urlparse(url)
            rel = unquote(pr.path).lstrip('/')
            if url.startswith('file:///'):
                # Windows file:///C:/... → 绝对路径直接解析
                if len(rel) > 1 and rel[1] == ':':
                    p = pathlib.Path(rel.replace('/', '\\'))
                else:
                    p = ROOT / rel
            else:
                p = ROOT / rel
        else:
            p = ROOT / url.lstrip('./')
        if p.is_file():
            return p.stat().st_size
    except Exception:
        return None
    return None


def trial(pw, base_url, level, label, idx, shots_dir, fps_window_ms, transport='file'):
    br = pw.chromium.launch(headless=True)
    pg = br.new_page(viewport={'width': 1280, 'height': 800}, device_scale_factor=1)
    pg.add_init_script(INIT_JS)
    errors = {'pageerror': [], 'console_error': []}
    pg.on('pageerror', lambda e: errors['pageerror'].append(str(e)))
    pg.on('console', lambda m: errors['console_error'].append(m.text) if m.type == 'error' else None)

    url = base_url + ('&' if '?' in base_url else '?') + 'level=%d&god=1' % level
    pg.goto(url, wait_until='load')

    playable = None
    deadline = time.time() + 9
    while time.time() < deadline:
        v = pg.evaluate(
            "() => { var b=window.PQ_PERF_BOOT; return (b&&b.marks)?b.marks().playable:null; }")
        if v is not None:
            playable = v
            break
        pg.wait_for_timeout(100)

    pg.wait_for_timeout(fps_window_ms)

    report = pg.evaluate("() => window.PQ_PERF_BOOT ? window.PQ_PERF_BOOT.report() : null")
    assets = pg.evaluate("() => window.__PERF_ASSETS || []")
    fetches = pg.evaluate("() => window.__PERF_FETCH || []")
    dups = pg.evaluate("() => window.__PERF_DUP || {}")

    for a in assets:
        a['sizeBytes'] = resolve_local_size(a.get('url'))

    shot_name = '%s_%s_L%d_%02d.png' % (transport, label, level, idx)
    shot_path = shots_dir / shot_name
    pg.locator('#game').screenshot(path=str(shot_path))
    br.close()

    return {
        'level': level,
        'playableMs': playable,
        'report': report,
        'assets': assets,
        'fetches': fetches,
        'duplicates': dups,
        'errors': errors,
        'screenshot': str(shot_path),
    }


def summarize_group(recs):
    play = [r['playableMs'] for r in recs if r['playableMs'] is not None]
    fps = [r['report']['fps'] for r in recs if r['report'] and r['report'].get('fps')]
    heaps = []
    for r in recs:
        if r['report'] and r['report'].get('memory'):
            for m in r['report']['memory']:
                if m.get('heapBytes'):
                    heaps.append(m['heapBytes'])
    # 素材聚合：按 norm 路径合并；同时统计可操作前已解码字节
    by_url = {}
    early_bytes = 0
    late_bytes = 0
    for r in recs:
        playable = r['playableMs']
        for a in r['assets']:
            key = a.get('norm') or a.get('url')
            e = by_url.setdefault(key, {'url': key, 'durations': [], 'starts': [],
                                        'ends': [], 'sizes': set(), 'widths': set(),
                                        'heights': set(), 'errors': 0, 'instances': 0})
            if a.get('dur') is not None:
                e['durations'].append(a['dur'])
            if a.get('start') is not None:
                e['starts'].append(a['start'])
            if a.get('end') is not None:
                e['ends'].append(a['end'])
            if a.get('sizeBytes'):
                e['sizes'].add(a['sizeBytes'])
                if playable is not None and a.get('end') is not None and a['end'] <= playable + 100:
                    early_bytes += a['sizeBytes']
                else:
                    late_bytes += a['sizeBytes']
            if a.get('w'):
                e['widths'].add(a['w'])
            if a.get('h'):
                e['heights'].add(a['h'])
            if a.get('error'):
                e['errors'] += 1
            e['instances'] = max(e['instances'], a.get('instances') or 1)
    assets_agg = []
    for key, e in by_url.items():
        assets_agg.append({
            'url': key,
            'avgDurMs': round(statistics.mean(e['durations']), 2) if e['durations'] else None,
            'maxDurMs': round(max(e['durations']), 2) if e['durations'] else None,
            'avgStartMs': round(statistics.mean(e['starts']), 2) if e['starts'] else None,
            'avgEndMs': round(statistics.mean(e['ends']), 2) if e['ends'] else None,
            'sizeBytes': next(iter(e['sizes']), None),
            'px': (next(iter(e['widths']), None), next(iter(e['heights']), None)),
            'errors': e['errors'],
            'instances': e['instances'],
        })
    assets_agg.sort(key=lambda x: -(x['maxDurMs'] or 0))

    dup_src = recs[0]['duplicates'].items() if recs else {}
    dup = {u: c for u, c in dup_src if c > 1}
    sample_report = next((r['report'] for r in recs if r['report']), None)
    return {
        'trials': len(recs),
        'playableMs': {
            'median': pct(play, 0.5), 'p90': pct(play, 0.9), 'min': pct(play, 0),
            'max': pct(play, 1.0), 'samples': [round(x, 2) for x in play],
        },
        'fps': {
            'mean': [f['meanFps'] for f in fps if f.get('meanFps') is not None],
            'minFrameMs': [f['minFrameMs'] for f in fps if f.get('minFrameMs') is not None],
            'lowShare': [f['lowFpsShare'] for f in fps],
        },
        'heapBytes': {'median': pct(heaps, 0.5), 'max': pct(heaps, 1.0),
                      'samples': heaps},
        'assets': assets_agg,
        'earlyBytesBeforePlayable': early_bytes,
        'lateBytesAfterPlayable': late_bytes,
        'duplicateUrls': dup,
        'sampleMarks': sample_report['marks'] if sample_report else None,
        'sampleMemory': sample_report['memory'] if sample_report else None,
        'errors': [{'level': r['level'], 'pageerror': r['errors']['pageerror'],
                    'console_error': r['errors']['console_error']} for r in recs],
    }


def run(pw, transport, base_url, trials, fps_window_ms, shots_dir):
    groups = {}
    for label, level in (('normal', NORMAL_LEVEL), ('boss', BOSS_LEVEL)):
        recs = []
        for i in range(1, trials + 1):
            recs.append(trial(pw, base_url, level, label, i, shots_dir, fps_window_ms, transport))
        groups[label] = summarize_group(recs)
    return groups


def start_http_server():
    proc = subprocess.Popen(
        [r'D:\python\python.exe', '-m', 'http.server', '8123', '--bind', '127.0.0.1'],
        cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.2)
    return proc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--transport', choices=['file', 'http', 'both'], default='file')
    ap.add_argument('--out', default='perf_before.json')
    ap.add_argument('--trials', type=int, default=3)
    ap.add_argument('--fps-window', type=int, default=10000)
    args = ap.parse_args()

    from playwright.sync_api import sync_playwright

    result = {'meta': {'root': str(ROOT), 'trials': args.trials,
                       'fpsWindowMs': args.fps_window, 'ts': time.time()},
              'file': None, 'http': None}

    http_proc = None
    try:
        with sync_playwright() as pw:
            if args.transport in ('file', 'both'):
                file_url = 'file:///' + str(ROOT / 'index.html').replace('\\', '/')
                result['file'] = run(pw, 'file', file_url, args.trials,
                                      args.fps_window, OUT_DIR)
            if args.transport in ('http', 'both'):
                http_proc = start_http_server()
                try:
                    result['http'] = run(pw, 'http', 'http://127.0.0.1:8123/index.html',
                                         args.trials, args.fps_window, OUT_DIR)
                finally:
                    http_proc.terminate()
                    http_proc = None
    finally:
        if http_proc is not None:
            http_proc.terminate()

    out_path = OUT_DIR / args.out
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print('written', out_path)
    for trans in ('file', 'http'):
        g = result.get(trans)
        if not g:
            continue
        for label in ('normal', 'boss'):
            gg = g[label]
            print('%-5s %-6s playable median=%s p90=%s fps=%s heap=%s assets=%d dup=%d' % (
                trans, label, gg['playableMs']['median'], gg['playableMs']['p90'],
                gg['fps']['mean'], gg['heapBytes']['median'],
                len(gg['assets']), len(gg['duplicateUrls'])))


if __name__ == '__main__':
    sys.exit(main())
