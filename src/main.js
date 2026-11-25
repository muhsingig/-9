import * as THREE from 'three';
import Lenis from 'lenis';
import { site, projects } from './config.js';
import { makeWalker } from './walker.js';
import { Ambience } from './sound.js';

/* ------------------------------------------------------------------ setup */

const isSmall = matchMedia('(max-width: 760px)').matches;
const isTouch = matchMedia('(pointer: coarse)').matches;
const lite = isSmall || isTouch;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const N = projects.length;
const TAU = Math.PI * 2;
const $ = (s) => document.querySelector(s);

history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lite, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, lite ? 1.5 : 1.75));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true; // only the walking figure casts one
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505);
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.05, 220);

/* --------------------------------------------------------------- layouts */

// Room: rings of cards stacked up a cylinder wall. Tunnel: rings of cards
// around a curved tube. Every card exists once and morphs from one to the other.
const ROOM = lite
  ? { R: 11, rows: 7, perRow: 26, w: 2.1, h: 1.3125, gapY: 0.16 }
  : { R: 13, rows: 9, perRow: 33, w: 2.3, h: 1.4375, gapY: 0.16 };
const TUN = lite ? { r: 2.1, around: 11, w: 1.6, h: 1.0 } : { r: 2.3, around: 12, w: 1.6, h: 1.0 };
const COUNT = ROOM.rows * ROOM.perRow;
const FEATURE_ROW = 1;
const rowY = (k) => 0.25 + ROOM.h / 2 + k * (ROOM.h + ROOM.gapY);

const curve = new THREE.CatmullRomCurve3(
  [
    new THREE.Vector3(0, 2.4, -50),
    new THREE.Vector3(3.6, 3.1, -39),
    new THREE.Vector3(-3.2, 2.1, -27),
    new THREE.Vector3(2.2, 2.8, -15),
    new THREE.Vector3(0, 2.5, -3),
  ],
  false,
  'catmullrom',
  0.5
);
const rings = Math.ceil(COUNT / TUN.around);
const frames = curve.computeFrenetFrames(rings * 2, false);
const ringData = Array.from({ length: rings }, (_, r) => {
  const i = r * 2 + 1;
  return { P: curve.getPointAt(i / (rings * 2)), T: frames.tangents[i], Nn: frames.normals[i], B: frames.binormals[i] };
});

// which wall card belongs to which project
const featureCol = projects.map((_, i) => Math.round((i * ROOM.perRow) / N) % ROOM.perRow);
const featureIdx = featureCol.map((c) => FEATURE_ROW * ROOM.perRow + c);
const featureTheta = featureCol.map((c) => (c / ROOM.perRow) * TAU);

const slots = new Float32Array(COUNT);
const delay = new Float32Array(COUNT);
const roomPos = [];
const roomQuat = [];
const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

{
  const m = new THREE.Matrix4();
  const x = new THREE.Vector3();
  const y = new THREE.Vector3(0, 1, 0);
  const z = new THREE.Vector3();
  for (let k = 0; k < COUNT; k++) {
    const row = Math.floor(k / ROOM.perRow);
    const col = k % ROOM.perRow;
    const th = (col / ROOM.perRow) * TAU;
    const s = Math.sin(th);
    const c = Math.cos(th);
    roomPos.push(new THREE.Vector3(s * ROOM.R, rowY(row), c * ROOM.R));
    z.set(-s, 0, -c);
    x.set(-c, 0, s);
    m.makeBasis(x, y, z);
    roomQuat.push(new THREE.Quaternion().setFromRotationMatrix(m));
    // shuffle projects across the wall, never repeating a neighbour to the left or below
    let sl = Math.floor(hash(k * 3.7 + 11) * N);
    const left = col > 0 ? slots[k - 1] : -1;
    const below = row > 0 ? slots[k - ROOM.perRow] : -1;
    for (let guard = 0; (sl === left || sl === below) && guard < N; guard++) sl = (sl + 1) % N;
    slots[k] = sl;
    // the part of the wall you're facing (theta ~ 0) fills in first,
    // then the rest wraps around behind you
    const facing = Math.min(th, TAU - th) / Math.PI;
    delay[k] = 0.14 * hash(k) + 0.42 * facing;
  }
  featureIdx.forEach((k, i) => (slots[k] = i));
}

