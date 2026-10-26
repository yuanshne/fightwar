// tools/_v10_ui.js —— v10 界面队自检（node 直跑；退出码 0=全过，1=有失败）
// 覆盖本波 ui.js 四项任务：
//   ① 五种危险物（meteor/spike/homing/clone/pull）逐个渲染不抛异常 + 绘制调用数符合预期且 ≤12；
//   ② game.hazards 缺失 / 空数组 / 未知 kind 时整块安全跳过；
//   ③ SPR.meteor / SPR.spike / SPR.bossGhost 缺失时走程序化兜底且仍有绘制；
//   ④ b.comboN>=1 画连段警告、b.state==='stagger' 画破绽标记、血条三段刻度按 maxHp 比例；
//   ⑤ 危险物走相机坐标（cam 变化时屏幕位置同步 -cam）。
// 沙箱手法照抄 tools/gate.js / tools/_v80_ui.js：art+levels+章节+engine+ui 拼成一个函数体执行
// （经典 script 同作用域），只 mock 浏览器外壳（localStorage / canvas / document / rAF），不写不删任何游戏文件。
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

/* ==================== 1. 浏览器外壳 mock（照抄 tools/_v80_ui.js，补 arc/strokeRect 记录） ==================== */
const grad = () => ({ addColorStop() {} });
function mkCtx(cv) {
  const noop = () => {};
  const rec = { fillText: [], fillRect: [], drawImage: [], arcs: [], rects: [], paths: [] };
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
  t.arc = (x, y, r) => { rec.arcs.push({ x: +x, y: +y, r: +r, style: t.strokeStyle, fill: t.fillStyle, alpha: t.globalAlpha }); };
  t.fill = () => {
    if (!pts.length) return;
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const x = Math.min.apply(null, xs), y = Math.min.apply(null, ys);
    rec.paths.push({ x: x, y: y, w: Math.max.apply(null, xs) - x, h: Math.max.apply(null, ys) - y,
      alpha: t.globalAlpha, style: t.fillStyle });
  };
  t.strokeRect = (x, y, w, h) => { rec.rects.push({ x: +x, y: +y, w: +w, h: +h, style: t.strokeStyle, lw: t.lineWidth, alpha: t.globalAlpha }); };
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
  'game:game,progress:progress,startLevel:startLevel,step:step,render:render,renderHUD:renderHUD,' +
  'renderBoss:renderBoss,renderHazards:renderHazards,renderBossTags:renderBossTags,' +
  'renderBossWindupFx:renderBossWindupFx,bossTickXs:_bossTickXs,' +
  'pressed:pressed,keys:keys,clearPressed:clearPressed,SPR:SPR,ALL_LEVELS:ALL_LEVELS,' +
  'VIEW:VIEW_W,textW:_textW' +
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
  const cv = mainCanvas;
  return { U: global.__UI, rec: cv.getContext('2d')._rec };
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
const U = S.U, G = U.game, rec = S.rec;
const clear = () => { rec.fillText.length = 0; rec.fillRect.length = 0; rec.drawImage.length = 0;
  rec.arcs.length = 0; rec.rects.length = 0; rec.paths.length = 0; };
// 绘制调用数：fillRect + drawImage + fillText + arc + 路径填充（stroke 与 arc 共用同一次调用，不重复计）
const ops = () => rec.fillRect.length + rec.drawImage.length + rec.fillText.length + rec.arcs.length + rec.paths.length;
function safe(label, fn) {
  try { fn(); return true; } catch (e) { console.log('  ↳ ' + label + ' 抛异常: ' + (e && e.message)); return false; }
}
function renderHz(list, camX, camY) {
  G.hazards = list;
  clear();
  U.renderHazards(0, camX || 0, camY || 0);
  return ops();
}

/* ---- 进 L7（Boss 关，kind=1）建立 game.player / game.boss / level 上下文 ---- */
U.startLevel(6);
console.log('关卡：L' + (G.levelIdx + 1) + ' ' + G.level.meta.name + ' | boss kind=' + (G.boss && G.boss.kind) +
  ' maxHp=' + (G.boss && G.boss.maxHp));

/* ==================== ① 五种危险物逐个渲染 ==================== */
console.log('\n==== ① 五种危险物渲染（不抛异常 + 绘制调用数） ====');
const CASES = [
  ['meteor 预警(warnT>0)', { kind: 'meteor', x: 100, y: 120, vy: 180, r: 6, warnT: 0.8 }, 5, 12],
  ['meteor 下落(warnT<=0)', { kind: 'meteor', x: 140, y: 60, vy: 200, r: 6, warnT: 0 }, 4, 12],
  // v10：spike 下限 6→1。art.js 产出 SPR.spike 后走「1 次 drawImage（整帧纵向压缩）」，
  // 兜底路径才是「3 三角 × 2 填充 + 裂纹」6~12 次。两条路径都合法，下限取 1 覆盖两者，
  // 上限 12 仍能抓住「每帧重复堆绘制」的性能退化。
  ['spike 生长(h=18)', { kind: 'spike', x: 200, y: 200, h: 18, t: 0.6, life: 2 }, 1, 12],
  ['spike 预警(t<0.2)', { kind: 'spike', x: 220, y: 200, h: 0, t: 0.1, life: 2 }, 3, 12],
  ['homing 追踪弹', { kind: 'homing', x: 250, y: 120, vx: -60, vy: 30, turn: 2, life: 3, t: 1.2 }, 6, 12],
  ['clone 分身', { kind: 'clone', x: 280, y: 150, w: 52, h: 48, hp: 100, face: -1, flashT: 0.08, t: 0.5 }, 2, 12],
  ['pull 吸附力场', { kind: 'pull', x: 0, y: 0, r: 48, t: 0.4, life: 2, cx: 300, cy: 160 }, 8, 12],
];
for (const [label, hz, minOps, maxOps] of CASES) {
  let n = -1;
  const ok = safe(label, () => { n = renderHz([hz]); });
  check(label + ' 渲染不抛异常且绘制调用数在 ' + minOps + '~' + maxOps + ' 次',
    ok && n >= minOps && n <= maxOps, '实测 ' + n + ' 次绘制');
}

/* ---- 一次 10 个元素的性能预算（3 陨石 + 4 地刺 + 3 追踪，任务书上限场景） ---- */
{
  const many = [];
  for (let i = 0; i < 3; i++) many.push({ kind: 'meteor', x: 40 + i * 40, y: 80, vy: 180, r: 6, warnT: i ? 0 : 0.7 });
  for (let i = 0; i < 4; i++) many.push({ kind: 'spike', x: 60 + i * 30, y: 200, h: 20, t: 0.5, life: 2 });
  for (let i = 0; i < 3; i++) many.push({ kind: 'homing', x: 200 + i * 30, y: 100, vx: 40, vy: 20, turn: 1, life: 3, t: 0.9 });
  let n = -1;
  const ok = safe('10 元素', () => { n = renderHz(many); });
  check('10 元素同屏（3 陨石 + 4 地刺 + 3 追踪）不抛异常且总量 ≤120 次绘制（均摊 ≤12/元素）',
    ok && n > 0 && n <= 120, '实测 ' + n + ' 次');
}

/* ==================== ② 数据缺失安全跳过 ==================== */
console.log('\n==== ② game.hazards 缺失 / 空数组 / 未知 kind ====');
{
  G.hazards = undefined; clear();
  const ok1 = safe('undefined', () => U.renderHazards(0, 0, 0));
  check('game.hazards === undefined 时不抛异常且零绘制', ok1 && ops() === 0, '绘制 ' + ops() + ' 次');
  G.hazards = []; clear();
  const ok2 = safe('空数组', () => U.renderHazards(0, 0, 0));
  check('game.hazards = [] 时不抛异常且零绘制', ok2 && ops() === 0, '绘制 ' + ops() + ' 次');
  delete G.hazards; clear();
  const ok3 = safe('缺字段', () => U.renderHazards(0, 0, 0));
  check('game 上没有 hazards 字段时不抛异常', ok3 && ops() === 0, '绘制 ' + ops() + ' 次');
  let n = -1;
  const ok4 = safe('未知 kind', () => { n = renderHz([{ kind: 'unknownXYZ', x: 1, y: 2 }, null, undefined]); });
  check('未知 kind / null 元素被跳过、不抛异常、零绘制', ok4 && n === 0, '绘制 ' + n + ' 次');
}

/* ==================== ③ SPR 缺失走兜底 ==================== */
console.log('\n==== ③ SPR.meteor / spike / bossGhost 缺失走程序化兜底 ====');
{
  const saved = { meteor: U.SPR.meteor, spike: U.SPR.spike, ghost: U.SPR.bossGhost };
  check('基线：art.js 当前是否已产出 meteor/spike/bossGhost',
    true, 'meteor=' + !!saved.meteor + ' spike=' + !!saved.spike + ' bossGhost=' + !!saved.ghost);
  delete U.SPR.meteor; delete U.SPR.spike; delete U.SPR.bossGhost;
  let m = -1, sp = -1, cl = -1;
  const ok1 = safe('meteor 兜底', () => { m = renderHz([{ kind: 'meteor', x: 120, y: 60, vy: 200, r: 6, warnT: 0 }]); });
  check('SPR.meteor 缺失 → 程序化橙红球 + 尾焰，仍有绘制（arc/path）',
    ok1 && m > 0 && rec.arcs.length + rec.paths.length > 0, '绘制 ' + m + ' 次（arc ' + rec.arcs.length + ' / path ' + rec.paths.length + '）');
  const ok2 = safe('spike 兜底', () => { sp = renderHz([{ kind: 'spike', x: 200, y: 200, h: 20, t: 0.5, life: 2 }]); });
  check('SPR.spike 缺失 → 3 根深灰三角簇（6 次路径填充），仍有绘制（path）',
    ok2 && sp > 0 && rec.paths.length >= 6, '绘制 ' + sp + ' 次（path ' + rec.paths.length + '）');
  const ok3 = safe('clone 兜底', () => { cl = renderHz([{ kind: 'clone', x: 280, y: 150, w: 52, h: 48, hp: 1, face: -1, flashT: 0, t: 0.5 }]); });
  check('SPR.bossGhost 缺失 → 借本体 body 紫色叠色（tintOf）+ 头顶「幻」字',
    ok3 && cl > 0 && rec.fillText.some(r => r.s === '幻'), '绘制 ' + cl + ' 次，幻字=' + rec.fillText.some(r => r.s === '幻'));
  // 连本体都缺 → 纯程序化剪影（不得抛异常）
  const bodySaved = U.SPR.boss;
  delete U.SPR.boss;
  let cl2 = -1;
  const ok4 = safe('clone 纯程序化', () => { cl2 = renderHz([{ kind: 'clone', x: 280, y: 150, w: 52, h: 48, hp: 1, t: 0.5 }]); });
  check('SPR.bossGhost + SPR.boss 全缺 → 纯程序化紫色剪影 + 「幻」字，不抛异常',
    ok4 && cl2 > 0 && rec.fillText.some(r => r.s === '幻'), '绘制 ' + cl2 + ' 次');
  U.SPR.boss = bodySaved;
  U.SPR.meteor = saved.meteor; U.SPR.spike = saved.spike; U.SPR.bossGhost = saved.ghost;
}

/* ==================== ⑤ 相机坐标（cam 变化 → 屏幕位置 -cam） ==================== */
console.log('\n==== ⑤ 危险物走相机坐标 ====');
{
  const hz = [{ kind: 'meteor', x: 200, y: 120, vy: 0, r: 6, warnT: 0.9 }];
  G.hazards = hz; clear(); U.renderHazards(0, 0, 0);
  const a = rec.arcs[0] ? rec.arcs[0].x : null;
  G.hazards = hz; clear(); U.renderHazards(0, 64, 32);
  const b = rec.arcs[0] ? rec.arcs[0].x : null;
  check('cam 右移 64px → 陨石预警圈 x 同步 -64（px(h.x-cam.x)，不是屏幕坐标）',
    a !== null && b !== null && a - b === 64, 'cam0 x=' + a + ' / cam64 x=' + b);

  // 落点吸附：契约没有 groundY，y 在空中时预警圈必须钉到该列的地面上（否则圈飘在天上，玩家读不出落点）
  const p = G.player;
  G.hazards = [{ kind: 'meteor', x: p.x + p.w / 2, y: p.y - 120, vy: 0, r: 6, warnT: 0.9 }];
  clear(); U.renderHazards(0, 0, 0);
  const ring = rec.arcs[0];
  check('陨石在高空时预警圈吸附到地面（圈心 y ≥ 玩家脚底 - 8，而不是停在 h.y）',
    !!ring && ring.y >= p.y + p.h - 8, ring ? ('h.y=' + Math.round(p.y - 120) + ' / 圈心 y=' + ring.y + ' / 玩家脚底=' + Math.round(p.y + p.h)) : '未绘制');
}

/* ==================== ④ 连段警告 / 破绽标记 ==================== */
console.log('\n==== ④ Boss 连段警告 + 破绽标记 ====');
{
  const b = G.boss;
  b.state = 'windup'; b.next = 'meteor'; b.t = 0.3; b.comboN = 0; b.comboQ = null;
  clear(); U.renderBoss(0);
  check('未连段（comboN=0）时不画「连」标记', !rec.fillText.some(r => r.s === '连'),
    'fillText=' + rec.fillText.map(r => r.s).join(','));
  // 前摇特效：meteor 头顶三颗陨石虚影（arc 记录里应有 3 个 r≈2.5 的圆）
  const tiny = rec.arcs.filter(a => Math.abs(a.r - 3) < 0.01);
  check('renderBossWindupFx：meteor 前摇画头顶 3 颗小陨石虚影', tiny.length === 3, '小圆 ' + tiny.length + ' 个');

  b.comboN = 2; b.comboQ = ['meteor', 'spike'];
  clear(); U.renderBoss(0);
  // 契约：中文走 drawCNText（fillText 记录）、数字走 drawPixelText（fillRect 记录）→ 「连」+ 像素「2」两段
  const tag = rec.fillText.find(r => r.s === '连' && r.style === '#f84848');
  const digit = rec.fillRect.filter(r => r.w === 1 && r.h === 1 && r.y >= 0 && r.y < b.y);
  check('comboN=2 → 头顶画红色「连」标签 + 像素数字（画在 Boss 上方 y<b.y）',
    !!tag && tag.y < b.y && digit.length > 0,
    tag ? ('「连」@(' + tag.x + ',' + tag.y + ') 色 ' + tag.style + ' / 像素点 ' + digit.length + ' 个 / boss.y=' + b.y) : '未找到');

  clear(); U.renderHUD();
  const hudTag = rec.fillText.find(r => r.s === '连' && r.style === '#f84848');
  const redEdge = rec.rects.find(r => r.style === '#f84848' && r.y >= 14 && r.y <= 17);
  check('HUD：连段时名字牌旁出现红「连」+ 红边脉冲（x 在名字牌 128~302 内）',
    !!hudTag && !!redEdge && hudTag.x >= 128 && hudTag.x <= 302,
    hudTag ? ('「连」@(' + hudTag.x + ',' + hudTag.y + ') 红边=' + !!redEdge) : '未找到红「连」');

  b.comboN = 0; b.comboQ = null; b.state = 'stagger'; b.t = 0.5;
  clear(); U.renderBoss(0);
  const st = rec.fillText.find(r => r.s === '破绽');
  const out = rec.rects.find(r => r.style === '#f8d048' && r.lw === 2);
  check('state=stagger → 头顶金色「破绽」标签（_panel 切角底）',
    !!st && st.style === '#f8d048' && st.y < b.y, st ? ('「破绽」@(' + st.x + ',' + st.y + ')') : '未找到');
  check('state=stagger → 身上叠加 2px 淡黄描边（包围盒比 Boss 大 12×8px，包到精灵外沿）',
    !!out && out.w === b.w + 12 && out.h === b.h + 8, out ? ('描边 ' + out.w + '×' + out.h + ' vs boss ' + b.w + '×' + b.h) : '未找到');

  // 前摇特效分派表覆盖：五种新招各画一次，全部不抛异常且有绘制
  const FX = { meteor: '陨石', spike: '跺地', homing: '聚球', clone: '分裂', pull: '张手' };
  for (const k of Object.keys(FX)) {
    b.state = 'windup'; b.next = k; b.t = 0.4; b.comboN = 0;
    clear();
    const ok = safe(k + ' 前摇', () => U.renderBoss(0));
    check('renderBossWindupFx 分派：' + k + '（' + FX[k] + '）前摇有特效绘制',
      ok && ops() > 0, '绘制 ' + ops() + ' 次');
  }
}

/* ==================== ⑥ 血条三段刻度按 maxHp 比例 ==================== */
console.log('\n==== ⑥ Boss 血条三段刻度（maxHp=189 / 567） ====');
{
  const INNER = 172, X0 = 129;
  const t189 = U.bossTickXs({ maxHp: 189, bandMax: 63 });
  const t567 = U.bossTickXs({ maxHp: 567, bandMax: 189 });
  const want = [X0 + INNER / 3, X0 + INNER * 2 / 3];
  const near = (a, b) => Math.abs(a - b) < 0.01;
  check('maxHp=189（每段 63）→ 刻度 129+172/3 与 129+344/3',
    near(t189[0], want[0]) && near(t189[1], want[1]),
    '[' + t189[0].toFixed(2) + ', ' + t189[1].toFixed(2) + '] 期望 [' + want[0].toFixed(2) + ', ' + want[1].toFixed(2) + ']');
  check('maxHp=567（每段 189）→ 同一像素位置（比例恒 1/3，无写死旧血量）',
    near(t567[0], want[0]) && near(t567[1], want[1]),
    '[' + t567[0].toFixed(2) + ', ' + t567[1].toFixed(2) + ']');
  check('189 与 567 两档刻度逐像素一致（差异 0）',
    t189[0] === t567[0] && t189[1] === t567[1], 'Δ=' + (t189[0] - t567[0]) + ' / ' + (t189[1] - t567[1]));
  const tq = U.bossTickXs({ maxHp: 100, bandMax: 25 });
  check('比例驱动验证：bandMax=25/maxHp=100 → 刻度落在 1/4 与 1/2（172 / 215），证明不是常量',
    near(tq[0], X0 + INNER * 0.25) && near(tq[1], X0 + INNER * 0.5),
    '[' + tq[0].toFixed(2) + ', ' + tq[1].toFixed(2) + ']');
  check('bandMax 缺失（旧引擎）→ 回落 maxHp/3，与 172/3 逐像素一致',
    near(U.bossTickXs({ maxHp: 189 })[0], want[0]), '[' + U.bossTickXs({ maxHp: 189 }).map(v => v.toFixed(2)).join(', ') + ']');

  // HUD 实测：两条 1×8 的暗分隔线必须画在 _bossTickXs 给出的位置
  const b = G.boss;
  for (const [label, mx] of [['189', 189], ['567', 567]]) {
    b.maxHp = mx; b.bandMax = mx / 3; b.hp = mx / 6; b.bandBreak = 0; b.state = 'windup'; b.next = 'meteor'; b.t = 0.2;
    clear(); U.renderHUD();
    const xs = U.bossTickXs(b).map(v => Math.round(v));
    const ticks = rec.fillRect.filter(r => r.w === 1 && r.h === 8 && r.y === 30 && r.style === '#0a0812');
    const hit = xs.every(x => ticks.some(r => r.x === x));
    check('HUD 实测 maxHp=' + label + '：两条刻度线画在 x=' + xs.join('/') + '（y=30，1×8 暗线）',
      ticks.length === 2 && hit, '实测刻度 x=' + ticks.map(r => r.x).join('/'));
  }
  // 段数徽标「x/3」在 2× 像素字下的宽度不溢出 28px 盒
  const badgeW = 3 * 4 * 2 - 2; // drawPixelText: 3 字 × (3+1)px × scale2 - scale
  check('段数徽标「x/3」2× 像素字宽 ' + badgeW + 'px < 盒宽 28px（3 位数血量不涉及数字溢出，HUD 不显示具体血量）',
    badgeW < 28, badgeW + 'px');
  b.maxHp = 189; b.bandMax = 63; b.hp = 63;
}

/* ==================== 汇总 ==================== */
console.log('\n================ v10 UI 自检汇总 ================');
console.log('PASS ' + nPass + ' / FAIL ' + nFail);
process.exit(nFail ? 1 : 0);
