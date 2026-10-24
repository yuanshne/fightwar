// v3 Boss战+技能系统工作流（预置脚本，v2 合入后由主 agent 以 path 启动）
// 分工：GLM-5.3 设计师想方法 → GLM-5.3-Flash 四队施工 → 门禁终验
// 输入：docs/specs/2026-10-24-v3-boss-brief.md（设计输入书，含边界与 YAGNI 清单）

interface WorkOrderRef {
  /** 施工队名：引擎队/美术队/关卡队/界面队 */
  worker: string;
  /** 该队拥有的文件 */
  file: string;
  /** 工单文件路径 */
  order: string;
}
interface DesignPack {
  /** 设计文档路径 */
  designDoc: string;
  workOrders: WorkOrderRef[];
  /** 设计师识别的风险与主 agent 集成提示 */
  risks: string[];
}
interface BuildResult {
  file: string;
  /** 对照工单逐条完成项 */
  done: string[];
  /** 门禁最终输出摘要 */
  selfCheck: string;
  /** 未完成或存疑，没有写"无" */
  notes: string;
}

const BRIEF = 'pixel-quest/docs/specs/2026-10-24-v3-boss-brief.md';
const GATE_HINT =
  '门禁（两种路径已适配）：node tools/gate.js <art|levels|engine> 或 node pixel-quest/tools/gate.js <同名>。';

artifact.board('v3progress', {
  title: 'v3 Boss战进度',
  key: 'worker',
  status: 'status',
  columns: ['designing', 'building', 'gate-failed', 'done'],
  detail: [{ field: 'file' }, { field: 'round' }],
});

phase('GLM-5.3 设计师产出设计与施工工单');
log('设计师先读 v2 合入后的真实代码，再产出 Boss 战设计与四份算法级工单');
const designer = agent('Boss战设计师', {
  model: 'account:zai-start-plan/GLM-5.3',
  system:
    '你是资深动作游戏设计师+技术策划。设计必须落在既有代码现实上：先读 ' + BRIEF +
    '、docs/CONTRACT.md、以及 v2 合入后的 engine.js/ui.js/art.js/levels.js 与 tools/gate.js，' +
    '接口名以实际代码为准。产出必须可执行到伪代码级（Flash 施工队不自由发挥）。' +
    '预算意识：Boss 精灵与特效素材给字符网格级画法说明而非留白。矛盾或不可行时 escalate。',
});
const designPack = await designer.ask<DesignPack>(
  '按设计输入书完成：\n' +
  '1) 写 docs/specs/2026-10-24-v3-boss-design.md：星核巨兽数值表、Boss AI 状态机图（状态/转移/前摇帧数）、' +
  '三技能数值与键位、玩家HP/无敌帧/掉落规则、L7 竞技场布局（文字草图+瓦片坐标）、HUD 布局；\n' +
  '2) 写四份施工工单到 docs/workorders/：engine.md（Boss AI/技能/HP系统的算法级伪代码+接口）、' +
  'art.md（Boss≥64x64 多部件像素画法+帧清单+技能特效素材规格）、levels.md（L7 竞技场 LG 代码草案+断言适配）、' +
  'ui.md（Boss血条/技能栏/心形HP/登场演出/致谢屏+gate.js 的 L7 冒烟要求）；\n' +
  '3) 硬约束写进对应工单：L7 空转 180 帧玩家不得死亡（Boss 需玩家靠近或演出结束后才激活）；' +
  '攻击/冲刺/连击复用 v2 实现的接口名；LEVELS 变 7 关后 gate.js 已自适应长度。\n' +
  '返回 DesignPack JSON（designDoc/workOrders/risks）。',
);
report({ worker: 'Boss战设计师', file: designPack.designDoc, status: 'done', round: 0 }, 'v3progress');
log('设计完成：' + designPack.workOrders.length + ' 份工单；风险 ' + designPack.risks.length + ' 条');

