/* ============================================================
 * art.js —— Pixel Quest 美术素材模块
 * ------------------------------------------------------------
 * 职责（契约第 4 节）：
 *   1. SPR                精灵画布字典（buildSprites() 填充，幂等）
 *   2. THEMES             六主题配色（grass/cave/sky/factory/lava/tower）
 *   3. buildSprites()     字符像素网格 → 离屏 canvas 精灵
 *   4. buildThemeArt(key) 程序化 16×16 瓦片 + 装饰物 + 512×224 可平铺双层视差背景
 *   5. drawPixelText()    3×5 像素字体（A-Z 0-9 与 : . ! ? - / x ( ) > < & + 空格）
 *   6. drawCNText()       系统字体中文（ui 用）
 *   7. flipSprite()       水平翻转 canvas
 * 约束：
 *   - 普通 script（无 import/export），加载顺序 art → levels → engine → ui；
 *   - 顶层零 DOM/音频/键盘调用；document 只出现在函数体内（离屏画布/懒取主画布）；
 *   - 本文件不含游戏逻辑、不读关卡数据；
 *   - 像素数据搬运自旧 index.html（P_HERO/HERO_*、SLIME、BAT、ITEM 字模、
 *     FONT、THEMES、瓦片与背景函数），按契约改造：背景改为 512 周期可水平
 *     平铺、去掉对全局 ctx 的依赖、修正旧文件的小缺陷；
 *   - 下划线前缀符号为内部实现（非契约导出）。
 * 主画布上下文：绘制文本时懒获取 #game 的 2D 上下文；ui.js 也可用内部辅助
 * _artUse(ctxOrCanvas) 显式注入（可选）。
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

/* ==================== 精灵像素数据（搬运自旧 index.html，允许微调） ==================== */
const _P_HERO = { // 内部：主角调色板（橙兜帽小勇者）
  k: '#1a1a24', o: '#f08830', O: '#c05818', f: '#f8c890', w: '#ffffff',
  b: '#3aa0a8', B: '#247078', n: '#8a5a2a', y: '#f8d020', e: '#1a1a24'
};
const _HERO_IDLE1 = [ // 站立帧1（12×14）
  '...kkkkk....',
  '..koooook...',
  '.koooooook..',
  '.kofffffok..',
  '.kofwfwfok..',
  '.kffffffk...',
  '..kbbbbk....',
  '.kbbbbbbk...',
  'kfbbbbbbfk..',
  'kfbyyyybfk..',
  '..kbbbbk....',
  '..knnnnk....',
  '..knn.nnk...',
  '..kkk.kkk...'];
const _HERO_IDLE2 = _HERO_IDLE1.map((r, i) => i === 4 ? '.kofkfkfok..' : r); // 站立帧2（眨眼）
const _HERO_RUN1 = [ // 跑步帧1
  '...kkkkk....',
  '..koooook...',
  '.koooooook..',
  '.kofffffok..',
  '.kofwfwfok..',
  '.kffffffk...',
  '..kbbbbk..k.',
  '.kbbbbbbkkfk',
  '..kbbbbbkfk.',
  '..kbyyybk...',
  '..kbbbbk....',
  '.knnkknnk...',
  '.knnk.knnk..',
  '.kkk...kkk..'];
const _HERO_RUN2 = [ // 跑步帧2（收腿）
  '...kkkkk....',
  '..koooook...',
  '.koooooook..',
  '.kofffffok..',
  '.kofwfwfok..',
  '.kffffffk...',
  '..kbbbbk....',
  '.kbbbbbbk...',
  'kfbbbbbbk...',
  '..kbyyybk...',
  '..kbbbbk....',
  '..knnnnk....',
  '...knnk.....',
  '...kkkk.....'];
const _HERO_RUN3 = [ // 跑步帧3（迈步）
  '...kkkkk....',
  '..koooook...',
  '.koooooook..',
  '.kofffffok..',
  '.kofwfwfok..',
  '.kffffffk...',
  '..kbbbbk..k.',
  'kfbbbbbbkkfk',
  'kfbbbbbbkfk.',
  '..kbyyybk...',
  '..kbbbbk....',
  '..knn.nnk...',
  '.knnk..knnk.',
  '.kkk....kkk.'];
const _HERO_JUMP = [ // 跳起（手臂上扬）
  'kf.kkkkk..fk',
  'kkkooooookkk',
  '.koooooook..',
  '.kofffffok..',
  '.kofwfwfok..',
  '.kffffffk...',
  '..kbbbbk....',
  '..kbbbbbk...',
  '..kbbbbbk...',
  '..kbyyybk...',
  '..kbbbbk....',
  '..knnnnk....',
  '.knnk.knnk..',
  '.kkk...kkk..'];
const _HERO_FALL = [ // 下落（手臂平展）
  'fk.kkkkk..kf',
  'kkkooooookkk',
  '.koooooook..',
  '.kofffffok..',
  '.kofwfwfok..',
  '.kffffffk...',
  '..kbbbbk....',
  '.kbbbbbbk...',
  '.kbbbbbbk...',
  '..kbyyybk...',
  '..kbbbbk....',
  '..knnnnk....',
  '..knn.nnk...',
  '.kkk...kkk..'];

