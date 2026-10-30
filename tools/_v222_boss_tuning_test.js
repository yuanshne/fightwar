// node tools/_v222_boss_tuning_test.js —— v22 Boss 调参验收（node，无依赖）
// 用户四条反馈 + 两条补刀的逐项落地：
//   1. 烬·燎原业火给反应时间（warn 0.55s 预警圈；详细行为断言在 _v20_boss_test T2）
//   2. 秤（天秤）太弱 → weight/beam 提伤 2、P2 四连宽扇、新招「衡权压顶」（追踪点杀）
//   3. 喉太弱/远程吊打 → idle 提速、吸气圈 120→170、拽力 60→74、咬圈 34→46、找回「万弹穿云」
//   4. 钟按乐谱就该是宫商角徵羽五招 → 五音谱（+新招「双锤坠狱」「追魂余音」）、摆锋真能扫到人
//   5. 茧母：加「破茧亲卫」、茧网加宽 112 且不可打掉（行为断言在 _v209_audit_test T4/T5）
//   6. 冲刺键支持鼠标侧键（行为断言在 _v222_ui_test.py；此处静态走查）
// 加载方式同 _v20_boss_test。
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const glue = '\n;return {PHY,Level,game,loadLevel,updateWorld,BAL,aggregateLevels,'
  + '_engHurtPlayer,_engBossTable,_engBossPick,_engBossScore,_engBossDur,_engGroundY};';
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

/* 夹具：进对应关卡，Boss 摆成可控 idle */
function world(kind) {
  const idx = 19 + (kind - 7);              // L20~L24 ← kind 7~11
  sb.loadLevel(idx, false);
  const g = sb.game;
  g.state = 'play';
  g.boss.state = 'idle'; g.boss.t = 0; g.boss.vx = 0; g.boss.vy = 0;
  g.boss.hpTotal = g.boss.maxHp; g.boss.hp = g.boss.bandMax; g.boss.bandBreak = 0; g.boss.phase = 1;
  g.level.enemies.length = 0;
  g.bullets.length = 0; g.waves.length = 0; g.hazards.length = 0;
  g.heat = 0; g.heatT = 0; g.mawMeals = [];
  if (g.shots) g.shots.length = 0;
  return g;
}
function step(g, n) { for (let f = 0; f < n; f++) { g.hitStop = 0; sb.updateWorld(1 / 60); } }

/* ==================== T1 烬：flare 表与白名单 ==================== */
console.log('[T1] 烬：燎原业火预警圈（表）');
{
  const T = tableOf(7);
  ok(T.flare && T.flare.warn === 0.55, 'flare.warn=0.55s（用户：根本躲不掉，给点反应时间）',
    T.flare && T.flare.warn);
  ok(T.flare && T.flare.r === 34 && T.flare.minHeat === 30, 'r34 / minHeat30 机制值不变');
}

/* ==================== T2 秤：提伤 + 新招衡权压顶 + P2 四连砝码 ==================== */
console.log('[T2] 秤：weight/beam 提伤、crush 追踪点杀、P2 四连宽扇');
{
  const T = tableOf(8);
  ok(T.weight && T.weight.dmg === 2, '千钧坠杀 dmg 1→2（用户：基本没啥伤害）', T.weight && T.weight.dmg);
  ok(T.beam && T.beam.dmg === 2, '天梁横压 dmg 1→2', T.beam && T.beam.dmg);
  ok(T.crush && T.crush.dmg === 2 && T.crush.warn === 0.55, '衡权压顶就位（2 伤 / warn 0.55）');
  ok(T.weight && T.weight.n2 === 4 && Array.isArray(T.weight.spread2)
     && T.weight.spread2.length === 4, 'P2 四连宽扇表就位');
  ok(T.windup && T.windup.crush === 0.60 && T.recover && T.recover.crush === 0.55,
    'crush 前摇/收招读数齐（缺键会在 _engBossDur 抛错）');

  // crushCast：单枚追踪砝码砸在玩家脚下（landX 锁定口径）
  const g = world(8), b = g.boss, p = g.player;
  p.x = b.x + b.w / 2 + 90; p.y = b.y + b.h - p.h;
  b.landX = p.x + p.w / 2;
  b.next = 'crush'; b.state = 'crushCast'; b.t = 0; b.fireN = 0;
  step(g, 3);
  const w1 = g.hazards.filter(e => e.kind === 'weight');
  ok(w1.length === 1 && Math.abs(w1[0].x - (p.x + p.w / 2)) < 0.5,
    'crush 落点=玩家当前位置（追踪）', w1[0] && w1[0].x);

  // P2 weightCast：四枚宽扇
  const g2 = world(8), b2 = g2.boss, p2 = g2.player;
  b2.phase = 2;
  b2.next = 'weight'; b2.state = 'weightCast'; b2.t = 0; b2.fireN = 0;
  step(g2, Math.ceil(0.30 * 4 * 60) + 6);
  const w2 = g2.hazards.filter(e => e.kind === 'weight');
  ok(w2.length === 4, 'P2 砝码 3→4 枚', w2.length);
  const bc2 = b2.x + b2.w / 2;
  ok(T.weight.spread2.every((off, i) => Math.abs(w2[i].x - (bc2 + off)) < 0.5),
    '四枚落点按 spread2 宽扇分布');
}

