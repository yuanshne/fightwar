# 工单 · 美术队（v7）：双新主题全套 + 双新 Boss 部件 + 新敌/精英/宝箱/灯笼/隐藏砖素材

> 所有权：**只许改 `pixel-quest/art.js`**。
> 设计基准：`docs/specs/2026-10-24-v7-design.md`（下称"设计书"，§引用均指它）。
> 现状锚点：THEMES 定义 art.js:1906 起（`_th(name, skyT, skyB, far, near, block, blockD, blockL, speck, cap, capD, capL, plank, plankD, accent, decor[], …)`
> ——以 `_th` 实际签名与现有十键调用为准，参数序照抄 wind/castle/star 三键先例）；主题瓦片绘制函数 :1931 起；
> SPR.boss 部件字典 :1731 起；bossWhite :1745 起；SPR.mage :1775 起（新敌精灵规格沿此惯例）。
>
> **硬约束（违背即验收失败）**：
> H1 门禁：`node tools/gate.js art` 退出码 0（语法编译+导出符号核对；顶层零 DOM——离屏画布只在函数体内）。
> H2 只增不改：既有十主题/THEMES 字段/SPR 既有键一字不动；新增键见下文清单，命名不得撞既有。
> H3 并行红线：不碰 engine.js/ui.js/levels.js/gate.js/chapter*.js。ui 对你交付的全部新键做守卫式读取
> （缺键=程序化兜底），你只需保证键名与规格精确一致。
> H4 调色规范：全部 `#rrggbb` 三阶 cel 硬边（抖动仅远景 makeBG）；新精灵右向/面左基准沿用现有惯例并在注释声明。
> H5 体积预算：art.js 增量 ≤30KB（网格字符串+程序化绘制优先；现 ~140KB）。

## 任务清单

### 1. THEMES 新增两键（设计书 §3.1/§3.2）

```js
sea:    _th('东海龙宫', '#1a5ac8', '#7ed8f0', '#2a7ac0', '#8a5a30', '#f0b850', '#f8e090', …
        /* speck '#f8f0c8'、cap 贝壳砂 '#d8c8a0'、plank 沉船木 '#6a4a30'、accent '#ffd870'、
           decor: ['coral','shell','kelp'] */),
nether: _th('幽冥地府', '#101828', '#2c3448', '#3a3450', '#68e8a0', '#5a4a6a', '#f86048', …
        /* decor: ['ghostflame','bone','skull'] */),
```
- 参数序与字段集合**照抄 wind/castle/star 三键的 `_th` 调用**（含 v5 风格附记要求的三阶 cel 硬边口径）。
- `nether` 追加布尔字段 `dark: true`（ui 黑暗层开关，设计书 §9.7 读 `THEMES[theme].dark`）；
  `sea` 不设（undefined=false）。

### 2. buildThemeArt('sea'/'nether') 全套瓦片（沿 :1931 起主题绘制函数模式）

两主题各返回完整 tiles 键集（照现有主题返回结构）+ **新增三键**：

| 键 | 规格 | 用途 |
|---|---|---|
| `hidden` | 16×16 G 隐藏砖：与本章 block 同色系，多一处 2px 深色裂纹暗记（玩家观察可辨、扫屏不可辨） | v7 隐藏房墙（§4.2） |
| `waterL` / `waterR` | 16×16 水流区瓦片：半透明水色底（sea 色 #2a8ad0 系）+2px 白色向左/向右箭头纹 | '{'/'}' 渲染（§4.1） |

其余 tiles（block/blockCap/plank/ice/crumble/toggleA/toggleB/spikes/spikesD/lava[2]/door[2]/convL/convR）
按设计书 §3.1/§3.2 风格描述绘制：sea 珊瑚礁多孔+贝壳金、lava=深海热泉（青蓝泡）；nether 玄武岩+骨刻痕、lava=岩浆红黑。
背景 bg.far/bg.near（512×224 可平铺两层）：sea=龙宫飞檐剪影+光柱 / 海藻+鱼群；nether=奈何桥+彼岸花+远山鬼火 / 锁链+浮灯。
decor 键：sea `coral`（珊瑚枝 12×14）、`shell`（海星 10×8）、`kelp[2]`（海草两帧 10×16，可摇）；
nether `ghostflame[2]`（鬼火 8×10 两帧）、`bone`（骸骨 14×6）、`skull` 复用既有键（不重画）。

