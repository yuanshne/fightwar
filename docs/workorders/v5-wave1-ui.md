# 工单 · 演出队（第一波）：打击感演出/浮字/UI层粒子/技能特效渲染/新音效（ui.js）

> 所有权：**只许改 `pixel-quest/ui.js`**。设计基准：`docs/specs/2026-10-24-v5-design.md`
> §1/§2/§3/§5.4/§8。依赖：engine.js v5 手感队产出（`game.floats/fxParts/scars/ult/shakePend`、
> 玩家 `djT/turnT/stepT/landVy/atkAnim/atkWind/springAir`、敌人 `hp/kb/flashT/jitT/dvx/dvy`、
> `Level.portals/pends`、骑士敌）；特效队同波产出（SPR 新键，见 §F——**全部带存在性守卫，
> 特效队未合入时程序化兜底，不得抛异常**）。
> 现状引用：render 序列 ui.js:376-422、heroPoseImg:634-653、renderPlayer:655-687、renderSlash:708-729、
> renderParts:731-738、renderHUD:740-819、renderFlash:836-847、step:1117-1200、SFX:105-136。
>
> **硬约束**：H1 `node --check ui.js` + `node tools/gate.js engine` 双绿（引擎门禁与本文件
> 无耦合，跑它只为确认整体可玩）；H2 **不动 localStorage 任何键**（存档兼容）；H3 不改
> 游戏平衡数值（渲染/音频层工单）；H4 第一波结束时游戏完整可玩：所有新渲染对旧引擎字段
> 缺失（v5 未合入瞬间）静默降级到现行表现。

## 任务清单
1. UI 层粒子/浮字/爆坑推进与渲染（§A）
2. 主角演出：二段跳空翻+气环、跑动前倾、转身 squash、落地深 squash、冲刺三段姿态+速度线（§B）
3. 挥击弧光四帧时间轴 + 敌人白闪/抖动 + 击飞尸体 + 骑士渲染（§C）
4. 技能演出：O 六阶段覆盖层、U 瞄准圈+拖尾+爆坑、I 六边形护盾+闪烁+碎裂（§D）
5. 新机关渲染：风纹/传送门/吊灯（§E，守卫式）
6. 流光粒子渲染 + HUD 技能栏扇形 CD/呼吸光（§F）
7. 新音效合成（§G）

---

## §A UI 层粒子 / 浮字 / 爆坑（引擎只写、ui 推进）

```js
// —— step() 内（updateGhosts(dt) 旁调用，play 态推进；pause/谜题层不推进）——
function simUiFx(dt){
  if(uiState!=='play'||game.paused||puzzle.open)return;
  // ui 不推进引擎 hitStop/ult 冻结——这正是"冻结期火花仍动"的要点：
  // simUiFx 在 updateWorld 之前/之后都执行（世界冻结不影响它）。
  for(let i=game.floats.length-1;i>=0;i--){const f=game.floats[i];
    f.t+=dt; if(f.t>=f.life)game.floats.splice(i,1);}
  for(let i=game.fxParts.length-1;i>=0;i--){const p=game.fxParts[i];
    p.life-=dt; p.vy+=(p.grav||0)*dt; p.x+=p.vx*dt; p.y+=p.vy*dt;
    if(p.ring)p.r+=(p.r1-p.r)*(dt/Math.max(0.05,p.life0||0.3)); // 环扩张（life0 入队时快照）
    if(p.life<=0)game.fxParts.splice(i,1);}
  for(let i=game.scars.length-1;i>=0;i--){const s=game.scars[i];
    s.t+=dt; if(s.t>0.6)game.scars.splice(i,1);}
}
// —— render() 世界坐标系内、renderParts() 之后追加三个渲染函数 ——
function renderScars(){ // 陨石爆坑：暗色椭圆 0.6s 渐隐
  for(const s of game.scars||[]){ctx.globalAlpha=0.5*(1-s.t/0.6);
    ctx.fillStyle='#241c30';ctx.beginPath();
    ctx.ellipse(px(s.x),px(s.y),9,3,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#3a2c50';ctx.beginPath();
    ctx.ellipse(px(s.x),px(s.y-1),6,2,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}}
function renderFx(){ // UI 层粒子：star=十字星 / shard=碎片 / ring=扩散环 / 默认=小方点
  for(const p of game.fxParts||[]){
    if(p.ring){ctx.globalAlpha=clamp(p.life*3.3,0,1);ctx.strokeStyle=p.color;ctx.lineWidth=1.5;
      ctx.beginPath();ctx.arc(px(p.x),px(p.y),Math.max(1,p.r||2),0,Math.PI*2);ctx.stroke();continue;}
    ctx.globalAlpha=clamp(p.life*2.5,0,1);ctx.fillStyle=p.color;
    if(p.star){const s=2;ctx.fillRect(px(p.x)-s,px(p.y),s*2+1,1);ctx.fillRect(px(p.x),px(p.y)-s,1,s*2+1);}
    else if(p.shard){ctx.fillRect(px(p.x),px(p.y),2,2);ctx.fillStyle='#ffffff';ctx.fillRect(px(p.x),px(p.y),1,1);}
    else ctx.fillRect(px(p.x),px(p.y),p.size||2,p.size||2);}
  ctx.globalAlpha=1;}
function renderFloats(){ // 浮动文字：上浮 22px 减速 + 前 0.12s 弹跳放大 + 尾段渐隐
  for(const f of game.floats||[]){
    const k=f.t/f.life, rise=22*(1-Math.pow(1-k,2));
    const pop=f.t<0.12?1+(0.12-f.t)*4:1;                 // 弹跳 scale
    ctx.globalAlpha=k>0.7?(1-k)/0.3:1;
    drawPixelText(f.text,px(f.x),px(f.y-rise),(f.big?2:1)*Math.min(2,pop),f.color,'center');
    ctx.globalAlpha=1;}}
// 兜底守卫：floats/fxParts/scars 字段不存在（v5 引擎未合入）时上述函数自然空转（||[] 已守卫）。
```

