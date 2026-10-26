// tools/_v11_ui.js —— v11 界面队自检（node 直跑；退出码 0=全过，1=有失败）
// 覆盖本波 ui.js 五项任务里可断言的渲染行为：
//   ① game.seal 缺失 → renderSeal 零绘制、整帧 render 不抛异常；
//   ② 封印未解 → 光罩（fillRect/arc）+ 锁图标 + 面板三行文案；光罩画在终点旗之前；
//   ③ open=true → 光罩不再画，碎裂动画播一次后自动停；
//   ④ blockT>0 → 「封印未解 · 完成任意一项即可」+ 红色冲击环；
//   ⑤ 已达成行 → 行首金色 ✓（程序化像素）且文案金色；
//   ⑥ 面板不出屏（终点贴左 x=16 / 贴右 x=368 两种极端）；
//   ⑦ hasShrine=false → 面板只两行；
//   ⑧ 结算屏 via='battle' 出现「封印解除：武力」，via=null 不出现；
//   ⑨ 进关 2 秒封印提示条（任务 3 的选型）确实弹出。
// 沙箱手法照抄 tools/gate.js / tools/_v10_ui.js：art+levels+章节+engine+ui 拼成一个函数体执行
// （经典 script 同作用域），只 mock 浏览器外壳，不写不删任何游戏文件。
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

