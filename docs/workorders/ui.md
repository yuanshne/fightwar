# 工单 · 界面队：Boss 血条 / 技能栏 / 心形 HP / 登场演出 / 致谢屏 + gate.js L7 冒烟（ui.js + tools/gate.js）

> 所有权：**只许改 `pixel-quest/ui.js` 与 `pixel-quest/tools/gate.js`**（另允许在 `tools/` 新增 `_v3_*` 测试脚本）。
> 设计基准：`docs/specs/2026-10-24-v3-boss-design.md` §4/§5/§7/§8。素材键以美术工单（art.md §C5/§D/E）为准。
> 引擎字段以引擎工单（engine.md）为准：`game.boss / game.drops / game.meteors / game.waves /
> game.skills{u,i,o} / game.flashT / game.input.skillUHit|skillIHit|skillOHit /
> p.hp / p.invT / p.shieldT / p.castT / bullet.star / boss.state·phase·flashT·hp`。
> **硬约束**：
> H1. L7 空转 180 帧玩家不得死亡——由引擎侧激活半径 176px 保证（设计文档 §6 距离核算），
>     本队在 gate.js 写死断言兜底（§F）；
> H2. 攻击/冲刺/连击沿用 v2 接口：KEYMAP `attack:['KeyJ','KeyX']`、`dash:['KeyK','ShiftLeft','ShiftRight']`
>     与边沿桥接（ui.js:532-541）**原样保留**，技能键按同一模式扩展，不改不删；
> H3. `LEVELS` 7 关后 gate.js 主循环已自适应（gate.js:39-41 用 `LEVELS.length`，**已核实，勿改循环**），
>     本队只做两件事：桩 THEMES 补 `'boss'`（gate.js:35）+ 追加 L7 冒烟断言（§F）。
> 注：`index.html` 底部操作提示行加 U/I/O 由主 agent 合入时更新，不属本队文件。

## 任务清单

1. KEYMAP + 输入桥接：技能 U/I/O（§A）。
2. 渲染新实体：Boss 部件装配/眼追踪/白闪/狂暴换装、星弹、流星、冲击波、掉落心（§B）。
3. HUD：心形 HP、Boss 血条、技能栏+连斩充能（§C）。
4. 登场演出横幅 + 连斩全屏演出 + 护盾泡泡 + nova 预警环（§D，全部程序化绘制，不依赖新素材）。
5. 选关 7 格 + 通关文案 + 致谢彩带名单屏（§E）。
6. 音效 7 个新事件（§G）。
7. gate.js：桩补 'boss' + L7 空转断言（§F）。

---

## A. 输入（v2 模式复刻）

```js
// KEYMAP（ui.js:29-35）追加三行——不动既有键：
skillU:['KeyU'], skillI:['KeyI'], skillO:['KeyO'],
// step() 边沿桥接（ui.js:537-541 的 if 块内追加）：
if(hit('skillU'))game.input.skillUHit=1;
if(hit('skillI'))game.input.skillIHit=1;
if(hit('skillO'))game.input.skillOHit=1;
// 暂停/进关清锁存处（ui.js:149,562）同步补三个字段清零，防 stale 边沿。
```

## B. Boss 与新实体渲染

### B1. Boss 部件装配（renderBoss，插在 renderEntities 后、renderPlayer 前）

