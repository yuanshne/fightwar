// tools/_v77_skin.js —— v7.7 界面队自检（node 直跑；退出码 0=全过，1=有失败）
// 覆盖：①新档迁移 skin/skins 齐全且幂等（含脏值回落）②通关 L1 掉 sprout、再打不重复
// ③全关开放直打 L16 只掉 judge（skins 只 +1）④未解锁皮肤不可装备（函数与面板 Enter 两条路径）
// ⑤skin 被篡改/版本回退 → 回落 'blue' ⑥撤销验收：新档通关后 gold/meta/goldBest 均不存在
// ⑦衣橱几何（17 格不越面板）+ 渲染冒烟 + 玩家取帧确实来自当前皮肤
// 沙箱手法照抄 tools/gate.js：art+levels+章节+engine+ui 拼成一个函数体执行（经典 script 同作用域），
// 只 mock 浏览器外壳（localStorage / canvas / document / rAF），不写不删任何游戏文件。
// 注：art.js 的 HERO_SKINS/getHeroSkin 由另一队并行产出——缺失时本脚本注入「契约桩」（17 套 id/名，
//     帧为空白 canvas），从而验证 ui 侧逻辑；Run C 专门验证接口缺失时的守卫降级路径。
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
const J = v => JSON.stringify(v);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/* ==================== 1. 浏览器外壳 mock（与 _v77_meta.js 同款） ==================== */
const grad = () => ({ addColorStop() {} });
function mkCtx(cv) {
  const noop = () => {};
  return new Proxy({
    canvas: cv, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1,
    globalCompositeOperation: 'source-over', imageSmoothingEnabled: false, font: '', textAlign: '', textBaseline: '',
    createLinearGradient: grad, createRadialGradient: grad, createPattern: () => null,
    getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(4, w * h * 4)) }),
    putImageData: noop,
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(4, w * h * 4)) }),
    measureText: () => ({ width: 4 }),
  }, { get(t, k) { return (k in t) ? t[k] : noop; }, set(t, k, v) { t[k] = v; return true; } });
}
function mkCanvas(w, h) {
  const cv = { width: (w | 0) || 1, height: (h | 0) || 1, style: {} };
  cv.getContext = () => (cv._c || (cv._c = mkCtx(cv)));
  cv.addEventListener = () => {};
  cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: cv.width, height: cv.height });
  return cv;
}
function mkShell(store) {
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

/* ==================== 2. art.js 皮肤接口契约桩（仅当 art.js 未合入时注入） ==================== */
// 顺序/名称与工单逐字一致（顺序冻结：不要改）；帧为独立 16×16 空白 canvas，便于断言「取帧确实换了」。
const SKIN_STUB = `
const HERO_SKINS=[
  { id:'blue',    name:'星蓝'   },
  { id:'sprout',  name:'草绿'   },
  { id:'crystal', name:'紫晶'   },
  { id:'azure',   name:'天青'   },
  { id:'steel',   name:'铁灰'   },
  { id:'ember',   name:'赤焰'   },
  { id:'ivory',   name:'石白'   },
  { id:'starcore',name:'星核金' },
  { id:'jade',    name:'翡翠'   },
  { id:'sunset',  name:'落日渐金'},
  { id:'nebula',  name:'星紫'   },
  { id:'abyss',   name:'海青'   },
  { id:'coral',   name:'珊瑚粉' },
  { id:'tide',    name:'蛟蓝'   },
  { id:'wraith',  name:'幽绿'   },
  { id:'magma',   name:'熔橙'   },
  { id:'judge',   name:'判官黑' }
];
const _SKIN_CACHE={};
function getHeroSkin(id){
  if(_SKIN_CACHE[id])return _SKIN_CACHE[id];
  const mk=function(){const c=document.createElement('canvas');c.width=16;c.height=16;return c;};
  const s={idle1:mk(),idle2:mk(),run:[mk(),mk(),mk(),mk(),mk(),mk()],jump:mk(),fall:mk(),
    attack:mk(),dash:mk(),squash:mk(),dashWind:mk(),attackGold:mk()};
  ['idle1','idle2','jump','fall','attack','dash','squash','dashWind','attackGold']
    .forEach(function(k){s[k+'L']=mk();});
  s.runL=s.run.map(mk);
  _SKIN_CACHE[id]=s;return s;
}
`;

/* ==================== 3. 沙箱执行器 ==================== */
const EXPOSE = '\n;globalThis.__UI={' +
  'progress:progress,game:game,migrateProgress:migrateProgress,saveProgress:saveProgress,loadProgress:loadProgress,' +
  'startLevel:startLevel,step:step,render:render,renderWardrobe:renderWardrobe,' +
  'awardSkin:awardSkin,equipSkin:equipSkin,skinForLevel:skinForLevel,skinName:skinName,skinFrames:skinFrames,' +
  'SKIN_LIST:SKIN_LIST,SKIN_MAX:SKIN_MAX,skinOwned:skinOwned,heroPoseImg:heroPoseImg,' +
  'openWardrobe:openWardrobe,closeWardrobe:closeWardrobe,stepWardrobeInput:stepWardrobeInput,' +
  'toggleUnlockAll:toggleUnlockAll,levelLocked:levelLocked,canEnterLevel:canEnterLevel,' +
  'chapters:_chapters,chapterLocked:chapterLocked,ALL_LEVELS:ALL_LEVELS,' +
  'WD_PANEL:WD_PANEL,WD_CELL:WD_CELL,cellXY:_skinCellXY,VIEW:VIEW_W,' +
  'press:function(c){pressed[c]=true;},clearPressed:clearPressed,' +
  'getUi:function(){return {uiState:uiState,wardrobeOpen:wardrobeOpen,wardrobeSel:wardrobeSel,' +
  'clearSkinGain:clearSkinGain,clearShown:clearShown,menuSel:menuSel};},' +
  'setState:function(s){uiState=s;},setSel:function(i){wardrobeSel=i;}' +
  '};\n';

function runSandbox(opt) {
  opt = opt || {};
  const store = opt.store || {};
  mkShell(store);
  let artSrc = read('art.js');
  // Run C 专用：把 art.js 的皮肤接口整体改名（内存副本，不落盘）→ 模拟「另一队尚未合入」的窗口，
  // 从而验证 ui.js 的存在性守卫。改名对 art.js 内部一致（所有引用同改），art.js 自身仍可执行。
  if (opt.stripSkin) artSrc = artSrc.replace(/\bgetHeroSkin\b/g, 'getHeroSkinOff')
    .replace(/\bHERO_SKINS\b/g, 'HERO_SKINS_OFF');
  let body = 'const VIEW_W=384,VIEW_H=224,TILE=16;\n' + artSrc + '\n';
  const artHasSkin = /\bHERO_SKINS\b/.test(artSrc);
  if (opt.stubSkin && !artHasSkin) body += SKIN_STUB + '\n';
  for (const f of ['levels.js', 'chapter2.js', 'chapter3.js', 'engine.js']) {
    if (!fs.existsSync(path.join(ROOT, f))) continue;
    body += read(f) + '\n';
  }
  let uiSrc = read('ui.js');
  if (!/\}\)\(\);\s*$/.test(uiSrc)) { console.error('ui.js 尾部形态变化，无法注入导出'); process.exit(1); }
  uiSrc = uiSrc.replace(/\}\)\(\);\s*$/, EXPOSE + '})();\n');
  body += uiSrc;
  new Function(body)();
  return { U: global.__UI, store: store, artHasSkin: artHasSkin };
}
function boot(label, opt) {
  try {
    const r = runSandbox(opt);
    console.log('沙箱就绪[' + label + ']：' + r.U.ALL_LEVELS.length + ' 关 | 皮肤接口=' +
      (r.artHasSkin ? 'art.js 实装' : (opt && opt.stubSkin ? '契约桩' : '缺失(守卫路径)')) +
      ' | SKIN_MAX=' + r.U.SKIN_MAX);
    return r;
  } catch (e) {
    console.error('沙箱执行失败[' + label + ']: ' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join('\n') : e));
    process.exit(1);
  }
}
// 模拟通关：真实流程=引擎置 game.state='clear' → ui step() 结算分支（死亡/中途退出到不了这里）
function clearLevel(U, G, idx) {
  U.startLevel(idx);
  U.step(1 / 60);          // 先跑一帧 play：同步 lastState（真实流程也是先玩再通关）
  G.state = 'clear';
  U.step(1 / 60);          // 触发结算分支
  return U.getUi().clearSkinGain;
}

