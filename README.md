# Daybook

A personal life dashboard and diary set inside a living forest. A white dragon rests on the right of the screen and responds to the goals you tick on the frosted-glass diary on the left.
Plain HTML, CSS and vanilla JavaScript. No Node, no npm, no build step.

**Status: all five phases** (app shell, Today, Habits, data store, dragon world, Likes, Bucket list and map, voice input, and now **Notes**, **Alerts**, **Insights** and **My Prompt**, plus a sturdier map address search).

## Open it

Double-click `index.html`. Everything uses relative paths and works straight from disk.

You need an internet connection the first time for the fonts and icons (Google Fonts, Bootstrap, Bootstrap Icons through CDN links). The app and your data never leave your computer.

> Why no ES modules? Browsers refuse to load `<script type="module">` from `file://`. Daybook uses ordinary scripts that share one `Daybook` namespace, one file per feature, so double-clicking works everywhere.

## The look

- **World:** the forest video fills the whole screen behind everything. The dragon is on the right, about two thirds of the screen high, with the whole body and wings in view. A soft shade on the left and a vignette at the edges keep text readable.
- **Golden edge:** every border (diary, rail, rows, inputs, buttons, ring, sound toggle, dialogs) is the same thin warm amber-gold, `--gold-edge` in `css/tokens.css`, taken from the dragon's wing membranes. Hover and active states brighten that same gold. There is no other border colour.
- **Clear glass:** the glass tint is about 11 percent with a light blur, a thin bright inner edge and a soft specular sheen across the top of each panel, so the dragon and forest show through. Text stays readable through a subtle shadow rather than heavier panels. **Settings, Glass clarity** is a slider (frosted to crystal); it drives the tint, blur and the backing under rows and dialogs from one variable, `--clarity`.
- **Phones (under 600 px):** the dragon scene is a fixed 52 percent of the *small* viewport height (100svh), so it never pops or resizes when the browser toolbar shows or hides, and the sheet uses svh stops too. A blurred copy of the forest floor sits behind the clear sheet so it never floats over a flat dark patch. Only the sheet's content scrolls; the page itself never moves. Body text is 13 px, handwriting about 15.5 px, titles 20 px, labels about 10.5 px, with tighter rows and corners, two-column tabs, a slim floating tab bar, and invisible padding that keeps every control at least 40 px tall to tap.
- **Glass diary:** frosted, translucent panels with a faint warm glow and a soft inner glow. The dragon's light tints the glass (warm gold when it is strong, cool and grey when it is tired), and the glass takes on the forest's colour. The diary is about 40% of the width on a laptop. A spiral binding in glass and metal runs along its left edge.
- **Type:** one handwriting font, Nanum Pen Script, for page titles, goals and notes (white pen ink with a dark edge so it stays crisp on the glass), and clean Manrope for tiny labels and buttons. Pen-written entries get a gentle human variation: a tilt within one degree, a hair of baseline shift and uneven word spacing, fixed per entry so nothing jitters when the page redraws. The scale is fluid and compact so Today fits on a laptop screen without scrolling.
- **Phones:** the dragon fills the top of the screen, the diary is a glass sheet you drag up from the bottom (peek, half, full). Peek shows how many goals are lit and the next goal, with a one-tap tick. A floating glass tab bar sits at the bottom with safe-area padding for the notch and home indicator.
- **Tablets:** the desktop layout with a slightly wider panel.

## The dragon is one continuous creature

The forest and the dragon always show in their own natural colour and brightness: no grey, dim or faded filter in any state, and no dark overlay, only a very light gradient behind the diary for small text.

