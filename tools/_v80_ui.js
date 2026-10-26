// tools/_v80_ui.js —— v8.0 界面队自检（node 直跑；退出码 0=全过，1=有失败）
// 覆盖本波 ui.js 三项任务：
//   ① L1 操作提示常驻天空层：hintT 递减到 0 后仍绘制；非 L1 关卡在 hintT=0 时不再出现该文案；
//      三条文案实测宽度（_textW）不超 384-24 可用宽度；L1 不再画底部 3 秒条（避免同一文案上下两遍）。
//   ② 键位矩阵：WASD 与方向键在 title/select/play/puzzle/bag/wardrobe/clear 各分支触发同一动作；
//      确认组（Enter/Space）在六个界面等价；静态扫描「裸键名」（hit('Arrow*')/pressed['Enter']…）=0。
//   ③ 新敌渲染：beetle/spitter/hopper 在 SPR 缺失时不抛异常且有 fillRect 兜底；SPR 存在时走 drawImage
//      且帧索引随 e.t 变化；死亡态走 *Dead 精灵。
// 沙箱手法照抄 tools/gate.js：art+levels+章节+engine+ui 拼成一个函数体执行（经典 script 同作用域），
// 只 mock 浏览器外壳（localStorage / canvas / document / rAF），不写不删任何游戏文件。
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let nPass = 0, nFail = 0;
function check(name, ok, detail) {
  console.log((ok ? '[PASS] ' : '[FAIL] ') + name + (detail ? ' —— ' + detail : ''));
  if (ok) nPass++; else nFail++;
}

/* ==================== 1. 浏览器外壳 mock（照抄 tools/_v77_skin.js，补绘制记录） ==================== */
const grad = () => ({ addColorStop() {} });
function mkCtx(cv) {
  const noop = () => {};
  const rec = { fillText: [], fillRect: [], drawImage: [], calls: [], paths: [] };
  // v8.0 修①②：记录路径填充的包围盒（_panel 走 beginPath/moveTo/lineTo/fill，fillRect 抓不到），
  // 并记录每次 fillText 的 font —— 断言金行与提示条面板的真实包围盒必须靠这两项，不能靠读源码常量。
  let pts = [];
  const t = {
    canvas: cv, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1,
    globalCompositeOperation: 'source-over', imageSmoothingEnabled: false, font: '', textAlign: '', textBaseline: '',
    createLinearGradient: grad, createRadialGradient: grad, createPattern: () => null,
    getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(4, w * h * 4)) }),
    putImageData: noop,
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(4, w * h * 4)) }),
    measureText: () => ({ width: 4 }),
    _rec: rec,
  };
  t.beginPath = () => { pts = []; };
  t.moveTo = (x, y) => { pts.push([+x, +y]); };
  t.lineTo = (x, y) => { pts.push([+x, +y]); };
  t.fill = () => {
    if (!pts.length) return;
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const x = Math.min.apply(null, xs), y = Math.min.apply(null, ys);
    rec.paths.push({ x: x, y: y, w: Math.max.apply(null, xs) - x, h: Math.max.apply(null, ys) - y,
      alpha: t.globalAlpha, style: t.fillStyle });
  };
  t.fillText = (s, x, y) => { rec.fillText.push({ s: String(s), x: +x, y: +y, alpha: t.globalAlpha, style: t.fillStyle, font: t.font }); };
  t.fillRect = (x, y, w, h) => { rec.fillRect.push({ x: +x, y: +y, w: +w, h: +h, alpha: t.globalAlpha, style: t.fillStyle }); };
  t.drawImage = (img) => { rec.drawImage.push({ img }); };
  return new Proxy(t, {
    get(o, k) { return (k in o) ? o[k] : noop; },
    set(o, k, v) { o[k] = v; return true; },
  });
}
function mkCanvas(w, h) {
  const cv = { width: (w | 0) || 1, height: (h | 0) || 1, style: {} };
  cv.getContext = () => (cv._c || (cv._c = mkCtx(cv)));
  cv.addEventListener = () => {};
  cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: cv.width, height: cv.height });
  return cv;
}
function mkShell() {
  const store = {};
  global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  };
  const mainCanvas = mkCanvas(384, 224);
  global.document = {
    readyState: 'complete',
    getElementById: id => (id === 'game' ? mainCanvas : null),
    createElement: t => (t === 'canvas' ? mkCanvas(1, 1) : {}),
    addEventListener: () => {},
  };
  global.window = global;
  global.addEventListener = () => {};
  global.removeEventListener = () => {};
  global.innerWidth = 1280; global.innerHeight = 800;
  global.requestAnimationFrame = () => 0;
  global.location = { search: '' };
  return mainCanvas;
}

