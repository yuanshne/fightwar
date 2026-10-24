# 工单 · 引擎队：Boss AI / 技能 / HP 系统（engine.js）

> 所有权：**只许改 `pixel-quest/engine.js`**。设计基准：`docs/specs/2026-10-24-v3-boss-design.md`（数值以它为准，本单不复述全部理由）。
> 依赖 v2 已合入接口（已核对现行代码）：`game.input.attackHit/attack/dashHit/dash`（engine.js:244,386-401）、
> `p.atkCd/atkT/dashCd/dashT/dashDir`、`_engResolveAttack`（engine.js:342）、`_engAddCombo`（engine.js:336）、
> `game.combo/comboT/hitStop`（engine.js:246-247,537-541）、`sfxQueue`、`_engAabb`、`_engAddParts`、`_engRectTiles`。
> **硬约束（违背即验收失败）**：
> H1. L7 空转 180 帧玩家不得死亡——Boss 激活半径 176px，出生点距 Boss 800px（设计文档 §6 核算）；
> H2. 攻击/冲刺/连击一律复用上列 v2 接口名与消费点，禁止另起炉灶；
> H3. `LEVELS` 变 7 关后 `tools/gate.js` 主循环已自适应（gate.js:39-41 按 `LEVELS.length`），你无需改 gate；
>     engine 必须在桩环境（`THEMES.boss` 缺失 → `{}`，gate.js:35）下七关构造+空转全部不抛异常。
> 契约红线（docs/CONTRACT.md §0）：顶层零 DOM/音频/键盘；不新增契约外顶层全局符号
> （新函数一律 `_eng` 前缀注明「内部」；`game`/`player` 扩展字段沿 v2 先例）。

## 任务清单（按序）

1. Level 解析新字符 `'X'`（Boss 锚点）→ `this.bossSpawn={x,y}`，网格换 `'.'`（与 `@`/`P` 同惯例）。
2. `game` 扩展字段：`boss:null, drops:[], meteors:[], waves:[], skills:{u:0,i:0,o:0}, flashT:0`；
   `game.input` 扩展 `skillUHit/skillIHit/skillOHit`（边沿，ui 写、你消费并清零）。
3. 玩家扩展字段（`_engMkPlayer`）：`hp:5, invT:0, shieldT:0, castT:0`。
4. HP 伤害统一入口 `_engHurtPlayer(fromX)` + 伤害源分类改造（敌人接触/弹幕从即死改 -1）。
5. Boss 实体 + `_engUpdateBoss(dt)` 状态机 + `_engBossHurt(dmg)` 伤害入口。
6. 三技能 `_engUpdateSkills(dt)`（U/I/O）+ `meteors/waves/drops` 更新循环。
7. `updateWorld` 顺序插桩（见下）+ `_engResolveAttack` 扩展 Boss/波判定。
8. `loadLevel/respawn` 适配（Boss 创建/重置、HP 复位、数组清空）。
9. sfx 新事件：`'roar','meteor','shield','ult','heart','hurt','bosshit'`（只 push，不发声）。

---

## A. Level 解析与 Boss 创建

```js
// constructor switch 新增（engine.js:115 一带）：
case 'X': this.bossSpawn = { x: px + 8, y: py }; this.tiles[y][x] = '.'; break;
// 注意：X 不入 SOLIDISH/STAND 语义，solid() 无需改。

// _engMkBoss（内部）：
function _engMkBoss(cx, py) { // cx=锚点中心x, py=锚点行顶
  return {
    x: cx - 26, y: py, w: 52, h: 48, vx: 0, vy: 0, face: -1,
    hp: 60, maxHp: 60, phase: 1,
    state: 'dormant', t: 0,          // t：当前状态已累计秒数
    next: '', lastPattern: '', pickN: 0,
    flashT: 0, chargeDir: 1, chargeFrom: 0, landX: 0, fireN: 0
  };
}
// loadLevel 末尾：
game.boss = L.bossSpawn ? _engMkBoss(L.bossSpawn.x, L.bossSpawn.y) : null;
game.drops = []; game.meteors = []; game.waves = []; game.flashT = 0;
game.skills = { u: 0, i: 0, o: 0 };
// player 初值 hp:5, invT:0, shieldT:0, castT:0 由 _engMkPlayer 给出。
```

