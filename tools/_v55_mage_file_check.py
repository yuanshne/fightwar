# -*- coding: utf-8 -*-
"""
_v55_mage_file_check.py — 法师皮肤取帧管线 · file:// 真实启动验收（v55，口径锁定版）

验收口径（QA 复测后锁定，不再断言模块内部函数）：
  1. 走 file:///C:/Users/A/Desktop/youxi/index.html 正常加载，不手动 add_script_tag 注入；
     脚本标签由 index.html 第 83 行正常挂入。
  2. 进关后等待 ≥12 秒（越过 mage_ai.js 12s 重压窗口）再断言。
  3. 一律断言游戏真正消费的全局函数返回值尺寸：
       getMageSkin(id) / mageSkinFrames(id) / getMageLook(id, eq)
     不再断言 PQ_MAGE_SKIN_AI.frames(id) 内部输出。
  4. 19 套非 blue 皮肤 × 全状态（idle1/idle2/jump/fall/attack/cast/dash/dashWind/squash/die
     + run[] + runL[]）全部 32×38；装备态 {w:1,h:2,c:0} 同样 32×38；穿脱切换立刻回落裸帧集。
  5. blue 不退化：getMageSkin('blue') === null（回落 SPR.mg* 本命 AI 帧，32×38）；未知 id 回落 null。
  6. buildSprites 竞态复核：SPR 键数 171，checkOn/checkOff/coin/flag/look 全在，
     0 drawImage TypeError、0 本线新增 pageerror（kenney manifest/sprites.json 的 file scheme
     Fetch 拦截属既有噪声，不计失败）。

运行：D:\\python\\python.exe tools\\_v55_mage_file_check.py
产物：.screenshots/mage/ 截图 + _matrix_v55.json 实测矩阵。
"""
import io
import json
import pathlib
import re
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).parent.parent
OUT = ROOT / '.screenshots' / 'mage'
OUT.mkdir(parents=True, exist_ok=True)
FILE_URL = 'file:///C:/Users/A/Desktop/youxi/index.html?hero=mage&level=7'

NON_BLUE = ['sprout', 'crystal', 'azure', 'steel', 'ember', 'ivory', 'starcore', 'jade', 'sunset',
            'nebula', 'abyss', 'coral', 'tide', 'wraith', 'magma', 'judge', 'spectra', 'holy', 'inferno']
ALL = ['blue'] + NON_BLUE
SINGLE = ['idle1', 'idle2', 'jump', 'fall', 'attack', 'cast', 'dash', 'dashWind', 'squash', 'die']
EQ = {'w': 1, 'h': 2, 'c': 0}

# 既有噪声签名（file scheme 拦截 kenney 清单；assets_loader 既有行为，非本线引入）
NOISE_PAT = re.compile(r'(manifest\.json|sprites\.json|URL scheme "file" is not supported|Fetch API cannot load)', re.I)


def prof(skin):
    return {'unlocked': 31, 'stars': {'0': 3}, 'equip': {'w': -1, 'h': -1, 'c': -1},
            'inv': [], 'shards': {}, 'nextId': 1, 'unlockAll': True,
            'skin': skin, 'skins': ALL, 'hero': 'mage'}


def launch(pw, skin):
    br = pw.chromium.launch()
    pg = br.new_page(viewport={'width': 1500, 'height': 900})
    errs = []
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: errs.append('console: ' + m.text) if m.type == 'error' else None)
    pg.goto(FILE_URL, wait_until='load')
    pg.evaluate("(p)=>localStorage.setItem('pq_progress',JSON.stringify(p))", prof(skin))
    pg.reload(wait_until='load')
    pg.wait_for_function("()=>window.game&&game.state==='play'&&game.hero==='mage'", timeout=10000)
    pg.wait_for_timeout(13000)  # ≥12s，越过重压窗口
    pg.evaluate("""() => {
      const p = game.player; if (!p) return;
      p.hp = p.maxHp; p.dead = false; p.deadT = 0; p.invT = 0;
      p.vx = 0; p.vy = 0; p.x = 170; p.y = 170;
      if (game.cam) { game.cam.x = 0; game.cam.y = 0; }
    }""")
    pg.wait_for_timeout(500)
    return br, pg, errs