/* ==================== 1. 浏览器外壳 mock（照抄 tools/_v10_ui.js，补全局序号 seq 用于比绘制先后） ==================== */
const grad = () => ({ addColorStop() {} });
function mkCtx(cv) {
  const noop = () => {};
  const rec = { fillText: [], fillRect: [], drawImage: [], arcs: [], rects: [], paths: [], seq: 0 };
  let pts = [];
  const push = (arr, o) => { o.i = rec.seq++; arr.push(o); };
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
  t.arc = (x, y, r) => { push(rec.arcs, { x: +x, y: +y, r: +r, style: t.strokeStyle, fill: t.fillStyle, alpha: t.globalAlpha }); };
  t.fill = () => {
    if (!pts.length) return;
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const x = Math.min.apply(null, xs), y = Math.min.apply(null, ys);
    push(rec.paths, { x: x, y: y, w: Math.max.apply(null, xs) - x, h: Math.max.apply(null, ys) - y,
      alpha: t.globalAlpha, style: t.fillStyle });
  };
  t.strokeRect = (x, y, w, h) => { push(rec.rects, { x: +x, y: +y, w: +w, h: +h, style: t.strokeStyle, lw: t.lineWidth, alpha: t.globalAlpha }); };
  t.fillText = (s, x, y) => { push(rec.fillText, { s: String(s), x: +x, y: +y, alpha: t.globalAlpha, style: t.fillStyle, font: t.font, align: t.textAlign }); };
  t.fillRect = (x, y, w, h) => { push(rec.fillRect, { x: +x, y: +y, w: +w, h: +h, alpha: t.globalAlpha, style: t.fillStyle }); };
  t.drawImage = (img) => { push(rec.drawImage, { img }); };
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
  'renderSeal:renderSeal,renderClear:renderClear,renderHUD:renderHUD,' +
  'SPR:SPR,ALL_LEVELS:ALL_LEVELS,VIEW:VIEW_W,textW:_textW,cnW:_textW,' +
  'chapters:_chapters,rowMax:CH_ROW_MAX' +   // v12：选关章节表（加关后是否漏卡）
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
function boot() {
  try {
    const r = runSandbox();
    console.log('沙箱就绪：' + r.U.ALL_LEVELS.length + ' 关');
    return r;
  } catch (e) {
    console.error('沙箱执行失败: ' + (e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : e));
    process.exit(1);
  }
}

/* ==================== 3. 断言辅助 ==================== */
const S = boot();
const U = S.U, G = U.game, rec = S.rec, VW = U.VIEW;
const clear = () => { rec.fillText.length = 0; rec.fillRect.length = 0; rec.drawImage.length = 0;
  rec.arcs.length = 0; rec.rects.length = 0; rec.paths.length = 0; rec.seq = 0; };
const ops = () => rec.fillRect.length + rec.drawImage.length + rec.fillText.length + rec.arcs.length + rec.paths.length;
function safe(label, fn) {
  try { fn(); return true; } catch (e) { console.log('  ↳ ' + label + ' 抛异常: ' + (e && e.stack ? e.stack.split('\n')[1].trim() + ' / ' : '') + (e && e.message)); return false; }
}
// 面板底色（_sealPanelBg 的路径填充）→ 面板外框 bbox，用来做「不出屏」断言
const panelBox = () => rec.paths.find(p => /^rgba\((30,14,58|58,14,30)/.test(p.style)) || null;
const txt = s => rec.fillText.filter(r => r.s === s);
const hasTxt = s => txt(s).length > 0;

/* ---- 进 L1 建立 level/player 上下文（uiState='play'） ---- */
U.startLevel(0);
const L = G.level;
console.log('关卡：L' + (G.levelIdx + 1) + ' ' + L.meta.name + ' | 终点 goal=' +
  (L.goal ? '(' + L.goal.x + ',' + L.goal.y + ' ' + L.goal.w + '×' + L.goal.h + ')' : 'null') +
  ' | 引擎是否已产出 seal=' + !!G.seal);
G.cam.x = 0; G.cam.y = 0;
// 固定一块干净场地：终点放在玩家正前方（面板 96px 内）
const GOAL = { x: 200, y: 96, w: 16, h: 32 };
L.goal = { x: GOAL.x, y: GOAL.y, w: GOAL.w, h: GOAL.h };
G.player.x = GOAL.x - 24; G.player.y = GOAL.y + 16; G.player.dead = false;
const mkSeal = o => Object.assign({
  enemyTotal: 6, enemyKilled: 4, enemyNeed: 6,
  coinTotal: 20, coinGot: 12, coinNeed: 17,
  hasShrine: true, shrineOk: false, open: false, via: null, blockT: 0, relaxed: false,
}, o || {});

/* ==================== ① seal 缺失：零绘制 + 不抛异常 ==================== */
console.log('\n==== ① game.seal 缺失（引擎未合入） ====');
{
  delete G.seal; clear();
  const ok1 = safe('renderSeal', () => U.renderSeal(L, G.tick));
  check('game.seal === undefined → renderSeal 不抛异常且零绘制', ok1 && ops() === 0, '绘制 ' + ops() + ' 次');
  G.seal = null; clear();
  const ok2 = safe('renderSeal(null)', () => U.renderSeal(L, G.tick));
  check('game.seal = null → 不抛异常且零绘制', ok2 && ops() === 0, '绘制 ' + ops() + ' 次');
  delete G.seal; clear();
  const ok3 = safe('整帧 render', () => U.render());
  check('整帧 render()（含 HUD/实体）在 seal 缺失时不抛异常', ok3, '绘制 ' + ops() + ' 次');
  // 终点缺失（Boss 关）也不得抛
  const g0 = L.goal; L.goal = null; G.seal = mkSeal(); clear();
  const ok4 = safe('goal=null', () => U.renderSeal(L, G.tick));
  check('L.goal 缺失（Boss 关）→ renderSeal 直接返回、不抛异常且零绘制', ok4 && ops() === 0, '绘制 ' + ops() + ' 次');
  L.goal = g0;
}

/* ==================== ② 封印未解：光罩 + 锁 + 三行面板 + 绘制顺序 ==================== */
console.log('\n==== ② 封印未解（4/6 敌人 · 12/17 金币 · 神龛未解） ====');
{
  G.seal = mkSeal(); clear();
  const ok = safe('renderSeal', () => U.renderSeal(L, 40));
  const wall = rec.fillRect.filter(r => r.style === '#5a2ec8');
  const lock = rec.arcs.filter(a => Math.abs(a.r - 2.2) < 0.01);
  check('光罩有绘制：主体 fillRect 覆盖终点 18×32', ok && wall.length === 1 && wall[0].w === 18 && wall[0].h === 32,
    wall.length ? ('x=' + wall[0].x + ' y=' + wall[0].y + ' ' + wall[0].w + '×' + wall[0].h) : '未画主体');
  check('光罩内部流动纹路（每 2px 一条，共 16 条）+ 上下亮条 2px',
    rec.fillRect.filter(r => r.w === 16 && r.h === 1).length === 16 &&
    rec.fillRect.filter(r => r.w === 18 && r.h === 2).length === 2,
    '纹路 ' + rec.fillRect.filter(r => r.w === 16 && r.h === 1).length + ' 条 / 亮条 ' +
    rec.fillRect.filter(r => r.w === 18 && r.h === 2).length + ' 条');
  check('锁图标被画（半圆锁梁 arc r=2.2 + 6×5 锁体）', lock.length === 1 &&
    rec.fillRect.some(r => r.w === 6 && r.h === 5 && r.style === '#efe0ff'),
    '锁梁 arc ' + lock.length + ' 次');
  check('呼吸 alpha 落在 0.45~0.65 区间（整面墙的 globalAlpha）',
    wall.length === 1 && wall[0].alpha >= 0.45 && wall[0].alpha <= 0.65, '实测 alpha=' + (wall[0] && wall[0].alpha.toFixed(3)));
  check('条件面板出现三行文案：击败 / 金币 / 谜题',
    hasTxt('击败') && hasTxt('金币') && hasTxt('谜题'),
    rec.fillText.map(r => r.s).filter(s => s.length <= 4).join(','));
  check('三行数值走像素字（4/6、12/17 由 fillRect 拼出，不走 CN 字体）',
    rec.fillRect.some(r => r.w === 1 && r.h === 1 && r.style === '#cfd2e2'),
    '像素点 ' + rec.fillRect.filter(r => r.w === 1 && r.h === 1).length + ' 个');
  // 绘制顺序：光罩（#5a2ec8 主体）必须早于终点旗（SPR.flag 帧）
  clear(); U.render();
  const wallI = rec.fillRect.find(r => r.style === '#5a2ec8');
  const flagI = rec.drawImage.find(d => Array.isArray(U.SPR.flag) && U.SPR.flag.indexOf(d.img) >= 0);
  check('渲染顺序：光罩画在终点旗之前（旗压在光罩上，先看到封印再看到旗）',
    !!wallI && !!flagI && wallI.i < flagI.i,
    wallI && flagI ? ('光罩 seq=' + wallI.i + ' / 旗 seq=' + flagI.i) : '缺绘制');
  // 玩家离终点 >96px 时不弹面板
  const px0 = G.player.x;
  G.player.x = GOAL.x - 160; clear(); U.renderSeal(L, 40);
  check('玩家离终点 ≥96px → 面板不出现（只有光罩）',
    !hasTxt('击败') && rec.fillRect.some(r => r.style === '#5a2ec8'),
    '面板文案 ' + (hasTxt('击败') ? '仍在' : '已隐藏'));
  G.player.x = px0;
}

/* ==================== ③ 解除：光罩消失 + 碎裂只播一次 ==================== */
console.log('\n==== ③ open=true：光罩消失 + 碎裂动画播一次后停止 ====');
{
  G.seal = mkSeal({ open: true, via: 'battle' });
  clear(); U.renderSeal(L, 60);
  const shards = rec.fillRect.filter(r => r.style === '#8a4ae0' || r.style === '#d8b0ff');
  check('open=true → 光罩主体不再画（#5a2ec8 零次）', rec.fillRect.filter(r => r.style === '#5a2ec8').length === 0,
    '主体 ' + rec.fillRect.filter(r => r.style === '#5a2ec8').length + ' 次');
  check('open=true → 首帧起播碎裂（12 片碎片）', shards.length === 12, '碎片 ' + shards.length + ' 片');
  check('open=true → 条件面板不再出现', !hasTxt('击败'), '面板文案 ' + (hasTxt('击败') ? '仍在' : '已隐藏'));
  let n = 0;
  for (let i = 0; i < 40; i++) { clear(); U.renderSeal(L, 60 + i); n = ops(); }
  check('碎裂 0.4s 播完后彻底停止（不再每帧重播）', n === 0, '第 41 帧绘制 ' + n + ' 次');
}

/* ==================== ④ blockT>0：弹回反馈 ==================== */
console.log('\n==== ④ blockT>0：被封印弹回 ====');
{
  G.seal = mkSeal({ blockT: 0.9 });  // 0.9 = 引擎 blockT 初值
  clear(); U.renderSeal(L, 90);
  check('出现「封印未解 · 完成任意一项即可」', hasTxt('封印未解 · 完成任意一项即可'),
    rec.fillText.map(r => r.s).filter(s => s.indexOf('封印') === 0).join(' | '));
  const ring = rec.arcs.filter(a => a.style === '#ff4a5a');
  const r0 = ring.length ? ring[0].r : -1;
  clear(); U.renderSeal(L, 90); G.seal.blockT = 0.3; clear(); U.renderSeal(L, 90);
  const r1 = (rec.arcs.filter(a => a.style === '#ff4a5a')[0] || {}).r;
  check('外扩红色冲击环（strokeStyle #ff4a5a 的 arc，随 blockT 递减而外扩）',
    ring.length === 1 && r0 >= 8 && r1 > r0, 'r: ' + r0 + ' → ' + r1);
  G.seal.blockT = 0.9;
  check('整面墙转红（弹回态主体色 #c82846）', rec.fillRect.some(r => r.style === '#c82846'),
    '红墙 ' + rec.fillRect.filter(r => r.style === '#c82846').length + ' 次');
  const box = panelBox();
  check('面板弹回态换暗红底（rgba(58,14,30,…)）+ 整体抖动 2px',
    !!box && /^rgba\(58,14,30/.test(box.style), box ? box.style : '未画面板');
  // 抖动幅度：两个不同 tick 的面板 x 相差 ≤4px（±2px 抖动）
  clear(); U.renderSeal(L, 90); const b1 = panelBox();
  clear(); U.renderSeal(L, 92); const b2 = panelBox();
  check('抖动幅度 ±2px（两帧面板 x 位移 ≤4px）', !!b1 && !!b2 && Math.abs(b1.x - b2.x) <= 4,
    b1 && b2 ? ('Δx=' + Math.abs(b1.x - b2.x)) : '未画面板');
}

/* ==================== ⑤ 达成行：金色 ✓ ==================== */
console.log('\n==== ⑤ 达成行（enemyKilled >= enemyNeed） ====');
{
  G.seal = mkSeal({ enemyKilled: 6, coinGot: 12 });
  clear(); U.renderSeal(L, 100);
  const box = panelBox();
  const gold = rec.fillRect.filter(r => r.style === '#f8d048' && r.w === 1 && r.h === 1 &&
    box && r.x >= box.x + 4 && r.x <= box.x + 13 && r.y >= box.y + 3 && r.y <= box.y + 15);
  check('战斗线达成 → 行首画金色 ✓（程序化像素点，14 点）', gold.length === 14, '金色像素 ' + gold.length + ' 点');
  const lab = txt('击败')[0], lab2 = txt('金币')[0];
  check('达成行文字变金色 #f8d048，未达成行仍是灰白',
    !!lab && lab.style === '#f8d048' && !!lab2 && lab2.style !== '#f8d048',
    '击败=' + (lab && lab.style) + ' / 金币=' + (lab2 && lab2.style));
  check('未达成行行首仍是类型图标（无金色 ✓ 溢出到金币行）',
    gold.every(r => r.y < box.y + 18), '✓ 像素 y 范围 ' +
    (gold.length ? Math.min.apply(null, gold.map(r => r.y)) + '~' + Math.max.apply(null, gold.map(r => r.y)) : '-'));
}

/* ==================== ⑥ 面板不出屏（贴左 / 贴右） ==================== */
console.log('\n==== ⑥ 面板边界钳制（终点 x=16 / x=368） ====');
{
  G.seal = mkSeal({ blockT: 0.9 }); // 弹回态=最宽面板（含提示行），最难塞进屏
  for (const gx of [16, 368]) {
    L.goal = { x: gx, y: 96, w: 16, h: 32 };
    G.player.x = gx - 20; G.cam.x = 0;
    clear(); U.renderSeal(L, 120);
    const box = panelBox();
    const inX = !!box && box.x >= 0 && box.x + box.w <= VW;
    // 面板内所有文字（居中锚点）也不得越界
    const tw = rec.fillText.filter(r => r.y >= box.y && r.y <= box.y + box.h);
    const textOk = tw.every(r => {
      const w = U.textW(r.s, 9);
      const left = r.align === 'right' ? r.x - w : r.align === 'center' ? r.x - w / 2 : r.x;
      return left >= 0 && left + w <= VW;
    });
    check('终点 x=' + gx + ' → 面板在 ' + VW + 'px 视口内（x=' + (box ? box.x : '?') +
      ' 宽 ' + (box ? box.w : '?') + '）', inX && textOk,
      box ? (box.x + '..' + (box.x + box.w) + ' / 文字' + (textOk ? 'OK' : '越界')) : '未画面板');
  }
  L.goal = { x: GOAL.x, y: GOAL.y, w: GOAL.w, h: GOAL.h };
  G.player.x = GOAL.x - 24;
}

/* ==================== ⑦ hasShrine=false：只两行 ==================== */
console.log('\n==== ⑦ hasShrine=false（无神龛的关） ====');
{
  G.seal = mkSeal({ hasShrine: false, shrineOk: false });
  clear(); U.renderSeal(L, 140);
  const rows = ['击败', '金币', '谜题'].filter(hasTxt);
  check('hasShrine=false → 面板只有 击败 / 金币 两行', rows.length === 2 && !hasTxt('谜题'), '行：' + rows.join('/'));
  const box2 = panelBox();
  check('面板高度随之变矮（两行 = 30px）', !!box2 && box2.h === 30, box2 ? 'h=' + box2.h : '未画面板');
}

/* ==================== ⑧ 结算屏：封印解除方式 ==================== */
console.log('\n==== ⑧ 结算屏 via 文案 ====');
{
  const runClear = (seal) => {
    G.seal = seal;
    clear();
    for (let i = 0; i < 22; i++) U.renderClear(180); // clearShown 0.3s 后出正文
    return rec.fillText.map(r => r.s);
  };
  const b = runClear(mkSeal({ open: true, via: 'battle' }));
  check("via='battle' → 结算出现「封印解除：武力」", b.indexOf('封印解除：武力') >= 0,
    b.filter(s => s.indexOf('封印解除') === 0).join(',') || '未出现');
  const c = runClear(mkSeal({ open: true, via: 'coin' }));
  check("via='coin' → 「封印解除：探索」", c.indexOf('封印解除：探索') >= 0, c.filter(s => s.indexOf('封印解除') === 0).join(','));
  const p = runClear(mkSeal({ open: true, via: 'puzzle' }));
  check("via='puzzle' → 「封印解除：智慧」", p.indexOf('封印解除：智慧') >= 0, p.filter(s => s.indexOf('封印解除') === 0).join(','));
  const n0 = runClear(mkSeal({ open: true, via: null }));
  check('via=null → 结算不出现「封印解除」（Boss 关豁免封印）',
    !n0.some(s => s.indexOf('封印解除') === 0), '结算行数 ' + n0.length);
  const nb = runClear(mkSeal({ open: true, via: 'boss' }));
  check("via='boss' → 不出现「封印解除」", !nb.some(s => s.indexOf('封印解除') === 0), '结算行数 ' + nb.length);
  delete G.seal;
  const ns = runClear(undefined);
  check('seal 缺失 → 结算屏不抛异常且不出现「封印解除」', !ns.some(s => s.indexOf('封印解除') === 0), '结算行数 ' + ns.length);
}

/* ==================== ⑨ 进关 2 秒封印提示条 ==================== */
console.log('\n==== ⑨ 进关提示条（任务 3 选型） ====');
{
  U.startLevel(0); G.cam.x = 0; G.cam.y = 0;
  L.goal = { x: GOAL.x, y: GOAL.y, w: GOAL.w, h: GOAL.h };
  G.seal = mkSeal();
  clear(); U.step(1 / 60); U.render();
  // v11 修：提示条由单行改为「标题 + 明细」两行（单行 35+ 字约 380px，实测左右被屏幕裁掉）。
  // 断言随之拆成两段：标题行匹配前缀，明细行匹配三条线数字。
  const line = rec.fillText.find(r => r.s.indexOf('本关终点已封印') === 0);
  const line2 = rec.fillText.find(r => r.s.indexOf('击败') >= 0 && r.s.indexOf('金币') >= 0);
  check('进关首帧弹出封印提示条（标题 + 三条线数字）', !!line && !!line2 &&
    line2.s.indexOf('击败 6 只敌人') >= 0 && line2.s.indexOf('收集 17 枚金币') >= 0 && line2.s.indexOf('解开神龛') >= 0,
    line ? (line.s + ' ‖ ' + (line2 ? line2.s : '明细行缺失')) : '未出现');
  const wide = [line, line2].filter(Boolean).reduce((a, r) =>
    (U.textW(r.s, 9) > U.textW(a.s, 9) ? r : a), line || line2 || { s: '', x: 0, y: 0 });
  check('提示条在视口内且不压 hint 底条（y ≤ VIEW_H-56）', !!line && line.y <= 224 - 56 &&
    wide.x - U.textW(wide.s, 9) / 2 >= 0 && wide.x + U.textW(wide.s, 9) / 2 <= 384,
    line ? ('y=' + line.y + ' 最宽行=' + Math.round(U.textW(wide.s, 9)) + 'px 左缘=' +
      Math.round(wide.x - U.textW(wide.s, 9) / 2) + ' 右缘=' + Math.round(wide.x + U.textW(wide.s, 9) / 2)) : '-');
  for (let i = 0; i < 130; i++) U.step(1 / 60); // 2.2s 后消失
  clear(); U.render();
  check('2 秒后提示条自动消失（每关只弹一次）', !rec.fillText.some(r => r.s.indexOf('本关终点已封印') === 0),
    '仍在=' + rec.fillText.some(r => r.s.indexOf('本关终点已封印') === 0));
  // 解除后不再弹
  U.startLevel(0); G.seal = mkSeal({ open: true }); clear();
  U.step(1 / 60); U.render();
  check('封印已解的关卡不弹提示条', !rec.fillText.some(r => r.s.indexOf('本关终点已封印') === 0),
    '仍在=' + rec.fillText.some(r => r.s.indexOf('本关终点已封印') === 0));
}

/* ==================== ⑩ 谜题跨关同步（任务 5） ==================== */
console.log('\n==== ⑩ 谜题状态跨关同步 ====');
{
  // 找一个有神龛的关，模拟「上一轮解过」的本地存档后重进
  let li = -1;
  for (let i = 0; i < U.ALL_LEVELS.length; i++) {
    if (U.ALL_LEVELS[i] && !U.ALL_LEVELS[i].boss) { li = i; break; }
  }
  U.progress.puzzles = U.progress.puzzles || {};
  U.progress.puzzles[li + 1] = true;           // 神龛 idx = 关号（gate/puzzle_audit 同口径）
  U.startLevel(li);
  check('重玩已解谜题的关 → game.solvedPuzzles[idx] 被本地存档回填（封印的谜题线不会被误判未解）',
    !!G.solvedPuzzles && G.solvedPuzzles[li + 1] === true,
    'solvedPuzzles[' + (li + 1) + ']=' + (G.solvedPuzzles && G.solvedPuzzles[li + 1]));
  delete U.progress.puzzles[li + 1];
}

/* ==================== ⑪ 真实引擎 seal 端到端（不用 mock） ==================== */
console.log('\n==== ⑪ 真实引擎 seal 端到端（L1 实关） ====');
{
  U.startLevel(0);
  const s0 = G.seal, gg = G.level.goal;
  check('引擎已产出 seal 且契约字段齐全',
    !!s0 && typeof s0.enemyNeed === 'number' && typeof s0.coinNeed === 'number' &&
    typeof s0.hasShrine === 'boolean' && s0.open === false && s0.via === null,
    s0 ? ('敌人 ' + s0.enemyNeed + '/' + s0.enemyTotal + ' · 金币 ' + s0.coinNeed + '/' + s0.coinTotal +
      ' · 神龛 ' + s0.hasShrine) : '无 seal');
  G.player.x = gg.x - 60; G.player.y = gg.y + 16; G.player.dead = false;
  G.cam.x = Math.max(0, gg.x - 180); G.cam.y = 0;
  clear(); const okR = safe('真实关卡整帧', () => U.render());
  const wall0 = rec.fillRect.find(r => r.style === '#5a2ec8');
  check('真实关卡：光罩落在真实终点上（x=goal.x-1）且面板同时出现',
    okR && !!wall0 && Math.abs(wall0.x - (gg.x - 1)) < 1.5 && hasTxt('击败'),
    wall0 ? ('光罩 x=' + wall0.x + ' / goal.x=' + gg.x) : '未画光罩');
  // 达成金币线 → 引擎放行
  let n = 0;
  for (const c of G.level.coins) { if (n < s0.coinNeed) { c.got = true; n++; } }
  U.step(1 / 60);
  check('金币线达成 → 引擎置 open=true / via=coin', G.seal.open === true && G.seal.via === 'coin',
    'open=' + G.seal.open + ' via=' + G.seal.via);
  clear(); U.render();
  check('解除同一帧起：光罩消失、碎裂开始播',
    rec.fillRect.filter(r => r.style === '#5a2ec8').length === 0 &&
    rec.fillRect.filter(r => r.style === '#8a4ae0' || r.style === '#d8b0ff').length === 12,
    '碎片 ' + rec.fillRect.filter(r => r.style === '#8a4ae0' || r.style === '#d8b0ff').length + ' 片');
}

/* ---- v12：选关屏必须给每一关都留卡位（加 L19 后末章按声明长度截断，第 19 关无卡可画） ---- */
{
  const chs = U.chapters();
  const covered = new Set();
  chs.forEach(c => { for (let j = 0; j < c.len; j++) covered.add(c.first + j); });
  const miss = U.ALL_LEVELS.map((_, i) => i).filter(i => !covered.has(i));
  check('选关屏章节表覆盖全部 ' + U.ALL_LEVELS.length + ' 关（无漏卡）',
    miss.length === 0, miss.length ? '漏 idx ' + JSON.stringify(miss) : '覆盖完整');
  const lastCh = chs[chs.length - 1];
  const lastRight = 6 + (lastCh.len - 1) * 53 + 46;
  check('末章最后一张卡不出画布（右缘 ' + lastRight + ' ≤ 384）', lastRight <= 384,
    '末章 ' + lastCh.len + ' 卡');
  check('单章卡位不超过一行上限 ' + U.rowMax, chs.every(c => c.wrap || c.len <= U.rowMax),
    chs.map(c => c.len).join('/'));
}

/* ==================== 汇总 ==================== */
console.log('\n================ v11 UI 自检汇总 ================');
console.log('PASS ' + nPass + ' / FAIL ' + nFail);
process.exit(nFail ? 1 : 0);
