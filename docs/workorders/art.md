# 工单 · 美术队：星核巨兽 + 技能特效素材（art.js）

> 所有权：**只许改 `pixel-quest/art.js`**。设计基准：`docs/specs/2026-10-24-v3-boss-design.md`。
> **预算（已实测）**：art.js 当前 79,589 字节，v2.5 规格 80KB 上限已到顶。v3 增量预算 **≤20KB**，
> 总量上限提升为 **100KB**（本工单即为授权依据；正文写进文件头注释）。因此：Boss 身体/手臂用
> **行跨/坐标清单的程序化画法**（下文字面网格全部经过行长校验，可直接 `_makeSprite`）。
> 约束：普通 script、顶层零 DOM、禁外部素材；`buildSprites()` 保持幂等；**不新增契约导出符号**
> （SPR 内加键不算新导出）；`node tools/gate.js art` 必须保持绿色（只编译+核对既有 7 个导出名）。
> 硬约束：Boss 精灵 **≥64×64 视觉**、多部件（身体+双眼+双臂+下颚+核心可分离）、
> ≥5 组姿态由「部件偏移/换帧」实现（偏移表归 ui 工单使用，本单只产出素材与帧清单）。

## 任务清单

1. `THEMES.boss` 主题（§A）。
2. `buildThemeArt('boss')`：通用瓦片自动继承 boss 配色；背景新增 boss 母题（§B）。
3. `SPR.boss` 部件字典 + 帧清单（§C：调色板 / 字面网格 / 身体与手臂程序化画法 / 换装与白闪变体）。
4. 技能与战斗特效素材（§D）。
5. `heroAttackGold(+L)` 施法姿态（§E）。
6. 自测（§F）。

---

## A. THEMES.boss（追加到 art.js:780-823 的 THEMES 字面量）

```js
boss: { name: '星核', skyT: '#0a0a1e', skyB: '#1e1440',
  far: '#161030', near: '#241a4a',
  block: '#3a2c5e', blockD: '#281e42', blockL: '#4c3a74', blockS: '#1a1230', speck: '#241a3a',
  cap: '#8858e8', capD: '#6038b0', capL: '#a878f8', capS: '#402468',
  plank: '#6a5a8a', plankD: '#4a3e64', plankL: '#8474a4', accent: '#f8d048',
  decor: ['crystal', 'torch', 'skull', 'crystal'],     // 全部复用既有类型，不新增 decor 素材
  dust: '#a890f8', dark: true, band: '#f8d048' },
```

## B. 背景（makeBG 新增 boss 分支）

- far（512×224）：深空渐变（skyT→skyB 4 阶）+ `_mulberry32(77)` 星点（约 40 颗，1~2px，白/金/青三色）
  + 右上大行星圆弧（r=90 圆心 (430,-40)，`#2a2050` 面 + `#8858e8` 1px 边光）+ 左侧漂浮碎石剪影（3 块多边形）。
- mid（中景层，v2.5 已有合成层机制）：环形能量带——两条水平 `band` 色 2px 线（y=60/150）+ 沿线均匀 12 个 1px 亮点。
- near：祭坛石柱剪影（5 根矩形+顶冠，`#241a4a`，高度 40~90 交错）。

## C. 星核巨兽 SPR.boss（核心交付）

### C1. 调色板（字面量，随网格一并入文件）

```js
const _P_BOSS = {          // 常态
  k:'#181232',  // 描边（深渊紫，非纯黑）
  S:'#3a2c62',  // 壳基色
  L:'#54407e',  // 壳受光（左上）
  D:'#241a42',  // 壳阴影（右下）
  C:'#f8d048',  // 星核金
  c:'#a87f18',  // 星核暗金
  W:'#fff8c8',  // 核心高光 / 骨爪
  e:'#38e8f8',  // 眼白（星辉青）
  E:'#f84848',  // 狂暴红
  b:'#c8b8e8',  // 腹甲亮（身体程序化用）
  m:'#28204a',  // 口腔暗
  t:'#f8a030'   // 裂纹橙光
};
const _P_BOSS_RAGE = {     // 狂暴换装：同键换色，网格零改动
  k:'#200a18', S:'#5a2038', L:'#7a3048', D:'#3a1424',
  C:'#f86030', c:'#a82810', W:'#ffd8c8', e:'#f84848', E:'#f8a030',
  b:'#d8a8b0', m:'#380c18', t:'#f8d048'
};
```
眼/瞳/晕单独小调色板：`_P_EYE={k:'#181232',e:'#38e8f8',w:'#e8fcff'}`、
`_P_EYE_RAGE={k:'#200a18',E:'#f84848',w:'#ffd8c8'}`、`_P_PUPIL={k:'#181232',p:'#0c1430'}`。

