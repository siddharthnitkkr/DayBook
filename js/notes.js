/* notes.js — handwritten notes: a list beside a writing area on clear glass with faint ruled lines.
   A note is a row of blocks: text blocks (plain text only) and picture blocks (small framed thumbnails that open larger).
   Pictures are shrunk and kept in IndexedDB. Everything autosaves while you type. */
(function (D) {
  'use strict';

  const { h, icon } = D.util;
  const when = (iso) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const textOf = (n) => n.blocks.filter((b) => b.k === 't').map((b) => b.v).join('\n');
  const imagesOf = (n) => n.blocks.filter((b) => b.k === 'i').map((b) => b.v);

  function render(root) {
    const st = () => D.store.state;
    let openId = null;
    let query = '';
    let blocks = [];          // the working copy of the open note's blocks
    let active = null;        // the text area that last had the cursor
    let dictation = null;

    const find = (id) => st().notes.find((n) => n.id === id);

    /* ---------- saving ---------- */
    const saved = h('span', { class: 'notes__saved', role: 'status' }, '');
    const flushSave = () => {
      const n = openId && find(openId);
      if (!n) return;
      const title = titleIn.value.trim().slice(0, 100);
      const tags = [...new Set(tagsIn.value.split(/[,#\n]/).map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
      D.store.commit((s) => {
        const t = s.notes.find((x) => x.id === openId);
        if (!t) return;
        t.title = title; t.tags = tags;
        t.blocks = blocks.length ? blocks.map((b) => ({ ...b })) : [{ k: 't', v: '' }];
        t.updatedAt = new Date().toISOString();
      }, 'ui');
      saved.textContent = 'Saved';
      drawList();
    };
    const autosave = D.util.debounce(flushSave, 600);
    const touch = () => { saved.textContent = 'Writing…'; autosave(); };

    /* ---------- the list ---------- */
    const search = h('input', { class: 'input input--hand', type: 'search', id: 'note-search', placeholder: 'Search notes', autocomplete: 'off', 'aria-label': 'Search notes' });
    search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); drawList(); });
    const list = h('ul', { class: 'nlist' });

    function drawList() {
      D.util.clear(list);
      const items = st().notes
        .filter((n) => !query || `${n.title} ${n.tags.join(' ')} ${textOf(n)}`.toLowerCase().includes(query))
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
      if (!items.length) {
        list.append(h('li', { class: 'empty' },
          h('p', { class: 'empty__title' }, D.util.ink(st().notes.length ? 'Nothing matches that.' : 'No notes yet. Start one.', 'notes-empty')),
          h('p', null, st().notes.length ? 'Try another word.' : 'Tap New note and write, paste, or speak.')));
        return;
      }
      items.forEach((n) => list.append(h('li', { class: `nitem${n.id === openId ? ' is-on' : ''}${n.pinned ? ' is-pinned' : ''}` },
        h('button', { type: 'button', class: 'nitem__btn', onclick: () => open(n.id) },
          h('span', { class: 'nitem__title hand' }, D.util.ink(n.title || textOf(n).slice(0, 40) || 'Untitled', n.id)),
          h('span', { class: 'nitem__meta' },
            n.pinned ? icon('pin-angle-fill') : null,
            imagesOf(n).length ? icon('image') : null,
            new Date(n.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
            n.tags.length ? ` · ${n.tags.slice(0, 2).join(', ')}` : '')))));
    }

    /* ---------- the writing area ---------- */
    const titleIn = h('input', { class: 'input input--hand note-title', id: 'note-title', type: 'text', maxlength: 100, placeholder: 'Title', autocomplete: 'off', 'aria-label': 'Note title' });
    const tagsIn = h('input', { class: 'input input--hand', id: 'note-tags', type: 'text', maxlength: 120, placeholder: 'Tags, separated by commas', autocomplete: 'off', 'aria-label': 'Tags' });
    titleIn.addEventListener('input', touch);
    tagsIn.addEventListener('input', touch);
    const dateLine = h('span', { class: 'notes__date' });
    const body = h('div', { class: 'notebody' });
    const fileIn = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'visually-hidden', id: 'note-files', 'aria-label': 'Choose pictures' });
    fileIn.addEventListener('change', async () => { await addImages([...fileIn.files], active); fileIn.value = ''; });

    const micBtn = D.voice.supported ? h('button', { type: 'button', class: 'icon-btn nbar__mic', 'aria-pressed': 'false', 'aria-label': 'Dictate into the note', title: 'Dictate', onclick: dictate }, icon('mic-fill')) : null;
    const pinBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-pressed': 'false', 'aria-label': 'Pin this note', title: 'Pin', onclick: () => { const n = find(openId); if (!n) return; D.store.commit((s) => { const t = s.notes.find((x) => x.id === openId); t.pinned = !t.pinned; t.updatedAt = new Date().toISOString(); }, 'ui'); paintBar(); drawList(); } }, icon('pin-angle'));
    const bar = h('div', { class: 'nbar' },
      h('button', { type: 'button', class: 'btn-ink btn-ink--ghost btn-ink--small nbar__back', onclick: () => { flushSave(); autosave.cancel(); openId = null; paint(); } }, icon('chevron-left'), 'Notes'),
      h('span', { class: 'nbar__fill' }), saved, pinBtn, micBtn,
      h('label', { class: 'icon-btn', for: 'note-files', title: 'Add a picture', 'aria-label': 'Add a picture' }, icon('image')),
      h('button', { type: 'button', class: 'icon-btn icon-btn--danger', 'aria-label': 'Delete this note', title: 'Delete', onclick: removeNote }, icon('trash3')));

    function paintBar() {
      const n = find(openId);
      const on = !!n && n.pinned;
      pinBtn.setAttribute('aria-pressed', String(on));
      pinBtn.classList.toggle('is-on', on);
      pinBtn.firstChild.className = `bi bi-pin-angle${on ? '-fill' : ''}`;
      pinBtn.setAttribute('aria-label', on ? 'Unpin this note' : 'Pin this note');
    }

    function growTo(ta) { ta.style.height = 'auto'; ta.style.height = `${Math.max(ta.scrollHeight, 0)}px`; }

    function drawBody(focusIndex, caret) {
      D.util.clear(body);
      active = null;
      blocks.forEach((b, i) => {
        if (b.k === 'i') {
          const img = h('img', { class: 'nimg__img', alt: 'Picture in your note', loading: 'lazy' });
          D.photos.show(img, b.v);
          body.append(h('figure', { class: 'nimg' },
            h('button', { type: 'button', class: 'nimg__open', 'aria-label': 'Open this picture larger', onclick: () => lightbox(b.v) }, img),
            h('button', { type: 'button', class: 'nimg__x', 'aria-label': 'Remove this picture', title: 'Remove picture', onclick: () => removeImage(i) }, icon('x-lg'))));
          return;
        }
        const ta = h('textarea', { class: 'nta', rows: 2, spellcheck: 'true', maxlength: 20000, 'aria-label': i === 0 ? 'Write your note' : 'Continue your note', placeholder: i === 0 && blocks.length === 1 ? 'Write here…' : '' });
        ta.value = b.v;
        ta.dataset.i = String(i);
        ta.addEventListener('input', () => { b.v = ta.value; growTo(ta); touch(); });
        ta.addEventListener('focus', () => { active = ta; });
        ta.addEventListener('paste', (e) => onPaste(e, ta, i));
        body.append(ta);
        requestAnimationFrame(() => growTo(ta));
        if (i === focusIndex) { ta.focus(); if (caret != null) ta.setSelectionRange(caret, caret); active = ta; }
      });
      if (!active) active = body.querySelector('textarea');
    }

    /* paste: text arrives as plain text only (no foreign formatting); pictures and screenshots become picture blocks */
    async function onPaste(e, ta, index) {
      const cd = e.clipboardData;
      if (!cd) return;
      const pics = [...(cd.files || [])].filter((f) => f.type.startsWith('image/'));
      if (pics.length) { e.preventDefault(); await addImages(pics, ta, index); return; }
      const text = cd.getData('text/plain');
      if (text != null && text !== '') {
        e.preventDefault();
        const clean = text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/ /g, ' ');
        ta.setRangeText(clean, ta.selectionStart, ta.selectionEnd, 'end');
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    /* put pictures into the note at the cursor: the text block splits around them */
    async function addImages(files, ta, index) {
      const pics = files.filter((f) => f && /^image\//.test(f.type));
      if (!pics.length || !openId) { if (files.length && !pics.length) D.util.toast('Only pictures can be added here.', 'error'); return; }
      let at = index;
      if (at == null && ta && ta.dataset.i != null) at = Number(ta.dataset.i);
      if (at == null || !blocks[at] || blocks[at].k !== 't') { at = blocks.length - 1; while (at > 0 && blocks[at].k !== 't') at -= 1; }
      const pos = ta && ta.dataset.i != null && Number(ta.dataset.i) === at ? ta.selectionStart : (blocks[at].v || '').length;
      const keys = [];
      for (const f of pics.slice(0, 8)) {
        try { keys.push(await D.photos.put(await D.photos.shrink(f))); } catch (err) { D.util.toast(err.message, 'error'); }
      }
      if (!keys.length) return;
      const cur = blocks[at];
      const text = cur.v || '';
      const before = text.slice(0, pos);
      const after = text.slice(pos);
      blocks.splice(at, 1, { k: 't', v: before }, ...keys.map((v) => ({ k: 'i', v })), { k: 't', v: after });
      drawBody(at + keys.length + 1, 0);
      touch();
    }

    function removeImage(i) {
      const key = blocks[i].v;
      blocks.splice(i, 1);
      for (let j = Math.min(i, blocks.length - 1); j > 0; j--) {      // join the text blocks that now touch
        if (blocks[j] && blocks[j - 1] && blocks[j].k === 't' && blocks[j - 1].k === 't') { blocks[j - 1].v = `${blocks[j - 1].v}${blocks[j - 1].v && blocks[j].v ? '\n' : ''}${blocks[j].v}`; blocks.splice(j, 1); break; }
      }
      if (!blocks.length) blocks.push({ k: 't', v: '' });
      D.photos.remove(key);
      drawBody(0);
      touch();
    }

    function lightbox(key) {
      const img = h('img', { class: 'lightbox__img', alt: 'Your picture, larger' });
      D.photos.show(img, key);
      D.util.modal({ title: 'Picture', className: 'dlg--wide', body: img, actions: [{ label: 'Close', kind: 'primary' }] });
    }

    /* dictate: speech goes to the end of the text block you were writing in */
    function dictate() {
      if (!micBtn) return;
      if (dictation) { dictation.stop(); return; }
      const ta = active || body.querySelector('textarea');
      if (!ta) return;
      const base = ta.value;
      const gap = base && !/\s$/.test(base) ? ' ' : '';
      micBtn.classList.add('is-listening'); micBtn.setAttribute('aria-pressed', 'true');
      dictation = D.voice.listen({
        onText: (t) => { ta.value = base + gap + t; ta.dispatchEvent(new Event('input', { bubbles: true })); },
        onDone: () => { dictation = null; micBtn.classList.remove('is-listening'); micBtn.setAttribute('aria-pressed', 'false'); },
        onError: (msg) => { dictation = null; micBtn.classList.remove('is-listening'); micBtn.setAttribute('aria-pressed', 'false'); D.util.toast(msg); },
      });
    }

    async function removeNote() {
      const n = find(openId);
      if (!n) return;
      const ok = await D.util.confirm({ title: 'Delete this note?', text: `"${n.title || 'Untitled'}" and its pictures will be removed.`, confirmLabel: 'Delete', danger: true });
      if (!ok) return;
      autosave.cancel();
      imagesOf(n).forEach((k) => D.photos.remove(k));
      D.store.commit((s) => { s.notes = s.notes.filter((x) => x.id !== n.id); });
      openId = null; paint(); D.util.toast('Note deleted.');
    }

    /* ---------- opening and creating ---------- */
    const editor = h('section', { class: 'nedit glass-soft', 'aria-label': 'Writing area' },
      bar,
      h('div', { class: 'nedit__fields' }, titleIn, tagsIn, dateLine),
      body, fileIn);
    const placeholder = h('div', { class: 'nplace empty' },
      h('p', { class: 'empty__title' }, D.util.ink('Pick a note, or start a new one.', 'notes-pick')),
      h('p', null, 'Write in the ruled area, paste text or screenshots, drop pictures in, or tap the microphone.'));

    function open(id) {
      if (openId && openId !== id) { autosave.cancel(); flushSave(); }
      openId = id;
      const n = find(id);
      if (!n) { openId = null; paint(); return; }
      blocks = n.blocks.map((b) => ({ ...b }));
      titleIn.value = n.title; tagsIn.value = n.tags.join(', ');
      dateLine.textContent = `Written ${when(n.createdAt)} · updated ${when(n.updatedAt)}`;
      saved.textContent = '';
      drawBody(blocks.length - 1, null);
      paint();
    }

    function create() {
      if (openId) { autosave.cancel(); flushSave(); }
      const n = { id: D.util.uid(), title: '', blocks: [{ k: 't', v: '' }], tags: [], pinned: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      D.store.commit((s) => { s.notes.unshift(n); }, 'ui');
      open(n.id);
      titleIn.focus();
    }

    const wrap = h('div', { class: 'notes', dataset: { mode: 'list' } });
    function paint() {
      const n = openId && find(openId);
      wrap.dataset.mode = n ? 'edit' : 'list';
      editor.hidden = !n;
      placeholder.hidden = !!n;
      paintBar();
      drawList();
      if (n) dateLine.textContent = `Written ${when(n.createdAt)} · updated ${when(n.updatedAt)}`;
    }

    wrap.append(
      h('aside', { class: 'notes__side' },
        h('div', { class: 'notes__tools' }, D.voice.field(search),
          h('button', { type: 'button', class: 'btn-ink btn-ink--primary btn-ink--small', onclick: create }, icon('plus-lg'), 'New note')),
        list),
      h('div', { class: 'notes__main' }, placeholder, editor));

    /* drag pictures onto the writing area */
    ['dragover', 'dragenter'].forEach((ev) => editor.addEventListener(ev, (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); editor.classList.add('is-drop'); } }));
    ['dragleave', 'drop'].forEach((ev) => editor.addEventListener(ev, () => editor.classList.remove('is-drop')));
    editor.addEventListener('drop', (e) => { if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); addImages([...e.dataTransfer.files], active); } });

    root.append(D.pageHead('Notes', 'Notes'), wrap);
    paint();
    window.addEventListener('pagehide', flushSave);

    return () => { autosave.cancel(); flushSave(); if (dictation) dictation.stop(); window.removeEventListener('pagehide', flushSave); };
  }

  D.pages.notes = { render };
})(window.Daybook);
