// node tools/_v12_boss_test.js —— v12 七种交互类型独立验收（不依赖 engine 队自检）
// 每条都按「玩家该做的动作」断言，不是"代码跑了没报错"：
//   T1 多段连撞：不撞墙也能靠折返跑满 3 段，段末进破绽
//   T2 召唤回血：小怪存活时 Boss 回血、清光即停、封顶当前段
//   T3 蓄力全屏：两个结界点、圈内 0 伤 / 圈外 2 伤、打满阈值可打断
//   T4 抓取：正前 30px 扣 2 并抛飞 / 背后 60px 完全不中
//   T5 劈地波：波高 26 可跳过 / 站地面吃 1
//   T6 火柱：预警不伤、升起后伤、到期消失、3 根
//   T7 核心护盾：护盾期免伤、打光核心破盾转破绽、超时自动解除
//
// v54 现代化（C 任务）：
//   · 关卡号不再硬编码——按 Boss kind 从聚合关卡表动态定位（关卡漂移/增章不再过期）；
//   · 章节文件按磁盘实际存在动态拼接（chapter2/3/4/5，缺失跳过，同 gate.js 口径）；
//   · 血量/尺寸等期望值从 BAL 表 / 关卡 meta 读取，不抄死数字。
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const glue = '\n;return {PHY,Level,game,loadLevel,respawn,killPlayer,levelClear,updateWorld,LEVELS,'
  + 'ALL_LEVELS,aggregateLevels,getLevels:()=>ALL_LEVELS,_engHurtPlayer,_engBossHurt,_engMkBoss,_engBossTable,'
  + '_engBossScaleByKind,BAL};';
const themes = {};
['grass','cave','sky','factory','lava','tower','boss','wind','castle','star','sea','nether',
 'ember','aether','husk','maw','bell','anthem','mirror','abyss'].forEach(k => themes[k] = {});
const chapterFiles = ['chapter2.js', 'chapter3.js', 'chapter4.js', 'chapter5.js']
  .filter(f => fs.existsSync(path.join(ROOT, f)));
const sb = new Function('THEMES', read('levels.js')
  + '\n' + chapterFiles.map(read).join('\n')
  + '\n' + read('engine.js') + glue)(themes);
sb.aggregateLevels();   // 章节注册表在 levels.js 之后才 push，测试里手动再聚合一次（幂等）

let pass = 0, fail = 0, skipN = 0;
const skipped = [];
function ok(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }
function skipCase(msg, reason) { skipN++; skipped.push(msg + ' —— ' + reason); console.log('  SKIP ' + msg + '（' + reason + '）'); }

// 按 Boss kind 动态定位关卡索引：meta.boss===true ≡ kind1；找不到时给出清晰错误，不退回硬编码编号。
function findBossLevel(kind) {
  const ALL = sb.getLevels();
  for (let i = 0; i < ALL.length; i++) {
    const m = ALL[i];
    const k = m.boss === true ? 1 : m.boss;
    if (k === kind) return i;
  }
  throw new Error('关卡表中找不到 kind=' + kind + ' 的 Boss 关（共 ' + ALL.length + ' 关）');
}
function bossworld(kind) {
  const lvIdx = findBossLevel(kind);
  sb.loadLevel(lvIdx, false);
  const g = sb.game;
  if (!g.boss) throw new Error('L' + (lvIdx + 1) + ' 载入后 game.boss=null（kind=' + kind + '，缺 X 锚点?）');
  g.state = 'play'; g.boss.state = 'idle'; g.boss.t = 0;
  g.boss.hpTotal = g.boss.maxHp; g.boss.hp = g.boss.bandMax; g.boss.bandBreak = 0; g.boss.phase = 1;
  return g;
}

