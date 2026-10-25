// v7 工作流：5.3 基准测试员 → 5.3 设计师 → Flash 六队并发施工（章节化关卡+新Boss+精英+隐藏房）
// 输入：pixel-quest/docs/specs/2026-10-24-v7-brief.md
interface BenchReport {
  /** 造梦西游基准总分（百分制） */
  score: number;
  /** 分项得分与依据 */
  dimensions: { name: string; score: number; evidence: string }[];
  /** 差距清单：追平所需的具体内容 */
  gaps: string[];
}
interface DesignPack {
  designDoc: string;
  chapterContract: string;
  orders: { worker: string; file: string; order: string }[];
  risks: string[];
}
interface BuildResult {
  file: string;
  done: string[];
  selfCheck: string;
  notes: string;
}

const BRIEF = 'pixel-quest/docs/specs/2026-10-24-v7-brief.md';
const GATE_HINT =
  '门禁（两种路径已适配）：node tools/gate.js <art|levels|engine> 或 node pixel-quest/tools/gate.js <同名>；' +
  'ui 责任者另跑 node --check ui.js；章节队按工单跑 node --check <章节文件> 与章节断言脚本。';
const BUILD_PERSONA =
  '你是像素平台游戏开发者，按工单施工。工单含伪代码/数值表就是规格，不得自由发挥；' +
  '只改自己拥有的文件；改完真实跑门禁到退出码 0，禁止伪造；工单矛盾或不可实现 escalate。';

artifact.board('v7progress', {
  title: 'v7 章节扩充进度',
  key: 'worker',
  status: 'status',
  columns: ['testing', 'designing', 'building', 'gate-failed', 'done'],
  detail: [{ field: 'file' }, { field: 'round' }],
});

async function buildTeams(specs: { name: string; file: string; gates: [string, string][] }[],
  orders: { worker: string; file: string; order: string }[], designDoc: string, waveName: string) {
  return Promise.all(specs.map(async (spec) => {
    const order = orders.find((o) => o.worker === spec.name);
    const worker = agent(spec.name, { system: BUILD_PERSONA });
    let manifest = await worker.ask<BuildResult>(
      '完整阅读 ' + designDoc + ' 与你的施工工单 ' + (order ? order.order : 'docs/workorders/v7-（按队名对应）.md') +
      '，在当前最新代码上施工。你的文件：' + spec.file + '（' + waveName + '）。注意：其它队并行施工，' +
      '严禁触碰非己文件；聚合契约见设计文档"章节化关卡架构"节。\n' + GATE_HINT,
    );
    report({ worker: spec.name, file: spec.file, status: 'building', round: 0 }, 'v7progress');
    const runGates = () => Promise.all(
      spec.gates.map((g) => g[0] === '--check'
        ? world.run('node', ['--check', g[1]])
        : world.run('node', [g[0], g[1]])));
    let gates = await runGates();
    let repairs = 0;
    for (let round = 1; round <= 2 && gates.some((g) => g.exitCode !== 0); round++) {
      repairs = round;
      log(spec.name + ' 第 ' + round + ' 轮门禁未过，打回修复');
      report({ worker: spec.name, file: spec.file, status: 'gate-failed', round }, 'v7progress');
      manifest = await worker.ask<BuildResult>(
        '门禁未通过：\n' + gates.map((g) => g.stdout + g.stderr).join('\n') + '\n修复后复跑，返回更新后的交付清单。',
      );
      gates = await runGates();
    }
    const passed = gates.every((g) => g.exitCode === 0);
    report({ worker: spec.name, file: spec.file, status: passed ? 'done' : 'gate-failed', round: repairs }, 'v7progress');
    return { spec, manifest, passed, repairs };
  }));
}

phase('GLM-5.3 基准测试员：以造梦西游为基准线做差距评测');
log('测试员先给现版本打分并列差距清单，评测结果直接喂给设计师');
const benchTester = agent('基准测试员', {
  model: 'account:zai-start-plan/GLM-5.3$high',
  system:
    '你是资深游戏评测+竞品分析师，基准游戏为《造梦西游》（章节制关卡/多Boss/精英怪/隐藏房/' +
    '装备刷取循环）。对 pixel-quest 现版本（v6）做只读评测：读代码+文档+浏览器实测' +
    '（file:///C:/Users/A/.zcode/workspace/draft-6e5b5889-432a-4c7b-aabe-13a594a464ac/pixel-quest/index.html?level=N）。' +
    '结论要有证据（代码位置或实测输出）；不夸大不遗漏。',
});
const bench = await benchTester.ask<BenchReport>(
  '按四维评测并返回 BenchReport：战斗深度/关卡丰富度/成长循环/整体完成度（各 0-100 相对造梦西游=100）。' +
  'gaps 列表 = 追平所需的具体内容清单（每条一行、可直接转工单，含数量建议）。' +
  '浏览器实测至少覆盖：战斗手感三项、关卡 3 关、Boss 战、装备全链路。',
);
report({ worker: '基准测试员', file: '基准报告', status: 'done', round: 0 }, 'v7progress');
log('基准评测完成：总分 ' + bench.score + '，差距 ' + bench.gaps.length + ' 条');

