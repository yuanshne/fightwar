# -*- coding: utf-8 -*-
"""_v57_nova_check.py — 霜爆新星（法师 U）八向命中矩阵验收。

真实关卡（level 7 平地草场）+ 真实引擎步进 updateWorld(1/60)，逐向断言：
  · 命中=True；伤害=3；冻结时长≈0.8s；同一次 novaSeq 对该敌人只结算一次。
另含：贴身去重（八枚冰锥不叠加 8 份伤）、贴墙 / 平台 / 落地地刺场景截图。

用法：
  D:/python/python.exe tools/_v57_nova_check.py            # 矩阵 + 去重 + 场景截图
  D:/python/python/python.exe tools/_v57_nova_check.py matrix
  D:/python/python/python.exe tools/_v57_nova_check.py shots
"""
import math
import pathlib
import sys
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = 'file:///' + str(ROOT / 'index.html').replace('\\', '/')
OUT = ROOT / '.screenshots' / 'nova_fix'
OUT.mkdir(parents=True, exist_ok=True)

# 八向：名称, 角度(rad, -π/2=正上), 距离, 分组（up/side/down）；down 组贴地贴身摆放
DIRS = [
    ('N  正上',  -math.pi / 2, 30,   0, 'up'),
    ('NE 右上',  -math.pi / 4, 32,   0, 'up'),
    ('E  正右',   0,          30,  30, 'side'),
    ('SE 右下',   math.pi / 4,  0,  14, 'down'),
    ('S  正下',   math.pi / 2,  0,   0, 'down'),
    ('SW 左下',   3 * math.pi / 4, 0, -14, 'down'),
    ('W  正左',   math.pi,    30, -30, 'side'),
    ('NW 左上',  -3 * math.pi / 4, 32,  0, 'up'),
]

# 单场景夹具：清场 → 钉玩家 → 摆一只钉住的史莱姆（上/侧组落在射线上，down 组贴地贴身）→ 放 U → 步进 50 帧
SETUP_RUN = """
(cfg) => {
  game.level.enemies.length = 0; game.shots.length = 0; game.bullets.length = 0;
  game.hazards.length = 0; game.waves.length = 0;
  const p = game.player;
  p.x = 35; p.y = 178; p.vx = 0; p.vy = 0; p.onGround = true;
  p.dead = false; p.hp = 99; p.invT = 9e9; p.shieldT = 0;
  game.mana = 100; game.skills.u = 0; game.cdMul = 1;
  const cx = p.x + p.w / 2, feet = p.y + p.h, cy = _engSpriteTop(p) + 19;
  let ex, ey;
  if (cfg.group === 'down') { ex = cx + cfg.dx; ey = feet - 10; }
  else if (cfg.group === 'side') { ex = cx + cfg.dx; ey = feet - 10; }
  else { ex = cx + Math.cos(cfg.ang) * cfg.dist - 6;
         ey = cy + Math.sin(cfg.ang) * cfg.dist - 5; }
  const e = _engMkEnemy('slime', ex, ey, false);
  e.x = ex; e.y = ey; e.vx = 0; e.vy = 0; e.hp = cfg.hp || 9;
  e._x = ex; e._y = ey;
  game.level.enemies.push(e);
  game.input.skillUHit = 1;
  let hitF = -1, freezeAtHit = 0;
  for (let f = 0; f < 50; f++) {
    e.x = e._x; e.y = e._y; e.vx = 0; e.vy = 0;
    updateWorld(1 / 60);
    if (hitF < 0 && e.hp < (cfg.hp || 9)) { hitF = f + 1; freezeAtHit = e.freezeT || 0; }
  }
  return { hit: e.hp < (cfg.hp || 9), dmg: (cfg.hp || 9) - e.hp,
           freeze: +freezeAtHit.toFixed(3), hp: e.hp,
           hitFrame: hitF, grounded: game.shots.filter(s => s.grounded).length,
           aliveShards: game.shots.length, seq: e.novaSeq || 0 };
}
"""

# 贴身去重：敌人叠在玩家身上，八枚冰锥同时命中也只结算一份 3 伤
DEDUP_RUN = """
() => {
  game.level.enemies.length = 0; game.shots.length = 0; game.bullets.length = 0;
  const p = game.player;
  p.x = 35; p.y = 178; p.vx = 0; p.vy = 0; p.onGround = true;
  p.dead = false; p.hp = 99; p.invT = 9e9;
  game.mana = 100; game.skills.u = 0;
  const e = _engMkEnemy('slime', p.x + 4, p.y + 4, false);
  e.hp = 30; e._x = e.x; e._y = e.y;
  game.level.enemies.push(e);
  game.input.skillUHit = 1;
  for (let f = 0; f < 30; f++) {
    e.x = e._x; e.y = e._y; e.vx = 0; e.vy = 0;
    updateWorld(1 / 60);
  }
  return { hp: e.hp, dmg: 30 - e.hp, seq: e.novaSeq || 0, freeze: +(e.freezeT || 0).toFixed(3) };
}
"""


