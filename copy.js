/* copy.js — adds a "Copy" button to every <pre> block on the page */
(function () {
  'use strict';

  var COPY_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  var CHECK_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';

  function btnStyle(extra) {
    return [
      'position:absolute', 'top:8px', 'right:8px',
      'display:inline-flex', 'align-items:center', 'gap:5px',
      'padding:4px 10px',
      'font-size:.72rem', 'font-weight:700', 'font-family:inherit',
      'line-height:1.5', 'cursor:pointer',
      'border-radius:6px',
      'border:1px solid rgba(255,255,255,.22)',
      'background:rgba(255,255,255,.1)',
      'color:#cbd5e1',
      'transition:background .15s, color .15s, border-color .15s',
      'z-index:10',
      extra || ''
    ].filter(Boolean).join(';');
  }

  function attachCopyBtn(pre) {
    /* Skip if already has a button */
    if (pre.querySelector('.copy-btn')) return;

    /* Make sure <pre> is position:relative so the button can sit inside it */
    var pos = window.getComputedStyle(pre).position;
    if (pos === 'static') pre.style.position = 'relative';

    var btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.setAttribute('aria-label', 'Copy code to clipboard');
    btn.setAttribute('type', 'button');
    btn.innerHTML = COPY_ICON + '<span>Copy</span>';
    btn.style.cssText = btnStyle();

    /* Hover */
    btn.addEventListener('mouseenter', function () {
      if (!btn.dataset.copied) {
        btn.style.background = 'rgba(255,255,255,.2)';
        btn.style.color = '#f1f5f9';
      }
    });
    btn.addEventListener('mouseleave', function () {
      if (!btn.dataset.copied) {
        btn.style.background = 'rgba(255,255,255,.1)';
        btn.style.color = '#cbd5e1';
      }
    });

    /* Click — copy text */
    btn.addEventListener('click', function () {
      var text = pre.innerText || pre.textContent || '';
      /* Strip trailing newlines from the button label itself */
      text = text.replace(/\s*Copy\s*$/, '').trimEnd();

      var doSuccess = function () {
        btn.dataset.copied = '1';
        btn.innerHTML = CHECK_ICON + '<span>Copied!</span>';
        btn.style.background = 'rgba(34,197,94,.2)';
        btn.style.color = '#86efac';
        btn.style.borderColor = 'rgba(34,197,94,.4)';
        setTimeout(function () {
          delete btn.dataset.copied;
          btn.innerHTML = COPY_ICON + '<span>Copy</span>';
          btn.style.background = 'rgba(255,255,255,.1)';
          btn.style.color = '#cbd5e1';
          btn.style.borderColor = 'rgba(255,255,255,.22)';
        }, 2000);
      };

      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(doSuccess).catch(fallback);
      } else {
        fallback();
      }

      function fallback() {
        try {
          var ta = document.createElement('textarea');
          ta.value = text;
          ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
          document.body.appendChild(ta);
          ta.focus(); ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          doSuccess();
        } catch (e) { /* silent fail */ }
      }
    });

    pre.appendChild(btn);
  }

  function init() {
    document.querySelectorAll('pre').forEach(attachCopyBtn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
