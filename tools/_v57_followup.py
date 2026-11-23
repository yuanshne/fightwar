# -*- coding: utf-8 -*-
"""_v57_followup.py — QA 三项 FAIL 收口复测。

FAIL-1：孤立单目标纯左/纯右水平冰锥必须命中+冻结（周围 300px 无其它敌）。
FAIL-2：贴地 flush 的正下方敌人 + 脚边贴身正下极端位，落地冰刺纵向覆盖够得着。
FAIL-3：wall 场景静默消失数 = 0（碰 B 砖/墙/地都落地转换或到期消散，无抢先销毁）。

用法：D:/python/python.exe tools/_v57_followup.py
"""
import json
import pathlib
import sys
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = 'file:///' + str(ROOT / 'index.html').replace('\\', '/')
OUT = ROOT / '.screenshots' / 'nova_fix'
OUT.mkdir(parents=True, exist_ok=True)

# 孤立侧目标：cfg.dx = ±30，贴地摆放，全场仅此一只怪
ISOLATED_RUN = """
(cfg) => {
  game.level.enemies.length = 0; game.shots.length = 0; game.bullets.length = 0;
  game.hazards.length = 0; game.waves.length = 0; game.wells.length = 0; game.boss = null;
  const p = game.player;
  p.x = 120; p.y = 178; p.vx = 0; p.vy = 0; p.onGround = true;
  p.dead = false; p.hp = 99; p.invT = 9e9;
  game.mana = 100; game.skills.u = 0; game.cdMul = 1;
  const cx = p.x + p.w / 2, feet = p.y + p.h;
  const e = _engMkEnemy('slime', cx + cfg.dx - 6, feet - 10, false);
  e.w = 12; e.h = 10; e.hp = 9; e.vx = 0; e.vy = 0; e.novaSeq = 0; e.dead = 0;
  e._x = e.x; e._y = e.y;
  game.level.enemies.push(e);
  game.input.skillUHit = 1;
  let hitF = -1, freezeAtHit = 0;
  for (let f = 0; f < 50; f++) {
    e.x = e._x; e.y = e._y; e.vx = 0; e.vy = 0;
    updateWorld(1 / 60);
    if (hitF < 0 && e.hp < 9) { hitF = f + 1; freezeAtHit = e.freezeT || 0; }
  }
  return { hit: e.hp < 9, dmg: 9 - e.hp, freeze: +freezeAtHit.toFixed(3),
    seq: e.novaSeq || 0, hp: e.hp, hitFrame: hitF };
}
"""

# 正下方目标：cfg.mode='flush' 贴地站平；'point' 贴身脚边（水平 0，垂直贴玩家下半身）
DOWN_RUN = """
(cfg) => {
  game.level.enemies.length = 0; game.shots.length = 0; game.bullets.length = 0;
  game.hazards.length = 0; game.waves.length = 0; game.wells.length = 0; game.boss = null;
  const p = game.player;
  p.x = 120; p.y = 178; p.vx = 0; p.vy = 0; p.onGround = true;
  p.dead = false; p.hp = 99; p.invT = 9e9;
  game.mana = 100; game.skills.u = 0; game.cdMul = 1;
  const cx = p.x + p.w / 2, feet = p.y + p.h;
  const ey = cfg.mode === 'point' ? feet - 16 : feet - 10;
  const e = _engMkEnemy('slime', cx - 6, ey, false);
  e.w = 12; e.h = 10; e.hp = 9; e.vx = 0; e.vy = 0; e.novaSeq = 0; e.dead = 0;
  e._x = e.x; e._y = e.y;
  game.level.enemies.push(e);
  game.input.skillUHit = 1;
  let hitF = -1, freezeAtHit = 0;
  for (let f = 0; f < 50; f++) {
    e.x = e._x; e.y = e._y; e.vx = 0; e.vy = 0;
    updateWorld(1 / 60);
    if (hitF < 0 && e.hp < 9) { hitF = f + 1; freezeAtHit = e.freezeT || 0; }
  }
  return { hit: e.hp < 9, dmg: 9 - e.hp, freeze: +freezeAtHit.toFixed(3),
    seq: e.novaSeq || 0, hp: e.hp, hitFrame: hitF,
    box: { x: +e.x.toFixed(1), y: +e.y.toFixed(1) } };
}
"""

