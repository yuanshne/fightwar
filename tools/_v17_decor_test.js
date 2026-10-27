// node tools/_v17_decor_test.js —— v17 装饰交互独立验收
// 背景：玩家反馈「像地刺这种有建模但没交互的还有多少」——审计结论=12 种装饰类型零交互。
// 本文件按「玩家该看到的现象」断言，不是"代码跑了没报错"：
//   T1 分类表完备：12 类型 / 3 类 / 尺寸为正
//   T2 尺寸契约：表内 w/h 与 art.js buildThemeArt 的画布尺寸逐项一致（改 art 必须同步表）
//   T3 摆放隔离：harm 不进 Boss 关、不压出生点/终点/关键实体；全 19 关扫描
//   T4 确定性：同 seed 两次构造 decor 完全一致（摆放改动不许破坏既有确定性契约）
//   T5 pick：碰水晶 +1 金币 / got=true / coin 音；已捡不重复计
//   T6 harm：踩石笋扣 1 心 / 吃 1.0s 无敌帧（窗口内不连扣）
//   T7 break：攻击打碎圆石 → dead + 1 金币 + 1 连击
//   T8 纯装饰无交互：草丛碰/砍都无反应（「本来就不该有交互」的边界不破）
//   T9 respawn 口径：死亡复活不重建 Level → 已碎/已捡保持（与碎砖同口径）
//  T10 空转安全：L2 出生点站 5 秒不掉血（摆放隔离的玩家视角证明）
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* ---------- canvas 桩（照 _v77_skins_art.js 的最小面） ---------- */
function mkGrad() { return { addColorStop() {} }; }
function mkCtx(cv) {
  const noop = () => {};
  return new Proxy({
    canvas: cv, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1,
    globalCompositeOperation: 'source-over', font: '', textAlign: '', textBaseline: '',
    imageSmoothingEnabled: false, filter: 'none', shadowBlur: 0, shadowColor: '#000',
    createLinearGradient: mkGrad, createRadialGradient: mkGrad, createPattern: () => null,
    getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }),
    putImageData: noop, createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }),
    measureText: () => ({ width: 4 })
  }, { get(t, k) { if (k in t) return t[k]; return noop; }, set(t, k, v) { t[k] = v; return true; } });
}
function mkCanvas(w, h) {
  const cv = { width: w | 0 || 1, height: h | 0 || 1 };
  cv.getContext = () => (cv._c || (cv._c = mkCtx(cv)));
  return cv;
}
const doc = { createElement: t => (t === 'canvas' ? mkCanvas(1, 1) : {}), getElementById: () => null };

/* ---------- art 沙箱：拿真 THEMES / buildThemeArt（引擎构造期读 THEMES[meta.theme].decor） ---------- */
const art = new Function('document', 'window', read('art.js')
  + '\n;return {THEMES,buildThemeArt};')(doc, {});

/* ---------- 引擎沙箱：真 THEMES 进去（与浏览器加载顺序 art→levels→engine 一致） ---------- */
const glue = '\n;return {Level,game,loadLevel,updateWorld,LEVELS,aggregateLevels,BAL,'
  + '_ENG_DECOR_HIT,_engAabb,_engResolveAttack,respawn,killPlayer};';
const sb = new Function('THEMES', 'document', 'window',
  read('levels.js') + read('chapter2.js') + read('chapter3.js')
  + read('engine.js') + glue)(art.THEMES, doc, {});
const ALL = sb.aggregateLevels();