/* ==================== 2. 沙箱执行器（ui.js 尾部注入导出） ==================== */
const EXPOSE = '\n;globalThis.__UI={' +
  'game:game,progress:progress,startLevel:startLevel,step:step,render:render,' +
  'pressed:pressed,keys:keys,clearPressed:clearPressed,KEYMAP:KEYMAP,hit:hit,' +
  'puzzle:puzzle,openPuzzle:openPuzzle,openBag:openBag,closeBag:closeBag,' +
  'SPR:SPR,ALL_LEVELS:ALL_LEVELS,VIEW:VIEW_W,textW:_textW,' +
  'HINT:[L1_HINT1,L1_HINT2,L1_HINT3],' +
  'getHintT:function(){return hintT;},setHintT:function(v){hintT=v;},' +
  'getUi:function(){return {uiState:uiState,menuSel:menuSel,wardrobeOpen:wardrobeOpen,' +
  'wardrobeSel:wardrobeSel,bagOpen:bagOpen,bagFocus:bagFocus,bagSelBag:bagSelBag,' +
  'puzzleOpen:puzzle.open,lastLevelIdx:lastLevelIdx};},' +
  'setUi:function(o){if("uiState" in o)uiState=o.uiState;if("menuSel" in o)menuSel=o.menuSel;' +
  'if("wardrobeOpen" in o)wardrobeOpen=o.wardrobeOpen;if("wardrobeSel" in o)wardrobeSel=o.wardrobeSel;' +
  'if("bagFocus" in o)bagFocus=o.bagFocus;if("bagSelBag" in o)bagSelBag=o.bagSelBag;}' +
  '};\n';
function runSandbox() {
  const mainCanvas = mkShell();
  let body = 'const VIEW_W=384,VIEW_H=224,TILE=16;\n' + read('art.js') + '\n';
  for (const f of ['levels.js', 'chapter2.js', 'chapter3.js', 'engine.js']) {
    if (!fs.existsSync(path.join(ROOT, f))) continue;
    body += read(f) + '\n';
  }
  let uiSrc = read('ui.js');
  if (!/\}\)\(\);\s*$/.test(uiSrc)) { console.error('ui.js 尾部形态变化，无法注入导出'); process.exit(1); }
  uiSrc = uiSrc.replace(/\}\)\(\);\s*$/, EXPOSE + '})();\n');
  body += uiSrc;
  new Function(body)();
  return { U: global.__UI, rec: mainCanvas.getContext('2d')._rec };
}
function boot(label, quiet) {
  try {
    const r = runSandbox();
    if (!quiet) console.log('沙箱就绪[' + label + ']：' + r.U.ALL_LEVELS.length + ' 关 | L1 提示=' + r.U.HINT.join(' | '));
    return r;
  } catch (e) {
    console.error('沙箱执行失败[' + label + ']: ' + (e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : e));
    process.exit(1);
  }
}
// 按帧循环同款语义按键：keys=持键、pressed=边沿；step 后清边沿（frame() 里 while 循环做的事）
function tap(U, code, steps) {
  U.keys[code] = true; U.pressed[code] = true;
  for (let i = 0; i < (steps || 1); i++) { U.step(1 / 60); U.clearPressed(); }
  U.keys[code] = false; U.pressed[code] = false;
}