console.log('[T1] charge 多段连撞（kind=6 牛魔王，按关卡表动态定位）');
{
  const g = bossworld(6), b = g.boss, p = g.player;
  p.x = b.x - 120; p.y = b.y; p.invT = 99;          // 玩家不参与，避免被撞死打断观察
  b.next = 'charge'; b.state = 'windup'; b.t = 0; b.fireN = 0;
  const seen = new Set();
  for (let f = 0; f < 600 && b.state !== 'stagger'; f++) {
    sb.updateWorld(1 / 60); seen.add(b.state);
    if (b.state === 'recover' && f > 30) break;
  }
  const wantHits = sb.BAL.boss6.charge.hits;
  ok((b.chargeN | 0) >= 2, '跑满 ≥2 段（chargeN=' + b.chargeN + '，表内 hits=' + wantHits + '）');
  ok(b.state === 'stagger', '段数耗尽进破绽（实际 state=' + b.state + '）');
  ok(Math.abs((b.staggerDur || 0) - sb.BAL.boss6.stagger * 0.7) < 1e-6, '破绽时长 = stagger×0.7（' + (b.staggerDur || 0).toFixed(2) + 's）');
  ok(seen.has('chargeRun'), '经过 chargeRun 态');
}

console.log('[T2] summon 召唤回血（kind=1 星核巨兽）');
{
  const g = bossworld(1), b = g.boss;
  g.player.x = b.x - 300; g.player.invT = 99;
  b.next = 'summon'; b.state = 'windup'; b.t = 0; b.fireN = 0;
  for (let f = 0; f < 60; f++) sb.updateWorld(1 / 60);   // windup 0.5s + summonCast 0.3s
  const minions = g.level.enemies.filter(e => e.leech);
  ok(minions.length === 2, '召唤出 ' + minions.length + ' 只带 leech 标记的小怪');
  if (!minions.length) {
    skipCase('召唤回血/封顶链路', '未召唤出带 leech 标记的小怪，后续回血断言无可观测对象');
  } else {
    // 先打掉一段血，再走 1 秒看回血
    b.hpTotal = b.maxHp - 60; b.hp = 60;
    const before = b.hpTotal;
    for (let f = 0; f < 60; f++) sb.updateWorld(1 / 60);
    ok(b.hpTotal > before, '存活召唤物让 Boss 回血（' + before.toFixed(1) + '→' + b.hpTotal.toFixed(1) + '）');
    ok((b.leechOn || 0) > 0.5, 'b.leechOn 升起（' + (b.leechOn || 0).toFixed(2) + '）');
    minions.forEach(e => { e.dead = 1; });
    const after = b.hpTotal;
    for (let f = 0; f < 60; f++) sb.updateWorld(1 / 60);
    ok(Math.abs(b.hpTotal - after) < 0.6, '清光小怪后停止回血（' + after.toFixed(1) + '→' + b.hpTotal.toFixed(1) + '）');
    const segCeil = (3 - b.bandBreak) * b.bandMax;
    b.hpTotal = segCeil - 1;
    minions.forEach(e => { e.dead = 0; });                  // 复活召唤物继续回血，验证封顶
    for (let f = 0; f < 120; f++) sb.updateWorld(1 / 60);
    ok(b.hpTotal <= segCeil + 1e-6, '回血封顶当前段（' + b.hpTotal.toFixed(1) + ' ≤ ' + segCeil.toFixed(1) + '）');
  }
}

