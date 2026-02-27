/**
 * UX Comment Widget v2.0.0 (Mobile Quick-Capture + Desktop)
 * Injects a floating comment tool into any page for manual UX testing.
 *
 * Features:
 *   - Element Select: inspect-like hover highlighting, captures element reference
 *   - Area Select: click-drag rectangle, captures element metadata in region
 *   - Point Select: single-click pixel coordinate capture
 *   - Text Select: highlight any text passage to capture
 *   - All positions captured as ABSOLUTE page coordinates (scroll-aware)
 *   - Comments stored in localStorage as JSON (persists across page navigations)
 *   - Page URL captured per comment
 *   - Inline editing and deletion of past comments
 *   - Download all comments + captures as a single JSON file
 *   - "Send to Admin" posts comments to /api/ux-comments
 *   - Collapsible to a small icon (bottom-right corner)
 *   - Phosphor icons throughout
 *
 * Mobile (<=480px) v2.0 additions:
 *   - Quick Capture: pen icon cycles through capture modes with floating pill
 *   - Mini input bar for fast comment entry after capture
 *   - Full History: list icon opens slide-up sheet (60vh)
 *   - Desktop behavior unchanged
 *
 * Usage: <script src="ux-comment-widget.js"></script>
 *   or: inject via bookmarklet / dev server middleware
 */
