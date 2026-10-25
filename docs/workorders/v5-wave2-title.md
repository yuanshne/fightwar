# 工单 · 封面队（第二波）：封面重做 + 全 UI 原神皮肤 + 存档迁移（ui.js）

> 所有权：**只许改 `pixel-quest/ui.js`**。设计基准：`docs/specs/2026-10-24-v5-design.md`
> §5.5（面板皮肤）、§6（封面/选关/真结局/迁移）、§8。前置：风格队已交付 SPR.cover 与
> puzzleUI 新皮肤（同键）；关卡队已交付 10 关。现状引用：renderMenu ui.js:879-914、
> renderVictory:916-923、CREDITS_LINES/renderCredits:926-950、loadProgress:156-162、
> step select 分支:1150-1159、clear 星级/unlocked:1186-1193、HUD:740-819、
> boot:1216-1229、renderHUD 神龛计数:760-768。
>
> **硬约束（违背即验收失败）**：
> H1 `node --check ui.js` + `node tools/gate.js engine` 双绿；
> H2 **存档向后兼容**：pq_progress 旧字段（unlocked/stars/puzzles）与 pq_audio/pq_music
> 键名只增不改不删；§D 迁移逻辑全游戏只此一处；
> H3 素材全部走 SPR.cover（风格队产出）+ 程序化绘制，**不新增外部队依赖**；
> H4 第一波已交付的战斗演出/浮字/技能特效渲染**不得回退**（本波只加皮肤与封面）。

## 任务清单
1. `_panel()` 切角面板绘制函数 + 全 UI 换皮（§A）
2. 封面：构图/星空/流星/动态 logo/呼吸光按钮（§B）
3. 选关屏 5×2 十卡布局 + STARS/30（§C）
4. 存档迁移 + 真结局致谢（§D）
5. HUD 换肤（§E）

---

## §A _panel() 与全 UI 换皮

```js
function _panel(x,y,w,h,opt){ // 内部：原神风切角面板（设计书 §5.5）
  opt=opt||{};
  const cut=opt.cut===undefined?4:opt.cut;          // 四角 45° 切角
  ctx.beginPath();
  ctx.moveTo(x+cut,y);ctx.lineTo(x+w-cut,y);ctx.lineTo(x+w,y+cut);
  ctx.lineTo(x+w,y+h-cut);ctx.lineTo(x+w-cut,y+h);ctx.lineTo(x+cut,y+h);
  ctx.lineTo(x,y+h-cut);ctx.lineTo(x,y+cut);ctx.closePath();
  ctx.fillStyle='rgba(14,26,58,'+(opt.alpha||0.82)+')';ctx.fill();
  ctx.strokeStyle='#f0c860';ctx.lineWidth=1;ctx.stroke();
  ctx.save();ctx.clip();                             // 内亮线（双线描边）
  ctx.strokeStyle='rgba(120,160,255,0.35)';ctx.strokeRect(x+1.5,y+1.5,w-3,h-3);ctx.restore();
  if(opt.titleBar){ctx.fillStyle='rgba(240,200,96,0.25)';ctx.fillRect(x+cut,y+1,w-cut*2,9);}
}
// 换皮对象（逐处替换原底/描边绘制，布局与文案不变）：
// 1) HUD 顶栏（ui.js:743）：底改 rgba(10,18,42,0.62)+底缘 1px 金线（fillRect(0,15,VIEW_W,1)）；
//    心形 HP 行/技能槽/O 充能点外框各套 _panel 小版（cut=2）；
// 2) 暂停层（renderPause:849）：整块 _panel(72,60,240,104,{titleBar:1})；
// 3) 通关结算（renderClear:856）：_panel(48,32,288,140)；
// 4) Boss 血条名牌（renderHUD:789-796）：底改深蓝+金细线（色值同 _panel）；
// 5) 谜题覆盖层（renderPuzzleOverlay:1004-1022）：程序化木框底删除（SPR.puzzleUI 拼接保留，
//    风格队已换深蓝金皮肤件）；内板色 '#141a30'→'#10162e'；
// 6) hint 条：文案底部加 _panel(VIEW_W/2-110,VIEW_H-46,220,14,{alpha:0.55,cut:2})；
// 7) 谜题"解开横幅"（ui.js:1028）与选关卡（§C）同套。
```

