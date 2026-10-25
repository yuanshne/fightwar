// v6 工作流：GLM-5.3 设计师 → Flash 两波施工（体验 → 装备局外成长）→ 终验
// 输入：pixel-quest/docs/specs/2026-10-24-v6-brief.md
interface DesignPack {
  designDoc: string;
  balanceDoc: string;
  wave1Orders: { worker: string; file: string; order: string }[];
  wave2Orders: { worker: string; file: string; order: string }[];
  risks: string[];
}
interface BuildResult {
  file: string;
  done: string[];
  selfCheck: string;
  notes: string;
}

const BRIEF = 'pixel-quest/docs/specs/2026-10-24-v6-brief.md';
const GATE_HINT =
  '门禁（两种路径已适配）：node tools/gate.js <art|levels|engine> 或 node pixel-quest/tools/gate.js <同名>；ui 责任者另跑 node --check ui.js。';
const BUILD_PERSONA =
  '你是像素平台游戏开发者，按工单施工。工单含伪代码/数值表就是规格，不得自由发挥；' +
  '只改自己拥有的文件；改完真实跑门禁到退出码 0，禁止伪造；工单矛盾或不可实现 escalate。';

artifact.board('v6progress', {
  title: 'v6 装备与体验进度',
  key: 'worker',
  status: 'status',
  columns: ['designing', 'building', 'gate-failed', 'done'],
  detail: [{ field: 'file' }, { field: 'round' }],
});

async function buildTeam(wave: string, specs: { name: string; file: string; gate: string }[],
  orders: { worker: string; file: string; order: string }[], designDoc: string) {
  return Promise.all(specs.map(async (spec) => {
    const order = orders.find((o) => o.worker === spec.name);
    const worker = agent(spec.name, { system: BUILD_PERSONA });
    let manifest = await worker.ask<BuildResult>(
      '完整阅读 ' + designDoc + ' 与你的施工工单 ' + (order ? order.order : 'docs/workorders/v6-（按队名对应）.md') +
      '，在当前最新代码上施工。你的文件：' + spec.file + '（' + wave + '）。\n' + GATE_HINT,
    );
    report({ worker: spec.name, file: spec.file, status: 'building', round: 0 }, 'v6progress');
    const runGates = () => Promise.all(
      spec.gate === 'ui' ? [world.run('node', ['--check', 'ui.js']), world.run('node', ['tools/gate.js', 'engine'])]
        : [world.run('node', ['tools/gate.js', spec.gate])]);
    let gates = await runGates();
    let repairs = 0;
    for (let round = 1; round <= 2 && gates.some((g) => g.exitCode !== 0); round++) {
      repairs = round;
      log(spec.name + ' 第 ' + round + ' 轮门禁未过，打回修复');
      report({ worker: spec.name, file: spec.file, status: 'gate-failed', round }, 'v6progress');
      manifest = await worker.ask<BuildResult>(
        '门禁未通过：\n' + gates.map((g) => g.stdout + g.stderr).join('\n') + '\n修复后复跑，返回更新后的交付清单。',
      );
      gates = await runGates();
    }
    const passed = gates.every((g) => g.exitCode === 0);
    report({ worker: spec.name, file: spec.file, status: passed ? 'done' : 'gate-failed', round: repairs }, 'v6progress');
    return { spec, manifest, passed, repairs };
  }));
}

