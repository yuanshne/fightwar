// node tools/_v6_loot_test.js —— v6 波2 装备引擎队工单 §交付自测（node 无 DOM 桩环境，装载法同 _v6_feel_test.js）
// 6 项：①稀有度分布（_engRollTier×10⁶ vs BAL.gear.boss1，差≤0.3%）
//       ②Boss 链路（L7 激活→hp=1→一击入 dying→gearDrops∈[1,2]；loadLevel(6)×5 可刷性）
//       ③精英骑士（合成关 splice 到 levelIdx=8，真实普攻击杀 200 次→掉率 10%±3% 且无金）
//       ④物理与拾取（反弹一次→rest；重叠→pickups 事件+实体删除；H4 levelClear 转移 + §5 respawn 保留）
//       ⑤上限（池满 8 不再生成；池 5→Boss 双掉钳到 6）
//       ⑥门禁实跑（node --check engine.js / gate.js engine / _v6_feel_test.js 退出码全 0）
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..');
const { execSync } = require('child_process');
const glue = '\n;return {PHY,BAL,Level,game,loadLevel,respawn,killPlayer,levelClear,updateWorld,LEVELS,'
  + "_engRollTier:(typeof _engRollTier==='undefined')?undefined:_engRollTier,"
  + "_engSlot:(typeof _engSlot==='undefined')?undefined:_engSlot,"
  + "_engMkGear:(typeof _engMkGear==='undefined')?undefined:_engMkGear,"
  + "_engKillEnemy:(typeof _engKillEnemy==='undefined')?undefined:_engKillEnemy};";
