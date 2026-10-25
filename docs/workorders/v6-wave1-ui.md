# 工单 · 界面队（第一波）：鼠标系统 / 提示卡 / O 引导 / 神龛指引 / HUD 改版 / 新实体渲染（ui.js）

> 所有权：**只许改 `pixel-quest/ui.js`**。设计基准：`docs/specs/2026-10-24-v6-design.md` §4/§5/§8（下称"设计书"）；
> 数值见 `docs/specs/2026-10-24-v6-balance.md`。现状行号基于 ui.js 1677 行。
> 依赖（已核对）：`fitScreen`(ui.js:72-76)、KEYMAP(:80-90)、SFX(:141-184)、`startLevel`(:411-427)、
> `render` 世界绘制序(:469-484)、`renderHUD` 技能槽(:1106-1121)/O 点条(:1122-1126)/心形(:1081-1088)、
> hint 条(:489-495)、`renderShrines`(:1399-1410)、`step` 输入桥接(:1567-1585)、`puzzleNearIdx`(:241-248)。
> 依赖引擎 v6 字段：`game.input.down/skillLHit、game.skills.l、game.blades、bullets[].fire、
> 敌 e.ai/e.guardDown、p.maxHp`（未合入时守卫式降级到 v5 表现，零异常——沿 v5 §H4 先例）。
>
> **硬约束（违背即验收失败）**：
> H1 门禁：`node --check ui.js` 通过 + `node tools/gate.js engine` 退出码 0（连带回归）。
> H2 鼠标为增强不替代键盘：§A.5 对照表全项有键盘等价；不抢焦点、不 preventDefault 键盘事件以外的东西。
> H3 容量守卫不回退：不新增任何绕过 engine 守卫的粒子直 push（渲染侧只读）。
> H4 第一波结束游戏完整可玩：引擎 v6 未合入时（`typeof game.blades==='undefined'` 等）全部静默降级。
> H5 不碰 localStorage 既有键；新增仅 `pq_hint_fall`（§E.3）。
> H6 不动谜题覆盖层/暂停/选关既有逻辑（除 §F 选关卡鼠标点击增强）。

## 任务清单（按序）

1. §A 鼠标系统（坐标/悬停/点击）+ 悬停目标表
2. §B 技能提示卡（4 槽文案冻结）
3. §C HUD 改版：4 技能槽 / O 充能点内嵌 / 9 心面板 / 速降提示
4. §D O 技能引导（金呼吸 + 每关一次大提示）
5. §E L1 技能提示条 + 速降一次性 toast
6. §F 神龛指引（光柱 + HUD 左下箭头）+ hint 追加行
7. §G 新实体渲染消费：星刃/法师/火球/敌前摇（守卫式）
8. §H 新 sfx 合成 + §N 自测

---

## §A 鼠标系统

### A.1 坐标（设计书 §4.1 代码照抄）

`mouse={x,y,inside,down,click}`；mousemove 换算 `(e.clientX-rect.left)*(VIEW_W/rect.width)`；click 为单步边沿（`step()` 末与 `clearPressed()` 同位点清零——放进 `while(acc>=1/60)` 循环内 `clearPressed()` 旁）。

### A.2 悬停目标表（每帧构建 `hover`，id 与 rect 见设计书 §4.2）

- 技能槽 4（§C 新布局）、hearts、bossbar、coins、shrinehud（§F）；悬停高亮=`#fff8c8` 1px 描边。
- `hover` 计算放 `render()` HUD 段之前（用最新 mouse）；鼠标不在 canvas 内恒 null。

### A.3 技能槽点击施放

`mouse.click && hover==='skill:i'` → 与键盘同管线：`game.input[['skillU','skillI','skillO','skillL'][i]+'Hit']=1`（仅 `uiState==='play' && !game.paused && !puzzle.open`）。

### A.4 鼠标不替代键盘（H2）

对照表=设计书 §4.5；实现要点：title/select 的鼠标进入路径必须与 `hit('confirm')` 走同一分支（例：select 卡单击=`menuSel=i; SFX.select()`，双击=确认分支复用 `:1601-1604`）。