const _rad = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
function tunnelXform(k, spin, outPos, outQuat) {
  const ring = Math.floor(k / TUN.around);
  const dir = ring % 2 ? 1 : -1;
  const a = ((k % TUN.around) / TUN.around) * TAU + (ring % 2 ? Math.PI / TUN.around : 0) + spin * dir;
  const rd = ringData[ring];
  _rad.copy(rd.Nn).multiplyScalar(Math.cos(a)).addScaledVector(rd.B, Math.sin(a));
  outPos.copy(rd.P).addScaledVector(_rad, TUN.r);
  _x.copy(rd.T);
  _z.copy(_rad).negate();
  _y.crossVectors(_z, _x);
  // keep every card upright as you look down the tunnel: flip the reading
  // direction on the side where "up" would otherwise point down
  if (_y.y + _y.x * 0.02 < 0) {
    _x.negate();
    _y.negate();
  }
  _m.makeBasis(_x, _y, _z);
  outQuat.setFromRotationMatrix(_m);
}

/* ------------------------------------------------------------- materials */

const atlasInfo = { cols: 4, rows: Math.ceil(N / 4) };

const cardVert = /* glsl */ `
  uniform vec2 uGrid;
  uniform vec4 uRect;
  uniform float uHover;
  varying vec2 vUv;
  varying vec2 vLocal;
  varying float vDepth;
  varying float vHover;
  varying float vY;
  #ifdef USE_INSTANCING
    attribute float aSlot;
  #endif
  void main() {
    vLocal = uv;
    vec2 inner = mix(vec2(0.004), vec2(0.996), uv);
    #ifdef USE_INSTANCING
      float col = mod(aSlot, uGrid.x);
      float row = floor(aSlot / uGrid.x);
      vec2 cell = 1.0 / uGrid;
      vUv = vec2((col + inner.x) * cell.x, 1.0 - (row + 1.0 - inner.y) * cell.y);
      vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
      vHover = abs(float(gl_InstanceID) - uHover) < 0.5 ? 1.0 : 0.0;
    #else
      vUv = uRect.xy + inner * uRect.zw;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vHover = 0.0;
    #endif
    vY = wp.y;
    vec4 mv = viewMatrix * wp;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const cardFrag = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uFog;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uRoom;
  uniform float uBright;
  uniform float uSolo;
  varying vec2 vUv;
  varying vec2 vLocal;
  varying float vDepth;
  varying float vHover;
  varying float vY;

  float roundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  void main() {
    vec2 p = (vLocal - 0.5) * vec2(1.6, 1.0);
    float d = roundBox(p, vec2(0.8, 0.5), 0.03);
    float aa = fwidth(d) * 1.2;
    float alpha = 1.0 - smoothstep(-aa, aa, d);
    if (alpha < 0.02) discard;

    vec3 col = texture2D(uMap, vUv).rgb;
    // in the room, the lower rows catch light bouncing off the floor
    float lift = mix(1.0, clamp(1.16 - (vY - 1.2) * 0.085, 0.3, 1.16), uRoom);
    col *= lift * uBright;
    col = mix(col, col * 1.18 + 0.04, vHover);
    // thin bright rim
    float rim = smoothstep(-0.012, 0.0, d) * 0.22;
    col += rim;
    float fog = smoothstep(uFogNear, uFogFar, vDepth) * (1.0 - uSolo);
    col = mix(col, uFog, fog);
    gl_FragColor = vec4(col, alpha);
  }
`;