const _P_SLIME = { k: '#123012', g: '#58c848', G: '#389028', w: '#b8f0a8', e: '#123012' }; // 内部：史莱姆
const _SLIME1 = [ // 史莱姆帧1（12×10）
  '...kkkkkk...',
  '..kggggggk..',
  '.kgwggggggk.',
  '.kgweggwegk.',
  'kggggggggggk',
  'kggggggggggk',
  'kggggggggggk',
  'kgGGGGGGGGgk',
  '.kGGGGGGGGk.',
  '..kkkkkkkk..'];
const _SLIME2 = [ // 史莱姆帧2（蠕动压扁）
  '............',
  '............',
  '..kkkkkkkk..',
  '.kggggggggk.',
  'kgwggggggggk',
  'kgwegggweggk',
  'kggggggggggk',
  'kgGGGGGGGGGk',
  'kGGGGGGGGGGk',
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

const _P_BAT = { k: '#1a1024', p: '#8858c8', P: '#603890', e: '#f84848', w: '#e8e8f0' }; // 内部：蝙蝠
const _BAT1 = [ // 蝙蝠帧1（展翅，12×10）
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
const _BAT2 = [ // 蝙蝠帧2（收翅）
  '............',
  '............',
  '....kkkk....',
  '..kkppppkk..',
  '.kppppppppk.',
  'kppeppppeppk',
  'kpkpwwwwpkpk',
  '.k.kppppk.k.',
  '....kppk....',
  '.....kk.....'];

const _P_ITEM = { // 内部：物品/机关通用调色板
  k: '#1a1a24', y: '#f8d020', Y: '#c89010', w: '#fff8c8',
  c: '#48d8e8', C: '#1898a8', w2: '#c8f8ff'
};
const _COIN1 = [ // 金币帧1（正对，8×8）
  '..kkkk..',
  '.kyyyyk.',
  'kywyyyyk',
  'kywyyyyk',
  'kyyyyyyk',
  'kyyyyYyk',
  '.kyyyyk.',
  '..kkkk..'];
const _COIN2 = [ // 金币帧2（侧转 2/4）
  '...kk...',
  '..kyyk..',
  '.kywyyk.',
  '.kywyyk.',
  '.kyyyyk.',
  '.kyyYyk.',
  '..kyyk..',
  '...kk...'];
const _COIN3 = [ // 金币帧3（侧面薄片）
  '...kk...',
  '...kk...',
  '..kywk..',
  '..kywk..',
  '..kyyk..',
  '..kYYk..',
  '...kk...',
  '...kk...'];
const _GEM = [ // 宝石（8×8）
  '...kk...',
  '..kcck..',
  '.kcwcck.',
  'kcwcccck',
  'kcccccck',
  '.kcccck.',
  '..kcck..',
  '...kk...'];
const _KEY_ART = [ // 钥匙（10×5）
  '.kkk......',
  'kyyykkkkkk',
  'ky.yk...yk',
  'kyyyk...k.',
  '.kkk....y.'];
const _SPRING_X = [ // 弹簧·弹开态（12×8）
  '............',
  '..kkkkkkkk..',
  '..kwwwwwwk..',
  '...k....k...',
  '..kkkkkkkk..',
  '...k....k...',
  '..kkkkkkkk..',
  '.kkkkkkkkkk.'];
const _SPRING_C = [ // 弹簧·压缩态（12×8）
  '............',
  '............',
  '............',
  '..kkkkkkkk..',
  '..kwwwwwwk..',
  '..kkkkkkkk..',
  '.kkkkkkkkkk.',
  '............'];

/* ==================== SPR 精灵字典与构建 ==================== */
const SPR = {}; // 精灵画布字典（契约导出）：buildSprites() 填充

function buildSprites() { // 一次性构建全部精灵（幂等：重复调用直接返回，契约导出）
  if (SPR.heroIdle1) return SPR;
  // —— 主角（12×14，右向为基准，左向为翻转版）——
  SPR.heroIdle1 = _makeSprite(_HERO_IDLE1, _P_HERO);
  SPR.heroIdle2 = _makeSprite(_HERO_IDLE2, _P_HERO);
  SPR.heroRun = [_makeSprite(_HERO_RUN1, _P_HERO), _makeSprite(_HERO_RUN2, _P_HERO), _makeSprite(_HERO_RUN3, _P_HERO)];
  SPR.heroJump = _makeSprite(_HERO_JUMP, _P_HERO);
  SPR.heroFall = _makeSprite(_HERO_FALL, _P_HERO);
  SPR.heroIdle1L = flipSprite(SPR.heroIdle1);
  SPR.heroIdle2L = flipSprite(SPR.heroIdle2);
  SPR.heroRunL = SPR.heroRun.map(flipSprite);
  SPR.heroJumpL = flipSprite(SPR.heroJump);
  SPR.heroFallL = flipSprite(SPR.heroFall);
  // —— 敌人 ——
  SPR.slime = [_makeSprite(_SLIME1, _P_SLIME), _makeSprite(_SLIME2, _P_SLIME)];
  SPR.slimeDead = _makeSprite(_SLIME_DEAD, _P_SLIME);
  SPR.bat = [_makeSprite(_BAT1, _P_BAT), _makeSprite(_BAT2, _P_BAT)];
  // —— 物品（金币四帧旋转：正/侧/薄片/侧·镜像）——
  SPR.coin = [_makeSprite(_COIN1, _P_ITEM), _makeSprite(_COIN2, _P_ITEM), _makeSprite(_COIN3, _P_ITEM), flipSprite(_makeSprite(_COIN2, _P_ITEM))];
  SPR.gem = _makeSprite(_GEM, _P_ITEM);
  SPR.key = _makeSprite(_KEY_ART, _P_ITEM);
  SPR.springX = _makeSprite(_SPRING_X, _P_ITEM);
  SPR.springC = _makeSprite(_SPRING_C, _P_ITEM);
  // —— 终点旗 16×14 两帧（旗面波纹摆动）——
  SPR.flag = [0, 1].map(function (f) {
    const c = _makeCanvas(16, 14), g = c.getContext('2d');
    g.fillStyle = '#c8c8d8'; g.fillRect(0, 0, 1, 14);          // 旗杆
    g.fillStyle = '#f8d020'; g.fillRect(1, 1, 9, 6);           // 旗面
    g.fillStyle = '#c89010'; g.fillRect(f ? 3 : 4, 3, 3, 2);   // 波纹暗部（两帧位移）
    g.fillRect(1, 6, 9, 1);                                    // 旗面下缘暗边
    g.fillStyle = '#1a1a24'; g.fillRect(0, 0, 1, 1);           // 杆顶
    return c;
  });
  // —— 检查点旗 16×16 两态 ——
  SPR.checkOff = (function () { // 未激活：灰杆灰旗
    const c = _makeCanvas(16, 16), g = c.getContext('2d');
    g.fillStyle = '#8a8a9a'; g.fillRect(3, 2, 1, 13);
    g.fillStyle = '#5a5a6a'; g.fillRect(4, 2, 6, 4);
    g.fillStyle = '#1a1a24'; g.fillRect(3, 2, 1, 1);
    return c;
  })();
  SPR.checkOn = (function () { // 激活：白杆绿旗+亮点
    const c = _makeCanvas(16, 16), g = c.getContext('2d');
    g.fillStyle = '#e8e8f0'; g.fillRect(3, 2, 1, 13);
    g.fillStyle = '#48d848'; g.fillRect(4, 2, 6, 4);
    g.fillStyle = '#2c982c'; g.fillRect(4, 5, 6, 1);
    g.fillStyle = '#1a1a24'; g.fillRect(3, 2, 1, 1);
    g.fillStyle = '#f8f8b0'; g.fillRect(6, 3, 1, 1);
    return c;
  })();
  // —— 电锯 16×16 两帧（锯齿相位错开 + 中心栓）——
  SPR.saw = [0, 1].map(function (f) {
    const c = _makeCanvas(16, 16), g = c.getContext('2d');
    const cx = 8, cy = 8;
    g.fillStyle = '#c8ccd8';
    for (let a = 0; a < 360; a += 15) {
      const ang = (a + f * 7.5) * Math.PI / 180, r2 = a % 30 === 0 ? 7.6 : 6.6;
      g.fillRect(Math.round(cx + Math.cos(ang) * r2) - 1, Math.round(cy + Math.sin(ang) * r2) - 1, 2, 2);
    }
    g.fillStyle = '#9aa0b0'; g.beginPath(); g.arc(cx, cy, 5, 0, _TAU); g.fill();
    g.fillStyle = '#585f70'; g.beginPath(); g.arc(cx, cy, 2, 0, _TAU); g.fill();
    g.fillStyle = '#c8ccd8'; g.fillRect(cx - 1, cy - 1, 1, 1);
    return c;
  });
  // —— 大炮 16×14（朝右；朝左用翻转版）——
  SPR.cannon = (function () {
    const c = _makeCanvas(16, 14), g = c.getContext('2d');
    g.fillStyle = '#3a4050'; g.fillRect(3, 9, 10, 5);  // 底座
    g.fillStyle = '#585f70'; g.fillRect(4, 10, 8, 3);
    g.fillStyle = '#3a4050'; g.fillRect(9, 3, 7, 8);   // 炮管
    g.fillStyle = '#585f70'; g.fillRect(10, 4, 5, 6);
    g.fillStyle = '#2a2f3a'; g.fillRect(14, 5, 2, 4);  // 炮口
    g.fillStyle = '#f84848'; g.fillRect(11, 6, 2, 2);  // 指示灯
    return c;
  })();
  SPR.cannonL = flipSprite(SPR.cannon);
  // —— 炮弹 8×6 ——
  SPR.bullet = (function () {
    const c = _makeCanvas(8, 6), g = c.getContext('2d');
    g.fillStyle = '#1a1a24'; g.fillRect(0, 0, 8, 6);
    g.fillStyle = '#f8b020'; g.fillRect(1, 1, 6, 4);
    g.fillStyle = '#f85820'; g.fillRect(1, 2, 2, 2);
    return c;
  })();
  // —— 拉杆 12×14 两态（0=红/断开，1=绿/接通）——
  SPR.lever = [0, 1].map(function (f) {
    const c = _makeCanvas(12, 14), g = c.getContext('2d');
    g.fillStyle = '#5a4a3a'; g.fillRect(2, 10, 8, 4);    // 底座
    g.fillStyle = '#8a6a4a'; g.fillRect(3, 11, 6, 2);
    g.fillStyle = '#c8ccd8'; g.fillRect(5, 2, 2, 9);     // 拉杆柄
    g.fillStyle = f ? '#48d848' : '#f84848';             // 手柄球（颜色+位置区分两态）
    g.fillRect(3, f ? 1 : 5, 6, 5);
    g.fillStyle = '#1a1a24'; g.fillRect(5, 3, 2, 1);
    return c;
  });
  return SPR;
}

/* ==================== 六主题配色（契约导出，颜色全 #rrggbb） ==================== */
const THEMES = {
  grass: { name: '草原', skyT: '#6ec2f0', skyB: '#cdeefb',
    far: '#a8dcb0', near: '#7cc47c',
    block: '#c08a50', blockD: '#96683a', blockL: '#d8a868', speck: '#8a5c30',
    cap: '#58c048', capD: '#3c9838', capL: '#78d868',
    plank: '#b07840', plankD: '#805428', accent: '#f08830',
    decor: ['bush', 'flower', 'bush', 'mushroom'], dust: '#e8d8a0' },
  cave: { name: '洞窟', skyT: '#1a1430', skyB: '#30284e',
    far: '#241c3c', near: '#332a52',
    block: '#7a7488', blockD: '#57516a', blockL: '#948ea8', speck: '#4a445c',
    cap: '#8ae0c8', capD: '#5cb898', capL: '#a8f0dc',
    plank: '#5c6478', plankD: '#414858', accent: '#8858c8',
    decor: ['crystal', 'mushroom', 'crystal'], dust: '#8a8ab0', dark: true },
  sky: { name: '天空', skyT: '#48a0e8', skyB: '#a8d8f8',
    far: '#c8e8fa', near: '#ffffff',
    block: '#e8e8f2', blockD: '#b8b8cc', blockL: '#ffffff', speck: '#c0c0d4',
    cap: '#f8f8ff', capD: '#c8c8e0', capL: '#ffffff',
    plank: '#d0c8e0', plankD: '#a8a0c0', accent: '#f8b020',
    decor: ['cloudpot', 'flower'], dust: '#ffffff' },
  factory: { name: '工厂', skyT: '#232830', skyB: '#3a4450',
    far: '#2c333e', near: '#3d4756',
    block: '#5c7a78', blockD: '#425a58', blockL: '#789a96', speck: '#374c4a',
    cap: '#8aa8a4', capD: '#648480', capL: '#a0c0bc',
    plank: '#50585c', plankD: '#3a4044', accent: '#f8b020',
    decor: ['gear', 'chain', 'gear'], dust: '#9aa8a4', dark: true },
  lava: { name: '熔岩', skyT: '#2a1018', skyB: '#582018',
    far: '#3a1620', near: '#4a1c24',
    block: '#6a4a4a', blockD: '#4c3436', blockL: '#866262', speck: '#3c282a',
    cap: '#c85838', capD: '#983828', capL: '#e87850',
    plank: '#705050', plankD: '#543a3c', accent: '#f8d020',
    decor: ['torch', 'skull', 'torch'], dust: '#f8a060', dark: true, lavaGlow: '#f86020' },
  tower: { name: '高塔', skyT: '#141830', skyB: '#2a3058',
    far: '#1c2040', near: '#2c3254',
    block: '#8a7aa8', blockD: '#6a5c84', blockL: '#a696c4', speck: '#584c6e',
    cap: '#b0a0d0', capD: '#8880a8', capL: '#c8bce4',
    plank: '#6a6088', plankD: '#4c4464', accent: '#48d8e8',
    decor: ['torch', 'crystal', 'gear'], dust: '#b0a8d8', dark: true }
};

/* ==================== 程序化瓦片（16×16，搬运自旧文件并按契约整理） ==================== */
function blockTile(th, capped) { // 实心砖；capped=顶部草皮/苔盖（地表用）
  const c = _makeCanvas(16, 16), g = c.getContext('2d');
  g.fillStyle = th.block; g.fillRect(0, 0, 16, 16);
  const rnd = _mulberry32(1234);
  g.fillStyle = th.speck;
  for (let i = 0; i < 7; i++) g.fillRect(2 + Math.floor(rnd() * 12), 2 + Math.floor(rnd() * 12), 2, 1);
  g.fillStyle = th.blockD; g.fillRect(0, 15, 16, 1); g.fillRect(15, 0, 1, 16);
  g.fillStyle = th.blockL; g.fillRect(0, 0, 16, 1); g.fillRect(0, 0, 1, 16);
  if (capped) {
    g.fillStyle = th.cap; g.fillRect(0, 0, 16, 5);
    g.fillStyle = th.capL; g.fillRect(0, 0, 16, 1);
    g.fillStyle = th.capD; g.fillRect(0, 4, 16, 1);
    g.fillStyle = th.cap; // 垂下的草叶
    g.fillRect(2, 5, 1, 2); g.fillRect(7, 5, 2, 1); g.fillRect(12, 5, 1, 2);
  }
  return c;
}

function plankTile(th) { // 单向平台木板（上半 16×6，视觉薄板）
  const c = _makeCanvas(16, 16), g = c.getContext('2d');
  g.fillStyle = th.plank; g.fillRect(0, 2, 16, 5);
  g.fillStyle = th.plankD; g.fillRect(0, 6, 16, 1); g.fillRect(5, 2, 1, 4); g.fillRect(11, 2, 1, 4);
  g.fillStyle = '#ffffff22'; g.fillRect(0, 2, 16, 1);
  return c;
}

function iceTile() { // 冰面（低摩擦，固定冷色，不随主题）
  const c = _makeCanvas(16, 16), g = c.getContext('2d');
  g.fillStyle = '#a8d8f0'; g.fillRect(0, 0, 16, 16);
  g.fillStyle = '#c8ecfc'; g.fillRect(0, 0, 16, 2); g.fillRect(0, 0, 2, 16);
  g.fillStyle = '#78a8c8'; g.fillRect(0, 15, 16, 1); g.fillRect(14, 0, 2, 16);
  g.fillStyle = '#e8f8ff'; g.fillRect(3, 3, 2, 6); g.fillRect(6, 9, 1, 4); g.fillRect(11, 4, 2, 3);
  return c;
}

function crumbleTile(th) { // 崩塌砖（裂纹警示）
  const c = _makeCanvas(16, 16), g = c.getContext('2d');
  g.fillStyle = th.block; g.fillRect(0, 0, 16, 16);
  g.fillStyle = th.blockL; g.fillRect(0, 0, 16, 1);
  g.fillStyle = th.blockD; g.fillRect(0, 15, 16, 1);
  g.fillStyle = '#1a1a24';
  g.fillRect(3, 2, 1, 5); g.fillRect(4, 7, 3, 1); g.fillRect(7, 8, 1, 5);
  g.fillRect(10, 3, 1, 4); g.fillRect(11, 7, 2, 1); g.fillRect(12, 8, 1, 4);
  g.fillStyle = th.speck; g.fillRect(2, 12, 2, 2); g.fillRect(12, 2, 2, 2);
  return c;
}

function toggleTile(color, dark) { // 拉杆切换砖（color=本色 dark=暗缘；实/虚由引擎按开关状态渲染）
  const c = _makeCanvas(16, 16), g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 16, 16);
  g.fillStyle = dark; g.fillRect(0, 14, 16, 2); g.fillRect(14, 0, 2, 16);
  g.fillStyle = '#ffffff33'; g.fillRect(0, 0, 16, 2);
  g.fillStyle = '#1a1a24'; g.fillRect(6, 6, 4, 4);   // 铆钉
  g.fillStyle = '#ffffff88'; g.fillRect(7, 7, 2, 2);
  return c;
}

function spikesTile() { // 上尖刺 ^（危险区为瓦片下半，底座贴地）
  const c = _makeCanvas(16, 16), g = c.getContext('2d');
  g.fillStyle = '#c8ccd8';
  for (let i = 0; i < 2; i++) {
    const bx = i * 8;
    g.fillRect(bx + 2, 10, 4, 6); g.fillRect(bx + 3, 6, 2, 4); g.fillRect(bx + 3, 5, 1, 1);
  }
  g.fillStyle = '#8a90a8'; g.fillRect(0, 14, 16, 2);
  g.fillStyle = '#ffffff'; g.fillRect(3, 7, 1, 2); g.fillRect(11, 7, 1, 2);
  return c;
}

function _spikesDownTile() { // 内部：吊刺 v（危险区为瓦片上半，底座贴顶）
  const c = _makeCanvas(16, 16), g = c.getContext('2d');
  g.fillStyle = '#c8ccd8';
  for (let i = 0; i < 2; i++) {
    const bx = i * 8;
    g.fillRect(bx + 2, 0, 4, 6); g.fillRect(bx + 3, 10, 2, 4); g.fillRect(bx + 3, 9, 1, 1);
  }
  g.fillStyle = '#8a90a8'; g.fillRect(0, 0, 16, 2);
  return c;
}

function lavaTile(f) { // 熔岩（两帧动画，危险区为瓦片 y+3 以下）
  const c = _makeCanvas(16, 16), g = c.getContext('2d');
  g.fillStyle = '#e84818'; g.fillRect(0, 0, 16, 16);
  g.fillStyle = '#f8a020';
  g.fillRect(0, 0, 16, 3);
  g.fillRect(f ? 2 : 6, 5, 4, 2); g.fillRect(f ? 9 : 3, 9, 3, 2);
  g.fillStyle = '#f8d060';
  g.fillRect(f ? 3 : 8, 0, 3, 1); g.fillRect(f ? 10 : 2, 2, 4, 1);
  g.fillStyle = '#a82810';
  g.fillRect(0, 14, 16, 2); g.fillRect(f ? 5 : 9, 11, 3, 2);
  return c;
}

function doorTile(top) { // 门（top=上段带锁孔；门整组同开，瓦片由引擎移除）
  const c = _makeCanvas(16, 16), g = c.getContext('2d');
  g.fillStyle = '#8a5a2a'; g.fillRect(0, 0, 16, 16);
  g.fillStyle = '#6a4420'; g.fillRect(0, 0, 1, 16); g.fillRect(15, 0, 1, 16); g.fillRect(5, 0, 1, 16); g.fillRect(10, 0, 1, 16);
  g.fillStyle = '#a87038'; g.fillRect(1, 0, 4, 16); g.fillRect(6, 0, 4, 16); g.fillRect(11, 0, 4, 16);
  g.fillStyle = '#c89858'; g.fillRect(2, 1, 2, 14); g.fillRect(7, 1, 2, 14); g.fillRect(12, 1, 2, 14);
  if (top) {
    g.fillStyle = '#f8d020'; g.fillRect(6, 4, 4, 4);
    g.fillStyle = '#1a1a24'; g.fillRect(7, 5, 2, 3);
  }
  return c;
}

function conveyorTile(dir) { // 传送带（dir=1 向右 / -1 向左；运行时箭头动画偏移由 ui 处理）
  const c = _makeCanvas(16, 16), g = c.getContext('2d');
  g.fillStyle = '#3a4048'; g.fillRect(0, 4, 16, 8);
  g.fillStyle = '#585f6c'; g.fillRect(0, 4, 16, 2);
  g.fillStyle = '#20242c'; g.fillRect(0, 10, 16, 2);
  g.fillStyle = '#f8b020';
  if (dir > 0) {
    g.fillRect(2, 6, 2, 2); g.fillRect(4, 8, 2, 2); g.fillRect(6, 6, 2, 2);
    g.fillRect(10, 6, 2, 2); g.fillRect(12, 8, 2, 2); g.fillRect(14, 6, 2, 2);
  } else {
    g.fillRect(2, 8, 2, 2); g.fillRect(4, 6, 2, 2); g.fillRect(8, 6, 2, 2);
    g.fillRect(10, 8, 2, 2); g.fillRect(12, 6, 2, 2);
  }
  return c;
}

/* ==================== 装饰物（图由 art 提供，摆放由引擎 Level.decor 决定） ==================== */
function _buildDecor() { // 内部：全部装饰物一次构建（各主题按 decor 列表取用）
  const d = {};
  d.bush = (function () { // 灌木 16×9
    const c = _makeCanvas(16, 9), g = c.getContext('2d');
    g.fillStyle = '#3c9838'; g.fillRect(1, 3, 14, 6); g.fillRect(3, 1, 10, 4);
    g.fillStyle = '#58c048'; g.fillRect(3, 2, 4, 3); g.fillRect(9, 4, 4, 2);
    g.fillStyle = '#78d868'; g.fillRect(4, 2, 2, 1); g.fillRect(10, 4, 2, 1);
    return c;
  })();
  d.flower = (function () { // 小花 6×8
    const c = _makeCanvas(6, 8), g = c.getContext('2d');
    g.fillStyle = '#3c9838'; g.fillRect(2, 3, 1, 5); g.fillRect(1, 5, 1, 1);
    g.fillStyle = '#f85888'; g.fillRect(1, 0, 3, 3);
    g.fillStyle = '#f8d020'; g.fillRect(2, 1, 1, 1);
    return c;
  })();
  d.mushroom = (function () { // 蘑菇 8×8
    const c = _makeCanvas(8, 8), g = c.getContext('2d');
    g.fillStyle = '#e8e0d0'; g.fillRect(3, 4, 2, 4);
    g.fillStyle = '#d84838'; g.fillRect(1, 1, 6, 3); g.fillRect(2, 0, 4, 1);
    g.fillStyle = '#f8f0e8'; g.fillRect(2, 1, 1, 1); g.fillRect(5, 2, 1, 1);
    return c;
  })();
  d.crystal = (function () { // 水晶 9×13
    const c = _makeCanvas(9, 13), g = c.getContext('2d');
    g.fillStyle = '#48d8e8'; g.fillRect(3, 1, 3, 11); g.fillRect(2, 4, 5, 5);
    g.fillStyle = '#9af0fa'; g.fillRect(4, 2, 1, 8);
    g.fillStyle = '#1898a8'; g.fillRect(2, 9, 5, 2);
    return c;
  })();
  d.gear = (function () { // 齿轮 14×14
    const c = _makeCanvas(14, 14), g = c.getContext('2d');
    g.fillStyle = '#585f70';
    for (let a = 0; a < 360; a += 45) {
      const r = a * Math.PI / 180;
      g.fillRect(Math.round(6 + Math.cos(r) * 6), Math.round(6 + Math.sin(r) * 6), 2, 2);
    }
    g.beginPath(); g.arc(7, 7, 5, 0, _TAU); g.fill();
    g.fillStyle = '#3a4050'; g.beginPath(); g.arc(7, 7, 2, 0, _TAU); g.fill();
    return c;
  })();
  d.chain = (function () { // 吊链 6×16
    const c = _makeCanvas(6, 16), g = c.getContext('2d');
    g.fillStyle = '#585f70';
    g.fillRect(1, 0, 2, 3); g.fillRect(3, 3, 2, 3); g.fillRect(1, 6, 2, 3);
    g.fillRect(3, 9, 2, 3); g.fillRect(1, 12, 2, 4);
    return c;
  })();
  d.torch = [0, 1].map(function (f) { // 火把 7×12 两帧（火焰跳动）
    const c = _makeCanvas(7, 12), g = c.getContext('2d');
    g.fillStyle = '#6a4a2a'; g.fillRect(2, 6, 2, 6);
    g.fillStyle = '#8a6a4a'; g.fillRect(2, 5, 2, 1);
    g.fillStyle = '#f85820'; g.fillRect(1, 2 + (f ? 0 : 1), 4, 4);
    g.fillStyle = '#f8d020'; g.fillRect(2, 3 - (f ? 1 : 0), 2, 2);
    g.fillStyle = '#fff8c8'; g.fillRect(3, 3, 1, 1);
    return c;
  });
  d.skull = (function () { // 骷髅 10×9
    const c = _makeCanvas(10, 9), g = c.getContext('2d');
    g.fillStyle = '#d8d0c0'; g.fillRect(2, 0, 6, 5); g.fillRect(3, 5, 4, 3);
    g.fillStyle = '#1a1a24'; g.fillRect(3, 2, 1, 2); g.fillRect(6, 2, 1, 2); g.fillRect(4, 6, 2, 1);
    return c;
  })();
  d.cloudpot = (function () { // 云壶 14×10（天空主题：云托花盆）
    const c = _makeCanvas(14, 10), g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(2, 2, 10, 4); g.fillRect(4, 0, 6, 2);
    g.fillStyle = '#c8e8fa'; g.fillRect(2, 5, 10, 1);
    g.fillStyle = '#e88a58'; g.fillRect(5, 6, 4, 4);
    g.fillStyle = '#f8b080'; g.fillRect(6, 7, 2, 2);
    return c;
  })();
  return d;
}

/* ==================== 双层视差背景（512×224，水平可平铺） ==================== */
function _wrap3(g, W, draw) { // 内部：跨界元素在 x-W/x/x+W 各画一次 → 保证 512 宽水平平铺无缝
  draw(0); draw(-W); draw(W);
}

function makeBG(th, key) { // 远/近两层背景（契约导出名）：各主题不同母题，512×224
  const W = 512, H = 224;
  const far = _makeCanvas(W, H), near = _makeCanvas(W, H);
  const gf = far.getContext('2d'), gn = near.getContext('2d');
  const rnd = _mulberry32(777);
  // 注：所有轮廓函数使用 512 整除周期正弦（x/W*2π*k，k 为整数），随机元素经 _wrap3 环绕绘制
  if (key === 'grass') {
    // 远：起伏丘陵剪影
    gf.fillStyle = th.far;
    for (let x = 0; x < W; x += 8)
      gf.fillRect(x, 150 + Math.round(Math.sin(x / W * _TAU * 2) * 14 + Math.sin(x / W * _TAU * 5) * 10), 8, H);
    // 近：更近的丘陵 + 白云
    gn.fillStyle = th.near;
    for (let x = 0; x < W; x += 8)
      gn.fillRect(x, 180 + Math.round(Math.sin(x / W * _TAU * 3 + 2) * 12), 8, H);
    gn.fillStyle = '#ffffff';
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(rnd() * W), y = 20 + Math.floor(rnd() * 70);
      _wrap3(gn, W, function (ox) { gn.fillRect(x + ox, y, 30, 8); gn.fillRect(x + ox + 8, y - 6, 16, 6); });
    }
  } else if (key === 'cave') {
    // 远：顶部钟乳石 + 底部石笋
    gf.fillStyle = th.far;
    for (let x = 0; x < W; x += 6) {
      gf.fillRect(x, 0, 6, 30 + Math.round(Math.abs(Math.sin(x / W * _TAU * 4)) * 40));
      const y0 = H - 24 - Math.round(Math.abs(Math.cos(x / W * _TAU * 3)) * 30);
      gf.fillRect(x, y0, 6, H - y0);
    }
    // 近：更密的顶部垂岩 + 青色光点
    gn.fillStyle = th.near;
    for (let x = 0; x < W; x += 10)
      gn.fillRect(x, 0, 10, 14 + Math.round(Math.abs(Math.sin(x / W * _TAU * 7 + 1)) * 22));
    gn.fillStyle = '#48d8e8';
    for (let i = 0; i < 10; i++) {
      const x = Math.floor(rnd() * W), y = 40 + Math.floor(rnd() * 140);
      _wrap3(gn, W, function (ox) { gn.fillRect(x + ox, y, 2, 2); });
    }
  } else if (key === 'sky') {
    // 远：高空云带
    gf.fillStyle = th.far;
    for (let i = 0; i < 8; i++) {
      const x = Math.floor(rnd() * W), y = 20 + Math.floor(rnd() * 130);
      _wrap3(gf, W, function (ox) { gf.fillRect(x + ox, y, 44, 10); gf.fillRect(x + ox + 10, y - 8, 24, 8); });
    }
    // 近：大团近云
    gn.fillStyle = th.near;
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(rnd() * W), y = 60 + Math.floor(rnd() * 110);
      _wrap3(gn, W, function (ox) { gn.fillRect(x + ox, y, 56, 12); gn.fillRect(x + ox + 12, y - 9, 30, 9); });
    }
  } else if (key === 'factory') {
    // 远：齿轮剪影（镂空中轴）+ 立管（512/64=8 根整除，可平铺）
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
    // 近：厂房块 + 琥珀色窗灯
    gn.fillStyle = th.near;
    for (let i = 0; i < 5; i++) {
      const x = Math.floor(rnd() * W), y = 140 + Math.floor(rnd() * 20);
      _wrap3(gn, W, function (ox) { gn.fillRect(x + ox, y, 70, H - y); });
    }
    gn.fillStyle = '#f8b020';
    for (let i = 0; i < 7; i++) {
      const x = Math.floor(rnd() * W), y = 30 + Math.floor(rnd() * 160);
      _wrap3(gn, W, function (ox) { gn.fillRect(x + ox, y, 2, 2); });
    }
  } else if (key === 'lava') {
    // 远：玄武岩尖塔群 + 基座剪影
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
    // 近：更近的岩墙 + 熔岩辉光点
    gn.fillStyle = th.near;
    for (let x = 0; x < W; x += 14)
      gn.fillRect(x, 175 + Math.round(Math.abs(Math.sin(x / W * _TAU * 5 + 2)) * 28), 14, H);
    gn.fillStyle = th.lavaGlow || '#f86020';
    for (let i = 0; i < 8; i++) {
      const x = Math.floor(rnd() * W), y = 190 + Math.floor(rnd() * 20);
      _wrap3(gn, W, function (ox) { gn.fillRect(x + ox, y, 6, 3); });
    }
  } else { // tower
    // 远：星空 + 弯月
    for (let i = 0; i < 40; i++) {
      const big = rnd() < 0.3;
      gf.fillStyle = big ? '#f8f8d0' : '#8888a8';
      const x = Math.floor(rnd() * W), y = Math.floor(rnd() * H);
      _wrap3(gf, W, function (ox) { gf.fillRect(x + ox, y, big ? 2 : 1, big ? 2 : 1); });
    }
    gf.fillStyle = '#f8f0c0'; gf.beginPath(); gf.arc(400, 44, 18, 0, _TAU); gf.fill();
    gf.fillStyle = th.skyT; gf.beginPath(); gf.arc(393, 40, 16, 0, _TAU); gf.fill();
    // 近：塔身立柱剪影
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
      block: blockTile(th, false),                 // 实心砖
      blockCap: blockTile(th, true),               // 地表砖（草皮/苔盖）
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
      convR: conveyorTile(1)                       // 右传送带 ')'
    },
    decor: _buildDecor(),                          // 装饰物全套（摆放由引擎 Level.decor 决定）
    bg: makeBG(th, key)                            // {far, near} 512×224 可平铺双层
  };
}