### A.5 Tab 键防焦点逃逸（为波2 背包预留，本波只加监听）

`addEventListener('keydown', e=>{ if(e.code==='Tab') e.preventDefault(); })`（本波无 Tab 行为，仅阻断浏览器焦点移动）。

## §B 技能提示卡（文案冻结=设计书 §4.3 表，逐字照抄）

- 4 槽卡容器 `_panel(clamp(slotX-67,4,VIEW_W-154), 146, 150, 46, {cut:3})`；四行布局与配色按 §4.3。
- CD 行动态：`'KEY '+letter+'  CD '+Math.ceil(cd)+'S'`，就绪 `'READY'`；O 行4 条件色：`game.combo>=8?'#8ad8a0':'#f87858'`。
- 卡在 `renderHUD` 末尾绘制（最顶层）；同帧只显示 hover 的那张。

## §C HUD 改版

1. 技能槽循环 3→4（ui.js:1109）：`skDef=[['U',SPR.skU,8,sk.u],['I',SPR.skI,12,sk.i],['O',SPR.skO,20,sk.o],['L',SPR.skL,6,sk.l]]`（`SPR.skL` 缺失时槽内只画字母，守卫）。`sk=game.skills||{u:0,i:0,o:0,l:0}`。
2. **删除**独立 O 点条（ui.js:1122-1126，与新 4 槽 x=228 冲突）：8 点改画在 O 槽底行 `(x+206 的槽内, y+13)`，每点 2×2px 连排（8×2=16px 满宽），`i<Math.min(game.combo,8)` 亮 `#f8d048`。
3. 心形面板：`_panel(1,16,104,14,{cut:2})`；循环上限 5→`p.maxHp||5`（引擎 v6 `p.maxHp`，缺省 5=现行为）；空槽画 `heartEmpty` 至 maxHp。
4. 其余 HUD（金币/钥匙/时间/死亡/连击/Boss 条/神龛计数）不动。

## §D O 技能引导（设计书 §4.6）

1. O 槽金呼吸：条件 `game.combo>=8 && sk.o<=0`（替换 ui.js:1127-1129 白描边）：双层描边 `#f8d048`/`#fff8c8`，alpha `0.4+0.4*Math.sin(game.tick*0.2)`，外扩 1px。
2. 大提示：`oHintDone`（`startLevel` 置 false）+ 上升沿 `game.combo>=8 && !oHintDone && game.skills && game.skills.o<=0` → `oHintDone=true; oHintT=2.5`。渲染 `_panel(VIEW_W/2-120,VIEW_H-64,240,18,{cut:3})` + drawCNText「连击已满！按 O 释放流星连斩」12px `#f8d048` 居中；尾 0.5s 渐隐；每关仅一次。

## §E L1 技能提示条 + 速降 toast

1. L1 技能条：`startLevel` 且 `idx===0` → `skillHintT=6.0`；渲染于 hint 条下 12px：`_panel(VIEW_W/2-110,VIEW_H-30,220,12,{alpha:0.55,cut:2})` + drawCNText「J 攻击 · K 冲刺 · 空格 跳×2」10px `#f0f4ff`；尾 1s 渐隐；仅 L1。
2. 速降 toast：`p.vy>100 && !p.onGround && !kd('down')` 连续累计 0.8s 且 `!localStorage.pq_hint_fall` → toast 2.5s「按住 ↓ 速降」（同 §D.2 面板样式，位置 `VIEW_H-46`），写 `pq_hint_fall='1'`。落地清零累计器。

## §F 神龛指引（设计书 §5 全文照抄）

1. 光柱：`renderShrines` 内、石碑绘制前，对每个未解神龛画 6px 金渐变竖柱（顶部 alpha 0.05→底 0.35，×pulse 0.75+0.25sin(tick×0.08)）+2px 亮芯；范围 `max(-8,cam.y-8)` 起 `VIEW_H+16` 高。`puzzle.open` 时不画。
2. HUD 左下 `(4,VIEW_H-18)`：`_panel(4,VIEW_H-18,64,14,{alpha:0.6,cut:2})` + 迷你石碑（程序化 8×10，金描边深青底+'?'）+ 箭头 `drawPixelText('<'|'>',…,2,'#f8d048')`（`_sign(s.x-p.x)`）+ 距离 `''+Math.round(Math.abs(s.x-p.x)/16)+'M'`。条件：本关有未解神龛且 `puzzleNearIdx()<0`。可悬停（§A.2 shrinehud）。
3. hint 追加行：hint 期且本关有未解神龛 → `(VIEW_W/2, VIEW_H-56)` drawCNText「本关藏有谜题神龛 · 寻找金色光柱」9px `#f8d048`（ui 本地判断，不动 levels.js）。

