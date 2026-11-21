/* ============================================================
   import.js — 本地文件解析（PDF / DOCX / TXT）
   解析库随应用打包，文件内容不会离开浏览器。
   ============================================================ */
window.OfferFitImport = (function () {
  'use strict';

  var MAX = 10 * 1024 * 1024;

  function fail(code, message) {
    var e = new Error(message);
    e.code = code;
    return e;
  }

  function ext(name) {
    var m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : '';
  }

  function tidy(text) {
    return String(text || '')
      .replace(/\r\n?/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function readAsArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(fail('read', '文件读取失败，可能已被其他程序占用或权限不足。')); };
      r.readAsArrayBuffer(file);
    });
  }

  function readAsText(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        var txt = String(r.result || '');
        // UTF-8 解码出现大量替换字符时，按 GBK 重试（常见于中文 Windows 导出的 txt）
        var bad = (txt.match(/\uFFFD/g) || []).length;
        if (bad > 3 && window.TextDecoder) {
          try {
            var dec = new TextDecoder('gbk');
            var r2 = new FileReader();
            r2.onload = function () { resolve(String(r2.result || '')); };
            r2.onerror = function () { resolve(txt); };
            r2.readAsArrayBuffer(file);
            return;
          } catch (e) { /* 忽略，使用 UTF-8 结果 */ }
        }
        resolve(txt);
      };
      r.onerror = function () { reject(fail('read', '文件读取失败，请确认文件未损坏。')); };
      r.readAsText(file, 'utf-8');
    });
  }

  function ensurePdf() {
    if (!window.pdfjsLib) {
      throw fail('lib', 'PDF 解析组件未加载成功。请刷新页面；若仍失败，请直接粘贴简历文本。');
    }
    if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
      var base = location.pathname.replace(/[^/]*$/, '');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'assets/vendor/pdf.worker.min.js';
    }
  }

  function parsePdf(file, onProgress) {
    ensurePdf();
    return readAsArrayBuffer(file).then(function (buf) {
      return window.pdfjsLib.getDocument({
        data: new Uint8Array(buf),
        isEvalSupported: false,
        useSystemFonts: true
      }).promise;
    }).then(function (pdf) {
      var pages = pdf.numPages;
      var out = [];
      var chain = Promise.resolve();
      for (var i = 1; i <= pages; i++) {
        (function (pageNo) {
          chain = chain.then(function () {
            return pdf.getPage(pageNo).then(function (page) {
              return page.getTextContent().then(function (tc) {
                var buf = '', lastY = null;
                tc.items.forEach(function (it) {
                  if (!it.str) return;
                  var y = it.transform ? it.transform[5] : null;
                  if (lastY !== null && y !== null && Math.abs(y - lastY) > 2.5) buf += '\n';
                  buf += it.str;
                  if (it.hasEOL) buf += '\n';
                  lastY = y;
                });
                out.push(buf);
                if (onProgress) onProgress(pageNo, pages);
              });
            });
          });
        })(i);
      }
      return chain.then(function () {
        return { text: tidy(out.join('\n\n')), pages: pages, kind: 'PDF' };
      });
    }).catch(function (e) {
      if (e && e.code) throw e;
      var msg = String((e && e.message) || e);
      if (/password/i.test(msg)) throw fail('encrypted', '该 PDF 已加密，请先解除密码保护后再导入。');
      if (/Invalid PDF|InvalidPDF|structure/i.test(msg)) throw fail('broken', 'PDF 文件结构异常或已损坏，无法解析。');
      if (location.protocol === 'file:') {
        throw fail('protocol', '当前以 file:// 方式打开，浏览器禁止加载 PDF 解析线程。请改用本地服务打开（见应用目录中的「启动本地服务」），或直接粘贴文本。');
      }
      throw fail('pdf', 'PDF 解析失败：' + msg.slice(0, 80));
    });
  }

  function parseDocx(file) {
    if (!window.mammoth) {
      return Promise.reject(fail('lib', 'Word 解析组件未加载成功，请刷新页面，或把内容复制粘贴到输入框。'));
    }
    return readAsArrayBuffer(file).then(function (buf) {
      return window.mammoth.extractRawText({ arrayBuffer: buf });
    }).then(function (res) {
      var text = tidy(res && res.value);
      if (!text) throw fail('empty', '未能从这份 Word 中提取到文字，可能全部由图片或文本框构成。');
      if (res.messages && res.messages.length) {
        // mammoth 的 warnings 不阻断解析，仅在诊断中保留数量
        return { text: text, kind: 'DOCX', warnings: res.messages.length };
      }
      return { text: text, kind: 'DOCX' };
    }).catch(function (e) {
      if (e && e.code) throw e;
      throw fail('docx', 'Word 解析失败，文件可能损坏或为加密文档。可另存为 .docx 后重试，或直接粘贴文本。');
    });
  }

  /**
   * @param {File} file
   * @param {(msg:string)=>void} onProgress
   * @returns {Promise<{text:string, kind:string, pages?:number}>}
   */
  function parse(file, onProgress) {
    if (!file) return Promise.reject(fail('none', '没有选择文件。'));
    if (file.size === 0) return Promise.reject(fail('empty', '文件是空的（0 字节）。'));
    if (file.size > MAX) {
      return Promise.reject(fail('size', '文件超过 10MB（当前 ' + (Math.round(file.size / 1024 / 10) / 100) + 'MB），请压缩或改为粘贴文本。'));
    }
    var e = ext(file.name);
    if (e === 'doc') return Promise.reject(fail('doc', '不支持旧版 .doc 格式：请用 Word 另存为 .docx 后重试，或直接粘贴文本。'));
    if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].indexOf(e) !== -1) {
      return Promise.reject(fail('image', '不支持直接导入图片。可先用 OCR 工具转成文字后粘贴。'));
    }
    if (e === 'pdf') return parsePdf(file, onProgress);
    if (e === 'docx') return parseDocx(file, onProgress);
    if (['txt', 'md', 'text'].indexOf(e) !== -1) {
      return readAsText(file).then(function (t) {
        var text = tidy(t);
        if (!text) throw fail('empty', '文本文件内容为空。');
        return { text: text, kind: 'TXT' };
      });
    }
    return Promise.reject(fail('type', '不支持的文件类型「' + (e ? '.' + e : '未知') + '」。请上传 PDF / DOCX / TXT，或直接粘贴文本。'));
  }

  return { parse: parse, MAX: MAX };
})();
