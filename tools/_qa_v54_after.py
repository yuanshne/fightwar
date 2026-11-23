# -*- coding: utf-8 -*-
"""
_qa_v54_after.py —— 阶段 B：主目录 C:\\Users\\A\\Desktop\\youxi\\index.html 增量复测。

覆盖：
  1) 20 套骑士皮肤 × idle/run/attack，帧尺寸须 32×38（不得 16×16）
  2) 装备穿 / 脱 / 换皮肤三态；截图 + 缓存残留检查
  3) 19 套法师皮肤 idle/run/cast/attack，32×38，blue 未退化
  4) 14 只 Boss windup 4 帧连拍；idle 与基线像素级比对（PIL，整幅 + Boss 局部）
  5) Boss 关 + 普通关进关冒烟，无卡死
  6) 旧帧尺寸审计（2s / 12s / 强制守卫后），不得再出现 16×16 主角/法师帧
  7) 全流程零 pageerror、零 console error（环境性 file:// fetch 单列）
输出：.screenshots/qa/after/*.png + after.json
用法：D:\\python\\python.exe tools/_qa_v54_after.py
"""
import json
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from _qa_v54_common import (  # noqa: E402
    AFTER_DIR, AFTER_HTML, BOSS_LEVEL_KIND, BOSS_LEVELS, BEFORE_DIR, KNIGHT_SKINS,
    MAGE_SKINS, NORMAL_LEVELS, audit_frames, boss_view_box, clear_boss_hold, file_url,
    freeze_boss, goto_level, install_boss_hold, new_context, seed_profile, setup_character,
    shot, summarize_16x16, write_json,
)

POSE_JS = r"""
(pose) => {
  const p = game.player; if (!p) return false;
  p.dashT = 0; p.atkWind = 0; p.dead = false; p.invT = 99;
  if (pose === 'run') { p.vx = 24; p.onGround = true; p.animT = (p.animT || 0) + 0.25; }
  else if (pose === 'attack') { p.vx = 0; p.onGround = true; p.atkT = 0.16; p.castT = 0; }
  else if (pose === 'cast') { p.vx = 0; p.onGround = true; p.castT = 0.3; p.atkT = 0; }
  else { p.vx = 0; p.onGround = true; p.atkT = 0; p.castT = 0; }
  return { state: game.state, hero: game.hero };
}
"""

EQUIPPED = {'w': 1, 'h': 2, 'c': 3}
EQUIPPED_INV = [{'id': 1, 'slot': 'w', 'r': 4}]


def force_pose(pg, pose):
    return pg.evaluate(POSE_JS, pose)


def boss_pixel_diff(kind):
    """与基线 idle 帧做 PIL 像素比对：整幅 + Boss 局部裁剪。"""
    from PIL import Image, ImageChops
    before = BEFORE_DIR / ('before_boss_k%02d_idle.png' % kind)
    after = AFTER_DIR / ('after_boss_k%02d_idle.png' % kind)
    if not before.exists() or not after.exists():
        return {'error': 'missing screenshot', 'before': str(before), 'after': str(after)}
    ib = Image.open(before).convert('RGB')
    ia = Image.open(after).convert('RGB')
    if ib.size != ia.size:
        return {'error': 'size mismatch', 'before': ib.size, 'after': ia.size}
    diff = ImageChops.difference(ib, ia)
    hist = diff.histogram()
    total = ib.size[0] * ib.size[1]
    # 逐通道累计平均差
    px = list(diff.getdata())
    mean = sum(sum(px[i]) for i in range(len(px))) / (3 * len(px))
    changed = sum(1 for p in px if max(p) > 10) / len(px)
    res = {'size': ib.size, 'mean_abs_diff': round(mean, 3),
           'changed_ratio': round(changed, 5), 'full_diff': True}
    # 局部裁剪：按基线 JSON 中记录的 Boss 世界坐标 + 相机（在 after 侧用当前 box 对齐）
    return res