## §G 新实体渲染（全部守卫式，H4）

1. **星刃**（`game.blades||[]`）：`SPR.blade[(game.tick*14|0)%2]` 12×12，`bl.dir<0` 用 `flipCache`；回程帧序反转（`(game.tick*14|0)%2` → `1-…`）。画在 renderEntities 末尾（弹幕之后）。
2. **法师**（敌循环 e.type==='mage' 分支，加在 knight 分支旁 ui.js:628-640）：`SPR.mage[2]` 待机（`(e.t*3|0)%2`）；`e.ai.st==='cast'`（读条）→ `SPR.mageCast` + 头顶读条圈：`(e.x+6+e.face*4, e.y+2)` 心，半径 `2+8*(e.ai.t/0.8)` 金圈 `#f8d048` 1px + 末端 2×2 亮星；`e.face>0` flipCache。无素材程序化兜底：12×18 紫黑袍矩形 + 火心 2×2。
3. **火球**（bullets 渲染 ui.js:621）：`b.fire && SPR.fireball` → `SPR.fireball[(game.tick*10|0)%2]`（替代 bossBullet 分支优先级：fire 先判）；无素材兜底 6×6 橙圆 + 黄芯。
4. **敌前摇演出**：
   - 史莱姆压扁：`e.ai.st==='wind'`（压顶蓄力）→ drawImage 前 `ctx.save(); ctx.translate(cx, feetY); ctx.scale(1.25, 0.55);`（脚底锚定，同 _heroXform 思路 ui.js:808）；恢复 ctx.restore。
   - 蝙蝠瞄准线：`e.ai.st==='aim'` → 蝙蝠中心到玩家中心 1px 红点线（每 8px 一点 `rgba(248,88,88,0.35)`）。
   - 骑士举盾：`e.ai.st==='wind'||e.ai.st==='charge'` → `SPR.knightGuard[e.ai.st==='charge'?1:0]`（缺素材兜底=现 knight 帧 + 盾侧 2px 白条闪烁 `game.tick%8<4`）；破绽 `e.guardDown` → 头顶 3 粒白星（本地画 2×2 方点，非粒子池）。
5. **装备掉落/gearDrops**：波2 渲染（本波不实现；`game.gearDrops` 未定义时无分支）。

## §H 新 sfx 合成（ui.js SFX 表追加，参数=设计书 §8）

`blade`/`mage`/`pickup` 三事件（engine push → 队列消费自动生效）；equiP/shard 本波不加（波2）。

## §N 自测

1. `node --check ui.js` 通过。
2. `node tools/gate.js engine` 退出码 0（连带回归）。
3. 新 `tools/_v6_ui_hover_check.py`（playwright，参照 tools/_v5_ui_smoke.py）：
   - `?level=1`：悬停 4 槽逐一截图，断言提示卡区域出现非背景像素；O 点条内嵌渲染；
   - `?level=7`：Boss 条/心形悬停卡；`combo` 注入 8（console `game.combo=8`）→ O 金呼吸+大提示出现一次、2.5s 消失、再次注入不再弹；
   - L1 技能条 6s 消失；神龛光柱 L1 截图（金柱存在）+ HUD 左下箭头/距离；
   - 键盘回放：全程不移动鼠标完成 L1 前 10s（移动/跳/攻/技能），截图对比 v5 基线无回归。
4. 手测清单（交付说明逐项勾选）：鼠标缩放窗口 1×/2×/非整数倍下悬停命中正确（换算公式验证）。

交付说明含：以上结果 + 修改行号摘要 + 守卫降级点清单（H4）。
