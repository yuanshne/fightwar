// ============================================================
// levels.js —— 关卡构建 DSL + 六大关卡 + 几何断言
// 契约：纯数据，无任何行为逻辑；导出 LG / LEVELS / validateLevels
// 字符表见 docs/CONTRACT.md 第 2 节
// 路线 walkthrough 注释在各 build 内
// ============================================================
'use strict';

class LG{
  constructor(w,h){this.w=w;this.h=h;
    this.g=Array.from({length:h},()=>Array(w).fill('.'));}
  set(x,y,ch){if(x>=0&&x<this.w&&y>=0&&y<this.h)this.g[y][x]=ch;return this;}
  fill(x0,y0,x1,y1,ch){for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)this.set(x,y,ch);return this;}
  ground(x0,x1,topY,fillY){return this.fill(x0,topY,x1,fillY===undefined?this.h-1:fillY,'#');}
  plat(x0,x1,y){for(let x=x0;x<=x1;x++)this.set(x,y,'=');return this;}
  row(x0,x1,y,ch){for(let x=x0;x<=x1;x++)this.set(x,y,ch);return this;}
  coins(x0,x1,y){return this.row(x0,x1,y,'o');}
  coinArc(cx,y,n){
    for(let i=0;i<n;i++){const t=i/(n-1)-0.5;
      this.set(cx+i,y-Math.round((1-(t*t)*4)*2.2),'o');}
    return this;}
  stairs(x,y,steps,dir){
    for(let i=0;i<steps;i++)for(let j=0;j<=i;j++)
      this.set(x+i*dir,y-j,'#');
    return this;}
}

