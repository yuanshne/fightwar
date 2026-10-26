// v8.0 诊断：小怪卡住 / 抖动普查（只读，不改引擎）
//
// 用法：
//   node tools/_v80_stuck.js            → 全 18 关逐只地面敌人 600 帧普查 + 传送带现场复现
//   node tools/_v80_stuck.js --base     → 同上，但引擎取 git HEAD 版（= 修复前基线，用于前后对比）
//   node tools/_v80_stuck.js --dump 4   → 打印 L4 网格 + 敌人坐标（定位现场）
//   node tools/_v80_stuck.js --trace 4 3 → L4 第 3 只地面敌人逐帧（x/vx/grounded/ai.st）
//   node tools/_v80_stuck.js --conv 4   → 只跑 L4 的传送带现场复现
//
// 判定口径：
//   卡住 = 横向活动范围 spanX < 8px（肉眼完全看不出在动）。用 spanX 而不是净位移：
//          正常巡逻兵在平台上往返，10s 后回到原点，净位移天然≈0，用净位移会把健康巡逻全判成卡住。
//   抖动 = 掉头次数 > 12 次 / 600 帧（工单口径）。附加 turnsPerSec 便于区分「真高频抖动」与
//          「2 格小平台上的正常巡逻」——后者一次往返要 0.7s，肉眼是清楚的移动。
//   v8.0 脱困复核：另加一列「脱困」= 引擎 e.rescueN（本只敌人 600 帧内触发脱困的次数），
//          并把「活动跨度 < 40px（2.5 格）」单列统计 —— 这才是用户截图里「原地打转」的真实口径
//          （spanX 8px 太宽松：36~68px 的小坑里打转，旧口径一只都抓不到）。
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const THEMES = {};
['grass','cave','sky','factory','lava','tower','boss','wind','castle','star','sea','nether']
  .forEach(k => { THEMES[k] = {}; });
const DT = 1 / 60;
const GROUND = ['slime', 'knight', 'mage', 'lancer', 'boomer', 'beetle', 'spitter', 'hopper'];
const STILL = ['mage', 'spitter'];   // 站桩设计（位移恒 0 不算卡住）
const DORMANT = ['boomer'];          // 玩家不在唤醒半径内时按设计不动（隔离测试里玩家在出生点）

function buildSandbox(useBase) {
  let body = read('levels.js');
  for (const f of ['chapter2.js', 'chapter3.js']) if (fs.existsSync(path.join(ROOT, f))) body += '\n' + read(f);
  let eng;
  if (useBase) {
    try { eng = execSync('git show HEAD:engine.js', { cwd: ROOT, maxBuffer: 1 << 26 }).toString(); }
    catch (e) { console.error('取 git HEAD:engine.js 失败（--base 需要干净的 git 仓库）'); process.exit(1); }
  } else eng = read('engine.js');
  body += '\n;aggregateLevels();\n' + eng
    + '\n;return {Level,ALL_LEVELS,game,loadLevel,updateWorld,PHY,BAL};';
  return new Function('THEMES', body)(THEMES);
}

