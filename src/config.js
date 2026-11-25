// ─────────────────────────────────────────────────────────────────────────────
//  CARD WALL — personal portfolio
//  Everything you'd change lives in this one file.
//
//  Projects: each `shot` is an image in /raw-shots (1440x900 PNG). After adding,
//  removing or reordering projects, run `npm run cards` to rebuild the textures.
//  Grab screenshots of live sites with:  npm run shoot -- name=https://site.com
//
//  The demo person, Kabir Anand, and every client below are fictional.
// ─────────────────────────────────────────────────────────────────────────────

export const site = {
  name: 'Kabir Anand',
  line: 'Designer & creative developer',
  title: 'Kabir Anand — Designer & creative developer',
  description: 'Freelance designer and creative developer building brands and websites people remember.',

  // accent colour used for highlights, buttons and the progress bar
  accent: '#e7d2ac',

  hero: {
    title: ['I design websites', 'you walk through.'],
    sub: 'Scroll to walk through my work',
  },

  // bottom-left captions for the chapters ({count} = number of projects)
  captions: [
    { title: 'Walk the tunnel.', body: 'Every wall is lined with {count} things I’ve made. Keep scrolling.' },
    { title: 'Welcome to my room.', body: 'That’s me down there, walking through my own work.' },
    { title: 'Pull one off the wall.', body: 'Each project lifts out and comes forward to meet you.' },
  ],

  // the About chapter, shown in the room before the projects
  about: {
    portrait: 'assets/portrait.webp', // swap for your own photo (4:5 works best)
    hello: 'Hi, I’m Kabir.',
    bio: [
      'I’m an independent designer and creative developer. For eight years I’ve helped founders, shops and studios turn what they make into websites people actually remember.',
      'I do the whole thing myself, from the first sketch to the last line of code, so nothing gets lost in a handover.',
    ],
    facts: [
      { label: 'Based in', value: 'Mumbai, working worldwide' },
      { label: 'Experience', value: '8 years, 60+ launches' },
      { label: 'Currently', value: 'Booking projects for spring' },
    ],
    skills: ['Brand identity', 'Web design', 'Creative development', 'Three.js / WebGL', 'Shopify', 'Motion'],
    available: true,
    availableText: 'Available for freelance',
  },

  // the closing screen after the last project
  contact: {
    title: ['Let’s make', 'something good.'],
    body: 'Tell me what you’re building and when you need it. I reply to every message within two days.',
    email: 'hello@example.com', // ← replace with the real address
    button: 'Say hello',
    links: [
      { label: 'Instagram', url: '#' },
      { label: 'LinkedIn', url: '#' },
      { label: 'Dribbble', url: '#' },
      { label: 'Résumé', url: '#' },
    ],
  },
};

