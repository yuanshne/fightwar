// node tools/_v255_boss_skills_test.js —— v25.5 五只 Boss 新技能验收（node，无依赖）
// 用户反馈「技能还是太少了，你多补上一点技能」的落地验证：
//   boss1 星核巨兽 → pillar 星核晶棘（tone=star）
//   boss2 蛟龙     → column 沧溟水柱（tone=aqua）
//   boss3 幽冥判官 → pillar 幽冥鬼柱（tone=ghost）
//   boss5 圣裁者   → column 圣光天柱（tone=gold）
//   boss8 双生天秤 → column 裁决光柱（tone=violet）
// 断言：表参数/池子/前摇齐全；columnCast 按 gap 落 n 根、预警后命中站在柱内的人、
//       到点自删并回 recover；pillarCast 同口径；UI 招名表按 Boss 换名。
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const glue = '\n;return {PHY,Level,game,loadLevel,updateWorld,BAL,aggregateLevels,'
  + '_engHurtPlayer,_engBossTable,_engGroundY};';
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
const tableOf = k => sb._engBossTable(k);
const LEVEL_OF = { 1: 6, 2: 12, 3: 15, 5: 17, 8: 20 };   // kind → 关卡下标

function world(kind) {
  sb.loadLevel(LEVEL_OF[kind], false);
  const g = sb.game;
  g.state = 'play';
  const b = g.boss;
  b.kind = kind;
  b.state = 'idle'; b.t = 0; b.vx = 0; b.vy = 0;
  b.hpTotal = b.maxHp; b.hp = b.bandMax; b.bandBreak = 0; b.phase = 1;
  g.level.enemies.length = 0;
  g.bullets.length = 0; g.waves.length = 0; g.hazards.length = 0;
  if (g.shots) g.shots.length = 0;
  return g;
}
function step(g, n) { for (let f = 0; f < n; f++) { g.hitStop = 0; sb.updateWorld(1 / 60); } }

/* ==================== T1 表：参数/池子/前摇齐 ==================== */
console.log('[T1] 五只 Boss 的新招表');
{
  const T1 = tableOf(1);
  ok(T1.pillar && T1.pillar.tone === 'star' && T1.pillar.h === 40 && T1.pillar.life === 2.5,
    'boss1 星核晶棘：40px / 2.5s / tone=star', T1.pillar && T1.pillar.tone);
  ok(T1.poolNear.indexOf('pillar') >= 0 && T1.poolFar.indexOf('pillar') >= 0, 'boss1 pillar 已进近/远池');
  ok(T1.windup && T1.windup.pillar > 0 && T1.recover && T1.recover.pillar > 0, 'boss1 pillar 前摇/后摇齐');

  [2, 5, 8].forEach(k => {
    const T = tableOf(k);
    const name = k === 2 ? '蛟龙' : k === 5 ? '圣裁者' : '天秤';
    ok(T.column && T.column.n > 0 && T.column.warn > 0 && T.column.dur > 0 && T.column.warnMax === undefined,
      'boss' + k + ' ' + name + ' column 参数齐（warn/dur/n）', T.column && T.column.warn + '/' + T.column.dur);
    ok(T.poolNear.indexOf('column') >= 0 && T.poolFar.indexOf('column') >= 0,
      'boss' + k + ' column 已进近/远池');
    ok(T.windup && T.windup.column > 0 && T.recover && T.recover.column > 0,
      'boss' + k + ' column 前摇/后摇齐');
  });
  ok(tableOf(2).column.tone === 'aqua' && tableOf(5).column.tone === 'gold'
     && tableOf(8).column.tone === 'violet', 'column 三色：aqua/gold/violet');
  const T3 = tableOf(3);
  ok(T3.pillar && T3.pillar.tone === 'ghost' && T3.poolNear.indexOf('pillar') >= 0,
    'boss3 幽冥鬼柱：tone=ghost 且进池', T3.pillar && T3.pillar.tone);
}

