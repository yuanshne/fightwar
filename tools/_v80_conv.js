// v8.0 传送带手感复核（任务2）：把「站住被推多远 / 顺向叠加 / 逆向顶住 / 跳过不落地」四项
// 用真物理跑一遍并输出原始数字（不是引用上一轮报告，是重新量）。
//
// 用法：
//   node tools/_v80_conv.js            → 四项实测表 + 与上一轮报告的逐项对账
//   node tools/_v80_conv.js --base     → 同一套量法跑 git HEAD 版引擎（改前基线）
//   node tools/_v80_conv.js --trace    → 额外打印每 10 帧的 vx / convV / 合成速度
//
// 为什么用合成带而不是直接站在 L4 的传送带上量 2 秒：
//   L4 两段真带只有 6 格（96px）和 13 格（208px），280px/s 下 0.34s / 0.74s 就跑完，
//   2 秒位移根本量不到（会被带子尽头/墙钳住）。所以主表用 40 格长带（瓦片语义与关卡一致，
//   就是 '(' / ')'，solid() 认、脚下一行扫描认），另外单独用 L4 真带做 0.5s 交叉核对。
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

// 合成试验关：地面 h-1 行全实心，h-2 行铺 len 格传送带（带子本身可站立，与 L4 铺法一致）。
function mkLevel(sb, dir, len) {
  const w = len + 6, h = 10;
  const meta = {
    name: 'conv-feel', theme: 'factory', w: w, h: h, par: 10, hint: '',
    build(g) {
      g.fill(0, h - 1, w - 1, h - 1, '#');
      g.fill(2, h - 2, 2 + len - 1, h - 2, dir);
      g.set(4, h - 3, '@');
      return g;
    }
  };
  sb.ALL_LEVELS.push(meta);
  return sb.ALL_LEVELS.length - 1;
}

// 起跑：把玩家放到带子中段、站稳（先空转 8 帧让 onGround 生效），再开始计时。
function setup(sb, li, col) {
  sb.loadLevel(li, false);
  const g = sb.game, p = g.player;
  g.state = 'play';
  p.hp = 999; p.maxHp = 999;
  if (col != null) { p.x = col * 16 + 2; p.y = (g.level.h - 2) * 16 - p.h; p.vx = 0; p.vy = 0; }
  for (let f = 0; f < 8; f++) {
    g.input.left = 0; g.input.right = 0; g.input.jump = 0; g.input.jumpHit = 0;
    g.input.attackHit = 0; g.input.dashHit = 0; g.input.down = 0;
    sb.updateWorld(DT);
  }
  return { g: g, p: p };
}

function step(sb, keys) {
  const g = sb.game;
  g.input.left = keys.left ? 1 : 0;
  g.input.right = keys.right ? 1 : 0;
  g.input.jump = 0; g.input.jumpHit = 0;
  g.input.attackHit = 0; g.input.dashHit = 0; g.input.down = 0;
  sb.updateWorld(DT);
}

// ① 站住不动：记录 0.5s / 1s / 2s 的累计位移
//    计时起点必须把带速清零：setup 的 8 帧暖机里带速已经爬到 160，不清零等于「先滑了 0.13s 再开始计时」，
//    1 秒会虚高 20+px（首版就踩了这个坑：读到 273，清零后 250）。
function standStill(sb, li, col) {
  const s = setup(sb, li, col), p = s.p;
  p.convV = 0; p.vx = 0;
  const x0 = p.x, out = {};
  let f = 0;
  for (const k of [30, 60, 120]) {          // 0.5s / 1.0s / 2.0s
    while (f < k) { step(sb, {}); f++; }
    out[k] = p.x - x0;
  }
  out.vx = p.vx; out.convV = p.convV || 0; out.total = p.vx + (p.convV || 0);
  out.onGround = p.onGround;
  return out;
}

// ②/③ 按住方向键到稳态：跑 90 帧（1.5s，足够收敛），取最后 20 帧的平均合成速度
function steady(sb, li, keys) {
  const s = setup(sb, li, 4), p = s.p;
  for (let f = 0; f < 70; f++) step(sb, keys);
  const x0 = p.x;
  for (let f = 0; f < 20; f++) step(sb, keys);
  return { vx: p.vx, convV: p.convV || 0, total: (p.x - x0) / (20 * DT),
    instant: p.vx + (p.convV || 0) };
}

// ④ 跳过带面不落地：把玩家抬到带子上方 3 格、给一个上跳初速，全程 onGround=false，
//    看水平位移是否恒为 0（带子只认 p.onGround，空中不该吃到任何推力）。
function jumpOver(sb, li, frames) {
  const s = setup(sb, li, 4), p = s.p;
  p.y = (s.g.level.h - 2) * 16 - p.h - 48; // 抬高 3 格
  p.vx = 0; p.vy = -260; p.onGround = false; p.convV = 0;
  const x0 = p.x;
  let airFrames = 0, convMax = 0;
  for (let f = 0; f < frames; f++) {
    step(sb, {});
    if (!p.onGround) airFrames++;
    if (Math.abs(p.convV || 0) > convMax) convMax = Math.abs(p.convV || 0);
  }
  return { dx: p.x - x0, airFrames: airFrames, convMax: convMax, landed: p.onGround };
}

function sgn(v) { return (v >= 0 ? '+' : '') + v.toFixed(1); }

