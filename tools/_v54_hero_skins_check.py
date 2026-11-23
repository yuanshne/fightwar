# -*- coding: utf-8 -*-
"""_v54_hero_skins_check.py — 骑士 20 套皮肤 32×38 AI 染色帧 + 永久守卫验收自测。

覆盖：
  A. 20 套皮肤每套 idle/run/jump/fall/attack/dash/cast(attackGold)/die(fall) 帧齐全，
     帧尺寸全部 32×38；blue 现状帧保持 32×38 不退化。
  B. 不同皮肤可区分：每套 idle1 主装甲色与其余皮肤平均色距离 > 阈值（非全灰、非同色）。
  C. 永久守卫：模拟 sprites_external 回流（顶层 hero* 与皮肤缓存被写成 16×16 / 删除），
     常驻看门狗 1 秒内复位回 32×38 AI 帧；getHeroSkin 仍返回 AI 缓存对象。
  D. 加载 15 秒后再取帧，主角帧仍是 32×38。
  E. 全程零 pageerror；console error 仅允许基线已存在的 file:// Kenney fetch 失败。

用法：
  D:/python/python.exe tools/_v54_hero_skins_check.py
截图输出：.screenshots/hero/（before/after 成对 + 20 套拼图 + 守卫验证图）
"""
import base64
import io
import json
import pathlib
import sys

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SNAP = ROOT / '.snap_before' / 'index.html'
OUT = ROOT / '.screenshots' / 'hero'
OUT.mkdir(parents=True, exist_ok=True)

SKINS = ["blue", "sprout", "crystal", "azure", "steel", "ember", "ivory",
         "starcore", "jade", "sunset", "nebula", "abyss", "coral", "tide",
         "wraith", "magma", "judge", "spectra", "holy", "inferno"]
PROF = {"unlocked": 24, "stars": {}, "skin": "sprout", "skins": SKINS}
STATES = ["idle1", "run", "jump", "fall", "attack", "dash", "cast", "die"]

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


def game_url(level=7):
    return 'file:///' + str(ROOT / 'index.html').replace('\\', '/') + '?level=%d' % level


def snap_url(level=7):
    return 'file:///' + str(SNAP).replace('\\', '/') + '?level=%d' % level


def inject_progress(pg):
    pg.evaluate("(p) => localStorage.setItem('pq_progress', JSON.stringify(p))", PROF)


def load_after(pg, wait_ready=True):
    pg.goto(game_url())
    inject_progress(pg)
    pg.reload()
    pg.wait_for_timeout(1800)
    # 优先使用 index.html 已挂的 <script src="hero_skin_ai.js"> 标签（在 ai_sprites/hero_anim 之后）；
    # 若标签缺失（并行开发期间），测试环境兜底手动注入同序脚本。
    has_mod = pg.evaluate("() => !!window.PQ_HERO_SKIN_AI")
    if not has_mod:
        pg.evaluate("""() => new Promise((res) => {
          var s = document.createElement('script');
          s.src = 'hero_skin_ai.js';
          s.onload = res; s.onerror = res;
          document.body.appendChild(s);
        })""")
    if wait_ready:
        pg.wait_for_function(
            "() => window.PQ_HERO_SKIN_AI && window.PQ_HERO_SKIN_AI.ready === true", timeout=8000)
        pg.wait_for_timeout(300)