/* ==================== Run A：主逻辑（art.js 实装；若接口缺失则自动用契约桩） ==================== */
const A = boot('A/主逻辑', { stubSkin: true });
const U = A.U, P = U.progress, G = U.game, LVS = U.ALL_LEVELS;
console.log('初始 progress=' + J(P) + '\n');

console.log('==== ① 新档迁移：skin/skins 齐全 + 幂等 + 脏值回落 ====');
check('boot 后新档 skin=blue / skins=[blue]', P.skin === 'blue' && J(P.skins) === '["blue"]',
  'skin=' + P.skin + ' skins=' + J(P.skins));
check('unlockAll 仍为 false（全关开放开关保留）', P.unlockAll === false, String(P.unlockAll));
{
  const p = { unlocked: 1, stars: {} };
  U.migrateProgress(p); const a = J(p);
  U.migrateProgress(p); const b = J(p);
  check('migrateProgress 连跑两次结果恒等（幂等）', a === b, a === b ? a : ('第一次 ' + a + ' / 第二次 ' + b));
  check('迁移后 skin=blue / skins=[blue]', p.skin === 'blue' && J(p.skins) === '["blue"]', J({ skin: p.skin, skins: p.skins }));
  const dirty = { unlocked: 3, stars: {}, skin: 'rainbow', skins: ['sprout'] };
  U.migrateProgress(dirty);
  check('skin 不在 skins 里 → 回落 blue（且 blue 必在列）',
    dirty.skin === 'blue' && dirty.skins[0] === 'blue', J({ skin: dirty.skin, skins: dirty.skins }));
  const noBlue = { unlocked: 1, stars: {}, skin: 'sprout', skins: ['sprout'] };
  U.migrateProgress(noBlue);
  check('skins 缺 blue → 补到首位（默认色永远有）', noBlue.skins[0] === 'blue' && noBlue.skin === 'sprout', J(noBlue.skins));
  const old = { unlocked: 12, stars: { '9': 3 }, puzzles: { 1: true }, equip: { w: -1, h: -1, c: -1 },
    inv: [], shards: {}, nextId: 1, v5m: 1, gold: 999, meta: { hp: 5, atk: 5, dash: 5 }, goldBest: { 0: 9 } };
  U.migrateProgress(old);
  check('老档既有键零改动（unlocked/stars/puzzles/equip）',
    old.unlocked === 12 && old.stars['9'] === 3 && old.puzzles[1] === true && old.equip.w === -1,
    'unlocked=' + old.unlocked + ' stars=' + J(old.stars));
}

