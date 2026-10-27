# v16 · Boss 招式去同质化（招牌独占）+ 圣像审判

> 立单：2026-10-27。玩家原话：「boss 撞来撞去这个技能不要谁都给啊，这个很难躲的，你就当成牛魔王的专属技能就可以了，
> 然后 boss 要有自己的特色，除了普通攻击其他的能不要一样吗？」
>
> 本文件是**唯一真值**：四路并行（engine / ui / art+docs / test）都按这里冻结的名字与字段写，
> 谁也不要自行改名、不要自创第二套参数。

---

## 一、规则

1. **`charge`（三连撞）归牛魔王专属**，其余五只的 `poolNear` / `poolFar` / `p2Add` 里一律不得出现。
2. **六只 Boss 的机械招零重合**：每只 4 招招牌，全 24 个槽位互不相同。
3. **公共层只有两招**，故意保留重复（玩家明确允许「除了普通攻击」）：
   - `barrage` 弹幕普攻 —— 每只都有；
   - `nova` 全屏双环 —— 只在 P2 由 `p2Add` 追加。
   
   这两招就是「普通攻击」层，不要再往里塞别的。
4. `dive`（跳劈落地甩环）从所有 `p2Add` 移除：它与 `leap` 是同一套抛物线，等于变相重合。
   `T.dive` 参数与实现代码**保留**（可能被 `p2Add` 将来复用），只是不再进池。

## 二、冻结的六张表（逐字抄进 engine.js，顺序也要一致）

```js
// boss1 星核巨兽（L7）
poolNear: ['meteor', 'spike', 'summon', 'leap', 'barrage'],
poolFar:  ['barrage', 'meteor', 'spike'],
p2Add:    ['nova'],

// boss2 蛟龙·敖渊（L13）
poolNear: ['sweep', 'mist', 'pull', 'breath', 'barrage'],
poolFar:  ['barrage', 'breath', 'pull', 'mist'],
p2Add:    ['nova'],

// boss3 幽冥判官（L16）
poolNear: ['scythe', 'blink', 'mirror', 'quell', 'barrage'],
poolFar:  ['barrage', 'scythe', 'blink', 'quell'],
p2Add:    ['nova'],

// boss4 冥古龙（L18 第一棒）
poolNear: ['push', 'core', 'quake', 'clone', 'barrage'],
poolFar:  ['barrage', 'push', 'quake', 'core'],
p2Add:    ['nova'],

// boss5 曜光·圣裁者（L18 第二棒）
poolNear: ['halo', 'parry', 'homing', 'totem', 'barrage'],
poolFar:  ['barrage', 'halo', 'homing', 'totem'],
p2Add:    ['nova'],

// boss6 牛魔王（L19）
poolNear: ['charge', 'bomb', 'pillar', 'grab', 'barrage'],
poolFar:  ['barrage', 'charge', 'bomb', 'pillar'],
p2Add:    ['nova'],
```

**每只的实际招数**：P1 = 4 招牌 + barrage = 5；P2 = + nova = 6。全程无跨 Boss 重合。

### 招牌分工表（写进 README 与 CONTRACT，也是测试断言的真值）

| Boss | 4 招招牌 | 各自罚什么 |
|---|---|---|
| 星核巨兽 | meteor 陨石雨 / spike 地刺 / summon 召唤 / leap 跳劈 | 不看天、不看地、不清场、不预判落点 |
| 蛟龙·敖渊 | sweep 扫尾 / mist 水雾 / pull 吸附 / breath 吐息 | 贴地站、站桩、被拉回危险区、不跳台 |
| 幽冥判官 | scythe 镰刀波 / blink 传送 / mirror 真假身 / quell 蓄力结界 | 直线站位、读不出落点、打错目标、不打断 |
| 冥古龙 | push 推进墙 / core 核心护盾 / quake 劈地波 / clone 幽冥分身 | 往墙里退、不看本体、不跳、分不清残影 |
| 曜光·圣裁者 | halo 圣辉轮 / parry 反伤架势 / homing 追踪弹 / totem 圣像审判 | 穿缝失误、连打、不甩弹、只盯 Boss 不拆场 |
| 牛魔王 | charge 三连撞 / bomb 火油弹 / pillar 火柱 / grab 抓取摔投 | 站桩、记不住弹两下、不看脚下、正面贴脸 |

## 三、新增招：`totem` 圣像审判（boss5 专属）

