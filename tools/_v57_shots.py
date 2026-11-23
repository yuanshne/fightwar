# -*- coding: utf-8 -*-
"""_v57_shots.py — 霜爆新星八向修复截图与矩阵留档。

  before：跑 .snap_v57 基线副本（旧 engine.js），产出 before_8dir_matrix.png + before 矩阵表；
  after ：跑根目录修复后代码，产出 after_8dir_matrix / after_ground_lowmob / after_wall /
          after_platform / after_groundspike 截图 + after 矩阵表。

用法：
  D:/python/python.exe tools/_v57_shots.py before
  D:/python/python.exe tools/_v57_shots.py after
  D:/python/python.exe tools/_v57_shots.py all
"""
import json
import math
import pathlib
import sys
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / '.screenshots' / 'nova_fix'
OUT.mkdir(parents=True, exist_ok=True)
ROOT_URL = 'file:///' + str(ROOT / 'index.html').replace('\\', '/')
SNAP_URL = 'file:///' + str(ROOT / '.snap_v57' / 'index.html').replace('\\', '/')

NAMES = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
ANG = [-math.pi / 2, -math.pi / 4, 0, math.pi / 4, math.pi / 2,
       3 * math.pi / 4, math.pi, -3 * math.pi / 4]

# 八向夹具：8 只钉住的史莱姆摆上八向射线，放 U；返回初始摆放
RING_SETUP = """
() => {
  game.level.enemies.length = 0; game.shots.length = 0; game.bullets.length = 0;
  game.hazards.length = 0; game.waves.length = 0;
  const p = game.player;
  p.x = 35; p.y = 178; p.vx = 0; p.vy = 0; p.onGround = true;
  p.dead = false; p.hp = 99; p.invT = 9e9;
  game.mana = 100; game.skills.u = 0;
  const cx = p.x + p.w / 2, feet = p.y + p.h, cy = _engSpriteTop(p) + 19;
  const ang = [%s], names = [%s];
  for (let i = 0; i < 8; i++) {
    let ex, ey;
    if (Math.sin(ang[i]) > 0.2) { ex = cx + Math.cos(ang[i]) * 14; ey = feet - 10; }
    else if (Math.abs(Math.sin(ang[i])) > 0.2) { ex = cx + Math.cos(ang[i]) * 30 - 6; ey = cy + Math.sin(ang[i]) * 30 - 5; }
    else { ex = cx + Math.cos(ang[i]) * 30; ey = feet - 10; }
    const e = _engMkEnemy('slime', ex, ey, false);
    e.x = ex; e.y = ey; e.vx = 0; e.vy = 0; e.hp = 9; e._x = ex; e._y = ey;
    game.level.enemies.push(e);
  }
  return game.level.enemies.map((e, i) => ({ n: names[i], x: +e.x.toFixed(1), y: +e.y.toFixed(1) }));
}
""" % (','.join(repr(a) for a in ANG), ','.join("'%s'" % n for n in NAMES))

READ_MATRIX = """
() => game.level.enemies.map((e, i) => ({
  n: ['N','NE','E','SE','S','SW','W','NW'][i],
  hp: e.hp, freeze: +(e.freezeT || 0).toFixed(2), dead: e.dead > 0,
  seq: e.novaSeq || 0 }))
"""

# 单方向夹具（矩阵逐向断言用）：cfg {ang, dist, dx, group}
ONE_SETUP = """
(cfg) => {
  game.level.enemies.length = 0; game.shots.length = 0; game.bullets.length = 0;
  game.hazards.length = 0; game.waves.length = 0;
  const p = game.player;
  p.x = 35; p.y = 178; p.vx = 0; p.vy = 0; p.onGround = true;
  p.dead = false; p.hp = 99; p.invT = 9e9;
  game.mana = 100; game.skills.u = 0;
  const cx = p.x + p.w / 2, feet = p.y + p.h, cy = _engSpriteTop(p) + 19;
  let ex, ey;
  if (cfg.group === 'down') { ex = cx + cfg.dx; ey = feet - 10; }
  else if (cfg.group === 'side') { ex = cx + cfg.dx; ey = feet - 10; }
  else { ex = cx + Math.cos(cfg.ang) * cfg.dist - 6; ey = cy + Math.sin(cfg.ang) * cfg.dist - 5; }
  const e = _engMkEnemy('slime', ex, ey, false);
  e.x = ex; e.y = ey; e.vx = 0; e.vy = 0; e.hp = 9; e._x = ex; e._y = ey;
  game.level.enemies.push(e);
  game.input.skillUHit = 1;
  let hitF = -1, freezeAtHit = 0;
  for (let f = 0; f < 50; f++) {
    e.x = e._x; e.y = e._y; e.vx = 0; e.vy = 0;
    updateWorld(1 / 60);
    if (hitF < 0 && e.hp < 9) { hitF = f + 1; freezeAtHit = e.freezeT || 0; }
  }
  return { hit: e.hp < 9, dmg: 9 - e.hp, freeze: +freezeAtHit.toFixed(3),
           hitFrame: hitF, grounded: game.shots.filter(s => s.grounded).length };
}
"""

DIRS = [
    ('N', -math.pi / 2, 30, 0, 'up'), ('NE', -math.pi / 4, 32, 0, 'up'),
    ('E', 0, 30, 30, 'side'), ('SE', math.pi / 4, 0, 14, 'down'),
    ('S', math.pi / 2, 0, 0, 'down'), ('SW', 3 * math.pi / 4, 0, -14, 'down'),
    ('W', math.pi, 30, -30, 'side'), ('NW', -3 * math.pi / 4, 32, 0, 'up'),
]