/* ==================== 自测断言（浏览器 console 粘贴执行，20 条） ====================
   buildSprites();
   console.assert(SPR.heroIdle1.width===12 && SPR.heroIdle1.height===14, '01 主角站立 12x14');
   console.assert(SPR.heroIdle2.height===14, '02 眨眼帧');
   console.assert(SPR.heroRun.length===3, '03 跑步 3 帧');
   console.assert(SPR.heroRunL.length===3 && SPR.heroRunL[0].width===12, '04 跑步左向 3 帧');
   console.assert(SPR.heroJump.width===12 && SPR.heroFall.height===14, '05 跳/落帧');
   console.assert(SPR.heroIdle1L.width===12, '06 站立左向翻转');
   console.assert(SPR.slime.length===2 && SPR.slime[0].width===12 && SPR.slime[0].height===10, '07 史莱姆两帧 12x10');
   console.assert(SPR.slimeDead.height===10, '08 史莱姆压扁');
   console.assert(SPR.bat.length===2 && SPR.bat[0].width===12, '09 蝙蝠两帧');
   console.assert(SPR.coin.length===4 && SPR.coin[0].width===8 && SPR.coin[0].height===8, '10 金币 4 帧 8x8');
   console.assert(SPR.gem.width===8 && SPR.gem.height===8, '11 宝石 8x8');
   console.assert(SPR.key.width===10 && SPR.key.height===5, '12 钥匙 10x5');
   console.assert(SPR.springX.height===8 && SPR.springC.height===8, '13 弹簧两态');
   console.assert(SPR.flag.length===2 && SPR.flag[0].width===16 && SPR.flag[0].height===14, '14 终点旗两帧 16x14');
   console.assert(SPR.checkOff.width===16 && SPR.checkOn.width===16, '15 检查点两态');
   console.assert(SPR.saw.length===2 && SPR.saw[0].width===16, '16 电锯两帧 16x16');
   console.assert(SPR.cannon.width===16 && SPR.cannon.height===14 && SPR.cannonL.width===16, '17 大炮双向');
   console.assert(SPR.bullet.width===8 && SPR.bullet.height===6, '18 炮弹 8x6');
   const A = buildThemeArt('lava');
   console.assert(A.tiles.block.width===16 && A.tiles.blockCap.height===16 && !!A.tiles.spikesD, '19 瓦片 16x16 全套');
   console.assert(A.tiles.lava.length===2 && A.tiles.door.length===2 && A.bg.far.width===512 && A.bg.near.width===512, '20 熔岩/门两帧+背景 512 宽');
   ==================================================================== */