Boss 出生后由自身重力落到主地板（见 leapAir 物理共用），落地脚底 y=208。

## B. HP 系统（任务 4）

```js
function _engHurtPlayer(fromX) { // 内部：一切 HP 伤害的唯一入口
  const p = game.player;
  if (!p || p.dead || game.state !== 'play') return false;
  if (p.invT > 0 || p.shieldT > 0) return false;   // 无敌帧/护盾：伤害与击退全免
  p.hp--; p.invT = 1.0;
  p.vx = (p.x + p.w / 2 < fromX ? -1 : 1) * 160;   // 击退方向=离伤害源
  p.vy = -140; p.dashT = 0; p.atkT = 0;
  game.shake = Math.max(game.shake, 5);
  game.sfxQueue.push('hurt');
  _engAddParts(p.x + 5, p.y + 7, 10, '#f85858', 90, 200);
  if (p.hp <= 0) killPlayer();                     // 复用 v2 死亡序列（engine.js:295）
  return true;
}
```

**伤害源改造点（逐处）**：
- ⑧ 炮弹/Boss 弹碰玩家：`killPlayer()` → `_engHurtPlayer(b.x + 4)`（engine.js:696）。
- ⑨ 敌人接触非踩踏分支：`killPlayer()` → `_engHurtPlayer(e.x + e.w / 2)`（engine.js:741）；
  踩踏分支不动（含击杀掉落勾子，见 E）。
- ⑦ 电锯、⑪ 尖刺/熔岩/坠落、⑥ 平台挤压：**保持 `killPlayer()` 即死**（设计 §5：护盾不挡即死物）。

`_engUpdatePlayer` 内：`p.invT -= dt; p.shieldT -= dt; p.castT -= dt;`（与其他计时器并列，engine.js:386 一带）。
`respawn()` 增加：`p.hp = 5; p.invT = 1.5; p.shieldT = 0; p.castT = 0;`
以及 Boss 重置（若存在且非 dormant/dead）：`b.state='idle'; b.t=0; b.vx=b.vy=0`；
`game.bullets=[]; game.waves=[]; game.meteors=[];`（drops 保留自然过期）。

## C. Boss AI 状态机（任务 5，算法级）

