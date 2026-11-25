// A man strolling around the room. The body is models/man.glb (the Ready
// Player Me avatar from the three.js repo); the motion-captured Walk and Idle
// come from the repo's "Soldier" sample, retargeted onto his skeleton by
// scripts/retarget.mjs into models/walk-anims.json. He moves at exactly the
// speed his feet travel so nothing slides, and every so often slows down,
// stops to look at the wall for a few seconds, then carries on.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const TAU = Math.PI * 2;
// tone = brightness kept, sat = colour kept (a hint of the red waistcoat survives)
const CHARCOAL = { tone: 0.3, sat: 0.14 };
const HAT = { tone: 0.22, sat: 0.08 };

// Clone each material, tint the tan suit and hat charcoal, and set up shadows.
// Shared with scripts/portrait.html so the portrait matches the walker.
export function dressModel(model) {
  const mats = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.frustumCulled = false; // skinned bounds don't follow the animation
    const m = o.material.clone();
    m.roughness = 0.78;
    m.metalness = 0;
    const dye = /Outfit_(Top|Bottom)/.test(m.name) ? CHARCOAL : /Headwear/.test(m.name) ? HAT : null;
    if (dye) {
      m.roughness = 0.86;
      m.onBeforeCompile = (shader) => {
        shader.uniforms.uTone = { value: dye.tone };
        shader.uniforms.uSat = { value: dye.sat };
        shader.fragmentShader = shader.fragmentShader
          .replace('void main() {', 'uniform float uTone;\nuniform float uSat;\nvoid main() {')
          .replace(
            '#include <map_fragment>',
            `#include <map_fragment>
            float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
            diffuseColor.rgb = mix(vec3(lum), diffuseColor.rgb, uSat) * uTone;`
          );
      };
      m.customProgramCacheKey = () => `dye-${dye.tone}-${dye.sat}`;
    }
    o.material = m;
    mats.push(m);
  });
  return mats;
}

export function clipsFromJson(anims) {
  return anims.clips.map(
    (c) =>
      new THREE.AnimationClip(
        c.name,
        c.duration,
        c.tracks.map((t) =>
          t.type === 'quaternion'
            ? new THREE.QuaternionKeyframeTrack(t.name, t.times, t.values)
            : new THREE.VectorKeyframeTrack(t.name, t.times, t.values)
        )
      )
  );
}
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,0.5)');
  grd.addColorStop(0.45, 'rgba(0,0,0,0.22)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Walk the clip once with the character standing still and measure how fast a
// planted foot moves backwards. That's the speed the body has to travel at.
function measureWalk(model, clip) {
  const mixer = new THREE.AnimationMixer(model);
  const action = mixer.clipAction(clip);
  action.play();
  let foot = null;
  model.traverse((o) => {
    if (!foot && o.isBone && /LeftFoot$/.test(o.name)) foot = o;
  });
  if (!foot) return { speed: 1.4, forward: 1 };
  const steps = 90;
  const dt = clip.duration / steps;
  const p = new THREE.Vector3();
  const samples = [];
  for (let i = 0; i <= steps; i++) {
    mixer.setTime(i * dt);
    model.updateMatrixWorld(true);
    foot.getWorldPosition(p);
    samples.push(p.clone());
  }
  const minY = Math.min(...samples.map((s) => s.y));
  let sum = 0;
  let n = 0;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].y < minY + 0.025 && samples[i - 1].y < minY + 0.025) {
      sum += (samples[i].z - samples[i - 1].z) / dt;
      n++;
    }
  }
  action.stop();
  mixer.uncacheRoot(model);
  const v = n ? sum / n : -1.4;
  // a planted foot slides opposite to the direction of travel
  return { speed: Math.abs(v) || 1.4, forward: v < 0 ? 1 : -1 };
}

