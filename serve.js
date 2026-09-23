#!/usr/bin/env node
/**
 * 本地预览服务器
 * ------------------------------------------------------------------
 *   node serve.js          # 启动后打开 http://localhost:4000
 *   node serve.js 5000     # 指定端口
 *
 * 只是为了本地看效果，正式网站由 GitHub Pages 托管，不需要这个文件。
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || process.argv[2]) || 4000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2'
};

function resolveTarget(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const safe = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  let target = path.join(ROOT, safe);

  if (!target.startsWith(ROOT)) return null;
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    target = path.join(target, 'index.html');
  }
  return target;
}

const server = http.createServer((req, res) => {
  const target = resolveTarget(req.url === '/' ? '/index.html' : req.url);

  if (!target || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    const notFound = path.join(ROOT, '404.html');
    res.writeHead(404, { 'Content-Type': TYPES['.html'] });
    res.end(fs.existsSync(notFound) ? fs.readFileSync(notFound) : '404 Not Found');
    return;
  }

  const ext = path.extname(target).toLowerCase();
  res.writeHead(200, {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Cache-Control': 'no-store'
  });
  fs.createReadStream(target).pipe(res);
});

server.listen(PORT, () => {
  console.log(`\n  🚀 本地预览已启动：http://localhost:${PORT}`);
  console.log('  （按 Ctrl + C 停止）\n');
});