```js
const _engBossActDist = 176; // 激活半径(px)

function _engBossDur(name, phase) { // 前摇表(秒)，P2 ×0.85 —— 设计 §3
  const T = { leap: 0.50, barrage: 0.45, charge: 0.60, summon: 0.50, nova: 0.55 };
  return T[name] * (phase === 2 ? 0.85 : 1);
}

function _engBossPick(b) { // 确定性轮转选招（设计 §2）
  const p = game.player, bcx = b.x + b.w / 2, adx = Math.abs(p.x + p.w / 2 - bcx);
  let pool = adx <= 200 ? ['charge','leap','summon','charge'] : ['barrage','charge','leap','barrage'];
  if (b.phase === 2) pool = pool.concat(['nova']);
  const alive = game.level.enemies.filter(function(e){return !(e.dead>0);}).length;
  if (alive >= 2) pool = pool.filter(function(n){return n!=='summon';});
  pool = pool.filter(function(n){return n!==b.lastPattern;});
  if (!pool.length) pool = ['barrage'];
  b.next = pool[b.pickN++ % pool.length]; b.lastPattern = b.next;
  b.state = 'windup'; b.t = 0;
}

function _engBossHurt(dmg) { // 唯一伤害入口（攻击/星陨/连斩都走这里）
  const b = game.boss;
  if (!b || b.state === 'dormant' || b.state === 'intro' || b.state === 'enrage'
        || b.state === 'dying' || b.state === 'dead') return false;
  b.hp -= dmg; b.flashT = 0.12;
  game.hitStop = Math.max(game.hitStop, 0.06);      // 复用 v2 hit-stop
  game.shake = Math.max(game.shake, 3);
  game.sfxQueue.push('bosshit');
  if (b.hp <= 30 && b.phase === 1) { b.phase = 2; b.state='enrage'; b.t=0;
    game.sfxQueue.push('roar'); game.shake = 6; return true; }
  if (b.hp <= 0) { b.hp = 0; b.state='dying'; b.t=0;
    game.bullets = []; game.waves = []; game.shake = 10; }
  return true;
}

function _engBossPhysX(dt, b) { // X 轴解算（撞墙返回 true）——沿用玩家先X后Y惯例
  b.x += b.vx * dt;
  const y0 = Math.floor(b.y/16), y1 = Math.floor((b.y+b.h-0.01)/16);
  if (b.vx > 0) { const tx = Math.floor((b.x+b.w-0.01)/16);
    for (let ty=y0;ty<=y1;ty++) if (game.level.solid(tx,ty,game.switchState)) { b.x=tx*16-b.w; return true; } }
  else if (b.vx < 0) { const tx = Math.floor(b.x/16);
    for (let ty=y0;ty<=y1;ty++) if (game.level.solid(tx,ty,game.switchState)) { b.x=(tx+1)*16; return true; } }
  return false;
}

function _engUpdateBoss(dt) {
  const b = game.boss; if (!b) return;
  const L = game.level, p = game.player;
  b.flashT -= dt; b.t += dt;
  const pcx = p.x + p.w/2, bcx = b.x + b.w/2;

  switch (b.state) {
  case 'dormant':
    if (Math.abs(pcx - bcx) < _engBossActDist) {
      b.state='intro'; b.t=0; game.sfxQueue.push('roar'); game.shake=4;
    } break;

  case 'intro':
    if (b.t >= 1.8) { b.state='idle'; b.t=0; } break;   // 演出期无敌（_engBossHurt 已挡）

  case 'idle': {
    b.face = pcx < bcx ? -1 : 1;
    if (Math.abs(pcx-bcx) > 140) b.vx = b.face * (b.phase===2 ? 25 : 20); // 缓步逼近
    else b.vx = 0;
    _engBossPhysX(dt, b);
    if (b.t >= (b.phase===2 ? 0.45 : 0.6)) _engBossPick(b);
    break; }

  case 'windup':
    b.vx = 0; b.face = pcx < bcx ? -1 : 1;
    if (b.next === 'leap') { if (b.t >= _engBossDur('leap',b.phase)) { // 起跳参数在前摇结束瞬间取
        b.landX = _engClamp(pcx, bcx-300, bcx+300);
        const T = 0.9; b.vx = (b.landX - bcx) / T; b.vy = -675;         // g=1500 对称抛物线
        b.state='leapAir'; b.t=0; } }
    else if (b.next === 'charge') { if (b.t >= _engBossDur('charge',b.phase)) {
        b.chargeDir = pcx < bcx ? -1 : 1; b.chargeFrom = b.x;
        b.state='chargeRun'; b.t=0; game.sfxQueue.push('roar'); } }
    else if (b.next === 'barrage') { if (b.t >= _engBossDur('barrage',b.phase)) {
        b.state='barrageFire'; b.t=0; b.fireN=0; } }
    else if (b.next === 'summon') { if (b.t >= _engBossDur('summon',b.phase)) {
        b.state='summonCast'; b.t=0;
        for (const s of [-40, 40]) L.enemies.push({ type:'slime',
          x: bcx+s-6, y: b.y+b.h-10, w:12, h:10, vx: s<0?-28:28, vy:0,
          hx: bcx+s-6, hy: b.y+b.h-10, dead:0, t:0, grounded:false }); } }
    else if (b.next === 'nova') { if (b.t >= _engBossDur('nova',b.phase)) {
        b.state='novaCast'; b.t=0; b.fireN=0; } }
    break;

  case 'leapAir': {
    _engBossPhysX(dt, b);                       // X：可能撞侧墙（跳过横向就贴墙滑）
    b.vy = Math.min(b.vy + 1500*dt, 520); b.y += b.vy * dt;  // 落速上限 520（非玩家 360）
    if (b.vy > 0) { const ty = Math.floor((b.y+b.h-0.01)/16);
      const x0=Math.floor(b.x/16), x1=Math.floor((b.x+b.w-0.01)/16);
      for (let tx=x0;tx<=x1;tx++) if (L.solid(tx,ty,game.switchState)) {
        b.y = ty*16 - b.h; b.vx=0; b.vy=0;
        game.shake=6; game.sfxQueue.push('roar');
        _engAddParts(bcx, b.y+b.h, 16, '#a890f8', 100, 300);
        for (const d of [-1,1]) game.waves.push({ x: bcx+d*20, y: b.y+b.h-10,
          w:12, h:10, vx: d*(b.phase===2?115:90), life:1.2 });   // 双向贴地冲击波
        b.state='recover'; b.t=0; break; } }
    break; }

  case 'barrageFire': {                          // 3 轮×2 发，每轮间隔 0.15s
    b.face = pcx < bcx ? -1 : 1;
    const want = Math.floor(b.t/0.15);
    while (b.fireN < want && b.fireN < 3) {
      for (const off of [-8, 8]) {
        const ang = Math.atan2((p.y+p.h/2)-(b.y+18), pcx-(bcx)) + off*Math.PI/180;
        game.bullets.push({ x: bcx-4, y: b.y+14, w:8, h:8,
          vx: Math.cos(ang)*130, vy: Math.sin(ang)*130, star: true }); // star=true: ui 画星弹
      }
      game.sfxQueue.push('shot'); b.fireN++;
    }
    if (b.fireN >= 3 && b.t >= 0.45) { b.state='recover'; b.t=0; }
    break; }

  case 'chargeRun': {
    b.vx = b.chargeDir * (b.phase===2 ? 290 : 230);
    const hitWall = _engBossPhysX(dt, b);
    if (hitWall) { b.vx=0; b.state='stagger'; b.t=0;
      game.shake=8; game.sfxQueue.push('roar');
      _engAddParts(b.x+(b.chargeDir>0?b.w:0), b.y+b.h/2, 14, '#c8b8e8', 110, 250); }
    else if (b.t >= 1.5 || Math.abs(b.x-b.chargeFrom) >= 320) { b.vx=0; b.state='recover'; b.t=0; }
    break; }

  case 'stagger':   if (b.t >= 1.5) { b.state='recover'; b.t=0; } break; // 输出窗口

  case 'summonCast': if (b.t >= 0.30) { b.state='recover'; b.t=0; } break;

  case 'novaCast': {                              // 0.55s 蓄 + 双环(第二环 t=0.95)
    if (b.fireN === 0 && b.t >= 0.55) { _engBossNovaRing(b, 0);   b.fireN=1; game.sfxQueue.push('shot'); }
    if (b.fireN === 1 && b.t >= 0.95) { _engBossNovaRing(b, 22.5); b.fireN=2; game.sfxQueue.push('shot'); }
    if (b.fireN === 2 && b.t >= 1.2) { b.state='recover'; b.t=0; }
    break; }

  case 'recover':  b.vx = 0;
    if (b.t >= { leap:0.7, barrage:0.5, charge:0.4, summon:0.5, nova:0.6 }[b.next] || 0.5)
      { b.state='idle'; b.t=0; }
    break;

  case 'enrage':   b.vx = 0; if (b.t >= 1.2) { b.state='idle'; b.t=0; } break;

  case 'dying': {
    b.vx = 0; b.y += 6*dt;                        // 慢速下沉
    if ((b.t*18|0) !== ((b.t-dt)*18|0)) {         // 每 ~3.3 帧一圈爆炸粒子
      _engAddParts(bcx + (Math.random()*44-22), b.y + Math.random()*40, 10,
        ['#f8d048','#f86020','#48d8e8'][((b.t*10)|0)%3], 110, 60);
      game.shake = Math.max(game.shake, 4);
    }
    if (b.t >= 2.2) { b.state='dead'; levelClear(); }  // 复用 v2 通关（含彩带粒子）
    break; }
  }

  /* 接触伤害（除休眠/演出/死亡态）：吃玩家无敌帧 */
  if (b.state!=='dormant' && b.state!=='intro' && b.state!=='dying' && b.state!=='dead'
      && !p.dead && _engAabb(b, p)) _engHurtPlayer(bcx);
}

function _engBossNovaRing(b, deg) { // 8 向放射弹
  const bcx=b.x+b.w/2, bcy=b.y+20;
  for (let i=0;i<8;i++) { const a=(i*45+deg)*Math.PI/180;
    game.bullets.push({ x:bcx-4, y:bcy-4, w:8, h:8,
      vx:Math.cos(a)*100, vy:Math.sin(a)*100, star:true }); }
}
```

