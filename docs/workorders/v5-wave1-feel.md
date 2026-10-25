# 工单 · 手感队（第一波）：二段跳/打击感/技能引擎/新机关语义（engine.js）

> 所有权：**只许改 `pixel-quest/engine.js`**。设计基准：`docs/specs/2026-10-24-v5-design.md`
> §1/§2/§3/§4/§8（数值以它为准）。现状引用行号基于当前 engine.js（1154 行版）。
> 依赖接口（已核对现行代码）：`PHY`(engine.js:89)、跳跃块(engine.js:756-767)、弹簧(837-847)、
> 落地(829-834)、水平移动(740-753)、攻击(704-712)、`_engResolveAttack`(649-693)、冲刺(713-721)、
> `_engUpdateSkills`(603-625)、`updateWorld` 顶部(857-865)、`_engKillEnemy`(406-409)、
> 踩踏(1067-1077)、`_engBossHurt`(448-461)、`game` 字段(270-294)、`_engMkPlayer`(297-307)。
>
> **硬约束（违背即验收失败）**：
> H1 门禁 `node tools/gate.js engine` 退出码 0（七关空转+输入冒烟+Boss 冒烟+v4 谜题冒烟全过）；
> H2 **存档兼容**：本文件不触碰 localStorage（现状如此，保持）；
> H3 **粒子峰值 ≤300**：`game.parts` ≤240、新 `game.fxParts` ≤60、新 `game.floats` ≤40（push 前守卫）；
> H4 **第一波结束时游戏完整可玩**：新机关（'w'/'e'/'A'/'H'）无任何关卡引用也能空转不炸；
> H5 CONTRACT §0 红线：顶层零 DOM/音频/键盘；新全局符号一律 `_eng` 前缀注「内部」；
> `game`/`player`/`Level`/敌人实体扩展字段沿 v2/v3 先例；PHY 键名不变。
> H6 完成后在 docs/CONTRACT.md **末尾追加**「附记（v5 手感，手感队录入）」（只增不改，见 §M）。

## 任务清单（按序）

1. 二段跳 + 空中操控 + 落地分级 + 跑步尘土/转身（§A）
2. 冲刺三段（§B）
3. 攻击起手/判定/余韵时间轴 + hit-stop 0.10 + 敌人耐久/击退/白闪/抖动/击飞 + 暴击 + Boss 微退（§C）
4. `game.floats` / `game.fxParts` / `game.scars` / `_engShake` 分级震屏（§D）
5. 技能重做：O 演出状态机 / U 瞄准圈+爆坑 / I 破盾（§E）
6. 新机关引擎语义：'w' 上升气流、'e' 传送门、'A' 骑士、'H' 吊灯摆锤（§F）
7. `_engDecorFallback` 预补 wind/castle/star 三键（§G）
8. sfx 新事件 push（§H）+ CONTRACT 附记（§M）+ 自测（§N）

---

## §A 二段跳 / 空中操控 / 落地分级 / 跑步

