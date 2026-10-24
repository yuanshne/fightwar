// v5 大翻新工作流：GLM-5.3 设计师 → Flash 两波施工（手感技能 → 美术关卡）→ 终验
// 输入：pixel-quest/docs/specs/2026-10-24-v5-polish-brief.md
interface DesignPack {
  designDoc: string;
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

const BRIEF = 'pixel-quest/docs/specs/2026-10-24-v5-polish-brief.md';
const GATE_HINT =
  '门禁（两种路径已适配）：node tools/gate.js <art|levels|engine> 或 node pixel-quest/tools/gate.js <同名>；ui 责任者另跑 node --check ui.js。';
const BUILD_PERSONA =
  '你是像素平台游戏开发者，按工单施工。工单含伪代码/色板就是规格，不得自由发挥；' +
  '只改自己拥有的文件；改完真实跑门禁到退出码 0，禁止伪造；工单矛盾或不可实现 escalate。';

artifact.board('v5progress', {
  title: 'v5 大翻新进度',
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
      '完整阅读 ' + designDoc + ' 与你的施工工单 ' + (order ? order.order : 'docs/workorders/v5-（按队名对应）.md') +
      '，在当前最新代码上施工。你的文件：' + spec.file + '（' + wave + '）。\n' + GATE_HINT,
    );
    report({ worker: spec.name, file: spec.file, status: 'building', round: 0 }, 'v5progress');
    const runGates = () => Promise.all(
      spec.gate === 'ui' ? [world.run('node', ['--check', 'ui.js']), world.run('node', ['tools/gate.js', 'engine'])]
        : [world.run('node', ['tools/gate.js', spec.gate])]);
    let gates = await runGates();
    let repairs = 0;
    for (let round = 1; round <= 2 && gates.some((g) => g.exitCode !== 0); round++) {
      repairs = round;
      log(spec.name + ' 第 ' + round + ' 轮门禁未过，打回修复');
      report({ worker: spec.name, file: spec.file, status: 'gate-failed', round }, 'v5progress');
      manifest = await worker.ask<BuildResult>(
        '门禁未通过：\n' + gates.map((g) => g.stdout + g.stderr).join('\n') + '\n修复后复跑，返回更新后的交付清单。',
      );
      gates = await runGates();
    }
    const passed = gates.every((g) => g.exitCode === 0);
    report({ worker: spec.name, file: spec.file, status: passed ? 'done' : 'gate-failed', round: repairs }, 'v5progress');
    return { spec, manifest, passed, repairs };
  }));
}

phase('GLM-5.3 设计师产出 v5 设计与两波工单');
log('设计师按玩家六条反馈出整体方案：二段跳/打击感/技能重做/原神风转译/3新关/封面');
const designer = agent('v5设计师', {
  model: 'account:zai-start-plan/GLM-5.3$high',
  system:
    '你是资深动作游戏策划+美术指导。先读 ' + BRIEF + '（含玩家反馈原文与两波分工），再读现有代码 ' +
    'engine.js/ui.js/art.js/levels.js 与 docs/CONTRACT.md，接口名以实际代码为准。' +
    '产出必须可执行到伪代码/色板表级（Flash 不做美学与技术裁量）。矛盾或不可行 escalate。',
});
const designPack = await designer.ask<DesignPack>(
  '产出：\n' +
  '1) docs/specs/2026-10-24-v5-design.md：手感参数表(二段跳/空中操控/打击感逐项)、三技能重做规格(含O的完整演出时间轴)、' +
  '原神风像素化风格指南(全主题色板表+三阶cel-shading规则+发光规范+UI皮肤规格)、封面构图与动画规格、3新关主题与机关设计；\n' +
  '2) 第一波工单 docs/workorders/v5-wave1-{feel,ui,fx}.md（手感队 engine.js/演出队 ui.js/特效队 art.js）；\n' +
  '3) 第二波工单 docs/workorders/v5-wave2-{style,levels,title}.md（风格队 art.js/关卡队 levels.js/封面队 ui.js）；\n' +
  '4) 硬约束写进工单：存档向后兼容；粒子峰值≤300；第一波结束时游戏必须完整可玩；' +
  '关卡队须对全部关卡做二段跳体系重校验并跑 gate levels 断言。\n' +
  '返回 DesignPack JSON（designDoc/wave1Orders/wave2Orders/risks）。',
);
report({ worker: 'v5设计师', file: designPack.designDoc, status: 'done', round: 0 }, 'v5progress');
log('设计完成：wave1 ' + designPack.wave1Orders.length + ' 单，wave2 ' + designPack.wave2Orders.length + ' 单');

phase('第一波施工：手感+技能重做（游戏时刻保持可玩）');
const wave1 = await buildTeam('第一波·手感技能', [
  { name: '手感队', file: 'engine.js', gate: 'engine' },
  { name: '演出队', file: 'ui.js', gate: 'ui' },
  { name: '特效队', file: 'art.js', gate: 'art' },
], designPack.wave1Orders, designPack.designDoc);
const w1ok = wave1.every((o) => o.passed);
log(w1ok ? '第一波全部过门禁' : '第一波存在未过项，第二波开工前需主 agent 关注');
const wave1Gate = await world.run('node', ['tools/gate.js', 'engine']);
if (wave1Gate.exitCode !== 0) {
  return {
    conclusion: '第一波后引擎门禁未过，第二波暂停，主 agent 须先修复再继续（设计文档与wave1工单已交付）。',
    findings: wave1.map((o) => ({
      where: o.spec.file, what: (o.passed ? '通过；' : '未过；') + o.manifest.notes,
      evidence: o.manifest.selfCheck, status: o.passed ? 'verified' : 'unconfirmed', severity: o.passed ? 'low' : 'high',
    })),
    verified: [], notCovered: ['第二波未开工'],
  };
}

phase('第二波施工：原神风美术+三新关+封面');
const wave2 = await buildTeam('第二波·风格关卡', [
  { name: '风格队', file: 'art.js', gate: 'art' },
  { name: '关卡队', file: 'levels.js', gate: 'levels' },
  { name: '封面队', file: 'ui.js', gate: 'ui' },
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
  await artifact.file('v5design', designPack.designDoc, {
    title: 'v5 大翻新设计文档', description: '二段跳/打击感/技能重做/原神风转译/3新关/封面全案', primary: true,
  });
} catch {
  /* 设计文档发布失败不阻塞：主 agent 集成时直接引用仓库内文档 */
}

return {
  conclusion: allPassed
    ? 'v5 两波施工全部完成并过终验。主 agent 接浏览器实测（二段跳手感/打击感/技能演出/新美术/新关/封面）。'
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
    '手感主观评价与技能演出观感需主 agent 实测+截图审查',
    '二段跳后全关卡实际可玩性需逐关人工核验',
    '原神风整体观感需玩家（用户）最终验收',
    ...(designPack.risks || []),
  ],
};