const LEVELS=[
// ---------- L1 草原：移动/跳跃/金币/史莱姆/弹簧（全程安全，沟底有底） ----------
{ name:'1 · 草原初试', theme:'grass', par:40, hint:'←→ 移动，长按跳跃键跳得更高',
  w:100,h:14,
  build(g){const H=g.h-1;
    // 路线：平地→教学小沟→史莱姆草场→平台采币→弹簧上高台→宽沟弹簧飞跃→双史莱姆→台阶→终点
    g.ground(0,11,H-1); g.set(2,H-2,'@');
    g.coins(5,8,H-3);
    g.ground(12,13,H,H);            // 1 格深教学沟（有底）
    g.ground(14,36,H-1); g.set(20,H-2,'W'); g.coins(16,18,H-4);
    g.set(33,H-2,'S');              // 弹簧上高空平台(触点200px→顶点110px,平台top=128px)
    g.plat(30,36,8); g.coinArc(33,6,5);
    g.ground(39,46,H-1); g.set(42,H-2,'W');
    g.coins(40,45,H-4);
    g.ground(47,49,H,H);            // 2 格沟
    g.ground(50,58,H-1);
    g.plat(52,56,H-3); g.set(54,H-5,'*');    // 宝石：平台跳两下拿到
    g.set(58,H-2,'S');
    g.ground(59,64,H,H);            // 宽沟：弹簧飞跃（底部安全）
    g.coins(60,63,H-2);
    g.ground(65,80,H-1);
    g.set(69,H-2,'W'); g.set(75,H-2,'W');
    g.coinArc(70,H-3,5);
    g.stairs(81,H-1,3,1);
    g.ground(84,99,H-3);
    g.coins(85,88,H-5);
    g.set(94,H-4,'P');
    return g;}},

// ---------- L2 洞窟：尖刺/崩塌桥/蝙蝠/钥匙门/检查点（先下后上） ----------
{ name:'2 · 幽暗洞窟', theme:'cave', par:70, hint:'崩塌砖踩久会掉，尖刺即死；拿钥匙开终点门',
  w:110,h:20,
  build(g){const H=g.h-1;
    // 路线：高地→三层平台下行→底部尖刺走廊→崩塌桥→双史莱姆→检查点→爬台取钥匙→
    //       高台→蝙蝠平台→回底→尖刺跳段→开门→终点
    g.ground(0,10,H-4); g.set(2,H-5,'@');
    g.coins(4,7,H-6);
    g.plat(13,16,H-6); g.plat(19,22,H-3); g.plat(13,16,H);  // 逐级下行
    g.ground(11,30,H); g.row(23,26,H,'^');                  // 尖刺坑（绕行或平台跳）
    g.set(19,H-1,'F');
    g.plat(22,27,H-2); g.coins(22,27,H-3);                  // 越刺天桥
    g.ground(31,31,H-2);                                    // 崩塌桥栈桥头柱
    g.row(32,39,H-2,'C'); g.row(33,38,H,'^');               // 崩塌桥下是尖刺池
    g.set(35,H-4,'F');
    g.ground(40,52,H);
    g.set(41,H-1,'W'); g.set(47,H-1,'W');
    g.coins(43,46,H-2);
    g.set(50,H-1,'c');                                      // 检查点①
    // 钥匙密室：三段上跳
    g.plat(52,54,H-2); g.plat(56,58,H-4); g.plat(52,54,H-6);
    g.fill(56,H-8,58,H-7,'#');
    g.set(57,H-9,'K'); g.coins(52,54,H-7);
    // 密室右跳出高台
    g.ground(60,72,H-7); g.set(62,H-8,'F');
    g.plat(64,68,H-9); g.coins(64,68,H-10);
    // 下行回底部
    g.plat(73,75,H-5);
    g.ground(76,109,H);
    g.row(84,86,H,'^'); g.row(95,97,H,'^');
    g.plat(83,88,H-2); g.coins(83,88,H-3);                  // 越刺平台
    g.set(91,H-1,'W'); g.set(100,H-1,'W');
    g.coinArc(92,H-3,5);
    g.fill(103,H-4,103,H-1,'#');                            // 单宽门墙
    g.set(103,H-3,'D'); g.set(103,H-2,'D');
    g.set(106,H-1,'P');
    return g;}},

// ---------- L3 天空：云岛/横移平台/弹簧链/崩塌台阶（坠落即死） ----------
{ name:'3 · 天空栈道', theme:'sky', par:65, hint:'移动平台可以站人，别怕等它；脚下就是云端',
  w:120,h:14,
  build(g){const H=g.h-1;
    // 路线：云岛连跳→双横移平台→弹簧上双层（宝石支线）→崩塌三台阶→检查点岛→
    //       三横移平台串→蝙蝠岛→双弹簧塔→史莱姆长岛→横移平台→终点岛
    g.ground(0,8,H-2); g.set(2,H-3,'@');
    g.coins(4,6,H-4);
    g.ground(11,14,H-2); g.set(13,H-3,'W');
    g.ground(17,19,H-2); g.coinArc(15,H-4,3);
    g.set(24,H-3,'M'); g.set(30,H-3,'M');                   // 横移平台过深远云谷
    g.ground(34,38,H-2); g.set(35,H-3,'S');
    g.plat(30,38,6); g.coins(30,38,5);
    g.set(31,4,'*');                          // 宝石:平台左端起跳两格
    g.ground(40,44,H-2); g.set(41,H-3,'F');
    g.row(47,48,H-2,'C'); g.row(51,52,H-3,'C'); g.row(55,56,H-4,'C'); // 崩塌台阶
    g.coinArc(52,H-6,4);
    g.ground(59,63,H-4); g.set(60,H-5,'W'); g.set(62,H-5,'c');        // 检查点
    g.set(67,H-5,'M'); g.set(73,H-4,'M'); g.set(67,H-2,'M');
    g.coins(68,71,H-6);
    g.ground(77,80,H-3); g.set(78,H-4,'F');
    g.set(80,9,'S'); g.plat(79,81,6); g.set(80,5,'S'); // 双弹簧塔
    g.plat(78,82,1); g.coins(78,82,0);
    g.ground(86,93,H-3); g.set(88,H-4,'W'); g.set(91,H-4,'W');
    g.set(96,H-3,'M');
    g.ground(100,119,H-2);
    g.coins(102,105,H-4);
    g.set(115,H-3,'P');
    return g;}},

// ---------- L4 工厂：拉杆切换/传送带/大炮/横锯/竖锯（双检查点） ----------
{ name:'4 · 齿轮工厂', theme:'factory', par:85, hint:'拉杆切换橙色/蓝色砖块；小心炮弹与电锯',
  w:120,h:18,
  build(g){const H=g.h-1;
    // 路线：拉杆①开蓝桥过刺谷→史莱姆→检查点①→逆行传送带(顶有吊刺)→高台炮→
    //       横锯走廊(双锯+歇脚台)→拉杆②过蓝门→橙桥高路→双炮夹缝(平台腾挪)→
    //       检查点②→竖锯井三段爬→顶层夹层传送带→终点
    g.ground(0,12,H-1); g.set(2,H-2,'@');
    g.set(5,H-2,'L');                       // 拉杆①：橙墙(13-14)虚化，蓝桥(15-20,H-3)成路
    g.fill(13,H-5,14,H-1,'a');
    g.row(15,20,H-3,'b'); g.row(15,20,H,'^');
    g.coins(16,19,H-5);
    g.ground(21,28,H-1); g.set(24,H-2,'W'); g.set(28,H-2,'c');   // 检查点①
    g.row(31,36,H-1,'('); g.row(31,36,H-4,'v');                  // 逆行传送带+吊刺
    g.coins(32,35,H-3);
    g.ground(37,44,H-1);
    g.fill(40,H-5,42,H-5,'#'); g.set(41,H-6,'>');                // 高台炮(惩罚跳跃)
    g.coins(37,39,H-2);
    g.fill(45,H-6,52,H-6,'#');                                   // 横锯走廊顶棚
    g.ground(45,52,H-1);
    g.set(47,H-2,'Z'); g.set(51,H-2,'Z');
    g.plat(45,47,H-3); g.plat(50,52,H-3);                        // 歇脚台
    g.coins(45,52,H-4);
    g.ground(53,60,H-1); g.set(55,H-2,'L');                      // 拉杆②：蓝门(61-62)虚化放行
    g.fill(61,H-4,62,H-1,'b');
    g.ground(63,68,H-1); g.row(63,68,H-5,'a');                   // 橙桥高路(装饰/备用)
    g.coins(63,68,H-6);
    g.ground(69,84,H-1);
    g.set(72,H-2,'<'); g.set(80,H-2,'<');                        // 双炮对射
    g.plat(73,76,H-3); g.plat(78,81,H-5);
    g.coins(73,76,H-4); g.coins(78,81,H-6);
    g.set(84,H-2,'c');                                           // 检查点②
    g.fill(85,H-1,99,H-1,'#');                                   // 竖锯井底部
    g.set(87,H-4,'U');
    g.plat(88,90,H-3); g.plat(92,94,H-5); g.plat(96,98,H-7);     // 三段爬升
    g.set(95,H-6,'F');
    g.coins(92,94,H-6); g.coins(96,98,H-8);
    g.fill(85,H-12,93,H-12,'#');            // 顶层地板(94-99留弹簧井)
    g.set(97,H-8,'S');                      // 弹簧井:弹上顶层传送带
    g.row(100,112,H-12,'(');                // 逆行传送带冲刺
    g.ground(100,119,H-9);
    g.set(116,H-10,'P');
    g.coins(105,110,H-11);
    return g;}},

// ---------- L5 熔岩：熔岩海弹簧岛链/崩塌桥/横锯/竖锯（三检查点） ----------
{ name:'5 · 烈焰深渊', theme:'lava', par:95, hint:'熔岩即死！弹簧链是你的生命线',
  w:130,h:16,
  build(g){const H=g.h-1;
    // 路线：熔岩海①(弹簧双岛+蝙蝠)→检查点①→崩塌桥+中柱横锯→检查点②→
    //       双炮+越刺平台→熔岩海②(弹簧双岛+宝石支线)→检查点③→
    //       熔岩上栈道+双竖锯+两段爬→终点岛
    g.ground(0,8,H-1); g.set(2,H-2,'@');
    g.coins(4,7,H-3);
    g.row(9,27,H,'~');                      // 熔岩海①
    g.fill(11,12,H-2,H-1,'#'); g.set(11,H-3,'S');
    g.fill(16,18,H-3,H-1,'#'); g.coins(15,18,H-4);
    g.fill(22,24,H-2,H-1,'#'); g.set(23,H-3,'S');
    g.set(20,H-5,'F');
    g.ground(28,36,H-1); g.set(30,H-2,'W'); g.set(34,H-2,'c');   // 检查点①
    g.row(37,52,H,'~');                     // 熔岩海②
    g.row(38,42,H-3,'C'); g.fill(43,H-4,44,H-1,'#'); g.row(46,50,H-3,'C');
    g.set(48,H-5,'Z');                      // 桥上方巡逻横锯
    g.coins(38,42,H-5);
    g.ground(53,60,H-1); g.set(55,H-2,'W'); g.set(58,H-2,'c');   // 检查点②
    g.ground(61,74,H-1);                    // 炮台夹缝段
    g.set(63,H-2,'<');
    g.fill(71,H-5,73,H-5,'#'); g.set(72,H-6,'<');
    g.fill(66,H-1,68,H,'.'); g.row(66,68,H,'^');   // 挖穿地板的尖刺坑
    g.plat(65,69,H-3); g.coins(65,69,H-4);         // 越刺平台
    g.row(75,88,H,'~');                     // 熔岩海③
    g.fill(78,79,H-2,H-1,'#'); g.set(78,H-3,'S');
    g.fill(84,85,H-4,H-1,'#'); g.set(84,H-5,'S');
    g.set(81,H-6,'F'); g.set(86,H-7,'*');   // 宝石在弹跳弧线上
    g.plat(80,83,H-8); g.coins(80,83,H-9);
    g.ground(89,96,H-1); g.set(91,H-2,'W'); g.set(94,H-2,'c');   // 检查点③
    g.row(97,110,H,'~');                    // 终局：熔岩上的栈道
    g.fill(97,H-1,110,H-1,'#');
    g.set(99,H-4,'U'); g.set(106,H-4,'U');  // 双竖锯贴身
    g.plat(100,102,H-3); g.plat(104,106,H-5);
    g.coins(100,102,H-4); g.coins(104,106,H-6);
    g.ground(111,129,H-1);
    g.set(116,H-2,'W');
    g.set(126,H-2,'P');
    return g;}},

// ---------- L6 高塔：纵向登顶，全机关综合（双检查点+钥匙门） ----------
{ name:'6 · 最终之塔', theme:'tower', par:150, hint:'登顶吧！拉杆、电锯、大炮、钥匙门全都会来',
  w:44,h:36,
  build(g){const H=g.h-1;   // H=35，行号小=更高
    // 路线：底层拉杆过蓝桥→横锯场→弹簧上平台→蝙蝠平台→检查点①→
    //       之字爬(竖锯骚扰)→检查点②→右上双炮台→弹簧上甲板→甲板取钥开门→
    //       浮空阶梯→塔顶终点旗（行号越小越高，弹簧极限5.6格已核算）
    g.ground(0,43,H-1); g.set(3,H-2,'@');
    g.set(8,H-2,'L');                          // 拉杆：橙墙虚化+蓝桥成路
    g.fill(12,H-5,13,H-1,'a');
    g.row(14,19,H-3,'b'); g.row(14,19,H,'^');  // 蓝桥=地面2格上
    g.coins(15,18,H-4);
    g.ground(20,27,H-1); g.set(22,H-2,'W'); g.set(26,H-2,'S');
    g.plat(24,28,H-6); g.set(25,H-7,'W'); g.coinArc(26,H-7,5);
    g.set(32,H-10,'F');
    g.plat(30,34,H-9); g.coins(30,34,H-10);
    g.plat(36,39,H-12); g.set(38,H-13,'c');    // 检查点①
    g.plat(33,35,H-15);
    g.plat(29,31,H-17); g.set(23,H-17,'U');    // 之字爬+竖锯
    g.plat(25,27,H-19);
    g.plat(21,23,H-21);
    g.plat(25,27,H-23); g.coins(25,27,H-24);
    g.fill(28,H-24,33,H-23,'#'); g.set(30,H-25,'c');  // 检查点②(2格厚悬空ledge)
    g.fill(36,H-26,40,H-26,'#'); g.set(37,H-27,'>');  // 右炮台①
    g.fill(29,H-28,33,H-28,'#'); g.set(30,H-29,'<');  // 左炮台②
    g.coins(32,34,H-27);
    // 上层甲板：弹簧(39,H-27)弹至弧线顶点(row≈3.4)左漂落甲板(top row5)
    g.fill(24,5,33,6,'#');                     // 甲板(2格厚)
    g.set(39,H-27,'S');
    g.set(27,4,'K'); g.set(30,4,'W'); g.coins(31,33,4);
    g.fill(25,1,25,4,'#');                     // 门墙(4高,塔顶不可跳越)
    g.set(25,3,'D'); g.set(25,4,'D');
    g.stairs(23,4,3,-1);                       // 浮空阶梯(23,4)(22,3)(21,2)
    g.fill(13,2,20,2,'#');                     // 塔顶平台
    g.coins(13,19,1);
    g.set(15,1,'P');
    return g;}},
];

