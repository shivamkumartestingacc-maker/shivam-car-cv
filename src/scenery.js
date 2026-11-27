import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Faint sky dome, leaf-card trees (cherry blossom + green), falling petals, benches with street lamps.
// Everything is generated in code: no downloads. Trees are instanced and recycled around the car.

const SKY = { horizon: '#ecebe8', top: '#b3cfeb', glow: '#f3ece0' }; // soft blue overhead, fading to the fog colour at the horizon

export function createSky(scene) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { horizon: { value: new THREE.Color(SKY.horizon) }, top: { value: new THREE.Color(SKY.top) }, glow: { value: new THREE.Color(SKY.glow) } },
    vertexShader: 'varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 d; uniform vec3 horizon, top, glow;
      void main(){
        vec3 c = mix(horizon, top, smoothstep(0.0, 0.28, d.y));
        c = mix(c, glow, 0.6 * pow(max(dot(d, normalize(vec3(-0.4, 0.12, 1.0))), 0.0), 8.0)); // soft warm patch ahead
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), mat);
  dome.renderOrder = -10;
  scene.add(dome);
  return { update: (camera) => dome.position.copy(camera.position) };
}


// ---------- Leaf-card trees (bruno-simon.com style: canopies built from many small square leaves) ----------
const rng = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const hash = (n) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
const KINDS = {
  cherry: { leaf: '#f28aab', petals: ['#f9c4d4', '#f4a3bd', '#ee8fae', '#fbd9e4'] },
  green: { leaf: '#93c25c', petals: ['#a8cf6f', '#8bbb55', '#c2de8a', '#7aa84a'] },
};

// One tree template: trunk + branches (one geometry) and a canopy of leaf quads (another).
// Leaf normals point out of their cluster centre, so the canopy shades as soft round puffs; vertex colours darken the inside.
function treeTemplate(seed) {
  const r = rng(seed), up = new THREE.Vector3(0, 1, 0);
  const wood = [];
  const limb = (a, b, r0, r1) => {
    const d = new THREE.Vector3().subVectors(b, a), g = new THREE.CylinderGeometry(r1, r0, d.length(), 6, 1);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, d.clone().normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    wood.push(g);
  };
  const mid = new THREE.Vector3((r() - 0.5) * 0.6, 1.6 + r() * 0.5, (r() - 0.5) * 0.6);
  const top = new THREE.Vector3((r() - 0.5) * 0.9, 3.0 + r() * 0.6, (r() - 0.5) * 0.9);
  limb(new THREE.Vector3(), mid, 0.3, 0.22);
  limb(mid, top, 0.22, 0.15);

  const pos = [], nrm = [], col = [];
  const q = new THREE.Quaternion(), e = new THREE.Euler(), u = new THREE.Vector3(), v = new THREE.Vector3(), p = new THREE.Vector3(), n = new THREE.Vector3();
  const clusters = 4 + Math.floor(r() * 2);
  for (let c = 0; c < clusters; c++) {
    const a = (c / clusters) * Math.PI * 2 + r();
    const rad = 1.1 + r() * 0.8;
    const centre = new THREE.Vector3(top.x + Math.cos(a) * (0.9 + r() * 0.9), top.y + 0.6 + r() * 1.3, top.z + Math.sin(a) * (0.9 + r() * 0.9));
    limb(top, centre.clone().lerp(top, 0.35), 0.13, 0.07);
    const leaves = Math.round(150 * rad);
    for (let k = 0; k < leaves; k++) {
      n.set(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize();
      p.copy(n).multiplyScalar(rad * (0.72 + r() * 0.3)).add(centre);
      q.setFromEuler(e.set(r() * 6.3, r() * 6.3, r() * 6.3));
      u.set(0.19, 0, 0).applyQuaternion(q); v.set(0, 0.19, 0).applyQuaternion(q);
      const shade = 0.5 + 0.55 * (n.y * 0.5 + 0.5) + (r() - 0.5) * 0.15; // darker underneath, lighter on top
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) {
        pos.push(p.x + u.x * su + v.x * sv, p.y + u.y * su + v.y * sv, p.z + u.z * su + v.z * sv);
        nrm.push(n.x, n.y, n.z);
        col.push(shade, shade, shade);
      }
    }
  }
  const canopy = new THREE.BufferGeometry();
  canopy.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  canopy.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  canopy.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return { canopy, wood: mergeGeometries(wood) };
}

const STEP = 15, SLOTS = 16, TEMPLATES = [11, 29, 47]; // a tree slot every 15 m per side, near + far row