```js
// —— 常量（内部，v5）——
const _engHitStop = 0.10;   // 0.06→0.10（原 _engHitStop 定义在 engine.js:103）
const _engDjV = 0.92;       // 二段跳速度系数
const _engAirAcc = 0.75, _engAirTurn = 1.5, _engAirDrag = 240;
const _engKbV = 220, _engKbFric = 600;      // 击退：220²/(2*600)≈40px
const _engWindUp = 1900, _engWindCap = 170; // 上升气流：净 -400px/s²，上升终速 -170
const _engDjT = 0.4;                          // 二段跳空翻演出时长

// —— _engMkPlayer 扩展字段（engine.js:297）——
// airJumps:1, djT:0, turnT:0, stepT:0, landVy:0, springAir:false,
// atkAnim:0（攻击总动画 0.25s 计时，渲染用）, atkWind:0（起手 0.05s，期间无判定）

// —— 敌人实体默认字段（Level 构造 W/F/A 时一并给；蝙蝠 hp:1）——
// hp:2(史莱姆)/3(骑士)/1(蝙蝠), kb:0, flashT:0, jitT:0, dvx:0, dvy:0

// —— 跳跃块整体替换（engine.js:756-767）——
if (game.input.jumpHit) {
  game.input.jumpHit = 0;
  if (p.onGround || p.coyote > 0) {                    // 地面跳（含土狼）
    p.vy = -PHY.jumpV; p.jbuf = 0; p.coyote = 0;
    p.onGround = false; p.standOn = null;
    p.jumpCut = true;
    game.sfxQueue.push('jump');
    _engAddParts(p.x + 5, p.y + 14, 8, (L.theme && L.theme.dust) || '#ffffff', 55, 220);
  } else if (p.airJumps > 0 && !p.springAir) {         // 二段跳（新鲜边沿直接消费）
    p.vy = -PHY.jumpV * _engDjV; p.airJumps--; p.jbuf = 0;
    p.jumpCut = false;                                  // 固定高度：不吃松手截断
    p.djT = _engDjT;
    game.sfxQueue.push('djump');
    _engFx(p.x + 5, p.y + 12, { ring: 1, r: 3, r1: 15, life: 0.3, color: '#e8f8ff' }); // 白色气环
  } else p.jbuf = PHY.buffer;                           // 无二段跳可用才进缓冲
}
p.jbuf -= dt; p.coyote -= dt;
if (p.onGround) { p.coyote = PHY.coyote; p.airJumps = 1; p.springAir = false; }
if (p.jbuf > 0 && p.coyote > 0) {                    // 缓冲落地跳：条件与原版完全一致，不改
  p.vy = -PHY.jumpV; p.jbuf = 0; p.coyote = 0;
  p.onGround = false; p.standOn = null; p.jumpCut = true;
  game.sfxQueue.push('jump');
  _engAddParts(p.x + 5, p.y + 14, 8, (L.theme && L.theme.dust) || '#ffffff', 55, 220);
}
// 说明：本块只在「空中按跳且无二段跳可用（jbuf 入缓冲）→ 缓冲期内落地/土狼刷新」时触发，
// 与原版语义等价；边沿即时地面跳已在上面的 if (game.input.jumpHit) 块处理。
p.djT -= dt; p.turnT -= dt;

// —— 水平移动块替换（engine.js:740-749 的非冲刺分支）——
// 记录 prevFace 于块首（供转身 squash）：const prevFace = p.face;
if (p.dashT > 0) { /* §B 冲刺三段 */ }
else if (dir !== 0) {
  const turning = _engSign(p.vx) !== 0 && _engSign(p.vx) !== dir;
  if (p.onGround) p.vx += dir * PHY.acc * dt;
  else p.vx += dir * PHY.acc * (turning ? _engAirTurn : _engAirAcc) * dt; // 空中：同向 .75 / 转向 1.5
  p.face = dir;
} else if (p.onGround) {            // 地面摩擦（原逻辑）
  const s = _engSign(p.vx);
  p.vx -= s * (onIce ? PHY.fricIce : PHY.fric) * dt;
  if (_engSign(p.vx) !== s) p.vx = 0;
} else {                            // 空中微阻尼：保留漂移
  const s = _engSign(p.vx);
  if (s !== 0) { p.vx -= s * _engAirDrag * dt; if (_engSign(p.vx) !== s) p.vx = 0; }
}
// 转身 squash / 脚步尘土（限速/传送带块之后）：
if (p.face !== prevFace && Math.abs(p.vx) > 80) p.turnT = 0.12;
if (p.onGround && Math.abs(p.vx) > 60 && p.dashT <= 0) {
  p.stepT -= dt;
  if (p.stepT <= 0) { p.stepT = 0.18;
    _engAddParts(p.x + 5 - p.face * 4, p.y + 13, 1, (L.theme && L.theme.dust) || '#ffffff', 25, 120); }
} else p.stepT = 0;

// —— 弹簧块追加（engine.js:841-843 一带，弹起赋值处）——
p.vy = -PHY.springV; ... 原有 ...
p.airJumps = 1; p.springAir = true;        // 重置但弹跳全程锁定
// —— 踩踏分支追加（engine.js:1070 一带）——
p.airJumps = 1; p.springAir = false;       // 踩踏重置（弹跳免疫截断已有）
// —— _engHurtPlayer 追加（engine.js:397 一带）——
p.airJumps = 1; p.springAir = false;
// —— respawn() 追加 ——
p.airJumps = 1; p.djT = 0; p.turnT = 0; p.stepT = 0; p.springAir = false; p.atkAnim = 0; p.atkWind = 0;

// —— 落地分级（替换 engine.js:829-834 落地反馈块）——
// 先在 Y 轴解算落定处（engine.js:804/806 两处 `p.vy=0` 前）记 p.landVy = p.vy;
if (p.onGround && !wasGround && p.landT <= 0) {
  const big = p.landVy > 300;
  _engAddParts(p.x + 5, p.y + 14, big ? 10 : 4, (L.theme && L.theme.dust) || '#ffffff', big ? 70 : 45, 220);
  p.landT = big ? 0.22 : 0.15;
  if (big) { _engShake(2, 0); game.sfxQueue.push('land2'); }
  else game.sfxQueue.push('land');
  p.jumpCut = false;
}
```

