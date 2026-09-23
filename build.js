#!/usr/bin/env node
/**
 * 博客构建脚本
 * ------------------------------------------------------------------
 * 把 posts/ 和 pages/ 里的 Markdown 文件生成为完整的静态网站。
 *
 *   node build.js      # 生成整站
 *
 * 生成的内容：
 *   index.html              首页（文章列表）
 *   archives.html           归档（按年份）
 *   tags.html               标签总览
 *   posts/<文件名>/index.html   每篇文章
 *   <页面名>.html            pages/ 里的独立页面（如 about.md -> about.html）
 *   atom.xml                订阅源
 *   search-index.json       站内搜索用的索引
 *
 * 你不需要手动改这个文件，只管写 Markdown 就行。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { marked, Renderer } = require('marked');
const hljs = require('highlight.js');
const SITE = require('./blog.config.js');

const ROOT = __dirname;
const POSTS_DIR = path.join(ROOT, 'posts');
const PAGES_DIR = path.join(ROOT, 'pages');
const SITE_URL = 'https://irisz0910.github.io';

/* ------------------------------------------------------------------ */
/* 工具函数                                                            */
/* ------------------------------------------------------------------ */

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 去掉 Markdown 标记，得到纯文本（用于摘要和搜索索引） */
function toPlainText(md = '') {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/[*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 估算阅读时间（分钟）：中文按 350 字/分钟，英文按 200 词/分钟 */
function readingMinutes(text) {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const words = (text.replace(/[\u4e00-\u9fff]/g, ' ').match(/[A-Za-z0-9]+/g) || []).length;
  return Math.max(1, Math.round(cjk / 350 + words / 200));
}

/** 生成锚点 id，保留中文（中文锚点在浏览器里也没问题） */
function makeSlugger() {
  const used = new Map();
  return function slugify(raw) {
    let base = String(raw)
      .trim()
      .toLowerCase()
      .replace(/[\s]+/g, '-')
      .replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~]/g, '')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '');
    if (!base) base = 'section';
    const count = used.get(base) || 0;
    used.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  };
}

/* ------------------------------------------------------------------ */
/* Front matter 解析                                                   */
/* ------------------------------------------------------------------ */

function parseFrontMatter(raw) {
  const normalised = raw.replace(/^\uFEFF/, '');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(normalised);
  const meta = {};
  let body = normalised;

  if (match) {
    body = normalised.slice(match[0].length);
    for (const line of match[1].split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf(':');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim().toLowerCase();
      let value = trimmed.slice(idx + 1).trim();

      // 去掉成对的引号
      if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);

      if (key === 'tags' || key === 'categories' || key === 'category') {
        const list = value
          .replace(/^\[|\]$/g, '')
          .split(/[,，、]/)
          .map((t) => t.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
        if (key === 'tags') meta.tags = list;
        else meta.tags = (meta.tags || []).concat(list);
      } else {
        meta[key] = value;
      }
    }
  }

  // 分类也算标签，方便统一展示
  return { meta, body: body.trim() };
}

/** 从文件名解析日期和标题，例如 2026-09-22-我的第一篇文章.md */
function parseFilename(filename) {
  const base = filename.replace(/\.md$/i, '');
  const m = /^(\d{4})-(\d{2})-(\d{2})[-_ ]+(.*)$/.exec(base);
  if (m) {
    return {
      date: `${m[1]}-${m[2]}-${m[3]}`,
      hasTime: false,
      titleFromName: m[4].replace(/[-_]+/g, ' ').trim(),
      slug: base
    };
  }
  return { date: null, hasTime: false, titleFromName: base, slug: base };
}

/** 把各种写法的 date 归一化 */
function normaliseDate(meta, filename, filePath) {
  const fromName = parseFilename(filename);
  const raw = (meta.date || meta.updated || '').toString().trim();
  const source = raw || fromName.date;

  if (source) {
    const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(source);
    if (m) {
      const [, y, mo, d, hh, mi, ss] = m;
      const pad = (v, len = 2) => String(v ?? '0').padStart(len, '0');
      return {
        iso: `${y}-${pad(mo)}-${pad(d)}T${pad(hh)}:${pad(mi)}:${pad(ss)}+08:00`,
        display: `${y}-${pad(mo)}-${pad(d)}`,
        hasTime: Boolean(hh),
        time: hh ? `${pad(hh)}:${pad(mi)}` : ''
      };
    }
  }

  // 兜底：文件修改时间
  const stat = fs.statSync(filePath);
  const d = stat.mtime;
  const pad = (v) => String(v).padStart(2, '0');
  return {
    iso: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00+08:00`,
    display: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    hasTime: true,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`
  };
}

