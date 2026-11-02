/* progress.js — pure calculations over the stored data: schedules, streaks, completion, dragon power. */
(function (D) {
  'use strict';

  const { dateKey, addDays, parseKey } = D.util;
  const P = {};

  P.isScheduled = (habit, date) => habit.days.includes(date.getDay()) && dateKey(date) >= habit.createdAt;
  P.log = (s, key) => s.logs[key] || { done: [], mood: 0, note: '' };
  P.isDone = (s, habit, key) => P.log(s, key).done.includes(habit.id);

  /* How a single day went. pct is null when nothing was scheduled. */
  P.day = (s, date) => {
    const key = dateKey(date);
    const scheduled = s.habits.filter((h) => P.isScheduled(h, date));
    const log = P.log(s, key);
    const done = scheduled.filter((h) => log.done.includes(h.id));
    return {
      key, scheduled, done,
      total: scheduled.length,
      pct: scheduled.length ? Math.round((done.length / scheduled.length) * 100) : null,
    };
  };

  /* Running streak counted over scheduled days only. An unticked today does not break it yet. */
  P.streak = (s, habit, today = new Date()) => {
    let n = 0;
    for (let i = 0; i < 1500; i++) {
      const d = addDays(today, -i);
      const key = dateKey(d);
      if (key < habit.createdAt) break;
      if (!habit.days.includes(d.getDay())) continue;
      if (P.isDone(s, habit, key)) n++;
      else if (i === 0) continue;
      else break;
    }
    return n;
  };

  P.bestStreak = (s, habit, today = new Date()) => {
    const todayKey = dateKey(today);
    let cur = 0;
    let best = 0;
    for (let d = parseKey(habit.createdAt), guard = 0; dateKey(d) <= todayKey && guard < 3700; d = addDays(d, 1), guard++) {
      if (!habit.days.includes(d.getDay())) continue;
      if (P.isDone(s, habit, dateKey(d))) { cur++; best = Math.max(best, cur); }
      else if (dateKey(d) !== todayKey) cur = 0;
    }
    return best;
  };

  P.totalDoneFor = (s, habit) => Object.values(s.logs).reduce((n, l) => n + (l.done.includes(habit.id) ? 1 : 0), 0);
  P.totalDone = (s) => Object.values(s.logs).reduce((n, l) => n + l.done.length, 0);

  /* True when yesterday had goals and not one of them was ticked. */
  P.missedYesterday = (s, today = new Date()) => {
    const y = P.day(s, addDays(today, -1));
    return y.total > 0 && y.done.length === 0;
  };

  /* Long-term power: total ticks plus five times the best current streak. */
  P.power = (s, today = new Date()) => {
    const levels = D.dragonConfig.levels;
    const topStreak = s.habits.reduce((m, h) => Math.max(m, P.streak(s, h, today)), 0);
    const points = P.totalDone(s) + 5 * topStreak;
    let index = 0;
    levels.forEach((l, i) => { if (points >= l.min) index = i; });
    const next = levels[index + 1] || null;
    const base = levels[index].min;
    return {
      points, index, name: levels[index].name, next,
      toNext: next ? next.min - points : 0,
      fraction: next ? (points - base) / (next.min - base) : 1,
      topStreak,
    };
  };

  D.progress = P;
})(window.Daybook);
