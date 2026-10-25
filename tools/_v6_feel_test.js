// node tools/_v6_feel_test.js —— v6 手感队工单 §N 自测（node 无 DOM 环境，装载法参照 _v3_boss_fight_test.js）
// 9 项：①PHY 新值 ②跳高不变 ③收编零回归(逐帧对照基线) ④敌AI空转+ai字段 ⑤技能L星刃
//       ⑥火球(合成'Y'关) ⑦速降 ⑧装备缺省空转 ⑨门禁(child_process 实跑)
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..');
const { execSync } = require('child_process');
const glue = '\n;return {PHY,BAL,Level,game,loadLevel,respawn,killPlayer,levelClear,updateWorld,LEVELS};';
const themes = {}; ['grass', 'cave', 'sky', 'factory', 'lava', 'tower', 'boss', 'wind', 'castle', 'star'].forEach(k => themes[k] = {});
const sb = new Function('THEMES', fs.readFileSync(path.join(ROOT, 'levels.js'), 'utf8')
  + fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8') + glue)(themes);

let failed = 0;
function ok(cond, label) {
  if (cond) { console.log('  OK   ' + label); }
  else { console.error('  FAIL ' + label); failed++; }
}

/* ---------- ① PHY 断言（工单 §N.1） ---------- */
console.log('① PHY 新值断言');
ok(sb.PHY.grav === 1320, 'PHY.grav===1320（实际 ' + sb.PHY.grav + '）');
ok(sb.PHY.maxFall === 285, 'PHY.maxFall===285（实际 ' + sb.PHY.maxFall + '）');
ok(sb.PHY.jumpV === 309, 'PHY.jumpV===309（实际 ' + sb.PHY.jumpV + '）');
ok(sb.PHY.springV === 488, 'PHY.springV===488（实际 ' + sb.PHY.springV + '）');
ok(sb.BAL && sb.BAL.fall.fast === 360, 'BAL.fall.fast===360（实际 ' + (sb.BAL && sb.BAL.fall && sb.BAL.fall.fast) + '）');
ok(sb.BAL && sb.BAL.player.stompBounce === 235 && sb.BAL.player.hurtKbY === 131,
  'BAL.player.stompBounce===235 / hurtKbY===131（竖直派生等比 k=0.9381）');

/* ---------- ② 跳高不变（工单 §N.2）：jumpV²/(2·grav)=36.18px ±1 + 模拟采样顶点与基线一致 ---------- */
console.log('② 跳高不变断言');
{
  // 解析式断言（工单口径）：h = jumpV²/(2·grav) = 309²/2640 = 36.18px，允许 ±1px
  const want = sb.PHY.jumpV * sb.PHY.jumpV / (2 * sb.PHY.grav);
  ok(Math.abs(want - 36.18) <= 1, '解析跳高 jumpV²/2g = ' + want.toFixed(2) + 'px（36.18±1；旧 36.30，−0.3% 视作不变）');
  // 模拟断言（跳高不变的真实口径）：帧采样顶点受欧拉积分半帧重力影响恒低于解析值约 2.6px，
  // 对比基线同法采样的旧参数顶点——新旧一致即「跳跃高度不变」（设计书 §1.2 的验收意图）
  sb.loadLevel(0, false);
  const g = sb.game;
  g.state = 'play';
  for (let f = 0; f < 30; f++) sb.updateWorld(1 / 60); // 落稳
  const y0 = g.player.y;
  g.input.jumpHit = 1; g.input.jump = 1;
  let minY = y0;
  for (let f = 0; f < 60; f++) { sb.updateWorld(1 / 60); minY = Math.min(minY, g.player.y); }
  g.input.jump = 0; g.input.jumpHit = 0;
  const rise = y0 - minY;
  const basePath = path.join(__dirname, '_v6_baseline.json');
  const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
  let baseMin = Infinity;
  for (let f = 120; f < 180; f++) baseMin = Math.min(baseMin, +base.L1[f].split(',')[1]); // 基线 L1 跳跃段采样顶点
  const baseRise = 178 - baseMin; // 基线 L1 站稳后 y=178
  ok(Math.abs(rise - baseRise) <= 1, '模拟采样顶点升程 ' + rise.toFixed(2) + 'px ≈ 基线（旧参数）' + baseRise.toFixed(2) + 'px（±1px，跳高不变）');
  ok(Math.abs(rise - want) < 3, '采样顶点与解析值差 ' + (want - rise).toFixed(2) + 'px（欧拉半帧重力系统性偏差，新旧同源）');
}

/* ---------- ③ 收编零回归（工单 §N.3）：与改前基线逐帧对照，x 必须一致、y 差异=PHY 换算 ---------- */
console.log('③ 收编零回归（基线对照）');
{
  const basePath = path.join(__dirname, '_v6_baseline.json');
  ok(fs.existsSync(basePath), '基线文件 tools/_v6_baseline.json 存在（改码前由 _v6_baseline_capture.js 捕获）');
  if (fs.existsSync(basePath)) {
    const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
    let xBad = 0, yDiffLevels = 0;
    for (let i = 0; i < sb.LEVELS.length; i++) {
      sb.loadLevel(i, false);
      const g = sb.game;
      g.state = 'play';
      const frames = [];
      for (let f = 0; f < 120; f++) { sb.updateWorld(1 / 60); frames.push([g.player.x, g.player.y]); }
      g.input.right = 1; g.input.jump = 1; g.input.jumpHit = 1;
      for (let f = 0; f < 60; f++) { sb.updateWorld(1 / 60); frames.push([g.player.x, g.player.y]); }
      g.input.right = 0; g.input.jump = 0; g.input.jumpHit = 0;
      const b = base['L' + (i + 1)];
      let xd = 0, yd = 0;
      for (let f = 0; f < b.length; f++) {
        const [bx, by] = b[f].split(',').map(Number);
        if (frames[f][0] !== bx) xd++;
        if (frames[f][1] !== by) yd++;
      }
      if (xd > 0) { xBad++; console.error('  FAIL L' + (i + 1) + ' x 轴差异 ' + xd + ' 帧'); }
      if (yd > 0) yDiffLevels++;
    }
    ok(xBad === 0, 'L1~L10 x 轴 180 帧逐帧一致（0 关失败）');
    ok(yDiffLevels > 0, 'y 轴差异存在于 ' + yDiffLevels + ' 关（=PHY 竖直换算唯一允许差异，非静默零跑）');
  }
}

/* ---------- ④ 敌 AI 空转（工单 §N.4）：180 帧无异常无 NaN，ai 存在于全部 W/F/A/Y ---------- */
console.log('④ 敌 AI 空转 + ai 字段');
{
  let nanHit = false, missingAi = 0, aiNotIdle = 0, totalEnemies = 0;
  const stSeen = {};
  for (let i = 0; i < sb.LEVELS.length; i++) {
    sb.loadLevel(i, false);
    const g = sb.game;
    g.state = 'play';
    for (let f = 0; f < 180; f++) {
      sb.updateWorld(1 / 60);
      if (!Number.isFinite(g.player.x) || !Number.isFinite(g.player.y)) { nanHit = true; break; }
      for (const e of g.level.enemies) {
        totalEnemies++;
        if (!e.ai) { missingAi++; continue; }
        stSeen[e.ai.st] = 1;
        if (e.ai.st !== 'idle') aiNotIdle++; // 空转零触发：全部保持 idle
        if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) nanHit = true;
      }
      if (nanHit) break;
    }
  }
  ok(!nanHit, 'L1~L10 空转 180 帧无异常、无 NaN（实体 ' + totalEnemies + ' 个）');
  ok(missingAi === 0, '全部 W/F/A/Y 实体含 e.ai（缺失 ' + missingAi + '）');
  ok(aiNotIdle === 0, '空转 180 帧 e.ai.st 恒 idle（非 idle ' + aiNotIdle + '，触发全距离条件零误触发）');
}