- **Poses, not loops.** Clips never loop and never snap back. Each clip plays once and freezes on its own last frame, which is the dragon's new pose. The next stage plays the next clip from that pose, with a 400 ms crossfade between the two clips and nowhere else.
- **Stages by progress:** 0% tired (the weak clip if it exists, otherwise the standing frame held still in full colour), 1 to 33% gather, 34 to 66% walk, 67 to 99% stand, 100% launch with a soft golden glow that stays after the last frame. A stage plays when you first reach it; further ticks in the same stage do not replay it.
- **Breathing.** The held pose has a tiny, slow scale pulse, so it never looks like a paused video.
- **Unticking** leaves the pose exactly as it is. The dragon steps back to the pose that matches your progress only after the next page load or a new day.
- **A new day or a missed day** starts tired again.
- **100%:** the launch clip plays once, a golden bloom washes over every glass edge and the ring, and a short victory message appears. The dragon stays in its final pose until the next day. Settings has a "Test the 100% celebration" button.
- All clips are preloaded, and the video pauses when the tab is hidden.
- The standing clip's left edge has garbled text from the generator; `cropLeft` in the config hides it.

Tune everything in `js/dragon-config.js`: clip names, framing and crop (`world`, per-clip `zoom`, `anchor`, `cropLeft`), the still frame for the tired look (`stillAt`), the crossfade, captions and power levels. In Settings, "Dragon workshop" lets you try every stage, play any clip once, and return to today's pose. The note about a missing weak clip lives there too, never as a banner.

### Idle life and guests

While Daybook is open, the dragon plays **one random clip** from `assets/dragon-video/idle/` at a random moment between 1 and 5 minutes (change the range in Settings, Idle life). It plays once over the held pose with the same 400 ms crossfades in and out, then the dragon simply carries on in its pose. Ticking a goal plays the stage clip as usual and then restarts the idle timer.

- **Guests:** drop clips of other animals or dragons into `assets/dragon-video/guests/`. About one random event in five plays a guest instead (switch this off in Settings).
- **Never two clips at once**, and idle events are skipped (and rescheduled) while the tab is hidden, a stage clip is playing, or you are typing in a note.
- **How new files are found:** a web page cannot list a folder by itself, least of all when opened from disk. The names are read from `assets/dragon-video/idle-manifest.js`. To update it in one step: Settings, Idle life, **Scan folders** (Chrome or Edge), pick the `dragon-video` folder once, and Daybook reads `idle/` and `guests/` and rewrites that file for you. In any other browser use "Edit the list by hand", Apply, then **Download manifest** and save it over `idle-manifest.js`.
- The manifest is a small script rather than a `.json` file because browsers refuse to read a JSON file from `file://`, while a script works everywhere. Names must be plain file names ending in `.mp4`.

### The goal ring

The round widget at the top right shows one glowing segment per goal and the count in the middle ("2 of 5"). Each completed goal fills its segment smoothly with a small glow pulse. Tap it for a glass popover with the level name, power and a word from the dragon.

### Sound

The sound button (top right) is off by default. Clips carry their own audio: when on, you hear the clip that is playing. A volume slider appears next to the button. Your choice is remembered. Browsers block sound until you tap, so the button itself starts it, and if sound was left on, the first tap anywhere unlocks it. On iPhone the first tap also briefly warms up every clip silently, because iOS only allows sound on videos that have been played inside a tap.

Videos are inline and muted by default, which is what iOS Safari requires for autoplay.

### Clips

Clips live in `assets/dragon-video/` and are named in `js/dragon-config.js`:

| Name | File | Used for |
| --- | --- | --- |
| gather | `dragon-gather.mp4` | stage 1 (1 to 33%) |
| walk | `dragon-walk.mp4` | stage 2 (34 to 66%) |
| stand | `dragon-stand.mp4` | stage 3 (67 to 99%), and the still tired frame when there is no weak clip |
| launch | `dragon-launch.mp4` | stage 4 (100%) |
| weak (optional) | `dragon-weak.mp4` | the tired pose at 0% |
| fire (optional) | `dragon-fire.mp4` | only used from the Dragon workshop |

A missing file falls back to the closest clip, and a small note says so.

## Folder map

