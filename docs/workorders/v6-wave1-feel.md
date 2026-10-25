# 工单 · 手感队（第一波）：下坠手感 / BAL 总表 / 技能4 / 敌人技能 / 装备注入接口（engine.js + levels.js 3 处 set）

> 所有权：**只许改 `pixel-quest/engine.js`**，外加本工单 §L 明确授权的 `pixel-quest/levels.js` 3 处 `set('Y')`（唯一例外，见下）。
> 设计基准：`docs/specs/2026-10-24-v6-design.md`（下称"设计书"）+ `docs/specs/2026-10-24-v6-balance.md`（下称"平衡表"，数值以其 §0 `BAL` 结构为唯一权威）。
> 现状行号基于本轮核对：engine.js 1475 行 / levels.js 709 行。
> 依赖接口（已核对）：`PHY`(engine.js:130)、`_engMkPlayer`(:382)、`respawn`(:424)、`_engHurtPlayer`(:503)、
> `_engKillEnemy`(:523)、`_engMkBoss`(:533)、`_engUpdateBoss`(:597)、`_engUpdateSkills`(:729)、
> `_engResolveAttack`(:780)、`_engUpdatePlayer`(:861，重力块 :983-986)、`updateWorld`(:1080)。
>
> **硬约束（违背即验收失败）**：
> H1 门禁全绿：`node tools/gate.js engine` **且** `node tools/gate.js levels`（因 §L 动 levels）退出码 0；`node --check engine.js` 通过。
> H2 存档兼容：engine 不触碰 localStorage（现状保持）。
> H3 容量守卫不回退：parts≤240/floats≤40/fx≤60/scars≤8，新代码只走 `_engAddParts/_engFloat/_engFx`。
> H4 第一波结束游戏完整可玩：`game.equip/gearDrops/pickups/bagActive` 缺省时全部空转零副作用（波2 才启用装备）。
> H5 CONTRACT §0：顶层零 DOM/音频/键盘；新内部符号 `_eng` 前缀注「内部」；新契约导出仅 `BAL`（附记 v6）。
> H6 行为零变化自证：BAL 收编替换后，L1~L10 空转 120 帧+右移起跳 60 帧的玩家 (x,y) 与替换前**逐帧一致**（§N.3 断言；唯一允许差异=PHY 换算项 §A）。
> H7 完成后在 docs/CONTRACT.md 末尾追加「附记（v6 手感，手感队录入）」（§M 全文）。

## 任务清单（按序）

1. §A PHY 换算 + 速降（下坠手感）
2. §B `const BAL` 顶层落地 + 全量硬编码替换（H6 自证）
3. §C 玩家装备注入接口（读 `game.equip`，maxHp/ATK/effRun/cdMul）
4. §D 技能4 星刃回旋（L 键）
5. §E 四类敌人技能（slime/bat/knight/mage ai 状态机 + 'Y' 提取 + 火球）
6. §F Boss/掉落/经济收编（零行为变化）
7. §G game 新字段与 loadLevel/respawn 复位
8. §L levels.js 3 处 'Y' 摆放（唯一授权例外）
9. §M CONTRACT 附记 v6 + §N 自测脚本 `tools/_v6_feel_test.js`

---

## §A PHY 换算 + 速降（设计书 §1，数值表见平衡表 §F）

```js
// engine.js:130-134 替换：
const PHY = {
  grav: 1320, maxFall: 285, acc: 1400, fric: 1800, fricIce: 180,
  maxRun: 120, jumpV: 309, springV: 488,
  coyote: 0.12, buffer: 0.18
};
// 派生替换（竖直速度等比 k=0.9381，推导见平衡表 §F）：
//   engine.js:1356 踩踏反弹 -250 → -BAL.player.stompBounce(-235)
//   engine.js:514 受击 vy=-140  → -BAL.player.hurtKbY(-131)
//   二段跳 -303.6 自动随 jumpV（:965/-309*0.92=-284.3，_engDjV 不动）
// 速降（engine.js:983-986 重力块替换）：
{
  const dashEl = p.dashT > 0 ? _engDashDur - p.dashT : -1;
  const g = PHY.grav * (dashEl >= 0.05 && dashEl < 0.23 ? _engDashGrav : 1);
  const cap = (!p.onGround && game.input.down) ? BAL.fall.fast : PHY.maxFall; // 按住↓=360
  p.vy = Math.min(p.vy + g * dt, cap);
}
// game.input 新增字段 down:0（:356 input 对象追加；ui 波1 桥接写入，读缺省 0 安全）
```

