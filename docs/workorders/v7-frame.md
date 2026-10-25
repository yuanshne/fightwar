# 工单 · 框架队（v7）：章节聚合引擎侧 + Boss 参数化 + 新敌/新机关 + gate 章节化

> 所有权：**只许改 `pixel-quest/engine.js`、`pixel-quest/tools/gate.js`、`pixel-quest/index.html`，新建 `pixel-quest/tools/_v7_chapter_check.js`**。
> 设计基准：`docs/specs/2026-10-24-v7-design.md`（下称"设计书"，§引用均指它）。
> 前置依赖：平衡队会往 levels.js 落地 `CHAPTERS/ALL_LEVELS/aggregateLevels`（设计书 §1.2 逐字）——**你只读不写 levels.js**；
> 你写的引擎读侧有缺省回退（§1.3），即使平衡队未合入，`node tools/gate.js engine` 也必须全绿（此时 ALL_LEVELS 桩注入见门禁改造）。
> 现状行号基于 engine.js 1963 行 / gate.js 195 行 / index.html 31 行（按符号定位，行号会随施工平移）。
>
> **硬约束（违背即验收失败）**：
> H1 门禁全绿：`node tools/gate.js engine`、`node tools/gate.js levels`、`node --check engine.js`、`node --check tools/gate.js` 退出码 0；
>    `tools/_v6_feel_test.js` 与 `tools/_v6_loot_test.js` 全项仍过（R8 零回归）。
> H2 存档兼容：engine 不碰 localStorage；新字段（boss.kind/enemy.elite/Level.chests/lanterns）全部缺省安全（空转零副作用）。
> H3 容量守卫不回退（R5）：新粒子/浮字全走 `_engAddParts/_engFloat/_engFx/_engShake`；gearDrops 池守卫 `_engGearCap=6` 复用。
> H4 **Boss 参数化禁止 copy-paste（R4）**：蛟龙/判官与星核巨兽共用同一 `_engUpdateBoss` 状态机；差异只来自
>    `BAL.boss2/BAL.boss3` 参数表与 §6.3 三个新状态 case。出现第二份 Boss 状态机 switch 即失败。
> H5 kind1 零行为变化：`BAL.boss` 追加键=现行硬编码逐字收编（§8 表）；`_v6_loot_test.js` L7 Boss 掉落采样必须原样通过。
> H6 确定性：新敌 AI 全距离触发+CD 相位（`_engMkAI` 复用），无随机；门禁空转（120 静止+60 右移）零触发零死亡。
> H7 CONTRACT 只增不改：附记 v7 已由设计师录入（docs/CONTRACT.md 末尾），你核对实现与附记一致即可，**无新增附记**。
> H8 并行红线：不碰 art.js/ui.js/levels.js/chapter*.js；六队同时施工，你的门禁自测只覆盖自己的改动路径。

## 任务清单（按序施工；伪代码=规格，不得自由发挥）

### 1. index.html 加载顺序（设计书 §1.1）

`<script src="levels.js">` 之后、`<script src="engine.js">` 之前插入两行：
```html
<script src="chapter2.js"></script>
<script src="chapter3.js"></script>
```
（文件未交付时浏览器静默跳过，无需守卫。）`#tip` 底栏文字追加「B 背包」提示（可选，一行）。

### 2. engine.js 读侧（设计书 §1.3，两行）

Level 构造 `const meta = LEVELS[idx]`（engine.js:233）→ `const meta = ALL_LEVELS[idx] || LEVELS[idx];`

### 3. BAL 落地（设计书 §8 逐字；只增不改既有键值）

- `BAL.boss` 追加 7 键（w/h/drop1/drop2/summon/poolNear/poolFar/p2Add）+ `BAL.boss.barrage.deg:[-8,8]`——
  全部为现行硬编码收编（52×48 尺寸在 `_engMkBoss`、池在 `_engBossPick`:691-692、deg 在 barrageFire:803、召唤在 windup:776-780、掉落表名在 `_engBossHurt`:714/716）。
- 新增顶层键 `BAL.boss2`、`BAL.boss3`、`BAL.enemy.lancer/jelly/ghost/boomer`、`BAL.elite`、`BAL.flow`、`BAL.gear` 六表、`BAL.econ.chestGem:5`——逐字照抄设计书 §8 代码块，注释保留推导索引。

### 4. Boss 参数化改造（设计书 §6；H4/H5 核心）

