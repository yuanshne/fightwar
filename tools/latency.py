# -*- coding: utf-8 -*-
# 输入延迟基线/回归测量：N 次跳跃按键 → 统计起跳响应延迟与丢失率
import sys, json
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8765/index.html?level=1'
N = int(sys.argv[2]) if len(sys.argv) > 2 else 30

PROBE = """
() => new Promise(res => {
  const out = [];
  let n = 0;
  function trial() {
    // 等玩家落地稳定
    const waitGround = setInterval(() => {
      if (!game.player.onGround || game.player.dead) return;
      clearInterval(waitGround);
      if (game.player.dead) { out.push(-1); return next(); }
      const t0 = performance.now();
      let answered = false;
      const poll = setInterval(() => {
        if (game.player.vy < -50) { clearInterval(poll); answered = true;
          out.push(Math.round(performance.now() - t0)); next(); }
        else if (performance.now() - t0 > 300) { clearInterval(poll);
          out.push(-1); next(); }  // 丢失
      }, 4);
      window.dispatchEvent(new KeyboardEvent('keydown', {code: 'ArrowUp', key: 'ArrowUp'}));
      setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', {code: 'ArrowUp'})), 120);
    }, 20);
  }
  function next() { n++; if (n >= %d) res(out); else setTimeout(trial, 150); }
  trial();
})
""" % N

RAF144 = (sys.argv[3] if len(sys.argv) > 3 else '') == 'raf144'

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page()
    if RAF144:  # 强制 rAF≈144Hz，物理仍锁 60fps → 复现高刷屏的零步进渲染帧
        pg.add_init_script(
            "window.requestAnimationFrame=f=>setTimeout(()=>f(performance.now()),7);"
        )
    pg.goto(URL)
    pg.wait_for_timeout(1200)
    lat = pg.evaluate(PROBE)
    b.close()

ok = [x for x in lat if x >= 0]
lost = len(lat) - len(ok)
print(json.dumps({
    'trials': len(lat),
    'lost': lost,
    'lost_pct': round(100.0 * lost / max(1, len(lat)), 1),
    'median_ms': sorted(ok)[len(ok)//2] if ok else None,
    'max_ms': max(ok) if ok else None,
}))
