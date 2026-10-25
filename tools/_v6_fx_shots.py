# -*- coding: utf-8 -*-
# _v6_fx_shots.py —— v6 特效队目检截图（工单 v6-wave1-fx 交付自测 4，沿 _art_shots.py 模式）
# about:blank 注入 art.js → buildSprites() → 六组新键贴测试画布拼图（8× 放大+棋盘底），
# 输出 testshots/v6_fx.png；同时运行时断言各精灵画布尺寸逐字（H5）。
from playwright.sync_api import sync_playwright
import pathlib, sys

ROOT = pathlib.Path(__file__).parent.parent
OUT = ROOT / 'testshots'
OUT.mkdir(exist_ok=True)
ART = ROOT / 'art.js'
SHOT = OUT / 'v6_fx.png'
errors = []

# 画布尺寸断言 + 拼图绘制（浏览器内执行）
JS = r"""
() => {
  buildSprites();
  const want = { blade: [12,12,2], skL: [12,12,1], knightGuard: [14,18,2],
                 mage: [14,18,2], mageCast: [14,18,1], fireball: [8,8,2] };
  const dims = {};
  for (const k in want) {
    const v = SPR[k];
    const arr = Array.isArray(v) ? v : [v];
    if (arr.length !== want[k][2]) throw k + ' 帧数 ' + arr.length + ' ≠ ' + want[k][2];
    for (const c of arr) {
      if (c.width !== want[k][0] || c.height !== want[k][1])
        throw k + ' 画布 ' + c.width + 'x' + c.height + ' ≠ ' + want[k][0] + 'x' + want[k][1];
    }
    dims[k] = arr.map(c => c.width + 'x' + c.height).join(',');
  }
  // 拼图：8× 放大，棋盘底显透明区，drawPixelText 标注
  const S = 8, GAP = 28, M = 24, LBL = 26;
  const cv = document.createElement('canvas');
  cv.width = 620; cv.height = M*2 + 96 + LBL + GAP + 144 + LBL + GAP + 144 + LBL;
  document.body.appendChild(cv); // 挂进 DOM 供 locator 截图
  const g = cv.getContext('2d');
  _artUse(cv); // 注入主画布上下文——drawPixelText 画标注用
  g.imageSmoothingEnabled = false;
  for (let y = 0; y < cv.height; y += 8) for (let x = 0; x < cv.width; x += 8)
    g.fillStyle = ((x + y) & 8) ? '#20242e' : '#282c38', g.fillRect(x, y, 8, 8);
  const put = (img, x, y) => { g.drawImage(img, 0, 0, img.width, img.height, x, y, img.width*S, img.height*S); };
  const lbl = (s, x, y) => drawPixelText(s, x, y, 2, '#f8d048');
  const items1 = [[SPR.blade[0],'BLADE0'],[SPR.blade[1],'BLADE1'],[SPR.skL,'SKL'],
                  [SPR.fireball[0],'FIREB0'],[SPR.fireball[1],'FIREB1']];
  let x = M; const y1 = M;
  for (const [img, name] of items1) { put(img, x, y1); lbl(name, x, y1 + 96 + 6); x += img.width*S + GAP; }
  const y2 = y1 + 96 + LBL + GAP;
  const gx2 = M + 14*S + GAP;
  put(SPR.knightGuard[0], M, y2); lbl('GUARD0', M, y2 + 144 + 6);
  put(SPR.knightGuard[1], gx2, y2); lbl('GUARD1', gx2, y2 + 144 + 6);
  const y3 = y2 + 144 + LBL + GAP;
  const gx3 = M + 2*(14*S + GAP);
  put(SPR.mage[0], M, y3); lbl('MAGE0', M, y3 + 144 + 6);
  put(SPR.mage[1], M + 14*S + GAP, y3); lbl('MAGE1', M + 14*S + GAP, y3 + 144 + 6);
  put(SPR.mageCast, gx3, y3); lbl('MAGECAST', gx3, y3 + 144 + 6);
  return dims;
}
"""

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={'width': 700, 'height': 800})
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append('PAGEERROR: ' + str(e)))
    pg.goto('about:blank')
    pg.add_script_tag(path=str(ART))
    dims = pg.evaluate(JS)
    for k in sorted(dims):
        print('SPR.' + k, '→', dims[k])
    pg.locator('canvas').screenshot(path=str(SHOT))
    b.close()

print('SHOT →', SHOT)
print('CONSOLE_ERRORS:', len(errors))
for e in errors[:5]:
    print(' -', e[:200])
sys.exit(1 if errors else 0)
