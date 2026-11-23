# -*- coding: utf-8 -*-
"""_qa_v57_nova.py — T3 QA：霜爆新星八向冰刺独立验证（只读源码，不改 .js/.html）。

用法：
  D:/python/python.exe tools/_qa_v57_nova.py baseline   # 基于 .snap_v57 冻结副本
  D:/python/python.exe tools/_qa_v57_nova.py after      # 基于主目录 index.html（开发线交付后）

场景：8dir（八向布局）/ lowmob（贴地矮怪）/ wall（贴墙）/ platform（平台上下）。
输出：.screenshots/nova_fix/qa_<before|after>_<scene>.png + qa_nova_<mode>.json
"""
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(r'C:\Users\A\Desktop\youxi')
SNAP = ROOT / '.snap_v57' / 'index.html'
MAIN = ROOT / 'index.html'
OUT = ROOT / '.screenshots' / 'nova_fix'
OUT.mkdir(parents=True, exist_ok=True)

MODE = sys.argv[1] if len(sys.argv) > 1 else 'baseline'
HTML = SNAP if MODE == 'baseline' else MAIN
PREFIX = 'qa_before' if MODE == 'baseline' else 'qa_after'
LEVEL = 7

PROFILE = {
    'unlocked': 31, 'stars': {str(i): 3 for i in range(31)},
    'equip': {'w': -1, 'h': -1, 'c': -1}, 'inv': [], 'shards': {}, 'nextId': 2,
    'unlockAll': True, 'skin': 'blue',
    'skins': ['blue', 'sprout', 'crystal', 'azure', 'steel', 'ember', 'ivory',
              'starcore', 'jade', 'sunset', 'nebula', 'abyss', 'coral', 'tide',
              'wraith', 'magma', 'judge', 'spectra', 'holy', 'inferno'],
    'hero': 'mage',
}

# 八向（从正上方起顺时针），与引擎 a=(i/n)*2π-π/2 同序
DIRS8 = ['up', 'upRight', 'right', 'downRight', 'down', 'downLeft', 'left', 'upLeft']


def bucket(vx, vy):
    import math
    a = math.atan2(vy, vx)  # -π..π；up=-π/2
    idx = int(round((a + math.pi / 2) / (math.pi / 4))) % 8
    return DIRS8[idx]


