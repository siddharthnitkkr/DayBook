/* insights.js — a month (or a week) at a glance: a glowing calendar heat map, completion, streaks, goal by goal consistency,
   mood trend, counts, a comparison with the month before, and a few badges. Charts are plain SVG in the gold and light-green palette. */
(function (D) {
  'use strict';

  const { h, icon, dateKey, addDays } = D.util;
  const P = D.progress;
  const S = (tag, attrs, ...kids) => h(`svg:${tag}`, attrs, ...kids);
  const MOOD_NAMES = ['', 'Stormy', 'Cloudy', 'Steady', 'Bright', 'Radiant'];
  const monthName = (d) => D.util.MONTH_NAMES[d.getMonth()];

  /* ---------- the numbers ---------- */
  function range(startDate, count, st, today) {
    const todayKey = dateKey(today);
    return Array.from({ length: count }, (_, i) => {
      const date = addDays(startDate, i);
      const key = dateKey(date);
      const info = P.day(st, date);
      return { date, key, d: date.getDate(), future: key > todayKey, total: info.total, done: info.done.length, pct: info.pct, mood: P.log(st, key).mood };
    });
  }
  const summarise = (days) => {
    const live = days.filter((x) => !x.future);
    const sched = live.reduce((n, x) => n + x.total, 0);
    const done = live.reduce((n, x) => n + x.done, 0);
    return { sched, done, pct: sched ? Math.round((done / sched) * 100) : null, live };
  };
  const completeDay = (x) => x.total > 0 && x.done === x.total;

  /* the longest run of days with every goal done; days with nothing scheduled neither count nor break it */
  function bestRun(days) {
    let cur = 0; let best = 0;
    days.filter((x) => !x.future && x.total > 0).forEach((x) => { if (completeDay(x)) { cur += 1; best = Math.max(best, cur); } else cur = 0; });
    return best;
  }
  function currentRun(st, today) {
    let n = 0;
    for (let i = 0; i < 1200; i++) {
      const d = addDays(today, -i);
      const info = P.day(st, d);
      if (!info.total) continue;
      if (info.done.length === info.total) n += 1; else if (i === 0) continue; else break;
    }
    return n;
  }

  function monthModel(first, st, today) {
    const dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const days = range(first, dim, st, today);
    const sum = summarise(days);
    const inMonth = (iso) => typeof iso === 'string' && iso.slice(0, 7) === dateKey(first).slice(0, 7);
    const goals = st.habits.map((hb) => {
      const sched = days.filter((x) => !x.future && P.isScheduled(hb, x.date));
      const done = sched.filter((x) => P.isDone(st, hb, x.key));
      return { hb, sched: sched.length, done: done.length, pct: sched.length ? Math.round((done.length / sched.length) * 100) : null };
    }).filter((g) => g.sched > 0);
    return {
      days, ...sum, best: bestRun(days), goals,
      moods: days.filter((x) => x.mood > 0),
      likes: st.likes.filter((e) => inMonth(e.createdAt)).length,
      visited: st.places.filter((p) => p.visitedAt && p.visitedAt.slice(0, 7) === dateKey(first).slice(0, 7)).length,
      notes: st.notes.filter((n) => inMonth(n.createdAt)).length,
    };
  }

  function compare(cur, prev, label) {
    if (cur.pct == null) return '';
    if (prev.pct == null) return `Nothing to compare with ${label} yet.`;
    const diff = cur.pct - prev.pct;
    if (diff === 0) return `The same as ${label}: ${cur.pct} percent.`;
    return `${diff > 0 ? 'Up' : 'Down'} ${Math.abs(diff)} percent from ${label}.`;
  }

  const BADGES = [
    { id: 'streak7', name: '7-day streak', ic: 'fire', ok: (m) => m.best >= 7, hint: 'Every goal done, seven days in a row' },
    { id: 'glow', name: 'Full glow', ic: 'brightness-high', ok: (m) => (m.pct || 0) >= 90, hint: 'Finish 90 percent of the month' },
    { id: 'steady', name: 'Steady hands', ic: 'check2-all', ok: (m) => (m.pct || 0) >= 70, hint: 'Finish 70 percent of the month' },
    { id: 'mood', name: 'Mood keeper', ic: 'cloud-sun', ok: (m) => m.moods.length >= 10, hint: 'Log your mood on 10 days' },
    { id: 'explorer', name: 'Explorer', ic: 'compass', ok: (m) => m.visited >= 3, hint: 'Visit 3 places' },
    { id: 'foodie', name: 'Foodie', ic: 'egg-fried', ok: (m) => m.likes >= 5, hint: 'Add 5 likes' },
    { id: 'writer', name: 'Writer', ic: 'pencil-square', ok: (m) => m.notes >= 5, hint: 'Write 5 notes' },
  ];

  /* ---------- the charts ---------- */
  function heatmap(m, first) {
    const lead = (first.getDay() + 6) % 7;
    const cell = 44; const gap = 6; const top = 22;
    const rows = Math.ceil((lead + m.days.length) / 7);
    const svg = S('svg', { viewBox: `0 0 ${7 * (cell + gap)} ${top + rows * (cell + gap)}`, class: 'chart heat', role: 'img', 'aria-label': 'Calendar heat map of goals finished each day' });
    D.util.WEEK_ORDER.forEach((wd, i) => svg.append(S('text', { x: i * (cell + gap) + cell / 2, y: 14, class: 'chart__lab', 'text-anchor': 'middle' }, D.util.DAY_SHORT[wd].slice(0, 2))));
    m.days.forEach((x, i) => {
      const n = lead + i;
      const cx = (n % 7) * (cell + gap);
      const cy = top + Math.floor(n / 7) * (cell + gap);
      const level = x.future || x.pct == null ? 'none' : x.pct >= 100 ? 'full' : x.pct >= 50 ? 'high' : x.pct > 0 ? 'low' : 'zero';
      const g = S('g', { class: `hm hm--${level}${dateKey() === x.key ? ' is-today' : ''}`, tabindex: '-1' },
        S('title', null, x.pct == null ? `${x.d}: nothing scheduled` : x.future ? `${x.d}: still to come` : `${x.d}: ${x.done} of ${x.total} goals, ${x.pct} percent`),
        S('rect', { x: cx, y: cy, width: cell, height: cell, rx: 10 }),
        S('text', { x: cx + cell / 2, y: cy + cell / 2 + 5, class: 'chart__day', 'text-anchor': 'middle' }, String(x.d)));
      svg.append(g);
    });
    return svg;
  }

  function moodLine(m, dim) {
    const W = 360; const Hh = 96;
    const xs = (d) => 58 + ((d - 1) / Math.max(1, dim - 1)) * (W - 74);
    const ys = (v) => Hh - 14 - ((v - 1) / 4) * (Hh - 30);
    const svg = S('svg', { viewBox: `0 0 ${W} ${Hh}`, class: 'chart mood', role: 'img', 'aria-label': 'Mood through the month' });
    [1, 3, 5].forEach((v) => svg.append(S('line', { x1: 8, x2: W - 8, y1: ys(v), y2: ys(v), class: 'chart__grid' }), S('text', { x: 4, y: ys(v) - 3, class: 'chart__lab' }, MOOD_NAMES[v])));
    if (m.moods.length > 1) svg.append(S('polyline', { points: m.moods.map((x) => `${xs(x.d).toFixed(1)},${ys(x.mood).toFixed(1)}`).join(' '), class: 'chart__line' }));
    m.moods.forEach((x) => svg.append(S('circle', { cx: xs(x.d), cy: ys(x.mood), r: 3.6, class: 'chart__dot' }, S('title', null, `${x.d}: ${MOOD_NAMES[x.mood]}`))));
    return svg;
  }

  function weekBars(days) {
    const W = 360; const Hh = 120; const bw = 34; const step = (W - 20) / 7;
    const svg = S('svg', { viewBox: `0 0 ${W} ${Hh}`, class: 'chart bars', role: 'img', 'aria-label': 'Goals finished each day this week' });
    svg.append(S('line', { x1: 8, x2: W - 8, y1: 94, y2: 94, class: 'chart__grid' }));
    days.forEach((x, i) => {
      const cx = 10 + i * step + (step - bw) / 2;
      const hgt = x.pct == null || x.future ? 0 : Math.max(3, (x.pct / 100) * 78);
      svg.append(S('rect', { x: cx, y: 94 - hgt, width: bw, height: hgt, rx: 8, class: `bar${x.pct === 100 ? ' bar--full' : ''}` }, S('title', null, x.pct == null ? 'Nothing scheduled' : `${x.pct} percent`)),
        S('text', { x: cx + bw / 2, y: 110, class: 'chart__lab', 'text-anchor': 'middle' }, D.util.DAY_SHORT[x.date.getDay()].slice(0, 2)));
      if (x.pct != null && !x.future) svg.append(S('text', { x: cx + bw / 2, y: 90 - hgt, class: 'chart__lab', 'text-anchor': 'middle' }, `${x.pct}`));
    });
    return svg;
  }

  /* ---------- the page ---------- */
  function render(root) {
    const st = () => D.store.state;
    const today = new Date();
    let mode = 'month';
    let cursor = new Date(today.getFullYear(), today.getMonth(), 1);
    let weekStart = addDays(today, -((today.getDay() + 6) % 7));
    const body = h('div', { class: 'ibody' });
    const label = h('h2', { class: 'ilabel', 'aria-live': 'polite' });
    const prev = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Previous', onclick: () => step(-1) }, icon('chevron-left'));
    const next = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Next', onclick: () => step(1) }, icon('chevron-right'));
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Range' }, [['month', 'Month'], ['week', 'Week']].map(([v, t]) => h('button', {
      type: 'button', class: `seg__b${v === mode ? ' is-on' : ''}`, 'aria-pressed': String(v === mode), dataset: { v },
      onclick: () => { mode = v; seg.querySelectorAll('.seg__b').forEach((b) => { const on = b.dataset.v === v; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); }); draw(); },
    }, t)));

    function step(dir) {
      if (mode === 'month') cursor = new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1);
      else weekStart = addDays(weekStart, dir * 7);
      draw();
    }

    const put = (...kids) => D.util.append(body, kids);          // skips the empty slots (the native append would print "null")
    const tile = (big, small, hint) => h('div', { class: 'stat', title: hint }, h('b', null, big), h('span', null, small));

    function drawMonth() {
      const first = cursor;
      const m = monthModel(first, st(), today);
      const prevFirst = new Date(first.getFullYear(), first.getMonth() - 1, 1);
      const pm = monthModel(prevFirst, st(), today);
      const dim = m.days.length;
      const nothing = !m.sched && !m.moods.length && !m.likes && !m.visited && !m.notes;
      if (nothing) {
        put(h('div', { class: 'empty' },
          h('p', { class: 'empty__title' }, D.util.ink(`Nothing in ${monthName(first)} yet.`, `ins-empty-${first.getMonth()}`)),
          h('p', null, 'Tick some goals, log a mood, or add a like, and this month will fill with light.')));
        return;
      }
      put(
        h('div', { class: 'stats' },
          tile(m.pct == null ? '–' : `${m.pct}%`, 'finished', 'Goals finished out of goals scheduled so far this month'),
          tile(String(m.best), 'best this month', 'Longest run of days with every goal done this month'),
          tile(String(currentRun(st(), today)), 'streak now', 'Days in a row with every goal done, up to today'),
          tile(String(m.days.filter((x) => !x.future && completeDay(x)).length), 'full days', 'Days with every goal done')),
        m.pct != null ? h('p', { class: 'compare' }, icon('graph-up-arrow'), compare(m, pm, monthName(prevFirst))) : null,
        h('section', { class: 'pane ichart', 'aria-label': 'Calendar heat map' }, h('h3', { class: 'pane__title' }, D.util.ink('Month glow', 'ins-glow')), heatmap(m, first),
          h('div', { class: 'legend' }, [['zero', 'none'], ['low', 'a little'], ['high', 'half or more'], ['full', 'everything']].map(([c, t]) => h('span', { class: 'legend__k' }, h('i', { class: `legend__sw hm hm--${c}` }), t)))),
        m.goals.length ? h('section', { class: 'pane', 'aria-label': 'Goal by goal' }, h('h3', { class: 'pane__title' }, D.util.ink('Goal by goal', 'ins-goals')),
          h('ul', { class: 'gbars' }, m.goals.map((g) => h('li', null,
            h('span', { class: 'gbars__name hand' }, D.util.ink(g.hb.name, g.hb.id)),
            h('span', { class: 'gbars__track', role: 'img', 'aria-label': `${g.pct} percent` }, h('span', { class: 'gbars__fill', style: { width: `${g.pct}%` } })),
            h('span', { class: 'gbars__n' }, `${g.done}/${g.sched}`))))) : null,
        h('section', { class: 'pane', 'aria-label': 'Mood' }, h('h3', { class: 'pane__title' }, D.util.ink('Mood', 'ins-mood')),
          m.moods.length ? moodLine(m, dim) : h('p', { class: 'set__line' }, 'No moods logged this month. Pick one on the Today page.')),
        h('div', { class: 'stats stats--3' },
          tile(String(m.likes), 'likes added'), tile(String(m.visited), 'places visited'), tile(String(m.notes), 'notes written')),
        h('section', { class: 'pane', 'aria-label': 'Badges' }, h('h3', { class: 'pane__title' }, D.util.ink('Badges', 'ins-badges')),
          h('ul', { class: 'badges' }, BADGES.map((b) => { const on = b.ok(m); return h('li', { class: `badge${on ? ' is-on' : ''}`, title: b.hint }, h('span', { class: 'badge__ic' }, icon(b.ic)), h('span', { class: 'badge__name' }, b.name), h('span', { class: 'badge__st' }, on ? 'earned' : b.hint)); }))));
    }

    function drawWeek() {
      const days = range(weekStart, 7, st(), today);
      const sum = summarise(days);
      const before = summarise(range(addDays(weekStart, -7), 7, st(), today));
      put(
        h('div', { class: 'stats stats--3' },
          tile(sum.pct == null ? '–' : `${sum.pct}%`, 'finished'), tile(`${sum.done}/${sum.sched}`, 'goals ticked'), tile(String(days.filter((x) => !x.future && completeDay(x)).length), 'full days')),
        sum.pct != null ? h('p', { class: 'compare' }, icon('graph-up-arrow'), compare(sum, before, 'the week before')) : null,
        h('section', { class: 'pane ichart', 'aria-label': 'This week' }, h('h3', { class: 'pane__title' }, D.util.ink('Day by day', 'ins-week')), weekBars(days)),
        !sum.sched ? h('div', { class: 'empty' }, h('p', { class: 'empty__title' }, D.util.ink('A quiet week.', 'ins-quiet')), h('p', null, 'Nothing was scheduled for these days.')) : null);
    }

    function draw() {
      D.util.clear(body);
      if (mode === 'month') {
        label.textContent = `${monthName(cursor)} ${cursor.getFullYear()}`;
        next.disabled = cursor.getFullYear() === today.getFullYear() && cursor.getMonth() >= today.getMonth();
        prev.setAttribute('aria-label', 'Previous month'); next.setAttribute('aria-label', 'Next month');
        drawMonth();
      } else {
        const end = addDays(weekStart, 6);
        label.textContent = `${weekStart.getDate()} ${monthName(weekStart).slice(0, 3)} – ${end.getDate()} ${monthName(end).slice(0, 3)}`;
        next.disabled = dateKey(addDays(weekStart, 7)) > dateKey(today);
        prev.setAttribute('aria-label', 'Previous week'); next.setAttribute('aria-label', 'Next week');
        drawWeek();
      }
    }

    root.append(D.pageHead('Insights', 'Insights'),
      h('div', { class: 'ibar' }, h('div', { class: 'ibar__nav' }, prev, label, next), seg),
      body);
    draw();
  }

  D.pages.insights = { render };
})(window.Daybook);
