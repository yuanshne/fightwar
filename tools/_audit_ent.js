/* tools/_audit_ent.js —— 实体层审计（只读，不改任何共享文件）
 * A) 最小 canvas 桩执行 art.js → SPR 真实键/尺寸；交叉核对 ui.js 引用的 SPR.*
 * B) gate.js engine 模式同款沙箱（levels + 章节 + aggregateLevels + engine）构造全部关卡
 * C) 逐关实体清单 + 空转 300 帧观察字段推进（saw.x / cannon.flash / pend.ang）
 * D) 定点探针：把玩家钉在实体上，验证判定真的生效（每次探针独立 loadLevel，探针内用返回的 L）
 * E) 几何可达性：伤害形状 vs「玩家站在地板上」的全部合法站姿
 * F) 宝箱 opened 生命周期（死亡 / 重载）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* ==================== A. art.js：桩执行 ==================== */
function artProbe() {
  const src = read('art.js');
  const grad = () => ({ addColorStop() {} });
  function mkCtx(cv) {
    const noop = () => {};
    return new Proxy({
      canvas: cv, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1,
      globalCompositeOperation: 'source-over', font: '', textAlign: '', textBaseline: '',
      createLinearGradient: grad, createRadialGradient: grad, createPattern: () => null,
      getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }),
      putImageData: noop,
      createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }),
      measureText: () => ({ width: 4 }),
    }, { get(t, k) { return (k in t) ? t[k] : noop; }, set(t, k, v) { t[k] = v; return true; } });
  }
  function mkCanvas(w, h) {
    const cv = { width: (w | 0) || 1, height: (h | 0) || 1 };
    cv.getContext = () => (cv._c || (cv._c = mkCtx(cv)));
    return cv;
  }
  const sd = global.document, sw = global.window;
  global.document = { createElement: t => (t === 'canvas' ? mkCanvas(1, 1) : {}), getElementById: () => null };
  global.window = global;
  try {
    const out = new Function(src + '\n;return {SPR,THEMES,buildSprites};')();
    out.buildSprites();
    return { SPR: out.SPR, THEMES: out.THEMES };
  } finally { global.document = sd; global.window = sw; }
}
const art = artProbe();
const SPR = art.SPR, THEMES = art.THEMES;
const dim = k => {
  const v = SPR[k];
  if (v === undefined) return '缺失';
  if (Array.isArray(v)) return v.map(o => o ? o.width + 'x' + o.height : 'null').join(',');
  if (v && v.width) return v.width + 'x' + v.height;
  return typeof v;
};

/* ==================== B. engine 沙箱 ==================== */
const levelsSrc = read('levels.js'), engineSrc = read('engine.js');
const chFiles = ['chapter2.js', 'chapter3.js'].filter(f => fs.existsSync(path.join(ROOT, f)));
const chapterSrc = chFiles.map(read).join('\n');
const themes = {};
['grass', 'cave', 'sky', 'factory', 'lava', 'tower', 'boss', 'wind', 'castle', 'star', 'sea', 'nether'].forEach(k => themes[k] = THEMES[k] || {});
const glue = '\n;return {PHY,Level,game,loadLevel,respawn,killPlayer,levelClear,updateWorld,ALL_LEVELS,LEVELS,BAL};';
const sb = new Function('THEMES',
  levelsSrc + (chapterSrc ? '\n' + chapterSrc : '') + '\n;aggregateLevels();\n' + engineSrc + glue)(themes);
const G = sb.game, N = sb.ALL_LEVELS.length, T = 16, BAL = sb.BAL;
const R = (v, n) => { const d = Math.pow(10, n === undefined ? 0 : n); return Math.round(v * d) / d; };

/* 独立装载一关，返回该关的 L/p（探针内唯一真身） */
function boot(i) {
  sb.loadLevel(i, false);
  G.state = 'play';
  G.player.invT = 0;
  return { L: G.level, p: G.player };
}
/* 钉住玩家跑 frames 帧：pre 每帧前（可回钉）、post 每帧后（可提前 break） */
function pin(i, x, y, frames, pre, post) {
  const { L, p } = boot(i);
  const s0 = { hp: p.hp, coins: G.coins, keys: G.keys, sw: G.switchState, state: G.state, gear: G.gearDrops.length };
  for (let f = 0; f < frames; f++) {
    if (x !== null) { p.x = x; p.y = y; p.vx = 0; p.vy = 0; p.invT = 0; p.dead = false; }
    if (pre) pre(L, p, f);
    sb.updateWorld(1 / 60);
    if (post && post(L, p, f) === false) break;
  }
  return { L, p, s0 };
}
const distRect = (cx, cy, r) => {
  const nx = Math.max(r.x, Math.min(cx, r.x + r.w)), ny = Math.max(r.y, Math.min(cy, r.y + r.h));
  return Math.hypot(cx - nx, cy - ny);
};
const tilePx = (L, x, y) => L.tileAt(Math.floor(x / T), Math.floor(y / T));

