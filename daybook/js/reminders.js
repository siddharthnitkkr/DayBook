/* reminders.js — the Alerts page: reminders with a date, time and repeat, in Today, Upcoming and Done sections,
   with snooze, edit and delete. Goal nudges are set up in Settings. The engine is in alerts.js. */
(function (D) {
  'use strict';

  const { h, icon, dateKey, pad } = D.util;
  const A = () => D.alerts;
  const REPEAT_LABEL = { once: 'Once', daily: 'Every day', weekly: 'Every week', days: 'Chosen weekdays' };

  const niceWhen = (key) => {
    const d = new Date(`${key}:00`);
    const day = dateKey(d);
    const today = dateKey();
    const tomorrow = dateKey(D.util.addDays(new Date(), 1));
    const label = day === today ? 'Today' : day === tomorrow ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    return `${label} ${key.slice(11)}`;
  };

  function render(root) {
    const st = () => D.store.state;

    /* ---------- the sections ---------- */
    function classify() {
      const now = new Date();
      const todayKey = dateKey(now);
      const out = { today: [], upcoming: [], done: [] };
      st().reminders.forEach((r) => {
        if (r.done) { out.done.push({ r, key: `${r.date}T${r.time}` }); return; }
        const next = A().nextInstance(r, now);
        const overdue = r.repeat === 'once' && `${r.date}T${r.time}` <= `${todayKey}T23:59` && !next;
        if (overdue) { out.today.push({ r, key: `${r.date}T${r.time}`, overdue: true }); return; }
        if (!next) return;
        (next.slice(0, 10) === todayKey ? out.today : out.upcoming).push({ r, key: next });
      });
      out.today.sort((a, b) => a.key.localeCompare(b.key));
      out.upcoming.sort((a, b) => a.key.localeCompare(b.key));
      out.done.sort((a, b) => b.key.localeCompare(a.key));
      return out;
    }

    const sections = h('div', { class: 'asections' });
    function row({ r, key, overdue }) {
      const snoozed = r.snoozedUntil && Date.parse(r.snoozedUntil) > Date.now();
      return h('li', { class: `arow${r.done ? ' is-done' : ''}${overdue ? ' is-overdue' : ''}` },
        h('span', { class: 'arow__time' }, r.time),
        h('span', { class: 'arow__text' },
          h('span', { class: 'arow__title hand' }, D.util.ink(r.title, r.id)),
          h('span', { class: 'arow__meta' },
            [REPEAT_LABEL[r.repeat] === 'Chosen weekdays' ? A().describe(r) : REPEAT_LABEL[r.repeat],
              r.done ? 'done' : overdue ? 'overdue' : `next ${niceWhen(key)}`, snoozed ? `snoozed until ${new Date(r.snoozedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '']
              .filter(Boolean).join(' · '))),
        h('span', { class: 'arow__actions' },
          r.repeat === 'once' ? h('button', { type: 'button', class: `icon-btn${r.done ? ' is-on' : ''}`, 'aria-pressed': String(r.done), 'aria-label': r.done ? `Mark ${r.title} not done` : `Mark ${r.title} done`, title: 'Done', onclick: () => { D.store.commit((s) => { const t = s.reminders.find((x) => x.id === r.id); t.done = !t.done; t.doneAt = t.done ? new Date().toISOString() : ''; }); draw(); } }, icon('check2')) : null,
          r.done ? null : h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Snooze ${r.title}`, title: 'Snooze', onclick: () => snoozeMenu(r) }, icon('alarm')),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Edit ${r.title}`, title: 'Edit', onclick: () => edit(r) }, icon('pencil')),
          h('button', { type: 'button', class: 'icon-btn icon-btn--danger', 'aria-label': `Delete ${r.title}`, title: 'Delete', onclick: () => remove(r) }, icon('trash3'))));
    }

    function draw() {
      D.util.clear(sections);
      const c = classify();
      const total = c.today.length + c.upcoming.length + c.done.length;
      if (!total) {
        sections.append(h('div', { class: 'empty' },
          h('p', { class: 'empty__title' }, D.util.ink("No alerts yet. What shouldn't you forget?", 'alerts-empty')),
          h('p', null, 'Tap New reminder, set a time, and Daybook will nudge you while it is open.')));
        return;
      }
      [['today', 'Today', c.today], ['upcoming', 'Upcoming', c.upcoming], ['done', 'Done', c.done]].forEach(([id, name, items]) => {
        if (!items.length) return;
        sections.append(h('section', { class: 'asection', 'aria-label': name },
          h('h2', { class: 'lgroup__title' }, name, h('span', null, String(items.length))),
          h('ul', { class: 'arows' }, items.map(row))));
      });
    }

    function snoozeMenu(r) {
      const choices = [['10 minutes', 10], ['1 hour', 60], ['This evening', Math.max(15, (19 * 60 - (new Date().getHours() * 60 + new Date().getMinutes())))], ['Tomorrow morning', Math.round((new Date(`${dateKey(D.util.addDays(new Date(), 1))}T09:00:00`) - Date.now()) / 60000)]];
      const api = D.util.modal({
        title: 'Snooze until…', className: 'dlg--sheet',
        body: h('ul', { class: 'sheet-links' }, choices.map(([t, m]) => h('li', null, h('a', { href: '#', onclick: (e) => { e.preventDefault(); A().snooze(r.id, m); api.close(); draw(); D.util.toast(`Snoozed for ${t.toLowerCase()}.`, 'good'); } }, icon('alarm'), t)))),
        actions: [{ label: 'Cancel', kind: 'ghost' }],
      });
    }

    async function remove(r) {
      const ok = await D.util.confirm({ title: 'Delete this reminder?', text: `"${r.title}" will be removed.`, confirmLabel: 'Delete', danger: true });
      if (!ok) return;
      D.store.commit((s) => { s.reminders = s.reminders.filter((x) => x.id !== r.id); });
      draw(); D.util.toast('Reminder deleted.');
    }

    /* ---------- add / edit ---------- */
    function edit(entry) {
      const isNew = !entry;
      const soon = new Date(Date.now() + 3600000);
      const base = entry || { id: D.util.uid(), title: '', note: '', date: dateKey(soon), time: `${pad(soon.getHours())}:00`, repeat: 'once', days: [], done: false, doneAt: '', snoozedUntil: '', lastFiredKey: '', createdAt: new Date().toISOString() };
      const days = new Set(base.days);
      const title = h('input', { class: 'input input--hand', id: 'rm-title', type: 'text', maxlength: 100, value: base.title, placeholder: 'What should I remind you of?', autocomplete: 'off' });
      const err = h('p', { class: 'field__error', role: 'alert' });
      const date = h('input', { class: 'input', id: 'rm-date', type: 'date', value: base.date });
      const time = h('input', { class: 'input', id: 'rm-time', type: 'time', value: base.time });
      const repeat = h('select', { class: 'input input--select', id: 'rm-repeat', onchange: () => paintDays() }, Object.entries(REPEAT_LABEL).map(([v, t]) => h('option', { value: v, selected: v === base.repeat }, t)));
      const note = h('input', { class: 'input input--hand', id: 'rm-note', type: 'text', maxlength: 300, value: base.note, placeholder: 'A note (optional)', autocomplete: 'off' });
      const boxes = D.util.WEEK_ORDER.map((d) => {
        const input = h('input', { type: 'checkbox', value: d, checked: days.has(d), onchange: () => { if (input.checked) days.add(d); else days.delete(d); } });
        return h('label', { class: 'chip' }, input, h('span', { 'aria-label': D.util.DAY_NAMES[d] }, D.util.DAY_SHORT[d]));
      });
      const dayBox = h('div', { class: 'field' }, h('span', { class: 'field__label', id: 'rm-days-l' }, 'Which weekdays'), h('div', { class: 'chips', role: 'group', 'aria-labelledby': 'rm-days-l' }, boxes));
      const paintDays = () => { dayBox.hidden = repeat.value !== 'days'; };
      paintDays();

      const api = D.util.modal({
        title: isNew ? 'New reminder' : 'Edit reminder', className: 'dlg--wide',
        onSubmit: () => {
          err.textContent = '';
          const t = title.value.trim();
          if (!t) { err.textContent = 'Give the reminder a title.'; title.focus(); return; }
          if (!date.value || !time.value) { err.textContent = 'Choose a date and a time.'; return; }
          if (repeat.value === 'days' && !days.size) { err.textContent = 'Choose at least one weekday.'; return; }
          const next = { ...base, title: t, note: note.value.trim(), date: date.value, time: time.value, repeat: repeat.value, days: [...days].sort(), done: false, doneAt: '', snoozedUntil: '' };
          if (isNew || next.date !== base.date || next.time !== base.time || next.repeat !== base.repeat) next.lastFiredKey = '';
          D.store.commit((s) => { const i = s.reminders.findIndex((x) => x.id === next.id); if (i >= 0) s.reminders[i] = next; else s.reminders.push(next); });
          api.close(); draw(); D.util.toast(isNew ? 'Reminder set.' : 'Updated.', 'good');
          A().check();
        },
        body: [
          h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'rm-title' }, 'Title'), D.voice.field(title), err),
          h('div', { class: 'row3' },
            h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'rm-date' }, 'Date'), date),
            h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'rm-time' }, 'Time'), time),
            h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'rm-repeat' }, 'Repeat'), repeat)),
          dayBox,
          h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'rm-note' }, 'Note'), D.voice.field(note)),
        ],
        actions: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Save', kind: 'primary', submit: true }],
      });
      title.focus();
    }

    /* ---------- notifications and the honest note ---------- */
    const permLine = h('p', { class: 'set__line', role: 'status' });
    const permBtn = h('button', { type: 'button', class: 'btn-ink btn-ink--ghost btn-ink--small', onclick: async () => { await A().requestPermission(); paintPerm(); } }, icon('bell'), 'Allow notifications');
    function paintPerm() {
      const p = A().permission();
      permBtn.hidden = p !== 'default';
      permLine.textContent = p === 'granted' ? 'Browser notifications are on.' : p === 'denied' ? 'Browser notifications are blocked for this site. In-app alerts still work.' : p === 'unsupported' ? 'This browser has no notifications. In-app alerts still work.' : 'Browser notifications are off until you allow them.';
    }
    const nu = st().settings.nudges;
    const nudgeLine = h('p', { class: 'set__line' }, nu.on && nu.times.length ? `Goal nudges are on at ${nu.times.join(' and ')}. ` : 'Goal nudges are off. ', h('a', { href: '#/settings' }, 'Change them in Settings'), '.');

    root.append(
      D.pageHead('Alerts', 'Alerts', null, [
        h('button', { type: 'button', class: 'btn-ink btn-ink--primary btn-ink--small', onclick: () => edit(null) }, icon('plus-lg'), 'New reminder'),
        h('button', { type: 'button', class: 'btn-ink btn-ink--ghost btn-ink--small', onclick: () => { A().testAlert(); paintPerm(); } }, icon('bell-fill'), 'Send test alert'),
        permBtn,
      ]),
      permLine, nudgeLine,
      sections,
      h('p', { class: 'honest' }, icon('info-circle'), 'Reminders fire reliably only while Daybook is open or was open recently: this is a web page, so nothing can run once it is fully closed. When you come back, anything missed in the last day is caught up. On iPhone, notifications need Daybook added to your Home Screen first.'));
    paintPerm();
    draw();
    const off = D.store.on('alerts', draw);
    const tick = setInterval(draw, 60000);
    return () => { off(); clearInterval(tick); };
  }

  D.pages.reminders = { render };
})(window.Daybook);