```
index.html            page shell, loads everything in order
css/
  tokens.css          colours, fluid type scale, spacing, panel width
  base.css  layout.css  components.css
  glass.css           the glass language and the spiral binding
  paper.css           everything handwritten: goal names, pen variation, pen tick, note field, stamps
  dragon.css          world, pose breathing, goal ring, sound, speech
  pages.css  places.css  effects.css
  notes.css           Notes, Alerts, Insights, My Prompt and the map-search extras
js/
  util.js             DOM builder, dates, dialogs, toasts
  dragon-config.js    clips, behaviour, framing, levels  <- edit this
  store.js            ALL reading, writing, migrations, file save/load
  progress.js         streaks, completion %, dragon power
  router.js           pages, side rail, phone tab bar
  dragon.js           the creature: poses, one-shot clips, idle life, ring, sound
  idle-library.js     which idle and guest clips exist (reads the manifest, Scan folders)
  fireflies.js        background lights
  voice.js            speech-to-text microphones and quick capture
  photos.js           photo attachments (IndexedDB)
  maplink.js          map link reader, polite place search with retries, Leaflet loader
  likes.js bucket.js  the Likes and Bucket list pages
  notes.js            Notes: list, ruled writing area, pictures, dictation
  alerts.js           the reminder engine and goal nudges (checks, chime, notifications)
  reminders.js        the Alerts page
  insights.js         monthly and weekly insights, charts, badges
  prompt.js           My Prompt: builds AI prompts from your own data
  today.js habits.js settings.js   one file per page
  intro.js            diary cover (once a day, skippable)
  main.js             start-up, backup reminder, phone sheet
assets/dragon-video/  your MP4 clips
  idle/               random idle clips (drop MP4 files here)
  guests/             clips of other creatures
  idle-manifest.js    the list of file names in idle/ and guests/
```

## Voice input

Every text field and text area on Likes and Bucket list has a small microphone inside it. Tap it to speak (a glowing gold pulse shows it is listening), tap again to stop, or let it stop after a few seconds of silence. The words land in the field in the handwriting font and you can edit them before saving. It uses your browser's built-in Web Speech API (Chrome and Edge; the browser sends the audio to its own speech service, Daybook itself sends nothing). If the browser has no speech recognition the microphones are hidden, and if permission is denied you get a short note. Typing always works. Settings, About you, has a **voice language** choice: English (default) or Hindi.

Each page also has **Quick capture by voice**: say a sentence such as "I loved the butter chicken at the Indian place, five stars" and a draft entry is filled in (name, like or dislike, stars, category, where), which you check and confirm before it is saved.

## Likes and dislikes

Seven categories as golden tabs: Food, Drinks, Places, Movies and Shows, Activities, Shopping, Other. Quick add is one line at the top (type or speak, press Enter). Open an entry for the full details: like or dislike, star rating, tags, notes, a photo, where and when. Filter by likes or dislikes, search, sort by rating, newest or name.

- **What should I eat today?** picks from your liked food, skipping dislikes (by name, and food sharing a tag with your disliked food unless nothing else is left) and anything picked in the last four days, favouring higher ratings. It shows a glowing card with **Pick again**.
- **You liked it, so try…** uses shared tags and words from your own entries (including unvisited places already on your bucket list) plus a small built-in list of related ideas such as similar cuisines. No online service.

## Bucket list and places

Places and experiences with category (Restaurant, Mall, Park, Trip, Event, Other), priority, notes, status (Want to go, Planned, Visited) and an optional target date.

- **Paste a map link** or type a place name in the field at the top. Google Maps links (the at-sign pattern, the exact pin in `!3d…!4d…`, `q`, `query`, `ll`), Apple Maps links (`ll`, `coordinate`, `q`, `name`, `address`) and OpenStreetMap links are read for the name, address and coordinates. You get a tidy card with a map preview and an **Open in Maps** button for the original link.
- **Shortened share links** (maps.app.goo.gl and similar) hide the place, so Daybook says so and offers a name search through the free OpenStreetMap **Nominatim** service. A link that names a place without a position, or a typed name, gets the same search. Coordinates are never invented: a pin exists only when the link carried one or you picked a search result. Search runs only when you press it, at most once a second.
- **Map view** (Leaflet with OpenStreetMap tiles, loaded from the jsDelivr CDN when first needed) with golden pins coloured by status: gold for want, mint for planned, pale for visited. Tap a pin for its card, or tap an empty spot to add a place there. If you are offline the map says so and the list keeps working.
- **Visited** is one tap, with a ring of golden ripples. Visited places keep a note ("How was it?") and a photo.
- **Plan my day:** pick a date and Daybook suggests a short plan from unvisited places that are close together, ordered by nearest neighbour with the distance between stops, plus a food idea from your likes. Accept, swap or remove each stop; accepted places become Planned for that date.

