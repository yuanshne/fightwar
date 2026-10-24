// 确定性门禁：node gate.js <art|levels|engine>
// art: 语法编译 + 导出符号核对；levels: 执行 + validateLevels 断言；
// engine: 桩环境执行 levels+engine，六关构造 + 空转 120 帧不崩。
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
    const themes = {}; ['grass','cave','sky','factory','lava','tower','boss'].forEach(k => themes[k] = {}); // v3 §F①：桩补第 7 主题
    const glue = '\n;return {PHY,Level,game,loadLevel,respawn,killPlayer,levelClear,updateWorld,LEVELS};';
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
    // v3 §F②（界面队追加）：L7 Boss 冒烟——设计硬约束 H1：激活半径 176px 保证
    // 空转 180 帧玩家不得死亡、Boss 保持 dormant。LEVELS 7 关后生效；
    // v2 基线（6 关、game.boss 不存在）自动跳过，输出不变。主循环不动（H3）。
    const last = nLevels - 1;
    sandbox.loadLevel(last, false);
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
    console.log('engine.js OK: 六关构造与空转全部通过');
  } else {
    console.error('用法: node gate.js <art|levels|engine>'); process.exit(1);
  }
} catch (e) {
  console.error('门禁失败(' + mod + '): ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e));
  process.exit(1);
}