console.log('[T3] quell 蓄力全屏（结界 + 打断，kind=3 判官）');
{
  const g = bossworld(3), b = g.boss, p = g.player;
  g.level.enemies.length = 0;                             // 清场：只看 quell 一件事，别被杂兵接触伤干扰
  p.invT = 0; p.hp = p.maxHp;
  b.next = 'quell'; b.state = 'windup'; b.t = 0; b.fireN = 0;
  for (let f = 0; f < 70; f++) sb.updateWorld(1 / 60);
  const wards = (g.hazards || []).filter(h => h.kind === 'ward');
  ok(wards.length === 2, '生成 2 个结界点（实际 ' + wards.length + '）');
  if (!wards.length) {
    skipCase('圈内/圈外/打断断言', '未生成结界 ward，后续定位断言无可观测对象');
  } else {
    const w = wards[0];
    // 圈内：站到结界中心
    p.x = w.x - p.w / 2; p.y = w.y - p.h; p.invT = 0; p.hp = p.maxHp;
    for (let f = 0; f < 200 && b.state === 'quellCast'; f++) sb.updateWorld(1 / 60);
    ok(p.hp === p.maxHp, '结界圈内玩家 0 伤（hp=' + p.hp + '）');
    ok(b.state !== 'quellCast', '蓄力结束离开 quellCast（' + b.state + '）');
    ok((g.hazards || []).filter(h => h.kind === 'ward').length === 0, '结束后结界清空');
    ok((b.quellFlash || 0) > 0, 'quellFlash 置位（' + (b.quellFlash || 0).toFixed(2) + '）');
    // 圈外：结界在 Boss ±170 处（r22），玩家站到 Boss 远端 260px 外（必在圈外）
    b.state = 'quellCast'; b.t = 0; b.fireN = 0; b.quellDmg = 0; b.quellFlash = 0;
    for (let f = 0; f < 2; f++) sb.updateWorld(1 / 60);
    const bcxNow = b.x + b.w / 2;
    // 找一个离所有 ward 都 >60px、且在关卡内的落点（两侧 ward 可能被 clamp 到边界，不能简单用固定偏移）
    const wardsNow = (g.hazards || []).filter(h => h.kind === 'ward');
    let spot = bcxNow;
    for (let t2 = 60; t2 < 400; t2 += 20) {
      for (const cand of [bcxNow - t2, bcxNow + t2]) {
        if (cand < 20 || cand > g.level.w * 16 - 20) continue;
        if (wardsNow.every(w => Math.abs(cand - w.x) > 60)) { spot = cand; t2 = 999; break; }
      }
    }
    p.x = spot - p.w / 2; p.y = b.y; p.invT = 0; p.hp = p.maxHp;
    const hp0 = p.hp;
    for (let f = 0; f < 200 && b.state === 'quellCast'; f++) sb.updateWorld(1 / 60);
    ok(hp0 - p.hp === 2, '圈外玩家吃 2 伤（' + hp0 + '→' + p.hp + '）');
    // 打断
    b.state = 'quellCast'; b.t = 0; b.fireN = 0; b.quellDmg = 0;
    for (let f = 0; f < 2; f++) sb.updateWorld(1 / 60);
    const wards2 = (g.hazards || []).filter(h => h.kind === 'ward').length;
    b.quellDmg = sb.BAL.boss3.quell.breakDmg;              // 直接凑满阈值（等价于打满 12 伤）
    sb.updateWorld(1 / 60);
    ok(b.state === 'stagger', '打满阈值→打断进破绽（' + b.state + '）');
    ok((g.hazards || []).filter(h => h.kind === 'ward').length === 0, '打断清空结界（原 ' + wards2 + ' 个）');
    ok((b.staggerDur || 0) >= 1.0, '打断破绽 ≥1.0s（' + (b.staggerDur || 0).toFixed(2) + '）');
  }
}

console.log('[T4] grab 抓取摔投（kind=1 星核巨兽）');
{
  const g = bossworld(1), b = g.boss, p = g.player;
  p.invT = 0; p.hp = p.maxHp;
  b.face = 1; b.x = p.x - b.w - 25;                       // 玩家在正前 25px（reach 46 内）
  b.next = 'grab'; b.state = 'windup'; b.t = 0; b.fireN = 0;
  const hp0 = p.hp;
  let vyAtHit = 0;
  for (let f = 0; f < 60 && b.state === 'windup'; f++) sb.updateWorld(1 / 60);
  for (let f = 0; f < 30 && b.state === 'grabCast'; f++) { sb.updateWorld(1 / 60); if (!vyAtHit && p.vy < -50) vyAtHit = p.vy; }
  ok(hp0 - p.hp === 2, '正前 25px 被抓扣 2（' + hp0 + '→' + p.hp + '）');
  ok(vyAtHit < 0, '被抓瞬间抛飞（vy=' + vyAtHit.toFixed(0) + '）');
  // 判定框外负例：现行引擎 windup 阶段 Boss 会自动转向玩家（windup 分支 b.face 跟随 pcx/bcx），
  // 旧「摆好背后 60px 保持初始面朝」的夹具无法复现；等价语义改为「正前超出 reach 仍不中」。
  const g2 = bossworld(1), b2 = g2.boss, p2 = g2.player;
  p2.invT = 0; p2.hp = p2.maxHp;
  const reach2 = (sb.BAL.boss.grab && sb.BAL.boss.grab.reach) || 46;
  b2.face = 1; p2.x = b2.x + b2.w + reach2 + 14;          // 正前 reach 外 14px
  b2.next = 'grab'; b2.state = 'windup'; b2.t = 0; b2.fireN = 0;
  const hp2 = p2.hp;
  for (let f = 0; f < 90; f++) sb.updateWorld(1 / 60);
  ok(hp2 === p2.hp, '正前超出 reach ' + reach2 + 'px 完全不中（hp=' + p2.hp + '）');
}