function main() {
  const argv = process.argv.slice(2);
  const useBase = argv.indexOf('--base') >= 0;
  const trace = argv.indexOf('--trace') >= 0;
  const sb = buildSandbox(useBase);
  console.log(useBase ? '【基线：git HEAD:engine.js】' : '【当前 engine.js】');

  const R = mkLevel(sb, ')', 40); // 向右推
  const Lf = mkLevel(sb, '(', 40); // 向左推（对称核对）

  console.log('\n===== ① 站住不动（右推带，完全不按键） =====');
  const a = standStill(sb, R, 3);
  console.log('   0.5s 位移 ' + sgn(a[30]) + 'px（' + (a[30] / 16).toFixed(1) + ' 格）');
  console.log('   1.0s 位移 ' + sgn(a[60]) + 'px（' + (a[60] / 16).toFixed(1) + ' 格）');
  console.log('   2.0s 位移 ' + sgn(a[120]) + 'px（' + (a[120] / 16).toFixed(1) + ' 格）');
  console.log('   2.0s 末刻：vx=' + a.vx.toFixed(1) + ' 带速=' + a.convV.toFixed(1) +
    ' 合成=' + a.total.toFixed(1) + 'px/s onGround=' + a.onGround);
  const b = standStill(sb, Lf, 40);  // 左推带从右端起步，才有对称的跑道
  console.log('   对称核对（左推带，右端起步）1.0s 位移 ' + sgn(b[60]) + 'px → ' +
    (Math.abs(b[60] + a[60]) < 0.01 ? 'OK 完全对称' : '⚠ 不对称'));

  console.log('\n===== ② 顺向按住方向键（稳态） =====');
  const fw = steady(sb, R, { right: 1 });
  console.log('   vx=' + fw.vx.toFixed(1) + ' 带速=' + fw.convV.toFixed(1) +
    ' → 合成 ' + fw.total.toFixed(1) + 'px/s（瞬时 ' + fw.instant.toFixed(1) + '，跑速上限 ' + sb.PHY.maxRun + '）');

  console.log('\n===== ③ 逆向按住方向键（稳态，正数 = 仍被带子推回） =====');
  const bw = steady(sb, R, { left: 1 });
  console.log('   vx=' + bw.vx.toFixed(1) + ' 带速=' + bw.convV.toFixed(1) +
    ' → 合成 ' + bw.total.toFixed(1) + 'px/s（瞬时 ' + bw.instant.toFixed(1) + '）');
  console.log('   ' + (bw.total > 0 ? '仍是正向 → 逆向跑也被缓慢推回，符合预期' : '⚠ 已被玩家顶住/顶回去'));

  console.log('\n===== ④ 跳过带面上方（全程不落地） =====');
  const j = jumpOver(sb, R, 24);
  console.log('   0.4s 内水平位移 ' + sgn(j.dx) + 'px | 空中帧 ' + j.airFrames + '/24 | ' +
    '带速峰值 ' + j.convMax.toFixed(1) + ' | 落地=' + j.landed);
  console.log('   ' + (Math.abs(j.dx) < 0.01 && j.convMax === 0 ? 'OK 空中完全不受带子影响' : '⚠ 空中被带子影响了'));

  if (trace) {
    const s = setup(sb, R, 4), p = s.p;
    console.log('\n   trace: frame  x       vx     convV   合成');
    for (let f = 0; f < 60; f++) {
      step(sb, {});
      if (f % 5 === 0) console.log('   ' + String(f).padStart(5) + '  ' + p.x.toFixed(1).padEnd(8) +
        p.vx.toFixed(1).padStart(6) + (p.convV || 0).toFixed(1).padStart(8) +
        (p.vx + (p.convV || 0)).toFixed(1).padStart(8));
    }
  }

  // 真实关卡交叉核对：L4 的 y=16 x=31..36 那段带（6 格 96px，只能量 0.25s）
  console.log('\n===== ⑤ 真实关卡交叉核对（L4 齿轮工厂 y=16 传送带，6 格 96px） =====');
  sb.loadLevel(3, false);
  const g = sb.game, p = g.player, Lv = g.level;
  g.state = 'play'; p.hp = 999; p.maxHp = 999;
  // 这段带是 '('（向左推），必须从右端起步：从中间起步 0.3s 就滑出带面，量到的会是「离带后自由落体」
  p.x = 36 * 16 - p.w; p.y = 16 * 16 - p.h; p.vx = 0; p.vy = 0;
  for (let f = 0; f < 8; f++) step(sb, {});
  p.convV = 0; p.vx = 0;
  const rx0 = p.x;
  let f2 = 0;
  while (f2 < 15) { step(sb, {}); f2++; }   // 0.25s
  console.log('   带子瓦片 ' + Lv.tiles[16][31] + '（col31..36，向左推）| 0.25s 位移 ' + sgn(p.x - rx0) +
    'px | 末刻带速 ' + (p.convV || 0).toFixed(1) + ' | onGround=' + p.onGround +
    ' | 仍在带面=' + (p.x >= 31 * 16 && p.x + p.w <= 37 * 16));

  // 与上一轮报告对账
  console.log('\n===== ⑥ 与上一轮报告对账（报告值：站住 1s +245 / 顺向 400 / 逆向 +160） =====');
  const rep = { stand1: 245, fwd: 400, back: 160 };
  const row = (name, got, claim, tol) => {
    const d = got - claim;
    console.log('   ' + name.padEnd(10) + ' 实测 ' + sgn(got).padStart(8) + ' | 报告 ' + sgn(claim).padStart(8) +
      ' | 差 ' + sgn(d).padStart(7) + ' → ' + (Math.abs(d) <= tol ? '一致（±' + tol + ' 内）' : '不一致'));
  };
  row('站住 1s', a[60], rep.stand1, 8);   // 计时起点差 1~2 帧就会差 4~9px（带速斜坡段每帧 20px/s）
  row('顺向稳态', fw.total, rep.fwd, 6);
  row('逆向稳态', bw.total, rep.back, 6);
}

main();