## §B 主角演出（heroPoseImg / renderPlayer 改造）

```js
// heroPoseImg（ui.js:634）取帧优先级追加（自上而下覆盖）：
// 1) p.atkWind>0（起手）→ SPR.heroDashWind 反转?? 否——起手用 heroAttack 即可（若特效队给了
//    heroAttackWind 则用它，守卫式）；此处**起手帧用 heroAttack**（现有）+ 后仰倾斜变换。
// 2) p.dashT>0 且流逝<0.05 → SPR.heroDashWind（守卫：无则 heroDash）
// 3) p.djT>0 → heroJump 帧（空翻用变换实现，见 renderPlayer）
// —— renderPlayer 主体 drawImage 前统一走姿态变换 _heroTransform(img)：
function _heroXform(img){ // 内部：合成 squash/lean/turn/spin 变换后 drawImage（脚底中心锚）
  const p=game.player;
  ctx.save();
  const cx=px(p.x-3)+img.width/2, feet=px(p.y-2)+img.height;
  ctx.translate(cx,feet);
  if(p.turnT>0)ctx.scale(0.72+0.28*(1-p.turnT/0.12),1);            // 转身翻转 squash
  const run=p.anim==='run'&&p.onGround;
  if(run)ctx.rotate(p.face*2*Math.PI/180*Math.min(1,Math.abs(p.vx)/PHY.maxRun)); // 跑动前倾 2°
  if(p.atkWind>0)ctx.rotate(-p.face*8*Math.PI/180);                // 攻击起手后仰
  if(p.dashT>0&&0.28-p.dashT<0.05)ctx.rotate(-p.face*10*Math.PI/180); // 冲刺蓄力后仰
  if(p.djT>0)ctx.rotate(p.face*(1-p.djT/0.4)*Math.PI*2);           // 二段跳空翻 360°
  if(p.landT>0){const k=clamp(p.landT/(p.landVy>300?0.22:0.15),0,1);
    ctx.scale(1+(p.landVy>300?0.35:0.25)*k,1-(p.landVy>300?0.40:0.32)*k);} // 落地 squash（大落加深）
  ctx.drawImage(img,-img.width/2,-img.height);
  ctx.restore();}
// —— 现 renderPlayer 中 landT 分支的专用 squash 代码删除，统一并入上式（p.landVy 缺省 0 走小落）。
// —— 冲刺爆发速度线（renderGhosts 之后、renderPlayer 之前）：
if(p.dashT>0&&0.28-p.dashT>=0.05&&0.28-p.dashT<0.23){
  ctx.strokeStyle='rgba(232,248,255,0.55)';ctx.lineWidth=1;
  for(let i=0;i<3;i++){const ly=px(p.y+2+i*5+(game.tick%4));
    ctx.beginPath();ctx.moveTo(px(p.x+5-p.dashDir*(10+i*3)),ly);
    ctx.lineTo(px(p.x+5-p.dashDir*(22+i*4)),ly);ctx.stroke();}}
```

## §C 挥击四帧时间轴 / 敌人白闪抖动 / 击飞 / 骑士

