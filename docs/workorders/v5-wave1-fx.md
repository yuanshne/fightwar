# 工单 · 特效队（第一波）：战斗/技能/新机关功能性素材（art.js）

> 所有权：**只许改 `pixel-quest/art.js`**。设计基准：`docs/specs/2026-10-24-v5-design.md` §2/§3/§4。
> **本波边界：只做 SPR 战斗/技能/新机关功能性素材。禁止改动 THEMES、全部瓦片函数
> （blockTile/plankTile/iceTile/crumbleTile/toggleTile/spikesTile/lavaTile/doorTile/conveyorTile）、
> _buildDecor、makeBG、buildThemeArt——那些是第二波风格队所有权。**
> 现状引用：slashArc 三帧 art.js:417-464（_P_FX/_FX1..3）、buildSprites art.js:1099-1320、
> skI/skO art.js:928-955、程序化画法先例 _buildBossArm（行跨表 art.js:809-848）。
>
> **硬约束**：H1 `node tools/gate.js art` 退出码 0（语法+导出符号）；H2 顶层零 DOM
> （DOM 只在函数体内，现行惯例）；H3 **本波新增代码 ≤6KB**（改值不算增量）；H4 不删不改
> 既有 SPR 键（新增键：heroDashWind/heroDashWindL、knight、knightDead、portal、chandBlade、
> windStreak；替换键：slashArc 扩为 4 帧、skI/skO 重绘——**键名与取帧式不变**）。

## 任务清单
1. slashArc：18×14×3 → **26×22×4 帧**（起手/爆发/收束/余韵），程序化弧画法（§A）
2. heroDashWind(+L)：冲刺蓄力后仰帧（§B）
3. skI 重绘为盾徽、skO 重绘为竖剑（§C，字符网格照抄）
4. 骑士 SPR.knight[2] + knightDead（14×18，行跨程序化画法，§D）
5. SPR.portal[2]（16×24 漩涡门）、SPR.chandBlade（12×12 吊灯锤）、SPR.windStreak[2]（16×16 风纹）（§E）

渲染约定（与演出队工单对齐，写进代码注释）：knight 基准帧**面向左**（盾在左侧），
ui 按 `e.face>0` 用 flipSprite 翻转帧。

---

## §A slashArc 四帧（26×22，替换 _FX_SLASH 三帧挂载；保留 _P_FX 调色板键并扩一金色键）

```js
// 新调色板（内部，替换 _P_FX）：
const _P_FX = { w:'#ffffff', c:'#48d8e8', C:'#1898a8', y:'#f8d048' };
// 程序化弧光帧生成（替代字符网格；中心 (13,11)，扫角 -0.90π → +0.35π）：
function _slashFrame(r, coreW, coreColor, edgeColor, edgeW, alpha) { // 内部
  const c=_makeCanvas(26,22),g=c.getContext('2d');
  g.globalAlpha=alpha; g.lineCap='round';
  g.strokeStyle=edgeColor; g.lineWidth=edgeW;                 // 外缘色带
  g.beginPath(); g.arc(13,11,r,-0.90*Math.PI,0.35*Math.PI); g.stroke();
  g.strokeStyle=coreColor; g.lineWidth=coreW;                 // 白芯
  g.beginPath(); g.arc(13,11,r,-0.90*Math.PI,0.35*Math.PI); g.stroke();
  return c; }
SPR.slashArc = [
  _slashFrame(6, 1, '#cfefff', '#cfefff', 1, 0.85),           // 帧0 起手：小弧+右下角 1 白点
  (function(){const f=_slashFrame(10,3,'#ffffff','#48d8e8',5,0.95);
    const g=f.getContext('2d');g.fillStyle='#ffffff';g.globalAlpha=0.95;
    g.fillRect(21,16,2,2);return f;})(),                      // 帧1 爆发：大白弧+青缘+尾星
  _slashFrame(11,2,'#ffffff','#f8d048',3,0.9),                // 帧2 收束：金缘白芯
  _slashFrame(10,1,'#48d8e8','#1898a8',1,0.5)                 // 帧3 余韵：细蓝残痕
];
// 旧 _FX1/_FX2/_FX3 字面网格与其挂载行删除（节省的体积抵扣本波增量）。
```

## §B heroDashWind（16×16，`_H_ATTACK` 程序化派生 + 调色板复用 _P_HERO）

```js
const _H_DASHWIND = _H_ATTACK.map(function (row, i) { // 内部：冲刺蓄力·后仰
  if (i < 6) return ' ' + row.slice(0, 15);           // 上身向左后倾 1 列
  if (i > 11) return row.slice(1) + ' ';              // 下身前撑 1 列
  return row;                                          // 腰部不动
});
// 蓄力尘点：第 11/13 行行首若为空格则补 2 枚 W 速度感像素：
_H_DASHWIND[11] = 'W' + _H_DASHWIND[11].slice(0, 15);
SPR.heroDashWind = _makeSprite(_H_DASHWIND, _P_HERO);
SPR.heroDashWindL = flipSprite(SPR.heroDashWind);
```

## §C skI / skO 重绘（12×12 字符网格照抄；调色板沿用 _P_SKI / _P_SKO）

