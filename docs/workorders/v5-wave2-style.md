# 工单 · 风格队（第二波）：全主题原神化 + 封面素材 + 换皮肤（art.js）

> 所有权：**只许改 `pixel-quest/art.js`**。设计基准：`docs/specs/2026-10-24-v5-design.md`
> §5（色板表/三阶 cel 规则/发光规范）、§6.1（封面素材清单）。
> 前置：第一波特效队已合入（slashArc 四帧/新机关功能性素材）；本波在其上**换色不换键**。
> 现状引用：THEMES art.js:1326-1376、_TILE_MOTIF art.js:1379-1432、_paintBlock art.js:1435-1460、
> 各瓦片函数 art.js:1462-1640、_dithRow/_dithCol art.js:119-131、_buildDecor art.js:1645-2081、
> makeBG art.js:2102-2383、buildThemeArt art.js:2386-2410、puzzleUI art.js:1306-1318。
>
> **硬约束**：H1 `node tools/gate.js art` 通过；H2 **改值不算增量**，本波新增代码 ≤12KB、
> art.js 终态 ≤125KB（现 106656B+波1 ≤6KB）；H3 精灵键名/取帧式/尺寸契约不变（SPR/puzzleUI
> 全部沿用第一波键）；H4 顶层零 DOM；H5 THEMES 字段名与顺序不变（ui/engine 按 key 读），
> 新增键 wind/castle/star（engine 桩环境 `_engDecorFallback` 已由波1 预置三键）。

## 任务清单
1. THEMES 全量换值 + 新增 wind/castle/star 三主题（§A，色板表照抄）
2. cel-shading 三阶硬边改造：瓦片函数删抖动改硬边（§B）
3. 精灵发光规范 `_glow` 后处理 + 发光件清单（§C）
4. makeBG：旧七主题按新色板校色 + 三个新主题分支（§D）
5. 装饰：windmill/starflower 新增 + 既有装饰换色（§E）
6. puzzleUI 木框换"深蓝+金"皮（同键同规格）（§F）
7. 封面素材 SPR.cover（§G）
8. CONTRACT 附记（THEMES 7→10）+ 自测（§H）

---

## §A THEMES 全量换值（色板来自设计书 §5.3，逐格照抄；name 同步换新名）

