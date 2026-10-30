/* ============================================================
   engine.js —— 《像素勇者 Pixel Quest》引擎模块
   ------------------------------------------------------------------
   本文件职责（契约第 3 节）：
     1. PHY 物理常量表；
     2. Level 类：解析 LEVELS[idx] —— 实体提取（实体字符换'.'，瓦片字符保留）、
        门分组（相邻 D 连通分量）、电锯轨道扫描（左右/上下各 ≤7 格遇实心停）、
        装饰物确定性摆放（seed=99+idx*17）、totalCoin 统计；
        提供 tileAt / solid 瓦片语义；
     3. game 世界状态（含 input 与 sfxQueue）；
     4. loadLevel / respawn / killPlayer / levelClear / updateWorld。
   v2 增量（docs/specs/2026-10-24-v2-optimization.md P0+P1，引擎工程师）：
     - P1 手感：coyote/buffer 0.12/0.18、起跳/落地粒子加强、死亡震屏 8、击杀震屏 3；
     - P1 动作：攻击（J/X：冷却 0.35s、身前 18×14 框 0.12s、命中敌→hit-stop 0.06s 不弹跳、
       命中 'B' 砖→碎+1 金币、斩碎炮弹）、冲刺（K/Shift：冷却 0.8s、0.18s vx=±260 免摩擦、
       重力减半）、连击（击杀/碎砖 2s 窗口累计 game.combo，断档清零）；
     - 'B' 可碎木箱砖入 solid/电锯轨道语义、内含金币计入 totalCoin（P3 关卡侧配套）。
   v3 增量（docs/specs/2026-10-24-v3-boss-design.md，引擎工单 docs/workorders/engine.md）：
     - 玩家 HP 系统：hp:5 / invT 无敌帧 / shieldT 护盾 / castT 施法姿态；
       _engHurtPlayer 统一 HP 伤害入口（敌人接触/炮弹/冲击波/Boss 接触 → -1），
       尖刺/熔岩/电锯/挤压/坠落保持 killPlayer 即死（护盾不挡即死物）；
     - Boss 星核巨兽：'X' 锚点解析 → _engMkBoss，_engUpdateBoss 十二态状态机
       （dormant/intro/idle/windup/leapAir/barrageFire/chargeRun/stagger/summonCast/
       novaCast/recover/enrage/dying/dead），_engBossHurt 唯一承伤入口（五态免伤）；
     - 三技能（U 星陨 8s / I 护盾 12s / O 连斩 20s+连击8）+ meteor/wave/drop 实体循环；
     - 击杀统一入口 _engKillEnemy（30% 掉回复心）；sfx 新事件
       'roar','meteor','shield','ult','heart','hurt','bosshit'（只 push 不发声）。
   v4 增量（docs/specs/2026-10-24-v4-puzzles.md「引擎队」工单，引擎工程师）：
     - 'Q' 谜题神龛解析：实体提取为 L.shrines:[{x,y,w:16,h:24,idx}]（idx=1 起关卡号，
       配 levels.js PUZZLES 键；y 取瓦片顶上移 8px——与 'c' 检查点 16×24 实体同一锚定
       惯例，碑底=支撑瓦片顶面），网格换 '.'；
     - game.puzzleActive（覆盖层打开中，updateWorld 在 paused 判断之后直接 return，
       玩家/敌人/计时全部冻结，同暂停语义但不改 paused 字段）；
     - game.puzzleNear（每步计算：玩家矩形 vs 神龛矩形四周 8px 外扩重叠 → 该神龛
       idx，否则 -1；ui 据此显示「↑解谜」并处理开龛键）；
     - 新契约导出 puzzleSolved(idx)（红线唯一例外，已录入 CONTRACT 附记）：标记
       solvedPuzzles[idx]=true、coins+5、sfxQueue push 'puzzle'+'gem'、玩家头顶
       金色烟花约 24 粒；solvedPuzzles={} 在 loadLevel 重置（ui 负责从 localStorage
       注入已解状态）。'Q' 提取与 puzzleNear 均为纯数据/纯判定，对七关空转零副作用。
   v5 增量（docs/specs/2026-10-24-v5-design.md §1/§2/§3/§4，工单 docs/workorders/v5-wave1-feel.md，手感队）：
     - 二段跳（airJumps/springAir/djT，弹簧全程锁定）+ 空中操控（同向 0.75×/转向 1.5×/无输入 drag 240）
       + 落地分级（landVy>300 大落：尘 10+震屏 2+land2）+ 跑步尘土/转身 squash 计时；
     - 冲刺三段（0.28s=蓄力 0.05/爆发 0.18/滑行 0.05 缓冲；仅爆发段重力减半）；
     - 攻击时间轴（atkAnim 0.25=起手 0.05 无判定+判定 0.12+余韵 0.08）+ hit-stop 0.10 + 敌人耐久
       （史莱姆 hp2/蝙蝠 hp1/骑士 hp3）+ 击退摩擦/白闪/抖动/击飞弹道 + 暴击（本击使 combo+1 为
       4 的倍数 → 伤×2）+ Boss 被击微退 2px + 分级震屏 _engShake（单槽 shakePend）；
     - 新演出设施：game.floats(≤40)/game.fxParts(≤60)/game.scars(≤8)——引擎只 push、ui 每步推进
       （hit-stop/ult 冻结期照常动）；game.parts 上限收紧 240；game.ult=O 流星连斩 1.2s 状态机；
     - 技能重做：O 演出状态机（时停→十字斩→结算→冲击环→白闪）/ U 瞄准圈(_engGroundY)+拖尾
       +爆坑 scars+Boss 伤 2 / I 护盾 2 点吸收+破盾事件；
     - 新机关引擎语义（第一波实装、无关卡引用、空转零副作用）：'w' 上升气流 / 'e' 传送门
       （按 (x,y) 排序两两配对）/ 'A' 骑士（正面格挡）/ 'H' 吊灯摆锤（HP 伤害非即死）；
     - _engDecorFallback 预补 wind/castle/star 三键；sfx 新事件
       'swing','hit','kill','djump','land2','shieldhit','shieldbreak','clank','portal','ult2'
       （'slash' 废弃改 'swing'）。
   v6 增量（docs/specs/2026-10-24-v6-design.md + docs/specs/2026-10-24-v6-balance.md §0，
   工单 docs/workorders/v6-wave1-feel.md，手感队）：
     - 下坠手感：PHY.grav 1500→1320 / maxFall 360→285 / jumpV 330→309 / springV 520→488
       （等高换算 k=√0.88≈0.9381；maxFall −20.8% 为任务书指定例外，见 CONTRACT 附记 v6）；
       竖直派生速度等比（踩踏反弹 −235 / 受击上抛 −131 / 二段跳 −jumpV×0.92）；
     - 速降：空中按住 input.down → 落速上限恢复旧值 360（BAL.fall.fast）；
     - `const BAL` 全数值总表（平衡表 §0 逐字落地，唯一权威）+ 全量硬编码收编替换
       （未列数值数值不动；行为零变化由 tools/_v6_feel_test.js §N.3 逐帧断言自证）；
     - 装备注入接口（读侧）：game.equip{atk,hp,spd,cd}/cdMul（波1 恒默认零副作用，波2 bag 队写入）
       → p.maxHp=5+equip.hp（满装 7）/ 普攻 ATK=2+equip.atk（满装 5）/ 限速 effRun=maxRun×(1+equip.spd) / 技能 CD×cdMul；
     - 技能4 星刃回旋（L 键）：game.blades[] 去程 320 直飞 160px → 回程 340 追踪玩家；
       每程固定伤 2（不吃 ATK）、一程一目标一伤；骑士正面格挡 / Boss 承伤 / 斩碎弹幕（含火球）；
     - 四类敌人技能（_engMkAI/_engEnemySkill 状态机，触发全距离条件无随机，CD 相位确定性错开）：
       史莱姆弹跳压顶 / 蝙蝠俯冲撕咬 / 骑士盾击冲锋（破绽 guardDown 正面失效）/ 幽焰法师
       'Y'（12×18 站桩读条追踪火球 fire:true+home+life，可斩碎）；sfx 新事件 'blade','mage','pickup'；
     - 波2 预留字段（空转零副作用）：game.gearDrops[]/pickups[]/bagActive（背包冻结，同 puzzleActive 位）。
   v6 波2 增量（docs/specs/2026-10-24-v6-design.md §6.1-§6.5，工单 docs/workorders/v6-wave2-loot.md，装备引擎队）：
     - 装备掉落：掉落表/概率逐字=BAL.gear（平衡表 §Q，只读不改 H5）——Boss（_engBossHurt 入 dying 瞬间，
       第 1 件必掉 boss1 权重 + 30% 第 2 件 boss2 权重）/ L9·L10 精英骑士（_engKillEnemy 唯一击杀入口内
       10%，elite 权重无金——金=Boss 专属）；
     - 掉落实体：_engMkGear 10×12（重力/落速帽收编 BAL.econ.dropGrav/dropFall，与回复心同池数值；
       落地反弹一次 vy×−0.4 后停驻 rest；永不过期，换关 loadLevel 清空=放弃、跨死亡保留 §5）；
       拾取=AABB 重叠 → game.pickups 事件 {slot:'w'|'h'|'c', r:0..4} + sfx 'pickup'
       （H2：入包/碎片/浮字/存档全归 ui，engine 不碰 localStorage；渲染光柱/图标归波2 bag 队）；
     - H3：gearDrops 实体池上限 6（_engGearCap，超过不再生成——Boss 双掉+骑士掉同屏 ≤4，6 有余量）；
     - H4：Boss 关零丢失——levelClear 开头把仍在场 gearDrops 全部转 pickups（死亡演出 2.2s 内没跑到
       的掉落结算前自动拾取）；respawn 改为只清 pickups（防陈旧事件）、gearDrops 跨死亡保留（工单 §5）。
   v7 增量（docs/specs/2026-10-24-v7-design.md §1.3/§4/§5/§6/§8，工单 docs/workorders/v7-frame.md，框架队）：
     - 章节读侧：Level 构造读 `ALL_LEVELS[idx] || LEVELS[idx]`（聚合表优先；levels.js 契约块=唯一声明处，
       引擎不聚合不写表；typeof 守卫覆盖「levels.js 契约块未合入」窗口期——此时回退 LEVELS，行为与 v6 全等）；
     - BAL §8 逐字落地（只增不改既有键值）：BAL.boss 追加 w/h/drop1/drop2/summon/poolNear/poolFar/p2Add
       与 barrage.deg（kind1 现行硬编码逐字收编，零行为变化——H5）；新增 BAL.boss2/boss3/enemy 四新敌/elite/flow/
       gear 六表/econ.chestGem；
     - Boss 参数化（R4：蛟龙/判官与星核巨兽共用同一 _engUpdateBoss 状态机，差异只来自参数表）：
       _engBossTable 选择器 / _engMkBoss(kind) / _engBossDur·Pick·Hurt·NovaRing·UpdateBoss 全量 T 化 /
       召唤工厂化 _engBossSummon(T) / 新三态 sweepCast·blinkCast·scytheCast（§6.3）；
     - 新敌统一工厂 _ENG_ENEMY_DEF + _engMkEnemy（§5.0）与提取 case 'N'/'J'/'T'/'E'/'x'/'z'；
       技能机四分支（枪虾突刺/水母电环/幽灵穿墙追踪+边界钳位/魂火自爆，§5.1-§5.4）；精英规则 §5.5
       （击退×kbMul/踩踏不秒杀/必掉装备 eliteK）；蝙蝠巡逻正弦读 e.amp/e.frq（缺省 7/2.2=现行值，零变化）；
     - 新机关（§4）：'G' 隐藏砖（solid 恒实+普攻/星陨可碎无金币）、'g' 宝箱（接触开启：装备 hidden 权重
       +chestGem 入 coins 不污染 totalCoin；opened 跨死亡保留）、'R' 灯笼（纯数据光源实体）、
       '{'/'}' 水流（玩家专属水平加速，BAL.flow）；
     - 杂项：_engDecorFallback 补 sea/nether；sfx 新事件 'chest','boom','blink','sweep'（engine 只 push）。
   v7.6 增量（审计修复：渲染表/碰撞表/伤害表/静态断言表四套口径对齐）：
     - 缺陷1：敌人垂直落地补 '=' 单向平台（_engFootTile = solid ∪ '='，语义对齐玩家 p.standOn：
       仅下落中且脚底上一帧在平台顶之上才吸附；掉头判定的「前方无落脚点」同步用该口径，否则平台上原地抖）；
     - 缺陷2：飞行巡逻（蝙蝠）补前方实心探测 + 撞墙钳位掉头，正弦浮动也不许钻实心（_engBodySolid）；
       俯冲 AI 的 aim/dive/back 状态机与撞墙提前结束判定不动；
     - 缺陷3：炮台开火前查炮口净空（_engMuzzleBlocked，6 格/96px），被堵则空转不开火不闪；
       挡路物是可碎木箱时玩家砸箱后自动恢复射击；
     - 缺陷4：魂火自爆判定由「中心距 ≤ r」改为「爆心到玩家矩形最近点 ≤ r」（契约算法 5 口径），
       BAL.enemy.boomer.skill.r 30→16（精灵 10×10，旧值中心距 30 时边缘还差 20px 就掉血）；
     - 缺陷5：弹簧触发带 s.y±10（20px）收紧到精灵可视区间 [s.y-2, s.y+6]，改用本帧脚底扫掠区间判定；
     - 缺陷6：移动平台行程不再写死 ±56/±48，构造期沿运动方向逐格扫 _railSolid 截断（<1 格退化为静止+warn）；
     - 缺陷7：_railSolid 补齐 'G' '(' ')' 与 solid() 同步（电锯/平台轨道不再穿过隐藏砖与传送带）；
       levels.js 的 SOLIDISH 同步补 '(' ')'。
   v7.7 增量（手感：对照空洞骑士逐项实测后只动「衔接」，不动「机动」）：
     - 冲刺：BAL.dash.cd 0.8→0.5 + 落地瞬间 p.dashCd 清零（触地即刷新）；蓄力段 0.05s 不再把跑速砍到
       60（同向保留当前速度）——起手 3 帧顿挫消失。dur/v 一字未动 ⇒ 冲刺距离 59.53px 不变；
     - 攻击：输入缓冲 p.abuf 0.12s（原冷却中按下直接丢弃 = 吞键）；松键截断去掉 prevJump 前提
       （缓冲跳也一致：短按永远矮、长按永远满高）；
     - 空中：_engAirAcc 0.75→1.0（同向加速与地面同档，转向仍 1.5×）；jumpV/grav/maxRun 全部不动；
     - 局外成长：v7.7 曾加过读侧（hp/atk/冲刺冷却三键加成），已按决定整体移除——数值回到
       纯基础值 + 装备加成；BAL.dash.cd=0.5 属手感改动，保留。
     实测（tools/_v77_feel.js）：满跳 33.6px 不变、短按 16.87→14.99px、跑速位移 115.83px 不变、
     冲刺距离 59.53px 不变、冲刺冷却 48→31 帧；reach 26/26 保持。
   v8.0 增量（四条手感/机关/相机/新敌工单，引擎侧）：
     - 传送带（任务1）：推力从「vx 加速度 520 / 上限 170」改为**独立带速 p.convV**
       （加速度 1200 / 上限 280，叠加在自身跑速之上）。旧写法把 vx 顶到 170，但下一帧的
       effRun=120 钳制又把它砍回去，实际只多 20px/s —— 这就是「传送带太慢没用」的根因。
       新模型：站住 = 280、顺向跑 = 120+280 = 400、逆向跑 = -120+280 = 160（被缓慢推回）。
       地面敌人同样吃带速（e.convV，加速度/上限取玩家一半 600/140，避免小怪被甩飞）；
     - 小怪卡住（任务2）：掉头判定补 e.turnCd 0.25s 冷却 + 撞墙钳位 x 到墙面 + 传送带把敌人
       推出边缘时不再掉头（否则每帧翻向 → 4.7px 见方的夹缝里 10 秒掉头 60 次，看着就是一动不动）；
     - 小怪脱困（任务3，v8.0 二轮）：任务2 只治「卡死」（spanX<8px），36~68px 的小坑里往返巡逻
       仍然一只都没抓到（路径长 279 一直在走、跨度只有 2~4 格）。新增 1.6s 活动窗口统计
       spanMin/spanMax，跨度 <40px（2.5 格）判「被困」→ 主动跳（slime/hopper 复用 leap/air）→
       换向冲刺（e.freeT 0.35s / 2.4 倍巡逻速）→ 原地掉头；交战半径内、技能状态机非 idle、
       冲刺中三条豁免。落点用水平射程精确解算（vx·2vy/g），只接受能站且≥2 格宽的落点，
       绝不把敌人弹进墙/弹下无底坑（tools/_v80_stuck.js 实测：卡住 0 / 抖动 2 与改前持平，
       跨度<40px 3→2 只，L3#5 那只从 36px 扩到 127px）；
     - 相机（任务3）：纵向死区 ±20px + 前瞻（vy>120 下移 16 / vy<-120 上移 12）+ 分轴 lerp
       （横 0.12 / 纵 0.08）；关卡不足一屏时 cam.y 允许负值把内容垂直居中；
     - 新敌（任务4）：'i' 铁甲虫 / 'k' 酸液花 / 'n' 跳跳蛛——统一走 _ENG_ENEMY_DEF + _engMkEnemy，
       状态机在 _engEnemySkill（wind→charge / cast→酸弹 / crouch→air），地面物理复用既有分支。
   v10 增量（玩家诉求：「Boss/小怪血量三倍；Boss 招式太重复，参考造梦西游丰富交互」）：
     - 血量 ×3：BAL.enemy 11 种 / BAL.elite 5 种 / BAL.boss~boss5 全部 ×3（Boss 三段血仍被 3 整除，
       每段 63/96/144/162/189）；_engBossMinionHpMul 3→1（否则 Boss 关杂兵会变 9 倍，常量保留为挂点）；
     - Boss 五个新招（新状态 meteorCast/spikeCast/homingCast/cloneCast/pullCast）：
       陨石雨（预警圈 0.85s → 落点冲击波）/ 地刺（向玩家方向 4 根，可跳）/ 追踪弹（78px/s、转向 1.4，
       跑起来可甩）/ 分身（0.85 体型、2 血、6s，可被打掉）/ 吸附力场（r140、水平力 320，1.2s 后接横扫或冲撞）；
     - 新实体数组 game.hazards（与 bullets/waves 同级，loadLevel 初始化，读侧全部 (|| []) 守卫）：
       meteor/spike/homing/clone/pull 五种，伤害统一 1，全部走 _engHurtPlayer（护盾/无敌帧有效）；
     - 连段：b.comboQ/comboN——P2 阶段 40% 概率一次排 2 招（不同招），recover 结束跳过 idle 直接接第二招，
       第二招前摇 -20%；连段收尾强制 0.9s 大破绽（stagger 受击 ×1.5），单招 30% 概率 0.6s 小破绽；
     - 选招轮转修复：旧写法先 filter lastPattern 再取模，池长 4/5 抖动导致某些招永远轮不到；
       改为在池上按位递增、撞到上一招才顺延（每轮覆盖池内全部招式）。
   v11 增量（玩家反馈：「小关可以什么都不干直接位移到最后，没啥体验」）：
     - 终点「封印」：碰旗不再直接过关，需三条路任选其一解锁——战斗（击败本关 60% 敌人）/
       金币（拾取本关 40% 金币实体）/ 解谜（解开本关神龛）；任一条达成即放行，
       保证任何玩家都能用自己擅长的方式推进，绝不卡关。Boss 关豁免（Boss 本身就是目标）。
     - 封印**不参与物理**：只拦 levelClear()，玩家矩形照样能走进终点区域（只轻推 vx 弹回），
       否则 tools/reach.js 的「玩家矩形物理命中终点」可达性门禁会 27/27 全红。
     - Level 构造统计 enemyTotal（Boss 召唤体不计，见 _engBossSummon 的 e.summoned）；
       game.seal 在 loadLevel 初始化，计数每帧从实体重算（respawn 复活敌人后进度自动回落）。
   硬性约束（契约第 0 节）：
     - 普通 script 文件：无 import/export；顶层只做声明，
       顶层零 DOM / 零音频 / 零键盘（node 门禁会在无 DOM 环境执行本文件）；
     - 不 draw；音效只 push 到 game.sfxQueue；输入只读 game.input；
     - 内部辅助符号一律 _eng 前缀并注明「内部」，不新增契约外全局符号，
       _eng 前缀同时避免与 art/levels 模块的内部符号在全局作用域撞名。
   ============================================================ */

/* ==================== 内部工具（内部） ==================== */
const _engTile = 16;              // 内部：瓦片像素边长
const _engVW = 384, _engVH = 224; // 内部：内部分辨率（相机钳制用）
/* v8.0 任务1：传送带（玩家）。加速度 1200 / 上限 280（工单建议带 1100~1300 / 260~300）——
   0.23s 就到顶，站住 1 秒被推 248px（15 格），肉眼绝不可能忽略；上限 280 < 16px/帧=4.67px，
   单帧位移仍远小于一格瓦片，贴墙处不会穿墙（tools/_v80_belt.js 实测钳位在墙面外）。
   旧值 520/170 的实际带速只有 170-120=50px/s（顺向）和 -170（逆向），玩家「感觉不到」。
   敌人取一半（600/140）：既看得出被带子推，又不会被甩出画面（小怪 10~14px 宽，140px/s 已是 10 身位/秒）。 */
const _engConvAcc = 1200, _engConvCap = 280;
const _engConvAccE = 600, _engConvCapE = 140;
/* v8.0 任务3：相机纵向死区 / 前瞻 / lerp（横向 0.12 一字不动）。 */
const _engCamDz = 20;        // 纵向死区 ±20px：玩家在屏幕中央这条带里移动时相机完全不动（跳跃不抽搐）
const _engCamLookDown = 16;  // vy > 120（快速下落）：目标点下移 16px，提前看到落点
const _engCamLookUp = 12;    // vy < -120（快速上升）：目标点上移 12px
const _engCamLerpY = 0.08;   // 纵向 lerp 比横向 0.12 更慢更稳（竖直方向最忌抖）
const _engEps = 0.01;             // 内部：AABB 右/下缘取整前的回退量（恰好压线不算重叠）
const _engDecorFallback = {       // 内部：THEMES 桩（门禁环境）无 decor 字段时的兜底装饰表
  grass: ['bush', 'flower', 'mushroom'], cave: ['crystal', 'mushroom'],
  sky: ['cloudpot', 'flower'], factory: ['gear', 'chain'],
  lava: ['torch', 'skull'], tower: ['torch', 'crystal'],
  boss: ['crystal', 'torch', 'skull'], // v3：星核虚空复用既有 decor 类型（设计 §0）
  // v5 §G：第二波新主题预补三键（用既有 decor 类型名；风格队无需动 engine）
  wind: ['tallgrass', 'flower', 'pinwheel'], castle: ['torch', 'urn', 'boulder'],
  star: ['crystal', 'chain', 'urn'],
  // v7 §5.7：sea/nether 两键兜底（美术队 THEMES 未合入时的门禁桩环境；decor 类型名=设计 §3.1/§3.2）
  sea: ['coral', 'shell', 'kelp'], nether: ['ghostflame', 'bone', 'skull']
};
/* v17 装饰交互表：有「可交互外观」的装饰给真实交互——玩家默认「长得像就能碰」，纯摆设=最差反馈。
   唯一真值（reach/tools/_v17_decor_test 都从这里读）；w/h 必须与 art.js _buildDecor 的画布尺寸一致
   （测试逐项比对 canvas 宽高，改 art 尺寸必须同步这里）。
   cls 三类：
     harm  长着危险脸（尖锥/明火/尖碎片）——触碰扣 1 心，走 _engHurtPlayer（吃无敌帧/护盾/击退）；
     break 长着「能打碎」脸（石/桶/瓮/骨）——攻击打碎，+1 金币（直入 game.coins 不进 totalCoin，
           口径同宝箱 chestGem：星级分母保持关卡构造期快照，详见 CONTRACT v17）；
     pick  长着「能捡」脸（水晶与 '*' 宝石同族配色）——触碰收集 +1 金币。
   其余装饰（草花蘑菇云齿轮珊瑚…）语义上明显无害，保持纯装饰——那不是「没交互」，是「本来就不该有」。 */
const _ENG_DECOR_HIT = {
  stalagmite:  { cls: 'harm', w: 11, h: 13 },  // 石笋：灰色尖锥，玩家眼里的「地刺」
  flamepillar: { cls: 'harm', w: 9,  h: 12 },  // 火焰柱：两帧明火
  ghostflame:  { cls: 'harm', w: 8,  h: 10 },  // 鬼火：幽冥绿火
  obsidian:    { cls: 'harm', w: 9,  h: 11 },  // 黑曜石：带棱尖碎片
  boulder:     { cls: 'break', w: 13, h: 10 }, // 圆石
  barrel:      { cls: 'break', w: 14, h: 12 }, // 金属桶（警示带）
  urn:         { cls: 'break', w: 10, h: 10 }, // 陶瓮
  skull:       { cls: 'break', w: 10, h: 9 },  // 骷髅
  ribcage:     { cls: 'break', w: 12, h: 5 },  // 肋骨
  lavarock:    { cls: 'break', w: 13, h: 9 },  // 熔岩砾石
  gear:        { cls: 'break', w: 14, h: 14 }, // 齿轮（v17.1：tower/factory 的轮状机械件，玩家点名「轮子没交互」）
  valve:       { cls: 'break', w: 13, h: 12 }, // 阀门轮盘（轮辐+红阀芯，同为轮状金属件）
  crystal:     { cls: 'pick', w: 9,  h: 13 },  // 水晶簇（两帧辉光）
  crystalS:    { cls: 'pick', w: 8,  h: 9 },   // 小水晶（art 注释写 7×9，实测画布 8×9——以测试 T2 对表为准）
};
function _engClamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function _engSign(v) { return v < 0 ? -1 : v > 0 ? 1 : 0; }
function _engAabb(a, b) { // a/b 均为 {x,y,w,h}
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function _engMulberry(seed) { // 内部：种子随机（装饰摆放必须确定性）
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function _engAddParts(x, y, n, color, spd, grav) { // 内部：粒子（game.parts 为引擎自有状态，ui 只读渲染）
  if (game.parts.length >= BAL.guard.parts) return; // v5 §D：上限 240（超限丢弃，红线峰值 ≤300 的一半配额）；v6 收编 BAL.guard
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, s = spd * (0.3 + Math.random() * 0.7);
    game.parts.push({
      x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - spd * 0.3,
      life: 0.5 + Math.random() * 0.4, color: color || '#ffffff',
      size: 1 + Math.random() * 2, grav: grav === undefined ? 300 : grav
    });
  }
}
function _engFloat(x, y, text, color, big) { // 内部（v5 §D）：浮动文字（伤害/金币/连击，≤40）
  // 所有权：引擎只 push；ui 每步推进+修剪（hit-stop/ult 冻结期间也动）。引擎不得 filter/splice。
  if (game.floats.length >= BAL.guard.floats) game.floats.shift();
  game.floats.push({ x: x, y: y, text: text, color: color, t: 0, life: 0.8, big: big || 0 });
}
function _engFx(x, y, opt) { // 内部（v5 §D）：UI 层演出粒子（≤60；ring/shard/star 由 ui 特绘）
  // 所有权同 floats：引擎只 push，ui 推进渲染。
  if (game.fxParts.length >= BAL.guard.fx) return;
  game.fxParts.push(Object.assign({ x: x, y: y, vx: 0, vy: 0, life: 0.4,
    color: '#ffffff', size: 2, grav: 0 }, opt || {}));
}
function _engAddStars(x, y, n, color) { // 内部（v5 §D）：星形火花 4~6 粒（打击感 #8）
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, s = 60 + Math.random() * 70;
    _engFx(x, y, { star: 1, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, grav: 260,
      life: 0.3 + Math.random() * 0.2, color: color, size: 1 });
  }
}
function _engShake(m, delay) { // 内部（v5 §1.5）：分级震屏（单槽 shakePend；大值可覆盖未生效小值）
  if (!game.shakePend || game.shakePend.m <= m) game.shakePend = { m: m, t: delay || 0 };
}
function _engRectTiles(L, rx, ry, rw, rh, cb) { // 内部：遍历矩形覆盖到的瓦片，回调 cb(tx,ty,ch)
  const x0 = Math.floor(rx / _engTile), x1 = Math.floor((rx + rw - _engEps) / _engTile);
  const y0 = Math.floor(ry / _engTile), y1 = Math.floor((ry + rh - _engEps) / _engTile);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) cb(tx, ty, L.tileAt(tx, ty));
}

/* ==================== 物理常量（契约导出；键名固定，数值可 ±15%） ====================
   v6 §A：grav 1500→1320、maxFall 360→285（任务书指定例外，超出 ±15% 带，附记 v6 记录）、
   jumpV 330→309、springV 520→488（等高换算 k=√(1320/1500)≈0.9381，h=v²/2g 不变）。
   v9 下落手感（玩家"下落太快、落地像砸下去"）：上升重力 1320 不变 / 下落重力 850 /
   顶点 ±50px/s 内 0.62 倍滞空 / 落速上限 205；落速上限以外的 acc/fric/fricIce/maxRun/
   jumpV/springV/coyote/buffer 一字不动。下落时间约 0.30s→约 0.39s，总滞空 0.58→约 0.71s，
   跳高仍约 53-57px（v7.8 的 3 格台余量不减少——顶点前重力未动）。 */
const PHY = {
  grav: 1320, gravFall: 850, maxFall: 205, apexBand: 50, apexMul: 0.62, fastGravMul: 1.35,
  acc: 1400, fric: 1800, fricIce: 180,
  // v7.8 跳跃高度：309→385。解析跳高 33.6px→56.1px（=3.5 瓦片），实测 53.1px（逐帧欧拉积分比解析值低约 3px）。
  // 依据：关卡里 48px（3 格）平台共 200+ 处（L4 95 / L9 62 / L11 44 / L14 26），
  // 旧值实测 33.6px：单跳连 2 格（32px）都只剩 1.6px 余量、3 格必须二段跳卡时机，玩家实测"有些台阶上不去"。
  // 先试 368 实测只有 48.3px——3 格台余量 0.3px，等于没修。385 实测 53.1px，3 格之上留 5px 余量 +
  // 约 0.17s 停留窗口（跑速 120px/s 下水平位移 21px，够踩进去），4 格（64px）仍上不去，难度梯度不塌。
  // 二段跳 −jumpV×0.92 同步等比放大（总高约 98px）；弹簧 488 / 踩踏反弹 235 数值不动（保持既有弧线）。
  maxRun: 120, jumpV: 385, springV: 488,
  coyote: 0.12, buffer: 0.18 // v2 P1 手感调优：土狼 0.09→0.12、缓冲 0.11→0.18（任务书指定）
};

/* ==================== v6 BAL 全数值总表（契约导出；唯一权威数值表，v9 在 v6 基线上修订） ====================
   v6 BAL 全数值总表注释：docs/specs/2026-10-24-v6-balance.md §0 的派生/推导索引沿用；
   v9 平衡修订（只动下列数值，键名不增删）：
     玩家：atkBase 1→2（无装备普攻翻倍）；gear.stat.w 金 6→3、蓝/紫 3/4→2（满装 ATK 7→5）；
     gear.stat.h 紫/金 4→2（满装 HP 9→7）。
     三命 Boss：总血必须能被 3 整除，hp 72→63 / 108→96 / 165→144 / 186→162 / 216→189
     （每段 21/32/48/54/63）；p2At、windup、idleT 及任何招式参数均不动。
     TTK 预期（实测口径）：无装备双 Boss 约 170s→约 85-100s；满装约 53s→约 60-65s。 */
const BAL = {
  fall:  { fast: 360 },                       // §F 速降上限（=旧 maxFall，按住↓恢复精准落地）
  player:{ hpBase: 5, atkBase: 2, critMul: 2, critMod: 4,
           stompDmg: 1, stompBounce: 235, hurtKbX: 160, hurtKbY: 131, invT: 1.0, respawnInvT: 1.5 },
  atk:   { cd: 0.35, boxW: 18, boxH: 14, anim: 0.25, wind: 0.05, dur: 0.12, hitStop: 0.10 },
  // v7.7 手感：cd 0.8→0.5（对照空洞骑士 0.45~0.55s；dur/v 不动 ⇒ 冲刺距离 59.53px 不变）
  // v7.9：冲刺追加无敌帧。0.10s（6 帧）刚好覆盖「看到攻击抬手 → 按 K 穿过判定框」的反应窗口，
  // 又远短于 dash 总时长 0.28 —— 不会变成「一直按 K 无敌」。取 0.10 而非 0.18 是玩家明确要求：
  // 0.18 太长会「没有操作感觉」（无敌窗口比敌人攻击判定还宽，闪避就退化成无脑贴身）。
  // v14：0.10 → 0.15（9 帧）；v15：0.15 → 0.20（12 帧，玩家第二次反馈「还是太难打」）。
  // 定版取 0.20 的依据：dash 总时长 0.28 / CD 0.5 —— 无敌覆盖一次冲刺的 71%，
  // 一次性穿过多段判定（弹幕、连撞、劈地波）不再看运气；但连按 K 仍留 0.30s 裸窗，
  // 「滚地无敌」不成立。若还要再松，优先动 player.invT（受击后 1.0s）而不是继续拉这个值——
  // inv ≥ dur 会让冲刺后半段也免疫，等于把闪避变成短距瞬移。
  dash:  { cd: 0.5, dur: 0.28, v: 260, gravMul: 0.5, inv: 0.20 },
  combo: { win: 2, ultNeed: 8 },
  // v7.1 O 重做：连击门槛与实战节奏脱节（怪少窗短叠不满 8）→ 改能量充能制：
  // 任何命中充 ultCharge.hit（碎砖减半），满 ultNeed 释放；死亡/断连击不清充能
  ult: { chargeHit: 10, chargeBrick: 5, ultNeed: 100 },
  skills:{
    u: { cd: 8,   meteors: 3, fallV: 300, delay: [0.50,0.75,1.00], dmg: 2, bossDmg: 2, aoe: 24 },
    i: { cd: 12,  dur: 3.0, absorb: 2 },
    o: { cd: 20,  dmg: 5, t: [0.55,0.90,1.20] },
    l: { cd: 6,   vOut: 320, range: 160, vBack: 340, dmg: 2, life: 2.6 } },
  enemy: {
    // v7.2 血量加厚（玩家"小怪血变厚一点"）：slime 2→3 / bat 1→2 / mage 2→3 / jelly 1→2 /
    // boomer 1→2 / lancer 2→3 / ghost 2→3；knight 3→4（精英 x/z 倍率不变，经 BAL.elite.hpMul 放大）
    // v10：玩家要求「小怪血量变成原来的三倍」——11 种基础血全部 ×3（其余字段一字不动）。
    slime:  { hp: 9, spd: 28, fall: 300, skill: { rngX: 56, up: 40, dn: 48, wind: 0.5, vx: 90, vy: 260, cd: 3.2 } },
    bat:    { hp: 6, spd: 40, rng: 44, skill: { rng: 90, wind: 0.5, vDive: 240, diveMax: 0.55, vBack: 120, cd: 4.0 } },
    knight: { hp: 12, spd: 20, skill: { rngX: 110, rngY: 24, wind: 0.6, vx: 190, dur: 0.5, vuln: 0.7, cd: 5.0 } },
    mage:   { hp: 9, skill: { rng: 140, cast: 0.8, recover: 0.5, boltV: 95, home: 1.6, turn: 2.2, boltLife: 3.2, cd: 3.5 } },
    // v7 §8 追加四键（新敌；ghost/boomer 技能机不用冷却故无 cd 键——§5.6 表「CD —」）
    lancer: { hp: 9, spd: 34, fall: 300, skill: { rngX: 72, rngY: 24, wind: 0.55, vx: 240, dur: 0.28, recover: 0.5, cd: 4.5 } },
    jelly:  { hp: 6, skill: { rng: 40, wind: 0.6, dur: 0.4, ring: 18, cd: 5.0 } },
    ghost:  { hp: 9, skill: { wake: 150, lose: 260, spd: 26, home: 40 } },
    boomer: { hp: 6, spd: 30, fall: 300, skill: { wake: 120, rng: 36, rngY: 40, wind: 0.8, r: 16 } },
    // v8.0 任务4：三种新敌（键名/数值=工单逐字，既有键一个不动）
    // beetle 速度 76（史莱姆 28 的 2.7 倍）——压迫感来自速度；冲撞 150 是玩家 maxRun 120 的 1.25 倍，
    // 站着不动躲不掉、起跳即可躲（冲撞期间不可踩踏，只能侧打或跳）。
    beetle:  { hp: 6, spd: 76, fall: 300, skill: { rngX: 88, wind: 0.35, vx: 150, cd: 3.6 } },
    // spitter 站桩（spd 0）：150px 覆盖半个屏宽，0.4s 读条给足反应；酸弹 130 慢于玩家跑速，可走位躲。
    spitter: { hp: 9, spd: 0,  fall: 300, skill: { rng: 150, cast: 0.4, boltV: 130, cd: 2.2 } },
    // hopper 44（比史莱姆快但慢于玩家）：跳跃 300 ≈ 34px 高、滞空 0.45s，vx 90 只用于朝玩家压位。
    hopper:  { hp: 6, spd: 44, fall: 300, skill: { rng: 110, crouch: 0.3, jumpV: 300, vx: 90, cd: 1.8 } } },
  boss:  { hp: 189, p2At: 30, actDist: 176, grav: 1500, fallV: 520, // v10：63→189（×3，仍被 3 整除，每段 63）
           windup: { leap: 0.50, barrage: 0.45, charge: 0.60, summon: 0.50, nova: 0.55, dive: 0.55,
                     // v10 五新招前摇（≥0.5s，保证可读；UI 按 b.state 画预警）
                     meteor: 0.70, spike: 0.55, homing: 0.60, clone: 0.55, pull: 0.50,
                     // v12 五种新交互类型前摇（spec §一；本表只实配 grab，其余为键完整性）
                     grab: 0.75, quake: 0.60, pillar: 0.60, quell: 0.90, core: 0.70 }, p2WindMul: 0.85,
           idleT: [0.48, 0.36], walk: [20, 25],
           leap: { T: 0.9, vy: 675, clamp: 300 },
           charge: { v: [230, 290], maxT: 1.5, maxX: 320, hits: 2 }, // v12：两段连撞（撞墙反弹再冲一次）
           grab: { reach: 46, dmg: 2 },                              // v12：抓取摔投（spec §一.4）
           barrage: { v: 130, rounds: 3, pairGap: 0.15, endT: 0.45, deg: [-8, 8] }, // v7 §8：deg=现行硬编码 [-8,8] 收编
           nova: { v: 100, t: [0.55, 0.95], endT: 1.2 },
           dive: { ringV: 100 },   // v7.9 末段新招：leap 落地额外甩一圈弹
           // v10 新招参数（星核巨兽：近身陨石雨 / 远程地刺）
           meteor: { n: 3, gap: 0.28, warn: 0.85, vy: 260, r: 9 },
           spike:  { n: 4, gap: 0.16, h: 24, life: 1.1 },
           stagger: 1.5, enrage: 1.2, dying: 2.2, revive: 0.9,
           recover: { leap: 0.7, barrage: 0.5, charge: 0.4, summon: 0.5, nova: 0.6, dive: 0.65,
                      meteor: 0.6, spike: 0.5, homing: 0.5, clone: 0.6, pull: 0.5,
                      grab: 0.55, quake: 0.5, pillar: 0.5, quell: 0.6, core: 0.6 }, // v12：新招后摇（缺则取兜底 0.5）
           contactDmg: 1,
           // v7 §8 追加键：kind1 现行硬编码逐字收编（零行为变化——H5，_v6_loot_test ② L7 采样双证）
           w: 52, h: 48, drop1: 'boss1', drop2: 'boss2',
           summon: { type: 'slime', n: 2, off: [-40, 40], leech: 0.4, cd: 16, hp: 4 },
  // v13.1 玩家反馈「召唤不能一直召唤，打小怪累死」：
  //   · cd = 召唤冷却（秒）：冷却期内 summon 不进选招池，清完小怪也要等够时间才会再召；
  //   · hp = 召唤体血量覆盖（基础血 9 太肉：2 只 18 血 = 9 刀，清场成本高于收益）。

           /* v16 去同质化（spec §二）：每只 Boss = 4 招招牌 + barrage 普攻，P2 再追加 nova。
              招牌六只互不重合——重复的招式会被玩家记成「所有 Boss 都这样」，Boss 战就退化成同一场；
              charge（三连撞）因此只归牛魔王，dive 也从所有 p2Add 撤下（与 leap 同一套抛物线，
              摆在池里等于变相重合；参数与实现保留，将来有别的用法再接）。 */
           // 星核巨兽招牌：meteor 陨石雨 / spike 地刺 / summon 召唤 / leap 跳劈
           poolNear: ['meteor', 'spike', 'summon', 'leap', 'barrage'],
           poolFar: ['barrage', 'meteor', 'spike'],
           p2Add: ['nova'] },
  boss2: { // 蛟龙·敖渊（L13，sea）——v7 §8 逐字
    hp: 288, p2At: 36, actDist: 176, grav: 1500, fallV: 520, w: 64, h: 40, // v10：96→288（×3，每段 96）
    windup: { leap: 0.55, barrage: 0.50, charge: 0.65, summon: 0.50, sweep: 0.55, nova: 0.55, breath: 0.70,
              meteor: 0.70, spike: 0.55, homing: 0.60, clone: 0.55, pull: 0.50,
              grab: 0.75, quake: 0.60, pillar: 0.60, quell: 0.90, core: 0.70,
              mist: 0.60 }, // v10 五新招前摇 + v12 补键 + v13 mist
    p2WindMul: 0.85, idleT: [0.56, 0.40], walk: [26, 32],
    leap: { T: 1.0, vy: 700, clamp: 320 },
    charge: { v: [250, 310], maxT: 1.5, maxX: 320 },
    barrage: { v: 110, rounds: 4, pairGap: 0.18, endT: 0.5, deg: [-18, 0, 18] },
    sweep: { rounds: 3, gap: 0.55, wv: 130, life: 0.42, wh: 16 },
    nova: { v: 110, t: [0.55, 0.95], endT: 1.2 },
    summon: { type: 'jelly', n: 2, off: [-44, 44], leech: 0.5, cd: 16, hp: 3 },
  // v13.1 玩家反馈「召唤不能一直召唤，打小怪累死」：
  //   · cd = 召唤冷却（秒）：冷却期内 summon 不进选招池，清完小怪也要等够时间才会再召；
  //   · hp = 召唤体血量覆盖（基础血 9 太肉：2 只 18 血 = 9 刀，清场成本高于收益）。

    breath: { rounds: 2, gap: 0.50, wv: 120, life: 0.5, wh: 16 },  // v7.9 末段新招：两段贴地潮涌
    // v10 新招参数（蛟龙：近身吸附 / 远程追踪弹）
    pull:   { dur: 1.2, force: 320, r: 140 },
    homing: { n: 3, gap: 0.22, v: 78, turn: 1.4, life: 2.6 },
    quake: { w: 14, h: 26, v: 200, life: 0.9, n: 2, gap: 0.35 }, // v12：劈地窄高波（跳 26px 即躲）
    // v13 §二：水雾区（原地不动就持续挨打；跑出去即脱身，雾不挡移动不挡攻击）
    // v18 §一：v13 原版实测过弱——tick 0.5s 被玩家受击无敌 1.0s 吞半 + 受击击退 160px/s
    // 当场把人弹出 56px 雾带，实战期望伤害≈1（站桩才挨打=玩家自选）。
    // 加强取「减速流」：雾内普跑 ×0.5（120→60px/s，穿越 56px 雾带 0.93s），
    // 冲刺不压速（dash 260px/s 带无敌帧仍是一瞬间穿出，保留操作奖励）。
    // v18.1（用户指令）：水雾改为**纯减速零伤害**——dmg=0 时 hazard 侧完全不走
    // _engHurtPlayer（无伤无击退不触发无敌帧），雾只负责「进去就走不动」。
    mist:  { n: 3, w: 56, h: 96, life: 4.0, tick: 0.5, dmg: 0, off: [-80, 0, 80], slow: 0.5 },
    stagger: 1.5, enrage: 1.2, dying: 2.2, revive: 0.9,
    recover: { leap: 0.7, barrage: 0.5, charge: 0.4, summon: 0.5, nova: 0.6, sweep: 0.6, breath: 0.55,
               meteor: 0.6, spike: 0.5, homing: 0.5, clone: 0.6, pull: 0.5,
               grab: 0.55, quake: 0.5, pillar: 0.5, quell: 0.6, core: 0.6, mist: 0.6 }, // v12 补键 + v13 mist
    // 蛟龙招牌：sweep 扫尾 / mist 水雾 / pull 吸附 / breath 吐息
    poolNear: ['sweep', 'mist', 'pull', 'breath', 'barrage'],
    poolFar: ['barrage', 'breath', 'pull', 'mist'],
    p2Add: ['nova'], contactDmg: 1, drop1: 'jiao1', drop2: 'jiao2' },
  boss3: { // 幽冥判官（L16，nether）——v7 §8 逐字
    // v7.9：hp 140→138。三段血要求每段 HP 是整数（140/3=46.67 会让血条与段内残余对不上），
    // v8.1 再回调 138→165（55×3），门禁只断言 maxHp===本表 hp。
    // v9：165→144（48×3），与 atkBase 2 / 满装 ATK 5 同步，缩短无装备侧 TTK。
    // v10：144→432（×3，每段 144），玩家要求「Boss 血量三倍」。
    hp: 432, p2At: 56, actDist: 176, grav: 1500, fallV: 520, w: 40, h: 52,
    windup: { blink: 0.50, scythe: 0.60, barrage: 0.45, summon: 0.50, nova: 0.55, halo: 0.65,
              meteor: 0.70, spike: 0.55, homing: 0.60, clone: 0.55, pull: 0.50,
              grab: 0.75, quake: 0.60, pillar: 0.60, quell: 0.90, core: 0.70,
              mirror: 0.60 }, // v10 五新招前摇 + v12 补键 + v13 mirror
    p2WindMul: 0.85, idleT: [0.45, 0.32], walk: [18, 22],
    leap: { T: 0.9, vy: 675, clamp: 300 },      // 表完整性（判官轮换池不含 leap/charge）
    charge: { v: [230, 290], maxT: 1.5, maxX: 320 },
    barrage: { v: 120, rounds: 3, pairGap: 0.16, endT: 0.45, deg: [-10, 0, 10] },
    blink: { hideT: 0.30, dx: 96, after: 0.35 },
    scythe: { wv: 150, life: 0.6, w: 16, h: 22 },
    nova: { v: 105, t: [0.55, 0.95], endT: 1.2 },
    summon: { type: 'ghost', n: 2, off: [-48, 48], leech: 0.5, cd: 16, hp: 4 },
  // v13.1 玩家反馈「召唤不能一直召唤，打小怪累死」：
  //   · cd = 召唤冷却（秒）：冷却期内 summon 不进选招池，清完小怪也要等够时间才会再召；
  //   · hp = 召唤体血量覆盖（基础血 9 太肉：2 只 18 血 = 9 刀，清场成本高于收益）。

    halo: { v: 95, t: [0.50, 0.85, 1.20], endT: 1.55 },   // v7.9 末段新招：三圈鬼火
    // v10 新招参数（判官：近身分身 / 远程地刺）
    clone: { n: 2, life: 6.0, hp: 2 },
    spike: { n: 4, gap: 0.16, h: 24, life: 1.1 },
    quell: { dur: 2.2, warn: 0.9, r: 22, n: 2, breakDmg: 12, dmg: 2 }, // v12：蓄力全屏（可打断 / 站结界圈）
    // v13 §二：真假身（本体混进幻影列 + 隐身免伤；打错爆炸、打真身转大破绽）
    mirror: { n: 3, life: 5.0, hp: 1, popDmg: 1, swapOff: 96 },
    stagger: 1.5, enrage: 1.2, dying: 2.4, revive: 0.9,
    recover: { blink: 0.4, halo: 0.6, scythe: 0.6, barrage: 0.5, summon: 0.5, nova: 0.6, leap: 0.7, charge: 0.4,
               meteor: 0.6, spike: 0.5, homing: 0.5, clone: 0.6, pull: 0.5,
               grab: 0.55, quake: 0.5, pillar: 0.5, quell: 0.6, core: 0.6, mirror: 0.6 }, // v12 补键 + v13 mirror
    // 判官招牌：scythe 镰刀波 / blink 传送 / mirror 真假身 / quell 蓄力结界
    poolNear: ['scythe', 'blink', 'mirror', 'quell', 'barrage'],
    poolFar: ['barrage', 'scythe', 'blink', 'quell'],
    p2Add: ['nova'], contactDmg: 1, drop1: 'gui1', drop2: 'gui2', revive: 0.9 },
  // ==================== v7.9 终章双 Boss ====================
  // 分两棒，不是同时出场：冥古龙被打空三段 → 原地「倒下」，曜光·圣裁者接力进场（nextKind 链）。
  // 两棒共用同一套状态机与同一套三段血规则；新招式全部由既有实体（ground wave / star bullet）
  // 组合而成，不引入新弹种——玩家能躲的前提是「看得懂」，新实体只会制造交互未知数。
  boss4: { // 冥古龙（L18 首发，nether）：骨角魔龙，四足+破翼，熔岩裂纹；hp 162 → 每段 54
    hp: 486, p2At: 0, actDist: 176, grav: 1500, fallV: 540, w: 64, h: 48, // v10：162→486（×3，每段 162）
    windup: { leap: 0.55, barrage: 0.50, charge: 0.65, summon: 0.50, nova: 0.55,
              sweep: 0.55, breath: 0.75, dive: 0.60,
              meteor: 0.70, spike: 0.55, homing: 0.60, clone: 0.55, pull: 0.50,
              grab: 0.75, quake: 0.60, pillar: 0.60, quell: 0.90, core: 0.70,
              push: 0.75 }, // v10 五新招前摇 + v12 补键 + v13 push
    p2WindMul: 0.82, idleT: [0.50, 0.34], walk: [24, 30],
    leap: { T: 1.0, vy: 700, clamp: 320 },
    charge: { v: [260, 320], maxT: 1.4, maxX: 340, hits: 3 }, // v12：三段连撞（spec §二）
    barrage: { v: 125, rounds: 4, pairGap: 0.16, endT: 0.5, deg: [-12, 0, 12] },
    sweep: { rounds: 3, gap: 0.52, wv: 145, life: 0.42, wh: 16 },
    // 炼狱吐息：贴地三段推进波，波高 14px（站地面会中，跳上任意台面即可躲）——
    // 间隔 0.46s 留出「跳上去 → 等下一段 → 落回来」的完整窗口，不是连击必吃。
    breath: { rounds: 3, gap: 0.46, wv: 130, life: 0.5, wh: 14 },
    // 陨落（dive）：leap 落地那一下额外甩一圈 8 向弹，把「跳劈」从纯位移变成需要读落点的招
    dive: { ringV: 105 },
    nova: { v: 110, t: [0.55, 0.95], endT: 1.2 },
    summon: { type: 'ghost', n: 2, off: [-52, 52], leech: 0.4, cd: 16, hp: 4 },
  // v13.1 玩家反馈「召唤不能一直召唤，打小怪累死」：
  //   · cd = 召唤冷却（秒）：冷却期内 summon 不进选招池，清完小怪也要等够时间才会再召；
  //   · hp = 召唤体血量覆盖（基础血 9 太肉：2 只 18 血 = 9 刀，清场成本高于收益）。

    // v10 新招参数（冥古龙：近身陨石雨 / 远程吸附）
    meteor: { n: 3, gap: 0.28, warn: 0.85, vy: 260, r: 9 },
    pull:   { dur: 1.2, force: 320, r: 140 },
    quake: { w: 14, h: 26, v: 200, life: 0.9, n: 2, gap: 0.35 },   // v12：劈地窄高波
    core: { n: 2, hp: 3, life: 10, r: 9 },                          // v12：核心护盾（破盾才掉血）
    // v16：clone 进 boss4 池（招牌之一），参数直接沿用 boss3 —— 同一招在两个 Boss 身上
    // 必须是同一套读数，否则玩家「打过一次」的经验会失效。
    clone: { n: 2, life: 6.0, hp: 2 },
    // v13 §二：推进墙（从玩家背向 Boss 的一侧进场，只能朝 Boss 方向持续跑）
    push: { w: 24, h: 64, v: 88, dmg: 2, warn: 0.9 },
    stagger: 1.4, enrage: 1.2, dying: 2.4, revive: 0.9,
    recover: { leap: 0.7, barrage: 0.5, charge: 0.4, summon: 0.5, nova: 0.6,
               sweep: 0.6, breath: 0.55, dive: 0.65,
               meteor: 0.6, spike: 0.5, homing: 0.5, clone: 0.6, pull: 0.5,
               grab: 0.55, quake: 0.5, pillar: 0.5, quell: 0.6, core: 0.6, push: 0.6 }, // v12 补键 + v13 push
    // 冥古龙招牌：push 推进墙 / core 核心护盾 / quake 劈地波 / clone 幽冥分身
    poolNear: ['push', 'core', 'quake', 'clone', 'barrage'],
    poolFar: ['barrage', 'push', 'quake', 'core'],
    p2Add: ['nova'],
    /* v8.0：接触伤害 2→1。实测 46% 的受伤发生在 Boss 收招/待机/弹幕已放完之后——
     * 玩家主观判定一定是「我明明没被打到」，这是最伤信任的一类挫败。身体始终有危险（保留 1 点），
     * 但代价减半；不改「只在出招时判接触」是因为那会把战斗退化成「等收招再贴脸」。
     * boss5 体型小、位移多（blink 常贴身落点），同样取 1。 */
    contactDmg: 1, drop1: 'ming1', drop2: 'ming2',
    nextKind: 5 },   // 三段打空 → 不通关，换第二棒（见 dying 分支）
  boss5: { // 曜光·圣裁者（L18 第二棒，nether）：白袍+金环+光翼，hp 189 → 每段 63
    hp: 567, p2At: 0, actDist: 176, grav: 1500, fallV: 520, w: 44, h: 52, // v10：189→567（×3，每段 189）
    windup: { blink: 0.55, barrage: 0.45, halo: 0.70, summon: 0.50, nova: 0.55,
              scythe: 0.60, leap: 0.55, charge: 0.65, dive: 0.60,
              meteor: 0.70, spike: 0.55, homing: 0.60, clone: 0.55, pull: 0.50,
              grab: 0.75, quake: 0.60, pillar: 0.60, quell: 0.90, core: 0.70,
              parry: 0.55, totem: 0.70 }, // v10 五新招前摇 + v12 补键 + v13 parry + v16 totem
    p2WindMul: 0.82, idleT: [0.47, 0.33], walk: [20, 26],
    leap: { T: 0.9, vy: 675, clamp: 300 },
    charge: { v: [240, 300], maxT: 1.5, maxX: 300 },
    barrage: { v: 115, rounds: 4, pairGap: 0.15, endT: 0.5, deg: [-14, 0, 14] },
    blink: { hideT: 0.28, dx: 100, after: 0.32 },
    // 圣辉轮（halo）：三圈 8 向弹，逐圈转 15°，弹速 92（比 nova 慢）——慢弹才能「走位穿缝」，
    // 三圈之间留 0.35s，玩家有窗口换位置；这是光系 Boss 的主招，必须可躲。
    halo: { v: 92, t: [0.45, 0.80, 1.15], endT: 1.5 },
    scythe: { wv: 150, life: 0.6, w: 16, h: 22 },
    nova: { v: 105, t: [0.55, 0.95], endT: 1.2 },
    /* v10：补 dive 参数键（当时 p2Add 里有 'dive'，但本表从未定义 T.dive，
       于是 `if (b.next === 'dive' && T.dive)` 恒假）。v16 已把 dive 从所有 p2Add 撤下，
       这个键现在没有池子入口——保留是为了将来复用同一套抛物线时不至于又踩「有招无参」。 */
    dive: { ringV: 100 },
    summon: { type: 'ghost', n: 2, off: [-44, 44], leech: 0.4, cd: 16, hp: 4 },
  // v13.1 玩家反馈「召唤不能一直召唤，打小怪累死」：
  //   · cd = 召唤冷却（秒）：冷却期内 summon 不进选招池，清完小怪也要等够时间才会再召；
  //   · hp = 召唤体血量覆盖（基础血 9 太肉：2 只 18 血 = 9 刀，清场成本高于收益）。

    // v10 新招参数（圣裁者：近身追踪弹 / 远程分身）
    homing: { n: 3, gap: 0.22, v: 78, turn: 1.4, life: 2.6 },
    clone:  { n: 2, life: 6.0, hp: 2 },
    grab: { reach: 46, dmg: 2 },                                     // v12：抓取摔投
    quell: { dur: 2.2, warn: 0.9, r: 22, n: 2, breakDmg: 12, dmg: 2 }, // v12：蓄力全屏
    // v13 §二/§四：反伤架势（连打会被反弹；大招可破招并开 2.4s 破防窗口）
    parry: { dur: 1.8, reflect: 1, breakT: 2.4 },
    /* v16 §三：圣像审判（boss5 招牌）。两座圣像立在玩家左右 72px，fuse 4s 后炸 110 半径、2 心。
       可被普攻打掉（hp 3）——「只盯 Boss 不拆场」才是这招罚的东西；打掉的那座安静消失。
       fuse 给足 4s：拆两座约 1.2s，玩家永远有得选，不会变成必吃的定时炸弹。 */
    totem: { n: 2, hp: 3, fuse: 4.0, w: 16, h: 32, r: 110, dmg: 2, off: [-72, 72] },
    stagger: 1.4, enrage: 1.2, dying: 2.6, revive: 0.9,
    recover: { blink: 0.4, barrage: 0.5, halo: 0.6, summon: 0.5, nova: 0.6,
               scythe: 0.6, leap: 0.7, charge: 0.4, dive: 0.65,
               meteor: 0.6, spike: 0.5, homing: 0.5, clone: 0.6, pull: 0.5,
               grab: 0.55, quake: 0.5, pillar: 0.5, quell: 0.6, core: 0.6, parry: 0.6, totem: 0.6 }, // v12 补键 + v13 parry + v16 totem
    // 圣裁者招牌：halo 圣辉轮 / parry 反伤架势 / homing 追踪弹 / totem 圣像审判
    poolNear: ['halo', 'parry', 'homing', 'totem', 'barrage'],
    poolFar: ['barrage', 'halo', 'homing', 'totem'],
    p2Add: ['nova'],
    contactDmg: 1, drop1: 'yao1', drop2: 'yao2' },
  /* ==================== v12：L19 烈焰·牛魔王（kind 6，lava） ====================
     蛮力型：把「每招要求不同动作」集中展示——撞墙反弹（往中间绕）/ 抓取（别站正前 46px）/
     火柱（离圈且绕开已升起柱）/ 召唤回血（先清小怪）/ 震地波（跳）。参数逐字=spec §二。 */
  boss6: { hp: 630, p2At: 0, actDist: 176, grav: 1500, fallV: 520, w: 56, h: 48, // =210×3（每段 210）
    windup: { leap: 0.55, barrage: 0.45, charge: 0.60, summon: 0.50, nova: 0.55, dive: 0.60,
              grab: 0.75, quake: 0.60, pillar: 0.60, quell: 0.90, core: 0.70,
              bomb: 0.55 },
    p2WindMul: 0.85, idleT: [0.52, 0.36], walk: [22, 28],
    leap: { T: 0.95, vy: 690, clamp: 310 },   // v16：dive 已不在池，键保留（与 leap 共用抛物线，将来可复用）
    dive: { ringV: 100 },
    /* v16：barrage 进 boss6 池（spec §二：弹幕是六只共用的普攻层），但本表此前只写了别的招，
       没有 barrage 读数——barrageFire 直接读 T.barrage.pairGap，缺键会当场抛错。
       数值取「重甲慢弹」口径：比 boss1 慢一档、散射更宽，符合牛魔王压场而非扫射的手感。 */
    barrage: { v: 125, rounds: 3, pairGap: 0.18, endT: 0.5, deg: [-14, 0, 14] },
    nova: { v: 108, t: [0.55, 0.95], endT: 1.2 },
    charge: { v: [250, 310], maxT: 1.4, maxX: 340, hits: 3 },        // 三段连撞
    grab: { reach: 46, dmg: 2 },                                     // 抓取摔投（2 伤，长前摇）
    quake: { w: 14, h: 26, v: 200, life: 0.9, n: 2, gap: 0.35 },     // 劈地窄高波
    pillar: { n: 3, warn: 0.9, w: 14, h: 40, life: 2.5, gap: 0.25, dmg: 1 }, // 火柱
    // v12.1 削弱：leech 是「maxHp 的百分比」，而玩家 DPS 是固定值（atkBase 2 / cd 0.35 ≈ 5.7 hp/s），
    // 牛魔王血最厚（630），原 0.5%/s/只 ×2 = 6.3 hp/s —— 等于玩家全部输出，血条根本推不动。
    // 实测原值：一次召唤 6 秒回满 37.8 hp（段血 18%），要 19 刀才追回来。
    // 改 0.18%/s/只（2 只 2.27 hp/s，约玩家 1/3 输出）+ 单次上限 2.4%（15.1 hp ≈ 7 刀）。
    summon: { type: 'lancer', n: 2, off: [-44, 44], leech: 0.18, leechCap: 2.4, cd: 18, hp: 4 },
  // v13.1 玩家反馈「召唤不能一直召唤，打小怪累死」：
  //   · cd = 召唤冷却（秒）：冷却期内 summon 不进选招池，清完小怪也要等够时间才会再召；
  //   · hp = 召唤体血量覆盖（基础血 9 太肉：2 只 18 血 = 9 刀，清场成本高于收益）。

    // v13 §二：弹跳炸弹（弹两下落点会变；记住了才躲得掉）
    bomb: { n: 3, gap: 0.32, vy: -300, vx: 110, grav: 900, bounce: 2, damp: 0.55, fuse: 0.9, r: 30, dmg: 1 },
    stagger: 1.5, enrage: 1.2, dying: 2.4, revive: 0.9,
    recover: { leap: 0.7, barrage: 0.5, charge: 0.4, summon: 0.5, nova: 0.6, dive: 0.65,
               grab: 0.55, quake: 0.5, pillar: 0.5, quell: 0.6, core: 0.6, bomb: 0.6 },
    // 牛魔王招牌：charge 三连撞 / bomb 火油弹 / pillar 火柱 / grab 抓取摔投
    poolNear: ['charge', 'bomb', 'pillar', 'grab', 'barrage'],
    poolFar: ['barrage', 'charge', 'bomb', 'pillar'],
    p2Add: ['nova'],
    contactDmg: 1, drop1: 'niu1', drop2: 'niu2' },

  /* ==================== v20：地图二·回响之厅（kind 7~11）====================
     与 map1 六只的分水岭是「威胁从哪来」，不是数值或弹种：
       map1：威胁从 Boss 飞向玩家 —— 弹 / 墙 / 雾 / 小怪。玩家动作恒为「躲」和「打」。
       map2：威胁由玩家的行为生成 —— 打多快 / 打谁 / 什么时候打 / 用什么打 / 什么时候能打。
     因此下面五只的招牌招（flare / weight / spawn / inhale / score）**都不产生新弹种**，
     而是读取玩家侧状态再惩罚。新增的普通招（sear/lash/swap/beam/web/swarm/bite/
     pendulum/chime/hammer）才有实体，且逐个避开 map1 已用的 26 种交互：
     没有第二份陨石雨、没有第二个地刺、没有第二种火柱、没有第二个推进墙。
     每只 Boss 只配 3 招招牌 + barrage 普攻 + P2 nova（沿用 §二 的池口径）。 */

  boss7: { // 余烬回响（L20，ember）——「打太快会烧到自己」
    // 机制：玩家的伤害被它记成「热量」（playerHeat 0..100，engine 每帧在 _engUpdateBoss 里维护）。
    //   flare 抬手时若热量 ≥ minHeat 就当场引爆，伤害随热量线性上升；引爆后热量清零。
    //   这是全作第一次要求玩家「停手」——map1 的六只都是「越快越好」。
    hp: 540, p2At: 0, actDist: 176, grav: 1500, fallV: 520, w: 44, h: 40,   // v20.3：540=180×3 对标牛魔王（满装 TTK 61→~91s）
    windup: { flare: 0.72, sear: 0.55, lash: 0.46, barrage: 0.42, nova: 0.55,
              meteor: 0.70, spike: 0.55, homing: 0.60, clone: 0.55, pull: 0.50,
              grab: 0.75, quake: 0.60, pillar: 0.60, quell: 0.90, core: 0.70 },
    p2WindMul: 0.85, idleT: [0.46, 0.34], stalk: true, walk: [46, 58],   // 火活物步伐快，贴身也游走
    barrage: { v: 118, rounds: 3, pairGap: 0.16, endT: 0.45, deg: [-10, 10] },
    /* flare 引燃：范围 34px 的圆形爆炸（比 nova 环小得多，是"点名"不是"清场"）。
       minHeat=30 是门槛——低于 30 它抬了手也炸不起来，这是玩家能主动运营的空间
       （想安全输出就压在 30 以下）。gainMul 是「伤害→热量」的换算：1 点伤害 = 0.9 热量。 */
    flare: { r: 34, dmg: 2, minHeat: 30 },
    /* heat 热量表（玩家侧 game.heat 0..cap 的维护参数，见 _engM2Heat）：
       perDmg 每点伤害换多少热量——玩家满装约 5.7 hp/s，扣掉 cool 后净增 ≈11/s，打满要 9s；
       cool 是"边打边散"的基础散热（12/s）；idleCool 是停手 idleAfter 秒后的加速散热（40/s，
       即停 2.5s 清空）。两者同时给，才让「打三秒停一拍」比「一直输出」更省心——
       只有 base 的话热量降得比涨得还慢，玩家会觉得"停了也没用"。 */
    heat: { perDmg: 4, cool: 12, idleCool: 40, idleAfter: 0.6, cap: 100, burstDmg: 2 },
    /* sear 灼视线：横贯 220px 的细激光（w=10），warn 0.55s 预警 + 0.42s 存续。
       map1 没有任何一条「直线激光」——barrage 是点弹、breath 是推进波、halo 是环。
       激光的躲法是「离开那条线」，与躲点弹的「走出落点」是两种肌肉记忆。 */
    sear: { len: 220, w: 10, warn: 0.55, dur: 0.42, dmg: 1 },
    /* lash 火鞭：贴地短波（h=14，跳即躲），速度 235 快于玩家跑速 120——
       看到再跑来不及，必须提前跳。这是本战唯一的"反应"招，其余都考耐心。 */
    lash: { w: 26, h: 14, v: 235, life: 0.85, dmg: 1 },
    nova: { v: 118, t: [0.55, 0.95], endT: 1.2, n: 10 },   // P2 环：10 向快弹
    stagger: 1.5, enrage: 1.2, dying: 2.4, revive: 0.9,
    recover: { flare: 0.6, sear: 0.5, lash: 0.45, barrage: 0.45, nova: 0.6 },
    // 招牌：flare 引燃 / sear 灼视线 / lash 火鞭
    poolNear: ['flare', 'lash'],
    poolFar: ['sear', 'flare'],   // v20.3：撤公共弹幕——轮到的每一下都是自己的招牌
    p2Add: ['nova'], contactDmg: 1, drop1: 'ember1', drop2: 'ember2' },

  boss8: { // 双生天秤（L21，aether）——「一直打同一侧是打不动的」
    // 机制：skew 记录玩家连续从同一侧命中的次数（-3..3）。同侧连击会把血"偷"回去
    //   （|skew| 达 3 触发回血），左右交替则承伤 ×1.25（"对秤"奖励）。
    //   判定唯一依据是「玩家相对 Boss 中心的方位」——所以玩家的动作是「穿到另一边打」。
    hp: 540, p2At: 0, actDist: 176, grav: 1500, fallV: 520, w: 48, h: 44,   // v20.3：540=180×3 对标牛魔王（偷血按新血量重定 0.5%）
    windup: { weight: 0.62, swap: 0.58, beam: 0.70, barrage: 0.45, nova: 0.55,
              meteor: 0.70, spike: 0.55, homing: 0.60, clone: 0.55, pull: 0.50,
              grab: 0.75, quake: 0.60, pillar: 0.60, quell: 0.90, core: 0.70 },
    p2WindMul: 0.85, idleT: [0.50, 0.36], stalk: true, walk: [40, 50],
    barrage: { v: 120, rounds: 3, pairGap: 0.16, endT: 0.45, deg: [-12, 12] },
    skew: { max: 3, stallMul: 0.2, healPct: 0.5, goodMul: 1.25 },   // 失衡（同侧第3击）：承伤×0.2+偷回0.5%总血（450血基准≈2.3/次，威慑不拖时）；真穿身击承伤 ×1.25；P2 减伤加深 0.2→0.1
    /* weight 砝码：三枚从上方砸落，落点各自带 0.7s 影子预警。
       ✗ 不是 meteor 的复用：meteor 是"跟着玩家跑的三连"，这招落点是**固定扇形**，
       逼玩家离开 Boss 正前方——和"绕到另一侧打"的机制是同一件事的两面。 */
    weight: { n: 3, gap: 0.30, warn: 0.70, vy: 300, r: 12, dmg: 1, spread: [26, 0, -26] },
    /* swap 换位：与玩家交换 x（唯一一只敢这么做的 Boss）。玩家会突然站到它原来的位置，
       而它出现在玩家刚站的地方——"穿到另一边"的动作被它反将一军。 */
    swap: { warn: 0.58, after: 0.30 },
    /* beam 横梁：天平横梁横扫，水平细长激光（高 12px，跳过去）。
       与 boss7 的 sear 都是直线，但 sear 是垂直眼线（要左右闪），beam 是水平横梁（要跳）——动作不重合。 */
    beam: { warn: 0.70, dur: 0.50, h: 12, dmg: 1 },
    nova: { v: 108, t: [0.55, 0.95], endT: 1.2 },
    stagger: 1.5, enrage: 1.2, dying: 2.4, revive: 0.9,
    recover: { weight: 0.55, swap: 0.5, beam: 0.6, barrage: 0.45, nova: 0.6 },
    // 招牌：weight 砝码 / swap 换位 / beam 横梁
    poolNear: ['weight', 'swap'],
    poolFar: ['weight', 'beam', 'swap'],   // v20.3：撤公共弹幕；swap 把远程玩家直接拽回贴身圈
    p2Add: ['nova'], contactDmg: 1, drop1: 'scale1', drop2: 'scale2' },

  boss9: { // 孵化之间（L22，husk）——「打早了是亏的」
    // 机制：虫卵（game.eggs）每 3s 进化一级（0 卵 → 1 幼虫 → 2 成虫）。
    //   打卵只爆幼虫；打成虫掉能量核（回蓝）。卵到期未清 → 成虫爬回 Boss 处喂它回血。
    //   玩家的动作从「怎么打」变成「什么时候打」——这是 map1 完全没有的一层。
    hp: 720, p2At: 0, actDist: 200, grav: 1500, fallV: 520, w: 56, h: 48,   // v20.3：720=240×3 对标牛魔王（满装 TTK 38→~81s）
    windup: { spawn: 0.65, web: 0.60, swarm: 0.62, barrage: 0.48, nova: 0.55,
              meteor: 0.70, spike: 0.55, homing: 0.60, clone: 0.55, pull: 0.50,
              grab: 0.75, quake: 0.60, pillar: 0.60, quell: 0.90, core: 0.70 },
    p2WindMul: 0.85, idleT: [0.55, 0.40], stalk: true, walk: [30, 38],   // 本体笨重（蛹）走得慢，但不再罚站
    barrage: { v: 110, rounds: 3, pairGap: 0.20, endT: 0.5, deg: [-14, 0, 14] },
    /* spawn 产卵：在玩家左右各产 1 枚 + Boss 脚下 1 枚（共 3）。
       卵的进化链与收益见 engine 的 _engUpdateEggs（3s 一级，两跳成虫）。
       cap=6：场上最多 6 枚，满了不再产——否则玩家一个走位失误就被卵海淹掉。 */
    spawn: { n: 3, cap: 6, cd: 7.0, stageT: 3.0, hp: 2, larvaHp: 3, adultHp: 5, feed: 3.0 },   // feed=成虫爬回 Boss 喂的血（v20.3 接线；P2 ×1.5）——不清杂它就一直回
    /* web 蛛网：地面铺一片减速区（-60%），并且**禁跳**——地图一的减速雾（mist）不挡跳，
       这招挡跳，所以"被网住 + 火鞭/落锤"才是组合技，而不是单纯走得慢。 */
    web: { w: 64, h: 12, life: 5.0, slow: 0.4, noJump: true },
    /* swarm 虫群：一排小虫自 Boss 侧向玩家横穿（低矮、可跳），逼玩家跳起——
       跳起时正好看不见脚下的网/网外的卵。 */
    swarm: { n: 5, gap: 0.12, v: 130, w: 10, h: 8, dmg: 1, life: 3.0 },
    nova: { v: 100, t: [0.55, 0.95], endT: 1.2, n: 6 },   // P2 环：6 向疏缝，虫群补密度
    stagger: 1.5, enrage: 1.2, dying: 2.6, revive: 0.9,
    recover: { spawn: 0.6, web: 0.55, swarm: 0.55, barrage: 0.5, nova: 0.6 },
    // 招牌：spawn 产卵 / web 蛛网 / swarm 虫群
    poolNear: ['spawn', 'web', 'swarm'],
    poolFar: ['spawn', 'swarm'],   // v20.3：撤公共弹幕；卵产在玩家两侧，远程也压得住
    p2Add: ['nova'], contactDmg: 1, drop1: 'husk1', drop2: 'husk2' },

  boss10: { // 无声之喉（L23，maw）——「喂它东西等于给它回血」
    // 机制：inhale 张嘴吸气，飞行物（玩家弹体/法师法术）被吸进嘴（b.mouth 数组）并转成它的血。
    //   打嘴（x 在嘴框内且嘴张开）会把积食打爆，一次结算 3 伤 × 积食数——
    //   喂得越多、爆得越疼，但喂太多它会 roar 反刍成弹幕。玩家的动作是「挑窗口输出」。
    hp: 660, p2At: 0, actDist: 200, grav: 1500, fallV: 520, w: 56, h: 44,   // v20.3：660=220×3 对标牛魔王（满装 TTK 43→~83s）
    windup: { inhale: 0.60, roar: 0.75, bite: 0.50, barrage: 0.55, nova: 0.55,
              meteor: 0.70, spike: 0.55, homing: 0.60, clone: 0.55, pull: 0.50,
              grab: 0.75, quake: 0.60, pillar: 0.60, quell: 0.90, core: 0.70 },
    p2WindMul: 0.85, idleT: [0.58, 0.42], stalk: true, walk: [34, 44],   // 扎根型也缓步挪——一动不动就是活靶
    barrage: { v: 108, rounds: 3, pairGap: 0.22, endT: 0.55, deg: [-16, 0, 16] },
    /* inhale 吸气：dur=1.6s 持续，吞弹半径 120。吞 1 发回 0.6% 总血（cap 6%）。
       ✗ 不要做成"全屏吞"——那会让法师完全无法输出，是要玩家换位置而不是换角色。 */
    inhale: { dur: 1.6, r: 120, pull: 60, healPct: 0.6, capPct: 6, mouthW: 26, mouthH: 18 },
    /* roar 反刍：把嘴里的积食全吐回去（每颗 1 发弹，速度 140、朝玩家）。
       吐完嘴空——喂得越狠，这一下越像弹幕地狱。这是"喂弹"的代价。 */
    roar: { v: 140, dmg: 1, spread: 22 },
    /* bite 咬：近身 34px，2 伤，前摇 0.5s。它唯一的高伤害招，逼玩家别贴脸。 */
    bite: { r: 34, dmg: 2 },
    nova: { v: 95, t: [0.55, 0.95], endT: 1.2, n: 12 },   // P2 环：12 向慢弹密墙
    stagger: 1.5, enrage: 1.2, dying: 2.6, revive: 0.9,
    recover: { inhale: 0.6, roar: 0.6, bite: 0.5, barrage: 0.5, nova: 0.6 },
    // 招牌：inhale 吞弹 / roar 反刍 / bite 咬
    poolNear: ['inhale', 'bite', 'roar'],
    poolFar: ['roar', 'inhale'],   // v20.3：撤公共弹幕；inhale 把远程玩家拽进 bite 圈
    p2Add: ['nova'], contactDmg: 1, drop1: 'maw1', drop2: 'maw2' },

  boss11: { // 终末之钟（L24，bell）——「只有休止符吃伤害」
    // 机制：曲谱循环（score），三拍（钟摆→声波→钟锤）+ 休止符 3s，一轮约 7~8s（含出招收招）。
    //   非休止符期间**完全免伤**（_engBossHurt 开头 return false，不是减伤）；休止符期间 ×4.0。
    //   曲谱固定不变——第一轮瞎躲，第二轮就能背。这是全作唯一一只「可以背下来」的 Boss。
    // v20.2：血量对标牛魔王（630=210×3 每段同规格）——地图二终关不能比地图一终关脆；
    //   时长用窗口补偿而不是砍血：休止 2s→3s（够走过去打），×2.2→×4.0（每刀分量补回来）。
    //   机器人实测：满装 TTK ~90s（牛魔王 79.5s 同档），无装 ~180s（< 350s 判定线）。
    hp: 630, p2At: 0, actDist: 176, grav: 1500, fallV: 520, w: 48, h: 52,
    windup: { pendulum: 0.50, chime: 0.55, hammer: 0.65, barrage: 0.45, nova: 0.55,
              meteor: 0.70, spike: 0.55, homing: 0.60, clone: 0.55, pull: 0.50,
              grab: 0.75, quake: 0.60, pillar: 0.60, quell: 0.90, core: 0.70 },
    p2WindMul: 0.85, idleT: [0.44, 0.32], stalk: true, walk: [36, 46],   // 钟也挪步：摆锚跟着脚下走，背谱还得跟着它走位
    barrage: { v: 122, rounds: 4, pairGap: 0.15, endT: 0.5, deg: [-14, 0, 14] },
    /* score 曲谱：beats 是每拍的招式名（null=休止符）。
       四拍一轮：pendulum → chime → hammer → 休止（null）。休止 3s 是输出窗口。
       承伤：非休止**完全免伤**（写在 _engBossHurt 开头，不是减伤）、休止 ×4.0。
       beat 字段目前未参与推进（留作 schema 占位）；休止时长只由 restBeat 控制（_engUpdateBoss 的 rest 分支）。 */
    score: { beat: 1.0, restBeat: 3.0,
             beats: ['pendulum', 'chime', 'hammer', null],
             idleMul: 0.12, restMul: 4.0 },
    /* pendulum 钟摆：以自身为轴横扫 140° 的弧（h=16，贴地→跳）。
       弧心固定在它脚下，所以躲法是「跑到弧外面」而不是「跳」——与 lash 相反。 */
    pendulum: { r: 78, h: 16, dmg: 1, sweep: 2.2 },
    /* chime 声波：两圈同向环弹（v=96，慢），圈间 0.4s。慢弹才能"穿缝"，快环是必吃。 */
    chime: { v: 96, t: [0.30, 0.70], endT: 1.05, n: 6 },
    /* hammer 钟锤：从上方砸落，落点=玩家当前位置（warn 0.75s），落地溅两片横向冲击波。
       与 meteor 的区别：meteor 是三连小陨石，这是一记大锤 + 落地横向扩散——躲法不同（要离地）。 */
    hammer: { warn: 0.75, vy: 420, r: 20, dmg: 2, splash: 90 },
    nova: { v: 105, t: [0.55, 0.95], endT: 1.2 },
    stagger: 1.5, enrage: 1.2, dying: 2.8, revive: 0.9,
    recover: { pendulum: 0.5, chime: 0.55, hammer: 0.6, barrage: 0.45, nova: 0.6 },
    // 招牌：pendulum 钟摆 / chime 声波 / hammer 钟锤（+ 曲谱决定何时能打）
    poolNear: ['pendulum', 'chime', 'hammer'],
    poolFar: ['chime', 'hammer'],   // 曲谱独占出招，池是占位（_engBossPick 对 kind11 直接走 _engBossScore）,
    p2Add: ['nova'], contactDmg: 1, drop1: 'bell1', drop2: 'bell2' },

  elite: { scale: 1.75, spdMul: 0.8, kbMul: 0.25, lancer: { hp: 42 }, ghost: { hp: 36 }, // v7 §8：精英怪
    // v8.0：三种新敌的精英血量（工厂 _engMkEnemy 会读 BAL.elite[type].hp，缺键会在 elite=true 时 TypeError）。
    // 口径沿用既有两条：≈4 倍基础血（lancer 3→14、ghost 3→12）。
    // v10：随基础血 ×3 同步 ×3（42/36/24/36/24），「精英 ≈ 4 倍基础血」的口径不变。
    beetle: { hp: 24 }, spitter: { hp: 36 }, hopper: { hp: 24 } },
  flow:  { acc: 600, cap: 170 },  // v7 §8：水流 §4.1（cap 170>maxRun 120<逆流冲刺，数值推导见设计书）
  econ:  { coin: 1, gem: 5, puzzle: 5, brick: 1, heartChance: 0.30, heartHeal: 1, dropGrav: 1200, dropFall: 360, chestGem: 5 }, // v7 §8：chestGem
  gear:  {                                           // §Q（波2 生效）
    boss1: [44,30,16,8,2], boss2: [20,35,25,15,5], elite: [55,30,12,3,0],
    eliteChance: 0.14, bossExtra: 0.30,
    stat: { w: [1,2,2,2,3], h: [1,1,2,2,2], cSpd: [4,6,8,10,12], cCd: [4,6,8,10,12] },
    shardsPerStep: 3, shardsPerSalvage: 2, bagSize: 12,
    // v7 §8 追加六表（权重和=100，序=白/绿/蓝/紫/金）
    jiao1: [30, 28, 20, 14, 8],  jiao2: [16, 28, 26, 18, 12],
    gui1:  [22, 26, 24, 18, 10], gui2: [12, 24, 28, 22, 14],
    // v7.9 终章双 Boss 掉落（权重和=100，序=白/绿/蓝/紫/金）：最终战必须给得起东西——
    // 紫+金占比 40%/46%，两棒各必掉 1 件 + 30% 追加 1 件，打完一趟基本能填满一个空槽。
    ming1: [10, 22, 28, 26, 14], ming2: [4, 18, 32, 28, 18],
    yao1:  [6, 18, 30, 28, 18],  yao2:  [2, 12, 30, 32, 24],
    // v12 L19 牛魔王掉落（权重和=100，序=白/绿/蓝/紫/金）：Boss6 表 drop1/drop2 指向本两键，
    // 缺键会让 _engBossHurt 的 _engRollTier(undefined) 抛错（drop1 是必掉分支）。
    niu1:  [18, 28, 26, 20, 8],  niu2:  [8, 20, 30, 26, 16],
    // v20 地图二五只（权重和=100，序=白/绿/蓝/紫/金）。地图二是纯 Boss 图，没有小怪供给，
    // 装备全靠这 5 场——所以整体比 map1 高半档（紫+金占比 44%~60%），
    // 否则玩家打完 5 场可能还凑不齐一次升阶的 3 碎片。
    ember1: [14, 26, 28, 22, 10], ember2: [6, 18, 30, 28, 18],
    scale1: [12, 24, 28, 24, 12], scale2: [5, 16, 30, 29, 20],
    husk1:  [10, 22, 28, 26, 14], husk2:  [4, 14, 30, 30, 22],
    maw1:   [8, 20, 28, 28, 16],  maw2:   [3, 12, 28, 32, 25],
    bell1:  [4, 14, 28, 30, 24],  bell2:  [2, 8, 26, 34, 30],
    hidden: [15, 25, 25, 22, 13], eliteK: [25, 30, 25, 20, 0],
    // v7.8：普通怪掉落（补齐装备供给）。此前装备只有 Boss 必掉 + 10% 精英掉，而前 6 关没有 Boss，
    // 玩家打完 L1~L6 背包仍是空的——升阶要 3 碎片，碎片只能靠分解装备，整条养成链压根跑不起来。
    // 补最小供给：小怪 7% 掉 1 件（白/绿为主、紫 1%、无金），按一关约 10 只小怪算 ≈0.7 件/关。
    trash: [70, 24, 5, 1, 0], trashDrop: 0.07 },
  /* v19：第二角色「星语法师」数值（spec docs/specs/2026-10-29-v19-mage.md §1.2，唯一真值）。
     设计意图（调参前必读）：
       · 普攻 DPS≈2/0.46≈4.3，低于骑士 5.7——v20.4 用户实测「法师太强」三连削后的定位：
         攻速 0.38→0.46、射程 255→210px（life 0.85→0.70）、自然回蓝 5→3、命中回蓝 8→5；
         换来的安全性由「少 1 心 + 法力门槛」支付——不是白送的远程优势。
       · 法力循环：满 100；每秒回 3；普攻命中 +5；击杀 +12。U+L 一轮 55 法力 ⇒ 约 18 秒自然回蓝，
         且命中回蓝不再近乎无限（v20.4 前连中 13 发≈5 秒回满 =「相当于没有限制」），
         鼓励持续命中（保持连击/回蓝）而不是站桩丢技能。
       · O 不耗蓝，是唯一的爆发出口：6×3=18 点 Boss 伤害（骑士大招 5 点 + 全屏清怪），
         但法师大招不清弹幕、不秒杀小怪，只提供伤害——所以总价值相当。
     knight 的数值一律留在既有键位（player/skills/atk），本表只服务 mage。 */
  heroes: {
    mage: {
      hpBase: 4,                 // 玻璃大炮：比勇者少 1 心
      manaMax: 100, manaRegen: 3, manaPerHit: 5, manaPerKill: 12,
      bolt: { cd: 0.46, dmg: 2, v: 300, life: 0.70, w: 8, h: 6, homeR: 110, homeDeg: 26, turn: 6 },
      u: { cd: 7,  mana: 25, n: 8, dmg: 3, v: 300, life: 0.36, freeze: 0.8, w: 7, h: 7 },   // v19.3 霜爆新星：八向冰锥 + 冻结
      i: { cd: 10, mana: 25, dur: 2.5, absorb: 2 },                    // 复用骑士护盾实现，只换参数
      o: { cd: 20, mana: 0,  t: [0.35, 0.90, 1.20], n: 6, dmg: 3, aoe: 30, fallV: 340, gap: 0.08 },
      l: { cd: 8,  mana: 30, dmg: 4, v: 150, stopT: 0.5, hold: 1.1, radius: 100, pull: 90, w: 14, h: 14 } // v19.3 引力奇点
    }
  },
  guard: { parts: 240, floats: 40, fx: 60, scars: 8 } // 容量守卫（R5，不得放宽）
};

/* ==================== v19 英雄注册表（契约导出；spec §1.1 逐字，顺序固定 knight → mage） ====================
   仅此一个新增顶层符号（CONTRACT v19 附记）。cd/mana 一律**引用 BAL 求值**，不得另抄一份数字——
   否则调平衡时两处数值会分叉。ui 选角面板/HUD 直接读本表（技能名/描述/键位/冷却/法力）。 */
const HEROES = {
  knight: { id:'knight', name:'星旅勇者', short:'勇者', hpBase: BAL.player.hpBase, usesMana:false,
            skills:{ u:{name:'星陨术',  desc:'召唤三颗流星轰击锁定的敌人', cd:BAL.skills.u.cd, mana:0},
                     i:{name:'星光护盾',desc:'3 秒内吸收 2 次伤害',        cd:BAL.skills.i.cd, mana:0},
                     o:{name:'流星连斩',desc:'时停十字斩：屏内敌人全灭并清弹幕', cd:BAL.skills.o.cd, mana:0, ult:true},
                     l:{name:'星刃回旋',desc:'掷出回旋星刃，去回两程割草',   cd:BAL.skills.l.cd, mana:0} } },
  mage:   { id:'mage', name:'星语法师', short:'法师', hpBase: BAL.heroes.mage.hpBase, usesMana:true,
            skills:{ u:{name:'霜爆新星', desc:'身周炸开八道冰锥，命中冻结 0.8 秒', cd:BAL.heroes.mage.u.cd, mana:BAL.heroes.mage.u.mana},
                     i:{name:'星辉屏障', desc:'2.5 秒内吸收 2 次伤害',       cd:BAL.heroes.mage.i.cd, mana:BAL.heroes.mage.i.mana},
                     o:{name:'陨星风暴', desc:'锁定全屏落星：六颗陨星轰击敌阵', cd:BAL.heroes.mage.o.cd, mana:0, ult:true},
                     l:{name:'引力奇点', desc:'丢出奇点吸附敌人，1.1 秒后引爆', cd:BAL.heroes.mage.l.cd, mana:BAL.heroes.mage.l.mana} } }
};

/* ==================== v2 P1 动作常量（内部；不入 PHY——契约键名不得变） ====================
   v6 §B：数值收编进 BAL.atk/dash/combo（此处仅保留内部符号名，供既有调用点零改动引用）。 */
const _engAtkCd = BAL.atk.cd;   // 内部：攻击冷却（s）
const _engAtkDur = BAL.atk.dur;  // 内部：攻击判定框存在时长（s）
const _engAtkW = BAL.atk.boxW, _engAtkH = BAL.atk.boxH; // 内部：攻击判定框尺寸（身前 18×14）
const _engDashCd = BAL.dash.cd;   // 内部：冲刺冷却（s）
const _engDashDur = BAL.dash.dur; // 内部：冲刺总时长（s）——v5 三段：蓄力 0.05/爆发 0.18/滑行 0.05（原 0.18）
const _engDashV = BAL.dash.v;    // 内部：冲刺水平速度
const _engDashGrav = BAL.dash.gravMul; // 内部：冲刺爆发段重力倍率（减半；v5 起仅 0.05~0.23s 生效）
const _engHitStop = BAL.atk.hitStop; // 内部：攻击命中敌人的全局冻结时长（s）——v5：0.06→0.10（设计 §1.6）
const _engComboWin = BAL.combo.win;   // 内部：连击计数窗口（s）

/* ==================== v5 手感常量（内部，设计 §1/§4；工单 §A/§B/§F） ==================== */
const _engDjV = 0.92;                 // 内部：二段跳速度系数（vy=-jumpV*0.92=-284.3；v6 随 jumpV 等比）
const _engDjT = 0.4;                  // 内部：二段跳空翻演出时长（s，ui 渲染用）
const _engAirAcc = 1.0;               // 内部：空中同向加速度倍率（v7.7：0.75→1.0——与地面同档，去掉「空中变笨」的 25% 惩罚）
const _engAirTurn = 1.5;              // 内部：空中转向加速度倍率（1.5×acc=2100，惯性减半感）
const _engAirDrag = 240;              // 内部：空中无输入阻尼（保留漂移惯性，不再全额摩擦）
const _engKbV = 220, _engKbFric = 600; // 内部：击退速度/摩擦（220²/(2*600)≈40px，设计 §2#2）
const _engWindUp = 1900, _engWindCap = 170; // 内部：上升气流加速度/上升终速（净 -400px/s²，设计 §4.1）
const _engAtkAnim = 0.25;             // 内部：攻击总动画时长（起手 0.05+判定 0.12+余韵 0.08，设计 §2#8）
const _engAtkWind = 0.05;             // 内部：攻击起手时长（期间无判定）

/* ==================== v7.7 手感常量（内部；对照空洞骑士「动作衔接」逐项） ====================
   攻击输入缓冲：冷却中按下不再直接吞键（原来 0.35s 冷却里狂按只剩「没反应」），
   冷却一结束立刻起手——空洞骑士的「按下=出手」在引擎侧的等价物。
   （v7.7 曾在此为「局外成长削减冲刺冷却」留过一个每级步长常量，局外成长移除后一并删除。） */
const _engAtkBuf = 0.12;              // 内部：攻击输入缓冲窗口（s，约 7 帧；> 1 帧输入抖动，< 冷却 0.35）
// v10：BAL.enemy 基础血量已整体 ×3，Boss 关额外倍率取消（3→1），保持全游戏杂兵同一档强度。
// 常量本身保留：它是「Boss 关杂兵额外强化」的唯一挂点，未来要单独调 Boss 关杂兵时改这里即可。
const _engBossMinionHpMul = 1;        // v10：Boss 关杂兵 HP 倍率（含 Boss 召唤物；Boss 本体不吃）

/* ==================== v3 Boss/技能常量（内部） ====================
   v7 §6：Boss 激活半径改由 _engBossTable(kind).actDist 供表（三表同值 176，零行为变化），
   原 _engBossActDist 快照常量随参数化移除（全仓引用已清零）。 */

/* ==================== Level 关卡解析（契约导出） ==================== */
class Level {
  constructor(idx) {
    // v7 §1.3：聚合表优先——ALL_LEVELS 由 levels.js 契约块声明（聚合前===LEVELS，行为与 v6 全等）；
    // typeof 守卫覆盖「levels.js 契约块未合入」窗口期（_v6_feel/_v6_loot 沙箱无桩）：符号缺失时回退 LEVELS。
    const meta = ((typeof ALL_LEVELS !== 'undefined' && ALL_LEVELS) ? ALL_LEVELS[idx] : undefined) || LEVELS[idx];
    if (!meta) throw new Error('Level 不存在: ' + idx);
    this.idx = idx;
    this.meta = meta;
    // 主题对象：门禁桩环境下 THEMES[theme] 为空对象，字段访问处均有兜底
    this.theme = (typeof THEMES !== 'undefined' && THEMES && THEMES[meta.theme]) || {};

    // 网格构建：LG 来自 levels.js（加载顺序保证先于本文件）
    const lg = new LG(meta.w, meta.h);
    const ret = meta.build(lg);
    const grid = (ret && ret.g) ? ret : lg;
    this.tiles = grid.g;
    // w/h/tw/th 均为网格尺寸（瓦片数）；tileAt 的越界判定使用 w/h（契约明确 y≥h 返回'.'）。
    // 像素尺寸 = 值 × 16。
    this.w = meta.w; this.h = meta.h;
    this.tw = meta.w; this.th = meta.h;

    /* ---------- 实体提取：实体字符从网格换成'.'，瓦片字符保留 ---------- */
    this.coins = []; this.enemies = []; this.plats = []; this.saws = [];
    this.cannons = []; this.springs = []; this.levers = []; this.checkpoints = [];
    this.shrines = []; // v4：谜题神龛（'Q' 提取，见下）
    this.chests = []; this.lanterns = []; // v7 §4.3/§4.4：宝箱（'g'，opened 跨死亡保留）/ 灯笼（'R'，纯数据光源）
    this.portals = []; this.pends = []; // v5 §F：传送门（'e'）/ 吊灯摆锤（'H'，锚点实体）
    this.crumbles = new Map(); this.doors = new Map();
    this.spawn = { x: 32, y: 32 }; this.goal = null; this.bossSpawn = null; // v3：Boss 锚点
    let brickN = 0; // v2 P3：'B' 可碎木箱砖计数（每箱内含 1 金币，计入 totalCoin）
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const ch = this.tiles[y][x];
        const px = x * _engTile, py = y * _engTile;
        // 确定性动画相位（代替旧文件的 Math.random，保证门禁/重放一致）
        const phase = (x * 0.7 + y * 1.3) % 6.283;
        switch (ch) {
          case '@': this.spawn = { x: px + 3, y: py + 2 }; this.tiles[y][x] = '.'; break;
          case 'P': this.goal = { x: px, y: py - 16, w: 16, h: 32 }; this.tiles[y][x] = '.'; break;
          case 'o': this.coins.push({ x: px + 4, y: py + 4, w: 8, h: 8, got: false, t: phase }); this.tiles[y][x] = '.'; break;
          case '*': this.coins.push({ x: px + 4, y: py + 3, w: 8, h: 10, got: false, gem: true, t: phase }); this.tiles[y][x] = '.'; break;
          case 'K': this.coins.push({ x: px + 3, y: py + 5, w: 10, h: 6, got: false, key: true, t: 0 }); this.tiles[y][x] = '.'; break;
          case 'W': // 史莱姆：巡逻，可踩踏（v5 §C：hp 2；v6：hp/spd 收编 BAL.enemy.slime + ai 技能状态机）
            this.enemies.push({ type: 'slime', x: px + 2, y: py + 6, w: 12, h: 10, vx: -BAL.enemy.slime.spd, vy: 0, hx: px + 2, hy: py + 6, dead: 0, t: phase, grounded: false,
              hp: BAL.enemy.slime.hp, kb: 0, flashT: 0, jitT: 0, dvx: 0, dvy: 0, ai: _engMkAI('slime', px, py) });
            this.tiles[y][x] = '.'; break;
          case 'F': // 蝙蝠：水平巡逻 + 正弦浮动（v5 §C：hp 1；v6：+ ai 技能状态机）
            this.enemies.push({ type: 'bat', x: px + 2, y: py + 3, w: 12, h: 10, ax: px + 2, ay: py + 3, vx: BAL.enemy.bat.spd, dead: 0, t: phase, rng: BAL.enemy.bat.rng,
              hp: BAL.enemy.bat.hp, kb: 0, flashT: 0, jitT: 0, dvx: 0, dvy: 0, ai: _engMkAI('bat', px, py) });
            this.tiles[y][x] = '.'; break;
          case 'M': this.plats.push(this._mkPlat(px, py, 1)); this.tiles[y][x] = '.'; break;
          case 'V': this.plats.push(this._mkPlat(px, py, 0)); this.tiles[y][x] = '.'; break;
          case 'Z': // 横电锯（圆心在瓦片中心）
            this.saws.push({ x: px + 8, y: py + 8, r: 7.5, hz: 1, dir: 1, spd: 52, tx: x, ty: y, t: phase, minX: px, maxX: px });
            this.tiles[y][x] = '.'; break;
          case 'U': // 竖电锯
            this.saws.push({ x: px + 8, y: py + 8, r: 7.5, hz: 0, dir: 1, spd: 52, tx: x, ty: y, t: phase, minX: px, maxX: px });
            this.tiles[y][x] = '.'; break;
          case '<': this.cannons.push({ x: px, y: py, dir: -1, t: (x * 0.37) % 1.9, flash: 0 }); this.tiles[y][x] = '.'; break;
          case '>': this.cannons.push({ x: px, y: py, dir: 1, t: (x * 0.37) % 1.9, flash: 0 }); this.tiles[y][x] = '.'; break;
          case 'S': this.springs.push({ x: px + 2, y: py + 8, w: 12, h: 8, t: 0 }); this.tiles[y][x] = '.'; break;
          case 'L': this.levers.push({ x: px + 2, y: py + 2, w: 12, h: 14, cd: 0 }); this.tiles[y][x] = '.'; break;
          case 'c': this.checkpoints.push({ x: px, y: py - 8, w: 16, h: 24, on: false }); this.tiles[y][x] = '.'; break;
          case 'C': this.crumbles.set(x + ',' + y, { x: x, y: y, state: 0, t: 0, dy: 0, dvy: 0 }); break; // 0稳 1抖 2落 3无
          case 'D': this.doors.set(x + ',' + y, { x: x, y: y }); break;
          case 'B': brickN++; break; // v2 P3：木箱砖是实心瓦片（留在网格），仅攻击可碎（碎于 _engResolveAttack）
          case 'X': this.bossSpawn = { x: px + 8, y: py }; this.tiles[y][x] = '.'; break; // v3：Boss 锚点（不入 SOLIDISH/STAND，solid() 无需改）
          case 'Q': // v4：谜题神龛——16×24 石碑实体（不入 SOLIDISH/STAND，solid() 无需改）。
            // y=瓦片顶上移 8px：碑底对齐支撑瓦片顶面（与 'c' 检查点 16×24 同一锚定惯例；
            // 工单字段清单 {x,y,w:16,h:24,idx} 不钉死 y 值）。idx=1 起关卡号，配 PUZZLES。
            this.shrines.push({ x: px, y: py - 8, w: 16, h: 24, idx: this.idx + 1 });
            this.tiles[y][x] = '.'; break;
          case 'w': // v5 §F：上升气流——纯区域瓦片：保留在网格（与 '#'/'^' 同为瓦片语义），
            // 非实心不 stand（solid() 不认它），玩家矩形覆盖时受上升力（updateWorld ⑩″）。
            // 不提取、网格不换 '.'：敌人/炮弹/掉落物不受风（只有玩家块查 'w'）。
            break;
          case 'e': // v5 §F：传送门——12×24 实体，碑式锚定同 'c'（顶上移 8px）；配对在构造末尾
            this.portals.push({ x: px + 2, y: py - 8, w: 12, h: 24, cd: 0, partner: null });
            this.tiles[y][x] = '.'; break;
          case 'A': // v5 §F：骑士盔甲敌——12×18，hp3，正面格挡；重力/落地/掉头判定与史莱姆同构
            // v6：hp/spd 收编 BAL.enemy.knight + ai 技能状态机（盾击冲锋）+ guardDown 破绽字段
            this.enemies.push({ type: 'knight', x: px + 2, y: py - 2, w: 12, h: 18, hp: BAL.enemy.knight.hp,
              vx: -BAL.enemy.knight.spd, vy: 0, hx: px + 2, hy: py - 2, dead: 0, t: phase, grounded: false,
              kb: 0, flashT: 0, jitT: 0, dvx: 0, dvy: 0, face: -1, guardDown: false, ai: _engMkAI('knight', px, py) });
            this.tiles[y][x] = '.'; break;
          case 'Y': // v6 §3.4：幽焰法师——12×18 站桩施法者（锚定同 'A' 骑士：脚下 2 格内须支撑，levels 断言同 'A'）
            this.enemies.push({ type: 'mage', x: px + 2, y: py - 2, w: 12, h: 18, hp: BAL.enemy.mage.hp,
              vx: 0, vy: 0, hx: px + 2, hy: py - 2, dead: 0, t: phase, grounded: false,
              kb: 0, flashT: 0, jitT: 0, dvx: 0, dvy: 0, face: 1, ai: _engMkAI('mage', px, py) });
            this.tiles[y][x] = '.'; break;
          case 'N': // v7 §5.0：枪虾哨兵（地面巡逻+突刺，BAL.enemy.lancer；下方 2 格内须 STAND——levels 断言）
            this.enemies.push(_engMkEnemy('lancer', px, py, false)); this.tiles[y][x] = '.'; break;
          case 'J': { // v7 §5.2：水母（悬浮+脉冲电环；amp/frq 覆盖工厂缺省 → 复用蝙蝠正弦分支）
            const eJ = _engMkEnemy('jelly', px, py, false); eJ.vx = 0; eJ.amp = 10; eJ.frq = 1.6;
            this.enemies.push(eJ); this.tiles[y][x] = '.'; break; }
          case 'T': { // v7 §5.3：幽灵（穿墙漂移伏击；idle 沉睡轻浮=巡逻分支 amp/frq 缺省）
            const eT = _engMkEnemy('ghost', px, py, false); eT.vx = 0;
            this.enemies.push(eT); this.tiles[y][x] = '.'; break; }
          case 'E': { // v7 §5.4：魂火（爬行自爆；vx 由技能机管理）
            const eE = _engMkEnemy('boomer', px, py, false); eE.vx = 0;
            this.enemies.push(eE); this.tiles[y][x] = '.'; break; }
          case 'x': // v7 §5.5：精英·枪虾王（放大枪虾 elite:true，hp=BAL.elite.lancer，必掉装备）
            this.enemies.push(_engMkEnemy('lancer', px, py, true)); this.tiles[y][x] = '.'; break;
          // v8.0 任务4：三种新敌（统一走 _engMkEnemy 工厂；尺寸/锚点由 _ENG_ENEMY_DEF 决定，
          // 三者均为地面型 → 重力/落地/掉头复用 slime 那条既有分支，不另写一套物理）
          case 'i': this.enemies.push(_engMkEnemy('beetle', px, py, false)); this.tiles[y][x] = '.'; break;  // 铁甲虫
          case 'k': this.enemies.push(_engMkEnemy('spitter', px, py, false)); this.tiles[y][x] = '.'; break; // 酸液花
          case 'n': this.enemies.push(_engMkEnemy('hopper', px, py, false)); this.tiles[y][x] = '.'; break;  // 跳跳蛛
          case 'z': { // v7 §5.5：精英·幽灵王
            const eZ = _engMkEnemy('ghost', px, py, true); eZ.vx = 0;
            this.enemies.push(eZ); this.tiles[y][x] = '.'; break; }
          case 'g': // v7 §4.3：宝箱——16×14 实体（不入 SOLIDISH/STAND，solid() 无需改）；接触开启
            this.chests.push({ x: px, y: py + 2, w: 16, h: 14, opened: false, t: 0 });
            this.tiles[y][x] = '.'; break;
          case 'R': // v7 §4.4：灯笼——16×24 光源实体（非实心不参与碰撞；ui 黑暗层读它开光圈，引擎零行为）
            this.lanterns.push({ x: px, y: py - 8, w: 16, h: 24 });
            this.tiles[y][x] = '.'; break;
          case 'H': // v5 §F：吊灯摆锤——锚点=瓦片中心；updateWorld ⑨‴ 推进摆角并做圆 vs 玩家判定
            this.pends.push({ ax: px + 8, ay: py + 8, len: 48, t: 0, phase: (x * 0.9 + y * 1.1) % 6.283 });
            this.tiles[y][x] = '.'; break;
        }
      }
    }

    /* ---------- v10：Boss 关杂兵 HP 倍率（_engBossMinionHpMul 已由 3 改 1——基础血整体 ×3 后不再叠加；
       常量保留为「Boss 关额外强化」的唯一挂点。Boss 本体在 game.boss 独立维护，不受影响） ---------- */
    if (meta.boss) for (const e of this.enemies) e.hp *= _engBossMinionHpMul;

    /* ---------- 门分组：相邻（4 向）D 的连通分量 ---------- */
    this.doorGroups = [];
    const seen = new Set();
    for (const k of this.doors.keys()) {
      if (seen.has(k)) continue;
      const grp = [], q = [k];
      seen.add(k);
      while (q.length) {
        const cur = q.pop();
        grp.push(cur);
        const ci = cur.indexOf(',');
        const cx = +cur.slice(0, ci), cy = +cur.slice(ci + 1);
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (let i = 0; i < 4; i++) {
          const nk = (cx + nb[i][0]) + ',' + (cy + nb[i][1]);
          if (this.doors.has(nk) && !seen.has(nk)) { seen.add(nk); q.push(nk); }
        }
      }
      this.doorGroups.push(grp);
    }

    /* ---------- 电锯轨道扫描：左右/上下各扫 ≤7 格，遇实心停 ---------- */
    for (const s of this.saws) {
      let l = 0, r = 0;
      if (s.hz) {
        while (l < 7 && !this._railSolid(s.tx - 1 - l, s.ty)) l++;
        while (r < 7 && !this._railSolid(s.tx + 1 + r, s.ty)) r++;
        s.minX = (s.tx - l) * _engTile + 10;
        s.maxX = (s.tx + r) * _engTile + 6;
        if (s.minX > s.maxX) { s.minX = s.x; s.maxX = s.x; } // 两侧皆堵：原位自旋
      } else {
        while (l < 7 && !this._railSolid(s.tx, s.ty - 1 - l)) l++;
        while (r < 7 && !this._railSolid(s.tx, s.ty + 1 + r)) r++;
        s.minY = (s.ty - l) * _engTile + 10;
        s.maxY = (s.ty + r) * _engTile + 6;
        if (s.minY > s.maxY) { s.minY = s.y; s.maxY = s.y; }
      }
    }

    /* ---------- v7.6 缺陷6：移动平台轨道扫描（沿运动方向逐格探，遇实心截断行程） ----------
       背景：_mkPlat 的行程写死 ±56/±48，从不问地图——L3 plat#4 左行压进 7 格墙、plat#5 压进 2 格，
       平台整个穿墙而过（画面上是「铁板从砖里穿出来」）。这里沿用上面电锯轨道的扫描写法（同一套
       _railSolid 语义，含 v7.6 缺陷7 补齐的 'G' '(' ')'），只是平台宽 48/高 8，要按整块矩形判。
       行程按 16px 步进截断：平台宽高均为 16 的整数倍且瓦片对齐，所以逐格步进的端点判定已覆盖扫掠区域。
       截断后总行程 < 1 格 → 退化为静止平台 + console.warn（宁可不动的可见平台，也不要穿墙的假机关）。 */
    for (const pl of this.plats) {
      const spanClear = (nx, ny) => {
        const x0 = Math.floor(nx / _engTile), x1 = Math.floor((nx + pl.w - _engEps) / _engTile);
        const y0 = Math.floor(ny / _engTile), y1 = Math.floor((ny + pl.h - _engEps) / _engTile);
        for (let ty = y0; ty <= y1; ty++)
          for (let tx = x0; tx <= x1; tx++) if (this._railSolid(tx, ty)) return false;
        return true;
      };
      if (pl.hz) {
        // 步进档位 = 原行程 56 的 16px 整数分段 + 末段 8px（保持「无墙时行程与 v7.5 完全一致」）
        let l = 0, r = 0;
        for (const off of [16, 32, 48, 56]) { if (!spanClear(pl.x - off, pl.y)) break; l = off; }
        for (const off of [16, 32, 48, 56]) { if (!spanClear(pl.x + off, pl.y)) break; r = off; }
        if (l + r < _engTile) {
          console.warn('[engine] L' + (idx + 1) + ' 移动平台(' + pl.x + ',' + pl.y + ') 水平行程不足 1 格（左右各 ' + l + '/' + r + 'px），退化为静止');
          pl.minX = pl.x; pl.maxX = pl.x;
        } else { pl.minX = pl.x - l; pl.maxX = pl.x + r; }
      } else {
        let u = 0, d = 0;
        for (const off of [16, 32, 48]) { if (!spanClear(pl.x, pl.y - off)) break; u = off; }
        for (const off of [16, 32, 48]) { if (!spanClear(pl.x, pl.y + off)) break; d = off; }
        if (u + d < _engTile) {
          console.warn('[engine] L' + (idx + 1) + ' 移动平台(' + pl.x + ',' + pl.y + ') 垂直行程不足 1 格（上下各 ' + u + '/' + d + 'px），退化为静止');
          pl.minY = pl.y; pl.maxY = pl.y;
        } else { pl.minY = pl.y - u; pl.maxY = pl.y + d; }
      }
    }

    /* ---------- v5 §F：传送门配对——按 (x,y) 字典序排序后两两相邻（'e' 数量须为偶，
          validateLevels 断言；奇数个时最后一门 partner=null 永不触发，空转安全） ---------- */
    this.portals.sort(function (a, b) { return a.x - b.x || a.y - b.y; });
    for (let i = 0; i + 1 < this.portals.length; i += 2) {
      this.portals[i].partner = this.portals[i + 1];
      this.portals[i + 1].partner = this.portals[i];
    }

    /* ---------- 装饰物：seed=99+idx*17 的确定性随机，贴在实心砖顶面 ---------- */
    this.decor = [];
    const rnd = _engMulberry(99 + idx * 17);
    const dset = (this.theme && this.theme.decor && this.theme.decor.length)
      ? this.theme.decor : (_engDecorFallback[meta.theme] || ['bush']);
    // v17：交互装饰与关键实体隔离。尖刺压着出生点/弹簧/神龛=落地白给伤害（空转门禁也会红），
    // 水晶压着宝箱/神龛=误导收集。冲突时直接不摆——视觉密度几乎不变，确定性不受影响。
    // harm 在 Boss 关一律不摆：Boss 场地的躲避压力只应来自 Boss 招式，随机地火会把走位题变成抽签。
    const _dhReserved = [];
    const _dhPad = function (x, y, w, h, pad) {
      _dhReserved.push({ x: x - pad, y: y - pad, w: w + pad * 2, h: h + pad * 2 });
    };
    _dhPad(this.spawn.x, this.spawn.y, 12, 14, 44);
    if (this.goal) _dhPad(this.goal.x, this.goal.y, this.goal.w, this.goal.h, 44);
    for (const e of [this.springs, this.checkpoints, this.shrines, this.cannons,
      this.levers, this.portals, this.chests, this.lanterns]) {
      for (const s of e) _dhPad(s.x, s.y, s.w || 16, s.h || 16, 20);
    }
    for (let y = 1; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.tiles[y][x] === '#' && this.tiles[y - 1][x] === '.' && rnd() < 0.16) {
          const type = dset[(rnd() * dset.length) | 0];
          const hit = _ENG_DECOR_HIT[type];
          // 候选占位 = 该砖顶面上一格（装饰立在地表之上）
          if (hit && ((meta.boss && hit.cls === 'harm')
            || _dhReserved.some(r => _engAabb(r, { x: x * _engTile, y: (y - 1) * _engTile, w: _engTile, h: _engTile })))) continue;
          this.decor.push({
            x: x * _engTile + (rnd() * 8 | 0), y: y * _engTile,
            type: type, f: (rnd() * 2) | 0
          });
        }
      }
    }
    this.decorFx = this.decor.filter(function (d) { return !!_ENG_DECOR_HIT[d.type]; }); // v17：每帧交互扫描子集（数量远小于 decor 全集）

    this.totalCoin = this.coins.reduce((a, c) => a + (c.key ? 0 : (c.gem ? 5 : 1)), 0) + brickN; // 木箱内含金币一并计入
    // v11：终点封印的分母——实体提取结束后的敌人数快照（Boss 召唤体是运行时 push 进 L.enemies 的，
    // 构造期不在数组里，天然不计入；_engSealTick 里再按 e.summoned 兜一层，逻辑干净）。
    this.enemyTotal = this.enemies.length;
    this.par = meta.par;
  }

  _mkPlat(px, py, hz) { // 内部（类成员）：移动平台实体 48×8
    return {
      x: px, y: py, w: 48, h: 8, hz: hz, dir: 1, spd: 36,
      minX: px - 56, maxX: px + 56, minY: py - 48, maxY: py + 48,
      dx: 0, dy: 0
    };
  }

  _railSolid(tx, ty) { // 内部（类成员）：电锯/移动平台轨道的「实心」语义（构造期恒实的瓦片）
    // v7.6 缺陷7：补齐 'G'（隐藏砖 v7 §4.2）、'(' / ')'（传送带 v7.5）。此前本集合只认 7 个字符，
    // 而 solid() 认 10 个 → 电锯会穿过隐藏砖、平台会压进传送带。
    // **必须与 solid() 保持同步，否则电锯会穿过或卡在墙上**（两边任一侧漏字符都是隐形墙/假穿墙）。
    const ch = this.tileAt(tx, ty);
    return ch === '#' || ch === 'I' || ch === 'a' || ch === 'b' || ch === 'D' || ch === 'C' || ch === 'B'
        || ch === 'G' || ch === '(' || ch === ')';
  }

  tileAt(tx, ty) { // 越界规则：x 方向返回'#'（左右墙），y<0 与 y≥h 返回'.'
    if (tx < 0 || tx >= this.w) return '#';
    if (ty < 0 || ty >= this.h) return '.';
    return this.tiles[ty][tx];
  }

  solid(tx, ty, switchState) { // '#'/'I'/'B'/'G'/'('/')' 恒实；a/b 随全局开关；D 未开门时实；C 崩塌态<2 时实
    const ch = this.tileAt(tx, ty);
    if (ch === '#' || ch === 'I' || ch === 'B' || ch === 'G') return true; // 'B' 木箱：实心，碎后网格改'.'自然失效；'G' 隐藏砖（v7 §4.2）：恒实，仅攻击可碎且永久消失
    // v7.5：传送带 '(' / ')' 补进实心集合。此前 solid() 不认它们，而 levels.js 的 STAND 集合认——
    // 两处口径不一致，L4 把传送带铺在地面行（levels.js:190 `g.row(31,36,H-1,'(')`）于是成了
    // 8 格无底洞：画面上是地板、踩上去直接掉出地图。补齐后传送带既能站立，脚下一行扫描
    // （updateWorld 的 convL/convR）也才真正生效——「逆行传送带」这个机制此前从未工作过。
    if (ch === '(' || ch === ')') return true;
    if (ch === 'a') return switchState === 0;
    if (ch === 'b') return switchState === 1;
    if (ch === 'D') return this.doors.has(tx + ',' + ty);
    if (ch === 'C') { const c = this.crumbles.get(tx + ',' + ty); return !!c && c.state < 2; }
    return false;
  }
}

/* ==================== 游戏世界状态（契约导出） ==================== */
const game = {
  state: 'title', levelIdx: 0, level: null, player: null,
  cam: { x: 0, y: 0 }, shake: 0,
  time: 0, deaths: 0, coins: 0, keys: 0, switchState: 0,
  bullets: [], parts: [], sfxQueue: [],
  respawnAt: null, clearT: 0,
  // v2 P1：input 新增 attack/dash 边沿与持键（ui 写入，engine 只读并消费边沿）
  // v3：追加技能边沿 skillUHit/skillIHit/skillOHit（ui 写、engine 消费并清零，同 attackHit/dashHit）
  // v6：追加 down（按住↓速降，ui 桥接持键）与 skillLHit（技能4 边沿）
  input: { left: 0, right: 0, jump: 0, jumpHit: 0, attack: 0, attackHit: 0, dash: 0, dashHit: 0,
           skillUHit: 0, skillIHit: 0, skillOHit: 0, down: 0, skillLHit: 0 },
  paused: false, tick: 0,
  combo: 0, comboT: 0,   // v2 P1：连击计数 / 窗口剩余（断档清零）
  ultCharge: 0,          // v7.1：O 能量充能 0..100（命中/碎砖累积，满 100 可放；死亡不掉）
  hitStop: 0,            // v2 P1：攻击命中的全局冻结计时（>0 时世界暂停推进）
  // v3：Boss 战与技能系统（沿 v2 先例扩展字段，不新增顶层全局符号）
  boss: null,            // Boss 实体（loadLevel 按 L.bossSpawn 创建，L1-L6 恒 null）
  drops: [],             // 掉落回复心（击杀 30% 概率）
  meteors: [],           // 星陨术流星
  waves: [],             // Boss 落地冲击波
  // v10：Boss 场地危险物（meteor 陨石雨 / spike 地刺 / homing 追踪弹 / clone 分身 / pull 吸附力场）。
  // 与 bullets/waves 同级；loadLevel 初始化为 []，所有读侧 (game.hazards || []) 守卫。
  hazards: [],
  skills: { u: 0, i: 0, o: 0, l: 0 }, // 技能 CD 剩余秒（U/I/O + v6 L）
  flashT: 0,             // 流星连斩白屏剩余（s）
  // v4：谜题神龛（沿 v2/v3 先例扩展字段，不新增契约外顶层全局符号）
  puzzleActive: false,   // 谜题覆盖层打开中——updateWorld 顶部直接 return（同 paused 冻结语义，不改 paused）
  puzzleNear: -1,        // 玩家靠近的神龛 idx（1~6），不靠近=-1（每步刷新；ui 据此提示/消费开龛键）
  solvedPuzzles: {},     // 已解神龛表 {"1":true,...}（loadLevel 重置；ui 从 localStorage 注入已解状态）
  // v11：终点封印状态（loadLevel 初始化；updateWorld ④′ 每帧刷新计数与 open 位，读侧全部守卫）。
  // 字段见 _engSealInit / _engSealTick；ui 只读（blockT>0 时做终点闪烁提示）。
  seal: null,
  // v5（工单 §D/§E）：演出设施 + O 技能状态机。floats/fxParts/scars 引擎只 push（带容量守卫），
  // ui 每步推进+修剪（hit-stop/ult 冻结期间照常推进）——引擎任何地方不得 filter/splice 这三者。
  floats: [],            // 浮动文字（伤害/金币/COMBO/KO/GUARD，≤40）
  fxParts: [],           // UI 层演出粒子（气环/星形火花/玻璃碎/风痕，≤60）
  scars: [],             // 星陨爆坑（≤8，超限 shift；ui 画暗色椭圆坑渐隐）
  shakePend: null,       // 分级震屏挂起槽 _engShake(m,delay)：{m,t}，t 到点并入 game.shake（单槽）
  ult: { on: false, t: 0, fired: false, flashed: false }, // O 流星连斩状态机（设计 §3.1 六阶段）
  // v6（工单 §C/§D/§G）：装备注入读侧 + 技能4 星刃 + 波2 预留字段（H4：缺省全空转零副作用）
  blades: [],            // 星刃回旋实体（§2.2；loadLevel/respawn 清空）
  equip: { atk: 0, hp: 0, spd: 0, cd: 0 }, // 装备加成（ui startLevel/换装时覆写；波1 恒默认值）
  cdMul: 1,              // 技能 CD 倍率 = 1 - equip.cd（默认 1）
  gearDrops: [],         // 波2 装备掉落实体（loot 队启用；波1 仅声明与复位）
  pickups: [],           // 波2 拾取事件队列（ui 每帧消费；波1 仅声明与复位）
  bagActive: false,      // 背包开启冻结（updateWorld 顶部早退，同 puzzleActive 位；波2 bag 队启用）
  // v19（mage 第二角色，spec §2.1）：沿「扩展字段」先例，不新增第二份状态机
  hero: 'knight',        // 当前英雄 id（ui 在 loadLevel 之前写入；engine 内 _engHero() 回落 knight）
  mana: 0,               // 法师法力（唯一真值在 game 上：HUD/复活/换关只认这一处）
  manaMax: 0,            // 法力上限（knight 恒 0 ⇒ 法力条不画、回蓝/耗蓝全空转）
  manaToast: 0,          // 「法力不足」提示剩余秒（0.9s；ui 在技能槽上方画红字）
  shots: [],             // 法师远程弹体（**不复用 game.bullets**：后者全部按「敌方」结算伤害）
  wells: [],             // v19.3：法师「引力奇点」实体（飞行 → 停驻吸附 → 引爆）
  /* ---- v20 地图二（kind 7~11）：玩家侧状态与场地实体 ----
     全部沿用「扩展字段」先例，不新增顶层全局符号。四组各自独立、互不读对方，
     所以只有对应 Boss 在场时才有内容；其余关卡恒为空数组/0，读侧一律带守卫。 */
  heat: 0,               // 烬：玩家身上的热量 0..100（造成伤害累积、静止散去、flare 引爆清零）
  heatT: 0,              // 烬：距上次造成伤害的秒数（>0.6s 才开始散热——「打三秒停一拍」的判定依据）
  mawMeals: []           // 喉：被吞进嘴的弹体（打爆嘴时一次性结算 3 伤 × 数量）
};

/* ==================== 关卡装载 / 出生 / 死亡 / 通关 ==================== */
function _engMkAI(type, x, y) { // 内部：v6 敌人技能状态机初值（工单 §E）
  // cd0 = BAL 基础 CD + ((x*7+y*13)%10)/20 确定性相位错开（设计书 §3 规则4：无随机、0~0.5s 错开、
  // 门禁空转零触发）；初值 cd=cd0（冷却初值带相位错开），技能发动后 cd 回基础值。
  const sk = BAL.enemy[type] && BAL.enemy[type].skill;
  const base = sk ? sk.cd : 3;
  const cd0 = base + (((x || 0) * 7 + (y || 0) * 13) % 10) / 20;
  return { st: 'idle', t: 0, cd: cd0, cd0: cd0, tx: 0, ty: 0 };
}

/* ==================== v7 §5.0：新敌统一工厂（内部） ====================
   新字符 'N'/'J'/'T'/'E'/'x'/'z' 全部经此（既有 W/F/A/Y 提取分支一字不动）；
   Boss 召唤体（§6.2 _engBossSummon）亦复用本工厂。elite=放大变体（§5.5：体型×1.75/
   hp 取 BAL.elite[type]/全速度×0.8）。 */
const _ENG_ENEMY_DEF = { // 内部：新敌实体参数表（尺寸 px/hp/地面型/巡逻型）
  // slime：非新敌，但 §6.2 _engBossSummon 经本工厂出实体（kind1 召唤 type='slime'）——
  // 行值='W' 提取分支逐字收编（12×10/hp2/地面巡逻），缺行会在 L7 召唤瞬间 TypeError（自测④c 实证）。
  slime:  { w: 12, h: 10, hp: BAL.enemy.slime.hp,         ground: true,  patrol: true },
  lancer: { w: 12, h: 14, hp: BAL.enemy.lancer.hp,        ground: true,  patrol: true },
  jelly:  { w: 12, h: 12, hp: BAL.enemy.jelly.hp,         ground: false, patrol: false },
  ghost:  { w: 12, h: 14, hp: BAL.enemy.ghost.hp,         ground: false, patrol: false },
  boomer: { w: 10, h: 10, hp: BAL.enemy.boomer.hp,        ground: true,  patrol: false },
  // v8.0 任务4：三种新敌（尺寸/锚点=工单逐字：14×12 / 14×16 / 12×12，均为地面型、锚点 py-2）
  beetle:  { w: 14, h: 12, hp: BAL.enemy.beetle.hp,       ground: true,  patrol: true },
  spitter: { w: 14, h: 16, hp: BAL.enemy.spitter.hp,      ground: true,  patrol: false },
  hopper:  { w: 12, h: 12, hp: BAL.enemy.hopper.hp,       ground: true,  patrol: true }
};
function _engMkEnemy(type, px, py, elite) { // 内部：v7 新敌统一工厂（elite=放大变体）
  const D = _ENG_ENEMY_DEF[type], s = elite ? BAL.elite.scale : 1;
  const sp = (D.patrol ? BAL.enemy[type].spd : 0) * (elite ? BAL.elite.spdMul : 1);
  return { type: type, elite: !!elite,
    x: px + 2, y: py + (D.ground ? -2 : 3), w: Math.round(D.w * s), h: Math.round(D.h * s),
    vx: -sp, vy: 0, hx: px + 2, hy: py + (D.ground ? -2 : 3), ax: px + 2, ay: py + (D.ground ? -2 : 3),
    rng: 0, amp: undefined, frq: undefined,
    dead: 0, t: (px * 0.7 + py * 1.3) % 6.283, grounded: false, // t 相位公式与既有 spawn 一致
    hp: elite ? BAL.elite[type].hp : D.hp, kb: 0, flashT: 0, jitT: 0, dvx: 0, dvy: 0,
    convV: 0, turnCd: 0, // v8.0：传送带带速（独立于巡逻 vx）/ 掉头冷却（防夹缝里每帧翻向）
    face: -1, guardDown: false, ai: _engMkAI(type, px, py) };
}

function _engHero() { // 内部（v19）：当前英雄表项——非法/缺省 game.hero 一律回落 knight（旧存档零回归）
  return HEROES[game.hero] || HEROES.knight;
}

function _engMkPlayer(x, y) { // 内部：玩家对象（字段 = 契约清单 + v2 P1 攻击/冲刺字段 + v3/v5/v6 扩展）
  const maxHp = _engHero().hpBase + (game.equip ? game.equip.hp : 0); // v6 §C：装备头饰加成（骑士 5 / 法师 4）；v7.7：局外成长项已删；v19：基础血按英雄表
  return {
    x: x, y: y, w: 10, h: 14, vx: 0, vy: 0, face: 1,
    onGround: false, coyote: 0, jbuf: 0, anim: 'idle', animT: 0,
    dead: false, deadT: 0, standOn: null, landT: 0,
    atkCd: 0, atkT: 0,     // v2 P1：攻击冷却剩余 / 判定框剩余存在时间
    abuf: 0,               // v7.7：攻击输入缓冲剩余（冷却中按下 → 冷却一结束立刻起手）
    dashCd: 0, dashT: 0, dashDir: 1, // v2 P1：冲刺冷却剩余 / 持续剩余 / 方向
    hp: maxHp, maxHp: maxHp, invT: 0, shieldT: 0, castT: 0, // v3：心形 HP / 受伤无敌剩余 / 护盾剩余 / 施法姿态剩余；v6 §C：maxHp=5+equip.hp
    jumpCut: false, prevJump: 0, // v2.6：松手截断只作用于普通跳；prevJump 记录跳键上一帧状态
    // v5 §A/§E：airJumps 剩余二段跳次数 / djT 空翻演出 / turnT 转身 squash / stepT 脚步尘土 /
    // landVy 落地瞬间 vy（分级用）/ springAir 弹簧锁定二段跳 / atkAnim 攻击总动画 / atkWind 起手 /
    // windT 冲刺风粒节流 / shieldHp 护盾吸收次数
    airJumps: 1, djT: 0, turnT: 0, stepT: 0, landVy: 0, springAir: false,
    atkAnim: 0, atkWind: 0, windT: 0, shieldHp: 0,
    convV: 0,              // v8.0：传送带带速（与 p.vx 分开——带速要能叠加在跑速上，不能共用同一个钳制）
    pullV: 0,              // v10：Boss 吸附力场速度（同上，独立于 p.vx；力场结束 8/s 衰减归零）
    atkSeq: 0, // v5 §C：每次挥击序号——hit-stop 冻结后判定框仍存活，同一摆不得对同一目标二次结算
    shotSeq: 0  // v19：法师普攻「一次起手只发一发」序号（对标 atkSeq；与 _engResolveMageAttack 比对）
  };
}

function loadLevel(idx, keepStats) {
  game.levelIdx = idx;
  game.level = new Level(idx);
  const L = game.level;
  if (!keepStats) { game.time = 0; game.deaths = 0; game.coins = 0; game.keys = 0; game.switchState = 0; }
  game.bullets = []; game.parts = [];
  // v19（spec §2.2）：法力/远程弹体随换关复位——必须在创建玩家之前（玩家 maxHp 读英雄表）
  const _engH19 = _engHero(); // 内部：本关英雄（game.hero 由 ui 在 loadLevel 前写入）
  game.manaMax = _engH19.usesMana ? BAL.heroes.mage.manaMax : 0;
  game.mana = game.manaMax; game.manaToast = 0; game.shots = [];
  game.wells = [];
  // v20：地图二的玩家侧状态与场地实体随换关复位（不进存档、不放跨关）
  game.heat = 0; game.heatT = 0; game.mawMeals = [];
  // respawnAt.p = 前进度量(x-y)：检查点「只进不退」的比较基准（横版 x 递增 / 纵版 y 递减均单调）
  game.respawnAt = { x: L.spawn.x, y: L.spawn.y, p: L.spawn.x - L.spawn.y };
  game.player = _engMkPlayer(L.spawn.x, L.spawn.y);
  game.cam.x = _engClamp(L.spawn.x + 5 - _engVW / 2, 0, Math.max(0, L.w * _engTile - _engVW));
  // v8.0：关卡不足一屏时初始 cam.y 直接取负值（内容垂直居中），与 updateWorld ⑬ 的钳制口径一致
  const _initMaxY = L.h * _engTile - _engVH;
  game.cam.y = _initMaxY < 0 ? _initMaxY / 2
    : _engClamp(L.spawn.y + 7 - _engVH / 2, 0, _initMaxY);
  // v3：Boss 创建 + 新实体/技能字段复位（工单 A「loadLevel 末尾」）
  // v7 §6.1：kind 推导——boss:true≡1（星核巨兽），boss:2=蛟龙，boss:3=判官
  const kind = L.meta.boss === true ? 1 : (L.meta.boss || 0);
  game.boss = L.bossSpawn ? _engMkBoss(L.bossSpawn.x, L.bossSpawn.y, kind) : null;
  game.drops = []; game.meteors = []; game.waves = []; game.flashT = 0;
  game.hazards = []; // v10：场地危险物随换关清空（与 bullets/waves 同口径，避免上一关的陨石/地刺残留）
  game.skills = { u: 0, i: 0, o: 0, l: 0 };
  // v4：谜题状态复位——覆盖层强制关闭 / 接近清空 / 已解表清空（工单 4：
  // solvedPuzzles={} 在 loadLevel 重置；已解状态由 ui 在 startLevel 后从 localStorage 注入）
  game.puzzleActive = false; game.puzzleNear = -1; game.solvedPuzzles = {};
  // v11：终点封印随换关重建（Boss 关直接 open；enemyNeed/coinNeed 由本关实体数算）
  game.seal = _engSealInit(L);
  // v5 §D/§E：演出设施复位（floats/fxParts/scars 清空重开）+ 震屏槽 + O 技能状态机
  game.floats = []; game.fxParts = []; game.scars = [];
  game.shakePend = null;
  game.ult = { on: false, t: 0, fired: false, flashed: false };
  // v6 §G：新字段复位——星刃清空 / 技能4 CD / 速降键与 L 边沿清 0 / 波2 预留字段复位
  // （equip/cdMul 不在此重置：ui startLevel/换装时覆写，波2 bag 队管理，工单 §G 复位总表）
  game.blades = [];
  game.gearDrops = []; game.pickups = []; game.bagActive = false;
  game.input.down = 0; game.input.skillLHit = 0;
}

function respawn() { // 死亡序列终点：敌人复活重置、崩塌砖复位、子弹清空；钥匙/门/开关/已收金币保持
  const p = game.player, L = game.level;
  if (!p || !L || !game.respawnAt) return;
  p.x = game.respawnAt.x; p.y = game.respawnAt.y;
  p.vx = 0; p.vy = 0; p.dead = false; p.deadT = 0;
  p.standOn = null; p.onGround = false; p.coyote = 0; p.jbuf = 0;
  p.atkT = 0; p.dashT = 0; p.atkCd = 0; p.dashCd = 0; p.abuf = 0; // v2 P1：动作状态复位（v7.7 追加攻击缓冲）
  p.mistT = 0; p.mistSlow = 0; // v18：水雾减速标记复位（重生点不在雾里，防残留半帧）
  p.webNoJump = 0;             // v20：蛛网禁跳同口径复位（否则重生第一帧按跳没反应）
  // v6 §C：HP 回满（maxHp 含装备头饰加成）+ BAL 出生保护；技能 CD 保留计时（设计 §5）
  p.maxHp = _engHero().hpBase + (game.equip ? game.equip.hp : 0); // v7.7：局外成长项已删（否则复活后上限与出生时不一致）；v19：基础血按英雄表（法师复活后仍 4 血）
  p.hp = p.maxHp; p.invT = BAL.player.respawnInvT; p.shieldT = 0; p.castT = 0;
  p.shotSeq = 0; // v19：法师普攻序号复位（复活第一发必须能出手）
  p.jumpCut = false; p.prevJump = 0;
  // v5 §A：二段跳/手感演出状态复位（复活=重置为 1，设计 §1.1；floats/fx 保留自然消散）
  p.airJumps = 1; p.djT = 0; p.turnT = 0; p.stepT = 0; p.springAir = false;
  p.atkAnim = 0; p.atkWind = 0; p.shieldHp = 0;
  p.convV = 0; // v8.0：复活清带速（否则在传送带上死一次会带着 280px/s 的惯性弹出去）
  // v19（spec §2.2）：法力回满 / 远程弹体清空（防复活瞬间被自己的旧弹体结算出怪伤害与连击）
  game.mana = game.manaMax; game.manaToast = 0;
  game.shots = game.shots || []; game.shots.length = 0;
  game.wells = game.wells || []; game.wells.length = 0;
  game.shakePend = null;
  // v2 P1：清输入锁存——死亡期间残留的边沿不得在复活后的缓冲窗口内自动触发
  game.input.jumpHit = 0; game.input.attackHit = 0; game.input.dashHit = 0;
  game.input.skillUHit = 0; game.input.skillIHit = 0; game.input.skillOHit = 0; // v3：技能边沿同惯例清零
  game.input.down = 0; game.input.skillLHit = 0; // v6 §G：速降持键 / 技能4 边沿同惯例清零
  game.hitStop = 0;
  game.blades = []; // v6 §G：星刃随复活清空（工单 §G 复位总表）
  // v6 波2 §5：拾取事件随复活清空（防陈旧事件被 ui 二次消费）；gearDrops 跨死亡保留
  // （装备掉落不因死亡丢失——任务书"发光装备实体触碰拾取"；bagActive 由 loadLevel 复位）
  game.pickups = [];
  game.bullets = []; game.waves = []; game.meteors = []; // v3：弹幕/波/陨石清空（drops 保留自然过期）
  game.hazards = []; // v10：场地危险物随死亡清空（复活瞬间被上一轮的陨石/地刺砸死是最伤信任的一类挫败）
  // v20：地图二场地实体随死亡清空——虫卵/蛛网/嘴里积食都归零，热量清零。
  // 只清不重建：复活点是安全区，不该一睁眼就站在网里、被卵围着、或带着 90 点热量。
  game.mawMeals = [];
  game.heat = 0; game.heatT = 0;
  if (game.player) game.player.pullV = 0; // v10：吸附力残留清零（否则复活第一帧还会被旧力场拖着走）
  // v3：Boss 重置——HP/阶段保留，状态回 idle（若存在且非 dormant/dead，工单 B）
  // v8.0：死亡=「正在打的这一段」作废——总血回到本段上界（打到 49% 死 → 复活 66%，
  // 打到 80% 死 → 100%），已跨过的段保留（bandBreak 不变）。这是「死一次只丢一段」的唯一实现，
  // 不做的话重打整场 8 分钟，比不加检查点还劝退。
  if (game.boss && game.boss.state !== 'dormant' && game.boss.state !== 'dead'
        && game.boss.state !== 'dying') {
    const B = game.boss;
    if (B.bandMax > 0 && B.hpTotal > 0) {
      B.hpTotal = Math.min(B.maxHp, (3 - B.bandBreak) * B.bandMax);
      B.hp = _engSegHp(B);
    }
    B.bandFlashT = 0; B.hidden = false; B.vx = 0; B.vy = 0;
    // v12：复活清新交互态——hazards 已被上面清空，若 coreOn 残留则 Boss 会「无核心但免伤」永久无敌
    B.coreOn = false; B.chargeN = 0; B.leechOn = 0; B.leechAcc = 0;
    B.quellDmg = 0; B.quellDur = 0; B.quellFlash = 0;
    B.parryOn = false; B.breakT = 0;   // v13：架势/破防同 coreOn 口径复位（hazards 已清空，残留即永久反弹）
    // v20：地图二 Boss 的机制态同口径复位——skew 归零（否则复活后第一击就触发失衡回血）、
    // 嘴里清空（否则残留积食让玩家白赚一次爆发）、曲谱从第一拍重来（可背的谱必须是同一份）。
    B.skew = 0; B.mouthOpen = false; B.scoreI = 0; B.scoreT = 0; B.lastPcx = undefined;
    if (B.state !== 'revive') { B.state = 'idle'; B.t = 0; } // 阶段切换演出不打断
  }
  for (const e of L.enemies) {
    e.dead = 0;
    if (e.type === 'bat') { e.x = e.ax; e.y = e.ay; }
    else { e.x = e.hx; e.y = e.hy; e.vy = 0; e.grounded = false; }
    // v6 §E：技能状态机复位（相位按复位后坐标重算，与出生同值确定性）+ 骑士破绽解除
    if (e.ai) e.ai = _engMkAI(e.type, e.x, e.y);
    e.guardDown = false;
    e.convV = 0; e.turnCd = 0; // v8.0：复活清带速/掉头冷却（与位置复位同口径）
    // v8.0 任务3：脱困窗口/冲刺/冷却也随复位清零（否则死亡前的窄幅统计会带到重生后的第一秒）
    e.freeT = 0; e.spanT = 0; e.spanMin = e.x; e.spanMax = e.x; e.rescueCd = 0;
  }
  for (const c of L.crumbles.values()) { c.state = 0; c.t = 0; c.dy = 0; c.dvy = 0; }
}

function killPlayer() {
  const p = game.player;
  if (!p || p.dead || game.state !== 'play') return;
  p.dead = true; p.deadT = 0;
  p.atkT = 0; p.dashT = 0; p.abuf = 0; // v2 P1：动作状态随死亡终止（v7.7 追加攻击缓冲）
  p.shotSeq = 0; // v19：法师普攻序号随死亡清零（复活第一发必须能出手）
  game.deaths++; game.shake = 8; // v2 P1：死亡震屏 6→8
  game.sfxQueue.push('die'); // 音效只能入队，engine 不发声
  _engAddParts(p.x + 5, p.y + 7, 18, '#f08830', 120);
  _engAddParts(p.x + 5, p.y + 7, 10, '#f8d020', 90);
}

function levelClear() {
  // v6 波2 §4（H4）：Boss 关装备掉落零丢失——通关瞬间仍在场的 gearDrops 全部转拾取事件
  // （Boss 死亡演出 2.2s 内玩家可能没跑到掉落点；结算横幅前自动拾取，避免丢件）。
  // engine 只发事件，入包/存档归 ui（H2）。非 Boss 关不适用（gearDrops 恒空或随 loadLevel 放弃）。
  const Lc = game.level;
  if (Lc && Lc.meta && Lc.meta.boss && game.gearDrops.length) {
    for (const d of game.gearDrops) game.pickups.push({ slot: d.slot, r: d.r });
    game.gearDrops = [];
  }
  if (game.state !== 'play') return;
  game.state = 'clear'; game.clearT = 0;
  game.sfxQueue.push('clear');
  const p = game.player;
  if (p) {
    const cols = ['#f8d020', '#48d8e8', '#f85888', '#58c848'];
    for (let i = 0; i < 40; i++) {
      _engAddParts(p.x + 5 + (Math.random() * 60 - 30), p.y - 20 - Math.random() * 40, 1, cols[i % 4], 90, 120);
    }
  }
  // 星级/解锁/存档由 ui 层负责，engine 不碰 localStorage
}

/* ==================== v11：终点封印（内部） ====================
   玩家反馈：「小关可以什么都不干直接位移到最后」——v7.9 把谜题门拆掉后，终点判定退化成
   「碰到旗就过关」，敌人/金币/神龛全部变成可跳过的装饰。这里补一层「封印」，但**不做单条件**：
   单条件必然卡人（某个金币在难跳支线、某个敌人藏在死角），所以三条路任选其一，玩家爱打就打、
   爱捡就捡、爱解谜就解谜：
     战斗线 enemyKilled ≥ 60% 敌人 / 探索线 coinGot ≥ 40% 金币实体 / 解谜线 本关神龛已解。
   Boss 关豁免（open=true, via='boss'）：Boss 本身就是目标，不需要额外条件。
   **计数口径**：
     - 敌人：L.enemies 里 dead>0 且非 Boss 召唤体（e.summoned）的个数；
     - 金币：L.coins 里 got 的实体个数——**绝不能用 game.coins**，它跨关累积
       （loadLevel(idx,true) 不清零），带着上一关的余额进来会直接白给；
       也不用 totalCoin（含宝石面值 5 与木箱内含），否则 coinNeed 与实际进度对不上；
     - 谜题：game.solvedPuzzles[L.shrines[0].idx]（ui 把 localStorage 同步进该字段，engine 不读存档）。
   每帧从实体重算而不是累加：respawn 会把敌人复活（dead 归 0），累加器会把「复活后再杀一次」
   重复计数，重算则天然与画面一致。 */
function _engSealInit(L) { // 内部：封印状态初值（loadLevel 调用）
  const et = L.enemyTotal || 0, ct = L.coins.length;
  const boss = !!(L.meta && L.meta.boss); // v11：Boss 关豁免
  return {
    enemyTotal: et,
    enemyKilled: 0,
    enemyNeed: Math.max(1, Math.ceil(et * 0.60)),  // v11：战斗线 60%（最低 1，空关不卡）
    coinTotal: ct,
    coinGot: 0,
    coinNeed: Math.max(1, Math.ceil(ct * 0.40)),   // v11：探索线 40%（口径=金币实体个数）
    hasShrine: L.shrines.length > 0,
    shrineOk: false,
    open: boss,
    via: boss ? 'boss' : null,   // 'battle' | 'coin' | 'puzzle' | 'boss' | null
    blockT: 0,                   // 被封印弹回的提示计时（ui 读它做终点闪烁）
    relaxed: false               // v11 防卡关兜底：只降一次
  };
}

function _engSealTick(dt) { // 内部：每帧刷新封印计数/开放位 + 防卡关兜底（updateWorld ④′ 调用）
  const s = game.seal, L = game.level, p = game.player;
  if (!s || !L) return;
  if (s.blockT > 0) s.blockT = Math.max(0, s.blockT - dt); // 弹回提示计时递减
  /* v11 防卡关兜底：本关死满 5 次说明「这条线他真打不过」——两条硬指标各降 20%（只降一次）。
     封印是引导玩家体验内容，不是惩罚玩家；继续卡只会劝退。 */
  if (!s.relaxed && game.deaths >= 5) {
    s.relaxed = true;
    s.enemyNeed = Math.max(1, Math.floor(s.enemyNeed * 0.8));
    s.coinNeed = Math.max(1, Math.floor(s.coinNeed * 0.8));
    if (p) _engFloat(p.x + 5, p.y - 14, '封印松动', '#b060f0', 1);
    game.sfxQueue.push('puzzle');
  }
  if (s.open) return; // 已解：不再重算（解开的封印不会因为死亡复活而重新锁上）
  let ek = 0;
  for (const e of L.enemies) if (e.dead > 0 && !e.summoned) ek++; // Boss 召唤体不计入战斗线
  s.enemyKilled = ek;
  let cg = 0;
  for (const c of L.coins) if (c.got) cg++;
  s.coinGot = cg;
  // 谜题线：ui 在 loadLevel 之后才把存档注入 solvedPuzzles，所以必须每帧读、不能在 init 里定死
  s.shrineOk = !!(s.hasShrine && game.solvedPuzzles && game.solvedPuzzles[L.shrines[0].idx]);
  if (s.enemyKilled >= s.enemyNeed) { s.open = true; s.via = 'battle'; }
  else if (s.coinGot >= s.coinNeed) { s.open = true; s.via = 'coin'; }
  else if (s.shrineOk) { s.open = true; s.via = 'puzzle'; }
  if (s.open) { // 解除特效：金色粒子一圈 + 轻震屏 + 浮字（终点可能在屏幕外，所以落在玩家身上）
    if (p) {
      _engAddParts(p.x + 5, p.y + 7, 18, '#f8d048', 120, 90);
      _engFloat(p.x + 5, p.y - 16, '封印解除', '#f8d048', 1);
    }
    _engShake(3, 0);
    game.sfxQueue.push('door'); // 用「开门」音：封印=一道门；'clear' 是通关号角，会误导玩家
  }
}

/* ==================== v4：谜题神龛结算（新契约导出，见 CONTRACT 附记） ==================== */
function puzzleSolved(idx) { // 谜题解开结算（ui 在覆盖层校验全对时调用；红线唯一允许的新全局导出）
  if (game.solvedPuzzles[idx]) return; // 已解神龛不重复结算（正常流：已解神龛走 ui 只读模式不会到这；防御双发奖）
  game.solvedPuzzles[idx] = true;      // 持久化由 ui 层负责（engine 不碰 localStorage）
  game.coins += BAL.econ.puzzle;       // 奖励 5 金币（等价一颗宝石，直接走计数，不涉及宝石实体）
  game.sfxQueue.push('puzzle'); game.sfxQueue.push('gem'); // 解谜音 + 得宝石音（只入队，engine 不发声）
  const p = game.player;
  if (p) _engAddParts(p.x + 5, p.y - 6, 24, '#f8d048', 130, 150); // 玩家位置上方金色烟花 ≈24 粒（#f8d048=美术金色印章色）
  // ===== v7.9 解谜奖励改成「装备」=====
  // 谜题改为可选之后（终点不再被神龛卡住），只给 5 金币没有任何理由让人坐下来解——
  // 5 金币在这个游戏里买不到任何东西。改成必掉 1 件该进度档位的装备，且优先补玩家最弱的槽，
  // 让「解谜」直接变成一条能感知的养成支线（而不是一个摆设景点）。
  if (p) {
    const li = game.levelIdx | 0;
    const r = li >= 12 ? 3 : li >= 6 ? 2 : 1;      // L13+ 紫 / L7~L12 蓝 / L1~L6 绿（不低于当关怪物的掉落档）
    const slot = _engWeakSlot();
    if (game.gearDrops.length < _engGearCap)
      game.gearDrops.push(_engMkGear(p.x + 5 - 5, p.y - 4, slot, r));
    // 掉落实体在神龛脚下弹一下再落地：直接落在玩家格子里会被瞬间拾取、失去「这是奖励」的仪式感。
  }
}

function _engWeakSlot() { // 内部（v7.9）：玩家三个槽位里最弱的那个——解谜掉落优先补短板
  // 只读 game.equip 的聚合数值（ui 写入），不碰 localStorage、不读存档结构：
  // 按各槽的上限归一化后取最小（武器→atk/6、头饰→hp/4、披风→移速与冷却取较大/12）。
  const eq = game.equip || { atk: 0, hp: 0, spd: 0, cd: 0 };
  const w = (eq.atk || 0) / 6, h = (eq.hp || 0) / 4;
  const c = Math.max(eq.spd || 0, eq.cd || 0) / 12;
  return w <= h && w <= c ? 'w' : (h <= c ? 'h' : 'c');
}

/* ==================== v3：HP 伤害 / Boss AI / 技能（内部） ==================== */

function _engShieldBreak() { // 内部（v5 §3.3）：破盾事件——吸收耗尽与计时自然到期共用
  const p = game.player;
  if (!p) return;
  p.shieldT = 0; p.shieldHp = 0;   // 破盾后护盾不再挡伤（走正常无敌帧外的受伤流）
  game.sfxQueue.push('shieldbreak');
  for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; // 8 片玻璃碎 fx（青白 shard，grav 300）
    _engFx(p.x + 5 + Math.cos(a) * 10, p.y + 7 + Math.sin(a) * 10,
      { shard: 1, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90 - 50, grav: 300,
        life: 0.5, color: i % 2 ? '#bfeaff' : '#ffffff', size: 1 });
  }
}

function _engHurtPlayer(fromX, dmg) { // 内部：一切 HP 伤害的唯一入口（工单 B；即死物不走这里，见 _engHazardHit）
  // v7.9：加可选伤害值（缺省 1）。终章双 Boss 的 contactDmg=2 终于被真的消费——
  // 原来的表里的 contactDmg 是个没人读的死字段，写 2 也只是自我安慰。
  const p = game.player;
  if (!p || p.dead || game.state !== 'play') return false;
  if (p.invT > 0) return false;                    // 无敌帧：伤害与击退全免
  if (p.shieldT > 0) {                             // v5 §3.3：护盾吸收 1 次
    // v8.2 修复：吸收命中必须给无敌帧（同正常受击 1.0s）——此前不给，敌人贴身/弹幕
    // 穿身时伤害逐帧判定，2 层吸收 2 帧内打光、第 3 帧人照样掉血，观感即"一碰就碎"。
    p.shieldHp--; p.invT = BAL.player.invT;
    p.vx = (p.x + p.w / 2 < fromX ? -1 : 1) * BAL.player.hurtKbX * 0.8;   // 击退=离伤害源（0.8x 弹开）
    p.vy = -BAL.player.hurtKbY * 0.6; p.dashT = 0;
    p.airJumps = 1; p.springAir = false;
    _engShake(4, 0); game.sfxQueue.push('shieldhit');
    _engAddParts(p.x + 5, p.y + 7, 10, '#bfeaff', 95, 160);
    _engFloat(p.x + 5, p.y - 6, 'GUARD', '#8ad8f8', 0);
    if (p.shieldHp <= 0) _engShieldBreak();        // 吸收耗尽 → 破盾事件（sfx+碎裂 fx+清盾）
    return false;
  }
  p.hp -= (dmg || 1); p.invT = BAL.player.invT;
  p.vx = (p.x + p.w / 2 < fromX ? -1 : 1) * BAL.player.hurtKbX;   // 击退方向=离伤害源
  p.vy = -BAL.player.hurtKbY; p.dashT = 0; p.atkT = 0;
  p.airJumps = 1; p.springAir = false;             // v5 §1.1：受击重置二段跳/解锁弹簧锁
  game.shake = Math.max(game.shake, 5);
  game.sfxQueue.push('hurt');
  _engAddParts(p.x + 5, p.y + 7, 10, '#f85858', 90, 200);
  if (p.hp <= 0) killPlayer();                     // 复用 v2 死亡序列
  return true;
}

/* v7.8：即死物入口（尖刺 ^ / 吊刺 v / 熔岩 ~ / 电锯）。此前这四类直接 killPlayer，
   护盾对它们完全无效——玩家按了 I 看到光罩，踩刺照样死，观感就是"护盾没实装"。
   现在改为：护盾在身时由护盾吃掉一次（消耗 1 次吸收 + 1.2s 无敌 + 向上弹开），没盾才真死。
   掉出地图底部仍然必死（人不在地图里，救回来也没有落点），不走本入口。 */
function _engHazardHit(fromX) {
  const p = game.player;
  if (!p || p.dead || game.state !== 'play') return;
  if (p.invT > 0) return;                          // 无敌帧内不重复触发（防同一帧/连续帧把护盾连吃光）
  if (p.shieldT > 0) {
    p.shieldHp--; p.invT = 1.2;                    // 1.2s 足够从单格尖刺/一片熔岩里跑出来
    p.vy = -240;                                   // 向上弹开，脱出危险瓦片
    p.vx = (fromX != null && p.x + p.w / 2 < fromX ? -1 : 1) * BAL.player.hurtKbX * 0.8;
    p.airJumps = 1; p.springAir = false;           // 与受击同口径：重置二段跳，别把玩家锁死
    game.shake = Math.max(game.shake, 4);
    game.sfxQueue.push('shieldhit');
    _engAddParts(p.x + 5, p.y + 7, 10, '#bfeaff', 95, 160);
    _engFloat(p.x + 5, p.y - 6, 'GUARD', '#8ad8f8', 0);
    if (p.shieldHp <= 0) _engShieldBreak();
    return;
  }
  killPlayer();
}

/* ==================== v6 波2（loot 队）：装备掉落（内部） ====================
   设计书 §6.3 + 工单 v6-wave2-loot §1/§2：掉落表/概率逐字=BAL.gear（平衡表 §Q，H5 只读不得现场调参）；
   engine 只生成实体与发 game.pickups 事件（H2：数据归属 ui，engine 不碰 localStorage）；
   gearDrops 为独立实体池上限 6（H3：超过不再生成——Boss 双掉+骑士掉同屏 ≤4，6 有余量）。 */
const _engGearCap = 6; // 内部（H3）：gearDrops 实体池上限
function _engRollTier(w) { // 内部：稀有度 roll——w=[白,绿,蓝,紫,金] 权重数组（和=100）；权重 0 的档位天然不可达
  let r = Math.random() * 100;
  for (let i = 0; i < 5; i++) { r -= w[i]; if (r < 0) return i; }
  return 4;
}
function _engSlot() { return 'whc'[(Math.random() * 3) | 0]; } // 内部：槽位均匀 1/3（w 武器/h 头饰/c 披风）
function _engMkGear(x, y, slot, r) { // 内部：装备掉落实体（10×12 弹跳出生；bounced/rest 由物理循环维护）
  return { x: x, y: y, w: 10, h: 12, vy: -140, vx: (Math.random() < 0.5 ? -1 : 1) * 30,
    slot: slot, r: r, t: 0, bounced: false };
}

function _engKillEnemy(e) { // 内部：击杀统一入口（踩踏/攻击/星陨/连斩/星刃共用；30% 掉回复心，设计 §5）
  e.dead = 0.01;
  // v19（spec §2.8）：法师击杀回蓝 +12（clamp 到上限）。放唯一击杀入口内 ⇒ 近战/远程/大招击杀一致。
  if (_engHero().usesMana) {
    const mNow = Number.isFinite(game.mana) ? game.mana : 0;
    game.mana = Math.min(game.manaMax, mNow + BAL.heroes.mage.manaPerKill);
  }
  if (Math.random() < BAL.econ.heartChance) game.drops.push({ x: e.x + 2, y: e.y - 4, w: 8, h: 8, vy: -120, life: 6 });
  // v6 波2 §2②：精英骑士掉装备——仅 L9/L10（levelIdx 0 基 8/9）、10%（BAL.gear.eliteChance）、
  // 权重 BAL.gear.elite 无金（金=Boss 专属，§Q/H5）；踩踏/普攻/技能击杀全经此唯一入口；池满 ≥6 跳过（H3）。
  if (e.type === 'knight' && (game.levelIdx === 8 || game.levelIdx === 9)
      && Math.random() < BAL.gear.eliteChance && game.gearDrops.length < _engGearCap)
    game.gearDrops.push(_engMkGear(e.x + e.w / 2 - 5, e.y, _engSlot(), _engRollTier(BAL.gear.elite)));
  // v7 §5.5：精英（'x' 枪虾王/'z' 幽灵王）必掉装备——eliteK 权重，无金（金=Boss/隐藏宝箱专属）；
  // 唯一击杀入口内追加（自爆灭的魂火不走本函数=无掉落）；池满 ≥6 跳过（H3）。
  if (e.elite && game.gearDrops.length < _engGearCap) {
    game.gearDrops.push(_engMkGear(e.x + e.w / 2 - 5, e.y, _engSlot(), _engRollTier(BAL.gear.eliteK)));
    _engShake(6, 0); _engFloat(e.x + e.w / 2, e.y - 10, 'ELITE KO', '#f8d048', 1);
  }
  // v7.8：普通小怪 7% 掉装备（BAL.gear.trash 权重，白/绿为主）。精英已必掉，不重复走这里。
  if (!e.elite && Math.random() < BAL.gear.trashDrop && game.gearDrops.length < _engGearCap)
    game.gearDrops.push(_engMkGear(e.x + e.w / 2 - 5, e.y, _engSlot(), _engRollTier(BAL.gear.trash)));
}

function _engOnScreen(e) { // 内部：实体矩形是否在视口内（连斩「屏内普通敌全灭」判定用）
  return e.x + e.w > game.cam.x && e.x < game.cam.x + _engVW &&
         e.y + e.h > game.cam.y && e.y < game.cam.y + _engVH;
}

function _engBossTable(kind) { // 内部：v7 Boss 参数表选择（kind 0/1=星核巨兽，2=蛟龙·敖渊，3=幽冥判官，4=冥古龙，5=曜光·圣裁者，6=烈焰·牛魔王）
  // R4：全部 Boss 差异只允许来自本选择器命中的参数表；禁止第二份 Boss 状态机 switch。
  // v20：7~11 为地图二五只（余烬回响 / 双生天秤 / 孵化之间 / 无声之喉 / 终末之钟）。
  return kind === 2 ? BAL.boss2 : kind === 3 ? BAL.boss3
       : kind === 4 ? BAL.boss4 : kind === 5 ? BAL.boss5
       : kind === 6 ? BAL.boss6
       : kind === 7 ? BAL.boss7 : kind === 8 ? BAL.boss8 : kind === 9 ? BAL.boss9
       : kind === 10 ? BAL.boss10 : kind === 11 ? BAL.boss11
       : BAL.boss;   // v12：L19 牛魔王
}

function _engMkBoss(cx, py, kind) { // 内部：Boss 实体（cx=锚点中心x, py=锚点行顶；v7 §6.1 参数化）
  const T = _engBossTable(kind || 0);
  return {
    x: cx - T.w / 2,
    // 【工单偏离·已裁决】伪代码 `y: py` 为笔误——那会把命中框嵌入主地板 32px，
    // 与 engine.md A 节「落地脚底 y=208」及设计 §1「脚底站在地面瓦片顶」/§6「落地脚 y=208」矛盾。
    // 按「落地脚底=锚点下一行的地板顶面」实现：y=(锚点行+1)*16-h（随表高推导；kind1 即原 48 值，零回归）。
    y: py + _engTile - T.h,
    homeX: cx - T.w / 2, homeY: py + _engTile - T.h, // v7.9：双 Boss 接力时第二棒按首发锚点重算落点（不跟着尸身下沉）
    w: T.w, h: T.h, vx: 0, vy: 0, face: -1,
    kind: kind, hidden: false,     // v7 §6.1：kind 1..5；§6.3：blinkCast 隐身位
    // v8.0 三段血：hpTotal = 总血（唯一真值）；hp = 当前段内剩余（UI 只读派生值 0..bandMax）。
    // 血条连续下降——跨过 66%/33% 只播「阶段切换」演出、不回血；只有玩家死亡复活时
    // 才把当前段回满（打到 49% 死 → 复活 66%，见 respawn）。maxHp 仍是总 HP，门禁/存档口径不变。
    hpTotal: T.hp, hp: T.hp / 3, maxHp: T.hp, bandMax: T.hp / 3, bandBreak: 0, bandFlashT: 0,
    phase: 1,
    state: 'dormant', t: 0,        // t：当前状态已累计秒数
    next: '', lastPattern: '', pickN: 0,
    // v10 连段/破绽/吸附：comboQ=待放招式队列（[当前, 下一招]，最多 2 个）、comboN=当前连到第几招
    // （0=第一招，>=1=连段第二招——UI 在 comboN>=1 的 windup 画红警告）、pullT=吸附力场剩余秒。
    comboQ: [], comboN: 0, pullT: 0, staggerDur: 0, lastDmg: 0,
    flashT: 0, chargeDir: 1, chargeFrom: 0, landX: 0, fireN: 0,
    /* ---- v12 新字段（spec §四.6：全部在此初始化，UI 一律带缺失守卫） ----
       chargeN  已撞墙段数（0 起，进 windup(charge) 归零）
       leechOn  召唤回血视觉强度 0..1（4/s 线性收敛）
       leechAcc 本次召唤已回的总血（leeCap 口径=单次累计上限%）
       quellDmg 蓄力期承伤累计（>= breakDmg 打断）／quellDur 蓄力剩余秒／quellFlash 全屏红闪计时
       coreOn   核心护盾生效中（_engBossHurt 全免伤）
       ---- v13 新字段（spec §四/§五） ----
       parryOn  反伤架势生效中（普攻反弹、大招破招）
       breakT   破防窗口剩余秒（0=未破防；>0 时承伤 ×2.0） */
    chargeN: 0, leechOn: 0, leechAcc: 0,
    quellDmg: 0, quellDur: 0, quellFlash: 0, coreOn: false,
    summonCd: 0,   // v13.1：召唤冷却剩余秒（>0 时 summon 不进选招池）,
    parryOn: false, breakT: 0,
    /* ---- v20 地图二机制态（每只 Boss 只用其中一组，其余保持初值零副作用） ----
       skew      秤：连续同侧命中计数 -3..3（达 ±max 触发失衡回血；异侧命中归零）
       mouthOpen 喉：嘴是否张开（inhale 期间 true）——吞弹与「打嘴」的唯一开关
       scoreI    钟：当前曲谱拍号 0..7
       scoreT    钟：本拍已进行秒数
       没有独立的「炎」字段：烬读的是玩家侧 game.heat，Boss 自己不需要记账。 */
    skew: 0, mouthOpen: false, scoreI: 0, scoreT: 0, lastPcx: undefined
  };
}

function _engBossDur(name, phase) { // 内部：前摇表(秒)，P2 ×p2WindMul（设计 §3）；v7 §6：读当前 Boss 参数表
  const T = _engBossTable((game.boss && game.boss.kind) || 0);
  // v10 连段：第二招（comboN>=1）前摇再 -20%——连段要「快」，但前摇本身仍 ≥0.4s，读招窗口不消失。
  const comboMul = (game.boss && game.boss.comboN >= 1) ? 0.8 : 1;
  /* v13：缺键兜底链 本表 → 参考表(kind0/1) → 0.6。
     v12 踩过「boss6 没配某招参数 → undefined.life 直接抛异常」，前摇同样不能返回 NaN。*/
  const w = (T.windup && T.windup[name] !== undefined) ? T.windup[name]
          : (BAL.boss.windup[name] !== undefined ? BAL.boss.windup[name] : 0.6);
  return w * (phase === 2 ? T.p2WindMul : 1) * comboMul;
}

function _engBossScore(b) { // 内部（v20）：终末之钟的曲谱——固定顺序出招，谱里 null = 休止符
  /* 为什么不用 _engBossPick：轮转选招的"顺延防重复"会让顺序每轮都变，
     而这只 Boss 的全部设计前提是「谱固定、可以背」。曲谱必须比轮转更强硬——
     连 P2 连段都不许插进来（comboQ 直接写成单招，长度 1 ⇒ recover 不会触发连段分支）。 */
  const SC = _engBossTable(11).score;
  const nxt = SC.beats[b.scoreI];
  b.scoreI = (b.scoreI + 1) % SC.beats.length;
  if (nxt === null || nxt === undefined) {   // 休止符：站定 restBeat 秒，这段才是玩家的输出窗口
    b.state = 'rest'; b.t = 0; b.scoreT = 0; b.vx = 0;
    return;
  }
  b.next = nxt; b.lastPattern = nxt;
  b.comboQ = [nxt]; b.comboN = 0;
  b.state = 'windup'; b.t = 0; b.fireN = 0; b.chargeN = 0;
}

function _engBossPick(b) { // 内部：确定性轮转选招（设计 §2，不用随机）；v7 §6.2：池全读表（R4）
  if (b.kind === 11) { _engBossScore(b); return; }   // v20：钟按曲谱，不进轮转
  const T = _engBossTable(b.kind || 0);
  const p = game.player, bcx = b.x + b.w / 2, adx = Math.abs(p.x + p.w / 2 - bcx);
  // slice：与原实现「每次新建数组字面量」等价，避免过滤前共享表被误改
  let pool = (adx <= 200 ? T.poolNear : T.poolFar).slice();
  if (b.phase === 2) pool = pool.concat(T.p2Add);
  const alive = game.level.enemies.filter(function (e) { return !(e.dead > 0); }).length;
  if (alive >= 2) pool = pool.filter(function (n) { return n !== 'summon'; });
  /* v13.1：召唤是「技能」，不是常驻循环。冷却期内直接滚出池子——
     否则队伍清得再快，下一轮轮转又把 summon 排上来，玩家会一直处于打小怪状态。 */
  if ((b.summonCd || 0) > 0) pool = pool.filter(function (n) { return n !== 'summon'; });
  if (!pool.length) pool = ['barrage'];
  /* v10：轮转游标改为「在未过滤 lastPattern 的池上按位递增，撞到上一招就顺延一位」。
     旧写法先 filter 掉 lastPattern 再取模，池长每帧都在 4/5 之间跳，索引会漂——
     实测 5 招池打 11 次仍有招一次没出（新招永远轮不到），玩家观感就是「它只会那几招」。
     现在每个池长度周期内必定把每一招各放一次（顺延只影响相邻次序，不影响覆盖）。 */
  let pi = b.pickN++ % pool.length;
  if (pool.length > 1) { let guard = 0; while (pool[pi] === b.lastPattern && guard++ < pool.length) pi = (pi + 1) % pool.length; }
  b.next = pool[pi]; b.lastPattern = b.next;
  /* v10 连段：P2 阶段 40% 概率一次排 2 招（两招必须不同）。
     comboQ 存「本套连段的全部招式」，第一招立即执行、第二招等 recover 结束再接手；
     连段最多 2 招（队列长度硬上限），连完强制进 stagger 大破绽，不会无限连。
     为什么要做：旧节奏固定 windup→cast→recover→idle，玩家第二次打同一个 Boss 就能背板；
     两连发逼玩家把「读第二招」也练进去，而 40% 概率保证它仍是变奏而不是唯一节奏。 */
  b.comboQ = [b.next]; b.comboN = 0;
  if (b.phase === 2 && pool.length > 1 && Math.random() < 0.40) {
    const rest = pool.filter(function (n) { return n !== b.next; });
    if (rest.length) b.comboQ.push(rest[(Math.random() * rest.length) | 0]);
  }
  b.state = 'windup'; b.t = 0; b.fireN = 0;
  b.chargeN = 0;   // v12：每套新招从 0 起（「进 windup(charge) 归零」的落点，轮转算法本身未改）
}

// v8.0 三段血的派生口径（全引擎唯一两处，UI 只读 b.hp / b.bandBreak，不自己重算）：
//   段索引由总血反推——第一段 (2b,3b]、第二段 (b,2b]、第三段 [0,b]，b = maxHp/3；
//   段内剩余 = 总血减去该段以下的血量。两个函数互为逆运算，game.hp 永远落回 0..bandMax。
function _engBandOf(b) { // 当前所在段 0..2（0=满血那条，2=最后一条）
  if (!(b.bandMax > 0)) return 0;
  return _engClamp(Math.floor((b.maxHp - b.hpTotal) / b.bandMax), 0, 2);
}
function _engSegHp(b) { // 当前段内剩余（= UI 画填充用的 hp）
  if (!(b.bandMax > 0)) return 0;
  return _engClamp(b.hpTotal - (2 - b.bandBreak) * b.bandMax, 0, b.bandMax);
}

function _engBossHurt(dmg, isUlt) { // 内部：Boss 唯一承伤入口（攻击/星陨/连斩都走这里；五态免伤+v7 blink 隐身免伤）
  // v13 §四：isUlt=true 仅限大招（U 星陨 / O 连斩）——它决定能不能破 parry 架势。
  const b = game.boss, p = game.player;   // v20：秤的方位判定要读玩家位置（此前漏声明，打 kind8 必 ReferenceError）
  if (!b || b.state === 'dormant' || b.state === 'intro' || b.state === 'enrage'
        || b.state === 'dying' || b.state === 'dead' || b.state === 'revive'
        || ((b.state === 'blinkCast' || b.state === 'mirrorCast') && b.hidden)) return false; // v7 §6.3：blink 隐身期免伤；v7.9：revive 假死期免伤；v13：mirror 隐身期免伤
  // v12 §一.7：核心护盾期本体全免伤——只闪白 + 金属音提示「打错目标了」，一滴血都不掉。
  if (b.coreOn) { b.flashT = 0.08; game.sfxQueue.push('clank'); return false; }
  /* v20 终末之钟：曲谱的非休止符拍**完全免伤**，不做"减伤"。
     减伤（哪怕 ×0.12）玩家会看到血条还在动，于是继续埋头砍；免伤才逼他抬头看曲谱。
     这是全作唯一一只"现在打它没用"的 Boss，也是唯一一只可以背下来的。
     ⚠️ 判定必须按**当前状态**，不能按 scoreI：_engBossScore 选完招就把 scoreI 指向下一拍，
     用它当"当前拍"会整体错开一格——实测表现是「休止符免伤、钟锤反而能打」，
     也就是玩家被要求在最危险的一拍上去输出，机制正好反过来（v20.1 修）。 */
  if (b.kind === 11 && b.state !== 'rest' && b.state !== 'stagger' && !(b.breakT > 0)) {
    b.flashT = 0.06; game.sfxQueue.push('clank'); return false;
  }
  const T = _engBossTable(b.kind || 0); // v7 §6：P2 线/掉落表读表
  /* ---- v13 §四：反伤架势（必须放在 coreOn 之后、正常扣血之前） ----
     普通攻击打上去一滴血不掉、反伤 1 心给玩家（惩罚无脑连打）；
     大招打上去是「破招」：解除架势 + 大破绽 + 2.4s 破防窗口，这一击照常结算伤害。 */
  if (b.parryOn) {
    const P = T.parry || BAL.boss5.parry;
    if (!isUlt) {
      // 架势保持到 dur 结束（退出只有一条路：parryCast 里 b.t >= dur），这里只做反弹
      b.flashT = 0.08;
      game.sfxQueue.push('clank');
      _engHurtPlayer(b.x + b.w / 2, P.reflect || 1);      // 反弹 1 心（护盾/无敌帧照常生效）
      _engFloat(b.x + b.w / 2, b.y - 6, '反弹', '#f8d048', 1);
      _engAddParts(b.x + b.w / 2, b.y + b.h / 2, 8, '#f8d048', 90, 180);
      return false;
    }
    b.parryOn = false;
    b.state = 'stagger'; b.staggerDur = (T.stagger || 1.5) * 1.6; b.t = 0;
    b.breakT = P.breakT || 2.4;
    b.comboQ = []; b.comboN = 0; b.vx = 0;
    _engFloat(b.x + b.w / 2, b.y - 6, '破招!', '#f8d048', 1);
    game.sfxQueue.push('bossbreak');
    _engShake(8, 0);
    _engAddParts(b.x + b.w / 2, b.y + b.h / 2, 18, '#f8d048', 120, 240);
  }
  /* v10 破绽期 ×1.5；v13 §五 破防窗口 ×2.0（优先）。只改内部 real，不动 b.hp 派生值。 */
  const mul = (b.breakT > 0) ? 2.0 : (b.state === 'stagger' ? 1.5 : 1);
  let real = mul === 1 ? dmg : Math.max(1, Math.round(dmg * mul));
  /* ==================== v20 地图二 · 承伤侧的三个机制 ====================
     三只 Boss 的差异全在"这一下算不算数 / 算多少"，所以钩子只能挂在这里——
     挂在攻击路径上会漏掉星陨/连斩/法师弹体三条支线。 */

  /* ① 双生天秤：同侧连击会把血偷回去，左右交替才是正解。
     side 取「玩家相对 Boss 中心」——所以玩家的解法天然是"穿到另一边"，不用额外教。 */
  if (b.kind === 8 && T.skew && p) {
    const SK = T.skew;
    const pcx = p.x + p.w / 2, bcx = b.x + b.w / 2;
    const side = pcx < bcx ? -1 : 1;
    const alt = b.skew !== 0 && Math.sign(b.skew) !== side;
    if (alt && Math.abs(pcx - (b.lastPcx === undefined ? pcx : b.lastPcx)) >= 8) {
      // 真换边：玩家自己穿身（位移 ≥8px）。Boss 自己走位造成的「看起来换边」不算——
      // 否则站桩玩家靠 Boss 移动白吃 ×1.25，机制形同虚设（机器人实测站桩反而最快）。
      b.skew = side;                                   // 换边：连击清零并从这一侧重新算
      real = Math.max(1, Math.round(real * (SK.goodMul || 1.25)));   // 「对秤」奖励
      _engFloat(b.x + b.w / 2, b.y - 4, '对秤', '#f8d048', 0);
    } else if (alt) {
      // 位移不足：Boss 移动导致的侧向翻转。不给奖励，但连击**继续累计**——
      // 否则站桩玩家的失衡计数被稀释（6 刀才触发一次），惩罚漏气。
      b.skew += side;
    } else {
      b.skew += side;
      if (Math.abs(b.skew) >= (SK.max || 3)) {
        // 失衡：秤向这一侧倾斜——这一击只吃 40%（站桩 DPS 腰斩，换边才有输出），
        // 并偷回 3% 总血作为可见惩罚（不跨段，口径同召唤回血）。
        // 注意不取整、不设下限：max(1,round(0.4)) 会让无装玩家（每刀 1~2 血）完全吃不到减伤。
        real = real * (b.phase === 2 ? 0.1 : (SK.stallMul || 0.2));   // v20.3：P2 失衡减伤加深 0.2→0.1（站桩在末段更亏，触发频率不变）
        // 失衡的真正獠牙：晃动吞掉破绽。站桩玩家的 DPS 大头是破绽期爆发（×1.5/×2.0），
        // 若失衡只减伤不吞破绽，破绽期伤害照样打满，惩罚被完全盖过（机器人实测站桩不慢反快）。
        if (b.state === 'stagger' || b.breakT > 0) {
          b.state = 'recover'; b.staggerDur = 0; b.breakT = 0; b.t = 0;
          _engFloat(b.x + b.w / 2, b.y - 16, '破绽消失', '#f8d048', 0);
        }
        const ceil = (3 - b.bandBreak) * b.bandMax;
        const back = Math.min(b.maxHp * (SK.healPct || 3) / 100, Math.max(0, ceil - b.hpTotal));
        b.hpTotal += back; b.hp = _engSegHp(b); b.skew = 0;
        b.flashT = 0.2;
        _engFloat(b.x + b.w / 2, b.y - 8, '失衡 ' + (back > 0 ? '+' + Math.round(back) : ''), '#f86048', 1);
        _engAddParts(b.x + b.w / 2, b.y + b.h / 2, 12, '#f86048', 90, 190);
        game.sfxQueue.push('bossbreak');
      }
    }
    b.lastPcx = pcx;                                     // 每击记录玩家位置，供下一击判「真换边」
  }

  /* ② 终末之钟：曲谱。非休止符在函数开头已免伤；休止符（rest 态）额外 ×restMul。 */
  if (b.kind === 11 && T.score && b.state === 'rest')
    real = Math.max(1, Math.round(real * (T.score.restMul || 1.6)));

  /* ③ 余烬回响：把这一下的伤害记成玩家身上的热量（记账用 real，破绽/破防加倍的热量也算进去——
     "打得更狠更快烧穿"是这条机制唯一自洽的口径）。 */
  if (b.kind === 7 && T.heat) {
    // v20.3：P2 烧得更狠（perDmg ×1.25）——怒火随段位升温，压热量的运营在 P2 更紧。
    game.heat = Math.min(T.heat.cap, (game.heat || 0) + real * T.heat.perDmg * (b.phase === 2 ? 1.25 : 1));
    game.heatT = 0;
  }

  if (b.state === 'quellCast') b.quellDmg = (b.quellDmg || 0) + real;
  b.lastDmg = real;                    // 供调用方显示真实伤害（浮字不再显示被放大的旧值）
  b.hpTotal -= real; b.flashT = 0.12;  // v8.0：扣的是总血，段内 hp 由它派生
  game.hitStop = Math.max(game.hitStop, _engHitStop); // v5 §1.6：Boss 承伤 hit-stop 同步 0.10
  game.shake = Math.max(game.shake, 3);
  game.sfxQueue.push('bosshit');
  if (b.hpTotal > 0) {
    const nb = _engBandOf(b);            // 这一击跨过了段界吗
    if (nb > b.bandBreak) { // ===== v8.0 阶段切换：不回血，只播演出 + 清场，血条接着往下掉 =====
      // 段界演出唯一目的：给玩家一个「它换招了」的读招窗口，并清掉残留弹幕/贴地波——
      // 不清的话刚跨段那一秒会被上一阶段的存货当场打死，这是最典型的一类「交互有问题」。
      b.bandBreak = nb; b.bandFlashT = 1.0;
      b.state = 'revive'; b.t = 0; b.vx = 0; b.vy = 0; b.hidden = false;
      b.parryOn = false;                    // v13：跨段清理反伤架势（revive 期不得继续反弹）
      b.comboQ = []; b.comboN = 0; b.staggerDur = 0; b.pullT = 0; // v10：跨段清连段状态（旧队列不得跨段继续）
      game.bullets = []; game.waves = [];
      game.hazards = []; // v10：跨段同样清场——刚跨段那一秒被上一阶段残留的陨石/地刺打死是最伤的挫败
      game.shake = 10; game.sfxQueue.push('roar');
      _engFx(b.x + b.w / 2, b.y + b.h / 2, { ring: 1, r: 6, r1: 52, life: 0.45, color: '#f86020' });
      _engAddParts(b.x + b.w / 2, b.y + b.h - 8, 18, '#f8d048', 130, 240);
      _engFloat(b.x + b.w / 2, b.y - 6, '阶段 ' + b.bandBreak + '/3', '#f8d048', 1);
      // 每跨一段掉 1 件（drop2 权重）+ 必掉 1 颗回复心：跨段是玩家在这一战里唯一确定能拿到的补给，
      // 只靠召唤物 30% 掉心的话，30 秒窗口里可能一颗都没有——那是「打了没回报」。
      if (game.gearDrops.length < _engGearCap)
        game.gearDrops.push(_engMkGear(b.x + b.w / 2 - 5, b.y + b.h - 16, _engSlot(), _engRollTier(BAL.gear[T.drop2])));
      game.drops.push({ x: b.x + b.w / 2 - 4, y: b.y + 8, w: 8, h: 8, vy: -120, life: 9 });
    }
    b.hp = _engSegHp(b);
    return true;
  }
  b.hpTotal = 0; b.hp = 0; b.bandBreak = 2; b.state = 'dying'; b.t = 0;   // 第三段打空=真死
  // v6 波2 §2①：Boss 掉落——进入 dying 瞬间生成（levelClear 在死亡演出后才触发，此处先掉，
  // 玩家可在演出期内拾取；漏捡由 levelClear 开头的 H4 兜底转 pickups）。第 1 件必掉（T.drop1 权重）、
  // 第 2 件 30%（bossExtra，T.drop2 权重）；生成位置 = Boss 中心 ±24/14、脚上 14px；池满 ≥6 跳过（H3）。
  // v7 §6.5：掉落表名读表（kind1='boss1'/'boss2' 收编）。
  if (game.gearDrops.length < _engGearCap)
    game.gearDrops.push(_engMkGear(b.x + b.w / 2 - 24, b.y + b.h - 14, _engSlot(), _engRollTier(BAL.gear[T.drop1])));
  if (Math.random() < BAL.gear.bossExtra && game.gearDrops.length < _engGearCap)
    game.gearDrops.push(_engMkGear(b.x + b.w / 2 + 14, b.y + b.h - 14, _engSlot(), _engRollTier(BAL.gear[T.drop2])));
  game.bullets = []; game.waves = []; game.hazards = []; game.shake = 10; return true; // 死亡优先：大伤害一刀斩不得被狂暴吸收卡 1 血
  // v10：场地危险物随 Boss 真死一起清空（死亡演出 2.2s 内玩家还要跑过去捡装备，不能被残留陨石砸死）
  // v7.9：P2（狂暴 + p2Add 新招）不再按血量百分比切，改由「进入最后一段」触发——
  // 见 _engUpdateBoss 的 revive 收尾（bandBreak>=2 → enrage）。T.p2At 保留在表里但已不消费。
}

function _engBossPhysX(dt, b) { // 内部：Boss X 轴解算（撞墙返回 true）——沿用玩家先X后Y惯例
  b.x += b.vx * dt;
  const y0 = Math.floor(b.y / _engTile), y1 = Math.floor((b.y + b.h - _engEps) / _engTile);
  if (b.vx > 0) { const tx = Math.floor((b.x + b.w - _engEps) / _engTile);
    for (let ty = y0; ty <= y1; ty++) if (game.level.solid(tx, ty, game.switchState)) { b.x = tx * _engTile - b.w; return true; } }
  else if (b.vx < 0) { const tx = Math.floor(b.x / _engTile);
    for (let ty = y0; ty <= y1; ty++) if (game.level.solid(tx, ty, game.switchState)) { b.x = (tx + 1) * _engTile; return true; } }
  return false;
}

function _engBossNovaRing(b, deg, v, n) { // 内部：环向放射弹（第二环 deg=22.5 转角）；v6 §F 弹速收编、v7 §6 改读本 Boss 表
  // v7.9：第三参 v 可覆盖弹速——halo（92，慢）/dive（105）都复用本发射器，
  // 坚持「一种视觉 = 一种判定」，不引入新弹种，玩家看到的每一颗星弹规则都相同。
  // v20：第四参 n 可覆盖弹数（缺省 8）——终末之钟的 chime 用 6 向：8 向在 3× 下缝太小，
  // 慢弹也穿不过去；6 向把缝拉到 60°，才符合"走位穿缝"而不是"贴边硬挤"。
  const T = _engBossTable(b.kind || 0);
  const bcx = b.x + b.w / 2, bcy = b.y + 20, spd = v || T.nova.v;
  const cnt = (n && n > 2) ? n : (T.nova.n || 8), step = 360 / cnt;   // v20.3：n 可由各 Boss 表的 nova.n 覆盖（环密度即性格）
  for (let i = 0; i < cnt; i++) { const a = (i * step + deg) * Math.PI / 180;
    game.bullets.push({ x: bcx - 4, y: bcy - 4, w: 8, h: 8,
      vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, star: true }); }
}

function _engBossSummon(T) { // 内部：v7 §6.2 参数化召唤（type/n/off 全读表；实体走 _engMkEnemy 工厂）
  // kind1 表 {type:'slime',n:2,off:[-40,40]} 与现行内联史莱姆构造字段等价（H5）：工厂产出为其超集——
  // 多 elite:false/face:-1/guardDown:false/ax/ay/amp/frq 冗余字段，slime 路径不消费→行为等价；
  // y 由工厂锚定 py-2（脚底 py+14，较原 -10 高 2px，重力当帧落稳）；t/ai.cd 相位公式同源确定性。
  // _v6_loot_test.js ② L7 Boss 掉落采样复跑核对零回归。
  const b = game.boss, L = game.level, S = T.summon;
  b.leechAcc = 0; // v12：每次召唤重置「本次累计回血」（leechCap 是单次累计上限，不跨召唤累积）
  for (let i = 0; i < S.n; i++) {
    const e = _engMkEnemy(S.type, b.x + b.w / 2 + S.off[i] - 8, b.y + b.h - 16, false);
    e.hp *= _engBossMinionHpMul; // v10：倍率已改 1（基础血 ×3 后不再叠加 Boss 关加成）；保留调用点作为未来挂点
    if (S.hp) e.hp = S.hp;       // v13.1：表内覆盖召唤体血量（基础血 9 太肉，见 summon 表注释）
    e.vx = _engSign(S.off[i]) * Math.abs(e.vx || BAL.enemy[S.type].spd || 0) || _engSign(S.off[i]) * 28;
    e.summoned = true; // v11：召唤体不计入终点封印的战斗线（enemyTotal 是构造期快照，逻辑对齐）
    e.leech = true;    // v12 §一.2：存活且 leech 的召唤体按 T.summon.leech 给 Boss 回血（先清小怪才断奶）
    L.enemies.push(e);
  }
}

/* ==================== v20 地图二 · 招式结算（单发招在前摇结束那一帧调用）====================
   全部只做三件事：算落点、推实体、结算一次伤害。持续期交给 hazard / entities 自己走，
   Boss 状态机里不留"半招"——这样玩家读到的前摇永远等于「抬手到第一下伤害」的时长。 */

/* ---- 烬（kind 7）：热量体系由玩家侧 game.heat 承载，Boss 只负责点着它 ---- */
function _engM2Heat(dt) { // 内部：热量每帧维护（散热 + 满值自爆）；只在 kind7 在场时跑
  const T = _engBossTable(7), H = T.heat;
  if (game.heat <= 0) { game.heat = 0; return; }
  game.heatT += dt;
  const cool = game.heatT >= H.idleAfter ? H.idleCool : H.cool;
  game.heat = Math.max(0, game.heat - cool * dt);
  if (game.heat < H.cap) return;
  /* 满值自爆：不是 flare 那种"点名"，是玩家自己把壶烧穿了——所以它不挑位置，就炸在脚下。 */
  const p = game.player;
  game.heat = 0; game.heatT = 0;
  game.shake = Math.max(game.shake, 7); game.sfxQueue.push('boom');
  _engFx(p.x + p.w / 2, p.y + p.h / 2, { ring: 1, r: 8, r1: 42, life: 0.34, color: '#f86038' });
  _engAddParts(p.x + p.w / 2, p.y + p.h / 2, 16, '#f86038', 130, 250);
  _engFloat(p.x + p.w / 2, p.y - 8, '烧穿了', '#f86038', 1);
  if (!p.dead) _engHurtPlayer(p.x + p.w / 2, H.burstDmg);
}

function _engB7Flare(b) { // 烬 · 引燃：把玩家身上的热量当场点着（热量不足则打不着）
  const T = _engBossTable(7).flare, p = game.player;
  const h = game.heat || 0;
  if (h < T.minHeat) {                            // ★ 机制核心：压住热量 = 这招白给
    _engFloat(b.x + b.w / 2, b.y - 4, '熄灭', '#8a8a9a', 0.9);
    _engAddParts(b.x + b.w / 2, b.y + b.h / 2, 6, '#5a5a6a', 60, 120);
    return;
  }
  const px0 = p.x + p.w / 2, py0 = p.y + p.h / 2;
  const dmg = 1 + Math.floor(h / 45);             // 30→1 / 45→2 / 90→3：热量越高越疼
  game.heat = 0; game.heatT = 0;
  game.shake = Math.max(game.shake, 6); game.sfxQueue.push('boom');
  _engFx(px0, py0, { ring: 1, r: 6, r1: T.r, life: 0.32, color: '#f8a030' });
  _engAddParts(px0, py0, 14, '#f86038', 130, 240);
  _engFloat(px0, py0 - 10, '引燃 ' + Math.round(h), '#f8a030', 1);
  if (!p.dead && _engCircleRect(px0, py0, T.r, p)) _engHurtPlayer(b.x + b.w / 2, dmg);
}

function _engB7Sear(b) { // 烬 · 灼视线：横贯 220px 的细激光（跳过去）
  const T = _engBossTable(7).sear, p = game.player, L = game.level;
  const by = b.y + b.h - 12, bx = b.x + b.w / 2;
  const dir = (p.x + p.w / 2) < bx ? -1 : 1;
  const WXt = L.w * _engTile;
  let x0 = dir > 0 ? bx : bx - T.len;
  let len = T.len;
  if (x0 < 0) { len += x0; x0 = 0; }              // 贴墙时裁到场地内（不裁会画出边界外）
  if (x0 + len > WXt) len = WXt - x0;
  game.hazards.push({ kind: 'laser', x: x0, y: by - T.w / 2, w: len, h: T.w,
    t: 0, dur: T.dur, dmg: T.dmg, hitCd: 0, dir: dir });
  game.sfxQueue.push('shot'); _engShake(2, 0);
}

function _engB7Lash(b) { // 烬 · 火鞭：贴地短波，235px/s（快于玩家跑速 120 —— 看到就得跳，不能跑）
  const T = _engBossTable(7).lash, p = game.player;
  const dir = (p.x + p.w / 2) < b.x + b.w / 2 ? -1 : 1;
  game.waves.push({ x: b.x + b.w / 2 + dir * 8, y: b.y + b.h - T.h,
    w: T.w, h: T.h, vx: dir * T.v, life: T.life });
  game.sfxQueue.push('slash');
}

/* ---- 秤（kind 8）：机制在 _engBossHurt 里判定方位，招式只做"位移与压制" ---- */
function _engB8Swap(b) { // 秤 · 换位：与玩家交换 x（唯一一只敢主动换位的 Boss）
  const T = _engBossTable(8).swap, p = game.player, L = game.level;
  const WXt = L.w * _engTile;
  const bx = b.x, by = b.y;
  // 交换而不是"传送到玩家处"：玩家会突然站在它原来的位置，而它出现在玩家刚站的地方——
  // 「穿到另一边打」这个动作被反将一军，这是 skew 机制唯一能主动打断的方式。
  b.x = _engClamp(p.x + p.w / 2 - b.w / 2, 4, WXt - b.w - 4);
  b.vx = 0; b.vy = 0;
  p.x = _engClamp(bx + b.w / 2 - p.w / 2, 4, WXt - p.w - 4);
  p.vx = 0; p.vy = 0;
  _engAddParts(p.x + p.w / 2, p.y + p.h / 2, 10, '#f8d048', 100, 200);
  _engAddParts(b.x + b.w / 2, b.y + b.h / 2, 12, '#c8a8ff', 100, 210);
  _engFloat(p.x + p.w / 2, p.y - 8, '换位', '#f8d048', 0.9);
  game.sfxQueue.push('blink'); _engShake(3, 0);
}

/* ---- 茧（kind 9）：卵与网由独立数组承载（不进 hazards——它们要跨招存活，且有自己的进化计时） ---- */
function _engB9Spawn(b) { // 茧 · 产卵：玩家两侧 + 自身脚下各 1 枚
  const T = _engBossTable(9).spawn, p = game.player, L = game.level;
  const hz = game.hazards || (game.hazards = []);
  let nEgg = 0;
  for (const e of hz) if (e.kind === 'egg') nEgg++;
  if (nEgg >= T.cap) return;                      // 场上卵到上限就不再产（防卵海淹人）
  const WXt = L.w * _engTile;
  const spots = [p.x + p.w / 2 - 40, p.x + p.w / 2 + 40, b.x + b.w / 2 - 8];
  for (let i = 0; i < T.n && nEgg < T.cap; i++) {
    const sx = _engClamp(spots[i], 10, WXt - 18);
    const gy = _engGroundY(sx, p.y);
    // hp 随阶位换：卵 2 / 幼虫 3 / 成虫 5。hitSeq 与 hitCd 是受击节奏，不是血量。
    hz.push({ kind: 'egg', x: sx, y: gy - 16, w: 16, h: 16, t: 0, stage: 0,
      hp: T.hp, maxHp: T.hp, stageT: T.stageT, flashT: 0, hitCd: 0 });
    nEgg++;
  }
  game.sfxQueue.push('spit');
}

function _engB9Web(b) { // 茧 · 蛛网：Boss 与玩家之间铺一片（挡移动、挡跳，不挡攻击）
  const T = _engBossTable(9).web, p = game.player, L = game.level;
  const cx = (b.x + b.w / 2 + p.x + p.w / 2) / 2;
  const WXt = L.w * _engTile;
  const x0 = _engClamp(cx - T.w / 2, 0, WXt - T.w);
  const gy = _engGroundY(x0 + T.w / 2, Math.min(b.y, p.y) + 8);
  const hz = game.hazards || (game.hazards = []);
  let nW = 0;
  for (const e of hz) if (e.kind === 'web') nW++;
  if (nW > 4) return;                              // 上限 5 片（不叠成一片无解的减速海）
  hz.push({ kind: 'web', x: x0, y: gy - T.h, w: T.w, h: T.h, life: T.life,
    slow: T.slow, noJump: T.noJump, t: 0 });
  game.sfxQueue.push('spit');
}

/* ---- 喉（kind 10）：吞与吐 ---- */
function _engB10Roar(b) { // 喉 · 反刍：把嘴里的积食全吐回去（喂得越狠，这一下越像弹幕）
  const T = _engBossTable(10).roar, p = game.player;
  const meals = game.mawMeals || (game.mawMeals = []);
  const n = meals.length;
  if (!n) { _engFloat(b.x + b.w / 2, b.y - 4, '空嘴', '#8a8a9a', 0.9); return; }
  const bx = b.x + b.w / 2, by = b.y + 20;
  const base = Math.atan2((p.y + p.h / 2) - by, (p.x + p.w / 2) - bx);
  for (let i = 0; i < n; i++) {
    // 扇开而不是叠成一发：叠起来等于"扣 n 心"，扇开才是"要躲的弹幕"
    const off = (i - (n - 1) / 2) * (T.spread * Math.PI / 180);
    const a = base + off;
    game.bullets.push({ x: bx - 4, y: by, w: 8, h: 8,
      vx: Math.cos(a) * T.v, vy: Math.sin(a) * T.v, star: true });
  }
  meals.length = 0;
  game.sfxQueue.push('roar'); _engShake(4, 0);
}

function _engB10Bite(b) { // 喉 · 咬：近身 34px、2 伤（唯一的高伤害招，逼玩家别贴脸）
  const T = _engBossTable(10).bite, p = game.player;
  const cx = b.x + b.w / 2, cy = b.y + b.h - 14;
  game.sfxQueue.push('bite'); _engShake(3, 0);
  _engAddParts(cx, cy, 10, '#f85888', 110, 200);
  if (!p.dead && _engCircleRect(cx, cy, T.r, p)) _engHurtPlayer(cx, T.dmg);
}

function _engUpdateBoss(dt) { // 内部：Boss 状态机（设计 §2/§3；计时单位秒=帧÷60）
  // v7 §6（R4 核心）：蛟龙/判官与星核巨兽共用本状态机，全部参数读 T=_engBossTable(b.kind)——
  // kind1 表值=现行硬编码逐字收编，L7 行为零变化（_v6_loot_test ②/⑤ 与 gate Boss 冒烟双证）。
  const b = game.boss; if (!b) return;
  const L = game.level, p = game.player;
  const T = _engBossTable(b.kind || 0); // v7 §6：本 Boss 参数表
  b.flashT -= dt; b.t += dt;
  if (b.bandFlashT > 0) b.bandFlashT -= dt;   // v7.9：击破闪白倒计时（UI 读它做整条闪光，不自己计时）
  if (b.quellFlash > 0) b.quellFlash -= dt;   // v12：结界爆发的全屏红闪倒计时（UI 按 >0 叠色）
  if (b.summonCd > 0) b.summonCd -= dt;       // v13.1：召唤冷却递减（任何状态都减）
  // v13 §五：破防窗口每帧递减（任何状态都减，含 stagger/revive——窗口是玩法层计时，不是状态计时）
  if (b.breakT > 0) b.breakT = Math.max(0, b.breakT - dt);
  /* ---- v12 §一.2：召唤物回血（每帧，UI 读 b.leechOn 做血条绿色流动） ----
     口径：n = 存活且 leech 的召唤体数；segCeil = (3-bandBreak)*bandMax —— 回血绝不跨段，
     否则「打掉两段后靠小怪奶回满」会让三段血的设计彻底失效。
     leechCap 是「单次召唤累计上限%」（b.leechAcc 在 _engBossSummon 里归零），防无限奶。 */
  if (b.state !== 'dying' && b.state !== 'dead' && b.state !== 'dormant') {
    let nLeech = 0;
    for (const e of L.enemies) if (e.leech && !(e.dead > 0)) nLeech++;
    const leech = (T.summon && T.summon.leech) || 0;
    if (nLeech > 0 && leech > 0 && b.hpTotal > 0 && b.bandMax > 0) {
      const segCeil = (3 - b.bandBreak) * b.bandMax;
      const capPct = b.maxHp * (((T.summon.leechCap === undefined) ? 6 : T.summon.leechCap) / 100);
      const room = Math.min(segCeil - b.hpTotal, capPct - (b.leechAcc || 0));
      const add = Math.min(b.maxHp * leech / 100 * nLeech * dt, Math.max(0, room));
      if (add > 0) {
        b.hpTotal = Math.min(segCeil, b.hpTotal + add);
        b.leechAcc = (b.leechAcc || 0) + add;
        b.hp = _engSegHp(b);   // UI 只读派生值，回血同样落回段内 0..bandMax
      }
    }
    // leechOn：有奶源向 1 收敛、断了向 0 衰减（4/s 线性，UI 做绿光淡入淡出）
    b.leechOn = _engClamp((b.leechOn || 0) + (nLeech > 0 ? 4 : -4) * dt, 0, 1);
  }
  const pcx = p.x + p.w / 2, bcx = b.x + b.w / 2;

  switch (b.state) {
  case 'dormant':                                // 沉睡：无物理（出生即按锚点落地，见 _engMkBoss）
    if (Math.abs(pcx - bcx) < T.actDist) {       // v7：激活半径读表（三表同值 176，零行为变化）
      b.state = 'intro'; b.t = 0; game.sfxQueue.push('roar'); game.shake = 4;
    } break;

  case 'intro':
    if (b.t >= 1.8) { b.state = 'idle'; b.t = 0; } break;   // 演出期无敌（_engBossHurt 已挡）

  case 'idle': {
    b.face = pcx < bcx ? -1 : 1;
    // v20.3：stalk（地图二，全地板场地）——待机不再罚站：远了逼近，贴身也缓步施压，
    //   否则玩家一贴上来它就站成木桩。无 stalk 的地图一 Boss 保持旧行为
    //   （>140 才走：它们的场地有坑有沟，全程追人会把 Boss 自己追下沟）。
    const gapIdle = Math.abs(pcx - bcx) - b.w / 2 - p.w / 2;
    if (T.stalk ? gapIdle > 10 : Math.abs(pcx - bcx) > 140)
      b.vx = b.face * T.walk[b.phase - 1]; // 缓步逼近/施压（walk 读表）
    else b.vx = 0;
    _engBossPhysX(dt, b);
    if (b.t >= T.idleT[b.phase - 1]) _engBossPick(b); // idleT 读表
    break; }

  case 'windup':
    b.vx = 0; b.face = pcx < bcx ? -1 : 1;
    if (b.next === 'leap') { if (b.t >= _engBossDur('leap', b.phase)) { // 起跳参数在前摇结束瞬间取
        b.landX = _engClamp(pcx, bcx - T.leap.clamp, bcx + T.leap.clamp);
        b.vx = (b.landX - bcx) / T.leap.T; b.vy = -T.leap.vy; // g=T.grav 对称抛物线
        b.state = 'leapAir'; b.t = 0; } }
    else if (b.next === 'charge') { if (b.t >= _engBossDur('charge', b.phase)) {
        b.chargeDir = pcx < bcx ? -1 : 1; b.chargeFrom = b.x;
        b.state = 'chargeRun'; b.t = 0; game.sfxQueue.push('roar'); } }
    else if (b.next === 'barrage') { if (b.t >= _engBossDur('barrage', b.phase)) {
        b.state = 'barrageFire'; b.t = 0; b.fireN = 0; } }
    else if (b.next === 'summon') { if (b.t >= _engBossDur('summon', b.phase)) {
        b.state = 'summonCast'; b.t = 0;
        b.summonCd = (T.summon && T.summon.cd) || 16;   // v13.1：召唤进入冷却
        _engBossSummon(T); } } // v7 §6.2：召唤工厂化（kind1 slime×2 与内联构造等价，见 _engBossSummon 注）
    else if (b.next === 'nova') { if (b.t >= _engBossDur('nova', b.phase)) {
        b.state = 'novaCast'; b.t = 0; b.fireN = 0; } }
    else if (b.next === 'sweep') { if (b.t >= _engBossDur('sweep', b.phase)) { // v7 §6.3：蛟龙·三段扫尾
        b.state = 'sweepCast'; b.t = 0; b.fireN = 0; } }
    else if (b.next === 'blink') { if (b.t >= _engBossDur('blink', b.phase)) { // v7 §6.3：判官·传送
        b.state = 'blinkCast'; b.t = 0; b.fireN = 0; } }
    else if (b.next === 'scythe') { if (b.t >= _engBossDur('scythe', b.phase)) { // v7 §6.3：判官·镰刀横扫
        b.state = 'scytheCast'; b.t = 0; b.fireN = 0; } }
    else if (b.next === 'breath') { if (b.t >= _engBossDur('breath', b.phase)) { // v7.9：冥古龙·炼狱吐息
        b.state = 'breathCast'; b.t = 0; b.fireN = 0; } }
    else if (b.next === 'halo') { if (b.t >= _engBossDur('halo', b.phase)) {   // v7.9：圣裁者·圣辉轮
        b.state = 'haloCast'; b.t = 0; b.fireN = 0; } }
    else if (b.next === 'dive') { if (b.t >= _engBossDur('dive', b.phase)) {   // v7.9：跳劈（落点甩环）
        b.landX = _engClamp(pcx, bcx - T.leap.clamp, bcx + T.leap.clamp);
        b.vx = (b.landX - bcx) / T.leap.T; b.vy = -T.leap.vy;
        b.state = 'leapAir'; b.t = 0; } }
    /* ---- v10 五个新招：前摇结束进各自的 Cast 态（参数全读表，缺表即不参与轮换） ---- */
    else if (b.next === 'meteor') { if (b.t >= _engBossDur('meteor', b.phase)) {
        b.state = 'meteorCast'; b.t = 0; b.fireN = 0; } }
    else if (b.next === 'spike') { if (b.t >= _engBossDur('spike', b.phase)) {
        b.state = 'spikeCast'; b.t = 0; b.fireN = 0; } }
    else if (b.next === 'homing') { if (b.t >= _engBossDur('homing', b.phase)) {
        b.state = 'homingCast'; b.t = 0; b.fireN = 0; } }
    else if (b.next === 'clone') { if (b.t >= _engBossDur('clone', b.phase)) {
        b.state = 'cloneCast'; b.t = 0; b.fireN = 0; } }
    else if (b.next === 'pull') { if (b.t >= _engBossDur('pull', b.phase)) {
        b.state = 'pullCast'; b.t = 0; b.fireN = 0; b.pullT = 0; } }
    /* ---- v12 五个新交互类型：前摇结束进各自的 Cast 态（spec §一.3~§一.7） ---- */
    else if (b.next === 'quell') { if (b.t >= _engBossDur('quell', b.phase)) {
        b.state = 'quellCast'; b.t = 0; b.fireN = 0; } }
    else if (b.next === 'grab') { if (b.t >= _engBossDur('grab', b.phase)) {
        b.state = 'grabCast'; b.t = 0; b.fireN = 0; } }
    else if (b.next === 'quake') { if (b.t >= _engBossDur('quake', b.phase)) {
        b.state = 'quakeCast'; b.t = 0; b.fireN = 0; } }
    else if (b.next === 'pillar') { if (b.t >= _engBossDur('pillar', b.phase)) {
        b.state = 'pillarCast'; b.t = 0; b.fireN = 0; } }
    else if (b.next === 'core') { if (b.t >= _engBossDur('core', b.phase)) {
        b.state = 'coreCast'; b.t = 0; b.fireN = 0; } }
    /* ---- v13 五种新交互类型：前摇结束进各自的 Cast 态（spec §三~§五） ---- */
    else if (b.next === 'parry') { if (b.t >= _engBossDur('parry', b.phase)) {
        b.state = 'parryCast'; b.t = 0; b.fireN = 0; b.parryOn = true; } }
    else if (b.next === 'mirror') { if (b.t >= _engBossDur('mirror', b.phase)) {
        b.state = 'mirrorCast'; b.t = 0; b.fireN = 0; } }
    else if (b.next === 'push') { if (b.t >= _engBossDur('push', b.phase)) {
        b.state = 'pushCast'; b.t = 0; b.fireN = 0; } }
    else if (b.next === 'bomb') { if (b.t >= _engBossDur('bomb', b.phase)) {
        b.state = 'bombCast'; b.t = 0; b.fireN = 0; } }
    else if (b.next === 'mist') { if (b.t >= _engBossDur('mist', b.phase)) {
        b.state = 'mistCast'; b.t = 0; b.fireN = 0; } }
    else if (b.next === 'totem') { if (b.t >= _engBossDur('totem', b.phase)) {
        b.state = 'totemCast'; b.t = 0; b.fireN = 0; } }
    /* ---- v20 地图二 15 招（kind 7~11）----
       分两类，界线是「有没有持续期」：
       单发招（flare/sear/lash/swap/spawn/web/roar/bite）在前摇结束的那一帧直接结算后进 recover。
         它们没有"持续"语义，硬塞一个 0.2s 的 cast 态只会让前摇读数变模糊——玩家数着预警躲，
         多出来的一段空窗会让"看到抬手→还没炸"的判断失准。
       多段招（weight/beam/swarm/inhale/pendulum/chime/hammer）进各自的 Cast 态，靠 t/fireN 推进。 */
    else if (b.next === 'flare') { if (b.t >= _engBossDur('flare', b.phase)) {
        _engB7Flare(b); b.state = 'recover'; b.t = 0; } }
    else if (b.next === 'sear') { if (b.t >= _engBossDur('sear', b.phase)) {
        _engB7Sear(b); b.state = 'recover'; b.t = 0; } }
    else if (b.next === 'lash') { if (b.t >= _engBossDur('lash', b.phase)) {
        _engB7Lash(b); b.state = 'recover'; b.t = 0; } }
    else if (b.next === 'weight') { if (b.t >= _engBossDur('weight', b.phase)) {
        b.state = 'weightCast'; b.t = 0; b.fireN = 0; } }
    else if (b.next === 'swap') { if (b.t >= _engBossDur('swap', b.phase)) {
        _engB8Swap(b); b.state = 'recover'; b.t = 0; } }
    else if (b.next === 'beam') { if (b.t >= _engBossDur('beam', b.phase)) {
        b.state = 'beamCast'; b.t = 0; b.fireN = 0; } }
    else if (b.next === 'spawn') { if (b.t >= _engBossDur('spawn', b.phase)) {
        _engB9Spawn(b); b.state = 'recover'; b.t = 0; } }
    else if (b.next === 'web') { if (b.t >= _engBossDur('web', b.phase)) {
        _engB9Web(b); b.state = 'recover'; b.t = 0; } }
    else if (b.next === 'swarm') { if (b.t >= _engBossDur('swarm', b.phase)) {
        b.state = 'swarmCast'; b.t = 0; b.fireN = 0; } }
    else if (b.next === 'inhale') { if (b.t >= _engBossDur('inhale', b.phase)) {
        b.state = 'inhaleCast'; b.t = 0; b.fireN = 0; b.mouthOpen = true; } }
    else if (b.next === 'roar') { if (b.t >= _engBossDur('roar', b.phase)) {
        _engB10Roar(b); b.state = 'recover'; b.t = 0; } }
    else if (b.next === 'bite') { if (b.t >= _engBossDur('bite', b.phase)) {
        _engB10Bite(b); b.state = 'recover'; b.t = 0; } }
    else if (b.next === 'pendulum') { if (b.t >= _engBossDur('pendulum', b.phase)) {
        /* v20 修：扇面必须朝玩家那一侧。原来固定 -70°→+70°（画布角，正角朝下）只覆盖右侧，
           玩家站左边等于完全免疫，等于这招一半时间是白放的。开扫时锁一次方向（同 landX 口径），
           躲法随之变成「跑到弧外」或「从它身下绕到背后」——两种都成立，不必二选一。 */
        b.pendDir = (pcx < b.x + b.w / 2) ? -1 : 1;
        b.state = 'pendulumCast'; b.t = 0; b.fireN = 0; b.pendA = 0; } }
    else if (b.next === 'chime') { if (b.t >= _engBossDur('chime', b.phase)) {
        b.state = 'chimeCast'; b.t = 0; b.fireN = 0; } }
    else if (b.next === 'hammer') { if (b.t >= _engBossDur('hammer', b.phase)) {
        // 落点在前摇结束的瞬间锁定玩家位置——起手后往外走一步就能让它砸空（与 leap 的 landX 同口径）
        b.landX = pcx; b.state = 'hammerCast'; b.t = 0; b.fireN = 0; } }
    break;

  case 'leapAir': {
    _engBossPhysX(dt, b);                       // X：可能撞侧墙（跳过横向就贴墙滑）
    b.vy = Math.min(b.vy + T.grav * dt, T.fallV); b.y += b.vy * dt; // Boss 专用重力/落速帽读表
    if (b.vy > 0) { const ty = Math.floor((b.y + b.h - _engEps) / _engTile);
      const x0 = Math.floor(b.x / _engTile), x1 = Math.floor((b.x + b.w - _engEps) / _engTile);
      for (let tx = x0; tx <= x1; tx++) if (L.solid(tx, ty, game.switchState)) {
        b.y = ty * _engTile - b.h; b.vx = 0; b.vy = 0;
        game.shake = 6; game.sfxQueue.push('roar');
        _engAddParts(bcx, b.y + b.h, 16, '#a890f8', 100, 300);
        for (const d of [-1, 1]) game.waves.push({ x: bcx + d * 20, y: b.y + b.h - 10,
          w: 12, h: 10, vx: d * (b.phase === 2 ? 115 : 90), life: 1.2 });   // 双向贴地冲击波（波速沿用现行，工单 §4-3）
        // v7.9 dive：落地额外甩一圈 8 向弹。落点在前摇结束时就锁定了玩家位置（landX），
        // 所以玩家「看到起跳 → 横移一步」就能让环从身边擦过去——有解，不是必吃。
        if (b.next === 'dive' && T.dive) _engBossNovaRing(b, 0, T.dive.ringV);
        b.state = 'recover'; b.t = 0; break; } }
    break; }

  case 'barrageFire': {                          // 轮数/间隔/尾时长/弹速/散射角全读表（§6.2）
    b.face = pcx < bcx ? -1 : 1;
    const want = Math.floor(b.t / T.barrage.pairGap);
    while (b.fireN < want && b.fireN < T.barrage.rounds) {
      for (const off of T.barrage.deg) {         // v7：散射角读表（kind1=[-8,8] 收编；蛟龙 −18/0/+18；判官 −10/0/+10）
        const ang = Math.atan2((p.y + p.h / 2) - (b.y + 18), pcx - (bcx)) + off * Math.PI / 180;
        game.bullets.push({ x: bcx - 4, y: b.y + 14, w: 8, h: 8,
          vx: Math.cos(ang) * T.barrage.v, vy: Math.sin(ang) * T.barrage.v, star: true }); // star=true: ui 画星弹
      }
      game.sfxQueue.push('shot'); b.fireN++;
    }
    if (b.fireN >= T.barrage.rounds && b.t >= T.barrage.endT) { b.state = 'recover'; b.t = 0; }
    break; }

  case 'chargeRun': {
    b.vx = b.chargeDir * T.charge.v[b.phase - 1]; // charge.v 读表
    const hitWall = _engBossPhysX(dt, b);
    const chargeHits = T.charge.hits || 1;        // v12：总段数（缺省 1 = 旧行为）
    if (hitWall) {
      if ((b.chargeN || 0) + 1 < chargeHits) {    // v12 §一.1：还有段数 → 原地反弹反向再冲，状态不变
        b.chargeN = (b.chargeN || 0) + 1;
        b.chargeDir *= -1;
        b.chargeFrom = b.x; b.t = 0;              // 新一段的行程/计时从撞墙点重新起算（maxX/maxT 都归零）
        b.vx = b.chargeDir * T.charge.v[b.phase - 1];
        _engShake(5, 0);
        _engFx(b.x + (b.chargeDir > 0 ? 0 : b.w), b.y + b.h / 2,
          { ring: 1, r: 4, r1: 30, life: 0.32, color: '#c8b8e8' });
        _engAddParts(b.x + (b.chargeDir > 0 ? 0 : b.w), b.y + b.h / 2, 12, '#c8b8e8', 110, 250);
        game.sfxQueue.push('clank');
      } else {                                    // 段数耗尽 → 破绽（0.7 倍时长：连撞的惩罚略轻，因为更难躲）
        b.vx = 0; b.state = 'stagger'; b.t = 0;
        b.comboQ = []; b.comboN = 0; // v10：撞墙打断连段（旧队列不得在破绽后继续放）
        b.staggerDur = T.stagger * 0.7;
        game.shake = 8; game.sfxQueue.push('roar');
        _engAddParts(b.x + (b.chargeDir > 0 ? b.w : 0), b.y + b.h / 2, 14, '#c8b8e8', 110, 250);
      }
    }
    else if (b.t >= T.charge.maxT || Math.abs(b.x - b.chargeFrom) >= T.charge.maxX) {
      // v12：一段行程跑完（没撞墙）——若还有剩余段数，原地折返继续冲。
      // 必须有这个分支：L19 牛魔王锚点到右墙只有 348px < maxX 340×段数，
      // 只认「撞墙」的话三段撞会退化成一冲一收，signature 招式直接看不到。
      if ((b.chargeN || 0) + 1 < chargeHits) {
        b.chargeN = (b.chargeN || 0) + 1;
        b.chargeDir *= -1; b.chargeFrom = b.x; b.t = 0;
        b.vx = b.chargeDir * T.charge.v[b.phase - 1];
        _engShake(3, 0); game.sfxQueue.push('roar');
        _engFx(b.x + b.w / 2, b.y + b.h - 6, { ring: 1, r: 3, r1: 22, life: 0.28, color: '#c8b8e8' });
      } else if (chargeHits > 1) {
        // v12：多段撞跑完最后一段 → 与撞墙同口径进破绽（hits=1 的老 Boss 仍走 recover，零回归）
        b.vx = 0; b.state = 'stagger'; b.t = 0;
        b.comboQ = []; b.comboN = 0;
        b.staggerDur = T.stagger * 0.7;
        game.shake = 8; game.sfxQueue.push('roar');
        _engAddParts(b.x + b.w / 2, b.y + b.h / 2, 14, '#c8b8e8', 110, 250);
      } else { b.vx = 0; b.state = 'recover'; b.t = 0; }
    }
    break; }

  case 'stagger': { // 输出窗口（v10：破绽期受击 ×1.5，见 _engBossHurt）
    const sd = b.staggerDur || T.stagger;
    if (b.t >= sd) {
      if (b.staggerDur) { b.staggerDur = 0; b.state = 'idle'; b.t = 0; } // v10 连段破绽结束直接回 idle（不再二次抽签）
      else { b.state = 'recover'; b.t = 0; }                              // 冲撞撞墙的旧路径不变
    }
    break; }

  case 'summonCast': if (b.t >= 0.30) { b.state = 'recover'; b.t = 0; } break;

  case 'novaCast': {                              // 0.55s 蓄 + 双环(第二环 t=0.95)——时刻读表
    if (b.fireN === 0 && b.t >= T.nova.t[0]) { _engBossNovaRing(b, 0);   b.fireN = 1; game.sfxQueue.push('shot'); }
    if (b.fireN === 1 && b.t >= T.nova.t[1]) { _engBossNovaRing(b, 22.5); b.fireN = 2; game.sfxQueue.push('shot'); }
    if (b.fireN === 2 && b.t >= T.nova.endT) { b.state = 'recover'; b.t = 0; }
    break; }

  case 'sweepCast': { // v7 §6.3 蛟龙·三段扫尾：rounds 次、间隔 gap，每次双向贴地宽波（wv/life/wh 读表）
    b.vx = 0;
    const want = Math.floor(b.t / T.sweep.gap);
    while (b.fireN < want && b.fireN < T.sweep.rounds) {
      for (const d of [-1, 1]) game.waves.push({ x: b.x + b.w / 2 + d * 24, y: b.y + b.h - T.sweep.wh,
        w: 12, h: T.sweep.wh, vx: d * T.sweep.wv, life: T.sweep.life });
      _engShake(4, 0); game.sfxQueue.push('sweep'); b.fireN++;
    }
    if (b.fireN >= T.sweep.rounds && b.t >= T.sweep.rounds * T.sweep.gap + 0.2) { b.state = 'recover'; b.t = 0; }
    break; }

  case 'blinkCast': { // v7 §6.3 判官·传送：前摇毕→隐身 hideT（免伤免接触）→玩家侧 dx px 处现身→短 recover
    // fireN 相位：0→(入场立即)隐身=1 →(hideT 到点)现身=2（与 barrageFire/novaCast 的 fireN 惯例同构；
    // windup 进入本状态时置 b.fireN=0）
    b.vx = 0;
    if (b.fireN === 0) { b.fireN = 1; b.hidden = true;
      _engFx(b.x + b.w / 2, b.y + b.h / 2, { ring: 1, r: 4, r1: 26, life: 0.3, color: '#b060f0' });
      game.sfxQueue.push('blink'); }
    if (b.fireN === 1 && b.t >= T.blink.hideT) { // 现身：保持相对侧（Boss 在左则落到玩家左侧 dx 处）
      b.fireN = 2;
      const pcx2 = game.player.x + game.player.w / 2, side = (b.x + b.w / 2) <= pcx2 ? -1 : 1;
      b.x = _engClamp(pcx2 + side * T.blink.dx - b.w / 2, 16, game.level.w * _engTile - b.w - 16);
      b.hidden = false; b.flashT = 0.12; b.face = side > 0 ? 1 : -1;   // 现身面向玩家（§6.3 原式逐字；该式与
      // 其行内注释存在符号出入——face 会在下个 idle/scytheCast 重算为面向玩家，见交付说明裁决记录）
      _engFx(b.x + b.w / 2, b.y + b.h / 2, { ring: 1, r: 4, r1: 30, life: 0.35, color: '#b060f0' });
      game.sfxQueue.push('blink');
    }
    if (b.t >= T.blink.hideT + T.blink.after) { b.state = 'recover'; b.t = 0; b.fireN = 0; b.hidden = false; }
    break; }

  case 'scytheCast': { // v7 §6.3 判官·镰刀横扫：面朝侧发射宽刃波（wv/life/w/h 读表）+ 0.25s 后收招
    b.vx = 0;
    if (b.fireN === 0) { b.fireN = 1; b.face = pcx < bcx ? -1 : 1;
      game.waves.push({ x: b.x + (b.face > 0 ? b.w : -T.scythe.w), y: b.y + b.h - T.scythe.h - 4,
        w: T.scythe.w, h: T.scythe.h, vx: b.face * T.scythe.wv, life: T.scythe.life });
      game.sfxQueue.push('sweep'); _engShake(3, 0); }
    if (b.t >= 0.25) { b.state = 'recover'; b.t = 0; }
    break; }

  case 'revive': { // v7.9 段击破后的假死复活：0.9s 跪地→站起；期间免伤免接触（_engBossHurt / 接触判定都挡）
    b.vx = 0;
    if (b.t >= (T.revive || 0.9)) {
      b.flashT = 0.12;
      if (b.bandBreak >= 2 && b.phase === 1) { // 进入最后一段 = 狂暴（p2Add 新招 + p2WindMul 前摇缩短）
        b.phase = 2; b.state = 'enrage'; b.t = 0; game.sfxQueue.push('roar'); game.shake = 6;
      } else { b.state = 'idle'; b.t = 0; }
    }
    break; }

  case 'breathCast': { // v7.9 冥古龙·炼狱吐息：贴地三段双向推进波（波高 14px，跳上台即躲）
    b.vx = 0; b.face = pcx < bcx ? -1 : 1;
    const want = Math.floor(b.t / T.breath.gap);
    while (b.fireN < want && b.fireN < T.breath.rounds) {
      for (const d of [-1, 1]) game.waves.push({ x: b.x + b.w / 2 + d * 22, y: b.y + b.h - T.breath.wh,
        w: 12, h: T.breath.wh, vx: d * T.breath.wv, life: T.breath.life });
      game.sfxQueue.push('sweep'); _engShake(4, 0); b.fireN++;
    }
    if (b.fireN >= T.breath.rounds && b.t >= T.breath.rounds * T.breath.gap + 0.2) { b.state = 'recover'; b.t = 0; }
    break; }

  case 'haloCast': { // v7.9 圣裁者·圣辉轮：三圈 8 向弹，逐圈转 15°，弹速慢（92）以便穿缝
    b.vx = 0;
    for (let i = 0; i < T.halo.t.length; i++)
      if (b.fireN === i && b.t >= T.halo.t[i]) {
        _engBossNovaRing(b, i * 15, T.halo.v); b.fireN = i + 1; game.sfxQueue.push('shot');
      }
    if (b.fireN >= T.halo.t.length && b.t >= T.halo.endT) { b.state = 'recover'; b.t = 0; }
    break; }

  /* ==================== v10：五个新招的 Cast 态 ====================
     设计口径（照造梦西游）：① 每招前摇 ≥0.5s 且落地前有 0.85s 预警圈；② 全部从场地生成，
     不是从 Boss 身上发出——玩家不能再靠「站远」免疫；③ 伤害统一 1，走 _engHurtPlayer（护盾/无敌帧有效）。 */
  case 'meteorCast': { // ① 陨石雨：抬手指天（windup 0.7s）→ 每 0.28s 在玩家「当时」位置落一颗（不追踪）
    b.vx = 0; b.face = pcx < bcx ? -1 : 1;
    const M = T.meteor, wantM = Math.floor(b.t / M.gap);
    while (b.fireN < wantM && b.fireN < M.n) {
      const mx = _engClamp(pcx, 24, L.w * _engTile - 24);
      const gy = _engGroundY(mx, p.y);   // 落点=玩家当前所在列的地面（y 取地面顶，warnT>0 时 UI 在此画圈）
      game.hazards.push({ kind: 'meteor', x: mx, y: gy, vy: M.vy, r: M.r, warnT: M.warn });
      game.sfxQueue.push('shot'); b.fireN++;
    }
    if (b.fireN >= M.n && b.t >= M.n * M.gap + 0.30) { b.state = 'recover'; b.t = 0; }
    break; }

  case 'spikeCast': { // ② 地刺：跺地（0.55s）→ 从脚下朝玩家方向依次冒出 4 根，间隔 0.16s
    b.vx = 0;
    const S = T.spike, wantS = Math.floor(b.t / S.gap);
    const dirS = pcx < bcx ? -1 : 1;
    // 步长按「Boss→玩家」的当前距离均分（20~56px/根）：贴脸时不会全挤在脚下，远距离也够得着
    const stepS = _engClamp(Math.abs(pcx - bcx) / (S.n + 1), 20, 56);
    while (b.fireN < wantS && b.fireN < S.n) {
      const sx = bcx + dirS * (20 + b.fireN * stepS);
      const gy = _engGroundY(sx, b.y + b.h - 2);   // 与 Boss 同层的落脚面（玩家跳上台面即可躲）
      game.hazards.push({ kind: 'spike', x: sx, y: gy, h: 0, mh: S.h, t: 0, life: S.life });
      game.sfxQueue.push('sweep'); _engShake(2, 0); b.fireN++;
    }
    if (b.fireN >= S.n && b.t >= S.n * S.gap + 0.35) { b.state = 'recover'; b.t = 0; }
    break; }

  case 'homingCast': { // ③ 追踪弹：蓄力（0.6s）→ 每 0.22s 吐一颗慢速追踪球（78 < 玩家跑速 120）
    b.vx = 0; b.face = pcx < bcx ? -1 : 1;
    const H = T.homing, wantH = Math.floor(b.t / H.gap);
    while (b.fireN < wantH && b.fireN < H.n) {
      const ang = Math.atan2((p.y + p.h / 2) - (b.y + 20), pcx - bcx);
      game.hazards.push({ kind: 'homing', x: bcx - 4, y: b.y + 16,
        vx: Math.cos(ang) * H.v, vy: Math.sin(ang) * H.v, turn: H.turn, life: H.life, t: 0 });
      game.sfxQueue.push('shot'); b.fireN++;
    }
    if (b.fireN >= H.n && b.t >= H.n * H.gap + 0.30) { b.state = 'recover'; b.t = 0; }
    break; }

  case 'cloneCast': { // ④ 分身：一次性分出 n 个幻影（0.85 体型 / 2 血 / 6s），随后立刻收招
    b.vx = 0;
    if (b.fireN === 0) {
      b.fireN = 1;
      const C = T.clone;
      for (let i = 0; i < C.n; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const cw = Math.round(b.w * 0.85), chh = Math.round(b.h * 0.85);
        game.hazards.push({ kind: 'clone',
          x: _engClamp(b.x + b.w / 2 + side * (b.w * 0.55) - cw / 2, 8, L.w * _engTile - cw - 8),
          y: b.y + b.h - chh, w: cw, h: chh, hp: C.hp, face: side, flashT: 0, t: 0, life: C.life,
          vx: 0, vy: 0, spd: (T.charge ? T.charge.v[0] : 250) * 0.7 }); // 简化 charge = 本体 0.7 倍速
      }
      _engFx(bcx, b.y + b.h / 2, { ring: 1, r: 6, r1: 46, life: 0.4, color: '#b060f0' });
      _engShake(4, 0); game.sfxQueue.push('blink');
    }
    if (b.t >= 0.35) { b.state = 'recover'; b.t = 0; }
    break; }

  case 'pullCast': { // ⑤ 吸附：张开 1.2s 力场（半径 140 / 水平力 320），结束时立刻接一记横扫或冲撞
    b.vx = 0; // 拉力期间 Boss 不移动——玩家可以「迎着吸力贴身打」
    if (b.fireN === 0) {
      b.fireN = 1; b.pullT = T.pull.dur;
      const cyP = b.y + b.h / 2;
      game.hazards.push({ kind: 'pull', x: bcx, y: cyP, r: T.pull.r, t: 0, life: T.pull.dur, cx: bcx, cy: cyP });
      game.sfxQueue.push('roar'); _engShake(3, 0);
      _engFx(bcx, cyP, { ring: 1, r: 6, r1: T.pull.r, life: T.pull.dur, color: '#b060f0' });
    }
    b.pullT = Math.max(0, b.pullT - dt);
    if (b.t >= T.pull.dur) {
      /* 力场一收立刻追击：近身 → 横扫（有 scythe 的 Boss）/扫尾，远距离 → 冲撞。
         追击占用「连段第二招」的名额（comboN=1）：前摇 -20%、UI 画红警告；
         同时把队列清空，保证「pull + 追击」= 2 招上限，不会变成三连。 */
      b.next = Math.abs(pcx - bcx) < 100 ? (T.windup.scythe ? 'scythe' : 'sweep') : 'charge';
      b.comboQ = []; b.comboN = 1; b.state = 'windup'; b.t = 0; b.fireN = 0;
      b.chargeN = 0;   // v12：追击转冲撞同样从 0 起
      game.sfxQueue.push('roar');
    }
    break; }

  /* ==================== v12：五个新交互类型的 Cast 态（spec §一.3~§一.7） ====================
     设计口径：每一招要求**不同的正确动作**——打断或进圈（quell）/ 离开正前 46px（grab）/
     跳（quake 26px 高）/ 离圈并绕柱（pillar）/ 转火打核心（core）。伤害上限 2，全部走 _engHurtPlayer。 */
  case 'quellCast': { // ③ 蓄力全屏：生成 ward 结界圈（站圈内安全）→ 蓄力期挨够 breakDmg 即被打断
    b.vx = 0;
    const Q = T.quell || BAL.boss3.quell;   // v12 兜底：表里没配也能跑（用招池控制是否出场）
    if (b.fireN === 0) {
      b.fireN = 1;
      b.quellDmg = 0; b.quellDur = Q.dur;
      const WQ = L.w * _engTile;
      for (let i = 0; i < Q.n; i++) {
        /* v12 实机修正 ×2：原来放「场地 25%/75% 列」，距离 576px——相机跟的是玩家不是 Boss，
           两个结界点都在镜头外，玩家根本不知道安全区在哪。改成以玩家为基准左右各 120px：
           一定同屏、但站在原点不算「已经在圈里」，必须迈一步进去（120px / 2.2s 很从容）。 */
        let wx = _engClamp(pcx + (i === 0 ? -1 : 1) * 120, 24, WQ - 24);
        if (Math.abs(wx - pcx) <= Q.r) wx = _engClamp(pcx + (i === 0 ? -1 : 1) * (Q.r + 60), 24, WQ - 24);
        game.hazards.push({ kind: 'ward', x: wx, y: _engGroundY(wx, p.y), r: Q.r, t: 0, life: Q.dur });
      }
      _engFx(bcx, b.y + 10, { ring: 1, r: 6, r1: 46, life: 0.4, color: '#f8d048' });
      _engShake(4, 0); game.sfxQueue.push('roar');
    }
    b.quellDur = Math.max(0, (b.quellDur || 0) - dt);
    if ((b.quellDmg || 0) >= Q.breakDmg) {             // 打断：激进打法的奖励 = 1.2s 大破绽
      b.quellDmg = 0; b.quellDur = 0;
      _engClearHazards('ward');
      b.state = 'stagger'; b.t = 0; b.staggerDur = 1.2;
      b.breakT = Math.max(b.breakT || 0, 2.0);          // v13 §五：打断=破招，统一开 2.0s 破防窗口
      b.comboQ = []; b.comboN = 0;
      _engFloat(bcx, b.y - 6, '打断!', '#f8d048', 1);
      game.sfxQueue.push('clank'); _engShake(8, 0);
      _engAddParts(bcx, b.y + b.h / 2, 16, '#f8d048', 120, 240);
      break;
    }
    if (b.quellDur <= 0) {                             // 完成：不在任何结界圈内 → 全屏 2 伤
      const safe = _engInWard(p);
      _engClearHazards('ward');
      b.quellFlash = 0.4;                              // UI：全屏 rgba(248,80,48,0.35)
      if (!safe) _engHurtPlayer(bcx, Q.dmg);
      game.shake = 10; game.sfxQueue.push('boom');
      _engFx(bcx, b.y + b.h / 2, { ring: 1, r: 8, r1: 210, life: 0.5, color: '#f85030' });
      b.state = 'recover'; b.t = 0;
    }
    break; }

  case 'grabCast': { // ④ 抓取摔投：首帧一次的正面 reach×h 判定（背后 60px 完全安全）
    b.vx = 0;
    if (b.fireN === 0) {
      b.fireN = 1;
      const G = T.grab || BAL.boss.grab;
      const gbox = { x: b.face > 0 ? b.x + b.w : b.x - G.reach, y: b.y, w: G.reach, h: b.h };
      if (!p.dead && _engAabb(gbox, p)) {
        if (_engHurtPlayer(bcx, G.dmg || 2)) {          // 命中且真的掉血（护盾/无敌帧挡下则不抛飞）
          p.x += b.face * 10;                           // 拉近 10px 再甩出去
          p.vx = -b.face * 220; p.vy = -240;
          p.onGround = false; p.standOn = null; p.jbuf = 0; p.coyote = 0;
          game.hitStop = Math.max(game.hitStop, 0.18);
          game.sfxQueue.push('bosshit'); _engShake(6, 0);
          _engFloat(p.x + 5, p.y - 6, '抓!', '#f85030', 1);
          _engAddParts(p.x + 5, p.y + 7, 12, '#f85030', 110, 200);
        }
      }
      _engAddParts(b.x + (b.face > 0 ? b.w : 0), b.y + b.h / 2, 8, '#f85030', 80, 160);
    }
    if (b.t >= 0.35) { b.state = 'recover'; b.t = 0; }  // 命中与否都走（不滞留）
    break; }

  case 'quakeCast': { // ⑤ 劈地窄高波：26px 高（单跳 53px 可过），普通贴地波跳不过
    b.vx = 0; b.face = pcx < bcx ? -1 : 1;
    const QK = T.quake || BAL.boss2.quake, wantQK = Math.floor(b.t / QK.gap);
    while (b.fireN < wantQK && b.fireN < QK.n) {
      game.waves.push({ x: b.x + (b.face > 0 ? b.w : -QK.w), y: b.y + b.h - QK.h,
        w: QK.w, h: QK.h, vx: b.face * QK.v, life: QK.life, tall: true });
      _engAddParts(b.x + (b.face > 0 ? b.w : 0), b.y + b.h - 2, 10, '#c8a070', 100, 260);
      _engShake(3, 0); game.sfxQueue.push('sweep'); b.fireN++;
    }
    if (b.fireN >= QK.n && b.t >= QK.n * QK.gap + 0.25) { b.state = 'recover'; b.t = 0; }
    break; }

  case 'pillarCast': { // ⑥ 火柱：每 gap 秒在玩家「当时」位置 ± 交错 1 格起一根（红圈预警 0.9s）
    b.vx = 0;
    const PL = T.pillar || BAL.boss6.pillar, wantPL = Math.floor(b.t / PL.gap);
    while (b.fireN < wantPL && b.fireN < PL.n) {
      const pxi = _engClamp(pcx + ((b.fireN % 3) - 1) * _engTile, 16, L.w * _engTile - 16);
      game.hazards.push({ kind: 'pillar', x: pxi, y: _engGroundY(pxi, p.y),
        w: PL.w, h: 0, mh: PL.h, warnT: PL.warn, t: 0, life: PL.life, dmg: PL.dmg || 1 });
      game.sfxQueue.push('sweep'); _engShake(2, 0); b.fireN++;
    }
    if (b.fireN >= PL.n && b.t >= PL.n * PL.gap + 0.35) { b.state = 'recover'; b.t = 0; }
    break; }

  case 'coreCast': { // ⑦ 核心护盾：本体免伤，打掉全部核心才破盾（转 2s stagger）
    b.vx = 0;
    const C = T.core || BAL.boss4.core;
    if (b.fireN === 0) {
      b.fireN = 1; b.coreOn = true;
      const WC = L.w * _engTile;
      for (let i = 0; i < C.n; i++) {
        // v12 实机修正：原「场地 20%/80% 列」在 72 格场地里离 Boss 576px，
        // 两个核心都漂在镜头外——玩家看不到「打哪里破盾」，这招变成无条件罚站。
        // 改成 Boss 两侧 ±150px（同屏可见、跳起攻击够得到），超过 2 个时夹在两侧之间均分。
        const off = C.n > 1 ? (i - (C.n - 1) / 2) * 300 / (C.n - 1) : 0;
        const cxi = _engClamp(bcx + off - 9, 12, WC - 30); // w18 居中
        game.hazards.push({ kind: 'core', x: cxi, y: b.y + 20, w: 18, h: 18, // 悬空：需跳起/远程够到
          r: C.r, hp: C.hp, maxHp: C.hp, t: 0, life: C.life, flashT: 0 });
      }
      game.sfxQueue.push('shield'); _engShake(4, 0);
      _engFx(bcx, b.y + 20, { ring: 1, r: 8, r1: 70, life: 0.45, color: '#8ad8f8' });
    }
    if (!b.coreOn) { b.state = 'recover'; b.t = 0; break; }   // 已破盾（stagger 在受击处已切走）
    let coreAlive = 0;
    for (const e of (game.hazards || [])) if (e.kind === 'core') coreAlive++;
    if (coreAlive === 0) { b.coreOn = false; b.state = 'recover'; b.t = 0; break; } // 外部清场兜底：绝不永久无敌
    if (b.t >= C.life) {                                     // 超时：不破盾，清核心回后摇
      b.coreOn = false; _engClearHazards('core');
      b.state = 'recover'; b.t = 0;
    }
    break; }

  /* ==================== v13：五种新交互类型的 Cast 态（spec §三~§五） ====================
     设计口径与 v12 同构：每一招要求**不同的正确动作**——收手 1.8s 或大招破招（parry）/
     看清再打（mirror）/ 朝 Boss 方向持续跑（push）/ 记住弹两下（bomb）/ 立刻换位置（mist）。
     全部参数 `T.xxx || BAL.<参考表>.xxx` 兜底：v12 踩过「boss6 缺参数对象 → undefined.life 抛异常」。
     伤害一律走 _engHurtPlayer（护盾/无敌帧有效）。 */
  case 'parryCast': { // ⑧ 反伤架势（boss5）：dur 秒内普攻被反弹、大招可破招（判定在 _engBossHurt）
    b.vx = 0; b.face = pcx < bcx ? -1 : 1;
    const PA = T.parry || BAL.boss5.parry;
    if (!b.parryOn) { b.state = 'recover'; b.t = 0; break; }  // 被大招破招（state 已在 _engBossHurt 切成 stagger）
    if (b.t >= (PA.dur || 1.8)) { b.parryOn = false; b.state = 'recover'; b.t = 0; }
    break; }

  case 'mirrorCast': { // ⑨ 真假身（boss3）：本体混进幻影列并隐身免伤，打错爆炸 / 打真身转大破绽
    b.vx = 0;
    const MI = T.mirror || BAL.boss3.mirror;
    if (b.fireN === 0) {
      b.fireN = 1;
      const WXm = L.w * _engTile, slots = [];
      for (let i = 0; i < MI.n; i++) {          // n 具幻影等距排开（±swapOff），贴边按场地夹住
        const off = (i - (MI.n - 1) / 2) * (MI.swapOff || 96);
        slots.push(_engClamp(bcx + off - b.w / 2, 8, WXm - b.w - 8));
      }
      const realIdx = (Math.random() * MI.n) | 0;   // 真身随机挑一具：必须「看清再打」
      for (let i = 0; i < MI.n; i++) {
        game.hazards.push({ kind: 'mirror', x: slots[i], y: b.y, w: b.w, h: b.h,
          t: 0, life: MI.life || 5.0, hp: MI.hp || 1, flashT: 0, real: i === realIdx });
      }
      b.x = slots[realIdx];                     // 本体挪到真身那一具的位置（打真身时 b.x 天然就是它）
      /* v13.1 实机改判：**真身不隐身**。
         原来 hidden=true，三具幻影长得一模一样、真身完全不可见 → 玩家只有 1/3 运气，
         这不是「看清再打」，是抽奖。现在真身照常画（完整五官），幻影是纯剪影 + 紫眼，
         唯一线索是「眼睛颜色」——要看得见才谈得上辨。 */
      b.hidden = false;
      game.sfxQueue.push('blink'); _engShake(4, 0);
      _engFx(bcx, b.y + b.h / 2, { ring: 1, r: 6, r1: 52, life: 0.4, color: '#b060f0' });
    }
    let mirrorAlive = 0;
    for (const e of (game.hazards || [])) if (e.kind === 'mirror') mirrorAlive++;
    if (mirrorAlive === 0) { b.hidden = false; b.state = 'recover'; b.t = 0; break; } // 外部清场兜底
    if (b.t >= (MI.life || 5.0)) {              // 超时保底：绝不能让 Boss 永久隐身
      _engClearHazards('mirror'); b.hidden = false; b.state = 'recover'; b.t = 0;
    }
    break; }

  case 'pushCast': { // ⑩ 推进墙（boss4）：从玩家背向 Boss 的一侧进场，只能朝 Boss 方向持续跑
    b.vx = 0;
    const PU = T.push || BAL.boss4.push;
    if (b.fireN === 0) {
      b.fireN = 1;
      const WXp = L.w * _engTile;
      const dirP = pcx < bcx ? 1 : -1;          // 玩家在 Boss 左边 → 墙从左侧推向右（朝 Boss）
      const gyP = _engGroundY(bcx, b.y + b.h - 2);
      game.hazards.push({ kind: 'pushwall',
        x: dirP > 0 ? -32 - PU.w : WXp + 32,    // 场地该侧边缘外侧 32px（整面墙在镜头外起跑）
        y: gyP - PU.h, w: PU.w, h: PU.h, v: PU.v, dir: dirP,
        warnT: PU.warn || 0.9, dmg: PU.dmg || 1, hitT: 0 });
      game.sfxQueue.push('roar'); _engShake(4, 0);
      _engFx(bcx, b.y + b.h / 2, { ring: 1, r: 6, r1: 44, life: 0.4, color: '#f86020' });
    }
    if (b.t >= 0.35) { b.state = 'recover'; b.t = 0; }   // 墙独立推进，Boss 不陪着站桩
    break; }

  case 'bombCast': { // ⑪ 弹跳炸弹（boss6）：每 gap 秒从 Boss 中心偏上抛一颗，左右交替
    b.vx = 0; b.face = pcx < bcx ? -1 : 1;
    const BM = T.bomb || BAL.boss6.bomb;
    const wantB = Math.floor(b.t / BM.gap);
    while (b.fireN < wantB && b.fireN < BM.n) {
      const dirB = (b.fireN % 2 === 0) ? 1 : -1;
      game.hazards.push({ kind: 'bomb', x: bcx, y: b.y + 8,
        vx: dirB * BM.vx, vy: BM.vy, grav: BM.grav, bounceN: BM.bounce, damp: BM.damp,
        r: BM.r, t: 0, fuse: BM.fuse, dmg: BM.dmg || 1, armed: false });
      game.sfxQueue.push('shot'); b.fireN++;
    }
    if (b.fireN >= BM.n && b.t >= BM.n * BM.gap + 0.35) { b.state = 'recover'; b.t = 0; }
    break; }

  case 'mistCast': { // ⑫ 水雾区（boss2）：一次在玩家两侧 + 脚下各起一团雾（不挡移动不挡攻击）
    b.vx = 0;
    const MS = T.mist || BAL.boss2.mist;
    if (b.fireN === 0) {
      b.fireN = 1;
      const WXs = L.w * _engTile;
      for (let i = 0; i < MS.n; i++) {
        const offM = (MS.off && MS.off[i] !== undefined) ? MS.off[i] : (i - (MS.n - 1) / 2) * 80;
        const mx = _engClamp(pcx + offM, 8, WXs - 8);
        // y = 地面上沿（h 向上长）——落地立即生效，不用等雾「长起来」
        game.hazards.push({ kind: 'mist', x: mx - MS.w / 2, y: _engGroundY(mx, p.y),
          w: MS.w, h: MS.h, t: 0, life: MS.life || 4.0, tickT: 0, dmg: MS.dmg || 0,
          slow: MS.slow || 1 }); // v18：减速系数随参数表下发；v18.1 dmg 缺省 0（纯减速）
      }
      game.sfxQueue.push('blink'); _engShake(3, 0);
    }
    if (b.t >= 0.4) { b.state = 'recover'; b.t = 0; }
    break; }

  case 'totemCast': { // ⑬ 圣像审判（boss5，v16 §三）：玩家左右各升一座圣像，之后交给 hazard 自己走引信
    b.vx = 0;
    const TT = T.totem || BAL.boss5.totem;
    if (b.fireN === 0) {
      b.fireN = 1;
      const WXt = L.w * _engTile;
      for (let i = 0; i < TT.n; i++) {
        // 落点绑「玩家当下位置」而不是 Boss 位置：这招逼玩家离开原地去拆场，绑 Boss 就变成纯背景
        const offT = (TT.off && TT.off[i] !== undefined) ? TT.off[i] : (i - (TT.n - 1) / 2) * 72;
        const mx = _engClamp(pcx + offT, 8, WXt - 8);
        // y = 地面上沿（h 向上长，与 mist 同口径）——UI 只读这组字段画 16×32 的圣像与血量点
        game.hazards.push({ kind: 'totem', x: mx - TT.w / 2, y: _engGroundY(mx, p.y),
          w: TT.w, h: TT.h, hp: TT.hp, maxHp: TT.hp, t: 0, life: TT.fuse,
          r: TT.r, dmg: TT.dmg, flashT: 0 });
      }
      game.sfxQueue.push('blink'); _engShake(3, 0);
    }
    // 出手收招固定 0.45s：生成是一次性的，留短后摇只是为了不让下一招和圣像同帧出现
    if (b.t >= 0.45) { b.state = 'recover'; b.t = 0; }
    break; }

  /* ==================== v20 地图二 · 七个持续型 Cast 态 ====================
     这里只推进"这一招自己的时间线"，伤害判定全部落回 hazard/实体侧——
     与 v12 的 quell/pillar 同一分工：Boss 状态机不持有"还会不会疼"的知识。 */

  case 'weightCast': { // ① 秤·砝码：三枚按 spread 依次落下（[-26,0,26] 扇形封住它正前方）
    b.vx = 0;
    const TW = T.weight || BAL.boss8.weight;
    const WXt = L.w * _engTile;
    const want = Math.floor(b.t / TW.gap);
    while (b.fireN < want && b.fireN < TW.n) {
      const off = TW.spread[b.fireN % TW.spread.length];
      const mx = _engClamp(b.x + b.w / 2 + off, 10, WXt - 10);
      game.hazards.push({ kind: 'weight', x: mx, y: -20, vy: TW.vy, r: TW.r,
        dmg: TW.dmg, warn: TW.warn, warnT: TW.warn, t: 0, fall: false });
      b.fireN++;
    }
    if (b.t >= TW.gap * TW.n + 0.30) { b.state = 'recover'; b.t = 0; }
    break; }

  case 'beamCast': { // ② 秤·横梁：全屏水平激光（跳过去）——与 sear 同实体、不同朝向
    b.vx = 0;
    const TB = T.beam || BAL.boss8.beam;
    if (b.fireN === 0) {
      b.fireN = 1;
      const WXt = L.w * _engTile;
      const y0 = b.y + b.h - 26;   // 横梁压到站立头线：站地面必中，跳起 24px 即过
      game.hazards.push({ kind: 'laser', x: 0, y: y0, w: WXt, h: TB.h, t: 0,
        dur: TB.dur, dmg: TB.dmg, hitCd: 0, dir: 0, beam: true });
      game.sfxQueue.push('roar'); _engShake(4, 0);
    }
    if (b.t >= TB.dur + 0.20) { b.state = 'recover'; b.t = 0; }
    break; }

  case 'swarmCast': { // ③ 茧·虫群：五只小虫贴着地面横穿（低矮、可跳）
    b.vx = 0;
    const TS = T.swarm || BAL.boss9.swarm;
    const dir = (p.x + p.w / 2) < b.x + b.w / 2 ? -1 : 1;
    const gy = _engGroundY(b.x + b.w / 2, b.y);
    const want = Math.floor(b.t / TS.gap);
    while (b.fireN < want && b.fireN < TS.n) {
      game.hazards.push({ kind: 'crawler', x: b.x + b.w / 2 + dir * 10, y: gy - TS.h,
        w: TS.w, h: TS.h, vx: dir * TS.v, dmg: TS.dmg, life: TS.life, t: 0, seed: b.fireN * 1.7 });
      b.fireN++;
    }
    if (b.t >= TS.gap * TS.n + 0.30) { b.state = 'recover'; b.t = 0; }
    break; }

  case 'inhaleCast': { // ④ 喉·吸气：吞飞行物 + 把玩家往回拽（drag），1.6s
    b.vx = 0; b.mouthOpen = true;
    const TI = T.inhale || BAL.boss10.inhale;
    const R2 = TI.r * (b.phase === 2 ? 1.2 : 1);   // v20.3：P2 吸力圈 ×1.2（嘴张得更大）
    const cx = b.x + b.w / 2, cy = b.y + b.h - 22;
    /* ① 吞弹：只有法师有远程（game.shots），骑士靠"被吸过去"感受这一招——
       两者都受影响，但方式不同，这样换角色不用换打法。 */
    const shots = game.shots || [];
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      if (Math.hypot(s.x - cx, s.y - cy) > R2) continue;
      shots.splice(i, 1);
      const meals = game.mawMeals || (game.mawMeals = []);
      if (meals.length < 12) meals.push({ kind: s.kind });
      const ceil = (3 - b.bandBreak) * b.bandMax;
      const cap = b.maxHp * (TI.capPct / 100);
      const room = Math.min(ceil - b.hpTotal, cap - (b.mawHeal || 0));
      if (room > 0) {
        const add = Math.min(b.maxHp * TI.healPct / 100, room);
        b.hpTotal += add; b.hp = _engSegHp(b); b.mawHeal = (b.mawHeal || 0) + add;
      }
      _engAddParts(cx, cy, 6, '#8a58d8', 80, 160);
      _engFloat(cx, cy - 12, '吞', '#8a58d8', 0.7);
      game.sfxQueue.push('pickup');
    }
    /* ② 拽人：朝嘴的方向给一个恒力，速度上限 60px/s（玩家跑速 120，逆着跑一定跑得掉）。
       ✗ 不做成"无法反抗的吸附"——那会让这 1.6s 变成纯挨打时间，玩家只能站着数秒。 */
    if (!p.dead) {
      const dx = cx - (p.x + p.w / 2);
      if (Math.abs(dx) < R2 && Math.abs(p.x + p.w / 2 - cx) > 18) {
        const pull = Math.sign(dx) * Math.min(TI.pull, Math.abs(dx) * 4);
        p.x += pull * dt; p.vx = 0;
      }
    }
    if (b.t >= TI.dur) { b.mouthOpen = false; b.state = 'recover'; b.t = 0; }
    break; }

  case 'pendulumCast': { // ⑤ 钟·钟摆：以脚下为轴，朝玩家那一侧扫 140°（躲法=出弧 或 绕到背后）
    b.vx = 0;
    const TP = T.pendulum || BAL.boss11.pendulum;
    const cx = b.x + b.w / 2, cy = b.y + b.h - 6;
    const dir = b.pendDir || 1;
    const t01 = Math.min(1, b.t / TP.sweep);
    b.pendA = dir * (-70 + 140 * t01);
    if (!p.dead && b.t < TP.sweep && (b.pendHitCd || 0) <= 0) {
      const dx = (p.x + p.w / 2) - cx, dy = (p.y + p.h / 2) - cy;
      const d = Math.hypot(dx, dy);
      if (d < TP.r + 8) {
        const a = Math.atan2(dy, dx) * 180 / Math.PI;
        // 判定带宽 16°：比视觉上的摆锤粗一档，否则 3× 下摆锤扫过却没有判定，玩家会当成穿模
        if (Math.abs(a - b.pendA) < 16) {
          _engHurtPlayer(cx, TP.dmg); b.pendHitCd = 0.5;
        }
      }
    }
    if ((b.pendHitCd || 0) > 0) b.pendHitCd -= dt;
    if (b.t >= TP.sweep + 0.20) { b.state = 'recover'; b.t = 0; b.pendA = 0; }
    break; }

  case 'chimeCast': { // ⑥ 钟·声波：两圈同向环弹，圈间 0.4s（慢弹才能穿缝）
    b.vx = 0;
    const TC = T.chime || BAL.boss11.chime;
    while (b.fireN < TC.t.length && b.t >= TC.t[b.fireN]) {
      _engBossNovaRing(b, b.fireN * 30, TC.v, TC.n);   // 每圈转 30°，避免三圈完全重叠成一条线
      b.fireN++;
      game.sfxQueue.push('storm');
    }
    if (b.t >= TC.endT) { b.state = 'recover'; b.t = 0; }
    break; }

  case 'hammerCast': { // ⑦ 钟·钟锤：从上方砸在 landX（前摇结束时就锁定了玩家位置）
    b.vx = 0;
    const TH = T.hammer || BAL.boss11.hammer;
    if (b.fireN === 0) {
      b.fireN = 1;
      game.hazards.push({ kind: 'hammer', x: b.landX, y: -30, vy: TH.vy, r: TH.r,
        dmg: TH.dmg, warn: TH.warn, warnT: TH.warn, t: 0, fall: false, splash: TH.splash });
    }
    if (b.t >= TH.warn + 0.9) { b.state = 'recover'; b.t = 0; }
    break; }

  case 'rest': { // ⑧ 钟·休止符：站定不动、不出招——这是它唯一吃伤害的窗口（承伤 ×4.0，见 _engBossHurt）
    b.vx = 0;
    // v20.3：P2 渐快（accelerando）——休止窗口缩 20%，曲谱越打越急，背谱的价值在末段兑现
    if (b.t >= (T.score.restBeat || 1.6) * (b.phase === 2 ? 0.8 : 1)) { b.state = 'idle'; b.t = 0; }
    break; }

  case 'recover':  b.parryOn = false;   // v13：离开任何状态的统一兜底（parry 只活在 parryCast）
    // v20.3：stalk Boss 收招期也挪步——收招是玩家最敢贴的时刻，原地罚站等于白给输出窗口
    b.vx = (T.stalk && Math.abs(pcx - bcx) - b.w / 2 - p.w / 2 > 10) ? b.face * T.walk[b.phase - 1] : 0;
    // 注：伪代码 `{...}[b.next] || 0.5` 按 JS 优先级恒真（(b.t>=X)||0.5），此处修正为取值后兜底
    if (b.t >= (T.recover[b.next] || 0.5)) {
      /* v10 连段 / 破绽：
         ① 队列里还有第二招 → 跳过 idle 直接进下一招的 windup（前摇由 _engBossDur 的 comboN 缩 20%）；
         ② 连段放空（comboN>0）→ 强制 0.9s 大破绽（玩家唯一的稳定输出窗口）；
         ③ 单招（comboN=0）→ 30% 概率 0.6s 小破绽，让单招回合也有节奏变化。 */
      if (b.comboQ && b.comboQ.length > 1) {
        b.comboQ.shift(); b.next = b.comboQ[0]; b.comboN++;
        b.state = 'windup'; b.t = 0; b.fireN = 0;
        b.chargeN = 0;   // v12：连段第二招同样从 0 起（进 windup(charge) 归零）
        game.sfxQueue.push('roar'); // 第二招预告（UI 在 comboN>=1 的 windup 画红警告）
      } else {
        if (b.comboQ && b.comboQ.length === 1) b.comboQ.shift();
        if (b.comboN > 0) {
          b.comboN = 0; b.staggerDur = 0.9; b.state = 'stagger'; b.t = 0;
        } else if (Math.random() < 0.30) {
          b.staggerDur = 0.6; b.state = 'stagger'; b.t = 0;
        } else { b.state = 'idle'; b.t = 0; }
      }
    }
    break;

  case 'enrage':   b.vx = 0; if (b.t >= T.enrage) { b.state = 'idle'; b.t = 0; } break;

  case 'dying': {
    b.vx = 0; b.y += 6 * dt;                      // 慢速下沉
    if ((b.t * 18 | 0) !== ((b.t - dt) * 18 | 0)) {         // 每 ~3.3 帧一圈爆炸粒子
      _engAddParts(bcx + (Math.random() * 44 - 22), b.y + Math.random() * 40, 10,
        ['#f8d048', '#f86020', '#48d8e8'][((b.t * 10) | 0) % 3], 110, 60);
      game.shake = Math.max(game.shake, 4);
    }
    if (b.t >= T.dying) {
      if (T.nextKind) { // v7.9 终章双 Boss：第一棒倒下不算通关，第二棒接管同一个 game.boss
        const nb = _engMkBoss(b.homeX + b.w / 2, b.homeY + b.h - _engTile, T.nextKind);
        nb.state = 'intro'; nb.t = 0; nb.face = -1;   // 直接进登场演出（UI 的横幅/名字/血条全跟着换）
        game.boss = nb;
        game.bullets = []; game.waves = []; game.hazards = []; // v10：接力时清场地危险物（第二棒登场不该踩上一棒的陨石）
        game.shake = 12; game.sfxQueue.push('roar');
        _engFx(nb.x + nb.w / 2, nb.y + nb.h / 2, { ring: 1, r: 8, r1: 120, life: 0.7, color: '#fff3c0' });
        _engFloat(nb.x + nb.w / 2, nb.y - 12, '曜光·圣裁者 降临', '#fff3c0', 1);
        return;   // 本帧结束：新 Boss 从 intro 起跑，旧 b 不再是 game.boss
      }
      b.state = 'dead'; levelClear();   // 复用 v2 通关（含彩带粒子；时长读表）
    }
    break; }
  }

  /* 接触伤害（除休眠/演出/死亡态/blink 隐身期）：吃玩家无敌帧（工单 C 伪代码口径；v7 §6.3 追加隐身跳过） */
  if (b.state !== 'dormant' && b.state !== 'intro' && b.state !== 'dying' && b.state !== 'dead'
      && b.state !== 'revive' && !(b.hidden && (b.state === 'blinkCast' || b.state === 'mirrorCast')) // v13：mirror 隐身期同样免接触
      && !p.dead && _engAabb(b, p)) _engHurtPlayer(bcx, T.contactDmg || 1);
}

function _engCircleRect(cx, cy, r, o) { // 内部（v10）：圆 vs 矩形（最近点距离）——陨石/力场判定用
  const nx = _engClamp(cx, o.x, o.x + o.w), ny = _engClamp(cy, o.y, o.y + o.h);
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

/* ==================== v12：新 hazard 的判定辅助（内部） ==================== */
function _engClearHazards(kind) { // 内部（v12）：按 kind 清危险物（ward/pillar/core 共用 game.hazards，无旁路数组）
  const hz = game.hazards;
  if (!hz) return;
  for (let i = hz.length - 1; i >= 0; i--) if (hz[i].kind === kind) hz.splice(i, 1);
}

function _engInWard(p) { // 内部（v12）：玩家是否在任一 ward 结界内（横向 |dx|≤r 且在同一光柱高度带）
  // 「圆心距 > r → 受伤」的口径落在横向上；纵向放宽成 96px 光柱——跳起来仍站在光柱里也算躲住，
  // 否则玩家会看到自己明明在金色柱子里却被全屏打中（判定与视觉不符是最伤信任的 bug 类型）。
  const hz = game.hazards || [];
  if (!p) return false;
  const pcx2 = p.x + p.w / 2, feet = p.y + p.h;
  for (const e of hz) {
    if (e.kind !== 'ward') continue;
    if (Math.abs(pcx2 - e.x) <= e.r && feet <= e.y + 6 && feet > e.y - 96) return true;
  }
  return false;
}

function _engCoreHit(hzArr, e, n) { // 内部（v12）：核心扣血（归零即碎）；返回 true=本次被打碎
  e.hp -= (n || 1); e.flashT = 0.12;
  _engAddStars(e.x + e.w / 2, e.y + e.h / 2, 4, '#8ad8f8');
  game.sfxQueue.push('hit');
  if (e.hp > 0) return false;
  const i = hzArr.indexOf(e);
  if (i >= 0) hzArr.splice(i, 1);
  _engAddParts(e.x + e.w / 2, e.y + e.h / 2, 14, '#8ad8f8', 100, 200);
  _engFx(e.x + e.w / 2, e.y + e.h / 2, { ring: 1, r: 4, r1: 26, life: 0.35, color: '#8ad8f8' });
  game.sfxQueue.push('kill');
  return true;
}

function _engCoreBreakCheck() { // 内部（v12）：核心全破 → 破盾转 2s stagger（本场最长的输出窗口）
  const b = game.boss;
  if (!b || !b.coreOn) return false;
  for (const e of (game.hazards || [])) if (e.kind === 'core') return false;
  b.coreOn = false; b.state = 'stagger'; b.t = 0; b.staggerDur = 2.0;
  b.breakT = Math.max(b.breakT || 0, 2.0);   // v13 §五：破盾=破招，统一开 2.0s 破防窗口
  b.comboQ = []; b.comboN = 0;
  _engFloat(b.x + b.w / 2, b.y - 6, '破盾!', '#f8d048', 1);
  _engFx(b.x + b.w / 2, b.y + b.h / 2, { ring: 1, r: 8, r1: 68, life: 0.5, color: '#8ad8f8' });
  game.shake = 10; game.sfxQueue.push('clank');
  return true;
}

/* ==================== v13：真假身判定（内部） ====================
   mirror 是唯一「可被玩家打掉、又决定 Boss 是否免伤」的 hazard：三处受击入口
   （_engResolveAttack 普攻 / 星陨 U / 连斩 O）只负责 `e.hp -= 1`，结算统一由
   _engMirrorSettle 在 _engUpdateHazards 的收尸处做，避免判定分叉 / 同一具幻影被结算两次。
   兜底双保险：单体 e.t >= e.life 自删；Boss 侧 mirrorCast 再按整组存活数 + 总时长收势——
   任何一条路径断了都会让 b.hidden 卡住 → Boss 永久隐身免伤。 */
function _engMirrorPick(px) { // 内部（v13）：离 px 最近的一具真假身（大招瞄准用）
  let tgt = null, bd = 1e9;
  for (const e of (game.hazards || [])) if (e.kind === 'mirror') {
    const d = Math.abs(e.x + e.w / 2 - px);
    if (d < bd) { bd = d; tgt = e; }
  }
  return tgt;
}

function _engMirrorSettle(e) { // 内部（v13）：真假身**唯一结算点** —— 真身转大破绽，假身爆炸 1 心
  // 只在 _engUpdateHazards 的收尸处调用（与 v12 的 _engCoreBreakCheck 同口径）：
  // 三条受击路径（普攻/星陨/连斩）只负责 `e.hp -= 1`，结算统一在这里做，
  // 否则同一具幻影会被扣两次血、或者在攻击判定里结算后又被 hazard 循环结算一次。
  const b = game.boss;
  const T = b ? _engBossTable(b.kind || 0) : BAL.boss3;
  const M = T.mirror || BAL.boss3.mirror;
  if (e.real) {
    _engClearHazards('mirror');            // 真身已找出，残影一起散（不留「假目标」继续骗人）
    if (b) {
      b.hidden = false;                    // 解除隐身免伤（唯一的解除点之一，另一处是超时）
      b.x = e.x;                           // 本体落回真身那一具的位置（spec §三：b.x 保持该幻影位置）
      b.state = 'stagger'; b.t = 0;
      b.staggerDur = (T.stagger || 1.5) * 1.5;
      b.comboQ = []; b.comboN = 0; b.vx = 0; b.vy = 0; b.parryOn = false;
      _engFloat(b.x + b.w / 2, b.y - 6, '真身!', '#f8d048', 1);
    }
    game.shake = 8; game.sfxQueue.push('bossbreak');
    _engAddParts(e.x + e.w / 2, e.y + e.h / 2, 20, '#b060f0', 130, 240);
    _engFx(e.x + e.w / 2, e.y + e.h / 2, { ring: 1, r: 6, r1: 54, life: 0.45, color: '#b060f0' });
  } else {
    _engHurtPlayer(e.x + e.w / 2, M.popDmg || 1);   // 打错目标 → 爆炸 1 心（护盾/无敌帧照常生效）
    game.shake = 6; game.sfxQueue.push('boom');
    _engFloat(e.x + e.w / 2, e.y - 6, '假的!', '#f85030', 1);
    _engAddParts(e.x + e.w / 2, e.y + e.h / 2, 16, '#b060f0', 120, 240);
    _engFx(e.x + e.w / 2, e.y + e.h / 2, { ring: 1, r: 4, r1: 36, life: 0.35, color: '#b060f0' });
  }
}

/* ==================== v10：Boss 场地危险物（game.hazards） ====================
   五招的实体层，全部「从场地生成」而不是从 Boss 身上发出——玩家不能再靠站远免疫：
     meteor 陨石雨（预警圈 0.85s → 落下 → 冲击波）
     spike  地刺（0→24px 长出，life 1.1s）
     homing 追踪弹（78px/s、转向 1.4rad/s，跑起来就能甩）
     clone  分身（0.85 体型 / 2 血 / 6s，简化 charge 0.7 倍速）
     pull   吸附力场（r140 / 水平力 320，1.2s）
   伤害统一 1，全部走 _engHurtPlayer（护盾/无敌帧照常生效）；所有读侧 (game.hazards || []) 守卫。 */
function _engUpdateHazards(dt) {
  const p = game.player, L = game.level;
  if (!p || !L) return;
  const hz = game.hazards || (game.hazards = []);
  let pullOn = false; // 本帧是否有生效中的力场（决定 p.pullV 是继续充能还是衰减）
  let coreDied = false;                               // v12：本帧有核心碎了 → 循环后统一查破盾
  let mirrorDead = null;                              // v13：本帧被击破的幻影 → 循环后统一结算（唯一结算点）
  for (let i = hz.length - 1; i >= 0; i--) {
    const e = hz[i];
    let dead = false;
    if (e.kind === 'meteor') {
      if (e.warnT > 0) {                       // 预警期：只画圈，不动不伤（UI 按 warnT>0 画落点圈）
        e.warnT -= dt;
        if (e.warnT <= 0) { e.warnT = 0; e.y = -24; game.sfxQueue.push('shot'); } // 预警结束才开始下落
      } else {
        e.y += e.vy * dt;
        const ty = Math.floor((e.y + e.r) / _engTile), tx = Math.floor(e.x / _engTile);
        const hitGround = L.solid(tx, ty, game.switchState);
        if (hitGround) {                       // 落地：震屏 + 双向冲击波（跳起来躲）
          dead = true;
          game.shake = Math.max(game.shake, 6); game.sfxQueue.push('boom');
          _engAddParts(e.x, ty * _engTile, 16, '#f86020', 120, 260);
          _engFx(e.x, ty * _engTile, { ring: 1, r: 4, r1: 30, life: 0.35, color: '#f8b040' });
          for (const d of [-1, 1]) // v10：冲击波射程 0.45s×110≈50px——预警圈（r9）外一步就安全，不是全屏
            game.waves.push({ x: e.x + d * 8, y: ty * _engTile - 10, w: 12, h: 10, vx: d * 110, life: 0.45 });
          if (!p.dead && _engCircleRect(e.x, e.y, e.r, p)) _engHurtPlayer(e.x);
        } else if (e.y > L.h * _engTile + 30) { // 掉出世界（无地面列）
          dead = true;
        } else if (!p.dead && _engCircleRect(e.x, e.y, e.r, p)) { // 空中撞到玩家：直接爆
          dead = true; _engHurtPlayer(e.x);
          game.shake = Math.max(game.shake, 5); game.sfxQueue.push('boom');
          _engAddParts(e.x, e.y, 12, '#f86020', 110, 240);
        }
      }
    } else if (e.kind === 'spike') {
      e.t += dt;
      // v10：0→24px 用 0.27s 长出（90px/s）。判定从 h≥10 才开始——冒头那 3 帧不判伤害，
      // 否则「脚下刚冒 2px」就算命中，玩家按跳跃也来不及，观感是「没看见就掉血」。
      e.h = Math.min(e.mh || 24, e.h + 90 * dt);
      if (e.t >= e.life) dead = true;
      else if (e.h >= 10 && !p.dead && _engAabb({ x: e.x - 5, y: e.y - e.h, w: 10, h: e.h }, p))
        _engHurtPlayer(e.x);                   // 跳起来 / 站到已缩回的位置即可躲
    } else if (e.kind === 'homing') {
      e.t += dt; e.life -= dt;
      if (e.life <= 0) dead = true;
      else {
        const want = Math.atan2((p.y + p.h / 2) - (e.y + 4), (p.x + p.w / 2) - (e.x + 4));
        const cur = Math.atan2(e.vy, e.vx);
        let dh = want - cur; while (dh > Math.PI) dh -= 6.283; while (dh < -Math.PI) dh += 6.283;
        const turn = _engClamp(dh, -e.turn * dt, e.turn * dt);
        const sp = Math.hypot(e.vx, e.vy) || 78;
        e.vx = Math.cos(cur + turn) * sp; e.vy = Math.sin(cur + turn) * sp;
        e.x += e.vx * dt; e.y += e.vy * dt;
        if (L.solid(Math.floor((e.x + 4) / _engTile), Math.floor((e.y + 4) / _engTile), game.switchState)) {
          dead = true; _engAddParts(e.x + 4, e.y + 4, 8, '#b060f0', 70, 160);
        } else if (!p.dead && _engAabb({ x: e.x, y: e.y, w: 8, h: 8 }, p)) {
          dead = true; _engHurtPlayer(e.x + 4);
          _engAddParts(e.x + 4, e.y + 4, 10, '#b060f0', 80, 200);
        }
      }
    } else if (e.kind === 'clone') {
      e.t += dt; e.life -= dt;
      if (e.flashT > 0) e.flashT -= dt;
      if (e.life <= 0 || e.hp <= 0) {
        dead = true; _engAddParts(e.x + e.w / 2, e.y + e.h / 2, 12, '#b060f0', 90, 200);
      } else if (e.t > 0.4) {                  // 0.4s 显形后才开始冲（给玩家读招窗口）
        e.face = (p.x + p.w / 2 < e.x + e.w / 2) ? -1 : 1;
        e.vx = e.face * (e.spd || 170);
        e.x += e.vx * dt;                      // X 轴撞墙即停（不穿墙）
        {
          const y0 = Math.floor(e.y / _engTile), y1 = Math.floor((e.y + e.h - _engEps) / _engTile);
          const tx = e.vx > 0 ? Math.floor((e.x + e.w - _engEps) / _engTile) : Math.floor(e.x / _engTile);
          for (let ty = y0; ty <= y1; ty++) if (L.solid(tx, ty, game.switchState)) {
            e.x = e.vx > 0 ? tx * _engTile - e.w : (tx + 1) * _engTile; e.vx = 0; break; }
        }
        e.vy = Math.min((e.vy || 0) + 1320 * dt, 300);
        e.y += e.vy * dt;
        if (e.vy > 0) {                        // 落地
          const ty = Math.floor((e.y + e.h - _engEps) / _engTile);
          const x0 = Math.floor(e.x / _engTile), x1 = Math.floor((e.x + e.w - _engEps) / _engTile);
          for (let tx = x0; tx <= x1; tx++) if (L.solid(tx, ty, game.switchState)) {
            e.y = ty * _engTile - e.h; e.vy = 0; break; }
        }
        if (!p.dead && _engAabb(e, p)) _engHurtPlayer(e.x + e.w / 2); // 接触 1 伤（可打掉：2 下）
      }
    } else if (e.kind === 'pull') {
      e.t += dt;
      if (e.t >= e.life) dead = true;
      else {
        const dx = e.cx - (p.x + p.w / 2);
        if (!p.dead && Math.abs(dx) <= e.r && Math.abs(dx) > 6) { // 半径内才有拉力：跑出圈即脱身
          pullOn = true;
          p.pullV = _engClamp((p.pullV || 0) + _engSign(dx) * 320 * dt, -180, 180);
        }
        e.fxT = (e.fxT || 0) - dt;
        if (e.fxT <= 0) { e.fxT = 0.10;
          const a = Math.random() * 6.283, rr = e.r * (0.5 + Math.random() * 0.5);
          _engFx(e.cx + Math.cos(a) * rr, e.cy + Math.sin(a) * rr,
            { vx: -Math.cos(a) * 90, vy: -Math.sin(a) * 90, life: 0.22, color: '#b060f0', size: 1 }); }
      }
    /* ---- v12 三种新 hazard ---- */
    } else if (e.kind === 'ward') {   // 结界圈：纯安全区，自身不造成伤害（全屏那一下由 Boss 结算）
      e.t += dt;
      if (e.t >= e.life) dead = true;
      else {                          // 金色上升粒子（UI 画光柱，这边只补演出）
        e.fxT = (e.fxT || 0) - dt;
        if (e.fxT <= 0) { e.fxT = 0.12;
          _engFx(e.x + (Math.random() * 2 - 1) * e.r * 0.7, e.y - 4,
            { vy: -60, life: 0.3, color: '#f8d048', size: 1 }); }
      }
    } else if (e.kind === 'pillar') { // 火柱：预警 → 160px/s 升起 → 持续 life 秒 → 消失
      e.t += dt;
      if (e.warnT > 0) {              // 预警期：只画红圈（UI 按 warnT>0 画倒计时收缩圈）
        e.warnT -= dt;
        if (e.warnT <= 0) { e.warnT = 0; game.sfxQueue.push('boom'); _engShake(3, 0); }
      } else if (e.h < (e.mh || 40)) {
        e.h = Math.min(e.mh || 40, e.h + 160 * dt);   // 升起 160px/s（0.25s 到 40px）
        if (e.h >= 12 && !p.dead && _engAabb({ x: e.x - e.w / 2, y: e.y - e.h, w: e.w, h: e.h }, p))
          _engHurtPlayer(e.x);                        // h≥12 才判伤害：冒头那两帧不算命中
      } else {
        e.life -= dt;
        if (e.life <= 0) dead = true;
        else if (!p.dead && _engAabb({ x: e.x - e.w / 2, y: e.y - e.h, w: e.w, h: e.h }, p))
          _engHurtPlayer(e.x);                        // 升起的柱子是持续危险区：绕开它，别站里面
      }
    } else if (e.kind === 'core') {   // 核心：悬空可打目标（受击判定在 _engResolveAttack / O / U 三处）
      e.t += dt;
      if (e.flashT > 0) e.flashT -= dt;               // 闪白计时归引擎（UI 只读）
      e.fxT = (e.fxT || 0) - dt;
      if (e.fxT <= 0) { e.fxT = 0.18;
        _engFx(e.x + e.w / 2 + (Math.random() * 2 - 1) * 10, e.y + e.h / 2 + (Math.random() * 2 - 1) * 10,
          { vy: -26, life: 0.26, color: '#8ad8f8', size: 1 }); }
      // v12 兜底：任何路径把 hp 扣到 ≤0（星陨/连斩/直接改字段的自检）都在这里统一收尸，
      // 否则 coreCast 的 coreAlive 会把这颗 0 血核心算成"还活着"，Boss 永久免伤。
      if (e.hp <= 0) {
        dead = true; coreDied = true;
        _engAddParts(e.x + e.w / 2, e.y + e.h / 2, 14, '#8ad8f8', 100, 200);
        _engFx(e.x + e.w / 2, e.y + e.h / 2, { ring: 1, r: 4, r1: 26, life: 0.35, color: '#8ad8f8' });
        game.sfxQueue.push('kill');
      }
      // 超时由 coreCast 统一处理（单一真值，避免 hazard 自删后 Boss 仍 coreOn → 永久无敌）
    /* ---- v13 四种新 hazard（spec §三）----
       受击判定：mirror 在 _engResolveAttack / 星陨 / 连斩三处（与 core 同一入口）；
       pushwall / bomb / mist 是纯危险物，不可被打掉，各自带自删条件（绝不留残留）。 */
    } else if (e.kind === 'mirror') { // 真假身：可打，打错爆炸、打真身转大破绽（结算见 _engMirrorSettle）
      e.t += dt;
      if (e.flashT > 0) e.flashT -= dt;
      e.fxT = (e.fxT || 0) - dt;
      if (e.fxT <= 0) { e.fxT = 0.16;
        _engFx(e.x + e.w / 2 + (Math.random() * 2 - 1) * e.w * 0.4, e.y + e.h * 0.4,
          { vy: -30, life: 0.3, color: '#b060f0', size: 1 }); }
      // v13 兜底：任何路径把 hp 扣到 ≤0（普攻/星陨/连斩/自检直接改字段）都在这里统一收尸，
      // 与 v12 core 完全同口径——散在三处结算会出现「0 血幻影还挂在场上」→ Boss 永久隐身。
      if (e.hp <= 0) { dead = true; (mirrorDead || (mirrorDead = [])).push(e); }
      else if (e.t >= e.life) dead = true;   // 单体超时（Boss 侧还有整组超时兜底）
    } else if (e.kind === 'pushwall') { // 推进墙：预警期不动不伤 → 匀速推 → 越过场地另一端自删
      if (e.warnT > 0) {
        e.warnT -= dt;
        if (e.warnT <= 0) { e.warnT = 0; game.sfxQueue.push('roar'); _engShake(4, 0); }
      } else {
        if (e.hitT > 0) e.hitT -= dt;
        e.x += e.dir * e.v * dt;
        const WXh = L.w * _engTile;
        if ((e.dir > 0 && e.x > WXh) || (e.dir < 0 && e.x + e.w < 0)) dead = true;
        else if (!p.dead && _engAabb(e, p) && e.hitT <= 0) {
          e.hitT = 0.8;                                    // 防连帧：一面墙最多每 0.8s 撞一次
          _engHurtPlayer(e.x + e.w / 2, e.dmg || 1);
          // spec §三：命中后无条件朝推进方向甩出去（护盾挡下也照样被墙顶着走，否则会被墙反复碾）
          p.vx = e.dir * 220; p.vy = -180;
          p.onGround = false; p.standOn = null; p.jbuf = 0; p.coyote = 0;
          game.sfxQueue.push('bosshit'); _engShake(5, 0);
          _engFloat(p.x + 5, p.y - 6, '推!', '#f86020', 0);
        }
      }
    } else if (e.kind === 'bomb') { // 弹跳炸弹：弹 bounceN 次落点才定，armed 后 fuse 秒自爆
      if (!e.armed) {
        e.vy += (e.grav || 900) * dt;
        e.x += e.vx * dt; e.y += e.vy * dt;
        const tyb = Math.floor((e.y + e.r) / _engTile), txb = Math.floor(e.x / _engTile);
        const land = e.vy > 0 && L.solid(txb, tyb, game.switchState);
        if (land) {
          e.y = tyb * _engTile - e.r;
          if ((e.bounceN || 0) > 0) {                      // 还有弹跳次数 → 落点会变（本招的记忆点）
            e.bounceN--; e.vy = -e.vy * (e.damp || 0.55);
            _engAddParts(e.x, e.y + e.r, 8, '#c8c8d8', 70, 160);
            game.sfxQueue.push('shot');
          } else { e.vy = 0; e.vx = 0; e.armed = true; e.t = 0; game.sfxQueue.push('blink'); }
        } else if (!p.dead && _engCircleRect(e.x, e.y, e.r, p)) { // 空中直接砸到玩家 → 也爆
          dead = true;
          _engHurtPlayer(e.x, e.dmg || 1);
          game.shake = 7; game.sfxQueue.push('boom');
          _engAddParts(e.x, e.y, 14, '#f86020', 120, 240);
          _engFx(e.x, e.y, { ring: 1, r: 4, r1: 30, life: 0.35, color: '#f8b040' });
        } else if (e.y > L.h * _engTile + 30) dead = true;   // 掉进深坑：自删，不留残留
      } else {
        e.t += dt;
        if (e.t >= (e.fuse || 0.9)) {                        // 引爆（自爆兜底：绝不永久留在场上）
          dead = true;
          if (!p.dead && Math.abs((p.x + p.w / 2) - e.x) < e.r
              && Math.abs((p.y + p.h / 2) - e.y) < e.r) _engHurtPlayer(e.x, e.dmg || 1);
          game.shake = 7; game.sfxQueue.push('boom');
          _engAddParts(e.x, e.y, 18, '#f86020', 130, 250);
          _engFx(e.x, e.y, { ring: 1, r: 4, r1: e.r, life: 0.4, color: '#f8b040' });
        }
      }
    } else if (e.kind === 'mist') { // 水雾区：纯持续伤害区，不挡移动不挡攻击（跑出去即脱身）
      e.t += dt;
      if (e.tickT > 0) e.tickT -= dt;
      if (e.t >= e.life) dead = true;
      else {
        // v18 §一：雾内减速——接触帧刷新标记（0.06s 防抖，大于 2 帧避免边界抖动），
        // 真正的减速发生在玩家移速钳制处（effRun × mistSlow），dash 路径天然绕开
        const inMist = !p.dead && _engAabb({ x: e.x, y: e.y - e.h, w: e.w, h: e.h }, p);
        // v18.1：仅 dmg>0 才走伤害入口——dmg=0 时零伤害零击退不触发无敌帧（纯减速雾）
        if (e.tickT <= 0 && inMist && (e.dmg || 0) > 0) {
          _engHurtPlayer(e.x + e.w / 2, e.dmg);
          e.tickT = e.tick || 0.5;
        }
        if (inMist) { p.mistT = 0.06; p.mistSlow = e.slow || 0.5; }
        e.fxT = (e.fxT || 0) - dt;
        if (e.fxT <= 0) { e.fxT = 0.20;
          _engFx(e.x + 4 + Math.random() * (e.w - 8), e.y - 6,
            { vy: -46, life: 0.55, color: '#48d8e8', size: 1 }); }
      }
    } else if (e.kind === 'totem') { // 圣像审判（v16）：引信到点炸开；被拆掉则安静消失
      e.t += dt;
      if (e.flashT > 0) e.flashT -= dt;
      if (e.hp <= 0) {
        /* 打掉不炸是这招的核心交互——「拆场」必须有正反馈，否则玩家最优解永远是跑开，
           圣像就退化成一个纯位移检查。碎裂反馈只管演出，不碰伤害。 */
        dead = true;
        _engAddParts(e.x + e.w / 2, e.y - e.h / 2, 12, '#f8e8a0', 100, 200);
        _engFx(e.x + e.w / 2, e.y - e.h / 2, { ring: 1, r: 3, r1: 20, life: 0.3, color: '#f8e8a0' });
        game.sfxQueue.push('break');
      } else if (e.t >= e.life) {
        /* 结算只在这里做（攻击路径只扣 hp）：两处结算会让「最后一下打掉」的圣像照样炸。
           圆心取圣像中点——y 是地面线、h 向上长，所以中点是 y - h/2。 */
        dead = true;
        const tcx = e.x + e.w / 2, tcy = e.y - e.h / 2, tr = e.r || 110;
        if (!p.dead && _engCircleRect(tcx, tcy, tr, p)) _engHurtPlayer(tcx, e.dmg || 2);
        _engAddParts(tcx, tcy, 20, '#f8e8a0', 140, 260);
        _engFx(tcx, tcy, { ring: 1, r: 4, r1: tr, life: 0.45, color: '#f8d048' });
        _engShake(6, 0); game.sfxQueue.push('boom');
      } else {                          // 引信燃烧的心跳演出（倒计时环由 UI 按 t/life 自己画）
        e.fxT = (e.fxT || 0) - dt;
        if (e.fxT <= 0) { e.fxT = 0.14;
          _engFx(e.x + e.w / 2, e.y - e.h - 2, { vy: -34, life: 0.3, color: '#f8d048', size: 1 }); }
      }
    /* ==================== v20 地图二 · 四种新场地实体 ====================
       全部走 hazards（不新建数组）——它们与陨石/地刺/火柱同一生命周期：
       跨段清场、Boss 死亡清场、复活清场，这三条现成规则都要继承，独立数组会漏掉其中一条。 */
    } else if (e.kind === 'laser') { // 灼视线 / 横梁：细长矩形，存续 dur 秒
      e.t += dt;
      if (e.t >= e.dur) { dead = true; }
      else {
        if (e.hitCd > 0) e.hitCd -= dt;
        if (e.hitCd <= 0 && !p.dead && _engAabb({ x: e.x, y: e.y, w: e.w, h: e.h }, p)) {
          _engHurtPlayer(e.x + e.w / 2, e.dmg); e.hitCd = 0.5;
        }
      }
    } else if (e.kind === 'weight' || e.kind === 'hammer') { // 砝码 / 钟锤：预警 → 下落 → 落地结算
      // 两者共用一套下落，差异只在落地后的余波（hammer 多一圈横向冲击波）与体积。
      if (e.warnT > 0) {
        e.warnT -= dt;
        if (e.warnT <= 0) { e.fall = true; e.y = -20; game.sfxQueue.push('shot'); }
      } else {
        e.y += e.vy * dt;
        const ty = Math.floor((e.y + e.r) / _engTile), tx = Math.floor(e.x / _engTile);
        if (L.solid(tx, ty, game.switchState)) {
          dead = true;
          const gy = ty * _engTile;
          game.shake = Math.max(game.shake, 6); game.sfxQueue.push('boom');
          _engAddParts(e.x, gy, 14, e.kind === 'hammer' ? '#f8d048' : '#c8a8ff', 120, 240);
          _engFx(e.x, gy - e.r, { ring: 1, r: 4, r1: e.r + 10, life: 0.32, color: '#f8d048' });
          if (!p.dead && _engCircleRect(e.x, gy - e.r, e.r, p)) _engHurtPlayer(e.x, e.dmg);
          if (e.kind === 'hammer' && e.splash) {          // 钟锤落地：左右两片横向冲击波
            for (const d of [-1, 1])
              game.waves.push({ x: e.x + d * 10, y: gy - 12, w: 14, h: 12, vx: d * e.splash, life: 0.55 });
          }
        } else if (e.y > L.h * _engTile + 30) { dead = true; }
        else if (!p.dead && _engCircleRect(e.x, e.y + e.r, e.r, p)) {
          dead = true; _engHurtPlayer(e.x, e.dmg);
          _engAddParts(e.x, e.y, 10, '#f8d048', 100, 200);
        }
      }
    } else if (e.kind === 'crawler') { // 虫群：贴地直线爬行，撞墙消失
      e.t += dt; e.life -= dt;
      e.x += e.vx * dt;
      const tx = Math.floor((e.x + (e.vx > 0 ? e.w : 0)) / _engTile);
      const ty = Math.floor((e.y + e.h / 2) / _engTile);
      if (e.life <= 0 || L.solid(tx, ty, game.switchState)) dead = true;
      else if (!p.dead && _engAabb(e, p)) {
        dead = true; _engHurtPlayer(e.x + e.w / 2, e.dmg);
        _engAddParts(e.x + e.w / 2, e.y + e.h / 2, 8, '#68c060', 90, 180);
      }
    } else if (e.kind === 'egg') { // 虫卵（茧）：每 stageT 进化一级——★ 打早了只是"提前放出来"
      const TE = _engBossTable(9).spawn;
      if (e.flashT > 0) e.flashT -= dt;
      e.t += dt;
      /* 受击只把 hp 扣到 <=0，收尸/进化统一在这里做（与 totem 同一分工）：
         攻击路径只扣血、不判生死，否则"最后一刀打碎卵"会在攻击里直接消失，
         玩家永远看不到自己把卵打成了幼虫——那才是最该看到的惩罚反馈。 */
      if (e.hp <= 0) {
        if (e.stage < 2) {                 // ★ 核心：卵不会消失，只是提前一格
          e.stage++; e.t = 0; e.flashT = 0.22;
          e.hp = e.stage === 1 ? TE.larvaHp : TE.adultHp;
          e.maxHp = e.hp;
          _engAddParts(e.x + 8, e.y + 8, 10, e.stage === 1 ? '#c8e070' : '#f8c048', 90, 190);
          _engFloat(e.x + 8, e.y - 4, e.stage === 1 ? '破壳' : '化蛹', '#c8e070', 0.8);
          game.sfxQueue.push('break');
        } else {                           // 成虫才是"肥的"：能量 + 回蓝 + 金币
          dead = true;
          game.ultCharge = Math.min(100, (game.ultCharge || 0) + 18);
          if (game.manaMax > 0) game.mana = Math.min(game.manaMax, game.mana + 12);
          _engAddParts(e.x + 8, e.y + 8, 16, '#f8d048', 120, 230);
          _engFx(e.x + 8, e.y + 8, { ring: 1, r: 3, r1: 22, life: 0.3, color: '#f8d048' });
          _engFloat(e.x + 8, e.y - 4, '能量 +18', '#f8d048', 1);
          game.coins += 2; game.sfxQueue.push('coin');
        }
      } else if (e.t >= e.stageT) {
        /* 自然进化：血量按新阶段回满——"我打了一半它却变强了"正是这招要教的东西。
           只有成虫（stage 2）不再进化，停在原地等玩家来收割。 */
        if (e.stage < 2) {
          e.stage++; e.t = 0; e.flashT = 0.22;
          e.hp = e.stage === 1 ? TE.larvaHp : TE.adultHp;
          e.maxHp = e.hp;
          _engAddParts(e.x + 8, e.y + 8, 10, '#c8e070', 80, 170);
          game.sfxQueue.push('spit');
        }
      } else if (e.stage > 0 && !p.dead) {
        /* v20.3 兑现 spec 承诺（feed 此前是死配置）：幼虫爬向玩家；成虫掉头爬回 Boss 喂血——
           "不打成虫"从收益问题变成防御问题。P2 喂食 ×1.5（虫群更饿）。 */
        if (e.stage === 1) {
          const dir = (p.x + p.w / 2) < (e.x + 8) ? -1 : 1;
          e.x += dir * 38 * dt;
        } else {
          const b2 = game.boss;
          if (b2 && b2.hpTotal > 0) {
            const bc2 = b2.x + b2.w / 2;
            const dir = bc2 < (e.x + 8) ? -1 : 1;
            e.x += dir * 68 * dt;
            if (Math.abs((e.x + 8) - bc2) < b2.w / 2 + 6) {
              const ceil = (3 - b2.bandBreak) * b2.bandMax;
              const back = Math.min(TE.feed * (b2.phase === 2 ? 1.5 : 1), Math.max(0, ceil - b2.hpTotal));
              b2.hpTotal += back; b2.hp = _engSegHp(b2);
              _engFloat(e.x + 8, e.y - 4, '喂食 +' + Math.round(back), '#f86048', 0.9);
              _engAddParts(e.x + 8, e.y + 8, 8, '#f86048', 80, 160);
              game.sfxQueue.push('break');
              dead = true;
            }
          } else {
            const dir = (p.x + p.w / 2) < (e.x + 8) ? -1 : 1;
            e.x += dir * 68 * dt;
          }
        }
        if (e.hitCd > 0) e.hitCd -= dt;
        if (_engAabb(e, p) && e.hitCd <= 0) {
          _engHurtPlayer(e.x + 8, 1); e.hitCd = 0.8;
        }
      }
    } else if (e.kind === 'web') { // 蛛网（茧）：挡移动、挡跳，不挡攻击
      e.t += dt; e.life -= dt;
      if (e.life <= 0) dead = true;
      else if (!p.dead && _engAabb(e, p)) {
        /* 沿用 mist 的减速通道（p.mistT/p.mistSlow）：它已经是玩家移速钳制处唯一的乘数，
           再开一条并行通道会出现"两个乘数相乘"的叠乘 bug。web 额外置 webNoJump。 */
        p.mistT = 0.08; p.mistSlow = Math.min(p.mistT > 0 ? (p.mistSlow || 1) : 1, e.slow || 0.4);
        p.webNoJump = 0.08;
      }
    }
    if (dead) hz.splice(i, 1);
  }
  // v12：核心在本帧碎掉 → 立刻查破盾（Boss 免伤必须在同一帧解除，不能让玩家多打一帧空气）
  if (coreDied) _engCoreBreakCheck();
  // v13：幻影在本帧被击破 → 统一结算（真身显形/假身爆炸都只在这里发生，攻击路径只扣 hp）
  if (mirrorDead) for (const e of mirrorDead) _engMirrorSettle(e);
  // 力场结束：吸附速度 8/s 衰减归零（不会一直把玩家拖着走）；力场生效中则保持充能
  if (!pullOn && p.pullV) {
    p.pullV *= Math.max(0, 1 - 8 * dt);
    if (Math.abs(p.pullV) < 4) p.pullV = 0;
  }
}

function _engSkillTargetX(p) { // 内部：星陨目标 x——Boss 中心 / 200px 内最近敌 / 面向 44px（设计 §4）
  // v12：核心护盾期锁定最近的一颗活核心——否则星陨会全部砸在免伤的本体上，玩家按 U 等于空放
  if (game.boss && game.boss.coreOn) {
    let coreX = null, cd = 1e9;
    for (const e of (game.hazards || [])) if (e.kind === 'core') {
      const d0 = Math.abs(e.x + e.w / 2 - (p.x + p.w / 2));
      if (d0 < cd) { cd = d0; coreX = e.x + e.w / 2; }
    }
    if (coreX !== null) return coreX;
  }
  // v13：真假身期间本体是隐身的（b.hidden），按 Boss 中心落点等于「瞄准空处」——既露馅又难看。
  // 改锁最近的一具幻影（真假未知，打错照样爆炸，猜谜玩法不被大招白送答案）。
  if (game.boss && game.boss.state === 'mirrorCast') {
    const mu = _engMirrorPick(p.x + p.w / 2);
    if (mu) return mu.x + mu.w / 2;
  }
  if (game.boss && game.boss.state !== 'dormant' && game.boss.state !== 'dead'
      && game.boss.state !== 'dying') return game.boss.x + game.boss.w / 2;
  let best = null, bd = 200;
  for (const e of game.level.enemies) if (!(e.dead > 0)) {
    const d = Math.abs(e.x - p.x); if (d < bd) { bd = d; best = e; } }
  return best ? best.x + 6 : p.x + 5 + p.face * 44;
}

function _engGroundY(tx, yFrom) { // 内部（v5 §3.2）：tx 列自 yFrom 所在行向下扫首个实心行顶
  // 供星陨瞄准圈落点（m.ring，ui 画金色双圈）；无实心则兜底最后一行顶。
  const Lv = game.level, col = Math.floor(tx / _engTile);
  for (let ty = Math.max(0, Math.floor(yFrom / _engTile)); ty < Lv.h; ty++)
    if (Lv.solid(col, ty, game.switchState)) return ty * _engTile;
  return (Lv.h - 1) * _engTile;
}

function _engSpendMana(cost) { // 内部（v19）：法师法力扣除——足够则扣并返回 true
  // 不足：**不扣蓝、不进 CD**，只置 manaToast=0.9 并在「提示本来不在显示」时推一次 'nomana'
  // （连按同一技能不会刷音；toast 期间再按仍是同一个提示窗口）。NaN 一律按 0 处理，法力永不污染。
  const c = cost || 0;
  const have = Number.isFinite(game.mana) ? game.mana : 0;
  if (have < c) {
    if (!(game.manaToast > 0)) game.sfxQueue.push('nomana');
    game.manaToast = 0.9;
    return false;
  }
  game.mana = have - c;
  return true;
}

function _engPushShot(s) { // 内部（v19）：远程弹体入池 + 容量守卫（上限 32，超出丢最旧，BAL.guard 精神）
  const arr = game.shots || (game.shots = []);
  arr.push(s);
  while (arr.length > 32) arr.shift();
}

function _engUpdateSkills(dt) { // 内部：四技能 U/I/O/L（边沿消费 + CD 门控；由 _engUpdatePlayer 调用）
  const p = game.player, S = game.skills, inp = game.input;
  /* v19（spec §2.5）：mage 四技能——全部远程/召唤（只有 I 是防御）。mage 在上面的分支里 return，
     下方骑士四条分支因此**一字不动**（默认 hero='knight' 零回归）。
     法力不足时 _engSpendMana 返回 false ⇒ 该技能不进 CD、也不扣蓝（只提示）。 */
  if (_engHero().usesMana) {
    const M = BAL.heroes.mage;
    if (inp.skillUHit) { inp.skillUHit = 0;
      /* v19.3：U 由「冰晶长矛」换成「霜爆新星」——以自身为圆心八向炸开冰锥，命中冻结 0.8s。
         换的理由：长矛是往前打的单体穿透，和普攻 J 只差伤害，玩家永远只会在安全距离按一下；
         法师真正的痛点是「被贴脸就没招」。新星把 U 变成唯一的近身解围手段，玩家必须贴身才划算。
         八道冰锥共用 novaSeq：同一次新星对同一敌人只结算一次（否则贴脸会吃到 8×3=24 伤）。 */
      if (S.u <= 0 && !p.dead && _engSpendMana(M.u.mana)) {
        S.u = M.u.cd * game.cdMul; p.castT = 0.3;
        const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
        const seq = (game.novaSeq = (game.novaSeq || 0) + 1);
        for (let i = 0; i < M.u.n; i++) {
          const a = (i / M.u.n) * Math.PI * 2 - Math.PI / 2;   // 从正上方起算，八向均分
          _engPushShot({ kind: 'shard', novaSeq: seq, freeze: M.u.freeze,
            x: cx - M.u.w / 2 + Math.cos(a) * 5, y: cy - M.u.h / 2 + Math.sin(a) * 5,
            w: M.u.w, h: M.u.h, vx: Math.cos(a) * M.u.v, vy: Math.sin(a) * M.u.v, life: M.u.life,
            base: M.u.dmg, dmg: M.u.dmg, crit: 0, pierce: 0, hitList: [],
            homeR: 0, homeDeg: 0, turn: 0, face: p.face, manaGain: 0 });
        }
        game.sfxQueue.push('nova');
        _engShake(3, 0.06);
        _engAddParts(cx, cy, 16, '#d8f4ff', 110, 0);
        _engAddParts(cx, cy, 8, '#ffffff', 80, 0);
        _engFx(cx, cy, { ring: 1, r: 4, r1: 46, life: 0.3, life0: 0.3, color: '#a8e8ff' });
      } }
    if (inp.skillIHit) { inp.skillIHit = 0;
      // I 星辉屏障：复用骑士护盾实现（shieldT/shieldHp），只换参数（2.5s / 吸 2 次）
      if (S.i <= 0 && !p.dead && _engSpendMana(M.i.mana)) {
        S.i = M.i.cd * game.cdMul; p.shieldT = M.i.dur; p.shieldHp = M.i.absorb;
        game.sfxQueue.push('shield');
        _engAddParts(p.x + 5, p.y + 7, 12, '#8ae8ff', 70, 0);
      } }
    if (inp.skillOHit) { inp.skillOHit = 0;
      // O 陨星风暴：能量制门控同骑士（ultCharge≥100），**不耗蓝**；伤害结算在 ult 状态机里（kind='mage'）
      if (S.o <= 0 && game.ultCharge >= BAL.ult.ultNeed && !p.dead) {
        S.o = M.o.cd * game.cdMul; game.ultCharge = 0;
        game.ult = { on: true, t: 0, fired: false, flashed: false, kind: 'mage' };
        game.sfxQueue.push('ult');
      } }
    if (inp.skillLHit) { inp.skillLHit = 0;
      /* v19.3：L 由「三枚追星弹」换成「引力奇点」——丢一颗缓行的黑洞，0.5s 后停住，
         1.1s 内把 100px 内敌人持续吸向中心，结束时 4 伤 + 击退。
         换的理由：追星弹是自动锁敌，按完就不用管，和普攻几乎没有操作差；奇点要求玩家先想
         「在哪引爆」，而且能和 O 陨星风暴打出连招（先吸成一坨再砸，6 颗陨星全中）。
         实体走 game.wells（独立数组），推进在 _engUpdateWells。 */
      if (S.l <= 0 && !p.dead && _engSpendMana(M.l.mana)) {
        S.l = M.l.cd * game.cdMul; p.castT = 0.3;
        const W = game.wells || (game.wells = []);
        W.push({ x: p.x + p.w / 2 - M.l.w / 2 + p.face * 10, y: p.y + p.h / 2 - M.l.h / 2,
          w: M.l.w, h: M.l.h, vx: p.face * M.l.v, vy: 0, t: 0, stopped: false,
          life: M.l.hold, r: M.l.radius, pull: M.l.pull, dmg: M.l.dmg,
          stopT: M.l.stopT, face: p.face, fx: 0, trail: 0 });
        game.sfxQueue.push('well');
        _engAddParts(p.x + p.w / 2 + p.face * 8, p.y + 7, 8, '#b090f8', 60, 40);
      } }
    return;
  }
  if (inp.skillUHit) { inp.skillUHit = 0;
    if (S.u <= 0 && !p.dead) { S.u = BAL.skills.u.cd * game.cdMul; p.castT = 0.25; game.sfxQueue.push('meteor');
      // v5 §3.2：目标 x + 地面 y（瞄准圈），三流星延迟错开 BAL.skills.u.delay（0.50/0.75/1.00）
      const tx = _engSkillTargetX(p), gy = _engGroundY(tx, p.y);
      game.meteors.push({ x: tx - 24, y: -16, vy: BAL.skills.u.fallV, w: 10, h: 14, delay: BAL.skills.u.delay[0], ring: gy });
      game.meteors.push({ x: tx - 5,  y: -16, vy: BAL.skills.u.fallV, w: 10, h: 14, delay: BAL.skills.u.delay[1], ring: gy });
      game.meteors.push({ x: tx + 14, y: -16, vy: BAL.skills.u.fallV, w: 10, h: 14, delay: BAL.skills.u.delay[2], ring: gy }); } }
  if (inp.skillIHit) { inp.skillIHit = 0;
    // v5 §3.3：护盾 dur 3s，可吸收 absorb 2 次伤害（shieldHp）；破盾事件见 _engShieldBreak
    if (S.i <= 0 && !p.dead) { S.i = BAL.skills.i.cd * game.cdMul; p.shieldT = BAL.skills.i.dur; p.shieldHp = BAL.skills.i.absorb; game.sfxQueue.push('shield');
      _engAddParts(p.x + 5, p.y + 7, 12, '#f8d048', 70, 0); } }
  if (inp.skillOHit) { inp.skillOHit = 0;
    // v5 §3.1：O 流星连斩 1.2s 演出状态机；v7.1 门控改能量制：ultCharge≥100 释放（原 combo≥8 废除）
    if (S.o <= 0 && game.ultCharge >= BAL.ult.ultNeed && !p.dead) {
      S.o = BAL.skills.o.cd * game.cdMul; game.ultCharge = 0;             // 消耗全部充能
      game.ult = { on: true, t: 0, fired: false, flashed: false };
      game.sfxQueue.push('ult');
    } }
  if (inp.skillLHit) { inp.skillLHit = 0;
    // v6 §2.2 技能4 星刃回旋：CD 6×cdMul；冲刺蓄力段（前 0.05s）不可掷（爆发/滑行可掷，宽口径）；
    // 施法姿态 0.2s（复用 castT）；不做 hit-stop/震屏（远程技能保持节奏）。
    if (S.l <= 0 && !p.dead && !(p.dashT > 0 && _engDashDur - p.dashT < 0.05)) {
      S.l = BAL.skills.l.cd * game.cdMul;
      p.castT = 0.2;
      game.blades.push({ x: p.x + p.w / 2 - 6 + p.face * 6, y: p.y + 1,   // 手前出生
        w: 12, h: 12, vx: p.face * BAL.skills.l.vOut, vy: 0, dir: p.face,
        phase: 0,            // 0=去程 1=回程
        trav: 0,             // 去程已飞行 px
        life: BAL.skills.l.life, // 总寿命（防丢强制回收）
        hits: {} });         // 命中记名：'e'+i+phase / 'boss'+phase（一程一目标一伤）
      game.sfxQueue.push('blade');
    } }
}

/* ==================== 内部判定辅助（内部） ==================== */
function _engPlayerInSolid(L) { // 内部：玩家矩形是否与实心瓦片重叠（平台挤压致死判定用）
  const p = game.player;
  let hit = false;
  _engRectTiles(L, p.x, p.y, p.w, p.h, function (tx, ty) {
    if (L.solid(tx, ty, game.switchState)) hit = true;
  });
  return hit;
}

const _engMuzzleRange = 6; // 内部（v7.6 缺陷3）：炮口净空门禁 = 前方 6 格（96px）；短于此的弹道玩家读不出来
function _engMuzzleBlocked(L, cn) { // 内部（v7.6 缺陷3）：炮口前方 _engMuzzleRange 格内是否有实心瓦片
  // 与炮弹自身的死亡判据（⑧ 滤池里 floor((b.x+4)/16) 查 solid）同口径，只是提前在开火前问一次；
  // 含 'B' 木箱（可碎 → 砸开后自动放行）与随开关变化的 a/b、未开的 D、未塌的 C。
  const y0 = Math.floor((cn.y + 4) / _engTile), y1 = Math.floor((cn.y + 9) / _engTile);
  const tx0 = Math.floor((cn.x + (cn.dir > 0 ? 16 : -8)) / _engTile);
  for (let d = 0; d < _engMuzzleRange; d++) {
    const tx = cn.dir > 0 ? tx0 + d : tx0 - d;
    for (let ty = y0; ty <= y1; ty++) if (L.solid(tx, ty, game.switchState)) return true;
  }
  return false;
}

function _engBodySolid(L, e, x, y) { // 内部（v7.6 缺陷2）：矩形 (x,y,e.w,e.h) 是否压到实心瓦片
  // 飞行巡逻者（蝙蝠/水母/幽灵）的「不嵌墙」判据；只读 solid()，不含 '='（单向平台对飞行体是空气）。
  const x0 = Math.floor(x / _engTile), x1 = Math.floor((x + e.w - _engEps) / _engTile);
  const y0 = Math.floor(y / _engTile), y1 = Math.floor((y + e.h - _engEps) / _engTile);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) if (L.solid(tx, ty, game.switchState)) return true;
  return false;
}

function _engFootTile(L, tx, ty) { // 内部（v7.6 缺陷1）：敌人的「可落脚面」口径 = solid() ∪ '=' 单向平台
  // 与玩家落地判定（updatePlayer 的 '=' 分支）同集合；敌人的水平掉头/垂直吸附都必须走这一个口径，
  // 否则 levels.js 的 STAND 集合（认 '='）与引擎（只认 solid()）分叉 → 单向平台上的敌人掉下去或原地抖。
  return L.solid(tx, ty, game.switchState) || L.tileAt(tx, ty) === '=';
}

function _engDropSafe(L, tx, ty, n) { // 内部（v8.0 任务2）：该列往下 n 格内是否有安全落脚面
  // 用途：传送带把小怪送出边缘时，判断「掉下去」是不是安全（有地面才掉，深坑/尖刺/熔岩就不掉头）。
  // 只读瓦片，不改任何状态——与 _engFootTile 一样是纯判定。
  for (let i = 0; i <= n; i++) {
    const ch = L.tileAt(tx, ty + i);
    if (ch === '^' || ch === 'v' || ch === '~') return false;      // 落点即死物：不掉
    if (L.solid(tx, ty + i, game.switchState) || ch === '=') return true;
  }
  return false;
}

function _engRescueJumpOK(L, e, dir, reach) { // 内部（v8.0 任务3）：脱困跳是否安全——头顶空 + 落点能站
  // 为什么需要这一层：脱困跳是「敌人自己主动离开原位」的唯一出口，一旦跳进天花板/跳下无底坑，
  // 就变成「怪穿墙」或「怪凭空消失」，比原地打转更糟。三个条件缺一不可：
  //   ① 头顶 2 格必须是空的（工单硬要求：不能把敌人弹进墙里）；
  //   ② 落点是**算出来的**，不是估的：水平射程 = vx × 2vy/grav（slime 90×520/1320≈35px，
  //      hopper 90×600/1320≈41px），落点矩形覆盖的那几列必须同层都能站（平地），
  //      不能一列踩地、一列踩在木箱顶上——实测 L2#6 就是这样落到 1 格宽木箱顶，
  //      左右分别是台沿和关着的门，只剩 4px 活动量，比跳之前还死；
  //   ③ 落点至少 2 格宽（左边或右边还能再站一格），保证落地后能继续巡逻而不是被夹住。
  const x0 = Math.floor(e.x / _engTile), x1 = Math.floor((e.x + e.w - _engEps) / _engTile);
  const hy = Math.floor((e.y - 1) / _engTile);
  for (let tx = x0; tx <= x1; tx++)
    for (let i = 0; i < 2; i++) if (L.solid(tx, hy - i, game.switchState)) return false;
  const fy = Math.floor((e.y + e.h + 2) / _engTile);
  const rows = Math.max(1, Math.ceil(e.h / _engTile)); // 落点上方要留够身高（12px → 1 格）
  const stand = function (tx, r) {                     // 第 r 行是地面、且上面留得下身体
    if (!_engFootTile(L, tx, r)) return false;
    for (let k = 1; k <= rows; k++) if (L.solid(tx, r - k, game.switchState)) return false;
    return true;
  };
  const lx = e.x + dir * reach;                        // 落点左缘
  const c0 = Math.floor(lx / _engTile), c1 = Math.floor((lx + e.w - _engEps) / _engTile);
  for (let dy = 0; dy >= -1; dy--) {                   // 同高 / 高 1 格（跳跃高度 25~34px 够跨 1 格）
    const r = fy + dy;
    let bodyFree = true, hasFoot = false;
    for (let tx = c0; tx <= c1; tx++) {
      if (_engFootTile(L, tx, r)) hasFoot = true;
      for (let k = 1; k <= rows; k++) if (L.solid(tx, r - k, game.switchState)) { bodyFree = false; break; }
      if (!bodyFree) break;
    }
    // 落点矩形：至少一列有地面（允许半只脚踩在台沿上——斜落台沿是合法脱困），
    // 但身体占的每一格都不能是实心（否则就是落进木箱/墙里，见上面 L2#6 那条注释）。
    if (!bodyFree || !hasFoot) continue;
    // 落地后左右至少还能再站一格：否则等于把它从「小坑」搬进「更小的坑」
    if (stand(c0 - 1, r) || stand(c1 + 1, r)) return true;
  }
  return false;
}

function _engRescueDashOK(L, e, dir) { // 内部（v8.0 任务3）：脱困冲刺是否安全——前方 2 格内必须真有能站的地方
  // 冲刺只给水平推力，没有任何抬升能力：前方是同高地面/高 1 格台面 → 推过去是「换位置」。
  // 三个否决：① 前方 1~2 格都站不住（左右都被墙夹死）→ 顶着墙冲只会被掉头判定弹回来，
  // 每 1.6s 白翻一次向（诊断里表现为掉头次数翻倍），对脱困零帮助；
  // ② 前方是空且下面 4 格内无落脚面 → 推过去就是掉出关卡（y>h*16+30 → dead=99 凭空消失）；
  // ③ 「墙」不算落脚面：_engFootTile 对实心墙也返回 true，必须再查身体所在行是否空，否则会误判。
  const fy = Math.floor((e.y + e.h + 2) / _engTile);
  const cx = Math.floor((e.x + e.w / 2) / _engTile);
  const rows = Math.max(1, Math.ceil(e.h / _engTile)); // 身体占几行（12px → 1 行）
  const stand = function (tx, dy) {                     // 该列在 fy+dy 这一层能不能站（含身体空间）
    if (!_engFootTile(L, tx, fy + dy)) return false;
    for (let k = 1; k <= rows; k++) if (L.solid(tx, fy + dy - k, game.switchState)) return false;
    return true;
  };
  // 要求「连续 2 格都能站」：1 格宽的空隙在 2 格夹缝里根本挪不出去（冲刺 0.35s×2.4 倍速
  // 只会把它顶到对面墙上再被弹回来，凭空多一次翻向），只有真有一段能走的地方才值得冲。
  for (let i = 1; i <= 2; i++) {
    const tx = cx + dir * i;
    for (let dy = 0; dy >= -1; dy--) {
      if (!stand(tx, dy)) continue;
      if (i === 1 && (stand(cx + dir * 2, dy) || stand(cx + dir * 3, dy))) return true;
      if (i === 2 && stand(cx + dir * 3, dy)) return true;
    }
    if (L.solid(tx, fy - 1, game.switchState)) return false;   // 撞墙：冲刺无意义
    if (!_engDropSafe(L, tx, fy, 4)) return false;             // 无底：不许推下去
  }
  return false;
}


function _engOnCrumble(p, c) { // 内部：玩家是否正踩在此崩塌砖顶面上
  if (!p.onGround) return false;
  const bx = c.x * _engTile, by = c.y * _engTile;
  return Math.abs(p.y + p.h - by) < 3 && p.x + p.w > bx && p.x < bx + _engTile;
}

let _engComboFloatT = 0; // 内部（v5 §D）：连击浮字节流时间戳（同一窗口 0.5s 内只推一条）
function _engAddCombo() { // 内部：连击计数（v5 §2#7：命中敌人（无论死活）/碎砖 +1；2s 窗口累计，断档清零在 updateWorld ⑬）
  game.combo++;
  game.comboT = _engComboWin;
  // v7.1：O 充能随命中累积（满 ultNeed 后继续命中不再累积，等玩家释放）
  if (game.ultCharge < BAL.ult.ultNeed) game.ultCharge = Math.min(BAL.ult.ultNeed, game.ultCharge + BAL.ult.chargeHit);
  if (game.combo >= 2) game.sfxQueue.push('combo'); // n≥2 才有连击音
  if (game.combo >= 2 && game.time >= _engComboFloatT) { // 连击浮字：玩家头顶金色，0.5s 节流
    _engComboFloatT = game.time + 0.5;
    const p = game.player;
    if (p) _engFloat(p.x + 5, p.y - 6, 'COMBO x' + game.combo, '#f8d048', 1);
  }
}

function _engEnemySkill(e, dt, L, p) { // 内部（v6 §E）：四类敌人技能状态机——触发全距离条件、无随机（确定性），
  // 门禁空转零触发（出生点距最近敌 > 触发半径或 cd 未到）；前摇期间被打断不打断（前摇=硬直窗口，可反制）。
  // 参数/时长/速度/CD 全取 BAL.enemy.*.skill；调用点在敌人循环内、kb 摩擦之前。
  const ai = e.ai;
  if (!ai || e.dead > 0) return;
  const sk = BAL.enemy[e.type] && BAL.enemy[e.type].skill;
  if (!sk) return;
  ai.t += dt;
  if (ai.cd > 0) ai.cd -= dt;
  const dx = (p.x + p.w / 2) - (e.x + e.w / 2); // dx/dy = 玩家中心 − 敌中心
  const dy = (p.y + p.h / 2) - (e.y + e.h / 2);

  if (e.type === 'slime') { // §3.1 弹跳压顶：idle→wind(压扁蓄力 0.5s)→leap(压顶跳)→落地回 idle
    if (ai.st === 'wind') {
      e.vx = 0; // 压扁蓄力：巡逻位移冻结（vx=0，掉头判定 d=0 自然跳过）
      if (((ai.t * 10) | 0) !== (((ai.t - dt) * 10) | 0)) // 每 0.1s 1 粒蓄力尘
        _engAddParts(e.x + 6, e.y + 9, 1, '#ffffff', 18, 120);
      if (ai.t >= sk.wind) { // 发动·压顶跳（滞空 2×260/1320≈0.394s；重力/落地走 ⑨ 既有）
        ai.st = 'leap'; ai.t = 0;
        e.vx = _engSign(dx) * sk.vx; e.vy = -sk.vy;
      }
    } else if (ai.st === 'leap') {
      if (e.grounded) { // 落地回 idle，cd 回基础值；恢复巡逻速度（蓄力前存档在 ai.tx）
        ai.st = 'idle'; ai.t = 0; ai.cd = sk.cd;
        e.vx = ai.tx || -BAL.enemy.slime.spd;
      }
    } else { // idle：|dx|≤rngX 且 dy∈[-up,dn] 且 grounded
      if (ai.cd <= 0 && e.grounded && Math.abs(dx) <= sk.rngX && dy >= -sk.up && dy <= sk.dn) {
        ai.st = 'wind'; ai.t = 0; ai.tx = e.vx; e.vx = 0; // ai.tx 暂存巡逻速度
      }
    }
    return;
  }
  if (e.type === 'bat') { // §3.2 俯冲撕咬：idle→aim(悬停瞄准 0.5s)→dive(锁定直线 240)→back(120 回锚点)→idle
    if (ai.st === 'aim') {
      if (ai.t >= sk.wind) { // 目标向量在前摇结束瞬间锁定（ai.tx/ty）
        ai.st = 'dive'; ai.t = 0;
        const ddx = (p.x + p.w / 2) - (e.x + e.w / 2), ddy = (p.y + p.h / 2) - (e.y + e.h / 2);
        const d = Math.hypot(ddx, ddy) || 1;
        ai.tx = ddx / d * sk.vDive; ai.ty = ddy / d * sk.vDive;
      }
    } else if (ai.st === 'dive') { // 直线俯冲（≤diveMax 0.55s；撞前方实心瓦片提前结束）
      e.x += ai.tx * dt; e.y += ai.ty * dt;
      const tx = Math.floor((e.x + e.w / 2) / _engTile), ty = Math.floor((e.y + e.h / 2) / _engTile);
      if (ai.t >= sk.diveMax || L.solid(tx, ty, game.switchState)) { ai.st = 'back'; ai.t = 0; }
    } else if (ai.st === 'back') { // 匀速飞回锚点 (ax,ay)
      const ddx = e.ax - e.x, ddy = e.ay - e.y, d = Math.hypot(ddx, ddy);
      if (d <= sk.vBack * dt || d < 2) { e.x = e.ax; e.y = e.ay; ai.st = 'idle'; ai.t = 0; ai.cd = sk.cd; }
      else { e.x += ddx / d * sk.vBack * dt; e.y += ddy / d * sk.vBack * dt; }
    } else { // idle：中心距 ≤rng 90
      if (ai.cd <= 0 && dx * dx + dy * dy <= sk.rng * sk.rng) { ai.st = 'aim'; ai.t = 0; }
    }
    return;
  }
  if (e.type === 'knight') { // §3.3 盾击冲锋：idle→wind(举盾 0.6s,格挡保持)→charge(190,≤0.5s)→vuln(破绽 0.7s)→idle
    if (ai.st === 'wind') {
      e.vx = 0; // 前摇也格挡：eface=sign(vx)||face → face 保持
      if (ai.t >= sk.wind) { // 冲锋方向锁定（朝玩家），face 同步（正面格挡与冲锋向一致）
        ai.st = 'charge'; ai.t = 0;
        e.face = _engSign(dx) || e.face; ai.tx = e.face;
      }
    } else if (ai.st === 'charge') {
      const dir = ai.tx || 1;
      const my = Math.floor((e.y + e.h / 2) / _engTile);
      const leadTx = dir > 0 ? Math.floor((e.x + e.w - _engEps) / _engTile) : Math.floor(e.x / _engTile);
      if (L.solid(leadTx, my, game.switchState)) { // 撞墙提前结束（钳位回墙面防嵌墙；掉头判定已在 ⑨ 跳过）
        if (dir > 0) e.x = leadTx * _engTile - e.w;
        else e.x = (leadTx + 1) * _engTile;
        e.vx = 0; ai.st = 'vuln'; ai.t = 0; e.guardDown = true; // 破绽：正面也吃全额伤（_engResolveAttack/星刃 front 分支旁路）
        _engAddStars(e.x + 6, e.y, 3, '#ffffff'); // 头顶 3 粒白星 fx
      } else if (ai.t >= sk.dur) { // 超时结束（冲锋最远 190×0.5=95px）
        e.vx = 0; ai.st = 'vuln'; ai.t = 0; e.guardDown = true;
        _engAddStars(e.x + 6, e.y, 3, '#ffffff');
      } else e.vx = dir * sk.vx; // 190 冲锋（玩家 maxRun 120 逃不掉，跳跃即解）
    } else if (ai.st === 'vuln') {
      e.vx = 0;
      if (ai.t >= sk.vuln) { ai.st = 'idle'; ai.t = 0; ai.cd = sk.cd; e.guardDown = false; }
    } else { // idle：|dx|≤rngX 110 且 |dy|≤rngY 24 且 grounded
      if (ai.cd <= 0 && e.grounded && Math.abs(dx) <= sk.rngX && Math.abs(dy) <= sk.rngY) {
        ai.st = 'wind'; ai.t = 0; e.vx = 0;
      }
    }
    return;
  }
  if (e.type === 'mage') { // §3.4 读条火球：idle→cast(读条 0.8s)→recover(后摇 0.5s)→idle；站桩不掉头
    e.face = _engSign(dx) || e.face || 1; // face=sign(玩家中心−自身中心) 每帧刷新
    if (ai.st === 'cast') {
      if (ai.t >= sk.cast) { // 发射：杖尖 (e.x+6+face*4, e.y+2) 出生（与 ui 读条圈同心），初速朝玩家中心 95
        ai.st = 'recover'; ai.t = 0;
        const bx = e.x + 6 + e.face * 4, by = e.y + 2;
        const ddx = (p.x + p.w / 2) - bx, ddy = (p.y + p.h / 2) - by;
        const d = Math.hypot(ddx, ddy) || 1;
        game.bullets.push({ x: bx - 4, y: by - 4, w: 8, h: 8,
          vx: ddx / d * sk.boltV, vy: ddy / d * sk.boltV,
          fire: true, home: sk.home, life: sk.boltLife }); // 追踪 1.6s / 寿命 3.2s（推进在 ⑧ 弹幕滤池）
        game.sfxQueue.push('shot');
      }
    } else if (ai.st === 'recover') { // 后摇站桩（可被打）
      if (ai.t >= sk.recover) { ai.st = 'idle'; ai.t = 0; ai.cd = sk.cd; }
    } else { // idle：|dx|≤rng 140
      if (ai.cd <= 0 && Math.abs(dx) <= sk.rng) { ai.st = 'cast'; ai.t = 0; game.sfxQueue.push('mage'); }
    }
  }
  /* ==================== v7 §5.1-§5.4：四类新敌技能分支（逐字照设计书；全部距离触发无随机，
     伤害统一走 _engHurtPlayer；参数/时长/速度全读 BAL.enemy[type].skill） ==================== */
  if (e.type === 'lancer') { // §5.1 枪虾哨兵：idle→wind(后仰蓄力 0.55s)→thrust(突刺 0.28s)→recover(0.5s)→idle
    if (ai.st === 'wind') {
      e.vx = 0; // 后仰蓄力：位移冻结
      if (((ai.t * 10) | 0) !== (((ai.t - dt) * 10) | 0)) // 每 0.1s 1 粒蓄力尘（同史莱姆 wind 演出）
        _engAddParts(e.x + 6, e.y + 9, 1, '#ffffff', 18, 120);
      if (ai.t >= sk.wind) { // 突刺方向在前摇结束瞬间锁定
        ai.st = 'thrust'; ai.t = 0;
        ai.tx = _engSign(dx) || e.face;
      }
    } else if (ai.st === 'thrust') {
      const dir = ai.tx || 1;
      const my = Math.floor((e.y + e.h / 2) / _engTile);
      const leadTx = dir > 0 ? Math.floor((e.x + e.w - _engEps) / _engTile) : Math.floor(e.x / _engTile);
      if (L.solid(leadTx, my, game.switchState)) { // 撞墙提前结束（同骑士 charge 钳位回墙面）
        if (dir > 0) e.x = leadTx * _engTile - e.w;
        else e.x = (leadTx + 1) * _engTile;
        e.vx = 0; ai.st = 'recover'; ai.t = 0;
      } else if (ai.t >= sk.dur) { // 240×0.28=67px 突进到点
        e.vx = 0; ai.st = 'recover'; ai.t = 0;
      } else e.vx = dir * sk.vx;
    } else if (ai.st === 'recover') {
      e.vx = 0; // 后摇站桩（可打）
      if (ai.t >= sk.recover) { ai.st = 'idle'; ai.t = 0; ai.cd = sk.cd;
        e.vx = -BAL.enemy.lancer.spd * (e.elite ? BAL.elite.spdMul : 1); } // 恢复巡逻（工厂初速同向，精英×0.8）
    } else { // idle：|dx|≤rngX 72 且 |dy|≤rngY 24 且 grounded
      if (ai.cd <= 0 && e.grounded && Math.abs(dx) <= sk.rngX && Math.abs(dy) <= sk.rngY) {
        ai.st = 'wind'; ai.t = 0; e.vx = 0;
      }
    }
    return;
  }
  if (e.type === 'jelly') { // §5.2 水母：idle→wind(膨胀 0.6s)→shock(放电 0.4s 电环判定)→idle；悬浮位移走巡逻分支
    if (ai.st === 'wind') {
      if (ai.t >= sk.wind) { ai.st = 'shock'; ai.t = 0; }
    } else if (ai.st === 'shock') {
      // 放电段判定环：中心距 ≤ring(18) 且玩家存活 → HP 伤害（每步检查，吃无敌帧天然防连扣）
      if (!p.dead && dx * dx + dy * dy <= sk.ring * sk.ring) _engHurtPlayer(e.x + e.w / 2);
      if (ai.t >= sk.dur) { ai.st = 'idle'; ai.t = 0; ai.cd = sk.cd; }
    } else { // idle：中心距 ≤rng 40
      if (ai.cd <= 0 && dx * dx + dy * dy <= sk.rng * sk.rng) { ai.st = 'wind'; ai.t = 0; }
    }
    return;
  }
  if (e.type === 'ghost') { // §5.3 幽灵：idle(沉睡轻浮)→active(穿墙追踪)；玩家死/拉远(>lose 260)→归位
    const d2 = dx * dx + dy * dy;
    if (ai.st === 'active') {
      if (p.dead || d2 > sk.lose * sk.lose) {          // 归位：匀速回锚点
        const ddx = e.hx - e.x, ddy = e.hy - e.y, d = Math.hypot(ddx, ddy);
        if (d <= sk.home * dt + 1) { e.x = e.hx; e.y = e.hy; ai.st = 'idle'; }
        else { e.x += ddx / d * sk.home * dt; e.y += ddy / d * sk.home * dt; }
      } else {
        const d = Math.sqrt(d2) || 1, sp = sk.spd * (e.elite ? BAL.elite.spdMul : 1);
        e.x += dx / d * sp * dt; e.y += dy / d * sp * dt;   // 穿墙：不查 solid
      }
      // 幽灵不查关卡边界（tileAt 越界返 '#' 对它无效）→ 每帧钳位（设计书 §12-3 裁决）
      e.x = _engClamp(e.x, 0, L.w * _engTile - e.w);
      e.y = _engClamp(e.y, -8, L.h * _engTile - e.h);
    } else if (d2 <= sk.wake * sk.wake) { ai.st = 'active'; game.sfxQueue.push('mage'); } // 唤醒低鸣（复用音效事件）
    return;
  }
  if (e.type === 'boomer') { // §5.4 魂火：idle(唤醒半径内朝玩家爬)→wind(膨胀 0.8s 定身闪烁)→自爆
    if (ai.st === 'wind') {
      e.vx = 0;
      if (ai.t >= sk.wind) {                       // 自爆：范围伤 + 自灭（不走 _engKillEnemy——无掉心/装备）
        e.dead = 0.01; e.dvy = -60;
        _engAddParts(e.x + 5, e.y + 5, 18, '#f8a030', 150, 200);
        _engAddParts(e.x + 5, e.y + 5, 10, '#f86030', 110, 150);
        _engShake(5, 0); game.sfxQueue.push('boom');
        // v7.6 缺陷4：自爆判定从「中心距 ≤ r(30)」改成「爆心到玩家矩形最近点 ≤ r(16)」——
        // 口径与电锯/摆锤一致（契约算法 5）。旧写法只看中心距，而精灵只有 10×10、玩家 10×14，
        // 中心距 30 时两者边缘还差 20px，视觉上明显没碰到就掉血。改后实际触及距离 =
        // r + 玩家半宽/半高（水平 ≈21px、垂直 ≈23px），20px 内必中、30px 外不中（实测见报告）。
        if (!p.dead) {
          const ex = e.x + e.w / 2, ey = e.y + e.h / 2;
          const nx = _engClamp(ex, p.x, p.x + p.w), ny = _engClamp(ey, p.y, p.y + p.h);
          const ddx = ex - nx, ddy = ey - ny;
          if (ddx * ddx + ddy * ddy <= sk.r * sk.r) _engHurtPlayer(ex);
        }
      }
    } else { // idle
      if (Math.abs(dx) <= sk.wake) e.vx = _engSign(dx) * BAL.enemy.boomer.spd * (e.elite ? BAL.elite.spdMul : 1);
      else e.vx = 0;
      if (Math.abs(dx) <= sk.rng && Math.abs(dy) <= sk.rngY) { ai.st = 'wind'; ai.t = 0; e.vx = 0; }
    }
    return;
  }
  /* ==================== v8.0 任务4：三种新敌状态机（状态名=工单逐字，ui 按名取帧，不得改） ====================
     全部「距离条件触发 + 无随机 + CD 相位错开」（沿用 _engMkAI 的确定性相位），门禁空转零触发。 */
  if (e.type === 'beetle') { // 铁甲虫：idle→wind(后仰蓄力 0.35s)→charge(直线冲撞 0.4s)→idle
    // 冲撞时长 0.4s 是工单文字值；BAL.beetle.skill 按工单只有 rngX/wind/vx/cd 四键，故此处用本地常量。
    const chargeT = 0.4;
    if (ai.st === 'wind') {
      e.vx = 0; // 后仰蓄力：位移冻结（d=0 → 掉头判定天然跳过）
      if (((ai.t * 10) | 0) !== (((ai.t - dt) * 10) | 0)) { // 每 0.1s：1 粒蓄力尘 + 一次白闪（甲壳反光）
        _engAddParts(e.x + 7, e.y + 11, 1, '#ffffff', 18, 120);
        e.flashT = 0.06;
      }
      if (ai.t >= sk.wind) {
        ai.st = 'charge'; ai.t = 0;
        ai.tx = _engSign(dx) || e.face || 1; e.face = ai.tx; // 方向在前摇结束瞬间锁定
      }
    } else if (ai.st === 'charge') {
      const dir = ai.tx || 1;
      const my = Math.floor((e.y + e.h / 2) / _engTile);
      const leadTx = dir > 0 ? Math.floor((e.x + e.w - _engEps) / _engTile) : Math.floor(e.x / _engTile);
      if (L.solid(leadTx, my, game.switchState)) { // 撞墙提前结束（钳位回墙面，绝不嵌墙）
        if (dir > 0) e.x = leadTx * _engTile - e.w; else e.x = (leadTx + 1) * _engTile;
        e.vx = 0; ai.st = 'idle'; ai.t = 0; ai.cd = sk.cd;
        _engAddStars(e.x + 7, e.y + 2, 3, '#c8c8d8'); game.sfxQueue.push('clank');
      } else if (ai.t >= chargeT) { // 150×0.4 = 60px 冲程
        e.vx = 0; ai.st = 'idle'; ai.t = 0; ai.cd = sk.cd;
      } else e.vx = dir * sk.vx;
    } else { // idle：|dx|≤rngX 88 且「同高度」（|dy| ≤ 自身身高，即同一层地面）且 grounded
      if (ai.cd <= 0 && e.grounded && Math.abs(dx) <= sk.rngX && Math.abs(dy) <= 14) {
        ai.st = 'wind'; ai.t = 0; e.vx = 0;
      }
    }
    return;
  }
  if (e.type === 'spitter') { // 酸液花：idle→cast(花苞张大 0.4s)→吐酸弹→idle；站桩不掉头（只翻面）
    e.vx = 0;
    e.face = _engSign(dx) || e.face || 1;
    if (ai.st === 'cast') {
      if (ai.t >= sk.cast) {
        ai.st = 'idle'; ai.t = 0; ai.cd = sk.cd;
        /* 酸弹复用 game.bullets（与大炮弹/法师火球同一数组、同一套「撞墙/撞玩家/出界」滤池），
           只多两个字段：kind:'acid'（ui 上色）与 g（重力，滤池里按 g 积分 vy）。
           初速 130 朝玩家；因为 130 很慢，纯重力会让弹道在 150px 处下沉 40px+ 打不到人，
           所以按抛物线反解补一个上抛分量 vy -= g*t/2（t=直线距离/初速）——这才是「抛物线酸弹」
           该有的手感：看得见它先抛起再落下，而不是贴地平推。 */
        const bx = e.x + e.w / 2, by = e.y + 2;
        const ddx = (p.x + p.w / 2) - bx, ddy = (p.y + p.h / 2) - by;
        const dd = Math.hypot(ddx, ddy) || 1, gA = 260;
        game.bullets.push({ x: bx - 4, y: by - 4, w: 8, h: 8,
          vx: ddx / dd * sk.boltV, vy: ddy / dd * sk.boltV - 0.5 * gA * (dd / sk.boltV),
          kind: 'acid', g: gA, life: 2.4 });
        game.sfxQueue.push('shot');
        _engAddParts(bx, by, 6, '#88d848', 60, 120); // 花苞喷口绿雾
      }
    } else if (ai.cd <= 0 && Math.abs(dx) <= sk.rng) { ai.st = 'cast'; ai.t = 0; }
    return;
  }
  if (e.type === 'hopper') { // 跳跳蛛：idle→crouch(下蹲 0.3s)→air(起跳 -300 / ±90)→落地回 idle
    if (ai.st === 'crouch') {
      e.vx = 0;
      if (((ai.t * 10) | 0) !== (((ai.t - dt) * 10) | 0))
        _engAddParts(e.x + 6, e.y + e.h - 1, 1, '#d8d0c0', 16, 120);
      if (ai.t >= sk.crouch) {
        ai.st = 'air'; ai.t = 0;
        e.vy = -sk.jumpV; e.grounded = false;
        e.vx = (_engSign(dx) || e.face || 1) * sk.vx; // 朝玩家方向压过去
        game.sfxQueue.push('jump');
      }
    } else if (ai.st === 'air') {
      if (e.grounded) { // 落地：回 idle + 恢复巡逻速度 + 烟尘 + 轻微震屏（工单要求）
        ai.st = 'idle'; ai.t = 0; ai.cd = sk.cd;
        e.vx = (_engSign(e.vx) || 1) * BAL.enemy.hopper.spd;
        _engAddParts(e.x + e.w / 2, e.y + e.h, 10, '#d8d0c0', 70, 200);
        _engAddParts(e.x + e.w / 2, e.y + e.h, 4, '#ffffff', 40, 120);
        _engShake(2, 0);
        game.sfxQueue.push('land');
      }
    } else if (ai.cd <= 0 && e.grounded && Math.abs(dx) <= sk.rng) {
      ai.st = 'crouch'; ai.t = 0; e.vx = 0;
    }
    return;
  }
}

function _engResolveMageAttack(L, p) { // 内部（v19，spec §2.3）：法师普攻——一次起手只发一发奥术飞弹
  // 序号门控同骑士：atkT>0（判定窗内）且本摆还没发过弹（shotSeq≠atkSeq）。
  if (!(p.atkT > 0) || p.dead || p.shotSeq === p.atkSeq) return;
  const B = BAL.heroes.mage.bolt;
  // 伤害口径与骑士一致：ATK = atkBase + equip.atk；暴击在**出膛时**按当前连击锁定（spec §2.3），
  // 弹体带 dmg/crit 飞行（命中结算不再复算，避免飞行途中连击变化导致「第 4 击」节奏漂移）。
  const crit = ((game.combo + 1) % BAL.player.critMod) === 0;
  const ATK = BAL.player.atkBase + (game.equip ? game.equip.atk : 0);
  const dmg = crit ? ATK * BAL.player.critMul : ATK;
  _engPushShot({ kind: 'bolt', x: p.x + p.w / 2 - 4 + p.face * 8, y: p.y + 5, w: B.w, h: B.h,
    vx: p.face * B.v, vy: 0, life: B.life, base: ATK, dmg: dmg, crit: crit ? 1 : 0,
    pierce: 0, hitList: [], homeR: B.homeR, homeDeg: B.homeDeg, turn: B.turn,
    face: p.face, manaGain: BAL.heroes.mage.manaPerHit });
  p.shotSeq = p.atkSeq;
  p.castT = Math.max(p.castT, 0.12); // 施法姿态（ui 取 mgCast；不产生近战判定框、不触发 renderSlash）
  game.sfxQueue.push('bolt');
  _engAddParts(p.x + p.w / 2 + p.face * 9, p.y + 6, 4, '#8ae8ff', 55, 0); // 枪口青白 4 粒
}

function _engResolveAttack(L, p) { // 内部：攻击判定（v2 P1；v5 §C 打击感重写）——身前 18×14 框 vs 敌人/炮弹/'B' 砖
  if (game.hero === 'mage') { _engResolveMageAttack(L, p); return; } // v19（spec §2.3）：法师走远程弹体，骑士原逻辑一字不动
  if (!(p.atkT > 0) || p.dead) return;
  const box = { x: p.face > 0 ? p.x + p.w - 2 : p.x - _engAtkW + 2, y: p.y, w: _engAtkW, h: _engAtkH };
  // v5 §2#4：暴击——本击使连击数到 critMod 的倍数 → 伤害×critMul、金色数字（hit-stop 不变）；全分支共用
  // v6 §C：ATK = atkBase + equip.atk（atkBase 2，满装 ATK 5）；v7.7：局外成长项已删（暴击仍 ×critMul）
  const crit = ((game.combo + 1) % BAL.player.critMod) === 0;
  const ATK = BAL.player.atkBase + (game.equip ? game.equip.atk : 0);
  const dmg = crit ? ATK * BAL.player.critMul : ATK;
  // v3：Boss 承伤——命中 +2 连击（设计 §4 连斩充能口径；免伤态 _engBossHurt 返回 false 不计数）；
  // v5 §2#11：Boss 被击瞬间朝远离玩家侧位移 2px（clamp 场内）；hitSeq 防同摆二次结算
  if (game.boss && game.boss.hitSeq !== p.atkSeq && _engAabb(box, game.boss) && _engBossHurt(dmg)) {
    const b = game.boss, push = (p.x + p.w / 2 < b.x + b.w / 2) ? 1 : -1;
    b.x = _engClamp(b.x + push * 2, 16, L.w * _engTile - b.w - 16);
    b.hitSeq = p.atkSeq;
    _engAddCombo(); _engAddCombo();
    // v10：浮字改用 b.lastDmg（破绽期 ×1.5 后的真实伤害），否则玩家看到的数字和掉血对不上
    _engFloat(b.x + b.w / 2, b.y - 4, '' + b.lastDmg, crit ? '#f8d048' : '#ffffff', crit ? 1 : 0);
    game.hitStop = _engHitStop; game.sfxQueue.push('hit');
    if (crit) game.sfxQueue.push('kill');
  }
  // v3：Boss 落地冲击波可斩碎（+1 连击，设计 §3）
  for (let i = game.waves.length - 1; i >= 0; i--) {
    if (_engAabb(box, game.waves[i])) {
      _engAddParts(game.waves[i].x + 6, game.waves[i].y + 5, 6, '#48d8e8', 70, 200);
      game.waves.splice(i, 1); _engAddCombo(); game.sfxQueue.push('break');
    }
  }
  /* v10：分身（hazards.kind==='clone'）可被普攻打掉——2 下消失。
     「分身体型 0.85 倍、2 血」只有在玩家能反击时才是交互，否则只是一个会走过来的伤害源。
     v12：核心（hazards.kind==='core'）同构接入——普攻/连斩都能打，每下扣 1，破光转 stagger。 */
  const hzArr = game.hazards || (game.hazards = []); // v10：守卫式取数组（沙箱空转时也安全）
  for (let i = hzArr.length - 1; i >= 0; i--) {
    const hz2 = hzArr[i];
    // hitSeq：与敌人同口径「一摆一伤」——判定框存活 0.12s（7 帧），不记名会被同一刀连扣 7 次
    // totem 的 y 是地面线、h 向上长（与 mist 同口径）：直接拿 hz2 当矩形会判到地面以下，
    // 玩家明明砍在圣像身上却打不掉——受击判定必须换成立在地上的那个盒子。
    const hzBox = hz2.kind === 'totem' ? { x: hz2.x, y: hz2.y - hz2.h, w: hz2.w, h: hz2.h } : hz2;
    if ((hz2.kind !== 'clone' && hz2.kind !== 'core' && hz2.kind !== 'mirror'
         && hz2.kind !== 'totem' && hz2.kind !== 'egg')
        || hz2.hitSeq === p.atkSeq || !_engAabb(box, hzBox)) continue;
    hz2.hitSeq = p.atkSeq;
    if (hz2.kind === 'egg') {                        // v20：虫卵只扣 hp——打碎→爆幼虫的结算在 update 收尸处
      // ✗ 这里绝不能 splice：卵"被打碎"的结果不是消失，而是提前放出一只幼虫，
      //   在攻击路径里删掉它，玩家就永远看不到自己干了什么。
      hz2.hp -= 1; hz2.flashT = 0.18;
      _engAddCombo();
      _engFloat(hz2.x + hz2.w / 2, hz2.y - 4, '1', '#c8e070', 0);
      _engAddStars(hz2.x + hz2.w / 2, hz2.y + hz2.h / 2, 4, '#c8e070');
      game.sfxQueue.push('hit'); game.hitStop = _engHitStop;
      continue;
    }
    if (hz2.kind === 'totem') {                      // v16：圣像只扣 hp，碎裂/爆炸统一在 _engUpdateHazards 收尸
      hz2.hp -= 1; hz2.flashT = 0.08;
      _engFloat(hz2.x + hz2.w / 2, hz2.y - hz2.h - 4, '1', '#f8d048', 0);
      game.sfxQueue.push('hit'); game.hitStop = _engHitStop;
      continue;
    }
    if (hz2.kind === 'mirror') {                     // v13：真假身只扣 hp，结算统一在 _engUpdateHazards 收尸处
      hz2.hp -= 1; hz2.flashT = 0.15;
      _engFloat(hz2.x + hz2.w / 2, hz2.y - 4, '1', '#b060f0', 0);
      _engAddStars(hz2.x + hz2.w / 2, hz2.y + hz2.h / 2, 4, '#b060f0');
      _engAddCombo();
      game.sfxQueue.push('hit'); game.hitStop = _engHitStop;
      continue;
    }
    if (hz2.kind === 'core') {                       // v12：核心不吃 ATK，固定 1（3 下破一颗）
      _engFloat(hz2.x + hz2.w / 2, hz2.y - 4, '1', '#8ad8f8', 0);
      _engCoreHit(hzArr, hz2, 1);
      game.hitStop = _engHitStop;
      continue;
    }
    hz2.hp -= 1; hz2.flashT = 0.15;
    _engAddCombo();
    _engFloat(hz2.x + hz2.w / 2, hz2.y - 4, '' + dmg, '#b060f0', 0);
    _engAddStars(hz2.x + hz2.w / 2, hz2.y + hz2.h / 2, 4, '#b060f0');
    game.sfxQueue.push('hit'); game.hitStop = _engHitStop;
    if (hz2.hp <= 0) { hzArr.splice(i, 1); game.sfxQueue.push('kill'); }
  }
  _engCoreBreakCheck();   // v12：核心破光即破盾（放在循环后：同一摆打碎最后一颗也能当帧生效）
  // v5 §C：敌人分支重写——骑士正面格挡 / 存活击退白闪抖动 / 击杀击飞弹道；连击按「命中」计；
  // hitSeq：hit-stop 冻结后判定框仍存活，同一摆对同一敌人只结算一次（一摆一伤）
  for (const e of L.enemies) {
    if (e.dead > 0 || e.hitSeq === p.atkSeq || !_engAabb(box, e)) continue;
    const eface = _engSign(e.vx) || e.face || 1;
    // v6 §3.3：破绽态（盾击冲锋后 guardDown）正面格挡失效——正面也吃全额伤
    const front = (e.type === 'knight') && !e.guardDown && ((p.x + p.w / 2 > e.x + e.w / 2) === (eface > 0));
    e.hitSeq = p.atkSeq;
    if (front) { // v5 §4.3：攻击来自骑士面朝侧 → 0 伤害（背面/上方正常结算）
      e.kb = p.face * 98; // 推开 ≈8px（98²/(2*600)≈8，设计 §4.3；摩擦复用 _engKbFric）
      e.flashT = 0.10;
      game.sfxQueue.push('clank'); _engShake(1, 0.05);
      _engFloat(e.x + 6, e.y - 4, 'GUARD', '#ffffff', 0);
      _engAddStars(e.x + 6 + eface * 5, e.y + 8, 3, '#ffe9b0');
      continue;
    }
    _engAddCombo();                              // 连击按命中计（死活都 +1）
    e.hp = (e.hp === undefined ? 1 : e.hp) - dmg;
    if (e.hp > 0) {                              // 存活：击退 + 白闪 + 抖动（ui 表现）
      e.kb = p.face * _engKbV * (e.elite ? BAL.elite.kbMul : 1); e.flashT = 0.15; e.jitT = 0.15; // v7 §5.5-1：精英击退 ×0.25 重甲感
      game.hitStop = _engHitStop; _engShake(2, 0.05);
      _engFloat(e.x + 6, e.y - 4, '' + dmg, crit ? '#f8d048' : '#ffffff', crit ? 1 : 0);
      _engAddStars(e.x + 6, e.y + 6, 4 + (Math.random() * 3 | 0), '#ffffff');
      game.sfxQueue.push('hit');
    } else {                                     // 击杀：击飞弹道（死亡态积分，穿地）
      _engKillEnemy(e);                          // v3：击杀统一入口（30% 掉回复心）
      e.dvx = p.face * 130; e.dvy = -150;
      game.hitStop = _engHitStop; _engShake(4, 0.05);
      _engFloat(e.x + 6, e.y - 6, crit ? '2' : 'KO', crit ? '#f8d048' : '#ffffff', crit ? 1 : 0);
      _engAddParts(e.x + 6, e.y + 4, 12, e.type === 'bat' ? '#8858c8' : (e.type === 'knight' ? '#c8d0e8' : '#58c848'), 90, 250);
      game.sfxQueue.push('kill');
    }
  }
  // 炮弹：可被斩碎（v6 §3.4：法师火球 fire:true 火星色 #f86030）
  for (let i = game.bullets.length - 1; i >= 0; i--) {
    const b = game.bullets[i];
    if (_engAabb(box, b)) {
      game.bullets.splice(i, 1);
      _engAddParts(b.x + 4, b.y + 3, 8, b.fire ? '#f86030' : '#f8b020', 80, 200);
      game.sfxQueue.push('break');
    }
  }
  // 'B' 木箱砖：碎后内含 1 金币粒子 + 1 金币计数（v2 P3 与 levels 侧约定）；
  // v5 §2#12：碎砖金币 +1 走 floats、震屏 2、combo+1 保留。
  // v7 §4.2：'G' 隐藏砖——攻击打碎露出通道（无金币；respawn 不重建网格=保持已碎；永久消失）。
  _engRectTiles(L, box.x, box.y, box.w, box.h, function (tx, ty, ch) {
    if (ch === 'B') {
      L.tiles[ty][tx] = '.'; // 碎后从网格移除（respawn 不重建网格 → 保持已碎，与已收金币同理）
      game.coins += BAL.econ.brick;
      _engFloat(tx * _engTile + 8, ty * _engTile, '+' + BAL.econ.brick, '#f8d048', 0);
      _engShake(2, 0.05);
      _engAddParts(tx * _engTile + 8, ty * _engTile + 8, 10, '#c89858', 90, 300);
      _engAddParts(tx * _engTile + 8, ty * _engTile + 8, 4, '#f8d020', 70, 200);
      _engAddCombo();
      game.sfxQueue.push('break');
    } else if (ch === 'G') { // v7：隐藏砖——攻击打碎露出通道（无金币；碎墙计入连击=探索奖励）
      L.tiles[ty][tx] = '.';
      _engShake(3, 0.05);
      _engAddParts(tx * _engTile + 8, ty * _engTile + 8, 12, '#9a8ad0', 90, 300);
      _engAddCombo();
      game.sfxQueue.push('break');
    }
  });
  // v17：可碎装饰（石/桶/瓮/骨）——长得像箱子就该打得碎。奖励与木箱同口径：
  // +1 金币直入 game.coins（不进 totalCoin：星级分母=构造期快照，同宝箱 chestGem 先例）、碎屑粒子、+1 连击。
  for (const d of L.decorFx) {
    if (d.dead || d.got) continue;
    const H = _ENG_DECOR_HIT[d.type];
    if (H.cls !== 'break') continue;
    if (_engAabb(box, { x: d.x, y: d.y - H.h, w: H.w, h: H.h })) {
      d.dead = true;
      game.coins += BAL.econ.brick;
      _engFloat(d.x + H.w / 2, d.y - H.h - 4, '+' + BAL.econ.brick, '#f8d048', 0);
      _engShake(2, 0.05);
      _engAddParts(d.x + H.w / 2, d.y - H.h / 2, 10, '#b8a888', 90, 300);
      _engAddCombo();
      game.sfxQueue.push('break');
    }
  }
}

/* ==================== v19：法师远程弹体（game.shots，spec §2.6）====================
   唯一实现点：每帧步进 + 命中结算。调用点在 updateWorld ⑨⁗ 星刃之后、⑩ 玩家之前
   ⇒ hit-stop / 大招冻结语义与星刃同层（冻结期不推进，世界恢复后接着飞）。
   命中优先级（冻结）：Boss → 波 → hazards(clone/mirror/core/totem) → 敌人 → 敌弹 → 瓦片 → 装饰。
   hazards 只扣血/扣 hp，**不在此结算爆炸/破盾/收尸**（唯一结算点仍是 _engUpdateHazards）。
   弹体字段：kind('bolt'|'lance'|'seek') / base(基础伤害) / dmg(上一次结算值，ui 只读) /
   pierce(剩余可命中目标数，含首个) / hitList(已命中目标，防同一发重复打同一目标) /
   homeR/homeDeg/turn(追踪) / face / manaGain(命中回蓝，仅 bolt/seek)。 */
function _engShotHome(s, L, dt) { // 内部（v19）：追踪修正——只有普攻 bolt 用（±homeDeg 锥内轻微垂直修正）；冰锥 homeR=0 直接返回
  if (!(s.homeR > 0) || !(s.turn > 0)) return;
  const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
  let tx = 0, ty = 0, best = s.homeR, found = false;
  const b = game.boss; // Boss 优先（Boss 战不追召唤体，否则六发全打在杂兵身上）
  if (b && b.state !== 'dormant' && b.state !== 'dead' && b.state !== 'dying'
      && b.state !== 'intro' && !b.hidden) {
    const bx = b.x + b.w / 2, by = b.y + b.h / 2, d = Math.hypot(bx - cx, by - cy);
    if (d <= best) { best = d; tx = bx; ty = by; found = true; }
  }
  if (!found) for (const e of L.enemies) {
    if (e.dead > 0) continue;
    const ex = e.x + e.w / 2, ey = e.y + e.h / 2, d = Math.hypot(ex - cx, ey - cy);
    if (d <= best) { best = d; tx = ex; ty = ey; found = true; }
  }
  if (!found) return;                                  // 无目标：直飞（普攻的默认手感）
  const cur = Math.atan2(s.vy, s.vx), want = Math.atan2(ty - cy, tx - cx);
  let da = want - cur;
  while (da > Math.PI) da -= Math.PI * 2;              // 归一化到 [-π, π]（否则跨 ±π 会甩头）
  while (da < -Math.PI) da += Math.PI * 2;
  if (s.homeDeg > 0 && Math.abs(da) > s.homeDeg * Math.PI / 180) return; // 锥外不修正（直射手感优先）
  const na = cur + _engClamp(da, -s.turn * dt, s.turn * dt);
  const sp = Math.hypot(s.vx, s.vy) || 1;
  s.vx = Math.cos(na) * sp; s.vy = Math.sin(na) * sp;  // 只转向不改速度
}

function _engShotHitEnemy(s, e) { // 内部（v19）：弹体命中敌人——结算与骑士攻击分支同口径，返回 true=弹体应销毁
  // 伤害/暴击在出膛时已锁定（spec §2.3/§2.6）：bolt 带出膛暴击，lance/seek 为固定 3/2 伤（crit=0）
  const crit = !!s.crit;
  const dmg = s.dmg || s.base; // 出膛即定的实际伤害（Boss/敌人同读；不在命中时复算暴击）
  s.hitList.push(e);
  _engAddCombo();                                      // 连击按命中计（死活都 +1，同骑士）
  if (s.kind === 'shard') {                            // v19.3：冰锥命中 → 炸冰屑 + 冻结
    _engAddParts(e.x + 6, e.y + 6, 5, '#d8f4ff', 110, 200);
    _engAddParts(e.x + 6, e.y + 6, 3, '#7ad0f8', 80, 160);
    e.novaSeq = s.novaSeq;                             // 记名：同一次新星不再二次结算
    if (s.freeze > 0) e.freezeT = Math.max(e.freezeT || 0, s.freeze);
  }
  e.hp = (e.hp === undefined ? 1 : e.hp) - dmg;
  if (e.hp > 0) {                                      // 存活：击退 + 白闪 + 抖动
    e.kb = (_engSign(s.vx) || s.face || 1) * _engKbV * (e.elite ? BAL.elite.kbMul : 1);
    e.flashT = 0.15; e.jitT = 0.15;
    game.hitStop = _engHitStop; _engShake(2, 0.05);
    _engFloat(e.x + 6, e.y - 4, '' + dmg, crit ? '#f8d048' : '#ffffff', crit ? 1 : 0);
    _engAddStars(e.x + 6, e.y + 6, 4 + (Math.random() * 3 | 0), '#ffffff');
    game.sfxQueue.push('hit');
  } else {                                             // 击杀：唯一入口（封印计数/掉落全在这里）
    _engKillEnemy(e);
    e.dvx = (_engSign(s.vx) || s.face || 1) * 130; e.dvy = -150;
    game.hitStop = _engHitStop; _engShake(4, 0.05);
    _engFloat(e.x + 6, e.y - 6, crit ? '2' : 'KO', crit ? '#f8d048' : '#ffffff', crit ? 1 : 0);
    _engAddParts(e.x + 6, e.y + 4, 12, e.type === 'bat' ? '#8858c8' : (e.type === 'knight' ? '#c8d0e8' : '#58c848'), 90, 250);
    game.sfxQueue.push('kill');
  }
  // 回蓝：只对 bolt 与 seek（长矛不回蓝，防「一矛穿三」瞬间回满）
  if (s.manaGain) game.mana = Math.min(game.manaMax,
    (Number.isFinite(game.mana) ? game.mana : 0) + s.manaGain);
  s.pierce--;                                          // pierce = 可命中目标数（含首个）；扣到 0 即回收
  return s.pierce <= 0;
}

function _engMageMeteorHit(L, m) { // 内部（v19，spec §1.2/§2.7）：法师陨星砸敌人——按 m.dmg 结算，**不秒杀小怪**
  // 骑士星陨是「大招秒杀 + 清弹幕」，法师大招的等价价值是「6×3 点伤害」，所以这里只扣血。
  const md = m.dmg || BAL.skills.u.dmg;
  for (const e of L.enemies) {
    if (e.dead > 0 || !_engAabb(m, e)) continue;
    e.hp = (e.hp === undefined ? 1 : e.hp) - md;
    _engAddCombo();
    if (e.hp > 0) {
      e.kb = (_engSign(e.vx) || 1) * 90; e.flashT = 0.15; e.jitT = 0.15;
      _engFloat(e.x + 6, e.y - 4, '' + md, '#8ae8ff', 0);
      game.sfxQueue.push('hit');
    } else {
      _engKillEnemy(e); e.dvx = 0; e.dvy = -150;
      _engFloat(e.x + 6, e.y - 6, 'KO', '#8ae8ff', 0);
      game.sfxQueue.push('kill');
    }
    return true;
  }
  return false;
}

/* ==================== v19.3：引力奇点（game.wells，L 技能）====================
   三段生命周期，全在一个函数里推：
   ① 飞行：0.5s（或撞到实心瓦片）后停住，飞行段拖紫尾；
   ② 停驻：存续 1.1s，每帧把半径内的敌人朝中心拉（直接改 e.x/e.y —— 敌 AI 本帧已经把速度积分过，
      这里再叠一次位移就是「吸」；同时清 vx/vy，让被吸住的东西看起来是失去控制的）；
   ③ 引爆：半径内敌人 dmg 伤 + 向外击退，Boss 走 _engBossHurt。碎片、光环、震屏一并给出。
   为什么不用 game.hazards：hazards 有自己的一整套收尸/破盾规则（clone/core/mirror/totem），
   塞进去会污染那四条分支；独立数组最省事，且换关/复活一并清空。 */
function _engUpdateWells(dt) {
  const arr = game.wells;
  if (!arr || !arr.length) return;
  const L = game.level;
  for (let i = arr.length - 1; i >= 0; i--) {
    const w = arr[i];
    const cx = w.x + w.w / 2, cy = w.y + w.h / 2;
    if (!w.stopped) {
      w.t += dt;
      w.x += w.vx * dt;
      const tx = Math.floor((w.x + w.w / 2) / _engTile), ty = Math.floor((w.y + w.h / 2) / _engTile);
      if (w.t >= (w.stopT || 0.5) || L.solid(tx, ty, game.switchState)) {
        w.stopped = true;
        _engFx(cx, cy, { ring: 1, r: 4, r1: 34, life: 0.3, life0: 0.3, color: '#b090f8' });
        game.sfxQueue.push('wellStop');
      }
      if (!w.stopped) {
        w.trail = (w.trail || 0) - dt;
        if (w.trail <= 0) { w.trail = 0.04;
          _engFx(cx, cy, { vx: -w.vx * 0.2, vy: (Math.random() * 2 - 1) * 24, life: 0.26, color: '#8a58d8', size: 2 }); }
        continue;
      }
    }
    w.life -= dt;
    /* ② 吸附：半径内的敌人每帧朝中心挪 pull·dt，并清零速度（失去控制感） */
    for (const e of L.enemies) {
      if (e.dead > 0) continue;
      const ex = e.x + e.w / 2, ey = e.y + e.h / 2;
      const dx = cx - ex, dy = cy - ey, d = Math.sqrt(dx * dx + dy * dy);
      /* 收到 17px 就停：再往里会全部叠在黑洞核心上，玩家看不见自己打的是什么。
         停在核外一圈，既看得出「被拢住」，又能逐个数清有几只。 */
      if (d > w.r || d < 17) continue;
      const f = Math.min(w.pull * dt, d - 17);
      e.x += dx / d * f; e.y += dy / d * f;
      e.vx = 0; e.vy = 0;
    }
    /* 吸力可视化：每 0.05s 在环上生一枚朝内飞的紫点（20/s，远低于 fx 上限 60） */
    w.fx = (w.fx || 0) - dt;
    if (w.fx <= 0) { w.fx = 0.05;
      const a = Math.random() * Math.PI * 2, rr = w.r * (0.55 + Math.random() * 0.45);
      const sx = cx + Math.cos(a) * rr, sy = cy + Math.sin(a) * rr;
      _engFx(sx, sy, { vx: (cx - sx) * 1.8, vy: (cy - sy) * 1.8, life: 0.34,
        color: Math.random() < 0.5 ? '#c8a8ff' : '#8a58d8', size: 2 }); }
    if (w.life > 0) continue;
    /* ③ 引爆 */
    for (const e of L.enemies) {
      if (e.dead > 0) continue;
      const ex = e.x + e.w / 2, ey = e.y + e.h / 2;
      const dx = ex - cx, dy = ey - cy, d = Math.sqrt(dx * dx + dy * dy);
      if (d > w.r) continue;
      e.hp = (e.hp === undefined ? 1 : e.hp) - w.dmg;
      _engAddCombo();
      if (e.hp > 0) {
        e.kb = (_engSign(dx) || 1) * _engKbV * (e.elite ? BAL.elite.kbMul : 1);
        e.flashT = 0.15; e.jitT = 0.15;
        _engFloat(e.x + 6, e.y - 4, '' + w.dmg, '#c8a8ff', 0);
        game.sfxQueue.push('hit');
      } else {
        _engKillEnemy(e);
        e.dvx = (_engSign(dx) || 1) * 140; e.dvy = -160;
        _engFloat(e.x + 6, e.y - 6, 'KO', '#c8a8ff', 0);
        game.sfxQueue.push('kill');
      }
    }
    if (game.boss && _engAabb({ x: cx - w.r, y: cy - w.r, w: w.r * 2, h: w.r * 2 }, game.boss)
        && _engBossHurt(w.dmg)) {
      _engFloat(game.boss.x + 26, game.boss.y - 4, '' + game.boss.lastDmg, '#c8a8ff', 0);
      game.sfxQueue.push('hit');
    }
    _engAddParts(cx, cy, 22, '#b090f8', 150, 0);
    _engAddParts(cx, cy, 12, '#e8d8ff', 110, 0);
    _engAddStars(cx, cy, 8, '#c8a8ff');
    _engFx(cx, cy, { ring: 1, r: 6, r1: w.r, life: 0.36, life0: 0.36, color: '#c8a8ff' });
    _engShake(6, 0);
    game.hitStop = _engHitStop;
    game.sfxQueue.push('wellBoom');
    arr.splice(i, 1);
  }
}

function _engUpdateShots(dt) { // 内部（v19）：法师弹体步进（updateWorld ⑨⁗ 星刃之后、⑩ 玩家之前调用）
  const L = game.level, p = game.player;
  const arr = game.shots || (game.shots = []);
  if (!L || !p) { arr.length = 0; return; }
  const hzArr = game.hazards || (game.hazards = []);
  for (let i = arr.length - 1; i >= 0; i--) {          // 倒序 + splice(i,1)：不会跳过后续元素
    const s = arr[i];
    if (!s) { arr.splice(i, 1); continue; }
    // 坐标自愈（v7.4 口径）：NaN 弹体会污染浮字/相机（渲染抛错），直接回收
    if (!Number.isFinite(s.x) || !Number.isFinite(s.y) || !Number.isFinite(s.vx) || !Number.isFinite(s.vy)) {
      arr.splice(i, 1); continue;
    }
    /* v19.1：出生延迟（born，仅 seek 用）——倒计时期间不动、不判定、不扣寿命（射程不变），
       ui 侧跳过渲染。三枚因此按 0.07s 依次出膛，屏幕上拉开约 16px，一眼数得出「三枚」。 */
    if (s.born > 0) { s.born -= dt; continue; }
    s.life -= dt;
    if (s.life <= 0) { arr.splice(i, 1); continue; }   // 超时回收（射程 = v × life）
    _engShotHome(s, L, dt);                            // 追踪：先转向再位移
    s.x += s.vx * dt; s.y += s.vy * dt;
    /* v19.3：冰锥不拖尾——一次新星 8 枚同时飞，再给拖尾会瞬间打满 fx 上限 60（BAL.guard.fx）。
       辨识度靠「八向同爆 + 命中冻结的冰壳」，不靠尾迹。 */
    if (s.kind === 'shard') {
      s.trail = (s.trail || 0) - dt;
      if (s.trail <= 0) { s.trail = 0.09;             // 8 枚 × 11/s ≈ 88 枚/s，单枚活 0.2s ⇒ 同屏约 18，远低于上限 60
        _engFx(s.x + 3, s.y + 3, { vx: -s.vx * 0.1, vy: -s.vy * 0.1, life: 0.2, color: '#cdeeff', size: 1 }); }
    }
    if (s.x < -24 || s.x > L.w * _engTile + 24 || s.y < -96 || s.y > L.h * _engTile + 48) {
      arr.splice(i, 1); continue;                      // 越界回收（左右各留 24px 余量）
    }
    let dead = false;
    /* ① Boss：命中即删（穿透对 Boss 无效）。免疫态（parry/coreOn/blink/mirror）由 _engBossHurt 返回 false，
       弹体照样消失（打在护罩上），但不计连击、不浮字。 */
    if (game.boss && _engAabb(s, game.boss)) {
      const crit = !!s.crit;                            // 出膛即锁（spec §2.3；命中不再复算）
      const dmg = s.dmg || s.base;
      // v19.3：同一次霜爆新星对 Boss 也只结算一次（八道冰锥会同时插在 Boss 身上）
      if (s.kind === 'shard') {
        if (game.boss.novaSeq === s.novaSeq) { arr.splice(i, 1); continue; }
        game.boss.novaSeq = s.novaSeq;
      }
      if (_engBossHurt(dmg, !!s.isUlt)) {
        const b = game.boss;
        _engAddCombo(); _engAddCombo();                // 同骑士普攻：Boss 命中 +2 连击
        _engFloat(b.x + b.w / 2, b.y - 4, '' + b.lastDmg, crit ? '#f8d048' : '#ffffff', crit ? 1 : 0);
        game.hitStop = _engHitStop; game.sfxQueue.push('hit');
      }
      arr.splice(i, 1); continue;
    }
    /* ② 波（Boss 落地冲击波）：同骑士斩波口径——碎掉 +1 连击；弹体继续飞（波不是实体墙） */
    for (let j = game.waves.length - 1; j >= 0; j--) {
      if (!_engAabb(s, game.waves[j])) continue;
      _engAddParts(game.waves[j].x + 6, game.waves[j].y + 5, 6, '#48d8e8', 70, 200);
      game.waves.splice(j, 1); _engAddCombo(); game.sfxQueue.push('break');
    }
    /* ③ hazards（clone/mirror/core/totem）：只扣血，**不在此结算**爆炸/破盾/收尸；命中即止 */
    for (let j = hzArr.length - 1; j >= 0 && !dead; j--) {
      const hz = hzArr[j];
      if (!hz || (hz.kind !== 'clone' && hz.kind !== 'core' && hz.kind !== 'mirror' && hz.kind !== 'totem')) continue;
      // totem 的 y 是地面线、h 向上长（与 mist 同口径）：判定盒必须换成立在地上的那个盒子
      const hzBox = hz.kind === 'totem' ? { x: hz.x, y: hz.y - hz.h, w: hz.w, h: hz.h } : hz;
      if (s.hitList.indexOf(hz) >= 0 || !_engAabb(s, hzBox)) continue;
      s.hitList.push(hz);
      if (hz.kind === 'totem') {                       // 圣像：扣 1，碎裂/爆炸在 _engUpdateHazards 收尸
        hz.hp -= 1; hz.flashT = 0.08;
        _engFloat(hz.x + hz.w / 2, hz.y - hz.h - 4, '1', '#f8d048', 0);
        game.sfxQueue.push('hit'); game.hitStop = _engHitStop;
      } else if (hz.kind === 'mirror') {               // 真假身：只扣 1，显形/爆炸唯一结算点在收尸处
        hz.hp -= 1; hz.flashT = 0.15;
        _engFloat(hz.x + hz.w / 2, hz.y - 4, '1', '#b060f0', 0);
        _engAddStars(hz.x + hz.w / 2, hz.y + hz.h / 2, 4, '#b060f0');
        _engAddCombo(); game.sfxQueue.push('hit'); game.hitStop = _engHitStop;
      } else if (hz.kind === 'core') {                 // 核心：固定 1（同骑士；不吃 ATK/暴击）
        _engFloat(hz.x + hz.w / 2, hz.y - 4, '1', '#8ad8f8', 0);
        _engCoreHit(hzArr, hz, 1);                     // 归零即碎；破盾由 _engUpdateHazards 的 _engCoreBreakCheck 收
        game.hitStop = _engHitStop;
      } else {                                         // 分身：扣 s.dmg（出膛即定；不吃命中时暴击，同骑士 clone 口径）
        const cdmg = s.dmg || s.base;
        hz.hp -= cdmg; hz.flashT = 0.15;
        _engAddCombo();
        _engFloat(hz.x + hz.w / 2, hz.y - 4, '' + cdmg, '#b060f0', 0);
        _engAddStars(hz.x + hz.w / 2, hz.y + hz.h / 2, 4, '#b060f0');
        game.sfxQueue.push('hit'); game.hitStop = _engHitStop;
      }
      dead = true;
    }
    if (dead) { arr.splice(i, 1); continue; }
    /* ④ 敌人：hitList 防重复；远程击杀同样走唯一 _engKillEnemy（封印/掉落/回蓝一致） */
    for (const e of L.enemies) {
      if (e.dead > 0 || s.hitList.indexOf(e) >= 0 || !_engAabb(s, e)) continue;
      if (s.kind === 'shard' && e.novaSeq === s.novaSeq) continue;  // v19.3：同一次新星只结算一次
      if (_engShotHitEnemy(s, e)) { dead = true; break; }
    }
    if (dead) { arr.splice(i, 1); continue; }
    /* ⑤ 敌弹：双方销毁 + 火星粒子（同骑士斩弹口径） */
    for (let j = game.bullets.length - 1; j >= 0; j--) {
      const b2 = game.bullets[j];
      if (!_engAabb(s, b2)) continue;
      game.bullets.splice(j, 1);
      _engAddParts(b2.x + 4, b2.y + 3, 8, b2.fire ? '#f86030' : '#f8b020', 80, 200);
      game.sfxQueue.push('break');
      dead = true; break;
    }
    if (dead) { arr.splice(i, 1); continue; }
    /* ⑥ 瓦片：'B' 碎+金币+连击 / 'G' 碎+连击 / 其余实心（# I ( ) 开关砖 门 崩塌砖）→ 停 */
    _engRectTiles(L, s.x, s.y, s.w, s.h, function (tx, ty, ch) {
      if (dead) return;
      if (ch === 'B') {
        L.tiles[ty][tx] = '.';
        game.coins += BAL.econ.brick;
        _engFloat(tx * _engTile + 8, ty * _engTile, '+' + BAL.econ.brick, '#f8d048', 0);
        _engShake(2, 0.05);
        _engAddParts(tx * _engTile + 8, ty * _engTile + 8, 10, '#c89858', 90, 300);
        _engAddParts(tx * _engTile + 8, ty * _engTile + 8, 4, '#f8d020', 70, 200);
        _engAddCombo(); game.sfxQueue.push('break');
        dead = true;
      } else if (ch === 'G') {                          // 隐藏砖：碎后永久消失（无金币，计连击）
        L.tiles[ty][tx] = '.';
        _engShake(3, 0.05);
        _engAddParts(tx * _engTile + 8, ty * _engTile + 8, 12, '#9a8ad0', 90, 300);
        _engAddCombo(); game.sfxQueue.push('break');
        dead = true;
      } else if (L.solid(tx, ty, game.switchState)) {
        if (s.kind === 'shard' && !s.hitWall) {        // v19.3：冰锥撞墙/砖 = 炸一小蓬冰屑（不是静默消失）
          s.hitWall = 1;
          _engAddParts(s.x + 3, s.y + 3, 4, '#d8f4ff', 100, 220);
          _engAddParts(s.x + 3, s.y + 3, 2, '#48a8e0', 70, 180);
        }
        dead = true;
      }
    });
    if (dead) { arr.splice(i, 1); continue; }
    /* ⑦ 装饰（可碎类，长得像箱子就打得碎）：同骑士结算 +1 金币 +1 连击；弹体不因碎屑停下 */
    for (const d of L.decorFx) {
      if (d.dead || d.got) continue;
      const H = _ENG_DECOR_HIT[d.type];
      if (H.cls !== 'break') continue;
      if (_engAabb(s, { x: d.x, y: d.y - H.h, w: H.w, h: H.h })) {
        d.dead = true;
        game.coins += BAL.econ.brick;
        _engFloat(d.x + H.w / 2, d.y - H.h - 4, '+' + BAL.econ.brick, '#f8d048', 0);
        _engShake(2, 0.05);
        _engAddParts(d.x + H.w / 2, d.y - H.h / 2, 10, '#b8a888', 90, 300);
        _engAddCombo(); game.sfxQueue.push('break');
      }
    }
  }
}

/* ==================== 玩家物理（契约第 3 节算法 1/2/3/7） ==================== */
function _engUpdatePlayer(dt, L, p) {
  // 死亡冻结 0.9s 后重生（契约算法 12）
  if (p.dead) { p.deadT += dt; if (p.deadT >= 0.9) respawn(); return; }

  /* ---- v19（spec §2.8）：法师法力自然回复 3/s（v20.4：5→3）+ 「法力不足」提示计时 ----
     骑士 usesMana=false ⇒ 本块整段跳过（mana 恒 0，零行为变化/零浮点累加）。 */
  if (_engHero().usesMana) {
    const manaNow = Number.isFinite(game.mana) ? game.mana : 0;
    game.mana = Math.min(game.manaMax, manaNow + BAL.heroes.mage.manaRegen * dt); // 上限 100，永不 NaN
    game.manaToast = Math.max(0, (game.manaToast > 0 ? game.manaToast : 0) - dt);
  }

  /* ---- 输入（只读 game.input） ---- */
  const dir = (game.input.right ? 1 : 0) - (game.input.left ? 1 : 0);

  /* ---- v2 P1：攻击 / 冲刺（边沿消费 + 冷却门控）---- */
  p.atkCd -= dt; p.dashCd -= dt; p.atkT -= dt; p.dashT -= dt;
  p.invT -= dt; p.castT -= dt; // v3：无敌/施法计时（护盾 v5 单独带破盾判定，见下）
  p.atkAnim -= dt; // v5 §C：攻击总动画计时（0.25s=起手+判定+余韵，ui 渲染弧光用）
  if (p.atkWind > 0) { p.atkWind -= dt; if (p.atkWind <= 0) p.atkT = _engAtkDur; } // 起手毕→开判定
  if (p.shieldT > 0) { // v5 §3.3：护盾计时——自然到期也触发破盾事件
    p.shieldT -= dt;
    if (p.shieldT <= 0) { p.shieldT = 0; _engShieldBreak(); }
  }
  if (game.input.attackHit) {
    game.input.attackHit = 0; // 消费边沿（空挥也进入冷却，防止按住刷判定）
    p.abuf = _engAtkBuf;      // v7.7：改存缓冲——冷却中按下不再被吞（原先 atkCd>0 时边沿直接丢弃，0.35s 冷却里连按只剩「没反应」）
  }
  if (p.abuf > 0) {           // v7.7：缓冲到点即起手（对照空洞骑士「按下=出手」，冷却只限频率、不吃输入）
    p.abuf -= dt;
    if (p.atkCd <= 0 && p.dashT <= 0) { // v5 §C：冲刺期间不起手（三段占用操控）
      p.abuf = 0;
      // v19（spec §2.4）：法师攻速取英雄表（0.46s，v20.4：0.38→0.46），骑士仍走 _engAtkCd（0.35s，字节等价）
      p.atkCd = _engHero().usesMana ? BAL.heroes.mage.bolt.cd : _engAtkCd;
      p.atkAnim = _engAtkAnim; p.atkWind = _engAtkWind; p.atkT = 0;
      p.atkSeq = (p.atkSeq || 0) + 1; // v5：新摆新序号（§N.c 一摆一伤口径）
      game.sfxQueue.push('swing'); // v5 §H：呼啸（原 'slash' 废弃）
    }
  }
  if (game.input.dashHit) {
    game.input.dashHit = 0;
    if (p.dashCd <= 0) {
      p.dashCd = _engDashCd; p.dashT = _engDashDur; // v5 §B：总时长 0.28（原 0.18）；v7.7：冷却回到基础值 0.5s（局外成长已删）
      p.dashDir = dir !== 0 ? dir : p.face; // 有方向输入用输入向，否则用面向
      // v7.9：起手给无敌帧（与受伤无敌同一套 invT 判定，伤害/击退/即死物全部覆盖——
      // 走 _engHurtPlayer 与 _engHazardHit 两条既有路径，不另开分支，避免出现「闪了但照样死」的交互不一致）。
      // v14：0.10 → 0.15（见 BAL.dash 注释）。
      p.invT = Math.max(p.invT, BAL.dash.inv);
      game.sfxQueue.push('dash');
      _engAddParts(p.x + 5 - p.dashDir * 6, p.y + 7, 6, '#48d8e8', 60, 0);
    }
  }

  /* ---- v3：技能 U/I/O（边沿消费 + CD/连击门控，结构同攻击/冲刺块） ---- */
  _engUpdateSkills(dt);

  // 站立地面材质：冰面低摩擦 / 传送带推力（脚下一行瓦片）
  let onIce = false, convL = false, convR = false;
  if (p.onGround) {
    const fy = Math.floor((p.y + p.h + 0.5) / _engTile);
    const fx0 = Math.floor(p.x / _engTile), fx1 = Math.floor((p.x + p.w - _engEps) / _engTile);
    for (let tx = fx0; tx <= fx1; tx++) {
      const ch = L.tileAt(tx, fy);
      if (ch === 'I') onIce = true;
      else if (ch === '(') convL = true;
      else if (ch === ')') convR = true;
    }
  }

  // 水平：冲刺三段锁定（v5 §B）/ 加速（空中 0.75×/转向 1.5×）/ 摩擦（地面全额、空中 drag 240）/ 限速
  const prevFace = p.face; // v5 §A：转身 squash 检测基准
  if (p.dashT > 0) {
    const el = _engDashDur - p.dashT; // 已流逝秒
    p.face = p.dashDir;
    if (el < 0.05) {
      // v7.7：蓄力段不再把跑速砍到 60——原来「120 跑着按冲刺」会先掉到 60 再爆到 260，起手有 3 帧顿挫。
      // 同向保留当前速度（≤dashV），反向/静止仍 60：只增不减，冲刺距离不缩水。
      p.vx = p.dashDir * ((_engSign(p.vx) === p.dashDir) ? Math.max(60, Math.min(_engDashV, Math.abs(p.vx))) : 60);
    } else if (el < 0.23) { // 爆发段
      p.vx = p.dashDir * _engDashV;
      p.windT = (p.windT || 0) - dt;
      if (p.windT <= 0) { p.windT = 0.03; // 每 0.03s 推 1 枚风粒子（fx 层，青白细长）
        _engFx(p.x + 5 - p.dashDir * 7, p.y + 4 + Math.random() * 8,
          { vx: -p.dashDir * 90, vy: 0, life: 0.22, color: '#bfeaff', size: 1 }); }
    } else { // 滑行段：260 → maxRun 线性回落（缓冲急停，不再匀速滑块急停）
      const k = (_engDashDur - el) / (_engDashDur - 0.23);
      p.vx = p.dashDir * (PHY.maxRun + (_engDashV - PHY.maxRun) * k);
    }
  } else if (dir !== 0) {
    const turning = _engSign(p.vx) !== 0 && _engSign(p.vx) !== dir;
    if (p.onGround) p.vx += dir * PHY.acc * dt;
    else p.vx += dir * PHY.acc * (turning ? _engAirTurn : _engAirAcc) * dt; // v5 §1.2：空中同向 .75 / 转向 1.5
    p.face = dir;
  } else if (p.onGround) { // 地面摩擦（原逻辑）
    const s = _engSign(p.vx);
    p.vx -= s * (onIce ? PHY.fricIce : PHY.fric) * dt;
    if (_engSign(p.vx) !== s) p.vx = 0;
  } else { // v5 §1.2：空中无输入——微阻尼保留漂移惯性（不再全额摩擦）
    const s = _engSign(p.vx);
    if (s !== 0) { p.vx -= s * _engAirDrag * dt; if (_engSign(p.vx) !== s) p.vx = 0; }
  }
  // v6 §C：装备披风移速加成（波1 恒 0 → effRun=maxRun=120，零行为变化）
  // v18 §一：水雾减速（boss2）——p.mistT 由雾 hazard 接触帧刷新、此处逐帧衰减。
  // 只压普跑钳制上限；dash 分支（p.dashT>0）不进这条钳制 ⇒ 冲刺穿雾不减速（操作奖励）。
  if (p.mistT > 0) p.mistT -= dt;
  if (p.webNoJump > 0) p.webNoJump -= dt;   // v20：蛛网禁跳窗口（由 web hazard 接触帧刷新，同 mistT 口径）
  const effRun = PHY.maxRun * (1 + (game.equip ? game.equip.spd : 0))
               * (p.mistT > 0 ? (p.mistSlow || 0.5) : 1);
  if (p.dashT <= 0) p.vx = _engClamp(p.vx, -effRun, effRun);
  /* ---- v8.0 任务1：传送带（独立带速 p.convV，不占用 p.vx） ----
     为什么必须独立：旧写法 `p.vx = clamp(p.vx + 520*dt, -170, 170)` 看似把速度顶到 170，
     但下一帧开头 `p.vx = clamp(p.vx, -effRun, effRun)` 立刻砍回 120 —— 顺向跑时传送带
     实际只贡献 20px/s，而逆向时又刚好抵掉 50px/s。这就是「传送带太慢没用」的根因。
     现在带速单独积分、单独钳制（1200 / 280），与跑速代数相加：
       站住 = 280；顺向跑 = 120+280 = 400（≈3.3 倍跑速）；逆向跑 = -120+280 = 160（被缓慢推回）。
     冲刺中不带电（沿用旧规则「冲刺不吃传送带」），带速清零 —— 否则逆向冲刺会被带速抵消。 */
  const cdir = (convR ? 1 : 0) + (convL ? -1 : 0);
  if (p.dashT > 0) p.convV = 0;
  else if (p.onGround && cdir !== 0) {
    p.convV = _engClamp(p.convV + cdir * _engConvAcc * dt, -_engConvCap, _engConvCap);
  } else if (p.convV) { // 离开带面：0.16s 内衰减到 0（保留一点惯性手感，但不会把玩家甩过整段跳距）
    const s = _engSign(p.convV);
    p.convV -= s * 1800 * dt;
    if (_engSign(p.convV) !== s) p.convV = 0;
  }
  // v5 §1.4：转身 squash（face 翻转瞬间 |vx|>80 → turnT 0.12，ui 横向 0.72→1 回弹）
  if (p.face !== prevFace && Math.abs(p.vx) > 80) p.turnT = 0.12;
  // v5 §1.4：脚步尘土——地面 |vx|>60 且非冲刺，每 0.18s 1 粒，位置脚跟偏后 4px
  if (p.onGround && Math.abs(p.vx) > 60 && p.dashT <= 0) {
    p.stepT -= dt;
    if (p.stepT <= 0) { p.stepT = 0.18;
      _engAddParts(p.x + 5 - p.face * 4, p.y + 13, 1, (L.theme && L.theme.dust) || '#ffffff', 25, 120); }
  } else p.stepT = 0;

  // 跳跃：边沿即时判定（地面跳含土狼 → 二段跳 → 缓冲）+ 土狼时间（契约算法 2；v5 §1.1 重构）
  if (game.input.jumpHit) {
    game.input.jumpHit = 0; // 消费边沿（边沿到达即判：能地面跳先地面跳）
    /* v20：蛛网禁跳。边沿在这里就被吃掉、并且不写 jbuf——写缓冲的话玩家离网那一帧
       会自动弹起来，观感是"网没关住"。这条必须在地面跳之前，否则地面跳已经起跳了。 */
    if (p.webNoJump > 0) { p.jbuf = 0; }
    else if (p.onGround || p.coyote > 0) {               // 地面跳（含土狼窗口）
      p.vy = -PHY.jumpV; p.jbuf = 0; p.coyote = 0;
      p.onGround = false; p.standOn = null;
      p.jumpCut = true; // 普通跳才吃松手截断；弹簧/踩踏/二段跳免疫
      game.sfxQueue.push('jump');
      _engAddParts(p.x + 5, p.y + 14, 8, (L.theme && L.theme.dust) || '#ffffff', 55, 220); // v2 P1：起跳粒子
    } else if (p.airJumps > 0 && !p.springAir) {         // v5 §1.1：二段跳（新鲜边沿直接消费）
      p.vy = -PHY.jumpV * _engDjV; p.airJumps--; p.jbuf = 0;
      p.jumpCut = false;                                 // 固定高度：不吃松手截断
      p.djT = _engDjT;                                   // 空翻演出（ui 绕脚底旋转）
      game.sfxQueue.push('djump');
      _engFx(p.x + 5, p.y + 12, { ring: 1, r: 3, r1: 15, life: 0.3, color: '#e8f8ff' }); // 白色气环（fx 层）
    } else p.jbuf = PHY.buffer;                          // v5 §1.1：无二段跳可用才进缓冲（防落地前误烧）
  }
  p.jbuf -= dt; p.coyote -= dt;
  if (p.onGround) { p.coyote = PHY.coyote; p.airJumps = 1; p.springAir = false; } // v5：落地刷新土狼+二段跳+解锁弹簧锁
  if (p.jbuf > 0 && p.coyote > 0) {                    // 缓冲落地跳：条件与原版完全一致，不改
    p.vy = -PHY.jumpV; p.jbuf = 0; p.coyote = 0;
    p.onGround = false; p.standOn = null;
    p.jumpCut = true; // 普通跳才吃松手截断；弹簧/踩踏弹跳免疫
    game.sfxQueue.push('jump');
    _engAddParts(p.x + 5, p.y + 14, 8, (L.theme && L.theme.dust) || '#ffffff', 55, 220); // v2 P1：起跳粒子加强 4→8
  }
  // v7.7：去掉 prevJump 前提——缓冲跳（落地瞬间自动补跳）同样吃松手截断。
  // 原来「按一下就在空中松开、落地才生效」的缓冲跳永远满高，短按有时矮有时满，手感不一致。
  if (p.jumpCut && p.vy < 0 && !game.input.jump) p.vy *= 0.45;
  p.prevJump = game.input.jump ? 1 : 0; // v7.7：仅保留记录（不再参与截断判定）
  { // v5 §B：重力减半仅冲刺爆发段（0.05~0.23s）；蓄力/滑行正常重力
    // v9 下落手感：上升用 PHY.grav(1320)、下落用 PHY.gravFall(850)；|vy| ≤ apexBand 时再乘 apexMul，
    // 让顶点附近多滞空；按住↓速降额外 ×fastGravMul（上限仍 BAL.fall.fast=360）。
    const dashEl = p.dashT > 0 ? _engDashDur - p.dashT : -1;
    let g = p.vy > 0 ? PHY.gravFall : PHY.grav;
    if (Math.abs(p.vy) <= PHY.apexBand) g *= PHY.apexMul;
    if (!p.onGround && game.input.down && p.vy > 0) g *= PHY.fastGravMul;
    if (dashEl >= 0.05 && dashEl < 0.23) g *= _engDashGrav;
    // v6 §1.3 速降：空中按住 input.down → 上限恢复旧值 360（BAL.fall.fast），否则 205（PHY.maxFall）。
    // 风柱交互不变：'w' 净上力与落速上限无关，按↓不破解风谜题（设计书 §1.3）。
    const cap = (!p.onGround && game.input.down) ? BAL.fall.fast : PHY.maxFall;
    p.vy = Math.min(p.vy + g * dt, cap);
  }
  p.djT -= dt; p.turnT -= dt; // v5 §A：空翻/转身演出计时

  // 移动平台载人：上一帧站其上 → 先随平台位移（契约算法 3）
  if (p.standOn) { p.x += p.standOn.dx; p.y += p.standOn.dy; }

  const wasFeet = p.y + p.h; // 本帧 Y 位移前脚底（单向平台判定基准）

  /* ---- X 轴（契约算法 1：先 X 后 Y） ---- */
  // v8.0：实际水平速度 = 自身跑速 + 传送带带速（带速单独钳制 280，见上方说明）。
  // v10：再叠加 Boss 吸附力场速度 p.pullV（±180，独立积分，见 _engUpdateHazards）。
  // 碰撞判向必须用合成速度——否则「站住被带子推着走」(p.vx=0, convV=280) 会绕过墙壁检测直接穿墙。
  const pvx = p.vx + (p.convV || 0) + (p.pullV || 0);
  p.x += pvx * dt;
  {
    const y0 = Math.floor(p.y / _engTile), y1 = Math.floor((p.y + p.h - _engEps) / _engTile);
    if (pvx > 0) {
      const tx = Math.floor((p.x + p.w - _engEps) / _engTile); // 右缘所在列
      for (let ty = y0; ty <= y1; ty++) {
        if (L.solid(tx, ty, game.switchState)) { p.x = tx * _engTile - p.w; p.vx = 0; p.convV = 0; p.pullV = 0; break; }
      }
    } else if (pvx < 0) {
      const tx = Math.floor(p.x / _engTile); // 左缘所在列
      for (let ty = y0; ty <= y1; ty++) {
        if (L.solid(tx, ty, game.switchState)) { p.x = (tx + 1) * _engTile; p.vx = 0; p.convV = 0; p.pullV = 0; break; }
      }
    }
  }

  /* ---- Y 轴 ---- */
  p.y += p.vy * dt;
  const wasGround = p.onGround;
  p.onGround = false;
  p.standOn = null;
  {
    const x0 = Math.floor(p.x / _engTile), x1 = Math.floor((p.x + p.w - _engEps) / _engTile);
    if (p.vy > 0) {
      const ty = Math.floor((p.y + p.h - _engEps) / _engTile); // 底缘所在行
      for (let tx = x0; tx <= x1; tx++) {
        const ch = L.tileAt(tx, ty);
        if (ch === '=') { // 单向平台：本帧移动前脚底须已在平台顶之上才可落定
          if (wasFeet <= ty * _engTile + 0.5) { p.y = ty * _engTile - p.h; p.landVy = p.vy; p.vy = 0; p.onGround = true; break; }
        } else if (L.solid(tx, ty, game.switchState)) {
          p.y = ty * _engTile - p.h; p.landVy = p.vy; p.vy = 0; p.onGround = true; break; // v5 §1.3：落地瞬间 vy 记档
        }
      }
    } else if (p.vy < 0) {
      const ty = Math.floor(p.y / _engTile); // 顶缘所在行（单向平台不挡上升）
      for (let tx = x0; tx <= x1; tx++) {
        if (L.solid(tx, ty, game.switchState)) { p.y = (ty + 1) * _engTile; p.vy = 0; break; }
      }
    }
  }

  /* ---- 移动平台落上吸附（契约算法 3：vy≥0 + 水平重叠 + 脚底穿过平台顶） ---- */
  if (p.vy >= 0) {
    for (const pl of L.plats) {
      if (p.x + p.w > pl.x && p.x < pl.x + pl.w &&
          wasFeet <= pl.y + 6 && p.y + p.h >= pl.y - 1) {
        p.y = pl.y - p.h; p.landVy = p.vy; p.vy = 0; p.onGround = true; p.standOn = pl; // v5：平台落点同记 landVy
        break;
      }
    }
  }

  // 落地分级（v5 §1.3：landVy≤300 小落=尘 4+squash 0.15；>300 大落=尘 10+squash 0.22+震屏 2+land2）
  if (p.onGround && !wasGround && p.landT <= 0) {
    const big = p.landVy > 300;
    _engAddParts(p.x + 5, p.y + 14, big ? 10 : 4, (L.theme && L.theme.dust) || '#ffffff', big ? 70 : 45, 220);
    p.landT = big ? 0.22 : 0.15;
    if (big) { _engShake(2, 0); game.sfxQueue.push('land2'); }
    else game.sfxQueue.push('land');
    p.jumpCut = false; // 落地解除截断（音效按档位入队）
  }
  // v7.7：落地瞬间冲刺冷却清零（对照空洞骑士「触地即刷新冲刺」）——长距离下落/被击飞后落地能立刻接冲刺，
  // 原来 0.8s 冷却跨过落地仍要继续等；放在 landT 门控之外，连跳二段落地（landT 未归零）同样刷新。
  if (p.onGround && !wasGround) p.dashCd = 0;
  p.landT -= dt;

  /* ---- 弹簧（契约算法 7：vy≥0 + 水平重叠 + 脚底扫过弹簧可视面） ---- */
  for (const s of L.springs) {
    s.t -= dt;
    // v7.6 缺陷5：触发带从 s.y±10（20px 宽）收紧到精灵实际可视区间 [s.y-2, s.y+6]。
    // 依据：ui.js:1078 以 (s.x, s.y-2) 绘制 SPR.springC，而 springC 是 12×8 → 可视顶 s.y-2、可视底 s.y+6。
    // 旧口径下脚底相对 s.y 偏移 -12..+14 都会弹（视觉上还差 10px 就弹飞），现在偏差 0。
    // 用「本帧扫过区间」而非单点：wasFeet 是 Y 位移前的脚底（updatePlayer 开头取值），
    // 因此下落再快也不会跨过 8px 可视带漏判——「踩上了不弹」比「弹早一点」严重得多。
    const feet = p.y + p.h;
    if (p.vy >= 0 && p.x + p.w > s.x && p.x < s.x + s.w &&
        feet >= s.y - 2 && wasFeet <= s.y + 6) {
      p.vy = -PHY.springV; p.onGround = false; p.standOn = null;
      p.jbuf = 0; p.coyote = 0; p.jumpCut = false; // 清缓冲防弱跳覆盖弹簧；弹簧不吃松手截断
      p.airJumps = 1; p.springAir = true; // v5 §1.1：重置二段跳但弹跳全程锁定（保 L5 弹簧岛链弧线）
      s.t = 0.25; // 压缩动画计时
      game.sfxQueue.push('spring');
      _engAddParts(s.x + 6, s.y, 8, '#f8d020', 70, 250);
    }
  }

  /* ---- 动画状态（ui 渲染取用） ---- */
  p.animT += dt;
  if (!p.onGround) p.anim = p.vy < 0 ? 'jump' : 'fall';
  else if (Math.abs(p.vx) + Math.abs(p.convV || 0) > 10) p.anim = 'run'; // v8.0：站住被带子推也算在跑（否则滑行却播 idle）
  else p.anim = 'idle';
}

/* ==================== 世界更新（契约第 3 节算法 14 的顺序） ==================== */
function updateWorld(dt) {
  if (game.paused || game.state !== 'play') return;
  if (game.puzzleActive) return; // v4：谜题覆盖层打开——世界整体冻结（同 paused 语义但不改 paused 字段；
                                 // 玩家物理/敌人/计时/机关全部停摆，粒子亦冻结，ui 自绘覆盖层）
  if (game.bagActive) return;    // v6 §G：背包开启冻结（同 puzzleActive 位；波1 恒 false 空转，波2 bag 队启用）
  const L = game.level, p = game.player;
  if (!L || !p) return;
  /* v7.4 坐标自愈：NaN/Infinity 一旦进入物理就会污染相机与渲染（createLinearGradient 直接抛错），
     且物理方程无法自行恢复（NaN 比较恒 false，玩家会一直下坠）。此处拉回出生点，保证一局不废。 */
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.vx) || !Number.isFinite(p.vy)) {
    p.x = L.spawn.x; p.y = L.spawn.y; p.vx = 0; p.vy = 0;
    game.cam.x = Math.max(0, p.x - 160); game.cam.y = Math.max(0, p.y - 100);
  }
  /* v5 §3.1：O 流星连斩 1.2s 演出状态机（放在 paused/puzzleActive 检查之后、hitStop 检查之前；
     ①② 期间世界冻结 return，floats/fxParts 由 ui 推进——数字与火花在时停里就在动） */
  if (game.ult && game.ult.on) {
    const u = game.ult; u.t += dt;
    /* v19（spec §2.7）：法师「陨星风暴」——复用同一个 game.ult，按 u.kind 分支（禁第二份状态机）。
       0~0.35 吟唱：世界冻结（return）+ 玩家无敌；0.35 一次性落 6 颗陨星；0.9 白闪；1.2 复位。
       0.35~1.2 期间世界**正常推进**（不 return，陨星边落边打）。
       下方骑士连斩逻辑整体放进 else 分支，逐字未动（kind 缺省 ⇒ 走 else，行为字节等价）。 */
    if (u.kind === 'mage') {
      const MT = BAL.heroes.mage.o;
      if (!p.dead) p.invT = Math.max(p.invT, MT.t[0]);          // 吟唱无敌（覆盖 0.35s 全程）
      if (!u.fired && u.t >= MT.t[0]) {                          // 0.35：本屏 [cam.x+32, cam.x+352] 均匀 6 颗
        u.fired = true;
        for (let i = 0; i < MT.n; i++) {
          const mx = game.cam.x + 32 + (MT.n > 1 ? (320 * i) / (MT.n - 1) : 0);
          game.meteors.push({ x: mx, y: game.cam.y - 24, vy: MT.fallV, w: 10, h: 12,
            delay: i * MT.gap, ring: _engGroundY(mx, game.cam.y),
            dmg: MT.dmg, bossDmg: MT.dmg, aoe: MT.aoe, mage: true }); // mage:true ⇒ ui 画青紫陨星
        }
        game.sfxQueue.push('storm'); _engShake(5, 0);
      }
      if (!u.flashed && u.t >= MT.t[1]) { u.flashed = true; game.flashT = 0.1; } // 白闪（复用现有白屏渲染）
      if (u.t >= MT.t[2]) game.ult = { on: false, t: 0, fired: false, flashed: false }; // 复位
      if (u.t < MT.t[0]) return;                                 // 吟唱期：世界冻结
    } else {
    if (!u.fired && u.t >= BAL.skills.o.t[0]) {                      // ③ 结算（t=0.55 一次性）
      u.fired = true;
      /* v12：核心护盾期连斩打最近的一颗核心（本体免伤，硬砍只会听到 clank） */
      if (game.boss && game.boss.coreOn) {
        const hzO = game.hazards || (game.hazards = []);
        let tgtO = null, bdO = 1e9;
        for (const eo of hzO) if (eo.kind === 'core') {
          const dd0 = Math.abs(eo.x + eo.w / 2 - (p.x + p.w / 2));
          if (dd0 < bdO) { bdO = dd0; tgtO = eo; }
        }
        if (tgtO) {
          _engFloat(tgtO.x + tgtO.w / 2, tgtO.y - 4, '1', '#8ad8f8', 1);
          _engCoreHit(hzO, tgtO, 1); _engCoreBreakCheck();
        }
      } else {
        /* v13：真假身期间连斩打最近的一具幻影——只扣 hp，显形/爆炸由 hazard 收尸处统一结算 */
        const muO = game.boss ? _engMirrorPick(p.x + p.w / 2) : null;
        if (muO) {
          muO.hp -= 1; muO.flashT = 0.15;
          _engFloat(muO.x + muO.w / 2, muO.y - 4, '1', '#b060f0', 1);
        } else if (game.boss && _engBossHurt(BAL.skills.o.dmg, true))   // v13：O 连斩 = 大招，可破 parry
          _engFloat(game.boss.x + 26, game.boss.y - 4, '' + game.boss.lastDmg, '#48d8e8', 1); // Boss 承伤 5 青（v10：破绽期按真实值）
      }
      for (const e of L.enemies) if (!(e.dead > 0) && _engOnScreen(e)) { // 屏内普通敌全灭+击飞
        _engKillEnemy(e);
        e.dvx = (_engSign(e.x - p.x) || p.face) * 150; e.dvy = -170;
        _engFloat(e.x + 6, e.y - 6, 'KO', '#48d8e8', 0);
      }
      for (const b of game.bullets) _engFx(b.x + 4, b.y + 4,   // 清全部弹幕（每弹 1 金色 fx）
        { vx: Math.random() * 80 - 40, vy: -40, life: 0.3, color: '#f8d048', size: 1 });
      game.bullets = [];
      _engShake(8, 0); game.sfxQueue.push('ult2');        // 大招结算震屏 8（0 延迟）
    }
    if (!u.flashed && u.t >= BAL.skills.o.t[1]) { u.flashed = true; game.flashT = 0.1; } // ⑤ 白闪（复用现有白屏渲染）
    if (u.t < BAL.skills.o.t[0]) return;                             // ①② 时停+斩击期：世界冻结（玩家恢复操控在 ③）
    if (u.t >= BAL.skills.o.t[2]) game.ult = { on: false, t: 0, fired: false, flashed: false }; // ⑥ 余韵毕复位
    } // v19：骑士连斩分支结束（mage 走上方的 if 分支，二者共用同一个 game.ult）
  }
  if (game.hitStop > 0) { // v2 P1：攻击命中 → 全局冻结（世界整体暂停推进，计时到点自动恢复）
    game.hitStop -= dt;
    if (game.hitStop < 0) game.hitStop = 0;
    return;
  }
  // tick 由 ui.js step() 每步统一 +1（覆盖全部界面状态）；此处不再自增——
  // 曾因双自增使 play 态 tick 恒为偶数，(tick*n|0)%2 类取帧全部冻结在第 1 帧

  /* ⓪ v4：谜题神龛接近检测（工单 3，每步计算）：玩家矩形 vs 神龛矩形四周 8px 外扩，
        重叠 → game.puzzleNear=该神龛 idx，否则 -1。纯判定，无任何物理副作用。 */
  game.puzzleNear = -1;
  for (const sh of L.shrines) {
    if (_engAabb(p, { x: sh.x - 8, y: sh.y - 8, w: sh.w + 16, h: sh.h + 16 })) {
      game.puzzleNear = sh.idx;
      break;
    }
  }

  /* ⓪″ v7 §4.3：宝箱开启——接触开启：装备 1 件（hidden 权重，池满 ≥6 跳过 H3）+ 宝石等价金币
        （BAL.econ.chestGem 直接入 game.coins，不推 coin 实体——totalCoin 星级口径不被污染）；
        opened 跨死亡保留（respawn 不复位），换关 loadLevel 重建=重置。 */
  for (const c of L.chests) {
    if (!c.opened && !p.dead && _engAabb(p, c)) {
      c.opened = true;
      if (game.gearDrops.length < _engGearCap)  // 池满 ≥6 跳过（H3 同款守卫）
        game.gearDrops.push(_engMkGear(c.x + 3, c.y, _engSlot(), _engRollTier(BAL.gear.hidden)));
      game.coins += BAL.econ.chestGem;          // 等价 1 颗宝石（不推 coin 实体，totalCoin 口径不被污染）
      _engFloat(c.x + 8, c.y - 6, '+' + BAL.econ.chestGem, '#f8d048', 1);
      _engFloat(c.x + 8, c.y - 16, '隐藏宝箱！', '#f8d048', 1);
      _engAddParts(c.x + 8, c.y + 4, 16, '#f8d048', 110, 250);
      _engShake(4, 0);
      game.sfxQueue.push('chest');
    }
  }

  /* ⓪′ v5 §4.2：传送门——重叠且双端 cd≤0 → 传送到 partner 门内（保留 vx/vy），双端 cd 0.6s。
        旧七关 portals 为空数组 → 循环零次，空转零副作用（H4）。 */
  for (const pt of L.portals) {
    pt.cd -= dt;
    if (pt.cd <= 0 && pt.partner && !p.dead && _engAabb(p, pt)) {
      const q = pt.partner;
      _engFx(pt.x + 6, pt.y + 12, { ring: 1, r: 3, r1: 16, life: 0.3, color: '#8ea0ff' }); // 白色气环（两端）
      // 落点在出口门"行进方向外侧"：与门零重叠——原"门内居中"落点会让原地落地的玩家
      // 站在出口门里，0.6s 冷却一过被弹回进门侧，形成 ping-pong 回环（实测复现）
      const dirx = p.vx !== 0 ? (p.vx > 0 ? 1 : -1) : (p.face || 1);
      p.x = dirx > 0 ? q.x + q.w + 2 : q.x - p.w - 2;
      p.y = q.y + q.h - p.h - 4;                                   // 门底对齐落地
      pt.cd = 0.6; q.cd = 0.6;                                     // 双端冷却防回环
      _engFx(q.x + 6, q.y + 12, { ring: 1, r: 3, r1: 16, life: 0.3, color: '#8ea0ff' });
      game.sfxQueue.push('portal');
    }
  }

  /* ① 拉杆：接触且冷却≤0 → 全局开关翻转、冷却 0.6s（契约算法 9） */
  for (const lv of L.levers) {
    lv.cd -= dt;
    if (lv.cd <= 0 && !p.dead && _engAabb(p, lv)) {
      game.switchState ^= 1;
      lv.cd = 0.6;
      game.sfxQueue.push('switch');
      _engAddParts(lv.x + 6, lv.y + 6, 6, game.switchState ? '#48d848' : '#f87830', 50, 150);
    }
  }

  /* ② 拾取：金币 / 宝石(=5) / 钥匙 */
  if (!p.dead) {
    for (const c of L.coins) {
      if (c.got) continue;
      c.t += dt;
      if (_engAabb(p, c)) {
        c.got = true;
        if (c.key) { game.keys++; game.sfxQueue.push('key'); _engAddParts(c.x + 5, c.y + 3, 10, '#f8d020', 60, 100);
          _engFloat(c.x + 5, c.y - 4, 'KEY', '#f8d048', 0); } // v5 §D：拾取浮字
        else if (c.gem) { game.coins += BAL.econ.gem; game.sfxQueue.push('gem'); _engAddParts(c.x + 4, c.y + 5, 14, '#48d8e8', 80, 100);
          _engFloat(c.x + 4, c.y - 4, '+' + BAL.econ.gem, '#f8d048', 0); }
        else { game.coins += BAL.econ.coin; game.sfxQueue.push('coin'); _engAddParts(c.x + 4, c.y + 4, 5, '#f8d020', 50, 100);
          _engFloat(c.x + 4, c.y - 4, '+' + BAL.econ.coin, '#f8d048', 0); }
      }
    }
    /* ②′ v17 装饰交互：水晶可捡 / 尖刺火苗会烫。只扫 decorFx 子集（构造期筛好），
          got/dead 状态留在装饰实体上——respawn 不重建 Level，与「碎砖保持已碎」同一口径。 */
    for (const d of L.decorFx) {
      if (d.got || d.dead) continue;
      const H = _ENG_DECOR_HIT[d.type];
      if (H.cls === 'pick') {
        const r = { x: d.x, y: d.y - H.h, w: H.w, h: H.h };
        if (_engAabb(p, r)) {
          d.got = true;
          game.coins += BAL.econ.coin; game.sfxQueue.push('coin');
          _engAddParts(d.x + H.w / 2, d.y - H.h / 2, 8, '#48d8e8', 70, 160);
          _engFloat(d.x + 2, d.y - H.h - 4, '+' + BAL.econ.coin, '#48d8e8', 0);
        }
      } else if (H.cls === 'harm') {
        // 伤害盒四周内缩 2px：视觉宽≠判定宽，贴边擦过不扣、真踩上去才扣（平台游戏宽容度惯例）
        const hb = { x: d.x + 2, y: d.y - H.h + 2, w: H.w - 4, h: H.h - 2 };
        if (_engAabb(p, hb)) _engHurtPlayer(d.x + H.w / 2, 1);
      }
    }
  }

  /* ③ 门：持钥匙接触任一 D 瓦片 → 该连通分量整组移除（契约算法 8）
        门是瓦片：玩家会被碰撞解算顶在门面上，因此接触扫描用「相贴即算接触」。
        v17.1 修复：原实现只扫玩家矩形压住的瓦片——从左侧贴门时右缘恰好落在门列起点
        （floor(门列*16/16)=门列）能命中；但从右侧贴门时左缘 = (门列+1)*16，floor 后
        永远落在门列+1，整列扫描不到门 → L6「甲板→门→塔顶」这条从右往左的必经路线
        全程开不了门（只有绕到门左侧才触发，而门左侧是终点侧=死锁）。
        修法：扫描范围向四周各外扩 1px，两个方向对称命中；1px 穿不透 16px 的瓦片墙，
        不存在隔墙误开门。 */
  if (!p.dead && game.keys > 0) {
    const dx0 = Math.floor((p.x - 1) / _engTile), dx1 = Math.floor((p.x + p.w + 1) / _engTile);
    const dy0 = Math.floor((p.y - 1) / _engTile), dy1 = Math.floor((p.y + p.h + 1) / _engTile);
    for (let ty = dy0; ty <= dy1; ty++) {
      for (let tx = dx0; tx <= dx1; tx++) {
        if (L.tileAt(tx, ty) !== 'D' || game.keys <= 0) continue;
        const key = tx + ',' + ty;
        if (!L.doors.has(key)) continue;
        let grp = null;
        for (const g of L.doorGroups) { if (g.indexOf(key) >= 0) { grp = g; break; } }
        if (!grp) continue;
        for (const k of grp) {
          const parts = k.split(',');
          const ddx = +parts[0], ddy = +parts[1];
          L.tiles[ddy][ddx] = '.';
          L.doors.delete(k);
          _engAddParts(ddx * _engTile + 8, ddy * _engTile + 8, 8, '#8a5a2a', 60, 250);
        }
        game.keys--;
        game.sfxQueue.push('door');
      }
    }
  }

  /* ④ 检查点：接触置 on，复活点只进不退（契约算法 11） */
  if (!p.dead) {
    for (const c of L.checkpoints) {
      if (c.on) continue;
      if (_engAabb(p, c)) {
        c.on = true;
        const prog = c.x - c.y; // 与 respawnAt.p 同一度量
        if (prog > game.respawnAt.p) game.respawnAt = { x: c.x + 3, y: c.y + 6, p: prog };
        game.sfxQueue.push('checkpoint');
        _engAddParts(c.x + 8, c.y + 8, 10, '#48d848', 60, 80);
      }
    }
  }

  /* ④′ v11：终点封印刷新（三条路任选其一；Boss 关 loadLevel 时已 open）。
        放在终点判定之前，保证「本帧刚好达成条件 → 本帧就能过关」。 */
  _engSealTick(dt);

  /* ⑤ 终点判定（v7.9：谜题不再是通关前置——玩家明确要求「数独/数织别强制做」。
        神龛降级为可选支线：解开必掉 1 件当档装备（见 puzzleSolved），不解也能直接通关。
        旧的 v7.3 谜题门（未解神龛 → 终点不通关 + 每 2.5s 引导浮字）整段移除。）
        v11：改由「封印」把关——碰旗先看 game.seal.open，未解只轻推弹回 + 提示。
        **这里只改速度、不改坐标、不加实心碰撞**：tools/reach.js 的可达性门禁判的是
        「玩家矩形物理命中终点矩形」，给封印加碰撞会让 27/27 全红（硬要求）。 */
  if (!p.dead && L.goal && _engAabb(p, L.goal)) {
    const s = game.seal;
    if (!s || s.open) { levelClear(); return; }
    if (s.blockT <= 0) { // 0.9s 节流：站在旗里也不会每帧被推
      p.vx = (p.x + p.w / 2 < L.goal.x + L.goal.w / 2 ? -1 : 1) * 140;
      s.blockT = 0.9;
      game.sfxQueue.push('clank'); // 撞在封印上的金属闷响（既有音效名，engine 只入队）
      _engAddParts(L.goal.x + 8, L.goal.y + 16, 6, '#b060f0', 70, 120);
      _engFloat(L.goal.x + 8, L.goal.y - 6, '封印中', '#b060f0', 1);
    }
  }

  /* ⑥ 移动平台：先动并记录本帧 dx,dy；水平推挤，推入实心则死亡（契约算法 3） */
  for (const pl of L.plats) {
    const ox = pl.x, oy = pl.y;
    if (pl.hz) {
      pl.x += pl.dir * pl.spd * dt;
      if (pl.x > pl.maxX) { pl.x = pl.maxX; pl.dir = -1; }
      if (pl.x < pl.minX) { pl.x = pl.minX; pl.dir = 1; }
    } else {
      pl.y += pl.dir * pl.spd * dt;
      if (pl.y > pl.maxY) { pl.y = pl.maxY; pl.dir = -1; }
      if (pl.y < pl.minY) { pl.y = pl.minY; pl.dir = 1; }
    }
    pl.dx = pl.x - ox; pl.dy = pl.y - oy; // 实际位移（含边界反弹帧）
    if (pl.hz && pl.dx !== 0 && !p.dead && p.vy >= 0 && _engAabb(p, pl)) {
      // 沿推动方向推出：右推时玩家左缘贴平台右缘；左推时玩家右缘贴平台左缘
      p.x = pl.dx > 0 ? pl.x + pl.w : pl.x - p.w;
      if (_engPlayerInSolid(L)) killPlayer();      // 推入实心 → 死亡（避免夹卡）
    }
  }

  /* ⑥′ 崩塌砖状态机（契约算法 6；顺序表未单列，置于移动平台之后、玩家物理之前）：
        0稳 → (被踩 0.45s，期间持续被踩压到 ≤0.12s) → 1抖 → 2落(加速下坠 1.6s，期间非实心)
        → 3无(1.2s 后且玩家矩形不重叠 → 回到 0) */
  for (const c of L.crumbles.values()) {
    if (c.state === 0) {
      if (!p.dead && _engOnCrumble(p, c)) {
        c.state = 1; c.t = 0.45;
        game.sfxQueue.push('crumble');
      }
    } else if (c.state === 1) {
      c.t -= dt;
      if (!p.dead && _engOnCrumble(p, c)) c.t = Math.min(c.t, 0.12); // 再踩 → 快落
      if (c.t <= 0) {
        c.state = 2; c.t = 0; c.dy = 0; c.dvy = 0;
        game.sfxQueue.push('crumble');
        _engAddParts(c.x * _engTile + 8, c.y * _engTile + 8, 8, '#9a8a7a', 60, 350);
      }
    } else if (c.state === 2) {
      c.t += dt; c.dvy += 500 * dt; c.dy += c.dvy * dt; // 加速下坠（渲染偏移）
      if (c.t > 1.6) { c.state = 3; c.t = 0; }
    } else { // state 3
      c.t += dt;
      if (c.t > 1.2 && !_engAabb(p, { x: c.x * _engTile, y: c.y * _engTile, w: 16, h: 16 })) {
        c.state = 0; c.t = 0; c.dy = 0; c.dvy = 0;
      }
    }
  }

  /* ⑦ 电锯：轨道往返 + 圆(r7.5) vs 玩家矩形最近点距离（契约算法 5） */
  for (const s of L.saws) {
    s.t += dt;
    if (s.hz) {
      s.x += s.dir * s.spd * dt;
      if (s.x > s.maxX) { s.x = s.maxX; s.dir = -1; }
      if (s.x < s.minX) { s.x = s.minX; s.dir = 1; }
    } else {
      s.y += s.dir * s.spd * dt;
      if (s.y > s.maxY) { s.y = s.maxY; s.dir = -1; }
      if (s.y < s.minY) { s.y = s.minY; s.dir = 1; }
    }
    if (!p.dead) {
      const nx = _engClamp(s.x, p.x, p.x + p.w), ny = _engClamp(s.y, p.y, p.y + p.h);
      const ddx = s.x - nx, ddy = s.y - ny;
      if (ddx * ddx + ddy * ddy < s.r * s.r) _engHazardHit(s.x); // v7.8：电锯同尖刺，护盾可挡
    }
  }

  /* ⑧ 大炮 / 炮弹（契约算法 10：周期 1.9s，8×6 炮弹，速度 105px/s） */
  for (const cn of L.cannons) {
    cn.t -= dt; cn.flash -= dt;
    if (cn.t <= 0) {
      cn.t = 1.9;
      // v7.6 缺陷3：炮口净空不足则不开火（门禁见 _engMuzzleBlocked）。此前 L4#1 正前方 2 格是 'B' 木箱、
      // L6#0 正前方 3 格是 'B'，炮台对着箱子一直空放，子弹只飞 9px / 25px 就消失——「看得见没反应」。
      // 选 (b) 逻辑层修而非 (a) 搬关卡数据：挡路物是**可碎木箱**（每箱含 1 金币），玩家砸箱取币后
      // 炮台自动恢复射击（cn.t 照常 1.9s 重试），既不丢金币经济也不改关卡美术；副作用是 L4#0
      // （炮口 4 格即撞 '#'，净空 44px）也一并静默——它同样属于「子弹出膛即没」这一类，逐台数字见报告。
      if (!_engMuzzleBlocked(L, cn)) {
        cn.flash = 0.12;
        game.sfxQueue.push('shot');
        game.bullets.push({ x: cn.x + (cn.dir > 0 ? 16 : -8), y: cn.y + 4, w: 8, h: 6, vx: cn.dir * 105 });
      }
    }
  }
  game.bullets = game.bullets.filter(function (b) {
    // v6 §3.4：法师追踪火球——home 计时内向玩家中心限角转向（转向率 BAL.enemy.mage.skill.turn rad/s）；
    // 大炮弹/Boss 星弹无 home 字段 → undefined>0=false 天然跳过，轨迹不变
    if (b.home > 0) { b.home -= dt;
      const cx = p.x + p.w / 2 - (b.x + 4), cy = p.y + p.h / 2 - (b.y + 4);
      const want = Math.atan2(cy, cx), cur = Math.atan2(b.vy, b.vx);
      let dh = want - cur; while (dh > Math.PI) dh -= 6.283; while (dh < -Math.PI) dh += 6.283;
      const turn = _engClamp(dh, -BAL.enemy.mage.skill.turn * dt, BAL.enemy.mage.skill.turn * dt), sp = Math.hypot(b.vx, b.vy);
      b.vx = Math.cos(cur + turn) * sp; b.vy = Math.sin(cur + turn) * sp; }
    b.x += b.vx * dt;
    if (b.g) b.vy = (b.vy || 0) + b.g * dt; // v8.0：酸液花酸弹带重力（抛物线）；大炮弹/火球/Boss 弹无 g 字段 → 轨迹不变
    b.y += (b.vy || 0) * dt; // v3：Boss 星弹带 vy（大炮弹 vy 未定义 → +0，轨迹不变，设计 §3）
    // v6 §3.4：火球寿命到期自爆（橙红余烬；大炮弹/Boss 星弹无 life 字段跳过）
    if (b.life !== undefined) { b.life -= dt;
      if (b.life <= 0) { _engAddParts(b.x + 4, b.y + 4, 6, '#f86030', 70, 150); return false; } }
    const tx = Math.floor((b.x + 4) / _engTile), ty = Math.floor((b.y + 3) / _engTile);
    if (L.solid(tx, ty, game.switchState)) { _engAddParts(b.x + 4, b.y + 3, 4, '#f8b020', 50, 150); return false; }
    if (!p.dead && _engAabb(b, p)) { _engHurtPlayer(b.x + 4); return false; } // v3：炮弹/Boss 弹/火球 → HP 伤害（原即死）
    return b.x > -20 && b.x < L.w * _engTile + 20 && b.y > -20 && b.y < L.h * _engTile + 20; // v3：出界追加 y
  });

  /* ⑨ 敌人 AI + 踩踏判定（契约算法 4；v5 §C/§F：骑士同构 + 死亡击飞弹道 + 击退摩擦） */
  for (const e of L.enemies) {
    if (e.dead > 0) { // 死亡态：击飞弹道积分（穿地，0.6s 渐隐由 ui 处理）
      e.dead += dt;
      e.x += (e.dvx || 0) * dt; e.dvy = (e.dvy || 0) + 1200 * dt; e.y += e.dvy * dt;
      continue;
    }
    /* v19.3：霜爆新星冻结——定身、停 AI、不吃重力（空中被冻就浮在冰里），冰壳由 ui 画。
       冻结期间视为可穿过的物件：不结算接触伤害、也踩不上去（与骑士「时停」同一种手感）。
       用 continue 而不是逐条分支置零，是因为敌人 AI 有 9 种类型，逐条改易漏。
       注意位置：必须在 e.t += dt 之前，动画帧也一起冻住，否则冰壳里的敌人还在扭。 */
    if (e.freezeT > 0) {
      e.freezeT -= dt; e.vx = 0; e.vy = 0; e.kb = 0;  // kb 也清零：否则解冻瞬间补一次延迟击退
      /* 闪白/抖动计时在 4589 行（AI 分支之后）衰减，这里 continue 会跳过
         → 冰壳里的敌人会白闪整整 0.8s（看上去就是个白团，看不出是什么怪）。必须在这里补衰减。 */
      if (e.flashT > 0) e.flashT -= dt;
      if (e.jitT > 0) e.jitT -= dt;
      continue;
    }
    e.t += dt;
    // v7 §5.1/§5.4：枪虾/魂火为地面型——重力/落地/掉头与史莱姆同构（速度取 e.vx）
    // v8.0 任务4：铁甲虫/酸液花/跳跳蛛同为地面型，复用这条分支（工单要求：不另写一套重力/落地/掉头）
    if (e.type === 'slime' || e.type === 'knight' || e.type === 'mage'
        || e.type === 'lancer' || e.type === 'boomer'
        || e.type === 'beetle' || e.type === 'spitter' || e.type === 'hopper') {
      // v7.6 缺陷1：本帧 Y 位移前的脚底（'=' 单向平台穿越判定基准，与玩家 p.standOn 同口径）
      const eWasFeet = e.y + e.h;
      e.vy = Math.min(e.vy + PHY.grav * dt, BAL.enemy.slime.fall); // 敌人下落上限 300（不随玩家 maxFall 变，设计 §1 表#9）
      e.y += e.vy * dt;
      e.grounded = false;
      {
        const ty = Math.floor((e.y + e.h - _engEps) / _engTile);
        const ex0 = Math.floor(e.x / _engTile), ex1 = Math.floor((e.x + e.w - _engEps) / _engTile);
        for (let tx = ex0; tx <= ex1; tx++) {
          if (L.solid(tx, ty, game.switchState)) { e.y = ty * _engTile - e.h; e.vy = 0; e.grounded = true; break; }
          // v7.6 缺陷1：敌人补「单向平台」概念。levels.js 的 STAND 把 '=' 算可站立面，而 solid() 不认它
          // （对玩家是正确语义：可从下方跳穿）——此前敌人只查 solid()，站在 '=' 上的史莱姆/魂火直接穿下去。
          // 语义逐字对齐 engine.js 玩家落地（'=' 分支）：只在下落中、且脚底上一帧仍在平台顶面之上才吸附。
          if (L.tileAt(tx, ty) === '=' && e.vy > 0 && eWasFeet <= ty * _engTile + 0.5) {
            e.y = ty * _engTile - e.h; e.vy = 0; e.grounded = true; break;
          }
        }
      }
      if (e.turnCd > 0) e.turnCd -= dt; // v8.0：掉头冷却递减
      // v8.0 任务3：脱困冲刺剩余时间（每帧重设 vx —— 撞墙分支会提前把 freeT 清零，见下）
      if (e.freeT > 0) {
        e.freeT -= dt;
        e.vx = e.freeT > 0 ? e.freeVx : _engSign(e.freeVx) * e.freePat; // 冲完回巡逻速度，方向不变
      }
      // v8.0：实际水平速度 = 巡逻 vx + 带速 convV（带速在地面才累积，见本分支末尾）
      e.x += (e.vx + (e.convV || 0)) * dt;
      {
        const d = _engSign(e.vx + (e.convV || 0));
        // v6 §3.3：骑士冲锋段跳过掉头判定（撞墙提前结束由 _engEnemySkill 处理）
        // v8.0：铁甲虫冲撞段同理（撞墙/超时提前结束也在 _engEnemySkill 里钳位）
        if (d !== 0 && !(e.ai && e.ai.st === 'charge')) {
          const tx = d > 0 ? Math.floor((e.x + e.w - _engEps) / _engTile) : Math.floor(e.x / _engTile);
          const my = Math.floor((e.y + e.h / 2) / _engTile);
          const fy = Math.floor((e.y + e.h + 2) / _engTile);
          // 前方齐腰有墙，或悬空无落脚点 → 掉头
          // v7.6 缺陷1：落脚点口径补 '='（否则站在单向平台上的敌人第一帧就判定「前方悬空」原地掉头抖动）
          const wall = L.solid(tx, my, game.switchState);
          const ledge = e.grounded && !_engFootTile(L, tx, fy);
          if (wall) {
            // v8.0 任务2：撞墙**立即**掉头（绝不能因为冷却而不掉头 —— 那会走进墙里），
            // 同时把 x 钳到墙面外侧、带速清零（带子正顶在墙上时清零，否则会每帧翻向）。
            e.vx = -e.vx; e.turnCd = 0.25; e.convV = 0;
            if (e.freeT > 0) { e.freeT = 0; e.vx = _engSign(e.vx) * e.freePat; } // v8.0：脱困冲刺撞墙即结束，回巡逻速度（否则会以 2.4 倍速一路跑下去）
            if (d > 0) e.x = tx * _engTile - e.w; else e.x = (tx + 1) * _engTile;
          } else if (ledge) {
            const carried = (e.convV || 0) !== 0 && _engSign(e.convV) === d;
            if (carried && _engDropSafe(L, tx, fy, 12)) {
              // v8.0 任务2：传送带正把它送出边缘，且下面 12 格内有落脚面 → 不掉头，让它被运下去
              // （L4 顶层传送带左端被木箱堵成 4.7px 夹缝：旧逻辑每帧掉头 60 次，看着就是一动不动。
              //  允许落下后它会在下层地面继续正常巡逻 —— 既没穿墙，也没取消传送带实心。）
            } else if (e.turnCd > 0) {
              // 冷却中：贴边停住不掉头（旧逻辑在 4.7px 见方的夹缝里 10 秒掉头 60 次，肉眼=一动不动）
              if (d > 0) e.x = tx * _engTile - e.w; else e.x = (tx + 1) * _engTile;
            } else {
              // 掉头 + 带速清零：带子把小怪送到尽头后，让它干干净净地走回去（不清零会因惯性冲出边缘）
              e.vx = -e.vx; e.turnCd = 0.25; e.convV = 0;
              if (e.freeT > 0) { e.freeT = 0; e.vx = _engSign(e.vx) * e.freePat; } // v8.0：同上，冲刺到边缘掉头即结束
              if (d > 0) e.x = tx * _engTile - e.w; else e.x = (tx + 1) * _engTile;
            }
          }
        }
      }
      /* ---- v8.0 任务1/2：传送带对地面敌人同向推动（玩家的一半 600/140，避免小怪被甩飞） ----
         两条护栏：① 推动方向上一格是墙就不推（否则小怪被顶在墙上每帧翻向）；
         ② 酸液花是站桩怪（工单的传送带敌人清单未含 spitter），不吃带速。 */
      if (e.grounded && e.type !== 'spitter') {
        let ec = 0;
        const efy = Math.floor((e.y + e.h + 0.5) / _engTile);
        const efx0 = Math.floor(e.x / _engTile), efx1 = Math.floor((e.x + e.w - _engEps) / _engTile);
        for (let tx = efx0; tx <= efx1; tx++) {
          const ch = L.tileAt(tx, efy);
          if (ch === '(') ec -= 1; else if (ch === ')') ec += 1;
        }
        ec = _engSign(ec);
        if (ec !== 0) {
          const ptx = ec > 0 ? Math.floor((e.x + e.w + 1) / _engTile) : Math.floor((e.x - 1) / _engTile);
          const pmy = Math.floor((e.y + e.h / 2) / _engTile);
          // 护栏②：只「同向推」——小怪自己正在逆着带子走时不推（否则被推回去 → 掉头 → 再被推回来，
          // 就是工单点名的「被推得抖动着反复掉头」）。vx=0（站桩/沉睡）时允许起步被带走。
          const sameWay = e.vx === 0 || _engSign(e.vx) === ec;
          if (sameWay && !L.solid(ptx, pmy, game.switchState))
            e.convV = _engClamp((e.convV || 0) + ec * _engConvAccE * dt, -_engConvCapE, _engConvCapE);
        } else if (e.convV) { // 离开带面：0.16s 内回到巡逻速度（不带惯性甩飞）
          const s = _engSign(e.convV);
          e.convV -= s * 900 * dt;
          if (_engSign(e.convV) !== s) e.convV = 0;
        }
      }
      /* ---- v8.0 任务3：困住检测 + 脱困 ----
         为什么要做：v8.0 上一轮只修了「卡死」（spanX<8px）与「每帧掉头」，但 36~68px 的小坑/小平台里
         往返巡逻的小怪依然一只都没被抓到——它路径长 279（一直在走）、净位移≈0、跨度只有 2~4 格，
         玩家看到的仍然是「这只怪在原地打转」。这里换口径：**不看好不好动，看好不好走开**。
         窗口 1.6s（约一次往返）统计 x 的最小/最大值，跨度 < 40px（2.5 格）即判「被困」。
         三条豁免：① 玩家在技能触发半径内（正在交战，短距离移动是正常博弈）；② 技能状态机不在 idle
         （冲撞/突刺/压顶/下蹲期间不打断，否则等于给敌人加了「随时取消前摇」）；③ 冲刺未结束。
         字段：spanMin/spanMax/spanT（窗口）、freeT/freeVx/freePat（冲刺）、rescueN（脱困计数，诊断用）。 */
      if (e.spanMin === undefined) { // 懒初始化：'W'/'A'/'Y'/'N'/'T'/工厂/召唤体全部走这一处，不必逐条出生分支改
        e.spanMin = e.x; e.spanMax = e.x; e.spanT = 0; e.freeT = 0; e.freeVx = 0; e.freePat = 0;
        e.rescueN = 0; e.rescueCd = 0;
      }
      if (e.rescueCd > 0) e.rescueCd -= dt; // v8.0 任务3：脱困冷却递减
      if (e.type !== 'spitter') { // 酸液花站桩（vx 恒 0），不在工单脱困清单内
        e.spanT += dt;
        if (e.x < e.spanMin) e.spanMin = e.x;
        if (e.x > e.spanMax) e.spanMax = e.x;
        if (e.spanT >= 1.6) {
          const spanW = e.spanMax - e.spanMin;
          const narrow = spanW < 40;
          e.spanT = 0; e.spanMin = e.x; e.spanMax = e.x; // 无论是否脱困，窗口都重置（避免同一窗口反复触发）
          const skR = BAL.enemy[e.type] && BAL.enemy[e.type].skill;
          // 交战半径：技能表里 x 向的触发距离（knight/beetle/lancer 用 rngX，mage/hopper 用 rng，boomer 只有 wake）
          const engR = skR ? (skR.rngX != null ? skR.rngX : (skR.rng != null ? skR.rng : (skR.wake || 0))) : 0;
          const pdx = (p.x + p.w / 2) - (e.x + e.w / 2);
          if (narrow && e.freeT <= 0 && e.rescueCd <= 0 && (!e.ai || e.ai.st === 'idle') && Math.abs(pdx) > engR) {
            /* 脱困方向：默认沿用当前巡逻朝向。为什么不一律「背对玩家」——
               实测（L1#3）会出现「刚撞墙掉头向左 → 下一帧又向右跳回去」，一秒钟两次反向，
               比原地打转更像抖动。所以只在玩家真的就在这一侧（3 倍交战半径内）时才强制反向，
               既不会直接撞向玩家，也不会为了背对远处的玩家而凭空翻向。 */
            let dir = _engSign(e.vx) || _engSign((e.x + e.w / 2) - (p.x + p.w / 2)) || 1;
            if (dir === _engSign(pdx) && Math.abs(pdx) < engR * 3) dir = -dir;
            const spdR = BAL.enemy[e.type].spd || 0;
            e.rescueCd = 3.0; // 每次脱困后 3s 不再尝试：否则「跳不出去的窄台」会每 1.6s 跳一次，制造新的抖动
            if ((e.type === 'slime' || e.type === 'hopper')
                && _engRescueJumpOK(L, e, dir, skR.vx * (2 * (skR.vy || skR.jumpV) / PHY.grav))) {
              // a) 主动跳：复用各自的技能状态机（slime 的 leap / hopper 的 air），不另写一套弹道
              if (e.type === 'slime') {
                e.ai.st = 'leap'; e.ai.t = 0; e.ai.tx = dir * spdR;
                e.vx = dir * skR.vx; e.vy = -skR.vy;
              } else {
                e.ai.st = 'air'; e.ai.t = 0;
                e.vx = dir * skR.vx; e.vy = -skR.jumpV;
              }
              e.grounded = false; // 必须清：_engEnemySkill 的 leap/air 分支靠 grounded 判「落地」，留着会在本帧立刻收招
              e.rescueN++;
            } else if (spdR > 0 && _engRescueDashOK(L, e, dir)) {
              // b) 换向冲刺：0.35s 的短促推力（2.4 倍巡逻速），撞墙/到边缘由上面掉头分支提前结束
              e.freeT = 0.35; e.freeVx = dir * spdR * 2.4; e.freePat = spdR * (e.elite ? BAL.elite.spdMul : 1);
              e.vx = e.freeVx;
              e.rescueN++;
            } else if (spanW < 8) {
              // c) 原地掉头：a/b 都不适用时的兜底。只在**真的钉住**（窗口内 x 几乎没动，<8px）时做——
              // 已经能在 20~40px 里来回走的小怪本来就在不停掉头，再替它翻一次只是凭空多一次反向
              // （诊断里表现为掉头次数翻倍，比原地打转更像抖动）。站桩怪 vx=0 时是恒等操作，不计数。
              if (e.vx !== 0) { e.vx = -e.vx; e.rescueN++; }
            }
          }
        }
      }
      if (e.type === 'knight' || e.type === 'lancer') e.face = _engSign(e.vx) || e.face; // v5 §4.3：面朝侧=格挡判定方向；v7 §5.1：枪虾面朝侧供 ui 翻帧/突刺兜底向
      if (e.y > L.h * _engTile + 30) e.dead = 99; // 坠出世界
    } else if (!e.ai || e.ai.st === 'idle') { // 蝙蝠巡逻（v6 §3.2：技能状态机接管期间冻结巡逻位移）
      // v7 §5.2：水母/幽灵悬浮复用本分支——正弦频率/振幅读 e.frq/e.amp（缺省 2.2/7=蝙蝠现行值，零变化）
      // v7.6 缺陷2：巡逻补「前方实心」探测。此前只做锚点左右 ±rng 往返，整只可以飞进墙体
      // （L8 bat#5 锚 802 飞到 762 后整只进入 9 格宽墙内，300 帧里 79 帧在实心里）。
      // 撞墙处理=把 x 钳位回墙面外侧一格再掉头，因此不存在「掉头后又立刻撞回来」的抖动
      // （钳位后下一帧探测的已是身后那一格）。只作用于有水平速度的巡逻者（水母/幽灵 vx=0 天然跳过）；
      // 俯冲 AI（_engEnemySkill 的 aim/dive/back）不经过本分支，其撞墙提前结束判定保持原样。
      const bdir = _engSign(e.vx);
      if (bdir !== 0) {
        // +0.01：右缘恰好落在瓦片边界时 floor 会退到上一格（浮点 639.9999→39），漏判一帧后才会撞上
        const leadTx = bdir > 0 ? Math.floor((e.x + e.w + 0.01) / _engTile) : Math.floor((e.x - 1) / _engTile);
        const by0 = Math.floor((e.y + 2) / _engTile), by1 = Math.floor((e.y + e.h - 2) / _engTile);
        let wall = false;
        for (let ty = by0; ty <= by1; ty++) if (L.solid(leadTx, ty, game.switchState)) { wall = true; break; }
        if (wall) {
          e.x = bdir > 0 ? leadTx * _engTile - e.w : (leadTx + 1) * _engTile;
          e.vx = -e.vx;
        }
      }
      e.x += e.vx * dt;
      if (Math.abs(e.x - e.ax) > e.rng) e.vx = -_engSign(e.x - e.ax) * Math.abs(e.vx);
      // v7.6 缺陷2（垂直侧）：正弦浮动同样不许钻进实心——会顶穿天花板/沉进地板（L8 bat#0 就是
      // 正弦下沉 5px 后整只没入 row9 的地板）。新高度若压到实心就保持上一帧合法高度=贴面滑行，
      // 既不抖动也不穿墙；上一帧高度恒合法（出生格必空 + 水平探测保证不换列）。
      const ny = e.ay + Math.sin(e.t * (e.frq || 2.2)) * (e.amp || 7);
      if (!_engBodySolid(L, e, e.x, ny)) e.y = ny;
    }
    // v6 §E：四类敌人技能状态机推进（kb 摩擦之前；死亡态/hitStop/ult/bagActive 由 updateWorld 结构自然冻结；
    // 前摇期间被打断不打断——前摇=硬直窗口，玩家可反制，设计书 §3 规则2）
    _engEnemySkill(e, dt, L, p);
    // v5 §C：击退摩擦（放在正常 AI 位移之后；220²/(2*600)≈40px 滑行）
    if (e.kb) { e.x += e.kb * dt; const ks = _engSign(e.kb); e.kb -= ks * _engKbFric * dt;
      if (_engSign(e.kb) !== ks) e.kb = 0; }
    if (e.flashT) e.flashT -= dt; // v5 §C：白闪/抖动计时（ui 表现；缺字段安全跳过）
    if (e.jitT) e.jitT -= dt;
    // 踩踏：p.vy>60 且玩家脚底深入敌体 <9px → 反弹；否则 HP 伤害（v3：原即死；v5 §F 踩踏改造）
    if (!p.dead && _engAabb(p, e)) {
      if (p.vy > 60 && p.y + p.h - e.y < 9) {
        if (e.type === 'beetle' && e.ai && e.ai.st === 'charge') {
          // v8.0 任务4：铁甲虫冲撞期间甲壳朝上，踩踏无效——只把玩家弹开并吃 1 点伤，
          // 甲虫本身不掉血（与史莱姆的核心区别：只能从侧面打，或直接跳开）。
          _engHurtPlayer(e.x + e.w / 2);
          if (p.vy > 0) p.vy = -BAL.player.stompBounce * 0.6; // 无敌帧挡下伤害时也要弹开，别陷进甲壳
          p.jumpCut = false;
          _engShake(2, 0.05);
          game.sfxQueue.push('clank');
          _engAddStars(e.x + 7, e.y + 2, 4, '#c8c8d8');
        } else if ((e.type === 'knight' || e.elite) && e.hp > 1) { // v5 §4.3：骑士踩踏扣 stompDmg 不秒杀；v7 §5.5：精英同口径（扣 1+反弹）
          e.hp -= BAL.player.stompDmg; e.flashT = 0.15;
          _engFloat(e.x + 6, e.y - 4, '' + BAL.player.stompDmg, '#ffffff', 0);
          _engShake(2, 0.05); game.sfxQueue.push('hit');
        } else { // 普通敌/残血骑士：踩杀（击飞弹道 + KO 浮字）；震屏统一 _engShake(4,0.05) 不再叠加
          _engKillEnemy(e); // v3：击杀统一入口（30% 掉回复心）
          e.dvx = 0; e.dvy = -120;
          _engShake(4, 0.05); game.sfxQueue.push('kill');
          _engFloat(e.x + 6, e.y - 6, 'KO', '#ffffff', 0);
        }
        p.vy = -BAL.player.stompBounce; p.jumpCut = false; p.airJumps = 1; p.springAir = false; // 踩踏弹跳不吃截断+重置二段跳；v6 §A 等比 −235
        _engAddCombo();                        // v2 P1：击杀计入连击
        game.sfxQueue.push('stomp');
        _engAddParts(e.x + 6, e.y + 4, 10, e.type === 'bat' ? '#8858c8' : '#58c848', 70, 250);
      } else _engHurtPlayer(e.x + e.w / 2); // v3：接触伤害走 HP 入口（受击无敌内免疫，含击退）
    }
  }

  /* ⑨′ Boss AI（v3）：状态机推进 + Boss 接触伤害（dormant/intro/dying/dead 免接触） */
  _engUpdateBoss(dt);
  /* ⑨′² v20：烬的热量维护（散热 + 满值自爆）。只在 kind7 在场时跑——
     game.heat 在其他关卡恒 0，守卫一跳就过，不会给 19 关带来任何每帧开销。 */
  if (game.boss && game.boss.kind === 7) _engM2Heat(dt);
  /* ⑨′″ v10：Boss 场地危险物（陨石/地刺/追踪弹/分身/吸附力场）——放在玩家物理之前，
     这样吸附力场本帧产生的 p.pullV 能立刻参与 ⑩ 的位移解算。 */
  _engUpdateHazards(dt);

  /* ⑨‴ v5 §4.4：吊灯摆锤——ang=sin(t*2.6+phase)*70°（确定性），锤心圆 r7 vs 玩家矩形 → HP 伤害。
        旧七关 pends 为空数组 → 循环零次，空转零副作用（H4）。w.ang/bx/by 供 ui 只读渲染。 */
  for (const pd of L.pends) {
    pd.t += dt;
    const ang = Math.sin(pd.t * 2.6 + pd.phase) * (70 * Math.PI / 180);
    const bx = pd.ax + Math.sin(ang) * pd.len, by = pd.ay + Math.cos(ang) * pd.len;
    if (!p.dead) {
      const nx = _engClamp(bx, p.x, p.x + p.w), ny = _engClamp(by, p.y, p.y + p.h);
      const dx = bx - nx, dy = by - ny;
      if (dx * dx + dy * dy < 49) _engHurtPlayer(bx); // r=7 vs 矩形最近点；HP 伤害非即死
    }
    pd.ang = ang; pd.bx = bx; pd.by = by;
  }

  /* ⑨″ Boss 战实体（v3；v5 §3.2 星陨改造）：陨石（瞄准圈/拖尾/爆坑）/ 冲击波 / 掉落心 */
  for (let i = game.meteors.length - 1; i >= 0; i--) { const m = game.meteors[i];
    if (m.delay > 0) { m.delay -= dt; continue; } // delay 期间 ui 按 m.ring 画瞄准圈（引擎不动）
    m.y += m.vy * dt;
    m.trail = (m.trail || 0) - dt; // v5 §3.2：下落中每 2 帧推 1 枚金色拖尾 fx（vy=-30, life 0.25）
    if (m.trail <= 0) { m.trail = 1 / 30;
      _engFx(m.x + 5, m.y + 2, { vy: -30, life: 0.25, color: m.mage ? '#8ae8ff' : '#f8d048', size: 1 }); }
    let boom = m.y > L.h * _engTile + 20;
    /* v12：核心护盾期星陨改为砸核心（本体免伤）——瞄准列已由 _engSkillTargetX 切到核心所在列 */
    if (game.boss && game.boss.coreOn) {
      const hzU = game.hazards || (game.hazards = []);
      for (let k = hzU.length - 1; k >= 0; k--) {
        const cu = hzU[k];
        if (cu.kind !== 'core' || !_engAabb(m, cu)) continue;
        _engFloat(cu.x + cu.w / 2, cu.y - 4, '1', '#8ad8f8', 0);
        _engCoreHit(hzU, cu, 1); boom = true; break;
      }
      if (boom && game.boss) _engCoreBreakCheck();
    } else if (!boom) {
      /* v13：真假身 —— 星陨砸到的是一具「看得见」的幻影（真身/假身都可能），这里只扣 hp，
         显形/爆炸统一由 _engUpdateHazards 的收尸处结算（唯一结算点） */
      const hzM = game.hazards || (game.hazards = []);
      for (let k = 0; k < hzM.length; k++) {
        const mu = hzM[k];
        if (mu.kind !== 'mirror' || !_engAabb(m, mu)) continue;
        mu.hp -= 1; mu.flashT = 0.15;
        _engFloat(mu.x + mu.w / 2, mu.y - 4, '1', '#b060f0', 0);
        boom = true; break;
      }
    }
    if (!boom && game.boss && _engAabb(m, game.boss)) { _engBossHurt(m.bossDmg || BAL.skills.u.bossDmg, true); _engAddCombo(); boom = true; // v5：Boss 伤 1→2；v13：星陨=大招，可破 parry；v19：法师陨星按 m.bossDmg（3）
      _engFloat(game.boss.x + game.boss.w / 2, game.boss.y - 4, '' + game.boss.lastDmg, '#48d8e8', 0); } // v10：破绽期按真实值
    // v19：法师陨星先走「按 m.dmg 扣血」分支（骑士陨星无 m.mage ⇒ 下一行逐字不变）
    if (!boom && m.mage) boom = _engMageMeteorHit(L, m);
    if (!boom) for (const e of L.enemies)
      if (!(e.dead > 0) && _engAabb(m, e)) { _engKillEnemy(e); boom = true; break; }
    if (!boom) { // 撞实心地面/砸碎 B 砖（AoE BAL.skills.u.aoe 24×24；v19：法师取 m.aoe=30）；v7 §4.2：同步可碎 'G' 隐藏砖（置'.'，无金币）
      _engRectTiles(L, m.x - 7, m.y + 8, m.aoe || BAL.skills.u.aoe, 10, function (tx, ty, ch) {
        if (ch === '#' || ch === 'I' || ch === 'B' || ch === 'G') {
          if (ch === 'B') { L.tiles[ty][tx] = '.'; game.coins += BAL.econ.brick; _engAddCombo(); }
          else if (ch === 'G') { L.tiles[ty][tx] = '.'; _engAddCombo(); } // v7：碎隐藏砖计入连击（无金币分支）
          boom = true; } }); }
    if (boom) { game.meteors.splice(i, 1); _engShake(3, 0); // v5：落地爆震屏 3（走分级槽）
      game.sfxQueue.push('meteor');
      _engAddParts(m.x + 5, m.y + 10, 16, m.mage ? '#8ae8ff' : '#f8d048', 110, 250); // 爆裂粒子 12→16（v19：法师青蓝）
      _engAddParts(m.x + 5, m.y + 10, 6, '#d8d0c0', 60, 80);             // 冲击尘 6（灰白横飞）
      game.scars.push({ x: m.x + 5, y: m.y + 12, t: 0 });                // 爆坑（ui 画椭圆坑渐隐）
      if (game.scars.length > BAL.guard.scars) game.scars.shift(); } }
  for (let i = game.waves.length - 1; i >= 0; i--) { const w = game.waves[i];
    w.x += w.vx * dt; w.life -= dt;
    const ahead = Math.floor((w.x + (w.vx > 0 ? w.w : 0)) / _engTile), wy = Math.floor((w.y + 5) / _engTile);
    if (w.life <= 0 || L.solid(ahead, wy, game.switchState)) { game.waves.splice(i, 1); continue; }
    if (!p.dead && _engAabb(w, p)) { _engHurtPlayer(w.x + 6); game.waves.splice(i, 1); } }
  for (let i = game.drops.length - 1; i >= 0; i--) { const d = game.drops[i];
    d.vy = Math.min((d.vy || 0) + BAL.econ.dropGrav * dt, BAL.econ.dropFall); d.y += d.vy * dt; d.life -= dt;
    const ty = Math.floor((d.y + d.h) / _engTile), tx = Math.floor((d.x + 4) / _engTile);
    if (L.solid(tx, ty, game.switchState)) { d.y = ty * _engTile - d.h; d.vy = 0; }
    if (d.life <= 0) { game.drops.splice(i, 1); continue; }
    if (!p.dead && _engAabb(d, p)) { game.drops.splice(i, 1);
      p.hp = Math.min(p.maxHp, p.hp + BAL.econ.heartHeal); game.sfxQueue.push('heart'); // v6 §C：上限随装备 maxHp
      _engFloat(d.x + 4, d.y - 4, '+' + BAL.econ.heartHeal, '#f8a0b0', 0); // v5 §D：回复心浮字（粉）
      _engAddParts(d.x + 4, d.y + 4, 8, '#f85888', 60, 80); } }

  /* ⑨″(续) v6 波2（loot 队）§3：装备掉落实体——重力/落速帽收编 BAL.econ.dropGrav/dropFall（同回复心），
        落地反弹一次（vy×−0.4，仅首撞 vy>60）后停驻 rest；水平速度 3/s 指数衰减；
        永不过期（跨死亡保留 §5；换关 loadLevel 清空=放弃未拾取，Boss 关由 H4 兜底）；
        拾取=玩家 AABB 重叠 → game.pickups 事件 {slot,r} + sfx 'pickup'（H2：入包/浮字/存档全归 ui，
        稀有度光柱/图标浮动渲染归波2 bag 队，engine 零绘制零命名表）。 */
  for (let i = game.gearDrops.length - 1; i >= 0; i--) { const d = game.gearDrops[i];
    d.t += dt;
    if (!d.rest) {
      d.vy = Math.min(d.vy + BAL.econ.dropGrav * dt, BAL.econ.dropFall);
      d.x += d.vx * dt; d.y += d.vy * dt; d.vx *= (1 - Math.min(1, 3 * dt));   // 水平衰减
      const ty = Math.floor((d.y + d.h) / _engTile), tx = Math.floor((d.x + 5) / _engTile);
      if (L.solid(tx, ty, game.switchState)) {
        d.y = ty * _engTile - d.h;
        if (!d.bounced && d.vy > 60) { d.vy = -d.vy * 0.4; d.bounced = true; } // 落地反弹一次
        else { d.vy = 0; d.vx = 0; d.rest = true; }                            // 停驻
      }
      if (d.y > L.h * _engTile + 30) { game.gearDrops.splice(i, 1); continue; } // 兜底：坠出世界
    }
    if (!p.dead && _engAabb(d, p)) {                                           // 拾取
      game.pickups.push({ slot: d.slot, r: d.r });
      game.sfxQueue.push('pickup');
      game.gearDrops.splice(i, 1);
    } }

  /* ⑨⁗ v6 §2.2：星刃回旋实体（技能 L）——去程直线 range 160px → 回程追踪玩家 vBack 340；
        拖尾每 0.03s 1 枚金色细长 fx（复用冲刺风粒样式）；命中不 hit-stop/震屏（远程技能保持节奏）。
        判定每程独立：hits 记名 'e'+i+phase / 'boss'+phase（一程一目标一伤）；斩碎弹幕（含火球）无连击。 */
  for (let i = game.blades.length - 1; i >= 0; i--) { const bl = game.blades[i];
    bl.life -= dt;
    const prevBlx = bl.x; // 位移前快照（回程正面判定用当帧行进向，工单 §D）
    if (bl.phase === 0) { bl.x += bl.vx * dt; bl.trav += Math.abs(bl.vx) * dt;
      if (bl.trav >= BAL.skills.l.range) bl.phase = 1; }               // 去程 160px（任务书）
    else { const cx = p.x + p.w / 2, cy = p.y + p.h / 2, bx = bl.x + 6, by = bl.y + 6;
      const dx = cx - bx, dy = cy - by, d = Math.hypot(dx, dy) || 1;
      bl.x += dx / d * BAL.skills.l.vBack * dt; bl.y += dy / d * BAL.skills.l.vBack * dt;   // 回程向玩家追踪 340
      if (d < 10) { _engFx(bx, by, { ring: 1, r: 2, r1: 12, life: 0.25, color: '#f8d048' }); game.blades.splice(i, 1); continue; } }
    // 拖尾：每 0.03s 1 枚金色细长 fx（复用冲刺风粒样式 engine.js v5 §B）
    bl.trail = (bl.trail || 0) - dt;
    if (bl.trail <= 0) { bl.trail = 0.03;
      _engFx(bl.x + 5 - bl.dir * 6, bl.y + 6, { vx: -bl.dir * 60, vy: 0, life: 0.22, color: '#f8d048', size: 1 }); }
    if (bl.life <= 0) { game.blades.splice(i, 1); continue; }          // 寿命 2.6s 防丢强制回收
    /* —— 判定（每程独立）—— */
    const bdir = _engSign(bl.x - prevBlx) || bl.dir;                   // 当帧行进向（回程由追踪向量决定）
    const dmg = BAL.skills.l.dmg;                                      // 固定 2，不吃 ATK（平衡表 §P 推导）
    // ① 敌人（含骑士格挡：星刃行进向===骑士面朝侧 → GUARD 0 伤，一程记名一次；破绽态正面失效，设计 §3.3）
    for (let j = 0; j < L.enemies.length; j++) { const e = L.enemies[j];
      if (e.dead > 0 || bl.hits['e' + j + bl.phase] || !_engAabb(bl, e)) continue;
      bl.hits['e' + j + bl.phase] = 1;
      const eface = _engSign(e.vx) || e.face || 1;
      if (e.type === 'knight' && !e.guardDown && ((bdir > 0) === (eface > 0))) {
        game.sfxQueue.push('clank'); _engFloat(e.x + 6, e.y - 4, 'GUARD', '#ffffff', 0);
        _engAddStars(e.x + 6, e.y + 6, 3, '#ffe9b0'); continue; }
      e.hp = (e.hp === undefined ? 1 : e.hp) - dmg;
      if (e.hp > 0) e.kb = p.face * _engKbV * (e.elite ? BAL.elite.kbMul : 1); // v7 §5.5-1：星刃击退同式（存活分支；精英 ×0.25）
      _engAddCombo();                                                  // 与普攻同口径：命中 +1 连击
      _engFloat(e.x + 6, e.y - 4, '' + dmg, '#f8d048', 0); _engAddStars(e.x + 6, e.y + 6, 4, '#f8d048');
      game.sfxQueue.push('hit');
      if (e.hp <= 0) { _engKillEnemy(e); e.dvx = bl.dir * 130; e.dvy = -150;
        _engFloat(e.x + 6, e.y - 6, 'KO', '#f8d048', 0); game.sfxQueue.push('kill'); } }
    // ② Boss：一程一伤，固定 2，走 _engBossHurt（免伤态自动 false 不计数）
    // v13：按集成队口径传 isUlt=true（技能刀光视同大招，可破 parry 架势）
    /* v13 裁决：星刃（L）**不能**破 parry——它是 CD 6s 的常规远程技能、不消耗 ultCharge，
       能破的话玩家站在安全距离按一下 L 就白拿 2.4s 破防，架势这招直接作废。
       破招只认消耗充能的大招（O 起手 / U 星陨）。 */
    if (game.boss && !bl.hits['boss' + bl.phase] && _engAabb(bl, game.boss) && _engBossHurt(dmg)) {
      bl.hits['boss' + bl.phase] = 1;
      _engFloat(game.boss.x + 26, game.boss.y - 4, '' + game.boss.lastDmg, '#48d8e8', 0); game.sfxQueue.push('hit'); } // v10：破绽期按真实值
    // ③ 弹幕（含法师火球 fire:true）：斩碎，无连击（同普攻斩弹口径）
    for (let j = game.bullets.length - 1; j >= 0; j--) { const b = game.bullets[j];
      if (_engAabb(bl, b)) { game.bullets.splice(j, 1);
        _engAddParts(b.x + 4, b.y + 3, 8, b.fire ? '#f86030' : '#f8b020', 80, 200); game.sfxQueue.push('break'); } } }

  /* ⑨⁗′ v19（spec §2.6）：法师远程弹体——与星刃同层（hitStop/ult 冻结语义自动继承）；
         必须在 ⑩ 玩家物理之前：玩家本帧起手发出的弹体从下一帧开始飞，不会在同一帧内「出膛即命中」。 */
  _engUpdateShots(dt);

  /* ⑨⁗″ v19.3：引力奇点——必须排在 ⑨ 敌人 AI 之后：AI 本帧已按 e.vx 积分过位置，
         这里再叠一层朝中心的位移才叫「吸」；若排在 AI 之前，AI 会当帧把位移走回去。 */
  _engUpdateWells(dt);

  /* ⑩ 玩家物理（含死亡冻结计时、弹簧、平台吸附、攻击/冲刺） */
  _engUpdatePlayer(dt, L, p);

  /* ⑩′ 攻击判定（v2 P1）：判定框存在 atkDur 秒，每步扫描敌人/炮弹/'B' 砖 */
  _engResolveAttack(L, p);

  /* ⑩″ v5 §4.1：上升气流——玩家矩形覆盖任一 'w' 瓦片 → vy -= 1900*dt（与重力合成净 -400px/s²），
        上升终速 -170；冲刺全程不吃风；跳跃/二段跳在风内照常；敌/弹/掉落物不受风。
        旧七关无 'w' 瓦片 → inWind 恒 false，空转零副作用（H4）。 */
  let inWind = false;
  _engRectTiles(L, p.x + 1, p.y + 2, p.w - 2, p.h - 3, function (tx, ty, ch) { if (ch === 'w') inWind = true; });
  if (inWind && p.dashT <= 0) {
    p.vy -= _engWindUp * dt;
    if (p.vy < -_engWindCap) p.vy = -_engWindCap;
  }

  /* ⑩‴ v7 §4.1：水流——玩家矩形覆盖任一 '{'/'}' 瓦片 → 水平加速（BAL.flow.acc 600px/s²，上限 ±BAL.flow.cap 170）；
        与输入加速度(1400)代数叠加，逆流可挣脱；跳跃不受影响（vy 不碰）。
        纯区域瓦片同 'w'：不入 SOLIDISH/STAND、solid() 不认；只有玩家矩形扫描（敌/弹/掉落物不受水流）。
        冲刺爆发段内仍生效（水中冲刺被水流同向加速/逆向削弱，设计 §4.1 接受）；
        '@' 3 格内无水流瓦片由 validateLevels §10-5 断言保证 → 门禁空转零副作用。 */
  let inWater = 0;
  _engRectTiles(L, p.x + 1, p.y + 2, p.w - 2, p.h - 3, function (tx, ty, ch) {
    if (ch === '{') inWater = -1; else if (ch === '}') inWater = 1;
  });
  if (inWater && !p.dead) p.vx = _engClamp(p.vx + inWater * BAL.flow.acc * dt, -BAL.flow.cap, BAL.flow.cap);

  /* ⑪ 危险判定：尖刺 ^ 下半 / 吊刺 v 上半 / 熔岩 ~ y+3 以下 / 坠出底部（契约算法 5） */
  if (!p.dead) {
    let hazard = false;
    _engRectTiles(L, p.x + 1, p.y + 2, p.w - 2, p.h - 3, function (tx, ty, ch) {
      if (ch === '^' && p.y + p.h > ty * _engTile + 8) hazard = true;
      else if (ch === 'v' && p.y < ty * _engTile + 8) hazard = true;
      else if (ch === '~' && p.y + p.h > ty * _engTile + 3) hazard = true;
    });
    if (hazard) _engHazardHit(p.x + p.w / 2 - p.face * 12); // v7.8：护盾优先吃，无盾才真死
    if (p.y > L.h * _engTile + 24) killPlayer(); // 坠落即死（护盾不救：掉出地图没有落点）
  }

  /* ⑫ 粒子 */
  game.parts = game.parts.filter(function (pt) {
    pt.life -= dt; pt.vy += pt.grav * dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt;
    return pt.life > 0;
  });

  /* ⑬ 计时 / 震屏 / 连击断档 / 相机（跟随 + 面向前瞻 20px + lerp 0.12 + 关卡钳制，契约算法 13） */
  game.time += dt;
  game.shake = Math.max(0, game.shake - 20 * dt);
  if (game.shakePend) { // v5 §1.5：分级震屏挂起槽到点生效（hit-stop 冻结期不倒计时，解冻瞬间接上）
    game.shakePend.t -= dt;
    if (game.shakePend.t <= 0) { game.shake = Math.max(game.shake, game.shakePend.m); game.shakePend = null; }
  }
  if (game.comboT > 0) { // v2 P1：连击 2s 窗口断档清零
    game.comboT -= dt;
    if (game.comboT <= 0) { game.comboT = 0; game.combo = 0; }
  }
  const ctx2 = p.x + p.w / 2 - _engVW / 2 + p.face * 20;
  /* v8.0 任务3：纵向死区 + 前瞻（横向 20px 面向前瞻与 0.12 lerp 一字不动）。
     旧写法 cty2 = 玩家中心 − 视口/2 再 lerp，看似正常，但末行 clamp(0, max(0, L.h*16−224)) 在
     关卡高度恰好等于视口（L1/L3 的 h=14 → 224px）时上限为 0，cam.y 被永久钉死——玩家在关卡
     任何高度画面都不动，这就是「这里视角不变化」。相机侧三件事：
     ① 死区 ±20px：玩家在屏幕纵向中央 ±20px 内移动时目标点完全不动（跳跃不抽搐）；
     ② 前瞻：vy>120（快落）目标下移 16px 提前看到落点 / vy<−120（快升）上移 12px；
     ③ 分轴 lerp：纵向 0.08 比横向 0.12 更慢更稳。 */
  const pcy = p.y + p.h / 2;
  const camCy = game.cam.y + _engVH / 2;
  const look = p.vy > 120 ? _engCamLookDown : (p.vy < -120 ? -_engCamLookUp : 0);
  let cty2 = game.cam.y; // 死区内：目标点=当前值 → 相机不动
  if (pcy < camCy - _engCamDz) cty2 = pcy - _engCamDz - _engVH / 2 + look;
  else if (pcy > camCy + _engCamDz) cty2 = pcy + _engCamDz - _engVH / 2 + look;
  const maxCamY = L.h * _engTile - _engVH;
  if (maxCamY < 0) cty2 = maxCamY / 2; // v8.0：关卡不足一屏 → cam.y 取负值把内容垂直居中（不做纵向跟随）
  game.cam.x += (ctx2 - game.cam.x) * 0.12;
  game.cam.y += (cty2 - game.cam.y) * _engCamLerpY;
  game.cam.x = _engClamp(game.cam.x, 0, Math.max(0, L.w * _engTile - _engVW));
  game.cam.y = maxCamY < 0 ? _engClamp(game.cam.y, maxCamY, 0) : _engClamp(game.cam.y, 0, maxCamY);

  /* ⑬′ v3：技能四 CD 递减 / 连斩白屏递减 */
  game.skills.u = Math.max(0, game.skills.u - dt);
  game.skills.i = Math.max(0, game.skills.i - dt);
  game.skills.o = Math.max(0, game.skills.o - dt);
  game.skills.l = Math.max(0, game.skills.l - dt); // v6 §D：技能4 星刃 CD
  if (game.flashT > 0) { game.flashT -= dt; if (game.flashT < 0) game.flashT = 0; }
}
