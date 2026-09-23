/* ==================================================================
   博客前端脚本
   - 深浅色切换（记忆选择）
   - 首页：标签筛选 + 站内搜索
   - 文章页：阅读进度、目录高亮、复制代码
   - 兜底：新上传的 Markdown 即使还没构建，也能在首页看到并阅读
   ================================================================== */
'use strict';

(function () {
  const html = document.documentElement;
  const BLOG = window.BLOG || {};

  /* ---------------- 深浅色 ---------------- */
  function initTheme() {
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      html.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
    });
  }

  /* ---------------- 入场动画 ---------------- */
  function initReveal() {
    const items = document.querySelectorAll('.card, .timeline-year, .tag-section, .hero-inner');
    if (!('IntersectionObserver' in window)) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -40px 0px', threshold: 0.05 }
    );

    items.forEach((el, i) => {
      el.classList.add('reveal');
      el.style.transitionDelay = `${Math.min(i, 6) * 45}ms`;
      io.observe(el);
    });
  }

  /* ---------------- 回到顶部 ---------------- */
  function initToTop() {
    const btn = document.getElementById('toTop');
    if (!btn) return;
    const onScroll = () => btn.classList.toggle('is-visible', window.scrollY > 420);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  /* ---------------- 复制代码 ---------------- */
  function initCopy() {
    document.addEventListener('click', (event) => {
      const btn = event.target.closest('.code-copy');
      if (!btn) return;
      const block = btn.closest('.code-block');
      const code = block && block.querySelector('code');
      if (!code) return;

      const text = code.innerText;
      const done = () => {
        btn.textContent = '已复制 ✓';
        btn.classList.add('is-done');
        setTimeout(() => {
          btn.textContent = '复制';
          btn.classList.remove('is-done');
        }, 1600);
      };

      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done).catch(fallback);
      } else {
        fallback();
      }

      function fallback() {
        const area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        try { document.execCommand('copy'); done(); } catch (e) { btn.textContent = '复制失败'; }
        document.body.removeChild(area);
      }
    });
  }

  /* ---------------- 阅读进度 ---------------- */
  function initProgress() {
    const bar = document.getElementById('readingBar');
    if (!bar) return;
    const onScroll = () => {
      const height = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = height > 0 ? Math.min(1, Math.max(0, window.scrollY / height)) : 0;
      bar.style.width = `${(ratio * 100).toFixed(2)}%`;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
  }

  /* ---------------- 目录高亮 ---------------- */
  function initTocHighlight() {
    const toc = document.querySelector('.toc');
    if (!toc) return;
    const links = [...toc.querySelectorAll('a[href^="#"]')];
    const map = new Map();
    links.forEach((link) => {
      const id = decodeURIComponent(link.getAttribute('href').slice(1));
      const target = document.getElementById(id);
      if (target) map.set(target, link);
    });
    if (!map.size || !('IntersectionObserver' in window)) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const link = map.get(entry.target);
          if (!link) return;
          if (entry.isIntersecting) {
            links.forEach((l) => l.classList.remove('is-current'));
            link.classList.add('is-current');
          }
        });
      },
      { rootMargin: '-84px 0px -70% 0px' }
    );
    map.forEach((_, target) => io.observe(target));
  }

  /* ---------------- 首页：筛选 + 搜索 ---------------- */
  function initHome() {
    const grid = document.getElementById('postGrid');
    if (!grid) return;

    const cards = [...grid.querySelectorAll('.card')];
    const empty = document.getElementById('emptyState');
    const searchInput = document.getElementById('searchInput');
    const chips = [...document.querySelectorAll('#tagFilters .chip')];
    let activeTag = '*';

    function apply() {
      const query = (searchInput ? searchInput.value : '').trim().toLowerCase();
      let visible = 0;

      cards.forEach((card) => {
        const tags = (card.dataset.tags || '').split(',').map((t) => t.trim());
        const haystack = (card.dataset.search || '').toLowerCase();
        const tagOk = activeTag === '*' || tags.includes(activeTag);
        const textOk = !query || haystack.includes(query);
        const show = tagOk && textOk;
        card.style.display = show ? '' : 'none';
        if (show) visible += 1;
      });

      if (empty) empty.hidden = visible > 0;
    }

    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        chips.forEach((c) => c.classList.remove('is-active'));
        chip.classList.add('is-active');
        activeTag = chip.dataset.tag || '*';
        apply();
      });
    });

    if (searchInput) {
      let timer = null;
      searchInput.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(apply, 120);
      });
      searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          searchInput.value = '';
          apply();
        }
      });
    }
  }

  /* ---------------- 兜底：直接读取仓库里最新的 Markdown ----------------
     如果新文章上传后 GitHub Actions 还没跑完（或者没跑），
     这里会把它补进首页列表，点进去用 reader.html 现场渲染。
  ------------------------------------------------------------------- */
  function initFreshPosts() {
    const grid = document.getElementById('postGrid');
    if (!grid || !BLOG.repo) return;

    fetch(`https://api.github.com/repos/${BLOG.repo}/contents/posts?ref=${BLOG.branch || 'main'}`, {
      headers: { Accept: 'application/vnd.github+json' }
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((items) => {
        if (!Array.isArray(items)) return;

        const known = new Set(
          [...grid.querySelectorAll('.card-link')].map((a) =>
            decodeURIComponent(a.getAttribute('href').replace(/^\/posts\//, '').replace(/\/$/, ''))
          )
        );

        const fresh = items.filter(
          (item) =>
            item.type === 'file' &&
            /\.md$/i.test(item.name) &&
            !item.name.startsWith('_') &&
            !known.has(item.name.replace(/\.md$/i, ''))
        );
        if (!fresh.length) return;

        fresh.forEach((item, index) => {
          const slug = item.name.replace(/\.md$/i, '');
          const guess = /^(\d{4})-(\d{2})-(\d{2})[-_ ]+(.*)$/.exec(slug);
          const dateText = guess ? `${guess[1]}-${guess[2]}-${guess[3]}` : '';
          const titleText = guess ? guess[4].replace(/[-_]+/g, ' ') : slug;

          const card = document.createElement('article');
          card.className = 'card is-in';
          card.dataset.tags = '';
          card.dataset.search = titleText.toLowerCase();
          card.innerHTML = `
        <a class="card-link" href="/reader.html?p=${encodeURIComponent(slug)}">
          <div class="card-glow" aria-hidden="true"></div>
          <div class="card-meta">${dateText ? `<time>${dateText}</time><span class="meta-dot"></span>` : ''}<span>刚上传</span></div>
          <h2 class="card-title">${escapeText(titleText)}</h2>
          <p class="card-excerpt">这篇文章刚刚上传，正在等待自动构建。点击即可阅读。</p>
          <div class="card-foot"><span class="tag">未构建</span><span class="card-more">阅读 →</span></div>
        </a>`;
          grid.appendChild(card);
        });
      })
      .catch(() => {});
  }

  function escapeText(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  /* ---------------- reader.html：现场渲染 Markdown ---------------- */
  function initReader() {
    if (!document.body.classList.contains('is-reader')) return;
    const holder = document.getElementById('readerBody');
    if (!holder) return;

    const params = new URLSearchParams(location.search);
    const name = params.get('p');
    if (!name) return fail('没有指定文章');

    fetch(`/posts/${encodeURIComponent(name)}.md`)
      .then((res) => {
        if (!res.ok) throw new Error(res.status);
        return res.text();
      })
      .then((raw) => {
        const { meta, body } = splitFrontMatter(raw);
        const guess = /^(\d{4})-(\d{2})-(\d{2})[-_ ]+(.*)$/.exec(name);
        const title = meta.title || (guess ? guess[4].replace(/[-_]+/g, ' ') : name);
        const date = meta.date || (guess ? `${guess[1]}-${guess[2]}-${guess[3]}` : '');
        const tags = meta.tags || [];

        document.title = `${title} · ${BLOG.siteTitle || '我的博客'}`;
        const titleEl = document.getElementById('readerTitle');
        const metaEl = document.getElementById('readerMeta');
        if (titleEl) titleEl.textContent = title;
        if (metaEl) {
          const plain = body.replace(/[#>*`_~\-\[\]()!]/g, ' ');
          const cjk = (plain.match(/[\u4e00-\u9fff]/g) || []).length;
          const mins = Math.max(1, Math.round(cjk / 350 + (plain.match(/[A-Za-z0-9]+/g) || []).length / 200));
          metaEl.innerHTML = `${date ? `<time>${escapeText(date)}</time><span class="meta-dot"></span>` : ''}<span>${mins} 分钟阅读</span>${
            tags.length ? `<span class="meta-dot"></span><span class="post-tags">${tags.map((t) => `<span class="tag">${escapeText(t)}</span>`).join('')}</span>` : ''
          }`;
        }

        holder.innerHTML = window.marked ? window.marked.parse(body, { gfm: true }) : `<pre>${escapeText(body)}</pre>`;
        initProgress();
        initToTop();
      })
      .catch(() => fail('找不到这篇文章'));

    function fail(message) {
      holder.innerHTML = `<p class="empty">${escapeText(message)}。可能文件名不对，或者文章还没上传成功。</p>`;
    }
  }

  /** 简易 front matter 解析（和 build.js 行为保持一致） */
  function splitFrontMatter(raw) {
    const text = raw.replace(/^\uFEFF/, '');
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
    const meta = {};
    let body = text;
    if (match) {
      body = text.slice(match[0].length);
      match[1].split(/\r?\n/).forEach((line) => {
        const idx = line.indexOf(':');
        if (idx === -1) return;
        const key = line.slice(0, idx).trim().toLowerCase();
        let value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        if (key === 'tags' || key === 'category' || key === 'categories') {
          meta.tags = value.replace(/^\[|\]$/g, '').split(/[,，、]/).map((t) => t.trim()).filter(Boolean);
        } else {
          meta[key] = value;
        }
      });
    }
    return { meta, body: body.trim() };
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    initTheme();
    initToTop();
    initCopy();
    initProgress();
    initTocHighlight();
    initHome();
    initFreshPosts();
    initReader();
    initReveal();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
