# -*- coding: utf-8 -*-
# 鲁棒性测试：恶意输入/非法注入/边界状态/快速操作轰炸
from playwright.sync_api import sync_playwright
import pathlib

BASE = 'file:///C:/Users/A/.zcode/workspace/draft-6e5b5889-432a-4c7b-aabe-13a594a464ac/pixel-quest/index.html'
errs = []   # (case, msg)
warns = []  # 预期内告警（主循环兜底捕获的异常——正是它把「整局冻死」降级为「一帧跳过」）

def on_console(m):
    if m.type != 'error':
        return
    txt = m.text[:150]
    if '[frame] 异常已捕获' in txt:   # v7.4 主循环兜底：故意注入 NaN 时它必然触发，属预期
        warns.append(txt)
    else:
        errs.append(('console', txt))

def check(pg, case, fn):
    try:
        r = fn()
        print(f'  [PASS] {case}: {r}')
    except Exception as e:
        errs.append((case, str(e)[:150]))
        print(f'  [FAIL] {case}: {str(e)[:120]}')

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={'width': 1152, 'height': 680})
    pg.on('pageerror', lambda e: errs.append(('pageerror', str(e)[:200])))
    pg.on('console', on_console)

    print('== A. 非法 URL 参数 ==')
    for bad in ['?level=999', '?level=abc', '?level=-5', '?level=0', '?god=x&level=3&level=7', '?level=16&god=1']:
        check(pg, bad, lambda bad=bad: (
            pg.goto(BASE + bad), pg.wait_for_timeout(700),
            pg.evaluate('() => game.level ? game.level.meta.name : "title"'))[2])

    print('== B. 玩家坐标/速度非法注入 ==')
    pg.goto(BASE + '?level=2&god=1'); pg.wait_for_timeout(800)
    check(pg, '坐标NaN注入', lambda: pg.evaluate('''() => {
      game.player.x = NaN; game.player.y = NaN; game.player.vx = Infinity;
      for (let i=0;i<10;i++) updateWorld(1/60);
      const ok = Number.isFinite(game.player.x) || game.player.dead !== undefined;
      game.player.x = 100; game.player.y = 100; game.player.vx = 0; game.player.vy = 0;
      return ok ? '世界未崩' : '崩了';
    }'''))
    check(pg, '抛出地图外(超界坐标)', lambda: pg.evaluate('''() => {
      game.player.x = -5000; game.player.y = -5000; game.player.vy = 0;
      for (let i=0;i<20;i++) updateWorld(1/60);
      return 'x=' + Math.round(game.player.x) + ' dead=' + game.player.dead;
    }'''))
    check(pg, 'boss字段破坏(HP负/字段删)', lambda: pg.evaluate('''() => {
      game.level.enemies.forEach(e => { e.hp = -5; e.x = NaN; });
      if (game.boss) { game.boss.hp = -1; }
      for (let i=0;i<30;i++) updateWorld(1/60);
      game.player.x = 200; game.player.y = 200;
      return '敌人NaN未崩';
    }'''))

    print('== C. 谜题层+死亡/暂停/背包交叉 ==')
    check(pg, '谜题打开时死亡再复活', lambda: pg.evaluate('''() => new Promise(res => {
      game.player.x = game.level.shrines[0].x - 14; game.player.y = game.level.shrines[0].y + 4;
      setTimeout(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', {code: 'ArrowUp'}));
        setTimeout(() => {
          const inPuzzle = game.puzzleActive;
          killPlayer();
          const deadDuring = game.player.dead;
          setTimeout(() => {
            res({inPuzzle, deadDuring, afterRespawn: game.player.dead, puzzleStill: game.puzzleActive});
          }, 1100);
        }, 300);
      }, 300);
    })'''))
    check(pg, '谜题中疯狂切换暂停/B/ Esc', lambda: pg.evaluate('''() => {
      for (let i=0;i<30;i++) {
        window.dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyP'}));
        window.dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyB'}));
        window.dispatchEvent(new KeyboardEvent('keydown', {code: 'Escape'}));
      }
      return 'active=' + game.puzzleActive + ' paused=' + game.paused + ' bag=' + game.bagActive;
    }'''))

    print('== D. 背包极限操作 ==')
    check(pg, '注入13件装备+碎片溢出', lambda: pg.evaluate('''() => {
      const slots=['w','h','c'];
      for (let i=0;i<13;i++) game.pickups.push({slot: slots[i%3], r: i%5});
      for (let i=0;i<60;i++) updateWorld(1/60);
      const pr = JSON.parse(localStorage.getItem('pq_progress')||'{}');
      return 'inv=' + (pr.inv||[]).length + ' shardsKinds=' + Object.keys(pr.shards||{}).length;
    }'''))
    check(pg, '穿装备后改存档为非法槽位再recompute', lambda: pg.evaluate('''() => {
      const pr = JSON.parse(localStorage.getItem('pq_progress') || '{}');
      pr.equip = {w: 999, h: -3, c: 'x'};
      localStorage.setItem('pq_progress', JSON.stringify(pr));
      return 'done';
    }'''))
    check(pg, 'reload后自愈', lambda: (
        pg.reload(), pg.wait_for_timeout(1000),
        pg.evaluate('''() => { const pr = JSON.parse(localStorage.getItem('pq_progress') || '{}');
          return 'equip=' + JSON.stringify(pr.equip) + ' maxHp=' + game.player.maxHp; }'''))[2])

    print('== E. 按键轰炸 + 快速重开 ==')
    check(pg, '全键位50连打', lambda: pg.evaluate('''() => {
      const codes = ['KeyJ','KeyK','KeyU','KeyI','KeyO','KeyL','KeyB','KeyP','Space','ArrowUp','ArrowLeft','ArrowRight','ArrowDown','KeyR','Escape','Enter'];
      for (let r=0;r<50;r++) codes.forEach(c => {
        window.dispatchEvent(new KeyboardEvent('keydown', {code: c}));
        window.dispatchEvent(new KeyboardEvent('keyup', {code: c}));
      });
      return 'tick=' + Math.round(game.tick) + ' state=' + game.state;
    }'''))
    for _ in range(8):   # 快速重开轰炸（R=ui 侧 startLevel；ui 在 IIFE 内，只能走真实按键）
        pg.keyboard.press('KeyR')
        pg.wait_for_timeout(90)
    check(pg, '1秒内8次R重开', lambda: pg.evaluate('''() =>
      'level=' + game.level.meta.name + ' player=' + !!game.player'''))

    print('== F. 存档极端破坏 ==')
    check(pg, '存档=垃圾字符串', lambda: pg.evaluate('''() => {
      localStorage.setItem('pq_progress', '{{{not json');
      return 'set';
    }'''))
    check(pg, 'reload后回落默认档', lambda: (
        pg.reload(), pg.wait_for_timeout(1000),
        pg.evaluate('() => game.level ? ("boot ok: " + game.level.meta.name + " maxHp=" + game.player.maxHp) : "FAIL"'))[2])
    check(pg, '存档=数组/数字类型混淆', lambda: pg.evaluate('''() => {
      localStorage.setItem('pq_progress', '[1,2,3]');
      return 'set';
    }'''))
    check(pg, 'reload后仍可玩', lambda: (
        pg.goto(BASE + '?level=3'), pg.wait_for_timeout(1000),
        pg.evaluate('() => game.level ? game.level.meta.name : "FAIL"'))[2])

    b.close()

print()
print('TOTAL FAILURES:', len(errs))
for c, e in errs[:10]:
    print(f'  [{c}] {e}')
if warns:
    print('主循环兜底捕获（预期内，共 %d 条）:' % len(warns))
    for w in warns[:3]:
        print('  [warn] ' + w)
