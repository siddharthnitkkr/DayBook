/* photos.js — photo attachments. Pictures are shrunk, then kept in IndexedDB (the "blobs" store), never in localStorage.
   Entries only remember a short key like ph_k3j9x. Backups embed the pictures as data URLs so one file holds everything. */
(function (D) {
  'use strict';

  const MAX_SIDE = 1024;
  const MAX_INPUT = 25 * 1024 * 1024;
  const KEY_RE = /^ph_[a-z0-9]{4,24}$/;
  const URL_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
  const cache = new Map();   // key -> object URL

  const newKey = () => `ph_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

  /* Any common image file -> a JPEG no larger than 1024 px on its longest side. */
  async function shrink(file) {
    if (!file || !/^image\//.test(file.type)) throw new Error('Please choose a picture file.');
    if (file.size > MAX_INPUT) throw new Error('That picture is too large. Try one under 25 MB.');
    let bmp;
    try { bmp = await createImageBitmap(file); } catch (e) { throw new Error('This browser could not read that picture.'); }
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) bmp.close();
    return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not shrink that picture.'))), 'image/jpeg', 0.8));
  }

  async function put(blob, key = newKey()) {
    await D.idb.put('blobs', key, blob);
    return key;
  }

  /* An object URL for showing the picture, cached so lists stay quick. Empty string if the picture is missing. */
  async function url(key) {
    if (!key || !KEY_RE.test(key)) return '';
    if (cache.has(key)) return cache.get(key);
    let blob = null;
    try { blob = await D.idb.get('blobs', key); } catch (e) { return ''; }
    if (!blob) return '';
    const u = URL.createObjectURL(blob);
    cache.set(key, u);
    return u;
  }

  async function remove(key) {
    if (!key || !KEY_RE.test(key)) return;
    try { await D.idb.del('blobs', key); } catch (e) { /* already gone */ }
    const u = cache.get(key);
    if (u) { URL.revokeObjectURL(u); cache.delete(key); }
  }

  async function toDataURL(key) {
    let blob = null;
    try { blob = await D.idb.get('blobs', key); } catch (e) { return ''; }
    if (!blob) return '';
    return new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => resolve('');
      r.readAsDataURL(blob);
    });
  }

  /* From a backup file. Only a plain jpeg/png/webp data URL under 8 MB is accepted. */
  async function fromDataURL(key, dataUrl) {
    if (!KEY_RE.test(key) || typeof dataUrl !== 'string' || dataUrl.length > 8 * 1024 * 1024 || !URL_RE.test(dataUrl)) return false;
    const [head, b64] = dataUrl.split(',');
    const type = head.slice(5, head.indexOf(';'));
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    await put(new Blob([bytes], { type }), key);
    const old = cache.get(key);
    if (old) { URL.revokeObjectURL(old); cache.delete(key); }
    return true;
  }

  async function clearAll() {
    try { await D.idb.clear('blobs'); } catch (e) { /* nothing stored */ }
    cache.forEach((u) => URL.revokeObjectURL(u));
    cache.clear();
  }

  /* Puts a picture (or a still-empty slot) into an element: img.src once it is loaded. */
  function show(img, key) {
    img.removeAttribute('src');
    url(key).then((u) => { if (u && img.isConnected !== false) img.src = u; });
  }

  D.photos = { shrink, put, url, remove, toDataURL, fromDataURL, clearAll, show, KEY_RE };
})(window.Daybook);
