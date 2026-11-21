/* ============================================================
   app.js — 交互、校验、渲染
   隐私约定：
   1) API Key 只存在于本模块的闭包变量中，不写 localStorage / sessionStorage，
      不进入 console，不进入 DOM 文本（输入框外），不随报告导出。
   2) 简历原文只在本页内存中；发送给模型前默认脱敏。
   3) 记录默认不保存；开启后仅写 sessionStorage，且可一键清除。
   ============================================================ */
(function () {
  'use strict';

  var P = window.OfferFitPrivacy;
  var E = window.OfferFitEngine;
  var IMP = window.OfferFitImport;

  var $ = function (id) { return document.getElementById(id); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var LS_CFG = 'offerfit.config.v1';
  var SS_HIST = 'offerfit.session.v1';

  var S = {
    resumeRaw: '',
    fileName: '',
    masked: true,
    shield: true,
    engine: 'local',
    apiKey: '',
    maskSend: true,
    keepHist: false,
    outfmt: 'detailed',
    dims: [],
    thresholds: { strong: 75, good: 60, moderate: 45 },
    hard: { location: true, experience: true, education: true, skills: true, salary: true },
    prefs: { city: '', salary: '' },
    result: null,
    history: [],
    busy: false
  };

  // 颜色一律用 CSS 变量，明暗主题下自动适配对比度
  var V = {
    strong: { label: '强匹配', color: 'var(--green)', soft: 'var(--green-soft)' },
    good: { label: '良好', color: 'var(--brand)', soft: 'var(--brand-soft)' },
    moderate: { label: '一般', color: 'var(--amber)', soft: 'var(--amber-soft)' },
    weak: { label: '偏弱', color: 'var(--orange)', soft: 'var(--orange-soft)' },
    poor: { label: '不匹配', color: 'var(--red)', soft: 'var(--red-soft)' }
  };

  /* ================= 初始化 ================= */
  function init() {
    S.dims = E.DEFAULT_DIMS.map(function (d) {
      return { key: d.key, label: d.label, weight: d.weight, on: true, hint: d.hint };
    });
    restoreConfig();
    renderDims();
    bind();
    syncSettingsUI();
    updateWeightSum();
    updateEngineUI();
    updateCounts();
    updateShield();
    syncTheme();
    renderHistory();
  }

  /* ================= 主题 ================= */
  function syncTheme() {
    var T = window.OfferFitTheme;
    var btn = $('btnTheme');
    if (!T || !btn) return;
    var dark = T.get() === 'dark';
    btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
    btn.setAttribute('aria-label', dark ? '切换到明亮模式' : '切换到夜间模式');
    btn.title = dark ? '当前：夜间模式（点击切换）' : '当前：明亮模式（点击切换）';
  }

  function restoreConfig() {
    var raw = null;
    try { raw = localStorage.getItem(LS_CFG); } catch (e) { raw = null; }
    if (!raw) return;
    var c;
    try { c = JSON.parse(raw); } catch (e) { return; }
    if (!c || typeof c !== 'object') return;
    if (Array.isArray(c.dims)) {
      c.dims.forEach(function (saved) {
        for (var i = 0; i < S.dims.length; i++) {
          if (S.dims[i].key === saved.key) {
            if (typeof saved.weight === 'number' && saved.weight >= 0 && saved.weight <= 100) S.dims[i].weight = saved.weight;
            if (typeof saved.on === 'boolean') S.dims[i].on = saved.on;
          }
        }
      });
    }
    if (c.thresholds) {
      ['strong', 'good', 'moderate'].forEach(function (k) {
        var v = Number(c.thresholds[k]);
        if (isFinite(v) && v > 0 && v <= 100) S.thresholds[k] = v;
      });
    }
    if (c.hard) {
      Object.keys(S.hard).forEach(function (k) { if (typeof c.hard[k] === 'boolean') S.hard[k] = c.hard[k]; });
    }
    if (c.outfmt && ['detailed', 'brief', 'json'].indexOf(c.outfmt) !== -1) S.outfmt = c.outfmt;
    if (typeof c.maskSend === 'boolean') S.maskSend = c.maskSend;
    if (typeof c.keepHist === 'boolean') S.keepHist = c.keepHist;
  }

  function saveConfig() {
    var payload = {
      dims: S.dims.map(function (d) { return { key: d.key, weight: d.weight, on: d.on }; }),
      thresholds: S.thresholds,
      hard: S.hard,
      outfmt: S.outfmt,
      maskSend: S.maskSend,
      keepHist: S.keepHist
    };
    try { localStorage.setItem(LS_CFG, JSON.stringify(payload)); } catch (e) { /* 存储被禁用时静默降级 */ }
  }

  /* ================= 维度设置 ================= */
  function renderDims() {
    var box = $('dims');
    box.innerHTML = S.dims.map(function (d) {
      return '<div class="dimrow' + (d.on ? '' : ' is-off') + '" data-key="' + d.key + '">' +
        '<span class="dimrow__cb"><input type="checkbox" id="dim-on-' + d.key + '"' + (d.on ? ' checked' : '') +
        ' aria-label="启用' + esc(d.label) + '维度"></span>' +
        '<label class="dimrow__name" for="dim-w-' + d.key + '">' + esc(d.label) +
        '<em>' + esc(d.hint || '') + '</em></label>' +
        '<input type="number" id="dim-w-' + d.key + '" min="0" max="100" step="1" value="' + d.weight +
        '" aria-label="' + esc(d.label) + '权重">' +
        '</div>';
    }).join('');
  }

  function updateWeightSum() {
    var sum = 0, onCount = 0;
    S.dims.forEach(function (d) { if (d.on) { sum += Number(d.weight) || 0; onCount++; } });
    var el = $('wSum');
    el.textContent = '合计 ' + (Math.round(sum * 10) / 10) + (sum === 100 ? '' : ' / 100');
    el.classList.toggle('is-bad', sum !== 100 || onCount === 0);
  }

  /* ================= 事件 ================= */
  function bind() {
    // 简历输入
    var ta = $('resumeText');
    var timer = null;
    ta.addEventListener('input', function () {
      S.resumeRaw = ta.value;
      clearFieldError('resumeErr');
      clearInvalid(ta);
      updateCounts();
      updateShield();
      clearTimeout(timer);
      timer = setTimeout(updatePreview, 180);
    });

    $('tab-paste').addEventListener('click', function () { switchTab('paste'); });
    $('tab-file').addEventListener('click', function () { switchTab('file'); });

    $('resumeFile').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) handleFile(f);
    });

    var dz = $('dropzone');
    ['dragenter', 'dragover'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('is-over'); });
    });
    ['dragleave', 'dragend'].forEach(function (ev) {
      dz.addEventListener(ev, function () { dz.classList.remove('is-over'); });
    });
    dz.addEventListener('drop', function (e) {
      e.preventDefault();
      dz.classList.remove('is-over');
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleFile(f); else showFileError('没有检测到文件，请重新拖拽。');
    });
    dz.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('resumeFile').click(); }
    });

    // 防止拖到页面空白处时浏览器直接打开文件；输入框内仍允许拖入文本
    ['dragover', 'drop'].forEach(function (ev) {
      document.addEventListener(ev, function (e) {
        var t = e.target;
        var inField = t && t.closest && t.closest('input, textarea');
        if (!inField) e.preventDefault();
      }, false);
    });

    $('btnToggleMask').addEventListener('click', toggleMask);

    // 隐私遮罩：未聚焦时遮住原始输入，避免旁人一眼看到联系方式
    $('resumeText').addEventListener('focus', updateShield);
    $('resumeText').addEventListener('blur', function () { setTimeout(updateShield, 60); });
    $('taMask').addEventListener('click', function () { $('resumeText').focus(); });
    $('btnShield').addEventListener('click', function () {
      S.shield = !S.shield;
      updateShield();
    });

    $('description').addEventListener('input', function () { updateCounts(); clearFieldError('err-description'); clearInvalid(this); });
    ['jobTitle', 'company', 'location', 'salary', 'sourceUrl'].forEach(function (id) {
      $(id).addEventListener('input', function () { clearFieldError('err-' + id); clearInvalid(this); });
    });

    // 引擎切换
    $$('input[name=engine]').forEach(function (r) {
      r.addEventListener('change', function () { S.engine = r.value; updateEngineUI(); });
    });
    $('apiNoKey').addEventListener('change', function () {
      var noKey = this.checked;
      $('apiKey').disabled = noKey;
      $('btnToggleKey').disabled = noKey;
      $('keyReq').style.display = noKey ? 'none' : '';
      clearFieldError('err-apiKey');
    });
    $('btnToggleKey').addEventListener('click', toggleKey);
    $('btnTestApi').addEventListener('click', testApi);
    ['apiBase', 'apiModel', 'apiKey'].forEach(function (id) {
      $(id).addEventListener('input', function () {
        if (id === 'apiKey') S.apiKey = this.value;
        clearFieldError('err-' + id);
        clearInvalid(this);
      });
    });
    // 密钥只进入闭包变量；阻止浏览器自动填充覆盖
    $('apiKey').setAttribute('autocomplete', 'new-password');
    $('apiKey').addEventListener('paste', function () {
      var el = this;
      setTimeout(function () { S.apiKey = el.value; }, 0);
    });

    // 维度
    $('dims').addEventListener('input', function (e) {
      var row = e.target.closest('.dimrow');
      if (!row) return;
      var key = row.getAttribute('data-key');
      var idx = indexOfDim(key);
      if (idx < 0) return;
      if (e.target.type === 'checkbox') {
        S.dims[idx].on = e.target.checked;
        row.classList.toggle('is-off', !e.target.checked);
      } else {
        var v = Number(e.target.value);
        S.dims[idx].weight = isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
      }
      clearFieldError('err-weights');
      updateWeightSum();
      saveConfig();
    });
    $('btnNormW').addEventListener('click', normalizeWeights);
    $('btnResetSet').addEventListener('click', function () {
      S.dims = E.DEFAULT_DIMS.map(function (d) { return { key: d.key, label: d.label, weight: d.weight, on: true, hint: d.hint }; });
      S.thresholds = { strong: 75, good: 60, moderate: 45 };
      S.hard = { location: true, experience: true, education: true, skills: true, salary: true };
      S.outfmt = 'detailed';
      S.maskSend = true;
      renderDims();
      syncSettingsUI();
      updateWeightSum();
      saveConfig();
      clearFieldError('err-weights');
    });

    ['thStrong', 'thGood', 'thModerate'].forEach(function (id) {
      $(id).addEventListener('input', function () {
        var map = { thStrong: 'strong', thGood: 'good', thModerate: 'moderate' };
        var v = Number(this.value);
        if (isFinite(v)) S.thresholds[map[id]] = Math.max(1, Math.min(100, v));
        clearFieldError('err-weights');
        saveConfig();
      });
    });
    ['hcLocation', 'hcExperience', 'hcEducation', 'hcSkills', 'hcSalary'].forEach(function (id) {
      $(id).addEventListener('change', function () {
        var map = { hcLocation: 'location', hcExperience: 'experience', hcEducation: 'education', hcSkills: 'skills', hcSalary: 'salary' };
        S.hard[map[id]] = this.checked;
        saveConfig();
      });
    });
    $$('input[name=outfmt]').forEach(function (r) {
      r.addEventListener('change', function () {
        S.outfmt = r.value;
        saveConfig();
        if (S.result) applyFormat();
      });
    });
    $('optMaskSend').addEventListener('change', function () { S.maskSend = this.checked; saveConfig(); });
    $('optKeep').addEventListener('change', function () {
      S.keepHist = this.checked;
      saveConfig();
      if (!S.keepHist) { S.history = []; try { sessionStorage.removeItem(SS_HIST); } catch (e) {} renderHistory(); }
      else if (S.result) pushHistory(S.result);
    });
    ['prefCity', 'prefSalary'].forEach(function (id) {
      $(id).addEventListener('input', function () { S.prefs[id === 'prefCity' ? 'city' : 'salary'] = this.value; });
    });

    // 分析
    $('btnAnalyze').addEventListener('click', run);
    $('alertClose').addEventListener('click', hideAlert);
    $('alertList').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-target]');
      if (!b) return;
      var el = $(b.getAttribute('data-target'));
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        try { el.focus({ preventScroll: true }); } catch (err) { el.focus(); }
      }
    });

    // 明暗主题
    $('btnTheme').addEventListener('click', function () {
      if (window.OfferFitTheme) window.OfferFitTheme.toggle();
      syncTheme();
    });
    try {
      var mqDark = window.matchMedia('(prefers-color-scheme: dark)');
      var onSysTheme = function () {
        if (!(window.OfferFitTheme && window.OfferFitTheme.hasChoice())) syncTheme();
      };
      if (mqDark.addEventListener) mqDark.addEventListener('change', onSysTheme);
      else if (mqDark.addListener) mqDark.addListener(onSysTheme);
    } catch (e) { /* 老浏览器忽略 */ }

    // 记录详情
    $('histList').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.histitem') : null;
      if (!b) return;
      openHist(Number(b.getAttribute('data-idx')));
    });
    $('btnHistClose').addEventListener('click', closeHist);
    $('btnHistLoad').addEventListener('click', function () { loadHist(histSel); });
    $('btnHistDel').addEventListener('click', function () { delHist(histSel); });
    $('histDlg').addEventListener('click', function (e) { if (e.target === this) closeHist(); });
    $('histDlg').addEventListener('close', function () { histSel = null; });

    $('btnCopy').addEventListener('click', copyJSON);
    $('btnMd').addEventListener('click', downloadMd);
    $('btnClearJob').addEventListener('click', clearJob);
    $('btnClearAll').addEventListener('click', clearAll);
    $('btnClearHist').addEventListener('click', function () {
      S.history = [];
      try { sessionStorage.removeItem(SS_HIST); } catch (e) {}
      renderHistory();
    });
  }

  function switchTab(which) {
    var paste = which === 'paste';
    $('tab-paste').classList.toggle('is-on', paste);
    $('tab-file').classList.toggle('is-on', !paste);
    $('tab-paste').setAttribute('aria-selected', paste ? 'true' : 'false');
    $('tab-file').setAttribute('aria-selected', paste ? 'false' : 'true');
    $('tab-paste').tabIndex = paste ? 0 : -1;
    $('tab-file').tabIndex = paste ? -1 : 0;
    $('panel-paste').hidden = !paste;
    $('panel-file').hidden = paste;
  }

  function updateEngineUI() {
    var api = S.engine === 'api';
    $('apiBox').hidden = !api;
    $('runHint').textContent = api
      ? 'AI 模型 API · 需要密钥 · 速度取决于接口'
      : '本地引擎 · 无需密钥 · 约 1 秒完成';
  }

  function toggleKey() {
    var input = $('apiKey');
    var btn = $('btnToggleKey');
    var show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.textContent = show ? '隐藏' : '显示';
    btn.setAttribute('aria-pressed', show ? 'true' : 'false');
    btn.setAttribute('aria-label', show ? '隐藏密钥' : '显示密钥');
  }

  /* ================= 简历预览 / 脱敏 ================= */
  function updatePreview() {
    var raw = S.resumeRaw;
    var box = $('privacyBox');
    if (!raw || !raw.replace(/\s/g, '')) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    var m = P.mask(raw);
    var stat = m.total ? '已隐藏 ' + m.total + ' 处（' + P.describe(m.counts) + '）' : '未检测到需要隐藏的敏感信息';
    $('maskStat').textContent = stat;
    if (S.masked) {
      $('resumePreview').innerHTML = P.maskHtml(raw);
      $('maskBtnTxt').textContent = '显示原文';
      $('btnToggleMask').setAttribute('aria-pressed', 'true');
    } else {
      $('resumePreview').textContent = raw;
      $('maskBtnTxt').textContent = '隐藏敏感信息';
      $('btnToggleMask').setAttribute('aria-pressed', 'false');
    }
  }

  function updateShield() {
    var has = S.resumeRaw.replace(/\s/g, '').length > 0;
    var focused = document.activeElement === $('resumeText');
    var show = S.shield && has && !focused;
    $('taWrap').classList.toggle('is-masked', show);
    $('taMask').hidden = !show;
    var btn = $('btnShield');
    if (btn) {
      btn.setAttribute('aria-pressed', S.shield ? 'true' : 'false');
      btn.textContent = '隐私遮罩：' + (S.shield ? '开' : '关');
    }
  }

  function toggleMask() {
    S.masked = !S.masked;
    updatePreview();
  }

  function updateCounts() {
    var r = $('resumeText').value.replace(/\s/g, '').length;
    $('resumeCount').textContent = r + ' 字';
    $('resumeHint').textContent = r === 0 ? '建议 300 字以上' : (r < 80 ? '内容偏短，判断会不稳定' : (r < 300 ? '可继续补充项目细节' : '信息量足够'));
    var d = $('description').value.replace(/\s/g, '').length;
    $('descCount').textContent = d + ' 字';
  }

  /* ================= 文件导入 ================= */
  function handleFile(file) {
    clearFieldError('fileErr');
    clearFieldError('resumeErr');
    var size = (file.size / 1024).toFixed(0) + ' KB';
    showFileInfo(esc(file.name), size + ' · 解析中…', false);
    var info = $('fileInfo');
    info.innerHTML = '<b>' + esc(file.name) + '</b><span>' + size + ' · 解析中…</span>';

    IMP.parse(file, function (page, total) {
      info.innerHTML = '<b>' + esc(file.name) + '</b><span>正在读取第 ' + page + '/' + total + ' 页…</span>';
    }).then(function (res) {
      var clean = (res.text || '').replace(/\s/g, '');
      if (clean.length < 20) {
        throw Object.assign(new Error('提取到的文字过少（' + clean.length + ' 字）。该文件可能是扫描件或图片型文档，请改用文字版导出，或直接粘贴内容。'), { code: 'thin' });
      }
      S.resumeRaw = res.text;
      S.fileName = file.name;
      $('resumeText').value = res.text;
      updateCounts();
      updatePreview();
      updateShield();
      info.innerHTML = '<b>' + esc(file.name) + '</b><span class="ok">已解析 ' + clean.length + ' 字' +
        (res.pages ? ' · ' + res.pages + ' 页' : '') + '</span>';
      $('resumeFile').value = '';
    }).catch(function (err) {
      S.fileName = '';
      info.innerHTML = '<b>' + esc(file.name) + '</b><span>解析失败</span>';
      showFileError(err && err.message ? err.message : '文件解析失败，请重试或改为粘贴文本。');
      $('resumeFile').value = '';
    });
  }

  function showFileInfo(name, meta) {
    var info = $('fileInfo');
    info.hidden = false;
    info.innerHTML = '<b>' + name + '</b><span>' + meta + '</span>';
  }

  function showFileError(msg) {
    var el = $('fileErr');
    el.textContent = msg;
    el.hidden = false;
  }

  /* ================= 校验 ================= */
  function collectJob() {
    return {
      jobTitle: $('jobTitle').value.trim(),
      company: $('company').value.trim(),
      location: $('location').value.trim(),
      salary: $('salary').value.trim(),
      description: $('description').value.trim(),
      companySize: $('companySize').value.trim(),
      expRequirement: $('expRequirement').value.trim(),
      eduRequirement: $('eduRequirement').value.trim(),
      skillsRequired: $('skillsRequired').value.trim(),
      benefits: $('benefits').value.trim(),
      sourceUrl: $('sourceUrl').value.trim(),
      industry: $('industry').value.trim(),
      legalEntity: $('legalEntity').value.trim()
    };
  }

  function collectConfig() {
    return {
      dims: S.dims.map(function (d) { return { key: d.key, label: d.label, weight: Number(d.weight) || 0, on: !!d.on }; }),
      thresholds: {
        strong: Number($('thStrong').value) || 75,
        good: Number($('thGood').value) || 60,
        moderate: Number($('thModerate').value) || 45
      },
      hard: S.hard
    };
  }

  function validate() {
    var errs = [];
    var job = collectJob();

    var raw = S.resumeRaw.replace(/\s/g, '');
    if (!raw) {
      errs.push({ msg: '简历内容为空：请粘贴简历全文，或上传 PDF / DOCX 文件。', target: 'resumeText' });
    } else if (raw.length < 30) {
      errs.push({ msg: '简历仅 ' + raw.length + ' 字，无法形成有效判断，请补充到 300 字以上。', target: 'resumeText' });
    }

    if (!job.jobTitle) errs.push({ msg: '请填写岗位名称。', target: 'jobTitle' });
    else if (job.jobTitle.length < 2) errs.push({ msg: '岗位名称至少要 2 个字。', target: 'jobTitle' });
    if (!job.company) errs.push({ msg: '请填写公司名称（用于核对招聘主体）。', target: 'company' });
    if (!job.location) errs.push({ msg: '请填写工作地点，地点是硬性条件之一。', target: 'location' });
    if (!job.salary) errs.push({ msg: '请填写薪资范围；若未知可填「面议」，该项将标记为无法判断。', target: 'salary' });

    var dLen = job.description.replace(/\s/g, '').length;
    if (!dLen) errs.push({ msg: '岗位描述为空：请粘贴 JD 原文（职责 + 任职要求）。', target: 'description' });
    else if (dLen < 40) errs.push({ msg: '岗位描述仅 ' + dLen + ' 字，信息不足（建议 40 字以上，包含职责与要求）。', target: 'description' });

    if (job.sourceUrl && !/^https?:\/\/[^\s]+\.[^\s]+/i.test(job.sourceUrl)) {
      errs.push({ msg: '岗位来源链接格式不正确，需以 http:// 或 https:// 开头。', target: 'sourceUrl' });
    }

    if (S.engine === 'api') {
      var base = $('apiBase').value.trim();
      var model = $('apiModel').value.trim();
      var noKey = $('apiNoKey').checked;
      if (!base) errs.push({ msg: '请填写模型接口地址（Base URL）。', target: 'apiBase' });
      else if (!/^https?:\/\/[^\s]+$/i.test(base)) errs.push({ msg: '接口地址需为完整的 http(s) URL，例如 https://api.openai.com/v1。', target: 'apiBase' });
      if (!model) errs.push({ msg: '请填写模型名称，例如 gpt-4o-mini 或 deepseek-chat。', target: 'apiModel' });
      if (!noKey && !$('apiKey').value.trim()) errs.push({ msg: '请填写 API Key，或勾选「该接口无需密钥」。', target: 'apiKey' });
    }

    var onDims = S.dims.filter(function (d) { return d.on; });
    var wSum = onDims.reduce(function (a, d) { return a + (Number(d.weight) || 0); }, 0);
    if (!onDims.length) errs.push({ msg: '至少要启用一个匹配维度。', target: 'dims' });
    else if (wSum <= 0) errs.push({ msg: '已启用维度的权重合计为 0，请至少给一个维度分配权重。', target: 'dims' });

    var th = { strong: Number($('thStrong').value), good: Number($('thGood').value), moderate: Number($('thModerate').value) };
    if (!(th.strong > th.good && th.good > th.moderate)) {
      errs.push({ msg: '阈值必须严格递减：强匹配 > 良好 > 一般（当前 ' + th.strong + ' / ' + th.good + ' / ' + th.moderate + '）。', target: 'thStrong' });
    } else if (th.strong > 100 || th.moderate < 1) {
      errs.push({ msg: '阈值需在 1–100 之间。', target: 'thStrong' });
    }

    return { ok: errs.length === 0, errors: errs };
  }

  function clearErrors() {
    $$('.err').forEach(function (el) { el.hidden = true; el.textContent = ''; });
    $$('[aria-invalid=true]').forEach(function (el) { el.removeAttribute('aria-invalid'); });
  }

  function clearFieldError(id) {
    var el = $(id);
    if (el) { el.hidden = true; el.textContent = ''; }
  }

  function clearInvalid(el) { if (el && el.removeAttribute) el.removeAttribute('aria-invalid'); }

  function invalidate(target) {
    var el = $(target);
    if (!el) return;
    if (target.indexOf('err-') === 0) return;
    if (el.type === 'radio' || el.type === 'checkbox') return;
    el.setAttribute('aria-invalid', 'true');
    var errId = 'err-' + target;
    var errEl = $(errId) || (target === 'resumeText' ? $('resumeErr') : null);
    if (errEl) {
      errEl.textContent = '';
      var msg = messagesFor(target);
      if (msg) { errEl.textContent = msg; errEl.hidden = false; }
    }
  }

  var MSG_MAP = {};
  function messagesFor(target) {
    return MSG_MAP[target] || '';
  }

  function showAlert(errors) {
    var bar = $('alertBar');
    $('alertTitle').textContent = '还有 ' + errors.length + ' 项需要处理，分析未开始';
    $('alertList').innerHTML = errors.map(function (e) {
      var btn = e.target ? '<button type="button" data-target="' + esc(e.target) + '">定位</button>' : '';
      return '<li>' + esc(e.msg) + ' ' + btn + '</li>';
    }).join('');
    bar.hidden = false;
    bar.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function hideAlert() { $('alertBar').hidden = true; }

  function applyErrors(errors) {
    clearErrors();
    errors.forEach(function (e) {
      if (!e.target) return;
      MSG_MAP[e.target] = e.msg;
      if (e.target === 'resumeText' && $('panel-paste').hidden) switchTab('paste');
      if (e.target === 'dims') {
        var wErr = $('err-weights');
        wErr.textContent = e.msg;
        wErr.hidden = false;
        return;
      }
      invalidate(e.target);
    });
    var first = errors[0];
    var focusId = first && first.target === 'dims' ? 'dims' : (first ? first.target : null);
    if (focusId) {
      var el = $(focusId);
      if (el) {
        try { el.focus({ preventScroll: true }); } catch (err) { /* 容器不可聚焦时忽略 */ }
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  /* ================= 执行分析 ================= */
  function run() {
    if (S.busy) return;
    hideAlert();
    MSG_MAP = {};
    var v = validate();
    if (!v.ok) {
      applyErrors(v.errors);
      showAlert(v.errors);
      return;
    }
    clearErrors();
    $('results').hidden = true;
    syncDisclaimer();

    var job = collectJob();
    var cfg = collectConfig();
    var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    setBusy(true);

    if (S.engine === 'api') {
      runApi(job, cfg, t0);
    } else {
      $('runHint').textContent = '本地引擎计算中…';
      var prefs = { city: $('prefCity').value.trim(), salary: $('prefSalary').value.trim() };
      setTimeout(function () {
        try {
          var r = E.analyze({ resume: S.resumeRaw, job: job, prefs: prefs, config: cfg, engine: 'local' });
          finish(r, t0);
        } catch (err) {
          setBusy(false);
          showAlert([{ msg: '分析过程出错：' + (err && err.message ? err.message : '未知错误') + '。请检查输入内容后重试。', target: 'resumeText' }]);
        }
      }, 140);
    }
  }

  function apiEndpoint(base) {
    var b = String(base || '').trim().replace(/\/+$/, '');
    if (/\/chat\/completions$/i.test(b)) return b;
    return b + '/chat/completions';
  }

  // 把 content / content 数组 / 分片消息统一拼成文本
  function joinParts(c) {
    if (c == null) return '';
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) {
      var s = '';
      for (var i = 0; i < c.length; i++) {
        var p = c[i];
        if (typeof p === 'string') { s += p; continue; }
        if (p && typeof p.text === 'string') s += p.text;
        else if (p && typeof p.content === 'string') s += p.content;
      }
      return s;
    }
    if (typeof c === 'object' && typeof c.text === 'string') return c.text;
    return '';
  }

  // 兼容 Chat Completions / Responses / Anthropic / Ollama / 推理模型
  function extractText(data) {
    var out = { text: '', reasoning: '', finish: '' };
    if (!data || typeof data !== 'object') return out;
    var ch = data.choices && data.choices[0];
    if (ch) {
      out.finish = ch.finish_reason || '';
      var msg = ch.message || ch.delta || {};
      out.text = joinParts(msg.content != null ? msg.content : ch.text);
      if (!out.text) out.reasoning = joinParts(msg.reasoning_content || msg.reasoning);
    }
    if (!out.text && typeof data.output_text === 'string') out.text = data.output_text;
    if (!out.text && Array.isArray(data.output)) {
      data.output.forEach(function (o) {
        (o && Array.isArray(o.content) ? o.content : []).forEach(function (c) {
          if (c && typeof c.text === 'string') out.text += c.text;
        });
      });
    }
    if (!out.text && Array.isArray(data.content)) out.text = joinParts(data.content);
    if (!out.text && typeof data.response === 'string') out.text = data.response;
    if (!out.text && data.message && typeof data.message.content === 'string') out.text = data.message.content;
    out.text = String(out.text || '').trim();
    out.reasoning = String(out.reasoning || '').trim();
    return out;
  }

  // 少数网关即使 stream:false 也会返回 SSE，这里兜底拼装
  function parseBody(raw) {
    var text = String(raw || '').trim();
    if (!text) return null;
    if (text.charAt(0) === '{' || text.charAt(0) === '[') {
      try { return JSON.parse(text); } catch (e) { /* 继续尝试 SSE */ }
    }
    if (/^data:/.test(text)) {
      var acc = '', reason = '', finish = '';
      text.split(/\r?\n/).forEach(function (line) {
        var m = /^data:[ \t]*(.*)$/.exec(line);
        if (!m) return;
        var payload = m[1].trim();
        if (!payload || payload === '[DONE]') return;
        var obj;
        try { obj = JSON.parse(payload); } catch (e) { return; }
        var ch = obj.choices && obj.choices[0];
        if (!ch) return;
        var d = ch.delta || ch.message || {};
        acc += joinParts(d.content);
        var rs = joinParts(d.reasoning_content || d.reasoning);
        if (rs) reason += rs;
        if (ch.finish_reason) finish = ch.finish_reason;
      });
      return { choices: [{ message: { content: acc, reasoning_content: reason }, finish_reason: finish }], _sse: true };
    }
    return null;
  }

  function callApi(messages, timeoutSec, maxTokens) {
    var endpoint = apiEndpoint($('apiBase').value);
    var model = $('apiModel').value.trim();
    var key = String($('apiKey').value || '').trim();
    var noKey = $('apiNoKey').checked;
    var headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (key && !noKey) headers.Authorization = 'Bearer ' + key;

    function friendly(msg, status) {
      var e = new Error(msg);
      e.friendly = true;
      if (status) e.status = status;
      return e;
    }

    // withTokens / withTemp 用于参数被拒时的降级重试
    function post(withTokens, withTemp) {
      return new Promise(function (resolve, reject) {
        var body = { model: model, messages: messages, stream: false };
        if (withTokens && maxTokens) body.max_tokens = maxTokens;
        if (withTemp) body.temperature = 0.2;
        var ctl = null, timer = null;
        try { ctl = new AbortController(); } catch (e) { ctl = null; }
        var init = {
          method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store',
          referrerPolicy: 'no-referrer', headers: headers, body: JSON.stringify(body)
        };
        if (ctl) { init.signal = ctl.signal; timer = setTimeout(function () { ctl.abort(); }, timeoutSec * 1000); }
        fetch(endpoint, init).then(function (res) {
          return res.text().then(function (raw) { return { res: res, raw: raw }; });
        }).then(function (o) {
          if (timer) clearTimeout(timer);
          resolve(o);
        }).catch(function (err) {
          if (timer) clearTimeout(timer);
          reject(err);
        });
      });
    }

    function httpError(o) {
      var detail = '';
      try {
        var j = JSON.parse(o.raw);
        if (j && j.error) detail = typeof j.error === 'string' ? j.error : (j.error.message || '');
      } catch (e) { /* 非 JSON 错误页 */ }
      if (!detail && o.raw) detail = String(o.raw).slice(0, 180);
      var hint;
      if (o.res.status === 401 || o.res.status === 403) hint = '鉴权失败：请检查 API Key 是否有效、是否具备该模型权限。';
      else if (o.res.status === 404) hint = '接口不存在：请确认 Base URL（通常以 /v1 结尾）与模型名称。';
      else if (o.res.status === 429) hint = '请求被限流，请稍后重试或降低调用频率。';
      else if (o.res.status === 400) hint = '请求参数不被接口接受' + (detail ? '：' + detail : '，请检查模型名称与请求格式。');
      else if (o.res.status >= 500) hint = '服务端异常，请稍后重试或更换模型。';
      else hint = '接口返回异常状态。';
      var e = friendly('模型接口调用失败（HTTP ' + o.res.status + '）。' + hint, o.res.status);
      e.detail = String(detail).toLowerCase();
      return e;
    }

    return post(true, true).then(function (o) {
      if (o.res.ok) return o;
      var err = httpError(o);
      var d = err.detail || '';
      // 新版推理模型不接受 max_tokens / temperature：自动降级重试一次
      var retryable = o.res.status === 400 &&
        (d.indexOf('max_tokens') !== -1 || d.indexOf('max_completion_tokens') !== -1 || d.indexOf('temperature') !== -1);
      if (!retryable) throw err;
      return post(false, false).then(function (o2) {
        if (o2.res.ok) return o2;
        throw httpError(o2);
      });
    }).then(function (o) {
      var data = parseBody(o.raw);
      if (!data) throw friendly('接口返回的不是 JSON，也不是 SSE 流，无法解析。请确认 Base URL 指向 OpenAI 兼容的 /chat/completions 接口。');
      if (data.error) {
        var m = typeof data.error === 'string' ? data.error : (data.error.message || '');
        throw friendly('接口返回错误：' + (m || '未知错误'));
      }
      var ex = extractText(data);
      if (ex.text) return ex.text;
      if (ex.reasoning) {
        var re = friendly('接口已连通，但模型只返回了推理内容、没有正文（推理模型的常见表现）。把 max_tokens 调大，或换用非推理模型即可。');
        re.reasoningOnly = true;
        throw re;
      }
      var fin = ex.finish ? '（finish_reason = ' + ex.finish + '）' : '';
      throw friendly('接口返回 200，但没有可用的文本' + fin + '。已依次尝试解析 message.content、content 数组、reasoning_content、output_text，均为空。常见原因：max_tokens 过小被截断、模型不支持该协议、或网关返回了非标准结构。');
    }).catch(function (err) {
      if (err && err.friendly) throw err;
      if (err && (err.name === 'AbortError' || /abort/i.test(err.message || ''))) {
        throw friendly('请求超时（' + timeoutSec + ' 秒）。可改用本地引擎，或换用响应更快的模型。');
      }
      throw friendly('网络请求失败：无法访问该接口。常见原因是接口未开启跨域（CORS），或地址不可达。建议改用本地引擎，或使用同源中转地址。');
    });
  }

  function runApi(job, cfg, t0) {
    $('runHint').textContent = '正在请求模型…';
    var resumeForModel = S.maskSend ? P.maskPlain(S.resumeRaw) : S.resumeRaw;
    if (!resumeForModel.replace(/\s/g, '')) {
      setBusy(false);
      showAlert([{ msg: '脱敏后简历内容为空，请关闭「发送前脱敏」或检查简历。', target: 'resumeText' }]);
      return;
    }
    var messages = E.buildPrompt(resumeForModel, job, cfg);
    // 输出格式不合规时，追加一条强硬约束再请求一次（只重试一次）
    var STRICT = {
      role: 'system',
      content: '上一次输出不是单个合法的 JSON 对象。请严格只输出一个 JSON 对象：' +
        '不要 Markdown 代码块、不要任何解释或前后缀文字、不要在对象之后再输出第二个对象；' +
        '字符串内部不要出现未转义的换行，数组与对象元素之间不要留尾随逗号。'
    };

    function attempt(extra) {
      return callApi(extra ? messages.concat([extra]) : messages, 120).then(function (content) {
        var data = E.extractJSON(content);
        E.validateContract(data);
        var prefs = { city: $('prefCity').value.trim(), salary: $('prefSalary').value.trim() };
        var local = E.analyze({ resume: S.resumeRaw, job: job, prefs: prefs, config: cfg, engine: 'local' });
        var r = normalizeApiResult(data, local, job, cfg);
        finish(r, t0);
      });
    }

    attempt(null).catch(function (err) {
      var msg = (err && err.message) || '';
      var formatIssue = /JSON|解析|Unexpected|position|截断|对象|契约|结构/.test(msg);
      if (!formatIssue) throw err;
      $('runHint').textContent = '模型输出格式异常，正在要求它只返回 JSON 并重试…';
      return attempt(STRICT).catch(function () { throw err; });
    }).catch(function (err) {
      setBusy(false);
      $('runHint').textContent = 'AI 模型 API · 需要密钥 · 速度取决于接口';
      var extra = '';
      if (/跨域|CORS|网络请求失败/i.test(err.message || '')) extra = ' 也可以直接点「开始匹配分析」并切回本地引擎。';
      else if (/JSON|解析|Unexpected|position|截断|对象|契约|结构/.test(err.message || '')) extra = ' 已自动重试一次；若仍失败，可换用输出更稳定的模型，或先切回本地引擎得到结果。';
      showAlert([{ msg: (err && err.message ? err.message : '模型调用失败') + extra }]);
    });
  }

  function normalizeApiResult(data, local, job, cfg) {
    var dims = (data.dimensions || []).map(function (d, i) {
      var key = ['technical', 'experience', 'behavior', 'career'].indexOf(d.key) !== -1 ? d.key
        : (local.dimensions[i] ? local.dimensions[i].key : 'technical');
      return {
        key: key,
        label: d.label || (local.dimensions[i] ? local.dimensions[i].label : '维度'),
        score: d.score === null || d.score === undefined ? null : Math.round(Number(d.score)),
        weight: Number(d.weight) || 0,
        note: d.note || '',
        evidence: Array.isArray(d.evidence) ? d.evidence.filter(Boolean) : []
      };
    });
    if (!dims.length) dims = local.dimensions;

    var th = (cfg && cfg.thresholds) || S.thresholds;
    var hardList = (data.hardConstraints || []).map(function (h) {
      return { label: h.label || '条件', status: h.status || 'unknown', note: h.note || '' };
    });
    var hardFails = hardList.filter(function (h) { return h.status === 'fail'; });
    // 与本地引擎同一口径：总分为全维度加权分，硬性条件 fail 时以 44 为上限（只降不升）
    var unc = E.unconstrainedOf(dims);
    var base = unc.score != null ? unc.score : Math.round(E.clampScore(data.overallScore));
    var overall = hardFails.length ? Math.min(base, E.HARD_FAIL_SCORE) : base;
    var summary = data.summary || '';
    if (unc.score != null && summary.indexOf('不考虑硬性条件') === -1) {
      summary += (summary ? ' ' : '') + '不考虑硬性条件约束时，全维度加权的综合评分为 ' + unc.score + ' 分。';
    }

    return {
      overallScore: overall,
      unconstrainedScore: unc.score == null ? null : base,
      scoreMeta: {
        contract: data.skillVersion || 'job-fit@1.2.0',
        capMode: 'min',
        hardCapApplied: hardFails.length > 0,
        hardCap: E.HARD_FAIL_SCORE,
        hardFail: hardFails.map(function (h) { return h.label; }),
        unconstrained: {
          basis: 'all-dims',
          score: unc.score == null ? null : base,
          includedKeys: unc.includedKeys,
          includedLabels: unc.includedLabels,
          excludedKeys: unc.excludedKeys,
          effectiveWeight: unc.effectiveWeight
        }
      },
      confidence: Math.max(0, Math.min(100, Math.round(Number(data.confidence)))),
      verdict: E.verdictOf(overall, th),
      recommendation: data.recommendation || '',
      summary: summary,
      dimensions: dims,
      hardConstraints: hardList,
      strengths: (data.strengths || []).filter(Boolean),
      gaps: (data.gaps || []).filter(Boolean),
      risks: (data.risks || []).filter(Boolean),
      advice: (data.advice || []).filter(Boolean),
      fitPoints: local.fitPoints,
      skills: local.skills,
      evidence: (data.evidence || []).slice(0, 3),
      meta: Object.assign({}, local.meta, {
        engine: 'api',
        masked: S.maskSend,
        model: $('apiModel').value.trim(),
        note: '叙述与评分由模型生成；技能矩阵与硬性项由本地规则同步核验，用于交叉检查。'
      }),
      generatedAt: data.generatedAt || new Date().toISOString(),
      skillVersion: data.skillVersion || 'job-fit@1.2.0'
    };
  }

  function setBusy(busy) {
    S.busy = busy;
    var btn = $('btnAnalyze');
    btn.disabled = busy;
    btn.setAttribute('aria-busy', busy ? 'true' : 'false');
    $('btnAnalyzeTxt').textContent = busy ? (S.engine === 'api' ? '模型分析中…' : '分析中…') : '开始匹配分析';
    var sp = btn.querySelector('.spin');
    if (busy && !sp) {
      sp = document.createElement('span');
      sp.className = 'spin';
      sp.setAttribute('aria-hidden', 'true');
      btn.insertBefore(sp, btn.firstChild);
    } else if (!busy && sp) {
      sp.remove();
      $('runHint').textContent = S.engine === 'api' ? 'AI 模型 API · 需要密钥 · 速度取决于接口' : '本地引擎 · 无需密钥 · 约 1 秒完成';
    }
  }

  function finish(r, t0) {
    var ms = ((window.performance && performance.now ? performance.now() : Date.now()) - t0);
    r.job = collectJob();
    S.result = r;
    setBusy(false);
    $('runHint').textContent = (r.meta.engine === 'api' ? 'AI 模型 · ' : '本地引擎 · ') +
      '完成，用时 ' + (ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(1) + ' s');
    render(r);
    var res = $('results');
    res.hidden = false;
    applyFormat();
    res.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try { res.focus({ preventScroll: true }); } catch (e) { res.focus(); }
    if (S.keepHist) pushHistory(r);
    syncDisclaimer();
  }

  /* ================= 渲染 ================= */
  function render(r) {
    var v = V[r.verdict] || V.moderate;
    var ring = $('ring');
    ring.style.setProperty('--v', v.color);
    ring.setAttribute('aria-label', '匹配度 ' + r.overallScore + ' 分，' + v.label);
    $('scoreNum').textContent = '0';
    var p = 0;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        ring.style.setProperty('--p', String(r.overallScore));
        $('scoreNum').textContent = String(r.overallScore);
      });
    });

    var vd = $('verdict');
    vd.textContent = v.label;
    vd.style.setProperty('--v', v.color);
    vd.style.background = v.soft;
    vd.style.color = v.color;
    $('conf').textContent = '置信度 ' + r.confidence + '%';
    $('rec').textContent = r.recommendation || '—';
    $('sum').textContent = r.summary || '';

    // 双评分：主分数可能被硬性条件封顶，副分数是同一套加权但不封顶的值
    var sm = r.scoreMeta || {};
    var unc = r.unconstrainedScore;
    var uncN = $('scoreAltNum'), uncD = $('scoreAltDesc');
    var capNote = sm.hardCapApplied ? '；主匹配度已按 44 分上限封顶' : '';
    if (unc == null) {
      uncN.textContent = '—';
      uncN.className = 'scorealt__n is-null';
      uncD.textContent = '各维度均缺乏可比证据，暂不计算该分值' + capNote;
    } else {
      uncN.textContent = String(unc);
      uncN.className = 'scorealt__n';
      uncN.style.color = unc >= 75 ? 'var(--green)' : unc >= 60 ? 'var(--brand)' : unc >= 45 ? 'var(--amber)' : 'var(--orange)';
      uncD.textContent = '全维度加权，未应用硬性条件封顶' + capNote;
    }

    var m = r.meta || {};
    var kpis = [];
    if (m.skillTotal) kpis.push('技能覆盖 <b>' + (m.skillCoverage || 0) + '%</b>（' + m.skillMatched + ' 项有实践）');
    if (m.years != null) kpis.push('经验 <b>' + m.years + '</b> 年');
    var hcPass = r.hardConstraints.filter(function (h) { return h.status === 'pass'; }).length;
    var hcFail = r.hardConstraints.filter(function (h) { return h.status === 'fail'; }).length;
    kpis.push('硬性条件 <b>' + hcPass + '</b> 通过' + (hcFail ? ' / <b>' + hcFail + '</b> 未通过' : ''));
    kpis.push('引擎 <b>' + (m.engine === 'api' ? 'AI 模型' : '本地规则') + '</b>' + (m.masked ? ' · 已脱敏' : ''));
    $('kpis').innerHTML = kpis.map(function (k) { return '<span class="kpi">' + k + '</span>'; }).join('');

    // 维度
    $('dimList').innerHTML = r.dimensions.map(function (d) {
      var sc = d.score;
      var color = sc == null ? 'var(--ink-3)' : (sc >= 75 ? 'var(--green)' : sc >= 60 ? 'var(--brand)' : sc >= 45 ? 'var(--amber)' : 'var(--red)');
      var ev = (d.evidence || []).slice(0, 2).map(function (e) { return '<span>' + esc(clip(safe(e), 60)) + '</span>'; }).join('');
      return '<div class="dimitem">' +
        '<div class="dimitem__top"><b>' + esc(d.label) + '</b>' +
        '<span class="wt">权重 ' + d.weight + '</span>' +
        '<span class="dimitem__sc" style="color:' + color + '">' + (sc == null ? '证据不足' : sc) + '</span></div>' +
        '<div class="bar"><i data-w="' + (sc == null ? 0 : sc) + '" style="background:' + color + '"></i></div>' +
        '<p class="dimitem__note">' + esc(d.note || '') + '</p>' +
        (ev ? '<div class="dimitem__ev">' + ev + '</div>' : '') +
        '</div>';
    }).join('');
    $$('#dimList .bar i').forEach(function (el) {
      var w = el.getAttribute('data-w');
      requestAnimationFrame(function () { requestAnimationFrame(function () { el.style.width = w + '%'; }); });
    });

    // 硬性条件
    var stText = { pass: '通过', flag: '存疑', fail: '不通过', unknown: '未知' };
    $('hcList').innerHTML = r.hardConstraints.map(function (h) {
      return '<li><span class="st st--' + h.status + '">' + (stText[h.status] || '未知') + '</span>' +
        '<b>' + esc(h.label) + '</b><span class="nt">' + esc(h.note) + '</span></li>';
    }).join('') || '<li><span class="nt">未启用硬性条件校验。</span></li>';

    // 风险
    $('riskList').innerHTML = (r.risks || []).map(function (x) { return '<li>' + esc(safe(x)) + '</li>'; }).join('')
      || '<li>未识别到显著风险。</li>';

    // 技能
    var tagMap = { matched: ['tag--ok', '有实践'], partial: ['tag--part', '仅关键词'], missing: ['tag--miss', '缺失'] };
    $('skillStat').textContent = m.skillTotal
      ? '共 ' + m.skillTotal + ' 项 · 有实践 ' + m.skillMatched + ' · 仅关键词 ' + m.skillPartial + ' · 缺失 ' + m.skillMissing
      : '未提取到技能项';
    $('skillBody').innerHTML = (r.skills || []).map(function (s) {
      var t = tagMap[s.status] || tagMap.missing;
      var ev = s.evidence ? esc(safe(clip(s.evidence, 110))) : '<span style="color:var(--ink-3)">简历中未检索到相关关键词</span>';
      return '<tr><td>' + esc(s.name) + '</td><td>' + ev + '</td>' +
        '<td><span class="tag ' + t[0] + '">' + t[1] + '</span></td></tr>';
    }).join('') || '<tr><td colspan="3" style="color:var(--ink-3)">岗位未提供可比的技能要求。</td></tr>';

    // 契合点 / 缺口
    $('fitList').innerHTML = (r.fitPoints || []).map(function (f) {
      return '<li><b>要求</b>：' + esc(clip(safe(f.req), 90)) + '<br><span class="qt">' + esc(clip(safe(f.ev), 110)) + '</span></li>';
    }).join('') || '<li>暂无可对齐的经验条目。</li>';

    $('gapList').innerHTML = (r.gaps || []).map(function (g) { return '<li>' + esc(safe(g)) + '</li>'; }).join('')
      || '<li>未发现显著缺口。</li>';

    // 建议
    $('adviceList').innerHTML = (r.advice || []).map(function (a) { return '<li>' + esc(safe(a)) + '</li>'; }).join('')
      || '<li>暂无额外建议。</li>';

    // JSON
    $('jsonOut').textContent = JSON.stringify(toContract(r), null, 2);

    var rn = $('resNote');
    if (m.note) { rn.textContent = m.note; rn.hidden = false; }
    else { rn.textContent = ''; rn.hidden = true; }
  }

  function applyFormat() {
    var detailed = S.outfmt === 'detailed';
    var json = S.outfmt === 'json';
    $('skillPanel').hidden = !detailed;
    $('advicePanel').hidden = !detailed;
    $('fitGrid').hidden = !detailed;
    $('jsonPanel').hidden = !json;
    var note = S.result && S.result.meta && S.result.meta.note;
    $('resNote').hidden = !note;
  }

  function toContract(r) {
    return {
      overallScore: r.overallScore,
      unconstrainedScore: r.unconstrainedScore == null ? null : r.unconstrainedScore,
      scoreMeta: r.scoreMeta || null,
      confidence: r.confidence,
      verdict: r.verdict,
      recommendation: r.recommendation,
      summary: r.summary,
      dimensions: r.dimensions.map(function (d) {
        return { key: d.key, label: d.label, score: d.score, weight: d.weight, note: safe(d.note), evidence: (d.evidence || []).map(safe) };
      }),
      hardConstraints: r.hardConstraints.map(function (h) {
        return { label: h.label, status: h.status, note: h.note };
      }),
      strengths: (r.strengths || []).map(safe),
      gaps: (r.gaps || []).map(safe),
      risks: (r.risks || []).map(safe),
      advice: (r.advice || []).map(safe),
      evidence: r.evidence || [],
      skillMatrix: (r.skills || []).map(function (s) {
        return { name: s.name, status: s.status, evidence: s.evidence, note: s.note };
      }),
      generatedAt: r.generatedAt,
      skillVersion: r.skillVersion
    };
  }

  /* ================= 导出 ================= */
  function copyJSON() {
    if (!S.result) return;
    var text = JSON.stringify(toContract(S.result), null, 2);
    var done = function () { flash($('btnCopy'), '已复制'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(fallback);
    } else fallback();

    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { flash($('btnCopy'), '复制失败'); }
      document.body.removeChild(ta);
    }
  }

  function flash(btn, text) {
    var old = btn.getAttribute('data-old') || btn.innerHTML;
    btn.setAttribute('data-old', old);
    btn.textContent = text;
    setTimeout(function () { btn.innerHTML = old; }, 1600);
  }

  function downloadMd() {
    if (!S.result) return;
    var r = S.result;
    var job = r.job || collectJob();
    var L = [];
    L.push('# 岗位匹配分析报告', '');
    L.push('- 岗位：' + job.jobTitle + ' @ ' + job.company);
    L.push('- 地点：' + job.location + '　薪资：' + job.salary);
    L.push('- 匹配度：' + r.overallScore + '/100（' + (V[r.verdict] || V.moderate).label + '，置信度 ' + r.confidence + '%）');
    L.push('- 不考虑硬性条件约束的综合评分：' + (r.unconstrainedScore == null ? '无法计算（维度证据不足）' : r.unconstrainedScore + '/100') +
      '（全维度加权，未应用硬性条件封顶）');
    L.push('- 引擎：' + (r.meta.engine === 'api' ? 'AI 模型（' + (r.meta.model || '') + '）' : '本地规则') + (r.meta.masked ? '，简历已脱敏' : ''));
    L.push('- 生成时间：' + new Date(r.generatedAt).toLocaleString('zh-CN'));
    L.push('', '## 结论', r.recommendation, '', r.summary, '');
    L.push('## 维度评分', '| 维度 | 分数 | 权重 | 说明 |', '| --- | --- | --- | --- |');
    r.dimensions.forEach(function (d) {
      L.push('| ' + d.label + ' | ' + (d.score == null ? '证据不足' : d.score) + ' | ' + d.weight + ' | ' + cell(d.note) + ' |');
    });
    L.push('', '## 硬性条件');
    r.hardConstraints.forEach(function (h) {
      L.push('- [' + ({ pass: '通过', flag: '存疑', fail: '不通过', unknown: '未知' }[h.status]) + '] ' + h.label + '：' + h.note);
    });
    L.push('', '## 技能匹配明细', '| 要求项 | 判定 | 简历证据 |', '| --- | --- | --- |');
    (r.skills || []).forEach(function (s) {
      L.push('| ' + s.name + ' | ' + ({ matched: '有实践', partial: '仅关键词', missing: '缺失' }[s.status]) + ' | ' +
        cell(s.evidence || '未检索到') + ' |');
    });
    L.push('', '## 经验契合点');
    (r.fitPoints || []).forEach(function (f) { L.push('- 要求：' + f.req + '　→　' + f.ev); });
    L.push('', '## 能力缺口');
    (r.gaps || []).forEach(function (g) { L.push('- ' + g); });
    L.push('', '## 风险提示');
    (r.risks || []).forEach(function (x) { L.push('- ' + x); });
    L.push('', '## 改进建议');
    (r.advice || []).forEach(function (a, i) { L.push((i + 1) + '. ' + a); });
    L.push('', '---', '> 由 OfferFit 在浏览器本地生成。简历与密钥未上传至任何服务器；若使用 AI 模式，' +
      (r.meta.masked ? '发送内容已脱敏。' : '发送内容未脱敏。'));

    var name = '匹配分析_' + (job.company || '公司') + '_' + (job.jobTitle || '岗位') + '_' +
      new Date().toISOString().slice(0, 10) + '.md';
    name = name.replace(/[\\/:*?"<>|]/g, '_');
    var blob = new Blob([P.maskPlain(L.join('\n'))], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function cell(s) { return String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' '); }

  /* ================= 会话记录（完整） ================= */
  var HIST_MAX = 10;
  var histSel = null;

  var JOB_KEYS = ['jobTitle', 'company', 'location', 'salary', 'description', 'companySize',
    'expRequirement', 'eduRequirement', 'skillsRequired', 'benefits', 'sourceUrl', 'industry', 'legalEntity'];

  var ST_TEXT = { pass: '通过', flag: '存疑', fail: '不通过', unknown: '未知' };
  var TAG_MAP = { matched: ['tag--ok', '有实践'], partial: ['tag--part', '仅关键词'], missing: ['tag--miss', '缺失'] };

  // 存进 sessionStorage 的完整结果（不含简历原文，证据已脱敏）
  function serializeResult(r) {
    return {
      overallScore: r.overallScore,
      unconstrainedScore: r.unconstrainedScore == null ? null : r.unconstrainedScore,
      scoreMeta: r.scoreMeta || null,
      confidence: r.confidence,
      verdict: r.verdict,
      recommendation: r.recommendation || '',
      summary: r.summary || '',
      dimensions: (r.dimensions || []).map(function (d) {
        return {
          key: d.key, label: d.label, score: d.score, weight: d.weight,
          note: safe(d.note), evidence: (d.evidence || []).map(safe)
        };
      }),
      hardConstraints: (r.hardConstraints || []).map(function (h) {
        return { label: h.label, status: h.status, note: safe(h.note) };
      }),
      strengths: (r.strengths || []).map(safe),
      gaps: (r.gaps || []).map(safe),
      risks: (r.risks || []).map(safe),
      advice: (r.advice || []).map(safe),
      fitPoints: (r.fitPoints || []).map(function (f) { return { req: safe(f.req), ev: safe(f.ev) }; }),
      skills: (r.skills || []).map(function (x) {
        return { name: x.name, status: x.status, evidence: safe(x.evidence || ''), note: safe(x.note || '') };
      }),
      evidence: (r.evidence || []).map(safe),
      meta: r.meta || {},
      generatedAt: r.generatedAt,
      skillVersion: r.skillVersion
    };
  }

  function pushHistory(r) {
    var job = r.job || collectJob();
    var item = {
      id: 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      at: r.generatedAt || new Date().toISOString(),
      job: {},
      prefs: { city: $('prefCity').value.trim(), salary: $('prefSalary').value.trim() },
      result: serializeResult(r)
    };
    JOB_KEYS.forEach(function (k) { item.job[k] = job[k] || ''; });
    // 同岗位同公司视为更新，避免反复分析堆满列表
    S.history = S.history.filter(function (h) {
      return !(h.job && h.job.jobTitle === item.job.jobTitle && h.job.company === item.job.company);
    });
    S.history.unshift(item);
    S.history = S.history.slice(0, HIST_MAX);
    try { sessionStorage.setItem(SS_HIST, JSON.stringify(S.history)); } catch (e) { /* 配额不足时仅保留内存副本 */ }
    renderHistory();
  }

  /* 免责声明：只要有分析结果或会话记录就展示
     （刷新后结果区会隐藏、记录仍在，说明文字也应一并保留，不能只跟着结果走） */
  function syncDisclaimer() {
    var el = $('disclaimer');
    if (!el) return;
    el.hidden = !(S.result || (S.history && S.history.length));
  }

  function renderHistory() {
    var card = $('historyCard');
    var list = $('histList');
    if (!S.history.length) {
      var raw = null;
      try { raw = sessionStorage.getItem(SS_HIST); } catch (e) { raw = null; }
      if (raw) {
        try { S.history = JSON.parse(raw) || []; } catch (e) { S.history = []; }
      }
    }
    // 过滤旧格式遗留，避免渲染报错
    S.history = (S.history || []).filter(function (h) { return h && h.job && h.result; });
    if (!S.history.length) {
      card.hidden = true;
      list.innerHTML = '';
      $('optKeep').checked = S.keepHist;
      syncDisclaimer();
      return;
    }
    card.hidden = false;
    if (!S.keepHist) { S.keepHist = true; saveConfig(); }
    $('optKeep').checked = S.keepHist;

    list.innerHTML = S.history.map(function (h, i) {
      var v = V[h.result.verdict] || V.moderate;
      var loc = [h.job.location, h.job.salary].filter(Boolean).join(' · ');
      var eng = (h.result.meta && h.result.meta.engine === 'api') ? 'AI 模型' : '本地引擎';
      var at = new Date(h.at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      return '<li><button type="button" class="histitem" data-idx="' + i + '">' +
        '<span class="histitem__main">' +
        '<span class="histitem__t">' + esc(h.job.jobTitle || '未命名岗位') + ' · ' + esc(h.job.company || '未知公司') + '</span>' +
        '<span class="histitem__m">' +
        (loc ? '<span>' + esc(loc) + '</span>' : '') +
        '<span>' + eng + '</span>' +
        '<span>' + esc(at) + '</span>' +
        '</span></span>' +
        '<span class="histitem__sc"><b style="color:' + v.color + '">' + h.result.overallScore + '</b><em>' + v.label + '</em></span>' +
        '</button></li>';
    }).join('');
    syncDisclaimer();
  }

  function histDetailHtml(h) {
    var j = h.job || {};
    var r = h.result || {};
    var v = V[r.verdict] || V.moderate;
    var m = r.meta || {};
    var out = [];

    // 1) 岗位信息（全字段，未填写也保留位置并以「—」占位，保证排版整齐）
    var EMPTY = '<span class="dmuted">—</span>';
    var rows = [
      ['岗位名称', j.jobTitle], ['公司名称', j.company],
      ['工作地点', j.location], ['薪资范围', j.salary],
      ['公司规模', j.companySize], ['经验要求', j.expRequirement],
      ['学历要求', j.eduRequirement], ['行业', j.industry],
      ['福利', j.benefits], ['法人 / 招聘主体', j.legalEntity]
    ];

    out.push('<section class="dsec"><h4>岗位信息</h4><dl class="kv">');
    rows.forEach(function (x) {
      out.push('<div><dt>' + esc(x[0]) + '</dt><dd>' + (x[1] ? esc(x[1]) : EMPTY) + '</dd></div>');
    });
    out.push('<div class="kv--full"><dt>技能要求</dt><dd>' + (j.skillsRequired ? esc(j.skillsRequired) : EMPTY) + '</dd></div>');
    var url = String(j.sourceUrl || '');
    var safeUrl = (url.indexOf('http://') === 0 || url.indexOf('https://') === 0) ? url : '';
    out.push('<div class="kv--full"><dt>岗位来源</dt><dd>' +
      (url
        ? (safeUrl ? '<a href="' + esc(safeUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(url) + '</a>' : esc(url))
        : EMPTY) +
      '</dd></div>');
    out.push('</dl>');
    if (j.description) {
      out.push('<details class="dmore"><summary>岗位描述 JD 原文（' + j.description.length + ' 字）</summary>' +
        '<pre class="djd">' + esc(j.description) + '</pre></details>');
    }
    out.push('</section>');

    // 2) 结论
    out.push('<section class="dsec"><h4>匹配结论</h4><div class="dscore">' +
      '<b style="color:' + v.color + '">' + (r.overallScore == null ? '—' : r.overallScore) + '</b>' +
      '<span>匹配度 / 100</span><span class="dtag" style="color:' + v.color + ';background:' + v.soft + '">' + v.label + '</span>' +
      '<span>置信度 ' + (r.confidence == null ? '—' : r.confidence + '%') + '</span></div>');
    var uncWhy = r.unconstrainedScore == null
      ? (r.scoreMeta ? '各维度证据不足，不计算' : '该记录生成于旧版本，未包含此分值')
      : '全维度加权，未应用硬性条件封顶，不受硬性条件失败影响';
    out.push('<p class="dalt">不考虑硬性条件约束的综合评分<b>' +
      (r.unconstrainedScore == null ? '—' : r.unconstrainedScore) + '</b>' +
      '<span>' + uncWhy + '</span></p>');
    if (r.recommendation) out.push('<p class="drec">' + esc(r.recommendation) + '</p>');
    if (r.summary) out.push('<p class="dsum">' + esc(r.summary) + '</p>');
    out.push('</section>');

    // 3) 维度
    if ((r.dimensions || []).length) {
      out.push('<section class="dsec"><h4>维度评分</h4><div class="dimlist">');
      r.dimensions.forEach(function (d) {
        var sc = d.score;
        var color = sc == null ? 'var(--ink-3)' : (sc >= 75 ? 'var(--green)' : sc >= 60 ? 'var(--brand)' : sc >= 45 ? 'var(--amber)' : 'var(--red)');
        var ev = (d.evidence || []).map(function (e) { return '<span>' + esc(e) + '</span>'; }).join('');
        out.push('<div class="dimitem">' +
          '<div class="dimitem__top"><b>' + esc(d.label) + '</b>' +
          '<span class="wt">权重 ' + d.weight + '</span>' +
          '<span class="dimitem__sc" style="color:' + color + '">' + (sc == null ? '证据不足' : sc) + '</span></div>' +
          '<div class="bar"><i style="width:' + (sc == null ? 0 : sc) + '%;background:' + color + '"></i></div>' +
          (d.note ? '<p class="dimitem__note">' + esc(d.note) + '</p>' : '') +
          (ev ? '<div class="dimitem__ev">' + ev + '</div>' : '') +
          '</div>');
      });
      out.push('</div></section>');
    }

    // 4) 硬性条件
    if ((r.hardConstraints || []).length) {
      out.push('<section class="dsec"><h4>硬性条件</h4><ul class="hclist">');
      r.hardConstraints.forEach(function (x) {
        out.push('<li><span class="st st--' + x.status + '">' + (ST_TEXT[x.status] || '未知') + '</span>' +
          '<b>' + esc(x.label) + '</b><span class="nt">' + esc(x.note || '') + '</span></li>');
      });
      out.push('</ul></section>');
    }

    // 5) 技能明细
    if ((r.skills || []).length) {
      out.push('<section class="dsec"><h4>技能匹配明细</h4><div class="tablewrap"><table class="tbl">' +
        '<thead><tr><th scope="col">要求项</th><th scope="col">简历证据</th><th scope="col">判定</th></tr></thead><tbody>');
      r.skills.forEach(function (x) {
        var t = TAG_MAP[x.status] || TAG_MAP.missing;
        out.push('<tr><td>' + esc(x.name) + '</td><td>' +
          (x.evidence ? esc(x.evidence) : '<span class="dmuted">未检索到相关关键词</span>') +
          '</td><td><span class="tag ' + t[0] + '">' + t[1] + '</span></td></tr>');
      });
      out.push('</tbody></table></div></section>');
    }

    // 6) 契合点
    if ((r.fitPoints || []).length) {
      out.push('<section class="dsec"><h4>经验契合点</h4><ul class="bullets">');
      r.fitPoints.forEach(function (f) {
        out.push('<li><b>要求</b>：' + esc(f.req || '') + '<br><span class="qt">' + esc(f.ev || '') + '</span></li>');
      });
      out.push('</ul></section>');
    }

    // 7) 缺口
    if ((r.gaps || []).length) {
      out.push('<section class="dsec"><h4>能力缺口</h4><ul class="bullets bullets--gap">');
      r.gaps.forEach(function (x) { out.push('<li>' + esc(x) + '</li>'); });
      out.push('</ul></section>');
    }

    // 8) 风险
    if ((r.risks || []).length) {
      out.push('<section class="dsec"><h4>风险提示</h4><ul class="bullets bullets--risk">');
      r.risks.forEach(function (x) { out.push('<li>' + esc(x) + '</li>'); });
      out.push('</ul></section>');
    }

    // 9) 建议
    if ((r.advice || []).length) {
      out.push('<section class="dsec"><h4>改进建议</h4><ol class="advice">');
      r.advice.forEach(function (x) { out.push('<li>' + esc(x) + '</li>'); });
      out.push('</ol></section>');
    }

    // 10) 元信息
    out.push('<section class="dsec"><h4>分析元信息</h4><dl class="kv">' +
      '<div><dt>引擎</dt><dd>' + (m.engine === 'api' ? 'AI 模型' + (m.model ? '（' + esc(m.model) + '）' : '') : '本地规则引擎') + '</dd></div>' +
      '<div><dt>发送前脱敏</dt><dd>' + (m.masked ? '已脱敏' : '未脱敏') + '</dd></div>' +
      '<div><dt>生成时间</dt><dd>' + esc(new Date(h.at).toLocaleString('zh-CN')) + '</dd></div>' +
      '<div><dt>契约版本</dt><dd>' + esc(r.skillVersion || 'job-fit@1.2.0') + '</dd></div>' +
      (h.prefs && (h.prefs.city || h.prefs.salary)
        ? '<div class="kv--full"><dt>求职偏好</dt><dd>' + esc([h.prefs.city, h.prefs.salary].filter(Boolean).join(' · ')) + '</dd></div>'
        : '') +
      '</dl></section>');

    return out.join('');
  }

  function openHist(idx) {
    var h = S.history[idx];
    if (!h) return;
    histSel = idx;
    $('histDlgTitle').textContent = (h.job.jobTitle || '未命名岗位') + ' · ' + (h.job.company || '');
    $('histDlgSub').textContent = '分析于 ' + new Date(h.at).toLocaleString('zh-CN') +
      '　·　点击「载入到表单」可把岗位信息填回输入区重新分析';
    $('histDlgBody').innerHTML = histDetailHtml(h);
    var dlg = $('histDlg');
    if (dlg.showModal) { if (!dlg.open) dlg.showModal(); }
    else { dlg.setAttribute('open', ''); }
  }

  function closeHist() {
    var dlg = $('histDlg');
    if (!dlg) return;
    if (dlg.open && dlg.close) dlg.close();
    else dlg.removeAttribute('open');
    histSel = null;
  }

  function loadHist(idx) {
    var h = S.history[idx];
    if (!h) return;
    JOB_KEYS.forEach(function (k) {
      var el = $(k);
      if (el) el.value = h.job[k] || '';
    });
    if (h.prefs) {
      $('prefCity').value = h.prefs.city || '';
      $('prefSalary').value = h.prefs.salary || '';
    }
    updateCounts();
    closeHist();
    var target = $('jobTitle');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
    }
  }

  function delHist(idx) {
    if (!S.history[idx]) return;
    S.history.splice(idx, 1);
    try {
      if (S.history.length) sessionStorage.setItem(SS_HIST, JSON.stringify(S.history));
      else sessionStorage.removeItem(SS_HIST);
    } catch (e) { /* 忽略 */ }
    closeHist();
    renderHistory();
  }

  /* ================= 清除 ================= */
  // 只清岗位信息：简历、分析配置、历史记录、已出的结果都不动
  function clearJob() {
    JOB_KEYS.forEach(function (k) {
      var el = $(k);
      if (el) el.value = '';
    });
    hideAlert();
    clearErrors();
    MSG_MAP = {};
    updateCounts();
    var btn = $('btnClearJob');
    if (btn) flash(btn, '已清空岗位信息');
    var first = $('jobTitle');
    if (first) { try { first.focus({ preventScroll: true }); } catch (e) { /* 忽略 */ } }
  }

  function clearAll() {
    if (!window.confirm('将清空简历、岗位信息、分析结果、会话记录与本地配置，操作不可撤销。\nAPI Key 会立即从内存中移除。是否继续？')) return;

    S.resumeRaw = '';
    S.fileName = '';
    S.apiKey = '';
    S.result = null;
    S.history = [];
    S.masked = true;
    S.shield = true;

    ['resumeText', 'jobTitle', 'company', 'location', 'salary', 'description', 'companySize',
      'expRequirement', 'eduRequirement', 'skillsRequired', 'benefits', 'sourceUrl',
      'industry', 'legalEntity', 'apiBase', 'apiModel', 'apiKey', 'prefCity', 'prefSalary'
    ].forEach(function (id) { var el = $(id); if (el) el.value = ''; });
    $('resumeFile').value = '';
    $('apiKey').type = 'password';
    $('btnToggleKey').textContent = '显示';
    $('fileInfo').hidden = true;
    $('privacyBox').hidden = true;
    $('results').hidden = true;
    closeHist();
    $('apiStatus').textContent = '';
    $('apiStatus').className = 'apistat';
    hideAlert();
    clearErrors();
    MSG_MAP = {};

    try { localStorage.removeItem(LS_CFG); } catch (e) {}
    try { sessionStorage.removeItem(SS_HIST); } catch (e) {}

    S.dims = E.DEFAULT_DIMS.map(function (d) { return { key: d.key, label: d.label, weight: d.weight, on: true, hint: d.hint }; });
    S.thresholds = { strong: 75, good: 60, moderate: 45 };
    S.hard = { location: true, experience: true, education: true, skills: true, salary: true };
    S.outfmt = 'detailed';
    S.maskSend = true;
    S.keepHist = false;
    S.engine = 'local';
    S.prefs = { city: '', salary: '' };
    $$('input[name=engine]').forEach(function (r) { r.checked = r.value === 'local'; });
    $('apiNoKey').checked = false;
    $('apiKey').disabled = false;
    $('btnToggleKey').disabled = false;
    $('keyReq').style.display = '';
    switchTab('paste');
    renderDims();
    syncSettingsUI();
    updateWeightSum();
    updateCounts();
    updateShield();
    renderHistory();
    $('runHint').textContent = S.engine === 'api' ? 'AI 模型 API · 需要密钥 · 速度取决于接口' : '本地引擎 · 无需密钥 · 约 1 秒完成';

    var btn = $('btnClearAll');
    flash(btn, '已清除');
  }

  function syncSettingsUI() {
    $('thStrong').value = S.thresholds.strong;
    $('thGood').value = S.thresholds.good;
    $('thModerate').value = S.thresholds.moderate;
    $('hcLocation').checked = S.hard.location;
    $('hcExperience').checked = S.hard.experience;
    $('hcEducation').checked = S.hard.education;
    $('hcSkills').checked = S.hard.skills;
    $('hcSalary').checked = S.hard.salary;
    $('optMaskSend').checked = S.maskSend;
    $('optKeep').checked = S.keepHist;
    $$('input[name=outfmt]').forEach(function (r) { r.checked = r.value === S.outfmt; });
  }

  function normalizeWeights() {
    var onDims = S.dims.filter(function (d) { return d.on; });
    var sum = onDims.reduce(function (a, d) { return a + (Number(d.weight) || 0); }, 0);
    if (!onDims.length) { $('err-weights').textContent = '请先启用至少一个维度。'; $('err-weights').hidden = false; return; }
    if (sum <= 0) {
      var each = Math.floor(100 / onDims.length);
      onDims.forEach(function (d, i) { d.weight = each + (i === 0 ? 100 - each * onDims.length : 0); });
    } else {
      var acc = 0;
      onDims.forEach(function (d, i) {
        var w = i === onDims.length - 1 ? 100 - acc : Math.round((Number(d.weight) / sum) * 100);
        d.weight = Math.max(0, w);
        acc += d.weight;
      });
    }
    renderDims();
    updateWeightSum();
    saveConfig();
    clearFieldError('err-weights');
  }

  /* ================= 工具 ================= */
  function esc(s) { return P.escapeHtml(s); }
  // 渲染前再过一遍脱敏，确保结论/证据里不会出现联系方式
  function safe(s) { return P.maskPlain(String(s == null ? '' : s)); }
  function clip(s, n) {
    s = String(s || '').replace(/\s+/g, ' ');
    return s.length > n ? s.slice(0, n) + '…' : s;
  }
  function indexOfDim(key) {
    for (var i = 0; i < S.dims.length; i++) { if (S.dims[i].key === key) return i; }
    return -1;
  }

  /* ================= 测试连接 ================= */
  function testApi() {
    var base = $('apiBase').value.trim();
    var model = $('apiModel').value.trim();
    var noKey = $('apiNoKey').checked;
    var st = $('apiStatus');
    clearFieldError('err-apiBase');
    clearFieldError('err-apiModel');
    clearFieldError('err-apiKey');
    var bad = [];
    if (!base) bad.push({ id: 'err-apiBase', el: 'apiBase', msg: '请填写接口地址。' });
    else if (!/^https?:\/\//i.test(base)) bad.push({ id: 'err-apiBase', el: 'apiBase', msg: '地址需以 http:// 或 https:// 开头。' });
    if (!model) bad.push({ id: 'err-apiModel', el: 'apiModel', msg: '请填写模型名称。' });
    if (!noKey && !$('apiKey').value.trim()) bad.push({ id: 'err-apiKey', el: 'apiKey', msg: '请填写 API Key。' });
    if (bad.length) {
      bad.forEach(function (b) {
        var el = $(b.id);
        el.textContent = b.msg;
        el.hidden = false;
        $(b.el).setAttribute('aria-invalid', 'true');
      });
      st.textContent = '配置不完整，无法测试。';
      st.className = 'apistat is-bad';
      return;
    }

    st.textContent = '正在连接…';
    st.className = 'apistat is-busy';
    $('btnTestApi').disabled = true;

    // 留足 max_tokens：推理模型会先消耗一部分在思维链上
    callApi([{ role: 'user', content: '这是连通性测试，请只回复两个字：可用' }], 25, 256).then(function (txt) {
      var shown = String(txt).replace(/\s+/g, ' ').trim().slice(0, 24) || '（空）';
      st.textContent = '连接正常，模型已响应：' + shown;
      st.className = 'apistat is-ok';
    }).catch(function (err) {
      if (err && err.reasoningOnly) {
        st.textContent = '连接正常：模型有响应，只是没有输出正文（推理模型特性），正式分析不受影响。';
        st.className = 'apistat is-ok';
        return;
      }
      st.textContent = err && err.message ? err.message : '测试失败，请检查配置。';
      st.className = 'apistat is-bad';
    }).then(function () {
      $('btnTestApi').disabled = false;
    });
  }

  // 启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
