# -*- coding: utf-8 -*-
"""
_qa_v54_common.py —— 独立 QA 线 v54 共享模块（只读源码，只写 .screenshots/qa 与 tools/_qa_v54_*）。

提供：
  - 路径常量（基线 .snap_before 冻结副本 / 主目录 index.html）
  - 骑士 20 套 / 法师 19 套皮肤 id 清单（顺序同 art.js HERO_SKINS，不可变契约）
  - Boss 关卡号 ↔ kind 映射
  - playwright 页面/错误收集、存档注入、帧尺寸审计、截图、Boss 状态钉住
"""
import json
import pathlib

ROOT = pathlib.Path(r'C:\Users\A\Desktop\youxi')
BEFORE_HTML = ROOT / '.snap_before' / 'index.html'
AFTER_HTML = ROOT / 'index.html'

QA_DIR = ROOT / '.screenshots' / 'qa'
BEFORE_DIR = QA_DIR / 'before'
AFTER_DIR = QA_DIR / 'after'
BEFORE_DIR.mkdir(parents=True, exist_ok=True)
AFTER_DIR.mkdir(parents=True, exist_ok=True)

# 骑士 20 套（blue 默认 + 19 套掉落；顺序 = art.js HERO_SKINS）
KNIGHT_SKINS = [
    'blue', 'sprout', 'crystal', 'azure', 'steel', 'ember', 'ivory', 'starcore',
    'jade', 'sunset', 'nebula', 'abyss', 'coral', 'tide', 'wraith', 'magma',
    'judge', 'spectra', 'holy', 'inferno',
]
# 法师换色皮肤：blue 走本命 mg* 帧（getMageSkin 返回 null），其余 19 套映射骑士调色板
MAGE_SKINS = KNIGHT_SKINS[1:]

# Boss 关号 → kind 1..14（kind 5 圣裁者 = L18 第二棒，同场地接力）
BOSS_LEVEL_KIND = [
    (7, 1), (13, 2), (16, 3), (18, 4), (18, 5), (20, 6), (21, 7),
    (23, 8), (24, 9), (26, 10), (27, 11), (28, 12), (30, 13), (31, 14),
]
BOSS_LEVELS = sorted({lv for lv, _ in BOSS_LEVEL_KIND})

# 普通关冒烟抽样（非 Boss 街机/平台关）
NORMAL_LEVELS = [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 14, 15, 17]

PY = r'D:\python\python.exe'


def file_url(html_path: pathlib.Path) -> str:
    return 'file:///' + str(html_path).replace('\\', '/')


def seed_profile(hero='knight', skin='blue', equip=None, inv=None, skins=None,
                 unlock_all=True):
    """构造 pq_progress 存档注入体。equip={w,h,c}；inv=[{id,slot,r}]。"""
    if equip is None:
        equip = {'w': -1, 'h': -1, 'c': -1}
    if inv is None:
        inv = []
    if skins is None:
        skins = list(KNIGHT_SKINS)
    return {
        'unlocked': 31,
        'stars': {str(i): 3 for i in range(31)},
        'equip': dict(equip),
        'inv': list(inv),
        'shards': {},
        'nextId': 2,
        'unlockAll': unlock_all,
        'skin': skin,
        'skins': skins,
        'hero': hero,
    }


def new_context(pw, headless=True):
    br = pw.chromium.launch(headless=headless)
    pg = br.new_page(viewport={'width': 1280, 'height': 800})
    errors = {'pageerror': [], 'console_error': []}

    def on_pageerror(e):
        errors['pageerror'].append(str(e))

    def on_console(m):
        if m.type == 'error':
            errors['console_error'].append(m.text)

    pg.on('pageerror', on_pageerror)
    pg.on('console', on_console)
    return br, pg, errors


def inject_progress(pg, profile):
    pg.evaluate("(p) => { try { localStorage.setItem('pq_progress', JSON.stringify(p)); } catch(e) {} }",
                profile)


def goto_level(pg, html_path, level=None, hero=None, profile=None, wait=1800):
    """注入存档后带 ?level=NN&hero=xx&god=1 进关。god=1 吞掉玩家击杀，便于目检。"""
    if profile is None:
        profile = seed_profile(hero=hero or 'knight')
    inject_progress(pg, profile)
    url = file_url(html_path)
    params = []
    if level is not None:
        params.append('level=%d' % level)
    if hero:
        params.append('hero=%s' % hero)
    params.append('god=1')
    if params:
        url += '?' + '&'.join(params)
    pg.goto(url)
    pg.wait_for_timeout(wait)


