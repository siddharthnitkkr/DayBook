/* dragon.js — the dragon as one continuous creature.
   The forest is a full-screen video world, always shown in its own natural colour and brightness (no filters).
   The dragon's pose is the LAST FRAME of the clip that last played. Reaching a new stage of progress plays the
   next clip once, from that pose, with a 400 ms cross-fade between the two clips, and it freezes on its own
   last frame, which becomes the new pose. There is never a snap back to a first frame.
   Stages by progress: 0 weak (or the standing frame, still), 1 gather, 2 walk, 3 stand, 4 launch.
   Unticking never changes the pose; it only steps back on the next page load or the next day.
   Now and then (every 1-5 minutes, set in Settings) one random idle clip, or occasionally a guest creature, plays
   once over the held pose with a 400 ms crossfade and then the dragon simply carries on in its pose.
   The held pose keeps a tiny, slow breathing so it never looks like a paused video. Clips and framing: dragon-config.js. */
(function (D) {
  'use strict';

  const { h, icon } = D.util;
  const cfg = D.dragonConfig;
  const P = D.progress;
  const FADE = cfg.crossfadeMs;
  const SPARKS = 10;
  const GLOW = { idle: 0, weak: 0, low: 0.25, mid: 0.5, high: 0.85, full: 1.1 };
  const MQ = {
    phone: '(max-width: 599.98px)',
    portrait: '(min-width: 600px) and (max-aspect-ratio: 1/1)',
  };
  const STAGE_CLIPS = ['weak', 'gather', 'walk', 'stand', 'launch'];

  const vids = {};           // clip name -> { el, status: 'pending' | 'ready' | 'missing', ramp }
  const ui = {};             // cached nodes
  let world = null;
  let hud = null;
  let ready = false;
  let anim = true;
  let active = true;
  let override = null;       // test slider value, session only
  let busy = false;          // a clip is playing
  let settling = false;
  let ctl = null;            // the clip playing: { name }
  let playing = null;        // clip whose sound is audible
  let poseStage = -1;        // stage whose frame is held on screen
  let poseName = null;       // the video element holding that frame
  let wantStage = -1;        // stage to show as soon as its clip has loaded
  let speechTimer = 0;
  let idleTimer = 0;
  let idleCtl = null;        // the idle or guest clip playing: { fadeOut, done }
  let nextIdleAt = 0;
  let lastKeyAt = 0;         // last keystroke, to hold idle clips back while you type
  const idleEntry = { el: null, ramp: 0 };
  let lastMessage = '';
  let sampler = null;        // { ctx, timer, rgb } or false when the browser forbids reading pixels
  let lightBase = cfg.light.idle;
  let primed = false;
  const snd = { on: false, vol: 0.6, unlocked: false };

  /* ---------- progress ---------- */
  function stateKey(pct) {
    if (pct == null) return 'idle';
    if (pct <= 0) return 'weak';
    if (pct <= 33) return 'low';
    if (pct <= 66) return 'mid';
    if (pct < 100) return 'high';
    return 'full';
  }
  function stageFor(pct) {
    if (pct == null || pct <= 0) return 0;
    if (pct <= 33) return 1;
    if (pct <= 66) return 2;
    if (pct < 100) return 3;
    return 4;
  }
  const weakReal = () => !!vids.weak && vids.weak.status === 'ready';
  /* Stage 0 uses the weak clip if there is one, otherwise the standing clip held still. */
  const clipFor = (stage) => (stage === 0 ? (weakReal() ? 'weak' : 'stand') : STAGE_CLIPS[stage]);

  /* The glass takes on the colour and strength of the dragon's light. Only the glass: the video itself is never tinted. */
  function setLight(rgb, glow) {
    lightBase = rgb;
    const s = document.documentElement.style;
    const mixed = sampler && sampler.rgb ? rgb.map((c, i) => Math.round(c * 0.6 + sampler.rgb[i] * 0.4)) : rgb;
    s.setProperty('--sr', mixed[0]); s.setProperty('--sg', mixed[1]); s.setProperty('--sb', mixed[2]);
    if (glow != null) s.setProperty('--glow', glow);
  }

  /* Every couple of seconds, read the average colour of the pose so the glass picks up its green or gold.
     Browsers refuse this when the page is opened from disk (file://); then the state colours alone are used. */
  function startSampler() {
    if (sampler === false) return;
    if (!sampler) {
      const c = document.createElement('canvas');
      c.width = 8; c.height = 5;
      sampler = { ctx: c.getContext('2d', { willReadFrequently: true }), timer: 0, rgb: null };
    }
    if (sampler.timer) return;
    sampler.timer = setInterval(() => {
      const v = poseName && vids[poseName] ? vids[poseName].el : null;
      if (!active || !anim || !v || v.readyState < 2) return;
      try {
        sampler.ctx.drawImage(v, 0, 0, 8, 5);
        const d = sampler.ctx.getImageData(0, 0, 8, 5).data;
        let rr = 0; let g = 0; let b = 0;
        for (let i = 0; i < d.length; i += 4) { rr += d[i]; g += d[i + 1]; b += d[i + 2]; }
        const n = d.length / 4;
        const k = 215 / (Math.max(rr, g, b) / n || 1);          // lift the dark forest average into a glass-friendly tone
        sampler.rgb = [rr, g, b].map((c) => Math.min(255, Math.round(c / n * k)));
        setLight(lightBase);
      } catch (e) {
        clearInterval(sampler.timer);
        sampler = false;                                        // tainted by file://: stop trying
        setLight(lightBase);
      }
    }, 2500);
  }

  /* A warm flood of light across the glass edges and the ring, then it eases back to the scene colour. */
  function bloom() {
    if (!anim) return;
    const root = document.documentElement;
    root.style.transition = '--glow .45s ease, --sr .45s ease, --sg .45s ease, --sb .45s ease';
    root.style.setProperty('--sr', 255); root.style.setProperty('--sg', 214); root.style.setProperty('--sb', 140);
    root.style.setProperty('--glow', 2.4);
    document.body.classList.add('is-blooming');                 // golden bloom over every glass edge and the ring
    setTimeout(() => { root.style.transition = ''; setLight(cfg.light.full, GLOW.full); }, 1000);
    setTimeout(() => document.body.classList.remove('is-blooming'), 2600);
  }

  /* ---------- framing: the video covers the stage, the dragon lands on the right ---------- */
  function mode() {
    if (window.matchMedia(MQ.phone).matches) return 'phone';
    if (window.matchMedia(MQ.portrait).matches) return 'portrait';
    return 'wide';
  }

  /* On phones the scene is sized from the SMALL viewport (100svh), which does not change when the browser toolbar
     shows or hides, so the dragon never pops or resizes. A hidden probe measures it. */
  let probe = null;
  let lastLayoutW = 0;
  function stableHeight() {
    if (!probe) {
      probe = document.createElement('div');
      Object.assign(probe.style, { position: 'fixed', left: '-9999px', top: '0', width: '1px', height: '100svh', visibility: 'hidden', pointerEvents: 'none' });
      probe.setAttribute('aria-hidden', 'true');
      document.body.append(probe);
    }
    return probe.offsetHeight || Math.min(window.innerHeight, window.screen && window.screen.height ? window.screen.height : window.innerHeight);
  }

  function stageRect() {
    const m = mode();
    const vw = window.innerWidth;
    const vh = m === 'phone' ? stableHeight() : window.innerHeight;
    return { m, w: vw, h: Math.round(vh * cfg.world.stage[m]), vw, vh };
  }

  /* Where a clip sits on the stage, and where the dragon ends up inside it. */
  function boxFor(name) {
    const clip = name === 'idle' ? cfg.idleFraming : (cfg.clips[name] || cfg.clips.stand);
    const r = stageRect();
    const el = name === 'idle' ? idleEntry.el : (vids[name] ? vids[name].el : null);
    const ar = el && el.videoWidth && el.videoHeight ? el.videoWidth / el.videoHeight : 16 / 9;
    const zoom = clip.zoom || cfg.world.zoom;
    const still = name === 'stand' && clip.stillAnchor && (poseStage === 0 || (poseStage < 0 && wantStage === 0));
    const [ax, ay] = (still ? clip.stillAnchor : clip.anchor) || cfg.world.anchor;
    const [fx, fy] = cfg.world.target[r.m];
    const H = Math.max(r.h, r.w / ar) * zoom;
    const W = H * ar;
    const slack = r.m === 'wide' ? r.w * cfg.world.slackLeft : 0;
    const left = Math.min(slack, Math.max(r.w - W, r.w * fx - ax * W));
    const top = Math.min(0, Math.max(r.h - H, r.h * fy - ay * H));
    return { left, top, W, H, ax, ay, dx: left + ax * W, dy: top + ay * H, r };
  }

  function layout() {
    if (!ui.stage) return;
    const r = stageRect();
    ui.stage.style.width = `${r.w}px`; ui.stage.style.height = `${r.h}px`;
    const short = r.h < r.vh - 2;
    ui.stage.classList.toggle('is-short', short);
    world.classList.toggle('has-short-stage', short);
    Object.keys(vids).forEach((n) => {
      const b = boxFor(n);
      const el = vids[n].el;
      el.style.width = `${b.W.toFixed(1)}px`; el.style.height = `${b.H.toFixed(1)}px`;
      el.style.left = `${b.left.toFixed(1)}px`; el.style.top = `${b.top.toFixed(1)}px`;
      el.style.clipPath = cfg.clips[n].cropLeft ? `inset(0 0 0 ${(cfg.clips[n].cropLeft * 100).toFixed(0)}%)` : '';
      el.style.transformOrigin = `${(b.ax * 100).toFixed(0)}% ${(b.ay * 100).toFixed(0)}%`;   // the breathing pivots on the dragon
    });
    if (idleEntry.el) {
      const ib = boxFor('idle');
      const iv = idleEntry.el;
      iv.style.width = `${ib.W.toFixed(1)}px`; iv.style.height = `${ib.H.toFixed(1)}px`;
      iv.style.left = `${ib.left.toFixed(1)}px`; iv.style.top = `${ib.top.toFixed(1)}px`;
    }
    const sb = boxFor('stand');
    lastLayoutW = r.vw;
    world.style.setProperty('--fx', `${sb.dx.toFixed(0)}px`);    // pixels from the top left, so nothing shifts when the toolbar moves
    world.style.setProperty('--fy', `${sb.dy.toFixed(0)}px`);
  }

  /* ---------- phones: the forest carries on behind the glass sheet ----------
     The scene itself keeps a fixed size at the top. Below it, a heavily blurred copy of the forest floor from the
     picture on screen fills the rest of the screen, so the clear glass sheet sits over living forest colour instead
     of a flat dark patch. It is a separate soft layer; the dragon and forest video are never filtered. */
  let ambientTimer = 0;
  function drawAmbient() {
    if (!ui.ambient || mode() !== 'phone' || !anim || !active) return;
    const live = ui.videos.querySelectorAll('.dragon__video.is-on');
    const v = live[live.length - 1];
    if (!v || v.readyState < 2 || !v.videoWidth) return;
    try {
      const c = ui.ambient;
      c.getContext('2d').drawImage(v, 0, v.videoHeight * 0.52, v.videoWidth, v.videoHeight * 0.48, 0, 0, c.width, c.height);
    } catch (e) { /* not ready */ }
  }

  /* ---------- clips ---------- */
  function makeVideo(name, clip) {
    const el = h('video', {
      class: 'dragon__video', playsinline: true, preload: 'auto', tabindex: '-1', 'aria-hidden': 'true',
      disablepictureinpicture: true, disableremoteplayback: true,
    });
    el.setAttribute('webkit-playsinline', '');             // older iOS
    el.muted = true; el.defaultMuted = true; el.volume = 0; el.loop = false;   // silent until sound is on; never loops
    const entry = { el, status: 'pending', ramp: 0 };
    el.addEventListener('loadedmetadata', () => {
      entry.status = 'ready';
      layout();
      if (ready && !busy && wantStage >= 0 && (poseStage !== wantStage || poseName !== resolveName(wantStage))) showPose(wantStage);
      D.store.emit('dragon-clips');
    });
    el.addEventListener('error', () => {
      if (entry.status === 'missing') return;
      entry.status = 'missing';
      D.store.emit('dragon-clips');
      if (ready) { sync(); if (!busy && wantStage >= 0) showPose(wantStage); }
    });
    el.src = cfg.basePath + clip.file;
    vids[name] = entry;
    return el;
  }

  function resolve(name) {
    const chain = [name, ...((cfg.clips[name] && cfg.clips[name].fallback) || [])];
    for (const n of chain) {
      if (cfg.clips[n] && vids[n] && vids[n].status !== 'missing') return { clip: n, original: name, fellBack: n !== name };
    }
    return null;
  }
  const resolveName = (stage) => { const r = resolve(clipFor(stage)); return r ? r.clip : null; };

  /* Stronger glass backing while a bright scene is on screen: any clip playing, or the launch pose against the sky. */
  function backing() {
    const bright = !!playing || !!idleCtl || poseStage === 4;
    const root = document.documentElement.style;
    if (bright) root.setProperty('--back-boost', 0.1); else root.removeProperty('--back-boost');
  }

  /* ---------- the held pose ---------- */
  /* Where in a clip the pose frame is: its last frame, except the "standing, still" tired look. */
  function poseTime(name, stage) {
    if (stage === 0 && name === 'stand') return cfg.stillAt;
    const v = vids[name].el;
    return Math.max(0, (v.duration || 8) - 0.04);
  }

  function fadeOutPose(name) {
    const v = vids[name].el;
    v.classList.remove('is-on');
    setTimeout(() => {
      if (poseName !== name && !(ctl && ctl.name === name)) { v.classList.remove('is-pose'); v.pause(); }
    }, FADE + 80);
  }

  /* only the current pose breathes; earlier poses are already faded out */
  function dropOldPoses(keep) {
    Object.entries(vids).forEach(([n, e]) => { if (n !== keep && !e.el.classList.contains('is-on')) e.el.classList.remove('is-pose'); });
  }

  /* Hold the pose of `stage` without playing anything (page load, new day, test slider). */
  function showPose(stage) {
    wantStage = stage;
    const name = resolveName(stage);
    if (!name || busy) return;
    if (poseName === name && poseStage === stage) return;
    const v = vids[name].el;
    if (v.readyState < 1) return;                              // its loadedmetadata handler will come back here
    const prev = poseName;
    let done = false;
    const apply = () => {
      if (done) return;
      done = true;
      if (prev && prev !== name) fadeOutPose(prev);
      v.classList.add('is-on', 'is-pose');
      poseName = name; poseStage = stage;
      dropOldPoses(name);
      layout();
      world.dataset.pose = stage === 4 ? 'launched' : '';
      backing();
      applySound();
    };
    v.pause(); v.loop = false;
    v.addEventListener('seeked', apply, { once: true });
    try { v.currentTime = poseTime(name, stage); } catch (e) { apply(); }
    setTimeout(apply, 450);                                    // already at that time: no seeked event
  }

  /* Play a clip once, from the current pose, and freeze on its own last frame as the new pose. */
  function playToEnd(name, stage) {
    const v = vids[name].el;
    busy = true;
    ctl = { name };
    return new Promise((resolvePlay) => {
      let finished = false;
      let guard = 0;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(guard);
        v.removeEventListener('ended', finish);
        v.pause();                                             // holds the clip's last frame
        v.classList.add('is-pose');
        if (playing === name) { playing = null; applySound(); }
        poseName = name; poseStage = stage; wantStage = stage;
        dropOldPoses(name);
        layout();
        world.dataset.pose = stage === 4 ? 'launched' : '';
        ctl = null; busy = false;
        backing();
        resolvePlay(true);
      };
      const prev = poseName;
      if (prev && prev !== name) fadeOutPose(prev);            // the only cross-fade: this clip over the previous one
      v.classList.remove('is-pose');
      v.loop = false; v.playbackRate = 1;
      try { v.currentTime = 0; } catch (e) { /* starts at 0 */ }
      v.addEventListener('ended', finish, { once: true });
      const go = () => {
        v.classList.add('is-on');
        playing = name;
        document.documentElement.style.setProperty('--back-boost', 0.1);   // a little more glass backing against bright scenes
        applySound();
      };
      const p = v.play();
      if (p && p.then) p.then(go).catch(() => { finished = true; busy = false; ctl = null; showPose(stage); resolvePlay(false); }); else go();
      guard = setTimeout(() => { if (!playing) finish(); }, 4000);   // never stay stuck if playback is refused
    });
  }

  /* Move the pose forward to the stage progress has reached. Several ticks in a row wait their turn. */
  async function settle() {
    if (settling) return;
    settling = true;
    try {
      while (anim && active) {
        const target = stageFor(currentPct());
        if (target <= poseStage) break;                        // never steps back: unticking leaves the pose alone
        const name = resolveName(target);
        if (!name) break;
        await stopIdle();                                      // never two clips at once
        if (target === 4) { flash(); bloom(); say(D.util.pick(cfg.victoryMessages), 6000); }
        if (!(await playToEnd(name, target))) break;
      }
      if (!anim || !active) showPose(stageFor(currentPct()));
    } finally { settling = false; }
  }

  /* ---------- idle life: one random clip from idle/ (or occasionally guests/), then carry on ---------- */
  const typing = () => {
    const a = document.activeElement;
    const field = a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && /^(text|search|)$/.test(a.type || '')));
    return !!field && Date.now() - lastKeyAt < 20000;
  };

  function pickIdle() {
    const L = D.idleLib.lists;
    const guestsOn = D.store.state.settings.idle.guests && L.guests.length > 0;
    let kind;
    if (guestsOn && (!L.idle.length || Math.random() < 0.2)) kind = 'guests';   // about one event in five
    else if (L.idle.length) kind = 'idle';
    else return null;
    const name = D.util.pick(L[kind]);
    return { kind, name, url: D.idleLib.urlFor(kind, name) };
  }

  function scheduleIdle() {
    clearTimeout(idleTimer);
    const { min, max } = D.store.state.settings.idle;
    const ms = (min + Math.random() * (max - min)) * 60000;
    nextIdleAt = Date.now() + ms;
    idleTimer = setTimeout(idleTick, ms);
  }

  async function idleTick() {
    // skipped (and rescheduled) while the tab is hidden, while a stage clip is playing, or while you are typing
    if (ready && anim && active && !busy && !settling && !typing()) {
      const c = pickIdle();
      if (c) await playIdleClip(c);
    }
    scheduleIdle();
  }

  /* Plays the file once over the held pose. Crossfades in over 400 ms, crossfades out for its last 400 ms. */
  function playIdleClip(c) {
    const v = idleEntry.el;
    busy = true;
    return new Promise((resolveIdle) => {
      let finished = false;
      let leaving = false;
      let watcher = 0;
      let guard = 0;
      let notify;
      const done = new Promise((r) => { notify = r; });
      const finish = () => {
        if (finished) return;
        finished = true;
        clearInterval(watcher); clearTimeout(guard);
        v.removeEventListener('ended', fadeOut);
        v.removeEventListener('error', finish);
        v.pause();
        v.classList.remove('is-on');
        v.removeAttribute('src');
        v.load();                                              // let go of the file
        if (playing === 'idle') { playing = null; applySound(); }
        idleCtl = null; busy = false;
        backing();
        resolveIdle(true);
        notify();
      };
      function fadeOut() {
        if (leaving) return;
        leaving = true;
        v.classList.remove('is-on');
        if (playing === 'idle') { playing = null; applySound(); }
        setTimeout(finish, FADE + 80);
      }
      idleCtl = { fadeOut, done, kind: c.kind, name: c.name };
      v.loop = false;
      v.addEventListener('ended', fadeOut, { once: true });
      v.addEventListener('error', finish, { once: true });
      v.addEventListener('canplay', () => {
        if (finished) return;
        layout();
        const p = v.play();
        const go = () => {
          if (finished) return;
          v.classList.add('is-on');
          playing = 'idle';
          document.documentElement.style.setProperty('--back-boost', 0.1);
          applySound();
          watcher = setInterval(() => { if (v.duration && v.currentTime >= v.duration - FADE / 1000) fadeOut(); }, 50);
        };
        if (p && p.then) p.then(go).catch(finish); else go();
      }, { once: true });
      v.src = c.url;
      v.load();
      guard = setTimeout(() => { if (!playing) finish(); }, 8000);   // a missing file or refused playback never leaves it stuck
    });
  }

  async function stopIdle() {
    if (idleCtl) { const c = idleCtl; c.fadeOut(); await c.done; }
  }

  /* ---------- the look: the glass and the ring follow progress; the video is never filtered ---------- */
  function currentPct() {
    if (override != null) return override;
    return P.day(D.store.state, new Date()).pct;
  }

  function sync() {
    if (!ready) return;
    const pct = currentPct();
    const key = stateKey(pct);
    const missed = P.missedYesterday(D.store.state);
    world.dataset.state = key;
    setLight(cfg.light[key], GLOW[key]);
    drawRing();
    updateBadge();
    ui.testchip.hidden = override == null;
    ui.caption = missed && key === 'weak' ? 'Yesterday slipped by... I faded' : cfg.states[key].caption;
    if (!lastMessage) ui.popMsg.textContent = ui.caption;
    if (poseStage < 0) showPose(stageFor(pct));                // first time only; later syncs never move the pose
  }

  /* ---------- HUD: the segmented goal ring ---------- */
  const RING_R = 29;
  const RING_C = 2 * Math.PI * RING_R;
  let ringN = -1;
  let lastDone = 0;

  function buildSegments(n) {
    ringN = n;
    ui.segs.replaceChildren();
    const count = Math.max(n, 1);
    const gap = count > 1 ? 3.2 : 0;
    ui.segLen = RING_C / count - gap;
    ui.segBars = [];
    for (let i = 0; i < count; i++) {
      const rot = -90 + (i * 360) / count + ((gap / 2) / RING_C) * 360;
      const common = { cx: 36, cy: 36, r: RING_R, transform: `rotate(${rot.toFixed(2)} 36 36)` };
      ui.segs.append(h('svg:circle', { ...common, class: 'seg-track', style: { strokeDasharray: `${ui.segLen.toFixed(2)} ${RING_C.toFixed(2)}` } }));
      const bar = h('svg:circle', { ...common, class: 'seg-bar', style: { strokeDasharray: `0 ${RING_C.toFixed(2)}` } });
      ui.segs.append(bar);
      ui.segBars.push(bar);
    }
  }

  function drawRing() {
    const day = P.day(D.store.state, new Date());
    let total = day.total;
    let done = day.done.length;
    if (override != null) { total = total || 5; done = Math.round((override / 100) * total); }
    const n = total ? Math.min(total, 24) : 0;
    if (n !== ringN) buildSegments(n);
    const filled = total ? Math.round((done / total) * n) : 0;
    ui.segBars.forEach((b, i) => {
      const on = total > 0 && i < filled;
      b.style.strokeDasharray = `${on ? ui.segLen.toFixed(2) : 0} ${RING_C.toFixed(2)}`;
    });
    ui.countNum.textContent = total ? String(done) : '–';
    ui.countOf.textContent = total ? `of ${total}` : 'no goals';
    ui.ringBtn.setAttribute('aria-label', total ? `${done} of ${total} goals done today. Open dragon details.` : 'No goals today. Open dragon details.');
    ui.ringBtn.classList.toggle('is-full', total > 0 && done === total);
    if (done > lastDone) restart(ui.ringBtn, 'is-pop');
    lastDone = done;
  }

  function updateBadge() {
    const pw = P.power(D.store.state);
    hud.dataset.level = String(pw.index);
    ui.badgeText.textContent = pw.name;
    ui.badgeLv.textContent = `Lv ${pw.index + 1}`;
    ui.meterFill.style.transform = `scaleX(${pw.fraction.toFixed(3)})`;
    ui.meterText.textContent = pw.next
      ? `${pw.points} power · ${pw.toNext} more to ${pw.next.name}`
      : `${pw.points} power · fully grown`;
  }

  function setPop(open) {
    ui.pop.hidden = !open;
    ui.ringBtn.setAttribute('aria-expanded', String(open));
    if (open) ui.popMsg.textContent = lastMessage || ui.caption || '';
  }

  /* ---------- little moments ---------- */
  function say(text, ms = 4200) {
    lastMessage = text;
    ui.popMsg.textContent = text;
    ui.speech.textContent = text;
    ui.speech.classList.add('is-on');
    clearTimeout(speechTimer);
    speechTimer = setTimeout(() => ui.speech.classList.remove('is-on'), ms);
  }
  function restart(node, cls = 'is-on') { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); }
  const flash = () => { if (anim) restart(ui.flash); };

  /* Called right after a goal is ticked or unticked (from Today or the phone peek). */
  function react(ticked) {
    if (!ready) return;
    restart(ui.ringBtn, 'is-pop');
    if (!ticked) { say(D.util.pick(cfg.untickMessages)); return; }   // unticking leaves the pose exactly as it is
    if (stageFor(currentPct()) < 4) say(D.util.pick(cfg.tickMessages));
    scheduleIdle();                                            // a tick restarts the idle timer
    settle().then(scheduleIdle);                               // and again once the stage clip has finished
  }

  function greeting() {
    const s = D.store.state;
    const hour = new Date().getHours();
    const hi = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const name = s.settings.name ? `, ${s.settings.name}` : '';
    const day = P.day(s, new Date());
    const missed = P.missedYesterday(s);
    if (day.pct == null) return `${hi}${name}. Nothing is written for today yet. Plant a goal and the dragon wakes.`;
    if (day.pct === 0 && missed) return `${hi}${name}. Yesterday slipped by and the dragon has grown weary. One small tick will wake it.`;
    if (day.pct === 0) return `${hi}${name}. The page is fresh and the dragon is asleep. Light the first goal.`;
    if (day.pct <= 33) return `${hi}${name}. The first ember is lit. The dragon is stirring.`;
    if (day.pct <= 66) return `${hi}${name}. Half the page is glowing. The dragon walks beside you.`;
    if (day.pct < 100) return `${hi}${name}. So close. The dragon can feel the sky.`;
    return `${hi}${name}. Every goal is lit. Today belongs to you.`;
  }

  /* ---------- sound: off by default, the button itself starts it ---------- */
  function ramp(entry, to) {
    clearInterval(entry.ramp);
    const el = entry.el;
    if (to > 0) el.muted = false;
    const from = el.volume;
    if (from === to) { if (to === 0) el.muted = true; return; }
    let i = 0;
    const steps = 12;
    entry.ramp = setInterval(() => {
      i += 1;
      el.volume = Math.max(0, Math.min(1, from + (to - from) * (i / steps)));
      if (i >= steps) { clearInterval(entry.ramp); if (to === 0) el.muted = true; }
    }, FADE / steps);
  }

  /* Only the clip that is playing is heard. */
  function applySound() {
    [...Object.entries(vids), ['idle', idleEntry]].forEach(([name, entry]) => { if (entry.el) ramp(entry, snd.on && snd.unlocked && name === playing ? snd.vol : 0); });
  }

  /* iOS Safari only allows sound on a video element that has been played inside a tap. The first tap after
     sound is switched on plays every idle clip silently for an instant, so later clips are allowed to be heard. */
  function primeAudio() {
    if (primed || busy) return;
    primed = true;
    Object.entries(vids).forEach(([name, entry]) => {
      if (entry.status === 'missing' || name === poseName) return;     // never disturb the pose on screen
      const el = entry.el;
      el.muted = false; el.volume = 0;
      const p = el.play();
      if (p && p.then) p.then(() => { el.pause(); el.muted = true; }).catch(() => { el.muted = true; });
    });
  }

  function paintSound() {
    ui.soundBtn.setAttribute('aria-pressed', String(snd.on));
    ui.soundBtn.setAttribute('aria-label', snd.on ? 'Turn dragon sound off' : 'Turn dragon sound on');
    ui.soundIcon.className = `bi bi-volume-${snd.on ? 'up-fill' : 'mute-fill'}`;
    ui.vol.hidden = !snd.on;
    ui.vol.value = String(Math.round(snd.vol * 100));
  }
  const saveSound = D.util.debounce(() => {
    D.store.commit((s) => { s.settings.sound = { on: snd.on, volume: snd.vol }; }, 'ui');
  }, 400);

  /* ---------- activity: nothing runs while the tab is hidden ---------- */
  function updateActive() {
    const next = !document.hidden;
    if (next === active) return;
    active = next;
    if (!active) {
      if (ctl) vids[ctl.name].el.pause();
      if (idleCtl) idleEntry.el.pause();
      if (sampler && sampler.timer) { clearInterval(sampler.timer); sampler.timer = 0; }
    } else {
      if (ctl) vids[ctl.name].el.play().catch(() => {});
      if (idleCtl) idleEntry.el.play().catch(() => {});
      startSampler();
    }
  }

  function setAnimations(on) {
    anim = on;
    world.classList.toggle('no-anim', !on);
    hud.classList.toggle('no-anim', !on);
    sync();
  }

  /* The pose that matches the data: used on a page load, a new day, or an import. */
  function resetPose() {
    if (busy) return;
    poseStage = -1;
    wantStage = stageFor(currentPct());
    showPose(wantStage);
    sync();
  }

  /* ---------- test controls (Settings) ---------- */
  const api = {
    greeting, react, sync, say, resetPose,
    setOverride(n) {
      override = n;
      sync();
      if (!busy) { poseStage = -1; showPose(stageFor(currentPct())); }
    },
    get override() { return override; },
    forceClip(name) {            // plays that clip once; it freezes on its last frame as the pose
      if (!cfg.clips[name]) return null;
      const r = resolve(name);
      if (!r) return null;
      ui.testchip.hidden = false;
      if (!busy) {
        const stage = STAGE_CLIPS.indexOf(r.clip);
        playToEnd(r.clip, stage < 0 ? poseStage : stage);
        if (name === 'launch') { flash(); bloom(); }
      }
      return r;
    },
    playForPct(pct) {            // the clip a tick reaching this progress would play
      override = pct;
      sync();
      poseStage = Math.max(-1, stageFor(pct) - 1);
      settle();
    },
    clearForced() { sync(); },
    replayCelebration() {
      if (busy) return;
      poseStage = 3;
      flash(); bloom(); say(D.util.pick(cfg.victoryMessages), 6000);
      playToEnd(resolveName(4) || 'launch', 4);
    },
    playIdleNow() {              // one random idle or guest clip right now (a test button in Settings)
      if (busy || !anim) return false;
      const c = pickIdle();
      if (!c) return false;
      playIdleClip(c).then(scheduleIdle);
      return true;
    },
    rescheduleIdle: () => scheduleIdle(),
    idleStatus: () => ({ nextAt: nextIdleAt, idle: D.idleLib.lists.idle.length, guests: D.idleLib.lists.guests.length }),
    /* The tired look when there is no weak clip: shown in Settings, never as a banner. */
    weakNote() {
      return weakReal() ? '' : `No ${cfg.clips.weak.file} yet, so the tired look is the standing frame in full colour, perfectly still, with only a very subtle breathing.`;
    },
    clipStatus() {
      return Object.entries(cfg.clips).map(([name, c]) => ({
        name, file: c.file, optional: !!c.optional,
        status: vids[name] ? vids[name].status : 'pending',
        fallsBackTo: (resolve(name) || {}).clip || null,
      }));
    },
    setAnimations,
    get sound() { return { ...snd }; },
  };

  /* ---------- mount ---------- */
  function mount(worldEl, hudEl) {
    world = worldEl;
    hud = hudEl;
    const s = D.store.state;
    anim = s.settings.animations;
    snd.on = s.settings.sound.on;
    snd.vol = s.settings.sound.volume;

    const sparks = Array.from({ length: SPARKS }, (_, i) => {
      const r = D.util.rng(i * 977 + 13);
      return h('span', { class: 'world__spark', style: { '--x': (r() * 40 - 20).toFixed(1), '--delay': `${(r() * 6).toFixed(2)}s`, '--dur': `${(6 + r() * 5).toFixed(2)}s`, '--sz': `${(2 + r() * 3).toFixed(1)}px` } });
    });

    idleEntry.el = h('video', {
      class: 'dragon__video', playsinline: true, preload: 'none', tabindex: '-1', 'aria-hidden': 'true',
      disablepictureinpicture: true, disableremoteplayback: true,
    });
    idleEntry.el.setAttribute('webkit-playsinline', '');
    idleEntry.el.muted = true; idleEntry.el.defaultMuted = true; idleEntry.el.volume = 0; idleEntry.el.loop = false;
    ui.videos = h('div', { class: 'world__videos' }, Object.entries(cfg.clips).map(([n, c]) => makeVideo(n, c)), idleEntry.el);
    ui.stage = h('div', { class: 'world__stage' }, ui.videos);
    ui.ambient = h('canvas', { class: 'world__ambient', width: 48, height: 64, 'aria-hidden': 'true' });
    ui.flash = h('div', { class: 'world__flash' });
    world.append(
      ui.ambient,
      ui.stage,
      h('div', { class: 'world__glow' }),
      h('div', { class: 'world__sparks' }, sparks),
      h('div', { class: 'world__shade' }),
      ui.flash);

    /* HUD: sound button, then the round goal ring with its popover */
    ui.segs = h('svg:g', { class: 'ring__segs' });
    ui.countNum = h('b', null, '–');
    ui.countOf = h('i', null, 'no goals');
    ui.ringBtn = h('button', {
      type: 'button', class: 'ring glass', 'aria-expanded': 'false', 'aria-controls': 'ring-pop', 'aria-label': 'Open dragon details',
      onclick: () => setPop(ui.pop.hidden),
    },
    h('svg:svg', { viewBox: '0 0 72 72', 'aria-hidden': 'true', focusable: 'false' }, ui.segs),
    h('span', { class: 'ring__count', 'aria-hidden': 'true' }, ui.countNum, ui.countOf));

    ui.badgeText = h('span', null, 'Hatchling');
    ui.badgeLv = h('span', { class: 'pop__lv' }, 'Lv 1');
    ui.meterFill = h('span', { class: 'pop__fill' });
    ui.meterText = h('span', { class: 'pop__meter-text' });
    ui.popMsg = h('p', { class: 'pop__msg' }, '');
    ui.pop = h('div', { class: 'pop glass', id: 'ring-pop', role: 'group', 'aria-label': 'Dragon details', hidden: true },
      h('p', { class: 'pop__name' }, ui.badgeText, ui.badgeLv),
      h('span', { class: 'pop__bar' }, ui.meterFill), ui.meterText,
      ui.popMsg);

    ui.soundIcon = icon('volume-mute-fill');
    ui.soundBtn = h('button', {
      type: 'button', class: 'sound__btn', 'aria-pressed': 'false',
      onclick: () => {
        snd.on = !snd.on;
        snd.unlocked = true;                 // this tap is the user gesture browsers (iOS included) require for sound
        if (snd.on) primeAudio();
        paintSound(); applySound(); saveSound();
      },
    }, ui.soundIcon);
    ui.vol = h('input', {
      type: 'range', class: 'sound__vol', min: 0, max: 100, step: 1, hidden: true, 'aria-label': 'Dragon volume',
      oninput: (e) => { snd.vol = Number(e.target.value) / 100; snd.unlocked = true; applySound(); saveSound(); },
    });
    const soundBox = h('div', { class: 'sound glass' }, ui.soundBtn, ui.vol);

    ui.speech = h('div', { class: 'speech glass', role: 'status', 'aria-live': 'polite' });
    ui.testchip = h('span', { class: 'testchip', hidden: true }, 'Test mode');
    hud.append(h('div', { class: 'hud__row' }, soundBox, ui.ringBtn), ui.pop, ui.testchip, ui.speech);

    document.addEventListener('pointerdown', (e) => { if (!ui.pop.hidden && !hud.contains(e.target)) setPop(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !ui.pop.hidden) { setPop(false); ui.ringBtn.focus(); } });

    /* browsers allow sound only after a tap or key press; the first one unlocks a remembered "on" */
    const unlock = () => {
      snd.unlocked = true;
      if (snd.on) primeAudio();
      applySound();
      window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    world.classList.toggle('no-anim', !anim);
    hud.classList.toggle('no-anim', !anim);
    window.addEventListener('resize', D.util.debounce(() => {
      if (mode() === 'phone' && window.innerWidth === lastLayoutW) return;   // only the toolbar moved: leave the scene alone
      layout();
    }, 120));
    document.addEventListener('visibilitychange', updateActive);

    ready = true;
    layout();
    paintSound();
    wantStage = stageFor(currentPct());
    sync();
    startSampler();
    ambientTimer = setInterval(drawAmbient, 140);
    document.addEventListener('keydown', () => { lastKeyAt = Date.now(); }, true);
    scheduleIdle();

    D.store.on('change', (e) => { if (e.source !== 'dragon' && e.source !== 'ui' && e.source !== 'backup') sync(); });
    D.store.on('reload', () => {
      const st = D.store.state;
      snd.on = st.settings.sound.on; snd.vol = st.settings.sound.volume;
      paintSound(); applySound();
      lastDone = 0;
      setAnimations(st.settings.animations);
      resetPose();
    });
    D.store.on('daychange', () => { lastDone = 0; resetPose(); });   // a new day starts weak
  }

  D.dragon = Object.assign({ mount }, api);
})(window.Daybook);
