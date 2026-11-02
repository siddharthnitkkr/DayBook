/* idle-library.js — which idle and guest clips exist.
   A web page cannot list a folder by itself, least of all when opened from disk, so the names come from
   assets/dragon-video/idle-manifest.js (a plain script, which is what works from file://).
   Settings can rewrite that file in one step ("Scan folders", Chrome and Edge), or give you the text to paste. */
(function (D) {
  'use strict';

  const BASE = `${D.dragonConfig.basePath}`;
  const KINDS = ['idle', 'guests'];
  /* Only plain file names ending in .mp4: no folders, no "..", nothing that could point elsewhere. */
  const NAME_OK = /^[\w][\w .()+&'-]{0,120}\.mp4$/i;

  const lists = { idle: [], guests: [] };

  const clean = (arr) => [...new Set((Array.isArray(arr) ? arr : []).filter((n) => typeof n === 'string' && NAME_OK.test(n)))].slice(0, 200);

  function set(next) {
    KINDS.forEach((k) => { lists[k] = clean(next && next[k]); });
    D.store.emit('idle-lists');
  }

  const manifestText = () => `/* Written by Daybook (Settings > Idle life). One file name per clip, as it appears in the folder. */\n`
    + `window.Daybook = window.Daybook || {};\nwindow.Daybook.idleManifest = ${JSON.stringify({ idle: lists.idle, guests: lists.guests }, null, 2)};\n`;

  /* One-step update: pick assets/dragon-video once; Daybook reads idle/ and guests/ and rewrites the manifest there. */
  async function scan() {
    if (!('showDirectoryPicker' in window)) throw new Error('This browser cannot read folders. Use "Edit the list by hand" and download the manifest instead.');
    let root;
    try {
      root = await window.showDirectoryPicker({ id: 'daybook-dragon-video', mode: 'readwrite' });
    } catch (err) {
      if (err && err.name === 'AbortError') return null;
      throw err;
    }
    const found = {};
    for (const kind of KINDS) {
      let dir;
      try { dir = await root.getDirectoryHandle(kind); } catch (e) {
        throw new Error(`That folder has no "${kind}" folder inside it. Pick the dragon-video folder.`);
      }
      const names = [];
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind === 'file' && NAME_OK.test(name)) names.push(name);
      }
      found[kind] = names.sort((a, b) => a.localeCompare(b));
    }
    set(found);
    const out = await (await root.getFileHandle('idle-manifest.js', { create: true })).createWritable();
    await out.write(manifestText());
    await out.close();
    return { idle: lists.idle.length, guests: lists.guests.length };
  }

  D.idleLib = {
    lists,
    set,
    scan,
    manifestText,
    canScan: 'showDirectoryPicker' in window,
    urlFor: (kind, name) => `${BASE}${kind}/${encodeURIComponent(name)}`,
    NAME_OK,
  };

  set(D.idleManifest || {});   // the manifest script runs before this file
})(window.Daybook);