```js
const _SK_I = [ // 盾徽：金盾+白十字亮面+下缘暗部
  '..kkkkkkkk..',
  '.kyywwwwyYk.',
  '.kywyyyywYk.',
  '.kyywyywYYk.',
  '.kyywwwwYYk.',
  '.kyyyyyYYYk.',
  '..kyyyyYYk..',
  '..kyyyyYYk..',
  '...kyyYYk...',
  '....kYYk....',
  '.....kk.....',
  '............'];
const _SK_O = [ // 竖剑：白刃+青刃缘+金护手/柄
  '.....ww.....',
  '....kwck....',
  '....kwck....',
  '....kwck....',
  '....kwck....',
  '....kwck....',
  '....kwck....',
  '..kkkwwkkk..',
  '.kkkkwwkkkk.',
  '....kYYk....',
  '....kYYk....',
  '....kkkk....'];
// 挂载行替换（art.js:1296-1297）：
SPR.skI = _makeSprite(_SK_I, { k:'#7a4a10', y:'#f8d048', Y:'#c89010', w:'#fff8c8' });
SPR.skO = _makeSprite(_SK_O, { k:'#181232', w:'#ffffff', c:'#48d8e8', Y:'#f8d048' });
// （_P_SKO 的 C 键不再使用可留可删；skU 不动。）
```

## §D 骑士 SPR.knight[2] + knightDead（14×18，行跨程序化画法，先例 _buildBossArm）

```js
const _P_KNIGHT = { k:'#20242e', s:'#8898b8', S:'#5a6478', L:'#b5bcc7',
                    y:'#f8d048', e:'#f84848', b:'#3a4a72', w:'#ffffff' }; // 内部
const _KN_SPANS = [ // 内部：头盔+身体轮廓行跨（xL..xR，14 宽）
  [4,9],[3,10],[3,10],[3,10],[3,10],[3,10],   // 头盔 y0..5
  [3,10],[4,10],[4,10],[4,10],[4,10],[4,10],   // 肩胸 y6..11（右肩露剑柄见下）
  [4,10],[4,10],                               // 腰裙 y12..13
  [5,7],[7,9], [5,7],[7,9] ];                  // 双腿 y14..17（帧1=左前右后跨步）
// 帧2 腿部行（14..17）换为 [6,8],[5,7],[6,8],[7,9]（并步）。
// 特征像素（两帧同）：
//  盔顶缨 y：y0 行 x=6..7；面缝 e：y3 行 x=4..8 横条（隔 1 空 1：x4,6,8）；
//  胸甲亮缘 L：y6..7 行 x=4..5；裙甲 tabard b：y10..13 行 x=6..8；
//  盾（面向左=盾在左侧）：y6..13、x=0..3 圆角矩形——L 描边 1px、s 盾面、
//   y 盾徽中心 2×2（y9..10,x1..2）、w 高光点 (x1,y7)；
//  剑柄（背后露出）：y5..7、x=11..12 竖条 S + 顶 y 1px。
// 描边规则：填充像素 4 邻为空改 k（同 _buildBossArm 末段循环）。
// knightDead：同网格压扁到 8 行高（上半 6 行 + 盾落地一行 + 腿合并两行），
//  色换暗：s→S、L→S、y→'#8a6a18'、e→S（_P_KNIGHT_DEAD 派生调色板）。
// 帧2 生成：帧1 网格腿行替换后重建（非 flipSprite——跨步方向相反）。
```

## §E 传送门 / 吊灯锤 / 风纹（程序化）

```js
// SPR.portal[2]：16×24 竖椭圆漩涡（外环 #5a6ac0 1px、中环 #8ea0ff 1px、内芯 #e8ecff 3×5 竖棱形）
// 帧2=两中环相位互换+内芯上下移 1px（自旋感）。椭圆用两段 arc+scale(1,1.5) 或逐点
// 参数方程画（x=8+6cosθ, y=12+10sinθ），禁止抗锯齿糊边（fillRect 逐像素）。
// SPR.chandBlade：12×12——金环 #f8d048（r4.5 环形 1px）、内芯青 #48d8e8 实心 r3、
//  左上白高光 1px #ffffff、外描边 #7a4a10。
// SPR.windStreak[2]：16×16 半透明竖流纹——3 条圆头竖条（x=3/8/13，宽 1px，
//  长 10/13/8，色 rgba(220,255,255,0.5)），帧2 各条整体上移 3px（尾端补新条）＝向上流动。
//  半透明直接用 _rgba()（现有工具 art.js:115）。
```

## 自测断言（全部真实执行，结果贴交付说明）
1. `node tools/gate.js art` 通过（语法+导出 7 符号）。
2. 新增 `tools/_v5_fx_check.js`（node 直跑，只在函数内用 DOM → 需在浏览器跑则改用
   jsdom 不可行——改为：脚本仅做**静态断言**）：
   a) 正则断言 art.js 含全部新键：heroDashWind、knight、portal、chandBlade、windStreak、
      `SPR.slashArc`；
   b) 断言 `_SK_I`/`_SK_O` 每行长度 12、行数 12、字符集 ⊆ 调色板键+'.'；
   c) 断言文件体积：`fs.statSync('art.js').size` 较基线（当前 106656B）增量 ≤6144B；
   d) 断言未触碰禁改区：THEMES 块（art.js:1326-1376）逐字节与 git HEAD 相同
      （`git diff HEAD -- art.js | grep -c '^[+-].*skyT'` 为 0）。
3. 浏览器冒烟：buildSprites() 后 console 打印
   `SPR.slashArc.length===4 && SPR.knight.length===2 && !!SPR.portal && !!SPR.chandBlade &&
    !!SPR.windStreak && !!SPR.heroDashWind`（截图贴交付说明）。
4. `git diff --stat` 只改 art.js（+tools/_v5_fx_check.js）。

## 验收标准
- 上述全绿；所有新素材在白/深两种底色下无纯黑描边（描边用调色板深色键）；
- 未改 THEMES/瓦片/装饰/背景任何一行。