## D. updateWorld 插桩（任务 7，严格按此顺序）

```
既有 ①拉杆 ②拾取 ③门 ④检查点 ⑤终点(P 缺省跳过,engine.js:614 已判空) ⑥移动平台 ⑥′崩塌
⑦电锯 ⑧大炮/炮弹(改 vy+HP伤害) ⑨敌人AI/踩踏(接触改HP伤害)
新增 ⑨′ _engUpdateBoss(dt)
新增 ⑨″ 波/陨石/掉落更新（下 E 节）
⑩ 玩家物理(含 invT/shieldT/castT 计时与技能输入) ⑩′ _engResolveAttack(已扩展)
⑪ 危险判定(即死,不变) ⑫ 粒子 ⑬ 计时/震屏/连击/相机
新增 ⑬′ game.skills 三 CD 递减 dt；game.flashT 递减 dt
```

**炮弹 filter 改造**（engine.js:692-698）：`b.x+=b.vx*dt` 后加 `b.y+=(b.vy||0)*dt;`；
碰玩家 `killPlayer()` → `_engHurtPlayer(b.x+4)`；出界条件追加 `b.y<-20||b.y>L.h*16+20`。
**注意**：Boss 弹与炮弹同池——攻击斩碎（engine.js:357-364 既有）、连斩全清均天然生效。

