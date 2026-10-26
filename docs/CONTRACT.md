# Pixel Quest 模块契约（CONTRACT）—— 三个子 agent 必须严格遵守

游戏目录：`pixel-quest/`（相对工作区根）。旧半成品 `pixel-quest/index.html` 仅作**搬运素材参考**，它有已知语法错误和 bug，**禁止直接复制引擎段落**。

## 0. 总体规则（三方通用）

1. 产出**普通 script 文件**（非 ES module）：禁止 `import`/`export` 语句，顶层 `const/class/function` 声明即全局暴露。
2. **禁止**：DOM 访问（`document`/`window`/`canvas`）出现在 engine.js 与 levels.js 的任何执行路径；art.js 允许在**函数体内**用 `document.createElement('canvas')` 生成离屏画布，但顶层代码不得执行任何 DOM 调用（会被 node 门禁执行）。
3. 引擎不发声：engine.js 播放音效的方式只能是 `game.sfxQueue.push('die')`（ui.js 每帧消费）。
4. 引擎不读键盘：输入由 ui.js 写入 `game.input`，engine 只读 `game.input`。
5. 文件顶部注释声明本文件职责。代码中文注释。**UTF-8 无 BOM**。
6. 不新增契约外的全局符号（内部辅助函数用 IIFE 或下划线前缀并注明"内部"）。
7. 完成后必须自查：`node --check <file>` 通过 + 对照本文档导出清单逐项确认，把结果写进交付说明。

## 1. 文件与加载顺序（index.html 由主 agent 编写）

```html
<script src="art.js"></script>    <!-- 素材 -->
<script src="levels.js"></script> <!-- 关卡数据 -->
<script src="engine.js"></script> <!-- 物理/机关 -->
<script src="ui.js"></script>     <!-- 渲染/输入/主循环（主 agent 写） -->
```

## 2. levels.js（关卡模块）

### 导出
- `class LG` —— 网格构建器：`constructor(w,h)`；方法 `set(x,y,ch)`、`fill(x0,y0,x1,y1,ch)`、`ground(x0,x1,topY,fillY?)`（默认填到底）、`plat(x0,x1,y)`（单向平台'='）、`row(x0,x1,y,ch)`、`coins(x0,x1,y)`、`coinArc(cx,y,n)`（n 个金币抛物线弧）、`stairs(x,y,steps,dir)`。全部返回 this 供链式调用。网格存 `this.g`（二维字符数组），边界外 set 静默忽略。
- `const LEVELS` —— 长度恰为 6 的数组，每项 `{name,theme,par,hint,w,h,build(g)}`：
  - `name`：'1 · 草原初试' 等中文关名；`theme`：'grass'|'cave'|'sky'|'factory'|'lava'|'tower'；
  - `par`：限时秒数（暂定 40/70/65/85/95/150，标注待校准）；`hint`：开场 3.5 秒显示的中文提示；
  - `w,h`：网格尺寸，六关依次 `(100,14)(110,20)(120,14)(120,18)(130,16)(44,36)`；
  - `build(g)`：往 LG 网格里填关卡，返回 g。
- `function validateLevels()` —— 返回 `{ok:boolean, msg:string}`，执行几何断言（见下）。

### 瓦片/实体字符表（engine 与 levels 共用语义）
```
# 实心砖   I 冰面(实心,低摩擦)   = 单向平台   ^ 上尖刺(即死)   v 吊刺(即死)   ~ 熔岩(即死)
o 金币     * 宝石(=5金币)        S 弹簧       C 崩塌砖
K 钥匙     D 门(整组同开)        L 拉杆
a 切换砖橙(初始实心)  b 切换砖蓝(初始虚化)   ←拉杆后两色互换
M 横移平台(3瓦宽)  V 竖移平台     W 史莱姆   F 蝙蝠
< 朝左大炮   > 朝右大炮   Z 横电锯   U 竖电锯
( 左传送带   ) 右传送带
@ 出生点(每关恰1)  P 终点旗(每关恰1)  c 检查点
```

### 几何断言（validateLevels 必须实现）
1. 每关恰一个 `@` 和一个 `P`；`@` 下方 2 格内必须有实心支撑（'#'/'I'）。
2. **跳跃可达性**：同一行高度上，实心地面之间的空隙 ≤ 3 格（弹簧 `S` 后接的空隙 ≤ 7 格且落点侧有地面）；直上墙面高度 ≤ 2 格（除非 3 格内有弹簧/可垫脚平台）。
3. **拉杆不死锁**（L4/L6）：任意开关状态（a实/b虚 与 a虚/b实）下，从拉杆可到达的区域至少一条路径通向下一区域；实现方式：每处拉杆-砖组设计中，砖组只做"高路/低路二选一"，两条路都通向同一汇合点之后的区域。
4. `~` 熔岩必须连续成片贴着关卡底部或凹槽，不得出现在悬空位置。
5. 断言失败时 msg 给出关卡号+行列位置。断言是尽力而为的静态检查，允许保守（误报优于漏报，但不得误报正常设计）。

### 六关设计要求
难度递进；每关新机关：L1 基础+弹簧+史莱姆（几乎无死亡陷阱，沟底有底）；L2 尖刺/崩塌桥/蝙蝠/钥匙门/检查点（纵向洞窟，先下后上）；L3 横移平台/弹簧链/崩塌台阶+坠落即死；L4 拉杆切换/传送带/大炮/横锯；L5 熔岩海弹簧岛链/竖锯（三检查点）；L6 纵向登顶综合。旧 index.html 的 LEVELS 数组可作底稿，但必须：
- 修复 L4 第二拉杆段：按断言 3 重设计（旧设计有 1 格爬缝，废除）；
- 删除 L5 中 `g.set(44,H-3,'#')` 与其后一行残留（浮空熔岩）；
- L6 中段（钥匙/弹簧/门/平台）重新对齐，确保 `K` 的取放路线和 `D` 的通过路线在断言下成立；
- 金币沿主路径与冒险支线分布，每关 15~30 枚，宝石每关 1~2 颗。

## 3. engine.js（引擎模块）