/* 地图切片：把已提取实体用字母标回（实体字符在构造时已被换成'.'） */
function dumpMap(L, cx, cy, rx, ry, marks) {
  const lines = [];
  for (let y = cy - ry; y <= cy + ry; y++) {
    let s = String(y).padStart(2, ' ') + '|';
    for (let x = cx - rx; x <= cx + rx; x++) {
      let ch = (y >= 0 && y < L.h && x >= 0 && x < L.w) ? L.tiles[y][x] : '?';
      const m = marks.find(o => o.tx === x && o.ty === y);
      if (m) ch = m.ch;
      s += ch;
    }
    lines.push(s);
  }
  return lines.join('\n');
}

/* ==================== A 段输出 ==================== */
const uiSrc = read('ui.js');
const uiSpr = new Set();
for (const m of uiSrc.matchAll(/\bSPR\.([A-Za-z_$][\w$]*)/g)) uiSpr.add(m[1]);
const missSpr = [...uiSpr].filter(k => !(k in SPR));
console.log('========== A. art.js SPR 交叉核对 ==========');
console.log('SPR 键=' + Object.keys(SPR).length + '  ui.js 引用=' + uiSpr.size + '  缺失=' + (missSpr.length ? missSpr.join(',') : '无'));
const ENT_SPR = ['saw', 'cannon', 'cannonL', 'bullet', 'springC', 'springX', 'lever', 'checkOn', 'checkOff',
  'flag', 'coin', 'gem', 'key', 'portal', 'chandBlade', 'chest', 'lantern', 'shrineOff', 'shrineOn',
  'slime', 'slimeDead', 'bat', 'knight', 'knightDead', 'knightGuard', 'mage', 'mageCast',
  'lancer', 'jelly', 'ghost', 'boomer', 'meteor', 'waveFx', 'heartFull', 'bossBullet', 'blade'];
console.log('实体 SPR 尺寸: ' + ENT_SPR.map(k => k + '=' + dim(k)).join(' '));

/* ==================== B 段：清单 ==================== */
console.log('\n========== B. 逐关实体清单 ==========');
for (let i = 0; i < N; i++) {
  const { L } = boot(i);
  console.log('L' + String(i + 1).padStart(2) + ' ' + L.meta.theme.padEnd(7) + ' ' + L.meta.name.padEnd(14)
    + ' coin' + String(L.coins.length).padStart(2) + ' enemy' + L.enemies.length + ' plat' + L.plats.length
    + ' saw' + L.saws.length + ' can' + L.cannons.length + ' spr' + L.springs.length + ' lev' + L.levers.length
    + ' chk' + L.checkpoints.length + ' shr' + L.shrines.length + ' chest' + L.chests.length
    + ' lant' + L.lanterns.length + ' portal' + L.portals.length + ' pend' + L.pends.length
    + ' goal' + (L.goal ? 'Y' : 'N') + ' boss' + (L.bossSpawn ? 'Y' : 'N'));
}

