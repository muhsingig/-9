// Retargets the Walk and Idle mocap from a Mixamo-rigged GLB (the three.js
// "Soldier" sample) onto models/man.glb (the three.js Ready Player Me avatar).
//
// The two rigs share bone names but not bone axes or rest pose (T-pose vs
// A-pose), so local rotations can't be copied. Instead:
//   1. Pose-match: bend the target's rest pose so every bone points the same
//      way as the source's rest pose.
//   2. For each frame, take each source bone's world rotation relative to its
//      rest, apply that same world-space change to the matched target bone,
//      and convert back to the target's local space.
// Hip travel is scaled to the target's hip height. Output: models/walk-anims.json
//
//   node scripts/retarget.mjs path/to/Soldier.glb
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Matrix4, Quaternion, Vector3 } from 'three';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcFile = process.argv[2];
if (!srcFile) throw new Error('Usage: node scripts/retarget.mjs path/to/Soldier.glb');
const dstFile = path.join(root, 'models', 'man.glb');

function readGlb(file) {
  const b = fs.readFileSync(file);
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8;
  return { json, bin: b.subarray(binStart) };
}
const COMPS = { SCALAR: 1, VEC3: 3, VEC4: 4 };
function accessor(glb, i) {
  const a = glb.json.accessors[i];
  const bv = glb.json.bufferViews[a.bufferView];
  const n = a.count * COMPS[a.type];
  const off = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const out = new Float32Array(n);
  for (let k = 0; k < n; k++) out[k] = glb.bin.readFloatLE(off + k * 4);
  return out;
}

const strip = (n) => n.replace(/^mixamorig:?/, '');

// node tree with rest TRS and parent links, keyed by stripped bone name
function rig(glb) {
  const nodes = glb.json.nodes.map((n, i) => ({
    i,
    name: strip(n.name || `node${i}`),
    t: new Vector3(...(n.translation || [0, 0, 0])),
    r: new Quaternion(...(n.rotation || [0, 0, 0, 1])),
    s: new Vector3(...(n.scale || [1, 1, 1])),
    children: n.children || [],
    parent: null,
  }));
  nodes.forEach((n) => n.children.forEach((c) => (nodes[c].parent = n)));
  const byName = new Map(nodes.map((n) => [n.name, n]));
  return { nodes, byName };
}

// world matrices for a pose: localRot(node) -> Quaternion, localPos(node) -> Vector3
function worldPose(r, localRot, localPos) {
  const world = new Map();
  const visit = (n, parentM) => {
    const m = new Matrix4().compose(localPos(n), localRot(n), n.s);
    const w = parentM ? parentM.clone().multiply(m) : m;
    world.set(n, w);
    n.children.forEach((c) => visit(r.nodes[c], w));
  };
  r.nodes.filter((n) => !n.parent).forEach((n) => visit(n, null));
  return world;
}
const rotOf = (m) => {
  const p = new Vector3();
  const q = new Quaternion();
  const s = new Vector3();
  m.decompose(p, q, s);
  return q;
};
const posOf = (m) => new Vector3().setFromMatrixPosition(m);

const src = readGlb(srcFile);
const dst = readGlb(dstFile);
const S = rig(src);
const T = rig(dst);

const shared = [...S.byName.keys()].filter((n) => T.byName.has(n) && /Hips|Spine|Neck|Head|Shoulder|Arm|Hand|Leg|Foot|Toe/.test(n));
const sharedSet = new Set(shared);

// rest poses in world space
const sRest = worldPose(S, (n) => n.r, (n) => n.t);
const tRest = worldPose(T, (n) => n.r, (n) => n.t);

// if the rigs face opposite ways, turn the source around first
const side = (r, w) => posOf(w.get(r.byName.get('LeftUpLeg'))).x - posOf(w.get(r.byName.get('RightUpLeg'))).x;
const flip = Math.sign(side(S, sRest)) !== Math.sign(side(T, tRest));
const preRot = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), flip ? Math.PI : 0);
const srcWorldRot = (w, n) => preRot.clone().multiply(rotOf(w.get(n)));
const srcWorldPos = (w, n) => posOf(w.get(n)).applyQuaternion(preRot);

// 1. pose-match the target rest to the source rest, parents first
const prefer = { Hips: 'Spine', Spine2: 'Neck', LeftHand: 'LeftHandMiddle1', RightHand: 'RightHandMiddle1' };
const aimChild = (r, n) => {
  if (prefer[n.name] && r.byName.has(prefer[n.name])) return r.byName.get(prefer[n.name]);
  const kids = n.children.map((c) => r.nodes[c]).filter((c) => sharedSet.has(c.name));
  return kids[0] || null;
};
const matchedWorld = new Map(); // target node -> world matrix in the matched rest
const matchedLocalRot = new Map();
const visitMatch = (n, parentW) => {
  const local = new Matrix4().compose(n.t, n.r, n.s);
  let w = parentW ? parentW.clone().multiply(local) : local;
  if (sharedSet.has(n.name)) {
    const child = aimChild(T, n);
    const sNode = S.byName.get(n.name);
    const sChild = child && S.byName.get(child.name);
    if (child && sChild) {
      const cLocal = new Matrix4().compose(child.t, child.r, child.s);
      const dirT = posOf(w.clone().multiply(cLocal)).sub(posOf(w)).normalize();
      const dirS = srcWorldPos(sRest, sChild).sub(srcWorldPos(sRest, sNode)).normalize();
      const align = new Quaternion().setFromUnitVectors(dirT, dirS);
      const p = new Vector3();
      const q = new Quaternion();
      const s = new Vector3();
      w.decompose(p, q, s);
      w = new Matrix4().compose(p, align.multiply(q), s);
    }
  }
  matchedWorld.set(n, w);
  const parentRot = parentW ? rotOf(parentW) : new Quaternion();
  matchedLocalRot.set(n, parentRot.invert().multiply(rotOf(w)));
  n.children.forEach((c) => visitMatch(T.nodes[c], w));
};
T.nodes.filter((n) => !n.parent).forEach((n) => visitMatch(n, null));

