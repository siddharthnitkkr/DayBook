/* likes.js — Likes and dislikes: categories, quick add, filters, "What should I eat today?" and suggestions.
   Suggestions come from your own entries plus a small built-in list of related ideas. No online service. */
(function (D) {
  'use strict';

  const { h, icon, dateKey } = D.util;
  const CATS = D.store.LIKE_CATS;
  const SHORT = { 'Movies and Shows': 'Movies & shows' };
  const ICONS = { Food: 'egg-fried', Drinks: 'cup-straw', Places: 'geo-alt', 'Movies and Shows': 'film', Activities: 'bicycle', Shopping: 'bag', Other: 'stars' };
  const label = (c) => SHORT[c] || c;
  const RECENT_DAYS = 4;

  /* ---------- small built-in list of related ideas (keyword in a name or tag -> ideas) ---------- */
  const IDEAS = {
    'butter chicken': [['Chicken tikka masala', 'a creamy cousin'], ['Paneer butter masala', 'the same sauce, vegetarian'], ['Garlic naan', 'the perfect partner']],
    biryani: [['Hyderabadi dum biryani', 'slow-cooked in its pot'], ['Raita', 'cool and tangy on the side'], ['Mutton korma', 'rich and mild']],
    indian: [['South Indian thali', 'many small dishes'], ['Chaat', 'crunchy street snacks'], ['Dosa and sambar', 'crisp and savoury']],
    dosa: [['Uttapam', 'a thicker cousin'], ['Idli with chutney', 'soft and light'], ['Medu vada', 'crisp outside, soft inside']],
    paneer: [['Palak paneer', 'creamy spinach'], ['Paneer tikka', 'smoky from the grill'], ['Kadai paneer', 'peppery and bold']],
    italian: [['Risotto', 'creamy and slow'], ['Gnocchi', 'soft potato dumplings'], ['Tiramisu', 'a coffee dessert']],
    pizza: [['Focaccia', 'olive oil and herbs'], ['Calzone', 'a folded pizza'], ['Pasta al forno', 'baked and bubbling']],
    pasta: [['Lasagne', 'layers and cheese'], ['Cacio e pepe', 'just cheese and pepper'], ['Pesto trofie', 'fresh basil']],
    burger: [['Smash burger', 'crisp edges'], ['Loaded fries', 'a natural side'], ['Chicken katsu sandwich', 'crunchy and soft']],
    sushi: [['Ramen', 'warm and deep'], ['Poke bowl', 'fresh and light'], ['Tempura', 'light batter']],
    ramen: [['Udon', 'thick and chewy'], ['Gyoza', 'pan-fried dumplings'], ['Tonkotsu broth', 'rich and milky']],
    thai: [['Green curry', 'fragrant and creamy'], ['Pad thai', 'sweet, sour, nutty'], ['Tom yum soup', 'hot and sour']],
    chinese: [['Dim sum', 'small steamed plates'], ['Hakka noodles', 'wok-tossed'], ['Mapo tofu', 'numbing and spicy']],
    mexican: [['Tacos al pastor', 'pineapple and spice'], ['Quesadilla', 'melty and quick'], ['Guacamole and chips', 'fresh and easy']],
    dessert: [['Gulab jamun', 'warm and syrupy'], ['Panna cotta', 'soft and cool'], ['Brownie with ice cream', 'a classic pair']],
    coffee: [['Cold brew', 'smooth and strong'], ['Flat white', 'velvety'], ['A new roastery cafe', 'try a different bean']],
    tea: [['Masala chai', 'warm and spiced'], ['Matcha latte', 'earthy and calm'], ['Jasmine tea', 'light and floral']],
    juice: [['Cold-pressed green juice', 'fresh and sharp'], ['Sugarcane juice', 'sweet and cold'], ['Coconut water', 'light']],
    wine: [['A local vineyard tasting', 'taste before you buy'], ['A cheese and wine evening', 'a good pairing']],
    thriller: [['A slow-burn mystery series', 'same tension, more time'], ['A heist film', 'clever and fast'], ['A courtroom drama', 'tense talk']],
    comedy: [['A stand-up special', 'quick laughs'], ['A cosy sitcom', 'easy to binge'], ['A road-trip comedy', 'light and warm']],
    scifi: [['A space documentary', 'real wonder'], ['A time-loop film', 'clever ideas'], ['A classic sci-fi novel adapted for screen', 'big ideas']],
    anime: [['A Studio Ghibli film', 'gentle and beautiful'], ['A sports anime', 'high energy'], ['A slice-of-life series', 'calm']],
    hike: [['A waterfall trail', 'a reward at the end'], ['A sunrise viewpoint walk', 'worth the early start'], ['A forest day walk', 'slow and green']],
    trek: [['A short overnight camp', 'stars and quiet'], ['A ridge walk', 'big views'], ['A lakeside trail', 'flat and calm']],
    yoga: [['A sunrise stretch session', 'start gently'], ['A breathwork class', 'calm and steady'], ['A park yoga group', 'fresh air']],
    park: [['A botanical garden', 'quiet and green'], ['A lakeside walk', 'water and shade'], ['A picnic spot', 'take food and a book']],
    beach: [['A sunset coastline walk', 'golden light'], ['A fishing village stop', 'fresh seafood'], ['A quiet cove', 'less crowded']],
    museum: [['A science centre', 'hands-on'], ['A small gallery', 'quiet and close'], ['A heritage walk', 'stories on foot']],
    mall: [['A weekend flea market', 'one-off finds'], ['A craft bazaar', 'handmade things']],
    cafe: [['A bookshop cafe', 'read and sip'], ['A rooftop cafe', 'views with coffee'], ['A garden cafe', 'green and quiet']],
    shopping: [['A local artisan market', 'unusual finds'], ['A second-hand bookshop', 'treasure hunt']],
  };

  const STOP = new Set(['the', 'and', 'with', 'for', 'from', 'that', 'this', 'very', 'really', 'good', 'great', 'nice', 'place']);
  const words = (text) => String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
  const tokensOf = (e) => new Set([...words(e.name), ...(e.tags || []).flatMap(words)]);

  /* ---------- guessing and parsing ---------- */
  const RULES = [
    ['Drinks', /\b(coffee|tea|chai|latte|cappuccino|espresso|beer|wine|whisky|whiskey|cocktail|mocktail|juice|smoothie|shake|soda|lassi|drink|brew)\b/],
    ['Movies and Shows', /\b(movie|film|show|series|season|episode|watched|watching|watch|netflix|documentary|anime|cinema)\b/],
    ['Activities', /\b(hike|hiking|trek|trekking|run|running|cycling|yoga|gym|swim|swimming|played|concert|workout|dance|camping|climbing|class|game)\b/],
    ['Shopping', /\b(bought|shop|shopping|store|jacket|shoes|shirt|bag|phone|laptop|dress)\b/],
    ['Food', /\b(chicken|paneer|pizza|burger|biryani|curry|pasta|noodles|ramen|sushi|taco|tacos|sandwich|dosa|idli|thali|naan|roti|dal|rice|soup|salad|steak|fish|prawn|cake|ice cream|dessert|chaat|momos|restaurant|dinner|lunch|breakfast|brunch|meal|food|ate|eat|kebab|tikka|fries|pancake|waffle)\b/],
    ['Places', /\b(park|beach|museum|temple|lake|garden|mall|cafe|hotel|resort|market|city|town|mountain|visit|visited)\b/],
  ];
  const guessCategory = (text) => { const t = String(text || '').toLowerCase(); const hit = RULES.find(([, re]) => re.test(t)); return hit ? hit[0] : 'Other'; };

  const NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5 };
  const numOf = (w) => (NUMW[w] || Number(w) || 0);
  const STARS = '(?:[1-5]|one|two|three|four|five)';

  /* "I loved the butter chicken at the Indian place, five stars" -> a draft you confirm before it is saved */
  function parseLikeSentence(raw) {
    const text = String(raw || '').replace(/\s+/g, ' ').trim();
    const lower = text.toLowerCase();
    let rating = 0;
    const m = new RegExp(`\\b(${STARS})\\s*(?:/\\s*5\\s*)?(?:out of (?:5|five)\\s*)?stars?\\b`).exec(lower)
      || new RegExp(`\\b(?:rated|rating|gave(?: it)?|give(?: it)?)\\s+(?:it\\s+)?(${STARS})\\b`).exec(lower)
      || new RegExp('\\b([1-5])\\s*(?:/|out of)\\s*(?:5|five)\\b').exec(lower);
    if (m) rating = Math.min(5, numOf(m[1]));
    const negative = /\b(hate[ds]?|dislike[ds]?|didn'?t like|did not like|don'?t like|do not like|awful|terrible|horrible|disgusting|worst|not good|overrated|never again|avoid)\b/.test(lower);

    let name = text
      .replace(new RegExp(`[,.]?\\s*\\b(?:i\\s+)?(?:rated|gave)(?:\\s+it)?\\s+${STARS}(?:\\s*(?:/|out of)\\s*(?:5|five))?(?:\\s*stars?)?\\b.*$`, 'i'), '')
      .replace(new RegExp(`[,.]?\\s*\\b${STARS}\\s*(?:/\\s*5\\s*)?(?:out of (?:5|five)\\s*)?stars?\\b.*$`, 'i'), '')
      .replace(/[,.]?\s*\b[1-5]\s*(?:\/|out of)\s*(?:5|five)\b.*$/i, '')
      .replace(/,\s*(?:it was |was )?(?:terrible|awful|horrible|bad|great|amazing|delicious|tasty|lovely|excellent|good|nice)\b.*$/i, '')
      .replace(/\s+(?:last night|yesterday|today|this morning|last week)\b.*$/i, '')
      .replace(/^(?:(?:i|we)\s+)?(?:really\s+|absolutely\s+|totally\s+)?(?:loved|love|liked|like|enjoyed|enjoy|hated|hate|disliked|dislike|didn'?t like|did not like|don'?t like)\s+(?:watching\s+|eating\s+|drinking\s+)?/i, '')
      .replace(/^(?:the|a|an|some|that|this)\s+/i, '');
    let where = '';
    const w = /^(.*?)\s+(?:at|in|from)\s+(?:the\s+)?(.+)$/i.exec(name);
    if (w) { name = w[1]; where = w[2]; }
    const tidy = (s) => s.replace(/^[\s,.-]+|[\s,.-]+$/g, '').replace(/^(?:the|a|an)\s+/i, '');
    name = tidy(name) || text;
    where = tidy(where);
    return {
      name: name.charAt(0).toUpperCase() + name.slice(1, 80), kind: negative ? 'dislike' : 'like', rating,
      category: guessCategory(text), where: where.slice(0, 120), tags: [], notes: '', when: dateKey(), source: text,
    };
  }

  /* ---------- picking and suggesting ---------- */
  function foodPool(st) {
    const dislikes = st.likes.filter((e) => e.kind === 'dislike');
    const dislikeNames = new Set(dislikes.map((e) => e.name.trim().toLowerCase()));
    const dislikeTags = new Set(dislikes.filter((e) => e.category === 'Food').flatMap((e) => e.tags));
    return st.likes.filter((e) => e.kind === 'like' && e.category === 'Food' && !dislikeNames.has(e.name.trim().toLowerCase()))
      .map((e) => ({ e, clash: e.tags.some((t) => dislikeTags.has(t)) }));
  }

  /* From liked food: not a dislike, not picked in the last few days, favouring higher ratings. */
  function pickFood(st, skipIds = []) {
    const cutoff = dateKey(D.util.addDays(new Date(), -RECENT_DAYS));
    const recent = new Set(st.eatLog.filter((x) => x.date >= cutoff).map((x) => x.id));
    const all = foodPool(st);
    const tiers = [
      all.filter((x) => !x.clash && !recent.has(x.e.id) && !skipIds.includes(x.e.id)),
      all.filter((x) => !recent.has(x.e.id) && !skipIds.includes(x.e.id)),
      all.filter((x) => !skipIds.includes(x.e.id)),
    ];
    const list = tiers.find((t) => t.length) || [];
    if (!list.length) return null;
    const weights = list.map((x) => 1 + x.e.rating);
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < list.length; i++) { r -= weights[i]; if (r <= 0) return list[i].e; }
    return list[list.length - 1].e;
  }
  D.pickFood = pickFood;

  function suggestions(st) {
    const known = new Set(st.likes.map((e) => e.name.trim().toLowerCase()));
    const out = [];
    const used = new Set();
    const liked = st.likes.filter((e) => e.kind === 'like').sort((a, b) => b.rating - a.rating || b.createdAt.localeCompare(a.createdAt));
    const open = st.places.filter((p) => p.status !== 'visited');
    for (const e of liked) {
      const haystack = `${e.name} ${e.tags.join(' ')}`.toLowerCase();
      const mine = tokensOf(e);
      let made = 0;
      // 1. something already on your own bucket list that shares words or tags
      for (const p of open) {
        const shared = words(`${p.name} ${p.notes} ${p.address}`).filter((w) => mine.has(w));
        if (shared.length && !used.has(`p:${p.id}`) && made < 1) { out.push({ from: e.name, to: p.name, why: 'already on your list', mine: true }); used.add(`p:${p.id}`); made += 1; }
      }
      // 2. the small built-in list of related ideas
      for (const key of Object.keys(IDEAS)) {
        if (made >= 2 || !new RegExp(`\\b${key}`).test(haystack)) continue;
        for (const [idea, why] of IDEAS[key]) {
          if (known.has(idea.toLowerCase()) || used.has(idea)) continue;
          out.push({ from: e.name, to: idea, why }); used.add(idea); made += 1;
          break;
        }
      }
      if (out.length >= 4) break;
    }
    return out.slice(0, 4);
  }

  /* ---------- the page ---------- */
  const stars = (n) => h('span', { class: 'stars', role: 'img', 'aria-label': n ? `${n} of 5 stars` : 'not rated' },
    [1, 2, 3, 4, 5].map((i) => icon(i <= n ? 'star-fill' : 'star', i <= n ? 'on' : '')));

  function render(root) {
    const st = () => D.store.state;
    let cat = 'All';
    let filter = 'all';
    let query = '';
    let sort = 'rating';
    let eatShown = [];

    /* ---------- quick add ---------- */
    const quickInput = h('input', { class: 'input input--hand', type: 'text', maxlength: 80, id: 'like-quick', placeholder: 'Something you tried: type or speak, press Enter', autocomplete: 'off', 'aria-label': 'Quick add a like' });
    const quick = h('form', {
      class: 'quick', novalidate: true,
      onsubmit: (e) => {
        e.preventDefault();
        const name = quickInput.value.trim();
        if (!name) { quickInput.focus(); return; }
        const entry = {
          id: D.util.uid(), name: name.slice(0, 80), kind: 'like', rating: 0,
          category: cat !== 'All' ? cat : guessCategory(name), tags: [], notes: '', photo: '', where: '', when: dateKey(), createdAt: new Date().toISOString(),
        };
        D.store.commit((s) => { s.likes.unshift(entry); });
        quickInput.value = '';
        drawAll();
        D.util.toast(`Added "${entry.name}". Open it to add details.`, 'good');
        quickInput.focus();
      },
    }, D.voice.field(quickInput), h('button', { type: 'submit', class: 'btn-ink btn-ink--primary' }, icon('plus-lg'), 'Add'));

    /* ---------- tabs, filters ---------- */
    const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Category' });
    function drawTabs() {
      D.util.clear(tabs);
      ['All', ...CATS].forEach((c) => {
        const n = c === 'All' ? st().likes.length : st().likes.filter((e) => e.category === c).length;
        tabs.append(h('button', {
          type: 'button', role: 'tab', class: `tab${c === cat ? ' is-on' : ''}`, 'aria-selected': String(c === cat),
          onclick: () => { cat = c; drawAll(); },
        }, c === 'All' ? null : icon(ICONS[c]), label(c), h('span', { class: 'tab__n' }, String(n))));
      });
    }

    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Show' }, [['all', 'All'], ['like', 'Likes'], ['dislike', 'Dislikes']].map(([v, t]) => h('button', {
      type: 'button', class: `seg__b${v === filter ? ' is-on' : ''}`, 'aria-pressed': String(v === filter), dataset: { v },
      onclick: () => { filter = v; seg.querySelectorAll('.seg__b').forEach((b) => { const on = b.dataset.v === v; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); }); drawList(); },
    }, t)));
    const searchInput = h('input', { class: 'input input--hand', type: 'search', id: 'like-search', placeholder: 'Search', autocomplete: 'off', 'aria-label': 'Search likes' });
    searchInput.addEventListener('input', () => { query = searchInput.value.trim().toLowerCase(); drawList(); });
    const sortSel = h('select', { class: 'input input--select', 'aria-label': 'Sort by', onchange: (e) => { sort = e.target.value; drawList(); } },
      h('option', { value: 'rating' }, 'Top rated'), h('option', { value: 'new' }, 'Newest'), h('option', { value: 'name' }, 'Name'));
    const toolbar = h('div', { class: 'toolbar' }, seg, D.voice.field(searchInput), sortSel);

    /* ---------- list ---------- */
    const list = h('div', { class: 'llist' });
    const visible = () => st().likes.filter((e) => (cat === 'All' || e.category === cat)
      && (filter === 'all' || e.kind === filter)
      && (!query || `${e.name} ${e.tags.join(' ')} ${e.where} ${e.notes}`.toLowerCase().includes(query)));
    const sorter = () => ({
      rating: (a, b) => b.rating - a.rating || a.name.localeCompare(b.name),
      new: (a, b) => b.createdAt.localeCompare(a.createdAt),
      name: (a, b) => a.name.localeCompare(b.name),
    }[sort]);

    function thumb(e) {
      const box = h('span', { class: `thumb thumb--${e.kind}` }, icon(ICONS[e.category]));
      if (e.photo) { const img = h('img', { alt: '', class: 'thumb__img', loading: 'lazy' }); box.append(img); D.photos.show(img, e.photo); }
      return box;
    }

    function row(e) {
      const meta = [label(e.category), e.where, e.when ? new Date(`${e.when}T00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''].filter(Boolean).join(' · ');
      return h('li', { class: `lrow lrow--${e.kind}`, style: { '--tilt': `${D.util.tilt(e.id, 1).toFixed(2)}deg` } },
        h('button', { type: 'button', class: 'lrow__main', 'aria-label': `Open ${e.name}`, onclick: () => openEntry(e) },
          thumb(e),
          h('span', { class: 'lrow__text' },
            h('span', { class: 'lrow__name hand' }, D.util.ink(e.name, e.id)),
            h('span', { class: 'lrow__meta' }, stars(e.rating), h('span', null, meta)),
            e.tags.length ? h('span', { class: 'lrow__tags' }, e.tags.map((t) => h('span', { class: 'tag' }, t))) : null),
          h('span', { class: 'lrow__kind', title: e.kind === 'like' ? 'Liked' : 'Disliked' }, icon(e.kind === 'like' ? 'hand-thumbs-up-fill' : 'hand-thumbs-down-fill'))));
    }

    function drawList() {
      D.util.clear(list);
      const items = visible().sort(sorter());
      if (!items.length) {
        list.append(h('div', { class: 'empty' },
          h('p', { class: 'empty__title' }, D.util.ink(st().likes.length ? 'Nothing matches that.' : 'Nothing here yet. Tell me what you love.', 'likes-empty')),
          h('p', null, st().likes.length ? 'Try another category or clear the search.' : 'Type a name above, or tap the microphone and say it.')));
        return;
      }
      const groups = cat === 'All' ? CATS : [cat];
      groups.forEach((g) => {
        const rows = items.filter((e) => e.category === g);
        if (!rows.length) return;
        list.append(h('section', { class: 'lgroup', 'aria-label': label(g) },
          h('h2', { class: 'lgroup__title' }, icon(ICONS[g]), label(g), h('span', null, String(rows.length))),
          h('ul', { class: 'lrows' }, rows.map(row))));
      });
    }

    /* ---------- what should I eat today? ---------- */
    const eatSlot = h('div', { class: 'slot' });
    function eatPick(again) {
      if (!again) eatShown = [];
      const e = pickFood(st(), eatShown);
      D.util.clear(eatSlot);
      if (!e) {
        eatSlot.append(h('div', { class: 'eatcard eatcard--empty' },
          h('p', { class: 'empty__title' }, D.util.ink('No food picks yet.', 'eat-empty')),
          h('p', null, 'Add some food you like in the Food tab and I will choose for you.')));
        return;
      }
      eatShown.push(e.id);
      D.store.commit((s) => { s.eatLog = s.eatLog.filter((x) => x.id !== e.id).concat({ id: e.id, date: dateKey() }).slice(-60); }, 'ui');
      const card = h('div', { class: 'eatcard', role: 'status' },
        h('p', { class: 'eatcard__kicker' }, 'Today, try'),
        h('p', { class: 'eatcard__name hand' }, D.util.ink(e.name, `eat-${e.id}`)),
        h('p', { class: 'eatcard__meta' }, stars(e.rating), e.where ? h('span', null, e.where) : null),
        h('div', { class: 'eatcard__actions' },
          h('button', { type: 'button', class: 'btn-ink btn-ink--primary btn-ink--small', onclick: () => eatPick(true) }, icon('shuffle'), 'Pick again'),
          h('button', { type: 'button', class: 'btn-ink btn-ink--ghost btn-ink--small', onclick: () => { D.util.clear(eatSlot); } }, 'Close')));
      eatSlot.append(card);
      D.util.burst(card, { count: 2, scale: 1.08, gap: 160 });
    }

    /* ---------- suggestions ---------- */
    const suggestBox = h('details', { class: 'suggest', open: true });
    function drawSuggest() {
      D.util.clear(suggestBox);
      const list2 = suggestions(st());
      suggestBox.append(h('summary', null, icon('lightbulb'), 'You liked it, so try…'));
      if (!list2.length) {
        suggestBox.append(h('p', { class: 'suggest__empty' }, 'Add a few things you love, with tags like "indian" or "hike", and ideas will appear here.'));
        return;
      }
      suggestBox.append(h('ul', { class: 'suggest__list' }, list2.map((s) => h('li', null,
        h('span', { class: 'suggest__text' }, 'You liked ', h('b', { class: 'hand' }, s.from), ', so try ', h('b', { class: 'hand' }, s.to)),
        h('span', { class: `suggest__why${s.mine ? ' is-mine' : ''}` }, s.why),
        s.mine ? null : h('button', { type: 'button', class: 'icon-btn icon-btn--tiny', 'aria-label': `Add ${s.to} to my likes`, title: 'Add to my likes',
          onclick: () => {
            D.store.commit((x) => { x.likes.unshift({ id: D.util.uid(), name: s.to, kind: 'like', rating: 0, category: guessCategory(s.to) === 'Other' ? (cat !== 'All' ? cat : 'Food') : guessCategory(s.to), tags: [], notes: `Suggested after ${s.from}`, photo: '', where: '', when: '', createdAt: new Date().toISOString() }); });
            drawAll();
          } }, icon('plus-lg'))))));
    }

    /* ---------- the entry editor (also used to confirm a voice draft) ---------- */
    function openEntry(entry, draft) {
      const isNew = !entry;
      const base = entry || { id: D.util.uid(), name: '', kind: 'like', rating: 0, category: cat !== 'All' ? cat : 'Food', tags: [], notes: '', photo: '', where: '', when: dateKey(), createdAt: new Date().toISOString(), ...(draft || {}) };
      let kind = base.kind;
      let rating = base.rating;
      let pending = null;           // a new picture chosen but not saved yet
      let dropPhoto = false;

      const name = h('input', { class: 'input input--hand', id: 'le-name', type: 'text', maxlength: 80, value: base.name, autocomplete: 'off' });
      const err = h('p', { class: 'field__error', role: 'alert' });
      const kindBtns = [['like', 'hand-thumbs-up-fill', 'Like'], ['dislike', 'hand-thumbs-down-fill', 'Dislike']].map(([v, ic, t]) => h('button', {
        type: 'button', class: `seg__b${v === kind ? ' is-on' : ''}`, 'aria-pressed': String(v === kind), dataset: { v },
        onclick: () => { kind = v; kindBtns.forEach((b) => { const on = b.dataset.v === v; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); }); },
      }, icon(ic), t));
      const starBtns = [1, 2, 3, 4, 5].map((i) => h('button', {
        type: 'button', class: 'starbtn', role: 'radio', 'aria-label': `${i} star${i === 1 ? '' : 's'}`,
        onclick: () => { rating = rating === i ? 0 : i; paintStars(); },
      }, icon('star-fill')));
      const paintStars = () => starBtns.forEach((b, i) => { b.classList.toggle('on', i < rating); b.setAttribute('aria-checked', String(i + 1 === rating)); });
      paintStars();
      const catSel = h('select', { class: 'input input--select', id: 'le-cat' }, CATS.map((c) => h('option', { value: c, selected: c === base.category }, label(c))));
      const tags = h('input', { class: 'input input--hand', id: 'le-tags', type: 'text', maxlength: 120, value: base.tags.join(', '), placeholder: 'indian, spicy, date night', autocomplete: 'off' });
      const where = h('input', { class: 'input input--hand', id: 'le-where', type: 'text', maxlength: 120, value: base.where, placeholder: 'Where', autocomplete: 'off' });
      const when = h('input', { class: 'input', id: 'le-when', type: 'date', value: base.when });
      const notes = h('textarea', { class: 'input input--hand', id: 'le-notes', rows: 3, maxlength: 1000, placeholder: 'What stood out?' });
      notes.value = base.notes;

      const img = h('img', { class: 'photo__img', alt: 'Your photo', hidden: !base.photo });
      if (base.photo) D.photos.show(img, base.photo);
      const fileIn = h('input', { type: 'file', accept: 'image/*', class: 'visually-hidden', id: 'le-photo', 'aria-label': 'Choose a photo' });
      fileIn.addEventListener('change', async () => {
        const f = fileIn.files && fileIn.files[0];
        if (!f) return;
        try {
          pending = await D.photos.shrink(f); dropPhoto = false;
          img.src = URL.createObjectURL(pending); img.hidden = false;
        } catch (e) { D.util.toast(e.message, 'error'); }
      });
      const photoBox = h('div', { class: 'photo' }, img,
        h('div', { class: 'set__actions' },
          h('label', { class: 'btn-ink btn-ink--ghost btn-ink--small', for: 'le-photo' }, icon('image'), 'Photo'),
          h('button', { type: 'button', class: 'btn-ink btn-ink--ghost btn-ink--small', onclick: () => { pending = null; dropPhoto = true; img.hidden = true; img.removeAttribute('src'); } }, icon('x-lg'), 'Remove')));

      async function save(api) {
        err.textContent = '';
        const n = name.value.trim();
        if (!n) { err.textContent = 'Give it a name.'; name.focus(); return; }
        let photo = dropPhoto ? '' : base.photo;
        if (pending) photo = await D.photos.put(pending);
        if ((dropPhoto || pending) && base.photo && base.photo !== photo) await D.photos.remove(base.photo);
        const next = {
          ...base, name: n, kind, rating, category: catSel.value, photo,
          tags: [...new Set(tags.value.split(/[,#\n]/).map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12),
          notes: notes.value.trim(), where: where.value.trim(), when: when.value || '',
        };
        D.store.commit((s) => {
          const at = s.likes.findIndex((x) => x.id === next.id);
          if (at >= 0) s.likes[at] = next; else s.likes.unshift(next);
        });
        api.close();
        drawAll();
        D.util.toast(isNew ? 'Saved.' : 'Updated.', 'good');
      }

      async function del(api) {
        const ok = await D.util.confirm({ title: 'Delete this entry?', text: `"${base.name}" will be removed.`, confirmLabel: 'Delete', danger: true });
        if (!ok) return;
        if (base.photo) await D.photos.remove(base.photo);
        D.store.commit((s) => { s.likes = s.likes.filter((x) => x.id !== base.id); s.eatLog = s.eatLog.filter((x) => x.id !== base.id); });
        api.close();
        drawAll();
        D.util.toast('Deleted.');
      }

      const api = D.util.modal({
        title: isNew ? (draft ? 'Check this entry' : 'New entry') : 'Edit entry',
        className: 'dlg--wide',
        onSubmit: (a) => save(a),
        body: [
          draft && draft.source ? h('p', { class: 'draft-note' }, icon('mic-fill'), `Heard: "${draft.source}". Fix anything, then save.`) : null,
          h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'le-name' }, 'Name'), D.voice.field(name), err),
          h('div', { class: 'row2' },
            h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Verdict'), h('div', { class: 'seg' }, kindBtns)),
            h('div', { class: 'field' }, h('span', { class: 'field__label', id: 'le-stars' }, 'Rating'), h('div', { class: 'starrow', role: 'radiogroup', 'aria-labelledby': 'le-stars' }, starBtns))),
          h('div', { class: 'row2' },
            h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'le-cat' }, 'Category'), catSel),
            h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'le-when' }, 'When'), when)),
          h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'le-where' }, 'Where'), D.voice.field(where)),
          h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'le-tags' }, 'Tags (comma separated)'), D.voice.field(tags)),
          h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'le-notes' }, 'Notes'), D.voice.field(notes)),
          h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Photo'), photoBox, fileIn),
        ],
        actions: [
          ...(isNew ? [] : [{ label: 'Delete', kind: 'danger', onClick: () => del(api) }]),
          { label: 'Cancel', kind: 'ghost' },
          { label: 'Save', kind: 'primary', submit: true },
        ],
      });
      name.focus();
    }

    async function quickCapture() {
      const text = await D.voice.capture('Try: "I loved the butter chicken at the Indian place, five stars".');
      if (!text) return;
      openEntry(null, parseLikeSentence(text));
    }

    function drawAll() { drawTabs(); drawList(); drawSuggest(); }

    root.append(
      D.pageHead('Likes', 'Likes & dislikes', null, [
        D.voice.supported ? h('button', { type: 'button', class: 'btn-ink btn-ink--ghost btn-ink--small', onclick: quickCapture }, icon('mic-fill'), 'Quick capture by voice') : null,
        h('button', { type: 'button', class: 'btn-ink btn-ink--primary btn-ink--small', onclick: () => eatPick(false) }, icon('egg-fried'), 'What should I eat today?'),
      ]),
      quick, tabs, toolbar, eatSlot, suggestBox, list);
    drawAll();
    if (!D.voice.supported) root.querySelector('.page-head__actions').append(h('p', { class: 'set__line' }, 'Voice capture is not available in this browser, but typing works everywhere.'));
  }

  D.pages.likes = { render, parse: parseLikeSentence };
})(window.Daybook);
