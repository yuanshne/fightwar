/* ============================================================
 * art.js —— Pixel Quest 美术素材模块
 * ------------------------------------------------------------
 * 职责（契约第 4 节）：
 *   1. SPR                精灵画布字典（buildSprites() 填充，幂等）
 *   2. THEMES             七主题配色（grass/cave/sky/factory/lava/tower + v3 boss）
 *   3. buildSprites()     字符像素网格 → 离屏 canvas 精灵
 *   4. buildThemeArt(key) 程序化 16×16 瓦片 + 装饰物 + 512×224 可平铺视差背景
 *   5. drawPixelText()    3×5 像素字体
 *   6. drawCNText()       系统字体中文（ui 用）
 *   7. flipSprite()       水平翻转 canvas
 * —— v2.5 美术 richness（规格书 2026-10-24-v2-art-richness.md）——
 *   A. 瓦片：每种实心瓦片 ≥4 色阶（受光左上→基色→阴影右下→暗缝），
 *      色阶边界全部用棋盘抖动（每 1px 交替）过渡；主题材质母题画进砖内
 *      （grass 草帽两层绿+草簇+偶发花菇、石子须根；cave 苔藓斑块+角落微光
 *      晶体；factory 铆钉四角+警示斜纹+锈斑；lava 黑玄武岩+发光裂纹；
 *      tower 紫砖缝+符文刻痕+苔点）；平台/冰/切换砖同规格+边缘高光+投影暗示。
 *   B. 精灵：彩色描边（描边=填充色加深版，全程禁纯黑）；主体 ≥3 色阶；
 *      主角围巾橙→黄 3 段渐变（o→s→y）；金币扫光帧；宝石亮/暗切面三角；
 *      电锯金属拉丝+高光弧；弹簧金属圈高光；炮台红色 1px 警示灯。
 *   C. 装饰：每主题 ≥6 种（多型供引擎随机），火把/晶体/蠕虫/吊灯/烛台/
 *      火柱等做成 2 帧闪烁数组（ui 已支持数组帧动画）。
 *   D. 背景：far 画布 = 天光渐变带（3-4 色阶半透明暖/冷带+抖动缘）+
 *      远景剪影 + 中景合成层（明度取远/近之间，区分空气感）+ 静态氛围点
 *      （grass 飘尘 / cave 萤光 / sky 飞鸟 / factory 烟柱 / lava 火星 /
 *      tower 星月晕）；near = 近景剪影。动画帧支持留给 ui v3。
 * —— v3 Boss 战+技能系统（规格书 2026-10-24-v3-boss-design.md，工单 docs/workorders/art.md）——
 *   A. THEMES 第 7 主题 boss（星核虚空），通用瓦片自动继承配色，装饰全复用既有类型；
 *   B. makeBG boss 分支：深空渐变 4 阶+星点+行星弧+漂浮碎石+环形能量带+祭坛石柱；
 *   C. SPR.boss 星核巨兽部件字典：身体 64×48 程序化行跨画法×2 帧（常态/狂暴）、手臂 20×16、
 *      下颚 20×8×2、眼 12×10×3、瞳孔 4×4、星核 12×12×2；白剪影 bossWhite{body,arm,jaw}；
 *   D. 特效 meteor[2]/waveFx[2]/bossBullet[2]、heartFull/heartEmpty、图标 skU/skI/skO；
 *   E. 施法金色姿态 heroAttackGold(+L)。
 *   【预算授权（工单 art.md 即授权依据）】v2.5 已到 80KB 上限（79,589 字节）；v3 增量 ≤20KB、
 *   总量上限 100KB。Boss 身体/手臂用行跨坐标程序化画法（非全字面网格），字面网格均经行长校验。
 * —— v4 谜题神龛（规格书 2026-10-24-v4-puzzles.md，美术队工单 §1-§4）——
 *   A. SPR.shrineOff / SPR.shrineOn：16×24 谜题神龛石碑两态。off=暗青石+裂纹+暗刻纹；
 *      on=同网格换点亮调色板（刻纹变金纹）+顶部星光 2 帧闪烁——shrineOn=[帧1,帧2] 数组
 *      （ui 沿用 decor 的 (tick*4|0)%2 取帧即可），shrineOff 为单帧。问号与已解谜底
 *      缩略图按分工由 ui 叠画（本精灵不内置）。
 *   B. SPR.puzzleUI：谜题覆盖层素材字典——木框四角 cornerTL/TR/BL/BR（8×8，外两侧描边、
 *      内侧暗缘）+ 边条 edgeH/edgeV（8×8，两长边均描边→上/下、左/右边通用；与对应角块
 *      齐缝可拼接）、网格光标框 cursor（12×12：白描边+藏蓝内圈，中空透出格内容）、
 *      数织叉格标记 xmark（8×8 亮灰+暗尖，亮暗底均可见）；
 *      gold/goldD/goldL = #f8d048/#c89010/#fff8c8 主题无关金色印章三阶（工单 §3，ui 画
 *      数独"完"字印直接取用）。
 *   C. 全部手绘字符网格（行长均经 _art_v4_check.js 校验）；顶层导出仍限契约 7 符号，
 *      新素材全部挂进 SPR（下划线前缀为内部实现）。
 * —— v5 第一波·特效队（2026-10-24-v5-design.md §2/§3/§4，工单 v5-wave1-fx）：slashArc 扩
 *   26×22×4 程序化弧、heroDashWind(+L)、skI 盾徽/skO 竖剑重绘（键名/取帧式不变）、
 *   knight[2]/knightDead/portal[2]/chandBlade/windStreak[2]。不动 THEMES/瓦片/装饰/背景。
 * —— v5 第二波·风格队（工单 v5-wave2-style）：THEMES 换值扩十主题（+wind/castle/star）；
 *   瓦片三阶 cel 硬边；_glow 发光内描边（画布尺寸零变化）；makeBG 三新分支；windmill/
 *   starflower 装饰；puzzleUI 深蓝金皮（键不变）；SPR.cover 封面素材四件。
 * —— v6 第一波·特效队（设计书 2026-10-24-v6-design.md §10.1，工单 v6-wave1-fx）：六组新键
 *   全部挂 SPR、既有键零改动：blade[2] 星刃回旋 12×12 双帧（十字/斜十字四芒交替自旋，
 *   金 #f8d048/暗金 #c89010/白芯/深藏蓝描边，_glow #ffe9b0）；skL 技能槽4图标 12×12
 *   （回旋双刃环，金家族 _glow #fff3c0）；knightGuard[2] 举盾 14×18 双帧（基准面左同
 *   SPR.knight 惯例，帧0 前摇举盾+盾沿高光 #fff8c8 / 帧1 冲锋盾前顶+身体前倾 1px）；
 *   mage[2]+mageCast 幽焰法师 14×18（紫黑袍 #3a2a50/#241c38、兜帽阴影脸红瞳、木杖金火种，
 *   读条姿态举杖过头火种 3×3）；fireball[2] 追踪火球 8×8 双帧（圆焰/焰旋，_glow #ffb090）。
 *   神龛光柱/蝙蝠瞄准线/史莱姆压扁/蓄力尘/读条圈/装备光柱=ui 程序化绘制，不产素材（工单 §6）。
 * —— v6 第二波·外观队（设计书 §10.2/§7.5，工单 v6-wave2-look）：装备外观部件层 SPR.look
 *   {weapon,hat,cape} 各 3 档 16×16（内容行+冻结偏移 _lookSprite 补透明行）+ 图标 icoW/icoH/icoC
 *   12×12 灰阶基准稿（ui source-atop 叠稀有度色）+ 背包钮 icoBag；合成在 ui（cape→基础帧→
 *   weapon/hat，攻冲家族 dx=+1）；分区红线 hat rows0..4×cols4..11 / weapon rows7..15×cols10..15
 *   （剑身不出右缘）/ cape rows5..15×cols0..6（_v6_look_check.js 逐像素断言）；既有键零改动。
 * —— v7 美术队（设计书 2026-10-24-v7-design.md，工单 docs/workorders/v7-art.md）——
 *   A. THEMES 十二键：+sea 东海龙宫（decor coral-shell-kelp，不设 dark）/+nether 幽冥地府（dark:true，
 *      decor ghostflame-bone-skull）；母题 sea 珊瑚礁/nether 玄武岩骨刻；sea '~'=热泉、nether '~'=岩浆。
 *   B. tiles 新三键（仅 sea/nether，ui 守卫式读取）：hidden（'G' 砖=block 同色系+2px 裂纹暗记）、
 *      waterL/waterR（'{'/'}' 水流=半透明水底 #2a8ad0 系+2px 白箭头）。
 *   C. makeBG：sea=深海渐变+光柱+龙宫飞檐/海藻+鱼群；nether=幽暗渐变+远山鬼火+奈何桥+彼岸花/锁链+浮灯。
 *   D. 新精灵：SPR.lancer[2] 14×14（面左，帧2 矛前伸 1px）/jelly[2]/ghost[2]/boomer[2]/eliteCrown/
 *      chest[2] 16×14/lantern[2] 12×16。
 *   E. SPR.boss2 蛟龙（body 64×40，青金）/SPR.boss3 判官（body 40×52，暗紫+鬼火绿）——键集合=SPR.boss
 *      全键+coreRage；boss2White/boss3White={body,arm,jaw} 沿 bossWhite 先例；jaw/eye/pupil/core 复用
 *      既有网格+新调色板（对齐 renderBoss 装配，设计书 §9.3）。
 * —— v7.9 Boss 二补（kind4/kind5，工单 v7.9-bossart）——
 *   F. SPR.boss4 冥古龙（body 64×48，骨白角冠+暗紫黑躯+胸口熔岩裂纹+下垂破翼+四足；正面宽颅骨，
 *      与 boss2 的横向青金蛟龙反向构图）；SPR.boss5 曜光·圣裁者（body 44×52，象牙白圣袍+金色光环+
 *      光翼+发光面具；与 boss3 暗紫判官形成明暗对立）。两者键集合=SPR.boss2，装配仍走 _mkV7Boss，
 *      白剪影 boss4White/boss5White={body,arm,jaw}；眼/瞳/核心/下颚复用既有网格+新调色板。
 *      叠加契约写在两个体建器函数头上（eye/jaw/core 覆盖区各留 ±1px 暗框，两种 x 偏移都在框内）。
 * —— v10 危险物素材（工单 v10-hazard-art）：补 ui.js 两个精灵挂点，替换原有程序化兜底 ——
 *   G. SPR.spike 地刺 20×24×4 帧：ui 按当前高度把整帧纵向压到 20×hh（ui.js:1791），
 *      所以四帧一律底边对齐、只往上长；帧0 裂纹+冒尖(6px)/帧1 半高(12px)/帧2 全长(24px)/帧3 全长+尖端高光。
 *   H. SPR.bossGhost Boss 分身 52×48 单张 canvas（与本体同尺寸，ui 按 clone 的 w/h 缩放，alpha 由 ui 叠）：
 *      5 个 Boss 通用剪影（宽肩/粗腿/头顶双角），半透能量体用 3 道亮紫纹路表达，不做具体 Boss 形象。
 *      两者都只用中性冷灰/纯紫，不引主题专属色——同一张图要在 grass..nether 六个主题底上都成立。
 * —— v12 L19 Boss（kind6，spec 2026-10-26-v12-boss §3）——
 *   I. SPR.boss6 烈焰·牛魔王（body 56×48，lava：双弯金角+暗铁额甲 + 宽颅/窄吻/阔颚的牛头 +
 *      口鼻暗板里嵌熔核炉口 + 尖刺金肩甲 + 熔岩裂纹 + 熔岩基座）。键集合=SPR.boss2（仍走 _mkV7Boss，
 *      只换体建器 _buildBullDemonBody 与调色板 _P_NIU/_P_NIU_RAGE），白剪影 boss6White={body,arm,jaw}
 *      照 boss4White 同法生成；eye/jaw/core 覆盖区按 ui 冻结偏移留暗框，写在体建器函数头上。
 *   J. HERO_SKINS 追加第 20 项 'inferno'（= L19 掉落，表第 idx+1 项规则不变）。
 * —— v13 危险物素材（spec 2026-10-26-v13-boss2 §七，三新键、既有键零改动）——
 *   K. SPR.bomb 16×16：铁球（主体 #3a3f4a / 暗部 #22262e / 高光 #6a7280）+ 顶部 3px 引信 #8a5a2a
 *      + 引信尖亮红（球体左上受光/右下背光，两枚铆钉，一眼读成「会炸的球」而不是石头）；
 *      SPR.mirror 24×32：兜帽斗篷人形剪影，全图只用 #b070f0 一个色（无内部细节，UI 自染色/叠 alpha）；
 *      SPR.pushwall 24×64：熔岩裂纹砖墙（上沿 3px 尖齿朝上、#6a2418 底 + #c04020 裂纹网 +
 *      #f88040 发光缝、下沿压暗）。三者生成后 Object.freeze（v13 冻结约束，防 UI 侧误改字段）。
 * —— v16 危险物素材（spec 2026-10-27-v16-boss-exclusive §三，只加一键，既有键零改动）——
 *   L. SPR.totem 16×32：圣像审判（boss5 曜光·圣裁者专属，hazard.kind='totem'）——16×4 深灰石台
 *      （#3a3448，顶面 #5a5470）+ 居中 8×24 石柱（#4a4258，左右各 1px 亮边 #6a6280）+
 *      柱身两道 1px 横向凹槽（#332c44）+ 柱顶 3×3 金眼（#f8d048，中心 1px #fff8d0）。
 *      除金眼外不含第二种色相：同屏最多 2 座、还要压在 nether 暗紫底上，加装饰就糊成柱子。
 * 约束：
 *   - 普通 script（无 import/export），加载顺序 art → levels → engine → ui；
 *   - 顶层零 DOM/音频/键盘调用；document 只出现在函数体内；
 *   - 不含游戏逻辑、不读关卡数据；禁止外部图片与网络素材；
 *   - 下划线前缀符号为内部实现（非契约导出）。
 * ============================================================ */
'use strict';

/* ==================== 内部：主画布上下文 ==================== */
let _ctx = null; // 内部：主画布 2D 上下文缓存（绝不顶层触 DOM，仅在绘制函数被调用时获取）
function _artUse(c) { // 内部：ui.js 可选注入主画布或其 2D 上下文
  if (!c) return;
  if (typeof c.getContext === 'function') c = c.getContext('2d');
  if (c && typeof c.fillRect === 'function') _ctx = c;
}
function _artCtx() { // 内部：取主画布上下文（仅浏览器运行时调用，从未注入则懒取 #game）
  if (_ctx) return _ctx;
  try {
    const cv = document.getElementById('game');
    if (cv && typeof cv.getContext === 'function') _ctx = cv.getContext('2d');
  } catch (e) { _ctx = null; }
  return _ctx;
}

/* ==================== 内部：通用小工具 ==================== */
const _TAU = Math.PI * 2; // 内部：整圆弧度

function _mulberry32(seed) { // 内部：种子随机（斑点/装饰/背景用，保证每次生成完全一致）
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function _makeCanvas(w, h) { // 内部：离屏画布（本文件唯一的 DOM 调用点，全部在函数体内）
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function _makeSprite(rows, pal) { // 内部：字符串像素网格 → 离屏 canvas
  const h = rows.length, w = Math.max.apply(null, rows.map(function (r) { return r.length; }));
  const c = _makeCanvas(w, h), g = c.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = rows[y][x];
    if (ch && ch !== '.' && pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); }
  }
  return c;
}

function flipSprite(spr) { // 水平翻转一张 canvas，返回新 canvas（契约导出）
  const c = _makeCanvas(spr.width, spr.height);
  const g = c.getContext('2d');
  g.translate(spr.width, 0); g.scale(-1, 1); g.drawImage(spr, 0, 0);
  return c;
}

/* ==================== 内部：色阶派生与棋盘抖动 ==================== */
function _mixHex(a, b, t) { // 内部：两 #rrggbb 线性插值（中景明度/瓦片色阶派生）
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  const c = pa.map(function (v, i) { return Math.round(v + (pb[i] - v) * t); });
  return '#' + c.map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
}
function _rgba(hex, a) { // 内部：#rrggbb → rgba() 字符串（天光带半透明用）
  return 'rgba(' + parseInt(hex.slice(1, 3), 16) + ',' + parseInt(hex.slice(3, 5), 16) + ',' +
    parseInt(hex.slice(5, 7), 16) + ',' + a + ')';
}
function _dithRow(g, x0, x1, y, color, par) { // 内部：水平棋盘抖动行（每 1px 交替）
  g.fillStyle = color;
  for (let x = x0; x <= x1; x++) if (((x + y) & 1) === (par & 1)) g.fillRect(x, y, 1, 1);
}
function _dithCol(g, x, y0, y1, color, par) { // 内部：垂直棋盘抖动列
  g.fillStyle = color;
  for (let y = y0; y <= y1; y++) if (((x + y) & 1) === (par & 1)) g.fillRect(x, y, 1, 1);
}
function _dithRect(g, x0, y0, w, h, color, par) { // 内部：棋盘抖动矩形（斑块/过渡区）
  g.fillStyle = color;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++)
    if (((x + y) & 1) === (par & 1)) g.fillRect(x, y, 1, 1);
}

/* ==================== 3×5 像素字体与文本 ==================== */
const _FONT = { // 内部：3×5 字模（每字符 15 位，行优先，'1'=点亮）
  'A': '010101111101101', 'B': '110101110101110', 'C': '011100100100011', 'D': '110101101101110',
  'E': '111100110100111', 'F': '111100110100100', 'G': '011100101101011', 'H': '101101111101101',
  'I': '111010010010111', 'J': '001001001101010', 'K': '101101110101101', 'L': '100100100100111',
  'M': '101111111101101', 'N': '110111101101101',
  'O': '010101101101010', 'P': '110101110100100', 'Q': '010101101011001', 'R': '110101110101101',
  'S': '011100010001110', 'T': '111010010010010', 'U': '101101101101111', 'V': '101101101101010',
  'W': '101101111111101', 'X': '101101010101101', 'Y': '101101010010010', 'Z': '111001010100111',
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001011001111',
  '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001010010010',
  '8': '111101111101111', '9': '111101111001111',
  ' ': '000000000000000', '.': '000000000000010', '!': '010010010000010', '?': '110001010000010',
  ':': '000010000010000', '-': '000000111000000', '/': '001001010100100', 'x': '000101010101000',
  '(': '001010010010001', ')': '100010010010100', '>': '100010001010100', '<': '001010100010001',
  '&': '000101010111101', '+': '000010111010000'
};

function drawPixelText(str, x, y, scale, color, align) { // 3×5 像素字体（契约导出）
  const g = _artCtx(); if (!g) return;
  str = String(str);
  const gw = 4 * scale; // 3px 字宽 + 1px 字距
  const w = str.length * gw - scale;
  if (align === 'center') x -= Math.round(w / 2);
  else if (align === 'right') x -= w;
  g.fillStyle = color;
  for (let i = 0; i < str.length; i++) {
    const gl = _FONT[str[i]] || _FONT['?'];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++)
      if (gl[r * 3 + c] === '1') g.fillRect(x + i * gw + c * scale, y + r * scale, scale, scale);
  }
}

function drawCNText(str, x, y, px, color, align) { // 中文：系统字体加粗小字（ui 用，契约导出）
  const g = _artCtx(); if (!g) return;
  g.save();
  g.font = 'bold ' + px + 'px "Microsoft YaHei","PingFang SC",sans-serif';
  g.textAlign = align || 'left'; g.textBaseline = 'top';
  g.fillStyle = color; g.fillText(str, x, y);
  g.restore();
}

/* ==================== 精灵像素数据：主角「星之勇者」16×16 ====================
 * 手绘字符网格（逐像素手写，禁止外部图片）。v2.5：围巾改为橙(o)→橙黄(s)→
 * 金(y) 三段渐变（规格 B），其余沿 v2 设计；右向为基准，左向运行时翻转。
 * 命中框仍 10×14 不变：绘制偏移 drawImage(img, p.x-3, p.y-2)。 */
const _P_HERO = { // 内部：星之勇者调色板（描边=深藏蓝，非纯黑）
  k: '#1c2450', // 描边深藏蓝
  b: '#38b8f8', // 亮蓝主体/头发
  B: '#1e78c8', // 深蓝（腰带/靴子）
  W: '#d8f4ff', // 冰白高光
  w: '#ffffff', // 纯白（脸/手套/眼高光）
  o: '#f88838', // 橙色围巾·基段
  s: '#f8b040', // 围巾·中段（橙→黄渐变）
  O: '#c85820', // 围巾暗部
  y: '#f8d048', // 围巾尾段金/星徽金
  Y: '#d8a020', // 星徽金暗部
  e: '#182850', // 眼睛/嘴
  p: '#f8a0b0'  // 腮红
};
/* 共用头部（右向，cols2..13）：刘海带冰白高光，大眼 2×2 带白高光，腮红+小嘴 */
const _H_IDLE1 = [ // 站立帧1（围巾尾自然下垂：o→s→y 三段渐变）
  '.....kkkkkk.....',
  '...kbbbbbbbbk...',
  '..kbWWbbbbbbbk..',
  '..kbWbbbbbbbbk..',
  '..kbbwbwwbwwwk..',
  '..kbwwwewwwewk..',
  '..kbwweewweewk..',
  '..kbwpwwwewwpk..',
  '..kbwwwwwwwwbk..',
  '.soOooooooooo...',
  'ys..OOOOOOOO....',
  '....bbwyywbb....',
  '....bbwYYwbb....',
  '....BBBBBBBB....',
  '.....BB..BB.....',
  '.....BBB.BBB....'];
const _H_IDLE2 = [ // 站立帧2（眨眼：眼变横线；围巾尾上扬飘动）
  '.....kkkkkk.....',
  '...kbbbbbbbbk...',
  '..kbWWbbbbbbbk..',
  '..kbWbbbbbbbbk..',
  '..kbbwbwwbwwwk..',
  '..kbwwwwwwwwwk..',
  '..kbwweewweewk..',
  '..kbwpwwwewwpk..',
  '.okbwwwwwwwwbk..',
  'ysoOooooooooo...',
  '....OOOOOOOO....',
  '....bbwyywbb....',
  '....bbwYYwbb....',
  '....BBBBBBBB....',
  '.....BB..BB.....',
  '.....BBB.BBB....'];
const _H_RUN1 = [ // 跑1·迈开步触地（前腿前伸落地，后腿后抬，前臂前摆，围巾平飘）
  '.....kkkkkk.....',
  '...kbbbbbbbbk...',
  '..kbWWbbbbbbbk..',
  '..kbWbbbbbbbbk..',
  '..kbbwbwwbwwwk..',
  '..kbwwwewwwewk..',
  '..kbwweewweewk..',
  '..kbwpwwwewwpk..',
  '..kbwwwwwwwwbk..',
  'ysoOooooooooo...',
  '.....OOOOOOO....',
  '.....bbwyywbbbw.',
  '.....bbwYYwbb...',
  '....BB....BB....',
  '..BBB.....BBB...',
  '..........BBBB..'];
const _H_RUN2 = [ // 跑2·收腿下压（双腿收拢双足近地，身体最低，围巾微垂）
  '.....kkkkkk.....',
  '...kbbbbbbbbk...',
  '..kbWWbbbbbbbk..',
  '..kbWbbbbbbbbk..',
  '..kbbwbwwbwwwk..',
  '..kbwwwewwwewk..',
  '..kbwweewweewk..',
  '..kbwpwwwewwpk..',
  '..kbwwwwwwwwbk..',
  '.ysoOooooooooo..',
  '.....OOOOOOO....',
  '.....bbwyywbb...',
  '.....BBBBBBBB...',
  '.....BB...BB....',
  '.....BB...BB....',
  '....BBB...BBB...'];
const _H_RUN3 = [ // 跑3·提膝前掠（支撑腿直立、膝前顶，身体升，围巾上扬）
  '.....kkkkkk.....',
  '...kbbbbbbbbk...',
  '..kbWWbbbbbbbk..',
  '..kbWbbbbbbbbk..',
  '..kbbwbwwbwwwk..',
  '..kbwwwewwwewk..',
  '..kbwweewweewk..',
  '..kbwpwwwewwpk..',
  '..kbwwwwwwwwbk..',
  'ysoOooooooooo...',
  '.....OOOOOOO....',
  '.....bbwyywbbbw.',
  '.....bbwYYwbb...',
  '......BB..BB....',
  '......BB...BB...',
  '......BBB..BB...'];
const _H_RUN4 = [ // 跑4·另一步触地（手臂后摆，围巾波形变化）
  '.....kkkkkk.....',
  '...kbbbbbbbbk...',
  '..kbWWbbbbbbbk..',
  '..kbWbbbbbbbbk..',
  '..kbbwbwwbwwwk..',
  '..kbwwwewwwewk..',
  '..kbwweewweewk..',
  '..kbwpwwwewwpk..',
  '..kbwwwwwwwwbk..',
  '..ysoOoooooooo..',
  '.....OOOOOOO....',
  '...bbbbwyywbb...',
  '.....bbwYYwbb...',
  '....BB....BB....',
  '..BBB.....BBB...',
  '..........BBBB..'];
const _H_RUN5 = [ // 跑5·收腿下压（手臂后摆）
  '.....kkkkkk.....',
  '...kbbbbbbbbk...',
  '..kbWWbbbbbbbk..',
  '..kbWbbbbbbbbk..',
  '..kbbwbwwbwwwk..',
  '..kbwwwewwwewk..',
  '..kbwweewweewk..',
  '..kbwpwwwewwpk..',
  '..kbwwwwwwwwbk..',
  '.ysoOooooooooo..',
  '.....OOOOOOO....',
  '...bbbbwyywbb...',
  '.....BBBBBBBB...',
  '.....BB...BB....',
  '.....BB...BB....',
  '....BBB...BBB...'];
const _H_RUN6 = [ // 跑6·腾空提膝（双足离地，膝高高收起，围巾上扬）
  '.....kkkkkk.....',
  '...kbbbbbbbbk...',
  '..kbWWbbbbbbbk..',
  '..kbWbbbbbbbbk..',
  '..kbbwbwwbwwwk..',
  '..kbwwwewwwewk..',
  '..kbwweewweewk..',
  '..kbwpwwwewwpk..',
  '..kbwwwwwwwwbk..',
  'ysoOooooooooo...',
  '.....OOOOOOO....',
  '.....bbwyywbbbw.',
  '.....bbwYYwbb...',
  '......BBB.BB....',
  '.....BB....BB...',
  '................'];
const _H_RUNS = [_H_RUN1, _H_RUN2, _H_RUN3, _H_RUN4, _H_RUN5, _H_RUN6]; // 内部：跑动 6 帧序列
const _H_JUMP = [ // 跳起（前臂上举，双腿收拢，围巾尾上扬）
  '.....kkkkkk.....',
  '...kbbbbbbbbk...',
  '..kbWWbbbbbbbk..',
  '..kbWbbbbbbbbk..',
  '..kbbwbwwbwwwk..',
  '..kbwwwewwwewk..',
  '..kbwweewweewk.w',
  '.okbwpwwwewwpk.b',
  'yskbwwwwwwwwbk.b',
  '.sOoooooooooo...',
  '....OOOOOOOO....',
  '....bbwyywbb....',
  '....bbwYYwbb....',
  '.....BBB........',
  '...BBB...BB.....',
  '.........BBB....'];
const _H_FALL = [ // 下落（手臂上张，嘴张大，双腿分开下坠，围巾尾下垂）
  '.....kkkkkk.....',
  '...kbbbbbbbbk...',
  '..kbWWbbbbbbbk..',
  '..kbWbbbbbbbbk..',
  '..kbbwbwwbwwwk..',
  '..kbwwwewwwewk..',
  '..kbwweewweewk.w',
  '..kbwpwweewwpk.b',
  '..kbwwwwwwwwbk.b',
  '..oOooooooooo...',
  'soOOOOOOOOO.....',
  'y...bbwyywbb....',
  '....bbwYYwbb....',
  '.....BB..BB.....',
  '.....BB..BB.....',
  '.....BB....BB...'];
const _H_ATTACK = [ // 攻击（头部前倾+1 列，挥臂前冲带白手套，弓步，围巾后掠）
  '......kkkkkk....',
  '....kbbbbbbbbk..',
  '...kbWWbbbbbbbk.',
  '...kbWbbbbbbbbk.',
  '...kbbwbwwbwwwk.',
  '...kbwwwewwwewk.',
  '...kbwweewweewk.',
  '...kbwpwweewwpk.',
  '...kbwwwwwwwwbk.',
  'ysoO.ooooooooo..',
  '.....OOOOOObbbw.',
  '.....bbwyywbbbww',
  '.....bbwYYwbb...',
  '....BB....BB....',
  '...BBB....BBB...',
  '..BBB......BBBB.'];
const _H_DASH = [ // 冲刺（流线前倾：头前倾+1 列，双腿水平后掠，残影速度线 W）
  '......kkkkkk....',
  '....kbbbbbbbbk..',
  '...kbWWbbbbbbbk.',
  '...kbWbbbbbbbbk.',
  '...kbbwbwwbwwwk.',
  '...kbwwwewwwewk.',
  '...kbwweewweewk.',
  '...kbwpwweewwpk.',
  '...kbwwwwwwwwbk.',
  'ysOooooooooooo..',
  '....OOOOOOOO.W..',
  '.W..bbwyywbb....',
  '....bbwYYwbb.W..',
  '...BBBBBB.......',
  '..BBBB..........',
  '.BBB............'];
const _H_SQUASH = [ // 落地压扁（整体压低至 12 行高，眼眯成线，腮帮鼓起，脚步距加宽）
  '................',
  '................',
  '................',
  '................',
  '.....kkkkkkkk...',
  '...kbbbbbbbbbk..',
  '..kbbWWbbbbbbbk.',
  '..kbwwwwwwwwwwk.',
  '..kbwpeewweewpk.',
  '..kbwwwweewwwbk.',
  'ysOooooooooooo..',
  '...bbbwyywbbb...',
  '...BBBBBBBBBB...',
  '...BBB....BBB...',
  '..BBBB....BBBB..',
  '..BBBB....BBBB..'];

/* —— v5 特效队（工单 v5-wave1-fx）。渲染约定：knight 基准帧面向左（盾在左），
 * ui 按 e.face>0 flipSprite 翻转帧；slashArc 扩 4 帧（键名/取帧式不变）。—— */
const _P_FX = { w: '#ffffff', c: '#48d8e8', C: '#1898a8', y: '#f8d048' }; // 内部：弧光调色板
function _slashFrame(r, coreW, coreColor, edgeColor, edgeW, alpha) { // 内部：弧光帧 26×22
  const c = _makeCanvas(26, 22), g = c.getContext('2d');
  g.globalAlpha = alpha; g.lineCap = 'round';
  g.strokeStyle = edgeColor; g.lineWidth = edgeW;
  g.beginPath(); g.arc(13, 11, r, -0.90 * Math.PI, 0.35 * Math.PI); g.stroke();
  g.strokeStyle = coreColor; g.lineWidth = coreW;
  g.beginPath(); g.arc(13, 11, r, -0.90 * Math.PI, 0.35 * Math.PI); g.stroke();
  return c;
}
const _H_DASHWIND = _H_ATTACK.map(function (row, i) { // 内部：蓄力·后仰（§B）
  if (i < 6) return ' ' + row.slice(0, 15);
  if (i > 11) return row.slice(1) + ' ';
  return row;
});
_H_DASHWIND[11] = 'W' + _H_DASHWIND[11].slice(0, 15);

// —— v5 骑士（工单 §D）——
const _P_KNIGHT = { k: '#20242e', s: '#8898b8', S: '#5a6478', L: '#b5bcc7',
  y: '#f8d048', e: '#f84848', b: '#3a4a72', w: '#ffffff' }; // 内部：钢甲+盾
const _P_KNIGHT_DEAD = Object.assign({}, _P_KNIGHT, // 内部：死亡派生（s/L/e→S，y→#8a6a18）
  { s: _P_KNIGHT.S, L: _P_KNIGHT.S, y: '#8a6a18', e: _P_KNIGHT.S });
const _KN_SPANS = [ // 内部：行跨（14 宽）：盔/胸/裙/腿
  [4, 9], [3, 10], [3, 10], [3, 10], [3, 10], [3, 10],
  [3, 10], [4, 10], [4, 10], [4, 10], [4, 10], [4, 10],
  [4, 10], [4, 10], [5, 7], [7, 9], [5, 7], [7, 9]];
const _KN_LEGS2 = [[6, 8], [5, 7], [6, 8], [7, 9]]; // 内部：帧2 并步腿行
function _knOutline(G, W, H) { // 内部：基底 's' 4 邻空改 k（特征不参与描边）
  const get = function (x, y) { return (x >= 0 && x < W && y >= 0 && y < H) ? G[y][x] : '.'; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    if (G[y][x] === 's' && (get(x - 1, y) === '.' || get(x + 1, y) === '.' ||
        get(x, y - 1) === '.' || get(x, y + 1) === '.')) G[y][x] = 'k';
}
function _knightGrid(legs) { // 内部：骑士 14×18 网格
  const W = 14, H = 18, G = [];
  for (let y = 0; y < H; y++) G.push(new Array(W).fill('.'));
  const spans = _KN_SPANS.slice(0, 14).concat(legs);
  for (let y = 0; y < H; y++) for (let x = spans[y][0]; x <= spans[y][1]; x++) G[y][x] = 's';
  // 特征像素（两帧同，工单 §D）
  G[0][6] = 'y'; G[0][7] = 'y';
  G[3][4] = 'e'; G[3][6] = 'e'; G[3][8] = 'e';
  for (let y = 6; y <= 7; y++) { G[y][4] = 'L'; G[y][5] = 'L'; }
  for (let y = 10; y <= 13; y++) for (let x = 6; x <= 8; x++) G[y][x] = 'b';
  for (let y = 7; y <= 12; y++) { G[y][0] = 'L'; G[y][3] = 'L'; }
  G[6][1] = 'L'; G[6][2] = 'L'; G[13][1] = 'L'; G[13][2] = 'L';
  for (let y = 7; y <= 12; y++) { G[y][1] = 's'; G[y][2] = 's'; }
  G[9][1] = 'y'; G[9][2] = 'y'; G[10][1] = 'y'; G[10][2] = 'y';
  G[7][1] = 'w';
  for (let y = 5; y <= 7; y++) { G[y][11] = 'S'; G[y][12] = 'S'; }
  G[5][11] = 'y'; G[5][12] = 'y';
  _knOutline(G, W, H);
  return G.map(function (row) { return row.join(''); });
}
function _knightDeadGrid() { // 内部：死亡压扁 14×8（盾落地一行+腿合并两行）
  const live = _knightGrid(_KN_SPANS.slice(14)), W = 14, H = 8, G = [];
  for (let y = 0; y < H; y++) G.push(new Array(W).fill('.'));
  for (let y = 0; y <= 4; y++) for (let x = 0; x < W; x++) G[y][x] = live[y][x];
  G[5][0] = 'L'; G[5][1] = 's'; G[5][2] = 's'; G[5][3] = 'L';
  for (let x = 4; x <= 9; x++) G[5][x] = 's';
  for (let x = 4; x <= 9; x++) G[6][x] = 's';
  for (let x = 3; x <= 10; x++) G[7][x] = 's';
  _knOutline(G, W, H);
  return G.map(function (row) { return row.join(''); });
}

// —— v5 新机关素材（工单 §E）——
function _portalFrames() { // 内部：传送门 16×24 两帧（逐像素防糊边）
  const frames = [];
  for (let f = 0; f < 2; f++) {
    const c = _makeCanvas(16, 24), g = c.getContext('2d');
    g.fillStyle = '#5a6ac0';
    for (let a = 0; a < 360; a += 2) {
      const t = a * Math.PI / 180;
      g.fillRect(Math.round(8 + Math.cos(t) * 6), Math.round(12 + Math.sin(t) * 10), 1, 1);
    }
    const arms = f ? [[3.2, 6.2], [4.4, 8.0]] : [[4.4, 8.0], [3.2, 6.2]]; // 两中环半弧，帧2 相位互换
    g.fillStyle = '#8ea0ff';
    for (let half = 0; half < 2; half++)
      for (let a = -90; a <= 90; a += 3) {
        const t = (a + half * 180) * Math.PI / 180;
        g.fillRect(Math.round(8 + Math.cos(t) * arms[half][0]),
          Math.round(12 + Math.sin(t) * arms[half][1]), 1, 1);
      }
    g.fillStyle = '#e8ecff';                 // 内芯 3×5（帧2 移 1px）
    const cy = f ? 9 : 10;
    g.fillRect(8, cy, 1, 1); g.fillRect(7, cy + 1, 3, 3); g.fillRect(8, cy + 4, 1, 1);
    frames.push(c);
  }
  return frames;
}
function _chandBladeSprite() { // 内部：吊灯锤 12×12
  const c = _makeCanvas(12, 12), g = c.getContext('2d');
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
    const d = Math.sqrt((x - 5.5) * (x - 5.5) + (y - 5.5) * (y - 5.5));
    if (d <= 3) g.fillStyle = '#48d8e8';
    else if (d <= 4.6) g.fillStyle = '#f8d048';
    else if (d <= 5.4) g.fillStyle = '#7a4a10';
    else continue;
    g.fillRect(x, y, 1, 1);
  }
  g.fillStyle = '#ffffff'; g.fillRect(3, 3, 1, 1);
  return c;
}
function _windStreakFrames() { // 内部：风纹 16×16 两帧
  const bars = [[3, 3, 10], [8, 1, 13], [13, 5, 8]]; // [x,y0,len]
  return [0, 1].map(function (f) {
    const c = _makeCanvas(16, 16), g = c.getContext('2d');
    for (let i = 0; i < bars.length; i++) {
      const x = bars[i][0], y0 = bars[i][1], len = bars[i][2], top = y0 - (f ? 3 : 0);
      g.fillStyle = _rgba('#dcffff', 0.5);
      for (let j = 0; j < len; j++) if (top + j >= 0 && top + j < 16) g.fillRect(x, top + j, 1, 1);
      g.fillStyle = _rgba('#dcffff', 0.22);
      if (top - 1 >= 0) g.fillRect(x, top - 1, 1, 1);
      if (top + len < 16) g.fillRect(x, top + len, 1, 1);
      if (f) {
        g.fillStyle = _rgba('#dcffff', 0.5);
        for (let j = 0; j < 2; j++) if (y0 + len + 1 + j < 16) g.fillRect(x, y0 + len + 1 + j, 1, 1);
      }
    }
    return c;
  });
}

/* —— 特效瓦片：'B' 可碎木箱（裂纹木箱 16×16，五色阶手绘）—— */
const _P_BRICK = { // 内部：木箱调色板（描边=深木色，非纯黑）
  k: '#241408', // 深色描边/裂纹
  N: '#5c3a18', // 深木框
  n: '#8a5a2a', // 箱板底色
  m: '#b07840', // 斜撑浅板
  l: '#d8a860'  // 顶部高光板
};
const _BRICK_BROKEN = [ // 裂纹木箱：外框木板+X 斜撑+右下裂纹（碎后掉 1 金币）
  'kkkkkkkkkkkkkkkk',
  'klkllllllllllklk',
  'kmmmnnnnnnnnmmmk',
  'kmnmmnnnnnnmmnmk',
  'kmnnmmnnnnmmnnmk',
  'kmnnnmmnnmknnnmk',
  'kmnnnnmmmmnknnmk',
  'kmnnnnnmmnnnknmk',
  'kmnnnnnmmnnnknmk',
  'kmnnnnmmmmnnnnmk',
  'kmnnnmmnnmmnnnmk',
  'kmnnmmnnnnmmnnmk',
  'kmnmmnnnnnnmmnmk',
  'kmmmnnnnnnnnmmmk',
  'kNkNNNNNNNNNNkNk',
  'kkkkkkkkkkkkkkkk'];

const _P_SLIME = { // 内部：史莱姆（描边=深墨绿=填充加深版；高光+表情）
  k: '#123012', g: '#58c848', G: '#389028', w: '#e0f8cc', e: '#123012', p: '#f8a0a8'
};
const _SLIME1 = [ // 史莱姆帧1（圆润态：头顶大高光，大眼带白色反光，微笑+腮红）
  '...kkkkkk...',
  '..kgwwgggk..',
  '.kgwwgggggk.',
  '.kgweggwegk.',
  '.kgeeggeegk.',
  '.kpggeeggpk.',
  'kggggggggggk',
  'kggggggggggk',
  '.kGGGGGGGGk.',
  '..kkkkkkkk..'];
const _SLIME2 = [ // 史莱姆帧2（蠕动压扁：眯眼笑 ^ ^，嘴微张，高光横移）
  '............',
  '..kkkkkkkk..',
  '.kgwwgggggk.',
  'kgwwgggggggk',
  'kggeeggeeggk',
  'kpgggeegggpk',
  'kGGGGGGGGGGk',
  'kGGGGGGGGGGk',
  '.kGGGGGGGGk.',
  '.kkkkkkkkkk.'];
const _SLIME_DEAD = [ // 被踩压扁
  '............',
  '............',
  '............',
  '............',
  '............',
  '............',
  '..kkkkkkkk..',
  '.kgGgGGgGgk.',
  'kGGGGGGGGGGk',
  '.kkkkkkkkkk.'];

const _P_BAT = { k: '#1a1024', p: '#8858c8', P: '#603890', e: '#f84848', w: '#e8e8f0' }; // 内部：蝙蝠（描边=深茄紫）
const _BAT1 = [ // 蝙蝠帧1·翅上扬（翅膀收到最高点）
  '.kk......kk.',
  '.kpk....kpk.',
  '.kppk..kppk.',
  '..kppkkppk..',
  '...kppppk...',
  '..kpeppepk..',
  '..kppppppk..',
  '...kpwwpk...',
  '....kppk....',
  '.....kk.....'];
const _BAT2 = [ // 蝙蝠帧2·翅展开（完全张开，中间姿态）
  'kk........kk',
  'kpk......kpk',
  'kppk....kppk',
  '.kppkkkkppk.',
  '..kppppppk..',
  '..kpeppepk..',
  '...kppppk...',
  '...kpwwpk...',
  '....kppk....',
  '.....kk.....'];
const _BAT3 = [ // 蝙蝠帧3·翅下压（翅膀压到最低点，三帧构成完整扑扇循环）
  '............',
  '....kkkk....',
  '..kkppppkk..',
  '.kppppppppk.',
  '.kppppppppk.',
  '..kpeppepk..',
  '.kpkppppkpk.',
  'kpk.kwwk.kpk',
  'kpk..kk..kpk',
  '.kk......kk.'];

/* —— v8.0 三种新小怪（铁甲虫 / 酸液花 / 跳跳蛛）——
 * 小怪种类扩充。三者全部手写字符网格（禁止外部图片），基准帧一律面向左——与 knight/lancer/mage
 * 同约定，ui.js 在 e.face>0 时水平翻转（spitter 是站桩植物，ui.js 不翻转，故自身左右不对称即可）。
 * 网格行列数 = 精灵尺寸，必须与 engine.js 的命中框逐像素对齐：beetle 14×12 / spitter 14×16 /
 * hopper 12×12，宽高错一格就会在 ui.js 的 'foot' 锚点处整体偏移。
 * 描边一律用带色相的深色（禁纯黑 #000），光源统一左上：顶部/左侧高光、右下暗部。 */

const _P_BEETLE = { // 内部：铁甲虫（描边=深棕；甲壳四阶高对比 = 硬质感，与绿色软团史莱姆形成材质反差）
  k: '#2a1a18', // 描边·深棕黑（非纯黑，深色背景上仍带暖调）
  b: '#8a3a2a', // 甲壳主体·深红棕
  B: '#5a2418', // 甲壳暗部（明度 −35%）
  W: '#c86a4a', // 甲壳高光（明度 +45%，左上受光）
  m: '#d8b088', // 小颚·骨米色（与暗甲壳对比，突出口器）
  w: '#ffffff', // 眼白（纯白，全主题可读）
  e: '#20100e'  // 瞳孔（带暖调的深色，非纯黑）
};
const _BEETLE1 = [ // v8.0 帧0·巡逻步态：6 条短腿向两侧张开；甲壳 x7/x10 两道 B 竖纹分节 + 左上斜向高光
  '....kkkkkk....',
  '..kkbWWbbbkk..',
  '.kbWWWbbbbbbk.',
  'kbBwwbbBbbBbbk',
  'kbBewbbBbbBbbk',
  'mmBBbbbbBbbBbk',
  'mBBBbbbbBbbBbk',
  '.kBBBBBBBBBBk.',
  '..kkBBBBBBkk..',
  '.k.kkkkkkkk.k.',
  'b.b.b....b.b.b',
  '..b.b....b.b..'];
const _BEETLE2 = [ // v8.0 帧1·蓄力/冲撞预备：整体下沉 1px 压低重心、6 腿收拢贴住腹缘（ui.js 在 wind 态取此帧 + 1px 抖动做预警）
  '..............',
  '....kkkkkk....',
  '..kkbWWbbbkk..',
  '.kbWWWbbbbbbk.',
  'kbBwwbbBbbBbbk',
  'kbBewbbBbbBbbk',
  'mmBBbbbbBbbBbk',
  'mBBBbbbbBbbBbk',
  '.kBBBBBBBBBBk.',
  '..kkBBBBBBkk..',
  'bb.kkkkkkkk.bb',
  '..b.b....b.b..'];
const _P_BEETLE_DEAD = Object.assign({}, _P_BEETLE, { // v8.0 死亡派生：整体压暗一档（翻肚=看到腹面，不能再用亮甲色）
  b: '#5e2820', B: '#40180f', W: '#8a4632', m: '#9a7a58', w: '#9a9288', e: '#2a1614'
});
const _BEETLE_DEAD = [ // v8.0 死亡帧·翻肚：腿朝天（用压暗的 W 画，否则 1px 深腿会在深底上糊掉）；腹面 B 分节 + 壳缘受光 + 颚骨露出
  '.W.W..W.W.....',
  '..W.W..W.W....',
  '...W..W..W....',
  '..kkkkkkkkkk..',
  '.kbWWWbbbbbbk.',
  'kbbBbbbbbBbbbk',
  'mbBBbbbBbbbBbk',
  'kbBBBBBBBBBBbk',
  'kBBBBBBBBBBBBk',
  '.kBBBBBBBBBBk.',
  '..kkBBBBBBkk..',
  '....kkkkkk....'];

const _P_SPITTER = { // 内部：酸液花（描边=深墨绿；花苞黄绿四阶 + 茎叶深绿三阶；植物无眼，用花口 e 表达状态）
  k: '#1e2a12', // 描边·深墨绿
  b: '#5a8a2a', // 茎叶主体
  B: '#3a5c18', // 茎叶暗部（明度 −35%）
  W: '#8ab84a', // 茎叶高光（明度 +45%）
  y: '#c8d838', // 花苞主体·黄绿
  Y: '#8a9a20', // 花苞暗部
  p: '#f0f8a0', // 花瓣高光（近白黄，左上受光）
  e: '#26300e'  // 花口/花心内腔（吐弹前摇时张开可见）
};
const _SPITTER1 = [ // v8.0 帧0·花苞闭合：花瓣紧包成水滴形（顶尖开槽=两片花瓣，中缝一道 Y 暗示第三片），底部两片叶当脚
  '...kkk.kkk....',
  '..kkpyyykk....',
  '.kpyyyyyyyk...',
  'kpyyYyyyyyk...',
  'kpyyyyYyyyyyk.',
  'kpyyyyyyyyYyk.',
  '.kpyyyyyyyyk..',
  '..kkYyyyYkk...',
  '....kbbk......',
  '....kbWk......',
  '....kbbk......',
  '..kkkbbkkk....',
  '.kbbbbbbbbk...',
  'kbWWbbbbWWbk..',
  'kbBBbkbbBBbk..',
  '.kkkk.kk.kkk..'];
const _SPITTER2 = [ // v8.0 帧1·花苞微张（吐弹前摇）：花瓣外扩、顶端露出倒三角花口 e；茎叶不动（植物蓄力只动上半身）
  '...kkkkkk.....',
  '.kkpyyyykk....',
  'kppyyyyyyyk...',
  'kpyyyeyyyyk...',
  'kpyyeeeyyyyk..',
  'kpyyyyyyyyYk..',
  '.kpyyyyyyYk...',
  '..kkYyyYkk....',
  '....kbbk......',
  '....kbWk......',
  '....kbbk......',
  '..kkkbbkkk....',
  '.kbbbbbbbbk...',
  'kbWWbbbbWWbk..',
  'kbBBbkbbBBbk..',
  '.kkkk.kk.kkk..'];
const _P_SPITTER_DEAD = Object.assign({}, _P_SPITTER, { // v8.0 死亡派生：黄绿→枯黄（色相向橙黄偏 40°），明度整体压暗
  b: '#7a6a20', B: '#4e4412', W: '#a89a48', y: '#9a8a28', Y: '#6a5e18', p: '#b8ac68', e: '#2a2410'
});
const _SPITTER_DEAD = [ // v8.0 死亡帧·花苞垂落 + 茎折断：茎向左折成 Z 形（断面在 y11），花苞低头、花瓣收成枯条
  '..............',
  '.....kkkk.....',
  '...kkpyykk....',
  '..kpyyyyyk....',
  '.kpyyyYyyyk...',
  '.kpyyyyyyyk...',
  '..kYYYYYYk....',
  '...kkbbkk.....',
  '....kbbk......',
  '...kbbk.......',
  '..kbbk........',
  '.kkbbkk.......',
  'kbWWbbbbbk....',
  'kbBBbkbbbk....',
  '.kkk.kbbk.....',
  '.....kkkk.....'];

const _P_HOPPER = { // 内部：跳跳蛛（描边=深棕；亮橙黄体 + 深斑，全身最高饱和的一只，远处就能认出）
  k: '#3a2410', // 描边·深棕
  b: '#e8a020', // 身体主体·亮橙黄
  B: '#a86a08', // 暗部（明度 −35%）
  W: '#ffd870', // 高光（明度 +45%，左上受光）
  d: '#6a4a08', // 背部深色斑点（蛛类识别特征）
  w: '#ffffff', // 眼白（两只大眼，蛛形）
  e: '#241608'  // 瞳孔（朝左=基准朝向）
};
const _HOPPER1 = [ // v8.0 帧0·站立/滞空：4 条细长腿伸开落地，圆身体 + 背斑 + 左向双大眼
  '............',
  '...kkkkkk...',
  '..kbbbbbbk..',
  '.kbWWbbbbbk.',
  'kbwwbbwwbbbk',
  'kbewbewbbbbk',
  'kbbdbbbdbbbk',
  'kbbbbbbbdbbk',
  '.kBBBBBBBBk.',
  '..kkBBBBkk..',
  '.B.B....B.B.',
  '..B......B..'];
const _HOPPER2 = [ // v8.0 帧1·下蹲蓄力：身体压扁 1px（顶行留空）、4 腿蜷到体侧（膝盖朝上）；ui.js 在 crouch 态取此帧 + 脚底锚定压扁 0.8
  '............',
  '............',
  '...kkkkkk...',
  '..kbbbbbbk..',
  '.kbWWbbbbbk.',
  'kbwwbbwwbbbk',
  'kbewbewbbbbk',
  'kbbdbbbdbbbk',
  '.kBBBBBBBBk.',
  'BB.kkkkkk.BB',
  'B.B......B.B',
  '..B......B..'];
const _P_HOPPER_DEAD = Object.assign({}, _P_HOPPER, { // v8.0 死亡派生：亮橙黄压成土黄（明度 −40%），眼白转灰
  b: '#8a5c10', B: '#5a3a06', W: '#a87a20', d: '#3a2804', w: '#8a8478', e: '#2a1a08'
});
const _HOPPER_DEAD = [ // v8.0 死亡帧·八脚朝天 + 身体裂开：腿朝上用压暗 W 画（可见），腹面 k 裂口偏左把身体劈开（顺带造出朝向感）
  '.W.W...W.W..',
  '..W.W.W.W...',
  '..kkkkkkkk..',
  '.kbbbbbbbbk.',
  'kbBbbbbbbBbk',
  'kbbdbbbbdbbk',
  'kbBBBbbBBBbk',
  'kbbbkkbbbbbk',
  'kbbbbbbbbbbk',
  '.kbbbbbbbbk.',
  '..kkBBBBkk..',
  '...kkkkkk...'];

/* —— 物品：金币（金四阶+扫光帧）/ 宝石（切面折射）/ 钥匙 / 弹簧（金属圈高光）——
 * 全部彩色描边：金系描边=暗金棕，宝石描边=深青，弹簧描边=钢青，禁纯黑。 */
const _P_ITEM = { // 内部：物品/机关调色板
  k: '#7a4a10',  // 描边·暗金棕（金加深版）
  y: '#f8d020',  // 金基色
  Y: '#c89010',  // 金暗部
  o: '#f8a020',  // 金中间调
  w: '#fff8c8',  // 镜面高光
  c: '#48d8e8', C: '#1898a8', t: '#0e4a58', W: '#e8fcff', // 宝石：基/暗/描边/亮切面
  l: '#d8dce8', q: '#8a90a8', s: '#4a5060'                // 弹簧：亮钢/钢暗/描边
};
const _COIN1 = [ // 金币帧1（正对+斜向扫光带：白高光斜越币面）
  '..kkkk..',
  '.kwwyyk.',
  'kywwyyYk',
  'kywyyyYk',
  'kyyyyYYk',
  'kyyyyYYk',
  '.kyYYYk.',
  '..kkkk..'];
const _COIN2 = [ // 金币帧2（侧转 2/4：左亮右暗）
  '...kk...',
  '..kwYk..',
  '.kwoyYk.',
  '.kwoyYk.',
  '.koyyYk.',
  '.koyYYk.',
  '..koYk..',
  '...kk...'];
const _COIN3 = [ // 金币帧3（侧面薄片：受光棱线）
  '...kk...',
  '...kk...',
  '..kwok..',
  '..kwok..',
  '..koyk..',
  '..koYk..',
  '...kk...',
  '...kk...'];
const _GEM = [ // 宝石（8×8）：左上亮切面三角(W) + 右下暗切面三角(C) = 折射感
  '...kk...',
  '..kWk...',
  '.kWWccCk',
  'kWWccCCk',
  'kWcccCCk',
  '.kccCCk.',
  '..kcCk..',
  '...kk...'];
const _KEY_ART = [ // 钥匙（10×5）：左亮右暗+受光孔缘
  '.kkk......',
  'kwyykkkkkk',
  'kw.yk...Yk',
  'kwyyk...Yk',
  '.kkk....y.'];
const _SPRING_X = [ // 弹簧·弹开态（12×8）：顶板镜面高光+线圈亮钢
  '............',
  '..kkkkkkkk..',
  '..kwwllllk..',
  '..klk..klk..',
  '..kqkkkkqk..',
  '..lq....ql..',
  '..kkkkkkkk..',
  '.kqqkkkkqqk.'];
const _SPRING_C = [ // 弹簧·压缩态（12×8）
  '............',
  '............',
  '............',
  '..kkkkkkkk..',
  '..kwwllllk..',
  '..kqkkkkqk..',
  '.kqqkkkkqqk.',
  '............'];

/* ==================== v3 Boss 素材：星核巨兽 + 技能特效（art 工单 §C/§D/§E） ====================
 * 帧清单（ui 工单对表）：boss.body/bodyRage 64×48×2（帧2 呼吸下压 1px）；boss.arm/armRage
 * 20×16×1（+flipSprite=右臂）；boss.jaw/jawRage 20×8×2（闭/开）；boss.eye/eyeRage/eyeDizzy
 * 12×10×1；boss.pupil 4×4×1（±2px 追踪玩家）；boss.core 12×12×2（6 帧/秒闪烁，狂暴加倍）；
 * bossWhite.{body,arm,jaw} 受击白闪覆盖。姿态由 ui 的部件偏移/换帧驱动（≥5 组）。 */
const _P_BOSS = {          // 内部：星核巨兽常态调色板（描边=深渊紫，非纯黑）
  k: '#181232',  // 描边（深渊紫）
  S: '#3a2c62',  // 壳基色
  L: '#54407e',  // 壳受光（左上）
  D: '#241a42',  // 壳阴影（右下）
  C: '#f8d048',  // 星核金
  c: '#a87f18',  // 星核暗金
  W: '#fff8c8',  // 核心高光 / 骨爪
  e: '#38e8f8',  // 眼白（星辉青）
  E: '#f84848',  // 狂暴红
  b: '#c8b8e8',  // 腹甲亮（身体程序化用）
  m: '#28204a',  // 口腔暗
  t: '#f8a030'   // 裂纹橙光
};
const _P_BOSS_RAGE = {     // 内部：狂暴换装——同键换色，网格零改动
  k: '#200a18', S: '#5a2038', L: '#7a3048', D: '#3a1424',
  C: '#f86030', c: '#a82810', W: '#ffd8c8', e: '#f84848', E: '#f8a030',
  b: '#d8a8b0', m: '#380c18', t: '#f8d048'
};
const _P_EYE = { k: '#181232', e: '#38e8f8', w: '#e8fcff' };      // 内部：眼（星辉青）
const _P_EYE_RAGE = { k: '#200a18', E: '#f84848', w: '#ffd8c8' }; // 内部：狂暴眼/晕眩眼
const _P_PUPIL = { k: '#181232', p: '#0c1430' };                  // 内部：瞳孔
const _P_CORE2 = { k: '#181232', C: '#c89010', c: '#a87f18', W: '#f8d048' }; // 内部：星核帧2（降一档）

/* —— 字面网格（art 工单 §C2，已逐行校验长度与字符集）—— */
const _BOSS_EYE = [ // 眼 12×10
  '...kkkkkk...',
  '..keeeeeek..',
  '.keeeeeeeek.',
  '.keewweeeek.',
  'keeeeeeeeeek',
  'keeeeeeeeeek',
  '.keeeeeeeek.',
  '.keeeeeeeek.',
  '..keeeeeek..',
  '...kkkkkk...'];
const _BOSS_EYE_RAGE = [ // 狂暴眼 12×10（_P_EYE_RAGE）
  '...kkkkkk...',
  '..kEEEEEEk..',
  '.kEEEEEEEEk.',
  '.kEEwwEEEEk.',
  'kEEEEEEEEEEk',
  'kEEEEEEEEEEk',
  '.kEEEEEEEEk.',
  '.kEEEEEEEEk.',
  '..kEEEEEEk..',
  '...kkkkkk...'];
const _BOSS_EYE_DIZZY = [ // 晕眩眼 12×10（X 眼，stagger/dying 用，_P_EYE_RAGE）
  '...kkkkkk...',
  '..kkkkkkkk..',
  '.kkEEEEEEkk.',
  '.kEEk..kEEk.',
  'kEEk....kEEk',
  'kEEk....kEEk',
  '.kEEk..kEEk.',
  '.kkEEEEEEkk.',
  '..kkkkkkkk..',
  '...kkkkkk...'];
const _BOSS_PUPIL = ['.kk.', 'kppk', 'kppk', '.kk.']; // 瞳孔 4×4（ui 按 Boss→玩家方向 ±2px 偏移）
const _BOSS_JAW_C = [ // 下颚·闭合 20×8
  '....kkkkkkkkkkkk....',
  '...kSSSSSSSSSSSSk...',
  '..kSLLSLLSLLSLLSSk..',
  '..kSSSSSSSSSSSSSSk..',
  '..kmmmmmmmmmmmmmmk..',
  '...kSSSSSSSSSSSSk...',
  '....kDDDDDDDDDDk....',
  '.....kkkkkkkkkk.....'];
const _BOSS_JAW_O = [ // 下颚·张开 20×8（獠牙 W ×6）
  '....kkkkkkkkkkkk....',
  '...kSSSSSSSSSSSSk...',
  '..kSWWmmmmmmmmWWSk..',
  '..kmmmmmmmmmmmmmmk..',
  '..kmWmWmWmWmWmWmmk..',
  '..kmmmmmmmmmmmmmmk..',
  '...kDDDDDDDDDDDDk...',
  '.....kkkkkkkkkk.....'];
const _BOSS_CORE1 = [ // 星核 12×12 帧1（亮）；帧2 = 同网格 + _P_CORE2（降一档）
  '............',
  '.....kk.....',
  '....kCCk....',
  '...kcWWCk...',
  '..kcWWWWck..',
  '.kcWWWWWWck.',
  'kcWWWWWWWWck',
  '.kcWWWWWWck.',
  '..kcWWWWck..',
  '...kcCCck...',
  '....kCCk....',
  '.....kk.....'];

/* —— 身体/手臂：程序化行跨画法（预算授权：非全字面网格，art 工单 §C3/§C4）—— */
function _buildBossBody(pal) { // 内部：星核巨兽身体 64×48（十步；rage 版追加裂纹并换装）
  const W = 64, H = 48;
  const G = [];
  for (let y = 0; y < H; y++) G.push(new Array(W).fill('.'));
  const set = function (x, y, ch) { if (x >= 0 && x < W && y >= 0 && y < H) G[y][x] = ch; };
  const get = function (x, y) { return (x >= 0 && x < W && y >= 0 && y < H) ? G[y][x] : '.'; };
  // ① 上壳椭圆：中心 (32,16) rx=30 ry=14，y∈2..30（记录每列顶缘供 ⑧ 受光带）
  const shellTop = new Array(W).fill(-1);
  for (let y = 2; y <= 30; y++) {
    const t = (y - 16) / 14;
    const hw = Math.round(30 * Math.sqrt(Math.max(0, 1 - t * t)));
    if (hw < 1) continue;
    for (let x = 32 - hw; x <= 31 + hw; x++) { G[y][x] = 'S'; if (shellTop[x] < 0) shellTop[x] = y; }
  }
  // ② 下腹：y∈28..35 x∈[8,55]、y∈36..43 x∈[12,51] 填 b；y=32/36/40 画 D 肋线 1px 横贯腹甲
  for (let y = 28; y <= 35; y++) for (let x = 8; x <= 55; x++) G[y][x] = 'b';
  for (let y = 36; y <= 43; y++) for (let x = 12; x <= 51; x++) G[y][x] = 'b';
  for (let x = 8; x <= 55; x++) G[32][x] = 'D';
  for (let x = 12; x <= 51; x++) { G[36][x] = 'D'; G[40][x] = 'D'; }
  // ③ 腿桩：y∈44..47 填 S 于 x∈[16,25] 与 x∈[38,47]，y=47 一行 D
  for (let y = 44; y <= 47; y++) {
    for (let x = 16; x <= 25; x++) G[y][x] = 'S';
    for (let x = 38; x <= 47; x++) G[y][x] = 'S';
  }
  for (let x = 16; x <= 25; x++) G[47][x] = 'D';
  for (let x = 38; x <= 47; x++) G[47][x] = 'D';
  // ④ 背脊刺：x∈{14,26,32,38,50} 底宽 3 高 3（顶 1px → 3px → 再一行并入壳缘），受光 L
  [14, 26, 32, 38, 50].forEach(function (cx) {
    set(cx, 2, 'L');
    for (let x = cx - 1; x <= cx + 1; x++) { set(x, 3, 'L'); set(x, 4, 'L'); }
  });
  // ⑤ 裂纹 t（rage 版追加 (18,10)(19,11)）
  [[20, 7], [21, 8], [22, 8], [23, 9], [41, 6], [42, 7], [43, 8], [32, 4], [32, 5]]
    .concat(pal === _P_BOSS_RAGE ? [[18, 10], [19, 11]] : [])
    .forEach(function (p) { set(p[0], p[1], 't'); });
  // ⑥ 核心插座：x∈[26,37] y∈[22,31] 填 m（SPR.boss.core 覆盖在 (26,20)）
  for (let y = 22; y <= 31; y++) for (let x = 26; x <= 37; x++) G[y][x] = 'm';
  // ⑦ 眼窝底：x∈[14,25]∪[39,50] y∈[12,21] 填 D（eye 覆盖在 (14,12)/(38,12)）
  for (let y = 12; y <= 21; y++) {
    for (let x = 14; x <= 25; x++) G[y][x] = 'D';
    for (let x = 39; x <= 50; x++) G[y][x] = 'D';
  }
  // ⑧ 明暗：受光带 L = 每列壳顶缘 topY..topY+3 且 x<32（只覆盖壳基色 S，保住裂纹/插座），
  //     带缘 1px 棋盘过渡；阴影带 D = 椭圆右下缘 2px（x>32 且 y>16 的壳缘），带缘 1px 棋盘过渡
  for (let x = 0; x < 32; x++) {
    const top = shellTop[x];
    if (top < 0) continue;
    for (let y = top; y <= top + 3; y++) if (get(x, y) === 'S') set(x, y, 'L');
    if (get(x, top + 4) === 'S' && ((x + top + 4) & 1) === 0) set(x, top + 4, 'L');
  }
  for (let y = 17; y <= 30; y++) {
    let xr = -1;
    for (let x = W - 1; x > 32; x--) {
      const ch = get(x, y);
      if (ch === 'S' || ch === 'L') { xr = x; break; }
    }
    if (xr < 0) continue;
    set(xr, y, 'D');
    if (get(xr - 1, y) === 'S' || get(xr - 1, y) === 'L') set(xr - 1, y, 'D');
    if (get(xr - 2, y) === 'S' && ((xr + y) & 1) === 0) set(xr - 2, y, 'D');
  }
  // ⑨ 描边：①..④ 填充像素（S/L/D/b；D 亦含 ②肋线/③腿底/⑦眼窝——均居中不受影响），
  //     4 邻为空者改 k（⑤⑥⑦ 的 t/m 不参与描边）
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = G[y][x];
    if (ch !== 'S' && ch !== 'L' && ch !== 'D' && ch !== 'b') continue;
    if (get(x - 1, y) === '.' || get(x + 1, y) === '.' || get(x, y - 1) === '.' || get(x, y + 1) === '.') set(x, y, 'k');
  }
  // ⑩ 输出：字符网格 → canvas（调色板映射）
  const c = _makeCanvas(W, H), g = c.getContext('2d');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = G[y][x];
    if (ch !== '.' && pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); }
  }
  return c;
}
const _BOSS_ARM_SPANS = [ // 内部：手臂行跨表（xL..xR，负数=空行）——art 工单 §C4
  [6, 13], [5, 14], [5, 14], [5, 14], [6, 13], [7, 12], [7, 12], [7, 12],
  [7, 12], [6, 13], [5, 15], [5, 15], [5, 15], [6, 14], [7, 13], [-1, -1]
];
function _buildBossArm(pal) { // 内部：星核巨兽手臂 20×16（行跨程序化；水平翻转即右臂）
  const W = 20, H = 16;
  const G = [];
  for (let y = 0; y < H; y++) G.push(new Array(W).fill('.'));
  const get = function (x, y) { return (x >= 0 && x < W && y >= 0 && y < H) ? G[y][x] : '.'; };
  for (let y = 0; y < H; y++) { // 主体 S（行跨表）
    const s = _BOSS_ARM_SPANS[y];
    if (s[0] < 0) continue;
    for (let x = s[0]; x <= s[1]; x++) G[y][x] = 'S';
  }
  for (let y = 1; y <= 2; y++) { // y1..y2 的 xL..xL+3 画 L 高光
    const s = _BOSS_ARM_SPANS[y];
    for (let x = s[0]; x <= s[0] + 3; x++) G[y][x] = 'L';
  }
  for (let y = 8; y <= 11; y++) { // y8..y11 的 xR-3..xR 画 D
    const s = _BOSS_ARM_SPANS[y];
    for (let x = s[1] - 3; x <= s[1]; x++) G[y][x] = 'D';
  }
  (function () { // 拳部（y9..y13 宽段）底部 y13 画 D 1px
    const s = _BOSS_ARM_SPANS[13];
    for (let x = s[0]; x <= s[1]; x++) G[13][x] = 'D';
  })();
  [7, 10, 13].forEach(function (x) { // 爪尖 W：y14..15 在 x∈{7,10,13} 各画 2px 竖条
    G[14][x] = 'W'; G[15][x] = 'W';
  });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { // 描边同 §C3⑨：填充像素 4 邻空 → k
    if (G[y][x] === '.') continue;
    if (get(x - 1, y) === '.' || get(x + 1, y) === '.' || get(x, y - 1) === '.' || get(x, y + 1) === '.') G[y][x] = 'k';
  }
  const c = _makeCanvas(W, H), g = c.getContext('2d');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = G[y][x];
    if (ch !== '.' && pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); }
  }
  return c;
}
function _bossBreath(src) { // 内部：呼吸帧——整体下压 1px（§C3⑩ drawImage 4 参压缩）
  const c = _makeCanvas(src.width, src.height), g = c.getContext('2d');
  g.drawImage(src, 0, 1, src.width, src.height - 1);
  return c;
}
function _whiteVariant(spr) { // 内部：白剪影（受击 0.12s 覆盖；source-atop 保住透明区）
  const c = _makeCanvas(spr.width, spr.height), g = c.getContext('2d');
  g.drawImage(spr, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = 0.85;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, spr.width, spr.height);
  return c;
}
function _glow(spr, rim, deep) { // 内部：发光件后处理（§5.4）——剪影左上内缘 1px rim 内描边（alpha .5），
  // source-atop 不出剪影；deep=Boss 眼强化；原尺寸返回。
  const W = spr.width, H = spr.height;
  const c = _makeCanvas(W, H), g = c.getContext('2d');
  g.drawImage(spr, 0, 0);
  const a = spr.getContext('2d').getImageData(0, 0, W, H).data;
  const solid = function (x, y) { return x >= 0 && y >= 0 && x < W && y < H && a[(y * W + x) * 4 + 3] > 0; };
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = 0.5; // 内描边半透明（rim 覆盖在原色上）
  g.fillStyle = rim;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    if (solid(x, y) && (!solid(x - 1, y) || !solid(x, y - 1) || !solid(x - 1, y - 1) ||
        (deep && (!solid(x - 2, y) || !solid(x, y - 2))))) g.fillRect(x, y, 1, 1);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  return c;
}

/* —— 技能与战斗特效（art 工单 §D；连斩全屏斩/护盾泡泡/nova 环/彩带归 ui 程序化，不预置）—— */
const _P_METEOR = { k: '#181232', y: '#f8d048', o: '#f8a020', w: '#fff8c8', t: '#f88030' }; // 流星+尾焰
const _METEOR_F1 = [ // 流星帧1 10×12（帧2 = 帧1 上移 1px + 顶点 (4,0) 画 w 1px）
  '....kk....',
  '...kyyk...',
  '..kywwyk..',
  '.kyywwyyk.',
  'kyyyyyyook',
  '.kyoyyok..',
  '..kyyk.t..',
  '...kk..tt.',
  '......tt..',
  '.....tt...',
  '....tt....',
  '...tt.....'];
const _P_WAVE = { k: '#181232', c: '#48d8e8', C: '#1898a8', w: '#e8fcff' };   // 冲击波帧1
const _P_WAVE2 = { k: '#181232', c: '#48d8e8', C: '#e8fcff', w: '#1898a8' }; // 帧2：同网格 w↔C 互换
const _WAVE_F1 = [ // 冲击波帧1 16×12（左行用 flipSprite）
  '................',
  '................',
  '..........kk....',
  '.........kcwk...',
  '....kk...kccck..',
  '...kcck..kccCk..',
  '..kcccckkcCCCk..',
  '.kccCCCCCCCCk...',
  '.kcCCwCCCCCCk...',
  '..kkkkkkkkkkk...',
  '................',
  '................'];
const _P_BSTAR = { k: '#181232', y: '#f8d048', o: '#f8a020', w: '#fff8c8' }; // Boss 星弹
const _BSTAR_F1 = [ // 星弹帧1 8×7（帧2 = flipSprite(帧1)，自旋感）
  '...kk...',
  '..kwyk..',
  '.kwyyyk.',
  'kyyyyyok',
  '.kyoyok.',
  '..kook..',
  '...kk...'];
const _P_HEART = { k: '#3a1020', r: '#f85888', R: '#c82858', w: '#ffd8e8' };  // 回复心
const _P_HEART_E = { k: '#3a1020', r: '#3a2a3a', R: '#2a2028', w: '#4a3a4a' }; // 空心：同网格换暗色
const _HEART_F = [ // 心 8×8（工单网格 7 行，按规格表/设计文档 §5「8×8」顶部补 1 空行）
  '........',
  '.kk..kk.',
  'krrkkrrk',
  'krwrrrrk',
  'krrrrrrk',
  '.krrrrk.',
  '..krrk..',
  '...kk...'];
const _P_SKU = { k: '#7a4a10', y: '#f8d020', o: '#f8a020', w: '#fff8c8' };   // skU 星陨
const _SK_U = [
  '.....kk.....',
  '....kyyk....',
  '...kywyyk...',
  '..kyywwyyk..',
  '.kyywwwwwyk.',
  'kyyywwwwwyyk',
  '.kyoowwwwyk.',
  '..kooooook..',
  '...kooook...',
  '....kook....',
  '.....kk.....',
  '............'];
const _SK_I = [ // v5 盾徽：金盾+白十字亮面+下缘暗部（工单 §C 网格照抄）
  '..kkkkkkkk..',
  '.kyywwwwyYk.',
  '.kywyyyywYk.',
  '.kyywyywYYk.',
  '.kyywwwwYYk.',
  '.kyyyyyYYYk.',
  '..kyyyyYYk..',
  '..kyyyyYYk..',
  '...kyyYYk...',
  '....kYYk....',
  '.....kk.....',
  '............'];
const _SK_O = [ // v5 竖剑：白刃+青刃缘+金护手/柄（工单 §C 网格照抄）
  '.....ww.....',
  '....kwck....',
  '....kwck....',
  '....kwck....',
  '....kwck....',
  '....kwck....',
  '....kwck....',
  '..kkkwwkkk..',
  '.kkkkwwkkkk.',
  '....kYYk....',
  '....kYYk....',
  '....kkkk....'];
const _P_HERO_GOLD = Object.assign({}, _P_HERO, { b: '#f8d048', B: '#c89010', W: '#fff8c8' }); // 内部：施法金（蓝主体换金，围巾橙金系保留）

/* ==================== v4：谜题神龛 16×24（手绘字符网格，同网格双调色板） ====================
 * 石碑剪影：顶部尖角 + 8 宽碑身（左受光 L / 右背光 D）+ 中段刻纹带 + 下层台座。
 * 字符语义：k 描边 / L 亮面 / S 基面 / D 暗面 / c 裂纹·金纹暗 / v 刻纹·金纹亮 / w 微光·金纹芯 / m 苔点。
 * off=暗青石（c/v/w 为暗刻痕）；on=点亮（c/v/w 换金纹三阶，石面整体提亮）。 */
const _P_SH_OFF = { // 内部：神龛·未解（暗青石）
  k: '#0c2024', L: '#4f8a8e', S: '#356064', D: '#24444a',
  c: '#143034', v: '#2a5254', w: '#3e7478', m: '#3a6e58'
};
const _P_SH_ON = { // 内部：神龛·已解点亮（金纹）
  k: '#12282c', L: '#68a8ac', S: '#4a8286', D: '#2f5c60',
  c: '#c89010', v: '#f8d048', w: '#fff8c8', m: '#4e8a62'
};
const _SHRINE = [ // 16×24：碑身+裂纹之字+刻纹带（行12-14 菱点+横槽）+台座
  '................',
  '................',
  '.......kk.......',
  '......kLSk......',
  '.....kLLSSk.....',
  '....kLSSSSDk....',
  '....kLScSSDk....',
  '....kLSScSDk....',
  '....kLScSSDk....',
  '....kLSScSDk....',
  '....kLSSSmDk....',
  '....kLSSSSDk....',
  '....kLvSSvDk....',
  '....kcvwwvck....',
  '....kLvSSvDk....',
  '....kLSSSSDk....',
  '....kLSScSDk....',
  '....kLScSSDk....',
  '....kLSSSSDk....',
  '...kLLSSSSDDk...',
  '..kkkkkkkkkkkk..',
  '..kDSSSSmSSSDk..',
  '..kDSSSSSSSSDk..',
  '.kkkkkkkkkkkkkk.'];
const _P_STAR1 = { w: '#f8d048', y: '#fff8c8', W: '#ffffff' }; // 内部：星光帧1（金芒+白芯）
const _SHRINE_STAR1 = [ // 8×6 四芒星，叠画于 (4,0)——盖住碑顶尖如光爆
  '...ww...',
  '...ww...',
  'wwyWWyww',
  'wwyWWyww',
  '...ww...',
  '...ww...'];
const _P_STAR2 = { d: '#d8a020', y: '#f8d048' }; // 内部：星光帧2（收暗）
const _SHRINE_STAR2 = [ // 8×6 缩小闪烁+右上偏移碎光
  '........',
  '...dd.d.',
  '..dyyd..',
  '..dyyd..',
  '...dd...',
  '........'];

/* ==================== v4：谜题覆盖层素材（手绘字符网格） ====================
 * v5 换皮（工单 §F）：木色→深蓝金调色板（k 描边/N 深蓝/n 底/m 亮蓝/l 金边）；
 * 网格字符画与 8×8 齐缝约定逐行不变（ui 零改动）。*/
const _P_PZWOOD = { k: '#1a2440', N: '#24345e', n: '#2e4070', m: '#3c5490', l: '#f0c860' }; // 内部：覆盖层深蓝金皮
const _PZ_EDGE_H = [ // 8×8 水平边条（上下边通用：上缘高光/下缘暗纹为全局受光方向）
  'kkkkkkkk',
  'llllllll',
  'mmnnnnmm',
  'mnnNnnnm',
  'nnnnnnnn',
  'NnnNNnnN',
  'NNNNNNNN',
  'kkkkkkkk'];
const _PZ_EDGE_V = [ // 8×8 垂直边条（左右边通用：竖向木纹虚接）
  'klmnnnNk',
  'klmnnnNk',
  'klnnnnNk',
  'klnnNnNk',
  'klmnnnNk',
  'klmnnnNk',
  'klnnnnNk',
  'klnnnnNk'];
const _PZ_CORNER_TL = [ // 8×8 左上角：右列接 edgeH 左端、底行接 edgeV 顶行
  'kkkkkkkk',
  'klllllll',
  'klmnnnnm',
  'kmnnnnnm',
  'kmnnnnnn',
  'kmnnnnNN',
  'kmnnnNNN',
  'klmnnnNk'];
const _PZ_CORNER_TR = [ // 8×8 右上角：左列接 edgeH 右端、底行接 edgeV 顶行
  'kkkkkkkk',
  'lllllllk',
  'mnnnnnnk',
  'mnnnnnnk',
  'nnnnnnnk',
  'NnnnnnNk',
  'NnnnnNNk',
  'klmnnnNk'];
const _PZ_CORNER_BL = [ // 8×8 左下角：顶行接 edgeV 底行、右列接 edgeH 左端
  'klnnnnNk',
  'klnnNnnl',
  'klnnnnnm',
  'klnnNnnm',
  'klnnnnnn',
  'knnnnnnN',
  'knnnnnNN',
  'kkkkkkkk'];
const _PZ_CORNER_BR = [ // 8×8 右下角：顶行接 edgeV 底行、左列接 edgeH 右端
  'klnnnnNk',
  'lnnNnnnk',
  'mnnnnnnk',
  'mnnNnnnk',
  'nnnnnnnk',
  'Nnnnnnnk',
  'NNnnnnnk',
  'kkkkkkkk'];
const _P_PZCUR = { w: '#ffffff', k: '#1c2450' }; // 内部：光标框（白描边+藏蓝内圈=主角描边同族，白底格上仍可读）
const _PZ_CURSOR = [ // 12×12 网格光标：外圈白、内圈藏蓝、中空（透出格内容）
  'wwwwwwwwwwww',
  'wkkkkkkkkkkw',
  'wk........kw',
  'wk........kw',
  'wk........kw',
  'wk........kw',
  'wk........kw',
  'wk........kw',
  'wk........kw',
  'wk........kw',
  'wkkkkkkkkkkw',
  'wwwwwwwwwwww'];
const _P_PZX = { w: '#dfe6f2', d: '#8e9cb0' }; // 内部：数织叉格（亮灰主体+暗灰尖角）
const _PZ_XMARK = [ // 8×8 叉格标记：粗叉亮灰、上下尖端收暗（暗底亮可见/亮底暗尖可见）
  'd......d',
  'ww....ww',
  '.ww..ww.',
  '..wwww..',
  '..wwww..',
  '.ww..ww.',
  'ww....ww',
  'd......d'];

/* ==================== v6 第一波·特效队素材（设计书 §10.1，工单 v6-wave1-fx） ====================
 * 全部手绘字符网格（行长经 tools/_v6_fx_check.js 校验），挂载于 buildSprites() v6 块。
 * 朝向约定：knightGuard / mage 基准帧面向左（与 SPR.knight 同向 art.js:1226 先例；
 * ui 按 e.face>0 flipCache 翻转）。blade/fireball 为无朝向弹体，ui 仅 blade 按 dir 翻转。 */
const _P_BLADE = { k: '#1c2450', y: '#f8d048', Y: '#c89010', w: '#ffffff' }; // 内部：星刃（描边=主角深藏蓝惯例，金/暗金/白芯）
const _BLADE_F1 = [ // 星刃帧1 12×12：十字四芒（上下左右尖），白芯 2×2 居中，右/下半暗金
  '.....kk.....',
  '....kyYk....',
  '....kyYk....',
  '...kyyYYk...',
  '...kyyYYk...',
  'kyyyywwyyyyk',
  'kYYYYwwYYYYk',
  '...kyyYYk...',
  '...kyyYYk...',
  '....kyYk....',
  '....kyYk....',
  '.....kk.....'];
const _BLADE_F2 = [ // 星刃帧2 12×12：帧稿旋转 45°（×形四芒），白芯+暗金内环——两帧交替产生自旋
  'kk........kk',
  'kyy......yyk',
  'kyyy....yyyk',
  '.kyyy..yyyk.',
  '..kyYYYYyk..',
  '...kYwwYk...',
  '...kYwwYk...',
  '..kyYYYYyk..',
  '.kyyy..yyyk.',
  'kyyy....yyyk',
  'kyy......yyk',
  'kk........kk'];
const _P_SKL = { k: '#7a4a10', y: '#f8d048', Y: '#c89010', w: '#fff8c8' }; // 内部：skL（金家族同 skI 挂载调色板）
const _SK_L = [ // 技能槽4图标 12×12：回旋双刃环——两枚小四芒刃（右上/左下）对转 + 暗金轨迹点成环
  '............',
  '.......k....',
  '.......kyk..',
  '...Y.kywyk..',
  '.......kyk..',
  '...k...k....',
  '..kyk.......',
  '.kywyk..Y...',
  '..kyk.......',
  '...k........',
  '............',
  '............'];
const _P_KNIGHT_GUARD = Object.assign({}, _P_KNIGHT, { W: '#fff8c8' }); // 内部：举盾派生（+盾沿高光，工单 §3；钢甲色系沿用 _P_KNIGHT）
const _KN_G1 = [ // 举盾前摇 14×18：盾上提至胸（行4..11）+盾沿高光 W，双腿开立蓄势（躯干同 SPR.knight 帧1）
  '....kkyykk....',
  '...kssssssk...',
  '...kssssssk...',
  '...kesesesk...',
  '.WWWssssssk...',
  'LWWLsssssssyy.',
  'LssLLLsssssSS.',
  'LyyLLLsssssSS.',
  'LyyLssssssk...',
  'LssLssssssk...',
  'LssLssbbbsk...',
  '.LL.ssbbbsk...',
  '....ssbbbsk...',
  '....ksbbbkk...',
  '.....kkk......',
  '....kkk.kk....',
  '....kkk..kk...',
  '...kkk...kkk..'];
const _KN_G2 = [ // 冲锋 14×18：盾前顶（行5..13）+盾面受光线（W/w 竖向亮带），身体前倾 1px，弓步
  '...kkyykk.....',
  '..kssssssk....',
  '..kssssssk....',
  '..kesesesk....',
  '..kssssssk....',
  'LWWLssssssyy..',
  'LWwLLsssssSS..',
  'LssLLsssssSS..',
  'LyyLsssssk....',
  'LyyLsssssk....',
  'LssLsbbbsk....',
  'LssLsbbbsk....',
  'LssLsbbbsk....',
  '.LLksbbbkk....',
  '....kkk.......',
  '...kkk.kk.....',
  '..kkk...kk....',
  '..kkk....kkk..'];
const _P_MAGE = { // 内部：幽焰法师（工单 §4：紫黑袍/兜帽阴影脸+红瞳/木杖金火种）
  k: '#181228',  // 描边·深紫黑
  r: '#3a2a50',  // 袍基色
  d: '#241c38',  // 袍暗部（背光侧/下摆）
  f: '#141020',  // 兜帽阴影脸
  e: '#f86030',  // 红瞳
  t: '#6a5a48',  // 木杖
  y: '#f8d048',  // 火种·亮帧
  o: '#c89010',  // 火种·暗帧（待机明暗交替）
  W: '#fff8c8'   // 火种芯（读条 3×3 用）
};
const _MAGE_1 = [ // 待机帧1 14×18：火种亮（y 2×2）+ 袍摆收
  '.....kkkk.....',
  '....krrrrk....',
  'yy.krrrrrrk...',
  'yy.krffffrk...',
  '.t.krefferk...',
  '.t.krffffrk...',
  '.t.krrrrrdk...',
  '.t.krrrrrdk...',
  '.t.krrrrrdk...',
  '.tkrrrrrrdk...',
  '.tkrrrrrddk...',
  '.tkrrrrrddk...',
  '.tkrrrrrddk...',
  '.tkrrrrrrddk..',
  '.tkrrrrrrddk..',
  '.tkrrrrrrddk..',
  '.tkrrrrrrdddk.',
  '.tkddddddddk..'];
const _MAGE_2 = [ // 待机帧2 14×18：火种转暗（o）+ 袍摆飘（下两行错位 1px）——game.tick*3 取帧
  '.....kkkk.....',
  '....krrrrk....',
  'oo.krrrrrrk...',
  'oo.krffffrk...',
  '.t.krefferk...',
  '.t.krffffrk...',
  '.t.krrrrrdk...',
  '.t.krrrrrdk...',
  '.t.krrrrrdk...',
  '.tkrrrrrrdk...',
  '.tkrrrrrddk...',
  '.tkrrrrrddk...',
  '.tkrrrrrddk...',
  '.tkrrrrrrddk..',
  '.tkrrrrrrddk..',
  '.tkrrrrrdddk..',
  '.tkrrrrrrdddk.',
  '.tkdddddddk...'];
const _MAGE_CAST = [ // 读条姿态 14×18 单帧：双手举杖过头、火种放大 3×3（白芯）——读条 0.8s 期间
  'yyy..kkkk.....',
  'yWy.krrrrk....',
  'yyykrrrrrrk...',
  '.t.krffffrk...',
  '.trkrefferk...',
  '.trkrffffrk...',
  '.t.krrrrrdk...',
  '.tkrrrrrrdk...',
  '.tkrrrrrrdk...',
  '.tkrrrrrddk...',
  '.tkrrrrrddk...',
  '.tkrrrrrddk...',
  '.tkrrrrrrddk..',
  '.tkrrrrrrddk..',
  '.tkrrrrrrddk..',
  '.tkrrrrrrddk..',
  '.tkrrrrrrdddk.',
  '.tkddddddddk..'];
const _P_FIREB = { o: '#f86030', i: '#f8a040', w: '#fff8c8' }; // 内部：火球（外焰/内焰/白芯，无描边——_glow 出热缘）
const _FIREB_F1 = [ // 火球帧1 8×8：圆焰
  '..oooo..',
  '.oiiiio.',
  'oiiiiiio',
  'oiiwwiio',
  'oiiwwiio',
  'oiiiiiio',
  '.oiiiio.',
  '..oooo..'];
const _FIREB_F2 = [ // 火球帧2 8×8：略缩 + 焰旋（对角火舌，自旋感）——(tick*10|0)%2 取帧
  '......o.',
  '..oooo..',
  '.oiiioo.',
  '.oiwwioo',
  '.oiwwio.',
  '.oiiiio.',
  '..oooo..',
  '.o......'];

/* ==================== v6 第二波·外观队素材（设计书 §10.2/§7.5，工单 v6-wave2-look） ====================
 * 装备外观部件层 + 槽位图标，全部挂 SPR（合成在 ui bag 队 heroLook，本文件只产素材）。
 * 16×16 覆盖网格：常量只存内容行，挂载时 _lookSprite(rows, top, pal) 顶部补 top 行透明、底部
 * 补齐 16 行（v3 boss 程序化画法同款预算授权；top 偏移=分区红线锚点，冻结 weapon=7/hat=0/cape=5）。
 * 分区红线（工单 H3，_v6_look_check.js 按偏移逐像素断言）：hat rows0..4×cols4..11（不遮脸）；
 * weapon rows7..15×cols10..15（不出右缘 col15，防攻冲家族 dx+1 裁边）；cape rows5..15×cols0..6
 * （底层件，画在基础帧之下）。档位（H4）：1 朴素木/布、2 秘银蓝系、3 金+星辉。 */
function _lookSprite(rows, top, pal) { // 内部：部件内容行 → 16×16 覆盖网格精灵
  const out = [], dot = '................';
  for (let i = 0; i < top; i++) out.push(dot);
  for (let i = 0; i < rows.length; i++) out.push(rows[i]);
  while (out.length < 16) out.push(dot);
  return _makeSprite(out, pal);
}

// —— 档1 木剑（木两阶 #c89858/#a87848 + 深木影 + 布缠柄）——
const _P_LOOK_W1 = { k: '#1c2450', l: '#c89858', m: '#a87848', d: '#7a5430', c: '#b89878', C: '#98826a' };
const _LOOK_W1 = [ // 木剑内容行(rows7..15)：木圆头+布缠柄（手位 r10 对齐攻帧白手套）/木护手 r11/两阶木刃
  '.............k..',
  '.............kl.',
  '.............cC.',
  '.............cC.',
  '............dmd.',
  '............lm..',
  '............lm..',
  '.............lm.',
  '..............d.'];
const _P_LOOK_W2 = { k: '#1c2450', L: '#8ab8e8', d: '#48a8f8', g: '#f8d048', G: '#c89010', t: '#6a4a2a', T: '#4a3218' };
const _LOOK_W2 = [ // 秘银长剑：金圆头+皮缠柄 / 金护手 r11 / 秘银双阶刃 #8ab8e8/#48a8f8
  '.............k..',
  '.............kg.',
  '.............tT.',
  '.............tT.',
  '............gGg.',
  '............Ld..',
  '............Ld..',
  '.............Ld.',
  '..............d.'];
const _P_LOOK_W3 = { k: '#1c2450', W: '#e8f4ff', V: '#b8ccf0', w: '#ffffff', y: '#f8d048', Y: '#c89010' };
const _LOOK_W3 = [ // 星辉巨剑：金头金缠柄 / 宽金护手 / 3px 宽刃渐层+金圣纹 r13+刃心星点 r12
  '.............k..',
  '.............ky.',
  '.............yY.',
  '.............yY.',
  '...........YyyY.',
  '...........WwV..',
  '...........WyV..',
  '............WWV.',
  '..............V.'];

// —— 帽子/头冠（内容行=rows0..4，top=0；帽沿 1px 深藏蓝 'k' 与发色描边衔接）——
const _P_LOOK_H1 = { k: '#1c2450', m: '#a87848', d: '#7a5430', C: '#c89858' };
const _LOOK_H1 = [ // 档1 布帽：棕 #a87848 帽冠+浅布补丁 C+右垂尖 d（帽沿 k 行 r3）
  '......kkkk......',
  '.....kmmmmk.....',
  '....kmCmmmk.....',
  '....kkkkkkkd....',
  '...........d....'];
const _P_LOOK_H2 = { k: '#1c2450', L: '#8ab8e8', S: '#4878b8', b: '#2860c0', w: '#e8f4ff' };
const _LOOK_H2 = [ // 档2 秘银头冠：银蓝冠圈（L/S 双阶拱圈）+ 冠带中央单颗蓝宝石 b+w 高光
  '.......kk.......',
  '......kLLk......',
  '.....kLLLLk.....',
  '....kSSbwSSk....',
  '....kkkkkkkk....'];
const _P_LOOK_H3 = { k: '#1c2450', y: '#f8d048', Y: '#c89010', r: '#f86030', w: '#fff8c8' };
const _LOOK_H3 = [ // 档3 神话金冠：金三尖冠 + 冠带白星辉点 + 中央红宝石 #f86030
  '.....y.yy.y.....',
  '.....yyyyyy.....',
  '....kyywyyyk....',
  '....kYYrrYYk....',
  '....kkkkkkkk....'];

// —— 背后披风（内容行=rows5..15，top=5；底层件，画在基础帧之下）——
const _P_LOOK_C1 = { h: '#a08e78', g: '#8a7a68', D: '#64584a' };
const _LOOK_C1 = [ // 档1 破布披：灰褐 #8a7a68，r12 破洞 + 缺角下摆（r15 缺左角），摆幅 3px
  'hg..............',
  'hg..............',
  'hg..............',
  'hg..............',
  'g...............',
  'g...............',
  'gg..............',
  'g.g.............',
  'Dgg.............',
  'Dgg.............',
  '.Dgg............'];
const _P_LOOK_C2 = { L: '#8ab8e8', B: '#4878b8', D: '#2c5490', w: '#e8f4ff' };
const _LOOK_C2 = [ // 档2 秘银披：蓝银双层（受光棱 L+基色 B+内层 D）+ 下摆亮线 w 角，摆幅 4px
  'LB..............',
  'LB..............',
  'LB..............',
  'LB..............',
  'L...............',
  'L...............',
  'LB..............',
  'LBB.............',
  'LBBD............',
  'LBBD............',
  'LBBw............'];
const _P_LOOK_C3 = { y: '#f8d048', B: '#2c3a70', w: '#ffffff' };
const _LOOK_C3 = [ // 档3 星辉披风：深蓝 #2c3a70 底+左缘金边全程+散白星点，摆幅 5px
  'yB..............',
  'yB..............',
  'yB..............',
  'yB..............',
  'y...............',
  'y...............',
  'yB..............',
  'ywB.............',
  'yBBB............',
  'yBwBB...........',
  'yBBBw...........'];

// —— 槽位图标 12×12：灰阶三阶基准稿 #ffffff/#a8a8b8/#585868（ui source-atop 叠稀有度色，
//     基稿不带彩色）+ 深藏蓝描边 1px（_P_HERO 'k' 惯例）——
const _P_ICO = { k: '#1c2450', W: '#ffffff', A: '#a8a8b8', D: '#585868' };
const _ICO_W = [ // 武器槽：斜剑剪影（刃芯 W+刃缘 A 斜行 / 护手横杠 / 柄+圆头 D）
  '............',
  '.........kWk',
  '........kWAk',
  '.......kWAk.',
  '......kWAk..',
  '.....kWAk...',
  '..kkkWAkkk..',
  '....kDk.....',
  '...kDk......',
  '...kkk......',
  '...kDk......',
  '....k.......'];
const _ICO_H = [ // 头饰槽：三尖冠剪影（W 尖+冠带 / D 带底影）
  '............',
  '............',
  '............',
  '..W..WW..W..',
  '.WWW.WW.WWW.',
  '.WWWWWWWWWW.',
  'kWWWWWWWWWWk',
  'kDDDDDDDDDDk',
  '.kkkkkkkkkk.',
  '............',
  '............',
  '............'];
const _ICO_C = [ // 披风槽：氅剪影（领结收顶 → 下摆展宽 → D 影底缘）
  '............',
  '....kWWk....',
  '...kWWWWk...',
  '..kAWWWWAk..',
  '..kAWWWWAk..',
  '.kAWWWWWWAk.',
  '.kAWWWWWWAk.',
  '.kAWWWWWWAk.',
  'kAWWWWWWWWAk',
  'kAWWWWWWWWAk',
  'kDDDDDDDDDDk',
  '.kkkkkkkkkk.'];
const _P_ICO_BAG = { k: '#1c2450', m: '#a87848', d: '#7a5430', l: '#c89858', y: '#f8d048', Y: '#c89010' };
const _ICO_BAG = [ // HUD 背包钮：囊袋（提手+盖 flap l+袋身 m）+ 中带金扣 y/Y + 袋底影 d
  '............',
  '....kkkk....',
  '....k..k....',
  '..kkkkkkkk..',
  '.kllllllllk.',
  '.kllllllllk.',
  'kmlllYYlllmk',
  'kmmmmYYmmmmk',
  'kmmmmYYmmmmk',
  'kmmmmmmmmmmk',
  'kddddddddddk',
  '.kkkkkkkkkk.'];

/* ==================== v7 美术队：新敌/机关素材（工单 §3/§5） ====================
 * H4 方向：lancer 面左（ui e.face>0 flipCache 沿 mage/knight 惯例），jelly/ghost/boomer 对称构图。 */
const _P_LANCER = { k: '#4a140c', r: '#e85830', R: '#b03818', L: '#f89068', m: '#f8c8a0', w: '#e8ecf4', W: '#ffffff', e: '#f8f0e0', p: '#281018' }; // 枪虾
const _LANCER_1 = [ // 枪虾帧1 面左
  '....kkkkkk....',
  '..kkrrrrrrkk..',
  '.krLLrrrrrrRk.',
  '.krLrrrrrrrRk.',
  'krrrperrrrRk..',
  'krrrperrrrRk..',
  'wWkrrrrrrrRk..',
  'wWkrrrmmrrRk..',
  '.wWkmmmrrrRk..',
  '..kmmmmrrRk...',
  '..krrrrrRk....',
  '...krrrRk.....',
  '...kRk.kRk....',
  '..............'];
const _LANCER_2 = _LANCER_1.slice(0, 8).concat(['wwWkmmmrrrRk..'], _LANCER_1.slice(9)); // 帧2：矛前伸 1px
const _P_JELLY = { k: '#1a3a5c', c: '#8ad8f8', C: '#48a8e0', D: '#2878b8', w: '#e8fcff', t: '#a8e8ff', T: '#58b8e8' }; // 水母
const _JELLY_1 = [ // 水母帧1
  '...kkkkkk...',
  '..kcwwccCk..',
  '.kcwccccCCk.',
  '.kcccccCCDk.',
  'kcccccccCCDk',
  'kDccccccCDDk',
  '.kkkkkkkkkk.',
  '.t..t..t..t.',
  '.t..t..t..t.',
  '.t..t..t..t.',
  '.T..T..T..T.',
  '.T..T..T..T.'];
const _JELLY_2 = _JELLY_1.slice(0, 5).concat([ // 帧2 伞缘收缩
  '.kDccccCCDk.',
  '..kTkkkkTk..',
  '..t.t..t.t..',
  '..t.t..t.t..',
  '..T.T..T.T..',
  '..T.T..T.T..',
  '............']);
const _P_GHOST = { k: '#241436', P: '#b8a8f0', p: '#8868d8', D: '#5848a0', w: '#f0f4ff' }; // 幽灵
const _GHOST_1 = [ // 幽灵帧1
  '...kkkkkk...',
  '..kPPwwPPk..',
  '.kPPwwwwPPk.',
  '.kPkkwwkkPk.',
  '.kPkkwwkkPk.',
  '.kPwwwwwwPk.',
  '.kpwwwwwwpk.',
  '.kppwwwwppk.',
  '.kppppppppk.',
  '.kDppppppDk.',
  '.kDDppppDDk.',
  '.kDDkDDkDDk.',
  '.k..k..k..k.',
  '............'];
const _GHOST_2 = _GHOST_1.slice(0, 11).concat([ // 帧2：下摆右移 1px
  '..kDkDDkDDk.',
  '..k..k..k..k',
  '............']);
const _P_BOOMER = { k: '#16304a', b: '#58b8f8', B: '#2878c8', w: '#e8f8ff' }; // 魂火
const _BOOMER_1 = [ // 魂火帧1
  '....w.....',
  '...kwk....',
  '...kwbk...',
  '..kwwbk...',
  '..kwwbbk..',
  '.kbwwbbk..',
  '.kbbwbbBk.',
  '.kbbbbBBk.',
  '..kbbBBk..',
  '...kkkk...'];
const _BOOMER_2 = [ // 魂火帧2（膨胀+1px 外焰）
  '....w.....',
  '...kwk....',
  '..kwwbk...',
  '.kwwwbbk..',
  '.kwwbbBk..',
  'kbbwwbbBk.',
  'kbbbwbbBBk',
  'kbbbbBBBk.',
  '.kbbBBBk..',
  '..kkkkkk..'];
const _P_CROWN = { k: '#7a4a10', y: '#f8d048', Y: '#c89010', r: '#f86048' }; // 精英金冠
const _V7_CROWN = [ // 精英金冠 8×6（ui 覆盖敌头顶，可选件）
  'yy.yy.yy',
  'yyyyyyyy',
  'yYyyyyYy',
  'yYyrryYy',
  'kYYYYYYk',
  '.kkkkkk.'];
const _P_CHEST = { k: '#4a2c10', m: '#a87848', M: '#7a5430', l: '#c89858', y: '#f8d048', Y: '#c89010', w: '#fff8c8', G: '#f8e8a0' }; // 宝箱
const _CHEST_1 = [ // 宝箱帧1（闭合：金箍+锁扣）
  '..kkkkkkkkkkkk..',
  '.kllllllllllllk.',
  '.kmmyymmyymmmmk.',
  '.kmmyymmyymmmmk.',
  '.kmmmmmmmmmmMMk.',
  '.kYYYYYYYYYYYYk.',
  '.kMMMMMMMMMMMMk.',
  '.kmmyymmyymmmmk.',
  '.kmmyymmyymmmmk.',
  '.kMMMMyyyyMMMMk.',
  '.kMMMMywwyMMMMk.',
  '.kMMMMyyyyMMMMk.',
  '.kMMMMMMMMMMMMk.',
  '..kkkkkkkkkkkk..'];
const _CHEST_2 = [ // 宝箱帧2（开启：内金光）
  '..kkkkkkkkkkkk..',
  '.kMMMMMMMMMMMMk.',
  '.kGyyyyyyyyyyGk.',
  '.kyGyyyyyyyyGyk.',
  '.kGyyyyyyyyyyGk.',
  '.kYYYYYYYYYYYYk.'].concat(_CHEST_1.slice(6)); // y6..13 同帧1
const _P_LANTERN = { k: '#4a0e0e', r: '#e84838', R: '#b02818', L: '#f88868', y: '#f8d048', w: '#fff8c8', Y: '#c89010', t: '#c8a038' }; // 灯笼
const _LANTERN_1 = [ // 灯笼帧1（内焰黄）
  '.....kk.....',
  '....kYYk....',
  '..krLLLLRk..',
  '..krLLrrRk..',
  '..krLrrrRk..',
  '..krLyyrRk..',
  '..krLyyrRk..',
  '..krryyrRk..',
  '..krrrrrRk..',
  '..krLrrrRk..',
  '..kRrrrRRk..',
  '...kRRRRk...',
  '....kYYk....',
  '.....kt.....',
  '.....tt.....',
  '....kttk....'];
const _LANTERN_2 = _LANTERN_1.slice(0, 5).concat([ // 帧2 内焰白
  '..krLywrRk..',
  '..krLwwrRk..',
  '..krrywrRk..'], _LANTERN_1.slice(8));

/* —— v7 sea/nether 装饰网格（_buildDecor 消费；摆放由引擎决定）—— */
const _V7_CORAL = [ // 珊瑚枝 12×14
  '...w....w...',
  '..kwk..kwk..',
  '..kck..kck..',
  '...kckkkck..',
  '....kCCk....',
  '....kCCk....',
  '...kcCck....',
  '...kcCck....',
  '...kCCck....',
  '...kcCck....',
  '...kcCck....',
  '...kcCCck...',
  '...kcCCck...',
  '....kkkk....'];
const _V7_SHELL = [ // 海星 10×8
  '....kk....',
  '...kwsk...',
  '...kssk...',
  'kkkksskkkk',
  'kssssssssk',
  '.ksswwssk.',
  '..kssssk..',
  '.kkk..kkk.'];
const _V7_KELP1 = [ // 海草帧1 10×16
  '......gg..',
  '.....ggG..',
  '....ggG...',
  '....ggG...',
  '...ggG....',
  '...ggGl...',
  '...ggG....',
  '..ggG.....',
  '..ggGl....',
  '..ggG.....',
  '..ggG.....',
  '.ggG......',
  '.ggGl.....',
  '.ggG......',
  '.ggG......',
  'ggG.......'];
const _V7_KELP2 = [ // 海草帧2 上半右摆
  '.......gg.',
  '......ggG.',
  '.....ggG..',
  '.....ggG..',
  '....ggG...',
  '....ggGl..',
  '....ggG...',
  '...ggG....',
  '...ggG....',
  '...ggG....',
  '..ggG.....',
  '..ggGl....',
  '..ggG.....',
  '..ggG.....',
  '.ggG......',
  '.ggG......'];
const _V7_GFLAME1 = [ // 鬼火帧1 8×10
  '...f....',
  '..kfwk..',
  '.kffwfk.',
  '.kfwffk.',
  'kfffFffk',
  'kffFFffk',
  '.kffffk.',
  '.kFffFk.',
  '..kkkk..',
  '........'];
const _V7_GFLAME2 = [ // 鬼火帧2（焰尖偏摆）
  '....f...',
  '..kfwk..',
  '.kfwffk.',
  '.kfffwk.',
  'kffFfffk',
  'kfFFfffk',
  '.kffffk.',
  '.kFffFk.',
  '..kkkk..',
  '........'];
const _V7_BONE = [ // 骸骨 14×6
  '.kk........kk.',
  'kbwk......kbwk',
  'kbbkbbbbbbkbbk',
  'kBBkbbbbbbkBBk',
  'kbwk......kbwk',
  '.kk........kk.'];

/* —— v7 Boss 调色板（蛟龙=青金 / 判官=暗紫+鬼火绿；描边=加深版禁纯黑）—— */
const _P_DRAGON = { k: '#0e2a38', S: '#1878a8', L: '#38a8d0', D: '#0f4a70', b: '#b8e8c8', m: '#0a2438', C: '#f8d048', c: '#c89010', W: '#fff8c8', t: '#68e8f0' }; // 蛟龙常态（青金）
const _P_DRAGON_RAGE = { k: '#081820', S: '#10689a', L: '#2890c0', D: '#0a3a58', b: '#a8d8c0', m: '#061828', C: '#f86838', c: '#b03018', W: '#ffd8c8', t: '#f8a030' }; // 蛟龙狂暴
const _P_DRAGON_EYE = { k: '#0e2a38', e: '#68e8f0', w: '#e8fcff' };
const _P_DRAGON_EYE_R = { k: '#081820', E: '#f86838', w: '#ffd8c8' };
const _P_DRAGON_PUPIL = { k: '#0e2a38', p: '#082838' };
const _P_DRAGON_CORE = { k: '#0e2a38', C: '#f8d048', c: '#c89010', W: '#fff8c8' };
const _P_DRAGON_CORE2 = { k: '#0e2a38', C: '#c89010', c: '#a87818', W: '#f8d048' };
const _P_DRAGON_CORE_R = { k: '#081820', C: '#f86838', c: '#b03018', W: '#ffd8c8' };
const _P_DRAGON_CORE_R2 = { k: '#081820', C: '#b03018', c: '#802010', W: '#f86838' };
const _P_JUDGE = { k: '#140a24', S: '#3a2a50', L: '#54406e', D: '#241a38', b: '#8868d8', m: '#0a0616', C: '#68e8a0', c: '#38a870', W: '#d8ffe8', t: '#68e8a0' }; // 判官常态（暗紫+鬼火绿）
const _P_JUDGE_RAGE = { k: '#0a0414', S: '#4a2038', L: '#683048', D: '#2a1020', b: '#c85888', m: '#080208', C: '#f86030', c: '#a82810', W: '#ffd8c8', t: '#f8a030' }; // 判官狂暴
const _P_JUDGE_EYE = { k: '#140a24', e: '#68e8a0', w: '#d8ffe8' };
const _P_JUDGE_EYE_R = { k: '#0a0414', E: '#f86030', w: '#ffd8c8' };
const _P_JUDGE_PUPIL = { k: '#140a24', p: '#0a0518' };
const _P_JUDGE_CORE = { k: '#140a24', C: '#68e8a0', c: '#38a870', W: '#d8ffe8' };
const _P_JUDGE_CORE2 = { k: '#140a24', C: '#38a870', c: '#207848', W: '#68e8a0' };
const _P_JUDGE_CORE_R = { k: '#0a0414', C: '#f86030', c: '#a82810', W: '#ffd8c8' };
const _P_JUDGE_CORE_R2 = { k: '#0a0414', C: '#a82810', c: '#701808', W: '#f86030' };
// v7.9：冥古龙（幽冥魔龙）调色板——骨白(b/o)对暗紫黑(S/D)的明度差是「头骨感」的唯一来源，
//   b 参与 _rasterGrid 描边、o 只做角根暗面（不描边，必被 b 包住）；t=胸口熔岩裂纹橙。
const _P_UND = { k: '#170b20', S: '#3c2748', L: '#5c3f74', D: '#241332', b: '#e6dcc6', o: '#b0a488', m: '#130a1c', t: '#f86828', W: '#fff8d8' }; // 冥古龙常态
const _P_UND_RAGE = { k: '#200710', S: '#5a2333', L: '#7e3446', D: '#340f1a', b: '#f2dcc0', o: '#c8a888', m: '#18060c', t: '#f8d048', W: '#fff8d8' }; // 冥古龙狂暴（躯干转暗血紫，裂纹转金）
const _P_UND_EYE = { k: '#170b20', e: '#f8a828', w: '#fff2c0' };
const _P_UND_EYE_R = { k: '#200710', E: '#f84838', w: '#ffd8c8' };
const _P_UND_PUPIL = { k: '#170b20', p: '#1e0c14' };
const _P_UND_CORE = { k: '#170b20', C: '#f8a020', c: '#b86010', W: '#fff0b0' };
const _P_UND_CORE2 = { k: '#170b20', C: '#d88018', c: '#8a4008', W: '#f8c858' };
const _P_UND_CORE_R = { k: '#200710', C: '#f84828', c: '#a81808', W: '#ffd8a0' };
const _P_UND_CORE_R2 = { k: '#200710', C: '#c83018', c: '#701008', W: '#f88848' };
// v7.9：曜光·圣裁者调色板——纯白/淡金圣袍，描边走暖金（白袍配黑描边会脏，且项目红线禁纯黑）；
//   b=淡金（参与描边，用于光环/羽翼/饰带），m=暗金（胸腔插座），t=圣光斑。
const _P_SERA = { k: '#a8843c', S: '#ece2c8', L: '#fffaf0', D: '#cab894', b: '#f8d878', o: '#d8b060', m: '#6a5220', t: '#ffe9a0', W: '#ffffff' }; // 圣裁者常态（象牙白圣袍+淡金）
const _P_SERA_RAGE = { k: '#8a5a1c', S: '#f8d888', L: '#fff8d0', D: '#d8a040', b: '#fff0a0', o: '#e8b850', m: '#7a4a10', t: '#fff8c8', W: '#ffffff' }; // 圣裁者狂暴（转炽金）
const _P_SERA_EYE = { k: '#a8843c', e: '#fff4c0', w: '#ffffff' };
const _P_SERA_EYE_R = { k: '#8a5a1c', E: '#ff9020', w: '#fff8e0' };
const _P_SERA_PUPIL = { k: '#f0dc9c', p: '#fff8d8' }; // 面具无眼珠：瞳孔+描边都用近白色（ui 恒画瞳，深色瞳环会读成护目镜）
const _P_SERA_CORE = { k: '#a8843c', C: '#f8d878', c: '#c8a040', W: '#fffdf0' };
const _P_SERA_CORE2 = { k: '#a8843c', C: '#e0b850', c: '#a88018', W: '#f8f0c0' };
const _P_SERA_CORE_R = { k: '#8a5a1c', C: '#fff0a0', c: '#f8a830', W: '#ffffff' };
const _P_SERA_CORE_R2 = { k: '#8a5a1c', C: '#f8c060', c: '#d88020', W: '#fff8d8' };
// v12：烈焰·牛魔王调色板——lava 主题「暗红炭黑躯 + 橙金角甲 + 熔岩裂纹」。
//   描边 k 用深棕红（#2c0e12，色相≈355°，明度极低但有暖相，禁纯黑）；
//   S/L/D = 躯体三阶（D 暗红炭黑 → S 暗红 → L 受光橙红），b/o = 角与肩甲金铜两阶
//   （b 参与 _rasterGrid 描边，o 只做甲面暗部、必须被 b 包住），m = 炉腔/口腔（比 D 更暗更暖，
//   由 b 金框围住才不糊进描边），t = 熔岩裂纹，W = 獠牙/角尖/铆钉（最亮一档）。
const _P_NIU = { k: '#2c0e12', S: '#5e2a24', L: '#8e4630', D: '#361417', b: '#d8863a', o: '#9c5c1c', m: '#1e0a0c', t: '#ff8a28', W: '#ffe8b0' }; // 牛魔王常态
const _P_NIU_RAGE = { k: '#300808', S: '#82301c', L: '#b85026', D: '#4a1410', b: '#f8b03c', o: '#c07818', m: '#260606', t: '#ffe048', W: '#fff8d8' }; // 牛魔王狂暴（躯干转亮血橙，裂纹转金）
const _P_NIU_EYE = { k: '#2c0e12', e: '#f8d048', w: '#fff8d8' };   // 常态金瞳
const _P_NIU_EYE_R = { k: '#300808', E: '#ff5028', w: '#ffe0b0' };  // 狂暴赤瞳
const _P_NIU_PUPIL = { k: '#2c0e12', p: '#2a0a08' };                // 深棕红瞳（牛眼：瞳大才会读成兽）
const _P_NIU_CORE = { k: '#2c0e12', C: '#ff9020', c: '#c04c08', W: '#fff0b0' };
const _P_NIU_CORE2 = { k: '#2c0e12', C: '#e07018', c: '#943004', W: '#f8c060' };
const _P_NIU_CORE_R = { k: '#300808', C: '#ffb020', c: '#d04010', W: '#fff8d8' };
const _P_NIU_CORE_R2 = { k: '#300808', C: '#f08818', c: '#a02808', W: '#ffe080' };

/* —— v7 Boss 身体程序化画法（行跨+椭圆，沿 _buildBossBody 十步口径：填充→明暗→描边→光栅；狂暴=同网格换装）—— */
function _rimShade(G, set, get, xFrom, y0, y1, dith) { // 内部：Boss 右下缘 2px 阴影带（dith=第三像素棋盘）
  const W = G[0].length;
  for (let y = y0; y <= y1; y++) {
    let xr = -1;
    for (let x = W - 1; x > xFrom; x--) { const ch = get(x, y); if (ch === 'S' || ch === 'L') { xr = x; break; } }
    if (xr < 0) continue;
    set(xr, y, 'D');
    if (get(xr - 1, y) === 'S' || get(xr - 1, y) === 'L') set(xr - 1, y, 'D');
    if (dith && get(xr - 2, y) === 'S' && ((xr + y) & 1) === 0) set(xr - 2, y, 'D');
  }
}
function _rasterGrid(G, pal) { // 内部：Boss 网格收尾（描边 4 邻空→k + 调色板光栅）
  const H = G.length, W = G[0].length;
  const get = function (x, y) { return (x >= 0 && x < W && y >= 0 && y < H) ? G[y][x] : '.'; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = G[y][x];
    if (ch !== 'S' && ch !== 'L' && ch !== 'D' && ch !== 'b') continue;
    if (get(x - 1, y) === '.' || get(x + 1, y) === '.' || get(x, y - 1) === '.' || get(x, y + 1) === '.') G[y][x] = 'k';
  }
  const c = _makeCanvas(W, H), g = c.getContext('2d');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = G[y][x];
    if (ch !== '.' && pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); }
  }
  return c;
}
function _buildDragonBody(pal) { // 内部：蛟龙身体 64×40（长躯+背鳍棘+腹甲+鳍桩；core 覆盖 (26,16)）
  const W = 64, H = 40;
  const G = [];
  for (let y = 0; y < H; y++) G.push(new Array(W).fill('.'));
  const set = function (x, y, ch) { if (x >= 0 && x < W && y >= 0 && y < H) G[y][x] = ch; };
  const get = function (x, y) { return (x >= 0 && x < W && y >= 0 && y < H) ? G[y][x] : '.'; };
  const top = new Array(W).fill(-1);
  // ① 躯干宽椭圆 (31,18) rx30 ry12
  for (let y = 6; y <= 30; y++) {
    const t = (y - 18) / 12;
    const hw = Math.round(30 * Math.sqrt(Math.max(0, 1 - t * t)));
    if (hw < 1) continue;
    for (let x = 31 - hw; x <= 30 + hw; x++) { if (G[y][x] === '.') G[y][x] = 'S'; if (top[x] < 0) top[x] = y; }
  }
  // ② 背鳍棘 5 枚
  [12, 22, 32, 42, 52].forEach(function (cx) {
    const ty = top[cx];
    if (ty < 1) return;
    set(cx, ty - 3, 'L');
    for (let dx = -1; dx <= 1; dx++) set(cx + dx, ty - 2, 'L');
    for (let dx = -2; dx <= 2; dx++) if (get(cx + dx, ty - 1) === '.') set(cx + dx, ty - 1, 'L');
  });
  // ③ 腹甲椭圆 + 肋线 D 三道
  for (let y = 23; y <= 37; y++) {
    const t = (y - 30) / 7;
    const hw = Math.round(22 * Math.sqrt(Math.max(0, 1 - t * t)));
    if (hw < 1) continue;
    for (let x = 31 - hw; x <= 30 + hw; x++) G[y][x] = 'b';
  }
  for (let x = 12; x <= 50; x++) {
    if (G[28][x] === 'b') G[28][x] = 'D';
    if (G[32][x] === 'b') G[32][x] = 'D';
    if (G[36][x] === 'b') G[36][x] = 'D';
  }
  // ④ 鳍桩（四肢残鳍）y36..39，底行 D
  for (let y = 36; y <= 39; y++) {
    for (let x = 16; x <= 25; x++) G[y][x] = 'S';
    for (let x = 38; x <= 47; x++) G[y][x] = 'S';
  }
  for (let x = 16; x <= 25; x++) G[39][x] = 'D';
  for (let x = 38; x <= 47; x++) G[39][x] = 'D';
  // ⑤ 龙珠座 m
  for (let y = 16; y <= 27; y++) for (let x = 26; x <= 37; x++) G[y][x] = 'm';
  // ⑥ 眼窝 D
  for (let y = 8; y <= 17; y++) {
    for (let x = 12; x <= 23; x++) G[y][x] = 'D';
    for (let x = 40; x <= 51; x++) G[y][x] = 'D';
  }
  // ⑦ 裂纹 t
  [[20, 8], [21, 9], [42, 7], [43, 8], [31, 7], [32, 8]].forEach(function (p) { set(p[0], p[1], 't'); });
  // ⑧ 明暗：受光带+右下阴影缘（_rimShade/_rasterGrid）
  for (let x = 0; x < 31; x++) {
    const tp = top[x];
    if (tp < 0) continue;
    for (let y = tp; y <= tp + 3; y++) if (get(x, y) === 'S') set(x, y, 'L');
    if (get(x, tp + 4) === 'S' && ((x + tp + 4) & 1) === 0) set(x, tp + 4, 'L');
  }
  _rimShade(G, set, get, 31, 12, 29, true);
  return _rasterGrid(G, pal);
}
function _buildJudgeBody(pal) { // 内部：判官身体 40×52（官帽+兜帽虚影+高袍摆缘；core 覆盖 (14,26)）
  const W = 40, H = 52;
  const G = [];
  for (let y = 0; y < H; y++) G.push(new Array(W).fill('.'));
  const set = function (x, y, ch) { if (x >= 0 && x < W && y >= 0 && y < H) G[y][x] = ch; };
  const get = function (x, y) { return (x >= 0 && x < W && y >= 0 && y < H) ? G[y][x] : '.'; };
  // ① 官帽：冠 y0..2 x∈[14,25] + 两翼 x∈[9,13]∪[26,30]
  for (let y = 0; y <= 2; y++) for (let x = 14; x <= 25; x++) G[y][x] = 'S';
  for (let y = 1; y <= 2; y++) {
    for (let x = 9; x <= 13; x++) G[y][x] = 'S';
    for (let x = 26; x <= 30; x++) G[y][x] = 'S';
  }
  // ② 兜帽/头：椭圆 中心(19,12) rx=12 ry=9（y3..21）
  for (let y = 3; y <= 21; y++) {
    const t = (y - 12) / 9;
    const hw = Math.round(12 * Math.sqrt(Math.max(0, 1 - t * t)));
    if (hw < 1) continue;
    for (let x = 19 - hw; x <= 18 + hw; x++) if (G[y][x] === '.') G[y][x] = 'S';
  }
  // ③ 脸部虚影 m
  for (let y = 8; y <= 18; y++) for (let x = 8; x <= 31; x++) if (G[y][x] === 'S') G[y][x] = 'm';
  // ④ 眼窝 D
  for (let y = 8; y <= 16; y++) {
    for (let x = 8; x <= 17; x++) G[y][x] = 'D';
    for (let x = 22; x <= 31; x++) G[y][x] = 'D';
  }
  // ⑤ 高袍梯形；⑥ 肩垫 y17..21
  for (let y = 20; y <= 45; y++) {
    const hw = 10 + Math.round((y - 20) * 7 / 25);
    for (let x = 19 - hw; x <= 18 + hw; x++) G[y][x] = 'S';
  }
  for (let y = 17; y <= 21; y++) {
    for (let x = 5; x <= 10; x++) if (G[y][x] === '.') G[y][x] = 'S';
    for (let x = 29; x <= 34; x++) if (G[y][x] === '.') G[y][x] = 'S';
  }
  // ⑦ 摆缘+底行 D；⑧ 官印座 m
  for (let y = 46; y <= 47; y++) for (let x = 3; x <= 36; x++) G[y][x] = 'S';
  for (let y = 48; y <= 51; y++) for (let x = 5; x <= 34; x++) G[y][x] = 'S';
  for (let x = 5; x <= 34; x++) G[51][x] = 'D';
  for (let y = 26; y <= 37; y++) for (let x = 14; x <= 25; x++) G[y][x] = 'm';
  // ⑨ 鬼火镶边+侧缝 D
  for (let x = 12; x <= 27; x++) if (G[22][x] === 'S') G[22][x] = 't';
  for (let x = 6; x <= 33; x++) if (G[46][x] === 'S') G[46][x] = 't';
  for (let y = 25; y <= 45; y++) { G[y][11] = 'D'; G[y][28] = 'D'; }
  // ⑩ 明暗：左上受光带+右缘阴影（_rimShade/_rasterGrid）
  for (let x = 0; x < 20; x++) {
    let tp = -1;
    for (let y = 0; y < H; y++) if (G[y][x] === 'S') { tp = y; break; }
    if (tp < 0) continue;
    for (let y = tp; y <= tp + 2; y++) if (get(x, y) === 'S') set(x, y, 'L');
  }
  _rimShade(G, set, get, 20, 24, 45, false);
  return _rasterGrid(G, pal);
}
/* v7.9：冥古龙 64×48 —— 与蛟龙（boss2）刻意反向构图：
 *   蛟龙=横向长条躯+东方长须；冥古龙=正面骨白头骨（深眼窝+骨鼻）+下垂破翼+四足站姿，
 *   躯干暗紫黑裹一圈骨肋骨、胸口熔岩腔。剪影第一眼就与蛟龙分得开（横条 vs 宽颅）。
 *   叠加契约：eye 覆盖 (8,10)/(44,10) 12×10 → 眼窝 D 铺 x6..21 / x42..57 y9..20；
 *   jaw 覆盖 (16,36)/(22,36) 20×8 → 口部腔 m 铺 x16..41 y36..43（两种 x 偏移都落在腔内）；
 *   core 12×12 覆盖 (20,20)/(26,20) → 熔岩腔 m 铺 x19..37 y20..33（两种都落在腔内）。 */
function _buildUnderDragonBody(pal) { // 内部：冥古龙身体 64×48（骨角骨颅+破翼+骨肋胸腔+四足；见上方叠加契约）
  const W = 64, H = 48;
  const G = [];
  for (let y = 0; y < H; y++) G.push(new Array(W).fill('.'));
  const set = function (x, y, ch) { if (x >= 0 && x < W && y >= 0 && y < H) G[y][x] = ch; };
  const get = function (x, y) { return (x >= 0 && x < W && y >= 0 && y < H) ? G[y][x] : '.'; };
  const box = function (x0, y0, x1, y1, ch) { // 只覆盖已有像素（不把色块刷到轮廓外）
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (get(x, y) !== '.') set(x, y, ch);
  };
  const ln = function (x0, y0, x1, y1, ch) { // Bresenham 1px 硬线（骨指/裂纹）
    let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, x = x0, y = y0;
    for (;;) {
      set(x, y, ch);
      if (x === x1 && y === y1) break;
      const e2 = err * 2;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  };
  const mfill = function (pts, ch) { // 扫描线填多边形 + 左右镜像（翼膜/角这类斜边形状）
    let ylo = H, yhi = -1;
    pts.forEach(function (p) { if (p[1] < ylo) ylo = p[1]; if (p[1] > yhi) yhi = p[1]; });
    for (let y = Math.max(0, ylo); y <= Math.min(H - 1, yhi); y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      if (xs.length < 2) continue;
      const xa = Math.round(Math.min.apply(null, xs)), xb = Math.round(Math.max.apply(null, xs));
      for (let x = xa; x <= xb; x++) { set(x, y, ch); set(W - 1 - x, y, ch); }
    }
  };
  // ① 破翼（先画=身后层）：单片翼膜（前缘上斜、后缘撕出两个尖）+ 前缘 2px 骨脊 + 2 根指骨 + 1 洞。
  //    形制是「蝙蝠破翼」：翼指分明、膜面成片——上一版指骨太密，1x 下会读成白色碎屑
  mfill([[18, 20], [0, 26], [6, 34], [2, 40], [14, 44], [18, 36]], 'S');
  mfill([[18, 30], [6, 34], [2, 40], [14, 44], [18, 38]], 'D'); // 下半膜面转暗（受光在上）
  ln(18, 20, 0, 26, 'b'); ln(18, 21, 0, 27, 'b');               // 前缘骨脊
  ln(18, 22, 0, 27, 'D');
  ln(0, 27, 6, 33, 'b'); ln(W - 1 - 0, 27, W - 1 - 6, 33, 'b');  // 指骨 1（2px 粗）
  ln(0, 28, 6, 34, 'b'); ln(W - 1 - 0, 28, W - 1 - 6, 34, 'b');
  ln(2, 40, 11, 44, 'b'); ln(W - 1 - 2, 40, W - 1 - 11, 44, 'b'); // 后缘一根短指骨（再多会读成白色划痕）
  [[9, 29], [10, 29], [9, 30], [12, 38], [13, 38]].forEach(function (p) { // 破洞（只挖膜面，不挖骨）
    if (get(p[0], p[1]) !== 'b') set(p[0], p[1], '.');
    if (get(W - 1 - p[0], p[1]) !== 'b') set(W - 1 - p[0], p[1], '.');
  });
  // ② 躯干（暗紫）：y20..43，半宽 12→18→14（肩宽于颈、腹微收）
  [[20, 12], [21, 14], [22, 16], [23, 17], [24, 18], [25, 18], [26, 18], [27, 17], [28, 17], [29, 17],
   [30, 17], [31, 17], [32, 18], [33, 18], [34, 18], [35, 18], [36, 18], [37, 18], [38, 18], [39, 17],
   [40, 17], [41, 16], [42, 15], [43, 14]
  ].forEach(function (r) {
    for (let x = 32 - r[1]; x <= 31 + r[1]; x++) if (get(x, r[0]) === '.') set(x, r[0], 'S');
  });
  // ③ 骨白头骨 y3..20：逐行半宽；y10 起满 25，保证双眼覆盖区 y10..19 x8..55 整块落在骨内
  [[3, 5], [4, 8], [5, 11], [6, 14], [7, 17], [8, 19], [9, 22], [10, 25], [11, 26], [12, 26], [13, 26],
   [14, 26], [15, 26], [16, 26], [17, 25], [18, 24], [19, 23], [20, 21]
  ].forEach(function (r) {
    for (let x = 32 - r[1]; x <= 31 + r[1]; x++) if (get(x, r[0]) === '.') set(x, r[0], 'b');
  });
  // ④ 眼窝 D（比 12×10 覆盖区各向外留 1px，eye 叠上后四周有暗框）
  box(6, 9, 21, 20, 'D'); box(42, 9, 57, 20, 'D');
  // ⑤ 骨鼻：双眼之间空档中央挖鼻腔 m（x28..35 y13..18），下方 y19..20 留骨梁隔开胸腔
  box(28, 13, 35, 18, 'm');
  for (let y = 12; y <= 19; y++) { if (get(27, y) === 'b') set(27, y, 'o'); if (get(36, y) === 'b') set(36, y, 'o'); }
  // ⑥ 双角 + 冠刺（根粗 8px→尖 3px，向上外弯）
  for (let y = 0; y <= 9; y++) {
    const t = (9 - y) / 9;
    const xOut = Math.round(19 - 12 * t), xIn = Math.round(12 - 8 * t);
    for (let x = xIn; x <= xOut; x++) { set(x, y, 'b'); set(W - 1 - x, y, 'b'); }
  }
  for (let y = 0; y <= 3; y++) { set(30, y, 'b'); set(31, y, 'b'); set(32, y, 'b'); set(33, y, 'b'); } // 冠刺
  // ⑦ 熔岩核心腔 m（x19..37 y20..33）+ 骨肋骨 3 对（2px 粗，围住腔体两侧）
  box(19, 20, 37, 33, 'm');
  [23, 27, 31].forEach(function (y) {
    for (let x = 14; x <= 18; x++) { if (get(x, y) !== '.') set(x, y, 'b'); if (get(x, y + 1) !== '.') set(x, y + 1, 'b'); }
    for (let x = 38; x <= 42; x++) { if (get(x, y) !== '.') set(x, y, 'b'); if (get(x, y + 1) !== '.') set(x, y + 1, 'b'); }
  });
  // ⑧ 上颚獠牙：只留在口角两侧（x14..17 / x38..43）——居中再排一排会与 jaw 覆盖层的牙重复
  [[14, 17], [38, 43]].forEach(function (seg) {
    for (let x = seg[0]; x <= seg[1]; x += 3) {
      for (let y = 33; y <= 35; y++) { if (get(x, y) !== '.') set(x, y, 'b'); if (get(x + 1, y) !== '.') set(x + 1, y, 'b'); }
    }
  });
  box(16, 36, 41, 43, 'm'); // 口腔腔体（容两种 jaw 偏移）
  // ⑨ 熔岩裂纹 t：自熔岩腔向躯干外侧放射（狂暴态由调色板把 t 换成金）
  [[19, 24, 11, 28], [19, 29, 12, 34], [37, 22, 45, 26], [37, 27, 47, 31], [37, 32, 44, 37],
   [21, 34, 17, 39], [35, 34, 39, 39]].forEach(function (p) { ln(p[0], p[1], p[2], p[3], 't'); });
  // ⑩ 四足（y44..47 四根粗桩 + 骨白爪）
  [[12, 19], [24, 30], [34, 40], [45, 52]].forEach(function (f) {
    for (let y = 44; y <= 46; y++) for (let x = f[0]; x <= f[1]; x++) if (get(x, y) === '.') set(x, y, 'S');
    for (let x = f[0]; x <= f[1]; x++) if (get(x, 46) === 'S') set(x, 46, 'D');   // 足底暗
    for (let x = f[0] + 1; x <= f[1] - 1; x += 3) { set(x, 47, 'b'); set(x + 1, 47, 'b'); } // 爪
  });
  // ⑪ 明暗：左上受光带 L（每列首个 S 起 3 行 + 带缘棋盘）+ 右下缘 _rimShade
  for (let x = 0; x < 32; x++) {
    let tp = -1;
    for (let y = 0; y < H; y++) if (G[y][x] === 'S') { tp = y; break; }
    if (tp < 0) continue;
    for (let y = tp; y <= tp + 2; y++) if (get(x, y) === 'S') set(x, y, 'L');
    if (get(x, tp + 3) === 'S' && ((x + tp + 3) & 1) === 0) set(x, tp + 3, 'L');
  }
  _rimShade(G, set, get, 32, 20, 43, true);
  return _rasterGrid(G, pal);
}
/* v7.9：曜光·圣裁者 44×52 —— 与判官（boss3）形成明暗对立：判官=暗紫长袍+官帽+鬼火绿；
 *   圣裁者=象牙白圣袍+悬浮金环+金羽光翼+金色发光面具。面具刻意不挖暗眼窝：
 *   发光面具的「无眼珠」靠亮板 + 近白瞳孔（_P_SERA_PUPIL）实现，挖黑窝会变回判官那张脸。
 *   层次（自上而下）：悬浮光环 → 金冠三尖 → 金面具（即头部）→ 窄颈巾 → 白袍肩（两肩外侧各一小段金线）→
 *   胸腔圣龛（对称金胸甲板，核心落在板上）→ 收腰 → 金腰封 → 白裙摆。刻意收腰+收颈、肩线只留 2px 金线，
 *   且光翼压到腰线以下（y30 起）以避开 ui 手臂覆盖区（y12..27，白色手臂会和白袍肩糊成一片）；
 *   否则 44×52 的正面人形会整体读成一只花瓶（v7.9 目检第 2 版的实际教训）。
 *   叠加契约：eye 覆盖 (8,10)/(24,10) 12×10 → 直接落在金色面具板上（不挖窝）；
 *   jaw 覆盖 (16,36)/(12,36) 20×8 → 金腰封正中（腰封铺 x8..35 y35..44，作徽记底）；
 *   core 12×12 覆盖 (20,20)/(16,20) → 金胸甲板铺 x13..32 y21..33（两种偏移都落在板内）。 */
function _buildSeraphBody(pal) { // 内部：圣裁者身体 44×52（光环+金羽光翼+金面具+白袍+金腰封；见上方叠加契约）
  const W = 44, H = 52;
  const G = [];
  for (let y = 0; y < H; y++) G.push(new Array(W).fill('.'));
  const set = function (x, y, ch) { if (x >= 0 && x < W && y >= 0 && y < H) G[y][x] = ch; };
  const get = function (x, y) { return (x >= 0 && x < W && y >= 0 && y < H) ? G[y][x] : '.'; };
  const box = function (x0, y0, x1, y1, ch) { // 只覆盖已有像素（不把色块刷到轮廓外）
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (get(x, y) !== '.') set(x, y, ch);
  };
  const mfill = function (pts, ch) { // 扫描线填多边形 + 左右镜像（羽片）
    let ylo = H, yhi = -1;
    pts.forEach(function (p) { if (p[1] < ylo) ylo = p[1]; if (p[1] > yhi) yhi = p[1]; });
    for (let y = Math.max(0, ylo); y <= Math.min(H - 1, yhi); y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      if (xs.length < 2) continue;
      const xa = Math.round(Math.min.apply(null, xs)), xb = Math.round(Math.max.apply(null, xs));
      for (let x = xa; x <= xb; x++) { set(x, y, ch); set(W - 1 - x, y, ch); }
    }
  };
  // ① 光翼（先画=身后层）：每侧三片金羽，羽缘 1px L 白尖——金羽白尖读作「光翼」
  mfill([[9, 30], [0, 34], [9, 39]], 'D');
  mfill([[9, 37], [1, 41], [9, 46]], 'D');
  mfill([[9, 44], [4, 49], [9, 50]], 'D');
  for (let y = 30; y <= 50; y++) { // 每行最外两格转 b 金羽尖（金只在尖上，膜面留暖灰）
    let xl = -1;
    for (let x = 0; x <= 9; x++) if (get(x, y) === 'D') { xl = x; break; }
    if (xl >= 0 && xl < 9) {
      set(xl, y, 'b'); set(W - 1 - xl, y, 'b');
      if (xl + 1 < 9) { set(xl + 1, y, 'D'); }
    }
  }
  // ② 悬浮光环：椭圆环 y0..6（外 rx13 ry3 / 内 rx7 ry2），必须真中空，
  //    且与头顶之间留 1 行空隙（y7 只有冠尖）——否则 1x 下读成「帽子」
  [[0, 7, 0], [1, 11, 4], [2, 13, 7], [3, 13, 7], [4, 13, 7], [5, 11, 4], [6, 7, 0]].forEach(function (r) {
    for (let x = 22 - r[1]; x <= 21 + r[1]; x++) {
      if (r[2] && Math.abs(x - 21.5) <= r[2] - 0.5) continue;
      set(x, r[0], 'b');
    }
  });
  for (let x = 10; x <= 16; x++) set(x, 1, 'L');
  // ③ 白袍主体：肩 y22..26（半宽 14）→ 收腰 y27..34（12→11）→ 腰封区 y35..44（12）→ 裙摆 y45..51（13→15）
  for (let y = 22; y <= 51; y++) {
    let hw;
    if (y <= 26) hw = 14;
    else if (y <= 29) hw = 12;
    else if (y <= 34) hw = 11;
    else if (y <= 44) hw = 12;
    else if (y <= 48) hw = 13;
    else hw = 15;
    for (let x = 22 - hw; x <= 21 + hw; x++) if (get(x, y) === '.') set(x, y, 'S');
  }
  // ④ 颈巾：x11..32 y20..23（比面具窄、比肩窄，把「头 / 肩」断开——花瓶感就消失在这两行）
  for (let y = 20; y <= 23; y++) for (let x = 11; x <= 32; x++) if (get(x, y) === '.') set(x, y, 'S');
  // ⑤ 肩线：只在两肩外侧各画一小段金线（x8..14 / x29..35 y23..24）。
  //    不做贯通全宽的金领：core 恒在 y20..31，全宽金领会横穿胸饰（目检第 5 版实拍即此症）
  [[8, 12], [31, 35]].forEach(function (seg) {
    for (let y = 23; y <= 24; y++) for (let x = seg[0]; x <= seg[1]; x++) if (get(x, y) === 'S') set(x, y, 'b');
    for (let x = seg[0] + 2; x <= seg[1] - 2; x++) if (get(x, 25) === 'S' && (x & 1) === 0) set(x, 25, 'o');
  });
  // ⑥ 金面具（盾形，即头部）：y9..21 逐行跨度；上缘+侧棱+中脊 L 高光
  [[9, 13, 30], [10, 9, 34], [11, 7, 36], [12, 7, 36], [13, 7, 36], [14, 7, 36], [15, 7, 36],
   [16, 7, 36], [17, 8, 35], [18, 8, 35], [19, 10, 33], [20, 13, 30], [21, 16, 27]
  ].forEach(function (r) { for (let x = r[1]; x <= r[2]; x++) set(x, r[0], 'b'); });
  for (let x = 12; x <= 31; x++) set(x, 9, 'L');                      // 额缘高光
  for (let y = 10; y <= 20; y++) { set(21, y, 'L'); set(22, y, 'L'); } // 中脊
  for (let y = 11; y <= 16; y++) { set(8, y, 'L'); set(35, y, 'L'); }  // 侧棱
  for (let y = 12; y <= 20; y++) { if (get(9, y) === 'b') set(9, y, 'o'); if (get(34, y) === 'b') set(34, y, 'o'); } // 金暗面
  for (let x = 17; x <= 26; x++) if (get(x, 20) === 'b') set(x, 20, 'o');  // 下颏暗面
  // ⑦ 金冠三尖（y7..8）：左中右，只有两行——头顶与光环之间的「空行」靠它保持通透
  [[10, 13], [20, 23], [30, 33]].forEach(function (s) {
    for (let x = s[0]; x <= s[1]; x++) set(x, 8, 'b');
    set(s[0] + 1, 7, 'b'); set(s[0] + 2, 7, 'b');
  });
  // ⑧ 胸腔圣龛：金菱环 + 核心（环心对齐 core 的实际落点 b.x+20，即 44 宽体上偏右 4px 处）。
  //    为什么不做「对称胸甲」：44 宽在腰段只有 22~24px 净宽，而 core 右缘已在 x31，
  //    任何以体轴为中心的板/框都放不下对称余量，硬做只会让宝石顶到金边（目检第 5 版实拍）。
  //    改成「环=围绕宝石自身」后，环与宝石必然同心，偏 4px 只是整枚胸饰略偏右（= boss3 的 +6 同族容差）。
  for (let y = 20; y <= 32; y++) {
    const k = Math.round(6 * (1 - Math.abs(y - 26) / 6));
    const xa = Math.round(25.5 - k), xb = Math.round(25.5 + k);
    set(xa, y, 'b'); set(xb, y, 'b');
    if (y === 20 || y === 26 || y === 32) { set(xa + 1, y, 'b'); set(xb - 1, y, 'b'); } // 上下尖/腰线加粗
  }
  [[26, 20], [26, 32]].forEach(function (p) { if (get(p[0], p[1]) === 'b') set(p[0], p[1], 'L'); }); // 尖点高光
  [[18, 24], [18, 28], [15, 26], [14, 23], [14, 29]].forEach(function (p) { // 胸饰左侧圣光点（补白，不抢宝石）
    if (get(p[0], p[1]) === 'S') set(p[0], p[1], 't');
  });
  // ⑨ 金腰封：y35..44（jaw 覆盖层落在正中=腰封徽记）+ 下缘 D
  box(8, 35, 35, 44, 'b');
  for (let x = 8; x <= 35; x++) if (get(x, 44) === 'b') set(x, 44, 'D');
  // ⑩ 摆缘：y48..49 金边 + y51 底缘 D + 中央竖金带（x20..23 y45..50）
  for (let x = 5; x <= 38; x++) {
    if (get(x, 49) === 'S') set(x, 49, 'b');
    if (get(x, 51) === 'S') set(x, 51, 'D');
  }
  for (let y = 45; y <= 48; y++) { if (get(21, y) === 'S') set(21, y, 'b'); if (get(22, y) === 'S') set(22, y, 'b'); }
  // ⑪ 圣光斑 t：面具额心 + 双肩甲 + 龛沿（发光体的「光」靠这几粒读出来）
  [[21, 12], [22, 12], [21, 13], [22, 13], [10, 23], [33, 23],
   [15, 28], [28, 28], [15, 29], [28, 29]].forEach(function (p) { if (get(p[0], p[1]) !== '.') set(p[0], p[1], 't'); });
  // ⑫ 明暗：左上受光带 L（每列首个 S 起 2 行）+ 右下 _rimShade
  for (let x = 0; x < 22; x++) {
    let tp = -1;
    for (let y = 0; y < H; y++) if (G[y][x] === 'S') { tp = y; break; }
    if (tp < 0) continue;
    for (let y = tp; y <= tp + 1; y++) if (get(x, y) === 'S') set(x, y, 'L');
  }
  _rimShade(G, set, get, 22, 22, 50, false);
  return _rasterGrid(G, pal);
}
/* v12：烈焰·牛魔王 56×48 —— 与冥古龙（boss4，骨白颅+破翼+四足）刻意反向构图：
 *   牛魔王=正面牛头（双弯金角 + 压眉骨 + 熔核炉口 + 厚重尖刺肩甲），下半身只留下巴与熔岩基座，
 *   剪影第一眼是「双角 + 宽颅 + 两坨肩甲」，与 boss4 的「骨颅 + 破翼」不撞眼，
 *   也与 boss5（窄体圣袍）在宽高比上直接分开（56 宽 vs 44 宽）。
 *   叠加契约（ui 按 kind 索引统一装配，偏移是 ui 侧冻结值，不可改）：
 *     eye 12×10 覆盖 (8,10)/(36,10) → 眼窝 D 铺 x5..21 / x34..49、y9..20（四周留 ≥2px 暗框）；
 *     jaw 20×8 覆盖 (16,36)        → 口腔腔体 m 铺 x12..43、y36..43（口角獠牙 x12..15 / x40..43 在覆盖区外）；
 *     core 12×12 覆盖 (20,20)      → 直接嵌在口鼻暗板 D 上（板 x16..35 y21..34；核心首行全透明，可见像素从 y21 起）。
 *   光源左上：躯体受光带 L 在左上缘、_rimShade 把右下缘压暗；金角/金甲各自「左上受光 + 右下暗面」。
 *   描边全部由 _rasterGrid 统一打（S/L/D/b 4 邻空→k），故 m/t/o/W 必须整块被 b 或 S 包住。 */
function _buildBullDemonBody(pal) { // 内部：牛魔王身体 56×48（双弯角+牛头+熔核炉口+尖刺肩甲+熔岩基座）
  const W = 56, H = 48;
  const G = [];
  for (let y = 0; y < H; y++) G.push(new Array(W).fill('.'));
  const set = function (x, y, ch) { if (x >= 0 && x < W && y >= 0 && y < H) G[y][x] = ch; };
  const get = function (x, y) { return (x >= 0 && x < W && y >= 0 && y < H) ? G[y][x] : '.'; };
  const both = function (x, y, ch) { set(x, y, ch); set(W - 1 - x, y, ch); }; // 左右镜像（体轴 x=27.5）
  const box = function (x0, y0, x1, y1, ch) { // 只覆盖已有像素（不把色块刷到轮廓外）
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (get(x, y) !== '.') set(x, y, ch);
  };
  const crack = function (x0, y0, x1, y1) { // 熔岩裂纹（Bresenham）：只咬躯体三阶，且不落到轮廓边缘——
    // 落到边缘的 t 不参与描边，会在剪影上开一个「无描边的 1px 洞」
    let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, x = x0, y = y0;
    for (;;) {
      const c = get(x, y);
      if ((c === 'S' || c === 'L' || c === 'D') && get(x - 1, y) !== '.' && get(x + 1, y) !== '.' &&
          get(x, y - 1) !== '.' && get(x, y + 1) !== '.') set(x, y, 't');
      if (x === x1 && y === y1) break;
      const e2 = err * 2;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  };
  // ① 双弯角（先画=最底层，角根随后被头骨压住）：从左下角根斜扫到画布左上角的尖月牙——y0 只有
  //    1~2px 尖、到 y8 已 11px 宽，外缘在 y2..5 压到 x0（牛角是「先外张、再上翘」，不是一条直斜线）。
  //    受光恒在左缘：左角=外缘、右角=内缘（镜像后光仍来自左上）；o 只落暗侧内缘，绝不出轮廓。
  [[0, 2, 2], [1, 1, 3], [2, 0, 4], [3, 0, 5], [4, 0, 7], [5, 0, 9], [6, 1, 11],
   [7, 3, 13], [8, 5, 15], [9, 7, 17], [10, 9, 18], [11, 11, 19]
  ].forEach(function (r) {
    const y = r[0], xa = r[1], xb = r[2];
    for (let x = xa; x <= xb; x++) { set(x, y, 'b'); set(W - 1 - x, y, 'b'); }
    if (xb - xa >= 3) { set(xa + 1, y, 'W'); set(W - xb, y, 'W'); }   // 左上受光内缘
    if (xb - xa >= 4) { set(xb, y, 'o'); set(W - 1 - xa, y, 'o'); }   // 暗侧内缘
  });
  // ② 头骨：逐行半宽。顶端（y4..9）刻意收窄到 12~18 半宽，把 y0..8 整段让给牛角——
  //    上一版头骨在 y8 就铺到 8..47，牛角只剩 2px 露在外面，1x 下读成「圆耳朵」。
  //    y13..16 最宽（额甲+颊甲）→ y21..26 收成口鼻段 → y32..34 下颌再度外张（宽颅/窄吻/阔颚的沙漏）。
  [[4, 6], [5, 8], [6, 10], [7, 12], [8, 14], [9, 16], [10, 19], [11, 21], [12, 22], [13, 22],
   [14, 22], [15, 22], [16, 22], [17, 22], [18, 21], [19, 20], [20, 20], [21, 19], [22, 19],
   [23, 18], [24, 18], [25, 18], [26, 18], [27, 19], [28, 20], [29, 21], [30, 22], [31, 22],
   [32, 23], [33, 23], [34, 23], [35, 22], [36, 21], [37, 20], [38, 19], [39, 18], [40, 17],
   [41, 16], [42, 15], [43, 14]
  ].forEach(function (r) {
    for (let x = 27 - r[1]; x <= 28 + r[1]; x++) if (get(x, r[0]) === '.') G[r[0]][x] = 'S';
  });
  // ③ 额甲 + 压眉骨：y4..9 整体压成一档 D（暗铁盔片），y4 上缘 1px L 受光棱 + 两枚 W 铆钉；
  //    兽的怒相全靠这道厚眉，也顺手消灭了上一版「一大片空暗红额头」。
  box(19, 4, 36, 7, 'D');
  for (let x = 20; x <= 35; x++) if (get(x, 4) === 'D') set(x, 4, 'L');
  both(21, 5, 'W');
  box(11, 8, 44, 9, 'D');
  for (let x = 12; x <= 43; x++) if (get(x, 7) === 'S') set(x, 7, 'L');
  // ④ 眼窝 D（各比 12×10 覆盖区外扩 2~3px：eye 叠上后四周有暗框，金色眼珠不会浮在亮面上）
  box(5, 9, 21, 20, 'D'); box(34, 9, 49, 20, 'D');
  // ⑤ 鼻梁：双眼之间 12px 窄带，左缘受光 L / 右缘背光 D（把两眼「分开」，否则读成一副护目镜）
  for (let y = 10; y <= 20; y++) { set(22, y, 'L'); set(23, y, 'L'); set(32, y, 'D'); set(33, y, 'D'); }
  // ⑥ 熔核炉口（=牛的口鼻熔炉）：整块口鼻段压成 D 暗铁板（≠金，金只留给角与肩甲，材质才分得开），
  //    上缘/左缘 1px L 受光、下缘 1px m 凹槽，core 12×12 直接嵌在暗板上（暗底才托得住橙核）。
  box(16, 21, 35, 34, 'D');
  for (let x = 17; x <= 34; x++) if (get(x, 21) === 'D') set(x, 21, 'L');
  for (let y = 22; y <= 34; y++) if (get(16, y) === 'D') set(16, y, 'L');
  for (let x = 17; x <= 34; x++) if (get(x, 34) === 'D') set(x, 34, 'm');
  both(17, 22, 'W');                     // 板角铆钉（x17 / x38，左右各一）
  [[19, 32], [20, 32], [19, 33], [20, 33], [31, 32], [32, 32], [31, 33], [32, 33]].forEach(function (p) {
    set(p[0], p[1], 'm');                // 鼻孔（贴炉核下沿两侧，1x 下读作「喷火的鼻子」）
  });
  // ⑦ 上唇金线 + 口腔腔体 m + 口角獠牙（獠牙固定在 x14..16 / x39..41，落在 jaw 覆盖区 16..35 之外，
  //    否则会被 ui 的下颚件整块盖掉——boss4 同款教训）
  for (let x = 12; x <= 43; x++) if (get(x, 35) !== '.') set(x, 35, 'b');
  box(12, 36, 43, 43, 'm');
  for (let y = 36; y <= 39; y++) {                     // 口角獠牙 4px 宽、4 行高，向下收尖
    const n = 40 - y;                                  // 36→4 格宽、37→3、38→2、39→1
    for (let x = 12; x <= 11 + n; x++) both(x, y, 'W');
  }
  // ⑧ 厚重肩甲（画在头骨之后=压住颊甲外缘）：肩刺 y17..20 独立外挑 + 甲面/甲裙 y21..32。
  //    甲面到 x15 为止（口鼻暗板从 x16 起），否则会把暗板的受光棱吃掉。
  [[15, 0, 1], [16, 0, 2], [17, 0, 4], [18, 0, 6], [19, 0, 7], [20, 2, 8], [21, 4, 12],
   [22, 2, 15], [23, 1, 15], [24, 0, 15], [25, 0, 15], [26, 0, 15], [27, 1, 15], [28, 3, 15],
   [29, 6, 15], [30, 10, 15]
  ].forEach(function (r) {
    const y = r[0], xa = r[1], xb = r[2];
    for (let x = xa; x <= xb; x++) { set(x, y, 'b'); set(W - 1 - x, y, 'b'); }
    if (xb - xa >= 3) { set(xa + 1, y, 'L'); set(W - xb, y, 'L'); }  // 甲面左上受光棱
    if (xb - xa >= 6) { set(xb, y, 'o'); set(W - 1 - xa, y, 'o'); }  // 甲面右下暗面
  });
  both(5, 24, 'W'); both(12, 24, 'W');   // 铆钉（最亮一档，4 枚）
  // ⑨ 熔岩基座：y44..47 收边（下缘 D 贴地），把整只 Boss 落在地上
  [[44, 9, 46], [45, 6, 49], [46, 5, 50], [47, 9, 46]].forEach(function (r) {
    for (let x = r[1]; x <= r[2]; x++) if (get(x, r[0]) === '.') set(x, r[0], 'S');
  });
  for (let x = 9; x <= 46; x++) if (get(x, 47) === 'S') set(x, 47, 'D');
  // ⑩ 熔岩裂纹 t：自炉核向颊侧放射 + 基座两道（狂暴态由调色板把 t 换成金）
  crack(20, 6, 15, 8); crack(36, 23, 44, 26); crack(37, 30, 45, 33);
  crack(15, 33, 9, 35); crack(20, 44, 15, 46); crack(33, 45, 38, 46);
  // ⑪ 明暗收尾：左上受光带（每列首个 S 起 3 行 + 带缘棋盘，跳过 D 眉骨/眼窝/暗板/金甲）
  for (let x = 0; x < 28; x++) {
    let tp = -1;
    for (let y = 0; y < H; y++) if (G[y][x] === 'S') { tp = y; break; }
    if (tp < 0) continue;
    for (let y = tp; y <= tp + 2; y++) if (get(x, y) === 'S') set(x, y, 'L');
    if (get(x, tp + 3) === 'S' && ((x + tp + 3) & 1) === 0) set(x, tp + 3, 'L');
  }
  _rimShade(G, set, get, 28, 20, 47, true);
  return _rasterGrid(G, pal);
}

/* ==================== v10 危险物素材（工单 v10-hazard-art）：地刺 + Boss 分身 ====================
 * 为什么两套独立调色板、且都避开主题色：这两个精灵要在 grass/cave/sky/factory/lava/nether 六个主题底上
 * 复用，任何主题专属色（草绿/岩浆橙/工殿金）换个主题就脏；冷灰在六种底上的明度都居中，
 * 紫色则是「非实体能量」的通用语义色，也和 ui.js 原有兜底色系一致（换素材不换观感）。 */
const _P_SPIKE = { // 内部：地刺（中性冷灰四阶；描边=带蓝相深灰，禁纯黑）
  k: '#2a2a34', // 1px 描边（深灰偏蓝，暗底上仍能与黑区分）
  d: '#5a5a68', // 暗部（右侧背光面）
  m: '#8a8a96', // 主体
  l: '#c8c8d4', // 高光（左上受光缘 / 尖端）
  r: '#46464f'  // 底部碎石（介于描边与暗部之间的一档，碎石才不会糊进描边）
};
/* v10：地刺单帧 20×24 —— ui.js:1791 会把整帧纵向压到 20×hh 再贴，所以：
 *   ① 只往上长、底边（y=23）永远是地面接触线，压缩后仍然「长在地上」；
 *   ② 三根尖刺（中 x=9.5、两侧 x=3/16），中间高两侧低；底部宽 9/5/5，中刺先画、侧刺后画压住它的两边，
 *      于是根部拼成一条 1..18 的连续石带（三根同簇，不留缝）；
 *   ③ 明暗按「左受光」：左缘 1px l 高光、右半侧 d 暗部、整圈 k 描边；3px 细段是 [k][m][k]
 *      （整行给 l 会变成一根白线），1px 尖端给 l（黑点会读成悬浮的脏像素）。 */
function _spikeGrid(midH, sideH, midW, sideW, glow) { // 内部：地刺 20×24 单帧（底对齐，自下而上生长）
  const W = 20, H = 24, G = [];
  for (let y = 0; y < H; y++) G.push(new Array(W).fill('.'));
  const set = function (x, y, ch) { if (x >= 0 && x < W && y >= 0 && y < H) G[y][x] = ch; };
  // 地面裂纹先画：只放在 y=22 的缝里——帧0 刺还矮时露出来（「地先裂、再冒尖」），长高后被刺身盖住
  [[2, 22], [8, 22], [13, 22], [17, 22]].forEach(function (p) { set(p[0], p[1], 'k'); });
  [[1, 22], [18, 22]].forEach(function (p) { set(p[0], p[1], 'r'); }); // 边角碎石
  const spike = function (cx, h, hw0, chips, lean) {
    for (let dy = 0; dy < h; dy++) {
      const y = H - 1 - dy;
      const c = Math.round(cx) + ((lean && dy >= h * 0.55) ? lean : 0);       // 侧刺上段向外偏 1px：三根不平行才像天然石笋
      let x0, x1;
      if (dy === h - 1) { x0 = x1 = c; }                                     // 顶端收成 1px 尖
      else {
        const hw = Math.max(1, Math.round(hw0 * (1 - Math.pow(dy / h, 1.5)))); // 下宽上窄：9/7/5/3 四级台阶
        x0 = c - hw; x1 = c + hw;
        if (chips && hw >= 2 && chips.indexOf(dy) >= 0) x1 -= 1;             // 崩口：石棱不能是一条笔直的边
      }
      for (let x = x0; x <= x1; x++) set(x, y, 'k');                         // 整行先铺描边
      for (let x = x0 + 1; x <= x1 - 1; x++) set(x, y, x <= c ? 'm' : 'd');  // 左主体 / 右暗部（中脊留 m，纯 d 会变黑棍）
      if (x1 - x0 >= 4) set(x0 + 1, y, 'l');                                // ≥5px 宽才留 1px 受光缘（细段给 l 整根发白）
      if (x0 === x1) set(x0, y, 'l');                                       // 1px 尖给亮色：黑点会读成「悬浮的脏像素」
    }
  };
  spike(9.5, midH, midW, [5, 14], 0);   // 中刺先画：它最宽，后画会吃掉侧刺的描边
  spike(3, sideH, sideW, [4, 10], -1);
  spike(16, sideH, sideW, [4, 10], 1);
  // 最底一行压成碎石带（最后画）：三根刺「从裂开的地里长出来」，同时给整簇一个共用的落脚线
  const RUBBLE = 'rrdrrkrdrrdkrrkrrk';
  for (let i = 0; i < RUBBLE.length; i++) set(1 + i, H - 1, RUBBLE[i]);
  if (glow) { // 帧3：呼吸态——中脊 6px 提亮（只动中列，左右描边一像素都不碰，循环时轮廓不抖）
    for (let y = 1; y <= 6; y++) set(10, y, 'l');
  }
  return G.map(function (row) { return row.join(''); });
}
function _spikeFrames() { // 内部：地刺四帧（帧0 冒尖 6px / 帧1 半高 12px / 帧2·3 全长 24px）
  return [
    _makeSprite(_spikeGrid(6, 4, 2, 1, false), _P_SPIKE),
    _makeSprite(_spikeGrid(12, 8, 3, 1.5, false), _P_SPIKE),
    _makeSprite(_spikeGrid(24, 12, 4, 2, false), _P_SPIKE),
    _makeSprite(_spikeGrid(24, 12, 4, 2, true), _P_SPIKE)
  ];
}

const _P_BOSSGHOST = { // 内部：Boss 分身（紫系四阶；描边=深紫，禁纯黑——本体全是深色，纯黑描边会与本体重叠）
  k: '#3a1a52', // 1px 描边（深紫）
  D: '#5a2f80', // 暗部（右下背光）
  m: '#7a4aa8', // 主体
  l: '#b888e0', // 高光 / 能量纹
  v: '#d9b6ff'  // 能量芯（眼 / 胸口，比高光再亮一档才读得出「不是实体」）
};
/* v10：Boss 分身通用剪影 52×48 —— 5 个 Boss 共用一张，所以不画任何具体 Boss 的特征（眼型/角形/配色），
 * 只保留「大型怪物」的骨相：小头 + 双角 + 极宽肩 + 收腰 + 两条粗腿 + 外扩脚掌。
 * 做法：先铺布尔遮罩（行跨表，左右严格镜像于 x=25.5），再统一派生 1px 内描边 → 左上受光带 l /
 * 右下暗带 D → 最后压 3 道能量纹（双眼 / 胸口 Y 形裂 / 双肩短纹）。
 * 描边取「内描边」而非外描边：ui 按 clone 底边对齐贴图，外描边会把脚底顶出地面 1px。 */
function _bossGhostGrid() { // 内部：分身剪影 52×48（返回字符串网格，交给 _makeSprite 上色）
  const W = 52, H = 48, M = [];
  for (let y = 0; y < H; y++) M.push(new Array(W).fill(false));
  const put = function (x, y) { if (x >= 0 && x < W && y >= 0 && y < H) M[y][x] = true; };
  const on = function (x, y) { return x >= 0 && x < W && y >= 0 && y < H && M[y][x]; };
  const hwRow = function (y, hw) { for (let x = 26 - hw; x <= 25 + hw; x++) put(x, y); }; // hw=半宽（左右对称）
  // ① 双角：自头顶两角向上外弯（根 7px→尖 1px），镜像；只到 y9，与头骨 y7 起叠合
  for (let y = 0; y <= 9; y++) {
    const t = (9 - y) / 9;                          // 0=根 1=尖
    const cx = Math.round(17 - 7 * t);              // 中心线 17→10（向上外倾）
    const hw = t > 0.82 ? 0 : t > 0.5 ? 1 : t > 0.25 ? 2 : 3; // 尖 1px / 3 / 5 / 根 7px（细长角会读成触须）
    for (let x = cx - hw; x <= cx + hw; x++) { put(x, y); put(W - 1 - x, y); }
  }
  // ② 头骨 y7..18（12 行，最宽 16 → 收颚到 6）：小头配大身，是「巨型怪」剪影的第一眼信息
  [4, 6, 8, 8, 8, 8, 8, 8, 8, 8, 7, 6].forEach(function (hw, i) { hwRow(7 + i, hw); });
  // ③ 短颈 y19..21：刻意收窄，让宽肩「炸」出来
  [4, 4, 5].forEach(function (hw, i) { hwRow(19 + i, hw); });
  // ④ 肩胸 y22..31：8→22 三级放大（宽 44 = 画布 85%），再收到 16 —— 倒三角，肩线一眼可读
  [8, 11, 14, 17, 19, 21, 22, 20, 18, 16].forEach(function (hw, i) { hwRow(22 + i, hw); });
  // ⑤ 收腰 y32..38：12→11→12，腰比胸窄 10px、又比腿窄 2px —— 倒三角 + 外凸大腿，两条腿才读得出来
  [12, 11, 11, 12, 12, 12, 11].forEach(function (hw, i) { hwRow(32 + i, hw); });
  // ⑥ 双臂 y28..43：挂在肩外侧、与躯干留 1~3px 透光缝（不画缝的话宽肩+宽腰会糊成一整块梯形）；
  //    小臂比上臂细 1px、拳头再宽 1px —— 三段粗细差是「手臂」唯一的读法（纯矩形会读成两条垂带）
  for (let y = 28; y <= 43; y++) {
    const ax0 = y >= 34 ? 4 : 3;
    for (let x = ax0; x <= 10; x++) put(x, y);
    for (let x = 41; x <= 51 - ax0; x++) put(x, y);
  }
  for (let y = 39; y <= 43; y++) {
    for (let x = 1; x <= 10; x++) put(x, y);
    for (let x = 41; x <= 50; x++) put(x, y);
  }
  // ⑦ 两条粗腿 y39..44（各 13px 宽，中间 2px 透光缝）+ 外扩脚掌 y45..47（各 15px 宽）
  for (let y = 39; y <= 44; y++) {
    for (let x = 12; x <= 24; x++) put(x, y);
    for (let x = 27; x <= 39; x++) put(x, y);
  }
  for (let y = 45; y <= 47; y++) {
    for (let x = 10; x <= 24; x++) put(x, y);
    for (let x = 27; x <= 41; x++) put(x, y);
  }
  // ⑧ 内描边 + 明暗派生：边缘 1px k；紧贴描边的上/左像素 l（受光），下/右像素 D（背光），其余 m
  const G = [];
  for (let y = 0; y < H; y++) G.push(new Array(W).fill('.'));
  const edge = function (x, y) { return !on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!on(x, y)) continue;
    if (edge(x, y)) { G[y][x] = 'k'; continue; }
    if (!on(x, y - 1) || !on(x - 1, y) || !on(x, y - 2) || !on(x - 2, y)) G[y][x] = 'l';
    else if (!on(x, y + 1) || !on(x + 1, y)) G[y][x] = 'D';
    else G[y][x] = 'm';
  }
  // ⑨ 三道能量纹（只压 m/D，绝不覆盖描边 k，否则轮廓会漏）：双眼 + 胸口 Y 形裂 + 双肩短纹
  const vein = function (x, y, ch) {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    if (G[y][x] === 'k' || G[y][x] === '.') return;
    G[y][x] = ch || 'l';
  };
  for (let x = 21; x <= 23; x++) { vein(x, 11); vein(W - 1 - x, 11); }   // 眼：外高内低的斜切＝凶相
  for (let x = 20; x <= 22; x++) { vein(x, 12, 'v'); vein(W - 1 - x, 12, 'v'); }
  for (let y = 24; y <= 36; y++) { vein(25, y); vein(26, y); }                                    // 胸口中缝
  [[22, 30], [23, 29], [24, 28], [21, 31], [20, 32], [27, 28], [28, 29], [29, 30], [30, 31], [31, 32]]
    .forEach(function (p) { vein(p[0], p[1]); vein(W - 1 - p[0], p[1]); });                        // Y 形分叉
  [[8, 28], [9, 27], [10, 26], [11, 25]].forEach(function (p) { vein(p[0], p[1]); vein(W - 1 - p[0], p[1]); }); // 肩纹
  vein(25, 31, 'v'); vein(26, 31, 'v'); vein(25, 32, 'v'); vein(26, 32, 'v');                      // 胸口能量芯
  G[0][10] = 'l'; G[0][W - 1 - 10] = 'l';                                                          // 角尖点高光（黑点会读成噪点）
  return G.map(function (row) { return row.join(''); });
}
function _bossGhostSprite() { // 内部：分身剪影 → canvas（52×48，ui 侧直接 drawImage）
  return _makeSprite(_bossGhostGrid(), _P_BOSSGHOST);
}

/* ==================== v13 危险物素材（bomb / mirror / pushwall） ====================
 * spec 2026-10-26-v13-boss2 §七。三件都是「中性道具」：
 *   · bomb 用铁灰三阶 + 棕引信 + 亮红火星——比石头多一根引信和火星，形状上靠「正圆 + 顶部长尾」区分；
 *   · mirror 是单色剪影（只 #b070f0 一个色）：UI 会自己染色 + 叠 55% 透明 + 紫色描边抖动，
 *     图里任何内部细节都会在染色后变成脏噪点，所以只保留「尖兜帽 → 收颈 → 宽肩 → 外扩斗篷 → 破下摆」的轮廓；
 *   · pushwall 24×64 竖条：上沿 3px 尖齿（尖角朝上）+ 砖缝 + 沿竖直方向走的裂纹网 + 发光缝，
 *     下沿压暗一档——墙贴地时底部要「沉」下去，否则会像悬空的橙条。
 * 三件均在 buildSprites 里 Object.freeze：v13 冻结约束，防 UI 侧误加字段/换引用（与皮肤帧同口径）。 */
const _P_BOMB = { // 内部：炸弹调色板（d 描边兼暗部 / m 主体 / l 高光 / f 引信 / r 火星）
  d: '#22262e', m: '#3a3f4a', l: '#6a7280', f: '#8a5a2a', r: '#ff4030'
};
const _BOMB = [ // 16×16：球体 x2..13 / y5..15（正圆），引信自球顶向右上 3px 长（2px 粗，1px 会在 16px 尺度看不见），尖端亮红
  '............r...', // 0  火星
  '...........rr...', // 1
  '..........ff....', // 2  引信
  '.........ff.....', // 3
  '........ff......', // 4
  '.......dd.......', // 5  球顶
  '.....ddlmdd.....', // 6
  '....dllmmmdd....', // 7
  '...dlmmmmmmdd...', // 8
  '...dlmmmmmmdd...', // 9
  '..dlmmmmmmmmdd..', // 10
  '..dlmmmmmmmmdd..', // 11
  '...dlmdmmmddd...', // 12  两枚铆钉（x6/x10）压在右下暗部里，兼作「铁球」材质暗示
  '...dlmmmmmmdd...', // 13
  '....dlmmdddd....', // 14
  '.....dddddd.....'  // 15
];
const _P_MIRROR = { M: '#b070f0' }; // 内部：幻影剪影（单色——UI 染色，内部不加任何色阶）
function _mirrorGrid() { // 内部：24×32 兜帽斗篷剪影（行半宽表；纯色块，挖破下摆）
  const W = 24, H = 32, CX = 11.5;
  const HW = [1, 2, 3, 4, 5, 6, 6, 6, 6, 5, 4, 4, 7, 7, 7, 6, 6, 7, 8, 8, 9, 9, 9, 9, 10, 10, 10, 10, 10, 10, 10, 10]; // y0 帽尖 → y9 帽口 → y10-11 收颈 → y12 宽肩 → y24 起斗篷最宽
  const G = [];
  for (let y = 0; y < H; y++) {
    const row = new Array(W).fill('.');
    const h = HW[y], x0 = Math.ceil(CX - h), x1 = Math.floor(CX + h);
    for (let x = x0; x <= x1; x++) row[x] = 'M';
    G.push(row);
  }
  [4, 9, 14, 19].forEach(function (x) { G[H - 1][x] = '.'; }); // 下摆锯齿（对称四点，剪影左右镜像不错位）
  [7, 16].forEach(function (x) { G[H - 2][x] = '.'; G[H - 3][x] = '.'; }); // 两道深 2px 的破口：读成布条
  return G.map(function (r) { return r.join(''); });
}
const _P_PUSHWALL = { // 内部：熔岩砖墙（B 底 / C 裂纹 / G 发光缝 / D 砖缝 / K 下沿压暗）
  B: '#6a2418', C: '#c04020', G: '#f88040', D: '#3e140e', K: '#4a1710'
};
function _pushwallGrid() { // 内部：24×64 熔岩裂纹砖墙（尖齿 y0-2 / 砖缝 4 道 / 裂纹网 2 主脉 + 7 分叉 / 下沿压暗）
  const W = 24, H = 64, G = [];
  const put = function (x, y, ch) { if (x >= 0 && x < W && y >= 0 && y < H) G[y][x] = ch; };
  const line = function (x0, y0, x1, y1, ch) { // Bresenham：裂纹必须 1px 连成线，虚线会读成噪点
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, x = x0, y = y0;
    for (let n = 0; n < 400; n++) {
      put(x, y, ch);
      if (x === x1 && y === y1) break;
      const e2 = err * 2;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  };
  for (let y = 0; y < H; y++) G.push(new Array(W).fill('.'));
  for (let y = 2; y < H; y++) for (let x = 0; x < W; x++) G[y][x] = 'B'; // 主体（齿底行 y2 起）
  // ① 上沿 3px 尖齿：周期 6，尖 1px（y0 高光）/ 腰 3px（y1 热色）/ 底 1 行（y2 已铺底）
  [2, 8, 14, 20].forEach(function (cx) {
    put(cx, 0, 'G');
    put(cx - 1, 1, 'C'); put(cx, 1, 'C'); put(cx + 1, 1, 'C');
  });
  // ② 砖缝：4 道横缝 + 竖向错缝（错缝=砌体感；竖缝不到顶，避免把墙切成 4 块独立竖条）
  [16, 29, 42, 55].forEach(function (y) { for (let x = 0; x < W; x++) G[y][x] = 'D'; });
  [[4, 15, 7], [17, 28, 16], [30, 41, 7], [43, 54, 16], [56, 63, 7]].forEach(function (seg) {
    for (let y = seg[0]; y <= seg[1]; y++) G[y][seg[2]] = 'D';
  });
  // ③ 裂纹网：两条纵贯主脉（左右交替横摆，避免两条平行竖线读成木纹）+ 七条分叉
  const C1 = [[7, 4], [6, 9], [8, 14], [5, 20], [7, 26], [6, 33], [9, 39], [7, 46], [8, 53], [6, 60]];
  const C2 = [[17, 5], [19, 10], [16, 16], [18, 23], [15, 29], [17, 36], [20, 43], [17, 50], [18, 57]];
  const BR = [[[8, 14], [13, 18]], [[13, 18], [14, 22]], [[6, 33], [2, 37]], [[2, 37], [3, 42]],
    [[17, 36], [21, 33]], [[9, 39], [12, 44]], [[15, 29], [12, 26]]];
  const vein = function (path) { for (let i = 0; i + 1 < path.length; i++) line(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1], 'C'); };
  vein(C1); vein(C2); BR.forEach(vein);
  // ④ 发光缝：只在裂纹上点状提亮（连成一条会读成橙色带，就不像「缝里的熔岩」了）
  [[7, 6], [8, 16], [6, 24], [9, 37], [7, 44], [8, 51], [6, 58], [18, 8], [16, 18], [18, 25], [17, 34], [20, 41], [18, 48], [18, 55],
    [12, 19], [13, 21], [3, 39], [11, 42], [13, 27]].forEach(function (p) { put(p[0], p[1], 'G'); });
  // ⑤ 下沿压暗：最后 8 行换 K，第 55 行棋盘过渡（硬切会在砖缝上留下一条亮边）
  for (let y = 56; y < H; y++) for (let x = 0; x < W; x++) if (G[y][x] === 'B') G[y][x] = 'K';
  for (let x = 0; x < W; x++) if (((x + 55) & 1) === 0 && G[55][x] === 'B') G[55][x] = 'K';
  return G.map(function (r) { return r.join(''); });
}
const _P_TOTEM = { // 内部：圣像调色板（d 石台 / h 石台顶面 / s 柱身 / e 柱身亮边 / g 凹槽兼接地阴影 / y 金眼 / w 眼心）
  d: '#3a3448', h: '#5a5470', s: '#4a4258', e: '#6a6280', g: '#332c44', y: '#f8d048', w: '#fff8d0'
};
const _TOTEM = [ // 16×32：尺寸与 hazard.w/h 逐字一致（spec §三 w16 h32，y 为地面线、向上长）
  '................', // 0  留空 1px：金眼不顶到画布边，头顶留一口气
  '......yyy.......', // 1  金眼 3×3（x6..8）——「这是圣像不是柱子」的唯一识别点
  '......ywy.......', // 2    中心 1px 白：没有这个白点，3×3 金块会读成柱头铜箍
  '......yyy.......', // 3
  '....esssssse....', // 4  柱身 8×24 起（y4..27，居中 x4..11）：左右各 1px 亮边做圆柱受光
  '....esssssse....', // 5
  '....esssssse....', // 6
  '....esssssse....', // 7
  '....esssssse....', // 8
  '....esssssse....', // 9
  '....esssssse....', // 10
  '....esssssse....', // 11
  '....gggggggg....', // 12 凹槽 1（柱身中段，与下一道对称于 y16——两刀刻痕才不像光滑水管）
  '....esssssse....', // 13
  '....esssssse....', // 14
  '....esssssse....', // 15
  '....esssssse....', // 16
  '....esssssse....', // 17
  '....esssssse....', // 18
  '....esssssse....', // 19
  '....gggggggg....', // 20 凹槽 2
  '....esssssse....', // 21
  '....esssssse....', // 22
  '....esssssse....', // 23
  '....esssssse....', // 24
  '....esssssse....', // 25
  '....esssssse....', // 26
  '....esssssse....', // 27 柱身止于地面线（y 口径与 mist 一致：y 是脚底，不向上偏移）
  'hhhhhhgggghhhhhh', // 28 石台 16×4 顶面：柱脚正下方压暗当投影，否则柱子和台面糊成一块
  'dddddddddddddddd', // 29
  'dddddddddddddddd', // 30
  'gggggggggggggggg'  // 31 最底 1px 接地阴影：16px 宽的平条不加这行会像悬空的板
];
function _frozenSpr(spr) { // 内部：v13 冻结（精灵画布本身冻结；内容不可变、引用不可换）
  return Object.freeze(spr);
}

/* ==================== SPR 精灵字典与构建 ==================== */
const SPR = {}; // 精灵画布字典（契约导出）：buildSprites() 填充

/* ==================== v7.7 换色皮肤系统：20 套主角换色（v12 追加 L19） ====================
 * 为什么这样分层：主角是纯调色板驱动的程序化 sprite（_makeSprite 按字符网格上色），
 *   所以「换皮肤」= 换一张调色板，16×16 字符网格（像素画本身）一字不动——20 套共用同一套
 *   网格，帧数/轮廓/动作完全一致，不存在漏帧或错位。
 * 色阶规则（照抄 _P_HERO 的硬规范，违反任何一条角色就会「变糊」）：
 *   · 不变的键：k 描边深藏蓝 / w 纯白脸·手套·眼高光 / e 眼睛嘴 / p 腮红。
 *     描边与五官是角色的身份锚点，跨皮肤保持一致，剪影在任何配色下都可读；
 *     k 恒为 #1c2450（深藏蓝，有色相，禁纯黑——纯黑描边在暗背景上会糊成一坨）。
 *   · 要换的键：b 亮主体 / B 暗主体 / W 高光（主体三阶）+ o/s/O/y/Y（围巾系）。
 *   · 明度关系（与 _P_HERO 逐位对齐，保证阴影方向/受光面在 20 套下都正确）：
 *       B = b 同色相 HSL-L ×0.66（约 −34%，暗部；饱和 +0.06 防发灰）
 *       W = b 同色相 HSL-L ×1.52（约 +52%，高光；饱和收到 0.95b+0.03，色相偏冷 +6°）
 *       o → s → y = 同色系三段（L +0 / +0.09 / +0.19，色相 +0 / +6° / +12°，越往后越亮越暖）
 *       O = o 的暗部（L ×0.66）、Y = y 的暗部（L ×0.80）
 *   · 20 套 b 的色相角在色轮上两两 ≥12°（tools/_v77_skins_art.js 断言同值），
 *     避免出现「深蓝/藏蓝/靛蓝」三套肉眼分不清。
 * 顺序契约（不可变）：ui.js 按「关卡索引 i → HERO_SKINS[i+1].id」掉落，改顺序=发错皮肤。
 * 生成策略：blue 直接引用现有 SPR.hero* 帧（零重复绘制）；其余 19 套首次 getHeroSkin 才
 *   _makeSprite，结果冻结后缓存进 SPR.skins[id]（buildSprites 末尾只预生成 blue，额外耗时≈0）。 */
const HERO_SKINS = [ // 调色板键序同 _P_HERO：k 描边/b 亮主体/B 暗主体/W 高光/w 纯白/o-s-y 围巾三段/O-Y 暗部/e 眼嘴/p 腮红
  { id: 'blue', name: '星蓝', pal: { k: '#1c2450', b: '#38b8f8', B: '#1e78c8', W: '#d8f4ff', w: '#ffffff', o: '#f88838', s: '#f8b040', O: '#c85820', y: '#f8d048', Y: '#d8a020', e: '#182850', p: '#f8a0b0' } }, // 默认（= _P_HERO 原色，开局即有）
  { id: 'sprout', name: '草绿', pal: { k: '#1c2450', b: '#6bd039', B: '#4e931c', W: '#b8eba8', w: '#ffffff', o: '#f6b828', s: '#f8d754', O: '#b58108', y: '#fbef83', Y: '#f9e639', e: '#182850', p: '#f8a0b0' } }, // L1 草原
  { id: 'crystal', name: '紫晶', pal: { k: '#1c2450', b: '#a06ed8', B: '#5c27b1', W: '#f4edfa', w: '#ffffff', o: '#35c2de', s: '#5dc0e5', O: '#19879c', y: '#88c8ed', Y: '#47aae3', e: '#182850', p: '#f8a0b0' } }, // L2 洞窟
  { id: 'azure', name: '天青', pal: { k: '#1c2450', b: '#47e1c2', B: '#15ae83', W: '#cbf6f2', w: '#ffffff', o: '#e63763', s: '#eb6075', O: '#a81539', y: '#f28d92', Y: '#ea4850', e: '#182850', p: '#f8a0b0' } }, // L3 天空
  { id: 'steel', name: '铁灰', pal: { k: '#1c2450', b: '#8d98b0', B: '#4f6481', W: '#edeff3', w: '#ffffff', o: '#eaaa2a', s: '#eeca53', O: '#a57410', y: '#f4e481', Y: '#eed63c', e: '#182850', p: '#f8a0b0' } }, // L4 工厂
  { id: 'ember', name: '赤焰', pal: { k: '#1c2450', b: '#ee362f', B: '#b40811', W: '#f9c2b9', w: '#ffffff', o: '#f6c228', s: '#f8df54', O: '#b58a08', y: '#fbf583', Y: '#f9ef39', e: '#182850', p: '#f8a0b0' } }, // L5 烈焰
  { id: 'ivory', name: '石白', pal: { k: '#1c2450', b: '#c6caaf', B: '#9a9d5c', W: '#f5f6f1', w: '#ffffff', o: '#36a4c9', s: '#5aa9d3', O: '#236d85', y: '#81b5df', Y: '#4994d0', e: '#182850', p: '#f8a0b0' } }, // L6 塔
  { id: 'starcore', name: '星核金', pal: { k: '#1c2450', b: '#f8dd62', B: '#e3a702', W: '#fefce9', w: '#ffffff', o: '#ae41d2', s: '#ca66db', O: '#772393', y: '#e18fe6', Y: '#d152d8', e: '#182850', p: '#f8a0b0' } }, // L7 Boss（比 _P_HERO_GOLD 更亮）
  { id: 'jade', name: '翡翠', pal: { k: '#1c2450', b: '#47c281', B: '#27894c', W: '#afe5cd', w: '#ffffff', o: '#e03e74', s: '#e66583', O: '#a21a48', y: '#ee909d', Y: '#e44e62', e: '#182850', p: '#f8a0b0' } }, // L8 风谷
  { id: 'sunset', name: '落日渐金', pal: { k: '#1c2450', b: '#f3ac49', B: '#ca6806', W: '#fdf5e4', w: '#ffffff', o: '#248fdb', s: '#4b94e2', O: '#185e91', y: '#76a2ea', Y: '#3979e1', e: '#182850', p: '#f8a0b0' } }, // L9 王城
  { id: 'nebula', name: '星紫', pal: { k: '#1c2450', b: '#d263e3', B: '#9a1abe', W: '#fbecfc', w: '#ffffff', o: '#efbf2e', s: '#f3db59', O: '#af870d', y: '#f7f287', Y: '#f2ea40', e: '#182850', p: '#f8a0b0' } }, // L10 星空
  { id: 'abyss', name: '海青', pal: { k: '#1c2450', b: '#27afb9', B: '#157f7d', W: '#74cfe1', w: '#ffffff', o: '#ef552e', s: '#f38759', O: '#af2e0d', y: '#f7b487', Y: '#f28740', e: '#182850', p: '#f8a0b0' } }, // L11 龙宫
  { id: 'coral', name: '珊瑚粉', pal: { k: '#1c2450', b: '#ed6e87', B: '#d31249', W: '#fcebec', w: '#ffffff', o: '#36d3c6', s: '#5cd9db', O: '#209086', y: '#85dae5', Y: '#49c8d9', e: '#182850', p: '#f8a0b0' } }, // L12 珊瑚
  { id: 'tide', name: '蛟蓝', pal: { k: '#1c2450', b: '#393ed0', B: '#1c2a93', W: '#ada8eb', w: '#ffffff', o: '#f29f2c', s: '#f4c357', O: '#b16c0b', y: '#f8e086', Y: '#f5cd3d', e: '#182850', p: '#f8a0b0' } }, // L13 Boss
  { id: 'wraith', name: '幽绿', pal: { k: '#1c2450', b: '#69b56e', B: '#3a8439', W: '#cce6d0', w: '#ffffff', o: '#9f49ca', s: '#bc6dd5', O: '#6c298d', y: '#d694e1', Y: '#c159d0', e: '#182850', p: '#f8a0b0' } }, // L14 幽冥（低饱和青绿+鬼火紫围巾）
  { id: 'magma', name: '熔橙', pal: { k: '#1c2450', b: '#f46a2a', B: '#b92e04', W: '#fbd3b7', w: '#ffffff', o: '#fadf2e', s: '#fbf55b', O: '#bea605', y: '#f6fd8c', Y: '#effc3e', e: '#182850', p: '#f8a0b0' } }, // L15 熔渊（橙红主体+亮黄围巾）
  { id: 'judge', name: '判官黑', pal: { k: '#1c2450', b: '#7c3a68', B: '#542348', W: '#b06e96', w: '#ffffff', o: '#df1631', s: '#eb373d', O: '#930f20', y: '#f16e64', Y: '#ec3326', e: '#182850', p: '#f8a0b0' } }, // L16 Boss（深紫黑主体+猩红围巾）
  { id: 'spectra', name: '冥紫', pal: { k: '#1c2450', b: '#ce68c4', B: '#7a2870', W: '#f4d0ea', w: '#ffffff', o: '#2e8850', s: '#4cb878', O: '#1c5c34', y: '#8ce8b0', Y: '#54b078', e: '#182850', p: '#f8a0b0' } }, // L17 冥渊（兰紫主体+鬼火绿围巾；色相 305°，卡在星紫 292 与判官 318 的空档）
  { id: 'holy', name: '曜白', pal: { k: '#1c2450', b: '#f0eef8', B: '#b0a8c8', W: '#ffffff', w: '#ffffff', o: '#d89020', s: '#f0b840', O: '#a06410', y: '#f8e088', Y: '#d0b050', e: '#182850', p: '#f8a0b0' } }, // L18 双Boss（浅紫白主体+圣金围巾；色相 252°，卡在蛟蓝 238 与紫晶 268 的空档）
  // v12 L19 火焰山·牛魔王：熔岩主题「绛红主体 + 金橙围巾」。色相 334.6° 不是纯正暗红——
  //   色轮上 2.2°(赤焰)/19°(熔橙)/34.9°(落日渐金) 三个红橙位已被占满，纯红位最近也只剩 8° 余量，
  //   必破 ≥12° 红线；334.6° 落在判官 318.2° 与珊瑚 348.2° 之间的空档（两侧余量 16.4°/13.6°），
  //   观感是「牛魔绛红」（带紫的暗红），配金橙围巾仍是火焰山那口气。
  { id: 'inferno', name: '牛魔绛', pal: { k: '#1c2450', b: '#9e2f5e', B: '#6a1f3c', W: '#d98aa8', w: '#ffffff', o: '#f08a18', s: '#f8b02c', O: '#a85808', y: '#ffd85c', Y: '#c98c14', e: '#182850', p: '#f8a0b0' } } // L19 牛魔王（绛红主体+金橙围巾）
];
SPR.skins = {}; // v7.7：皮肤帧缓存（惰性填充；键=皮肤 id，值=冻结的帧对象）

const _HERO_SKIN_GOLD = { b: '#f8d048', B: '#c89010', W: '#fff8c8' }; // 内部：施法金三键（与 _P_HERO_GOLD 同值，每套皮肤各叠一次）

function _heroSkinDef(id) { // 内部：按 id 查皮肤定义（未知 id 静默回落 blue——ui 传错不炸游戏）
  for (let i = 0; i < HERO_SKINS.length; i++) if (HERO_SKINS[i].id === id) return HERO_SKINS[i];
  return HERO_SKINS[0];
}

function _heroSkinFrames(pal) { // 内部：用一张调色板重绘整套主角帧（网格/键名与 buildSprites 的 hero* 逐一对齐）
  const gp = Object.assign({}, pal, _HERO_SKIN_GOLD); // 施法金：只换主体三阶，围巾/描边/五官沿用本皮肤
  const o = {
    idle1: _makeSprite(_H_IDLE1, pal),
    idle2: _makeSprite(_H_IDLE2, pal),
    run: _H_RUNS.map(function (g) { return _makeSprite(g, pal); }), // 6 帧跑动
    jump: _makeSprite(_H_JUMP, pal),
    fall: _makeSprite(_H_FALL, pal),
    attack: _makeSprite(_H_ATTACK, pal),
    dash: _makeSprite(_H_DASH, pal),
    squash: _makeSprite(_H_SQUASH, pal),
    dashWind: _makeSprite(_H_DASHWIND, pal),
    attackGold: _makeSprite(_H_ATTACK, gp)
  };
  o.idle1L = flipSprite(o.idle1); // L = 左向翻转版（与 buildSprites 的 hero*L 同法）
  o.idle2L = flipSprite(o.idle2);
  o.runL = o.run.map(flipSprite);
  o.jumpL = flipSprite(o.jump);
  o.fallL = flipSprite(o.fall);
  o.attackL = flipSprite(o.attack);
  o.dashL = flipSprite(o.dash);
  o.squashL = flipSprite(o.squash);
  o.dashWindL = flipSprite(o.dashWind);
  o.attackGoldL = flipSprite(o.attackGold);
  return o;
}

function _heroBlueFrames() { // 内部：blue 皮肤 = 直接引用 buildSprites 已画好的 hero* 帧（不重复绘制、零额外像素）
  return {
    idle1: SPR.heroIdle1, idle2: SPR.heroIdle2, run: SPR.heroRun,
    jump: SPR.heroJump, fall: SPR.heroFall, attack: SPR.heroAttack,
    dash: SPR.heroDash, squash: SPR.heroSquash, dashWind: SPR.heroDashWind, attackGold: SPR.heroAttackGold,
    idle1L: SPR.heroIdle1L, idle2L: SPR.heroIdle2L, runL: SPR.heroRunL,
    jumpL: SPR.heroJumpL, fallL: SPR.heroFallL, attackL: SPR.heroAttackL,
    dashL: SPR.heroDashL, squashL: SPR.heroSquashL, dashWindL: SPR.heroDashWindL, attackGoldL: SPR.heroAttackGoldL
  };
}

function getHeroSkin(id) { // 取某套皮肤的全部帧（惰性生成 + 缓存；未知 id → 回落 blue，契约导出）
  const sk = _heroSkinDef(id);
  if (SPR.skins[sk.id]) return SPR.skins[sk.id]; // 命中缓存：同一 id 永远返回同一对象
  if (!SPR.heroIdle1) buildSprites();            // 未构建时自举（blue 帧依赖 hero*，幂等调用）
  if (SPR.skins[sk.id]) return SPR.skins[sk.id]; // 自举期间 buildSprites 末尾已预生成 blue：直接复用
  const f = sk.id === 'blue' ? _heroBlueFrames() : _heroSkinFrames(sk.pal);
  Object.freeze(f.run); Object.freeze(f.runL);   // v7.7：帧对象冻结——防 ui 误改写串皮肤
  SPR.skins[sk.id] = Object.freeze(f);
  return SPR.skins[sk.id];
}

function buildSprites() { // 一次性构建全部精灵（幂等：重复调用直接返回，契约导出）
  if (SPR.heroIdle1) return SPR;
  // —— 主角「星之勇者」（16×16，右向为基准，左向为翻转版）——
  SPR.heroIdle1 = _makeSprite(_H_IDLE1, _P_HERO);
  SPR.heroIdle2 = _makeSprite(_H_IDLE2, _P_HERO);
  SPR.heroRun = _H_RUNS.map(function (g) { return _makeSprite(g, _P_HERO); }); // 6 帧跑动
  SPR.heroJump = _makeSprite(_H_JUMP, _P_HERO);
  SPR.heroFall = _makeSprite(_H_FALL, _P_HERO);
  SPR.heroAttack = _makeSprite(_H_ATTACK, _P_HERO);
  SPR.heroDash = _makeSprite(_H_DASH, _P_HERO);
  SPR.heroSquash = _makeSprite(_H_SQUASH, _P_HERO);
  SPR.heroIdle1L = flipSprite(SPR.heroIdle1);
  SPR.heroIdle2L = flipSprite(SPR.heroIdle2);
  SPR.heroRunL = SPR.heroRun.map(flipSprite);
  SPR.heroJumpL = flipSprite(SPR.heroJump);
  SPR.heroFallL = flipSprite(SPR.heroFall);
  SPR.heroAttackL = flipSprite(SPR.heroAttack);
  SPR.heroDashL = flipSprite(SPR.heroDash);
  SPR.heroSquashL = flipSprite(SPR.heroSquash);
  // —— v5 弧光四帧+蓄力帧+新机关素材（键名/取帧式不变）——
  SPR.slashArc = [
    _slashFrame(6, 1, '#cfefff', '#cfefff', 1, 0.85),   // 帧0 起手
    (function () { const f = _slashFrame(10, 3, '#ffffff', '#48d8e8', 5, 0.95);
      const g = f.getContext('2d'); g.fillStyle = '#ffffff'; g.globalAlpha = 0.95;
      g.fillRect(21, 16, 2, 2); return f; })(),         // 帧1 爆发（尾星）
    _slashFrame(11, 2, '#ffffff', '#f8d048', 3, 0.9),   // 帧2 收束
    _slashFrame(10, 1, '#48d8e8', '#1898a8', 1, 0.5)    // 帧3 余韵
  ];
  SPR.heroDashWind = _makeSprite(_H_DASHWIND, _P_HERO);
  SPR.heroDashWindL = flipSprite(SPR.heroDashWind);
  // 骑士基准帧面向左，ui 按 e.face>0 flipSprite 翻转（渲染约定）
  SPR.knight = [_makeSprite(_knightGrid(_KN_SPANS.slice(14)), _P_KNIGHT),
                _makeSprite(_knightGrid(_KN_LEGS2), _P_KNIGHT)];
  SPR.knightDead = _makeSprite(_knightDeadGrid(), _P_KNIGHT_DEAD);
  SPR.portal = _portalFrames().map(function (f) { return _glow(f, '#cff2ff'); }); // 传送门（发光件）
  SPR.chandBlade = _glow(_chandBladeSprite(), '#ffe9b0');   // 吊灯锤（发光件）
  SPR.windStreak = _windStreakFrames();
  // —— 敌人（史莱姆高光+表情两帧；蝙蝠翅膀 3 帧扑扇）——
  SPR.slime = [_makeSprite(_SLIME1, _P_SLIME), _makeSprite(_SLIME2, _P_SLIME)];
  SPR.slimeDead = _makeSprite(_SLIME_DEAD, _P_SLIME);
  SPR.bat = [_makeSprite(_BAT1, _P_BAT), _makeSprite(_BAT2, _P_BAT), _makeSprite(_BAT3, _P_BAT)];
  // v8.0 三种新小怪：各 2 帧 + 1 死亡帧（共 9 张 14×12/14×16/12×12 小图，纯 fillRect 增量 < 5ms；
  // 基准帧面向左，ui.js 按 e.face>0 翻转；spitter 站桩不翻转，靠自身左右不对称表达朝向）
  SPR.beetle = [_makeSprite(_BEETLE1, _P_BEETLE), _makeSprite(_BEETLE2, _P_BEETLE)];
  SPR.beetleDead = _makeSprite(_BEETLE_DEAD, _P_BEETLE_DEAD);
  SPR.spitter = [_makeSprite(_SPITTER1, _P_SPITTER), _makeSprite(_SPITTER2, _P_SPITTER)];
  SPR.spitterDead = _makeSprite(_SPITTER_DEAD, _P_SPITTER_DEAD);
  SPR.hopper = [_makeSprite(_HOPPER1, _P_HOPPER), _makeSprite(_HOPPER2, _P_HOPPER)];
  SPR.hopperDead = _makeSprite(_HOPPER_DEAD, _P_HOPPER_DEAD);
  // v10 危险物：地刺 4 帧（ui 按 hh 纵向压整帧，故四帧全部底对齐）+ Boss 分身剪影（5 个 Boss 共用，
  // 与本体同为 52×48 以便 ui 按 clone 的 w/h 缩放）；两张图共 5 张 canvas，纯 fillRect 增量 < 3ms。
  SPR.spike = _spikeFrames();
  SPR.bossGhost = _bossGhostSprite();
  // —— 物品（金币四帧旋转；v5 发光件 _glow 内描边，rim 色照抄设计书 §5.4）——
  SPR.coin = [_COIN1, _COIN2, _COIN3, _COIN2].map(function (grid, i) { // 四帧旋转
    return _glow(i === 3 ? flipSprite(_makeSprite(_COIN2, _P_ITEM)) : _makeSprite(grid, _P_ITEM), '#fff2a0');
  });
  SPR.gem = _glow(_makeSprite(_GEM, _P_ITEM), '#bffcff');
  SPR.key = _glow(_makeSprite(_KEY_ART, _P_ITEM), '#fff2a0');
  SPR.springX = _glow(_makeSprite(_SPRING_X, _P_ITEM), '#ffe9b0'); // 弹簧顶板受光
  SPR.springC = _makeSprite(_SPRING_C, _P_ITEM);
  // —— 终点旗 16×14 两帧（旗面金三阶+抖动波纹，描边=暗金棕）——
  SPR.flag = [0, 1].map(function (f) {
    const c = _makeCanvas(16, 14), g = c.getContext('2d');
    g.fillStyle = '#9aa0b0'; g.fillRect(0, 0, 1, 14);          // 旗杆（钢灰非纯黑）
    g.fillStyle = '#e8ecf4'; g.fillRect(0, 0, 1, 7);           // 杆受光半边
    g.fillStyle = '#f8d048'; g.fillRect(0, 0, 1, 2);           // 杆顶金
    g.fillStyle = '#8a6a10'; g.fillRect(1, 0, 10, 8);          // 旗面描边
    g.fillStyle = '#f8d020'; g.fillRect(1, 1, 9, 6);           // 旗面基色
    g.fillStyle = '#ffe878'; g.fillRect(1, 1, 9, 2);           // 上缘受光
    _dithRow(g, 1, 9, 3, '#ffe878', 0);                        // 亮/基 抖动过渡
    g.fillStyle = '#c89010'; g.fillRect(1, 6, 9, 1);           // 下缘阴影
    _dithRow(g, 1, 9, 5, '#c89010', 1);
    g.fillStyle = '#c89010'; g.fillRect(f ? 5 : 6, 3, 2, 2);   // 波纹暗部（两帧位移）
    g.fillStyle = '#fff8c8'; g.fillRect(f ? 8 : 3, 2, 1, 1);   // 扫光点
    return c;
  });
  // —— 检查点旗 16×16 两态（灰/绿各三阶+描边）——
  SPR.checkOff = (function () { // 未激活：灰杆灰旗
    const c = _makeCanvas(16, 16), g = c.getContext('2d');
    g.fillStyle = '#5a6078'; g.fillRect(3, 2, 1, 13);
    g.fillStyle = '#9aa0ac'; g.fillRect(3, 2, 1, 6);
    g.fillStyle = '#3a3a48'; g.fillRect(4, 1, 8, 6);           // 旗描边
    g.fillStyle = '#8a90a0'; g.fillRect(5, 2, 6, 4);
    g.fillStyle = '#b8bcc8'; g.fillRect(5, 2, 6, 1);           // 受光
    _dithRow(g, 5, 10, 4, '#b8bcc8', 0);
    g.fillStyle = '#e8ecf4'; g.fillRect(3, 2, 1, 1);
    return c;
  })();
  SPR.checkOn = (function () { // 激活：白杆绿旗（v5 发光件）
    const c = _makeCanvas(16, 16), g = c.getContext('2d');
    g.fillStyle = '#8a90a0'; g.fillRect(3, 2, 1, 13);
    g.fillStyle = '#e8ecf4'; g.fillRect(3, 2, 1, 7);
    g.fillStyle = '#1e5a24'; g.fillRect(4, 1, 8, 6);           // 旗描边（深墨绿）
    g.fillStyle = '#48d848'; g.fillRect(5, 2, 6, 4);
    g.fillStyle = '#a8f0a8'; g.fillRect(5, 2, 6, 1);           // 受光
    _dithRow(g, 5, 10, 4, '#a8f0a8', 0);
    g.fillStyle = '#2c982c'; g.fillRect(5, 5, 6, 1);           // 阴影缘
    g.fillStyle = '#ffffff'; g.fillRect(6, 3, 1, 1);           // 亮点
    return _glow(c, '#eafff0');
  })();
  // —— 电锯 16×16 两帧（锯齿亮/暗交替+盘面拉丝+左上高光弧+中栓）——
  SPR.saw = [0, 1].map(function (f) {
    const c = _makeCanvas(16, 16), g = c.getContext('2d');
    const cx = 8, cy = 8;
    g.fillStyle = '#8a90a8'; // 锯齿底
    for (let a = 0; a < 360; a += 22.5) {
      const ang = (a + f * 11.25) * Math.PI / 180;
      g.fillRect(Math.round(cx + Math.cos(ang) * 7.4) - 1, Math.round(cy + Math.sin(ang) * 7.4) - 1, 2, 2);
    }
    g.fillStyle = '#d8dce8'; // 锯齿受光齿尖（相位错开）
    for (let a = 0; a < 360; a += 45) {
      const ang = (a + f * 11.25) * Math.PI / 180;
      g.fillRect(Math.round(cx + Math.cos(ang) * 7.4) - 1, Math.round(cy + Math.sin(ang) * 7.4) - 1, 1, 1);
    }
    g.fillStyle = '#4a5060'; // 盘缘彩色描边环
    for (let a = 0; a < 360; a += 12) {
      const ang = a * Math.PI / 180;
      g.fillRect(Math.round(cx + Math.cos(ang) * 6.2), Math.round(cy + Math.sin(ang) * 6.2), 1, 1);
    }
    g.fillStyle = '#9aa0b0'; // 盘面
    g.beginPath(); g.arc(cx, cy, 5.4, 0, _TAU); g.fill();
    for (let a = 0; a < 360; a += 30) { // 金属拉丝（放射状明暗细条，随帧旋转）
      const ang = (a + f * 15) * Math.PI / 180;
      g.fillStyle = (a / 30) % 2 ? '#b8bdc8' : '#7a8090';
      g.fillRect(Math.round(cx + Math.cos(ang) * 3.6), Math.round(cy + Math.sin(ang) * 3.6), 2, 1);
    }
    g.fillStyle = '#ffffff'; // 高光弧（左上 1px 弧线）
    for (let a = 195; a <= 285; a += 15) {
      const ang = a * Math.PI / 180;
      g.fillRect(Math.round(cx + Math.cos(ang) * 4.7), Math.round(cy + Math.sin(ang) * 4.7), 1, 1);
    }
    g.fillStyle = '#5a6070'; // 中心栓
    g.beginPath(); g.arc(cx, cy, 2, 0, _TAU); g.fill();
    g.fillStyle = '#3a4050'; g.fillRect(cx - 2, cy, 4, 1); g.fillRect(cx, cy - 2, 1, 4); // 十字槽
    g.fillStyle = '#e8ecf4'; g.fillRect(cx - 1, cy - 2, 1, 1);                            // 栓高光
    return c;
  });
  // —— 大炮 16×14（朝右；朝左用翻转版）：钢四阶+铆钉+红色 1px 警示灯 ——
  SPR.cannon = (function () {
    const c = _makeCanvas(16, 14), g = c.getContext('2d');
    // 底座：描边→基→受光→暗缝
    g.fillStyle = '#1a2028'; g.fillRect(2, 8, 12, 6);
    g.fillStyle = '#3a4050'; g.fillRect(3, 9, 10, 4);
    g.fillStyle = '#4e586a'; g.fillRect(3, 9, 10, 1);
    g.fillStyle = '#2a303c'; g.fillRect(3, 12, 10, 1);
    g.fillStyle = '#6a7488'; g.fillRect(4, 10, 1, 1); g.fillRect(11, 10, 1, 1); // 座铆钉高光
    g.fillStyle = '#20242e'; g.fillRect(5, 10, 1, 1); g.fillRect(10, 10, 1, 1); // 座铆钉暗点
    // 炮管：描边→亮脊→基→暗腹
    g.fillStyle = '#1a2028'; g.fillRect(8, 2, 8, 8);
    g.fillStyle = '#4a5262'; g.fillRect(9, 3, 6, 6);
    g.fillStyle = '#6a7488'; g.fillRect(9, 3, 6, 1); g.fillRect(9, 3, 1, 6);   // 上/左受光
    g.fillStyle = '#343c4a'; g.fillRect(9, 8, 6, 1);                            // 下缘阴影
    g.fillStyle = '#10141c'; g.fillRect(14, 4, 2, 4);                           // 炮口
    g.fillStyle = '#5a6272'; g.fillRect(13, 3, 1, 6);                           // 口环高光
    g.fillStyle = '#f84848'; g.fillRect(11, 2, 1, 1);                           // 警示灯·红 1px
    return c;
  })();
  SPR.cannonL = flipSprite(SPR.cannon);
  // —— 炮弹 8×6（橙金三阶+受光+暗底，描边=深棕）——
  SPR.bullet = (function () {
    const c = _makeCanvas(8, 6), g = c.getContext('2d');
    g.fillStyle = '#6a2a10'; g.fillRect(0, 0, 8, 6);
    g.fillStyle = '#f8b020'; g.fillRect(1, 1, 6, 4);
    g.fillStyle = '#ffd868'; g.fillRect(1, 1, 6, 1); g.fillRect(1, 1, 1, 2);   // 受光
    g.fillStyle = '#c84818'; g.fillRect(1, 4, 6, 1); g.fillRect(6, 2, 1, 2);   // 阴影
    g.fillStyle = '#fff0a0'; g.fillRect(2, 2, 1, 1);                            // 高光
    return c;
  })();
  // —— 拉杆 12×14 两态（木座三阶+钢柄亮暗+球体三阶高光）——
  SPR.lever = [0, 1].map(function (f) {
    const c = _makeCanvas(12, 14), g = c.getContext('2d');
    g.fillStyle = '#2e2013'; g.fillRect(1, 9, 10, 5);    // 底座描边
    g.fillStyle = '#6a4e30'; g.fillRect(2, 10, 8, 3);    // 木座
    g.fillStyle = '#8a6a44'; g.fillRect(2, 10, 8, 1);    // 受光
    g.fillStyle = '#4a3826'; g.fillRect(2, 12, 8, 1);    // 阴影
    g.fillStyle = '#d8dce8'; g.fillRect(5, 2, 1, 9);     // 钢柄受光棱
    g.fillStyle = '#8a90a8'; g.fillRect(6, 2, 1, 9);     // 钢柄阴影棱
    const bc = f ? '#48d848' : '#f84848';                // 球体（绿/红两态）
    const bl = f ? '#c0ffc0' : '#ffb0a8', bd = f ? '#189018' : '#b02020', bo = f ? '#0e4a14' : '#5a1010';
    g.fillStyle = bo; g.fillRect(2, (f ? 0 : 4), 8, 6);  // 球描边
    g.fillStyle = bc; g.fillRect(3, (f ? 1 : 5), 6, 4);
    g.fillStyle = bl; g.fillRect(3, (f ? 1 : 5), 2, 2);  // 左上高光
    g.fillStyle = bd; g.fillRect(7, (f ? 3 : 7), 2, 1);  // 右下阴影
    g.fillStyle = '#ffffff'; g.fillRect(4, (f ? 2 : 6), 1, 1); // 镜面点
    return c;
  });
  // —— v3：施法金色姿态（蓝主体换金；围巾橙金系保留，art 工单 §E）——
  SPR.heroAttackGold = _makeSprite(_H_ATTACK, _P_HERO_GOLD);
  SPR.heroAttackGoldL = flipSprite(SPR.heroAttackGold);
  // —— v3：星核巨兽部件字典（art 工单 §C5；姿态由 ui 偏移/换帧驱动）——
  const bossBody1 = _buildBossBody(_P_BOSS), bossBodyR1 = _buildBossBody(_P_BOSS_RAGE);
  SPR.boss = {
    body: [bossBody1, _bossBreath(bossBody1)],            // 64×48 ×2（帧2 呼吸）
    bodyRage: [bossBodyR1, _bossBreath(bossBodyR1)],      // 狂暴换装 ×2 同法
    arm: _buildBossArm(_P_BOSS),                          // 20×16（+翻转=右臂）
    armRage: _buildBossArm(_P_BOSS_RAGE),
    jaw: [_makeSprite(_BOSS_JAW_C, _P_BOSS), _makeSprite(_BOSS_JAW_O, _P_BOSS)],      // 闭/开
    jawRage: [_makeSprite(_BOSS_JAW_C, _P_BOSS_RAGE), _makeSprite(_BOSS_JAW_O, _P_BOSS_RAGE)],
    eye: _glow(_makeSprite(_BOSS_EYE, _P_EYE), '#bffcff', true), // 12×10（2px 强化）
    eyeRage: _glow(_makeSprite(_BOSS_EYE_RAGE, _P_EYE_RAGE), '#ffd8c8', true),
    eyeDizzy: _makeSprite(_BOSS_EYE_DIZZY, _P_EYE_RAGE),
    pupil: _makeSprite(_BOSS_PUPIL, _P_PUPIL),            // 4×4 ±2px 追踪
    core: [_glow(_makeSprite(_BOSS_CORE1, _P_BOSS), '#fff3c0'), _glow(_makeSprite(_BOSS_CORE1, _P_CORE2), '#fff3c0')] // 12×12
  };
  // 受击白闪变体：body / arm / 开口 jawO 三张白剪影（§C5）
  SPR.bossWhite = {
    body: _whiteVariant(SPR.boss.body[0]),
    arm: _whiteVariant(SPR.boss.arm),
    jaw: _whiteVariant(SPR.boss.jaw[1])
  };
  // —— v3：技能与战斗特效（art 工单 §D）——
  SPR.meteor = (function () { // U 星陨流星 10×12（帧2 上移 1px+顶点高光；发光件）
    const f1 = _makeSprite(_METEOR_F1, _P_METEOR);
    const f2 = _makeCanvas(f1.width, f1.height), g = f2.getContext('2d');
    g.drawImage(f1, 0, -1);
    g.fillStyle = _P_METEOR.w; g.fillRect(4, 0, 1, 1);
    return [_glow(f1, '#fff8c8'), _glow(f2, '#fff8c8')];
  })();
  SPR.waveFx = [_makeSprite(_WAVE_F1, _P_WAVE), _makeSprite(_WAVE_F1, _P_WAVE2)]; // Boss 冲击波：帧2 换调色板 w↔C
  SPR.bossBullet = (function () { // Boss 弹幕星弹 8×7：帧2 = 翻转（自旋感）
    const f1 = _makeSprite(_BSTAR_F1, _P_BSTAR);
    return [f1, flipSprite(f1)];
  })();
  SPR.heartFull = _glow(_makeSprite(_HEART_F, _P_HEART), '#ffd8e8');    // HP/掉落回复心 8×8（发光件）
  SPR.heartEmpty = _makeSprite(_HEART_F, _P_HEART_E);   // 空心：同网格换暗色
  SPR.skU = _glow(_makeSprite(_SK_U, _P_SKU), '#fff3c0');                 // 技能栏图标 12×12（发光件）
  SPR.skI = _glow(_makeSprite(_SK_I, { k: '#7a4a10', y: '#f8d048', Y: '#c89010', w: '#fff8c8' }), '#fff3c0'); // v5 盾徽重绘
  SPR.skO = _glow(_makeSprite(_SK_O, { k: '#181232', w: '#ffffff', c: '#48d8e8', Y: '#f8d048' }), '#fff3c0'); // v5 竖剑重绘
  // —— v6 第一波·特效队（设计书 §10.1，工单 v6-wave1-fx）：六组新键，既有键零改动 ——
  SPR.blade = [ // 星刃回旋 12×12 双帧（十字/斜十字交替自旋；ui (tick*14|0)%2 取帧，dir<0 flipCache）
    _glow(_makeSprite(_BLADE_F1, _P_BLADE), '#ffe9b0'),
    _glow(_makeSprite(_BLADE_F2, _P_BLADE), '#ffe9b0')];
  SPR.skL = _glow(_makeSprite(_SK_L, _P_SKL), '#fff3c0'); // 技能槽4·星刃回旋图标（金家族同 skU/skI/skO）
  SPR.knightGuard = [ // 骑士举盾 14×18 双帧：帧0=前摇举盾 / 帧1=冲锋盾前顶（基准面左，ui e.face>0 flipCache）
    _makeSprite(_KN_G1, _P_KNIGHT_GUARD), _makeSprite(_KN_G2, _P_KNIGHT_GUARD)];
  SPR.mage = [ // 幽焰法师 14×18 待机两帧（火种明暗+袍摆交替；ui (e.t*3|0)%2，e.face>0 flipCache）
    _makeSprite(_MAGE_1, _P_MAGE), _makeSprite(_MAGE_2, _P_MAGE)];
  SPR.mageCast = _makeSprite(_MAGE_CAST, _P_MAGE); // 读条姿态 14×18 单帧（杖顶火种 3×3，读条 0.8s 期间）
  SPR.fireball = [ // 追踪火球 8×8 双帧（圆焰/焰旋；ui b.fire 分支 (tick*10|0)%2 取帧）
    _glow(_makeSprite(_FIREB_F1, _P_FIREB), '#ffb090'),
    _glow(_makeSprite(_FIREB_F2, _P_FIREB), '#ffb090')];
  // —— v4：谜题神龛（off 暗青石单帧；on 点亮金纹+星光 2 帧；v5 发光件）——
  SPR.shrineOff = _makeSprite(_SHRINE, _P_SH_OFF);
  SPR.shrineOn = [0, 1].map(function (f) { // [大星芒,收暗碎光]；ui 按 (tick*4|0)%2 取帧
    const c = _makeSprite(_SHRINE, _P_SH_ON);
    c.getContext('2d').drawImage(_makeSprite(f ? _SHRINE_STAR2 : _SHRINE_STAR1, f ? _P_STAR2 : _P_STAR1), 4, 0);
    return _glow(c, '#fff3c0');
  });
  // —— v4：谜题覆盖层素材（美术工单 §2/§3：木框拼接件+光标框+数织叉格+金印三阶色）——
  SPR.puzzleUI = {
    cornerTL: _makeSprite(_PZ_CORNER_TL, _P_PZWOOD),
    cornerTR: _makeSprite(_PZ_CORNER_TR, _P_PZWOOD),
    cornerBL: _makeSprite(_PZ_CORNER_BL, _P_PZWOOD),
    cornerBR: _makeSprite(_PZ_CORNER_BR, _P_PZWOOD),
    edgeH: _makeSprite(_PZ_EDGE_H, _P_PZWOOD),
    edgeV: _makeSprite(_PZ_EDGE_V, _P_PZWOOD),
    cursor: _makeSprite(_PZ_CURSOR, _P_PZCUR),
    xmark: _makeSprite(_PZ_XMARK, _P_PZX),
    gold: '#f8d048',  // 主题无关金色印章色（工单 §3 指定值）
    goldD: '#c89010', // 印章暗部（金纹同族）
    goldL: '#fff8c8'  // 印章高光
  };
  // —— v5 风格队：SPR.cover 封面素材（工单 §G，封面队消费）——
  SPR.cover = (function () {
    const cv = {};
    // heroSil 24×28：_H_JUMP 放大剪影+剑上指+左上外缘金边
    const hs = _makeCanvas(24, 28), hg = hs.getContext('2d'), hp = new Uint8Array(672);
    hg.fillStyle = '#0a0e22';
    for (let y = 0; y < 28; y++) for (let x = 0; x < 24; x++)
      if (_H_JUMP[y * 16 / 28 | 0][x * 16 / 24 | 0] !== '.') { hg.fillRect(x, y, 1, 1); hp[y * 24 + x] = 1; }
    for (let j = 0; j < 8; j++) { const bx = Math.min(21, 18 + (j >> 1)); hg.fillRect(bx, 10 - j, 2, 1); hp[(10 - j) * 24 + bx] = hp[(10 - j) * 24 + bx + 1] = 1; }
    const sol = function (x, y) { return x >= 0 && y >= 0 && x < 24 && y < 28 && hp[y * 24 + x]; };
    const r1 = new Uint8Array(672);
    hg.fillStyle = '#f8d048';
    for (let y = 0; y < 28; y++) for (let x = 0; x < 24; x++)
      if (!sol(x, y) && (sol(x + 1, y) || sol(x, y + 1) || sol(x + 1, y + 1))) { hg.fillRect(x, y, 1, 1); r1[y * 24 + x] = 1; }
    hg.fillStyle = _rgba('#f8d048', 0.4);
    for (let y = 0; y < 28; y++) for (let x = 0; x < 24; x++)
      if (!sol(x, y) && !r1[y * 24 + x] && (r1[y * 24 + x + 1] || r1[(y + 1) * 24 + x] || r1[(y + 1) * 24 + x + 1])) hg.fillRect(x, y, 1, 1);
    cv.heroSil = hs;
    // bossSil 104×56：巨兽剪影+双眼+核心微光+右上缘暖边
    const bs = _makeCanvas(104, 56), bg = bs.getContext('2d'), bp = new Uint8Array(5824);
    const BP = function (x, y) { if (x >= 0 && x < 104 && y >= 0 && y < 56) { bg.fillRect(x, y, 1, 1); bp[y * 104 + x] = 1; } };
    bg.fillStyle = '#141028';
    for (let y = 12; y < 56; y++) { // 上壳椭圆（中心 (52,36) rx50 ry24）
      const hw = Math.round(50 * Math.sqrt(Math.max(0, 1 - (y - 36) * (y - 36) / 576)));
      for (let x = 52 - hw; x < 52 + hw; x++) BP(x, y);
    }
    for (let y = 34; y < 56; y++) for (let x = 0; x < Math.min(16, y - 22); x++) BP(x, y); // 前臂+腿桩×2
    for (let y = 44; y < 56; y++) for (let x = 20; x < 34; x++) BP(x, y);
    for (let y = 44; y < 56; y++) for (let x = 70; x < 84; x++) BP(x, y);
    [[16, 3], [38, 5], [60, 4], [82, 3]].forEach(function (sp) { // 背脊刺
      for (let j = 0; j < sp[1]; j++) for (let x = sp[0] + j; x < sp[0] + j + Math.max(1, 5 - j * 2); x++) BP(x, 12 - sp[1] + j);
    });
    bg.fillStyle = '#4a3a7e'; // 右上缘暖边（上/右外缘）
    for (let y = 0; y < 56; y++) for (let x = 0; x < 104; x++)
      if (!bp[y * 104 + x] && ((bp[(y + 1) * 104 + x] || (x > 0 && y < 40 && bp[y * 104 + x - 1])))) bg.fillRect(x, y, 1, 1);
    bg.fillStyle = '#38e8f8'; bg.fillRect(30, 20, 2, 2); bg.fillRect(70, 20, 2, 2); // 双眼
    bg.fillStyle = '#f8d048'; bg.fillRect(51, 34, 1, 1); // 背部核心微光
    cv.bossSil = bs;
    // meteorStreak[2] 26×8：白亮头部+金→暗渐细尾；帧2 暗一档
    cv.meteorStreak = [0, 1].map(function (f) {
      const c = _makeCanvas(26, 8), g2 = c.getContext('2d');
      for (let i = 0; i < 26; i++) {
        const d = 25 - i, w = d < 4 ? 3 : d < 12 ? 2 : 1;
        if (d > 20) continue;
        g2.fillStyle = d < 3 ? '#fff8c8' : d < 9 ? '#f8d048' : '#c89828';
        g2.globalAlpha = d < 18 ? 1 : 0.4;
        g2.fillRect(i, 4 - (w >> 1), 1, w);
      }
      g2.globalAlpha = 1;
      g2.fillStyle = '#ffffff'; g2.fillRect(23, 3, 3, 3);
      if (f) { g2.globalCompositeOperation = 'source-atop'; g2.fillStyle = 'rgba(24,16,48,0.45)'; g2.fillRect(0, 0, 26, 8); }
      return c;
    });
    // cloudA/B/C 512×80 可平铺三层云海
    const cloud = function (top, shad, n, sea) {
      const c = _makeCanvas(512, 80), g2 = c.getContext('2d'), rc = _mulberry32(n * 131 + (sea ? 7 : 0));
      if (sea) { g2.fillStyle = top; g2.fillRect(0, 46, 512, 34); }
      for (let i = 0; i < n; i++) {
        const x = i * 512 / n + rc() * 30 | 0, y = sea ? 24 + rc() * 16 | 0 : 6 + rc() * 40 | 0;
        const w = (sea ? 60 : 36) + rc() * 50 | 0, h = (sea ? 14 : 8) + rc() * 8 | 0;
        _wrap3(g2, 512, function (ox) {
          g2.fillStyle = top;
          g2.fillRect(x + ox, y, w, h); g2.fillRect(x + ox + (w >> 2), y - (h >> 1), w >> 1, (h >> 1) + 2);
          g2.fillStyle = shad; g2.fillRect(x + ox + 2, y + h, w - 4, 2); // 底影线
        });
      }
      return c;
    };
    cv.cloudA = cloud('#e8f2ff', '#c7dcec', 14, false);
    cv.cloudB = cloud('#cfe0f4', '#a8c0dc', 10, false);
    cv.cloudC = cloud('#5a6a94', '#3c4a72', 8, true);
    return cv;
  })();
  // —— v6 第二波·外观队（工单 v6-wave2-look）：键名=bag 工单冻结接口（ui 逐字消费）；下标 0/1/2=
  // 档1 木布/档2 秘银/档3 金星辉（ui look(r)=r<2?0:r<4?1:2 取档）；top 偏移=分区锚点 7/0/5。
  SPR.look = {
    weapon: [_lookSprite(_LOOK_W1, 7, _P_LOOK_W1), _lookSprite(_LOOK_W2, 7, _P_LOOK_W2), _lookSprite(_LOOK_W3, 7, _P_LOOK_W3)],
    hat: [_lookSprite(_LOOK_H1, 0, _P_LOOK_H1), _lookSprite(_LOOK_H2, 0, _P_LOOK_H2), _lookSprite(_LOOK_H3, 0, _P_LOOK_H3)],
    cape: [_lookSprite(_LOOK_C1, 5, _P_LOOK_C1), _lookSprite(_LOOK_C2, 5, _P_LOOK_C2), _lookSprite(_LOOK_C3, 5, _P_LOOK_C3)]
  };
  SPR.icoW = _makeSprite(_ICO_W, _P_ICO);         // 武器槽图标 12×12 灰阶基准稿（ui 叠稀有度色）
  SPR.icoH = _makeSprite(_ICO_H, _P_ICO);         // 头饰槽图标
  SPR.icoC = _makeSprite(_ICO_C, _P_ICO);         // 披风槽图标
  SPR.icoBag = _makeSprite(_ICO_BAG, _P_ICO_BAG); // HUD 背包钮图标（金棕+金扣，非灰阶不叠色）
  // —— v7（工单 §3/§5）：新敌/机关精灵，既有键零改动 ——
  SPR.lancer = [ // 枪虾 14×14 两帧（面左；帧2 矛前伸 1px；ui e.face>0 flipCache，wind 用帧 2）
    _makeSprite(_LANCER_1, _P_LANCER), _makeSprite(_LANCER_2, _P_LANCER)];
  SPR.jelly = [ // 水母 12×12 两帧（帧2 伞缘收缩；电弧=ui 程序化）
    _makeSprite(_JELLY_1, _P_JELLY), _makeSprite(_JELLY_2, _P_JELLY)];
  SPR.ghost = [ // 幽灵 12×14 两帧（帧2 下摆偏摆；ui globalAlpha 0.78）
    _makeSprite(_GHOST_1, _P_GHOST), _makeSprite(_GHOST_2, _P_GHOST)];
  SPR.boomer = [ // 魂火 10×10 两帧（帧2 膨胀；自爆演出=引擎粒子）
    _makeSprite(_BOOMER_1, _P_BOOMER), _makeSprite(_BOOMER_2, _P_BOOMER)];
  SPR.eliteCrown = _makeSprite(_V7_CROWN, _P_CROWN); // 精英金冠 8×6（缺省 ui 跳过）
  SPR.chest = [ // 宝箱 16×14 两帧（'g' 隐藏房奖励）
    _makeSprite(_CHEST_1, _P_CHEST), _makeSprite(_CHEST_2, _P_CHEST)];
  SPR.lantern = [ // 灯笼 12×16 两帧（内焰黄/白；'R' 光源实体）
    _makeSprite(_LANTERN_1, _P_LANTERN), _makeSprite(_LANTERN_2, _P_LANTERN)];
  // —— v7（工单 §4）：Boss 部件组，键集合=SPR.boss+coreRage；ui 按
  //      [SPR.boss,SPR.boss2,SPR.boss3][kind] 装配（§9.3）；白剪影沿 bossWhite 先例。
  function _mkV7Boss(bodyFn, P) { // 内部：Boss 部件组装配（蛟龙/判官共用，差异=调色/体建器）
    const body = bodyFn(P.b), bodyR = bodyFn(P.bR);
    return {
      body: [body, _bossBreath(body)], bodyRage: [bodyR, _bossBreath(bodyR)],             // ×2 帧2 呼吸
      arm: _buildBossArm(P.b), armRage: _buildBossArm(P.bR),                              // 20×16 右臂=翻转
      jaw: [_makeSprite(_BOSS_JAW_C, P.b), _makeSprite(_BOSS_JAW_O, P.b)],                // 闭/开 20×8
      jawRage: [_makeSprite(_BOSS_JAW_C, P.bR), _makeSprite(_BOSS_JAW_O, P.bR)],
      eye: _glow(_makeSprite(_BOSS_EYE, P.e), P.eyeRim, true),                            // 12×10
      eyeRage: _glow(_makeSprite(_BOSS_EYE_RAGE, P.eR), '#ffd8c8', true),
      eyeDizzy: _makeSprite(_BOSS_EYE_DIZZY, P.eR),
      pupil: _makeSprite(_BOSS_PUPIL, P.u),                                               // 4×4
      core: [_glow(_makeSprite(_BOSS_CORE1, P.c1), P.coreRim),
             _glow(_makeSprite(_BOSS_CORE1, P.c2), P.coreRim)],                           // 12×12 ×2
      coreRage: [_glow(_makeSprite(_BOSS_CORE1, P.c1r), '#ffd8c8'),
                 _glow(_makeSprite(_BOSS_CORE1, P.c2r), '#ffd8c8')]
    };
  }
  SPR.boss2 = _mkV7Boss(_buildDragonBody, { // 蛟龙·敖渊（64×40 长躯，青金配色；kind=2）
    b: _P_DRAGON, bR: _P_DRAGON_RAGE,
    e: _P_DRAGON_EYE, eR: _P_DRAGON_EYE_R, u: _P_DRAGON_PUPIL,
    c1: _P_DRAGON_CORE, c2: _P_DRAGON_CORE2, c1r: _P_DRAGON_CORE_R, c2r: _P_DRAGON_CORE_R2,
    eyeRim: '#c8fcff', coreRim: '#fff3c0'
  });
  SPR.boss3 = _mkV7Boss(_buildJudgeBody, { // 幽冥判官（40×52 高袍+官帽，暗紫+鬼火绿；kind=3）
    b: _P_JUDGE, bR: _P_JUDGE_RAGE,
    e: _P_JUDGE_EYE, eR: _P_JUDGE_EYE_R, u: _P_JUDGE_PUPIL,
    c1: _P_JUDGE_CORE, c2: _P_JUDGE_CORE2, c1r: _P_JUDGE_CORE_R, c2r: _P_JUDGE_CORE_R2,
    eyeRim: '#c8ffe0', coreRim: '#d8ffe8'
  });
  SPR.boss2White = { // 白剪影三件（沿 bossWhite 先例）
    body: _whiteVariant(SPR.boss2.body[0]),
    arm: _whiteVariant(SPR.boss2.arm),
    jaw: _whiteVariant(SPR.boss2.jaw[1])
  };
  SPR.boss3White = {
    body: _whiteVariant(SPR.boss3.body[0]),
    arm: _whiteVariant(SPR.boss3.arm),
    jaw: _whiteVariant(SPR.boss3.jaw[1])
  };
  // v7.9：kind4 冥古龙 / kind5 圣裁者 —— 装配口径与 boss2/boss3 逐字一致（同一 _mkV7Boss，
  //   只换体建器与调色板），故键集合自动等于 SPR.boss2；白剪影三件同构（body/arm/开口 jaw）。
  SPR.boss4 = _mkV7Boss(_buildUnderDragonBody, { // 冥古龙（64×48 骨角破翼四足，暗紫黑+熔岩橙；kind=4）
    b: _P_UND, bR: _P_UND_RAGE,
    e: _P_UND_EYE, eR: _P_UND_EYE_R, u: _P_UND_PUPIL,
    c1: _P_UND_CORE, c2: _P_UND_CORE2, c1r: _P_UND_CORE_R, c2r: _P_UND_CORE_R2,
    eyeRim: '#d8641c', coreRim: '#ffd8a0'
  });
  SPR.boss4White = {
    body: _whiteVariant(SPR.boss4.body[0]),
    arm: _whiteVariant(SPR.boss4.arm),
    jaw: _whiteVariant(SPR.boss4.jaw[1])
  };
  SPR.boss5 = _mkV7Boss(_buildSeraphBody, { // 曜光·圣裁者（44×52 光环光翼面具，象牙白+淡金；kind=5）
    b: _P_SERA, bR: _P_SERA_RAGE,
    e: _P_SERA_EYE, eR: _P_SERA_EYE_R, u: _P_SERA_PUPIL,
    c1: _P_SERA_CORE, c2: _P_SERA_CORE2, c1r: _P_SERA_CORE_R, c2r: _P_SERA_CORE_R2,
    eyeRim: '#fffbe8', coreRim: '#fffbe8'
  });
  SPR.boss5White = {
    body: _whiteVariant(SPR.boss5.body[0]),
    arm: _whiteVariant(SPR.boss5.arm),
    jaw: _whiteVariant(SPR.boss5.jaw[1])
  };
  // v12：kind6 烈焰·牛魔王 —— 装配口径与 boss2~boss5 逐字一致（同一 _mkV7Boss，只换体建器与调色板），
  //   故键集合自动等于 SPR.boss2（body/bodyRage/arm/armRage/jaw/jawRage/eye/eyeRage/eyeDizzy/pupil/core/coreRage）；
  //   白剪影三件同构（body/arm/开口 jaw），照 boss4White 的生成方式。
  SPR.boss6 = _mkV7Boss(_buildBullDemonBody, { // 烈焰·牛魔王（56×48 双弯角牛头+熔核炉口，暗红+橙金；kind=6）
    b: _P_NIU, bR: _P_NIU_RAGE,
    e: _P_NIU_EYE, eR: _P_NIU_EYE_R, u: _P_NIU_PUPIL,
    c1: _P_NIU_CORE, c2: _P_NIU_CORE2, c1r: _P_NIU_CORE_R, c2r: _P_NIU_CORE_R2,
    eyeRim: '#ffd08a', coreRim: '#ffd8a0'
  });
  SPR.boss6White = {
    body: _whiteVariant(SPR.boss6.body[0]),
    arm: _whiteVariant(SPR.boss6.arm),
    jaw: _whiteVariant(SPR.boss6.jaw[1])
  };
  // v13：三件新危险物素材（spec §七 尺寸逐字：16×16 / 24×32 / 24×64）——生成后立即冻结；
  //   既有 SPR 键一律不动（ui 侧按 (SPR.xxx || 程序化兜底) 取用）。
  SPR.bomb = _frozenSpr(_makeSprite(_BOMB, _P_BOMB));
  SPR.mirror = _frozenSpr(_makeSprite(_mirrorGrid(), _P_MIRROR));
  SPR.pushwall = _frozenSpr(_makeSprite(_pushwallGrid(), _P_PUSHWALL));
  // v16：SPR.totem 16×32（hazard.kind='totem'，boss5 圣像审判）——冻结口径同上，尺寸即 BAL.boss5.totem.w/h。
  SPR.totem = _frozenSpr(_makeSprite(_TOTEM, _P_TOTEM));
  // —— v7.7：预生成 blue 皮肤帧对象（纯引用上面已画好的 hero* 帧，零额外像素绘制，耗时≈0）；
  //     其余 19 套留待 ui 首次取用时惰性生成，启动期不付 19×20 张画布的钱。——
  getHeroSkin('blue');
  return SPR;
}

/* ==================== 十主题配色（契约导出，颜色全 #rrggbb） ====================
 * v5（设计书 §5.3/工单 §A）：主色板照抄设计书表；派生阶按表内规则计算——
 * blockL=mix(block,#fff6e0,.38)/blockD=.45/blockS=.68/speck=.30、far/near=mix(skyB,#463a72,.16/.34)、
 * capL=mix(cap,#fff6e0,.42)/capD=.42/capS=.66、plankL=mix(plank,#fff6e0,.34)/plankD=.45。 */
function _th(nm, st, sb, bl, cp, pk, ac, dc, du, bd, ex) { // 内部：主题工厂（依序=名/skyT/skyB/block/cap/plank/accent/decor/dust/band/extra）
  const M = _mixHex, X = '#463a72', Y = '#fff6e0';
  const t = { name: nm, skyT: st, skyB: sb,
    far: M(sb, X, 0.16), near: M(sb, X, 0.34),
    block: bl, blockD: M(bl, X, 0.45), blockL: M(bl, Y, 0.38),
    blockS: M(bl, X, 0.68), speck: M(bl, X, 0.30),
    cap: cp, capD: M(cp, X, 0.42), capL: M(cp, Y, 0.42), capS: M(cp, X, 0.66),
    plank: pk, plankD: M(pk, X, 0.45), plankL: M(pk, Y, 0.34), accent: ac,
    decor: dc, dust: du };
  if (ex) for (const k in ex) t[k] = ex[k]; // dark 先于 band（顺序同前版）
  t.band = bd;
  return t;
}
const THEMES = {
  grass: _th('晴空草原', '#4a9fe8', '#bfe8ff', '#d8a05c', '#38c860', '#c88848', '#f8a030',
    ['bush', 'tallgrass', 'flower', 'boulder', 'mushroom', 'stump', 'tallgrass', 'flower'], '#eef4ff', '#ffe9b8'),
  cave: _th('星辉洞窟', '#2c2a58', '#5a5694', '#6a72a8', '#40d8b0', '#5a6288', '#64e8d8',
    ['crystal', 'glowworm', 'stalagmite', 'mushroom', 'boulder', 'crystalS', 'stalagmite'], '#a8b4e8', '#40d8b0', { dark: true }),
  sky: _th('云海天穹', '#58b8f0', '#e8f6ff', '#eef2fa', '#ffffff', '#d8e4f4', '#f8b020',
    ['cloudpot', 'cloudsmall', 'flower', 'tulip', 'balloon', 'pinwheel', 'cloudsmall'], '#ffffff', '#ffffff'),
  factory: _th('鎏金工殿', '#3a4a72', '#6a7ea8', '#8898b8', '#e0a848', '#6a7890', '#f8c040',
    ['gear', 'chain', 'valve', 'lamp', 'barrel', 'vent', 'gear', 'chain'], '#c8d4ec', '#f8c040', { dark: true }),
  lava: _th('落日熔渊', '#582840', '#a84828', '#5a4458', '#f89038', '#7a5560', '#f8d048',
    ['torch', 'skull', 'flamepillar', 'ribcage', 'lavarock', 'obsidian', 'torch', 'flamepillar'], '#f8b078', '#f86038', { dark: true, lavaGlow: '#f86038' }),
  tower: _th('星夜高塔', '#1e2452', '#42407e', '#8a7cc0', '#b8a8e8', '#7060a0', '#58e8f0',
    ['torch', 'candelabra', 'flagbanner', 'urn', 'crystal', 'gear', 'flagbanner'], '#c0b8f0', '#8878f0', { dark: true }),
  boss: _th('星核虚空', '#140f36', '#2e2260', '#4a3a7e', '#a070ff', '#5a4a8e', '#f8d048',
    ['crystal', 'torch', 'skull', 'crystal'], '#b8a0f8', '#f8d048', { dark: true }),
  wind: _th('翡翠风谷', '#52c8e8', '#e0fbf0', '#58b878', '#64e896', '#a8d068', '#f8f0a0',
    ['windmill', 'tallgrass', 'flower', 'pinwheel', 'cloudsmall'], '#eafff4', '#fff8c8'),
  castle: _th('落日王城', '#f8a850', '#fce8b8', '#d8c8b0', '#f0b848', '#b0885c', '#e86038',
    ['flagbanner', 'candelabra', 'torch', 'urn', 'boulder'], '#ffe8c0', '#ffd080'),
  star: _th('星空回廊', '#0e1238', '#2c3472', '#5a6ac0', '#8ea0ff', '#4a5a9a', '#f8e8a0',
    ['starflower', 'crystal', 'urn', 'chain'], '#a8b4ff', '#8ea0ff', { dark: true }),
  // —— v7（工单 §1）：cap/plank/accent=注释钉值（贝壳砂/沉船木/金，专名同设计书 §3.1）；
  //      sea speck 经 ex 覆盖；dust/band 未钉自选。sea 不设 dark。
  sea: _th('东海龙宫', '#1a5ac8', '#7ed8f0', '#2a7ac0', '#d8c8a0', '#6a4a30', '#ffd870',
    ['coral', 'shell', 'kelp'], '#c8f0ff', '#a8e0f0', { speck: '#f8f0c8' }),
  nether: _th('幽冥地府', '#101828', '#2c3448', '#3a3450', '#68e8a0', '#5a4a6a', '#f86048',
    ['ghostflame', 'bone', 'skull'], '#88e8b0', '#3a9a6c', { dark: true })
};

/* ==================== 内部：主题材质母题（画进瓦片本体，v5 三阶 cel 硬边） ==================== */
const _TILE_MOTIF = { // v5：图形不变，色值对齐新色板，斑块硬切
  grass: function (g, th, rnd) { // 泥土：小石子（受光/阴影两阶）+ 须根
    for (let i = 0; i < 2; i++) {
      const x = 4 + i * 5 + Math.floor(rnd() * 2), y = 6 + Math.floor(rnd() * 3);
      g.fillStyle = '#e3c9a2'; g.fillRect(x, y, 2, 1); g.fillRect(x, y + 1, 1, 1);
      g.fillStyle = '#a37e62'; g.fillRect(x + 1, y + 1, 1, 1);
    }
    g.fillStyle = th.blockS;
    g.fillRect(5, 11, 1, 2); g.fillRect(6, 12, 1, 1);
    g.fillRect(10, 10, 1, 2); g.fillRect(9, 11, 1, 1);
  },
  cave: function (g, th, rnd) { // 岩面：苔藓斑块（硬边）+ 角落微光晶体（亮青点）
    g.fillStyle = th.capD;
    g.fillRect(4, 10, 4, 3); g.fillRect(10, 5, 3, 2);
    g.fillStyle = '#90e5c4'; g.fillRect(13, 12, 1, 2); g.fillRect(2, 6, 1, 1);
    g.fillStyle = '#eafff8'; g.fillRect(13, 11, 1, 1);
  },
  sky: function (g, th, rnd) { // 云石：柔云漩纹（受光/阴影各一笔）
    g.fillStyle = '#ffffff'; g.fillRect(4, 6, 3, 1); g.fillRect(9, 10, 3, 1);
    g.fillStyle = th.blockD; g.fillRect(6, 7, 2, 1); g.fillRect(11, 11, 2, 1);
  },
  factory: function (g, th, rnd) { // 金属：铆钉四角 + 警示斜纹条 + 锈斑
    g.fillStyle = th.blockS;
    g.fillRect(2, 6, 1, 1); g.fillRect(13, 6, 1, 1); g.fillRect(2, 12, 1, 1); g.fillRect(13, 12, 1, 1);
    g.fillStyle = '#b5bcc7';
    g.fillRect(3, 7, 1, 1); g.fillRect(12, 7, 1, 1); g.fillRect(3, 11, 1, 1); g.fillRect(12, 11, 1, 1);
    for (let i = 0; i < 5; i++) { // 警示斜纹（暗金/暗缝 45° 交替）
      g.fillStyle = i % 2 ? '#c89010' : th.blockS;
      g.fillRect(4 + i, 13 - i, 1, 1); g.fillRect(9 + i, 13 - i, 1, 1);
    }
    g.fillStyle = '#a05828'; g.fillRect(6, 7, 2, 1); g.fillRect(7, 8, 1, 1); // 锈斑
    g.fillStyle = '#c87838'; g.fillRect(6, 7, 1, 1);
  },
  lava: function (g, th, rnd) { // 黑玄武岩：发光裂纹（橙红裂纹+亮黄芯+暗红缘）
    g.fillStyle = '#f86038';
    g.fillRect(4, 6, 1, 3); g.fillRect(5, 8, 2, 1); g.fillRect(6, 9, 1, 2);
    g.fillRect(11, 5, 1, 2); g.fillRect(10, 7, 2, 1);
    g.fillStyle = '#f8d060';
    g.fillRect(4, 6, 1, 1); g.fillRect(6, 10, 1, 1); g.fillRect(11, 5, 1, 1);
    g.fillStyle = '#a83018';
    g.fillRect(5, 6, 1, 1); g.fillRect(3, 9, 1, 1); g.fillRect(12, 7, 1, 1); g.fillRect(5, 11, 1, 1);
  },
  tower: function (g, th, rnd) { // 紫砖：砖缝 + 符文刻痕（青）+ 苔点
    g.fillStyle = th.blockS;
    g.fillRect(3, 8, 8, 1);
    g.fillRect(7, 5, 1, 3); g.fillRect(11, 9, 1, 3); g.fillRect(4, 9, 1, 3);
    g.fillStyle = '#58e8f0';
    g.fillRect(5, 5, 1, 2); g.fillRect(4, 6, 3, 1);
    g.fillRect(12, 11, 1, 2);
    g.fillStyle = '#2c8a96'; g.fillRect(6, 6, 1, 1);
    g.fillStyle = th.capD; g.fillRect(4, 13, 1, 1); g.fillRect(12, 5, 1, 1); g.fillRect(13, 6, 1, 1);
  },
  sea: function (g, th, rnd) { // v7 珊瑚礁：多孔+贝壳金+珊瑚芽
    g.fillStyle = th.blockS;
    g.fillRect(4, 6, 2, 1); g.fillRect(5, 7, 1, 1); g.fillRect(10, 10, 2, 1); g.fillRect(3, 12, 1, 1); g.fillRect(12, 4, 1, 2);
    g.fillStyle = th.accent;
    g.fillRect(7, 9, 2, 1); g.fillRect(12, 8, 1, 1);
    g.fillStyle = '#f8f0c8'; g.fillRect(7, 9, 1, 1);
    g.fillStyle = '#f86078';
    g.fillRect(2, 5, 1, 1); g.fillRect(13, 12, 1, 1);
    g.fillStyle = '#c83858'; g.fillRect(2, 6, 1, 1);
  },
  nether: function (g, th, rnd) { // v7 玄武岩：节理+骨白刻痕+鬼火苔点
    g.fillStyle = th.blockS;
    g.fillRect(3, 4, 1, 3); g.fillRect(4, 7, 1, 1); g.fillRect(10, 8, 3, 1); g.fillRect(9, 9, 1, 2);
    g.fillStyle = '#e8e8d8';
    g.fillRect(6, 5, 2, 1); g.fillRect(12, 11, 2, 1);
    g.fillStyle = '#b8b8a8'; g.fillRect(5, 10, 2, 1);
    g.fillStyle = '#68e8a0';
    g.fillRect(2, 12, 1, 1); g.fillRect(13, 5, 1, 1);
  }
};

/* ==================== 程序化瓦片（16×16，三阶 cel 硬边：亮/固有/影+暗缝） ====================
 * v5（§5.2/工单 §B）：受光=左上，色带硬切；瓦片函数抖动全删（仅存 makeBG 远景）。 */
function _paintBlock(g, th, key, seed) { // 内部：实心砖三阶硬边+斑点+母题
  const rnd = _mulberry32(seed);
  g.fillStyle = th.block; g.fillRect(0, 0, 16, 16);                 // 固有色
  g.fillStyle = th.blockL; g.fillRect(0, 0, 16, 3); g.fillRect(0, 3, 2, 3); // 亮面硬边
  g.fillStyle = th.blockD; g.fillRect(0, 12, 16, 4); g.fillRect(13, 3, 3, 9); // 影面硬边
  g.fillStyle = th.blockS; g.fillRect(0, 15, 16, 1); g.fillRect(15, 0, 1, 16); // 暗缝 1px
  for (let i = 0; i < 3; i++) { // 斑点 3 枚
    g.fillStyle = i % 2 ? th.speck : th.blockS;
    g.fillRect(4 + Math.floor(rnd() * 8), 5 + Math.floor(rnd() * 5), 2, 1);
  }
  if (key && _TILE_MOTIF[key]) _TILE_MOTIF[key](g, th, rnd);                  // 母题保留
}

function blockTile(th, capped, key) { // 实心砖；capped=顶部盖层（地表用）
  const c = _makeCanvas(16, 16), g = c.getContext('2d');
  _paintBlock(g, th, key, 4321);
  if (capped) { // 盖层：三阶硬边（capL 上 2px / cap 中 2px / capD 下 1px 分界线，不再抖动）
    g.fillStyle = th.capL; g.fillRect(0, 0, 16, 2);
    g.fillStyle = th.cap; g.fillRect(0, 2, 16, 2);
    g.fillStyle = th.capD; g.fillRect(0, 4, 16, 1);
    g.fillStyle = th.capS;
    g.fillRect(0, 3, 1, 1); g.fillRect(15, 3, 1, 1); // 盖层两角暗点
    g.fillStyle = th.cap; // 草簇/苔须垂下
    g.fillRect(2, 5, 1, 2); g.fillRect(7, 5, 1, 1); g.fillRect(12, 5, 1, 2); g.fillRect(9, 5, 1, 1);
    g.fillStyle = th.capD; g.fillRect(4, 5, 1, 1); g.fillRect(14, 5, 1, 1);
    if (key === 'grass') { // 偶发小花/蘑菇帽顶（确定性摆放）
      g.fillStyle = '#f8a0c0'; g.fillRect(4, 0, 1, 1); g.fillRect(5, 0, 1, 1);
      g.fillStyle = '#fff0f8'; g.fillRect(4, 1, 1, 1);
      g.fillStyle = '#e84838'; g.fillRect(11, 0, 2, 1);
      g.fillStyle = '#fff0e8'; g.fillRect(11, 1, 1, 1);
    }
    if (key === 'cave' || key === 'tower') { // 苔盖微光矿点
      g.fillStyle = '#e8fff8'; g.fillRect(6, 0, 1, 1);
    }
  }
  return c;
}

function plankTile(th) { // 单向平台（薄板）：三阶硬边+受光棱+木纹+底部投影暗示
  const c = _makeCanvas(16, 16), g = c.getContext('2d');
  const pl = th.plankL || _mixHex(th.plank, '#ffffff', 0.3);
  g.fillStyle = th.plank; g.fillRect(0, 3, 16, 4);
  g.fillStyle = pl; g.fillRect(0, 3, 16, 1);             // 边缘受光 1px（硬切）
  g.fillStyle = th.plankD; g.fillRect(0, 6, 16, 1);      // 板底阴影（硬切）
  g.fillStyle = _mixHex(th.plankD, '#0a0e22', 0.35);     // 端头暗缝描边
  g.fillRect(0, 3, 1, 4); g.fillRect(15, 3, 1, 4);
  g.fillStyle = th.plankD;                               // 板缝+木纹
  g.fillRect(5, 3, 1, 4); g.fillRect(11, 3, 1, 4);
  g.fillRect(2, 5, 2, 1); g.fillRect(8, 4, 2, 1); g.fillRect(13, 5, 1, 1);
  g.fillStyle = pl; g.fillRect(8, 4, 1, 1);              // 木纹高光点
  g.fillStyle = _rgba('#0a0e22', 0.28); g.fillRect(0, 8, 16, 1); // 底部投影暗示
  return c;
}

function iceTile() { // 冰面（低摩擦，固定冷色）：三阶硬边+裂纹高光+暗缝
  const c = _makeCanvas(16, 16), g = c.getContext('2d');
  g.fillStyle = '#a8d8f0'; g.fillRect(0, 0, 16, 16);            // 基色
  g.fillStyle = '#c8ecfc'; g.fillRect(0, 0, 16, 5); g.fillRect(0, 0, 4, 16); // 受光左上（硬边）
  g.fillStyle = '#78a8c8'; g.fillRect(5, 10, 11, 6); g.fillRect(12, 5, 4, 5); // 阴影右下（硬边）
  g.fillStyle = '#587ca0'; g.fillRect(0, 15, 16, 1); g.fillRect(15, 0, 1, 16); // 暗缝
  g.fillStyle = '#e8f8ff';                                       // 斜向裂纹（受光）
  g.fillRect(3, 3, 1, 5); g.fillRect(4, 8, 1, 1); g.fillRect(9, 4, 4, 1); g.fillRect(6, 12, 1, 2);
  g.fillStyle = '#ffffff'; g.fillRect(4, 2, 1, 1); g.fillRect(11, 6, 1, 1);    // 星芒闪光
  return c;
}

function crumbleTile(th) { // 崩塌砖：与实心砖同规格三阶硬边 + 裂纹警示（端点受光）
  const c = _makeCanvas(16, 16), g = c.getContext('2d');
  _paintBlock(g, th, null, 9017);
  g.fillStyle = th.blockS;
  g.fillRect(3, 2, 1, 5); g.fillRect(4, 7, 3, 1); g.fillRect(7, 8, 1, 4); g.fillRect(8, 12, 3, 1);
  g.fillRect(11, 3, 1, 4); g.fillRect(12, 7, 2, 1); g.fillRect(13, 8, 1, 3);
  g.fillStyle = th.blockL;
  g.fillRect(2, 2, 1, 1); g.fillRect(12, 3, 1, 1); g.fillRect(7, 7, 1, 1);
  return c;
}

function toggleTile(color, dark) { // 拉杆切换砖：三阶硬边+四角铆钉+中央徽标
  const c = _makeCanvas(16, 16), g = c.getContext('2d');
  const lit = _mixHex(color, '#ffffff', 0.38);
  const seam = _mixHex(dark, '#0a0e22', 0.45);
  g.fillStyle = color; g.fillRect(0, 0, 16, 16);
  g.fillStyle = dark; g.fillRect(3, 10, 13, 6); g.fillRect(11, 4, 5, 6);   // 影面（硬边）
  g.fillStyle = lit; g.fillRect(0, 0, 16, 4); g.fillRect(0, 0, 3, 10);     // 亮面（硬边）
  g.fillStyle = seam; g.fillRect(0, 15, 16, 1); g.fillRect(15, 0, 1, 16);  // 暗缝
  g.fillStyle = seam; // 四角铆钉（暗点）
  g.fillRect(2, 2, 1, 1); g.fillRect(13, 2, 1, 1); g.fillRect(2, 13, 1, 1); g.fillRect(13, 13, 1, 1);
  g.fillStyle = _rgba('#ffffff', 0.55); // 铆钉受光点
  g.fillRect(3, 3, 1, 1); g.fillRect(12, 3, 1, 1);
  g.fillStyle = seam; g.fillRect(6, 6, 4, 4);   // 中央徽标：受光/基/暗三面
  g.fillStyle = lit; g.fillRect(6, 6, 2, 2);
  g.fillStyle = dark; g.fillRect(8, 8, 2, 2);
  return c;
}

function spikesTile() { // 上尖刺：亮脊/基/暗侧三阶硬边+亮尖+底座三阶
  const c = _makeCanvas(16, 16), g = c.getContext('2d');
  for (let i = 0; i < 2; i++) {
    const bx = i * 8;
    g.fillStyle = '#c8ccd8';
    g.fillRect(bx + 2, 10, 4, 6); g.fillRect(bx + 3, 6, 2, 4);
    g.fillStyle = '#e8ecf4'; g.fillRect(bx + 2, 10, 1, 6); g.fillRect(bx + 3, 6, 1, 4); // 左脊受光
    g.fillStyle = '#8a90a8'; g.fillRect(bx + 5, 10, 1, 6); g.fillRect(bx + 4, 6, 1, 4); // 右侧阴影
    g.fillStyle = '#ffffff'; g.fillRect(bx + 3, 5, 1, 1);                                // 亮尖
  }
  g.fillStyle = '#8a90a8'; g.fillRect(0, 13, 16, 3);
  g.fillStyle = '#aab0bc'; g.fillRect(0, 13, 16, 1);   // 底座受光（硬切）
  g.fillStyle = '#5a6078'; g.fillRect(0, 15, 16, 1);
  return c;
}

function _spikesDownTile() { // 内部：吊刺 v（底座贴顶，镜像配色，硬边）
  const c = _makeCanvas(16, 16), g = c.getContext('2d');
  for (let i = 0; i < 2; i++) {
    const bx = i * 8;
    g.fillStyle = '#c8ccd8';
    g.fillRect(bx + 2, 0, 4, 6); g.fillRect(bx + 3, 10, 2, 4);
    g.fillStyle = '#e8ecf4'; g.fillRect(bx + 2, 0, 1, 6); g.fillRect(bx + 3, 10, 1, 4);
    g.fillStyle = '#8a90a8'; g.fillRect(bx + 5, 0, 1, 6); g.fillRect(bx + 4, 10, 1, 4);
    g.fillStyle = '#ffffff'; g.fillRect(bx + 3, 10, 1, 1);
  }
  g.fillStyle = '#8a90a8'; g.fillRect(0, 0, 16, 3);
  g.fillStyle = '#aab0bc'; g.fillRect(0, 0, 16, 1);    // 底座受光（硬切）
  g.fillStyle = '#5a6078'; g.fillRect(0, 2, 16, 1);
  return c;
}

function lavaTile(f) { // 熔岩两帧：表壳受光→基→中层暗→暗底 硬边+浮壳亮斑（两帧位移=动画）
  const c = _makeCanvas(16, 16), g = c.getContext('2d');
  g.fillStyle = '#e84818'; g.fillRect(0, 0, 16, 16);           // 基
  g.fillStyle = '#f8a020'; g.fillRect(0, 0, 16, 3);            // 表壳受光（硬切）
  g.fillStyle = '#f8d060';                                     // 亮斑涌动（两帧位移）
  g.fillRect(f ? 3 : 8, 0, 3, 1); g.fillRect(f ? 10 : 2, 2, 4, 1); g.fillRect(f ? 6 : 12, 1, 2, 1);
  g.fillStyle = '#c83010'; g.fillRect(0, 12, 16, 1);           // 中层暗（硬切）
  g.fillRect(f ? 5 : 9, 8, 3, 1); g.fillRect(f ? 11 : 4, 10, 2, 1);
  g.fillStyle = '#a82810'; g.fillRect(0, 14, 16, 2);           // 深部暗底
  g.fillStyle = '#7a2010';                                     // 浮壳（暗色地壳）
  g.fillRect(f ? 2 : 6, 6, 4, 2); g.fillRect(f ? 9 : 3, 10, 3, 2);
  g.fillStyle = '#f8a020';                                     // 浮壳受光边
  g.fillRect(f ? 2 : 6, 6, 4, 1); g.fillRect(f ? 9 : 3, 10, 3, 1);
  return c;
}

function doorTile(top) { // 门：木板三阶硬边+板缝硬线+金属箍带+金锁高光
  const c = _makeCanvas(16, 16), g = c.getContext('2d');
  g.fillStyle = '#5a3a18'; g.fillRect(0, 0, 16, 16);           // 框/缝
  g.fillStyle = '#8a5a2a'; g.fillRect(1, 0, 14, 16);           // 板基色
  g.fillStyle = '#a87038'; g.fillRect(2, 0, 3, 16); g.fillRect(7, 0, 3, 16); g.fillRect(12, 0, 3, 16);
  g.fillStyle = '#c89858'; g.fillRect(2, 0, 1, 16); g.fillRect(7, 0, 1, 16); g.fillRect(12, 0, 1, 16); // 受光棱
  g.fillStyle = '#6a4420'; g.fillRect(5, 0, 1, 16); g.fillRect(10, 0, 1, 16); // 板缝（硬切）
  g.fillStyle = '#4a5060'; g.fillRect(0, 3, 16, 2); g.fillRect(0, 11, 16, 2); // 金属箍带
  g.fillStyle = '#8a90a8'; g.fillRect(0, 3, 16, 1); g.fillRect(0, 11, 16, 1);
  if (top) { // 锁孔：金座三阶+高光+深棕孔
    g.fillStyle = '#f8d020'; g.fillRect(6, 6, 4, 5);
    g.fillStyle = '#fff8c8'; g.fillRect(6, 6, 4, 1); g.fillRect(6, 6, 1, 2);
    g.fillStyle = '#c89010'; g.fillRect(6, 10, 4, 1);
    g.fillStyle = '#3a2408'; g.fillRect(7, 7, 2, 3);
  }
  return c;
}

function conveyorTile(dir) { // 传送带（dir=1 右 / -1 左）：带体三阶硬边+滚轮高光+琥珀箭头
  const c = _makeCanvas(16, 16), g = c.getContext('2d');
  g.fillStyle = '#3a4048'; g.fillRect(0, 4, 16, 8);
  g.fillStyle = '#5a616c'; g.fillRect(0, 4, 16, 2);   // 受光带（硬切）
  g.fillStyle = '#20242c'; g.fillRect(0, 10, 16, 2);  // 阴影带（硬切）
  g.fillStyle = '#12151c'; g.fillRect(0, 11, 16, 1);
  g.fillStyle = '#8a90a8'; g.fillRect(3, 5, 1, 1); g.fillRect(11, 5, 1, 1); // 滚轮高光
  g.fillStyle = '#f8b020'; // 箭头（16px 周期，可平铺；动画偏移由 ui 处理）
  const heads = dir > 0
    ? [[2, 6], [4, 8], [6, 6], [10, 6], [12, 8], [14, 6]]
    : [[2, 8], [4, 6], [8, 6], [10, 8], [12, 6]];
  for (let i = 0; i < heads.length; i++) g.fillRect(heads[i][0], heads[i][1], 2, 2);
  g.fillStyle = '#a86810'; // 箭头暗部（右下 1px）
  for (let i = 0; i < heads.length; i++) g.fillRect(heads[i][0] + 1, heads[i][1] + 2, 1, 1);
  return c;
}

/* —— v7 美术队：sea/nether 主题瓦片（工单 §2；沿既有瓦片三阶硬边口径，抖动仅远景）—— */
const _SPIKES_SEA = { body: '#d86888', light: '#f898b0', shade: '#a03858', tip: '#ffd8e8', rock: '#8a4a68', rockL: '#a86888', rockD: '#5a3450' };  // 珊瑚刺
const _SPIKES_NETHER = { body: '#d8d8c8', light: '#f8f8e8', shade: '#a0a088', tip: '#ffffff', rock: '#6a6a58', rockL: '#8a8a70', rockD: '#4a4a3c' }; // 骨刺
function _themeSpikesTile(sp, down) { // 内部：主题尖刺 '^'/'v'（沿既有版式三阶硬边）
  const c = _makeCanvas(16, 16), g = c.getContext('2d');
  for (let i = 0; i < 2; i++) {
    const bx = i * 8, by = down ? 0 : 10, ty = down ? 10 : 6;
    g.fillStyle = sp.body;
    g.fillRect(bx + 2, by, 4, 6); g.fillRect(bx + 3, ty, 2, 4);
    g.fillStyle = sp.light; g.fillRect(bx + 2, by, 1, 6); g.fillRect(bx + 3, ty, 1, 4);
    g.fillStyle = sp.shade; g.fillRect(bx + 5, by, 1, 6); g.fillRect(bx + 4, ty, 1, 4);
    g.fillStyle = sp.tip; g.fillRect(bx + 3, down ? ty : ty - 1, 1, 1);
  }
  g.fillStyle = sp.rock; g.fillRect(0, down ? 0 : 13, 16, 3);
  g.fillStyle = sp.rockL; g.fillRect(0, down ? 0 : 13, 16, 1);
  g.fillStyle = sp.rockD; g.fillRect(0, down ? 2 : 15, 16, 1);
  return c;
}
function _hotLiquidTile(f, P) { // 内部：v7 '~' 热液两帧（沿 lavaTile 版式；sea 热泉/nether 岩浆）
  const c = _makeCanvas(16, 16), g = c.getContext('2d');
  g.fillStyle = P.base; g.fillRect(0, 0, 16, 16);
  g.fillStyle = P.surf; g.fillRect(0, 0, 16, 3);
  g.fillStyle = P.spark;
  g.fillRect(f ? 3 : 8, 0, 3, 1); g.fillRect(f ? 10 : 2, 2, 4, 1); g.fillRect(f ? 6 : 12, 1, 2, 1);
  g.fillStyle = P.mid; g.fillRect(0, 12, 16, 1);
  g.fillRect(f ? 5 : 9, 8, 3, 1); g.fillRect(f ? 11 : 4, 10, 2, 1);
  g.fillStyle = P.deep; g.fillRect(0, 14, 16, 2);
  g.fillStyle = P.crust;
  g.fillRect(f ? 2 : 6, 6, 4, 2); g.fillRect(f ? 9 : 3, 10, 3, 2);
  g.fillStyle = P.crustL;
  g.fillRect(f ? 2 : 6, 6, 4, 1); g.fillRect(f ? 9 : 3, 10, 3, 1);
  if (P.bubble) { g.fillStyle = '#e8fcff'; g.fillRect(f ? 5 : 11, 5, 2, 2); g.fillRect(f ? 12 : 4, 8, 1, 1); }
  return c;
}
const _VENT_P = { base: '#1878c0', surf: '#48b8e8', spark: '#a8ecff', mid: '#1058a0', deep: '#0a3a70', crust: '#0e4a80', crustL: '#48b8e8', bubble: 1 }; // sea 热泉
const _HELL_P = { base: '#a81808', surf: '#e84818', spark: '#f8a030', mid: '#701008', deep: '#480a08', crust: '#200608', crustL: '#e84818' }; // nether 岩浆
function hiddenTile(th) { // v7：'G' 隐藏砖——block 同色系三阶硬边+2px 深色裂纹暗记（近观可辨/扫屏不辨）
  const c = _makeCanvas(16, 16), g = c.getContext('2d');
  _paintBlock(g, th, null, 5591);                            // 无母题独立种子
  g.fillStyle = _mixHex(th.blockS, '#0a0e22', 0.4);
  g.fillRect(7, 5, 2, 2); g.fillRect(8, 7, 1, 2); g.fillRect(6, 4, 1, 1);
  return c;
}
function waterTile(dir) { // v7：'{'/'}' 水流瓦片——半透明水底（钉色 #2a8ad0 系）+2px 白箭头×2
  const c = _makeCanvas(16, 16), g = c.getContext('2d');
  g.fillStyle = _rgba('#2a8ad0', 0.55); g.fillRect(0, 0, 16, 16);
  g.fillStyle = _rgba('#7ed8f0', 0.5); g.fillRect(0, 0, 16, 3);
  g.fillStyle = _rgba('#1a5ac8', 0.5); g.fillRect(0, 13, 16, 3);
  for (let i = 0; i < 2; i++) {
    const y = 5 + i * 6;
    g.fillStyle = '#ffffff';                                 // 箭头（杆+三段尖，指向 dir）
    if (dir > 0) { g.fillRect(3, y, 8, 2); g.fillRect(9, y - 2, 2, 2); g.fillRect(9, y + 2, 2, 2); g.fillRect(11, y, 2, 2); }
    else { g.fillRect(5, y, 8, 2); g.fillRect(5, y - 2, 2, 2); g.fillRect(5, y + 2, 2, 2); g.fillRect(3, y, 2, 2); }
    g.fillStyle = '#c8e8f8';
    g.fillRect(dir > 0 ? 4 : 6, y + 2, 7, 1);
  }
  return c;
}

/* ==================== 装饰物（图由 art 提供，摆放由引擎 Level.decor 决定） ====================
 * v2.5：每主题 ≥6 种多型素材；火把/晶体/蠕虫/吊灯/烛台/火柱为 2 帧闪烁数组；
 * 全部彩色描边（描边=填充加深版），禁纯黑。 */
function _buildDecor() { // 内部：全部装饰物一次构建
  const d = {};
  /* —— 通用 —— */
  d.bush = (function () { // 灌木 16×9：三阶绿+抖动+浆果+底缝
    const c = _makeCanvas(16, 9), g = c.getContext('2d');
    g.fillStyle = '#2c7830'; g.fillRect(1, 3, 14, 6); g.fillRect(3, 1, 10, 4);
    g.fillStyle = '#3c9838'; g.fillRect(3, 2, 4, 3); g.fillRect(9, 4, 4, 2);
    _dithRow(g, 3, 13, 4, '#3c9838', 0);
    g.fillStyle = '#58c048'; g.fillRect(4, 2, 2, 1); g.fillRect(10, 4, 2, 1);
    _dithRow(g, 4, 12, 3, '#58c048', 1);
    g.fillStyle = '#d84868'; g.fillRect(5, 3, 1, 1); g.fillRect(11, 5, 1, 1); // 浆果
    g.fillStyle = '#256824'; g.fillRect(1, 8, 14, 1);                          // 底缝
    return c;
  })();
  d.flower = (function () { // 小花 6×8：花瓣受光/基/暗+叶
    const c = _makeCanvas(6, 8), g = c.getContext('2d');
    g.fillStyle = '#3c9838'; g.fillRect(2, 3, 1, 5);
    g.fillStyle = '#2c7830'; g.fillRect(3, 5, 1, 1);       // 叶影
    g.fillStyle = '#f85888'; g.fillRect(1, 0, 3, 3);
    g.fillStyle = '#c83858'; g.fillRect(3, 2, 1, 1);       // 花瓣暗部
    g.fillStyle = '#ffd8e8'; g.fillRect(1, 0, 1, 1);       // 受光瓣
    g.fillStyle = '#f8d020'; g.fillRect(2, 1, 1, 1);
    return c;
  })();
  d.mushroom = (function () { // 蘑菇 8×8：伞面三阶+斑点明暗+裙缘描边
    const c = _makeCanvas(8, 8), g = c.getContext('2d');
    g.fillStyle = '#b8b0a0'; g.fillRect(3, 4, 2, 4);
    g.fillStyle = '#e8e0d0'; g.fillRect(3, 4, 1, 4);
    g.fillStyle = '#8a2018'; g.fillRect(1, 3, 6, 1);       // 伞缘描边
    g.fillStyle = '#d84838'; g.fillRect(1, 1, 6, 2); g.fillRect(2, 0, 4, 1);
    g.fillStyle = '#f87858'; g.fillRect(2, 1, 2, 1);       // 伞面受光
    g.fillStyle = '#f8f0e8'; g.fillRect(2, 1, 1, 1); g.fillRect(5, 2, 1, 1);
    g.fillStyle = '#d8d0c8'; g.fillRect(5, 1, 1, 1);       // 斑点影
    return c;
  })();
  d.crystal = [0, 1].map(function (f) { // 水晶簇 9×13 两帧（辉光闪烁；v5 对齐 cave 青族）
    const P = f
      ? { c: '#2ca8a0', C: '#0e5a68', w: '#6ae0d4', k: '#0a3540' }
      : { c: '#64e8d8', C: '#1898a8', w: '#c8fff8', k: '#0e4a58' };
    const c = _makeCanvas(9, 13), g = c.getContext('2d');
    g.fillStyle = P.k; g.fillRect(1, 11, 7, 2);                          // 基岩描边
    g.fillStyle = P.c; g.fillRect(3, 1, 3, 11); g.fillRect(2, 4, 5, 5);
    g.fillStyle = P.w; g.fillRect(4, 2, 1, 8); g.fillRect(2, 5, 1, 1);   // 受光棱
    g.fillStyle = P.C; g.fillRect(2, 9, 5, 2); g.fillRect(5, 3, 1, 6);   // 阴影面
    g.fillStyle = f ? P.c : '#ffffff'; g.fillRect(4, 2, 1, 1);           // 闪光点
    return c;
  });
  d.crystalS = (function () { // 小水晶 7×9（斜生晶柱，切面受光）
    return _makeSprite([
      '...k....',
      '..kck...',
      '..kwk...',
      '.kwck...',
      '.kwck...',
      'kcwCk...',
      'kcCCk...',
      '.kcCk...',
      '..kkk...'
    ], { k: '#0e4a58', c: '#64e8d8', C: '#1898a8', w: '#e8fff8' });
  })();
  d.gear = (function () { // 齿轮 14×14：金属三阶+高光弧+中轴
    const c = _makeCanvas(14, 14), g = c.getContext('2d');
    g.fillStyle = '#585f70';
    for (let a = 0; a < 360; a += 45) {
      const r = (a + 22) * Math.PI / 180;
      g.fillRect(Math.round(6 + Math.cos(r) * 6), Math.round(6 + Math.sin(r) * 6), 2, 2);
    }
    g.beginPath(); g.arc(7, 7, 5, 0, _TAU); g.fill();
    g.fillStyle = '#788090'; // 上半受光
    g.beginPath(); g.arc(7, 7, 5, Math.PI, _TAU); g.fill();
    g.fillStyle = '#c8ccd8'; // 高光弧（左上 1px）
    for (let a = 190; a <= 280; a += 15) {
      const r = a * Math.PI / 180;
      g.fillRect(Math.round(7 + Math.cos(r) * 3.8), Math.round(7 + Math.sin(r) * 3.8), 1, 1);
    }
    g.fillStyle = '#3a4050'; g.beginPath(); g.arc(7, 7, 2, 0, _TAU); g.fill();
    g.fillStyle = '#d8dce8'; g.fillRect(6, 5, 1, 1); // 轴高光
    return c;
  })();
  d.chain = (function () { // 吊链 6×16：链节亮/暗交替
    const c = _makeCanvas(6, 16), g = c.getContext('2d');
    for (let i = 0; i < 5; i++) {
      g.fillStyle = i % 2 ? '#788090' : '#585f70';
      g.fillRect(i % 2 ? 3 : 1, i * 3, 2, 3);
      g.fillStyle = '#a8b0bc'; g.fillRect(i % 2 ? 3 : 1, i * 3, 1, 1); // 节高光
    }
    return c;
  })();
  d.torch = [0, 1].map(function (f) { // 火把 7×12 两帧（三层火焰+受光柄）
    const c = _makeCanvas(7, 12), g = c.getContext('2d');
    g.fillStyle = '#4a3018'; g.fillRect(2, 6, 2, 6);
    g.fillStyle = '#6a4a2a'; g.fillRect(2, 6, 1, 6);
    g.fillStyle = '#8a6a4a'; g.fillRect(2, 5, 2, 1);
    g.fillStyle = '#f85820'; g.fillRect(1, 2 + (f ? 0 : 1), 4, 4);
    g.fillStyle = '#f8a020'; g.fillRect(2, 1 + (f ? 0 : 1), 2, 3);
    g.fillStyle = '#f8d020'; g.fillRect(2, 3 - (f ? 1 : 0), 2, 2);
    g.fillStyle = '#fff8c8'; g.fillRect(3, 3, 1, 1);
    return c;
  });
  d.skull = (function () { // 骷髅 10×9：骨面受光/阴影+眼窝
    const c = _makeCanvas(10, 9), g = c.getContext('2d');
    g.fillStyle = '#6a6258'; g.fillRect(2, 0, 6, 6); g.fillRect(3, 5, 4, 4); // 描边
    g.fillStyle = '#d8d0c0'; g.fillRect(2, 0, 6, 5); g.fillRect(3, 5, 4, 3);
    g.fillStyle = '#f0ece0'; g.fillRect(2, 0, 3, 2);                          // 受光
    g.fillStyle = '#a8a090'; g.fillRect(6, 2, 2, 3); g.fillRect(3, 7, 4, 1);  // 阴影
    g.fillStyle = '#3a3028'; g.fillRect(3, 2, 1, 2); g.fillRect(6, 2, 1, 2); g.fillRect(4, 6, 2, 1);
    return c;
  })();
  d.cloudpot = (function () { // 云壶 14×10：云底影+陶壶三阶+纹带
    const c = _makeCanvas(14, 10), g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(2, 2, 10, 4); g.fillRect(4, 0, 6, 2);
    _dithRow(g, 3, 11, 3, '#ffffff', 0);
    g.fillStyle = '#dceefc'; g.fillRect(2, 5, 10, 1);       // 云底影
    _dithRow(g, 2, 11, 4, '#dceefc', 1);
    g.fillStyle = '#8a4a28'; g.fillRect(5, 5, 4, 5);        // 壶描边
    g.fillStyle = '#e88a58'; g.fillRect(6, 6, 3, 4);
    g.fillStyle = '#f8b080'; g.fillRect(6, 6, 1, 3);        // 壶受光
    g.fillStyle = '#c05830'; g.fillRect(8, 8, 1, 2);        // 壶阴影
    return c;
  })();
  /* —— grass 新增 —— */
  d.tallgrass = (function () { // 高草丛 12×11：三阶草叶+根部暗缝
    const c = _makeCanvas(12, 11), g = c.getContext('2d');
    const blades = [[1, -1], [3, 0], [5, 1], [7, -1], [9, 0], [10, 1]];
    for (let i = 0; i < blades.length; i++) {
      const bx = blades[i][0], lean = blades[i][1], h = 6 + (i % 3) * 2;
      for (let j = 0; j < h; j++) {
        const x = bx + Math.round(lean * j / h);
        g.fillStyle = j < 2 ? '#78d868' : (j < h - 2 ? '#3c9838' : '#2c7830');
        g.fillRect(x, 9 - j, 1, 1);
      }
    }
    g.fillStyle = '#1e5a1e'; g.fillRect(0, 10, 12, 1); // 根缝
    _dithRow(g, 0, 11, 9, '#2c7830', 0);
    return c;
  })();
  d.boulder = (function () { // 圆石 13×10：三阶岩石+抖动过渡+苔点
    const c = _makeCanvas(13, 10), g = c.getContext('2d');
    g.fillStyle = '#8f867a';
    g.beginPath(); g.arc(5, 5, 3.8, 0, _TAU); g.fill();
    g.beginPath(); g.arc(8, 5, 3.6, 0, _TAU); g.fill();
    g.fillRect(2, 4, 9, 4);
    g.fillStyle = '#c2bab0'; g.fillRect(3, 2, 4, 2); g.fillRect(2, 4, 2, 2); // 左上受光
    _dithRow(g, 2, 7, 4, '#c2bab0', 0);
    g.fillStyle = '#6e675e'; g.fillRect(7, 6, 4, 2); g.fillRect(4, 8, 6, 1); // 右下阴影
    _dithRow(g, 4, 10, 6, '#6e675e', 1);
    g.fillStyle = '#4e4840'; g.fillRect(2, 9, 9, 1);                          // 底缝
    g.fillStyle = '#58c048'; g.fillRect(4, 3, 1, 1); g.fillRect(9, 7, 1, 1); // 苔点
    return c;
  })();
  d.stump = (function () { // 树桩 10×8：年轮三阶+根缝
    return _makeSprite([
      '.kkkkkkkk.',
      '.kllnnmmk.',
      '.klnnnnmk.',
      'klnnnnnnrk',
      'klnnnnnnrk',
      '.knnnnnrk.',
      '.knnnnnrk.',
      '..kkkkkk..'
    ], { k: '#33200e', l: '#d8a868', n: '#8a5a2a', m: '#b07840', r: '#6a4420' });
  })();
  /* —— cave 新增 —— */
  d.stalagmite = (function () { // 石笋 11×13：锥体三阶+受光棱线+矿点
    const c = _makeCanvas(11, 13), g = c.getContext('2d');
    for (let j = 0; j < 12; j++) {
      const w = Math.max(1, Math.round((j + 1) * 4.5 / 12));
      const x0 = 5 - w, x1 = 5 + w;
      g.fillStyle = '#7a7488'; g.fillRect(x0, j, (x1 - x0) + 1, 1);
      g.fillStyle = '#948ea8'; g.fillRect(x0, j, 1, 1);        // 左棱受光
      if (j > 3) { g.fillStyle = '#57516a'; g.fillRect(x1, j, 1, 1); } // 右棱阴影
    }
    g.fillStyle = '#3c3650'; g.fillRect(0, 12, 11, 1);         // 底缝
    g.fillStyle = '#90e5c4'; g.fillRect(4, 3, 1, 1);           // 微光矿点（v5 校色）
    return c;
  })();
  d.glowworm = [0, 1].map(function (f) { // 发光蠕虫 11×8 两帧（垂丝+萤光泡；v5 校色）
    const P = f
      ? { s: '#3a5a68', c: '#2ca8a0', w: '#8ae8e0' }
      : { s: '#5a6a78', c: '#64e8d8', w: '#eafff8' };
    return _makeSprite([
      '......kk...',
      '......ks...',
      '......ks...',
      '.....ks....',
      '.....kc....',
      '....kcck...',
      '...kwcck...',
      '....kk.....'
    ], { k: '#0a3540', s: P.s, c: P.c, w: P.w });
  });
  /* —— sky 新增 —— */
  d.tulip = (function () { // 郁金香 7×9：花冠三阶+叶
    return _makeSprite([
      '..kkk...',
      '.krwrk.',
      '.krrRk.',
      '.krrRk.',
      '..krRk.',
      '...g....',
      '...g....',
      '..Gg....',
      '...g....'
    ], { k: '#5a1c38', r: '#f85888', R: '#c83858', w: '#ffd8e8', g: '#3c9838', G: '#2c7830' });
  })();
  d.cloudsmall = (function () { // 小云朵 14×8：云底影+抖动
    const c = _makeCanvas(14, 8), g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(4, 4, 2.6, 0, _TAU); g.fill();
    g.beginPath(); g.arc(8, 3, 3, 0, _TAU); g.fill();
    g.beginPath(); g.arc(11, 5, 2.2, 0, _TAU); g.fill();
    g.fillRect(3, 4, 9, 3);
    _dithRow(g, 2, 11, 5, '#dceefc', 1);
    g.fillStyle = '#dceefc'; g.fillRect(3, 6, 9, 1);
    return c;
  })();
  d.balloon = (function () { // 热气球 14×16：条纹球皮三阶+中心高光纹+吊篮
    return _makeSprite([
      '....kkkkkk....',
      '.kRrrppwwrrRk.',
      'kRrrppwwpprrRk',
      'kRrrppwwpprrRk',
      'kRrrppwwpprrRk',
      'kRrrppwwpprrRk',
      '.kRrrppwwrrRk.',
      '...kkkkkkkk...',
      '......kB......',
      '......kB......',
      '......kB......',
      '....kbbbk.....',
      '....kbBbk.....',
      '....kbBbk.....',
      '....kbbbk.....',
      '.....kkk......'
    ], { k: '#5a1c14', R: '#b82818', r: '#e84838', p: '#f8d8b8', w: '#fff0e0', b: '#8a5a2c', B: '#5e3c1c' });
  })();
  d.pinwheel = (function () { // 风车草 9×11：四色风叶+茎叶
    return _makeSprite([
      '.cc....oo',
      '.cc....oo',
      '..cc..oo.',
      '...ccoo..',
      '....k....',
      '...OOcc..',
      '..OO..CC.',
      '.OO....CC',
      '....g....',
      '....g....',
      '...Gg....'
    ], { k: '#3a3040', c: '#48b8e8', C: '#2a88b8', o: '#f8a030', O: '#c87018', g: '#3c9838', G: '#2c7830' });
  })();
  /* —— factory 新增 —— */
  d.valve = (function () { // 阀门 13×12：轮盘三阶+高光弧+轮辐+红阀芯
    const c = _makeCanvas(13, 12), g = c.getContext('2d');
    const cx = 6, cy = 6;
    g.fillStyle = '#4a5060'; g.beginPath(); g.arc(cx, cy, 5.5, 0, _TAU); g.fill(); // 轮缘描边
    g.fillStyle = '#8a90a8'; g.beginPath(); g.arc(cx, cy, 4.6, 0, _TAU); g.fill();
    g.fillStyle = '#5a6070'; // 轮辐
    g.fillRect(cx - 1, cy - 4, 2, 8); g.fillRect(cx - 4, cy - 1, 8, 2);
    g.fillStyle = '#d8dce8'; // 高光弧（左上）
    for (let a = 150; a <= 260; a += 10) {
      const r = a * Math.PI / 180;
      g.fillRect(Math.round(cx + Math.cos(r) * 3.8), Math.round(cy + Math.sin(r) * 3.8), 1, 1);
    }
    g.fillStyle = '#3a4050'; g.beginPath(); g.arc(cx, cy, 2, 0, _TAU); g.fill();
    g.fillStyle = '#f84848'; g.fillRect(cx - 1, cy - 1, 2, 2);   // 阀芯红
    g.fillStyle = '#ffb0a8'; g.fillRect(cx - 1, cy - 1, 1, 1);   // 阀芯高光
    return c;
  })();
  d.lamp = [0, 1].map(function (f) { // 吊灯 9×9 两帧（灯罩三阶+灯口辉光亮/暗脉动）
    const L = f ? 'd' : 'L', w = f ? '.' : 'w';
    const pal = { s: '#8a8290', S: '#5a5260', k: '#3a3038', L: '#f8d060', d: '#c89c28', w: '#fff8c8' };
    return _makeSprite([
      '....s....',
      '....s....',
      '....s....',
      '...kssk..',
      '..ksssk..',
      '.ks' + L + L + 'sk.',
      'ks' + L + L + L + L + L + 'sk',
      'kk' + L + L + L + L + L + 'kk',
      '....' + w + '....'
    ], pal);
  });
  d.barrel = (function () { // 金属桶 14×12：桶身三阶+双警示带+受光棱
    return _makeSprite([
      '..kkkkkkkkkk..',
      '.kllmmmmmmDk..',
      '.klmmmmmmmDk..',
      '.kyyyyyyyyYk..',
      '.kyYyyyyyyYk..',
      '.klmmmmmmmDk..',
      '.klmmmmmmmDk..',
      '.kyyyyyyyyYk..',
      '.kyYyyyyyyYk..',
      '.klmmmmmmmDk..',
      '.kDDDDDDDDk...',
      '..kkkkkkkkkk..'
    ], { k: '#20242c', l: '#78808c', m: '#585f6c', D: '#3a4048', y: '#f8b020', Y: '#c88010' });
  })();
  d.vent = (function () { // 通风栅 12×10：格栅明暗条+框缘受光
    return _makeSprite([
      'kkkkkkkkkkkk',
      'kllllllllllk',
      'kmmmmmmmmmmk',
      'kDDDDDDDDDDk',
      'kmmmmmmmmmmk',
      'kDDDDDDDDDDk',
      'kmmmmmmmmmmk',
      'kDDDDDDDDDDk',
      'kllllllllllk',
      'kkkkkkkkkkkk'
    ], { k: '#20242c', l: '#78808c', m: '#585f6c', D: '#31363e' });
  })();
  /* —— lava 新增 —— */
  d.flamepillar = [0, 1].map(function (f) { // 小火焰柱 9×12 两帧（四阶火舌摆动）
    return _makeSprite(f ? [
      '....Y....',
      '....fY...',
      '...YffY..',
      '...FffY..',
      '..FFffY..',
      '..FffFY..',
      '..FfffFY.',
      '.FFfffFY.',
      '.FFfffFFY',
      'FFffffFFY',
      'FFffffFFY',
      '.FFFFFFF.'
    ] : [
      '....Y....',
      '...YfY...',
      '...YfY...',
      '..YffY...',
      '..FffY...',
      '..FffFY..',
      '.FFffFY..',
      '.FFfffFY.',
      'FFffffFY.',
      'FFffffFFY',
      'FFffffFFY',
      '.FFFFFFF.'
    ], { F: '#f85820', f: '#f8a020', Y: '#f8d060' });
  });
  d.ribcage = (function () { // 助骨 12×5：骨白三阶
    return _makeSprite([
      '.kbbbbbbbbk.',
      'kbb.kbb.kbb.',
      'kbb.kbb.kbb.',
      '.kb..kb..kb.',
      '.kB..kB..kB.'
    ], { k: '#6a6258', b: '#d8d0c0', B: '#a8a090' });
  })();
  d.lavarock = (function () { // 熔岩砾石 13×9：暗岩三阶+裂缝辉光
    const c = _makeCanvas(13, 9), g = c.getContext('2d');
    g.fillStyle = '#33282c';
    g.beginPath(); g.arc(5, 5, 3.5, 0, _TAU); g.fill();
    g.beginPath(); g.arc(8, 5, 3.2, 0, _TAU); g.fill();
    g.fillRect(3, 3, 7, 4);
    g.fillStyle = '#4c3a40'; g.fillRect(4, 2, 5, 1); g.fillRect(3, 3, 2, 2); // 受光
    _dithRow(g, 3, 8, 3, '#4c3a40', 0);
    g.fillStyle = '#241c20'; g.fillRect(5, 7, 6, 1);                          // 阴影
    g.fillStyle = '#f86020'; g.fillRect(5, 4, 1, 2); g.fillRect(7, 5, 2, 1);  // 裂缝辉光
    g.fillStyle = '#f8d060'; g.fillRect(5, 4, 1, 1);
    return c;
  })();
  d.obsidian = (function () { // 黑曜石碎片 9×11：暗体+受光棱+矿光
    return _makeSprite([
      '....k....',
      '...kok...',
      '...kok...',
      '..koLk...',
      '..koLk...',
      '..koLgk..',
      '.koLLgk..',
      '.koLLgk..',
      '.koLLgk..',
      'koLLLgk..',
      'kkkkkkk..'
    ], { k: '#141020', o: '#2c2340', L: '#584878', g: '#8878b0' });
  })();
  /* —— tower 新增 —— */
  d.flagbanner = (function () { // 挂旗 10×13：横杆+燕尾垂旗三阶+青徽
    return _makeSprite([
      'kkkkkkkkkk',
      '.kLppppPk.',
      '.kLpeepPk.',
      '.kLpeepPk.',
      '.kLppppPk.',
      '.kLppppPk.',
      '.kLppppPk.',
      '.kLppppPk.',
      '.kLppppPk.',
      '.kLppppPk.',
      '..kppPPk..',
      '...kPPk...',
      '....kk....'
    ], { k: '#3a2c50', p: '#8878c8', P: '#6054a0', L: '#b0a4e0', e: '#48d8e8' });
  })();
  d.candelabra = [0, 1].map(function (f) { // 烛台 12×14 两帧（三烛火苗摆动）
    const top = f
      ? ['..F...F...F.', '..f...f...f.']
      : ['.F...F...F..', '.f...f...f..'];
    const body = [
      '.c...c...c..',
      '.c...c...c..',
      '.C...C...C..',
      '.C...C...C..',
      '.c...c...c..',
      '.cgggggggc..',
      '....gGg.....',
      '....gGg.....',
      '...ggGgg....',
      '..gggGggg...',
      '.kgggGgggk..',
      '.kkkkkkkkk..'
    ];
    return _makeSprite(top.concat(body), {
      k: '#6a4a10', g: '#c8a028', G: '#8a6a18', c: '#f8f0e0', C: '#d8c8b0', F: '#f8a030', f: '#f8d060'
    });
  });
  d.urn = (function () { // 陶瓮 10×10：三阶陶面+紫纹带
    return _makeSprite([
      '..kkkkkk..',
      '.kLttttTk.',
      'kLtttttTTk',
      'kLtttttTTk',
      'kLdddddTTk',
      'kLtttttTTk',
      '.ktttttTk.',
      '..ktttTk..',
      '...kttk...',
      '..kkkkkk..'
    ], { k: '#5a2c14', t: '#c87838', T: '#96501e', L: '#e8a860', d: '#7a3c58' });
  })();
  /* —— v5 风格队新增（工单 §E）：wind 风车 / star 星花（两帧数组，ui 帧动画）—— */
  d.windmill = [0, 1].map(function (f) { // 风车 16×20（木塔+四叶轮，帧2 相位差 45°）
    const c = _makeCanvas(16, 20), g = c.getContext('2d');
    g.fillStyle = '#806566'; g.fillRect(4, 8, 8, 12); g.fillRect(3, 19, 10, 1); // 塔暗部+底缝
    g.fillStyle = '#b0885c'; g.fillRect(5, 8, 6, 12); // 木塔
    g.fillStyle = '#cbad89'; g.fillRect(5, 8, 2, 12); // 受光棱
    g.fillStyle = '#f0b848'; g.fillRect(6, 14, 4, 3); // 门
    const arms = f ? [0, 90, 180, 270] : [45, 135, 225, 315];
    g.fillStyle = '#e8f4ff'; // 四叶（外段 2px）
    for (let i = 0; i < 4; i++) {
      const a = arms[i] * Math.PI / 180;
      for (let j = 2; j <= 7; j++)
        g.fillRect(Math.round(8 + Math.cos(a) * j), Math.round(7 + Math.sin(a) * j), j > 4 ? 2 : 1, 1);
    }
    g.fillStyle = '#f8d048'; g.fillRect(7, 6, 2, 2); // 轴心
    return c;
  });
  d.starflower = [0, 1].map(function (f) { // 星花 8×10（青白瓣+金芯，帧2 亮一档）
    return _makeSprite([
      '..cWc...', '.cWWWWc.', '..cWWc..', '.cWkkWc.', 'cWkyykWc',
      '.cWkkWc.', '..cWWc..', '...gg...', '...gG...', '...gg...'
    ], f ? { c: '#bffff2', W: '#ffffff', k: '#3aa898', y: '#fff8c8', g: '#4a9a68', G: '#35785a' }
         : { c: '#8ae8d8', W: '#d8fff8', k: '#2c8878', y: '#f8d048', g: '#3c8858', G: '#2a6848' });
  });
  /* —— v7：sea/nether 新装饰（键名同 THEMES.decor/engine 兜底表；skull 复用）—— */
  d.coral = _makeSprite(_V7_CORAL, { k: '#8a2440', C: '#d84878', c: '#f87898', w: '#ffc8d8' }); // 珊瑚枝
  d.shell = _makeSprite(_V7_SHELL, { k: '#8a4a18', s: '#f8a850', w: '#ffd8a0' });               // 海星
  d.kelp = [_makeSprite(_V7_KELP1, { g: '#38a860', G: '#287848', l: '#68d888' }),
    _makeSprite(_V7_KELP2, { g: '#38a860', G: '#287848', l: '#68d888' })];                      // 海草 10×16×2
  d.ghostflame = [_makeSprite(_V7_GFLAME1, { k: '#0a3a28', f: '#68e8a0', F: '#38a870', w: '#d8ffe8' }),
    _makeSprite(_V7_GFLAME2, { k: '#0a3a28', f: '#68e8a0', F: '#38a870', w: '#d8ffe8' })];      // 鬼火 8×10×2
  d.bone = _makeSprite(_V7_BONE, { k: '#6a6a58', b: '#e8e8d8', B: '#b8b8a8', w: '#ffffff' });   // 骸骨
  return d;
}

/* ==================== 三层视差背景（512×224，水平可平铺） ====================
 * far 画布 = 天光渐变带（3-4 色阶半透明+抖动缘）→ 远景剪影 → 中景合成
 * （明度 = 远/近之间，区分空气感）→ 静态氛围点；near = 近景剪影。
 * 当前 ui 只画 far/near 两层，中景烘焙进 far 保证三层可见；逐帧动画留 ui v3。 */
function _wrap3(g, W, draw) { // 内部：跨界元素在 x-W/x/x+W 各画一次 → 512 宽平铺无缝
  draw(0); draw(-W); draw(W);
}

function _skyBands(gf, W, color) { // 内部：天光渐变带（3-4 色阶半透明，越近地平线越浓）
  const bands = [[52, 40, 0.05], [92, 34, 0.09], [126, 26, 0.14]];
  for (let i = 0; i < bands.length; i++) {
    gf.fillStyle = _rgba(color, bands[i][2]);
    gf.fillRect(0, bands[i][0], W, bands[i][1]);
    _dithRow(gf, 0, W - 1, bands[i][0], _rgba(color, bands[i][2] + 0.04), 0); // 上缘抖动
  }
  gf.fillStyle = _rgba(color, 0.18); gf.fillRect(0, 146, W, 8); // 地平线暖/冷带
  _dithRow(gf, 0, W - 1, 154, _rgba(color, 0.18), 1);
}

function makeBG(th, key) { // 远/近两层背景（契约导出名）：far 内含天光带+远景+中景+氛围点
  const W = 512, H = 224;
  const far = _makeCanvas(W, H), near = _makeCanvas(W, H);
  const gf = far.getContext('2d'), gn = near.getContext('2d');
  const rnd = _mulberry32(777);
  const midC = _mixHex(th.far, th.near, 0.55); // 中景明度：介于远/近之间（空气感）
  // 注：轮廓函数使用 512 整除周期正弦（x/W*2π*k，k 为整数），随机元素经 _wrap3 环绕绘制
  if (key === 'grass') {
    _skyBands(gf, W, th.band);
    // 远景：起伏丘陵剪影
    gf.fillStyle = th.far;
    for (let x = 0; x < W; x += 8)
      gf.fillRect(x, 150 + Math.round(Math.sin(x / W * _TAU * 2) * 14 + Math.sin(x / W * _TAU * 5) * 10), 8, H);
    // 中景：树线（圆冠树剪影，明度居中）
    gf.fillStyle = midC;
    for (let x = 0; x < W; x += 16) {
      const ty = 168 + Math.round(Math.sin(x / W * _TAU * 3 + 1) * 8);
      gf.fillRect(x + 7, ty + 6, 3, H - ty - 6);                            // 树干
      gf.beginPath(); gf.arc(x + 8, ty + 4, 8, 0, _TAU); gf.fill();         // 树冠
    }
    // 氛围点：飘尘（两档亮度）
    for (let i = 0; i < 16; i++) {
      const x = Math.floor(rnd() * W), y = 24 + Math.floor(rnd() * 110);
      gf.fillStyle = _rgba(th.dust, i % 3 ? 0.4 : 0.7);
      _wrap3(gf, W, function (ox) { gf.fillRect(x + ox, y, i % 4 ? 1 : 2, 1); });
    }
    // 近景：近丘 + 白云（云底影）
    gn.fillStyle = th.near;
    for (let x = 0; x < W; x += 8)
      gn.fillRect(x, 180 + Math.round(Math.sin(x / W * _TAU * 3 + 2) * 12), 8, H);
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(rnd() * W), y = 20 + Math.floor(rnd() * 70);
      _wrap3(gn, W, function (ox) {
        gn.fillStyle = '#ffffff';
        gn.fillRect(x + ox, y, 30, 8); gn.fillRect(x + ox + 8, y - 6, 16, 6);
        gn.fillStyle = '#cfe6f6'; gn.fillRect(x + ox + 2, y + 7, 27, 1);    // 云底影
      });
    }
  } else if (key === 'cave') {
    _skyBands(gf, W, th.band); // 幽绿菌光带
    // 远景：顶部钟乳石 + 底部石笋（最暗最远）
    gf.fillStyle = th.far;
    for (let x = 0; x < W; x += 6) {
      gf.fillRect(x, 0, 6, 30 + Math.round(Math.abs(Math.sin(x / W * _TAU * 4)) * 40));
      const y0 = H - 24 - Math.round(Math.abs(Math.cos(x / W * _TAU * 3)) * 30);
      gf.fillRect(x, y0, 6, H - y0);
    }
    // 中景：钟乳石林（更长的垂岩/石笋，明度居中）
    gf.fillStyle = midC;
    for (let x = 0; x < W; x += 12) {
      gf.fillRect(x, 0, 8, 52 + Math.round(Math.abs(Math.sin(x / W * _TAU * 5 + 2)) * 36));
      const y0 = H - 44 - Math.round(Math.abs(Math.cos(x / W * _TAU * 4 + 1)) * 36);
      gf.fillRect(x + 2, y0, 6, H - y0);
    }
    // 氛围点：萤光点（两档亮度；v5 校色=cave accent 青族）
    for (let i = 0; i < 14; i++) {
      const x = Math.floor(rnd() * W), y = 46 + Math.floor(rnd() * 130);
      gf.fillStyle = i % 3 ? _rgba('#64e8d8', 0.5) : '#aef4ff';
      _wrap3(gf, W, function (ox) { gf.fillRect(x + ox, y, i % 3 ? 2 : 1, i % 3 ? 1 : 2); });
    }
    // 近景：更密的顶部垂岩 + 青色光点
    gn.fillStyle = th.near;
    for (let x = 0; x < W; x += 10)
      gn.fillRect(x, 0, 10, 14 + Math.round(Math.abs(Math.sin(x / W * _TAU * 7 + 1)) * 22));
    gn.fillStyle = '#64e8d8';
    for (let i = 0; i < 10; i++) {
      const x = Math.floor(rnd() * W), y = 40 + Math.floor(rnd() * 140);
      _wrap3(gn, W, function (ox) { gn.fillRect(x + ox, y, 2, 2); });
    }
  } else if (key === 'sky') {
    _skyBands(gf, W, th.band);
    // 远景：高空云带 + 远处飞鸟形（氛围点）
    gf.fillStyle = th.far;
    for (let i = 0; i < 8; i++) {
      const x = Math.floor(rnd() * W), y = 20 + Math.floor(rnd() * 130);
      _wrap3(gf, W, function (ox) { gf.fillRect(x + ox, y, 44, 10); gf.fillRect(x + ox + 10, y - 8, 24, 8); });
    }
    gf.fillStyle = '#5a7ca8';
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(rnd() * W), y = 30 + Math.floor(rnd() * 90);
      _wrap3(gf, W, function (ox) {
        gf.fillRect(x + ox, y, 1, 1); gf.fillRect(x + ox + 1, y + 1, 1, 1); gf.fillRect(x + ox + 2, y, 1, 1);
      });
    }
    // 中景：长条云带（明度居中）
    gf.fillStyle = midC;
    for (let i = 0; i < 7; i++) {
      const x = Math.floor(rnd() * W), y = 100 + Math.floor(rnd() * 60);
      _wrap3(gf, W, function (ox) { gf.fillRect(x + ox, y, 60, 8); gf.fillRect(x + ox + 14, y - 6, 30, 6); });
    }
    // 近景：大团近云（含云底影）
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(rnd() * W), y = 60 + Math.floor(rnd() * 110);
      _wrap3(gn, W, function (ox) {
        gn.fillStyle = '#ffffff';
        gn.fillRect(x + ox, y, 56, 12); gn.fillRect(x + ox + 12, y - 9, 30, 9);
        gn.fillStyle = '#cfe6f6'; gn.fillRect(x + ox + 3, y + 10, 50, 2);    // 云底影
      });
    }
  } else if (key === 'factory') {
    _skyBands(gf, W, th.band); // 烟霾暖光带
    // 远景：齿轮剪影（镂空中轴）+ 立管（512/64=8 根整除，可平铺）
    gf.fillStyle = th.far;
    for (let i = 0; i < 5; i++) {
      const x = Math.floor(rnd() * W), y = 30 + Math.floor(rnd() * 100), r = 16 + Math.floor(rnd() * 22);
      _wrap3(gf, W, function (ox) {
        gf.beginPath(); gf.arc(x + ox, y, r, 0, _TAU); gf.fill();
        gf.save();
        gf.globalCompositeOperation = 'destination-out'; // 镂空中轴 → 齿轮感
        gf.beginPath(); gf.arc(x + ox, y, Math.max(3, r * 0.28), 0, _TAU); gf.fill();
        gf.restore();
      });
    }
    for (let x = 0; x < W; x += 64) gf.fillRect(x, 30, 10, H);
    // 氛围点：烟囱烟（三根烟柱，方块渐大渐淡上升）
    for (let i = 0; i < 3; i++) {
      const x0 = 64 * (1 + i * 2) + 2;
      for (let s = 0; s < 4; s++) {
        gf.fillStyle = _rgba('#c8ccd4', 0.3 - s * 0.06);
        _wrap3(gf, W, function (ox) { gf.fillRect(x0 + ox - s, 22 - s * 7, 4 + s * 2, 3); });
      }
    }
    // 中景：管道群+储罐圆仓（明度居中）
    gf.fillStyle = midC;
    for (let x = 0; x < W; x += 64) {
      gf.fillRect(x + 4, 96, 8, H - 96);                                    // 立管
      gf.fillRect(x + 2, 92, 12, 5);                                        // 管接头
      gf.beginPath(); gf.arc(x + 36, 150, 12, 0, _TAU); gf.fill();          // 储罐
      gf.fillRect(x + 24, 150, 24, H - 150);
      gf.fillStyle = _rgba('#f8c040', 0.5);                                 // 罐窗灯（v5 校色=factory accent）
      gf.fillRect(x + 35, 146, 2, 2);
      gf.fillStyle = midC;
    }
    // 近景：厂房块 + 琥珀色窗灯
    gn.fillStyle = th.near;
    for (let i = 0; i < 5; i++) {
      const x = Math.floor(rnd() * W), y = 140 + Math.floor(rnd() * 20);
      _wrap3(gn, W, function (ox) { gn.fillRect(x + ox, y, 70, H - y); });
    }
    gn.fillStyle = '#f8c040';
    for (let i = 0; i < 9; i++) {
      const x = Math.floor(rnd() * W), y = 30 + Math.floor(rnd() * 160);
      _wrap3(gn, W, function (ox) {
        gn.fillRect(x + ox, y, 2, 2);
        gn.fillStyle = _rgba('#f8c040', 0.4); gn.fillRect(x + ox + 2, y, 1, 2); // 灯晕
        gn.fillStyle = '#f8c040';
      });
    }
  } else if (key === 'lava') {
    _skyBands(gf, W, th.band); // 热浪红光带
    // 远景：玄武岩尖塔群 + 基座剪影
    gf.fillStyle = th.far;
    for (let x = 0; x < W; x += 8)
      gf.fillRect(x, 138 + Math.round(Math.abs(Math.sin(x / W * _TAU * 3)) * 30), 8, H);
    for (let i = 0; i < 10; i++) {
      const cx = Math.floor(rnd() * W), w2 = 24 + Math.floor(rnd() * 28), h2 = 70 + Math.floor(rnd() * 80);
      _wrap3(gf, W, function (ox) {
        for (let dx = 0; dx < w2; dx++) {
          const t = 1 - Math.abs(dx - w2 / 2) / (w2 / 2);
          const hh = Math.round(h2 * t);
          gf.fillRect(cx + ox + dx, H - hh, 1, hh);
        }
      });
    }
    // 中景：熔岩柱群（明度居中+柱身辉光裂线；v5 校色=lavaGlow #f86038）
    for (let x = 0; x < W; x += 64) {
      const ph = 60 + Math.round(Math.abs(Math.sin(x / W * _TAU * 8)) * 46);
      gf.fillStyle = midC;
      gf.fillRect(x + 20, H - ph, 10, ph);
      gf.fillRect(x + 18, H - ph, 14, 4);                                   // 柱头
      gf.fillStyle = _rgba('#f86038', 0.55);
      gf.fillRect(x + 24, H - ph + 10, 1, 12); gf.fillRect(x + 27, H - ph + 26, 1, 8);
    }
    // 氛围点：上升火星（亮斑+暗红尾迹）
    for (let i = 0; i < 12; i++) {
      const x = Math.floor(rnd() * W), y = 40 + Math.floor(rnd() * 140);
      _wrap3(gf, W, function (ox) {
        gf.fillStyle = i % 3 ? '#f8a020' : '#f8d060';
        gf.fillRect(x + ox, y, 2, 2);
        gf.fillStyle = _rgba('#f86020', 0.5);
        gf.fillRect(x + ox, y + 2, 1, 2);
      });
    }
    // 近景：更近的岩墙 + 熔岩辉光点
    gn.fillStyle = th.near;
    for (let x = 0; x < W; x += 14)
      gn.fillRect(x, 175 + Math.round(Math.abs(Math.sin(x / W * _TAU * 5 + 2)) * 28), 14, H);
    gn.fillStyle = th.lavaGlow || '#f86038';
    for (let i = 0; i < 8; i++) {
      const x = Math.floor(rnd() * W), y = 190 + Math.floor(rnd() * 20);
      _wrap3(gn, W, function (ox) { gn.fillRect(x + ox, y, 6, 3); });
    }
  } else if (key === 'boss') { // v3：星核虚空（深空渐变+星点+行星+碎石+能量带+祭坛柱）
    // 深空渐变：skyT→skyB 4 阶直接烘进 far（本主题自带底色，不叠 _skyBands）
    for (let i = 0; i < 4; i++) {
      gf.fillStyle = _mixHex(th.skyT, th.skyB, i / 3);
      gf.fillRect(0, i * 56, W, 56);
    }
    // 星点：_mulberry32(77) 约 40 颗，1~2px，白/金/青三色
    const rb = _mulberry32(77);
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(rb() * W), y = Math.floor(rb() * 200);
      const big = rb() < 0.22;
      gf.fillStyle = i % 3 === 0 ? '#ffffff' : (i % 3 === 1 ? '#f8d048' : '#48d8e8');
      _wrap3(gf, W, function (ox) { gf.fillRect(x + ox, y, big ? 2 : 1, big ? 2 : 1); });
    }
    // 右上大行星圆弧：r=90 圆心 (430,-40)，#2a2050 面 + #8858e8 1px 边光
    // （圆右缘越界段全部在画布外 y<0，无需 wrap）
    gf.fillStyle = '#2a2050';
    gf.beginPath(); gf.arc(430, -40, 90, 0, _TAU); gf.fill();
    gf.fillStyle = '#8858e8';
    for (let a = 0; a < 360; a += 0.5) {
      const ang = a * Math.PI / 180;
      const ex = Math.round(430 + Math.cos(ang) * 90), ey = Math.round(-40 + Math.sin(ang) * 90);
      if (ey >= 0 && ey < H && ex >= 0 && ex < W) gf.fillRect(ex, ey, 1, 1);
    }
    // 左侧漂浮碎石剪影（3 块多边形，行跨表 + wrap 平铺）
    gf.fillStyle = th.far;
    [[40, 54, [[5, 10], [3, 12], [1, 13], [0, 14], [0, 14], [2, 12], [4, 9], [6, 7]]],
     [104, 92, [[3, 8], [1, 10], [0, 11], [0, 11], [1, 9], [3, 7]]],
     [16, 118, [[2, 7], [0, 9], [0, 9], [1, 7], [3, 5]]]].forEach(function (rk) {
      _wrap3(gf, W, function (ox) {
        rk[2].forEach(function (row, ry) {
          gf.fillRect(rk[0] + ox + row[0], rk[1] + ry, row[1] - row[0] + 1, 1);
        });
      });
    });
    // 中景：环形能量带——两条 band 色 2px 线（y=60/150）+ 沿线均匀 12 个 1px 亮点（每线 6 个错相）
    gf.fillStyle = th.band;
    gf.fillRect(0, 60, W, 2); gf.fillRect(0, 150, W, 2);
    gf.fillStyle = '#fff8c8';
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(i * W / 6) + 10;
      gf.fillRect(x, 60, 1, 1);
      gf.fillRect((x + Math.floor(W / 12)) % W, 150, 1, 1);
    }
    // 近景：祭坛石柱剪影（5 根矩形+顶冠，th.near=#241a4a，高度 40~90 交错）
    gn.fillStyle = th.near;
    [[36, 90], [130, 56], [224, 74], [318, 48], [428, 88]].forEach(function (p) {
      gn.fillRect(p[0], H - p[1], 14, p[1]);
      gn.fillRect(p[0] - 3, H - p[1] - 6, 20, 6); // 顶冠
    });
  } else if (key === 'wind') { // v5 翡翠风谷（§D）：天光带+翡翠丘+风车剪影+白桦+飘叶+蒲公英
    _skyBands(gf, W, th.band);
    gf.fillStyle = th.far; // 远景：起伏翡翠丘+风车剪影柱
    for (let x = 0; x < W; x += 8)
      gf.fillRect(x, 148 + Math.round(Math.sin(x / W * _TAU * 3) * 16 + Math.sin(x / W * _TAU * 7) * 6), 8, H);
    for (let i = 0; i < 4; i++) { // 远景：风车剪影柱 4 座（塔身+十字叶轮，定位于带内不越缝）
      const wx = 64 + i * 128, wy = 104;
      gf.fillStyle = th.near;
      gf.fillRect(wx - 2, wy, 4, 70);
      gf.fillRect(wx - 8, wy - 6, 16, 4); gf.fillRect(wx - 2, wy - 12, 4, 14);
    }
    gf.fillStyle = midC; // 中景白桦；氛围点飘叶
    for (let x = 0; x < W; x += 24) {
      const ty = 164 + Math.round(Math.sin(x / W * _TAU * 4 + 2) * 6);
      gf.fillRect(x + 11, ty + 8, 3, H - ty - 8);
      gf.beginPath(); gf.arc(x + 12, ty + 4, 7, 0, _TAU); gf.fill();
    }
    for (let i = 0; i < 8; i++) {
      const x = Math.floor(rnd() * W), y = 30 + Math.floor(rnd() * 110);
      _wrap3(gf, W, function (ox) {
        gf.fillStyle = i % 2 ? '#ffffff' : '#eafff4';
        gf.fillRect(x + ox, y, 2, 1); gf.fillRect(x + ox + 2, y + 1, 1, 1);
      });
    }
    gn.fillStyle = th.near; // 近景：近丘+蒲公英白球
    for (let x = 0; x < W; x += 8)
      gn.fillRect(x, 182 + Math.round(Math.sin(x / W * _TAU * 3 + 2) * 10), 8, H);
    for (let i = 0; i < 5; i++) {
      const x = Math.floor(rnd() * W), y = 158 + Math.floor(rnd() * 20);
      _wrap3(gn, W, function (ox) {
        gn.fillStyle = '#ffffff';
        gn.beginPath(); gn.arc(x + ox, y, 3, 0, _TAU); gn.fill();
        gn.fillRect(x + ox - 1, y - 4, 1, 1); gn.fillRect(x + ox + 4, y + 1, 1, 1); // 白点
      });
    }
  } else if (key === 'castle') { // v5 落日王城（§D）：落日圆盘+城堡剪影+尖塔旗+归鸟+城墙垛口
    _skyBands(gf, W, th.band);
    gf.fillStyle = '#fce8b8'; // 远景：落日圆盘+城堡剪影群
    gf.beginPath(); gf.arc(430, 60, 36, 0, _TAU); gf.fill();
    gf.fillStyle = '#fff8e0'; gf.beginPath(); gf.arc(430, 60, 24, 0, _TAU); gf.fill();
    gf.fillStyle = th.far; // 城堡剪影群（定位不越缝）
    [[30, 90], [110, 70], [210, 100], [300, 78], [410, 96]].forEach(function (cw) {
      gf.fillRect(cw[0], cw[1], 26, H - cw[1]);
      for (let m = 0; m < 4; m++) gf.fillRect(cw[0] + m * 7, cw[1] - 4, 4, 4);
      gf.fillRect(cw[0] + 10, cw[1] - 14, 6, 14);
    });
    gf.fillStyle = midC; // 中景：尖塔+旗帜三角
    for (let x = 0; x < W; x += 96) {
      gf.fillRect(x + 40, 132, 14, H - 132);
      gf.fillRect(x + 44, 120, 6, 12);
      gf.fillStyle = '#e86038'; gf.fillRect(x + 50, 120, 7, 4); gf.fillStyle = midC;
    }
    gf.fillStyle = '#5a4a58'; // 氛围点：归鸟（两像素 V 形）
    for (let i = 0; i < 5; i++) {
      const x = Math.floor(rnd() * W), y = 36 + Math.floor(rnd() * 60);
      _wrap3(gf, W, function (ox) {
        gf.fillRect(x + ox, y, 1, 1); gf.fillRect(x + ox + 1, y + 1, 1, 1);
      });
    }
    gn.fillStyle = th.near; // 近景：城墙垛口+窗灯暖点
    for (let x = 0; x < W; x += 16) {
      gn.fillRect(x, 196, 16, H - 196);
      gn.fillRect(x + 2, 190, 5, 6); gn.fillRect(x + 9, 190, 5, 6);
    }
    gn.fillStyle = '#f0b848';
    for (let i = 0; i < 10; i++) {
      const x = Math.floor(rnd() * W);
      _wrap3(gn, W, function (ox) { gn.fillRect(x + ox, 200 + (i % 3) * 4, 2, 3); });
    }
  } else if (key === 'star') { // v5 星空回廊（§D）：深空渐变+星点+拱廊石柱+能量带+星藤
    for (let i = 0; i < 4; i++) { // 深空渐变 4 阶
      gf.fillStyle = _mixHex(th.skyT, th.skyB, i / 3);
      gf.fillRect(0, i * 56, W, 56);
    }
    const rs = _mulberry32(4242); // 星点 40 颗+3 大星十字
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(rs() * W), y = Math.floor(rs() * 200), big = rs() < 0.2;
      gf.fillStyle = i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#f8e8a0' : '#8ea0ff';
      _wrap3(gf, W, function (ox) { gf.fillRect(x + ox, y, big ? 2 : 1, big ? 2 : 1); });
    }
    gf.fillStyle = '#ffffff'; // 3 大星十字（定位于带内不越缝）
    [[90, 50], [260, 30], [400, 84]].forEach(function (p) {
      gf.fillRect(p[0] - 2, p[1], 5, 1); gf.fillRect(p[0], p[1] - 2, 1, 5);
    });
    gf.fillStyle = th.far; // 远景：拱门石柱+浮岛碎块
    for (let i = 0; i < 6; i++) {
      const x = 20 + i * 84, pw = 10, ph = 80 + Math.round(Math.sin(i * 1.7) * 18);
      gf.fillRect(x, 80, pw, ph);
      gf.beginPath(); gf.arc(x + pw / 2, 80, pw / 2, Math.PI, 0); gf.fill();
      gf.fillRect(x - 6, 72 + ph, pw + 12, 8);
    }
    [[70, 120, 34], [300, 96, 26], [420, 140, 30]].forEach(function (rk) { // 浮岛碎块
      gf.fillRect(rk[0], rk[1], rk[2], 2); gf.fillRect(rk[0] + 4, rk[1] + 2, rk[2] - 10, 3);
    });
    gf.fillStyle = th.band;
    gf.fillRect(0, 104, W, 2); gf.fillRect(0, 168, W, 2);
    gf.fillStyle = '#fff8c8'; // 12 亮点
    for (let i = 0; i < 12; i++) gf.fillRect(Math.floor(i * W / 12) + 6, i % 2 ? 168 : 104, 1, 1);
    gn.fillStyle = th.near; // 近景：石柱+星藤
    [[40, 70], [180, 46], [330, 62], [460, 52]].forEach(function (p) { gn.fillRect(p[0], H - p[1], 16, p[1]); });
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(rs() * W), y = 60 + Math.floor(rs() * 90), len = 10 + Math.floor(rs() * 16);
      _wrap3(gn, W, function (ox) {
        gn.fillStyle = th.near;
        for (let j = 0; j < len; j += 2) gn.fillRect(x + ox + (j % 4 ? 0 : 1), y + j, 1, 2);
        gn.fillStyle = '#f8e8a0'; gn.fillRect(x + ox, y + len, 1, 1);
      });
    }
  } else if (key === 'sea') { // v7 东海龙宫：深海渐变+光柱+龙宫飞檐/海藻+鱼群
    for (let i = 0; i < 4; i++) { // 深海渐变 4 阶
      gf.fillStyle = _mixHex(th.skyT, th.skyB, i / 3);
      gf.fillRect(0, i * 56, W, 56);
    }
    for (let i = 0; i < 4; i++) { // 光柱 4 道
      const x0 = 48 + i * 128;
      gf.fillStyle = _rgba('#e8fcff', 0.14);
      gf.fillRect(x0, 0, 2, 150); gf.fillRect(x0 + 3, 0, 1, 110);
      gf.fillStyle = _rgba('#e8fcff', 0.08);
      gf.fillRect(x0 - 2, 0, 1, 90);
    }
    gf.fillStyle = th.far; // 龙宫飞檐剪影 3 座
    [[40, 132], [216, 120], [400, 138]].forEach(function (p) {
      const bx = p[0], by = p[1];
      gf.fillRect(bx, by, 72, H - by);
      gf.fillRect(bx - 8, by - 6, 88, 6);
      gf.fillRect(bx - 14, by - 12, 8, 6); gf.fillRect(bx + 78, by - 12, 8, 6);
      gf.fillRect(bx - 10, by - 12, 84, 6);
      gf.fillRect(bx + 26, by - 24, 20, 12);
      gf.fillRect(bx + 20, by - 30, 32, 6);
    });
    gf.fillStyle = midC;
    for (let x = 0; x < W; x += 128) {
      gf.fillRect(x + 30, 190, 26, H - 190);
      gf.fillRect(x + 40, 178, 12, 14);
    }
    for (let i = 0; i < 12; i++) { // 气泡
      const x = Math.floor(rnd() * W), y = 20 + Math.floor(rnd() * 150);
      gf.fillStyle = _rgba('#e8fcff', i % 3 ? 0.35 : 0.6);
      _wrap3(gf, W, function (ox) { gf.fillRect(x + ox, y, 2, 2); });
    }
    gn.fillStyle = th.near; // 海藻剪影
    for (let x = 0; x < W; x += 32) {
      const h2 = 30 + (x / 32 % 3) * 14;
      for (let j = 0; j < h2; j += 2) gn.fillRect(x + 8 + ((j >> 2) & 1), H - h2 + j, 3, 2);
    }
    gf.fillStyle = _mixHex(th.near, '#0a0e22', 0.3); // 鱼群 3 小队
    [[70, 60], [250, 90], [430, 50]].forEach(function (p) {
      [[0, 0], [8, 2], [16, 0], [8, -2], [4, 1], [12, 1]].forEach(function (fs) {
        _wrap3(gf, W, function (ox) { gf.fillRect(p[0] + ox + fs[0], p[1] + fs[1], 3, 2); });
      });
    });
  } else if (key === 'nether') { // v7 幽冥地府：幽暗渐变+远山鬼火+奈何桥+彼岸花 / 锁链+浮灯+地雾
    for (let i = 0; i < 4; i++) {
      gf.fillStyle = _mixHex(th.skyT, th.skyB, i / 3);
      gf.fillRect(0, i * 56, W, 56);
    }
    gf.fillStyle = th.far; // 远山 3 座
    for (let i = 0; i < 3; i++) {
      const cx = 80 + i * 176, r = 70 + i * 14;
      for (let dx = -r; dx <= r; dx += 4) {
        const hh = Math.round(Math.sqrt(Math.max(0, r * r - dx * dx)) * 0.5);
        gf.fillRect(cx + dx, 120 - hh, 4, hh + 24);
      }
    }
    gf.fillStyle = _rgba('#68e8a0', 0.7); // 山脊鬼火
    [60, 150, 240, 330, 420, 480].forEach(function (x, i) { gf.fillRect(x, 96 + (i % 3) * 10, 2, 2); });
    gf.fillStyle = midC; // 奈何桥（拱洞镂空）
    gf.fillRect(96, 140, 320, 10);
    gf.fillRect(116, 150, 12, 30); gf.fillRect(384, 150, 12, 30);
    gf.save();
    gf.globalCompositeOperation = 'destination-out';
    gf.beginPath(); gf.arc(256, 150, 36, Math.PI, Math.PI * 2); gf.fill();
    gf.restore();
    [[60, 190], [150, 200], [360, 196], [460, 188]].forEach(function (p) { // 彼岸花 4 簇
      gf.fillStyle = '#8a1828';
      gf.fillRect(p[0], p[1], 2, 12);
      for (let a = 0; a < 6; a++) {
        const ang = a * Math.PI / 3;
        gf.fillRect(p[0] + Math.round(Math.cos(ang) * 3) - 1, p[1] - 2 + Math.round(Math.sin(ang) * 2), 2, 2);
      }
      gf.fillStyle = '#c82838'; gf.fillRect(p[0] - 1, p[1] - 2, 4, 2);
    });
    gn.fillStyle = th.near; // 垂锁链 3 条
    [64, 256, 448].forEach(function (x) {
      for (let j = 0; j < H - 44; j += 6) { gn.fillRect(x, j, 2, 4); gn.fillRect(x + 2, j + 2, 2, 4); }
    });
    [[120, 70], [200, 110], [300, 60], [380, 120], [470, 84]].forEach(function (p) { // 浮灯 5 盏
      gn.fillStyle = '#8a2428';
      gn.fillRect(p[0], p[1], 6, 8);
      gn.fillStyle = '#c84838'; gn.fillRect(p[0] + 1, p[1] + 1, 4, 3);
      gn.fillStyle = '#f8d048'; gn.fillRect(p[0] + 2, p[1] + 3, 2, 2);
    });
    gn.fillStyle = _rgba('#2c3448', 0.5); // 地雾
    gn.fillRect(0, H - 16, W, 16);
  } else { // tower
    _skyBands(gf, W, th.band); // 夜空紫晕带
    // 远景：月晕（两圈半透明）+ 弯月 + 大小星
    gf.fillStyle = _rgba('#f8f0c0', 0.08); gf.beginPath(); gf.arc(400, 44, 27, 0, _TAU); gf.fill();
    gf.fillStyle = _rgba('#f8f0c0', 0.14); gf.beginPath(); gf.arc(400, 44, 22, 0, _TAU); gf.fill();
    for (let i = 0; i < 40; i++) {
      const big = rnd() < 0.3;
      gf.fillStyle = big ? '#f8f8d0' : '#8888a8';
      const x = Math.floor(rnd() * W), y = Math.floor(rnd() * H);
      _wrap3(gf, W, function (ox) { gf.fillRect(x + ox, y, big ? 2 : 1, big ? 2 : 1); });
    }
    gf.fillStyle = '#fffef0'; // 大星十字（氛围点）
    const bigStars = [[80, 60], [200, 30], [300, 90]];
    for (let i = 0; i < bigStars.length; i++) {
      _wrap3(gf, W, function (ox) {
        gf.fillRect(bigStars[i][0] + ox - 1, bigStars[i][1], 3, 1);
        gf.fillRect(bigStars[i][0] + ox, bigStars[i][1] - 1, 1, 3);
      });
    }
    gf.fillStyle = '#f8f0c0'; gf.beginPath(); gf.arc(400, 44, 18, 0, _TAU); gf.fill();
    gf.fillStyle = th.skyT; gf.beginPath(); gf.arc(393, 40, 16, 0, _TAU); gf.fill();
    // 中景：塔群剪影（尖顶+暖窗，明度居中）
    const towers = [[20, 120], [90, 86], [150, 132], [228, 70], [300, 110], [368, 92], [440, 126]];
    for (let i = 0; i < towers.length; i++) {
      const tx = towers[i][0], ty = towers[i][1];
      gf.fillStyle = midC;
      gf.fillRect(tx, ty, 22, H - ty);
      gf.fillRect(tx + 9, ty - 6, 4, 6);                                    // 尖顶
      gf.fillStyle = _rgba('#f8d048', 0.8);
      gf.fillRect(tx + 6, ty + 8, 2, 3); gf.fillRect(tx + 13, ty + 16, 2, 3); // 亮窗
    }
    // 近景：塔身立柱剪影
    gn.fillStyle = th.near;
    for (let i = 0; i < 12; i++) {
      const x = Math.floor(rnd() * W), y = 150 + Math.floor(rnd() * 30);
      _wrap3(gn, W, function (ox) { gn.fillRect(x + ox, y, 24, H - y); });
    }
  }
  return { far: far, near: near };
}

/* ==================== 组装：主题美术包 ==================== */
function buildThemeArt(themeKey) { // 参数=THEMES 键名；未知键回退 grass（契约导出）
  const known = Object.prototype.hasOwnProperty.call(THEMES, themeKey);
  const th = known ? THEMES[themeKey] : THEMES.grass;
  const key = known ? themeKey : 'grass';
  const art = {
    tiles: {
      block: blockTile(th, false, key),            // 实心砖（含主题母题）
      blockCap: blockTile(th, true, key),          // 地表砖（盖层）
      plank: plankTile(th),                        // 单向平台 '='
      ice: iceTile(),                              // 冰面 'I'
      crumble: crumbleTile(th),                    // 崩塌砖 'C'
      toggleA: toggleTile('#e88830', '#b05818'),   // 切换砖·橙 'a'
      toggleB: toggleTile('#4890d8', '#2c5c9c'),   // 切换砖·蓝 'b'
      // v7：sea 珊瑚刺/nether 骨刺（其余沿用通用灰岩刺）
      spikes: key === 'sea' ? _themeSpikesTile(_SPIKES_SEA, false)
            : key === 'nether' ? _themeSpikesTile(_SPIKES_NETHER, false) : spikesTile(),
      spikesD: key === 'sea' ? _themeSpikesTile(_SPIKES_SEA, true)
             : key === 'nether' ? _themeSpikesTile(_SPIKES_NETHER, true) : _spikesDownTile(),
      // v7：sea 热泉/nether 岩浆（其余沿用通用熔岩）
      lava: key === 'sea' ? [_hotLiquidTile(0, _VENT_P), _hotLiquidTile(1, _VENT_P)]
          : key === 'nether' ? [_hotLiquidTile(0, _HELL_P), _hotLiquidTile(1, _HELL_P)] : [lavaTile(0), lavaTile(1)],
      door: [doorTile(true), doorTile(false)],     // 门 'D'：[上段(带锁孔), 下段]
      convL: conveyorTile(-1),                     // 左传送带 '('
      convR: conveyorTile(1),                      // 右传送带 ')'
      breakBrick: _makeSprite(_BRICK_BROKEN, _P_BRICK) // 可碎木箱 'B'
    },
    decor: _buildDecor(),                          // 装饰物全套（摆放由引擎决定）
    bg: makeBG(th, key)                            // {far, near} 512×224 可平铺
  };
  if (key === 'sea' || key === 'nether') { // v7：两新主题各追加三键（其余主题不设，ui 守卫式读取）
    art.tiles.hidden = hiddenTile(th); // 'G' 砖：block 同色系+2px 裂纹暗记
    art.tiles.waterL = waterTile(-1);  // '{' 水流（白箭头←）
    art.tiles.waterR = waterTile(1);   // '}' 水流（→）
  }
  return art;
}

/* 自测：量化自查（色阶/抖动/描边/装饰计数等 227 项）见工作区 _art_check.js（node 可跑）；
   v4 神龛/谜题 UI 素材自查（网格行长/齐缝/星光两帧/金印色）见工作区 _art_v4_check.js；
   v5 风格队自查（色板逐值/瓦片硬边/发光键/体积/纯黑禁令）见 tools/_v5_style_check.js；
   浏览器快速冒烟：buildSprites(); buildThemeArt('lava'); 无异常且 SPR/THEMES 非空即通过。 */
