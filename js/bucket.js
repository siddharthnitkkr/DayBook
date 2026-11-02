/* bucket.js — Bucket list and places: paste a map link, a map with golden pins, one-tap visited, and "Plan my day".
   Coordinates always come from a link or a search result you picked. Nothing is guessed. */
(function (D) {
  'use strict';

  const { h, icon, dateKey } = D.util;
  const PCATS = D.store.PLACE_CATS;
  const STATUS_LABEL = { want: 'Want to go', planned: 'Planned', visited: 'Visited' };
  const PRIORITY_LABEL = { 1: 'Low', 2: 'Medium', 3: 'High' };
  const CAT_ICON = { Restaurant: 'cup-hot', Mall: 'bag', Park: 'tree', Trip: 'airplane', Event: 'ticket-perforated', Other: 'geo-alt' };
  const RULES = [
    ['Event', /\b(festival|concert|fair|show|match|event|exhibition|screening)\b/i],
    ['Restaurant', /\b(restaurant|cafe|caf[eé]|kitchen|bar|grill|diner|bistro|eatery|biryani|dhaba|bakery|pizzeria|brewery|tandoor)\b/i],
    ['Mall', /\b(mall|plaza|shopping|market|bazaar|outlet)\b/i],
    ['Trip', /\b(trip|tour|holiday|vacation|resort|hotel|island|getaway|safari)\b/i],
    ['Park', /\b(park|garden|lake|beach|trail|hill|forest|reserve|falls|waterfall|zoo)\b/i],
  ];
  const guessCategory = (t) => { const hit = RULES.find(([, re]) => re.test(t || '')); return hit ? hit[0] : 'Other'; };
  const when = (d) => new Date(`${d}T00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

  const newPlace = (o = {}) => ({
    id: D.util.uid(), name: 'Untitled place', category: 'Other', priority: 2, status: 'want', target: '', notes: '', address: '',
    lat: null, lng: null, link: '', photo: '', visitedAt: '', visitedNote: '', createdAt: new Date().toISOString(), ...o,
  });

  /* "I want to visit the Phoenix mall, really" / "I have been to the lake park" -> a draft you confirm */
  function parsePlaceSentence(raw) {
    const text = String(raw || '').replace(/\s+/g, ' ').trim();
    const visited = /\b(visited|been to|went to|we went|i went)\b/i.test(text);
    const priority = /\b(really want|must|have to|top of my list|can'?t wait)\b/i.test(text) ? 3 : 2;
    let name = text
      .replace(/^(?:i|we)\s+(?:really\s+)?(?:want to|would like to|wanna|should|need to|have to)\s+(?:go to|visit|try|see|check out)\s+/i, '')
      .replace(/^(?:i|we)\s+(?:have\s+|had\s+)?(?:visited|been to|went to)\s+/i, '')
      .replace(/^(?:add|put|save)\s+/i, '')
      .replace(/^let'?s\s+(?:go to|visit|try)\s+/i, '')
      .replace(/\s+(?:to|on|for)\s+(?:my|our)\s+(?:bucket\s+)?list\.?$/i, '')
      .replace(/[,.]?\s*\b(?:really|please)\b.*$/i, '')
      .replace(/^(?:the|a|an)\s+/i, '')
      .replace(/^[\s,.-]+|[\s,.-]+$/g, '');
    name = name || text;
    return { name: name.charAt(0).toUpperCase() + name.slice(1, 100), category: guessCategory(text), priority, status: visited ? 'visited' : 'want', visitedAt: visited ? dateKey() : '', source: text };
  }

  function render(root) {
    const st = () => D.store.state;
    let view = 'list';
    let filter = 'all';
    let query = '';
    let map = null;
    let layer = null;
    let planDate = dateKey();
    let plan = [];
    const placeOf = (id) => st().places.find((p) => p.id === id);
    const dead = [];      // things to tidy when the page goes away

    /* ---------- adding: paste a link or type a name ---------- */
    const addInput = h('input', { class: 'input input--hand', type: 'text', id: 'place-add', maxlength: 900, autocomplete: 'off', placeholder: 'Paste a Google Maps or Apple Maps link, or type a place name', 'aria-label': 'Add a place' });
    const addForm = h('form', {
      class: 'quick', novalidate: true,
      onsubmit: (e) => { e.preventDefault(); addFrom(addInput.value); },
    }, D.voice.field(addInput), h('button', { type: 'submit', class: 'btn-ink btn-ink--primary' }, icon('plus-lg'), 'Add'));

    function savePlace(p) {
      D.store.commit((s) => { const i = s.places.findIndex((x) => x.id === p.id); if (i >= 0) s.places[i] = p; else s.places.unshift(p); });
    }

    function addFrom(text) {
      const r = D.maplink.parse(text);
      if (r.kind === 'empty') { addInput.focus(); return; }
      if (r.kind === 'other' || r.kind === 'bad') { D.util.toast(r.note, 'error'); return; }
      if (r.kind === 'short') {
        openSearch({ query: '', link: r.link, note: 'That is a shortened share link. Browsers cannot read where it points, so I cannot see the place name or position. Search for the place by name and pick the right match, or open the link to check what it is.' });
        return;
      }
      if (r.kind === 'name') { openSearch({ query: r.name, note: 'Search finds the place on the map. If it is not there, add it without a pin.' }); return; }
      const p = newPlace({ name: r.name, address: r.address, lat: r.lat, lng: r.lng, link: r.link, category: guessCategory(`${r.name} ${r.address}`) });
      savePlace(p);
      addInput.value = '';
      drawAll();
      flashRow(p.id);
      if (p.lat == null) {
        D.util.toast(`Added "${p.name}", but the link has no position. Use Find on map to pin it.`);
        openSearch({ query: p.name, forId: p.id, link: p.link, note: 'This link names the place but does not say where it is. Search to pin it.' });
      } else D.util.toast(`Added "${p.name}".`, 'good');
    }

    /* ---------- the address and place search (Nominatim) ----------
       Type an address or a place name and pause: up to five matches appear as tappable cards with the full address.
       No match? Simpler versions are tried automatically (without the unit number, without the postal code, then the
       place name plus the city) and you are told which one matched. Results lean toward the area the map shows, or your
       home city from Settings. Pinning by hand is the last resort. */
    let focusTarget = null;     // a pin to zoom to as soon as the map is drawn
    function searchBias() {
      const home = D.maplink.homeCenter();
      if (map) return D.maplink.boundsBox(map.getBounds());
      return home ? D.maplink.around(home.lat, home.lng) : undefined;
    }

    function openSearch({ query: q0, forId, link, note }) {
      const q = h('input', { class: 'input input--hand', id: 'ps-q', type: 'text', maxlength: 200, value: q0 || '', placeholder: 'Address or place name', autocomplete: 'off' });
      const status = h('p', { class: 'set__line', role: 'status' }, note || '');
      const used = h('p', { class: 'set__line used', hidden: true });
      const results = h('ul', { class: 'results' });
      const manual = h('button', { type: 'button', class: 'btn-ink btn-ink--ghost btn-ink--small', hidden: true, onclick: () => { dlg.close(); startManualPin({ name: q.value.trim(), forId }); } }, icon('geo-alt'), 'Pin it by hand');
      let seq = 0;
      let timer = 0;

      async function go() {
        clearTimeout(timer);
        const text = q.value.trim();
        if (!text) { status.textContent = 'Type an address or a place name.'; q.focus(); return; }
        const mine = ++seq;
        D.util.clear(results); used.hidden = true; manual.hidden = true; status.textContent = 'Searching…';
        try {
          const r = await D.maplink.searchSmart(text, {
            viewbox: searchBias(),
            onTry: (label, retry) => { if (mine === seq && retry) status.textContent = `No match yet. Trying again ${label}…`; },
          });
          if (mine !== seq) return;
          if (!r.rows.length) {
            status.textContent = `No match, even after trying: ${r.tried.join('; ')}. Check the spelling, add the city, or pin it by hand.`;
            manual.hidden = false;
            return;
          }
          status.textContent = 'Tap the right match:';
          if (r.used.label !== 'what you typed') { used.hidden = false; used.textContent = `Matched using ${r.used.label}.`; }
          r.rows.forEach((row) => results.append(h('li', null, h('button', { type: 'button', class: 'result', onclick: () => choose(row) },
            h('b', { class: 'hand' }, row.name),
            h('span', { class: 'result__addr' }, `${row.type ? `${row.type} · ` : ''}${row.address}`)))));
          manual.hidden = false;
        } catch (e) {
          if (e.code === 'aborted' || mine !== seq) return;
          status.textContent = e.message || 'The search could not run.';
          manual.hidden = false;
        }
      }
      q.addEventListener('input', () => { clearTimeout(timer); if (q.value.trim().length >= 4) timer = setTimeout(go, 900); });   // a short pause after you stop typing

      function choose(r) {
        let id = forId;
        if (forId) {
          const pl = placeOf(forId);
          if (pl) savePlace({ ...pl, lat: r.lat, lng: r.lng, address: pl.address || r.address });
        } else {
          const pl = newPlace({ name: r.name, address: r.address, lat: r.lat, lng: r.lng, link: link || '', category: guessCategory(`${r.name} ${r.type}`) });
          id = pl.id; savePlace(pl);
        }
        addInput.value = '';
        dlg.close();
        focusTarget = { lat: r.lat, lng: r.lng, id };
        drawAll();
        setView('map');
        D.util.toast('Pinned. Zooming to it.', 'good');
      }

      const dlg = D.util.modal({
        title: forId ? 'Find it on the map' : 'Find the place',
        className: 'dlg--wide',
        onSubmit: go,
        body: [
          link ? h('p', { class: 'set__line' }, 'Your link: ', h('a', { href: link, target: '_blank', rel: 'noopener noreferrer' }, 'open it to check'), '.') : null,
          h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'ps-q' }, 'Address or place name'), D.voice.field(q)),
          status, used, results,
          h('div', { class: 'set__actions' }, manual),
          h('p', { class: 'set__line' }, 'Search uses the free OpenStreetMap Nominatim service: one request at a time, after you pause typing.'),
        ],
        actions: [
          { label: 'Cancel', kind: 'ghost' },
          ...(forId ? [] : [{ label: 'Add without a pin', kind: 'ghost', onClick: () => {
            const name = q.value.trim() || 'New place';
            const pl = newPlace({ name, link: link || '', category: guessCategory(name) });
            savePlace(pl); flashRow(pl.id); addInput.value = ''; dlg.close(); drawAll();
          } }]),
          { label: 'Search', kind: 'primary', submit: true },
        ],
      });
      dlg.el.addEventListener('close', () => { clearTimeout(timer); seq += 1; });
      q.focus();
      if (q.value) go();
    }

    /* ---------- last resort: pin the exact spot by hand ----------
       The map opens zoomed near your home city, a draggable pin appears, and you tap the exact spot or use your location. */
    const pinBar = h('div', { class: 'pinbar', hidden: true });
    let pinning = null;
    async function startManualPin({ name = '', forId = null } = {}) {
      setView('map');
      await drawMap();
      if (!map) { D.util.toast('The map needs the internet to pin a spot.'); return; }
      const L = window.L;
      const home = D.maplink.homeCenter();
      const c = home || map.getCenter();
      map.setView([c.lat, c.lng], home ? 14 : Math.max(map.getZoom(), 11));
      if (pinning) endPin();
      const marker = L.marker([c.lat, c.lng], { draggable: true, icon: pinIcon(L, { status: 'want' }), zIndexOffset: 1000, title: 'Drag me to the exact spot' }).addTo(map);
      pinning = { marker, forId };
      const nameIn = h('input', { class: 'input input--hand', type: 'text', maxlength: 100, value: name, placeholder: 'Name this place', 'aria-label': 'Name this place' });
      const move = (ll) => { marker.setLatLng(ll); };
      pinning.click = (e) => move(e.latlng);
      map.on('click', pinning.click);
      D.util.clear(pinBar);
      pinBar.append(
        h('p', { class: 'pinbar__hint' }, icon('hand-index'), 'Tap the exact spot on the map, or drag the pin.'),
        D.voice.field(nameIn),
        h('div', { class: 'set__actions' },
          h('button', { type: 'button', class: 'btn-ink btn-ink--ghost btn-ink--small', onclick: () => {
            if (!navigator.geolocation) { D.util.toast('This browser cannot share your location.'); return; }
            navigator.geolocation.getCurrentPosition(
              (pos) => { const ll = { lat: pos.coords.latitude, lng: pos.coords.longitude }; move(ll); map.setView([ll.lat, ll.lng], 17); },
              () => D.util.toast('Could not get your location. Allow it for this site, or tap the spot by hand.'),
              { enableHighAccuracy: true, timeout: 10000 });
          } }, icon('crosshair'), 'Use my current location'),
          h('button', { type: 'button', class: 'btn-ink btn-ink--primary btn-ink--small', onclick: () => {
            const ll = marker.getLatLng();
            const lat = Math.round(ll.lat * 1e6) / 1e6;
            const lng = Math.round(ll.lng * 1e6) / 1e6;
            const target = forId ? placeOf(forId) : null;
            if (target) savePlace({ ...target, lat, lng });
            else { const pl = newPlace({ name: nameIn.value.trim() || 'Pinned spot', lat, lng, category: guessCategory(nameIn.value) }); savePlace(pl); focusTarget = { lat, lng, id: pl.id }; }
            endPin(); addInput.value = ''; drawAll(); D.util.toast('Pinned by hand.', 'good');
          } }, icon('check2'), 'Save pin'),
          h('button', { type: 'button', class: 'btn-ink btn-ink--ghost btn-ink--small', onclick: endPin }, 'Cancel')));
      pinBar.hidden = false;
      nameIn.focus({ preventScroll: true });
    }
    function endPin() {
      if (pinning && map) { map.removeLayer(pinning.marker); map.off('click', pinning.click); }
      pinning = null; pinBar.hidden = true;
    }

    /* ---------- list ---------- */
    const chips = h('div', { class: 'tabs', role: 'group', 'aria-label': 'Status' });
    const searchInput = h('input', { class: 'input input--hand', type: 'search', placeholder: 'Search places', autocomplete: 'off', 'aria-label': 'Search places' });
    searchInput.addEventListener('input', () => { query = searchInput.value.trim().toLowerCase(); drawList(); if (view === 'map') drawMap(); });
    const list = h('ul', { class: 'prows' });

    const shown = () => st().places.filter((p) => (filter === 'all' || p.status === filter)
      && (!query || `${p.name} ${p.address} ${p.notes} ${p.category}`.toLowerCase().includes(query)));

    function drawChips() {
      D.util.clear(chips);
      [['all', 'All'], ['want', 'Want to go'], ['planned', 'Planned'], ['visited', 'Visited']].forEach(([v, t]) => {
        const n = v === 'all' ? st().places.length : st().places.filter((p) => p.status === v).length;
        chips.append(h('button', { type: 'button', class: `tab${v === filter ? ' is-on' : ''}`, 'aria-pressed': String(v === filter), onclick: () => { filter = v; drawAll(); } }, t, h('span', { class: 'tab__n' }, String(n))));
      });
    }

    function markVisited(p, btn, rowEl) {
      const now = p.status !== 'visited';
      savePlace({ ...p, status: now ? 'visited' : 'want', visitedAt: now ? dateKey() : '' });
      drawAll();
      if (now) {
        const fresh = list.querySelector(`[data-id="${CSS.escape(p.id)}"]`);
        D.util.burst(fresh && fresh.querySelector('.vbtn'), { circle: true, scale: 2.6, count: 3 });
        D.util.burst(fresh, { scale: 1.1, count: 3 });
        D.util.toast('Visited! Open the card to add a note or a photo.', 'good');
      }
    }

    function row(p) {
      const pinned = p.lat != null;
      const url = D.maplink.openUrl(p);
      const meta = [p.category, `${PRIORITY_LABEL[p.priority]} priority`, p.target && p.status !== 'visited' ? `on ${when(p.target)}` : '', p.status === 'visited' && p.visitedAt ? `visited ${when(p.visitedAt)}` : ''].filter(Boolean).join(' · ');
      const li = h('li', { class: `prow prow--${p.status}`, dataset: { id: p.id }, style: { '--tilt': `${D.util.tilt(p.id, 1).toFixed(2)}deg` } },
        h('button', { type: 'button', class: 'prow__main', 'aria-label': `Open ${p.name}`, onclick: () => openPlace(p) },
          h('span', { class: `dot dot--${p.status}`, title: STATUS_LABEL[p.status] }, icon(CAT_ICON[p.category])),
          h('span', { class: 'prow__text' },
            h('span', { class: 'prow__name hand' }, D.util.ink(p.name, p.id)),
            h('span', { class: 'prow__meta' }, meta),
            p.address ? h('span', { class: 'prow__addr' }, p.address) : null,
            pinned ? null : h('span', { class: 'prow__nopin' }, icon('geo'), 'No pin yet'))),
        h('span', { class: 'prow__actions' },
          h('button', { type: 'button', class: `icon-btn vbtn${p.status === 'visited' ? ' is-on' : ''}`, 'aria-pressed': String(p.status === 'visited'), 'aria-label': p.status === 'visited' ? `Mark ${p.name} as not visited` : `Mark ${p.name} as visited`, title: 'Visited', onclick: () => markVisited(p) }, icon('check2-circle')),
          url ? h('a', { class: 'icon-btn', href: url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `Open ${p.name} in Maps`, title: 'Open in Maps' }, icon('box-arrow-up-right')) : null));
      return li;
    }

    function flashRow(id) { setTimeout(() => { const el = list.querySelector(`[data-id="${CSS.escape(id)}"]`); if (el) { el.scrollIntoView({ block: 'nearest' }); D.util.burst(el, { scale: 1.1, count: 2 }); } }, 60); }

    function drawList() {
      D.util.clear(list);
      const items = shown().sort((a, b) => b.priority - a.priority || b.createdAt.localeCompare(a.createdAt));
      if (!items.length) {
        list.append(h('li', { class: 'empty' },
          h('p', { class: 'empty__title' }, D.util.ink(st().places.length ? 'Nothing matches that.' : 'Nothing here yet. Where do you want to go?', 'places-empty')),
          h('p', null, st().places.length ? 'Try another status or clear the search.' : 'Paste a map link, type a place name, or tap the map to drop a pin.')));
        return;
      }
      items.forEach((p) => list.append(row(p)));
    }

    /* ---------- the place card editor ---------- */
    function openPlace(entry, draft) {
      const isNew = !entry;
      const base = entry || newPlace(draft || {});
      let pending = null;
      let dropPhoto = false;
      let lat = base.lat;
      let lng = base.lng;
      let preview = null;

      const name = h('input', { class: 'input input--hand', id: 'pl-name', type: 'text', maxlength: 100, value: base.name, autocomplete: 'off' });
      const err = h('p', { class: 'field__error', role: 'alert' });
      const cat = h('select', { class: 'input input--select', id: 'pl-cat' }, PCATS.map((c) => h('option', { value: c, selected: c === base.category }, c)));
      const pri = h('select', { class: 'input input--select', id: 'pl-pri' }, [1, 2, 3].map((n) => h('option', { value: n, selected: n === base.priority }, PRIORITY_LABEL[n])));
      const stat = h('select', { class: 'input input--select', id: 'pl-stat', onchange: () => paintVisited() }, Object.entries(STATUS_LABEL).map(([v, t]) => h('option', { value: v, selected: v === base.status }, t)));
      const target = h('input', { class: 'input', id: 'pl-target', type: 'date', value: base.target });
      const address = h('input', { class: 'input input--hand', id: 'pl-addr', type: 'text', maxlength: 220, value: base.address, autocomplete: 'off', placeholder: 'Address' });
      const link = h('input', { class: 'input', id: 'pl-link', type: 'url', maxlength: 900, value: base.link, autocomplete: 'off', placeholder: 'https://… (optional)' });
      const notes = h('textarea', { class: 'input input--hand', id: 'pl-notes', rows: 2, maxlength: 1000, placeholder: 'Why do you want to go?' });
      notes.value = base.notes;
      const vnote = h('textarea', { class: 'input input--hand', id: 'pl-vnote', rows: 2, maxlength: 600, placeholder: 'How was it?' });
      vnote.value = base.visitedNote;
      const vfield = h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'pl-vnote' }, 'How was it?'), D.voice.field(vnote));
      const paintVisited = () => { vfield.hidden = stat.value !== 'visited'; };
      paintVisited();

      const pin = h('div', { class: 'pinrow' });
      const mini = h('div', { class: 'minimap', hidden: true });
      function paintPin() {
        D.util.clear(pin);
        if (lat != null) {
          pin.append(h('span', { class: 'set__line' }, icon('geo-alt-fill'), `Pinned at ${lat.toFixed(5)}, ${lng.toFixed(5)}`),
            h('button', { type: 'button', class: 'btn-ink btn-ink--ghost btn-ink--small', onclick: () => { lat = null; lng = null; paintPin(); } }, 'Remove pin'));
        } else {
          pin.append(h('span', { class: 'set__line' }, icon('geo'), 'No pin yet.'),
            h('button', { type: 'button', class: 'btn-ink btn-ink--ghost btn-ink--small', onclick: () => { dlg.close(); openSearch({ query: name.value || base.name, forId: isNew ? null : base.id, link: base.link }); } }, icon('search'), 'Find on map'));
        }
        mini.hidden = lat == null;
        if (lat == null && preview) { preview.remove(); preview = null; }
        if (lat != null) showPreview();
      }
      function showPreview() {
        D.maplink.leaflet().then((L) => {
          if (lat == null || !mini.isConnected) return;
          if (preview) { preview.remove(); preview = null; }
          preview = L.map(mini, { zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, attributionControl: true }).setView([lat, lng], 15);
          L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(preview);
          L.marker([lat, lng], { icon: pinIcon(L, { status: stat.value }), interactive: false, keyboard: false }).addTo(preview);
          setTimeout(() => preview && preview.invalidateSize(), 150);
        }).catch((e) => { mini.hidden = true; D.util.toast(e.message); });
      }

      const img = h('img', { class: 'photo__img', alt: 'Your photo', hidden: !base.photo });
      if (base.photo) D.photos.show(img, base.photo);
      const fileIn = h('input', { type: 'file', accept: 'image/*', class: 'visually-hidden', id: 'pl-photo', 'aria-label': 'Choose a photo' });
      fileIn.addEventListener('change', async () => {
        const f = fileIn.files && fileIn.files[0];
        if (!f) return;
        try { pending = await D.photos.shrink(f); dropPhoto = false; img.src = URL.createObjectURL(pending); img.hidden = false; } catch (e) { D.util.toast(e.message, 'error'); }
      });
      const photoBox = h('div', { class: 'photo' }, img, h('div', { class: 'set__actions' },
        h('label', { class: 'btn-ink btn-ink--ghost btn-ink--small', for: 'pl-photo' }, icon('image'), 'Photo'),
        h('button', { type: 'button', class: 'btn-ink btn-ink--ghost btn-ink--small', onclick: () => { pending = null; dropPhoto = true; img.hidden = true; img.removeAttribute('src'); } }, icon('x-lg'), 'Remove')));

      async function save(api) {
        err.textContent = '';
        const n = name.value.trim();
        if (!n) { err.textContent = 'Give the place a name.'; name.focus(); return; }
        let url = '';
        if (link.value.trim()) {
          try { const u = new URL(link.value.trim()); if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('x'); url = u.href; } catch (e) { err.textContent = 'The link must start with http:// or https://'; link.focus(); return; }
        }
        let photo = dropPhoto ? '' : base.photo;
        if (pending) photo = await D.photos.put(pending);
        if ((dropPhoto || pending) && base.photo && base.photo !== photo) await D.photos.remove(base.photo);
        const status = stat.value;
        const wasVisited = base.status === 'visited';
        const next = {
          ...base, name: n, category: cat.value, priority: Number(pri.value), status, target: target.value || '', address: address.value.trim(), link: url,
          notes: notes.value.trim(), visitedNote: vnote.value.trim(), lat, lng, photo,
          visitedAt: status === 'visited' ? (base.visitedAt || dateKey()) : '',
        };
        savePlace(next);
        api.close();
        drawAll();
        flashRow(next.id);
        if (status === 'visited' && !wasVisited) { setTimeout(() => D.util.burst(list.querySelector(`[data-id="${CSS.escape(next.id)}"] .vbtn`), { circle: true, scale: 2.6 }), 120); }
        D.util.toast(isNew ? 'Saved.' : 'Updated.', 'good');
      }

      async function del(api) {
        const ok = await D.util.confirm({ title: 'Delete this place?', text: `"${base.name}" will be removed from your list.`, confirmLabel: 'Delete', danger: true });
        if (!ok) return;
        if (base.photo) await D.photos.remove(base.photo);
        D.store.commit((s) => { s.places = s.places.filter((x) => x.id !== base.id); Object.keys(s.plans).forEach((d) => { s.plans[d] = s.plans[d].filter((it) => !(it.kind === 'place' && it.id === base.id)); }); });
        api.close(); drawAll(); D.util.toast('Deleted.');
      }

      const dlg = D.util.modal({
        title: isNew ? (draft && draft.source ? 'Check this place' : 'New place') : 'Place card',
        className: 'dlg--wide',
        onSubmit: (a) => save(a),
        body: [
          draft && draft.source ? h('p', { class: 'draft-note' }, icon('mic-fill'), `Heard: "${draft.source}". Fix anything, then save.`) : null,
          h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'pl-name' }, 'Name'), D.voice.field(name), err),
          h('div', { class: 'row3' },
            h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'pl-cat' }, 'Category'), cat),
            h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'pl-pri' }, 'Priority'), pri),
            h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'pl-stat' }, 'Status'), stat)),
          h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'pl-target' }, 'Target date (optional)'), target),
          h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'pl-addr' }, 'Address'), D.voice.field(address)),
          pin, mini,
          h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'pl-link' }, 'Map link'), link),
          h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'pl-notes' }, 'Notes'), D.voice.field(notes)),
          vfield,
          h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Photo'), photoBox, fileIn),
        ],
        actions: [
          ...(isNew ? [] : [{ label: 'Delete', kind: 'danger', onClick: () => del(dlg) }]),
          ...(!isNew && D.maplink.openUrl(base) ? [{ label: 'Open in Maps', kind: 'ghost', onClick: () => window.open(D.maplink.openUrl(base), '_blank', 'noopener,noreferrer') }] : []),
          { label: 'Cancel', kind: 'ghost' },
          { label: 'Save', kind: 'primary', submit: true },
        ],
      });
      dlg.el.addEventListener('close', () => { if (preview) { preview.remove(); preview = null; } });
      paintPin();
      name.focus();
    }

    /* ---------- the map ---------- */
    const mapHost = h('div', { class: 'mapwrap', hidden: true },
      pinBar,
      h('div', { class: 'mapbox', id: 'place-map', role: 'application', 'aria-label': 'Map of your places. Tap an empty spot to add a place there.' }),
      h('p', { class: 'set__line mapnote' }, 'Tap a pin for its card. Tap an empty spot to add a place there.'));
    const mapEl = mapHost.querySelector('.mapbox');

    function pinIcon(L, p) {
      return L.divIcon({ className: `pin pin--${p.status}`, html: '<span class="pin__body"></span>', iconSize: [30, 38], iconAnchor: [15, 36], popupAnchor: [0, -32] });
    }

    function popupCard(p) {
      const url = D.maplink.openUrl(p);
      return h('div', { class: 'popcard' },
        h('p', { class: 'popcard__name hand' }, p.name),
        h('p', { class: 'popcard__meta' }, `${STATUS_LABEL[p.status]} · ${p.category}`),
        p.address ? h('p', { class: 'popcard__addr' }, p.address) : null,
        h('div', { class: 'popcard__actions' },
          h('button', { type: 'button', class: 'btn-ink btn-ink--small btn-ink--primary', onclick: () => { map.closePopup(); markVisited(p); } }, icon('check2-circle'), p.status === 'visited' ? 'Undo visited' : 'Visited'),
          url ? h('a', { class: 'btn-ink btn-ink--small btn-ink--ghost', href: url, target: '_blank', rel: 'noopener noreferrer' }, icon('box-arrow-up-right'), 'Open in Maps') : null,
          h('button', { type: 'button', class: 'btn-ink btn-ink--small btn-ink--ghost', onclick: () => { map.closePopup(); openPlace(p); } }, 'Edit')));
    }

    function dropForm(latlng) {
      const input = h('input', { class: 'input input--hand', type: 'text', maxlength: 100, placeholder: 'Name this place', 'aria-label': 'Name this place' });
      const go = () => {
        const p = newPlace({ name: input.value.trim() || 'Dropped pin', lat: Math.round(latlng.lat * 1e6) / 1e6, lng: Math.round(latlng.lng * 1e6) / 1e6, category: guessCategory(input.value) });
        savePlace(p); map.closePopup(); drawAll(); flashRow(p.id); D.util.toast(`Added "${p.name}".`, 'good');
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
      return h('div', { class: 'popcard' },
        h('p', { class: 'popcard__meta' }, 'Add a place here?'),
        D.voice.field(input),
        h('div', { class: 'popcard__actions' },
          h('button', { type: 'button', class: 'btn-ink btn-ink--small btn-ink--primary', onclick: go }, icon('plus-lg'), 'Add here'),
          h('button', { type: 'button', class: 'btn-ink btn-ink--small btn-ink--ghost', onclick: () => map.closePopup() }, 'Cancel')));
    }

    async function drawMap() {
      mapHost.hidden = false;
      let L;
      try { L = await D.maplink.leaflet(); } catch (e) {
        mapEl.replaceChildren(h('p', { class: 'empty__title' }, D.util.ink('The map needs the internet.', 'map-offline')), h('p', { class: 'set__line' }, `${e.message} Your list still works.`));
        return;
      }
      if (view !== 'map') return;
      if (!map) {
        mapEl.replaceChildren();
        map = L.map(mapEl, { zoomControl: true, worldCopyJump: true }).setView([25, 15], 2);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
        layer = L.layerGroup().addTo(map);
        map.on('click', (e) => { if (pinning) return; L.popup({ className: 'glass-pop' }).setLatLng(e.latlng).setContent(dropForm(e.latlng)).openOn(map); });
        const home = D.maplink.homeCenter();
        if (home) map.setView([home.lat, home.lng], 11);   // start near your home city
      }
      layer.clearLayers();
      const pts = [];
      const byId = {};
      shown().filter((p) => p.lat != null).forEach((p) => {
        byId[p.id] = L.marker([p.lat, p.lng], { icon: pinIcon(L, p), title: p.name, riseOnHover: true }).bindPopup(popupCard(p), { className: 'glass-pop' }).addTo(layer);
        pts.push([p.lat, p.lng]);
      });
      const focus = focusTarget; focusTarget = null;
      await new Promise((r) => setTimeout(r, 60));
      map.invalidateSize();
      if (focus) {                                              // a place you just picked: drop the pin and zoom to it
        map.setView([focus.lat, focus.lng], 16);
        if (byId[focus.id]) setTimeout(() => byId[focus.id].openPopup(), 300);
      } else if (pinning) { /* keep the view where the pin is */ } else if (pts.length === 1) map.setView(pts[0], 14);
      else if (pts.length > 1) map.fitBounds(pts, { padding: [36, 36], maxZoom: 15 });
    }
    dead.push(() => { endPin(); if (map) { map.remove(); map = null; } });

    /* ---------- plan my day ---------- */
    const planHost = h('div', { class: 'planbox', hidden: true });

    function openPlaces() { return st().places.filter((p) => p.status !== 'visited'); }

    function suggestPlan(date) {
      const inPlan = new Set(plan.map((x) => x.id));
      const open = openPlaces().filter((p) => !inPlan.has(p.id));
      const pinned = open.filter((p) => p.lat != null);
      const seed = [...pinned].sort((a, b) => (b.target === date) - (a.target === date) || b.priority - a.priority || a.createdAt.localeCompare(b.createdAt))[0];
      const items = [];
      if (seed) {
        items.push({ kind: 'place', id: seed.id, ok: false });
        let last = seed;
        const pool = pinned.filter((p) => p.id !== seed.id && D.maplink.distKm(seed, p) <= 15);
        while (items.length < 4 && pool.length) {
          pool.sort((a, b) => D.maplink.distKm(last, a) - D.maplink.distKm(last, b));
          last = pool.shift();
          items.push({ kind: 'place', id: last.id, ok: false });
        }
      }
      open.filter((p) => p.lat == null).sort((a, b) => b.priority - a.priority).slice(0, Math.max(0, 3 - items.length)).forEach((p) => items.push({ kind: 'place', id: p.id, ok: false }));
      const food = D.pickFood(st(), []);
      if (food) items.splice(Math.min(2, items.length), 0, { kind: 'food', id: food.id, ok: false });
      return items;
    }

    function loadSavedPlan() {
      plan = (st().plans[planDate] || []).filter((it) => (it.kind === 'place' ? placeOf(it.id) : st().likes.some((l) => l.id === it.id))).map((it) => ({ ...it, ok: true }));
    }

    function persistPlan() {
      const okItems = plan.filter((x) => x.ok).map(({ kind, id }) => ({ kind, id }));
      D.store.commit((s) => {
        if (okItems.length) s.plans[planDate] = okItems; else delete s.plans[planDate];
        plan.forEach((x) => {
          if (x.kind !== 'place') return;
          const p = s.places.find((q) => q.id === x.id);
          if (p && p.status !== 'visited') { if (x.ok) { p.status = 'planned'; p.target = planDate; } else if (p.status === 'planned' && p.target === planDate) { p.status = 'want'; p.target = ''; } }
        });
      });
    }

    function swapItem(i) {
      const it = plan[i];
      const taken = new Set(plan.map((x) => x.id));
      if (it.kind === 'food') {
        const f = D.pickFood(st(), [...taken]);
        if (!f) { D.util.toast('No other liked food to swap in.'); return; }
        plan[i] = { kind: 'food', id: f.id, ok: false };
      } else {
        const prev = plan.slice(0, i).reverse().map((x) => placeOf(x.id)).find((p) => p && p.lat != null);
        const pool = openPlaces().filter((p) => !taken.has(p.id));
        if (prev) pool.sort((a, b) => (a.lat == null) - (b.lat == null) || D.maplink.distKm(prev, a.lat != null ? a : prev) - D.maplink.distKm(prev, b.lat != null ? b : prev));
        else pool.sort((a, b) => b.priority - a.priority);
        if (!pool.length) { D.util.toast('No other unvisited place to swap in.'); return; }
        const was = placeOf(it.id);
        if (it.ok && was && was.status === 'planned' && was.target === planDate) D.store.commit((s) => { const q = s.places.find((x) => x.id === was.id); q.status = 'want'; q.target = ''; });
        plan[i] = { kind: 'place', id: pool[0].id, ok: false };
      }
      drawPlan();
    }

    function removeItem(i) {
      const it = plan[i];
      plan.splice(i, 1);
      if (it.kind === 'place') { const p = placeOf(it.id); if (p && p.status === 'planned' && p.target === planDate) D.store.commit((s) => { const q = s.places.find((x) => x.id === p.id); q.status = 'want'; q.target = ''; }); }
      persistPlan(); drawAll();
    }

    function acceptItem(i) { plan[i].ok = !plan[i].ok; persistPlan(); drawAll(); }

    function drawPlan() {
      D.util.clear(planHost);
      const dateIn = h('input', { class: 'input', type: 'date', id: 'plan-date', value: planDate, 'aria-label': 'Day to plan', onchange: (e) => { planDate = e.target.value || dateKey(); loadSavedPlan(); drawPlan(); } });
      planHost.append(h('div', { class: 'planbar' },
        h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'plan-date' }, 'Day'), dateIn),
        h('button', { type: 'button', class: 'btn-ink btn-ink--primary', onclick: () => { plan = suggestPlan(planDate); if (!plan.length) D.util.toast('Add some places to your list first.'); drawPlan(); } }, icon('magic'), 'Suggest a plan')));
      if (!plan.length) {
        planHost.append(h('div', { class: 'empty' },
          h('p', { class: 'empty__title' }, D.util.ink(openPlaces().length ? 'Pick a day and I will suggest a plan.' : 'Nothing to plan yet.', 'plan-empty')),
          h('p', null, openPlaces().length ? 'I group places that are close together and add a food idea from your likes.' : 'Add some places you want to go, then come back.')));
        return;
      }
      const rows = plan.map((it, i) => {
        if (it.kind === 'food') {
          const f = st().likes.find((x) => x.id === it.id);
          return h('li', { class: `plrow${it.ok ? ' is-ok' : ''}` },
            h('span', { class: 'dot dot--food' }, icon('egg-fried')),
            h('span', { class: 'plrow__text' }, h('span', { class: 'plrow__name hand' }, f ? f.name : 'A liked food'), h('span', { class: 'prow__meta' }, f ? `Food idea${f.where ? ` · ${f.where}` : ''}` : '')),
            planButtons(i, it));
        }
        const p = placeOf(it.id);
        if (!p) return null;
        const prev = plan.slice(0, i).reverse().map((x) => (x.kind === 'place' ? placeOf(x.id) : null)).find((q) => q && q.lat != null);
        const gap = prev && p.lat != null ? `${D.maplink.distKm(prev, p).toFixed(1)} km from the previous stop` : (p.lat == null ? 'no pin yet' : '');
        return h('li', { class: `plrow${it.ok ? ' is-ok' : ''}` },
          h('span', { class: `dot dot--${p.status}` }, icon(CAT_ICON[p.category])),
          h('span', { class: 'plrow__text' }, h('span', { class: 'plrow__name hand' }, p.name), h('span', { class: 'prow__meta' }, [p.category, gap].filter(Boolean).join(' · '))),
          planButtons(i, it));
      });
      planHost.append(h('ol', { class: 'plrows' }, rows),
        h('div', { class: 'set__actions' },
          h('button', { type: 'button', class: 'btn-ink btn-ink--primary btn-ink--small', onclick: () => { plan.forEach((x) => { x.ok = true; }); persistPlan(); drawAll(); D.util.toast('Plan saved.', 'good'); } }, icon('check2-all'), 'Accept all'),
          h('button', { type: 'button', class: 'btn-ink btn-ink--ghost btn-ink--small', onclick: () => { plan = suggestPlan(planDate); drawPlan(); } }, icon('shuffle'), 'Suggest again')));
    }

    function planButtons(i, it) {
      return h('span', { class: 'prow__actions' },
        h('button', { type: 'button', class: `icon-btn${it.ok ? ' is-on' : ''}`, 'aria-pressed': String(!!it.ok), 'aria-label': it.ok ? 'Accepted. Tap to undo' : 'Accept this stop', title: 'Accept', onclick: () => acceptItem(i) }, icon('check2')),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Swap this stop', title: 'Swap', onclick: () => swapItem(i) }, icon('arrow-repeat')),
        h('button', { type: 'button', class: 'icon-btn icon-btn--danger', 'aria-label': 'Remove this stop', title: 'Remove', onclick: () => removeItem(i) }, icon('x-lg')));
    }

    /* ---------- tabs and wiring ---------- */
    const viewSeg = h('div', { class: 'seg seg--wide', role: 'group', 'aria-label': 'View' }, [['list', 'list-ul', 'List'], ['map', 'map', 'Map'], ['plan', 'calendar-check', 'Plan my day']].map(([v, ic, t]) => h('button', {
      type: 'button', class: `seg__b${v === view ? ' is-on' : ''}`, 'aria-pressed': String(v === view), dataset: { v },
      onclick: () => setView(v),
    }, icon(ic), t)));

    const listWrap = h('div', { class: 'listwrap' }, list);
    function setView(v) {
      view = v;
      viewSeg.querySelectorAll('.seg__b').forEach((b) => { const on = b.dataset.v === v; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); });
      listWrap.hidden = v !== 'list';
      mapHost.hidden = v !== 'map';
      planHost.hidden = v !== 'plan';
      toolbarEl.hidden = v === 'plan';
      if (v === 'map') drawMap();
      if (v === 'plan') { if (!plan.length) loadSavedPlan(); drawPlan(); }
    }

    function drawAll() {
      drawChips(); drawList();
      if (view === 'map') drawMap();
      if (view === 'plan') drawPlan();
    }

    async function quickCapture() {
      const text = await D.voice.capture('Try: "I want to visit the lake park near the old fort".');
      if (!text) return;
      openPlace(null, parsePlaceSentence(text));
    }

    const toolbarEl = h('div', { class: 'toolbar toolbar--2' }, chips, D.voice.field(searchInput));
    root.append(
      D.pageHead('Bucket list', 'Bucket list & places', null, [
        D.voice.supported ? h('button', { type: 'button', class: 'btn-ink btn-ink--ghost btn-ink--small', onclick: quickCapture }, icon('mic-fill'), 'Quick capture by voice') : null,
      ]),
      addForm, viewSeg,
      toolbarEl,
      listWrap, mapHost, planHost);
    if (!D.voice.supported) root.querySelector('.page-head__actions').append(h('p', { class: 'set__line' }, 'Voice capture is not available in this browser, but typing works everywhere.'));
    drawAll();

    return () => dead.forEach((fn) => fn());
  }

  D.pages.bucket = { render, parse: parsePlaceSentence };
})(window.Daybook);
