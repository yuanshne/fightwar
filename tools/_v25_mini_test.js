// node tools/_v255_mini_test.js —— v25 迷你游戏 / 炸药桶 / 试炼封印验收（node，无依赖）
// 用户：「把小怪关卡修改成一些有意思的玩意，比如让主角拿着武器攻击视为交互的扫雷」
// 覆盖：四种盘面（mine/lights/bells/mole）的真实攻击入口 _engMiniHit、完成奖励宝石、
//       跨死亡保留、试炼线开封印；炸药桶 _engBarrelBlast 的拆除/连锁/伤己。
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const glue = '\n;return {PHY,Level,game,loadLevel,updateWorld,respawn,BAL,aggregateLevels,'
  + '_engMiniHit,_engMineReveal,_engUpdateMinis,_engBarrelBlast,_engHurtPlayer};';
const themes = {};
['grass', 'cave', 'sky', 'factory', 'lava', 'tower', 'boss', 'wind', 'castle', 'star', 'sea', 'nether',
  'ember', 'aether', 'husk', 'maw', 'bell'].forEach(k => themes[k] = {});
const sb = new Function('THEMES', read('levels.js') + read('chapter2.js') + read('chapter3.js')
  + read('chapter4.js') + read('engine.js') + glue)(themes);
sb.aggregateLevels();

let pass = 0, fail = 0;
function ok(cond, msg, extra) {
  if (cond) { pass++; console.log('  PASS ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? '   [' + extra + ']' : '')); }
}
const NONBOSS = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 13, 14, 16];
function load(idx) {
  sb.loadLevel(idx, false);
  const g = sb.game;
  g.state = 'play';
  g.level.enemies.length = 0;
  g.bullets.length = 0; g.waves.length = 0; g.hazards.length = 0;
  return g;
}
const boxOf = c => ({ x: c.cx, y: c.cy, w: c.w, h: c.h });

/* ==================== T1 布置：每个小怪关都有盘面，四类齐全 ==================== */
console.log('[T1] 15 个小怪关的盘面布置');
{
  const seen = {};
  let miniTotal = 0, barrelTotal = 0, missing = [];
  NONBOSS.forEach(idx => {
    const L = new sb.Level(idx);
    if (!L.minis.length) missing.push(L.meta.name);
    miniTotal += L.minis.length;
    for (const m of L.minis) seen[m.type] = (seen[m.type] || 0) + 1;
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) if (L.tiles[y][x] === 'q') barrelTotal++;
  });
  ok(missing.length === 0, '每个小怪关至少 1 块盘面' + (missing.length ? '（缺：' + missing.join('/') + '）' : ''));
  ok(miniTotal >= 15, '盘面总数 ≥15', miniTotal);
  ok(seen.mine >= 6 && seen.lights >= 4 && seen.bells >= 1 && seen.mole >= 4,
    '四类盘面齐全（mine/lights/bells/mole）', JSON.stringify(seen));
  ok(barrelTotal >= 10, '炸药桶遍布小怪关', barrelTotal);

  // 几何对齐：mine/lights/bells 的底行必须正贴在可站立面之上；mole 的洞必须开在站立面顶行。
  // 悬空一格 = 玩家站不上去、攻击框够不着（v25 实测踩过：盘面 y 写错一行就整块废掉）。
  const STAND = new Set(['#', 'I', 'a', 'b', 'C', 'D', 'B', 'G', '=', '(', ')', 'q']);
  const bad = [];
  NONBOSS.forEach(idx => {
    const L = new sb.Level(idx);
    for (const m of L.minis) {
      const x0 = m.x / 16, x1 = (m.x + m.w) / 16;
      if (m.type === 'mole') {
        const ry = m.y / 16;
        for (let x = x0; x < x1; x++) if (!STAND.has(L.tileAt(x, ry))) bad.push(L.meta.name + ' mole@' + x + ',' + ry);
      } else {
        const ry = (m.y + m.h) / 16;
        for (let x = x0; x < x1; x++) if (!STAND.has(L.tileAt(x, ry))) bad.push(L.meta.name + ' ' + m.type + '@' + x + ',' + ry);
      }
    }
  });
  ok(bad.length === 0, '所有盘面都贴在站立面上（无悬空）' + (bad.length ? '（' + bad.join('; ') + '）' : ''), bad.slice(0, 5).join(';'));
}

