/* ============================================================
   store.js — 岗位分析记录仓库（纯函数，不碰 DOM、不碰存储）
   设计约束：
   1) 追加式：同岗位的多次分析、同一结果的多个视角，都是独立记录，
      永不覆盖、不合并、不按岗位去重；去重只看记录 id。
   2) 每条记录自带岗位快照、视角、生成时间与完整分析结果，
      因此记录可独立阅读、独立导出，不依赖「最新一次」。
   3) 可序列化：导出的 JSON 能直接放回仓库 data/records.json 作为基线。
   排序口径：at 倒序（新的在前），同一毫秒按 id 兜底，保证渲染稳定。
   ============================================================ */
(function (root) {
  'use strict';

  var SCHEMA = 'offerfit.records/1';
  // 单机保留上限：仅防止无限增长撑爆浏览器存储，不按岗位限制条数
  var MAX_RECORDS = 200;

  var JOB_FIELDS = ['jobTitle', 'company', 'location', 'salary', 'description', 'companySize',
    'expRequirement', 'eduRequirement', 'skillsRequired', 'benefits', 'sourceUrl', 'industry', 'legalEntity'];

  function text(v) { return v == null ? '' : String(v); }

  // 归一化：忽略空白、全半角括号与大小写差异，避免「同一岗位」被拆成两组
  function normText(v) {
    return text(v)
      .replace(/[\s\u3000]+/g, '')
      .replace(/[（]/g, '(').replace(/[）]/g, ')')
      .toLowerCase();
  }

  function jobKeyOf(job) {
    job = job || {};
    return normText(job.company) + '\u0001' + normText(job.jobTitle);
  }

  function pickJob(job) {
    var out = {};
    JOB_FIELDS.forEach(function (k) { out[k] = text(job && job[k]); });
    return out;
  }

  function roleInfo(result) {
    var pv = result && result.perspective;
    var role = pv && pv.role === 'interviewer' ? 'interviewer' : 'candidate';
    return {
      role: role,
      roleLabel: text(pv && pv.roleLabel) || (role === 'interviewer' ? '面试官视角' : '求职者视角'),
      badge: text(pv && pv.badge && pv.badge.label)
    };
  }

  function newId(ms) {
    return 'r' + Number(ms || Date.now()).toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function timeOf(v) {
    var ms = Number(v);
    if (isFinite(ms) && ms > 0) return ms;
    var t = Date.parse(text(v));
    return isFinite(t) ? t : 0;
  }

  /* ---------------- 记录构造 ---------------- */
  // input: { job, prefs, result(已序列化), at, meta, id }
  function makeRecord(input) {
    input = input || {};
    var result = input.result && typeof input.result === 'object' ? input.result : {};
    var job = pickJob(input.job);
    var rl = roleInfo(result);
    var atMs = timeOf(input.at) || Date.now();
    var meta = input.meta || {};
    var rMeta = result.meta || {};
    return {
      id: text(input.id) || newId(atMs),
      schema: SCHEMA,
      at: new Date(atMs).toISOString(),
      atMs: atMs,
      role: rl.role,
      roleLabel: rl.roleLabel,
      badge: rl.badge,
      jobKey: jobKeyOf(job),
      jobTitle: job.jobTitle,
      company: job.company,
      job: job,
      prefs: {
        city: text(input.prefs && input.prefs.city),
        salary: text(input.prefs && input.prefs.salary)
      },
      result: result,
      meta: {
        source: text(meta.source) || 'local',
        engine: text(rMeta.engine) || text(meta.engine) || 'local',
        model: text(meta.model) || text(rMeta.model),
        contract: text(meta.contract) || text((result.scoreMeta && result.scoreMeta.contract) || result.skillVersion)
      }
    };
  }

  /* ---------------- 归一化与排序 ---------------- */
  function normalize(list) {
    var out = [];
    var seen = {};
    (Array.isArray(list) ? list : []).forEach(function (raw) {
      if (!raw || typeof raw !== 'object') return;
      if (!raw.result || typeof raw.result !== 'object') return; // 没有分析内容的条目不算记录
      if (typeof raw.result.overallScore !== 'number' && !Array.isArray(raw.result.dimensions)) return;
      var job = pickJob(raw.job || { jobTitle: raw.jobTitle, company: raw.company });
      var rl = roleInfo(raw.result);
      var atMs = timeOf(raw.atMs) || timeOf(raw.at) || timeOf(raw.result.generatedAt);
      var id = text(raw.id) || newId(atMs);
      if (seen[id]) return;
      seen[id] = 1;
      out.push({
        id: id,
        schema: SCHEMA,
        at: atMs ? new Date(atMs).toISOString() : text(raw.at),
        atMs: atMs,
        role: raw.role === 'interviewer' || (raw.role !== 'candidate' && rl.role === 'interviewer') ? 'interviewer' : 'candidate',
        roleLabel: text(raw.roleLabel) || rl.roleLabel,
        badge: text(raw.badge) || rl.badge,
        jobKey: text(raw.jobKey) || jobKeyOf(job),
        jobTitle: job.jobTitle,
        company: job.company,
        job: job,
        prefs: {
          city: text(raw.prefs && raw.prefs.city),
          salary: text(raw.prefs && raw.prefs.salary)
        },
        result: raw.result,
        meta: Object.assign({ source: 'local' }, raw.meta || {})
      });
    });
    return sortDesc(out);
  }

  function sortDesc(list) {
    return list.slice().sort(function (a, b) {
      if (b.atMs !== a.atMs) return b.atMs - a.atMs;
      return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
    });
  }

  /* ---------------- 追加 / 删除 ---------------- */
  // 追加一条记录；只有 id 重复才视为同一条，绝不按岗位去重
  function append(list, record, opts) {
    opts = opts || {};
    var max = opts.max || MAX_RECORDS;
    var all = normalize(list);
    if (!record || typeof record !== 'object') return { records: all, added: false, dropped: 0 };
    var one = normalize([record]);
    if (!one.length) return { records: all, added: false, dropped: 0 };
    var rec = one[0];
    if (all.some(function (r) { return r.id === rec.id; })) {
      return { records: all, added: false, dropped: 0 };
    }
    var next = sortDesc(all.concat([rec]));
    var dropped = 0;
    if (next.length > max) {
      dropped = next.length - max;
      next = next.slice(0, max); // 超限只丢最旧的，不影响其余记录
    }
    return { records: next, added: true, dropped: dropped };
  }

  function remove(list, id) {
    return normalize(list).filter(function (r) { return r.id !== id; });
  }

  function find(list, id) {
    var all = normalize(list);
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  // 该记录在其所属岗位里的第几次分析（按时间正序，1 起）
  function ordinal(list, record) {
    if (!record) return 0;
    var same = normalize(list).filter(function (r) { return r.jobKey === record.jobKey; })
      .sort(function (a, b) { return a.atMs - b.atMs || (a.id < b.id ? -1 : 1); });
    for (var i = 0; i < same.length; i++) if (same[i].id === record.id) return i + 1;
    return same.length;
  }

  /* ---------------- 按岗位分组 ---------------- */
  function byJob(list) {
    var all = normalize(list);
    var map = {};
    var groups = [];
    all.forEach(function (r) {
      var g = map[r.jobKey];
      if (!g) {
        g = map[r.jobKey] = {
          key: r.jobKey,
          jobTitle: r.jobTitle,
          company: r.company,
          records: [],
          count: 0,
          candidate: 0,
          interviewer: 0,
          latestAt: r.at,
          latestAtMs: r.atMs,
          best: null
        };
        groups.push(g);
      }
      g.records.push(r);
      g.count += 1;
      if (r.role === 'interviewer') g.interviewer += 1; else g.candidate += 1;
      if (r.atMs > g.latestAtMs) { g.latestAtMs = r.atMs; g.latestAt = r.at; }
      var sc = r.result && typeof r.result.overallScore === 'number' ? r.result.overallScore : null;
      if (sc != null && (!g.best || sc > g.best.score)) {
        g.best = { score: sc, roleLabel: r.roleLabel, at: r.at };
      }
    });
    groups.sort(function (a, b) { return b.latestAtMs - a.latestAtMs; });
    // 组内按时间正序打序号，展示顺序仍是最新在前
    groups.forEach(function (g) {
      g.records.slice().sort(function (a, b) {
        return a.atMs - b.atMs || (a.id < b.id ? -1 : 1);
      }).forEach(function (r, i) { r.seq = i + 1; });
    });
    return groups;
  }

  function stats(list) {
    var all = normalize(list);
    var keys = {};
    var out = { total: all.length, jobs: 0, candidate: 0, interviewer: 0 };
    all.forEach(function (r) {
      keys[r.jobKey] = 1;
      if (r.role === 'interviewer') out.interviewer += 1; else out.candidate += 1;
    });
    out.jobs = Object.keys(keys).length;
    return out;
  }

  /* ---------------- 序列化 ---------------- */
  function toStore(records, deleted, extra) {
    var all = normalize(records);
    var payload = {
      schema: SCHEMA,
      updatedAt: new Date().toISOString(),
      count: all.length,
      records: all,
      deleted: (Array.isArray(deleted) ? deleted : []).filter(function (x) { return typeof x === 'string' && x; })
    };
    if (extra && typeof extra === 'object') {
      Object.keys(extra).forEach(function (k) { if (!(k in payload)) payload[k] = extra[k]; });
    }
    return payload;
  }

  // 兼容三种输入：JSON 字符串、纯数组（旧版会话记录）、{records,deleted} 对象
  function parseStore(raw) {
    var data = raw;
    if (typeof raw === 'string') {
      try { data = JSON.parse(raw); } catch (e) { return { records: [], deleted: [] }; }
    }
    if (Array.isArray(data)) return { records: normalize(data), deleted: [] };
    if (!data || typeof data !== 'object') return { records: [], deleted: [] };
    var list = Array.isArray(data.records) ? data.records
      : (Array.isArray(data.history) ? data.history : []);
    var deleted = Array.isArray(data.deleted)
      ? data.deleted.filter(function (x) { return typeof x === 'string' && x; })
      : [];
    return { records: normalize(list), deleted: deleted };
  }

  // 按 id 合并，两边的记录都保留（基线 + 本机，谁也不少）
  function merge(a, b) {
    var map = {};
    var out = [];
    normalize(a).concat(normalize(b)).forEach(function (r) {
      if (map[r.id]) return;
      map[r.id] = 1;
      out.push(r);
    });
    return sortDesc(out);
  }

  root.OfferFitStore = {
    SCHEMA: SCHEMA,
    MAX_RECORDS: MAX_RECORDS,
    JOB_FIELDS: JOB_FIELDS,
    jobKeyOf: jobKeyOf,
    normalize: normalize,
    makeRecord: makeRecord,
    append: append,
    remove: remove,
    find: find,
    ordinal: ordinal,
    byJob: byJob,
    stats: stats,
    sortDesc: sortDesc,
    toStore: toStore,
    parseStore: parseStore,
    merge: merge
  };
})(typeof window !== 'undefined' ? window : this);