SETUP_JS = r"""
(scene) => {
  const L = game.level, p = game.player;
  if (!L || !p) return { ok: false, reason: 'no level/player' };
  L.enemies.length = 0;
  game.hazards.length = 0; game.bullets.length = 0;
  game.waves.length = 0; game.wells.length = 0; game.shots.length = 0;
  game.boss = null;   // QA：清掉 Boss，避免Boss命中/护盾干扰八向矩阵
  const solid = (tx, ty) => L.solid(tx, ty, game.switchState);

  // 找一块平地：groundTy 行实心，上方两行空，横向 ≥14 格
  let groundTy = -1, runX = -1, runLen = 0;
  outer: for (let ty = 2; ty < L.h - 1; ty++) {
    for (let tx = 2; tx < L.w - 2; tx++) {
      if (!solid(tx, ty) || solid(tx, ty - 1) || solid(tx, ty - 2)) continue;
      let len = 0;
      while (tx + len < L.w - 2 && solid(tx + len, ty) && !solid(tx + len, ty - 1) && !solid(tx + len, ty - 2)) len++;
      if (len >= 14) { groundTy = ty; runX = tx; runLen = len; break outer; }
    }
  }
  if (groundTy < 0) return { ok: false, reason: 'no flat patch' };

  const floorY = groundTy * 16;
  const gpx = runX * 16 + Math.floor(runLen / 2) * 16;
  p.x = gpx - 8; p.y = floorY - 30; p.vx = 0; p.vy = 0; p.onGround = true;
  p.dead = false; p.hp = 99; p.maxHp = 99; p.invT = 99; p.face = 1;
  game.mana = 100; game.skills.u = 0; game.cdMul = 1; game.shots.length = 0;

  const cx = p.x + p.w / 2, cy = _engSpriteTop(p) + 19;
  const mobs = [];
  function add(tag, tx, ty) {
    const e = _engMkEnemy('slime', Math.round(tx - 2), Math.round(ty - 5), false);
    e.w = 12; e.h = 10; e.x = tx - 6; e.y = ty - 5; e.hx = e.x; e.hy = e.y;
    e.hp = 99; e.maxHp = 99; e.vx = 0; e.vy = 0; e.kb = 0; e.flashT = 0; e.jitT = 0;
    e.freezeT = 0; e.novaSeq = 0; e.dead = 0; e.tag = tag; e.baseX = e.x; e.baseY = e.y;
    if (e.ai) { e.ai.st = 'idle'; e.ai.cd = 99; e.ai.rng = 0; }
    L.enemies.push(e); mobs.push(e);
    return e;
  }

  const R = 34, D = 24;
  if (scene === '8dir') {
    // 八向全部悬空摆放，避免贴地怪在水平/斜向弹道上互相遮挡（QA 布局，不改源码）
    add('up',        cx,       cy - 32);
    add('upRight',   cx + D,   cy - 24);
    add('right',     cx + R,   cy);
    add('downRight', cx + D,   cy + 24);
    add('down',      cx,       cy + 32);
    add('downLeft',  cx - D,   cy + 24);
    add('left',      cx - R,   cy);
    add('upLeft',    cx - D,   cy - 24);
  } else if (scene === 'lowmob') {
    // 贴地矮怪：左右各一只贴地、无遮挡；近点左右各一只对照距离
    add('farL',  cx - 34, floorY - 5);
    add('farR',  cx + 34, floorY - 5);
    add('nearL', cx - 16, floorY - 5);
    add('nearR', cx + 16, floorY - 5);
  } else if (scene === 'wall') {
    // 平地右端找一堵竖墙；玩家与史莱姆夹在墙前
    let wallTx = -1;
    for (let tx = runX + runLen - 1; tx < Math.min(L.w - 2, runX + runLen + 6); tx++) {
      if (solid(tx, groundTy) && solid(tx, groundTy - 1)) { wallTx = tx; break; }
    }
    if (wallTx < 0) return { ok: false, reason: 'no wall near patch' };
    const wallX = wallTx * 16;
    p.x = wallX - 30; p.y = floorY - 30;
    add('wallR', wallX - 13, floorY - 5);
    add('wallL', wallX - 40, floorY - 5);
  } else if (scene === 'platform') {
    // Boss 竞技场无天然浮空台：运行时注入一块静态 48×8 平台（QA 专用，不改源码）
    const platY = floorY - 40;
    const ppx = gpx;
    L.plats.push({ x: ppx - 24, y: platY, w: 48, h: 8, hz: 1, dir: 0, spd: 0,
      minX: ppx - 24, maxX: ppx - 24, minY: platY, maxY: platY, dx: 0, dy: 0 });
    p.x = ppx - 8; p.y = platY - 30; p.onGround = true;
    const pcx = p.x + p.w / 2, pcy = _engSpriteTop(p) + 19;
    add('above', pcx, pcy - 32);            // 平台上方
    add('below', pcx, floorY - 5);          // 平台下方地面
    add('sideL', pcx - R, platY - 5);
    add('sideR', pcx + R, platY - 5);
  }

  game.cam.x = Math.max(0, Math.min(Math.max(0, L.w * 16 - 384), p.x - 180));
  game.cam.y = Math.max(0, Math.min(Math.max(0, L.h * 16 - 224), p.y - 100));

  if (window.__qaPin) clearInterval(window.__qaPin);
  window.__qaPin = setInterval(() => {
    for (const e of mobs) {
      if (e.dead > 0) continue;
      e.x = e.baseX; e.y = e.baseY; e.hx = e.baseX; e.hy = e.baseY;
      e.vx = 0; e.vy = 0; e.kb = 0;
    }
  }, 16);

  const tileRows = [];
  for (let ty = Math.floor((p.y - 40) / 16); ty <= Math.floor((p.y + 30) / 16); ty++) {
    let row = '';
    for (let tx = Math.floor((p.x - 64) / 16); tx <= Math.floor((p.x + 64) / 16); tx++) {
      row += solid(tx, ty) ? '#' : '.';
    }
    tileRows.push(ty + ':' + row);
  }

  return { ok: true, cx: Math.round(cx), cy: Math.round(cy), floorY: floorY,
    tileRows: tileRows,
    mobs: mobs.map(e => ({ tag: e.tag, x: Math.round(e.x), y: Math.round(e.y), hp: e.hp })) };
}
"""

SNAPSHOT_JS = r"""
() => {
  const L = game.level;
  const mobs = L.enemies.map(e => ({
    tag: e.tag || '?', hp: e.hp, freezeT: +(e.freezeT || 0).toFixed(2),
    novaSeq: e.novaSeq || 0, dead: e.dead > 0,
    x: Math.round(e.x), y: Math.round(e.y)
  }));
  const shots = (game.shots || []).map(s => ({
    kind: s.kind, seq: s.novaSeq || 0, grounded: !!s.grounded,
    spikeLife: +(s.spikeLife || 0).toFixed(2), hitWall: !!s.hitWall,
    life: +(s.life || 0).toFixed(3),
    vx: +(s.vx || 0).toFixed(1), vy: +(s.vy || 0).toFixed(1),
    x: Math.round(s.x), y: Math.round(s.y), w: s.w, h: s.h
  }));
  return { seq: game.novaSeq || 0, mobs, shots, mana: game.mana, uCd: game.skills.u };
}
"""

BAL_JS = r"""
() => {
  const M = BAL.heroes.mage.u;
  return { cd: M.cd, mana: M.mana, dmg: M.dmg, freeze: M.freeze, n: M.n,
           w: M.w, h: M.h, v: M.v, life: M.life };
}
"""


