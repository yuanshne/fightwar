/* ============================================================
 * art.js —— Pixel Quest 美术素材模块
 * ------------------------------------------------------------
 * 职责（契约第 4 节）：
 *   1. SPR                精灵画布字典（buildSprites() 填充，幂等）
 *   2. THEMES             六主题配色（grass/cave/sky/factory/lava/tower）
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

/* —— 特效：挥击弧光 slashArc[3]（18×14，白→蓝渐隐三帧）—— */
const _P_FX = { w: '#ffffff', c: '#8ae0f8', C: '#28a8d8' }; // 内部：弧光调色板（白/浅蓝/蓝）
const _FX1 = [ // 弧光帧1·最亮最厚（白色为主）
  '.........ww.......',
  '.......wwwww......',
  '.....wwwcccww.....',
  '....wwcc...cww....',
  '...wwc......cww...',
  '..wwc........ww...',
  '..wc..........ww..',
  '..wc..........ww..',
  '..wwc........ww...',
  '...wwc......cww...',
  '....wwcc...cww....',
  '.....wwwcccww.....',
  '.......wwwww......',
  '.........ww.......'];
const _FX2 = [ // 弧光帧2·转蓝变细
  '..................',
  '.........cc.......',
  '.......ccccc......',
  '.....cccCCCcc.....',
  '....ccC.....Ccc...',
  '...ccC.......cc...',
  '...cC.........cc..',
  '...cC.........cc..',
  '...ccC.......cc...',
  '....ccC.....Ccc...',
  '.....cccCCCcc.....',
  '.......ccccc......',
  '.........cc.......',
  '..................'];
const _FX3 = [ // 弧光帧3·深蓝残痕（最细最淡）
  '..................',
  '..................',
  '..................',
  '........cc........',
  '......ccCCc.......',
  '.....cC...Cc......',
  '....cC.....Cc.....',
  '....cC.....Cc.....',
  '.....cC...Cc......',
  '......ccCCc.......',
  '........cc........',
  '..................',
  '..................',
  '..................'];
const _FX_SLASH = [_FX1, _FX2, _FX3]; // 内部：弧光三帧序列

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