/* ==================== 场景 A：真实关卡数据，逐只地面敌人隔离跑 600 帧 ==================== */
// 只留被测这一只（其他敌人清空，避免互相干扰），玩家钉在出生点（血量拉高防死），输入全空。
function runOne(sb, li, ei, frames) {
  sb.loadLevel(li, false);
  const g = sb.game, L = g.level;
  g.state = 'play';
  const all = L.enemies.filter(e => GROUND.indexOf(e.type) >= 0 && !(e.dead > 0));
  const e = all[ei];
  if (!e) return null;
  L.enemies = [e];
  const p = g.player;
  p.hp = 999; p.maxHp = 999;
  for (let f = 0; f < 30; f++) sb.updateWorld(DT); // 30 帧暖机：等出生悬空的敌人落到地面
  const x0 = e.x, y0 = e.y;
  let path = 0, turns = 0, prevSign = Math.sign(e.vx), prevX = e.x, prevY = e.y;
  let maxVx = 0, minX = e.x, maxX = e.x, lastTurnF = -999, minGap = 999;
  const trace = [];
  for (let f = 0; f < frames; f++) {
    g.input.left = 0; g.input.right = 0; g.input.jump = 0; g.input.jumpHit = 0;
    g.input.attackHit = 0; g.input.dashHit = 0; g.input.down = 0;
    sb.updateWorld(DT);
    path += Math.hypot(e.x - prevX, e.y - prevY);
    const s = Math.sign(e.vx);
    if (s !== 0 && prevSign !== 0 && s !== prevSign) {
      turns++;
      if (f - lastTurnF < minGap) minGap = f - lastTurnF;
      lastTurnF = f;
    }
    if (s !== 0) prevSign = s;
    if (Math.abs(e.vx) > maxVx) maxVx = Math.abs(e.vx);
    if (e.x < minX) minX = e.x;
    if (e.x > maxX) maxX = e.x;
    prevX = e.x; prevY = e.y;
    if (f % 10 === 0) trace.push([f, +e.x.toFixed(2), +e.y.toFixed(2), Math.round(e.vx), e.grounded ? 1 : 0, e.ai ? e.ai.st : '-']);
  }
  return { li: li + 1, type: e.type, idx: ei, x0: x0, y0: y0, x1: e.x, y1: e.y,
    net: Math.hypot(e.x - x0, e.y - y0), path: path, turns: turns, maxVx: maxVx,
    spanX: maxX - minX, minGap: minGap, rescue: e.rescueN || 0, trace: trace };
}

/* ==================== 场景 B：传送带现场复现（复刻用户截图） ==================== */
// 当前关卡里没有任何敌人真的站在传送带上，用户截图那只只能是「走上去 / 被摆上去的」——
// 所以把三种地面敌人分别摆到每段传送带的左端/中间/右端，跑 600 帧看它是不是真的在动。
function convSpans(L) {
  const spans = [];
  for (let y = 0; y < L.h; y++) {
    let x = 0;
    while (x < L.w) {
      const ch = L.tiles[y][x];
      if (ch === '(' || ch === ')') {
        const x0 = x;
        while (x < L.w && (L.tiles[y][x] === '(' || L.tiles[y][x] === ')')) x++;
        spans.push({ x0: x0, x1: x - 1, y: y });
      } else x++;
    }
  }
  return spans;
}

function runAt(sb, li, type, px, py, frames) {
  sb.loadLevel(li, false);
  const g = sb.game, L = g.level;
  g.state = 'play';
  const def = { slime: [12, 10], knight: [12, 18], lancer: [12, 14], beetle: [14, 12], hopper: [12, 12] }[type];
  const e = { type: type, x: px, y: py, w: def[0], h: def[1], vx: -28, vy: 0, hx: px, hy: py,
    ax: px, ay: py, dead: 0, t: 0, grounded: false, hp: 3, kb: 0, flashT: 0, jitT: 0, dvx: 0, dvy: 0,
    face: -1, guardDown: false, convV: 0, turnCd: 0, ai: { st: 'idle', t: 0, cd: 9, cd0: 9, tx: 0, ty: 0 } };
  L.enemies = [e];
  const p = g.player;
  p.hp = 999; p.maxHp = 999;
  p.x = L.spawn.x; p.y = L.spawn.y;
  for (let f = 0; f < 30; f++) sb.updateWorld(DT);
  const x0 = e.x, y0 = e.y;
  let path = 0, turns = 0, prevSign = Math.sign(e.vx), prevX = e.x, prevY = e.y;
  let minX = e.x, maxX = e.x, minY = e.y, maxY = e.y;
  for (let f = 0; f < frames; f++) {
    g.input.left = 0; g.input.right = 0; g.input.jump = 0; g.input.jumpHit = 0;
    g.input.attackHit = 0; g.input.dashHit = 0; g.input.down = 0;
    sb.updateWorld(DT);
    path += Math.hypot(e.x - prevX, e.y - prevY);
    const s = Math.sign(e.vx);
    if (s !== 0 && prevSign !== 0 && s !== prevSign) turns++;
    if (s !== 0) prevSign = s;
    if (e.x < minX) minX = e.x;
    if (e.x > maxX) maxX = e.x;
    if (e.y < minY) minY = e.y;
    if (e.y > maxY) maxY = e.y;
    prevX = e.x; prevY = e.y;
  }
  return { x0: x0, y0: y0, x1: e.x, y1: e.y, spanX: maxX - minX, spanY: maxY - minY,
    path: path, turns: turns, grounded: e.grounded };
}

