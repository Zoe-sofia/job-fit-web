/* ============================================================
   xlsx.test.mjs — 记录导出（Excel）结构与口径校验
   重点不是「能生成文件」，而是「导出的字段、顺序、内容与原 JSON 导出一致」：
   1) ZIP 部件齐全、CRC 与数据一致（Excel 才不会报文件损坏）
   2) 「分析记录」表头顺序 = 导出 JSON 中 record 的键顺序
   3) 数值字段写成数字而非文本，空值不占位（不影响列对齐）
   4) 「记录JSON」表能原样拼回导出 JSON
   5) 文件名 / MIME 标识正确
   ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const ROOT = new URL('../', import.meta.url);

function load() {
  const ctx = createContext({ console, TextEncoder });
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ['assets/js/store.js', 'assets/js/xlsx.js', 'assets/js/record-export.js'].forEach((f) => {
    runInContext(readFileSync(new URL(f, ROOT), 'utf8'), ctx, { filename: f });
  });
  return { ST: ctx.OfferFitStore, X: ctx.OfferFitXlsx, RX: ctx.OfferFitRecordExport };
}

/* ---------------- ZIP 读取（store 方式，无需解压） ---------------- */
function readZip(bytes) {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  assert.ok(eocd >= 0, '缺少 EOCD 结束记录');
  const total = buf.readUInt16LE(eocd + 10);
  const cdOff = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  let p = cdOff;
  for (let i = 0; i < total; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50, '中央目录签名错误');
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const cmtLen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    assert.equal(buf.readUInt32LE(lho), 0x04034b50, '本地文件头签名错误：' + name);
    const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    files.set(name, { method, crc, data: buf.subarray(start, start + csize) });
    p += 46 + nameLen + extraLen + cmtLen;
  }
  return files;
}

/* ---------------- 极简 sheet XML 读取 ---------------- */
function unesc(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

// 单元格带 r="B3" 坐标；空值不写 <c>，所以必须按列号落位，不能按出现顺序
function colIndex(letters) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function rowsOf(xml) {
  const rows = [];
  const rowRe = /<row r="(\d+)">([\s\S]*?)<\/row>/g;
  let m;
  while ((m = rowRe.exec(xml))) {
    const cells = [];
    const cellRe = /<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g;
    let c;
    while ((c = cellRe.exec(m[2]))) {
      const attrs = c[2] || '';
      const inner = c[3] || '';
      const t = /<t[^>]*>([\s\S]*?)<\/t>/.exec(inner);
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner);
      const at = colIndex(c[1]);
      if (t) cells[at] = { type: /t="inlineStr"/.test(attrs) ? 'str' : 'n', value: unesc(t[1]) };
      else if (v) cells[at] = { type: 'num', value: Number(v[1]) };
      else cells[at] = { type: 'empty', value: '' };
    }
    for (let i = 0; i < cells.length; i++) if (!cells[i]) cells[i] = { type: 'empty', value: '' };
    rows.push(cells);
  }
  return rows;
}

function sheet(files, index) {
  const f = files.get('xl/worksheets/sheet' + index + '.xml');
  assert.ok(f, '缺少工作表 sheet' + index + '.xml');
  return f.data.toString('utf8');
}

function sheetIndex(files, name) {
  const wb = files.get('xl/workbook.xml').data.toString('utf8');
  const names = [...wb.matchAll(/<sheet name="([^"]+)"/g)].map((m) => unesc(m[1]));
  const i = names.indexOf(name);
  assert.ok(i >= 0, '工作簿里找不到工作表：' + name);
  return i + 1;
}

