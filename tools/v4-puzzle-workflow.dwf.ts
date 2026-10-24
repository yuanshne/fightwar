// v4 谜题神龛工作流（主 agent 已出设计，无设计师环节）：Flash 四队并行施工
// 工单：pixel-quest/docs/specs/2026-10-24-v4-puzzles.md
interface BuildResult {
  file: string;
  done: string[];
  selfCheck: string;
  notes: string;
}

const SPEC = 'pixel-quest/docs/specs/2026-10-24-v4-puzzles.md';
const GATE_HINT =
  '门禁（两种路径已适配）：node tools/gate.js <art|levels|engine> 或 node pixel-quest/tools/gate.js <同名>。';

artifact.board('v4progress', {
  title: 'v4 谜题神龛进度',
  key: 'worker',
  status: 'status',
  columns: ['building', 'gate-failed', 'done'],
  detail: [{ field: 'file' }, { field: 'round' }],
});

phase('Flash 四队并行施工引擎/界面/美术/关卡');
log('谜题神龛开工：数织(奇数关)+数独(偶数关)，按工单施工，过门禁交付');
const BUILDERS = [
  { name: '引擎队', file: 'engine.js', gates: [['tools/gate.js', 'engine']] },
  { name: '界面队', file: 'ui.js + gate.js', gates: [['--check', 'ui.js'], ['tools/gate.js', 'engine']] },
  { name: '美术队', file: 'art.js', gates: [['tools/gate.js', 'art']] },
  { name: '关卡队', file: 'levels.js', gates: [['tools/gate.js', 'levels']] },
];
const WORKER_PERSONA =
  '你是像素平台游戏开发者，按工单施工。工单就是实现规格，不得自由发挥；只改自己拥有的' +
  '文件；改完真实跑门禁到退出码 0，禁止伪造；工单矛盾或不可实现 escalate。';

const outcomes = await Promise.all(
  BUILDERS.map(async (b) => {
    const worker = agent(b.name, { system: WORKER_PERSONA });
    let manifest = await worker.ask<BuildResult>(
      '完整阅读 ' + SPEC + '（含你所属队伍的工单小节与红线），在当前代码上完成施工。' +
      '你的文件：' + b.file + '。注意 v3 已合入（七关/Boss/技能），在最新代码上动工。\n' + GATE_HINT,
    );
    report({ worker: b.name, file: b.file, status: 'building', round: 0 }, 'v4progress');
    const runGates = () => Promise.all(
      b.gates.map((g) => g[0] === '--check'
        ? world.run('node', ['--check', g[1]])
        : world.run('node', [g[0], g[1]])),
    );
    let gates = await runGates();
    let repairs = 0;
    for (let round = 1; round <= 2 && gates.some((g) => g.exitCode !== 0); round++) {
      repairs = round;
      log(b.name + ' 第 ' + round + ' 轮门禁未过，打回修复');
      report({ worker: b.name, file: b.file, status: 'gate-failed', round }, 'v4progress');
      manifest = await worker.ask<BuildResult>(
        '门禁未通过：\n' + gates.map((g) => g.stdout + g.stderr).join('\n') +
        '\n修复后复跑，返回更新后的交付清单。',
      );
      gates = await runGates();
    }
    const passed = gates.every((g) => g.exitCode === 0);
    report({ worker: b.name, file: b.file, status: passed ? 'done' : 'gate-failed', round: repairs }, 'v4progress');
    return { b, manifest, passed, repairs, gateOut: gates.map((g) => (g.stdout + g.stderr).slice(0, 150)).join(' | ') };
  }),
);

phase('终验门禁并汇报');
const finalGates = await Promise.all([
  world.run('node', ['tools/gate.js', 'art']),
  world.run('node', ['tools/gate.js', 'levels']),
  world.run('node', ['tools/gate.js', 'engine']),
  world.run('node', ['--check', 'ui.js']),
]);
const allPassed = finalGates.every((g) => g.exitCode === 0);

return {
  conclusion: allPassed
    ? 'v4 谜题神龛施工完成，四队全部过门禁。主 agent 接浏览器实测（开龛/解题/奖励/持久化/逐关截图）。'
    : '终验有未过项，主 agent 集成时先修复。',
  findings: outcomes.map((o) => ({
    where: o.b.file,
    what: (o.passed ? '门禁通过；' : '门禁未通过；') + '完成: ' + o.manifest.done.join('；') +
      '；备注: ' + o.manifest.notes,
    evidence: o.gateOut,
    status: o.passed ? 'verified' : 'unconfirmed',
    severity: o.passed ? 'low' : 'high',
  })),
  verified: finalGates.map((g, i) =>
    ['gate art', 'gate levels', 'gate engine', 'check ui'][i] + (g.exitCode === 0 ? ' 通过' : ' 未通过')),
  notCovered: [
    '谜题可玩性与难度手感需主 agent 逐关实测',
    '数独唯一性由关卡队自检声明，主 agent 抽查',
    '覆盖层渲染观感需截图人工审查',
  ],
};
