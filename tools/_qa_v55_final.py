# -*- coding: utf-8 -*-
"""
_qa_v55_final.py —— v54 四线收口后最终交付验收（只读源码；只写 .screenshots/qa）。
覆盖：
  A. 冷启动 10 after + 6 before：SPR 键数 / 关键键缺失 / drawImage / pageerror / 其他 console
  B. 后置会话等 ≥13s：主角顶层 hero* 全键尺寸；法师 19 套 × 三口径（getMageSkin / mageSkinFrames /
     getMageLook 装备态）32×38 矩阵；mg* 枚举帧尺寸
  C. taint 根因独立验证：file:// file 图上 canvas getImageData 应抛 SecurityError；
     新路径产出的法师帧 getImageData 应成功（未被污染）
  D. 骑士 + 法师 装备穿/脱/切皮肤三态（背包预览 + 世界帧截图；叠加层裁切/残留目检）
  E. 14 只 Boss 关可进（state / boss 存在 / 玩家存活）
输出 .screenshots/qa/final.json；截图 .screenshots/qa/after/。
"""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from playwright.sync_api import sync_playwright  # noqa: E402
from _qa_v54_common import (BEFORE_HTML, AFTER_HTML, QA_DIR, AFTER_DIR, BEFORE_DIR,
                            file_url, seed_profile, setup_character,
                            KNIGHT_SKINS, MAGE_SKINS, BOSS_LEVEL_KIND)  # noqa: E402

CRITICAL = ['coin', 'checkOn', 'checkOff', 'flag', 'lever', 'slime', 'heartFull',
            'gem', 'springC', 'look', 'knight', 'portal', 'bat', 'beetle', 'bossGhost']

HERO_SCALAR_EXPECT = None  # 运行时枚举，不预设清单

# ---------- 探针 JS ----------

COLD_PROBE = r"""(need) => {
  const keys = Object.keys(SPR);
  return { count: keys.length, keys: keys.slice().sort(),
           missing: need.filter(k => !SPR[k]),
           built: !!SPR.__built,
           heroIdle1Size: SPR.heroIdle1 && SPR.heroIdle1.width ? SPR.heroIdle1.width + 'x' + SPR.heroIdle1.height : null };
}"""

_DIM = r"""
function dim(v){ if(v==null) return null;
  if(Array.isArray(v)) v=v[0];
  if(v && typeof v.width==='number') return { w: v.width, h: v.height };
  return null; }
"""

SET_KEYS = ['idle1', 'idle2', 'jump', 'fall', 'attack', 'cast', 'dash', 'dashWind', 'squash']

AUDIT_JS = r"""(skinIds) => {
  __DIM__
  const out = { heroTop: {}, mage: {}, mgEnum: {}, mageBlue: null };
  Object.keys(SPR).filter(k => /^hero/.test(k)).forEach(k => {
    const v = SPR[k];
    out.heroTop[k] = Array.isArray(v) ? { arr: v.length, dim: dim(v[0]) } : dim(v);
  });
  const setDims = s => {
    if (!s) return null;
    const o = {};
    SET_KEYS.forEach(k => o[k] = dim(s[k]));
    o.run = Array.isArray(s.run) ? s.run.map(dim) : dim(s.run);
    return o;
  };
  out.mage = {};
  skinIds.forEach(id => {
    const a = (typeof getMageSkin === 'function') ? getMageSkin(id) : null;
    const b = (typeof mageSkinFrames === 'function') ? mageSkinFrames(id) : null;
    const c = (typeof getMageLook === 'function') ? getMageLook(id, { w: 1, h: 2, c: 0 }) : null;
    out.mage[id] = { skin: setDims(a), frames: setDims(b), look: setDims(c) };
  });
  ['mgIdle1','mgIdle2','mgJump','mgFall','mgAttack','mgCast','mgDash','mgDashWind','mgSquash']
    .forEach(k => out.mgEnum[k] = dim(SPR[k]));
  out.mageBlue = dim(SPR.mgIdle1);
  return out;
}""".replace('__DIM__', _DIM).replace('SET_KEYS', json.dumps(SET_KEYS))

TAINT_FILE_JS = r"""async () => {
  const url = 'file:///' + location.pathname.replace(/^\/?/, '')
    .replace(/index\.html.*$/, '') + 'assets/ai/bg/lava.jpg';
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  let tainted = null, err = null;
  try { g.getImageData(0, 0, 1, 1); tainted = false; }
  catch (e) { tainted = true; err = String(e); }
  return { url, loaded: true, w: img.width, h: img.height, tainted, err };
}"""

