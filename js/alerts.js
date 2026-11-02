/* alerts.js — the reminder engine: reminders (once, daily, weekly, chosen weekdays) and goal nudges.
   Every 30 seconds while the app is open, and again whenever the tab becomes visible, it checks what is due and
   catches up on anything missed in the last day. Delivery: an in-app alert card with a gentle chime, plus a browser
   notification when permission was granted. Honest limit: nothing can fire while the app is fully closed. */
(function (D) {
  'use strict';

  const { h, icon, dateKey, pad } = D.util;
  const P = D.progress;
  const DAY_MS = 86400000;
  let host = null;
  let busy = false;
  let audio = null;

  const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const keyOf = (d) => `${dateKey(d)}T${hm(d)}`;
  const toMinutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const fromKey = (k) => new Date(`${k}:00`);

  /* ---------- when is a reminder due ---------- */
  /* the latest moment this reminder was due at or before `now`, as "YYYY-MM-DDTHH:MM", or null */
  function latestInstance(r, now = new Date()) {
    const nowKey = keyOf(now);
    const startKey = `${r.date}T${r.time}`;
    if (r.repeat === 'once') return startKey <= nowKey ? startKey : null;
    for (let i = 0; i < 8; i++) {
      const d = D.util.addDays(now, -i);
      const cand = `${dateKey(d)}T${r.time}`;
      if (cand > nowKey || cand < startKey) { if (cand < startKey) return null; continue; }
      if (r.repeat === 'daily') return cand;
      if (r.repeat === 'weekly' && d.getDay() === D.util.parseKey(r.date).getDay()) return cand;
      if (r.repeat === 'days' && r.days.includes(d.getDay())) return cand;
    }
    return null;
  }

  /* the next moment after now */
  function nextInstance(r, now = new Date()) {
    const nowKey = keyOf(now);
    const startKey = `${r.date}T${r.time}`;
    if (r.repeat === 'once') return startKey > nowKey ? startKey : null;
    for (let i = 0; i < 9; i++) {
      const d = D.util.addDays(now, i);
      const cand = `${dateKey(d)}T${r.time}`;
      if (cand <= nowKey || cand < startKey) continue;
      if (r.repeat === 'daily') return cand;
      if (r.repeat === 'weekly' && d.getDay() === D.util.parseKey(r.date).getDay()) return cand;
      if (r.repeat === 'days' && r.days.includes(d.getDay())) return cand;
    }
    return null;
  }

  function describe(r) {
    if (r.repeat === 'once') return 'Once';
    if (r.repeat === 'daily') return 'Every day';
    if (r.repeat === 'weekly') return `Every ${D.util.DAY_NAMES[D.util.parseKey(r.date).getDay()]}`;
    return D.util.WEEK_ORDER.filter((d) => r.days.includes(d)).map((d) => D.util.DAY_SHORT[d]).join(' · ');
  }

  /* ---------- delivery ---------- */
  function chime() {
    if (!D.store.state.settings.chime) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const t = audio.currentTime;
      [[659.25, 0], [987.77, 0.17]].forEach(([f, d]) => {
        const o = audio.createOscillator();
        const g = audio.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + d);
        g.gain.linearRampToValueAtTime(0.13, t + d + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + 1.1);
        o.connect(g); g.connect(audio.destination);
        o.start(t + d); o.stop(t + d + 1.2);
      });
    } catch (e) { /* no audio here: the card still shows */ }
  }

  const permission = () => ('Notification' in window ? Notification.permission : 'unsupported');
  async function requestPermission() {
    if (!('Notification' in window)) return 'unsupported';
    let p;
    try { p = await Notification.requestPermission(); } catch (e) { p = Notification.permission; }
    D.store.commit((s) => { s.settings.nudges.notify = p === 'granted'; }, 'ui');
    return p;
  }
  /* browser notifications need the browser's permission and Daybook's own switch (Settings); the test alert ignores the switch */
  function notify(title, body, tag, force) {
    if (permission() !== 'granted' || !(force || D.store.state.settings.nudges.notify)) return;
    try { const n = new Notification(title, { body, tag, silent: false }); n.onclick = () => { window.focus(); n.close(); }; } catch (e) { /* some browsers only allow it from a service worker */ }
  }

  function card({ title, body, actions }) {
    if (!host) {
      host = h('div', { class: 'alerts', role: 'region', 'aria-label': 'Alerts', 'aria-live': 'assertive' });
      if (host.showPopover) host.setAttribute('popover', 'manual');       // the top layer, so a card still shows above an open dialog
      document.body.append(host);
    }
    const el = h('div', { class: 'acard glass', role: 'alert' },
      h('div', { class: 'acard__head' }, icon('bell-fill'), h('p', { class: 'acard__title' }, title),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Dismiss', onclick: () => el.remove() }, icon('x-lg'))),
      body ? h('p', { class: 'acard__body' }, body) : null,
      actions && actions.length ? h('div', { class: 'acard__actions' }, actions.map((a) => h('button', {
        type: 'button', class: `btn-ink btn-ink--small btn-ink--${a.kind || 'ghost'}`, onclick: () => { el.remove(); if (a.run) a.run(); },
      }, a.label))) : null);
    host.append(el);
    while (host.children.length > 4) host.firstChild.remove();
    if (host.showPopover) { try { if (host.matches(':popover-open')) host.hidePopover(); host.showPopover(); } catch (e) { /* the card is still in the page */ } }
    return el;
  }

  /* one alert: in-app card, chime, and a notification when the tab is not in front (or when forced, for the test) */
  function deliver({ title, body, actions, tag, force }) {
    card({ title, body, actions });
    chime();
    if (force || document.hidden || !document.hasFocus()) notify(title, body, tag, force);
  }

  function snooze(id, minutes) {
    D.store.commit((s) => { const r = s.reminders.find((x) => x.id === id); if (r) r.snoozedUntil = new Date(Date.now() + minutes * 60000).toISOString(); }, 'ui');
  }
  function complete(id) {
    D.store.commit((s) => { const r = s.reminders.find((x) => x.id === id); if (r && r.repeat === 'once') { r.done = true; r.doneAt = new Date().toISOString(); } }, 'ui');
  }

  function fireReminder(r, why) {
    deliver({
      title: r.title, tag: `rem-${r.id}`,
      body: [why === 'snoozed' ? 'Snoozed reminder' : '', r.note].filter(Boolean).join(' · '),
      actions: [
        { label: r.repeat === 'once' ? 'Done' : 'Got it', kind: 'primary', run: () => complete(r.id) },
        { label: 'Snooze 10 min', run: () => snooze(r.id, 10) },
      ],
    });
  }

  function fireNudge(open) {
    const names = open.slice(0, 5).map((x) => x.name);
    const more = open.length - names.length;
    deliver({
      title: open.length === 1 ? 'One goal still waiting' : `${open.length} goals still waiting`,
      body: `${names.join(', ')}${more > 0 ? ` and ${more} more` : ''}`, tag: 'goal-nudge',
      actions: [{ label: 'Open Today', kind: 'primary', run: () => { location.hash = '#/today'; } }, { label: 'Later' }],
    });
  }

  /* ---------- the check ---------- */
  function check() {
    if (busy || !D.store.state) return;
    busy = true;
    try {
      const now = new Date();
      const nowKey = keyOf(now);
      const fired = [];
      D.store.state.reminders.forEach((r) => {
        if (r.done) return;
        if (r.snoozedUntil) {
          if (Date.parse(r.snoozedUntil) <= now.getTime()) fired.push({ r, why: 'snoozed', clear: true });
          return;
        }
        const inst = latestInstance(r, now);
        if (!inst || inst <= r.lastFiredKey) return;
        const recent = now.getTime() - fromKey(inst).getTime() <= DAY_MS;      // catch up on what was missed in the last day
        if (r.repeat === 'once' || recent) fired.push({ r, why: 'due', inst });
        else fired.push({ r, why: 'skip', inst });
      });

      /* goal nudges: at the times from Settings, listing the goals still unticked; never when all are done */
      const nu = D.store.state.settings.nudges;
      const todayKey = dateKey(now);
      const log = D.store.state.nudgeLog[todayKey] || [];
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const dueNudges = nu.on ? nu.times.filter((t) => toMinutes(t) <= nowMin && nowMin - toMinutes(t) <= 180 && !log.includes(t)) : [];

      if (fired.length || dueNudges.length) {
        D.store.commit((s) => {
          fired.forEach(({ r, clear, inst }) => {
            const t = s.reminders.find((x) => x.id === r.id);
            if (!t) return;
            if (clear) t.snoozedUntil = ''; else t.lastFiredKey = inst;
          });
          if (dueNudges.length) {
            s.nudgeLog[todayKey] = [...(s.nudgeLog[todayKey] || []), ...dueNudges];
            Object.keys(s.nudgeLog).sort().slice(0, -30).forEach((k) => delete s.nudgeLog[k]);
          }
        }, 'ui');
        fired.filter((f) => f.why !== 'skip').forEach(({ r, why }) => fireReminder(r, why));
        if (dueNudges.length) {
          const open = P.day(D.store.state, now).scheduled.filter((hb) => !P.day(D.store.state, now).done.includes(hb));
          if (open.length) fireNudge(open);                      // all done: logged quietly, nothing shown
        }
        D.store.emit('alerts');
      }
    } finally { busy = false; }
  }

  function testAlert() {
    deliver({
      title: 'Test alert', body: 'If you can see and hear this, alerts work while Daybook is open.', tag: 'test', force: true,
      actions: [{ label: 'Nice', kind: 'primary' }],
    });
    return permission();
  }

  function start() {
    setInterval(check, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    window.addEventListener('focus', check);
    setTimeout(check, 1500);                                    // catch up right after opening
  }

  D.alerts = { start, check, testAlert, requestPermission, permission, latestInstance, nextInstance, describe, snooze, complete };
})(window.Daybook);
