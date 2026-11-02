/* maplink.js — reads Google Maps, Apple Maps and OpenStreetMap links, searches place names with the free
   Nominatim service, and loads Leaflet for the map. It never invents coordinates: a pin exists only when the
   link carries them or you picked a search result. */
(function (D) {
  'use strict';

  const NUM = '-?\\d+(?:\\.\\d+)?';
  const PAIR = new RegExp(`^\\s*(${NUM})\\s*,\\s*(${NUM})\\s*$`);
  const LEAFLET = {
    css: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css',
    js: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',
    cssHash: 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=',
    jsHash: 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=',
  };

  const okCoords = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng)
    && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
  const pair = (text) => { const m = PAIR.exec(text || ''); return m && okCoords(+m[1], +m[2]) ? { lat: +m[1], lng: +m[2] } : null; };
  const decode = (s) => { try { return decodeURIComponent(String(s).replace(/\+/g, ' ')); } catch (e) { return String(s).replace(/\+/g, ' '); } };
  const tidy = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 100);

  /* "Indian Accent, The Lodhi, Lodhi Road" -> name "Indian Accent", address "The Lodhi, Lodhi Road" */
  function splitName(full) {
    const parts = decode(full).split(',').map((x) => x.trim()).filter(Boolean);
    return { name: tidy(parts[0] || ''), address: parts.slice(1).join(', ').slice(0, 220) };
  }

  const SHORT_HOSTS = ['maps.app.goo.gl', 'goo.gl', 'g.co', 'share.google', 'g.page'];

  /* Result kinds:
       place    a link we could read: { name, address, lat, lng (maybe null), link, source }
       short    a share link that hides everything: { link }
       name     plain text, not a link
       other    a link that is not a map link
       empty / bad */
  function parse(input) {
    const text = String(input || '').trim();
    if (!text) return { kind: 'empty' };

    let url = null;
    try { url = new URL(text); } catch (e) {
      if (/^(www\.)?(google\.[a-z.]+\/maps|maps\.google\.|maps\.apple\.com|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(text)) {
        try { url = new URL(`https://${text}`); } catch (e2) { url = null; }
      }
    }
    if (!url) return { kind: 'name', name: tidy(text) };
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return { kind: 'bad', note: 'Only web links can be used here.' };

    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const q = url.searchParams;
    const href = url.href;

    if (SHORT_HOSTS.includes(host) && (host !== 'goo.gl' || url.pathname.startsWith('/maps'))) return { kind: 'short', link: href };

    /* ---- Google ---- */
    if (/(^|\.)google\.[a-z.]+$/.test(host) && (url.pathname.startsWith('/maps') || host.startsWith('maps.'))) {
      if (url.pathname.startsWith('/maps/dir')) return { kind: 'other', note: 'That is a directions link. Open the place itself in Google Maps and share that link.' };
      let lat = null; let lng = null;
      const exact = new RegExp(`!3d(${NUM})!4d(${NUM})`).exec(href);          // the exact pin, when present
      const at = new RegExp(`@(${NUM}),(${NUM})`).exec(url.pathname + (url.hash || ''));
      if (exact && okCoords(+exact[1], +exact[2])) { lat = +exact[1]; lng = +exact[2]; } else if (at && okCoords(+at[1], +at[2])) { lat = +at[1]; lng = +at[2]; }
      let label = '';
      const place = /\/maps\/(?:place|search)\/([^/@?]+)/.exec(url.pathname);
      if (place) label = place[1];
      for (const key of ['q', 'query', 'destination']) {
        const v = q.get(key);
        if (!v) continue;
        const p = pair(v);
        if (p && lat == null) { lat = p.lat; lng = p.lng; } else if (!p && !label) label = v;
      }
      if (lat == null) { const p = pair(q.get('ll') || q.get('center') || ''); if (p) { lat = p.lat; lng = p.lng; } }
      const { name, address } = splitName(label);
      if (pair(name)) return { kind: 'place', name: 'Pinned place', address: '', lat: pair(name).lat, lng: pair(name).lng, link: href, source: 'google' };
      if (!name && lat == null) return { kind: 'other', note: 'That Google Maps link does not name a place. Open a place and share its link.' };
      return { kind: 'place', name: name || 'Pinned place', address, lat, lng, link: href, source: 'google' };
    }

    /* ---- Apple ---- */
    if (host === 'maps.apple.com' || host === 'maps.apple') {
      let c = pair(q.get('ll')) || pair(q.get('coordinate')) || pair(q.get('sll')) || pair(q.get('daddr'));
      const rawName = q.get('name') || q.get('q') || '';
      if (!c && pair(rawName)) c = pair(rawName);
      const name = tidy(pair(rawName) ? '' : decode(rawName));
      const address = decode(q.get('address') || '').slice(0, 220);
      if (!name && !c) return { kind: 'other', note: 'That Apple Maps link does not name a place. Share a place from Apple Maps.' };
      return { kind: 'place', name: name || 'Pinned place', address, lat: c ? c.lat : null, lng: c ? c.lng : null, link: href, source: 'apple' };
    }

    /* ---- OpenStreetMap ---- */
    if (host === 'openstreetmap.org') {
      let lat = null; let lng = null;
      if (okCoords(+q.get('mlat'), +q.get('mlon'))) { lat = +q.get('mlat'); lng = +q.get('mlon'); } else {
        const m = new RegExp(`map=\\d+/(${NUM})/(${NUM})`).exec(url.hash || '');
        if (m && okCoords(+m[1], +m[2])) { lat = +m[1]; lng = +m[2]; }
      }
      if (lat == null) return { kind: 'other', note: 'That OpenStreetMap link has no marker. Add a marker, or type the place name.' };
      return { kind: 'place', name: 'Pinned place', address: '', lat, lng, link: href, source: 'osm' };
    }

    return { kind: 'other', note: 'That does not look like a Google Maps, Apple Maps or OpenStreetMap link. Type the place name instead.' };
  }

  /* An "Open in Maps" link for a place: the original link if it has one, otherwise a plain coordinates link. */
  function openUrl(place) {
    if (place.link) return place.link;
    if (place.lat != null && place.lng != null) return `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
    return '';
  }

  /* ---------- Nominatim (free, OpenStreetMap), used politely ----------
     One request at a time, at least 1.1 s apart, an older request is cancelled when a newer one starts, results are
     remembered, and nothing runs until you press Search or pause typing. */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let chain = Promise.resolve();
  let lastCall = 0;
  let ctrl = null;
  const memo = new Map();
  const fail = (code, message) => Object.assign(new Error(message), { code });

  function rawSearch(q, { viewbox } = {}) {
    const text = String(q || '').trim().slice(0, 200);
    if (!text) return Promise.resolve([]);
    const key = `${text}|${viewbox || ''}`;
    if (memo.has(key)) return Promise.resolve(memo.get(key));
    if (ctrl) ctrl.abort();
    const mine = new AbortController();
    ctrl = mine;
    const job = chain.then(async () => {
      if (mine.signal.aborted) throw fail('aborted', 'cancelled');
      const wait = Math.max(0, lastCall + 1100 - Date.now());
      if (wait) await sleep(wait);
      if (mine.signal.aborted) throw fail('aborted', 'cancelled');
      if (navigator.onLine === false) throw fail('offline', 'You look offline. The place search needs the internet. You can still pin the spot by hand.');
      lastCall = Date.now();
      const params = new URLSearchParams({ format: 'jsonv2', limit: '5', addressdetails: '0', 'accept-language': D.store.state.settings.voiceLang === 'hi-IN' ? 'hi,en' : 'en', q: text });
      if (viewbox) params.set('viewbox', viewbox);       // a bias, not a limit
      let res;
      try { res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { signal: mine.signal }); } catch (e) {
        if (e && e.name === 'AbortError') throw fail('aborted', 'cancelled');
        throw fail('unreachable', 'The place search service could not be reached. Check your connection and try again, or pin the spot by hand.');
      }
      if (res.status === 429 || res.status === 503) throw fail('busy', 'The place search service is busy right now. Wait a moment and try again.');
      if (!res.ok) throw fail('unreachable', 'The place search service did not answer properly. Try again, or pin the spot by hand.');
      const rows = await res.json();
      const out = (Array.isArray(rows) ? rows : []).flatMap((r) => {
        const lat = parseFloat(r.lat);
        const lon = parseFloat(r.lon);
        if (!okCoords(lat, lon)) return [];
        const parts = String(r.display_name || '').split(',').map((x) => x.trim());
        return [{ name: tidy(r.name || parts[0] || text), address: String(r.display_name || '').slice(0, 260), lat, lng: lon, type: String(r.type || '').replace(/_/g, ' ') }];
      });
      memo.set(key, out);
      return out;
    });
    chain = job.catch(() => {});
    return job;
  }

  /* ---- simplified versions of a query, tried in this order when nothing matches ---- */
  const squeeze = (t) => t.replace(/\s+,/g, ',').replace(/,\s*,+/g, ',').replace(/^[\s,]+|[\s,]+$/g, '').replace(/\s{2,}/g, ' ');
  const stripUnit = (q) => squeeze(q
    .replace(/\b(?:apt|apartment|unit|flat|suite|ste|room|rm|floor|fl)\.?\s*#?\s*[\w-]+,?\s*/gi, '')
    .replace(/(^|\s)#\s*\w+/g, ' ')
    .replace(/^\s*[a-z]?\d{1,4}[a-z]?\s*[,/-]\s*(?=\d)/i, ''));
  const stripPostal = (q) => squeeze(q
    .replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi, '')      // UK
    .replace(/\b\d{3}\s?\d{3}\b/g, '')                             // India and others, 560001 or 560 001
    .replace(/\b\d{5}(?:-\d{4})?\b/g, '')                          // US, 5 digits
    .replace(/\b\d{4}\s?[A-Z]{2}\b/g, ''));                        // NL

  function variants(q, city, country) {
    const list = [{ label: 'what you typed', q: squeeze(q) }];
    const noUnit = stripUnit(q);
    if (noUnit && noUnit !== list[0].q) list.push({ label: 'without the apartment or unit number', q: noUnit });
    const noPostal = stripPostal(noUnit || q);
    if (noPostal && noPostal !== (noUnit || q)) list.push({ label: 'without the postal code', q: noPostal });
    const segs = (noPostal || q).split(',').map((x) => x.trim()).filter(Boolean);
    const name = segs[0];
    const cityBit = city || (segs.length > 1 ? segs[segs.length - 1] : '');
    if (name && cityBit) list.push({ label: `the place name plus the city (${name}, ${cityBit})`, q: `${name}, ${cityBit}${country && !cityBit.toLowerCase().includes(country.toLowerCase()) ? `, ${country}` : ''}` });
    const seen = new Set();
    return list.filter((v) => v.q && !seen.has(v.q.toLowerCase()) && seen.add(v.q.toLowerCase()));
  }

  const around = (lat, lng, d = 0.6) => `${(lng - d).toFixed(4)},${(lat + d).toFixed(4)},${(lng + d).toFixed(4)},${(lat - d).toFixed(4)}`;
  const boundsBox = (b) => `${b.getWest().toFixed(4)},${b.getNorth().toFixed(4)},${b.getEast().toFixed(4)},${b.getSouth().toFixed(4)}`;

  /* Tries the query, then the simplified versions. Resolves { rows, used, tried }. onTry(label) reports each attempt. */
  async function searchSmart(query, { viewbox, onTry } = {}) {
    const set = D.store.state.settings;
    const tried = [];
    for (const v of variants(query, set.homeCity, set.homeCountry)) {
      tried.push(v.label);
      if (onTry) onTry(v.label, tried.length > 1);
      const rows = await rawSearch(v.q, { viewbox });
      if (rows.length) return { rows, used: v, tried };
    }
    return { rows: [], used: null, tried };
  }

  /* The home city and country, looked up once so searches and manual pins start in the right area. */
  async function resolveHome(city, country) {
    if (!city) return null;
    const rows = await rawSearch(`${city}${country ? `, ${country}` : ''}`);
    return rows.length ? { lat: rows[0].lat, lng: rows[0].lng } : null;
  }
  const homeCenter = () => {
    const s = D.store.state.settings;
    return s.homeLat != null && s.homeLng != null ? { lat: s.homeLat, lng: s.homeLng } : null;
  };

  /* ---------- Leaflet, loaded only when a map is first needed ---------- */
  let leafletP = null;
  function leaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leafletP) return leafletP;
    leafletP = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = LEAFLET.css; css.integrity = LEAFLET.cssHash; css.crossOrigin = 'anonymous';
      document.head.append(css);
      const js = document.createElement('script');
      js.src = LEAFLET.js; js.integrity = LEAFLET.jsHash; js.crossOrigin = 'anonymous';
      js.onload = () => (window.L ? resolve(window.L) : reject(new Error('The map library did not start.')));
      js.onerror = () => { leafletP = null; reject(new Error('The map could not load. It needs an internet connection.')); };
      document.head.append(js);
    });
    return leafletP;
  }

  const distKm = (a, b) => {
    const R = 6371;
    const rad = (x) => (x * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  };

  D.maplink = { parse, openUrl, search: rawSearch, searchSmart, resolveHome, homeCenter, around, boundsBox, leaflet, distKm, okCoords };
})(window.Daybook);