/* ==================== T3 喉：提频 + 吸气圈 + 远程压制 ==================== */
console.log('[T3] 喉：idle 提速 / 吸气圈 170 / 咬圈 46 / 万弹穿云回池');
{
  const T = tableOf(10);
  ok(T.idleT[0] === 0.46 && T.idleT[1] === 0.34, 'idleT [0.46,0.34]（0.58/0.42 → 提速）', T.idleT.join('/'));
  ok(T.inhale && T.inhale.r === 170 && T.inhale.pull === 74,
    '吸气圈 120→170、拽力 60→74（远程不能再贴圈外白嫖）', T.inhale && (T.inhale.r + '/' + T.inhale.pull));
  ok(T.bite && T.bite.r === 46, '咬圈 34→46（被拽进圈后真的会被咬）', T.bite && T.bite.r);
  ok(T.poolFar.indexOf('barrage') >= 0, 'poolFar 找回「万弹穿云」（远程压制）', T.poolFar.join('/'));
  ok(T.windup.barrage !== undefined && T.recover.barrage !== undefined,
    'barrage 前摇/收招读数本来就齐（复用不新增键）');
}

/* ==================== T4 钟：五音谱 + 双锤坠狱 + 追魂余音 + 摆锋能扫到人 ==================== */
console.log('[T4] 钟：宫商角徵羽五招 + 谱固定 + 摆锋半径');
{
  const T = tableOf(11), SC = T.score;
  ok(SC.beats.length === 6 && SC.beats[5] === null,
    '五音谱：五招 + 休止', SC.beats.join(','));
  const want = ['pendulum', 'chime', 'hammer', 'hchain', 'homing'];
  ok(want.every((n, i) => SC.beats[i] === n), '音序=宫摆锋/商声波/角重锤/徵双锤/羽余音', SC.beats.join(','));
  ok(SC.restBeat === 3.2, '休止窗口 3.2s（五拍循环）', SC.restBeat);
  ok(T.pendulum && T.pendulum.r === 112 && T.pendulum.dmg === 2 && T.pendulum.sweep === 1.5
     && T.pendulum.band === 20, '摆锋：r 78→112 / dmg 2 / sweep 1.5s / 带宽 20°（用户：根本打不到角色）',
    T.pendulum && JSON.stringify(T.pendulum));
  ok(T.chime && T.chime.t.length === 3 && T.chime.n === 8 && T.chime.v === 112,
    '声波：两圈→三圈、6→8 向、96→112（用户：随便躲）', T.chime && ('rings=' + T.chime.t.length));
  ok(T.hammer && T.hammer.warn === 0.60 && T.hammer.splash === 115,
    '重锤：warn 0.75→0.60、余波 90→115', T.hammer && (T.hammer.warn + '/' + T.hammer.splash));
  ok(T.hchain && T.hchain.n === 2 && T.hchain.dmg === 2, '双锤坠狱表就位（2 记连落 / 2 伤）');
  ok(T.homing && T.homing.n === 3 && T.homing.v === 84, '追魂余音表就位（3 道慢速追踪）');
  ok(T.windup.hchain !== undefined && T.recover.hchain !== undefined
     && T.recover.homing !== undefined, 'hchain/homing 前摇收招读数齐');

  // hchainCast：第一记前摇结束立刻落影；第二记按 gap 追锁玩家新位置（连走两次才有解）
  const g = world(11), b = g.boss, p = g.player;
  p.x = b.x + b.w / 2 + 70; p.y = b.y + b.h - p.h; p.invT = 99;
  b.next = 'hchain'; b.state = 'hchainCast'; b.t = 0; b.fireN = 0;
  step(g, 2);
  ok(g.hazards.filter(e => e.kind === 'hammer').length === 1, '第一记锤立即落影');
  p.x += 50;                                    // 第一记影子的预警期里玩家横向跑
  step(g, Math.ceil(0.42 * 60) + 2);
  const hs = g.hazards.filter(e => e.kind === 'hammer');
  ok(hs.length === 2, '两记锤都出了', hs.length);
  ok(Math.abs(hs[1].x - (p.x + p.w / 2)) < 0.6, '第二记重新锁定玩家新位置（连走两次才有解）',
    hs[1] && hs[1].x + ' vs ' + (p.x + p.w / 2));
}

