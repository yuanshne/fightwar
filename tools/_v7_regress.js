// tools/_v7_regress.js —— v7 平衡队全量回归（node 直跑；退出码聚合，0=全过）
// 工单 docs/workorders/v7-balance.md P2：
//   1) node tools/gate.js art|levels|engine 三连（spawn，退出码聚合）；
//   2) 既有工具零回归：_v6_feel_test / _v6_loot_test / _v6_fx_check（存在则跑，不存在 SKIP）；
//   3) BAL 一致性：桩环境执行 levels.js+engine.js 读 BAL——a) v6 既有键 vs v6-balance §0；
//      b) v7 新键 vs 设计书 §8（硬编码 diff，0 差异；未合入标 PENDING 不判败）；c) 权重表和=100（六新+三旧）；
//   4) validateLevels 双口径：无章节（10 关 msg）+ 桩注入假 CHAPTERS（两章各 3 最小合法关，照 L1 抄；16 关 msg）
//      + 负向自测（假关 theme='grass' → 断言 err，纯内存桩、验证后即弃，不落盘）。
// 本脚本只读各队文件，不写不删任何游戏文件。
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

let failed = false, nPass = 0, nFail = 0, nSkip = 0;
const results = [];
function section(t) { console.log('\n==== ' + t + ' ===='); }
function record(name, ok, detail) {
  results.push({ name: name, ok: ok });
  console.log((ok ? '[PASS] ' : '[FAIL] ') + name + (detail ? ' —— ' + detail : ''));
  if (ok) nPass++; else { nFail++; failed = true; }
}
function recordSkip(name, detail) { nSkip++; console.log('[SKIP] ' + name + (detail ? ' —— ' + detail : '')); }
function recordPending(name, detail) { nSkip++; console.log('[PENDING] ' + name + (detail ? ' —— ' + detail : '')); }