### 导出
- `const PHY`：物理常量 `{grav:1500,maxFall:360,acc:1400,fric:1800,fricIce:180,maxRun:120,jumpV:330,springV:520,coyote:0.09,buffer:0.11}`（数值可微调 ±15%，键名不得变）。
- `class Level`：`constructor(idx)` 解析 LEVELS[idx]——提取实体（把实体字符从网格换成'.'，瓦片字符保留在网格）、门分组（相邻 D 连通分量）、电锯轨道扫描（左右/上下各扫 ≤7 格遇实心停）、装饰物随机摆放（seed=99+idx*17，只摆'ai'风格的确定性随机）、`totalCoin` 统计。实例字段：`tiles,w,h,tw,th,theme,meta,idx,coins[],enemies[],plats[],saws[],cannons[],springs[],levers[],checkpoints[],crumbles:Map,doors:Map,doorGroups[],spawn,goal,decor[],totalCoin,par`。
  - `tileAt(tx,ty)`：越界规则 x 方向返回'#'（左右墙），y<0 与 y≥h 返回'.'。
  - `solid(tx,ty,switchState)`：'#'/'I' 恒实；'a' 实当 switchState===0；'b' 实当 ===1；'D' 实当未开门；'C' 实当崩塌态<2；其余假。
- `const game`：`{state:'title',levelIdx,level,player,cam:{x,y},shake,time,deaths,coins,keys,switchState,bullets:[],parts:[],sfxQueue:[],respawnAt,clearT,input:{left:0,right:0,jump:0,jumpHit:0},paused,tick}`。
- `function loadLevel(idx,keepStats)` / `function respawn()` / `function killPlayer()` / `function levelClear()` / `function updateWorld(dt)`。
- 玩家 `{x,y,w:10,h:14,vx,vy,face,onGround,coyote,jbuf,anim,animT,dead,deadT,standOn,landT}`。

### 算法规范（照此实现，不要自由发挥）
1. **逐轴 AABB**：先 X 后 Y。X：`p.x+=vx*dt`，取玩家覆盖的行范围 y0..y1，若 vx>0 检查右缘所在列，撞实心则 `p.x=tx*16-p.w; vx=0`；vx<0 同理。Y：`p.y+=vy*dt`，vx>0 向下检查底缘行：实心或（'=' 且**本帧移动前脚底 `wasFeet<=ty*16+0.5`**）→ 落地 `p.y=ty*16-p.h; vy=0; onGround=true`；vy<0 向上撞实心 → `p.y=(ty+1)*16; vy=0`。
2. **手感**：土狼时间（离地后 coyote 计时内仍可跳）、跳跃缓冲（提前按跳缓存 buffer 秒）、松开跳键时上升速度渐弱 `vy*=0.94/帧`。
3. **移动平台**：实体 48×8。平台先动并记录本帧 `dx,dy`；玩家若上一帧站其上，先随平台位移。落上判定：vy≥0 且水平重叠且脚底穿过平台顶（`wasFeet<=pl.y+6` 且 `p.y+p.h>=pl.y-1`）→ 吸附。水平移动平台挤墙时把玩家沿推动方向推挤；推入实心则玩家死亡（避免夹卡）。
4. **踩踏判定**：敌人碰撞时若 `p.vy>60 && p.y+p.h-e.y<9` → 敌死、玩家反弹 `vy=-250`；否则玩家死。
5. **电锯**：圆 r7.5 vs 玩家矩形（最近点距离法）。**尖刺**：'^' 危险区=瓦片下半 (y+8..16)，'v'=上半。**熔岩**：瓦片 y+3 以下。
6. **崩塌砖**：状态机 0稳→(被踩0.45s,期间再踩重置到≤0.12s)→1抖→2落(加速下坠1.6s,期间非实心)→3无(1.2s 后且玩家矩形不重叠→回到0)。
7. **弹簧**：vy≥0 且水平重叠且脚底在弹簧顶 ±10px → `vy=-springV`，弹簧压缩动画计时 0.25s。
8. **门**：持钥匙接触任一 D 瓦片 → 钥匙-1，该连通分量所有 D 从网格移除。
9. **拉杆**：接触且 (冷却≤0) → switchState 翻转、冷却 0.6s、推送音效事件。
10. **大炮**：周期 1.9s 发射 8×6 炮弹，速度 105px/s，撞实心或出界消失，碰玩家即死。
11. **检查点**：接触置 on，respawnAt 更新（只进不退）。
12. **死亡序列**：dead=true 冻结 0.9s → respawn（敌人复活重置、崩塌砖复位、子弹清空、钥匙/门/开关/已收金币保持）。
13. **camera**：跟随玩家+面向前瞻 20px，lerp 0.12，clamp 关卡边界。
14. `updateWorld(dt)` 内按序：拉杆→拾取→门→检查点→终点判定→移动平台→电锯→大炮/炮弹→敌人→玩家物理→危险判定→粒子→计时。所有音效点 push 到 sfxQueue（'jump','coin','gem','key','door','switch','stomp','die','spring','checkpoint','clear','shot','crumble'）。

### 门禁执行环境说明
gate.js 会在 node 里以 `THEMES={六主题的空对象}` 桩执行 engine.js+levels.js，`new Level(i)` 六关全部构造、`updateWorld(1/60)` 空转 120 帧不得抛异常。因此：**顶层代码零 DOM、零音频、零键盘**。

## 4. art.js（美术模块）

### 导出
- `const SPR` —— `buildSprites()` 填充的精灵画布字典：`heroIdle1,heroIdle2,heroRun[3],heroJump,heroFall`（及左向 `...L` 翻转版）、`slime[2],slimeDead,bat[2],coin[4],gem,key,springX,springC,flag[2],checkOff,checkOn,saw[2],cannon,cannonL,bullet,lever[2]`。
- `const THEMES` —— 六主题对象，键=主题名，字段：`name,skyT,skyB,far,near,block,blockD,blockL,speck,cap,capD,capL,plank,plankD,accent,decor[],dust,dark?,lavaGlow?`（颜色全用 #rrggbb）。
- `function buildSprites()` —— 一次性构建全部精灵（幂等）。
- `function buildThemeArt(themeKey)` —— 参数取值 THEMES 键名；返回 `{tiles:{block,blockCap,plank,ice,crumble,toggleA,toggleB,spikes,spikesD,lava:[2],door:[2],convL,convR},decor:{bush,flower,mushroom,crystal,gear,chain,torch:[2],skull,cloudpot},bg:{far,near}}`，全部为 canvas（16×16 瓦片、bg 为 512×224 可平铺层）。
- `function drawPixelText(str,x,y,scale,color,align?)` —— 3×5 像素字体（A-Z 0-9 与 `: . ! ? - / x ( ) > < & +` 空格），align='left'|'center'|'right'。
- `function drawCNText(str,x,y,px,color,align?)` —— ctx.font 系统字体画中文（ui 用）。
- `function flipSprite(c)` —— 水平翻转 canvas。