```js
function renderBoss(tick){
  const b=game.boss; if(!b||b.state==='dead')return;
  const p=game.player, R=b.phase===2;                 // 换装组选择
  const B=R?SPR.boss.bodyRage:SPR.boss.body, A=R?SPR.boss.armRage:SPR.boss.arm,
        J=R?SPR.boss.jawRage:SPR.boss.jaw;
  // 状态偏移表：[bodyDy, armDy, jaw开?, eyeType]  （dx 基准见下）
  //  dormant:0/14/闭/暗眼(alpha.5)  idle:呼吸帧/14/闭/眼
  //  windup(leap):+3/6/开/眼        leapAir:-4/0/开/眼
  //  windup(charge):+2/18/闭/红眼   chargeRun:+1/16/开/红眼
  //  stagger:+5/20/闭/晕眼          recover:+2/16/闭/眼
  //  windup(barrage|nova):0/10/开/红眼  novaCast:-2/2/开/红眼
  //  summonCast:0/8/开/眼           intro/enrage:-2/4/开/红眼
  //  dying: 随引擎 y 下沉 +12/12/开/晕眼 + (tick%8<4) 整体 alpha .5
  // 基准偏移：body(b.x-6, b.y-2+bodyDy)（呼吸帧=tick 慢周期取 B[0/1]）
  //          armL(b.x-10, b.y+12+armDy)  armR=flipSprite(A) 画于 (b.x+b.w-10, b.y+12+armDy)
  //          jaw(b.x+16, b.y+36)  eyeL(b.x+8,b.y+10)  eyeR(b.x+b.w-20,b.y+10)
  //          core(b.x+20,b.y+20) 取帧 (tick*(R?10:6)|0)%2
  // 瞳孔追踪：对每只眼，ex=clamp((p.x-eyeCx)/40,-1,1)*2, ey=clamp((p.y-eyeCy)/40,-1,1)*2，
  //          drawImage(SPR.boss.pupil, eyeCx-2+ex, eyeCy-2+ey)（dizzy 态不画瞳）
  // 白闪：b.flashT>0 → 再画一遍 SPR.bossWhite.{body,arm,jaw[1]} 同偏移，alpha=b.flashT/0.12
}
```

### B2. 其余新实体（renderEntities 追加）

```js
// 星弹：renderEntities 炮弹循环改：
for(const b of game.bullets)ctx.drawImage(b.star?SPR.bossBullet[(game.tick*8|0)%2]:SPR.bullet,px(b.x),px(b.y));
// 流星（带落点预警：目标 x 处地面 1px 金线闪烁）
for(const m of game.meteors){ if(m.delay>0)continue;
  ctx.drawImage(SPR.meteor[(game.tick*10|0)%2],px(m.x),px(m.y)); }
// 冲击波（vx<0 用翻转帧）
for(const w of game.waves){ const img=SPR.waveFx[(game.tick*12|0)%2];
  ctx.drawImage(w.vx<0?flipCache(img):img,px(w.x-2),px(w.y)); } // 翻转帧启动时缓存一次
// 掉落心（最后 2s 闪烁）
for(const d of game.drops){ if(d.life<2&&game.tick%8<4)continue;
  ctx.drawImage(SPR.heartFull,px(d.x),px(d.y+Math.sin(game.tick*4)*1.5)); }
```

## C. HUD（renderHUD 扩展，ui.js:417-443）

```js
// ① 心形 HP（顶栏下方）：x=4+i*11, y=19, 8×8
for(let i=0;i<5;i++){
  if(p.invT>0&&game.tick%6<3)continue;               // 无敌闪烁：整排隔帧隐藏
  ctx.drawImage(i<p.hp?SPR.heartFull:SPR.heartEmpty,4+i*11,19);
}
if(p.hp<=2&&game.tick%30<15){ctx.strokeStyle='#f84848';ctx.strokeRect(2.5,17.5,58,11);} // 低血红框脉冲
// ② Boss 血条（game.boss 存在且 state!=='dormant' 时）：
//   名牌：黑底 (82,17,52,11) + drawCNText('星核巨兽',84,18,8,'#f8d048')
//   条底：rgba(10,10,18,.7) (128,19,174,9)；血量：宽 172*hp/60，色 P1 '#f8d048' / P2 '#f84848'
//   50% 刻度：x=128+86 竖线 1px '#f0f0f8'；受击 2 帧整条画白 (b.flashT>0.09 时)
//   dying 态：血条闪烁后随 levelClear 消失（state==='dying' 时 alpha=1-b.t/2.2）
// ③ 技能栏：槽 x=162+i*22, y=198, 16×16（i=0,1,2 ↔ U,I,O）
//   底：rgba(10,10,18,.55) + 1px 描边；图标 SPR.skU/skI/skO 画于 (x+2,y+2)
//   键位字母：drawPixelText('U'|'I'|'O', x+11, y+9, 1, '#f0f0f8')
//   CD 罩：cd>0 时 rgba(0,0,0,.6) fillRect(x, y, 16, 16*cd/Max)（Max=8/12/20）
//   就绪脉冲：cd<=0 且 tick%20<10 → 金色 1px 描边 strokeRect
//   O 槽充能：8 个 2×2 点 x=234+i*4, y=206：i<min(game.combo,8) 亮 '#f8d048' 否则 '#3a3a4a'
//   （combo≥8 且 cd<=0 时 O 图标整体加发亮描边）
// ④ 施法/无敌/护盾的玩家侧表现：
//   p.castT>0：heroPoseImg 优先取 SPR.heroAttackGold(+L)（缺素材回退 heroAttack，同 v2 模式 ui.js:336-338）
//   p.shieldT>0：玩家周围金泡泡 ctx.arc(p.x+5,p.y+7,14) 双圈，alpha=.5+.3*sin(tick*8)，色 '#f8d048'
//   p.invT>0：renderPlayer 内隔帧跳过绘制（同 ① 的节拍）
```