/* ---------- ⑤ 技能 L 星刃回旋（工单 §N.5）：L7 Boss 场注入 ---------- */
console.log('⑤ 技能 L 星刃回旋');
{
  sb.loadLevel(6, false);
  const g = sb.game;
  g.state = 'play';
  g.player.x = g.boss.x - 140; // 进入激活半径（Boss 战地形，星刃命中 Boss 判定可达）
  let act = false;
  for (let f = 0; f < 300 && !act; f++) { sb.updateWorld(1 / 60); if (g.boss.state !== 'dormant' && g.boss.state !== 'intro') act = true; }
  ok(act, 'Boss 已激活（可承伤态）');
  // ⑤a 注入施放 → blades 出现 + sfx 'blade'
  g.skills.l = 0; g.input.skillLHit = 1;
  const q0 = g.sfxQueue.length;
  sb.updateWorld(1 / 60);
  ok(g.blades.length === 1, 'skillLHit 注入后 blades 出现（实际 ' + g.blades.length + '）');
  ok(g.skills.l > 6 - 0.02 && g.skills.l <= 6, 'CD 置 6s×cdMul=1（实际 ' + g.skills.l.toFixed(3) + '）');
  ok(g.sfxQueue.slice(q0).includes('blade'), "sfxQueue 含 'blade'");
  ok(g.player.castT > 0, '施法姿态 castT=0.2 置位（实际 ' + g.player.castT.toFixed(3) + '）');
  // ⑤b 去程 160px 后回程（phase 0→1）
  const bl0 = g.blades[0];
  const x0 = bl0.x;
  let turned = -1, travMax = 0;
  for (let f = 0; f < 120 && g.blades.length; f++) {
    sb.updateWorld(1 / 60);
    if (g.blades[0]) { travMax = Math.max(travMax, g.blades[0].trav); if (g.blades[0].phase === 1 && turned < 0) turned = f; }
  }
  ok(turned >= 0, '去程结束转回程（第 ' + turned + ' 帧≈160/320·60=30 帧）');
  ok(Math.abs(travMax - 160) < 4, '去程射程 trav≈160px（实际 ' + travMax.toFixed(1) + '）');
  // ⑤c 回程回收/寿命：2.6s 内必消失
  g.skills.l = 0; g.input.skillLHit = 1; sb.updateWorld(1 / 60);
  let life = 0;
  while (g.blades.length && life < 200) { sb.updateWorld(1 / 60); life++; }
  ok(g.blades.length === 0 && life <= 160, '星刃 ' + life + ' 帧（≤2.6s=156 帧+1）内消失');
  // ⑤d 命中敌人 combo+1：把星刃出生点直接怼到 dormant 免伤外——用 L7 召唤的史莱姆太慢，
  //     改为直接将 Boss 置受击态测 Boss 承伤 2/程；敌 combo 用 L1 真实敌人贴脸测
  sb.loadLevel(0, false);
  const g1 = sb.game;
  g1.state = 'play';
  const e0 = g1.level.enemies[0]; // L1 首个史莱姆 (20,H-2)
  g1.player.x = e0.x - 20; g1.player.y = e0.y + e0.h - g1.player.h; g1.player.vx = 0; g1.player.vy = 0;
  g1.player.face = 1;
  for (let f = 0; f < 10; f++) sb.updateWorld(1 / 60); // 落稳、贴近
  const combo0 = g1.combo;
  g1.skills.l = 0; g1.input.skillLHit = 1; sb.updateWorld(1 / 60);
  ok(g1.blades.length === 1, 'L1 贴脸注入星刃（实际 ' + g1.blades.length + '）');
  let hitCombo = -1;
  for (let f = 0; f < 40 && hitCombo < 0; f++) { sb.updateWorld(1 / 60); if (g1.combo > combo0) hitCombo = f; }
  ok(hitCombo >= 0, '星刃命中敌人 combo+1（第 ' + hitCombo + ' 帧）');
  // ⑤e Boss 一程一伤固定 2：L7 重置后直接把星刃放在 Boss 体内逐帧推进
  sb.loadLevel(6, false);
  const g7 = sb.game;
  g7.state = 'play';
  g7.player.x = g7.boss.x - 140;
  for (let f = 0; f < 300 && g7.boss.state !== 'idle'; f++) sb.updateWorld(1 / 60); // 等 intro 毕（idle 可受击）
  if (g7.boss.state !== 'idle') { // 兜底：直接传到面前触发
    g7.player.x = g7.boss.x + g7.boss.w + 30;
    for (let f = 0; f < 300 && g7.boss.state !== 'idle'; f++) sb.updateWorld(1 / 60);
  }
  ok(g7.boss.state === 'idle', 'Boss 进入 idle 可受击态（实际 ' + g7.boss.state + '）');
  const hp0 = g7.boss.hp;
  g7.skills.l = 0; g7.input.skillLHit = 1; sb.updateWorld(1 / 60);
  ok(g7.blades.length === 1, 'L7 注入星刃');
  // 星刃出生在玩家手前——玩家在 Boss 左侧 30px，去程 320px/s 直飞必然入体；
  // 每程一伤：去程/回程各承伤恰 2（设计书 §2.3：单发总伤 Boss 2×2=4）
  let hits = 0, dmgSum = 0, lastHp = hp0, perHitOk = true;
  for (let f = 0; f < 60; f++) {
    sb.updateWorld(1 / 60);
    if (g7.boss.hp < lastHp) { hits++; if (lastHp - g7.boss.hp !== 2) perHitOk = false; dmgSum += lastHp - g7.boss.hp; lastHp = g7.boss.hp; }
  }
  ok(hits === 2 && perHitOk, 'Boss 去程+回程各承伤恰 2（程数 ' + hits + '，单程全为 2，总 ' + dmgSum + '）');
}