/* ==================== C 段：空转 300 帧 ==================== */
console.log('\n========== C. 空转 300 帧（字段是否推进） ==========');
for (let i = 0; i < N; i++) {
  const { L, p } = boot(i);
  const saw0 = L.saws.map(s => ({ x: s.x, y: s.y, minX: s.minX, maxX: s.maxX, minY: s.minY, maxY: s.maxY, hz: s.hz, tx: s.tx, ty: s.ty }));
  const sMin = L.saws.map(s => s.x), sMax = L.saws.map(s => s.x), syMin = L.saws.map(s => s.y), syMax = L.saws.map(s => s.y);
  const flash = L.cannons.map(() => 0);
  const aMin = L.pends.map(() => 9), aMax = L.pends.map(() => -9);
  let shots = 0, prevB = 0, bMax = 0;
  const hp0 = p.hp;
  for (let f = 0; f < 300; f++) {
    sb.updateWorld(1 / 60);
    L.saws.forEach((s, k) => { sMin[k] = Math.min(sMin[k], s.x); sMax[k] = Math.max(sMax[k], s.x); syMin[k] = Math.min(syMin[k], s.y); syMax[k] = Math.max(syMax[k], s.y); });
    L.cannons.forEach((c, k) => { if (c.flash > flash[k]) flash[k] = c.flash; });
    if (G.bullets.length > prevB) shots += G.bullets.length - prevB;
    prevB = G.bullets.length; bMax = Math.max(bMax, G.bullets.length);
    L.pends.forEach((w, k) => { if (w.ang !== undefined) { aMin[k] = Math.min(aMin[k], w.ang); aMax[k] = Math.max(aMax[k], w.ang); } });
    if (p.dead) break;
  }
  const o = [];
  if (L.saws.length) o.push('saw ' + saw0.map((s, k) => {
    const span = s.hz ? sMax[k] - sMin[k] : syMax[k] - syMin[k];
    const rail = s.hz ? s.maxX - s.minX : s.maxY - s.minY;
    return 't(' + s.tx + ',' + s.ty + ')轨' + R(rail) + 'px/行' + R(span) + 'px' + (span < 0.5 ? '[静止]' : '');
  }).join(' '));
  if (L.cannons.length) o.push('cannon flash峰[' + flash.map(v => R(v, 2)).join(',') + '] 发射' + shots + ' 同屏弹峰' + bMax);
  if (L.pends.length) o.push('pend 摆角[' + aMin.map((v, k) => R(v * 180 / Math.PI) + '~' + R(aMax[k] * 180 / Math.PI) + '°').join(',') + ']');
  if (L.portals.length) o.push('portal partner=' + L.portals.map(q => q.partner ? 'Y' : 'N').join(''));
  if (L.lanterns.length) o.push('lantern' + L.lanterns.length + ' theme.dark=' + (L.theme.dark === true) + ' meta.theme=' + L.meta.theme);
  o.push('HP ' + hp0 + '→' + p.hp + (p.dead ? '[空转死]' : ''));
  console.log('L' + String(i + 1).padStart(2) + ' ' + o.join('  '));
}

/* ==================== D 段：定点探针 ==================== */
console.log('\n========== D. 定点探针 ==========');
const bad = [];

console.log('-- saw：钉在锯心 1 帧 --');
for (let i = 0; i < N; i++) {
  const { L } = boot(i);
  L.saws.forEach((s, k) => {
    const r = pin(i, s.x - 5, s.y - 7, 1);
    const hit = r.p.dead || r.p.hp < r.s0.hp;
    console.log('  L' + (i + 1) + ' saw#' + k + ' (' + R(s.x) + ',' + R(s.y) + ') → ' + (hit ? '致死 OK' : '*** 无反应 ***'));
    if (!hit) bad.push('L' + (i + 1) + ' saw#' + k + ' 锯心不伤');
  });
}

console.log('-- cannon：站弹道 200 帧 + 炮口格检查 --');
for (let i = 0; i < N; i++) {
  const { L } = boot(i);
  L.cannons.forEach((c, k) => {
    const mx = c.x + (c.dir > 0 ? 16 : -8), my = c.y + 4;
    const mz = tilePx(L, mx + 4, my + 3);
    let ray = 0;
    while (ray < 400 && !L.solid(Math.floor((mx + c.dir * ray + 4) / T), Math.floor((my + 3) / T), 0)) ray += 4;
    const r = pin(i, c.x + c.dir * 48, c.y + 4 - 7, 200);
    const hit = r.p.dead || r.p.hp < r.s0.hp;
    console.log('  L' + (i + 1) + ' cannon#' + k + ' (' + c.x + ',' + c.y + ')dir=' + c.dir
      + ' 炮口tile=\'' + mz + '\' 前向射线=' + ray + 'px 站弹道→' + (hit ? '掉血 OK' : '*** 无反应 ***'));
    if (!hit) bad.push('L' + (i + 1) + ' cannon#' + k + ' 炮口tile=' + mz + ' 射线' + ray + 'px 打不到人');
  });
}

console.log('-- pend：跟随锤心 90 帧 --');
for (let i = 0; i < N; i++) {
  const { L } = boot(i);
  L.pends.forEach((w0, k) => {
    const r = pin(i, null, null, 90,
      (LL, p) => { const w = LL.pends[k]; if (w.bx != null) { p.x = w.bx - 5; p.y = w.by - 7; p.vx = 0; p.vy = 0; p.invT = 0; p.dead = false; } },
      (LL, p) => (p.hp < 5 || p.dead) ? false : true);
    const hit = r.p.hp < r.s0.hp || r.p.dead;
    console.log('  L' + (i + 1) + ' pend#' + k + ' 锚(' + w0.ax + ',' + w0.ay + ') 锤心y=' + R(w0.ay + 48 * Math.cos(70 * Math.PI / 180)) + '~' + (w0.ay + 48)
      + ' → ' + (hit ? '掉血 OK' : '*** 无反应 ***'));
    if (!hit) bad.push('L' + (i + 1) + ' pend#' + k + ' 跟随锤心不掉血');
  });
}