phase('Flash 四队并行施工引擎/美术/关卡/界面');
const BUILDERS = [
  { name: '引擎队', file: 'engine.js', gates: [['tools/gate.js', 'engine']] },
  { name: '美术队', file: 'art.js', gates: [['tools/gate.js', 'art']] },
  { name: '关卡队', file: 'levels.js', gates: [['tools/gate.js', 'levels']] },
  { name: '界面队', file: 'ui.js + gate.js', gates: [['--check', 'ui.js'], ['tools/gate.js', 'engine']] },
];
const WORKER_PERSONA =
  '你是像素平台游戏开发者，按工单施工。工单里的伪代码就是实现规格，不得自由发挥；' +
  '只改自己拥有的文件；改完真实跑门禁到退出码 0，禁止伪造；工单矛盾或不可行 escalate。';

const outcomes = await Promise.all(
  BUILDERS.map(async (b) => {
    const order = designPack.workOrders.find((w) => w.worker === b.name);
    const worker = agent(b.name, { system: WORKER_PERSONA });
    let manifest = await worker.ask<BuildResult>(
      '读取设计文档 ' + designPack.designDoc + ' 与你的施工工单 ' + (order ? order.order : 'docs/workorders/（按文件名对应）') +
      '，在 v2 合入后的代码上完成施工。你的文件：' + b.file + '。\n' + GATE_HINT,
    );
    report({ worker: b.name, file: b.file, status: 'building', round: 0 }, 'v3progress');
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
      report({ worker: b.name, file: b.file, status: 'gate-failed', round }, 'v3progress');
      manifest = await worker.ask<BuildResult>(
        '门禁未通过：\n' + gates.map((g) => g.stdout + g.stderr).join('\n') +
        '\n修复后复跑，返回更新后的交付清单。',
      );
      gates = await runGates();
    }
    const passed = gates.every((g) => g.exitCode === 0);
    report({ worker: b.name, file: b.file, status: passed ? 'done' : 'gate-failed', round: repairs }, 'v3progress');
    return { b, manifest, passed, repairs, gateOut: gates.map((g) => (g.stdout + g.stderr).slice(0, 150)).join(' | ') };
  }),
);

phase('终验门禁并发布设计文档');
const finalGates = await Promise.all([
  world.run('node', ['tools/gate.js', 'art']),
  world.run('node', ['tools/gate.js', 'levels']),
  world.run('node', ['tools/gate.js', 'engine']),
  world.run('node', ['--check', 'ui.js']),
]);
const allPassed = finalGates.every((g) => g.exitCode === 0);
try {
  await artifact.file('v3design', designPack.designDoc, {
    title: 'v3 Boss战设计文档',
    description: '星核巨兽数值/AI状态机/技能系统/竞技场布局的完整设计',
    primary: true,
  });
} catch {
  const fixer = agent('文档补救');
  await fixer.ask(designPack.designDoc + ' 缺失，请补写后放回原路径。');
  await artifact.file('v3design', designPack.designDoc, { title: 'v3 Boss战设计文档', primary: true });
}

return {
  conclusion: allPassed
    ? 'v3 施工完成：设计 ' + designPack.workOrders.length + ' 份工单，四队全部过门禁。主 agent 接 Boss 战全流程浏览器实测。'
    : '终验有未过项，主 agent 集成时先修复。',
  findings: outcomes.map((o) => ({
    where: o.b.file,
    what: (o.passed ? '门禁通过；' : '门禁未通过；') + '完成: ' + o.manifest.done.join('；') + '；备注: ' + o.manifest.notes,
    evidence: o.gateOut,
    status: o.passed ? 'verified' : 'unconfirmed',
    severity: o.passed ? 'low' : 'high',
  })),
  verified: finalGates.map((g, i) =>
    ['gate art', 'gate levels', 'gate engine', 'check ui'][i] + (g.exitCode === 0 ? ' 通过' : ' 未通过')),
  notCovered: [
    'Boss 战节奏与数值手感需主 agent 实测调整',
    'Boss 大体型渲染观感需截图人工审查',
    ...(designPack.risks || []),
  ],
};
