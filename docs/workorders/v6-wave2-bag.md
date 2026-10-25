# 工单 · 背包队（第二波）：背包界面 / 存档迁移 / 装备注入 / 掉落渲染 / 外观合成渲染（ui.js）

> 所有权：**只许改 `pixel-quest/ui.js`**。前置：**第一波三工单全部验收合入后开工**；与波2 loot(engine)/look(art) 并行
> （接口已冻结：`game.pickups` 事件格式 `{slot,r}`（loot 工单）与 `SPR.look/ico*` 键（look 工单）——按冻结接口编码，并行无阻塞）。
> 设计基准：`docs/specs/2026-10-24-v6-design.md` §6-§7（下称"设计书"）；数值=平衡表 §Q。
> 现状行号基于 ui.js 1677 行版（波1 合入后平移，按符号定位）。
> 依赖（已核对）：`loadProgress/migrateProgress/saveProgress`(ui.js:204-218)、`startLevel`(:411-427)、
> `step` 输入桥接(:1567-1585)/play 分支(:1606-1618)、`renderHUD`(:1038-1130)、`heroPoseImg`(:778-803)、
> `_heroXform`(:808-823)、`renderPlayer` 死亡分支(:828-836)、`updateGhosts`(:858-866)、
> `flipCache/whiteOf`(:701-712)、`puzzle` 覆盖层开合范式(:252-272)、`_panel`(:440-449)。
>
> **硬约束（违背即验收失败）**：
> H1 门禁：`node --check ui.js` 通过 + `node tools/gate.js engine` 退出码 0。
> H2 旧存档零丢失：`pq_progress` 只增键不改不删；迁移幂等（设计书 §6.7 代码照抄）；`pq_hint_fall` 等既有键不动。
> H3 鼠标不替代键盘：背包全部操作键盘可达（§C 对照表）；开包后键盘焦点逻辑不依赖鼠标。
> H4 容量守卫不回退：背包演出（浮字/闪光）走本地渲染或 engine 入口，不直 push 粒子池。
> H5 外观层方案=设计书 §7.5（已核验），**按冻结伪代码实现**，不得改为全帧重画方案。
> H6 波1 功能零回归：悬停卡/O 引导/神龛指引/L 键全保持（自测覆盖）。
> H7 世界冻结语义：`game.bagActive=true` 期间 `updateWorld` 不推进（engine 波1 已实装早退；ui 侧同样跳过 updateWorld 双保险，同 puzzle 范式 :1607-1617）。

## 任务清单（按序）

### §A 存档扩展与迁移（设计书 §6.7 代码照抄）

- `migrateProgress`（ui.js:213-218）追加 v6 段：补 `equip={w:-1,h:-1,c:-1}`/`inv=[]`/`shards={}`/`nextId=1`（仅缺省补齐，幂等，不写标记位）。
- 异常档自愈：`recomputeEquip()` 发现 `equip` 指向的 id 不在 inv → 按空槽计算并回写 `equip.*=-1` + saveProgress。

### §B pickups 消费 + 入包规则（设计书 §6.4 三选一，逐字实现）

```js
// step() play 分支每步：消费 game.pickups（守卫 typeof game.pickups!=='undefined'）
for (const pk of (game.pickups || [])) {
  const name = EQ_PREFIX[pk.r] + EQ_BASE[pk.slot];        // 命名表（设计书 §6.1）
  const same = progress.inv.find(it => it.slot === pk.slot && it.r === pk.r);
  if (same || progress.inv.length >= BAL_GEAR_BAG) {      // 有同名 或 满包 → 碎片
    const k = pk.slot + pk.r;
    progress.shards[k] = (progress.shards[k] || 0) + 1;
    _bagFloat(name + ' → 碎片+1', EQ_COLOR[pk.r]);       // 满包时前缀「背包已满 」
  } else {
    progress.inv.push({ id: progress.nextId++, slot: pk.slot, r: pk.r });
    _bagFloat('获得 ' + name, EQ_COLOR[pk.r]);
  }
  saveProgress(progress);
}
game.pickups = [];
// BAL_GEAR_BAG=12 / EQ_PREFIX=['破旧','铁制','秘银','星辉','神话'] / EQ_BASE={w:'长剑',h:'头冠',c:'斗篷'}
// / EQ_COLOR=[#d8d8e0,#58c848,#48a8f8,#b060f0,#f8d048]（照平衡表 §Q；BAL 若可 typeof 引用则直接读 BAL.gear.stat）
// _bagFloat：屏幕中层浮字（本地渲染数组 ≤4 条，2s 消隐——不经 engine 池，H4）
```

### §C 背包界面（布局/交互矩阵=设计书 §7.1-§7.3 逐字实现）

