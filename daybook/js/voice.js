/* voice.js — speech-to-text with the browser's own Web Speech API. Nothing is installed and no audio is kept by Daybook
   (Chrome and Edge send the audio to their own speech service; Daybook itself sends nothing anywhere).
   - D.voice.field(input): wraps a text field or text area with a small microphone button inside it.
   - D.voice.capture(): "quick capture": listens for one sentence and resolves with the text for the page to turn into a draft.
   Where speech recognition is missing, the microphone is simply not drawn and typing works as always. */
(function (D) {
  'use strict';

  const { h, icon } = D.util;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = !!SR;
  let current = null;   // the recogniser that is listening, so only one runs at a time

  const lang = () => (D.store.state.settings.voiceLang === 'hi-IN' ? 'hi-IN' : 'en-US');

  const FRIENDLY = {
    'not-allowed': 'Microphone permission was denied. You can still type.',
    'service-not-allowed': 'Microphone permission was denied. You can still type.',
    'no-speech': 'I did not hear anything. Try again, or type.',
    'audio-capture': 'No microphone was found. You can still type.',
    network: 'Speech recognition needs an internet connection in this browser. You can still type.',
    'language-not-supported': 'That language is not available for speech here. Change it in Settings, or type.',
  };

  /* Starts listening. Callbacks: onText(partialOrFinalText), onDone(finalText), onError(friendlyMessage).
     Stops by itself after a few seconds of silence. Returns { stop }. */
  function listen({ onText, onDone, onError }) {
    if (!supported) { if (onError) onError('Voice input is not available in this browser. Typing works everywhere.'); return { stop() {} }; }
    if (current) current.stop();
    const rec = new SR();
    rec.lang = lang();
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let finalText = '';
    let heard = false;
    let failed = false;
    let silence = 0;
    const bump = (ms) => { clearTimeout(silence); silence = setTimeout(() => { try { rec.stop(); } catch (e) { /* already stopped */ } }, ms); };

    rec.onresult = (e) => {
      heard = true;
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += `${r[0].transcript} `; else interim += r[0].transcript;
      }
      if (onText) onText(`${finalText}${interim}`.trim());
      bump(2600);                                              // a few seconds of silence ends it
    };
    rec.onerror = (e) => {
      failed = true;
      if (onError) onError(FRIENDLY[e.error] || 'Voice input stopped. You can still type.');
    };
    rec.onend = () => {
      clearTimeout(silence);
      if (current && current.rec === rec) current = null;
      if (!failed && !heard && onError) onError(FRIENDLY['no-speech']);
      if (onDone) onDone(finalText.trim());
    };
    const handle = { rec, stop() { try { rec.stop(); } catch (e) { /* already stopped */ } } };
    current = handle;
    try { rec.start(); bump(7000); } catch (err) { current = null; if (onError) onError('Voice input could not start. You can still type.'); }
    return handle;
  }

  /* A text field or text area with a microphone inside it. The spoken words land in the field (in its own
     handwriting font), so they can be edited before anything is saved. */
  function field(input) {
    const area = input.tagName === 'TEXTAREA';
    const wrap = h('span', { class: `vwrap${area ? ' vwrap--area' : ''}` }, input);
    if (!supported) return wrap;
    const btn = h('button', {
      type: 'button', class: 'mic', 'aria-pressed': 'false', 'aria-label': 'Speak instead of typing', title: 'Speak instead of typing',
    }, icon('mic-fill'));
    let ctl = null;
    const set = (on) => { btn.classList.toggle('is-listening', on); btn.setAttribute('aria-pressed', String(on)); btn.setAttribute('aria-label', on ? 'Stop listening' : 'Speak instead of typing'); };
    btn.addEventListener('click', () => {
      if (ctl && btn.classList.contains('is-listening')) { ctl.stop(); return; }
      const base = input.value;
      const gap = base && !/\s$/.test(base) ? ' ' : '';
      set(true);
      ctl = listen({
        onText: (t) => { input.value = base + gap + t; input.dispatchEvent(new Event('input', { bubbles: true })); },
        onDone: () => { set(false); input.focus({ preventScroll: true }); },
        onError: (msg) => { set(false); D.util.toast(msg); },
      });
    });
    wrap.append(btn);
    return wrap;
  }

  /* Quick capture: a small glass dialog that listens for one sentence and hands it back. Resolves null if cancelled. */
  function capture(hint) {
    return new Promise((resolve) => {
      if (!supported) { D.util.toast('Voice input is not available in this browser. Typing works everywhere.'); resolve(null); return; }
      const live = h('p', { class: 'cap__live', role: 'status', 'aria-live': 'polite' }, 'Listening…');
      let text = '';
      let ctl = null;
      let closed = false;
      const api = D.util.modal({
        title: 'Say it out loud',
        className: 'dlg--cap',
        body: [
          h('div', { class: 'cap__orb is-listening', 'aria-hidden': 'true' }, icon('mic-fill')),
          live,
          h('p', { class: 'dlg__text' }, hint),
        ],
        actions: [
          { label: 'Cancel', kind: 'ghost', onClick: () => { text = ''; if (ctl) ctl.stop(); api.close(); } },
          { label: 'Done', kind: 'primary', onClick: () => { if (ctl) ctl.stop(); else api.close(); } },
        ],
      });
      api.el.addEventListener('close', () => {
        if (closed) return;
        closed = true;
        if (ctl) ctl.stop();
        resolve(text.trim() || null);
      });
      ctl = listen({
        onText: (t) => { text = t; live.textContent = t || 'Listening…'; },
        onDone: (t) => { if (t) text = t; api.close(); },
        onError: (msg) => { text = ''; D.util.toast(msg); api.close(); },
      });
    });
  }

  D.voice = { supported, field, capture, listen, lang };
})(window.Daybook);
