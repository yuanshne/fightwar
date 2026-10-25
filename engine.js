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
       → p.maxHp=5+equip.hp / 普攻 ATK=1+equip.atk / 限速 effRun=maxRun×(1+equip.spd) / 技能 CD×cdMul；
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
   jumpV 330→309、springV 520→488（等高换算 k=√(1320/1500)≈0.9381，h=v²/2g 不变）。 */
const PHY = {
  grav: 1320, maxFall: 285, acc: 1400, fric: 1800, fricIce: 180,
  maxRun: 120, jumpV: 309, springV: 488,
  coyote: 0.12, buffer: 0.18 // v2 P1 手感调优：土狼 0.09→0.12、缓冲 0.11→0.18（任务书指定）
};

/* ==================== v6 BAL 全数值总表（新契约导出；平衡表 §0 逐字照抄，唯一权威） ====================
   docs/specs/2026-10-24-v6-balance.md §0：不得增删键、不得改值；每个键附平衡表推导索引。
   〔书〕=v6 任务书指定；〔换算〕=新重力等比 k=0.9381；〔收编〕=现行代码值收编不改；〔定〕=平衡表新定。 */
const BAL = {
  fall:  { fast: 360 },                       // §F 速降上限（=旧 maxFall，按住↓恢复精准落地）
  player:{ hpBase: 5, atkBase: 1, critMul: 2, critMod: 4,
           stompDmg: 1, stompBounce: 235, hurtKbX: 160, hurtKbY: 131, invT: 1.0, respawnInvT: 1.5 },
  atk:   { cd: 0.35, boxW: 18, boxH: 14, anim: 0.25, wind: 0.05, dur: 0.12, hitStop: 0.10 },
  // v7.7 手感：cd 0.8→0.5（对照空洞骑士 0.45~0.55s；dur/v 不动 ⇒ 冲刺距离 59.53px 不变）
  dash:  { cd: 0.5, dur: 0.28, v: 260, gravMul: 0.5 },
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
    slime:  { hp: 3, spd: 28, fall: 300, skill: { rngX: 56, up: 40, dn: 48, wind: 0.5, vx: 90, vy: 260, cd: 3.2 } },
    bat:    { hp: 2, spd: 40, rng: 44, skill: { rng: 90, wind: 0.5, vDive: 240, diveMax: 0.55, vBack: 120, cd: 4.0 } },
    knight: { hp: 4, spd: 20, skill: { rngX: 110, rngY: 24, wind: 0.6, vx: 190, dur: 0.5, vuln: 0.7, cd: 5.0 } },
    mage:   { hp: 3, skill: { rng: 140, cast: 0.8, recover: 0.5, boltV: 95, home: 1.6, turn: 2.2, boltLife: 3.2, cd: 3.5 } },
    // v7 §8 追加四键（新敌；ghost/boomer 技能机不用冷却故无 cd 键——§5.6 表「CD —」）
    lancer: { hp: 3, spd: 34, fall: 300, skill: { rngX: 72, rngY: 24, wind: 0.55, vx: 240, dur: 0.28, recover: 0.5, cd: 4.5 } },
    jelly:  { hp: 2, skill: { rng: 40, wind: 0.6, dur: 0.4, ring: 18, cd: 5.0 } },
    ghost:  { hp: 3, skill: { wake: 150, lose: 260, spd: 26, home: 40 } },
    boomer: { hp: 2, spd: 30, fall: 300, skill: { wake: 120, rng: 36, rngY: 40, wind: 0.8, r: 16 } } },
  boss:  { hp: 60, p2At: 30, actDist: 176, grav: 1500, fallV: 520,
           windup: { leap: 0.50, barrage: 0.45, charge: 0.60, summon: 0.50, nova: 0.55 }, p2WindMul: 0.85,
           idleT: [0.6, 0.45], walk: [20, 25],
           leap: { T: 0.9, vy: 675, clamp: 300 },
           charge: { v: [230, 290], maxT: 1.5, maxX: 320 },
           barrage: { v: 130, rounds: 3, pairGap: 0.15, endT: 0.45, deg: [-8, 8] }, // v7 §8：deg=现行硬编码 [-8,8] 收编
           nova: { v: 100, t: [0.55, 0.95], endT: 1.2 },
           stagger: 1.5, enrage: 1.2, dying: 2.2,
           recover: { leap: 0.7, barrage: 0.5, charge: 0.4, summon: 0.5, nova: 0.6 },
           contactDmg: 1,
           // v7 §8 追加键：kind1 现行硬编码逐字收编（零行为变化——H5，_v6_loot_test ② L7 采样双证）
           w: 52, h: 48, drop1: 'boss1', drop2: 'boss2',
           summon: { type: 'slime', n: 2, off: [-40, 40] },
           poolNear: ['charge', 'leap', 'summon', 'charge'],
           poolFar: ['barrage', 'charge', 'leap', 'barrage'],
           p2Add: ['nova'] },
  boss2: { // 蛟龙·敖渊（L13，sea）——v7 §8 逐字
    hp: 90, p2At: 36, actDist: 176, grav: 1500, fallV: 520, w: 64, h: 40,
    windup: { leap: 0.55, barrage: 0.50, charge: 0.65, summon: 0.50, sweep: 0.55, nova: 0.55 },
    p2WindMul: 0.85, idleT: [0.7, 0.5], walk: [26, 32],
    leap: { T: 1.0, vy: 700, clamp: 320 },
    charge: { v: [250, 310], maxT: 1.5, maxX: 320 },
    barrage: { v: 110, rounds: 4, pairGap: 0.18, endT: 0.5, deg: [-18, 0, 18] },
    sweep: { rounds: 3, gap: 0.55, wv: 130, life: 0.42, wh: 16 },
    nova: { v: 110, t: [0.55, 0.95], endT: 1.2 },
    summon: { type: 'jelly', n: 2, off: [-44, 44] },
    stagger: 1.5, enrage: 1.2, dying: 2.2,
    recover: { leap: 0.7, barrage: 0.5, charge: 0.4, summon: 0.5, nova: 0.6, sweep: 0.6 },
    poolNear: ['sweep', 'leap', 'summon', 'sweep'],
    poolFar: ['barrage', 'charge', 'leap', 'barrage'],
    p2Add: ['nova'], contactDmg: 1, drop1: 'jiao1', drop2: 'jiao2' },
  boss3: { // 幽冥判官（L16，nether）——v7 §8 逐字
    hp: 140, p2At: 56, actDist: 176, grav: 1500, fallV: 520, w: 40, h: 52,
    windup: { blink: 0.50, scythe: 0.60, barrage: 0.45, summon: 0.50, nova: 0.55 },
    p2WindMul: 0.85, idleT: [0.55, 0.4], walk: [18, 22],
    leap: { T: 0.9, vy: 675, clamp: 300 },      // 表完整性（判官轮换池不含 leap/charge）
    charge: { v: [230, 290], maxT: 1.5, maxX: 320 },
    barrage: { v: 120, rounds: 3, pairGap: 0.16, endT: 0.45, deg: [-10, 0, 10] },
    blink: { hideT: 0.30, dx: 96, after: 0.35 },
    scythe: { wv: 150, life: 0.6, w: 16, h: 22 },
    nova: { v: 105, t: [0.55, 0.95], endT: 1.2 },
    summon: { type: 'ghost', n: 2, off: [-48, 48] },
    stagger: 1.5, enrage: 1.2, dying: 2.4,
    recover: { blink: 0.4, scythe: 0.6, barrage: 0.5, summon: 0.5, nova: 0.6, leap: 0.7, charge: 0.4 },
    poolNear: ['scythe', 'blink', 'summon', 'scythe'],
    poolFar: ['barrage', 'blink', 'scythe', 'barrage'],
    p2Add: ['nova'], contactDmg: 1, drop1: 'gui1', drop2: 'gui2' },
  elite: { scale: 1.75, spdMul: 0.8, kbMul: 0.25, lancer: { hp: 14 }, ghost: { hp: 12 } }, // v7 §8：精英怪
  flow:  { acc: 600, cap: 170 },  // v7 §8：水流 §4.1（cap 170>maxRun 120<逆流冲刺，数值推导见设计书）
  econ:  { coin: 1, gem: 5, puzzle: 5, brick: 1, heartChance: 0.30, heartHeal: 1, dropGrav: 1200, dropFall: 360, chestGem: 5 }, // v7 §8：chestGem
  gear:  {                                           // §Q（波2 生效）
    boss1: [44,30,16,8,2], boss2: [20,35,25,15,5], elite: [55,30,12,3,0],
    eliteChance: 0.10, bossExtra: 0.30,
    stat: { w: [1,2,3,4,6], h: [1,2,3,4,4], cSpd: [4,6,8,10,12], cCd: [4,6,8,10,12] },
    shardsPerStep: 3, shardsPerSalvage: 2, bagSize: 12,
    // v7 §8 追加六表（权重和=100，序=白/绿/蓝/紫/金）
    jiao1: [30, 28, 20, 14, 8],  jiao2: [16, 28, 26, 18, 12],
    gui1:  [22, 26, 24, 18, 10], gui2: [12, 24, 28, 22, 14],
    hidden: [15, 25, 25, 22, 13], eliteK: [25, 30, 25, 20, 0] },
  guard: { parts: 240, floats: 40, fx: 60, scars: 8 } // 容量守卫（R5，不得放宽）
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
    for (let y = 1; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.tiles[y][x] === '#' && this.tiles[y - 1][x] === '.' && rnd() < 0.16) {
          this.decor.push({
            x: x * _engTile + (rnd() * 8 | 0), y: y * _engTile,
            type: dset[(rnd() * dset.length) | 0], f: (rnd() * 2) | 0
          });
        }
      }
    }

    this.totalCoin = this.coins.reduce((a, c) => a + (c.key ? 0 : (c.gem ? 5 : 1)), 0) + brickN; // 木箱内含金币一并计入
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
  skills: { u: 0, i: 0, o: 0, l: 0 }, // 技能 CD 剩余秒（U/I/O + v6 L）
  flashT: 0,             // 流星连斩白屏剩余（s）
  // v4：谜题神龛（沿 v2/v3 先例扩展字段，不新增契约外顶层全局符号）
  puzzleActive: false,   // 谜题覆盖层打开中——updateWorld 顶部直接 return（同 paused 冻结语义，不改 paused）
  puzzleNear: -1,        // 玩家靠近的神龛 idx（1~6），不靠近=-1（每步刷新；ui 据此提示/消费开龛键）
  solvedPuzzles: {},     // 已解神龛表 {"1":true,...}（loadLevel 重置；ui 从 localStorage 注入已解状态）
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
  bagActive: false       // 背包开启冻结（updateWorld 顶部早退，同 puzzleActive 位；波2 bag 队启用）
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
  boomer: { w: 10, h: 10, hp: BAL.enemy.boomer.hp,        ground: true,  patrol: false }
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
    face: -1, guardDown: false, ai: _engMkAI(type, px, py) };
}