const themes = {}; ['grass', 'cave', 'sky', 'factory', 'lava', 'tower', 'boss', 'wind', 'castle', 'star'].forEach(k => themes[k] = {});
const sb = new Function('THEMES', fs.readFileSync(path.join(ROOT, 'levels.js'), 'utf8')
  + fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8') + glue)(themes);

let failed = 0;
function ok(cond, label) {
  if (cond) { console.log('  OK   ' + label); }
  else { console.error('  FAIL ' + label); failed++; }
}
function deepEq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

/* ---------- ① 稀有度分布（工单自测 1）：_engRollTier × 10⁶ vs BAL.gear.boss1，|freq−w/100|≤0.3% ---------- */
console.log('① 稀有度 roll 分布');
{
  ok(typeof sb._engRollTier === 'function' && typeof sb._engSlot === 'function' && typeof sb._engMkGear === 'function',
    '内部符号 _engRollTier/_engSlot/_engMkGear 已落地');
  // 逐值对照（H5：不得现场调参——平衡表 §Q 逐字）
  const G = sb.BAL.gear;
  ok(deepEq(G.boss1, [44, 30, 16, 8, 2]), 'BAL.gear.boss1=[44,30,16,8,2]（实际 ' + JSON.stringify(G.boss1) + '）');
  ok(deepEq(G.boss2, [20, 35, 25, 15, 5]), 'BAL.gear.boss2=[20,35,25,15,5]（实际 ' + JSON.stringify(G.boss2) + '）');
  ok(deepEq(G.elite, [55, 30, 12, 3, 0]), 'BAL.gear.elite=[55,30,12,3,0]（实际 ' + JSON.stringify(G.elite) + '）');
  ok(G.eliteChance === 0.10 && G.bossExtra === 0.30, 'eliteChance=0.10 / bossExtra=0.30（实际 ' + G.eliteChance + '/' + G.bossExtra + '）');
  ok(sb.BAL.econ.dropGrav === 1200 && sb.BAL.econ.dropFall === 360, 'BAL.econ.dropGrav=1200 / dropFall=360（掉落物理收编）');
  const w = G.boss1;
  ok(w.reduce((a, b) => a + b, 0) === 100, 'boss1 权重和=100（实际 ' + w.reduce((a, b) => a + b, 0) + '）');
  const N = 1000000, cnt = [0, 0, 0, 0, 0];
  for (let i = 0; i < N; i++) cnt[sb._engRollTier(w)]++;
  let distOk = true, maxDev = 0;
  const detail = w.map((wi, i) => {
    const freq = cnt[i] / N, dev = Math.abs(freq - wi / 100);
    if (dev > 0.003) distOk = false;
    maxDev = Math.max(maxDev, dev);
    return 'r' + i + ':期望' + (wi / 100).toFixed(3) + '/实测' + freq.toFixed(4);
  }).join(' ');
  ok(distOk, '10⁶ 次分布各档 |freq−w/100|≤0.3%（最大偏差 ' + (maxDev * 100).toFixed(4) + '%）\n       ' + detail);
  // elite 无金：权重 w[4]=0 → r=4 不可达（10⁶ 次实证 + 静态断言）
  ok(G.elite[4] === 0, 'BAL.gear.elite[4]===0（金=Boss 专属，§Q）');
  let goldSeen = 0;
  for (let i = 0; i < N; i++) if (sb._engRollTier(G.elite) === 4) goldSeen++;
  ok(goldSeen === 0, 'elite 权重 10⁶ 次零出金（出金 ' + goldSeen + '）');
  // 槽位均匀 1/3：10⁶ 次
  const sc = { w: 0, h: 0, c: 0 };
  for (let i = 0; i < N; i++) sc[sb._engSlot()]++;
  const slotDev = Math.max(Math.abs(sc.w / N - 1 / 3), Math.abs(sc.h / N - 1 / 3), Math.abs(sc.c / N - 1 / 3));
  ok(slotDev < 0.003, '槽位 w/h/c 均匀 1/3（最大偏差 ' + (slotDev * 100).toFixed(4) + '%）');
}

/* ---------- ② Boss 链路（工单自测 2）：L7 激活 → hp=1 → 一击入 dying → gearDrops∈[1,2] ---------- */
console.log('② Boss 掉落链路（L7）');
{
  const killBoss = () => { // 激活→等 idle→置 hp=1→贴身普攻至 dying；返回本局 game
    sb.loadLevel(6, false);
    const g = sb.game;
    g.state = 'play';
    g.player.x = g.boss.x - 140; g.player.y = g.boss.y + g.boss.h - g.player.h; g.player.vx = 0; g.player.vy = 0;
    let ready = false;
    for (let f = 0; f < 300 && !ready; f++) { sb.updateWorld(1 / 60); if (g.boss && g.boss.state === 'idle') ready = true; }
    if (!ready) return null;
    g.boss.hp = 1;
    let died = false;
    for (let f = 0; f < 120 && !died; f++) { // 贴身普攻至 dying（护盾吃掉 Boss 反击，不影响承伤路径）
      const b = g.boss, p = g.player;
      p.hp = 5; p.invT = 0; p.shieldT = 9999; p.shieldHp = 999; // 逐帧防御兜底（吸收接触伤害）
      p.x = b.x - 22; p.y = b.y + b.h - p.h; p.vx = 0; p.vy = 0; p.face = 1; // 钉位：攻击框 [p.x+8,p.x+26] 覆盖 Boss 左缘 4px
      if (p.atkCd <= 0 && p.atkWind <= 0 && p.atkT <= 0) g.input.attackHit = 1; // 上一摆完结才起下摆（中途重置会取消起手）
      sb.updateWorld(1 / 60);
      if (b.state === 'dying') died = true;
    }
    return died ? g : null;
  };
  const g = killBoss();
  ok(!!g, 'L7 Boss 激活且一击入 dying');
  if (g) {
    ok(g.gearDrops.length >= 1 && g.gearDrops.length <= 2, 'gearDrops∈[1,2]（实际 ' + g.gearDrops.length + '，第 2 件 30%）');
    let specOk = true;
    for (const d of g.gearDrops) {
      if (!('whc'.includes(d.slot) && d.slot.length === 1)) specOk = false;
      if (!(Number.isInteger(d.r) && d.r >= 0 && d.r <= 4)) specOk = false;
      if (!(d.w === 10 && d.h === 12 && typeof d.bounced === 'boolean' && typeof d.t === 'number')) specOk = false;
    }
    ok(specOk, '实体规格：slot∈whc / r∈0..4 / 10×12 / bounced/t 字段齐（'
      + g.gearDrops.map(d => d.slot + d.r).join(',') + '）');
    ok(g.pickups.length === 0, 'dying 瞬间尚未转 pickups（H4 兜底在 2.2s 后 levelClear）');
  }
  // 可刷性：重复 loadLevel(6) 五次（Boss 可重复挑战，掉落表不变 H5）
  let repOk = true, repN = [];
  for (let rep = 0; rep < 5; rep++) {
    const gg = killBoss();
    if (!gg || gg.gearDrops.length < 1 || gg.gearDrops.length > 2) repOk = false;
    else repN.push(gg.gearDrops.length);
  }
  ok(repOk, '重复 loadLevel(6) 五次均再掉 [1,2] 件（各次 ' + repN.join(',') + '）');
}

/* ---------- ③ 精英骑士（工单自测 3）：合成关 splice 到 levelIdx=8，真实普攻击杀 200 次 ---------- */
console.log('③ 精英骑士掉落（L9 门槛 levelIdx=8）');
{
  const fakeKnight = { // 照 _v4_puzzle_smoke/_v6_feel_test ⑥ 合成关模式：'A' + 支撑 + '@' + 'P'
    name: 'T · 骑士掉落', theme: 'castle', par: 40, hint: '', w: 40, h: 10,
    build(g) { g.ground(0, 39, 8); g.set(2, 7, '@'); g.set(20, 7, 'A'); g.set(36, 7, 'P'); return g; }
  };
  sb.LEVELS.splice(8, 0, fakeKnight); // 插到 idx 8 → loadLevel(8) 即 levelIdx===8（L9 掉落门槛）
  sb.loadLevel(8, false);
  const g = sb.game;
  g.state = 'play';
  const kn = g.level.enemies[0];
  ok(kn && kn.type === 'knight', "合成关 'A' 提取为 knight（levelIdx=" + g.levelIdx + '）');
  let kills = 0, drops = 0, rs = [], goldSeen = 0, stuck = false;
  for (let k = 0; k < 200 && !stuck; k++) {
    // 复位骑士（真实击杀入口 _engKillEnemy 每次经普攻致死路径触发）
    kn.dead = 0; kn.hp = 1; kn.x = kn.hx; kn.y = kn.hy; kn.vx = 0; kn.vy = 0; kn.kb = 0;
    kn.flashT = 0; kn.jitT = 0; kn.dvx = 0; kn.dvy = 0; kn.face = -1; kn.guardDown = false;
    if (kn.ai) { kn.ai.st = 'idle'; kn.ai.t = 0; kn.ai.cd = 999; } // 压制盾击冲锋（只测掉落，不测 AI）
    // 玩家站骑士背面（face=-1 → 背向左，玩家在右=背面）贴身普攻
    g.player.x = kn.x + 16; g.player.y = kn.y + kn.h - g.player.h;
    g.player.vx = 0; g.player.vy = 0; g.player.face = -1;
    g.player.hp = 5; g.player.invT = 0; g.player.atkCd = 0; g.player.atkT = 0; g.player.atkWind = 0;
    g.input.attackHit = 1;
    for (let f = 0; f < 20 && !(kn.dead > 0); f++) sb.updateWorld(1 / 60);
    if (!(kn.dead > 0)) { stuck = true; break; }
    kills++;
    if (g.gearDrops.length) { // 计数后清池（解除 H3 上限对速率测量的耦合）
      for (const d of g.gearDrops) { rs.push(d.r); if (d.r === 4) goldSeen++; if (!'whc'.includes(d.slot)) stuck = true; }
      drops += g.gearDrops.length;
      g.gearDrops.length = 0;
    }
  }
  ok(kills === 200, '骑士被真实普攻击杀 200 次（实际 ' + kills + '）');
  const rate = drops / 200;
  // 工单原文「期望掉率 10%±3%（二项 3σ）」两口径不自洽：n=200/p=0.1 的 3σ=±6.36%，±3%≈1.4σ
  // （按 ±3% 断言每次运行约 16% 概率假失败，实测第 2 轮 12/200=6.0% 即假失败例）。
  // 按工单注明的「3σ」口径取容差=3√(p(1−p)/n)（运行时按 n=击杀数/p=0.10 计算，非硬编码），
  // 保留 200 次击杀不变；实测是否落在字面 ±3% 带内一并在断言文本中如实打印，交付说明同步上报。
  const p0 = 0.10, band3 = 3 * Math.sqrt(p0 * (1 - p0) / Math.max(1, kills));
  const inLiteral = Math.abs(rate - p0) <= 0.03;
  ok(Math.abs(rate - p0) <= band3, '掉率 ' + (rate * 100).toFixed(1) + '%（掉 ' + drops + '/200）∈ 10%±' + (band3 * 100).toFixed(1)
    + '%（二项 3σ 口径；字面 ±3% 带' + (inLiteral ? '内' : '外——工单两口径不自洽，按注明 3σ 判定') + '）');
  ok(goldSeen === 0 && rs.every(r => r >= 0 && r <= 3), '掉落全为 r<4 无金（出金 ' + goldSeen + '，r 分布 ' + rs.join('') + '）');
  // 上限联动子断言（H3）：池满 8 → 骑士击杀不再生成
  for (let i = 0; i < 8; i++) g.gearDrops.push(sb._engMkGear(100 + i, 100, 'w', 0));
  kn.dead = 0; kn.hp = 1; kn.x = kn.hx; kn.y = kn.hy; kn.vx = 0; kn.vy = 0; kn.face = -1;
  if (kn.ai) { kn.ai.st = 'idle'; kn.ai.cd = 999; }
  g.player.x = kn.x + 16; g.player.y = kn.y + kn.h - g.player.h; g.player.face = -1;
  g.player.atkCd = 0; g.player.atkT = 0; g.player.atkWind = 0;
  g.input.attackHit = 1;
  for (let f = 0; f < 20 && !(kn.dead > 0); f++) sb.updateWorld(1 / 60);
  ok(g.gearDrops.length === 8, '池满 8 时骑士击杀不再生成（H3，实际 ' + g.gearDrops.length + '）');
  sb.LEVELS.splice(8, 1); // 还原 LEVELS
}

/* ---------- ④ 物理与拾取（工单自测 4）+ H4 转移 + §5 respawn 保留 ---------- */
console.log('④ 掉落物理 / 拾取 / H4 / respawn');
{
  const fakeIdx = sb.LEVELS.length;
  sb.LEVELS.push({ // 平地合成关（照 _v6_feel_test ⑥ 模式）
    name: 'T · 掉落物理', theme: 'castle', par: 40, hint: '', w: 40, h: 10,
    build(g) { g.ground(0, 39, 8); g.set(2, 7, '@'); g.set(36, 7, 'P'); return g; }
  });
  sb.loadLevel(fakeIdx, false);
  const g = sb.game;
  g.state = 'play';
  for (let f = 0; f < 20; f++) sb.updateWorld(1 / 60); // 玩家落稳（出生 x≈35，远离注入点 x=480）
  const floorY = 8 * 16; // 128
  g.gearDrops.push(sb._engMkGear(30 * 16, floorY - 40 - 12, 'w', 2)); // 离地 40px 注入
  let bounced = false, rested = false;
  for (let f = 0; f < 60; f++) {
    sb.updateWorld(1 / 60);
    const d = g.gearDrops[0];
    if (d) { if (d.bounced) bounced = true; if (d.rest) rested = true; }
  }
  ok(g.gearDrops.length === 1, '60 帧后掉落仍在（永不过期，工单 §3）');
  ok(bounced, '落地反弹发生（bounced=true，首撞 vy>60 → vy×−0.4）');
  ok(rested, '反弹一次后停驻（rest=true，二撞走 else 分支）');
  const d = g.gearDrops[0];
  ok(d && d.vy === 0 && d.vx === 0 && Math.abs(d.y + d.h - floorY) < 0.5,
    '停驻姿态：vy=0 vx=0 底缘贴地板顶（y+h=' + (d ? (d.y + d.h).toFixed(2) : '-') + ' vs ' + floorY + '）');
  // 拾取：玩家重叠 → pickups 事件 {slot,r} + sfx 'pickup' + 实体删除
  g.player.x = d.x - 5; g.player.y = floorY - g.player.h; g.player.vx = 0; g.player.vy = 0;
  const q0 = g.sfxQueue.length;
  sb.updateWorld(1 / 60);
  ok(g.gearDrops.length === 0, '重叠后掉落实体删除');
  ok(g.pickups.length === 1 && g.pickups[0].slot === 'w' && g.pickups[0].r === 2,
    'pickups 得事件 {slot:"w", r:2}（实际 ' + JSON.stringify(g.pickups) + '——bag 队冻结接口格式）');
  ok(g.sfxQueue.slice(q0).includes('pickup'), "sfxQueue 含 'pickup'");
  // §5 respawn：gearDrops 跨死亡保留、pickups 清空
  sb.loadLevel(fakeIdx, false);
  g.state = 'play';
  g.gearDrops.push(sb._engMkGear(30 * 16, floorY - 30, 'c', 3));
  g.pickups.push({ slot: 'w', r: 0 }); // 陈旧事件
  for (let f = 0; f < 10; f++) sb.updateWorld(1 / 60); // 落地
  sb.killPlayer();
  for (let f = 0; f < 80 && g.player.dead; f++) sb.updateWorld(1 / 60); // 死亡冻结 0.9s → respawn
  ok(!g.player.dead, '玩家已复活');
  ok(g.gearDrops.length === 1, 'respawn 后 gearDrops 跨死亡保留（实际 ' + g.gearDrops.length + '，工单 §5）');
  ok(g.pickups.length === 0, 'respawn 后 pickups 清空（防陈旧事件，工单 §5）');
  // H4：Boss 关 levelClear 把在场 gearDrops 全转 pickups；非 Boss 关不适用
  sb.loadLevel(6, false); // L7（meta.boss=true，levels.js:355）
  const g7 = sb.game;
  g7.state = 'play';
  g7.gearDrops.push(sb._engMkGear(100, 100, 'c', 4));
  g7.gearDrops.push(sb._engMkGear(120, 100, 'h', 1));
  sb.levelClear();
  ok(g7.state === 'clear', 'levelClear 生效（Boss 关）');
  ok(g7.gearDrops.length === 0, 'H4：Boss 关通关后 gearDrops 清空');
  ok(g7.pickups.length === 2 && g7.pickups.some(p => p.slot === 'c' && p.r === 4) && g7.pickups.some(p => p.slot === 'h' && p.r === 1),
    'H4：在场 2 件全部转 pickups（' + g7.pickups.map(p => p.slot + p.r).join(',') + '）');
  sb.loadLevel(fakeIdx, false); // 非 Boss 关负例
  const gn = sb.game;
  gn.state = 'play';
  gn.gearDrops.push(sb._engMkGear(100, 100, 'w', 0));
  sb.levelClear();
  ok(gn.gearDrops.length === 1 && gn.pickups.length === 0, '非 Boss 关 levelClear 不做转移（负例：drop 保留/pickups 空）');
  sb.LEVELS.splice(fakeIdx, 1); // 还原 LEVELS
}

/* ---------- ⑤ 上限（工单自测 5，H3）：注入 8 → 生成 ≤6；边界池 5 → Boss 双掉钳 6 ---------- */
console.log('⑤ gearDrops 池上限（H3）');
{
  const prep = () => { // L7 激活到 idle（池保持空），返回 game
    sb.loadLevel(6, false);
    const g = sb.game;
    g.state = 'play';
    g.player.x = g.boss.x - 140; g.player.y = g.boss.y + g.boss.h - g.player.h;
    for (let f = 0; f < 300 && g.boss.state !== 'idle'; f++) sb.updateWorld(1 / 60);
    return g;
  };
  const kill = (g) => {
    g.boss.hp = 1;
    for (let f = 0; f < 120 && g.boss.state !== 'dying'; f++) {
      const b = g.boss, p = g.player;
      p.hp = 5; p.invT = 0; p.shieldT = 9999; p.shieldHp = 999;
      p.x = b.x - 22; p.y = b.y + b.h - p.h; p.vx = 0; p.vy = 0; p.face = 1; // 攻击框覆盖 Boss 左缘
      if (p.atkCd <= 0 && p.atkWind <= 0 && p.atkT <= 0) g.input.attackHit = 1; // 一摆完结才起下摆
      sb.updateWorld(1 / 60);
    }
    return g.boss.state === 'dying';
  };
  let g = prep();
  ok(g.boss.state === 'idle', 'L7 Boss 激活到 idle');
  for (let i = 0; i < 8; i++) g.gearDrops.push(sb._engMkGear(100 + i, 100, 'w', 0)); // 注入 8（>上限 6）
  ok(kill(g), '池满 8 时 Boss 仍正常入 dying');
  ok(g.gearDrops.length === 8, '池满 8 → Boss 掉落不再生成（实际 ' + g.gearDrops.length + '，≤6 约束下守卫生效）');
  g = prep();
  for (let i = 0; i < 5; i++) g.gearDrops.push(sb._engMkGear(100 + i, 100, 'h', 1)); // 边界：池 5
  kill(g);
  ok(g.gearDrops.length === 6, '池 5 → Boss 必掉 1 件钳到 6、第 2 件被守卫跳过（实际 ' + g.gearDrops.length + '）');
}

/* ---------- ⑥ 门禁实跑（工单自测 6，H1）：node --check / gate.js engine / _v6_feel_test.js ---------- */
console.log('⑥ 门禁实跑');
try {
  execSync('node --check engine.js', { cwd: ROOT, encoding: 'utf8' });
  ok(true, 'node --check engine.js 通过');
} catch (e) { ok(false, 'node --check engine.js 失败\n' + (e.stderr || e.message)); }
try {
  const outE = execSync('node tools/gate.js engine', { cwd: ROOT, encoding: 'utf8' });
  console.log(outE.trim().split('\n').slice(-1)[0]);
  ok(true, 'node tools/gate.js engine 退出码 0');
} catch (e) { ok(false, 'node tools/gate.js engine 退出码 ' + e.status + '\n' + (e.stdout || '') + (e.stderr || '')); }
try {
  const outF = execSync('node tools/_v6_feel_test.js', { cwd: ROOT, encoding: 'utf8' });
  console.log(outF.trim().split('\n').slice(-1)[0]);
  ok(true, 'node tools/_v6_feel_test.js 退出码 0（波1 全项零回归）');
} catch (e) { ok(false, 'node tools/_v6_feel_test.js 退出码 ' + e.status + '\n' + (e.stdout || '') + (e.stderr || '')); }

/* ---------- 汇总 ---------- */
console.log(failed === 0 ? '\n_v6_loot_test: 全部断言通过' : '\n_v6_loot_test: ' + failed + ' 项失败');
process.exit(failed === 0 ? 0 : 1);