const loader = new THREE.TextureLoader();
function prepTexture(t) {
  t.colorSpace = THREE.NoColorSpace; // sample raw: screenshot colours pass straight through
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

const sharedUniforms = {
  uFog: { value: new THREE.Color(0.02, 0.02, 0.02) },
  uFogNear: { value: 6 },
  uFogFar: { value: 34 },
  uRoom: { value: 0 },
};

const wallMat = new THREE.ShaderMaterial({
  vertexShader: cardVert,
  fragmentShader: cardFrag,
  uniforms: {
    ...sharedUniforms,
    uMap: { value: null },
    uGrid: { value: new THREE.Vector2(atlasInfo.cols, atlasInfo.rows) },
    uRect: { value: new THREE.Vector4(0, 0, 1, 1) },
    uHover: { value: -1 },
    uBright: { value: 1 },
    uSolo: { value: 0 },
  },
  alphaToCoverage: !lite,
});

const cardGeo = new THREE.PlaneGeometry(1, 1);
cardGeo.setAttribute('aSlot', new THREE.InstancedBufferAttribute(slots, 1));
const wall = new THREE.InstancedMesh(cardGeo, wallMat, COUNT);
wall.frustumCulled = false;
wall.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(wall);

// the one card that comes off the wall
const soloMat = new THREE.ShaderMaterial({
  vertexShader: cardVert,
  fragmentShader: cardFrag,
  uniforms: {
    ...sharedUniforms,
    uRoom: { value: 0 },
    uMap: { value: null },
    uGrid: { value: new THREE.Vector2(atlasInfo.cols, atlasInfo.rows) },
    uRect: { value: new THREE.Vector4(0, 0, 1, 1) },
    uHover: { value: -1 },
    uBright: { value: 1 },
    uSolo: { value: 1 },
  },
  alphaToCoverage: !lite,
});
const solo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), soloMat);
solo.visible = false;
solo.renderOrder = 2;
scene.add(solo);

/* ----------------------------------------------------------------- floor */

function floorTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(512, 512, 0, 512, 512, 512);
  grd.addColorStop(0, '#cdb999');
  grd.addColorStop(0.22, '#a38c6d');
  grd.addColorStop(0.5, '#4b3f32');
  grd.addColorStop(0.78, '#15120f');
  grd.addColorStop(1, '#050505');
  g.fillStyle = grd;
  g.fillRect(0, 0, 1024, 1024);
  // faint film grain so the gradient doesn't band
  const img = g.getImageData(0, 0, 1024, 1024);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 6;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(ROOM.R + 0.4, 96),
  new THREE.MeshBasicMaterial({ map: floorTexture(), transparent: true, opacity: 0, depthWrite: false })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const walker = makeWalker();
scene.add(walker.root, walker.lights);
walker.setOpacity(0);

/* ----------------------------------------------------------- scroll plan */

// Lengths in screen-heights.
const SEG = { tunnel: 4.2, morph: 1.8, hold: 0.5, about: site.about ? 2 : 0, settle: 0.9, project: 1.05, contact: 1.6 };
const START = { morph: SEG.tunnel };
START.hold = START.morph + SEG.morph;
START.about = START.hold + SEG.hold;
START.settle = START.about + SEG.about;
START.projects = START.settle + SEG.settle;
START.contact = START.projects + N * SEG.project;
const TOTAL = START.contact + SEG.contact;
const projectScreen = (i) => START.projects + (i + 0.45) * SEG.project;

let vh = window.innerHeight;
const scrollEl = $('#scroll');
function sizeScroll() {
  scrollEl.style.height = `${Math.round((TOTAL + 1) * vh)}px`;
}
sizeScroll();

const lenis = new Lenis({ lerp: reduced ? 1 : 0.085, wheelMultiplier: 0.9, smoothWheel: !reduced });
const jumpTo = (screens, immediate = false) => lenis.scrollTo(screens * vh, { immediate, duration: 1.6 });
if (new URLSearchParams(location.search).has('debug')) window.__wall = { lenis, jumpTo, walker, get vh() { return vh; } };

/* ------------------------------------------------------------------- DOM */

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
document.querySelectorAll('.brand-name').forEach((el) => (el.textContent = site.name));
$('.brand-line').textContent = site.line;
$('.hero-title').innerHTML = site.hero.title.map((l) => `<span>${esc(l)}</span>`).join('');
$('.hero-sub span').textContent = site.hero.sub;
document.title = site.title || `${site.name} — ${site.line}`;
if (site.description) document.querySelector('meta[name="description"]').content = site.description;
if (site.accent) document.documentElement.style.setProperty('--warm', site.accent);

// About chapter
const aboutEl = $('#about');
if (site.about) {
  const a = site.about;
  const img = aboutEl.querySelector('.about-portrait img');
  img.src = a.portrait;
  img.alt = `Portrait of ${site.name}`;
  aboutEl.querySelector('.about-hello').textContent = a.hello;
  aboutEl.querySelector('.about-bio').innerHTML = a.bio.map((p) => `<p>${esc(p)}</p>`).join('');
  aboutEl.querySelector('.about-facts').innerHTML = a.facts
    .map((f) => `<div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`)
    .join('');
  aboutEl.querySelector('.about-skills').innerHTML = a.skills.map((s) => `<li>${esc(s)}</li>`).join('');
  const av = aboutEl.querySelector('.about-available');
  av.hidden = !a.available;
  av.querySelector('span').textContent = a.availableText || 'Available for work';
} else {
  aboutEl.remove();
  $('#navAbout')?.remove();
}