`_engResolveAttack` 扩展（在敌人分支之前加）：

```js
if (game.boss) { // Boss 承伤：命中 +2 连击（设计 §4 连斩充能口径）
  if (_engAabb(box, game.boss) && _engBossHurt(1)) { _engAddCombo(); _engAddCombo(); hitEnemy = true; }
}
for (let i = game.waves.length-1; i >= 0; i--) {    // 冲击波可斩碎
  if (_engAabb(box, game.waves[i])) {
    _engAddParts(game.waves[i].x+6, game.waves[i].y+5, 6, '#48d8e8', 70, 200);
    game.waves.splice(i,1); _engAddCombo(); game.sfxQueue.push('break'); }
}
```
（`hitEnemy=true` 复用既有 hit-stop/震屏分支，engine.js:355。波碎粒子坐标取波中心。）

## E. 技能系统（任务 6）

```js
// _engUpdateSkills：放在 _engUpdatePlayer 的攻击/冲刺边沿块之后（engine.js:394 后），逻辑等价于：
function _engUpdateSkills(dt) { // 内部（实现时可内联进 _engUpdatePlayer，保留此结构）
  const p = game.player, S = game.skills, inp = game.input;
  if (inp.skillUHit) { inp.skillUHit = 0;
    if (S.u <= 0 && !p.dead) { S.u = 8; p.castT = 0.25; game.sfxQueue.push('meteor');
      const tx = _engSkillTargetX(p);               // Boss中心 / 200px内最近敌 / 面向44px
      game.meteors.push({ x: tx-24, y:-16, vy:300, w:10, h:14, delay:0    });
      game.meteors.push({ x: tx-5,  y:-16, vy:300, w:10, h:14, delay:0.25 });
      game.meteors.push({ x: tx+14, y:-16, vy:300, w:10, h:14, delay:0.50 }); } }
  if (inp.skillIHit) { inp.skillIHit = 0;
    if (S.i <= 0 && !p.dead) { S.i = 12; p.shieldT = 3.0; game.sfxQueue.push('shield');
      _engAddParts(p.x+5, p.y+7, 12, '#f8d048', 70, 0); } }
  if (inp.skillOHit) { inp.skillOHit = 0;
    if (S.o <= 0 && game.combo >= 8 && !p.dead) { S.o = 20;
      game.combo = 0; game.comboT = 0;              // 消耗连击
      game.hitStop = Math.max(game.hitStop, 0.12); game.flashT = 0.15; game.shake = 8;
      game.sfxQueue.push('ult');
      if (game.boss) _engBossHurt(5);
      const L = game.level;                          // 屏内普通敌全灭（走 _engKillEnemy 统一掉落）
      for (const e of L.enemies) if (!(e.dead>0) && _engOnScreen(e)) _engKillEnemy(e);
      for (const b of game.bullets) _engAddParts(b.x+4, b.y+4, 3, '#f8d048', 60, 100);
      game.bullets = [];                             // 清全部弹幕
    } }
}
function _engSkillTargetX(p) { // 内部
  if (game.boss && game.boss.state!=='dormant' && game.boss.state!=='dead'
      && game.boss.state!=='dying') return game.boss.x + game.boss.w/2;
  let best=null, bd=200;
  for (const e of game.level.enemies) if (!(e.dead>0)) {
    const d=Math.abs(e.x-p.x); if(d<bd){bd=d;best=e;} }
  return best ? best.x+6 : p.x+5 + p.face*44;
}

// ⑨″ 每帧实体更新（updateWorld 内新块）：
// 陨石
for (let i=game.meteors.length-1;i>=0;i--){ const m=game.meteors[i];
  if (m.delay>0){ m.delay-=dt; continue; }
  m.y += m.vy*dt;
  let boom = m.y > game.level.h*16+20;
  if (game.boss && _engAabb(m, game.boss)) { _engBossHurt(1); _engAddCombo(); boom=true; }
  if (!boom) for (const e of game.level.enemies)
    if (!(e.dead>0) && _engAabb(m,e)) { _engKillEnemy(e); boom=true; break; }
  if (!boom) { // 撞实心地面/砸碎 B 砖（AoE 24×24）
    _engRectTiles(game.level, m.x-7, m.y+8, 24, 10, function(tx,ty,ch){
      if (ch==='#'||ch==='I'||ch==='B'){ if(ch==='B'){game.level.tiles[ty][tx]='.';game.coins++;_engAddCombo();}
        boom=true; } }); }
  if (boom) { game.meteors.splice(i,1); game.shake=Math.max(game.shake,3);
    game.sfxQueue.push('meteor'); _engAddParts(m.x+5, m.y+10, 12, '#f8d048', 110, 250); } }
// 冲击波
for (let i=game.waves.length-1;i>=0;i--){ const w=game.waves[i];
  w.x += w.vx*dt; w.life -= dt;
  const ahead = Math.floor((w.x + (w.vx>0?w.w:0))/16), wy=Math.floor((w.y+5)/16);
  if (w.life<=0 || game.level.solid(ahead,wy,game.switchState)) { game.waves.splice(i,1); continue; }
  if (!game.player.dead && _engAabb(w, game.player)) { _engHurtPlayer(w.x+6); game.waves.splice(i,1); } }
// 掉落心
for (let i=game.drops.length-1;i>=0;i--){ const d=game.drops[i];
  d.vy = Math.min((d.vy||0)+1200*dt, 360); d.y += d.vy*dt; d.life -= dt;
  const ty=Math.floor((d.y+d.h)/16), tx=Math.floor((d.x+4)/16);
  if (game.level.solid(tx,ty,game.switchState)) { d.y=ty*16-d.h; d.vy=0; }
  if (d.life<=0) { game.drops.splice(i,1); continue; }
  if (!game.player.dead && _engAabb(d, game.player)) { game.drops.splice(i,1);
    const p=game.player; p.hp=Math.min(5,p.hp+1); game.sfxQueue.push('heart');
    _engAddParts(d.x+4,d.y+4,8,'#f85888',60,80); } }

// 击杀统一入口（掉落勾子；踩踏/攻击/星陨/连斩共用）：
function _engKillEnemy(e){ // 内部
  e.dead = 0.01;
  if (Math.random() < 0.30) game.drops.push({ x:e.x+2, y:e.y-4, w:8, h:8, vy:-120, life:6 });
}
// ⑨ 踩踏分支与 _engResolveAttack 敌人分支：e.dead=0.01 处改为 _engKillEnemy(e)（其余表现不变）。
```

