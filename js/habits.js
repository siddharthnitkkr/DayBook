/* habits.js — add, edit, delete goals; streaks; the monthly calendar with stamped days. */
(function (D) {
  'use strict';

  const { h, icon, dateKey } = D.util;
  const P = D.progress;

  /* ink stamp, tilted a little differently every day */
  function stamp(seedKey) {
    const tilt = D.util.tilt(seedKey, 14).toFixed(1);
    return h('svg:svg', { class: 'stamp', viewBox: '0 0 60 60', 'aria-hidden': 'true', focusable: 'false', style: { transform: `rotate(${tilt}deg)` } },
      h('svg:circle', { cx: 30, cy: 30, r: 26, class: 'stamp__ring' }),
      h('svg:circle', { cx: 30, cy: 30, r: 21, class: 'stamp__ring stamp__ring--dash' }),
      h('svg:path', { d: 'M19 31c4 1 7 4 9 9 3-11 8-18 15-23-7 3-12 8-15 15-2-3-5-4-9-1z', class: 'stamp__leaf' }));
  }

  /* ---------- add / edit dialog ---------- */
  function openForm(habit) {
    const editing = !!habit;
    const days = new Set(editing ? habit.days : [0, 1, 2, 3, 4, 5, 6]);
    const name = h('input', { class: 'input input--hand', id: 'hb-name', type: 'text', maxlength: 80, autocomplete: 'off', placeholder: 'Walk for twenty minutes', 'aria-describedby': 'hb-name-err' });
    name.value = editing ? habit.name : '';
    const err = h('p', { class: 'field__error', id: 'hb-name-err', role: 'alert' });
    const why = h('input', { class: 'input', id: 'hb-why', type: 'text', maxlength: 160, autocomplete: 'off', placeholder: 'Optional: why does this matter?' });
    why.value = editing ? habit.why : '';

    const boxes = D.util.WEEK_ORDER.map((d) => {
      const input = h('input', { type: 'checkbox', value: d, checked: days.has(d), onchange: () => { if (input.checked) days.add(d); else days.delete(d); } });
      return h('label', { class: 'chip' }, input, h('span', { 'aria-label': D.util.DAY_NAMES[d] }, D.util.DAY_SHORT[d]));
    });
    const setDays = (list) => {
      days.clear(); list.forEach((d) => days.add(d));
      boxes.forEach((b) => { const i = b.querySelector('input'); i.checked = days.has(Number(i.value)); });
    };
    const preset = (label, list) => h('button', { type: 'button', class: 'btn-ink btn-ink--ghost btn-ink--small', onclick: () => setDays(list) }, label);
    const dayErr = h('p', { class: 'field__error', role: 'alert' });

    function save(api) {
      err.textContent = ''; dayErr.textContent = '';
      name.removeAttribute('aria-invalid');
      const text = name.value.trim();
      if (!text) { err.textContent = 'Give the goal a name.'; name.setAttribute('aria-invalid', 'true'); name.focus(); return; }
      if (!days.size) { dayErr.textContent = 'Choose at least one day.'; return; }
      const chosen = [...days].sort();
      D.store.commit((st) => {
        if (editing) {
          const t = st.habits.find((x) => x.id === habit.id);
          if (t) { t.name = text; t.days = chosen; t.why = why.value.trim(); }
        } else {
          st.habits.push({ id: D.util.uid(), name: text, days: chosen, why: why.value.trim(), createdAt: dateKey() });
        }
      });
      api.close();
      D.util.toast(editing ? 'Goal updated.' : 'Goal added to the page.', 'good');
      D.router.render();
    }

    const api = D.util.modal({
      title: editing ? 'Edit goal' : 'New goal',
      onSubmit: save,
      body: [
        h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'hb-name' }, 'Goal'), name, err),
        h('div', { class: 'field' },
          h('span', { class: 'field__label', id: 'hb-days-l' }, 'Which days'),
          h('div', { class: 'chips', role: 'group', 'aria-labelledby': 'hb-days-l' }, boxes),
          h('div', { class: 'presets' },
            preset('Every day', [0, 1, 2, 3, 4, 5, 6]), preset('Weekdays', [1, 2, 3, 4, 5]), preset('Weekends', [0, 6])),
          dayErr),
        h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'hb-why' }, 'Why'), why),
      ],
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        { label: editing ? 'Save changes' : 'Add goal', kind: 'primary', submit: true },
      ],
    });
    name.focus();
  }

  async function remove(habit) {
    const ok = await D.util.confirm({
      title: 'Delete this goal?',
      text: `"${habit.name}" will be removed from your page. Days you already ticked still count toward the dragon's power.`,
      confirmLabel: 'Delete goal', danger: true,
    });
    if (!ok) return;
    D.store.commit((st) => { st.habits = st.habits.filter((x) => x.id !== habit.id); });
    D.util.toast('Goal deleted.');
    D.router.render();
  }

  /* ---------- page ---------- */
  function render(root) {
    const s = () => D.store.state;
    const today = new Date();
    let month = new Date(today.getFullYear(), today.getMonth(), 1);
    let which = 'all';

    const listPaper = h('section', { class: 'pane habits__list', 'aria-labelledby': 'goals-h' });
    const calPaper = h('section', { class: 'pane habits__cal', 'aria-labelledby': 'cal-h' });

    function drawList() {
      D.util.clear(listPaper);
      listPaper.append(h('h2', { id: 'goals-h', class: 'pane__title', 'aria-label': 'All goals' }, D.util.ink('All goals', 'all-goals')));
      if (!s().habits.length) {
        listPaper.append(h('div', { class: 'goals__empty' },
          h('p', { class: 'goals__empty-title' }, D.util.ink('Nothing written yet.', 'nothing')),
          h('p', null, 'Add a goal and choose the days it belongs to. Streaks and the calendar grow from there.')));
        return;
      }
      listPaper.append(h('ul', { class: 'hlist' }, s().habits.map((hb) => {
        const streak = P.streak(s(), hb, today);
        const best = P.bestStreak(s(), hb, today);
        const total = P.totalDoneFor(s(), hb);
        return h('li', { class: 'hrow', style: { '--tilt': `${D.util.tilt(hb.id, 1).toFixed(2)}deg` } },
          h('div', { class: 'hrow__main' },
            h('p', { class: 'hrow__name hand' }, D.util.ink(hb.name, hb.id)),
            h('p', { class: 'hrow__sched' }, D.scheduleText(hb), hb.why ? h('span', { class: 'hrow__why' }, ` — ${hb.why}`) : null),
            h('dl', { class: 'hrow__stats' },
              stat('Streak', streak), stat('Best', best), stat('Ticked', total))),
          h('div', { class: 'hrow__actions' },
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Edit ${hb.name}`, title: 'Edit', onclick: () => openForm(hb) }, icon('pencil')),
            h('button', { type: 'button', class: 'icon-btn icon-btn--danger', 'aria-label': `Delete ${hb.name}`, title: 'Delete', onclick: () => remove(hb) }, icon('trash3'))));
      })));
    }
    const stat = (label, n) => h('div', null, h('dt', null, label), h('dd', null, String(n)));

    function drawCalendar() {
      D.util.clear(calPaper);
      const picker = h('select', { class: 'input input--select', id: 'cal-which', 'aria-label': 'Goal shown on the calendar', onchange: (e) => { which = e.target.value; drawCalendar(); } },
        h('option', { value: 'all' }, 'All goals together'),
        s().habits.map((hb) => h('option', { value: hb.id, selected: hb.id === which }, hb.name)));
      picker.value = which;
      if (which !== 'all' && !s().habits.some((x) => x.id === which)) { which = 'all'; picker.value = 'all'; }

      const nav = (delta, label, ic) => h('button', {
        type: 'button', class: 'icon-btn', 'aria-label': label,
        onclick: () => { month = new Date(month.getFullYear(), month.getMonth() + delta, 1); drawCalendar(); },
      }, icon(ic));

      calPaper.append(
        h('div', { class: 'cal__head' },
          h('h2', { id: 'cal-h', class: 'pane__title' }, `${D.util.MONTH_NAMES[month.getMonth()]} ${month.getFullYear()}`),
          h('div', { class: 'cal__nav' }, nav(-1, 'Previous month', 'chevron-left'), nav(1, 'Next month', 'chevron-right'))),
        h('div', { class: 'field cal__pick' }, h('label', { class: 'field__label', for: 'cal-which' }, 'Show'), picker),
        buildTable(),
        h('p', { class: 'cal__legend' },
          h('span', { class: 'cal__key' }, h('span', { class: 'cal__key-stamp' }, stamp('legend')), 'all done'),
          h('span', { class: 'cal__key' }, h('span', { class: 'cal__key-dot' }), 'some done')));
    }

    function buildTable() {
      const first = month;
      const lead = (first.getDay() + 6) % 7; // Monday-first
      const dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
      const todayKey = dateKey(today);
      const cells = [];
      for (let i = 0; i < lead; i++) cells.push(h('td', { class: 'cal__cell cal__cell--blank' }));
      for (let d = 1; d <= dim; d++) {
        const date = new Date(first.getFullYear(), first.getMonth(), d);
        const key = dateKey(date);
        const future = key > todayKey;
        let mark = null; let label = '';
        if (which === 'all') {
          const info = P.day(s(), date);
          if (info.total) {
            label = `${info.done.length} of ${info.total} goals`;
            if (info.done.length === info.total) mark = stamp(key);
            else if (info.done.length) mark = h('span', { class: 'cal__dot', 'aria-hidden': 'true' }, `${info.done.length}/${info.total}`);
          }
        } else {
          const hb = s().habits.find((x) => x.id === which);
          if (hb && P.isScheduled(hb, date)) {
            const done = P.isDone(s(), hb, key);
            label = done ? 'done' : 'not done';
            if (done) mark = stamp(key + hb.id);
          }
        }
        cells.push(h('td', {
          class: `cal__cell${key === todayKey ? ' is-today' : ''}${future ? ' is-future' : ''}`,
          'aria-label': `${d} ${D.util.MONTH_NAMES[date.getMonth()]}${label ? `: ${label}` : ''}`,
        }, h('span', { class: 'cal__num', 'aria-hidden': 'true' }, String(d)), mark));
      }
      while (cells.length % 7) cells.push(h('td', { class: 'cal__cell cal__cell--blank' }));
      const rows = [];
      for (let i = 0; i < cells.length; i += 7) rows.push(h('tr', null, cells.slice(i, i + 7)));
      return h('table', { class: 'cal' },
        h('thead', null, h('tr', null, D.util.WEEK_ORDER.map((d) => h('th', { scope: 'col', abbr: D.util.DAY_NAMES[d] }, D.util.DAY_SHORT[d].slice(0, 2))))),
        h('tbody', null, rows));
    }

    drawList();
    drawCalendar();
    root.append(
      D.pageHead('Habits', 'Goals & habits', 'What you want to do, and on which days. Each tick feeds the dragon.',
        h('button', { type: 'button', class: 'btn-ink btn-ink--primary', onclick: () => openForm(null) }, icon('plus-lg'), 'New goal')),
      listPaper, calPaper);
  }

  D.pages.habits = { render };
})(window.Daybook);
