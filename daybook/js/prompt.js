/* prompt.js — My Prompt: builds a ready-to-paste prompt for an AI chat from your own likes, bucket list and settings.
   Three tabs (food, places, movies). Nothing is sent anywhere: you copy the text or download it as a .txt file.
   The privacy switch leaves out your name, addresses and note text. */
(function (D) {
  'use strict';

  const { h, icon, dateKey } = D.util;

  /* ---------- what each tab asks and offers ---------- */
  const SELECTS = {
    who: ['Just me', 'Two of us', 'A small group', 'Family with kids', 'Friends'],
    budget: ['No limit in mind', 'Budget-friendly', 'Mid-range', 'A treat'],
    when: ['Morning', 'Afternoon', 'Evening', 'Whole day', 'Weekend trip'],
    transport: ['Walking', 'Public transport', 'Car', 'Bike', 'Mixed'],
    company: ['On my own', 'With a partner', 'With friends', 'With family', 'With kids'],
    time: ['Under 90 minutes', 'About 2 hours', 'A whole evening', 'A weekend binge'],
    watching: ['Just me', 'Partner', 'Friends', 'Family', 'Family with kids'],
    kind: ['Either', 'A movie', 'A series'],
  };
  const MODES = [
    {
      id: 'food', label: 'Food at a restaurant', short: 'Food', ic: 'egg-fried',
      fields: [
        { id: 'restaurant', label: 'Restaurant (optional)', ph: 'Name of the place, or leave empty' },
        { id: 'cuisine', label: 'Cuisine', ph: 'Italian, South Indian, anything…' },
        { id: 'who', label: "Who's eating", select: 'who' },
        { id: 'budget', label: 'Budget', select: 'budget' },
        { id: 'mood', label: 'Mood or occasion', ph: 'Cosy dinner, birthday, quick lunch…' },
      ],
      sections: [['likes', 'Foods and drinks I like'], ['dislikes', 'What I dislike'], ['patterns', 'Cuisines and tags I repeat'], ['diet', 'Dietary notes'], ['recent', 'Recent picks']],
    },
    {
      id: 'places', label: 'Places to go', short: 'Places', ic: 'compass',
      fields: [
        { id: 'city', label: 'City or area', ph: 'Where are you?' },
        { id: 'when', label: 'Time', select: 'when' },
        { id: 'transport', label: 'Getting around', select: 'transport' },
        { id: 'budget', label: 'Budget', select: 'budget' },
        { id: 'company', label: 'Company', select: 'company' },
      ],
      sections: [['liked', 'Places I liked'], ['disliked', 'Places I disliked'], ['kinds', 'Kinds of places I choose most'], ['wish', 'My wish list'], ['visited', 'Places already visited']],
    },
    {
      id: 'movies', label: 'Movies and shows', short: 'Movies', ic: 'film',
      fields: [
        { id: 'mood', label: 'Mood', ph: 'Cosy, thrilling, light, thoughtful…' },
        { id: 'time', label: 'Time available', select: 'time' },
        { id: 'watching', label: "Who's watching", select: 'watching' },
        { id: 'kind', label: 'Movie or series', select: 'kind' },
      ],
      sections: [['high', 'Highly rated'], ['low', 'Poorly rated'], ['genres', 'Genres and tags I repeat'], ['seen', 'Already seen']],
    },
  ];

  /* ---------- reading the data ---------- */
  const oneLine = (t, n) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const tally = (lists) => {
    const m = new Map();
    lists.forEach((l) => l.forEach((t) => m.set(t, (m.get(t) || 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };
  const repeated = (lists) => { const t = tally(lists); const rep = t.filter(([, n]) => n >= 2); return (rep.length ? rep : t.slice(0, 4)).slice(0, 8); };
  const tagText = (t) => t.map(([k, n]) => (n > 1 ? `${k} (${n}x)` : k)).join(', ');

  function likeLine(e, priv) {
    const bits = [e.name + (e.rating ? ` (${e.rating}/5)` : '')];
    if (e.tags.length) bits.push(e.tags.join(', '));
    if (!priv && e.where) bits.push(`at ${oneLine(e.where, 60)}`);
    if (!priv && e.notes) bits.push(oneLine(e.notes, 120));
    return `- ${bits.join(' · ')}`;
  }
  const placeLine = (p, priv) => {
    const bits = [p.name, p.category];
    if (p.priority === 3) bits.push('high priority');
    if (!priv && p.address) bits.push(oneLine(p.address, 80));
    if (!priv && p.notes) bits.push(oneLine(p.notes, 120));
    if (!priv && p.visitedNote) bits.push(oneLine(p.visitedNote, 120));
    return `- ${bits.join(' · ')}`;
  };
  const block = (title, lines, none) => [`${title}`, ...(lines.length ? lines : [`- ${none}`]), ''];

  /* ---------- building the text ---------- */
  function build(mode, v, on, priv, extra) {
    const st = D.store.state;
    const likes = st.likes;
    const out = [];
    const ask = [];
    let thin = false;
    const given = (label, val) => (val ? [`- ${label}: ${val}`] : []);

    if (mode === 'food') {
      const food = likes.filter((e) => e.category === 'Food' || e.category === 'Drinks');
      const loved = food.filter((e) => e.kind === 'like').sort((a, b) => b.rating - a.rating);
      const disliked = food.filter((e) => e.kind === 'dislike');
      thin = food.length < 3;
      out.push('# Help me choose what to eat', '', '## What I need',
        v.restaurant ? `I am eating at ${v.restaurant}.` : 'I am choosing a restaurant meal.',
        ...given('Cuisine', v.cuisine), ...given("Who's eating", v.who), ...given('Budget', v.budget), ...given('Mood or occasion', v.mood), '');
      out.push('## About my taste');
      if (on.likes) out.push(...block('Foods and drinks I like:', loved.slice(0, 15).map((e) => likeLine(e, priv)), 'nothing saved yet'));
      if (on.dislikes) out.push(...block('Things I dislike:', disliked.slice(0, 10).map((e) => likeLine(e, priv)), 'nothing saved yet'));
      if (on.patterns) {
        const tags = repeated(loved.map((e) => e.tags));
        out.push(...block('Cuisines and tags I come back to:', tags.length ? [`- ${tagText(tags)}`] : [], 'no repeats yet'));
      }
      if (on.diet) out.push(...block('Dietary notes:', st.settings.diet ? [`- ${oneLine(st.settings.diet, 300)}`] : [], 'none given'));
      if (on.recent) {
        const byId = new Map(likes.map((e) => [e.id, e]));
        const recent = st.eatLog.slice().reverse().map((x) => byId.get(x.id)).filter(Boolean).slice(0, 8);
        out.push(...block('Recent picks (so you can vary things):', recent.map((e) => `- ${e.name}`), 'none yet'));
      }
      ask.push('Suggest 3 to 5 specific dishes to order' + (v.restaurant ? ` at ${v.restaurant}` : '') + ', and for each say in one line why it fits my taste.',
        'Include one adventurous pick that is a little outside my usual choices.',
        'Name one or two dishes I would probably not enjoy, and why.',
        'If you are unsure about the menu, say so and suggest what to look for instead of guessing.');
    }

    if (mode === 'places') {
      const pl = likes.filter((e) => e.category === 'Places');
      const wish = st.places.filter((p) => p.status !== 'visited').sort((a, b) => b.priority - a.priority);
      const seen = st.places.filter((p) => p.status === 'visited');
      thin = pl.length + st.places.length < 3;
      out.push('# Help me plan where to go', '', '## What I need',
        ...given('City or area', v.city), ...given('Time', v.when), ...given('Getting around', v.transport), ...given('Budget', v.budget), ...given('Company', v.company), '');
      out.push('## About my taste');
      if (on.liked) out.push(...block('Places I liked:', pl.filter((e) => e.kind === 'like').slice(0, 12).map((e) => likeLine(e, priv)), 'nothing saved yet'));
      if (on.disliked) out.push(...block('Places I disliked:', pl.filter((e) => e.kind === 'dislike').slice(0, 8).map((e) => likeLine(e, priv)), 'nothing saved yet'));
      if (on.kinds) {
        const kinds = tally(st.places.map((p) => [p.category]));
        out.push(...block('Kinds of places I choose most:', kinds.length ? [`- ${kinds.slice(0, 5).map(([k, n]) => `${k} (${n})`).join(', ')}`] : [], 'not enough yet'));
      }
      if (on.wish) out.push(...block('My wish list:', wish.slice(0, 12).map((p) => placeLine(p, priv)), 'empty'));
      if (on.visited) out.push(...block('Places I have already visited:', seen.slice(0, 15).map((p) => placeLine(p, priv)), 'none yet'));
      ask.push('Give me a short plan for the time I have, in order, with a rough time for each stop.',
        'Suggest a few new places similar to the ones I liked, and say why each fits.',
        'Tell me what to avoid, based on what I disliked or already visited.',
        'Keep travel between stops sensible for how I am getting around.');
    }

    if (mode === 'movies') {
      const mv = likes.filter((e) => e.category === 'Movies and Shows');
      const high = mv.filter((e) => e.kind === 'like' && (e.rating >= 4 || !e.rating)).sort((a, b) => b.rating - a.rating);
      const low = mv.filter((e) => e.kind === 'dislike' || (e.rating > 0 && e.rating <= 2));
      thin = mv.length < 3;
      out.push('# Help me pick something to watch', '', '## What I need',
        ...given('Mood', v.mood), ...given('Time available', v.time), ...given("Who's watching", v.watching), ...given('Looking for', v.kind === 'Either' ? '' : v.kind), '');
      out.push('## About my taste');
      if (on.high) out.push(...block('Highly rated by me:', high.slice(0, 15).map((e) => likeLine(e, priv)), 'nothing saved yet'));
      if (on.low) out.push(...block('Rated poorly or disliked:', low.slice(0, 10).map((e) => likeLine(e, priv)), 'nothing saved yet'));
      if (on.genres) {
        const g = repeated(high.map((e) => e.tags));
        out.push(...block('Genres and tags I come back to:', g.length ? [`- ${tagText(g)}`] : [], 'no repeats yet'));
      }
      if (on.seen) out.push(...block('Already seen (please do not repeat these):', mv.slice(0, 40).map((e) => `- ${e.name}`), 'none saved yet'));
      ask.push('Suggest 3 to 5 titles that match my mood and the time I have, with one line on why each suits me.',
        'Include one wildcard that is different from what I usually pick.',
        'Do not include spoilers.');
    }

    if (extra.trim()) out.push('## Anything else', extra.trim().slice(0, 1200), '');
    if (thin) out.push('## A note', 'I have not saved much in Daybook yet, so this picture of my taste is thin. Use it as a rough guide, and ask me one or two quick questions if something important is missing.', '');
    out.push('## Please', ...ask.map((a, i) => `${i + 1}. ${a}`), '', 'Keep it short, friendly and easy to scan.');

    let text = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    const name = st.settings.name.trim();
    if (priv && name.length > 1) text = text.replace(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), 'me');
    return { text, thin };
  }

  /* ---------- the page ---------- */
  function render(root) {
    const st = D.store.state;
    let mode = 'food';
    let priv = false;
    let edited = false;
    const vals = { food: { who: SELECTS.who[0], budget: SELECTS.budget[0] }, places: { city: [st.settings.homeCity, st.settings.homeCountry].filter(Boolean).join(', '), when: SELECTS.when[1], transport: SELECTS.transport[0], budget: SELECTS.budget[0], company: SELECTS.company[0] }, movies: { time: SELECTS.time[1], watching: SELECTS.watching[0], kind: SELECTS.kind[0] } };
    const secs = Object.fromEntries(MODES.map((m) => [m.id, Object.fromEntries(m.sections.map(([k]) => [k, true]))]));
    let extra = '';

    const tabs = h('div', { class: 'ptabs', role: 'tablist', 'aria-label': 'What do you need a prompt for' });
    const form = h('div', { class: 'pform pane' });
    const out = h('textarea', { class: 'pout__text', id: 'pr-out', rows: 16, spellcheck: 'false', 'aria-label': 'The generated prompt, editable' });
    const hint = h('p', { class: 'set__line', role: 'status' });
    const copyBtn = h('button', { type: 'button', class: 'btn-ink btn-ink--primary btn-ink--small', onclick: () => copy() }, icon('clipboard'), h('span', null, 'Copy'));

    const m = () => MODES.find((x) => x.id === mode);
    function generate(force) {
      if (edited && !force) { hint.textContent = 'You edited the text. Press Generate to rebuild it from your data.'; return; }
      const r = build(mode, vals[mode], secs[mode], priv, extra);
      out.value = r.text;
      edited = false;
      hint.textContent = r.thin ? 'Not much saved for this yet, so the prompt says so and asks the AI to check with you. It still works; it just gets better as you add likes.' : '';
    }

    async function copy() {
      const text = out.value;
      let ok = false;
      try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
        out.focus(); out.select();
        try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      }
      if (ok) {
        D.util.toast('Copied. Paste it into your AI chat.', 'good');
        const label = copyBtn.querySelector('span');
        label.textContent = 'Copied';
        copyBtn.classList.add('is-ok');
        setTimeout(() => { label.textContent = 'Copy'; copyBtn.classList.remove('is-ok'); }, 2200);
      } else D.util.toast('Could not copy. Select the text and copy it by hand.', 'warn');
    }

    function paintForm() {
      D.util.clear(form);
      const cur = m();
      const v = vals[mode];
      form.append(h('h2', { class: 'pane__title' }, D.util.ink('About this time', `pr-${mode}`)));
      cur.fields.forEach((f) => {
        const id = `pr-${mode}-${f.id}`;
        const control = f.select
          ? h('select', { class: 'input input--select', id, onchange: (e) => { v[f.id] = e.target.value; generate(); } }, SELECTS[f.select].map((o) => h('option', { value: o, selected: o === v[f.id] }, o)))
          : h('input', { class: 'input input--hand', id, type: 'text', maxlength: 100, value: v[f.id] || '', placeholder: f.ph || '', autocomplete: 'off', oninput: (e) => { v[f.id] = e.target.value.trim(); generate(); } });
        form.append(h('div', { class: 'field' }, h('label', { class: 'field__label', for: id }, f.label), f.select ? control : D.voice.field(control)));
      });
      const extraBox = h('textarea', { class: 'input input--hand input--area', id: 'pr-extra', rows: 3, maxlength: 1200, placeholder: 'Anything else the AI should know…', oninput: (e) => { extra = e.target.value; generate(); } });
      extraBox.value = extra;
      form.append(h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'pr-extra' }, 'Extra context'), D.voice.field(extraBox)));
      form.append(h('fieldset', { class: 'field pchecks' }, h('legend', { class: 'field__label' }, 'Include'),
        cur.sections.map(([k, t]) => {
          const box = h('input', { type: 'checkbox', checked: secs[mode][k], onchange: () => { secs[mode][k] = box.checked; generate(); } });
          return h('label', { class: 'pcheck' }, box, h('span', null, t));
        })));
      const pbox = h('input', { type: 'checkbox', role: 'switch', checked: priv, onchange: () => { priv = pbox.checked; generate(); } });
      form.append(h('label', { class: 'pcheck pcheck--priv' }, pbox, h('span', null, h('b', null, 'Privacy mode'), h('small', null, 'Leaves out your name, addresses and the text of your notes. Item names, ratings and the city you type stay.'))));
    }

    function paintTabs() {
      D.util.clear(tabs);
      MODES.forEach((x) => tabs.append(h('button', {
        type: 'button', role: 'tab', class: `ptab${x.id === mode ? ' is-on' : ''}`, 'aria-selected': String(x.id === mode), id: `ptab-${x.id}`,
        onclick: () => { mode = x.id; edited = false; paintTabs(); paintForm(); generate(true); },
      }, icon(x.ic), h('span', { class: 'ptab__full' }, x.label), h('span', { class: 'ptab__short' }, x.short))));
    }

    out.addEventListener('input', () => { edited = true; hint.textContent = 'You edited the text. Press Generate to rebuild it from your data.'; });

    root.append(
      D.pageHead('My prompt', 'My Prompt', 'A ready-made prompt for any AI chat, written from your own likes and lists. Nothing is sent from here: you copy it yourself.'),
      tabs,
      h('div', { class: 'pgen' },
        form,
        h('section', { class: 'pout pane', 'aria-label': 'Your prompt' },
          h('h2', { class: 'pane__title' }, D.util.ink('Your prompt', 'pr-out')),
          out, hint,
          h('div', { class: 'pout__actions' },
            h('button', { type: 'button', class: 'btn-ink btn-ink--ghost btn-ink--small', onclick: () => { generate(true); D.util.toast('Prompt rebuilt.'); } }, icon('arrow-repeat'), 'Generate'),
            copyBtn,
            h('button', { type: 'button', class: 'btn-ink btn-ink--ghost btn-ink--small', onclick: () => { D.util.download(`daybook-prompt-${mode}-${dateKey()}.txt`, out.value, 'text/plain'); D.util.toast('Saved as a text file.', 'good'); } }, icon('download'), 'Download .txt')))));
    paintTabs(); paintForm(); generate(true);
  }

  D.pages.prompt = { render, build };
})(window.Daybook);