## F. 自测断言（全部执行，贴进交付说明）

1. `node --check engine.js` → 通过。
2. `node tools/gate.js engine` → **七关**全部 `OK ... 帧稳定`（既有输出格式）。
3. L7 空转硬约束（H1）——**必须跑**，存为 `tools/_v3_boss_idle_test.js`（新测试脚本不属于任何队所有权冲突，引擎队可新增 tools/ 下测试文件；只读不改 gate.js）：
```js
// node tools/_v3_boss_idle_test.js —— 断言：L7 空转 180 帧玩家存活且 Boss 仍 dormant
const fs=require('fs'),path=require('path'),ROOT=path.join(__dirname,'..');
const glue='\n;return {PHY,Level,game,loadLevel,respawn,killPlayer,levelClear,updateWorld,LEVELS};';
const themes={};['grass','cave','sky','factory','lava','tower','boss'].forEach(k=>themes[k]={});
const sb=new Function('THEMES',fs.readFileSync(path.join(ROOT,'levels.js'),'utf8')
  +fs.readFileSync(path.join(ROOT,'engine.js'),'utf8')+glue)(themes);
sb.loadLevel(6,false); sb.game.state='play';
for(let f=0;f<180;f++) sb.updateWorld(1/60);
const g=sb.game;
console.assert(!g.player.dead&&g.player.hp===5&&g.boss&&g.boss.state==='dormant',
  'L7 空转违约: dead='+g.player.dead+' hp='+g.player.hp+' boss='+g.boss.state);
console.log('L7 空转180帧 OK: hp='+g.player.hp+' boss='+g.boss.state+' deaths='+g.deaths);
```
   预期输出：`L7 空转180帧 OK: hp=5 boss=dormant deaths=0`。