phase('GLM-5.3 设计师产出 v6 设计与数值平衡表');
log('设计师按玩家反馈出方案：4技能+鼠标提示/下坠手感/敌人技能/BAL平衡表/装备局外成长(造梦西游式)');
const designer = agent('v6设计师', {
  model: 'account:zai-start-plan/GLM-5.3$high',
  system:
    '你是资深动作游戏策划+数值策划。先读 ' + BRIEF + '，再读现有代码 engine.js/ui.js/art.js/levels.js ' +
    '与 docs/CONTRACT.md，接口与现有数值以实际代码为准。产出必须落到伪代码/数值表级' +
    '（Flash 不做技术与数值裁量）；外观部件层方案必须先验证与现有精灵姿势系的兼容性再写死。矛盾或不可行 escalate。',
});
const designPack = await designer.ask<DesignPack>(
  '产出：\n' +
  '1) docs/specs/2026-10-24-v6-design.md：下坠手感换算表(新重力下全体系等比)、技能4星刃回旋完整规格、' +
  '鼠标提示卡与O引导规格、四类敌人技能(含前摇帧与判定)、神龛指引(光柱+HUD箭头)；\n' +
  '2) docs/specs/2026-10-24-v6-balance.md：全局数值模型(玩家/敌人/Boss/经济/装备加成区间，每个数值带推导式)；\n' +
  '3) 装备系统设计：掉落表/稀有度/词条/碎片合成/背包交互/存档迁移/外观部件层方案；\n' +
  '4) 第一波工单 docs/workorders/v6-wave1-{feel,ui,fx}.md 与第二波 docs/workorders/v6-wave2-{loot,bag,look}.md；\n' +
  '5) 硬约束写进工单：门禁全绿；旧存档零丢失；波1结束游戏完整可玩；鼠标不替代键盘；容量守卫不回退。\n' +
  '返回 DesignPack JSON（designDoc/balanceDoc/wave1Orders/wave2Orders/risks）。',
);
report({ worker: 'v6设计师', file: designPack.designDoc, status: 'done', round: 0 }, 'v6progress');
log('设计完成：数值表 ' + designPack.balanceDoc + '；wave1 ' + designPack.wave1Orders.length + ' 单 wave2 ' + designPack.wave2Orders.length + ' 单');

phase('第一波施工：下坠手感+4技能+敌人技能+可发现性');
const wave1 = await buildTeam('第一波·体验', [
  { name: '手感队', file: 'engine.js', gate: 'engine' },
  { name: '界面队', file: 'ui.js', gate: 'ui' },
  { name: '特效队', file: 'art.js', gate: 'art' },
], designPack.wave1Orders, designPack.designDoc);
const wave1Gate = await world.run('node', ['tools/gate.js', 'engine']);
if (wave1Gate.exitCode !== 0) {
  return {
    conclusion: '第一波后引擎门禁未过，第二波暂停，主 agent 须先修复。',
    findings: wave1.map((o) => ({
      where: o.spec.file, what: (o.passed ? '通过；' : '未过；') + o.manifest.notes,
      evidence: o.manifest.selfCheck, status: o.passed ? 'verified' : 'unconfirmed', severity: o.passed ? 'low' : 'high',
    })),
    verified: [], notCovered: ['第二波（装备系统）未开工'],
  };
}

phase('第二波施工：装备掉落+背包+外观');
const wave2 = await buildTeam('第二波·局外成长', [
  { name: '装备引擎队', file: 'engine.js', gate: 'engine' },
  { name: '背包队', file: 'ui.js', gate: 'ui' },
  { name: '外观队', file: 'art.js', gate: 'art' },
], designPack.wave2Orders, designPack.designDoc);

phase('终验门禁并汇报');
const finalGates = await Promise.all([
  world.run('node', ['tools/gate.js', 'art']),
  world.run('node', ['tools/gate.js', 'levels']),
  world.run('node', ['tools/gate.js', 'engine']),
  world.run('node', ['--check', 'ui.js']),
]);
const allPassed = finalGates.every((g) => g.exitCode === 0);
try {
  await artifact.file('v6design', designPack.designDoc, {
    title: 'v6 设计文档', description: '4技能/敌人技能/数值平衡表/装备局外成长全案', primary: true,
  });
} catch {
  /* 发布失败不阻塞，文档在仓库内 */
}

return {
  conclusion: allPassed
    ? 'v6 两波施工全部完成并过终验。主 agent 接浏览器实测（下坠手感/技能提示悬停/敌人技能/装备掉落背包外观/平衡抽查）。'
    : '终验有未过项，主 agent 集成时先修复。',
  findings: [...wave1, ...wave2].map((o) => ({
    where: o.spec.file,
    what: (o.passed ? '门禁通过；' : '门禁未通过；') + '完成: ' + o.manifest.done.join('；') + '；备注: ' + o.manifest.notes,
    evidence: o.manifest.selfCheck,
    status: o.passed ? 'verified' : 'unconfirmed',
    severity: o.passed ? 'low' : 'high',
  })),
  verified: finalGates.map((g, i) =>
    ['gate art', 'gate levels', 'gate engine', 'check ui'][i] + (g.exitCode === 0 ? ' 通过' : ' 未通过')),
  notCovered: [
    '下坠/打击手感与装备数值手感需主 agent 实测+玩家最终验收',
    '外观部件层与全部姿势的兼容需逐姿势截图人工审查',
    '背包鼠标交互需真人体验',
    ...(designPack.risks || []),
  ],
};