FRAME_CHECK_JS = """() => {
  const out = {};
  function szOf(v) { const c = Array.isArray(v) ? v[0] : v;
    return c && c.width ? (c.width + 'x' + c.height) : 'null'; }
  function opaqueOf(v) { const c = Array.isArray(v) ? v[0] : v; if (!c) return 0;
    try { const cx = c.getContext('2d'); const d = cx.getImageData(0, 0, c.width, c.height).data;
      let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++; return n; }
    catch (e) { return -1; } }
  function avgOf(v) { const c = Array.isArray(v) ? v[0] : v; if (!c) return null;
    try { const cx = c.getContext('2d'); const d = cx.getImageData(0, 0, c.width, c.height).data;
      let r=0,gg=0,b=0,n=0;
      for (let i=0;i<d.length;i+=4){
        if(d[i+3]>128){
          const rr=d[i], ggg=d[i+1], bb=d[i+2], mx=Math.max(rr,ggg,bb), mn=Math.min(rr,ggg,bb);
          if(mx<70 || mx-mn<25 || mn>200) continue; // 排除描边/深色、灰阶、白色高光与肤色
          r+=rr; gg+=ggg; b+=bb; n++;
        }
      }
      return n? [Math.round(r/n),Math.round(gg/n),Math.round(b/n)] : null; }
    catch (e) { return null; } }
  for (const s of HERO_SKINS) {
    const f = getHeroSkin(s.id);
    out[s.id] = {
      idle1: szOf(f.idle1), run: szOf(f.run), jump: szOf(f.jump), fall: szOf(f.fall),
      attack: szOf(f.attack), dash: szOf(f.dash), cast: szOf(f.attackGold), die: szOf(f.fall),
      runN: Array.isArray(f.run) ? f.run.length : 0,
      atkN: Array.isArray(f.attackFrames) ? f.attackFrames.length : 0,
      opaque: opaqueOf(f.idle1), avg: avgOf(f.idle1)
    };
  }
  return out;
}"""

TAMPER_JS = """() => {
  // 模拟 sprites_external.applyPatch 回流：顶层 hero* 与皮肤缓存被写成 16×16 / 删除。
  function fake16() { const c = document.createElement('canvas'); c.width=16; c.height=16; return c; }
  SPR.heroIdle1 = fake16(); SPR.heroIdle2 = fake16();
  SPR.heroRun = [fake16(), fake16()]; SPR.heroJump = fake16(); SPR.heroFall = fake16();
  SPR.heroAttack = fake16(); SPR.heroDash = fake16(); SPR.heroSquash = fake16();
  try { delete SPR.skins.sprout; } catch (e) {}
  SPR.skins.sprout = { idle1: fake16() };
  return 'tampered';
}"""

RESTORE_CHECK_JS = """() => {
  const sz = v => { const c = Array.isArray(v) ? v[0] : v;
    return c && c.width ? (c.width + 'x' + c.height) : 'null'; };
  const sprout = getHeroSkin('sprout');
  return {
    heroIdle1: sz(SPR.heroIdle1), heroRun: sz(SPR.heroRun),
    sproutIdle: sz(sprout.idle1),
    sproutIsCache: sprout === (window.PQ_HERO_SKIN_AI && window.PQ_HERO_SKIN_AI.frames('sprout')),
    cached: SPR.skins.sprout ? sz(SPR.skins.sprout.idle1) : 'none'
  };
}"""

EXPORT_JS = """() => {
  const out = {};
  for (const s of HERO_SKINS) {
    const f = getHeroSkin(s.id);
    const pick = k => { const c = f[k]; const img = Array.isArray(c) ? c[0] : c;
      if (!img) return null;
      try { return img.toDataURL('image/png'); } catch (e) { return null; } };
    out[s.id] = { idle: pick('idle1'), run: pick('run'), attack: pick('attack'),
                  jump: pick('jump'), fall: pick('fall'), dash: pick('dash'),
                  cast: pick('attackGold') };
  }
  return out;
}"""