```js
// renderSlash（ui.js:708）重写：以 p.atkAnim（0.25→0）计时：
//   流逝 el=0.25-p.atkAnim：<0.05 起手帧 idx0；0.05~0.17 帧1→2 随进度插值；0.17~0.25 帧3 余韵。
if(!(p.atkAnim>0))return;
const el=0.25-p.atkAnim;
const arc=SPR.slashArc||[];
let img;
if(arc.length>=4)img=arc[el<0.05?0:el<0.11?1:el<0.17?2:3];
else if(arc.length)img=arc[Math.min(arc.length-1,(el/0.25*arc.length)|0)];   // 旧3帧兜底
// 位置/翻转/透明度沿现状；无 arc 时保留程序化弧兜底（现 ui.js:720-726 代码不动）。

// —— 敌人渲染（renderEntities ui.js:537-546）改造 ——
const _whiteCache=new Map(); // 内部：白闪变体缓存
function whiteOf(img){let w=_whiteCache.get(img);
  if(!w){w=document.createElement('canvas');w.width=img.width;w.height=img.height;
    const g=w.getContext('2d');g.drawImage(img,0,0);
    g.globalCompositeOperation='source-atop';g.globalAlpha=0.85;g.fillStyle='#fff';
    g.fillRect(0,0,w.width,w.height);_whiteCache.set(img,w);}
  return w;}
// 绘制处：const jit=e.jitT>0?((game.tick%2)?1:-1):0;  // 受击抖动 ±1px
// slime: drawImage(e.flashT>0?whiteOf(帧):(帧), px(e.x-1+jit), px(e.y));
// knight（新增分支）：SPR.knight[2] 两帧 (e.t*4|0)%2（守卫：无素材画 12×18 钢灰矩形+
//   面朝侧盾色浅块）；白闪/抖动同上；死亡用击飞弹道坐标（e.y 已由引擎积分）+ 渐隐。
// 击飞尸体：现有 e.dead>0 分支照画（坐标已被引擎更新为弹道），alpha 按 e.dead/0.6 渐隐。
```

## §D 技能演出

