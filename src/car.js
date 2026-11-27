import * as THREE from 'three';

// Code-built luxury SUV (Range Rover-like proportions: 5.0m long, 2.0m wide, 1.9m tall).
// Front faces +z. A few hundred triangles, no downloads, so it runs on any phone.
// To swap in a real model later, return the same { group, wheels, setBrake } shape.

const WHEELBASE = 1.5;   // axle distance from centre
const TIRE_R = 0.4;
const TRACK = 0.86;      // wheel x offset

const extrude = (pts, width, bevel) => {
  const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: width - 2 * bevel, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 10 });
  g.rotateY(-Math.PI / 2);                 // shape x -> world z, extrusion -> world -x
  g.translate((width - 2 * bevel) / 2, 0, 0);
  return g;
};

function bodyShape() {
  const s = new THREE.Shape();
  s.moveTo(-2.45, 0.32);
  for (const cz of [-WHEELBASE, WHEELBASE]) {   // wheel arches
    s.lineTo(cz - 0.47, 0.32);
    s.absarc(cz, TIRE_R, 0.47, Math.PI, 0, true);
    s.lineTo(cz + 0.47, 0.32);
  }
  [[2.40, 0.32], [2.52, 0.50], [2.55, 0.95], [2.50, 1.06], [1.15, 1.16], [-2.35, 1.24], [-2.52, 1.16], [-2.55, 0.55]].forEach(([z, y]) => s.lineTo(z, y));
  const g = new THREE.ExtrudeGeometry(s, { depth: 1.82, bevelEnabled: true, bevelSize: 0.09, bevelThickness: 0.09, bevelSegments: 3, curveSegments: 10 });
  g.rotateY(-Math.PI / 2);
  g.translate(0.91, 0, 0);
  return g;
}

function label(text, w, h, color) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = Math.round(1024 * h / w);
  const x = c.getContext('2d');
  x.fillStyle = color;
  x.font = `600 ${c.height * 0.62}px system-ui, sans-serif`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.letterSpacing = `${c.height * 0.5}px`;
  x.fillText(text, c.width / 2 + c.height * 0.25, c.height / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
}

function blob(w, l) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 8, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.75)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.01;
  return m;
}

export function createCar({ paint = 0x0c0c0e, name = 'SHIVAM' } = {}) {
  const group = new THREE.Group();
  const M = {
    paint: new THREE.MeshPhysicalMaterial({ color: paint, metalness: 0.5, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x040507, metalness: 0.3, roughness: 0.05, envMapIntensity: 1.4 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x9a9a9a, metalness: 1, roughness: 0.3 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.6 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 0.9 }),
    rim: new THREE.MeshStandardMaterial({ color: 0x1c1c1f, metalness: 0.9, roughness: 0.35 }),
    caliper: new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.4 }),
    head: new THREE.MeshBasicMaterial({ color: 0xf4f6ff }),
    tail: new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff0a0a, emissiveIntensity: 1 }),
  };
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); group.add(m); return m; };

  const body = add(bodyShape(), M.paint);
  body.geometry.computeBoundingBox();
  const { min, max } = body.geometry.boundingBox;
  const rear = min.z - 0.004, front = max.z + 0.004;

  // greenhouse (glass) + floating roof slab
  add(extrude([[1.15, 1.16], [0.2, 1.82], [-2.1, 1.85], [-2.33, 1.24]], 1.80, 0.06), M.glass);
  add(extrude([[0.22, 1.81], [-2.12, 1.84], [-2.14, 1.91], [0.08, 1.88]], 1.84, 0.03), M.paint);

  // beltline trim, mirrors
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.02, 0.025, 3.45), M.trim, s * 1.0, 1.18, -0.6).rotation.x = 0.023; // beltline rises toward the rear
    add(new THREE.BoxGeometry(0.1, 0.12, 0.22), M.paint, s * 1.06, 1.3, 0.95);
  }

  // rear: vertical LED tail lamps, hairline light bar, lettering
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.07, 0.44, 0.03), M.tail, s * 0.9, 0.95, rear);
  add(new THREE.BoxGeometry(1.7, 0.018, 0.02), M.tail, 0, 1.13, rear);
  const back = label(name, 0.9, 0.09, '#d9d9d9');
  back.position.set(0, 1.03, rear - 0.01);
  back.rotation.y = Math.PI;
  group.add(back);

  // front: slim LED headlights, dark grille, lettering
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.5, 0.045, 0.02), M.head, s * 0.62, 0.99, front);
  add(new THREE.BoxGeometry(0.95, 0.26, 0.02), M.dark, 0, 0.8, front);
  const nose = label(name, 0.7, 0.07, '#d9d9d9');
  nose.position.set(0, 1.0, front + 0.01);
  group.add(nose);

  // wheels: tire + rim + spokes spin; caliper stays put
  const wheels = [];
  const tireGeo = new THREE.CylinderGeometry(TIRE_R, TIRE_R, 0.27, 28).rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.29, 0.29, 0.28, 28).rotateZ(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(0.02, 0.56, 0.05);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = new THREE.Group();
    w.add(new THREE.Mesh(tireGeo, M.tire), new THREE.Mesh(rimGeo, M.rim));
    for (let k = 0; k < 6; k++) {
      const sp = new THREE.Mesh(spokeGeo, M.trim);
      sp.position.x = sx * 0.142;
      sp.rotation.x = (k * Math.PI) / 6;
      w.add(sp);
    }
    w.position.set(sx * TRACK, TIRE_R, sz * WHEELBASE);
    group.add(w);
    wheels.push(w);
    add(new THREE.BoxGeometry(0.06, 0.16, 0.22), M.caliper, sx * (TRACK - 0.02), TIRE_R + 0.12, sz * WHEELBASE - 0.12);
  }

  group.add(blob(3.2, 6.4));

  return {
    group,
    wheels,
    radius: TIRE_R,
    setBrake: (k) => { M.tail.emissiveIntensity = 0.8 + 0.9 * k; },
  };
}
