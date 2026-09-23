#!/usr/bin/env node
/**
 * 本地预览：先构建，再启动本地服务器并打开浏览器
 * ------------------------------------------------------------------
 *   node preview.js          # 默认 4000 端口
 *   node preview.js 5000
 */
'use strict';

const path = require('path');
const { spawnSync, exec } = require('child_process');

const PORT = Number(process.argv[2]) || 4000;
const URL = `http://localhost:${PORT}`;

console.log('\n  [1/2] 正在构建网站…\n');

const build = spawnSync(process.execPath, [path.join(__dirname, 'build.js')], {
  stdio: 'inherit',
  cwd: __dirname
});

if (build.status !== 0) {
  console.log('\n  构建失败，先解决上面的报错再预览。\n');
  process.exit(build.status || 1);
}

console.log(`\n  [2/2] 启动本地预览：${URL}`);
console.log('  停止预览：关掉这个窗口，或者按 Ctrl + C\n');

if (process.platform === 'win32') {
  exec(`start "" ${URL}`, () => {});
} else if (process.platform === 'darwin') {
  exec(`open ${URL}`, () => {});
} else {
  exec(`xdg-open ${URL}`, () => {});
}

process.env.PORT = String(PORT);
require(path.join(__dirname, 'serve.js'));