### 规格
- 主角 12×14 橙兜帽小勇者（旧 index.html 的 P_HERO/HERO_* 像素数据直接搬运，允许微调）；史莱姆 12×10 两帧+压扁；蝙蝠 12×10 两帧；金币 8×8 四帧旋转；宝石 8×8；钥匙 10×5；弹簧 12×8 两态；终点旗 16×14 两帧；检查点旗两态；电锯 16×16 两帧（锯齿+中栓）；大炮 16×14 双向；炮弹 8×6；拉杆 12×14 两态。
- 六主题配色与瓦片风格差异化：grass 明快绿、cave 暗紫岩石、sky 淡云、factory 金属蓝灰、lava 玄武岩红黑、tower 暗夜紫。瓦片绘制函数（blockTile/plankTile/iceTile/crumbleTile/toggleTile/spikesTile/lavaTile/doorTile/conveyorTile）与视差背景（makeBG：远/近两层 512 宽可水平平铺，各主题不同母题——丘陵/钟乳石/云海/齿轮管道/熔岩尖塔/星空月）可从旧文件搬运后按本契约改造。
- 装饰物清单与摆放由 engine 的 Level.decor 决定，art 只提供图。

### 门禁
gate.js 会 `new Function(src)` 只编译不执行 art.js（语法检查），并正则核对导出符号齐全。

## 5. 各自的"不做"清单
- levels.js 不含任何行为逻辑（不解物理）；
- engine.js 不 draw、不发声、不读键盘；
- art.js 不含游戏逻辑（不 import 关卡数据）。

---

## 附记（v4 谜题神龛，2026-10-24 · 引擎队录入）

> 依据：docs/specs/2026-10-24-v4-puzzles.md 红线「不加新全局导出（engine 的
> puzzleSolved 除外，写进 CONTRACT 附记）」。本附记只增不改上文任何条款。

### engine.js 新增契约导出（第 3 节追加）
- `function puzzleSolved(idx)` —— 谜题解开结算：标记 `game.solvedPuzzles[idx]=true`、
  `game.coins+=5`、`game.sfxQueue` push `'puzzle'` 与 `'gem'`、玩家位置上方金色烟花
  约 24 粒（#f8d048）。由 ui 在覆盖层完成校验全对时调用；存档持久化由 ui 负责。

### engine.js 新增字段（沿 v2/v3「扩展字段」先例）
- `Level` 实例字段 `shrines[]`：`'Q'` 实体提取结果 `{x, y, w:16, h:24, idx}`（idx=1 起
  关卡号，配 levels.js `PUZZLES` 键；碑底对齐支撑瓦片顶面，与 'c' 检查点同锚定惯例；
  网格换 '.'，不入 SOLIDISH/STAND）。
- `game` 字段：`puzzleActive`（覆盖层打开中，updateWorld 于 paused 判断之后直接 return，
  同暂停冻结语义）、`puzzleNear`（每步计算，玩家矩形与神龛矩形四周 8px 外扩重叠时的
  神龛 idx，否则 -1）、`solvedPuzzles`（loadLevel 重置为 `{}`，已解状态由 ui 从
  localStorage 注入）。
- `game.sfxQueue` 新事件 `'puzzle'`（解谜完成音，ui 消费）。

### 瓦片/实体字符表（第 2 节追加一行）
```
Q 谜题神龛(L1~L6 各恰 1，脚下有支撑；走近提示可开谜题覆盖层)
```

---

## 附记（v5 手感，2026-10-24 · 手感队录入）

> 依据：docs/specs/2026-10-24-v5-design.md §1/§2/§3/§4/§8 与工单
> docs/workorders/v5-wave1-feel.md（波次裁决 A：新机关引擎语义第一波由手感队实装）。
> 本附记只增不改上文任何条款（v4 先例）。

### 瓦片/实体字符表（第 2 节追加）
```
w 上升气流区(非实心,玩家专属)  e 传送门(实体,按(x,y)排序两两配对)
A 骑士盔甲敌(12×18,hp3,正面格挡)  H 吊灯摆锤(锚实体,上方须实心)
```

### engine.js 新字段（沿 v2/v3/v4「扩展字段」先例，不新增契约外全局符号）
- `game`：`floats[]`（浮动文字 ≤40）、`fxParts[]`（UI 层演出粒子 ≤60）、`scars[]`（星陨爆坑 ≤8）、
  `shakePend`（分级震屏单槽 `{m,t}`）、`ult`（O 流星连斩状态机 `{on,t,fired,flashed}`）。
- `Level` 实例字段：`portals[]`（'e' 提取 `{x,y,w:12,h:24,cd,partner}`，构造末尾按 (x,y)
  字典序排序后两两配对）、`pends[]`（'H' 提取 `{ax,ay,len:48,t,phase}`，附 `ang/bx/by` 只读渲染字段）。
- 玩家：`airJumps`（剩余二段跳次数，落地/弹簧/踩踏/受击/复活重置为 1）、`djT`（空翻演出 0.4s）、
  `turnT`（转身 squash 0.12s）、`stepT`（脚步尘土节流 0.18s）、`landVy`（落地瞬间 vy，>300 大落）、
  `springAir`（弹簧全程锁定二段跳，落地/踩踏/受击解锁）、`atkAnim`（攻击总动画 0.25s）、
  `atkWind`（攻击起手 0.05s，期间无判定）、`windT`（冲刺风粒节流）、`shieldHp`（护盾吸收次数）、
  `atkSeq`（挥击序号，单调递增）。
- 敌人（W/F/A 与 Boss 召唤体）：`hp`（史莱姆 2/蝙蝠 1/骑士 3）、`kb`（击退速度，摩擦 600/s）、
  `flashT`（白闪）、`jitT`（抖动）、`dvx/dvy`（死亡击飞弹道）、`face`（骑士格挡朝向）、
  `hitSeq`（被哪一摆命中——hit-stop 冻结后判定框仍存活，同一挥击对同一目标只结算一次，
  玩家 `atkSeq` 与敌人/Boss `hitSeq` 比对实现一摆一伤）。

### 粒子所有权修订（v5 裁决）
- `game.parts` 上限收紧为 **240**（引擎模拟+守卫，超限丢弃新粒子）；
- `game.fxParts`(≤60) / `game.floats`(≤40) / `game.scars`(≤8) **引擎只 push（带容量守卫）、
  ui 每步推进+修剪**（hit-stop/ult 冻结期间照常推进——"冻结期火花仍渲染"的实现）；
  引擎任何地方不得 filter/splice 这三者。两池合计峰值 ≤300（红线）。