## Map address search

Typing or pasting an address in the Bucket list opens **Find the place**: up to five tappable result cards, each with the full address. Tap one and the pin drops and the map zooms to it.

- **It retries by itself.** If nothing matches, Daybook tries again with a simpler version, in this order: without the apartment or unit number, without the postal code, then the place name plus the city. It tells you which version matched ("Matched using without the postal code") or lists everything it tried.
- **Home first.** Settings, **Home and food**, takes a home city and country. Daybook looks it up once and leans every search towards it (and towards the part of the map you are looking at). It only biases results; places elsewhere still turn up.
- **Polite to the free service.** One request at a time, at least a second apart, a short pause after you stop typing, an older search is dropped when a newer one starts, and repeats are remembered. If you are offline or the service cannot be reached, you get a plain message and the list keeps working.
- **Last resort: pin it by hand.** The map opens zoomed near your home city with a draggable pin and the hint "Tap the exact spot". There is also **Use my current location**. Pasting a map link works exactly as before.

## Notes

A list of notes beside a clear-glass writing area with faint ruled lines and a gold margin line, in small handwriting. On a phone the list and the page take turns, with a back button. Create, edit, delete, pin and search (title, tags and text); each note has a title, tags and its date.

- **Plain text only.** Pasting text drops all formatting, so nothing foreign gets in.
- **Pictures.** Paste a screenshot, drag pictures in, or use the picture button (on a phone it opens the photo picker). They sit inline where the cursor was, as small framed thumbnails; tap one to see it larger. Pictures are shrunk to 1024 px and stored in IndexedDB like every other photo, and they travel in the backup.
- **Dictation:** the microphone writes into the paragraph you were in.
- Everything **autosaves** a moment after you stop typing (and when you leave the page).

## Alerts

Reminders have a title, date, time and a repeat of once, every day, every week, or chosen weekdays. The page has **Today**, **Upcoming** and **Done** sections, with snooze (10 minutes, an hour, this evening, tomorrow morning), edit and delete.

- **Goal nudges** (Settings, Goal nudges): at the times you choose (15:30 and 20:00 to start) Daybook lists the goals still unticked today. If everything is done it stays quiet.
- **How an alert arrives:** an in-app card, a gentle two-note chime (switch it off in Settings), and a browser notification when you have allowed them. **Send test alert** (on the Alerts page and in Settings) proves it works.
- **When it checks:** every 30 seconds while the page is open, and again the moment the tab becomes visible. Anything missed is caught up when you return: a one-off reminder always, a repeating one if it was due in the last 24 hours. A reminder fires once per occurrence.
- **The honest limit:** a web page cannot run once it is fully closed. Alerts are reliable only while Daybook is open or was open recently. On iPhone, notifications need Daybook added to the Home Screen first. Real background alerts need the phone-app version later.

## Insights

A month picker with arrows, and a **Month / Week** toggle.

- **Month glow:** a calendar heat map of how much of each day you finished (gold glow for everything, green for half or more, fainter for less).
- Overall percentage, best streak this month, current streak, number of full days, and a sentence comparing with the month before ("Up 12 percent from October").
- **Goal by goal** consistency bars, a **mood** line, and counts of likes added, places visited and notes written.
- **Badges** (7-day streak, Full glow, Steady hands, Mood keeper, Explorer, Foodie, Writer), each with its rule shown.
- Charts are plain SVG in the gold and light-green palette. A month with no data shows a friendly note.

## My Prompt

