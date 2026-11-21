/* ============================================================
   theme.js — 明暗主题（在 CSS 之前同步执行，避免首屏闪白）
   约定：只读写 localStorage 的 offerfit.theme，不涉及任何简历/密钥数据。
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'offerfit.theme';
  var META = { light: '#f6f7fb', dark: '#0e1117' };
  var root = document.documentElement;
  var mq = null;
  try { mq = window.matchMedia('(prefers-color-scheme: dark)'); } catch (e) { mq = null; }

  function stored() {
    try {
      var v = localStorage.getItem(KEY);
      return v === 'light' || v === 'dark' ? v : '';
    } catch (e) { return ''; }
  }

  function systemTheme() {
    return mq && mq.matches ? 'dark' : 'light';
  }

  function apply(theme, persist) {
    var t = theme === 'dark' ? 'dark' : 'light';
    root.setAttribute('data-theme', t);
    root.style.colorScheme = t;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', META[t]);
    if (persist) {
      try { localStorage.setItem(KEY, t); } catch (e) { /* 隐私模式下降级为不记忆 */ }
    }
    return t;
  }

  // 首屏：已保存则用保存值，否则跟随系统
  var initial = stored() || systemTheme();
  apply(initial, false);

  // 未显式选择过时，跟随系统变化
  if (mq) {
    var onChange = function () { if (!stored()) apply(systemTheme(), false); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  function toggle() {
    return apply(get() === 'dark' ? 'light' : 'dark', true);
  }

  function get() { return root.getAttribute('data-theme') || 'light'; }

  window.OfferFitTheme = {
    get: get,
    hasChoice: function () { return !!stored(); },
    set: function (t) { return apply(t, true); },
    toggle: toggle
  };
})();