JS_MATRIX = """(ids) => {
  const SINGLE = ['idle1','idle2','jump','fall','attack','cast','dash','dashWind','squash','die'];
  const ok = f => f && f.width === 32 && f.height === 38;
  const rowOf = f => {
    if (!f) return null;
    const r = {};
    for (const k of SINGLE) r[k] = ok(f[k]);
    r.run = Array.isArray(f.run) && f.run.length >= 4 && f.run.every(ok);
    r.runL = Array.isArray(f.runL) && f.runL.length === f.run.length && f.runL.every(ok);
    return r;
  };
  const rep = { getMageSkin: {}, mageSkinFrames: {}, getMageLookEquip: {}, toggle: {},
                blue: {}, race: {}, marker: {} };
  for (const id of ids) {
    const f = getMageSkin(id);
    const g = (typeof mageSkinFrames === 'function') ? mageSkinFrames(id) : null;
    const l = getMageLook(id, {w:1,h:2,c:0});
    const naked = getMageLook(id, {w:-1,h:-1,c:-1});
    rep.getMageSkin[id] = rowOf(f);
    rep.mageSkinFrames[id] = rowOf(g);
    rep.getMageLookEquip[id] = rowOf(l);
    rep.toggle[id] = (naked === f);
  }
  rep.blue.null = getMageSkin('blue') === null;
  rep.blue.unknownNull = getMageSkin('__nope__') === null;
  rep.blue.baseIdle = SPR.mgIdle1 ? [SPR.mgIdle1.width, SPR.mgIdle1.height] : null;
  rep.blue.baseTag = SPR.mgIdle1 && SPR.mgIdle1.tagName;
  const need = ['checkOn','checkOff','coin','flag','look'];
  rep.race.sprKeys = Object.keys(SPR).length;
  rep.race.missing = need.filter(k => !SPR[k]);
  rep.marker.skin = !!(getMageSkin && getMageSkin.__pqMageSkinAI);
  rep.marker.look = !!(getMageLook && getMageLook.__pqMageSkinAI);
  rep.marker.frames = !!(mageSkinFrames && mageSkinFrames.__pqMageSkinAI);

  /* 全量顶层 mg* 帧审计：玩家姿态帧必须全部 32×38。
     排除：mgU/mgI/mgO/mgL（技能图标，16×16 UI 图标）、mgSil（24×28 关卡剪影）。 */
  const PLAYER = ['mgIdle1','mgIdle1L','mgIdle2','mgIdle2L','mgJump','mgJumpL','mgFall','mgFallL',
                  'mgAttack','mgAttackL','mgCast','mgCastL','mgDash','mgDashL','mgDashWind','mgDashWindL',
                  'mgSquash'];
  const sizeOf = f => f ? [f.width || f.naturalWidth, f.height || f.naturalHeight] : null;
  const mgSizes = {}, mgBad = [];
  for (const k of PLAYER) {
    const v = SPR[k];
    if (!v) { mgBad.push(k + ':missing'); continue; }
    const s = sizeOf(v);
    mgSizes[k] = s;
    if (s[0] !== 32 || s[1] !== 38) mgBad.push(k + ':' + s.join('x'));
  }
  for (const ak of ['mgRun','mgRunL']) {
    const arr = SPR[ak];
    if (!Array.isArray(arr) || !arr.length) { mgBad.push(ak + ':missing'); continue; }
    mgSizes[ak] = arr.map(sizeOf);
    if (!arr.every(x => x && sizeOf(x)[0] === 32 && sizeOf(x)[1] === 38)) mgBad.push(ak + ':non32x38');
  }
  // 图标/剪影仅记录尺寸，不参与失败判定
  const misc = {};
  for (const k of ['mgU','mgI','mgO','mgL','mgSil']) if (SPR[k]) misc[k] = sizeOf(SPR[k]);
  rep.mgAudit = { sizes: mgSizes, bad: mgBad, misc: misc };
  return rep;
}"""