console.log('-- spring：从上方 20px 落下 --');
for (let i = 0; i < N; i++) {
  const { L } = boot(i);
  L.springs.forEach((s, k) => {
    const { L: L2, p } = boot(i);
    const s2 = L2.springs[k];
    p.x = s2.x + 1; p.y = s2.y - 20; p.vx = 0; p.vy = 0; p.onGround = false; p.invT = 0;
    let best = 0, feet = null;
    for (let f = 0; f < 60; f++) {
      sb.updateWorld(1 / 60);
      if (p.vy < best) best = p.vy;
      if (feet === null && p.vy < -100) feet = R(p.y + p.h);
    }
    const ok = best < -300;
    console.log('  L' + (i + 1) + ' spring#' + k + ' s.y=' + s2.y + ' 触发脚底=' + feet + ' vy=' + R(best) + (ok ? ' OK' : ' *** 未弹 ***'));
    if (!ok) bad.push('L' + (i + 1) + ' spring#' + k + ' 未触发');
  });
}

console.log('-- chest / portal / lever / checkpoint / shrine / goal / coin --');
for (let i = 0; i < N; i++) {
  const { L } = boot(i);
  L.chests.forEach((c, k) => {
    const r = pin(i, c.x + 3, c.y + 1, 2);
    const c2 = r.L.chests[k];
    console.log('  L' + (i + 1) + ' chest#' + k + ' (' + c.x + ',' + c.y + ') opened=' + c2.opened
      + ' coins+' + (G.coins - r.s0.coins) + ' gear+' + (G.gearDrops.length - r.s0.gear));
    if (!c2.opened) bad.push('L' + (i + 1) + ' chest#' + k + ' 接触不开');
  });
  L.portals.forEach((q, k) => { // 传送在 G5 用「逐帧最大位移」判定（此处 x 被回钉，不能看终值）
    const r = pin(i, q.x + 1, q.y + 5, 3);
    const q2 = r.L.portals[k];
    console.log('  L' + (i + 1) + ' portal#' + k + ' (' + q.x + ',' + q.y + ') partner=' + (q2.partner ? 'Y' : 'NULL'));
    if (!q2.partner) bad.push('L' + (i + 1) + ' portal#' + k + ' 无配对');
  });
  L.levers.forEach((lv, k) => {
    const r = pin(i, lv.x + 1, lv.y + 1, 2);
    console.log('  L' + (i + 1) + ' lever#' + k + ' switch ' + r.s0.sw + '→' + G.switchState + (G.switchState !== r.s0.sw ? ' OK' : ' *** 不翻 ***'));
    if (G.switchState === r.s0.sw) bad.push('L' + (i + 1) + ' lever#' + k + ' 不翻');
  });
  L.checkpoints.forEach((c, k) => {
    const r = pin(i, c.x + 3, c.y + 6, 2);
    console.log('  L' + (i + 1) + ' checkpoint#' + k + ' on=' + r.L.checkpoints[k].on);
    if (!r.L.checkpoints[k].on) bad.push('L' + (i + 1) + ' checkpoint#' + k + ' 不激活');
  });
  L.shrines.forEach((sh, k) => {
    const r = pin(i, sh.x + 3, sh.y + 6, 2);
    console.log('  L' + (i + 1) + ' shrine#' + k + ' idx=' + sh.idx + ' puzzleNear=' + G.puzzleNear);
    if (G.puzzleNear !== sh.idx) bad.push('L' + (i + 1) + ' shrine#' + k + ' 靠近无反应');
  });
  if (L.goal) {
    const r = pin(i, L.goal.x + 3, L.goal.y + 4, 2, (LL) => { LL.shrines.forEach(s => G.solvedPuzzles[s.idx] = true); });
    console.log('  L' + (i + 1) + ' goal → state=' + G.state);
    if (G.state !== 'clear') bad.push('L' + (i + 1) + ' goal 不通关');
  }
  if (L.coins.length) {
    const idxs = [...new Set([0, Math.floor(L.coins.length / 2), L.coins.length - 1])];
    for (const ci of idxs) {
      const c = L.coins[ci];
      const r = pin(i, c.x - 1, c.y - 3, 2);
      const c2 = r.L.coins[ci];
      console.log('  L' + (i + 1) + ' coin#' + ci + (c.key ? '(key)' : c.gem ? '(gem)' : '') + ' (' + c.x + ',' + c.y + ') got=' + c2.got
        + ' coins+' + (G.coins - r.s0.coins) + ' keys+' + (G.keys - r.s0.keys));
      if (!c2.got) bad.push('L' + (i + 1) + ' coin#' + ci + ' 拾不到');
    }
  }
}