// 2. retarget each clip frame by frame
const sHips = S.byName.get('Hips');
const tHips = T.byName.get('Hips');
const hipScale = posOf(tRest.get(tHips)).y / srcWorldPos(sRest, sHips).y;
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
const FPS = 30;

const clips = [];
for (const anim of src.json.animations.filter((a) => ['Walk', 'Idle'].includes(a.name))) {
  // sample source tracks
  const tracks = new Map(); // `${node.i}:${path}` -> {times, values}
  let duration = 0;
  for (const ch of anim.channels) {
    const s = anim.samplers[ch.sampler];
    const times = accessor(src, s.input);
    duration = Math.max(duration, times[times.length - 1]);
    tracks.set(`${ch.target.node}:${ch.target.path}`, { times, values: accessor(src, s.output) });
  }
  const sample = (node, pathName, t, size) => {
    const tr = tracks.get(`${node.i}:${pathName}`);
    if (!tr) return null;
    const { times, values } = tr;
    let k = 0;
    while (k < times.length - 2 && times[k + 1] < t) k++;
    const a = times[k];
    const b = times[k + 1] ?? a;
    const f = b > a ? Math.min(1, Math.max(0, (t - a) / (b - a))) : 0;
    const v0 = Array.from(values.subarray(k * size, k * size + size));
    const v1 = Array.from(values.subarray((k + 1) * size, (k + 1) * size + size));
    if (size === 4) {
      const q0 = new Quaternion(...v0);
      const q1 = v1.length === 4 ? new Quaternion(...v1) : q0;
      return q0.slerp(q1, f);
    }
    const p0 = new Vector3(...v0);
    return v1.length === 3 ? p0.lerp(new Vector3(...v1), f) : p0;
  };

  const frames = Math.round(duration * FPS);
  const out = new Map(shared.map((n) => [n, { times: [], values: [] }]));
  const hipPos = { times: [], values: [] };
  const restHipT = posOf(matchedWorld.get(tHips));
  const restHipS = srcWorldPos(sRest, sHips);

  for (let f = 0; f <= frames; f++) {
    const t = (f / frames) * duration;
    const sw = worldPose(
      S,
      (n) => sample(n, 'rotation', t, 4) || n.r,
      (n) => sample(n, 'translation', t, 3) || n.t
    );
    // target world rotations: same world-space change as the source bone
    const tWorldRot = new Map();
    const walk = (n, parentRot) => {
      let wr;
      if (sharedSet.has(n.name)) {
        const sn = S.byName.get(n.name);
        const delta = srcWorldRot(sw, sn).multiply(srcWorldRot(sRest, sn).invert());
        wr = delta.multiply(rotOf(matchedWorld.get(n)));
        const local = parentRot.clone().invert().multiply(wr);
        const o = out.get(n.name);
        o.times.push(round(t, 4));
        o.values.push(...local.toArray().map((v) => round(v, 5)));
      } else {
        wr = parentRot.clone().multiply(matchedLocalRot.get(n));
      }
      tWorldRot.set(n, wr);
      n.children.forEach((c) => walk(T.nodes[c], wr));
    };
    T.nodes.filter((n) => !n.parent).forEach((n) => walk(n, new Quaternion()));

    // hip travel, scaled to the new body, in the hips' parent space
    const d = srcWorldPos(sw, sHips).sub(restHipS).multiplyScalar(hipScale);
    const world = restHipT.clone().add(d);
    const parentW = tHips.parent ? matchedWorld.get(tHips.parent) : new Matrix4();
    const local = world.applyMatrix4(parentW.clone().invert());
    hipPos.times.push(round(t, 4));
    hipPos.values.push(...local.toArray().map((v) => round(v, 4)));
  }

  const trackList = shared.map((n) => ({ name: `${n}.quaternion`, type: 'quaternion', ...out.get(n) }));
  trackList.push({ name: 'Hips.position', type: 'vector', ...hipPos });
  clips.push({ name: anim.name, duration: round(duration, 4), tracks: trackList });
}

const outFile = path.join(root, 'models', 'walk-anims.json');
fs.writeFileSync(outFile, JSON.stringify({ target: 'man.glb', hipScale: round(hipScale, 4), flipped: flip, clips }));
console.log(
  `${shared.length} bones, ${flip ? 'flipped source, ' : ''}hip scale ${hipScale.toFixed(3)}; ` +
    clips.map((c) => `${c.name} ${c.duration}s`).join(', ') +
    ` -> ${(fs.statSync(outFile).size / 1024).toFixed(0)} KB`
);