**缓冲落地跳注意**：门禁冒烟（gate.js:95-97）会置 `jump=1;jumpHit=1` 连跑 60 帧——边沿只
消费一次，持键不得二连跳（上述结构天然满足）。落地瞬间 jbuf>0 的补跳沿原语义保留。

## §B 冲刺三段（替换 engine.js:713-721 与 740-742）

```js
if (game.input.dashHit) {
  game.input.dashHit = 0;
  if (p.dashCd <= 0) {
    p.dashCd = 0.8; p.dashT = 0.28;                    // 总时长 0.28（原 0.18）
    p.dashDir = dir !== 0 ? dir : p.face;
    game.sfxQueue.push('dash');
  }
}
// 每步（水平块 dash 分支）：
if (p.dashT > 0) {
  const el = 0.28 - p.dashT;                           // 已流逝秒
  p.face = p.dashDir;
  if (el < 0.05) p.vx = p.dashDir * 60;                // 蓄力（后仰帧由 ui 按 el<0.05 画）
  else if (el < 0.23) {                                // 爆发
    p.vx = p.dashDir * _engDashV;
    p.windT = (p.windT || 0) - dt;
    if (p.windT <= 0) { p.windT = 0.03;
      _engFx(p.x + 5 - p.dashDir * 7, p.y + 4 + Math.random() * 8,
        { vx: -p.dashDir * 90, vy: 0, life: 0.22, color: '#bfeaff', size: 1 }); }
  } else {                                             // 滑行缓冲：260→120 线性
    const k = (0.28 - el) / 0.05;
    p.vx = p.dashDir * (PHY.maxRun + (_engDashV - PHY.maxRun) * k);
  }
}
// 重力减半条件（engine.js:768）：dashT>0 改为「dashT>0 && (0.28-p.dashT)>=0.05 && (0.28-p.dashT)<0.23」
// （仅爆发段减半；蓄力/滑行正常重力）。风柱不吃冲刺（§F）。
```

## §C 攻击时间轴 + 打击感（_engResolveAttack 重写要点）