- 开关：KEYMAP 追加 `bag:['KeyB']`；HUD 背包钮 `(250,198,16,16)`（`SPR.icoBag`，缺素材程序化包袱剪影；悬停卡「背包 · B」）。
- 开：`bagOpen=true; game.bagActive=true;` 清全部输入边沿（照 openPuzzle :265-266）；关：B/Esc/关闭钮 → `game.bagActive=false`。
- 布局/焦点三区/按钮坐标/选中框/装备标记/碎片栏：照设计书 §7.2 图与坐标表。
- 交互（键盘↔鼠标全等价，H3）：照设计书 §7.3 矩阵；Tab 焦点循环 `equip(3)→bag(12)`；Enter 穿/脱；X 分解（+2 碎片，装备中禁止）；C 升阶（碎片≥3 且 r<4，扣 3 碎片 r+1）。
- 升阶/穿/脱后：`recomputeEquip(); _lookDirty(); saveProgress();` + 本地 sfx（设计书 §8 equip/shard 合成参数）。
- 属性面板显示：`攻击 ATK(+e) / 生命 hp/maxHp / 移速 +e% / 冷却 −e%`（读 game.equip）。

### §D recomputeEquip 与引擎注入（设计书 §6.2 冻结公式）

```js
function recomputeEquip() {
  const eq = { atk: 0, hp: 0, spd: 0, cd: 0 };
  const find = id => progress.inv.find(it => it.id === id);
  const st = BAL_GEAR_STAT;                              // 平衡表 §Q stat 表
  const w = find(progress.equip.w), h = find(progress.equip.h), c = find(progress.equip.c);
  if (w) eq.atk = st.w[w.r];
  if (h) eq.hp  = st.h[h.r];
  if (c) { eq.spd = st.cSpd[c.r] / 100; eq.cd = st.cCd[c.r] / 100; }
  game.equip = eq; game.cdMul = 1 - eq.cd;
  const p = game.player;
  if (p && typeof p.maxHp === 'number') {
    const diff = (BAL_PLAYER_HP + eq.hp) - p.maxHp;      // 头饰：升上限同时当前 HP+差值（奖励即时可感）
    p.maxHp += diff; if (diff > 0) p.hp += diff; p.hp = Math.min(p.hp, p.maxHp);
  } }
// 调用点：boot 后一次 + startLevel 后一次 + 背包每次变更后（卸下只降上限：p.hp=min(p.hp,p.maxHp)）
```

### §E 掉落渲染（gearDrops，设计书 §6.3）

- 每个掉落：底部稀有度色光柱（宽 8、alpha 0.3+0.1sin(tick×0.1)，从实体底向上下各 14px 渐隐）+ 图标 `SPR.icoW/icoH/icoC` 稀有度叠色（`source-atop` 缓存，whiteOf 思路 :706-712）+ 上下浮动 `sin(d.t*3)*1.5`；金件额外 1px 金描边脉冲。
- 世界悬停（§波1 mouse 表 geardrop:i）：外扩 4px 命中 → 卡「秘银长剑　触碰拾取」（drawCNText，稀有度色名）。

### §F 外观合成渲染（设计书 §7.5 冻结伪代码照抄）

- `heroLook(img, fam)`/`_lookCache`/`_lookDirty()`/`lookEq()`（`lookEq` 从 progress.equip→inv→`look(r)=r<2?0:r<4?1:2`）。
- 改 3 处：`heroPoseImg` 返回前包装（fam：attack/dash/dashWind/castT→'atk'，其余→'idle'）；`renderPlayer` 死亡分支 `heroLook(SPR.heroFall,'idle')`；`updateGhosts` 自动随动（经 heroPoseImg）。
- `SPR.look` 未合入（look 队并行）→ `lookEq` 全 -1 → 恒等直通（守卫，零回归）。
- 装备中物品在背包格：格内叠 `SPR.look.*[档]` 缩略（12×12 居中裁切）可选，最低要求=右下角金点标记（设计书 §7.2）。

### §G HUD 背包钮与背包内悬停

- 钮渲染+点击（开/关）+悬停卡；背包内格/槽/按钮 hover 白描边（波1 hover 系统扩展 id：`bag:0..11 / slot:w|h|c / btn:*`）。

## 交付自测

1. `node --check ui.js` + `node tools/gate.js engine` 通过。
2. 新 `tools/_v6_bag_check.py`（playwright）：
   - 迁移：注入三种旧档（v3 {unlocked,stars} / v4 +puzzles / v5 +v5m）→ reload 断言旧键原值保留 + 新字段默认正确 + 二次 reload 幂等（H2）；
   - 注入 `game.pickups=[{slot:'w',r:2}]` → 浮字出现、progress.inv 增条、reload 后仍在（持久化）；
   - 满包（12 条）再拾 → shards+1（规则 3）；
   - 穿/脱/升阶/分解：console 驱动 + 键盘 Tab/Enter/X/C 路径与鼠标路径各跑一遍（H3）；
   - 开包时 `game.time` 不增（世界冻结 H7）；外观变化：穿金武器截图对比无装备（合成层生效）。
3. 波1 回归：`tools/_v6_ui_hover_check.py` 全过（H6）。
4. 手测清单：B 键/Esc/鼠标钮开合；死亡演出与通关结算中 B 不响应（设计书 §7.1）。

交付说明含：以上结果、迁移前后 JSON 样例（脱敏）、与 loot/look 冻结接口的对接确认。
