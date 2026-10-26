// v10 Boss 验收（任务2/3/4）：血量三段整除 / 招式池 ≥6 / 五新招实放次数 / 连段概率 / 场地危险物回收 / 可躲性
// 用法：node tools/_v10_boss.js
//
// 沙箱手法照抄 tools/gate.js：levels + 章节 + aggregateLevels + engine 拼成一个 Function 体，
// 顶层 function 声明在 Function 作用域内可直接返回（不新增任何全局符号）。
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const THEMES = {};
['grass', 'cave', 'sky', 'factory', 'lava', 'tower', 'boss', 'wind', 'castle', 'star', 'sea', 'nether']
  .forEach(k => { THEMES[k] = {}; });
const DT = 1 / 60;

function buildSandbox() {
  let body = read('levels.js');
  for (const f of ['chapter2.js', 'chapter3.js']) if (fs.existsSync(path.join(ROOT, f))) body += '\n' + read(f);
  body += '\n;aggregateLevels();\n' + read('engine.js')
    + '\n;return {Level,LG,ALL_LEVELS,game,loadLevel,updateWorld,PHY,BAL,'
    + '_engMkBoss,_engBossPick,_engUpdateHazards};';
  return new Function('THEMES', body)(THEMES);
}

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('  [PASS] ' + msg); }
  else { fail++; console.log('  [FAIL] ' + msg); }
}
function idle(g) {
  g.input.left = 0; g.input.right = 0; g.input.jump = 0; g.input.jumpHit = 0;
  g.input.attackHit = 0; g.input.dashHit = 0; g.input.down = 0;
  g.input.skillUHit = 0; g.input.skillIHit = 0; g.input.skillOHit = 0; g.input.skillLHit = 0;
}

// 合成竞技场：60×12，地面 row11，玩家 col4，Boss 锚点 col30（走引擎真实 'X' 提取路径）
function mkArena(sb, kind) {
  const w = 60, h = 12;
  sb.ALL_LEVELS.push({ name: 'v10arena' + kind, theme: 'grass', w: w, h: h, par: 1, hint: '', boss: kind,
    build(g) {
      g.fill(0, h - 1, w - 1, h - 1, '#');
      g.set(4, h - 2, '@');
      g.set(30, h - 2, 'X');
      return g;
    } });
  const li = sb.ALL_LEVELS.length - 1;
  sb.loadLevel(li, false);
  sb.game.state = 'play';
  return li;
}

const BOSSES = [
  { kind: 1, key: 'boss',  name: '星核巨兽', add: ['meteor', 'spike'] },
  { kind: 2, key: 'boss2', name: '蛟龙·敖渊', add: ['pull', 'homing'] },
  { kind: 3, key: 'boss3', name: '幽冥判官', add: ['clone', 'spike'] },
  { kind: 4, key: 'boss4', name: '冥古龙',   add: ['meteor', 'pull'] },
  { kind: 5, key: 'boss5', name: '曜光·圣裁者', add: ['homing', 'clone'] }
];
const NEW_MOVES = ['meteor', 'spike', 'homing', 'clone', 'pull'];
const CAST_STATE = { meteor: 'meteorCast', spike: 'spikeCast', homing: 'homingCast', clone: 'cloneCast', pull: 'pullCast' };
// 状态名 → 招式名（统计「每招实放次数」用；旧招一并计入，证明新招是加在既有轮换里而不是替换）
const CAST_MAP = {
  leapAir: 'leap', chargeRun: 'charge', barrageFire: 'barrage', summonCast: 'summon',
  novaCast: 'nova', sweepCast: 'sweep', blinkCast: 'blink', scytheCast: 'scythe',
  breathCast: 'breath', haloCast: 'halo',
  meteorCast: 'meteor', spikeCast: 'spike', homingCast: 'homing', cloneCast: 'clone', pullCast: 'pull'
};