export function createTrees(scene) {
  const max = SLOTS * 2 * 2;
  const leafMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const woodMat = new THREE.MeshLambertMaterial({ color: '#6b4a3c', flatShading: true });
  const sets = TEMPLATES.map((seed) => {
    const t = treeTemplate(seed);
    const leaves = new THREE.InstancedMesh(t.canopy, leafMat, max), wood = new THREE.InstancedMesh(t.wood, woodMat, max);
    for (const m of [leaves, wood]) { m.frustumCulled = false; scene.add(m); }
    return { leaves, wood };
  });
  // fallen-petal patches under cherry trees
  const patch = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d'), r = rng(3);
    for (let i = 0; i < 300; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 118, s = 3 + r() * 4;
      x.globalAlpha = 0.4 + r() * 0.5; x.fillStyle = KINDS.cherry.petals[Math.floor(r() * 4)];
      x.save(); x.translate(128 + Math.cos(a) * d, 128 + Math.sin(a) * d); x.rotate(r() * 3); x.fillRect(-s / 2, -s / 2, s, s); x.restore();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const ground = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: patch, transparent: true, depthWrite: false }), max);
  ground.frustumCulled = false;
  ground.renderOrder = -1;
  scene.add(ground);

  const mtx = new THREE.Matrix4(), pos = new THREE.Vector3(), rot = new THREE.Quaternion(), scl = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tint = new THREE.Color();
  const colours = { cherry: new THREE.Color(KINDS.cherry.leaf), green: new THREE.Color(KINDS.green.leaf) };
  let lastBase = null;
  return {
    update(z) {
      const base = Math.floor(z / STEP) - 2;
      if (base === lastBase) return; // trees are static: re-lay only when the car crosses a slot
      lastBase = base;
      const used = sets.map(() => 0);
      let g = 0;
      for (let s = 0; s < SLOTS; s++) for (const side of [-1, 1]) for (const near of [true, false]) {
        const seed = (base + s) * 13 + (side > 0 ? 7 : 0) + (near ? 0 : 101);
        const k = Math.floor(hash(seed + 4) * sets.length), cherry = hash(seed + 5) < 0.55;
        const size = (near ? 1.0 : 1.25) + hash(seed + 2) * 0.35;
        pos.set(side * (near ? 16 + hash(seed) * 9 : 30 + hash(seed) * 28), 0, (base + s) * STEP + hash(seed + 1) * STEP);
        rot.setFromAxisAngle(up, hash(seed + 3) * 6.3);
        mtx.compose(pos, rot, scl.setScalar(size));
        const set = sets[k], i = used[k]++;
        set.leaves.setMatrixAt(i, mtx);
        set.wood.setMatrixAt(i, mtx);
        set.leaves.setColorAt(i, tint.copy(colours[cherry ? 'cherry' : 'green']).offsetHSL((hash(seed + 6) - 0.5) * 0.04, 0, (hash(seed + 7) - 0.5) * 0.08));
        if (cherry) ground.setMatrixAt(g++, mtx.compose(pos.setY(0.02), rot, scl.set(size * 6, 1, size * 6)));
      }
      sets.forEach((set, k) => {
        set.leaves.count = set.wood.count = used[k];
        set.leaves.instanceMatrix.needsUpdate = set.wood.instanceMatrix.needsUpdate = true;
        if (set.leaves.instanceColor) set.leaves.instanceColor.needsUpdate = true;
      });
      ground.count = g;
      ground.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------- Falling petals and leaves ----------
export function createPetals(scene, count = 420) {
  const geo = new THREE.BufferGeometry();
  const P = new Float32Array(count * 3), C = new Float32Array(count * 3), seedA = new Float32Array(count);
  const pink = KINDS.cherry.petals.map((h) => new THREE.Color(h)), green = KINDS.green.petals.map((h) => new THREE.Color(h));
  for (let i = 0; i < count; i++) {
    const col = (i % 5 === 0 ? green : pink)[i % 4];
    C.set([col.r, col.g, col.b], i * 3);
    seedA[i] = Math.random() * 100;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.16, vertexColors: true })); // square confetti, like the reference
  pts.frustumCulled = false;
  scene.add(pts);
  const spawn = (i, z, anyHeight) => {
    const side = Math.random() < 0.5 ? -1 : 1;
    P[i * 3] = side * (Math.random() < 0.3 ? Math.random() * 14 : 14 + Math.random() * 22); // mostly near the trees, some drift over the road
    P[i * 3 + 1] = anyHeight ? Math.random() * 9 : 7 + Math.random() * 3;
    P[i * 3 + 2] = z - 10 + Math.random() * 110;
  };
  let init = false, time = 0;
  return {
    update(dt, z) {
      if (!init) { for (let i = 0; i < count; i++) spawn(i, z, true); init = true; }
      time += dt;
      for (let i = 0; i < count; i++) {
        const s = seedA[i];
        P[i * 3] += Math.sin(time * 1.3 + s) * 0.6 * dt + 0.25 * dt;   // flutter + light breeze
        P[i * 3 + 1] -= (0.55 + (s % 1) * 0.5) * dt;
        P[i * 3 + 2] += Math.cos(time * 0.9 + s) * 0.4 * dt;
        if (P[i * 3 + 1] < 0 || P[i * 3 + 2] < z - 15 || P[i * 3 + 2] > z + 110) spawn(i, z, P[i * 3 + 1] >= 0);
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

// ---------- Benches with street lamps, between billboards ----------
function benchAndLamp() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#9a6440', roughness: 0.8 });
  const iron = new THREE.MeshStandardMaterial({ color: '#2c2f36', roughness: 0.5, metalness: 0.6 });
  const box = (w, h, d, m, x, y, z, rx = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.rotation.x = rx; b.castShadow = true; g.add(b); };
  for (let k = 0; k < 3; k++) box(1.9, 0.05, 0.13, wood, 0, 0.47, -0.2 + k * 0.15);           // seat slats (bench faces +z)
  for (let k = 0; k < 3; k++) box(1.9, 0.12, 0.04, wood, 0, 0.66 + k * 0.16, -0.34, -0.12);   // backrest
  for (const sx of [-0.8, 0.8]) { box(0.06, 0.47, 0.06, iron, sx, 0.235, 0.12); box(0.06, 0.95, 0.06, iron, sx, 0.47, -0.3, -0.12); box(0.06, 0.05, 0.5, iron, sx, 0.44, -0.08); }
  // lamp: pole, lantern, warm bulb + soft glow
  const lamp = new THREE.Group();
  lamp.position.set(1.7, 0, -0.2);
  const cyl = (r1, r2, h, y) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 10), iron); m.position.y = y; m.castShadow = true; lamp.add(m); };
  cyl(0.14, 0.18, 0.3, 0.15); cyl(0.05, 0.06, 3.6, 1.95); cyl(0.2, 0.12, 0.12, 3.82); cyl(0.04, 0.2, 0.18, 4.3);
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.32, 0.26), new THREE.MeshBasicMaterial({ color: '#ffe7b0' }));
  bulb.position.y = 4.04;
  lamp.add(bulb);
  const glowC = document.createElement('canvas'); glowC.width = glowC.height = 64;
  const gx = glowC.getContext('2d'), grad = gx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,225,160,0.85)'); grad.addColorStop(1, 'rgba(255,225,160,0)');
  gx.fillStyle = grad; gx.fillRect(0, 0, 64, 64);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(glowC), blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.position.y = 4.04; glow.scale.setScalar(1.6);
  lamp.add(glow);
  g.add(lamp);
  return g;
}