/* ---------------- 样本数据（含两条记录、两个视角、各数组字段） ---------------- */
function fixture() {
  const { ST } = load();
  const base = {
    overallScore: 78,
    unconstrainedScore: 81,
    scoreMeta: { contract: 'job-fit@1.3.0', capMode: 'min', cap: 44 },
    confidence: 82,
    verdict: 'strong',
    recommendation: '建议优先投递：核心要求覆盖良好。',
    summary: '技术栈与岗位要求高度重合。',
    dimensions: [
      { key: 'technical', label: '技术技能', score: 86, weight: 30, note: '核心栈一致', evidence: ['Vue3 重构订单页'] },
      { key: 'experience', label: '经验匹配', score: 74, weight: 25, note: '', evidence: [] },
      { key: 'behavior', label: '协作特质', score: 80, weight: 15, note: '', evidence: [] },
      { key: 'career', label: '职业方向', score: 72, weight: 30, note: '', evidence: [] }
    ],
    hardConstraints: [
      { label: '工作地点', status: 'pass', note: '深圳' },
      { label: '工作年限', status: 'flag', note: '3 年，JD 要 3-5 年' }
    ],
    strengths: ['Vue3 与 TypeScript 有落地项目'],
    gaps: ['缺少 Node.js 服务端经验', '团队规模未说明'],
    risks: ['跳槽频率偏高'],
    advice: ['补一条服务端接口联调经历'],
    evidence: ['首屏 2.4s→0.9s'],
    fitPoints: [{ req: '性能优化', ev: '首屏 2.4s→0.9s' }],
    skills: [
      { name: 'Vue', status: 'matched', evidence: 'Vue3 重构订单页', note: '' },
      { name: 'Node.js', status: 'missing', evidence: '', note: 'JD 未明确要求' }
    ],
    perspective: {
      role: 'candidate',
      roleLabel: '求职者视角',
      badge: { label: '优先投递', tone: 'strong' },
      headline: '技术栈对得上，可以直接投',
      summary: '核心要求覆盖良好，仅需微调关键词。',
      sections: [
        { key: 'advantages', title: '匹配优势', hint: '', items: [{ text: 'Vue3 项目可验证', tag: '强', note: '' }] },
        { key: 'gaps', title: '能力差距', hint: '', items: [{ text: '缺 Node.js 证据', tag: '缺口', note: '可迁移' }] }
      ]
    },
    meta: { engine: 'local', masked: true, thresholds: { strong: 75 } },
    generatedAt: '2026-11-21T10:00:00.000Z',
    skillVersion: 'job-fit@1.3.0'
  };
  const second = JSON.parse(JSON.stringify(base));
  second.overallScore = 71;
  second.perspective.role = 'interviewer';
  second.perspective.roleLabel = '面试官视角';
  second.perspective.badge = { label: '可以进入面试', tone: 'good' };
  second.perspective.sections = [
    { key: 'evidence', title: '岗位匹配证据', hint: '', items: [{ text: '性能优化有量化结果', tag: '高', note: '可深挖' }] }
  ];
  second.generatedAt = '2026-11-21T11:30:00.000Z';

  const job = {
    jobTitle: '高级前端工程师', company: 'ZZ网络', location: '深圳', salary: '25-40K',
    description: '岗位职责：负责前端架构与性能优化\n任职要求：本科及以上，3-5 年前端经验；精通 Vue/React',
    companySize: '500-999 人', expRequirement: '3-5 年', eduRequirement: '本科',
    skillsRequired: 'Vue, TypeScript', benefits: '五险一金', sourceUrl: '', industry: '企业服务', legalEntity: ''
  };

  const a = ST.makeRecord({ job, prefs: { city: '深圳', salary: '30K' }, result: base, at: base.generatedAt, id: 'rec-a' });
  const b = ST.makeRecord({ job, prefs: { city: '深圳', salary: '' }, result: second, at: second.generatedAt, id: 'rec-b' });
  const payload = ST.toStore([a, b], ['rec-deleted'], { note: '导出说明' });
  payload.exportedAt = '2026-11-21T12:00:00.000Z';
  return { payload, records: [a, b] };
}

/* ================= 用例 ================= */
test('ZIP 部件齐全且 CRC 与内容一致', () => {
  const { X, RX } = load();
  const { payload } = fixture();
  const built = RX.build(payload, { date: new Date('2026-11-21T12:00:00Z') });
  const files = readZip(built.bytes);

  const need = [
    '[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml',
    'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml'
  ];
  need.forEach((n) => assert.ok(files.has(n), '缺少部件：' + n));
  assert.equal(files.get('[Content_Types].xml').method, 0, '应为 store 方式（无压缩）');

  for (const [name, f] of files) {
    assert.equal(X.crc32(f.data), f.crc, 'CRC 不匹配：' + name);
    assert.ok(f.data.length > 0, '部件为空：' + name);
  }
});

test('分析记录表头顺序与导出 JSON 的键顺序一致', () => {
  const { RX } = load();
  const { payload } = fixture();
  const files = readZip(RX.build(payload).bytes);
  const rows = rowsOf(sheet(files, sheetIndex(files, '分析记录')));
  const header = rows[0].map((c) => c.value);

  assert.equal(header.join('|'), RX.COLS.map((c) => c.h).join('|'), '表头应按 COLS 顺序');
  // 与 store.js makeRecord 的键顺序逐项对齐（顺序即 JSON 里看到的顺序）
  assert.equal(header.slice(0, 10).join(','),
    'id,schema,at,atMs,role,roleLabel,badge,jobKey,jobTitle,company');
  assert.equal(header[10], 'job.jobTitle');
  assert.equal(header[10 + RX.JOB_COLS.length - 1], 'job.legalEntity');
  assert.deepEqual(header.slice(-2), ['meta.model', 'meta.contract']);
  assert.equal(rows.length, payload.records.length + 1, '每条记录一行');
});