phase('GLM-5.3 设计师：章节化架构+内容扩充定稿');
const designer = agent('v7设计师', {
  model: 'account:zai-start-plan/GLM-5.3$high',
  system:
    '你是资深动作游戏策划。先读 ' + BRIEF + ' 与基准测试员的差距清单（下附），再读现有代码与 CONTRACT，' +
    '产出可执行到伪代码/数值级的方案；章节聚合契约必须精确到加载顺序与全局符号名。矛盾或不可行 escalate。',
});
const designPack = await designer.ask<DesignPack>(
  '基准差距清单：\n' + JSON.stringify(bench.gaps) + '\n分项：' + JSON.stringify(bench.dimensions) + '\\n' +
  '产出：\n' +
  '1) docs/specs/2026-10-24-v7-design.md：章节聚合契约（加载顺序/CHAPTERS 注册/聚合入口/gate 覆盖全部章节关）、' +
  '新主题与新机关规格、2 个新 Boss 参数化差异表、精英怪规则、隐藏房规则、选关章节化规格、BAL 补充数值段；\n' +
  '2) 六份工单 docs/workorders/v7-{frame,art,ui,chapter2,chapter3,balance}.md（框架队/美术队/界面队/章节二队/' +
  '章节三队/平衡队），含各自门禁命令与自测断言；\n' +
  '3) 硬约束写进工单：既有门禁全绿；v6 存档兼容；Boss 参数化禁止 copy-paste；章节队文件互不可见须靠契约对齐。\n' +
  '返回 DesignPack JSON（designDoc/chapterContract/orders/risks）。',
);
report({ worker: 'v7设计师', file: designPack.designDoc, status: 'done', round: 0 }, 'v7progress');
log('设计完成：' + designPack.orders.length + ' 份工单，契约=' + designPack.chapterContract);

phase('Flash 六队并发施工：框架/美术/界面/两章节/平衡');
const outcomes = await buildTeams([
  { name: '框架队', file: 'engine.js+gate.js+index.html', gates: [['tools/gate.js', 'engine'], ['tools/gate.js', 'levels']] },
  { name: '美术队', file: 'art.js', gates: [['tools/gate.js', 'art']] },
  { name: '界面队', file: 'ui.js', gates: [['--check', 'ui.js'], ['tools/gate.js', 'engine']] },
  { name: '章节二队', file: 'chapter2.js', gates: [['--check', 'chapter2.js']] },
  { name: '章节三队', file: 'chapter3.js', gates: [['--check', 'chapter3.js']] },
  { name: '平衡队', file: 'levels.js 断言段+docs', gates: [['tools/gate.js', 'levels']] },
], designPack.orders, designPack.designDoc, 'v7 并发波');

phase('终验门禁并汇报');
const finalGates = await Promise.all([
  world.run('node', ['tools/gate.js', 'art']),
  world.run('node', ['tools/gate.js', 'levels']),
  world.run('node', ['tools/gate.js', 'engine']),
  world.run('node', ['--check', 'ui.js']),
  world.run('node', ['--check', 'chapter2.js']),
  world.run('node', ['--check', 'chapter3.js']),
]);
const allPassed = finalGates.every((g) => g.exitCode === 0);
try {
  await artifact.file('v7design', designPack.designDoc, {
    title: 'v7 章节扩充设计文档', description: '章节化架构/新Boss/精英/隐藏房/章节选关全案', primary: true,
  });
} catch {
  /* 文档在仓库内，发布失败不阻塞 */
}

return {
  conclusion: allPassed
    ? 'v7 六队并发施工完成并过终验。基准分 ' + bench.score + ' → 主 agent 接全章节浏览器实测（新关/新Boss/精英掉落/隐藏房/章节选关）。'
    : '终验有未过项，主 agent 集成时先修复。基准评测：总分 ' + bench.score + '，四维 ' + JSON.stringify(bench.dimensions),
  findings: [
    { where: '基准评测', what: '总分 ' + bench.score + '；差距 ' + bench.gaps.length + ' 条：' + bench.gaps.slice(0, 6).join('；'), evidence: bench.dimensions.map((d) => d.name + '=' + d.score).join(', '), status: 'verified', severity: 'medium' },
    ...outcomes.map((o) => ({
      where: o.spec.file,
      what: (o.passed ? '门禁通过；' : '门禁未通过；') + '完成: ' + o.manifest.done.join('；') + '；备注: ' + o.manifest.notes,
      evidence: o.manifest.selfCheck,
      status: o.passed ? 'verified' : 'unconfirmed',
      severity: o.passed ? 'low' : 'high',
    })),
  ],
  verified: finalGates.map((g, i) =>
    ['gate art', 'gate levels', 'gate engine', 'check ui', 'check chapter2', 'check chapter3'][i] + (g.exitCode === 0 ? ' 通过' : ' 未通过')),
  notCovered: [
    '新章节实际可玩性与 Boss 手感需主 agent 逐关实测',
    '与造梦西游的最终体验对比需玩家验收',
    ...(designPack.risks || []),
  ],
};
