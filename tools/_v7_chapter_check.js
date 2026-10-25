// node tools/_v7_chapter_check.js [chapter2|chapter3|all] —— v7 章节交付门（框架队；设计书 §1.5-e，工单 §10）
// 对指定章执行六项：
//   a) new Function 语法编译；
//   b) 注册对象 levels.length===3 + 章内关号连续（聚合落位=全局 1 基关号）；
//   c) 调 validateLevels()（levels.js §10 断言全量）；
//   d) §10 章节内容断言：theme / boss kind / 精英恰 1 / 隐藏房 G≥1 / 宝箱 g===1 / 新怪('T'/'E'/精英'z')
//      距 '@' ≥176px / 水流('{'/'}')距 '@' 曼哈顿 >3 / N/x/g/Q 支撑（附录 A 口径，双保险）；
//   e) 该章全部关 loadLevel + 空转 120 帧 + 右移起跳 60 帧不抛异常；
//   f) Boss 关 kind 冒烟：空转 180 帧 dormant + 玩家存活 + boss.kind===meta + maxHp===BAL 表值。
// 章节文件未交付 → 打印 `SKIP: <章> 未交付` 退出码 0（终验前允许半章合入）。
// levels.js 契约块未合入 → 桩聚合（设计书附录 A 口径：var CHAPTERS=[] + 手工 concat/Object.assign）。
// 关卡落位与设计关号错位（仅可能：章三先于章二合入）→ 打印 WARN 并跳过「位置敏感」的谜题键断言，
//   位置无关断言照跑——错位是合入顺序产物而非章文件缺陷，终验两章齐后自然消除。
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const CH_DEFS = {
  chapter2: { file: 'chapter2.js', theme: 'sea',    first: 11, bossKind: 2, eliteChar: 'x', bossNo: 13 },
  chapter3: { file: 'chapter3.js', theme: 'nether', first: 14, bossKind: 3, eliteChar: 'z', bossNo: 16 }
};
const SOLID = new Set(['#', 'I', 'a', 'b', 'C', 'D', 'B', 'G']);
const STAND = new Set(['#', 'I', 'a', 'b', 'C', 'D', 'B', 'G', '=', '(', ')']);

function fail(msg) { console.error(msg); process.exit(1); }
const arg = process.argv[2] || 'all';
if (arg !== 'all' && !CH_DEFS[arg]) fail('用法: node tools/_v7_chapter_check.js <chapter2|chapter3|all>');
const targets = arg === 'all' ? ['chapter2', 'chapter3'] : [arg];

const levelsSrc = fs.readFileSync(path.join(ROOT, 'levels.js'), 'utf8');
const engineSrc = fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8');
const hasContract = /const CHAPTERS/.test(levelsSrc);
const present = {};
for (const k of Object.keys(CH_DEFS)) present[k] = fs.existsSync(path.join(ROOT, CH_DEFS[k].file));

let ran = false;
for (const t of targets) {
  if (!present[t]) { console.log('SKIP: ' + t + ' 未交付'); continue; }
  ran = true;
}
if (!ran) { process.exit(0); }

const THEMES_KEYS = ['grass', 'cave', 'sky', 'factory', 'lava', 'tower', 'boss', 'wind', 'castle', 'star', 'sea', 'nether'];

function mkThemes() { const th = {}; THEMES_KEYS.forEach(k => th[k] = {}); return th; }

