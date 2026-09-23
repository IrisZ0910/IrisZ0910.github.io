#!/usr/bin/env node
/**
 * 新建一篇文章
 * ------------------------------------------------------------------
 *   node new-post.js                        # 交互式输入标题和标签
 *   node new-post.js "文章标题"              # 直接给标题
 *   node new-post.js "文章标题" 生活,随笔     # 标题 + 标签
 *   node new-post.js "标题" 标签 --no-open   # 生成后不用编辑器打开
 *
 * 会在 posts/ 里生成一个带正确日期的 Markdown 文件。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { exec } = require('child_process');

const POSTS_DIR = path.join(__dirname, 'posts');
const argv = process.argv.slice(2).filter((a) => a !== '--no-open');
const noOpen = process.argv.includes('--no-open');

/** 文件名里不保留这些符号，避免各种奇怪的路径问题 */
function safeFilename(text) {
  return String(text)
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function createPost(title, tags) {
  const now = new Date();
  const dateOnly = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timeOnly = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const filename = `${dateOnly}-${safeFilename(title)}.md`;
  const target = path.join(POSTS_DIR, filename);

  if (fs.existsSync(target)) {
    console.log(`\n⚠️  文件已存在，没有覆盖：posts/${filename}\n`);
    return target;
  }

  const tagList = String(tags || '生活随笔')
    .split(/[,，、]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .join(', ');

  const template = `---
title: ${title}
date: ${dateOnly} ${timeOnly}
tags: [${tagList}]
summary: 
---

在这里开始写正文。

## 小标题

正文内容，支持 Markdown：

- **加粗**、*斜体*、\`行内代码\`
- [链接文字](https://github.com/IrisZ0910)
- 插图：![说明文字](/assets/images/图片名.png)

> 这一段是引用。

\`\`\`bash
# 代码块
echo "hello"
\`\`\`
`;

  fs.mkdirSync(POSTS_DIR, { recursive: true });
  fs.writeFileSync(target, template, 'utf8');

  console.log(`\n✅ 已创建：posts/${filename}`);
  console.log('   写完保存后：双击「本地预览.bat」看效果，「一键发布.bat」发到网上。\n');

  if (process.platform === 'win32' && !noOpen) {
    exec(`start "" "${target}"`, () => {});
  }
  return target;
}

function ask(question, fallback) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      const value = answer.trim();
      resolve(value || fallback);
    });
  });
}

async function main() {
  let [title, tags] = argv;

  if (!title) {
    if (!process.stdin.isTTY) {
      console.log('用法：node new-post.js "文章标题" [标签1,标签2]');
      process.exit(1);
    }
    title = await ask('请输入文章标题：', '');
    if (!title) {
      console.log('\n标题不能为空，请重新运行。\n');
      process.exit(1);
    }
    tags = await ask('输入标签（逗号分隔，直接回车用「生活随笔」）：', '生活随笔');
  }

  createPost(title, tags);
}

main();