```js
// 按下（engine.js:706-712 替换）：
if (game.input.attackHit) {
  game.input.attackHit = 0;
  if (p.atkCd <= 0 && p.dashT <= 0) {
    p.atkCd = 0.35; p.atkAnim = 0.25; p.atkWind = 0.05; p.atkT = 0;
    game.sfxQueue.push('swing');                       // 呼啸（原 'slash' 事件废弃，见 §H）
  }
}
// 每步（与其他计时器并列）：
p.atkAnim -= dt;
if (p.atkWind > 0) { p.atkWind -= dt; if (p.atkWind <= 0) p.atkT = _engAtkDur; } // 起手毕→开判定
// 判定框仍 _engAtkW×_engAtkH（18×14，p.atkT>0 期间，_engResolveAttack 入口判定不变）

// —— _engResolveAttack 敌人分支重写（engine.js:665-673）——
for (const e of L.enemies) {
  if (e.dead > 0 || !_engAabb(box, e)) continue;
  const eface = _engSign(e.vx) || e.face || 1;
  const front = (e.type === 'knight') && ((p.x + p.w / 2 > e.x + e.w / 2) === (eface > 0));
  if (front) {                                         // 骑士正面格挡
    e.kb = (p.face) * 120; e.flashT = 0.10;
    game.sfxQueue.push('clank'); _engShake(1, 0.05);
    _engFloat(e.x + 6, e.y - 4, 'GUARD', '#ffffff', 0);
    _engAddStars(e.x + 6 + eface * 5, e.y + 8, 3, '#ffe9b0');
    continue;
  }
  const crit = ((game.combo + 1) % 4) === 0;           // 本击使连击到 4 的倍数 → 暴击
  const dmg = crit ? 2 : 1;
  _engAddCombo();                                      // 连击按命中计（死活都 +1）
  e.hp = (e.hp === undefined ? 1 : e.hp) - dmg;
  if (e.hp > 0) {                                      // 存活：击退+白闪+抖动
    e.kb = p.face * _engKbV; e.flashT = 0.15; e.jitT = 0.15;
    game.hitStop = _engHitStop; _engShake(2, 0.05);
    _engFloat(e.x + 6, e.y - 4, '' + dmg, crit ? '#f8d048' : '#ffffff', crit ? 1 : 0);
    _engAddStars(e.x + 6, e.y + 6, 4 + (Math.random() * 3 | 0), '#ffffff');
    game.sfxQueue.push('hit');
  } else {                                             // 击杀：击飞+死亡弹道
    _engKillEnemy(e);
    e.dvx = p.face * 130; e.dvy = -150;
    game.hitStop = _engHitStop; _engShake(4, 0.05);
    _engFloat(e.x + 6, e.y - 6, crit ? '2' : 'KO', crit ? '#f8d048' : '#ffffff', crit ? 1 : 0);
    _engAddParts(e.x + 6, e.y + 4, 12, e.type === 'bat' ? '#8858c8' : (e.type === 'knight' ? '#c8d0e8' : '#58c848'), 90, 250);
    game.sfxQueue.push('kill');
  }
}
// Boss 分支（engine.js:656-657）：命中后追加 Boss 微退：
if (game.boss && _engAabb(box, game.boss) && _engBossHurt(crit ? 2 : 1)) {
  const b = game.boss, dir = (p.x + 5 < b.x + b.w / 2) ? 1 : -1;
  b.x = _engClamp(b.x + dir * 2, 16, game.level.w * 16 - b.w - 16);   // 被打退 2px
  _engAddCombo(); _engAddCombo();
  _engFloat(b.x + b.w / 2, b.y - 4, '' + (crit ? 2 : 1), crit ? '#f8d048' : '#ffffff', crit ? 1 : 0);
  game.hitStop = _engHitStop; hitEnemy = true; game.sfxQueue.push('hit');
  if (crit) game.sfxQueue.push('kill');
}
// crit 计算提到 Boss 分支之前共用。
// 'B' 木箱碎（engine.js:684-692）：game.coins++ 处追加 _engFloat(tx*16+8, ty*16, '+1', '#f8d048', 0);
//   并 _engShake(2, 0.05)；碎砖 combo+1 保留。
// 击杀震屏 4 不再在踩踏分支重复叠加（踩踏分支 game.shake=3 → _engShake(4,0.05) 统一）。

// —— 敌人更新循环（engine.js:1036-1039 死亡分支 / 存活击退）——
if (e.dead > 0) { e.dead += dt;
  e.x += (e.dvx || 0) * dt; e.dvy = (e.dvy || 0) + 1200 * dt; e.y += e.dvy * dt;  // 击飞弹道（穿地）
  continue; }
if (e.kb) { e.x += e.kb * dt; const s = _engSign(e.kb); e.kb -= s * _engKbFric * dt;
  if (_engSign(e.kb) !== s) e.kb = 0; }               // 击退摩擦（放在正常 AI 位移之后）
e.flashT -= dt; e.jitT -= dt;                          // 白闪/抖动计时
```

史莱姆/蝙蝠 Level 构造字段补 `hp:2 / hp:1`（engine.js:149/152）；`_engHurtPlayer` 里护盾
分支见 §E-I。`_engBossHurt` 内 `game.hitStop = Math.max(game.hitStop, 0.06)` 改 0.10（engine.js:453）。

## §D floats / fxParts / scars / 分级震屏（新引擎设施）

