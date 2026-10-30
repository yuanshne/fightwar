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
//      game.equip/cdMul；p.maxHp 差值同步（lv9.1：只同步上限、不回血——hp 仅按新上限截断，脱/穿不再刷血）；调用点 boot/startLevel/
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
// v7.5 增量（提示「有代价、绝不阻断」）：puzzleHint 每揭示一格扣 1 金币——仅 game.coins>0 时扣，
//   金币 <=0 照给提示、不欠账、不阻断（无限次/永不卡死红线不变）；扣费反馈复用金币拾取同一套机制
//   （_bagFloat 浮字 + game.sfxQueue 'coin' → SFX.coin），谜题层内可见；底部操作条与左上
//   「提示 ×N」行标出代价与余额；puzzle.hintN 保留。
// v7.7 增量（局外成长撤销 + 换色皮肤衣橱）：
//   ① 撤销：永久货币/三条升级线整块删除——gold/meta/goldBest 存档字段、META_* 常量、
//      metaLv/metaCost/metaVal/metaUpgrade/awardGold/clearGoldGain、成长面板渲染与输入、KeyG 成长入口、
//      startLevel 的 game.metaBonus 注入、recomputeEquip 里掺入的永久生命；属性回到「基础 + 装备」原式。
//      「全关开放」开关（progress.unlockAll / F 键 / 标题页 104×18 开关）行为原样保留。
//   ② 换色皮肤：成长面板原位改造为衣橱（300×172 切角面板 / 17 格 6×3 网格 / 方向选 / 回车装备 /
//      G·Esc 关 / 鼠标等价）；每关首次通关掉该关对应色（关卡 idx → HERO_SKINS[idx+1]），已解锁不重复、
//      全关开放下直打 L16 只掉 L16 那套；结算屏加一行「获得新衣」。
//   ③ 渲染取帧全部改「当前皮肤帧优先、SPR.* 兜底」——art.js 未合入 HERO_SKINS/getHeroSkin 时静默回落
//      静态帧（零回归）；heroAttackGold 属技能特效态，不随皮肤变。
// v10 增量·界面队（用户反馈「Boss 技能太垃圾重复」→ 引擎加招 + 连段 + 破绽，UI 负责让玩家看得懂）：
//   §任务1 五种危险物渲染 renderHazards：meteor（收缩红圈+十字准星预警 → 尾焰球+落地环）/
//      spike（地面裂纹 0.2s 预警 → 深灰三角簇按 h 长高）/homing（紫球脉动光晕+4 段拖尾+追人细线）/
//      clone（半透紫 Boss 剪影+头顶「幻」）/pull（内流粒子环+虚线圆）。调用点在 renderEntities 内
//      game.waves 之后（实体层之上、renderParts 之前），走相机世界坐标。
//   §任务2 Boss 状态可视化：renderBossWindupFx（meteor/spike/homing/clone/pull 五种新招前摇特效）+
//      renderBossTags（连段红「连」/破绽金「破绽」+ 淡黄描边）+ HUD 名字牌连段红边。
//   §任务3 三段血刻度改按 maxHp/bandMax 比例算（_bossTickXs），血量 ×3（63→189 / 189→567）后不漂移。
//   硬约束：game.hazards 缺失/空数组、b.comboQ/comboN 未定义、SPR.meteor/spike/bossGhost 缺失
//   一律静默降级（程序化兜底），零异常；每元素绘制调用 ≤12 次。
// v19 增量·界面队（docs/specs/2026-10-29-v19-mage.md §3，第二角色「星语法师」）：
//   §3.1 选角覆盖层 heroOpen（面板 42,24,300,190，左骑士右法师双卡）：C 键/标题·选关「角色」按钮开启，
//        ←→ 选卡、Enter/Space 确认并写 progress.hero（只增存档键）、C/Esc/X 关闭；与衣橱互斥。
//   §3.2 startLevel 首行注入 game.hero、recomputeEquip 基础血按 HEROES.hpBase、boot 读存档 + ?hero= 调试；
//        renderBag 肖像按英雄取帧。
//   §3.3 magePoseImg（cast>attack>dash>air>run/idle + 落地 squash，左向取 ...L）、死亡帧 mgFall、
//        法师无近战弧光、renderMageUlt（紫青压暗/魔法阵/陨星/紫环）、标题剪影 mageSil。
//   §3.4 HUD：英雄技能图标 mg*/sk*、CD 分母读 HEROES、法师法力条（血条面板右半区，零新增纵向空间）、
//        法力不足槽位 35% 图标 + 红点、技能卡按英雄读名/述/法力、O 横幅按英雄、法力不足红字。
//   §3.5 SFX bolt/lance/seek/storm/nomana。
//   硬约束：HEROES 与全部新 SPR.mg* 键守卫式回退（引擎/美术未合入时照常可跑，骑士外观逐像素不变）。
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
  puzzleHint:['KeyH'],                  // v7.4：谜题层提示键（每次揭示一格正解；H 未被任何既有键占用）
  pause:['KeyP'],mute:['KeyM'],restart:['KeyR'],back:['Escape'],
  bag:['KeyB'], // v6 波2 §7.1：背包开关键（B 未被既有键占用；hit('bag') 仅背包层与 play 态消费）
  unlockAll:['KeyF'], // v7.7：首页「全关开放」开关键（F 未被既有键占用；仅 title 态消费）
  wardrobe:['KeyG'],  // v7.7：衣橱开关键（G 未被既有键占用；仅 title/select 态消费；原「成长」面板键位复用）
  hero:['KeyC'],      // v19：选角开关键（C 未被既有键占用；仅 title/select 态消费；面板内 C/Esc/X 关闭）
  confirm:['Enter','Space','KeyW','ArrowUp'],
  // v8.0：无方向冲突的确认组——confirm 含 ↑/W，凡「↑/W 已是导航」的界面（选关 ↑=跨章、背包/衣橱 ↑=选上一格）
  // 用它就会一键双响（选关按 ↑ 直接进关、背包按 W 边移动边装备）。这三处改用 ok（只认 Enter/Space），
  // 语义仍是「确认」，只是不与方向键抢同一批键——用户反馈的「有些地方不灵」即由此类撞键与缺键造成。
  ok:['Enter','Space']
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
  // v19 §3.5 法师音效（事件名与 engine push 完全一致；全程序化合成，风格同既有）
  bolt(){tone({f:1500,f2:760,d:0.05,v:0.12,type:'square'});noiseSfx({d:0.04,v:0.1});},      // 奥术飞弹：短促高频电流
  nova(){noiseSfx({d:0.2,v:0.24,fc:2600});tone({f:1600,f2:420,d:0.22,v:0.18,type:'triangle'});
    [1320,990,660].forEach((f,i)=>tone({f,d:0.1,v:0.12,at:i*0.04,type:'square'}));},          // 霜爆新星：冰壳炸开（高频碎裂八向扩散）
  well(){tone({f:60,f2:110,d:0.35,v:0.22,type:'sine'});noiseSfx({d:0.3,v:0.12,fc:380});},     // 引力奇点出手：低频下潜
  wellStop(){tone({f:110,f2:55,d:0.25,v:0.2,type:'sine'});tone({f:880,d:0.06,v:0.1,at:0.02});}, // 奇点停驻：闷响+轻点
  wellBoom(){noiseSfx({d:0.35,v:0.32});tone({f:120,f2:40,d:0.4,v:0.3,type:'sawtooth'});
    [523,392,262].forEach((f,i)=>tone({f,d:0.12,v:0.16,at:i*0.05,type:'triangle'}));},        // 引爆：低频爆+三连下坠
  storm(){noiseSfx({d:0.5,v:0.3});tone({f:62,f2:38,d:0.5,v:0.28,type:'sine'});
    tone({f:900,f2:200,d:0.32,v:0.18,at:0.06,type:'square'});},                              // 陨星风暴：低频轰鸣+坠星
  nomana(){tone({f:180,f2:110,d:0.16,v:0.2,type:'square'});tone({f:120,d:0.12,v:0.14,at:0.1,type:'triangle'});}, // 法力不足：低沉否定
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
  // v7.7：全关开放开关（唯一新增的持久开关；沿用「只增键、缺省补齐、幂等」约定，不覆盖玩家已有值）。
  // 局外成长撤销：gold / meta / goldBest 不再补齐也不再产生（旧档残留的同名键不再被读取，下次 saveProgress 自然消失）。
  if (typeof p.unlockAll !== 'boolean') p.unlockAll = false;
  // v7.7：换色皮肤存档——skin=当前装备 / skins=已解锁（'blue' 为默认色，必须永远在列）。
  // 幂等：只补缺失键、只补 'blue'；脏值（skin 不在 skins 里，如存档被篡改或版本回退）一律回落 'blue'。
  if (typeof p.skin !== 'string' || !p.skin) p.skin = 'blue';
  if (!Array.isArray(p.skins)) p.skins = ['blue'];
  if (p.skins.indexOf('blue') < 0) p.skins.unshift('blue');
  if (p.skins.indexOf(p.skin) < 0) p.skin = 'blue';
  // v19 §3.1：当前英雄（'knight'|'mage'）。只增键：缺省/非法（篡改、回退版本）一律回落 'knight'，
  // 其余既有键（unlocked/stars/puzzles/equip/inv/shards/skin/skins/unlockAll）一概不动。
  if (p.hero !== 'knight' && p.hero !== 'mage') p.hero = 'knight';
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
// ---------- v7.7 换色皮肤（通关掉落；17 套顺序固定，由 art.js 产出 HERO_SKINS/getHeroSkin） ----------
// 守卫：art.js 皮肤接口未合入时回落「只有星蓝一套」+ 静态 SPR 帧——衣橱、掉落、渲染全部照常可跑（零异常）。
const SKIN_LIST=(typeof HERO_SKINS!=='undefined'&&Array.isArray(HERO_SKINS)&&HERO_SKINS.length)
  ?HERO_SKINS:[{id:'blue',name:'星蓝'}];
const SKIN_MAX=SKIN_LIST.length;          // 17（art 未合入=1）
function skinIdx(id){for(let i=0;i<SKIN_LIST.length;i++)if(SKIN_LIST[i].id===id)return i;return -1;} // v7.7：id→序号（-1=未知）
function skinName(id){const i=skinIdx(id);return i<0?(id||'星蓝'):(SKIN_LIST[i].name||id);}          // v7.7：id→中文名（格内 7px）
function skinFrames(id){ // v7.7：取某套皮肤全部帧（art.js 侧惰性生成+缓存；接口未合入 → null 走 SPR.* 兜底）
  return (typeof getHeroSkin==='function')?getHeroSkin(id||'blue'):null;
}
function mageSkinFrames(id){ // v19.4：同一套皮肤对应的法师帧（blue/未知/art 未合入 → null，调用方直接用 SPR.mg*）
  return (typeof getMageSkin==='function')?getMageSkin(id||'blue'):null;
}
function skinOwned(){ // v7.7：已解锁套数（按 SKIN_LIST 计，存档里若残留未知 id 不会被算进 N/17）
  let n=0;for(let i=0;i<SKIN_LIST.length;i++)if(progress.skins.indexOf(SKIN_LIST[i].id)>=0)n++;
  return n;
}
function skinIdle1(id){ // v7.7：某套皮肤的待机帧（缺键/未合入 → SPR.heroIdle1；衣橱缩略图与背包预览共用）
  // v19.4：按当前出战英雄取——法师走 mageSkinFrames（blue 返回 null → 落回 SPR.mgIdle1 本命配色），
  //        衣橱缩略图/背包肖像因此会随角色切换，而不是永远显示骑士。
  const key=(id===undefined?progress.skin:id);
  if(game.hero==='mage'){
    const m=mageSkinFrames(key);
    return (m&&m.idle1)?m.idle1:(SPR.mgIdle1||SPR.heroIdle1);
  }
  const f=skinFrames(key);
  return (f&&f.idle1)?f.idle1:SPR.heroIdle1;
}
// ---------- v19 英雄表（engine.js HEROES 为唯一真值；守卫式兜底保证 ui 在旧引擎上照常运行） ----------
// 顺序冻结：左骑士、右法师（spec §1.1/§3.1）。兜底数值=spec 冻结值，仅在 HEROES 缺失时使用。
const HERO_IDS=['knight','mage'];
const HERO_FALLBACK={
  knight:{id:'knight',name:'星旅勇者',short:'勇者',hpBase:BAL_PLAYER_HP,usesMana:false,
    skills:{u:{name:'星陨术',  desc:'召唤三颗流星轰击锁定的敌人', cd:8, mana:0},
            i:{name:'星光护盾',desc:'3 秒内吸收 2 次伤害',       cd:12,mana:0},
            o:{name:'流星连斩',desc:'时停十字斩：屏内敌人全灭并清弹幕', cd:20,mana:0,ult:true},
            l:{name:'星刃回旋',desc:'掷出回旋星刃，去回两程割草',   cd:6, mana:0}}},
  mage:{id:'mage',name:'星语法师',short:'法师',hpBase:4,usesMana:true,
    skills:{u:{name:'霜爆新星',desc:'身周炸开八道冰锥，命中冻结 0.8 秒',        cd:7, mana:25},
            i:{name:'星辉屏障',desc:'2.5 秒内吸收 2 次伤害',            cd:10,mana:25},
            o:{name:'陨星风暴',desc:'锁定全屏落星：六颗陨星轰击敌阵',   cd:20,mana:0,ult:true},
            l:{name:'引力奇点',desc:'丢出奇点吸附敌人，1.1 秒后引爆',   cd:8, mana:30}}}
};
function heroDef(id){ // 内部：英雄表项（engine 未合入/非法 id → spec 同值兜底）
  if(typeof HEROES!=='undefined'&&HEROES&&HEROES[id]&&HEROES[id].skills)return HEROES[id];
  return HERO_FALLBACK[id]||HERO_FALLBACK.knight;
}
function curHero(){return heroDef(game.hero);} // 内部：当前局内英雄

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
    p.maxHp=heroDef(game.hero).hpBase+eq.hp; // v19 §3.2：基础血按英雄表（骑士 5 / 法师 4）+ 装备
    p.hp=Math.min(p.hp,p.maxHp); // 只按新上限截断：脱装降上限会压血，穿装升上限不回血（防脱穿刷血）
  }
  if(repaired)saveProgress(progress);
}

