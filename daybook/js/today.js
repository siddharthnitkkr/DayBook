/* today.js — Today: date and greeting, the day's goals, mood, and a note, in one glass diary page. */
(function (D) {
  'use strict';

  const { h, icon, dateKey } = D.util;
  const P = D.progress;

  const MOODS = [
    { v: 1, label: 'Stormy',  icon: 'cloud-lightning-rain' },
    { v: 2, label: 'Cloudy',  icon: 'cloud' },
    { v: 3, label: 'Steady',  icon: 'cloud-sun' },
    { v: 4, label: 'Bright',  icon: 'sun' },
    { v: 5, label: 'Radiant', icon: 'stars' },
  ];

  /* A hand-drawn box and pen tick; the wobble is repeatable per goal so each looks like its own. */
  function penBox(id) {
    const r = D.util.rng(D.util.hash(id));
    const j = (n, a = 1.3) => (n + (r() - 0.5) * 2 * a).toFixed(1);
    const box = `M${j(9)} ${j(10)} Q22 ${j(7)} ${j(35)} ${j(9)} Q${j(38)} 22 ${j(35)} ${j(35)} Q22 ${j(38)} ${j(9)} ${j(35)} Q${j(6)} 22 ${j(9)} ${j(10)}`;
    const box2 = `M${j(10)} ${j(9)} Q22 ${j(11)} ${j(34)} ${j(10)} Q${j(33)} 22 ${j(34)} ${j(34)}`;
    const tick = `M${j(11, 1.6)} ${j(23, 1.6)} Q${j(16)} ${j(28)} ${j(19)} ${j(33, 1.6)} Q${j(26)} ${j(18)} ${j(37, 1.6)} ${j(7, 1.6)}`;
    return h('svg:svg', { viewBox: '0 0 44 44', class: 'tick__svg', 'aria-hidden': 'true', focusable: 'false' },
      h('svg:path', { d: box, class: 'tick__box' }),
      h('svg:path', { d: box2, class: 'tick__box tick__box--echo' }),
      h('svg:path', { d: tick, class: 'tick__mark', pathLength: '1' }));
  }

  function scheduleText(habit) {
    if (habit.days.length === 7) return '';
    const names = D.util.WEEK_ORDER.filter((d) => habit.days.includes(d)).map((d) => D.util.DAY_SHORT[d]);
    return names.join(' · ');
  }
  D.scheduleText = (habit) => scheduleText(habit) || 'Every day';

  /* One way to tick or untick a goal, used by the Today page and the phone peek. */
  D.toggleGoal = function toggleGoal(id) {
    const key = dateKey();
    let nowDone = false;
    D.store.commit((st) => {
      const log = st.logs[key] || (st.logs[key] = { done: [], mood: 0, note: '' });
      const at = log.done.indexOf(id);
      if (at >= 0) log.done.splice(at, 1); else { log.done.push(id); nowDone = true; }
    });
    D.dragon.react(nowDone);
    D.store.emit('toggled', { id, done: nowDone });
    return nowDone;
  };

  function render(root) {
    const now = new Date();
    const key = dateKey(now);
    const s = () => D.store.state;
    const logOf = () => P.log(s(), key);

    /* ---------- mood ---------- */
    const greeting = h('p', { class: 'today__greeting' }, D.dragon.greeting());

    const moodButtons = MOODS.map((m) => h('button', {
      type: 'button', role: 'radio', class: 'mood', dataset: { v: m.v },
      'aria-checked': 'false', tabindex: '-1', title: m.label,
      onclick: () => setMood(m.v === logOf().mood ? 0 : m.v),
      onkeydown: (e) => moodKey(e, m.v),
    }, icon(m.icon), h('span', { class: 'mood__label' }, m.label)));
    const moodGroup = h('div', { class: 'moods', role: 'radiogroup', 'aria-labelledby': 'mood-legend' }, moodButtons);

    function paintMood() {
      const cur = logOf().mood;
      moodButtons.forEach((b) => {
        const on = Number(b.dataset.v) === cur;
        b.setAttribute('aria-checked', String(on));
        b.tabIndex = on || (!cur && b.dataset.v === '3') ? 0 : -1;
      });
    }
    function setMood(v) {
      D.store.commit((st) => { ensureLog(st).mood = v; }, 'ui');
      paintMood();
    }
    function moodKey(e, v) {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!step) return;
      e.preventDefault();
      const next = Math.min(5, Math.max(1, v + step));
      setMood(next);
      moodButtons[next - 1].focus();
    }
    function ensureLog(st) {
      return st.logs[key] || (st.logs[key] = { done: [], mood: 0, note: '' });
    }

    const noteArea = h('textarea', {
      id: 'day-note', rows: 5, maxlength: 4000, spellcheck: 'true',
      placeholder: 'A few lines before the lantern goes out…',
      'aria-label': "Today's note",
    });
    noteArea.value = logOf().note;
    const saveNote = D.util.debounce(() => {
      const text = noteArea.value;
      if (text === logOf().note) return;
      D.store.commit((st) => { ensureLog(st).note = text; }, 'ui');
    }, 600);
    noteArea.addEventListener('input', saveNote);
    const flush = () => saveNote.flush();
    window.addEventListener('pagehide', flush);

    /* ---------- head ---------- */
    const head = h('header', { class: 'today__head' },
      h('p', { class: 'eyebrow' }, 'Today'),
      h('h1', { class: 'today__day' }, D.util.ink(D.util.DAY_NAMES[now.getDay()], 'today-day')),
      h('p', { class: 'today__date' }, `${now.getDate()} ${D.util.MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`),
      greeting);

    /* ---------- goals ---------- */
    const count = h('p', { class: 'sect__count' });
    const barFill = h('span', { class: 'lightbar__fill' });
    const bar = h('div', { class: 'lightbar', role: 'img' }, barFill);
    const list = h('ul', { class: 'goals__list' });
    const resting = h('div', { class: 'goals__resting' });
    const empty = h('div', { class: 'goals__empty' },
      h('p', { class: 'goals__empty-title' }, D.util.ink('A blank page.', 'blank')),
      h('p', null, 'Write your first goal below. Something small is fine. The dragon only needs a spark.'));

    const quickInput = h('input', {
      class: 'input input--hand', type: 'text', maxlength: 80, id: 'quick-goal',
      placeholder: 'Write a new goal…', autocomplete: 'off', 'aria-label': 'New goal',
    });
    const quick = h('form', {
      class: 'goals__add', novalidate: true,
      onsubmit: (e) => {
        e.preventDefault();
        const name = quickInput.value.trim();
        if (!name) { quickInput.focus(); return; }
        D.store.commit((st) => {
          st.habits.push({ id: D.util.uid(), name, days: [0, 1, 2, 3, 4, 5, 6], why: '', createdAt: key });
        });
        quickInput.value = '';
        buildGoals();
        quickInput.focus();
      },
    }, quickInput, h('button', { type: 'submit', class: 'btn-ink btn-ink--primary' }, icon('plus-lg'), 'Add'));

    const goalsSection = h('section', { class: 'sect', 'aria-labelledby': 'goals-h' },
      h('div', { class: 'sect__head' }, h('h2', { class: 'sect__title', id: 'goals-h' }, "Today's goals"), count),
      bar, list, empty, resting, quick,
      h('p', { class: 'goals__hint' }, 'Choose weekdays or reshape goals on the ', h('a', { href: '#/habits' }, 'Habits page'), '.'));

    const moodSection = h('section', { class: 'sect', 'aria-labelledby': 'mood-legend' },
      h('div', { class: 'sect__head' }, h('h2', { class: 'sect__title', id: 'mood-legend' }, 'How does today feel?')),
      moodGroup);

    const noteSection = h('section', { class: 'sect' },
      h('div', { class: 'sect__head' }, h('label', { class: 'sect__title', for: 'day-note' }, 'Note for the page')),
      h('div', { class: 'note-field' }, noteArea));

    function goalRow(habit) {
      const check = h('button', {
        type: 'button', role: 'checkbox', class: 'tick', 'aria-checked': 'false',
        'aria-label': habit.name, onclick: () => D.toggleGoal(habit.id),
      }, penBox(habit.id));
      const name = h('span', { class: 'goal__name hand', onclick: () => check.click() }, D.util.ink(habit.name, habit.id));
      const meta = h('span', { class: 'goal__meta' });
      const row = h('li', { class: 'goal', dataset: { id: habit.id }, style: { '--tilt': `${D.util.tilt(habit.id, 1).toFixed(2)}deg` } },
        check, h('div', { class: 'goal__text' }, name, meta));
      return row;
    }

    function buildGoals() {
      const day = P.day(s(), now);
      D.util.clear(list);
      D.util.clear(resting);
      day.scheduled.forEach((hb) => list.append(goalRow(hb)));
      const off = s().habits.filter((hb) => !day.scheduled.includes(hb));
      if (off.length) {
        resting.append(
          h('p', { class: 'goals__resting-title' }, 'Resting today'),
          h('ul', { class: 'goals__resting-list' }, off.map((hb) => h('li', null, D.util.ink(hb.name, hb.id), h('small', null, ` · ${scheduleText(hb)}`)))));
      }
      empty.hidden = s().habits.length > 0;
      refresh();
    }

    /* Update ticks, streaks, counter and the greeting in place so the pen animation can play. */
    function refresh() {
      const day = P.day(s(), now);
      list.querySelectorAll('.goal').forEach((row) => {
        const hb = s().habits.find((x) => x.id === row.dataset.id);
        if (!hb) return;
        const done = day.done.includes(hb);
        row.classList.toggle('is-done', done);
        row.querySelector('.tick').setAttribute('aria-checked', String(done));
        const streak = P.streak(s(), hb, now);
        const sched = scheduleText(hb);
        row.querySelector('.goal__meta').textContent = [
          streak > 0 ? `${streak}-day streak` : 'No streak yet',
          sched,
        ].filter(Boolean).join('  ·  ');
      });
      const total = day.total;
      count.textContent = total ? `${day.done.length} of ${total} lit` : '';
      barFill.style.transform = `scaleX(${total ? day.done.length / total : 0})`;
      bar.classList.toggle('is-full', total > 0 && day.done.length === total);
      bar.setAttribute('aria-label', total ? `${day.done.length} of ${total} goals done today` : 'No goals today');
      greeting.textContent = D.dragon.greeting();
      if (s().habits.length && !total) {
        if (!list.querySelector('.goals__none')) list.append(h('li', { class: 'goals__none' }, 'Nothing is scheduled for today. Rest well.'));
      } else {
        const none = list.querySelector('.goals__none');
        if (none) none.remove();
      }
    }

    root.append(head, goalsSection, moodSection, noteSection);
    paintMood();
    buildGoals();

    const off = D.store.on('toggled', ({ id, done }) => {
      refresh();
      const row = list.querySelector(`.goal[data-id="${CSS.escape(id)}"]`);
      if (done && row) { row.classList.remove('just-done'); void row.offsetWidth; row.classList.add('just-done'); }
    });

    return () => { flush(); off(); window.removeEventListener('pagehide', flush); };
  }

  D.pages.today = { render };
})(window.Daybook);
