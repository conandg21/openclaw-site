/* learnopenclaw.org — sitewide search
   Inline nav search bar + dropdown results
   Powered by Lunr.js (loaded on first keystroke)
   ----------------------------------------------------------------- */

(function () {
  'use strict';

  let lunrIndex = null;
  let docMap    = {};
  let indexLoaded  = false;
  let indexLoading = false;
  let activeIdx    = -1;

  /* ── inject nav + dropdown CSS ─────────────────────────────── */
  function injectStyles() {
    if (document.getElementById('search-styles')) return;
    const s = document.createElement('style');
    s.id = 'search-styles';
    s.textContent = `
      /* ── Nav layout override: logo | links | search+hamburger ── */
      nav .nav-inner {
        display: flex !important;
        align-items: center !important;
        justify-content: flex-start !important;
        gap: 0 !important;
      }
      nav .nav-logo, nav .nav-brand { flex-shrink: 0; }

      /* nav-links stay their normal desktop style, push right via nav-right auto margin */
      nav .nav-right {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-left: auto;
        flex-shrink: 0;
        position: relative; /* anchor for dropdown */
      }

      /* ── Search bar ──────────────────────────────────────────── */
      .nav-search-form {
        display: flex;
        align-items: center;
        gap: 7px;
        background: #f3f4f6;
        border: 1.5px solid transparent;
        border-radius: 22px;
        padding: 6px 14px 6px 10px;
        width: 210px;
        transition: background .18s, border-color .18s, box-shadow .18s;
        cursor: text;
      }
      .nav-search-form:focus-within {
        background: #fff;
        border-color: #6366f1;
        box-shadow: 0 0 0 3px rgba(99,102,241,.15);
      }
      .nav-search-icon { color: #9ca3af; flex-shrink: 0; transition: color .18s; }
      .nav-search-form:focus-within .nav-search-icon { color: #6366f1; }

      .nav-search-input {
        border: none;
        background: transparent;
        outline: none;
        font-size: .875rem;
        color: #111;
        width: 100%;
        min-width: 0;
      }
      .nav-search-input::placeholder { color: #9ca3af; }

      /* Mobile: narrower bar, hamburger stays visible */
      @media (max-width: 780px) {
        .nav-search-form { width: 130px; padding: 5px 10px 5px 8px; }
      }
      @media (max-width: 420px) {
        .nav-search-form { width: 100px; }
      }

      /* ── Dropdown results ────────────────────────────────────── */
      .nav-search-dropdown {
        display: none;
        position: absolute;
        top: calc(100% + 10px);
        right: 0;
        width: min(480px, 92vw);
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 12px 40px rgba(0,0,0,.18);
        border: 1px solid #e5e7eb;
        z-index: 9999;
        overflow: hidden;
      }
      .nav-search-dropdown.open { display: block; }

      .nsd-item {
        display: block;
        padding: 12px 16px;
        text-decoration: none;
        color: inherit;
        border-bottom: 1px solid #f3f4f6;
        transition: background .1s;
        outline: none;
      }
      .nsd-item:last-child { border-bottom: none; }
      .nsd-item:hover, .nsd-item.active { background: #f5f7ff; }

      .nsd-title {
        font-weight: 600;
        font-size: .9rem;
        color: #111;
        margin-bottom: 2px;
      }
      .nsd-snippet {
        font-size: .79rem;
        color: #6b7280;
        line-height: 1.4;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .nsd-url { font-size: .72rem; color: #6366f1; margin-top: 2px; }

      .nsd-item mark {
        background: #fef08a;
        color: inherit;
        border-radius: 2px;
        padding: 0 1px;
      }

      .nsd-empty, .nsd-loading {
        padding: 18px 16px;
        font-size: .85rem;
        color: #9ca3af;
        text-align: center;
      }

      .nsd-footer {
        padding: 6px 16px;
        font-size: .7rem;
        color: #d1d5db;
        border-top: 1px solid #f3f4f6;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .nsd-footer kbd {
        font-family: inherit;
        font-size: .68rem;
        background: #f3f4f6;
        border: 1px solid #e5e7eb;
        border-radius: 4px;
        padding: 1px 5px;
        color: #9ca3af;
      }
    `;
    document.head.appendChild(s);
  }

  /* ── create dropdown el ─────────────────────────────────────── */
  function getOrCreateDropdown() {
    let dd = document.getElementById('nav-search-dropdown');
    if (dd) return dd;
    dd = document.createElement('div');
    dd.id = 'nav-search-dropdown';
    dd.className = 'nav-search-dropdown';
    dd.setAttribute('role', 'listbox');
    dd.setAttribute('aria-label', 'Search results');
    const navRight = document.querySelector('.nav-right');
    if (navRight) navRight.appendChild(dd);
    else document.body.appendChild(dd);
    return dd;
  }

  /* ── open / close dropdown ──────────────────────────────────── */
  function openDropdown() {
    getOrCreateDropdown().classList.add('open');
  }
  function closeDropdown() {
    const dd = document.getElementById('nav-search-dropdown');
    if (dd) dd.classList.remove('open');
    activeIdx = -1;
  }

  /* ── load Lunr + index ──────────────────────────────────────── */
  function loadIndex() {
    if (indexLoaded || indexLoading) return Promise.resolve();
    indexLoading = true;

    const loadLunr = window.lunr
      ? Promise.resolve()
      : new Promise((resolve, reject) => {
          const sc = document.createElement('script');
          sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/lunr.js/2.3.9/lunr.min.js';
          sc.onload = resolve;
          sc.onerror = reject;
          document.head.appendChild(sc);
        });

    return loadLunr
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
        indexLoaded  = true;
        indexLoading = false;
      })
      .catch(err => {
        console.error('Search index failed', err);
        indexLoading = false;
      });
  }

  /* ── run search & render ────────────────────────────────────── */
  function runSearch(query) {
    const dd = getOrCreateDropdown();
    if (!query) { closeDropdown(); return; }

    openDropdown();

    if (!indexLoaded) {
      dd.innerHTML = '<div class="nsd-loading">Loading…</div>';
      loadIndex().then(() => runSearch(query));
      return;
    }

    let hits = [];
    try { hits = lunrIndex.search(query + '* ' + query); }
    catch (_) { try { hits = lunrIndex.search(query); } catch (__) {} }

    if (!hits.length) {
      dd.innerHTML = `<div class="nsd-empty">No results for "<strong>${escHtml(query)}</strong>"</div>`;
      return;
    }

    const top = hits.slice(0, 6);
    const items = top.map((h, i) => {
      const doc = docMap[h.ref];
      if (!doc) return '';
      const snippet = getSnippet(doc, query);
      return `<a class="nsd-item" href="${escHtml(doc.url)}" role="option" data-idx="${i}">
        <div class="nsd-title">${hl(escHtml(doc.title), query)}</div>
        <div class="nsd-snippet">${hl(escHtml(snippet), query)}</div>
      </a>`;
    }).join('');

    dd.innerHTML = items +
      `<div class="nsd-footer">
        <span>${hits.length} result${hits.length !== 1 ? 's' : ''}</span>
        <span><kbd>↑↓</kbd> navigate &nbsp; <kbd>↵</kbd> open &nbsp; <kbd>Esc</kbd> close</span>
      </div>`;

    activeIdx = -1;
  }

  /* ── keyboard nav ───────────────────────────────────────────── */
  function handleKeydown(e) {
    const dd = document.getElementById('nav-search-dropdown');
    if (!dd || !dd.classList.contains('open')) return;
    const items = dd.querySelectorAll('.nsd-item');
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, items.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, 0);
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      window.location.href = items[activeIdx].href;
      return;
    } else if (e.key === 'Escape') {
      closeDropdown();
      document.querySelector('.nav-search-input').blur();
      return;
    } else {
      return;
    }

    items.forEach((el, i) => el.classList.toggle('active', i === activeIdx));
  }

  /* ── helpers ────────────────────────────────────────────────── */
  function getSnippet(doc, query) {
    const words = query.toLowerCase().split(/\s+/);
    const corpus = (doc.description + ' ' + doc.body).replace(/\s+/g, ' ');
    const lower  = corpus.toLowerCase();
    let start = 0;
    for (const w of words) {
      const i = lower.indexOf(w);
      if (i > -1) { start = Math.max(0, i - 40); break; }
    }
    return corpus.slice(start, start + 120).trim() + '…';
  }

  function hl(text, query) {
    const words = query.trim().split(/\s+/).filter(Boolean);
    let out = text;
    words.forEach(w => {
      const re = new RegExp('(' + escRegex(w) + ')', 'gi');
      out = out.replace(re, '<mark>$1</mark>');
    });
    return out;
  }

  function escHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function escRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function debounce(fn, ms) {
    let t;
    return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); };
  }

  /* ── init ───────────────────────────────────────────────────── */
  function init() {
    injectStyles();

    const input = document.querySelector('.nav-search-input');
    if (!input) return;

    /* load index eagerly on first focus */
    input.addEventListener('focus', function () {
      loadIndex();
    }, { once: true });

    /* search as you type */
    input.addEventListener('input', debounce(function () {
      runSearch(this.value.trim());
    }, 140));

    /* keyboard navigation */
    input.addEventListener('keydown', handleKeydown);

    /* close when clicking outside */
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.nav-right')) closeDropdown();
    });

    /* global shortcut: / or Cmd+K */
    document.addEventListener('keydown', function (e) {
      const tag = document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key === 'k')) {
        e.preventDefault();
        input.focus();
        input.select();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
