# -*- coding: utf-8 -*-
# _v17_shots.py —— v17 装饰交互目检截图（playwright + file://）
#   L2 洞窟：石笋（harm 触碰扣血）/ 水晶（pick 收集）/ 圆石（break 攻击打碎）
# 教训（首版踩坑）：
#   1) playwright evaluate 返回的对象是 JSON 快照不是活引用——断言要在页内现场重取；
#   2) updateWorld 的 gate 在 ui 层（uiState），必须按 Enter 走真实流程进关；
#   3) 跨 evaluate 依赖 interval 状态太脆——每个阶段自包含：单次 evaluate 内
#      重取活对象 + 自钉 + 采样 + 清理。
import pathlib
from playwright.sync_api import sync_playwright

BASE = 'file:///C:/Users/A/.zcode/workspace/draft-6e5b5889-432a-4c7b-aabe-13a594a464ac/pixel-quest/index.html'
OUT = pathlib.Path(__file__).parent.parent / 'testshots'
OUT.mkdir(exist_ok=True)
errors = []

with sync_playwright() as p:
    br = p.chromium.launch()
    pg = br.new_page(viewport={'width': 960, 'height': 600})
    pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: errors.append('console.error: ' + m.text) if m.type == 'error' else None)
    pg.goto(BASE, wait_until='load')
    pg.wait_for_timeout(700)
    for _ in range(3):                       # 标题→选关→进 L1（uiState='play' 主循环才推帧）
        pg.keyboard.press('Enter')
        pg.wait_for_timeout(300)

    # 进 L2，收集三个目标的坐标（JSON 快照只用来打印；断言一律页内重取）
    info = pg.evaluate("""() => {
      loadLevel(1, false);
      game.paused=false; game.puzzleActive=false;
      game.level.enemies.length=0; game.bullets.length=0; game.hazards.length=0;
      const L=game.level;
      const pick=(cls,type)=>L.decorFx.find(d=>{const H=_ENG_DECOR_HIT[d.type];return H.cls===cls&&(!type||d.type===type);});
      const s=pick('harm','stalagmite'), c=pick('pick'), b=pick('break','boulder');
      return {nFx:L.decorFx.length, nDecor:L.decor.length,
              s:{x:s.x,y:s.y}, c:{x:c.x,y:c.y}, b:{x:b.x,y:b.y}};
    }""")
    print('decorFx', info['nFx'], '/ decor', info['nDecor'],
          '| 石笋@(%d,%d) 水晶@(%d,%d) 圆石@(%d,%d)' % (info['s']['x'], info['s']['y'], info['c']['x'], info['c']['y'], info['b']['x'], info['b']['y']))

    # --- ① 旁观：钉在石笋左侧 70px，0.4s 内不掉血不捡币 ---
    r = pg.evaluate("""() => new Promise(res => {
      const L=game.level, p=game.player;
      const s=L.decorFx.find(d=>_ENG_DECOR_HIT[d.type]&&_ENG_DECOR_HIT[d.type].cls==='harm');
      if(window.__iv)clearInterval(window.__iv);
      const pin=setInterval(()=>{p.x=s.x-70; p.y=s.y-p.h-1; p.vx=0; p.vy=0;},16);
      const hp0=p.hp, c0=game.coins;
      setTimeout(()=>{clearInterval(pin); window.__iv=null;
        res({hp:p.hp, hp0, coins:game.coins, c0});},400);
    })""")
    print('① 旁观 0.4s: hp %s→%s coins %s→%s ——预期全不变' % (r['hp0'], r['hp'], r['c0'], r['coins']))
    pg.evaluate("""() => { const L=game.level,p=game.player;
      const s=L.decorFx.find(d=>_ENG_DECOR_HIT[d.type]&&_ENG_DECOR_HIT[d.type].cls==='harm');
      p.x=s.x-70; p.y=s.y-p.h-1; }""")
    pg.wait_for_timeout(150)
    pg.screenshot(path=str(OUT / '_v17_l2_overview.png'))

    # --- ② 踩石笋：掉 1 心；无敌帧窗口内不连扣 ---
    r = pg.evaluate("""() => new Promise(res => {
      const L=game.level, p=game.player;
      const s=L.decorFx.find(d=>_ENG_DECOR_HIT[d.type]&&_ENG_DECOR_HIT[d.type].cls==='harm');
      if(window.__iv)clearInterval(window.__iv);
      const pin=setInterval(()=>{p.x=s.x-3; p.y=s.y-p.h-1; p.vx=0;},16);   // 钉进石笋格
      p.invT=0;
      const hp0=p.hp; let n=0;
      const iv=setInterval(()=>{
        if(p.hp<hp0||++n>40){
          clearInterval(iv);
          const hurt=p.hp, inv=p.invT;               // 掉血瞬间快照
          let k=0; const hpA=p.hp;
          const iv2=setInterval(()=>{                 // 无敌帧内原地不连扣
            if(++k>18){clearInterval(iv2);clearInterval(pin);
              res({hp0, hurt, after:p.hp, invT:+inv.toFixed(2), invAfter:+p.invT.toFixed(2)});}
          },16);
        }
      },16);
    })""")
    print('② 踩石笋: hp %s→%s（0.3s 后 %s），invT=%.2f→%.2f ——预期掉 1 心且不连扣'
          % (r['hp0'], r['hurt'], r['after'], r['invT'], r['invAfter']))
    # 拍照姿势：把玩家挪到刺旁边（钉在刺上会每 1s 被扎一次，截图慢半拍就拍到家破人亡）
    pg.evaluate("""() => { const L=game.level,p=game.player;
      const s=L.decorFx.find(d=>_ENG_DECOR_HIT[d.type]&&_ENG_DECOR_HIT[d.type].cls==='harm');
      if(window.__iv)clearInterval(window.__iv);
      window.__iv=setInterval(()=>{p.x=s.x-56; p.y=s.y-p.h-1; p.vx=0; p.vy=0;},16); }""")
    pg.wait_for_timeout(120)
    pg.screenshot(path=str(OUT / '_v17_l2_spike_hurt.png'))

    # --- ③ 收水晶：+1 币；已捡不重复 ---
    r = pg.evaluate("""() => new Promise(res => {
      const L=game.level, p=game.player;
      const c=L.decorFx.find(d=>_ENG_DECOR_HIT[d.type]&&_ENG_DECOR_HIT[d.type].cls==='pick');
      if(window.__iv)clearInterval(window.__iv);
      const pin=setInterval(()=>{p.x=c.x-1; p.y=c.y-p.h-1; p.vx=0; p.vy=0; p.invT=0;},16);  // 压在水晶上
      const c0=game.coins; let n=0;
      const iv=setInterval(()=>{
        if(game.coins>c0||++n>40){
          clearInterval(iv);
          const got=c.got, co=game.coins;
          let k=0;
          const iv2=setInterval(()=>{
            if(++k>18){clearInterval(iv2);clearInterval(pin);
              res({c0, coins:co, got, after:game.coins, sfx:game.sfxQueue.join(',')});}
          },16);
        }
      },16);
    })""")
    print('③ 收水晶: coins %s→%s got=%s（0.3s 后 %s）sfx[%s] ——预期 +1 且不重复'
          % (r['c0'], r['coins'], r['got'], r['after'], r['sfx']))
    # 拍照姿势：挪到下一颗没捡过的水晶旁边（刚那颗已 got 消失，画面上没东西可看）
    pg.evaluate("""() => { const L=game.level,p=game.player;
      const c2=L.decorFx.find(d=>_ENG_DECOR_HIT[d.type]&&_ENG_DECOR_HIT[d.type].cls==='pick'&&!d.got);
      if(window.__iv)clearInterval(window.__iv);
      if(c2)window.__iv=setInterval(()=>{p.x=c2.x-40; p.y=c2.y-p.h-1; p.vx=0; p.vy=0;},16); }""")
    pg.wait_for_timeout(200)
    pg.screenshot(path=str(OUT / '_v17_l2_crystal_pick.png'))

    # --- ④ 打圆石：碎 + 币 + 连击；已碎不再渲染 ---
    r = pg.evaluate("""() => {
      const L=game.level, p=game.player;
      if(window.__iv)clearInterval(window.__iv);
      const b=L.decorFx.find(d=>d.type==='boulder');   // 现场重取活对象
      p.invT=0; p.x=b.x-16; p.y=b.y-p.h-1; p.vx=0; p.vy=0; p.face=1;
      const c0=game.coins, cb=game.combo|0;
      p.atkT=0.12; p.atkSeq++;
      _engResolveAttack(L,p);
      return {dead:!!b.dead, dCoins:game.coins-c0, dCombo:(game.combo|0)-cb,
              gone:L.decorFx.filter(d=>d.got||d.dead).length};
    }""")
    print('④ 打圆石: dead=%s +%d币 +%d连击 已交互装饰 %d 个' % (r['dead'], r['dCoins'], r['dCombo'], r['gone']))
    pg.wait_for_timeout(250)
    pg.evaluate("""() => { const L=game.level,p=game.player;
      const b=L.decorFx.find(d=>d.type==='boulder');
      p.x=b.x-46; p.y=b.y-p.h-1; }""")
    pg.wait_for_timeout(200)
    pg.screenshot(path=str(OUT / '_v17_l2_boulder_gone.png'))

    br.close()

print('errors =', len(errors), errors[:3])