function pct(v) { return v.toFixed(1); }

function census(sb) {
  const rows = [];
  let stuck = 0, jit = 0, still = 0, dormant = 0, total = 0, narrow = 0;
  for (let i = 0; i < sb.ALL_LEVELS.length; i++) {
    sb.loadLevel(i, false);
    const n = sb.game.level.enemies.filter(e => GROUND.indexOf(e.type) >= 0 && !(e.dead > 0)).length;
    for (let ei = 0; ei < n; ei++) {
      const r = runOne(sb, i, ei, 600);
      if (!r) continue;
      total++;
      const isStill = STILL.indexOf(r.type) >= 0;
      const isDormant = DORMANT.indexOf(r.type) >= 0;
      const s = (isStill || isDormant) ? false : (r.spanX < 8); // 沉睡/站桩是设计行为，不计入卡住
      const j = r.turns > 12;
      // v8.0：跨度 < 40px（2.5 格）——站桩/沉睡按设计不动，不计入
      const nw = (isStill || isDormant) ? false : (r.spanX < 40);
      if (s) stuck++;
      if (j) jit++;
      if (nw) narrow++;
      if (isStill) still++;
      if (isDormant) dormant++;
      rows.push({ r: r, s: s, j: j, nw: nw, still: isStill, dormant: isDormant });
    }
  }
  console.log('关    #   类型      起点            净位移  路径长  掉头  峰速  横向跨度  脱困  判定');
  for (const it of rows) {
    const r = it.r;
    console.log('L' + String(r.li).padEnd(3) + String(r.idx).padEnd(4) + String(r.type).padEnd(9) +
      ('(' + r.x0.toFixed(0) + ',' + r.y0.toFixed(0) + ')').padEnd(16) +
      pct(r.net).padStart(6) + pct(r.path).padStart(8) + String(r.turns).padStart(6) +
      pct(r.maxVx).padStart(6) + pct(r.spanX).padStart(10) + String(r.rescue).padStart(6) + '  ' +
      (it.still ? '站桩设计' : (it.dormant ? '沉睡设计' : (it.s ? '卡住' : (it.nw ? '窄幅<40' : '')))) + (it.j ? ' 抖动' : ''));
  }
  // v8.0：把「跨度 < 40px」的逐只清单单独打一遍（验收要逐关点名）
  const narrowRows = rows.filter(it => it.nw);
  console.log('  —— 跨度<40px 明细（' + narrowRows.length + ' 只）：' +
    (narrowRows.length ? narrowRows.map(it => 'L' + it.r.li + '#' + it.r.idx + ' ' + it.r.type +
      '(' + it.r.spanX.toFixed(0) + 'px/脱困' + it.r.rescue + ')').join('  ') : '无'));
  console.log('  —— 合计：地面敌人 ' + total + ' 只 | 卡住 ' + stuck + ' | 抖动 ' + jit +
    ' | 跨度<40px ' + narrow +
    '（站桩设计 ' + still + ' / 沉睡设计 ' + dormant + '，均不计入卡住）');
  return { stuck: stuck, jit: jit, total: total, narrow: narrow };
}