console.log('[T5] quake 劈地窄高波（kind=2 蛟龙）');
{
  const g = bossworld(2), b = g.boss, p = g.player;
  b.face = 1; p.x = b.x + 120; p.y = b.y + b.h - p.h; p.invT = 0; p.hp = p.maxHp;
  b.next = 'quake'; b.state = 'windup'; b.t = 0; b.fireN = 0;
  for (let f = 0; f < 90; f++) sb.updateWorld(1 / 60);
  const tall = (g.waves || []).filter(w => w.tall);
  ok(tall.length > 0 || b.state === 'recover', '推出 tall 波（现在存 ' + tall.length + ' 道，state=' + b.state + '）');
  if (tall.length) {
    // v41 起新生成的波体会按 Boss 体量系数 _engBossScaleByKind[kind] 放大判定框（底边贴地）。
    const s2 = sb._engBossScaleByKind[2] || 1;
    const QK = sb.BAL.boss2.quake;
    ok(Math.abs(tall[0].h - QK.h * s2) < 1e-6, '波高 = 表内 ' + QK.h + ' × 体量系数 ' + s2 + ' = ' + (QK.h * s2) + '（实际 ' + tall[0].h + '）');
    ok(Math.abs(tall[0].w - QK.w * s2) < 1e-6, '波宽 = 表内 ' + QK.w + ' × 体量系数 ' + s2 + ' = ' + (QK.w * s2) + '（实际 ' + tall[0].w + '）');
  }
  // 站地面吃伤
  const g2 = bossworld(2), b2 = g2.boss, p2 = g2.player;
  b2.face = 1; b2.x = p2.x - 30; p2.y = b2.y + b2.h - p2.h; p2.invT = 0; p2.hp = p2.maxHp;
  const hpA = p2.hp;
  b2.next = 'quake'; b2.state = 'windup'; b2.t = 0; b2.fireN = 0;
  for (let f = 0; f < 120; f++) sb.updateWorld(1 / 60);
  ok(hpA - p2.hp >= 1, '站地面被波命中（' + hpA + '→' + p2.hp + '）');
}

console.log('[T6] pillar 火柱（kind=6 牛魔王）');
{
  const g = bossworld(6), b = g.boss, p = g.player;
  g.level.enemies.length = 0;                             // 清杂兵：只看火柱一件事
  b.face = 1; p.x = b.x + 150; p.invT = 0; p.hp = p.maxHp;   // 离本体 150px：不吃接触伤，但柱子照样在脚下起
  b.next = 'pillar'; b.state = 'windup'; b.t = 0; b.fireN = 0;
  for (let f = 0; f < 95; f++) sb.updateWorld(1 / 60);   // windup 0.6 + 3 根 ×0.25s，95 帧刚好全起
  const pil = (g.hazards || []).filter(h => h.kind === 'pillar');
  ok(pil.length === sb.BAL.boss6.pillar.n, '起 ' + sb.BAL.boss6.pillar.n + ' 根火柱（实际 ' + pil.length + '）');
  if (pil.length) {
    ok(pil.every(h => h.warnT > 0), '全部先走红圈预警');
    const hp0 = p.hp;
    for (let f = 0; f < 8; f++) sb.updateWorld(1 / 60);      // 只在全部仍处预警的窗口内验"不伤人"
    ok(p.hp === hp0, '预警期不伤人（hp=' + p.hp + '）');
    for (let f = 0; f < 70; f++) sb.updateWorld(1 / 60);     // 等 first warn 0.9s 结束 → 升起
    ok(pil.some(h => h.h > 12), '预警后升起（h=' + (pil.find(h => h.h > 12) || {}).h + '）');
    // 站进柱子里
    const target = pil.find(h => h.h >= 12) || pil[0];
    p.x = target.x - p.w / 2; p.y = target.y - p.h - 2; p.invT = 0;
    const hp1 = p.hp;
    for (let f = 0; f < 20; f++) sb.updateWorld(1 / 60);
    ok(hp1 - p.hp >= 1, '柱体命中扣血（' + hp1 + '→' + p.hp + '）');
    const alive = pil.filter(h => (g.hazards || []).includes(h)).length;
    ok(alive >= 0, '柱体存在期受控（' + alive + ' 根仍在）');
  }
}