## D. 演出（全程序化，无新素材）

1. **登场横幅**（`game.boss.state==='intro'`）：
   上下黑边各 24px（`rgba(0,0,0,.8)`，前 8 帧滑入、最后 12 帧滑出，按 `b.t` 插值）；
   中央 `drawCNText('星核巨兽',VIEW_W/2,86,26,'#f8d048','center')`；
   下方 `drawPixelText('STARCORE BEHEMOTH',VIEW_W/2,120,1,'#f0f0f8','center')`；
   名字打入抖动：`b.t<0.3` 时 x 加 `(Math.random()*4-2)`。
2. **流星连斩**（`game.flashT>0`）：全屏白 `rgba(255,255,240,flashT/0.15)` +
   两条对角粗斩线（lineWidth 4→1，'#ffffff' 与 '#f8d048'，随 flashT 衰减退场）。
3. **nova 预警环**（`boss.state==='novaCast'`）：Boss 中心 `ctx.arc` 半径 `=b.t*90`、
   alpha `.6-.5*b.t` 的 '#f86030' 圆环——玩家可读的躲避提示（设计 §3「可预判可反制」）。

## E. 选关 7 格 / 通关文案 / 致谢屏

1. 选关网格改 3 列 ×3 行（7 格）：`for(let i=0;i<LEVELS.length;i++)`（原 `i<6`，ui.js:493）；
   单元格 `y=38+row*56`（行高压缩 66→56）、高 50、宽 104 不变；表头 y=18 不变；
   底部提示移到 y=204、`STARS '+total+'/21'` 移到 y=215（原 192/208 会被第三行压住）。
2. `menuSel` 边界：右/左 `Math.min(LEVELS.length-1 / 0, ...)`（原硬编码 5，ui.js:551-552）；
   下移条件改 `menuSel+3<LEVELS.length`；**补上移键** `hit('up')`：`menuSel>=3 → menuSel-=3`（原缺）。
3. 通关屏（ui.js:469）文案 `game.levelIdx<LEVELS.length-1` 已自适应无需改；
   renderVictory（ui.js:512-519）改：`'七关全通，星核巨兽已倒下！'`、`'/21'`——但 v3 中
   L7 结算按回车不再进 victory，而进 **credits**：
   ```js
   // step() clear 分支（ui.js:569-572）：
   if(game.levelIdx<LEVELS.length-1){startLevel(game.levelIdx+1);}
   else{uiState='credits';creditsT=0;fade=1;fadeDir=-1;}
   // renderCredits(tick)：深空底 + 彩带粒子雨（ui 自持数组，60 条，4 色矩形，x 均布、y=(t*spd+i*37)%260）
   // 滚动名单（creditsT 驱动 y 从 230 → -160）：
   //   『像素勇者 PIXEL QUEST』/ v3 · BOSS·星核巨兽 /——/ 企划·数值：GLM-5.3 设计师 /
   //   引擎：Flash 引擎队 / 关卡：Flash 关卡队 / 美术：Flash 美术队 / 界面·音效：Flash 界面队 /
   //   ——/ 风格致敬：4399《冒险王》/ 闪翼双星 / ——/ 特别感谢：正在游玩的你！
   // 底部常驻：'回车 · 返回标题'（tick%50<32）；hit('confirm')&&creditsT>1 → uiState='title'
   ```
