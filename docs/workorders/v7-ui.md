# 工单 · 界面队（v7）：章节化选关 + 新 Boss 血条/装配 + 新实体渲染 + 黑暗层 + 存档迁移

> 所有权：**只许改 `pixel-quest/ui.js`**。
> 设计基准：`docs/specs/2026-10-24-v7-design.md`（下称"设计书"，§9 为你的主规格，§1/§2.3 为契约）。
> 现状锚点：选关 renderMenu ui.js:2025-2057 / computeHover select :711-715 / step select :2323-2342 /
> startLevel :646-671 / clear 转移 :2388-2409 / migrateProgress :282-293 / Boss 血条 :1547-1562 /
> renderBoss :1170-1227 / renderEntities :899+ / SFX 表 :202 / MUSIC :254-272 / CREDITS_LINES :2070-2098。
>
> **硬约束（违背即验收失败）**：
> H1 门禁：`node --check ui.js` + `node tools/gate.js engine` 退出码 0（engine 门禁不执行 ui，但改动不得破坏其桩环境）。
> H2 存档兼容（R2）：`pq_progress` 只增不改不删；迁移幂等（§2.3 一行追加）；v6 键 unlocked/stars/puzzles/v5m/equip/inv/shards/nextId 原样。
> H3 并行红线：不碰 engine.js/art.js/levels.js/gate.js/chapter*.js。你消费的全部新符号守卫式读取：
>    `game.boss.kind`（`||0`）、`Level.chests/lanterns`（`||[]`）、`themeArt.tiles.hidden/waterL/waterR`、
>    `SPR.boss2/3`、新敌 SPR 键——缺省走程序化兜底（设计书 §9.4/§9.5 已给兜底画法），美术/框架队未合入时浏览器不抛异常。
> H4 `aggregateLevels()` 调用为**硬依赖**（设计书 §9.1）：不加守卫——若平衡队未合入，浏览器启动即报错属集成问题（预期行为）；
>    但你的 `node --check`/gate 自测不受影响（不执行 ui）。
> H5 键盘/鼠标等价（v6 R4 延续）：章节选关全部鼠标操作有键盘路径。

## 任务清单

### 1. 启动聚合与 LEVELS→ALL_LEVELS（设计书 §9.1）

- `const canvas=` 之前加 `aggregateLevels();`。
- 全文 `LEVELS` 读取点替换为 `ALL_LEVELS`（至少：:650/:712/:2038/:2056/:2064/:2091（clear 下一关）/​:2096/:2391/:2406；
  替换后 `grep -n "LEVELS" ui.js` 仅允许出现在注释与你新增的 aggregateLevels 行）。替换后逐处自查语义=关卡遍历（非声明）。

### 2. 章节化选关屏（设计书 §9.2；renderMenu 的 select 分支重做）

- 布局/坐标/卡规格/Boss 卡红边/新关金点/章锁定灰化：逐字按 §9.2 表格。
- 章首表：`const CH_HEAD=[[0,7],[7,6],[13,3]];` 渲染时按 `ALL_LEVELS.length` 截断（13 关时只画两章；16 关三章；
  10 关时只画第一章——**过渡期兼容**：选关屏在章节文件未合入时必须照常可用）。
- 键盘导航按 §9.2（←→±1；↑↓ 跨章保持列号）；SFX.select 沿用。
- computeHover select 块（:711-715）与 step select 双击逻辑（:2329-2337）按新布局矩阵同步（hover id 沿用 `select:i`，
  i=ALL_LEVELS 下标——下游 startLevel(i) 无需改）。
- 星数合计/上限 `ALL_LEVELS.length*3`。

### 3. Boss 血条与 renderBoss 参数化（设计书 §9.3）

- 常量 `BOSS_NAME/BOSS_P2TIP`（§9.3 逐字）；血条块 :1547-1562 名字与刻度线位置参数化
  （刻度 x=128+172*(1-[0.5,0.4,0.4][kind])）；hover 提示卡 :1641-1642 同步。
