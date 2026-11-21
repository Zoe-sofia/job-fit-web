/* ============================================================
   xlsx.js — 极简 XLSX 生成器（零依赖、离线可用）
   为什么自己写：本项目的硬约束是「离线可用、不引外部资源」，
   引一个 SheetJS 会让 vendor 目录多出几百 KB，且只用到极小一部分。
   这里只实现 OOXML 的最小可用子集：
     [Content_Types].xml / _rels/.rels / xl/workbook.xml /
     xl/_rels/workbook.xml.rels / xl/styles.xml / xl/worksheets/sheetN.xml
   ZIP 采用 store（不压缩）方式，自带 CRC32，Excel / WPS / Numbers 均可打开。
   单元格约定：字符串走 inlineStr（不经 sharedStrings，避免额外部件），
   数字走 <v>；空值不写 <c>，文件更小且不影响列对齐（坐标按 r 属性定位）。
   ============================================================ */
(function (root) {
  'use strict';

  var XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  var NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  var NS_DOC_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  var NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
  var NS_CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
  var REL_BASE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  var CT_SHEET = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml';
  var CT_WORKBOOK = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml';
  var CT_STYLES = 'application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml';

  /* ---------------- 字节工具 ---------------- */
  function utf8(str) {
    var TE = root.TextEncoder || (typeof TextEncoder !== 'undefined' ? TextEncoder : null);
    if (!TE) throw new Error('当前环境缺少 TextEncoder，无法生成 XLSX');
    return new TE().encode(String(str));
  }

  var CRC_TABLE = null;
  function crcTable() {
    if (CRC_TABLE) return CRC_TABLE;
    var t = new Int32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    CRC_TABLE = t;
    return t;
  }

  function crc32(bytes) {
    var t = crcTable();
    var c = -1;
    for (var i = 0; i < bytes.length; i++) c = (c >>> 8) ^ t[(c ^ bytes[i]) & 0xFF];
    return (c ^ -1) >>> 0;
  }

  /* ---------------- ZIP（store，无压缩） ---------------- */
  function dosStamp(d) {
    var time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((Math.floor(d.getSeconds() / 2)) & 31);
    var date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
    return { time: time, date: date };
  }

  // files: [{ name: 'xl/workbook.xml', data: Uint8Array }]
  function zip(files, when) {
    var stamp = dosStamp(when || new Date());
    var locals = [];
    var centrals = [];
    var offset = 0;
    files.forEach(function (f) {
      var nameBytes = utf8(f.name);
      var data = f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data || []);
      var crc = crc32(data);

      var local = new Uint8Array(30 + nameBytes.length);
      var lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);   // local file header signature
      lv.setUint16(4, 20, true);           // version needed
      lv.setUint16(6, 0x0800, true);       // flags: UTF-8 文件名
      lv.setUint16(8, 0, true);            // method 0 = store
      lv.setUint16(10, stamp.time, true);
      lv.setUint16(12, stamp.date, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true); // compressed size
      lv.setUint32(22, data.length, true); // uncompressed size
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);           // extra length
      local.set(nameBytes, 30);

      var cd = new Uint8Array(46 + nameBytes.length);
      var cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true);   // central directory header signature
      cv.setUint16(4, 20, true);           // version made by
      cv.setUint16(6, 20, true);           // version needed
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, stamp.time, true);
      cv.setUint16(14, stamp.date, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);           // extra
      cv.setUint16(32, 0, true);           // comment
      cv.setUint16(34, 0, true);           // disk number
      cv.setUint16(36, 0, true);           // internal attrs
      cv.setUint32(38, 0, true);           // external attrs
      cv.setUint32(42, offset, true);      // 本条目 local header 偏移
      cd.set(nameBytes, 46);

      locals.push(local, data);
      centrals.push(cd);
      offset += local.length + data.length;
    });

    var cdSize = 0;
    centrals.forEach(function (c) { cdSize += c.length; });

    var eocd = new Uint8Array(22);
    var ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);   // end of central directory signature
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, centrals.length, true);
    ev.setUint16(10, centrals.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    var parts = locals.concat(centrals, [eocd]);
    var size = 0;
    parts.forEach(function (p) { size += p.length; });
    var out = new Uint8Array(size);
    var pos = 0;
    parts.forEach(function (p) { out.set(p, pos); pos += p.length; });
    return out;
  }

  /* ---------------- XML 工具 ---------------- */
  function colName(n) {
    var x = Number(n) || 0;
    var s = '';
    while (x > 0) {
      var m = (x - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      x = Math.floor((x - 1) / 26);
    }
    return s || 'A';
  }

  // 去控制符 / 孤立代理项（Excel 会在打开时报「内容有问题」），再转义 XML 实体
  function escapeXml(value) {
    return String(value)
      .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g, function (m) {
        return m.length === 2 ? m : '';
      })
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function cellXml(ref, value, styleId) {
    if (value == null || value === '') return '';
    var s = styleId ? ' s="' + styleId + '"' : '';
    if (typeof value === 'number' && isFinite(value)) {
      return '<c r="' + ref + '"' + s + '><v>' + value + '</v></c>';
    }
    // Excel 单元格上限 32767 字符，超出会触发「文件已损坏」；先截断原文再转义，避免切断实体
    var text = String(value);
    if (text.length > 32000) text = text.slice(0, 32000) + '…[内容过长已截断]';
    return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' +
      escapeXml(text) + '</t></is></c>';
  }

  /* ---------------- 部件 ---------------- */
  // 样式：0 正文、1 表头（加粗）、2 长文本（自动换行 + 顶端对齐）
  function stylesXml() {
    return XML_HEAD +
      '<styleSheet xmlns="' + NS_MAIN + '">' +
      '<fonts count="2">' +
      '<font><sz val="11"/><color theme="1"/><name val="等线"/><family val="2"/></font>' +
      '<font><b/><sz val="11"/><color theme="1"/><name val="等线"/><family val="2"/></font>' +
      '</fonts>' +
      '<fills count="2">' +
      '<fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '</fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="3">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1">' +
      '<alignment vertical="top" wrapText="1"/></xf>' +
      '</cellXfs>' +
      '<cellStyles count="1"><cellStyle name="常规" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>';
  }

  function sheetXml(sheet) {
    var rows = Array.isArray(sheet.rows) ? sheet.rows : [];
    var maxCols = 1;
    rows.forEach(function (r) { if (Array.isArray(r) && r.length > maxCols) maxCols = r.length; });
    var lastRow = Math.max(1, rows.length);
    var xml = [];
    xml.push(XML_HEAD);
    xml.push('<worksheet xmlns="' + NS_MAIN + '">');
    xml.push('<dimension ref="A1:' + colName(maxCols) + lastRow + '"/>');
    xml.push('<sheetViews><sheetView workbookViewId="0">' +
      (sheet.freeze === false ? '' :
        '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>') +
      '</sheetView></sheetViews>');
    xml.push('<sheetFormatPr defaultRowHeight="15"/>');

    if (Array.isArray(sheet.widths) && sheet.widths.length) {
      var cols = [];
      sheet.widths.forEach(function (w, i) {
        if (!w) return;
        cols.push('<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>');
      });
      if (cols.length) xml.push('<cols>' + cols.join('') + '</cols>');
    }

    xml.push('<sheetData>');
    rows.forEach(function (row, ri) {
      if (!Array.isArray(row) || !row.length) return;
      var cells = '';
      row.forEach(function (value, ci) {
        var style = (ri === 0 && sheet.header !== false && sheet.headerStyle !== 0) ? 1
          : (sheet.wrap ? 2 : 0);
        cells += cellXml(colName(ci + 1) + (ri + 1), value, style);
      });
      if (cells) xml.push('<row r="' + (ri + 1) + '">' + cells + '</row>');
    });
    xml.push('</sheetData>');

    if (rows.length > 1 && sheet.autoFilter !== false && sheet.header !== false && maxCols > 1) {
      xml.push('<autoFilter ref="A1:' + colName(maxCols) + '1"/>');
    }
    xml.push('</worksheet>');
    return xml.join('');
  }

  function workbookXml(names) {
    var sheets = names.map(function (n, i) {
      return '<sheet name="' + escapeXml(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
    }).join('');
    return XML_HEAD +
      '<workbook xmlns="' + NS_MAIN + '" xmlns:r="' + NS_DOC_REL + '">' +
      '<workbookPr/><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews>' +
      '<sheets>' + sheets + '</sheets></workbook>';
  }

  function workbookRelsXml(count) {
    var rels = [];
    for (var i = 1; i <= count; i++) {
      rels.push('<Relationship Id="rId' + i + '" Type="' + REL_BASE + '/worksheet" Target="worksheets/sheet' + i + '.xml"/>');
    }
    rels.push('<Relationship Id="rId' + (count + 1) + '" Type="' + REL_BASE + '/styles" Target="styles.xml"/>');
    return XML_HEAD + '<Relationships xmlns="' + NS_PKG_REL + '">' + rels.join('') + '</Relationships>';
  }

  function rootRelsXml() {
    return XML_HEAD + '<Relationships xmlns="' + NS_PKG_REL + '">' +
      '<Relationship Id="rId1" Type="' + REL_BASE + '/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>';
  }

  function contentTypesXml(count) {
    var overrides = [];
    overrides.push('<Override PartName="/xl/workbook.xml" ContentType="' + CT_WORKBOOK + '"/>');
    for (var i = 1; i <= count; i++) {
      overrides.push('<Override PartName="/xl/worksheets/sheet' + i + '.xml" ContentType="' + CT_SHEET + '"/>');
    }
    overrides.push('<Override PartName="/xl/styles.xml" ContentType="' + CT_STYLES + '"/>');
    return XML_HEAD + '<Types xmlns="' + NS_CT + '">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      overrides.join('') + '</Types>';
  }

  /* ---------------- 工作表名校验 ---------------- */
  var BAD_NAME = /[\\\/\?\*\[\]:]/g;
  function safeName(name, index, used) {
    var base = String(name == null ? '' : name).replace(BAD_NAME, ' ').replace(/\s+/g, ' ').trim();
    if (!base) base = 'Sheet' + (index + 1);
    base = base.slice(0, 31);
    var candidate = base;
    var n = 2;
    while (used[candidate]) {
      var suffix = '(' + n + ')';
      candidate = base.slice(0, 31 - suffix.length) + suffix;
      n += 1;
    }
    used[candidate] = 1;
    return candidate;
  }

  /* ---------------- 对外接口 ---------------- */
  // sheets: [{ name, rows: [[cell...]], widths: [number], freeze, header, wrap, autoFilter }]
  function build(sheets, opts) {
    opts = opts || {};
    var list = Array.isArray(sheets) ? sheets.filter(function (s) { return s && Array.isArray(s.rows); }) : [];
    if (!list.length) throw new Error('至少需要一张工作表');
    var used = {};
    var names = list.map(function (s, i) { return safeName(s.name, i, used); });

    var files = [];
    files.push({ name: '[Content_Types].xml', data: utf8(contentTypesXml(list.length)) });
    files.push({ name: '_rels/.rels', data: utf8(rootRelsXml()) });
    files.push({ name: 'xl/workbook.xml', data: utf8(workbookXml(names)) });
    files.push({ name: 'xl/_rels/workbook.xml.rels', data: utf8(workbookRelsXml(list.length)) });
    files.push({ name: 'xl/styles.xml', data: utf8(stylesXml()) });
    list.forEach(function (s, i) {
      files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: utf8(sheetXml(s)) });
    });

    var bytes = zip(files, opts.date instanceof Date ? opts.date : new Date());
    return { bytes: bytes, names: names, parts: files.map(function (f) { return f.name; }) };
  }

  root.OfferFitXlsx = {
    build: build,
    crc32: crc32,
    colName: colName,
    escapeXml: escapeXml,
    sheetXml: sheetXml,
    zip: zip,
    safeName: safeName
  };
})(typeof window !== 'undefined' ? window : this);
