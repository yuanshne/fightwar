"""v28 补拍：Boss 居中特写（五种新招/三只本体）+ 全关开放后的第五章选关。
仅本地目检用。"""
from playwright.sync_api import sync_playwright
import pathlib

OUT = pathlib.Path(__file__).parent / '_shots'
BASE = 'http://localhost:8123/index.html'


def shot(page, name):
    page.locator('#game').screenshot(path=str(OUT / (name + '.png')))
    print('  shot', name)


with sync_playwright() as pw:
    br = pw.chromium.launch(headless=True)
    page = br.new_page(viewport={'width': 960, 'height': 640})
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)

    def enter(lv):
        page.goto(BASE + '?level=%02d' % lv, wait_until='networkidle')
        page.wait_for_function("() => window.game && game.boss && game.state === 'play'", timeout=10000)
        page.wait_for_timeout(150)
        # 贴脸激活后把玩家放回 Boss 侧前 92px，并把镜头中心压在 Boss 身上（截图用）
        page.evaluate("""() => {
          const b = game.boss, p = game.player;
          p.x = Math.max(40, b.x - 92); p.y = b.y + b.h - p.h;
          p.vx = 0; p.vy = 0; p.onGround = true; p.hp = 99; p.invT = 0;
        }""")
        page.wait_for_timeout(300)
        page.wait_for_function("() => game.boss.state === 'idle'", timeout=12000)
        page.evaluate("""() => {
          const b = game.boss, p = game.player;
          p.x = Math.max(40, b.x - 92); p.y = b.y + b.h - p.h;
          game.cam.x = Math.max(0, b.x + b.w / 2 - 192);
          game.cam.y = Math.max(0, b.y - 80);
        }""")
        page.wait_for_timeout(120)

    def force(mv, phase=1, dx=92):
        page.evaluate("""({mv, phase, dx}) => {
          const b = game.boss, p = game.player;
          b.state = 'windup'; b.next = mv; b.t = 0; b.fireN = 0; b.phase = phase;
          b.comboQ = []; b.comboN = 0; b.vx = 0; b.breakT = 0;
          if (b.kind === 14) b.gaze = 0;
          game.bullets.length = 0;
          for (let i = game.hazards.length - 1; i >= 0; i--) {
            if (game.hazards[i].kind !== 'shard') game.hazards.splice(i, 1);
          }
          p.hp = 99; p.invT = 0; p.vx = 0; p.vy = 0; p.onGround = true; p.dashT = 0;
          p.x = Math.max(40, b.x - dx); p.y = b.y + b.h - p.h;
          game.cam.x = Math.max(0, b.x + b.w / 2 - 192);
        }""", {'mv': mv, 'phase': phase, 'dx': dx})

    # L25 断奏 / 全奏 / 延长音
    enter(25)
    shot(page, 'v28_art_25_idle')
    force('staccato'); page.wait_for_timeout(240); shot(page, 'v28_art_25_staccato_windup')
    page.wait_for_timeout(500); shot(page, 'v28_art_25_staccato_cast')
    force('tutti'); page.wait_for_timeout(420); shot(page, 'v28_art_25_tutti_windup')
    page.wait_for_timeout(800); shot(page, 'v28_art_25_tutti_cast')
    force('fermata'); page.wait_for_timeout(300); shot(page, 'v28_art_25_fermata_warn')
    page.wait_for_timeout(620); shot(page, 'v28_art_25_fermata_active')

    # L26 本体 + 镜片 / 棱镜 / 镜雨 / 镜墙实体
    enter(26)
    shot(page, 'v28_art_26_idle')
    force('prism'); page.wait_for_timeout(380); shot(page, 'v28_art_26_prism_windup')
    page.wait_for_timeout(420); shot(page, 'v28_art_26_prism_cast')
    force('rain'); page.wait_for_timeout(460); shot(page, 'v28_art_26_rain_cast')
    force('march'); page.wait_for_timeout(520); shot(page, 'v28_art_26_march_warn')
    page.wait_for_timeout(900); shot(page, 'v28_art_26_march_wall')

    # L27 本体 / 三根青柱 / 光带 / 石牙 / 陨石
    enter(27)
    shot(page, 'v28_art_27_idle')
    force('stare', phase=2, dx=110); page.wait_for_timeout(640); shot(page, 'v28_art_27_stare')
    force('focus', dx=110); page.wait_for_timeout(1050); shot(page, 'v28_art_27_focus')
    force('fracture', dx=110); page.wait_for_timeout(620); shot(page, 'v28_art_27_fracture')
    force('rain', dx=110); page.wait_for_timeout(620); shot(page, 'v28_art_27_rain')

    # 全关开放 → 选关第五章
    page.goto(BASE, wait_until='networkidle')
    page.wait_for_timeout(500)
    page.keyboard.press('f'); page.wait_for_timeout(250)
    page.keyboard.press('Enter'); page.wait_for_timeout(700)
    page.keyboard.press('Digit5'); page.wait_for_timeout(450)
    shot(page, 'v28_art_select_ch5')
    page.keyboard.press('ArrowRight'); page.wait_for_timeout(200)
    page.keyboard.press('ArrowRight'); page.wait_for_timeout(350)
    shot(page, 'v28_art_select_ch5_l27')

    print('页面错误：', errs if errs else '无')
    br.close()