```
grass:{name:'晴空草原',skyT:'#4a9fe8',skyB:'#bfe8ff',far:'#accce8',near:'#96adcf',
 block:'#d8a05c',blockD:'#967266',blockL:'#e7c18e',blockS:'#755b6b',speck:'#ac8163',
 cap:'#38c860',capD:'#3e8c68',capL:'#8cdb96',capS:'#416a6c',
 plank:'#c88848',plankD:'#8e655b',plankL:'#dbad7c',accent:'#f8a030',
 decor:['bush','tallgrass','flower','boulder','mushroom','stump','tallgrass','flower'],
 dust:'#eef4ff',band:'#ffe9b8'},
cave:{name:'星辉洞窟',skyT:'#2c2a58',skyB:'#5a5694',far:'#57528f',near:'#534c88',
 block:'#6a72a8',blockD:'#5a5990',blockL:'#a3a4bd',blockS:'#524c83',speck:'#5f6198',
 cap:'#40d8b0',capD:'#439696',capL:'#90e5c4',capS:'#447087',
 plank:'#5a6288',plankD:'#51507e',plankL:'#9294a6',accent:'#64e8d8',
 decor:['crystal','glowworm','stalagmite','mushroom','boulder','crystalS','stalagmite'],
 dust:'#a8b4e8',dark:true,band:'#40d8b0'},
sky:{name:'云海天穹',skyT:'#58b8f0',skyB:'#e8f6ff',far:'#ced8e8',near:'#b1b6cf',
 block:'#eef2fa',blockD:'#a29fbd',blockL:'#f4f4f0',blockS:'#7c759e',speck:'#bcbbd1',
 cap:'#ffffff',capD:'#b1acc4',capL:'#fffbf2',capS:'#857da2',
 plank:'#d8e4f4',plankD:'#9698ba',plankL:'#e5eaed',accent:'#f8b020',
 decor:['cloudpot','cloudsmall','flower','tulip','balloon','pinwheel','cloudsmall'],
 dust:'#ffffff',band:'#ffffff'},
factory:{name:'鎏金工殿',skyT:'#3a4a72',skyB:'#6a7ea8',far:'#64739f',near:'#5e6796',
 block:'#8898b8',blockD:'#6a6e99',blockL:'#b5bcc7',blockS:'#5b5888',speck:'#747ca3',
 cap:'#e0a848',capD:'#9f7a5a',capL:'#edc988',capS:'#7a5f64',
 plank:'#6a7890',plankD:'#5a5c83',plankL:'#9da3ab',accent:'#f8c040',
 decor:['gear','chain','valve','lamp','barrel','vent','gear','chain'],
 dust:'#c8d4ec',dark:true,band:'#f8c040'},
lava:{name:'落日熔渊',skyT:'#582840',skyB:'#a84828',far:'#984634',near:'#874341',
 block:'#5a4458',blockD:'#514064',blockL:'#99888c',blockS:'#4c3d6a',speck:'#544160',
 cap:'#f89038',capD:'#ad6c50',capL:'#fbbb7f',capS:'#83575e',
 plank:'#7a5560',plankD:'#634968',plankL:'#a78c8c',accent:'#f8d048',
 decor:['torch','skull','flamepillar','ribcage','lavarock','obsidian','torch','flamepillar'],
 dust:'#f8b078',dark:true,lavaGlow:'#f86038',band:'#f86038'},
tower:{name:'星夜高塔',skyT:'#1e2452',skyB:'#42407e',far:'#433f7c',near:'#433e7a',
 block:'#8a7cc0',blockD:'#6b5e9d',blockL:'#b6aacc',blockS:'#5c4f8b',speck:'#7668a9',
 cap:'#b8a8e8',capD:'#887ab6',capL:'#d6c9e5',capS:'#6d5f9a',
 plank:'#7060a0',plankD:'#5d4f8b',plankL:'#a193b6',accent:'#58e8f0',
 decor:['torch','candelabra','flagbanner','urn','crystal','gear','flagbanner'],
 dust:'#c0b8f0',dark:true,band:'#8878f0'},
boss:{name:'星核虚空',skyT:'#140f36',skyB:'#2e2260',far:'#322663',near:'#362a66',
 block:'#4a3a7e',blockD:'#483a79',blockL:'#8f81a3',blockS:'#473a76',speck:'#493a7a',
 cap:'#a070ff',capD:'#7a59c4',capL:'#c8a8f2',capS:'#654ca2',
 plank:'#5a4a8e',plankD:'#514381',plankL:'#9284aa',accent:'#f8d048',
 decor:['crystal','torch','skull','crystal'],dust:'#b8a0f8',dark:true,band:'#f8d048'},
wind:{name:'翡翠风谷',skyT:'#52c8e8',skyB:'#e0fbf0',far:'#c7dcdc',near:'#acb9c5',
 block:'#58b878',blockD:'#507f75',blockL:'#97d0a0',blockS:'#4c6274',speck:'#539276',
 cap:'#64e896',capD:'#579f87',capL:'#a5eeb5',capS:'#50757e',
 plank:'#a8d068',plankD:'#7c8d6d',plankL:'#c6dd91',accent:'#f8f0a0',
 decor:['windmill','tallgrass','flower','pinwheel','cloudsmall'],
 dust:'#eafff4',band:'#fff8c8'},
castle:{name:'落日王城',skyT:'#f8a850',skyB:'#fce8b8',far:'#dfccad',near:'#beada0',
 block:'#d8c8b0',blockD:'#968894',blockL:'#e7d9c2',blockS:'#756786',speck:'#ac9d9d',
 cap:'#f0b848',capD:'#a9835a',capL:'#f6d288',capS:'#806564',
 plank:'#b0885c',plankD:'#806566',plankL:'#cbad89',accent:'#e86038',
 decor:['flagbanner','candelabra','torch','urn','boulder'],
 dust:'#ffe8c0',band:'#ffd080'},
star:{name:'星空回廊',skyT:'#0e1238',skyB:'#2c3472',far:'#303572',near:'#353672',
 block:'#5a6ac0',blockD:'#51549d',blockL:'#999fcc',blockS:'#4c498b',speck:'#545ca9',
 cap:'#8ea0ff',capD:'#7075c4',capL:'#bdc4f2',capS:'#5e5da2',
 plank:'#4a5a9a',plankD:'#484c88',plankL:'#888fb2',accent:'#f8e8a0',
 decor:['starflower','crystal','urn','chain'],dust:'#a8b4ff',dark:true,band:'#8ea0ff'}
```
（dark 标记：cave/factory/lava/tower/boss/star；其余不写即 false。）

## §B cel-shading 三阶硬边（瓦片改造）

