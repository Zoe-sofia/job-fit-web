/* ============================================================
   engine.js — 本地规则分析引擎
   输出结构对齐 job-fit@1.2.0 契约：
   技术 30 / 经验 25 / 协作 15 / 方向 30，硬性条件不参与加权。
   双评分口径：
   - overallScore：全部启用维度加权（按已知权重归一化）；任一硬性条件 fail 时以 44 分为上限（只降不升）。
   - unconstrainedScore：同一套全维度加权分，但不施加硬性门槛封顶，因此不受硬性条件失败影响；
     无可用维度时为 null。
   所有计算在浏览器内存中完成。
   ============================================================ */
window.OfferFitEngine = (function () {
  'use strict';

  var SKILLS = [
    // 语言
    { n: 'JavaScript', a: ['javascript', 'js'], cat: '语言' },
    { n: 'TypeScript', a: ['typescript', 'ts'], cat: '语言' },
    { n: 'Python', a: ['python'], cat: '语言' },
    { n: 'Java', a: ['java'], cat: '语言' },
    { n: 'Golang', a: ['golang', 'go 语言', 'go语言'], cat: '语言' },
    { n: 'C++', a: ['c++'], cat: '语言' },
    { n: 'C#', a: ['c#', '.net'], cat: '语言' },
    { n: 'PHP', a: ['php'], cat: '语言' },
    { n: 'Ruby', a: ['ruby'], cat: '语言' },
    { n: 'Rust', a: ['rust'], cat: '语言' },
    { n: 'Kotlin', a: ['kotlin'], cat: '语言' },
    { n: 'Swift', a: ['swift'], cat: '语言' },
    { n: 'Shell', a: ['shell', 'bash'], cat: '语言' },
    { n: 'SQL', a: ['sql'], cat: '语言' },

    // 前端
    { n: 'React', a: ['react'], cat: '前端' },
    { n: 'Vue', a: ['vue'], cat: '前端' },
    { n: 'Angular', a: ['angular'], cat: '前端' },
    { n: 'Next.js', a: ['next.js', 'nextjs'], cat: '前端' },
    { n: 'Nuxt', a: ['nuxt'], cat: '前端' },
    { n: 'HTML/CSS', a: ['html', 'css'], cat: '前端' },
    { n: 'Sass/Less', a: ['sass', 'scss', 'less'], cat: '前端' },
    { n: 'Tailwind', a: ['tailwind'], cat: '前端' },
    { n: 'Webpack', a: ['webpack'], cat: '前端' },
    { n: 'Vite', a: ['vite'], cat: '前端' },
    { n: '小程序', a: ['小程序', 'miniprogram'], cat: '前端' },
    { n: 'Flutter', a: ['flutter'], cat: '前端' },
    { n: 'React Native', a: ['react native'], cat: '前端' },
    { n: '微前端', a: ['微前端', 'qiankun'], cat: '前端' },
    { n: '数据可视化', a: ['数据可视化', 'echarts', 'd3.js', 'd3'], cat: '前端' },
    { n: '响应式布局', a: ['响应式', 'responsive'], cat: '前端' },
    { n: '无障碍', a: ['无障碍', 'a11y', 'accessibility'], cat: '前端' },
    { n: 'Three.js', a: ['three.js', 'threejs'], cat: '前端' },

    // 后端
    { n: 'Node.js', a: ['node.js', 'nodejs', 'node'], cat: '后端' },
    { n: 'Spring Boot', a: ['spring boot', 'springboot', 'spring'], cat: '后端' },
    { n: 'Django', a: ['django'], cat: '后端' },
    { n: 'Flask', a: ['flask'], cat: '后端' },
    { n: 'FastAPI', a: ['fastapi'], cat: '后端' },
    { n: 'Express', a: ['express'], cat: '后端' },
    { n: 'NestJS', a: ['nestjs'], cat: '后端' },
    { n: 'gRPC', a: ['grpc'], cat: '后端' },
    { n: 'REST API', a: ['rest', 'restful'], cat: '后端' },
    { n: 'GraphQL', a: ['graphql'], cat: '后端' },
    { n: '微服务', a: ['微服务', 'microservice'], cat: '后端' },
    { n: '消息队列', a: ['消息队列', 'kafka', 'rabbitmq', 'rocketmq'], cat: '后端' },
    { n: '高并发', a: ['高并发'], cat: '后端' },
    { n: '分布式', a: ['分布式'], cat: '后端' },
    { n: '性能优化', a: ['性能优化', '性能调优', '压测'], cat: '后端' },
    { n: '架构设计', a: ['架构设计', '系统设计', '技术方案'], cat: '后端' },

    // 数据 / 存储
    { n: 'MySQL', a: ['mysql'], cat: '数据' },
    { n: 'PostgreSQL', a: ['postgresql', 'postgres', 'pg'], cat: '数据' },
    { n: 'Oracle', a: ['oracle'], cat: '数据' },
    { n: 'MongoDB', a: ['mongodb'], cat: '数据' },
    { n: 'Redis', a: ['redis'], cat: '数据' },
    { n: 'Elasticsearch', a: ['elasticsearch', 'elastic search'], cat: '数据' },
    { n: 'Hive', a: ['hive'], cat: '数据' },
    { n: 'ClickHouse', a: ['clickhouse'], cat: '数据' },
    { n: 'Spark', a: ['spark'], cat: '数据' },
    { n: 'Flink', a: ['flink'], cat: '数据' },
    { n: 'Hadoop', a: ['hadoop'], cat: '数据' },
    { n: '数据库设计', a: ['数据库设计', '数据建模', '表结构设计'], cat: '数据' },
    { n: '分库分表', a: ['分库分表'], cat: '数据' },

    // 云 / 运维
    { n: 'Docker', a: ['docker'], cat: '运维' },
    { n: 'Kubernetes', a: ['kubernetes', 'k8s'], cat: '运维' },
    { n: 'Linux', a: ['linux', 'ubuntu', 'centos'], cat: '运维' },
    { n: 'Nginx', a: ['nginx'], cat: '运维' },
    { n: 'CI/CD', a: ['ci/cd', 'jenkins', 'gitlab ci', '持续集成', '持续交付'], cat: '运维' },
    { n: '云服务', a: ['aws', '阿里云', '腾讯云', 'azure', 'gcp'], cat: '运维' },
    { n: '监控告警', a: ['prometheus', 'grafana', '监控告警', 'zabbix'], cat: '运维' },
    { n: 'Git', a: ['git'], cat: '运维' },

    // 数据 / 业务分析
    { n: '数据分析', a: ['数据分析', '数据洞察', '归因分析'], cat: '分析' },
    { n: '指标体系', a: ['指标体系', '北极星指标'], cat: '分析' },
    { n: 'A/B 测试', a: ['a/b测试', 'ab测试', 'a/b test', 'abtest'], cat: '分析' },
    { n: '用户增长', a: ['用户增长', '增长策略', '拉新'], cat: '分析' },
    { n: '数据仓库', a: ['数据仓库', '数仓'], cat: '分析' },
    { n: 'ETL', a: ['etl', '数据清洗', '数据管道'], cat: '分析' },
    { n: 'BI 工具', a: ['tableau', 'power bi', 'powerbi', 'finebi', '帆软', 'bi报表', 'bi 报表'], cat: '分析' },
    { n: 'Excel', a: ['excel', 'vlookup', '数据透视'], cat: '分析' },
    { n: 'Pandas', a: ['pandas', 'numpy'], cat: '分析' },
    { n: '机器学习', a: ['机器学习', 'machine learning', 'sklearn'], cat: '分析' },
    { n: '深度学习', a: ['深度学习', 'pytorch', 'tensorflow'], cat: '分析' },
    { n: '大模型', a: ['大模型', 'llm', 'gpt', 'prompt 工程', 'prompt工程', 'rag'], cat: '分析' },
    { n: 'NLP', a: ['nlp', '自然语言处理'], cat: '分析' },
    { n: '推荐系统', a: ['推荐系统', '推荐算法'], cat: '分析' },
    { n: '埋点', a: ['埋点', '神策', 'growingio'], cat: '分析' },

    // 产品 / 运营 / 项目
    { n: '需求分析', a: ['需求分析', '需求调研', '需求评审'], cat: '产品' },
    { n: 'PRD', a: ['prd', '需求文档', '产品文档'], cat: '产品' },
    { n: '原型设计', a: ['axure', 'figma', '墨刀', '原型图', '原型设计'], cat: '产品' },
    { n: '项目管理', a: ['项目管理', '项目推进', '项目交付', 'pmp'], cat: '产品' },
    { n: '敏捷开发', a: ['敏捷', 'scrum', '迭代管理'], cat: '产品' },
    { n: '用户研究', a: ['用户研究', '用户访谈', '用户调研'], cat: '产品' },
    { n: '竞品分析', a: ['竞品分析', '行业分析'], cat: '产品' },
    { n: '用户运营', a: ['用户运营', '社群运营', '私域'], cat: '运营', core: false },
    { n: '内容运营', a: ['内容运营', '新媒体', '公众号'], cat: '运营', core: false },
    { n: '活动策划', a: ['活动策划', '活动运营'], cat: '运营', core: false },
    { n: 'SEO/SEM', a: ['seo', 'sem', '信息流投放', '投放优化'], cat: '运营' },
    { n: '转化率优化', a: ['转化率', '留存率', 'gmv'], cat: '运营', core: false },
    { n: '客户成功', a: ['客户成功', '客户维护', '客诉'], cat: '运营', core: false },
    { n: '售前支持', a: ['售前', '方案讲解', '招投标', '投标'], cat: '运营' },

    // 供应链 / 职能
    { n: '生产计划', a: ['生产计划', '排产', '主生产计划', 'mps'], cat: '供应链' },
    { n: '物料计划', a: ['物料计划', 'mrp', '物料需求'], cat: '供应链' },
    { n: '库存管理', a: ['库存管理', '库存周转', '安全库存'], cat: '供应链' },
    { n: '采购管理', a: ['采购', '供应商管理', '询价'], cat: '供应链', core: false },
    { n: '成本控制', a: ['成本控制', '降本', '成本核算'], cat: '供应链' },
    { n: '精益生产', a: ['精益生产', '6s', '六西格玛', 'ie 改善'], cat: '供应链' },
    { n: '质量管理', a: ['质量管理', 'qc', 'qa', 'iso9001'], cat: '供应链' },
    { n: 'ERP 系统', a: ['erp', 'sap', '用友', '金蝶', 'mes'], cat: '供应链' },
    { n: '财务管理', a: ['财务报表', '预算管理', '成本分析', '总账'], cat: '职能' },
    { n: '人力资源', a: ['人力资源', '招聘', '薪酬绩效', '培训体系'], cat: '职能', core: false },
    { n: '法务合规', a: ['法务', '合规', '合同审核'], cat: '职能', core: false },

    // 软技能
    { n: '跨部门协作', a: ['跨部门', '跨团队', '协同'], cat: '协作' },
    { n: '沟通表达', a: ['沟通', '汇报', '表达'], cat: '协作' },
    { n: '团队管理', a: ['团队管理', '带团队', '小组负责人', '管理团队'], cat: '协作' },
    { n: '推动落地', a: ['推动', '落地', 'owner 意识', 'owner意识'], cat: '协作' },
    { n: '抗压能力', a: ['抗压', '高强度'], cat: '协作' },
    { n: '学习能力', a: ['学习能力', '快速学习', '自学'], cat: '协作' },
    { n: '结果导向', a: ['结果导向', '目标导向', '拿结果'], cat: '协作' }
  ];

  var SOFT_KEYS = ['跨部门协作', '沟通表达', '团队管理', '推动落地', '抗压能力', '学习能力', '结果导向'];

  var CITIES = ['北京', '上海', '广州', '深圳', '杭州', '成都', '南京', '武汉', '西安', '苏州', '天津', '重庆',
    '长沙', '郑州', '合肥', '青岛', '宁波', '东莞', '佛山', '厦门', '福州', '济南', '大连', '沈阳',
    '无锡', '珠海', '中山', '惠州', '昆明', '南昌', '贵阳', '南宁', '石家庄', '太原', '哈尔滨', '长春',
    '常州', '温州', '嘉兴', '香港', '澳门', '台北'];

  var CTX = ['负责', '参与', '主导', '独立', '开发', '搭建', '设计', '实现', '优化', '维护', '上线', '推动',
    '完成', '撰写', '编写', '管理', '带领', '落地', '重构', '交付', '使用', '基于', '通过', '产出',
    '提升', '降低', '增长', '制定', '统筹', '协调', '跟进', '审核', '分析', '复盘'];

  var TITLE_RE = /([\u4e00-\u9fa5A-Za-z]{2,10}?)(工程师|专员|经理|主管|总监|专家|架构师|分析师|设计师|顾问|助理|研究员)/g;

  /* ---------------- 基础工具 ---------------- */
  function lower(s) { return String(s == null ? '' : s).toLowerCase(); }

  function isAscii(t) { return /^[\x00-\x7F]+$/.test(t); }

  function indexOfTerm(hayLower, term, from) {
    if (!term) return -1;
    var t = isAscii(term) ? term.toLowerCase() : term;
    if (!t) return -1;
    var idx;
    var start = from || 0;
    while ((idx = hayLower.indexOf(t, start)) !== -1) {
      if (!isAscii(t)) return idx;
      var before = idx === 0 ? '' : hayLower.charAt(idx - 1);
      var after = hayLower.charAt(idx + t.length) || '';
      var okB = !/[a-z0-9]/.test(before);
      var okA = !/[a-z0-9]/.test(after);
      if (okB && okA) return idx;
      start = idx + t.length;
    }
    return -1;
  }

  /**
   * 在所有出现位置中优先选择带行为动词的句子作为证据，
   * 避免「岗位名称里出现了关键词」被当成实践经验。
   */
  function bestEvidence(raw, lowerRaw, aliases) {
    var first = null;
    for (var a = 0; a < aliases.length; a++) {
      var from = 0, idx, guard = 0;
      while ((idx = indexOfTerm(lowerRaw, aliases[a], from)) !== -1 && guard < 12) {
        guard++;
        var s = sentenceAt(raw, idx);
        if (!first) first = { sentence: s };
        if (hasCtx(s)) return { sentence: s, strong: true };
        from = idx + Math.max(1, aliases[a].length);
      }
    }
    return first ? { sentence: first.sentence, strong: false } : null;
  }

  function splitList(s) {
    return String(s == null ? '' : s).split(/[，,、;；\n|\/]+/).map(function (x) { return x.trim(); })
      .filter(function (x) { return x.length > 0 && x.length < 40; });
  }

  function sentenceAt(raw, idx) {
    if (idx < 0) return '';
    var start = 0, end = raw.length, i;
    for (i = idx; i >= 0; i--) { if (/[。！？；\n]/.test(raw.charAt(i))) { start = i + 1; break; } }
    for (i = idx; i < raw.length; i++) { if (/[。！？；\n]/.test(raw.charAt(i))) { end = i; break; } }
    return raw.slice(start, end).replace(/\s+/g, ' ').trim();
  }

  function clip(s, n) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  // 「技能：A、B、C」这类清单行不构成实践证据
  function isListLike(s) {
    if (/^(技能|专业技能|技术栈|技能清单|核心技能|IT技能|计算机技能)[:：]?/.test(s)) return true;
    if ((s.match(/、/g) || []).length >= 3 && s.length < 72) return true;
    return false;
  }

  function hasCtx(s) {
    if (isListLike(s)) return false;
    for (var i = 0; i < CTX.length; i++) { if (s.indexOf(CTX[i]) !== -1) return true; }
    return false;
  }

  function lineAt(raw, idx) {
    var s = raw.lastIndexOf('\n', idx);
    var e = raw.indexOf('\n', idx);
    return raw.slice(s + 1, e === -1 ? raw.length : e);
  }

  /* ---------------- 词典匹配 ---------------- */
  function dictEntriesFor(name) {
    var ln = lower(name).replace(/\s+/g, '');
    for (var i = 0; i < SKILLS.length; i++) {
      var s = SKILLS[i];
      if (lower(s.n).replace(/\s+/g, '') === ln) return s;
      for (var j = 0; j < s.a.length; j++) {
        if (s.a[j].replace(/\s+/g, '') === ln) return s;
      }
    }
    // 允许「Vue.js」「React 开发」之类
    for (var k = 0; k < SKILLS.length; k++) {
      if (ln.indexOf(lower(SKILLS[k].n).replace(/\s+/g, '')) !== -1 && ln.length <= SKILLS[k].n.length + 6) return SKILLS[k];
    }
    return null;
  }

  function aliasesOf(name, entry) {
    var a = [];
    if (entry) { a = a.concat(entry.a, [entry.n]); }
    a.push(name);
    var seen = {}, out = [];
    a.forEach(function (x) {
      var k = lower(x);
      if (x && !seen[k]) { seen[k] = 1; out.push(x); }
    });
    return out;
  }

  /* ---------------- 简历事实抽取 ---------------- */
  function mergeIntervals(list) {
    if (!list.length) return [];
    list.sort(function (a, b) { return a[0] - b[0]; });
    var out = [list[0]];
    for (var i = 1; i < list.length; i++) {
      var last = out[out.length - 1];
      if (list[i][0] <= last[1]) last[1] = Math.max(last[1], list[i][1]);
      else out.push(list[i]);
    }
    return out;
  }

  function resumeYears(raw) {
    var now = new Date();
    var nowM = now.getFullYear() * 12 + now.getMonth();
    var re = /(\d{4})\s*[.\-/年]\s*(\d{1,2})(?!\d)\s*月?\s*[-–—~至到]\s*(?:(\d{4})\s*[.\-/年]\s*(\d{1,2})(?!\d)\s*月?|至今|今|现在|present|now)/gi;
    var intervals = [], m;
    while ((m = re.exec(raw)) !== null) {
      var line = lineAt(raw, m.index);
      if (/(教育|学校|大学|学院|学历|就读|毕业|硕士|本科|博士|高中|GPA)/.test(line)) continue;
      var startM = parseInt(m[1], 10) * 12 + (parseInt(m[2], 10) - 1);
      var endM = m[3] ? parseInt(m[3], 10) * 12 + (parseInt(m[4], 10) - 1) : nowM;
      if (endM > startM && startM > 1970 * 12 && endM <= nowM + 12) {
        intervals.push([startM, Math.min(endM, nowM)]);
      }
    }
    var years = 0, span = null;
    if (intervals.length) {
      var merged = mergeIntervals(intervals);
      var total = 0;
      merged.forEach(function (iv) { total += iv[1] - iv[0]; });
      years = total / 12;
      span = { from: merged[0][0], to: merged[merged.length - 1][1] };
    }
    var explicit = 0, mm;
    var rex = /(\d{1,2}(?:\.\d)?)\s*年(?:以上)?(?:的)?(?:工作|从业|相关)?经验/g;
    while ((mm = rex.exec(raw)) !== null) {
      var v = parseFloat(mm[1]);
      if (v > explicit && v < 45) explicit = v;
    }
    years = Math.max(years, explicit);
    if (!years) return { years: null, note: '简历中未识别到可统计的工作年限' };
    var note = '按简历时间区间合并统计约 ' + (Math.round(years * 10) / 10) + ' 年';
    if (explicit && explicit >= years) note = '简历自述约 ' + explicit + ' 年经验';
    return { years: Math.round(years * 10) / 10, note: note };
  }

  var EDU_RANK = { '不限': 0, '大专': 1, '专科': 1, '本科': 2, '学士': 2, '硕士': 3, '研究生': 3, 'MBA': 3, '博士': 4 };
  var EDU_NAME = ['不限', '大专', '本科', '硕士', '博士'];

  function parseEdu(s) {
    var t = String(s || '');
    if (!t.trim()) return null;
    if (t.indexOf('不限') !== -1) return { rank: 0, name: '不限' };
    var best = null;
    Object.keys(EDU_RANK).forEach(function (k) {
      if (t.indexOf(k) !== -1 && (best === null || EDU_RANK[k] > best.rank)) best = { rank: EDU_RANK[k], name: k };
    });
    if (!best) return null;
    if (best.rank === 3 && best.name === '研究生') best.name = '硕士';
    if (best.rank === 2 && best.name === '学士') best.name = '本科';
    if (best.rank === 1 && best.name === '专科') best.name = '大专';
    return best;
  }

  function parseSalary(s) {
    var t = String(s || '').replace(/\s/g, '');
    if (!t || /面议|不限|待定/.test(t)) return null;
    var unit = 1; // 结果统一为 K/月
    var annual = /年|年薪/.test(t) && !/月/.test(t);
    var m = t.match(/(\d+(?:\.\d+)?)\s*[-~—至]\s*(\d+(?:\.\d+)?)(k|K|千|万|w|W)?/);
    var one = t.match(/(\d+(?:\.\d+)?)\s*(k|K|千|万|w|W)(?:以上|\+)?/);
    var lo, hi, u;
    if (m) { lo = parseFloat(m[1]); hi = parseFloat(m[2]); u = m[3] || ''; }
    else if (one) { lo = hi = parseFloat(one[1]); u = one[2]; }
    else {
      var plain = t.match(/(\d{4,6})/);
      if (!plain) return null;
      lo = hi = parseFloat(plain[1]); u = '元';
    }
    if (u === '万' || u === 'w' || u === 'W') { lo *= 10; hi *= 10; unit = 1; }
    else if (u === '元') { lo /= 1000; hi /= 1000; }
    else if (annual) { unit = 1; }
    if (annual) { lo = lo / 12; hi = hi / 12; }
    if (hi < lo) { var tmp = lo; lo = hi; hi = tmp; }
    if (hi > 1000) { lo /= 1000; hi /= 1000; } // 元/月 未带单位
    return { min: Math.round(lo * 10) / 10, max: Math.round(hi * 10) / 10 };
  }

  function parseYearsRange(s) {
    var t = String(s || '');
    if (!t.trim()) return null;
    if (/不限|无要求|应届|在校/.test(t)) return { min: 0, max: null, raw: t };
    var m = t.match(/(\d{1,2}(?:\.\d)?)\s*[-~—至]\s*(\d{1,2}(?:\.\d)?)\s*年/);
    if (m) return { min: parseFloat(m[1]), max: parseFloat(m[2]), raw: t };
    var a = t.match(/(\d{1,2}(?:\.\d)?)\s*年(?:以上|\+|及以上)/);
    if (a) return { min: parseFloat(a[1]), max: null, raw: t };
    var b = t.match(/(\d{1,2})\s*[-~—至]\s*(\d{1,2})\s*年/);
    if (b) return { min: parseFloat(b[1]), max: parseFloat(b[2]), raw: t };
    var c = t.match(/(\d{1,2})\s*年/);
    if (c) return { min: parseFloat(c[1]), max: null, raw: t };
    return null;
  }

  function findCity(s) {
    var t = String(s || '');
    for (var i = 0; i < CITIES.length; i++) { if (t.indexOf(CITIES[i]) !== -1) return CITIES[i]; }
    return null;
  }

  function resumeCity(raw, prefCity) {
    if (prefCity && prefCity.trim()) {
      var p = findCity(prefCity) || prefCity.trim();
      return { city: p, source: '期望城市' };
    }
    var m = String(raw).match(/(现居|现住|所在地|期望城市|期望工作地|意向城市|居住地|所在城市)\s*[:：]?\s*([^\n，。;；|]{2,14})/);
    if (m) {
      var c = findCity(m[2]);
      if (c) return { city: c, source: m[1] };
    }
    var c2 = findCity(raw.slice(0, 400));
    if (c2) return { city: c2, source: '简历首段' };
    return { city: null, source: '' };
  }

  function resumeEdu(raw) {
    var best = null;
    var scan = String(raw);
    for (var i = 0; i < 2; i++) {
      var s = scan;
      if (i === 1) break;
      Object.keys(EDU_RANK).forEach(function (k) {
        if (k === '不限' || k === 'MBA') return;
        if (s.indexOf(k) !== -1 && (best === null || EDU_RANK[k] > best.rank)) best = { rank: EDU_RANK[k], name: k };
      });
    }
    if (!best) return null;
    if (best.rank === 2) best.name = '本科';
    if (best.rank === 3) best.name = '硕士';
    if (best.rank === 1) best.name = '大专';
    if (best.rank === 4) best.name = '博士';
    return best;
  }

  /* ---------------- 技能矩阵 ---------------- */
  function buildSkills(job, resumeRaw) {
    var jdRaw = String(job.description || '');
    var jdLower = lower(jdRaw);
    var resumeLower = lower(resumeRaw);
    var picked = [], seen = {};

    function push(name, source, entry) {
      var key = lower(entry ? entry.n : name).replace(/\s+/g, '');
      if (!key || seen[key]) return;
      seen[key] = 1;
      picked.push({ name: entry ? entry.n : name, entry: entry || null, source: source });
    }

    splitList(job.skillsRequired).forEach(function (n) { push(n, '筛选条件', dictEntriesFor(n)); });

    var jdHits = [];
    SKILLS.forEach(function (s) {
      if (s.core === false) return;
      if (SOFT_KEYS.indexOf(s.n) !== -1) return;
      var hit = -1;
      for (var i = 0; i < s.a.length; i++) { hit = indexOfTerm(jdLower, s.a[i]); if (hit >= 0) break; }
      if (hit < 0) hit = indexOfTerm(jdLower, s.n);
      if (hit >= 0) jdHits.push({ s: s, at: hit });
    });
    jdHits.sort(function (a, b) { return a.at - b.at; });
    jdHits.slice(0, 18).forEach(function (h) { push(h.s.n, 'JD 提取', h.s); });

    var items = picked.slice(0, 22).map(function (p) {
      var aliases = aliasesOf(p.name, p.entry);
      var hit = bestEvidence(resumeRaw, resumeLower, aliases);
      if (!hit) {
        return { name: p.name, status: 'missing', evidence: '', note: '简历中未检索到该技能关键词', source: p.source };
      }
      return {
        name: p.name,
        status: hit.strong ? 'matched' : 'partial',
        evidence: clip(hit.sentence, 96),
        note: hit.strong ? '有使用场景描述' : '仅出现关键词，缺少实践上下文',
        source: p.source
      };
    });
    return items;
  }

  /* ---------------- 职业方向 ---------------- */
  function bigrams(s) {
    var t = String(s || '').replace(/[\s·、,，/（）()\-—|]/g, '');
    var out = [];
    for (var i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
    return out;
  }

  function titleSim(a, b) {
    var A = bigrams(a), B = bigrams(b);
    if (!A.length || !B.length) return 0;
    var set = {}, hit = 0;
    B.forEach(function (x) { set[x] = 1; });
    A.forEach(function (x) { if (set[x]) hit++; });
    return hit / Math.max(A.length, B.length);
  }

  var TITLE_SUFFIX = /(高级|资深|初级|中级|首席|实习|senior|junior|sr\.?|jr\.?|lead)/gi;
  var ROLE_SUFFIX = /(工程师|专员|经理|主管|总监|专家|架构师|分析师|设计师|顾问|研究员|实习生|助理)$/;

  function cleanTitle(t) {
    return String(t || '').replace(TITLE_SUFFIX, '').replace(ROLE_SUFFIX, '').trim();
  }

  function resumeTitles(raw) {
    var out = [], set = {}, m;
    TITLE_RE.lastIndex = 0;
    while ((m = TITLE_RE.exec(raw)) !== null && out.length < 14) {
      var t = (m[1] + m[2]).trim();
      if (t.length < 3 || set[t]) continue;
      set[t] = 1;
      out.push(t);
    }
    return out;
  }

  /* ---------------- 双评分口径：常量与工具 ---------------- */
  // 硬性条件未通过时的匹配度上限（只降不升：取 min(加权分, 44)）
  var HARD_FAIL_SCORE = 44;

  function clampScore(v) {
    v = Number(v);
    if (!isFinite(v)) return 0;
    return Math.max(0, Math.min(100, v));
  }

  // 「不考虑硬性条件约束的综合评分」：全部启用维度按已知权重归一化，
  // 只是不施加硬性门槛的封顶 —— 因此天然不受硬性条件失败影响。
  function unconstrainedOf(dims) {
    var sum = 0, w = 0, incKeys = [], incLabels = [];
    (dims || []).forEach(function (d) {
      if (!d) return;
      var wt = Number(d.weight) || 0;
      if (d.score == null || wt <= 0) return;
      sum += Number(d.score) * wt;
      w += wt;
      incKeys.push(d.key);
      incLabels.push(d.label || d.key);
    });
    return {
      score: w > 0 ? Math.round(clampScore(sum / w)) : null,
      includedKeys: incKeys,
      includedLabels: incLabels,
      excludedKeys: [],
      effectiveWeight: Math.round(w * 10) / 10
    };
  }

  /* ---------------- 主流程 ---------------- */
  function analyze(input) {
    var job = input.job || {};
    var resume = String(input.resume || '');
    var prefs = input.prefs || {};
    var cfg = input.config || {};
    var dimsCfg = cfg.dims || [];
    var th = cfg.thresholds || { strong: 75, good: 60, moderate: 45 };
    var hard = cfg.hard || {};
    var resumeLower = lower(resume);

    /* --- 技能 --- */
    var skills = buildSkills(job, resume);
    var total = skills.length;
    var matched = skills.filter(function (s) { return s.status === 'matched'; }).length;
    var partial = skills.filter(function (s) { return s.status === 'partial'; }).length;
    var missing = skills.filter(function (s) { return s.status === 'missing'; });
    var coverage = total ? (matched + partial * 0.5) / total : 0;

    /* --- 经验 --- */
    var jdYears = parseYearsRange(job.expRequirement) || parseYearsRange(job.description || '');
    var ry = resumeYears(resume);

    /* --- 学历 / 地点 / 薪资 --- */
    var jdEdu = parseEdu(job.eduRequirement) || parseEdu(job.description || '');
    if (jdEdu && jdEdu.rank === 0) jdEdu = null;
    var rEdu = resumeEdu(resume);
    var rc = resumeCity(resume, prefs.city);
    var jobCity = findCity(job.location) || String(job.location || '').trim() || null;
    var jobPay = parseSalary(job.salary);
    var prefPay = parseSalary(prefs.salary);
    var prefTarget = prefPay ? prefPay.min : null;

    /* --- 维度评分 --- */
    var dimNotes = {};

    var techScore = null;
    if (total > 0) {
      techScore = Math.round(20 + 76 * coverage);
      techScore = Math.max(12, Math.min(97, techScore));
      dimNotes.technical = '共识别 ' + total + ' 项要求，' + matched + ' 项有实践证据、' + partial +
        ' 项仅关键词、' + missing.length + ' 项未出现。';
    } else {
      dimNotes.technical = '岗位未提供技能关键词，JD 中也未提取到可比对的技能项，技术维度无法评分。';
    }

    var expScore = null, expNote = '';
    if (jdYears && ry.years != null) {
      var minY = jdYears.min, maxY = jdYears.max;
      if (ry.years >= minY) {
        if (maxY != null && ry.years > maxY + 4) {
          expScore = 70;
          expNote = '经验约 ' + ry.years + ' 年，高于岗位区间 ' + minY + '–' + maxY + ' 年较多，可能存在资历过高或薪资不匹配的问题。';
        } else {
          expScore = Math.min(96, Math.round(86 + Math.min(8, (ry.years - minY) * 1.5)));
          expNote = '经验约 ' + ry.years + ' 年，落在岗位要求（' + (jdYears.raw || (minY + ' 年以上')) + '）区间内。';
        }
      } else {
        var gapY = minY - ry.years;
        expScore = Math.max(24, Math.round(86 - gapY * 19));
        expNote = '经验约 ' + ry.years + ' 年，低于岗位门槛 ' + minY + ' 年约 ' + (Math.round(gapY * 10) / 10) + ' 年。';
      }
    } else if (!jdYears) {
      expNote = '岗位未写明经验年限要求，经验维度不打分（不臆测）。';
    } else {
      expNote = '简历未提供可统计的工作时间区间，经验维度不打分。';
    }

    var softInJd = [];
    SOFT_KEYS.forEach(function (k) {
      for (var i = 0; i < SKILLS.length; i++) {
        if (SKILLS[i].n !== k) continue;
        for (var j = 0; j < SKILLS[i].a.length; j++) {
          if (indexOfTerm(lower(job.description || ''), SKILLS[i].a[j]) >= 0) { softInJd.push(SKILLS[i]); break; }
        }
      }
    });
    var behScore = null, behNote = '';
    if (softInJd.length) {
      var softHit = softInJd.filter(function (s) {
        return s.a.some(function (al) { return indexOfTerm(resumeLower, al) >= 0; });
      });
      var softCov = softHit.length / softInJd.length;
      behScore = Math.round(42 + 52 * softCov);
      behNote = 'JD 提及 ' + softInJd.length + ' 项协作/特质要求，简历中可对应 ' + softHit.length + ' 项。' +
        (softCov < 0.5 ? '这类描述主观性强，分数仅供参考。' : '');
    } else {
      behNote = '岗位描述未提及协作方式或团队文化，按契约标记为无法判断。';
    }

    var titles = resumeTitles(resume);
    var coreTitle = cleanTitle(job.jobTitle) || job.jobTitle || '';
    if (coreTitle.length < 2) coreTitle = job.jobTitle || '';
    var bestSim = 0, bestTitle = '';
    titles.forEach(function (t) {
      var ct = cleanTitle(t) || t;
      var s = titleSim(coreTitle, ct);
      // 目标职能被完整包含在既往头衔中（如「计划经理」vs「生产计划专员」）
      if (coreTitle.length >= 2 && ct.indexOf(coreTitle) !== -1) s = Math.max(s, 0.56 + 0.44 * s);
      if (s > bestSim) { bestSim = s; bestTitle = t; }
    });
    var industryMatch = 0, industryNote = '';
    if (job.industry && job.industry.trim()) {
      var parts = splitList(job.industry);
      var hits = parts.filter(function (p) { return p.length >= 2 && resumeLower.indexOf(lower(p)) !== -1; });
      industryMatch = hits.length ? 1 : 0;
      industryNote = hits.length ? '行业关键词命中：' + hits.join('、') + '。' : '简历中未见「' + job.industry + '」相关行业经历。';
    } else {
      industryMatch = 0.5;
      industryNote = '岗位未填写行业，行业维度按中性处理。';
    }
    var careerScore = Math.round(34 + 42 * bestSim + 16 * industryMatch);
    careerScore = Math.max(22, Math.min(95, careerScore));
    var titleDesc;
    if (!bestTitle) {
      titleDesc = '简历中未识别到明确的岗位头衔，职能重合度无法充分判断。';
    } else if (bestSim >= 0.85) {
      titleDesc = '简历中「' + bestTitle + '」与目标岗位「' + job.jobTitle + '」属于同一职能序列，方向衔接自然。';
    } else {
      titleDesc = '简历中「' + bestTitle + '」与目标岗位「' + job.jobTitle + '」的职能重合度约 ' + Math.round(bestSim * 100) + '%。';
    }
    var careerNote = titleDesc + industryNote;

    var dimDefs = [
      { key: 'technical', fallbackLabel: '技术技能', score: techScore, note: dimNotes.technical, weight: 30 },
      { key: 'experience', fallbackLabel: '经验匹配', score: expScore, note: expNote, weight: 25 },
      { key: 'behavior', fallbackLabel: '协作特质', score: behScore, note: behNote, weight: 15 },
      { key: 'career', fallbackLabel: '职业方向', score: careerScore, note: careerNote, weight: 30 }
    ];

    var techEvidence = skills.filter(function (s) { return s.status === 'matched'; })
      .slice(0, 3).map(function (s) { return s.name + '：' + s.evidence; });
    if (ry.years != null) techEvidence.push(ry.note);
    var dimEvidence = {
      technical: techEvidence,
      experience: ry.note ? [ry.note] : [],
      behavior: softInJd.slice(0, 3).map(function (s) { return 'JD 要求：' + s.n; }),
      career: bestTitle ? ['简历头衔：' + bestTitle] : []
    };

    var dims = [], wKnown = 0, wScore = 0;
    dimDefs.forEach(function (d) {
      var c = null;
      for (var i = 0; i < dimsCfg.length; i++) { if (dimsCfg[i].key === d.key) { c = dimsCfg[i]; break; } }
      var enabled = c ? c.on !== false : true;
      var weight = c ? Number(c.weight) : d.weight;
      if (!isFinite(weight) || weight < 0) weight = 0;
      var label = (c && c.label && c.label.trim()) ? c.label.trim() : d.fallbackLabel;
      var score = enabled ? d.score : null;
      if (score != null && weight > 0) { wKnown += weight; wScore += score * weight; }
      dims.push({
        key: d.key, label: label,
        score: score != null ? Math.round(score) : null,
        weight: weight,
        note: enabled ? d.note : '该维度已关闭，不参与计算。',
        evidence: enabled ? (dimEvidence[d.key] || []) : []
      });
    });

    // 全部启用维度的加权分（未封顶）= 「不考虑硬性条件约束的综合评分」的原始值
    var weightedScore = wKnown > 0 ? wScore / wKnown : 0;
    var unconstrained = unconstrainedOf(dims);
    var confidence = Math.round(Math.max(0, Math.min(100, wKnown)));

    /* --- 硬性条件 --- */
    var hcs = [];
    if (hard.location !== false) {
      if (!jobCity) hcs.push({ label: '工作地点', status: 'unknown', note: '岗位未填写工作地点。' });
      else if (!rc.city) hcs.push({ label: '工作地点', status: 'unknown', note: '未提供期望城市，简历中也未识别到现居城市（岗位：' + jobCity + '）。' });
      else if (rc.city === jobCity) hcs.push({ label: '工作地点', status: 'pass', note: '期望/现居「' + rc.city + '」与岗位地点一致。' });
      else hcs.push({ label: '工作地点', status: 'flag', note: '岗位在「' + jobCity + '」，你的期望/现居为「' + rc.city + '」，需确认异地或搬迁意愿。' });
    }
    if (hard.experience !== false) {
      if (!jdYears) hcs.push({ label: '经验年限', status: 'unknown', note: '岗位未标注经验要求。' });
      else if (ry.years == null) hcs.push({ label: '经验年限', status: 'unknown', note: '简历未提供可统计的年限。' });
      else {
        var shortBy = jdYears.min - ry.years;
        if (shortBy <= 0) hcs.push({ label: '经验年限', status: 'pass', note: '要求 ' + (jdYears.raw || jdYears.min + ' 年以上') + '，实际约 ' + ry.years + ' 年。' });
        else if (shortBy < 1) hcs.push({ label: '经验年限', status: 'flag', note: '距门槛差约 ' + (Math.round(shortBy * 12)) + ' 个月，可用项目深度弥补。' });
        else hcs.push({ label: '经验年限', status: 'fail', note: '要求 ' + (jdYears.raw || jdYears.min + ' 年以上') + '，实际约 ' + ry.years + ' 年，差 ' + (Math.round(shortBy * 10) / 10) + ' 年。' });
      }
    }
    if (hard.education !== false) {
      if (!jdEdu) hcs.push({ label: '学历门槛', status: 'unknown', note: '岗位未标注学历要求。' });
      else if (!rEdu) hcs.push({ label: '学历门槛', status: 'unknown', note: '简历中未识别到学历信息（岗位要求：' + jdEdu.name + '）。' });
      else if (rEdu.rank >= jdEdu.rank) hcs.push({ label: '学历门槛', status: 'pass', note: '要求 ' + EDU_NAME[jdEdu.rank] + '，简历为 ' + rEdu.name + '。' });
      else hcs.push({ label: '学历门槛', status: 'fail', note: '要求 ' + EDU_NAME[jdEdu.rank] + '，简历为 ' + rEdu.name + '，通常为硬性门槛。' });
    }
    if (hard.skills !== false) {
      if (!total) hcs.push({ label: '核心技能覆盖', status: 'unknown', note: '未提取到可比的技能项。' });
      else if (coverage >= 0.6) hcs.push({ label: '核心技能覆盖', status: 'pass', note: '覆盖 ' + matched + '/' + total + ' 项（含部分匹配计 0.5）。' });
      else if (coverage >= 0.35) hcs.push({ label: '核心技能覆盖', status: 'flag', note: '仅覆盖 ' + Math.round(coverage * 100) + '%，面试前需补齐 ' + missing.slice(0, 3).map(function (s) { return s.name; }).join('、') + ' 的说明。' });
      else hcs.push({ label: '核心技能覆盖', status: 'fail', note: '覆盖率仅 ' + Math.round(coverage * 100) + '%，与岗位核心要求差距较大。' });
    }
    if (hard.salary !== false) {
      if (!jobPay) hcs.push({ label: '薪资期望', status: 'unknown', note: '岗位薪资为「' + (job.salary || '未填写') + '」，无法量化比对。' });
      else if (!prefTarget) hcs.push({ label: '薪资期望', status: 'unknown', note: '未填写期望月薪，岗位区间约 ' + jobPay.min + '–' + jobPay.max + 'K。' });
      else if (jobPay.max >= prefTarget * 0.95) hcs.push({ label: '薪资期望', status: 'pass', note: '岗位 ' + jobPay.min + '–' + jobPay.max + 'K，覆盖期望 ' + prefTarget + 'K。' });
      else if (jobPay.max >= prefTarget * 0.8) hcs.push({ label: '薪资期望', status: 'flag', note: '岗位上限 ' + jobPay.max + 'K 略低于期望 ' + prefTarget + 'K，可谈空间有限。' });
      else hcs.push({ label: '薪资期望', status: 'fail', note: '岗位上限 ' + jobPay.max + 'K 明显低于期望 ' + prefTarget + 'K。' });
    }

    var failed = hcs.filter(function (h) { return h.status === 'fail'; });
    var flagged = hcs.filter(function (h) { return h.status === 'flag'; });

    // 硬性条件未通过 → 匹配度以 44 分为上限（只降不升：min(加权分, 44)，
    // 原始加权分本就低于 44 时保持原分，不抬高）
    var hardCapApplied = failed.length > 0;
    var capped = Math.round(clampScore(weightedScore));
    var overall = hardCapApplied ? Math.min(capped, HARD_FAIL_SCORE) : capped;

    var verdict = verdictOf(overall, th);

    /* --- 结论文案 --- */
    var topMissing = missing.slice(0, 4).map(function (s) { return s.name; });
    var rec;
    if (failed.length) {
      rec = '暂不建议优先投递：' + failed.map(function (f) { return f.label; }).join('、') +
        '未通过硬性条件，匹配度按规则以 ' + HARD_FAIL_SCORE + ' 分为上限。';
    } else if (verdict === 'strong') {
      rec = '建议优先投递：核心要求覆盖良好，简历可直接投递，仅需微调关键词。';
    } else if (verdict === 'good') {
      rec = '可以投递：主要条件匹配，建议先补强' + (topMissing.length ? topMissing.slice(0, 2).join('、') : '项目量化描述') + '后再投。';
    } else if (verdict === 'moderate') {
      rec = '可尝试投递：存在明显缺口，建议针对性改写简历并准备缺口解释。';
    } else {
      rec = '暂不建议投递：与岗位核心要求差距较大，投入产出比偏低。';
    }

    var sumParts = [];
    if (total) sumParts.push('技能覆盖 ' + Math.round(coverage * 100) + '%（' + matched + ' 项有实践 / 共 ' + total + ' 项要求）');
    if (ry.years != null) sumParts.push('经验约 ' + ry.years + ' 年');
    if (jdYears) sumParts.push('岗位要求 ' + (jdYears.raw || jdYears.min + ' 年以上'));
    if (failed.length) sumParts.push('硬性条件未通过：' + failed.map(function (f) { return f.label; }).join('、') + '（匹配度封顶 ' + HARD_FAIL_SCORE + ' 分）');
    else if (flagged.length) sumParts.push('需确认：' + flagged.map(function (f) { return f.label; }).join('、'));
    var summary = '与「' + (job.company || '目标公司') + ' · ' + (job.jobTitle || '目标岗位') + '」的匹配度为 ' + overall +
      ' 分（置信度 ' + confidence + '%）。' + sumParts.join('；') + '。';
    if (unconstrained.score != null) {
      summary += '不考虑硬性条件约束时，全维度加权的综合评分为 ' + unconstrained.score + ' 分。';
    }

    /* --- 优势 / 缺口 --- */
    var strengths = [];
    skills.filter(function (s) { return s.status === 'matched'; }).slice(0, 4).forEach(function (s) {
      strengths.push(s.name + '：' + (s.evidence || '简历中有对应描述'));
    });
    if (expScore != null && expScore >= 80) strengths.push('经验年限与岗位要求吻合（约 ' + ry.years + ' 年）');
    if (bestSim >= 0.5) strengths.push('岗位职能与既往头衔高度接近（' + bestTitle + '）');
    if (industryMatch === 1) strengths.push('具备「' + job.industry + '」相关行业背景');
    if (!strengths.length) strengths.push('暂未发现可直接引用到该岗位的强证据，建议补充项目细节后重新分析。');

    var gaps = [];
    missing.slice(0, 6).forEach(function (s) { gaps.push(s.name + ' 未在简历中出现'); });
    skills.filter(function (s) { return s.status === 'partial'; }).slice(0, 3).forEach(function (s) {
      gaps.push(s.name + ' 仅有词条提及，缺少使用场景与结果');
    });
    hcs.forEach(function (h) {
      if (h.status === 'fail' || h.status === 'flag') gaps.push(h.label + '：' + h.note);
    });
    if (!gaps.length) gaps.push('未发现显著缺口；面试重点应放在项目深度与业务结果的追问上。');

    /* --- 风险 --- */
    var risks = [];
    hcs.forEach(function (h) {
      if (h.status === 'fail') risks.push('硬性门槛不通过 — ' + h.label + '：' + h.note);
      else if (h.status === 'flag') risks.push('需确认 — ' + h.label + '：' + h.note);
    });
    if (total > 14) risks.push('岗位列出 ' + total + ' 项技能要求，可能存在一人多岗或 JD 与实际工作不符的情况。');
    if (!job.sourceUrl) risks.push('未提供岗位来源链接，建议核实岗位真实性与招聘主体。');
    if (job.company && !job.legalEntity) risks.push('未填写招聘主体（法人），外包/派遣岗位建议先确认劳动关系归属。');
    if (!jdYears) risks.push('岗位未写明经验年限，薪资与职级区间可能弹性较大。');
    if (job.description && !/要求|任职|资格/.test(job.description)) risks.push('JD 未包含「任职要求」段落，需求侧信息不完整，结论置信度下降。');
    if (!risks.length) risks.push('未识别到显著风险；仍建议核实公司近期经营与团队情况。');

    /* --- 经验契合点 --- */
    var fitPoints = [];
    if (expScore != null && expScore >= 78 && jdYears && ry.years != null) {
      fitPoints.push({ req: '岗位要求 ' + (jdYears.raw || jdYears.min + ' 年以上') + ' 经验', ev: '简历时间线合计约 ' + ry.years + ' 年' });
    }
    var jdLines = String(job.description || '').split(/[\n。；;]/).map(function (x) { return x.trim(); })
      .filter(function (x) { return x.length >= 8 && x.length <= 120; });
    var jdLineLower = jdLines.map(lower);
    var usedSkills = {};
    for (var si = 0; si < skills.length && fitPoints.length < 4; si++) {
      var sk = skills[si];
      if (sk.status !== 'matched' || usedSkills[sk.name]) continue;
      for (var li = 0; li < jdLines.length; li++) {
        var entry = dictEntriesFor(sk.name);
        var aliases = aliasesOf(sk.name, entry);
        var inJd = aliases.some(function (al) { return indexOfTerm(jdLineLower[li], al) >= 0; });
        if (inJd && /要求|负责|熟悉|具备|掌握|经验|能力/.test(jdLines[li])) {
          fitPoints.push({ req: jdLines[li], ev: sk.evidence || ('简历提到 ' + sk.name) });
          usedSkills[sk.name] = 1;
          break;
        }
      }
    }
    if (!fitPoints.length) fitPoints.push({ req: '岗位要求未拆解出可比对的条目', ev: '建议补充 JD 原文后再分析' });

    /* --- 改进建议 --- */
    var advice = [];
    missing.slice(0, 3).forEach(function (s) {
      advice.push('针对「' + s.name + '」补一条证据：在项目段落写清场景、你的具体动作和可量化结果（如「用 ' + s.name + ' 将 X 从 A 降到 B」）；确实没有实践时，不要虚构，改用可迁移能力说明。');
    });
    skills.filter(function (s) { return s.status === 'partial'; }).slice(0, 2).forEach(function (s) {
      advice.push('「' + s.name + '」目前只出现在技能清单里，建议移到项目描述中并补一句结果，避免被判定为只知道名词。');
    });
    if (failed.length) advice.push('先解决硬性门槛：' + failed.map(function (f) { return f.label; }).join('、') + '。若确实不满足，优先投递门槛相近的岗位，或通过内推争取放宽。');
    if (flagged.length) advice.push('提前准备可解释项：' + flagged.map(function (f) { return f.label; }).join('、') + '，在沟通中主动给出方案（如到岗时间、薪资弹性）。');
    if (total && coverage < 0.7) advice.push('按 JD 顺序重排简历技能栏，把岗位最靠前的要求放到最显眼位置，提升初筛关键词命中率。');
    advice.push('投递前用岗位名称与核心技能替换简历里的泛化表述（如「负责相关工作」→「负责 X 系统的 Y 模块」）。');
    advice = advice.slice(0, 6);

    var generatedAt = new Date().toISOString();
    return {
      overallScore: overall,
      unconstrainedScore: unconstrained.score,
      scoreMeta: {
        contract: 'job-fit@1.2.0',
        // 封顶模式：只降不升（min(加权分, 44)）
        capMode: 'min',
        hardCapApplied: hardCapApplied,
        hardCap: HARD_FAIL_SCORE,
        hardFail: failed.map(function (f) { return f.label; }),
        unconstrained: {
          basis: 'all-dims',
          score: unconstrained.score,
          includedKeys: unconstrained.includedKeys,
          includedLabels: unconstrained.includedLabels,
          excludedKeys: unconstrained.excludedKeys,
          effectiveWeight: unconstrained.effectiveWeight
        }
      },
      confidence: confidence,
      verdict: verdict,
      recommendation: rec,
      summary: summary,
      dimensions: dims,
      hardConstraints: hcs,
      strengths: strengths,
      gaps: gaps,
      risks: risks,
      fitPoints: fitPoints,
      skills: skills,
      advice: advice,
      meta: {
        skillCoverage: total ? Math.round(coverage * 100) : null,
        skillTotal: total,
        skillMatched: matched,
        skillPartial: partial,
        skillMissing: missing.length,
        years: ry.years,
        yearsNote: ry.note,
        jdYears: jdYears,
        edu: rEdu,
        city: rc,
        salary: jobPay,
        engine: input.engine || 'local',
        masked: !!input.masked,
        thresholds: th
      },
      evidence: strengths.slice(0, 3),
      generatedAt: generatedAt,
      skillVersion: 'job-fit@1.2.0'
    };
  }

  function verdictOf(score, th) {
    th = th || { strong: 75, good: 60, moderate: 45 };
    if (score >= th.strong) return 'strong';
    if (score >= th.good) return 'good';
    if (score >= th.moderate) return 'moderate';
    if (score >= Math.max(30, th.moderate - 15)) return 'weak';
    return 'poor';
  }

  /* ---------------- 模型调用：提示词与契约校验 ---------------- */
  function buildPrompt(resumeText, job, cfg) {
    var th = (cfg && cfg.thresholds) || { strong: 75, good: 60, moderate: 45 };
    var dims = (cfg && cfg.dims ? cfg.dims : []).filter(function (d) { return d.on !== false; })
      .map(function (d) { return d.label + '(' + d.key + ') 权重 ' + d.weight; }).join('；');

    var jobLines = [
      '岗位名称：' + job.jobTitle,
      '公司名称：' + job.company,
      '工作地点：' + job.location,
      '薪资范围：' + job.salary,
      job.companySize ? '公司规模：' + job.companySize : '',
      job.expRequirement ? '经验要求：' + job.expRequirement : '',
      job.eduRequirement ? '学历要求：' + job.eduRequirement : '',
      job.skillsRequired ? '技能要求：' + job.skillsRequired : '',
      job.benefits ? '福利：' + job.benefits : '',
      job.industry ? '行业：' + job.industry : '',
      job.legalEntity ? '招聘主体：' + job.legalEntity : '',
      job.sourceUrl ? '来源链接：' + job.sourceUrl : '',
      '',
      '岗位描述：',
      job.description
    ].filter(Boolean).join('\n');

    var system = [
      '你是严谨的招聘匹配分析师。只使用候选人简历中的确认事实与岗位描述中的明确要求，禁止臆测。',
      '能力与意愿分开评估；关键词命中不等于具备该技能的实践经验，必须结合上下文判断。',
      '不得编造公司文化，信息不足时标记 unknown。',
      '所有面向用户的文字（recommendation、summary、label、note、strengths、gaps、risks 等）必须使用简体中文。',
      '仅输出一个 JSON 对象，不要输出 markdown 代码块、解释或前后缀文字。',
      'JSON 结构必须严格为：',
      '{"overallScore":number,"unconstrainedScore":number|null,"confidence":number,"verdict":"strong|good|moderate|weak|poor","recommendation":string,"summary":string,' +
      '"dimensions":[{"key":"technical|experience|behavior|career","label":string,"score":number|null,"weight":number,"note":string,"evidence":string[]}],' +
      '"hardConstraints":[{"label":string,"status":"pass|flag|fail|unknown","note":string}],' +
      '"strengths":string[],"gaps":string[],"risks":string[],"advice":string[],"generatedAt":"ISO-8601","skillVersion":"job-fit@1.2.0"}',
      '评分规则：overallScore 为 0-100 的加权总分，按已启用维度权重加权；某维度 score 为 null 时按其余已知权重重新归一化；' +
      'confidence 等于已知维度权重之和（0-100）。' +
      '任一项硬性条件 status 为 fail 时，overallScore 取 min(加权总分, ' + HARD_FAIL_SCORE + ')（只降不升）。',
      'unconstrainedScore 为「不考虑硬性条件约束的综合评分」：与 overallScore 使用同一套全维度加权计算，' +
      '只是不施加硬性门槛封顶，因此任何硬性条件 fail 都不得影响该分值；没有任何维度可评分时输出 null。',
      '判定阈值：strong ≥ ' + th.strong + '，good ≥ ' + th.good + '，moderate ≥ ' + th.moderate + '，更低为 weak/poor。',
      '启用的维度与权重：' + (dims || '技术30/经验25/协作15/方向30') + '。硬性条件（地点、经验、学历、技能覆盖、薪资）只做通过/存疑/不通过判断，不计入加权。'
    ].join('\n');

    var user = [
      '【岗位信息】', jobLines, '',
      '【候选人简历】', resumeText
    ].join('\n');

    return [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ];
  }

  /* ---------------- 模型输出的 JSON 提取与修复 ----------------
     真实接口返回常见这些形态，直接 indexOf('{')~lastIndexOf('}') 粗切会失败：
       1) 对象后面又追加了解释文字，且文字里带括号 → 切片把尾随内容带进来；
       2) 连续输出两个 JSON 对象 → 报 "Unexpected non-whitespace character after JSON"；
       3) Markdown 代码块、行内注释、尾随逗号、智能引号；
       4) 字符串里带裸换行（模型手写多行文本）；
       5) 被 max_tokens 截断，括号没有闭合。
     这里改为：按括号配平切出所有顶层候选 → 逐个解析 → 失败则修复后重试 →
     最后按契约特征挑最像结果的那个，避免误取模型输出的“示例结构”。 */

  // 去掉 BOM、零宽字符与代码块围栏
  function stripNoise(s) {
    return String(s == null ? '' : s)
      .replace(/\uFEFF/g, '')
      .replace(/[\u200B-\u200D\u2060]/g, '')
      .replace(/```[A-Za-z0-9_+-]*/g, '')
      .trim();
  }

  // 按括号配平切出所有顶层 {...}（跳过字符串内的括号），未闭合的尾部也作为候选
  function jsonCandidates(s) {
    var out = [], depth = 0, start = -1, inStr = false, esc = false, i, c;
    for (i = 0; i < s.length; i++) {
      c = s.charAt(i);
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === '{' || c === '[') {
        if (depth === 0) start = c === '{' ? i : -1;
        depth++;
      } else if (c === '}' || c === ']') {
        if (depth > 0) {
          depth--;
          if (depth === 0 && start !== -1) { out.push(s.slice(start, i + 1)); start = -1; }
        }
      }
    }
    if (depth > 0 && start !== -1) out.push(s.slice(start));
    return out;
  }

  // 只转义字符串内部的裸控制字符，避免改写正常的转义序列
  function escapeCtlInStrings(t) {
    var out = '', inStr = false, esc = false, i, c, code;
    for (i = 0; i < t.length; i++) {
      c = t.charAt(i);
      code = t.charCodeAt(i);
      if (inStr) {
        if (esc) { esc = false; out += c; continue; }
        if (c === '\\') { esc = true; out += c; continue; }
        if (c === '"') { inStr = false; out += c; continue; }
        if (code < 0x20) {
          out += c === '\n' ? '\\n' : c === '\r' ? '\\r' : c === '\t' ? '\\t'
            : '\\u' + ('000' + code.toString(16)).slice(-4);
          continue;
        }
        out += c; continue;
      }
      if (c === '"') { inStr = true; }
      out += c;
    }
    return out;
  }

  // 弯引号只在「结构位置」转成 ASCII 引号：字符串内部的中文引号（如 “用户增长”）
  // 必须原样保留，否则会把值截断成非法 JSON。
  function fixQuoteMarks(t) {
    var out = '', inStr = false, esc = false, i, c, rest;
    for (i = 0; i < t.length; i++) {
      c = t.charAt(i);
      if (inStr) {
        if (esc) { esc = false; out += c; continue; }
        if (c === '\\') { esc = true; out += c; continue; }
        if (c === '"') { inStr = false; out += c; continue; }
        if (c === '\u201d') {
          rest = t.slice(i + 1).match(/^\s*([:,}\]])/);
          if (rest) { inStr = false; out += '"'; continue; }
        }
        out += c; continue;
      }
      if (c === '"') { inStr = true; out += c; continue; }
      if (c === '\u201c' || c === '\u201d') { inStr = true; out += '"'; continue; }
      out += c;
    }
    return out;
  }

  function repairJSON(t) {
    var s = fixQuoteMarks(t)
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/:\s*(True|False|None)\b/g, function (m, w) {
        return ': ' + (w === 'True' ? 'true' : w === 'False' ? 'false' : 'null');
      })
      .replace(/:\s*(-?\d+(?:\.\d+)?)\s*分/g, ': $1');
    return escapeCtlInStrings(s);
  }

  // 截断补全：闭合未结束的字符串与括号，并把残缺的键值补成 null
  function autoClose(t) {
    var inStr = false, esc = false, stack = [], i, c;
    for (i = 0; i < t.length; i++) {
      c = t.charAt(i);
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === '{' || c === '[') stack.push(c);
      else if (c === '}' || c === ']') stack.pop();
    }
    if (!stack.length && !inStr) return null;
    var s = t;
    if (inStr) s += '"';
    s = s.replace(/[,\s]+$/, '');
    if (/:\s*$/.test(s)) s += 'null';
    s = s.replace(/,\s*$/, '');
    for (i = stack.length - 1; i >= 0; i--) s += stack[i] === '{' ? '}' : ']';
    return s;
  }

  // 契约特征打分：用来在多个候选里挑出真正的分析结果，而不是模型抄回的示例结构
  function scoreCandidate(c) {
    var sc = 0;
    if (/"overallScore"\s*:\s*-?\d/.test(c)) sc += 4;
    if (/"dimensions"\s*:\s*\[/.test(c)) sc += 2;
    if (/"hardConstraints"\s*:\s*\[/.test(c)) sc += 2;
    if (/"verdict"\s*:\s*"/.test(c)) sc += 1;
    if (/"strengths"\s*:\s*\[/.test(c)) sc += 1;
    return sc;
  }

  // 截断抢救：从后往前的逗号处回退，截到「完整值」再闭合括号
  function salvageTruncated(c) {
    var cuts = [], inStr = false, esc = false, depth = 0, i, ch;
    for (i = 0; i < c.length; i++) {
      ch = c.charAt(i);
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') { inStr = true; continue; }
      if (ch === '{' || ch === '[') depth++;
      else if (ch === '}' || ch === ']') depth--;
      else if (ch === ',' && depth > 0) cuts.push(i);
    }
    cuts = cuts.slice(-80).reverse();
    for (i = 0; i < cuts.length; i++) {
      var closed = autoClose(repairJSON(c.slice(0, cuts[i])));
      if (!closed) continue;
      var o = null;
      try { o = asObject(JSON.parse(repairJSON(closed))); } catch (e) { o = null; }
      if (o) return o;
    }
    return null;
  }

  function asObject(v) {
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : null;
  }

  function extractJSON(text) {
    var raw = String(text == null ? '' : text);
    var s = stripNoise(raw);

    // 1) 整体就是合法 JSON（最快路径）
    try { var direct = asObject(JSON.parse(s)); if (direct) return direct; } catch (e) { /* 继续切分 */ }

    // 2) 按括号配平切出候选，逐个尝试：原样 → 修复 → 截断补全
    var cands = jsonCandidates(s);
    if (!cands.length) {
      throw new Error('模型输出中没有找到 JSON 对象（只返回了解释性文字）。');
    }

    var hits = [];
    cands.forEach(function (c, idx) {
      var fixed = repairJSON(c);
      var tries = [c, fixed];
      var closed = autoClose(fixed);
      // 截断补全后再清一次尾随逗号，避免补出的 } 前留下 ",}"
      if (closed) { tries.push(closed); tries.push(repairJSON(closed)); }
      for (var k = 0; k < tries.length; k++) {
        var o = null;
        try { o = asObject(JSON.parse(tries[k])); } catch (e) { o = null; }
        if (o) { hits.push({ obj: o, score: scoreCandidate(tries[k]), len: tries[k].length, idx: idx }); break; }
      }
    });

    if (hits.length) {
      hits.sort(function (a, b) { return (b.score - a.score) || (b.len - a.len) || (a.idx - b.idx); });
      return hits[0].obj;
    }

    // 3) 截断抢救：只在候选里找，避免把说明文字当 JSON
    var longFirst = cands.slice().sort(function (a, b) { return b.length - a.length; });
    for (var q = 0; q < longFirst.length; q++) {
      var salv = salvageTruncated(longFirst[q]);
      if (salv && scoreCandidate(JSON.stringify(salv)) > 0) return salv;
    }

    // 3) 全部失败：给出能指导下一步的提示，而不是原始英文异常
    var tail = jsonCandidates(s).slice(-1)[0] || s;
    var hint = '模型返回的内容无法解析为单个 JSON 对象。';
    if (/}\s*\{/.test(s) || /]\s*\{/.test(s)) hint = '模型连续输出了多段 JSON，已尝试逐段解析仍失败。';
    else if (!/[}\]]\s*$/.test(tail)) hint = 'JSON 似乎被截断（结尾缺少闭合括号），通常是 max_tokens 不足或输出中断。';
    throw new Error(hint + '已自动尝试括号配平、尾随逗号、智能引号与截断补全，仍无法解析。');
  }

  var STATUS = { pass: 1, flag: 1, fail: 1, unknown: 1 };
  var VERDICTS = { strong: 1, good: 1, moderate: 1, weak: 1, poor: 1 };

  function validateContract(data) {
    var errs = [];
    if (!data || typeof data !== 'object') throw new Error('返回内容不是对象');
    var score = Number(data.overallScore);
    if (!isFinite(score) || score < 0 || score > 100) errs.push('overallScore 缺失或不在 0-100');
    var conf = Number(data.confidence);
    if (!isFinite(conf) || conf < 0 || conf > 100) errs.push('confidence 缺失或不在 0-100');
    // unconstrainedScore 为可选字段：缺失/为 null 时由本地按维度重算，存在时必须合法
    if (data.unconstrainedScore !== undefined && data.unconstrainedScore !== null) {
      var un = Number(data.unconstrainedScore);
      if (!isFinite(un) || un < 0 || un > 100) errs.push('unconstrainedScore 不在 0-100');
    }
    if (!VERDICTS[data.verdict]) errs.push('verdict 取值非法');
    if (!Array.isArray(data.dimensions) || !data.dimensions.length) errs.push('dimensions 为空');
    else {
      data.dimensions.forEach(function (d, i) {
        if (!d || typeof d !== 'object') { errs.push('dimensions[' + i + '] 非法'); return; }
        if (d.score !== null && (!isFinite(Number(d.score)) || Number(d.score) < 0 || Number(d.score) > 100)) errs.push('dimensions[' + i + '].score 非法');
        if (!isFinite(Number(d.weight))) errs.push('dimensions[' + i + '].weight 非法');
      });
    }
    if (!Array.isArray(data.hardConstraints)) errs.push('hardConstraints 缺失');
    else data.hardConstraints.forEach(function (h, i) {
      if (!h || !STATUS[h.status]) errs.push('hardConstraints[' + i + '].status 非法');
    });
    ['strengths', 'gaps'].forEach(function (k) {
      if (!Array.isArray(data[k])) errs.push(k + ' 必须是数组');
    });
    if (errs.length) throw new Error('返回结构不符合契约：' + errs.slice(0, 3).join('；'));
    return data;
  }

  return {
    analyze: analyze,
    buildPrompt: buildPrompt,
    extractJSON: extractJSON,
    validateContract: validateContract,
    verdictOf: verdictOf,
    HARD_FAIL_SCORE: HARD_FAIL_SCORE,
    clampScore: clampScore,
    unconstrainedOf: unconstrainedOf,
    parseSalary: parseSalary,
    parseYearsRange: parseYearsRange,
    resumeYears: resumeYears,
    parseEdu: parseEdu,
    DEFAULT_DIMS: [
      { key: 'technical', label: '技术技能', weight: 30, on: true, hint: '硬技能覆盖与深度' },
      { key: 'experience', label: '经验匹配', weight: 25, on: true, hint: '年限、职责量级' },
      { key: 'behavior', label: '协作特质', weight: 15, on: true, hint: 'JD 中的软性要求' },
      { key: 'career', label: '职业方向', weight: 30, on: true, hint: '职能与行业连续性' }
    ]
  };
})();