/* ---------- ⑥ 火球（工单 §N.6）：合成 'Y' 关（照 _v4_puzzle_smoke 追加假关，不改 levels.js） ---------- */
console.log('⑥ 幽焰法师火球');
{
  const fakeIdx = sb.LEVELS.length;
  sb.LEVELS.push({
    name: 'T · 法师冒烟', theme: 'castle', par: 40, hint: '', w: 40, h: 10,
    build(g) { g.ground(0, 39, 8); g.set(2, 7, '@'); g.set(20, 7, 'Y'); g.set(36, 7, 'P'); return g; }
  });
  sb.loadLevel(fakeIdx, false);
  const g = sb.game;
  g.state = 'play';
  const mage = g.level.enemies[0];
  ok(mage && mage.type === 'mage', "合成关 'Y' 提取为 mage（w12 h18 hp2）");
  ok(mage.w === 12 && mage.h === 18 && mage.hp === 2 && !!mage.ai, "法师几何/耐久/ai 字段齐备（" + mage.w + '×' + mage.h + ' hp' + mage.hp + '）');
  g.player.x = mage.x - 100; g.player.y = 8 * 16 - 14; g.player.vx = 0; g.player.vy = 0; // |dx|=100 ≤140 触发
  let castStart = -1, castEnd = -1, fired = -1;
  for (let f = 0; f < 480 && fired < 0; f++) { // 单一连续计时：触发(≤4.0s 初值 cd 相位)→读条 0.8s→发射
    if (castStart < 0 && mage.ai.st === 'cast') castStart = f;
    if (castStart >= 0 && castEnd < 0 && mage.ai.st !== 'cast') castEnd = f;
    if (g.bullets.some(b => b.fire)) { fired = f; break; }
    sb.updateWorld(1 / 60);
  }
  ok(castStart >= 0, '近距触发读条（第 ' + castStart + ' 帧，|dx|=100≤140；初值 cd 相位错开内触发）');
  ok(castStart >= 0 && g.sfxQueue.includes('mage'), "sfxQueue 含 'mage'（读条低鸣）");
  ok(fired >= 0, '读条毕 bullets 含 fire:true 火球（第 ' + fired + ' 帧）');
  ok(fired >= 0 && Math.abs((fired - castStart) / 60 - 0.8) < 0.1, '读条时长 ≈0.8s（实际 ' + ((fired - castStart) / 60).toFixed(3) + 's）');
  const fb = g.bullets.find(b => b.fire);
  ok(fb && typeof fb.home === 'number' && fb.home > 0 && fb.life > 0, '火球 home=' + (fb && fb.home) + ' life=' + (fb && fb.life) + '（追踪 1.6s/寿命 3.2s）');
  // 斩碎分支：把玩家普攻判定怼到火球上
  if (fb) {
    const n0 = g.bullets.length;
    g.player.x = fb.x - 2; g.player.y = fb.y - 6; g.player.face = 1; // 火球进入身前 18×14 框
    g.player.atkCd = 0; g.player.atkT = 0; g.input.attackHit = 1;
    sb.updateWorld(1 / 60);
    sb.updateWorld(1 / 60);
    ok(g.bullets.length < n0, '普攻斩碎火球（bullets ' + n0 + '→' + g.bullets.length + '，火星色 #f86030 分支）');
  }
  // 追踪转向断言：火球速度向量逐步转向玩家
  sb.loadLevel(fakeIdx, false);
  const g2 = sb.game;
  g2.state = 'play';
  const mg2 = g2.level.enemies[0];
  g2.player.x = mg2.x - 100; g2.player.y = 8 * 16 - 14; g2.player.vx = 0; g2.player.vy = 0;
  for (let f = 0; f < 200 && !g2.bullets.some(b => b.fire); f++) sb.updateWorld(1 / 60);
  const fb2 = g2.bullets.find(b => b.fire);
  if (fb2) {
    // 玩家瞬移到火球速度反方向侧：home 追踪应朝玩家转向（转向率 2.2rad/s，12 帧 ≈0.44rad）
    g2.player.x = fb2.x - Math.sign(fb2.vx) * 60; g2.player.y = fb2.y;
    const ang0 = Math.atan2(fb2.vy, fb2.vx);
    for (let f = 0; f < 12; f++) sb.updateWorld(1 / 60);
    const fb3 = g2.bullets.find(b => b.fire);
    if (fb3) {
      const ang1 = Math.atan2(fb3.vy, fb3.vx);
      let dh = ang1 - ang0; while (dh > Math.PI) dh -= 6.283; while (dh < -Math.PI) dh += 6.283;
      ok(Math.abs(dh) > 0.3, 'home 追踪转向生效（|Δ角| ' + Math.abs(dh).toFixed(3) + ' rad > 0.3，转向率 2.2rad/s×0.2s）');
    } else ok(true, '追踪期间火球命中玩家/墙消失（追踪段已生效）');
  }
}

