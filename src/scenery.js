import * as THREE from 'three';

// Faint sky dome + low-poly roadside trees (chunky faceted blobs, in the spirit of bruno-simon.com).
// Everything is generated in code: no downloads. Trees are instanced and recycled around the car.

const SKY = { horizon: '#ecebe8', top: '#dde5ec', glow: '#f3ece0' }; // keep close to the fog colour: barely-there sky

export function createSky(scene) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { horizon: { value: new THREE.Color(SKY.horizon) }, top: { value: new THREE.Color(SKY.top) }, glow: { value: new THREE.Color(SKY.glow) } },
    vertexShader: 'varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 d; uniform vec3 horizon, top, glow;
      void main(){
        vec3 c = mix(horizon, top, smoothstep(0.0, 0.55, d.y));
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

const PALETTE = ['#9fb27c', '#b4c38c', '#8ca46f', '#c8a96c', '#d6b98a', '#a9b98a'].map((c) => new THREE.Color(c));
const STEP = 7, SLOTS = 34, PER = 2, BLOBS = 3; // a tree slot every 7 m, 2 trees per side per slot, 3 foliage blobs each
const hash = (n) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };

export function createTrees(scene) {
  const count = SLOTS * 2 * PER;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.24, 1, 5), new THREE.MeshLambertMaterial({ color: '#8a6d55', flatShading: true }), count);
  const leaves = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ flatShading: true }), count * BLOBS);
  for (const m of [trunks, leaves]) { m.frustumCulled = false; scene.add(m); }

  const mtx = new THREE.Matrix4(), pos = new THREE.Vector3(), rot = new THREE.Quaternion(), scl = new THREE.Vector3(), eul = new THREE.Euler();
  let lastBase = null;
  return {
    update(z) {
      const base = Math.floor(z / STEP) - 4;
      if (base === lastBase) return; // layout only changes when the car crosses a slot boundary
      lastBase = base;
      let i = 0, j = 0;
      for (let s = 0; s < SLOTS; s++) {
        const slot = base + s;
        for (const side of [-1, 1]) for (let k = 0; k < PER; k++) {
          const seed = slot * 13 + (side > 0 ? 7 : 0) + k * 101;
          const near = k === 0;
          const x = side * (near ? 15 + hash(seed) * 10 : 27 + hash(seed) * 34);   // clear of poles (±10) and bridge legs
          const tz = slot * STEP + hash(seed + 1) * STEP;
          const size = 1.4 + hash(seed + 2) * 1.4;
          const h = size * (1.1 + hash(seed + 3) * 0.6);                            // trunk height
          trunks.setMatrixAt(i++, mtx.compose(pos.set(x, h / 2, tz), rot.identity(), scl.set(1, h, 1)));
          const col = PALETTE[Math.floor(hash(seed + 4) * PALETTE.length)];
          for (let b = 0; b < BLOBS; b++) {
            const r = size * (b === 0 ? 1 : 0.62 + hash(seed + 10 + b) * 0.2);
            const a = hash(seed + 20 + b) * Math.PI * 2, off = b === 0 ? 0 : size * 0.7;
            pos.set(x + Math.cos(a) * off, h + size * 0.55 + (b === 0 ? 0.25 * size : -0.1 * size + hash(seed + 30 + b) * 0.5 * size), tz + Math.sin(a) * off);
            rot.setFromEuler(eul.set(hash(seed + 40 + b) * 3, hash(seed + 50 + b) * 3, 0));
            leaves.setMatrixAt(j, mtx.compose(pos, rot, scl.set(r, r * 0.9, r)));
            leaves.setColorAt(j++, col);
          }
        }
      }
      trunks.instanceMatrix.needsUpdate = leaves.instanceMatrix.needsUpdate = true;
      leaves.instanceColor.needsUpdate = true;
    },
  };
}