console.log('\n==== ② 掉落表：关卡 idx → 皮肤（HERO_SKINS[idx+1]） ====');
{
  const want = ['sprout', 'crystal', 'azure', 'steel', 'ember', 'ivory', 'starcore', 'jade',
    'sunset', 'nebula', 'abyss', 'coral', 'tide', 'wraith', 'magma', 'judge'];
  const got = [];
  for (let i = 0; i < 16; i++) got.push(U.skinForLevel(i));
  check('L1..L16 映射逐项一致', J(got) === J(want), got.join(','));
  check('越界不映射（idx=16 → null）', U.skinForLevel(16) === null && U.skinForLevel(-1) === null,
    String(U.skinForLevel(16)));
}

console.log('\n==== ③ 通关 L1 掉 sprout；再打 L1 不重复 ====');
{
  P.skins = ['blue']; P.skin = 'blue'; P.unlocked = 1; P.stars = {};
  const g1 = clearLevel(U, G, 0);
  check('首次通关 L1 掉 sprout（返回 id + 已入档）',
    g1 === 'sprout' && P.skins.indexOf('sprout') >= 0, 'gain=' + g1 + ' skins=' + J(P.skins));
  check('掉落已落盘（localStorage 里能看到 sprout）',
    JSON.parse(A.store['pq_progress']).skins.indexOf('sprout') >= 0, A.store['pq_progress'].slice(0, 120));
  const n1 = P.skins.length;
  const g2 = clearLevel(U, G, 0);
  check('再打 L1 不重复掉（gain=null 且 skins 长度不变）',
    g2 === null && P.skins.length === n1, 'gain=' + g2 + ' skins=' + J(P.skins));
  check('重复通关也不产生持久货币（gold/meta/goldBest 均不存在）',
    !has(P, 'gold') && !has(P, 'meta') && !has(P, 'goldBest') && !('metaBonus' in G),
    'keys=' + J(Object.keys(P)));
}