1. `_engBossTable(kind)`（§6.1 三行）。
2. `_engMkBoss(cx, py, kind)`：`const T=_engBossTable(kind)`；`w:T.w,h:T.h,y:py+_engTile-T.h,hp/maxHp:T.hp`，实体加 `kind:kind, hidden:false`。`loadLevel`（:505）按 §6.1 kind 推导（`meta.boss===true?1:meta.boss||0`）。
3. `_engUpdateBoss/_engBossHurt/_engBossPick/_engBossDur/_engBossPhysX/_engBossNovaRing` 全部 `BAL.boss.*` 读取改 `T.*`（函数头 `const T=_engBossTable(b.kind||0)`）：
   - `_engBossPick`：池改 `T.poolNear/T.poolFar`（adx≤200 判定保留），P2 `pool.concat(T.p2Add)`，alive≥2 过滤 summon 与 lastPattern 过滤保留；
   - `barrageFire`：散射角 `for (const off of T.barrage.deg)`；轮数/间隔/尾时长读表；
   - `leapAir`：`T.leap.T/vy/clamp`；落地波速沿用现行 `(b.phase===2?115:90)`；
   - `chargeRun`：`T.charge.*`；`idle`：`T.idleT[T 相位]/T.walk`；
   - `_engBossHurt`：免伤五态追加 `|| (b.state==='blinkCast' && b.hidden)`；dying 掉落两处改
     `_engRollTier(BAL.gear[T.drop1])`/`BAL.gear[T.drop2]`；P2 线 `T.p2At`；`dying` 时长 `T.dying`；
   - 接触伤害块追加 `&& !(b.state==='blinkCast'&&b.hidden)`。
4. `_engBossSummon(T)`（§6.2 逐字）替换 windup summon 分支内联构造（kind1 表 `{type:'slime',n:2,off:[-40,40]}`；
   工厂 `_engMkEnemy` 产出为现行史莱姆字段超集——slime 路径不消费多出的字段，行为等价，H5 由 `_v6_loot_test.js` 采样复核）。
5. 新状态三 case `sweepCast/blinkCast/scytheCast`（§6.3 逐字）+ windup 三个 next 分支（前摇 `_engBossDur(name,phase)` 天然查表）+
   `recover` 表按招名取（现行写法已是 `BAL.boss.recover[b.next]`→`T.recover[b.next]`）。

### 5. 新敌工厂与提取（设计书 §5.0/§5.1-§5.4）

- `_ENG_ENEMY_DEF` + `_engMkEnemy(type,px,py,elite)`（§5.0 逐字；注意 `t` 相位公式与既有 spawn 一致）。
- Level 提取 switch 追加六 case：'N'/'J'/'T'/'E'/'x'/'z'（§5.0 代码块逐字；全部 `this.tiles[y][x]='.'`）。
- 敌人循环（:1593）地面分支条件追加 `|| e.type==='lancer' || e.type==='boomer'`；
  蝙蝠巡逻分支（:1618-1622）`e.y=e.ay+Math.sin(e.t*(e.frq||2.2))*(e.amp||7)`（蝙蝠无 amp/frq 字段→行为不变）。
- `_engEnemySkill` 追加四分支（§5.1 枪虾/§5.2 水母/§5.3 幽灵/§5.4 魂火——逐字；幽灵 active 分支**必须**每帧钳位
  `e.x=_engClamp(e.x,0,L.w*_engTile-e.w); e.y=_engClamp(e.y,-8,L.h*_engTile-e.h)`，设计书 §12-3 裁决）。
- 水母放电判定放 jelly 分支 shock 态内（中心距≤`sk.ring` 且 `!p.dead` → `_engHurtPlayer`）。

### 6. 精英规则（设计书 §5.5）

- `_engKillEnemy` 追加 elite 必掉分支（§5.5 代码逐字，池守卫 H3）。
- `_engResolveAttack` 击退 `e.kb = p.face * _engKbV * (e.elite ? BAL.elite.kbMul : 1)`（存活分支 :1088；星刃分支 :1053 同式）。
- 踩踏 :1634 条件改 `if ((e.type === 'knight' || e.elite) && e.hp > 1)`。

### 7. 新机关（设计书 §4）

- 'G' 隐藏砖：solid() 追加 `'G'` 恒实（:411 分支内并列）；`_engResolveAttack` 的 `_engRectTiles` 回调（:1113-1123）追加 'G' 分支（§4.2 逐字，注意**无金币**只震屏+粒子+连击+sfx 'break'）；星陨 AoE 扫描（:1682-1684）字符判断追加 `|| 'G'`（碎后置 '.'，无金币）。
- 'g' 宝箱：Level 提取 case（§4.3）+ `chests:[]` 初始化 + updateWorld 开启循环（放在 ⓪ 神龛接近检测之后、① 拉杆之前；§4.3 逐字）。
- 'R' 灯笼：Level 提取 case（§4.4）+ `lanterns:[]` 初始化。纯数据零行为。
- '{'/'}' 水流：updateWorld ⑩″ 风柱块（:1779-1783）之后追加 ⑩‴（§4.1 逐字）。