/* ------------------------------------------------------------------ */
/* Markdown 渲染                                                       */
/* ------------------------------------------------------------------ */

function renderMarkdown(markdown) {
  const slugify = makeSlugger();
  const toc = [];
  const renderer = new Renderer();

  renderer.heading = function heading(token) {
      const inner = this.parser.parseInline(token.tokens);
      const id = slugify(token.text || inner.replace(/<[^>]+>/g, ''));
      if (token.depth === 2 || token.depth === 3) {
        toc.push({ depth: token.depth, id, text: (token.text || '').replace(/[*_`]/g, '') });
      }
      const anchor = `<a class="heading-anchor" href="#${encodeURIComponent(id)}" aria-label="链接到此标题">#</a>`;
      return `<h${token.depth} id="${escapeHtml(id)}">${inner}${anchor}</h${token.depth}>\n`;
    };

  renderer.code = function code(token) {
      const lang = (token.lang || '').split(/\s+/)[0].toLowerCase();
      let highlighted;
      let shownLang = lang;

      if (lang && hljs.getLanguage(lang)) {
        highlighted = hljs.highlight(token.text, { language: lang, ignoreIllegals: true }).value;
      } else if (lang) {
        highlighted = escapeHtml(token.text);
      } else {
        const auto = hljs.highlightAuto(token.text);
        highlighted = auto.value;
        shownLang = auto.language || 'text';
      }

      return `<div class="code-block">
  <div class="code-head"><span class="code-lang">${escapeHtml(shownLang || 'text')}</span><button class="code-copy" type="button">复制</button></div>
  <pre><code class="hljs language-${escapeHtml(shownLang || 'text')}">${highlighted}</code></pre>
</div>\n`;
    };

  renderer.link = function link(token) {
      const inner = this.parser.parseInline(token.tokens);
      const href = token.href || '#';
      const external = /^https?:\/\//i.test(href) && !href.includes('irisz0910.github.io');
      const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : '';
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
      return `<a href="${escapeHtml(href)}"${title}${attrs}>${inner}</a>`;
    };

  renderer.image = function image(token) {
      const alt = escapeHtml(token.text || '');
      const src = escapeHtml(token.href || '');
      const caption = token.title
        ? `<figcaption>${escapeHtml(token.title)}</figcaption>`
        : '';
      return `<figure><img src="${src}" alt="${alt}" loading="lazy" decoding="async">${caption}</figure>`;
    };

  renderer.table = function table(token) {
      const align = token.align || [];
      const header = `<thead><tr>${token.header
        .map((cell, i) => `<th${align[i] ? ` style="text-align:${align[i]}"` : ''}>${this.parser.parseInline(cell.tokens)}</th>`)
        .join('')}</tr></thead>`;
      const body = `<tbody>${token.rows
        .map(
          (row) =>
            `<tr>${row
              .map((cell, i) => `<td${align[i] ? ` style="text-align:${align[i]}"` : ''}>${this.parser.parseInline(cell.tokens)}</td>`)
              .join('')}</tr>`
        )
        .join('')}</tbody>`;
      return `<div class="table-wrap"><table>${header}${body}</table></div>\n`;
    };

  const html = marked.parse(markdown, { gfm: true, breaks: false, renderer });
  return { html, toc };
}

/* ------------------------------------------------------------------ */
/* 页面模板                                                            */
/* ------------------------------------------------------------------ */

function navLinks(active = '') {
  const items = [
    { href: '/', label: '首页', key: 'home' },
    { href: '/archives.html', label: '归档', key: 'archives' },
    { href: '/tags.html', label: '标签', key: 'tags' },
    { href: '/about.html', label: '关于', key: 'about' }
  ];
  return items
    .map(
      (item) =>
        `<a class="nav-link${active === item.key ? ' is-active' : ''}" href="${item.href}"${
          active === item.key ? ' aria-current="page"' : ''
        }>${item.label}</a>`
    )
    .join('');
}

function layout({ title, description, content, active = '', bodyClass = '', withProgress = false, scripts = '' }) {
  const pageTitle = title ? `${escapeHtml(title)} · ${escapeHtml(SITE.title)}` : escapeHtml(SITE.title);
  const desc = escapeHtml(description || SITE.description);

  return `<!DOCTYPE html>
<html lang="${escapeHtml(SITE.lang)}" data-theme="light">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${pageTitle}</title>
<meta name="description" content="${desc}">
<meta name="author" content="${escapeHtml(SITE.author)}">
<meta property="og:title" content="${pageTitle}">
<meta property="og:description" content="${desc}">
<meta property="og:type" content="${active === 'post' ? 'article' : 'website'}">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="alternate" type="application/atom+xml" title="${escapeHtml(SITE.title)}" href="/atom.xml">
<link rel="stylesheet" href="/assets/css/style.css">
<script>
/* 在页面渲染前决定深浅色，避免闪白 */
(function () {
  try {
    var saved = localStorage.getItem('theme');
    var theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
})();
</script>
</head>
<body class="${bodyClass}">
<a class="skip-link" href="#main">跳到正文</a>
${withProgress ? '<div class="reading-progress" aria-hidden="true"><span id="readingBar"></span></div>' : ''}
<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="/">
      <span class="brand-mark">${escapeHtml(SITE.avatar)}</span>
      <span class="brand-text">${escapeHtml(SITE.title)}</span>
    </a>
    <nav class="nav" aria-label="主导航">${navLinks(active)}</nav>
    <button class="theme-toggle" id="themeToggle" type="button" aria-label="切换深浅色">
      <svg class="icon-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><g stroke-linecap="round"><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6"/></g></svg>
      <svg class="icon-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg>
    </button>
  </div>
</header>
<main id="main">
${content}
</main>
<footer class="site-footer">
  <div class="wrap footer-inner">
    <p class="footer-copy">© ${new Date().getFullYear()} ${escapeHtml(SITE.copyright)} · 用 ❤️ 和 Markdown 写成</p>
    <p class="footer-links">
      <a href="/archives.html">归档</a>
      <a href="/tags.html">标签</a>
      <a href="/atom.xml">RSS</a>
      ${SITE.github ? `<a href="${escapeHtml(SITE.github)}" target="_blank" rel="noopener noreferrer">GitHub</a>` : ''}
    </p>
  </div>
</footer>
<button class="to-top" id="toTop" type="button" aria-label="回到顶部">↑</button>
<script>window.BLOG = {repo: "IrisZ0910/IrisZ0910.github.io", branch: "main", siteTitle: ${JSON.stringify(SITE.title)}};</script>
${scripts}<script src="/assets/js/app.js" defer></script>
</body>
</html>
`;
}

function postCard(post) {
  return `      <article class="card" data-tags="${escapeHtml(post.tags.join(','))}" data-search="${escapeHtml(
    post.searchText
  )}">
        <a class="card-link" href="${post.url}">
          <div class="card-glow" aria-hidden="true"></div>
          <div class="card-meta">
            <time datetime="${post.date.iso}">${post.date.display}</time>
            ${post.date.hasTime ? `<span class="meta-time">${post.date.time}</span>` : ''}
            <span class="meta-dot"></span>
            <span>${post.minutes} 分钟</span>
          </div>
          <h2 class="card-title">${escapeHtml(post.title)}</h2>
          <p class="card-excerpt">${escapeHtml(post.excerpt)}</p>
          <div class="card-foot">
            ${post.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
            <span class="card-more">阅读 →</span>
          </div>
        </a>
      </article>`;
}

function homePage(posts, tags) {
  const latest = posts[0];
  const cards = posts.map(postCard).join('\n');

  const content = `  <section class="hero">
    <div class="hero-bg" aria-hidden="true"></div>
    <div class="wrap hero-inner">
      <span class="hero-avatar">${escapeHtml(SITE.avatar)}</span>
      <h1 class="hero-title">${escapeHtml(SITE.heroTitle)}</h1>
      <p class="hero-text">${escapeHtml(SITE.heroText)}</p>
      <div class="hero-actions">
        <a class="btn btn-primary" href="#posts">开始阅读</a>
        ${SITE.github ? `<a class="btn btn-ghost" href="${escapeHtml(SITE.github)}" target="_blank" rel="noopener noreferrer">我的 GitHub</a>` : ''}
      </div>
      <ul class="hero-stats">
        <li><strong>${posts.length}</strong><span>篇文章</span></li>
        <li><strong>${tags.length}</strong><span>个标签</span></li>
        <li><strong>${latest ? latest.date.display : '—'}</strong><span>最近更新</span></li>
      </ul>
    </div>
  </section>

  <section class="posts wrap" id="posts">
    <div class="section-head">
      <h2 class="section-title">最新文章</h2>
      <div class="search-box">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>
        <input id="searchInput" type="search" placeholder="搜索文章…" aria-label="搜索文章" autocomplete="off">
      </div>
    </div>
    <div class="filters" id="tagFilters" role="group" aria-label="按标签筛选">
      <button class="chip is-active" type="button" data-tag="*">全部</button>
      ${tags.map((t) => `<button class="chip" type="button" data-tag="${escapeHtml(t.name)}">${escapeHtml(t.name)}<span class="chip-count">${t.count}</span></button>`).join('')}
    </div>
    <div class="post-grid" id="postGrid">
${cards || '      <p class="empty">还没有文章，去 <code>posts/</code> 里写下第一篇吧。</p>'}
    </div>
    <p class="empty" id="emptyState" hidden>没有找到匹配的文章 🙈</p>
  </section>
`;

  return layout({ title: '', description: SITE.description, content, active: 'home' });
}

function postPage(post, prev, next) {
  const tocHtml = post.toc.length
    ? `      <aside class="toc" aria-label="目录">
        <p class="toc-title">目录</p>
        <ul>
${post.toc.map((h) => `          <li class="toc-h${h.depth}"><a href="#${escapeHtml(encodeURIComponent(h.id))}">${escapeHtml(h.text)}</a></li>`).join('\n')}
        </ul>
      </aside>
`
    : '';

  const navHtml =
    prev || next
      ? `    <nav class="post-nav" aria-label="上下篇">
${prev ? `      <a class="post-nav-item" href="${prev.url}"><span class="post-nav-label">← 上一篇</span><span class="post-nav-title">${escapeHtml(prev.title)}</span></a>` : '<span></span>'}
${next ? `      <a class="post-nav-item next" href="${next.url}"><span class="post-nav-label">下一篇 →</span><span class="post-nav-title">${escapeHtml(next.title)}</span></a>` : ''}
    </nav>`
      : '';

  const content = `  <article class="post wrap">
    <header class="post-header">
      <a class="back-link" href="/">← 返回首页</a>
      <h1 class="post-title">${escapeHtml(post.title)}</h1>
      <div class="post-meta">
        <time datetime="${post.date.iso}">${post.date.display}${post.date.hasTime ? ` ${post.date.time}` : ''}</time>
        <span class="meta-dot"></span>
        <span>${post.minutes} 分钟阅读</span>
        ${post.tags.length ? `<span class="meta-dot"></span><span class="post-tags">${post.tags.map((t) => `<a class="tag" href="/tags.html#${encodeURIComponent(t)}">${escapeHtml(t)}</a>`).join('')}</span>` : ''}
      </div>
    </header>
    <div class="post-layout${post.toc.length ? ' has-toc' : ''}">
${tocHtml}      <div class="post-content prose">
${post.html}
      </div>
    </div>
${navHtml}
  </article>
`;

  return layout({
    title: post.title,
    description: post.excerpt,
    content,
    active: 'post',
    bodyClass: 'is-post',
    withProgress: true
  });
}

function archivesPage(posts) {
  const byYear = new Map();
  for (const post of posts) {
    const year = post.date.display.slice(0, 4);
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push(post);
  }

  const sections = [...byYear.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(
      ([year, list]) => `    <section class="timeline-year">
      <h2 class="year-title"><span>${year}</span><em>${list.length} 篇</em></h2>
      <ul class="timeline">
${list
  .map(
    (p) => `        <li>
          <time datetime="${p.date.iso}">${p.date.display.slice(5)}</time>
          <a href="${p.url}">${escapeHtml(p.title)}</a>
        </li>`
  )
  .join('\n')}
      </ul>
    </section>`
    )
    .join('\n');

  const content = `  <section class="page-head wrap">
    <h1>归档</h1>
    <p class="page-desc">共 ${posts.length} 篇文章，按时间倒序排列。</p>
  </section>
  <section class="wrap archives">
${sections || '    <p class="empty">还没有文章。</p>'}
  </section>
`;

  return layout({ title: '归档', description: `全部文章归档，共 ${posts.length} 篇`, content, active: 'archives' });
}

function tagsPage(posts, tags) {
  const sections = tags
    .map((tag) => {
      const list = posts.filter((p) => p.tags.includes(tag.name));
      return `    <section class="tag-section" id="${escapeHtml(tag.name)}">
      <h2 class="tag-title">${escapeHtml(tag.name)}<em>${tag.count}</em></h2>
      <ul class="tag-posts">
${list.map((p) => `        <li><time datetime="${p.date.iso}">${p.date.display}</time><a href="${p.url}">${escapeHtml(p.title)}</a></li>`).join('\n')}
      </ul>
    </section>`;
    })
    .join('\n');

  const content = `  <section class="page-head wrap">
    <h1>标签</h1>
    <p class="page-desc">共 ${tags.length} 个标签，点击跳转到对应文章。</p>
  </section>
  <section class="wrap tag-cloud-wrap">
    <div class="tag-cloud">
${tags
  .map(
    (t) =>
      `<a class="tag-cloud-item" href="#${encodeURIComponent(t.name)}" style="font-size:${(0.95 + Math.min(t.count, 5) * 0.13).toFixed(2)}rem">${escapeHtml(t.name)}<span class="chip-count">${t.count}</span></a>`
  )
  .join('\n')}
    </div>
  </section>
  <section class="wrap">
${sections || '    <p class="empty">还没有标签。</p>'}
  </section>
`;

  return layout({ title: '标签', description: `按标签浏览文章，共 ${tags.length} 个标签`, content, active: 'tags' });
}

function standalonePage(page) {
  const content = `  <article class="post wrap">
    <header class="post-header">
      <h1 class="post-title">${escapeHtml(page.title)}</h1>
      ${page.meta.subtitle ? `<p class="page-desc">${escapeHtml(page.meta.subtitle)}</p>` : ''}
    </header>
    <div class="post-content prose">
${page.html}
    </div>
  </article>
`;
  return layout({ title: page.title, description: page.meta.subtitle || page.excerpt, content, active: page.slug });
}

function notFoundPage() {
  const content = `  <section class="wrap not-found">
    <p class="not-found-code">404</p>
    <h1>这个页面走丢了 🧭</h1>
    <p class="page-desc">你要找的内容可能被移动或者删除了。</p>
    <p><a class="btn btn-primary" href="/">回到首页</a></p>
  </section>
`;
  return layout({ title: '页面未找到', description: '404 页面未找到', content });
}

/**
 * reader.html —— 兜底阅读页
 * 新上传的 Markdown 如果还没被自动构建成页面，
 * 就在这里用浏览器现场渲染，保证「传上去就能看」。
 */
function readerPage() {
  const content = `  <article class="post wrap">
    <header class="post-header">
      <a class="back-link" href="/">← 返回首页</a>
      <h1 class="post-title" id="readerTitle">正在加载…</h1>
      <div class="post-meta" id="readerMeta"></div>
    </header>
    <div class="post-content prose" id="readerBody">
      <p class="empty">正在读取文章…</p>
    </div>
  </article>
`;
  return layout({
    title: '阅读文章',
    description: SITE.description,
    content,
    bodyClass: 'is-post is-reader',
    withProgress: true,
    scripts: '<script src="/assets/vendor/marked.min.js"></script>\n'
  });
}

/* ------------------------------------------------------------------ */
/* 读取内容                                                            */
/* ------------------------------------------------------------------ */

function readCollection(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /\.md$/i.test(f) && !f.startsWith('_') && !f.startsWith('.'))
    .map((f) => ({ filename: f, fullPath: path.join(dir, f) }));
}

function buildPosts() {
  const posts = [];

  for (const file of readCollection(POSTS_DIR)) {
    const raw = fs.readFileSync(file.fullPath, 'utf8');
    const { meta, body } = parseFrontMatter(raw);

    if (String(meta.draft).toLowerCase() === 'true') continue;

    const fromName = parseFilename(file.filename);
    const title = meta.title || fromName.titleFromName;
    const date = normaliseDate(meta, file.filename, file.fullPath);
    const plain = toPlainText(body);
    const { html, toc } = renderMarkdown(body);

    const summary = meta.summary || meta.description || '';
    let excerpt = summary || plain.slice(0, 140);
    if (!summary && plain.length > 140) excerpt += '…';

    posts.push({
      slug: fromName.slug,
      filename: file.filename,
      title,
      date,
      tags: meta.tags || [],
      meta,
      body,
      html,
      toc,
      plain,
      excerpt,
      minutes: readingMinutes(plain),
      url: `/posts/${encodeURIComponent(fromName.slug)}/`,
      searchText: `${title} ${(meta.tags || []).join(' ')} ${plain.slice(0, 500)}`
    });
  }

  posts.sort((a, b) => (a.date.iso < b.date.iso ? 1 : a.date.iso > b.date.iso ? -1 : a.title.localeCompare(b.title)));
  return posts;
}

function collectTags(posts) {
  const map = new Map();
  for (const post of posts) {
    for (const tag of post.tags) map.set(tag, (map.get(tag) || 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/* ------------------------------------------------------------------ */
/* 写文件                                                              */
/* ------------------------------------------------------------------ */

function writeFile(relative, contents) {
  const target = path.join(ROOT, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents, 'utf8');
  return relative;
}

function buildAtomFeed(posts) {
  const updated = posts[0] ? posts[0].date.iso : new Date().toISOString();
  const entries = posts
    .slice(0, 30)
    .map(
      (p) => `  <entry>
    <title type="html">${escapeHtml(p.title)}</title>
    <link href="${SITE_URL}${p.url}"/>
    <id>${SITE_URL}${p.url}</id>
    <updated>${p.date.iso}</updated>
    <summary type="html">${escapeHtml(p.excerpt)}</summary>
  </entry>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeHtml(SITE.title)}</title>
  <subtitle>${escapeHtml(SITE.subtitle)}</subtitle>
  <link href="${SITE_URL}/atom.xml" rel="self"/>
  <link href="${SITE_URL}/"/>
  <id>${SITE_URL}/</id>
  <updated>${updated}</updated>
  <author><name>${escapeHtml(SITE.author)}</name></author>
${entries}
</feed>
`;
}

function buildFavicon() {
  const letter = escapeHtml((SITE.avatar || 'I').slice(0, 2));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ec4899"/>
      <stop offset="1" stop-color="#8b5cf6"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="16" fill="url(#g)"/>
  <text x="32" y="43" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="34" font-weight="600" fill="#fff" text-anchor="middle">${letter}</text>
</svg>
`;
}

/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */

/** 删掉已经不存在的文章留下的旧页面（只清理自动生成的 index.html） */
function cleanStalePosts(posts) {
  if (!fs.existsSync(POSTS_DIR)) return 0;
  const keep = new Set(posts.map((p) => p.slug));
  let removed = 0;

  for (const entry of fs.readdirSync(POSTS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory() || keep.has(entry.name)) continue;
    const dir = path.join(POSTS_DIR, entry.name);
    const generated = path.join(dir, 'index.html');
    if (fs.existsSync(generated)) {
      fs.unlinkSync(generated);
      removed += 1;
    }
    // 目录空了才删，避免误删你自己放进去的图片
    if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  }
  return removed;
}

function main() {
  const posts = buildPosts();
  const tags = collectTags(posts);
  const written = [];
  const cleaned = cleanStalePosts(posts);

  // 首页 / 归档 / 标签
  written.push(writeFile('index.html', homePage(posts, tags)));
  written.push(writeFile('archives.html', archivesPage(posts)));
  written.push(writeFile('tags.html', tagsPage(posts, tags)));
  written.push(writeFile('404.html', notFoundPage()));
  written.push(writeFile('reader.html', readerPage()));

  // 每篇文章：生成 posts/<slug>/index.html
  posts.forEach((post, i) => {
    const prev = posts[i + 1] || null; // 更早的文章
    const next = posts[i - 1] || null; // 更新的文章
    written.push(writeFile(path.posix.join('posts', post.slug, 'index.html'), postPage(post, prev, next)));
  });

  // 独立页面
  for (const file of readCollection(PAGES_DIR)) {
    const raw = fs.readFileSync(file.fullPath, 'utf8');
    const { meta, body } = parseFrontMatter(raw);
    const { html } = renderMarkdown(body);
    const slug = meta.slug || file.filename.replace(/\.md$/i, '');
    const page = {
      slug,
      title: meta.title || slug,
      meta,
      html,
      excerpt: toPlainText(body).slice(0, 140)
    };
    written.push(writeFile(`${slug}.html`, standalonePage(page)));
  }

  // 订阅源 / 图标
  written.push(writeFile('atom.xml', buildAtomFeed(posts)));
  written.push(writeFile('assets/favicon.svg', buildFavicon()));

  // 告诉 GitHub Pages 不要用 Jekyll 处理这个仓库（我们是自己构建好的静态站）
  written.push(writeFile('.nojekyll', ''));

  console.log(`✅ 构建完成：${posts.length} 篇文章，${tags.length} 个标签，共输出 ${written.length} 个文件`);
  if (cleaned) console.log(`   （顺带清理了 ${cleaned} 个已删除文章的旧页面）`);
  for (const line of posts.slice(0, 10)) console.log(`   · ${line.date.display}  ${line.title}  → ${line.url}`);
  if (posts.length > 10) console.log(`   · …还有 ${posts.length - 10} 篇`);
}

main();