def run_matrix(pg):
    rows = []
    for name, ang, dist, dx, grp in DIRS:
        r = pg.evaluate(ONE_SETUP, {'ang': ang, 'dist': dist, 'dx': dx, 'group': grp})
        rows.append({'dir': name, **r})
    return rows


def print_matrix(tag, rows):
    print('== %s 矩阵 ==' % tag)
    for r in rows:
        print('  %-3s 命中=%-5s 伤害=%s 冻结=%-5s 第%s帧 残留地刺=%s' % (
            r['dir'], r['hit'], r['dmg'], r['freeze'], r['hitFrame'], r['grounded']))


def open_page(pw, url):
    br = pw.chromium.launch(headless=True)
    pg = br.new_page(viewport={'width': 960, 'height': 640})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(url + '?level=7&hero=mage&god=1', wait_until='load')
    pg.wait_for_function(
        "() => typeof game !== 'undefined' && game.player && game.state === 'play'",
        timeout=15000)
    pg.wait_for_timeout(600)
    return br, pg, errs


def reload(pg, url):
    pg.goto(url + '?level=7&hero=mage&god=1', wait_until='load')
    pg.wait_for_function(
        "() => typeof game !== 'undefined' && game.player && game.state === 'play'",
        timeout=15000)
    pg.wait_for_timeout(500)


def shot_ring(pg, path):
    pg.evaluate(RING_SETUP)
    pg.wait_for_timeout(90)
    pg.locator('#game').screenshot(path=str(path))


def shot_lowmob(pg):
    pg.evaluate("""() => {
      const p = game.player;
      game.level.enemies.length = 0; game.shots.length = 0;
      p.x = 35; p.y = 178; p.vx = 0; p.vy = 0; p.onGround = true; p.dead = false; p.hp = 99;
      game.mana = 100; game.skills.u = 0;
      const e = _engMkEnemy('slime', 56, 198, false); e.hp = 9; e._x = e.x; e._y = e.y;
      game.level.enemies.push(e);
      game.input.skillUHit = 1;
    }""")
    pg.wait_for_timeout(80)
    pg.locator('#game').screenshot(path=str(OUT / 'after_ground_lowmob.png'))


def shot_wall(pg):
    pg.evaluate("""() => {
      const L = game.level, p = game.player;
      for (let ty = 10; ty <= 12; ty++) L.tiles[ty][6] = '#';
      game.level.enemies.length = 0; game.shots.length = 0;
      p.x = 35; p.y = 178; p.vx = 0; p.vy = 0; p.onGround = true; p.dead = false; p.hp = 99;
      game.mana = 100; game.skills.u = 0;
      const e = _engMkEnemy('slime', 80, 198, false); e.hp = 9; e._x = e.x; e._y = e.y;
      game.level.enemies.push(e);
      game.input.skillUHit = 1;
    }""")
    pg.wait_for_timeout(90)
    pg.locator('#game').screenshot(path=str(OUT / 'after_wall.png'))


def shot_platform(pg):
    pg.evaluate("""() => {
      const L = game.level, p = game.player;
      L.tiles[12][4] = '#'; L.tiles[12][5] = '#';
      game.level.enemies.length = 0; game.shots.length = 0;
      p.x = 56; p.y = 162; p.vx = 0; p.vy = 0; p.onGround = true; p.dead = false; p.hp = 99;
      game.mana = 100; game.skills.u = 0;
      const below = _engMkEnemy('slime', 60, 198, false); below.hp = 9; below._x = below.x; below._y = below.y;
      const above = _engMkEnemy('slime', 60, 150, false); above.hp = 9; above._x = above.x; above._y = above.y;
      game.level.enemies.push(below, above);
      game.input.skillUHit = 1;
    }""")
    pg.wait_for_timeout(90)
    pg.locator('#game').screenshot(path=str(OUT / 'after_platform.png'))


def shot_groundspike(pg):
    pg.evaluate("""() => {
      const p = game.player;
      game.level.enemies.length = 0; game.shots.length = 0;
      p.x = 35; p.y = 178; p.vx = 0; p.vy = 0; p.onGround = true; p.dead = false; p.hp = 99;
      game.mana = 100; game.skills.u = 0;
      const e = _engMkEnemy('slime', 52, 198, false); e.hp = 9; e._x = e.x; e._y = e.y;
      game.level.enemies.push(e);
      game.input.skillUHit = 1;
    }""")
    pg.wait_for_timeout(70)
    pg.locator('#game').screenshot(path=str(OUT / 'after_groundspike.png'))


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'all'
    with sync_playwright() as pw:
        if mode in ('before', 'all'):
            br, pg, errs = open_page(pw, SNAP_URL)
            rows = run_matrix(pg)
            print_matrix('基线 before（snap_v57）', rows)
            shot_ring(pg, OUT / 'before_8dir_matrix.png')
            (OUT / 'before_matrix.json').write_text(
                json.dumps(rows, ensure_ascii=False, indent=1), encoding='utf-8')
            br.close()
            if errs:
                print('before pageerror:', errs[:5])
        if mode in ('after', 'all'):
            br, pg, errs = open_page(pw, ROOT_URL)
            rows = run_matrix(pg)
            print_matrix('修复后 after（root）', rows)
            shot_ring(pg, OUT / 'after_8dir_matrix.png')
            reload(pg, ROOT_URL); shot_lowmob(pg)
            reload(pg, ROOT_URL); shot_wall(pg)
            reload(pg, ROOT_URL); shot_platform(pg)
            reload(pg, ROOT_URL); shot_groundspike(pg)
            (OUT / 'after_matrix.json').write_text(
                json.dumps(rows, ensure_ascii=False, indent=1), encoding='utf-8')
            br.close()
            if errs:
                print('after pageerror:', errs[:5])


if __name__ == '__main__':
    main()