export function makeWalker() {
  const root = new THREE.Group(); // position + heading
  const lights = new THREE.Group();

  const hemi = new THREE.HemisphereLight(0xfff0dc, 0x2b2119, 1.25);
  const key = new THREE.DirectionalLight(0xffe2bd, 2.6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -2.2, right: 2.2, top: 2.6, bottom: -1, near: 0.5, far: 24 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 5;
  const rim = new THREE.DirectionalLight(0xc9d6ff, 1.4);
  lights.add(hemi, key, key.target, rim, rim.target);

  // soft real shadow on the floor, plus a dark contact patch under the feet
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.ShadowMaterial({ opacity: 0.42, depthWrite: false }));
  catcher.rotation.x = -Math.PI / 2;
  catcher.position.y = 0.006;
  catcher.receiveShadow = true;
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 1.1),
    new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false })
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.01;
  const ground = new THREE.Group();
  ground.add(catcher, contact);

  const group = new THREE.Group();
  group.add(root, ground, lights);

  let mixer = null;
  let walk = null;
  let idle = null;
  let walkSpeed = 1.1; // metres per second at full walk
  let headingOffset = 0;
  const mats = [];

  const toClip = (c) =>
    new THREE.AnimationClip(
      c.name,
      c.duration,
      c.tracks.map((t) =>
        t.type === 'quaternion'
          ? new THREE.QuaternionKeyframeTrack(t.name, t.times, t.values)
          : new THREE.VectorKeyframeTrack(t.name, t.times, t.values)
      )
    );

  const ready = Promise.all([
    new GLTFLoader().loadAsync('models/man.glb'),
    fetch('models/walk-anims.json').then((r) => r.json()),
  ])
    .then(([gltf, anims]) => {
      const model = gltf.scene;
      mats.push(...dressModel(model));

      const clips = anims.clips.map(toClip);
      const clip = (name) => clips.find((a) => a.name === name);
      const measured = measureWalk(model, clip('Walk'));
      headingOffset = measured.forward > 0 ? 0 : Math.PI;
      model.rotation.y = headingOffset;
      root.add(model);

      mixer = new THREE.AnimationMixer(model);
      walk = mixer.clipAction(clip('Walk'));
      idle = mixer.clipAction(clip('Idle'));
      // play the mocap a touch slower than recorded: an unhurried gallery pace
      walk.timeScale = 0.88;
      walkSpeed = measured.speed * walk.timeScale;
      walk.play();
      idle.play();
      idle.setEffectiveWeight(0);
      applyOpacity();
    })
    .catch((err) => console.warn('Walker model failed to load', err));

  // path: a loose loop around the room that drifts in and out
  let a = 0.6; // where on the loop
  const pathPoint = (t, out) => {
    const r = 6.2 + Math.sin(t * 2.3 + 0.7) * 1.1 + Math.sin(t * 5.1) * 0.25;
    return out.set(Math.sin(t) * r, 0, Math.cos(t) * r);
  };
  const pNow = new THREE.Vector3();
  const pNext = new THREE.Vector3();

  let heading = 0;
  let gait = 1; // 1 walking, 0 standing
  let mode = 'walk';
  let timer = 7 + Math.random() * 5;

  function update(dt, active) {
    if (!active || !mixer) return;

    // walk for a while, pause to look at the wall, walk on
    timer -= dt;
    if (timer <= 0) {
      if (mode === 'walk') {
        mode = 'look';
        timer = 3.2 + Math.random() * 2.2;
      } else {
        mode = 'walk';
        timer = 9 + Math.random() * 8;
      }
    }
    gait = damp(gait, mode === 'walk' ? 1 : 0, 2.6, dt);
    walk.setEffectiveWeight(gait);
    idle.setEffectiveWeight(1 - gait);
    // keep the two cycles in step so the blend doesn't shuffle
    walk.timeScale = 0.88 * (0.55 + 0.45 * gait);
    mixer.update(dt);

    // advance along the path by exactly the distance the feet cover
    const dist = walkSpeed * (walk.timeScale / 0.88) * gait * gait * dt;
    pathPoint(a, pNow);
    pathPoint(a + 0.001, pNext);
    const perRad = pNow.distanceTo(pNext) / 0.001;
    a += dist / perRad;
    pathPoint(a, pNow);
    pathPoint(a + 0.01, pNext);
    root.position.copy(pNow);

    // face where you're going; when stopped, turn a little towards the wall
    const travel = Math.atan2(pNext.x - pNow.x, pNext.z - pNow.z);
    const towardWall = Math.atan2(pNow.x, pNow.z);
    const target = travel + angleDiff(travel, towardWall) * 0.75 * (1 - gait);
    heading += angleDiff(heading, target) * (1 - Math.exp(-4 * dt));
    root.rotation.y = heading;

    ground.position.set(pNow.x, 0, pNow.z);
    key.position.set(pNow.x + 2.5, 8, pNow.z + 3);
    key.target.position.copy(pNow);
    rim.position.set(pNow.x - Math.sin(heading) * 4, 3.5, pNow.z - Math.cos(heading) * 4);
    rim.target.position.copy(pNow);
  }

  let opacity = 0;
  function applyOpacity() {
    for (const m of mats) {
      m.opacity = opacity;
      m.transparent = opacity < 0.999;
    }
    catcher.material.opacity = 0.42 * opacity;
    contact.material.opacity = opacity;
  }
  function setOpacity(o) {
    const visible = o > 0.01;
    group.visible = visible;
    if (Math.abs(o - opacity) > 0.001) {
      opacity = o;
      applyOpacity();
    }
  }

  // kick off with a real heading so the first frame isn't snapped
  pathPoint(a, pNow);
  pathPoint(a + 0.01, pNext);
  heading = Math.atan2(pNext.x - pNow.x, pNext.z - pNow.z);

  return { root: group, lights: new THREE.Group(), update, setOpacity, ready, position: root.position, get heading() { return heading; }, get mode() { return mode; } };
}