def shot(pg, out_path: pathlib.Path):
    out_path.parent.mkdir(parents=True, exist_ok=True)
    pg.locator('#game').screenshot(path=str(out_path))
    return str(out_path)


# ---------- 帧尺寸审计 ----------

# 顶层主角帧键（SPR.hero*）
HERO_KEYS = ['heroIdle1', 'heroIdle2', 'heroJump', 'heroFall', 'heroAttack',
             'heroDash', 'heroSquash', 'heroDashWind', 'heroAttackGold']
# 顶层法师帧键（SPR.mg*）
MAGE_KEYS = ['mgIdle1', 'mgIdle2', 'mgJump', 'mgFall', 'mgAttack', 'mgCast', 'mgDash']

_AUDIT_JS = r"""
(skinIds) => {
  function dim(v) {
    if (v == null) return null;
    if (Array.isArray(v)) v = v[0];
    if (v && typeof v.width === 'number') return { w: v.width, h: v.height };
    return null;
  }
  const spr = (typeof SPR !== 'undefined') ? SPR : null;
  const out = { top: {}, heroSkins: {}, mageSkins: {}, missing: [], flags: {} };
  if (!spr) { out.missing.push('SPR 未定义'); return out; }
  const heroKeys = __HERO_KEYS__;
  const mageKeys = __MAGE_KEYS__;
  heroKeys.forEach(k => out.top['hero.' + k] = dim(spr[k]));
  mageKeys.forEach(k => out.top['mage.' + k] = dim(spr[k]));

  const hasHero = (typeof getHeroSkin === 'function');
  const hasMage = (typeof getMageSkin === 'function');
  if (!hasHero) out.missing.push('getHeroSkin 未定义');
  if (!hasMage) out.missing.push('getMageSkin 未定义');

  skinIds.forEach(id => {
    if (hasHero) {
      try {
        const f = getHeroSkin(id);
        if (!f) { out.heroSkins[id] = null; return; }
        out.heroSkins[id] = {
          idle1: dim(f.idle1), idle2: dim(f.idle2),
          run: Array.isArray(f.run) ? f.run.map(dim) : dim(f.run),
          attack: dim(f.attack), jump: dim(f.jump), fall: dim(f.fall),
        };
      } catch (e) { out.heroSkins[id] = { error: String(e) }; }
    }
    if (hasMage) {
      try {
        const f = getMageSkin(id);
        if (!f) { out.mageSkins[id] = null; return; }  // blue 本命配色回落 null 属预期
        out.mageSkins[id] = {
          idle1: dim(f.idle1), idle2: dim(f.idle2),
          run: Array.isArray(f.run) ? f.run.map(dim) : dim(f.run),
          attack: dim(f.attack), cast: dim(f.cast),
        };
      } catch (e) { out.mageSkins[id] = { error: String(e) }; }
    }
  });

  // 就绪标记（三条新皮肤/动画线的窗口契约）
  out.flags = {
    heroSkinAI: !!(window.PQ_HERO_SKIN_AI && window.PQ_HERO_SKIN_AI.ready),
    mageSkinAI: !!(window.PQ_MAGE_SKIN_AI && window.PQ_MAGE_SKIN_AI.ready),
    bossAnim: !!(window.PQ_BOSS_ANIM && window.PQ_BOSS_ANIM.ready),
    bossGalleryReady: !!window.PQAI_BOSS_GALLERY_READY,
    mageReady: !!window.PQAI_MAGE_READY,
  };
  return out;
}
""".replace('__HERO_KEYS__', json.dumps(HERO_KEYS)).replace('__MAGE_KEYS__', json.dumps(MAGE_KEYS))


def audit_frames(pg, skin_ids=None):
    if skin_ids is None:
        skin_ids = KNIGHT_SKINS
    return pg.evaluate(_AUDIT_JS, skin_ids)


def summarize_16x16(audit: dict):
    """统计 16×16（旧 bug 帧）与非 32×38 的帧清单。返回 (count16, list)。"""
    bad = []

    def scan(d, path):
        if isinstance(d, dict):
            if 'w' in d and 'h' in d:
                if d['w'] == 16 and d['h'] == 16:
                    bad.append(path + ' = 16x16')
                elif d['w'] != 32 or d['h'] != 38:
                    bad.append('%s = %sx%s' % (path, d['w'], d['h']))
            else:
                for k, v in d.items():
                    scan(v, '%s.%s' % (path, k))
        elif isinstance(d, list):
            for i, v in enumerate(d):
                scan(v, '%s[%d]' % (path, i))

    scan(audit.get('top', {}), 'top')
    scan(audit.get('heroSkins', {}), 'hero')
    scan(audit.get('mageSkins', {}), 'mage')
    return len([b for b in bad if b.endswith('= 16x16')]), bad