```js
// _paintBlock（art.js:1435）重写为硬边三阶（伪代码即规格）：
function _paintBlock(g, th, key, seed) {
  const rnd = _mulberry32(seed);
  g.fillStyle = th.block; g.fillRect(0, 0, 16, 16);
  g.fillStyle = th.blockL; g.fillRect(0, 0, 16, 3); g.fillRect(0, 3, 2, 3);   // 亮面（硬边）
  g.fillStyle = th.blockD; g.fillRect(0, 12, 16, 4); g.fillRect(13, 3, 3, 9); // 影面（硬边）
  g.fillStyle = th.blockS; g.fillRect(0, 15, 16, 1); g.fillRect(15, 0, 1, 16);// 暗缝 1px
  for (let i = 0; i < 3; i++) {                                               // 斑点 3 枚
    g.fillStyle = i % 2 ? th.speck : th.blockS;
    g.fillRect(4 + Math.floor(rnd() * 8), 5 + Math.floor(rnd() * 5), 2, 1); }
  if (key && _TILE_MOTIF[key]) _TILE_MOTIF[key](g, th, rnd);                  // 母题保留
}
// blockTile 盖层：两层绿改三阶硬边（capL 上 2px / cap 中 2px / capD 下 1px 分界线，
// 不再抖动）；草簇/花点缀保留。plankTile/iceTile/crumbleTile/toggleTile/spikesTile/
// _spikesDownTile/lavaTile/doorTile/conveyorTile：**删除函数体内全部 _dithRow/_dithCol
// 调用**，色带边界一律硬切；lava 表壳亮斑保留两帧位移（动画，非抖动）。
// _dithRow/_dithCol/_dithRect/_rgba 工具函数保留（makeBG 远景仍在用）。
// _TILE_MOTIF 各主题色值换新（按 §A 表里的 cap/speck/accent 派生，允许微调，
// 母题图形不变）；lava 裂纹辉光色 '#f86020'→'#f86038'、tower 符文青 '#48d8e8'→'#58e8f0'。
```

## §C 发光规范（_glow 后处理，只加不改精灵网格）

```js
function _glow(spr, rim) { // 内部：剪影左上外扩 1px 亮边（发光件专用）
  const c = _makeCanvas(spr.width + 2, spr.height + 2), g = c.getContext('2d');
  g.globalAlpha = 0.35;
  g.drawImage(spr, 0, 2); g.drawImage(spr, 2, 0); g.drawImage(spr, 0, 0, spr.width, 0 ? 0 : 0); // 见下注
  // ↑ 实现口径：先画 rim 色 1px 偏移四向剪影（用 source-in 于临时画布取剪影再偏移叠加），
  //   再 alpha=1 居中画原精灵；rim 色=参数。核心高光 1px #ffffff 由调用处补点。
  return c; }
// 应用清单（buildSprites 内对应行包一层 _glow，rim 色照抄设计书 §5.4）：
// SPR.coin[0..3]→'#fff2a0'；gem→'#bffcff'；key→'#fff2a0'；springX 顶板→'#ffe9b0'；
// shrineOn[2]→'#fff3c0'；skU/skI/skO→'#fff3c0'；meteor[2]→'#fff8c8'；
// boss.eye/eyeRage→2px 强化（_glow 两遍）；boss.core→'#fff3c0'；portal[2]→'#cff2ff'；
// chandBlade→'#ffe9b0'；checkOn→'#eafff0'；heartFull→'#ffd8e8'。
// 注意尺寸 +2：ui 各 drawImage 坐标一律 -1 补偿——**为避免 ui 全改，_glow 返回原尺寸**：
// 实现：不扩画布，直接在原 canvas 上 source-atop 叠 1px rim 内描边（左上内缘 1px rim 色
// alpha 0.5）+剪影外不画。采用此口径（内描边发光），尺寸与坐标零变化。
```

## §D makeBG（旧七主题换新色板自动生效；新增三分支）

```
wind：天光带 band '#fff8c8'；远景=起伏翡翠丘（sin 轮廓，th.far）+ 远处风车剪影柱
      （十字叶轮 4 座，th.near）；中景=白桦树线（midC）；氛围点=白色飘叶（8 枚，
      1×2 横条+尾点）；近景=近丘+蒲公英白球（gn，th.near+白点）。
castle：天光带 '#ffd080'；远景=落日大圆盘（右上 r36 '#fce8b8' + 核心 '#fff8e0'）+
      城堡剪影群（塔+雉堞，th.far）；中景=尖塔+旗帜三角（midC）；氛围点=归鸟 5 只
      （两像素 V 形，'#5a4a58'）；近景=城墙垛口剪影（th.near）+ 窗灯暖点 '#f0b848'。
star：不叠 _skyBands——深空 4 阶渐变（skyT→skyB 烘进 far，同 boss 分支）；
      星点 40 颗（白/金/青）+ 3 个大星十字；远景=回廊拱门石柱群（th.far，拱=矩形+
      半圆顶）+ 浮岛碎块；中景=能量带 2 条（th.band '#8ea0ff'，沿线 12 亮点）；
      近景=石柱+星藤（th.near 垂链+星点端头）。
```
（各分支随机元素一律 `_mulberry32` 定参 + `_wrap3` 环绕，结构照抄现有分支。）