TAINT_CLEAN_JS = r"""() => {
  const s = (typeof getMageSkin === 'function') ? getMageSkin('sprout') : null;
  const f = s && s.idle1 ? s.idle1 : null;
  if (!f) return { ok: false, reason: 'no mage frame' };
  const g = f.getContext('2d');
  try { const d = g.getImageData(0, 0, 1, 1); return { ok: true, r: d.data[0], w: f.width, h: f.height }; }
  catch (e) { return { ok: false, tainted: true, err: String(e) }; }
}"""

EQUIP_PROBE = r"""() => {
  const prof = JSON.parse(localStorage.getItem('pq_progress') || '{}');
  const p = game.player;
  const hero = game.hero;
  let base = null;
  if (hero === 'mage') {
    const f = (typeof mageSkinFrames === 'function') ? mageSkinFrames(prof.skin) : null;
    base = f && f.idle1 ? { w: f.idle1.width, h: f.idle1.height } : null;
  } else {
    const f = (typeof getHeroSkin === 'function') ? getHeroSkin(prof.skin) : null;
    base = f && f.idle1 ? { w: f.idle1.width, h: f.idle1.height } : null;
  }
  return {
    hero, skin: prof.skin, equip: prof.equip, inv: prof.inv,
    gameEquip: game.equip || null,
    player: p ? { alive: !p.dead, x: Math.round(p.x), y: Math.round(p.y), w: p.w, h: p.h } : null,
    baseFrame: base,
  };
}"""

BOSS_PROBE = r"""() => {
  const b = game.boss;
  return { state: game.state, playerAlive: !!(game.player && !game.player.dead),
           boss: b ? { kind: b.kind, state: b.state, hidden: !!b.hidden, dead: !!b.dead,
                       x: Math.round(b.x), y: Math.round(b.y) } : null };
}"""