/* ==================== SPR 精灵字典与构建 ==================== */
const SPR = {}; // 精灵画布字典（契约导出）：buildSprites() 填充

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
  // —— 特效：挥击弧光三帧（白→蓝渐隐，18×14）——
  SPR.slashArc = _FX_SLASH.map(function (g) { return _makeSprite(g, _P_FX); });
  // —— 敌人（史莱姆高光+表情两帧；蝙蝠翅膀 3 帧扑扇）——
  SPR.slime = [_makeSprite(_SLIME1, _P_SLIME), _makeSprite(_SLIME2, _P_SLIME)];
  SPR.slimeDead = _makeSprite(_SLIME_DEAD, _P_SLIME);
  SPR.bat = [_makeSprite(_BAT1, _P_BAT), _makeSprite(_BAT2, _P_BAT), _makeSprite(_BAT3, _P_BAT)];
  // —— 物品（金币四帧旋转：扫光正面/侧转/薄片/侧转镜像）——
  SPR.coin = [_makeSprite(_COIN1, _P_ITEM), _makeSprite(_COIN2, _P_ITEM), _makeSprite(_COIN3, _P_ITEM), flipSprite(_makeSprite(_COIN2, _P_ITEM))];
  SPR.gem = _makeSprite(_GEM, _P_ITEM);
  SPR.key = _makeSprite(_KEY_ART, _P_ITEM);
  SPR.springX = _makeSprite(_SPRING_X, _P_ITEM);
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
  SPR.checkOn = (function () { // 激活：白杆绿旗+高光
    const c = _makeCanvas(16, 16), g = c.getContext('2d');
    g.fillStyle = '#8a90a0'; g.fillRect(3, 2, 1, 13);
    g.fillStyle = '#e8ecf4'; g.fillRect(3, 2, 1, 7);
    g.fillStyle = '#1e5a24'; g.fillRect(4, 1, 8, 6);           // 旗描边（深墨绿）
    g.fillStyle = '#48d848'; g.fillRect(5, 2, 6, 4);
    g.fillStyle = '#a8f0a8'; g.fillRect(5, 2, 6, 1);           // 受光
    _dithRow(g, 5, 10, 4, '#a8f0a8', 0);
    g.fillStyle = '#2c982c'; g.fillRect(5, 5, 6, 1);           // 阴影缘
    g.fillStyle = '#ffffff'; g.fillRect(6, 3, 1, 1);           // 亮点
    return c;
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
  return SPR;
}

/* ==================== 六主题配色（契约导出，颜色全 #rrggbb） ====================
 * v2.5：新增 blockS（暗缝第 4 色阶）/capS/plankL 与 band（天光带暖/冷色）；
 * lava 改为黑玄武岩系（发光裂纹画进瓦片）。 */
const THEMES = {
  grass: { name: '草原', skyT: '#6ec2f0', skyB: '#cdeefb',
    far: '#a8dcb0', near: '#7cc47c',
    block: '#c08a50', blockD: '#96683a', blockL: '#d8a868', blockS: '#6e4a28', speck: '#8a5c30',
    cap: '#58c048', capD: '#3c9838', capL: '#78d868', capS: '#256824',
    plank: '#b07840', plankD: '#805428', plankL: '#c89858', accent: '#f08830',
    decor: ['bush', 'flower', 'tallgrass', 'boulder', 'mushroom', 'stump', 'tallgrass', 'flower'],
    dust: '#e8d8a0', band: '#fff2c8' },
  cave: { name: '洞窟', skyT: '#1a1430', skyB: '#30284e',
    far: '#241c3c', near: '#332a52',
    block: '#7a7488', blockD: '#57516a', blockL: '#948ea8', blockS: '#3c3650', speck: '#4a445c',
    cap: '#8ae0c8', capD: '#5cb898', capL: '#a8f0dc', capS: '#3a8878',
    plank: '#5c6478', plankD: '#414858', plankL: '#78809a', accent: '#8858c8',
    decor: ['crystal', 'glowworm', 'stalagmite', 'mushroom', 'boulder', 'crystalS', 'stalagmite'],
    dust: '#8a8ab0', dark: true, band: '#3ad8c8' },
  sky: { name: '天空', skyT: '#48a0e8', skyB: '#a8d8f8',
    far: '#c8e8fa', near: '#ffffff',
    block: '#e8e8f2', blockD: '#a8a8c8', blockL: '#ffffff', blockS: '#8080a4', speck: '#b4b4cc',
    cap: '#f8f8ff', capD: '#b4b4d8', capL: '#ffffff', capS: '#7878a0',
    plank: '#d0c8e0', plankD: '#a8a0c0', plankL: '#e8e0f4', accent: '#f8b020',
    decor: ['cloudpot', 'cloudsmall', 'flower', 'tulip', 'balloon', 'pinwheel', 'cloudsmall'],
    dust: '#ffffff', band: '#ffffff' },
  factory: { name: '工厂', skyT: '#232830', skyB: '#3a4450',
    far: '#2c333e', near: '#3d4756',
    block: '#5c7a78', blockD: '#425a58', blockL: '#789a96', blockS: '#2c3e3c', speck: '#374c4a',
    cap: '#8aa8a4', capD: '#648480', capL: '#a0c0bc', capS: '#48605e',
    plank: '#50585c', plankD: '#3a4044', plankL: '#687076', accent: '#f8b020',
    decor: ['gear', 'chain', 'valve', 'lamp', 'barrel', 'vent', 'gear', 'chain'],
    dust: '#9aa8a4', dark: true, band: '#f8b060' },
  lava: { name: '熔岩', skyT: '#2a1018', skyB: '#582018',
    far: '#3a1620', near: '#4a1c24',
    block: '#44363a', blockD: '#2e2428', blockL: '#5e4c50', blockS: '#1e161a', speck: '#3c282a',
    cap: '#c85838', capD: '#983828', capL: '#e87850', capS: '#681e14',
    plank: '#705050', plankD: '#543a3c', plankL: '#886464', accent: '#f8d020',
    decor: ['torch', 'skull', 'flamepillar', 'ribcage', 'lavarock', 'obsidian', 'torch', 'flamepillar'],
    dust: '#f8a060', dark: true, lavaGlow: '#f86020', band: '#f86020' },
  tower: { name: '高塔', skyT: '#141830', skyB: '#2a3058',
    far: '#1c2040', near: '#2c3254',
    block: '#8a7aa8', blockD: '#6a5c84', blockL: '#a696c4', blockS: '#4c4064', speck: '#584c6e',
    cap: '#b0a0d0', capD: '#8880a8', capL: '#c8bce4', capS: '#645884',
    plank: '#6a6088', plankD: '#4c4464', plankL: '#8478a4', accent: '#48d8e8',
    decor: ['torch', 'candelabra', 'flagbanner', 'urn', 'crystal', 'gear', 'flagbanner'],
    dust: '#b0a8d8', dark: true, band: '#8878e8' }
};

/* ==================== 内部：主题材质母题（画进瓦片本体） ==================== */
const _TILE_MOTIF = {
  grass: function (g, th, rnd) { // 泥土：小石子（受光/阴影两阶）+ 须根
    for (let i = 0; i < 2; i++) {
      const x = 4 + i * 5 + Math.floor(rnd() * 2), y = 6 + Math.floor(rnd() * 3);
      g.fillStyle = '#cfc6b4'; g.fillRect(x, y, 2, 1); g.fillRect(x, y + 1, 1, 1);
      g.fillStyle = '#8f867a'; g.fillRect(x + 1, y + 1, 1, 1);
    }
    g.fillStyle = th.blockS;
    g.fillRect(5, 11, 1, 2); g.fillRect(6, 12, 1, 1);
    g.fillRect(10, 10, 1, 2); g.fillRect(9, 11, 1, 1);
  },
  cave: function (g, th, rnd) { // 岩面：苔藓斑块（抖动缘）+ 角落微光晶体（亮青点）
    _dithRect(g, 4, 10, 4, 3, th.capD, 0);
    g.fillStyle = th.capD; g.fillRect(5, 11, 2, 1);
    _dithRect(g, 10, 5, 3, 2, th.capD, 1);
    g.fillStyle = '#8ae0c8'; g.fillRect(13, 12, 1, 2); g.fillRect(2, 6, 1, 1);
    g.fillStyle = '#e8fff8'; g.fillRect(13, 11, 1, 1);
  },
  sky: function (g, th, rnd) { // 云石：柔云漩纹（受光/阴影各一笔）
    g.fillStyle = '#ffffff'; g.fillRect(4, 6, 3, 1); g.fillRect(9, 10, 3, 1);
    g.fillStyle = th.blockD; g.fillRect(6, 7, 2, 1); g.fillRect(11, 11, 2, 1);
  },
  factory: function (g, th, rnd) { // 金属：铆钉四角 + 警示斜纹条 + 锈斑
    g.fillStyle = th.blockS;
    g.fillRect(2, 6, 1, 1); g.fillRect(13, 6, 1, 1); g.fillRect(2, 12, 1, 1); g.fillRect(13, 12, 1, 1);
    g.fillStyle = '#9ab0ac';
    g.fillRect(3, 7, 1, 1); g.fillRect(12, 7, 1, 1); g.fillRect(3, 11, 1, 1); g.fillRect(12, 11, 1, 1);
    for (let i = 0; i < 5; i++) { // 警示斜纹（暗金/暗缝 45° 交替）
      g.fillStyle = i % 2 ? '#c89010' : th.blockS;
      g.fillRect(4 + i, 13 - i, 1, 1); g.fillRect(9 + i, 13 - i, 1, 1);
    }
    g.fillStyle = '#a05828'; g.fillRect(6, 7, 2, 1); g.fillRect(7, 8, 1, 1); // 锈斑
    g.fillStyle = '#c87838'; g.fillRect(6, 7, 1, 1);
  },
  lava: function (g, th, rnd) { // 黑玄武岩：发光裂纹（橙红裂纹+亮黄芯+暗红抖动缘）
    g.fillStyle = '#f86020';
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
    g.fillStyle = '#48d8e8';
    g.fillRect(5, 5, 1, 2); g.fillRect(4, 6, 3, 1);
    g.fillRect(12, 11, 1, 2);
    g.fillStyle = '#2c8a96'; g.fillRect(6, 6, 1, 1);
    g.fillStyle = th.capD; g.fillRect(4, 13, 1, 1); g.fillRect(12, 5, 1, 1); g.fillRect(13, 6, 1, 1);
  }
};

/* ==================== 程序化瓦片（16×16，四色阶+棋盘抖动） ==================== */
function _paintBlock(g, th, key, seed) { // 内部：实心砖通用四段色阶+斑点+母题
  const rnd = _mulberry32(seed);
  // ① 基色
  g.fillStyle = th.block; g.fillRect(0, 0, 16, 16);
  // ② 阴影（右下）+ 抖动边界
  g.fillStyle = th.blockD;
  g.fillRect(3, 10, 13, 6);
  g.fillRect(11, 4, 5, 6);
  _dithRow(g, 3, 15, 9, th.blockD, 1);
  _dithCol(g, 10, 4, 9, th.blockD, 1);
  // ③ 受光（左上）+ 抖动边界
  g.fillStyle = th.blockL;
  g.fillRect(0, 0, 16, 4);
  g.fillRect(0, 0, 3, 10);
  _dithRow(g, 0, 15, 4, th.blockL, 1);
  _dithCol(g, 3, 5, 9, th.blockL, 1);
  // ④ 暗缝（最底/最右 1px）
  g.fillStyle = th.blockS; g.fillRect(0, 15, 16, 1); g.fillRect(15, 0, 1, 16);
  // ⑤ 材质斑点
  for (let i = 0; i < 6; i++) {
    g.fillStyle = i % 2 ? th.speck : th.blockS;
    g.fillRect(4 + Math.floor(rnd() * 8), 5 + Math.floor(rnd() * 5), 2, 1);
  }
  // ⑥ 主题母题
  if (key && _TILE_MOTIF[key]) _TILE_MOTIF[key](g, th, rnd);
}

function blockTile(th, capped, key) { // 实心砖；capped=顶部盖层（地表用）
  const c = _makeCanvas(16, 16), g = c.getContext('2d');
  _paintBlock(g, th, key, 4321);
  if (capped) { // 盖层：两层绿（受光/基）+ 抖动过渡 + 阴影缘 + 草簇 + 偶发花/菇
    g.fillStyle = th.cap; g.fillRect(0, 0, 16, 4);
    g.fillStyle = th.capL; g.fillRect(0, 0, 16, 2);
    _dithRow(g, 0, 15, 2, th.capL, 0);
    g.fillStyle = th.capD; g.fillRect(0, 4, 16, 1);
    _dithRow(g, 0, 15, 5, th.capD, 1);
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

function plankTile(th) { // 单向平台（薄板）：三阶+受光边+木纹+底部投影暗示
  const c = _makeCanvas(16, 16), g = c.getContext('2d');
  const pl = th.plankL || _mixHex(th.plank, '#ffffff', 0.3);
  g.fillStyle = th.plank; g.fillRect(0, 3, 16, 4);
  g.fillStyle = pl; g.fillRect(0, 3, 16, 1);            // 边缘受光 1px
  _dithRow(g, 0, 15, 4, pl, 0);                          // 亮/基 抖动
  g.fillStyle = th.plankD; g.fillRect(0, 6, 16, 1);      // 板底阴影
  _dithRow(g, 0, 15, 5, th.plankD, 1);                   // 基/暗 抖动
  g.fillStyle = _mixHex(th.plankD, '#000000', 0.35);     // 端头暗缝描边
  g.fillRect(0, 3, 1, 4); g.fillRect(15, 3, 1, 4);
  g.fillStyle = th.plankD;                               // 板缝+木纹
  g.fillRect(5, 3, 1, 4); g.fillRect(11, 3, 1, 4);
  g.fillRect(2, 5, 2, 1); g.fillRect(8, 4, 2, 1); g.fillRect(13, 5, 1, 1);
  g.fillStyle = pl; g.fillRect(8, 4, 1, 1);              // 木纹高光点
  g.fillStyle = _rgba('#000000', 0.28); g.fillRect(0, 8, 16, 1); // 底部投影暗示
  return c;
}

function iceTile() { // 冰面（低摩擦，固定冷色）：四阶+抖动+裂纹高光+暗缝
  const c = _makeCanvas(16, 16), g = c.getContext('2d');
  g.fillStyle = '#a8d8f0'; g.fillRect(0, 0, 16, 16);            // 基色
  g.fillStyle = '#c8ecfc'; g.fillRect(0, 0, 16, 5); g.fillRect(0, 0, 4, 16); // 受光左上
  _dithRow(g, 0, 15, 5, '#c8ecfc', 1); _dithCol(g, 4, 6, 15, '#c8ecfc', 1);
  g.fillStyle = '#78a8c8'; g.fillRect(5, 10, 11, 6); g.fillRect(12, 5, 4, 5); // 阴影右下
  _dithRow(g, 5, 15, 9, '#78a8c8', 1); _dithCol(g, 11, 5, 9, '#78a8c8', 1);
  g.fillStyle = '#587ca0'; g.fillRect(0, 15, 16, 1); g.fillRect(15, 0, 1, 16); // 暗缝
  g.fillStyle = '#e8f8ff';                                       // 斜向裂纹（受光）
  g.fillRect(3, 3, 1, 5); g.fillRect(4, 8, 1, 1); g.fillRect(9, 4, 4, 1); g.fillRect(6, 12, 1, 2);
  g.fillStyle = '#ffffff'; g.fillRect(4, 2, 1, 1); g.fillRect(11, 6, 1, 1);    // 星芒闪光
  return c;
}

function crumbleTile(th) { // 崩塌砖：与实心砖同规格四阶 + 裂纹警示（端点受光）
  const c = _makeCanvas(16, 16), g = c.getContext('2d');
  _paintBlock(g, th, null, 9017);
  g.fillStyle = th.blockS;
  g.fillRect(3, 2, 1, 5); g.fillRect(4, 7, 3, 1); g.fillRect(7, 8, 1, 4); g.fillRect(8, 12, 3, 1);
  g.fillRect(11, 3, 1, 4); g.fillRect(12, 7, 2, 1); g.fillRect(13, 8, 1, 3);
  g.fillStyle = th.blockL;
  g.fillRect(2, 2, 1, 1); g.fillRect(12, 3, 1, 1); g.fillRect(7, 7, 1, 1);
  return c;
}

function toggleTile(color, dark) { // 拉杆切换砖：派生四色阶+抖动+四角铆钉+中央徽标
  const c = _makeCanvas(16, 16), g = c.getContext('2d');
  const lit = _mixHex(color, '#ffffff', 0.38);
  const seam = _mixHex(dark, '#000000', 0.45);
  g.fillStyle = color; g.fillRect(0, 0, 16, 16);
  g.fillStyle = dark; g.fillRect(3, 10, 13, 6); g.fillRect(11, 4, 5, 6);
  _dithRow(g, 3, 15, 9, dark, 1); _dithCol(g, 10, 4, 9, dark, 1);
  g.fillStyle = lit; g.fillRect(0, 0, 16, 4); g.fillRect(0, 0, 3, 10);
  _dithRow(g, 0, 15, 4, lit, 1); _dithCol(g, 3, 5, 9, lit, 1);
  g.fillStyle = seam; g.fillRect(0, 15, 16, 1); g.fillRect(15, 0, 1, 16);
  g.fillStyle = seam; // 四角铆钉（暗点）
  g.fillRect(2, 2, 1, 1); g.fillRect(13, 2, 1, 1); g.fillRect(2, 13, 1, 1); g.fillRect(13, 13, 1, 1);
  g.fillStyle = _rgba('#ffffff', 0.55); // 铆钉受光点
  g.fillRect(3, 3, 1, 1); g.fillRect(12, 3, 1, 1);
  g.fillStyle = seam; g.fillRect(6, 6, 4, 4);   // 中央徽标：受光/基/暗三面
  g.fillStyle = lit; g.fillRect(6, 6, 2, 2);
  g.fillStyle = dark; g.fillRect(8, 8, 2, 2);
  return c;
}

function spikesTile() { // 上尖刺：亮脊/基/暗侧三阶+亮尖+底座三阶+抖动
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
  g.fillStyle = '#aab0bc'; g.fillRect(0, 13, 16, 1);
  _dithRow(g, 0, 15, 14, '#5a6078', 1);
  g.fillStyle = '#5a6078'; g.fillRect(0, 15, 16, 1);
  return c;
}

function _spikesDownTile() { // 内部：吊刺 v（底座贴顶，镜像配色）
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
  g.fillStyle = '#aab0bc'; g.fillRect(0, 0, 16, 1);
  _dithRow(g, 0, 15, 2, '#5a6078', 1);
  g.fillStyle = '#5a6078'; g.fillRect(0, 2, 16, 1);
  return c;
}

function lavaTile(f) { // 熔岩两帧：表壳受光→基→中层暗→暗底 四阶+抖动+浮壳
  const c = _makeCanvas(16, 16), g = c.getContext('2d');
  g.fillStyle = '#e84818'; g.fillRect(0, 0, 16, 16);           // 基
  g.fillStyle = '#f8a020'; g.fillRect(0, 0, 16, 3);            // 表壳受光
  _dithRow(g, 0, 15, 3, '#f8a020', 0);                         // 表壳抖动过渡
  _dithRow(g, 0, 15, 4, '#f8a020', 1);
  g.fillStyle = '#f8d060';                                     // 亮斑涌动（两帧位移）
  g.fillRect(f ? 3 : 8, 0, 3, 1); g.fillRect(f ? 10 : 2, 2, 4, 1); g.fillRect(f ? 6 : 12, 1, 2, 1);
  g.fillStyle = '#c83010';                                     // 中层暗
  _dithRow(g, 0, 15, 12, '#c83010', 1);
  g.fillRect(f ? 5 : 9, 8, 3, 1); g.fillRect(f ? 11 : 4, 10, 2, 1);
  g.fillStyle = '#a82810'; g.fillRect(0, 14, 16, 2);           // 深部暗底
  g.fillStyle = '#7a2010';                                     // 浮壳（暗色地壳）
  g.fillRect(f ? 2 : 6, 6, 4, 2); g.fillRect(f ? 9 : 3, 10, 3, 2);
  g.fillStyle = '#f8a020';                                     // 浮壳受光边
  g.fillRect(f ? 2 : 6, 6, 4, 1); g.fillRect(f ? 9 : 3, 10, 3, 1);
  return c;
}

function doorTile(top) { // 门：木板三阶+板缝抖动+金属箍带+金锁高光
  const c = _makeCanvas(16, 16), g = c.getContext('2d');
  g.fillStyle = '#5a3a18'; g.fillRect(0, 0, 16, 16);           // 框/缝
  g.fillStyle = '#8a5a2a'; g.fillRect(1, 0, 14, 16);           // 板基色
  g.fillStyle = '#a87038'; g.fillRect(2, 0, 3, 16); g.fillRect(7, 0, 3, 16); g.fillRect(12, 0, 3, 16);
  g.fillStyle = '#c89858'; g.fillRect(2, 0, 1, 16); g.fillRect(7, 0, 1, 16); g.fillRect(12, 0, 1, 16); // 受光棱
  _dithCol(g, 5, 1, 15, '#6a4420', 1); _dithCol(g, 10, 1, 15, '#6a4420', 1); // 板缝抖动
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

function conveyorTile(dir) { // 传送带（dir=1 右 / -1 左）：带体三阶+滚轮高光+琥珀箭头
  const c = _makeCanvas(16, 16), g = c.getContext('2d');
  g.fillStyle = '#3a4048'; g.fillRect(0, 4, 16, 8);
  g.fillStyle = '#5a616c'; g.fillRect(0, 4, 16, 2);
  _dithRow(g, 0, 15, 6, '#5a616c', 0);
  g.fillStyle = '#20242c'; g.fillRect(0, 10, 16, 2);
  _dithRow(g, 0, 15, 9, '#20242c', 1);
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
  d.crystal = [0, 1].map(function (f) { // 水晶簇 9×13 两帧（辉光闪烁：亮/暗两套色）
    const P = f
      ? { c: '#2c98a8', C: '#0e5a68', w: '#6ad0dc', k: '#0a3540' }
      : { c: '#48d8e8', C: '#1898a8', w: '#c8f8ff', k: '#0e4a58' };
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
    ], { k: '#0e4a58', c: '#48d8e8', C: '#1898a8', w: '#d8fff8' });
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
    g.fillStyle = '#8ae0c8'; g.fillRect(4, 3, 1, 1);           // 微光矿点
    return c;
  })();
  d.glowworm = [0, 1].map(function (f) { // 发光蠕虫 11×8 两帧（垂丝+萤光泡：亮/暗脉动）
    const P = f
      ? { s: '#3a5a68', c: '#2c98a8', w: '#8ae0e8' }
      : { s: '#5a6a78', c: '#48d8e8', w: '#e8ffff' };
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
    // 氛围点：萤光点（两档亮度）
    for (let i = 0; i < 14; i++) {
      const x = Math.floor(rnd() * W), y = 46 + Math.floor(rnd() * 130);
      gf.fillStyle = i % 3 ? _rgba('#48d8e8', 0.5) : '#aef4ff';
      _wrap3(gf, W, function (ox) { gf.fillRect(x + ox, y, i % 3 ? 2 : 1, i % 3 ? 1 : 2); });
    }
    // 近景：更密的顶部垂岩 + 青色光点
    gn.fillStyle = th.near;
    for (let x = 0; x < W; x += 10)
      gn.fillRect(x, 0, 10, 14 + Math.round(Math.abs(Math.sin(x / W * _TAU * 7 + 1)) * 22));
    gn.fillStyle = '#48d8e8';
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
      gf.fillStyle = _rgba('#f8b020', 0.5);                                 // 罐窗灯
      gf.fillRect(x + 35, 146, 2, 2);
      gf.fillStyle = midC;
    }
    // 近景：厂房块 + 琥珀色窗灯
    gn.fillStyle = th.near;
    for (let i = 0; i < 5; i++) {
      const x = Math.floor(rnd() * W), y = 140 + Math.floor(rnd() * 20);
      _wrap3(gn, W, function (ox) { gn.fillRect(x + ox, y, 70, H - y); });
    }
    gn.fillStyle = '#f8b020';
    for (let i = 0; i < 9; i++) {
      const x = Math.floor(rnd() * W), y = 30 + Math.floor(rnd() * 160);
      _wrap3(gn, W, function (ox) {
        gn.fillRect(x + ox, y, 2, 2);
        gn.fillStyle = _rgba('#f8b020', 0.4); gn.fillRect(x + ox + 2, y, 1, 2); // 灯晕
        gn.fillStyle = '#f8b020';
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
    // 中景：熔岩柱群（明度居中+柱身辉光裂线）
    for (let x = 0; x < W; x += 64) {
      const ph = 60 + Math.round(Math.abs(Math.sin(x / W * _TAU * 8)) * 46);
      gf.fillStyle = midC;
      gf.fillRect(x + 20, H - ph, 10, ph);
      gf.fillRect(x + 18, H - ph, 14, 4);                                   // 柱头
      gf.fillStyle = _rgba('#f86020', 0.55);
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
    gn.fillStyle = th.lavaGlow || '#f86020';
    for (let i = 0; i < 8; i++) {
      const x = Math.floor(rnd() * W), y = 190 + Math.floor(rnd() * 20);
      _wrap3(gn, W, function (ox) { gn.fillRect(x + ox, y, 6, 3); });
    }
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
  return {
    tiles: {
      block: blockTile(th, false, key),            // 实心砖（含主题母题）
      blockCap: blockTile(th, true, key),          // 地表砖（盖层）
      plank: plankTile(th),                        // 单向平台 '='
      ice: iceTile(),                              // 冰面 'I'
      crumble: crumbleTile(th),                    // 崩塌砖 'C'
      toggleA: toggleTile('#e88830', '#b05818'),   // 切换砖·橙 'a'
      toggleB: toggleTile('#4890d8', '#2c5c9c'),   // 切换砖·蓝 'b'
      spikes: spikesTile(),                        // 上尖刺 '^'
      spikesD: _spikesDownTile(),                  // 吊刺 'v'
      lava: [lavaTile(0), lavaTile(1)],            // 熔岩 '~' 两帧
      door: [doorTile(true), doorTile(false)],     // 门 'D'：[上段(带锁孔), 下段]
      convL: conveyorTile(-1),                     // 左传送带 '('
      convR: conveyorTile(1),                      // 右传送带 ')'
      breakBrick: _makeSprite(_BRICK_BROKEN, _P_BRICK) // 可碎木箱 'B'
    },
    decor: _buildDecor(),                          // 装饰物全套（摆放由引擎决定）
    bg: makeBG(th, key)                            // {far, near} 512×224 可平铺
  };
}

/* 自测：量化自查（色阶/抖动/描边/装饰计数等 227 项）见工作区 _art_check.js（node 可跑）；
   浏览器快速冒烟：buildSprites(); buildThemeArt('lava'); 无异常且 SPR/THEMES 非空即通过。 */
