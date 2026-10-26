// v10 血量/TTK 核算：11 种小怪 + 5 精英 + 5 Boss 的旧值→新值，以及无装备/满装的理论击杀时间
// 用法：node tools/_v10_hp.js
//
// 口径（与 engine.js 一致）：
//   ATK = BAL.player.atkBase + equip.atk（无装备 2 / 满装 5）
//   暴击：本击使连击数到 critMod(4) 的倍数 → 伤害 ×critMul(2)，即每 4 刀 1 次暴击
//   攻击冷却 BAL.atk.cd = 0.35s（hit-stop 0.10s 不计入，属于命中反馈不是出手间隔）
//   TTK = 出手次数 × cd（第一刀从 t=0 起算，含收招）
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const THEMES = {};
['grass', 'cave', 'sky', 'factory', 'lava', 'tower', 'boss', 'wind', 'castle', 'star', 'sea', 'nether']
  .forEach(k => { THEMES[k] = {}; });

let body = read('levels.js');
for (const f of ['chapter2.js', 'chapter3.js']) if (fs.existsSync(path.join(ROOT, f))) body += '\n' + read(f);
body += '\n;aggregateLevels();\n' + read('engine.js') + '\n;return {BAL};';
const BAL = new Function('THEMES', body)(THEMES).BAL;

const OLD = {
  enemy: { slime: 3, bat: 2, knight: 4, mage: 3, lancer: 3, jelly: 2, ghost: 3, boomer: 2, beetle: 2, spitter: 3, hopper: 2 },
  elite: { lancer: 14, ghost: 12, beetle: 8, spitter: 12, hopper: 8 },
  boss: { boss: 63, boss2: 96, boss3: 144, boss4: 162, boss5: 189 }
};
const CD = BAL.atk.cd;

// 逐刀模拟：每 4 刀 1 次暴击（combo+1 % 4 === 0）
function ttk(hp, atk) {
  let dealt = 0, n = 0;
  while (dealt < hp) {
    n++;
    dealt += ((n % BAL.player.critMod) === 0 ? atk * BAL.player.critMul : atk);
    if (n > 100000) break;
  }
  return { hits: n, sec: n * CD };
}

function row(label, oldHp, newHp) {
  const a = ttk(newHp, BAL.player.atkBase);                       // 无装备 ATK 2
  const b = ttk(newHp, BAL.player.atkBase + BAL.gear.stat.w[4]);  // 满装 ATK 5（金武器 +3）
  return {
    label, oldHp, newHp,
    noEq: a.sec, full: b.sec,
    noEqHits: a.hits, fullHits: b.hits,
    warn: b.sec > 90
  };
}

const rows = [];
for (const k of Object.keys(OLD.enemy)) rows.push(row('小怪·' + k, OLD.enemy[k], BAL.enemy[k].hp));
for (const k of Object.keys(OLD.elite)) rows.push(row('精英·' + k, OLD.elite[k], BAL.elite[k].hp));
for (const k of Object.keys(OLD.boss)) rows.push(row('BOSS·' + k, OLD.boss[k], BAL[BAL[k] ? k : k].hp));

const pad = (s, n) => { s = String(s); while (s.length < n) s += ' '; return s; };
const padL = (s, n) => { s = String(s); while (s.length < n) s = ' ' + s; return s; };
console.log('ATK 无装备=' + BAL.player.atkBase + ' 满装=' + (BAL.player.atkBase + BAL.gear.stat.w[4])
  + ' 暴击=每 ' + BAL.player.critMod + ' 刀 ×' + BAL.player.critMul + ' 攻击冷却=' + CD + 's');
console.log('');
console.log(pad('敌人', 16) + padL('旧 HP', 7) + padL('新 HP', 7) + padL('倍率', 7)
  + padL('无装刀数', 9) + padL('无装 TTK', 10) + padL('满装刀数', 9) + padL('满装 TTK', 10));
console.log('-'.repeat(75));
for (const r of rows) {
  console.log(pad(r.label, 16) + padL(r.oldHp, 7) + padL(r.newHp, 7) + padL((r.newHp / r.oldHp).toFixed(2) + 'x', 7)
    + padL(r.noEqHits, 9) + padL(r.noEq.toFixed(1) + 's', 10)
    + padL(r.fullHits, 9) + padL(r.full.toFixed(1) + 's', 10)
    + (r.warn ? '  <<< 满装 TTK > 90s' : ''));
}
const warn = rows.filter(r => r.warn);
console.log('');
console.log('满装 TTK > 90s 的条目：' + (warn.length ? warn.map(r => r.label + ' ' + r.full.toFixed(1) + 's').join('；') : '无'));
console.log('（TTK 为纯普攻理论值；实战还要走位/躲招，三命 Boss 每段之间还有 revive 演出，实际更久。）');