```js
// game 扩展字段（engine.js:270 一带，loadLevel/respawn 复位）：
// floats:[], fxParts:[], scars:[], shakePend:null, ult:{on:false,t:0,fired:false,flashed:false}
// 【粒子所有权修订】game.parts 仍引擎模拟（上限 240）；fxParts/floats/scars 引擎只 push，
// 由 ui 每步推进+修剪（hit-stop/ult 冻结期间也动——这是"冻结期火花仍渲染"的实现）。
// 引擎任何地方不得 filter/splice fxParts/floats/scars。

function _engFloat(x, y, text, color, big) { // 内部：浮动文字（伤害/金币/连击，≤40）
  if (game.floats.length >= 40) game.floats.shift();
  game.floats.push({ x: x, y: y, text: text, color: color, t: 0, life: 0.8, big: big || 0 });
}
function _engFx(x, y, opt) { // 内部：UI 层演出粒子（≤60；ring/shard/star 由 ui 特绘）
  if (game.fxParts.length >= 60) return;
  game.fxParts.push(Object.assign({ x: x, y: y, vx: 0, vy: 0, life: 0.4,
    color: '#ffffff', size: 2, grav: 0 }, opt || {}));
}
function _engAddStars(x, y, n, color) { // 内部：星形火花 4~6 粒（打击感 #8）
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, s = 60 + Math.random() * 70;
    _engFx(x, y, { star: 1, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, grav: 260,
      life: 0.3 + Math.random() * 0.2, color: color, size: 1 }); }
}
function _engShake(m, delay) { // 内部：分级震屏（单槽；大值可覆盖未生效小值）
  if (!game.shakePend || game.shakePend.m <= m) game.shakePend = { m: m, t: delay || 0 };
}
// updateWorld ⑬ 计时块（engine.js:1136 附近）追加：
if (game.shakePend) { game.shakePend.t -= dt;
  if (game.shakePend.t <= 0) { game.shake = Math.max(game.shake, game.shakePend.m); game.shakePend = null; } }
// _engAddParts 加守卫：if (game.parts.length >= 240) return;
// loadLevel 复位：game.floats=[]; game.fxParts=[]; game.scars=[]; game.shakePend=null; game.ult={on:false,t:0,fired:false,flashed:false};
// respawn 复位：game.shakePend=null;（floats/fx 保留自然消散）
```

拾取浮字（updateWorld ②，engine.js:899-901）：金币 `_engFloat(c.x+4,c.y-4,'+1','#f8d048',0)`；
宝石 `'+5'` 金；钥匙 `'KEY'` 金；回复心（drops 分支）`'+1'` 粉 #f8a0b0；连击（_engAddCombo 内
`game.combo>=2` 时）`_engFloat(玩家头顶,'COMBO x'+game.combo,'#f8d048',1)`——同一窗口 0.5s
内只推一条（记 _engComboFloatT 时间戳节流）。

## §E 技能重做（_engUpdateSkills / _engHurtPlayer / updateWorld 顶部）

