/* fireflies.js — a handful of drifting lights on one canvas.
   Kept cheap on purpose: one pre-drawn glow sprite, ~12 flies on phones, ~26 on desktop,
   capped pixel ratio, 30fps on small screens, and nothing runs while the tab is hidden. */
(function (D) {
  'use strict';

  const canvas = document.getElementById('fireflies');
  const ctx = canvas.getContext('2d');
  const sprite = document.createElement('canvas');
  let flies = [];
  let w = 0;
  let h = 0;
  let dpr = 1;
  let raf = 0;
  let last = 0;
  let enabled = false;
  let small = false;

  function makeSprite() {
    sprite.width = sprite.height = 64;
    const g = sprite.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(250, 255, 225, 1)');
    grad.addColorStop(0.18, 'rgba(222, 255, 170, 0.85)');
    grad.addColorStop(0.5, 'rgba(190, 240, 150, 0.22)');
    grad.addColorStop(1, 'rgba(190, 240, 150, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }

  function resize() {
    small = window.innerWidth < 700;
    dpr = Math.min(window.devicePixelRatio || 1, small ? 1 : 1.5);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const count = small ? 12 : 26;
    if (flies.length !== count) {
      flies = Array.from({ length: count }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        s: 10 + Math.random() * 16,                 // glow size in css px
        vx: (Math.random() - 0.5) * 7, vy: -2 - Math.random() * 6,
        ph: Math.random() * 6.28, tw: 0.5 + Math.random() * 1.1, sw: Math.random() * 6.28,
      }));
    }
  }

  function frame(t) {
    raf = requestAnimationFrame(frame);
    if (small && t - last < 33) return;
    const dt = Math.min((t - last) / 1000, 0.1);
    last = t;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const f of flies) {
      f.x += (f.vx + Math.sin(t / 2200 + f.sw) * 5) * dt;
      f.y += f.vy * dt;
      if (f.y < -30) { f.y = h + 20; f.x = Math.random() * w; }
      if (f.x < -30) f.x = w + 20; else if (f.x > w + 30) f.x = -20;
      const twinkle = 0.5 + 0.5 * Math.sin(f.ph + t / 1000 * f.tw);
      ctx.globalAlpha = 0.12 + 0.78 * twinkle * twinkle;
      const size = f.s * dpr;
      ctx.drawImage(sprite, f.x * dpr - size / 2, f.y * dpr - size / 2, size, size);
    }
  }

  function run() {
    const should = enabled && !document.hidden;
    if (should && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    if (!should && raf) { cancelAnimationFrame(raf); raf = 0; }
    if (!enabled) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  D.fireflies = {
    init(on) {
      makeSprite();
      resize();
      window.addEventListener('resize', D.util.debounce(resize, 200));
      document.addEventListener('visibilitychange', run);
      this.setEnabled(on);
    },
    setEnabled(on) { enabled = on; run(); },
  };
})(window.Daybook);