## §B 封面（renderMenu 的 title 分支重写）

```
构图（384×224，设计书 §6.1）：
 1 底：夜空渐变 #0e1238→#2c3472（覆盖原主题渐变）；
 2 星空缓移：40 颗星（mulberry32(2025) 一次生成存模块级常量表 [{x,y,s,c,w,ph}]，
   1~2px，白/金/青），每帧 x-=w px/s（w=2..6），x<0 回卷 384；
   alpha=0.5+0.5*|sin(tick*0.05*w+ph)|；
 3 三层云海：SPR.cover.cloudA/B/C 各 512×80 平铺，
   滚动 offsetA=(t*4)%512 / offsetB=(t*10)%512 / offsetC=(t*18)%512，
   y=132/156/184；C 层顶部叠 1px rgba(248,208,72,.5) 金边受光；
 4 Boss 巨影：SPR.cover.bossSil 画于 (250,22)，随 sin(tick*0.01) 呼吸 ±1px；
 5 主角剪影：SPR.cover.heroSil 画于 (96,118)，随 sin(tick*0.03+1) 悬浮 ±2px；
 6 流星：确定性触发——const MT=[300,640,920];  // tick 帧
   活动窗 t∈[t0,t0+42]（0.7s）：画 SPR.cover.meteorStreak[(tick/4|0)%2] 于
   (x0+(tick-t0)*200/60, 10+(tick-t0)*80/60)，x0=((t0*37)%180)，后随 3 粒金 fx；
   （fx 用第一波 fxParts 渲染管线——title 态 simUiFx 需放开推进：uiState==='title' 也推进）
 7 动态 logo「像素勇者」：四字逐字弹入——第 i 字（drawCNText 34px，间距 40px，
   起始 x=VIEW_W/2-60）：i*7 帧后自 y-40 落到 y=52，落地 6 粒金 fx+shake 1；
   落定后整组 sin(tick*0.04) ±2px；每字落下时画 6px 金色拖尾竖线（fillRect 1×6 渐隐）；
 8 副标 "PIXEL QUEST"（drawPixelText scale 2，金属渐变三遍叠画）：
   '#6e5a20' at (+1,+1) → '#f8d048' at (0,0) → '#fff8c8' at (-1,-1)，y=96；
 9 开始按钮：_panel(VIEW_W/2-52,146,104,22,{cut:3}) + 文案「按 回车 开始」12px，
   呼吸光：金描边 alpha 0.35+0.3*sin(tick*0.08)（重描 stroke 一遍）；
 10 底部操作条：_panel(32,198,320,18,{alpha:0.5,cut:2}) 内画现有按键提示行。
选关分支见 §C；titleArt 缓存不再用 grass 主题瓦片（地面行删除，云海接底）。
```

## §C 选关屏（10 关 5×2）

```js
// renderMenu select 分支重写：
drawCNText('选择关卡',VIEW_W/2,14,15,'#f0f4ff','center');     // 金描边可省
for(let i=0;i<LEVELS.length;i++){                              // LEVELS.length=10
  const col=i%5,row=Math.floor(i/5);
  const x=6+col*75,y=32+row*64;                                // 卡 68×52
  const locked=i+1>progress.unlocked,sel=menuSel===i;
  _panel(x,y,68,52,{alpha:locked?0.7:0.85,cut:3});
  if(sel){ctx.strokeStyle='#fff8c8';ctx.lineWidth=2;ctx.strokeRect(x+1,y+1,66,50);
    if(tick%40<24){ctx.fillStyle='#fff';ctx.fillRect(x-7,y+25,4,2);ctx.fillRect(x+71,y+25,4,2);}}
  drawCNText(locked?'???':LEVELS[i].name,x+34,y+7,9,
    locked?'#5a6488':'#f0f4ff','center');                      // 名≤6 字×9px=54 ✓
  const st=progress.stars[i]||0;
  drawCNText(st?'★'.repeat(st)+'☆'.repeat(3-st):'☆☆☆',x+34,y+26,12,
    locked?'#3a4468':'#f8d048','center');
  drawPixelText(''+(i+1),x+34,y+42,1,locked?'#5a6488':'#a8b4d8','center');
}
// 底栏（y=196）：'←→↑↓ 选择　回车 进入　Esc 返回' + STARS 合计 '/30'
// step() select 分支导航键改写：左右 ±1、上下 ±5（clamp 0..9），其余逻辑不变。
```