test('数值字段写成数字，文本字段写成内联字符串', () => {
  const { RX } = load();
  const { payload } = fixture();
  const files = readZip(RX.build(payload).bytes);
  const rows = rowsOf(sheet(files, sheetIndex(files, '分析记录')));
  const header = rows[0].map((c) => c.value);
  // 记录按时间倒序（新的在前），按 id 取行，避免依赖排列顺序
  const row = rows.find((r) => r[header.indexOf('id')].value === 'rec-a');
  assert.ok(row, '找不到 rec-a 所在行');
  const cell = (k) => row[header.indexOf(k)];

  assert.equal(cell('atMs').type, 'num');
  assert.equal(cell('atMs').value, payload.records.find((r) => r.id === 'rec-a').atMs);
  assert.equal(cell('result.overallScore').type, 'num');
  assert.equal(cell('result.overallScore').value, 78);
  assert.equal(cell('result.confidence').type, 'num');
  assert.equal(cell('id').type, 'str');
  assert.equal(cell('id').value, 'rec-a');
  // jobKey 里的控制符 U+0001 在表内换成「 | 」，避免单元格出现不可见字符
  assert.ok(!cell('jobKey').value.includes('\u0001'));
  assert.ok(cell('jobKey').value.includes('|'));
});

test('数组字段各自拆表，行序即数组顺序', () => {
  const { RX } = load();
  const { payload } = fixture();
  const files = readZip(RX.build(payload).bytes);
  const dims = rowsOf(sheet(files, sheetIndex(files, '维度得分')));
  const hard = rowsOf(sheet(files, sheetIndex(files, '硬性条件')));
  const pv = rowsOf(sheet(files, sheetIndex(files, '视角内容')));

  // 两条记录各 4 个维度 → 8 行 + 表头
  assert.equal(dims.length, 1 + 8);
  assert.equal(dims[0].map((c) => c.value).slice(0, 5).join(','), RX.HEAD_COLS.join(','));
  assert.equal(dims[1][5].value, 1);
  assert.equal(dims[1][7].value, '技术技能');
  assert.equal(dims[4][5].value, 4, '第 4 行序号应为 4');

  assert.equal(hard.length, 1 + 4);
  // 视角内容：面试官 1 个条目 + 求职者 2 个小节各 1 条 → 3 行
  assert.equal(pv.length, 1 + 3);
  assert.equal(pv[1][9].value, 1, '条目序号从 1 起');
});

test('记录JSON 表可原样拼回导出 JSON（字段、顺序、内容不变）', () => {
  const { RX } = load();
  const { payload } = fixture();
  const files = readZip(RX.build(payload).bytes);
  const rows = rowsOf(sheet(files, sheetIndex(files, '记录JSON')));
  const text = rows.map((r) => r[0].value).join('\n');
  assert.equal(text, JSON.stringify(payload, null, 2));

  const back = JSON.parse(text);
  assert.equal(back.records.length, 2);
  assert.equal(back.records[0].id, 'rec-b');
  assert.equal(back.records[1].result.skills[1].name, 'Node.js');
  assert.deepEqual(back.deleted, ['rec-deleted']);
  assert.equal(back.count, 2);
  assert.equal(back.note, '导出说明');
  assert.deepEqual(Object.keys(back), Object.keys(payload), '顶层键顺序一致');
});

test('文件名与 MIME 标识', () => {
  const { RX } = load();
  const { payload } = fixture();
  assert.equal(RX.fileName(payload), 'offerfit-records-2026-11-21.xlsx');
  assert.equal(RX.MIME, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.match(RX.fileName({}), /^offerfit-records-\d{4}-\d{2}-\d{2}\.xlsx$/);
});

test('工作表名去非法字符并去重', () => {
  const { X } = load();
  const used = {};
  assert.equal(X.safeName('a/b:c', 0, used), 'a b c');
  assert.equal(X.safeName('', 1, used), 'Sheet2');
  assert.equal(X.safeName('a b c', 2, used), 'a b c(2)');
  assert.ok(X.safeName('x'.repeat(40), 3, used).length <= 31);
});

test('超长单元格按 Excel 上限截断，不产生损坏文件', () => {
  const { X } = load();
  const long = 'a&b'.repeat(20000); // 80000 字符，含需转义的 &
  const xml = X.sheetXml({ name: 's', rows: [['h'], [long]] });
  const cells = [...xml.matchAll(/<c r="[A-Z]+\d+"[^>]*>([\s\S]*?)<\/c>/g)];
  const body = cells[cells.length - 1][1];
  const text = /<t[^>]*>([\s\S]*?)<\/t>/.exec(body)[1];
  assert.ok(unesc(text).length <= 32767, '单元格内容不应超过 Excel 上限（按解码后字符数）');
  assert.ok(unesc(text).endsWith('…[内容过长已截断]'));
  assert.ok(!/&(?!amp;|lt;|gt;|quot;)/.test(text), '截断不能切断 XML 实体');
});

test('空记录导出不抛错（只有表头）', () => {
  const { RX } = load();
  const built = RX.build({ schema: 'offerfit.records/1', count: 0, records: [], deleted: [] });
  const files = readZip(built.bytes);
  const rows = rowsOf(sheet(files, sheetIndex(files, '分析记录')));
  assert.equal(rows.length, 1);
  assert.ok(built.bytes.length > 500);
});