```js
// —— O 流星连斩（engine.js:614-624 O 分支替换）——
if (inp.skillOHit) { inp.skillOHit = 0;
  if (S.o <= 0 && game.combo >= 8 && !p.dead) {
    S.o = 20; game.combo = 0; game.comboT = 0;
    game.ult = { on: true, t: 0, fired: false, flashed: false };
    game.sfxQueue.push('ult');
  } }

// —— updateWorld 顶部（engine.js:865 hitStop 块之前）插入 ult 块 ——
if (game.ult && game.ult.on) {
  const u = game.ult; u.t += dt;
  if (!u.fired && u.t >= 0.55) {                      // ③ 结算（一次性）
    u.fired = true;
    if (game.boss && _engBossHurt(5))
      _engFloat(game.boss.x + 26, game.boss.y - 4, '5', '#48d8e8', 1);
    for (const e of L.enemies) if (!(e.dead > 0) && _engOnScreen(e)) {
      _engKillEnemy(e);
      e.dvx = (_engSign(e.x - p.x) || p.face) * 150; e.dvy = -170;
      _engFloat(e.x + 6, e.y - 6, 'KO', '#48d8e8', 0);
    }
    for (const b of game.bullets) _engFx(b.x + 4, b.y + 4,
      { vx: Math.random() * 80 - 40, vy: -40, life: 0.3, color: '#f8d048', size: 1 });
    game.bullets = [];
    _engShake(8, 0); game.sfxQueue.push('ult2');
  }
  if (!u.flashed && u.t >= 0.9) { u.flashed = true; game.flashT = 0.1; }   // ⑤ 白闪
  if (u.t < 0.55) return;                             // ①② 时停+斩击期：世界冻结
  if (u.t >= 1.2) game.ult = { on: false, t: 0, fired: false, flashed: false };
}
// 注意：ult 块放在 paused/puzzleActive 检查之后、hitStop 检查之前；
// 现行 O 分支的 hitStop/flashT/shake/清弹幕 语句全部删除（由状态机接管）。

// —— U 星陨（engine.js:605-610 替换）——
if (inp.skillUHit) { inp.skillUHit = 0;
  if (S.u <= 0 && !p.dead) { S.u = 8; p.castT = 0.25; game.sfxQueue.push('meteor');
    const tx = _engSkillTargetX(p), gy = _engGroundY(tx, p.y);
    game.meteors.push({ x: tx - 24, y: -16, vy: 300, w: 10, h: 14, delay: 0.50, ring: gy });
    game.meteors.push({ x: tx - 5,  y: -16, vy: 300, w: 10, h: 14, delay: 0.75, ring: gy });
    game.meteors.push({ x: tx + 14, y: -16, vy: 300, w: 10, h: 14, delay: 1.00, ring: gy }); } }
function _engGroundY(tx, yFrom) { // 内部：tx 列自 yFrom 行向下找首个实心行顶
  const Lv = game.level, col = Math.floor(tx / 16);
  for (let ty = Math.max(0, Math.floor(yFrom / 16)); ty < Lv.h; ty++)
    if (Lv.solid(col, ty, game.switchState)) return ty * 16;
  return (Lv.h - 1) * 16;
}
// ⑨″ 陨石循环改造（engine.js:1084-1096）：
//   delay>0：ui 按 m.ring 画瞄准圈（引擎不动）；
//   下落中：m.trail=(m.trail||0)-dt; ≤0 时 _engFx(m.x+5,m.y+2,{vy:-30,life:0.25,color:'#f8d048',size:1}) 并 m.trail=1/30;
//   Boss 撞击：_engBossHurt(1) → _engBossHurt(2)，命中推 _engFloat(...,'2','#48d8e8',0)；
//   boom：粒子 12→16 + 横向尘 6（_engAddParts(...,'#d8d0c0',60,80)）；
//          scars.push({x:m.x+5,y:m.y+12,t:0}) 且超 8 条 shift；_engShake(3,0)。

// —— I 护盾（engine.js:611-613 + _engHurtPlayer engine.js:395）——
// 施放：p.shieldT = 3.0; p.shieldHp = 2;（其余照旧）
// _engHurtPlayer 顶部替换：
if (p.invT > 0) return false;
if (p.shieldT > 0) {                                  // 护盾吸收（原样挡伤，新增裂纹/破碎）
  p.shieldHp--; _engShake(2, 0); game.sfxQueue.push('shieldhit');
  if (p.shieldHp <= 0) _engShieldBreak();
  return false;
}
function _engShieldBreak() { // 内部：破盾事件（击穿或到期共用）
  const p = game.player; if (!p || p.shieldT <= 0 && p.shieldHp !== 0) { /* 到期调用见下 */ }
  p.shieldT = 0; p.shieldHp = 0;
  game.sfxQueue.push('shieldbreak');
  for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283;
    _engFx(p.x + 5 + Math.cos(a) * 10, p.y + 7 + Math.sin(a) * 10,
      { shard: 1, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90 - 50, grav: 300,
        life: 0.5, color: i % 2 ? '#bfeaff' : '#ffffff', size: 1 }); }
}
// _engUpdatePlayer 计时处：if (p.shieldT > 0) { p.shieldT -= dt;
//   if (p.shieldT <= 0) { p.shieldT = 0; _engShieldBreak(); } }   // 自然到期也碎
```

## §F 新机关引擎语义（本波实装；任何关卡未引用，空转必须零副作用）