/* ==================== T5 茧母：破茧亲卫表 + 茧网表 ==================== */
console.log('[T5] 茧母：新招表 + 茧网加宽不可打掉（表）');
{
  const T = tableOf(9);
  ok(T.summon && T.summon.type === 'beetle' && T.summon.n === 2 && T.summon.cd === 14,
    '破茧亲卫：beetle ×2 / cd 14s（用户：技能有点少）');
  ok(T.summon && T.summon.leech === undefined, '亲卫不回血（leech 未配）');
  ok(T.web && T.web.w === 112 && T.web.life === 6.5, '茧网 64→112 宽、5→6.5s（用户：覆盖范围太小）',
    T.web && (T.web.w + '/' + T.web.life));
  ok(T.poolNear.indexOf('summon') >= 0 && T.poolFar.indexOf('summon') >= 0, 'summon 进双池');
  ok(T.windup.summon === 0.55 && T.recover.summon === 0.5, 'summon 前摇收招读数齐');
}

/* ==================== T6 撤销 v21 误削（行为）：召唤周期化 ==================== */
console.log('[T6] kind1 summon：v22 冷却语义（一次性标志不复存在）');
{
  const iL7 = 6;   // L7
  sb.loadLevel(iL7, false);
  const g = sb.game; g.state = 'play';
  const b = g.boss, p = g.player;
  ok(!!b && (b.kind || 1) === 1, 'L7 Boss 激活');
  p.x = b.x + b.w / 2 - 60; p.y = b.y;
  b.next = 'summon'; b.state = 'windup'; b.t = 0; b.comboQ = ['summon']; b.comboN = 0;
  step(g, Math.ceil(sb._engBossDur('summon', 1) * 60) + 4);
  ok(b.summonUsed === undefined, 'windup(summon) 结束不再置 summonUsed（v21 误削已撤）');
  ok((b.summonCd || 0) > 0, '冷却照常进入');
}

/* ==================== T7 静态走查：招名 / 五音前缀 / 鼠标侧键 ==================== */
console.log('[T7] ui.js 静态走查');
{
  const ui = read('ui.js');
  ok(ui.indexOf("crush:'衡权压顶'") >= 0 && ui.indexOf("hchain:'双锤坠狱'") >= 0,
    '预警条招名表收录两招新技');
  ok(ui.indexOf("BOSS_MOVE_BY_KIND={9:{summon:'破茧亲卫'},11:{homing:'追魂余音'}}") >= 0,
    'Boss 专属招名映射就位（茧母亲卫 / 钟余音）');
  ok(ui.indexOf('BOSS_NOTE11={pendulum:\'宫\',chime:\'商\',hammer:\'角\',hchain:\'徵\',homing:\'羽\'}') >= 0,
    '五音前缀表就位（宫商角徵羽）');
  ok(ui.indexOf("b===3?'Mouse4':b===4?'Mouse5'") >= 0
     && ui.indexOf('if(dashCode===side){if(!keys[side])pressed[side]=true;keys[side]=true;}') >= 0,
    '鼠标侧键（后退/前进）可绑冲刺（用户：冲刺键为什么不能设置为鼠标侧键）');
  ok(ui.indexOf("Mouse4:'侧键·后退',Mouse5:'侧键·前进'") >= 0, 'codeLabel 认得侧键');
  const eng = read('engine.js').replace(/\s+/g, ' ');
  ok(eng.indexOf("case 'crushCast'") >= 0 && eng.indexOf("case 'hchainCast'") >= 0
     && eng.indexOf("e.kind === 'flare'") >= 0, 'engine：crushCast / hchainCast / flare 结算分支齐全');
}

console.log('\n=== v22 Boss 调参: ' + pass + ' PASS / ' + fail + ' FAIL ===');
process.exit(fail ? 1 : 0);
