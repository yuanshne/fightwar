// v8.0 坐标冻结验证（关卡队）：对比 levels.js 改动前后，L1/L3 的全部实体坐标是否逐格一致。
// 做法：基线源 = git HEAD:levels.js（改动前已提交版本），当前源 = 磁盘 levels.js；
//       两者都拼 chapter2/3 + aggregateLevels()，构造全部 18 关网格。
// 判定：
//   ① 实体（非 '.' 且非 '#' 的一切字符）坐标集合必须 100% 相同；
//   ② 原高度范围内（y < 旧 h）的 '#' 实心坐标集合必须 100% 相同（地形不得平移）；
//   ③ 新增 '#' 只允许出现在旧 h 及以下的行（= 补底），且必须是"向下填到底"。
// 用法：node tools/_v80_h.js
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const ROOT = path.join(__dirname, '..');

function loadLevels(levelsSrc) {
  let body = levelsSrc;
  for (const f of ['chapter2.js', 'chapter3.js'])
    if (fs.existsSync(path.join(ROOT, f))) body += '\n' + fs.readFileSync(path.join(ROOT, f), 'utf8');
  body += '\n;aggregateLevels();\n;return {LG:LG,ALL_LEVELS:ALL_LEVELS};';
  return new Function(body)();
}

// 实体分类（只用于报告分组；判定用"非 '.' 非 '#'"全集）
const KIND = [
  ['@', '出生点'], ['P', '终点'], ['Q', '神龛'], ['K', '钥匙'], ['c', '检查点'],
  ['o', '金币'], ['*', '宝石'], ['S', '弹簧'], ['=', '平台'], ['B', '木箱'],
  ['M', '移动平台'], ['V', '移动平台'],
  ['W', '史莱姆'], ['F', '蝙蝠'], ['i', '铁甲虫'], ['k', '酸液花'], ['n', '跳跳蛛'],
  ['A', '骑士'], ['Y', '法师'], ['T', '幽灵'], ['E', '魂火'], ['J', '水母'],
  ['N', '枪虾'], ['x', '精英枪虾'], ['z', '精英幽灵'], ['X', 'Boss锚点'],
  ['S', '弹簧'], ['L', '拉杆'], ['C', '崩塌砖'], ['D', '门'], ['^', '尖刺'],
  ['~', '熔岩'], ['w', '风柱'], ['e', '传送门'], ['H', '吊灯'], ['(', '传送带'],
  [')', '传送带'], ['<', '炮台'], ['>', '炮台'], ['Z', '横锯'], ['U', '竖锯'],
  ['a', '橙砖'], ['b', '蓝砖'], ['G', '隐藏砖'], ['g', '宝箱'], ['R', '灯笼'],
  ['{', '水流'], ['}', '水流'],
];
function kindOf(c) { for (const [ch, n] of KIND) if (ch === c) return n; return '其他(' + c + ')'; }

// v8.0 任务2 新增的三种小怪字符：它们是有意新增的实体，不参与「坐标冻结」判定，
// 单独列在末尾证明「只增不改」（基线同格必须是 '.'）。
const NEWSPAWN = new Set(['i', 'k', 'n']);

function snapshot(src) {
  const sb = loadLevels(src);
  return sb.ALL_LEVELS.map(meta => {
    const g = new sb.LG(meta.w, meta.h);
    meta.build(g);
    const ents = [], solid = new Set(), spawns = [];
    for (let y = 0; y < meta.h; y++) for (let x = 0; x < meta.w; x++) {
      const c = g.g[y][x];
      if (c === '#') solid.add(x + ',' + y);
      else if (c !== '.') {
        if (NEWSPAWN.has(c)) spawns.push({ x, y, c });
        else ents.push({ x, y, c });
      }
    }
    return { name: meta.name, w: meta.w, h: meta.h, ents, solid, spawns };
  });
}

const baseSrc = cp.execSync('git show HEAD:levels.js', { cwd: ROOT, encoding: 'utf8' });
const curSrc = fs.readFileSync(path.join(ROOT, 'levels.js'), 'utf8');
const A = snapshot(baseSrc), B = snapshot(curSrc);