/* ==================== E 段：几何可达性 ==================== */
console.log('\n========== E. 伤害形状 vs 合法站姿 ==========');
function standables(L) {
  const out = [];
  for (let ty = 1; ty < L.h; ty++) for (let tx = 0; tx < L.w; tx++) {
    if (!L.solid(tx, ty + 1, 0)) continue;
    if (L.solid(tx, ty, 0) || L.solid(tx, ty - 1, 0)) continue;
    out.push({ x: tx * T + 3, y: (ty + 1) * T - 14, w: 10, h: 14, tx, ty });
  }
  return out;
}
const susp = [];
for (let i = 0; i < N; i++) {
  const { L } = boot(i);
  if (!L.saws.length && !L.pends.length) continue;
  const st = standables(L);
  const out = [];
  L.saws.forEach((s, k) => {
    let hits = 0, best = 1e9, bp = null;
    for (let t = 0; t <= 200; t++) {
      const f = t / 200;
      const cx = s.hz ? s.minX + (s.maxX - s.minX) * f : s.x;
      const cy = s.hz ? s.y : s.minY + (s.maxY - s.minY) * f;
      for (const q of st) {
        const d = distRect(cx, cy, q);
        if (d < best) { best = d; bp = q; }
        if (d < s.r) { hits++; break; }
      }
    }
    out.push('saw#' + k + ' 站姿命中=' + hits + ' 最近=' + R(best, 1) + 'px@t(' + (bp ? bp.tx + ',' + bp.ty : '-') + ')'
      + ' 轨' + R(s.hz ? s.maxX - s.minX : s.maxY - s.minY) + 'px');
    if (!hits) susp.push({ i, k, type: 'saw', s, best, bp });
  });
  L.pends.forEach((w, k) => {
    let hits = 0, best = 1e9, bp = null;
    for (let t = 0; t <= 240; t++) {
      const ang = Math.sin(t / 240 * 6.283 + w.phase) * (70 * Math.PI / 180);
      const bx = w.ax + Math.sin(ang) * w.len, by = w.ay + Math.cos(ang) * w.len;
      for (const q of st) { const d = distRect(bx, by, q); if (d < best) { best = d; bp = q; } if (d < 7) { hits++; break; } }
    }
    out.push('pend#' + k + ' 站姿命中=' + hits + ' 最近=' + R(best, 1) + 'px@t(' + (bp ? bp.tx + ',' + bp.ty : '-') + ')');
    if (!hits) susp.push({ i, k, type: 'pend', w, best, bp });
  });
  console.log('L' + (i + 1) + ' ' + out.join(' | '));
}
console.log('\n-- 站姿命中=0 的地图切片（Z=电锯 H=摆锤 S=弹簧 @=出生） --');
for (const s of susp) {
  const { L } = boot(s.i);
  const marks = [];
  if (s.type === 'saw') marks.push({ tx: s.s.tx, ty: s.s.ty, ch: 'Z' });
  else marks.push({ tx: Math.floor(s.w.ax / T), ty: Math.floor(s.w.ay / T), ch: 'H' });
  const cx = s.type === 'saw' ? s.s.tx : Math.floor(s.w.ax / T);
  const cy = s.type === 'saw' ? s.s.ty : Math.floor(s.w.ay / T);
  console.log('L' + (s.i + 1) + ' ' + s.type + '#' + s.k + ' 最近站姿距离=' + R(s.best, 1) + 'px');
  console.log(dumpMap(L, cx, cy, 9, 5, marks));
}

/* ==================== F 段：宝箱 opened 生命周期 ==================== */
console.log('\n========== F. 宝箱 opened 生命周期 ==========');
for (let i = 0; i < N; i++) {
  const { L } = boot(i);
  if (!L.chests.length) continue;
  const c = L.chests[0];
  pin(i, c.x + 3, c.y + 1, 2);
  const opened = G.level.chests[0].opened;
  sb.killPlayer(); sb.respawn();
  const afterDeath = G.level.chests[0].opened;
  sb.loadLevel(i, false); G.state = 'play';
  const afterReload = G.level.chests[0].opened;
  const coins0 = G.coins, gear0 = G.gearDrops.length;
  const p = G.player; p.x = G.level.chests[0].x + 3; p.y = G.level.chests[0].y + 1;
  sb.updateWorld(1 / 60);
  console.log('L' + (i + 1) + ' 开箱=' + opened + ' 死亡复活后=' + afterDeath + (afterDeath ? '[保留]' : '[丢失]')
    + ' 重载后=' + afterReload + ' 重载再开 coins+' + (G.coins - coins0) + ' gear+' + (G.gearDrops.length - gear0));
}