### C2. 字面网格（已逐行校验长度与字符集，直接 `_makeSprite(rows, pal)`）

```
/* 眼 12×10 */                    /* 狂暴眼 12×10（_P_EYE_RAGE） */
const _BOSS_EYE=[                 const _BOSS_EYE_RAGE=[
'...kkkkkk...',                   '...kkkkkk...',
'..keeeeeek..',                   '..kEEEEEEk..',
'.keeeeeeeek.',                   '.kEEEEEEEEk.',
'.keewweeeek.',                   '.kEEwwEEEEk.',
'keeeeeeeeeek',                   'kEEEEEEEEEEk',
'keeeeeeeeeek',                   'kEEEEEEEEEEk',
'.keeeeeeeek.',                   '.kEEEEEEEEk.',
'.keeeeeeeek.',                   '.kEEEEEEEEk.',
'..keeeeeek..',                   '..kEEEEEEk..',
'...kkkkkk...'];                  '...kkkkkk...'];

/* 晕眩眼 12×10（X 眼，stagger/dying 用） */
const _BOSS_EYE_DIZZY=[
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

/* 瞳孔 4×4（ui 按 Boss→玩家方向做 ±2px 偏移绘制） */
const _BOSS_PUPIL=['.kk.','kppk','kppk','.kk.'];

/* 下颚·闭合 20×8 */
const _BOSS_JAW_C=[
'....kkkkkkkkkkkk....',
'...kSSSSSSSSSSSSk...',
'..kSLLSLLSLLSLLSSk..',
'..kSSSSSSSSSSSSSSk..',
'..kmmmmmmmmmmmmmmk..',
'...kSSSSSSSSSSSSk...',
'....kDDDDDDDDDDk....',
'.....kkkkkkkkkk.....'];

/* 下颚·张开 20×8（獠牙 W ×6） */
const _BOSS_JAW_O=[
'....kkkkkkkkkkkk....',
'...kSSSSSSSSSSSSk...',
'..kSWWmmmmmmmmWWSk..',
'..kmmmmmmmmmmmmmmk..',
'..kmWmWmWmWmWmWmmk..',
'..kmmmmmmmmmmmmmmk..',
'...kDDDDDDDDDDDDk...',
'.....kkkkkkkkkk.....'];

/* 星核 12×12 帧1（亮） */       /* 帧2 = 同网格 + _P_CORE2={k:'#181232',C:'#c89010',c:'#a87f18',W:'#f8d048'}（降一档） */
const _BOSS_CORE1=[
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
```

### C3. 身体 64×48（程序化行跨画法 `buildBossBody(pal)`，返回 canvas）

```
① 上壳椭圆：中心 (32,16) rx=30 ry=14；y∈2..30 每行
   hw = round(30*sqrt(1-((y-16)/14)^2))，填 S 于 x∈[32-hw, 31+hw]
② 下腹：y∈28..35 填 b 于 x∈[8,55]；y∈36..43 填 b 于 x∈[12,51]；
   每 4 行（y=32,36,40）画 D 肋线 1px 横贯腹甲
③ 腿桩：y∈44..47 填 S 于 x∈[16,25] 与 x∈[38,47]，y=47 一行 D
④ 背脊刺：x∈{14,26,32,38,50} 各画底宽 3、高 3 的三角（顶端 1px、下一行 3px、再一行并入壳缘），
   颜色 L（受光）；刺位于壳顶缘（y≈2..4）
⑤ 裂纹（t）：像素 (20,7)(21,8)(22,8)(23,9)(41,6)(42,7)(43,8)(32,4)(32,5)
   —— rage 版追加 (18,10)(19,11)
⑥ 核心插座：x∈[26,37] y∈[22,31] 填 m（供 SPR.boss.core 覆盖在 (26,20)）
⑦ 眼窝底：x∈[14,25]∪[39,50] y∈[12,21] 填 D（供 eye 覆盖在 (14,12)/(38,12)）
⑧ 明暗：受光带 L = y∈[顶缘, 顶缘+3] 且 x<32；阴影带 D = 椭圆右下缘 2px（x>32 且 y>16 的边缘）；
   两带边界各做 1 行/列 _dithRow/_dithCol 棋盘过渡（既有函数）
⑨ 描边：对①②③④的每个填充像素，4 邻为空者改 k
⑩ 帧2（呼吸）：新画布 drawImage(body1, 0, 1, 64, 47)（整体下压 1px = 呼吸压缩）
```

