/* settings.js — name, home city and diet, goal nudges, data (save / load / link a file), and the dragon workshop for testing. */
(function (D) {
  'use strict';

  const { h, icon } = D.util;
  const cfg = D.dragonConfig;

  function render(root) {
    const s = () => D.store.state;
    const unsub = [];

    /* ---------- data & backup ---------- */
    const backupLine = h('p', { class: 'set__line' });
    const fileLine = h('p', { class: 'set__line' });
    const linkBtn = h('button', { type: 'button', class: 'btn-ink btn-ink--ghost', onclick: onLink }, icon('link-45deg'), 'Link a data file');
    const unlinkBtn = h('button', { type: 'button', class: 'btn-ink btn-ink--ghost', onclick: onUnlink }, icon('x-circle'), 'Unlink');
    const reconnectBtn = h('button', { type: 'button', class: 'btn-ink btn-ink--primary', onclick: onReconnect }, icon('unlock'), 'Allow access again');

    function paintData() {
      const f = D.store.file;
      const last = s().meta.lastBackup;
      backupLine.textContent = last
        ? `Last backup: ${D.util.daysAgoText(last)} (${new Date(last).toLocaleString()}).`
        : 'No backup saved yet. Your data lives only in this browser until you save a file.';
      if (!f.supported) {
        fileLine.textContent = 'This browser cannot write straight into a file, so Save downloads daybook-data.json and Load reads it back. Chrome and Edge can link a file.';
      } else if (!f.handle) {
        fileLine.textContent = 'Link one file and every change is written into it automatically while Daybook is open.';
      } else if (f.permission === 'granted') {
        fileLine.textContent = `Linked to ${f.name}. Changes are written into it a moment after you make them.`;
      } else if (f.permission === 'error') {
        fileLine.textContent = `Could not write to ${f.name}. Allow access again, or save a copy with Save to file.`;
      } else {
        fileLine.textContent = `Linked to ${f.name}. The browser needs your OK again after a restart.`;
      }
      linkBtn.hidden = !f.supported || !!f.handle;
      unlinkBtn.hidden = !f.handle;
      reconnectBtn.hidden = !f.handle || f.permission === 'granted';
    }

    async function onSave() {
      try {
        const r = await D.store.saveToFile();
        D.util.toast(r.where === 'linked' ? `Saved into ${r.name}.` : `Downloaded ${r.name}. Keep it somewhere safe.`, 'good');
      } catch (err) { D.util.toast(err.message || 'Could not save.', 'error'); }
    }
    async function onLoad() {
      try {
        const text = await D.store.pickFileText();
        if (text == null) return;
        const ok = await D.util.confirm({
          title: 'Replace everything?',
          text: 'Loading this file replaces all goals, notes and settings currently in Daybook. Save a backup first if you are unsure.',
          confirmLabel: 'Load file', danger: true,
        });
        if (!ok) return;
        const r = await D.store.importText(text);
        D.util.toast(`Loaded ${r.habits} goals, ${r.likes} likes, ${r.places} places, ${r.notes} notes, ${r.reminders} reminders and ${r.photos} photos.`, 'good');
      } catch (err) { D.util.toast(err.message || 'Could not load that file.', 'error'); }
    }
    async function onLink() {
      try {
        if (await D.store.linkFile()) D.util.toast(`Linked to ${D.store.file.name}. Saved once already.`, 'good');
      } catch (err) { D.util.toast(err.message || 'Could not link a file.', 'error'); }
    }
    async function onUnlink() { await D.store.unlinkFile(); D.util.toast('File unlinked. Your data stays in the browser.'); }
    async function onReconnect() {
      try { if (await D.store.reconnectFile()) D.util.toast('File access restored and saved.', 'good'); else D.util.toast('Access was not granted.', 'error'); }
      catch (err) { D.util.toast(err.message || 'Could not reconnect.', 'error'); }
    }
    async function onErase() {
      const ok = await D.util.confirm({
        title: 'Erase all data?',
        text: 'This removes every goal, note and setting from this browser. A linked file is not touched until the next save. This cannot be undone.',
        confirmLabel: 'Erase everything', danger: true,
      });
      if (!ok) return;
      await D.store.wipe();
      D.util.toast('Everything erased. A fresh diary is ready.');
    }

    const nameInput = h('input', { class: 'input input--hand', id: 'set-name', type: 'text', maxlength: 40, autocomplete: 'given-name', placeholder: 'What should the dragon call you?' });
    nameInput.value = s().settings.name;
    const saveName = D.util.debounce(() => D.store.commit((st) => { st.settings.name = nameInput.value.trim().slice(0, 40); }, 'ui'), 500);
    nameInput.addEventListener('input', saveName);

    const dataCard = h('section', { class: 'pane set__card', 'aria-labelledby': 'set-data-h' },
      h('h2', { class: 'pane__title', id: 'set-data-h' }, 'Your data'),
      h('p', { class: 'set__text' }, 'Daybook keeps everything in this browser and sends nothing anywhere. A backup is a single plain-text file, daybook-data.json, that you can read, copy and keep.'),
      backupLine,
      h('div', { class: 'set__actions' },
        h('button', { type: 'button', class: 'btn-ink btn-ink--primary', onclick: onSave }, icon('download'), 'Save to file'),
        h('button', { type: 'button', class: 'btn-ink btn-ink--ghost', onclick: onLoad }, icon('upload'), 'Load from file'),
        linkBtn, unlinkBtn, reconnectBtn),
      fileLine);

    /* glass clarity slider: tune the transparency yourself */
    const clarityOut = h('output', { class: 'set__pct', for: 'set-clarity' }, `${Math.round(s().settings.glassClarity * 100)}%`);
    const clarity = h('input', { class: 'range', type: 'range', min: 0, max: 100, step: 1, id: 'set-clarity', value: Math.round(s().settings.glassClarity * 100), 'aria-label': 'Glass clarity' });
    clarity.addEventListener('input', () => { clarityOut.textContent = `${clarity.value}%`; D.app.setGlass(Number(clarity.value) / 100); });

    const nameCard = h('section', { class: 'pane set__card', 'aria-labelledby': 'set-name-h' },
      h('h2', { class: 'pane__title', id: 'set-name-h' }, 'About you'),
      h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'set-name' }, 'Your name'), nameInput,
        h('span', { class: 'field__hint' }, 'Used only for the greeting on the Today page.')),
      h('div', { class: 'field' },
        h('label', { class: 'field__label', for: 'set-lang' }, 'Voice input language'),
        h('select', {
          class: 'input input--select', id: 'set-lang',
          onchange: (e) => { D.store.commit((st) => { st.settings.voiceLang = e.target.value === 'hi-IN' ? 'hi-IN' : 'en-US'; }, 'ui'); D.util.toast(e.target.value === 'hi-IN' ? 'Voice input will listen for Hindi.' : 'Voice input will listen for English.'); },
        },
        h('option', { value: 'en-US', selected: s().settings.voiceLang !== 'hi-IN' }, 'English'),
        h('option', { value: 'hi-IN', selected: s().settings.voiceLang === 'hi-IN' }, 'Hindi (हिन्दी)')),
        h('span', { class: 'field__hint' }, D.voice.supported ? 'Used by the microphone buttons on Likes and Bucket list. Your browser handles the speech; Daybook keeps only the words.' : 'This browser has no speech recognition, so the microphone buttons are hidden. Typing always works.')),
      h('div', { class: 'field' },
        h('label', { class: 'field__label', for: 'set-clarity' }, 'Glass clarity'),
        h('div', { class: 'set__slider' }, clarity, clarityOut),
        h('span', { class: 'field__hint' }, 'Lower is frosted, higher is clearer. The dragon and forest show through more as you slide right.')));

    /* ---------- home city and dietary notes ---------- */
    const cityIn = h('input', { class: 'input input--hand', id: 'set-city', type: 'text', maxlength: 60, autocomplete: 'address-level2', placeholder: 'City or town' });
    const countryIn = h('input', { class: 'input input--hand', id: 'set-country', type: 'text', maxlength: 60, autocomplete: 'country-name', placeholder: 'Country' });
    const dietIn = h('textarea', { class: 'input input--hand input--area', id: 'set-diet', rows: 3, maxlength: 300, placeholder: 'Vegetarian, no peanuts, likes it spicy…' });
    cityIn.value = s().settings.homeCity; countryIn.value = s().settings.homeCountry; dietIn.value = s().settings.diet;
    const homeNote = h('p', { class: 'set__line', role: 'status' });
    const paintHome = () => {
      const st = s().settings;
      homeNote.textContent = st.homeLat != null ? `Map searches start near ${[st.homeCity, st.homeCountry].filter(Boolean).join(', ')}.` : st.homeCity ? 'Not found on the map yet. Press Find on map to look it up.' : 'Set a city and map searches start there, so the right place turns up first.';
    };
    let homeBusy = false;
    async function findHome() {
      const city = cityIn.value.trim();
      if (!city || homeBusy) { if (!city) homeNote.textContent = 'Type a city first.'; return; }
      homeBusy = true; homeNote.textContent = 'Looking it up…';
      try {
        const country = countryIn.value.trim();
        const at = await D.maplink.resolveHome(city, country);
        D.store.commit((st) => { Object.assign(st.settings, { homeCity: city.slice(0, 60), homeCountry: country.slice(0, 60), homeLat: at ? at.lat : null, homeLng: at ? at.lng : null }); }, 'ui');
        paintHome();
        if (!at) homeNote.textContent = 'Could not find that place. Check the spelling, or add the country.';
      } catch (err) { homeNote.textContent = err.message || 'Could not reach the map service. Check your connection and try again.'; }
      homeBusy = false;
    }
    const saveHome = D.util.debounce(() => D.store.commit((st) => {
      const c = cityIn.value.trim().slice(0, 60); const k = countryIn.value.trim().slice(0, 60);
      if (c !== st.settings.homeCity || k !== st.settings.homeCountry) { st.settings.homeLat = null; st.settings.homeLng = null; }   // the old position no longer matches
      st.settings.homeCity = c; st.settings.homeCountry = k;
    }, 'ui'), 600);
    cityIn.addEventListener('input', () => { saveHome(); homeNote.textContent = 'Press Find on map to use it for searches.'; });
    countryIn.addEventListener('input', () => { saveHome(); homeNote.textContent = 'Press Find on map to use it for searches.'; });
    const saveDiet = D.util.debounce(() => D.store.commit((st) => { st.settings.diet = dietIn.value.trim().slice(0, 300); }, 'ui'), 500);
    dietIn.addEventListener('input', saveDiet);
    paintHome();

    const homeCard = h('section', { class: 'pane set__card', 'aria-labelledby': 'set-home-h' },
      h('h2', { class: 'pane__title', id: 'set-home-h' }, D.util.ink('Home and food', 'home-food')),
      h('div', { class: 'set__pair' },
        h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'set-city' }, 'Home city'), D.voice.field(cityIn)),
        h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'set-country' }, 'Country'), D.voice.field(countryIn))),
      h('div', { class: 'set__actions' }, h('button', { type: 'button', class: 'btn-ink btn-ink--ghost btn-ink--small', onclick: findHome }, icon('geo-alt'), 'Find on map')),
      homeNote,
      h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'set-diet' }, 'Dietary notes'), D.voice.field(dietIn),
        h('span', { class: 'field__hint' }, 'Used by My Prompt for food. Stays in this browser.')));

    /* ---------- goal nudges and alerts ---------- */
    const nudgeTimes = h('div', { class: 'ntimes' });
    const nudgeNote = h('p', { class: 'set__line', role: 'status' });
    const nudges = () => s().settings.nudges;
    const setTimes = (list) => D.store.commit((st) => { st.settings.nudges.times = [...new Set(list.filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)))].sort().slice(0, 4); }, 'ui');
    function paintTimes() {
      D.util.clear(nudgeTimes);
      nudges().times.forEach((t, i) => nudgeTimes.append(h('span', { class: 'ntime' },
        h('input', { class: 'input', type: 'time', value: t, 'aria-label': `Nudge time ${i + 1}`, onchange: (e) => { const list = nudges().times.slice(); if (e.target.value) list[i] = e.target.value; setTimes(list); paintTimes(); } }),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Remove the ${t} nudge`, onclick: () => { setTimes(nudges().times.filter((_, j) => j !== i)); paintTimes(); } }, icon('x-lg')))));
      nudgeTimes.append(h('button', { type: 'button', class: 'btn-ink btn-ink--ghost btn-ink--small', hidden: nudges().times.length >= 4, onclick: () => { const list = nudges().times.slice(); const spare = ['09:00', '12:00', '18:00', '21:00', '10:30', '14:00'].find((t) => !list.includes(t)); setTimes([...list, spare]); paintTimes(); } }, icon('plus-lg'), 'Add a time'));
    }
    const onSwitch = h('input', { type: 'checkbox', checked: nudges().on, onchange: (e) => { D.store.commit((st) => { st.settings.nudges.on = e.target.checked; }, 'ui'); } });
    const chimeSwitch = h('input', { type: 'checkbox', checked: s().settings.chime, onchange: (e) => { D.store.commit((st) => { st.settings.chime = e.target.checked; }, 'ui'); } });
    const notifySwitch = h('input', {
      type: 'checkbox', checked: nudges().notify && D.alerts.permission() === 'granted',
      onchange: async (e) => {
        if (!e.target.checked) { D.store.commit((st) => { st.settings.nudges.notify = false; }, 'ui'); paintNotify(); return; }
        const p = await D.alerts.requestPermission();
        notifySwitch.checked = p === 'granted';
        paintNotify();
      },
    });
    function paintNotify() {
      const p = D.alerts.permission();
      nudgeNote.textContent = p === 'unsupported' ? 'This browser has no notifications; the in-app alert and chime still work.'
        : p === 'denied' ? 'Notifications are blocked for this site in the browser settings. The in-app alert and chime still work.'
          : nudges().notify && p === 'granted' ? 'Browser notifications are on.' : 'Browser notifications are off. The in-app alert and chime still work.';
    }
    paintTimes(); paintNotify();
    const alertsCard = h('section', { class: 'pane set__card', 'aria-labelledby': 'set-alerts-h' },
      h('h2', { class: 'pane__title', id: 'set-alerts-h' }, D.util.ink('Goal nudges', 'goal-nudges')),
      h('p', { class: 'set__text' }, 'At the times you choose, Daybook lists the goals still unticked for today. If everything is done, it stays quiet. Reminders you set on the Alerts page use the same chime and notifications.'),
      h('label', { class: 'switch' }, onSwitch, h('span', { class: 'switch__track' }), h('span', null, 'Nudge me about unfinished goals')),
      h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Nudge times'), nudgeTimes),
      h('label', { class: 'switch' }, chimeSwitch, h('span', { class: 'switch__track' }), h('span', null, 'Play a gentle chime')),
      h('label', { class: 'switch' }, notifySwitch, h('span', { class: 'switch__track' }), h('span', null, 'Also use browser notifications')),
      nudgeNote,
      h('div', { class: 'set__actions' }, h('button', { type: 'button', class: 'btn-ink btn-ink--ghost btn-ink--small', onclick: () => { D.alerts.testAlert(); } }, icon('bell-fill'), 'Send test alert')),
      h('p', { class: 'honest' }, icon('info-circle'), 'Alerts are reliable only while Daybook is open or was open recently. A web page cannot run once it is fully closed; on return, anything missed in the last day is caught up. On iPhone, add Daybook to the Home Screen first.'));

    /* ---------- dragon workshop ---------- */
    const real = D.progress.day(s(), new Date()).pct;
    const slider = h('input', { class: 'range', type: 'range', min: 0, max: 100, step: 1, id: 'set-pct', value: real == null ? 0 : real });
    const sliderOut = h('output', { class: 'set__pct', for: 'set-pct' }, `${slider.value}%`);
    slider.addEventListener('input', () => {
      sliderOut.textContent = `${slider.value}%`;
      D.dragon.setOverride(Number(slider.value));
    });
    const useReal = h('button', {
      type: 'button', class: 'btn-ink btn-ink--ghost btn-ink--small',
      onclick: () => {
        D.dragon.setOverride(null);
        const p = D.progress.day(s(), new Date()).pct;
        slider.value = p == null ? 0 : p; sliderOut.textContent = `${slider.value}%`;
        D.util.toast('The dragon follows your real progress again.');
      },
    }, 'Use my real progress');

    const animSwitch = h('input', { type: 'checkbox', checked: s().settings.animations, onchange: (e) => D.app.setAnimations(e.target.checked) });

    const clipNote = h('p', { class: 'set__line', role: 'status' });
    const weakLine = h('p', { class: 'set__line' });
    const clipList = h('ul', { class: 'clips' });
    function paintClips() {
      D.util.clear(clipList);
      D.dragon.clipStatus().forEach((c) => {
        const status = c.status === 'missing'
          ? (c.fallsBackTo ? `missing, using ${c.fallsBackTo}` : 'missing')
          : c.status === 'ready' ? 'found' : 'checking…';
        clipList.append(h('li', { class: `clips__item is-${c.status}` },
          h('button', {
            type: 'button', class: 'btn-ink btn-ink--ghost btn-ink--small',
            onclick: () => {
              const r = D.dragon.forceClip(c.name);
              if (!r) { clipNote.textContent = `${c.file} is not available and nothing can stand in for it.`; return; }
              clipNote.textContent = r.fellBack
                ? `${c.file} is not there yet, so ${cfg.clips[r.clip].file} is playing instead.`
                : `Playing ${c.file} once; it holds its last frame.`;
            },
          }, icon('play-fill'), c.name),
          h('span', { class: 'clips__status' }, `${c.file} · ${status}${c.optional && c.status === 'missing' ? ' (optional)' : ''}`)));
      });
    }
    const paintWeak = () => { weakLine.textContent = D.dragon.weakNote(); weakLine.hidden = !weakLine.textContent; };
    paintClips();
    paintWeak();
    unsub.push(D.store.on('dragon-clips', () => { paintClips(); paintWeak(); }));

    const workshop = h('section', { class: 'pane set__card', 'aria-labelledby': 'set-dragon-h' },
      h('h2', { class: 'pane__title', id: 'set-dragon-h' }, 'Dragon workshop'),
      h('p', { class: 'set__text' }, 'Try every stage without touching your real data. A Test mode tag shows near the dragon while you do. Each clip plays once and freezes on its last frame, which becomes the new pose.'),
      h('div', { class: 'set__grid' },
        h('div', { class: 'field' },
          h('label', { class: 'field__label', for: 'set-pct' }, 'Pretend today is this complete'),
          h('div', { class: 'set__slider' }, slider, sliderOut),
          h('div', { class: 'set__actions' }, useReal,
            h('button', { type: 'button', class: 'btn-ink btn-ink--ghost btn-ink--small', onclick: () => D.dragon.playForPct(Number(slider.value)) }, icon('play-fill'), "Play this level's action"),
            h('button', { type: 'button', class: 'btn-ink btn-ink--ghost btn-ink--small', onclick: () => { D.dragon.setOverride(null); D.dragon.resetPose(); D.util.toast("The dragon holds the pose that matches today's progress."); } }, icon('arrow-counterclockwise'), "Back to today's pose"),
            h('button', { type: 'button', class: 'btn-ink btn-ink--ghost btn-ink--small', onclick: () => D.dragon.replayCelebration() }, icon('stars'), 'Test the 100% celebration'))),
        h('div', { class: 'field' },
          h('span', { class: 'field__label' }, 'Animations'),
          h('label', { class: 'switch' }, animSwitch, h('span', { class: 'switch__track' }), h('span', null, 'Fireflies, mist, glow and dragon motion')),
          h('span', { class: 'field__hint' }, 'Follows your system setting the first time. Off keeps everything still.'))),
      h('div', { class: 'field' },
        h('span', { class: 'field__label' }, 'Play a clip'),
        clipList, weakLine, clipNote));

    /* ---------- idle life: random clips from idle/ and guests/ ---------- */
    const idleSet = () => D.store.state.settings.idle;
    const minIn = h('input', { class: 'input', id: 'idle-min', type: 'number', min: 0.25, max: 60, step: 0.25, inputmode: 'decimal' });
    const maxIn = h('input', { class: 'input', id: 'idle-max', type: 'number', min: 0.25, max: 60, step: 0.25, inputmode: 'decimal' });
    minIn.value = idleSet().min; maxIn.value = idleSet().max;
    function commitIdle() {
      const clamp = (n) => Math.min(60, Math.max(0.25, n));
      let mn = Number(minIn.value);
      let mx = Number(maxIn.value);
      if (!Number.isFinite(mn) || !Number.isFinite(mx)) { minIn.value = idleSet().min; maxIn.value = idleSet().max; return; }
      mn = clamp(mn); mx = Math.max(mn, clamp(mx));
      D.store.commit((st2) => { st2.settings.idle.min = mn; st2.settings.idle.max = mx; }, 'ui');
      minIn.value = mn; maxIn.value = mx;
      D.dragon.rescheduleIdle();
      paintIdle();
    }
    minIn.addEventListener('change', commitIdle);
    maxIn.addEventListener('change', commitIdle);

    const guestSwitch = h('input', { type: 'checkbox', checked: idleSet().guests, onchange: (e) => { D.store.commit((st2) => { st2.settings.idle.guests = e.target.checked; }, 'ui'); paintIdle(); } });
    const idleStatus = h('p', { class: 'set__line', role: 'status' });
    const idleTA = h('textarea', { class: 'input', rows: 4, id: 'idle-names', spellcheck: 'false', 'aria-label': 'Idle clip file names, one per line' });
    const guestTA = h('textarea', { class: 'input', rows: 3, id: 'guest-names', spellcheck: 'false', 'aria-label': 'Guest clip file names, one per line' });

    function paintIdle() {
      const q = D.dragon.idleStatus();
      const mins = Math.max(0, Math.round((q.nextAt - Date.now()) / 60000));
      idleStatus.textContent = `${q.idle} idle clip${q.idle === 1 ? '' : 's'} and ${q.guests} guest clip${q.guests === 1 ? '' : 's'} in the manifest. `
        + (q.idle + q.guests ? `The next random moment is due in about ${mins} min.` : 'Drop MP4 files into assets/dragon-video/idle (and guests), then press Scan folders.');
    }
    function paintLists() {
      idleTA.value = D.idleLib.lists.idle.join('\n');
      guestTA.value = D.idleLib.lists.guests.join('\n');
      paintIdle();
    }
    const lines = (ta) => ta.value.split('\n').map((x) => x.trim()).filter(Boolean);

    const scanBtn = h('button', {
      type: 'button', class: 'btn-ink btn-ink--primary', hidden: !D.idleLib.canScan,
      onclick: async () => {
        try {
          const r = await D.idleLib.scan();
          if (r) D.util.toast(`Found ${r.idle} idle and ${r.guests} guest clips. The manifest file is updated.`, 'good');
        } catch (err) { D.util.toast(err.message || 'Could not scan.', 'error'); }
      },
    }, icon('folder2-open'), 'Scan folders');

    const idleCard = h('section', { class: 'pane set__card', 'aria-labelledby': 'set-idle-h' },
      h('h2', { class: 'pane__title', id: 'set-idle-h' }, D.util.ink('Idle life', 'idle-life')),
      h('p', { class: 'set__text' }, 'While Daybook is open, the dragon plays one random clip from the idle folder at a random moment, once, then carries on in its pose. Ticking a goal restarts the timer. Nothing plays while the tab is hidden, a stage clip is playing, or you are typing.'),
      h('div', { class: 'set__pair' },
        h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'idle-min' }, 'Shortest wait (minutes)'), minIn),
        h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'idle-max' }, 'Longest wait (minutes)'), maxIn)),
      h('label', { class: 'switch' }, guestSwitch, h('span', { class: 'switch__track' }), h('span', null, 'Guests: about one event in five is another creature from the guests folder')),
      idleStatus,
      h('div', { class: 'set__actions' },
        scanBtn,
        h('button', { type: 'button', class: 'btn-ink btn-ink--ghost', onclick: () => { if (!D.dragon.playIdleNow()) D.util.toast('Nothing to play yet, or the dragon is busy.'); } }, icon('play-fill'), 'Play one now'),
        h('button', { type: 'button', class: 'btn-ink btn-ink--ghost', onclick: () => { D.util.download('idle-manifest.js', D.idleLib.manifestText(), 'text/javascript'); D.util.toast('Save it over assets/dragon-video/idle-manifest.js.'); } }, icon('download'), 'Download manifest')),
      h('details', { class: 'set__details' },
        h('summary', null, 'Edit the list by hand'),
        h('p', { class: 'set__line' }, 'A web page cannot list a folder on its own, so the names live in assets/dragon-video/idle-manifest.js. Scan folders rewrites it in one step (Chrome or Edge: pick the dragon-video folder once). Any other browser: type the file names here, Apply, then Download manifest and save it over that file.'),
        h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'idle-names' }, 'Idle clips'), idleTA),
        h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'guest-names' }, 'Guest clips'), guestTA),
        h('div', { class: 'set__actions' }, h('button', {
          type: 'button', class: 'btn-ink btn-ink--ghost btn-ink--small',
          onclick: () => {
            const want = lines(idleTA).length + lines(guestTA).length;
            D.idleLib.set({ idle: lines(idleTA), guests: lines(guestTA) });
            const got = D.idleLib.lists.idle.length + D.idleLib.lists.guests.length;
            D.util.toast(got === want ? 'List applied for this session. Download the manifest to keep it.' : `Applied ${got} of ${want}: names must be plain file names ending in .mp4.`, got === want ? 'good' : 'error');
          },
        }, 'Apply'))));
    paintLists();
    unsub.push(D.store.on('idle-lists', paintLists));
    const tick = setInterval(paintIdle, 15000);
    unsub.push(() => clearInterval(tick));

    const eraseCard = h('section', { class: 'pane set__card', 'aria-labelledby': 'set-danger-h' },
      h('h2', { class: 'pane__title', id: 'set-danger-h' }, 'Start over'),
      h('p', { class: 'set__text' }, 'Clear this browser and begin with an empty diary. Save a file first if you might want the old one back.'),
      h('div', { class: 'set__actions' }, h('button', { type: 'button', class: 'btn-ink btn-ink--danger', onclick: onErase }, icon('trash3'), 'Erase all data')));

    paintData();
    unsub.push(D.store.on('file', paintData));
    unsub.push(D.store.on('change', (e) => { if (e.source === 'backup') paintData(); }));

    root.append(
      D.pageHead('Settings', 'Settings', 'Where your data lives, and a workshop for the dragon.'),
      dataCard, nameCard, homeCard, alertsCard, workshop, idleCard, eraseCard);

    return () => { saveName.flush(); saveHome.flush(); saveDiet.flush(); unsub.forEach((u) => u()); };
  }

  D.pages.settings = { render };
})(window.Daybook);
