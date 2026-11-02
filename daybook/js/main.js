/* main.js — boots the app, owns the backup reminder, the day-change check and the animations switch. */
(function (D) {
  'use strict';

  const { h, icon, $, dateKey } = D.util;

  function applyAnimationClass(on) { document.body.classList.toggle('no-anim', !on); }

  D.app = {
    /* Glass clarity from Settings: 0 frosted ... 1 crystal. The CSS derives tint, blur and backings from it. */
    applyGlass(c) { document.documentElement.style.setProperty('--clarity', String(Math.min(1, Math.max(0, c)))); },
    setGlass(c) {
      this.applyGlass(c);
      D.util.debounce(() => D.store.commit((s) => { s.settings.glassClarity = c; }, 'ui'), 300)();
    },
    setAnimations(on) {
      D.store.commit((s) => { s.settings.animations = on; }, 'ui');
      applyAnimationClass(on);
      D.dragon.setAnimations(on);
      D.fireflies.setEnabled(on);
    },
  };

  /* ---------- backup reminder ---------- */
  function daysBetween(a, b) { return Math.floor((D.util.parseKey(b) - D.util.parseKey(a)) / 86400000); }

  function paintBanner() {
    const host = $('#banner');
    D.util.clear(host);
    const st = D.store.state;
    const f = D.store.file;
    const today = dateKey();
    if (st.meta.bannerSnooze === today) return;

    let text = '';
    let primary = null;
    if (f.handle && f.permission !== 'granted') {
      text = `Daybook needs your OK to keep writing into ${f.name}.`;
      primary = { label: 'Allow access', run: () => D.store.reconnectFile().then((ok) => { if (ok) D.util.toast('File access restored and saved.', 'good'); }) };
    } else if (D.store.hasContent()) {
      const age = D.store.backupAgeDays();
      const sinceStart = daysBetween(st.createdAt, today);
      if (age == null && sinceStart >= 7) text = 'You have not saved a backup yet. Your diary only lives in this browser.';
      else if (age != null && age >= 7) text = `Your last backup was ${age} days ago. Save a fresh copy to keep your diary safe.`;
      if (text) primary = { label: 'Save now', run: () => D.store.saveToFile().then((r) => D.util.toast(r.where === 'linked' ? `Saved into ${r.name}.` : `Downloaded ${r.name}.`, 'good')) };
    }
    if (!text) return;

    host.append(h('div', { class: 'banner', role: 'region', 'aria-label': 'Backup reminder' },
      icon('shield-exclamation'),
      h('p', { class: 'banner__text' }, text),
      h('div', { class: 'banner__actions' },
        h('button', { type: 'button', class: 'btn-ink btn-ink--primary btn-ink--small', onclick: () => primary.run().catch((e) => D.util.toast(e.message || 'Could not save.', 'error')) }, primary.label),
        h('button', { type: 'button', class: 'btn-ink btn-ink--ghost btn-ink--small', onclick: () => { D.store.commit((s) => { s.meta.bannerSnooze = today; }, 'ui'); paintBanner(); } }, 'Remind me tomorrow'))));
  }

  /* ---------- phone sheet: drag the handle, or tap it, between peek / half / full ---------- */
  const STATES = ['peek', 'half', 'full'];

  function wireSheet() {
    const diary = $('#diary');
    const handle = $('#sheet-handle');
    const heights = {};
    const measure = () => {          // read the real height of each state once, so dragging can snap to them
      const keep = diary.dataset.sheet;
      diary.classList.add('is-dragging');
      STATES.forEach((s) => { diary.dataset.sheet = s; heights[s] = diary.offsetHeight; });
      diary.dataset.sheet = keep;
      void diary.offsetHeight;
      diary.classList.remove('is-dragging');
    };
    const phone = window.matchMedia('(max-width: 599.98px)');
    const next = (s, d) => STATES[Math.max(0, Math.min(2, STATES.indexOf(s) + d))];
    const set = (s) => { diary.dataset.sheet = s; };

    let startY = null; let startH = 0; let lastY = 0; let lastT = 0; let vel = 0; let moved = false;
    handle.addEventListener('pointerdown', (e) => {
      if (!phone.matches) return;
      measure();
      startY = e.clientY; lastY = e.clientY; lastT = e.timeStamp; vel = 0; moved = false; startH = diary.offsetHeight;
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', (e) => {
      if (startY == null) return;
      const dy = e.clientY - startY;
      if (Math.abs(dy) > 6) { moved = true; diary.classList.add('is-dragging'); }
      if (!moved) return;
      diary.style.height = `${Math.max(heights.peek, Math.min(heights.full, startH - dy))}px`;
      const dt = e.timeStamp - lastT;
      if (dt > 0) vel = (lastY - e.clientY) / dt;          // px per ms, positive = upwards
      lastY = e.clientY; lastT = e.timeStamp;
    });
    const release = (e) => {
      if (startY == null) return;
      startY = null;
      diary.classList.remove('is-dragging');
      if (!moved) { diary.style.height = ''; set(STATES[(STATES.indexOf(diary.dataset.sheet) + 1) % 3]); return; }
      const projected = diary.offsetHeight + vel * 220;      // a flick carries it to the next state
      let best = 'half';
      let gap = Infinity;
      STATES.forEach((s) => { const g = Math.abs(heights[s] - projected); if (g < gap) { gap = g; best = s; } });
      diary.style.height = '';
      set(best);
    };
    handle.addEventListener('pointerup', release);
    handle.addEventListener('pointercancel', release);
    handle.addEventListener('click', (e) => { if (e.detail === 0) set(STATES[(STATES.indexOf(diary.dataset.sheet) + 1) % 3]); });   // keyboard
    $('#peek').addEventListener('click', (e) => { if (!e.target.closest('.peek__tick')) set('half'); });
  }

  /* The peek: how many goals are lit and the next one waiting, with a one-tap tick. */
  function paintPeek() {
    const host = $('#peek');
    D.util.clear(host);
    const s = D.store.state;
    const day = D.progress.day(s, new Date());
    const next = day.scheduled.find((hb) => !day.done.includes(hb));
    const count = day.total ? `${day.done.length}/${day.total}` : '–';
    let label = 'Next goal';
    let text;
    if (!s.habits.length) { label = 'Today'; text = 'Plant your first goal'; }
    else if (!day.total) { label = 'Today'; text = 'Nothing scheduled. Rest well.'; }
    else if (!next) { label = 'Today'; text = 'Every goal is lit'; }
    else text = next.name;
    host.append(h('div', { class: 'peek__row' },
      h('span', { class: 'peek__count', 'aria-label': day.total ? `${day.done.length} of ${day.total} goals done` : 'No goals today' }, count),
      h('div', { class: 'peek__text' }, h('span', { class: 'peek__label' }, label), h('span', { class: 'peek__goal' }, D.util.ink(text, next ? next.id : 'peek'))),
      next ? h('button', { type: 'button', class: 'peek__tick', 'aria-label': `Mark "${next.name}" done`, onclick: () => D.toggleGoal(next.id) }, icon('check2')) : null));
  }

  /* ---------- hover light on buttons ---------- */
  function wireHoverLight() {
    document.addEventListener('pointermove', (e) => {
      const b = e.target.closest && e.target.closest('.btn-ink');
      if (!b) return;
      const r = b.getBoundingClientRect();
      b.style.setProperty('--mx', `${e.clientX - r.left}px`);
      b.style.setProperty('--my', `${e.clientY - r.top}px`);
    }, { passive: true });
  }

  /* ---------- a new day starts while the tab is open ---------- */
  function watchMidnight() {
    let day = dateKey();
    const check = () => { const now = dateKey(); if (now !== day) { day = now; D.store.emit('daychange'); } };
    setInterval(check, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  }

  function boot() {
    D.store.init();
    const anim = D.store.state.settings.animations;
    applyAnimationClass(anim);
    D.app.applyGlass(D.store.state.settings.glassClarity);

    D.store.on('error', (msg) => D.util.toast(msg, 'error'));
    D.store.on('reload', () => D.app.applyGlass(D.store.state.settings.glassClarity));
    D.router.start();
    D.dragon.mount($('#world'), $('#hud'));
    wireSheet();
    paintPeek();
    D.store.on('change', paintPeek);
    D.store.on('reload', paintPeek);
    D.store.on('daychange', paintPeek);
    D.fireflies.init(anim);
    wireHoverLight();
    watchMidnight();
    D.alerts.start();

    paintBanner();
    D.store.on('file', paintBanner);
    D.store.on('reload', paintBanner);
    D.store.on('daychange', paintBanner);
    D.store.on('change', (e) => { if (e.source === 'backup') paintBanner(); });

    D.intro.maybeShow();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.Daybook);