### sfx 事件表追加（engine 只 push，ui 消费）
- 新增：`'swing','hit','kill','djump','land2','shieldhit','shieldbreak','clank','portal','ult2'`；
- 废弃：攻击按下处原 `'slash'`（改 'swing'）；`'ult'` 保留（O 释放时）。其余事件名不变。

### 其他语义
- `_engHitStop` 0.06→**0.10**（Boss 承伤同步）；连击**按命中计数**（命中敌人无论死活/碎 B 砖 +1）；
- 暴击：本击使连击数到 4 的倍数（`(combo+1)%4===0`）→ 伤害×2、金色数字；
- 骑士正面格挡（攻击方向 === 面朝侧）0 伤害推浮字 GUARD；骑士/吊灯伤害走 `_engHurtPlayer`
  （HP 伤害非即死）；踩踏对骑士扣 1 不秒杀、对普通敌仍秒杀；
- 二段跳：`vy=-PHY.jumpV*0.92`、不吃松手截断、土狼时间只对第一段有效、无二段跳可用才进 jbuf；
- 玩家受击重置 `airJumps=1, springAir=false`（设计 §1.1）。

---

## 附记（v5 风格，2026-10-24 · 风格队录入）

> 依据：docs/specs/2026-10-24-v5-design.md §5/§6.1 与工单 docs/workorders/v5-wave2-style.md。
> 本附记只增不改上文任何条款（v4 先例）。

「附记（v5 风格，风格队录入）：THEMES 自 v5 起为十主题（新增 wind/castle/star）；
瓦片为三阶 cel 硬边（抖动仅存于 makeBG 远景）；SPR.cover 为封面素材字典（heroSil 24×28 /
bossSil 104×56 / meteorStreak[2] 26×8 / cloudA/B/C 各 512×80 可平铺）；puzzleUI 换深蓝金
皮肤（键与 8×8 齐缝规格不变）；新增装饰 windmill[2]/starflower[2] 与发光后处理 _glow
（内描边口径，画布尺寸零变化，ui drawImage 坐标零改动）。」

---

## 附记（v5 关卡，2026-10-24 · 关卡队录入）

> 依据：docs/specs/2026-10-24-v5-design.md §7 与工单 docs/workorders/v5-wave2-levels.md。
> 本附记只增不改上文任何条款（v4/v5 手感先例）。

### LEVELS 规模（第 2 节追加）
- LEVELS 自 v5 起为**十关**（8 翡翠风谷/9 落日王城/10 星空回廊，Boss 仍为第 7 关）；
  L8/L9/L10 依次 (118,18)(124,18)(130,20)，par 100/115/135，theme wind/castle/star；
  每关 B≥4、'@'/'P'/'Q' 恰 1，新关无熔岩/拉杆。
- 新字符 w/e/A/H 见 v5 手感附记（引擎语义第一波已实装，本文件只摆数据）。

### validateLevels 断言（第 2 节追加）
- 同行可站立段间隙直通阈值 3→**5**（二段跳平跳≈6.3 瓦，留余量）；辅助扫描新增
  'w' 风柱（窗口内 ≥2 块且 gap≤12 直通）。
- 新增断言：'e' 传送门每关数量为偶数；'H' 吊灯上方 1 格须 SOLIDISH；'A' 骑士下方
  2 格内须有 STAND 支撑。w/e/A/H 均不入 SOLIDISH/STAND。
- 通过 msg 关数动态化（"N关断言全部通过"）。

### PUZZLES（键追加）
- 增键 **8/9/10**：8 偶=数独 6×6（块 2 行×3 列，按 sol 合法性自解析）、9 奇=数织 9×9
  「王冠」、10 偶=数独 9×9；三者唯一解均经独立回溯/DFS 解数器复验（解数=1）。

---

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

---

## 附记（v7 章节化，2026-10-25 · 设计师录入）

> 依据：docs/specs/2026-10-24-v7-brief.md 与 docs/specs/2026-10-24-v7-design.md（下称"设计书"，
> 唯一设计基准）。本附记只增不改上文任何条款（v4~v6 先例）。六队并行施工，跨文件依赖以本附记+设计书 §1 为准。

### 加载顺序（第 1 节修订）
```
art.js → levels.js → chapter2.js → chapter3.js → engine.js → ui.js
```
章节文件缺失时浏览器静默跳过（游戏以已合入章节运行）；gate.js 对缺失章节文件跳过拼接。

### levels.js 新契约导出（第 2 节追加）
- `const CHAPTERS` —— 章节注册表：chapter2.js/chapter3.js 顶层 `CHAPTERS.push({id, name, levels:[…], puzzles:{…}})`；
  levels 与 puzzles 键=全局 1 基关号；LEVELS 前 10 关与 PUZZLES 键 1..10 一字不动。
- `var ALL_LEVELS` —— 聚合视图（aggregateLevels 调用前缺省=LEVELS）；engine/ui/gate 关卡遍历一律读它。
- `function aggregateLevels()` —— **唯一聚合入口**：`ALL_LEVELS = LEVELS.concat(各章 levels)` 并
  `Object.assign(PUZZLES, 各章 puzzles)`；幂等；levels.js 顶层不调用（调用点=ui.js 启动时一次、
  gate.js 桩内一次、validateLevels 首行一次）。

### 章节文件纪律（第 0 节追加）
- chapter2.js/chapter3.js：纯数据文件（同 levels.js "不含行为逻辑"）；顶层只许 `'use strict'`、
  注释、一个 IIFE 与 IIFE 内 `CHAPTERS.push(...)`；谜题数据为 IIFE 内部局部量。
- 新全局符号白名单（本章全部）：`CHAPTERS`/`ALL_LEVELS`/`aggregateLevels`（均在 levels.js）。

### engine.js 读侧与新增字段
- `Level` 构造读 `ALL_LEVELS[idx] || LEVELS[idx]`（聚合前两者同一数组，v6 行为不变）。
- `Level` 新字段：`chests[]`（'g' 宝箱 {x,y,w:16,h:14,opened,t}）、`lanterns[]`（'R' 灯笼 {x,y,w:16,h:24}）。
- `game.boss` 新字段 `kind`（1/2/3）；Boss 参数表 `BAL.boss`（kind1 收编现行硬编码）/
  `BAL.boss2`（蛟龙）/`BAL.boss3`（判官），状态机共用 `_engUpdateBoss`（R4：禁止第二份 Boss 状态机）。
- 敌人新字段：`elite`（放大变体：scale 1.75/hp 按表/速度×0.8/击退×0.25/踩踏扣 1 不秒杀/必掉装备）。

