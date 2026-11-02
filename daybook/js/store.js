/* store.js — the only module that reads or writes data.
   Live data: localStorage (the state) and IndexedDB (the linked file handle and photo attachments).
   Backup: one JSON text file (photos embedded), either written straight into a linked file or downloaded. */
(function (D) {
  'use strict';

  const { dateKey } = D.util;
  const LS_KEY = 'daybook.data';
  const SCHEMA = 3;
  const FILE_NAME = 'daybook-data.json';
  const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
  const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  const MAX_FILE_CHARS = 90 * 1024 * 1024;   // text plus embedded photos

  /* ---------- tiny event bus ---------- */
  const listeners = {};
  const on = (type, fn) => {
    (listeners[type] = listeners[type] || new Set()).add(fn);
    return () => listeners[type].delete(fn);
  };
  const emit = (type, detail) => (listeners[type] || []).forEach((fn) => {
    try { fn(detail); } catch (err) { console.error(`[store] ${type} listener failed`, err); }
  });

  /* ---------- IndexedDB ---------- */
  const idb = (() => {
    let opening;
    const open = () => opening || (opening = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('IndexedDB unavailable')); return; }
      const req = indexedDB.open('daybook', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        ['handles', 'blobs'].forEach((s) => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s); });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
    const run = (store, mode, fn) => open().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }));
    return {
      get: (s, k) => run(s, 'readonly', (o) => o.get(k)),
      put: (s, k, v) => run(s, 'readwrite', (o) => o.put(v, k)),
      del: (s, k) => run(s, 'readwrite', (o) => o.delete(k)),
      clear: (s) => run(s, 'readwrite', (o) => o.clear()),
    };
  })();

  /* ---------- shape, migrations, sanitising ---------- */
  function defaults() {
    return {
      schema: SCHEMA,
      createdAt: dateKey(),
      settings: {
        name: '',
        animations: !D.util.prefersReducedMotion(),
        introDate: '',
        dragonCollapsed: false,
        sound: { on: false, volume: 0.6 },
        idle: { min: 1, max: 5, guests: true },   // minutes between random idle clips; guests = other creatures
        voiceLang: 'en-US',                       // speech-to-text language: en-US or hi-IN
        glassClarity: 0.8,                        // 0 frosted ... 1 crystal clear
        homeCity: '', homeCountry: '', homeLat: null, homeLng: null,   // improves map search; the position is looked up once
        diet: '',                                 // dietary notes, used by the food prompt
        nudges: { on: true, times: ['15:30', '20:00'], notify: false },   // goal nudges
        chime: true,
      },
      habits: [],
      logs: {},
      likes: [],      // phase 2: things you like and dislike
      places: [],     // phase 3: the bucket list
      plans: {},      // phase 3: saved day plans by date
      eatLog: [],     // recent "what should I eat" picks
      notes: [],      // phase 4: handwritten notes (text and picture blocks)
      reminders: [],  // phase 4: alerts
      nudgeLog: {},   // phase 4: which goal nudges already fired, by day
      meta: { lastBackup: null, bannerSnooze: '', celebrated: '' },
    };
  }

  /* migrations[n] upgrades data from schema n-1 to n. Old backups (schema 1) load through step 2 and gain empty lists. */
  const migrations = {
    1: (s) => s, // data with no schema number is treated as version 0 and adopted as-is
    2: (s) => {   // phase 2 and 3: likes, bucket list, plans, voice language
      s.likes = Array.isArray(s.likes) ? s.likes : [];
      s.places = Array.isArray(s.places) ? s.places : [];
      s.plans = s.plans && typeof s.plans === 'object' && !Array.isArray(s.plans) ? s.plans : {};
      s.eatLog = Array.isArray(s.eatLog) ? s.eatLog : [];
      if (s.settings && typeof s.settings === 'object' && !s.settings.voiceLang) s.settings.voiceLang = 'en-US';
      return s;
    },
    3: (s) => {   // phase 4 and 5: notes, reminders, goal nudges, home city, dietary notes
      s.notes = Array.isArray(s.notes) ? s.notes : [];
      s.reminders = Array.isArray(s.reminders) ? s.reminders : [];
      s.nudgeLog = s.nudgeLog && typeof s.nudgeLog === 'object' && !Array.isArray(s.nudgeLog) ? s.nudgeLog : {};
      return s;
    },
  };

  function migrate(raw) {
    let v = Number.isInteger(raw.schema) ? raw.schema : 0;
    if (v > SCHEMA) throw new Error('This file was saved by a newer version of Daybook. Update the app first.');
    while (v < SCHEMA) {
      v += 1;
      raw = migrations[v] ? (migrations[v](raw) || raw) : raw;
      raw.schema = v;
    }
    return raw;
  }

  const str = (v, max, fallback = '') => (typeof v === 'string' ? v.slice(0, max) : fallback);
  const isoOrNull = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);


  /* ---------- phase 2 and 3 sanitisers ---------- */
  const LIKE_CATS = ['Food', 'Drinks', 'Places', 'Movies and Shows', 'Activities', 'Shopping', 'Other'];
  const PLACE_CATS = ['Restaurant', 'Mall', 'Park', 'Trip', 'Event', 'Other'];
  const STATUSES = ['want', 'planned', 'visited'];
  const PH_RE = /^ph_[a-z0-9]{4,24}$/;
  const idOf = (v) => (typeof v === 'string' && /^[\w-]{1,40}$/.test(v) ? v : '');
  const pick = (v, list, d) => (list.includes(v) ? v : d);
  const dayOrEmpty = (v) => (typeof v === 'string' && KEY_RE.test(v) ? v : '');
  const photoOf = (v) => (typeof v === 'string' && PH_RE.test(v) ? v : '');
  const webLink = (v) => {
    if (typeof v !== 'string' || v.length > 900) return '';
    try { const u = new URL(v); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : ''; } catch (e) { return ''; }
  };
  const tagList = (v) => [...new Set((Array.isArray(v) ? v : []).filter((t) => typeof t === 'string').map((t) => t.trim().toLowerCase().replace(/^#/, '').slice(0, 24)).filter(Boolean))].slice(0, 12);
  const coord = (v, lim) => (Number.isFinite(v) && Math.abs(v) <= lim ? Math.round(v * 1e6) / 1e6 : null);
  const createdOf = (v) => isoOrNull(v) || new Date().toISOString();

  function cleanLikes(list) {
    const seen = new Set();
    return (Array.isArray(list) ? list : []).slice(0, 2000).flatMap((e) => {
      const id = e && typeof e === 'object' ? idOf(e.id) : '';
      if (!id || seen.has(id)) return [];
      seen.add(id);
      return [{
        id, name: str(e.name, 80, 'Untitled') || 'Untitled',
        kind: e.kind === 'dislike' ? 'dislike' : 'like',
        rating: Number.isInteger(e.rating) && e.rating >= 0 && e.rating <= 5 ? e.rating : 0,
        category: pick(e.category, LIKE_CATS, 'Other'),
        tags: tagList(e.tags), notes: str(e.notes, 1000), photo: photoOf(e.photo),
        where: str(e.where, 120), when: dayOrEmpty(e.when), createdAt: createdOf(e.createdAt),
      }];
    });
  }

  function cleanPlaces(list) {
    const seen = new Set();
    return (Array.isArray(list) ? list : []).slice(0, 2000).flatMap((p) => {
      const id = p && typeof p === 'object' ? idOf(p.id) : '';
      if (!id || seen.has(id)) return [];
      seen.add(id);
      let lat = coord(p.lat, 90);
      let lng = coord(p.lng, 180);
      if (lat == null || lng == null || (lat === 0 && lng === 0)) { lat = null; lng = null; }   // never half a pin, never made-up zeros
      return [{
        id, name: str(p.name, 100, 'Untitled place') || 'Untitled place',
        category: pick(p.category, PLACE_CATS, 'Other'),
        priority: Number.isInteger(p.priority) && p.priority >= 1 && p.priority <= 3 ? p.priority : 2,
        status: pick(p.status, STATUSES, 'want'),
        target: dayOrEmpty(p.target), notes: str(p.notes, 1000), address: str(p.address, 220),
        lat, lng, link: webLink(p.link), photo: photoOf(p.photo),
        visitedAt: dayOrEmpty(p.visitedAt), visitedNote: str(p.visitedNote, 600), createdAt: createdOf(p.createdAt),
      }];
    });
  }

  function cleanPlans(plans) {
    const out = {};
    if (!plans || typeof plans !== 'object') return out;
    Object.keys(plans).filter((k) => KEY_RE.test(k)).slice(-400).forEach((k) => {
      out[k] = (Array.isArray(plans[k]) ? plans[k] : []).slice(0, 12).flatMap((it) => {
        const id = it && typeof it === 'object' ? idOf(it.id) : '';
        return id && (it.kind === 'place' || it.kind === 'food') ? [{ kind: it.kind, id }] : [];
      });
    });
    return out;
  }

  const cleanEatLog = (list) => (Array.isArray(list) ? list : []).slice(-60).flatMap((x) => {
    const id = x && typeof x === 'object' ? idOf(x.id) : '';
    return id && dayOrEmpty(x.date) ? [{ id, date: x.date }] : [];
  });


  /* ---------- phase 4 sanitisers ---------- */
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  const INST_RE = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;
  const REPEATS = ['once', 'daily', 'weekly', 'days'];

  function cleanNotes(list) {
    const seen = new Set();
    return (Array.isArray(list) ? list : []).slice(0, 1500).flatMap((n) => {
      const id = n && typeof n === 'object' ? idOf(n.id) : '';
      if (!id || seen.has(id)) return [];
      seen.add(id);
      let budget = 60000;
      const blocks = (Array.isArray(n.blocks) ? n.blocks : []).slice(0, 150).flatMap((b) => {
        if (!b || typeof b !== 'object') return [];
        if (b.k === 'i') return photoOf(b.v) ? [{ k: 'i', v: b.v }] : [];
        if (b.k === 't') { const v = str(b.v, Math.max(0, Math.min(20000, budget))); budget -= v.length; return [{ k: 't', v }]; }
        return [];
      });
      if (!blocks.length) blocks.push({ k: 't', v: '' });
      return [{
        id, title: str(n.title, 100), blocks, tags: tagList(n.tags), pinned: n.pinned === true,
        createdAt: createdOf(n.createdAt), updatedAt: createdOf(n.updatedAt || n.createdAt),
      }];
    });
  }

  function cleanReminders(list) {
    const seen = new Set();
    return (Array.isArray(list) ? list : []).slice(0, 500).flatMap((r) => {
      const id = r && typeof r === 'object' ? idOf(r.id) : '';
      if (!id || seen.has(id) || !dayOrEmpty(r.date) || !TIME_RE.test(r.time)) return [];
      seen.add(id);
      const days = [...new Set((Array.isArray(r.days) ? r.days : []).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort();
      const repeat = pick(r.repeat, REPEATS, 'once');
      return [{
        id, title: str(r.title, 100, 'Reminder') || 'Reminder', note: str(r.note, 300), date: r.date, time: r.time,
        repeat: repeat === 'days' && !days.length ? 'daily' : repeat, days,
        done: r.done === true, doneAt: isoOrNull(r.doneAt) || '', snoozedUntil: isoOrNull(r.snoozedUntil) || '',
        lastFiredKey: typeof r.lastFiredKey === 'string' && INST_RE.test(r.lastFiredKey) ? r.lastFiredKey : '',
        createdAt: createdOf(r.createdAt),
      }];
    });
  }

  function cleanNudgeLog(log) {
    const out = {};
    if (!log || typeof log !== 'object') return out;
    Object.keys(log).filter((k) => KEY_RE.test(k)).sort().slice(-30).forEach((k) => {
      out[k] = (Array.isArray(log[k]) ? log[k] : []).filter((t) => typeof t === 'string' && TIME_RE.test(t)).slice(0, 8);
    });
    return out;
  }

  /* every photo key the data points at, so backups carry exactly those pictures */
  const photoKeys = (st) => [...new Set([...st.likes.map((e) => e.photo), ...st.places.map((p) => p.photo), ...st.notes.flatMap((n) => n.blocks.filter((b) => b.k === 'i').map((b) => b.v))].filter(Boolean))];

  /* Everything that enters the app (storage, imported file) goes through here. */
  function normalize(raw) {
    const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const d = defaults();
    const out = {};
    for (const k of Object.keys(r)) if (!BAD_KEYS.has(k)) out[k] = r[k]; // keep keys from newer phases

    out.schema = SCHEMA;
    out.createdAt = KEY_RE.test(r.createdAt) ? r.createdAt : d.createdAt;

    const s = r.settings && typeof r.settings === 'object' ? r.settings : {};
    out.settings = {
      name: str(s.name, 40),
      animations: typeof s.animations === 'boolean' ? s.animations : d.settings.animations,
      introDate: KEY_RE.test(s.introDate) ? s.introDate : '',
      dragonCollapsed: s.dragonCollapsed === true,
      sound: {
        on: !!(s.sound && s.sound.on === true),
        volume: s.sound && Number.isFinite(s.sound.volume) ? Math.min(1, Math.max(0, s.sound.volume)) : 0.6,
      },
    };

    out.settings.voiceLang = s.voiceLang === 'hi-IN' ? 'hi-IN' : 'en-US';
    out.settings.glassClarity = Number.isFinite(s.glassClarity) ? Math.min(1, Math.max(0, s.glassClarity)) : 0.8;
    out.settings.homeCity = str(s.homeCity, 60);
    out.settings.homeCountry = str(s.homeCountry, 60);
    out.settings.homeLat = coord(s.homeLat, 90);
    out.settings.homeLng = coord(s.homeLng, 180);
    if (out.settings.homeLat == null || out.settings.homeLng == null) { out.settings.homeLat = null; out.settings.homeLng = null; }
    out.settings.diet = str(s.diet, 300);
    const nu = s.nudges && typeof s.nudges === 'object' ? s.nudges : {};
    const times = (Array.isArray(nu.times) ? nu.times : ['15:30', '20:00']).filter((t) => typeof t === 'string' && TIME_RE.test(t));
    out.settings.nudges = { on: nu.on !== false, times: [...new Set(times)].sort().slice(0, 4), notify: nu.notify === true };
    out.settings.chime = s.chime !== false;

    const im = s.idle && typeof s.idle === 'object' ? s.idle : {};
    const num = (v, d) => (Number.isFinite(v) ? Math.min(60, Math.max(0.25, v)) : d);
    const imin = num(im.min, 1);
    out.settings.idle = { min: imin, max: Math.max(imin, num(im.max, 5)), guests: im.guests !== false };

    const seen = new Set();
    out.habits = (Array.isArray(r.habits) ? r.habits : []).slice(0, 200).flatMap((h) => {
      if (!h || typeof h !== 'object' || typeof h.id !== 'string' || !h.id || seen.has(h.id)) return [];
      seen.add(h.id);
      const days = Array.isArray(h.days)
        ? [...new Set(h.days.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort()
        : [];
      return [{
        id: str(h.id, 40),
        name: str(h.name, 80, 'Untitled goal') || 'Untitled goal',
        days: days.length ? days : [0, 1, 2, 3, 4, 5, 6],
        why: str(h.why, 160),
        createdAt: KEY_RE.test(h.createdAt) ? h.createdAt : out.createdAt,
      }];
    });

    out.logs = {};
    const logs = r.logs && typeof r.logs === 'object' ? r.logs : {};
    for (const key of Object.keys(logs)) {
      if (!KEY_RE.test(key)) continue;
      const l = logs[key] && typeof logs[key] === 'object' ? logs[key] : {};
      out.logs[key] = {
        done: [...new Set((Array.isArray(l.done) ? l.done : []).filter((x) => typeof x === 'string').map((x) => x.slice(0, 40)))].slice(0, 200),
        mood: Number.isInteger(l.mood) && l.mood >= 0 && l.mood <= 5 ? l.mood : 0,
        note: str(l.note, 6000),
      };
    }

    out.likes = cleanLikes(r.likes);
    out.places = cleanPlaces(r.places);
    out.plans = cleanPlans(r.plans);
    out.eatLog = cleanEatLog(r.eatLog);
    out.notes = cleanNotes(r.notes);
    out.reminders = cleanReminders(r.reminders);
    out.nudgeLog = cleanNudgeLog(r.nudgeLog);

    const m = r.meta && typeof r.meta === 'object' ? r.meta : {};
    out.meta = {
      lastBackup: isoOrNull(m.lastBackup),
      bannerSnooze: KEY_RE.test(m.bannerSnooze) ? m.bannerSnooze : '',
      celebrated: KEY_RE.test(m.celebrated) ? m.celebrated : '',
    };
    return out;
  }

  /* ---------- state ---------- */
  let state = null;

  function persist() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch (err) {
      console.error('[store] could not write to localStorage', err);
      emit('error', 'Could not save to this browser (storage may be full). Save to a file now.');
    }
  }

  function init() {
    let loaded = null;
    try {
      const text = localStorage.getItem(LS_KEY);
      if (text) loaded = migrate(JSON.parse(text));
    } catch (err) {
      console.error('[store] stored data unreadable, keeping a copy', err);
      try { localStorage.setItem(`${LS_KEY}.unreadable`, localStorage.getItem(LS_KEY)); } catch (e) { /* nothing more to do */ }
    }
    state = normalize(loaded);
    persist();
    initFile();
    window.addEventListener('storage', (e) => {
      if (e.key !== LS_KEY || !e.newValue) return;
      try { state = normalize(migrate(JSON.parse(e.newValue))); emit('reload'); } catch (err) { /* ignore a broken write from another tab */ }
    });
    return state;
  }

  /* All writes go through commit so persistence, listeners and the file autosave never get skipped. */
  function commit(mutator, source = 'app') {
    mutator(state);
    persist();
    emit('change', { source });
    if (source !== 'backup') scheduleAutosave();
  }

  /* ---------- export / import ---------- */
  /* The backup is plain text. Photos ride along as data URLs under "photos", keyed by the keys the entries hold. */
  async function exportText() {
    const photos = {};
    for (const key of photoKeys(state)) {
      const url = await D.photos.toDataURL(key);
      if (url) photos[key] = url;
    }
    return JSON.stringify({
      app: 'daybook', schema: SCHEMA, exportedAt: new Date().toISOString(), data: state, photos,
    }, null, 2);
  }

  async function importText(text) {
    if (typeof text !== 'string' || text.length > MAX_FILE_CHARS) throw new Error('That file is too large to be a Daybook backup.');
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) { throw new Error('That file is not valid JSON text.'); }
    if (!parsed || parsed.app !== 'daybook' || !parsed.data || typeof parsed.data !== 'object') {
      throw new Error('This does not look like a Daybook data file.');
    }
    const next = normalize(migrate(parsed.data));
    const incoming = parsed.photos && typeof parsed.photos === 'object' ? parsed.photos : {};
    let restored = 0;
    for (const key of photoKeys(next)) {
      if (Object.prototype.hasOwnProperty.call(incoming, key) && await D.photos.fromDataURL(key, incoming[key])) restored += 1;
    }
    state = next;
    persist();
    emit('reload');
    return { habits: next.habits.length, days: Object.keys(next.logs).length, likes: next.likes.length, places: next.places.length, notes: next.notes.length, reminders: next.reminders.length, photos: restored };
  }

  async function wipe() {
    await D.photos.clearAll();
    state = normalize(null);
    persist();
    emit('reload');
  }

  /* ---------- backup bookkeeping ---------- */
  function markBackup() {
    commit((s) => { s.meta.lastBackup = new Date().toISOString(); }, 'backup');
  }
  const backupAgeDays = () => {
    const t = state.meta.lastBackup;
    return t ? Math.floor((Date.now() - Date.parse(t)) / 86400000) : null;
  };
  const hasContent = () => state.habits.length > 0 || Object.keys(state.logs).length > 0 || state.likes.length > 0 || state.places.length > 0 || state.notes.length > 0;

  /* ---------- linked file (File System Access API) ---------- */
  const file = {
    supported: 'showSaveFilePicker' in window,
    handle: null,
    name: '',
    permission: 'none', // none | granted | prompt | error
  };

  async function initFile() {
    if (!file.supported) return;
    try {
      const handle = await idb.get('handles', 'dataFile');
      if (handle) {
        file.handle = handle;
        file.name = handle.name;
        file.permission = await handle.queryPermission({ mode: 'readwrite' });
      }
    } catch (err) { /* private mode etc.: simply not linked */ }
    emit('file');
  }

  async function writeLinked() {
    const w = await file.handle.createWritable();
    await w.write(await exportText());
    await w.close();
    markBackup();
  }

  async function linkFile() {
    if (!file.supported) throw new Error('This browser cannot link a file. Use Save to file instead.');
    let handle;
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: FILE_NAME,
        types: [{ description: 'Daybook data (plain text JSON)', accept: { 'application/json': ['.json'] } }],
      });
    } catch (err) {
      if (err && err.name === 'AbortError') return false;
      throw err;
    }
    file.handle = handle;
    file.name = handle.name;
    file.permission = 'granted';
    await idb.put('handles', 'dataFile', handle);
    await writeLinked();
    emit('file');
    return true;
  }

  async function unlinkFile() {
    file.handle = null; file.name = ''; file.permission = 'none';
    try { await idb.del('handles', 'dataFile'); } catch (e) { /* nothing to remove */ }
    emit('file');
  }

  /* Must be called from a click: browsers only re-grant file access after a user gesture. */
  async function reconnectFile() {
    if (!file.handle) return false;
    file.permission = await file.handle.requestPermission({ mode: 'readwrite' });
    if (file.permission === 'granted') await writeLinked();
    emit('file');
    return file.permission === 'granted';
  }

  /* Save: straight into the linked file when possible, otherwise a download. */
  async function saveToFile() {
    if (file.handle) {
      try {
        if (file.permission !== 'granted') file.permission = await file.handle.requestPermission({ mode: 'readwrite' });
        if (file.permission === 'granted') {
          await writeLinked();
          emit('file');
          return { where: 'linked', name: file.name };
        }
      } catch (err) {
        console.error('[store] linked file write failed, falling back to download', err);
        file.permission = 'error';
        emit('file');
      }
    }
    D.util.download(FILE_NAME, await exportText());
    markBackup();
    return { where: 'download', name: FILE_NAME };
  }

  const scheduleAutosave = D.util.debounce(async () => {
    if (!file.handle || file.permission !== 'granted') return;
    try { await writeLinked(); emit('file'); } catch (err) {
      console.error('[store] autosave failed', err);
      file.permission = 'error';
      emit('file');
    }
  }, 2500);

  /* Opens a file picker and resolves with the text, or null if cancelled. Works in every browser. */
  function pickFileText() {
    return new Promise((resolve, reject) => {
      const input = D.util.h('input', { type: 'file', accept: '.json,application/json,text/plain' });
      input.addEventListener('change', () => {
        const f = input.files && input.files[0];
        if (!f) { resolve(null); return; }
        if (f.size > MAX_FILE_CHARS) { reject(new Error('That file is too large to be a Daybook backup.')); return; }
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read that file.'));
        reader.readAsText(f);
      });
      input.addEventListener('cancel', () => resolve(null));
      input.click();
    });
  }

  D.idb = idb;
  D.store = {
    init, on, emit, commit, importText, exportText, wipe, pickFileText,
    saveToFile, linkFile, unlinkFile, reconnectFile, markBackup, backupAgeDays, hasContent,
    get state() { return state; },
    file,
    FILE_NAME, LIKE_CATS, PLACE_CATS, STATUSES, REPEATS,
  };
})(window.Daybook);
