#!/usr/bin/env node
/**
 * 一键发布：构建 → 提交 → 推送到 GitHub
 * ------------------------------------------------------------------
 *   node publish.js
 *
 * 第一次运行会弹出 GitHub 登录窗口，登录一次即可，以后不用再登。
 * 推送成功后 GitHub Pages 大约 1 分钟后更新。
 */
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const AUTHOR_NAME = 'IrisZ0910';
const AUTHOR_EMAIL = 'IrisZ0910@users.noreply.github.com';

function run(args, options = {}) {
  return spawnSync(args[0], args.slice(1), {
    cwd: ROOT,
    stdio: options.capture ? 'pipe' : 'inherit',
    encoding: 'utf8'
  });
}

function git(args, options) {
  return run(['git', ...args], options);
}

console.log('\n  [1/4] 重新构建网站…\n');
const build = run([process.execPath, path.join(ROOT, 'build.js')]);
if (build.status !== 0) {
  console.log('\n  构建失败，先解决上面的报错再发布。\n');
  process.exit(build.status || 1);
}

const insideRepo = git(['rev-parse', '--is-inside-work-tree'], { capture: true });
if (insideRepo.status !== 0) {
  console.log('\n  这个文件夹还不是 Git 仓库，没法直接推送。');
  console.log('  你可以改成在 GitHub 网页上直接上传文章（见 README.md）。\n');
  process.exit(1);
}

console.log('\n  [2/4] 记录改动…');
git(['add', '-A']);

const staged = git(['diff', '--cached', '--quiet'], { capture: true });
if (staged.status === 0) {
  console.log('\n  没有新的改动，不需要发布。\n');
  process.exit(0);
}

const stamp = new Date().toLocaleString('zh-CN', { hour12: false });
console.log('\n  [3/4] 提交…');
const commit = git([
  '-c', `user.name=${AUTHOR_NAME}`,
  '-c', `user.email=${AUTHOR_EMAIL}`,
  'commit',
  '-m', `更新博客 ${stamp}`
]);
if (commit.status !== 0) {
  console.log('\n  提交失败，请把上面的报错发给管理员看看。\n');
  process.exit(commit.status || 1);
}

const remote = git(['remote'], { capture: true });
if (!remote.stdout || !remote.stdout.trim()) {
  console.log('\n  这个仓库还没有配置远程地址（origin），先跳过推送。');
  console.log('  改好的文件已经在本地提交了，可以手动上传到 GitHub。\n');
  process.exit(0);
}

console.log('\n  [4/4] 推送到 GitHub…');
console.log('  （如果弹出登录窗口，用浏览器登录一次 GitHub 就好）\n');
const push = git(['push']);

if (push.status !== 0) {
  console.log('\n  推送失败。常见原因：');
  console.log('    1. 还没登录 GitHub —— 重新运行一次，在弹窗里登录');
  console.log('    2. 网络不稳定 —— 过一会儿再试');
  console.log('    3. 远程有新提交 —— 先执行 git pull --rebase 再发布\n');
  process.exit(push.status || 1);
}

console.log('\n  ✅ 发布成功！大约 1 分钟后访问：https://irisz0910.github.io\n');