# ---------- Boss 状态钉住 ----------

# 每只 Boss 强制前摇用的招名（优先该 kind 表里存在的招；兜底 barrage）
BOSS_FORCE_NEXT = {
    1: 'leap', 2: 'barrage', 3: 'scythe', 4: 'breath', 5: 'halo', 6: 'charge',
    7: 'flare', 8: 'weight', 9: 'spawn', 10: 'web', 11: 'pendulum',
    12: 'staccato', 13: 'prism', 14: 'stare',
}


_CAM_BODY = r"""
  const L = game.level || {};
  const maxX = Math.max(0, (L.w || 24) * 16 - 384);
  const maxY = Math.max(0, (L.h || 14) * 16 - 224);
  game.cam.x = Math.max(0, Math.min(maxX, b.x + b.w / 2 - 192));
  game.cam.y = Math.max(0, Math.min(maxY, b.y + b.h / 2 - 112));
"""


def freeze_boss(pg, kind, state='idle', t=0.0, next_move=None):
    """进关后把 game.boss 钉到指定状态；玩家移到 Boss 旁、相机对准 Boss，免伤。"""
    if next_move is None:
        next_move = BOSS_FORCE_NEXT.get(kind, 'barrage')
    return pg.evaluate(
        """(args) => {
          const b = game.boss; if (!b) return { ok: false };
          b.kind = args.kind;
          b.hidden = false; b.dead = false;
          b.state = args.state; b.t = args.t; b.next = args.next;
          b.phase = 1; b.flashT = 0; b.coreOn = false; b.parryOn = false;
          const p = game.player;
          if (p) { p.x = b.x - 70; p.y = b.y + b.h - p.h; p.vx = 0; p.vy = 0;
                   p.dead = false; p.invT = 99; }
__CAM_BODY__
          return { ok: true, kind: b.kind, state: b.state, next: b.next,
                   x: Math.round(b.x), y: Math.round(b.y), w: b.w, h: b.h,
                   camX: Math.round(game.cam.x), camY: Math.round(game.cam.y) };
        }""".replace('__CAM_BODY__', _CAM_BODY),
        {'kind': kind, 'state': state, 't': t, 'next': next_move})


def install_boss_hold(pg, kind, state, next_move):
    """16ms 间隔持续钉住 Boss 状态/玩家位/相机，防止引擎自动推进到 cast（同 _v12 做法）。"""
    pg.evaluate(
        """(args) => {
          if (window.__qaHold) clearInterval(window.__qaHold);
          window.__qaHold = setInterval(() => {
            const b = game.boss; if (!b) return;
            b.kind = args.kind; b.hidden = false;
            b.state = args.state; b.next = args.next;
            const p = game.player;
            if (p) { p.x = b.x - 70; p.y = b.y + b.h - p.h; p.dead = false; p.invT = 99; }
__CAM_BODY__
          }, 16);
        }""".replace('__CAM_BODY__', _CAM_BODY),
        {'kind': kind, 'state': state, 'next': next_move})


def clear_boss_hold(pg):
    pg.evaluate("() => { if (window.__qaHold) { clearInterval(window.__qaHold); window.__qaHold = null; } }")


def setup_character(pg, world_x=170, world_y=180):
    """平台关内把玩家放到屏幕中部偏左（相机跟随玩家），供角色姿态目检。"""
    return pg.evaluate(
        """(args) => {
          const p = game.player; if (!p) return false;
          p.x = args.x; p.y = args.y; p.vx = 0; p.vy = 0;
          p.onGround = true; p.dead = false; p.invT = 99; p.dashT = 0;
          return { x: Math.round(p.x), y: Math.round(p.y) };
        }""",
        {'x': world_x, 'y': world_y})


def boss_view_box(pg):
    """返回 Boss 在 VIEW(384×224) 坐标系的包围盒（用于局部像素比对）。"""
    return pg.evaluate(
        """() => { const b = game.boss; if (!b) return null;
          return { x: Math.round(b.x), y: Math.round(b.y), w: b.w, h: b.h }; }""")


def write_json(obj, path: pathlib.Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding='utf-8')