/* ==================== T2 columnCast：落柱 / 命中 / 自删 ==================== */
console.log('[T2] columnCast（kind2/5/8）');
[2, 5, 8].forEach(k => {
  const T = tableOf(k), CL = T.column;
  const g = world(k), b = g.boss, p = g.player;
  b.next = 'column'; b.state = 'columnCast'; b.t = 0; b.fireN = 0;
  step(g, Math.ceil(CL.gap * 60) + 2);            // 第一根在 gap 秒后落位（与 pillarCast 同节奏）
  const h0 = g.hazards.filter(e => e.kind === 'column');
  ok(h0.length === 1, 'kind' + k + ' 第一根落位', h0.length);
  ok(h0[0] && h0[0].warnMax === CL.warn && h0[0].tone === CL.tone,
    'kind' + k + ' 柱体带 warnMax/tone（UI 预警条同口径）', h0[0] && h0[0].tone);

  // 等到 n 根都落位
  step(g, Math.ceil((CL.n - 1) * CL.gap * 60) + 3);
  const hAll = g.hazards.filter(e => e.kind === 'column');
  ok(hAll.length === CL.n, 'kind' + k + ' 共落 ' + CL.n + ' 根', hAll.length);
  ok(hAll.every(e => e.x >= 12 && e.x <= g.level.w * 16 - 12), 'kind' + k + ' 落点在场内');

  // 站进第一根：预警结束后应受伤
  const hp0 = p.hp;
  p.x = hAll[0].x - p.w / 2; p.y = hAll[0].y - p.h;
  p.dead = false; p.invT = 0;
  step(g, Math.ceil((CL.warn + 0.06) * 60));
  ok(p.hp < hp0 || p.dead, 'kind' + k + ' 站在柱内被命中（hp ' + hp0 + '→' + p.hp + '）');

  // 落柱结束：hazard 自删 + 回 recover（只等到"最后一根收柱"，不给它再选下一招的时间）
  step(g, Math.ceil((CL.dur + 0.30) * 60));
  ok(g.hazards.filter(e => e.kind === 'column').length === 0, 'kind' + k + ' 光柱到点自删（无残留）');
  ok(b.state === 'recover' || b.state === 'idle' || b.state === 'windup' || b.state === 'stagger',
    'kind' + k + ' 施法结束回正常状态', b.state);
});

/* ==================== T3 pillarCast：晶棘 / 鬼柱 ==================== */
console.log('[T3] pillarCast（kind1/3）');
[1, 3].forEach(k => {
  const T = tableOf(k), PL = T.pillar;
  const g = world(k), b = g.boss, p = g.player;
  b.next = 'pillar'; b.state = 'pillarCast'; b.t = 0; b.fireN = 0;
  step(g, Math.ceil(PL.gap * 60) + 2);            // 第一根在 gap 秒后起预警
  const h0 = g.hazards.filter(e => e.kind === 'pillar');
  ok(h0.length === 1, 'kind' + k + ' 第一根晶棘预警', h0.length);
  ok(h0[0] && h0[0].tone === PL.tone && h0[0].warnT > 0, 'kind' + k + ' 预警期/色调正确', h0[0] && h0[0].tone);

  step(g, Math.ceil((PL.n - 1) * PL.gap * 60) + 2);
  const hAll = g.hazards.filter(e => e.kind === 'pillar');
  ok(hAll.length === PL.n, 'kind' + k + ' 共起 ' + PL.n + ' 根', hAll.length);

  const hp0 = p.hp;
  p.x = hAll[0].x - p.w / 2; p.y = hAll[0].y - p.h;
  p.dead = false; p.invT = 0;
  step(g, Math.ceil((PL.warn + 0.4) * 60));
  ok(p.hp < hp0 || p.dead, 'kind' + k + ' 站在柱内被命中（hp ' + hp0 + '→' + p.hp + '）');
});

/* ==================== T4 UI：按 Boss 换名 ==================== */
console.log('[T4] UI 招名/姿态静态走查');
{
  const ui = read('ui.js');
  ok(/BOSS_MOVE_BY_KIND=\{1:\{pillar:'星核晶棘'\},2:\{column:'沧溟水柱'\},3:\{pillar:'幽冥鬼柱'\}/.test(ui)
     && /5:\{column:'圣光天柱'\},8:\{column:'裁决光柱'\}/.test(ui), 'BOSS_MOVE_BY_KIND 五只专属名就位');
  ok(/column:'天穹贯柱'/.test(ui), 'column 通用名就位');
  ok(/case 'columnCast':/.test(ui) && /_hzColumn\(h,tick,ox,oy\)/.test(ui), 'columnCast 姿态与渲染接线');
  ok(/case 'column':\{/.test(ui), 'column 前摇预警图形就位');
}

console.log('\n结果: ' + (fail === 0 ? '全部通过' : (pass + ' 通过 / ' + fail + ' 失败')) + '（' + pass + ' 项）');
process.exit(fail === 0 ? 0 : 1);