(function () {
  'use strict';

  // ── Prevent double-init ──────────────────────────────────────────────
  if (window.__uxCommentWidget) return;
  window.__uxCommentWidget = true;

  const STORAGE_KEY = 'ux-test-comments';
  const STATE_KEY = 'ux-test-widget-state';
  const DRAFT_CAPTURES_KEY = 'ux-test-draft-captures';
  const VERSION = '2.0.0';
  const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

  /** Check if we're on a mobile-width screen */
  function isMobileWidth() {
    return window.innerWidth <= 480;
  }

  // ── State ────────────────────────────────────────────────────────────
  let expanded = false;
  let activeMode = null; // 'element' | 'area' | 'point' | 'text' | null
  let currentCaptures = []; // captures for the comment being drafted
  let areaStart = null; // {x, y} viewport coords for area drag
  let editingId = null; // id of comment being edited inline
  let lastTouch = null; // tracks last touch position for touchend (which has no coordinates)
  let mobileQuickMode = null; // for mobile quick-capture cycling: 'element' | 'point' | 'area' | null
  let miniBarVisible = false; // whether the mobile mini input bar is showing

  // ── Helpers ──────────────────────────────────────────────────────────
  function getComments() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch { return []; }
  }
  function saveComments(arr) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  }

  /** Get draft captures (persists across page navigations) */
  function getDraftCaptures() {
    try {
      return JSON.parse(localStorage.getItem(DRAFT_CAPTURES_KEY) || '[]');
    } catch { return []; }
  }
  function saveDraftCaptures(arr) {
    localStorage.setItem(DRAFT_CAPTURES_KEY, JSON.stringify(arr));
  }

  /** Convert viewport coords to absolute page coords */
  function toPageCoords(clientX, clientY) {
    return {
      x: Math.round(clientX + window.scrollX),
      y: Math.round(clientY + window.scrollY),
    };
  }

  /** Convert a viewport DOMRect to absolute page rect */
  function toPageRect(r) {
    return {
      x: Math.round(r.x + window.scrollX),
      y: Math.round(r.y + window.scrollY),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  }

  function describeElement(el) {
    if (!el || el === document.body || el === document.documentElement) return null;
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const cls = el.className && typeof el.className === 'string'
      ? '.' + el.className.trim().split(/\s+/).join('.')
      : '';
    const text = (el.textContent || '').trim().slice(0, 80);
    const rect = el.getBoundingClientRect();
    return {
      selector: `${tag}${id}${cls}`,
      text: text || null,
      rect: toPageRect(rect),
      xpath: getXPath(el),
    };
  }

  function getXPath(el) {
    if (!el) return '';
    if (el.id) return `//*[@id="${el.id}"]`;
    if (el === document.body) return '/html/body';
    let ix = 0;
    const siblings = el.parentNode ? el.parentNode.childNodes : [];
    for (let i = 0; i < siblings.length; i++) {
      const s = siblings[i];
      if (s === el) return getXPath(el.parentNode) + '/' + el.tagName.toLowerCase() + '[' + (ix + 1) + ']';
      if (s.nodeType === 1 && s.tagName === el.tagName) ix++;
    }
    return '';
  }

  function elementsInRect(viewportRect) {
    // viewportRect is in viewport coords; we compare against viewport positions
    const hits = [];
    const all = document.querySelectorAll('body *');
    for (const el of all) {
      if (el.closest('#ux-widget-root')) continue;
      const r = el.getBoundingClientRect();
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      if (cx >= viewportRect.x && cx <= viewportRect.x + viewportRect.w &&
          cy >= viewportRect.y && cy <= viewportRect.y + viewportRect.h) {
        if (el.children.length === 0 || r.width * r.height < 40000) {
          hits.push(describeElement(el));
        }
      }
    }
    return hits.filter(Boolean).slice(0, 30);
  }

  /** Walk up the DOM from an element to find the nearest semantic landmark.
   *  Returns a descriptor or null. */
  const LANDMARK_TAGS = new Set(['section','nav','main','header','footer','aside','article','form','dialog','details']);
  function findLandmark(el) {
    if (!el) return null;
    let cur = el;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      const tag = cur.tagName.toLowerCase();
      const hasId = !!cur.id;
      const hasRole = cur.hasAttribute('role');
      const hasAriaLabel = cur.hasAttribute('aria-label') || cur.hasAttribute('aria-labelledby');
      const isSemantic = LANDMARK_TAGS.has(tag);
      const hasHeading = !isSemantic && !hasId && !hasRole && cur.querySelector && cur.querySelector('h1,h2,h3,h4,h5,h6');

      if (hasId || hasRole || hasAriaLabel || isSemantic || hasHeading) {
        const id = cur.id ? `#${cur.id}` : '';
        const cls = cur.className && typeof cur.className === 'string'
          ? '.' + cur.className.trim().split(/\s+/).slice(0, 3).join('.')
          : '';
        const role = cur.getAttribute('role') || '';
        const ariaLabel = cur.getAttribute('aria-label') || '';
        const heading = cur.querySelector ? cur.querySelector('h1,h2,h3,h4,h5,h6') : null;
        const headingText = heading ? (heading.textContent || '').trim().slice(0, 60) : '';
        const rect = cur.getBoundingClientRect();
        return {
          selector: `${tag}${id}${cls}`,
          role: role || null,
          ariaLabel: ariaLabel || null,
          headingText: headingText || null,
          text: (cur.textContent || '').trim().slice(0, 120) || null,
          rect: toPageRect(rect),
          xpath: getXPath(cur),
        };
      }
      cur = cur.parentElement;
    }
    return null;
  }

  /** Find the landmark for a viewport coordinate */
  function landmarkAtPoint(clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el || el.closest('#ux-widget-root')) return null;
    return findLandmark(el);
  }

  /** Find the best landmark for an area (uses centre point) */
  function landmarkForArea(viewportRect) {
    const cx = viewportRect.x + viewportRect.w / 2;
    const cy = viewportRect.y + viewportRect.h / 2;
    return landmarkAtPoint(cx, cy);
  }

  // ── Text Selection Helpers ──────────────────────────────────────────
  /** Find the nearest heading (h1-h6) above a node */
  function findNearestHeading(node) {
    if (!node) return null;
    let current = node;
    while (current) {
      // Check previous siblings
      let sibling = current.previousElementSibling;
      while (sibling) {
        if (/^H[1-6]$/.test(sibling.tagName)) {
          return sibling.textContent.trim();
        }
        const heading = sibling.querySelector && sibling.querySelector('h1, h2, h3, h4, h5, h6');
        if (heading) {
          return heading.textContent.trim();
        }
        sibling = sibling.previousElementSibling;
      }
      current = current.parentElement;
      if (current && /^H[1-6]$/.test(current.tagName)) {
        return current.textContent.trim();
      }
    }
    return null;
  }

  /** Get surrounding paragraph/block context for selected text */
  function getTextContext(node, selectedText) {
    if (!node) return '';
    let block = node;
    while (block && !['P', 'LI', 'TD', 'DIV', 'SECTION', 'ARTICLE', 'SPAN'].includes(block.tagName)) {
      block = block.parentElement;
    }
    if (!block) return selectedText;
    const fullText = block.textContent.trim();
    if (fullText.length > 300) {
      const index = fullText.indexOf(selectedText);
      if (index === -1) return selectedText;
      const start = Math.max(0, index - 50);
      const end = Math.min(fullText.length, index + selectedText.length + 50);
      let context = fullText.substring(start, end);
      if (start > 0) context = '...' + context;
      if (end < fullText.length) context = context + '...';
      return context;
    }
    return fullText;
  }

  // ── Send to API helper ───────────────────────────────────────────────
  async function sendCommentsToAPI(comments) {
    const pages = [...new Set(comments.map(c => c.url))];
    const payload = {
      version: VERSION,
      exportedAt: new Date().toISOString(),
      project: document.title || window.location.hostname,
      originUrl: window.location.origin,
      pagesCommented: pages,
      totalComments: comments.length,
      comments,
    };
    const res = await fetch('/api/ux-comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to send: ' + res.status);
    return res.json();
  }

  // ── Load Phosphor Icons ──────────────────────────────────────────────
  if (!document.querySelector('link[href*="phosphor"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/@phosphor-icons/web@2.0.3/src/regular/style.css';
    document.head.appendChild(link);
  }

  // ── Inject CSS ───────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    /* === UX Comment Widget Styles === */
    #ux-widget-root, #ux-widget-root * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    #ux-widget-root { position: fixed; bottom: 76px; right: 20px; z-index: 2147483647; }

    /* Collapsed icon */
    #ux-widget-toggle {
      width: 44px; height: 44px; border-radius: 50%; border: none;
      background: linear-gradient(135deg, #5a9a91, #4a8a81); color: #fff;
      font-size: 22px; cursor: pointer; display: flex; align-items: center; justify-content: center;
      box-shadow: 0 3px 12px rgba(0,0,0,0.25); transition: transform 0.15s, box-shadow 0.15s;
      position: relative;
    }
    #ux-widget-toggle:hover { transform: scale(1.08); box-shadow: 0 4px 16px rgba(0,0,0,0.3); }
    #ux-widget-toggle .badge {
      position: absolute; top: -4px; right: -4px; min-width: 18px; height: 18px;
      background: #e53e3e; color: #fff; border-radius: 9px; font-size: 11px;
      display: flex; align-items: center; justify-content: center; padding: 0 4px;
      font-weight: 700;
    }

    /* List button (mobile only, hidden on desktop) */
    #ux-widget-list-btn {
      display: none;
    }

    /* Mobile quick-capture mode pill */
    #ux-mobile-mode-pill {
      display: none; position: absolute; bottom: 54px; right: 0;
      padding: 5px 12px; border-radius: 16px; font-size: 12px; font-weight: 600;
      color: #fff; white-space: nowrap; box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      pointer-events: none; z-index: 2147483647;
    }
    #ux-mobile-mode-pill.element { background: #5a9a91; display: block; }
    #ux-mobile-mode-pill.point { background: #d69e2e; display: block; }
    #ux-mobile-mode-pill.area { background: #e53e3e; display: block; }

    /* Mobile mini input bar */
    #ux-mini-bar {
      display: none; position: fixed; bottom: 76px; left: 8px; right: 8px;
      z-index: 2147483647; height: 48px; border-radius: 24px;
      background: rgba(255,255,255,0.96); border: 1px solid #e2e8f0;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15); padding: 4px 4px 4px 14px;
      flex-direction: row; align-items: center; gap: 6px;
      backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
    }
    #ux-mini-bar.visible { display: flex; }
    #ux-mini-bar input {
      flex: 1; border: none; outline: none; font-size: 14px; background: transparent;
      color: #2d3748; font-family: inherit; min-width: 0;
    }
    #ux-mini-bar input::placeholder { color: #a0aec0; }
    #ux-mini-bar .ux-mini-send {
      width: 36px; height: 36px; border-radius: 50%; border: none;
      background: #5a9a91; color: #fff; font-size: 18px;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; flex-shrink: 0;
    }
    #ux-mini-bar .ux-mini-send:active { background: #4a8a81; }
    #ux-mini-bar .ux-mini-close {
      width: 28px; height: 28px; border-radius: 50%; border: none;
      background: #edf2f7; color: #718096; font-size: 14px;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; flex-shrink: 0;
    }

    /* Panel */
    #ux-widget-panel {
      display: none; width: 380px; max-height: 560px; background: #fff;
      border-radius: 14px; box-shadow: 0 8px 32px rgba(0,0,0,0.18);
      flex-direction: column; overflow: hidden; border: 1px solid #e2e8f0;
      position: absolute; bottom: 52px; right: 0;
    }
    #ux-widget-panel.open { display: flex; }

    /* Panel header */
    .ux-panel-header {
      padding: 12px 14px; background: linear-gradient(135deg, #5a9a91, #4a8a81);
      color: #fff; display: flex; align-items: center; justify-content: space-between;
      font-weight: 600; font-size: 14px; flex-shrink: 0; cursor: pointer;
    }
    .ux-panel-header .ux-header-left { display: flex; align-items: center; gap: 8px; }
    .ux-panel-header .ux-header-left i { font-size: 18px; }
    .ux-panel-header .ux-header-actions { display: flex; align-items: center; gap: 2px; }
    .ux-panel-header button {
      background: none; border: none; color: rgba(255,255,255,0.85); cursor: pointer;
      font-size: 18px; padding: 2px 4px; display: flex; align-items: center;
    }
    .ux-panel-header button:hover { color: #fff; }

    /* Mobile drag handle for slide-up sheet */
    .ux-drag-handle {
      display: none; width: 100%; padding: 8px 0 4px; justify-content: center; flex-shrink: 0;
      cursor: grab; background: #fff; border-radius: 14px 14px 0 0;
    }
    .ux-drag-handle .handle-bar {
      width: 40px; height: 4px; border-radius: 2px; background: #cbd5e0;
    }

    /* Toolbar */
    .ux-toolbar {
      display: flex; gap: 3px; padding: 8px 8px; border-bottom: 1px solid #e2e8f0; background: #f7fafc;
      flex-shrink: 0;
    }
    .ux-toolbar button {
      flex: 1; padding: 5px 2px; border: 1px solid #cbd5e0; border-radius: 6px;
      background: #fff; cursor: pointer; font-size: 10px; color: #4a5568;
      display: flex; flex-direction: column; align-items: center; gap: 2px; transition: all 0.12s;
      min-width: 0;
    }
    .ux-toolbar button:hover { background: #edf2f7; }
    .ux-toolbar button.active { background: #5a9a91; color: #fff; border-color: #4a8a81; }
    .ux-toolbar button i { font-size: 16px; }

    /* Captures list */
    .ux-captures {
      max-height: 80px; overflow-y: auto; padding: 4px 10px; border-bottom: 1px solid #e2e8f0;
      background: #fffbeb; font-size: 11px; color: #744210; flex-shrink: 0;
    }
    .ux-captures:empty { display: none; padding: 0; border: none; }
    .ux-captures .cap-item {
      display: flex; align-items: center; justify-content: space-between; padding: 2px 0; gap: 6px;
    }
    .ux-captures .cap-item span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ux-captures .cap-item .cap-remove {
      background: none; border: none; color: #e53e3e; cursor: pointer; font-size: 14px;
      padding: 0 2px; flex-shrink: 0; display: flex; align-items: center;
    }

    /* Comment input */
    .ux-comment-area { padding: 10px; border-bottom: 1px solid #e2e8f0; flex-shrink: 0; }
    .ux-comment-area textarea {
      width: 100%; height: 64px; border: 1px solid #cbd5e0; border-radius: 8px;
      padding: 8px 10px; font-size: 13px; resize: vertical; outline: none;
      font-family: inherit; color: #2d3748;
    }
    .ux-comment-area textarea:focus { border-color: #5a9a91; box-shadow: 0 0 0 2px rgba(90,154,145,0.2); }
    .ux-comment-area .ux-submit-row { display: flex; justify-content: flex-end; margin-top: 6px; }
    .ux-comment-area button.ux-submit {
      padding: 6px 16px; background: #5a9a91; color: #fff; border: none;
      border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;
      display: flex; align-items: center; gap: 6px;
    }
    .ux-comment-area button.ux-submit:disabled { opacity: 0.5; cursor: default; }
    .ux-comment-area button.ux-submit:hover:not(:disabled) { background: #4a8a81; }

    /* Comment list */
    .ux-comments-list {
      flex: 1; overflow-y: auto; padding: 8px 10px; min-height: 0;
    }
    .ux-comment-card {
      background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 8px;
      padding: 8px 10px; margin-bottom: 6px; font-size: 12px; position: relative;
    }
    .ux-comment-card .cc-header {
      display: flex; align-items: flex-start; justify-content: space-between; gap: 4px;
    }
    .ux-comment-card .cc-actions {
      display: flex; gap: 2px; flex-shrink: 0;
    }
    .ux-comment-card .cc-actions button {
      background: none; border: none; cursor: pointer; padding: 1px 3px;
      font-size: 14px; color: #a0aec0; display: flex; align-items: center;
    }
    .ux-comment-card .cc-actions button:hover { color: #4a5568; }
    .ux-comment-card .cc-actions button.cc-delete:hover { color: #e53e3e; }
    .ux-comment-card .cc-text { color: #2d3748; margin-bottom: 4px; white-space: pre-wrap; flex: 1; cursor: pointer; border-radius: 4px; padding: 2px 4px; margin: -2px -4px 4px; }
    .ux-comment-card .cc-text:hover { background: rgba(90,154,145,0.08); }
    .ux-comment-card .cc-edit-textarea {
      width: 100%; min-height: 48px; border: 1px solid #5a9a91; border-radius: 6px;
      padding: 6px 8px; font-size: 12px; font-family: inherit; color: #2d3748;
      outline: none; resize: vertical; margin-bottom: 4px;
    }
    .ux-comment-card .cc-meta { color: #a0aec0; font-size: 10px; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
    .ux-comment-card .cc-meta i { font-size: 11px; }
    .ux-comment-card .cc-url { color: #718096; font-size: 10px; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; }
    .ux-comment-card .cc-captures { margin-top: 4px; }
    .ux-comment-card .cc-cap {
      background: #edf2f7; padding: 3px 6px; border-radius: 4px;
      font-size: 10px; color: #4a5568; margin-top: 2px; font-family: monospace;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      display: flex; align-items: center; gap: 4px;
    }
    .ux-comment-card .cc-cap i { font-size: 12px; flex-shrink: 0; }

    /* Footer */
    .ux-panel-footer {
      padding: 8px 10px; border-top: 1px solid #e2e8f0; display: flex;
      justify-content: space-between; align-items: center; background: #f7fafc;
      flex-shrink: 0; gap: 6px;
    }
    .ux-panel-footer .ux-count { font-size: 11px; color: #718096; }
    .ux-panel-footer .ux-footer-buttons { display: flex; gap: 6px; align-items: center; }
    .ux-panel-footer button.ux-download {
      padding: 5px 12px; background: #2b6cb0; color: #fff; border: none;
      border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer;
      display: flex; align-items: center; gap: 5px;
    }
    .ux-panel-footer button.ux-download:hover { background: #2c5282; }
    .ux-panel-footer button.ux-download:disabled { opacity: 0.5; cursor: default; }
    .ux-panel-footer button.ux-send-review {
      padding: 5px 12px; background: #5a9a91; color: #fff; border: none;
      border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer;
      display: flex; align-items: center; gap: 5px;
    }
    .ux-panel-footer button.ux-send-review:hover { background: #4a8a81; }
    .ux-panel-footer button.ux-send-review:disabled { opacity: 0.5; cursor: default; }

    /* Overlays */
    #ux-hover-highlight {
      position: fixed; pointer-events: none; z-index: 2147483646;
      border: 2px solid #5a9a91; background: rgba(90,154,145,0.12);
      border-radius: 3px; display: none; transition: all 0.06s;
    }
    #ux-area-rect {
      position: fixed; pointer-events: none; z-index: 2147483646;
      border: 2px dashed #e53e3e; background: rgba(229,62,62,0.08);
      display: none;
    }
    #ux-point-marker {
      position: fixed; pointer-events: none; z-index: 2147483646;
      width: 16px; height: 16px; margin: -8px 0 0 -8px;
      border-radius: 50%; border: 2px solid #e53e3e;
      background: rgba(229,62,62,0.3); display: none;
    }

    /* Mode banner */
    #ux-mode-banner {
      position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
      z-index: 2147483646; padding: 8px 20px; border-radius: 8px;
      font-size: 13px; font-weight: 600; color: #fff;
      box-shadow: 0 4px 16px rgba(0,0,0,0.2); display: none;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      display: none; align-items: center; gap: 8px;
    }
    #ux-mode-banner.element { background: #5a9a91; display: flex; }
    #ux-mode-banner.area { background: #e53e3e; display: flex; }
    #ux-mode-banner.point { background: #d69e2e; display: flex; }
    #ux-mode-banner.text { background: #805ad5; display: flex; }
    #ux-mode-banner.hidden { display: none !important; }

    /* Slide-up sheet backdrop (mobile only) */
    #ux-sheet-backdrop {
      display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.3); z-index: 2147483646;
    }
    #ux-sheet-backdrop.visible { display: block; }

    /* ── Mobile responsive ── */
    @media (max-width: 480px) {
      #ux-widget-root { right: 12px; bottom: 76px; left: auto; }

      /* Toggle area: pen + list side by side */
      .ux-toggle-group {
        display: flex; gap: 8px; align-items: center;
      }
      #ux-widget-toggle { width: 48px; height: 48px; font-size: 24px; }
      #ux-widget-list-btn {
        display: flex; width: 40px; height: 40px; border-radius: 50%; border: none;
        background: rgba(255,255,255,0.95); color: #5a9a91;
        font-size: 20px; cursor: pointer; align-items: center; justify-content: center;
        box-shadow: 0 2px 10px rgba(0,0,0,0.15); position: relative;
      }
      #ux-widget-list-btn:active { background: #edf2f7; }
      #ux-widget-list-btn .badge {
        position: absolute; top: -4px; right: -4px; min-width: 16px; height: 16px;
        background: #e53e3e; color: #fff; border-radius: 8px; font-size: 10px;
        display: flex; align-items: center; justify-content: center; padding: 0 3px;
        font-weight: 700;
      }

      /* Panel becomes slide-up sheet on mobile */
      #ux-widget-panel {
        position: fixed; bottom: 0; left: 0; right: 0; width: auto;
        max-height: 60vh; border-radius: 14px 14px 0 0;
        box-shadow: 0 -4px 24px rgba(0,0,0,0.2);
        transition: transform 0.3s ease;
      }
      #ux-widget-panel .ux-drag-handle { display: flex; }

      .ux-toolbar button { padding: 8px 2px; font-size: 11px; }
      .ux-toolbar button i { font-size: 18px; }
      .ux-panel-header button { font-size: 22px; padding: 4px 8px; min-height: 44px; }
      .ux-comment-area textarea { font-size: 16px; }
      #ux-mode-banner { font-size: 12px; padding: 6px 14px; top: 8px; max-width: 90vw; text-align: center; }
      .ux-comment-card .cc-actions button { font-size: 18px; padding: 4px 6px; min-height: 36px; min-width: 36px; }
    }
  `;
  document.head.appendChild(style);

  // ── Build DOM ────────────────────────────────────────────────────────
  const root = document.createElement('div');
  root.id = 'ux-widget-root';
  root.innerHTML = `
    <div id="ux-widget-panel">
      <div class="ux-drag-handle"><div class="handle-bar"></div></div>
      <div class="ux-panel-header">
        <div class="ux-header-left">
          <i class="ph ph-chat-circle-dots"></i>
          <span>Review Comments</span>
        </div>
        <div class="ux-header-actions">
          <button id="ux-clear-btn" title="Clear all comments"><i class="ph ph-trash"></i></button>
          <button id="ux-close-btn" title="Collapse"><i class="ph ph-caret-down"></i></button>
        </div>
      </div>
      <div class="ux-toolbar">
        <button data-mode="element" title="Select Element"><i class="ph ph-cursor-click"></i>Element</button>
        <button data-mode="area" title="Select Area"><i class="ph ph-selection"></i>Area</button>
        <button data-mode="point" title="Select Point"><i class="ph ph-crosshair"></i>Point</button>
        <button data-mode="text" title="Select Text"><i class="ph ph-textbox"></i>Text</button>
        <button id="ux-screenshot-btn" title="Take Screenshot"><i class="ph ph-camera"></i>Screen</button>
      </div>
      <div class="ux-captures" id="ux-captures"></div>
      <div class="ux-comment-area">
        <textarea id="ux-comment-input" placeholder="Describe the UX issue or observation..."></textarea>
        <div class="ux-submit-row">
          <button class="ux-submit" id="ux-submit-btn"><i class="ph ph-plus-circle"></i> Add Comment</button>
        </div>
      </div>
      <div class="ux-comments-list" id="ux-comments-list"></div>
      <div class="ux-panel-footer">
        <span class="ux-count" id="ux-count">0 comments</span>
        <div class="ux-footer-buttons">
          <button class="ux-send-review" id="ux-send-review-btn"><i class="ph ph-paper-plane-tilt"></i> Send to Admin</button>
          <button class="ux-download" id="ux-download-btn"><i class="ph ph-download-simple"></i> Download &amp; Clear</button>
        </div>
      </div>
    </div>
    <div class="ux-toggle-group">
      <button id="ux-widget-list-btn" title="Comment History">
        <i class="ph ph-list-bullets"></i>
        <span class="badge" id="ux-list-badge" style="display:none">0</span>
      </button>
      <button id="ux-widget-toggle" title="Review Comments">
        <i class="ph ph-pencil-simple-line"></i>
        <span class="badge" id="ux-badge" style="display:none">0</span>
      </button>
    </div>
    <div id="ux-mobile-mode-pill"></div>
  `;
  document.body.appendChild(root);

  // Mini input bar (lives outside widget root, fixed at bottom)
  const miniBar = document.createElement('div');
  miniBar.id = 'ux-mini-bar';
  miniBar.innerHTML = `
    <input type="text" id="ux-mini-input" placeholder="Add a note..." autocomplete="off" />
    <button class="ux-mini-close" id="ux-mini-close" title="Dismiss"><i class="ph ph-x"></i></button>
    <button class="ux-mini-send" id="ux-mini-send" title="Send"><i class="ph ph-paper-plane-tilt"></i></button>
  `;
  document.body.appendChild(miniBar);

  // Sheet backdrop (mobile only)
  const sheetBackdrop = document.createElement('div');
  sheetBackdrop.id = 'ux-sheet-backdrop';
  document.body.appendChild(sheetBackdrop);

  // Overlays (outside widget root so pointer-events: none works cleanly)
  const hoverHL = document.createElement('div');
  hoverHL.id = 'ux-hover-highlight';
  document.body.appendChild(hoverHL);

  const areaRect = document.createElement('div');
  areaRect.id = 'ux-area-rect';
  document.body.appendChild(areaRect);

  const pointMarker = document.createElement('div');
  pointMarker.id = 'ux-point-marker';
  document.body.appendChild(pointMarker);

  const modeBanner = document.createElement('div');
  modeBanner.id = 'ux-mode-banner';
  modeBanner.className = 'hidden';
  document.body.appendChild(modeBanner);

  // On mobile, tapping the banner cancels the mode (or captures text in text mode)
  modeBanner.addEventListener('click', () => {
    if (!activeMode) return;
    if (activeMode === 'text') {
      // In text mode, tapping banner captures current selection
      const selection = window.getSelection();
      const selectedText = selection.toString().trim();
      if (selectedText.length >= 2) {
        const range = selection.getRangeAt(0);
        const startNode = range.startContainer;
        const parentEl = startNode.parentElement || startNode;
        const context = getTextContext(parentEl, selectedText);
        const heading = findNearestHeading(parentEl);
        const landmark = findLandmark(parentEl);
        currentCaptures.push({
          type: 'text',
          data: { selectedText, context, nearestHeading: heading, nearestLandmark: landmark },
          url: window.location.href,
          pageTitle: document.title || '',
          timestamp: new Date().toISOString(),
        });
        saveDraftCaptures(currentCaptures);
        renderCaptures();
        selection.removeAllRanges();
      }
    }
    deactivateMode();
  });

  // ── Element refs ─────────────────────────────────────────────────────
  const panel = root.querySelector('#ux-widget-panel');
  const toggleBtn = root.querySelector('#ux-widget-toggle');
  const listBtn = root.querySelector('#ux-widget-list-btn');
  const closeBtn = root.querySelector('#ux-close-btn');
  const clearBtn = root.querySelector('#ux-clear-btn');
  const commentInput = root.querySelector('#ux-comment-input');
  const submitBtn = root.querySelector('#ux-submit-btn');
  const capturesDiv = root.querySelector('#ux-captures');
  const commentsList = root.querySelector('#ux-comments-list');
  const countSpan = root.querySelector('#ux-count');
  const downloadBtn = root.querySelector('#ux-download-btn');
  const sendReviewBtn = root.querySelector('#ux-send-review-btn');
  const badge = root.querySelector('#ux-badge');
  const listBadge = root.querySelector('#ux-list-badge');
  const toolBtns = root.querySelectorAll('.ux-toolbar button[data-mode]');
  const screenshotBtn = root.querySelector('#ux-screenshot-btn');
  const mobileModePill = root.querySelector('#ux-mobile-mode-pill');
  const dragHandle = root.querySelector('.ux-drag-handle');
  const miniInput = miniBar.querySelector('#ux-mini-input');
  const miniSendBtn = miniBar.querySelector('#ux-mini-send');
  const miniCloseBtn = miniBar.querySelector('#ux-mini-close');

  // ── Mobile mini bar helpers ──────────────────────────────────────────
  function showMiniBar() {
    miniBarVisible = true;
    miniBar.classList.add('visible');
    // Hide the toggle buttons when mini bar is visible
    root.style.display = 'none';
    setTimeout(() => miniInput.focus(), 100);
  }

  function hideMiniBar() {
    miniBarVisible = false;
    miniBar.classList.remove('visible');
    miniInput.value = '';
    root.style.display = '';
  }

  function submitMiniBar() {
    const text = miniInput.value.trim();
    if (!text && currentCaptures.length === 0) return;
    const comment = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      text,
      captures: [...currentCaptures],
      url: window.location.href,
      pageTitle: document.title || '',
      scrollPosition: { x: Math.round(window.scrollX), y: Math.round(window.scrollY) },
      viewport: { w: window.innerWidth, h: window.innerHeight },
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    };
    const comments = getComments();
    comments.push(comment);
    saveComments(comments);
    currentCaptures = [];
    saveDraftCaptures([]);
    renderCaptures();
    updateBadge();
    hideMiniBar();
    // Also send to API in background
    sendCommentsToAPI([comment]).catch(() => {});
  }

  miniSendBtn.addEventListener('click', submitMiniBar);
  miniCloseBtn.addEventListener('click', () => {
    // Discard captures and dismiss
    currentCaptures = [];
    saveDraftCaptures([]);
    renderCaptures();
    hideMiniBar();
  });
  miniInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submitMiniBar(); }
  });

  // ── Mobile mode pill helpers ─────────────────────────────────────────
  const MOBILE_MODES = ['element', 'point', 'area']; // cycling order
  const MOBILE_PILL_LABELS = {
    element: 'Tap element',
    point: 'Tap a point',
    area: 'Drag area',
  };

  function updateMobileModePill() {
    if (!isMobileWidth()) {
      mobileModePill.className = '';
      mobileModePill.style.display = 'none';
      return;
    }
    if (mobileQuickMode) {
      mobileModePill.textContent = MOBILE_PILL_LABELS[mobileQuickMode];
      mobileModePill.className = mobileQuickMode;
    } else {
      mobileModePill.className = '';
      mobileModePill.style.display = 'none';
    }
  }

  // ── Toggle expand / collapse ─────────────────────────────────────────
  function setExpanded(val, skipSave) {
    expanded = val;
    panel.classList.toggle('open', expanded);
    if (isMobileWidth()) {
      // On mobile, panel open = slide-up sheet; toggle buttons remain visible underneath backdrop
      sheetBackdrop.classList.toggle('visible', expanded);
      // Don't hide toggle on mobile when panel is open (backdrop handles it)
      toggleBtn.style.display = 'flex';
    } else {
      // Desktop: hide toggle when expanded
      toggleBtn.style.display = expanded ? 'none' : 'flex';
    }
    if (!expanded) {
      deactivateMode();
      editingId = null;
      sheetBackdrop.classList.remove('visible');
    }
    if (expanded) renderCommentsList();
    // Persist state across page loads (unless skipSave for initial restore)
    if (!skipSave) {
      try { localStorage.setItem(STATE_KEY, JSON.stringify({ expanded })); } catch {}
    }
  }

  // Desktop: toggle button opens panel directly
  // Mobile: toggle button cycles quick-capture modes
  toggleBtn.addEventListener('click', () => {
    if (isMobileWidth()) {
      // Cycle through modes: element -> point -> area -> off
      if (!mobileQuickMode) {
        mobileQuickMode = MOBILE_MODES[0];
      } else {
        const idx = MOBILE_MODES.indexOf(mobileQuickMode);
        if (idx >= MOBILE_MODES.length - 1) {
          // Turn off
          mobileQuickMode = null;
          deactivateMode();
          updateMobileModePill();
          return;
        }
        mobileQuickMode = MOBILE_MODES[idx + 1];
      }
      activateMode(mobileQuickMode);
      updateMobileModePill();
    } else {
      // Desktop: open full panel
      setExpanded(true);
    }
  });

  // List button: opens full panel (mobile only, but we wire it for all)
  listBtn.addEventListener('click', () => {
    setExpanded(true);
  });

  closeBtn.addEventListener('click', () => setExpanded(false));

  // Clicking anywhere on the header bar collapses (except trash button)
  const panelHeader = root.querySelector('.ux-panel-header');
  panelHeader.addEventListener('click', (e) => {
    if (e.target.closest('#ux-clear-btn')) return; // let trash work normally
    setExpanded(false);
  });

  // Backdrop click closes sheet on mobile
  sheetBackdrop.addEventListener('click', () => {
    setExpanded(false);
  });

  // ── Drag handle for mobile sheet ──────────────────────────────────────
  let dragStartY = null;
  let dragStartTranslate = 0;
  dragHandle.addEventListener('touchstart', (e) => {
    dragStartY = e.touches[0].clientY;
    dragStartTranslate = 0;
    panel.style.transition = 'none';
  }, { passive: true });
  dragHandle.addEventListener('touchmove', (e) => {
    if (dragStartY === null) return;
    const dy = e.touches[0].clientY - dragStartY;
    if (dy > 0) { // only allow dragging down
      dragStartTranslate = dy;
      panel.style.transform = `translateY(${dy}px)`;
    }
  }, { passive: true });
  dragHandle.addEventListener('touchend', () => {
    panel.style.transition = 'transform 0.3s ease';
    if (dragStartTranslate > 80) {
      // Dismiss the sheet
      panel.style.transform = '';
      setExpanded(false);
    } else {
      panel.style.transform = '';
    }
    dragStartY = null;
    dragStartTranslate = 0;
  });

  // ── Clear ────────────────────────────────────────────────────────────
  clearBtn.addEventListener('click', () => {
    if (!confirm('Clear all UX comments? This cannot be undone.')) return;
    saveComments([]);
    editingId = null;
    renderCommentsList();
    updateBadge();
  });

  // ── Tool modes ───────────────────────────────────────────────────────
  function activateMode(mode) {
    if (activeMode === mode) { deactivateMode(); return; }
    deactivateMode();
    activeMode = mode;
    toolBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    const labels = isTouchDevice ? {
      element: '<i class="ph ph-cursor-click"></i> Tap an element to capture it',
      area: '<i class="ph ph-selection"></i> Touch & drag to select area',
      point: '<i class="ph ph-crosshair"></i> Tap to mark a point',
      text: '<i class="ph ph-textbox"></i> Select text, then tap banner to capture',
    } : {
      element: '<i class="ph ph-cursor-click"></i> Element Select \u2014 hover & click (Esc to cancel)',
      area: '<i class="ph ph-selection"></i> Area Select \u2014 click & drag (Esc to cancel)',
      point: '<i class="ph ph-crosshair"></i> Point Select \u2014 click anywhere (Esc to cancel)',
      text: '<i class="ph ph-textbox"></i> Text Select \u2014 highlight text (Esc to cancel)',
    };
    modeBanner.innerHTML = labels[mode];
    modeBanner.className = mode;
    document.body.style.cursor = (mode === 'point' || mode === 'area') ? 'crosshair' : (mode === 'text' ? 'text' : 'default');
  }
  function deactivateMode() {
    activeMode = null;
    areaStart = null;
    toolBtns.forEach(b => b.classList.remove('active'));
    hoverHL.style.display = 'none';
    areaRect.style.display = 'none';
    modeBanner.className = 'hidden';
    document.body.style.cursor = '';
  }
  toolBtns.forEach(b => b.addEventListener('click', () => activateMode(b.dataset.mode)));

  // ── After-capture handler (mobile: show mini bar) ────────────────────
  function onCaptureComplete() {
    if (isMobileWidth() && !expanded) {
      // On mobile, after capturing, show mini bar for quick comment
      mobileQuickMode = null;
      updateMobileModePill();
      showMiniBar();
    }
  }

  // ── Mouse handlers ───────────────────────────────────────────────────
  function handleMouseMove(e) {
    if (activeMode === 'element') {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || el.closest('#ux-widget-root') || el.id === 'ux-hover-highlight' || el.id === 'ux-mode-banner') {
        hoverHL.style.display = 'none';
        return;
      }
      const r = el.getBoundingClientRect();
      hoverHL.style.display = 'block';
      hoverHL.style.left = r.x + 'px';
      hoverHL.style.top = r.y + 'px';
      hoverHL.style.width = r.width + 'px';
      hoverHL.style.height = r.height + 'px';
    }
    if (activeMode === 'area' && areaStart) {
      const x = Math.min(areaStart.x, e.clientX);
      const y = Math.min(areaStart.y, e.clientY);
      const w = Math.abs(e.clientX - areaStart.x);
      const h = Math.abs(e.clientY - areaStart.y);
      areaRect.style.display = 'block';
      areaRect.style.left = x + 'px';
      areaRect.style.top = y + 'px';
      areaRect.style.width = w + 'px';
      areaRect.style.height = h + 'px';
    }
  }

  function handleMouseDown(e) {
    if (!activeMode) return;
    if (e.target.closest('#ux-widget-root')) return;
    if (activeMode === 'area') {
      areaStart = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    }
  }

  function handleMouseUp(e) {
    if (!activeMode) return;
    if (e.target.closest('#ux-widget-root')) return;

    if (activeMode === 'element') {
      e.preventDefault();
      e.stopPropagation();
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || el.closest('#ux-widget-root') || el.id === 'ux-hover-highlight' || el.id === 'ux-mode-banner') return;
      const desc = describeElement(el);
      if (desc) {
        desc.nearestLandmark = findLandmark(el.parentElement) || null;
        currentCaptures.push({
          type: 'element',
          data: desc,
          url: window.location.href,
          pageTitle: document.title || '',
          timestamp: new Date().toISOString(),
        });
        saveDraftCaptures(currentCaptures);
        renderCaptures();
      }
      hoverHL.style.display = 'none';
      deactivateMode();
      onCaptureComplete();
    }

    if (activeMode === 'area' && areaStart) {
      e.preventDefault();
      const vx = Math.min(areaStart.x, e.clientX);
      const vy = Math.min(areaStart.y, e.clientY);
      const vw = Math.abs(e.clientX - areaStart.x);
      const vh = Math.abs(e.clientY - areaStart.y);
      if (vw > 5 && vh > 5) {
        const viewportRect = { x: vx, y: vy, w: vw, h: vh };
        const pageOrigin = toPageCoords(vx, vy);
        const pageRect = { x: pageOrigin.x, y: pageOrigin.y, w: Math.round(vw), h: Math.round(vh) };
        const els = elementsInRect(viewportRect);
        const landmark = landmarkForArea(viewportRect);
        currentCaptures.push({
          type: 'area',
          data: { rect: pageRect, nearestLandmark: landmark, elements: els, elementCount: els.length },
          url: window.location.href,
          pageTitle: document.title || '',
          timestamp: new Date().toISOString(),
        });
        saveDraftCaptures(currentCaptures);
        renderCaptures();
      }
      areaRect.style.display = 'none';
      areaStart = null;
      deactivateMode();
      onCaptureComplete();
    }

    if (activeMode === 'point') {
      e.preventDefault();
      e.stopPropagation();
      const pagePt = toPageCoords(e.clientX, e.clientY);
      // briefly flash marker at viewport position
      pointMarker.style.display = 'block';
      pointMarker.style.left = e.clientX + 'px';
      pointMarker.style.top = e.clientY + 'px';
      setTimeout(() => { pointMarker.style.display = 'none'; }, 600);
      // grab element at point for context
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const elDesc = (el && !el.closest('#ux-widget-root')) ? describeElement(el) : null;
      const landmark = (el && !el.closest('#ux-widget-root')) ? findLandmark(el) : null;
      currentCaptures.push({
        type: 'point',
        data: { point: pagePt, elementAtPoint: elDesc, nearestLandmark: landmark },
        url: window.location.href,
        pageTitle: document.title || '',
        timestamp: new Date().toISOString(),
      });
      saveDraftCaptures(currentCaptures);
      renderCaptures();
      deactivateMode();
      onCaptureComplete();
    }

    if (activeMode === 'text') {
      const selection = window.getSelection();
      const selectedText = selection.toString().trim();
      if (selectedText.length < 2) return; // Need at least 2 chars

      const range = selection.getRangeAt(0);
      const startNode = range.startContainer;
      const parentEl = startNode.parentElement || startNode;

      const context = getTextContext(parentEl, selectedText);
      const heading = findNearestHeading(parentEl);
      const landmark = findLandmark(parentEl);

      currentCaptures.push({
        type: 'text',
        data: {
          selectedText: selectedText,
          context: context,
          nearestHeading: heading,
          nearestLandmark: landmark,
        },
        url: window.location.href,
        pageTitle: document.title || '',
        timestamp: new Date().toISOString(),
      });
      saveDraftCaptures(currentCaptures);
      renderCaptures();
      selection.removeAllRanges(); // Clear the selection
      deactivateMode();
      onCaptureComplete();
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape' && activeMode) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      deactivateMode();
    }
  }

  /**
   * Block all clicks during selection modes to prevent link navigation.
   * This runs at capture phase to intercept before any element handlers.
   */
  function handleClick(e) {
    if (!activeMode) return;
    if (e.target.closest('#ux-widget-root')) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }

  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('mousedown', handleMouseDown, true);
  document.addEventListener('mouseup', handleMouseUp, true);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleKeyDown, true);

  // ── Touch handlers (iPhone / mobile support) ──────────────────────
  function handleTouchStart(e) {
    if (!activeMode) return;
    if (e.target.closest('#ux-widget-root') || e.target.closest('#ux-mini-bar')) return;
    const t = e.touches[0];
    lastTouch = { x: t.clientX, y: t.clientY };

    if (activeMode === 'area') {
      areaStart = { x: t.clientX, y: t.clientY };
      e.preventDefault(); // prevent scrolling while dragging area
    }
    if (activeMode === 'element' || activeMode === 'point') {
      e.preventDefault(); // prevent tap-through to links
    }
  }

  function handleTouchMove(e) {
    if (!activeMode) return;
    if (e.target.closest('#ux-widget-root') || e.target.closest('#ux-mini-bar')) return;
    const t = e.touches[0];
    lastTouch = { x: t.clientX, y: t.clientY };

    if (activeMode === 'element') {
      // Live highlight under finger
      const el = document.elementFromPoint(t.clientX, t.clientY);
      if (!el || el.closest('#ux-widget-root') || el.id === 'ux-hover-highlight' || el.id === 'ux-mode-banner') {
        hoverHL.style.display = 'none';
        return;
      }
      const r = el.getBoundingClientRect();
      hoverHL.style.display = 'block';
      hoverHL.style.left = r.x + 'px';
      hoverHL.style.top = r.y + 'px';
      hoverHL.style.width = r.width + 'px';
      hoverHL.style.height = r.height + 'px';
      e.preventDefault();
    }

    if (activeMode === 'area' && areaStart) {
      const x = Math.min(areaStart.x, t.clientX);
      const y = Math.min(areaStart.y, t.clientY);
      const w = Math.abs(t.clientX - areaStart.x);
      const h = Math.abs(t.clientY - areaStart.y);
      areaRect.style.display = 'block';
      areaRect.style.left = x + 'px';
      areaRect.style.top = y + 'px';
      areaRect.style.width = w + 'px';
      areaRect.style.height = h + 'px';
      e.preventDefault();
    }
  }

  function handleTouchEnd(e) {
    if (!activeMode) return;
    if (e.target.closest('#ux-widget-root') || e.target.closest('#ux-mini-bar')) return;
    // touchend has no coordinates — use the last tracked position
    const cx = lastTouch ? lastTouch.x : 0;
    const cy = lastTouch ? lastTouch.y : 0;

    if (activeMode === 'element') {
      e.preventDefault();
      const el = document.elementFromPoint(cx, cy);
      if (!el || el.closest('#ux-widget-root') || el.id === 'ux-hover-highlight' || el.id === 'ux-mode-banner') return;
      const desc = describeElement(el);
      if (desc) {
        desc.nearestLandmark = findLandmark(el.parentElement) || null;
        currentCaptures.push({
          type: 'element',
          data: desc,
          url: window.location.href,
          pageTitle: document.title || '',
          timestamp: new Date().toISOString(),
        });
        saveDraftCaptures(currentCaptures);
        renderCaptures();
      }
      hoverHL.style.display = 'none';
      deactivateMode();
      onCaptureComplete();
    }

    if (activeMode === 'area' && areaStart) {
      e.preventDefault();
      const vx = Math.min(areaStart.x, cx);
      const vy = Math.min(areaStart.y, cy);
      const vw = Math.abs(cx - areaStart.x);
      const vh = Math.abs(cy - areaStart.y);
      if (vw > 10 && vh > 10) {
        const viewportRect = { x: vx, y: vy, w: vw, h: vh };
        const pageOrigin = toPageCoords(vx, vy);
        const pageRect = { x: pageOrigin.x, y: pageOrigin.y, w: Math.round(vw), h: Math.round(vh) };
        const els = elementsInRect(viewportRect);
        const landmark = landmarkForArea(viewportRect);
        currentCaptures.push({
          type: 'area',
          data: { rect: pageRect, nearestLandmark: landmark, elements: els, elementCount: els.length },
          url: window.location.href,
          pageTitle: document.title || '',
          timestamp: new Date().toISOString(),
        });
        saveDraftCaptures(currentCaptures);
        renderCaptures();
      }
      areaRect.style.display = 'none';
      areaStart = null;
      deactivateMode();
      onCaptureComplete();
    }

    if (activeMode === 'point') {
      e.preventDefault();
      const pagePt = toPageCoords(cx, cy);
      pointMarker.style.display = 'block';
      pointMarker.style.left = cx + 'px';
      pointMarker.style.top = cy + 'px';
      setTimeout(() => { pointMarker.style.display = 'none'; }, 600);
      const el = document.elementFromPoint(cx, cy);
      const elDesc = (el && !el.closest('#ux-widget-root')) ? describeElement(el) : null;
      const landmark = (el && !el.closest('#ux-widget-root')) ? findLandmark(el) : null;
      currentCaptures.push({
        type: 'point',
        data: { point: pagePt, elementAtPoint: elDesc, nearestLandmark: landmark },
        url: window.location.href,
        pageTitle: document.title || '',
        timestamp: new Date().toISOString(),
      });
      saveDraftCaptures(currentCaptures);
      renderCaptures();
      deactivateMode();
      onCaptureComplete();
    }

    if (activeMode === 'text') {
      // On mobile, text selection happens natively — check after a short delay
      setTimeout(() => {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        if (selectedText.length < 2) return;
        const range = selection.getRangeAt(0);
        const startNode = range.startContainer;
        const parentEl = startNode.parentElement || startNode;
        const context = getTextContext(parentEl, selectedText);
        const heading = findNearestHeading(parentEl);
        const landmark = findLandmark(parentEl);
        currentCaptures.push({
          type: 'text',
          data: { selectedText, context, nearestHeading: heading, nearestLandmark: landmark },
          url: window.location.href,
          pageTitle: document.title || '',
          timestamp: new Date().toISOString(),
        });
        saveDraftCaptures(currentCaptures);
        renderCaptures();
        selection.removeAllRanges();
        deactivateMode();
        onCaptureComplete();
      }, 300);
    }

    lastTouch = null;
  }

  document.addEventListener('touchstart', handleTouchStart, { capture: true, passive: false });
  document.addEventListener('touchmove', handleTouchMove, { capture: true, passive: false });
  document.addEventListener('touchend', handleTouchEnd, { capture: true, passive: false });

  // ── Captures rendering ───────────────────────────────────────────────
  function landmarkLabel(lm) {
    if (!lm) return '';
    if (lm.headingText) return ` in "${lm.headingText}"`;
    if (lm.ariaLabel) return ` in [${lm.ariaLabel}]`;
    if (lm.role) return ` in ${lm.selector} (${lm.role})`;
    return ` in ${lm.selector}`;
  }

  function renderCaptures() {
    const currentUrl = window.location.href;
    capturesDiv.innerHTML = currentCaptures.map((c, i) => {
      let icon, label;
      const lm = c.data.nearestLandmark;
      const ctx = landmarkLabel(lm);
      // Show page path if capture is from a different page
      let pageIndicator = '';
      if (c.url && c.url !== currentUrl) {
        try {
          const path = new URL(c.url).pathname;
          pageIndicator = ` <span style="color:#718096;font-style:italic;">[${path}]</span>`;
        } catch { pageIndicator = ' <span style="color:#718096;font-style:italic;">[other page]</span>'; }
      }
      if (c.type === 'element') {
        icon = 'ph-cursor-click';
        label = c.data.selector + ctx + pageIndicator;
      } else if (c.type === 'area') {
        icon = 'ph-selection';
        label = `Area ${c.data.rect.w}\u00d7${c.data.rect.h} (${c.data.elementCount} els)${ctx}${pageIndicator}`;
      } else if (c.type === 'text') {
        icon = 'ph-textbox';
        const truncated = c.data.selectedText.length > 30 ? c.data.selectedText.slice(0, 30) + '...' : c.data.selectedText;
        const headingCtx = c.data.nearestHeading ? ` in "${c.data.nearestHeading}"` : ctx;
        label = `"${truncated}"${headingCtx}${pageIndicator}`;
      } else if (c.type === 'screenshot') {
        icon = 'ph-camera';
        label = `Screenshot ${c.data.viewport.w}\u00d7${c.data.viewport.h}${pageIndicator}`;
      } else {
        icon = 'ph-crosshair';
        label = `Point (${c.data.point.x}, ${c.data.point.y})${ctx}${pageIndicator}`;
      }
      return `<div class="cap-item"><span><i class="ph ${icon}" style="font-size:12px;margin-right:3px;"></i>${label}</span><button class="cap-remove" data-idx="${i}"><i class="ph ph-x"></i></button></div>`;
    }).join('');
    capturesDiv.querySelectorAll('.cap-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        currentCaptures.splice(+btn.dataset.idx, 1);
        saveDraftCaptures(currentCaptures);
        renderCaptures();
      });
    });
  }

  // ── Submit comment ───────────────────────────────────────────────────
  submitBtn.addEventListener('click', () => {
    const text = commentInput.value.trim();
    if (!text && currentCaptures.length === 0) return;
    const comments = getComments();
    comments.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      text,
      captures: [...currentCaptures],
      url: window.location.href,
      pageTitle: document.title || '',
      scrollPosition: { x: Math.round(window.scrollX), y: Math.round(window.scrollY) },
      viewport: { w: window.innerWidth, h: window.innerHeight },
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    });
    saveComments(comments);
    commentInput.value = '';
    currentCaptures = [];
    saveDraftCaptures([]); // Clear persisted draft captures
    renderCaptures();
    renderCommentsList();
    updateBadge();
  });

  // ── Comments list rendering ──────────────────────────────────────────
  function renderCommentsList() {
    const comments = getComments();
    if (comments.length === 0) {
      commentsList.innerHTML = '<div style="padding:16px;text-align:center;color:#a0aec0;font-size:12px;"><i class="ph ph-chat-circle-dots" style="font-size:24px;display:block;margin-bottom:6px;"></i>No comments yet. Use the tools above to capture elements, then describe what you observe.</div>';
    } else {
      commentsList.innerHTML = comments.slice().reverse().map(c => {
        const isEditing = editingId === c.id;
        const caps = (c.captures || []).map(cap => {
          const ctx = landmarkLabel(cap.data.nearestLandmark);
          // Show page path if capture URL differs from comment URL
          let pageTag = '';
          if (cap.url && cap.url !== c.url) {
            try {
              const path = new URL(cap.url).pathname;
              pageTag = ` <span style="color:#718096;font-style:italic;">[${escapeHtml(path)}]</span>`;
            } catch { pageTag = ' <span style="color:#718096;font-style:italic;">[other]</span>'; }
          }
          if (cap.type === 'element') return `<div class="cc-cap"><i class="ph ph-cursor-click"></i> ${escapeHtml(cap.data.selector + ctx)}${pageTag}</div>`;
          if (cap.type === 'area') return `<div class="cc-cap"><i class="ph ph-selection"></i> Area ${cap.data.rect.w}\u00d7${cap.data.rect.h} \u2014 ${cap.data.elementCount} elements${escapeHtml(ctx)}${pageTag}</div>`;
          if (cap.type === 'point') return `<div class="cc-cap"><i class="ph ph-crosshair"></i> Point (${cap.data.point.x}, ${cap.data.point.y})${escapeHtml(ctx)}${pageTag}</div>`;
          if (cap.type === 'screenshot') return `<div class="cc-cap"><i class="ph ph-camera"></i> Screenshot ${cap.data.viewport.w}\u00d7${cap.data.viewport.h}${pageTag}</div>`;
          if (cap.type === 'text') {
            const truncated = cap.data.selectedText.length > 40 ? cap.data.selectedText.slice(0, 40) + '...' : cap.data.selectedText;
            const headingCtx = cap.data.nearestHeading ? ` in "${escapeHtml(cap.data.nearestHeading)}"` : escapeHtml(ctx);
            return `<div class="cc-cap"><i class="ph ph-textbox"></i> "${escapeHtml(truncated)}"${headingCtx}${pageTag}</div>`;
          }
          return '';
        }).join('');
        const time = new Date(c.timestamp).toLocaleTimeString();
        const urlPath = (() => { try { return new URL(c.url).pathname; } catch { return c.url; } })();

        const textHtml = isEditing
          ? `<textarea class="cc-edit-textarea" data-id="${c.id}">${escapeHtml(c.text || '')}</textarea>`
          : `<div class="cc-text">${escapeHtml(c.text || '(no text)')}</div>`;

        return `<div class="ux-comment-card" data-comment-id="${c.id}">
          <div class="cc-header">
            ${textHtml}
            <div class="cc-actions">
              <button class="cc-edit" data-id="${c.id}" title="${isEditing ? 'Done editing' : 'Edit comment'}">
                <i class="ph ${isEditing ? 'ph-check' : 'ph-pencil-simple'}"></i>
              </button>
              <button class="cc-delete" data-id="${c.id}" title="Delete comment">
                <i class="ph ph-trash"></i>
              </button>
            </div>
          </div>
          ${caps ? '<div class="cc-captures">' + caps + '</div>' : ''}
          <div class="cc-meta"><i class="ph ph-clock"></i> ${time}</div>
          <span class="cc-url" title="${escapeHtml(c.url)}"><i class="ph ph-globe" style="font-size:11px;margin-right:2px;"></i>${escapeHtml(urlPath)}</span>
        </div>`;
      }).join('');

      // Helper: save current edit and switch to a new id (or null to close)
      function switchEditTo(newId) {
        if (editingId) {
          const prevTa = commentsList.querySelector(`.cc-edit-textarea[data-id="${editingId}"]`);
          if (prevTa) {
            const comments = getComments();
            const idx = comments.findIndex(c => c.id === editingId);
            if (idx !== -1) {
              comments[idx].text = prevTa.value.trim();
              saveComments(comments);
            }
          }
        }
        editingId = newId;
        renderCommentsList();
      }

      // Bind edit buttons
      commentsList.querySelectorAll('.cc-edit').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          switchEditTo(editingId === id ? null : id);
        });
      });

      // Bind click on comment text to enter edit mode
      commentsList.querySelectorAll('.cc-text').forEach(div => {
        div.addEventListener('click', () => {
          const card = div.closest('.ux-comment-card');
          if (!card) return;
          const id = card.dataset.commentId;
          if (id && editingId !== id) switchEditTo(id);
        });
      });

      // Bind delete buttons
      commentsList.querySelectorAll('.cc-delete').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          const comments = getComments().filter(c => c.id !== id);
          saveComments(comments);
          if (editingId === id) editingId = null;
          renderCommentsList();
          updateBadge();
        });
      });

      // Auto-save on input (2s debounce) and on blur (immediate)
      commentsList.querySelectorAll('.cc-edit-textarea').forEach(ta => {
        let saveTimer;
        function saveNow() {
          clearTimeout(saveTimer);
          const id = ta.dataset.id;
          const comments = getComments();
          const idx = comments.findIndex(c => c.id === id);
          if (idx !== -1) {
            comments[idx].text = ta.value.trim();
            saveComments(comments);
          }
        }
        ta.addEventListener('input', () => {
          clearTimeout(saveTimer);
          saveTimer = setTimeout(saveNow, 2000);
        });
        ta.addEventListener('blur', () => {
          saveNow();
          // Exit edit mode on deselection
          if (editingId === ta.dataset.id) {
            editingId = null;
            renderCommentsList();
          }
        });
        // Focus the textarea
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      });
    }
    countSpan.textContent = comments.length + ' comment' + (comments.length !== 1 ? 's' : '');
    downloadBtn.disabled = comments.length === 0;
    sendReviewBtn.disabled = comments.length === 0;
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function updateBadge() {
    const n = getComments().length;
    badge.textContent = n;
    badge.style.display = n > 0 ? 'flex' : 'none';
    listBadge.textContent = n;
    listBadge.style.display = n > 0 ? 'flex' : 'none';
  }

  // ── Screenshot capture ─────────────────────────────────────────────
  // Dynamically load html2canvas the first time screenshot is used
  let html2canvasLoaded = null;
  function loadHtml2Canvas() {
    if (html2canvasLoaded) return html2canvasLoaded;
    html2canvasLoaded = new Promise((resolve, reject) => {
      if (window.html2canvas) { resolve(window.html2canvas); return; }
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      s.onload = () => resolve(window.html2canvas);
      s.onerror = () => reject(new Error('Failed to load screenshot library'));
      document.head.appendChild(s);
    });
    return html2canvasLoaded;
  }

  screenshotBtn.addEventListener('click', async () => {
    // Temporarily hide the widget so it doesn't appear in the screenshot
    root.style.display = 'none';
    modeBanner.style.display = 'none';
    hoverHL.style.display = 'none';
    miniBar.style.display = 'none';
    if (sheetBackdrop) sheetBackdrop.style.display = 'none';

    screenshotBtn.classList.add('active');

    try {
      const h2c = await loadHtml2Canvas();
      const canvas = await h2c(document.body, {
        useCORS: true,
        scale: window.devicePixelRatio || 1,
        logging: false,
        windowWidth: document.documentElement.scrollWidth,
        windowHeight: window.innerHeight,
        x: window.scrollX,
        y: window.scrollY,
        width: window.innerWidth,
        height: window.innerHeight,
      });
      const dataUrl = canvas.toDataURL('image/png');

      // Add screenshot as a capture
      currentCaptures.push({
        type: 'screenshot',
        data: {
          imageDataUrl: dataUrl,
          viewport: { w: window.innerWidth, h: window.innerHeight },
          scrollPosition: { x: Math.round(window.scrollX), y: Math.round(window.scrollY) },
        },
        url: window.location.href,
        pageTitle: document.title || '',
        timestamp: new Date().toISOString(),
      });
      saveDraftCaptures(currentCaptures);
      renderCaptures();

      // On mobile, show the mini bar so they can type a comment
      if (isTouchDevice && window.innerWidth <= 480) {
        showMiniBar();
      }
    } catch (err) {
      console.error('Screenshot failed:', err);
      alert('Screenshot failed — try again');
    } finally {
      // Restore widget visibility
      root.style.display = '';
      modeBanner.className = activeMode || 'hidden';
      miniBar.style.display = '';
      if (sheetBackdrop) sheetBackdrop.style.display = '';
      screenshotBtn.classList.remove('active');
    }
  });

  // ── Send to Admin ──────────────────────────────────────────────────
  sendReviewBtn.addEventListener('click', async () => {
    const comments = getComments();
    if (comments.length === 0) return;
    sendReviewBtn.disabled = true;
    sendReviewBtn.innerHTML = '<i class="ph ph-spinner"></i> Sending...';
    try {
      await sendCommentsToAPI(comments);
      sendReviewBtn.innerHTML = '<i class="ph ph-check-circle"></i> Sent!';
      // Clear after successful send
      saveComments([]);
      editingId = null;
      renderCommentsList();
      updateBadge();
      // Reset button text after a moment
      setTimeout(() => {
        sendReviewBtn.innerHTML = '<i class="ph ph-paper-plane-tilt"></i> Send to Admin';
        sendReviewBtn.disabled = getComments().length === 0;
      }, 2000);
    } catch (err) {
      sendReviewBtn.innerHTML = '<i class="ph ph-warning"></i> Failed';
      setTimeout(() => {
        sendReviewBtn.innerHTML = '<i class="ph ph-paper-plane-tilt"></i> Send to Admin';
        sendReviewBtn.disabled = getComments().length === 0;
      }, 2000);
    }
  });

  // ── Download & clear ─────────────────────────────────────────────────
  downloadBtn.addEventListener('click', () => {
    const comments = getComments();
    if (comments.length === 0) return;

    // Collect unique pages
    const pages = [...new Set(comments.map(c => c.url))];

    const payload = {
      version: VERSION,
      exportedAt: new Date().toISOString(),
      project: document.title || window.location.hostname,
      originUrl: window.location.origin,
      pagesCommented: pages,
      totalComments: comments.length,
      comments,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ux-comments-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    // Clear after successful download
    saveComments([]);
    editingId = null;
    renderCommentsList();
    updateBadge();
  });

  // ── Init ─────────────────────────────────────────────────────────────
  // Restore draft captures from previous page
  currentCaptures = getDraftCaptures();
  renderCaptures();

  renderCommentsList();
  updateBadge();

  // Restore panel state from previous session
  try {
    const savedState = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
    if (savedState.expanded) {
      setExpanded(true, true); // skipSave=true to avoid redundant write
    }
  } catch {}
})();