### 3. 新敌精灵（renderEntities 消费；尺寸=命中框，基准方向注释声明）

| 键 | 规格 | 备注 |
|---|---|---|
| `SPR.lancer[2]` | 14×14 枪虾哨兵两帧：橙红甲壳+白矛臂（帧 2 矛前伸 1px）；基准面左 | wind 态 ui 用帧 2 |
| `SPR.jelly[2]` | 12×12 水母两帧：浅蓝伞体+4 触须（帧 2 伞缘收缩） | 电弧为 ui 程序化 |
| `SPR.ghost[2]` | 12×14 幽灵两帧：紫白渐变（硬边三阶）+下摆拖尾（帧 2 下摆偏摆）；整图允许边缘透明渐隐 | ui globalAlpha 0.78 |
| `SPR.boomer[2]` | 10×10 魂火两帧：蓝白火苗（帧 2 膨胀 +1px 外焰） | 自爆演出=引擎粒子 |
| `SPR.eliteCrown` | 8×6 金冠（可选，缺省 ui 跳过） | 精英头顶覆盖 |

### 4. 新 Boss 部件组（H4 核心：键集合与 SPR.boss 完全一致）

```js
SPR.boss2 = { // 蛟龙·敖渊（64×40 长躯，青金配色；kind=2）
  body:[2], bodyRage:[2], arm, armRage, jaw:[2], jawRage:[2],
  eye, eyeRage, eyeDizzy, pupil, core:[2], coreRage:[2] }
SPR.boss2White = { body, arm, jaw }              // 白剪影三件（沿 bossWhite 先例）
SPR.boss3 = { // 幽冥判官（40×52 高袍+官帽，暗紫+鬼火绿点缀；kind=3）
  …同键集合… }
SPR.boss3White = { body, arm, jaw }
```
- 部件语义对齐 renderBoss 装配（ui.js:1170-1227）：body 主体两帧呼吸/arm 双臂对称单帧（右臂=翻转）/jaw 闭口两帧/
  eye 三态+pupil 瞳孔/core 核心两帧。蛟龙 arm=侧鳍/尾掌、jaw=龙口、core=龙珠；判官 arm=镰臂、jaw=兜帽阴影、core=官印。
- body 帧尺寸=64×40 / 40×52（与 BAL.boss2/3.w/h 一致，ui 按图心对齐命中框，设计书 §9.3）。

### 5. 新机关/道具精灵

| 键 | 规格 |
|---|---|
| `SPR.chest[2]` | 16×14 宝箱：帧 1 闭合（棕木+金边+锁扣）、帧 2 开启（盖开+内金光） |
| `SPR.lantern[2]` | 12×16 地府灯笼：红灯笼+吊穗，内焰两帧（黄/白交替） |

## 交付自测（真实跑，输出贴交付说明）

1. `node tools/gate.js art` —— 退出码 0（导出符号含既有全量；新键不在 gate 核对表内，另行自查）。
2. `node --check art.js` —— 通过。
3. 键自查（node -e 或临时脚本，`new Function(src)` 编译后正则核对）：THEMES 含 12 键（十旧+sea+nether）；
   `SPR.boss2/boss2White/boss3/boss3White` 四字典存在且各含 13/3 键（与 SPR.boss/bossWhite 键名逐一对照，脚本打印 diff=0）；
   `SPR.lancer/jelly/ghost/boomer` 各 2 帧；`SPR.chest/lantern` 各 2 帧；`buildThemeArt('sea')`/`('nether')` 返回含
   `hidden/waterL/waterR` 三键（**此步需 DOM**——用 `_art_shots.py` 模式 playwright 跑或写 node+node-canvas 替代；
   至少以源码正则证明三键存在于两主题分支内，标注"渲染验证待界面队联调"）。
4. 截图自证（可选加分）：`?level=11`/`?level=14` 界面队联调前无法看新主题——改为临时 HTML 单页
   （离屏构建 buildThemeArt('sea'/'nether') 平铺 4×4 tiles + bg 两层 + 新精灵图集）截图贴交付说明。

交付说明含：任务清单 5 项完成状态、自测 4 项输出、新键清单（供界面队/框架队核对）、H5 体积增量实测。
