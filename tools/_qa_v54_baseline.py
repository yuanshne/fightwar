# -*- coding: utf-8 -*-
"""
_qa_v54_baseline.py —— 阶段 A：改动前基线（只读 .snap_before 冻结副本，禁止修改该目录）。

采集：
  1. 启动零错误基线（pageerror / console error 全量收集）
  2. 骑士：默认 blue + 3 套非 blue（sprout/crystal/azure）× idle/run/attack；带装备进关画面
  3. 法师：blue + 3 套非 blue × idle/cast/attack
  4. 14 只 Boss（kind 1..14）idle + 强制 windup 连拍
  5. 旧帧尺寸审计：运行时读取 SPR 主角/法师帧真实宽高，记录 16×16（bug 基线）

输出：.screenshots/qa/before/before_*.png + baseline.json
用法：D:\\python\\python.exe tools/_qa_v54_baseline.py
"""
import json
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from _qa_v54_common import (  # noqa: E402
    AFTER_DIR, BEFORE_DIR, BOSS_LEVEL_KIND, BEFORE_HTML, KNIGHT_SKINS, MAGE_SKINS,
    audit_frames, boss_view_box, clear_boss_hold, file_url, freeze_boss, goto_level,
    inject_progress, install_boss_hold, new_context, seed_profile, setup_character, shot,
    summarize_16x16, write_json,
)

SAMPLE_NONBLUE = ['sprout', 'crystal', 'azure']
EQUIPPED = {'w': 1, 'h': 2, 'c': 3}
EQUIPPED_INV = [{'id': 1, 'slot': 'w', 'r': 4}]

POSE_JS = r"""
(pose) => {
  const p = game.player; if (!p) return false;
  p.dashT = 0; p.atkWind = 0; p.dead = false; p.invT = 99;
  if (pose === 'run') { p.vx = 24; p.onGround = true; p.animT = (p.animT || 0) + 0.25; }
  else if (pose === 'attack') { p.vx = 0; p.onGround = true; p.atkT = 0.16; p.castT = 0; }
  else if (pose === 'cast') { p.vx = 0; p.onGround = true; p.castT = 0.3; p.atkT = 0; }
  else { p.vx = 0; p.onGround = true; p.atkT = 0; p.castT = 0; }
  return { state: game.state, hero: game.hero, x: Math.round(p.x), y: Math.round(p.y) };
}
"""


def force_pose(pg, pose):
    return pg.evaluate(POSE_JS, pose)


