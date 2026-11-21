/*
 * OfferFit 本地静态服务（零依赖 Node 版本，作为 Python 不可用时的备用通道）
 * 用法：node serve.js [端口]
 */
'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');

var ROOT = __dirname;
var PORT = parseInt(process.argv[2] || '5180', 10);
var HOST = '127.0.0.1';

var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.wasm': 'application/wasm'
};

function send(res, code, type, body) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  res.end(body);
}

var server = http.createServer(function (req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'text/plain; charset=utf-8', 'Method Not Allowed');
  }

  var pathname = '/';
  try {
    pathname = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
  } catch (e) {
    return send(res, 400, 'text/plain; charset=utf-8', 'Bad Request');
  }
  if (pathname === '/' || pathname === '') pathname = '/index.html';

  var file = path.normalize(path.join(ROOT, pathname));
  if (file.indexOf(ROOT) !== 0) {
    return send(res, 403, 'text/plain; charset=utf-8', 'Forbidden');
  }

  fs.stat(file, function (err, st) {
    if (err || !st.isFile()) {
      return send(res, 404, 'text/plain; charset=utf-8', '404 Not Found: ' + pathname);
    }
    var type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': st.size,
      'Cache-Control': 'no-cache'
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
});

server.on('error', function (err) {
  if (err && err.code === 'EADDRINUSE') {
    console.error('端口 ' + PORT + ' 已被占用，请关闭占用该端口的程序后重试。');
  } else if (err && err.code === 'EACCES') {
    console.error('端口 ' + PORT + ' 无访问权限，请换一个端口。');
  } else {
    console.error('服务启动失败：' + (err && err.message ? err.message : err));
  }
  process.exit(1);
});

server.listen(PORT, HOST, function () {
  console.log('');
  console.log('  OfferFit 已启动：http://' + HOST + ':' + PORT + '/index.html');
  console.log('  保持本窗口开启，关闭窗口即停止服务。');
  console.log('');
});