let pass = 0, fail = 0;
function ok(cond, msg, extra) {
  if (cond) { pass++; console.log('  PASS ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? '   [' + extra + ']' : '')); }
}

/* ---------- T1 分类表完备 ---------- */
console.log('T1 分类表完备');
{
  const H = sb._ENG_DECOR_HIT, keys = Object.keys(H);
  ok(keys.length === 12, '12 个交互类型', keys.length);
  const cls = new Set(keys.map(k => H[k].cls));
  ok(cls.size === 3 && cls.has('harm') && cls.has('break') && cls.has('pick'), '三类齐全 harm/break/pick');
  ok(keys.every(k => H[k].w > 0 && H[k].h > 0), '全部尺寸为正');
  // 每个交互类型都必须真的出现在某主题的 decor 表里（表里躺着没人用的类型=死代码）
  const used = new Set();
  for (const k of Object.keys(art.THEMES)) (art.THEMES[k].decor || []).forEach(t => used.add(t));
  ok(keys.every(k => used.has(k)), '12 类型全部被主题引用', keys.filter(k => !used.has(k)).join(','));
}

/* ---------- T2 尺寸契约 ---------- */
console.log('T2 尺寸与 art.js 画布一致');
{
  const H = sb._ENG_DECOR_HIT;
  // 反查：类型 → 含它的主题
  const owner = {};
  for (const k of Object.keys(art.THEMES)) (art.THEMES[k].decor || []).forEach(t => { if (!owner[t]) owner[t] = k; });
  let bad = [];
  for (const type of Object.keys(H)) {
    const img = art.buildThemeArt(owner[type]).decor[type];
    const c = Array.isArray(img) ? img[0] : img;
    if (c.width !== H[type].w || c.height !== H[type].h) bad.push(type + '(' + c.width + 'x' + c.height + '≠' + H[type].w + 'x' + H[type].h + ')');
  }
  ok(bad.length === 0, '12 类型画布尺寸逐项一致', bad.join(' '));
}

/* ---------- T3 摆放隔离（全 19 关） ---------- */
console.log('T3 摆放隔离');
{
  let bossHarm = 0, nearCritical = [];
  for (let i = 0; i < ALL.length; i++) {
    const L = new sb.Level(i), meta = ALL[i];
    for (const d of L.decor) {
      const H = sb._ENG_DECOR_HIT[d.type];
      if (!H || H.cls !== 'harm') continue;
      if (meta.boss) { bossHarm++; continue; }
      const cx = d.x + H.w / 2, cy = d.y - H.h / 2;
      const far = (x, y, r) => ((cx - x) * (cx - x) + (cy - y) * (cy - y)) >= r * r;
      // 出生/终点 ≥48px（引擎 pad 44 + 半宽余量）；关键实体 ≥24px（pad 20 + 余量）
      let okFlag = far(L.spawn.x, L.spawn.y, 48);
      if (L.goal) okFlag = okFlag && far(L.goal.x + 8, L.goal.y + 16, 48);
      for (const arr of [L.springs, L.checkpoints, L.shrines, L.cannons, L.levers, L.portals, L.chests]) {
        for (const s of arr) okFlag = okFlag && far(s.x + (s.w || 16) / 2, s.y + (s.h || 16) / 2, 24);
      }
      if (!okFlag) nearCritical.push('L' + (i + 1) + ':' + d.type);
    }
  }
  ok(bossHarm === 0, 'Boss 关 0 个危险装饰', bossHarm);
  ok(nearCritical.length === 0, '危险装饰不压出生点/终点/关键实体', nearCritical.join(' '));
}

/* ---------- T4 确定性 ---------- */
console.log('T4 摆放确定性');
{
  const a = new sb.Level(1), b = new sb.Level(1);
  ok(JSON.stringify(a.decor) === JSON.stringify(b.decor), '同 seed 两次构造 decor 逐项一致');
}

/* ---------- 助手：把玩家钉到某装饰处 ---------- */
function playerAt(L, d, dx) {
  const p = sb.game.player;
  p.x = d.x + (dx || 0); p.y = d.y - p.h; p.vx = 0; p.vy = 0; p.invT = 0;
  return p;
}
function freshLevel(idx) {
  sb.loadLevel(idx, false);
  const g = sb.game; g.state = 'play'; g.paused = false; g.puzzleActive = false;
  g.level.enemies.length = 0; g.bullets.length = 0; g.hazards.length = 0;
  if (g.boss) g.boss = null;
  return g;
}
function findDecor(L, cls, type) {
  return L.decorFx.find(d => {
    const H = sb._ENG_DECOR_HIT[d.type];
    return H.cls === cls && (!type || d.type === type);
  });
}

/* ---------- T5 pick 水晶 ---------- */
console.log('T5 pick：碰水晶收集');
{
  const g = freshLevel(1);                       // L2 洞窟：晶 5 颗
  const d = findDecor(g.level, 'pick');
  ok(!!d, 'L2 存在可捡水晶');
  const c0 = g.coins;
  const p = playerAt(g.level, d, -1);            // 站进水晶格
  for (let i = 0; i < 6; i++) sb.updateWorld(1 / 60);
  ok(d.got === true, '水晶标记已捡');
  ok(g.coins === c0 + sb.BAL.econ.coin, '金币 +' + sb.BAL.econ.coin, (g.coins - c0));
  ok(g.sfxQueue.indexOf('coin') >= 0, '入队 coin 音效');
  for (let i = 0; i < 12; i++) sb.updateWorld(1 / 60);
  ok(g.coins === c0 + sb.BAL.econ.coin, '已捡不重复计分');
}

/* ---------- T6 harm 石笋 ---------- */
console.log('T6 harm：踩石笋扣血');
{
  const g = freshLevel(1);
  const d = findDecor(g.level, 'harm', 'stalagmite');
  ok(!!d, 'L2 存在石笋（玩家口中的「地刺」）');
  const p = playerAt(g.level, d, -2);            // 踩进伤害盒（盒内缩 2px，多压一点保判定）
  const hp0 = p.hp;
  sb.updateWorld(1 / 60);
  ok(p.hp === hp0 - 1, '触碰扣 1 心', (hp0 - p.hp));
  ok(p.invT > 0.9, '进入 1.0s 受击无敌');
  const afterHurt = p.hp;
  for (let i = 0; i < 30; i++) sb.updateWorld(1 / 60);   // 0.5s < 1.0s：无敌窗口内原地不再扣
  ok(p.hp === afterHurt, '无敌帧内不连扣', (afterHurt - p.hp));
}

/* ---------- T7 break 圆石 ---------- */
console.log('T7 break：攻击打碎圆石');
{
  const g = freshLevel(0);                       // L1 草原有 boulder
  const d = findDecor(g.level, 'break', 'boulder') || (g.level.decorFx.push({
    x: g.level.spawn.x + 40, y: g.level.spawn.y + 14, type: 'boulder', f: 0
  }), g.level.decorFx[g.level.decorFx.length - 1]);
  const H = sb._ENG_DECOR_HIT[d.type];
  const p = g.game ? null : null; // noop 防呆
  const pl = sb.game.player;
  pl.x = d.x - 14; pl.y = d.y - pl.h; pl.vx = 0; pl.vy = 0; pl.invT = 0; pl.face = 1;
  pl.atkT = 0.12; pl.atkSeq++;                   // 站圆石左侧、面朝右、挥一摆
  const c0 = g.coins, cb0 = g.combo | 0;
  sb._engResolveAttack(g.level, pl);
  ok(d.dead === true, '圆石被打破（dead）');
  ok(g.coins === c0 + sb.BAL.econ.brick, '金币 +' + sb.BAL.econ.brick, (g.coins - c0));
  ok((g.combo | 0) === cb0 + 1, '连击 +1');
}

/* ---------- T8 纯装饰无交互 ---------- */
console.log('T8 纯装饰：草丛无反应');
{
  const g = freshLevel(0);
  const L = g.level;
  const pure = L.decor.find(d => !sb._ENG_DECOR_HIT[d.type]);
  ok(!!pure, 'L1 存在纯装饰（bush/flower 族）');
  const c0 = g.coins;
  const p = playerAt(L, pure, -1);
  for (let i = 0; i < 6; i++) sb.updateWorld(1 / 60);
  ok(!pure.got && !pure.dead, '碰草丛无状态变化');
  p.atkT = 0.12; p.atkSeq++; p.face = 1; p.x = pure.x - 14; p.y = pure.y - p.h;
  sb._engResolveAttack(L, p);
  ok(!pure.dead && g.coins === c0, '砍草丛不碎不掉币');
}

/* ---------- T9 respawn 口径 ---------- */
console.log('T9 respawn 保持已碎/已捡');
{
  const g = freshLevel(1);
  const d = findDecor(g.level, 'break');
  if (!d) { d = g.level.decorFx[0]; }
  d.dead = true;
  const pk = findDecor(g.level, 'pick');
  if (pk) pk.got = true;
  sb.killPlayer();
  sb.respawn();
  ok(d.dead === true && (pk ? pk.got === true : true), '复活后不回滚（与碎砖同口径）');
}

/* ---------- T10 空转安全 ---------- */
console.log('T10 L2 出生点空转 5s 不掉血');
{
  const g = freshLevel(1);
  const hp0 = g.player.hp;
  for (let i = 0; i < 300; i++) sb.updateWorld(1 / 60);
  ok(g.player.hp === hp0, '摆放隔离=出生区无伤害源', (hp0 - g.player.hp));
}

console.log('=== v17 装饰交互: ' + pass + ' PASS / ' + fail + ' FAIL ===');
process.exit(fail ? 1 : 0);