def main():
    report = {'meta': {'base': str(BEFORE_HTML), 'phase': 'before',
                       'started': time.strftime('%Y-%m-%d %H:%M:%S')},
              'errors': {'pageerror': [], 'console_error': []},
              'knight': [], 'mage': [], 'boss': [], 'audit': {}, 'smoke': []}

    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        br, pg, errors = new_context(pw)

        # ---- 1. 启动零错误基线（标题屏，不进关） ----
        pg.goto(file_url(BEFORE_HTML))
        pg.wait_for_timeout(2500)
        title_state = pg.evaluate("() => ({ state: game ? game.state : 'no-game', hero: game ? game.hero : '-' })")
        shot(pg, BEFORE_DIR / 'before_title.png')
        report['smoke'].append({'scene': 'title', 'info': title_state})

        # ---- 2. 骑士（用平台 Boss 关 L7，街机小关里看不到角色） ----
        for skin in ['blue'] + SAMPLE_NONBLUE:
            prof = seed_profile(hero='knight', skin=skin)
            goto_level(pg, BEFORE_HTML, level=7, hero='knight', profile=prof, wait=1600)
            for pose in ['idle', 'run', 'attack']:
                setup_character(pg)
                info = force_pose(pg, pose)
                pg.wait_for_timeout(120)
                fn = 'before_knight_%s_%s.png' % (skin, pose)
                shot(pg, BEFORE_DIR / fn)
                report['knight'].append({'skin': skin, 'pose': pose, 'file': fn, 'info': info})

        # 带装备进关画面
        prof = seed_profile(hero='knight', skin='sprout', equip=EQUIPPED, inv=EQUIPPED_INV)
        goto_level(pg, BEFORE_HTML, level=7, hero='knight', profile=prof, wait=1600)
        setup_character(pg)
        force_pose(pg, 'idle')
        pg.wait_for_timeout(120)
        eq_info = pg.evaluate("() => { const p = JSON.parse(localStorage.getItem('pq_progress')||'{}');"
                              " return { equip: game.equip, inv: p.inv, skin: p.skin }; }")
        shot(pg, BEFORE_DIR / 'before_knight_equipped.png')
        report['knight'].append({'skin': 'sprout', 'pose': 'idle-equipped',
                                 'file': 'before_knight_equipped.png', 'info': eq_info})

        # ---- 3. 法师（平台 Boss 关 L7） ----
        for skin in ['blue'] + SAMPLE_NONBLUE:
            prof = seed_profile(hero='mage', skin=skin)
            goto_level(pg, BEFORE_HTML, level=7, hero='mage', profile=prof, wait=1600)
            for pose in ['idle', 'cast', 'attack']:
                setup_character(pg)
                info = force_pose(pg, pose)
                pg.wait_for_timeout(120)
                fn = 'before_mage_%s_%s.png' % (skin, pose)
                shot(pg, BEFORE_DIR / fn)
                report['mage'].append({'skin': skin, 'pose': pose, 'file': fn, 'info': info})

        # ---- 4. 14 只 Boss：idle + windup 连拍 ----
        for level, kind in BOSS_LEVEL_KIND:
            prof = seed_profile(hero='knight')
            goto_level(pg, BEFORE_HTML, level=level, hero='knight', profile=prof, wait=1600)
            idle = freeze_boss(pg, kind, state='idle', t=0.0)
            pg.wait_for_timeout(300)
            box = boss_view_box(pg)
            fn_idle = 'before_boss_k%02d_idle.png' % kind
            shot(pg, BEFORE_DIR / fn_idle)
            report['boss'].append({'kind': kind, 'level': level, 'state': 'idle',
                                   'file': fn_idle, 'info': idle, 'box': box})

            next_move = None
            wind_frames = []
            install_boss_hold(pg, kind, 'windup', next_move)
            for i, t in enumerate([0.05, 0.30, 0.55], start=1):
                pg.evaluate("(t) => { const b = game.boss; if (b) { b.t = t; } }", t)
                pg.wait_for_timeout(150)
                fn = 'before_boss_k%02d_windup_%d.png' % (kind, i)
                shot(pg, BEFORE_DIR / fn)
                wind_frames.append(fn)
            clear_boss_hold(pg)
            report['boss'].append({'kind': kind, 'level': level, 'state': 'windup',
                                   'files': wind_frames})

        # ---- 5. 帧尺寸审计（2s 与 12s 两次） ----
        goto_level(pg, BEFORE_HTML, level=1, hero='knight',
                   profile=seed_profile(hero='knight'), wait=1800)
        audit_early = audit_frames(pg)
        n16_early, bad_early = summarize_16x16(audit_early)
        pg.wait_for_timeout(12000)  # 等异步 AI 帧重压结束
        audit_late = audit_frames(pg)
        n16_late, bad_late = summarize_16x16(audit_late)
        report['audit'] = {
            'early_2s': {'count_16x16': n16_early, 'bad_frames': bad_early, 'audit': audit_early},
            'late_12s': {'count_16x16': n16_late, 'bad_frames': bad_late, 'audit': audit_late},
        }

        report['errors'] = errors
        br.close()

    qa_json = pathlib.Path(__file__).resolve().parent.parent / '.screenshots' / 'qa' / 'baseline.json'
    write_json(report, qa_json)
    print('=== 基线完成 ===')
    print('pageerror:', len(errors['pageerror']), ' console_error:', len(errors['console_error']))
    print('16×16 帧：2s 时 %d，12s 后 %d' % (n16_early, n16_late))
    for b in bad_late[:40]:
        print('  ', b)
    print('截图目录:', BEFORE_DIR)


if __name__ == '__main__':
    main()