### 瓦片/实体字符表（第 2 节追加）
```
G 隐藏砖(实心,仅攻击可碎,无金币,碎后永久)  g 宝箱(实体,接触开启:装备1件+宝石等价金币)
{ 左向水流区(非实心,玩家专属水平加速)  } 右向水流区   R 灯笼(实体,nether 光源,纯渲染)
N 枪虾哨兵(12×14,地面,突刺)  J 水母(12×12,悬浮,脉冲电环)  T 幽灵(12×14,穿墙漂移,唤醒150px)  E 魂火(10×10,爬行自爆)
x 精英·枪虾王(放大枪虾,必掉装备)  z 精英·幽灵王(放大幽灵,必掉装备)
```

### 关卡 meta（第 2 节追加）
- `boss: 2|3` —— 章节 Boss kind（`boss:true`≡kind1 星核巨兽，语义不变）。

### sfx 事件表追加
- `'chest','boom','blink','sweep'`（engine 只 push，ui 消费）。

### gate.js 覆盖口径（第 3 节门禁环境说明追加）
- levels/engine 两模式拼接已存在的章节文件并调用 aggregateLevels()；engine 模式构造+空转循环、
  Boss 冒烟（遍历全部 boss 关，断言 kind 与 maxHp）、谜题链路（全量关）均覆盖 ALL_LEVELS；
  THEMES 桩补 `sea`/`nether` 两键。

---

## v7.4 谜题可通关性护栏（追加）

前提：v7.3 谜题门（`updateWorld` ⑤ 终点判定）要求本关神龛全解才 `levelClear()`，
于是「谜题不可解」被放大成「整关不可通关」。以下四条为**硬约束**，改动谜题相关代码时不得退化：

### 判定口径（ui.js，内部符号，不新增全局）
- `nonoRunsMatch(pz)` / `sudokuGridSolved(pz)`：胜负按**规则**判（数织=行列连续段等于线索；
  数独=行列宫均为 1..n 的排列），**禁止**改回「逐格与 `sol`/`pic` 比对」——多解题下会误判玩家正确解。
- `puzzleOk(pz)`：数据可玩性校验（类型/尺寸/字符合法/givens⊂sol/sol 合法）。
  `openPuzzle` 与 `startLevel` 都必须过这一关：前者拒绝开层，后者把该神龛置为已解（fail-open）。
- `puzzleHint()`：H 键提示一格（KEYMAP.puzzleHint=[KeyH]），无限次；`puzzle.hintN` 计数，
  按题重置（`startLevel` 与首次开层各清一次）。

### 渲染纪律
- `drawShrineThumb` 必须先过 `puzzleOk(pz)`：画稿行数不足时 `pz.pic[r][c]` 会越界抛错。
- 9×9 数独格宽固定 16（17 时盘面底边压住底部操作条，末行数字被提示文字盖住）。

### 主循环与启动
- `frame()` 用 try/catch 包住 step+render，异常只记一次日志并继续 rAF 链——
  **单帧异常不得终止主循环**（否则一次越界就永久冻死整局）。catch 内 `last=now; acc=0` 丢弃积压时间。
- `boot()` 的 `?level=` 解析必须 `Number.isFinite` 校验后回落第 1 关（`?level=abc` 曾直接崩在 loadLevel(NaN)）。
- `updateWorld` 开头做坐标自愈：`p.x/p.y/p.vx/p.vy` 任一非有限 → 拉回 `L.spawn`。
  NaN 一旦进入物理就污染相机与渲染（`createLinearGradient` 抛错），物理方程无法自恢复。

### gate.js 覆盖口径（追加）
- 新增 `puzzle` 模式：逐题唯一解（数织=行线索枚举+列前缀剪枝计数；数独=MRV 回溯计数）
  + 神龛↔PUZZLES 配对（有龛无题=门永久锁死；有题无龛=死数据）。engine 模式亦调用同一审计。
- 审计实现收敛在 `tools/puzzle_audit.js`（gate 与 CLI 共用），禁止在 gate.js 内另写一份。

---

## v7.5 可达性护栏与传送带口径（追加）

### 判定口径（tools/reach.js）
- `auditReach()` 是**唯一**的可达性审计入口，CLI（`node tools/reach.js`）与 `node tools/gate.js reach` 共用；
  禁止在 gate.js 内另写一份（同 puzzle_audit 的收敛规则）。
- 搜索**必须驱动 engine 的 `updateWorld` 跑真物理**，不得改用抛物线公式估算跳跃弧线——
  二段跳、冲刺三段变速、弹簧、风柱、移动平台载人、拉杆开关砖、传送门都在引擎里，
  任何简化模型都会把可达关卡判成死路。
- **witness 即证据**：搜到路径后必须在**全新关卡实例**上回放帧级按键序列，能再次命中才算 PASS。
  回放失败只能报 WARN（搜索期世界相位漂移），不得谎报 PASS，也不得直接判 FAIL。
- 抽象边界（明确写死）：敌人/锯齿/炮台/吊灯摆锤在搜索期被清空（可击杀或可躲避的周期障碍，
  不构成几何阻断）；尖刺与熔岩保留真实伤害，路径累计扣血 ≥ `BAL.player.hpBase`(5) 判为致命；
  按键以固定 60Hz 注入（等价稳定 60Hz 操作，不覆盖高刷丢帧差异——那是 latency.py 的职责）。
- 节点状态快照必须含**移动平台引用**（`standOn` 按 `L.plats` 下标存）。清成 null 会丢一帧平台带人位移
  （`p.x += p.standOn.dx`），在 L3 这类 6 块移动平台的关卡上累积偏移，witness 回放必然对不上。
- 去重键必须含「冲刺是否就绪」。原地等待不改变坐标但会走完冲刺冷却，只按坐标去重会把
  「冷却中无法再冲」误判成死路。

### 传送带实心口径（engine.js `Level.solid`）
- `'('` / `')` **必须**算实心。此前 `solid()` 不认而 `levels.js` 的 `STAND` 集合认，两处口径不一致，
  L4 把传送带铺在地面行（`levels.js:190 g.row(31,36,H-1,'(')`）于是成了 8 格无底洞：
  画面上是地板、踩上去直接掉出地图；「逆行传送带」机制（脚下一行扫描 `convL/convR`）也因此从未生效。
- 改 `solid()` 的字符集合时，必须同步核对 `levels.js` 的 `SOLIDISH` / `STAND` 两个集合，三者不得再分叉。

### 提示代价（ui.js `puzzleHint`）
- **无限次、永不阻断是红线**：金币 <= 0 时仍然给提示，不扣成负数、不欠账、不阻止开谜题。
  「不做无法通过的游戏」优先于「谜题要有挑战」。