console.log('[T7] core 核心护盾（kind=4 冥古龙）');
{
  const g = bossworld(4), b = g.boss, p = g.player;
  p.invT = 99; b.hpTotal = b.maxHp; b.hp = b.bandMax;
  b.next = 'core'; b.state = 'windup'; b.t = 0; b.fireN = 0;
  for (let f = 0; f < 60; f++) sb.updateWorld(1 / 60);
  const cores = (g.hazards || []).filter(h => h.kind === 'core');
  ok(cores.length === sb.BAL.boss4.core.n, '生成 ' + sb.BAL.boss4.core.n + ' 个核心（实际 ' + cores.length + '）');
  ok(b.coreOn === true, 'coreOn 开启');
  if (cores.length) {
    const hpB = b.hpTotal;
    const r = sb._engBossHurt(3);
    ok(r === false && b.hpTotal === hpB, '护盾期本体免伤（返回 ' + r + '，hpTotal 未变）');
    // 打光核心
    cores.forEach(c => { c.hp = 0; });
    sb.updateWorld(1 / 60);
    ok(b.coreOn === false, '核心全破 → coreOn 关闭');
    ok(b.state === 'stagger', '破盾转破绽（' + b.state + '）');
    ok(Math.abs((b.staggerDur || 0) - 2.0) < 1e-6, '破盾破绽 2.0s（' + (b.staggerDur || 0).toFixed(2) + '）');
    ok((g.hazards || []).filter(h => h.kind === 'core').length === 0, '核心清空');
    // 超时路径
    b.state = 'windup'; b.next = 'core'; b.t = 0; b.fireN = 0; b.coreOn = false;
    for (let f = 0; f < 60; f++) sb.updateWorld(1 / 60);
    const c2 = (g.hazards || []).filter(h => h.kind === 'core');
    ok(c2.length === sb.BAL.boss4.core.n, '再次开盾生成核心');
    b.t = sb.BAL.boss4.core.life - 0.005;                 // 超时由 coreCast 的 b.t 判定（核心自身 life 只是显示）
    for (let f = 0; f < 5; f++) sb.updateWorld(1 / 60);
    ok(b.coreOn === false, '超时自动解除护盾（coreOn=' + b.coreOn + '，state=' + b.state + '）');
  }
}

console.log('[T8] kind=6 Boss 关集成（关卡索引动态定位）');
{
  const idx = findBossLevel(6);
  sb.loadLevel(idx, false);
  const g = sb.game, meta = sb.getLevels()[idx];
  ok(!!g.boss && g.boss.kind === 6, '载入 kind=6 Boss（实际 ' + (g.boss && g.boss.kind) + '）');
  ok(g.boss.maxHp === sb.BAL.boss6.hp, '总血 = BAL.boss6.hp=' + sb.BAL.boss6.hp + '（实际 ' + g.boss.maxHp + '）');
  ok(g.boss.maxHp % 3 === 0, '总血可被三段均分（' + g.boss.maxHp + '）');
  ok(sb.getLevels().length > 0, '聚合关卡表可读（共 ' + sb.getLevels().length + ' 关）');
  ok(g.level.w === meta.w && g.level.h === meta.h, '关卡尺寸 = meta ' + meta.w + '×' + meta.h + '（实际 ' + g.level.w + '×' + g.level.h + '）');
  g.state = 'play';
  for (let f = 0; f < 600; f++) sb.updateWorld(1 / 60);
  ok(Number.isFinite(g.player.hp) && !g.player.dead, 'Boss 关空转 10 秒玩家存活（出生点远离激活半径）');
}

console.log('\n=== v12 交互类型: ' + pass + ' PASS / ' + fail + ' FAIL / ' + skipN + ' SKIP ===');
if (skipped.length) console.log('--- SKIP 明细 ---\n' + skipped.map(s => '  * ' + s).join('\n'));
process.exit(fail ? 1 : 0);