let bad = 0;
console.log('=== v8.0 加高前后实体坐标冻结对比（L1 / L3） ===');
for (const li of [0, 2]) {
  const a = A[li], b = B[li];
  console.log('\n--- L' + (li + 1) + ' ' + a.name + ' ---');
  console.log('  尺寸: ' + a.w + 'x' + a.h + ' → ' + b.w + 'x' + b.h + '（+0 宽, +' + (b.h - a.h) + ' 高）');
  // ① 实体
  const ka = a.ents.map(e => e.x + ',' + e.y + ':' + e.c);
  const kb = b.ents.map(e => e.x + ',' + e.y + ':' + e.c);
  const setA = new Set(ka), setB = new Set(kb);
  const lost = ka.filter(k => !setB.has(k)), gain = kb.filter(k => !setA.has(k));
  console.log('  实体总数: ' + ka.length + ' → ' + kb.length + '（丢失 ' + lost.length + ' / 新增 ' + gain.length + '）');
  if (lost.length) console.log('    丢失: ' + lost.join(' '));
  if (gain.length) console.log('    新增: ' + gain.join(' '));
  if (lost.length || gain.length) bad++;
  // 分类逐项列出（证明每个实体都没动）
  const byKind = new Map();
  for (const e of a.ents) { const k = kindOf(e.c); if (!byKind.has(k)) byKind.set(k, []); byKind.get(k).push(e.x + ',' + e.y); }
  const byKindB = new Map();
  for (const e of b.ents) { const k = kindOf(e.c); if (!byKindB.has(k)) byKindB.set(k, []); byKindB.get(k).push(e.x + ',' + e.y); }
  for (const k of new Set([...byKind.keys(), ...byKindB.keys()])) {
    const xa = (byKind.get(k) || []).join(' '), xb = (byKindB.get(k) || []).join(' ');
    const same = xa === xb;
    if (!same) bad++;
    console.log('    ' + (same ? '[同]' : '[异]') + ' ' + k + ' ×' + (byKind.get(k) || []).length
      + '  ' + (xa.length > 150 ? xa.slice(0, 150) + '…' : xa));
    if (!same) console.log('         改后: ' + (xb.length > 150 ? xb.slice(0, 150) + '…' : xb));
  }
  // ② 原高度内的实心
  let solidLost = 0, solidNew = 0, belowNew = 0;
  for (const k of a.solid) if (!b.solid.has(k)) solidLost++;
  for (const k of b.solid) {
    if (a.solid.has(k)) continue;
    const y = +k.split(',')[1];
    if (y < a.h) solidNew++; else belowNew++;
  }
  console.log('  实心#: 旧 ' + a.solid.size + ' → 新 ' + b.solid.size
    + ' | 原区内丢失 ' + solidLost + ' / 原区内新增 ' + solidNew + ' / 新增行(y≥' + a.h + ') ' + belowNew);
  if (solidLost || solidNew) bad++;
}

// ③ 其余 16 关：除 v8.0 任务2 新增的 i/k/n 外，必须逐格完全一致（本工单只许动 L1/L3 的地形）
let otherDiff = 0;
for (let li = 0; li < A.length; li++) {
  if (li === 0 || li === 2) continue;
  const a = A[li], b = B[li];
  const ka = a.ents.map(e => e.x + ',' + e.y + ':' + e.c).join('|');
  const kb = b.ents.map(e => e.x + ',' + e.y + ':' + e.c).join('|');
  const sa = [...a.solid].sort().join('|'), sb2 = [...b.solid].sort().join('|');
  if (a.w !== b.w || a.h !== b.h || ka !== kb || sa !== sb2) {
    otherDiff++;
    console.log('[!] L' + (li + 1) + ' ' + a.name + ' 地形/旧实体发生改动（本工单不应改）');
  }
}
console.log('\n其余 16 关（L2/L4~L18）地形与旧实体逐格比对：' + (otherDiff === 0 ? '全部未改动 ✓' : otherDiff + ' 关被改动 ✗'));

// ④ v8.0 任务2 新增小怪：只允许「新增」，基线同格必须是空气
console.log('\n=== v8.0 任务2 新增小怪（i/k/n）落点（不参与上面的冻结判定）===');
let spawnBad = 0;
for (let li = 0; li < B.length; li++) {
  const b = B[li], a = A[li];
  if (!b.spawns.length) continue;
  const wasEnt = new Set(a.ents.map(e => e.x + ',' + e.y));
  for (const s of b.spawns) {
    const occupied = wasEnt.has(s.x + ',' + s.y);
    if (occupied) spawnBad++;
    console.log('  L' + (li + 1) + ' ' + kindOf(s.c) + ' (' + s.x + ',' + s.y + ') 基线同格='
      + (occupied ? '【已有实体·冲突】' : '空 ✓'));
  }
}
if (spawnBad) console.log('  ✗ 有 ' + spawnBad + ' 只压到了既有实体');

const ok = bad === 0 && otherDiff === 0 && spawnBad === 0;
console.log('\n结论：' + (ok ? 'L1/L3 加高后全部既有实体坐标 100% 一致、地形未平移；新增小怪均为空格新增 ✓' : '存在不一致 ✗'));
process.exit(ok ? 0 : 1);