/* ==================== G 汇总 ==================== */
console.log('\n========== G. 补充探针 ==========');
// G1 移动平台：固定行程 ±56/±48 是否扫进实心
console.log('-- plats：行程扫掠 vs 实心 --');
for (let i = 0; i < N; i++) {
  const { L } = boot(i);
  if (!L.plats.length) continue;
  L.plats.forEach((pl, k) => {
    let hitTiles = 0, sample = null;
    for (let t = 0; t <= 20; t++) {
      const f = t / 20;
      const x = pl.hz ? pl.minX + (pl.maxX - pl.minX) * f : pl.x;
      const y = pl.hz ? pl.y : pl.minY + (pl.maxY - pl.minY) * f;
      for (let ty = Math.floor(y / T); ty <= Math.floor((y + pl.h - 1) / T); ty++)
        for (let tx = Math.floor(x / T); tx <= Math.floor((x + pl.w - 1) / T); tx++)
          if (L.solid(tx, ty, 0)) { hitTiles++; if (!sample) sample = '(' + tx + ',' + ty + ')'; }
    }
    console.log('  L' + (i + 1) + ' plat#' + k + ' (' + pl.x + ',' + pl.y + ') ' + (pl.hz ? '横' : '竖')
      + ' 行程[' + (pl.hz ? pl.minX + '..' + pl.maxX : pl.minY + '..' + pl.maxY) + ']'
      + ' 扫掠压到实心格=' + hitTiles + (hitTiles ? ' 例' + sample + ' → 载人时会 killPlayer' : ''));
  });
}
// G2 敌人接触伤害
console.log('-- enemies：钉在敌体上 2 帧 --');
for (let i = 0; i < N; i++) {
  const { L } = boot(i);
  if (!L.enemies.length) continue;
  const seen = {};
  L.enemies.forEach((e, k) => {
    if (seen[e.type]) return; seen[e.type] = 1;
    const r = pin(i, e.x + 1, e.y + 1, 3);
    const hit = r.p.dead || r.p.hp < r.s0.hp;
    console.log('  L' + (i + 1) + ' ' + e.type + (e.elite ? '(elite)' : '') + ' 框' + e.w + 'x' + e.h
      + ' → ' + (hit ? '接触掉血 OK' : '*** 无接触伤害 ***'));
    if (!hit) bad.push('L' + (i + 1) + ' ' + e.type + ' 接触不掉血');
  });
}
// G3 Boss 锚点 / 出生点
console.log('-- bossSpawn / spawn --');
for (let i = 0; i < N; i++) {
  const { L, p } = boot(i);
  const inSolid = L.solid(Math.floor((p.x + 5) / T), Math.floor((p.y + 7) / T), 0);
  const bs = L.bossSpawn;
  const bossInfo = bs ? ('锚(' + bs.x + ',' + bs.y + ') boss=' + (G.boss ? G.boss.kind + '/' + G.boss.w + 'x' + G.boss.h + '/' + G.boss.state : 'null')) : '-';
  console.log('  L' + (i + 1) + ' spawn(' + L.spawn.x + ',' + L.spawn.y + ') 体内实心=' + inSolid + '  ' + bossInfo);
  if (inSolid) bad.push('L' + (i + 1) + ' 出生点嵌在实心里');
}
// G4 拉杆的可见效果：本关 a/b 可切换砖数量
console.log('-- lever 可见效果（a/b 切换砖） --');
for (let i = 0; i < N; i++) {
  const { L } = boot(i);
  if (!L.levers.length) continue;
  let a = 0, b = 0;
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) { if (L.tiles[y][x] === 'a') a++; else if (L.tiles[y][x] === 'b') b++; }
  console.log('  L' + (i + 1) + ' lever=' + L.levers.length + ' a砖=' + a + ' b砖=' + b + (a + b ? '' : ' *** 拉杆无可见效果 ***'));
  if (!a && !b) bad.push('L' + (i + 1) + ' 拉杆无 a/b 砖可切');
}
// G5 传送门配对距离 + 真实传送检测
console.log('-- portal 配对距离 / 真传送 --');
for (let i = 0; i < N; i++) {
  const { L } = boot(i);
  if (!L.portals.length) continue;
  L.portals.forEach((q, k) => {
    const q0 = { x: q.x, y: q.y };
    let jump = 0;
    const r = pin(i, null, null, 6, (LL, p, f) => { if (f === 0) { p.x = q0.x + 1; p.y = q0.y + 5; p.vx = 0; p.vy = 0; p.invT = 0; } },
      (LL, p) => { jump = Math.max(jump, Math.abs(p.x - (q0.x + 1))); return true; });
    const q2 = r.L.portals[k];
    const d = q2.partner ? Math.round(Math.hypot(q2.partner.x - q2.x, q2.partner.y - q2.y)) : -1;
    console.log('  L' + (i + 1) + ' portal#' + k + ' (' + q0.x + ',' + q0.y + ') 配对数=' + (q2.partner ? 'Y' : 'NULL')
      + ' 对端(' + (q2.partner ? q2.partner.x + ',' + q2.partner.y : '-') + ') 距离=' + d + 'px 实测位移=' + R(jump) + 'px'
      + (jump > 8 ? ' OK' : ' *** 未传送 ***'));
    if (!q2.partner) bad.push('L' + (i + 1) + ' portal#' + k + ' 无配对');
    else if (jump <= 8) bad.push('L' + (i + 1) + ' portal#' + k + ' 未传送');
  });
}
// G6 弹簧触发带扫描（脚底相对 s.y 的偏移）
console.log('-- spring 触发带扫描（脚底偏移 -14..+14） --');
for (let i = 0; i < N; i++) {
  const { L } = boot(i);
  if (!L.springs.length) continue;
  const s = L.springs[0];
  const band = [];
  for (let off = -14; off <= 14; off += 1) {
    const { L: L2, p } = boot(i);
    const s2 = L2.springs[0];
    p.x = s2.x + 1; p.y = s2.y + off - p.h; p.vx = 0; p.vy = 0; p.onGround = false; p.invT = 0;
    let hit = false;
    for (let f = 0; f < 3; f++) { sb.updateWorld(1 / 60); if (p.vy < -300) { hit = true; break; } }
    if (hit) band.push(off);
  }
  console.log('  L' + (i + 1) + ' spring#' + s.idx + ' 视觉顶=s.y-2 触发脚底偏移=' + (band.length ? band[0] + '..' + band[band.length - 1] : '无')
    + '（共' + band.length + 'px 带宽）');
}
// G7 电锯精确边界（是否越出 [minX,maxX]）
console.log('-- saw 轨道边界（越界量） --');
for (let i = 0; i < N; i++) {
  const { L } = boot(i);
  if (!L.saws.length) continue;
  L.saws.forEach((s, k) => {
    const lo = s.hz ? s.minX : s.minY, hi = s.hz ? s.maxX : s.maxY;
    let mn = 1e9, mx = -1e9;
    for (let f = 0; f < 400; f++) {
      sb.updateWorld(1 / 60);
      const v = s.hz ? s.x : s.y;
      mn = Math.min(mn, v); mx = Math.max(mx, v);
    }
    console.log('  L' + (i + 1) + ' saw#' + k + (s.hz ? '横' : '竖') + ' 轨[' + lo + '..' + hi + '] 实测[' + R(mn, 2) + '..' + R(mx, 2) + ']'
      + (mn < lo - 0.01 || mx > hi + 0.01 ? ' *** 越界 ***' : ' 界内'));
  });
}
// G8 L4 cannon#1 地图切片
{
  const { L } = boot(3);
  const c = L.cannons[1];
  console.log('-- L4 cannon#1 (' + c.x + ',' + c.y + ') dir=' + c.dir + ' 地图切片（C=炮台） --');
  console.log(dumpMap(L, Math.floor(c.x / T), Math.floor(c.y / T), 8, 4, [{ tx: Math.floor(c.x / T), ty: Math.floor(c.y / T), ch: 'C' }]));
}