console.log('\n==== ④ 未解锁皮肤不可装备（函数 + 面板 Enter 两条路径） ====');
{
  P.skins = ['blue', 'sprout']; P.skin = 'blue';
  const ok1 = U.equipSkin('crystal');
  check('equipSkin 未解锁 → false 且 skin 不变', ok1 === false && P.skin === 'blue', '返回 ' + ok1 + ' skin=' + P.skin);
  const ok2 = U.equipSkin('sprout');
  check('equipSkin 已解锁 → true 且落盘', ok2 === true && P.skin === 'sprout'
    && JSON.parse(A.store['pq_progress']).skin === 'sprout', 'skin=' + P.skin);
  // 面板路径：光标停在未解锁格（crystal=idx2）按回车
  U.setState('title'); U.openWardrobe();
  U.setSel(2); U.press('Enter'); U.stepWardrobeInput(); U.clearPressed();
  check('面板回车选中未解锁格 → 拒绝（skin 仍 sprout）', P.skin === 'sprout', 'skin=' + P.skin);
  U.setSel(1); U.press('Enter'); U.stepWardrobeInput(); U.clearPressed();
  check('面板回车选中已解锁格 → 装备成功', P.skin === 'sprout', 'skin=' + P.skin);
  check('面板 G/Esc 关闭（hit(back) 生效）', (function () {
    U.press('Escape'); U.stepWardrobeInput(); U.clearPressed();
    return U.getUi().wardrobeOpen === false;
  })(), 'wardrobeOpen=' + U.getUi().wardrobeOpen);
}

console.log('\n==== ⑤ 衣橱几何 + 渲染冒烟 + 取帧来源 ====');
{
  const pnl = U.WD_PANEL, c = U.WD_CELL;
  let ok = true, msg = '';
  for (let i = 0; i < U.SKIN_MAX; i++) {
    const xy = U.cellXY(i);
    if (xy[0] < pnl[0] + 2 || xy[1] < pnl[1] + 2
      || xy[0] + c[0] > pnl[0] + pnl[2] - 2 || xy[1] + c[1] > pnl[1] + pnl[3] - 2) {
      ok = false; msg += '格' + i + '@' + xy.join(',') + ' 越界; ';
    }
  }
  check('17 格全在面板内且留 ≥2px 边距（不压边框）', ok, ok ? ('末格 ' + U.cellXY(16).join(',') + ' 面板 ' + pnl.join(',')) : msg);
  check('面板完整落在 384×224 内', pnl[0] >= 0 && pnl[1] >= 0 && pnl[0] + pnl[2] <= U.VIEW
    && pnl[1] + pnl[3] <= 224, pnl.join(','));
  check('6 列 × 3 行（第 17 格在第 3 行）', U.cellXY(16)[1] === U.cellXY(10)[1] + U.WD_CELL[1] + 2
    && U.cellXY(6)[1] === U.cellXY(0)[1] + U.WD_CELL[1] + 2, 'row0=' + U.cellXY(0)[1] + ' row2=' + U.cellXY(16)[1]);

  let renderOk = true, rmsg = '';
  try {
    P.skins = ['blue', 'sprout', 'crystal']; P.skin = 'sprout';
    U.setState('title'); U.render();                 // 封面（含衣橱按钮/全关开放开关）
    U.openWardrobe(); U.render(); U.renderWardrobe(0); // 衣橱（已解锁+未解锁+装备中三态同帧）
    U.closeWardrobe(); U.setState('select'); U.render();
    U.openWardrobe(); U.render(); U.closeWardrobe();
    clearLevel(U, G, 0); U.render();                 // 结算屏（含「衣橱 · 已解锁 N/17」行）
  } catch (e) { renderOk = false; rmsg = e.message; }
  check('渲染冒烟（封面/选关/衣橱三态/结算屏）无异常', renderOk, renderOk ? '6 帧通过' : rmsg);

  // 取帧来源：装备 sprout 后 heroPoseImg 必须返回该皮肤的帧（不是 SPR.heroIdle1）
  U.startLevel(0);
  const p = G.player;
  p.face = 1; p.onGround = true; p.vx = 0; p.animT = 0;
  p.landT = 0; p.dashT = 0; p.atkT = 0; p.atkWind = 0; p.castT = 0; p.djT = 0;
  const fr = U.skinFrames('sprout');
  check('待机取帧 = 当前皮肤 idle1', U.heroPoseImg(0) === fr.idle1,
    '与 SPR.heroIdle1 相同? ' + (U.heroPoseImg(0) === fr.idle1));
  p.vx = 100;
  check('跑动取帧 ∈ 当前皮肤 run[]（长度自适应）', fr.run.indexOf(U.heroPoseImg(0)) >= 0,
    '帧序号 ' + fr.run.indexOf(U.heroPoseImg(0)));
  p.vx = 0; // 回到待机（否则取帧仍走 run 分支）
  U.equipSkin('blue');
  check('换回星蓝后取帧随之改变', U.heroPoseImg(0) === U.skinFrames('blue').idle1
    && U.skinFrames('blue').idle1 !== fr.idle1, 'skin=' + P.skin);
}