## §B BAL 总表 + 全量替换

- 顶层（PHY 之后）新增 `const BAL = {...}`，**逐字照抄平衡表 §0**（含中文注释与推导索引）；不得增删键、不得改值。
- 按平衡表 §X 清单逐行号替换硬编码为 BAL 引用；未列数值收编键名但值不动（acc/fric/coyote/buffer/camera 等）。
- 替换后跑 §N.3 逐帧一致断言（PHY 换算项除外——该项用 §N.1 断言新值）。

## §C 装备注入接口（读侧，波2 bag 写入）

```js
// game 新字段（:348 game 对象追加；波1 恒默认值）：
equip: { atk: 0, hp: 0, spd: 0, cd: 0 }, cdMul: 1,
// 消费点：
// 1) _engMkPlayer(:389) 与 respawn(:431)：hp/maxHp
//    p.maxHp = BAL.player.hpBase + (game.equip ? game.equip.hp : 0);  p.hp = p.maxHp;
//    respawn：p.hp = p.maxHp; p.invT = BAL.player.respawnInvT;
//    心拾取(:1414)：p.hp = Math.min(p.maxHp, p.hp + BAL.econ.heartHeal);
// 2) 普攻伤害(:784-786)：const ATK = BAL.player.atkBase + (game.equip ? game.equip.atk : 0);
//    const dmg = crit ? ATK * BAL.player.critMul : ATK;   // 后续分支沿用 dmg
// 3) 限速(:941 两处 clamp 与 :944 传送带上限 170 不动)：
//    const effRun = PHY.maxRun * (1 + (game.equip ? game.equip.spd : 0));
//    if (p.dashT <= 0) p.vx = _engClamp(p.vx, -effRun, effRun);
// 4) 技能 CD 写入(:732/:740/:746 与 §D L)：S.x = BAL.skills.x.cd * game.cdMul;
```

## §D 技能4 星刃回旋（完整伪代码=设计书 §2.2，逐行照抄）

- `game.skills` 初始 `{u,i,o,l:0}`（:366/:414/:1471-1473 四处同步加 l）；`game.input.skillLHit:0`（:356）。
- `game.blades:[]`（新字段；loadLevel/respawn 清空）。
- `_engUpdateSkills` 追加 L 分支 + `updateWorld` ⑨″ 后新增 ⑨⁗ 星刃推进/判定块——**全部照抄设计书 §2.2 代码段**，其中回程正面判定用当帧行进向：`const bdir = _engSign(bl.x - prevBlx) || bl.dir;`（prevBlx 在位移前快照）。
- 交互定死：不 hit-stop、不震屏；骑士 front 判定 `(bdir > 0) === (eface > 0)`；Boss 一程一伤固定 2；斩碎弹幕（含 fire 火球）无连击。
- sfx：掷出 `'blade'`；命中 `'hit'`；击杀 `'kill'`；格挡 `'clank'`（均 push）。

## §E 四类敌人技能（设计书 §3 全文照抄，要点重申）