def compose_sheet(data, path, scale=2):
    cols, rows, cell = 5, 4, 84
    sheet = Image.new('RGB', (cols * cell, rows * cell), (32, 36, 58))
    dr = ImageDraw.Draw(sheet)
    for i, sid in enumerate(SKINS):
        entry = data.get(sid) or {}
        b64 = entry.get('idle')
        x0, y0 = (i % cols) * cell, (i // cols) * cell
        if not b64:
            dr.text((x0 + 4, y0 + cell - 12), sid + ' (n/a)', fill=(160, 160, 180))
            continue
        im = Image.open(io.BytesIO(base64.b64decode(b64.split(',')[1]))).convert('RGBA')
        im = im.resize((32 * scale, 38 * scale), Image.NEAREST)
        sheet.paste(im, (x0 + (cell - 64) // 2, y0 + 4), im)
        dr.text((x0 + 4, y0 + cell - 12), sid, fill=(255, 255, 255))
    sheet.save(path)


def compose_states(data, sid, path):
    states = ['idle', 'run', 'attack', 'jump', 'fall', 'dash', 'cast']
    sheet = Image.new('RGB', (len(states) * 80, 100), (32, 36, 58))
    dr = ImageDraw.Draw(sheet)
    entry = data[sid]
    for j, st in enumerate(states):
        b64 = entry.get(st)
        if not b64:
            dr.text((j * 80 + 8, 40), st + ' n/a', fill=(160, 160, 180))
            continue
        im = Image.open(io.BytesIO(base64.b64decode(b64.split(',')[1]))).convert('RGBA')
        im = im.resize((64, 76), Image.NEAREST)
        sheet.paste(im, (j * 80 + 8, 4), im)
        dr.text((j * 80 + 8, 84), st, fill=(255, 255, 255))
    sheet.save(path)


def known_kenney_error(msg):
    return ('kenney' in msg) or ('sprites.json' in msg) or ('manifest.json' in msg) or ('file://' in msg and 'Fetch' in msg)


def normalize_err(msg):
    import re
    s = msg.lower()
    s = re.sub(r'file:///\S+', '', s)
    s = re.sub(r':\d+(:\d+)?', '', s)
    return ' '.join(s.split())


def main():
    with sync_playwright() as pw:
        br = pw.chromium.launch()

        # ---------------- before：基线快照（旧 16×16 程序化帧） ----------------
        pg0 = br.new_page(viewport={'width': 1024, 'height': 768})
        errs0 = []
        pg0.on('pageerror', lambda e: errs0.append(str(e)))
        pg0.goto(snap_url())
        inject_progress(pg0)
        pg0.reload()
        pg0.wait_for_timeout(1800)
        before = pg0.evaluate(EXPORT_JS)
        ck('基线快照可导出 20 套帧', len(before) == 20, str(len(before)))
        compose_sheet(before, OUT / 'before_all20_skin_idle_sheet.png', scale=4)
        compose_states(before, 'sprout', OUT / 'before_skin_sprout_run_attack.png')
        pg0.locator('#game').screenshot(path=str(OUT / 'before_skin_sprout_idle.png'))
        pg0.close()

        # ---------------- 主目录既有错误基线（不注入本模块） ----------------
        pgB = br.new_page()
        base_cerr = []
        pgB.on('console', lambda m: base_cerr.append(m.text) if m.type == 'error' else None)
        pgB.goto(game_url())
        pgB.wait_for_timeout(3000)
        baseline_set = {normalize_err(m) for m in base_cerr if not known_kenney_error(m)}
        pgB.close()

        # ---------------- after：主目录新管线 ----------------
        pg = br.new_page(viewport={'width': 1024, 'height': 768})
        page_errors = []
        console_errors = []
        pg.on('pageerror', lambda e: page_errors.append(str(e)))
        pg.on('console', lambda m: console_errors.append(m.text) if m.type == 'error' else None)
        load_after(pg)

        # A. 帧齐全 + 32×38
        frames = pg.evaluate(FRAME_CHECK_JS)
        ck('20 套皮肤全部可取帧', len(frames) == 20, str(len(frames)))
        for sid in SKINS:
            f = frames.get(sid)
            if not f:
                ck(sid + ' 取帧', False, '缺失')
                continue
            bad = [st for st in STATES if f[st] != '32x38']
            ck('%s 全状态 32×38' % sid, not bad and f['opaque'] != 0,
               '缺/异常: %s, 透明像素 %d（-1=file 源污染不可采样，blue 豁免）' % (','.join(bad), f['opaque']))
            ck('%s run≥4 帧 / attackFrames=3' % sid, f['runN'] >= 4 and f['atkN'] == 3,
               'run=%d atk=%d' % (f['runN'], f['atkN']))

        # B. 皮肤间可区分（平均装甲色距离，已剔除描边/灰阶/白色高光）
        avgs = {s: frames[s]['avg'] for s in SKINS if frames[s]['avg']}
        distinct = True
        worst = 1e9
        ids = list(avgs.keys())
        for i in range(len(ids)):
            for j in range(i + 1, len(ids)):
                a, b = avgs[ids[i]], avgs[ids[j]]
                d = sum(abs(a[k] - b[k]) for k in range(3))
                worst = min(worst, d)
                if d < 18:
                    distinct = False
        ck('不同皮肤主色可区分（最小 RGB 距离 ≥18）', distinct, 'minDist=%.1f' % worst)

        # 截图：局内 + 拼图 + 多状态
        pg.locator('#game').screenshot(path=str(OUT / 'after_skin_sprout_idle.png'))
        after = pg.evaluate(EXPORT_JS)
        compose_sheet(after, OUT / 'after_all20_skin_idle_sheet.png', scale=2)
        compose_states(after, 'sprout', OUT / 'after_skin_sprout_run_attack.png')

        # C. 永久守卫：模拟回流 → 看门狗复位
        pg.evaluate(TAMPER_JS)
        pg.wait_for_timeout(200)  # 看门狗周期 1s，先记录被污染态
        tampered = pg.evaluate(RESTORE_CHECK_JS)
        ck('回流注入生效（顶层曾变 16×16）', tampered['heroIdle1'] == '16x16', json.dumps(tampered))
        pg.wait_for_timeout(1300)  # 等看门狗一轮
        restored = pg.evaluate(RESTORE_CHECK_JS)
        ck('看门狗复位顶层 heroIdle1 为 32×38', restored['heroIdle1'] == '32x38', json.dumps(restored))
        ck('看门狗复位 heroRun 为 32×38', restored['heroRun'] == '32x38', restored['heroRun'])
        ck('皮肤缓存复位 32×38 且命中 AI 缓存',
           restored['sproutIdle'] == '32x38' and restored['sproutIsCache'] is True,
           json.dumps(restored))
        pg.locator('#game').screenshot(path=str(OUT / 'after_guard_restored.png'))

        # D. 15 秒持久化
        print('  …等待 15 秒验证长期持久化')
        pg.wait_for_timeout(15000)
        late = pg.evaluate(FRAME_CHECK_JS)
        late_bad = []
        for sid in SKINS:
            f = late.get(sid)
            if not f or any(f[st] != '32x38' for st in STATES):
                late_bad.append(sid)
        ck('15 秒后全部皮肤帧仍为 32×38', not late_bad, '异常: ' + ','.join(late_bad))
        late_top = pg.evaluate(RESTORE_CHECK_JS)
        ck('15 秒后顶层 hero* 仍 32×38',
           late_top['heroIdle1'] == '32x38' and late_top['heroRun'] == '32x38', json.dumps(late_top))
        pg.locator('#game').screenshot(path=str(OUT / 'after_guard_15s_32x38.png'))

        # E. 错误检查
        ck('零 pageerror', len(page_errors) == 0, '; '.join(page_errors[:3]))
        new_console = [m for m in console_errors
                       if not known_kenney_error(m) and normalize_err(m) not in baseline_set]
        ck('无新增 console error（既有基线错误与 file:// Kenney fetch 除外）', not new_console,
           '; '.join(new_console[:3]))
        if console_errors:
            print('  基线已有 console error（file:// Kenney fetch）: %d 条' % len(console_errors))

        br.close()

    print('\n=== v54 骑士皮肤验收: %d OK / %d FAIL ===' % (ok_n, len(fail)))
    if fail:
        print('失败项: ' + ', '.join(fail))
        sys.exit(1)


if __name__ == '__main__':
    main()
