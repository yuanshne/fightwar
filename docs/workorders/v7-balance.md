# 工单 · 平衡队（v7）：levels.js 契约块+断言扩展 + v7 平衡表文档 + 全量回归

> 所有权：**只许改 `pixel-quest/levels.js` 的两处（§1 契约块追加于文件末尾、§2 validateLevels 断言扩展），
> 新建 `docs/specs/2026-10-25-v7-balance.md` 与 `tools/_v7_regress.js`**。
> 严禁触碰：LEVELS 前 10 关数据、PUZZLES 键 1..10、LG 类、engine.js/ui.js/art.js/gate.js/chapter*.js。
> 设计基准：`docs/specs/2026-10-24-v7-design.md`（下称"设计书"）——§1 契约、§8 数值（唯一权威）、§10 断言规格。
>
> **硬约束（违背即验收失败）**：
> H1 门禁：`node tools/gate.js levels` 退出码 0——**无论章节文件是否已交付**（10/13/16 关口径都必须绿：
> 你的断言全部守卫式，章未合入即跳过）。
> H2 LEVELS/PUZZLES/LG 一字不动（`git diff` 可证）；只追加、不重排。
> H3 契约块**逐字**照抄设计书 §1.2（六队并行都依赖它，符号名/顺序/语义零偏差）。
> H4 断言扩展只增不改：既有 9 类断言的行为对旧 10 关完全不变（旧关零新 err 零新 warn 变化——
>    扩展前先跑一次记录基线输出，扩展后 diff）。
> H5 并行红线：与章节队无文件冲突（他们只建 chapter*.js）；与框架队无冲突（gate.js 归他）。

## 任务清单（P0 优先级排序——契约块是全波的地基，最先交付）

### P0-1. levels.js 契约块（设计书 §1.2 逐字，置于 `validateLevels` 函数定义之后、文件末尾）

```js
// ---------- v7 章节注册表（契约附记 v7；本文件只声明不聚合——聚合唯一入口=aggregateLevels 函数本体，
//             调用点三处：ui.js 启动时 / gate.js 桩内 / validateLevels 首行；重复调用幂等无害） ----------
const CHAPTERS = [];        // 章节注册表：chapter2.js/chapter3.js 顶层 push
                           // 注册对象：{id, name, levels:[LEVELS 同构 meta 数组], puzzles:{键=全局 1 基关号}}
var ALL_LEVELS = LEVELS;    // 聚合视图（aggregateLevels 调用前缺省=第一章 10 关；engine/ui/gate 只读本符号）
function aggregateLevels(){ // 唯一聚合入口（幂等）
  ALL_LEVELS = LEVELS.concat(CHAPTERS.reduce(function(a,c){return a.concat(c.levels||[]);},[]));
  for(const c of CHAPTERS) if(c.puzzles) Object.assign(PUZZLES, c.puzzles); // 谜题就地并入全局 PUZZLES
  return ALL_LEVELS;
}
```

### P0-2. validateLevels 断言扩展（设计书 §10 逐条；以下为实现规格）

1. 函数首行加 `aggregateLevels();`；主循环 `for(let li=0;li<LEVELS.length;li++)` 改 `ALL_LEVELS.length`；
   成功 msg `LEVELS.length+'关…'` 改 `ALL_LEVELS.length+'关…'`（其余文案不动）。
2. `SOLIDISH/STAND` 两 Set 追加 `'G'`（:604-605）。
3. 支撑断言（:640-644 的 'A'/'Y' 块）并列追加：
   - `'N'` 与 `'x'`：下方 2 格内须 STAND（报错文案「枪虾/精英枪虾王(x,y)下方2格内无支撑」）；
   - `'g'`：下方 2 格内须 STAND（「宝箱(x,y)下方2格内无支撑」）；
   - `'J'/'T'/'E'/'z'`：无支撑要求（不加入该断言）。
4. 距离断言（新块）：扫描到 `'T'/'E'/'z'` 时，与已记录的 `'@'` 坐标做像素距离
   `Math.hypot((x-ax)*16,(y-ay)*16)<176` → err「L<N> <字符>(x,y) 距出生点<176px（门禁空转会触发）」
   （'@' 恒先于其出现？不保证——**先全图收集 '@' 坐标再二次扫描**，或单遍收集后统一判）。
5. 水流断言：`'{'/'}'` 与 '@' 曼哈顿距离 ≤3 → err「L<N> 水流(x,y) 距出生点≤3 格」。
6. boss 值域断言（meta 级，循环开头）：`meta.boss!==undefined && ![true,2,3].includes(meta.boss)` →
   err「L<N> boss 值必须为 true|2|3」。
