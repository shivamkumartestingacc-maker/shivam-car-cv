import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// Loads the placeholder sports car (three.js example Ferrari 458, Draco-compressed, 1.2 MB),
// restyles it satin black with the badges blacked out, and returns { group, wheels, radius, setBrake }.
// Any other GLB car works if it has four nodes named wheel_fl / wheel_fr / wheel_rl / wheel_rr.

const loader = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath('./draco/'));

// ponytail: `.json` = base64-wrapped GLB, only because claude.ai artifacts won't serve .glb. Real hosting uses the .glb.
const fetchModel = async (url) => url.endsWith('.json')
  ? loader.parseAsync(Uint8Array.from(atob((await (await fetch(url)).json()).glb), (c) => c.charCodeAt(0)).buffer, '')
  : loader.loadAsync(url);

function plate(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 112;
  const x = c.getContext('2d');
  x.fillStyle = '#f4f1ea'; x.fillRect(0, 0, 512, 112);
  x.fillStyle = '#111'; x.font = '700 64px system-ui, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.letterSpacing = '14px';
  x.fillText(text, 263, 60);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.114), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 }));
}

// Brand badges are welded into the chrome mesh: drop just the triangles inside these boxes (car space, front = +z).
const BADGES = [
  new THREE.Box3(new THREE.Vector3(-0.1, 0.6, -2.4), new THREE.Vector3(0.1, 0.92, -2.0)), // rear horse
  new THREE.Box3(new THREE.Vector3(-0.1, 0.5, 2.0), new THREE.Vector3(0.1, 0.66, 2.4)),   // nose badge
];
function cutBadges(mesh) {
  const g = mesh.geometry, pos = g.attributes.position, idx = g.index;
  if (!idx) return;
  const v = new THREE.Vector3(), c = new THREE.Vector3(), keep = [];
  for (let i = 0; i < idx.count; i += 3) {
    c.set(0, 0, 0);
    for (let k = 0; k < 3; k++) c.add(v.fromBufferAttribute(pos, idx.getX(i + k)).applyMatrix4(mesh.matrixWorld));
    c.divideScalar(3);
    if (!BADGES.some((b) => b.containsPoint(c))) keep.push(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
  }
  g.setIndex(keep);
}

export async function loadCar({ url = './models/car.glb', paint = 0x101113, name = 'SHIVAM' } = {}) {
  const gltf = await fetchModel(url);
  const model = gltf.scene;
  model.rotation.y = Math.PI; // model faces -z; the scene drives toward +z

  const satin = new THREE.MeshPhysicalMaterial({ color: paint, metalness: 0.25, roughness: 0.48, clearcoat: 0.3, clearcoatRoughness: 0.35 });
  const blackout = new THREE.MeshStandardMaterial({ color: 0x0b0b0b, metalness: 0.4, roughness: 0.5 });
  const cabin = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.7 });
  const gunmetal = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, metalness: 0.8, roughness: 0.4 });
  const darkChrome = new THREE.MeshStandardMaterial({ color: 0x4a4a4c, metalness: 1, roughness: 0.3 });
  const swap = { Body_Color: satin, Ferrari_Yellow: blackout, _0098_DodgerBlue: blackout, plastic_gray: blackout, metal_gray: gunmetal, Leather: cabin, Interior_light: cabin, Interior_dark: cabin, Carpet: cabin };
  let tail;
  model.updateMatrixWorld(true);
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    const n = o.material.name;
    if (swap[n]) o.material = swap[n];
    else if (n === 'Taillight_Glass') {
      tail ||= Object.assign(o.material.clone(), { color: new THREE.Color(0x3a0000), emissive: new THREE.Color(0xff1010) });
      o.material = tail;
    } else if (n === 'metal_chrome') { cutBadges(o); o.material = darkChrome; }
  });

  const wheels = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'].map((n) => model.getObjectByName(n));
  const radius = new THREE.Box3().setFromObject(wheels[0]).getSize(new THREE.Vector3()).y / 2;

  const group = new THREE.Group();
  group.add(model);
  const box = new THREE.Box3().setFromObject(model);
  const tag = plate(name);
  tag.position.set(0, 0.42, box.min.z - 0.003);
  tag.rotation.y = Math.PI;
  group.add(tag);

  return {
    group,
    wheels,
    radius,
    setBrake: (k) => { if (tail) tail.emissiveIntensity = 0.7 + 0.8 * k; },
  };
}
