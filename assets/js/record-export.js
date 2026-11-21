/* ============================================================
   record-export.js — 把记录库 payload 转成 Excel 工作表（纯函数）
   口径：导出字段、顺序、内容与原 JSON 导出逐项一致，只是换了载体。
   - 「分析记录」表列顺序 = 导出 JSON 里 record 的键顺序（对象按点号展开）
   - 数组字段不压成一行：维度 / 硬性条件 / 建议 / 视角小节 / 匹配要点 /
     技能各自成表，行序即数组顺序（序号列可还原）
   - 「记录JSON」表是导出内容的逐行原文，字段与顺序完全等于原 JSON 导出，
     需要回灌仓库基线 data/records.json 时整列复制即可
   ============================================================ */
(function (root) {
  'use strict';

  var X = root.OfferFitXlsx;

  var MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  // store.js 的 JOB_FIELDS 顺序，即记录里 job 对象的键顺序
  var JOB_COLS = ['jobTitle', 'company', 'location', 'salary', 'description', 'companySize',
    'expRequirement', 'eduRequirement', 'skillsRequired', 'benefits', 'sourceUrl', 'industry', 'legalEntity'];
  // result 里的字符串数组，类型列沿用原字段名，顺序同 JSON
  var LIST_TYPES = [
    ['strengths', '优势'],
    ['gaps', '缺口'],
    ['risks', '风险'],
    ['advice', '建议'],
    ['evidence', '证据']
  ];

  function txt(v) { return v == null ? '' : String(v); }
  function obj(v) { return v && typeof v === 'object' ? v : {}; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function numOrText(v) { return typeof v === 'number' && isFinite(v) ? v : txt(v); }
  function jsonText(v) {
    if (v == null) return '';
    if (typeof v !== 'object') return txt(v);
    try { return JSON.stringify(v); } catch (e) { return txt(v); }
  }

  function result(r) { return obj(obj(r).result); }
  function pv(r) { return obj(result(r).perspective); }
  function jobOf(r) { return obj(obj(r).job); }

  /* ---------------- 分析记录：列定义（顺序即 JSON 键顺序） ---------------- */
  var COLS = [
    { h: 'id', w: 24, get: function (r) { return r.id; } },
    { h: 'schema', w: 18, get: function (r) { return r.schema; } },
    { h: 'at', w: 21, get: function (r) { return r.at; } },
    { h: 'atMs', w: 15, get: function (r) { return numOrText(r.atMs); } },
    { h: 'role', w: 11, get: function (r) { return r.role; } },
    { h: 'roleLabel', w: 13, get: function (r) { return r.roleLabel; } },
    { h: 'badge', w: 14, get: function (r) { return r.badge; } },
    { h: 'jobKey', w: 26, get: function (r) { return txt(r.jobKey).replace(/\u0001/g, ' | '); } },
    { h: 'jobTitle', w: 20, get: function (r) { return r.jobTitle; } },
    { h: 'company', w: 18, get: function (r) { return r.company; } }
  ];

  JOB_COLS.forEach(function (k) {
    COLS.push({
      h: 'job.' + k,
      w: k === 'description' ? 56 : (k === 'skillsRequired' ? 24 : 16),
      get: function (r) { return jobOf(r)[k]; }
    });
  });

  COLS.push({ h: 'prefs.city', w: 11, get: function (r) { return obj(r.prefs).city; } });
  COLS.push({ h: 'prefs.salary', w: 11, get: function (r) { return obj(r.prefs).salary; } });

  [
    { h: 'result.overallScore', w: 16, get: function (r) { return numOrText(result(r).overallScore); } },
    { h: 'result.unconstrainedScore', w: 20, get: function (r) { return numOrText(result(r).unconstrainedScore); } },
    { h: 'result.scoreMeta', w: 44, get: function (r) { return jsonText(result(r).scoreMeta); } },
    { h: 'result.confidence', w: 14, get: function (r) { return numOrText(result(r).confidence); } },
    { h: 'result.verdict', w: 12, get: function (r) { return result(r).verdict; } },
    { h: 'result.recommendation', w: 52, get: function (r) { return result(r).recommendation; } },
    { h: 'result.summary', w: 52, get: function (r) { return result(r).summary; } },
    { h: 'result.perspective.role', w: 18, get: function (r) { return pv(r).role; } },
    { h: 'result.perspective.roleLabel', w: 18, get: function (r) { return pv(r).roleLabel; } },
    { h: 'result.perspective.badge.label', w: 18, get: function (r) { return obj(pv(r).badge).label; } },
    { h: 'result.perspective.badge.tone', w: 18, get: function (r) { return obj(pv(r).badge).tone; } },
    { h: 'result.perspective.headline', w: 40, get: function (r) { return pv(r).headline; } },
    { h: 'result.perspective.summary', w: 44, get: function (r) { return pv(r).summary; } },
    { h: 'result.meta', w: 44, get: function (r) { return jsonText(result(r).meta); } },
    { h: 'result.generatedAt', w: 21, get: function (r) { return result(r).generatedAt; } },
    { h: 'result.skillVersion', w: 16, get: function (r) { return result(r).skillVersion; } },
    { h: 'meta.source', w: 11, get: function (r) { return obj(r.meta).source; } },
    { h: 'meta.engine', w: 11, get: function (r) { return obj(r.meta).engine; } },
    { h: 'meta.model', w: 18, get: function (r) { return obj(r.meta).model; } },
    { h: 'meta.contract', w: 16, get: function (r) { return obj(r.meta).contract; } }
  ].forEach(function (c) { COLS.push(c); });

  /* ---------------- 各工作表 ---------------- */
  function infoSheet(payload, records, deleted) {
    var rows = [['字段', '值']];
    Object.keys(payload).forEach(function (k) {
      var v = payload[k];
      if (k === 'records') {
        rows.push([k, '见「分析记录」工作表，共 ' + records.length + ' 条']);
      } else if (k === 'deleted') {
        rows.push([k, '见「已删除记录」工作表，共 ' + deleted.length + ' 个 id']);
      } else {
        rows.push([k, typeof v === 'object' && v !== null ? jsonText(v) : v]);
      }
    });
    rows.push([]);
    rows.push(['工作表', '内容']);
    [
      ['分析记录', '每条记录一行；列顺序与导出 JSON 中 record 的键顺序一致，对象按点号展开'],
      ['维度得分', 'result.dimensions，逐维度一行，序号即数组下标'],
      ['硬性条件', 'result.hardConstraints，逐条一行，序号即数组下标'],
      ['建议清单', 'result.strengths / gaps / risks / advice / evidence，按字段与数组顺序逐条一行'],
      ['视角内容', 'result.perspective.sections[].items，按小节顺序与条目顺序逐条一行'],
      ['匹配要点', 'result.fitPoints，逐条一行，序号即数组下标'],
      ['技能明细', 'result.skills，逐项一行，序号即数组下标'],
      ['已删除记录', 'deleted：已删除的记录 id，用于阻止仓库基线把记录带回来'],
      ['记录JSON', '导出内容的逐行原文（无表头）；字段与顺序同原 JSON 导出，整列复制另存为 data/records.json 即可回灌基线'],
      ['关于本文件', '字段、顺序、内容与旧版 JSON 导出一致，仅载体改为 Excel；数值列是数字，可直接排序与求和'],
      ['取值说明：role', 'candidate = 求职者视角，interviewer = 面试官视角'],
      ['取值说明：硬性条件 status', 'pass = 通过，flag = 存疑，fail = 不通过，unknown = 未知'],
      ['取值说明：技能 status', 'matched = 有实践，partial = 仅关键词，missing = 缺失'],
      ['关于 jobKey', '内部归并键（公司 + 控制符 U+0001 + 岗位名）；本表用「 | 」替代该控制符，「记录JSON」表保留原值']
    ].forEach(function (r) { rows.push(r); });
    return { name: '导出说明', rows: rows, widths: [26, 96], wrap: true };
  }

  function recordSheet(records) {
    var rows = [COLS.map(function (c) { return c.h; })];
    records.forEach(function (r) {
      rows.push(COLS.map(function (c) { return c.get(r); }));
    });
    return { name: '分析记录', rows: rows, widths: COLS.map(function (c) { return c.w; }) };
  }

  // 明细表的公共前四列：记录标识，保证每行都能回溯到某条记录
  function head(r) {
    return [r.id, r.at, r.jobTitle, r.company, r.roleLabel];
  }
  var HEAD_COLS = ['记录id', '记录时间', '岗位', '公司', '视角'];
  var HEAD_W = [24, 21, 20, 18, 13];

  function dimSheet(records) {
    var rows = [HEAD_COLS.concat(['序号', 'key', 'label', 'score', 'weight', 'note', 'evidence'])];
    records.forEach(function (r) {
      arr(result(r).dimensions).forEach(function (d, i) {
        rows.push(head(r).concat([
          i + 1,
          obj(d).key,
          obj(d).label,
          numOrText(obj(d).score),
          numOrText(obj(d).weight),
          obj(d).note,
          jsonText(obj(d).evidence)
        ]));
      });
    });
    return { name: '维度得分', rows: rows, widths: HEAD_W.concat([7, 14, 14, 9, 9, 44, 40]) };
  }

  function hardSheet(records) {
    var rows = [HEAD_COLS.concat(['序号', 'label', 'status', 'note'])];
    records.forEach(function (r) {
      arr(result(r).hardConstraints).forEach(function (h, i) {
        rows.push(head(r).concat([i + 1, obj(h).label, obj(h).status, obj(h).note]));
      });
    });
    return { name: '硬性条件', rows: rows, widths: HEAD_W.concat([7, 18, 11, 56]) };
  }

  function listSheet(records) {
    var rows = [HEAD_COLS.concat(['类型', '序号', '内容'])];
    records.forEach(function (r) {
      LIST_TYPES.forEach(function (pair) {
        arr(result(r)[pair[0]]).forEach(function (item, i) {
          rows.push(head(r).concat([pair[0] + '（' + pair[1] + '）', i + 1, txt(item)]));
        });
      });
    });
    return { name: '建议清单', rows: rows, widths: HEAD_W.concat([16, 7, 90]), wrap: true };
  }

  function pvSheet(records) {
    var rows = [HEAD_COLS.concat(['视角档位', '小节key', '小节标题', '小节说明', '条目序号', '内容', '标签', '备注'])];
    records.forEach(function (r) {
      var p = pv(r);
      var tone = obj(p.badge).label;
      arr(p.sections).forEach(function (s) {
        arr(obj(s).items).forEach(function (it, i) {
          rows.push(head(r).concat([
            tone,
            obj(s).key,
            obj(s).title,
            obj(s).hint,
            i + 1,
            obj(it).text,
            obj(it).tag,
            obj(it).note
          ]));
        });
      });
    });
    return { name: '视角内容', rows: rows, widths: HEAD_W.concat([14, 14, 18, 34, 9, 66, 12, 44]), wrap: true };
  }

  function fitSheet(records) {
    var rows = [HEAD_COLS.concat(['序号', 'req', 'ev'])];
    records.forEach(function (r) {
      arr(result(r).fitPoints).forEach(function (f, i) {
        rows.push(head(r).concat([i + 1, obj(f).req, obj(f).ev]));
      });
    });
    return { name: '匹配要点', rows: rows, widths: HEAD_W.concat([7, 44, 56]), wrap: true };
  }

  function skillSheet(records) {
    var rows = [HEAD_COLS.concat(['序号', 'name', 'status', 'evidence', 'note'])];
    records.forEach(function (r) {
      arr(result(r).skills).forEach(function (s, i) {
        rows.push(head(r).concat([i + 1, obj(s).name, obj(s).status, obj(s).evidence, obj(s).note]));
      });
    });
    return { name: '技能明细', rows: rows, widths: HEAD_W.concat([7, 20, 12, 44, 40]), wrap: true };
  }

  function deletedSheet(deleted) {
    var rows = [['序号', '记录id']];
    deleted.forEach(function (id, i) { rows.push([i + 1, id]); });
    return { name: '已删除记录', rows: rows, widths: [7, 24] };
  }

  // 逐行原文：不写表头，保证「整列复制」得到的文本就是可用的 JSON
  function jsonSheet(payload) {
    var text = '';
    try { text = JSON.stringify(payload, null, 2); } catch (e) { text = '{}'; }
    var rows = text.split('\n').map(function (line) {
      // Excel 单元格上限 32767 字符，超长行按 32000 切分，避免被截断
      if (line.length <= 32000) return [line];
      var chunks = [];
      for (var i = 0; i < line.length; i += 32000) chunks.push([line.slice(i, i + 32000)]);
      return chunks;
    });
    var flat = [];
    rows.forEach(function (r) {
      if (Array.isArray(r[0])) r.forEach(function (c) { flat.push(c); });
      else flat.push(r);
    });
    return { name: '记录JSON', rows: flat, widths: [120], header: false, freeze: false, autoFilter: false };
  }

  /* ---------------- 对外接口 ---------------- */
  function sheetsOf(payload) {
    var records = arr(payload && payload.records);
    var deleted = arr(payload && payload.deleted);
    return [
      infoSheet(payload, records, deleted),
      recordSheet(records),
      dimSheet(records),
      hardSheet(records),
      listSheet(records),
      pvSheet(records),
      fitSheet(records),
      skillSheet(records),
      deletedSheet(deleted),
      jsonSheet(payload)
    ];
  }

  function build(payload, opts) {
    if (!X) throw new Error('缺少 XLSX 写入器');
    return X.build(sheetsOf(payload), opts);
  }

  function fileName(payload) {
    var at = payload && payload.exportedAt ? Date.parse(payload.exportedAt) : NaN;
    var d = isFinite(at) ? new Date(at) : new Date();
    var day = d.toISOString().slice(0, 10);
    return 'offerfit-records-' + day + '.xlsx';
  }

  root.OfferFitRecordExport = {
    MIME: MIME,
    COLS: COLS,
    JOB_COLS: JOB_COLS,
    LIST_TYPES: LIST_TYPES,
    HEAD_COLS: HEAD_COLS,
    sheetsOf: sheetsOf,
    build: build,
    fileName: fileName
  };
})(typeof window !== 'undefined' ? window : this);