/* ==================== T2 扫雷：攻击翻格 / 踩雷扣心 / 全开得宝石 ==================== */
console.log('[T2] 扫雷（mine）');
{
  const g = load(0), L = g.level, p = g.player;
  const m = L.minis.find(x => x.type === 'mine');
  ok(!!m, 'L1 有扫雷盘');
  const mineCell = m.cells.find(c => c.mine);
  const zeroCell = m.cells.find(c => !c.mine && c.adj === 0);
  ok(!!mineCell && !!zeroCell, '盘面含雷格与 0 邻安全格');

  p.hp = 5; p.invT = 0;
  ok(sb._engMiniHit(boxOf(zeroCell)) === true, '攻击 0 邻格被盘面吃掉（视为交互）');
  ok(zeroCell.open && m.cells.filter(c => c.open).length >= 1, '0 邻格翻开');

  p.hp = 5; p.invT = 0;
  const hp0 = p.hp;
  ok(sb._engMiniHit(boxOf(mineCell)) === true, '攻击雷格被盘面吃掉');
  ok(mineCell.open && mineCell.boom, '雷格标记爆炸');
  ok(p.hp < hp0, '踩雷扣 1 心（hp ' + hp0 + '→' + p.hp + '）');

  for (const c of m.cells) if (!c.mine && !c.open) sb._engMiniHit(boxOf(c));
  ok(m.done === true, '安全格全开 → 盘面达成');
  ok(L.coins.some(c => c.gem && !c.got), '达成奖励宝石实体落地');
  ok(g.sfxQueue.indexOf('puzzle') >= 0, '达成播放解谜音');
}

/* ==================== T3 点灯：攻击翻转十字 / 解出即通 ==================== */
console.log('[T3] 点灯（lights）');
{
  const g = load(2), L = g.level;
  const m = L.minis.find(x => x.type === 'lights');
  ok(!!m, 'L3 有点灯盘');
  const MASK = i => {
    let mm = 0; const rx = i % 3, ry = (i / 3) | 0;
    for (let j = 0; j < 9; j++) if (Math.abs((j % 3) - rx) + Math.abs(((j / 3) | 0) - ry) <= 1) mm |= 1 << j;
    return mm;
  };
  let start = 0;
  for (let i = 0; i < 9; i++) if (m.cells[i].on) start |= 1 << i;
  ok(start !== 0x1FF, '开局不是已通关状态（防呆）');
  // BFS 最近解
  const seen = new Map([[start, null]]), qq = [start];
  let goal = -1;
  while (qq.length) {
    const s = qq.shift();
    if (s === 0x1FF) { goal = s; break; }
    for (let i = 0; i < 9; i++) {
      const ns = s ^ MASK(i);
      if (!seen.has(ns)) { seen.set(ns, [s, i]); qq.push(ns); }
    }
  }
  ok(goal >= 0, '点灯盘有解（BFS 可达全亮）');
  const seq = [];
  for (let s = goal; seen.get(s); s = seen.get(s)[0]) seq.unshift(seen.get(s)[1]);
  ok(seq.length > 0, '解序列非空（' + seq.length + ' 步）');
  for (const i of seq) sb._engMiniHit(boxOf(m.cells[i]));
  ok(m.done === true, '按解序列攻击后全亮');
  ok(L.coins.some(c => c.gem && !c.got), '点灯达成奖励宝石');
}

/* ==================== T4 编钟：错音重来 / 按序敲响 ==================== */
console.log('[T4] 编钟（bells）');
{
  const g = load(11), L = g.level, p = g.player;
  const m = L.minis.find(x => x.type === 'bells');
  ok(!!m, 'L12 有编钟盘');
  m.phase = 'input'; m.inputIdx = 0;
  const wrong = (m.seq[0] + 1) % m.bells.length;
  ok(sb._engMiniHit(boxOf(m.bells[wrong])) === true, '攻击钟被盘面吃掉');
  ok(m.inputIdx === 0 && m.phase === 'show' && m.wrongT > 0, '敲错 → 回到演示、从头再听');
  m.phase = 'input'; m.inputIdx = 0;
  for (const i of m.seq) sb._engMiniHit(boxOf(m.bells[i]));
  ok(m.done === true, '按序敲完 → 盘面达成');
  ok(L.coins.some(c => c.gem && !c.got), '编钟达成奖励宝石');
  void p;
}