```js
// Level 构造 switch 新增四 case（engine.js:142-175 一带；全部提取后网格换 '.'）：
case 'w': break;   // 上升气流是纯区域瓦片：保留在网格（与 '#'/'^' 同为瓦片语义），不提取
case 'e': this.portals.push({ x: px + 2, y: py - 8, w: 12, h: 24, cd: 0, partner: null });
          this.tiles[y][x] = '.'; break;             // 碑式锚定同 'c'
case 'A': this.enemies.push({ type: 'knight', x: px + 2, y: py - 2, w: 12, h: 18, hp: 3,
          vx: -20, vy: 0, hx: px + 2, hy: py - 2, dead: 0, t: phase, grounded: false,
          kb: 0, flashT: 0, jitT: 0, dvx: 0, dvy: 0, face: -1 }); this.tiles[y][x] = '.'; break;
case 'H': this.pends.push({ ax: px + 8, ay: py + 8, len: 48, phase: (x * 0.9 + y * 1.1) % 6.283 });
          this.tiles[y][x] = '.'; break;
// 构造末尾（电锯轨道扫描后）：传送门配对——按 (x,y) 字典序排序后两两相邻
this.portals.sort(function (a, b) { return a.x - b.x || a.y - b.y; });
for (let i = 0; i + 1 < this.portals.length; i += 2) {
  this.portals[i].partner = this.portals[i + 1]; this.portals[i + 1].partner = this.portals[i]; }
// Level 字段初始化：this.portals = []; this.pends = [];（constructor 顶部与其他实体数组并列）

// updateWorld ⓪ 之后、① 拉杆之前插入传送门块：
for (const pt of L.portals) {
  pt.cd -= dt;
  if (pt.cd <= 0 && pt.partner && !p.dead && _engAabb(p, pt)) {
    const q = pt.partner;
    _engFx(pt.x + 6, pt.y + 12, { ring: 1, r: 3, r1: 16, life: 0.3, color: '#8ea0ff' });
    p.x = q.x + (q.w - p.w) / 2; p.y = q.y + q.h - p.h - 4;    // 保留 vx/vy
    pt.cd = 0.6; q.cd = 0.6;
    _engFx(q.x + 6, q.y + 12, { ring: 1, r: 3, r1: 16, life: 0.3, color: '#8ea0ff' });
    game.sfxQueue.push('portal');
  }
}

// ⑩ 玩家物理之后（危险判定之前）插入上升气流块：
let inWind = false;
_engRectTiles(L, p.x + 1, p.y + 2, p.w - 2, p.h - 3, function (tx, ty, ch) { if (ch === 'w') inWind = true; });
if (inWind && p.dashT <= 0) {
  p.vy -= _engWindUp * dt;                            // 与重力合成净 -400px/s²
  if (p.vy < -_engWindCap) p.vy = -_engWindCap;
}

// ⑨ 敌人循环 knight 分支（slime 同构：重力/地面/边缘掉头，速度 20）：
if (e.type === 'knight') { /* 复制 slime 的竖直/水平解算段，速度用 e.vx（±20）；
  e.face = _engSign(e.vx) || e.face; */ }
// 踩踏改造（engine.js:1068-1077 通用分支）：
if (p.vy > 60 && p.y + p.h - e.y < 9) {
  if (e.type === 'knight' && e.hp > 1) {              // 骑士踩踏扣 1 不秒杀
    e.hp--; e.flashT = 0.15; _engFloat(e.x + 6, e.y - 4, '1', '#ffffff', 0);
    _engShake(2, 0.05); game.sfxQueue.push('hit');
  } else { _engKillEnemy(e); e.dvx = 0; e.dvy = -120; _engShake(4, 0.05); game.sfxQueue.push('kill');
    _engFloat(e.x + 6, e.y - 6, 'KO', '#ffffff', 0); }
  p.vy = -250; p.jumpCut = false; p.airJumps = 1; p.springAir = false;
  _engAddCombo(); game.sfxQueue.push('stomp');
  _engAddParts(e.x + 6, e.y + 4, 10, e.type === 'bat' ? '#8858c8' : '#58c848', 70, 250);
} else _engHurtPlayer(e.x + e.w / 2);                 // 身体接触（含骑士）→ HP 伤害

// ⑨′ Boss 之后插入吊灯摆锤块：
for (const w of L.pends) {
  w.t += dt;
  const ang = Math.sin(w.t * 2.6 + w.phase) * (70 * Math.PI / 180);
  const bx = w.ax + Math.sin(ang) * w.len, by = w.ay + Math.cos(ang) * w.len;
  if (!p.dead) { const nx = _engClamp(bx, p.x, p.x + p.w), ny = _engClamp(by, p.y, p.y + p.h);
    const dx = bx - nx, dy = by - ny;
    if (dx * dx + dy * dy < 49) _engHurtPlayer(bx); }   // r=7 vs 矩形最近点；HP 伤害非即死
  w.ang = ang; w.bx = bx; w.by = by;                    // 供 ui 渲染（只读）
}
```

## §G 装饰兜底（engine.js:52-57）
`_engDecorFallback` 追加三键（供第二波新主题在桩环境用）：
`wind:['tallgrass','flower','pinwheel'], castle:['torch','urn','boulder'], star:['crystal','chain','urn']`。

