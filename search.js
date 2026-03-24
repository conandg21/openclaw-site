/* learnopenclaw.org — sitewide search
   Uses Lunr.js for full client-side search over search-index.json
   ----------------------------------------------------------------- */

(function () {
  'use strict';

  let lunrIndex = null;
  let docMap = {};
  let indexLoaded = false;
  let indexLoading = false;

  /* ── overlay markup ──────────────────────────────────────────── */
  function createOverlay() {
    if (document.getElementById('search-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'search-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Search learnopenclaw.org');
    overlay.innerHTML = `
      <div id="search-box">
        <div id="search-input-wrap">
          <span id="search-icon-inner" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </span>
          <input id="search-input" type="search" placeholder="Search guides, topics, commands…"
            autocomplete="off" autocorrect="off" spellcheck="false"
            aria-label="Search" aria-autocomplete="list" aria-controls="search-results"/>
          <button id="search-close" aria-label="Close search">✕</button>
        </div>
        <div id="search-results" role="listbox" aria-label="Search results"></div>
        <div id="search-footer">Powered by <a href="https://lunrjs.com" target="_blank" rel="noopener">Lunr.js</a></div>
      </div>
    `;
    document.body.appendChild(overlay);
    injectStyles();

    /* events */
    document.getElementById('search-close').addEventListener('click', closeOverlay);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeOverlay();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeOverlay();
    });

    const input = document.getElementById('search-input');
    input.addEventListener('input', debounce(handleSearch, 150));
    input.addEventListener('keydown', handleArrows);
  }

  /* ── open / close ────────────────────────────────────────────── */
  function openOverlay() {
    createOverlay();
    const overlay = document.getElementById('search-overlay');
    overlay.classList.add('open');
    document.body.classList.add('search-open');
    const input = document.getElementById('search-input');
    setTimeout(() => input.focus(), 50);
    loadIndex();
  }

  function closeOverlay() {
    const overlay = document.getElementById('search-overlay');
    if (overlay) {
      overlay.classList.remove('open');
      document.body.classList.remove('search-open');
    }
  }

  /* ── load lunr + index ───────────────────────────────────────── */
  function loadIndex() {
    if (indexLoaded || indexLoading) return;
    indexLoading = true;

    /* load lunr.js from CDN if not already present */
    const loadLunr = window.lunr
      ? Promise.resolve()
      : new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/lunr.js/2.3.9/lunr.min.js';
          s.onload = resolve;
          s.onerror = reject;
          document.head.appendChild(s);
        });

    loadLunr
      .then(() => fetch('/search-index.json'))
      .then(r => r.json())
      .then(docs => {
        docs.forEach(d => { docMap[d.id] = d; });

        lunrIndex = window.lunr(function () {
          this.ref('id');
          this.field('title',       { boost: 10 });
          this.field('headings',    { boost: 5  });
          this.field('description', { boost: 3  });
          this.field('body');
          this.pipeline.remove(window.lunr.stemmer);
          this.searchPipeline.remove(window.lunr.stemmer);
          docs.forEach(d => this.add(d));
        });

        indexLoaded = true;
        indexLoading = false;

        /* re-run search if user already typed something */
        const val = document.getElementById('search-input').value.trim();
        if (val) handleSearch();
      })
      .catch(err => {
        console.error('Search index load failed', err);
        indexLoading = false;
      });
  }

  /* ── search ──────────────────────────────────────────────────── */
  function handleSearch() {
    const input = document.getElementById('search-input');
    const results = document.getElementById('search-results');
    if (!input || !results) return;

    const raw = input.value.trim();
    if (!raw) { results.innerHTML = ''; return; }

    if (!indexLoaded) {
      results.innerHTML = '<div class="sr-loading">Loading search index…</div>';
      return;
    }

    let hits = [];
    try {
      /* try exact + wildcard */
      hits = lunrIndex.search(raw + '* ' + raw);
    } catch (e) {
      try { hits = lunrIndex.search(raw); } catch (_) {}
    }

    if (!hits.length) {
      results.innerHTML = '<div class="sr-empty">No results for <strong>' + escHtml(raw) + '</strong></div>';
      return;
    }

    const top = hits.slice(0, 8);
    results.innerHTML = top.map((h, i) => {
      const doc = docMap[h.ref];
      if (!doc) return '';
      const snippet = getSnippet(doc, raw);
      return `<a class="sr-item" href="${escHtml(doc.url)}" role="option"
          id="sr-item-${i}" aria-selected="false">
        <div class="sr-title">${highlight(escHtml(doc.title), raw)}</div>
        <div class="sr-snippet">${highlight(escHtml(snippet), raw)}</div>
        <div class="sr-url">${escHtml(doc.url.replace('https://learnopenclaw.org/', ''))}</div>
      </a>`;
    }).join('');
  }

  function getSnippet(doc, query) {
    const words = query.toLowerCase().split(/\s+/);
    const corpus = (doc.description + ' ' + doc.body).replace(/\s+/g, ' ');
    const lower = corpus.toLowerCase();
    let best = 0;
    for (const w of words) {
      const idx = lower.indexOf(w);
      if (idx > -1) { best = Math.max(0, idx - 60); break; }
    }
    return corpus.slice(best, best + 160).trim() + '…';
  }

  function highlight(text, query) {
    const words = query.trim().split(/\s+/).filter(Boolean);
    let out = text;
    words.forEach(w => {
      const re = new RegExp('(' + escRegex(w) + ')', 'gi');
      out = out.replace(re, '<mark>$1</mark>');
    });
    return out;
  }

  /* ── keyboard nav in results ─────────────────────────────────── */
  function handleArrows(e) {
    const results = document.getElementById('search-results');
    if (!results) return;
    const items = results.querySelectorAll('.sr-item');
    if (!items.length) return;

    const current = results.querySelector('.sr-item.focused');
    let idx = Array.from(items).indexOf(current);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      idx = Math.min(idx + 1, items.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      idx = Math.max(idx - 1, 0);
    } else if (e.key === 'Enter' && current) {
      window.location.href = current.href;
      return;
    } else {
      return;
    }

    items.forEach(el => el.classList.remove('focused'));
    items[idx].classList.add('focused');
    items[idx].focus();
  }

  /* ── styles ──────────────────────────────────────────────────── */
  function injectStyles() {
    if (document.getElementById('search-styles')) return;
    const s = document.createElement('style');
    s.id = 'search-styles';
    s.textContent = `
      #search-overlay {
        display: none;
        position: fixed; inset: 0; z-index: 9999;
        background: rgba(10,15,30,.7);
        backdrop-filter: blur(4px);
        align-items: flex-start; justify-content: center;
        padding-top: 80px;
      }
      #search-overlay.open { display: flex; }
      body.search-open { overflow: hidden; }

      #search-box {
        background: #fff;
        border-radius: 14px;
        width: min(660px, 94vw);
        box-shadow: 0 24px 60px rgba(0,0,0,.28);
        overflow: hidden;
      }

      #search-input-wrap {
        display: flex; align-items: center; gap: 10px;
        padding: 14px 18px; border-bottom: 1px solid #eee;
      }
      #search-icon-inner { color: #6b7280; flex-shrink: 0; }
      #search-input {
        flex: 1; border: none; outline: none;
        font-size: 1.05rem; color: #111; background: transparent;
      }
      #search-input::placeholder { color: #aaa; }
      #search-close {
        background: none; border: none; cursor: pointer;
        color: #999; font-size: 1.1rem; padding: 4px 6px; border-radius: 6px;
        line-height: 1;
      }
      #search-close:hover { background: #f3f4f6; color: #333; }

      #search-results { max-height: 440px; overflow-y: auto; }
      .sr-item {
        display: block; padding: 14px 20px;
        text-decoration: none; color: inherit;
        border-bottom: 1px solid #f0f0f0;
        transition: background .12s;
      }
      .sr-item:last-child { border-bottom: none; }
      .sr-item:hover, .sr-item.focused { background: #f5f7ff; }
      .sr-title { font-weight: 600; color: #111; font-size: .95rem; margin-bottom: 3px; }
      .sr-snippet { font-size: .83rem; color: #555; line-height: 1.45; margin-bottom: 4px; }
      .sr-url { font-size: .75rem; color: #6366f1; }
      .sr-item mark { background: #fef08a; color: inherit; border-radius: 2px; padding: 0 1px; }

      .sr-empty, .sr-loading {
        padding: 24px 20px; color: #888; font-size: .9rem; text-align: center;
      }

      #search-footer {
        padding: 8px 20px; font-size: .72rem; color: #bbb;
        border-top: 1px solid #f0f0f0; text-align: right;
      }
      #search-footer a { color: #bbb; text-decoration: none; }
      #search-footer a:hover { text-decoration: underline; }

      /* search trigger button (injected into nav) */
      .search-trigger {
        background: none; border: none; cursor: pointer;
        color: #374151; padding: 6px 8px; border-radius: 8px;
        display: flex; align-items: center;
        transition: background .15s, color .15s;
        margin-left: auto;
      }
      .search-trigger:hover { background: #f3f4f6; color: #6366f1; }
      .search-trigger svg { display: block; }
      /* on desktop where nav-links are visible, give search a small gap */
      @media (min-width: 781px) {
        .search-trigger { margin-left: auto; margin-right: 8px; }
      }
    `;
    document.head.appendChild(s);
  }

  /* ── wire up trigger buttons ─────────────────────────────────── */
  function initTriggers() {
    document.querySelectorAll('.search-trigger').forEach(btn => {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        openOverlay();
      });
    });

    /* keyboard shortcut: / or Cmd+K */
    document.addEventListener('keydown', function (e) {
      const tag = document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key === 'k')) {
        e.preventDefault();
        openOverlay();
      }
    });
  }

  /* ── utils ───────────────────────────────────────────────────── */
  function debounce(fn, ms) {
    let t;
    return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
  }
  function escHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  function escRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /* ── init ────────────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTriggers);
  } else {
    initTriggers();
  }

})();