console.log('\n==== ⑥ 全关开放开关行为未变 ====');
{
  P.unlocked = 1; P.unlockAll = false;
  const before = LVS.map((_, i) => U.levelLocked(i));
  const chBefore = U.chapters().map(ch => U.chapterLocked(ch));
  check('关闭态：仅 L1 可选，其余全锁', before[0] === false && before.slice(1).every(v => v === true),
    'locked=' + J(before) + ' 章锁=' + J(chBefore));
  U.toggleUnlockAll();
  check('开启后 16 关全部可选且已持久化',
    P.unlockAll === true && LVS.every((_, i) => U.canEnterLevel(i) && !U.levelLocked(i))
    && JSON.parse(A.store['pq_progress']).unlockAll === true,
    'saved.unlockAll=' + JSON.parse(A.store['pq_progress']).unlockAll);
  check('开启不改动 unlocked/stars', P.unlocked === 1, 'unlocked=' + P.unlocked);
  U.toggleUnlockAll();
  check('关闭后立刻恢复原锁（逐项一致）', J(LVS.map((_, i) => U.levelLocked(i))) === J(before), 'locked=' + J(before));
}

/* ==================== Run B：全关开放直打 L16（全新档） ==================== */
console.log('\n==== ⑦ 全关开放直打 L16：只掉 judge，skins 只 +1 ====');
{
  const B = boot('B/直跳L16', { stubSkin: true, store: {} });
  const UB = B.U, PB = UB.progress, GB = UB.game;
  PB.unlockAll = true;
  const before = PB.skins.slice();
  const gain = clearLevel(UB, GB, 15);
  check('直跳 L16 通关 → 只掉 judge', gain === 'judge' && PB.skins.length === before.length + 1,
    'gain=' + gain + ' skins=' + J(PB.skins));
  check('不补发前面 15 套（skins 逐项 = [blue,judge]）', J(PB.skins) === J(['blue', 'judge']), J(PB.skins));
  check('L16 那套已落盘', JSON.parse(B.store['pq_progress']).skins.indexOf('judge') >= 0,
    B.store['pq_progress'].slice(0, 120));
  check('直跳不产生持久货币', !has(PB, 'gold') && !has(PB, 'meta') && !has(PB, 'goldBest'),
    'keys=' + J(Object.keys(PB)));
}

/* ==================== Run C：art.js 皮肤接口缺失 → 守卫降级 ==================== */
console.log('\n==== ⑧ art.js 未合入皮肤接口：静默降级（不崩、不误掉） ====');
{
  const C = boot('C/无皮肤接口', { stripSkin: true, store: {} });
  const UC = C.U, PC = UC.progress, GC = UC.game;
  check('SKIN_MAX=1（只有星蓝）+ skin=blue', UC.SKIN_MAX === 1 && PC.skin === 'blue',
    'SKIN_MAX=' + UC.SKIN_MAX + ' skins=' + J(PC.skins));
  check('skinFrames 返回 null（走 SPR.* 兜底）', UC.skinFrames('blue') === null, String(UC.skinFrames('blue')));
  const gain = clearLevel(UC, GC, 0);
  check('通关不掉皮（skinForLevel=null）+ skins 不变', gain === null && J(PC.skins) === J(['blue']),
    'gain=' + gain + ' skins=' + J(PC.skins));
  let ok = true, msg = '';
  try {
    UC.startLevel(0); UC.step(1 / 60);
    UC.setState('title'); UC.render();
    UC.openWardrobe(); UC.render(); UC.closeWardrobe();
    UC.setState('select'); UC.render();
  } catch (e) { ok = false; msg = e.message; }
  check('无皮肤接口时渲染/进关/衣橱全部无异常', ok, ok ? '4 帧通过' : msg);
  check('无皮肤接口时取帧回落 SPR（=静态帧，不抛错）', (function () {
    try { return !!UC.heroPoseImg(0); } catch (e) { return false; }
  })(), 'heroPoseImg 可调用');
}

console.log('\n==== 汇总 ====');
console.log('PASS ' + nPass + ' / FAIL ' + nFail);
process.exit(nFail ? 1 : 0);