- 每揭示一格扣 1 金币（`game.coins`），扣费只在**确认真要揭示一格之后**结算，各提前 return 分支不扣。
- 扣费反馈复用金币拾取同一套机制（`_bagFloat` 浮字 + `sfxQueue 'coin'`）；`puzzle.hintN` 保留。

## v7.6 四方口径一致性（追加，2026-10-25 · 集成队录入）

### 红线：一个瓦片/实体在引擎里有四套口径，任一分叉即出缺陷

| 口径 | 位置 | 职责 |
|---|---|---|
| 渲染表 | `ui.js renderTiles` 的 `switch(ch)` | 画不画、画什么 |
| 碰撞表 | `engine.js Level.solid()` | 挡不挡人 |
| 伤害表 | `engine.js updateWorld` hazard 判定 | 掉不掉血 |
| 断言集 | `levels.js SOLIDISH` / `STAND` | 静态校验认不认 |

- **`solid()` 认的字符，`renderTiles` 必须全部有 case**。v7.6 查出 `'B'`（可碎木箱）实心却无渲染，
  16 关共 80 处「隐形墙」——玩家被挡住却看不见任何东西。新增实心字符时，三处（渲染/碰撞/断言）
  必须同一次提交里补齐，`tools/_audit_tiles.js` 会逐格对拍，缺一处直接报出来是哪关哪格。
- 敌人落地判定与玩家 `standOn` 必须同口径支持单向平台 `'='`：仅下落中、且脚底上一帧在平台顶面之上时
  才吸附。敌人若只查 `solid()`，站在 `'='` 上会直接穿下去（L6/L14 实测 90 帧掉 80px/318px）。
- 周期运动的实体（蝙蝠巡逻、移动平台）必须**扫墙**：蝙蝠前方探测 + 撞墙钳位，平台沿轨道扫
  `_railSolid` 截断行程。写死行程（±56）会在关卡改动后静默穿墙。
- 伤害判定范围必须与精灵可视范围对齐（偏差 ≤2px）。魂火 `r=30` 而精灵仅 10×10 是反例；
  弹簧触发带 `s.y±10` 而精灵画在 `s.y-2` 也是反例。判定宽于视觉 = 「没碰到就掉血」，玩家会觉得游戏赖皮。

### 谜题规则展示
- 首次进入某类谜题（`'nono'` / `'sudoku'`）必须弹一次性规则卡：**任意键关 + 8s 超时自动关**，
  两者缺一不可——只有按键会卡住不认字的玩家，只有超时会让读规则的人来不及看完。
- 规则卡显示期间独占输入（屏蔽移动/填格），否则玩家在看不见棋盘的情况下误操作。
- 盘面右侧常驻三行速查（每次进入都在），与一次性规则卡互补。
- `puzzle.view`（回看已解谜底）状态**不弹**规则卡。

## v7.7 手感与换色皮肤（追加，2026-10-25 · 集成队录入）

### 手感改动的硬约束：只能变跟手，不许变弱
- **最大跳跃高度、满速水平位移、冲刺距离三项不得下降**。`reach` 门禁跑真物理 A*，削弱机动能力
  会直接让 26 个目标点搜不到路径。改手感后 `reach` 必须仍为 26/26，不许调判定标准或目标数量凑数。
- 可变跳跃高度只能「短按变矮」，长按的最大高度必须 ≥ 原值。
- 输入缓冲类改动（攻击缓冲 `p.abuf`）必须放在 `engine.js` 内部，**不得改 `ui.js` 的输入采集层**
  （持键直写 `game.input.left` + 边沿锁存 `game.input.jumpHit` 是既定契约）。

### 换色皮肤（art.js `HERO_SKINS` / `getHeroSkin`）
- 调色板 13 键语义固定：`k` 描边、`b` 亮主体、`B` 暗主体、`W` 高光、`w` 纯白、`o/s/O/y/Y` 围巾三段、
  `e` 眼睛、`p` 腮红。
- **换肤只允许改 `b` / `B` / `W` 与围巾系 `o/s/O/y/Y`**。`k`（描边）、`w`（脸/手套）、`e`（眼睛）、
  `p`（腮红）全套必须不变——改了角色会「变糊」，可读性崩塌。
- 色阶规则（美术硬规范）：`B < b < W` 明度严格递增；围巾 `o→s→y` 同色系三段渐变且明度递增；
  禁纯黑描边；17 套两两 `b` 色相角差 ≥ 12°（防「深蓝/藏蓝/靛蓝」三套分不清）。
- `getHeroSkin(id)` 必须**惰性生成 + 缓存**，且返回的键集合与 `SPR.hero*` 完全一致（漏一帧 =
  某个动作变空白）。未知 id 回落 `'blue'`。
- ui 侧取帧必须守卫：`typeof getHeroSkin !== 'function'` 时回落静态 `SPR.hero*`（art.js 未合入也能跑）。
- 掉落映射：关卡索引 `i` → `HERO_SKINS[i+1].id`，**仅首次通关**掉落，已解锁不重复、不补发。
  开放全关后直跳 L16 只掉 L16 那套。

### 局外成长（已撤销，勿复活）
- 用户明确否决了「永久货币 + 三条升级线 + 成长面板」。`progress` 中不得再出现
  `gold` / `meta` / `goldBest`，`engine.js` 中不得再出现 `metaBonus` / `_engMeta` / `_engDashCdMax`。
- `recomputeEquip` 的属性公式回到「基础 + 装备」原式，不要再掺永久等级。
- 若将来重提成长系统，需重新走设计评审，不要从 git 历史里直接恢复旧实现。

### 全关开放开关（`progress.unlockAll`）
- 只写这一个布尔字段，**不得**改动 `stars` / `puzzles` / `equip` / `inv` / `shards`。
- 选关屏的章锁（`chLocked`）与关卡锁（`locked`）必须同步放开，两处都要判。
- 直跳后期关卡时 `startLevel` 不得假设「前一关已通」，所有前置依赖要能兜住。

## v8.0 提示常驻、键位等价、传送带与相机、新小怪（追加，2026-10-26 · 集成队录入）

### 操作提示（L1 背景常驻）
- L1 的操作提示**画在视差背景之上、世界 translate 之前**（屏幕坐标）：不随相机与震屏移动，
  且在瓦片/实体之前绘制，天然不遮挡地面与敌人。
- **必须带深色投影**（同位置偏移 +1,+1 画一遍 `rgba(10,20,40,0.9)`）：浅蓝天空与白云上
  单靠透明度会读不清，实测 0.55 的投影被字形 alpha 二次衰减到 0.28，等于没画。
