/* router.js — hash routes (#/today), the side rail, the mobile tab bar and the "More" sheet. */
(function (D) {
  'use strict';

  const { h, icon, $ } = D.util;

  D.pages = {};

  const routes = [
    { id: 'today',     label: 'Today',       icon: 'journal-bookmark', tab: true },
    { id: 'habits',    label: 'Habits',      icon: 'check2-circle',    tab: true },
    { id: 'likes',     label: 'Likes',       icon: 'heart',            tab: true },
    { id: 'bucket',    label: 'Bucket List', short: 'Bucket', icon: 'compass' },
    { id: 'notes',     label: 'Notes',       icon: 'pencil-square',    tab: true },
    { id: 'reminders', label: 'Alerts',      icon: 'bell' },
    { id: 'insights',  label: 'Insights',    icon: 'graph-up' },
    { id: 'prompt',    label: 'My Prompt', short: 'Prompt',   icon: 'chat-quote' },
    { id: 'settings',  label: 'Settings',    icon: 'gear' },
  ];

  let cleanup = null;
  let first = true;

  const idFromHash = () => {
    const m = location.hash.match(/^#\/([a-z]+)/);
    return m && routes.some((r) => r.id === m[1]) ? m[1] : 'today';
  };

  function link(r, cls) {
    return h('a', { class: cls, href: `#/${r.id}`, dataset: { route: r.id }, title: r.label, 'aria-label': r.label },
      icon(r.icon), h('span', { 'aria-hidden': 'true' }, r.short || r.label),
      r.phase && cls === 'rail__link' ? h('i', { class: 'rail__soon', title: `Arrives in Phase ${r.phase}` }) : null);
  }

  function buildNav() {
    const list = $('#rail-list');
    routes.forEach((r) => list.append(h('li', null, link(r, 'rail__link'))));

    const bar = $('#tabbar');
    routes.filter((r) => r.tab).forEach((r) => bar.append(link(r, 'tabbar__item')));
    const more = routes.filter((r) => !r.tab);
    bar.append(h('button', {
      type: 'button', class: 'tabbar__item', 'aria-haspopup': 'dialog',
      onclick: () => {
        const api = D.util.modal({
          title: 'More', className: 'dlg--sheet',
          body: h('ul', { class: 'sheet-links' }, more.map((r) => h('li', null,
            h('a', { href: `#/${r.id}`, 'aria-current': r.id === idFromHash() ? 'page' : null, onclick: () => setTimeout(api.close, 0) },
              icon(r.icon), r.label)))),
          actions: [{ label: 'Close', kind: 'ghost' }],
        });
      },
    }, icon('three-dots'), h('span', null, 'More')));
  }

  function markCurrent(id) {
    document.querySelectorAll('[data-route]').forEach((a) => {
      if (a.dataset.route === id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  function render({ focus = false } = {}) {
    const id = idFromHash();
    const route = routes.find((r) => r.id === id);
    const view = $('#view');
    if (typeof cleanup === 'function') { try { cleanup(); } catch (e) { console.error(e); } }
    cleanup = null;
    document.body.dataset.route = id;
    markCurrent(id);
    document.title = `${route.label} · Daybook`;
    D.util.clear(view);
    const wrap = h('div', { class: `page page--${id}` });
    view.append(wrap);
    try {
      cleanup = D.pages[id].render(wrap) || null;
    } catch (err) {
      console.error(`[router] ${id} failed to render`, err);
      wrap.append(h('p', { class: 'page-error' }, 'This page could not be drawn. Your data is safe; try reloading.'));
    }
    $('#main').scrollTo({ top: 0 });
    if (focus && !first) $('#main').focus({ preventScroll: true });
    first = false;
  }

  /* Shared page heading: small label, big handwritten title, optional lede and actions. */
  D.pageHead = (eyebrow, title, lede, actions) => h('header', { class: 'page-head' },
    h('div', { class: 'page-head__text' },
      h('p', { class: 'eyebrow' }, eyebrow),
      h('h1', { class: 'page-head__title', 'aria-label': title }, D.util.ink(title, `title-${title}`)),
      lede ? h('p', { class: 'page-head__lede' }, lede) : null),
    actions ? h('div', { class: 'page-head__actions' }, actions) : null);

  D.router = {
    routes,
    start() {
      buildNav();
      window.addEventListener('hashchange', () => render({ focus: true }));
      D.store.on('reload', () => render());
      D.store.on('daychange', () => render());
      render();
    },
    render,
    go: (id) => { location.hash = `#/${id}`; },
    current: idFromHash,
  };
})(window.Daybook);