/* ==================== Run A：任务 1 —— L1 背景提示常驻 ==================== */
const A = boot('A/提示');
{
  const U = A.U, G = U.game, rec = A.rec;
  const has = (arr, s) => arr.some(r => r.s === s);

  console.log('\n==== ① L1 操作提示常驻天空层 ====');
  // 可用宽度：VIEW_W=384，两侧各 12px
  const AVAIL = 384 - 24;
  const w1 = U.textW(U.HINT[0], 11), w2 = U.textW(U.HINT[1], 10), w3 = U.textW(U.HINT[2], 9);
  check('三行文案宽度均在可用区（≤' + AVAIL + 'px）',
    w1 <= AVAIL && w2 <= AVAIL && w3 <= AVAIL,
    '行1=' + Math.round(w1) + 'px@11 / 行2=' + Math.round(w2) + 'px@10 / 行3=' + Math.round(w3) + 'px@9');
  check('三行文案不含像素字体缺字（全中文/箭头/ASCII，drawCNText 走系统字体）',
    U.HINT.every(s => /^[\u2190-\u21FF\u4e00-\u9fa5A-Za-z0-9 ·/]+$/.test(s)), U.HINT.join(' | '));

  U.startLevel(0);
  const ui0 = U.getUi();
  check('startLevel(0) 后 uiState=play 且 levelIdx=0', ui0.uiState === 'play' && G.levelIdx === 0,
    'uiState=' + ui0.uiState + ' levelIdx=' + G.levelIdx);
  check('L1 进关 hintT=3.0（底部条计时仍在跑，只是不再用于 L1）', Math.abs(U.getHintT() - 3.0) < 1e-6,
    'hintT=' + U.getHintT());

  // 把 hintT 打到 0（模拟 3 秒已过），再渲染：背景提示必须仍在
  const hasShrine = !!(G.level.shrines && G.level.shrines.length && !G.solvedPuzzles[G.level.shrines[0].idx]);
  U.setHintT(0);
  rec.fillText.length = 0; rec.paths.length = 0;
  U.render();
  check('hintT=0 时 L1 背景提示仍绘制（行1）', has(rec.fillText, U.HINT[0]),
    'fillText 共 ' + rec.fillText.length + ' 条，命中行1=' + has(rec.fillText, U.HINT[0]));
  check('hintT=0 时 L1 背景提示仍绘制（行2）', has(rec.fillText, U.HINT[1]), '命中行2=' + has(rec.fillText, U.HINT[1]));
  // v8.0 修②：每行画两遍（先投影后正色），断言取「正色那一遍」——投影按 (+1,+1) 偏移，不是布局位置
  const ROW_COLOR = ['#ffffff', '#f8e8b0', '#ffe9a0'];
  const ROW_Y = [42, 57, 71];
  const row1 = rec.fillText.find(r => r.s === U.HINT[0] && r.style === ROW_COLOR[0]);
  const row2 = rec.fillText.find(r => r.s === U.HINT[1] && r.style === ROW_COLOR[1]);
  check('画在天空区（y=42/57，屏幕坐标居中 x=192）',
    row1 && row2 && row1.y === 42 && row2.y === 57 && row1.x === 192 && row2.x === 192,
    row1 && row2 ? ('行1@(' + row1.x + ',' + row1.y + ') alpha=' + row1.alpha + ' / 行2@(' + row2.x + ',' + row2.y + ') alpha=' + row2.alpha) : '未找到');
  // v8.0 修②：透明度上调（0.40/0.36/0.42 → 0.58/0.50/0.62），实机截图三行原本第三行几乎不可读
  const rows = U.HINT.map((s, i) => rec.fillText.find(r => r.s === s && r.style === ROW_COLOR[i])).filter(Boolean);
  check('L1 背景提示各行透明度 ≥0.5（0.58/0.50/0.62，不再是看不清的低透明度）',
    rows.length === (hasShrine ? 3 : 2) && rows.every(r => r.alpha >= 0.5),
    rows.map((r, i) => '行' + (i + 1) + '=' + r.alpha).join(' / '));
  // v8.0 修②：1px 深色投影必须真的画了（同文案、同对齐中心、偏移 +1/+1、色 rgba(10,20,40,0.9)）
  const shadows = U.HINT.map((s, i) => rec.fillText.find(r => r.s === s && r.style === 'rgba(10,20,40,0.9)')).filter(Boolean);
  check('L1 三行都有 (+1,+1) 深色投影（浅蓝天空/白云上可读，仍保持半透明质感）',
    shadows.length === rows.length && shadows.every((r, i) => r.x === 193 && r.y === ROW_Y[i] + 1),
    shadows.map((r, i) => '行' + (i + 1) + '@(' + r.x + ',' + r.y + ')').join(' / '));

  // L1 有未解神龛 → 第三行（谜题指引）并入背景提示
  check('L1 谜题指引行（第三行）随未解神龛出现', !hasShrine || has(rec.fillText, U.HINT[2]),
    'hasShrine=' + hasShrine + ' 命中=' + has(rec.fillText, U.HINT[2]));

  // L1 不再画底部 3 秒条（同一文案不许上下各一遍）
  const l1meta = G.level.meta.hint;
  U.setHintT(2.5);
  rec.fillText.length = 0;
  U.render();
  check('L1 即使 hintT>0 也不再画底部条（无重复文案）', !has(rec.fillText, l1meta),
    '底部条文案「' + l1meta + '」命中=' + has(rec.fillText, l1meta));

  // 非 L1：hintT=0 → 无该文案；hintT>0 → 走底部条（原行为不变）
  U.startLevel(1);
  const L2hint = G.level.meta.hint;
  U.setHintT(0);
  rec.fillText.length = 0;
  U.render();
  check('非 L1 关卡 hintT=0 时背景提示不出现（行1/行2 均无）',
    !has(rec.fillText, U.HINT[0]) && !has(rec.fillText, U.HINT[1]),
    'levelIdx=' + G.levelIdx + ' 命中行1=' + has(rec.fillText, U.HINT[0]));
  U.setHintT(2.5);
  rec.fillText.length = 0; rec.paths.length = 0;
  U.render();
  check('非 L1 关卡 hintT>0 仍走底部 3 秒条（原行为不变）', has(rec.fillText, L2hint),
    'L' + (G.levelIdx + 1) + ' 文案「' + L2hint + '」命中=' + has(rec.fillText, L2hint));

  /* ---- v8.0 修①：金行与提示条面板的包围盒（实测，不读源码常量） ----
   * drawCNText 用 textBaseline='top' → fillText 的 y 就是字顶，字底 = y + px（从记录到的 font 里取）。
   * 面板走 _panelPath+fill，包围盒从路径顶点算出；底条面板 = h14 + alpha0.55 的那块。 */
  const goldTxt = '本关藏有谜题神龛 · 寻找金色光柱';
  const gRow = rec.fillText.find(r => r.s === goldTxt && r.style === '#f8d048');
  const gPx = gRow ? +((/bold (\d+)px/.exec(gRow.font) || [0, 9])[1]) : 0;
  const gTop = gRow ? gRow.y : 0, gBot = gRow ? gRow.y + gPx : 0;
  // 底条面板 = 高 14 + 填充 rgba(14,26,58,0.55)（_panel 的 opt.alpha；注意 globalAlpha 是 1，透明度在 fillStyle 里）
  const bars = rec.paths.filter(p => Math.abs(p.h - 14) < 0.01 && p.style === 'rgba(14,26,58,0.55)');
  const bar = bars[bars.length - 1] || null;
  check('神龛金行与提示条面板不重叠、间距 ≥6px（按真实渲染包围盒算）',
    !!(gRow && bar) && bar.y - gBot >= 6,
    gRow && bar ? ('金行 ' + gTop + '~' + gBot + 'px / 面板 ' + bar.y + '~' + (bar.y + bar.h) + 'px / 间距 ' + (bar.y - gBot) + 'px')
                : ('金行=' + !!gRow + ' 面板=' + !!bar));
  check('提示条面板下移后不压底部 HUD（底边 ≤ 技能槽描边上沿 197.5，且 ≤ 神龛 HUD 上沿 206）',
    !!bar && bar.y + bar.h <= 197.5 && bar.y + bar.h <= 206,
    bar ? ('面板底边 ' + (bar.y + bar.h) + 'px（技能槽 y=198 描边 197.5 起）') : '-');
  const hintRow = rec.fillText.find(r => r.s === L2hint);
  const hintPx = hintRow ? +((/bold (\d+)px/.exec(hintRow.font) || [0, 11])[1]) : 0;
  check('提示条文字垂直居中在面板内（字顶 ≥ 面板顶、字底 ≤ 面板底）',
    !!(hintRow && bar) && hintRow.y >= bar.y && hintRow.y + hintPx <= bar.y + bar.h,
    hintRow && bar ? ('字 ' + hintRow.y + '~' + (hintRow.y + hintPx) + 'px / 面板 ' + bar.y + '~' + (bar.y + bar.h) + 'px') : '-');

  // 背景提示不随相机：把相机推到最右再渲染，坐标不变（屏幕坐标系）
  U.startLevel(0);
  U.setHintT(0);
  G.cam.x = 900; G.cam.y = 40; G.shake = 6;
  rec.fillText.length = 0;
  U.render();
  const row1b = rec.fillText.find(r => r.s === U.HINT[0] && r.style === ROW_COLOR[0]); // v8.0：取正色那一遍（投影偏 +1）
  check('相机右移 900 + 震屏 6 后提示坐标不变（屏幕坐标，不随相机抖动）',
    row1b && row1b.x === 192 && row1b.y === 42, row1b ? ('@(' + row1b.x + ',' + row1b.y + ')') : '未找到');
  G.cam.x = 0; G.cam.y = 0; G.shake = 0;

  // v8.0 修③：L1 不再出「J 攻击 · K 冲刺 · 空格 跳×2」技能提示条（背景提示行1 已含同内容）
  U.startLevel(0); // 进关瞬间正是原来 skillHintT=6.0 的窗口
  rec.fillText.length = 0;
  U.render();
  const SKILL_BAR = 'J 攻击 · K 冲刺 · 空格 跳×2';
  check('L1 进关 6 秒窗口内不再画技能提示条（文案与源码都已移除）',
    !has(rec.fillText, SKILL_BAR) && read('ui.js').indexOf(SKILL_BAR) < 0,
    '画面命中=' + has(rec.fillText, SKILL_BAR) + ' / ui.js 残留=' + (read('ui.js').indexOf(SKILL_BAR) >= 0));
}