// `role` = what you did on the project. `url` (optional) adds a "Visit live site" link.
export const projects = [
  {
    id: 'velvetine', shot: 'velvetine', title: 'Velvetine', kind: 'Skincare · E-commerce', year: '2026',
    role: ['Brand identity', 'Shopify design & build', 'Skin quiz'],
    blurb: 'A gentle, clinical-but-warm store for a barrier-repair skincare line.',
    story: 'Velvetine had one hero product and a lot of competitors shouting. I went quiet instead: a blush palette, a soft serif and a store that explains ingredients like a friend would. The skin quiz I built now drives a third of first orders.',
    url: '',
  },
  {
    id: 'northfield', shot: 'northfield', title: 'Northfield Cycles', kind: 'Bicycles · Website', year: '2026',
    role: ['Art direction', 'Website', 'Dealer map'],
    blurb: 'Loud type and line drawings for a gravel-bike maker that wants you outside.',
    story: 'A small frame builder needed a site as confident as their bikes. I drew the bikes by hand, set everything in oversized type with one acid green, and built a dealer map and test-ride booking to do the selling.',
    url: '',
  },
  {
    id: 'orbita', shot: 'orbita', title: 'Orbita', kind: 'Fintech · Product launch', year: '2025',
    role: ['Launch site', 'Motion', 'App UI kit'],
    blurb: 'A launch site for a travel money app, glowing in the dark.',
    story: 'Orbita launched in 31 countries on the same day, so the site had to translate cleanly and load fast anywhere. I built a dark, glowing system around the card itself and a phone demo that plays real transactions.',
    url: '',
  },
  {
    id: 'saltmarsh', shot: 'saltmarsh', title: 'Saltmarsh', kind: 'Restaurant · Website', year: '2025',
    role: ['Identity refresh', 'Website', 'Reservations'],
    blurb: 'A harbour oyster bar with a menu that changes with the tide.',
    story: 'The menu changes daily, so I made "tonight’s catch" editable from the owner’s phone in seconds. Navy, cream and a classic serif keep it feeling like somewhere you dress up a little for.',
    url: '',
  },
  {
    id: 'fieldnotes', shot: 'fieldnotes', title: 'Fieldnotes', kind: 'Magazine · Editorial', year: '2025',
    role: ['Editorial design', 'CMS', 'Subscriptions'],
    blurb: 'An independent travel magazine that reads like the printed one.',
    story: 'Long reads deserve good typography. I set Fieldnotes in a serif built for screens, gave every story its own cover and cut subscribing down to a single step.',
    url: '',
  },
  {
    id: 'kiln', shot: 'kiln', title: 'Kiln & Co.', kind: 'Ceramics · Shop', year: '2025',
    role: ['Shopify build', 'Drop countdowns', 'Packaging'],
    blurb: 'A pottery studio’s shop built around small, sell-out batches.',
    story: 'Four potters, small batches, sold out in hours. I built a shop that counts down to each drop, emails the waitlist, and shows every piece on its own clay-coloured tile.',
    url: '',
  },
  {
    id: 'parallax', shot: 'parallax', title: 'Parallax', kind: 'AI · SaaS', year: '2026',
    role: ['Marketing site', 'Docs', 'Changelog'],
    blurb: 'A developer tool’s site that shows the product working instead of describing it.',
    story: 'Developers skip marketing copy, so I made the hero a live terminal replaying a real fix. A grid background, one neon accent and fast docs do the rest.',
    url: '',
  },
  {
    id: 'mare', shot: 'mare', title: 'Maré', kind: 'Swimwear · Campaign', year: '2026',
    role: ['Campaign site', 'Lookbook', 'Illustration'],
    blurb: 'A summer campaign for recycled-nylon swimwear, drawn in waves.',
    story: 'For the Summer ’26 drop I drew the sea in four flat layers and sat the type on the horizon. The lookbook scrolls like a day at the beach, from morning to sunset.',
    url: '',
  },
  {
    id: 'tessellate', shot: 'tessellate', title: 'Tessellate', kind: 'Architecture · Portfolio', year: '2024',
    role: ['Portfolio site', 'Project archive', 'Writing section'],
    blurb: 'An architecture practice’s archive of 48 buildings, organised by place.',
    story: 'Architects want the work to speak, so I kept out of the way: warm greys, one grotesk, and an archive you can filter by city, type and year.',
    url: '',
  },
  {
    id: 'bramble', shot: 'bramble', title: 'Bramble Tea', kind: 'Tea · E-commerce', year: '2024',
    role: ['Packaging', 'Shopify build', 'Subscriptions'],
    blurb: 'Single-estate tea in gold tins, sold by the harvest.',
    story: 'I redesigned the tins first and built the shop around them. Each harvest gets its own page with tasting notes and brewing times, and subscribers get the first flush before anyone else.',
    url: '',
  },
  {
    id: 'volta', shot: 'volta', title: 'Volta', kind: 'Automotive · Launch', year: '2026',
    role: ['Launch site', 'Configurator', '3D product views'],
    blurb: 'An electric car launch that sells calm instead of horsepower.',
    story: 'The Model V is quiet, so I made the site quiet too: white space, one red, and only the numbers that matter. The configurator remembers your build and books a test drive in three taps.',
    url: '',
  },
  {
    id: 'hush', shot: 'hush', title: 'Hush', kind: 'Audio · Product page', year: '2025',
    role: ['Product page', 'Sound demo', 'Retail kit'],
    blurb: 'A headphone product page that lets you hear the quiet.',
    story: 'One product, one page. Orange on black, a big product shot, and a demo I built that fades a busy street to silence as you scroll.',
    url: '',
  },
];
