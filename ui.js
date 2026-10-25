// ============================================================
// ui.js —— 渲染 / 输入 / 音频 / 界面状态机 / 主循环
// 契约：只读 engine 的 game/Level 与 art 的 SPR/THEMES/buildThemeArt
// v2 增量（2026-10-24 任务书 P0+P1，引擎工程师）：
//   P0 修复：pressed 边沿改为「每个物理 step 之后」清空（挪入 while 循环），
//            高刷屏零步进渲染帧不再吞跳跃/攻击输入；
//   P1：攻击 J/X、冲刺 K/Shift 按键映射与边沿桥接；slash/dash/break/combo 四新音效；
//   渲染：落地 squash（landT 变换）、冲刺残影（0.04s×4 快照）、挥击弧光
//        （slashArc[3] 就位自动启用，此前程序化弧兜底）、连击 HUD 弹字、
//        heroRun 取帧按帧数自适应（3/6 帧）。
// v3 增量（2026-10-24-v3-boss-design §4/§5/§7/§8，界面队）：
//   技能 U/I/O 输入桥接；Boss 部件装配/星弹/流星/冲击波/掉落心渲染（§B）；
//   心形 HP、Boss 血条、技能栏+连斩充能（§C）；登场横幅/连斩白屏/nova 预警环（§D）；
//   选关 7 格、通关进致谢屏（§E）；roar/meteor/shield/ult/heart/hurt/bosshit 音效（§G）。
//   注：消费 engine v3 字段（game.boss/drops/meteors/waves/skills/flashT 等）与
//   art v3 SPR 键；v2 基线（未合入时）经 ||[] 与 SPR 存在性守卫照常运行 L1-L6。
// v4 增量（docs/specs/2026-10-24-v4-puzzles.md §界面队，界面队）：
//   谜题神龛：KEYMAP.puzzleOpen（play 态且 puzzleNear>=0 时消费；近龛优先开龛不跳——
//   puzzleNear>=0 时 jumpHit 桥接置 0）；覆盖层状态机 puzzle（数织=行/列线索+网格 J填/K叉/R清，
//   数独=粗细分隔线+给定格灰底+冲突红字/数字键/0退格清除/R重来；Esc 退出，进度仅本关内保留）；
//   完成校验（数织对 pic/数独对 sol，全对→puzzleSolved(idx)+本地持久化+2s 自动关层，错格闪红 1s）；
//   已解神龛=点亮+谜底缩略图（数织画原样/数独金色"完"印章）+只读查看；puzzleNear 头顶浮动提示；
//   HUD 已解神龛 x/6 小图标；startLevel 注入 game.solvedPuzzles=progress.puzzles。
//   依赖 engine v4（level.shrines/game.puzzleActive/game.puzzleNear/game.solvedPuzzles/全局
//   puzzleSolved）与 levels v4（PUZZLES）；未合入时按 typeof/||[] 守卫整体静默降级，v3 行为不变。
// v5 增量·第一波演出队（docs/workorders/v5-wave1-ui.md，基准 docs/specs/2026-10-24-v5-design.md
//   §1/§2/§3/§5.4/§8）：
//   §A UI 层演出池推进与渲染：simUiFx 每步推进 game.floats(≤40)/fxParts(≤60)/scars(爆坑)——
//      引擎只写、ui 推进+修剪（hit-stop/ult 冻结期照常动，"冻结期火花仍渲染"）；
//      renderScars/renderFx(star/shard/ring)/renderFloats 三渲染函数（renderParts 之后）。
//   §B 主角演出：_heroXform 统一脚底中心姿态变换（跑动前倾/转身 squash/起手与冲刺蓄力后仰/
//      二段跳 360° 空翻/落地分级 squash）；heroPoseImg 追加 heroDashWind 蓄力帧与 djT 跳跃帧；
//      冲刺爆发段速度线（renderGhosts 后 renderPlayer 前）。
//   §C 挥击四帧时间轴（p.atkAnim 0.25s，v4 无此字段走现行 atkT 逻辑）；受击敌人白闪
//      whiteOf 缓存变体 / jitT ±1px 抖动 / 死亡 0.6s 渐隐；骑士渲染（SPR.knight[2] 基准帧
//      面向左，e.face>0 用 flipSprite 翻转；程序化兜底）。
//   §D 技能演出：renderUlt O 连斩 1.2s 六阶段覆盖层（压暗/十字剑光/冲击环，renderFlash 前）；
//      U 瞄准圈（m.ring 地面 y 双圈脉冲）；I 护盾改六边形光罩（慢旋转+流动光纹+临破闪烁）。
//   §E 新机关渲染（守卫式，引擎/美术未合入时静默跳过）：'w' 风纹（renderTiles）、
//      传送门 SPR.portal[2]/吊灯摆锤（renderEntities）。
//   §F 流光粒子 renderParts（按速度量化 1×2/1×3 细长条）；HUD 技能栏扇形 CD 扫描+就绪呼吸光。
//   §G 新音效：swing/hit/kill/djump/land2/shieldhit/shieldbreak/clank/portal/ult2 + ult 加重低音。
//   硬约束：H4 所有新渲染对 v5 未合入的旧引擎字段（floats/fxParts/scars/ult/djT/turnT/atkAnim/
//   flashT/jitT/portals/pends 等）守卫式静默降级到 v4 现行表现，零异常；不碰 localStorage。
// v5 增量·第二波封面队（docs/workorders/v5-wave2-title.md，基准 docs/specs/2026-10-24-v5-design.md
//   §5.5/§6/§8）：
//   §A _panel() 原神风切角面板（深蓝半透底+金细描边+内侧亮线+可选标题带）+ 全 UI 换皮：
//      HUD 顶栏（rgba(10,18,42,.62)+下缘金线）、心形 HP 行/技能槽/O 充能点切角小面板、
//      暂停层/通关结算/选关卡面板化、Boss 血条名牌深蓝+金线、谜题覆盖层程序化木框底删除
//      （SPR.puzzleUI 拼接保留，内板 #10162e）、hint 底条、谜题"解开横幅"。
//   §B 封面重做（renderMenu title 分支）：夜空渐变+40 星缓移（mulberry32(2025) 确定性）+
//      三层云海平铺（SPR.cover.cloudA/B/C，缺失程序化兜底）+Boss 巨影/主角剪影（SPR.cover，
//      缺失程序化兜底）+确定性流星（fxParts 尾迹）+「像素勇者」逐字弹入 logo（落字金 fx+小震）+
//      副标金属渐变三遍叠画+呼吸光开始按钮+底部操作条；titleArt 瓦片地面行删除。
//      simUiFx 放开 title 态推进（流星尾迹/落字 fx 走第一波 fxParts 渲染管线）。
//   §C 选关屏 5×2 十卡布局（68×52 切角卡）+STARS 合计 /(LEVELS.length*3)；导航左右 ±1/上下 ±5。
//   §D 存档迁移 migrateProgress（boot 一次性：unlocked>=7 且无 v5m → unlocked=max(8)+v5m=1，
//      键名只增不改不删，全游戏唯一一处）+真结局致谢屏（CREDITS_LINES v5 版+「～ 真结局 ～」+TOTAL STARS）。
//   §E HUD 神龛计数金描边+文字色系（主 #f0f4ff/金 #f8d048/危险 #f87858）。
//   硬约束：H3 素材走 SPR.cover（风格队产出）+程序化兜底，不新增外部依赖；H4 第一波战斗演出/
//   浮字/技能特效渲染零回退；SPR.cover 未合入时封面全程序化降级可运行。
// v6 增量·第一波界面队（docs/workorders/v6-wave1-ui.md，基准 docs/specs/2026-10-24-v6-design.md
//   §4/§5/§8）：
//   §A 鼠标系统：坐标换算唯一公式（fitScreen CSS 框→VIEW 空间）/悬停目标表（skill:0..3、hearts、
//      bossbar、coins、shrinehud + title/select 入口）/点技能槽=键盘同管线/title 单击开始、
//      选关单击选中双击进入（均与 hit('confirm') 同分支——H2 鼠标为增强不替代键盘）/
//      Tab 防焦点逃逸（仅键盘事件 preventDefault）。
//   §B 技能提示卡：悬停技能槽弹出四行卡（名/键与 CD/一句话说明/充能条件，文案冻结）。
//   §C HUD 改版：技能槽 3→4（U/I/O/L；SPR.skL 缺失槽内只画字母）/O 充能 8 点内嵌 O 槽底行
//      （独立点条删除）/心形面板 104 宽、循环上限 p.maxHp||5（引擎 v6 字段缺省 5=现行为）。
//   §D O 引导：充能满金呼吸双层描边（替换 v5 白描边）+ 每关一次大横幅（尾 0.5s 渐隐）。
//   §E L1 技能提示条（6s，尾 1s 渐隐）+ 速降一次性 toast（localStorage 仅新增 pq_hint_fall，H5）。
//   §F 神龛指引：未解神龛全图金光柱（puzzle.open 不画）+ HUD 左下迷你石碑/方向箭头/距离
//      （1 瓦=1M，puzzleNear<0 时显示）+ hint 条上方追加行。
//   §G 新实体渲染（全部守卫式，H4）：星刃回旋（回程帧反转+flipCache）/幽焰法师+读条圈/
//      追踪火球（b.fire 先判）/敌前摇演出（史莱姆压扁脚底锚定/蝙蝠瞄准红点线/骑士举盾+
//      破绽头顶白星——本地方点非粒子池，H3）；素材缺失一律程序化兜底。
//   §H 新音效：blade/mage/pickup（engine 经 sfxQueue 推送自动生效）。
//   硬约束：H4 引擎 v6 字段（input.down/skillLHit、skills.l、blades、bullets[].fire、e.ai/
//   e.guardDown、p.maxHp）未合入时全部静默降级到 v5 表现零异常；H5 不碰 localStorage 既有键；
//   H6 不动谜题覆盖层/暂停/选关既有逻辑（选关仅追加鼠标点击增强）。
// v6 增量·第二波背包队（docs/workorders/v6-wave2-bag.md，基准 docs/specs/2026-10-24-v6-design.md
//   §6/§7 + 平衡表 §Q）：
//   §A 存档扩展：migrateProgress 追加 v6 段（equip/inv/shards/nextId 缺省补齐，幂等只增键，R2/H2）；
//      新档回退对象同样经 migrateProgress 补齐；异常档自愈（equip 指向 id 不在 inv → 空槽+回写+save）。
//   §B pickups 消费：step() play 分支每步按 §6.4 三选一入包（同名→碎片 / 空位→入包 / 满包→碎片保底），
//      每事件即时 saveProgress；_bagFloat 本地浮字 ≤4 条 2s 消隐（不经 engine 池，H4）。
//   §C 背包界面：KEYMAP.bag(KeyB)/HUD 背包钮 (250,198,16,16)（icoBag 缺失程序化包袱剪影）/
//      开合同 openPuzzle 范式（清边沿+ui 侧 updateWorld 跳过双保险 H7；死亡演出/结算不响应）/
//      主面板 _panel(24,8,336,208)：角色预览×3+属性行、装备槽 3、背包 4×3、碎片栏、三按钮、
//      关闭钮、双操作行；焦点三区 Tab 循环 equip(3)→bag(12)→shard；键盘↔鼠标全等价（H3：
//      Enter 穿/脱·双击穿·单击槽脱·X 分解·C 升阶·按钮同函数）。
//   §D recomputeEquip（设计书 §6.2 冻结公式）：progress.equip→inv 查件→平衡表 §Q 累加→注入
//      game.equip/cdMul；p.maxHp 差值同步（升上限即时回血、卸下只降上限）；调用点 boot/startLevel/
//      每次背包变更。数据模型注：穿着件常驻 inv（工单 §D 冻结代码以 inv 查穿着件），格内右下金点标记。
//   §E 掉落渲染：gearDrops 底部稀有度色光柱（宽 8，±14px 渐隐）+ico 稀有度叠色（source-atop 缓存）
//      +浮动+金件描边脉冲；ico* 缺失程序化槽位剪影；世界悬停 geardrop:i 外扩 4px 命名卡。
//   §F 外观合成：heroLook/_lookCache/_lookDirty/lookEq（§7.5 冻结伪代码，部件覆盖非全帧重画）；
//      朝向契约——*L 变体=flipSprite(右向基准)（art.js 核对），合成以右向基准为底、heroLook 统一
//      翻转输出，heroPoseImg 改传右向基准（无装备直通路径补一处翻转修正=波1 逐像素一致）；
//      SPR.look 未合入恒直通（守卫零回归）。
//   §G 悬停扩展：背包内 bag:0..11/slot:w|h|c/btn:* 白描边；HUD 背包钮「背包 · B」卡。
//   硬约束：H4 loot/look 未合入时 gearDrops 恒空、SPR.look/ico* 缺失全部程序化兜底零异常；
//   H2 pq_progress 只增键（equip/inv/shards/nextId）不改不删既有键；H5 pq_hint_fall 等不动。
// v7 增量·界面队（docs/workorders/v7-ui.md，基准 docs/specs/2026-10-24-v7-design.md §9/§2.3/§1）：
//   §1 启动聚合 aggregateLevels()（硬依赖 H4 不守卫）+ 全部 LEVELS 读取点改聚合视图；
//   §9.2 章节化选关屏（三章 46×44 卡行 pitch53/Boss 红边卡/新关金点/章锁灰化；↑↓ 跨章保持列号；
//        鼠标悬停矩阵同步，hover id 仍=select:i）；
//   §9.3 Boss 血条/登场横幅参数化（BOSS_NAME/BOSS_P2TIP/BOSS_P2FRAC）+ renderBoss 部件表
//        [boss,boss2,boss3] 与白剪影同索引、body 按部件图尺寸对齐、sweepCast/blinkCast(hidden 跳过)/
//        scytheCast 三姿态；
//   §9.4 新敌渲染 lancer/jelly/ghost/boomer 四分支 + 精英通用层（×1.75 拉伸/4 段旋转金弧/头顶血条/
//        可选金冠；全守卫式+程序化兜底）；
//   §9.5 新机关渲染：'{'/'}' 水流瓦、'w' sea 主题气泡柱、'G' 隐藏砖、'g' 宝箱（L.chests）、
//        'R' 灯笼（L.lanterns，非黑暗层 6px 暖光晕）；
//   §9.7 黑暗层（nether：模块级离屏单例 + 玩家 r64/灯笼 r80 摇曳/检查点神龛 r24 微光开洞）；
//        开关=L.theme.dark===true 且 L.meta.theme==='nether'（现行 THEMES 的 cave/factory/lava/tower/
//        boss/star 自 v5 起即带 dark:true 但从未被消费，若单判 dark 会压暗六个既有主题违背 R8，故双条件）；
//   §9.8 隐藏房微提示（未碎 'G' 近距 24px 每 90tick 落 1 粒尘；G 列表每 8 帧节流重扫）；
//   §9.9 sfx chest/boom/blink/sweep；§2.3 存档迁移一行（stars['9']>=1→unlocked≥11，幂等只增）；
//   §9.10 v7 致谢文案 + renderVictory 遗留文案对齐。
//   硬约束：H2 存档只增；H3 全部新符号守卫式（game.boss.kind||0、L.chests/lanterns||[]、
//   tiles.hidden/waterL/waterR、SPR.boss2/3、SPR.lancer/jelly/ghost/boomer/chest/lantern/eliteCrown
//   缺省走程序化兜底）；H5 键盘/鼠标等价延续。
// ============================================================
'use strict';
(function(){

aggregateLevels(); // v7 §9.1/H4：启动聚合（levels.js 契约块=唯一实现；硬依赖不守卫——未合入时启动报错属预期集成信号）

const canvas=document.getElementById('game');
const ctx=canvas.getContext('2d');
ctx.imageSmoothingEnabled=false;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;

// ---------- 画布适配 ----------
function fitScreen(){
  const fs=Math.min(innerWidth/VIEW_W,(innerHeight-26)/VIEW_H);
  const s=fs<1?fs:Math.max(1,Math.floor(fs));
  canvas.style.width=(VIEW_W*s)+'px';canvas.style.height=(VIEW_H*s)+'px';
}
addEventListener('resize',fitScreen);

// ---------- 输入 → game.input ----------
const KEYMAP={
  left:['ArrowLeft','KeyA'],right:['ArrowRight','KeyD'],
  jump:['ArrowUp','KeyW','Space'],down:['ArrowDown','KeyS'],
  up:['ArrowUp','KeyW'], // v3 §E2：选关上移键（hit('up') 依赖；新增行，不动既有键）
  attack:['KeyJ','KeyX'],dash:['KeyK','ShiftLeft','ShiftRight'], // v2 P1：攻击/冲刺
  skillU:['KeyU'],skillI:['KeyI'],skillO:['KeyO'],skillL:['KeyL'], // v3 §A 三键 + v6 §2.1 技能四键 L（星刃回旋，未占用；边沿同 attack/dash 模式）
  puzzleOpen:['ArrowUp','KeyW','Enter'], // v4 §界面①：play 态且 puzzleNear>=0 时消费（近龛优先开龛不跳）
  nonoFill:['KeyJ'],nonoCross:['KeyK'],  // v4 §界面②：数织覆盖层内 J 填格/K 叉格（仅覆盖层消费，不影响 play 态 attack/dash）
  pause:['KeyP'],mute:['KeyM'],restart:['KeyR'],back:['Escape'],
  bag:['KeyB'], // v6 波2 §7.1：背包开关键（B 未被既有键占用；hit('bag') 仅背包层与 play 态消费）
  confirm:['Enter','Space','KeyW','ArrowUp']
};
const keys={},pressed={};
function kd(name){return KEYMAP[name].some(c=>keys[c]);}
function hit(name){return KEYMAP[name].some(c=>pressed[c]);}
addEventListener('keydown',e=>{
  // v4：Backspace 一并 preventDefault——数独覆盖层用它清格，防触发浏览器后退
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Backspace'].includes(e.code))e.preventDefault();
  if(!keys[e.code])pressed[e.code]=true;
  keys[e.code]=true;audioUnlock();
  if(e.code==='KeyM'){toggleAudio();return;}
});
addEventListener('keyup',e=>{keys[e.code]=false;});
function clearPressed(){for(const k in pressed)pressed[k]=false;}

// ---------- v6 §A 鼠标系统（增强不替代键盘 H2：所有点击路径均有键盘等价，见 step() 各分支） ----------
// 坐标换算唯一公式（设计书 §4.1）：fitScreen 缩放后的 CSS 框 → VIEW 空间；不设 tabindex、
// 不抢键盘焦点、不对鼠标事件 preventDefault（H2）。click=单击边沿：mousedown 置 1，
// 与 clearPressed 同点在 frame() 的 while(acc>=1/60) 循环内逐 step 清零。
const mouse={x:-1,y:-1,inside:false,down:false,click:0};
canvas.addEventListener('mousemove',e=>{
  const r=canvas.getBoundingClientRect();
  mouse.x=(e.clientX-r.left)*(VIEW_W/r.width);
  mouse.y=(e.clientY-r.top)*(VIEW_H/r.height);
  mouse.inside=true;
});
canvas.addEventListener('mouseleave',()=>{mouse.inside=false;});
canvas.addEventListener('mousedown',()=>{mouse.down=true;mouse.click=1;});
addEventListener('mouseup',()=>{mouse.down=false;});
// v6 §A.5：Tab 防焦点逃逸（为波2 背包预留；本波无 Tab 行为，仅阻断浏览器焦点移动——键盘事件可 preventDefault）
addEventListener('keydown',e=>{if(e.code==='Tab')e.preventDefault();});

// ---------- 音频合成 ----------
let AC=null,masterGain=null,musicGain=null,sfxGain=null,audioOn=true,musicOn=true,musicTimer=null,musicStep=0;
try{audioOn=localStorage.getItem('pq_audio')!=='0';musicOn=localStorage.getItem('pq_music')!=='0';}catch(e){}
function audioUnlock(){
  if(AC)return;
  try{
    AC=new (window.AudioContext||window.webkitAudioContext)();
    masterGain=AC.createGain();masterGain.gain.value=audioOn?1:0;masterGain.connect(AC.destination);
    musicGain=AC.createGain();musicGain.gain.value=musicOn?0.5:0;musicGain.connect(masterGain);
    sfxGain=AC.createGain();sfxGain.gain.value=0.8;sfxGain.connect(masterGain);
    startMusic();
  }catch(e){AC=null;}
}
function toggleAudio(){audioOn=!audioOn;if(masterGain)masterGain.gain.value=audioOn?1:0;
  try{localStorage.setItem('pq_audio',audioOn?'1':'0');}catch(e){}}
function tone(o){
  if(!AC||!audioOn)return;
  const t0=AC.currentTime+(o.at||0);
  const osc=AC.createOscillator(),g=AC.createGain();
  osc.type=o.type||'square';
  osc.frequency.setValueAtTime(o.f,t0);
  if(o.f2)osc.frequency.exponentialRampToValueAtTime(Math.max(1,o.f2),t0+o.d);
  g.gain.setValueAtTime(0.0001,t0);
  g.gain.linearRampToValueAtTime(o.v||0.3,t0+0.005);
  g.gain.exponentialRampToValueAtTime(0.0001,t0+o.d);
  osc.connect(g);g.connect(o.music?musicGain:sfxGain);
  osc.start(t0);osc.stop(t0+o.d+0.02);
}
function noiseSfx(o){
  if(!AC||!audioOn)return;
  const t0=AC.currentTime,len=Math.floor(AC.sampleRate*o.d);
  const buf=AC.createBuffer(1,len,AC.sampleRate),data=buf.getChannelData(0);
  for(let i=0;i<len;i++)data[i]=(Math.random()*2-1)*(1-i/len);
  const src=AC.createBufferSource();src.buffer=buf;
  const g=AC.createGain();g.gain.value=o.v||0.25;
  src.connect(g);g.connect(sfxGain);src.start(t0);
}
const SFX={
  jump(){tone({f:220,f2:520,d:0.12,v:0.22});},
  coin(){tone({f:988,d:0.06,v:0.18});tone({f:1319,d:0.18,v:0.18,at:0.06});},
  gem(){[784,988,1319,1568].forEach((f,i)=>tone({f,d:0.1,v:0.16,at:i*0.05}));},
  stomp(){noiseSfx({d:0.12,v:0.3});tone({f:180,f2:80,d:0.12,v:0.2,type:'triangle'});},
  die(){tone({f:440,f2:110,d:0.5,v:0.25,type:'sawtooth'});noiseSfx({d:0.3,v:0.2});},
  spring(){tone({f:150,f2:700,d:0.18,v:0.25,type:'triangle'});},
  key(){[659,880,1175].forEach((f,i)=>tone({f,d:0.09,v:0.18,at:i*0.06}));},
  door(){tone({f:98,d:0.25,v:0.3,type:'triangle'});noiseSfx({d:0.2,v:0.18});},
  switch(){tone({f:660,d:0.05,v:0.2});tone({f:440,d:0.08,v:0.2,at:0.05});},
  crumble(){noiseSfx({d:0.25,v:0.25});},
  checkpoint(){[523,659,784].forEach((f,i)=>tone({f,d:0.12,v:0.2,at:i*0.07}));},
  clear(){[523,659,784,1047,784,1047,1319].forEach((f,i)=>tone({f,d:i===6?0.5:0.13,v:0.2,at:i*0.11}));},
  select(){tone({f:880,d:0.05,v:0.15});},
  land(){noiseSfx({d:0.05,v:0.12,fc:500});tone({f:120,d:0.05,v:0.1,type:'triangle'});},
  shot(){tone({f:330,f2:120,d:0.1,v:0.14,type:'sawtooth'});},
  // v2 P1 新增音效事件（engine 经 sfxQueue 推送）
  slash(){noiseSfx({d:0.07,v:0.18});tone({f:980,f2:320,d:0.09,v:0.15,type:'sawtooth'});}, // 挥击
  dash(){noiseSfx({d:0.16,v:0.22});tone({f:180,f2:640,d:0.18,v:0.16,type:'triangle'});}, // 冲刺
  break(){noiseSfx({d:0.14,v:0.3});tone({f:150,f2:55,d:0.12,v:0.22,type:'square'});},     // 碎砖/斩弹
  combo(){tone({f:784,d:0.06,v:0.16});tone({f:1046,d:0.09,v:0.16,at:0.06});},            // 连击
  // v3 §G 新增音效事件（engine 经 sfxQueue 推送）
  roar(){tone({f:90,f2:45,d:0.5,v:0.35,type:'sawtooth'});noiseSfx({d:0.35,v:0.25});},
  meteor(){tone({f:1200,f2:200,d:0.25,v:0.2,type:'square'});noiseSfx({d:0.2,v:0.18});},
  shield(){[659,880,1319].forEach((f,i)=>tone({f,d:0.12,v:0.18,at:i*0.05,type:'triangle'}));},
  ult(){noiseSfx({d:0.4,v:0.35});[523,659,880,1047,1319].forEach((f,i)=>tone({f,d:0.1,v:0.2,at:i*0.04}));
    tone({f:60,f2:40,d:0.5,v:0.3,type:'sine'});}, // v5 §G：末尾加重一档低音
  heart(){tone({f:784,d:0.08,v:0.18,type:'triangle'});tone({f:1046,d:0.12,v:0.18,at:0.07,type:'triangle'});},
  hurt(){tone({f:220,f2:90,d:0.18,v:0.28,type:'square'});noiseSfx({d:0.1,v:0.2});},
  bosshit(){tone({f:150,f2:60,d:0.1,v:0.22,type:'square'});},
  // v4：谜题解开音（engine puzzleSolved 经 sfxQueue 推送 'puzzle'+'gem'，gem 沿用既有音）
  puzzle(){tone({f:659,d:0.09,v:0.18});tone({f:880,d:0.09,v:0.18,at:0.08});tone({f:1319,d:0.18,v:0.2,at:0.16});},
  // v5 §G 新音效（事件清单与手感队工单 §H 严格一致；engine v5 未合入时无人入队，静默待命）
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
  // v6 §H 新音效（事件清单与设计书 §8 表严格一致；engine v6 未合入时无人入队，静默待命）
  blade(){tone({f:520,f2:1040,d:0.18,v:0.18,type:'sawtooth'});noiseSfx({d:0.1,v:0.12});}, // 星刃掷出（呼啸上滑）
  mage(){tone({f:110,f2:220,d:0.7,v:0.12,type:'triangle'});},                             // 法师读条（低鸣升压）
  pickup(){[659,880,1319].forEach((f,i)=>tone({f,d:0.12,v:0.2,at:i*0.06}));},             // 装备拾取（上行琶音）
  // v6 波2 §8 新音效（推送方=ui 本地不排队；engine 永不入队）
  equip(){[523,784,1046].forEach((f,i)=>tone({f,d:0.1,v:0.18,at:i*0.05}));},              // 穿上短琶音
  unequip(){[1046,784].forEach((f,i)=>tone({f,d:0.1,v:0.16,at:i*0.06}));},                // 卸下反向两音
  shard(){[784,988,1175,1568].forEach((f,i)=>tone({f,d:0.09,v:0.16,at:i*0.045}));},       // 升阶/分解快琶音（更亮）
  // v7 §9.9 新音效（合成与设计书 §9.9 表逐字一致；engine v7 未合入时无人入队，静默待命）
  chest(){[392,523,659,784].forEach((f,i)=>tone({f,d:0.14,v:0.2,at:i*0.06}));noiseSfx({d:0.08,v:0.1});}, // 宝箱开启
  boom(){tone({f:90,f2:36,d:0.35,v:0.3,type:'sawtooth'});noiseSfx({d:0.3,v:0.28});},      // 魂火自爆
  blink(){tone({f:680,f2:120,d:0.22,v:0.16,type:'sine'});},                               // 判官传送
  sweep(){noiseSfx({d:0.18,v:0.22});tone({f:200,f2:90,d:0.18,v:0.14,type:'square'});},    // 扫尾/镰刀宽波
};
const MUSIC_LEAD=[440,523,659,0,587,659,784,0,659,523,440,0,494,587,494,0,
 440,523,659,0,587,659,784,0,880,784,659,523,587,494,440,0];
const MUSIC_BASS=[110,0,165,0,110,0,165,0,131,0,196,0,131,0,196,0,
 110,0,165,0,110,0,165,0,147,0,110,0,165,0,110,0];
function startMusic(){
  if(musicTimer||!AC)return;
  const stepDur=0.155;let nextT=AC.currentTime+0.1;
  musicTimer=setInterval(()=>{
    if(!AC)return;
    while(nextT<AC.currentTime+0.35){
      const i=musicStep%MUSIC_LEAD.length;
      if(MUSIC_LEAD[i])tone({f:MUSIC_LEAD[i],d:stepDur*0.9,v:0.09,type:'square',music:true,at:nextT-AC.currentTime});
      if(MUSIC_BASS[i])tone({f:MUSIC_BASS[i],d:stepDur*1.6,v:0.15,type:'triangle',music:true,at:nextT-AC.currentTime});
      nextT+=stepDur;musicStep++;
    }
  },120);
}

// ---------- 进度存档 ----------
function loadProgress(){
  try{const p=JSON.parse(localStorage.getItem('pq_progress')||'');
    if(p&&typeof p.unlocked==='number'&&p.stars)return migrateProgress(p);}catch(e){}
  return {unlocked:1,stars:{}};
}
function saveProgress(p){try{localStorage.setItem('pq_progress',JSON.stringify(p));}catch(e){}}
// v5 §D 存档迁移（boot 一次性，全游戏唯一一处；设计书 §6.4 硬约束：向后兼容）：
// 老玩家已见 Boss（unlocked>=7）→ 终章直接解锁（unlocked=max(unlocked,8)），打过的 Boss 不用重打；
// 置 v5m=1 防重复迁移。旧字段 unlocked/stars/puzzles 与 pq_audio/pq_music 键名只增不改不删。
function migrateProgress(p){
  if(p&&p.unlocked>=7&&!p.v5m){
    p.unlocked=Math.max(p.unlocked,8);p.v5m=1;saveProgress(p);
  }
  // v6 波2 §6.7（设计书代码照抄；R2/H2：只增键不改不删，缺省补齐天然幂等，不写标记位；
  // 旧键 unlocked/stars/puzzles/v5m 与 pq_audio/pq_music 一概不动）
  if (!p.equip)   p.equip   = { w: -1, h: -1, c: -1 };
  if (!Array.isArray(p.inv))    p.inv = [];
  if (!p.shards)  p.shards = {};
  if (typeof p.nextId !== 'number' || p.nextId < 1) p.nextId = 1;
  // v7 §2.3（设计书代码照抄；R2/H2：幂等只增、无标记位）：老玩家已通关旧终关 L10（stars['9']>=1）
  // → 直接解锁 L11（不必重打 L10）。不落盘：迁移幂等，重复执行同值，下次任意 saveProgress 自然持久化。
  if (p.stars && p.stars['9'] >= 1) p.unlocked = Math.max(p.unlocked, 11);
  return p;
}
let progress=migrateProgress(loadProgress()); // v6 波2 §A：新档回退对象同样补 v6 缺省字段（幂等）

// ---------- v6 波2 装备/背包常量（设计书 §6.1/§6.6 + 平衡表 §Q 冻结；BAL.gear 可读则直接读） ----------
const EQ_PREFIX=['破旧','铁制','秘银','星辉','神话'];                // 名称前缀[r]（§6.1）
const EQ_BASE={w:'长剑',h:'头冠',c:'斗篷'};                          // 基名[slot]（§6.1）
const EQ_COLOR=['#d8d8e0','#58c848','#48a8f8','#b060f0','#f8d048'];  // 稀有度色[r]（平衡表 §Q）
const EQ_SLOT_WORD={w:'武器',h:'头冠',c:'斗篷'};                     // 碎片名槽词（§6.1 'w2'=秘银武器碎片）
// BAL 为 engine.js 顶层 const（脚本序 art→levels→engine→ui 保证可读）；缺失时回退=平衡表 §Q 同值
const BAL_GEAR=(typeof BAL!=='undefined'&&BAL&&BAL.gear)
  ?BAL.gear
  :{stat:{w:[1,2,3,4,6],h:[1,2,3,4,4],cSpd:[4,6,8,10,12],cCd:[4,6,8,10,12]},
    shardsPerStep:3,shardsPerSalvage:2,bagSize:12};
const BAL_PLAYER_HP=(typeof BAL!=='undefined'&&BAL&&BAL.player&&BAL.player.hpBase)||5;
const BAL_GEAR_STAT=BAL_GEAR.stat;        // 平衡表 §Q stat 表（§D 冻结公式引用名）
const BAL_GEAR_BAG=BAL_GEAR.bagSize;      // 12
const BAL_GEAR_STEP=BAL_GEAR.shardsPerStep;     // 3
const BAL_GEAR_SALVAGE=BAL_GEAR.shardsPerSalvage; // 2
const lookTier=r=>r<2?0:r<4?1:2;          // 外观档 look(r)（§6.1：白绿=档0、蓝紫=档1、金=档2）

// ---------- v6 波2 §D recomputeEquip（设计书 §6.2 冻结公式 + §A 异常档自愈） ----------
// progress.equip→inv 查件→稀有度表累加（每槽一件，无叠乘）→注入 game.equip/cdMul；
// 数据模型注（工单 §D 冻结代码以 inv 查穿着件）：穿着件常驻 inv，格内右下金点标记（§7.2）——
// 设计书 §7.3「新件从格移除/卸下需空位」在本模型下不成立：卸下不改变 inv 容量，恒有空位（交付说明记录）。
function recomputeEquip(){
  const eq={atk:0,hp:0,spd:0,cd:0};
  const find=id=>progress.inv.find(it=>it.id===id);
  const st=BAL_GEAR_STAT;
  let repaired=false; // §A 异常档自愈：equip 指向的 id 不在 inv（或槽位不符）→ 按空槽计算并回写 -1
  const pick=k=>{
    const id=progress.equip[k];
    if(typeof id!=='number'||id<0)return null;
    const it=find(id);
    if(!it||it.slot!==k){progress.equip[k]=-1;repaired=true;return null;}
    return it;
  };
  const w=pick('w'),h=pick('h'),c=pick('c');
  if(w)eq.atk=st.w[w.r];
  if(h)eq.hp =st.h[h.r];
  if(c){eq.spd=st.cSpd[c.r]/100;eq.cd=st.cCd[c.r]/100;}
  game.equip=eq;game.cdMul=1-eq.cd;
  const p=game.player;
  if(p&&typeof p.maxHp==='number'){
    const diff=(BAL_PLAYER_HP+eq.hp)-p.maxHp;   // 头饰：升上限同时当前 HP+差值（奖励即时可感）
    p.maxHp+=diff;if(diff>0)p.hp+=diff;p.hp=Math.min(p.hp,p.maxHp); // 卸下只降上限（diff≤0 不加血）
  }
  if(repaired)saveProgress(progress);
}

// ---------- v6 波2 §C 背包状态与操作（§7.1 开合 / §7.3 交互矩阵 / §6.5 合成分解） ----------
let bagOpen=false;                               // 背包覆盖层开关（game.bagActive 同步写；ui 侧跳过 updateWorld 双保险 H7）
let bagFocus='bag',bagSelEquip=0,bagSelBag=0,bagSelShard=0; // 焦点三区 equip(3)/bag(12)/shard(动态)
let bagClickTick=-999,bagClickIdx=-1;            // 背包格双击计时（同选关卡 selClickTick 模式：单击选中、双击穿）
const _bagFloats=[];                             // §B 背包浮字（本地渲染 ≤4 条 2s 消隐——不经 engine 池，H4）
function _bagFloat(text,color,big){
  if(_bagFloats.length>=4)_bagFloats.shift();
  _bagFloats.push({text:text,color:color,t:0,big:big?1:0});
}
function openBag(){ // 开（B/背包钮）：同 openPuzzle 范式——开层瞬间清全部输入边沿防泄漏
  bagOpen=true;game.bagActive=true;
  game.input.jumpHit=0;game.input.attackHit=0;game.input.dashHit=0;
  game.input.skillUHit=0;game.input.skillIHit=0;game.input.skillOHit=0;
  game.input.skillLHit=0;
}
function closeBag(){ // 关（B/Esc/关闭钮）：关层清 stale 边沿，防带入恢复后
  bagOpen=false;game.bagActive=false;
  game.input.jumpHit=0;game.input.attackHit=0;game.input.dashHit=0;
  game.input.skillUHit=0;game.input.skillIHit=0;game.input.skillOHit=0;
  game.input.skillLHit=0;
}
function _bagItem(sel){return progress.inv[sel]||null;}
function _equippedId(k){return progress.equip?progress.equip[k]:-1;}
function isEquippedItem(it){return !!it&&(progress.equip.w===it.id||progress.equip.h===it.id||progress.equip.c===it.id);}
function _equipZoneItem(){ // equip 区当前选中槽的穿着件（常驻 inv 内查找）
  const id=_equippedId('whc'[bagSelEquip]);
  return id>=0?progress.inv.find(it=>it.id===id):null;
}
function afterBagChange(sfxName){ // §C：背包每次变更后 recomputeEquip+_lookDirty+save+本地 sfx
  recomputeEquip();_lookDirty();
  if(SFX[sfxName])SFX[sfxName]();
  saveProgress(progress);
}
function bagWear(sel){ // 穿上（Enter on bag 区 / 双击格 / 装备钮）：equip[slot]=id（同槽旧件仅被顶替，仍在背包）
  const it=_bagItem(sel);if(!it)return;
  if(_equippedId(it.slot)===it.id)return;   // 已穿戴：幂等
  progress.equip[it.slot]=it.id;
  afterBagChange('equip');
}
function bagUnequip(k){ // 卸下（Enter on equip 区 / 单击装备槽）：equip[k]=-1（物品常驻 inv，容量不变）
  if(_equippedId(k)==null||_equippedId(k)<0)return;
  progress.equip[k]=-1;
  afterBagChange('unequip');
}
function bagSalvage(){ // 分解（X / 分解钮）：未装备物品移除、shards[slot+r]+=2；装备中禁止（§6.5）
  const it=bagFocus==='equip'?_equipZoneItem():_bagItem(bagSelBag);
  if(!it)return;
  if(isEquippedItem(it)){_bagFloat('装备中 · 禁止分解','#f87858');SFX.shot();return;}
  progress.inv.splice(progress.inv.indexOf(it),1);
  const k=it.slot+it.r;
  progress.shards[k]=(progress.shards[k]||0)+BAL_GEAR_SALVAGE;
  _bagFloat(EQ_PREFIX[it.r]+EQ_BASE[it.slot]+' → 碎片+'+BAL_GEAR_SALVAGE,EQ_COLOR[it.r]);
  afterBagChange('shard');
}
function bagUpgrade(){ // 升阶（C / 升阶钮）：shards[slot+r]≥3 且 r<4 → 扣 3、r+1（含穿着中，§6.5）
  const it=bagFocus==='equip'?_equipZoneItem():_bagItem(bagSelBag);
  if(!it)return;
  if(it.r>=4)return;                                       // r=4 显示 MAX，不可升（按钮置灰）
  const k=it.slot+it.r;
  if((progress.shards[k]||0)<BAL_GEAR_STEP){SFX.shot();return;} // 碎片不足（钮置灰；键盘拒绝音同选关锁）
  progress.shards[k]-=BAL_GEAR_STEP;
  it.r+=1;                                                 // 同槽升阶：属性/外观按新 r 重算（recompute+_lookDirty）
  _bagFloat(EQ_PREFIX[it.r]+EQ_BASE[it.slot]+' 升阶成功',EQ_COLOR[it.r],it.r>=4);
  afterBagChange('shard');
}

// ---------- UI 状态 ----------
const q=new URLSearchParams(location.search);
const GOD=q.get('god')==='1';
let uiState='title',menuSel=0,fade=1,fadeDir=-1,hintT=0,lastLevelIdx=-1;
let clearStars=0,clearShown=0,creditsT=0; // v3 §E：致谢屏计时
// v6 §D/§E：引导与提示计时（渲染按 uiState==='play' 门控；startLevel 重置，见下）
let oHintDone=false,oHintT=0; // §D2：O 大提示每关一次（上升沿置 oHintT=2.5）
let skillHintT=0;             // §E1：L1 技能提示条（仅 L1 置 6.0）
let fallT=0,fallToastT=0;     // §E2：速降 toast（空中连续下落累计 / 展示计时）
let pqFallHinted=false;       // §E2/H5：pq_hint_fall 本会话已写标记（唯一新增 localStorage 键）
try{pqFallHinted=localStorage.getItem('pq_hint_fall')==='1';}catch(e){}
// god 模式：吞掉击杀（调试用）
if(GOD&&typeof killPlayer==='function'){const orig=killPlayer;window.killPlayer=function(){};}

// ---------- v4 谜题神龛（数织/数独覆盖层：状态机+输入+校验+持久化；渲染函数见下方渲染区） ----------
// 依赖：levels.js PUZZLES（键 1..6，奇=nono 数织/偶=sudoku 数独）、engine.js v4
// （level.shrines / game.puzzleNear / game.puzzleActive / game.solvedPuzzles / 全局 puzzleSolved）。
// 全部带存在性守卫：任一依赖未合入时功能整体静默降级（神龛与覆盖层不出现），v3 行为不变。
// 工单 §界面② 状态机 puzzle={open,idx,type,size,grid,cur,err,done}
// （grid：数织 0空/1填/2叉，数独 0空/1..n 数字；given/doneT/view 为内部扩展字段）
const puzzle={open:false,idx:0,type:'',size:0,grid:null,given:null,cur:{x:0,y:0},err:0,done:false,doneT:0,view:false};
let puzzleRep=0,puzzleSkip=0;   // 内部：方向键持键重复计时 / 开层当步跳过输入（防开启键泄漏为光标移动）
const sudokuBoxCache={};        // 内部：数独块尺寸按题号缓存（6×6 的 2×3/3×2 歧义按 sol 合法性自解析）

// puzzleNear 读取：engine v4 每步计算 game.puzzleNear（工单 §引擎3）；未合入时按同规格本地兜底
// （玩家矩形 vs 神龛矩形外扩 8px 严格重叠，与 _engAabb 语义一致）。
function puzzleNearIdx(){
  if(typeof game.puzzleNear==='number')return game.puzzleNear;
  const L=game.level;if(!L||!L.shrines||!L.shrines.length)return -1;
  const p=game.player;if(!p)return -1;
  for(const s of L.shrines)
    if(p.x<s.x+s.w+8&&p.x+p.w>s.x-8&&p.y<s.y+s.h+8&&p.y+p.h>s.y-8)return s.idx;
  return -1;
}
function isPuzzleSolved(idx){ // 已解判定：engine 置位（本关内）或本地存档（跨关）
  return !!((game.solvedPuzzles&&game.solvedPuzzles[idx])||(progress.puzzles&&progress.puzzles[idx]));
}
function openPuzzle(idx){ // 仅 play 态且 puzzleNear>=0 时由 step() 输入桥接调用
  if(typeof PUZZLES==='undefined')return;
  const pz=PUZZLES[idx];if(!pz)return;
  const resume=!puzzle.done&&puzzle.idx===idx&&puzzle.type===pz.type&&puzzle.grid&&puzzle.grid.length===pz.size;
  puzzle.open=true;puzzle.idx=idx;puzzle.type=pz.type;puzzle.size=pz.size;
  puzzle.err=0;puzzle.done=false;puzzle.doneT=0;puzzle.view=isPuzzleSolved(idx);
  puzzleSkip=1;
  if(!puzzle.view&&!resume){ // 已解→只读谜底；未解→续用内存进度（重进关卡由 startLevel 重置）
    if(pz.type==='nono')puzzle.grid=Array.from({length:pz.size},()=>Array(pz.size).fill(0));
    else{puzzle.grid=pz.givens.map(r=>r.slice());puzzle.given=pz.givens.map(r=>r.map(v=>v>0));}
    puzzle.cur={x:0,y:0};
  }
  game.puzzleActive=true; // 工单 §通用：覆盖层期间世界暂停（engine 冻结；ui 亦跳过 updateWorld 双保险）
  game.input.jumpHit=0;game.input.attackHit=0;game.input.dashHit=0;
  game.input.skillUHit=0;game.input.skillIHit=0;game.input.skillOHit=0;
  game.input.skillLHit=0; // v6：L 槽边沿同清（引擎 v6 未合入时该字段写入/清零均无害，H4）
}
function closePuzzle(){
  puzzle.open=false;game.puzzleActive=false;puzzleSkip=0;
  game.input.jumpHit=0;game.input.attackHit=0;game.input.dashHit=0; // 关层清 stale 边沿，防带入恢复后
  game.input.skillUHit=0;game.input.skillIHit=0;game.input.skillOHit=0;
  game.input.skillLHit=0; // v6：同上
}
function winPuzzle(){ // 工单 §界面③：puzzleSolved(idx)+本地持久化+2s 后自动关层
  if(puzzle.done)return;
  puzzle.done=true;puzzle.doneT=2;puzzle.err=0;
  const idx=puzzle.idx;
  if(typeof puzzleSolved==='function'){
    puzzleSolved(idx); // engine v4：solvedPuzzles 置位 / 金币+5 / 'puzzle'+'gem' 音效 / 金色烟花
    game.solvedPuzzles=game.solvedPuzzles||{};game.solvedPuzzles[idx]=true; // ui 侧读取一致性（幂等）
  }else{
    // engine v4 未合入兜底：与工单 §引擎4 等效的最小实现（粒子约 24 粒金色）
    game.solvedPuzzles=game.solvedPuzzles||{};
    if(!game.solvedPuzzles[idx]){
      game.solvedPuzzles[idx]=true;game.coins+=5;
      game.sfxQueue.push('puzzle','gem');
      const p=game.player;
      if(p)for(let i=0;i<24;i++)game.parts.push({x:p.x+5,y:p.y+4,
        vx:(Math.random()*2-1)*95,vy:-60-Math.random()*120,life:0.5+Math.random()*0.4,
        color:'#f8d048',size:1+(Math.random()*2|0),grav:220});
    }
  }
  progress.puzzles=progress.puzzles||{};
  if(!progress.puzzles[idx]){progress.puzzles[idx]=true;saveProgress(progress);}
}
function puzzleSetFill(v){ // 数织：J 填格(1) / K 叉格(2)，同格再按同标记=取消
  const c=puzzle.cur;
  puzzle.grid[c.y][c.x]=puzzle.grid[c.y][c.x]===v?0:v;
  checkNonoDone();
}
function puzzleSetNum(n){ // 数独：数字填入；0/退格清除；同格再按同数字也可清除；给定格锁定
  const c=puzzle.cur;
  if(puzzle.given[c.y][c.x])return;
  puzzle.grid[c.y][c.x]=puzzle.grid[c.y][c.x]===n?0:n;
  checkSudokuDone();
}
function puzzleClearGrid(){ // R：数织清空 / 数独清空重来（givens 保留）
  const pz=PUZZLES[puzzle.idx];
  if(pz.type==='nono')puzzle.grid=puzzle.grid.map(r=>r.map(()=>0));
  else{puzzle.grid=pz.givens.map(r=>r.slice());puzzle.given=pz.givens.map(r=>r.map(v=>v>0));}
  puzzle.err=0;
}
function checkNonoDone(){ // 工单 §玩法设计：完成时自动校验——全对胜利；错格闪红 1s
  const pz=PUZZLES[puzzle.idx];
  let unfilled=0,wrong=0;
  for(let r=0;r<pz.size;r++)for(let c=0;c<pz.size;c++){
    const want=(pz.pic[r][c]||'.')==='#',v=puzzle.grid[r][c];
    if(want&&v!==1)unfilled++;
    else if(!want&&v===1)wrong++;
  }
  if(unfilled===0&&wrong===0)winPuzzle();
  else if(unfilled===0&&wrong>0)puzzle.err=1;
}
function checkSudokuDone(){ // 完成自动校验：grid 与 sol 全等→胜利，否则错格闪红 1s
  const pz=PUZZLES[puzzle.idx];
  let full=true,wrong=0;
  for(let r=0;r<pz.size;r++)for(let c=0;c<pz.size;c++){
    const v=puzzle.grid[r][c];
    if(!v)full=false;
    else if(v!==pz.sol[r][c])wrong++;
  }
  if(full&&wrong===0)winPuzzle();
  else if(full&&wrong>0)puzzle.err=1;
}
function stepPuzzleInput(dt){ // 覆盖层输入：方向/J/K/R/Esc/数字键（工单 §界面①②③）
  if(puzzle.err>0)puzzle.err=Math.max(0,puzzle.err-dt);
  if(puzzle.done){ // 已解开：2s 自动关层（Esc 可提前；关层后世界恢复，烟花粒子在场景中绽放）
    if(hit('back'))closePuzzle();
    else{puzzle.doneT-=dt;if(puzzle.doneT<=0)closePuzzle();}
    return;
  }
  if(puzzleSkip){puzzleSkip=0;return;}
  if(puzzle.view){if(hit('back')||hit('confirm'))closePuzzle();return;} // 已解神龛只读查看
  const s=puzzle.size;
  puzzleRep-=dt; // 方向键：单击即移 + 持键重复（10×10 网格可用性）。
  // 注意必须认 hit() 边沿：快速点按的 keydown+keyup 可能落在两个 step 之间，step 时 kd() 已为 false，
  // 只看持键会吞掉单击（浏览器实测发现）；边沿与持键二选一消费，互不重复计步。
  for(const d of[['left',-1,0],['right',1,0],['up',0,-1],['down',0,1]]){
    const edge=hit(d[0]),held=kd(d[0]);
    if(!edge&&!held)continue;
    if(edge){
      puzzle.cur.x=clamp(puzzle.cur.x+d[1],0,s-1);
      puzzle.cur.y=clamp(puzzle.cur.y+d[2],0,s-1);
      puzzleRep=0.18;
    }else if(puzzleRep<=0){ // 持键 0.18s 后每 0.055s 重复一格
      puzzle.cur.x=clamp(puzzle.cur.x+d[1],0,s-1);
      puzzle.cur.y=clamp(puzzle.cur.y+d[2],0,s-1);
      puzzleRep=0.055;
    }
  }
  if(puzzle.type==='nono'){
    if(hit('nonoFill'))puzzleSetFill(1);    // J 填格
    if(hit('nonoCross'))puzzleSetFill(2);   // K 叉格
    if(hit('restart'))puzzleClearGrid();    // R 清空
  }else{
    for(let n=1;n<=9;n++)if(pressed['Digit'+n]||pressed['Numpad'+n])puzzleSetNum(n);
    if(pressed['Digit0']||pressed['Numpad0']||pressed['Backspace'])puzzleSetNum(0); // 0/退格清除
    if(hit('restart'))puzzleClearGrid();    // R 清空重来
  }
  if(hit('back'))closePuzzle();             // Esc 退出（进度保留在内存，重进关卡重置）
}
// 数独块尺寸：4×4=2×2、9×9=3×3 固定；6×6 工单写作「块2×3」存在行列书写歧义，
// 按 sol 在哪种划分（[行高,列宽]）下合法自解析，两种划分都不合法时兜底 [2,3]（gate 侧同规则把关）。
function sudokuSolValidUi(pz,bh,bw){
  const n=pz.size,sol=pz.sol;
  const uniq=get=>{const s=new Set();for(let i=0;i<n;i++){const v=get(i);if(v<1||v>n||s.has(v))return false;s.add(v);}return true;};
  for(let r=0;r<n;r++)if(!uniq(c=>sol[r][c]))return false;
  for(let c=0;c<n;c++)if(!uniq(r=>sol[r][c]))return false;
  for(let br=0;br<n;br+=bh)for(let bc=0;bc<n;bc+=bw){
    const s=new Set();
    for(let r=br;r<br+bh;r++)for(let c=bc;c<bc+bw;c++){const v=sol[r][c];if(v<1||v>n||s.has(v))return false;s.add(v);}
  }
  return true;
}
function sudokuBoxDims(pz){ // 内部：返回 [块行高,块列宽]（按当前题号缓存）
  if(sudokuBoxCache[puzzle.idx])return sudokuBoxCache[puzzle.idx];
  let box=pz.size===4?[2,2]:pz.size===9?[3,3]:null;
  if(!box){
    box=[2,3];
    if(!sudokuSolValidUi(pz,2,3)&&sudokuSolValidUi(pz,3,2))box=[3,2];
  }
  sudokuBoxCache[puzzle.idx]=box;return box;
}
function sudokuConflicts(r,c,v){ // 实时冲突：同行/列/块出现重复数字（工单 §界面②）
  const pz=PUZZLES[puzzle.idx],s=pz.size,[bh,bw]=sudokuBoxDims(pz);
  for(let i=0;i<s;i++){
    if(i!==c&&puzzle.grid[r][i]===v)return true;
    if(i!==r&&puzzle.grid[i][c]===v)return true;
  }
  const r0=(r/bh|0)*bh,c0=(c/bw|0)*bw;
  for(let i=r0;i<r0+bh;i++)for(let j=c0;j<c0+bw;j++)
    if((i!==r||j!==c)&&puzzle.grid[i][j]===v)return true;
  return false;
}
function rowRuns(str){ // 内部：数织一行/一列的连续实心段线索
  const out=[];let n=0;
  for(let i=0;i<str.length;i++){if(str[i]==='#')n++;else if(n){out.push(n);n=0;}}
  if(n)out.push(n);
  return out;
}

// v6 波2 §C 背包输入（键盘↔鼠标全等价 H3；参照 stepPuzzleInput 范式：边沿消费、开层不泄漏）。
// 注意 Enter 用裸 pressed['Enter']——KEYMAP.confirm 含 Space/W/↑，会与 bag 区方向键冲突。
function bagMove(dx,dy,nShard){ // 焦点区内移动（bag 行宽 4 上下 ±4；equip 横移；shard 横移）
  if(bagFocus==='bag')bagSelBag=clamp(bagSelBag+dx+dy,0,11);
  else if(bagFocus==='equip')bagSelEquip=clamp(bagSelEquip+dx,0,2);
  else if(bagFocus==='shard')bagSelShard=clamp(bagSelShard+dx,0,Math.max(0,nShard-1));
}
function stepBagInput(){
  if(hit('bag')||hit('back')){closeBag();return;}            // B/Esc 关闭（关闭钮=鼠标路径）
  const nShard=Math.min(Object.keys(progress.shards||{}).length,10); // 碎片栏可视行数（≤10 行）
  if(pressed['Tab'])bagFocus=bagFocus==='equip'?'bag':bagFocus==='bag'?'shard':'equip'; // Tab 三区循环
  if(hit('left'))bagMove(-1,0,nShard);
  if(hit('right'))bagMove(1,0,nShard);
  if(hit('up'))bagMove(0,-4,nShard);
  if(hit('down'))bagMove(0,4,nShard);
  if(pressed['Enter']){
    if(bagFocus==='bag')bagWear(bagSelBag);                  // 穿上
    else if(bagFocus==='equip')bagUnequip('whc'[bagSelEquip]); // 卸下
  }
  if(pressed['KeyX'])bagSalvage();                           // 分解（装备中→禁止浮字）
  if(pressed['KeyC'])bagUpgrade();                           // 升阶（不足→拒绝音）
  // 鼠标（§7.3 矩阵）：单击选中 / 双击装备 / 单击装备槽卸下 / 按钮执行 / 关闭钮
  if(mouse.click&&hover){
    if(hover.indexOf('bag:')===0){
      const i=+hover.slice(4);
      bagFocus='bag';
      if(bagClickIdx===i&&game.tick-bagClickTick<30)bagWear(i); // 0.5s 内同格再点=双击装备
      else bagSelBag=i;
      bagClickIdx=i;bagClickTick=game.tick;
    }else if(hover.indexOf('slot:')===0){
      const s=hover.slice(5);
      bagFocus='equip';bagSelEquip='whc'.indexOf(s);
      bagUnequip(s);                                          // 单击装备槽=卸下
    }else if(hover==='btn:equip')bagWear(bagSelBag);
    else if(hover==='btn:salvage')bagSalvage();
    else if(hover==='btn:upgrade')bagUpgrade();
    else if(hover==='btn:close')closeBag();
  }
}

function startLevel(idx){
  loadLevel(idx,false);
  uiState='play';game.state='play';
  hintT=3.5;lastLevelIdx=idx;menuSel=idx;
  themeArt=buildThemeArt(ALL_LEVELS[idx].theme); // v7 §9.1：LEVELS→ALL_LEVELS（聚合视图）
  fade=1;fadeDir=-1;
  // v2 P1：进关清残留输入锁存，防止上一状态的边沿在新关卡被缓冲触发
  game.input.jumpHit=0;game.input.attackHit=0;game.input.dashHit=0;
  game.input.skillUHit=0;game.input.skillIHit=0;game.input.skillOHit=0; // v3 §A：技能边沿同清，防 stale
  game.input.skillLHit=0; // v6 §A.3：L 槽边沿同清（引擎未合入时无害）
  ghosts.length=0;comboPop=0;lastCombo=0;
  // v4：谜题覆盖层复位（解题进度仅本关内保留，重进关卡重置——工单 §玩法设计）
  puzzle.open=false;puzzle.idx=0;puzzle.grid=null;puzzle.given=null;puzzle.cur={x:0,y:0};
  puzzle.err=0;puzzle.done=false;puzzle.view=false;puzzleRep=0;puzzleSkip=0;
  game.puzzleActive=false;
  // v6 §D2/§E：引导状态随关重置（O 大提示每关一次；技能条仅 L1；速降 toast 计时清零）
  oHintDone=false;oHintT=0;
  skillHintT=idx===0?6.0:0;
  fallT=0;fallToastT=0;
  // v4 §界面⑥：engine loadLevel 清空 solvedPuzzles 后，由 ui 从本地存档回填已解神龛
  game.solvedPuzzles=Object.assign({},progress.puzzles||{});
  // v6 波2 §D/§C：进关复位背包层（防残留 bagActive）+ 装备注入（loadLevel 已按 game.equip 建玩家，
  // 此处按冻结公式覆写校准——同值时 diff=0 无副作用）
  if(bagOpen)closeBag();
  recomputeEquip();
}

// ---------- 渲染 ----------
let themeArt=null;
function px(v){return Math.round(v);}

// ---------- v5 封面队 §A：原神风切角面板（设计书 §5.5：深蓝半透底+金细描边+内侧亮线双线描边） ----------
function _panelPath(x,y,w,h,cut){ // 八边形轮廓（四角 45° 切角），供 _panel 与呼吸光重描共用
  ctx.beginPath();
  ctx.moveTo(x+cut,y);ctx.lineTo(x+w-cut,y);ctx.lineTo(x+w,y+cut);
  ctx.lineTo(x+w,y+h-cut);ctx.lineTo(x+w-cut,y+h);ctx.lineTo(x+cut,y+h);
  ctx.lineTo(x,y+h-cut);ctx.lineTo(x,y+cut);ctx.closePath();
}
function _panel(x,y,w,h,opt){ // 内部：切角面板（换皮统一入口；布局与文案由调用处保持不变）
  opt=opt||{};
  const cut=opt.cut===undefined?4:opt.cut;          // 四角 45° 切角
  _panelPath(x,y,w,h,cut);
  ctx.fillStyle='rgba(14,26,58,'+(opt.alpha||0.82)+')';ctx.fill();
  ctx.strokeStyle='#f0c860';ctx.lineWidth=1;ctx.stroke();
  ctx.save();_panelPath(x,y,w,h,cut);ctx.clip();     // 内亮线（双线描边）
  ctx.strokeStyle='rgba(120,160,255,0.35)';ctx.strokeRect(x+1.5,y+1.5,w-3,h-3);ctx.restore();
  if(opt.titleBar){ctx.fillStyle='rgba(240,200,96,0.25)';ctx.fillRect(x+cut,y+1,w-cut*2,9);}
}

// ---------- v6 §A.2 悬停目标表（设计书 §4.2；computeHover 在 render() HUD 段之前调用——用最新 mouse；
// 鼠标不在 canvas 内恒 null。id：skill:0..3 / hearts / bossbar / coins / shrinehud / titleStart / select:i） ----------
function ptIn(mx,my,x,y,w,h){return mx>=x&&mx<x+w&&my>=y&&my<y+h;}
function _sign(v){return v<0?-1:1;}
function _textW(str,s){ // 内部：CNText 宽度估算（CJK≈s px/字，ASCII≈0.55s）
  let w=0;for(const ch of String(str))w+=ch.charCodeAt(0)>255?s:s*0.55;return w;
}
let hover=null;        // 当前帧悬停目标 id（step() 消费鼠标点击时读上一渲染帧的值，一帧延迟无碍）
let selClickTick=-999; // §A.4 选关卡双击计时（单击选中、双击=进入；单位=game.tick）
const SK_SLOT_KEYS=['skillU','skillI','skillO','skillL']; // §A.3 槽位 i → 输入边沿键（与键盘 hit() 同管线）
function computeHover(){
  hover=null;
  if(!mouse.inside)return;
  const mx=mouse.x,my=mouse.y;
  if(uiState==='title'){ // §A.4：title 开始钮（键盘等价=回车）
    if(ptIn(mx,my,VIEW_W/2-52,146,104,22))hover='titleStart';
  }else if(uiState==='select'){ // §A.4：选关卡（键盘等价=方向+回车）；v7 §9.2：章节布局矩阵（与渲染同源 _chapters）
    chsLoop:for(const ch of _chapters()){
      for(let j=0;j<ch.len;j++){
        const xy=_cardXY(ch,j);
        if(ptIn(mx,my,xy[0],xy[1],46,44)){hover='select:'+(ch.first+j);break chsLoop;}
      }
    }
  }else if(uiState==='play'&&game.level){
    if(bagOpen){ // v6 波2 §G：背包内悬停（面板覆盖全屏，屏蔽世界/HUD 目标；格/槽/按钮白描边由渲染画）
      for(let i=0;i<12;i++){const col=i%4,row=(i/4)|0;
        if(ptIn(mx,my,120+col*24,64+row*24,22,22)){hover='bag:'+i;break;}}
      if(!hover)for(let i=0;i<3;i++)if(ptIn(mx,my,120+i*28,24,24,24)){hover='slot:'+'whc'[i];break;}
      if(!hover&&ptIn(mx,my,300,150,36,14))hover='btn:equip';
      if(!hover&&ptIn(mx,my,300,166,36,14))hover='btn:salvage';
      if(!hover&&ptIn(mx,my,300,182,36,14))hover='btn:upgrade';
      if(!hover&&ptIn(mx,my,344,10,10,10))hover='btn:close';
    }else{ // 设计书 §4.2 表序=优先级（hearts 先于 bossbar，二者相交）
      for(let i=0;i<4;i++)if(ptIn(mx,my,162+i*22,198,16,16)){hover='skill:'+i;break;}
      if(!hover&&ptIn(mx,my,1,16,104,14))hover='hearts';           // §C 新 9 心面板
      const b=game.boss;
      if(!hover&&b&&b.state!=='dormant'&&ptIn(mx,my,82,17,200,11))hover='bossbar'; // 仅血条可见时
      if(!hover&&ptIn(mx,my,100,2,40,12))hover='coins';
      // §F.2 指引面板：与渲染同条件（本关有未解神龛且 puzzleNear<0）才可悬停，面板未显示时不响应
      if(!hover&&ptIn(mx,my,4,VIEW_H-18,64,14)){
        const p=game.player,sh=game.level.shrines;
        const uns=sh&&sh.length?sh.find(s=>!isPuzzleSolved(s.idx)):null;
        if(uns&&p&&puzzleNearIdx()<0)hover='shrinehud';
      }
      // v6 波2 §E：装备掉落世界悬停（外扩 4px 命中；无操作纯提示卡——物理拾取不走点击传送）
      if(!hover){const gd=game.gearDrops||[];
        for(let i=0;i<gd.length;i++){const d=gd[i];
          if(d&&ptIn(mx,my,d.x-game.cam.x-4,d.y-game.cam.y-4,d.w+8,d.h+8)){hover='geardrop:'+i;break;}}}
      // v6 波2 §G：HUD 背包钮（点击开启，键盘等价=B）
      if(!hover&&ptIn(mx,my,250,198,16,16))hover='hudbag';
    }
  }
}

function render(){
  const tick=game.tick;
  ctx.setTransform(1,0,0,1,0,0);
  // 摄像机（含震屏）
  let sx=0,sy=0;
  if(game.shake>0){sx=(Math.random()*2-1)*game.shake;sy=(Math.random()*2-1)*game.shake;}
  const camX=game.cam.x,camY=game.cam.y;
  const L=game.level,th=L?L.theme:THEMES.grass;
  computeHover(); // v6 §A.2：悬停目标表（render() HUD 段之前，用最新 mouse）

  if(uiState==='title'||uiState==='select'){renderMenu(th,tick);}
  else if(L){
    // 天空
    const grad=ctx.createLinearGradient(0,0,0,VIEW_H);
    grad.addColorStop(0,th.skyT);grad.addColorStop(1,th.skyB);
    ctx.fillStyle=grad;ctx.fillRect(0,0,VIEW_W,VIEW_H);
    // 视差
    drawParallax(themeArt.bg,camX,camY);
    ctx.save();
    ctx.translate(px(-camX+sx),px(-camY+sy));
    renderDecor(L,tick);
    renderTiles(L,tick);
    renderShrines(L,tick); // v4 §界面④：谜题神龛（未解=暗色石碑+?，已解=点亮+顶部谜底缩略图）
    renderEntities(L,tick);
    renderBoss(tick); // v3 §B1：Boss 部件装配（renderEntities 后、renderPlayer 前）
    renderGhosts();   // v2 P1：冲刺残影（玩家之下层）
    renderSpeedLines(); // v5 §B：冲刺爆发段速度线（renderGhosts 之后、renderPlayer 之前）
    renderPlayer(tick);
    renderSlash();    // v2 P1：挥击弧光（玩家之上层；v5 §C 升级四帧时间轴）
    renderParts();    // v5 §F：流光粒子（按速度量化细长条）
    renderScars();    // v5 §A：陨石爆坑（renderParts 之后追加三渲染）
    renderFx();       // v5 §A：UI 层演出粒子（star/shard/ring）
    renderFloats();   // v5 §A：浮动文字（伤害/金币/KO）
    renderPuzzleHint(tick); // v4 §界面④：puzzleNear 时头顶浮动"↑ 解谜/查看"提示（世界坐标最上层）
    ctx.restore();
    renderDarkness(tick); // v7 §9.7：黑暗层（nether 专属；世界渲染完成后、HUD 前）
    renderHUD();
    renderIntro();  // v3 §D1：登场横幅（intro 态）
    renderUlt();    // v5 §D：O 流星连斩 1.2s 演出覆盖层（屏幕坐标系，renderFlash 之前）
    renderFlash();  // v3 §D2：流星连斩全屏演出（flashT>0）
    if(hintT>0&&uiState==='play'){
      const a=Math.min(1,hintT);
      ctx.globalAlpha=a;
      _panel(VIEW_W/2-110,VIEW_H-46,220,14,{alpha:0.55,cut:2}); // v5 §A-6：hint 底条切角面板
      drawCNText(L.meta.hint,VIEW_W/2,VIEW_H-42,11,'#ffffff','center');
      // v6 §F.3：本关有未解神龛时 hint 条上方追加指引行（ui 本地判断，不动 levels.js hint 文本；
      // 设计书 §5.3 超集口径：任何有未解神龛的关卡都提示，含 L8/L9/L10）
      if(L.shrines&&L.shrines.length&&L.shrines[0]&&!isPuzzleSolved(L.shrines[0].idx))
        drawCNText('本关藏有谜题神龛 · 寻找金色光柱',VIEW_W/2,VIEW_H-56,9,'#f8d048','center');
      ctx.globalAlpha=1;
    }
    if(GOD)drawPixelText('GOD MODE',VIEW_W/2,VIEW_H-16,1,'#f8d020','center');
    if(game.paused)renderPause();
    if(uiState==='clear')renderClear(tick);
    if(puzzle.open)renderPuzzleOverlay(tick); // v4 §界面②：谜题覆盖层（世界之上、渐变遮罩之下）
    else if(bagOpen)renderBag(tick);          // v6 波2 §C：背包覆盖层（世界之上；与谜题层互斥）
    renderBagFloats();                        // v6 波2 §B：背包浮字（最顶层；关包拾取提示同样可见）
  }
  // 渐变遮罩
  if(fade>0){ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='rgba(0,0,0,'+clamp(fade,0,1)+')';ctx.fillRect(0,0,VIEW_W,VIEW_H);}
}

function drawParallax(bg,camX,camY){
  const layers=[[bg.far,0.25],[bg.near,0.5]];
  for(const[cv,par]of layers){
    const offX=((camX*par)%512+512)%512;
    const y=px(-camY*par*0.5);
    for(let x=-offX;x<VIEW_W;x+=512)ctx.drawImage(cv,px(x),y);
  }
}

function renderDecor(L,tick){
  for(const d of L.decor){
    const img=themeArt.decor[d.type];
    if(!img)continue;
    if(Array.isArray(img))ctx.drawImage(img[(tick*4|0)%img.length],px(d.x),px(d.y-img[0].height));
    else ctx.drawImage(img,px(d.x),px(d.y-img.height));
  }
}

function renderTiles(L,tick){
  const T=themeArt.tiles;
  const x0=Math.max(0,Math.floor(game.cam.x/16)),x1=Math.min(L.tw-1,Math.ceil((game.cam.x+VIEW_W)/16));
  const y0=Math.max(0,Math.floor(game.cam.y/16)),y1=Math.min(L.th-1,Math.ceil((game.cam.y+VIEW_H)/16));
  const lavaF=(tick*3|0)%2;
  const convOff=(tick*26|0)%16;
  for(let ty=y0;ty<=y1;ty++)for(let tx=x0;tx<=x1;tx++){
    const ch=L.tiles[ty][tx];
    if(ch==='.'||ch==='@'||ch==='P')continue;
    const dx=tx*16,dy=ty*16;
    switch(ch){
      case '#':{
        const above=ty>0?L.tiles[ty-1][tx]:'#';
        const cap=above!=='#'&&above!=='I';
        ctx.drawImage(cap?T.blockCap:T.block,dx,dy);break;}
      case 'I':ctx.drawImage(T.ice,dx,dy);break;
      case '=':ctx.drawImage(T.plank,dx,dy);break;
      case '^':ctx.drawImage(T.spikes,dx,dy);break;
      case 'v':ctx.drawImage(T.spikesD,dx,dy);break;
      case '~':ctx.drawImage(T.lava[lavaF],dx,dy);break;
      case 'a':case 'b':{
        const solid=(ch==='a')===(game.switchState===0);
        if(solid)ctx.drawImage(ch==='a'?T.toggleA:T.toggleB,dx,dy);
        else{ctx.globalAlpha=0.25;ctx.drawImage(ch==='a'?T.toggleA:T.toggleB,dx,dy);ctx.globalAlpha=1;}
        break;}
      case 'C':{
        const c=L.crumbles.get(tx+','+ty);
        if(!c)break;
        if(c.state===3)break;
        if(c.state===1)ctx.drawImage(T.crumble,dx+(tick*20|0)%2,dy);
        else if(c.state===2){ctx.globalAlpha=Math.max(0,1-c.t/1.2);
          ctx.drawImage(T.crumble,dx,px(dy+c.dy));ctx.globalAlpha=1;}
        else ctx.drawImage(T.crumble,dx,dy);
        break;}
      case 'D':{
        const below=ty<L.th-1?L.tiles[ty+1][tx]:'.';
        ctx.drawImage(below==='D'?T.door[0]:T.door[1],dx,dy);break;}
      case '(':case ')':{
        const img=ch==='('?T.convL:T.convR;
        const dir=ch==='('?-1:1;
        const off=dir>0?convOff:16-convOff;
        ctx.drawImage(img,dx-off,dy);ctx.drawImage(img,dx-off+16,dy);
        break;}
      case 'w':{ // v5 §E1：风柱流纹（特效队 windStreak[2] 未合入时程序化细流兜底；流纹向上滚动）
        // v7 §9.5：sea 主题渲染为上升气泡柱（引擎 'w' 语义零变化，纯 ui 渲染分支）
        if(L.meta&&L.meta.theme==='sea'){
          for(let i=0;i<2;i++){
            const by=dy+16-((tick*1.5+i*8)%16); // y=(tick*1.5+i*8)%16 相位，白青 1×2px
            ctx.fillStyle='rgba(224,248,255,0.75)';ctx.fillRect(dx+4+i*7,px(by),1,2);
          }
        }else if(SPR.windStreak){const f=SPR.windStreak[(game.tick*8|0)%2];
          ctx.globalAlpha=0.5;ctx.drawImage(f,dx,dy-((game.tick*2+ty*3)%16|0)+0);ctx.globalAlpha=1;}
        else{ctx.fillStyle='rgba(220,255,255,0.28)';ctx.fillRect(dx+6,dy+2,1,12);ctx.fillRect(dx+10,dy+6,1,9);}
        break;}
      case 'G':{ // v7 §4.2/§9.5：隐藏砖（实心；tiles.hidden 缺失→主题 block+深色裂纹暗记兜底）
        if(T.hidden)ctx.drawImage(T.hidden,dx,dy);
        else{ctx.drawImage(T.block,dx,dy);
          ctx.fillStyle='rgba(18,14,30,0.8)';
          ctx.fillRect(dx+4,dy+8,4,1);ctx.fillRect(dx+8,dy+7,3,1);ctx.fillRect(dx+11,dy+9,2,1);}
        break;}
      case '{':case '}':{ // v7 §4.1/§9.5：水流区域瓦片（非实心区域层，与 'w' 风柱同层；tiles 缺图→半透蓝块+白箭头）
        const wImg=ch==='{'?T.waterL:T.waterR;
        if(wImg)ctx.drawImage(wImg,dx,dy);
        else{ctx.fillStyle='rgba(42,138,208,0.45)';ctx.fillRect(dx,dy,16,16);
          ctx.fillStyle='rgba(240,252,255,0.8)';
          const hx=ch==='{'?dx+4:dx+9;                        // 白色 2px 箭头（指向水流方向）
          ctx.fillRect(hx,dy+7,3,2);ctx.fillRect(ch==='{'?hx-2:hx+3,dy+6,2,4);}
        break;}
      case 'g':{ // v7 §4.3/§9.5：宝箱（引擎未提取 'g' 时过渡渲染；正常路径=renderEntities 的 L.chests）
        if(SPR.chest)ctx.drawImage(SPR.chest[0],dx,dy);
        else{ctx.fillStyle='#8a5a30';ctx.fillRect(dx+2,dy+4,12,10);
          ctx.fillStyle='#f0b850';ctx.fillRect(dx+2,dy+4,12,3);
          ctx.fillStyle='#f8d048';ctx.fillRect(dx+7,dy+8,2,3);}
        break;}
      case 'R':{ // v7 §4.4/§9.5：灯笼（引擎未提取 'R' 时过渡渲染；正常路径=renderEntities 的 L.lanterns）
        if(SPR.lantern)ctx.drawImage(SPR.lantern[(tick*4|0)%2],dx,dy-8);
        else{ctx.fillStyle='#5a4a30';ctx.fillRect(dx+6,dy-6,4,2);
          ctx.fillStyle='#c03028';ctx.fillRect(dx+4,dy-4,8,9);
          ctx.fillStyle='#f86048';ctx.fillRect(dx+5,dy-3,2,2);
          ctx.fillStyle='#5a4a30';ctx.fillRect(dx+6,dy+5,4,2);}
        break;}
    }
  }
  // 门提示：持钥匙时门高亮
  if(game.keys>0){
    for(const k of L.doors.keys()){
      const[dx,dy]=k.split(',').map(Number);
      ctx.fillStyle='rgba(248,208,32,'+(0.4+0.3*Math.sin(tick*6))+')';
      ctx.fillRect(dx*16+6,dy*16+6,4,4);
    }
  }
}

// v6 波2 §E：装备图标/剪影内部工具。_gearRgba：#rrggbb→rgba（光柱/脉冲描边）；_gearSil：
// SPR.ico* 缺失（look 队并行未合入）时的程序化槽位剪影兜底（剑/冠/氅，稀有度色）。
function _gearRgba(hex,a){
  return 'rgba('+parseInt(hex.slice(1,3),16)+','+parseInt(hex.slice(3,5),16)+','+parseInt(hex.slice(5,7),16)+','+a+')';
}
function _gearSil(slot,x,y,col){
  ctx.fillStyle=col;
  if(slot==='w'){ctx.fillRect(x+4,y+1,2,7);ctx.fillRect(x+2,y+8,6,2);}                 // 剑
  else if(slot==='h'){ctx.fillRect(x+1,y+5,8,3);ctx.fillRect(x+1,y+2,2,3);
    ctx.fillRect(x+4,y+2,2,3);ctx.fillRect(x+7,y+2,2,3);}                              // 冠
  else{ctx.fillRect(x+2,y+1,6,4);ctx.fillRect(x+1,y+4,8,6);}                           // 氅
}

function renderEntities(L,tick){
  // 弹簧
  for(const s of L.springs)ctx.drawImage(s.t>0?SPR.springX:SPR.springC,px(s.x),px(s.y-2));
  // 拉杆
  for(const lv of L.levers)ctx.drawImage(SPR.lever[game.switchState],px(lv.x-2),px(lv.y-2));
  // 检查点
  for(const c of L.checkpoints)ctx.drawImage(c.on?SPR.checkOn:SPR.checkOff,px(c.x),px(c.y+4));
  // 终点旗：旗杆 + 旗
  if(L.goal){
    const g=L.goal;
    ctx.fillStyle='#8a8a9a';ctx.fillRect(px(g.x+7),px(g.y),2,g.h);
    ctx.fillStyle='#5a5a6a';ctx.fillRect(px(g.x+4),px(g.y+g.h-3),8,3);
    ctx.drawImage(SPR.flag[(tick*3|0)%2],px(g.x-6),px(g.y+1));
  }
  // 金币/宝石/钥匙
  for(const c of L.coins){
    if(c.got)continue;
    if(c.key){ctx.drawImage(SPR.key,px(c.x),px(c.y+Math.sin(tick*3+c.t)*1.5));}
    else if(c.gem){ctx.save();ctx.globalAlpha=0.75+0.25*Math.sin(tick*5);
      ctx.drawImage(SPR.gem,px(c.x-1),px(c.y));ctx.restore();}
    else ctx.drawImage(SPR.coin[((tick*6|0)+((c.t*10)|0))%4],px(c.x),px(c.y));
  }
  // 移动平台
  for(const p of L.plats){
    ctx.fillStyle='#3a4050';ctx.fillRect(px(p.x),px(p.y),p.w,p.h);
    ctx.fillStyle='#585f70';ctx.fillRect(px(p.x),px(p.y),p.w,2);
    ctx.fillStyle='#20242c';ctx.fillRect(px(p.x),px(p.y+p.h-2),p.w,2);
    ctx.fillStyle='#f8b020';
    ctx.fillRect(px(p.x+4),px(p.y+3),2,2);ctx.fillRect(px(p.x+p.w-6),px(p.y+3),2,2);
  }
  // 电锯
  for(const s of L.saws)ctx.drawImage(SPR.saw[(tick*10|0)%2],px(s.x-8),px(s.y-8));
  // 大炮
  for(const c of L.cannons){
    ctx.drawImage(c.dir>0?SPR.cannon:SPR.cannonL,px(c.x),px(c.y));
    if(c.flash>0){ctx.fillStyle='#f8f8c8';ctx.fillRect(px(c.x+(c.dir>0?15:-3)),px(c.y+5),4,4);}
  }
  // 炮弹（v3 §B2：Boss 星弹 star=true 用 bossBullet 双帧；大炮弹 vy 未定义行为不变）
  // v6 §G3：法师追踪火球 b.fire 先判（替代 bossBullet 分支优先级）——SPR.fireball 双帧，
  // 缺素材程序化兜底 6×6 橙圆+黄芯（守卫式：v5 引擎无 fire 字段恒走原路径，H4）
  for(const b of game.bullets){
    if(b.fire){
      if(SPR.fireball)ctx.drawImage(SPR.fireball[(game.tick*10|0)%2],px(b.x),px(b.y));
      else{ctx.fillStyle='#f86030';ctx.beginPath();
        ctx.arc(px(b.x+4),px(b.y+4),3,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#f8d048';ctx.fillRect(px(b.x+3),px(b.y+3),2,2);}
      continue;
    }
    ctx.drawImage(b.star&&SPR.bossBullet?SPR.bossBullet[(game.tick*8|0)%2]:SPR.bullet,px(b.x),px(b.y));
  }
  // 敌人（v5 §C：受击白闪 whiteOf 变体 + jitT ±1px 抖动 + 死亡 0.6s 渐隐 + 骑士分支；
  // v5 引擎未合入时 flashT/jitT/face 字段不存在 → 恒 falsy，表现与 v4 完全一致）
  // v6 §G2/§G4：法师分支 + 敌前摇演出全部守卫式——e.ai 缺失（v5 引擎）时分支不命中，H4 降级
  for(const e of L.enemies){
    if(e.dead>0.6)continue;
    const jit=!e.dead&&e.jitT>0?((game.tick%2)?1:-1):0;            // 受击抖动 ±1px（尸体不抖）
    const fadeA=e.dead>0?clamp(1-e.dead/0.6,0,1):1;                // 击飞尸体 0.6s 渐隐（坐标=引擎弹道积分）
    if(e.type==='mage'){ // v6 §G2：幽焰法师（SPR.mage 缺失→12×18 紫黑袍矩形+火心兜底）
      const casting=e.ai&&!e.dead&&e.ai.st==='cast';               // 读条态（引擎 v6 e.ai，未合入恒 false）
      let img=null;
      if(!e.dead){
        if(casting&&SPR.mageCast)img=SPR.mageCast;                 // 读条姿态（杖尖火种）
        else if(SPR.mage)img=SPR.mage[(e.t*3|0)%2];                // 待机双帧（兜帽+杖）
      }
      if(!e.dead&&img&&e.flashT>0)img=whiteOf(img);
      ctx.globalAlpha=e.dead>0?fadeA:1;
      if(img)ctx.drawImage(e.face>0?flipCache(img):img,px(e.x-1+jit),px(e.y)); // 14×18 对 12×18 框居中 -1；基准面左
      else{ // 无素材兜底：12×18 紫黑袍矩形 + 火心 2×2
        ctx.fillStyle='#3a2a50';ctx.fillRect(px(e.x+jit),px(e.y),12,18);
        if(!e.dead){ctx.fillStyle='#f86030';ctx.fillRect(px(e.x+5+jit),px(e.y+8),2,2);}
      }
      ctx.globalAlpha=1;
      if(casting){ // v6 §G2：读条圈——杖尖为心，半径 2→10 金圈扩张 + 末端 2×2 亮星（程序化）
        const ccx=e.x+6+e.face*4,ccy=e.y+2,r=2+8*clamp((e.ai.t||0)/0.8,0,1);
        ctx.strokeStyle='#f8d048';ctx.lineWidth=1;ctx.globalAlpha=0.85;
        ctx.beginPath();ctx.arc(px(ccx),px(ccy),Math.max(0.5,r),0,Math.PI*2);ctx.stroke();
        ctx.fillStyle='#fff8c8';ctx.fillRect(px(ccx-1),px(ccy-Math.max(0.5,r)-1),2,2);
        ctx.globalAlpha=1;
      }
    }else if(e.type==='knight'){ // v5 §4.3：骑士盔甲敌（SPR.knight[2] 基准帧面向左，e.face>0 翻转；程序化兜底）
      // v6 §G4：举盾前摇/冲锋（SPR.knightGuard[charge?1:0]）；缺素材=现 knight 帧+盾侧 2px 白条闪烁
      const windup=e.ai&&!e.dead&&(e.ai.st==='wind'||e.ai.st==='charge');
      let img=null;
      if(e.dead>0&&SPR.knightDead)img=SPR.knightDead;
      else if(windup&&SPR.knightGuard)img=SPR.knightGuard[e.ai.st==='charge'?1:0];
      else if(SPR.knight){const kf=SPR.knight[(e.t*4|0)%2];img=e.face>0?flipCache(kf):kf;}
      if(!e.dead&&img&&e.flashT>0)img=whiteOf(img);
      ctx.globalAlpha=fadeA;
      if(img)ctx.drawImage(img,px(e.x-1+jit),px(e.y));             // 14×18 精灵对 12×18 命中框居中 -1
      else{ // 无素材：12×18 钢灰矩形+面朝侧盾色浅块
        ctx.fillStyle='#8a92a8';ctx.fillRect(px(e.x+jit),px(e.y),12,18);
        ctx.fillStyle='#c8d0e0';ctx.fillRect(px(e.x+(e.face>0?9:1)+jit),px(e.y+3),2,12);
        ctx.fillStyle='#5a6274';ctx.fillRect(px(e.x+jit),px(e.y+15),12,3);
      }
      if(!e.dead&&windup&&!SPR.knightGuard&&game.tick%8<4){        // 举盾白条兜底（盾侧 2px 闪烁）
        ctx.fillStyle='#ffffff';ctx.fillRect(px(e.x+(e.face>0?9:1)+jit),px(e.y+3),2,12);
      }
      if(!e.dead&&e.guardDown){ // v6 §G4：破绽头顶 3 粒白星（本地方点非粒子池——H3 容量守卫）
        ctx.fillStyle='#ffffff';
        ctx.fillRect(px(e.x+1+jit),px(e.y-5),2,2);
        ctx.fillRect(px(e.x+5+jit),px(e.y-7),2,2);
        ctx.fillRect(px(e.x+9+jit),px(e.y-5),2,2);
      }
      ctx.globalAlpha=1;
    }else if(e.type==='slime'){
      if(e.dead>0){ctx.globalAlpha=fadeA;ctx.drawImage(SPR.slimeDead,px(e.x-1),px(e.y));ctx.globalAlpha=1;}
      else{const base=SPR.slime[(tick*4|0)%2],img=e.flashT>0?whiteOf(base):base;
        if(e.ai&&e.ai.st==='wind'){ // v6 §G4：压顶蓄力压扁——脚底中心锚定 scale(1.25,0.55)（_heroXform 思路）
          ctx.save();
          ctx.translate(px(e.x-1+jit)+img.width/2,px(e.y)+img.height);
          ctx.scale(1.25,0.55);
          ctx.drawImage(img,-img.width/2,-img.height);
          ctx.restore();
        }else ctx.drawImage(img,px(e.x-1+jit),px(e.y));}
    }else if(e.type==='lancer'){ // v7 §9.4：枪虾哨兵（SPR.lancer[2] 14×14 基准面左，face>0 flipCache；
      // wind 态=帧 2+矛前伸 1px；SPR 缺失→橙红甲壳矩形+白矛条兜底）
      const wind=e.ai&&!e.dead&&e.ai.st==='wind';
      let img=null;
      if(!e.dead&&SPR.lancer){const f=SPR.lancer[wind?1:(tick*6|0)%2];img=e.face>0?flipCache(f):f;}
      if(img&&e.flashT>0)img=whiteOf(img);
      if(img)_drawNewEnemyImg(img,e,jit,fadeA,-1,0,'foot');
      else{ctx.globalAlpha=fadeA;
        ctx.fillStyle='#c85830';ctx.fillRect(px(e.x+jit),px(e.y),e.w,e.h);
        ctx.fillStyle='#e87848';ctx.fillRect(px(e.x+jit),px(e.y),e.w,3);
        ctx.fillStyle='#f0f4ff';
        ctx.fillRect(px((e.face>0?e.x+e.w-2:e.x)+(wind?e.face:0)+jit),px(e.y+2),2,e.h-4);
        ctx.globalAlpha=1;}
    }else if(e.type==='jelly'){ // v7 §9.4：水母（SPR.jelly[2] 12×12；wind 态 scaleY1.15 膨胀（中心锚定）；
      // shock 态电弧=4 条 1px 折线从中心到 r18 圆周（#a8e8ff，tick%4<2 闪）；缺失→浅蓝圆伞兜底）
      const wind=e.ai&&!e.dead&&e.ai.st==='wind',shock=e.ai&&!e.dead&&e.ai.st==='shock';
      let img=null;
      if(!e.dead&&SPR.jelly)img=SPR.jelly[(tick*4|0)%2];
      if(img&&e.flashT>0)img=whiteOf(img);
      if(img){
        if(wind){ctx.save();ctx.translate(px(e.x+e.w/2+jit),px(e.y+e.h/2));
          ctx.scale(1,1.15);ctx.drawImage(img,-img.width/2,-img.height/2);ctx.restore();}
        else _drawNewEnemyImg(img,e,jit,fadeA,0,0,'mid');
      }else{ctx.globalAlpha=fadeA;
        ctx.fillStyle='#7ec8f0';ctx.beginPath();
        ctx.arc(px(e.x+e.w/2+jit),px(e.y+5),e.w/2,Math.PI,0);ctx.fill();
        ctx.fillStyle='#a8e0ff';ctx.fillRect(px(e.x+1+jit),px(e.y+5),e.w-2,2);
        ctx.fillStyle='#48a8e8';
        ctx.fillRect(px(e.x+3+jit),px(e.y+7),1,4);ctx.fillRect(px(e.x+e.w-4+jit),px(e.y+7),1,4);
        ctx.globalAlpha=1;}
      if(shock&&game.tick%4<2){ // 放电电弧（每步检查由引擎判定伤害；ui 只画演出）
        const cx0=e.x+e.w/2,cy0=e.y+e.h/2;
        ctx.strokeStyle='#a8e8ff';ctx.lineWidth=1;ctx.globalAlpha=0.9;
        for(let i=0;i<4;i++){const a=(i/4)*Math.PI*2+tick*0.05;
          const ex1=cx0+Math.cos(a)*18,ey1=cy0+Math.sin(a)*18;
          ctx.beginPath();ctx.moveTo(px(cx0),px(cy0));
          ctx.lineTo(px((cx0+ex1)/2+((i%2)?3:-3)),px((cy0+ey1)/2));
          ctx.lineTo(px(ex1),px(ey1));ctx.stroke();}
        ctx.globalAlpha=1;
      }
    }else if(e.type==='ghost'){ // v7 §9.4：幽灵（SPR.ghost[2] 12×14，globalAlpha=0.78；active 态
      // 拖尾=每 3 帧 1 枚 fx（#b0c8ff size1 life0.3）；缺失→半透紫白椭圆兜底）
      const act=e.ai&&!e.dead&&e.ai.st==='active';
      let img=null;
      if(!e.dead&&SPR.ghost)img=SPR.ghost[(tick*4|0)%2];
      if(img&&e.flashT>0)img=whiteOf(img);
      if(img){
        _drawNewEnemyImg(img,e,jit,fadeA*0.78,0,0,'mid');
        if(act&&game.fxParts&&game.fxParts.length<60&&game.tick%3===0)
          game.fxParts.push({x:e.x+e.w/2-1,y:e.y+e.h/2-1,vx:0,vy:-8,life:0.3,color:'#b0c8ff',size:1});
      }else{ctx.globalAlpha=fadeA*0.6;
        ctx.fillStyle='#b096dc';ctx.beginPath();
        ctx.ellipse(px(e.x+e.w/2+jit),px(e.y+e.h/2),e.w/2+1,e.h/2+1,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='rgba(240,240,255,0.75)';
        ctx.fillRect(px(e.x+3+jit),px(e.y+4),2,2);ctx.fillRect(px(e.x+e.w-5+jit),px(e.y+4),2,2);
        ctx.globalAlpha=1;}
    }else if(e.type==='boomer'){ // v7 §9.4：魂火（SPR.boomer[2] 10×10；wind 态白闪（引擎 flashT 复用）+
      // scale 1+0.15*sin(t*20) 膨胀脉冲；缺失→蓝白火苗矩形兜底）
      const wind=e.ai&&!e.dead&&e.ai.st==='wind';
      let img=null;
      if(!e.dead&&SPR.boomer)img=SPR.boomer[(tick*6|0)%2];
      if(img&&e.flashT>0)img=whiteOf(img);
      if(img){
        if(wind){const s=1+0.15*Math.sin((e.t||0)*20);
          ctx.save();ctx.translate(px(e.x+e.w/2+jit),px(e.y+e.h/2));ctx.scale(s,s);
          ctx.drawImage(img,-img.width/2,-img.height/2);ctx.restore();}
        else _drawNewEnemyImg(img,e,jit,fadeA,0,0,'mid');
      }else{ctx.globalAlpha=fadeA;
        ctx.fillStyle='#4888e8';ctx.fillRect(px(e.x+2+jit),px(e.y),e.w-4,e.h);
        ctx.fillStyle='#a8d0ff';ctx.fillRect(px(e.x+3+jit),px(e.y+2),e.w-6,e.h-4);
        ctx.fillStyle='#ffffff';ctx.fillRect(px(e.x+4+jit),px(e.y+4),2,3);
        ctx.globalAlpha=1;}
    }else{
      if(e.dead>0){ctx.globalAlpha=0.5*fadeA;ctx.drawImage(SPR.bat[0],px(e.x),px(e.y));ctx.globalAlpha=1;}
      else{const img=SPR.bat[(tick*8|0)%3];
        ctx.drawImage(e.flashT>0?whiteOf(img):img,px(e.x+jit),px(e.y));
        if(e.ai&&e.ai.st==='aim'){ // v6 §G4：俯冲瞄准线——蝙蝠中心→玩家中心 1px 红点线（每 8px 一点）
          const tp=game.player;
          if(tp){const x0=e.x+e.w/2,y0=e.y+e.h/2,x1=tp.x+tp.w/2,y1=tp.y+tp.h/2;
            const ddx=x1-x0,ddy=y1-y0,dd=Math.hypot(ddx,ddy)||1;
            ctx.fillStyle='rgba(248,88,88,0.35)';
            for(let t8=0;t8<=dd;t8+=8)ctx.fillRect(px(x0+ddx*t8/dd),px(y0+ddy*t8/dd),1,1);
          }
        }
      }
    }
    if(e.elite&&!e.dead)_eliteFx(e); // v7 §9.4：精英通用层（4 段旋转金弧/头顶血条/可选金冠）
  }
  // v3 §B2：流星（v5 §D：delay 期画金色瞄准圈——m.ring=落点地面 y 由 v5 引擎写入；
  // v3/v4 引擎无 ring 字段 → 保持现状 delay 期不画）（拖尾粒子由引擎 fxParts 推，renderFx 自动画）
  for(const m of game.meteors||[]){
    if(m.delay>0){
      if(m.ring==null)continue;             // 瞄准圈：双圈脉冲
      const rr=10+Math.sin(game.tick*0.4)*2;
      ctx.strokeStyle='#f8d048';ctx.lineWidth=1.5;ctx.globalAlpha=0.85;
      ctx.beginPath();ctx.ellipse(px(m.x+5),px(m.ring),rr,4,0,0,Math.PI*2);ctx.stroke();
      ctx.strokeStyle='#fff8c8';ctx.lineWidth=0.5;
      ctx.beginPath();ctx.ellipse(px(m.x+5),px(m.ring),rr*0.55,2,0,0,Math.PI*2);ctx.stroke();
      ctx.globalAlpha=1;continue;}
    if(SPR.meteor)ctx.drawImage(SPR.meteor[(game.tick*10|0)%2],px(m.x),px(m.y));
  }
  // v3 §B2：落地冲击波（vx<0 用翻转帧，翻转结果缓存一次）
  for(const w of game.waves||[]){
    if(!SPR.waveFx)continue;
    const img=SPR.waveFx[(game.tick*12|0)%2];
    ctx.drawImage(w.vx<0?flipCache(img):img,px(w.x-2),px(w.y));
  }
  // v3 §B2：掉落回复心（寿命最后 2s 闪烁）
  for(const d of game.drops||[]){
    if(!SPR.heartFull)continue;
    if(d.life<2&&game.tick%8<4)continue;
    ctx.drawImage(SPR.heartFull,px(d.x),px(d.y+Math.sin(game.tick*4)*1.5));
  }
  // v6 波2 §E：装备掉落渲染（loot 队实体 {x,y,w:10,h:12,slot,r,t}；守卫式 game.gearDrops 缺失整块
  // 空转，H4）。底部稀有度色光柱（宽 8、alpha 0.3+0.1sin(tick×0.1)、自实体底向上下各 14px 渐隐）+
  // 图标稀有度叠色（tintOf source-atop 缓存）上下浮动 sin(t*3)*1.5；金件（r=4）额外 1px 金描边脉冲。
  for(const d of game.gearDrops||[]){
    const col=EQ_COLOR[d.r]||EQ_COLOR[0],iy=d.y+Math.sin((d.t||0)*3)*1.5;
    const gy=px(d.y+d.h),pulse=0.3+0.1*Math.sin(game.tick*0.1);
    const grad=ctx.createLinearGradient(0,gy-14,0,gy+14);
    grad.addColorStop(0,_gearRgba(col,0));
    grad.addColorStop(0.5,_gearRgba(col,pulse));
    grad.addColorStop(1,_gearRgba(col,0));
    ctx.fillStyle=grad;ctx.fillRect(px(d.x+1),gy-14,8,28);
    const ico={w:SPR.icoW,h:SPR.icoH,c:SPR.icoC}[d.slot];
    if(ico)ctx.drawImage(tintOf(ico,col),px(d.x-1),px(iy));
    else _gearSil(d.slot,px(d.x),px(iy),col);
    if(d.r===4){ctx.globalAlpha=0.5+0.5*Math.sin(game.tick*0.2);
      ctx.strokeStyle='#f8d048';ctx.lineWidth=1;
      ctx.strokeRect(px(d.x-1)-0.5,px(iy)-0.5,13,13);ctx.globalAlpha=1;}
  }
  // v5 §E2：传送门（SPR.portal[2] 16×24 双帧漩涡，未合入程序化青紫竖椭圆+中心亮点；
  // 激活冷却中降暗 50%）
  for(const q of L.portals||[]){
    if(q.cd>0)ctx.globalAlpha=0.5;
    if(SPR.portal)ctx.drawImage(SPR.portal[(game.tick*6|0)%2],px(q.x-2),px(q.y));
    else{
      ctx.fillStyle='#48d8e8';ctx.beginPath();ctx.ellipse(px(q.x+6),px(q.y+12),6,12,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#8858c8';ctx.beginPath();ctx.ellipse(px(q.x+6),px(q.y+12),3.5,8.5,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#ffffff';ctx.fillRect(px(q.x+5),px(q.y+11),2,2);
    }
    ctx.globalAlpha=1;
  }
  // v5 §E4：吊灯摆锤（锚座 4×4 + 链 3 节沿 (ax,ay)→(bx,by) 等分点 + 金框水晶锤；
  // w.bx/w.by 由引擎每步写好只读；程序化锤=10×10 金框圆）
  for(const w of L.pends||[]){
    if(w.bx==null||w.by==null)continue;
    ctx.fillStyle='#7a7488';ctx.fillRect(px(w.ax-2),px(w.ay-2),4,4);
    for(let i=1;i<=3;i++){const t=i/4;
      ctx.fillRect(px(w.ax+(w.bx-w.ax)*t-1),px(w.ay+(w.by-w.ay)*t-1),2,2);}
    if(SPR.chandBlade)ctx.drawImage(SPR.chandBlade,px(w.bx-6),px(w.by-6));
    else{ctx.fillStyle='#48d8e8';ctx.beginPath();ctx.arc(px(w.bx),px(w.by),5,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#f8d048';ctx.lineWidth=1;ctx.stroke();}
  }
  // v7 §9.5：宝箱（L.chests 引擎 v7 提取，守卫 ||[]；SPR.chest[2] 闭/开，缺失→棕金矩形兜底；
  // opened 后仍渲染开箱+顶部微光；respawn 不复位=引擎职责）
  for(const c of L.chests||[]){
    const img=SPR.chest?SPR.chest[c.opened?1:0]:null;
    if(img)ctx.drawImage(img,px(c.x),px(c.y));
    else{ctx.fillStyle='#8a5a30';ctx.fillRect(px(c.x),px(c.y+2),16,12);
      ctx.fillStyle='#f0b850';ctx.fillRect(px(c.x),px(c.y+2),16,4);
      ctx.fillStyle=c.opened?'#5a3a18':'#f8d048';ctx.fillRect(px(c.x+7),px(c.y+7),2,3);}
    if(c.opened){ctx.globalAlpha=0.25+0.15*Math.sin(tick*0.15); // 开箱微光
      ctx.fillStyle='#f8d048';ctx.fillRect(px(c.x+3),px(c.y-1),10,2);ctx.globalAlpha=1;}
  }
  // v7 §9.5：灯笼（L.lanterns 纯光源实体，守卫 ||[]；SPR.lantern[2] 内焰 2 帧，缺失→红灯笼矩形兜底；
  // 非黑暗层时叠加 6px 暖光晕 radial alpha .25——nether 黑暗层下由黑暗层光圈承担，不叠画）
  for(const lt of L.lanterns||[]){
    const lcx=lt.x+lt.w/2,lcy=lt.y+lt.h/2;
    if(!(L.theme&&L.theme.dark===true)){
      const g3=ctx.createRadialGradient(px(lcx),px(lcy),1,px(lcx),px(lcy),6);
      g3.addColorStop(0,'rgba(248,160,80,0.25)');g3.addColorStop(1,'rgba(248,160,80,0)');
      ctx.fillStyle=g3;ctx.fillRect(px(lcx-6),px(lcy-6),12,12);
    }
    if(SPR.lantern)ctx.drawImage(SPR.lantern[(tick*4|0)%2],px(lt.x),px(lt.y));
    else{ctx.fillStyle='#5a4a30';ctx.fillRect(px(lt.x+6),px(lt.y+2),4,2);
      ctx.fillStyle='#c03028';ctx.fillRect(px(lt.x+4),px(lt.y+4),8,9);
      ctx.fillStyle='#f86048';ctx.fillRect(px(lt.x+5),px(lt.y+5),2,2);
      ctx.fillStyle='#5a4a30';ctx.fillRect(px(lt.x+6),px(lt.y+13),4,2);}
  }
  // v6 §G1：星刃回旋（renderEntities 末尾、弹幕之后；守卫式——game.blades 缺失整块空转，H4）。
  // 12×12 双帧取帧 (tick*14|0)%2，回程帧序反转；右向基准、dir<0 用 flipCache；
  // SPR.blade 缺失程序化兜底：金色四芒星+白芯（§10.1 视觉口径）
  for(const bl of game.blades||[]){
    const seq=(game.tick*14|0)%2,f=bl.phase===1?1-seq:seq;
    if(SPR.blade&&SPR.blade[f])ctx.drawImage(bl.dir<0?flipCache(SPR.blade[f]):SPR.blade[f],px(bl.x),px(bl.y));
    else{const bcx=px(bl.x+6),bcy=px(bl.y+6);
      ctx.fillStyle='#f8d048';
      ctx.fillRect(bcx-5,bcy-1,11,3);ctx.fillRect(bcx-1,bcy-5,3,11);
      ctx.fillStyle='#fff8c8';ctx.fillRect(bcx-1,bcy-1,3,3);}
  }
}

// v7 §9.4 内部：新敌通用绘制——非精英=精灵原尺寸+调用方偏移(ox,oy)（lancer -1 居中 14 精灵对 12 框，
// 其余 0）；精英=×BAL.elite.scale 拉伸（drawImage 第 5/6 参），ground 型脚底对齐命中框底（'foot'）、
// 悬浮型中心对齐（'mid'）；alpha 由调用方给（含死亡渐隐/幽灵 0.78）。BAL 缺省回退 1.75。
function _drawNewEnemyImg(img,e,jit,alpha,ox,oy,anchor){
  const es=e.elite?(((typeof BAL!=='undefined')&&BAL&&BAL.elite&&BAL.elite.scale)||1.75):1;
  ctx.globalAlpha=alpha;
  if(e.elite){
    const w=img.width*es,h=img.height*es;
    const dx0=e.x+e.w/2-w/2+jit,dy0=anchor==='foot'?e.y+e.h-h:e.y+e.h/2-h/2;
    ctx.drawImage(img,px(dx0),px(dy0),Math.round(w),Math.round(h));
  }else ctx.drawImage(img,px(e.x+ox+jit),px(e.y+oy));
  ctx.globalAlpha=1;
}
// v7 §9.4 内部：精英通用层——圆心敌中心 r=(max(w,h)/2+5) 的 4 段弧随 tick 旋转（#f8d048 alpha .7）+
// 头顶血条 24×3（底 #3a2020 / 填 #f84848 按 hp/maxHp，maxHp=BAL.elite[type].hp 缺省=当前 hp）+
// 可选 SPR.eliteCrown 8×6 覆盖头顶（缺失跳过）。
function _eliteFx(e){
  const cx=e.x+e.w/2,cy=e.y+e.h/2,r=Math.max(e.w,e.h)/2+5,rot=game.tick*0.05;
  ctx.strokeStyle='#f8d048';ctx.lineWidth=1;ctx.globalAlpha=0.7;
  for(let i=0;i<4;i++){const a0=rot+i*(Math.PI/2);
    ctx.beginPath();ctx.arc(px(cx),px(cy),r,a0,a0+Math.PI/3.2);ctx.stroke();}
  ctx.globalAlpha=1;
  const mx=((typeof BAL!=='undefined')&&BAL&&BAL.elite&&BAL.elite[e.type]&&BAL.elite[e.type].hp)||e.hp||1;
  ctx.fillStyle='#3a2020';ctx.fillRect(px(cx-12),px(e.y-8),24,3);
  ctx.fillStyle='#f84848';ctx.fillRect(px(cx-12),px(e.y-8),Math.round(24*clamp(e.hp/mx,0,1)),3);
  if(SPR.eliteCrown)ctx.drawImage(SPR.eliteCrown,px(cx-4),px(e.y-16));
}

// v3 §B2：翻转帧缓存——同一画布只 flipSprite 一次（冲击波/右臂共用）
const _flipCacheMap=new Map();
function flipCache(img){let f=_flipCacheMap.get(img);if(!f){f=flipSprite(img);_flipCacheMap.set(img,f);}return f;}

// v5 §C：白闪变体缓存——受击敌人整帧提白（每张源图只生成一次白版，避免逐帧新建画布）
const _whiteCache=new Map();
function whiteOf(img){let w=_whiteCache.get(img);
  if(!w){w=document.createElement('canvas');w.width=img.width;w.height=img.height;
    const g=w.getContext('2d');g.drawImage(img,0,0);
    g.globalCompositeOperation='source-atop';g.globalAlpha=0.85;g.fillStyle='#fff';
    g.fillRect(0,0,w.width,w.height);_whiteCache.set(img,w);}
  return w;}

// ---------- v6 波2 §F 外观合成层（设计书 §7.5 冻结伪代码：部件覆盖 + 合成缓存，非全帧重画 H5） ----------
// 朝向契约（本轮核对 art.js:1386-1404）：SPR.hero* 全部 *L 变体=flipSprite(右向基准)，故合成一律以
// 右向基准为底、朝向由 heroLook 统一翻转输出——heroPoseImg 改传右向基准（伪代码「无装备直通
// return img」补一处翻转修正，否则左向玩家卸装后朝向反转为波1 回归；装备路径本就经 e.L 翻转）。
const _lookCache=new Map();          // key=右向基准 img → {R:合成canvas, L:flipSprite(R)}
function _makeCanvasUi(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;} // 同 whiteOf 惯例
function lookEq(){                   // 穿着件→档位 {weapon,hat,cape:-1..2}；SPR.look 未合入恒全 -1（守卫直通，§F）
  const out={weapon:-1,hat:-1,cape:-1};
  if(typeof SPR==='undefined'||!SPR.look)return out;
  const find=id=>progress.inv.find(it=>it.id===id);
  const w=typeof progress.equip.w==='number'&&progress.equip.w>=0?find(progress.equip.w):null;
  const h=typeof progress.equip.h==='number'&&progress.equip.h>=0?find(progress.equip.h):null;
  const c=typeof progress.equip.c==='number'&&progress.equip.c>=0?find(progress.equip.c):null;
  if(w&&SPR.look.weapon&&SPR.look.weapon[w.r])out.weapon=lookTier(w.r);
  if(h&&SPR.look.hat&&SPR.look.hat[h.r])out.hat=lookTier(h.r);
  if(c&&SPR.look.cape&&SPR.look.cape[c.r])out.cape=lookTier(c.r);
  return out;
}
function heroLook(img,fam){
  const eq=lookEq();
  const faceL=game.player&&game.player.face<0;
  if(eq.weapon<0&&eq.hat<0&&eq.cape<0)return faceL?flipCache(img):img; // 无装备零开销直通（补朝向翻转）
  let e=_lookCache.get(img);
  if(!e){const c=_makeCanvasUi(16,16);const g=c.getContext('2d');
    const dx=fam==='atk'?1:0;                                        // 攻/冲家族 +1 列（§7.5 核验#2）
    if(eq.cape>=0)g.drawImage(SPR.look.cape[eq.cape],0,0);           // 披风=底层
    g.drawImage(img,0,0);
    if(eq.weapon>=0)g.drawImage(SPR.look.weapon[eq.weapon],dx,0);    // 武器=手侧覆盖
    if(eq.hat>=0)g.drawImage(SPR.look.hat[eq.hat],dx,0);             // 头饰=头顶覆盖
    e={R:c,L:flipSprite(c)};_lookCache.set(img,e);}
  return faceL?e.L:e.R;
}
function _lookDirty(){_lookCache.clear();} // 穿/脱/升阶时调用（§7.5：外观缓存失效）

// v6 波2 §E/§7.4：图标稀有度叠色缓存（whiteOf 思路 source-atop；每 对(图标,稀有度色) 只合成一次）
const _tintCache=new Map();
function tintOf(img,color){
  let m=_tintCache.get(img);
  if(!m){m={};_tintCache.set(img,m);}
  let t=m[color];
  if(!t){t=_makeCanvasUi(img.width,img.height);const g=t.getContext('2d');
    g.drawImage(img,0,0);
    g.globalCompositeOperation='source-atop';g.globalAlpha=0.85;g.fillStyle=color;
    g.fillRect(0,0,t.width,t.height);m[color]=t;}
  return t;
}

// v7 §9.3：Boss 名/提示/刻度参数化（kind：0/1=星核巨兽、2=蛟龙·敖渊、3=幽冥判官；旧引擎无 kind → 0 零回归）。
// BOSS_P2FRAC=P2 阶段刻度占条宽比例（=设计书 §6.4 的 50%/40%/40%）。
const BOSS_NAME=['星核巨兽','蛟龙·敖渊','幽冥判官'];
const BOSS_P2TIP=['狂暴于 50%','唤潮于 40%','摄魂于 40%'];
const BOSS_P2FRAC=[0.5,0.4,0.4];
// v3 §B1：Boss 部件装配（renderEntities 后、renderPlayer 前调用）。
// 画序 body→armL/armR→jaw→eyes+瞳孔→core→白闪覆盖；状态偏移表 [bodyDy,armDy,jaw开?,eyeType]，
// eyeType：eye 普通眼 / rage 红眼 / dizzy 晕眼（不画瞳）/ dark 暗眼（alpha .5）。
// v7 §9.3：部件表 [SPR.boss,boss2,boss3] 按 kind 索引（该 kind 部件组缺失→整块 return，现行守卫保留）；
// 白闪 bossWhite2/3 同索引选择；姿态表追加 sweepCast/blinkCast（hidden 整帧跳过渲染）/scytheCast；
// body 偏移按部件图尺寸对齐 x=b.x+(b.w-img.width)/2（kind1 body 图 64×48：(52-64)/2=-6=现行 b.x-6，
// 逐像素一致）；y kind1 保留现行 b.y-2（设计书"52×48 与框相同→零回归"的声明按现状核对为 64×48，
// 若套底对齐公式会整体下移 2px——kind1 走原偏移保证 R8 零回归，kind2/3 走 y=b.y+b.h-img.height+dy）。
function renderBoss(tick){
  const b=game.boss; if(!b||b.state==='dead')return;
  const P=[SPR.boss,SPR.boss2,SPR.boss3][b.kind||0];
  if(!P)return; // 美术 v7 未合入兜底（该 kind 部件组缺失→整块不画）
  if(b.state==='blinkCast'&&b.hidden)return; // v7 §9.3：blink 隐身期整帧跳过渲染（免伤免接触由引擎管）
  const p=game.player,R=b.phase===2;                 // 换装组选择
  const B=R?(P.bodyRage||P.body):P.body,A=R?(P.armRage||P.arm):P.arm,
        J=R?(P.jawRage||P.jaw):P.jaw;
  // §D3 nova 预警环：Boss 中心扩张圆环，玩家可读的躲避提示（世界坐标，画在身体之下层）
  if(b.state==='novaCast'){
    ctx.strokeStyle='#f86030';
    ctx.globalAlpha=clamp(.6-.5*b.t,0,1);
    ctx.beginPath();ctx.arc(b.x+b.w/2,b.y+b.h/2,b.t*90,0,Math.PI*2);ctx.stroke();
    ctx.globalAlpha=1;
  }
  let dy=0,ad=14,jaw=0,eye='eye';                    // 默认 idle 行
  switch(b.state){
    case 'dormant': eye='dark';break;                                     // 0/14/闭/暗眼
    case 'windup':
      if(b.next==='leap'){dy=3;ad=6;jaw=1;}                               // +3/6/开/眼
      else if(b.next==='charge'){dy=2;ad=18;eye='rage';}                  // +2/18/闭/红眼
      else{ad=10;jaw=1;eye='rage';}                                       // barrage|nova|sweep|blink|scythe: 0/10/开/红眼
      break;
    case 'leapAir': dy=-4;ad=0;jaw=1;break;                               // -4/0/开/眼
    case 'chargeRun': dy=1;ad=16;jaw=1;eye='rage';break;                  // +1/16/开/红眼
    case 'stagger': dy=5;ad=20;eye='dizzy';break;                         // +5/20/闭/晕眼
    case 'recover': dy=2;ad=16;break;                                     // +2/16/闭/眼
    case 'novaCast': dy=-2;ad=2;jaw=1;eye='rage';break;                   // -2/2/开/红眼
    case 'summonCast': ad=8;jaw=1;break;                                  // 0/8/开/眼
    case 'intro': case 'enrage': dy=-2;ad=4;jaw=1;eye='rage';break;       // -2/4/开/红眼
    case 'dying': dy=12;ad=12;jaw=1;eye='dizzy';break;                    // 随引擎 y 下沉 +12/12/开/晕眼
    case 'sweepCast': dy=2;ad=20;jaw=1;eye='rage';break;                  // v7 §9.3：蛟龙扫尾
    case 'scytheCast': dy=-2;ad=2;jaw=1;eye='rage';break;                 // v7 §9.3：判官镰刀
  }
  const baseA=(b.state==='dying'&&(tick%8<4))?0.5:1; // dying：(tick%8<4) 整体 alpha .5
  ctx.globalAlpha=baseA;
  const bimg=B[(tick*3|0)%B.length];                                     // body（呼吸帧=B 慢周期取 0/1）
  const bdx=b.x+(b.w-bimg.width)/2;                                      // 尺寸对齐 x（kind1=-6=现行一致）
  const bdy=(b.kind||0)<=1?b.y-2:b.y+b.h-bimg.height;                    // kind1 保留现行 -2（零回归）；kind2/3 底对齐
  ctx.drawImage(bimg,px(bdx),px(bdy+dy));
  ctx.drawImage(A,px(b.x-10),px(b.y+12+ad));                             // armL
  ctx.drawImage(flipCache(A),px(b.x+b.w-10),px(b.y+12+ad));              // armR=翻转帧
  if(J)ctx.drawImage(J[jaw?1:0],px(b.x+16),px(b.y+36));                  // jaw 闭/开
  const eyeImg=eye==='rage'?(P.eyeRage||P.eye):eye==='dizzy'?(P.eyeDizzy||P.eye):P.eye;
  for(const ex0 of[b.x+8,b.x+b.w-20]){                                   // eyeL / eyeR
    ctx.globalAlpha=baseA*(eye==='dark'?0.5:1);
    ctx.drawImage(eyeImg,px(ex0),px(b.y+10));
    if(eye!=='dizzy'&&p&&P.pupil){                                // 瞳孔 ±2px 追踪（晕眼不画瞳）
      const cx=ex0+6,cy=b.y+15;
      const ox=clamp((p.x-cx)/40,-1,1)*2,oy=clamp((p.y-cy)/40,-1,1)*2;
      ctx.drawImage(P.pupil,px(cx-2+ox),px(cy-2+oy));
    }
  }
  ctx.globalAlpha=baseA;
  if(P.core)ctx.drawImage(P.core[(tick*(R?10:6)|0)%P.core.length],px(b.x+20),px(b.y+20)); // core 狂暴加倍
  const PW=[SPR.bossWhite,SPR.boss2White,SPR.boss3White][b.kind||0]; // v7：白剪影同索引（art 实际交付键=boss2White/boss3White；缺失不闪白）
  if(b.flashT>0&&PW){                                         // 白闪：同偏移再画一遍
    ctx.globalAlpha=baseA*clamp(b.flashT/0.12,0,1);
    ctx.drawImage(PW.body,px(bdx),px(bdy+dy));
    ctx.drawImage(PW.arm,px(b.x-10),px(b.y+12+ad));
    ctx.drawImage(flipCache(PW.arm),px(b.x+b.w-10),px(b.y+12+ad));
    ctx.drawImage(PW.jaw,px(b.x+16),px(b.y+36)); // bossWhite.jaw=开口白剪影单张（art.js §C5，非数组）
  }
  ctx.globalAlpha=1;
}

// v2 P1：英雄姿态选择（渲染与残影快照共用）。heroAttack/heroDash/heroSquash 为 P2 画师
// 待交付键——就位前自动回退既有帧，取帧式按 SPR.heroRun.length 自适应（3 帧现状/6 帧 P2 均可）。
// v6 波2 §F：朝向改由 heroLook 统一翻转（*L 变体=flipSprite(右向基准)，右向基准合成后翻转=原
// faceL 变体逐像素一致），本函数改传右向基准；fam 由 pose 分支给出（attack/dash/dashWind/cast→'atk'）。
function heroPoseImg(tick){
  const p=game.player;
  let anim;
  if(!p.onGround)anim=p.vy<0?'jump':'fall';
  else anim=Math.abs(p.vx)>10?'run':'idle';
  let img,fam='idle';
  if(anim==='idle')img=(tick%40<38)?SPR.heroIdle1:SPR.heroIdle2;
  else if(anim==='run')img=SPR.heroRun[(p.animT*12|0)%SPR.heroRun.length]; // v2：6 帧取帧适配（animT*12%帧数）
  else if(anim==='jump')img=SPR.heroJump;
  else img=SPR.heroFall;
  if(p.landT>0&&SPR.heroSquash)img=SPR.heroSquash; // 落地压扁帧（P2 就位后生效）
  // v5 §B1：冲刺三段——蓄力期（流逝 el=0.28-dashT<0.05）用后仰帧 heroDashWind（特效队供，
  // 无则 heroDash）；爆发/滑行沿用 heroDash。v4 引擎 dashT 总时长 0.18 → el 恒≥0.10，走 heroDash 不变。
  if(p.dashT>0){
    if(0.28-p.dashT<0.05&&SPR.heroDashWind){img=SPR.heroDashWind;fam='atk';}
    else if(SPR.heroDash){img=SPR.heroDash;fam='atk';}
  }
  if(p.djT>0)img=SPR.heroJump; // v5 §B2：二段跳空翻用跳跃帧（360° 旋转由 _heroXform 实现）
  if((p.atkT>0||p.atkWind>0)&&SPR.heroAttack){img=SPR.heroAttack;fam='atk';} // 挥击帧（v5：含起手 atkWind 期）
  if(p.castT>0){ // v3 §C4：技能施法金色姿态（缺素材回退 heroAttack，同 v2 模式）
    if(SPR.heroAttackGold)img=SPR.heroAttackGold;
    else if(SPR.heroAttack)img=SPR.heroAttack;
    fam='atk';
  }
  return heroLook(img,fam); // v6 §F：外观合成（无装备直通+朝向翻转；SPR.look 未合入恒直通零回归）
}

// v5 §B：主角统一姿态变换——squash/lean/turn/spin 合成后以脚底中心为锚 drawImage。
// 全部字段（turnT/atkWind/djT/landVy）为 v5 引擎产出，缺失（v4）时对应变换自然不生效；
// landT 为 v2 既有字段：landVy 缺省走小落（0.15/0.25/0.32），与 v2 squash 表现一致。
function _heroXform(img){
  const p=game.player;
  ctx.save();
  const cx=px(p.x-3)+img.width/2, feet=px(p.y-2)+img.height;
  ctx.translate(cx,feet);
  if(p.turnT>0)ctx.scale(0.72+0.28*(1-p.turnT/0.12),1);            // 转身翻转 squash（0.72→1 回弹）
  const run=p.anim==='run'&&p.onGround;
  if(run)ctx.rotate(p.face*2*Math.PI/180*Math.min(1,Math.abs(p.vx)/PHY.maxRun)); // 跑动前倾 2°
  if(p.atkWind>0)ctx.rotate(-p.face*8*Math.PI/180);                // 攻击起手后仰
  if(p.dashT>0&&0.28-p.dashT<0.05)ctx.rotate(-p.face*10*Math.PI/180); // 冲刺蓄力后仰
  if(p.djT>0)ctx.rotate(p.face*(1-p.djT/0.4)*Math.PI*2);           // 二段跳空翻 360°
  if(p.landT>0){const k=clamp(p.landT/(p.landVy>300?0.22:0.15),0,1);
    ctx.scale(1+(p.landVy>300?0.35:0.25)*k,1-(p.landVy>300?0.40:0.32)*k);} // 落地 squash（大落加深）
  ctx.drawImage(img,-img.width/2,-img.height);
  ctx.restore();
}

function renderPlayer(tick){
  const p=game.player;
  if(!p)return;
  if(p.dead){ // 死亡表现：旋转上抛渐隐（替代 v1 的 0.9s 完全隐形）
    const df=heroLook(SPR.heroFall,'idle'); // v6 §F：死亡分支直接调 heroLook（右向基准，朝向随 heroLook）
    ctx.save();
    ctx.translate(px(p.x-3)+df.width/2,px(p.y-2)+df.height-2);
    ctx.rotate(p.deadT*9);
    ctx.globalAlpha=clamp(1-p.deadT/0.85,0,1);
    ctx.drawImage(df,-df.width/2,-df.height);
    ctx.restore();
    return;
  }
  const img=heroPoseImg(tick);
  const blink=p.invT>0&&game.tick%6<3; // v3 §C4：受伤无敌隔帧隐藏（同心形 HP 节拍）
  if(!blink)_heroXform(img); // v5 §B：原 landT 专用 squash 分支删除，统一并入姿态变换
  if(p.shieldT>0){ // v5 §D：星光护盾六边形光罩（替换 v3 双圈金泡泡）——慢旋转+边上流动光纹+临破闪烁
    const cx=p.x+5,cy=p.y+7,R=14,rot=game.tick*0.013;    // 慢旋转
    const flick=p.shieldT<1?0.35+0.45*Math.abs(Math.sin(game.tick*0.4)):0.8;
    ctx.save();ctx.translate(px(cx),px(cy));ctx.rotate(rot);
    ctx.globalAlpha=flick;ctx.strokeStyle='#f8d048';ctx.lineWidth=1.5;ctx.beginPath();
    for(let i=0;i<=6;i++){const a=i/6*Math.PI*2;
      i?ctx.lineTo(Math.cos(a)*R,Math.sin(a)*R):ctx.moveTo(Math.cos(a)*R,Math.sin(a)*R);}
    ctx.stroke();
    // 边上流动光纹：短亮弧沿边循环滑动（相位=game.tick*0.05）
    ctx.strokeStyle='#fff8c8';ctx.lineWidth=1;
    for(let i=0;i<3;i++){const ph=(game.tick*0.05+i/3)%1,a0=ph*6/6*Math.PI*2;
      ctx.beginPath();ctx.arc(0,0,R,a0,a0+0.5);ctx.stroke();}
    ctx.restore();ctx.globalAlpha=1;
  }
}

// v2 P1：冲刺残影——0.04s 间隔记录姿态快照，0.16s 生命期=共 4 帧半透明剪影
function updateGhosts(dt){
  const p=game.player;
  for(let i=0;i<ghosts.length;i++)ghosts[i].t+=dt;
  while(ghosts.length&&ghosts[0].t>=0.16)ghosts.shift();
  if(p&&p.dashT>0&&uiState==='play'){
    ghostTick-=dt;
    if(ghostTick<=0){ghostTick=0.04;ghosts.push({img:heroPoseImg(game.tick),x:p.x-3,y:p.y-2,t:0});}
  }else ghostTick=0;
}
function renderGhosts(){
  for(const g of ghosts){
    ctx.globalAlpha=clamp(0.45*(1-g.t/0.16),0,1);
    ctx.drawImage(g.img,px(g.x),px(g.y));
  }
  ctx.globalAlpha=1;
}

  // v5 §A：UI 层演出池推进——floats/fxParts/scars 引擎只写、ui 每步推进+修剪（工单 §A：
  // step() 内 updateGhosts(dt) 旁调用，play 态推进；pause/谜题层不推进）。要点：本函数不感知
  // 引擎 hitStop/ult 冻结（updateWorld 提前 return 不影响它）——冻结期数字与火花仍在动。
  // v5 封面队 §B：title 态也推进（封面流星尾迹/落字金 fx 走 fxParts 渲染管线）。
  // 守卫：三字段为 v5 引擎产出，不存在（v4）时对应循环空转，不抛异常（H4）。
function simUiFx(dt){
  if((uiState!=='play'&&uiState!=='title')||game.paused||puzzle.open)return;
  const fl=game.floats;
  if(fl)for(let i=fl.length-1;i>=0;i--){const f=fl[i];
    f.t+=dt; if(f.t>=f.life)fl.splice(i,1);}
  const fx=game.fxParts;
  if(fx)for(let i=fx.length-1;i>=0;i--){const q=fx[i];
    q.life-=dt; q.vy+=(q.grav||0)*dt; q.x+=q.vx*dt; q.y+=q.vy*dt;
    if(q.ring)q.r+=(q.r1-q.r)*(dt/Math.max(0.05,q.life0||0.3)); // 环扩张（life0 入队时快照，缺省 0.3）
    if(q.life<=0)fx.splice(i,1);}
  const sc=game.scars;
  if(sc)for(let i=sc.length-1;i>=0;i--){const s=sc[i];
    s.t+=dt; if(s.t>0.6)sc.splice(i,1);}
}

// v7 §9.8：隐藏房微提示——玩家距任一未碎 'G' 瓦片 ≤24px 且 game.tick%90<2 时，自该瓦片底缘
// 落 1 粒 1×1 尘 fx（#c8c8d8, vy 30, life 0.5）——极轻量，不做光柱（保持"需要观察"的探索感）。
// 工单硬性要求：G 列表每 8 帧节流重扫缓存（视口+2 瓦余量），勿每帧全图扫；_gLastDust 保证
// 每 90 tick 至多一粒（%90<2 的两帧窗口只落首粒）。引擎碎 'G' 后重扫自然剔除（tiles 已置 '.'）。
let _gScanTick=-999,_gTiles=[],_gLastDust=-999;
function simHiddenHint(){
  const L=game.level,p=game.player;
  if(!L||!L.tiles||!p||p.dead)return;
  if(game.tick-_gScanTick>=8){
    _gScanTick=game.tick;_gTiles=[];
    const x0=Math.max(0,(game.cam.x/16|0)-2),x1=Math.min(L.tw-1,((game.cam.x+VIEW_W)/16|0)+2);
    const y0=Math.max(0,(game.cam.y/16|0)-2),y1=Math.min(L.th-1,((game.cam.y+VIEW_H)/16|0)+2);
    for(let ty=y0;ty<=y1;ty++)for(let tx=x0;tx<=x1;tx++)if(L.tiles[ty][tx]==='G')_gTiles.push([tx,ty]);
  }
  if(!_gTiles.length||game.tick%90>=2||game.tick-_gLastDust<90)return;
  for(const g of _gTiles){
    if(Math.hypot(p.x+p.w/2-(g[0]*16+8),p.y+p.h/2-(g[1]*16+8))<=24){
      _gLastDust=game.tick;
      if(game.fxParts&&game.fxParts.length<60)
        game.fxParts.push({x:g[0]*16+6+Math.random()*4,y:g[1]*16+15,vx:0,vy:30,life:0.5,
          color:'#c8c8d8',size:1});
      break;
    }
  }
}

// v5 §B：冲刺爆发段速度线（renderGhosts 之后、renderPlayer 之前；爆发窗口 0.05~0.23）
function renderSpeedLines(){
  const p=game.player;
  if(!p||p.dead||!(p.dashT>0))return;
  const el=0.28-p.dashT;
  if(!(el>=0.05&&el<0.23))return;
  ctx.strokeStyle='rgba(232,248,255,0.55)';ctx.lineWidth=1;
  for(let i=0;i<3;i++){const ly=px(p.y+2+i*5+(game.tick%4));
    ctx.beginPath();ctx.moveTo(px(p.x+5-p.dashDir*(10+i*3)),ly);
    ctx.lineTo(px(p.x+5-p.dashDir*(22+i*4)),ly);ctx.stroke();}
}

// v2 P1：挥击弧光——画师 slashArc 就位后自动启用，此前程序化弧兜底。
// v5 §C：四帧时间轴（p.atkAnim=挥击总动画 0.25→0，v5 引擎写入）：流逝 el<0.05 起手帧 idx0；
// 0.05~0.17 帧1→2 随进度插值（0.11 分界）；0.17~0.25 帧3 余韵。位置/翻转/透明度沿现状。
// v4 引擎无 atkAnim → 整体走下方现行 atkT 逻辑（H4 静默降级到 v2 三帧/程序化弧表现）。
function renderSlash(){
  const p=game.player;
  if(!p)return;
  if(p.atkAnim>0){
    const el=0.25-p.atkAnim;
    const arc=SPR.slashArc||[];
    let img;
    if(arc.length>=4)img=arc[el<0.05?0:el<0.11?1:el<0.17?2:3];
    else if(arc.length)img=arc[Math.min(arc.length-1,(el/0.25*arc.length)|0)];   // 旧3帧兜底
    if(!img)return;
    const prog=clamp(el/0.25,0,1);
    ctx.save();
    ctx.translate(px(p.x+p.w/2+p.face*13),px(p.y+p.h/2));
    if(p.face<0)ctx.scale(-1,1);
    ctx.globalAlpha=clamp(0.9-prog*0.55,0,1);
    ctx.drawImage(img,-img.width/2,-img.height/2);
    ctx.restore();
    ctx.globalAlpha=1;
    return;
  }
  if(!(p.atkT>0))return;
  const prog=clamp(1-p.atkT/0.12,0,1); // 判定框存在期 0.12s 内的进度 0→1
  ctx.save();
  ctx.translate(px(p.x+p.w/2+p.face*13),px(p.y+p.h/2));
  if(p.face<0)ctx.scale(-1,1);
  ctx.globalAlpha=clamp(0.9-prog*0.55,0,1);
  if(SPR.slashArc&&SPR.slashArc.length){
    const arc=SPR.slashArc;
    const img=arc[Math.min(arc.length-1,(prog*arc.length)|0)];
    ctx.drawImage(img,-img.width/2,-img.height/2);
  }else{
    ctx.strokeStyle=prog<0.5?'#ffffff':'#48d8e8';
    ctx.lineWidth=2;
    ctx.beginPath();
    ctx.arc(0,0,8+prog*6,-1.25+prog*1.5,0.45+prog*1.5);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha=1;
}

// v5 §F：存量粒子「流光」渲染——按速度量化画细长条（禁旋转）：
// |v|>120 主轴 1×3 / 40~120 主轴 1×2 / 慢速方点（主轴=|vx|>=|vy| 取横向）。
function renderParts(){
  for(const pt of game.parts){
    ctx.globalAlpha=clamp(pt.life*2,0,1);
    ctx.fillStyle=pt.color;
    const sp=Math.hypot(pt.vx,pt.vy);
    if(sp>120){const L=3,h=1;                          // 快：1×3 主轴
      if(Math.abs(pt.vx)>=Math.abs(pt.vy))ctx.fillRect(px(pt.x)-1,px(pt.y),L,h);
      else ctx.fillRect(px(pt.x),px(pt.y)-1,h,L);}
    else if(sp>40){ if(Math.abs(pt.vx)>=Math.abs(pt.vy))ctx.fillRect(px(pt.x),px(pt.y),2,1);
      else ctx.fillRect(px(pt.x),px(pt.y),1,2);}
    else ctx.fillRect(px(pt.x),px(pt.y),pt.size,pt.size);
  }
  ctx.globalAlpha=1;
}

// v5 §A：陨石爆坑——暗色椭圆 0.6s 渐隐（game.scars 由引擎只写、simUiFx 推进；字段缺省空转）
function renderScars(){ 
  for(const s of game.scars||[]){ctx.globalAlpha=0.5*(1-s.t/0.6);
    ctx.fillStyle='#241c30';ctx.beginPath();
    ctx.ellipse(px(s.x),px(s.y),9,3,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#3a2c50';ctx.beginPath();
    ctx.ellipse(px(s.x),px(s.y-1),6,2,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}}

// v5 §A：UI 层演出粒子——star=十字星 / shard=碎片 / ring=扩散环 / 默认=小方点
function renderFx(){ // UI 层粒子
  for(const p of game.fxParts||[]){
    if(p.ring){ctx.globalAlpha=clamp(p.life*3.3,0,1);ctx.strokeStyle=p.color;ctx.lineWidth=1.5;
      ctx.beginPath();ctx.arc(px(p.x),px(p.y),Math.max(1,p.r||2),0,Math.PI*2);ctx.stroke();continue;}
    ctx.globalAlpha=clamp(p.life*2.5,0,1);ctx.fillStyle=p.color;
    if(p.star){const s=2;ctx.fillRect(px(p.x)-s,px(p.y),s*2+1,1);ctx.fillRect(px(p.x),px(p.y)-s,1,s*2+1);}
    else if(p.shard){ctx.fillRect(px(p.x),px(p.y),2,2);ctx.fillStyle='#ffffff';ctx.fillRect(px(p.x),px(p.y),1,1);}
    else ctx.fillRect(px(p.x),px(p.y),p.size||2,p.size||2);}
  ctx.globalAlpha=1;}

// v5 §A：浮动文字——上浮 22px 减速 + 前 0.12s 弹跳放大 + 尾段渐隐（普通白/暴击金/技能青由引擎着色）
function renderFloats(){ // 浮动文字
  for(const f of game.floats||[]){
    const k=f.t/f.life, rise=22*(1-Math.pow(1-k,2));
    const pop=f.t<0.12?1+(0.12-f.t)*4:1;                 // 弹跳 scale
    ctx.globalAlpha=k>0.7?(1-k)/0.3:1;
    drawPixelText(f.text,px(f.x),px(f.y-rise),(f.big?2:1)*Math.min(2,pop),f.color,'center');
    ctx.globalAlpha=1;}}

// v5 §D：O 流星连斩 1.2s 演出覆盖层（屏幕坐标系；renderFlash 之前调用）。
// 阶段（spec §3.1）：①时停压暗+主角高亮 0~0.55 ②十字巨剑光 0.30~0.55 ③结算 t=0.55（引擎）
// ④冲击环 0.55~0.90（压暗随 1-k 退去）⑤白闪 t=0.90（引擎置 flashT=0.1，renderFlash 现有逻辑）
// ⑥余韵 t≥1.2 引擎复位。game.ult 不存在（v4）时整函数空转。
function renderUlt(){
  const u=game.ult; if(!u||!u.on)return;
  const t=u.t, p=game.player;
  if(!p)return;
  // ①②④ 压暗：0~0.30 渐入 0.55 维持；0.55~0.90 随冲击环按 1-k 退去（spec §3.1①④）
  if(t<0.9){
    const a=t<0.55?0.55*Math.min(1,t/0.3):0.55*clamp(1-(t-0.55)/0.35,0,1);
    ctx.fillStyle='rgba(6,8,20,'+a+')';ctx.fillRect(0,0,VIEW_W,VIEW_H);
  }
  // ① 时停主角高亮：脚下金环+身后径向亮斑（世界坐标随相机）
  if(t<0.55){
    const sx=px(p.x+5-game.cam.x),sy=px(p.y+7-game.cam.y);
    const g=ctx.createRadialGradient(sx,sy,2,sx,sy,26);
    g.addColorStop(0,'rgba(248,208,72,0.55)');g.addColorStop(1,'rgba(248,208,72,0)');
    ctx.fillStyle=g;ctx.fillRect(sx-26,sy-26,52,52);
    ctx.strokeStyle='#f8d048';ctx.lineWidth=1;
    ctx.beginPath();ctx.arc(sx,sy,14+Math.sin(game.tick*0.5)*2,0,Math.PI*2);ctx.stroke();}
  // ② 十字巨剑光（0.30~0.55 两条对角带扫过；0.55~0.90 快速淡出；白芯+金边+头部亮星）
  if(t>0.3&&t<0.9){const k=clamp((t-0.3)/0.25,0,1),fade=t>0.55?clamp(1-(t-0.55)/0.2,0,1):1;
    for(const d of[[-1,1],[1,-1]]){ // 左上→右下 / 右上→左下
      const x0=d[0]<0?k*VIEW_W:VIEW_W-k*VIEW_W, y0=0, x1=x0+d[0]*180, y1=150;
      ctx.globalAlpha=fade;ctx.strokeStyle='#f8d048';ctx.lineWidth=5-3*k;
      ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.stroke();
      ctx.strokeStyle='#ffffff';ctx.lineWidth=1.5;ctx.stroke(); // 白芯
      ctx.fillStyle='#fff8c8';ctx.fillRect(x1-2,y1-2,4,4);     // 剑光头部亮星
      ctx.globalAlpha=1;}}
  // ④ 冲击波环（0.55~0.90 以主角为中心金环扩散 0→260px，内圈白 1px）
  if(t>=0.55&&t<0.9){const k=(t-0.55)/0.35;
    const sx=px(p.x+5-game.cam.x),sy=px(p.y+7-game.cam.y);
    ctx.globalAlpha=1-k;ctx.strokeStyle='#f8d048';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(sx,sy,Math.max(0.1,260*k),0,Math.PI*2);ctx.stroke();
    ctx.strokeStyle='#ffffff';ctx.lineWidth=1;
    // 半径下限 0.1：环初动期 260*k-3 为负会让 arc() 抛异常并杀死整个 rAF 主循环
    ctx.beginPath();ctx.arc(sx,sy,Math.max(0.1,260*k-3),0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;}
  // ⑤ 白闪复用 game.flashT（引擎已在 t=0.9 置 0.1，renderFlash 现有逻辑不动）
}

// v7 §9.7：黑暗层（nether 专属）——模块级 384×224 离屏单例（勿每帧新建）；世界渲染完成后、HUD 前调用。
// rgba(4,8,18,0.78) 铺底 → destination-out 径向渐变开洞：玩家中心 r64 + 每个 L.lanterns 中心
// r80×(0.92+0.08*sin(tick*0.13)) 摇曳 + 检查点/神龛 r24 微光（partial punch 0.55）→ drawImage 到主画布。
// Boss 关（L16）同样生效（竞技场灯笼由关卡摆放保证可读性）；光源按视口过滤控制 radial 渐变数量。
// 开关守卫（H3/R8）：L.theme.dark===true 且 L.meta.theme==='nether' 双条件——现行 THEMES 的
// cave/factory/lava/tower/boss/star 自 v5 起即带 dark:true（数据标记，此前从未被消费），单判 dark
// 会把这六个既有主题一并压暗，违背 R8 既有内容零回归；nether 未合入（THEMES 桩无 dark）时整块跳过。
let _darkCv=null;
function renderDarkness(tick){
  const L=game.level;
  if(!L||!L.theme||L.theme.dark!==true||!L.meta||L.meta.theme!=='nether')return;
  if(!_darkCv){_darkCv=document.createElement('canvas');_darkCv.width=VIEW_W;_darkCv.height=VIEW_H;}
  const o=_darkCv.getContext('2d'),cam=game.cam;
  o.globalCompositeOperation='source-over';
  o.clearRect(0,0,VIEW_W,VIEW_H);
  o.fillStyle='rgba(4,8,18,0.78)';o.fillRect(0,0,VIEW_W,VIEW_H);
  o.globalCompositeOperation='destination-out';
  const hole=(x,y,r,a)=>{ // 径向渐变开洞（中心 a→边缘 0；r 下限 1 防 0 半径异常）
    const rr=Math.max(1,r);
    const g=o.createRadialGradient(x,y,Math.max(1,rr*0.2),x,y,rr);
    g.addColorStop(0,'rgba(0,0,0,'+a+')');g.addColorStop(1,'rgba(0,0,0,0)');
    o.fillStyle=g;o.fillRect(x-rr,y-rr,rr*2,rr*2);
  };
  const vis=(x,y,r)=>x>cam.x-r&&x<cam.x+VIEW_W+r&&y>cam.y-r&&y<cam.y+VIEW_H+r;
  const p=game.player;
  if(p)hole(px(p.x+p.w/2-cam.x),px(p.y+p.h/2-cam.y),64,1);
  for(const lt of L.lanterns||[]){ // 灯笼摇曳（§4.4：'R' 实体=光源，80px 光圈）
    const cx=lt.x+lt.w/2,cy=lt.y+lt.h/2;
    if(vis(cx,cy,90))hole(px(cx-cam.x),px(cy-cam.y),80*(0.92+0.08*Math.sin(tick*0.13)),1);
  }
  const glow=(x,y)=>{if(vis(x,y,30))hole(px(x-cam.x),px(y-cam.y),24,0.55);}; // 检查点/神龛 r24 微光
  for(const c of L.checkpoints||[])glow(c.x+8,c.y+12);
  for(const s of L.shrines||[])glow(s.x+8,s.y+12);
  o.globalCompositeOperation='source-over';
  ctx.drawImage(_darkCv,0,0);
}

function renderHUD(){
  const L=game.level;
  // v5 §A-1/§E：顶栏换肤——深蓝半透底+下缘 1px 金细线；文字色按 §5.5 色系
  ctx.fillStyle='rgba(10,18,42,0.62)';ctx.fillRect(0,0,VIEW_W,16);
  ctx.fillStyle='#f0c860';ctx.fillRect(0,15,VIEW_W,1);
  drawCNText(L.meta.name,5,3,10,'#f0f4ff');
  // 金币
  ctx.drawImage(SPR.coin[0],100,4);
  drawPixelText(game.coins+'/'+L.totalCoin,111,5,1,'#f8d048');
  // 钥匙
  if(game.keys>0||L.meta.theme==='cave'||L.meta.theme==='tower'){
    ctx.drawImage(SPR.key,158,5);
    drawPixelText('x'+game.keys,170,5,1,'#f8f0a0');
  }
  // 时间
  const t=Math.floor(game.time);
  const mm=String(Math.floor(t/60)),ss=String(t%60).padStart(2,'0');
  drawPixelText(mm+':'+ss,VIEW_W-6,5,1,game.time<=L.par?'#f0f4ff':'#f87858','right');
  // 死亡数
  if(game.deaths>0)drawPixelText('X '+game.deaths,VIEW_W-46,5,1,'#f87858','right');
  // v4 §界面⑤：已解神龛 x/6 小图标（金币下方第二行；本关有神龛才显示，L7 无神龛不显示）
  // v5 §E：total 取 Object.keys(PUZZLES).length（键 1..6+8..10 自动）；图标底加 1px 金描边
  if(L.shrines&&L.shrines.length&&typeof PUZZLES!=='undefined'){
    const total=Object.keys(PUZZLES).length||6;
    for(let i=0;i<total;i++){
      const done=isPuzzleSolved(i+1),x=100+i*6,y=21;
      ctx.strokeStyle='#f0c860';ctx.globalAlpha=0.7;ctx.lineWidth=1;
      ctx.strokeRect(x-0.5,y-0.5,5,5);ctx.globalAlpha=1;
      ctx.fillStyle=done?'#f8d048':'#3a3a4a';ctx.fillRect(x,y+1,4,3); // 迷你石碑
      ctx.fillStyle=done?'#fff0b0':'#4a4a5e';ctx.fillRect(x+1,y,2,1);
      if(done&&game.tick%30<15){ctx.fillStyle='#fff8c8';ctx.fillRect(x+1,y+2,2,1);} // 已解微闪
    }
  }
  // v2 P1：连击弹字（n≥2 显示；2s 断档清零由引擎负责，弹跳动画由 comboPop 驱动）
  if(game.combo>=2){
    const pop=clamp(comboPop/0.3,0,1);
    const dy=pop>0?-Math.round(pop*3):0;
    const col=(game.tick%10<5)?'#f8d048':'#ffffff';
    drawPixelText('COMBO X'+game.combo,VIEW_W-6,24+dy,2,col,'right');
  }
  // v3 §C①：心形 HP（顶栏下方；HP 系统随 engine v3 全局生效，缺字段/缺素材时整块跳过）
  // v5 §A-1：心形 HP 行外套 _panel 切角小面板（cut=2）
  // v6 §C3：面板加宽 61→104、循环上限 5→p.maxHp||5（引擎 v6 p.maxHp∈[5,9]，缺省 5=现行为 H4）；
  // 空槽照画 heartEmpty 至 maxHp
  const p=game.player;
  if(p&&typeof p.hp==='number'&&SPR.heartFull&&SPR.heartEmpty){
    const maxHp=p.maxHp||5;
    _panel(1,16,104,14,{cut:2});
    for(let i=0;i<maxHp;i++){
      if(p.invT>0&&game.tick%6<3)continue;               // 无敌闪烁：整排隔帧隐藏
      ctx.drawImage(i<p.hp?SPR.heartFull:SPR.heartEmpty,4+i*11,19);
    }
    if(p.hp<=2&&game.tick%30<15){ctx.strokeStyle='#f84848';ctx.strokeRect(2.5,17.5,101,11);} // 低血红框脉冲（随新面板宽）
  }
  // v3 §C②：Boss 血条（仅 boss 存在且非 dormant 显示）；v5 §A-4：名牌/条底改深蓝+金细线
  // v7 §9.3：名字/P2 刻度线按 b.kind 参数化（旧引擎无 kind → 0=星核巨兽，零回归）
  const b=game.boss;
  if(b&&b.state!=='dormant'){
    const bk=b.kind||0;
    ctx.globalAlpha=b.state==='dying'?clamp(1-b.t/2.2,0,1):1; // dying：随 2.2s 渐隐
    ctx.fillStyle='rgba(14,26,58,.82)';ctx.fillRect(82,17,52,11);          // 名牌深蓝底
    ctx.strokeStyle='#f0c860';ctx.lineWidth=1;ctx.strokeRect(82.5,17.5,51,10);
    drawCNText(BOSS_NAME[bk],84,18,8,'#f8d048');
    ctx.fillStyle='rgba(14,26,58,.82)';ctx.fillRect(128,19,174,9);          // 条底深蓝
    ctx.strokeStyle='#f0c860';ctx.strokeRect(128.5,19.5,173,8);
    const mx=b.maxHp||60,bw=clamp(172*b.hp/mx,0,172);
    ctx.fillStyle=b.phase===2?'#f84848':'#f8d048';                          // P2 变红
    ctx.fillRect(128,19,px(bw),9);
    ctx.fillStyle='#f0f4ff';ctx.fillRect(128+Math.round(172*(1-(BOSS_P2FRAC[bk]||0.5))),19,1,9); // P2 刻度线（50%/40%/40% 按 kind）
    if(b.flashT>0.09){ctx.fillStyle='#ffffff';ctx.fillRect(128,19,174,9);}  // 受击 2 帧整条白
    ctx.globalAlpha=1;
  }
  // v6 §F.2：神龛指引 HUD 左下 (4,VIEW_H-18)——迷你石碑+方向箭头+距离（1 瓦=1M）。
  // 仅当本关有未解神龛且 puzzleNear<0（走近后让位给头顶提示）；可悬停（§A.2 shrinehud）
  {
    const shr=L.shrines,pp=game.player;
    const uns=shr&&shr.length?shr.find(s=>!isPuzzleSolved(s.idx)):null;
    if(uns&&pp&&puzzleNearIdx()<0){
      _panel(4,VIEW_H-18,64,14,{alpha:0.6,cut:2});
      ctx.fillStyle='#2c3440';ctx.fillRect(8,VIEW_H-16,8,10);            // 迷你石碑 8×10（深青底）
      ctx.strokeStyle='#f0c860';ctx.lineWidth=1;ctx.strokeRect(8.5,VIEW_H-15.5,7,9); // 金描边
      drawPixelText('?',10,VIEW_H-14,1,'#c8b478');
      drawPixelText(_sign(uns.x-pp.x)<0?'<':'>',24,VIEW_H-15,2,'#f8d048');           // 方向箭头
      drawPixelText(''+Math.round(Math.abs(uns.x-pp.x)/16)+'M',42,VIEW_H-13,1,'#f0f4ff'); // 距离
    }
  }
  // v3 §C③：技能栏 3 槽（L1-L6 常显；CD 秒来自 game.skills，缺省视为就绪）
  // v5 §A-1：技能槽外套 _panel 切角小面板（cut=2），扇形 CD 与呼吸光不变（第一波 H4）
  // v6 §C1：3→4 槽（U/I/O/L）；SPR.skL 缺失槽内只画字母（守卫）；sk.l 缺省视为就绪
  const sk=game.skills||{u:0,i:0,o:0,l:0};
  const skDef=[['U',SPR.skU,8,sk.u],['I',SPR.skI,12,sk.i],['O',SPR.skO,20,sk.o],['L',SPR.skL,6,sk.l]];
  const slotX=[];
  for(let i=0;i<4;i++){
    const x=162+i*22,y=198;slotX.push(x);
    _panel(x,y,16,16,{cut:2});
    const letter=skDef[i][0],icon=skDef[i][1],max=skDef[i][2],cd=skDef[i][3]||0;
    if(icon)ctx.drawImage(icon,x+2,y+2);
    drawPixelText(letter,x+11,y+9,1,'#f0f4ff');
    if(cd>0){const frac=clamp(cd/max,0,1);                 // v5 §F：扇形扫描 CD 罩（饼形顺时针回收）
      ctx.fillStyle='rgba(6,10,24,0.66)';ctx.beginPath();ctx.moveTo(x+8,y+8);
      ctx.arc(x+8,y+8,11,-Math.PI/2,-Math.PI/2+Math.PI*2*(1-frac));ctx.closePath();ctx.fill();
      drawPixelText(''+Math.ceil(cd),x+8,y+6,1,'#a8b4d8','center');}
    else{ctx.globalAlpha=0.35+0.3*Math.sin(game.tick*0.15); // 就绪呼吸光（金描边）
      ctx.strokeStyle='#f8d048';ctx.strokeRect(x+0.5,y+0.5,15,15);ctx.globalAlpha=1;}
    if(i===2)for(let k=0;k<10;k++){ // v7.1：O 能量条 10 格×10%（ultCharge 满 100 格亮满）
      ctx.fillStyle=(game.ultCharge||0)>=100||k<Math.floor((game.ultCharge||0)/10)?'#f8d048':'#3a3a4a';
      ctx.fillRect(x+k*1.5,y+13,2,2);
    }
  }
  // v7.1：O 槽金色呼吸——ultCharge≥100 且就绪（原 combo≥8 条件废除）
  if((game.ultCharge||0)>=100&&sk.o<=0){
    const bx=162+2*22,by=198,a=clamp(0.4+0.4*Math.sin(game.tick*0.2),0,1);
    ctx.globalAlpha=a;ctx.strokeStyle='#f8d048';ctx.lineWidth=1;
    ctx.strokeRect(bx-0.5,by-0.5,17,17);
    ctx.strokeStyle='#fff8c8';ctx.strokeRect(bx+0.5,by+0.5,15,15);
    ctx.globalAlpha=1;
  }
  // v6 波2 §C/§G：HUD 背包钮 (250,198,16,16)（icoBag 缺失程序化包袱剪影；背包打开时面板覆盖，不画）
  if(!bagOpen){
    _panel(250,198,16,16,{cut:2});
    if(SPR.icoBag)ctx.drawImage(SPR.icoBag,252,200);
    else{
      ctx.fillStyle='#a8845c';ctx.fillRect(253,202,10,8);
      ctx.fillStyle='#8a6a48';ctx.fillRect(254,200,8,3);
      ctx.fillStyle='#f8d048';ctx.fillRect(257,203,2,2);
    }
  }
  // ---------- v6 §A.2/§B/§D2/§E：悬停描边 + 提示卡 + 引导横幅（renderHUD 末尾最顶层；同帧只显示 hover 一张） ----------
  if(hover){
    const HR={hearts:[1,16,104,14],bossbar:[82,17,200,11],coins:[100,2,40,12],shrinehud:[4,VIEW_H-18,64,14]};
    if(hover.indexOf('skill:')===0){ // 悬停高亮：#fff8c8 1px 描边（与选关卡选中框同视觉语言）
      const i=+hover.slice(6);
      ctx.strokeStyle='#fff8c8';ctx.lineWidth=1;ctx.strokeRect(162+i*22-0.5,197.5,17,17);
      drawSkillCard(i,slotX[i]);
    }else if(hover.indexOf('geardrop:')===0){ // v6 波2 §E：装备掉落命名卡（物理拾取，无操作）
      const d=(game.gearDrops||[])[+hover.slice(9)];
      if(d){
        ctx.strokeStyle='#fff8c8';ctx.lineWidth=1;
        ctx.strokeRect(d.x-game.cam.x-3.5,d.y-game.cam.y-3.5,d.w+7,d.h+7);
        drawGearCard(d);
      }
    }else if(hover==='hudbag'){ // v6 波2 §G：背包钮悬停卡「背包 · B」
      ctx.strokeStyle='#fff8c8';ctx.lineWidth=1;ctx.strokeRect(250.5,198.5,15,15);
      drawTipCard([250,198,16,16],'背包 · B');
    }else if(HR[hover]){
      const r=HR[hover];
      ctx.strokeStyle='#fff8c8';ctx.lineWidth=1;ctx.strokeRect(r[0]+0.5,r[1]+0.5,r[2]-1,r[3]-1);
      if(hover==='hearts'&&game.player)
        drawTipCard(r,'生命 '+game.player.hp+' / '+(game.player.maxHp||5)+'　吃心回复');
      else if(hover==='bossbar'&&game.boss)
        drawTipCard(r,BOSS_NAME[game.boss.kind||0]+' · 阶段'+(game.boss.phase||1)+'　'+BOSS_P2TIP[game.boss.kind||0]); // v7 §9.3 同参数化
      else if(hover==='coins')
        drawTipCard(r,'金币 '+game.coins+' / 总'+game.level.totalCoin+'　全收得星');
      else if(hover==='shrinehud'){
        const shr=game.level.shrines,pp=game.player;
        const uns=shr&&shr.length?shr.find(s=>!isPuzzleSolved(s.idx)):null;
        if(uns&&pp)drawTipCard(r,'谜题神龛指引 · 当前距离 '+Math.round(Math.abs(uns.x-pp.x)/16)+'M');
      }
    }
  }
  if(oHintT>0&&uiState==='play'){ // v6 §D2：O 大提示横幅（每关一次；尾 0.5s 渐隐）
    ctx.globalAlpha=clamp(oHintT/0.5,0,1);
    _panel(VIEW_W/2-120,VIEW_H-64,240,18,{cut:3});
    drawCNText('能量已满！按 O 释放流星连斩',VIEW_W/2,VIEW_H-61,12,'#f8d048','center');
    ctx.globalAlpha=1;
  }
  if(skillHintT>0&&uiState==='play'&&game.levelIdx===0){ // v6 §E1：L1 技能提示条（hint 条下方；尾 1s 渐隐）
    ctx.globalAlpha=Math.min(1,skillHintT);
    _panel(VIEW_W/2-110,VIEW_H-30,220,12,{alpha:0.55,cut:2});
    drawCNText('J 攻击 · K 冲刺 · 空格 跳×2',VIEW_W/2,VIEW_H-29,10,'#f0f4ff','center');
    ctx.globalAlpha=1;
  }
  if(fallToastT>0&&uiState==='play'){ // v6 §E2：速降一次性 toast（位置=hint 条同排）
    ctx.globalAlpha=clamp(fallToastT/0.5,0,1);
    _panel(VIEW_W/2-120,VIEW_H-46,240,18,{cut:3});
    drawCNText('按住 ↓ 速降',VIEW_W/2,VIEW_H-43,12,'#f8d048','center');
    ctx.globalAlpha=1;
  }
}

// v6 §B：技能提示卡（文案=设计书 §4.3 表逐字冻结；容器 _panel(clamp(slotX-67,4,VIEW_W-154),146,150,46,{cut:3})，
// 槽上方 52px；四行：名 10px 金 / 键与 CD 像素字 / 说明 9px 白 / 充能条件 9px（未满足红/满足绿））
function drawSkillCard(i,slotX){
  const SKILLS=[ // [名, 键, 一句话说明, 充能条件(null=无，冷却即用)]
    ['星陨术','U','召唤三颗流星轰击锁定的敌人',null],
    ['星光护盾','I','3 秒内吸收 2 次伤害',null],
    ['流星连斩','O','时停十字斩：屏内敌人全灭并清弹幕','命中积累能量，满 100 释放'],
    ['星刃回旋','L','掷出回旋星刃，去回两程割草',null]];
  const info=SKILLS[i],sk2=game.skills||{u:0,i:0,o:0,l:0},cd=[sk2.u,sk2.i,sk2.o,sk2.l][i]||0;
  const condOk=info[3]?(game.ultCharge||0)>=100:true;
  const cx=clamp(slotX-67,4,VIEW_W-154);
  _panel(cx,146,150,46,{cut:3});
  drawCNText(info[0],cx+6,150,10,'#f8d048');
  drawPixelText('KEY '+info[1]+'  '+(cd>0?('CD '+Math.ceil(cd)+'S'):'READY'),cx+6,161,1,'#a8b4d8');
  drawCNText(info[2],cx+6,170,9,'#f0f4ff');
  drawCNText(info[3]||'无（冷却即用）',cx+6,181,9,condOk?'#8ad8a0':'#f87858');
}
// v6 §A.2：简单提示卡（hearts/bossbar/coins/shrinehud；锚定 rect 上方，顶栏处翻下方防出屏）
function drawTipCard(r,text){
  const w=Math.ceil(_textW(text,9))+14,h=19;
  const x=clamp(Math.round(r[0]+r[2]/2-w/2),2,VIEW_W-2-w);
  const y=r[1]-h-5<30?r[1]+r[3]+5:r[1]-h-5;
  _panel(x,y,w,h,{cut:2,alpha:0.88});
  drawCNText(text,x+7,y+5,9,'#f0f4ff');
}

// v6 波2 §E：装备掉落悬停卡「秘银长剑　触碰拾取」（名称=§6.1 命名表稀有度色；锚定=drawTipCard 同款）
function drawGearCard(d){
  const name=EQ_PREFIX[d.r]+EQ_BASE[d.slot];
  const w=Math.ceil(_textW(name,9))+Math.ceil(_textW('　触碰拾取',9))+14,h=19;
  const r=[d.x-game.cam.x-4,d.y-game.cam.y-4,d.w+8,d.h+8];
  const x=clamp(Math.round(r[0]+r[2]/2-w/2),2,VIEW_W-2-w);
  const y=r[1]-h-5<30?r[1]+r[3]+5:r[1]-h-5;
  _panel(x,y,w,h,{cut:2,alpha:0.88});
  drawCNText(name,x+7,y+5,9,EQ_COLOR[d.r]||EQ_COLOR[0]);
  drawCNText('　触碰拾取',x+7+_textW(name,9),y+5,9,'#f0f4ff');
}

// ---------- v6 波2 §C 背包界面（布局/坐标=设计书 §7.2 图逐字；384×224 _panel 切角面板语言） ----------
// 主面板 _panel(24,8,336,208)：左角色区（预览×3 + 属性行 y=90 行距 12）/ 中装备槽 3 (120/148/176,24,24×24)
// / 背包 4×3 (120+col*24, 64+row*24, 22×22) / 右碎片栏 (224..352, 24..134) / 按钮 (300,150/166/182,36×14)
// / 关闭钮 (344,10,10×10) / 操作行 y=188/198。选中框白描边 2px（同谜题光标）；装备中右下小金点；
// MAX（r=4）金色。焦点三区 equip(3)→bag(12)→shard，Tab 循环。
function _bagBtn(x,y,label,on,hid){ // 内部：36×14 切角小按钮（不可用置灰；hover 白描边仅可用时）
  _panel(x,y,36,14,{cut:2,alpha:on?0.9:0.45});
  drawCNText(label,x+18,y+2,9,on?'#f0f4ff':'#5a6488','center');
  if(hover===hid&&on){ctx.strokeStyle='#fff8c8';ctx.lineWidth=1;ctx.strokeRect(x+0.5,y+0.5,35,13);}
}
function renderBag(tick){
  const p=game.player,eq=game.equip||{atk:0,hp:0,spd:0,cd:0};
  ctx.fillStyle='rgba(4,4,14,0.6)';ctx.fillRect(0,0,VIEW_W,VIEW_H); // §7.1：背景压暗 0.6
  _panel(24,8,336,208);
  // 左·角色区：外观预览 heroLook(heroIdle1) ×3（48×48）@ (44,24)（SPR.look 未合入=现主角帧直通）
  const pv=heroLook(SPR.heroIdle1,'idle');
  if(pv)ctx.drawImage(pv,44,24,48,48);
  // 属性行（读 game.equip；攻击=基攻+装备加成，加成绿字；§7.2/工单 §C）
  const atkBase=(typeof BAL!=='undefined'&&BAL&&BAL.player&&BAL.player.atkBase)||1;
  const atkStr='攻击 '+(atkBase+eq.atk);
  drawCNText(atkStr,34,90,9,'#f0f4ff');
  if(eq.atk>0)drawCNText('（+'+eq.atk+'）',34+_textW(atkStr,9),90,9,'#8ad8a0');
  drawCNText('生命 '+(p?p.hp:'-')+' / '+(p?p.maxHp:BAL_PLAYER_HP),34,102,9,'#f0f4ff');
  drawCNText('移速 +'+Math.round(eq.spd*100)+'%',34,114,9,'#f0f4ff');
  drawCNText('技能冷却 −'+Math.round(eq.cd*100)+'%',34,126,9,'#f0f4ff');
  // 中·装备槽 3 个（稀有度色描边；空槽=暗色+槽名 武/冠/氅；装备中=右下小金点；r=4 金描边脉冲）
  for(let i=0;i<3;i++){
    const k='whc'[i],x=120+i*28,y=24;
    const it=typeof _equippedId(k)==='number'&&_equippedId(k)>=0
      ?progress.inv.find(it2=>it2.id===_equippedId(k)):null;
    _panel(x,y,24,24,{cut:2,alpha:it?0.9:0.55});
    if(it){
      const col=EQ_COLOR[it.r]||EQ_COLOR[0];
      ctx.strokeStyle=col;ctx.lineWidth=1;ctx.strokeRect(x+0.5,y+0.5,23,23);
      const ico={w:SPR.icoW,h:SPR.icoH,c:SPR.icoC}[k];
      if(ico)ctx.drawImage(tintOf(ico,col),x+6,y+6);
      else _gearSil(k,x+7,y+6,col);
      if(it.r>=4){ctx.globalAlpha=0.5+0.5*Math.sin(tick*0.2);
        ctx.strokeStyle='#f8d048';ctx.strokeRect(x-0.5,y-0.5,25,25);ctx.globalAlpha=1;}
      ctx.fillStyle='#f8d048';ctx.fillRect(x+20,y+20,2,2);          // 装备中标记（§7.2 右下小金点）
      if(bagFocus==='equip'&&bagSelEquip===i){ // 选中框：白描边 2px
        ctx.strokeStyle='#ffffff';ctx.lineWidth=2;ctx.strokeRect(x+1,y+1,22,22);
      }else if(hover==='slot:'+k){ctx.strokeStyle='#fff8c8';ctx.lineWidth=1;ctx.strokeRect(x+0.5,y+0.5,23,23);}
    }else{
      drawCNText(['武','冠','氅'][i],x+12,y+8,9,'#5a6488','center');  // 空槽=暗色+槽名
      if(bagFocus==='equip'&&bagSelEquip===i){
        ctx.strokeStyle='#ffffff';ctx.lineWidth=2;ctx.strokeRect(x+1,y+1,22,22);
      }else if(hover==='slot:'+k){ctx.strokeStyle='#fff8c8';ctx.lineWidth=1;ctx.strokeRect(x+0.5,y+0.5,23,23);}
    }
  }
  // 中·背包 4×3=12 格（稀有度弱描边+叠色图标；装备中金点；r=4 金框；选中白 2px / 悬停白 1px）
  for(let i=0;i<12;i++){
    const col=i%4,row=(i/4)|0,x=120+col*24,y=64+row*24,it=progress.inv[i];
    ctx.fillStyle='rgba(8,12,28,0.85)';ctx.fillRect(x,y,22,22);
    ctx.strokeStyle='#3a3a58';ctx.lineWidth=1;ctx.strokeRect(x+0.5,y+0.5,21,21);
    if(it){
      const ic=EQ_COLOR[it.r]||EQ_COLOR[0];
      ctx.strokeStyle=ic;ctx.globalAlpha=0.55;ctx.strokeRect(x+0.5,y+0.5,21,21);ctx.globalAlpha=1;
      const ico={w:SPR.icoW,h:SPR.icoH,c:SPR.icoC}[it.slot];
      if(ico)ctx.drawImage(tintOf(ico,ic),x+5,y+5);
      else _gearSil(it.slot,x+6,y+5,ic);
      if(it.r>=4){ctx.strokeStyle='#f8d048';ctx.strokeRect(x-0.5,y-0.5,23,23);} // MAX 金框（§7.2 金色名字）
      if(isEquippedItem(it)){ctx.fillStyle='#f8d048';ctx.fillRect(x+18,y+18,2,2);} // 装备中金点
    }
    if(bagFocus==='bag'&&bagSelBag===i){
      ctx.strokeStyle='#ffffff';ctx.lineWidth=2;ctx.strokeRect(x+1,y+1,20,20);
    }else if(hover==='bag:'+i){ctx.strokeStyle='#fff8c8';ctx.lineWidth=1;ctx.strokeRect(x+0.5,y+0.5,21,21);}
  }
  // 选中物品名（稀有度色；r=4 金色 MAX——§7.2「MAX 金色名字」；equip 区选中=穿着件名）
  {
    const it=bagFocus==='equip'?_equipZoneItem():_bagItem(bagSelBag);
    if(it)drawCNText(EQ_PREFIX[it.r]+EQ_BASE[it.slot]+(it.r>=4?' MAX':''),120,142,9,
      it.r>=4?'#f8d048':(EQ_COLOR[it.r]||EQ_COLOR[0]));
  }
  // 右·碎片栏：shards 键升序「秘银武器碎片 ×3」行（≤10 行可视）；碎片≥3 且持有同槽同稀有度可升件
  // → ×N 绿色+绿下划线高亮（§7.2「对应可升阶物品高亮」）
  drawCNText('碎片',224,13,9,'#f0f4ff');
  {
    const keys=Object.keys(progress.shards||{}).sort().slice(0,10);
    for(let i=0;i<keys.length;i++){
      const k=keys[i],slot=k[0],r=+k.slice(1),n=progress.shards[k]||0,y=27+i*11;
      const usable=n>=BAL_GEAR_STEP&&r<4&&
        progress.inv.some(it2=>it2.slot===slot&&it2.r===r);
      if(bagFocus==='shard'&&bagSelShard===i){
        ctx.strokeStyle='#ffffff';ctx.lineWidth=1;ctx.strokeRect(222.5,y-1.5,128,11);}
      drawCNText(EQ_PREFIX[r]+(EQ_SLOT_WORD[slot]||slot)+'碎片',224,y,9,EQ_COLOR[r]||EQ_COLOR[0]);
      drawPixelText('x'+n,346,y+2,1,usable?'#8ad8a0':'#a8b4d8','right');
      if(usable){ctx.fillStyle='#8ad8a0';ctx.fillRect(224,y+9,120,1);}
    }
  }
  // 底·按钮行（§7.3 坐标；不可用置灰）：装备=bag 区选中 / 分解·升阶=焦点区选中（与 X/C 键同函数）
  {
    const selIt=bagFocus==='equip'?_equipZoneItem():_bagItem(bagSelBag);
    const bagIt=_bagItem(bagSelBag);
    const canEquip=!!bagIt&&_equippedId(bagIt.slot)!==bagIt.id;
    const canSalv=!!selIt&&!isEquippedItem(selIt);
    const canUp=!!selIt&&selIt.r<4&&(progress.shards[selIt.slot+selIt.r]||0)>=BAL_GEAR_STEP;
    _bagBtn(300,150,'装备',canEquip,'btn:equip');
    _bagBtn(300,166,'分解',canSalv,'btn:salvage');
    _bagBtn(300,182,'升阶',canUp,'btn:upgrade');
  }
  // 关闭钮 (344,10,10×10)
  _panel(344,10,10,10,{cut:2,alpha:0.9});
  drawPixelText('X',347,13,1,'#f0f4ff');
  if(hover==='btn:close'){ctx.strokeStyle='#fff8c8';ctx.lineWidth=1;ctx.strokeRect(344.5,10.5,9,9);}
  // 底·操作行 y=188/198（内容冻结；行 1 全文 9px 实测 ≈383px>面板内宽 316 → 缩 7px，交付说明记录）
  drawCNText('Tab 切区 · 方向 移动 · Enter 装备/选中 · X 分解+2碎片 · C 升阶(3碎片) · B/Esc 关闭',
    VIEW_W/2,190,7,'#a8b4d8','center');
  drawCNText('鼠标：单击选中 · 双击装备 · 点装备槽卸下 · 点按钮执行',VIEW_W/2,199,9,'#a8b4d8','center');
}

// v6 波2 §B：背包浮字渲染（屏幕中层居中堆叠；≤4 条 2s 消隐尾 0.5s 渐隐——本地渲染不经 engine 池，H4）
function renderBagFloats(){
  if(uiState!=='play'||!_bagFloats.length)return;
  for(let i=0;i<_bagFloats.length;i++){const f=_bagFloats[i];
    ctx.globalAlpha=f.t>1.5?clamp((2-f.t)/0.5,0,1):1;
    drawCNText(f.text,VIEW_W/2,84+i*13,f.big?10:9,f.color,'center');
  }
  ctx.globalAlpha=1;
}

// v3 §D1：登场横幅——intro 态上下黑边各 24px（前 8 帧滑入、最后 12 帧滑出，按 b.t 插值）
function renderIntro(){
  const b=game.boss;
  if(!b||b.state!=='intro')return;
  const IN=8/60,OUT=12/60,DUR=1.8; // intro 时长 108 帧=1.8s（设计 §2）
  const h=24*Math.min(clamp(b.t/IN,0,1),clamp((DUR-b.t)/OUT,0,1));
  ctx.fillStyle='rgba(0,0,0,.8)';
  ctx.fillRect(0,0,VIEW_W,px(h));ctx.fillRect(0,VIEW_H-px(h),VIEW_W,px(h));
  let bx=VIEW_W/2;
  if(b.t<0.3)bx+=Math.random()*4-2; // 名字打入抖动
  drawCNText(BOSS_NAME[b.kind||0],bx,86,26,'#f8d048','center'); // v7 §9.3：登场横幅随 Boss kind 参数化
  if((b.kind||0)<=1)drawPixelText('STARCORE BEHEMOTH',VIEW_W/2,120,1,'#f0f0f8','center'); // 英文副标=星核专属（新 Boss 无译名，不杜撰）
}

// v3 §D2：流星连斩全屏演出——白屏渐隐 + 两条对角斩线随 flashT 衰减退场
function renderFlash(){
  const ft=game.flashT;
  if(!(ft>0))return;
  const k=clamp(ft/0.15,0,1);
  ctx.fillStyle='rgba(255,255,240,'+k+')';ctx.fillRect(0,0,VIEW_W,VIEW_H);
  ctx.save();
  ctx.globalAlpha=k;
  ctx.lineWidth=1+3*k; // lineWidth 4→1
  ctx.strokeStyle='#ffffff';ctx.beginPath();ctx.moveTo(0,54);ctx.lineTo(VIEW_W,170);ctx.stroke();
  ctx.strokeStyle='#f8d048';ctx.beginPath();ctx.moveTo(0,170);ctx.lineTo(VIEW_W,54);ctx.stroke();
  ctx.restore();
}

function renderPause(){
  ctx.fillStyle='rgba(8,8,16,0.7)';ctx.fillRect(0,0,VIEW_W,VIEW_H);
  _panel(72,60,240,104,{titleBar:1}); // v5 §A-2：暂停层换肤（整块切角面板+标题带；布局文案不变）
  drawCNText('暂停',VIEW_W/2,88,18,'#f0f4ff','center');
  drawPixelText('P: CONTINUE',VIEW_W/2,118,1,'#a8b4d8','center');
  drawPixelText('R: RESTART  ESC: MENU',VIEW_W/2,130,1,'#a8b4d8','center');
}

function renderClear(tick){
  clearShown+=1/60;
  const a=clamp(clearShown*2,0,0.88);
  ctx.save();ctx.globalAlpha=a;
  _panel(48,32,288,140); // v5 §A-3：通关结算换肤（切角面板；布局文案不变）
  ctx.restore();
  if(clearShown>0.3){
    drawCNText('关卡完成！',VIEW_W/2,42,18,'#f8d048','center');
    const L=game.level;
    drawCNText('用时 '+Math.floor(game.time)+' 秒　金币 '+game.coins+'/'+L.totalCoin+'　阵亡 '+game.deaths,
      VIEW_W/2,72,11,'#f0f4ff','center');
    // 三颗星
    for(let i=0;i<3;i++){
      const on=clearStars>i;
      const x=VIEW_W/2-34+i*34;
      drawCNText(on?'★':'☆',x,92,22,on?'#f8d048':'#5a5a72','center');
    }
    if(clearShown>1){
      const blink=tick%50<32;
      if(blink)drawCNText(game.levelIdx<ALL_LEVELS.length-1?'回车 · 下一关　Esc · 选关':'回车 · 通关结算',
        VIEW_W/2,138,11,'#ffffff','center');
    }
  }
}

// ---------- v5 封面队 §B：标题封面素材与确定性数据（SPR.cover 缺失时全程序化兜底，H3） ----------
function _mul32(seed){ // mulberry32（确定性星表/云团用；与 art.js 内部实现同算法，避免跨模块依赖）
  let a=seed>>>0;
  return function(){a|=0;a=a+0x6D2B79F5|0;
    let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;
    return((t^t>>>14)>>>0)/4294967296;};
}
const TITLE_STARS=(()=>{ // §6.2：40 颗星（mulberry32(2025) 一次生成；1~2px 白/金/青，dx 2~6px/s）
  const r=_mul32(2025),out=[];
  for(let i=0;i<40;i++)out.push({x:(r()*384)|0,y:(r()*128)|0,s:r()<0.7?1:2,
    c:['#ffffff','#f8d048','#8ae8f8'][(r()*3)|0],w:2+r()*4,ph:r()*6.283});
  return out;})();
const CLOUD_PUFFS=(()=>{ // 程序化云团兜底数据：3 层 × 14 团（SPR.cover.cloudA/B/C 未合入时用）
  const r=_mul32(2077),out=[];
  for(let l=0;l<3;l++){const arr=[];
    for(let i=0;i<14;i++)arr.push({x:(r()*512)|0,w:26+((r()*40)|0),h:5+((r()*9)|0)});
    out.push(arr);}
  return out;})();
const CLOUD_COLS=[['#e8f2ff','#c7dcec'],['#cfe0f4','#a8c0dc'],['#5a6a94','#3c4a72']]; // 兜底云色（亮/影）
const LOGO_CHARS=['像','素','勇','者'];
const LOGO_FALL=9;            // 单字下落帧数（延迟 i*7 帧后自 y-40 弹入）
let _logoLand=[false,false,false,false]; // 落地帧一次性 fx/震屏标记
let _titleEnterT=-1,_prevMenuUi='';      // 进标题基准 tick（重进标题重播逐字弹入）
const METEOR_T=[300,640,920]; // §6.2：流星触发 tick 帧（确定性窗口 [t0,t0+42]）

function renderTitleCover(tick){
  if(_prevMenuUi!=='title'){_titleEnterT=tick;_logoLand=[false,false,false,false];}
  _prevMenuUi='title';
  const t=tick/60;
  ctx.save();
  if(game.shake>0)ctx.translate((Math.random()*2-1)*game.shake,(Math.random()*2-1)*game.shake); // 落字小震
  // 1 底：夜空渐变（覆盖原主题渐变）
  const g=ctx.createLinearGradient(0,0,0,VIEW_H);
  g.addColorStop(0,'#0e1238');g.addColorStop(1,'#2c3472');
  ctx.fillStyle=g;ctx.fillRect(0,0,VIEW_W,VIEW_H);
  // 2 星空缓移（每帧 x-=w/60，x<0 回卷 384；闪烁 alpha=0.5+0.5|sin(tick*0.05w+ph)|）
  for(const s of TITLE_STARS){
    const x=((s.x-s.w*t)%384+384)%384;
    ctx.globalAlpha=0.5+0.5*Math.abs(Math.sin(tick*0.05*s.w+s.ph));
    ctx.fillStyle=s.c;ctx.fillRect(x|0,s.y,s.s,s.s);
  }
  ctx.globalAlpha=1;
  // 3 三层云海：SPR.cover.cloudA/B/C 各 512×80 平铺滚动（A y=132 速度4 / B y=156 速度10 / C y=184 速度18）
  const cov=SPR.cover||{};
  const cloudY=[132,156,184],cloudSpd=[4,10,18];
  for(let l=0;l<3;l++){
    const img=[cov.cloudA,cov.cloudB,cov.cloudC][l],y=cloudY[l],off=(t*cloudSpd[l])%512;
    if(img){for(let x=-off;x<VIEW_W;x+=512)ctx.drawImage(img,Math.round(x),y);}
    else for(const p of CLOUD_PUFFS[l]){ // 程序化兜底：亮面+底影线的像素云团
      const x=(((p.x-off)%560)+560)%560-80;
      if(x>VIEW_W)continue;
      ctx.fillStyle=CLOUD_COLS[l][0];ctx.fillRect(x|0,y+10-p.h,p.w,p.h);
      ctx.fillStyle=CLOUD_COLS[l][1];ctx.fillRect(x|0,y+8,p.w,2);
    }
  }
  ctx.fillStyle='rgba(248,208,72,0.5)';ctx.fillRect(0,184,VIEW_W,1); // C 层顶部金边受光 1px
  // 4 Boss 巨影（右上 250,22，sin(tick*0.01) 呼吸 ±1px）
  const bdy=22+Math.round(Math.sin(tick*0.01));
  if(cov.bossSil)ctx.drawImage(cov.bossSil,250,bdy);
  else{ // 程序化兜底：暗紫巨影轮廓+双眼星辉青+核心金点
    ctx.fillStyle='#141028';
    ctx.fillRect(250,bdy+12,104,44);ctx.fillRect(262,bdy+2,80,14);ctx.fillRect(242,bdy+22,14,30);
    ctx.fillStyle='#38e8f8';ctx.fillRect(288,bdy+24,2,2);ctx.fillRect(318,bdy+24,2,2);
    ctx.fillStyle='#f8d048';ctx.fillRect(303,bdy+36,1,1);
  }
  // 6 流星：确定性触发窗 [t0,t0+42]（0.7s），自 (x0,10) 向 (+200,+80)px/s
  for(const t0 of METEOR_T){
    if(tick<t0||tick>=t0+42)continue;
    const el=tick-t0,mx=(t0*37)%180+el*200/60,my=10+el*80/60;
    if(cov.meteorStreak)ctx.drawImage(cov.meteorStreak[((tick/4)|0)%2],Math.round(mx),Math.round(my));
    else{ // 程序化兜底：白亮头部+金尾渐细
      ctx.fillStyle='#fff8c8';ctx.fillRect(Math.round(mx),Math.round(my),3,3);
      for(let k=1;k<=3;k++){ctx.globalAlpha=0.7-k*0.18;ctx.fillStyle='#f8d048';
        ctx.fillRect(Math.round(mx-k*5),Math.round(my-k*2),Math.max(1,3-k),1);}
      ctx.globalAlpha=1;
    }
    if(game.fxParts&&game.fxParts.length<60&&tick%2===0) // 尾迹金 fx（title 态 simUiFx 推进）
      game.fxParts.push({x:mx-3,y:my+1,vx:-30,vy:-10,life:0.25,color:'#f8d048',size:1});
  }
  // 5 主角剪影（左下 96,118 剑指右上，sin(tick*0.03+1) 悬浮 ±2px）
  const hdy=118+Math.round(Math.sin(tick*0.03+1)*2);
  if(cov.heroSil)ctx.drawImage(cov.heroSil,96,hdy);
  else{ // 程序化兜底：黑剪影+背光金边
    ctx.fillStyle='#0a0e22';
    ctx.fillRect(104,hdy+2,8,8);ctx.fillRect(102,hdy+10,12,10);
    ctx.fillRect(102,hdy+20,5,8);ctx.fillRect(109,hdy+20,5,8);
    ctx.fillRect(112,hdy-6,2,12); // 剑上指
    ctx.fillStyle='#f8d048';ctx.fillRect(101,hdy+1,1,27);ctx.fillRect(101,hdy+1,15,1);
  }
  renderFx(); // 标题态 fxParts 渲染（流星尾迹/落字金屑；屏幕坐标系）
  // 7 动态 logo「像素勇者」逐字弹入：第 i 字延迟 i*7 帧，自 y-40 落到 y=52（二次缓动）；
  //   落地帧 6 粒金 fx+小震 1；落定后整组 sin(tick*0.04)±2px；下落中画 1×6 金色拖尾竖线
  const elT=tick-_titleEnterT,bob=Math.sin(tick*0.04)*2;
  for(let i=0;i<4;i++){
    const cx=VIEW_W/2-60+i*40,el=elT-i*7;
    if(el<0)continue;
    const prog=Math.min(1,el/LOGO_FALL);
    const y=52+(prog<1?-40*(1-prog*prog):bob);
    if(prog<1){
      ctx.globalAlpha=0.8*(1-prog);ctx.fillStyle='#f8d048';
      ctx.fillRect(cx,y-8,1,6);ctx.globalAlpha=1;
    }else if(!_logoLand[i]){
      _logoLand[i]=true;game.shake=Math.max(game.shake,1);
      if(game.fxParts)for(let k=0;k<6&&game.fxParts.length<60;k++)
        game.fxParts.push({x:cx+(Math.random()*18-9),y:70,vx:(Math.random()*2-1)*70,
          vy:-50-Math.random()*60,life:0.3+Math.random()*0.2,color:'#f8d048',size:2,grav:220});
    }
    ctx.fillStyle='#f8d048'; // 带金描边：四向偏移金+白芯
    drawCNText(LOGO_CHARS[i],cx+1,y,34,'#f8d048','center');
    drawCNText(LOGO_CHARS[i],cx-1,y,34,'#f8d048','center');
    drawCNText(LOGO_CHARS[i],cx,y+1,34,'#f8d048','center');
    drawCNText(LOGO_CHARS[i],cx,y-1,34,'#f8d048','center');
    drawCNText(LOGO_CHARS[i],cx,y,34,'#ffffff','center');
  }
  // 8 副标 "PIXEL QUEST" 金属渐变三遍叠画（#6e5a20(+1,+1)→#f8d048→#fff8c8(-1,-1)）
  drawPixelText('PIXEL QUEST',VIEW_W/2+1,97,2,'#6e5a20','center');
  drawPixelText('PIXEL QUEST',VIEW_W/2,96,2,'#f8d048','center');
  drawPixelText('PIXEL QUEST',VIEW_W/2-1,95,2,'#fff8c8','center');
  // 9 开始按钮：切角面板+呼吸光（金描边重描一遍，文字同步微亮）
  _panel(VIEW_W/2-52,146,104,22,{cut:3});
  ctx.globalAlpha=0.35+0.3*Math.sin(tick*0.08);
  ctx.strokeStyle='#f8d048';ctx.lineWidth=1;_panelPath(VIEW_W/2-52,146,104,22,3);ctx.stroke();
  ctx.globalAlpha=0.8+0.2*Math.max(0,Math.sin(tick*0.08));
  drawCNText('按 回车 开始',VIEW_W/2,151,12,'#ffffff','center');
  ctx.globalAlpha=1;
  if(hover==='titleStart'){ctx.strokeStyle='#fff8c8';ctx.lineWidth=1; // v6 §A.2：悬停高亮
    _panelPath(VIEW_W/2-52,146,104,22,3);ctx.stroke();}
  // 10 底部操作条：切角面板内现有按键提示行
  _panel(32,198,320,18,{alpha:0.5,cut:2});
  drawPixelText('ARROWS/WASD MOVE  SPACE JUMP  M SOUND',VIEW_W/2,204,1,'#f0f4ff','center');
  ctx.restore();
}

// ---------- v7 §9.2：章节化选关屏（384×224；章头 12px + 卡行 46×44 pitch 53） ----------
// 章首表 [章首 0 基 idx, 章长]；CH_NAME/CH_HEAD_Y/CH_CARD_Y 下标=章号（y=章头 24/86/148、卡行 34/96/158）。
// 截断规则（工单任务2 过渡期兼容）：ALL_LEVELS.length≤10（章节文件未合入）→ 单章画**全部**关卡
// （"10 关时只画第一章"：若只画 7 卡则 L8~L10 不可选，违背"选关屏必须照常可用"，交付说明记录），
// 并按 7 列换行（第二行 y=34+62=96——一章 7 卡后越出 384 画布，wrap 由 _cardXY 消费）；
// ≥11 关按表截断：章显示条件=章首 idx<length，章长=min(声明,余量)——13 关=两章、16 关=三章、
// 15 关=第三章 2 卡；13 关时第三章头=13 但空章不显示。
const CH_HEAD=[[0,7],[7,6],[13,3]];
const CH_NAME=['第一章·星之大陆','第二章·星海巡旅','第三章·幽冥终章'];
const CH_HEAD_Y=[24,86,148],CH_CARD_Y=[34,96,158];
function _chapters(){
  const n=ALL_LEVELS.length,out=[];
  if(n<=10)return[{i:0,first:0,len:n,wrap:7}];
  for(let c=0;c<CH_HEAD.length&&CH_HEAD[c][0]<n;c++)
    out.push({i:c,first:CH_HEAD[c][0],len:Math.min(CH_HEAD[c][1],n-CH_HEAD[c][0]),wrap:0});
  return out;
}
function _cardXY(ch,j){ // 卡左上角：多章=单行 x=6+j*53；单章过渡=7 列换行（行距 62）
  if(ch.wrap){const col=j%ch.wrap,row=(j/ch.wrap)|0;return[6+col*53,CH_CARD_Y[ch.i]+row*62];}
  return[6+j*53,CH_CARD_Y[ch.i]];
}
const _cardName=n=>String(n).replace(/^\d+\s*·\s*/,''); // 卡面关名去序号前缀（序号另画 y+34；'7 · BOSS·星核巨兽'→'BOSS·星核巨兽'）

function renderMenu(th,tick){
  if(uiState==='title'){renderTitleCover(tick);return;} // v5 §B：封面重做（夜空渐变取代主题渐变；瓦片地面行删除，云海接底）
  _prevMenuUi='select'; // 离开标题（进选关）→ 重进标题时逐字弹入 logo 重播
  const grad=ctx.createLinearGradient(0,0,0,VIEW_H);
  grad.addColorStop(0,th.skyT);grad.addColorStop(1,th.skyB);
  ctx.fillStyle=grad;ctx.fillRect(0,0,VIEW_W,VIEW_H);
  if(!themeArt)themeArt=buildThemeArt('grass');
  drawParallax(themeArt.bg,tick*6,0);
  // 地面
  const T=themeArt.tiles;
  for(let x=0;x<VIEW_W;x+=16){ctx.drawImage(T.blockCap,x,VIEW_H-24);ctx.drawImage(T.block,x,VIEW_H-8);}
  // v7 §9.2：章节化选关屏（标题 y=12；章头 y=24/86/148；卡行 y=34/96/158；卡 46×44、x=6+col*53，
  // 7 列末卡右缘 370；卡内 关名 7px y+5 / 星 12px y+22 / 序号 y+34；Boss 卡红描边+金字+BOSS 角标；
  // 新关（L11+）名右上 2×2 金点；章锁定=章头灰 #3a4468+全部卡 ???+章名后挂锁形 6×8）
  drawCNText('选择关卡',VIEW_W/2,12,15,'#f0f4ff','center');
  for(const ch of _chapters()){
    const hy=CH_HEAD_Y[ch.i];
    const chLocked=progress.unlocked<ch.first+1; // 章锁定=章首关未解锁
    drawCNText(CH_NAME[ch.i],6,hy,12,chLocked?'#3a4468':'#f0f4ff');
    if(chLocked){ // 章名后挂锁形 6×8 程序化（锁钩+锁体）
      const lx=6+Math.ceil(_textW(CH_NAME[ch.i],12))+6,ly=hy+1;
      ctx.strokeStyle='#3a4468';ctx.lineWidth=1;
      ctx.beginPath();ctx.arc(lx+3,ly+3,2,Math.PI,0);ctx.stroke();
      ctx.fillStyle='#3a4468';ctx.fillRect(lx,ly+3,6,5);
    }
    for(let j=0;j<ch.len;j++){
      const i=ch.first+j,xy=_cardXY(ch,j),x=xy[0],y=xy[1];
      const locked=chLocked||i+1>progress.unlocked,sel=menuSel===i;
      const boss=!!ALL_LEVELS[i].boss;
      _panel(x,y,46,44,{alpha:locked?0.7:0.85,cut:3});
      if(boss){ctx.strokeStyle='#f86048';ctx.lineWidth=1;ctx.strokeRect(x+0.5,y+0.5,45,43);} // Boss 卡红描边
      if(sel){ctx.strokeStyle='#fff8c8';ctx.lineWidth=2;ctx.strokeRect(x+1,y+1,44,42);
        if(tick%40<24){ctx.fillStyle='#fff';ctx.fillRect(x-6,y+21,4,2);ctx.fillRect(x+48,y+21,4,2);}}
      else if(hover==='select:'+i){ctx.strokeStyle='#fff8c8';ctx.lineWidth=1; // v6 §A.2：悬停高亮
        ctx.strokeRect(x+0.5,y+0.5,45,43);}
      drawCNText(locked?'???':_cardName(ALL_LEVELS[i].name),x+23,y+5,7,
        locked?'#5a6488':(boss?'#f8d048':'#f0f4ff'),'center');              // 关名 7px（Boss 金色）
      const st=progress.stars[i]||0;
      drawCNText(st?'★'.repeat(st)+'☆'.repeat(3-st):'☆☆☆',x+23,y+22,12,
        locked?'#3a4468':'#f8d048','center');
      drawPixelText(''+(i+1),x+23,y+34,1,locked?'#5a6488':'#a8b4d8','center');
      if(boss)drawPixelText('BOSS',x+43,y+35,1,'#f86048','right');          // 卡底 BOSS 角标
      if(i>=10){ctx.fillStyle='#f8d048';ctx.fillRect(x+40,y+3,2,2);}        // 新关金点（L11~L16）
    }
  }
  drawCNText('←→↑↓ 选择　回车 进入　Esc 返回',VIEW_W/2,204,11,'#a8b4d8','center');
  const total=Object.values(progress.stars).reduce((a,b)=>a+b,0);
  drawPixelText('STARS '+total+'/'+(ALL_LEVELS.length*3),VIEW_W/2,214,1,'#f8d048','center'); // v7 §9.1：上限=ALL_LEVELS.length*3
}

function renderVictory(tick){
  ctx.fillStyle='rgba(8,8,20,0.85)';ctx.fillRect(0,0,VIEW_W,VIEW_H);
  drawCNText('～ 通关啦 ～',VIEW_W/2,60,26,'#f8d020','center');
  drawCNText('星核巨兽已倒下！',VIEW_W/2,110,13,'#f0f0f8','center'); // v7 §9.10：遗留文案对齐
  const total=Object.values(progress.stars).reduce((a,b)=>a+b,0);
  drawPixelText('TOTAL STARS '+total+'/'+(ALL_LEVELS.length*3),VIEW_W/2,140,1,'#f8d020','center'); // v7 §9.1
  if(tick%50<32)drawCNText('回车 · 返回标题',VIEW_W/2,170,12,'#ffffff','center');
}

// v3 §E3：致谢屏——深空底 + 彩带粒子雨 + 滚动制作名单；回车（creditsT>1）回标题
// v5 §D：真结局版文案；v7 §9.10：头三行/正文行换 v7 版，制作名单追加章节/数值两队（其余行保留）
const CREDITS_LINES=[                                       // v7 真结局版（§9.10 逐行）
  ['像素勇者',20,'#ffffff'],['PIXEL QUEST',11,'#f8d048'],['v7 · 真结局 · 星海归冥',12,'#f8e8a0'],
  ['十六关全通，蛟龙俯首，判官封卷！',12,'#f0f4ff'],['翡翠风谷的风、星海的浪、',11,'#c8d4ec'],
  ['幽冥的灯，都记得你。',11,'#c8d4ec'],['——',11,'#5a6488'],
  ['企划·数值·美术指导：GLM-5.3 设计师',11,'#c0c8e0'],['引擎·手感：Flash 手感队',11,'#c0c8e0'],
  ['关卡·谜题：Flash 关卡队',11,'#c0c8e0'],['美术·风格：Flash 风格队/特效队',11,'#c0c8e0'],
  ['界面·封面·音效：Flash 演出队/封面队',11,'#c0c8e0'],
  ['章节·新Boss·精英：Flash 框架队/章节二队/章节三队',11,'#c0c8e0'],
  ['数值·回归：Flash 平衡队',11,'#c0c8e0'],['——',11,'#5a6488'],
  ['风格致敬：原神（米哈游）/ 4399《冒险王》',11,'#c0c8e0'],['——',11,'#5a6488'],
  ['特别感谢：正在游玩的你！',13,'#f8d048']];
function renderCredits(tick){
  const g=ctx.createLinearGradient(0,0,0,VIEW_H); // 深空底
  g.addColorStop(0,'#141434');g.addColorStop(1,'#050510');
  ctx.fillStyle=g;ctx.fillRect(0,0,VIEW_W,VIEW_H);
  const cols=['#f8d048','#f86030','#48d8e8','#f0f4ff'];
  for(let i=0;i<60;i++){ // 彩带雨：60 条 4 色矩形，x 均布、y=(t*spd+i*37)%260
    const y=(creditsT*(30+(i%5)*14)+i*37)%260-18;
    ctx.fillStyle=cols[i%4];
    ctx.fillRect(px(i*(VIEW_W/60))+i%5,px(y),2,5);
  }
  const y0=230-creditsT*26; // 名单滚动：y 230 → -160
  for(let i=0;i<CREDITS_LINES.length;i++){
    drawCNText(CREDITS_LINES[i][0],VIEW_W/2,y0+i*26,CREDITS_LINES[i][1],CREDITS_LINES[i][2],'center');
  }
  // v5 §D：真结局固定头（金标题+星数合计；滚动名单之上重绘保证可读）
  drawCNText('～ 真结局 ～',VIEW_W/2,10,20,'#f8d048','center');
  const total=Object.values(progress.stars).reduce((a,b)=>a+b,0);
  drawPixelText('TOTAL STARS '+total+'/'+(ALL_LEVELS.length*3),VIEW_W/2,36,1,'#f8d048','center'); // v7 §9.1：48=16 关×3
  if(tick%50<32)drawCNText('回车 · 返回标题',VIEW_W/2,206,11,'#ffffff','center'); // 底部常驻
}

// ---------- v4 谜题渲染（神龛/头顶提示/覆盖层；全程序化兜底，SPR.shrineOff/shrineOn 与
// SPR.puzzleUI{cornerTL..cornerBR,cross} 就位后自动启用，键不匹配则静默跳过） ----------
function renderShrines(L,tick){
  const shr=L.shrines;
  if(!shr||!shr.length)return;
  for(const s of shr){
    const solved=isPuzzleSolved(s.idx);
    // v6 §F.1：未解神龛全图垂直光柱（世界坐标一根到顶，屏外自然裁剪；谜题覆盖层打开时不画；
    // 6px 金渐变柱顶 0.05→底 0.35 ×pulse + 2px 亮芯，设计书 §5.1 代码照抄）
    if(!solved&&!puzzle.open){
      const pulse=0.75+0.25*Math.sin(tick*0.08);
      const grad=ctx.createLinearGradient(0,game.cam.y,0,game.cam.y+VIEW_H);
      grad.addColorStop(0,'rgba(248,208,72,'+(0.05*pulse)+')');
      grad.addColorStop(1,'rgba(248,208,72,'+(0.35*pulse)+')');
      ctx.fillStyle=grad;ctx.fillRect(px(s.x+5),Math.max(-8,game.cam.y-8),6,VIEW_H+16);
      ctx.fillStyle='rgba(255,248,200,'+(0.5*pulse)+')';
      ctx.fillRect(px(s.x+7),Math.max(-8,game.cam.y-8),2,VIEW_H+16);
    }
    let img=solved?SPR.shrineOn:SPR.shrineOff;
    if(Array.isArray(img))img=img[(tick*4|0)%img.length]; // 美术 v4：shrineOn=[帧1,帧2] 星光两帧（art 注释指定取帧式）
    if(img)ctx.drawImage(img,px(s.x),px(s.y));
    else drawSteleFallback(px(s.x),px(s.y),solved,tick); // 美术 v4 未合入兜底：程序化石碑 16×24
    if(solved)drawShrineThumb(s,tick); // 已解：顶部展示谜底缩略图
  }
}
function drawSteleFallback(x,y,solved,tick){ // 内部：程序化石碑（16×24，暗青石 vs 点亮金纹）
  ctx.fillStyle=solved?'#465064':'#2c3440';ctx.fillRect(x+2,y+2,12,22); // 碑身
  ctx.fillStyle=solved?'#5a6478':'#3c4652';ctx.fillRect(x+1,y,14,4);   // 顶帽
  ctx.fillStyle='rgba(0,0,0,0.28)';ctx.fillRect(x+11,y+4,3,20);        // 侧影
  if(solved){
    ctx.strokeStyle='#f8d048';ctx.lineWidth=1;ctx.strokeRect(x+2.5,y+2.5,11,21); // 金纹描边
    if(tick%36<18){ctx.fillStyle='#fff8c8';ctx.fillRect(x+7,y-3,2,2);}           // 顶部星光 2 帧闪烁
  }else drawPixelText('?',x+5,y+9,2,'#c8b478');                                  // 问号
}
function drawShrineThumb(s,tick){ // 已解神龛顶部谜底缩略图：数织画原样 / 数独金色"完"字印章
  if(typeof PUZZLES==='undefined')return;
  const pz=PUZZLES[s.idx];if(!pz)return;
  const bob=Math.sin(tick*3+s.idx*1.7)*1.5;
  if(pz.type==='nono'){
    const cs=2,w=pz.size*cs;
    const x0=Math.round(s.x+8-w/2),y0=Math.round(s.y-4-pz.size*cs+bob);
    ctx.fillStyle='rgba(4,4,12,0.65)';ctx.fillRect(x0-2,y0-2,w+4,pz.size*cs+4); // 衬底
    ctx.fillStyle='#efe6c4';
    for(let r=0;r<pz.size;r++)for(let c=0;c<pz.size;c++)
      if((pz.pic[r][c]||'.')==='#')ctx.fillRect(x0+c*cs,y0+r*cs,cs,cs);
  }else{
    const bx=Math.round(s.x+1),by=Math.round(s.y-17+bob);
    ctx.fillStyle='rgba(4,4,12,0.65)';ctx.fillRect(bx-1,by-1,15,15);
    ctx.fillStyle='rgba(248,208,72,0.14)';ctx.fillRect(bx,by,13,13);            // 印章底
    ctx.strokeStyle='#f8d048';ctx.lineWidth=1;ctx.strokeRect(bx+0.5,by+0.5,12,12);
    drawCNText('完',bx+6.5,by+2,10,'#f8d048','center');
  }
}
function renderPuzzleHint(tick){ // puzzleNear 时头顶浮动提示（已解→查看，未解→解谜）
  if(puzzle.open||uiState!=='play')return;
  const pn=puzzleNearIdx();
  if(pn<0)return;
  const p=game.player;if(!p||p.dead)return;
  drawCNText(isPuzzleSolved(pn)?'↑ 查看':'↑ 解谜',p.x+p.w/2,p.y-13+Math.sin(tick*4)*1.5,9,'#f8d048','center');
}
function renderPuzzleOverlay(tick){ // 覆盖层：半透明黑底+木框+题目+光标+底部操作提示
  if(typeof PUZZLES==='undefined')return;
  const pz=PUZZLES[puzzle.idx];if(!pz)return;
  ctx.fillStyle='rgba(4,4,14,0.78)';ctx.fillRect(0,0,VIEW_W,VIEW_H);
  const fx=16,fy=10,fw=VIEW_W-32,fh=VIEW_H-24; // 框 352×200（宽高均为 8 的倍数，美术拼接件齐缝）
  // v5 §A-5：程序化木框底删除 → 深蓝金底（SPR.puzzleUI 深蓝金皮肤件存在时被完全覆盖；缺失时兜底）
  ctx.fillStyle='rgba(14,26,58,0.9)';ctx.fillRect(fx,fy,fw,fh);
  ctx.fillStyle='#10162e';ctx.fillRect(fx+6,fy+6,fw-12,fh-12); // 内板（v5 §A-5）
  ctx.strokeStyle='#f0c860';ctx.lineWidth=1;ctx.strokeRect(fx+0.5,fy+0.5,fw-1,fh-1); // 金细线
  const PU=SPR.puzzleUI; // 美术 v4 拼接件：四角+边条（8×8 齐缝平铺；v5 风格队换深蓝金皮肤，键名不变）
  if(PU&&PU.cornerTL&&PU.cornerTR&&PU.cornerBL&&PU.cornerBR&&PU.edgeH&&PU.edgeV){
    const cw=PU.cornerTL.width,ch=PU.cornerTL.height;
    for(let x=fx+cw;x+PU.edgeH.width<=fx+fw-cw;x+=PU.edgeH.width){
      ctx.drawImage(PU.edgeH,x,fy);ctx.drawImage(PU.edgeH,x,fy+fh-PU.edgeH.height);
    }
    for(let y=fy+ch;y+PU.edgeV.height<=fy+fh-ch;y+=PU.edgeV.height){
      ctx.drawImage(PU.edgeV,fx,y);ctx.drawImage(PU.edgeV,fx+fw-PU.edgeV.width,y);
    }
    ctx.drawImage(PU.cornerTL,fx,fy);ctx.drawImage(PU.cornerTR,fx+fw-PU.cornerTR.width,fy);
    ctx.drawImage(PU.cornerBL,fx,fy+fh-PU.cornerBL.height);ctx.drawImage(PU.cornerBR,fx+fw-PU.cornerBR.width,fy+fh-PU.cornerBR.height);
  }
  drawCNText((puzzle.type==='nono'?'谜题神龛 · 数织 ':'谜题神龛 · 数独 ')+puzzle.size+'×'+puzzle.size,
    VIEW_W/2,fy+9,12,'#f8d048','center');
  if(puzzle.view)drawCNText('已解 · 谜底',fx+fw-10,fy+11,10,'#8ad8a0','right');
  if(puzzle.type==='nono')renderNonoBoard(tick,pz);else renderSudokuBoard(tick,pz);
  if(puzzle.done){ // 解开横幅（2s 自动关层期间）；v5 §A-7：同套切角面板
    _panel(VIEW_W/2-105,fy+fh/2-12,210,20);
    drawCNText('神龛点亮！宝石 +1 · 金币 +5',VIEW_W/2,fy+fh/2-9,12,'#f8d048','center');
  }
  const hint=puzzle.view?'Esc 关闭':puzzle.type==='nono'
    ?'方向 移动 · J 填格 · K 叉格 · R 清空 · Esc 退出'
    :'方向 移动 · 数字键 填入 · 0/退格 清除 · R 重来 · Esc 退出';
  drawCNText(hint,VIEW_W/2,fy+fh-16,9,'#b8b8c8','center');
}
function renderNonoBoard(tick,pz){ // 数织：左侧/顶部线索 + 网格 + 光标 + 错格闪红
  const s=pz.size;
  const cell=s<=5?18:s<=7?15:11;
  const rowC=pz.pic.map(rowRuns);
  const colC=[];
  for(let c=0;c<s;c++){let str='';for(let r=0;r<s;r++)str+=(pz.pic[r][c]||'.');colC.push(rowRuns(str));}
  const maxR=Math.max(1,...rowC.map(a=>a.length)),maxC=Math.max(1,...colC.map(a=>a.length));
  const clueW=maxR*7+5,clueH=maxC*7+5,gw=s*cell;
  const gx=Math.round((VIEW_W-clueW-gw)/2)+clueW,gy=38+clueH;
  ctx.fillStyle='#b0b8d0'; // 列线索（顶部，自下而上贴近网格）
  for(let c=0;c<s;c++){
    const ns=colC[c].length?colC[c]:[0];
    for(let j=0;j<ns.length;j++)drawPixelText(''+ns[j],gx+c*cell+((cell-3)>>1),gy-10-(ns.length-1-j)*7,1,'#b0b8d0');
  }
  for(let r=0;r<s;r++){ // 行线索（左侧，自右向左贴近网格）
    const ns=rowC[r].length?rowC[r]:[0];
    for(let j=0;j<ns.length;j++)drawPixelText(''+ns[j],gx-7-(ns.length-1-j)*7,gy+r*cell+((cell-5)>>1),1,'#b0b8d0');
  }
  const PU=SPR.puzzleUI; // 美术 v4 可选：8×8 数织叉格标记 xmark（未就位用程序化 X 兜底）
  for(let r=0;r<s;r++)for(let c=0;c<s;c++){
    const x=gx+c*cell,y=gy+r*cell,want=(pz.pic[r][c]||'.')==='#';
    const v=puzzle.view?0:(puzzle.grid?puzzle.grid[r][c]:0);
    const filled=puzzle.view?want:v===1,crossed=!puzzle.view&&v===2;
    ctx.fillStyle='#0e0e1a';ctx.fillRect(x,y,cell,cell);
    ctx.fillStyle='#2c2c44';ctx.fillRect(x,y,cell,1);ctx.fillRect(x,y,1,cell);
    if(filled){ctx.fillStyle=puzzle.done?'#f8d048':'#e9e2c8';ctx.fillRect(x+1,y+1,cell-1,cell-1);}
    else if(crossed&&PU&&PU.xmark)ctx.drawImage(PU.xmark,x+((cell-8)>>1),y+((cell-8)>>1));
    else if(crossed){
      ctx.strokeStyle='#7c86a8';ctx.lineWidth=1;ctx.beginPath();
      ctx.moveTo(x+2.5,y+2.5);ctx.lineTo(x+cell-2.5,y+cell-2.5);
      ctx.moveTo(x+cell-2.5,y+2.5);ctx.lineTo(x+2.5,y+cell-2.5);ctx.stroke();
    }
    if(!puzzle.view&&puzzle.err>0&&(game.tick%10<5)&&((want&&v!==1)||(!want&&v===1))){ // 错格闪红 1s
      ctx.fillStyle='rgba(248,64,64,0.85)';ctx.fillRect(x+1,y+1,cell-1,cell-1);
    }
  }
  if(s>=8){ctx.fillStyle='#50507a'; // 8×8 以上每 5 格加粗辅助线（便于数格）
    for(let i=5;i<s;i+=5){ctx.fillRect(gx+i*cell,gy,1,gw);ctx.fillRect(gx,gy+i*cell,gw,1);}}
  ctx.strokeStyle='#9a9ab8';ctx.lineWidth=1;ctx.strokeRect(gx-0.5,gy-0.5,gw+1,gw+1);
  if(!puzzle.view&&!puzzle.done){ // 光标：白色描边方块
    ctx.strokeStyle='#ffffff';ctx.lineWidth=2;
    ctx.strokeRect(gx+puzzle.cur.x*cell+1,gy+puzzle.cur.y*cell+1,cell-2,cell-2);
  }
}
function renderSudokuBoard(tick,pz){ // 数独：粗细分隔线+给定格灰底+冲突红字+光标
  const s=pz.size,[bh,bw]=sudokuBoxDims(pz);
  const cell=s===4?26:s===6?22:17,gw=s*cell;
  const gx=Math.round((VIEW_W-gw)/2),gy=Math.round(38+Math.max(0,(156-gw)/2));
  for(let r=0;r<s;r++)for(let c=0;c<s;c++){
    const x=gx+c*cell,y=gy+r*cell;
    const v=puzzle.view?(pz.sol[r][c]||0):(puzzle.grid?puzzle.grid[r][c]:0);
    const isG=puzzle.view||!puzzle.given||puzzle.given[r][c];
    ctx.fillStyle='#0e0e1a';ctx.fillRect(x,y,cell,cell);
    if(isG){ctx.fillStyle='rgba(168,168,200,0.32)';ctx.fillRect(x+1,y+1,cell-1,cell-1);} // 给定格灰底
    if(v>0){
      let col=isG?'#f0f0f4':'#7ec8f0';
      if(!puzzle.view&&sudokuConflicts(r,c,v))col='#f85858'; // 冲突实时红字
      const sc=s===9?1:2;
      drawPixelText(''+v,x+cell/2,Math.round(y+(cell-5*sc)/2),sc,col,'center');
    }
    if(!puzzle.view&&v>0&&puzzle.err>0&&(game.tick%10<5)&&v!==pz.sol[r][c]){ // 完成校验错格闪红
      ctx.fillStyle='rgba(248,64,64,0.8)';ctx.fillRect(x+1,y+1,cell-1,cell-1);
    }
  }
  for(let i=0;i<=s;i++){ // 块界粗线 / 格间细线（外框同为粗线）
    const xth=(i%bw===0)?2:1,yth=(i%bh===0)?2:1;
    ctx.fillStyle=(i%bw===0)?'#b0b0cc':'#3a3a58';
    ctx.fillRect(gx+i*cell-(xth===2?1:0),gy,xth,gw);
    ctx.fillStyle=(i%bh===0)?'#b0b0cc':'#3a3a58';
    ctx.fillRect(gx,gy+i*cell-(yth===2?1:0),gw,yth);
  }
  if(!puzzle.view&&!puzzle.done){ // 光标：白色描边方块
    ctx.strokeStyle='#ffffff';ctx.lineWidth=2;
    ctx.strokeRect(gx+puzzle.cur.x*cell+1,gy+puzzle.cur.y*cell+1,cell-2,cell-2);
  }
}

// ---------- 状态机与主循环 ----------
let lastState='';
// v2 P1：冲刺残影快照（0.04s 间隔，共 4 帧半透明剪影）+ 连击弹字动画状态
const ghosts=[];let ghostTick=0,comboPop=0,lastCombo=0;
function step(dt){
  game.tick+=dt*60;
  fade=clamp(fade+fadeDir*dt*3,0,1);
  hintT-=dt;
  oHintT-=dt;skillHintT-=dt;fallToastT-=dt; // v6 §D/§E：提示计时（渲染按 uiState==='play' 门控）
  for(let i=_bagFloats.length-1;i>=0;i--){_bagFloats[i].t+=dt;if(_bagFloats[i].t>=2)_bagFloats.splice(i,1);} // v6 波2 §B
  if(game.shake>0)game.shake=Math.max(0,game.shake-dt*18);

  // 输入桥接（持键直写；边沿锁存只在 play 且未暂停时写入——暂停/结算期不积累 stale 边沿）
  game.input.left=kd('left')?1:0;
  game.input.right=kd('right')?1:0;
  game.input.jump=kd('jump')?1:0;
  game.input.attack=kd('attack')?1:0;
  game.input.dash=kd('dash')?1:0;
  game.input.down=kd('down')?1:0; // v6 §1.3：速降持键桥接（引擎 v6 消费；未合入时写入无害，H4）
  if(uiState==='play'&&!game.paused&&!puzzle.open&&!bagOpen){ // v6 波2：背包层期间输入归背包（H3）
    // v4 §界面①：puzzleNear>=0 时优先开龛不跳——跳跃边沿不桥接并置 0（工单硬性要求）
    const pn=puzzleNearIdx();
    if(pn>=0){
      if(hit('puzzleOpen')&&game.player&&!game.player.dead)openPuzzle(pn);
      game.input.jumpHit=0;
    }else if(hit('jump'))game.input.jumpHit=1;
    if(hit('attack'))game.input.attackHit=1;
    if(hit('dash'))game.input.dashHit=1;
    if(hit('skillU'))game.input.skillUHit=1;   // v3 §A：技能边沿（engine 写入消费）
    if(hit('skillI'))game.input.skillIHit=1;
    if(hit('skillO'))game.input.skillOHit=1;
    if(hit('skillL'))game.input.skillLHit=1;   // v6 §A.3：L 键边沿（KEYMAP.skillL；engine v6 消费）
    // v6 §A.3：鼠标点技能槽=与键盘同管线（仅 play 且未暂停未开层；键盘等价=U/I/O/L 键，H2）
    if(mouse.click&&hover&&hover.indexOf('skill:')===0)
      game.input[SK_SLOT_KEYS[+hover.slice(6)]+'Hit']=1;
    // v6 波2 §G：HUD 背包钮点击开启（键盘等价=B 键；死亡演出不响应——openBag 调用方同守卫）
    if(mouse.click&&hover==='hudbag'&&game.player&&!game.player.dead)openBag();
  }

  // v2 P1：残影记录与连击弹字计时
  updateGhosts(dt);
  simUiFx(dt); // v5 §A：UI 层粒子/浮字/爆坑推进（hit-stop/ult 冻结期照常动；pause/谜题层内部自守卫跳过）
  if(uiState==='play')simHiddenHint(); // v7 §9.8：隐藏房微提示（未碎 G 近距尘落，节流扫描）
  if(game.combo!==lastCombo){if(game.combo>lastCombo)comboPop=0.3;lastCombo=game.combo;}
  comboPop-=dt;
  // v7.1：O 大提示上升沿——改能量制（ultCharge 满 100 触发；原 combo>=8 废除）
  if(uiState==='play'&&!game.paused&&!puzzle.open&&!bagOpen&&(game.ultCharge||0)>=100&&!oHintDone&&game.skills&&game.skills.o<=0){
    oHintDone=true;oHintT=2.5;
  }

  if(uiState==='title'){
    // v6 §A.4：点 title 开始钮=hit('confirm') 等价分支（键盘等价=回车，H2）
    if(hit('confirm')||(mouse.click&&hover==='titleStart')){SFX.select();uiState='select';fade=1;fadeDir=-1;}
  }else if(uiState==='select'){
    // v7 §9.2：章节化导航——←→ ±1（clamp 0..ALL_LEVELS.length-1）；↑↓ 跨章保持列号：
    // col=menuSel-当前章首 idx，跳至上/下一章 章首+min(col,章长-1)；末章↓/首章↑钳位不动
    if(hit('right')){menuSel=clamp(menuSel+1,0,ALL_LEVELS.length-1);SFX.select();}
    if(hit('left')){menuSel=clamp(menuSel-1,0,ALL_LEVELS.length-1);SFX.select();}
    if(hit('down')||hit('up')){
      const chs=_chapters();
      let ci=0;while(ci<chs.length-1&&menuSel>=chs[ci].first+chs[ci].len)ci++;
      const nt=hit('down')?ci+1:ci-1;
      if(nt>=0&&nt<chs.length){
        const col=menuSel-chs[ci].first;
        menuSel=chs[nt].first+Math.min(col,chs[nt].len-1);
      }
      SFX.select();
    }
    // v6 §A.4：选关卡鼠标单击=选中（menuSel=i）、双击=进入——确认分支复用 hit('confirm') 同代码路径
    if(mouse.click&&hover&&hover.indexOf('select:')===0){
      const i=+hover.slice(7);
      if(menuSel===i&&game.tick-selClickTick<30){ // 30 tick=0.5s 内同卡再点=双击
        if(menuSel+1<=progress.unlocked){SFX.select();startLevel(menuSel);}
        else SFX.shot();
      }else{menuSel=i;SFX.select();}
      selClickTick=game.tick;
    }
    if(hit('confirm')){
      if(menuSel+1<=progress.unlocked){SFX.select();startLevel(menuSel);}
      else SFX.shot();
    }
    if(hit('back')){uiState='title';fade=1;fadeDir=-1;}
  }else if(uiState==='play'){
    if(puzzle.open)stepPuzzleInput(dt); // v4：覆盖层消费输入，世界冻结（下方跳过 updateWorld；
                                        // engine 侧另有 puzzleActive 早退双保险，同 paused 语义）
    else if(bagOpen)stepBagInput();     // v6 波2 §C：背包层消费输入，世界冻结（game.bagActive 引擎早退
                                        // +此处不调 updateWorld 双保险 H7；死亡/结算不可能到这——见开包守卫）
    else{
      if(hit('pause')){
        game.paused=!game.paused;SFX.select();
        if(game.paused){game.input.jumpHit=0;game.input.attackHit=0;game.input.dashHit=0; // 暂停瞬间的 stale 边沿不带入恢复后
          game.input.skillUHit=0;game.input.skillIHit=0;game.input.skillOHit=0; // v3 §A：技能边沿同清
          game.input.skillLHit=0;} // v6：L 槽边沿同清
      }
      // v6 波2 §7.1：开包（B 键 / HUD 钮点击已在桥接块）——死亡演出与暂停/谜题层不响应
      if(hit('bag')&&!game.paused&&game.player&&!game.player.dead)openBag();
      if(hit('restart')){startLevel(game.levelIdx);return;}
      if(hit('back')&&!game.paused){uiState='select';fade=1;fadeDir=-1;return;}
      if(!game.paused&&!puzzle.open&&!bagOpen)updateWorld(dt); // v4：覆盖层期间世界暂停（不改 paused 字段）；v6 波2：背包层同（H7 ui 侧双保险）
      // v6 §E2：速降 toast 触发检测（空中连续下落≥0.8s 且未按 ↓ 且从未提示过；条件断开即清零，
      // 落地自然清零；写 localStorage pq_hint_fall 一次性——H5 唯一新增键）
      const pp=game.player;
      if(pp&&!pp.dead&&!pp.onGround&&pp.vy>100&&!kd('down'))fallT+=dt;else fallT=0;
      if(fallT>=0.8&&!pqFallHinted){
        pqFallHinted=true;fallToastT=2.5;fallT=0;
        try{localStorage.setItem('pq_hint_fall','1');}catch(e){}
      }
    }
    // v6 波2 §B：拾取事件消费 → 入包三选一（§6.4 逐字：同名→碎片 / 空位→入包 / 满包→碎片保底）；
    // 每事件即时 saveProgress（H2）；守卫 game.pickups（loot 队未合入时字段缺省，块空转 H4）
    if(typeof game.pickups!=='undefined'&&game.pickups.length){
      const evs=game.pickups;game.pickups=[]; // 先摘队列再消费：消费内 saveProgress 不与引擎写交错
      for(const pk of evs){
        if(!pk||typeof pk.slot!=='string'||typeof pk.r!=='number')continue;
        const name=EQ_PREFIX[pk.r]+EQ_BASE[pk.slot];
        const same=progress.inv.find(it=>it.slot===pk.slot&&it.r===pk.r);
        if(same||progress.inv.length>=BAL_GEAR_BAG){      // 有同名 或 满包 → 碎片
          const k=pk.slot+pk.r;
          progress.shards[k]=(progress.shards[k]||0)+1;
          _bagFloat((same?'':'背包已满 ')+name+' → 碎片+1',EQ_COLOR[pk.r],pk.r===4);
        }else{
          progress.inv.push({id:progress.nextId++,slot:pk.slot,r:pk.r});
          _bagFloat('获得 '+name,EQ_COLOR[pk.r],pk.r===4);
        }
        saveProgress(progress);
      }
    }
  }else if(uiState==='clear'){
    game.clearT+=dt;
    if(hit('confirm')&&game.clearT>0.8){
      if(game.levelIdx<ALL_LEVELS.length-1){startLevel(game.levelIdx+1);} // v7 §2.3：L10 通关进 L11；末关（L16）进 credits
      else{uiState='credits';creditsT=0;fade=1;fadeDir=-1;} // v3 §E3：L7 结算不再进 victory，进致谢屏
    }
    if(hit('back')){uiState='select';fade=1;fadeDir=-1;}
  }else if(uiState==='credits'){ // v3 §E3：致谢屏计时与退场
    creditsT+=dt;
    if(hit('confirm')&&creditsT>1){SFX.select();uiState='title';fade=1;fadeDir=-1;}
  }

  // 检测引擎置 clear
  if(game.state==='clear'&&lastState!=='clear'){
    uiState='clear';game.clearT=0;clearShown=0;
    clearStars=1+(game.coins>=game.level.totalCoin?1:0)+(game.time<=game.level.par?1:0);
    const k=game.levelIdx+'';
    progress.stars[k]=Math.max(progress.stars[k]||0,clearStars);
    progress.unlocked=Math.max(progress.unlocked,Math.min(ALL_LEVELS.length,game.levelIdx+2)); // v7 §2.3：上限=ALL_LEVELS.length（线性后继=章末 Boss 通关解锁下一章）
    saveProgress(progress);
  }
  if(game.state==='play'&&lastState==='clear'&&!fadeDir)fadeDir=-1;
  lastState=game.state;

  // 音效队列
  for(const name of game.sfxQueue){if(SFX[name])SFX[name]();}
  game.sfxQueue.length=0;
}

let acc=0,last=performance.now();
function frame(now){
  acc+=Math.min(0.1,(now-last)/1000);last=now;
  // P0 修复（任务书 2026-10-24-v2 §P0）：pressed 边沿只在真实跑过至少一个物理 step 之后清空。
  // 清空动作挪进 while 循环、逐 step 执行——零步进的渲染帧（高刷屏 acc<1/60）不再吞输入；
  // 一帧多 step 时第一步消费后即清，边沿只消费一次（不丢不重）。
  // v6 §A.1：mouse.click 单击边沿同点清零（mousedown 置 1 → 单 step 消费）。
  while(acc>=1/60){step(1/60);clearPressed();mouse.click=0;acc-=1/60;}
  render();
  if(uiState==='victory')renderVictory(game.tick);
  if(uiState==='credits')renderCredits(game.tick); // v3 §E3：致谢屏
  requestAnimationFrame(frame);
}

// ---------- 启动 ----------
function boot(){
  buildSprites();
  fitScreen();
  recomputeEquip(); // v6 波2 §D：boot 后一次（异常档自愈回写+注入 game.equip/cdMul；先于 startLevel/loadLevel 读装备）
  const lvl=q.get('level');
  if(lvl){
    const idx=clamp(parseInt(lvl)-1,0,ALL_LEVELS.length-1);
    startLevel(idx);
  }else{
    game.state='title';
  }
  requestAnimationFrame(frame);
}
if(document.readyState==='loading')addEventListener('DOMContentLoaded',boot);
else boot();

})();
