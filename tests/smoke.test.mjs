/*
 * 冒烟测试：在 Node 的 vm 里加载浏览器版 engine.js / privacy.js，验证核心口径。
 * 无需任何依赖：node --test tests/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function load() {
  const ctx = createContext({ console, setTimeout, clearTimeout });
  ctx.window = ctx;
  ctx.globalThis = ctx;
  for (const f of ['assets/js/privacy.js', 'assets/js/engine.js']) {
    runInContext(readFileSync(join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  return { engine: ctx.OfferFitEngine, privacy: ctx.OfferFitPrivacy };
}

const RESUME = `
张三  13812345678  zhangsan@example.com
2018.09-2022.06  XX大学 计算机科学与技术 本科
2022.07-2025.11  YY科技有限公司  前端工程师
负责电商中台订单模块：使用 Vue3 + TypeScript 重构订单页，首屏从 2.4s 降至 0.9s
搭建前端监控体系，线上报错率下降 60%
与产品、后端、测试跨部门协作，主导 3 次大版本发布
熟悉 React、Vue、TypeScript、Webpack、性能优化
`;

const JOB = {
  jobTitle: '高级前端工程师',
  company: 'ZZ网络科技有限公司',
  location: '深圳 · 南山区',
  salary: '25-40K·14薪',
  description: `岗位职责：
1. 负责核心业务前端架构设计与性能优化
2. 与产品、后端协作推进需求落地
任职要求：
1. 本科及以上学历，3-5 年前端经验
2. 精通 Vue / React，熟悉 TypeScript
3. 有性能优化经验`,
  skillsRequired: 'Vue, TypeScript, 性能优化',
  expRequirement: '3-5 年',
  eduRequirement: '本科'
};

const CFG = {
  dims: [
    { key: 'technical', weight: 30, on: true },
    { key: 'experience', weight: 25, on: true },
    { key: 'behavior', weight: 15, on: true },
    { key: 'career', weight: 30, on: true }
  ],
  thresholds: { strong: 75, good: 60, moderate: 45 },
  hard: { location: true, experience: true, education: true, skills: true, salary: true }
};

test('契约版本与常量', () => {
  const { engine } = load();
  assert.equal(engine.HARD_FAIL_SCORE, 44);
  assert.equal(engine.DEFAULT_DIMS.length, 4);
  assert.equal(engine.DEFAULT_DIMS.reduce((s, d) => s + d.weight, 0), 100);
});

test('完整输入产出合法结构', () => {
  const { engine } = load();
  const r = engine.analyze({ job: JOB, resume: RESUME, prefs: { city: '深圳', salary: '30K' }, config: CFG });
  assert.equal(r.skillVersion, 'job-fit@1.2.0');
  assert.ok(r.overallScore >= 0 && r.overallScore <= 100);
  assert.ok(['strong', 'good', 'moderate', 'weak', 'poor'].includes(r.verdict));
  assert.equal(r.dimensions.length, 4);
  assert.equal(r.hardConstraints.length, 5);
  assert.ok(Array.isArray(r.advice) && r.advice.length > 0);
  assert.ok(r.scoreMeta && r.scoreMeta.capMode === 'min');
});

test('硬性条件 fail 时封顶 44，且只降不升', () => {
  const { engine } = load();
  // 学历硬门槛：要求硕士，简历为本科 → 必然 fail
  const hardJob = { ...JOB, eduRequirement: '硕士' };
  const r = engine.analyze({ job: hardJob, resume: RESUME, prefs: { city: '深圳', salary: '30K' }, config: CFG });

  const edu = r.hardConstraints.find((h) => h.label === '学历门槛');
  assert.equal(edu.status, 'fail', '学历不达标应判定为 fail');

  assert.equal(r.scoreMeta.hardCapApplied, true, '应标记已封顶');
  assert.ok(r.overallScore <= 44, `封顶后不超过 44，实际 ${r.overallScore}`);
  assert.ok(r.overallScore >= 0);

  // 只降不升：综合分若不高于 44，匹配度应与之相等（不得被抬到 44）
  if (r.unconstrainedScore != null) {
    const expected = Math.min(r.unconstrainedScore, 44);
    assert.equal(r.overallScore, expected, '封顶必须是 min(加权分, 44)，而不是固定 44');
  }
});

test('关闭全部硬性条件时不封顶', () => {
  const { engine } = load();
  const off = { location: false, experience: false, education: false, skills: false, salary: false };
  const r = engine.analyze({
    job: JOB,
    resume: RESUME,
    prefs: { city: '北京', salary: '30K' },
    config: { ...CFG, hard: off }
  });
  assert.equal(r.scoreMeta.hardCapApplied, false);
  assert.equal(r.overallScore, r.unconstrainedScore);
});

test('脱敏：手机号 / 邮箱被替换，正文不被误伤', () => {
  const { privacy } = load();
  const out = privacy.maskPlain(RESUME);
  assert.ok(!out.includes('13812345678'), '手机号应被脱敏');
  assert.ok(!out.includes('zhangsan@example.com'), '邮箱应被脱敏');
  assert.ok(out.includes('Vue3'), '正文内容不应被误伤');
  const stat = privacy.describe(privacy.mask(RESUME).counts);
  assert.ok(typeof stat === 'string' && stat.length > 0);
});

test('空输入不崩溃', () => {
  const { engine } = load();
  const r = engine.analyze({ job: {}, resume: '', prefs: {}, config: CFG });
  assert.equal(typeof r.overallScore, 'number');
  assert.ok(r.dimensions.length === 4);
});