/* ==================== I. 可触及性：玩家箱能否放到实体上（不嵌实心） ==================== */
console.log('\n========== I. 可触及性（10x14 玩家箱 vs 实体，2px 采样） ==========');
function playerInSolid(L, x, y) {
  const x0 = Math.floor(x / T), x1 = Math.floor((x + 10 - 0.01) / T);
  const y0 = Math.floor(y / T), y1 = Math.floor((y + 14 - 0.01) / T);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (L.solid(tx, ty, 0)) return true;
  return false;
}
const touch = [];
for (let i = 0; i < N; i++) {
  const { L } = boot(i);
  const list = [];
  L.chests.forEach((c, k) => list.push(['chest#' + k, c]));
  L.levers.forEach((c, k) => list.push(['lever#' + k, c]));
  L.shrines.forEach((c, k) => list.push(['shrine#' + k, c]));
  L.checkpoints.forEach((c, k) => list.push(['chk#' + k, c]));
  L.portals.forEach((c, k) => list.push(['portal#' + k, c]));
  L.springs.forEach((c, k) => list.push(['spring#' + k, c]));
  L.coins.forEach((c, k) => list.push(['coin#' + k, c]));
  L.goal && list.push(['goal', L.goal]);
  const bads = [];
  for (const [name, e] of list) {
    let ok = false;
    for (let dx = -24; dx <= 24 && !ok; dx += 2) for (let dy = -24; dy <= 24 && !ok; dy += 2) {
      const px2 = e.x + e.w / 2 - 5 + dx, py2 = e.y + e.h / 2 - 7 + dy;
      if (px2 + 10 <= e.x || px2 >= e.x + e.w || py2 + 14 <= e.y || py2 >= e.y + e.h) continue;
      if (!playerInSolid(L, px2, py2)) ok = true;
    }
    if (!ok) bads.push(name + '(' + e.x + ',' + e.y + ')');
  }
  // 钥匙/门
  let key = 0; L.coins.forEach(c => { if (c.key) key++; });
  let door = 0; for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) if (L.tiles[y][x] === 'D') door++;
  console.log('L' + (i + 1) + ' 实体' + list.length + ' 个，被实心包死=' + (bads.length ? bads.join(',') : '无')
    + '  钥匙=' + key + ' 门格=' + door + (door && !key ? ' *** 有门无钥匙 ***' : ''));
  if (bads.length) bads.forEach(s => bad.push('L' + (i + 1) + ' ' + s + ' 被实心包死摸不到'));
  if (door && !key) bad.push('L' + (i + 1) + ' 有门格无钥匙');
}