- 三行透明度不得低于 0.5；L1 不再出底部 3 秒条与技能提示条（内容重复）。
- 底部提示条面板 `VIEW_H-42..VIEW_H-28`，神龛金行 `VIEW_H-58..VIEW_H-49`，**间距 ≥6px**
  （原 168/171 只差 3px，抗锯齿下就是叠字）。面板底边不得越过技能槽描边（197.5）。

### 键位等价（全界面）
- 导航一律走 `KEYMAP` 的 `left/right/up/down`（已含 WASD），确认一律走 `ok`（`Enter`+`Space`）。
- **禁止在任何分支写裸键名**（`hit('ArrowLeft')` / `pressed['Enter']`）——v8.0 修掉 3 处裸键名，
  其中 2 处导致「背包/衣橱只能按 Enter、空格无效」，1 处导致「暂停时 Esc 无效但面板写着 ESC: MENU」。
- `KeyW` 同时是跳跃与确认：谜题神龛旁按 W 开谜题而非跳（近龛优先）是既有设计，不要改。

### 传送带（`'('` / `')'`）
- 玩家用**独立带速** `p.convV`（加速 1200 / 上限 280），不直接改 `p.vx`。
  旧写法把 `p.vx` 顶到 170，下一帧被 `effRun=120` 钳回，实得仅 50px/s —— 玩家完全无感。
- 敌人带速为玩家的一半（600 / 140）。**敌人被带运送时不得触发掉头判定**，否则会出现
  「掉头→清带速→再掉头」的逐帧循环（L4 实测 10 秒掉头 60 次）。
- 脱困：地面敌 1.6s 窗口内横向跨度 <40px 判为被困，按「主动跳 → 换向冲刺 → 原地掉头」
  取第一个可用的动作，3s 冷却。交战距离内与技能态期间豁免。

### 相机（纵向）
- 死区 ±20px + 纵向前瞻（下落 16 / 上升 12）+ 纵 lerp 0.08（横 0.12 不变）。
- **关卡高度必须 > 视口高度才有纵向滚动空间**：`h=14` 时 `L.h*16 = 224 = VIEW_H`，
  `cam.y` 被钳死为 0，玩家在任何高度画面都不动。L1/L3 已从 `h=14` 改到 `h=20`。
- 改关卡高度时**必须冻结 `H`**：`const H=g.h-1` → `const H=13`（原值硬编码），否则全部相对
  定位的元素整体平移，弹簧够不到平台、出生点悬空。同时把所有 `g.ground(a,b,H,H)` 的显式
  `fillY` 去掉（缺省填到底），否则新增行会是空气、沟底看起来悬空。

### 新小怪（`i` 铁甲虫 / `k` 酸液花 / `n` 跳跳蛛）
- 三者全部走 `_engMkEnemy` 工厂 + `_ENG_ENEMY_DEF`，地面型重力/落地/掉头复用既有分支。
- 状态名是 `ui.js` 渲染取帧的依据，**不得改名**：beetle `idle/wind/charge`、
  spitter `idle/cast`、hopper `idle/crouch/air`。
- 精灵键固定 `SPR.beetle|spitter|hopper`（各 2 帧）+ `SPR.*Dead`，尺寸 14×12 / 14×16 / 12×12。
- 美术硬规范：1px 带色相描边（禁纯黑）、光源左上、至少 3 个色阶、基准帧面向左（ui 负责翻转）。
- `spitter` 的酸弹复用 `game.bullets`（只加 `g`/`kind` 字段），不要另建弹丸数组。

## v10 血量三倍与 Boss 招式扩展（追加，2026-10-26 · 集成队录入）

### 血量倍率（`BAL` 是唯一真值，别在代码里写死数字）
- 小怪 / 精英 / Boss **全部 ×3**。Boss 三段血要求 `hp % 3 === 0`（每段整数），改数值时必须验证。
- `_engBossMinionHpMul`（Boss 关杂兵倍率）已从 3 改为 **1**：基础血整体 ×3 后再叠 3 倍会变成 9 倍。
  常量与调用点保留为挂点，不要再往上乘。
- `p2At` 是**不消费的死字段**（二阶段由三段血 `bandBreak >= 2` 触发），改它没有效果，别误以为能调阶段线。

### Boss 选招轮转（v10 修的真 bug）
- 旧写法「先 filter 掉 `lastPattern` 再取模」会让索引随池长漂移，**部分招式永远轮不到**。
- 现行写法：在**完整池**上按位递增，撞到上一招才顺延一位。必须保证「每个池长度周期内每招各放一次」。
- 新增招式必须同时补三处：`windup`（前摇秒数）、`recover`（后摇秒数）、招式参数对象（`meteor/spike/...`）。
  缺 `windup`/`recover` 会让 `_engBossDur` 取到 `undefined`；缺参数对象会让状态机读到 `T.xxx.gap` 抛异常。

### 新招式与危险物（`game.hazards`）
- 5 个新招：`meteor` / `spike` / `homing` / `clone` / `pull`，状态名对应 `meteorCast` / `spikeCast` /
  `homingCast` / `cloneCast` / `pullCast`（UI 按状态名渲染前摇，改名即失去视觉预警）。
- **每个新招必须可躲**：前摇 ≥0.5s + 有明确视觉预警。可躲性不是"感觉能躲"，要写脚本验证
  （陨石站圈外 / 地刺起跳 / 追踪弹奔跑 三种情况实测不掉血）。
- `game.hazards` 在 `loadLevel` 与 `respawn` 初始化，所有读侧带 `|| []` 守卫；
  跨段、真死、Boss 接力共 5 处必须清场，否则残留危险物会在下一段继续伤人。
- 伤害统一 1，与 `contactDmg` 同档，不许出现秒杀招。

### 连段与破绽（节奏设计，不是难度旋钮）
- 连段：**仅二阶段**、40% 概率、最多 2 招、两招必须不同、第二招前摇 ×0.8。
- 连段结束**强制**进 `stagger` 0.9s，期间受伤 ×1.5 —— 这是玩家唯一的稳定输出窗口，不许取消。
- 单招结束 30% 概率进 `stagger` 0.6s。
- `b.comboQ` / `b.comboN` 是 UI 连段警告的判据（`comboN >= 1` 画红「连」），语义不得改。

### 美术素材挂点
- `SPR.spike`：4 帧 × 20×24，UI 按当前高度纵向压缩（底边对齐），所以必须画成"从下往上长"。
- `SPR.bossGhost`：52×48 单张画布，半透明紫色能量体（UI 再叠 `alpha 0.55`）。
- 两者缺失时 UI 走程序化兜底，**不许抛异常**（`_v10_ui.js` 有缺失路径断言）。