function _engMkPlayer(x, y) { // 内部：玩家对象（字段 = 契约清单 + v2 P1 攻击/冲刺字段 + v3/v5/v6 扩展）
  const maxHp = BAL.player.hpBase + (game.equip ? game.equip.hp : 0); // v6 §C：装备头饰加成上限（缺省=5）；v7.7：局外成长项已删（纯基础值+装备）
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
    atkSeq: 0 // v5 §C：每次挥击序号——hit-stop 冻结后判定框仍存活，同一摆不得对同一目标二次结算
  };
}

function loadLevel(idx, keepStats) {
  game.levelIdx = idx;
  game.level = new Level(idx);
  const L = game.level;
  if (!keepStats) { game.time = 0; game.deaths = 0; game.coins = 0; game.keys = 0; game.switchState = 0; }
  game.bullets = []; game.parts = [];
  // respawnAt.p = 前进度量(x-y)：检查点「只进不退」的比较基准（横版 x 递增 / 纵版 y 递减均单调）
  game.respawnAt = { x: L.spawn.x, y: L.spawn.y, p: L.spawn.x - L.spawn.y };
  game.player = _engMkPlayer(L.spawn.x, L.spawn.y);
  game.cam.x = _engClamp(L.spawn.x + 5 - _engVW / 2, 0, Math.max(0, L.w * _engTile - _engVW));
  game.cam.y = _engClamp(L.spawn.y + 7 - _engVH / 2, 0, Math.max(0, L.h * _engTile - _engVH));
  // v3：Boss 创建 + 新实体/技能字段复位（工单 A「loadLevel 末尾」）
  // v7 §6.1：kind 推导——boss:true≡1（星核巨兽），boss:2=蛟龙，boss:3=判官
  const kind = L.meta.boss === true ? 1 : (L.meta.boss || 0);
  game.boss = L.bossSpawn ? _engMkBoss(L.bossSpawn.x, L.bossSpawn.y, kind) : null;
  game.drops = []; game.meteors = []; game.waves = []; game.flashT = 0;
  game.skills = { u: 0, i: 0, o: 0, l: 0 };
  // v4：谜题状态复位——覆盖层强制关闭 / 接近清空 / 已解表清空（工单 4：
  // solvedPuzzles={} 在 loadLevel 重置；已解状态由 ui 在 startLevel 后从 localStorage 注入）
  game.puzzleActive = false; game.puzzleNear = -1; game.solvedPuzzles = {};
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
  // v6 §C：HP 回满（maxHp 含装备头饰加成）+ BAL 出生保护；技能 CD 保留计时（设计 §5）
  p.maxHp = BAL.player.hpBase + (game.equip ? game.equip.hp : 0); // v7.7：局外成长项已删（否则复活后上限与出生时不一致）
  p.hp = p.maxHp; p.invT = BAL.player.respawnInvT; p.shieldT = 0; p.castT = 0;
  p.jumpCut = false; p.prevJump = 0;
  // v5 §A：二段跳/手感演出状态复位（复活=重置为 1，设计 §1.1；floats/fx 保留自然消散）
  p.airJumps = 1; p.djT = 0; p.turnT = 0; p.stepT = 0; p.springAir = false;
  p.atkAnim = 0; p.atkWind = 0; p.shieldHp = 0;
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
  // v3：Boss 重置——HP/阶段保留，状态回 idle（若存在且非 dormant/dead，工单 B）
  if (game.boss && game.boss.state !== 'dormant' && game.boss.state !== 'dead') {
    game.boss.state = 'idle'; game.boss.t = 0; game.boss.vx = 0; game.boss.vy = 0;
  }
  for (const e of L.enemies) {
    e.dead = 0;
    if (e.type === 'bat') { e.x = e.ax; e.y = e.ay; }
    else { e.x = e.hx; e.y = e.hy; e.vy = 0; e.grounded = false; }
    // v6 §E：技能状态机复位（相位按复位后坐标重算，与出生同值确定性）+ 骑士破绽解除
    if (e.ai) e.ai = _engMkAI(e.type, e.x, e.y);
    e.guardDown = false;
  }
  for (const c of L.crumbles.values()) { c.state = 0; c.t = 0; c.dy = 0; c.dvy = 0; }
}

