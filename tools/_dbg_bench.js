const BOT = require('./_v20_play_bot.js');
function bench(idx, opt, label) {
  const r = BOT.run(idx, BOT.thinkSmart, 420, opt);
  console.log(label + '  L' + r.level + ' kind' + r.kind + '  ' + r.end +
    '  TTK=' + r.ttk + 's  hits=' + r.hits + '  dealt=' + Math.round(r.dealt) +
    '  effDPS=' + (r.ttk > 0 ? (r.dealt / r.ttk).toFixed(2) : '-'));
  return r;
}
console.log('--- 牛魔王 L19（对标锚点，hp=630）---');
bench(18, { invuln: true, equip: true }, '满装');
bench(18, { invuln: true }, '无装');
console.log('--- 地图二（当前值，满装）---');
for (const i of [19, 20, 21, 22, 23]) bench(i, { invuln: true, equip: true }, '满装');
console.log('--- 钟（无装）---');
bench(23, { invuln: true }, '无装');
