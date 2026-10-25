# 工单 · 装备引擎队（第二波）：掉落生成 / 装备掉落实体 / 拾取事件（engine.js）

> 所有权：**只许改 `pixel-quest/engine.js`**。前置：**第一波三工单全部验收合入后开工**（engine.js 波1 版为基线）。
> 设计基准：`docs/specs/2026-10-24-v6-design.md` §6.1-§6.5（下称"设计书"）；数值=`docs/specs/2026-10-24-v6-balance.md` §Q/§$（BAL.gear 已在波1 落地，本波**只读 BAL，不改 BAL**）。
> 现状行号基于 engine.js 1475 行版（波1 合入后行号会平移，按符号定位）。
> 依赖（已核对）：`_engMkBoss` hp 收编处（:533-546 波1 后）、`_engBossHurt` dying 转移（:573-574）、
> `_engKillEnemy`(:523-526)、`levelClear`(:465-477)、drops 心实体循环(:1408-1416)、`game.gearDrops/pickups` 字段（波1 已建空转）。
>
> **硬约束（违背即验收失败）**：
> H1 门禁：`node tools/gate.js engine` 退出码 0；`node --check engine.js` 通过；波1 自测 `tools/_v6_feel_test.js` 全项仍过（零回归）。
> H2 存档兼容：engine 不触碰 localStorage；拾取结果只经 `game.pickups` 事件交 ui（数据归属 ui，设计书 §6.1）。
> H3 容量守卫不回退：掉落光柱/浮字走 `_engFloat/_engFx`；gearDrops 为独立实体池**上限 6**（超过不再生成，Boss 双掉+骑士掉同屏 ≤4，6 有余量）。
> H4 装备掉落零丢失：Boss 关 levelClear 前在场 gearDrops 全部转 pickups（设计书 §6.3）。
> H5 掉落表/概率逐字=平衡表 §Q（`BAL.gear`），不得现场调参。
> H6 CONTRACT 只在附记 v6 的 sfx 行补 `'pickup'`（波1 已录入，核对即可，无新附记）。

## 任务清单（按序）

### 1. 稀有度 roll（内部函数）

```js
function _engRollTier(w) { // 内部：w=[白,绿,蓝,紫,金] 权重数组和=100
  let r = Math.random() * 100;
  for (let i = 0; i < 5; i++) { r -= w[i]; if (r < 0) return i; }
  return 4;
}
function _engSlot() { return 'whc'[(Math.random() * 3) | 0]; } // 内部：槽位均匀 1/3
```

### 2. 掉落生成

```js
// ① Boss（L7）：_engBossHurt 的 hp<=0 dying 转移分支内（:573-574），levelClear 前：
game.gearDrops.push(_engMkGear(b.x + b.w / 2 - 24, b.y + b.h - 14, _engSlot(), _engRollTier(BAL.gear.boss1)));
if (Math.random() < BAL.gear.bossExtra)                    // 30% 第 2 件
  game.gearDrops.push(_engMkGear(b.x + b.w / 2 + 14, b.y + b.h - 14, _engSlot(), _engRollTier(BAL.gear.boss2)));
// ② 精英骑士：_engKillEnemy 内追加（仅击杀入口；踩踏/普攻/技能击杀都经此）：
if (e.type === 'knight' && (game.levelIdx === 8 || game.levelIdx === 9)   // L9/L10
    && Math.random() < BAL.gear.eliteChance)                               // 10%
  game.gearDrops.push(_engMkGear(e.x + e.w / 2 - 5, e.y, _engSlot(), _engRollTier(BAL.gear.elite)));
// 守卫：gearDrops.length >= 6 时跳过生成（H3）
function _engMkGear(x, y, slot, r) { // 内部：掉落实体（10×12）
  return { x: x, y: y, w: 10, h: 12, vy: -140, vx: (Math.random() < 0.5 ? -1 : 1) * 30,
           slot: slot, r: r, t: 0, bounced: false };
}
```

- Boss 可重复挑战：选关重进 L7 走同一路径（boss 重建→dying 再触发）；掉落表不变（H5）。

### 3. 掉落实体物理（updateWorld ⑨″ drops 心循环旁新增 gearDrops 循环）

```js
for (let i = game.gearDrops.length - 1; i >= 0; i--) { const d = game.gearDrops[i];
  d.t += dt;
  if (!d.rest) {
    d.vy = Math.min(d.vy + BAL.econ.dropGrav * dt, BAL.econ.dropFall);
    d.x += d.vx * dt; d.y += d.vy * dt; d.vx *= (1 - Math.min(1, 3 * dt));   // 水平衰减
    const ty = Math.floor((d.y + d.h) / _engTile), tx = Math.floor((d.x + 5) / _engTile);
    if (L.solid(tx, ty, game.switchState)) {
      d.y = ty * _engTile - d.h;
      if (!d.bounced && d.vy > 60) { d.vy = -d.vy * 0.4; d.bounced = true; } // 落地反弹一次
      else { d.vy = 0; d.vx = 0; d.rest = true; }                            // 停驻
    }
    if (d.y > L.h * _engTile + 30) { game.gearDrops.splice(i, 1); continue; } // 兜底
  }
  if (!p.dead && _engAabb(d, p)) {                                           // 拾取
    game.pickups.push({ slot: d.slot, r: d.r });
    game.sfxQueue.push('pickup');
    game.gearDrops.splice(i, 1);
  } }
```

- **永不过期**（任务书"发光装备实体触碰拾取"；换关 loadLevel 清空=放弃未拾取，Boss 关例外见 §4）。

### 4. Boss 关零丢失（H4）

```js
// levelClear()（:465-477）开头追加：
if (L.meta.boss && game.gearDrops.length) {
  for (const d of game.gearDrops) game.pickups.push({ slot: d.slot, r: d.r });
  game.gearDrops = [];
}
```

### 5. 复位与门禁空转

- loadLevel 已清 `gearDrops/pickups`（波1 §G）；respawn **不清** gearDrops（掉落跨死亡保留）、清 pickups（防陈旧事件）。
- 门禁空转：L1~L10 无击杀 → gearDrops 恒空，零副作用；L7 空转 Boss dormant 不触发 dying ✓。

## 交付自测（新 `tools/_v6_loot_test.js`，node 桩环境）

1. 分布：`_engRollTier` 以 `BAL.gear.boss1` 模拟 10⁶ 次，各稀有度频率与权重差 ≤0.3%（种子随机，容差放 3σ）。
2. Boss 链路：L7 激活 Boss → `boss.hp=1` → 一次攻击入 dying → 断言 gearDrops∈[1,2] 且 slot∈'whc'、r∈0..4；重复 loadLevel(6) 五次（可刷性）。
3. 精英骑士：合成关（假 LEVELS 追加，含 'A' 与支撑，照 tools/_v4_puzzle_smoke.js 模式）置 `levelIdx=8` 击杀骑士 200 次 → 期望掉率 10%±3%（二项 3σ）且 `BAL.gear.elite` 无金（r<4）。
4. 物理与拾取：注入 gearDrop 于离地处 60 帧 → 落地反弹一次后 rest；玩家重叠 → pickups 得事件、实体删除；`levelClear` 转移断言（H4）。
5. 上限：注入 8 个 → 实际生成 ≤6（H3）。
6. 门禁：`node tools/gate.js engine` 退出码 0 + `tools/_v6_feel_test.js` 全过（H1）。

交付说明含：6 项结果、与平衡表 §Q 的逐值对照、`game.pickups` 事件格式确认（`{slot:'w'|'h'|'c', r:0..4}`——bag 队冻结接口）。