/* ==================== T5 地鼠：只认冒头 / 打够次数 ==================== */
console.log('[T5] 地鼠（mole）');
{
  const g = load(0), L = g.level;
  const m = L.minis.find(x => x.type === 'mole');
  ok(!!m, 'L1 有地鼠盘');
  const h = m.holes[0];
  h.up = false; h.cool = 0;
  ok(sb._engMiniHit({ x: h.x + 1, y: h.y - 14, w: 14, h: 14 }) === false, '没冒头时攻击无效（不吃刀）');
  let guard = 0;
  while (!m.done && guard++ < 20) {
    const t = m.holes[guard % m.holes.length];
    t.up = true; t.upT = 2;
    sb._engMiniHit({ x: t.x + 1, y: t.y - 14, w: 14, h: 14 });
  }
  ok(m.done === true, '打够 ' + m.need + ' 次 → 盘面达成');
  ok(L.coins.some(c => c.gem && !c.got), '地鼠达成奖励宝石');
}

/* ==================== T6 跨死亡保留 + 试炼开封印 ==================== */
console.log('[T6] 跨死亡保留 / 试炼线');
{
  const g = load(0), L = g.level;
  const m = L.minis.find(x => x.type === 'mine');
  for (const c of m.cells) if (!c.mine && !c.open) sb._engMiniHit(boxOf(c));
  ok(m.done, 'L1 扫雷已达成');
  g.respawnAt = { x: L.spawn.x, y: L.spawn.y };
  sb.respawn();
  ok(L.minis === g.level.minis && m.done === true, '死亡重生不重置盘面（L.minis 实例保留）');

  // 完成地鼠 → 两块盘全通 → 试炼线开封印
  const mo = L.minis.find(x => x.type === 'mole');
  let guard = 0;
  while (!mo.done && guard++ < 20) {
    const t = mo.holes[guard % mo.holes.length];
    t.up = true; t.upT = 2;
    sb._engMiniHit({ x: t.x + 1, y: t.y - 14, w: 14, h: 14 });
  }
  for (let f = 0; f < 10; f++) { g.hitStop = 0; sb.updateWorld(1 / 60); }
  ok(g.seal && g.seal.trialOk === true && g.seal.trialDone >= g.seal.trialTotal,
    '全部盘面达成 → seal.trialOk', g.seal && g.seal.trialDone + '/' + g.seal.trialTotal);
  ok(g.seal && g.seal.open === true && g.seal.via === 'trial', '试炼线独立开封印（via=trial）',
    g.seal && (g.seal.open + '/' + g.seal.via));
}

/* ==================== T7 炸药桶：拆除 / 连锁 / 伤己 ==================== */
console.log('[T7] 炸药桶（q）');
{
  const g = load(0), L = g.level, p = g.player;
  let bx = -1, by = -1;
  for (let y = 0; y < L.h && bx < 0; y++) for (let x = 0; x < L.w; x++) if (L.tiles[y][x] === 'q') { bx = x; by = y; break; }
  ok(bx >= 0, 'L1 有炸药桶实体');
  const hp0 = p.hp;
  p.x = bx * 16 - 6; p.y = by * 16 - p.h; p.invT = 0;
  sb._engBarrelBlast(L, bx, by);
  ok(L.tileAt(bx, by) !== 'q', '爆炸拆除桶本体');
  ok(p.hp < hp0, '贴脸引爆伤己 1 心（hp ' + hp0 + '→' + p.hp + '）');

  // 连锁：临时在桶右侧放一个桶，再炸左侧 → 两个都消失
  const cx2 = bx, cy2 = by;
  if (cx2 + 1 < L.w) { L.tiles[cy2][cx2 + 1] = 'q'; }
  else { L.tiles[cy2][cx2 - 1] = 'q'; }
  const nx = cx2 + 1 < L.w ? cx2 + 1 : cx2 - 1;
  L.tiles[cy2][cx2] = 'q';
  sb._engBarrelBlast(L, cx2, cy2);
  ok(L.tileAt(cx2, cy2) !== 'q' && L.tileAt(nx, cy2) !== 'q', '相邻桶连锁引爆（半径 1 格）');
}

console.log('\n结果: ' + (fail === 0 ? '全部通过' : (pass + ' 通过 / ' + fail + ' 失败')) + '（' + pass + ' 项）');
process.exit(fail === 0 ? 0 : 1);