// top bar links
$('#navAbout')?.addEventListener('click', () => jumpTo(START.about + SEG.about * 0.5));
$('#navContact').addEventListener('click', () => jumpTo(TOTAL));

// closing contact screen
const contactEl = $('#contact');
{
  const c = site.contact;
  contactEl.querySelector('.contact-title').innerHTML = c.title.map((l) => `<span>${esc(l)}</span>`).join('');
  contactEl.querySelector('.contact-body').textContent = c.body;
  const mail = contactEl.querySelector('.contact-mail');
  mail.href = `mailto:${c.email}`;
  mail.querySelector('span').textContent = c.button;
  contactEl.querySelector('.contact-email').textContent = c.email;
  contactEl.querySelector('.contact-links').innerHTML = (c.links || [])
    .map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`)
    .join('');
  contactEl.querySelector('.contact-top').addEventListener('click', () => jumpTo(0));
}

const indexEl = $('#index');
indexEl.innerHTML = projects
  .map((p, i) => `<li><button type="button" data-p="${i}"><span class="n">${String(i + 1).padStart(2, '0')}</span>${p.title}</button></li>`)
  .join('');
indexEl.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-p]');
  if (!b) return;
  jumpTo(projectScreen(+b.dataset.p));
  if (lite) setIndexOpen(false);
});
let indexOpen = !lite && window.innerHeight >= 760;
const indexToggle = $('#indexToggle');
function setIndexOpen(v) {
  indexOpen = v;
  indexToggle.setAttribute('aria-expanded', String(v));
}
setIndexOpen(indexOpen);
indexToggle.addEventListener('click', () => setIndexOpen(!indexOpen));

$('.brand').addEventListener('click', (e) => {
  e.preventDefault();
  jumpTo(0);
});

const sound = new Ambience();
const soundBtn = $('#soundToggle');
soundBtn.addEventListener('click', () => {
  const on = sound.toggle();
  soundBtn.textContent = on ? 'Sound on' : 'Sound off';
  soundBtn.setAttribute('aria-pressed', String(on));
});

const hero = $('#hero');
const caption = $('#caption');
const meta = $('#meta');
const progressBar = $('#progress i');
const CAPTIONS = site.captions.map((c, i, all) => ({
  num: `${String(i + 1).padStart(2, '0')} / ${String(all.length).padStart(2, '0')}`,
  title: c.title,
  body: c.body.replace('{count}', String(N)),
}));
let capShown = -1;
function setCaption(i) {
  if (i === capShown) return;
  capShown = i;
  if (i < 0) {
    caption.classList.remove('on');
    return;
  }
  const c = CAPTIONS[i];
  caption.classList.remove('on');
  setTimeout(() => {
    caption.querySelector('.cap-num').textContent = c.num;
    caption.querySelector('.cap-title').textContent = c.title;
    caption.querySelector('.cap-body').textContent = c.body;
    if (capShown === i) caption.classList.add('on');
  }, 220);
}

let metaFor = -1;
function setMeta(i) {
  if (i === metaFor) return;
  metaFor = i;
  if (i < 0) return;
  const p = projects[i];
  meta.querySelector('.meta-kind').textContent = p.kind;
  meta.querySelector('.meta-num').textContent = `${String(i + 1).padStart(2, '0')} / ${String(N).padStart(2, '0')}`;
  meta.querySelector('.meta-title').textContent = p.title;
  meta.querySelector('.meta-blurb').textContent = p.blurb;
  meta.classList.toggle('no-link', !p.url);
  $('#openTab').href = p.url || '#';
  indexEl.querySelectorAll('li').forEach((li, k) => li.classList.toggle('current', k === i));
}

// Case study: a full-screen panel with the big image, facts and the story
const study = $('#study');
let studyFor = -1;
let lastFocus = null;
function openStudy(i) {
  const p = projects[i];
  if (!p) return;
  studyFor = i;
  lastFocus = document.activeElement;
  study.querySelector('.study-num').textContent = `${String(i + 1).padStart(2, '0')} / ${String(N).padStart(2, '0')}`;
  study.querySelector('.study-kind').textContent = p.kind;
  study.querySelector('.study-title').textContent = p.title;
  study.querySelector('.study-blurb').textContent = p.blurb;
  const img = study.querySelector('.study-img');
  img.src = `cards/${p.id}.webp`;
  img.alt = `${p.title} website`;
  study.querySelector('.study-year').textContent = p.year || '—';
  study.querySelector('.study-services').innerHTML = (p.role || p.services || []).map((s) => `<li>${esc(s)}</li>`).join('');
  study.querySelector('.study-story').textContent = p.story || p.blurb;
  study.querySelector('.study-live-wrap').hidden = !p.url;
  if (p.url) study.querySelector('.study-live').href = p.url;
  const next = projects[(i + 1) % N];
  study.querySelector('.study-next span').textContent = next.title;
  study.hidden = false;
  study.querySelector('.study-scroll').scrollTop = 0; // after un-hiding, or it's ignored
  document.body.classList.add('studying');
  lenis.stop();
  study.querySelector('.study-close').focus();
}
function closeStudy() {
  if (study.hidden) return;
  study.hidden = true;
  document.body.classList.remove('studying');
  lenis.start();
  lastFocus?.focus?.();
}
$('#stepInside').addEventListener('click', () => openStudy(metaFor));
study.querySelector('.study-close').addEventListener('click', closeStudy);
study.querySelector('.study-next').addEventListener('click', () => {
  const next = (studyFor + 1) % N;
  closeStudy();
  jumpTo(projectScreen(next), true);
  openStudy(next);
});
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeStudy();
  if (!study.hidden) return;
  if (state.projF >= -0.5 && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    const cur = Math.max(0, Math.min(N - 1, Math.floor(state.projF)));
    const next = Math.max(0, Math.min(N - 1, cur + (e.key === 'ArrowRight' ? 1 : -1)));
    jumpTo(projectScreen(next));
  }
});

/* ------------------------------------------------------------ interaction */

const pointer = new THREE.Vector2(9, 9);
const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
let pointerDirty = false;
addEventListener('pointermove', (e) => {
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  mouse.x = pointer.x;
  mouse.y = pointer.y;
  pointerDirty = true;
});
const raycaster = new THREE.Raycaster();
let hoverId = -1;
let hoverSolo = false;

function pick() {
  raycaster.setFromCamera(pointer, camera);
  hoverSolo = solo.visible && raycaster.intersectObject(solo).length > 0;
  let id = -1;
  if (!hoverSolo && state.m >= 1) {
    const hit = raycaster.intersectObject(wall)[0];
    if (hit && hit.instanceId !== hiddenIdx) id = hit.instanceId;
  }
  hoverId = id;
  wallMat.uniforms.uHover.value = id;
  canvas.style.cursor = id >= 0 || hoverSolo ? 'pointer' : '';
}

let downAt = null;
canvas.addEventListener('pointerdown', (e) => (downAt = { x: e.clientX, y: e.clientY }));
canvas.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 8) return;
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  pick();
  if (hoverSolo) openStudy(metaFor);
  else if (hoverId >= 0) jumpTo(projectScreen(slots[hoverId]));
});

/* --------------------------------------------------------------- camera */

const ease = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const sstep = (a, b, t) => ease(clamp01((t - a) / (b - a)));
const lerp = (a, b, t) => a + (b - a) * t;

const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

function tunnelPose(t, pos, look) {
  const c = 0.012 + 0.94 * t;
  curve.getPointAt(c, pos);
  curve.getPointAt(Math.min(c + 0.035, 1), look);
}
function overviewPose(orbit, pos, look) {
  const s = Math.sin(orbit);
  const c = Math.cos(orbit);
  const back = lite ? 8.6 : 10;
  const up = lite ? 8.2 : 8.6;
  pos.set(-s * back, up, -c * back);
  look.set(s * 5, lite ? 2.8 : 1.0, c * 5);
}
function projectPose(theta, pos, look) {
  const s = Math.sin(theta);
  const c = Math.cos(theta);
  const back = lite ? 1.6 : 2.4;
  pos.set(-s * back, 2.55, -c * back);
  look.set(s * ROOM.R, rowY(FEATURE_ROW) - 0.15, c * ROOM.R);
}
function angleTo(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/* ----------------------------------------------------------------- state */

const state = { s: 0, m: 0, projF: -1 };
let hiddenIdx = -1;
let spin = 0;
let lastWritten = { m: -1, hidden: -2, spin: -1 };

const dummy = new THREE.Object3D();
const pA = new THREE.Vector3();
const qA = new THREE.Quaternion();
const sTun = new THREE.Vector3(TUN.w, TUN.h, 1);
const sRoom = new THREE.Vector3(ROOM.w, ROOM.h, 1);

function writeWall(m) {
  if (m === lastWritten.m && hiddenIdx === lastWritten.hidden && (m >= 1 || spin === lastWritten.spin)) return;
  for (let k = 0; k < COUNT; k++) {
    if (m <= 0) {
      tunnelXform(k, spin, dummy.position, dummy.quaternion);
      dummy.scale.copy(sTun);
    } else if (m >= 1) {
      dummy.position.copy(roomPos[k]);
      dummy.quaternion.copy(roomQuat[k]);
      dummy.scale.copy(sRoom);
    } else {
      const e = ease(clamp01((m - delay[k]) / 0.44));
      tunnelXform(k, spin, pA, qA);
      dummy.position.lerpVectors(pA, roomPos[k], e);
      // arc up and away from the camera, shrinking mid-flight so nothing slaps the lens
      const arc = Math.sin(e * Math.PI);
      dummy.position.y += arc * 2.6;
      dummy.position.x += arc * Math.sign(roomPos[k].x || 1) * 1.2;
      dummy.quaternion.slerpQuaternions(qA, roomQuat[k], e);
      dummy.scale.lerpVectors(sTun, sRoom, e).multiplyScalar(1 - arc * 0.4);
    }
    if (k === hiddenIdx) dummy.scale.setScalar(0.0001);
    dummy.updateMatrix();
    wall.setMatrixAt(k, dummy.matrix);
  }
  wall.instanceMatrix.needsUpdate = true;
  wall.computeBoundingSphere();
  lastWritten = { m, hidden: hiddenIdx, spin };
}

// hi-res texture for the card in your hands
const hiRes = new Map();
function soloTexture(i) {
  const p = projects[i];
  if (hiRes.has(p.id)) return hiRes.get(p.id);
  hiRes.set(p.id, null);
  loader.load(`cards/${p.id}.webp`, (t) => {
    hiRes.set(p.id, prepTexture(t));
    if (soloFor === i) applySoloTexture(i);
  });
  return null;
}
let soloFor = -1;
function applySoloTexture(i) {
  const t = soloTexture(i);
  const u = soloMat.uniforms;
  if (t) {
    u.uMap.value = t;
    u.uRect.value.set(0, 0, 1, 1);
  } else {
    u.uMap.value = wallMat.uniforms.uMap.value;
    const cw = 1 / atlasInfo.cols;
    const ch = 1 / atlasInfo.rows;
    const col = i % atlasInfo.cols;
    const row = Math.floor(i / atlasInfo.cols);
    u.uRect.value.set(col * cw, 1 - (row + 1) * ch, cw, ch);
  }
}

const presentPos = new THREE.Vector3();
const presentQuat = new THREE.Quaternion();
const fwd = new THREE.Vector3();
const right = new THREE.Vector3();
const upv = new THREE.Vector3();
let lastPull = 0;

function placeSolo(i, p) {
  if (p <= 0.001 || i < 0) {
    solo.visible = false;
    hiddenIdx = -1;
    return;
  }
  if (soloFor !== i) {
    soloFor = i;
    applySoloTexture(i);
  }
  solo.visible = true;
  hiddenIdx = featureIdx[i];

  // where the card sits when it's "in your hands"
  camera.getWorldDirection(fwd);
  right.set(1, 0, 0).applyQuaternion(camera.quaternion);
  upv.set(0, 1, 0).applyQuaternion(camera.quaternion);
  const D = 3;
  const vH = 2 * D * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const vW = vH * camera.aspect;
  const narrow = camera.aspect < 0.9;
  let w = narrow ? vW * 0.9 : vW * 0.5;
  if (w / 1.6 > vH * (narrow ? 0.42 : 0.62)) w = vH * (narrow ? 0.42 : 0.62) * 1.6;
  const offX = narrow ? 0 : -vW * 0.15;
  const offY = narrow ? vH * 0.19 : vH * 0.03;
  presentPos.copy(camera.position).addScaledVector(fwd, D).addScaledVector(right, offX).addScaledVector(upv, offY);
  presentQuat.copy(camera.quaternion);

  const e = ease(p);
  const k = featureIdx[i];
  solo.position.lerpVectors(roomPos[k], presentPos, e);
  solo.position.addScaledVector(upv, Math.sin(p * Math.PI) * 0.9);
  solo.quaternion.slerpQuaternions(roomQuat[k], presentQuat, e);
  // a little tilt mid-flight
  solo.rotateZ(Math.sin(p * Math.PI) * -0.12);
  solo.scale.set(lerp(ROOM.w, w, e), lerp(ROOM.h, w / 1.6, e), 1);
}

/* ----------------------------------------------------------------- frame */

let fovNow = 58;
const clock = new THREE.Clock();

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;
  const s = lenis.scroll / vh;
  state.s = s;

  // phases
  const tT = clamp01(s / SEG.tunnel);
  const m = clamp01((s - START.morph) / SEG.morph);
  const settle = sstep(START.settle, START.projects, s);
  const projF = (s - START.projects) / SEG.project;
  state.m = m;
  state.projF = projF;

  if (!reduced && m < 1) spin += dt * 0.035;

  // camera path
  tunnelPose(tT, camPos, camLook);
  if (m > 0) {
    const orbit = reduced ? 0 : Math.sin(time * 0.12) * 0.12;
    overviewPose(orbit, tmpA, tmpB);
    const k = sstep(0, 1, m);
    camPos.lerp(tmpA, k);
    camPos.y += Math.sin(k * Math.PI) * 1.2;
    camLook.lerp(tmpB, k);
  }
  let theta = 0;
  if (settle > 0) {
    if (projF >= 0) {
      const i = Math.min(N - 1, Math.floor(projF));
      const local = projF - i;
      theta = featureTheta[i];
      if (i < N - 1) theta += angleTo(featureTheta[i], featureTheta[i + 1]) * sstep(0.74, 1, local);
    }
    projectPose(theta, tmpA, tmpB);
    camPos.lerp(tmpA, settle);
    camLook.lerp(tmpB, settle);
  }
  // after the last project, rise back up over the room for the contact screen
  const contactK = sstep(START.contact + 0.1, START.contact + 0.9, s);
  if (contactK > 0) {
    overviewPose(reduced ? 0 : theta + Math.sin(time * 0.1) * 0.08, tmpA, tmpB);
    tmpA.y += 2.5;
    tmpB.y -= 2.2; // look down at the lit floor so the text sits on calm ground
    camPos.lerp(tmpA, contactK);
    camLook.lerp(tmpB, contactK);
  }

  // gentle look-around with the mouse
  if (!isTouch && !reduced) {
    mouse.sx += (mouse.x - mouse.sx) * 0.05;
    mouse.sy += (mouse.y - mouse.sy) * 0.05;
  }
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  camera.rotateY(-mouse.sx * 0.05);
  camera.rotateX(mouse.sy * 0.035);
  // ?debug: __wall.follow = [side, height, distance] puts a camera on the walker
  if (window.__wall?.follow) {
    const [side, h, d, lookY = 0.95] = window.__wall.follow;
    const wp = walker.position;
    const hd = walker.heading + side;
    camera.position.set(wp.x + Math.sin(hd) * d, h, wp.z + Math.cos(hd) * d);
    camera.lookAt(wp.x, lookY, wp.z);
  }

  const fov = lerp(lerp(lerp(62, 50, sstep(0, 1, m)), lite ? 56 : 46, settle), lite ? 62 : 52, contactK);
  if (Math.abs(fov - fovNow) > 0.01) {
    fovNow = fov;
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  camera.updateMatrixWorld();

  // pull a card off the wall
  let pull = 0;
  let pi = -1;
  if (projF >= 0) {
    pi = Math.min(N - 1, Math.floor(projF));
    const local = projF - pi;
    const rise = sstep(0.04, 0.34, local);
    const fall = sstep(0.6, 0.78, local);
    pull = rise * (1 - fall);
  }
  if (pull > 0.25 && lastPull <= 0.25) sound.whoosh();
  lastPull = pull;
  placeSolo(pi, pull);
  writeWall(m);

  // room dressing
  const room = sstep(0.35, 1, m);
  sharedUniforms.uRoom.value = room;
  sharedUniforms.uFogNear.value = lerp(5, 16, room);
  sharedUniforms.uFogFar.value = lerp(30, 42, room);
  floor.material.opacity = room;
  floor.visible = room > 0.001;
  walker.setOpacity(room);
  walker.update(dt, room > 0.001);

  // DOM
  hero.style.opacity = String(1 - sstep(0.02, 0.1, s / SEG.tunnel));
  hero.style.visibility = s / SEG.tunnel > 0.12 ? 'hidden' : 'visible';
  let cap = -1;
  if (tT > 0.14 && m < 0.15) cap = 0;
  else if (m >= 0.15 && s < START.about + 0.15) cap = 1;
  else if (s < START.settle + 0.3) cap = -1; // the About panel has the floor
  else if (projF >= -0.1 && contactK < 0.3) cap = 2;
  setCaption(cap);

  const metaOn = pull > 0.72;
  if (pi >= 0) setMeta(pi);
  meta.classList.toggle('on', metaOn);
  caption.classList.toggle('under-meta', metaOn);
  indexEl.classList.toggle('on', indexOpen && (projF >= -0.6 || lite) && contactK < 0.3);
  contactEl.classList.toggle('on', contactK > 0.6);
  if (SEG.about) aboutEl.classList.toggle('on', s > START.about + 0.12 && s < START.settle + 0.05);
  progressBar.style.transform = `scaleX(${clamp01(s / TOTAL)})`;

  if (pointerDirty || !isTouch) {
    pick();
    pointerDirty = false;
  }

  renderer.render(scene, camera);
}

/* ----------------------------------------------------------------- start */

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  // ignore mobile URL-bar height jitter; only re-measure on real changes
  if (Math.abs(h - vh) > 120 || !isTouch) {
    const ratio = lenis.scroll / vh;
    vh = h;
    sizeScroll();
    lenis.resize();
    lenis.scrollTo(ratio * vh, { immediate: true });
  }
}
addEventListener('resize', onResize);

const loaderEl = $('#loader');
const pctEl = loaderEl.querySelector('.loader-pct');
const barEl = loaderEl.querySelector('.loader-bar i');
let shownPct = 0;
let realPct = 0;
const tick = setInterval(() => {
  shownPct = Math.min(realPct, shownPct + 3);
  pctEl.textContent = String(Math.round(shownPct));
  barEl.style.transform = `scaleX(${shownPct / 100})`;
}, 30);

async function loadAtlas() {
  const url = lite ? 'cards/atlas-sm.webp' : 'cards/atlas.webp';
  const res = await fetch(url);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    realPct = total ? Math.min(92, (got / total) * 92) : Math.min(90, realPct + 4);
  }
  const blob = new Blob(chunks, { type: 'image/webp' });
  const bmp = await createImageBitmap(blob, { imageOrientation: 'flipY' });
  const tex = new THREE.Texture(bmp);
  tex.flipY = false; // already flipped by createImageBitmap
  tex.needsUpdate = true;
  return prepTexture(tex);
}

function start(tex) {
  wallMat.uniforms.uMap.value = tex;
  soloMat.uniforms.uMap.value = tex;
  realPct = 100;
  writeWall(0);
  // compile shaders before the curtain lifts
  renderer.compile(scene, camera);
  renderer.setAnimationLoop((t) => {
    lenis.raf(t);
    frame();
  });
  setTimeout(() => {
    clearInterval(tick);
    pctEl.textContent = '100';
    barEl.style.transform = 'scaleX(1)';
    loaderEl.classList.add('done');
    // deep links: ?p=<project id> or #contact
    const want = new URLSearchParams(location.search).get('p');
    if (location.hash === '#contact') jumpTo(TOTAL, true);
    if (window.__wall && new URLSearchParams(location.search).has('at')) jumpTo(Number(new URLSearchParams(location.search).get('at')), true);
    const at = projects.findIndex((p) => p.id === want);
    if (at >= 0) jumpTo(projectScreen(at), true);
  }, 650);
}

loadAtlas()
  .then(start)
  .catch((err) => {
    console.error(err);
    pctEl.textContent = '—';
    loaderEl.querySelector('.loader-mark').insertAdjacentHTML('beforeend', '<small style="font:13px var(--sans);color:var(--muted)">Could not load the wall.</small>');
  });