/* ==================== Run B：任务 3 —— 三个新敌渲染分支 ==================== */
function fakeEnemy(type, x, extra) {
  const box = { beetle: [12, 12], spitter: [12, 16], hopper: [12, 12] }[type];
  return Object.assign({ type: type, x: x, y: 100, w: box[0], h: box[1], hp: 3, dead: 0,
    flashT: 0, t: 0, face: 1, ai: { st: 'idle', t: 0 } }, extra || {});
}
function mkSprite(w, h) { const c = mkCanvas(w, h); return c; }
{
  const U = A.U, G = U.game, rec = A.rec;
  console.log('\n==== ② 新敌渲染：SPR 缺失 → 程序化兜底（不抛异常 + fillRect） ====');
  // 三张契约精灵在当前 art.js 里尚未合入；显式删掉，保证测的就是兜底路径（未来合入也不影响本段）
  for (const k of ['beetle', 'beetleDead', 'spitter', 'spitterDead', 'hopper', 'hopperDead']) delete U.SPR[k];
  U.startLevel(0);
  U.setHintT(0);
  const L = G.level;
  const types = ['beetle', 'spitter', 'hopper'];
  let threw = null;
  try {
    L.enemies = types.map((t, i) => fakeEnemy(t, 40 + i * 40));
    rec.fillRect.length = 0;
    U.render();
  } catch (e) { threw = e; }
  check('SPR.beetle/spitter/hopper 缺失时 render() 不抛异常', !threw,
    threw ? String(threw && threw.message) : 'ok');
  // 兜底识别色：#7a3a48 甲虫 / #4aa85a 花苞 / #c8a028 跳蚤
  const cols = rec.fillRect.map(r => r.style);
  check('甲虫兜底矩形（#7a3a48 甲壳）', cols.indexOf('#7a3a48') >= 0, '命中=' + (cols.indexOf('#7a3a48') >= 0));
  check('吐弹花兜底矩形（#4aa85a 花苞）', cols.indexOf('#4aa85a') >= 0, '命中=' + (cols.indexOf('#4aa85a') >= 0));
  check('跳蚤兜底矩形（#c8a028 身体）', cols.indexOf('#c8a028') >= 0, '命中=' + (cols.indexOf('#c8a028') >= 0));
  check('三种兜底颜色互不相同（可区分）', new Set(['#7a3a48', '#4aa85a', '#c8a028']).size === 3, '#7a3a48/#4aa85a/#c8a028');

  // 死亡态（无 *Dead 精灵）也必须不崩
  threw = null;
  try {
    L.enemies = types.map((t, i) => fakeEnemy(t, 40 + i * 40, { dead: 0.3 }));
    U.render();
  } catch (e) { threw = e; }
  check('死亡态且 SPR.*Dead 缺失时 render() 不抛异常', !threw, threw ? String(threw && threw.message) : 'ok');

  console.log('\n==== ③ 新敌渲染：SPR 存在 → drawImage + 帧随 e.t 变化 ====');
  const B1 = mkSprite(14, 12), B2 = mkSprite(14, 12);
  const S1 = mkSprite(14, 16), S2 = mkSprite(14, 16);
  const H1 = mkSprite(12, 12), H2 = mkSprite(12, 12);
  U.SPR.beetle = [B1, B2]; U.SPR.beetleDead = mkSprite(14, 12);
  U.SPR.spitter = [S1, S2]; U.SPR.spitterDead = mkSprite(14, 16);
  U.SPR.hopper = [H1, H2]; U.SPR.hopperDead = mkSprite(12, 12);
  // face=-1 = 不翻转（基准面左），这样 drawImage 收到的一定是原帧对象，便于断言「取的是第几帧」
  function drawnFor(type, t, st, extra) {
    L.enemies = [fakeEnemy(type, 40, Object.assign({ t: t, face: -1, ai: { st: st, t: 0 } }, extra || {}))];
    rec.drawImage.length = 0;
    U.render();
    return rec.drawImage.map(r => r.img);
  }
  // 采样点按帧率选：beetle=(t*8|0)%2（每 0.125s 翻面）、spitter=(t*4|0)%2（每 0.25s）
  const bt = [0, 0.15, 0.3, 0.45], st4 = [0, 0.3, 0.6, 0.9];
  const beetleFrames = bt.map(t => { const imgs = drawnFor('beetle', t); return imgs.indexOf(B1) >= 0 ? 0 : imgs.indexOf(B2) >= 0 ? 1 : -1; });
  check('beetle 帧索引随 e.t 变化（(e.t*8|0)%2）', beetleFrames.join(',') === '0,1,0,1', 't=' + bt.join('/') + ' → ' + beetleFrames.join(','));
  const spitterFrames = st4.map(t => { const imgs = drawnFor('spitter', t); return imgs.indexOf(S1) >= 0 ? 0 : imgs.indexOf(S2) >= 0 ? 1 : -1; });
  check('spitter 帧索引随 e.t 变化（(e.t*4|0)%2）', spitterFrames.join(',') === '0,1,0,1', 't=' + st4.join('/') + ' → ' + spitterFrames.join(','));
  check('hopper idle 用第 0 帧', drawnFor('hopper', 9, 'idle').indexOf(H1) >= 0, 'idle 命中 H1');
  check('hopper crouch/air 用第 1 帧', drawnFor('hopper', 9, 'crouch').indexOf(H2) >= 0 && drawnFor('hopper', 9, 'air').indexOf(H2) >= 0, 'crouch/air 命中 H2');
  check('beetle wind 用第 1 帧（蓄力预警）', drawnFor('beetle', 0, 'wind').indexOf(B2) >= 0, 'wind 命中 B2');
  // 死亡态走 *Dead
  const deadImgs = drawnFor('beetle', 0, 'idle', { dead: 0.3 });
  check('死亡态画 SPR.beetleDead', deadImgs.indexOf(U.SPR.beetleDead) >= 0, '命中=' + (deadImgs.indexOf(U.SPR.beetleDead) >= 0));
  // 受击闪白：flashT>0 时不再直接画原帧（whiteOf 产出的新 canvas）
  const flashImgs = drawnFor('beetle', 0, 'idle', { flashT: 0.1 });
  check('受击闪白：flashT>0 时不直接画原帧（走 whiteOf 白版）',
    flashImgs.indexOf(B1) < 0 && flashImgs.indexOf(B2) < 0 && flashImgs.length > 0, 'drawImage ' + flashImgs.length + ' 次');
  // 朝向：face>0 走 flipCache（产出的是新 canvas，不等于原帧）
  const right = drawnFor('hopper', 9, 'idle', { face: 1 });
  const left = drawnFor('hopper', 9, 'idle', { face: -1 });
  check('hopper face=-1 直接画原帧、face=+1 画翻转帧', left.indexOf(H1) >= 0 && right.indexOf(H1) < 0, 'face+1 命中原帧=' + (right.indexOf(H1) >= 0));
  // 血条：新敌非精英，_eliteFx 不参与；BAL.elite 缺键也不得报错（上面所有 render 已覆盖），此处显式断言
  let eliteThrew = null;
  try { L.enemies = [fakeEnemy('beetle', 40, { elite: true })]; U.render(); } catch (e) { eliteThrew = e; }
  check('新敌被标 elite 时（BAL.elite[type] 缺失）也不报错', !eliteThrew, eliteThrew ? String(eliteThrew.message) : 'ok');
}