# wall 场景：复刻 QA 布局，帧级分类每枚冰锥结局；silent = 既未命中 / 未落地转换 / 未到期消散
WALL_RUN = r"""
() => {
  const L = game.level, p = game.player;
  L.enemies.length = 0; game.hazards.length = 0; game.bullets.length = 0;
  game.waves.length = 0; game.wells.length = 0; game.shots.length = 0; game.boss = null;
  const solid = (tx, ty) => L.solid(tx, ty, game.switchState);
  let groundTy = -1, runX = -1, runLen = 0;
  outer: for (let ty = 2; ty < L.h - 1; ty++) {
    for (let tx = 2; tx < L.w - 2; tx++) {
      if (!solid(tx, ty) || solid(tx, ty - 1) || solid(tx, ty - 2)) continue;
      let len = 0;
      while (tx + len < L.w - 2 && solid(tx + len, ty) && !solid(tx + len, ty - 1) && !solid(tx + len, ty - 2)) len++;
      if (len >= 14) { groundTy = ty; runX = tx; runLen = len; break outer; }
    }
  }
  let wallTx = -1;
  for (let tx = runX + runLen - 1; tx < Math.min(L.w - 2, runX + runLen + 6); tx++) {
    if (solid(tx, groundTy) && solid(tx, groundTy - 1)) { wallTx = tx; break; }
  }
  const wallX = wallTx * 16;
  p.x = wallX - 30; p.y = groundTy * 16 - 30; p.vx = 0; p.vy = 0; p.onGround = true;
  p.dead = false; p.hp = 99; p.invT = 99; p.face = 1;
  game.mana = 100; game.skills.u = 0; game.cdMul = 1;
  function add(tag, tx, ty) {
    const e = _engMkEnemy('slime', Math.round(tx - 2), Math.round(ty - 5), false);
    e.w = 12; e.h = 10; e.x = tx - 6; e.y = ty - 5; e.hx = e.x; e.hy = e.y;
    e.hp = 99; e.vx = 0; e.vy = 0; e.novaSeq = 0; e.dead = 0; e.tag = tag;
    e.baseX = e.x; e.baseY = e.y; L.enemies.push(e);
  }
  add('wallR', wallX - 13, groundTy * 16 - 5);
  add('wallL', wallX - 40, groundTy * 16 - 5);

  game.input.skillUHit = 1;
  const snap = () => game.shots.slice();
  let prev = snap();
  const fate = new Map();   // shot -> {grounded, removedFrame, lifeAtRemove}
  let maxGrounded = 0;
  for (let f = 0; f < 45; f++) {
    for (const e of L.enemies) { e.x = e.baseX; e.y = e.baseY; e.vx = 0; e.vy = 0; e.kb = 0; }
    updateWorld(1 / 60);
    const now = snap();
    maxGrounded = Math.max(maxGrounded, now.filter(s => s.grounded).length);
    for (const old of prev) {
      if (!now.includes(old)) {
        fate.set(old, { grounded: !!old.grounded, frame: f, life: +old.life.toFixed(2) });
      }
    }
    prev = now;
  }
  let grounded = 0, expired = 0, silent = 0;
  for (const [s, f] of fate) {
    if (s.grounded || f.grounded) grounded++;
    else if (f.life <= 1 / 60 + 1e-6) expired++;
    else silent++;
  }
  const hitMobs = L.enemies.filter(e => e.novaSeq > 0).length;
  return { spawned: prev.length + fate.size, grounded, expired, silent, hitMobs,
    maxGrounded,
    mobs: L.enemies.map(e => ({ tag: e.tag, hp: e.hp, seq: e.novaSeq })) };
}
"""


def main():
    fails = []
    with sync_playwright() as pw:
        br = pw.chromium.launch(headless=True)
        pg = br.new_page(viewport={'width': 960, 'height': 640})
        perr = []
        pg.on('pageerror', lambda e: perr.append(str(e)))
        pg.goto(BASE + '?level=7&hero=mage&god=1', wait_until='load')
        pg.wait_for_function("() => typeof game !== 'undefined' && game.player && game.state === 'play'", timeout=15000)
        pg.wait_for_timeout(600)

        # FAIL-1 孤立左 / 右（seq 为全局递增序号，>0 即本次新星已记名；去重口径见 v19 用例）
        for side, dx, shot in [('left', -30, 'after_left_isolated.png'),
                               ('right', 30, 'after_right_isolated.png')]:
            r = pg.evaluate(ISOLATED_RUN, {'dx': dx})
            ok = r['hit'] and r['dmg'] == 3 and r['freeze'] > 0.6 and r['seq'] >= 1
            print('孤立 %-5s 命中=%s 伤害=%s 冻结=%s seq=%s 帧=%s %s' % (
                side, r['hit'], r['dmg'], r['freeze'], r['seq'], r['hitFrame'], 'PASS' if ok else 'FAIL'))
            if not ok: fails.append('isolated-' + side)
            # 截图：重放一次真实时序
            pg.evaluate(ISOLATED_RUN, {'dx': dx})
            pg.wait_for_timeout(90)
            pg.locator('#game').screenshot(path=str(OUT / shot))

        # FAIL-2 贴地 flush + 贴身 point
        for mode, shot in [('flush', 'after_down_grounded.png'), ('point', 'after_down_pointblank.png')]:
            r = pg.evaluate(DOWN_RUN, {'mode': mode})
            ok = r['hit'] and r['dmg'] == 3 and r['freeze'] > 0.6 and r['seq'] >= 1
            print('正下 %-6s 命中=%s 伤害=%s 冻结=%s seq=%s 盒=%s %s' % (
                mode, r['hit'], r['dmg'], r['freeze'], r['seq'], r['box'], 'PASS' if ok else 'FAIL'))
            if not ok: fails.append('down-' + mode)
            pg.evaluate(DOWN_RUN, {'mode': mode})
            pg.wait_for_timeout(90)
            pg.locator('#game').screenshot(path=str(OUT / shot))

        # FAIL-3 wall 零静默：出膛 = 落地转换 + 到期消散 + 命中结算；差额即静默消失
        w = pg.evaluate(WALL_RUN)
        silent = max(0, w['spawned'] - w['grounded'] - w['expired'] - w['hitMobs'])
        wall_ok = silent == 0 and w['hitMobs'] == 2
        print('wall 场景: 出膛=%d 落地转换=%d 到期消散=%d 命中结算=%d 静默消失=%d 峰值落地=%d %s' % (
            w['spawned'], w['grounded'], w['expired'], w['hitMobs'], silent,
            w['maxGrounded'], 'PASS' if wall_ok else 'FAIL'))
        if not wall_ok: fails.append('wall-silent')
        pg.evaluate(WALL_RUN)
        pg.wait_for_timeout(90)
        pg.locator('#game').screenshot(path=str(OUT / 'after_wall_zero_silent.png'))

        br.close()

    print('\npageerror:', perr[:5] if perr else '0')
    if fails or perr:
        print('FAIL:', fails)
        sys.exit(1)
    print('全部收口复测 PASS')


if __name__ == '__main__':
    main()
