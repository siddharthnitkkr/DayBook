/* util.js — small helpers shared by every module.
   Daybook uses classic scripts that share one `Daybook` namespace instead of ES modules,
   because browsers block module scripts when a page is opened straight from disk (file://). */
window.Daybook = window.Daybook || {};

(function (D) {
  'use strict';

  const u = {};
  const SVG_NS = 'http://www.w3.org/2000/svg';

  /* ---------- dates ---------- */
  u.pad = (n) => String(n).padStart(2, '0');
  u.dateKey = (d = new Date()) => `${d.getFullYear()}-${u.pad(d.getMonth() + 1)}-${u.pad(d.getDate())}`;
  u.parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  u.addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  u.DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  u.DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  u.MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  /* Monday-first order of getDay() values */
  u.WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

  u.daysAgoText = (iso) => {
    if (!iso) return 'never';
    const days = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    return `${days} days ago`;
  };

  /* ---------- random, but repeatable per item ---------- */
  u.hash = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  u.rng = (seed) => () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  /* very slight tilt for hand-placed look, in degrees */
  u.tilt = (id, max = 1.1) => ((u.hash(String(id)) % 2001) / 1000 - 1) * max;
  /* Pen-written look: words get a tiny baseline shift, tilt and uneven letter spacing. The numbers come from the
     text and an id, so an entry looks the same on every render. Words stay real text (readable, selectable). */
  u.ink = (text, seed = '', cls = '') => {
    const r = u.rng(u.hash(`${seed}|${text}`));
    const wrap = u.h('span', { class: `ink ${cls}`.trim() });
    String(text).split(/(\s+)/).forEach((tok) => {
      if (!tok) return;
      if (/^\s+$/.test(tok)) { wrap.append(' '); return; }
      wrap.append(u.h('span', { class: 'ink__w', style: {
        '--dy': `${((r() - 0.5) * 0.1).toFixed(3)}em`,
        '--rot': `${((r() - 0.5) * 1.8).toFixed(2)}deg`,
        '--ls': `${((r() - 0.5) * 0.045).toFixed(3)}em`,
      } }, tok));
    });
    return wrap;
  };
  u.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  u.pick = (arr, rnd = Math.random) => arr[Math.floor(rnd() * arr.length)];

  u.debounce = (fn, ms) => {
    let t = 0;
    const wrapped = (...a) => { clearTimeout(t); t = setTimeout(() => { t = 0; fn(...a); }, ms); };
    /* flush runs the waiting call now, and only if one is waiting: leaving a page must never write stale field values over fresh data (an erase) */
    wrapped.flush = (...a) => { if (!t) return; clearTimeout(t); t = 0; fn(...a); };
    wrapped.cancel = () => { clearTimeout(t); t = 0; };
    return wrapped;
  };

  u.prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- DOM builder: never touches innerHTML, so stored text can't inject markup ---------- */
  u.h = function h(tag, attrs, ...kids) {
    const svg = tag.startsWith('svg:');
    const el = svg ? document.createElementNS(SVG_NS, tag.slice(4)) : document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.setAttribute('class', v);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k === 'style' && typeof v === 'object') {
          for (const [p, val] of Object.entries(v)) {
            if (p.startsWith('--')) el.style.setProperty(p, val); else el.style[p] = val;
          }
        } else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (!svg && (k === 'value' || k === 'checked' || k === 'selected')) el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    u.append(el, kids);
    return el;
  };
  u.append = (el, kids) => {
    for (const k of kids) {
      if (k == null || k === false) continue;
      if (Array.isArray(k)) u.append(el, k);
      else el.append(k.nodeType ? k : document.createTextNode(String(k)));
    }
    return el;
  };
  u.icon = (name, cls = '') => u.h('i', { class: `bi bi-${name} ${cls}`.trim(), 'aria-hidden': 'true' });
  u.clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
  u.$ = (sel, root = document) => root.querySelector(sel);
  u.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- toasts ---------- */
  u.toast = (message, kind = 'info') => {
    const host = document.getElementById('toasts');
    if (!host) return;
    const t = u.h('div', { class: `toast-note toast-note--${kind}` }, message);
    host.append(t);
    setTimeout(() => t.classList.add('is-leaving'), 3600);
    setTimeout(() => t.remove(), 4200);
  };

  /* ---------- dialogs (native <dialog>: focus trap and Esc come for free) ---------- */
  let dialogSeq = 0;
  u.modal = function modal({ title, body, actions = [], onSubmit, className = '' }) {
    const id = `dlg-title-${++dialogSeq}`;
    const opener = document.activeElement;
    const dlg = u.h('dialog', { class: `dlg ${className}`.trim(), 'aria-labelledby': id });
    const api = {
      el: dlg,
      close: () => { if (dlg.open) dlg.close(); },
    };
    const buttons = actions.map((a) => u.h('button', {
      type: a.submit ? 'submit' : 'button',
      class: `btn-ink btn-ink--${a.kind || 'ghost'}`,
      onclick: a.submit ? null : () => a.onClick ? a.onClick(api) : api.close(),
    }, a.label));
    const form = u.h('form', {
      class: 'dlg__form',
      method: 'dialog',
      novalidate: true,
      onsubmit: (e) => { e.preventDefault(); if (onSubmit) onSubmit(api); },
    },
    u.h('h2', { id, class: 'dlg__title' }, title),
    u.h('div', { class: 'dlg__body' }, body),
    u.h('div', { class: 'dlg__actions' }, buttons));
    dlg.append(form);
    dlg.addEventListener('click', (e) => { if (e.target === dlg) api.close(); });
    dlg.addEventListener('close', () => {
      dlg.remove();
      if (opener && opener.isConnected && opener.focus) opener.focus();
    });
    document.body.append(dlg);
    dlg.showModal();
    return api;
  };

  u.confirm = ({ title, text, confirmLabel = 'Confirm', danger = false }) => new Promise((resolve) => {
    let answered = false;
    const done = (v, api) => { answered = true; api.close(); resolve(v); };
    const api = u.modal({
      title,
      body: u.h('p', { class: 'dlg__text' }, text),
      actions: [
        { label: 'Cancel', kind: 'ghost', onClick: (a) => done(false, a) },
        { label: confirmLabel, kind: danger ? 'danger' : 'primary', onClick: (a) => done(true, a) },
      ],
    });
    api.el.addEventListener('close', () => { if (!answered) resolve(false); });
  });

  /* ---------- downloads ---------- */
  u.download = (filename, text, type = 'application/json') => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = u.h('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  /* A small golden ring celebration: thin rings ripple out from an element, then remove themselves. */
  u.burst = (el, { count = 3, circle = false, scale = 2.4, gap = 130 } = {}) => {
    if (!el || !el.isConnected || document.body.classList.contains('no-anim')) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    for (let i = 0; i < count; i++) {
      const b = document.createElement('span');
      b.className = 'burst';
      const size = Math.max(r.width, r.height);
      b.style.left = `${r.left + r.width / 2}px`;
      b.style.top = `${r.top + r.height / 2}px`;
      b.style.width = `${circle ? size : r.width}px`;
      b.style.height = `${circle ? size : r.height}px`;
      b.style.borderRadius = circle ? '50%' : getComputedStyle(el).borderRadius;
      b.style.setProperty('--s', String(scale));
      b.style.animationDelay = `${i * gap}ms`;
      b.addEventListener('animationend', () => b.remove(), { once: true });
      document.body.append(b);
    }
  };

  D.util = u;
})(window.Daybook);
