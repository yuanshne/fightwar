# -*- coding: utf-8 -*-
# _v6_look_shots.py —— v6 外观队目检截图（工单 v6-wave2-look 交付自测 3，沿 _v6_fx_shots.py/(_art_shots.py) 模式）
# about:blank 注入 art.js → buildSprites() → 九部件 + 四图标贴测试画布拼图（8× 放大+棋盘底），
# 并叠加「部件×heroIdle1 合成预览」三组（档1/2/3 全穿，合成序=设计书 §7.5：cape→基础帧→weapon→hat，
# idle 家族 dx=0）供设计师验收 H4 档位梯度；输出 testshots/v6_look.png；
# 同时运行时断言各精灵画布尺寸逐字（H5：look 16×16×3、ico 12×12）。
from playwright.sync_api import sync_playwright
import pathlib, sys

ROOT = pathlib.Path(__file__).parent.parent
OUT = ROOT / 'testshots'
OUT.mkdir(exist_ok=True)
ART = ROOT / 'art.js'
SHOT = OUT / 'v6_look.png'
errors = []

# 画布尺寸断言 + 合成 + 拼图绘制（浏览器内执行）
JS = r"""
() => {
  buildSprites();
  // H5 尺寸运行时断言：look 三件套各 3 帧 16×16；四图标 12×12
  const dims = {};
  for (const part of ['weapon', 'hat', 'cape']) {
    const arr = SPR.look[part];
    if (!Array.isArray(arr) || arr.length !== 3) throw 'SPR.look.' + part + ' 帧数 ' + (arr && arr.length) + ' ≠ 3';
    for (const c of arr)
      if (c.width !== 16 || c.height !== 16) throw part + ' 画布 ' + c.width + 'x' + c.height + ' ≠ 16x16';
    dims['look.' + part] = '16x16 x3';
  }
  for (const k of ['icoW', 'icoH', 'icoC', 'icoBag']) {
    const c = SPR[k];
    if (c.width !== 12 || c.height !== 12) throw k + ' 画布 ' + c.width + 'x' + c.height + ' ≠ 12x12';
    dims[k] = '12x12';
  }
  // 合成预览：ui heroLook（设计书 §7.5 冻结序）——cape 底层 → 基础帧 → weapon → hat（idle 家族 dx=0）
  const comp = t => {
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const g = c.getContext('2d');
    g.drawImage(SPR.look.cape[t], 0, 0);
    g.drawImage(SPR.heroIdle1, 0, 0);
    g.drawImage(SPR.look.weapon[t], 0, 0);
    g.drawImage(SPR.look.hat[t], 0, 0);
    return c;
  };
  // 拼图：8× 放大，棋盘底显透明区，drawPixelText 标注
  const S = 8, GAP = 30, M = 24, LBL = 24, CELL = 16 * S;
  const cv = document.createElement('canvas');
  cv.width = M * 2 + 4 * CELL + 3 * GAP;
  cv.height = M * 2 + 5 * (CELL + LBL) + 4 * GAP;
  document.body.appendChild(cv); // 挂进 DOM 供 locator 截图
  const g = cv.getContext('2d');
  _artUse(cv); // 注入主画布上下文——drawPixelText 画标注用
  g.imageSmoothingEnabled = false;
  for (let y = 0; y < cv.height; y += 8) for (let x = 0; x < cv.width; x += 8)
    g.fillStyle = ((x + y) & 8) ? '#20242e' : '#282c38', g.fillRect(x, y, 8, 8);
  const put = (img, x, y) => g.drawImage(img, 0, 0, img.width, img.height, x, y, img.width * S, img.height * S);
  const lbl = (s, x, y) => drawPixelText(s, x, y, 2, '#f8d048');
  const rows = [
    [['WEAPON1', SPR.look.weapon[0]], ['WEAPON2', SPR.look.weapon[1]], ['WEAPON3', SPR.look.weapon[2]]],
    [['HAT1', SPR.look.hat[0]], ['HAT2', SPR.look.hat[1]], ['HAT3', SPR.look.hat[2]]],
    [['CAPE1', SPR.look.cape[0]], ['CAPE2', SPR.look.cape[1]], ['CAPE3', SPR.look.cape[2]]],
    [['ICOW', SPR.icoW], ['ICOH', SPR.icoH], ['ICOC', SPR.icoC], ['ICOBAG', SPR.icoBag]],
    [['FULL1', comp(0)], ['FULL2', comp(1)], ['FULL3', comp(2)], ['HERO', SPR.heroIdle1]]
  ];
  rows.forEach((row, ri) => {
    const y = M + ri * (CELL + LBL + GAP);
    row.forEach(([name, img], ci) => {
      const x = M + ci * (CELL + GAP);
      put(img, x, y);
      lbl(name, x, y + CELL + 6);
    });
  });
  return dims;
}
"""

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={'width': 720, 'height': 1060})
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append('PAGEERROR: ' + str(e)))
    pg.goto('about:blank')
    pg.add_script_tag(path=str(ART))
    dims = pg.evaluate(JS)
    for k in sorted(dims):
        print('SPR.' + k, '->', dims[k])
    pg.locator('canvas').screenshot(path=str(SHOT))
    b.close()

print('SHOT ->', SHOT)
print('CONSOLE_ERRORS:', len(errors))
for e in errors[:5]:
    print(' -', e[:200])
sys.exit(1 if errors else 0)