function conv(sb, verbose) {
  let stuck = 0, jit = 0, n = 0;
  for (let i = 0; i < sb.ALL_LEVELS.length; i++) {
    sb.loadLevel(i, false);
    const L0 = sb.game.level;
    const spans = convSpans(L0);
    if (!spans.length) continue;
    if (verbose) {
      console.log('L' + (i + 1) + ' ' + L0.meta.name + ' 传送带 ' + spans.length + ' 段：' +
        spans.map(s => 'y=' + s.y + ' x=' + s.x0 + '..' + s.x1).join(' / '));
      console.log('类型      位置     起点x   终点x   跨度x  跨度y  路径    掉头  落地  落点y');
    }
    for (const s of spans) {
      for (const type of ['slime', 'knight', 'lancer']) {
        for (const where of ['左端', '中间', '右端']) {
          const px = where === '左端' ? s.x0 * 16 + 1 : where === '右端' ? s.x1 * 16 - 8 : ((s.x0 + s.x1) / 2) * 16;
          const py = s.y * 16 - ({ slime: 10, knight: 18, lancer: 14 }[type]);
          const r = runAt(sb, i, type, px, py, 600);
          n++;
          const st = r.spanX < 8, jt = r.turns > 12;
          if (st) stuck++;
          if (jt) jit++;
          if (verbose) console.log(type.padEnd(9) + where.padEnd(8) + String(Math.round(r.x0)).padEnd(8) +
            String(Math.round(r.x1)).padEnd(8) + pct(r.spanX).padStart(6) + pct(r.spanY).padStart(7) +
            pct(r.path).padStart(7) + String(r.turns).padStart(6) + (r.grounded ? ' 是' : ' 否').padEnd(5) +
            Math.round(r.y1) + (st ? '  卡住' : '') + (jt ? ' 抖动' : ''));
        }
      }
    }
  }
  console.log('  —— 传送带现场：' + n + ' 组（' + (n / 9) + ' 段 × 3 位置 × 3 种敌）| 卡住 ' + stuck + ' | 抖动 ' + jit);
  return { stuck: stuck, jit: jit, n: n };
}

function main() {
  const argv = process.argv.slice(2);
  const useBase = argv.indexOf('--base') >= 0;
  const sb = buildSandbox(useBase);
  const dump = argv.indexOf('--dump');
  const trace = argv.indexOf('--trace');
  const convOnly = argv.indexOf('--conv');
  console.log((useBase ? '【修复前基线：git HEAD:engine.js】' : '【当前 engine.js】'));
  if (dump >= 0) {
    const li = (+argv[dump + 1]) - 1;
    sb.loadLevel(li, false);
    const L = sb.game.level;
    console.log('L' + (li + 1) + ' ' + L.meta.name + ' ' + L.w + 'x' + L.h);
    for (let y = 0; y < L.h; y++) console.log(String(y).padStart(2) + ' ' + L.tiles[y].join(''));
    console.log('enemies:');
    L.enemies.forEach((e, i) => console.log('  #' + i + ' ' + e.type + ' @(' + e.x.toFixed(1) + ',' + e.y.toFixed(1) +
      ') w/h=' + e.w + '/' + e.h + ' vx=' + e.vx + ' 脚下=' + L.tileAt(Math.floor((e.x + e.w / 2) / 16), Math.floor((e.y + e.h + 2) / 16))));
    return;
  }
  if (trace >= 0) {
    const r = runOne(sb, (+argv[trace + 1]) - 1, +argv[trace + 2], 600);
    console.log('L' + r.li + ' #' + r.idx + ' ' + r.type + ' start(' + r.x0.toFixed(1) + ',' + r.y0.toFixed(1) + ')');
    console.log('frame  x      y      vx  gr ai');
    r.trace.forEach(t => console.log(String(t[0]).padStart(3) + '  ' + String(t[1]).padEnd(7) + String(t[2]).padEnd(7) +
      String(t[3]).padStart(4) + '  ' + t[4] + '  ' + t[5]));
    return;
  }
  if (convOnly >= 0) { conv(sb, true); return; }
  console.log('\n===== A. 全关卡逐只普查（600 帧/只，隔离：只留被测敌，玩家在出生点） =====');
  const a = census(sb);
  console.log('\n===== B. 传送带现场复现（复刻用户截图：把敌人摆到每段传送带的左/中/右端） =====');
  const b = conv(sb, true);
  console.log('\n===== 汇总 =====');
  console.log('A 全关普查：卡住 ' + a.stuck + ' / 抖动 ' + a.jit + ' / 跨度<40px ' + a.narrow + '（共 ' + a.total + ' 只）');
  console.log('B 传送带现场：卡住 ' + b.stuck + ' / 抖动 ' + b.jit + '（共 ' + b.n + ' 组）');
}
main();
