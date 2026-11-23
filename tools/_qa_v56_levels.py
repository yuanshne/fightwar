# -*- coding: utf-8 -*-
"""
_qa_v56_levels.py —— D 线全量 31 关真机 QA（只读源码；只写 .screenshots/qa56 与本 tools 脚本）。

两遍扫描：
  Pass 1（便宜优先）：31 关逐关进入 → 截图 / 报错 / 黑屏 / 渲染 / 卡死 / FPS 采样。
  Pass 2（街机交互）：对检测到的街机小关再进一次，按键操作 12s，记录可玩度与报错。
  基线对照：同流程跑 .snap_before/index.html，输出 baseline 记录供报告归类存量/新引入。

用法：
  D:\\python\\python.exe tools/_qa_v56_levels.py            # 全量（当前源码 + 基线）
  D:\\python\\python.exe tools/_qa_v56_levels.py after     # 只跑当前源码
  D:\\python\\python.exe tools/_qa_v56_levels.py before    # 只跑基线
"""
import json
import pathlib
import sys
import time

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(r'C:\Users\A\Desktop\youxi')
QA = ROOT / '.screenshots' / 'qa56'
AFTER_HTML = ROOT / 'index.html'
BEFORE_HTML = ROOT / '.snap_before' / 'index.html'

LEVEL_WAIT_MS = 2000      # 进关后静置
FPS_SAMPLE_MS = 1000      # FPS 采样窗
STUCK_WAIT_MS = 1300      # 两次快照间隔（卡死判定）
ARCADE_PLAY_MS = 12000    # 街机关交互时长

PROFILE = {
    'unlocked': 31,
    'stars': {str(i): 3 for i in range(1, 32)},
    'equip': {'w': -1, 'h': -1, 'c': -1},
    'inv': [], 'shards': {}, 'nextId': 2, 'unlockAll': True,
    'skin': 'blue', 'skins': ['blue', 'sprout', 'crystal', 'azure', 'steel', 'ember',
        'ivory', 'starcore', 'jade', 'sunset', 'nebula', 'abyss', 'coral', 'tide',
        'wraith', 'magma', 'judge', 'spectra', 'holy', 'inferno'],
    'hero': 'knight',
}

INIT_JS = r"""
localStorage.setItem('pq_progress', JSON.stringify(%s));
window.__fpsFrames = 0; window.__fpsT0 = performance.now();
(function __fpsLoop(){ window.__fpsFrames++; requestAnimationFrame(__fpsLoop); })();
""" % json.dumps(PROFILE)

DIAG_JS = r"""
() => {
  const g = (typeof game !== 'undefined') ? game : {};
  const p = g.player; const b = g.boss;
  const ar = (window.ARCADE && ARCADE.active) ? ARCADE._state() : null;
  let dark = 0, total = 0, nonBlack = 0, pixelError = null;
  try {
    const c = document.getElementById('game');
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    for (let i = 0; i < d.length; i += 24) {
      total++;
      const s = d[i] + d[i+1] + d[i+2];
      if (s < 24) dark++; else nonBlack++;
    }
  } catch (e) { pixelError = String(e); }
  return {
    state: g.state, levelIdx: g.levelIdx,
    levelName: g.level && g.level.name || null,
    player: p ? { x: Math.round(p.x), y: Math.round(p.y), hp: p.hp, dead: !!p.dead } : null,
    boss: b ? { kind: b.kind, state: b.state, hidden: !!b.hidden, dead: !!b.dead } : null,
    arcade: ar ? { type: ar.type, hearts: ar.hearts, done: ar.done,
                   win: ar.win, t: Math.round(ar.t * 10) / 10 } : null,
    darkRatio: total ? dark / total : null,
    nonBlackRatio: total ? nonBlack / total : null,
    pixelError: pixelError,
  };
}
"""

SNAP_JS = r"""
() => {
  const g = (typeof game !== 'undefined') ? game : {};
  const p = g.player; const b = g.boss;
  const ar = (window.ARCADE && ARCADE.active) ? ARCADE._state() : null;
  return {
    state: g.state, time: Math.round((g.time || 0) * 100) / 100,
    px: p ? Math.round(p.x) : null, py: p ? Math.round(p.y) : null,
    boss: b ? { kind: b.kind, state: b.state } : null,
    arc: ar ? { type: ar.type, t: Math.round(ar.t * 10) / 10, hearts: ar.hearts, done: ar.done } : null,
  };
}
"""

META_JS = r"""
() => {
  const arr = (typeof ALL_LEVELS !== 'undefined') ? ALL_LEVELS : [];
  return arr.map((m, i) => ({
    idx: i, name: m.name || ('L' + (i + 1)), boss: !!m.boss,
    bossKind: m.boss === true ? 1 : m.boss, arcadeOnly: !!m.arcadeOnly, theme: m.theme,
  }));
}
"""