def main():
    do_shots = 'shots' in sys.argv
    do_matrix = 'matrix' in sys.argv or not do_shots

    with sync_playwright() as pw:
        br = pw.chromium.launch(headless=True)
        pg = br.new_page(viewport={'width': 960, 'height': 640})
        perr, cerr = [], []
        pg.on('pageerror', lambda e: perr.append(str(e)))
        pg.on('console', lambda m: cerr.append(m.text) if m.type == 'error' else None)
        pg.goto(BASE + '?level=7&hero=mage&god=1', wait_until='load')
        pg.wait_for_function(
            "() => typeof game !== 'undefined' && game.player && game.state === 'play'",
            timeout=15000)
        pg.wait_for_timeout(600)

        rows = []
        if do_matrix:
            print('== 八向命中矩阵（level 7 平地，slime 9 血，手动 50 帧）==')
            for name, ang, dist, dx, grp in DIRS:
                res = pg.evaluate(SETUP_RUN, {'ang': ang, 'dist': dist, 'dx': dx, 'group': grp})
                ok = res['hit'] and res['dmg'] == 3 and res['freeze'] > 0.6
                rows.append((name, grp, res, ok))
                print('  %-8s 命中=%-5s 伤害=%-2s 冻结=%-5s 第%s帧 残留地刺=%s %s' % (
                    name, res['hit'], res['dmg'], res['freeze'], res['hitFrame'],
                    res['grounded'], 'PASS' if ok else 'FAIL'))

            dedup = pg.evaluate(DEDUP_RUN)
            dedup_ok = dedup['dmg'] == 3
            print('== 贴身去重：30 血史莱姆吃伤 %d（期望 3，只结算一份）%s ==' % (
                dedup['dmg'], 'PASS' if dedup_ok else 'FAIL'))

        if do_shots:
            shot_scenarios(pg)

        br.close()

    fails = [r for r in rows if not r[3]]
    if do_matrix:
        print('\n矩阵结果: %d/%d 向通过；贴身去重 %s' % (
            len(rows) - len(fails), len(rows), 'PASS' if dedup_ok else 'FAIL'))
        if fails or not dedup_ok:
            sys.exit(1)
    if perr:
        print('PAGEERROR:', perr[:5])
        sys.exit(1)


def shot_scenarios(pg):
    """贴墙 / 平台上下夹击 / 落地地刺 三个场景截图。"""
    # ① 贴墙：右侧 tx6 列砌墙，敌人贴墙站；右向冰锥撞墙转冰爆并结算
    pg.evaluate("""() => {
      const L = game.level, p = game.player;
      for (let ty = 11; ty <= 12; ty++) L.tiles[ty][6] = '#';
      game.level.enemies.length = 0; game.shots.length = 0;
      p.x = 35; p.y = 178; p.vx = 0; p.vy = 0; p.onGround = true; p.dead = false; p.hp = 99;
      game.mana = 100; game.skills.u = 0;
      const e = _engMkEnemy('slime', 82, 198, false); e.hp = 9; e._x = e.x; e._y = e.y;
      game.level.enemies.push(e);
      game.input.skillUHit = 1;
    }""")
    pg.wait_for_timeout(120)
    pg.locator('#game').screenshot(path=str(OUT / 'after_wall.png'))

    # ② 平台上下夹击：tx4..5  row12 架 1 格台，玩家站台面，台下 / 台上各一只
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
    pg.wait_for_timeout(120)
    pg.locator('#game').screenshot(path=str(OUT / 'after_platform.png'))

    # ③ 落地地刺：向下冰锥撞地转短时地刺，可见冰锥残留 + 落点结算
    pg.evaluate("""() => {
      const L = game.level, p = game.player;
      game.level.enemies.length = 0; game.shots.length = 0;
      p.x = 35; p.y = 178; p.vx = 0; p.vy = 0; p.onGround = true; p.dead = false; p.hp = 99;
      game.mana = 100; game.skills.u = 0;
      const e = _engMkEnemy('slime', 52, 198, false); e.hp = 9; e._x = e.x; e._y = e.y;
      game.level.enemies.push(e);
      game.input.skillUHit = 1;
    }""")
    pg.wait_for_timeout(90)
    pg.locator('#game').screenshot(path=str(OUT / 'after_groundspike.png'))
    print('场景截图已存入', OUT)


if __name__ == '__main__':
    main()