// ---------- v6 波2 §C 背包状态与操作（§7.1 开合 / §7.3 交互矩阵 / §6.5 合成分解） ----------
let bagOpen=false;                               // 背包覆盖层开关（game.bagActive 同步写；ui 侧跳过 updateWorld 双保险 H7）
let bagFocus='bag',bagSelEquip=0,bagSelBag=0,bagSelShard=0; // 焦点三区 equip(3)/bag(12)/shard(动态)
let bagClickTick=-999,bagClickIdx=-1;            // 背包格双击计时（同选关卡 selClickTick 模式：单击选中、双击穿）
const _bagFloats=[];                             // §B 背包浮字（本地渲染 ≤4 条 2s 消隐——不经 engine 池，H4）
function _bagFloat(text,color,big,ax,ay){ // v7.5：ax/ay 可选锚点（缺省=背包层居中 84+i*13，行为不变）
  if(_bagFloats.length>=4)_bagFloats.shift();
  _bagFloats.push({text:text,color:color,t:0,big:big?1:0,x:ax,y:ay});
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
// v7.8：碎片合计口径的唯一出口——升阶结算、碎片栏、「升阶 n/3」进度全走这里。
// 旧版按 slot+r 精确配桶（w1 只能升 r=1 的件），玩家攒到的碎片对不上号就永远升不了；
// 改成「同槽位五档合计」后，任意稀有度碎片都能垫进去，存档结构仍是 slot+r 扁平键，老档直接续用。
function _slotShardTotal(slot){ // 内部：某槽位 w/h/c 的五档碎片合计
  let n=0;
  for(let r=0;r<5;r++)n+=progress.shards[slot+r]||0;
  return n;
}
function bagUpgrade(){ // 升阶（C / 升阶钮）：同槽任意稀有度碎片合计≥3 且 r<4 → 扣 3、r+1（含穿着中，§6.5）
  const it=bagFocus==='equip'?_equipZoneItem():_bagItem(bagSelBag);
  if(!it)return;
  if(it.r>=4)return;                                       // r=4 显示 MAX，不可升（按钮置灰）
  if(_slotShardTotal(it.slot)<BAL_GEAR_STEP){SFX.shot();return;} // 碎片不足（钮置灰；键盘拒绝音同选关锁）
  // v7.8：扣费从低稀有度往高扣（w0→w4）——低阶碎片是垫料，先消耗它，玩家攒的高阶碎片留得住
  let need=BAL_GEAR_STEP;
  for(let r=0;r<5&&need>0;r++){
    const k=it.slot+r,have=progress.shards[k]||0;
    if(!have)continue;
    const take=Math.min(have,need);
    progress.shards[k]=have-take;                          // 归零写 0 不删键（与 bagSalvage 同一写法规约）
    need-=take;
  }
  it.r+=1;                                                 // 同槽升阶：属性/外观按新 r 重算（recompute+_lookDirty）
  _bagFloat(EQ_PREFIX[it.r]+EQ_BASE[it.slot]+' 升阶成功',EQ_COLOR[it.r],it.r>=4);
  afterBagChange('shard');
}

// ---------- UI 状态 ----------
const q=new URLSearchParams(location.search);
const GOD=q.get('god')==='1';
let uiState='title',menuSel=0,fade=1,fadeDir=-1,hintT=0,lastLevelIdx=-1; // hintT：进关置 3.0（秒），倒数至 0 后提示条隐藏
let clearStars=0,clearShown=0,creditsT=0; // v3 §E：致谢屏计时
// v7.7：衣橱面板（title/select 两态可开；打开期间独占输入与悬停，世界本就不在跑）
let wardrobeOpen=false,wardrobeSel=0;
// v19 §3.1：选角面板（同衣橱模式；与衣橱互斥，绝不重叠）
let heroOpen=false,heroSel=0;
let HERO_DEBUG=null;          // v19：?hero= 调试覆盖（boot 里赋值；非法值忽略）
let clearSkinGain=null;       // v7.7：本次通关掉落的皮肤 id（无掉落=null；结算屏展示用）
// v6 §D/§E：引导与提示计时（渲染按 uiState==='play' 门控；startLevel 重置，见下）
let oHintDone=false,oHintT=0; // §D2：O 大提示每关一次（上升沿置 oHintT=2.5）
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
// v7.6：ruleSeen=一次性规则卡「按谜题类型」记忆（'nono'/'sudoku'，仅本会话内存，不落盘）；
//       ruleOn/ruleT=本次进入的规则卡显示态与倒计时（8s 自动关，永不卡死玩家）
const puzzle={open:false,idx:0,type:'',size:0,grid:null,given:null,cur:{x:0,y:0},err:0,done:false,doneT:0,view:false,hintN:0,
  ruleOn:false,ruleT:0,ruleSeen:{nono:false,sudoku:false}};
let puzzleRep=0,puzzleSkip=0;   // 内部：方向键持键重复计时 / 开层当步跳过输入（防开启键泄漏为光标移动）
const sudokuBoxCache={};        // 内部：数独块尺寸按题号缓存（6×6 的 2×3/3×2 歧义按 sol 合法性自解析）

// ---------- v7.4 谜题可通关性护栏（"不做无法通过的游戏"） ----------
// v7.3 谜题门要求本关神龛全解才放行终点，于是「谜题不可解」=「整关不可通关」。三层护栏：
//   ① 数据层：tools/gate.js 的 puzzle 门禁做唯一解/配对审计（改数据破坏可解性直接红）；
//      运行时再由 puzzleOk() 复核一遍，坏数据不参与谜题门（fail-open，永不硬卡关）。
//   ② 判定层：胜利条件按「规则」而非「答案」判（数独=行列宫合法排列，数织=行列线索吻合），
//      将来若引入多解题，玩家推出的任一合法解都能过，不会出现「明明解对了却判错」。
//   ③ 能力层：H 键逐格揭示正解（无限次），不会做也能一格一格点过去。
function _pzBoxDims(pz){ // 内部：块尺寸（无缓存版，供数据校验用，不污染 sudokuBoxCache）
  if(pz.size===4)return[2,2];
  if(pz.size===9)return[3,3];
  if(sudokuSolValidUi(pz,2,3))return[2,3];
  if(sudokuSolValidUi(pz,3,2))return[3,2];
  return null;
}
function puzzleOk(pz){ // 内部：谜题数据是否可玩（不可玩→神龛不参与谜题门）
  if(!pz||(pz.type!=='nono'&&pz.type!=='sudoku'))return false;
  const n=pz.size;
  if(!(n>=2&&n<=12))return false;
  if(pz.type==='nono'){
    if(!Array.isArray(pz.pic)||pz.pic.length!==n)return false;
    for(const row of pz.pic)if(typeof row!=='string'||row.length!==n||/[^#.]/.test(row))return false;
    return true;
  }
  if(!Array.isArray(pz.sol)||pz.sol.length!==n||!Array.isArray(pz.givens)||pz.givens.length!==n)return false;
  const box=_pzBoxDims(pz);
  if(!box)return false;
  const bh=box[0],bw=box[1];
  const uniq=get=>{const s=new Set();for(let i=0;i<n;i++){const v=get(i);if(v<1||v>n||s.has(v))return false;s.add(v);}return true;};
  for(let r=0;r<n;r++){
    if(!Array.isArray(pz.sol[r])||pz.sol[r].length!==n)return false;
    if(!Array.isArray(pz.givens[r])||pz.givens[r].length!==n)return false;
    if(!uniq(c=>pz.sol[r][c]))return false;
  }
  for(let c=0;c<n;c++)if(!uniq(r=>pz.sol[r][c]))return false;
  for(let br=0;br<n;br+=bh)for(let bc=0;bc<n;bc+=bw){
    const s=new Set();
    for(let r=br;r<br+bh;r++)for(let c=bc;c<bc+bw;c++){const v=pz.sol[r][c];if(v<1||v>n||s.has(v))return false;}
  }
  for(let r=0;r<n;r++)for(let c=0;c<n;c++){const g=pz.givens[r][c];if(g!==0&&g!==pz.sol[r][c])return false;}
  return true;
}
function puzzleShrineUsable(idx){ // 内部：该神龛的谜题数据是否可玩
  return typeof PUZZLES!=='undefined'&&puzzleOk(PUZZLES[idx]);
}

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
function puzzleTypeSolved(type){ // 内部 v7.6：该类型（数织/数独）是否已有任一一题解过——已解过就不再教学
  if(typeof PUZZLES==='undefined')return false;
  for(const k in PUZZLES){const p=PUZZLES[k];if(p&&p.type===type&&isPuzzleSolved(+k))return true;}
  return false;
}
function openPuzzle(idx){ // 仅 play 态且 puzzleNear>=0 时由 step() 输入桥接调用
  if(typeof PUZZLES==='undefined')return;
  const pz=PUZZLES[idx];if(!pz)return;
  if(!puzzleOk(pz)){ // v7.4：数据不可玩——拒绝开层（startLevel 已把该神龛按已解处理，故不卡关）
    console.warn('[puzzle] 神龛 '+idx+' 数据不可玩，跳过开层');
    return;
  }
  const resume=!puzzle.done&&puzzle.idx===idx&&puzzle.type===pz.type&&puzzle.grid&&puzzle.grid.length===pz.size;
  puzzle.open=true;puzzle.idx=idx;puzzle.type=pz.type;puzzle.size=pz.size;
  puzzle.err=0;puzzle.done=false;puzzle.doneT=0;puzzle.view=isPuzzleSolved(idx);
  // v7.6：首次进入该类谜题（且未解过、非回看谜底）→ 弹一次性规则卡；view 状态永不弹
  puzzle.ruleOn=!puzzle.view&&!puzzle.ruleSeen[pz.type]&&!puzzleTypeSolved(pz.type);
  puzzle.ruleT=8;
  puzzleSkip=1;
  if(!resume)puzzle.hintN=0; // v7.4：提示计数按题计（续玩同一题不清零）
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
  puzzle.ruleOn=false;puzzle.ruleT=0; // v7.6：关层顺手收起规则卡（下次进入按 ruleSeen 决定是否再弹）
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
  if(n>puzzle.size)return; // v7.4：4×4/6×6 题按到 7~9 属无效输入，直接忽略（否则格子里留下非法值无法自清）
  puzzle.grid[c.y][c.x]=puzzle.grid[c.y][c.x]===n?0:n;
  checkSudokuDone();
}
function puzzleClearGrid(){ // R：数织清空 / 数独清空重来（givens 保留）
  const pz=PUZZLES[puzzle.idx];
  if(pz.type==='nono')puzzle.grid=puzzle.grid.map(r=>r.map(()=>0));
  else{puzzle.grid=pz.givens.map(r=>r.slice());puzzle.given=pz.givens.map(r=>r.map(v=>v>0));}
  puzzle.err=0;
}
function nonoRunsMatch(pz){ // 内部 v7.4：按线索判胜负——每行/列的实际连续段必须等于该行/列线索
  const s=pz.size;
  const rowClue=pz.pic.map(r=>rowRuns(r));
  const colClue=[];
  for(let c=0;c<s;c++){let str='';for(let r=0;r<s;r++)str+=(pz.pic[r][c]||'.');colClue.push(rowRuns(str));}
  const runsOf=get=>{const out=[];let cur=0;for(let i=0;i<s;i++){if(get(i)===1)cur++;else if(cur){out.push(cur);cur=0;}}if(cur)out.push(cur);return out;};
  const eq=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
  for(let r=0;r<s;r++)if(!eq(runsOf(c=>puzzle.grid[r][c]),rowClue[r]))return false;
  for(let c=0;c<s;c++)if(!eq(runsOf(r=>puzzle.grid[r][c]),colClue[c]))return false;
  return true;
}
function checkNonoDone(){ // 完成时自动校验：线索吻合→胜利；越界实心→错格闪红 1s
  const pz=PUZZLES[puzzle.idx];
  let unfilled=0,wrong=0;
  for(let r=0;r<pz.size;r++)for(let c=0;c<pz.size;c++){
    const want=(pz.pic[r][c]||'.')==='#',v=puzzle.grid[r][c];
    if(want&&v!==1)unfilled++;
    else if(!want&&v===1)wrong++;
  }
  if(nonoRunsMatch(pz))winPuzzle();   // v7.4：判定改「对线索」而非「对画稿」——任一合法解都算过
  else if(unfilled===0&&wrong>0)puzzle.err=1;
}
function sudokuGridSolved(pz){ // 内部 v7.4：按规则判胜负——每行/列/宫都是 1..n 的排列
  const n=pz.size,box=sudokuBoxDims(pz),bh=box[0],bw=box[1];
  const uniq=get=>{const s=new Set();for(let i=0;i<n;i++){const v=get(i);if(v<1||v>n||s.has(v))return false;s.add(v);}return true;};
  for(let r=0;r<n;r++)if(!uniq(c=>puzzle.grid[r][c]))return false;
  for(let c=0;c<n;c++)if(!uniq(r=>puzzle.grid[r][c]))return false;
  for(let br=0;br<n;br+=bh)for(let bc=0;bc<n;bc+=bw){
    const s=new Set();
    for(let r=br;r<br+bh;r++)for(let c=bc;c<bc+bw;c++){const v=puzzle.grid[r][c];if(v<1||v>n||s.has(v))return false;}
  }
  return true;
}
function checkSudokuDone(){ // 完成自动校验：终盘合法→胜利，否则错格闪红 1s
  const pz=PUZZLES[puzzle.idx];
  let full=true,wrong=0;
  for(let r=0;r<pz.size;r++)for(let c=0;c<pz.size;c++){
    const v=puzzle.grid[r][c];
    if(!v)full=false;
    else if(v!==pz.sol[r][c])wrong++;
  }
  if(full&&sudokuGridSolved(pz))winPuzzle(); // v7.4：判定改「对规则」而非「对答案」——多解题填出合法终盘也算过
  else if(full&&wrong>0)puzzle.err=1;
}
function puzzleHint(){ // v7.4：H 键提示——按「光标格优先」修正一格正解（无限次，保证不会做也能过）
  // v7.5：每次 -1 金币（有金币才扣；金币 <=0 仍照给、不欠账——无限次/永不阻断的语义不变）
  if(puzzle.view||puzzle.done)return;
  const pz=PUZZLES[puzzle.idx];if(!puzzleOk(pz))return;
  const s=pz.size;
  const good=(r,c)=>pz.type==='nono'
    ?(((pz.pic[r][c]||'.')==='#')===(puzzle.grid[r][c]===1))
    :(puzzle.grid[r][c]===pz.sol[r][c]);
  let r=puzzle.cur.y,c=puzzle.cur.x;
  if(good(r,c)){ // 光标格已正确 → 全盘找第一个错格/空格
    let found=false;
    outer:for(let rr=0;rr<s;rr++)for(let cc=0;cc<s;cc++)if(!good(rr,cc)){r=rr;c=cc;found=true;break outer;}
    if(!found)return; // 全盘已对（正常流已被 winPuzzle 拦下，这里只防御）
    puzzle.cur={x:c,y:r};
  }
  if(pz.type==='nono')puzzle.grid[r][c]=((pz.pic[r][c]||'.')==='#')?1:0;
  else puzzle.grid[r][c]=pz.sol[r][c];
  // v7.5 扣费：确认真要揭示一格之后才结算（上面各 return 分支不扣）。有金币才扣，扣到 0 为止，
  // 绝不为负；0 金币时照样给提示（不阻断、不欠账），只把浮字换成「免费」提示。
  if(game.coins>0){game.coins-=1;_bagFloat('-1 金币','#f8d048',0,70,46);} // 浮字复用金币拾取色（金 #f8d048）
  else _bagFloat('免费提示','#8ad8a0',0,70,46); // 0 金币照给：不欠账，只提示这次没扣
  game.sfxQueue.push('coin'); // 与金币拾取同一条音效通道（step() 统一出队 → SFX.coin）
  puzzle.hintN++;puzzle.err=0;
  if(pz.type==='nono')checkNonoDone();else checkSudokuDone();
}
function puzzleRuleDismiss(){ // v7.6：规则卡关闭——本类型一次性教学记为已看，本次进入不再重复弹出
  puzzle.ruleOn=false;puzzle.ruleT=0;
  if(puzzle.type)puzzle.ruleSeen[puzzle.type]=true;
}
function stepPuzzleInput(dt){ // 覆盖层输入：方向/J/K/R/H/Esc/数字键（工单 §界面①②③）
  if(puzzle.err>0)puzzle.err=Math.max(0,puzzle.err-dt);
  if(puzzle.done){ // 已解开：2s 自动关层（Esc 可提前；关层后世界恢复，烟花粒子在场景中绽放）
    if(hit('back'))closePuzzle();
    else{puzzle.doneT-=dt;if(puzzle.doneT<=0)closePuzzle();}
    return;
  }
  if(puzzleSkip){puzzleSkip=0;return;}
  // v7.6：规则卡显示期间独占输入——任意键（含 Esc）只关卡、不透传给棋盘（否则玩家在看不见棋盘的
  // 情况下误操作）；8s 超时自动关（绝不卡死）。放在 puzzleSkip 之后：开层那一键不会立刻把卡关掉。
  if(puzzle.ruleOn){
    puzzle.ruleT-=dt;
    // v7.9：Esc 在规则卡上 = 直接退出谜题层（Esc 的语义是"出去"，不是"开始"）。
    // 此前 Esc 只收卡片、要按两次才离开；而覆盖层冻结世界时 deadT 也不推进，玩家若在开层期间
    // 死亡（例如被陷阱推入实心），第一次 Esc 只收卡片会让尸体一动不动地停在盘面上，看着像卡死。
    if(hit('back')){puzzleRuleDismiss();closePuzzle();return;}
    let anyKey=false;
    for(const k in pressed)if(pressed[k]){anyKey=true;break;}
    if(puzzle.ruleT<=0||anyKey)puzzleRuleDismiss();
    return;
  }
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
  if(hit('puzzleHint'))puzzleHint();         // v7.4：H 提示一格（无限次）
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
// 注意确认键走 KEYMAP.ok（Enter/Space）而非 confirm——confirm 含 Space/W/↑，W/↑ 在本层是「上移一格」，
// 会一键双响（边移动边装备）。v8.0：由裸 pressed['Enter'] 改为 hit('ok')，补齐 Space 确认。
function bagMove(dx,dy){ // 焦点区内移动（bag 行宽 4 上下 ±4；equip 横移；shard 横移）
  if(bagFocus==='bag')bagSelBag=clamp(bagSelBag+dx+dy,0,11);
  else if(bagFocus==='equip')bagSelEquip=clamp(bagSelEquip+dx,0,2);
  else if(bagFocus==='shard')bagSelShard=clamp(bagSelShard+dx,0,2); // v7.8：碎片栏固定 3 行（槽位 w/h/c），不再是动态桶数
}
function stepBagInput(){
  if(hit('bag')||hit('back')){closeBag();return;}            // B/Esc 关闭（关闭钮=鼠标路径）
  if(pressed['Tab'])bagFocus=bagFocus==='equip'?'bag':bagFocus==='bag'?'shard':'equip'; // Tab 三区循环
  if(hit('left'))bagMove(-1,0);
  if(hit('right'))bagMove(1,0);
  if(hit('up'))bagMove(0,-4);
  if(hit('down'))bagMove(0,4);
  if(hit('ok')){ // v8.0：Enter/Space 均可确认（原裸 pressed['Enter'] 只认回车）
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

// ---------- v7.7 §1 全关开放 + 换色皮肤（掉落 / 装备 / 衣橱输入） ----------
// 锁定判定的唯一出口：渲染（??? / 锁形）与进入（回车 / 双击）都走这里，保证开/关两态永远同步。
function levelLocked(i){return progress.unlockAll!==true&&i+1>progress.unlocked;}      // v7.7：关卡锁
function chapterLocked(ch){return progress.unlockAll!==true&&progress.unlocked<ch.first+1;} // v7.7：章锁
function canEnterLevel(i){return progress.unlockAll===true||i+1<=progress.unlocked;}  // v7.7：可否进入
function toggleUnlockAll(){ // v7.7：开关型（再点一次关闭）；只写 unlockAll，不动 unlocked/stars/puzzles/equip
  progress.unlockAll=!progress.unlockAll;
  saveProgress(progress);
  SFX.select();
}
// v7.7：关卡 idx → 皮肤 id（HERO_SKINS[idx+1]，顺序冻结：L1 草绿 … L16 判官黑）。越界/art 未合入 → null。
function skinForLevel(i){
  if(!(i>=0)||i+1>=SKIN_LIST.length)return null;
  return SKIN_LIST[i+1].id;
}
// v7.7：首次通关掉落——已解锁则不重复掉、不弹提示、返回 null（调用方据此决定是否播反馈）。
// 「全关开放」下直打 L16 只走 idx=15 这一次映射，绝不补发前面关卡的皮肤（掉落只按本次通关关号算）。
function awardSkin(i){
  const id=skinForLevel(i);
  if(!id)return null;
  if(progress.skins.indexOf(id)>=0)return null;
  progress.skins.push(id);
  return id;
}
// v7.7：装备皮肤——未解锁一律拒绝（拒绝音同选关锁 SFX.shot）；成功后落盘 + 浮字反馈。
function equipSkin(id){
  if(progress.skins.indexOf(id)<0){SFX.shot();return false;}
  progress.skin=id;
  saveProgress(progress);
  SFX.select();
  _bagFloat('已装备 · '+skinName(id),'#f8d048',1,VIEW_W/2,214); // 锚在面板底缘内侧（v8.1 面板加高后避开第 4 行格子）
  return true;
}
function openWardrobe(){ // v7.7：仅 title/select 可开（play 态不响应，避免与世界输入交叉）
  if(uiState!=='title'&&uiState!=='select')return;
  heroOpen=false; // v19：衣橱与选角互斥（后开者胜）
  wardrobeOpen=true;wardrobeSel=Math.max(0,skinIdx(progress.skin));SFX.select();
}
function closeWardrobe(){wardrobeOpen=false;}
function stepWardrobeInput(){ // v7.7：面板独占输入（方向选格 / 回车装备 / G·Esc 关闭 / 鼠标等价）
  if(hit('back')||hit('wardrobe')){closeWardrobe();return;}
  const n=SKIN_MAX,cols=6; // 6 列网格：←→ ±1、↑↓ ±6（与渲染 _skinCellXY 同源，越界钳位）
  if(hit('right')&&wardrobeSel<n-1){wardrobeSel++;SFX.select();}
  if(hit('left')&&wardrobeSel>0){wardrobeSel--;SFX.select();}
  if(hit('down')){ // ↓：末行 5 格时从第 11 格落到第 17 格（不是死键）；已在末行则不动
    const t=Math.min(n-1,wardrobeSel+cols);
    if(((t/cols)|0)>((wardrobeSel/cols)|0)){wardrobeSel=t;SFX.select();}
  }
  if(hit('up')&&wardrobeSel-cols>=0){wardrobeSel-=cols;SFX.select();}
  if(hit('ok'))equipSkin(SKIN_LIST[wardrobeSel]?SKIN_LIST[wardrobeSel].id:progress.skin); // v8.0：Enter/Space 均可装备（↑/W 已被选格占用，故不走 confirm）
  if(mouse.click&&hover){
    if(hover.indexOf('skin:')===0){const i=+hover.slice(5);wardrobeSel=i;
      equipSkin(SKIN_LIST[i]?SKIN_LIST[i].id:progress.skin);}
    else if(hover==='skinclose')closeWardrobe();
  }
}

// ---------- v19 §3.1 选角面板（title/select 覆盖层；与衣橱同模式、互斥） ----------
// 几何与 computeHover/renderHeroSelect 同源：面板 42,24,300,190；双卡 126×142 @ y=46（左 52 / 右 206）。
const HERO_PANEL=[42,24,300,190],HERO_CARD_W=126,HERO_CARD_H=142,HERO_CARD_Y=46;
function _heroCardXY(i){return [52+i*154,HERO_CARD_Y];}
function heroFrame(id){ // 内部：选角头像/背包肖像——mge 用 mgIdle1（无皮肤、无装备）；缺素材回落骑士
  if(id==='mage')return SPR.mgIdle1||SPR.heroIdle1;
  return skinIdle1(progress.skin);
}
function openHeroSelect(){ // 仅 title/select 可开；打开即收起衣橱（互斥）
  if(uiState!=='title'&&uiState!=='select')return;
  wardrobeOpen=false;
  heroSel=Math.max(0,HERO_IDS.indexOf(progress.hero));
  heroOpen=true;SFX.select();
}
function closeHeroSelect(){heroOpen=false;}
function confirmHero(){ // 确认并落盘（下一关 startLevel 才注入 game.hero——面板写明「下一关生效」）
  const id=HERO_IDS[heroSel]||'knight';
  if(progress.hero!==id){progress.hero=id;saveProgress(progress);}
  SFX.select();
}
function stepHeroInput(){ // 面板独占输入（←→ 选卡 / Enter·Space 确认 / C·Esc·X 关闭 / 鼠标等价）
  if(hit('hero')||hit('back')||pressed['KeyX']){closeHeroSelect();return;}
  if(hit('left')){heroSel=clamp(heroSel-1,0,HERO_IDS.length-1);SFX.select();}
  if(hit('right')){heroSel=clamp(heroSel+1,0,HERO_IDS.length-1);SFX.select();}
  if(hit('ok'))confirmHero(); // v8.0 键位等价：Enter/Space（↑/W 不参与，防与导航双响）
  if(mouse.click&&hover){
    if(hover.indexOf('hero:')===0){heroSel=+hover.slice(5);confirmHero();} // 点卡=选中并确认
    else if(hover==='heroclose')closeHeroSelect();
  }
}

function startLevel(idx){
  // v19 §3.2：注入当前英雄必须在 loadLevel 之前（engine 由此决定 4/5 血与法力上限）。
  // HERO_DEBUG=调试参数 ?hero=（boot 里校验过）；正式路径只认存档 progress.hero。
  game.hero=HERO_DEBUG||(progress.hero==='mage'?'mage':'knight');
  loadLevel(idx,false);
  uiState='play';game.state='play';
  hintT=3.0;lastLevelIdx=idx;menuSel=idx; // v8.0：提示条显示 3 秒（最后 1 秒渐隐）
  themeArt=buildThemeArt(ALL_LEVELS[idx].theme); // v7 §9.1：LEVELS→ALL_LEVELS（聚合视图）
  fade=1;fadeDir=-1;
  // v2 P1：进关清残留输入锁存，防止上一状态的边沿在新关卡被缓冲触发
  game.input.jumpHit=0;game.input.attackHit=0;game.input.dashHit=0;
  game.input.skillUHit=0;game.input.skillIHit=0;game.input.skillOHit=0; // v3 §A：技能边沿同清，防 stale
  game.input.skillLHit=0; // v6 §A.3：L 槽边沿同清（引擎未合入时无害）
  ghosts.length=0;comboPop=0;lastCombo=0;
  // v4：谜题覆盖层复位（解题进度仅本关内保留，重进关卡重置——工单 §玩法设计）
  puzzle.open=false;puzzle.idx=0;puzzle.grid=null;puzzle.given=null;puzzle.cur={x:0,y:0};
  puzzle.err=0;puzzle.done=false;puzzle.view=false;puzzleRep=0;puzzleSkip=0;puzzle.hintN=0;
  game.puzzleActive=false;
  // v6 §D2/§E：引导状态随关重置（O 大提示每关一次；速降 toast 计时清零）；v8.0 起技能条计时已删除
  oHintDone=false;oHintT=0;
  fallT=0;fallToastT=0;
  // v4 §界面⑥：engine loadLevel 清空 solvedPuzzles 后，由 ui 从本地存档回填已解神龛
  game.solvedPuzzles=Object.assign({},progress.puzzles||{});
  // v11 §任务5：封印的谜题线由引擎读 game.solvedPuzzles[神龛idx] 判定，而玩家的解谜记录在
  // localStorage（progress.puzzles）。上面那行是整体回填，这里再按「本关神龛」逐座显式兜一次：
  // 重玩同一关时若引擎在 loadLevel 里重建过 solvedPuzzles，本关谜题会被判成未解 →
  // 封印只剩打怪/捡钱两条路（上一轮解过的玩家被迫重做），体验割裂。幂等，不写存档。
  if(game.level&&game.level.shrines)for(const sh of game.level.shrines)
    if(progress.puzzles&&progress.puzzles[sh.idx]){
      game.solvedPuzzles=game.solvedPuzzles||{};
      game.solvedPuzzles[sh.idx]=true;
    }
  // v11 §任务1：封印本地计时复位——重进关卡不残留上一局的碎裂动画/进关提示；
  // _sealWasOpen 初值取当前 open（进关时若已解，不补播一次碎裂）。
  sealOpenT=-1;_sealWasOpen=!!(game.seal&&game.seal.open);_sealLastTick=-1;
  sealHintT=0;sealHintArmed=false;
  // v7.4 护栏③：谜题数据不可玩的神龛按「已解」处理（只在本次会话生效，不写存档、不发奖）——
  // 否则 v7.3 谜题门会要求玩家解一道根本不存在的题，整关永久锁死。
  for(const sh of (game.level.shrines||[]))
    if(!puzzleShrineUsable(sh.idx)){
      game.solvedPuzzles[sh.idx]=true;
      console.warn('[puzzle] 神龛 '+sh.idx+' 的谜题数据不可玩，已 fail-open 按已解处理');
    }
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

// ---------- v8.0 §任务1：L1 操作提示常驻天空层 ----------
// 用户诉求「第一关的提示应该放在背景上，这样能一直看」：原来每关开头只有 3 秒底部黑条（hintT=3.0），
// 新玩家还没看清就没了，而且底条压在画面上会挡地面/敌人。L1 改为把提示写进**背景层**：
//   调用点在 drawParallax 之后、世界 ctx.translate 之前 → 屏幕坐标系，不随相机滚动、不随震屏抖动，
//   也不与地面/敌人/玩家重叠（L1 天空 y=40~82 是空的：顶栏 0~30 是 HUD，地面顶边 y=192）。
// 样式：低透明度暖白/淡金（0.50~0.62），像「贴在天空上的手写字」，不抢主体；中文/箭头走 drawCNText
// （系统字体，←→·/ 等符号均有字形，不会画成空白）。其他关卡（levelIdx!==0）本函数直接返回，仍走底部 3 秒条。
const L1_HINT1='←→ 或 A D 移动 · 空格 / W 跳跃 · J 攻击 · K 冲刺'; // 行1：键位（实测 _textW=288px @11 < 可用 360）
const L1_HINT2='长按跳跃键跳更高 · 收集金币 · 抵达终点旗';         // 行2：目标（_textW=203px @10 < 360）
const L1_HINT3='本关藏有谜题神龛 · 寻找金色光柱';                  // 行3：谜题指引（_textW=141px @9 < 360）
// v8.0 修「三行太淡」：浅蓝天空+白云上纯色半透明字对比不足（第三行金字几乎看不见）——先按 (+1,+1)
// 偏移画一遍深色投影再画正色，字缘有暗边就够读，仍是半透明「贴在背景上」的质感而不是实心白字。
// 投影色取 0.9 让「字透明度 × 0.9」后仍落在 0.45~0.56（≈0.55 直接乘会被再衰减到 0.28，白云上等于没有投影）。
function _cnShadow(str,x,y,px,align){
  drawCNText(str,x+1,y+1,px,'rgba(10,20,40,0.9)',align);
}
function renderL1SkyHint(){
  if(uiState!=='play')return;                 // 只在 play 态画（结算/选关等界面有自己的面板）
  if(game.levelIdx!==0)return;                // 仅 L1 常驻；其余关卡保持 3 秒底部条（原行为不变）
  const L=game.level;if(!L)return;
  if(_sealPanelNear())return;                 // v11：跑到终点附近时让位给封印条件面板（同区域会叠字）
  ctx.save();
  // v8.0 修「太淡」：透明度按实机目检上调 行1 0.40→0.58 / 行2 0.36→0.50 / 行3 0.42→0.62，
  // 每行先投影后正色（投影不改变 x/y 布局，三条文案坐标与宽度断言全部不变）。
  ctx.globalAlpha=0.58;                       // 行1：暖白 0.58（投影后仍半透明，不遮天光）
  _cnShadow(L1_HINT1,VIEW_W/2,42,11,'center');
  drawCNText(L1_HINT1,VIEW_W/2,42,11,'#ffffff','center');
  ctx.globalAlpha=0.50;                       // 行2：淡金 0.50（比行1 弱一档，形成层级）
  _cnShadow(L1_HINT2,VIEW_W/2,57,10,'center');
  drawCNText(L1_HINT2,VIEW_W/2,57,10,'#f8e8b0','center');
  // 谜题指引并入第三行（比「底部条只留这一行」更清爽：提示只有一处、不出现上下两块浮字）
  if(L.shrines&&L.shrines.length&&L.shrines[0]&&!isPuzzleSolved(L.shrines[0].idx)){
    ctx.globalAlpha=0.62;                     // 行3：金色提亮到 #ffe9a0 + 0.62（原 #f8d048@0.42 在浅蓝上几乎不可见）
    _cnShadow(L1_HINT3,VIEW_W/2,71,9,'center');
    drawCNText(L1_HINT3,VIEW_W/2,71,9,'#ffe9a0','center');
  }
  ctx.globalAlpha=1;
  ctx.restore();
}

let hover=null;        // 当前帧悬停目标 id（step() 消费鼠标点击时读上一渲染帧的值，一帧延迟无碍）
let selClickTick=-999; // §A.4 选关卡双击计时（单击选中、双击=进入；单位=game.tick）
const SK_SLOT_KEYS=['skillU','skillI','skillO','skillL']; // §A.3 槽位 i → 输入边沿键（与键盘 hit() 同管线）
// v7.7：衣橱面板几何（渲染与悬停同源，避免两处漂移）——面板 42,24,300,172；6 列 × 3 行、
// 格 40×36、pitch 46×38；17 格末格右缘 318 / 末行下缘 164，均在面板内留 4~8px 呼吸，不压边框。
const WD_PANEL=[42,24,300,212],WD_CELL=[40,36],WD_X0=48,WD_Y0=52,WD_PX=46,WD_PY=38,WD_COLS=6; // v8.1：19 套 → 6×4 网格，面板加高 40
function _skinCellXY(i){return [WD_X0+(i%WD_COLS)*WD_PX,WD_Y0+((i/WD_COLS)|0)*WD_PY];}
function computeHover(){
  hover=null;
  if(!mouse.inside)return;
  const mx=mouse.x,my=mouse.y;
  if(heroOpen&&(uiState==='title'||uiState==='select')){ // v19：选角面板独占悬停（卡优先于关闭钮）
    for(let i=0;i<HERO_IDS.length;i++){const xy=_heroCardXY(i);
      if(ptIn(mx,my,xy[0],xy[1],HERO_CARD_W,HERO_CARD_H)){hover='hero:'+i;break;}}
    if(!hover&&ptIn(mx,my,322,28,12,12))hover='heroclose';
    return;
  }
  if(wardrobeOpen&&(uiState==='title'||uiState==='select')){ // v7.7：衣橱面板独占悬停（格优先于关闭钮）
    for(let i=0;i<SKIN_MAX;i++){const xy=_skinCellXY(i);
      if(ptIn(mx,my,xy[0],xy[1],WD_CELL[0],WD_CELL[1])){hover='skin:'+i;break;}}
    if(!hover&&ptIn(mx,my,322,28,12,12))hover='skinclose';
    return;
  }
  if(uiState==='title'){ // §A.4：title 开始钮（键盘等价=回车）
    if(ptIn(mx,my,VIEW_W/2-52,146,104,22))hover='titleStart';
    else if(ptIn(mx,my,140,110,104,18))hover='titleUnlock';  // v7.7：全关开放开关（键盘等价=F）
    else if(ptIn(mx,my,250,110,72,18))hover='titleWardrobe'; // v7.7：衣橱入口（键盘等价=G）
    else if(ptIn(mx,my,328,110,50,18))hover='titleHero';     // v19：角色入口（键盘等价=C）
  }else if(uiState==='select'){ // §A.4：选关卡（键盘等价=方向+回车）；v7 §9.2：章节布局矩阵（与渲染同源 _chapters）
    if(ptIn(mx,my,252,20,60,13)){hover='menuHero';return;}     // v19：选关屏角色入口（键盘等价=C）
    if(ptIn(mx,my,316,20,62,13)){hover='menuWardrobe';return;} // v7.7：选关屏衣橱入口（键盘等价=G）
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
      if(!hover&&ptIn(mx,my,300,138,36,14))hover='btn:equip';
      if(!hover&&ptIn(mx,my,300,154,36,14))hover='btn:salvage';
      if(!hover&&ptIn(mx,my,300,170,36,14))hover='btn:upgrade';
      if(!hover&&ptIn(mx,my,344,10,10,10))hover='btn:close';
    }else{ // 设计书 §4.2 表序=优先级（hearts 先于 bossbar，二者相交）
      for(let i=0;i<4;i++)if(ptIn(mx,my,162+i*22,198,16,16)){hover='skill:'+i;break;}
      if(!hover&&ptIn(mx,my,1,16,104,14))hover='hearts';           // §C 新 9 心面板
      const b=game.boss;
      if(!hover&&b&&b.state!=='dormant'&&ptIn(mx,my,128,16,174,22))hover='bossbar'; // v7.9：名字行+血条整块（条下移到 y=29）
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

  if(uiState==='title'||uiState==='select'){
    renderMenu(th,tick);
    if(heroOpen)renderHeroSelect(tick);        // v19：选角面板（与衣橱互斥，绝不重叠）
    else if(wardrobeOpen)renderWardrobe(tick); // v7.7：衣橱面板覆盖在封面/选关之上（仅这两态可开）
  }
  else if(L){
    // 天空
    const grad=ctx.createLinearGradient(0,0,0,VIEW_H);
    grad.addColorStop(0,th.skyT);grad.addColorStop(1,th.skyB);
    ctx.fillStyle=grad;ctx.fillRect(0,0,VIEW_W,VIEW_H);
    // 视差
    drawParallax(themeArt.bg,camX,camY);
    // v8.0 §任务1：L1 操作提示画在视差背景之上、世界 translate 之前——屏幕坐标（不随相机/震屏），
    // 且在瓦片/实体之前绘制，天然不会盖住地面与敌人（HUD 只占 0~30，与 42~82 不重叠）。
    renderL1SkyHint();
    ctx.save();
    ctx.translate(px(-camX+sx),px(-camY+sy));
    renderDecor(L,tick);
    renderTiles(L,tick);
    renderShrines(L,tick); // v4 §界面④：谜题神龛（未解=暗色石碑+?，已解=点亮+顶部谜底缩略图）
    renderSeal(L,tick);    // v11 §任务1/§任务2：终点封印光罩 + 条件面板（在旗之前画，旗压在光罩上透出来）
    renderEntities(L,tick);
    /* v13.1：幻影必须先画（下层），真身后画（上层）——
       否则三具剪影把真身盖住，「有眼睛的那个是真的」这条唯一线索就看不见了 = 只能靠猜。 */
    renderHazardsUnder(tick);
    renderBoss(tick); // v3 §B1：Boss 部件装配（renderEntities 后、renderPlayer 前）
    // v10 §任务1/§任务4：五种 Boss 危险物（世界坐标，实体层之上、renderParts 之前）。
    // 调用点定在 renderBoss 之后而不是 renderEntities 里紧跟 game.waves：Boss 是在 renderEntities
    // 之后单独绘制的，若危险物紧跟 waves 会被随后画出的 Boss 整只盖住（实测陨石落到 Boss 身前直接消失，
    // 而「看不见」在这个 Boss 战里等于赖皮）。放在这里＝盖住 Boss、仍压在玩家之下（玩家永远看得见自己）。
    // camX/camY 传 0——当前已在 render() 的 translate(-cam) 世界空间内，相机偏移由 ctx 变换承担；
    // 若将来挪到屏幕空间调用，传 game.cam.x/y 即可，内部统一按 px(h.x-camX) 换算，不必改实现。
    renderHazards(tick,0,0);
    renderGhosts();   // v2 P1：冲刺残影（玩家之下层）
    renderSpeedLines(); // v5 §B：冲刺爆发段速度线（renderGhosts 之后、renderPlayer 之前）
    renderPlayer(tick);
    renderSlash();    // v2 P1：挥击弧光（玩家之上层；v5 §C 升级四帧时间轴）
    renderShots();    // v19：法师远程弹体（世界空间；骑士无 shots，空转）
    renderParts();    // v5 §F：流光粒子（按速度量化细长条）
    renderScars();    // v5 §A：陨石爆坑（renderParts 之后追加三渲染）
    renderFx();       // v5 §A：UI 层演出粒子（star/shard/ring）
    renderFloats();   // v5 §A：浮动文字（伤害/金币/KO）
    renderPuzzleHint(tick); // v4 §界面④：puzzleNear 时头顶浮动"↑ 解谜/查看"提示（世界坐标最上层）
    ctx.restore();
    renderDarkness(tick); // v7 §9.7：黑暗层（nether 专属；世界渲染完成后、HUD 前）
    renderLedgeGlow(tick); // v8.0：暗处可落脚平台顶边自发光（必须在黑暗层之后，否则被压暗）
    // v12 §任务7：quell 全屏爆闪（b.quellFlash 由引擎 0.4→0 递减）。插在 HUD 之前：
    // 盖住世界但**不盖 HUD**（血条/心形读数在爆闪中仍可读），且远早于 renderPause（暂停面板绝不会被挡）。
    {
      const qf=+(game.boss&&game.boss.quellFlash)||0;
      if(qf>0){
        ctx.setTransform(1,0,0,1,0,0);
        ctx.globalAlpha=1;ctx.fillStyle='rgba(248,80,48,'+(0.35*clamp(qf/0.4,0,1)).toFixed(3)+')';
        ctx.fillRect(0,0,VIEW_W,VIEW_H);
      }
    }
    renderHUD();
    renderIntro();  // v3 §D1：登场横幅（intro 态）
    renderUlt();    // v5 §D：O 流星连斩 1.2s 演出覆盖层（屏幕坐标系，renderFlash 之前）
    renderFlash();  // v3 §D2：流星连斩全屏演出（flashT>0）
    if(hintT>0&&uiState==='play'&&game.levelIdx!==0){ // v8.0：L1 的提示已改常驻天空层（renderL1SkyHint，
      // 含谜题指引第三行），故 L1 不再出这条 3 秒底条，避免同一段文案上下各画一遍；其他关卡不变。
      const a=Math.min(1,hintT); // v8.0：hintT 由 3.0 递减 → 最后 1 秒 1→0 渐隐（globalAlpha 同时作用于底条与文字）
      ctx.globalAlpha=a;
      // v8.0：底条宽度按文案自适应（两侧 8px padding，居中，夹在视口内）——原固定 220px 会让 L17 的
      // 34 字提示左右各溢出 ~77px，看起来像"横贯全屏的黑底+溢出文字"。
      const hw=Math.min(VIEW_W,_textW(L.meta.hint,11)+16);
      // v8.0 修「金行被底条压掉」：drawCNText 是 textBaseline='top'（y=字顶，不是基线），原底条面板
      // 178..192 与金行 168..177 只差 1px，抗锯齿下就是叠字。底条整体下移到 182..196（VIEW_H-42），
      // 金行上移 2px 到 166..175（VIEW_H-58）→ 间距 7px；底条底边 196 也躲开技能槽描边（197.5 起，
      // 槽 y=198 不是任务书假设的 VIEW_H-22），面板填充不会盖住槽顶边。文字随面板下移到 183（面板内居中）。
      _panel(px((VIEW_W-hw)/2),VIEW_H-42,px(hw),14,{alpha:0.55,cut:2}); // v5 §A-6：hint 底条切角面板
      drawCNText(L.meta.hint,VIEW_W/2,VIEW_H-41,11,'#ffffff','center');
      // v6 §F.3：本关有未解神龛时 hint 条上方追加指引行（ui 本地判断，不动 levels.js hint 文本；
      // 设计书 §5.3 超集口径：任何有未解神龛的关卡都提示，含 L8/L9/L10）
      // v11：封印提示占用同一行（两者都提神龛，同屏叠字最糊）——封印提示在场时让位 2 秒
      if(L.shrines&&L.shrines.length&&L.shrines[0]&&!isPuzzleSolved(L.shrines[0].idx)&&sealHintT<=0)
        drawCNText('本关藏有谜题神龛 · 寻找金色光柱',VIEW_W/2,VIEW_H-58,9,'#f8d048','center');
      ctx.globalAlpha=1;
    }
    // v11 §任务3：进关 2 秒封印提示条（不选常驻 HUD 进度条的理由见交付报告：顶部 16~26 已被心形/
    // 金币/神龛徽记占满，128~302 的细条会横穿神龛徽记行，且三段色块说不出「要几个」；提示条能一次把
    // 三条线连同数字讲清，正好覆盖「一进关就知道有目标」）。数字直接写在句子里，与 renderClear 同口径。
    if(sealHintT>0&&uiState==='play'&&game.seal&&game.seal.open===false){
      const stxt=_sealHintText(game.seal);
      if(stxt){
        ctx.globalAlpha=Math.min(1,sealHintT);   // 尾 1 秒渐隐
        // v11 修：两行排版（标题 + 明细）。面板宽取两行里较宽的那行 +16 内边距，仍夹在视口内。
        const hw=Math.min(VIEW_W-8,Math.max(Math.ceil(_textW(stxt[0],9)),Math.ceil(_textW(stxt[1],9)))+16);
        const hx=px((VIEW_W-hw)/2);
        // v11 修：位置从 VIEW_H-84 抬到 VIEW_H-140。原来贴底画，正好落在地面瓦片带上——
        // 紫色半透明面板叠在棕色土块纹理上，9px 淡紫字实机几乎读不出来（截图确认）。
        // 抬进天空区后与地面完全分离；L1 的常驻背景提示占 y=42~82，本面板 84~110 不重叠。
        _sealPanelBg(hx,VIEW_H-140,px(hw),26,false);
        drawCNText(stxt[0],VIEW_W/2,VIEW_H-137,9,'#f0e6ff','center');
        drawCNText(stxt[1],VIEW_W/2,VIEW_H-126,9,'#d8c4f8','center');
        ctx.globalAlpha=1;
      }
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
    if(d.got||d.dead)continue;   // v17：已捡（水晶）/已碎（石桶瓮骨）的装饰不再画——交互后要消失
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
      case 'B':{ // v7.6 P0：「木箱隐形墙」——'B' 在引擎 solid() 里是实心瓦片（攻击命中→'.'+1 金币），
        // 此前 switch 漏了这一支，画面上完全不绘制=玩家眼里一面看不见的墙（16 关共 80 处）。
        // 素材：art.js buildThemeArt 无条件产出 tiles.breakBrick（12 主题全覆盖，木箱棕色+X 斜撑+
        // 裂纹，与普通砖 '#' 的石质/主题母题区分明显，故不再叠额外装饰）。
        // 兜底：旧美术/裁剪主题缺该键时回落主题 block + 深色裂纹暗记（写法与上方 'G' 一致）。
        if(T.breakBrick)ctx.drawImage(T.breakBrick,dx,dy);
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
    }else if(e.type==='beetle'){ // v8.0 §任务3①：甲虫（SPR.beetle[2] 14×12 基准面左，face>0 flipCache；
      // 帧=(e.t*8|0)%2，wind 蓄力=帧 1 + 1px 上下抖动（预备冲撞的视觉预警）；SPR 缺失→暗红甲壳矩形+双颚兜底）
      const wind=e.ai&&!e.dead&&e.ai.st==='wind';
      let img=null;
      if(e.dead>0){if(SPR.beetleDead)img=SPR.beetleDead;}                  // 死亡帧（缺素材走下方兜底）
      else if(SPR.beetle){const f=SPR.beetle[wind?1:((e.t||0)*8|0)%2];if(f)img=f;}
      if(img&&!e.dead&&e.flashT>0)img=whiteOf(img);                        // 受击闪白（尸体不闪）
      if(img&&!e.dead&&e.face>0)img=flipCache(img);                        // 朝右=翻转（与 mage/knight 同模式）
      if(img)_drawNewEnemyImg(img,e,jit,fadeA,((e.w||img.width)-img.width)/2,wind?((game.tick>>2)&1):0,'foot');
      else{ctx.globalAlpha=fadeA;
        ctx.fillStyle='#7a3a48';ctx.fillRect(px(e.x+jit),px(e.y+3),e.w,e.h-3);      // 甲壳
        ctx.fillStyle='#a85a68';ctx.fillRect(px(e.x+1+jit),px(e.y+4),e.w-2,2);      // 背脊高光
        ctx.fillStyle='#4a2430';ctx.fillRect(px(e.x+1+jit),px(e.y+e.h-2),2,2);      // 足
        ctx.fillRect(px(e.x+e.w-3+jit),px(e.y+e.h-2),2,2);
        if(!e.dead){ctx.fillStyle='#f0e0c0';ctx.fillRect(px(e.x+(e.face>0?e.w-2:0)+jit),px(e.y+1),2,2);} // 颚
        ctx.globalAlpha=1;}
    }else if(e.type==='spitter'){ // v8.0 §任务3②：吐弹花（SPR.spitter[2] 14×16 站桩植物，不翻转；
      // 帧=(e.t*4|0)%2，cast 吐弹 0.4s=花苞张大（中心锚定 ×1.15，照 jelly 的缩放写法）；
      // SPR 缺失→深绿茎+亮绿花苞+金花心兜底）
      const cast=e.ai&&!e.dead&&e.ai.st==='cast';
      let img=null;
      if(e.dead>0){if(SPR.spitterDead)img=SPR.spitterDead;}
      else if(SPR.spitter){const f=SPR.spitter[((e.t||0)*4|0)%2];if(f)img=f;}
      if(img&&!e.dead&&e.flashT>0)img=whiteOf(img);
      if(!img){ctx.globalAlpha=fadeA;
        ctx.fillStyle='#2e6a3e';ctx.fillRect(px(e.x+e.w/2-1+jit),px(e.y+8),2,e.h-8);   // 茎
        ctx.fillStyle='#4aa85a';ctx.fillRect(px(e.x+jit),px(e.y+2),e.w,7);             // 花苞
        ctx.fillStyle='#7ad06a';ctx.fillRect(px(e.x+1+jit),px(e.y+3),e.w-2,2);         // 苞顶高光
        if(!e.dead){ctx.fillStyle='#f8d048';ctx.fillRect(px(e.x+e.w/2-1+jit),px(e.y+5),2,2);} // 花心
        ctx.globalAlpha=1;
      }else if(cast){
        ctx.globalAlpha=fadeA;
        ctx.save();ctx.translate(px(e.x+e.w/2+jit),px(e.y+e.h/2));ctx.scale(1.15,1.15);
        ctx.drawImage(img,-img.width/2,-img.height/2);ctx.restore();
        ctx.globalAlpha=1;
      }else _drawNewEnemyImg(img,e,jit,fadeA,((e.w||img.width)-img.width)/2,0,'foot');
    }else if(e.type==='hopper'){ // v8.0 §任务3③：跳蚤（SPR.hopper[2] 12×12 基准面左，face>0 flipCache；
      // idle=帧 0；crouch=帧 1 + 脚底锚定压扁 0.8；air=帧 1 + 脚底锚定拉伸 1.15；
      // SPR 缺失→土黄身体+深色后腿兜底）
      const st=e.ai&&!e.dead?e.ai.st:'idle';
      let img=null;
      if(e.dead>0){if(SPR.hopperDead)img=SPR.hopperDead;}
      else if(SPR.hopper){const f=SPR.hopper[st==='idle'?0:1];if(f)img=f;}
      if(img&&!e.dead&&e.flashT>0)img=whiteOf(img);
      if(img&&!e.dead&&e.face>0)img=flipCache(img);
      if(!img){ctx.globalAlpha=fadeA;
        ctx.fillStyle='#c8a028';ctx.fillRect(px(e.x+1+jit),px(e.y+3),e.w-2,e.h-5);     // 身体
        ctx.fillStyle='#e8c850';ctx.fillRect(px(e.x+2+jit),px(e.y+4),e.w-4,2);         // 背脊
        if(!e.dead){ctx.fillStyle='#6a5410';ctx.fillRect(px(e.x+(e.face>0?e.w-4:2)+jit),px(e.y+3),2,2); // 眼
          ctx.fillStyle='#8a7018';ctx.fillRect(px(e.x+jit),px(e.y+e.h-3),3,3);         // 后腿
          ctx.fillRect(px(e.x+e.w-3+jit),px(e.y+e.h-3),3,3);}
        ctx.globalAlpha=1;
      }else{
        const sy=st==='crouch'?0.8:st==='air'?1.15:1;    // 蓄力压扁 / 滞空拉长（脚底为锚点，不悬空）
        if(sy!==1){ctx.globalAlpha=fadeA;
          ctx.save();ctx.translate(px(e.x+e.w/2+jit),px(e.y+e.h));ctx.scale(1,sy);
          ctx.drawImage(img,-img.width/2,-img.height);ctx.restore();
          ctx.globalAlpha=1;}
        else _drawNewEnemyImg(img,e,jit,fadeA,((e.w||img.width)-img.width)/2,0,'foot');
      }
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
  /* v19.3：霜爆新星冻结——冰壳单独走第二遍画在敌人之上，避免嵌进上面 9 个 type 分支里各改一次。
     读数：半透明冰蓝块 + 1px 亮边 + 两粒高光；末 0.2s 加速闪（要解冻了）。 */
  for(const e of L.enemies){
    if(!(e.freezeT>0)||e.dead>0)continue;
    const fx=px(e.x)-1,fy=px(e.y)-1,fw=e.w+2,fh=e.h+2;
    ctx.globalAlpha=e.freezeT<0.2?((tick>>1)%2?0.12:0.26):0.22;   // 填充压到 0.22：再浓就把里面的敌人涂层白
    ctx.fillStyle='#9ae0ff';ctx.fillRect(fx,fy,fw,fh);
    ctx.globalAlpha=0.95;ctx.fillStyle='#e8fbff';                 // 亮边（主要辨识靠它）
    ctx.fillRect(fx,fy,fw,1);ctx.fillRect(fx,fy+fh-1,fw,1);
    ctx.fillRect(fx,fy,1,fh);ctx.fillRect(fx+fw-1,fy,1,fh);
    ctx.globalAlpha=0.75;ctx.fillStyle='#ffffff';                 // 内部两道斜裂纹
    for(let k=0;k<2;k++){const ox=fx+3+k*3,oy=fy+2;
      ctx.fillRect(ox,oy,1,2);ctx.fillRect(ox+1,oy+2,1,2);ctx.fillRect(ox+2,oy+4,1,fh-6);}
    ctx.globalAlpha=0.85;ctx.fillStyle='#ffffff';
    ctx.fillRect(fx+2,fy+2,1,1);ctx.fillRect(fx+fw-3,fy+3,1,1);
    ctx.globalAlpha=1;
  }
  renderWells();      // v19.3：奇点必须画在敌人之后——被吸成一坨的敌人会正好盖住黑洞核心
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
    // v10 §任务1①：冲击波兜底——art 未合入 SPR.waveFx 时旧代码整块 continue，陨石砸地完全没有反馈，
    // 玩家只听到音效、看不到「砸在哪」。改成程序化扩散圆环（半径取 w.r，缺省 10），保证落地永远看得见。
    if(!SPR.waveFx){
      const wr=+w.r||10;
      ctx.globalAlpha=clamp(0.75-wr/40,0.15,0.75);
      ctx.strokeStyle='#f8a030';ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(px(w.x+8),px(w.y+4),wr,0,Math.PI*2);ctx.stroke();
      ctx.globalAlpha=1;continue;
    }
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
  // v8.0：链条 2×2→3×3 并换亮灰、锤头外包 1px 橙红危险框（缓慢呼吸）——
  // L11 是海洋蓝底，12×12 的金框锤和 8×8 的金币在 1× 下几乎同款，玩家分不清
  // 「吃了加分」和「碰到掉血」，这是最糟的一类视觉歧义（实测截图里我会把锤子认成金币）。
  for(const w of L.pends||[]){
    if(w.bx==null||w.by==null)continue;
    ctx.fillStyle='#7a7488';ctx.fillRect(px(w.ax-2),px(w.ay-2),4,4);
    ctx.fillStyle='#b8b0c8';
    for(let i=1;i<=4;i++){const t=i/5;
      ctx.fillRect(px(w.ax+(w.bx-w.ax)*t-1),px(w.ay+(w.by-w.ay)*t-1),3,3);}
    if(SPR.chandBlade)ctx.drawImage(SPR.chandBlade,px(w.bx-6),px(w.by-6));
    else{ctx.fillStyle='#48d8e8';ctx.beginPath();ctx.arc(px(w.bx),px(w.by),5,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#f8d048';ctx.lineWidth=1;ctx.stroke();}
    // 危险框：1px 四边（fillRect 保像素硬边，不用半像素 strokeRect），alpha 0.50~1.00 呼吸——
    // 下限不能再低，实测 0.10 时在海洋蓝底上几乎看不见，等于白加
    ctx.fillStyle='rgba(248,96,56,'+(0.75+0.25*Math.sin(tick*0.16)).toFixed(2)+')';
    const hx=px(w.bx-7),hy=px(w.by-7);
    ctx.fillRect(hx,hy,16,1);ctx.fillRect(hx,hy+15,16,1);
    ctx.fillRect(hx,hy,1,16);ctx.fillRect(hx+15,hy,1,16);
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

/* ============================================================
 * v10 §任务1/§任务4：Boss 危险物渲染（game.hazards 由引擎 v10 产出，UI 只读，一个字段都不改）
 * 调用点：render() 内 renderBoss 之后、renderGhosts/renderPlayer 之前
 *      （=实体层之上、renderParts 之前；为什么不紧跟 game.waves 见调用处注释）。
 * 坐标：本段处于 render() 的 translate(-cam) 世界空间里，屏幕位置 = px(h.x - game.cam.x)，
 *      相机偏移由 ctx 变换承担，故内部按 px(h.x-camX) 换算、当前调用点传 camX=0。
 * 性能：每个元素绘制调用 ≤12 次（陨石预警 6 / 下落 5~11 / 地刺 9~12 / 追踪 8 / 分身 3 / 力场 12）；
 *      拖尾与粒子环全部用固定长度 for 循环按 t 现算，绝不每帧 push 数组或建对象池。
 * 守卫：game.hazards 缺失或空数组 → 整块空转；未知 kind 跳过；
 *      SPR.meteor / SPR.spike / SPR.bossGhost 缺失 → 程序化兜底，绝不抛异常。
 * ============================================================ */
function renderHazardsUnder(tick){ // v13.1：只画需要压在 Boss 身下的危险物（当前只有 mirror）
  const H=game.hazards||[];
  for(let i=0;i<H.length;i++){const h=H[i]; if(h&&h.kind==='mirror')_hzMirror(h,tick,0,0);}
}
function renderHazards(tick,camX,camY){
  const H=game.hazards||[];
  if(!H.length)return;
  const ox=+camX||0,oy=+camY||0;
  for(let i=0;i<H.length;i++){
    const h=H[i]; if(!h)continue;
    if(h.kind==='meteor')_hzMeteor(h,tick,ox,oy);
    else if(h.kind==='spike')_hzSpike(h,tick,ox,oy);
    else if(h.kind==='homing')_hzHoming(h,tick,ox,oy);
    else if(h.kind==='clone')_hzClone(h,tick,ox,oy);
    else if(h.kind==='pull')_hzPull(h,tick,ox,oy);
    else if(h.kind==='ward')_hzWard(h,tick,ox,oy);           // v12 §任务5：quell 结界圈
    else if(h.kind==='pillar')_hzPillar(h,tick,ox,oy);       // v12 §任务5：火柱（预警圈 → 升柱）
    else if(h.kind==='core')_hzCore(h,tick,ox,oy);           // v12 §任务5：核心护盾
    else if(h.kind==='quellBlast')_hzQuellBlast(h,tick);     // v12 §任务5：全屏爆闪（可选 hazard）
    // v13.1：mirror 改由 renderHazardsUnder 画在 Boss 下层，这里跳过（否则重复画两层）
    else if(h.kind==='pushwall')_hzPushwall(h,tick,ox,oy);   // v13 §六：推进墙
    else if(h.kind==='bomb')_hzBomb(h,tick,ox,oy);           // v13 §六：弹跳炸弹
    else if(h.kind==='mist')_hzMist(h,tick,ox,oy);           // v13 §六：水雾区
    else if(h.kind==='totem')_hzTotem(h,tick,ox,oy);         // v16 §三：圣像审判（地面物件，画在上层）
  }
}

// v10 §任务1①：陨石雨——预警期（warnT>0）画「地面收缩红圈 + 半透红填充 + 十字准星」，
// 这是玩家唯一的躲避依据，所以呼吸 alpha 不封顶（0.55~1.0），亮底/暗底都读得出；
// 下落期（warnT<=0）画橙红球 + 4 段固定尾焰（位置按 vy 反推，不存历史帧）。
// 落点：契约只给 (x,y) 没有 groundY，若 y 还在空中（引擎从高处生成），预警圈会飘在天上——
// 故用 _hzGroundAt 沿该列向下找第一块实心瓦，把圈钉在地面上；找不到地面（深坑/无 level）就用 y。
function _hzGroundAt(x,y){
  const L=game.level;
  if(!L||typeof L.solid!=='function'||!(L.tw>0))return y;
  const tx=Math.floor(x/16);
  if(tx<0||tx>=L.tw)return y;
  const t0=Math.floor(y/16);
  for(let ty=t0;ty<=t0+12&&ty<L.th;ty++)
    if(L.solid(tx,ty,game.switchState))return ty===t0?y:ty*16; // y 已在地面内→保持；否则取地面顶
  return y;
}
function _hzMeteor(h,tick,ox,oy){
  const x=px(h.x-ox),r=Math.max(3,+h.r||6),w=+h.warnT||0;
  const y=px(h.y-oy),gy=px(_hzGroundAt(h.x,h.y)-oy);
  if(w>0){
    const k=clamp(w/0.85,0,1),rr=r+r*2*k;              // 引擎预警 0.85s → 圈从 3r 收到 r（收缩即倒计时）
    ctx.globalAlpha=0.55+0.45*Math.sin(tick*0.5);      // 呼吸：让圈在亮地面上也抓眼
    ctx.fillStyle='rgba(248,72,72,0.18)';
    ctx.beginPath();ctx.arc(x,gy,rr,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#f84848';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.arc(x,gy,rr,0,Math.PI*2);ctx.stroke();
    ctx.globalAlpha=1;
    ctx.fillStyle='#ffd0d0';                            // 十字准星（中心 3×3 红点）
    ctx.fillRect(x-rr,gy,rr*2+1,1);ctx.fillRect(x,gy-rr,1,rr*2+1);
    ctx.fillStyle='#f84848';ctx.fillRect(x-1,gy-1,3,3);
    return;
  }
  const vy=+h.vy||180,dir=vy>=0?1:-1;
  for(let i=1;i<=4;i++){                                // 尾焰：固定 4 段，越远越淡越小
    const a=0.42-i*0.09;
    ctx.globalAlpha=a>0.1?a:0.1;
    ctx.fillStyle=i<3?'#f8a030':'#f86030';
    ctx.beginPath();ctx.arc(x,y-dir*i*4,Math.max(1,r*(1-i*0.16)),0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=1;
  if(SPR.meteor&&SPR.meteor[0])ctx.drawImage(SPR.meteor[(tick*10|0)%SPR.meteor.length],x-5,y-6);
  else{                                                 // 兜底：橙红球 + 亮芯（art 未合入时仍是一颗陨石）
    ctx.fillStyle='#c02818';ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#f87030';ctx.beginPath();ctx.arc(x,y,r*0.7,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#ffe0a0';ctx.beginPath();ctx.arc(x-r*0.25,y-r*0.25,r*0.32,0,Math.PI*2);ctx.fill();
  }
  // 可选字段：引擎给落地计时（landT>0）时补一圈扩散环；未给则交给 game.waves（上方已兜底）
  const lt=+h.landT||0;
  if(lt>0){
    ctx.globalAlpha=clamp(0.7-lt*1.4,0,0.7);ctx.strokeStyle='#f8a030';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(x,gy,r+lt*90,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
  }
}

// v10 §任务1②：地刺——契约只给 h（无 w），故 y 视作地面线、尖刺自 y 向上长到 y-h（与「从地面长出来」一致）。
// 冒出前 0.2s（t<0.2）先画地面裂纹 + 呼吸红缝，这是玩家唯一的起跳窗口（h 已开始长的也照画，
// 裂纹与尖刺同帧叠加＝「刚裂开就冒尖」的真实观感，比二选一更早给出信号）。
function _hzSpike(h,tick,ox,oy){
  const x=px(h.x-ox),base=px(h.y-oy),hh=clamp(+h.h||0,0,24),t=+h.t||0;
  if(t<0.2){                                            // 预警：地面裂纹（两段深色碎线 + 中间红缝脉冲）
    ctx.fillStyle='#2a1a1a';
    ctx.fillRect(x-9,base-1,7,1);ctx.fillRect(x+3,base-1,7,1);
    ctx.globalAlpha=0.5+0.5*Math.sin(tick*1.2);
    ctx.fillStyle='#f86040';ctx.fillRect(x-3,base-1,6,1);
    ctx.globalAlpha=1;
  }
  if(hh<=0.5)return;
  if(SPR.spike&&SPR.spike[0]){                          // 有素材：整帧按当前高度纵向压到 20×hh
    const f=SPR.spike[(tick*8|0)%SPR.spike.length];
    ctx.drawImage(f,x-10,base-hh,20,Math.max(1,Math.round(hh)));
  }else{                                                // 兜底：3 根深灰三角（底宽 9、左亮右暗）+ 底部裂纹
    for(let i=0;i<3;i++){
      const sh=hh*(i===1?1:i===2?0.72:0.6);
      if(sh<=0.5)continue;
      const sx=x-5+i*5;                                 // 引擎判定框宽 10（x±5），视觉 19 宽＝略宽于判定，宁可视宽
      ctx.fillStyle='#62627a';
      ctx.beginPath();ctx.moveTo(sx-4.5,base);ctx.lineTo(sx,base-sh);ctx.lineTo(sx+4.5,base);ctx.closePath();ctx.fill();
      ctx.fillStyle='#9a9ab0';
      ctx.beginPath();ctx.moveTo(sx-4.5,base);ctx.lineTo(sx,base-sh);ctx.lineTo(sx-0.8,base);ctx.closePath();ctx.fill();
    }
    ctx.fillStyle='#2a1a1a';ctx.fillRect(x-9,base-1,18,1);   // 根部落影：让尖刺「长在地上」而不是浮着
  }
}

// v10 §任务1③：追踪弹——紫球 + sin(t*10) 脉动光晕 + 4 段拖尾（按速度方向反推，不存历史）+
// 一条指向玩家的半透明细线（「它在追我」必须一眼看出来，否则玩家不知道该横向拉扯）。
function _hzHoming(h,tick,ox,oy){
  // 引擎的追踪弹是 8×8 判定框（x,y=左上角），圆心取 +4——不补这 4px，球的视觉中心会和判定框错开半格。
  const x=px(h.x-ox)+4,y=px(h.y-oy)+4,t=+h.t||0;
  const vx=+h.vx||0,vy=+h.vy||0,d=Math.hypot(vx,vy)||1;
  for(let i=1;i<=4;i++){                                // 拖尾：固定 4 枚渐隐圆
    const a=0.42-i*0.09;
    ctx.globalAlpha=a>0.1?a:0.1;
    ctx.fillStyle='#a050e0';
    ctx.beginPath();ctx.arc(x-vx/d*i*3.5,y-vy/d*i*3.5,Math.max(1,4-i*0.6),0,Math.PI*2);ctx.fill();
  }
  const pr=4+Math.sin(t*10)*1.6;                        // 脉动光晕（半径随存活时间呼吸）
  ctx.globalAlpha=0.32;
  ctx.fillStyle='#c080ff';ctx.beginPath();ctx.arc(x,y,pr+4,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=1;
  ctx.fillStyle='#7a30c0';ctx.beginPath();ctx.arc(x,y,4.5,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#c890ff';ctx.beginPath();ctx.arc(x-1,y-1,2.6,0,Math.PI*2);ctx.fill();
  const p=game.player;
  if(p){                                                // 追人细线（半透明，不抢主体）
    ctx.globalAlpha=0.22;ctx.strokeStyle='#c080ff';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(x,y);
    ctx.lineTo(px(p.x+(p.w||10)/2-ox),px(p.y+(p.h||14)/2-oy));ctx.stroke();
    ctx.globalAlpha=1;
  }
}

// v10 §任务1④：Boss 分身——半透紫剪影（alpha .55，受击闪白读 flashT）+ 头顶「幻」字，
// 与本体一眼可分。SPR.bossGhost 优先（含 .body 部件组或整张画布两种形态），
// 其次借本体 body 做紫色叠色（tintOf 缓存），最后是纯程序化剪影。
function _hzClone(h,tick,ox,oy){
  const w=+h.w||52,hg=+h.h||48,x=px(h.x-ox),y=px(h.y-oy);
  const G=SPR.bossGhost||null;
  // 引擎的分身判定框是本体 0.85 倍且底对齐；贴图仍按本体原尺寸画（不压扁剪影），水平居中 + 脚底对齐。
  const bi=(G&&G.body)?(G.body[0]||G.body):(G&&G.width)?G:(SPR.boss&&SPR.boss.body)?tintOf(SPR.boss.body[0],'#b060f0'):null;
  const ix=bi?px(x+w/2-bi.width/2):x,iy=bi?px(y+hg-bi.height):y;
  ctx.globalAlpha=0.55;
  if(bi)ctx.drawImage(bi,ix,iy);
  else{
    ctx.fillStyle='#8a50d0';ctx.fillRect(x,y+6,w,hg-6);
    ctx.fillStyle='#c8a0ff';ctx.fillRect(x+6,y+14,8,6);ctx.fillRect(x+w-14,y+14,8,6);
  }
  ctx.globalAlpha=1;
  const ft=+h.flashT||0;
  if(ft>0){                                             // 受击闪白（与本体同一套 0.12s 衰减）
    ctx.globalAlpha=clamp(ft/0.12,0,1)*0.8;
    if(bi)ctx.drawImage(whiteOf(bi),ix,iy);             // 有剪影就重画白色版（白方块会糊成一块挡板）
    else{ctx.fillStyle='#ffffff';ctx.fillRect(x,y,w,hg);}
    ctx.globalAlpha=1;
  }
  drawCNText('幻',x+w/2,(bi?iy:y)-12,9,'#c890ff','center'); // 头顶标记：贴贴图顶而非判定框顶（框比贴图矮 7px）
}

// v10 §任务1⑤：吸附力场——以 (cx,cy) 为圆心的半透紫盘 + 虚线边缘 + 10 枚向内流动的粒子
// （半径 = r*(1-f)，f 由 t 推进 → 视觉上「被往里吸」，玩家立刻明白为什么自己在滑）。
// 粒子用 2×2 亮紫方点 + 由外到内递增的 alpha：1× 下实机截图里 1px 圆几乎看不见，方点才有硬边。
function _hzPull(h,tick,ox,oy){
  const cx=px((h.cx!=null?h.cx:h.x)-ox),cy=px((h.cy!=null?h.cy:h.y)-oy);
  const r=Math.max(8,+h.r||48),t=+h.t||0;
  ctx.fillStyle='rgba(176,96,240,0.12)';
  ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=0.75;ctx.strokeStyle='#b060f0';ctx.lineWidth=1;
  if(ctx.setLineDash)ctx.setLineDash([3,3]);            // 虚线边缘（mock/旧环境无此 API 时跳过）
  ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();
  ctx.globalAlpha=0.35;                                 // 内圈虚线：两圈一起才读得出「在往里收」
  ctx.beginPath();ctx.arc(cx,cy,r*0.55,0,Math.PI*2);ctx.stroke();
  if(ctx.setLineDash)ctx.setLineDash([]);
  ctx.globalAlpha=1;
  ctx.fillStyle='#f2e4ff';                              // 近白紫：紫底紫点看不见，亮度必须拉到顶
  for(let i=0;i<9;i++){                                 // 固定 9 枚（2 圈 + 1 盘 + 9 点 = 12 次绘制，正好卡预算）
    const a=i*Math.PI*2/9+t*0.8,f=(t*0.55+i/9)%1,rr=r*(1-f);
    ctx.globalAlpha=0.35+0.6*(1-f);
    ctx.fillRect(px(cx+Math.cos(a)*rr)-1,px(cy+Math.sin(a)*rr)-1,2,2);
  }
  ctx.globalAlpha=1;
}

// v12 §任务5①：quell 结界（ward）——金色光柱 + 底圈，半径直接读 h.r。
// 语义：圈心 = 安全区（站进去不吃全屏 AOE），所以必须比普通红圈「更像庇护所」：金柱向上、不画红色任何东西。
// 绘制预算 ≤10：底圈 2 弧 + 柱体 3 条竖带 + 顶盖 2 条 + 3 枚上升光点。
function _hzWard(h,tick,ox,oy){
  const x=px(h.x-ox),y=px(h.y-oy),r=Math.max(8,+h.r||22);
  const a=0.5+0.5*Math.sin(tick*0.18);
  ctx.globalAlpha=1;ctx.fillStyle='rgba(248,208,72,0.10)';
  ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=0.55+0.35*a;ctx.strokeStyle='#f8d048';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();
  ctx.globalAlpha=0.4;ctx.strokeStyle='#fff0b0';ctx.lineWidth=1;
  if(ctx.setLineDash)ctx.setLineDash([3,3]);
  ctx.beginPath();ctx.arc(x,y,r*0.55,0,Math.PI*2);ctx.stroke();
  if(ctx.setLineDash)ctx.setLineDash([]);
  const cw=Math.max(8,Math.round(r*0.7)),ch=88;
  ctx.globalAlpha=0.10+0.05*a;ctx.fillStyle='#f8d048';ctx.fillRect(x-cw/2,y-ch,cw,ch);
  ctx.globalAlpha=0.18+0.08*a;ctx.fillStyle='#fff0b0';ctx.fillRect(x-cw/4,y-ch,cw/2,ch);
  ctx.globalAlpha=0.5;ctx.fillStyle='#fff8c8';ctx.fillRect(x-1,y-ch,2,ch);
  ctx.globalAlpha=0.65;ctx.fillStyle='#ffffff';
  ctx.fillRect(x-cw/2,y-ch,cw,1);ctx.fillRect(x-cw/2,y-1,cw,1);
  ctx.fillStyle='#fff8c8';
  for(let i=0;i<3;i++){                                   // 上升光点：固定 3 枚，按 tick 错相
    const f=(tick*0.02+i/3)%1;
    ctx.globalAlpha=0.65*(1-f);
    ctx.fillRect(x+(i-1)*5,y-f*ch,2,2);
  }
  ctx.globalAlpha=1;
}

// v12 §任务5②：火柱（pillar）——warnT>0 只画地面红圈 + 收缩倒计时（圈收到最小=起柱）；
// warnT<=0 后 h 从 0 长到 mh，画橙红火柱，底边固定在 h.y（引擎给的 gy），矩形宽 h.w。
function _hzPillar(h,tick,ox,oy){
  const x=px(h.x-ox),base=px(h.y-oy),w=Math.max(4,+h.w||14),wt=+h.warnT||0;
  if(wt>0){
    const wm=+h.warnMax||+h.warn||0.9,k=clamp(1-wt/wm,0,1);
    const r0=Math.max(7,Math.round(w*0.8)+4),ri=Math.max(1,r0*(1-k));
    ctx.globalAlpha=0.55+0.4*Math.sin(tick*0.45);
    ctx.fillStyle='rgba(248,72,72,0.16)';
    ctx.beginPath();ctx.arc(x,base-2,r0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#f84848';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.arc(x,base-2,r0,0,Math.PI*2);ctx.stroke();
    ctx.globalAlpha=0.85;ctx.strokeStyle='#ffd0d0';ctx.lineWidth=1;
    ctx.beginPath();ctx.arc(x,base-2,ri,0,Math.PI*2);ctx.stroke();   // 收缩环＝倒计时
    ctx.globalAlpha=0.8;ctx.fillStyle='#f84848';ctx.fillRect(x-1,base-4,3,3);
    ctx.globalAlpha=1;
    return;
  }
  const hh=clamp(+h.h||0,0,+h.mh||40);
  if(hh<=1)return;
  const top=base-hh;
  ctx.globalAlpha=1;
  ctx.fillStyle='rgba(192,40,24,0.88)';ctx.fillRect(x-w/2,top,w,hh);          // 柱体
  ctx.fillStyle='#f87030';ctx.fillRect(x-Math.max(1,w*0.28),top+1,Math.max(2,w*0.56),hh-1);
  ctx.fillStyle='#ffd080';ctx.fillRect(x-Math.max(1,w*0.12),top+2,Math.max(2,w*0.24),Math.max(1,hh-4));
  ctx.fillStyle='#e04020';                                                     // 顶焰：3 枚按 tick 抖动
  for(let i=0;i<3;i++){
    const fx=x+(i-1)*Math.max(2,w*0.3),fh=3+((tick*7+i*13)%5);
    ctx.fillRect(px(fx)-1,top-fh,2,fh);
  }
  ctx.globalAlpha=0.35;ctx.fillStyle='#f8a030';                               // 底部灼光（贴地）
  ctx.beginPath();ctx.arc(x,base,Math.max(6,w),0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=1;
}

// v12 §任务5③：核心护盾（core）——18×18 金色悬浮核心，上下轻浮；用 hp/maxHp 画剩余量（底部小格），
// 受击 flashT 按 0.12s 叠一层白（与分身同口径）。x 视作中心（引擎取 20%/80% 列中心），y 视作顶边。
function _hzCore(h,tick,ox,oy){
  const W=Math.max(8,+h.w||18),H=Math.max(8,+h.h||18);
  const x=px(h.x-ox),y=px(h.y-oy),bob=Math.round(Math.sin(tick*0.12)*2),cy=y+H/2+bob;
  ctx.globalAlpha=0.18;ctx.fillStyle='#f8d048';
  ctx.beginPath();ctx.arc(x,cy,W*0.75,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=1;ctx.fillStyle='#a87810';
  ctx.beginPath();ctx.moveTo(x,cy-7);ctx.lineTo(x+7,cy);ctx.lineTo(x,cy+7);ctx.lineTo(x-7,cy);ctx.closePath();ctx.fill();
  ctx.fillStyle='#f8d048';
  ctx.beginPath();ctx.moveTo(x,cy-4.5);ctx.lineTo(x+4.5,cy);ctx.lineTo(x,cy+4.5);ctx.lineTo(x-4.5,cy);ctx.closePath();ctx.fill();
  ctx.fillStyle='#fff6c0';ctx.fillRect(x-1,cy-1,3,3);
  const mx=+h.maxHp||0,hp=clamp(+h.hp||0,0,mx||99);
  if(mx>0){                                                                   // 剩余量：maxHp 枚 2×2 小格
    const pw=Math.min(2,Math.floor((W-2)/Math.max(1,mx)));
    for(let i=0;i<mx;i++){
      ctx.fillStyle=i<hp?'#ffe070':'#5a4410';
      ctx.fillRect(x-Math.floor(mx*(pw+1)/2)+i*(pw+1),y+H+3,pw,2);
    }
  }
  const ft=+h.flashT||0;
  if(ft>0){                                                                   // 受击闪白
    ctx.globalAlpha=clamp(ft/0.12,0,1)*0.8;ctx.fillStyle='#ffffff';
    ctx.beginPath();ctx.moveTo(x,cy-7);ctx.lineTo(x+7,cy);ctx.lineTo(x,cy+7);ctx.lineTo(x-7,cy);ctx.closePath();ctx.fill();
    ctx.globalAlpha=1;
  }
}

// v12 §任务5④：quellBlast（可选 hazard）——存在才画，全屏红闪（世界空间下用 cam 反推视口矩形）。
// 时间口径：h.t 已存活秒数 / h.life 总时长；字段缺失按 0.35s、alpha .42 的短闪兜底，不抛异常。
function _hzQuellBlast(h,tick){
  const life=+h.life||0.35,t=+h.t||0,a=clamp(1-t/life,0,1)*0.42;
  if(a<=0)return;
  const cam=game.cam||{x:0,y:0};
  ctx.globalAlpha=a;ctx.fillStyle='#f85030';
  ctx.fillRect(px(cam.x)-8,px(cam.y)-8,VIEW_W+16,VIEW_H+16);
  ctx.globalAlpha=1;
}


// v13 §六①：真假身（mirror）——「渲染必须和真身完全一致」是硬契约：本函数**绝不读 h.real**
// （那是答案，读了等于把谜底画出来）。三具幻影走同一条绘制路径（同帧、同偏移、同 alpha），
// 玩家只能靠「打错会爆」而不是配色去分辨。
// 剪影优先借本体 body 帧（与 renderBoss 同取帧公式 → 与真身逐像素同形），其次 SPR.mirror
// （art 契约 24×32 纯色剪影，并行交付，**必须 || 兜底**），最后程序化色块。
// 特征只有两条：alpha 0.55 + 紫色描边 ±1px 抖动（三者之间完全无差别）。
function _hzBossParts(){ // 内部：Boss 部件组（与 renderBoss 同一档回落链，缺失返回 null 不抛）
  try{
    const P=[SPR.boss,SPR.boss2,SPR.boss3,SPR.boss4||SPR.boss3,SPR.boss5||SPR.boss4||SPR.boss3,
             SPR.boss6||SPR.boss4||SPR.boss3][_bossIdx((game.boss||{}).kind)];
    return P||SPR.boss||null;
  }catch(e){return null;}
}
function _hzMirror(h,tick,ox,oy){
  if(!h||h.kind!=='mirror')return;
  const w=Math.max(4,+h.w||52),hg=Math.max(4,+h.h||48);
  const x=px((+h.x||0)-(+ox||0)),y=px((+h.y||0)-(+oy||0)),T=+tick||0;
  ctx.save();
  let body=null;
  const P=_hzBossParts(),Bf=P&&(P.body||P);
  if(Bf&&Bf.length&&Bf[0])body=Bf[(T*3|0)%Bf.length];
  if(!body)body=SPR.mirror||null;                       // art 未合入 → 兜底（不许直接解引用 SPR.mirror.x）
  const bx0=body?x+Math.round((w-body.width)/2):x;      // 水平居中 + 底对齐（renderBoss 同口径）
  const by0=body?y+hg-body.height:y;
  const bw0=body?body.width:w,bh0=body?body.height:hg;
  ctx.globalAlpha=0.55;
  if(body)ctx.drawImage(body,px(bx0),px(by0));
  else{                                                 // 程序化剪影：躯干 + 双臂 + 两眼（够读成「人形」）
    ctx.fillStyle='#3a2a58';
    ctx.fillRect(x+Math.round(w*0.28),y+6,Math.max(2,Math.round(w*0.44)),hg-6);
    ctx.fillRect(x+2,y+Math.round(hg*0.34),Math.max(2,Math.round(w*0.24)),Math.max(2,Math.round(hg*0.34)));
    ctx.fillRect(x+w-Math.round(w*0.26),y+Math.round(hg*0.34),Math.max(2,Math.round(w*0.24)),Math.max(2,Math.round(hg*0.34)));
    ctx.fillStyle='#c890ff';
    ctx.fillRect(x+Math.round(w*0.36),y+Math.round(hg*0.3),3,3);
    ctx.fillRect(x+Math.round(w*0.58),y+Math.round(hg*0.3),3,3);
  }
  /* v13.1：幻影也要有眼睛，且是**紫色**的——真身不隐身之后，「有没有眼睛」不再成立，
     改成「眼睛什么颜色」，玩家必须真的看一眼才能分辨（而不是数有没有眼）。
     两团紫眼压在剪影头部，和本体眼睛同位置同尺寸，只有颜色不同。 */
  if(body){
    const ey=px(by0+Math.round(bh0*0.30)),ex=px(bx0+Math.round(bw0*0.34));
    const gap=Math.max(3,Math.round(bw0*0.20));
    ctx.globalAlpha=0.95;
    ctx.fillStyle='#d070ff';
    ctx.fillRect(ex,ey,3,3); ctx.fillRect(ex+gap,ey,3,3);
  }
  const jit=Math.round(Math.sin(T*0.55+(+h.x||0))*1);   // 紫描边 ±1px 抖动（贴剪影外框，不参与真假判别）
  ctx.globalAlpha=0.5+0.22*Math.abs(Math.sin(T*0.3));
  ctx.strokeStyle='#c060f0';ctx.lineWidth=1;
  ctx.strokeRect(px(bx0)+jit+0.5,px(by0)+0.5,Math.max(1,bw0-1),Math.max(1,bh0-1));
  const ft=+h.flashT||0;
  if(ft>0){                                             // 受击闪白（与 clone/core 同口径 0.12s 衰减）
    ctx.globalAlpha=clamp(ft/0.12,0,1)*0.8;
    if(body)ctx.drawImage(whiteOf(body),px(bx0),px(by0));
    else{ctx.fillStyle='#ffffff';ctx.fillRect(px(bx0),px(by0),bw0,bh0);}
  }
  ctx.restore();
}

// v13 §六②：推进墙（pushwall）——warnT>0 只画预警（半透明虚线轮廓 + 推进方向箭头），不画实体：
// 这招的正确动作是「朝 Boss 方向持续跑」，玩家必须先看清墙从哪来、往哪推。
// warnT<=0 画实心：SPR.pushwall（24×64 熔岩裂纹竖条）优先，缺失走程序化岩柱；
// 斜纹按 dir 滚动（反向滚动会读成「墙在后退」= 给错方向）；顶边一排尖刺（视觉上「碰到就割」）。
function _hzPushwall(h,tick,ox,oy){
  if(!h||h.kind!=='pushwall')return;
  const w=Math.max(2,+h.w||24),hg=Math.max(2,+h.h||64);
  const x=px((+h.x||0)-(+ox||0)),y=px((+h.y||0)-(+oy||0));
  const dir=(+h.dir||1)<0?-1:1,wt=+h.warnT||0,T=+tick||0;
  ctx.save();
  if(wt>0){                                             // 预警：只给方向，不画实体
    ctx.globalAlpha=0.14;ctx.fillStyle='#f8a030';ctx.fillRect(x,y,w,hg);
    ctx.globalAlpha=0.45+0.2*Math.sin(T*0.35);
    ctx.strokeStyle='#f8a030';ctx.lineWidth=1;
    if(ctx.setLineDash)ctx.setLineDash([4,3]);
    ctx.strokeRect(x+0.5,y+0.5,Math.max(1,w-1),Math.max(1,hg-1));
    if(ctx.setLineDash)ctx.setLineDash([]);
    ctx.globalAlpha=0.55+0.35*Math.sin(T*0.35);         // 推进方向：3 枚箭头贴在墙的推进前缘
    ctx.fillStyle='#ffd090';
    for(let i=0;i<3;i++){
      const yy=y+Math.round(hg*(i+1)/4),ax=x+(dir>0?w+3:-3);
      ctx.beginPath();ctx.moveTo(px(ax),yy-3);ctx.lineTo(px(ax+dir*5),yy);
      ctx.lineTo(px(ax),yy+3);ctx.closePath();ctx.fill();
    }
    ctx.restore();return;
  }
  const img=SPR.pushwall;                               // art 契约 24×64；非默认尺寸允许拉伸
  ctx.globalAlpha=1;
  if(img)ctx.drawImage(img,x,y,w,hg);
  else{
    ctx.fillStyle='#3a2c2c';ctx.fillRect(x,y,w,hg);     // 程序化岩柱：深底 + 亮面 + 两侧压暗
    ctx.fillStyle='#5a4040';ctx.fillRect(x+2,y+1,Math.max(1,w-4),Math.max(1,hg-2));
    ctx.fillStyle='#2a1e1e';ctx.fillRect(x,y,2,hg);ctx.fillRect(x+Math.max(0,w-2),y,2,hg);
    ctx.fillStyle='#c85820';                            // 熔岩裂纹（三道折线）
    for(let i=0;i<3;i++){
      const cx0=x+Math.round(w*(i+1)/4),yy0=y+8+i*14;
      ctx.fillRect(cx0,yy0,1,5);ctx.fillRect(cx0+1,yy0+5,2,1);ctx.fillRect(cx0+3,yy0+6,1,4);
    }
  }
  ctx.save();                                           // 斜纹滚动：裁在墙体内，越界不糊到场景
  ctx.beginPath();ctx.rect(x,y,w,hg);ctx.clip();
  const per=12,off=((T*1.2*dir)%per+per)%per;
  ctx.globalAlpha=0.22;ctx.strokeStyle='#ffd090';ctx.lineWidth=1;
  for(let i=-hg;i<w+hg;i+=per){
    const sx=x+i+off;
    ctx.beginPath();ctx.moveTo(sx,y+hg);ctx.lineTo(sx+hg,y);ctx.stroke();
  }
  ctx.restore();
  if(!img){                                             // 顶边尖刺：art 精灵上沿已自带 3px 尖齿，不重复叠
    ctx.globalAlpha=0.95;ctx.fillStyle='#c8c0b8';
    const n=Math.max(1,Math.round(w/8));
    for(let i=0;i<n;i++){
      const sx=x+(i+0.5)*(w/n),sh=4+((i*7+T|0)%3);
      ctx.beginPath();ctx.moveTo(px(sx-3),y);ctx.lineTo(px(sx),y-sh);
      ctx.lineTo(px(sx+3),y);ctx.closePath();ctx.fill();
    }
  }
  const ht=+h.hitT||0;
  if(ht>0){                                             // 命中闪红（hitT 由引擎递减，UI 只读）
    ctx.globalAlpha=clamp(ht/0.8,0,1)*0.35;ctx.fillStyle='#f84848';ctx.fillRect(x,y,w,hg);
  }
  ctx.restore();
}

// v13 §六③：弹跳炸弹（bomb）——(x,y) 视作球心（契约里 r 是爆炸半径），落地阴影投到同列地面
// （借 _hzGroundAt，空中也看得出「离地多高」= 弹跳节奏的读秒）；armed 后引信闪红加快 + 画爆炸半径，
// 爆炸前 0.2s 整颗白闪（这是「该走了」的最后信号，与「落地就躲死」的坏习惯对着干）。
function _hzBomb(h,tick,ox,oy){
  if(!h||h.kind!=='bomb')return;
  const cx=px((+h.x||0)-(+ox||0)),cy=px((+h.y||0)-(+oy||0));
  const r=Math.max(4,+h.r||30),ball=6,T=+tick||0;       // r=爆炸半径；ball=铁球视觉半径
  const armed=!!h.armed,fuse=Math.max(0.05,+h.fuse||0.9),t=Math.max(0,+h.t||0);
  const left=armed?Math.max(0,fuse-t):-1;
  ctx.save();
  const gy=px(_hzGroundAt(+h.x||0,+h.y||0)-(+oy||0));   // 地面阴影（无 level 时回落球心）
  const hgt=clamp((gy-cy)/72,0,1);
  ctx.globalAlpha=0.34-0.18*hgt;ctx.fillStyle='#000000'; // 落地阴影：越高越小越淡
  ctx.beginPath();ctx.ellipse(cx,gy,Math.max(3,ball+2-hgt*3),Math.max(1.5,2.5-hgt),0,0,Math.PI*2);ctx.fill();
  if(armed){                                            // 爆炸半径随引信收缩（pre:0→1）
    const pre=clamp(1-left/Math.max(0.05,fuse),0,1);
    ctx.globalAlpha=0.10+0.20*pre;ctx.fillStyle='#f84848';
    ctx.beginPath();ctx.arc(cx,cy,Math.max(ball,r*pre),0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=0.35+0.4*pre;ctx.strokeStyle='#f8a030';ctx.lineWidth=1;
    ctx.beginPath();ctx.arc(cx,cy,Math.max(ball,r),0,Math.PI*2);ctx.stroke();
  }
  const img=SPR.bomb;                                   // art 契约 16×16；缺失走程序化铁球
  ctx.globalAlpha=1;
  if(img)ctx.drawImage(img,px(cx-Math.round(img.width/2)),px(cy-Math.round(img.height/2)));
  else{
    ctx.fillStyle='#22222c';ctx.beginPath();ctx.arc(cx,cy,ball,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#3e3e4c';ctx.beginPath();ctx.arc(cx-1,cy-1,ball*0.66,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#8a8a9a';ctx.fillRect(cx-3,cy-3,2,2);
  }
  const blink=0.5+0.5*Math.sin(T*(armed?0.95:0.38));     // 引信：armed 后频率加快
  if(!img){                                             // 程序化引信杆（art 16×16 精灵自带引信，不重复画）
    ctx.globalAlpha=armed?(0.55+0.45*blink):0.5;
    ctx.fillStyle=armed?'#ff5030':'#f8a030';ctx.fillRect(cx+ball-2,cy-ball-3,2,4);
  }
  ctx.globalAlpha=armed?(0.4+0.6*blink):0.45;           // 火星（两条路径都画：spec 要求引信闪红）
  ctx.fillStyle=armed?'#ffd0a0':'#ffe0a0';ctx.fillRect(cx+ball-2,cy-ball-4,2,2);
  if(armed&&left<=0.2){                                 // 爆炸前 0.2s 白闪
    const a=clamp(1-left/0.2,0,1);
    ctx.globalAlpha=0.3+0.55*a;ctx.fillStyle='#ffffff';
    ctx.beginPath();ctx.arc(cx,cy,ball+2,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
}

// v13 §六④：水雾区（mist）——y 是地面上沿、h 向上长，整柱从 base 往上画。
// 「跳不出去」必须一眼看出：柱体**填满到顶**不留缺口，底浓顶淡（6 段像素条带，不建 gradient——
// mock/旧环境的 createLinearGradient 差异会在沙箱里抛错）；上升气泡固定 5 枚按 tick 错相
// （不 push 数组）；起手/收尾各 0.25s 渐显隐，避免凭空闪现。
function _hzMist(h,tick,ox,oy){
  if(!h||h.kind!=='mist')return;
  const w=Math.max(4,+h.w||56),hg=Math.max(4,+h.h||96);
  const x=px((+h.x||0)-(+ox||0)),base=px((+h.y||0)-(+oy||0));
  const T=+tick||0,t=Math.max(0,+h.t||0),life=Math.max(0.1,+h.life||4);
  const fade=clamp(Math.min(t*4,(life-t)*4),0,1);       // 起手/收尾渐显隐
  if(fade<=0)return;
  ctx.save();
  const bands=6,bh=hg/bands;
  for(let i=0;i<bands;i++){                             // 渐变柱：i=0 贴地最浓 → 顶部最淡
    const k=i/(bands-1);
    // v13.1 实机第三版：青色 (#48d8d0) 在 L13 的蓝底关卡里整根融掉。雾本来就该是白的——
    // 换成近白高亮 (#c8f0ff)，在任何主题底色上都是「亮的」，而背景基本都是中低明度。
    ctx.globalAlpha=(0.66-k*0.46)*fade;ctx.fillStyle='#d8f4ff';
    ctx.fillRect(x,px(base-(i+1)*bh),w,Math.ceil(bh));
  }
  ctx.globalAlpha=0.55*fade;ctx.fillStyle='#ffffff';    // 内部 2 条竖纹：柱体有体积，不是一块色板
  ctx.fillRect(x+Math.round(w*0.22),base-hg+4,2,hg-6);
  ctx.fillRect(x+Math.round(w*0.7),base-hg+4,2,hg-6);
  ctx.globalAlpha=0.50*fade;ctx.fillStyle='#c8fff8';    // 顶边柔化：1px 亮线 + 下面一行更淡（v13.1 提亮）
  ctx.fillRect(x,base-hg,w,1);
  ctx.globalAlpha=0.12*fade;ctx.fillRect(x,base-hg+1,w,2);
  ctx.fillStyle='#c8fff8';
  for(let i=0;i<5;i++){                                 // 上升气泡（固定 5 枚）
    const ph=(T*0.018+t*0.06+i*0.2)%1;
    const bx0=x+3+((i*17+Math.round(w*0.2))%Math.max(1,w-6));
    ctx.globalAlpha=0.55*(1-ph)*fade;
    ctx.fillRect(px(bx0),px(base-ph*hg),2,2);
  }
  ctx.globalAlpha=0.32*fade;ctx.fillStyle='#70f0e0';    // 底缘贴地一圈（雾从地面渗出来）
  ctx.fillRect(x,base-1,w,2);
  /* v13.1 实机第二版：L13 是水面关，背景本来就是蓝的，纯青色柱体整根融进去（截图里几乎看不见）。
     左右各压一条深色边——任何主题下都能一眼框出「这一列现在不能站」。 */
  ctx.globalAlpha=0.90*fade;ctx.fillStyle='#ffffff';
  ctx.fillRect(x,base-hg,1,hg);
  ctx.fillRect(x+w-1,base-hg,1,hg);
  ctx.fillRect(x,base-hg,w,1);   // 顶边硬线：柱体有了轮廓才读得成「区域」
  ctx.restore();
}

/* v16 §三：圣像审判（totem，boss5 专属）——y 是地面线、h 向上长（与 mist 同口径），引擎判伤圆心取
   柱心 (x+w/2, y-h/2)。这招要玩家在 4s 内做一个决定（拆 / 跑），所以画面必须同时回答三件事：
     ① 这是什么 → 石柱本体 + 柱顶金色「圣像之眼」，眼在呼吸 = 它是活的、还能被打；
     ② 还有几刀 → 柱顶 maxHp 枚 3×2 血量点，打掉一枚灭一枚（清空=不炸，这是这招唯一的正解）；
     ③ 什么时候炸 → 脚下 14×2 引信条按剩余比例缩短、颜色从青白烧到红，最后 0.8s 闪烁。
   爆炸半径只在剩余 <1s 时画一圈虚线：平时画 = 同屏两圈 110px 红环，画面糊成一片，反而没人看引信。
   性能：idle 每帧 ~20 个图元（柱 1 + 眼 3 + 血点 ≤8 + 引信 3 + 弧 ≤1）；不 new 对象、不建 gradient。 */
const _TOTEM_FUSE_COL=(function(){   // 引信 8 档色（青白→暖金→红）：模块加载时算一次，运行期只查表，
  // 不在每帧拼字符串/建 createLinearGradient（沙箱里 gradient 行为有差异，mist 那条注释踩过）。
  const A=[216,244,255],B=[255,232,176],C=[248,96,32],out=[];
  for(let i=0;i<8;i++){
    const u=i/7,p=u<0.5?A:B,q=u<0.5?B:C,s=u<0.5?u*2:(u-0.5)*2;
    out.push('rgb('+Math.round(p[0]+(q[0]-p[0])*s)+','+Math.round(p[1]+(q[1]-p[1])*s)+','+Math.round(p[2]+(q[2]-p[2])*s)+')');
  }
  return out;
})();
function _hzTotem(h,tick,ox,oy){
  if(!h||h.kind!=='totem')return;
  const w=Math.max(4,+h.w||16),hg=Math.max(4,+h.h||32);
  const x=px((+h.x||0)-(+ox||0)),base=px((+h.y||0)-(+oy||0)); // base=地面线：柱底压在这条线上，不浮空
  const top=base-hg,cx=x+Math.round(w/2),T=+tick||0;
  const life=Math.max(0.05,+h.life||4),t=Math.max(0,+h.t||0);
  const k=clamp(t/life,0,1),left=Math.max(0,life-t);
  ctx.save();
  if(left<1.0){                                        // 只剩 1s 才给「跑多远算安全」，平时露圈=脏
    const rr=Math.max(8,+h.r||110),a=0.34+0.22*(1-left); // 越临爆越不透明（0.34→0.56）
    /* 实机目检（_v16_totem_almost.png）第一版 0.10~0.16 + 1.5px 虚线，在 nether 暗紫底上几乎看不见 =
       等于没给「跑多远」的信息。0.34 起跳才能在混战里读到；最后 0.5s 再补一层极淡填充，
       把「圈内是危险区」从一条线升级成一个面（填充只 0.07，不糊画面）。 */
    ctx.globalAlpha=a;ctx.strokeStyle='#f84848';ctx.lineWidth=2;
    if(ctx.setLineDash)ctx.setLineDash([6,5]);          // 虚线：读成「边界线」而不是又一层实体
    ctx.beginPath();ctx.arc(cx,base-Math.round(hg/2),rr,0,Math.PI*2);ctx.stroke();
    if(ctx.setLineDash)ctx.setLineDash([]);
    if(left<0.5){
      ctx.globalAlpha=0.07;ctx.fillStyle='#f84848';
      ctx.beginPath();ctx.arc(cx,base-Math.round(hg/2),rr,0,Math.PI*2);ctx.fill();
    }
    ctx.globalAlpha=1;
  }
  // 本体：art 契约 16×32。取不到 SPR.totem 时**不要**拿 pushwall（24×64 熔岩裂纹竖条）冒充——
  // 那个造型是「推进墙」，混进 L18 会让玩家把圣像当成墙。退回中性程序化石柱，造型错位好过认错。
  const img=SPR.totem;
  ctx.globalAlpha=1;
  if(img){
    /* 实机目检（_v16_totem_fresh.png）：nether 关是暗紫底，灰石柱压上去轮廓会融掉，
       和旁边的木箱/平台混成一片。贴图前先描一圈 1px 暖金外框（0.24）把剪影抠出来——
       不改 art 画稿，只在 ui 侧补分离度；金框也顺带把「这是圣物不是场景道具」说清楚。 */
    ctx.globalAlpha=0.24;ctx.fillStyle='#f8d048';
    ctx.fillRect(x-1,top-1,w+2,1);ctx.fillRect(x-1,base,w+2,1);
    ctx.fillRect(x-1,top-1,1,hg+1);ctx.fillRect(x+w,top-1,1,hg+1);
    ctx.globalAlpha=1;
    ctx.drawImage(img,x,top,w,hg);
  }
  else{
    ctx.fillStyle='#3c3a44';ctx.fillRect(x,top,w,hg);              // 石柱
    ctx.fillStyle='#5c5a68';ctx.fillRect(x+2,top+2,Math.max(1,w-4),Math.max(1,hg-4));
    ctx.fillStyle='#26242c';ctx.fillRect(x,top,2,hg);ctx.fillRect(x+Math.max(0,w-2),top,2,hg);
    ctx.fillStyle='#8a8698';ctx.fillRect(x+2,top+2,Math.max(1,w-4),1);
  }
  const ft=+h.flashT||0;
  if(ft>0){                                            // 打中反馈：整根压白（引擎每刀只给 0.08s，够看够短）
    ctx.globalAlpha=clamp(ft/0.08,0,1)*0.5;ctx.fillStyle='#ffffff';
    ctx.fillRect(x,top,w,hg);
  }
  // 圣像之眼：art 画稿里已有 3×3 金眼（矩形 y1..3、列 x6..8），这里只做「呼吸」——光晕对准画稿那颗眼，
  // 不另起第二个金点（错开画会变成两只眼）。相位用 tick（不是 t）：两座圣像的眼同步，混战里更好认。
  // 列偏 1px 是因为 16 宽的画布中心列是 7，而 cx=x+8（画稿把眼放在 x6..8，中心列 7）。
  const eyeY=top+Math.max(2,Math.round(hg*0.0625)),eyeX=cx-1,br=0.6+0.4*Math.sin(T*0.2);
  ctx.globalAlpha=0.22+0.33*br;ctx.fillStyle='#f8d048';   // 0.10 起跳太淡，实机看是个白点，认不出「金色圣像之眼」
  ctx.fillRect(eyeX-3,eyeY-3,6,6);                      // 光晕用硬边方块（像素风，不用 shadowBlur）
  ctx.globalAlpha=0.85+0.15*br;ctx.fillStyle='#ffe070';
  ctx.fillRect(eyeX-1,eyeY-1,3,3);
  ctx.globalAlpha=1;ctx.fillStyle='#fffbe0';ctx.fillRect(eyeX,eyeY,1,1);
  // 血量点：3 刀能拆 → 进度必须「数得出」。深底板保证灭掉的那几枚也留着位（总数不变才是读数）
  const maxHp=Math.max(1,+h.maxHp||3),hp=clamp((+h.hp===undefined?maxHp:+h.hp),0,maxHp);
  const totalW=maxHp*3+(maxHp-1);
  const pipX=cx-Math.round(totalW/2),pipY=top-6;        // 留 6px 让开柱顶，别和眼/装饰糊在一起
  ctx.globalAlpha=1;ctx.fillStyle='#2a2016';ctx.fillRect(pipX-1,pipY-1,totalW+2,4);
  for(let i=0;i<maxHp;i++){
    ctx.fillStyle=i<hp?'#ffe070':'#4a3a24';
    ctx.fillRect(pipX+i*4,pipY,3,2);
  }
  // 引信条：14×2 贴在脚下，长度=剩余比例，颜色按 t/life 烧红；最后 0.8s 闪烁＝最后的「拆还是跑」
  const fw=14,fx0=cx-7,fy0=base+1;
  ctx.globalAlpha=0.55;ctx.fillStyle='#181018';ctx.fillRect(fx0-1,fy0-1,fw+2,4); // 底板：雪/沙等亮地面上也读得出
  ctx.globalAlpha=1;ctx.fillStyle=_TOTEM_FUSE_COL[Math.min(7,(k*8)|0)];
  const fwNow=Math.max(1,Math.round(fw*(1-k)));
  ctx.fillRect(fx0,fy0,fwNow,2);
  if(left<=0.8){
    ctx.globalAlpha=(0.45+0.45*Math.sin(T*1.2))*clamp((0.8-left)/0.8,0.25,1);
    ctx.fillStyle='#ff7050';ctx.fillRect(fx0,fy0-1,fw,1);ctx.fillRect(fx0,fy0+2,fw,1);
    ctx.globalAlpha=1;
  }
  ctx.restore();
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
// v12：追加第 6 只「烈焰·牛魔王」（kind 6，L19）；上限随表扩到 5，否则 kind 6 会被夹回 4 顶冥古龙的名字。
const BOSS_NAME=['星核巨兽','蛟龙·敖渊','幽冥判官','冥古龙','曜光·圣裁者','烈焰·牛魔王'];
const BOSS_P2TIP=['狂暴于 50%','唤潮于 40%','摄魂于 40%','末段·冥焰焚天','末段·圣辉裁决','末段·烈焰焚天'];
// v7.8 修复：engine 的 b.kind 是 1-based（1/2/3），而部件表/名字表是 0-based 三元数组。
// v7 §9.3 把 kind 直接当下标用，结果整体错位一格：kind=3 取到 undefined → L16 判官整块 return 不渲染
// （玩家看到的"最后一个 Boss 没画出来"）、kind=1 的星核被画成蛟龙、血条名字 L7 显示"蛟龙·敖渊"、
// L16 显示 "undefined"。kind 缺省/0 → 回落 0（星核），与旧引擎零回归。
// v7.9：表扩到 5 个（4=冥古龙、5=曜光·圣裁者），仍按 kind 1 基换算——上限随之 2→4，
// 否则 kind 4/5 会被夹到 2 取到判官的名字（新 Boss 顶个旧名字，比没名字更误导）。
// v12：上限 4→5（6=烈焰·牛魔王），三张表（名字/阶段提示/刻度比例）同步 6 项，避免暂停提示卡出现 undefined。
const _bossIdx=k=>{const n=+k|0;return n>=1?Math.min(5,n-1):0;};
const BOSS_P2FRAC=[0.5,0.4,0.4,0.5,0.5,0.5];
// v7.9：Boss 三段血进度**唯一口径**。HUD 三段条、条上方剩余段方块、血条悬停提示卡三处全部从这里取数，
// 禁止各处再自算一遍（旧版 bar 用 hp/maxHp、提示卡另说一套，三段化后必然漂移）。
// bandMax 缺失（引擎三段血未合入 / 旧存档回放）→ seg=false，调用方回落旧单条血逻辑，保证不崩。
// 口径：total = 剩余总血量比例 = ((2-bandBreak)*bandMax + bandMax 内余量) / maxHp；
// bandBreak=0(满血) → 100%，跨一段 → 66.7%，跨两段 → 33.3%，最后一段见底 → 0%。
// left=还没打空的段数（含当前段）。
function _bossProg(b){
  const bm=+b.bandMax||0,brk=clamp(+b.bandBreak||0,0,2),tot=+b.maxHp||0;
  const cur=bm>0?clamp(+b.hp||0,0,bm):Math.max(0,+b.hp||0);
  if(bm>0)return{seg:true,bandMax:bm,brk:brk,cur:cur,left:3-brk,total:clamp(((2-brk)*bm+cur)/(tot||bm*3),0,1)};
  return{seg:false,bandMax:0,brk:0,cur:cur,left:1,total:clamp(cur/(tot||1),0,1)};
}
// v10 §任务3①：三段刻度线的像素位置**唯一口径**——按「bandMax / maxHp」的比例乘内区宽 172 算，
// 绝不写死 63/96/144/162/189 这类旧血量。v10 血量 ×3（boss 63→189、boss5 189→567）后比例仍是 1/3，
// 故 189 与 567 两档刻度落在同一像素（186.33 / 243.67），而任何写死旧值的实现在 567 下都会错位。
// bandMax 缺失（旧引擎）→ 回落 maxHp/3，仍与 172/3 逐像素一致（零回归）。
function _bossTickXs(b){
  const inner=172,x0=129;
  const tot=+b.maxHp||0,bm=+b.bandMax>0?+b.bandMax:tot/3;
  if(!(tot>0&&bm>0))return[x0+inner/3,x0+inner*2/3];
  return[x0+inner*clamp(bm/tot,0,1),x0+inner*clamp(2*bm/tot,0,1)];
}
// v12：UI 侧只读引擎平衡表（预警尺寸要跟参数走，不能写死 46/12/0.9）。
// kind 1 的键在 BAL.boss（历史命名），kind≥2 是 BAL.boss2..boss6；表缺失/引擎未合入 → null，调用方逐个回落默认值。
function _bossCfg(b){
  if(typeof BAL==='undefined'||!BAL||!b)return null;
  const k=(+b.kind|0)||1;
  return BAL[k===1?'boss':('boss'+k)]||null;
}
// v10 §任务2.1：Boss 新招式前摇特效统一入口（renderBoss 内、世界坐标）。
// 旧代码的 windup 只有姿态偏移（dy/ad/jaw），玩家读不出「下一招是什么」；v10 新招判定更狠，
// 必须让每种招式的起手图形独一无二，否则「预警 = 没有」。未列出的旧招直接返回（零回归）。
// k=前摇进度 0..1（按 0.6s 归一），所有特效随 k 渐强；bimg/bx/by = 本体当前帧与落点，供 clone 残影复用。
function renderBossWindupFx(b,bimg,bx,by){
  if(!b||b.state!=='windup')return;
  const cx=b.x+b.w/2,top=b.y,k=clamp((+b.t||0)/0.6,0,1);
  switch(b.next){
    case 'meteor':{                                  // 抬手召陨：头顶 3 颗小陨石虚影（上浮 + 渐显）
      ctx.globalAlpha=0.4+0.5*k;                     // 抬高到头顶 18px：贴着头皮画会被本体暗色吞掉（实测）
      for(let i=0;i<3;i++){
        const mx=cx+(i-1)*18,my=top-18-Math.sin(k*3+i)*3;
        ctx.fillStyle='#f8a030';ctx.fillRect(px(mx)-1,px(my)-7,2,5);   // 尾焰
        ctx.fillStyle='#f84848';ctx.beginPath();ctx.arc(px(mx),px(my),3,0,Math.PI*2);ctx.fill();
      }
      ctx.globalAlpha=1;break;
    }
    case 'spike':{                                   // 跺地：脚下裂纹 + ±1px 抖动（UI 侧震屏，不动引擎 shake）
      const jit=Math.sin((+b.t||0)*70)>0?1:-1,gy=px(top+b.h);
      ctx.fillStyle='#2a1a1a';
      for(let i=0;i<4;i++){
        const dx=(i-1.5)*8;
        ctx.fillRect(px(cx+dx)+jit,gy-1,5,1);
        ctx.fillRect(px(cx+dx*1.3)+jit,gy-2,3,1);
      }
      ctx.globalAlpha=0.4+0.5*k;ctx.fillStyle='#f86040';
      ctx.fillRect(px(cx)-8+jit,gy-1,16,1);ctx.globalAlpha=1;break;
    }
    case 'homing':{                                  // 蓄力：胸口聚一颗紫球（半径随 k 长大）
      const oy0=top+b.h*0.45,r=2+k*4;
      ctx.globalAlpha=0.35;ctx.fillStyle='#b060f0';
      ctx.beginPath();ctx.arc(px(cx),px(oy0),r+4,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=1;ctx.fillStyle='#c890ff';
      ctx.beginPath();ctx.arc(px(cx),px(oy0),r,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#f0e0ff';ctx.beginPath();ctx.arc(px(cx)-1,px(oy0)-1,Math.max(1,r*0.45),0,Math.PI*2);ctx.fill();
      break;
    }
    case 'clone':{                                   // 分裂：本体两侧各一枚紫残影，间距随 k 拉开
      // 间距必须拉够（8→26px）：只错开几像素时两张半透副本几乎完全盖住本体，观感是「Boss 被泼了一层紫」
      // 而不是「分裂」，实测截图证实了这一点。
      const sp=8+k*18;
      ctx.globalAlpha=0.28;
      if(bimg&&bimg.width){const tint=tintOf(bimg,'#b060f0');
        ctx.drawImage(tint,px(bx-sp),px(by));ctx.drawImage(tint,px(bx+sp),px(by));}
      else{ctx.fillStyle='#b060f0';
        ctx.fillRect(px(cx-sp-10),px(top),20,b.h);ctx.fillRect(px(cx+sp-10),px(top),20,b.h);}
      ctx.globalAlpha=1;break;
    }
    case 'pull':{                                    // 张手：身前 3 道力场弧（向外扩）
      const fx=cx+(b.face>0?1:-1)*16;
      for(let i=0;i<3;i++){
        ctx.globalAlpha=0.25+0.45*k-i*0.06;
        ctx.strokeStyle='#b060f0';ctx.lineWidth=1.5;
        ctx.beginPath();ctx.arc(px(fx),px(top+b.h*0.5),10+i*6,-1.1,1.1);ctx.stroke();
      }
      ctx.globalAlpha=1;break;
    }
    // v12 §任务3：五种新交互类型的专属预警——图形本身就要说清「该打断 / 该绕开 / 该跳 / 该离圈 / 该转火」。
    // 所有尺寸优先读平衡表，读不到分别回落 46 / 0.9；hazards 缺失时每招仍保留自己的本体预警（绝不白板）。
    case 'quell':{                                   // 蓄力全屏：头顶聚能球随前摇长大；ward 已生成则同步预演结界圈
      const oy0=top-30,r=3+k*7;
      ctx.globalAlpha=0.25+0.25*k;ctx.fillStyle='#f8d048';
      ctx.beginPath();ctx.arc(px(cx),px(oy0),r+5,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=0.55+0.45*k;ctx.fillStyle='#f8a030';
      ctx.beginPath();ctx.arc(px(cx),px(oy0),r,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=1;ctx.fillStyle='#fff6c0';
      ctx.beginPath();ctx.arc(px(cx)-1,px(oy0)-1,Math.max(1,r*0.45),0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#ffe080';                                // 4 枚向心聚能光点：2×2 硬边，1× 下也读得出「在聚气」
      for(let i=0;i<4;i++){
        const a=(+b.t||0)*3+i*Math.PI/2,rr0=r+4+(1-k)*14;   // 半径随 k 收向球面＝「在聚气」
        ctx.globalAlpha=0.5+0.5*k;
        ctx.fillRect(px(cx+Math.cos(a)*rr0)-1,px(oy0+Math.sin(a)*rr0)-1,2,2);
      }
      ctx.globalAlpha=1;
      for(const hz of game.hazards||[]){              // 圈还没生成（windup 期通常如此）→ 只留聚能球
        if(!hz||hz.kind!=='ward')continue;
        const wx=px(hz.x),wy=px(hz.y),wr=Math.max(8,+hz.r||22);
        ctx.globalAlpha=0.25+0.35*k;ctx.strokeStyle='#f8d048';ctx.lineWidth=1.5;
        if(ctx.setLineDash)ctx.setLineDash([4,3]);
        ctx.beginPath();ctx.arc(wx,wy,wr,0,Math.PI*2);ctx.stroke();
        if(ctx.setLineDash)ctx.setLineDash([]);
        ctx.globalAlpha=0.06+0.10*k;ctx.fillStyle='#f8d048';
        ctx.beginPath();ctx.arc(wx,wy,wr,0,Math.PI*2);ctx.fill();
      }
      ctx.globalAlpha=1;break;
    }
    case 'grab':{                                    // 抓取：面向侧红爪扇 + reach×h 半透范围框（站进去=被摔）
      const T=_bossCfg(b),reach=Math.max(8,+((T&&T.grab&&T.grab.reach)||46));
      const fx=b.face>0?b.x+b.w:b.x,dir=b.face>0?1:-1,rx0=b.face>0?fx:fx-reach;
      ctx.globalAlpha=0.08+0.14*k;ctx.fillStyle='#f84848';
      ctx.fillRect(px(rx0),px(top),reach,b.h);
      ctx.globalAlpha=0.45+0.5*k;ctx.strokeStyle='#f84848';ctx.lineWidth=1;
      ctx.strokeRect(px(rx0)+0.5,px(top)+0.5,reach-1,b.h-1);
      // 三根爪尖：从手部向外张开的像素三角，k 越大越长越亮
      const hy=top+b.h*0.42,len=5+k*8;
      ctx.globalAlpha=0.55+0.45*k;ctx.fillStyle='#ff8080';
      for(let i=0;i<3;i++){
        const yy=hy+(i-1)*7;
        ctx.beginPath();ctx.moveTo(px(fx),px(yy)-3);
        ctx.lineTo(px(fx+dir*len),px(yy));
        ctx.lineTo(px(fx),px(yy)+3);ctx.closePath();ctx.fill();
      }
      // v12 实机：光靠红框读不出「这是抓取不是普通攻击」，框顶挂一个「抓」字（框内居中、不挡本体）
      {
        const bx0=px(b.face>0?b.x+b.w:b.x),bw2=reach,bh2=b.h;
        const cx2=bx0+(b.face>0?bw2/2:-bw2/2),ty2=px(top)-13;
        const w2=Math.ceil(_textW('抓',8))+6;
        _panel(cx2-w2/2,ty2,w2,11,{cut:2,alpha:0.8});
        drawCNText('抓',cx2,ty2+1,8,'#ff8080','center');
      }
      ctx.globalAlpha=1;break;
    }
    case 'quake':{                                   // 劈地：举斧过顶（随 k 抬起）+ 地面横向蓄势线 + 朝向箭头
      const gy=px(top+b.h),hx=px(cx),lift=Math.round(6+k*10);
      ctx.fillStyle='#6a4428';ctx.fillRect(hx-1,px(top)-lift,2,15);       // 斧柄
      ctx.fillStyle='#c8d0e0';                                            // 斧刃（梯形）
      ctx.beginPath();ctx.moveTo(hx-9,px(top)-lift);ctx.lineTo(hx-3,px(top)-lift-6);
      ctx.lineTo(hx-3,px(top)-lift+5);ctx.lineTo(hx-9,px(top)-lift+3);ctx.closePath();ctx.fill();
      ctx.fillStyle='#f0f6ff';ctx.fillRect(hx-8,px(top)-lift-1,5,2);
      const dir=b.face>0?1:-1;
      ctx.globalAlpha=0.45+0.5*k;ctx.fillStyle='#f8a030';
      ctx.fillRect(px(cx)-26,gy-1,52,2);                                  // 蓄势线（贴地）
      ctx.fillStyle='#ffe0a0';ctx.fillRect(px(cx)-18,gy-2,36,1);
      for(let i=0;i<3;i++){                                               // 三组方向箭头：波往哪推一眼看出
        const ax=px(cx)+dir*(20+i*5);
        ctx.fillRect(ax-dir*3,gy-3,3,1);ctx.fillRect(ax-dir*3,gy+2,3,1);
      }
      ctx.globalAlpha=1;break;
    }
    case 'pillar':{                                  // 火柱：脚下 3 个红圈按 warn 时长逐一亮起（第三个亮=马上起柱）
      const T=_bossCfg(b),wt=+((T&&T.pillar&&T.pillar.warn)||0.9);
      const kp=clamp((+b.t||0)/wt,0,1),gy=px(top+b.h);
      for(let i=0;i<3;i++){
        const lit=clamp((kp-(i*0.28))/0.16,0,1);      // 依次点火：0 / 0.28 / 0.56 起亮
        const rr=5+lit*2.5,cxx=px(cx+(i-1)*22);
        ctx.globalAlpha=0.25+0.6*lit;
        ctx.strokeStyle=lit>0.5?'#ff7050':'#f84848';ctx.lineWidth=1.5;
        ctx.beginPath();ctx.arc(cxx,gy-2,rr,0,Math.PI*2);ctx.stroke();
        if(lit>0){
          ctx.globalAlpha=0.10+0.16*lit;ctx.fillStyle='#f84848';ctx.fill();
          ctx.globalAlpha=0.7;ctx.fillStyle='#ffd0c0';ctx.fillRect(cxx-1,gy-3,2,2);
        }
      }
      ctx.globalAlpha=1;break;
    }
    case 'core':{                                    // 核心护盾：胸口两侧悬起两枚金色核心虚影（该转火，不该继续砸 Boss）
      const cy0=top+b.h*0.40;
      for(let i=0;i<2;i++){
        const ox0=(i?1:-1)*(16+8*k),oy0=cy0+Math.sin((+b.t||0)*8+i*3)*2;
        ctx.globalAlpha=0.18+0.22*k;ctx.fillStyle='#f8d048';
        ctx.beginPath();ctx.arc(px(cx+ox0),px(oy0),6,0,Math.PI*2);ctx.fill();
        ctx.globalAlpha=0.55+0.45*k;ctx.fillStyle='#c89018';
        ctx.fillRect(px(cx+ox0)-3,px(oy0)-3,6,6);
        ctx.fillStyle='#fff6c0';ctx.fillRect(px(cx+ox0)-1,px(oy0)-1,3,3);
      }
      ctx.globalAlpha=1;break;
    }
    // v13 §六：五种新交互的专属前摇（图形 + 单字），延续 v12「一眼读懂该做什么」的原则：
    // 反=收手 / ?=看清再打 / 推=朝 Boss 跑 / 弹=记住二段落点 / 雾=立刻换位。
    // 全部画在本体附近（同屏可见），不建数组、不写引擎字段；bimg/bx/by 复用本体当前帧。
    case 'parry':{                                   // 反伤架势：金色盾形在身前张开（k 越大越亮越大）+「反」
      const dir=b.face>0?1:-1,fx=px(cx+dir*10),sy=px(top+b.h*0.45),r0=6+k*7;
      ctx.globalAlpha=0.28+0.32*k;ctx.fillStyle='#f8d048';
      ctx.beginPath();
      ctx.moveTo(fx,sy-r0);ctx.lineTo(fx+r0*0.8,sy-r0*0.55);
      ctx.lineTo(fx+r0*0.6,sy+r0*0.65);ctx.lineTo(fx,sy+r0*1.05);
      ctx.lineTo(fx-r0*0.6,sy+r0*0.65);ctx.lineTo(fx-r0*0.8,sy-r0*0.55);
      ctx.closePath();ctx.fill();
      ctx.globalAlpha=0.7+0.3*k;ctx.strokeStyle='#fff0b0';ctx.lineWidth=1;ctx.stroke();
      ctx.globalAlpha=1;
      _panel(cx-7,px(top)-15,14,12,{cut:2,alpha:0.8});
      drawCNText('反',cx,px(top)-14,8,'#f8d048','center');
      break;
    }
    case 'mirror':{                                  // 真假身：三具紫色残影（间距随 k 拉开）+「?」
      const sp=10+k*16;
      for(let i=0;i<3;i++){
        ctx.globalAlpha=0.16+0.20*k;
        const ox0=(i-1)*sp,oy0=(i===1?0:2);
        if(bimg&&bimg.width){
          const tint=tintOf(bimg,'#b060f0');
          ctx.drawImage(tint,px(bx+ox0),px(by+oy0));
        }else{
          ctx.fillStyle='#b060f0';
          ctx.fillRect(px(cx+ox0-10),px(top+oy0),20,b.h);
        }
      }
      ctx.globalAlpha=1;
      _panel(cx-7,px(top)-15,14,12,{cut:2,alpha:0.8});
      drawPixelText('?',cx,px(top)-13,2,'#c890ff','center');
      break;
    }
    case 'push':{                                    // 推进墙：朝向 3 枚推进箭头（要跟着跑）+「推」
      const dir=b.face>0?1:-1,gy=px(top+b.h*0.5);
      ctx.globalAlpha=0.4+0.5*k;ctx.strokeStyle='#f8a030';ctx.lineWidth=1.5;
      for(let i=0;i<3;i++){
        const ax=px(cx)+dir*(8+i*(7+k*4));
        ctx.beginPath();ctx.moveTo(ax,gy-6);ctx.lineTo(ax+dir*5,gy);ctx.lineTo(ax,gy+6);ctx.stroke();
      }
      ctx.globalAlpha=1;
      _panel(cx-7,px(top)-15,14,12,{cut:2,alpha:0.8});
      drawCNText('推',cx,px(top)-14,8,'#f8a030','center');
      break;
    }
    case 'bomb':{                                    // 弹跳炸弹：抛物线虚线 + 首落点小圈 +「弹」
      const dir=b.face>0?1:-1,sx=px(cx),sy=px(top)-2;
      const ex=sx+dir*34,ey=px(top+b.h+6);
      ctx.globalAlpha=0.5+0.35*k;ctx.strokeStyle='#f8a030';ctx.lineWidth=1;
      if(ctx.setLineDash)ctx.setLineDash([2,3]);
      ctx.beginPath();
      for(let i=0;i<=8;i++){
        const u=i/8,bxp=sx+(ex-sx)*u,byp=sy+(ey-sy)*u-26*Math.sin(Math.PI*u)*(0.6+0.4*k);
        if(i)ctx.lineTo(bxp,byp);else ctx.moveTo(bxp,byp);
      }
      ctx.stroke();
      if(ctx.setLineDash)ctx.setLineDash([]);
      ctx.beginPath();ctx.arc(ex,ey,4+k*2,0,Math.PI*2);ctx.stroke();   // 首落点
      ctx.globalAlpha=0.85;ctx.fillStyle='#f84848';ctx.fillRect(ex-1,ey-1,3,3);
      ctx.globalAlpha=1;
      _panel(cx-7,px(top)-15,14,12,{cut:2,alpha:0.8});
      drawCNText('弹',cx,px(top)-14,8,'#f8a030','center');
      break;
    }
    case 'mist':{                                    // 水雾：脚下青色气团扩散 +「雾」
      const gy=px(top+b.h);
      for(let i=0;i<3;i++){
        ctx.globalAlpha=0.14+0.16*k-i*0.03;ctx.fillStyle='#48d8d0';
        ctx.beginPath();ctx.arc(px(cx+(i-1)*12),gy-4-Math.sin(k*4+i)*3,7+3*k,0,Math.PI*2);ctx.fill();
      }
      ctx.globalAlpha=1;
      _panel(cx-7,px(top)-15,14,12,{cut:2,alpha:0.8});
      drawCNText('雾',cx,px(top)-14,8,'#48d8d0','center');
      break;
    }
    case 'totem':{                                   // 圣像审判：本体两侧各升起一根金色柱影 +「圣」
      // 落点绑「玩家两侧 ±72」而不是 Boss 身上——本体附近不给任何指向时，玩家读不出「柱子会立在哪儿」，
      // 两根随 k 长高的柱影就是位置预告（只到 26px 高，且远小于真柱，不会被误认成危险物）。
      for(let i=0;i<2;i++){
        const px0=px(cx+(i?26:-26)),gy=px(top+b.h),hgt=Math.max(4,Math.round(6+k*20));
        ctx.globalAlpha=0.22+0.33*k;ctx.fillStyle='#f8d048';
        ctx.fillRect(px0-2,gy-hgt,4,hgt);
        ctx.globalAlpha=0.50+0.40*k;ctx.fillStyle='#fff6c0';
        ctx.fillRect(px0-2,gy-hgt,4,2);
      }
      ctx.globalAlpha=1;
      _panel(cx-7,px(top)-15,14,12,{cut:2,alpha:0.8});
      drawCNText('圣',cx,px(top)-14,8,'#f8d048','center');
      break;
    }
  }
}

// v10 §任务2.2/§2.3：Boss 头顶状态标签（世界坐标，画在本体之上）。
// 连段 = 还没打完，别急着上前（红「连N」+ 呼吸红边）；破绽 = 唯一输出窗口（金「破绽」+ 身上淡黄描边）。
// 两者同时在时连段上移一行，互不遮挡；comboN/comboQ 缺失时整块不画（旧引擎零回归）。
function renderBossTags(b,tick){
  if(!b)return;
  const cx=px(b.x+b.w/2);
  let ty=px(b.y)-15;
  // v12 §任务6：五种新交互的头顶读数（全部缺失守卫；旧引擎没有这些字段时本段整体空转）。
  // ① 多段连撞：还要撞几段 → 「撞 N/M」（M 缺省只画 N），橙字 + 呼吸橙边
  if(b.state==='chargeRun'&&((b.chargeN|0)>0)){
    const n=b.chargeN|0,m=(b.chargeMax|0)||(((_bossCfg(b)||{}).charge||{}).hits|0);  // v12：hits 读平衡表（引擎不另发字段）
    const txt=m>0?(n+'/'+m):(''+n);
    const w=Math.ceil(_textW('撞',9))+8+Math.max(5,txt.length*4);
    _panel(cx-w/2,ty,w,13,{cut:2,alpha:0.82});
    drawCNText('撞',cx-w/2+5,ty+2,9,'#f8a030');
    drawPixelText(txt,cx+w/2-5,ty+4,1,'#f8d048','right');
    ctx.globalAlpha=0.45+0.45*Math.abs(Math.sin(tick*0.35));
    ctx.strokeStyle='#f8a030';ctx.lineWidth=1;
    ctx.strokeRect(cx-w/2+0.5,ty+0.5,w-1,12);ctx.globalAlpha=1;
    ty-=15;
  }
  // ② 蓄力全屏：打断进度条（clamp(quellDmg/breakDmg)，breakDmg 读不到按 12）；满值白闪 = 再一下就能断
  if(b.state==='quellCast'){
    const T=_bossCfg(b),bd=+((T&&T.quell&&T.quell.breakDmg)||12)||12;
    const p=clamp((+b.quellDmg||0)/bd,0,1),w=46;
    _panel(cx-w/2,ty,w,13,{cut:2,alpha:0.84});
    drawCNText('蓄',cx-w/2+5,ty+2,9,'#f8d048');
    ctx.fillStyle='#2a1408';ctx.fillRect(cx-w/2+14,ty+4,28,5);
    ctx.fillStyle=p>=1?'#ffffff':(p>0.66?'#ff7050':'#f8a030');
    ctx.fillRect(cx-w/2+14,ty+4,Math.round(28*p),5);
    if(p>=1){                                            // 满值白闪：只闪框与条，不动整屏（避免和 quellFlash 撞）
      ctx.globalAlpha=0.5+0.5*Math.abs(Math.sin(tick*0.5));
      ctx.strokeStyle='#ffffff';ctx.lineWidth=1;
      ctx.strokeRect(cx-w/2+13.5,ty+3.5,29,6);ctx.globalAlpha=1;
    }
    ty-=15;
  }
  // ③ 召唤回血：绿色「回」呼吸（低成本读数；血条高光由血条段自己判断）
  if((b.leechOn||0)>0){
    const a=clamp(+b.leechOn||0,0,1);
    ctx.globalAlpha=0.55+0.45*Math.abs(Math.sin(tick*0.18))*a;
    _panel(cx-8,ty,16,13,{cut:2,alpha:0.7});
    drawCNText('回',cx,ty+2,9,'#70f090','center');
    ctx.globalAlpha=1;
    ty-=15;
  }
  // v13 §六：反伤架势「反」红标——parryOn 期间普通攻击会被反弹，必须一眼看出「现在别打」
  // （大招才是正解），所以用红底红框 + 呼吸，与金色「破防/破绽」形成明确对立。
  if(b.parryOn){
    const w=16;
    _panel(cx-w/2,ty,w,13,{cut:2,alpha:0.86});
    drawCNText('反',cx,ty+2,9,'#ff8080','center');
    ctx.globalAlpha=0.45+0.45*Math.abs(Math.sin(tick*0.4));
    ctx.strokeStyle='#f84848';ctx.lineWidth=1;
    ctx.strokeRect(cx-w/2+0.5,ty+0.5,w-1,12);ctx.globalAlpha=1;
    ty-=15;
  }
  // v16 §三：圣像审判进行中——金「圣」+ 场上还剩几座没拆（这是本招的唯一失败条件，得一直挂在头上）。
  // 不按 b.state==='totemCast' 判：那个状态只活 0.45s，标签会闪一下就没，纯噪音；
  // 这招真正的读数是「引信烧完之前还有几座」，危险物还在场 = 还得去拆，所以条件就取 hazard 存活数。
  {
    let nT=0;
    const HZ=game.hazards;
    if(HZ)for(let i=0;i<HZ.length;i++){const z=HZ[i];if(z&&z.kind==='totem'&&(+z.hp||0)>0)nT++;}
    if(nT>0){
      const w=Math.ceil(_textW('圣',9))+8+5;             // 宽度口径同「撞 N」：字位 + 1 位数字位
      _panel(cx-w/2,ty,w,13,{cut:2,alpha:0.84});
      drawCNText('圣',cx-w/2+5,ty+2,9,'#f8d048');
      drawPixelText(''+nT,cx+w/2-5,ty+4,1,'#ffe070','right');
      ctx.globalAlpha=0.45+0.45*Math.abs(Math.sin(tick*0.32));
      ctx.strokeStyle='#f8d048';ctx.lineWidth=1;
      ctx.strokeRect(cx-w/2+0.5,ty+0.5,w-1,12);ctx.globalAlpha=1;
      ty-=15;
    }
  }
  // v13 §五：破防窗口「破防」+ 剩余条（宽度按 breakT/2.0 收缩；2.0 是契约里的破防总时长）。
  // 这是 v13 唯一的「打得更疼」窗口，必须比破绽更显眼：金字金框 + 条一亮一暗地呼吸。
  {
    const bt=clamp(+b.breakT||0,0,9);
    if(bt>0){
      const p=clamp(bt/2.0,0,1),w=46,x0=cx-w/2;
      _panel(x0,ty,w,13,{cut:2,alpha:0.88});
      drawCNText('破防',x0+4,ty+2,9,'#f8d048');
      ctx.fillStyle='#3a2c08';ctx.fillRect(x0+25,ty+4,18,5);
      ctx.fillStyle='#ffe070';ctx.fillRect(x0+25,ty+4,Math.round(18*p),5);
      ctx.globalAlpha=0.5+0.4*Math.abs(Math.sin(tick*0.3));
      ctx.strokeStyle='#f8d048';ctx.lineWidth=1;
      ctx.strokeRect(x0+24.5,ty+3.5,19,6);ctx.globalAlpha=1;
      ty-=15;
    }
  }
  if((b.comboN|0)>=1){
    // 中文走 drawCNText、数字走 drawPixelText（契约）：面板里是「连」+ 剩余招数（像素字）。
    const n=((b.comboQ&&b.comboQ.length)||1);
    const w=Math.ceil(_textW('连',9))+8+(n>1?5:0);
    _panel(cx-w/2,ty,w,13,{cut:2,alpha:0.82});
    drawCNText('连',n>1?cx-3:cx,ty+2,9,'#f84848','center');
    if(n>1)drawPixelText(''+n,cx+w/2-5,ty+4,1,'#f84848','center');
    ctx.globalAlpha=0.5+0.5*Math.abs(Math.sin(tick*0.3));
    ctx.strokeStyle='#f84848';ctx.lineWidth=1;
    ctx.strokeRect(cx-w/2+0.5,ty+0.5,w-1,12);ctx.globalAlpha=1;
    ty-=15;
  }
  if(b.state==='stagger'){
    const w=Math.ceil(_textW('破绽',9))+8;
    _panel(cx-w/2,ty,w,13,{cut:2,alpha:0.86});
    drawCNText('破绽',cx,ty+2,9,'#f8d048','center');
    ctx.globalAlpha=0.35+0.25*Math.sin(tick*0.25);      // 淡黄描边脉冲：远看也知道「现在能打」
    ctx.strokeStyle='#f8d048';ctx.lineWidth=2;
    ctx.strokeRect(px(b.x)-6,px(b.y)-4,b.w+12,b.h+8);   // 包到精灵外沿（body 64 宽 vs 命中框 52，只框命中框会切进贴图）
    ctx.globalAlpha=1;
  }
}

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
  // v7.9：部件表扩到 5 个（4=冥古龙 64×48、5=曜光·圣裁者 44×52）。美术并发交付，缺 boss4/boss5 时
  // 逐档向前回落（缺自己→上一档），**不允许整块 return**：旧写法 !P 直接返回会让新 Boss 整只隐形，
  // 玩家只能看见血条在掉——宁可先借上一只的贴图，也必须"Boss 一定看得见"。
  // v12：扩到 6 个（6=烈焰·牛魔王 56×48，美术并行交付中）——缺 boss6 → 借 boss4 → boss3，绝不隐形。
  const _bi=_bossIdx(b.kind);
  const P=[SPR.boss,SPR.boss2,SPR.boss3,SPR.boss4||SPR.boss3,SPR.boss5||SPR.boss4||SPR.boss3,
           SPR.boss6||SPR.boss4||SPR.boss3][_bi];
  if(!P)return; // 连回落档都没有（art 全缺）→ 整块不画（既有兜底保留）
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
  // v12：核心护盾期给本体套一层青色护罩——玩家打上去「没伤害」必须能立刻看出原因，
  // 否则会以为是自己没打中（实机截图里本体和常态几乎一样）。
  if(b.coreOn){
    const bcx2=b.x+b.w/2,bcy2=b.y+b.h/2,rx2=b.w/2+7,ry2=b.h/2+6;
    ctx.globalAlpha=0.14+0.05*Math.sin(tick*0.22);ctx.fillStyle='#8ad8f8';
    ctx.beginPath();ctx.ellipse(bcx2,bcy2,rx2,ry2,0,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=0.55+0.2*Math.sin(tick*0.22);ctx.strokeStyle='#bfeaff';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.ellipse(bcx2,bcy2,rx2,ry2,0,0,Math.PI*2);ctx.stroke();
    ctx.globalAlpha=1;
  }
  /* v13.1 实机补强：原来 parryCast 期间只有头顶一个「反」字标签，本体看不出和平时有什么不同，
     玩家第一反应是「为什么我打它不掉血」。护罩必须套在身上——打不动的东西要先看起来打不动。
     与 coreOn 的青色护罩同构，换金色 + 脉动更快（架势只有 1.8s，慢脉动看不出来）。 */
  if(b.parryOn){
    const gx=b.x+b.w/2,gy=b.y+b.h/2,grx=b.w/2+6,gry=b.h/2+5;
    ctx.globalAlpha=0.16+0.05*Math.sin(tick*0.30);ctx.fillStyle='#f8d048';
    ctx.beginPath();ctx.ellipse(gx,gy,grx,gry,0,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=0.70+0.20*Math.sin(tick*0.30);ctx.strokeStyle='#ffe9a0';ctx.lineWidth=2;
    ctx.beginPath();ctx.ellipse(gx,gy,grx,gry,0,0,Math.PI*2);ctx.stroke();
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
    case 'revive': dy=6;ad=20;eye='dizzy';break;                          // v7.9：击破后复活演出（约 0.9s，跪地+垂臂+晕眼；上浮/无敌由引擎走 y 与免伤表，UI 不接管）
    case 'intro': case 'enrage': dy=-2;ad=4;jaw=1;eye='rage';break;       // -2/4/开/红眼
    case 'dying': dy=12;ad=12;jaw=1;eye='dizzy';break;                    // 随引擎 y 下沉 +12/12/开/晕眼
    case 'sweepCast': dy=2;ad=20;jaw=1;eye='rage';break;                  // v7 §9.3：蛟龙扫尾
    case 'scytheCast': dy=-2;ad=2;jaw=1;eye='rage';break;                 // v7 §9.3：判官镰刀
    // v10 §任务2.1：五种新招的施法姿态（旧引擎不会进入这些 state，纯增量）
    case 'meteorCast': dy=-3;ad=6;jaw=1;eye='rage';break;                 // 召陨：后仰抬手
    case 'spikeCast': dy=4;ad=20;jaw=1;eye='rage';break;                  // 跺地：下沉垂臂
    case 'homingCast': ad=8;jaw=1;eye='rage';break;                       // 聚球：收臂于胸
    case 'cloneCast': ad=12;jaw=1;eye='rage';break;                       // 分裂：半张臂
    case 'pullCast': ad=2;jaw=1;eye='rage';break;                         // 吸附：前伸张手
    // v12 §任务4：五种新交互的施法姿态（旧引擎不会进入这些 state，纯增量）
    case 'quellCast': dy=-2;ad=4;jaw=1;eye='rage';break;                   // 蓄力：微仰、双臂上抬
    case 'grabCast': dy=1;ad=0;jaw=1;eye='rage';break;                     // 抓取：前扑、手臂抬到最高
    case 'quakeCast': dy=3;ad=18;jaw=1;eye='rage';break;                   // 劈地：下沉、双臂下垂抡斧
    case 'pillarCast': ad=8;jaw=1;eye='rage';break;                        // 火柱：半收臂踏地
    case 'coreCast': dy=-3;ad=6;jaw=1;eye='rage';break;                    // 核心：后仰张臂召唤
  }
  const baseA=(b.state==='dying'&&(tick%8<4))?0.5:1; // dying：(tick%8<4) 整体 alpha .5
  ctx.globalAlpha=baseA;
  const bimg=B[(tick*3|0)%B.length];                                     // body（呼吸帧=B 慢周期取 0/1）
  const bdx=b.x+(b.w-bimg.width)/2;                                      // 尺寸对齐 x（kind1=-6=现行一致）
  const bdy=_bossIdx(b.kind)===0?b.y-2:b.y+b.h-bimg.height;               // kind1 保留现行 -2（零回归）；kind2/3 底对齐
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
  const PW=[SPR.bossWhite,SPR.boss2White,SPR.boss3White,SPR.boss4White||SPR.boss3White,SPR.boss5White||SPR.boss4White||SPR.boss3White,
            SPR.boss6White||SPR.boss4White||SPR.boss3White][_bi]; // v12：白剪影同索引同样逐档回落；缺失则不闪白（守卫在下面）
  if(b.flashT>0&&PW){                                         // 白闪：同偏移再画一遍
    ctx.globalAlpha=baseA*clamp(b.flashT/0.12,0,1);
    ctx.drawImage(PW.body,px(bdx),px(bdy+dy));
    ctx.drawImage(PW.arm,px(b.x-10),px(b.y+12+ad));
    ctx.drawImage(flipCache(PW.arm),px(b.x+b.w-10),px(b.y+12+ad));
    ctx.drawImage(PW.jaw,px(b.x+16),px(b.y+36)); // bossWhite.jaw=开口白剪影单张（art.js §C5，非数组）
  }
  ctx.globalAlpha=1;
  // v10 §任务2.1：新招式前摇特效（世界坐标，画在本体之上；bimg/bdx/bdy+dy 供 clone 残影复用本体帧）
  renderBossWindupFx(b,bimg,px(bdx),px(bdy+dy));
  // v10 §任务2.2/§2.3：头顶状态标签（连段红「连N」/ 破绽金「破绽」+ 身上淡黄描边）
  renderBossTags(b,tick);
}

// v2 P1：英雄姿态选择（渲染与残影快照共用）。heroAttack/heroDash/heroSquash 为 P2 画师
// 待交付键——就位前自动回退既有帧，取帧式按 SPR.heroRun.length 自适应（3 帧现状/6 帧 P2 均可）。
// v6 波2 §F：朝向改由 heroLook 统一翻转（*L 变体=flipSprite(右向基准)，右向基准合成后翻转=原
// faceL 变体逐像素一致），本函数改传右向基准；fam 由 pose 分支给出（attack/dash/dashWind/cast→'atk'）。
// v19 §3.3：法师分支——magePoseImg 直接返回「已按朝向选好」的帧（法师无皮肤、无装备外观合成），
// 优先级 cast > attack > dash > air > run/idle，落地 squash 兜底；所有 SPR.mg* 键缺失时回落骑士帧。
function magePoseImg(tick){
  const p=game.player;
  if(!p)return SPR.heroIdle1;
  const flip=p.face<0;
  /* v19.4：法师也吃换色皮肤。sk=本套皮肤的法师帧集；blue（本命配色）/art 未合入 → null，
     此时一切走 SPR.mg*，与 v19 上线时逐像素一致（守卫式降级）。 */
  const sk=mageSkinFrames(progress.skin);
  const park=(k,fb)=>{ // 内部：单帧取帧——皮肤帧 > 法师帧 > 骑士帧；皮肤帧没有 ...L 变体，翻转用 flipCache
    // 注意键名：形参是 SPR 键（mgIdle1），皮肤帧集用的是姿态名（idle1）——去掉 mg 前缀再把首字母转小写。
    const mn=(k.indexOf('mg')===0)?(k.charAt(2).toLowerCase()+k.slice(3)):k;
    const sf=sk&&sk[mn];
    if(sf)return flip?flipCache(sf):sf;
    if(SPR[k])return flip?(SPR[k+'L']||SPR[k]):SPR[k];
    if(flip&&SPR[fb+'L'])return SPR[fb+'L'];
    return SPR[fb]||SPR.heroIdle1;
  };
  let img,anim;
  if(!p.onGround)anim=p.vy<0?'jump':'fall';
  else anim=Math.abs(p.vx)>10?'run':'idle';
  if(anim==='idle')img=(tick%40<38)?park('mgIdle1','heroIdle1'):park('mgIdle2','heroIdle2');
  else if(anim==='run'){
    const src=(sk&&sk.run&&sk.run.length)?sk.run:((SPR.mgRun&&SPR.mgRun.length)?SPR.mgRun:null);
    if(src){
      const i=(p.animT*12|0)%src.length;
      if(sk)img=flip?flipCache(src[i]||src[0]):(src[i]||src[0]);
      else img=(flip&&SPR.mgRunL&&SPR.mgRunL[i])?SPR.mgRunL[i]:src[i]; // 本命配色走预烘焙 ...L
    }
    else img=park('mgRun','heroRun');
  }
  else if(anim==='jump')img=park('mgJump','heroJump');
  else img=park('mgFall','heroFall');
  if(p.landT>0)img=park('mgSquash','heroSquash');            // 落地压扁帧（同骑士时机）
  if(p.dashT>0){                                            // 冲刺：蓄力期 dashWind、爆发/滑行 dash
    img=(0.28-p.dashT<0.05)?park('mgDashWind','heroDashWind'):park('mgDash','heroDash');
  }
  if(p.atkT>0||p.atkWind>0)img=park('mgAttack','heroAttack'); // 挥杖/法杖前刺
  if(p.castT>0)img=park('mgCast',SPR.heroAttackGold?'heroAttackGold':'heroAttack'); // 施法姿态最高优先
  return img;
}
function heroPoseImg(tick){
  if(game.hero==='mage')return magePoseImg(tick); // v19：法师走独立取帧（v19.4 起也吃换色皮肤）
  const p=game.player;
  let anim;
  if(!p.onGround)anim=p.vy<0?'jump':'fall';
  else anim=Math.abs(p.vx)>10?'run':'idle';
  let img,fam='idle';
  // v7.7：本帧只取一次当前皮肤帧集（art.js 侧有缓存，这里避免每处取帧重复调用）；
  // 未合入/缺键一律回落 SPR.*——与 v6 逐像素一致（守卫式降级，零回归）。
  const sk=skinFrames(progress.skin);
  const FR=(k,spr)=>(sk&&sk[k])?sk[k]:SPR[spr];
  if(anim==='idle')img=(tick%40<38)?FR('idle1','heroIdle1'):FR('idle2','heroIdle2');
  else if(anim==='run'){ // v2：6 帧取帧适配（animT*12%帧数）；帧数按实际数组长度自适应（皮肤同样适用）
    const run=(sk&&sk.run&&sk.run.length)?sk.run:SPR.heroRun;
    img=run[(p.animT*12|0)%run.length];
  }
  else if(anim==='jump')img=FR('jump','heroJump');
  else img=FR('fall','heroFall');
  if(p.landT>0){const s=FR('squash','heroSquash');if(s)img=s;} // 落地压扁帧（P2 就位后生效）
  // v5 §B1：冲刺三段——蓄力期（流逝 el=0.28-dashT<0.05）用后仰帧 heroDashWind（特效队供，
  // 无则 heroDash）；爆发/滑行沿用 heroDash。v4 引擎 dashT 总时长 0.18 → el 恒≥0.10，走 heroDash 不变。
  if(p.dashT>0){
    const w=FR('dashWind','heroDashWind'),d=FR('dash','heroDash');
    if(0.28-p.dashT<0.05&&w){img=w;fam='atk';}
    else if(d){img=d;fam='atk';}
  }
  if(p.djT>0)img=FR('jump','heroJump'); // v5 §B2：二段跳空翻用跳跃帧（360° 旋转由 _heroXform 实现）
  const atkImg=FR('attack','heroAttack');
  if((p.atkT>0||p.atkWind>0)&&atkImg){img=atkImg;fam='atk';} // 挥击帧（v5：含起手 atkWind 期）
  if(p.castT>0){ // v3 §C4：技能施法金色姿态（缺素材回退 heroAttack，同 v2 模式）
    // v7.7：heroAttackGold 是技能特效态，不随皮肤变（皮肤帧不参与本分支）
    if(SPR.heroAttackGold)img=SPR.heroAttackGold;
    else if(atkImg)img=atkImg;
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
    // v19 §3.3：法师用 mgFall（左向取 mgFallL，缺素材回落 heroFall）；骑士路径逐字不变
    const sk=skinFrames(progress.skin); // v7.7：死亡帧同样随皮肤（缺键/未合入 → SPR.heroFall）
    let df;
    if(game.hero==='mage'){ // v19.4：法师死亡帧也随皮肤；blue/未合入 → 本命 mgFall + 预烘焙 mgFallL
      const ms=mageSkinFrames(progress.skin);
      const f=(ms&&ms.fall)?ms.fall:(SPR.mgFall||SPR.heroFall);
      df=ms?(p.face<0?flipCache(f):f):(p.face<0?(SPR.mgFallL||f):f);
    }else df=heroLook((sk&&sk.fall)?sk.fall:SPR.heroFall,'idle'); // v6 §F：死亡分支直接调 heroLook（右向基准，朝向随 heroLook）
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
  if(game.hero==='mage')return; // v19 §3.3：法师无近战弧光（远程弹体由引擎渲染 shots，无需挥击弧）
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

// v19 §3.3：法师远程弹体（game.shots，引擎只写位置/判定，不绘制）——在 renderSlash 之后、世界空间调用。
// v19.3：只剩两种弹体——bolt（普攻 8×6 青白星弹）与 shard（霜爆新星 7×7 冰锥，八向同时飞）。
// 冰锥一律不旋转：素材本身是对称菱形，八向都读得出「冰」，省掉每个弹体一次 ctx.rotate。
function renderShots(){
  const arr=game.shots;
  if(!arr||!arr.length)return;
  const t=game.tick;
  for(const s of arr){
    if(s.born>0)continue;                             // 尚未出膛不画（字段仍在，供未来带延迟的弹体复用）
    let img=null;
    if(s.kind==='bolt')img=SPR.arcaneBolt&&SPR.arcaneBolt[(t>>2)%2];
    else if(s.kind==='shard')img=SPR.iceShard;
    const w=s.w||8,h=s.h||6;
    ctx.save();
    ctx.globalAlpha=clamp(s.life/0.12,0,1);
    ctx.translate(px(s.x)+Math.round(w/2),px(s.y)+Math.round(h/2));
    if((s.vx||0)<0)ctx.scale(-1,1);
    if(img)ctx.drawImage(img,-(img.width>>1),-(img.height>>1));
    else if(s.kind==='shard'){ctx.fillStyle='#14304f';ctx.fillRect(-3,-3,7,7);ctx.fillStyle='#a8e8ff';ctx.fillRect(-2,-2,5,5);ctx.fillStyle='#ffffff';ctx.fillRect(-1,-1,2,2);}
    else{ctx.fillStyle='#8ae8ff';ctx.fillRect(-1,-4,2,8);ctx.fillRect(-4,-1,8,2);ctx.fillStyle='#ffffff';ctx.fillRect(-1,-1,2,2);}
    ctx.restore();
  }
  ctx.globalAlpha=1;
}

// v19.3：引力奇点（game.wells，引擎只写位置/寿命，不绘制）——在世界空间、弹体之后画。
// 三段状态各有专属画法：飞行=紫尾点+小核 / 停驻=黑核+旋转吸积环+朝内吸的碎点 / 末段 0.2s 闪烁预警。
function renderWells(){
  const arr=game.wells;
  if(!arr||!arr.length)return;
  const t=game.tick;
  for(const w of arr){
    const cx=px(w.x+w.w/2),cy=px(w.y+w.h/2);
    const grow=w.stopped?1.4:0.62;                     // 停驻后本体膨胀到 1.4 倍（不用 1.7：14px 素材放大会糊成一块）
    // ① 吸力场（半径=真实吸附半径 r）：用径向渐变从中心向外淡出。
    //   ✗ 早先是「整圈平铺 #8a58d8 半透明」——叠在木箱和地面上会糊成一片灰雾，像贴了张脏玻璃。
    //   ✓ 改成中心暗、边缘全透明：读作「把光吸走」，也不会脏了背后的场景。
    if(w.stopped){
      const pulse=0.9+0.18*Math.sin(t*0.3);
      const g1=ctx.createRadialGradient(cx,cy,2,cx,cy,w.r);
      g1.addColorStop(0,'rgba(20,6,40,'+(0.40*pulse).toFixed(3)+')');
      g1.addColorStop(0.5,'rgba(34,12,64,'+(0.15*pulse).toFixed(3)+')');
      g1.addColorStop(1,'rgba(50,22,96,0)');
      ctx.fillStyle=g1;
      ctx.beginPath();ctx.arc(cx,cy,w.r,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=0.45;
      ctx.strokeStyle='#c8a8ff';ctx.lineWidth=1;
      ctx.beginPath();ctx.arc(cx,cy,w.r,0,Math.PI*2);ctx.stroke();
      ctx.globalAlpha=1;
    }
    // ② 吸积环（两圈反向旋转的弧）——放在本体**外面**：套在本体半径内会被素材整块盖住，看不见
    ctx.strokeStyle='#b090f8';ctx.lineWidth=1;
    for(let k=0;k<2;k++){
      const a0=t*0.055*(k?-1:1)+k*1.6,r=(w.stopped?13:6)+k*4;
      ctx.globalAlpha=0.55-k*0.2;
      ctx.beginPath();ctx.arc(cx,cy,r,a0,a0+2.2);ctx.stroke();
    }
    ctx.globalAlpha=1;
    // ③ 本体（素材两帧交替；末 0.2s 加速闪烁预警「要炸了」）
    //   不要再叠「半径 10 的半透黑圆」压暗层：素材核心已是不透明纯黑，外面再罩一层会在天空上留下
    //   一块硬边灰盘（读作脏）。背景压暗交给 ① 的径向渐变。
    const warn=w.life<=0.2?((t>>1)%2?0.35:1):1;
    const img=SPR.singularity&&SPR.singularity[(t>>2)%2];
    ctx.globalAlpha=warn;
    ctx.save();ctx.translate(cx,cy);ctx.scale(grow,grow);
    if(img)ctx.drawImage(img,-(img.width>>1),-(img.height>>1));
    else{ctx.fillStyle='#0e0620';ctx.fillRect(-3,-3,6,6);ctx.strokeStyle='#c8a8ff';ctx.strokeRect(-4,-4,8,8);}
    ctx.restore();
    ctx.globalAlpha=1;
  }
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
// v19 §3.3：法师「陨星风暴」覆盖层（屏幕坐标系；调用点同 renderUlt——renderFlash 之前）。
// 0~0.35 紫青压暗 + 玩家脚下双旋转环魔法阵（6 符文点，按 0.4 纵向压扁模拟地面透视）；
// 0.35~1.2 按 game.meteors 里 m.mage 的真实世界坐标换到屏幕画青紫陨星 + 落点 30px 光圈；
// 0.9~1.2 紫环扩散收尾（白闪仍由引擎 flashT → renderFlash 负责，不重复画）。
function renderMageUlt(){
  const u=game.ult,p=game.player;
  if(!p)return;
  const t=u.t||0;
  if(t<0.35){
    const a=0.42*Math.min(1,t/0.12);
    ctx.fillStyle='rgba(24,10,52,'+a.toFixed(3)+')';ctx.fillRect(0,0,VIEW_W,VIEW_H);
    const sx=px(p.x+p.w/2-game.cam.x),sy=px(p.y+p.h-game.cam.y),rot=t*10;
    ctx.save();ctx.translate(sx,sy);ctx.scale(1,0.4);
    ctx.strokeStyle='#a88af8';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.arc(0,0,20,0,Math.PI*2);ctx.stroke();
    ctx.strokeStyle='#48c8f8';ctx.lineWidth=1;
    ctx.beginPath();ctx.arc(0,0,14,rot,rot+Math.PI*1.35);ctx.stroke();
    ctx.beginPath();ctx.arc(0,0,14,rot+Math.PI,rot+Math.PI*2.35);ctx.stroke();
    ctx.fillStyle='#8ae8ff';
    for(let i=0;i<6;i++){const a2=rot*0.6+i*Math.PI/3;ctx.fillRect(Math.round(Math.cos(a2)*17)-1,Math.round(Math.sin(a2)*17)-1,2,2);}
    ctx.restore();
  }
  if(t>=0.35&&t<1.2){
    const meteors=game.meteors||[],si=SPR.starMeteor;
    for(const m of meteors){
      if(!m||!m.mage)continue;
      const sx=px(m.x-game.cam.x),sy=px(m.y-game.cam.y);
      // 30px 落点光圈（m.ring=世界地面线；未落地时也画，让玩家看清砸哪）
      if(typeof m.ring==='number'){
        const gy=px(m.ring-game.cam.y),pu=0.5+0.3*Math.sin(game.tick*0.4);
        ctx.globalAlpha=pu;ctx.strokeStyle='#a88af8';ctx.lineWidth=1;
        ctx.beginPath();ctx.ellipse(px(m.x-game.cam.x),gy,30,10,0,0,Math.PI*2);ctx.stroke();
        ctx.globalAlpha=1;
      }
      // 尾迹（4 段紫渐隐，向上）
      for(let k=1;k<=4;k++){
        ctx.globalAlpha=0.5-k*0.1;ctx.fillStyle=k<3?'#a88af8':'#8ae8ff';
        ctx.fillRect(sx,sy-k*6,3,5);
      }
      ctx.globalAlpha=1;
      const img=si&&si.length?si[((game.tick/4)|0)%si.length]:null;
      if(img)ctx.drawImage(img,sx-5,sy-6);
      else{ // 程序化兜底：青紫核心+白高光
        ctx.fillStyle='#a88af8';ctx.fillRect(sx-4,sy-5,8,10);
        ctx.fillStyle='#8ae8ff';ctx.fillRect(sx-3,sy-4,6,8);
        ctx.fillStyle='#ffffff';ctx.fillRect(sx-2,sy-3,3,3);
      }
    }
  }
  if(t>=0.9&&t<1.2){ // 紫环扩散收尾（白闪由 renderFlash 负责）
    const k=clamp((t-0.9)/0.3,0,1);
    const sx=px(p.x+p.w/2-game.cam.x),sy=px(p.y+p.h/2-game.cam.y);
    ctx.globalAlpha=1-k;ctx.strokeStyle='#a88af8';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(sx,sy,Math.max(0.1,40+220*k),0,Math.PI*2);ctx.stroke();
    ctx.strokeStyle='#48c8f8';ctx.lineWidth=1;
    ctx.beginPath();ctx.arc(sx,sy,Math.max(0.1,40+220*k-4),0,Math.PI*2);ctx.stroke();
    ctx.globalAlpha=1;
  }
}
function renderUlt(){
  const u=game.ult; if(!u||!u.on)return;
  if(game.hero==='mage'){renderMageUlt();return;} // v19 §3.3：法师大招独立演出，骑士路径逐字不变
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
// rgba(4,8,18,0.78) 铺底 → destination-out 径向渐变开洞：玩家中心 r110 + 每个 L.lanterns 中心
// r130×(0.92+0.08*sin(tick*0.13)) 摇曳 + 检查点/神龛 r24 微光（partial punch 0.55）→ drawImage 到主画布。
// v8.0：光圈 64→110 / 灯笼 80→130（纯纵向关 L17 宽 26 格=416px > 视口 384px，r64/r80 只照得亮脚下那块台，
// 对面墙与上一层落点全黑）；铺底 0.78 不变（要"看得清"，不是"取消黑暗"）。
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
  if(p)hole(px(p.x+p.w/2-cam.x),px(p.y+p.h/2-cam.y),110,1);
  for(const lt of L.lanterns||[]){ // 灯笼摇曳（§4.4：'R' 实体=光源，130px 光圈）
    const cx=lt.x+lt.w/2,cy=lt.y+lt.h/2;
    if(vis(cx,cy,140))hole(px(cx-cam.x),px(cy-cam.y),130*(0.92+0.08*Math.sin(tick*0.13)),1);
  }
  const glow=(x,y)=>{if(vis(x,y,40))hole(px(x-cam.x),px(y-cam.y),24,0.55);}; // 检查点/神龛 r24 微光
  for(const c of L.checkpoints||[])glow(c.x+8,c.y+12);
  for(const s of L.shrines||[])glow(s.x+8,s.y+12);
  o.globalCompositeOperation='source-over';
  ctx.drawImage(_darkCv,0,0);
}

// v8.0：可落脚瓦片的发光顶边（nether 专属）——黑暗层之上、HUD 之前调用（画在黑暗层下方会被压没）。
// 判定：本格实心且正上方一格不实心 → 顶边 1px 横线（只画上边，避免整屏描边网格）；屏幕坐标系，
// 与 renderDarkness 同口径（含视口裁剪），颜色 = nether accent 绿 #7ce8b8，极慢呼吸 alpha≈0.43..0.67。
function renderLedgeGlow(tick){
  const L=game.level;
  if(!L||!L.theme||L.theme.dark!==true||!L.meta||L.meta.theme!=='nether')return;
  const cam=game.cam;
  const x0=Math.max(0,Math.floor(cam.x/16)),x1=Math.min(L.tw-1,Math.ceil((cam.x+VIEW_W)/16));
  const y0=Math.max(0,Math.floor(cam.y/16)),y1=Math.min(L.th-1,Math.ceil((cam.y+VIEW_H)/16));
  ctx.fillStyle='rgba(124,232,184,'+(0.55+0.12*Math.sin(tick*0.09)).toFixed(3)+')';
  for(let ty=y0;ty<=y1;ty++)for(let tx=x0;tx<=x1;tx++){
    if(!L.solid(tx,ty,game.switchState))continue;      // 本格可站
    if(L.solid(tx,ty-1,game.switchState))continue;     // 头顶还有实心 → 不是台面
    ctx.fillRect(px(tx*16-cam.x),px(ty*16-cam.y),16,1);
  }
}

function renderHUD(){
  const L=game.level;
  // v5 §A-1/§E：顶栏换肤——深蓝半透底+下缘 1px 金细线；文字色按 §5.5 色系
  ctx.fillStyle='rgba(10,18,42,0.62)';ctx.fillRect(0,0,VIEW_W,16);
  ctx.fillStyle='#f0c860';ctx.fillRect(0,15,VIEW_W,1);
  // v12：长关卡名（19 · BOSS·火焰山·牛魔王 ≈ 150px）会压到 x=100 的金币图标上，
  // 实机截图里是「文字末尾和金币叠成一坨」。顶栏文字区固定 0..96：超长直接裁掉，
  // 完整名字在选关屏与 Boss 登场横幅里都有，这里不需要重复。
  ctx.save();ctx.beginPath();ctx.rect(0,0,96,16);ctx.clip();
  drawCNText(L.meta.name,5,3,10,'#f0f4ff');
  ctx.restore();
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
  const hd=heroDef(game.hero),mageHero=game.hero==='mage'; // v19：当前英雄表（HUD 图标/CD/法力文案的唯一来源）
  if(p&&typeof p.hp==='number'&&SPR.heartFull&&SPR.heartEmpty){
    const maxHp=p.maxHp||5;
    _panel(1,16,104,14,{cut:2});
    for(let i=0;i<maxHp;i++){
      if(p.invT>0&&game.tick%6<3)continue;               // 无敌闪烁：整排隔帧隐藏
      ctx.drawImage(i<p.hp?SPR.heartFull:SPR.heartEmpty,4+i*11,19);
    }
    if(p.hp<=2&&game.tick%30<15){ctx.strokeStyle='#f84848';ctx.strokeRect(2.5,17.5,101,11);} // 低血红框脉冲（随新面板宽）
  }
  // v19 §3.4：法师法力条（血条面板右下区内——MP 3×5 字 (62,20)、槽 (72,21,28,5)，不新增纵向空间）。
  // 低于「最便宜法术」的费用时红 #f87858 呼吸（任何法术都放不起）；否则 #48c8f8 静态填充。
  if(mageHero&&p){
    const costs=['u','i','l'].map(k=>((hd.skills[k]||{}).mana)||0).filter(v=>v>0);
    const lowCost=costs.length?Math.min.apply(null,costs):0;
    const mm=game.manaMax||100,mv=clamp(Number.isFinite(game.mana)?game.mana:0,0,mm);
    drawPixelText('MP',62,20,1,'#8ae8ff');
    ctx.fillStyle='#3a4468';ctx.fillRect(71,20,30,7);                 // 1px 外框
    ctx.fillStyle='#101a34';ctx.fillRect(72,21,28,5);                 // 空槽
    const low=lowCost>0&&mv<lowCost;
    ctx.fillStyle=low&&game.tick%30<15?'#f87858':'#48c8f8';
    if(mv>0)ctx.fillRect(72,21,Math.max(1,Math.round(28*mv/mm)),5);
  }
  // v3 §C②：Boss 血条（仅 boss 存在且非 dormant 显示）；v5 §A-4：条底深蓝+金细线
  // v7 §9.3：名字按 b.kind 参数化
  // v7.9 重排：名字改成**独占条上方一行**（旧版塞在条左端 82..134 的小牌里，红条从 128 起压住字尾，
  // 五个字的名字（曜光·圣裁者）只能缩到 7px 还读不出），血条整体下移到 y=29，两者纵向不重叠。
  const b=game.boss;
  if(b&&b.state!=='dormant'){
    const bk=_bossIdx(b.kind),BP=_bossProg(b);
    ctx.globalAlpha=b.state==='dying'?clamp(1-b.t/2.2,0,1):1; // dying：随 2.2s 渐隐
    // ① 名字行 y=15..27：左缘对齐条左缘 128，宽度随字宽（10px 名 + 左右内边距）
    // 只画深蓝底 + 底缘 1px 金线，**不包金框**——9px 金字套金框时字与框抢对比度，实测糊成一团读不出。
    // v10 §任务2.2：连段中名字牌向右加宽 14px 塞一个红「连」，并整牌呼吸红边（玩家扫一眼顶部就知道有后手）。
    const comboOn=(b.comboN|0)>=1;
    const nm=BOSS_NAME[bk],nw=Math.ceil(_textW(nm,10))+8+(comboOn?14:0);
    ctx.fillStyle='rgba(14,26,58,.86)';ctx.fillRect(128,15,nw,13);
    ctx.fillStyle='#f0c860';ctx.fillRect(128,27,nw,1);
    drawCNText(nm,132,16,10,'#f8d048');
    if(comboOn){
      ctx.globalAlpha=0.5+0.5*Math.abs(Math.sin(game.tick*0.3));
      ctx.strokeStyle='#f84848';ctx.lineWidth=1;
      ctx.strokeRect(128.5,15.5,nw-1,12);
      ctx.globalAlpha=1;
      drawCNText('连',128+nw-13,16,10,'#f84848');
    }
    // ② 段数徽标「x/3」贴该行最右端（右缘=条右缘 302）：2× 像素字=10px 高，满足「不小于 7px」。
    // 只在三段血成立时画——回落旧单条血时没有"段"这个概念，挂个 1/3 会误导。
    if(BP.seg){
      const lv=Math.max(1,BP.left);
      ctx.fillStyle='rgba(14,26,58,.82)';ctx.fillRect(274,16,28,11);
      ctx.strokeStyle='#f0c860';ctx.lineWidth=1;ctx.strokeRect(274.5,16.5,27,10);
      drawPixelText(lv+'/3',288,17,2,lv>1?'#f8d048':'#f87858','center');   // 最后一段转红，提示"最后一条命"
    }
    // ③ 血条 128..302 × 29..37（内区 129,30,172×8）
    ctx.fillStyle='rgba(14,26,58,.82)';ctx.fillRect(128,29,174,9);        // 条底深蓝
    ctx.strokeStyle='#f0c860';ctx.strokeRect(128.5,29.5,173,8);
    if((+b.breakT||0)>0){                             // v13 §五：破防期血条描边转金并呼吸（与「破防」条同一信号）
      ctx.save();
      ctx.globalAlpha=(b.state==='dying'?clamp(1-b.t/2.2,0,1):1)*(0.5+0.5*Math.abs(Math.sin(game.tick*0.35)));
      ctx.strokeStyle='#ffe070';ctx.lineWidth=2;
      ctx.strokeRect(127.5,28.5,175,10);
      ctx.restore();
    }
    if(BP.seg){
      const bx=129,by=30,bh=8;
      const txs=_bossTickXs(b);                         // v10 §任务3①：两条刻度线位置（唯一口径，按 maxHp 比例）
      const sw=txs[0]-bx;                               // 段宽同源（正常=172/3=57.33；血量 ×3 后不变）
      const fadeA=ctx.globalAlpha;                      // 保留 dying 渐隐（闪白要乘回去）
      // 填充几何只有一个来源：**当前段的 hp/bandMax 画在本段格子内**，从段左缘往右填。
      // total 是"整体剩余占比"（满血=1/3），只给文字/百分比用，绝不参与填充——这是本版最容易踩的坑。
      for(let i=0;i<3;i++){
        const xL=Math.round(bx+i*sw),xR=Math.round(bx+(i+1)*sw),w=xR-xL;
        // 段序：当前段=2-bandBreak（击破的永远是最右那几段），它左侧=尚未轮到的段（不填），右侧=已击破
        if(i>2-BP.brk){                                 // 已击破段：更暗的紫灰底 + 斜十字叉
          ctx.fillStyle='#2a2038';ctx.fillRect(xL,by,w,bh);
          // 叉用"每 14px 一枚 7×8 小叉横排重复"：段只有 8px 高，画一条通栏对角线斜率太缓，
          // 抗锯齿后是两道波浪（看着像噪点而非划掉）；小叉逐列落点、无 AA，1× 下也能看出是叉。
          ctx.fillStyle='#8a3040';                       // 暗红叉：暗底上纯黑看不见
          for(let ox=xL+5;ox<xR-3;ox+=14)
            for(let k=0;k<7;k++){
              const o=Math.round(k*(bh-1)/6);
              ctx.fillRect(ox+k,by+o,1,1);ctx.fillRect(ox+k,by+(bh-1)-o,1,1);
            }
        }else if(i<2-BP.brk){                           // 尚未轮到的段：整段满红（"这条命还没开打"=满血状态）
          // v7.9 口径：**红色占比必须等于剩余血量百分比**（玩家口径「血条分三份、击破回上一个阈值」：
          // 第一段打空 → 回到 2/3，条上正好剩两段红）。这里若画空槽，满血时整条只有右侧 1/3 是红的，
          // 会被读成"Boss 只剩三成血"，与三段血语义正好相反。
          ctx.fillStyle='#b0282a';ctx.fillRect(xL,by,w,bh);
          ctx.fillStyle='rgba(255,200,190,0.32)';ctx.fillRect(xL,by,w,1); // 顶部高光（弱于当前段）
          ctx.fillStyle='#241018';ctx.fillRect(xL,by+bh-1,w,1);           // 下缘压暗，与当前段亮顶形成层级
        }else{                                          // 当前段：段内 ratio = hp/bandMax
          const r=clamp(BP.cur/BP.bandMax,0,1),fw=Math.round(w*r);
          ctx.fillStyle='#22100f';ctx.fillRect(xL,by,w,bh);     // 已被打掉的残槽（近黑），与"未轮到"区分开
          if(fw>0){
            ctx.fillStyle=r>0.66?'#ff6250':r>0.33?'#f84848':'#d02c30'; // 剩得多亮红、见底转暗红（仍亮于已破段）
            ctx.fillRect(xL,by,fw,bh);
            ctx.fillStyle='rgba(255,208,190,0.55)';ctx.fillRect(xL,by,fw,1); // 顶部 1px 高光，拉开亮度层级
          }
        }
      }
      ctx.fillStyle='#0a0812';                          // 段间 1px 暗分隔线（画在填充之上才看得见）
      ctx.fillRect(Math.round(txs[0]),by,1,bh);ctx.fillRect(Math.round(txs[1]),by,1,bh);
      // 击破瞬间整条闪白：衰减完全读引擎的 b.bandFlashT 倒计时，UI 不自建计时器（否则两边节拍会错开）
      if(b.bandFlashT>0){
        ctx.globalAlpha=fadeA*clamp(b.bandFlashT*4,0,1)*0.8;
        ctx.fillStyle='#ffffff';ctx.fillRect(128,29,174,9);
        ctx.globalAlpha=fadeA;
      }
    }else{
      // v7.9：bandMax 缺失（引擎三段血未合入）→ 回落旧单条血，逐像素保持 v7 行为，保证老引擎不崩不空条
      const mx=b.maxHp||60,bw=clamp(172*b.hp/mx,0,172);
      ctx.fillStyle=b.phase===2?'#f84848':'#f8d048';                          // P2 变红
      ctx.fillRect(128,29,px(bw),9);
      ctx.fillStyle='#f0f4ff';ctx.fillRect(128+Math.round(172*(1-(BOSS_P2FRAC[bk]||0.5))),29,1,9); // P2 刻度线（50%/40%/40% 按 kind）
    }
    if(b.flashT>0.09){ctx.fillStyle='#ffffff';ctx.fillRect(128,29,174,9);}  // 受击 2 帧整条白
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
  // v19 §3.4：图标按英雄取（法师 mgU/I/O/L，缺素材回落骑士 skU/I/O/L）；字母 U/I/O/L 不变；
  // CD 分母改读 HEROES[hero].skills.<slot>.cd（不再硬编码 8/12/20/6——兜底表与 BAL 同值）。
  const HERO_SK=['u','i','o','l'],HERO_KEYS=['U','I','O','L'];
  const iconOf=(k,fb)=>(mageHero&&SPR[k])?SPR[k]:SPR[fb];
  const cdMaxOf=k=>{const s=hd.skills[k];return (s&&s.cd)||1;};
  const skDef=[['U',iconOf('mgU','skU'),cdMaxOf('u'),sk.u],
               ['I',iconOf('mgI','skI'),cdMaxOf('i'),sk.i],
               ['O',iconOf('mgO','skO'),cdMaxOf('o'),sk.o],
               ['L',iconOf('mgL','skL'),cdMaxOf('l'),sk.l]];
  const slotX=[];
  for(let i=0;i<4;i++){
    const x=162+i*22,y=198;slotX.push(x);
    _panel(x,y,16,16,{cut:2});
    const letter=skDef[i][0],icon=skDef[i][1],max=skDef[i][2],cd=skDef[i][3]||0;
    // v19：法力不足的槽位——图标压 35% 透明 + 左上 2×2 红点（与 CD 黑饼可同时存在）
    const cost=((hd.skills[HERO_SK[i]]||{}).mana)||0;
    const noMana=mageHero&&cost>0&&(Number.isFinite(game.mana)?game.mana:0)<cost;
    if(icon){if(noMana)ctx.globalAlpha=0.35;ctx.drawImage(icon,x+2,y+2);ctx.globalAlpha=1;}
    drawPixelText(letter,x+11,y+9,1,'#f0f4ff');
    if(noMana){ctx.fillStyle='#f84848';ctx.fillRect(x+2,y+2,2,2);}
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
  // v19 §3.4：法力不足提示（engine 置 game.manaToast=0.9；画在技能槽上方 (150,186)）
  if(mageHero&&(game.manaToast||0)>0){
    drawCNText('法力不足',150,186,9,'#f87858','center');
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
    const HR={hearts:[1,16,104,14],bossbar:[128,16,174,22],coins:[100,2,40,12],shrinehud:[4,VIEW_H-18,64,14]}; // v7.9：bossbar 随名字行+条下移
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
      else if(hover==='bossbar'&&game.boss){
        const bp=_bossProg(game.boss); // v7.9：段数/总进度走唯一口径（与条上的方块同源），三段血的 Boss 才带这两项
        drawTipCard(r,BOSS_NAME[_bossIdx(game.boss.kind)]+' · 阶段'+(game.boss.phase||1)+(bp.seg?'　剩 '+bp.left+'/3 段（'+Math.round(bp.total*100)+'%）':'')+'　'+BOSS_P2TIP[_bossIdx(game.boss.kind)]); // v7 §9.3 同参数化
      }
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
    // v19 §3.4：横幅按英雄取大招名（骑士 流星连斩 / 法师 陨星风暴）
    drawCNText('能量已满！按 O 释放'+(game.hero==='mage'?'陨星风暴':'流星连斩'),VIEW_W/2,VIEW_H-61,12,'#f8d048','center');
    ctx.globalAlpha=1;
  }
  // v8.0 删「L1 技能提示条」：背景常驻提示第一行已写「空格 / W 跳跃 · J 攻击 · K 冲刺」，开局 6 秒内
  // 再弹一条同样内容会重复，且该条 (VIEW_H-30,12 高) 正好压住 y=198 的技能槽。L1 只留背景版，其他关本就没这条。
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
  // v19 §3.4：四行文案改读 HEROES[game.hero].skills（名/说明/CD/法力）；旧骑士文案逐字保留（兜底表同值）。
  const hd=heroDef(game.hero);
  const LETTER=['U','I','O','L'][i];
  const info=hd.skills[['u','i','o','l'][i]]||{name:'-',desc:'',cd:1,mana:0};
  const sk2=game.skills||{u:0,i:0,o:0,l:0},cd=[sk2.u,sk2.i,sk2.o,sk2.l][i]||0;
  const cost=info.mana||0;
  const condOk=info.ult?(game.ultCharge||0)>=100:true;
  const cx=clamp(slotX-67,4,VIEW_W-154);
  _panel(cx,146,150,46,{cut:3});
  drawCNText(info.name,cx+6,150,10,'#f8d048');
  drawPixelText('KEY '+LETTER+'  '+(cd>0?('CD '+Math.ceil(cd)+'S'):'READY'),cx+6,161,1,'#a8b4d8');
  drawCNText(info.desc||'',cx+6,170,9,'#f0f4ff');
  if(cost>0){ // 法师 U/I/L：法力 30（当前 80）满足绿/不足红，后叠「冷却即用」
    const have=Number.isFinite(game.mana)?game.mana:0,enough=have>=cost;
    const s='法力 '+cost+'（当前 '+(have|0)+'）';
    drawCNText(s,cx+6,181,9,enough?'#8ad8a0':'#f87858');
    drawCNText('· 冷却即用',cx+9+_textW(s,9),182,8,'#a8b4d8');
  }else if(info.ult){ // O：充能条件（骑士原文逐字不变）
    drawCNText('命中积累能量，满 100 释放',cx+6,181,9,condOk?'#8ad8a0':'#f87858');
  }else{
    drawCNText('无（冷却即用）',cx+6,181,9,'#a8b4d8');
  }
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
// / 背包 4×3 (120+col*24, 64+row*24, 22×22) / 右碎片栏 (224..352, 24..134) / 按钮 (300,138/154/170,36×14)
//   v7.8：按钮行整体上移 12px——旧位 150/166/182 的「升阶」底边 196 与底部操作行 y=190 的快捷键文字重叠，
//   按钮被字压住，观感上就像个不可用的死按钮（玩家因此以为升阶没做）。
// / 关闭钮 (344,10,10×10) / 操作行 y=188/198。选中框白描边 2px（同谜题光标）；装备中右下小金点；
// MAX（r=4）金色。焦点三区 equip(3)→bag(12)→shard，Tab 循环。
function _bagBtn(x,y,label,on,hid){ // 内部：36×14 切角小按钮（不可用置灰；hover 白描边仅可用时）
  _panel(x,y,36,14,{cut:2,alpha:on?0.9:0.45});
  // v7.8：升阶钮不可用时要在格内报进度「升阶 2/3」，9px 实测溢出 36px 面板 → 超宽自动回落 7px；
  // 其余按钮文案短，永远走 9px 分支，观感与旧版一致。
  const fs=_textW(label,9)>32?7:9;
  drawCNText(label,x+18,y+(fs===9?2:3),fs,on?'#f0f4ff':'#5a6488','center');
  if(hover===hid&&on){ctx.strokeStyle='#fff8c8';ctx.lineWidth=1;ctx.strokeRect(x+0.5,y+0.5,35,13);}
}
function renderBag(tick){
  const p=game.player,eq=game.equip||{atk:0,hp:0,spd:0,cd:0};
  ctx.fillStyle='rgba(4,4,14,0.6)';ctx.fillRect(0,0,VIEW_W,VIEW_H); // §7.1：背景压暗 0.6
  _panel(24,8,336,208);
  // 左·角色区：外观预览 ×3（48×48）@ (44,24)（SPR.look 未合入=现主角帧直通）
  // v7.7：预览帧跟随当前皮肤（守卫：getHeroSkin 未合入 → SPR.heroIdle1）
  // v19 §3.2：法师→mgIdle1（无装备外观合成，缺素材回落骑士帧）
  // v19.4：法师肖像也跟随换色皮肤（blue → skinIdle1 内部回落 mgIdle1 本命配色）
  const pv=(game.hero==='mage')?skinIdle1(progress.skin):heroLook(skinIdle1(progress.skin),'idle');
  if(pv)ctx.drawImage(pv,44,24,48,48);
  // 属性行（读 game.equip；攻击=基攻+装备加成，加成绿字；§7.2/工单 §C）
  const atkBase=(typeof BAL!=='undefined'&&BAL&&BAL.player&&BAL.player.atkBase)||1;
  const atkStr='攻击 '+(atkBase+eq.atk);
  drawCNText(atkStr,34,90,9,'#f0f4ff');
  if(eq.atk>0)drawCNText('（+'+eq.atk+'）',34+_textW(atkStr,9),90,9,'#8ad8a0');
  drawCNText('生命 '+(p?p.hp:'-')+' / '+(p?p.maxHp:heroDef(game.hero).hpBase),34,102,9,'#f0f4ff');
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
  // 右·碎片栏（v7.8 改版）：固定 3 行·按槽位汇总——旧版按稀有度分桶最多 10 行，
  // 玩家看到「铁制武器碎片 x1 / 秘银武器碎片 x2」却不知道合计正好够升一阶，故统一到 _slotShardTotal 口径；
  // 合计≥BAL_GEAR_STEP 绿色 + 绿下划线（§7.2「对应可升阶物品高亮」的等价表达）。
  drawCNText('碎片 · 3个升1阶',224,13,9,'#f0f4ff');
  for(let i=0;i<3;i++){
    const slot='whc'[i],n=_slotShardTotal(slot),y=27+i*11,ok=n>=BAL_GEAR_STEP;
    if(bagFocus==='shard'&&bagSelShard===i){ // 选中框：白描边（i=槽位序，与 'whc'[i] 对应）
      ctx.strokeStyle='#ffffff';ctx.lineWidth=1;ctx.strokeRect(222.5,y-1.5,128,11);}
    drawCNText((EQ_SLOT_WORD[slot]||slot)+'碎片',224,y,9,'#f0f4ff');
    drawPixelText('x'+n,346,y+2,1,ok?'#8ad8a0':'#a8b4d8','right');
    if(ok){ctx.fillStyle='#8ad8a0';ctx.fillRect(224,y+9,120,1);}
  }
  // v7.8：常驻一行来源说明——「升阶」按钮灰着时玩家最需要知道碎片从哪来（不加弹窗、不过期）
  drawCNText('分解多余装备得碎片',224,62,9,'#a8b4d8');
  // 底·按钮行（§7.3 坐标；不可用置灰）：装备=bag 区选中 / 分解·升阶=焦点区选中（与 X/C 键同函数）
  {
    const selIt=bagFocus==='equip'?_equipZoneItem():_bagItem(bagSelBag);
    const bagIt=_bagItem(bagSelBag);
    const canEquip=!!bagIt&&_equippedId(bagIt.slot)!==bagIt.id;
    const canSalv=!!selIt&&!isEquippedItem(selIt);
    const canUp=!!selIt&&selIt.r<4&&_slotShardTotal(selIt.slot)>=BAL_GEAR_STEP;
    // v7.8：不可用时按钮直接报进度「升阶 2/3」——灰按钮不给原因=玩家以为功能没做；
    // 分母 BAL_GEAR_STEP、分子封顶到分母（攒多件碎片时不显示 5/3 这种困惑数字）
    const upLabel=!selIt?'升阶':(canUp?'升阶':'升阶 '+Math.min(_slotShardTotal(selIt.slot),BAL_GEAR_STEP)+'/'+BAL_GEAR_STEP);
    _bagBtn(300,138,'装备',canEquip,'btn:equip');
    _bagBtn(300,154,'分解',canSalv,'btn:salvage');
    _bagBtn(300,170,upLabel,canUp,'btn:upgrade');
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

// ---------- v7.7 衣橱面板（title/select 覆盖层；_panel 切角语言，布局 42,24,300,172） ----------
// 6 列 × 3 行、格 40×36、pitch 46×38（几何常量 WD_* 与 computeHover 同源，见 _skinCellXY）：
// 格内缩略 16×20 @ (格x+12, 格y+3) / 名字 7px y+25 / 已装备=金描边+四角亮块 / 光标=白描边 2px。
function _skinLock(cx,cy,col){ // 内部：锁形（照选关屏章锁画法：锁钩 arc + 锁体 fillRect，居中于 cx,cy）
  ctx.strokeStyle=col;ctx.lineWidth=1;
  ctx.beginPath();ctx.arc(cx,cy-2,3,Math.PI,0);ctx.stroke();
  ctx.fillStyle=col;ctx.fillRect(cx-4,cy+1,8,7);
}
function renderWardrobe(tick){
  const pnl=WD_PANEL;
  ctx.fillStyle='rgba(4,4,14,0.72)';ctx.fillRect(0,0,VIEW_W,VIEW_H);
  _panel(pnl[0],pnl[1],pnl[2],pnl[3],{titleBar:1});
  drawCNText('衣橱 · 已解锁 '+skinOwned()+'/'+SKIN_MAX,VIEW_W/2,pnl[1]+6,13,'#f8d048','center');
  // 关闭钮（鼠标；键盘 Esc/G）
  _panel(322,28,12,12,{cut:2,alpha:0.9});
  drawPixelText('X',325,31,1,'#f0f4ff');
  if(hover==='skinclose'){ctx.strokeStyle='#fff8c8';ctx.lineWidth=1;ctx.strokeRect(322.5,28.5,11,11);}
  for(let i=0;i<SKIN_MAX;i++){
    const id=SKIN_LIST[i].id,own=progress.skins.indexOf(id)>=0,cur=progress.skin===id;
    const xy=_skinCellXY(i),x=xy[0],y=xy[1];
    _panel(x,y,WD_CELL[0],WD_CELL[1],{cut:3,alpha:own?0.85:0.5});
    if(own){
      const th=skinIdle1(id);                 // v7.7：缩略图用该皮肤 idle1（未合入/缺键 → SPR.heroIdle1）
      // v19.4：法师帧是 16×16，骑士是 16×20——按 16×20 拉伸会把法师压扁，故按角色换目标框并居中
      if(th){
        if(game.hero==='mage')ctx.drawImage(th,x+12,y+5,16,16);
        else ctx.drawImage(th,x+12,y+3,16,20);
      }
      drawCNText(SKIN_LIST[i].name||id,x+20,y+25,7,cur?'#f8d048':'#dfe4f4','center');
    }else{ // 未解锁：格面压暗 + 中央锁形 + 名字 ???
      ctx.fillStyle='rgba(4,8,20,0.55)';ctx.fillRect(x+2,y+2,WD_CELL[0]-4,WD_CELL[1]-4);
      _skinLock(x+20,y+15,'#5a6488');
      drawCNText('???',x+20,y+25,7,'#5a6488','center');
    }
    if(cur){ // 已装备：整格暖金薄染 + 四角亮块（亮块落在格外 2px 的缝里——光标白框压不到它，
      // 保证「光标停在这一格」时玩家依然看得出「这一格就是当前装备」）
      ctx.fillStyle='rgba(248,208,72,0.13)';ctx.fillRect(x+2,y+2,WD_CELL[0]-4,WD_CELL[1]-4);
      ctx.strokeStyle='#f8d048';ctx.lineWidth=2;ctx.strokeRect(x+1,y+1,WD_CELL[0]-2,WD_CELL[1]-2);
      ctx.fillStyle='#fff8c8';
      ctx.fillRect(x-2,y-2,3,3);ctx.fillRect(x+WD_CELL[0]-1,y-2,3,3);
      ctx.fillRect(x-2,y+WD_CELL[1]-1,3,3);ctx.fillRect(x+WD_CELL[0]-1,y+WD_CELL[1]-1,3,3);
    }
    if(wardrobeSel===i){ // 光标：白描边 2px（同选关屏 sel）
      ctx.strokeStyle='#ffffff';ctx.lineWidth=2;ctx.strokeRect(x+1,y+1,WD_CELL[0]-2,WD_CELL[1]-2);
    }else if(hover==='skin:'+i){ctx.strokeStyle='#fff8c8';ctx.lineWidth=1;
      ctx.strokeRect(x+0.5,y+0.5,WD_CELL[0]-1,WD_CELL[1]-1);}
  }
  drawCNText('方向 选择 · 回车 装备 · G/Esc 关闭',VIEW_W/2,pnl[1]+pnl[3]-20,9,'#a8b4d8','center');
  renderBagFloats(); // v7.7：装备浮字（已装备 · 草绿）复用背包浮字管线，锚点落在面板底部
}

// ---------- v19 §3.1 选角面板渲染（title/select 覆盖层；几何常量 HERO_* 与 computeHover 同源） ----------
// 布局：面板 42,24,300,190；双卡 126×142 @ y=46（左 52 / 右 206）；头像 16×16 放大 3 倍 = 48×48；
// 卡内：名 11px y+58 / 心数 y+71 / MP 行 y+82 / 四技能行 y+94+12i（名 8px + 键位 + CD + 法力）；
// 当前英雄=金框 + 右上「使用中」徽标；光标=白 2px；底栏两行「C/Esc 关闭」「下一关生效」。
function renderHeroSelect(tick){
  ctx.fillStyle='rgba(4,4,14,0.72)';ctx.fillRect(0,0,VIEW_W,VIEW_H);
  _panel(HERO_PANEL[0],HERO_PANEL[1],HERO_PANEL[2],HERO_PANEL[3],{titleBar:1});
  drawCNText('角色 · 选择出战英雄',VIEW_W/2,30,13,'#f8d048','center');
  _panel(322,28,12,12,{cut:2,alpha:0.9});
  drawPixelText('X',325,31,1,'#f0f4ff');
  if(hover==='heroclose'){ctx.strokeStyle='#fff8c8';ctx.lineWidth=1;ctx.strokeRect(322.5,28.5,11,11);}
  for(let i=0;i<HERO_IDS.length;i++){
    const id=HERO_IDS[i],h=heroDef(id),xy=_heroCardXY(i),x=xy[0],y=xy[1];
    const cur=progress.hero===id,sel=heroSel===i;
    _panel(x,y,HERO_CARD_W,HERO_CARD_H,{cut:3,alpha:cur?0.92:0.8});
    // 头像 48×48（mage=mgIdle1；缺素材回落骑士 idle1；不叠皮肤装备）
    const img=heroFrame(id);
    if(img)ctx.drawImage(img,x+39,y+7,48,48);
    drawCNText(h.name,x+63,y+58,11,cur?'#f8d048':'#f0f4ff','center');
    // 心数（hpBase；缺 heartFull 时程序化红块兜底）
    const hn=h.hpBase|0,hx0=x+63-(hn*10)/2;
    for(let k=0;k<hn;k++){
      if(SPR.heartFull)ctx.drawImage(SPR.heartFull,Math.round(hx0+k*10),y+71);
      else{ctx.fillStyle='#f84848';ctx.fillRect(Math.round(hx0+k*10),y+71,8,7);}
    }
    // MP（有/无）
    drawCNText(h.usesMana?'MP 100':'无 MP',x+63,y+82,8,h.usesMana?'#48c8f8':'#8a94b8','center');
    // 四条技能：名 8px + 键位徽标 + CD 秒 + 法力
    for(let s=0;s<4;s++){
      const key='uiol'[s],si=h.skills[key]||{name:'-',cd:1,mana:0},ry=y+94+s*12;
      drawCNText(si.name,x+6,ry,8,'#dfe4f4');
      _panel(x+44,ry-1,8,9,{cut:1,alpha:0.5});
      drawPixelText('UIOL'[s],x+46,ry+1,1,'#f8d048');
      drawPixelText('CD'+(si.cd|0),x+55,ry+2,1,'#a8b4d8');
      if(si.mana>0)drawPixelText('M'+si.mana,x+92,ry+2,1,'#48c8f8');
    }
    if(cur){ // 当前出战：金框 + 「使用中」徽标（徽标落在头像右侧空隙，不压头像）
      ctx.strokeStyle='#f8d048';ctx.lineWidth=2;
      ctx.strokeRect(x+1,y+1,HERO_CARD_W-2,HERO_CARD_H-2);
      ctx.fillStyle='rgba(248,208,72,0.16)';ctx.fillRect(x+HERO_CARD_W-34,y+4,30,11);
      ctx.strokeStyle='#f8d048';ctx.lineWidth=1;ctx.strokeRect(x+HERO_CARD_W-33.5,y+4.5,29,10);
      drawCNText('使用中',x+HERO_CARD_W-19,y+5,7,'#f8d048','center');
    }
    if(sel){ // 光标：白 2px（同衣橱/选关）
      ctx.strokeStyle='#ffffff';ctx.lineWidth=2;
      ctx.strokeRect(x+1,y+1,HERO_CARD_W-2,HERO_CARD_H-2);
    }else if(hover==='hero:'+i){
      ctx.strokeStyle='#fff8c8';ctx.lineWidth=1;
      ctx.strokeRect(x+0.5,y+0.5,HERO_CARD_W-1,HERO_CARD_H-1);
    }
  }
  drawCNText('←→ 选择 · 回车 使用 · C/Esc 关闭',VIEW_W/2,195,9,'#a8b4d8','center');
  drawCNText('选角后下一关生效',VIEW_W/2,204,9,'#f8d048','center');
}

// v6 波2 §B：背包浮字渲染（屏幕中层居中堆叠；≤4 条 2s 消隐尾 0.5s 渐隐——本地渲染不经 engine 池，H4）
function renderBagFloats(){
  // v7.7：衣橱面板（title/select）也复用这套浮字，故放开 uiState==='play' 的单一门控
  if((uiState!=='play'&&!wardrobeOpen)||!_bagFloats.length)return;
  for(let i=0;i<_bagFloats.length;i++){const f=_bagFloats[i];
    ctx.globalAlpha=f.t>1.5?clamp((2-f.t)/0.5,0,1):1;
    // v7.5：带锚点的浮字（谜题层提示扣费）落在锚点处，缺省仍为背包层居中堆叠
    drawCNText(f.text,f.x!=null?f.x:VIEW_W/2,(f.y!=null?f.y:84)+i*13,f.big?10:9,f.color,'center');
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
  drawCNText(BOSS_NAME[_bossIdx(b.kind)],bx,86,26,'#f8d048','center'); // v7 §9.3：登场横幅随 Boss kind 参数化
  if(_bossIdx(b.kind)===0)drawPixelText('STARCORE BEHEMOTH',VIEW_W/2,120,1,'#f0f0f8','center'); // 英文副标=星核专属（新 Boss 无译名，不杜撰）
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
    // v7.7：通关掉落反馈——本关首次通关=金色「获得新衣 · 草绿」+ NEW 角标（音效在结算分支里播）；
    // 已解锁过=灰色衣橱进度（不重复掉、不误导玩家以为又掉了一件）。
    if(clearSkinGain){
      const nm=skinName(clearSkinGain);
      drawCNText('获得新衣 · '+nm,VIEW_W/2,116,11,'#f8d048','center');
      drawPixelText('NEW',VIEW_W/2+_textW('获得新衣 · '+nm,11)/2+6,119,1,'#fff8c8');
    }else drawCNText('衣橱 · 已解锁 '+skinOwned()+'/'+SKIN_MAX,VIEW_W/2,116,11,'#a8b4d8','center');
    // v11 §任务4：封印解除方式——放在现有结算信息的最后一行（衣橱行 116）下方，9px 金色；
    // via 为 boss/null/缺失时不画（Boss 关豁免封印，不该出现「封印解除」字样）。
    const via=game.seal?game.seal.via:null;
    const viaTxt=via==='battle'?'封印解除：武力':via==='coin'?'封印解除：探索'
      :via==='puzzle'?'封印解除：智慧':'';
    if(viaTxt)drawCNText(viaTxt,VIEW_W/2,128,9,'#f8d048','center');
    if(clearShown>1){
      const blink=tick%50<32;
      if(blink)drawCNText(game.levelIdx<ALL_LEVELS.length-1?'回车 · 下一关　Esc · 选关':'回车 · 通关结算',
        VIEW_W/2,viaTxt?140:138,11,'#ffffff','center'); // v11：封印行占位时提示下移 2px 防叠字
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
  // v19 §3.3：当前英雄=法师且 SPR.cover.mageSil 就位 → 画法师剪影（同位置同悬浮）；否则原勇者剪影。
  const hdy=118+Math.round(Math.sin(tick*0.03+1)*2);
  if(progress.hero==='mage'&&cov.mageSil)ctx.drawImage(cov.mageSil,96,hdy);
  else if(cov.heroSil)ctx.drawImage(cov.heroSil,96,hdy);
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
  // 9.5 v7.7 §1：全关开放开关（y=110..128，在云海 A 层 y=132 之上、开始钮 y=146 之上，零重叠）。
  // 开=金色描边+金呼吸+轨道右置+「全关开放」；关=灰描边+轨道左置+「按序解锁」；右侧 F 键位徽标。
  // x 从 140 起：避开左下主角剪影（96,118 24×28 → 右缘 120），不压 Boss 巨影（250,22 区域）。
  {
    const ux=140,uy=110,uw=104,uh=18,on=progress.unlockAll===true;
    _panel(ux,uy,uw,uh,{cut:3,alpha:on?0.92:0.55});
    if(on){
      ctx.globalAlpha=0.35+0.3*Math.sin(tick*0.08);
      ctx.strokeStyle='#f8d048';ctx.lineWidth=1;_panelPath(ux,uy,uw,uh,3);ctx.stroke();
      ctx.globalAlpha=1;
    }else{
      ctx.strokeStyle='#5a6488';ctx.lineWidth=1;_panelPath(ux,uy,uw,uh,3);ctx.stroke(); // 灰描边压住金线
    }
    const tx=ux+7,ty=uy+5;
    ctx.fillStyle=on?'#f8d048':'#3a4468';ctx.fillRect(tx,ty,16,8);
    ctx.fillStyle=on?'#fff8c8':'#8a94b8';ctx.fillRect(on?tx+9:tx+1,ty+1,6,6);
    drawCNText(on?'全关开放':'按序解锁',ux+28,uy+4,9,on?'#f8d048':'#8a94b8');
    _panel(ux+84,uy+4,13,10,{cut:2,alpha:0.5});
    drawPixelText('F',ux+88,uy+7,1,on?'#f8d048':'#a8b4d8');
    if(hover==='titleUnlock'){ctx.strokeStyle='#fff8c8';ctx.lineWidth=1;_panelPath(ux,uy,uw,uh,3);ctx.stroke();}
  }
  // 9.6 v7.7：衣橱入口（与开关同一行右侧，G 键位徽标；原「成长」按钮原位改造）
  {
    const mx0=250,my0=110,mw=72,mh=18;
    _panel(mx0,my0,mw,mh,{cut:3,alpha:0.8});
    drawCNText('衣橱',mx0+13,my0+4,9,'#f0f4ff');
    _panel(mx0+39,my0+4,13,10,{cut:2,alpha:0.5});
    drawPixelText('G',mx0+43,my0+7,1,'#f8d048');
    if(hover==='titleWardrobe'){ctx.strokeStyle='#fff8c8';ctx.lineWidth=1;_panelPath(mx0,my0,mw,mh,3);ctx.stroke();}
  }
  // 9.7 v19 §3.1：角色入口（328,110,50,18；C 键位徽标，与衣橱同排、右缘 378 不越 384）
  {
    const hx=328,hy=110,hw=50,hh=18;
    _panel(hx,hy,hw,hh,{cut:3,alpha:0.8});
    drawCNText('角色',hx+5,hy+4,9,'#f0f4ff');
    _panel(hx+33,hy+4,12,10,{cut:2,alpha:0.5});
    drawPixelText('C',hx+36,hy+7,1,'#f8d048');
    if(hover==='titleHero'){ctx.strokeStyle='#fff8c8';ctx.lineWidth=1;_panelPath(hx,hy,hw,hh,3);ctx.stroke();}
  }
  // 10 底部操作条：切角面板内现有按键提示行
  _panel(32,198,320,18,{alpha:0.5,cut:2});
  drawPixelText('ARROWS/WASD MOVE  SPACE JUMP  F UNLOCK  G WARDROBE  C HERO  M SOUND',VIEW_W/2,204,1,'#f0f4ff','center');
  ctx.restore();
}

// ---------- v7 §9.2：章节化选关屏（384×224；章头 12px + 卡行 46×44 pitch 53） ----------
// 章首表 [章首 0 基 idx, 章长]；CH_NAME/CH_HEAD_Y/CH_CARD_Y 下标=章号（y=章头 24/86/148、卡行 34/96/158）。
// 截断规则（工单任务2 过渡期兼容）：ALL_LEVELS.length≤10（章节文件未合入）→ 单章画**全部**关卡
// （"10 关时只画第一章"：若只画 7 卡则 L8~L10 不可选，违背"选关屏必须照常可用"，交付说明记录），
// 并按 7 列换行（第二行 y=34+62=96——一章 7 卡后越出 384 画布，wrap 由 _cardXY 消费）；
// ≥11 关按表截断：章显示条件=章首 idx<length，章长=min(声明,余量)——13 关=两章、16 关=三章、
// 15 关=第三章 2 卡；13 关时第三章头=13 但空章不显示。
// v7.9：第三章 3→5 关（新增 L17/L18）。章长仍按 min(声明, 余量) 截断——章节文件只到 L16 时实际画 3 卡，
// 关卡补齐后自动变 5 卡，无需再改本表；一排放 5 张卡：x=6+j*53，第 5 张左缘 218、右缘 264，画布 384 内不越界。
// v12：末章改为「吃掉剩余关」——原表第三章声明 5 关（idx 13~17），加 L19 后 idx18 没有卡位，
// 选关屏画不出第 19 关（光标 clamp 到 18 却停在空白处），玩家只能靠通关 L18 后回车一次进，等于"找不到牛魔王"。
// 现在末章 len=min(7, n-章首)，一行上限 7 卡：x=6+6*53=324，右缘 370 < 384 不越界。
const CH_HEAD=[[0,7],[7,6],[13,5]];
const CH_NAME=['第一章·星之大陆','第二章·星海巡旅','第三章·幽冥终章'];
const CH_HEAD_Y=[24,86,148],CH_CARD_Y=[34,96,158],CH_ROW_MAX=7; // 单行卡位上限（画布宽 384 内）
function _chapters(){
  const n=ALL_LEVELS.length,out=[];
  if(n<=10)return[{i:0,first:0,len:n,wrap:7}];
  for(let c=0;c<CH_HEAD.length&&CH_HEAD[c][0]<n;c++){
    const last=c===CH_HEAD.length-1||CH_HEAD[c+1][0]>=n;  // 末章（或后继章首已越界）
    const len=last?Math.min(CH_ROW_MAX,n-CH_HEAD[c][0])
                  :Math.min(CH_HEAD[c][1],n-CH_HEAD[c][0]);
    out.push({i:c,first:CH_HEAD[c][0],len,wrap:0});
  }
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
  // v7.7：选关屏常驻「衣橱入口」（G 键 / 鼠标点按钮等价）；全关开放时左上角加金标。
  // 成长/金币条已随局外成长撤销一并删除（不再有持久货币可展示）。
  {
    _panel(316,20,62,13,{cut:2,alpha:0.75});
    drawCNText('衣橱',322,22,9,'#f0f4ff');
    _panel(346,22,11,9,{cut:2,alpha:0.5});
    drawPixelText('G',349,24,1,'#f8d048');
    if(hover==='menuWardrobe'){ctx.strokeStyle='#fff8c8';ctx.lineWidth=1;
      _panelPath(316,20,62,13,2);ctx.stroke();}
    // v19 §3.1：选关屏角色入口（252,20,60,13；C 徽标）
    _panel(252,20,60,13,{cut:2,alpha:0.75});
    drawCNText('角色',258,22,9,'#f0f4ff');
    _panel(294,22,11,9,{cut:2,alpha:0.5});
    drawPixelText('C',297,24,1,'#f8d048');
    if(hover==='menuHero'){ctx.strokeStyle='#fff8c8';ctx.lineWidth=1;
      _panelPath(252,20,60,13,2);ctx.stroke();}
    if(progress.unlockAll===true)drawCNText('全关开放',6,2,9,'#f8d048'); // 顶栏状态标（y=2，不压章头 y=24）
  }
  for(const ch of _chapters()){
    const hy=CH_HEAD_Y[ch.i];
    const chLocked=chapterLocked(ch); // v7.7：章锁定（全关开放时恒 false，不改 unlocked 本身）
    drawCNText(CH_NAME[ch.i],6,hy,12,chLocked?'#3a4468':'#f0f4ff');
    if(chLocked){ // 章名后挂锁形 6×8 程序化（锁钩+锁体）
      const lx=6+Math.ceil(_textW(CH_NAME[ch.i],12))+6,ly=hy+1;
      ctx.strokeStyle='#3a4468';ctx.lineWidth=1;
      ctx.beginPath();ctx.arc(lx+3,ly+3,2,Math.PI,0);ctx.stroke();
      ctx.fillStyle='#3a4468';ctx.fillRect(lx,ly+3,6,5);
    }
    for(let j=0;j<ch.len;j++){
      const i=ch.first+j,xy=_cardXY(ch,j),x=xy[0],y=xy[1];
      const locked=levelLocked(i)||chLocked,sel=menuSel===i; // v7.7：全关开放时所有卡一律按已解锁渲染
      const boss=!!ALL_LEVELS[i].boss;
      _panel(x,y,46,44,{alpha:locked?0.7:0.85,cut:3});
      if(boss){ctx.strokeStyle='#f86048';ctx.lineWidth=1;ctx.strokeRect(x+0.5,y+0.5,45,43);} // Boss 卡红描边
      if(sel){ctx.strokeStyle='#fff8c8';ctx.lineWidth=2;ctx.strokeRect(x+1,y+1,44,42);
        if(tick%40<24){ctx.fillStyle='#fff';ctx.fillRect(x-6,y+21,4,2);ctx.fillRect(x+48,y+21,4,2);}}
      else if(hover==='select:'+i){ctx.strokeStyle='#fff8c8';ctx.lineWidth=1; // v6 §A.2：悬停高亮
        ctx.strokeRect(x+0.5,y+0.5,45,43);}
      // v12：卡宽 46（可用 ~42），'BOSS·双生终焉' 7px 要 49px，会压到右邻卡上；
      // 按实测宽度自动降字号到 7/6/5，保证关名不越卡。
      const cardNm = locked ? '???' : _cardName(ALL_LEVELS[i].name);
      let nmSz = 7;
      while (nmSz > 5 && _textW(cardNm, nmSz) > 42) nmSz--;
      drawCNText(cardNm,x+23,y+5,nmSz,
        locked?'#5a6488':(boss?'#f8d048':'#f0f4ff'),'center');              // 关名 7px（Boss 金色）
      const st=progress.stars[i]||0;
      drawCNText(st?'★'.repeat(st)+'☆'.repeat(3-st):'☆☆☆',x+23,y+22,12,
        locked?'#3a4468':'#f8d048','center');
      drawPixelText(''+(i+1),x+23,y+34,1,locked?'#5a6488':'#a8b4d8','center');
      if(boss)drawPixelText('BOSS',x+43,y+35,1,'#f86048','right');          // 卡底 BOSS 角标
      if(i>=10){ctx.fillStyle='#f8d048';ctx.fillRect(x+40,y+3,2,2);}        // 新关金点（L11~L16）
    }
  }
  drawCNText('←→↑↓ 选择　回车 进入　C 角色　G 衣橱　Esc 返回',VIEW_W/2,204,10,'#a8b4d8','center'); // v19：加 C 角色入口
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
/* ==================== v11 §任务1/§任务2：终点封印（光罩 + 条件面板） ====================
 * 引擎侧产出 game.seal（只读契约：enemyTotal/enemyKilled/enemyNeed、coinTotal/coinGot/coinNeed、
 * hasShrine/shrineOk、open、via、blockT、relaxed）。本段**只读不写**；seal 缺失（引擎未合入）时
 * 全部渲染安全跳过——不抛异常、零绘制。用户反馈「小关可以什么都不干直接位移到最后」：规则的价值
 * 一半在「封住了」，另一半在「跑到终点之前就知道要做什么」，所以光罩（阻挡感）与条件面板（目标感）同做。 */
let sealOpenT=-1;          // 碎裂动画计时 0..0.4s；-1=不播（只由 open 的 false→true 跳变启动，不每帧重播）
let _sealWasOpen=false;    // 上一帧 open 值（跳变检测）
let _sealLastTick=-1;      // 上一帧 game.tick：render 侧按帧差推进动画（step 未跑/多次 render 时退化为 1/60）
let sealHintT=0;           // 进关封印提示剩余秒数（2.0 起倒计时）
let sealHintArmed=false;   // 本关提示是否已触发（seal 可能首帧 updateWorld 才由引擎建出，故不在 startLevel 判定）
// 12 片碎片：相对终点的偏移 + 抛射速度 + 尺寸（确定性表——Math.random 会让同一帧的碎片逐帧跳位）
const SEAL_SHARDS=[[2,2,-1.9,-2.4,2],[6,1,-1.1,-2.8,3],[10,3,-0.4,-2.2,2],[14,2,0.6,-2.6,2],
  [3,8,-2.2,-1.2,3],[8,10,-0.8,-1.6,2],[12,9,0.4,-1.4,3],[16,11,1.4,-1.8,2],
  [1,16,-1.6,-0.4,2],[6,18,-0.6,-0.2,3],[11,19,0.5,-0.6,2],[15,22,1.5,0.2,2]];
function _sealSync(){ // 每帧同步：返回 seal（缺失→null）；维护 open 跳变与碎裂计时
  const s=game.seal;
  const dt=_sealLastTick>=0?Math.min(0.05,(game.tick-_sealLastTick)/60):0;
  _sealLastTick=game.tick;
  if(!s){_sealWasOpen=false;sealOpenT=-1;return null;}   // 引擎未合入：什么都不做（零绘制）
  if(s.open){
    if(!_sealWasOpen)sealOpenT=0;                        // false→true 的那一帧起播，只播这一次
    _sealWasOpen=true;
    if(sealOpenT>=0){sealOpenT+=(dt>0?dt:1/60);if(sealOpenT>0.4)sealOpenT=-1;}
  }else{
    _sealWasOpen=false;sealOpenT=-1;
  }
  return s;
}
function _sealPanelBg(x,y,w,h,red){ // 切角面板（照抄 _panel 的双线描边，底色换深紫/暗红——封印的视觉语言）
  _panelPath(x,y,w,h,4);
  ctx.fillStyle=red?'rgba(58,14,30,0.88)':'rgba(30,14,58,0.88)';ctx.fill();
  ctx.strokeStyle=red?'#f85060':'#b88cff';ctx.lineWidth=1;ctx.stroke();
  ctx.save();_panelPath(x,y,w,h,4);ctx.clip();
  ctx.strokeStyle='rgba(206,170,255,0.35)';ctx.strokeRect(x+1.5,y+1.5,w-3,h-3);ctx.restore();
}
function _sealLock(lx,ly,col,a){ // 8×8 锁形：方形锁体 + 半圆锁梁（程序化，不依赖字体/素材）
  ctx.save();ctx.globalAlpha=a;
  ctx.strokeStyle=col;ctx.lineWidth=1;
  ctx.beginPath();ctx.arc(lx+4,ly+3,2.2,Math.PI,0);ctx.stroke();   // 锁梁（上半圆）
  ctx.fillStyle=col;ctx.fillRect(lx+1,ly+3,6,5);                   // 锁体 6×5
  ctx.fillStyle='rgba(24,8,48,0.9)';ctx.fillRect(lx+3,ly+4,2,3);   // 锁孔
  ctx.restore();
}
function _sealCheck(x,y,col){ // 程序化 ✓（7×7 阶梯、双像素厚；不用字体字形——像素字体里没有 ✓）
  ctx.fillStyle=col;
  const P=[[0,3],[1,4],[2,5],[3,4],[4,3],[5,2],[6,1]];
  for(const p of P){ctx.fillRect(x+p[0],y+p[1],1,1);ctx.fillRect(x+p[0],y+p[1]+1,1,1);}
}
function _sealIcon(kind,x,y,col){ // 行首小图标 7×7：剑（战斗）/ 圆环（金币）/ ?（谜题）
  ctx.fillStyle=col;
  if(kind==='battle'){
    ctx.fillRect(x+3,y,1,5);ctx.fillRect(x+2,y+5,3,1);ctx.fillRect(x+3,y+6,1,1); // 剑身+护手+柄
    ctx.fillRect(x+1,y+2,1,1);ctx.fillRect(x+5,y+2,1,1);                        // 十字护手两翼
  }else if(kind==='coin'){
    ctx.strokeStyle=col;ctx.lineWidth=1;
    ctx.beginPath();ctx.arc(x+3.5,y+3.5,2.5,0,Math.PI*2);ctx.stroke();
    ctx.fillRect(x+3,y+3,1,1);
  }else drawPixelText('?',x+1,y+1,1,col);
}
function _sealWall(g,tick,s){ // 任务1 主体：18×32 半透明紫墙 + 流动纹路 + 上下亮条 + 锁 + 弹回红闪
  const blk=(s.blockT||0)>0;
  const wx=px(g.x-1),wy=px(g.y),ww=18,wh=g.h||32;
  const cx=wx+ww/2,cy=wy+wh/2;
  const breath=0.55+0.10*Math.sin(tick*0.06);   // 0.45~0.65 呼吸（alpha 烘焙在 globalAlpha 上）
  ctx.save();
  ctx.globalAlpha=breath;
  ctx.fillStyle=blk?'#c82846':'#5a2ec8';        // 主体：紫色能量墙；被弹回时整面转红
  ctx.fillRect(wx,wy,ww,wh);
  for(let y=0;y<wh;y+=2){                       // 内部纹路：sin(tick*0.08+y) 调制亮度 → 缓慢上下流动
    const k=0.5+0.5*Math.sin(tick*0.08+y*0.55);
    ctx.fillStyle=blk?'rgba(255,150,160,'+(0.10+0.32*k).toFixed(3)+')'
      :'rgba(206,170,255,'+(0.10+0.32*k).toFixed(3)+')';
    ctx.fillRect(wx+1,wy+y,ww-2,1);
  }
  ctx.globalAlpha=1;
  ctx.fillStyle=blk?'#ff7080':'#c890ff';        // 上下各一道 2px 亮紫横条
  ctx.fillRect(wx,wy,ww,2);ctx.fillRect(wx,wy+wh-2,ww,2);
  _sealLock(cx-4,cy-4,blk?'#ffd0d6':'#efe0ff',0.95);
  if(blk){                                      // 被弹回：整面红闪 + 一圈外扩红色冲击环
    const f=0.35*(0.5+0.5*Math.abs(Math.sin(tick*0.5)));
    ctx.fillStyle='rgba(255,70,90,'+f.toFixed(3)+')';ctx.fillRect(wx,wy,ww,wh);
    const k2=clamp(1-(s.blockT/0.9),0,1);   // 0.9s = 引擎 blockT 初值：环从 r8 扩到 r28 正好走完
    ctx.globalAlpha=(1-k2)*0.85;ctx.strokeStyle='#ff4a5a';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(cx,cy,8+k2*20,0,Math.PI*2);ctx.stroke();
    ctx.globalAlpha=1;
  }
  ctx.restore();
}
function _sealShatter(g){ // 任务1 解除瞬间：0.4s 碎片四散 + 快速淡出（open 由 false→true 才播一次）
  const p=clamp(sealOpenT/0.4,0,1),k=1-Math.pow(1-p,2);   // 缓出：先快后慢
  const wx=g.x-1,wy=g.y;
  ctx.save();
  if(p<0.25){ctx.globalAlpha=(0.25-p)*2.4;ctx.fillStyle='#f0e0ff';ctx.fillRect(wx-2,wy-2,22,(g.h||32)+4);}
  ctx.globalAlpha=1-p;
  for(const f of SEAL_SHARDS){
    ctx.fillStyle=f[4]>2?'#d8b0ff':'#8a4ae0';
    ctx.fillRect(px(wx+f[0]+f[2]*k*14),px(wy+f[1]+f[3]*k*14+f[4]*k*k*2),f[4],f[4]);
  }
  ctx.restore();
}
function _sealHintText(s){ // 进关提示文案（三条线全列 + 「任选其一」；门槛为 0 的线不列）
  const parts=[];
  if((s.enemyNeed|0)>0)parts.push('击败 '+s.enemyNeed+' 只敌人');
  if((s.coinNeed|0)>0)parts.push('收集 '+s.coinNeed+' 枚金币');
  if(s.hasShrine)parts.push('解开神龛');
  // v11 修：返回 [标题, 明细] 两段而不是一整句。原先拼成单行 35+ 字（约 380px）远超 384 画布，
  // 实机截图里左右两端被屏幕裁掉、正好吃掉「本关」和「一」——文案再对也白搭。拆两行后
  // 每行 ≤20 字（≤200px），面板宽按较长那行算，两端各留 8px 也不会出屏。
  if(!parts.length)return null;
  return ['本关终点已封印 · 任选其一解除', parts.join(' / ')];
}
function _sealPanelNear(){ // 内部：条件面板此刻是否会显示（供 L1 天空提示让位——两者在终点附近会叠字）
  const s=game.seal;if(!s||s.open)return false;
  const g=game.level&&game.level.goal,p=game.player;
  if(!g||!p||p.dead)return false;
  return Math.abs((p.x+p.w/2)-(g.x+(g.w||16)/2))<96;
}
function _sealPanel(g,tick,s){ // 任务2：终点上方条件面板（靠近 96px 才出；三条线同列让玩家自己选）
  if(uiState!=='play')return;
  const p=game.player;
  if(!p||p.dead)return;
  const gcx=g.x+(g.w||16)/2;
  if(Math.abs((p.x+p.w/2)-gcx)>=96)return;      // 水平距离 <96px 才提示
  const blk=(s.blockT||0)>0;
  const need=s.enemyNeed|0,kill=s.enemyKilled|0,cn2=s.coinNeed|0,cg=s.coinGot|0;
  const rows=[{k:'battle',cn:'击败',val:kill+'/'+need,ok:kill>=need},
    {k:'coin',cn:'金币',val:cg+'/'+cn2,ok:cg>=cn2}];
  if(s.hasShrine)rows.push({k:'puzzle',cn:'谜题',val:s.shrineOk?'已解':'未解',ok:!!s.shrineOk});
  const blockLine='封印未解 · 完成任意一项即可';
  const pw=Math.max(96,blk?Math.ceil(_textW(blockLine,9))+12:0);   // 弹回提示行比三行宽 → 面板临时加宽
  const ph=8+rows.length*11+(blk?12:0);
  const cam=game.cam||{x:0,y:0};
  let sx=Math.round(gcx-pw/2-cam.x);            // 先换算屏幕坐标再钳制：终点贴左/贴右都不出屏
  sx=clamp(sx,2,Math.max(2,VIEW_W-pw-2));
  let sy=Math.round(g.y-44-ph-cam.y);           // 面板底边距终点顶 44px（工单 40~60 区间内）
  // v11 修：下限 2→34。终点旗贴地面时 g.y 已经很靠下，减去 44+ph 后常算出 5~15 这种值，
  // 被钳到 2 就等于把面板顶到屏幕最上沿，直接压在心形/金币 HUD（占 0~30）上——实机截图里
  // 三行文字只剩下半截。HUD 底边 30，留 4px 呼吸 → 面板顶不得高于 34。
  sy=clamp(sy,34,Math.max(34,VIEW_H-ph-2));
  const jit=blk?Math.round(Math.sin(tick*1.15)*2):0;               // 被弹回：整块抖 2px
  const dx=sx+cam.x+jit,dy=sy+cam.y+jit;        // 换回世界坐标（renderSeal 在 translate(-cam) 世界空间内）
  _sealPanelBg(dx,dy,pw,ph,blk);
  for(let i=0;i<rows.length;i++){
    const r=rows[i],ry=dy+6+i*11;
    if(r.ok)_sealCheck(dx+5,ry,'#f8d048');                            // 达成：行首金色 ✓
    else _sealIcon(r.k,dx+5,ry,blk?'#e08a96':'#9a8ac8');
    drawCNText(r.cn,dx+16,ry,9,r.ok?'#f8d048':(blk?'#ffc8d0':'#cfd2e2'));
    // 数值右对齐到面板内缘：三行读起来是「图标 + 名称 …… 进度」两列，比紧跟名称更好扫
    if(r.k==='puzzle')drawCNText(r.val,dx+pw-8,ry,9,r.ok?'#f8d048':(blk?'#ffc8d0':'#a8a8bc'),'right');
    // v11 修：金币行加「枚」后缀。面板按**金币实体个数**计（引擎口径：宝石算 1 枚、木箱不计），
    // 而顶部 HUD 的 0/42 是按**面值**计（宝石 5、木箱含 1）—— 两个分母并排出现时玩家会以为数据错乱。
    // 标上「枚」字明确是"个数"，HUD 那个不带单位的仍是面值。
    else if(r.k==='coin')drawCNText(r.val+' 枚',dx+pw-8,ry,9,r.ok?'#f8d048':(blk?'#ffc8d0':'#cfd2e2'),'right');
    else drawPixelText(r.val,dx+pw-8,ry+2,1,r.ok?'#f8d048':(blk?'#ffc8d0':'#cfd2e2'),'right');
  }
  if(blk)drawCNText(blockLine,dx+pw/2,dy+6+rows.length*11+1,9,'#ffb0ba','center');
}
function renderSeal(L,tick){ // 调用点：renderShrines 之后、renderEntities 之前（终点旗由后者画 → 压在光罩上透出来）
  const s=_sealSync();
  if(!s||!L||!L.goal)return;
  if(s.open!==true)_sealWall(L.goal,tick,s);     // 未解：光罩（含弹回红闪）
  if(sealOpenT>=0)_sealShatter(L.goal);          // 解除瞬间：碎片（0.4s 后自动停）
  if(s.open!==true)_sealPanel(L.goal,tick,s);    // 条件面板（解除了就不再提示）
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
  if(!puzzleOk(pz))return; // v7.4：数据不可玩不画缩略图（画稿行数不足时 pz.pic[r][c] 会越界抛错）
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
function renderPuzzleRuleCard(){ // v7.6：首次进入的一次性规则卡（覆盖层之上：压暗底 + _panel 金框 + 任意键开始）
  const pz=PUZZLES[puzzle.idx];if(!pz)return;
  let lines;
  if(pz.type==='nono'){
    lines=['数字是该行/列连续黑格的长度','一行若有多个数字，按顺序对应','段与段之间至少空一格',
      'J 填黑 · K 打叉标记空格','行列线索全部吻合即解开'];
  }else{ // 数独分支才读 sol（sudokuBoxDims 依赖 pz.sol，数织题面没有该字段）
    const n=pz.size,box=sudokuBoxDims(pz);
    lines=['每行 1-'+n+' 每个数字各一次','每列同上，不能重复','每宫（'+box[0]+'×'+box[1]+' 粗线框）同样',
      '数字键填入 · 0 或退格清除','行列宫全部合法即解开'];
  }
  const fx=16,fy=10,fw=VIEW_W-32,fh=VIEW_H-24;
  ctx.fillStyle='rgba(4,4,14,0.62)';ctx.fillRect(fx,fy,fw,fh); // 压暗棋盘，视觉焦点落在卡片
  const cw=252,ch=132,cx=(VIEW_W-cw)/2,cy=fy+Math.round(fh/2-ch/2); // 66,44 → 卡占 66..318 × 44..176
  _panel(cx,cy,cw,ch,{cut:4,alpha:0.94});
  drawCNText(pz.type==='nono'?'怎么玩 · 数织':'怎么玩 · 数独',VIEW_W/2,cy+9,12,'#f8d048','center');
  ctx.fillStyle='rgba(240,200,96,0.45)';ctx.fillRect(cx+14,cy+26,cw-28,1); // 标题下金细线
  for(let i=0;i<lines.length;i++)drawCNText(lines[i],cx+16,cy+38+i*14,10,'#dfe4f4','left');
  drawCNText('任意键开始（8 秒后自动开始）',VIEW_W/2,cy+ch-19,9,'#8ad8a0','center');
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
    ?'方向 移动 · J 填格 · K 叉格 · H 提示 -1 金币 · R 清空 · Esc 退出'
    :'方向 移动 · 数字键 填入 · 0/退格 清除 · H 提示 -1 金币 · R 重来 · Esc 退出';
  // v7.6：规则卡显示期间不画底部键位条（此时棋盘输入被屏蔽，键位提示会误导；卡片自带「任意键开始」）
  if(!puzzle.ruleOn)drawCNText(hint,VIEW_W/2,fy+fh-16,9,'#b8b8c8','center');
  // v7.5：左上角显示提示次数与当前金币余额（扣费后即时可见；0 金币时提示仍然可用）
  if(!puzzle.view&&puzzle.hintN>0)drawCNText('提示 ×'+puzzle.hintN+' · 金币 '+game.coins,fx+10,fy+11,9,'#8ad8a0','left');
  if(puzzle.ruleOn)renderPuzzleRuleCard(); // v7.6：一次性规则卡压在最上层（含横幅/提示条之上）
}
// v7.6：右侧常驻精简规则——盘面右侧的空白竖条（数独 9×9 约 86px、数织 9×9 约 88px）放三行速查，
// 与「首次规则卡」互补：卡讲完整规则（一次性），右栏常驻（每次进入都在，随时能看）。
function _puzzleRuleLines(pz){ // 内部：按题面动态生成三行（数字 N / 宫尺寸随 puzzle.size 变）
  if(pz.type==='nono')return['线索 = 该行列连续','数字 = 黑格段长','段间至少空一格'];
  const n=pz.size;
  return['每行 1-'+n+' 各一次','每列 1-'+n+' 各一次','每宫 1-'+n+' 各一次'];
}
function _drawPuzzleRules(lines,boardRight,top,bot){ // 内部：右对齐到 fx+fw-14（=354），垂直居中于盘面区间
  const RX=VIEW_W-30;                       // fx(16)+fw(352)-14 = 354
  const avail=RX-boardRight-4;              // 与盘面右缘留 4px 呼吸
  if(avail<40)return;                       // 兜底：盘面意外过宽（极端题面）宁可不画，绝不压盘面
  let fs=9;                                 // 9px 实测放得下（最宽一行 75.2px ≤ 最小可用 83px，数织 10×10）；放不下自动降 8px
  if(lines.some(t=>_textW(t,fs)>avail))fs=8;
  const lh=fs+4,y0=Math.round((top+bot)/2-(lines.length*lh-fs)/2);
  for(let i=0;i<lines.length;i++)drawCNText(lines[i],RX,y0+i*lh,fs,'#b8b8c8','right');
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
  // v7.6：右侧空白竖条常驻精简规则（左侧行列线索区绝对不占；垂直居中于网格区间）
  if(!puzzle.ruleOn)_drawPuzzleRules(_puzzleRuleLines(pz),gx+gw,gy,gy+gw);
}
function renderSudokuBoard(tick,pz){ // 数独：粗细分隔线+给定格灰底+冲突红字+光标
  const s=pz.size,[bh,bw]=sudokuBoxDims(pz);
  // v7.4：9×9 格宽 17→16。17 时盘面 153px 高、底边正好压在底部操作条上（末行数字被提示文字盖住），
  // 16 → 144px，盘面底 188、提示条 194，留 6px 间隙（数织侧同类挤压已在 clueH 自适应里避开）。
  const cell=s===4?26:s===6?22:16,gw=s*cell;
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
  // v7.6：右侧空白竖条常驻精简规则（盘面右缘 264 起、宽 86px；垂直居中于盘面区间）
  if(!puzzle.ruleOn)_drawPuzzleRules(_puzzleRuleLines(pz),gx+gw,gy,gy+gw);
}

// ---------- 状态机与主循环 ----------
let lastState='';
// v2 P1：冲刺残影快照（0.04s 间隔，共 4 帧半透明剪影）+ 连击弹字动画状态
const ghosts=[];let ghostTick=0,comboPop=0,lastCombo=0;
function step(dt){
  game.tick+=dt*60;
  fade=clamp(fade+fadeDir*dt*3,0,1);
  hintT-=dt;
  oHintT-=dt;fallToastT-=dt; // v6 §D/§E：提示计时（渲染按 uiState==='play' 门控）
  // v11 §任务3：进关封印提示——seal 可能由引擎在首帧 updateWorld 才建出（loadLevel 里未必有），
  // 所以不放在 startLevel 判定，这里用上升沿一次性触发 2 秒（每关只触发一次，解除后不再弹）。
  sealHintT-=dt;
  if(uiState==='play'&&!sealHintArmed&&game.seal&&game.seal.open===false){sealHintArmed=true;sealHintT=2.0;}
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
    if(heroOpen){
      stepHeroInput(); // v19：选角面板独占输入（C/Esc/X 关闭，不落到下层菜单）
    }else if(wardrobeOpen){
      stepWardrobeInput(); // v7.7：衣橱面板独占输入（不落到下面的开始钮分支）
    }else{
      // v7.7 §1：F / 点开关 = 切换全关开放（开关型，再按关闭；持久化在 toggleUnlockAll 内）
      if(hit('unlockAll')||(mouse.click&&hover==='titleUnlock'))toggleUnlockAll();
      if(hit('wardrobe')||(mouse.click&&hover==='titleWardrobe'))openWardrobe(); // v7.7：G / 点衣橱钮
      if(hit('hero')||(mouse.click&&hover==='titleHero'))openHeroSelect(); // v19：C / 点角色钮
      // v6 §A.4：点 title 开始钮=hit('confirm') 等价分支（键盘等价=回车，H2）
      if(hit('confirm')||(mouse.click&&hover==='titleStart')){SFX.select();uiState='select';fade=1;fadeDir=-1;}
    }
  }else if(uiState==='select'){
    if(heroOpen){
      stepHeroInput(); // v19：同上（选关导航/进入/返回全部让位给面板）
    }else if(wardrobeOpen){
      stepWardrobeInput(); // v7.7：同上（选关导航/进入/返回全部让位给面板）
    }else{
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
      if(hit('wardrobe')||(mouse.click&&hover==='menuWardrobe'))openWardrobe(); // v7.7：选关屏衣橱入口
      if(hit('hero')||(mouse.click&&hover==='menuHero'))openHeroSelect();       // v19：选关屏角色入口
      // v6 §A.4：选关卡鼠标单击=选中（menuSel=i）、双击=进入——确认分支复用 hit('confirm') 同代码路径
      if(mouse.click&&hover&&hover.indexOf('select:')===0){
        const i=+hover.slice(7);
        if(menuSel===i&&game.tick-selClickTick<30){ // 30 tick=0.5s 内同卡再点=双击
          if(canEnterLevel(menuSel)){SFX.select();startLevel(menuSel);} // v7.7：全关开放时直接放行
          else SFX.shot();
        }else{menuSel=i;SFX.select();}
        selClickTick=game.tick;
      }
      if(hit('ok')){ // v8.0：改 confirm→ok——原 confirm 含 ↑/W，而 ↑/W 在本屏是「跨章上移」，
        // 按一次 ↑ 会先换章再直接进关（选关屏最典型的「键不灵/乱跳」）；现 Enter/Space 进关，↑↓ 只导航。
        if(canEnterLevel(menuSel)){SFX.select();startLevel(menuSel);}   // v7.7：同上
        else SFX.shot();
      }
      if(hit('back')){uiState='title';fade=1;fadeDir=-1;}
    }
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
      // v8.0：暂停面板写着「ESC: MENU」，但原来 !game.paused 把暂停态的 Esc 整条拦掉（面板文案与行为不符）。
      // 现在暂停中 Esc = 解除暂停并回选关，未暂停 Esc = 直接回选关（原行为不变）。
      if(hit('back')){if(game.paused)game.paused=false;uiState='select';fade=1;fadeDir=-1;return;}
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
    // v7.7：通关只掉「本关对应色」的皮肤——首次通关才有反馈（已解锁/art 未合入 → null，不弹提示）。
    // 只在通关分支执行：死亡/中途退出永远到不了这里；全关开放直打 L16 也只按 idx=15 映射掉一件。
    // 反馈=结算屏那一行金色「获得新衣 · 草绿」+ NEW 角标 + SFX.select（不额外叠浮字，避免同文案重复两遍）。
    clearSkinGain=awardSkin(game.levelIdx);
    if(clearSkinGain){saveProgress(progress);SFX.select();}
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
let _frameErr=''; // v7.4：主循环异常去重日志（同一条 message 只打一次）
function frame(now){
  try{
    acc+=Math.min(0.1,(now-last)/1000);last=now;
    // P0 修复（任务书 2026-10-24-v2 §P0）：pressed 边沿只在真实跑过至少一个物理 step 之后清空。
    // 清空动作挪进 while 循环、逐 step 执行——零步进的渲染帧（高刷屏 acc<1/60）不再吞输入；
    // 一帧多 step 时第一步消费后即清，边沿只消费一次（不丢不重）。
    // v6 §A.1：mouse.click 单击边沿同点清零（mousedown 置 1 → 单 step 消费）。
    while(acc>=1/60){step(1/60);clearPressed();mouse.click=0;acc-=1/60;}
    render();
    if(uiState==='victory')renderVictory(game.tick);
    if(uiState==='credits')renderCredits(game.tick); // v3 §E3：致谢屏
  }catch(e){
    // v7.4 主循环兜底：单帧异常不得终止 rAF 链——否则一次越界（如谜题数据损坏）就把整局永久冻死，
    // 玩家既动不了也退不出（= 不可通关）。同类异常只打一次日志，避免每帧刷屏。
    const msg=String(e&&e.message);
    if(_frameErr!==msg){_frameErr=msg;console.error('[frame] 异常已捕获，主循环继续：',e);}
    last=now;acc=0; // 丢弃积压时间，避免下一帧补步风暴
  }
  requestAnimationFrame(frame);
}

// ---------- 启动 ----------
function boot(){
  buildSprites();
  fitScreen();
  // v19 §3.2：先按存档注入 game.hero（recomputeEquip 的基础血要读它），再处理 ?hero= 调试覆盖（非法值忽略）。
  const dh=q.get('hero');
  HERO_DEBUG=(dh==='mage'||dh==='knight')?dh:null;
  game.hero=HERO_DEBUG||(progress.hero==='mage'?'mage':'knight');
  recomputeEquip(); // v6 波2 §D：boot 后一次（异常档自愈回写+注入 game.equip/cdMul；先于 startLevel/loadLevel 读装备）
  const lvl=q.get('level');
  if(lvl){
    // v7.4：?level=abc 之类非法值 → parseInt=NaN → clamp 仍是 NaN → loadLevel(NaN) 抛错整局起不来。
    // 非法/缺失一律回落第 1 关（URL 参数是外部输入，不得让一次手滑打错字把游戏打成白屏）。
    const n=parseInt(lvl,10);
    const idx=Number.isFinite(n)?clamp(n-1,0,ALL_LEVELS.length-1):0;
    startLevel(idx);
  }else{
    game.state='title';
  }
  requestAnimationFrame(frame);
}
if(document.readyState==='loading')addEventListener('DOMContentLoaded',boot);
else boot();

})();