**玩法**：Boss 举手（前摇 0.7s）→ 玩家左右两侧各升起一座圣像（受地形 clamp）→ 4 s 引信。
圣像 **可被普通攻击打掉**（3 刀），打掉的那座不炸；引信到点未拆的圣像炸开，半径 110 内扣 **2 心**。
两座都留 = 两次判定，但受伤无敌 1.0s 会吃掉第二次 —— 实际最坏 1+1=2 心，可接受。
罚的是「只盯 Boss 不拆场」。

**参数（冻结，写进 `BAL.boss5`）**：
```js
totem: { n: 2, hp: 3, fuse: 4.0, w: 16, h: 32, r: 110, dmg: 2, off: [-72, 72] },
```

**hazard 对象字段（冻结，ui 只读这些）**：
```js
{ kind: 'totem', x, y,          // y = 地面线（h 向上长，与 mist 同口径）
  w: 16, h: 32,
  hp: 3, maxHp: 3,              // ui 画血量点用
  t: 0,                          // 已存活
  life: 4.0,                     // fuse
  r: 110, dmg: 2,                // 爆炸半径/伤害
  flashT: 0 }                    // 被打中闪白（≤0.08s）
```

**状态机**：`windup(totem)` → `totemCast`（首帧生成，0.45s 后 recover）。
与 mist/pillar 同构：只在 `b.fireN === 0` 那一帧 spawn，`_engBossDur('totem', b.phase)` 之外不要自己计时。

**更新分支（`_engUpdateHazards`）**：
- `e.t += dt`；`e.t >= e.life` → 爆炸：`_engHurtPlayer(e.x + e.w/2, e.dmg)`（仅当玩家在半径 `e.r` 内，圆心取圣像中心），
  然后 `dead = true`。
- 被击破（`e.hp <= 0`）→ 直接 `dead = true`，**不炸**。
- 不挡移动、不挡攻击、不阻挡子弹。

**攻击命中**：走已有「攻击 vs hazard」路径（同 `mirror` 那段，engine.js:3035 附近），只扣 `hp`，
不在这里做爆炸结算（结算只在 `_engUpdateHazards` 收尸处，避免双份）。

**清场**：无新增清理点 —— `game.hazards.length = 0` 五处整数组清场自动覆盖。

## 四、文件分工（严禁越界改别人的文件）

| 谁 | 只改 | 要点 |
|---|---|---|
| engine | `engine.js` 一个文件 | 六张表 + `totem` 全套 + boss4 补 `clone` 参数 |
| ui | `ui.js` 一个文件 | `_hzTotem` 渲染 + 分发 + 前摇字「圣」+ 头顶标签 |
| art+docs | `art.js`、`docs/CONTRACT.md`、`README.md` | `SPR.totem` 16×32 + v16 章节 |
| test | `tools/*.js`（只测） | 新增 `_v16_boss_test.js` + 修 `_v12_engine_smoke.js`/`_v13_boss_test.js` 里过期的池断言 |

## 五、硬约束（违反即打回）

1. **R4**：Boss 差异只能来自 `_engBossTable(kind)` 的参数表；**禁止**再起一份 `if (kind === 5)` 的分支 switch。
2. 三段血：`b.hpTotal` 是唯一真值，`b.hp` 是段内派生，不要动。
3. 危险物统一进 `game.hazards`，自删条件必须写全（超时/被打掉/换段/真死/接力/respawn/换关）。
4. 不允许改 `BAL` 里任何已有招式的数值（本次只动池子 + 新增 `totem`）。
5. 不允许改 `dash` / `player` 任何参数。
6. 中文注释，写「为什么」而不是复述代码。

## 六、验收（我会亲自跑，数字对不上就打回）

- `node tools/gate.js art|levels|engine|puzzle` 全 OK；`node tools/gate.js reach` 必须 **27/27**。
- `node tools/_v13_boss_test.js` / `_v12_boss_test.js` / `_v12_engine_smoke.js` 全 0 FAIL（断言过期就改断言，别改行为）。
- 新增 `node tools/_v16_boss_test.js`，至少覆盖：
  1. **独占矩阵**：六只的招牌两两无交集；`charge` 只出现在 boss6；`barrage` 是唯一六只都有的招；`dive` 已不在任何池。
  2. **totem 生成**：cast 后恰好 2 座，坐标在玩家 ±72、y 落在地面线。
  3. **打掉不炸**：把 hp 打到 0 → 引信到点不扣血。
  4. **不拆就炸**：站进半径 → 扣 2；站半径外 → 不扣。
  5. **自删**：`hazards` 里 totem 全部消失，不留残留。
- `python tools/browsertest.py`：19 关 0 console error。
- 我会另跑实机截图目检 totem 的可读性（v13 的教训：断言绿 ≠ 画面对）。