// Benches (most with a street lamp) along both sidewalks: roughly every 30 m, irregular, so the park feels natural.
export function createBenches(scene, { step = 30, count = 10, start = 30 } = {}) {
  const pool = Array.from({ length: count }, () => { const g = benchAndLamp(); scene.add(g); return g; });
  return {
    update(z) {
      const first = Math.max(0, Math.floor((z - start) / step) - 1);
      pool.forEach((g, k) => {
        const n = first + k, side = hash(n * 3.1) < 0.5 ? -1 : 1;
        g.position.set(side * 7.4, 0, start + n * step + (hash(n * 5.7) - 0.5) * step * 0.6);
        g.rotation.y = -side * Math.PI / 2; // seat faces the road
        g.children[g.children.length - 1].visible = hash(n * 9.3) < 0.7; // lamp beside ~70% of benches
      });
    },
  };
}

// ---------- Faint city skyline far out on both sides ----------
// Layered building silhouettes painted in code; far layers paler. They travel with the car, so they read as distant backdrop.
const SKYLINE = [ // [distance from road, height, colour, opacity]
  [170, 50, '#cdd3db', 0.4],
  [130, 36, '#b9c2cc', 0.45],
];

function skylineTexture(seed, colour) {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 256;
  const x = c.getContext('2d'), r = rng(seed);
  const grad = x.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, colour + '66'); grad.addColorStop(1, colour);   // tops fade into the haze, bases stronger
  x.fillStyle = grad;
  let px = 0;
  while (px < 2048) {
    const w = 30 + r() * 90, h = 50 + r() * 150 * (r() < 0.15 ? 1.3 : 1);
    x.fillRect(px, 256 - h, w, h);
    if (r() < 0.3) x.fillRect(px + w * 0.25, 256 - h - 14 - r() * 18, w * 0.5, 20);       // stepped top
    if (r() < 0.12) x.fillRect(px + w / 2 - 2, 256 - h - 40 - r() * 30, 4, 60);          // antenna
    if (r() < 0.06) { x.beginPath(); x.moveTo(px, 256 - h); x.lineTo(px + w / 2, 256 - h - 60); x.lineTo(px + w, 256 - h); x.fill(); } // spire
    px += w + (r() < 0.25 ? r() * 20 : -r() * 10);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

export function createSkyline(scene) {
  const LEN = 700, strips = [];
  SKYLINE.forEach(([dist, h, colour, opacity], k) => {
    for (const side of [-1, 1]) {
      const tex = skylineTexture(7 + k * 31 + (side > 0 ? 3 : 0), colour);
      tex.repeat.x = 2;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(LEN, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, fog: false }));
      m.rotation.y = side * -Math.PI / 2;          // face the road
      m.position.set(side * dist, h / 2 - 2, 0);
      m.renderOrder = -5 + k;                      // far layer first
      scene.add(m);
      strips.push(m);
    }
  });
  return { update: (z) => { for (const m of strips) m.position.z = z + 150; } };
}