// 组合沙箱：levels.js +（契约缺失时桩声明）+ 已存在章节文件 + 聚合 + engine.js
function buildSandbox() {
  const head = hasContract ? '' : '\n;var CHAPTERS = [];';
  let chapterSrc = '';
  for (const k of ['chapter2', 'chapter3']) if (present[k]) chapterSrc += '\n' + fs.readFileSync(path.join(ROOT, CH_DEFS[k].file), 'utf8');
  const agg = hasContract
    ? '\n;aggregateLevels();'
    : '\n;var ALL_LEVELS = LEVELS.concat(CHAPTERS.reduce(function(a,c){return a.concat(c.levels||[]);},[]));'
    + '\n;if (typeof PUZZLES!=="undefined") for (const c of CHAPTERS) if (c.puzzles) Object.assign(PUZZLES, c.puzzles);';
  const glue = '\n;return {LG,LEVELS,CHAPTERS,ALL_LEVELS,PUZZLES,validateLevels,'
    + 'game,loadLevel,updateWorld,BAL};';
  return new Function('THEMES', levelsSrc + head + chapterSrc + agg + '\n' + engineSrc + glue)(mkThemes());
}

// 单章独立求值：精确提取「该文件 push 的注册对象」（每文件恰一个 IIFE push 的纪律；
// 独立求值避免多章合入时按下标猜注册对象）
function evalRegisterAlone(key) {
  const head = hasContract ? '' : '\n;var CHAPTERS = [];';
  const src = fs.readFileSync(path.join(ROOT, CH_DEFS[key].file), 'utf8');
  return new Function(levelsSrc + head + '\n' + src + '\n;return CHAPTERS;')()[0];
}

const sb = buildSandbox();
const ALL = sb.ALL_LEVELS;
let failed = 0;
function ok(cond, label) {
  if (cond) console.log('  OK   ' + label);
  else { console.error('  FAIL ' + label); failed++; }
}