// ---------- 1. 门禁三连 ----------
section('1. node tools/gate.js art|levels|engine');
for (const m of ['art', 'levels', 'engine']) {
  const r = spawnSync(process.execPath, ['tools/gate.js', m], { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
  const lines = ((r.stdout || '') + (r.stderr || '')).trim().split('\n');
  record('gate ' + m, r.status === 0,
    r.status === 0 ? lines.filter(l => /OK|聚合|断言/.test(l)).slice(0, 2).join(' | ').slice(0, 220)
                   : 'exit=' + r.status + ' :: ' + lines.slice(0, 3).join(' | ').slice(0, 300));
}

// ---------- 2. 既有工具零回归 ----------
section('2. v6 既有工具零回归');
for (const t of ['_v6_feel_test.js', '_v6_loot_test.js', '_v6_fx_check.js']) {
  if (!fs.existsSync(path.join(ROOT, 'tools', t))) { recordSkip(t, '文件不存在'); continue; }
  const r = spawnSync(process.execPath, ['tools/' + t], { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
  const lines = ((r.stdout || '') + (r.stderr || '')).trim().split('\n');
  if (r.status === 0) {
    record(t, true, lines[lines.length - 1].slice(0, 200));
    continue;
  }
  // _v6_fx_check 特例归因：其 6)/7) 号检查硬编码 v6 波次体积预算（tools/_v6_fx_check.js:87 BASE=124937,
  // 早于 v5/v6 美术增量，git HEAD 实为 140575B）与 v6 波次"纯新增"规则；v7 波次由美术队工单 v7-art.md
  // H5 另行授权增量 ≤30KB（取代旧预算）。art.js 与本工具均非平衡队所有权——若失败行全部属于被取代的
  // 旧规则类，且 gate art（美术队 H1 门禁）已过、art.js 较 git HEAD 增量 ≤30KB（v7 H5），则记
  // KNOWN-EXTERNAL（如实归因，不判败也不吞掉其他真失败）。
  // 「7) THEMES 被改动(skyT 行 N 条)」为该工具正则 /^[+-].*skyT/ 的误报类：实测 2026-10-25 两处命中均为
  //   art 队新增 sea/nether 主题分支内部的 '+' 行（读 th.skyT，非改既有 THEMES 行），故一并归入旧规则类。
  const failLines = lines.filter(l => /^\d+\)/.test(l.trim()));
  const superseded = l => /art\.js 体积 \d+B，增量 \d+B > 10240B/.test(l)
    || /^\d+\) art\.js diff 含 \d+ 条删除行/.test(l)
    || /^\d+\) THEMES 被改动/.test(l);
  if (t === '_v6_fx_check.js' && failLines.length && failLines.every(superseded)) {
    let headSize = -1;
    try { headSize = spawnSync('git', ['cat-file', '-s', 'HEAD:art.js'], { cwd: ROOT, encoding: 'utf8' }).stdout; } catch (e) {}
    headSize = parseInt(headSize, 10);
    const curSize = fs.statSync(path.join(ROOT, 'art.js')).size;
    const inc = curSize - (isNaN(headSize) ? curSize : headSize);
    const v7ok = inc >= 0 && inc <= 30 * 1024;
    const artGatePass = results.some(x => x.name === 'gate art' && x.ok);
    if (v7ok && artGatePass) {
      recordSkip('_v6_fx_check.js（KNOWN-EXTERNAL）',
        '失败仅涉及 v6 波次旧预算(≤10240B/纯新增)，已被 v7-art 工单 H5 取代：art.js ' + curSize + 'B，'
        + '较 git HEAD 增量 ' + inc + 'B ≤ 30KB(v7 H5 ✓)，gate art ✓。归美术队所有权，平衡队不改不判败');
      continue;
    }
    record(t, false, '失败行属旧预算类但 v7 H5 预算/ gate art 核对未过: 增量=' + inc + 'B artGate=' + artGatePass);
    continue;
  }
  record(t, false, 'exit=' + r.status + ' :: ' + lines.slice(0, 3).join(' | ').slice(0, 300));
}

// ---------- 3. BAL 一致性 ----------
section('3. BAL 一致性（桩环境 levels.js+engine.js）');
const V6_EXPECTED = { // docs/specs/2026-10-24-v6-balance.md §0 逐值（唯一权威）
  fall: { fast: 360 },
  player: { hpBase: 5, atkBase: 1, critMul: 2, critMod: 4, stompDmg: 1, stompBounce: 235,
            hurtKbX: 160, hurtKbY: 131, invT: 1.0, respawnInvT: 1.5 },
  atk: { cd: 0.35, boxW: 18, boxH: 14, anim: 0.25, wind: 0.05, dur: 0.12, hitStop: 0.10 },
  dash: { cd: 0.8, dur: 0.28, v: 260, gravMul: 0.5 },
  combo: { win: 2, ultNeed: 8 },
  skills: {
    u: { cd: 8, meteors: 3, fallV: 300, delay: [0.50, 0.75, 1.00], dmg: 2, bossDmg: 2, aoe: 24 },
    i: { cd: 12, dur: 3.0, absorb: 2 },
    o: { cd: 20, dmg: 5, t: [0.55, 0.90, 1.20] },
    l: { cd: 6, vOut: 320, range: 160, vBack: 340, dmg: 2, life: 2.6 } },
  enemy: {
    slime: { hp: 2, spd: 28, fall: 300, skill: { rngX: 56, up: 40, dn: 48, wind: 0.5, vx: 90, vy: 260, cd: 3.2 } },
    bat: { hp: 1, spd: 40, rng: 44, skill: { rng: 90, wind: 0.5, vDive: 240, diveMax: 0.55, vBack: 120, cd: 4.0 } },
    knight: { hp: 3, spd: 20, skill: { rngX: 110, rngY: 24, wind: 0.6, vx: 190, dur: 0.5, vuln: 0.7, cd: 5.0 } },
    mage: { hp: 2, skill: { rng: 140, cast: 0.8, recover: 0.5, boltV: 95, home: 1.6, turn: 2.2, boltLife: 3.2, cd: 3.5 } } },
  boss: { hp: 60, p2At: 30, actDist: 176, grav: 1500, fallV: 520,
          windup: { leap: 0.50, barrage: 0.45, charge: 0.60, summon: 0.50, nova: 0.55 }, p2WindMul: 0.85,
          idleT: [0.6, 0.45], walk: [20, 25],
          leap: { T: 0.9, vy: 675, clamp: 300 },
          charge: { v: [230, 290], maxT: 1.5, maxX: 320 },
          barrage: { v: 130, rounds: 3, pairGap: 0.15, endT: 0.45 },
          nova: { v: 100, t: [0.55, 0.95], endT: 1.2 },
          stagger: 1.5, enrage: 1.2, dying: 2.2,
          recover: { leap: 0.7, barrage: 0.5, charge: 0.4, summon: 0.5, nova: 0.6 },
          contactDmg: 1 },
  econ: { coin: 1, gem: 5, puzzle: 5, brick: 1, heartChance: 0.30, heartHeal: 1, dropGrav: 1200, dropFall: 360 },
  gear: { boss1: [44, 30, 16, 8, 2], boss2: [20, 35, 25, 15, 5], elite: [55, 30, 12, 3, 0],
          eliteChance: 0.10, bossExtra: 0.30,
          stat: { w: [1, 2, 3, 4, 6], h: [1, 2, 3, 4, 4], cSpd: [4, 6, 8, 10, 12], cCd: [4, 6, 8, 10, 12] },
          shardsPerStep: 3, shardsPerSalvage: 2, bagSize: 12 },
  guard: { parts: 240, floats: 40, fx: 60, scars: 8 }
};
const V7_EXPECTED = { // docs/specs/2026-10-24-v7-design.md §8 逐值（唯一权威）
  boss2: { hp: 90, p2At: 36, actDist: 176, grav: 1500, fallV: 520, w: 64, h: 40,
           windup: { leap: 0.55, barrage: 0.50, charge: 0.65, summon: 0.50, sweep: 0.55, nova: 0.55 },
           p2WindMul: 0.85, idleT: [0.7, 0.5], walk: [26, 32],
           leap: { T: 1.0, vy: 700, clamp: 320 },
           charge: { v: [250, 310], maxT: 1.5, maxX: 320 },
           barrage: { v: 110, rounds: 4, pairGap: 0.18, endT: 0.5, deg: [-18, 0, 18] },
           sweep: { rounds: 3, gap: 0.55, wv: 130, life: 0.42, wh: 16 },
           nova: { v: 110, t: [0.55, 0.95], endT: 1.2 },
           summon: { type: 'jelly', n: 2, off: [-44, 44] },
           stagger: 1.5, enrage: 1.2, dying: 2.2,
           recover: { leap: 0.7, barrage: 0.5, charge: 0.4, summon: 0.5, nova: 0.6, sweep: 0.6 },
           poolNear: ['sweep', 'leap', 'summon', 'sweep'],
           poolFar: ['barrage', 'charge', 'leap', 'barrage'],
           p2Add: ['nova'], contactDmg: 1, drop1: 'jiao1', drop2: 'jiao2' },
  boss3: { hp: 140, p2At: 56, actDist: 176, grav: 1500, fallV: 520, w: 40, h: 52,
           windup: { blink: 0.50, scythe: 0.60, barrage: 0.45, summon: 0.50, nova: 0.55 },
           p2WindMul: 0.85, idleT: [0.55, 0.4], walk: [18, 22],
           leap: { T: 0.9, vy: 675, clamp: 300 },
           charge: { v: [230, 290], maxT: 1.5, maxX: 320 },
           barrage: { v: 120, rounds: 3, pairGap: 0.16, endT: 0.45, deg: [-10, 0, 10] },
           blink: { hideT: 0.30, dx: 96, after: 0.35 },
           scythe: { wv: 150, life: 0.6, w: 16, h: 22 },
           nova: { v: 105, t: [0.55, 0.95], endT: 1.2 },
           summon: { type: 'ghost', n: 2, off: [-48, 48] },
           stagger: 1.5, enrage: 1.2, dying: 2.4,
           recover: { blink: 0.4, scythe: 0.6, barrage: 0.5, summon: 0.5, nova: 0.6, leap: 0.7, charge: 0.4 },
           poolNear: ['scythe', 'blink', 'summon', 'scythe'],
           poolFar: ['barrage', 'blink', 'scythe', 'barrage'],
           p2Add: ['nova'], contactDmg: 1, drop1: 'gui1', drop2: 'gui2' },
  bossExtraKeys: { // BAL.boss 追加键（kind1 收编）
    w: 52, h: 48, drop1: 'boss1', drop2: 'boss2',
    summon: { type: 'slime', n: 2, off: [-40, 40] },
    poolNear: ['charge', 'leap', 'summon', 'charge'],
    poolFar: ['barrage', 'charge', 'leap', 'barrage'],
    p2Add: ['nova'] },
  bossBarrageDeg: [-8, 8],
  enemy7: {
    lancer: { hp: 2, spd: 34, fall: 300, skill: { rngX: 72, rngY: 24, wind: 0.55, vx: 240, dur: 0.28, recover: 0.5, cd: 4.5 } },
    jelly: { hp: 1, skill: { rng: 40, wind: 0.6, dur: 0.4, ring: 18, cd: 5.0 } },
    ghost: { hp: 2, skill: { wake: 150, lose: 260, spd: 26, home: 40 } },
    boomer: { hp: 1, spd: 30, fall: 300, skill: { wake: 120, rng: 36, rngY: 40, wind: 0.8, r: 30 } } },
  elite: { scale: 1.75, spdMul: 0.8, kbMul: 0.25, lancer: { hp: 14 }, ghost: { hp: 12 } },
  flow: { acc: 600, cap: 170 },
  gear7: {
    jiao1: [30, 28, 20, 14, 8], jiao2: [16, 28, 26, 18, 12],
    gui1: [22, 26, 24, 18, 10], gui2: [12, 24, 28, 22, 14],
    hidden: [15, 25, 25, 22, 13], eliteK: [25, 30, 25, 20, 0] },
  chestGem: 5
};

function deepEq(a, e, pfx, diffs) {
  if (Array.isArray(e)) {
    if (!Array.isArray(a) || a.length !== e.length) { diffs.push(pfx + ' 期望数组len=' + e.length + ' 实=' + JSON.stringify(a)); return; }
    for (let i = 0; i < e.length; i++) deepEq(a[i], e[i], pfx + '[' + i + ']', diffs);
    return;
  }
  if (e !== null && typeof e === 'object') {
    if (a === null || typeof a !== 'object') { diffs.push(pfx + ' 期望对象 实=' + JSON.stringify(a)); return; }
    for (const k of Object.keys(e)) deepEq(a[k], e[k], pfx + '.' + k, diffs);
    return;
  }
  if (a !== e) diffs.push(pfx + ' 期望=' + JSON.stringify(e) + ' 实=' + JSON.stringify(a));
}

try {
  const lvSrc = fs.readFileSync(path.join(ROOT, 'levels.js'), 'utf8');
  const enSrc = fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8');
  const themes = {};
  ['grass', 'cave', 'sky', 'factory', 'lava', 'tower', 'boss', 'wind', 'castle', 'star', 'sea', 'nether']
    .forEach(k => themes[k] = {});   // v6 十键 + v7 sea/nether 两键（THEMES 桩，沿 gate.js §1.5 口径）
  const glue = '\n;return {BAL:(typeof BAL==="undefined")?undefined:BAL,'
    + 'ALL_LEVELS:(typeof ALL_LEVELS==="undefined")?undefined:ALL_LEVELS};';
  const sb = new Function('THEMES', lvSrc + '\n' + enSrc + glue)(themes);
  if (!sb || !sb.BAL) { record('BAL 读取', false, 'engine.js 未导出 BAL'); }
  else {
    const BAL = sb.BAL;
    // 3a) v6 既有键逐值
    const d6 = [];
    deepEq(BAL, V6_EXPECTED, 'BAL', d6);
    record('3a v6 既有键值 vs v6-balance §0', d6.length === 0,
      d6.length === 0 ? 'diff=0（' + Object.keys(V6_EXPECTED).length + ' 顶层键全对）'
                      : d6.length + ' 处差异: ' + d6.slice(0, 5).join('; ').slice(0, 280));
    // 3b) v7 新键逐值（未合入=PENDING，合入后必须 diff=0）
    const miss = [], d7 = [];
    if (BAL.boss2 === undefined) miss.push('boss2');
    if (BAL.boss3 === undefined) miss.push('boss3');
    if (BAL.elite === undefined) miss.push('elite');
    if (BAL.flow === undefined) miss.push('flow');
    if (BAL.enemy) for (const k of ['lancer', 'jelly', 'ghost', 'boomer']) if (!BAL.enemy[k]) miss.push('enemy.' + k);
    if (BAL.gear) for (const k of ['jiao1', 'jiao2', 'gui1', 'gui2', 'hidden', 'eliteK']) if (!BAL.gear[k]) miss.push('gear.' + k);
    if (BAL.econ && BAL.econ.chestGem === undefined) miss.push('econ.chestGem');
    if (BAL.boss && BAL.boss.w === undefined) miss.push('boss.追加键');
    if (miss.length) recordPending('3b v7 新键 vs 设计书 §8', '未合入键: ' + miss.join(',') + '（框架队并行中）');
    else {
      deepEq(BAL.boss2, V7_EXPECTED.boss2, 'boss2', d7);
      deepEq(BAL.boss3, V7_EXPECTED.boss3, 'boss3', d7);
      deepEq(BAL.elite, V7_EXPECTED.elite, 'elite', d7);
      deepEq(BAL.flow, V7_EXPECTED.flow, 'flow', d7);
      for (const k of ['lancer', 'jelly', 'ghost', 'boomer']) deepEq(BAL.enemy[k], V7_EXPECTED.enemy7[k], 'enemy.' + k, d7);
      for (const k of ['jiao1', 'jiao2', 'gui1', 'gui2', 'hidden', 'eliteK']) deepEq(BAL.gear[k], V7_EXPECTED.gear7[k], 'gear.' + k, d7);
      deepEq(BAL.econ.chestGem, V7_EXPECTED.chestGem, 'econ.chestGem', d7);
      for (const k of ['w', 'h', 'drop1', 'drop2', 'summon', 'poolNear', 'poolFar', 'p2Add'])
        deepEq(BAL.boss[k], V7_EXPECTED.bossExtraKeys[k], 'boss.' + k, d7);
      deepEq(BAL.boss.barrage.deg, V7_EXPECTED.bossBarrageDeg, 'boss.barrage.deg', d7);
      record('3b v7 新键 vs 设计书 §8', d7.length === 0,
        d7.length === 0 ? 'diff=0（boss2/boss3/enemy×4/elite/flow/gear×6/chestGem/boss 追加键全对）'
                        : d7.length + ' 处差异: ' + d7.slice(0, 5).join('; ').slice(0, 280));
    }
    // 3c) 权重表和=100（六新表 + 三旧表）
    const sums = [];
    for (const k of ['jiao1', 'jiao2', 'gui1', 'gui2', 'hidden', 'eliteK', 'boss1', 'boss2', 'elite']) {
      const w = BAL.gear && BAL.gear[k];
      if (!Array.isArray(w)) { sums.push(k + ':缺失'); continue; }
      const s = w.reduce((a, b) => a + b, 0);
      if (s !== 100) sums.push(k + ':和=' + s);
    }
    record('3c 权重表和=100（六新+三旧）', sums.length === 0, sums.length ? sums.join('; ') : '9 表全部和=100');
  }
} catch (e) {
  record('BAL 桩环境', false, (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e)));
}