function killPlayer() {
  const p = game.player;
  if (!p || p.dead || game.state !== 'play') return;
  p.dead = true; p.deadT = 0;
  p.atkT = 0; p.dashT = 0; p.abuf = 0; // v2 P1：动作状态随死亡终止（v7.7 追加攻击缓冲）
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

/* ==================== v4：谜题神龛结算（新契约导出，见 CONTRACT 附记） ==================== */
function puzzleSolved(idx) { // 谜题解开结算（ui 在覆盖层校验全对时调用；红线唯一允许的新全局导出）
  if (game.solvedPuzzles[idx]) return; // 已解神龛不重复结算（正常流：已解神龛走 ui 只读模式不会到这；防御双发奖）
  game.solvedPuzzles[idx] = true;      // 持久化由 ui 层负责（engine 不碰 localStorage）
  game.coins += BAL.econ.puzzle;       // 奖励 5 金币（等价一颗宝石，直接走计数，不涉及宝石实体）
  game.sfxQueue.push('puzzle'); game.sfxQueue.push('gem'); // 解谜音 + 得宝石音（只入队，engine 不发声）
  const p = game.player;
  if (p) _engAddParts(p.x + 5, p.y - 6, 24, '#f8d048', 130, 150); // 玩家位置上方金色烟花 ≈24 粒（#f8d048=美术金色印章色）
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

function _engHurtPlayer(fromX) { // 内部：一切 HP 伤害的唯一入口（工单 B；即死物不走这里）
  const p = game.player;
  if (!p || p.dead || game.state !== 'play') return false;
  if (p.invT > 0) return false;                    // 无敌帧：伤害与击退全免
  if (p.shieldT > 0) {                             // v5 §3.3：护盾吸收 1 次（不获得无敌帧）
    p.shieldHp--; _engShake(2, 0); game.sfxQueue.push('shieldhit');
    if (p.shieldHp <= 0) _engShieldBreak();        // 吸收耗尽 → 破盾事件（sfx+碎裂 fx+清盾）
    return false;
  }
  p.hp--; p.invT = BAL.player.invT;
  p.vx = (p.x + p.w / 2 < fromX ? -1 : 1) * BAL.player.hurtKbX;   // 击退方向=离伤害源
  p.vy = -BAL.player.hurtKbY; p.dashT = 0; p.atkT = 0;
  p.airJumps = 1; p.springAir = false;             // v5 §1.1：受击重置二段跳/解锁弹簧锁
  game.shake = Math.max(game.shake, 5);
  game.sfxQueue.push('hurt');
  _engAddParts(p.x + 5, p.y + 7, 10, '#f85858', 90, 200);
  if (p.hp <= 0) killPlayer();                     // 复用 v2 死亡序列
  return true;
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
}

function _engOnScreen(e) { // 内部：实体矩形是否在视口内（连斩「屏内普通敌全灭」判定用）
  return e.x + e.w > game.cam.x && e.x < game.cam.x + _engVW &&
         e.y + e.h > game.cam.y && e.y < game.cam.y + _engVH;
}

function _engBossTable(kind) { // 内部：v7 Boss 参数表选择（kind 0/1=星核巨兽，2=蛟龙·敖渊，3=幽冥判官）
  // R4：三 Boss 差异只允许来自本选择器命中的参数表；禁止第二份 Boss 状态机 switch。
  return kind === 2 ? BAL.boss2 : kind === 3 ? BAL.boss3 : BAL.boss;
}

function _engMkBoss(cx, py, kind) { // 内部：Boss 实体（cx=锚点中心x, py=锚点行顶；v7 §6.1 参数化）
  const T = _engBossTable(kind || 0);
  return {
    x: cx - T.w / 2,
    // 【工单偏离·已裁决】伪代码 `y: py` 为笔误——那会把命中框嵌入主地板 32px，
    // 与 engine.md A 节「落地脚底 y=208」及设计 §1「脚底站在地面瓦片顶」/§6「落地脚 y=208」矛盾。
    // 按「落地脚底=锚点下一行的地板顶面」实现：y=(锚点行+1)*16-h（随表高推导；kind1 即原 48 值，零回归）。
    y: py + _engTile - T.h,
    w: T.w, h: T.h, vx: 0, vy: 0, face: -1,
    kind: kind, hidden: false,     // v7 §6.1：kind 1/2/3；§6.3：blinkCast 隐身位
    hp: T.hp, maxHp: T.hp, phase: 1,
    state: 'dormant', t: 0,        // t：当前状态已累计秒数
    next: '', lastPattern: '', pickN: 0,
    flashT: 0, chargeDir: 1, chargeFrom: 0, landX: 0, fireN: 0
  };
}

function _engBossDur(name, phase) { // 内部：前摇表(秒)，P2 ×p2WindMul（设计 §3）；v7 §6：读当前 Boss 参数表
  const T = _engBossTable((game.boss && game.boss.kind) || 0);
  return T.windup[name] * (phase === 2 ? T.p2WindMul : 1);
}

function _engBossPick(b) { // 内部：确定性轮转选招（设计 §2，不用随机）；v7 §6.2：池全读表（R4）
  const T = _engBossTable(b.kind || 0);
  const p = game.player, bcx = b.x + b.w / 2, adx = Math.abs(p.x + p.w / 2 - bcx);
  // slice：与原实现「每次新建数组字面量」等价，避免过滤前共享表被误改
  let pool = (adx <= 200 ? T.poolNear : T.poolFar).slice();
  if (b.phase === 2) pool = pool.concat(T.p2Add);
  const alive = game.level.enemies.filter(function (e) { return !(e.dead > 0); }).length;
  if (alive >= 2) pool = pool.filter(function (n) { return n !== 'summon'; });
  pool = pool.filter(function (n) { return n !== b.lastPattern; });
  if (!pool.length) pool = ['barrage'];
  b.next = pool[b.pickN++ % pool.length]; b.lastPattern = b.next;
  b.state = 'windup'; b.t = 0;
}

function _engBossHurt(dmg) { // 内部：Boss 唯一承伤入口（攻击/星陨/连斩都走这里；五态免伤+v7 blink 隐身免伤）
  const b = game.boss;
  if (!b || b.state === 'dormant' || b.state === 'intro' || b.state === 'enrage'
        || b.state === 'dying' || b.state === 'dead'
        || (b.state === 'blinkCast' && b.hidden)) return false; // v7 §6.3：blink 隐身期免伤
  const T = _engBossTable(b.kind || 0); // v7 §6：P2 线/掉落表读表
  b.hp -= dmg; b.flashT = 0.12;
  game.hitStop = Math.max(game.hitStop, _engHitStop); // v5 §1.6：Boss 承伤 hit-stop 同步 0.10
  game.shake = Math.max(game.shake, 3);
  game.sfxQueue.push('bosshit');
  if (b.hp <= 0) { b.hp = 0; b.state = 'dying'; b.t = 0;
    // v6 波2 §2①：Boss 掉落——进入 dying 瞬间生成（levelClear 在死亡演出后才触发，此处先掉，
    // 玩家可在演出期内拾取；漏捡由 levelClear 开头的 H4 兜底转 pickups）。第 1 件必掉（T.drop1 权重）、
    // 第 2 件 30%（bossExtra，T.drop2 权重）；生成位置 = Boss 中心 ±24/14、脚上 14px；池满 ≥6 跳过（H3）。
    // v7 §6.5：掉落表名读表（kind1='boss1'/'boss2' 收编）。
    if (game.gearDrops.length < _engGearCap)
      game.gearDrops.push(_engMkGear(b.x + b.w / 2 - 24, b.y + b.h - 14, _engSlot(), _engRollTier(BAL.gear[T.drop1])));
    if (Math.random() < BAL.gear.bossExtra && game.gearDrops.length < _engGearCap)
      game.gearDrops.push(_engMkGear(b.x + b.w / 2 + 14, b.y + b.h - 14, _engSlot(), _engRollTier(BAL.gear[T.drop2])));
    game.bullets = []; game.waves = []; game.shake = 10; return true; } // 死亡优先：大伤害一刀斩不得被狂暴吸收卡 1 血
  if (b.hp <= T.p2At && b.phase === 1) { b.phase = 2; b.state = 'enrage'; b.t = 0;
    game.sfxQueue.push('roar'); game.shake = 6; return true; }
  return true;
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

function _engBossNovaRing(b, deg) { // 内部：nova 8 向放射弹（第二环 deg=22.5 转角）；v6 §F 弹速收编、v7 §6 改读本 Boss 表
  const T = _engBossTable(b.kind || 0);
  const bcx = b.x + b.w / 2, bcy = b.y + 20;
  for (let i = 0; i < 8; i++) { const a = (i * 45 + deg) * Math.PI / 180;
    game.bullets.push({ x: bcx - 4, y: bcy - 4, w: 8, h: 8,
      vx: Math.cos(a) * T.nova.v, vy: Math.sin(a) * T.nova.v, star: true }); }
}

function _engBossSummon(T) { // 内部：v7 §6.2 参数化召唤（type/n/off 全读表；实体走 _engMkEnemy 工厂）
  // kind1 表 {type:'slime',n:2,off:[-40,40]} 与现行内联史莱姆构造字段等价（H5）：工厂产出为其超集——
  // 多 elite:false/face:-1/guardDown:false/ax/ay/amp/frq 冗余字段，slime 路径不消费→行为等价；
  // y 由工厂锚定 py-2（脚底 py+14，较原 -10 高 2px，重力当帧落稳）；t/ai.cd 相位公式同源确定性。
  // _v6_loot_test.js ② L7 Boss 掉落采样复跑核对零回归。
  const b = game.boss, L = game.level, S = T.summon;
  for (let i = 0; i < S.n; i++) {
    const e = _engMkEnemy(S.type, b.x + b.w / 2 + S.off[i] - 8, b.y + b.h - 16, false);
    e.vx = _engSign(S.off[i]) * Math.abs(e.vx || BAL.enemy[S.type].spd || 0) || _engSign(S.off[i]) * 28;
    L.enemies.push(e);
  }
}

function _engUpdateBoss(dt) { // 内部：Boss 状态机（设计 §2/§3；计时单位秒=帧÷60）
  // v7 §6（R4 核心）：蛟龙/判官与星核巨兽共用本状态机，全部参数读 T=_engBossTable(b.kind)——
  // kind1 表值=现行硬编码逐字收编，L7 行为零变化（_v6_loot_test ②/⑤ 与 gate Boss 冒烟双证）。
  const b = game.boss; if (!b) return;
  const L = game.level, p = game.player;
  const T = _engBossTable(b.kind || 0); // v7 §6：本 Boss 参数表
  b.flashT -= dt; b.t += dt;
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
    if (Math.abs(pcx - bcx) > 140) b.vx = b.face * T.walk[b.phase - 1]; // 缓步逼近（walk 读表）
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
        _engBossSummon(T); } } // v7 §6.2：召唤工厂化（kind1 slime×2 与内联构造等价，见 _engBossSummon 注）
    else if (b.next === 'nova') { if (b.t >= _engBossDur('nova', b.phase)) {
        b.state = 'novaCast'; b.t = 0; b.fireN = 0; } }
    else if (b.next === 'sweep') { if (b.t >= _engBossDur('sweep', b.phase)) { // v7 §6.3：蛟龙·三段扫尾
        b.state = 'sweepCast'; b.t = 0; b.fireN = 0; } }
    else if (b.next === 'blink') { if (b.t >= _engBossDur('blink', b.phase)) { // v7 §6.3：判官·传送
        b.state = 'blinkCast'; b.t = 0; b.fireN = 0; } }
    else if (b.next === 'scythe') { if (b.t >= _engBossDur('scythe', b.phase)) { // v7 §6.3：判官·镰刀横扫
        b.state = 'scytheCast'; b.t = 0; b.fireN = 0; } }
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
    if (hitWall) { b.vx = 0; b.state = 'stagger'; b.t = 0;
      game.shake = 8; game.sfxQueue.push('roar');
      _engAddParts(b.x + (b.chargeDir > 0 ? b.w : 0), b.y + b.h / 2, 14, '#c8b8e8', 110, 250); }
    else if (b.t >= T.charge.maxT || Math.abs(b.x - b.chargeFrom) >= T.charge.maxX) { b.vx = 0; b.state = 'recover'; b.t = 0; }
    break; }

  case 'stagger':   if (b.t >= T.stagger) { b.state = 'recover'; b.t = 0; } break; // 输出窗口

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

  case 'recover':  b.vx = 0;
    // 注：伪代码 `{...}[b.next] || 0.5` 按 JS 优先级恒真（(b.t>=X)||0.5），此处修正为取值后兜底
    if (b.t >= (T.recover[b.next] || 0.5))
      { b.state = 'idle'; b.t = 0; }
    break;

  case 'enrage':   b.vx = 0; if (b.t >= T.enrage) { b.state = 'idle'; b.t = 0; } break;

  case 'dying': {
    b.vx = 0; b.y += 6 * dt;                      // 慢速下沉
    if ((b.t * 18 | 0) !== ((b.t - dt) * 18 | 0)) {         // 每 ~3.3 帧一圈爆炸粒子
      _engAddParts(bcx + (Math.random() * 44 - 22), b.y + Math.random() * 40, 10,
        ['#f8d048', '#f86020', '#48d8e8'][((b.t * 10) | 0) % 3], 110, 60);
      game.shake = Math.max(game.shake, 4);
    }
    if (b.t >= T.dying) { b.state = 'dead'; levelClear(); }  // 复用 v2 通关（含彩带粒子；时长读表）
    break; }
  }

  /* 接触伤害（除休眠/演出/死亡态/blink 隐身期）：吃玩家无敌帧（工单 C 伪代码口径；v7 §6.3 追加隐身跳过） */
  if (b.state !== 'dormant' && b.state !== 'intro' && b.state !== 'dying' && b.state !== 'dead'
      && !(b.state === 'blinkCast' && b.hidden)
      && !p.dead && _engAabb(b, p)) _engHurtPlayer(bcx);
}