/* ==================== Run C：任务 2 —— 键位兼容矩阵 ==================== */
console.log('\n==== ④ 键位矩阵：WASD 与方向键同动作 ====');
{
  // 静态扫描：不允许任何分支写裸键名（方向/确认）——先剥掉行注释，避免把「注释里的历史写法」误判为消费点
  const src = read('ui.js').replace(/\/\/[^\n]*/g, '');
  const bad = [];
  if (/hit\('Arrow/.test(src)) bad.push("hit('Arrow*')");
  if (/pressed\['Arrow/.test(src)) bad.push("pressed['Arrow*']");
  if (/pressed\['Enter'\]/.test(src)) bad.push("pressed['Enter']");
  if (/pressed\['Key[WASD]'\]/.test(src)) bad.push("pressed['KeyW/A/S/D']");
  check('静态扫描：无裸方向键/裸 Enter 消费点（全部走 KEYMAP 组）', bad.length === 0, bad.length ? bad.join(', ') : '0 处');
  const K = A.U.KEYMAP;
  check('KEYMAP.left/right/up/down 同时含方向键与 WASD',
    ['left', 'right', 'up', 'down'].every(n => K[n].some(c => /^Arrow/.test(c)) && K[n].some(c => /^Key[WASD]$/.test(c))),
    'left=' + K.left + ' right=' + K.right + ' up=' + K.up + ' down=' + K.down);
  check('KEYMAP.ok = Enter/Space（无方向冲突的确认组）',
    K.ok.length === 2 && K.ok.indexOf('Enter') >= 0 && K.ok.indexOf('Space') >= 0, K.ok.join(','));
  check('KEYMAP.confirm 仍含 Enter/Space/KeyW/ArrowUp（title/clear/credits 沿用）',
    ['Enter', 'Space', 'KeyW', 'ArrowUp'].every(c => K.confirm.indexOf(c) >= 0), K.confirm.join(','));

  // 功能等价：同一 (界面, 动作) 用 WASD 键与方向键各跑一次全新沙箱，比较可观测状态
  function snap(U, pick) {
    const G = U.game, u = U.getUi(), p = G.player || {};
    const all = { ui: u.uiState, sel: u.menuSel, lvl: G.levelIdx, left: G.input.left, down: G.input.down,
      jump: G.input.jump, vy: Math.round(p.vy || 0), px: Math.round(p.x || 0),
      pcx: U.puzzle.cur ? U.puzzle.cur.x : -1, pcy: U.puzzle.cur ? U.puzzle.cur.y : -1,
      bag: u.bagSelBag, wd: u.wardrobeSel, paused: G.paused, coins: G.coins,
      eq: U.progress.equip.w + '/' + U.progress.equip.h + '/' + U.progress.equip.c, skin: U.progress.skin };
    if (!pick) return JSON.stringify(all);
    const o = {}; for (const k of pick) o[k] = all[k];
    return JSON.stringify(o);
  }
  // setup(U) 把沙箱摆到该用例的起始状态；act 只按一个键
  const CASES = [
    { name: 'title · 开始游戏', a: 'KeyW', b: 'ArrowUp',
      setup: U => { U.setUi({ uiState: 'title', wardrobeOpen: false }); } },
    { name: 'select · 左移一格', a: 'KeyA', b: 'ArrowLeft',
      setup: U => { U.setUi({ uiState: 'select', menuSel: 2 }); } },
    { name: 'select · 下移（跨章）', a: 'KeyS', b: 'ArrowDown',
      setup: U => { U.setUi({ uiState: 'select', menuSel: 2 }); } },
    { name: 'play · 左移', a: 'KeyA', b: 'ArrowLeft',
      setup: U => { U.startLevel(0); } },
    { name: 'play · 速降（下）', a: 'KeyS', b: 'ArrowDown',
      setup: U => { U.startLevel(0); } },
    { name: 'play · 跳跃', a: 'KeyW', b: 'ArrowUp',
      setup: U => { U.startLevel(0); U.step(1 / 60); } },
    { name: 'puzzle · 光标左移', a: 'KeyA', b: 'ArrowLeft',
      setup: U => { U.startLevel(0); U.openPuzzle(1); U.puzzle.ruleOn = false; U.puzzle.cur = { x: 3, y: 3 }; } },
    { name: 'puzzle · 光标上移', a: 'KeyW', b: 'ArrowUp',
      setup: U => { U.startLevel(0); U.openPuzzle(1); U.puzzle.ruleOn = false; U.puzzle.cur = { x: 3, y: 3 }; } },
    { name: 'bag · 上移一行', a: 'KeyW', b: 'ArrowUp',
      setup: U => { U.startLevel(0); U.openBag(); U.setUi({ bagFocus: 'bag', bagSelBag: 6 }); } },
    { name: 'wardrobe · 左移一格', a: 'KeyA', b: 'ArrowLeft',
      setup: U => { U.setUi({ uiState: 'title', wardrobeOpen: true, wardrobeSel: 3 }); } },
    // 确认组（Enter vs Space）：Space 同时是「跳跃」键（KEYMAP.jump），play 态下 game.input.jump 必然为 1，
    // 那是输入桥接而非界面动作，故只比对「结果字段」（界面/关卡/装备/皮肤），不比对原始输入位。
    { name: 'clear · 确认继续', a: 'Space', b: 'Enter', pick: ['ui', 'lvl', 'sel', 'eq', 'skin'],
      setup: U => { U.startLevel(0); U.setUi({ uiState: 'clear' }); U.game.clearT = 1; } },
    { name: 'bag · 确认装备', a: 'Space', b: 'Enter', pick: ['ui', 'lvl', 'eq', 'bag'],
      setup: U => { U.startLevel(0); U.progress.inv.length = 0; U.progress.inv.push({ id: 900, slot: 'h', r: 1 });
        U.progress.equip.h = -1; U.openBag(); U.setUi({ bagFocus: 'bag', bagSelBag: 0 }); } },
    { name: 'wardrobe · 确认装备', a: 'Space', b: 'Enter', pick: ['ui', 'wd', 'skin'],
      setup: U => { if (U.progress.skins.indexOf('sprout') < 0) U.progress.skins.push('sprout');
        U.progress.skin = 'blue'; U.setUi({ uiState: 'title', wardrobeOpen: true, wardrobeSel: 1 }); } },
    { name: 'select · 确认进入', a: 'Space', b: 'Enter', pick: ['ui', 'lvl', 'sel'],
      setup: U => { U.setUi({ uiState: 'select', menuSel: 0 }); } },
  ];
  for (const c of CASES) {
    const r1 = boot('case-a', true); c.setup(r1.U); tap(r1.U, c.a, 1); const s1 = snap(r1.U, c.pick);
    const r2 = boot('case-b', true); c.setup(r2.U); tap(r2.U, c.b, 1); const s2 = snap(r2.U, c.pick);
    const same = s1 === s2;
    // 并断言确实发生了变化（不是「两边都没反应」的假等价）
    const r0 = boot('case-0', true); c.setup(r0.U); const s0 = snap(r0.U, c.pick);
    check(c.name + '（' + c.a + ' vs ' + c.b + '）', same && s1 !== s0,
      same ? (s1 !== s0 ? '两键结果一致且状态已改变' : '两键一致但状态未变（键未生效）')
           : ('不一致：' + c.a + '→' + s1 + ' / ' + c.b + '→' + s2));
  }
}

/* ==================== Run D：暂停面板 Esc（v8.0 修的裸条件） ==================== */
console.log('\n==== ⑤ 暂停面板 ESC（面板文案「ESC: MENU」必须生效） ====');
{
  const r = boot('D/暂停');
  const U = r.U;
  U.startLevel(0);
  tap(U, 'KeyP', 1);
  check('P 进暂停', U.game.paused === true, 'paused=' + U.game.paused);
  tap(U, 'Escape', 1);
  check('暂停中 Esc 解除暂停并回选关（原 !game.paused 把这条整段拦掉）',
    U.game.paused === false && U.getUi().uiState === 'select',
    'paused=' + U.game.paused + ' uiState=' + U.getUi().uiState);
}

console.log('\n==== 汇总：' + nPass + ' PASS / ' + nFail + ' FAIL ====');
process.exit(nFail ? 1 : 0);