FPS_JS = "() => ({ f: window.__fpsFrames, t: performance.now() })"


def shot_dark_ratio(path: pathlib.Path) -> float:
    """从截图 PNG 估算近黑像素占比（canvas 被跨域污染时 getImageData 不可用，用 PIL 兜底）。"""
    try:
        im = Image.open(path).convert('RGB').resize((96, 56))
        px = list(im.getdata())
        dark = sum(1 for r, g, b in px if r + g + b < 24)
        return round(dark / len(px), 3)
    except Exception:
        return None


def file_url(html: pathlib.Path) -> str:
    return 'file:///' + str(html).replace('\\', '/')


def classify(meta, diag):
    if meta and meta.get('boss'):
        return 'boss'
    if diag and diag.get('arcade'):
        return 'arcade'
    return 'platform'


def stuck(s1, s2):
    if not s1 or not s2 or s1.get('state') != 'play':
        return False
    if s1.get('time') != s2.get('time'):
        return False
    if s1.get('px') != s2.get('px') or s1.get('py') != s2.get('py'):
        return False
    a1, a2 = s1.get('arc'), s2.get('arc')
    if a1 and a2 and a1.get('t') != a2.get('t'):
        return False
    return True


def sweep(pw, html: pathlib.Path, out_dir: pathlib.Path, label: str, do_arcade_pass=True):
    out_dir.mkdir(parents=True, exist_ok=True)
    br = pw.chromium.launch(headless=True)
    pg = br.new_page(viewport={'width': 1280, 'height': 800})
    errors = {'pageerror': [], 'console_error': []}

    def on_pageerror(e):
        errors['pageerror'].append(str(e))

    def on_console(m):
        if m.type == 'error':
            errors['console_error'].append(m.text)

    pg.on('pageerror', on_pageerror)
    pg.on('console', on_console)
    pg.add_init_script(INIT_JS)

    # 先取关卡元数据
    pg.goto(file_url(html), wait_until='domcontentloaded')
    pg.wait_for_timeout(1500)
    try:
        metas = pg.evaluate(META_JS)
    except Exception as e:
        metas = []
        print('  [warn] ALL_LEVELS 读取失败:', e)
    if not metas:
        metas = [{'idx': i, 'name': 'L%d' % (i + 1), 'boss': False,
                  'bossKind': None, 'arcadeOnly': False, 'theme': None} for i in range(31)]

    records = []
    arcade_levels = []

    for meta in metas:
        lv = meta['idx'] + 1
        errors['pageerror'].clear()
        errors['console_error'].clear()
        rec = {'level': lv, 'name': meta['name'], 'metaBoss': meta['boss'],
               'bossKind': meta['bossKind'], 'theme': meta['theme']}
        t0 = time.time()
        try:
            pg.goto('%s?level=%d&god=1' % (file_url(html), lv), wait_until='domcontentloaded')
            pg.wait_for_timeout(LEVEL_WAIT_MS)
            diag = pg.evaluate(DIAG_JS)
            snap1 = pg.evaluate(SNAP_JS)
            f1 = pg.evaluate(FPS_JS)
            pg.wait_for_timeout(STUCK_WAIT_MS)
            snap2 = pg.evaluate(SNAP_JS)
            f2 = pg.evaluate(FPS_JS)
            diag2 = pg.evaluate(DIAG_JS)

            dt = max((f2['t'] - f1['t']) / 1000, 1e-3)
            fps = round((f2['f'] - f1['f']) / dt, 1)

            kind = classify(meta, diag)
            rec.update({
                'kind': kind, 'state': diag.get('state'),
                'levelIdx': diag.get('levelIdx'),
                'player': diag.get('player'), 'boss': diag.get('boss'),
                'arcade': diag.get('arcade'),
                'darkRatio': diag.get('darkRatio'),
                'nonBlackRatio': diag.get('nonBlackRatio'),
                'fps': fps,
                'stuck': stuck(snap1, snap2),
                'pageerror': list(errors['pageerror']),
                'console_error': list(errors['console_error']),
                'elapsed_s': round(time.time() - t0, 1),
            })

            shot_name = 'level_%02d_%s.png' % (lv, kind)
            shot_path = out_dir / shot_name
            pg.locator('#game').screenshot(path=str(shot_path))
            rec['shot'] = shot_name
            pil_dark = shot_dark_ratio(shot_path)
            rec['shotDarkRatio'] = pil_dark

            # 黑屏判定：>97% 近黑像素，且无玩家/Boss/街机态
            no_entity = not diag.get('player') and not diag.get('boss') and not diag.get('arcade')
            dark_ref = pil_dark if pil_dark is not None else (diag.get('darkRatio') or 0)
            rec['blackScreen'] = bool((dark_ref or 0) > 0.97 and no_entity)
            rec['entered'] = diag.get('state') in ('play', 'clear', 'fail')

            # Boss 关：钉一次 windup 再截一张（仅目检，不连拍四阶段）
            if kind == 'boss':
                try:
                    w = pg.evaluate(r"""
                      () => { const b = game.boss; if (!b) return null;
                        b.state = 'windup'; b.t = 0; b.hidden = false; b.dead = false;
                        return { kind: b.kind, state: b.state }; }""")
                    pg.wait_for_timeout(350)
                    if w:
                        wshot = 'level_%02d_boss_windup.png' % lv
                        pg.locator('#game').screenshot(path=str(out_dir / wshot))
                        rec['windupShot'] = wshot
                except Exception as e:
                    rec['windupError'] = str(e)

            if kind == 'arcade':
                arcade_levels.append(lv)
        except Exception as e:
            rec.update({'error': str(e), 'entered': False,
                        'pageerror': list(errors['pageerror']),
                        'console_error': list(errors['console_error'])})
            print('  L%d EXC %s' % (lv, e))
        records.append(rec)
        print('  L%02d [%s] state=%s fps=%s dark=%.2f stuck=%s errs=%d' % (
            lv, rec.get('kind', '?'), rec.get('state'), rec.get('fps'),
            rec.get('darkRatio') or 0, rec.get('stuck'),
            len(rec.get('pageerror', [])) + len(rec.get('console_error', []))))

    # Pass 2：街机关按键交互
    if do_arcade_pass and arcade_levels:
        print('  -- 街机交互 pass：%d 关 --' % len(arcade_levels))
        for lv in arcade_levels:
            errors['pageerror'].clear()
            errors['console_error'].clear()
            rec = next(r for r in records if r['level'] == lv)
            try:
                pg.goto('%s?level=%d&god=1' % (file_url(html), lv), wait_until='domcontentloaded')
                pg.wait_for_timeout(1200)
                # 启发式按键串：左右移动 + 跳 + 攻击 + 冲刺
                plan = [('ArrowLeft', 500), ('ArrowRight', 500), ('Space', 120),
                        ('KeyJ', 150), ('ArrowRight', 400), ('KeyK', 120),
                        ('KeyJ', 150), ('ArrowLeft', 400), ('Space', 120), ('KeyJ', 150)]
                for code, ms in plan:
                    pg.keyboard.down(code)
                    pg.wait_for_timeout(ms)
                    pg.keyboard.up(code)
                pg.wait_for_timeout(300)
                diag = pg.evaluate(DIAG_JS)
                f1 = pg.evaluate(FPS_JS)
                pg.wait_for_timeout(800)
                f2 = pg.evaluate(FPS_JS)
                dt = max((f2['t'] - f1['t']) / 1000, 1e-3)
                rec['arcadePlay'] = {
                    'after': diag.get('arcade'), 'state': diag.get('state'),
                    'fps': round((f2['f'] - f1['f']) / dt, 1),
                    'pageerror': list(errors['pageerror']),
                    'console_error': list(errors['console_error']),
                }
                pg.locator('#game').screenshot(path=str(out_dir / ('arcade_%02d.png' % lv)))
                rec['arcadeShot'] = 'arcade_%02d.png' % lv
            except Exception as e:
                rec.setdefault('arcadePlay', {})['error'] = str(e)
                print('  arcade L%d EXC %s' % (lv, e))

    br.close()
    return {'label': label, 'html': str(html), 'ran': time.strftime('%Y-%m-%d %H:%M:%S'),
            'count': len(records), 'records': records}


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'all'
    QA.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        if mode in ('all', 'after'):
            res = sweep(pw, AFTER_HTML, QA, 'v54-after')
            (QA / 'qa56_levels.json').write_text(
                json.dumps(res, ensure_ascii=False, indent=2), encoding='utf-8')
            print('AFTER 完成：%d 关 -> %s' % (res['count'], QA / 'qa56_levels.json'))
        if mode in ('all', 'before'):
            resb = sweep(pw, BEFORE_HTML, QA / 'baseline', 'snap-before',
                         do_arcade_pass=False)
            (QA / 'qa56_levels_baseline.json').write_text(
                json.dumps(resb, ensure_ascii=False, indent=2), encoding='utf-8')
            print('BEFORE 完成：%d 关 -> %s' % (resb['count'], QA / 'qa56_levels_baseline.json'))


if __name__ == '__main__':
    main()
