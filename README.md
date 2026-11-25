# Card Wall — 3D personal portfolio

A scroll-driven 3D portfolio for one person. Visitors walk down a tunnel lined
with your projects. It unrolls into a round gallery room where **you** (the 3D
man) stroll the floor. An About panel introduces you, each project's card comes
off the wall to meet the visitor, and every project has a case-study page. The
walk ends on a contact screen.

The demo person, **Kabir Anand** (freelance designer & creative developer), and
his 12 clients are fictional. None of the brands are real.

**The walk:** hero → tunnel → room → About → projects one by one → contact.

---

## Quick start

```
npm install
npm run dev          # http://localhost:5240
```

No build step. The site is plain static files, so you can upload the folder to
Vercel, Netlify, GitHub Pages or any web host as-is.

## Make it yours (about 15 minutes)

Everything a client changes lives in **`src/config.js`**:

| What | Where in `config.js` |
|---|---|
| Your name, role, page title | `site.name`, `site.line`, `site.title` |
| Accent colour (buttons, highlights, progress bar) | `site.accent` |
| Big intro headline | `site.hero.title` (two lines; the second is italic) |
| The three chapter captions | `site.captions` |
| About panel: photo, hello line, bio, facts, skills, availability | `site.about` (delete it to skip the chapter) |
| Closing contact screen, email and social links | `site.contact` |
| Projects (title, type, year, what you did, blurb, story, live URL) | `projects` |

**Your photo:** put a 4:5 photo in `assets/` and point `site.about.portrait` at
it. The demo portrait is a render of the 3D man (`npm run portrait` re-renders
it while `npm run dev` is running).

Then swap the screenshots:

1. Screenshot each real project, either with the built-in tool…
   ```
   npm run shoot -- velvetine=https://client-site.com northfield=https://other.com
   npm run shoot -- --wait=15000 slowsite=https://site-with-a-loader.com
   ```
   …or drop your own 1440×900 PNGs into `raw-shots/` (the file name = the project's `shot`).
2. Run `npm run cards` to rebuild the wall textures and case-study images.
3. Refresh.

Works with anything from about 6 to 20 projects. The wall shuffles and repeats
them to fill the room.

## What visitors get

- **Tunnel → room → card pull**, all driven by scroll (Lenis smooth scrolling).
- **Top bar**: About and Contact jump links, plus **Work**, a list to jump to
  any project (on phones, Work only).
- **About** in the room: portrait, bio, facts, skills and an "Available for
  freelance" dot.
- **Work list** to jump to any project. Clicking any card on the wall
  jumps to it too, and the ← → keys step through projects.
- **Case study** ("View case study" or click the held card): a large image,
  year, services, the story, a live-site link if there is one, and "Next project".
- **Contact screen** after the last project: headline, email button, social links.
- **Deep links**: `?p=<project id>` opens on a project; `#contact` opens the ending.
- **Sound** toggle: a quiet synthesized room tone with a whoosh on each pull.
- **Phones**: fewer cards, a smaller texture, a centred card layout and a
  bottom-sheet project panel.
- Respects reduced-motion settings.

## Files

```
index.html               page skeleton + import map
src/config.js            ← all content
src/main.js              3D scene, scroll timeline, UI
src/walker.js            the walking man (model + mocap walk)
src/sound.js             synthesized ambience
src/style.css            overlay styling (colours as CSS variables at the top)
raw-shots/               source screenshots (1440x900 PNG)
cards/                   generated: texture atlas + case-study images
models/                  man.glb + walk-anims.json
scripts/build-atlas.mjs  npm run cards
scripts/shoot.mjs        npm run shoot / npm run mocks (add --mobile for phone size)
scripts/portrait.html    npm run portrait (renders assets/portrait.webp)
assets/                  portrait photo
scripts/mock-sites/      the 12 fictional demo sites (HTML/CSS/SVG)
scripts/retarget.mjs     re-creates walk-anims.json (see below)
presets/onestop/         a saved real-content version (projects + screenshots)
vendor/                  three.js, Lenis, GLTFLoader (pinned copies)
```

## How it works

- **One draw call for the whole wall.** Every card is an instance of one plane
  sampling a single texture atlas.
- **Same cards, two layouts.** Each card has a tunnel position and a room
  position, and scrolling blends between them. The part of the wall you're
  facing fills in first.
- **Scroll timeline** (`SEG` in `src/main.js`, in screen-heights): tunnel 4.2 →
  morph 1.8 → hold 0.5 → about 2 → settle 0.9 → 1.05 per project → contact 1.6.
- **The walking man** is the Ready Player Me avatar from the three.js examples,
  with the Mixamo "Soldier" sample's motion-captured walk and idle, retargeted
  onto his skeleton by `scripts/retarget.mjs`. He moves exactly as fast as his
  feet travel, stops now and then to look at the wall, and casts a soft
  shadow. His suit is tinted charcoal in `src/walker.js` (`CHARCOAL`, `HAT`).
  To redo the retarget, download `Soldier.glb` from github.com/mrdoob/three.js
  (examples/models/gltf) and run `node scripts/retarget.mjs path/to/Soldier.glb`.

## Switching to the saved real-content preset

```
cp presets/onestop/raw-shots/*.png raw-shots/
```
Then copy the `projects` entries from `presets/onestop/projects.js` into
`src/config.js` and run `npm run cards`.

## Debugging

Add `?debug` to the URL to get `window.__wall`:
`__wall.jumpTo(screens)` scrolls to a point in the timeline (or open
`?debug&at=7.5` directly), and
`__wall.follow = [angle, height, distance, lookHeight]` puts a camera on the
walker (`null` to release it).

## Updating three.js or Lenis

```
npm install three@<version> lenis@<version>
npm run vendor
```

## Credits

3D character and animation: three.js example assets (Ready Player Me avatar,
Mixamo "Soldier" animation). Fonts: Instrument Serif and Inter Tight (Google
Fonts). Inspired by the card-tunnel idea; all code is original.
