/* intro.js — the diary cover opens onto the Today page. Once per day, skippable. */
(function (D) {
  'use strict';

  const { h } = D.util;

  function mark() {
    return h('svg:svg', { class: 'cover__mark', viewBox: '0 0 32 32', 'aria-hidden': 'true', focusable: 'false' },
      h('svg:circle', { cx: 16, cy: 16, r: 13, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, opacity: 0.55 }),
      h('svg:path', { d: 'M16 26c-6-3.5-8-9.5-4-16 1.5 3 4.5 4.5 4 9 2-1.5 4-4.5 3.5-9 4 4 4.5 11.5-3.5 16z', fill: 'currentColor' }));
  }

  function show() {
    const app = document.getElementById('app');
    const reduced = D.util.prefersReducedMotion() || !D.store.state.settings.animations;
    const skip = h('button', { type: 'button', class: 'cover__skip' }, 'Skip');
    const cover = h('div', { class: `cover${reduced ? ' is-reduced' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Opening your Daybook' },
      h('div', { class: 'cover__book' },
        h('div', { class: 'cover__page' },
          h('p', { class: 'cover__page-kicker' }, 'Today'),
          h('p', { class: 'cover__page-date' }, new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }))),
        h('div', { class: 'cover__front' },
          mark(),
          h('p', { class: 'cover__title' }, 'Daybook'),
          h('p', { class: 'cover__sub' }, 'for the quiet hours'))),
      skip);

    app.setAttribute('inert', '');
    document.body.append(cover);
    skip.focus();

    let done = false;
    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    function finish() {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      document.removeEventListener('keydown', onKey);
      cover.classList.add('is-leaving');
      app.removeAttribute('inert');
      app.classList.add('app--entering');
      document.getElementById('hud').classList.add('is-entering');
      later(() => { cover.remove(); app.classList.remove('app--entering'); document.getElementById('hud').classList.remove('is-entering'); }, reduced ? 500 : 900);
      document.getElementById('main').focus({ preventScroll: true });
    }
    function onKey(e) { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); finish(); } }
    document.addEventListener('keydown', onKey);
    skip.addEventListener('click', finish);
    cover.addEventListener('click', finish);

    if (reduced) later(finish, 1400);
    else { later(() => cover.classList.add('is-opening'), 700); later(finish, 2700); }
  }

  D.intro = {
    maybeShow() {
      const today = D.util.dateKey();
      if (D.store.state.settings.introDate === today) return;
      D.store.commit((s) => { s.settings.introDate = today; }, 'ui');
      show();
    },
  };
})(window.Daybook);
