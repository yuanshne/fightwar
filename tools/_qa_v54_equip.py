# -*- coding: utf-8 -*-
"""
_qa_v54_equip.py —— 按最新 ui.js 复核装备穿/脱/切皮肤三态。
独立验收项：装备叠加层是否裁切/错位（底帧 32×38 时 heroLook 合成画布不得退回 16×16 口径）；
缓存是否残留上一套皮肤。每态 fresh page + 清 localStorage + 固定 ?level=7&hero=knight&god=1。
输出 .screenshots/qa/equip.json；截图存 .screenshots/qa/after/。
"""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from playwright.sync_api import sync_playwright  # noqa: E402
from _qa_v54_common import AFTER_HTML, QA_DIR, AFTER_DIR, file_url, seed_profile, setup_character  # noqa: E402

CRITICAL = ['coin', 'checkOn', 'checkOff', 'flag', 'lever', 'slime', 'heartFull',
            'gem', 'springC', 'look', 'knight', 'portal']

PROBE = r"""(need) => {
  const keys = Object.keys(SPR);
  const prof = JSON.parse(localStorage.getItem('pq_progress') || '{}');
  const sk = (typeof getHeroSkin === 'function') ? getHeroSkin(prof.skin) : null;
  const idle = sk && sk.idle1 ? { w: sk.idle1.width, h: sk.idle1.height } : null;
  const look = SPR.look ? {
    weapon: (SPR.look.weapon || []).length,
    hat: (SPR.look.hat || []).length,
    cape: (SPR.look.cape || []).length,
  } : null;
  const p = game.player;
  return {
    sprCount: keys.length,
    missing: need.filter(k => !SPR[k]),
    skin: prof.skin,
    equip: prof.equip,
    inv: prof.inv,
    gameEquip: game.equip || null,
    player: p ? { alive: !p.dead, x: Math.round(p.x), y: Math.round(p.y), w: p.w, h: p.h } : null,
    baseFrame: idle,
    lookSlots: look,
  };
}"""

STATES = [
    {
        'name': 'equipped',
        'profile': seed_profile(hero='knight', skin='sprout',
                                equip={'w': 1, 'h': 2, 'c': 3},
                                inv=[{'id': 1, 'slot': 'w', 'r': 4},
                                     {'id': 2, 'slot': 'h', 'r': 2},
                                     {'id': 3, 'slot': 'c', 'r': 3}]),
    },
    {
        'name': 'unequipped',
        'profile': seed_profile(hero='knight', skin='sprout',
                                equip={'w': -1, 'h': -1, 'c': -1}, inv=[]),
    },
    {
        'name': 'switch_skin',
        'profile': seed_profile(hero='knight', skin='crystal',
                                equip={'w': -1, 'h': -1, 'c': -1}, inv=[]),
    },
]


def run_state(pw, st):
    br = pw.chromium.launch()
    pg = br.new_page(viewport={'width': 1280, 'height': 800})
    errs, pe = [], []
    pg.on('pageerror', lambda e: pe.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)

    pg.goto(file_url(AFTER_HTML))
    pg.evaluate("() => localStorage.clear()")
    pg.evaluate("(p) => localStorage.setItem('pq_progress', JSON.stringify(p))", st['profile'])
    pg.goto(file_url(AFTER_HTML) + '?level=7&hero=knight&god=1')
    pg.wait_for_timeout(2500)

    probe = pg.evaluate(PROBE, CRITICAL)

    # 背包预览（KeyB）
    pg.keyboard.press('KeyB')
    pg.wait_for_timeout(350)
    bag_shot = AFTER_DIR / ('after_equip_%s_bag.png' % st['name'])
    pg.locator('#game').screenshot(path=str(bag_shot))

    # 关内角色（关背包后摆位）
    pg.keyboard.press('KeyB')
    pg.wait_for_timeout(200)
    setup_character(pg, 170, 180)
    pg.wait_for_timeout(350)
    world_shot = AFTER_DIR / ('after_equip_%s_world.png' % st['name'])
    pg.locator('#game').screenshot(path=str(world_shot))

    draw = [e for e in errs if 'drawImage' in e]
    rec = {'state': st['name'], 'probe': probe,
           'drawImage_errors': len(draw), 'pageerror': pe,
           'other_console': [e for e in errs if 'drawImage' not in e and 'Fetch API' not in e],
           'bag_shot': str(bag_shot), 'world_shot': str(world_shot)}
    br.close()
    return rec


def main():
    out = {'states': []}
    with sync_playwright() as pw:
        for st in STATES:
            rec = run_state(pw, st)
            out['states'].append(rec)
            pr = rec['probe']
            print('%s: skin=%s equip=%s atk=%s player=%s base=%s look=%s missing=%s draw=%d pe=%d' % (
                rec['state'], pr['skin'], pr['equip'],
                (pr['gameEquip'] or {}).get('atk'), pr['player'],
                pr['baseFrame'], pr['lookSlots'], pr['missing'],
                rec['drawImage_errors'], len(rec['pageerror'])))
    (QA_DIR / 'equip.json').write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