// ---------- 几何断言（尽力而为的静态检查；误报优于漏报，但不得误报正常设计） ----------
function validateLevels(){
  const SOLIDISH=new Set(['#','I','a','b','C','D']);
  const STAND=new Set(['#','I','a','b','C','D','=','(',')']);
  const errs=[],warns=[];
  for(let li=0;li<LEVELS.length;li++){
    const meta=LEVELS[li];
    if(!meta.build)continue;
    const g=new LG(meta.w,meta.h);
    meta.build(g);
    const gr=g.g,w=g.w,h=g.h;
    const at=(x,y)=>(x<0||x>=w)?'#':(y<0||y>=h)?'.':gr[y][x];
    const isStand=(x,y)=>STAND.has(at(x,y))&&!STAND.has(at(x,y-1));
    // 1) 出生点/终点唯一且有支撑
    let nAt=0,nP=0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      if(gr[y][x]==='@'){nAt++;
        let sup=false;for(let d=1;d<=2;d++)if(SOLIDISH.has(at(x,y+d)))sup=true;
        if(!sup)errs.push('L'+(li+1)+' 出生点('+x+','+y+')下方2格内无支撑');}
      if(gr[y][x]==='P'){nP++;
        let sup=false;for(let d=1;d<=3;d++)if(STAND.has(at(x,y+d)))sup=true;
        if(!sup)errs.push('L'+(li+1)+' 终点('+x+','+y+')下方3格内无支撑');}
    }
    if(nAt!==1)errs.push('L'+(li+1)+' 出生点数量='+nAt+'(应为1)');
    if(nP!==1)errs.push('L'+(li+1)+' 终点数量='+nP+'(应为1)');
    // 2) 同行可站立面之间的间隙
    for(let y=0;y<h;y++){
      let segs=[];let run=-1;
      for(let x=0;x<w;x++){
        const stand=STAND.has(at(x,y))&&!STAND.has(at(x,y-1));
        if(stand){if(run<0)run=x;}
        else if(run>=0){segs.push([run,x-1]);run=-1;}
      }
      if(run>=0)segs.push([run,w-1]);
      for(let i=1;i<segs.length;i++){
        const a=segs[i-1],b=segs[i];
        const gap=b[0]-a[1]-1;
        if(gap<=3)continue;
        // 窗口内找弹簧/移动平台标记(弹簧可在目标行下方较深处)
        let nS=0,hasM=false;
        for(let yy=Math.max(0,y-4);yy<=Math.min(h-1,y+8);yy++)
          for(let xx=Math.max(0,a[1]-2);xx<=Math.min(w-1,b[0]+2);xx++){
            const c=gr[yy][xx];
            if(c==='S')nS++; if(c==='M'||c==='V')hasM=true;
          }
        if(nS>=1&&gap<=10)continue;                     // 单弹簧
        if(nS>=2&&gap<=18)continue;                     // 弹簧链(多岛连跳)
        if(gap<=14&&hasM)continue;                      // 移动平台
        // 中继行:路径可在上方(平台/桥)或下方(绕行地面)越过本行间隙;
        // 覆盖允许两端各留3格普通跳距(从地面跃上桥/从桥头落到地面)
        const covered=(ry,lo,hi)=>{
          if(lo>hi)return true;
          for(let xx=lo;xx<=hi;xx++)if(!isStand(xx,ry))return false;
          return true;
        };
        let relay=false;
        for(const ry of[y-2,y-1,y+1,y+2,y+3,y+4]){
          if(ry<0||ry>=h)continue;
          if(covered(ry,a[1]+1,b[0]-1)||covered(ry,a[1]+3,b[0]-1)||covered(ry,a[1]+1,b[0]-3)){
            relay=true;break;
          }
        }
        if(relay)continue;
        if(gap>14){warns.push('L'+(li+1)+' 行'+y+' 间隙'+gap+'格('+a[1]+'→'+b[0]+')超宽,按可选支线处理');}
        else errs.push('L'+(li+1)+' 行'+y+' 间隙'+gap+'格('+a[1]+'→'+b[0]+')无弹簧/平台/中继辅助,跳不过去');
      }
    }
    // 3) 熔岩不悬空
    for(let y=0;y<h-1;y++)for(let x=0;x<w;x++)
      if(gr[y][x]==='~'&&!['~','#','I'].includes(at(x,y+1)))
        errs.push('L'+(li+1)+' 熔岩('+x+','+y+')悬空');
    // 4) 拉杆附近必须有切换砖
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)
      if(gr[y][x]==='L'){
        let ok=false;
        for(let yy=Math.max(0,y-6);yy<=Math.min(h-1,y+6);yy++)
          for(let xx=Math.max(0,x-12);xx<=Math.min(w-1,x+12);xx++)
            if(gr[yy][xx]==='a'||gr[yy][xx]==='b')ok=true;
        if(!ok)errs.push('L'+(li+1)+' 拉杆('+x+','+y+')附近12格内无切换砖');
      }
  }
  if(errs.length)return{ok:false,msg:'失败 '+errs.length+' 处: '+errs.slice(0,5).join('; ')};
  return{ok:true,msg:'六关断言全部通过'+(warns.length?('; 警告'+warns.length+'处(宽间隙按支线处理)'):'')};
}
