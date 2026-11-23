/* boss_anim.js — 14 只 Boss 的 windup 抬手/举臂姿态层（视觉叠加，不改状态机/命中框/伤害/时序）
 *
 * 接入方式（唯一接线点）：
 *   包装 window.PQAI_BOSS_DRAW（ai_sprites.js 提供的 drawBoss）。
 *   新函数先原样调用旧函数画出身体与既有 windup 表现，返回值原样透传；
 *   仅当 b.state ∈ {'windup','read'} 且 Boss 未隐身时，在身体图层之上叠加
 *   随前摇进度 u=b.t/dur 变化的「手臂抬起 / 举臂 / 蓄力微抖 / 落下出手」像素手臂层。
 *   其余状态（idle/dormant/rest/行走/受击/破绽/狂暴/死亡/各 Cast 态）完全透传旧函数，
 *   不写任何 b 字段、不做任何额外绘制（零视觉与性能副作用）。
 *
 * 几何对齐：复刻 drawBoss 本体坐标系——原点在脚底中心，局部 x∈[-48,48]、y∈[-110,0]，
 * 先平移到 (cx, feet+bob+dy*vis)，再 scale(face*vis,vis)、rotate(lean)、scale(sx,sy)，
 * 手臂全部画在该局部系内，因此跟随身体缩放 / 翻转 / 朝向 / 前倾，不会飘离身体。
 *
 * 手臂可读性（v54 强化版）：
 *   - 主干 4-6px 宽方块段，外裹 1px 深色描边；末端 6-8px 拳/掌/爪块，读成「肢体」而非光线。
 *   - 深色长袍/剪影型（8/12/14）用亮色臂 + 深描边 + 外侧 1px 受光边；
 *     亮色身躯型（5/13）用深色臂 + 浅色描边；其余亮色臂 + 深描边。
 *   - 双臂从固定肩部枢轴旋转，四阶段是同一条手臂在抬，不是亮块换位。
 *   - B 阶段抬到最高：臂端越过主体包围盒上缘；D 阶段沿前向挥落。
 *   - 臂型按招式分类收敛为 5 种：拳砸 / 爪挥 / 掌托法阵 / 侧展召唤 / 冲撞蓄拳。
 *
 * 入口约定：window.PQ_BOSS_ANIM = { ready, draw, pose, sizeOf, _orig, _install }
 */