### 8. 杂项

- `_engDecorFallback`（:95-103）追加 `sea:['coral','shell','kelp'], nether:['ghostflame','bone','skull']`。
- `loadLevel` 复位段追加 `game.boss.kind` 已由 `_engMkBoss` 携带；宝箱/灯笼为 Level 实例字段（随 new Level 重建，respawn 不动——宝箱 opened 跨死亡保留，设计书 §4.3）。
- sfx push 新事件：'chest'（宝箱）/ 'boom'（自爆）/ 'blink'（传送）/ 'sweep'（扫尾/镰刀）。

### 9. gate.js 章节化（设计书 §1.5 逐条）

- `readChapters()` 辅助：`['chapter2.js','chapter3.js'].filter(f=>fs.existsSync(path.join(ROOT,f)))` 逐个 read 拼接。
- **契约就绪守卫（关键，保证你随时可过门禁 H1 而无论平衡队进度）**：
  `const hasContract = /const CHAPTERS/.test(levelsSrc);`
  `const chapterSrc = hasContract ? readChapters() : '';`
  —— 平衡队契约块未合入时**跳过拼接章节源码**（chapter 顶层 `CHAPTERS.push` 会 ReferenceError），
  gate 以 v6 旧口径跑 10 关（全绿）；合入后自动升级为全量章节口径。两个模式（levels/engine）同守卫。
- levels 模式（契约就绪时）：`levelsSrc + chapterSrc + '\n;aggregateLevels();'`，沙箱返回追加 `CHAPTERS/ALL_LEVELS`；
  断言 `ALL_LEVELS.length === 10 + 3*已合入章数`；validateLevels() 全量跑。
- engine 模式：源码串接同上；THEMES 桩数组追加 `'sea','nether'`（:81）；glue 返回追加 `ALL_LEVELS` 与 `BAL`；
  三处循环升级（构造循环用 `sandbox.ALL_LEVELS.length`；Boss 冒烟遍历全部 `!!l.boss` 关并对每关断言
  `boss.kind===(meta.boss===true?1:meta.boss)` 与 `boss.maxHp===[BAL.boss,BAL.boss2,BAL.boss3][kind-1].hp`；
  谜题链路 `Math.min(6,nLevels)`→`nLevels`）。输出文案 L7 Boss 冒烟行改为逐 Boss 关一行。

### 10. tools/_v7_chapter_check.js（设计书 §1.5-e；唯一参数 chapter2|chapter3|all）

按设计书 §1.5 e) 六项实现（语法/注册/validateLevels/章节内容断言/空转冒烟/Boss kind 冒烟）。内容断言直接复用
validateLevels 的章节守卫断言结果（平衡队 §10.7 落地后）+ 脚本内再自查一遍关键计数（精英恰 1/G≥1/g≥1/theme/boss kind），双保险。
无该章文件时打印 `SKIP: <章> 未交付` 退出码 0（终验前允许半章合入）。

## 交付自测（全部真实跑，输出贴进交付说明）

1. `node --check engine.js && node --check tools/gate.js && node --check tools/_v7_chapter_check.js` —— 退出码 0。
2. `node tools/gate.js engine` / `node tools/gate.js levels` / `node tools/gate.js art` —— 退出码 0（art 顺带确认未误伤）。
3. `node tools/_v6_feel_test.js`、`node tools/_v6_loot_test.js` —— 全项过（H5/H8 零回归证据）。
4. 桩环境 Boss 冒烟自证（临时 node -e 或复用 gate 输出）：三 Boss 关（构造合成关或等章节队文件）逐关
   `loadLevel→180 帧空转→boss.state==='dormant'`。章节文件未交付期间：**手写最小桩验证**——
   `node -e` 注入临时 LEVELS 尾部三关（boss:2/boss:3 各一，网格照 L7 抄）跑同一断言，脚本与输出贴交付说明。
5. 参数化对照：临时脚本打印 `BAL.boss2/BAL.boss3` 全键值与设计书 §8 逐值 diff（0 差异）。
6. `node tools/_v7_chapter_check.js all` —— 输出 SKIP 或 OK（取决于章节队进度，两种都算过，贴输出）。

交付说明含：任务清单 10 项完成状态、6 项自测命令与输出摘要、与设计书 §4-§8 的逐节对照、
`_engBossSummon` 工厂化与现行内联构造的字段等价性说明（H5）。