```js
function _engMkAI(type) { // 内部：v6 敌人技能状态机初值（cd 相位错开确定性）
  const base = { slime: 3.2, bat: 4.0, knight: 5.0, mage: 3.5 }[type] || 3;
  return { st: 'idle', t: 0, cd: 0, cd0: base, tx: 0, ty: 0 };
}
// 1) Level 构造 W/F/A spawn(:202/:206/:239) 与 'Y' 新 case 一并给 e.ai = _engMkAI(e.type)；
//    Boss summon 史莱姆(:633-636) 同样补 ai。
// 2) respawn 敌人复位循环(:446-450) 追加：if (e.ai) e.ai = _engMkAI(e.type); e.guardDown = false;
// 3) 敌人循环(:1302-1362) 内、kb 摩擦(:1339) 之前插 _engEnemySkill(e, dt, L, p)（内部函数）：
//    四类状态机逐行照设计书 §3.1-§3.4 表实现；触发条件/时长/速度/CD 全取 BAL.enemy.*.skill；
//    蝙蝠 aim 段冻结巡逻（跳过 :1334-1336 的位移）、dive 段直线、back 段朝 (ax,ay) 120；
//    骑士 charge 段覆盖 e.vx（巡逻掉头逻辑照常可能翻转 dir——charge 期间跳过掉头判定）；
//    mage 站桩：不掉头、face=sign(player 中心-自身中心)。
// 4) 火球：bullets 滤池(:1292-1299) 内追加 home 追踪与 life 过期两段（设计书 §3.4 代码照抄）。
// 5) sfx：读条 'mage'；压顶跳/俯冲/冲锋发动复用既有（'roar' 不用）；发射 'shot'。
```

- **空转零触发自证**（H4）：触发全为距离条件；写 §N.4 断言空转 180 帧所有 `e.ai.st==='idle'`（L1 出生点距最近敌 >56px 成立；若某关出生点 90px 内有蝙蝠，断言放宽为"无 dive 位移"——以实测为准，先跑后写）。

## §F Boss/掉落/经济收编

- Boss 全字面量→`BAL.boss`（平衡表 §B 行号清单）；`_engBossDur`(:548) 读 `BAL.boss.windup/p2WindMul`。
- `_engKillEnemy`(:523) 心概率/掉落重力→`BAL.econ`；金币/宝石/谜题面额→`BAL.econ.coin/gem/puzzle`（engine.js:1164-1167/:483/:850）。

## §G game 新字段与复位总表

| 字段 | init | loadLevel | respawn | 说明 |
|---|---|---|---|---|
| input.down / input.skillLHit | 0 | 清 0（:438-439 追加） | 清 0 | ui 写/engine 消费 |
| skills.l | 0 | 0 | 保留 | CD |
| blades[] | [] | 清空 | 清空 | §D |
| equip/cdMul | 默认/1 | **不重置**（ui 管） | 不重置 | 波2 写入 |
| gearDrops[]/pickups[]/bagActive | []/[]/false | 清空/false | 清空 | 波2 用；波1 空转 |
| updateWorld 顶部(:1082 后) | `if (game.bagActive) return;` | — | — | 与 puzzleActive 同位（波1 实装字段，波2 启用） |

## §L levels.js 3 处 'Y'（唯一授权例外）

- 理由：任务书 §三要求幽焰法师出场于城堡/回廊关，但 v6 所有权表无 levels 队——本工单授权手感队**仅做下列改动**（设计书 §3.4/§11 风险 1）：
```js
// levels.js L9 build 内（骑士走廊段 :424 之前）追加：
g.set(42, H-2, 'Y');      // 骑士走廊入口（支撑=ground(39,58,H-1) 顶行 H-1；骑士在 44——先法师后骑士）
// L9 王座厅段（:446-447 之间）追加：
g.set(116, H-7, 'Y');     // 王座台上（支撑=fill(114,H-6,118,H-5) 顶行 H-6；顶棚 H-9 不冲突）
// L10 星空之巅段（:473 之后）追加：
g.set(101, H-7, 'Y');     // 星空之巅（支撑=ground(95,109,H-6) 顶行 H-6；避开 x=99 竖锯/x=105 骑士）
```
- 备用位：若 `gate levels` 因 (42,H-2) 报警（不应发生，实心支撑存在），改摆 `g.set(91,H-2,'Y')`（L9 大厅②，骑士 88 与检查点 93 之间）并留注释；**两处二选一，不得都摆**。禁摆石柱位 46-47/50-51/55-56（fill 已占用）。
- 同步在 validateLevels 的 'A' 支撑断言处（levels.js:633）把 'Y' 纳入同口径断言（下方 2 格内须 STAND）。
- 除上述外 levels.js 零改动；`node tools/gate.js levels` 必须仍绿。

