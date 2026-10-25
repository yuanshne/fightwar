# -*- coding: utf-8 -*-
# tools/_v79_bossart_sheet.py —— v7.9 双 Boss 精灵目检图（工单 v7.9-bossart 验收 3）
# about:blank 注入 art.js → buildSprites()，把 boss4.body[0] / boss4.bodyRage[0] /
# boss5.body[0] / boss5.bodyRage[0] 与对照 boss2.body[0] 一起 6× 放大（imageSmoothingEnabled=false）
# 排在棋盘底上，输出 testshots/_v79_boss_sheet.png。每格下标尺寸，肉眼可核 64×48 / 44×52。
from playwright.sync_api import sync_playwright
import pathlib, sys

ROOT = pathlib.Path(__file__).parent.parent
OUT = ROOT / 'testshots'
OUT.mkdir(exist_ok=True)
ART = ROOT / 'art.js'
SHOT = OUT / '_v79_boss_sheet.png'
errors = []

JS = r"""
() => {
  buildSprites();
  const S = 6, CW = 72 * S, CH = 52 * S, PAD = 26, LBL = 22, GAP = 14;
  // 第三行=装配预览：完全按 ui.renderBoss 的偏移口径叠 body→arm→jaw→eye+pupil→core
  // （kind≥2 走底对齐、x 居中；眼 = b.x+8 / b.x+w-20，jaw = b.x+16 y+36，core = b.x+20 y+20），
  // 用来确认「看得见的部位」与叠加件对得上，而不是只看裸 body。
  const asm = P => {
    const bd = P.body[0];
    const c = document.createElement('canvas');
    c.width = bd.width + 28; c.height = bd.height + 2;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    const bx = 14, by = 0;                               // 命中框左上角（留 14px 给手臂）
    g.drawImage(bd, bx, by);
    g.drawImage(P.arm, bx - 10, by + 12);
    const flip = document.createElement('canvas');
    flip.width = P.arm.width; flip.height = P.arm.height;
    const fg = flip.getContext('2d');
    fg.translate(P.arm.width, 0); fg.scale(-1, 1); fg.drawImage(P.arm, 0, 0);
    g.drawImage(flip, bx + bd.width - 10, by + 12);
    g.drawImage(P.jaw[1], bx + 16, by + 36);
    g.drawImage(P.eye, bx + 8, by + 10);
    g.drawImage(P.eye, bx + bd.width - 20, by + 10);
    g.drawImage(P.pupil, bx + 14, by + 15);
    g.drawImage(P.pupil, bx + bd.width - 14, by + 15);
    g.drawImage(P.core[0], bx + 20, by + 20);
    return c;
  };
  const cells = [
    [['boss2 蛟龙(对照)', SPR.boss2.body[0]], ['boss4 冥古龙', SPR.boss4.body[0]], ['boss5 圣裁者', SPR.boss5.body[0]]],
    [['boss2 bodyRage', SPR.boss2.bodyRage[0]], ['boss4 bodyRage', SPR.boss4.bodyRage[0]], ['boss5 bodyRage', SPR.boss5.bodyRage[0]]],
    [['boss2 装配', asm(SPR.boss2)], ['boss4 装配', asm(SPR.boss4)], ['boss5 装配', asm(SPR.boss5)]]
  ];
  const W = PAD * 2 + 3 * (CW + GAP), H = PAD * 2 + 3 * (CH + LBL + GAP);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  cv.id = 'sheet';
  document.body.appendChild(cv);
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  // 棋盘底（透明区可读）
  const T = 12;
  for (let y = 0; y < H; y += T) for (let x = 0; x < W; x += T) {
    g.fillStyle = ((x / T + y / T) % 2 === 0) ? '#2a2438' : '#241f30';
    g.fillRect(x, y, T, T);
  }
  g.font = '13px Consolas, monospace';
  const dims = [];
  cells.forEach((row, ri) => row.forEach(([name, img], ci) => {
    const x = PAD + ci * (CW + GAP), y = PAD + ri * (CH + LBL + GAP);
    // 每格自身边框 = 该画布真实尺寸（尺寸不对时右侧/下侧露棋盘=一眼看出）
    g.strokeStyle = '#5a5068'; g.lineWidth = 1;
    g.strokeRect(x + 0.5, y + 0.5, img.width * S, img.height * S);
    g.drawImage(img, x, y, img.width * S, img.height * S);
    g.fillStyle = '#c8c0d8';
    g.fillText(name + '  ' + img.width + '×' + img.height, x, y + img.height * S + 16);
    dims.push(name + '=' + img.width + 'x' + img.height);
  }));
  return { dims: dims, w: W, h: H };
}
"""

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={'width': 1400, 'height': 900})
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append('PAGEERROR: ' + str(e)))
    pg.goto('about:blank')
    pg.add_script_tag(path=str(ART))
    info = pg.evaluate(JS)
    for d in info['dims']:
        print('  ', d)
    pg.locator('#sheet').screenshot(path=str(SHOT))
    b.close()

print('SHOT ->', SHOT, info['w'], 'x', info['h'])
print('CONSOLE_ERRORS:', len(errors))
for e in errors[:5]:
    print(' -', e[:200])
sys.exit(1 if errors else 0)