### C4. 手臂 20×16（程序化行跨画法 `buildBossArm(pal)`）

```
行跨表（xL..xR，0=空行；主体 S；y1..y2 的 xL..xL+3 画 L 高光；y8..y11 的 xR-3..xR 画 D）：
y0 : 6..13    y1 : 5..14    y2 : 5..14    y3 : 5..14
y4 : 6..13    y5 : 7..12    y6 : 7..12    y7 : 7..12
y8 : 7..12    y9 : 6..13   y10 : 5..15   y11 : 5..15
y12: 5..15   y13: 6..14    y14: 7..13    y15: 空行
拳部（y9..y13 即宽段）底部 y13 画 D 1px；爪尖 W：y14..15 在 x∈{7,10,13} 各画 2px 竖条
描边同 C3⑨。
```

### C5. SPR.boss 装配与帧清单（buildSprites 末尾追加）

```js
SPR.boss = {
  body:  [buildBossBody(_P_BOSS), /* 帧2 呼吸 */],
  bodyRage: [buildBossBody(_P_BOSS_RAGE) ×2 同法],
  arm:   buildBossArm(_P_BOSS),  armRage: buildBossArm(_P_BOSS_RAGE),
  jaw:   [_makeSprite(_BOSS_JAW_C,_P_BOSS), _makeSprite(_BOSS_JAW_O,_P_BOSS)],
  jawRage:[同网格 ×_P_BOSS_RAGE],
  eye: _makeSprite(_BOSS_EYE,_P_EYE),   eyeRage: _makeSprite(_BOSS_EYE_RAGE,_P_EYE_RAGE),
  eyeDizzy: _makeSprite(_BOSS_EYE_DIZZY,_P_EYE_RAGE),
  pupil: _makeSprite(_BOSS_PUPIL,_P_PUPIL),
  core: [_makeSprite(_BOSS_CORE1,_P_BOSS), _makeSprite(_BOSS_CORE1,_P_CORE2)]
};
/* 白闪变体（受击 0.12s 覆盖绘制）：对 body/arm/jawO 三张做「白剪影」——
   drawImage 到新画布后 g.globalCompositeOperation='source-atop'; g.fillStyle='#ffffff';
   g.globalAlpha=0.85; g.fillRect。产出 SPR.bossWhite = {body, arm, jaw}。 */
```

| 素材键 | 尺寸 | 帧 | 用途（ui 工单引用） |
|---|---|---|---|
| boss.body / bodyRage | 64×48 | 2（呼吸） | 本体，按 boss.phase 选组 |
| boss.arm / armRage | 20×16 | 1（+翻转=右臂） | 双臂，状态偏移表驱动 |
| boss.jaw / jawRage | 20×8 | 2（闭/开） | 口部，前摇/吼叫/攻击张开 |
| boss.eye / eyeRage / eyeDizzy | 12×10 | 1+1+1 | 眼窝；pupil 追踪玩家 |
| boss.pupil | 4×4 | 1 | 瞳孔 ±2px 追踪 |
| boss.core | 12×12 | 2 | 胸口核心 6 帧/秒闪烁，狂暴加倍 |
| bossWhite | body/arm/jaw | — | 受击白闪覆盖 |

## D. 技能与战斗特效（SPR 新键）

| 键 | 尺寸×帧 | 网格/画法 | 用途 |
|---|---|---|---|
| `meteor[2]` | 10×12×2 | 帧1 网格（下）；帧2=帧1 画布上移 1px + 顶点 (4,0) 画 w 1px | U 星陨流星+尾焰(t) |
| `waveFx[2]` | 16×12×2 | 帧1 网格（下）；帧2=同网格换调色板 w↔C | Boss 落地冲击波（左行用 flipSprite） |
| `bossBullet[2]` | 8×7×2 | 帧1 网格（下）；帧2=flipSprite(帧1)（自旋感） | Boss 弹幕星弹（ui 按 bullet.star 选图） |
| `heartFull` / `heartEmpty` | 8×8 | 网格（下）；Empty=同网格换 `_P_HEART_E={k:'#3a1020',r:'#3a2a3a',R:'#2a2028',w:'#4a3a4a'}` | HP/掉落心 |
| `skU` / `skI` / `skO` | 12×12 | 网格（下） | 技能栏图标（星陨/护盾/连斩） |

