// 确定性门禁：node gate.js <art|levels|engine>
// art: 语法编译 + 导出符号核对；levels: 执行 + validateLevels 断言；
// engine: 桩环境执行 levels+engine，七关构造 + 空转不崩 + L7 Boss 冒烟（v3）+
//         v4 谜题冒烟（PUZZLES 数据/数独唯一解/神龛提取/puzzleSolved 奖励链路，全部条件守卫）。
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const mod = process.argv[2] || '';
function read(f) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) { console.error('缺少文件: ' + f); process.exit(1); }
  return fs.readFileSync(p, 'utf8');
}
function need(src, names, label) {
  const missing = names.filter(n => !new RegExp('\\b' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(src));
  if (missing.length) { console.error(label + ' 缺少导出/符号: ' + missing.join(', ')); process.exit(1); }
}
// ---- v4 数独校验辅助（界面队；仅 gate 内部使用，不属游戏导出） ----
// 块尺寸候选 [块行高,块列宽]：4×4=2×2、9×9=3×3 固定；6×6 工单写作「块2×3」，行列书写有歧义，
// 按 sol 在哪种划分下合法自解析（与 ui.js sudokuBoxDims 同规则）；两种划分 sol 均不合法→报错。
function sudokuBoxCands(size) {
  return size === 4 ? [[2, 2]] : size === 9 ? [[3, 3]] : [[2, 3], [3, 2]];
}
function sudokuSolValid(pz, bh, bw) {
  const n = pz.size, sol = pz.sol;
  const uniq = get => { const s = new Set(); for (let i = 0; i < n; i++) { const v = get(i); if (v < 1 || v > n || s.has(v)) return false; s.add(v); } return true; };
  for (let r = 0; r < n; r++) if (!uniq(c => sol[r][c])) return false;
  for (let c = 0; c < n; c++) if (!uniq(r => sol[r][c])) return false;
  for (let br = 0; br < n; br += bh) for (let bc = 0; bc < n; bc += bw) {
    const s = new Set();
    for (let r = br; r < br + bh; r++) for (let c = bc; c < bc + bw; c++) {
      const v = sol[r][c]; if (v < 1 || v > n || s.has(v)) return false; s.add(v);
    }
  }
  return true;
}
function sudokuSolveCount(pz, bh, bw) { // 回溯解计数（>1 早退；min 候选格分支，4/6/9 规模毫秒级）
  const n = pz.size, g = pz.givens.map(r => r.slice());
  let count = 0;
  function cands(r, c) {
    const used = new Set();
    for (let i = 0; i < n; i++) { if (g[r][i]) used.add(g[r][i]); if (g[i][c]) used.add(g[i][c]); }
    const r0 = Math.floor(r / bh) * bh, c0 = Math.floor(c / bw) * bw;
    for (let i = r0; i < r0 + bh; i++) for (let j = c0; j < c0 + bw; j++) if (g[i][j]) used.add(g[i][j]);
    const out = [];
    for (let v = 1; v <= n; v++) if (!used.has(v)) out.push(v);
    return out;
  }
  function go() {
    if (count > 1) return;
    let br = -1, bc = -1, bcands = null;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!g[r][c]) {
      const cs = cands(r, c);
      if (!cs.length) return;
      if (br < 0 || cs.length < bcands.length) { br = r; bc = c; bcands = cs; }
    }
    if (br < 0) { count++; return; }
    for (const v of bcands) { g[br][bc] = v; go(); g[br][bc] = 0; if (count > 1) return; }
  }
  go();
  return count;
}
try {
  if (mod === 'art') {
    const src = read('art.js');
    new Function(src); // 只编译不执行（执行需要 DOM）
    need(src, ['SPR', 'THEMES', 'buildSprites', 'buildThemeArt', 'drawPixelText', 'drawCNText', 'flipSprite'], 'art.js');
    console.log('art.js OK: 语法通过, 导出齐全');
  } else if (mod === 'levels') {
    const src = read('levels.js');
    const sandbox = new Function(src + '\n;return {LG,LEVELS,validateLevels};')();
    if (!(sandbox.LEVELS && sandbox.LEVELS.length >= 6)) { console.error('LEVELS 至少 6 关'); process.exit(1); }
    const meta = sandbox.LEVELS.map(l => l.theme + '/' + l.w + 'x' + l.h).join(', ');
    const v = sandbox.validateLevels();
    if (!v.ok) { console.error('validateLevels 未通过: ' + v.msg); process.exit(1); }
    console.log('levels.js OK: ' + meta + ' | 断言: ' + v.msg);
  } else if (mod === 'engine') {
    const levelsSrc = read('levels.js');
    const engineSrc = read('engine.js');
    const themes = {}; ['grass','cave','sky','factory','lava','tower','boss','wind','castle','star'].forEach(k => themes[k] = {}); // v3 §F①桩补第 7 主题；v5 §D③补 wind/castle/star
    // v4：附带导出 PUZZLES/puzzleSolved（未合入时为 undefined，供下方 v4 冒烟块条件守卫）
    const glue = '\n;return {PHY,Level,game,loadLevel,respawn,killPlayer,levelClear,updateWorld,LEVELS,'
      + "PUZZLES:(typeof PUZZLES==='undefined')?undefined:PUZZLES,"
      + "puzzleSolved:(typeof puzzleSolved==='undefined')?undefined:puzzleSolved};";
    const sandbox = new Function('THEMES', levelsSrc + '\n' + engineSrc + glue)(themes);
    need(engineSrc, ['PHY', 'Level', 'game', 'loadLevel', 'respawn', 'killPlayer', 'levelClear', 'updateWorld'], 'engine.js');
    const nLevels = sandbox.LEVELS.length;
    for (let i = 0; i < nLevels; i++) {
      sandbox.loadLevel(i, false);
      const g = sandbox.game;
      g.state = 'play';
      for (let f = 0; f < 120; f++) sandbox.updateWorld(1 / 60); // 空转：静止站立 2 秒
      // 模拟输入冒烟：右移+起跳 60 帧
      g.input.right = 1; g.input.jump = 1; g.input.jumpHit = 1;
      for (let f = 0; f < 60; f++) sandbox.updateWorld(1 / 60);
      g.input.right = 0; g.input.jump = 0; g.input.jumpHit = 0;
      const L = sandbox.game.level;
      const pos = '玩家@(' + Math.round(g.player.x) + ',' + Math.round(g.player.y) + ')';
      console.log('engine L' + (i + 1) + ' OK: ' + L.meta.name + ' ' + pos + ' 金币总' + L.totalCoin + ' 帧稳定');
    }
    // v3 §F②（界面队追加）：Boss 冒烟——设计硬约束 H1：激活半径 176px 保证
    // 空转 180 帧玩家不得死亡、Boss 保持 dormant。v5 §D②：Boss 关按 boss 元数据定位
    // （7→10 关后不再假设"最后一关=Boss 关"），找不到 boss 元数据时整块跳过。
    const bossIdx = sandbox.LEVELS.findIndex(function (l) { return !!l.boss; });
    if (bossIdx >= 0) {
      sandbox.loadLevel(bossIdx, false);
      sandbox.game.state = 'play';
      if (sandbox.game.boss) {
        for (let f = 0; f < 180; f++) sandbox.updateWorld(1 / 60);   // 纯空转 180 帧
        const g = sandbox.game;
        if (g.player.dead || (g.player.hp !== undefined && g.player.hp < 5) || g.boss.state !== 'dormant') {
          console.error('L7 Boss 违约: 空转180帧 dead=' + g.player.dead + ' hp=' + g.player.hp + ' boss=' + g.boss.state);
          process.exit(1);
        }
        console.log('engine L7 Boss 冒烟 OK: 空转180帧 玩家存活 Boss=dormant');
      }
    }
    // v4（界面队追加）：谜题神龛冒烟——全部条件守卫，levels v4 未合入（无 PUZZLES）时整块跳过，
    // v2/v3 输出不变；shrine/puzzleSolved 链路再按 engine v4 符号存在性二级守卫。
    if (sandbox.PUZZLES) {
      const PZ = sandbox.PUZZLES;
      const probs = [];
      // ① 数据契约：奇数织/偶数独、画稿尺寸、矩阵尺寸/取值、givens⊂sol、sol 合法、解唯一
      // v5 §D③：遍历全部谜题键（1..6 + 新键 8/9/10），奇偶规则对新键同样成立
      for (const k of Object.keys(PZ).map(Number).sort((a, b) => a - b)) {
        const p = PZ[k];
        if (!p) { probs.push('PUZZLES[' + k + '] 缺失'); continue; }
        if (k % 2 === 1 && p.type !== 'nono') probs.push('P' + k + ' 奇数关应为数织,实为 ' + p.type);
        if (k % 2 === 0 && p.type !== 'sudoku') probs.push('P' + k + ' 偶数关应为数独,实为 ' + p.type);
        if (p.type === 'nono') {
          if (!Array.isArray(p.pic) || p.pic.length !== p.size
            || p.pic.some(r => typeof r !== 'string' || r.length !== p.size))
            probs.push('P' + k + ' 数织画稿应为 ' + p.size + ' 行×' + p.size + ' 列字符画');
        } else if (p.type === 'sudoku') {
          const dimOk = a => Array.isArray(a) && a.length === p.size && a.every(r =>
            Array.isArray(r) && r.length === p.size && r.every(v => Number.isInteger(v) && v >= 0 && v <= p.size));
          if (!dimOk(p.givens) || !dimOk(p.sol)) {
            probs.push('P' + k + ' 数独矩阵应为 ' + p.size + '×' + p.size + ' 且取值 0..' + p.size);
          } else {
            let sub = true;
            for (let r = 0; r < p.size; r++) for (let c = 0; c < p.size; c++)
              if (p.givens[r][c] !== 0 && p.givens[r][c] !== p.sol[r][c]) sub = false;
            if (!sub) probs.push('P' + k + ' givens 不是 sol 的挖空子集');
            const cands = sudokuBoxCands(p.size).filter(b => sudokuSolValid(p, b[0], b[1]));
            if (!cands.length) probs.push('P' + k + ' sol 行/列/块存在重复(不合法终盘)');
            else if (!cands.some(b => sudokuSolveCount(p, b[0], b[1]) === 1)) probs.push('P' + k + ' givens 解不唯一');
          }
        } else probs.push('P' + k + ' 未知类型 ' + p.type);
      }
      // ② 神龛提取 + puzzleSolved 奖励链路（engine v4 就绪才跑）
      let shrineRan = false;
      if (typeof sandbox.puzzleSolved === 'function') {
        shrineRan = true;
        for (let i = 0; i < Math.min(6, nLevels); i++) {
          sandbox.loadLevel(i, false);
          const g = sandbox.game;
          g.state = 'play';
          const shr = g.level.shrines;
          if (!shr) { probs.push('L' + (i + 1) + ' level.shrines 缺失(engine v4 未合入?)'); break; }
          if (shr.length !== 1) { probs.push('L' + (i + 1) + ' 神龛数=' + shr.length + '(应为1)'); continue; }
          if (shr[0].idx !== i + 1) probs.push('L' + (i + 1) + ' 神龛 idx=' + shr[0].idx + '(应为' + (i + 1) + ')');
          if (g.puzzleNear !== undefined && typeof g.puzzleNear !== 'number') probs.push('L' + (i + 1) + ' puzzleNear 应为 number');
          const c0 = g.coins, q0 = g.sfxQueue.length;
          sandbox.puzzleSolved(i + 1);
          if (!g.solvedPuzzles || g.solvedPuzzles[i + 1] !== true) probs.push('L' + (i + 1) + ' solvedPuzzles 未置位');
          if (g.coins !== c0 + 5) probs.push('L' + (i + 1) + ' 金币 +' + (g.coins - c0) + '(应+5)');
          const q = g.sfxQueue.slice(q0);
          if (!q.includes('puzzle') || !q.includes('gem')) probs.push('L' + (i + 1) + ' sfxQueue 缺 puzzle/gem: [' + q.join(',') + ']');
        }
        // v5 §D②：神龛终检只对 Boss 关执行（"Boss 关不应有神龛"照旧对 L7 生效；
        // L10 有神龛不再被"最后一关"假设误检）
        if (bossIdx >= 0 && sandbox.LEVELS[bossIdx].boss === true) {
          sandbox.loadLevel(bossIdx, false);
          const shr7 = sandbox.game.level.shrines;
          if (shr7 && shr7.length) probs.push('L7 不应有神龛(实有 ' + shr7.length + ')');
        }
      }
      if (probs.length) {
        console.error('engine v4 谜题冒烟违约: ' + probs.slice(0, 5).join('; '));
        process.exit(1);
      }
      console.log('engine v4 谜题冒烟 OK: ' + (shrineRan
        ? 'PUZZLES 六题数据/唯一解 + 神龛六关各一 + puzzleSolved 奖励链路'
        : 'PUZZLES 六题数据/唯一解（神龛与 puzzleSolved 链路待 engine v4 合入后生效）'));
    }
    console.log('engine.js OK: 六关构造与空转全部通过');
  } else {
    console.error('用法: node gate.js <art|levels|engine>'); process.exit(1);
  }
} catch (e) {
  console.error('门禁失败(' + mod + '): ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e));
  process.exit(1);
}
