/* dragon-config.js — the one place that names the clips, captions, framing, behaviour and power levels.
   Drop new files into assets/dragon-video/ and edit this list. Nothing else needs to change. */
window.Daybook = window.Daybook || {};

(function (D) {
  'use strict';

  D.dragonConfig = {
    basePath: 'assets/dragon-video/',

    /* Framing. Each clip fills the screen (cover) and is zoomed in a touch to push generation flaws at the edges
       out of view. target = where the dragon should land on screen, anchor = where it sits inside the clip
       (both as fractions: x, y). Tune per clip with `zoom` and `anchor`. */
    world: {
      zoom: 1.04,
      anchor: [0.64, 0.6],
      target: {
        wide: [0.72, 0.58],        // laptops, desktops, landscape tablets
        portrait: [0.68, 0.5],     // portrait tablets
        phone: [0.5, 0.62],
      },
      stage: { wide: 1, portrait: 0.44, phone: 0.52 },   // share of the screen height the video fills (the rest is forest ground). On phones the sheet's peek and half stops are clear glass, so the dragon's lower body shows through it
      slackLeft: 0.12,             // the video may slide this far right, because the glass covers that strip
    },

    /* Idle and guest clips (assets/dragon-video/idle and /guests) are laid out like this. Their framing is unknown, so it is plain cover. */
    idleFraming: { zoom: 1.04, anchor: [0.6, 0.58] },

    /* file: name inside basePath. Clips never loop: each plays once and freezes on its last frame. */
    clips: {
      // stand: anchor is the dragon in its last frame, stillAnchor the early frame held for the tired look;
      // cropLeft hides the garbled text the generator left at this clip's left edge
      stand:  { file: 'dragon-stand.mp4',  caption: 'Resting in the clearing', fallback: ['walk', 'gather'], anchor: [0.66, 0.6], stillAnchor: [0.74, 0.6], cropLeft: 0.2 },
      gather: { file: 'dragon-gather.mp4', caption: 'Gathering strength',      fallback: ['stand', 'walk'], anchor: [0.66, 0.62] },
      walk:   { file: 'dragon-walk.mp4',   caption: 'Walking the woodland',    fallback: ['stand', 'gather'], zoom: 1.0, anchor: [0.7, 0.5] },   // a tight close-up: head and neck at the right of its frame
      launch: { file: 'dragon-launch.mp4', caption: 'Taking to the sky',       fallback: ['stand'] },
      /* optional: add the files later and they are picked up automatically */
      weak:   { file: 'dragon-weak.mp4',   caption: 'Worn out',                fallback: ['stand'], optional: true },
      fire:   { file: 'dragon-fire.mp4',   caption: 'Breathing fire',          fallback: [],        optional: true },
    },

    /* The dragon is one continuous creature. Each clip plays once, from the previous clip's last frame, and freezes on its
       own last frame, which is the new pose. Stages by progress: 0 weak (or the standing frame, still), 1 gather (1-33%),
       2 walk (34-66%), 3 stand (67-99%), 4 launch (100%). Only a short crossfade joins consecutive clips. */
    stillAt: 0.2,                  // with no weak clip, stage 0 holds dragon-stand.mp4 at this second, in full colour, perfectly still
    crossfadeMs: 400,

    /* completion % → captions and the colour of light the dragon casts on the glass. The video itself is never filtered. */
    states: {
      idle: { caption: 'Plant a goal and I will wake up' },
      weak: { caption: "I'm fading... help me" },
      low:  { caption: 'Gathering strength, one goal at a time' },
      mid:  { caption: 'Walking steady, the warmth is back' },
      high: { caption: 'Nearly there. I can feel the sky' },
      full: { caption: 'Every goal lit. Look at me fly' },
    },

    /* The colour of light the dragon casts on the glass: r, g, b */
    light: {
      idle: [150, 178, 170], weak: [140, 170, 176], low: [160, 205, 178],
      mid: [190, 226, 168], high: [238, 224, 150], full: [255, 214, 140],
    },

    tickMessages: [
      'Warmth returns. Thank you.',
      'Another ember lit.',
      'I feel stronger already.',
      'Yes. Keep going, I am with you.',
      'That one counted. I felt it.',
    ],
    untickMessages: ['Oh. The ember dimmed. It is alright.', 'Changed your mind? I will wait.'],
    victoryMessages: [
      'All of them. Every single one. Watch me go!',
      'Today is yours. Hold the light, I am flying!',
    ],

    /* long-term power: points = goals ticked in total + 5 × your best running streak */
    levels: [
      { name: 'Hatchling', min: 0 },
      { name: 'Fighter',   min: 30 },
      { name: 'Warlord',   min: 120 },
      { name: 'Ancient',   min: 365 },
    ],
  };
})(window.Daybook);