function _engSkillTargetX(p) { // 内部：星陨目标 x——Boss 中心 / 200px 内最近敌 / 面向 44px（设计 §4）
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

function _engUpdateSkills(dt) { // 内部：四技能 U/I/O/L（边沿消费 + CD 门控；由 _engUpdatePlayer 调用）
  const p = game.player, S = game.skills, inp = game.input;
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
}

function _engResolveAttack(L, p) { // 内部：攻击判定（v2 P1；v5 §C 打击感重写）——身前 18×14 框 vs 敌人/炮弹/'B' 砖
  if (!(p.atkT > 0) || p.dead) return;
  const box = { x: p.face > 0 ? p.x + p.w - 2 : p.x - _engAtkW + 2, y: p.y, w: _engAtkW, h: _engAtkH };
  // v5 §2#4：暴击——本击使连击数到 critMod 的倍数 → 伤害×critMul、金色数字（hit-stop 不变）；全分支共用
  // v6 §C：ATK = atkBase + equip.atk（装备武器注入，波1 恒 1）；v7.7：局外成长项已删（暴击仍 ×critMul）
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
    _engFloat(b.x + b.w / 2, b.y - 4, '' + dmg, crit ? '#f8d048' : '#ffffff', crit ? 1 : 0);
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
}

/* ==================== 玩家物理（契约第 3 节算法 1/2/3/7） ==================== */
function _engUpdatePlayer(dt, L, p) {
  // 死亡冻结 0.9s 后重生（契约算法 12）
  if (p.dead) { p.deadT += dt; if (p.deadT >= 0.9) respawn(); return; }

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
      p.atkCd = _engAtkCd; p.atkAnim = _engAtkAnim; p.atkWind = _engAtkWind; p.atkT = 0;
      p.atkSeq = (p.atkSeq || 0) + 1; // v5：新摆新序号（§N.c 一摆一伤口径）
      game.sfxQueue.push('swing'); // v5 §H：呼啸（原 'slash' 废弃）
    }
  }
  if (game.input.dashHit) {
    game.input.dashHit = 0;
    if (p.dashCd <= 0) {
      p.dashCd = _engDashCd; p.dashT = _engDashDur; // v5 §B：总时长 0.28（原 0.18）；v7.7：冷却回到基础值 0.5s（局外成长已删）
      p.dashDir = dir !== 0 ? dir : p.face; // 有方向输入用输入向，否则用面向
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
  const effRun = PHY.maxRun * (1 + (game.equip ? game.equip.spd : 0));
  if (p.dashT <= 0) p.vx = _engClamp(p.vx, -effRun, effRun);
  if (p.onGround && p.dashT <= 0) { // 传送带：站上被推动（可叠加到跑速之上，上限 ±170）；冲刺中不吃传送带
    if (convL) p.vx = _engClamp(p.vx - 520 * dt, -170, 170);
    if (convR) p.vx = _engClamp(p.vx + 520 * dt, -170, 170);
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
    if (p.onGround || p.coyote > 0) {                    // 地面跳（含土狼窗口）
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
    const dashEl = p.dashT > 0 ? _engDashDur - p.dashT : -1;
    const g = PHY.grav * (dashEl >= 0.05 && dashEl < 0.23 ? _engDashGrav : 1);
    // v6 §1.3 速降：空中按住 input.down → 上限恢复旧值 360（BAL.fall.fast），否则 285（PHY.maxFall）。
    // 风柱交互不变：'w' 净上力与落速上限无关，按↓不破解风谜题（设计书 §1.3）。
    const cap = (!p.onGround && game.input.down) ? BAL.fall.fast : PHY.maxFall;
    p.vy = Math.min(p.vy + g * dt, cap);
  }
  p.djT -= dt; p.turnT -= dt; // v5 §A：空翻/转身演出计时

  // 移动平台载人：上一帧站其上 → 先随平台位移（契约算法 3）
  if (p.standOn) { p.x += p.standOn.dx; p.y += p.standOn.dy; }

  const wasFeet = p.y + p.h; // 本帧 Y 位移前脚底（单向平台判定基准）

  /* ---- X 轴（契约算法 1：先 X 后 Y） ---- */
  p.x += p.vx * dt;
  {
    const y0 = Math.floor(p.y / _engTile), y1 = Math.floor((p.y + p.h - _engEps) / _engTile);
    if (p.vx > 0) {
      const tx = Math.floor((p.x + p.w - _engEps) / _engTile); // 右缘所在列
      for (let ty = y0; ty <= y1; ty++) {
        if (L.solid(tx, ty, game.switchState)) { p.x = tx * _engTile - p.w; p.vx = 0; break; }
      }
    } else if (p.vx < 0) {
      const tx = Math.floor(p.x / _engTile); // 左缘所在列
      for (let ty = y0; ty <= y1; ty++) {
        if (L.solid(tx, ty, game.switchState)) { p.x = (tx + 1) * _engTile; p.vx = 0; break; }
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
  else if (Math.abs(p.vx) > 10) p.anim = 'run';
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
    if (!u.fired && u.t >= BAL.skills.o.t[0]) {                      // ③ 结算（t=0.55 一次性）
      u.fired = true;
      if (game.boss && _engBossHurt(BAL.skills.o.dmg))
        _engFloat(game.boss.x + 26, game.boss.y - 4, '' + BAL.skills.o.dmg, '#48d8e8', 1); // Boss 承伤 5 青
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
  }

  /* ③ 门：持钥匙接触任一 D 瓦片 → 该连通分量整组移除（契约算法 8）
        门是瓦片：玩家会被碰撞解算顶在门面上（边缘恰好相贴、不构成严格重叠），
        因此接触扫描用「含边界」的覆盖范围（相贴即算接触）。 */
  if (!p.dead && game.keys > 0) {
    const dx0 = Math.floor(p.x / _engTile), dx1 = Math.floor((p.x + p.w) / _engTile);
    const dy0 = Math.floor(p.y / _engTile), dy1 = Math.floor((p.y + p.h) / _engTile);
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

  /* ⑤ 终点判定（v7.3 谜题门：本关有谜题神龛且存在未解者 → 终点不通关，每 2.5s 推送一次引导事件；
        solvedPuzzles 已由 ui 在 startLevel 时从存档回填（跨会话正确），Boss 关无神龛天然直通） */
  if (!p.dead && L.goal && _engAabb(p, L.goal)) {
    const unsolved = (L.shrines || []).filter(function (sh) { return !game.solvedPuzzles[sh.idx]; });
    if (unsolved.length) {
      game.puzzleGateT = (game.puzzleGateT || 0) - dt;
      if (game.puzzleGateT <= 0) {
        game.puzzleGateT = 2.5;
        game.sfxQueue.push('select');
        _engFloat(p.x + 5, p.y - 12, '先解开谜题神龛！（' + unsolved.length + ' 处未解）', '#f8d048');
      }
    } else { levelClear(); return; }
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
      if (ddx * ddx + ddy * ddy < s.r * s.r) killPlayer();
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
    e.t += dt;
    // v7 §5.1/§5.4：枪虾/魂火为地面型——重力/落地/掉头与史莱姆同构（速度取 e.vx）
    if (e.type === 'slime' || e.type === 'knight' || e.type === 'mage'
        || e.type === 'lancer' || e.type === 'boomer') {
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
      e.x += e.vx * dt;
      {
        const d = _engSign(e.vx);
        // v6 §3.3：骑士冲锋段跳过掉头判定（撞墙提前结束由 _engEnemySkill 处理）
        if (d !== 0 && !(e.ai && e.ai.st === 'charge')) {
          const tx = d > 0 ? Math.floor((e.x + e.w - _engEps) / _engTile) : Math.floor(e.x / _engTile);
          const my = Math.floor((e.y + e.h / 2) / _engTile);
          const fy = Math.floor((e.y + e.h + 2) / _engTile);
          // 前方齐腰有墙，或悬空无落脚点 → 掉头
          // v7.6 缺陷1：落脚点口径补 '='（否则站在单向平台上的敌人第一帧就判定「前方悬空」原地掉头抖动）
          if (L.solid(tx, my, game.switchState) || (e.grounded && !_engFootTile(L, tx, fy))) e.vx = -e.vx;
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
        if ((e.type === 'knight' || e.elite) && e.hp > 1) { // v5 §4.3：骑士踩踏扣 stompDmg 不秒杀；v7 §5.5：精英同口径（扣 1+反弹）
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
      _engFx(m.x + 5, m.y + 2, { vy: -30, life: 0.25, color: '#f8d048', size: 1 }); }
    let boom = m.y > L.h * _engTile + 20;
    if (game.boss && _engAabb(m, game.boss)) { _engBossHurt(BAL.skills.u.bossDmg); _engAddCombo(); boom = true; // v5：Boss 伤 1→2
      _engFloat(game.boss.x + game.boss.w / 2, game.boss.y - 4, '' + BAL.skills.u.bossDmg, '#48d8e8', 0); }
    if (!boom) for (const e of L.enemies)
      if (!(e.dead > 0) && _engAabb(m, e)) { _engKillEnemy(e); boom = true; break; }
    if (!boom) { // 撞实心地面/砸碎 B 砖（AoE BAL.skills.u.aoe 24×24）；v7 §4.2：同步可碎 'G' 隐藏砖（置'.'，无金币）
      _engRectTiles(L, m.x - 7, m.y + 8, BAL.skills.u.aoe, 10, function (tx, ty, ch) {
        if (ch === '#' || ch === 'I' || ch === 'B' || ch === 'G') {
          if (ch === 'B') { L.tiles[ty][tx] = '.'; game.coins += BAL.econ.brick; _engAddCombo(); }
          else if (ch === 'G') { L.tiles[ty][tx] = '.'; _engAddCombo(); } // v7：碎隐藏砖计入连击（无金币分支）
          boom = true; } }); }
    if (boom) { game.meteors.splice(i, 1); _engShake(3, 0); // v5：落地爆震屏 3（走分级槽）
      game.sfxQueue.push('meteor');
      _engAddParts(m.x + 5, m.y + 10, 16, '#f8d048', 110, 250);          // 爆裂粒子 12→16
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
    if (game.boss && !bl.hits['boss' + bl.phase] && _engAabb(bl, game.boss) && _engBossHurt(dmg)) {
      bl.hits['boss' + bl.phase] = 1;
      _engFloat(game.boss.x + 26, game.boss.y - 4, '' + dmg, '#48d8e8', 0); game.sfxQueue.push('hit'); }
    // ③ 弹幕（含法师火球 fire:true）：斩碎，无连击（同普攻斩弹口径）
    for (let j = game.bullets.length - 1; j >= 0; j--) { const b = game.bullets[j];
      if (_engAabb(bl, b)) { game.bullets.splice(j, 1);
        _engAddParts(b.x + 4, b.y + 3, 8, b.fire ? '#f86030' : '#f8b020', 80, 200); game.sfxQueue.push('break'); } } }

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
    if (hazard) killPlayer();
    if (p.y > L.h * _engTile + 24) killPlayer(); // 坠落即死
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
  const cty2 = p.y + p.h / 2 - _engVH / 2;
  game.cam.x += (ctx2 - game.cam.x) * 0.12;
  game.cam.y += (cty2 - game.cam.y) * 0.12;
  game.cam.x = _engClamp(game.cam.x, 0, Math.max(0, L.w * _engTile - _engVW));
  game.cam.y = _engClamp(game.cam.y, 0, Math.max(0, L.h * _engTile - _engVH));

  /* ⑬′ v3：技能四 CD 递减 / 连斩白屏递减 */
  game.skills.u = Math.max(0, game.skills.u - dt);
  game.skills.i = Math.max(0, game.skills.i - dt);
  game.skills.o = Math.max(0, game.skills.o - dt);
  game.skills.l = Math.max(0, game.skills.l - dt); // v6 §D：技能4 星刃 CD
  if (game.flashT > 0) { game.flashT -= dt; if (game.flashT < 0) game.flashT = 0; }
}
