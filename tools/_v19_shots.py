# -*- coding: utf-8 -*-
# _v19_shots.py —— v19 星语法师 5 张实机目检截图（playwright + 本地 http.server）
#   1) v19_hero_select.png   标题屏按 C 打开选角面板（左骑士 / 右法师）
#   2) v19_mage_l1.png       ?hero=mage&level=1 法师进 L1（4 心 / 法力条 / 法师帧）
#   3) v19_mage_attack.png   按 J 打出奥术飞弹（等 game.shots 真出现再拍）
#   4) v19_mage_nomana.png   法力清零后按 U（等 manaToast>0，拍「法力不足」提示）
#   5) v19_mage_ult.png      充能置 100 后按 O（等 0.35s 吟唱结束、陨星生成再拍）
# 说明：本脚本只读游戏状态，唯一的写操作是 page.evaluate 手设法力/充能/技能 CD（调试口径）。
# 若 UI/art 尚未合入（选角面板不存在、SPR.mg* 缺失），等待会超时并打印明确失败原因。
import pathlib
import socket
import subprocess
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).parent.parent
OUT = ROOT / 'testshots'
OUT.mkdir(exist_ok=True)
PORT = 8769
BASE = 'http://127.0.0.1:%d/index.html' % PORT
errors = []
server = None


def port_busy():
    try:
        with socket.create_connection(('127.0.0.1', PORT), timeout=0.4):
            return True
    except OSError:
        return False


def start_server():
    global server
    if port_busy():
        raise RuntimeError('端口 %d 已被占用：请先关掉旧的 http.server（本脚本不抢占他人端口）' % PORT)
    server = subprocess.Popen(
        [sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'],
        cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(40):                       # 最多等 8s（python 启动 + 首次握手）
        time.sleep(0.2)
        if server.poll() is not None:
            raise RuntimeError('http.server 启动失败（进程已退出，code=%s）' % server.returncode)
        try:
            with urllib.request.urlopen(BASE, timeout=1) as r:
                if r.status == 200:
                    print('本地服务就绪: %s' % BASE)
                    return
        except OSError:
            pass
    raise RuntimeError('http.server 8s 内未就绪：%s' % BASE)


def stop_server():
    if server and server.poll() is None:
        server.terminate()
        try:
            server.wait(timeout=3)
        except subprocess.TimeoutExpired:
            server.kill()


def shot(pg, name):
    loc = pg.locator('#game')
    if loc.count() == 0:
        raise RuntimeError('页面里没有 #game 画布，无法截图：' + name)
    path = OUT / name
    loc.screenshot(path=str(path))
    print('  截图 ' + name)


def wait_fn(pg, expr, timeout, why):
    try:
        pg.wait_for_function(expr, timeout=timeout)
    except Exception as e:
        raise RuntimeError('%s（等待 %dms 超时：%s）' % (why, timeout, expr)) from e


def open_page(pg):
    pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: errors.append('console.error: ' + m.text) if m.type == 'error' else None)
    pg.set_default_timeout(8000)


try:
    start_server()
    with sync_playwright() as pw:
        br = pw.chromium.launch()
        try:
            pg = br.new_page(viewport={'width': 1280, 'height': 800})
            open_page(pg)

            # ---- 1) 标题屏 → C 选角面板 ----
            pg.goto(BASE, wait_until='load')
            wait_fn(pg, "() => window.game && game.state === 'title'", 8000,
                    '标题屏未进入（ui.boot 未完成 / 脚本报错）')
            pg.wait_for_timeout(500)
            pg.keyboard.press('KeyC')
            pg.wait_for_timeout(500)
            # heroOpen 是 ui.js 的闭包变量，页面外读不到；用「面板几何内是否有法师卡」无法取值，
            # 因此以无 pageerror + 截图为准，并在下一张确认 ?hero=mage 生效。
            shot(pg, 'v19_hero_select.png')

            # ---- 2) 法师 L1 ----
            pg.goto(BASE + '?hero=mage&level=1', wait_until='load')
            wait_fn(pg, "() => window.game && game.level && game.state === 'play' && game.hero === 'mage'",
                    8000, '?hero=mage&level=1 未生效（ui boot 的 HERO_DEBUG 或 startLevel 未注入 mage）')
            pg.wait_for_timeout(900)          # 相机 lerp / 入场淡入
            shot(pg, 'v19_mage_l1.png')

            # ---- 3) J 普攻：等弹体真的出现 ----
            pg.keyboard.press('KeyJ')
            wait_fn(pg, "() => window.game && Array.isArray(game.shots) && game.shots.length > 0",
                    2000, '按 J 后 2s 内没有生成 game.shots（法师普攻未接入 / 键位被覆盖）')
            shot(pg, 'v19_mage_attack.png')

            # ---- 4) 0 法力按 U：等「法力不足」提示 ----
            pg.evaluate("() => { game.mana = 0; game.skills.u = 0; game.manaToast = 0; }")
            pg.keyboard.press('KeyU')
            wait_fn(pg, "() => window.game && game.manaToast > 0", 1500,
                    '0 法力按 U 后没有 manaToast（法力门槛 / nomana 提示未生效）')
            shot(pg, 'v19_mage_nomana.png')

            # ---- 5) O 陨星风暴：等吟唱 0.35s 结束、6 颗 mage 陨星生成 ----
            pg.evaluate("() => { game.ultCharge = 100; game.skills.o = 0; }")
            pg.keyboard.press('KeyO')
            wait_fn(pg,
                    "() => window.game && ((game.ult && game.ult.kind === 'mage') "
                    "|| (game.meteors || []).some(m => m.mage))",
                    2000, '按 O 后没有进入 mage 大招状态（ultCharge 门槛 / O 分支未生效）')
            pg.wait_for_function(
                "() => (game.meteors || []).filter(m => m.mage).length >= 6", timeout=2000)
            pg.wait_for_timeout(180)          # 让陨星从屏顶下落一点，画面里看得见
            shot(pg, 'v19_mage_ult.png')

            print('OK：5 张 v19 目检图已输出到 testshots/')
        finally:
            br.close()
finally:
    stop_server()

if errors:
    print('console/page errors:')
    for e in errors[:10]:
        print('  ' + e)
    sys.exit(1)
