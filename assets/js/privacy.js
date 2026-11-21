/* ============================================================
   privacy.js — 本地脱敏与转义工具
   仅做纯文本处理，不发起任何网络请求，不写入任何存储。
   ============================================================ */
window.OfferFitPrivacy = (function () {
  'use strict';

  var RULES = [
    {
      key: 'idcard', label: '证件号',
      re: /(?<!\d)\d{17}[\dXx](?!\d)|(?<!\d)\d{15}(?!\d)/g,
      rep: function (m) { return m.slice(0, 4) + '**********' + m.slice(-2); }
    },
    {
      key: 'bank', label: '银行卡',
      re: /(?<!\d)\d{16,19}(?!\d)/g,
      rep: function (m) { return m.slice(0, 4) + ' **** **** ' + m.slice(-4); }
    },
    {
      key: 'phone', label: '手机号',
      re: /(?<!\d)1[3-9]\d{9}(?!\d)/g,
      rep: function (m) { return m.slice(0, 3) + '****' + m.slice(-4); }
    },
    {
      key: 'tel', label: '固定电话',
      re: /(?<!\d)0\d{2,3}[- ]?\d{7,8}(?!\d)/g,
      rep: function (m) { return m.slice(0, 4) + '****' + m.slice(-2); }
    },
    {
      key: 'email', label: '邮箱',
      re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
      rep: function (m) {
        var at = m.indexOf('@');
        var local = m.slice(0, at);
        var keep = local.slice(0, Math.min(2, local.length));
        return keep + '***' + m.slice(at);
      }
    },
    {
      key: 'im', label: '社交账号',
      re: /(微信|WeChat|wechat|QQ|qq|钉钉)\s*(号)?\s*[:：]?\s*([A-Za-z0-9_-]{5,20})/g,
      rep: function (m, p1) { return p1 + '：***'; }
    },
    {
      key: 'address', label: '详细住址',
      re: /(住址|地址|现居|居住地|通讯地址)\s*[:：]\s*([^\n，。;；|]{4,40})/g,
      rep: function (m, p1) { return p1 + '：**（已隐藏）'; }
    },
    {
      key: 'birth', label: '出生日期',
      re: /(出生|生日|生于)[ \t]{0,2}(日期|年月)?[ \t]*[:：]?[ \t]*((19|20)\d{2})[ \t]*[年.\-/][ \t]*\d{1,2}([ \t]*[月.\-/][ \t]*\d{1,2}[ \t]*日?)?/g,
      rep: function (m, p1) {
        var y = String(m).match(/(19|20)\d{2}/);
        return p1 + '：' + (y ? y[0] : '') + ' 年（详细日期已隐藏）';
      }
    },
    {
      key: 'name', label: '姓名',
      re: /(^|\n)[ \t]*([\u4e00-\u9fa5]{2,4})[ \t]*(?=\r?\n|$)/,
      rep: function (m, p1, p2) { return p1 + p2.charAt(0) + new Array(p2.length).join('*'); }
    },
    {
      key: 'name2', label: '姓名',
      re: /(姓名|姓 名)\s*[:：]\s*([\u4e00-\u9fa5·]{2,6})/g,
      rep: function (m, p1, p2) { return p1 + '：' + p2.charAt(0) + '**'; }
    }
  ];

  var TOKEN = /\u0000(\d+)\u0000/g;

  // 首行若为这些词，不视为姓名
  var NAME_SKIP = ['个人简历', '求职简历', '应聘简历', '简历', '个人信息', '联系方式', '基本信息', '教育背景', '工作经历'];

  /**
   * 对原文做脱敏。
   * @returns {{text:string, marks:Array, counts:Object, total:number}}
   */
  function mask(raw) {
    if (typeof raw !== 'string' || !raw) {
      return { text: '', marks: [], counts: {}, total: 0 };
    }
    var text = raw;
    var marks = [];
    var counts = {};

    RULES.forEach(function (rule) {
      text = text.replace(rule.re, function () {
        var args = Array.prototype.slice.call(arguments);
        var whole = args[0];
        if (rule.key === 'name' && NAME_SKIP.indexOf(whole.trim()) !== -1) return whole;
        var replacement = rule.rep.apply(null, args);
        if (replacement === whole) return whole;
        marks.push({ key: rule.key, label: rule.label, original: whole, masked: replacement });
        counts[rule.key] = (counts[rule.key] || 0) + 1;
        return '\u0000' + (marks.length - 1) + '\u0000';
      });
    });

    return { text: text, marks: marks, counts: counts, total: marks.length };
  }

  /** 脱敏后的纯文本（用于预览 / 发送给模型） */
  function maskPlain(raw) {
    var r = mask(raw);
    return r.text.replace(TOKEN, function (_, i) { return r.marks[Number(i)].masked; });
  }

  /** 脱敏后的 HTML（高亮隐藏位置） */
  function maskHtml(raw) {
    var r = mask(raw);
    if (!r.marks.length) return escapeHtml(raw);
    var out = '';
    var last = 0;
    r.text.replace(TOKEN, function (whole, i, offset) {
      out += escapeHtml(r.text.slice(last, offset));
      out += '<mark title="' + escapeHtml(r.marks[Number(i)].label) + ' 已隐藏">' +
             escapeHtml(r.marks[Number(i)].masked) + '</mark>';
      last = offset + whole.length;
      return whole;
    });
    out += escapeHtml(r.text.slice(last));
    return out;
  }

  /** 汇总描述，如「手机号 1 · 邮箱 1」 */
  function describe(counts) {
    var labels = {
      name: '姓名', name2: '姓名', phone: '手机号', email: '邮箱', idcard: '证件号',
      bank: '银行卡', address: '住址', im: '社交账号', birth: '出生日期', tel: '固话'
    };
    var order = ['name', 'name2', 'phone', 'email', 'idcard', 'bank', 'address', 'im', 'birth', 'tel'];
    var parts = [];
    var nameCounted = false;
    order.forEach(function (k) {
      if (!counts[k]) return;
      if (labels[k] === '姓名') {
        if (nameCounted) return;
        nameCounted = true;
      }
      parts.push(labels[k] + ' ' + counts[k]);
    });
    return parts.join(' · ');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  return { mask: mask, maskPlain: maskPlain, maskHtml: maskHtml, describe: describe, escapeHtml: escapeHtml };
})();