```js
// —— O 流星连斩覆盖层（renderFlash 之前新函数 renderUlt()，屏幕坐标系）——
function renderUlt(){
  const u=game.ult; if(!u||!u.on)return;
  const t=u.t, p=game.player;
  // ① 时停压暗+主角高亮（0~0.55；0.3 后维持）
  if(t<0.55){const a=0.55*Math.min(1,t/0.3);
    ctx.fillStyle='rgba(6,8,20,'+a+')';ctx.fillRect(0,0,VIEW_W,VIEW_H);
    // 主角高亮：金环+亮斑（世界坐标随相机）
    const sx=px(p.x+5-game.cam.x),sy=px(p.y+7-game.cam.y);
    const g=ctx.createRadialGradient(sx,sy,2,sx,sy,26);
    g.addColorStop(0,'rgba(248,208,72,0.55)');g.addColorStop(1,'rgba(248,208,72,0)');
    ctx.fillStyle=g;ctx.fillRect(sx-26,sy-26,52,52);
    ctx.strokeStyle='#f8d048';ctx.lineWidth=1;
    ctx.beginPath();ctx.arc(sx,sy,14+Math.sin(game.tick*0.5)*2,0,Math.PI*2);ctx.stroke();}
  // ② 十字巨剑光（0.30~0.55 两条对角带扫过；0.55~0.90 快速淡出）
  if(t>0.3&&t<0.9){const k=clamp((t-0.3)/0.25,0,1),fade=t>0.55?clamp(1-(t-0.55)/0.2,0,1):1;
    for(const d of[[-1,1],[1,-1]]){ // 左上→右下 / 右上→左下
      const x0=d[0]<0?k*VIEW_W:VIEW_W-k*VIEW_W, y0=0, x1=x0+d[0]*180, y1=150;
      ctx.globalAlpha=fade;ctx.strokeStyle='#f8d048';ctx.lineWidth=5-3*k;
      ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.stroke();
      ctx.strokeStyle='#ffffff';ctx.lineWidth=1.5;ctx.stroke(); // 白芯
      ctx.fillStyle='#fff8c8';ctx.fillRect(x1-2,y1-2,4,4);     // 剑光头部亮星
      ctx.globalAlpha=1;}}
  // ④ 冲击波环（0.55~0.90 以主角为中心）
  if(t>=0.55&&t<0.9){const k=(t-0.55)/0.35;
    const sx=px(p.x+5-game.cam.x),sy=px(p.y+7-game.cam.y);
    ctx.globalAlpha=1-k;ctx.strokeStyle='#f8d048';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(sx,sy,260*k,0,Math.PI*2);ctx.stroke();
    ctx.strokeStyle='#ffffff';ctx.lineWidth=1;
    ctx.beginPath();ctx.arc(sx,sy,260*k-3,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;}
  // ⑤ 白闪复用 game.flashT（引擎已在 t=0.9 置 0.1，renderFlash 现有逻辑不动）
}
// —— U 瞄准圈（renderEntities 流星段改造 ui.js:548-551）——
for(const m of game.meteors||[]){
  if(m.delay>0){ if(m.ring==null)continue;             // 瞄准圈：双圈脉冲
    const rr=10+Math.sin(game.tick*0.4)*2;
    ctx.strokeStyle='#f8d048';ctx.lineWidth=1.5;ctx.globalAlpha=0.85;
    ctx.beginPath();ctx.ellipse(px(m.x+5),px(m.ring),rr,4,0,0,Math.PI*2);ctx.stroke();
    ctx.strokeStyle='#fff8c8';ctx.lineWidth=0.5;
    ctx.beginPath();ctx.ellipse(px(m.x+5),px(m.ring),rr*0.55,2,0,0,Math.PI*2);ctx.stroke();
    ctx.globalAlpha=1;continue;}
  if(SPR.meteor)ctx.drawImage(SPR.meteor[(game.tick*10|0)%2],px(m.x),px(m.y));}
// （拖尾粒子由引擎 fxParts 推，renderFx 自动画。）
// —— I 六边形护盾（renderPlayer 现护盾段 ui.js:680-686 替换）——
if(p.shieldT>0){
  const cx=p.x+5,cy=p.y+7,R=14,rot=game.tick*0.013;    // 慢旋转
  const flick=p.shieldT<1?0.35+0.45*Math.abs(Math.sin(game.tick*0.4)):0.8;
  ctx.save();ctx.translate(px(cx),px(cy));ctx.rotate(rot);
  ctx.globalAlpha=flick;ctx.strokeStyle='#f8d048';ctx.lineWidth=1.5;ctx.beginPath();
  for(let i=0;i<=6;i++){const a=i/6*Math.PI*2;
    i?ctx.lineTo(Math.cos(a)*R,Math.sin(a)*R):ctx.moveTo(Math.cos(a)*R,Math.sin(a)*R);}
  ctx.stroke();
  // 边上流动光纹：6 段短亮弧，相位=game.tick*0.05 循环
  ctx.strokeStyle='#fff8c8';ctx.lineWidth=1;
  for(let i=0;i<3;i++){const ph=(game.tick*0.05+i/3)%1,a0=ph*6/6*Math.PI*2;
    ctx.beginPath();ctx.arc(0,0,R,a0,a0+0.5);ctx.stroke();}
  ctx.restore();ctx.globalAlpha=1;}
```

## §E 新机关渲染（全部守卫；素材由特效队同波交付，未合入走程序化）

```js
// renderTiles 尾部：'w' 风纹（覆盖可见 'w' 瓦片）
case 'w' 在 renderTiles switch 内：if(SPR.windStreak){const f=SPR.windStreak[(game.tick*8|0)%2];
  ctx.globalAlpha=0.5;ctx.drawImage(f,dx,dy-((game.tick*2+ty*3)%16|0)+0);ctx.globalAlpha=1;}
  else{ctx.fillStyle='rgba(220,255,255,0.28)';ctx.fillRect(dx+6,dy+2,1,12);ctx.fillRect(dx+10,dy+6,1,9);}
// renderEntities 追加：
// 传送门：for(const q of L.portals||[]) if(SPR.portal)drawImage(SPR.portal[(game.tick*6|0)%2],px(q.x-2),px(q.y))
//   else 程序化（12×24 青紫双色竖椭圆 + 中心亮点）；q.cd>0 时 globalAlpha 0.5。
// 吊灯：for(const w of L.pends||[]){锚座 fillRect(w.ax-2,w.ay-2,4,4,'#7a7488')；
//   链：3 节沿 (ax,ay)→(bx,by) 等分点 fillRect 2×2；锤：SPR.chandBlade 或程序化 10×10
//   金框圆。w.bx/w.by 由引擎每步写好（只读）。}
// 骑士：见 §C。
```

## §F 流光粒子 + 技能栏升级