```
/* 流星帧1（_P_METEOR={k:'#181232',y:'#f8d048',o:'#f8a020',w:'#fff8c8',t:'#f88030'}） */
'....kk....'   '/* 冲击波帧1（_P_WAVE={k:'#181232',c:'#48d8e8',C:'#1898a8',w:'#e8fcff'}） */'
'...kyyk...'   '................'
'..kywwyk..'   '................'
'.kyywwyyk.'   '..........kk....'
'kyyyyyyook'   '.........kcwk...'
'.kyoyyok..'   '....kk...kccck..'
'..kyyk.t..'   '...kcck..kccCk..'
'...kk..tt.'   '..kcccckkcCCCk..'
'......tt..'   '.kccCCCCCCCCk...'
'.....tt...'   '.kcCCwCCCCCCk...'
'....tt....'   '..kkkkkkkkkkk...'
'...tt.....'   '................'
                '................'

/* 星弹帧1（_P_BSTAR={k:'#181232',y:'#f8d048',o:'#f8a020',w:'#fff8c8'}） */
'...kk...'   /* 心（_P_HEART={k:'#3a1020',r:'#f85888',R:'#c82858',w:'#ffd8e8'}） */
'..kwyk..'   '.kk..kk.'
'.kwyyyk.'   'krrkkrrk'
'kyyyyyok'   'krwrrrrk'
'.kyoyok.'   'krrrrrrk'
'..kook..'   '.krrrrk.'
'...kk...'   '..krrk..'
              '...kk...'

/* skU 星陨（_P_SKU={k:'#7a4a10',y:'#f8d020',o:'#f8a020',w:'#fff8c8'}） */
'.....kk.....'   /* skI 护盾（_P_SKI={k:'#7a4a10',y:'#f8d048',Y:'#c89010',w:'#fff8c8'}） */
'....kyyk....'   '.kkkkkkkkkk.'
'...kywyyk...'   '.kyyyyyyyyk.'
'..kyywwyyk..'   '.kywwyyyyYk.'
'.kyywwwwwyk.'   '.kywyyyyYYk.'
'kyyywwwwwyyk'   '.kyyyyyyYYk.'
'.kyoowwwwyk.'   '.kyyyyyYYYk.'
'..kooooook..'   '..kyyyyYYk..'
'...kooook...'   '..kyyyYYYk..'
'....kook....'   '...kyyYYk...'
'.....kk.....'   '....kYYk....'
'............'   '.....kk.....'
                  '............'
/* skO 连斩（_P_SKO={k:'#181232',w:'#ffffff',c:'#48d8e8',C:'#1898a8'}） */
'.........kk.'
'........kwwk'
'.......kwwck'
'......kwwck.'
'.....kwwck..'
'....kwwck...'
'...kwwck....'
'..kwwck.....'
'.kwcck......'
'.kkck.......'
'..kk........'
'............'
```

连斩全屏斩击、护盾泡泡、nova 光环、致谢彩带：**不出素材**——ui 工单用
`ctx.arc/lineTo` 程序化绘制（设计文档 §7），本单不预置大画布。

## E. heroAttackGold / heroAttackGoldL

```js
const _P_HERO_GOLD = Object.assign({}, _P_HERO, { b:'#f8d048', B:'#c89010', W:'#fff8c8' });
// 蓝主体换金、围巾橙金系保留 —— 施法金色姿态
SPR.heroAttackGold = _makeSprite(_H_ATTACK, _P_HERO_GOLD);
SPR.heroAttackGoldL = flipSprite(SPR.heroAttackGold);
```

## F. 门禁与自测（全部执行并贴结果）

1. `node --check art.js` → 通过。
2. `node tools/gate.js art` → `art.js OK: 语法通过, 导出齐全`（7 个契约导出名一个不少）。
3. 体量：`wc -c art.js` → **≤100,000 字节**（v3 授权上限；Boss 增量 ≤20KB）。
4. 网格自检（写进 buildSprites 后可选用 node+canvas 桩验证，或直接目测截图）：
   `python -c "from playwright.sync_api import sync_playwright; ..."` 不属于本队——
   由 ui 队合入后统一截图；本队在交付说明中列出「新增 SPR 键清单」供 ui 队对表。
5. 交付说明附：新增 SPR 键 22 个逐一列名（boss 部件 11：body/bodyRage/arm/armRage/jaw/jawRage/
   eye/eyeRage/eyeDizzy/pupil/core；bossWhite 1；特效 5：meteor/waveFx/bossBullet/heartFull/heartEmpty；
   图标 3：skU/skI/skO；主角 2：heroAttackGold/heroAttackGoldL）。

## 不做（越界即失败）

- 不改 engine.js / levels.js / ui.js / gate.js。
- 不新增顶层导出符号（SPR/THEMES 内加键除外）。
- 不画连斩全屏斩/护盾泡泡/nova 环/彩带（ui 程序化）。
- 不引入外部图片/网络素材。
