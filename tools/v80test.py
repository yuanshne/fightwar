# -*- coding: utf-8 -*-
"""v8.0 小关内容密度护栏（"小关有点无聊"的回归测试）

背景：v8.0 之前，第二章两关只有 2 个气流机关、第三章小关机关数为 0，
5 个小关全是「跑图 + 稀疏几个怪」。这一版给每个小关补了 2~3 种引擎早已实装
却没被摆出来的机关（吊灯摆锤 / 骑士 / 幽焰法师 / 传送门 / 风柱），并各藏一个可选挑战房。

本脚本只做一件事：把「每关至少 2 类机关、敌人 6~10 只、至少 1 颗宝石」钉成断言，
防止以后有人改关卡时又把机关删回去。它不测手感、不测难度，那些只能人看。

用法：python tools/v80test.py
      需要 D:/python/python.exe（系统 python 没有 playwright）
"""
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

BASE = 'file:///' + str(pathlib.Path(__file__).resolve().parent.parent / 'index.html').replace('\\', '/')

# 需要护栏的小关（Boss 关不在此列）：关卡号 -> 该关主题
SMALL = {11: 'sea', 12: 'sea', 14: 'nether', 15: 'nether', 17: 'nether'}

ok_n = 0
fail = []


def ck(name, cond, detail=''):
    global ok_n
    if cond:
        ok_n += 1
        print('  [OK]  %s  %s' % (name, detail))
    else:
        fail.append(name)
        print('  [FAIL] %s  %s' % (name, detail))


def probe(pg, lv):
    return pg.evaluate("""() => {
      const L = game.level, cnt = {};
      for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
        const c = L.tileAt(x, y); cnt[c] = (cnt[c] || 0) + 1;
      }
      // 机关分类：'w' 气流留在瓦片里；吊灯/传送门被引擎提取成实体；骑士/法师/幽灵/史莱姆走 enemies
      const types = new Set((L.enemies || []).map(e => e.type));
      // '*' 被引擎提取成 L.coins 里 gem:true 的条目（瓦片已清成 '.'），不能靠 tileAt 数
      const gems = (L.coins || []).filter(c => c.gem).length;
      return {
        w: L.w, h: L.h,
        air: cnt['w'] || 0,
        pends: (L.pends || []).length,
        portals: (L.portals || []).length,
        enemies: (L.enemies || []).length,
        etypes: Array.from(types),
        hasKnight: (L.enemies || []).some(e => e.type === 'knight'),
        gems: gems,
        shrines: (L.shrines || []).length,
        theme: L.meta.theme,
      };
    }""")


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        pg = b.new_page(viewport={'width': 1152, 'height': 680})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))

        for lv, theme in SMALL.items():
            pg.goto(BASE + '?level=%d&god=1' % lv)
            pg.wait_for_timeout(700)
            d = probe(pg, lv)
            # 机关种类：气流 / 吊灯 / 传送门 / 骑士 —— 各算一类
            kinds = []
            if d['air'] > 0:
                kinds.append('气流')
            if d['pends'] > 0:
                kinds.append('吊灯')
            if d['portals'] > 0:
                kinds.append('传送门')
            if d['hasKnight']:
                kinds.append('骑士')
            tag = 'L%d' % lv
            ck(tag + ' 机关种类 ≥2（现 %d：%s）' % (len(kinds), '/'.join(kinds) or '无'),
               len(kinds) >= 2, json.dumps(d, ensure_ascii=False))
            lo = 4 if lv == 17 else 6   # 纵向关只有 26 格宽，5 只已经是上限附近
            ck(tag + ' 敌人 %d~10 只' % lo, lo <= d['enemies'] <= 10,
               'enemies=%d %s' % (d['enemies'], d['etypes']))
            ck(tag + ' 至少 1 颗宝石（挑战房回报）', d['gems'] >= 1, 'gems=%d' % d['gems'])
            ck(tag + ' 主题未被改动', d['theme'] == theme, 'theme=' + d['theme'])
            if theme == 'nether':
                ck(tag + ' nether 关有灯笼（黑暗层里机关要看得见）',
                   pg.evaluate('() => (game.level.lanterns || []).length >= 4'),
                   'lanterns=%d' % pg.evaluate('() => (game.level.lanterns || []).length'))

        # 吊灯危险框：L11 至少 1 盏，且渲染时四边 fillRect 被调用（用 tick 计数间接验证不可能，
        # 改为断言"吊灯数 > 0 且 SPR.chandBlade 存在"——视觉那部分只能人看，已截图存档）
        pg.goto(BASE + '?level=11&god=1')
        pg.wait_for_timeout(600)
        ck('L11 吊灯实体与锤素材齐备',
           pg.evaluate('() => (game.level.pends || []).length >= 1 && !!SPR.chandBlade'),
           'pends=%d' % pg.evaluate('() => (game.level.pends || []).length'))

        # L17 井壁：左右各一列整列实心，否则纵向关没有方向参照
        pg.goto(BASE + '?level=17&god=1')
        pg.wait_for_timeout(600)
        wall = pg.evaluate("""() => {
          const L = game.level; let l = 0, r = 0;
          for (let y = 0; y <= L.h - 3; y++) { if (L.solid(0, y)) l++; if (L.solid(L.w - 1, y)) r++; }
          return { l: l, r: r, h: L.h - 2 };
        }""")
        ck('L17 左右井壁连续贯通', wall['l'] == wall['h'] and wall['r'] == wall['h'],
           json.dumps(wall))

        ck('全程零 pageerror', not errs, str(errs[:2]))
        b.close()

    print('')
    if fail:
        print('v8.0 小关密度：失败 %d 项: %s' % (len(fail), ', '.join(fail)))
        sys.exit(1)
    print('v8.0 小关密度：%d 项全过' % ok_n)


if __name__ == '__main__':
    main()