def fresh_page(pw, html, profile=None, level=None, hero=None):
    br = pw.chromium.launch()
    pg = br.new_page(viewport={'width': 1280, 'height': 800})
    errs, pe = [], []
    pg.on('pageerror', lambda e: pe.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.goto(file_url(html))
    pg.evaluate("() => localStorage.clear()")
    if profile is not None:
        pg.evaluate("(p) => localStorage.setItem('pq_progress', JSON.stringify(p))", profile)
    url = file_url(html)
    params = []
    if level is not None:
        params.append('level=%d' % level)
    if hero:
        params.append('hero=%s' % hero)
    params.append('god=1')
    pg.goto(url + '?' + '&'.join(params))
    return br, pg, errs, pe


def classify_errors(errs):
    fetch = [e for e in errs if 'Fetch API' in e]
    draw = [e for e in errs if 'drawImage' in e]
    white = [e for e in errs if 'White' in e]
    other = [e for e in errs if 'Fetch API' not in e and 'drawImage' not in e and 'White' not in e]
    return {'fetch_env': len(fetch), 'drawImage': len(draw), 'white_late': len(white),
            'other': other}


def phase_cold(pw, results):
    for label, html, n in (('after', AFTER_HTML, 10), ('before', BEFORE_HTML, 6)):
        for i in range(n):
            br, pg, errs, pe = fresh_page(pw, html, seed_profile(hero='knight'), level=7, hero='knight')
            pg.wait_for_timeout(2500)
            probe = pg.evaluate(COLD_PROBE, CRITICAL)
            ec = classify_errors(errs)
            results['cold'][label].append({'idx': i + 1, 'probe': probe,
                                           'drawImage': ec['drawImage'], 'pageerror': pe,
                                           'other': ec['other'], 'fetch_env': ec['fetch_env']})
            br.close()


def phase_audit(pw, results):
    # 后置会话等 13s 让 AI 皮肤/看门狗就绪
    br, pg, errs, pe = fresh_page(pw, AFTER_HTML, seed_profile(hero='knight'), level=7, hero='knight')
    pg.wait_for_timeout(13000)
    results['audit'] = pg.evaluate(AUDIT_JS, MAGE_SKINS)
    results['taint_file'] = pg.evaluate(TAINT_FILE_JS)
    results['taint_clean_canvas'] = pg.evaluate(TAINT_CLEAN_JS)
    results['audit_errors'] = classify_errors(errs)
    results['audit_pageerror'] = pe
    br.close()


EQUIP_STATES = [
    ('knight', 'equipped', 'sprout', {'w': 1, 'h': 2, 'c': 3},
     [{'id': 1, 'slot': 'w', 'r': 4}, {'id': 2, 'slot': 'h', 'r': 2}, {'id': 3, 'slot': 'c', 'r': 3}]),
    ('knight', 'unequipped', 'sprout', {'w': -1, 'h': -1, 'c': -1}, []),
    ('knight', 'switch_skin', 'crystal', {'w': -1, 'h': -1, 'c': -1}, []),
    ('mage', 'equipped', 'sprout', {'w': 1, 'h': 2, 'c': 3},
     [{'id': 1, 'slot': 'w', 'r': 4}, {'id': 2, 'slot': 'h', 'r': 2}, {'id': 3, 'slot': 'c', 'r': 3}]),
    ('mage', 'unequipped', 'sprout', {'w': -1, 'h': -1, 'c': -1}, []),
    ('mage', 'switch_skin', 'crystal', {'w': -1, 'h': -1, 'c': -1}, []),
]


def phase_equip(pw, results):
    for hero, state, skin, equip, inv in EQUIP_STATES:
        prof = seed_profile(hero=hero, skin=skin, equip=equip, inv=inv)
        br, pg, errs, pe = fresh_page(pw, AFTER_HTML, prof, level=7, hero=hero)
        pg.wait_for_timeout(3000)
        probe = pg.evaluate(EQUIP_PROBE)
        pg.keyboard.press('KeyB')
        pg.wait_for_timeout(350)
        bag = AFTER_DIR / ('after_equip_%s_%s_bag.png' % (hero, state))
        pg.locator('#game').screenshot(path=str(bag))
        pg.keyboard.press('KeyB')
        pg.wait_for_timeout(200)
        setup_character(pg, 170, 180)
        pg.wait_for_timeout(300)
        world = AFTER_DIR / ('after_equip_%s_%s_world.png' % (hero, state))
        pg.locator('#game').screenshot(path=str(world))
        results['equip'].append({'hero': hero, 'state': state, 'probe': probe,
                                 'bag': str(bag), 'world': str(world),
                                 'drawImage': len([e for e in errs if 'drawImage' in e]),
                                 'pageerror': pe,
                                 'other': [e for e in errs if 'Fetch API' not in e and 'drawImage' not in e]})
        br.close()


def phase_boss(pw, results):
    seen = []
    for level, kind in BOSS_LEVEL_KIND:
        if level in seen:
            continue
        seen.append(level)
        br, pg, errs, pe = fresh_page(pw, AFTER_HTML, seed_profile(hero='knight'), level=level, hero='knight')
        pg.wait_for_timeout(1800)
        probe = pg.evaluate(BOSS_PROBE)
        probe['level'] = level
        probe['kind_expected'] = kind
        probe['errors'] = classify_errors(errs)
        probe['pageerror'] = pe
        results['boss'].append(probe)
        br.close()


def main():
    results = {'cold': {'after': [], 'before': []}, 'audit': None, 'equip': [], 'boss': []}
    with sync_playwright() as pw:
        phase_cold(pw, results)
        phase_audit(pw, results)
        phase_equip(pw, results)
        phase_boss(pw, results)
    (QA_DIR / 'final.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')

    # 控制台摘要
    for label in ('after', 'before'):
        rs = results['cold'][label]
        counts = [r['probe']['count'] for r in rs]
        bad = [r['idx'] for r in rs if r['probe']['missing'] or r['drawImage'] or r['pageerror']]
        print('COLD %s n=%d counts=%s bad=%s' % (label, len(rs), counts, bad))
    print('TAINT file taint=', results['taint_file'])
    print('TAINT clean canvas=', results['taint_clean_canvas'])
    for e in results['equip']:
        p = e['probe']
        print('EQUIP', e['hero'], e['state'], 'atk=', (p['gameEquip'] or {}).get('atk'),
              'base=', p['baseFrame'], 'player=', p['player'], 'missing=', p.get('missing'),
              'draw=', e['drawImage'], 'pe=', len(e['pageerror']))
    for b in results['boss']:
        print('BOSS L%d kind=%s' % (b['level'], b['kind_expected']), b['state'],
              'boss=', b['boss'], 'pe=', len(b['pageerror']))


if __name__ == '__main__':
    main()
