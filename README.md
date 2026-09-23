# 我的博客

用 Markdown 写文章，自动生成静态网站，托管在 GitHub Pages 上。

网址：<https://irisz0910.github.io>

---

## 最快的发文方式（不用装任何东西）

1. 打开仓库里的 `posts` 文件夹
2. 点右上角 **Add file → Upload files**
3. 把写好的 `.md` 文件拖进去（**可以一次拖好几篇**）
4. 点 **Commit changes**

完成后 GitHub 会自动重新构建整站，大约 1 分钟后刷新博客就能看到新文章。
首页的列表、归档、标签都会自动更新，不需要手动改任何其他文件。

### 文章文件怎么命名

```
2026-09-23-今天的收获.md
└─ 日期 ─┘ └── 标题 ──┘
```

- 必须以 `YYYY-MM-DD-` 开头（日期会显示在文章上）
- 后面的部分就是网址里用的名字
- 文件名里不要出现 `\ / : * ? " < > |` 这些符号

### 文章开头写什么

每个文件的**最上面**加一段这样的信息（叫 front matter）：

```markdown
---
title: 今天的收获
date: 2026-09-23 20:30
tags: [学习笔记, 日记]
summary: 一句话摘要，会显示在首页卡片上。
---

正文从这里开始写……
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `title` | 否 | 不写就用文件名里的标题 |
| `date` | 否 | 不写就用文件名开头的日期 |
| `tags` | 否 | 标签，用逗号或方括号分隔，首页可以按标签筛选 |
| `summary` | 否 | 首页卡片上的摘要，不写就自动取正文开头 |
| `draft` | 否 | 写 `true` 就不会被发布 |

正文支持所有常用 Markdown：标题、列表、表格、引用、代码块、图片、链接。

---

## 在电脑上写作（可选，适合想先预览再发布）

电脑上需要有 [Node.js](https://nodejs.org/)。仓库文件夹里已经放了三个双击就能用的脚本：

| 脚本 | 作用 |
| --- | --- |
| `新建文章.bat` | 问你标题和标签，自动生成带日期的 Markdown 文件并打开 |
| `本地预览.bat` | 构建 + 打开 <http://localhost:4000> 看效果 |
| `一键发布.bat` | 构建 → 提交 → 推送到 GitHub（首次会让你登录一次） |

命令行方式：

```bash
npm install          # 第一次先装依赖
node new-post.js "文章标题" 标签1,标签2
node build.js        # 生成整站
node serve.js        # 本地预览
```

---

## 目录结构

```
├── posts/                  ← 你的文章（一个 .md 一篇）
│   └── 2026-09-23-标题.md
├── pages/                  ← 独立页面
│   └── about.md            →  /about.html
├── assets/
│   ├── css/style.css       ← 主题样式（改这里换外观）
│   ├── js/app.js           ← 交互脚本
│   ├── vendor/             ← 第三方库
│   └── images/             ← 文章插图放这里
├── blog.config.js          ← 站点配置（标题、简介、GitHub 链接等）
├── build.js                ← 构建脚本（不用改）
├── serve.js                ← 本地预览服务
├── new-post.js             ← 新建文章
├── index.html              ← 自动生成，不用手改
├── archives.html           ← 自动生成
├── tags.html               ← 自动生成
└── .github/workflows/build.yml  ← 自动构建配置
```

> 带「自动生成」的文件都是由 `posts/` 和 `pages/` 里的 Markdown 生成的，
> 手动改它们会在下次构建时被覆盖。

---

## 改站点信息

打开 `blog.config.js`，里面每一项都有注释：

```js
title: '我的博客',           // 站点标题
subtitle: '记录我的学习、折腾与生活',
heroTitle: '你好，世界 👋',   // 首页大标题
github: 'https://github.com/IrisZ0910',
```

改完保存，然后重新构建（或上传这个文件，等待自动构建）。

---

## 常见问题

**文章上传了，但首页没出现？**

1. 先等 1～2 分钟（GitHub 需要时间构建）
2. 到仓库的 **Actions** 标签页看构建有没有报错
3. 打开文章链接直接访问试试：`https://irisz0910.github.io/posts/文件名去掉md/`
   （即使还没构建完，首页也会把它列出来，点进去可以直接阅读）

**Actions 里显示权限错误？**

到仓库 **Settings → Actions → General → Workflow permissions**，
选择 **Read and write permissions**，保存后重新上传一次文章。

**自动构建没跑？**

到 **Actions** 标签页，点左侧「自动构建博客」，再点 **Run workflow** 手动触发一次。

**本地构建报错？**

```bash
npm install     # 依赖没装或者装坏了，重装一次
```