function main() {
  const sb = buildSandbox();
  const BAL = sb.BAL;
  const globalCast = {}; NEW_MOVES.forEach(m => globalCast[m] = 0);

  /* ================= ① 血量 / ② 招式池 ================= */
  console.log('① 血量与三段整除 / ② 招式池不同招式数');
  for (const B of BOSSES) {
    const T = BAL[B.key];
    ok(T.hp % 3 === 0, B.name + ' BAL.hp=' + T.hp + ' 被 3 整除（每段 ' + (T.hp / 3) + '）');
    const li = mkArena(sb, B.kind);
    const g = sb.game, b = g.boss;
    ok(!!b && b.maxHp === T.hp, B.name + ' maxHp=' + (b && b.maxHp) + ' === BAL.' + B.key + '.hp');
    ok(!!b && b.hp % 3 === 0 && b.hp === b.maxHp / 3, B.name + ' 首段 hp=' + (b && b.hp) + '（maxHp/3，整数）');
    ok(!!b && b.bandMax === b.maxHp / 3, B.name + ' bandMax=' + (b && b.bandMax) + '（UI 血条按段渲染）');
    const pool = new Set([].concat(T.poolNear, T.poolFar, T.p2Add));
    ok(pool.size >= 6, B.name + ' 不同招式 ' + pool.size + ' 种 ≥6：' + Array.from(pool).join('/'));
    ok(B.add.every(m => pool.has(m)), B.name + ' 新招已入池：' + B.add.join('+'));
    // 五新招参数齐备（表缺键会在释放瞬间 TypeError）
    for (const m of B.add) ok(!!T[m], B.name + ' BAL.' + B.key + '.' + m + ' 参数表存在');
    ok(!!T.windup.meteor && !!T.windup.spike && !!T.windup.homing && !!T.windup.clone && !!T.windup.pull,
      B.name + ' windup 补齐 5 新招');
    ok(!!T.recover.meteor && !!T.recover.spike && !!T.recover.homing && !!T.recover.clone && !!T.recover.pull,
      B.name + ' recover 补齐 5 新招');
    sb.ALL_LEVELS.pop(); // 合成关不留在表里（后续关卡序号不受影响）
  }

  /* ================= ③ 1800 帧驱动：每招实放次数 =================
     近身 / 远程各驱动 1800 帧（30s）：两套池的招式都要证明真的会放，不是只写在表里。 */
  console.log('\n③ 1800 帧（30s）驱动：每个招式实际被放出的次数（近身池 / 远程池各 30s）');
  for (const B of BOSSES) {
    const cnt = {};
    for (const mode of ['near', 'far', 'p2']) {
      const near = mode !== 'far';
      mkArena(sb, B.kind);
      const g = sb.game, b = g.boss, p = g.player;
      p.maxHp = 9999; p.hp = 9999;
      p.x = b.x - 100; p.y = b.y + b.h - p.h;
      let prevState = '';
      for (let f = 0; f < 1800; f++) {
        // 玩家钉在近/远位；Boss 钉回出生点（否则会一路走到左墙，距离判定永远落回近身池）
        const bcx = b.homeX + b.w / 2;
        b.x = b.homeX; b.y = b.homeY; b.vx = 0; b.vy = 0;
        // 远程轮也要先贴近 5 帧唤醒（dormant 只按距离激活，唤不醒就一次都不出招）
        const d = (f < 5 || near) ? -110 : -330;
        p.x = Math.max(20, Math.min(g.level.w * 16 - 30, bcx + d));
        p.y = b.y + b.h - p.h;
        p.vx = 0; p.vy = 0; p.dead = false;
        if (mode === 'p2' && f === 5) b.phase = 2; // 第三轮：P2（p2Add 新招 + 连段）
        idle(g);
        sb.updateWorld(DT);
        if (b.state !== prevState) {
          const mv = CAST_MAP[b.state];
          if (mv) { cnt[mv] = (cnt[mv] || 0) + 1; if (NEW_MOVES.indexOf(mv) >= 0) globalCast[mv]++; }
          prevState = b.state;
        }
        if (b.state === 'dead' || b.state === 'dying') break;
      }
      sb.ALL_LEVELS.pop();
    }
    const names = Array.from(new Set([].concat(BAL[B.key].poolNear, BAL[B.key].poolFar, BAL[B.key].p2Add)));
    const row = names.map(n => n + '=' + (cnt[n] || 0)).join('  ');
    console.log('  ' + B.name + '（' + names.length + ' 招，三轮共 90s）：' + row);
    for (const m of B.add) ok((cnt[m] || 0) > 0, B.name + ' 新招 ' + m + ' 实际释放 ' + (cnt[m] || 0) + ' 次 > 0');
  }
  console.log('  五新招合计：' + NEW_MOVES.map(m => m + '=' + globalCast[m]).join('  '));
  for (const m of NEW_MOVES) ok(globalCast[m] > 0, '全局：新招 ' + m + ' 至少释放 1 次');

  /* ================= ④ 连段概率 ================= */
  console.log('\n④ 连段：P2 阶段 300 次 _engBossPick 中 comboQ.length>=2 的比例');
  for (const B of BOSSES) {
    mkArena(sb, B.kind);
    const g = sb.game, b = g.boss, p = g.player;
    b.phase = 2; b.state = 'idle'; b.lastPattern = '';
    p.x = b.x - 100; p.y = b.y + b.h - p.h;
    let two = 0;
    for (let i = 0; i < 300; i++) {
      sb._engBossPick(b);
      if (b.comboQ && b.comboQ.length >= 2) two++;
    }
    const r = two / 300;
    ok(r >= 0.25 && r <= 0.55, B.name + ' 连段率 ' + (r * 100).toFixed(1) + '%（25%~55%）');
    ok(b.comboQ.length <= 2, B.name + ' 连段队列硬上限 2 招（实际 ' + b.comboQ.length + '）');
    sb.ALL_LEVELS.pop();
  }
  // 前摇缩短：comboN=1 时 windup 应缩到 0.8 倍（实测帧数，不靠读代码）
  {
    mkArena(sb, 1);
    const g = sb.game, b = g.boss, p = g.player;
    p.x = b.x - 100; p.y = b.y + b.h - p.h;
    const windFrames = function (comboN) {
      b.phase = 1; b.state = 'windup'; b.next = 'meteor'; b.t = 0; b.comboN = comboN;
      b.comboQ = []; b.staggerDur = 0;
      let f = 0;
      for (; f < 200; f++) { idle(g); sb.updateWorld(DT); if (b.state !== 'windup') break; }
      return f;
    };
    const f0 = windFrames(0), f1 = windFrames(1);
    ok(Math.abs(f1 / f0 - 0.8) <= 0.05, '连段第二招前摇 -20%：' + f0 + ' 帧 → ' + f1 + ' 帧（' + (f1 / f0).toFixed(2) + '×）');
    sb.ALL_LEVELS.pop();
  }

  /* ================= ⑤ 场地危险物：生成 + 5s 回收 ================= */
  console.log('\n⑤ game.hazards：每种新招释放后有元素生成，且 5 秒内回收为 0');
  for (const B of BOSSES) {
    for (const mv of B.add) {
      mkArena(sb, B.kind);
      const g = sb.game, b = g.boss, p = g.player;
      p.maxHp = 9999; p.hp = 9999;
      p.x = b.x - 100; p.y = b.y + b.h - p.h;
      g.hazards = [];
      b.state = CAST_STATE[mv]; b.t = 0; b.fireN = 0; b.pullT = 0;
      let spawned = 0;
      for (let f = 0; f < 80; f++) { // 80 帧（1.33s）：足够所有 Cast 态吐出第一颗
        idle(g); sb.updateWorld(DT);
        if (g.hazards.length > spawned) spawned = g.hazards.length;
        if (g.hazards.length > 0 && f > 20) break;
      }
      ok(g.hazards.length > 0, B.name + ' / ' + mv + ' 释放后 hazards 有 ' + g.hazards.length + ' 个元素（kind=' + (g.hazards[0] && g.hazards[0].kind) + '）');
      // 让 Cast 态自然收尾（clone 需要玩家反击；其余等它们自己消失）
      for (let f = 0; f < 40; f++) { idle(g); sb.updateWorld(DT); }
      if (mv === 'clone') {
        // 玩家反击：贴到每个分身侧面，每 0.4s 砍一刀（2 刀消失 = 契约的 hp 2）
        let atk = 0;
        for (let f = 0; f < 290; f++) {
          const cl = g.hazards.filter(h => h.kind === 'clone');
          if (!cl.length) break;
          const c = cl[0];
          p.x = c.x - 12; p.y = c.y + c.h - p.h; p.vx = 0; p.vy = 0; p.face = 1; p.dead = false;
          idle(g);
          atk -= DT;
          if (atk <= 0) { atk = 0.4; g.input.attackHit = 1; }
          sb.updateWorld(DT);
        }
      } else {
        // 其余：Boss 停手（置空 game.boss 只影响状态机，hazards 照常推进）
        g.boss = null;
        for (let f = 0; f < 300; f++) { idle(g); sb.updateWorld(DT); }
      }
      ok(g.hazards.length === 0, B.name + ' / ' + mv + ' 5 秒内回收完毕（剩余 ' + g.hazards.length + '）');
      sb.ALL_LEVELS.pop();
    }
  }

  /* ================= ⑥ 可躲性：陨石圈外 / 地刺跳跃 / 追踪弹奔跑 ================= */
  console.log('\n⑥ 可躲性：三种情况玩家不掉血');
  // ⑥-1 陨石：预警圈外站定
  {
    mkArena(sb, 1);
    const g = sb.game, p = g.player;
    g.boss = null;
    p.maxHp = 5; p.hp = 5; p.invT = 0;
    const gy = 11 * 16;
    g.hazards.push({ kind: 'meteor', x: p.x + 5 + 80, y: gy, vy: 260, r: 9, warnT: 0.85 });
    for (let f = 0; f < 240; f++) { idle(g); sb.updateWorld(DT); }
    ok(p.hp === 5 && !p.dead, 'meteor：预警圈外站定 4s 不掉血（hp=' + p.hp + '）');
    ok(g.hazards.length === 0, 'meteor：落地后自行回收');
    sb.ALL_LEVELS.pop();
  }
  // ⑥-2 地刺：脚下冒刺瞬间起跳
  {
    mkArena(sb, 1);
    const g = sb.game, p = g.player;
    g.boss = null;
    p.maxHp = 5; p.hp = 5; p.invT = 0;
    for (let f = 0; f < 12; f++) { idle(g); sb.updateWorld(DT); } // 站稳
    const gy = 11 * 16;
    g.hazards.push({ kind: 'spike', x: p.x + p.w / 2, y: gy, h: 0, t: 0, life: 1.1 });
    for (let f = 0; f < 90; f++) {
      idle(g);
      if (f === 0) g.input.jumpHit = 1;        // idle 会清边沿，必须在其后写
      g.input.jump = f < 30 ? 1 : 0;           // 按住 0.5s：满高跳，不吃松手截断
      g.input.right = 1;                       // 同时横向移出地刺所在格（原地起跳会落回刺上）
      sb.updateWorld(DT);
    }
    ok(p.hp === 5 && !p.dead, 'spike：脚下冒刺时起跳 1.5s 不掉血（hp=' + p.hp + '）');
    sb.ALL_LEVELS.pop();
  }
  // ⑥-3 追踪弹：背后生成、玩家直线奔跑甩掉
  {
    mkArena(sb, 1);
    const g = sb.game, p = g.player;
    g.boss = null;
    p.maxHp = 5; p.hp = 5; p.invT = 0;
    for (let f = 0; f < 12; f++) { idle(g); sb.updateWorld(DT); }
    g.hazards.push({ kind: 'homing', x: p.x - 40, y: p.y + 2, vx: 78, vy: 0, turn: 1.4, life: 2.6, t: 0 });
    for (let f = 0; f < 170; f++) { idle(g); g.input.right = 1; sb.updateWorld(DT); }
    ok(p.hp === 5 && !p.dead, 'homing：背后追踪弹 + 直线奔跑 2.8s 不掉血（hp=' + p.hp + '）');
    ok(g.hazards.length === 0, 'homing：寿命到期自行回收');
    sb.ALL_LEVELS.pop();
  }

  /* ================= ⑦ 破绽期 ================= */
  console.log('\n⑦ 破绽期（stagger）：连段收尾强制 0.9s + 受击 ×1.5');
  {
    mkArena(sb, 1);
    const g = sb.game, b = g.boss, p = g.player;
    p.x = b.x - 100; p.y = b.y + b.h - p.h;
    // 构造「连段第二招刚放完」：comboQ=[x]，comboN=1，recover 到点
    b.state = 'recover'; b.next = 'barrage'; b.t = 99; b.comboQ = ['barrage']; b.comboN = 1;
    for (let f = 0; f < 2; f++) { idle(g); sb.updateWorld(DT); }
    ok(b.state === 'stagger', '连段收尾 → 强制 stagger（实际 ' + b.state + '）');
    ok(Math.abs((b.staggerDur || 0) - 0.9) < 1e-6, '大破绽时长 0.9s（实际 ' + b.staggerDur + '）');
    const hp0 = b.hpTotal;
    b.state = 'stagger'; b.staggerDur = 0.9; b.t = 0;
    const dmgBefore = hp0;
    // 用普攻路径太慢，直接调 _engBossHurt 不可导出 → 用玩家攻击：把判定框怼到 Boss 身上
    p.x = b.x - 12; p.y = b.y + 8; p.face = 1; p.atkCd = 0; p.atkT = 0; p.atkSeq++;
    for (let f = 0; f < 30 && b.hpTotal === dmgBefore; f++) {
      idle(g);
      if (f === 0) g.input.attackHit = 1;      // idle 会清边沿，必须在其后写
      sb.updateWorld(DT);
    }
    ok(b.hpTotal < dmgBefore, '破绽期可被正常打伤（' + dmgBefore + ' → ' + b.hpTotal + '，浮动 ' + (dmgBefore - b.hpTotal) + '）');
    ok((dmgBefore - b.hpTotal) === 3, '破绽期 2 伤 ×1.5 = 3（实际 ' + (dmgBefore - b.hpTotal) + '）');
    sb.ALL_LEVELS.pop();
  }

  /* ================= ⑧ 分身交互：一摆一伤、2 下消失 ================= */
  console.log('\n⑧ 分身：一摆一伤（判定框存活 0.12s 不得连扣）');
  {
    mkArena(sb, 1);
    const g = sb.game, p = g.player;
    g.boss = null; g.hitStop = 0; // ⑦ 的攻击命中留了 0.10s hit-stop，先清掉（否则前几帧世界冻结、攻击边沿被 idle 吃掉）
    const c = { kind: 'clone', x: p.x + 24, y: 11 * 16 - 30, w: 30, h: 30, hp: 2, face: -1,
      flashT: 0, t: 1, life: 6, vx: 0, vy: 0, spd: 0 };
    g.hazards.push(c);
    const swing = function () {
      p.x = c.x - 12; p.y = c.y + c.h - p.h; p.face = 1; p.atkCd = 0; p.atkT = 0; p.dead = false;
      for (let f = 0; f < 14; f++) { idle(g); if (f === 0) g.input.attackHit = 1; sb.updateWorld(DT); }
    };
    swing();
    ok(c.hp === 1 && g.hazards.indexOf(c) >= 0, '第一刀只扣 1 点（hp=' + c.hp + '，未被一刀秒）');
    swing();
    ok(g.hazards.indexOf(c) < 0, '第二刀消失（契约 hp=2）');
    sb.ALL_LEVELS.pop();
  }

  console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + '：' + pass + ' pass / ' + fail + ' fail');
  if (fail) process.exit(1);
}

main();