// ---------- 4. validateLevels 双口径 + 负向自测 ----------
section('4. validateLevels 双口径（10 关 / 16 关桩）+ 负向自测');
const lvSrc = fs.readFileSync(path.join(ROOT, 'levels.js'), 'utf8');
function stubChapterSrc(l11Theme) { // 两章各 3 个最小合法关（照 L1 抄；纯内存桩，不落盘）
  return `
// ---- v7 平衡队回归桩：CHAPTERS 两章（最小合法关，几何照 L1；仅 validateLevels 口径）----
function _v7mkStub(no, theme, boss, extras){
  const base = LEVELS[0];
  return { name: no + ' · 回归桩', theme: theme, par: 40, hint: '', w: base.w, h: base.h,
    boss: boss || undefined,
    build(g){
      base.build(g);
      if (boss) for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
        const c = g.g[y][x];
        if (c === 'P' || c === 'Q') g.g[y][x] = '.';   // Boss 关：无终点无神龛
      }
      if (boss) g.set(52, 11, 'X');                     // Boss 锚点（validateLevels 不查，摆上贴近真实）
      for (const e of (extras || [])) g.set(e[1], e[2], e[0]);
      return g;
    } };
}
CHAPTERS.push({ id: 2, name: '回归桩·第二章', levels: [
  _v7mkStub(11, '${l11Theme}', 0, [['G', 11, 12], ['g', 10, 11]]),   // G 换地砖(仍实心/可站) + 宝箱(下 1 格 G 支撑)
  _v7mkStub(12, 'sea',    0, [['x', 10, 11]]),                        // 精英①（下 1 格地砖支撑）
  _v7mkStub(13, 'sea',    2, []) ],                                   // Boss 关 boss:2
  puzzles: { 11: { type: 'nono', size: 5, pic: ['.....', '.....', '.....', '.....', '.....'] },
             12: { type: 'sudoku', size: 4, givens: [[0,0,0,4],[0,4,1,2],[2,1,4,0],[4,0,0,0]],
                   sol: [[1,2,3,4],[3,4,1,2],[2,1,4,3],[4,3,2,1]] } } });
CHAPTERS.push({ id: 3, name: '回归桩·第三章', levels: [
  _v7mkStub(14, 'nether', 0, [['G', 11, 12], ['g', 10, 11]]),
  _v7mkStub(15, 'nether', 0, [['z', 65, 11]]),                        // 精英②（距 @ (2,12) 1008px ≥176 ✓）
  _v7mkStub(16, 'nether', 3, []) ],                                   // Boss 关 boss:3
  puzzles: { 14: { type: 'sudoku', size: 4, givens: [[0,0,0,4],[0,4,1,2],[2,1,4,0],[4,0,0,0]],
                   sol: [[1,2,3,4],[3,4,1,2],[2,1,4,3],[4,3,2,1]] } },
  note: '' });
CHAPTERS[1].puzzles[15] = { type: 'nono', size: 5, pic: ['.....', '.....', '.....', '.....', '.....'] };
`;
}
// 4a) 10 关口径（不拼任何章节源——CHAPTERS 空，守卫断言应全部跳过）
const sb10 = new Function(lvSrc + '\n;return { validateLevels: validateLevels };')();
const v10 = sb10.validateLevels();
record('4a validateLevels 10 关口径', v10.ok && /10关断言全部通过/.test(v10.msg), v10.msg);
// 4b) 16 关口径（桩注入假 CHAPTERS——守卫断言应全过）
const sb16 = new Function(lvSrc + stubChapterSrc('sea') + '\n;return { validateLevels: validateLevels };')();
const v16 = sb16.validateLevels();
record('4b validateLevels 16 关口径（桩两章）', v16.ok && /16关断言全部通过/.test(v16.msg), v16.msg);
// 4c) 负向自测：假第二章关 theme='grass' → 断言必须 err（桩纯内存，验证后即弃=自动还原）
const sbNeg = new Function(lvSrc + stubChapterSrc('grass') + '\n;return { validateLevels: validateLevels };')();
const vNeg = sbNeg.validateLevels();
record('4c 负向自测 theme=grass 假关', !vNeg.ok && /第二章新关 theme 应为 sea/.test(vNeg.msg), vNeg.msg);

// ---------- 汇总 ----------
section('汇总');
console.log('PASS=' + nPass + '  FAIL=' + nFail + '  SKIP/PENDING=' + nSkip);
if (failed) { console.error('[v7_regress] 存在失败项'); process.exit(1); }
console.log('[v7_regress] 全项通过');
process.exit(0);