Three tabs, **Food at a restaurant**, **Places to go** and **Movies and shows**. Each has a few questions (restaurant, cuisine, who is eating, budget, mood; or city, time, transport, budget, company; or mood, time, who is watching, movie or series), an **Extra context** box, and tick boxes for which parts of your own data to include. The prompt is built from your likes, ratings, repeated tags, dietary notes, recent picks, wish list and visited places, as tidy plain text with headings and short bullets, and ends with what to ask for (specific dishes and why, one adventurous pick, things you would probably dislike; a short plan, new similar places, what to avoid; picks with reasons, one wildcard, no spoilers).

- **Generate** rebuilds it, **Copy** copies it (with a confirmation) and **Download .txt** saves a text file. You can also edit the text before copying.
- **Privacy mode** leaves out your name, addresses and the text of your notes. Item names, ratings and the city you type stay.
- With little saved the prompt says so and asks the AI to check with you, so it is still useful.
- **Nothing is sent anywhere.** You copy the text into whichever AI chat you like.

## Photos

Pictures are shrunk to 1024 px and kept in IndexedDB, not localStorage. Backups embed them, so one `daybook-data.json` holds everything.

## Using it

**Today** is one glass diary page: date and greeting, today's goals, a mood picker and a note. Tick a goal and a pen draws the tick. **Habits** lists every goal with weekdays, streaks and totals, and has the monthly stamp calendar. **Settings** holds your name, home city and dietary notes, goal nudges, your data controls, the idle-life controls and the **Dragon workshop**: a slider to pretend today is 0 to 100% complete, "Play this level's action", "Back to today's pose", a button per clip, a replay of the victory flight, and an animations switch. None of it changes your real data.

## Your data

Live data sits in your browser (localStorage, plus IndexedDB for the linked file). Browsers cannot silently write to a file, so:

- **Save to file** downloads `daybook-data.json`, plain readable text.
- **Load from file** replaces everything with a saved file (it asks first).
- **Link a data file** (Chrome and Edge): pick one file once and Daybook writes into it a moment after every change. After a browser restart the browser asks for permission again, so Daybook shows an "Allow access" button. Other browsers fall back to download and upload.
- A banner reminds you if there has been no backup for 7 days.

Clearing your browser's site data erases the live copy, so keep a saved file. Files you load are checked and cleaned before use, and stored text is only ever displayed as text, never as page code.

## Notes on safety

- Backups carry a **schema version**: version 2 added likes, places, plans, recent food picks and the voice language; **version 3 adds notes (with their pictures), reminders, goal-nudge settings, home city and dietary notes**. A backup from an older version loads through each migration and gains empty lists. Everything that comes from a file is checked: ids, enums and numbers are validated, links must be http or https, coordinates must be real, and photos must be small jpeg, png or webp data URLs.
- The Content Security Policy now also allows Leaflet from `cdn.jsdelivr.net` (with an integrity hash), map tiles from `tile.openstreetmap.org`, and requests to `nominatim.openstreetmap.org`. Nothing else.

- A Content Security Policy in `index.html` lets only this folder's scripts run. A later phase will add the map and search hosts it needs.
- CDN files are pinned to exact versions but not integrity-checked (SRI hashes could not be generated while building). Add them with `openssl dgst -sha384 -binary file | openssl base64 -A`.
- Reading the colour of the scene to tint the glass is blocked by browsers when the page is opened from disk; the glass then uses the dragon's state colours only. Served over http it also picks up the forest's colour.
- Alerts can only fire reliably while Daybook is open in a tab (see Alerts). That is a browser limit, not something the app can fix.

## Hosting later (not now)

Every path in the app is relative, so nothing needs editing to host it. When the time comes, copy the whole `daybook` folder (including `assets/dragon-video` with its `idle` and `guests` folders and `idle-manifest.js`) to the host as it is. Nothing here needs Python, a server or an install, and none has been added. Update `idle-manifest.js` on your computer before copying so the host knows the clip names.

## Roadmap (not built)

The code is organised so Daybook can later be wrapped as a phone app with reminders and pop-up notifications: one store module, one module per feature, no globals beyond the `Daybook` namespace. Nothing for hosting, install or push is built yet.