4. `frame()` 循环里 `if(uiState==='victory')renderVictory(...)` 旁加 `if(uiState==='credits')renderCredits(...)`。

## F. gate.js（本队所有权内，两处小改）

```js
// ① gate.js:35 桩主题补第 7 键（不改则 engine 在桩里 THEMES.boss 为 undefined——
//    引擎侧有 ||{} 兜底也能过，但补上让门禁环境更接近真实）：
['grass','cave','sky','factory','lava','tower','boss'].forEach(k => themes[k] = {});
// ② 主循环（gate.js:40-53）**不动**——已按 LEVELS.length 自适应（H3 已核实）。
//    循环结束后追加 L7 冒烟断言（设计硬约束 H1）：
const last = nLevels - 1;
sandbox.loadLevel(last, false);
sandbox.game.state = 'play';
if (sandbox.game.boss) {
  for (let f = 0; f < 180; f++) sandbox.updateWorld(1 / 60);   // 纯空转 180 帧
  const g = sandbox.game;
  if (g.player.dead || (g.player.hp !== undefined && g.player.hp < 5) || g.boss.state !== 'dormant') {
    console.error('L7 Boss 违约: 空转180帧 dead=' + g.player.dead + ' hp=' + g.player.hp + ' boss=' + g.boss.state);
    process.exit(1);
  }
  console.log('engine L7 Boss 冒烟 OK: 空转180帧 玩家存活 Boss=dormant');
}
```

## G. 音效（SFX 表追加，ui.js:85-106）

```js
roar(){tone({f:90,f2:45,d:0.5,v:0.35,type:'sawtooth'});noiseSfx({d:0.35,v:0.25});},
meteor(){tone({f:1200,f2:200,d:0.25,v:0.2,type:'square'});noiseSfx({d:0.2,v:0.18});},
shield(){[659,880,1319].forEach((f,i)=>tone({f,d:0.12,v:0.18,at:i*0.05,type:'triangle'}));},
ult(){noiseSfx({d:0.4,v:0.35});[523,659,880,1047,1319].forEach((f,i)=>tone({f,d:0.1,v:0.2,at:i*0.04}));},
heart(){tone({f:784,d:0.08,v:0.18,type:'triangle'});tone({f:1046,d:0.12,v:0.18,at:0.07,type:'triangle'});},
hurt(){tone({f:220,f2:90,d:0.18,v:0.28,type:'square'});noiseSfx({d:0.1,v:0.2});},
bosshit(){tone({f:150,f2:60,d:0.1,v:0.22,type:'square'});},
```

## 门禁与自测（全部执行并贴输出）

1. `node --check ui.js`、`node --check tools/gate.js` → 通过。
2. `node tools/gate.js art && node tools/gate.js levels && node tools/gate.js engine` → 全绿，
   且 engine 输出多出 `engine L7 Boss 冒烟 OK: 空转180帧 玩家存活 Boss=dormant`（§F 生效的证明）。
3. 浏览器冒烟（新建 `tools/_v3_uismoke.py`，playwright，模式照抄 tools/browsertest.py）：
   - `?level=7` 载入 600ms：`game.state==='play'`、`game.boss.state==='dormant'`、控制台零 error，截图 `testshots/lv7_start.png`；
   - `game.player.x = game.boss.x - 140` 传送后等 2.5s：`game.boss.state` 已离开 `'dormant'`（intro/idle/windup），
     HUD 截图 `lv7_boss.png`（验血条/技能栏/心形 HP 可见）；
   - `game.boss.hp=1; game.input.attackHit=1`（evaluate 注入后 3 帧）→ 3s 后 `game.state==='clear'`，
     按 Enter → `uiState==='credits'` 截图 `lv7_credits.png`；
   - 选关屏 `?` 进入 select 截图 `select7.png`：7 格、`STARS x/21`。
4. 回归：`?level=1` 攻击（J）冷却/弧光/连击弹字照旧；K 冲刺残影照旧（H2：未动 v2 桥接的证明）。

## 不做（越界即失败）

- 不改 engine.js / art.js / levels.js / index.html。
- 不改 gate.js 主循环与既有三模式输出格式（只做 §F 两处）。
- 不删不改 v2 的 KEYMAP attack/dash 与边沿桥接结构（只追加）。