7. 章节内容断言（**守卫式**，置于主循环之后）：
```js
if (ALL_LEVELS.length >= 13) {                     // 第二章三关合入（框架队 gate 拼接 chapter2.js 后）
  for (let li = 10; li <= 12; li++)
    if (ALL_LEVELS[li].theme !== 'sea') errs.push('L'+(li+1)+' 第二章新关 theme 应为 sea');
  if (ALL_LEVELS[12].boss !== 2) errs.push('L13 meta.boss 应为 2（蛟龙）');
  // 三关合计：'x'===1、'G'>=1、'g'===1（对 li 10..12 的网格重扫计数——复用主循环的 build 缓存或在守卫块内重建）
}
if (ALL_LEVELS.length >= 16) {                     // 第三章三关合入
  for (let li = 13; li <= 15; li++)
    if (ALL_LEVELS[li].theme !== 'nether') errs.push('L'+(li+1)+' 第三章新关 theme 应为 nether');
  if (ALL_LEVELS[15].boss !== 3) errs.push('L16 meta.boss 应为 3（判官）');
  // 三关合计：'z'===1、'G'>=1、'g'===1
}
```
8. 间隙/熔岩/拉杆/门/神龛既有断言对新关自动生效（主循环换 ALL_LEVELS 后天然覆盖）；
   **不得**把 '{'/'}' 加入弹簧/平台/风柱辅助扫描（设计书 §10-9）。

### P1. docs/specs/2026-10-25-v7-balance.md（数值转录文档）

- 结构照 v6 平衡表（docs/specs/2026-10-24-v6-balance.md）：§0 声明权威=设计书 §8 → 逐表转录
  boss2/boss3/enemy 四键/elite/flow/gear 六表/econ.chestGem，**每个数值附推导索引**（设计书 §8 末段推导文已给：
  TTK 公式沿用 v6 §T、突刺射程 67px、电环 1.1 瓦、水流 cap 170 vs maxRun 120/dash 130 半程……）。
- 补一张「三 Boss TTK 推演表」（ATK1/2/4/7 × 60/90/140hp，公式 `HP/(ATK/0.45+1.67)` ×1.6 实战系数）与
  「掉落期望表」（E[r] 与金率：jiao1 1.72/8%……设计书 §7.1 已给值，补算式）。
- 落地清单（engine 侧由框架队执行，你只记录核对结果）：BAL 新键与设计书 §8 的逐值 diff=0。

### P2. tools/_v7_regress.js（回归脚本；node 直跑）

1. `node tools/gate.js art|levels|engine` 三连（child_process 或直接要求人工跑——脚本内 spawn 最稳，退出码聚合）。
2. 既有工具零回归：spawn `node tools/_v6_feel_test.js`、`node tools/_v6_loot_test.js`、`node tools/_v6_fx_check.js`
   （存在则跑，不存在标注 SKIP）。
3. BAL 一致性：桩环境执行 levels.js+engine.js，读取 `BAL`，断言——
   a) 既有 v6 键值与 docs/specs/2026-10-24-v6-balance.md §0 逐值相等（防框架队收编时手滑改旧值）；
   b) v7 新键（boss2/boss3/enemy.lancer|jelly|ghost|boomer/elite/flow/gear 六表/econ.chestGem/boss 追加键）
      与设计书 §8 逐值相等（把 §8 表硬编码进脚本做 diff，0 差异）；
   c) 权重表和=100（六新表+三旧表全验）。
4. validateLevels 双口径：无章节文件时跑（10 关口径 msg）+ 临时桩注入假 CHAPTERS（两章各 3 个最小合法关，
   照 L1 抄）跑（16 关口径 msg）——守卫断言各自生效（假第二章关 theme 填 'sea' 满足断言；再故意放一个 theme='grass'
   的假关验证断言会 err——**负向自测**，验证后还原）。

## 交付自测（真实跑，输出贴交付说明）

1. `node tools/gate.js levels` —— 退出码 0（章节文件未交付时输出「10 关断言全部通过; 警告 44 处…」与基线 diff=0）。
2. `node --check levels.js` —— 通过。
3. `git diff --stat levels.js` + `git diff levels.js` —— 证明只追加（H2）；断言扩展前后旧关输出 diff=0（H4，贴两端输出）。
4. `node tools/_v7_regress.js` —— 全项过（含负向自测输出）。
5. P0 交付即时性：契约块完成后**立即**在交付说明置顶标注「契约块已就绪，章节队/框架队可联调」+ 时间戳。

交付说明含：P0/P1/P2 三段完成状态、自测 5 项输出、BAL diff 结果、负向自测证据。