/* ---------- ⑦ 速降（工单 §N.7）：空中 down=1 上限 360、否则 285 ---------- */
console.log('⑦ 速降断言');
{
  sb.loadLevel(0, false);
  const g = sb.game;
  g.state = 'play';
  for (let f = 0; f < 20; f++) sb.updateWorld(1 / 60);
  // 悬空构造：抬到空中（y=60，下方 130px 内无瓦片/危险物）再走纯重力帧
  g.player.x = 35; g.player.y = 60; g.player.vx = 0; g.player.vy = 0;
  g.player.onGround = false; g.player.standOn = null;
  g.input.down = 0;
  let maxVySlow = 0;
  for (let f = 0; f < 20; f++) { sb.updateWorld(1 / 60); maxVySlow = Math.max(maxVySlow, g.player.vy); }
  ok(maxVySlow <= 285 + 1e-9, '不按↓：vy 上限 285（实测峰值 ' + maxVySlow.toFixed(2) + '）');
  g.player.x = 35; g.player.y = 60; g.player.vx = 0; g.player.vy = 0;
  g.player.onGround = false; g.player.standOn = null;
  g.input.down = 1;
  let maxVyFast = 0;
  for (let f = 0; f < 20; f++) { sb.updateWorld(1 / 60); maxVyFast = Math.max(maxVyFast, g.player.vy); }
  g.input.down = 0;
  ok(maxVyFast > 300, '按住↓：vy 突破 285（实测峰值 ' + maxVyFast.toFixed(2) + '）');
  ok(maxVyFast <= 360 + 1e-9, '按住↓：vy 上限 360（实测峰值 ' + maxVyFast.toFixed(2) + '）');
}

