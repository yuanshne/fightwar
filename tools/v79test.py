# -*- coding: utf-8 -*-
# v79test.py —— v7.9 玩法回归：Boss 三段血 / 双 Boss 接力 / 冲刺无敌帧 / 谜题不强制 + 解谜掉装备 / 新招可躲
# 跑法：/d/python/python tools/v79test.py    （退出码 0=全过）
from playwright.sync_api import sync_playwright
import pathlib, json, sys

ROOT = pathlib.Path(__file__).parent.parent
BASE = (ROOT / 'index.html').as_uri()
OUT = ROOT / 'testshots'
OUT.mkdir(exist_ok=True)

fails, warns = [], []


def ck(name, cond, detail=''):
    if cond:
        print('  [OK]  ' + name + ('  ' + detail if detail else ''))
    else:
        print('  [FAIL] ' + name + ('  ' + detail if detail else ''))
        fails.append(name)


with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={'width': 1152, 'height': 680})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append('CONSOLE: ' + m.text) if m.type == 'error' else None)

    # ---------- 1) 冲刺无敌帧 0.20s（v14：0.10 → 0.15；v15：0.15 → 0.20） ----------
    pg.goto(BASE + '?level=1&god=1')
    pg.wait_for_timeout(900)
    d = pg.evaluate('''() => {
      const p = game.player;
      for (let i = 0; i < 60; i++) { game.input.dash = 0; game.input.dashHit = 0; updateWorld(1/60); }
      game.input.dashHit = 1; updateWorld(1/60);
      const inv0 = p.invT, blocked = (_engHurtPlayer(p.x) === false);
      for (let i = 0; i < 24; i++) updateWorld(1/60);      // 0.4s 后无敌必须已结束
      const inv1 = p.invT, blocked1 = (_engHurtPlayer(p.x) === false);
      return { inv0: +inv0.toFixed(3), blocked0: blocked, inv1: +inv1.toFixed(3), blocked1: blocked1,
               cfg: BAL.dash.inv };
    }''')
    ck('冲刺起手给 0.20s 无敌', abs(d['inv0'] - 0.20) < 0.02, 'invT=' + str(d['inv0']))
    ck('无敌窗口内伤害被吃掉', d['blocked0'] is True)
    ck('0.4s 后无敌已过期（不是全程无敌）', d['inv1'] <= 0 and d['blocked1'] is False,
       'invT=' + str(d['inv1']) + ' 仍被挡=' + str(d['blocked1']))

    # ---------- 2) 三段血：击破 → 满段复活 → 末段狂暴 → 第三段才真死 ----------
    pg.goto(BASE + '?level=16&god=1')
    pg.wait_for_timeout(900)
    r = pg.evaluate('''() => {
      const out = [];
      const bb = game.boss;
      game.player.x = bb.x - 70; game.player.y = bb.y - 2;
      game.player.hp = 99; game.player.maxHp = 99;
      for (let i = 0; i < 130; i++) updateWorld(1/60);         // 等 intro 演出结束
      const seg = bb.bandMax;
      for (let round = 1; round <= 3; round++) {
        let guard = 0;
        while (guard++ < 600) {                                 // 只在可受伤态下打（revive/enrage 免伤是刻意设计）
          const s = game.boss.state;
          const vul = !(s === 'dormant' || s === 'intro' || s === 'enrage' || s === 'dying' || s === 'dead' || s === 'revive');
          if (vul) _engBossHurt(2);
          updateWorld(1/60);
          const nb = game.boss;
          if (nb !== bb) { out.push({ round, swapped: true, kind: nb.kind }); break; }
          if (bb.bandBreak >= round) break;
        }
        out.push({ round, band: bb.bandBreak, hp: +bb.hp.toFixed(1), ht: +bb.hpTotal.toFixed(1),
                   seg: +seg.toFixed(1), maxHp: bb.maxHp, phase: bb.phase, st: game.boss.state });
      }
      return { out, maxHp: bb.maxHp, seg };
    }''')
    bands = [x for x in r['out'] if 'band' in x]
    ck('L16 判官三段血：bandMax = maxHp/3', abs(r['seg'] - r['maxHp'] / 3) < 1e-6,
       'maxHp=' + str(r['maxHp']) + ' seg=' + str(r['seg']))
    # v8.0 口径：跨段只播演出、总血不回填，血条连续往下掉（打到 49% 就停在 49%）
    ck('第 1 段跨过 → bandBreak=1 且总血 ≤ 2/3（不回满）',
       bands[0]['band'] == 1 and bands[0]['ht'] <= bands[0]['maxHp'] * 2 / 3 + 1e-6,
       json.dumps(bands[0], ensure_ascii=False))
    ck('第 2 段跨过 → bandBreak=2 且总血 ≤ 1/3',
       bands[1]['band'] == 2 and bands[1]['ht'] <= bands[1]['maxHp'] / 3 + 1e-6,
       json.dumps(bands[1], ensure_ascii=False))
    ck('段内派生 hp 恒落在 0..bandMax（UI 填充不越界）',
       all(0 <= x['hp'] <= x['seg'] + 1e-6 for x in bands),
       json.dumps([x['hp'] for x in bands]))
    # 注：P2 是在 revive（0.9s 假死演出）收尾那一帧才置位的，破段瞬间读 phase 恒为 1——
    # 这里改成"破第 2 段后再跑 1.2s，看是否进入 phase 2"。
    ph2 = None
    for _ in range(3):
        ph2 = pg.evaluate('''() => { for (let i = 0; i < 40; i++) updateWorld(1/60);
            return { phase: game.boss.phase, st: game.boss.state }; }''')
        if ph2['phase'] == 2:
            break
    ck('进入最后一段触发 P2 狂暴', ph2['phase'] == 2, json.dumps(ph2, ensure_ascii=False))

    # ---------- 2b) 死亡回退：死一次只丢「正在打的那一段」 ----------
    # 口径（用户定的）：血条连续下降，死亡复活时回到本段起点——
    # 打到 49% 死 → 66%；打到 80% 死 → 100%；打到 20% 死 → 33%；已跨过的段保留。
    # 注意：不能带 god=1——god 模式把 window.killPlayer 换成了空函数（ui.js 511 行），
    # 死亡序列根本不会发生，回退逻辑也就测不到。
    pg.goto(BASE + '?level=16')
    pg.wait_for_timeout(900)
    rb = pg.evaluate('''() => {
      const b = game.boss;
      for (let i = 0; i < 130; i++) updateWorld(1/60);       // 等 intro 结束
      const M = b.maxHp;
      const probe = (frac) => {
        b.hpTotal = M * frac; b.bandBreak = _engBandOf(b); b.hp = _engSegHp(b);
        b.state = 'idle'; b.t = 0;
        game.player.x = b.x - 70; game.player.y = b.y + b.h - game.player.h;
        game.player.maxHp = 99; game.player.hp = 99;
        killPlayer();
        for (let i = 0; i < 100; i++) updateWorld(1/60);      // 死亡序列 0.9s + 余量
        return { frac, band: b.bandBreak, pct: +(b.hpTotal / M * 100).toFixed(1),
                 segHp: +b.hp.toFixed(1), bandMax: +b.bandMax.toFixed(1), dead: game.player.dead };
      };
      return { m: M, cases: [probe(0.49), probe(0.80), probe(0.20)] };
    }''')
    ck('打到 49% 死亡 → 复活回到 66%（第二段起点）', abs(rb['cases'][0]['pct'] - 66.7) < 1.0,
       json.dumps(rb['cases'][0], ensure_ascii=False))
    ck('打到 80% 死亡 → 复活回到 100%', abs(rb['cases'][1]['pct'] - 100.0) < 0.5,
       json.dumps(rb['cases'][1], ensure_ascii=False))
    ck('打到 20% 死亡 → 复活回到 33%（第三段起点）', abs(rb['cases'][2]['pct'] - 33.3) < 1.0,
       json.dumps(rb['cases'][2], ensure_ascii=False))
    ck('复活后段内 hp 恰为该段满格（UI 画满一格）',
       all(abs(c['segHp'] - c['bandMax']) < 1e-6 for c in rb['cases']),
       json.dumps([c['segHp'] for c in rb['cases']]))

    # ---------- 3) 终章双 Boss 接力 ----------
    n_lv = int(pg.evaluate('() => ALL_LEVELS.length'))
    last = n_lv
    pg.goto(BASE + '?level=%d&god=1' % last)
    pg.wait_for_timeout(1000)
    fin = pg.evaluate('''() => {
      const lv = game.levelIdx + 1;
      const b0 = game.boss;
      const info0 = { kind: b0.kind, hp: b0.hp, maxHp: b0.maxHp, segs: b0.bandMax * 3 };
      const seen = [];
      game.player.x = b0.x - 70; game.player.y = b0.y - 2;
      game.player.hp = 99; game.player.maxHp = 99;
      let guard = 0, cur = b0;
      while (guard++ < 9000) {
        const bb = game.boss;
        if (bb !== cur) { seen.push({ kind: bb.kind, st: bb.state, hp: bb.hp }); cur = bb; }
        const s = bb.state;
        const vul = !(s === 'dormant' || s === 'intro' || s === 'enrage' || s === 'dying' || s === 'dead' || s === 'revive');
        if (vul) _engBossHurt(8);
        updateWorld(1/60);
        if (game.state !== 'play') break;
      }
      return { lv, info0, seen, gs: game.state, kindNow: game.boss ? game.boss.kind : null, guard };
    }''')
    ck('终章关存在且首发 = 冥古龙(kind 4)', fin['info0']['kind'] == 4,
       '第' + str(fin['lv']) + '关 kind=' + str(fin['info0']['kind']))
    ck('冥古龙血量 = 3 × 整数段', abs(fin['info0']['maxHp'] / 3 - round(fin['info0']['maxHp'] / 3)) < 1e-9,
       'maxHp=' + str(fin['info0']['maxHp']))
    ck('第一棒倒下后换成第二棒（曜光·圣裁者 kind 5）',
       len(fin['seen']) >= 1 and fin['seen'][0]['kind'] == 5,
       json.dumps(fin['seen'], ensure_ascii=False))
    ck('两棒都打完才通关', fin['gs'] == 'clear', 'game.state=' + fin['gs'] + ' 帧=' + str(fin['guard']))

    # ---------- 4) 谜题不再强制 + 解谜掉装备 ----------
    pg.goto(BASE + '?level=1&god=1')
    pg.wait_for_timeout(800)
    pz = pg.evaluate('''() => {
      const L = game.level;
      const unsolved = (L.shrines || []).filter(s => !game.solvedPuzzles[s.idx]);
      // 神龛一个都不解，直接踩终点
      game.player.x = L.goal.x; game.player.y = L.goal.y;
      updateWorld(1/60); updateWorld(1/60);
      const cleared = game.state;
      return { shrines: (L.shrines || []).length, unsolved: unsolved.length, state: cleared };
    }''')
    ck('本关存在未解神龛', pz['unsolved'] > 0, '未解=' + str(pz['unsolved']))
    ck('未解谜题也能直接通关（谜题门已拆）', pz['state'] == 'clear', 'state=' + pz['state'])

    pg.goto(BASE + '?level=8&god=1')
    pg.wait_for_timeout(800)
    pr = pg.evaluate('''() => {
      const before = game.gearDrops.length;
      const idx = (game.level.shrines[0] || {}).idx;
      puzzleSolved(idx);
      const d = game.gearDrops[game.gearDrops.length - 1];
      return { before, after: game.gearDrops.length, slot: d ? d.slot : null, r: d ? d.r : null };
    }''')
    ck('解开谜题必掉 1 件装备', pr['after'] == pr['before'] + 1,
       'slot=' + str(pr['slot']) + ' 稀有度=' + str(pr['r']))
    ck('L8 谜题奖励不低于蓝装(r>=2)', pr['r'] is not None and pr['r'] >= 2, 'r=' + str(pr['r']))

    # ---------- 5) 新招式真的会出东西（breath / halo / dive） ----------
    pg.goto(BASE + '?level=%d&god=1' % last)
    pg.wait_for_timeout(900)
    mv = pg.evaluate('''() => {
      const res = {};
      const b = game.boss;
      game.player.x = b.x - 80; game.player.y = b.y - 2;
      game.player.hp = 99; game.player.maxHp = 99;
      for (let i = 0; i < 130; i++) updateWorld(1/60);
      // 关掉 AI 自选，手动点招，只验证「招式会产出实体且不抛异常」
      const test = (pat, frames) => {
        b.next = pat; b.state = 'windup'; b.t = 0; b.fireN = 0;
        game.bullets.length = 0; game.waves.length = 0;
        let wmax = 0, bmax = 0;
        for (let i = 0; i < frames; i++) {
          updateWorld(1/60);
          wmax = Math.max(wmax, game.waves.length);
          bmax = Math.max(bmax, game.bullets.length);
          if (game.boss !== b) break;
          if (game.boss.state === 'idle' || game.boss.state === 'recover') { if (i > 5) break; }
        }
        return { waves: wmax, bullets: bmax, st: game.boss.state };
      };
      res.breath = test('breath', 120);
      b.hpTotal = b.maxHp; b.bandBreak = 0; b.hp = b.bandMax; b.state = 'idle'; b.t = 0;
      res.dive = test('dive', 160);
      return res;
    }''')
    ck('冥古龙·炼狱吐息真的放出贴地波', mv['breath']['waves'] >= 2, json.dumps(mv['breath']))
    ck('冥古龙·跳劈落地甩出放射弹', mv['dive']['bullets'] >= 8, json.dumps(mv['dive']))

    pg.goto(BASE + '?level=%d&god=1' % last)
    pg.wait_for_timeout(900)
    mv2 = pg.evaluate('''() => {
      const b = game.boss;
      // 直接换第二棒来测 halo
      game.boss = _engMkBoss(b.x + b.w / 2, b.y + b.h - 16, 5);
      const nb = game.boss; nb.state = 'idle'; nb.t = 0;
      game.player.x = nb.x - 80; game.player.y = nb.y - 2;
      game.player.hp = 99; game.player.maxHp = 99;
      nb.next = 'halo'; nb.state = 'windup'; nb.t = 0; nb.fireN = 0;
      game.bullets.length = 0;
      // 累计计数：子弹飞出视口会被回收，只看"同时在场上限"会把已飞走的漏掉
      let spawned = 0, prev = 0;
      for (let i = 0; i < 150; i++) {
        updateWorld(1/60);
        const n = game.bullets.length;
        if (n > prev) spawned += n - prev;
        prev = n;
      }
      return { bullets: spawned, st: game.boss.state };
    }''')
    ck('圣裁者·圣辉轮三圈弹（≥24 发）', mv2['bullets'] >= 24, json.dumps(mv2))

    # ---------- 6) 招式表完整性：池里每一招都必须有前摇时长且 ≥0.45s（否则会卡在 windup 或无法反应） ----------
    pg.goto(BASE + '?level=7&god=1')
    pg.wait_for_timeout(700)
    tbl = pg.evaluate('''() => {
      const names = ['boss', 'boss2', 'boss3', 'boss4', 'boss5'];
      const out = [];
      for (const k of names) {
        const T = BAL[k];
        const pool = (T.poolNear || []).concat(T.poolFar || [], T.p2Add || []);
        const miss = [], fast = [];
        for (const n of pool) {
          if (T.windup[n] === undefined) miss.push(n);
          else if (T.windup[n] < 0.45) fast.push(n + '=' + T.windup[n]);
          if (T.recover && T.recover[n] === undefined) miss.push(n + '(recover)');
        }
        out.push({ k, pool: Array.from(new Set(pool)).length, miss: Array.from(new Set(miss)), fast,
                   revive: T.revive, segOK: (T.hp % 3) === 0, hp: T.hp });
      }
      return out;
    }''')
    for t in tbl:
        ck('招式表 ' + t['k'] + '（' + str(t['pool']) + ' 招）前摇/收招齐全', not t['miss'],
           '缺失=' + str(t['miss']))
        ck('招式表 ' + t['k'] + ' 前摇都 ≥0.45s（给得出反应窗口）', not t['fast'], '过快=' + str(t['fast']))
        ck('招式表 ' + t['k'] + ' 血量可被 3 整除（三段整分）', t['segOK'], 'hp=' + str(t['hp']))
        ck('招式表 ' + t['k'] + ' 有 revive 时长', bool(t['revive']), 'revive=' + str(t['revive']))

    pg.screenshot(path=str(OUT / '_v79_final_level.png'))
    print('CONSOLE_ERRORS:', len(errs))
    for e in errs[:6]:
        print('  -', e[:220])
    b.close()

print('\nv7.9 机制回归：' + ('全部通过' if not fails else ('失败 ' + str(len(fails)) + ' 项: ' + ', '.join(fails))))
sys.exit(1 if (fails or errs) else 0)
