/*
 * 记录仓库测试：验证「每次分析都是独立记录」这一条硬约束。
 * 重点：同岗位多次分析 / 多视角不得互相覆盖，分组与序号正确，导出可回读。
 * 运行：node --test tests/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function load() {
  const ctx = createContext({ console, setTimeout, clearTimeout, Date, Math, JSON });
  ctx.window = ctx;
  ctx.globalThis = ctx;
  for (const f of ['assets/js/privacy.js', 'assets/js/engine.js', 'assets/js/store.js']) {
    runInContext(readFileSync(join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  return { engine: ctx.OfferFitEngine, store: ctx.OfferFitStore };
}

const RESUME = `
张三  13812345678  zhangsan@example.com
2018.09-2022.06  XX大学 计算机科学与技术 本科
2022.07-2025.11  YY科技有限公司  前端工程师
负责电商中台订单模块：使用 Vue3 + TypeScript 重构订单页，首屏从 2.4s 降至 0.9s
与产品、后端、测试跨部门协作，主导 3 次大版本发布
熟悉 React、Vue、TypeScript、Webpack、性能优化
`;

const JOB = {
  jobTitle: '高级前端工程师',
  company: 'ZZ网络科技有限公司',
  location: '深圳 · 南山区',
  salary: '25-40K·14薪',
  description: '岗位职责：负责前端架构与性能优化\n任职要求：本科及以上，3-5 年前端经验；精通 Vue/React，熟悉 TypeScript',
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

function rec(engine, store, perspective, at, job = JOB) {
  const r = engine.analyze({ job, resume: RESUME, prefs: { city: '深圳', salary: '30K' }, config: CFG, perspective });
  return store.makeRecord({
    job,
    prefs: { city: '深圳', salary: '30K' },
    result: JSON.parse(JSON.stringify(r)),
    at
  });
}

test('记录：同岗位多次分析逐条保留，不覆盖', () => {
  const { engine, store } = load();
  let list = [];
  const times = ['2026-11-20T09:00:00.000Z', '2026-11-21T10:00:00.000Z', '2026-11-21T21:00:00.000Z'];
  times.forEach((at, i) => {
    const out = store.append(list, rec(engine, store, 'candidate', at));
    assert.equal(out.added, true, `第 ${i + 1} 次应写入`);
    list = out.records;
  });
  assert.equal(list.length, 3, '三次分析必须三条记录');
  assert.equal(new Set(list.map((r) => r.id)).size, 3, '记录 id 必须各不相同');
  assert.equal(list[0].at, times[2], '最新一条排在最前');
  assert.equal(list[2].at, times[0], '最早一条仍在列表中，未被挤掉');
});

test('记录：同岗位切换视角各成一条，内容各自完整', () => {
  const { engine, store } = load();
  let list = [];
  list = store.append(list, rec(engine, store, 'candidate', '2026-11-21T09:00:00.000Z')).records;
  list = store.append(list, rec(engine, store, 'interviewer', '2026-11-21T09:05:00.000Z')).records;

  assert.equal(list.length, 2);
  const groups = store.byJob(list);
  assert.equal(groups.length, 1, '同一岗位应归为一组');
  assert.equal(groups[0].count, 2);
  assert.equal(groups[0].candidate, 1);
  assert.equal(groups[0].interviewer, 1);

  const roles = groups[0].records.map((r) => r.role).join(',');
  assert.equal(roles, 'interviewer,candidate', '新记录在前');
  assert.equal(groups[0].records.map((r) => r.seq).join(','), '2,1', '序号按时间正序');

  // 每条记录都必须自带岗位、视角、时间与完整分析内容
  groups[0].records.forEach((r) => {
    assert.equal(r.job.jobTitle, JOB.jobTitle);
    assert.equal(r.job.description, JOB.description, 'JD 原文要进记录');
    assert.ok(r.roleLabel);
    assert.ok(r.at && r.atMs);
    assert.equal(r.result.dimensions.length, 4);
    assert.equal(r.result.hardConstraints.length, 5);
    assert.ok(r.result.perspective.sections.length > 0);
  });
  // 两个视角的分析内容确实不同，不是同一条被改写
  const cand = groups[0].records.find((r) => r.role === 'candidate');
  const iv = groups[0].records.find((r) => r.role === 'interviewer');
  assert.notEqual(
    cand.result.perspective.sections.map((s) => s.key).join(','),
    iv.result.perspective.sections.map((s) => s.key).join(',')
  );
});

test('记录：同一 id 重复写入不产生副本', () => {
  const { engine, store } = load();
  const one = rec(engine, store, 'candidate', '2026-11-21T09:00:00.000Z');
  let list = store.append([], one).records;
  const again = store.append(list, one);
  assert.equal(again.added, false);
  assert.equal(again.records.length, 1);
});

test('记录：按岗位分组、组内序号与统计', () => {
  const { engine, store } = load();
  const other = { ...JOB, jobTitle: '前端工程师', company: 'AA科技' };
  let list = [];
  list = store.append(list, rec(engine, store, 'candidate', '2026-11-19T09:00:00.000Z', other)).records;
  list = store.append(list, rec(engine, store, 'candidate', '2026-11-20T09:00:00.000Z')).records;
  list = store.append(list, rec(engine, store, 'interviewer', '2026-11-21T09:00:00.000Z')).records;

  const groups = store.byJob(list);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].jobTitle, JOB.jobTitle, '最近有更新的岗位排在前');
  assert.equal(groups[0].count, 2);
  assert.equal(groups[1].count, 1);

  const st = store.stats(list);
  assert.equal(st.total, 3);
  assert.equal(st.jobs, 2);
  assert.equal(st.candidate, 2);
  assert.equal(st.interviewer, 1);

  const target = store.find(list, list[list.length - 1].id);
  assert.equal(store.ordinal(list, target), 1, '最早那条是第 1 次分析');
});

test('记录：岗位 key 归一化，空白与全角括号不影响归组', () => {
  const { store } = load();
  const a = store.jobKeyOf({ jobTitle: '前端 工程师', company: 'AA（深圳）科技' });
  const b = store.jobKeyOf({ jobTitle: '前端工程师', company: 'aa(深圳)科技' });
  assert.equal(a, b);
});

test('记录：导出 → 回读保持字段与顺序，基线合并按 id 去重', () => {
  const { engine, store } = load();
  const r1 = rec(engine, store, 'candidate', '2026-11-20T09:00:00.000Z');
  const r2 = rec(engine, store, 'interviewer', '2026-11-21T09:00:00.000Z');
  const list = store.append(store.append([], r1).records, r2).records;

  const payload = store.toStore(list, ['r-gone']);
  assert.equal(payload.schema, store.SCHEMA);
  assert.equal(payload.count, 2);
  assert.equal(payload.deleted.join(','), 'r-gone');

  const back = store.parseStore(JSON.stringify(payload));
  assert.equal(back.records.length, 2);
  assert.equal(back.deleted.join(','), 'r-gone');
  assert.equal(back.records[0].at, '2026-11-21T09:00:00.000Z');
  assert.equal(back.records[0].role, 'interviewer');

  // 基线 + 本机：重复 id 只留一份，新记录追加
  const extra = rec(engine, store, 'candidate', '2026-11-22T09:00:00.000Z');
  const merged = store.merge(back.records, [r2, extra]);
  assert.equal(merged.length, 3);
  assert.equal(merged[0].id, extra.id);
});

test('记录：兼容旧版数组记录（无 role / jobKey 字段）', () => {
  const { engine, store } = load();
  const r = engine.analyze({ job: JOB, resume: RESUME, prefs: {}, config: CFG, perspective: 'interviewer' });
  const legacy = [{ id: 'old-1', at: '2026-11-01T08:00:00.000Z', job: JOB, prefs: {}, result: JSON.parse(JSON.stringify(r)) }];
  const parsed = store.parseStore(legacy);
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].role, 'interviewer', '缺 role 时从 perspective 推出');
  assert.equal(parsed.records[0].jobKey, store.jobKeyOf(JOB));
  assert.equal(store.byJob(parsed.records)[0].records[0].seq, 1);
});

test('记录：超出上限只丢最旧的，不整体清空', () => {
  const { engine, store } = load();
  let list = [];
  list = store.append(list, rec(engine, store, 'candidate', '2026-11-01T09:00:00.000Z')).records;
  const newer = [];
  for (let i = 0; i < 4; i += 1) {
    newer.push(rec(engine, store, 'candidate', `2026-11-2${i}T09:00:00.000Z`));
  }
  newer.forEach((r) => { list = store.append(list, r).records; });

  const capped = store.append(list, rec(engine, store, 'candidate', '2026-11-30T09:00:00.000Z'), { max: 3 });
  assert.equal(capped.records.length, 3);
  assert.equal(capped.dropped, 3);
  assert.equal(capped.records[0].at, '2026-11-30T09:00:00.000Z', '新记录必须保留');
});

test('记录：损坏数据不炸，非法条目被丢弃', () => {
  const { store } = load();
  assert.equal(store.parseStore('not json').records.length, 0);
  assert.equal(store.parseStore(null).records.length, 0);
  assert.equal(store.normalize([null, {}, { result: {} }, { result: { overallScore: 60 } }]).length, 1);
});