## v11 终点封印（追加，2026-10-26 · 集成队录入）

### 规则
- 小关终点有封印，三条路**任选其一**解除：击败 60% 敌人 / 收集 40% 金币（**按枚数**）/ 解开神龛。
- Boss 关豁免：`seal.open = true, via = 'boss'`。
- 死亡 ≥5 次后门槛各降 20%，只降一次（`relaxed` 守卫）。封印是引导，不是惩罚。
- **封印不加物理碰撞**，只拦 `levelClear()`。给封印加实心会让 `reach` 从 27/27 直接归零 —— 这是红线。

### 数据（`game.seal`，`loadLevel` 初始化）
```js
{ enemyTotal, enemyKilled, enemyNeed,    // 战斗线
  coinTotal, coinGot, coinNeed,          // 探索线（枚数口径）
  hasShrine, shrineOk,                   // 解谜线
  open, via, blockT, relaxed }
```
- `enemyKilled` / `coinGot` **每帧从实体重算**（`_engSealTick`），不要直接改这两个字段做测试——
  下一帧就被覆盖。测试要改真实实体（`e.dead=1` / `c.got=true`）。
- 金币用 `L.coins.filter(c=>c.got).length`，**不能用 `game.coins`**（跨关累积，`loadLevel(idx,true)` 不清零）。
- `coinTotal` 与 HUD 的 `L.totalCoin` **口径不同**：面板按枚数，HUD 按面值（宝石 5、木箱含 1）。
  所以面板金币行必须带「枚」后缀，否则两个分母并排会让玩家以为数据错乱。
- 跨关谜题状态：ui 在 `startLevel` 把 `progress.puzzles[idx]` 回填进 `game.solvedPuzzles`，
  engine 只读后者，不碰 localStorage。

### 渲染约束（都是实机截图踩出来的）
- 条件面板 `sy` 下限 **34**（不是 2）：终点旗贴地面时 `g.y-44-ph` 常算出 5~15，
  钳到 2 就把面板顶到 HUD（占 0~30）上，三行字只剩半截。
- 进关提示条**必须两行**：单行 35+ 字约 380px，实测左右两端被 384 画布裁掉。
  位置在天空区（`VIEW_H-140`），贴底画会压在土块纹理上读不出来。

## v12 Boss 交互七类型 + L19 火焰山（追加，2026-10-26 · 集成队录入）

### 为什么要做
v10 的 8~10 招虽然多，**应对动作只有一种**：看预警 → 走开。打两遍就能背板，玩家原话「boss 没啥意思」。
造梦西游的招式之所以耐打，是**每招要求不同的正确动作**。新增的是"动作类型"，不是更多红圈。

### 七种类型（状态名/字段名已冻结，改名前先改 spec + UI 守卫）
| 类型 | 引擎状态 | 关键字段 | 正确动作 |
|---|---|---|---|
| 多段连撞 | `chargeRun` | `b.chargeN`、`T.charge.hits` | 往场地中间绕（撞墙/跑满行程都会反弹续冲） |
| 召唤回血 | `summonCast` | 召唤体 `leech:true`、`T.summon.leech/leechCap`、`b.leechOn` | 先清小怪 |
| 蓄力全屏 | `quellCast` | `T.quell{dur,warn,r,n,breakDmg,dmg}`、`b.quellDmg/quellDur/quellFlash`、hazard `ward` | 打断（伤害累计 ≥ breakDmg）或站进结界圈 |
| 抓取摔投 | `grabCast` | `T.grab{reach,dmg}` | 不站正前方 46px |
| 劈地波 | `quakeCast` | `T.quake{w14,h26,...}`、`wave.tall=true` | 跳（26 < 单跳 53） |
| 火柱 | `pillarCast` | `T.pillar{n,warn,w,h,life,gap,dmg}`、hazard `pillar` | 离红圈，绕开已升起的柱 |
| 核心护盾 | `coreCast` | `T.core{n,hp,life,r}`、`b.coreOn`、hazard `core` | 转火打核心（本体免伤） |

### 硬约束
1. **每招可躲，且必须有脚本断言**（`tools/_v12_boss_test.js` 45 条）：抓取背后不中、劈地起跳不中、
   结界圈内 0 伤 / 圈外 2 伤、打断转破绽、核心破光转 2s 破绽。改判定后这些断言必须仍绿。
2. **伤害上限 2**：只有 `grab`/`quell` 是 2（长前摇 0.75~0.9s + 专属预警），其余 1。禁秒杀。
3. **回血不跨段**：`hpTotal` 封顶 `(3-bandBreak)*bandMax`；否则三段血语义崩（玩家会把回血当"打不死"）。
4. **每一招都要补 `windup`/`recover` 键**；参数对象允许缺表但有兜底（`T.core || BAL.boss4.core`），
   这条是实机截图踩出来的：boss6 没配 `quell/core`，一旦进对应状态直接抛异常、主循环报错。
5. **新 hazard 走同一个 `game.hazards`**，跨段/真死/接力/respawn 五处清场自动覆盖。
   核心额外兜底：`hp<=0` 在 hazard 更新里统一收尸并调 `_engCoreBreakCheck()`，
   否则 0 血核心会被 `coreCast` 的 `coreAlive` 当成还活着 → Boss 永久免伤。

### 站位（实机改过两次，别再改回去）
- `ward` 结界：**以玩家为基准左右各 120px**（原来放场地 25%/75% 列，距 576px，
  相机跟玩家不跟 Boss，两个安全区全在镜头外 = 这招只能靠打断）。
- `core` 核心：**Boss 两侧 ±150px**（原来放场地 20%/80% 列，同样在镜头外，玩家看不到打哪里）。
- 两者都必须"同屏可见 + 需要迈步/跳起"，不允许白送原地安全区。

### L19 与 UI
- `meta.boss` 值域扩到 `[true,2,3,4,5,6]`（`levels.js` 白名单 + `gate.js` kind 判断同步）。
- `_bossIdx` 上限 4→5；`BOSS_NAME/BOSS_P2TIP/BOSS_P2FRAC` 与部件表、白剪影表同步加第 6 项并保留回落链。
- 顶栏关卡名**只放得下 96px**（`ctx.clip`）：长名字会和 x=100 的金币图标叠成一坨，L19 名已缩短为「19 · 火焰山」。
- 核心护盾期本体必须套青色护罩（`b.coreOn`）：打上去没伤害但不给视觉解释，玩家会以为是自己没打中。