(function () {
  'use strict';
  if (window.PQ_BOSS_ANIM && window.PQ_BOSS_ANIM.__stub !== true) return;

  var W = 96, H = 110;               // 与 ai_sprites drawBoss 的立绘尺寸一致
  var DEG = Math.PI / 180;

  // 每只 Boss 的 VFX 主色（与 ai_sprites BOSS_PAL 同口径，仅用于手臂高光/蓄力光）。
  var PAL = [null,
    { c: '#b45cff', c2: '#e6c8ff', rgb: '180,92,255' },   // 1 紫
    { c: '#38d8e0', c2: '#a8f6ff', rgb: '56,216,224' },   // 2 青
    { c: '#57d68a', c2: '#c8ffd8', rgb: '87,214,138' },   // 3 绿
    { c: '#7b8cff', c2: '#c0c8ff', rgb: '123,140,255' },  // 4 紫蓝
    { c: '#ffd36a', c2: '#fff0b8', rgb: '255,211,106' },  // 5 金
    { c: '#ff6a3c', c2: '#ffc098', rgb: '255,106,60' },   // 6 橙红
    { c: '#ff8a3c', c2: '#ffd8a8', rgb: '255,138,60' },   // 7 余烬橙
    { c: '#ffcf5a', c2: '#fff4c0', rgb: '255,207,90' },   // 8 金
    { c: '#6fe06a', c2: '#c8ffc0', rgb: '111,224,106' },  // 9 绿
    { c: '#a3202a', c2: '#ff7a6a', rgb: '163,32,42' },    // 10 暗红
    { c: '#c98a4b', c2: '#f0d0a0', rgb: '201,138,75' },   // 11 青铜
    { c: '#c9a0ff', c2: '#ffd36a', rgb: '201,160,255' },  // 12 紫金
    { c: '#a8c8ff', c2: '#ffffff', rgb: '168,200,255' },  // 13 银蓝
    { c: '#5a8cff', c2: '#a8d0ff', rgb: '90,140,255' }    // 14 幽蓝
  ];

  // 身躯明暗分类：决定臂身配色与描边（只影响视觉分离，不改判定）。
  var DARK_BODY = { 8: 1, 12: 1, 14: 1 };   // 黑袍 / 紫袍：亮臂 + 深描边 + 受光边
  var LIGHT_BODY = { 5: 1, 13: 1 };        // 白翼 / 冰晶：深臂 + 浅描边

  // v55 剪影强化型（5/8/12/13/14）：立绘剪影本身宽/亮，普通分离策略下手臂落在剪影内部。
  // 这 5 只单独：肩位外扩抬高、臂加长、B 阶段近乎竖直高举，拳/掌/爪块完全越出主体剪影上缘；
  // 按 kind 单独配色对。全部只作用于视觉叠加层，不改 hitbox / 碰撞 / 血量 / 招式时序 / 伤害 / 状态机。
  // 几何（局部系，原点脚底中心）：shX 肩横向（外扩让肩起笔落在轮廓外侧）、shY 肩纵向（抬高）、
  // L1 上臂长、L2 前臂长、th 臂粗、fist 末端块；f1B/f2B 为 B 阶段上臂/前臂角（度，0=竖直上举）。
  var SPECIAL_ARM = {
    // 5 白翼圣裁者：亮白宽翼剪影 → 深蓝黑臂 + 深描边（白翼上不化开）+ 暖金受光边
    5:  { shX: 17, shY: -74, L1: 23, L2: 20, th: 6, fist: 9, f1B: 16, f2B: 6,
          fill: '#141c33', outline: '#0c1222', rim: '#ffe9a8', shape: 'palm' },
    // 8 黑袍天秤：亮金臂 + 深描边 + 浅金受光边
    8:  { shX: 18, shY: -78, L1: 25, L2: 22, th: 6, fist: 9, f1B: 16, f2B: 5,
          fill: '#ffd75e', outline: '#1d1426', rim: '#fff4c0', shape: 'fist' },
    // 12 紫袍俄耳甫斯：亮金臂 + 深紫描边 + 紫受光边
    12: { shX: 17, shY: -79, L1: 25, L2: 22, th: 6, fist: 9, f1B: 16, f2B: 5,
          fill: '#ffe08a', outline: '#2a1636', rim: '#f0c8ff', shape: 'palm' },
    // 13 冰晶无相：深紫蓝臂 + 白描边 + 冰蓝受光边
    13: { shX: 16, shY: -79, L1: 24, L2: 22, th: 6, fist: 9, f1B: 15, f2B: 5,
          fill: '#3a2a66', outline: '#ffffff', rim: '#a8c8ff', shape: 'palm' },
    // 14 黑袍阿刻戎：亮冰蓝臂 + 深描边 + 白受光边
    14: { shX: 18, shY: -74, L1: 24, L2: 21, th: 6, fist: 9, f1B: 16, f2B: 5,
          fill: '#a8d8ff', outline: '#141a2e', rim: '#e8f6ff', shape: 'claw' }
  };

  // 招式分类（与 ai_sprites BOSS_CLS 同口径，仅用于选姿态，不改判定）。
  var CLS_HEAVY = { slam: 1, hammer: 1, hchain: 1, quake: 1, weight: 1, crush: 1, bite: 1, push: 1 };
  var CLS_CHARGE = { charge: 1, dash: 1, leap: 1, dive: 1, march: 1, swap: 1 };
  var CLS_CAST = { pillar: 1, column: 1, beam: 1, nova: 1, meteor: 1, spike: 1, homing: 1, halo: 1,
    prism: 1, rain: 1, flare: 1, sear: 1, breath: 1, spew: 1, focus: 1, stare: 1,
    fracture: 1, cinder: 1, furnace: 1, burst: 1, sweep: 1, scythe: 1, mist: 1, lash: 1,
    staccato: 1, tutti: 1, fermata: 1, bomb: 1, totem: 1, pull: 1, grab: 1, core: 1, parry: 1 };
  var CLS_SUMMON = { summon: 1, spawn: 1, hatch: 1, swarm: 1, clone: 1, mirror: 1 };
  var CLS_ROAR = { roar: 1, quell: 1, tutti: 1, fermata: 1, chime: 1, pendulum: 1 };

  function clsOf(n) {
    n = String(n || '').toLowerCase();
    if (!n) return 'generic';
    if (n === 'heavy' || n === 'charge' || n === 'cast' || n === 'summon' || n === 'roar') return n;
    if (CLS_HEAVY[n]) return 'heavy';
    if (CLS_CHARGE[n]) return 'charge';
    if (CLS_CAST[n]) return 'cast';
    if (CLS_SUMMON[n]) return 'summon';
    if (CLS_ROAR[n]) return 'roar';
    return 'generic';
  }

  function clamp01(v) { v = +v; if (!isFinite(v)) return 0; return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOut(t) { t = clamp01(t); return 1 - Math.pow(1 - t, 3); }

  // 前摇时长：优先读 BAL 参数表 T.windup[next]；缺表/缺键回退到按招式类型的经验值（与 drawBoss 同口径）。
  function windDur(b, cls) {
    var w = 0;
    try {
      if (typeof BAL !== 'undefined' && BAL) {
        var T = BAL['boss' + (b.kind || 1)] || BAL.boss;
        if (T && T.windup && T.windup[b.next] !== undefined) w = +T.windup[b.next];
      }
    } catch (e) { w = 0; }
    if (!(w > 0.05)) {
      w = cls === 'heavy' ? 0.62 : cls === 'charge' ? 0.55 : cls === 'cast' ? 0.60
        : cls === 'summon' ? 0.65 : cls === 'roar' ? 0.70 : 0.55;
    }
    return w;
  }

  // 体型档：巨型 / 中型 / 小型（按命中框宽高，仅决定手臂长度、粗细与肩位，不改碰撞）。
  function sizeOf(bw, bh) {
    if (bw >= 60 || bh >= 60) return { tag: 'giant', shX: 15, shY: -62, L1: 26, L2: 24, th: 6, fist: 8 };
    if (bw <= 44 && bh <= 44) return { tag: 'small', shX: 10, shY: -74, L1: 17, L2: 16, th: 4, fist: 6 };
    return { tag: 'medium', shX: 12, shY: -72, L1: 21, L2: 20, th: 5, fist: 7 };
  }

  /* 四阶段姿态（角度：0=竖直上举；正值=朝面向侧 local +x 摆开；负值=向后摆；单位度）。
   * A 起手抬臂 u∈[0,.22) / B 抬到最高 [.22,.50) / C 蓄力微抖 [.50,.78) / D 落下出手 [.78,1]。
   * 返回 forward / rear 双臂的 (upper, fore) 角度；rear 由调用方取镜像负角。 */
  function pose(cls, u, tk) {
    var trem = 4.0 * Math.sin(tk * 1.9);          // 蓄力微抖（角度量）
    var A = { f1: 0, f2: 10, r1: 0, r2: 10 };
    if (cls === 'heavy') {            // 拳砸：双臂过顶举起，D 段向前下砸落
      if (u < 0.22) { var k1 = u / 0.22; A.f1 = lerp(0, 30, k1); A.f2 = lerp(10, 22, k1); A.r1 = lerp(0, 24, k1); A.r2 = lerp(10, 18, k1); }
      else if (u < 0.50) { var k2 = (u - 0.22) / 0.28; A.f1 = lerp(30, 6, k2); A.f2 = lerp(22, 25, k2); A.r1 = lerp(24, 6, k2); A.r2 = lerp(18, 25, k2); }
      else if (u < 0.78) { A.f1 = 6 + trem; A.f2 = 25 + trem; A.r1 = 6 + trem; A.r2 = 25 + trem; }
      else { var k3 = (u - 0.78) / 0.22; A.f1 = lerp(6, 68, k3); A.f2 = lerp(25, 92, k3); A.r1 = lerp(6, 58, k3); A.r2 = lerp(25, 82, k3); }
    } else if (cls === 'charge') {    // 冲撞：前臂后摆蓄力，D 段前收
      if (u < 0.22) { var k1 = u / 0.22; A.f1 = lerp(0, -30, k1); A.f2 = lerp(10, 26, k1); A.r1 = lerp(0, 18, k1); A.r2 = lerp(10, 22, k1); }
      else if (u < 0.50) { var k2 = (u - 0.22) / 0.28; A.f1 = lerp(-30, -20, k2); A.f2 = lerp(26, 30, k2); A.r1 = lerp(18, 22, k2); A.r2 = lerp(22, 26, k2); }
      else if (u < 0.78) { A.f1 = -20 + trem; A.f2 = 30 + trem; A.r1 = 22 + trem; A.r2 = 26 + trem; }
      else { var k3 = (u - 0.78) / 0.22; A.f1 = lerp(-20, -12, k3); A.f2 = lerp(30, 24, k3); A.r1 = lerp(22, 12, k3); A.r2 = lerp(26, 18, k3); }
    } else if (cls === 'cast') {      // 法阵托举：双臂前抬、掌心向上聚能
      if (u < 0.22) { var k1 = u / 0.22; A.f1 = lerp(0, 36, k1); A.f2 = lerp(10, 22, k1); A.r1 = lerp(0, 32, k1); A.r2 = lerp(10, 20, k1); }
      else if (u < 0.50) { var k2 = (u - 0.22) / 0.28; A.f1 = lerp(36, 30, k2); A.f2 = lerp(22, 12, k2); A.r1 = lerp(32, 26, k2); A.r2 = lerp(20, 12, k2); }
      else if (u < 0.78) { A.f1 = 30 + trem; A.f2 = 12 + trem; A.r1 = 26 + trem; A.r2 = 12 + trem; }
      else { var k3 = (u - 0.78) / 0.22; A.f1 = lerp(30, 36, k3); A.f2 = lerp(12, 34, k3); A.r1 = lerp(26, 32, k3); A.r2 = lerp(12, 30, k3); }
    } else if (cls === 'summon') {    // 召唤：双臂上侧展，D 段下压
      if (u < 0.22) { var k1 = u / 0.22; A.f1 = lerp(0, 55, k1); A.f2 = lerp(20, -8, k1); A.r1 = lerp(0, 55, k1); A.r2 = lerp(20, -8, k1); }
      else if (u < 0.50) { var k2 = (u - 0.22) / 0.28; A.f1 = lerp(55, 32, k2); A.f2 = lerp(-8, -4, k2); A.r1 = lerp(55, 32, k2); A.r2 = lerp(-8, -4, k2); }
      else if (u < 0.78) { A.f1 = 32 + trem; A.f2 = -4 + trem; A.r1 = 32 + trem; A.r2 = -4 + trem; }
      else { var k3 = (u - 0.78) / 0.22; A.f1 = lerp(32, 66, k3); A.f2 = lerp(-4, -6, k3); A.r1 = lerp(32, 66, k3); A.r2 = lerp(-4, -6, k3); }
    } else if (cls === 'roar') {      // 爪挥：双臂上举外张举爪
      if (u < 0.22) { var k1 = u / 0.22; A.f1 = lerp(0, 28, k1); A.f2 = lerp(15, 22, k1); A.r1 = lerp(0, 28, k1); A.r2 = lerp(15, 22, k1); }
      else if (u < 0.50) { var k2 = (u - 0.22) / 0.28; A.f1 = lerp(28, 32, k2); A.f2 = lerp(22, 20, k2); A.r1 = lerp(28, 32, k2); A.r2 = lerp(22, 20, k2); }
      else if (u < 0.78) { A.f1 = 32 + trem; A.f2 = 20 + trem; A.r1 = 32 + trem; A.r2 = 20 + trem; }
      else { var k3 = (u - 0.78) / 0.22; A.f1 = lerp(32, 36, k3); A.f2 = lerp(20, 28, k3); A.r1 = lerp(32, 36, k3); A.r2 = lerp(20, 28, k3); }
    } else { // generic：单前臂抬起，后臂自然下垂
      if (u < 0.22) { var k1 = u / 0.22; A.f1 = lerp(0, 36, k1); A.f2 = lerp(10, 22, k1); }
      else if (u < 0.50) { var k2 = (u - 0.22) / 0.28; A.f1 = lerp(36, 60, k2); A.f2 = lerp(22, 40, k2); }
      else if (u < 0.78) { A.f1 = 60 + trem; A.f2 = 40 + trem; }
      else { var k3 = (u - 0.78) / 0.22; A.f1 = lerp(60, 30, k3); A.f2 = lerp(40, 66, k3); }
      A.r1 = 0; A.r2 = 10;
    }
    return A;
  }

  // v55：剪影强化型专用四阶段高举姿态（角度：0=竖直上举；正值=朝面向侧 local +x 摆开）。
  // A 起手竖直抬起 → B 举到最高（近竖直、微外扩）→ C 高位微抖 → D 前向挥落。
  function specialPose(sp, u, tk) {
    var trem = 4.0 * Math.sin(tk * 1.9);
    var f1B = sp.f1B, f2B = sp.f2B, r1B = sp.f1B * 0.8;
    var f1, f2, r1, r2;
    if (u < 0.22) {
      var k1 = u / 0.22;
      f1 = lerp(0, f1B, k1); f2 = lerp(0, f2B, k1);
      r1 = lerp(0, r1B, k1); r2 = lerp(0, f2B, k1);
    } else if (u < 0.50) {
      f1 = f1B; f2 = f2B; r1 = r1B; r2 = f2B;
    } else if (u < 0.78) {
      f1 = f1B + trem; f2 = f2B + trem; r1 = r1B + trem; r2 = f2B + trem;
    } else {
      var k3 = (u - 0.78) / 0.22;
      f1 = lerp(f1B, 36, k3); f2 = lerp(f2B, 34, k3);
      r1 = lerp(r1B, 30, k3); r2 = lerp(f2B, 28, k3);
    }
    return { f1: f1, f2: f2, r1: r1, r2: r2 };
  }

  // 方块段：沿段取整步长铺 th×th 方块（整数像素、无抗锯齿）。
  function segBlock(ctx, x0, y0, x1, y1, th, color) {
    var steps = Math.max(Math.abs(Math.round(x1 - x0)), Math.abs(Math.round(y1 - y0)), 1);
    var half = Math.floor(th / 2);
    ctx.fillStyle = color;
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      var px = Math.round(x0 + (x1 - x0) * t);
      var py = Math.round(y0 + (y1 - y0) * t);
      ctx.fillRect(px - half, py - half, th, th);
    }
  }

  // 外侧 1px 受光边：沿段法向偏移 1px 铺 1px 亮线。
  function segRim(ctx, x0, y0, x1, y1, color) {
    var dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
    var nx = -dy / len, ny = dx / len;
    segBlock(ctx, x0 + nx, y0 + ny, x1 + nx, y1 + ny, 1, color);
  }

  // 一段手臂：先铺 th+2 描边底，再铺 th 主体，最后叠受光边。
  function armSeg(ctx, x0, y0, x1, y1, th, fill, outline, rim) {
    segBlock(ctx, x0, y0, x1, y1, th + 2, outline);
    segBlock(ctx, x0, y0, x1, y1, th, fill);
    if (rim) segRim(ctx, x0, y0, x1, y1, rim);
  }

  // 肩部枢轴关节：固定肩位上的方块肩垫，让手臂从同一枢轴转出。
  function shoulderJoint(ctx, shX, shY, th, fill, outline) {
    ctx.fillStyle = outline;
    ctx.fillRect(Math.round(shX - th / 2 - 1), Math.round(shY - th / 2 - 1), th + 2, th + 2);
    ctx.fillStyle = fill;
    ctx.fillRect(Math.round(shX - th / 2), Math.round(shY - th / 2), th, th);
  }

  // 末端拳/掌/爪块。shape: fist / claw / palm / spread。
  function drawHand(ctx, hx, hy, size, shape, fill, outline, accent) {
    var s = size;
    var hx = Math.round(hx), hy = Math.round(hy);
    // 外轮廓底
    ctx.fillStyle = outline;
    ctx.fillRect(hx - Math.floor(s / 2) - 1, hy - Math.floor(s / 2) - 1, s + 2, s + 2);
    ctx.fillStyle = fill;
    ctx.fillRect(hx - Math.floor(s / 2), hy - Math.floor(s / 2), s, s);
    if (shape === 'claw') {
      // 三爪：掌块上缘伸出三根 1px 爪刺
      ctx.fillStyle = outline;
      ctx.fillRect(hx - 3, hy - s / 2 - 3, 1, 3);
      ctx.fillRect(hx, hy - s / 2 - 4, 1, 4);
      ctx.fillRect(hx + 3, hy - s / 2 - 3, 1, 3);
      ctx.fillStyle = accent;
      ctx.fillRect(hx, hy - s / 2 - 4, 1, 1);
    } else if (shape === 'palm') {
      // 宽掌：左右各补 1px，拇指侧小圆块
      ctx.fillStyle = outline;
      ctx.fillRect(hx - Math.floor(s / 2) - 2, hy - Math.floor(s / 2), 2, s);
      ctx.fillRect(hx + Math.floor(s / 2), hy - Math.floor(s / 2), 2, s);
      ctx.fillStyle = accent;
      ctx.fillRect(hx - 1, hy - 1, 2, 2);
    } else if (shape === 'spread') {
      // 侧展掌：左右各一指
      ctx.fillStyle = outline;
      ctx.fillRect(hx - Math.floor(s / 2) - 2, hy - 1, 2, 2);
      ctx.fillRect(hx + Math.floor(s / 2), hy - 1, 2, 2);
      ctx.fillStyle = accent;
      ctx.fillRect(hx - 1, hy - 1, 2, 2);
    } else {
      // 拳：拳面高光 2×2
      ctx.fillStyle = accent;
      ctx.fillRect(hx - 1, hy - Math.floor(s / 2), 2, 2);
    }
  }

  // 由上臂角/前臂角与长度算肘、手局部坐标。
  function armPoints(shX, shY, a1Deg, L1, a2Deg, L2) {
    var a1 = a1Deg * DEG, a2 = a2Deg * DEG;
    var ex = shX + Math.sin(a1) * L1, ey = shY - Math.cos(a1) * L1;
    var hx = ex + Math.sin(a2) * L2, hy = ey - Math.cos(a2) * L2;
    return { ex: ex, ey: ey, hx: hx, hy: hy };
  }

  function drawArmLayer(ctx, game, tick, b) {
    if (!b) return;
    var st = String(b.state || '');
    if (st !== 'windup' && st !== 'read') return;      // 非前摇：零叠加
    if (b.hidden === true) return;                     // 隐身闪烁态：身体近乎透明，不画飘臂

    var kind = Math.floor(Math.abs(+b.kind || 1));
    if (!isFinite(kind) || kind < 1) kind = 1;
    if (kind > 14) kind = 14;
    var nxt = String(b.next || '');
    var cls = clsOf(nxt || st);
    var face = (+b.face < 0) ? -1 : 1;

    var bw = +b.w; if (!isFinite(bw) || bw <= 0) bw = 48;
    var bh = +b.h; if (!isFinite(bh) || bh <= 0) bh = 48;
    var cx = Math.round((+b.x || 0) + bw / 2);
    var feet = Math.round((+b.y || 0) + bh + 3);

    var vis = 1;
    try {
      var vm = window.PQAI_BOSS_VIS_SCALE;
      if (vm && typeof vm === 'object') {
        var vv = +vm[kind]; if (!isFinite(vv)) vv = +vm[b.kind];
        if (isFinite(vv) && vv >= 0.2 && vv <= 4) vis = vv;
      }
    } catch (e) { vis = 1; }

    var dur = windDur(b, cls);
    var bt = +b.t; if (!isFinite(bt) || bt < 0) bt = 0;
    var u = clamp01(bt / dur);
    var tk = +tick; if (!isFinite(tk)) tk = 0;

    // 复刻 drawBoss 的 windup 本体姿态偏移（仅用于对齐手臂，不回写 b）。
    var wk = easeOut(u);
    var lean = 0, sx = 1, sy = 1, dy = 0;
    if (cls === 'heavy') { sx = 1 + 0.05 * wk; sy = 1 - 0.08 * wk; dy = 4 * wk; lean = -0.14 * wk; }
    else if (cls === 'charge') { sx = 1 + 0.10 * wk; sy = 1 - 0.14 * wk; dy = 6 * wk; lean = -0.10 * wk; }
    else if (cls === 'cast') { sx = 1 - 0.02 * wk; sy = 1 + 0.06 * wk; dy = -5 * wk; lean = -0.05 * wk; }
    else if (cls === 'summon') { sx = 1 + 0.06 * wk; sy = 1 + 0.02 * wk; dy = -2 * wk; lean = -0.12 * wk; }
    else if (cls === 'roar') { sx = 1 + 0.04 * wk; sy = 1 + 0.03 * wk; dy = -1 * wk; lean = -0.18 * wk; }
    else { sx = 1 + 0.02 * wk; sy = 1 - 0.02 * wk; dy = 2 * wk; lean = -0.06 * wk; }
    lean += 0.03 * Math.sin(tk * 1.9);
    var bob = Math.sin(tk * 0.13) * 1.2 + Math.sin(tk * 0.031) * 0.45;

    var sz = sizeOf(bw, bh);
    // 小体型 summon（kind9）/ 矮体型 cast（kind13）肩位偏高、臂长偏短，B 阶段抬臂余量薄；单独抬高肩位并加长小臂。
    if (kind === 9) { sz.shY -= 3; sz.L1 += 2; sz.L2 += 2; }
    if (kind === 13) { sz.shY -= 2; sz.L1 += 1; sz.L2 += 1; }
    var pal = PAL[kind] || PAL[1];

    // 配色分离：深身躯亮臂+受光边；亮身躯深臂+浅描边；其余亮臂+深描边。
    var outline, fill, rim, handShape;
    if (LIGHT_BODY[kind]) {
      outline = '#f0e9ff'; fill = pal.c; rim = null;
    } else if (DARK_BODY[kind]) {
      outline = '#241b2e'; fill = pal.c2; rim = pal.c;
    } else {
      outline = '#241b2e'; fill = pal.c2; rim = pal.c;
    }
    handShape = cls === 'heavy' || cls === 'charge' ? 'fist'
      : cls === 'cast' ? 'palm'
      : cls === 'summon' ? 'spread'
      : cls === 'roar' ? 'claw' : 'fist';

    var P = pose(cls, u, tk);

    // v55 剪影强化：宽/亮剪影型单独外扩抬高肩位、加长臂、近竖直高举并按 kind 分色。
    var sp = SPECIAL_ARM[kind];
    if (sp) {
      sz.shX = sp.shX; sz.shY = sp.shY; sz.L1 = sp.L1; sz.L2 = sp.L2;
      sz.th = sp.th; sz.fist = sp.fist;
      fill = sp.fill; outline = sp.outline; rim = sp.rim; handShape = sp.shape;
      P = specialPose(sp, u, tk);
    }

    ctx.save();
    ctx.translate(cx, feet + bob + dy * vis);
    ctx.scale(face * vis, vis);
    ctx.rotate(lean);
    ctx.scale(sx, sy);

    // 后（远）侧臂：镜像肩位与角度
    var rPts = armPoints(-sz.shX, sz.shY, -P.r1, sz.L1, -P.r2, sz.L2);
    shoulderJoint(ctx, -sz.shX, sz.shY, sz.th, fill, outline);
    armSeg(ctx, -sz.shX, sz.shY, rPts.ex, rPts.ey, sz.th, fill, outline, rim);
    armSeg(ctx, rPts.ex, rPts.ey, rPts.hx, rPts.hy, sz.th, fill, outline, rim);
    drawHand(ctx, rPts.hx, rPts.hy, sz.fist, handShape, fill, outline, pal.c);

    // 前（近）侧臂（local +x = 面向侧）
    var fPts = armPoints(sz.shX, sz.shY, P.f1, sz.L1, P.f2, sz.L2);
    shoulderJoint(ctx, sz.shX, sz.shY, sz.th, fill, outline);
    armSeg(ctx, sz.shX, sz.shY, fPts.ex, fPts.ey, sz.th, fill, outline, rim);
    armSeg(ctx, fPts.ex, fPts.ey, fPts.hx, fPts.hy, sz.th, fill, outline, rim);
    drawHand(ctx, fPts.hx, fPts.hy, sz.fist, handShape, fill, outline, pal.c);

    // C 阶段（蓄力微抖/发光）：前手掌心一团脉动蓄力光；B 末段起渐显，D 段随挥落淡出。
    if (u >= 0.45 && u < 0.95) {
      var gA = u < 0.50 ? (u - 0.45) / 0.05 : (u >= 0.78 ? 1 - (u - 0.78) / 0.17 : 1);
      gA *= 0.8 + 0.2 * Math.sin(tk * 0.35);
      var gx = fPts.hx, gy = fPts.hy;
      var gr = (4 + 2.5 * Math.sin(tk * 0.3)) * vis;
      var grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(3, gr));
      grad.addColorStop(0, 'rgba(' + pal.rgb + ',' + (0.55 * gA) + ')');
      grad.addColorStop(1, 'rgba(' + pal.rgb + ',0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = grad;
      ctx.fillRect(Math.round(gx - gr), Math.round(gy - gr), Math.round(gr * 2), Math.round(gr * 2));
      ctx.restore();
    }
    ctx.restore();
  }

  /* ---- 包装安装：ai_sprites 的 applyAll 每 500ms 可能重写 PQAI_BOSS_DRAW，
     这里轮询兜底，发现被换回原始 drawBoss 就重新包装；包装函数自带标记避免重复套娃。 ---- */
  var orig = null, wrapped = null, timer = null, tries = 0;

  function install() {
    if (typeof window.PQAI_BOSS_DRAW !== 'function') return;
    if (wrapped && window.PQAI_BOSS_DRAW === wrapped) return;
    orig = window.PQAI_BOSS_DRAW;
    wrapped = function (ctx, game, tick, b) {
      var res;
      try { res = orig.apply(this, arguments); } catch (e) { return false; }
      try { if (res !== false && b) drawArmLayer(ctx, game, tick, b); } catch (e) { /* 视觉层异常不得影响本体绘制 */ }
      return res;
    };
    wrapped.__pqBossAnim = true;
    window.PQAI_BOSS_DRAW = wrapped;
  }

  install();
  timer = setInterval(function () {
    install();
    if (++tries > 40) clearInterval(timer);   // 16s 后停止轮询（ai_sprites 重写窗口约 12s）
  }, 400);

  window.PQ_BOSS_ANIM = {
    __stub: false,
    ready: true,
    draw: drawArmLayer,
    pose: pose,
    sizeOf: sizeOf,
    _orig: function () { return orig; },   // 自检用：取包装前的原始 PQAI_BOSS_DRAW
    _install: install                      // 自检用：被外部换回原始函数后可重新包装
  };
})();