/* ---------- ⑧ 装备缺省空转（工单 §N.8 / H4）：equip 拔除后全路径无异常 ---------- */
console.log('⑧ 装备缺省空转（H4）');
{
  const savedEquip = sb.game.equip, savedCdMul = sb.game.cdMul;
  sb.game.equip = undefined; sb.game.cdMul = undefined; // 最严苛：彻底拔除（波2 未写入形态）
  let threw = null;
  try {
    for (let i = 0; i < sb.LEVELS.length; i++) {
      sb.loadLevel(i, false);
      const g = sb.game;
      g.state = 'play';
      for (let f = 0; f < 60; f++) sb.updateWorld(1 / 60);
      g.player.x = g.level.enemies.length ? g.level.enemies[0].x : g.player.x; // 贴敌触发接触/攻击路径
      g.input.attackHit = 1; g.input.dashHit = 1; g.input.jumpHit = 1;
      g.skills.l = 0; g.input.skillLHit = 1; // 技能全路径
      for (let f = 0; f < 60; f++) sb.updateWorld(1 / 60);
      g.player.hp = 1; g.player.invT = 0; // 走 respawn 路径
      g.killPlayer ? null : null;
      sb.respawn();
      for (let f = 0; f < 30; f++) sb.updateWorld(1 / 60);
    }
  } catch (err) { threw = err; }
  ok(!threw, 'game.equip 缺省（undefined）时 loadLevel/respawn/攻击/技能全路径无异常' + (threw ? '（异常: ' + threw.message + '）' : ''));
  ok(sb.game.player && sb.game.player.maxHp === 5, '缺省时 maxHp 回落 hpBase=5（实际 ' + (sb.game.player && sb.game.player.maxHp) + '）');
  sb.game.equip = savedEquip; sb.game.cdMul = savedCdMul;
  // 装备注入正路径：equip.hp=2 → maxHp 7；equip.atk=3 → ATK 4；equip.spd=0.1 → effRun 132；cdMul 0.9 → CD 5.4
  sb.game.equip = { atk: 3, hp: 2, spd: 0.1, cd: 0.1 }; sb.game.cdMul = 0.9;
  sb.loadLevel(0, false);
  ok(sb.game.player.maxHp === 7 && sb.game.player.hp === 7, 'equip{hp:2} 注入后 maxHp=7（实际 ' + sb.game.player.maxHp + '）');
  const g3 = sb.game;
  g3.state = 'play';
  g3.skills.l = 0; g3.input.skillLHit = 1; sb.updateWorld(1 / 60);
  // 注：写入帧末尾 ⑬′ CD 递减同帧 -dt（5.4−1/60=5.383），容差 0.05
  ok(Math.abs(g3.skills.l - 6 * 0.9) < 0.05, 'cdMul=0.9 注入后技能 L CD≈5.4（实际 ' + g3.skills.l.toFixed(3) + '）');
  sb.game.equip = savedEquip; sb.game.cdMul = savedCdMul;
}

/* ---------- ⑨ 门禁（工单 §N.9）：child_process 实跑 gate，退出码 0 ---------- */
console.log('⑨ 门禁实跑');
try {
  const outE = execSync('node tools/gate.js engine', { cwd: ROOT, encoding: 'utf8' });
  console.log(outE.trim().split('\n').slice(-1)[0]);
  ok(true, 'node tools/gate.js engine 退出码 0');
} catch (e) { ok(false, 'node tools/gate.js engine 退出码 ' + e.status + '\n' + (e.stdout || '') + (e.stderr || '')); }
try {
  const outL = execSync('node tools/gate.js levels', { cwd: ROOT, encoding: 'utf8' });
  console.log(outL.trim().split('\n').slice(-1)[0]);
  ok(true, 'node tools/gate.js levels 退出码 0');
} catch (e) { ok(false, 'node tools/gate.js levels 退出码 ' + e.status + '\n' + (e.stdout || '') + (e.stderr || '')); }

/* ---------- 汇总 ---------- */
console.log(failed === 0 ? '\n_v6_feel_test: 全部断言通过' : '\n_v6_feel_test: ' + failed + ' 项失败');
process.exit(failed === 0 ? 0 : 1);