## §M CONTRACT 附记 v6 全文（追加到 docs/CONTRACT.md 末尾，只增不改）

```
## 附记（v6 手感+装备，2026-10-25 · 手感队/装备引擎队录入）

> 依据：docs/specs/2026-10-24-v6-brief.md 与 docs/specs/2026-10-24-v6-design.md。
> 本附记只增不改上文任何条款（v4/v5 先例）。

### engine.js 新契约导出（第 3 节追加）
- `const BAL` —— 全数值总表（docs/specs/2026-10-24-v6-balance.md §0 为唯一权威）。

### PHY 例外记录
- v6 任务书指定 maxFall 360→285（−20.8%，超出第 3 节"±15%"微调带）、grav 1500→1320、
  jumpV 330→309、springV 520→488（等高换算 k=√0.88）；键名不变。

### 瓦片/实体字符表（第 2 节追加）
Y 幽焰法师(12×18,hp2,站桩读条火球,下方2格内须支撑,城堡/回廊关)

### engine.js 新字段（沿「扩展字段」先例）
- game：blades[]（星刃实体）、gearDrops[]（波2 装备掉落实体）、pickups[]（拾取事件，ui 消费）、
  bagActive（背包开启冻结，同 puzzleActive 位）、equip{atk,hp,spd,cd}（ui 写入，默认全 0）、
  cdMul（=1-equip.cd）、input.down、input.skillLHit、skills.l。
- 玩家：maxHp（=5+equip.hp）。
- 敌人：ai{st,t,cd0,...}（技能状态机）、guardDown（骑士破绽）。
- sfx 追加：'blade','mage','pickup'（波2）。

### 敌人技能语义（设计书 §3）
- 史莱姆弹跳压顶/蝙蝠俯冲撕咬/骑士盾击冲锋(+0.7s 破绽 guardDown 正面失效)/法师读条火球
  （追踪弹 fire:true, home 计时, 可斩碎）；全部前摇 ≥0.5s，伤害统一走 _engHurtPlayer。
```

## §N 自测（新文件 `tools/_v6_feel_test.js`，node 无 DOM 环境，参照 tools/_v3_boss_fight_test.js 装载法）

1. PHY 断言：`PHY.grav===1320 && PHY.maxFall===285 && PHY.jumpV===309 && PHY.springV===488 && BAL.fall.fast===360`。
2. 跳高不变：L1 空地起跳，逐帧记录最高点 `jumpV²/(2·grav)` 像程误差 ≤1px（36.18px±1）。
3. 收编零回归：BAL 替换前后（用 git/备份对照跑）L1~L10 `空转120帧+右移60帧` 玩家 (x,y) 逐帧一致（PHY 换算导致的竖直差异除外：允许 y 轴差、x 轴必须一致）。
4. 敌 AI 空转：L1~L10 空转 180 帧无异常、无 NaN；`e.ai` 存在于全部 W/F/A/Y 实体。
5. 技能 L：L7 注入 `skills.l=0; input.skillLHit=1` → blades 出现；去程 160px 后回程；2.6s 内必消失；命中敌 combo+1；Boss 承伤 2/程。
6. 火球：合成 'Y' 关（照 tools/_v4_puzzle_smoke.js 追加假关）玩家近距触发 → 读条 0.8s 后 bullets 含 fire:true；斩碎分支生效。
7. 速降：空中 `input.down=1` 时 vy 上限 360、否则 285。
8. 装备空转：`game.equip` 缺省时 loadLevel/respawn/攻击/技能全路径无异常（H4）。
9. 门禁：`node tools/gate.js engine && node tools/gate.js levels` 退出码 0。

交付说明须含：以上 9 项逐条运行结果 + `node --check engine.js` 输出。
