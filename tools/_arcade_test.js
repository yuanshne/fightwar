// node tools/_arcade_test.js —— v26/v27/v29/v30 街机小关验收（node，无依赖）
// 用户口径：「小关完全放弃横屏从左向右走，改成其他游戏类型；只有选关时按钮才和 Boss 放一块」
// v27 追加：14 个小关 14 种玩法两两不同（原 6 对重复各换掉一个），新增
//           矿脉寻宝 / 落块筑墙 / 弹幕生存 / 泡泡消除 / 迷宫追逃 / 垂直攀跃。
// v29 追加：用户要求普通关有难度；本文件断言各关的难度旋钮不低于 v29 基线，
//           真实输入可达性由 tools/_v29_arcade_reach.js 单独证明。
// v30 追加：后三章插入 4 个街机间奏（L19 幽冥炮台 / L22 回响节拍 / L25 喉中拾遗 /
//           L29 镜海流星）→ 18 个小关、16 种玩法（矿脉与弹幕各出进阶变体）。
// 覆盖：18 个非 Boss 关全部有独立街机配置、Boss 关一个都不占；16 种玩法齐全；
//       start 建立伪关卡（tiles=null）→ 结算/星级/解锁所需的 totalCoin/par 齐全；
//       _forceWin/_forceFail 正确落 clear/fail；每个类型空输入跑 2 秒 + 渲染不崩；
//       新玩法核心机制（放钩/消行/受击/发射/拾符/弹跳）逐条断言；
//       ui.js / index.html 的接入点存在且顺序正确。
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const themes = {};
['grass', 'cave', 'sky', 'factory', 'lava', 'tower', 'boss', 'wind', 'castle', 'star', 'sea', 'nether',
  'ember', 'aether', 'husk', 'maw', 'bell', 'anthem', 'mirror', 'abyss'].forEach(k => themes[k] = { skyT: '#101020', skyB: '#202040' });

// 1) 关卡表：与 ui.js 相同的加载顺序（levels + 四章），再显式聚合
const levels = new Function('THEMES', read('levels.js') + read('chapter2.js') + read('chapter3.js')
  + read('chapter4.js') + read('chapter5.js') + '\n;return {ALL_LEVELS,aggregateLevels};')(themes);
// 注意：aggregateLevels() 会「重新赋值」ALL_LEVELS，返回值才是聚合后的新数组；
// 先聚合再取，不能拿注册前的旧引用（否则只有第一章 10 关）。
const ALL = levels.aggregateLevels();

// 2) 画布 / 绘图 / 游戏状态 stub
const cv = { width: 384, height: 224 };
const ctx = new Proxy({}, {
  get(t, p) {
    if (p === 'measureText') return () => ({ width: 6 });
    if (p === 'createLinearGradient' || p === 'createRadialGradient')
      return () => ({ addColorStop() { } });
    if (p === 'canvas') return cv;
    if (p in t) return t[p];
    return () => { };
  },
  set(t, p, v) { t[p] = v; return true; }
});
cv.getContext = () => ctx;
const documentStub = { getElementById: id => (id === 'game' ? cv : null) };
const windowStub = { ArcadeBridge: { sfx() { }, tone() { } } };
const game = {
  sfxQueue: [], time: 0, deaths: 0, coins: 0, state: 'title', level: null, levelIdx: -1,
  paused: false, cam: { x: 0, y: 0 }, player: null, boss: null, seal: null,
  puzzleActive: false, puzzleNear: -1, solvedPuzzles: {}, hitStop: 0, tick: 0, shake: 0
};
new Function('window', 'document', 'ALL_LEVELS', 'THEMES', 'drawCNText', 'drawPixelText', 'game',
  read('arcade.js'))(windowStub, documentStub, ALL, themes, () => { }, () => { }, game);
const A = windowStub.ARCADE;