## §H sfx 事件增删（只 push 不发声）
- 新增：`'swing','hit','kill','djump','land2','shieldhit','shieldbreak','clank','portal','ult2'`。
- 废弃：攻击按下处原 `'slash'`（改为 'swing'）。'ult' 保留（释放时）。其余事件名全部不变
  （ui 侧 SFX.slash 旧表保留无害）。

## §M CONTRACT 附记（追加到 docs/CONTRACT.md 末尾，只增不改）
内容要点（手感队照此措辞录入）：
1. 瓦片/实体字符表追加：`w 上升气流区(非实心,玩家专属)  e 传送门(实体,按(x,y)排序两两配对)
   A 骑士盔甲敌(12×18,hp3,正面格挡)  H 吊灯摆锤(锚实体,上方须实心)`。
2. engine 新字段：`game.floats/fxParts/scars/shakePend/ult`、`Level.portals/pends`、
   玩家 `airJumps/djT/turnT/stepT/landVy/springAir/atkAnim/atkWind/windT`、
   敌人 `hp/kb/flashT/jitT/dvx/dvy/face`。
3. 粒子所有权修订：`game.parts` 上限 240（引擎模拟）；`game.fxParts`(≤60)/`game.floats`(≤40)/
   `game.scars`(≤8) 引擎只写、ui 推进渲染（hit-stop/ult 冻结期间照常推进）。
4. sfx 事件表追加 §H 清单。
5. `_engHitStop` 0.10；连击按命中计数；骑士/吊灯伤害走 `_engHurtPlayer`（HP 伤害）。

## §N 自测断言（全部真实执行，结果贴交付说明）
1. `node --check engine.js` 通过。
2. `node tools/gate.js engine` 退出码 0（七关全部 `OK ... 帧稳定` + Boss/谜题冒烟）。
3. 新建 `tools/_v5_feel_test.js`（node 直跑，桩环境同 gate.js:80-86），断言：
   a) 二段跳：L1 载入→清 input→`jump=1` 1 帧落地起跳后空中（`onGround=false` 且 `vy<-100` 时）
      再 `jumpHit=1` 一帧 → `p.airJumps===0` 且 `p.vy < -290`；落地（y 追平地面）后 `airJumps===1`。
   b) 弹簧锁：把玩家放到 L1 弹簧(33,H-2) 上方下落触发 `vy=-520`，随即 `jumpHit=1` →
      `airJumps===1`（未消耗）且 `vy` 仍 <-500；落地后 `springAir===false`。
   c) 暴击与击退：L1 史莱姆旁 `attackHit=1` 连打到死：第一击后 `e.hp===1`、`e.kb!==0`、
      `e.flashT>0`；`game.combo=3` 时再命中 → 数字分支 crit（可断言 `e.dead>0` 一击毙）。
   d) O 演出：`combo=8; skills.o=0; skillOHit=1` → `game.ult.on===true`；跑 40 帧（t≈0.66）
      → `ult.fired===true`、屏内敌 `dead>0`；跑满 74 帧 → `ult.on===false`；期间
      0~33 帧 `game.time` 不增（冻结）而 34 帧后恢复。
   e) U 瞄准圈：`skillUHit=1` → 三流星 `delay` 为 0.50/0.75/1.00 且 `ring` 为地面 y。
   f) I 破盾：`skillIHit=1` 后连续两次 `_engHurtPlayer(0)` 等价输入（用敌人碰撞或直接调
      内部不可行——改由：置玩家于 L1 史莱姆上接触两次）→ 第二次后 `shieldT===0` 且
      sfxQueue 含 'shieldbreak'。
   g) 容量：连放两次 O + 30 次攻击命中后 `parts.length<=240 && fxParts.length<=60 && floats.length<=40`。
   h) 空转零副作用：L1~L7 各 120 帧空转 + 60 帧右移跳（复刻 gate）无异常，`portals/pends`
      在旧七关全部为空数组。
4. 回归：`node tools/gate.js levels` 仍绿（本波不改 levels.js）。
5. `git diff --stat` 证明只改 engine.js（+tools/_v5_feel_test.js 新增 +CONTRACT.md 追加）。

## 验收标准
- §N 全绿；未改 levels.js/art.js/ui.js/gate.js/index.html 任何一行；
- 所有新增行为在七旧关上表现向后兼容（旧关难度不变或仅因二段跳变易——这是设计意图）。