4. Boss 战冒烟——`tools/_v3_boss_fight_test.js`：载入 L7 → `game.player.x=game.boss.x-140`
   （进入激活半径）→ 跑 `for(f=0;f<1800;f++){ if(f%21===0)g.input.attackHit=1; g.input.right=(f%120<60)?1:0; updateWorld(1/60); }`
   → 断言全程无异常、`boss.state` 至少经历过 `'idle','windup'` 且 `boss.hp<60`、玩家 `deaths>=0` 无 NaN。
5. 技能冒烟：同脚本置 `game.skills.u=0;game.input.skillUHit=1;` 跑 120 帧 → `game.meteors.length>0` 曾出现、
   Boss hp 下降；`game.combo=8;game.skills.o=0;game.input.skillOHit=1;` → `game.flashT>0`、`bullets.length===0`。
6. 回归：`game.input` 旧字段行为不变——L1 攻击碎 B 箱得 1 金币、连击弹字照旧（跑 gate 即覆盖大半）。

## 验收标准

- 上述 1-4 全绿；5 无 NaN/异常。
- Boss 全状态在 node 无 DOM 环境可空转（不依赖 Math.random 之外的外部状态——设计允许掉落用 Math.random）。
- 未改 levels.js/art.js/ui.js/gate.js 任何一行（git diff 为证）。