## §D 存档迁移 + 真结局

```js
// loadProgress（ui.js:156）末尾追加（一次性迁移，设计书 §6.4）：
function migrateProgress(p){
  if(p && p.unlocked>=7 && !p.v5m){       // 老玩家已见 Boss：终章直接解锁
    p.unlocked=Math.max(p.unlocked,8); p.v5m=1; saveProgress(p);
  }
  return p;
}
// 真结局：clear→credits 判定已自适应（levelIdx=9 为最后关）；renderCredits 重写文案：
const CREDITS_LINES=[                                       // v5 真结局版（照抄）
  ['像素勇者',20,'#ffffff'],['PIXEL QUEST',11,'#f8d048'],['v5 · 真结局 · 星之旅途',12,'#f8e8a0'],
  ['十关全通，星核巨兽已倒下！',12,'#f0f4ff'],['翡翠风谷的风、落日王城的钟、',11,'#c8d4ec'],
  ['星空回廊的門，都記得你。',11,'#c8d4ec'],['——',11,'#5a6488'],
  ['企划·数值·美术指导：GLM-5.3 设计师',11,'#c0c8e0'],['引擎·手感：Flash 手感队',11,'#c0c8e0'],
  ['关卡·谜题：Flash 关卡队',11,'#c0c8e0'],['美术·风格：Flash 风格队/特效队',11,'#c0c8e0'],
  ['界面·封面·音效：Flash 演出队/封面队',11,'#c0c8e0'],['——',11,'#5a6488'],
  ['风格致敬：原神（米哈游）/ 4399《冒险王》',11,'#c0c8e0'],['——',11,'#5a6488'],
  ['特别感谢：正在游玩的你！',13,'#f8d048']];
// renderCredits 标题行改「～ 真结局 ～」（金）+ 星数 TOTAL STARS x/30；
// L7 通关（levelIdx=6<9）回车仍进 L8（现有 next-level 逻辑不动）；
// L10 通关 clear 屏文案：'回车 · 通关结算' 保持，进 credits 即真结局版。
// renderVictory 函数已不可达（保留不删，防回退）。
```

## §E HUD 换肤（叠加在第一波演出之上）
- 顶栏/心形/技能槽/Boss 名牌按 §A-1/§A-4 替换底色与描边；
- 神龛计数行（ui.js:760-768）：total 取 `Object.keys(PUZZLES).length`（=9，键 1..6+8..10 自动），
  图标底加 1px 金描边；
- 星级/金币/时间/死亡文字色按 §5.5 色系（主文本 #f0f4ff/金 #f8d048/危险 #f87858）。

## 自测断言（全部真实执行）
1. `node --check ui.js`、`node tools/gate.js engine` 双绿。
2. 浏览器实测（截图贴交付说明）：
   - 标题：星空缓移/流星/逐字 logo/云海三层/呼吸光按钮；30 秒内无掉帧肉眼可见卡顿；
   - 旧存档迁移：手工在 DevTools 预置 `pq_progress={"unlocked":7,"stars":{"0":3},"puzzles":{"1":true}}`
     → 刷新后 unlocked=8、stars/puzzles 原样、v5m=1；
   - 选关：10 卡 5×2，锁卡 ???，导航上下跨行（0↔5）；STARS x/30；
   - L7 通关回车 → L8；L10 通关 → 真结局致谢（文案见 §D）；
   - 谜题覆盖层深蓝金皮肤拼接无缝（八件齐缝）；HUD 切角框无破形；
   - 第一波功能回归：二段跳/浮字/O 演出/护盾六边形仍正常。
3. `git diff --stat` 只改 ui.js。

## 验收标准
- 上述全绿；无任何 localStorage 键被改名/删除（DevTools Application 面板前后对比为证）；
- 封面静态截图达设计书 §6.1 构图（主角左下跃起、Boss 右上巨影、云海三层、金色 logo）。