## §E 装饰
- 新增 `windmill`：16×20 两帧（木塔+四叶风车，叶轮相位差 45°；色：木 #b0885c/#806566、
  叶 #e8f4ff、轴心 #f8d048），数组键（ui 自动按 decor 数组帧动画取帧，同 torch）。
- 新增 `starflower`：8×10 两帧（青白花瓣+金芯，帧2 花瓣亮一档=发光闪烁）。
- 既有装饰（bush/flower/.../urn）**只允许改色值**（对齐新主题色板的同族色），不改形状
  与网格结构；色值自定但须通过 §H-2 的"无纯黑描边"断言。

## §F puzzleUI 换皮（同键同规格，ui 零改动）
`SPR.puzzleUI` 的 cornerTL/TR/BL/BR/edgeH/edgeV/cursor/xmark 八件：木色系 `_P_PZWOOD`
换"深蓝+金"系：k '#1a2440'（深蓝描边）/ N '#24345e' / n '#2e4070'（面板底）/ m '#3c5490' /
l '#f0c860'（金高光边）；网格字符画结构逐行照抄现网格（只换调色板映射即可——
`_PZ_*` 网格不动，改 `_P_PZWOOD` 调色板字面量）。gold/goldD/goldL 三色不变。
cursor/xmark 白/藏蓝不变（可读性）。

## §G 封面素材 SPR.cover（新字典，逐件规格）
```
SPR.cover = {
  heroSil: 24×28——主角跃起剪影：黑 #0a0e22 剪影（动态照 _H_JUMP 放大姿态）+
    背光金边：剪影左上外缘 1px #f8d048、外圈再 1px rgba(248,208,72,.4)；剑上指。
  bossSil: 104×56——星核巨兽远景剪影 #141028 + 双眼 2 点 #38e8f8（2×2）+
    背部核心微光 1 点 #f8d048；轮廓右上缘 1px #4a3a7e 暖边。
  meteorStreak: [2] 26×8——帧1 头部白亮 3×3 + 尾带金→暗渐细（#fff8c8→#f8d048→透明，
    逐像素宽度 1px 递减）；帧2 整体暗一档（重入屏用）。
  cloudA/B/C: 各 512×80 可水平平铺——A 最亮（#e8f2ff 顶/#c7dcec 底影）远层碎云团；
    B 中层（#cfe0f4/#a8c0dc）云团更大；C 最暗最近（#5a6a94/#3c4a72）云海带厚度感。
    云团画法沿用 gn 云（fillRect 组合+底影线），禁止抖动。
}
```

## §H 自测断言（全部真实执行）
1. `node tools/gate.js art` 通过。
2. 新增 `tools/_v5_style_check.js`（node 静态断言）：
   a) THEMES 十键齐全，每键字段 19 个（name/skyT/skyB/far/near/block/blockD/blockL/blockS/
      speck/cap/capD/capL/capS/plank/plankD/plankL/accent/decor + dust/band）且全 #rrggbb；
      十主题 skyT/skyB 与设计书 §5.3 表逐值相等（正则抽取比对）；
   b) 瓦片函数体内无 `_dithRow|_dithCol`：`blockTile/plankTile/iceTile/crumbleTile/
      toggleTile/spikesTile/lavaTile/doorTile/conveyorTile` 函数体切片（按函数名定位到
      下一个 function 声明）grep 为 0；
   c) `SPR.cover`/`windmill`/`starflower`/`_glow` 键存在；
   d) 体积：art.js ≤125KB；本波增量 ≤12KB（对波1 合入后的 git 基线）；
   e) 全文无 `#000000` 与 `rgb(0,0,0`（纯黑禁令，_mixHex 参数里的 '#000000' 除外——
      若有，改用 '#0a0e22'）。
3. 浏览器冒烟截图（贴交付说明）：十主题各 `buildThemeArt(key)` 无异常、贴 16 瓦片拼图
   检查三阶硬边（无棋盘纹）；L1/L8 场景、谜题覆盖层新皮肤、`SPR.cover` 三件。
4. `git diff --stat` 只改 art.js（+tools/_v5_style_check.js +CONTRACT.md 附记一行）。

## CONTRACT 附记（追加一行）
「附记（v5 风格，风格队录入）：THEMES 自 v5 起为十主题（新增 wind/castle/star）；
瓦片为三阶 cel 硬边（抖动仅存于 makeBG 远景）；SPR.cover 为封面素材字典；puzzleUI
换深蓝金皮肤（键与 8×8 齐缝规格不变）。」