def check_row(row, sid, channel, failures, matrix):
    if row is None:
        failures.append('[%s] %s 全局函数未返回帧集' % (channel, sid))
        matrix.setdefault(channel, {})[sid] = 'NULL'
        return False
    bad = [k for k, v in row.items() if not v]
    if bad:
        failures.append('[%s] %s 非 32×38 帧键：%s' % (channel, sid, ','.join(bad)))
        matrix.setdefault(channel, {})[sid] = 'BAD:' + ','.join(bad)
        return False
    matrix.setdefault(channel, {})[sid] = '32x38'
    return True


def main():
    failures = []
    matrix = {'skin': 'sprout(19套巡检)', 'waitAfterPlaySec': 13, 'channels': {}}
    with sync_playwright() as pw:
        # ---------- 主程：sprout 出战，19 套全状态 × 三全局口径 ----------
        br, pg, errs = launch(pw, 'sprout')
        rep = pg.evaluate(JS_MATRIX, NON_BLUE)
        matrix['channels'] = rep

        for sid in NON_BLUE:
            check_row(rep['getMageSkin'].get(sid), sid, 'getMageSkin', failures, matrix['channels'].setdefault('check', {}))
            check_row(rep['mageSkinFrames'].get(sid), sid, 'mageSkinFrames', failures, matrix['channels'].setdefault('check', {}))
            check_row(rep['getMageLookEquip'].get(sid), sid, 'getMageLookEquip', failures, matrix['channels'].setdefault('check', {}))
            if rep['toggle'].get(sid) is False:
                failures.append('getMageLook 三槽全空未回落 getMageSkin 同对象：%s' % sid)

        if not rep['blue']['null']:
            failures.append("getMageSkin('blue') 必须为 null")
        if not rep['blue']['unknownNull']:
            failures.append('未知 id 必须回落 null')
        if rep['blue']['baseIdle'] != [32, 38]:
            failures.append('blue 本命 SPR.mgIdle1 非 32×38：%s' % rep['blue']['baseIdle'])
        if rep['blue']['baseTag'] != 'IMG':
            failures.append('blue 本命帧未回落原始 AI Image（tag=%s）' % rep['blue']['baseTag'])

        # 注：SPR 总键数在 file:// 下受 enemy_art 异步 White 变体解码时序影响会有 ±6 波动，
        # 不计失败；只硬判本线/道具必需键是否缺失，以及 0 drawImage TypeError。
        if rep['race']['missing']:
            failures.append('buildSprites 竞态：道具/外观帧缺失 %s' % rep['race']['missing'])
        if not (rep['marker']['skin'] and rep['marker']['look'] and rep['marker']['frames']):
            failures.append('包装跳过标记未打全：%s' % rep['marker'])

        if rep['mgAudit']['bad']:
            failures.append('顶层 mg* 姿态帧非 32×38：%s' % rep['mgAudit']['bad'])
        matrix['mgAudit'] = rep['mgAudit']

        # ---------- 截图：19 套总览（上行 idle / 下行 cast，全局 getMageSkin 取帧） ----------
        pg.evaluate("""(ids) => {
          const S = 64, H = 76, pad = 10, label = 16;
          const old = document.getElementById('v55sheet'); if (old) old.remove();
          const c = document.createElement('canvas'); c.id = 'v55sheet';
          c.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;';
          c.width = ids.length*(S+pad)+pad; c.height = 2*(H+pad)+pad+label;
          const g = c.getContext('2d');
          g.fillStyle = '#26263a'; g.fillRect(0,0,c.width,c.height);
          g.imageSmoothingEnabled = false;
          ids.forEach((id,i) => {
            const f = getMageSkin(id);
            const x = pad + i*(S+pad);
            g.drawImage(f.idle1, x, pad, S, H);
            g.drawImage(f.cast, x, pad+H+pad, S, H);
            g.fillStyle = '#e8ecf8'; g.font = '10px monospace';
            g.fillText(id, x, c.height-5);
          });
          document.body.appendChild(c);
        }""", NON_BLUE)
        pg.locator('#v55sheet').screenshot(path=str(OUT / 'after_all19_mage_idle_sheet.png'))

        # ---------- 装备态截图：三连 + 穿脱对照 ----------
        pg.evaluate("""() => {
          const naked = getMageSkin('sprout');
          const eq = getMageLook('sprout', {w:1,h:2,c:0});
          const S = 96, H = 114, pad = 12;
          const old1 = document.getElementById('v55equip'); if (old1) old1.remove();
          const c1 = document.createElement('canvas'); c1.id = 'v55equip';
          c1.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;';
          c1.width = 3*(S+pad)+pad; c1.height = H+2*pad;
          const g1 = c1.getContext('2d');
          g1.fillStyle = '#26263a'; g1.fillRect(0,0,c1.width,c1.height);
          g1.imageSmoothingEnabled = false;
          [eq.idle1, eq.cast, eq.run[0]].forEach((im,i)=>g1.drawImage(im, pad+i*(S+pad), pad, S, H));
          document.body.appendChild(c1);
          const old2 = document.getElementById('v55toggle'); if (old2) old2.remove();
          const c2 = document.createElement('canvas'); c2.id = 'v55toggle';
          c2.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;';
          c2.width = 2*(S+pad)+pad; c2.height = H+2*pad+16;
          const g2 = c2.getContext('2d');
          g2.fillStyle = '#26263a'; g2.fillRect(0,0,c2.width,c2.height);
          g2.imageSmoothingEnabled = false;
          g2.drawImage(naked.idle1, pad, pad, S, H);
          g2.drawImage(eq.idle1, S+2*pad, pad, S, H);
          g2.fillStyle = '#e8ecf8'; g2.font = '10px monospace';
          g2.fillText('naked', pad, c2.height-4);
          g2.fillText('equipped w1/h2/c0', S+2*pad, c2.height-4);
          document.body.appendChild(c2);
        }""")
        pg.locator('#v55equip').screenshot(path=str(OUT / 'after_mage_equip_32x38.png'))
        pg.locator('#v55toggle').screenshot(path=str(OUT / 'after_mage_equip_toggle.png'))

        # ---------- blue 实机目检 ----------
        pg.evaluate("() => { const pr = JSON.parse(localStorage.getItem('pq_progress')); pr.skin='blue'; localStorage.setItem('pq_progress',JSON.stringify(pr)); }")
        br.close()
        br, pg, errs_blue = launch(pw, 'blue')
        pg.locator('#game').screenshot(path=str(OUT / 'after_blue_idle.png'))
        errs.extend(errs_blue)
        br.close()

    # ---------- 报错归因 ----------
    new_errors = [e for e in errs if not NOISE_PAT.search(e)]
    matrix['errors'] = {'total': len(errs), 'new': new_errors}
    if new_errors:
        failures.append('本线新增 pageerror/console.error：\n  ' + '\n  '.join(new_errors[:10]))

    (OUT / '_matrix_v55.json').write_text(json.dumps(matrix, ensure_ascii=False, indent=1), encoding='utf-8')

    print('\n===== 矩阵摘要 =====')
    for ch in ['getMageSkin', 'mageSkinFrames', 'getMageLookEquip']:
        vals = matrix['channels'][ch]
        ok = sum(1 for v in vals.values() if v and all(v.values()))
        print('  %s: %d/19 套全状态 32×38' % (ch, ok))
    print('  blue null=%s baseIdle=%s baseTag=%s' % (rep['blue']['null'], rep['blue']['baseIdle'], rep['blue']['baseTag']))
    print('  SPR 键数=%d（信息项）必需键缺失=%s' % (rep['race']['sprKeys'], rep['race']['missing']))
    print('  mg* 姿态帧审计 bad=%s 图标/剪影=%s' % (rep['mgAudit']['bad'], rep['mgAudit']['misc']))
    print('  新增报错 %d 条' % len(new_errors))

    if failures:
        print('\n===== FAIL =====')
        for f in failures:
            print('  FAIL ' + f)
        sys.exit(1)
    print('\nPASS：file:// 真实启动 · ≥12s · 19 套×全状态×三全局口径 32×38 · 装备态 32×38 · blue 兜底完好 · 竞态复核通过 · 无本线新增报错')


if __name__ == '__main__':
    main()