```js
// renderParts（ui.js:731）替换：按速度量化画细长条（禁旋转）
function renderParts(){
  for(const pt of game.parts){
    ctx.globalAlpha=clamp(pt.life*2,0,1);ctx.fillStyle=pt.color;
    const sp=Math.hypot(pt.vx,pt.vy);
    if(sp>120){const L=3,h=1;                          // 快：1×3 主轴
      if(Math.abs(pt.vx)>=Math.abs(pt.vy))ctx.fillRect(px(pt.x)-1,px(pt.y),L,h);
      else ctx.fillRect(px(pt.x),px(pt.y)-1,h,L);}
    else if(sp>40){ if(Math.abs(pt.vx)>=Math.abs(pt.vy))ctx.fillRect(px(pt.x),px(pt.y),2,1);
      else ctx.fillRect(px(pt.x),px(pt.y),1,2);}
    else ctx.fillRect(px(pt.x),px(pt.y),pt.size,pt.size);}
  ctx.globalAlpha=1;}
// HUD 技能槽（ui.js:804-811）替换 CD 罩与就绪光：
if(cd>0){const frac=clamp(cd/max,0,1);                 // 扇形扫描
  ctx.fillStyle='rgba(6,10,24,0.66)';ctx.beginPath();ctx.moveTo(x+8,y+8);
  ctx.arc(x+8,y+8,11,-Math.PI/2,-Math.PI/2+Math.PI*2*(1-frac));ctx.closePath();ctx.fill();
  drawPixelText(''+Math.ceil(cd),x+8,y+6,1,'#c8d4ec','center');}
else{ctx.globalAlpha=0.35+0.3*Math.sin(game.tick*0.15);
  ctx.strokeStyle='#f8d048';ctx.strokeRect(x+0.5,y+0.5,15,15);ctx.globalAlpha=1;} // 呼吸光
```

## §G 新音效（SFX 表追加 ui.js:105-136；事件清单与手感队工单 §H 严格一致）

```js
swing(){noiseSfx({d:0.12,v:0.14});tone({f:520,f2:980,d:0.1,v:0.1,type:'sawtooth'});},   // 挥击呼啸
hit(){tone({f:240,f2:120,d:0.08,v:0.22,type:'square'});noiseSfx({d:0.05,v:0.18});},     // 命中
kill(){tone({f:90,f2:45,d:0.22,v:0.3,type:'sine'});noiseSfx({d:0.12,v:0.22});},         // 击杀低频冲击
djump(){tone({f:330,f2:660,d:0.14,v:0.18,type:'triangle'});},                           // 二段跳
land2(){noiseSfx({d:0.12,v:0.22});tone({f:90,f2:55,d:0.1,v:0.16,type:'triangle'});},    // 大落
shieldhit(){tone({f:880,d:0.05,v:0.16,type:'square'});},
shieldbreak(){noiseSfx({d:0.25,v:0.28});tone({f:1200,f2:300,d:0.2,v:0.14,type:'sawtooth'});},
clank(){tone({f:1250,f2:900,d:0.06,v:0.2,type:'square'});tone({f:620,d:0.05,v:0.12});}, // 格挡
portal(){tone({f:420,f2:1260,d:0.22,v:0.16,type:'triangle'});},
ult2(){noiseSfx({d:0.3,v:0.3});tone({f:1600,f2:180,d:0.35,v:0.2,type:'sawtooth'});},    // 大招结算斩
// 'ult'（释放时停起手）现表加重一档低音：在现 ult() 末尾追加 tone({f:60,f2:40,d:0.5,v:0.3,type:'sine'})
```

## 自测断言（全部真实执行）
1. `node --check ui.js` 通过；`node tools/gate.js engine` 通过（整体可玩）。
2. 浏览器冒烟（python tools/browsertest.py 或手开 index.html?level=1/7）：
   - 二段跳：空中再按跳有空翻+白环；弹簧弹跳中按跳无反应；
   - 打史莱姆：第一击白闪+击退+白色"1"，第二击击飞+"KO"+震屏；连击到 4 的倍数出金色大数字；
   - hit-stop 冻结期星火与数字仍在动；
   - O（L7 连击 8 后）：时停压暗→十字剑光→KO 弹出+击飞→金环→白闪，总时长 ≈1.2s；
   - U：金圈脉冲 0.5s→流星拖尾→落地爆坑；I：六边形旋转护盾，被击两次碎裂玻璃碴；
   - 暂停(P)/谜题(↑)期间 floats/fx 冻结不推进。
3. 回归：谜题覆盖层、Boss 战、冲刺残影、踩踏弹跳表现不劣化。
4. `git diff --stat` 只改 ui.js。

## 验收标准
- 上述全绿；渲染对 engine v5 未合入的场景零异常（守卫式降级验证：临时回退 engine.js
  到 HEAD~ 跑一次浏览器无报错即可，交付说明记录做过）。