let pass = 0, fail = 0;
function ok(cond, msg, extra) {
  if (cond) { pass++; console.log('  PASS ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? '   [' + extra + ']' : '')); }
}

const BOSS = ALL.map((l, i) => (l.boss ? i : -1)).filter(i => i >= 0);
const NONBOSS = ALL.map((l, i) => (l.boss ? -1 : i)).filter(i => i >= 0);
const TYPES = ['mine', 'mole', 'lights', 'memory', 'sokoban', 'snake', 'gold', 'tetris',
  'dodge', 'simon', 'bubble', 'maze', 'jumper', 'breakout', 'cannon', 'rhythm'];

console.log('[T1] 关卡覆盖：18 小关有街机、13 Boss 没有');
{
  ok(ALL.length === 31, '总关卡 31', ALL.length);
  ok(NONBOSS.length === 18, '非 Boss 关 18 个', NONBOSS.length);
  ok(BOSS.length === 13, 'Boss 关 13 个', BOSS.length);
  const missing = NONBOSS.filter(i => !A.has(i));
  ok(missing.length === 0, '每个非 Boss 关都有街机配置' + (missing.length ? '（缺 L' + missing.map(i => i + 1).join('/L') + '）' : ''), missing);
  const bossStolen = BOSS.filter(i => A.has(i));
  ok(bossStolen.length === 0, '没有 Boss 关被街机顶替' + (bossStolen.length ? '（L' + bossStolen.map(i => i + 1).join('/L') + '）' : ''), bossStolen);
  const extra = Object.keys(A.stages).filter(k => !NONBOSS.includes(+k));
  ok(extra.length === 0, '配置表里没有多余下标', extra.join(','));
}

console.log('[T2] 配置完整性：16 种玩法齐全（矿脉/弹幕各一个进阶变体），参数合法');
{
  const seen = {};
  for (const i of NONBOSS) {
    const st = A.stages[i];
    ok(!!st, 'L' + (i + 1) + ' 有配置');
    ok(TYPES.includes(st.type), 'L' + (i + 1) + ' 类型合法', st.type);
    seen[st.type] = 1;
    for (const k of ['genre', 'title', 'objective', 'controls', 'hint'])
      ok(typeof st[k] === 'string' && st[k].length > 0, 'L' + (i + 1) + ' ' + k + ' 非空', st[k]);
    ok(st.par > 0 && st.limit > st.par, 'L' + (i + 1) + ' 限时/三星目标合理', st.par + '/' + st.limit);
    ok(st.totalCoin >= 1 && st.totalCoin <= 3, 'L' + (i + 1) + ' 奖励币上限 1~3', st.totalCoin);
  }
  ok(Object.keys(seen).length === 16, '16 种街机玩法全部登场', JSON.stringify(seen));
  const dups = {};
  for (const i of NONBOSS) { const t = A.stages[i].type; dups[t] = (dups[t] || 0) + 1; }
  ok(dups.gold === 2 && dups.dodge === 2 && Object.keys(dups).every(t => t === 'gold' || t === 'dodge' || dups[t] === 1),
    '只有矿脉/弹幕各复用一次（进阶变体），其余玩法唯一', JSON.stringify(dups));
}

console.log('[T2b] 记忆翻牌：行数按卡片数算，盘面不越出底栏');
{
  for (const i of NONBOSS) {
    const st = A.stages[i];
    if (st.type !== 'memory') continue;
    A.start(i);
    const d = A._state().data;
    ok(d.rows === Math.ceil(st.pairs * 2 / st.cols),
      'L' + (i + 1) + ' 行数=ceil(卡片数/列数)', d.rows + '/' + Math.ceil(st.pairs * 2 / st.cols));
    ok(d.by + d.bh <= 203, 'L' + (i + 1) + ' 盘面底边不压底栏', (d.by + d.bh).toFixed(1));
    ok(d.cards.length <= d.rows * d.cols, 'L' + (i + 1) + ' 所有卡片都有格子', d.cards.length + '>' + d.rows * d.cols);
    A.stop();
  }
}

console.log('[T2c] 新玩法核心机制：放钩 / 消行 / 受击 / 发射 / 拾符 / 弹跳');
{
  // 矿脉寻宝：钩到翡翠 → 宝石+1、奖励币+1；集满配额 → 自然胜利
  A.start(7);
  let s = A._state(), d = s.data;
  ok(d.gems.length === 16, 'L8 矿脉生成 16 个物件', d.gems.length);
  ok(d.gems.filter(g => g.kind === 'emerald').length === 5, 'L8 翡翠 5 颗', d.gems.filter(g => g.kind === 'emerald').length);
  ok(d.gems.every(g => Math.abs(Math.atan2(g.x - d.ax, g.y - d.ay)) <= 1.06 &&
    Math.hypot(g.x - d.ax, g.y - d.ay) <= d.maxLen - 5),
    'L8 所有宝石都在吊臂可达扇形内', d.gems.length);
  d.gems = [{ x: d.ax, y: d.ay + 80, kind: 'emerald', r: 8, w: 1.15, taken: false }];
  d.angle = 0; d.state = 'extend'; d.len = 12;
  for (let f = 0; f < 240 && d.state !== 'swing'; f++) A.step(1 / 60, {});
  ok(d.got === 1 && d.em === 1, 'L8 钩中翡翠计入宝石/翡翠', d.got + '/' + d.em);
  ok(game.coins === 1, 'L8 翡翠给 1 枚奖励币', game.coins);
  A.stop();
  A.start(7);
  s = A._state(); d = s.data;
  d.got = 6;
  d.gems = [{ x: d.ax, y: d.ay + 80, kind: 'gem', r: 8, w: 1, taken: false }];
  d.angle = 0; d.state = 'extend'; d.len = 12;
  for (let f = 0; f < 240 && !s.done; f++) A.step(1 / 60, {});
  ok(s.done && s.win === true, 'L8 集满 7 颗触发胜利', s.done + '/' + s.win);
  A.stop();

  // 落块筑墙：消行 + 直落；消满 4 行自然胜利
  A.start(8);
  s = A._state(); d = s.data;
  ok(d.board.length === 160 && !!d.piece && !!d.next, 'L9 棋盘 10×16 + 当前/下一块');
  d.board.fill(-1);
  for (let c = 4; c < 10; c++) d.board[15 * 10 + c] = 0;
  d.piece = { m: [[1, 1, 1, 1]], ci: 0, x: 0, y: 14 };
  A.step(1 / 60, { confirmHit: true });
  ok(d.lines === 1, 'L9 直落补满一行 → 消行 1', d.lines);
  ok(!s.done, 'L9 消 1 行还不通关（目标 6）', d.lines);
  const m0 = d.piece.m.map(r => r.join(''));
  A.step(1 / 60, { upHit: true });
  ok(!s.done, 'L9 旋转后仍可继续', m0);
  A.stop();
  A.start(8);
  s = A._state(); d = s.data;
  d.lines = 5; d.board.fill(-1);
  for (let c = 4; c < 10; c++) d.board[15 * 10 + c] = 0;
  d.piece = { m: [[1, 1, 1, 1]], ci: 0, x: 0, y: 14 };
  A.step(1 / 60, { confirmHit: true });
  ok(s.done && s.win === true, 'L9 消满 6 行触发胜利', d.lines + '/' + s.done);
  A.stop();

  // 弹幕生存：被陨星命中扣心 + 1.2s 无敌；星屑拾取；撑满 30s + 8 枚 → 胜利
  A.start(9);
  s = A._state(); d = s.data;
  ok(d.p && d.need === 10 && d.survive === 40, 'L10 生存参数就位（40s / 10 枚）');
  d.bullets = [{ x: d.p.x, y: d.p.y, vx: 0, vy: 0, r: 3 }];
  A.step(1 / 60, {});
  ok(s.hearts === 2 && d.inv > 0, 'L10 陨星命中扣 1 心并进入无敌', s.hearts + '/' + d.inv.toFixed(2));
  d.picks = [{ x: d.p.x, y: d.p.y, vy: 0 }];
  A.step(1 / 60, {});
  ok(d.got === 1, 'L10 星屑拾取 +1', d.got);
  d.elapsed = 39.99; d.got = 10;
  for (let f = 0; f < 10 && !s.done; f++) A.step(1 / 60, {});
  ok(s.done && s.win === true, 'L10 撑满 40s 并集齐 10 枚 → 胜利', d.elapsed.toFixed(2));
  A.stop();

  // 泡泡消除：发射 → 吸附成泡；发射计数递增
  A.start(11);
  s = A._state(); d = s.data;
  ok(d.grid.length === 99, 'L12 棋盘 11×9', d.grid.length);
  d.grid.fill(-1); d.grid[5] = 0; d.angle = 0; d.cur = 0;
  A.step(1 / 60, { attackHit: true });
  ok(d.shots === 1 && !!d.shot, 'L12 J 发射一颗泡泡');
  for (let f = 0; f < 180 && d.shot; f++) A.step(1 / 60, {});
  ok(!d.shot, 'L12 泡泡飞行后吸附/消失');
  ok(d.grid.filter(v => v >= 0).length >= 2, 'L12 吸附后盘面泡泡数增加', d.grid.filter(v => v >= 0).length);
  A.stop();

  // 迷宫追逃：吃灵符 / 鬼差抓捕 / 集齐后进鬼门胜利
  A.start(13);
  s = A._state(); d = s.data;
  ok(d.total === 6 && d.ghosts.length === 2, 'L14 6 张灵符 + 2 只鬼差', d.total + '/' + d.ghosts.length);
  A.step(1 / 60, { rightHit: true });
  A.step(1 / 60, { rightHit: true });
  A.step(1 / 60, { rightHit: true });
  ok(d.got === 1, 'L14 走到灵符格自动拾取', d.got);
  d.ghosts[0].x = d.player.x; d.ghosts[0].y = d.player.y; d.freeze = 0; d.hold = 0;
  A.step(1 / 60, {});
  ok(s.hearts === 2 && d.freeze > 0, 'L14 被鬼差碰到扣 1 心并冻结', s.hearts + '/' + d.freeze.toFixed(2));
  d.freeze = 0; d.open = true; d.got = d.total;
  d.player = { x: d.exit.x, y: d.exit.y + 1 };
  A.step(1 / 60, { upHit: true });
  ok(s.done && s.win === true, 'L14 灵符齐 + 进鬼门 → 胜利', s.done + '/' + s.win);
  A.stop();

  // 垂直攀跃：自动弹跳 / 初始浮石 / 左右穿屏 / 高度达标胜利
  A.start(14);
  s = A._state(); d = s.data;
  ok(d.plats.length > 0 && d.target === 1200, 'L15 浮石生成 + 目标 1200 尺', d.plats.length);
  let minY = d.p.y;
  for (let f = 0; f < 240; f++) { A.step(1 / 60, {}); if (d.p.y < minY) minY = d.p.y; }
  ok(d.maxH > 0, 'L15 落到浮石自动弹跳（高度 > 0）', d.maxH.toFixed(1));
  d.p.x = 395; d.p.vy = 0;
  A.step(1 / 60, {});
  ok(d.p.x < 0, 'L15 越过右边界从左侧穿出', d.p.x.toFixed(1));
  d.maxH = 1199; d.p.y = d.startY - 1201;
  A.step(1 / 60, {});
  ok(s.done && s.win === true, 'L15 攀到 1200 尺触发胜利', d.maxH.toFixed(1));
  A.stop();

  // 幽冥炮台（v30 · L19）：瞄准鬼火开炮 / 魂雷扣心 / 金火给币 / 配额满胜利
  A.start(18);
  s = A._state(); d = s.data;
  d.spawnT = 999; d.targets = [{ x: 192, y: 80, vx: 0, vy: 0, r: 7, kind: 'wisp', t: 0 }];
  d.ang = -Math.PI / 2; d.cd = 0;
  A.step(1 / 60, { attackHit: true });
  ok(d.hits === 1 && s.hearts === 3, 'L19 开炮击落鬼火 +1', d.hits + '/' + s.hearts);
  d.targets = [{ x: 150, y: 90, vx: 0, vy: 0, r: 8, kind: 'bomb', t: 0 }];
  d.ang = Math.atan2(90 - d.cy, 150 - d.cx); d.cd = 0;
  A.step(1 / 60, { attackHit: true });
  ok(s.hearts === 2, 'L19 误击魂雷扣 1 心', s.hearts);
  d.targets = [{ x: 240, y: 90, vx: 0, vy: 0, r: 7, kind: 'gold', t: 0 }];
  d.ang = Math.atan2(90 - d.cy, 240 - d.cx); d.cd = 0;
  A.step(1 / 60, { attackHit: true });
  ok(game.coins === 1, 'L19 金火 +1 奖励币', game.coins);
  d.targets = [{ x: 192, y: 80, vx: 0, vy: 0, r: 7, kind: 'wisp', t: 0 }];
  d.ang = -Math.PI / 2; d.cd = 0; d.hits = A.stages[18].quota - 1;
  A.step(1 / 60, { attackHit: true });
  ok(s.done && s.win === true, 'L19 击落配额触发胜利', d.hits + '/' + A.stages[18].quota);
  A.stop();

  // 回响节拍（v30 · L22）：缩环进窗敲响 / 漏拍扣心 / 完成 10 拍胜利
  A.start(21);
  s = A._state(); d = s.data;
  ok(d.beats === 10, 'L22 共 10 拍', d.beats);
  d.bt = d.interval * 0.75; // 缩环半径 16 → 落在金环窗口
  A.step(1 / 60, { attackHit: true });
  ok(d.hits === 1 && d.combo === 1, 'L22 金环内敲响计入命中/连击', d.hits + '/' + d.combo);
  d.beatHit = false; d.beatMiss = false; d.bt = d.interval;
  A.step(1 / 60, {});
  ok(s.hearts === 2 && d.beatMiss === true, 'L22 漏拍扣 1 心', s.hearts + '/' + d.beatMiss);
  d.beat = d.beats - 1; d.beatHit = true; d.beatMiss = false; d.bt = d.interval + 0.23;
  A.step(1 / 60, {});
  ok(s.done && s.win === true, 'L22 完成第 10 拍触发胜利', s.done + '/' + s.win);
  A.stop();

  // v30 进阶变体：喉中拾遗 / 镜海流星 的盘面与压力确实加码
  A.start(24);
  s = A._state(); d = s.data;
  ok(A.stages[24].quota === 8 && A.stages[24].emeralds === 6 && A.stages[24].rocks === 5,
    'L25 喉中拾遗 8 宝石 / 6 翡翠 / 5 石', JSON.stringify(A.stages[24].quota));
  ok(d.gems.length >= 18 && d.gems.filter(g => g.kind === 'emerald').length >= 5,
    'L25 宝石盘面生成（19 物件）', d.gems.length);
  A.stop();
  A.start(28);
  s = A._state(); d = s.data;
  ok(d.need === 12 && d.survive === 45, 'L29 镜海流星 12 星屑 / 45 秒', d.need + '/' + d.survive);
  A.stop();
}

console.log('[T2d] v29/v30 难度配置：18 关都已加码（防止回退成无聊小游戏）');
{
  const expect = {
    0: st => st.cols * st.rows >= 54 && st.mines >= 12,
    1: st => st.quota >= 12 && st.bomb > 0 && st.upMax <= 0.9,
    2: st => st.cols >= 5 && st.rows >= 5 && st.scramble >= 10,
    3: st => st.pairs >= 8,
    4: st => (st.map.join('').split('b').length - 1) >= 2 && st.parMoves >= 12,
    5: st => st.target >= 10 && (st.walls || []).length >= 6 && st.speed <= 0.15,
    7: st => st.quota >= 7 && st.rocks >= 3,
    8: st => st.quota >= 6,
    9: st => st.survive >= 40 && st.shards >= 10,
    10: st => st.rounds >= 6,
    11: st => st.quota >= 150,
    13: st => st.rate <= 0.42 && st.holdReset <= 1.1,
    14: st => st.target >= 1200,
    16: st => st.rows >= 6 && st.paddle <= 48 && st.speed >= 165,
    18: st => st.quota >= 8 && st.maxTargets >= 5 && st.limit <= 90,
    21: st => st.beats >= 10 && st.interval <= 1.2 && st.minInt <= 0.85,
    24: st => st.quota >= 8 && st.emeralds >= 6 && st.rocks >= 5 && st.limit <= 150,
    28: st => st.survive >= 45 && st.shards >= 12 && st.limit <= 120
  };
  for (const i of NONBOSS) {
    const st = A.stages[i], fn = expect[i];
    ok(!!fn && fn(st), 'L' + (i + 1) + ' ' + st.type + ' 难度参数达标',
      JSON.stringify({ q: st.quota, tar: st.target, cols: st.cols, rows: st.rows, mines: st.mines }));
  }
}

console.log('[T3] start：伪关卡供结算/星级/解锁复用');
{
  for (const i of NONBOSS) {
    game.state = 'title'; game.level = null; game.levelIdx = -1;
    ok(A.start(i) === true, 'L' + (i + 1) + ' 可进入');
    ok(A.active === true, 'L' + (i + 1) + ' active=true');
    ok(game.state === 'play' && game.levelIdx === i, 'L' + (i + 1) + ' 切到 play 且 levelIdx 对齐');
    ok(!!game.level && game.level.tiles === null, 'L' + (i + 1) + ' 伪关卡 tiles=null（不会走平台世界）');
    ok(game.level.totalCoin === A.stages[i].totalCoin, 'L' + (i + 1) + ' totalCoin 透传');
    ok(game.level.par === A.stages[i].par, 'L' + (i + 1) + ' par 透传');
    ok(!!game.level.meta && typeof game.level.meta.name === 'string', 'L' + (i + 1) + ' meta 取 ALL_LEVELS');
    ok(!!game.level.theme && game.level.theme.skyT !== undefined,
      'L' + (i + 1) + ' theme 是 THEMES 对象（选关屏渐变可直接读）');
    ok(game.player === null && game.boss === null && game.seal === null, 'L' + (i + 1) + ' 清空平台实体');
    ok(game.time === 0 && game.deaths === 0 && game.coins === 0, 'L' + (i + 1) + ' 计时/失误/奖励归零');
  }
}

console.log('[T4] 空输入 2 秒：每种玩法 step + render 不崩');
{
  for (const i of NONBOSS) {
    A.start(i);
    let threw = '';
    try {
      for (let f = 0; f < 120; f++) {
        game.tick++;
        A.step(1 / 60, { left: false, right: false, up: false, down: false, click: -1, mx: -1, my: -1 });
        A.render(game.tick);
      }
    } catch (e) { threw = e && e.message ? e.message : String(e); }
    ok(!threw, 'L' + (i + 1) + ' ' + A.stages[i].type + ' 空跑 120 帧 + 渲染', threw);
    A.stop();
  }
}

console.log('[T5] 结算流转：_forceWin → clear，_forceFail → fail');
{
  for (const i of NONBOSS) {
    A._forceWin(i);
    ok(game.state === 'clear', 'L' + (i + 1) + ' 胜利落 clear');
    ok(game.coins === A.stages[i].totalCoin, 'L' + (i + 1) + ' 胜利奖励币取满', game.coins);
    A.stop();
    ok(A.active === false, 'L' + (i + 1) + ' stop 后 active=false');
    A._forceFail(i);
    ok(game.state === 'fail', 'L' + (i + 1) + ' 失败落 fail');
    const s = A._state();
    ok(s && typeof s.failReason === 'string' && s.failReason.length > 0, 'L' + (i + 1) + ' 带失败原因', s && s.failReason);
    ok(game.deaths === 3, 'L' + (i + 1) + ' 失败按三振计');
    A.stop();
  }
  ok(A.has(BOSS[0]) === false, 'Boss 下标 has=false（ui 会回落平台关）');
  ok(A.start(BOSS[0]) === false, 'Boss 下标 start 拒绝');
}

console.log('[T5b] 自然胜利：finish 倒计时后自动落 clear（回归：done 早退会卡住结算）');
{
  A.start(1); // 打地鼠
  const s = A._state(), d = s.data;
  d.hits = s.st.quota - 1;
  const h = d.holes[0];
  h.up = true; h.kind = 'normal'; h.rise = 1; h.upT = 0; h.dur = 5; h.cool = 0; d.cur = 0;
  A.step(1 / 60, { attackHit: true });
  ok(s.done === true && s.win === true, '最后一击触发 win 演出');
  for (let f = 0; f < 60; f++) A.step(1 / 60, {});
  ok(game.state === 'clear', '0.75s 演出结束后落 clear', game.state);
  A.stop();

  // 超时失败：limit 到点应走 fail('时间到')，再经 finish 落 fail
  A.start(0);
  game.time = A.stages[0].limit;
  A.step(1 / 60, {});
  const t = A._state();
  ok(t.done === true && t.win === false && t.failReason === '时间到', '超时立即判失败并写原因', t.failReason);
  for (let f = 0; f < 60; f++) A.step(1 / 60, {});
  ok(game.state === 'fail', '0.85s 演出结束后落 fail', game.state);
  A.stop();
}

console.log('[T6] ui.js / index.html 接入点');
{
  const ui = read('ui.js'), html = read('index.html');
  ok(ui.includes('window.ArcadeBridge='), 'ui 注入 ArcadeBridge 音桥');
  ok(ui.includes('function _arcadeOn()'), 'ui 有 _arcadeOn 旁路判定');
  ok(ui.includes('if(window.ARCADE&&ARCADE.has(idx))'), 'startLevel 先判街机');
  ok(ui.includes('ARCADE.start(idx)'), 'startLevel 调 ARCADE.start');
  ok(ui.includes('ARCADE.render(tick)'), 'render 有街机分支');
  ok(ui.includes('ARCADE.step(dt,{'), 'step 有街机输入分支');
  ok(ui.includes('ARCADE.stop()'), '离开街机时有 stop');
  ok(ui.includes("'街机 · '+fArc.genre"), '选关详情显示街机类型');
  ok(ui.includes("drawPixelText('MINI'"), '选关卡有 MINI 角标');
  const iArc = html.indexOf('arcade.js'), iEng = html.indexOf('engine.js'), iUi = html.indexOf('ui.js');
  ok(iEng >= 0 && iArc > iEng && iUi > iArc, '加载顺序 engine → arcade → ui', [iEng, iArc, iUi].join(','));
  ok(/arcade\.js\?v=43/.test(html), 'arcade.js 带缓存版本号 v43');
}

console.log('[T7] 不含平台横向玩法残留：伪关卡不会进入 updateWorld 路径');
{
  for (const i of NONBOSS) {
    A.start(i);
    ok(game.level.tiles === null && game.player === null, 'L' + (i + 1) + ' 无瓦片无玩家（横向跑图不可达）');
    A.stop();
  }
}

console.log('\nRESULT ' + (fail ? 'FAIL' : 'PASS') + '  pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