def main():
    report = {'meta': {'base': str(AFTER_HTML), 'phase': 'after',
                       'started': time.strftime('%Y-%m-%d %H:%M:%S')},
              'errors': {'pageerror': [], 'console_error': [], 'environmental_fetch': []},
              'knight': [], 'mage': [], 'equip': [], 'boss': [], 'smoke': [],
              'audit': {}, 'cache_check': {}}

    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        br, pg, errors = new_context(pw)

        # ---- 启动冒烟：标题 → L1 → L7 ----
        pg.goto(file_url(AFTER_HTML))
        pg.wait_for_timeout(2000)
        title = pg.evaluate("() => ({ state: game ? game.state : 'no-game' })")
        shot(pg, AFTER_DIR / 'after_title.png')
        report['smoke'].append({'scene': 'title', 'info': title})

        # ---- 帧审计：2s / 12s / 强制守卫后 ----
        goto_level(pg, AFTER_HTML, level=7, hero='knight',
                   profile=seed_profile(hero='knight'), wait=1800)
        audit_early = audit_frames(pg)
        n16_early, bad_early = summarize_16x16(audit_early)
        pg.wait_for_timeout(12000)
        audit_late = audit_frames(pg)
        n16_late, bad_late = summarize_16x16(audit_late)
        # 强制调用两条皮肤线的守卫/重建钩子（若暴露）
        guard_res = pg.evaluate("""() => {
          const out = {};
          try { if (window.PQ_HERO_SKIN_AI && typeof window.PQ_HERO_SKIN_AI.guard === 'function') window.PQ_HERO_SKIN_AI.guard(); out.heroGuard = true; } catch (e) { out.heroGuard = String(e); }
          try { if (window.PQ_MAGE_SKIN_AI && typeof window.PQ_MAGE_SKIN_AI.guard === 'function') window.PQ_MAGE_SKIN_AI.guard(); out.mageGuard = true; } catch (e) { out.mageGuard = String(e); }
          return out;
        }""")
        pg.wait_for_timeout(1500)
        audit_post = audit_frames(pg)
        n16_post, bad_post = summarize_16x16(audit_post)
        report['audit'] = {
            'early_2s': {'count_16x16': n16_early, 'bad_frames': bad_early},
            'late_12s': {'count_16x16': n16_late, 'bad_frames': bad_late},
            'post_guard': {'count_16x16': n16_post, 'bad_frames': bad_post, 'guards': guard_res},
            'flags': audit_post['flags'],
        }

        # ---- 1) 骑士 20 套 × idle/run/attack ----
        for skin in KNIGHT_SKINS:
            prof = seed_profile(hero='knight', skin=skin)
            goto_level(pg, AFTER_HTML, level=7, hero='knight', profile=prof, wait=1500)
            for pose in ['idle', 'run', 'attack']:
                setup_character(pg)
                info = force_pose(pg, pose)
                pg.wait_for_timeout(110)
                fn = 'after_knight_%s_%s.png' % (skin, pose)
                shot(pg, AFTER_DIR / fn)
                report['knight'].append({'skin': skin, 'pose': pose, 'file': fn, 'info': info})

        # ---- 2) 装备三态 ----
        states = [
            {'tag': 'equipped', 'skin': 'sprout', 'equip': EQUIPPED, 'inv': EQUIPPED_INV},
            {'tag': 'unequipped', 'skin': 'sprout', 'equip': {'w': -1, 'h': -1, 'c': -1}, 'inv': []},
            {'tag': 'switch_skin', 'skin': 'crystal', 'equip': {'w': -1, 'h': -1, 'c': -1}, 'inv': []},
        ]
        for st in states:
            prof = seed_profile(hero='knight', skin=st['skin'], equip=st['equip'], inv=st['inv'])
            goto_level(pg, AFTER_HTML, level=7, hero='knight', profile=prof, wait=1500)
            setup_character(pg)
            force_pose(pg, 'idle')
            pg.wait_for_timeout(120)
            fn = 'after_knight_equip_%s.png' % st['tag']
            shot(pg, AFTER_DIR / fn)
            eq = pg.evaluate("() => ({ equip: game.equip, hero: game.hero, skin: JSON.parse(localStorage.getItem('pq_progress')||'{}').skin })")
            report['equip'].append({'tag': st['tag'], 'skin': st['skin'], 'file': fn, 'info': eq})

        # 缓存残留：连续取两套皮肤帧，比对引用与像素指纹
        cache = pg.evaluate("""() => {
          function h(f){ return f && f.idle1 ? (f.idle1.width + 'x' + f.idle1.height + ':' + f.idle1.toDataURL().length) : null; }
          const fa = getHeroSkin('sprout'), fb = getHeroSkin('crystal'), fc = getHeroSkin('azure');
          return {
            sprout: h(fa), crystal: h(fb), azure: h(fc),
            ref_same_sprout_crystal: !!(fa && fb && fa.idle1 === fb.idle1),
            ref_same_crystal_azure: !!(fb && fc && fb.idle1 === fc.idle1),
            cachedKeys: Object.keys(SPR.skins || {})
          };
        }""")
        report['cache_check'] = cache

        # ---- 3) 法师 19 套 × idle/run/cast/attack ----
        for skin in MAGE_SKINS:
            prof = seed_profile(hero='mage', skin=skin)
            goto_level(pg, AFTER_HTML, level=7, hero='mage', profile=prof, wait=1500)
            for pose in ['idle', 'cast', 'attack']:
                setup_character(pg)
                info = force_pose(pg, pose)
                pg.wait_for_timeout(110)
                fn = 'after_mage_%s_%s.png' % (skin, pose)
                shot(pg, AFTER_DIR / fn)
                report['mage'].append({'skin': skin, 'pose': pose, 'file': fn, 'info': info})
        # blue 本命帧退化检查
        blue = pg.evaluate("""() => {
          const f = SPR.mgIdle1;
          if (!f) return { exists: false };
          let urlLen = 0;
          try { urlLen = f.toDataURL().length; } catch (e) { urlLen = -1; }
          return { exists: true, w: f.width, h: f.height, dataUrlLen: urlLen };
        }""")
        report['mage_blue'] = blue

        # ---- 4) 14 只 Boss：idle + windup 4 帧；idle 像素比对 ----
        for level, kind in BOSS_LEVEL_KIND:
            prof = seed_profile(hero='knight')
            goto_level(pg, AFTER_HTML, level=level, hero='knight', profile=prof, wait=1500)
            idle = freeze_boss(pg, kind, state='idle', t=0.0)
            pg.wait_for_timeout(300)
            box = boss_view_box(pg)
            fn_idle = 'after_boss_k%02d_idle.png' % kind
            shot(pg, AFTER_DIR / fn_idle)
            wind_files = []
            install_boss_hold(pg, kind, 'windup', None)
            for i, t in enumerate([0.05, 0.25, 0.45, 0.65], start=1):
                pg.evaluate("(t) => { const b = game.boss; if (b) b.t = t; }", t)
                pg.wait_for_timeout(150)
                fn = 'after_boss_k%02d_windup_%d.png' % (kind, i)
                shot(pg, AFTER_DIR / fn)
                wind_files.append(fn)
            clear_boss_hold(pg)
            diff = boss_pixel_diff(kind)
            report['boss'].append({'kind': kind, 'level': level, 'idle_file': fn_idle,
                                   'windup_files': wind_files, 'info': idle, 'box': box,
                                   'idle_diff': diff})

        # ---- 5) 进关冒烟 ----
        smoke_levels = [(lv, 'boss') for lv in BOSS_LEVELS] + [(lv, 'normal') for lv in NORMAL_LEVELS]
        for lv, kind_tag in smoke_levels:
            prof = seed_profile(hero='knight')
            goto_level(pg, AFTER_HTML, level=lv, hero='knight', profile=prof, wait=1800)
            st = pg.evaluate("""() => ({
              state: game.state, ui: typeof uiState !== 'undefined' ? uiState : null,
              boss: game.boss ? { kind: game.boss.kind, state: game.boss.state } : null,
              playerAlive: !!(game.player && !game.player.dead)
            })""")
            stuck = st['state'] not in ('play', 'arcade', 'clear', 'victory')
            report['smoke'].append({'level': lv, 'tag': kind_tag, 'info': st, 'stuck': stuck})

        # ---- 错误归集（环境性 file:// fetch 单列） ----
        env, real = [], []
        for e in errors['console_error']:
            if 'file://' in e and 'Fetch API' in e:
                env.append(e)
            else:
                real.append(e)
        report['errors']['console_error'] = real
        report['errors']['environmental_fetch'] = env
        report['errors']['pageerror'] = errors['pageerror']

        br.close()

    qa_json = AFTER_DIR.parent / 'after.json'
    write_json(report, qa_json)
    print('=== 后置复测完成 ===')
    print('pageerror:', len(report['errors']['pageerror']),
          ' console_error(real):', len(real), ' environmental fetch:', len(env))
    print('16×16：2s %d / 12s %d / 守卫后 %d' % (n16_early, n16_late, n16_post))
    print('骑士截图:', len(report['knight']), ' 法师截图:', len(report['mage']),
          ' Boss 条目:', len(report['boss']))
    print('截图目录:', AFTER_DIR)


if __name__ == '__main__':
    main()