for (const name of targets) {
  if (!present[name]) { console.log('SKIP: ' + name + ' 未交付'); continue; }
  console.log('==== ' + name + '（' + CH_DEFS[name].file + '） ====');
  const D = CH_DEFS[name];
  const chSrc = fs.readFileSync(path.join(ROOT, D.file), 'utf8');

  // a) 语法编译
  try { new Function(chSrc); ok(true, 'a) new Function 语法编译通过'); }
  catch (e) { ok(false, 'a) 语法编译失败: ' + e.message); continue; }

  // b) 注册对象：levels.length===3 + 关号连续（落位=全局关号）
  let reg = null;
  try { reg = evalRegisterAlone(name); } catch (e) { ok(false, 'b) 注册对象求值异常: ' + e.message); continue; }
  if (!reg || !Array.isArray(reg.levels)) { ok(false, 'b) 注册对象缺失或 levels 非数组'); continue; }
  ok(reg.levels.length === 3, 'b) 注册对象 levels.length===3（实际 ' + reg.levels.length + '）');
  // 落位按合入顺序推定（每文件恰一个注册对象×3 关；gate levels 模式的关数断言兜底总数）：
  // 章节按 chapter2→chapter3 顺序 concat，第 i 个已合入章占 10+3i 起的 3 个槽位。
  // （跨沙箱对象引用不同，不能 indexOf 按引用找——改按位置定位+逐关值等价核对。）
  const order = ['chapter2', 'chapter3'].filter(function (k) { return present[k]; });
  const start = 10 + 3 * order.indexOf(name);
  const slots = [start, start + 1, start + 2];
  const posOk = slots.every(function (s, i) {
    return !!ALL[s] && JSON.stringify(ALL[s]) === JSON.stringify(reg.levels[i]);
  });
  ok(posOk, 'b) 落位核对：ALL[' + slots.join(',') + '] ≡ 注册对象 levels（逐关值等价）');
  const firstActual = start + 1; // 1 基全局关号
  const aligned = firstActual === D.first;
  if (aligned) ok(true, 'b) 章节落位=设计关号 L' + D.first + '~L' + (D.first + 2));
  else console.log('  WARN 章节落位=L' + firstActual + '~L' + (firstActual + 2) + '，与设计关号 L' + D.first
    + '~L' + (D.first + 2) + ' 错位（他章未合入的合入顺序产物）——位置敏感断言（谜题键）降级跳过');

  // c) validateLevels 全量
  const v = sb.validateLevels();
  ok(v.ok, 'c) validateLevels: ' + v.msg);

  // d) 章节内容断言（网格逐格统计；精英/G/g 为全章合计）
  const lv = reg.levels;
  let nElite = 0, nG = 0, nChest = 0;
  lv.forEach(function (m, i) {
    const no = firstActual + i;
    ok(m.theme === D.theme, 'd) L' + no + ' theme===' + D.theme + '（实际 ' + m.theme + '）');
    if (typeof m.par !== 'number' || m.par < 60 || m.par > 200) ok(false, 'd) L' + no + ' par=' + m.par + ' 越界(60..200)');
    if (!(m.w >= 60 && m.w <= 140 && m.h >= 14 && m.h <= 24)) ok(false, 'd) L' + no + ' 网格 ' + m.w + 'x' + m.h + ' 越界');
    // boss 元数据：章内第 3 关 = bossKind，其余无 boss（值域断言 validateLevels §10-8 亦覆盖）
    if (i === 2) ok(m.boss === D.bossKind, 'd) L' + no + ' meta.boss===' + D.bossKind + '（实际 ' + m.boss + '）');
    else ok(m.boss === undefined, 'd) L' + no + ' 非 Boss 关无 boss 元数据（实际 ' + m.boss + '）');
    // 网格构建 + 逐格统计
    const g = new sb.LG(m.w, m.h);
    m.build(g);
    const at = function (x, y) { return (x < 0 || x >= m.w) ? '#' : (y < 0 || y >= m.h) ? '.' : g.g[y][x]; };
    let nAt = 0, nP = 0, spawn = null;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const c = g.g[y][x];
      if (c === '@') { nAt++; spawn = { x: x, y: y }; }
      if (c === 'P') nP++;
      if (c === D.eliteChar) nElite++;
      if (c === 'G') nG++;
      if (c === 'g') nChest++;
      if (c === 'N' || c === 'x' || c === 'g' || c === 'Q') { // 支撑型字符：下方 2 格内须 STAND（§10-3：N/x/g/Q；
        // J/T/E/z 悬空穿墙型无支撑要求——精英幽灵王 'z' 允许悬空锚，如 L15 桥心）
        let sup = false;
        for (let d = 1; d <= 2; d++) if (STAND.has(at(x, y + d))) sup = true;
        if (!sup) ok(false, 'd) L' + no + ' ' + c + '(' + x + ',' + y + ') 下方 2 格无支撑');
      }
      if (c === 'T' || c === 'E' || c === 'z') { // 新怪距离断言（§10-4）：距 '@' ≥176px（门禁空转零触发）
        if (spawn && Math.hypot((x - spawn.x) * 16, (y - spawn.y) * 16) < 176)
          ok(false, 'd) L' + no + ' ' + c + '(' + x + ',' + y + ') 距 @ <176px（门禁空转会触发）');
      }
      if (c === '{' || c === '}') { // 水流安全断言（§10-5）：'@' 3 格曼哈顿内不得有水流
        if (spawn && Math.abs(x - spawn.x) + Math.abs(y - spawn.y) <= 3)
          ok(false, 'd) L' + no + ' 水流(' + x + ',' + y + ') 距 @ ≤3 格');
      }
      if (c === '~' && !['~', '#', 'I'].includes(at(x, y + 1)) && y < m.h - 1)
        ok(false, 'd) L' + no + ' 熔岩(' + x + ',' + y + ') 悬空');
    }
    ok(nAt === 1, 'd) L' + no + ' 出生点@=' + nAt + '（应 1）');
    if (i === 2) ok(nP === 0, 'd) L' + no + ' Boss 关无终点 P（实际 ' + nP + '）');
    else ok(nP === 1, 'd) L' + no + ' 终点 P=' + nP + '（应 1）');
    if (aligned) { // 神龛 Q ↔ 谜题键存在性（错位时全局号≠数据键，降级跳过）
      const wantQ = sb.PUZZLES[no] ? 1 : 0;
      let nQ = 0;
      for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (g.g[y][x] === 'Q') nQ++;
      ok(nQ === wantQ, 'd) L' + no + ' 神龛Q=' + nQ + '（谜题键存在性=' + wantQ + '）');
    }
  });
  ok(nElite === 1, 'd) 精英 ' + D.eliteChar + ' 全章合计=' + nElite + '（应恰 1）');
  ok(nG >= 1, 'd) 隐藏房 G 全章合计=' + nG + '（应 ≥1）');
  ok(nChest === 1, 'd) 宝箱 g 全章合计=' + nChest + '（应恰 1）');
  if (aligned) { // 谜题键连续且恰为非 Boss 关号（错位时降级跳过）
    const keys = Object.keys(reg.puzzles || {}).map(Number).sort(function (a, b) { return a - b; });
    const want = [D.first, D.first + 1, D.first + 2].filter(function (n) { return n !== D.bossNo; });
    ok(keys.length === want.length && keys.every(function (k, i) { return k === want[i]; }),
      'd) 谜题键=' + keys.join(',') + '（应恰 ' + want.join(',') + '——奇数织/偶数独由 gate 数据校验块把关）');
  }

  // e) 全关冒烟：loadLevel + 空转 120 帧 + 右移起跳 60 帧不抛异常
  slots.forEach(function (si, i) {
    try {
      sb.loadLevel(si, false);
      const g = sb.game;
      g.state = 'play';
      for (let f = 0; f < 120; f++) sb.updateWorld(1 / 60);
      g.input.right = 1; g.input.jump = 1; g.input.jumpHit = 1;
      for (let f = 0; f < 60; f++) sb.updateWorld(1 / 60);
      g.input.right = 0; g.input.jump = 0; g.input.jumpHit = 0;
      ok(true, 'e) L' + (si + 1) + ' 冒烟通过（空转120+右移起跳60 帧稳定，玩家@('
        + Math.round(g.player.x) + ',' + Math.round(g.player.y) + ')）');
    } catch (e) {
      ok(false, 'e) L' + (si + 1) + ' 冒烟异常: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
    }
  });

  // f) Boss 关 kind 冒烟：空转 180 帧 dormant + 存活 + kind/maxHp 与参数表一致
  {
    const bi = slots[2];
    try {
      sb.loadLevel(bi, false);
      sb.game.state = 'play';
      const meta = sb.ALL_LEVELS[bi];
      if (!sb.game.boss) { ok(false, 'f) L' + (bi + 1) + ' meta.boss 存在但 game.boss=null（缺 X 锚点?）'); }
      else {
        for (let f = 0; f < 180; f++) sb.updateWorld(1 / 60);
        const g = sb.game;
        const alive = !g.player.dead && (g.player.hp === undefined || g.player.hp >= 5);
        ok(alive && g.boss.state === 'dormant', 'f) L' + (bi + 1) + ' Boss 冒烟：空转180帧 玩家存活 Boss=dormant（实测 '
          + g.boss.state + ' dead=' + g.player.dead + '）');
        ok(g.boss.kind === D.bossKind, 'f) L' + (bi + 1) + ' boss.kind===' + D.bossKind + '（实际 ' + g.boss.kind + '）');
        const wantHp = [sb.BAL.boss, sb.BAL.boss2, sb.BAL.boss3][D.bossKind - 1].hp;
        ok(g.boss.maxHp === wantHp, 'f) L' + (bi + 1) + ' boss.maxHp===' + wantHp + '（实际 ' + g.boss.maxHp + '）');
      }
    } catch (e) {
      ok(false, 'f) Boss 冒烟异常: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
    }
  }
}

console.log(failed === 0 ? '_v7_chapter_check: 所查章节全部通过'
  : '_v7_chapter_check: ' + failed + ' 项失败');
process.exit(failed === 0 ? 0 : 1);