/* ==================== J. 敌人/Boss 是否嵌在实心里（隐形伤害源） ==================== */
console.log('\n========== J. 敌人嵌墙 / 技能判定半径实测 ==========');
const solidTilesOf = (L, e) => {
  const out = [];
  for (let ty = Math.floor(e.y / T); ty <= Math.floor((e.y + e.h - 0.01) / T); ty++)
    for (let tx = Math.floor(e.x / T); tx <= Math.floor((e.x + e.w - 0.01) / T); tx++)
      if (L.solid(tx, ty, 0)) out.push(tx + ',' + ty);
  return out;
};
for (let i = 0; i < N; i++) {
  const { L } = boot(i);
  const cnt = L.enemies.map(() => 0);
  for (let f = 0; f < 300; f++) {
    sb.updateWorld(1 / 60);
    L.enemies.forEach((e, k) => { if (e.dead <= 0 && solidTilesOf(L, e).length) cnt[k]++; });
  }
  const hits = [];
  L.enemies.forEach((e, k) => { if (cnt[k] >= 5 && e.type !== 'ghost') hits.push(e.type + '#' + k + '(' + R(e.x) + ',' + R(e.y) + ') ' + cnt[k] + '/300帧在实心内'); });
  if (hits.length) { console.log('L' + (i + 1) + ' *** ' + hits.join(' | ')); bad.push('L' + (i + 1) + ' ' + hits.join('|')); }
  else console.log('L' + (i + 1) + ' 敌人 ' + L.enemies.length + ' 只，300 帧内无嵌墙');
}
// 爆炸/电环：实测伤害半径 vs 视觉
console.log('-- boomer 自爆半径实测（BAL r=30，视觉 10x10 精灵+粒子） --');
for (let i = 0; i < N; i++) {
  const { L } = boot(i);
  const e = L.enemies.find(x => x.type === 'boomer');
  if (!e) continue;
  const maxD = (() => {
    let best = -1;
    for (let d = 4; d <= 60; d += 2) {
      const { L: L2 } = boot(i);
      const e2 = L2.enemies.find(x => x.type === 'boomer');
      e2.ai.st = 'wind'; e2.ai.t = BAL.enemy.boomer.skill.wind - 0.001;
      const p = G.player; p.x = e2.x + e2.w / 2 - 5 + d; p.y = e2.y + e2.h / 2 - 7; p.invT = 0;
      sb.updateWorld(1 / 60);
      if (p.hp < p.maxHp || p.dead) best = d;
    }
    return best;
  })();
  console.log('  L' + (i + 1) + ' boomer@(' + R(e.x) + ',' + R(e.y) + ') 中心距 ≤' + maxD + 'px 掉血（精灵半宽 5px）');
}
console.log('-- jelly 电环半径实测（BAL ring=18，ui 电弧画到 r=18） --');
for (let i = 0; i < N; i++) {
  const { L } = boot(i);
  const e = L.enemies.find(x => x.type === 'jelly');
  if (!e) continue;
  let best = -1;
  for (let d = 4; d <= 40; d += 2) {
    const { L: L2 } = boot(i);
    const e2 = L2.enemies.find(x => x.type === 'jelly');
    e2.ai.st = 'shock'; e2.ai.t = 0.01;
    const p = G.player; p.x = e2.x + e2.w / 2 - 5 + d; p.y = e2.y + e2.h / 2 - 7; p.invT = 0;
    sb.updateWorld(1 / 60);
    if (p.hp < p.maxHp || p.dead) best = d;
  }
  console.log('  L' + (i + 1) + ' jelly@(' + R(e.x) + ',' + R(e.y) + ') 中心距 ≤' + best + 'px 掉血');
}

console.log('\n========== H. 汇总 ==========');
console.log('可疑 ' + bad.length + ' 条：');
bad.forEach(s => console.log('  ! ' + s));