def run_scene(pw, scene, html_path, errors):
    br = pw.chromium.launch(headless=True)
    pg = br.new_page(viewport={'width': 960, 'height': 640})
    perr, cerr = [], []
    pg.on('pageerror', lambda e: perr.append(str(e)))
    pg.on('console', lambda m: cerr.append(m.text) if m.type == 'error' else None)
    pg.goto('file:///' + str(html_path).replace('\\', '/') + '?level=%d&hero=mage&god=1' % LEVEL)
    pg.wait_for_timeout(400)
    pg.evaluate("(p) => { try { localStorage.setItem('pq_progress', JSON.stringify(p)); } catch(e) {} }", PROFILE)
    pg.reload()
    try:
        pg.wait_for_function("() => window.game && game.player && game.state === 'play'", timeout=15000)
    except Exception:
        diag = pg.evaluate("() => ({state: (typeof game!=='undefined'?game.state:'no-game'),"
                           " hero: (typeof game!=='undefined'?game.hero:null),"
                           " hasPlayer: !!(typeof game!=='undefined' && game.player)})")
        br.close()
        return {'scene': scene, 'ok': False, 'reason': 'timeout', 'diag': diag,
                'pageerror': perr, 'console_error': cerr}
    pg.wait_for_timeout(1000)

    setup = pg.evaluate(SETUP_JS, scene)
    if not setup.get('ok'):
        br.close()
        return {'scene': scene, 'ok': False, 'reason': setup.get('reason')}

    pg.wait_for_timeout(120)
    pg.locator('#game').screenshot(path=str(OUT / ('%s_%s.png' % (PREFIX, scene))))

    bal = pg.evaluate(BAL_JS)
    before = pg.evaluate(SNAPSHOT_JS)
    pg.keyboard.press('u')
    samples = [{'t': 0, **pg.evaluate(SNAPSHOT_JS)}]
    for ms in (16, 40, 90, 160, 260, 400):
        pg.wait_for_timeout(max(0, ms - samples[-1]['t']))
        samples.append({'t': ms, **pg.evaluate(SNAPSHOT_JS)})
    pg.wait_for_timeout(60)
    final = pg.evaluate(SNAPSHOT_JS)
    pg.locator('#game').screenshot(path=str(OUT / ('%s_%s_after.png' % (PREFIX, scene))))

    pg.evaluate("() => { if (window.__qaPin) clearInterval(window.__qaPin); }")
    br.close()

    # ---- 汇总矩阵 ----
    matrix = {}
    for m in final['mobs']:
        tag = m['tag']
        matrix[tag] = {
            'hit': (before['mobs'] and any(b['tag'] == tag and b['hp'] > m['hp'] for b in before['mobs'])) or m['novaSeq'] > 0,
            'hpBefore': next((b['hp'] for b in before['mobs'] if b['tag'] == tag), None),
            'hpAfter': m['hp'],
            'dmgDealt': (next((b['hp'] for b in before['mobs'] if b['tag'] == tag), m['hp']) - m['hp']),
            'freezeT': m['freezeT'], 'novaSeq': m['novaSeq'], 'dead': m['dead'],
            'x': m['x'], 'y': m['y'],
        }
    # 弹体结局统计（按首样方向桶归类）
    first = samples[1] if len(samples) > 1 else samples[0]
    shot_buckets = [bucket(s['vx'], s['vy']) for s in first['shots']]
    alive_end = len(final['shots'])
    grounded_samples = [sum(1 for s in sm['shots'] if s['grounded']) for sm in samples]
    max_grounded = max(grounded_samples) if grounded_samples else 0
    hit_mobs = sum(1 for v in matrix.values() if v['hit'])
    # 静默消失估算：出膛数 - 存活至终 - 落地转冰刺(峰值) - 已结算命中；≥0
    silent = max(0, len(first['shots']) - alive_end - max_grounded - hit_mobs)
    fate = {'alive_end': alive_end, 'spawned': len(first['shots']),
            'dirs': shot_buckets, 'wallHits': 0,
            'groundedPerSample': grounded_samples, 'maxGrounded': max_grounded,
            'hitMobs': hit_mobs, 'silentVanish': silent,
            'sampleCounts': [len(sm['shots']) for sm in samples]}

    return {'scene': scene, 'ok': True, 'bal': bal, 'setup': setup,
            'before': before, 'samples': samples, 'final': final,
            'matrix': matrix, 'fate': fate,
            'pageerror': perr, 'console_error': cerr}


def main():
    report = {'mode': MODE, 'html': str(HTML), 'scenes': {}}
    with sync_playwright() as pw:
        for scene in ('8dir', 'lowmob', 'wall', 'platform'):
            print('== scene', scene)
            try:
                report['scenes'][scene] = run_scene(pw, scene, HTML, None)
            except Exception as e:
                import traceback
                report['scenes'][scene] = {'scene': scene, 'ok': False, 'reason': repr(e),
                                           'tb': traceback.format_exc()}
            s = report['scenes'][scene]
            if s.get('ok'):
                print('  hit:', {k: v['hit'] for k, v in s['matrix'].items()})
                print('  fate:', s['fate'])
            else:
                print('  skip:', s.get('reason'))

    out_json = OUT / ('qa_nova_%s.json' % MODE)
    out_json.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print('written', out_json)


if __name__ == '__main__':
    main()
