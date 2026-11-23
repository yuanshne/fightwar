# -*- coding: utf-8 -*-
"""
_qa_v56_bot.py —— D 线 30 分钟 bot 连续试玩（只读源码；只写 .screenshots/qa56/bot）。

启发式输入：移动 / 跳 / 攻击 / 冲刺 / 交互，跨关卡连续跑；
每 2 分钟截图一张；持续收集 pageerror / console error / 卡死 / 黑屏 / FPS。
结算（clear/fail）停留超过 8s 自动跳下一关并记 auto_advance 事件（失败界面 Esc 才回选关，
bot 无法自主菜单导航，跳关是 QA 兜底，不代表玩家流程缺陷）。

用法：
  D:\\python\\python.exe tools/_qa_v56_bot.py 5      # 先跑 5 分钟（节点交付）
  D:\\python\\python.exe tools/_qa_v56_bot.py 30     # 全量 30 分钟
"""
import json
import pathlib
import random
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(r'C:\Users\A\Desktop\youxi')
QA = ROOT / '.screenshots' / 'qa56'
BOT_DIR = QA / 'bot'
HTML = ROOT / 'index.html'
TOTAL_LEVELS = 31

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
window.__fpsFrames = 0;
(function __fpsLoop(){ window.__fpsFrames = (window.__fpsFrames||0) + 1; requestAnimationFrame(__fpsLoop); })();
""" % json.dumps(PROFILE)

DIAG_JS = r"""
() => {
  const g = (typeof game !== 'undefined') ? game : {};
  const p = g.player; const b = g.boss;
  const ar = (window.ARCADE && ARCADE.active) ? ARCADE._state() : null;
  let dark = 0, total = 0;
  try {
    const c = document.getElementById('game');
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    for (let i = 0; i < d.length; i += 24) { total++; if (d[i]+d[i+1]+d[i+2] < 24) dark++; }
  } catch (e) {}
  return {
    state: g.state, levelIdx: g.levelIdx, time: Math.round((g.time||0)*100)/100,
    deaths: g.deaths, coins: g.coins,
    player: p ? { x: Math.round(p.x), y: Math.round(p.y), hp: p.hp, dead: !!p.dead } : null,
    boss: b ? { kind: b.kind, state: b.state, dead: !!b.dead } : null,
    arcade: ar ? { type: ar.type, hearts: ar.hearts, done: ar.done, win: ar.win } : null,
    darkRatio: total ? dark / total : null,
  };
}
"""

FPS_JS = "() => ({ f: window.__fpsFrames || 0, t: performance.now() })"

MOVE_KEYS = ['ArrowLeft', 'ArrowRight']
ACT_KEYS = ['Space', 'KeyJ', 'KeyK', 'ArrowDown']


def file_url() -> str:
    return 'file:///' + str(HTML).replace('\\', '/')


def main():
    minutes = float(sys.argv[1]) if len(sys.argv) > 1 else 30
    duration = minutes * 60
    BOT_DIR.mkdir(parents=True, exist_ok=True)
    random.seed(56)

    errors = {'pageerror': [], 'console_error': []}
    events = []
    level_visits = {}
    fps_samples = []
    held = set()

    with sync_playwright() as pw:
        br = pw.chromium.launch(headless=True)
        pg = br.new_page(viewport={'width': 1280, 'height': 800})
        t0 = time.time()

        def on_pageerror(e):
            errors['pageerror'].append({'t': round(time.time() - t0, 1), 'msg': str(e)})

        def on_console(m):
            if m.type == 'error':
                errors['console_error'].append({'t': round(time.time() - t0, 1), 'msg': m.text})

        pg.on('pageerror', on_pageerror)
        pg.on('console', on_console)
        pg.add_init_script(INIT_JS)

        cur_lv = 1
        pg.goto(file_url() + '?level=%d&god=1' % cur_lv, wait_until='domcontentloaded')
        pg.wait_for_timeout(1500)

        last_snap = None
        stuck_since = None
        state_since = 0.0
        level_enter_elapsed = 0.0
        last_level_idx = None
        last_shot_min = -1
        fps_window_start = 0.0
        last_fps_mark = pg.evaluate(FPS_JS)
        current_dir = None

        def release_all():
            for c in list(held):
                try:
                    pg.keyboard.up(c)
                except Exception:
                    pass
            held.clear()

        def advance(reason):
            nonlocal cur_lv, state_since, level_enter_elapsed
            cur_lv = cur_lv % TOTAL_LEVELS + 1
            now_el = time.time() - t0
            events.append({'t': round(now_el, 1), 'type': 'auto_advance',
                           'reason': reason,
                           'from': cur_lv - 1 if cur_lv > 1 else TOTAL_LEVELS, 'to': cur_lv})
            pg.goto(file_url() + '?level=%d&god=1' % cur_lv, wait_until='domcontentloaded')
            pg.wait_for_timeout(800)
            state_since = now_el
            level_enter_elapsed = now_el
            last_fps_mark = pg.evaluate(FPS_JS)
            fps_window_start = now_el

        while time.time() - t0 < duration:
            now = time.time()
            elapsed = now - t0
            try:
                diag = pg.evaluate(DIAG_JS)
            except Exception as e:
                events.append({'t': round(elapsed, 1), 'type': 'diag_error', 'msg': str(e)})
                pg.wait_for_timeout(500)
                continue

            li = diag.get('levelIdx')
            if li is not None:
                level_visits[li] = level_visits.get(li, 0) + 1
                if last_level_idx is not None and li != last_level_idx:
                    level_enter_elapsed = elapsed
                last_level_idx = li

            # ---- 卡死检测：play 态且快照连续 3s 不变 ----
            sig = (diag.get('state'), diag.get('time'),
                   diag.get('player') and diag['player'].get('x'),
                   diag.get('player') and diag['player'].get('y'),
                   diag.get('arcade') and diag['arcade'].get('type'),
                   diag.get('arcade') and diag['arcade'].get('hearts'))
            if diag.get('state') == 'play' and last_snap == sig:
                if stuck_since is None:
                    stuck_since = elapsed
                elif elapsed - stuck_since >= 3.0:
                    events.append({'t': round(elapsed, 1), 'type': 'stuck',
                                   'level': li + 1 if li is not None else None, 'sig': list(sig)})
                    stuck_since = elapsed
            else:
                stuck_since = None
            last_snap = sig

            # ---- 黑屏检测 ----
            if (diag.get('darkRatio') or 0) > 0.97 and diag.get('state') == 'play':
                events.append({'t': round(elapsed, 1), 'type': 'black_screen',
                               'level': li + 1 if li is not None else None})

            state = diag.get('state')
            if state in ('clear', 'fail'):
                release_all()
                if state == 'clear':
                    pg.keyboard.press(random.choice(['Enter', 'Space']))
                else:
                    pg.keyboard.press('Escape')
                if elapsed - state_since > 8:
                    advance('settle:' + state)
            else:
                state_since = elapsed
                # 同关滞留 >90s 兜底跳关（bot 解不出的关卡不卡死长跑）
                if elapsed - level_enter_elapsed > 90:
                    advance('timeout:90s')
                # 方向键：每 0.5~1.2s 换一次方向
                if current_dir is None or random.random() < 0.25:
                    current_dir = random.choice(MOVE_KEYS + [None])
                for c in MOVE_KEYS:
                    if c == current_dir and c not in held:
                        pg.keyboard.down(c); held.add(c)
                    elif c != current_dir and c in held:
                        pg.keyboard.up(c); held.discard(c)
                if random.random() < 0.18:
                    pg.keyboard.press(random.choice(ACT_KEYS))

            # ---- FPS 采样（每 5s 一个均值） ----
            if elapsed - fps_window_start >= 5:
                try:
                    f2 = pg.evaluate(FPS_JS)
                    dt = max((f2['t'] - last_fps_mark['t']) / 1000, 1e-3)
                    fps = round((f2['f'] - last_fps_mark['f']) / dt, 1)
                    fps_samples.append({'t': round(elapsed, 1), 'fps': fps,
                                        'level': li + 1 if li is not None else None})
                    last_fps_mark = f2
                except Exception as e:
                    events.append({'t': round(elapsed, 1), 'type': 'fps_error', 'msg': str(e)})
                fps_window_start = elapsed

            # ---- 每 2 分钟截图 ----
            shot_min = int(elapsed // 120)
            if shot_min != last_shot_min:
                last_shot_min = shot_min
                name = 'bot_t%02dmin.png' % shot_min
                try:
                    pg.locator('#game').screenshot(path=str(BOT_DIR / name))
                    events.append({'t': round(elapsed, 1), 'type': 'screenshot', 'shot': name,
                                   'level': li + 1 if li is not None else None,
                                   'state': state, 'diag': diag})
                except Exception as e:
                    events.append({'t': round(elapsed, 1), 'type': 'shot_error', 'msg': str(e)})

            if int(elapsed) % 15 == 0:
                write_report(t0, duration, errors, events, level_visits, fps_samples, BOT_DIR)

            pg.wait_for_timeout(120)

        release_all()
        br.close()

    write_report(t0, duration, errors, events, level_visits, fps_samples, BOT_DIR)
    print(json.dumps(summarize(errors, events, level_visits, fps_samples),
                     ensure_ascii=False, indent=2))


def write_report(t0, duration, errors, events, level_visits, fps_samples, bot_dir):
    report = {
        'ran': time.strftime('%Y-%m-%d %H:%M:%S'),
        'duration_s': round(duration, 1),
        'levels_visited': {str(k + 1): v for k, v in sorted(level_visits.items())},
        'level_count': len(level_visits),
        'events': events,
        'errors': errors,
        'fps_samples': fps_samples,
    }
    (bot_dir / 'qa56_bot.json').write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')


def summarize(errors, events, level_visits, fps_samples):
    stuck = [e for e in events if e['type'] == 'stuck']
    black = [e for e in events if e['type'] == 'black_screen']
    shots = [e for e in events if e['type'] == 'screenshot']
    advances = [e for e in events if e['type'] == 'auto_advance']
    fps_vals = [s['fps'] for s in fps_samples if 0 <= s['fps'] <= 240]
    return {
        'level_count': len(level_visits),
        'levels': sorted(k + 1 for k in level_visits),
        'auto_advances': len(advances),
        'stuck_events': len(stuck),
        'black_screen_events': len(black),
        'screenshots': len(shots),
        'pageerror_count': len(errors['pageerror']),
        'console_error_count': len(errors['console_error']),
        'pageerror_samples': errors['pageerror'][:10],
        'console_error_samples': errors['console_error'][:10],
        'fps_avg': round(sum(fps_vals) / len(fps_vals), 1) if fps_vals else None,
        'fps_min': min(fps_vals) if fps_vals else None,
        'fps_low_levels': sorted({s['level'] for s in fps_samples if s['fps'] < 30}),
    }


if __name__ == '__main__':
    main()