- renderBoss：部件表索引 `[SPR.boss,SPR.boss2,SPR.boss3][b.kind||0]`（含白剪影同索引；缺表 return 沿现行守卫）；
  drawImage 偏移改按部件图尺寸对齐（§9.3 公式——kind1 图 52×48 与框相同→零位移，回归安全）；
  姿态表追加 sweepCast/blinkCast（hidden 跳过渲染）/scytheCast 三行（§9.3）。

### 4. 新敌人渲染分支（设计书 §9.4；renderEntities 敌人循环 :952+，全守卫式）

lancer/jelly/ghost/boomer 四分支+精英通用层（scale 绘制/金环/血条/可选金冠）——规格逐字按 §9.4 表，
程序化兜底画法已给。蝙蝠巡逻分支的 amp/frq 已由框架队参数化（ui 无需改蝙蝠）。

### 5. 新机关渲染（设计书 §9.5）

- '{'/'}' 水流瓦片、'w' 气泡化（sea 主题分支）、'G' hidden 瓦片、'g' 宝箱（opened 分帧）、'R' 灯笼+暖光晕。
- renderTiles 的瓦片分支按字符追加（G 与 '#' 同实心渲染路径但取 hidden 图；'{'/'}' 非实心区域层，
  画在背景后、实体前，与 'w' 风柱同层）。

### 6. 黑暗层（设计书 §9.7；nether 专属）

模块级离屏 384×224 单例；世界渲染后 HUD 前按 §9.7 伪代码实现（玩家 r64/灯笼 r80 摇曳/检查点神龛 r24 微光）。
`L.theme.dark` 缺省 false 整块跳过（H3：THEMES.nether 未合入时不画）。

### 7. 隐藏房微提示（设计书 §9.8）

玩家距未碎 'G' ≤24px 时每 90 tick 落 1 粒尘 fx（读 `L.tiles` 扫描 'G'——每 8 帧一次节流扫描缓存结果，勿每帧全图扫）。

### 8. sfx 合成四事件（设计书 §9.9 表逐字）：SFX 表追加 chest/boom/blink/sweep。

### 9. 存档迁移与结局文案（设计书 §2.3/§9.10）

- migrateProgress 追加：`if (p.stars && p.stars['9'] >= 1) p.unlocked = Math.max(p.unlocked, 11);`（幂等，无标记位）。
- CREDITS_LINES 换 v7 版（§9.10 逐行）；renderVictory 遗留文案对齐；clear 转移 `LEVELS.length`→`ALL_LEVELS.length`（L10 通关进 L11、L16 进 credits）。

## 交付自测（真实跑，输出贴交付说明）

1. `node --check ui.js` + `node tools/gate.js engine` —— 退出码 0。
2. `grep -n "\bLEVELS\b" ui.js` 输出贴交付说明（应只剩注释与 aggregateLevels 调用行）。
3. 浏览器实测（playwright，沿 `tools/_v5_ui_smoke.py`/`_v6_bag_check.py` 模式；新写 `tools/_v7_ui_check.py`，可临时）：
   a) `?level=1` 全程 pageerror/console.error=0；
   b) localStorage 注入三种旧档（v5 纯 unlocked/stars、v6 全字段、v6+stars['9']=3）→ 载入断言：旧键原值保留、
      第三档 unlocked=11、二次 load 幂等（设计书 §2.3 迁移自测）；
   c) `?god=1` 跳选关屏截图：三章节头/16 卡布局/锁定章灰化（注入 unlocked=1/8/13 三档各截一张）；
   d) 章节队未交付时（chapter 文件缺）选关屏仍可用（10 关一章布局）截图。
   *注：c/d 依赖 levels 侧聚合就绪；若平衡/章节队未合入，以 a/b + 代码走查替代并在交付说明标注。*
4. 黑暗层性能：`?level=14`（章节三队交付后）60s console 无告警、帧率无明显掉帧（半依赖联调，未就绪则标注）。

交付说明含：任务清单 9 项完成状态、自测输出、LEVELS grep 证据、兜底路径清单（哪些新键缺省时走程序化）。
