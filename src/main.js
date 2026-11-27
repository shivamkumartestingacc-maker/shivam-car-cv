import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ---- Choreography knobs. Car, camera and scene are tuned independently here. ----
const CFG = {
  duration: 6.5,            // total intro length (s)
  speed: 14,                // car speed (m/s), constant the whole time
  enter: { end: 2.4, lead: 10 }, // stage 1: camera starts `lead` m ahead (car off-screen left), eases into tracking
  orbit: {                  // stage 2: camera swings from side to rear around the car
    start: 1.8, end: 6.2,
    fromDeg: 0, toDeg: 90,  // 0 = side view (car moves left -> right), 90 = directly behind
    fromR: 8.5, toR: 8,     // distance from car
    fromH: 1.0, toH: 2.4,   // camera height
  },
  look: { height: 0.6, fromAhead: 0, toAhead: 14, start: 4.0, end: 6.5 }, // aim pushes ahead to reveal the road, once camera is mostly behind
  loader: { end: 2.4 },     // loading % runs over this span, then fades
  fov: 35,
  colors: { bg: 0xecebe8, ground: 0xe4e2de, road: 0x9a9a98, paint: 0xffffff, car: 0xf4f4f2 },
};

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smoother = (x) => x * x * x * (x * (x * 6 - 15) + 10);
const span = (t, a, b) => clamp01((t - a) / (b - a));
const lerp = THREE.MathUtils.lerp;

// ---- Renderer / scene ----
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(CFG.colors.bg);
scene.fog = new THREE.Fog(CFG.colors.bg, 30, 160);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.8;

const camera = new THREE.PerspectiveCamera(CFG.fov, 1, 0.1, 400);

const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 40 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target, new THREE.HemisphereLight(0xffffff, 0xcfcac2, 0.6));

// ---- Road: ground/asphalt follow the car (featureless, so no visible slide); markers repeat. ----
const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: CFG.colors.ground }));
const road = new THREE.Mesh(new THREE.PlaneGeometry(9, 600), new THREE.MeshStandardMaterial({ color: CFG.colors.road, roughness: 0.9 }));
ground.rotation.x = road.rotation.x = -Math.PI / 2;
road.position.y = 0.005;
ground.receiveShadow = road.receiveShadow = true;
scene.add(ground, road);

const paint = new THREE.MeshBasicMaterial({ color: CFG.colors.paint });
const DASH = 8, DASHES = 50;
const dashes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.15, 3), paint, DASHES);
const EDGE = 2, EDGES = 300; // edge lines as short segments so they can wrap with the markers
const edges = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.12, EDGE), paint, EDGES * 2);
const POLE = 24, POLES = 16;  // sparse roadside posts, outside the camera's orbit radius: depth cue + future billboard spots
const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), new THREE.MeshStandardMaterial({ color: 0x8c8c8c }), POLES * 2);
poles.castShadow = true;
scene.add(dashes, edges, poles);

const m = new THREE.Matrix4(), q = new THREE.Quaternion(), flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
function layoutRoad(z) {
  ground.position.z = road.position.z = z + 200;
  const base = (step) => Math.floor(z / step) * step - 3 * step;
  let b = base(DASH);
  for (let i = 0; i < DASHES; i++) dashes.setMatrixAt(i, m.compose(p.set(0, 0.01, b + i * DASH), flat, one));
  b = base(EDGE);
  for (let i = 0; i < EDGES; i++) for (const s of [0, 1])
    edges.setMatrixAt(i * 2 + s, m.compose(p.set(s ? 4.2 : -4.2, 0.01, b + i * EDGE), flat, one));
  b = base(POLE);
  for (let i = 0; i < POLES; i++) for (const s of [0, 1])
    poles.setMatrixAt(i * 2 + s, m.compose(p.set(s ? 10 : -10, 1.2, b + i * POLE), q, one));
  dashes.instanceMatrix.needsUpdate = edges.instanceMatrix.needsUpdate = poles.instanceMatrix.needsUpdate = true;
}

// ---- Car (drives toward +z; placeholder GLB faces -z, so it is turned around) ----
const car = new THREE.Group();
scene.add(car);
const wheels = [];

const gltfLoader = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath('./draco/'));
// ponytail: `.json` = base64-wrapped GLB, only because claude.ai artifacts won't serve .glb. Real hosting uses the .glb.
const modelUrl = window.INTRO_MODEL || './models/car.glb';
const loadModel = async (url) => url.endsWith('.json')
  ? gltfLoader.parseAsync(Uint8Array.from(atob((await (await fetch(url)).json()).glb), (c) => c.charCodeAt(0)).buffer, '')
  : gltfLoader.loadAsync(url);
const loaded = loadModel(modelUrl).then((gltf) => {
  const model = gltf.scene;
  model.rotation.y = Math.PI;
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    if (o.material.name === 'Body_Color') {
      o.material = new THREE.MeshPhysicalMaterial({ color: CFG.colors.car, metalness: 0.2, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.05 });
    }
  });
  for (const n of ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr']) wheels.push(model.getObjectByName(n));
  car.add(model);
});

// ---- Timeline: everything derived from t, so it can be scrubbed and replayed ----
const cam = new THREE.Vector3(), aim = new THREE.Vector3();
function pose(t) {
  const carZ = CFG.speed * t;
  car.position.z = carZ;
  for (const w of wheels) w.rotation.x = -carZ / 0.34; // wheel radius ~0.34m

  const e = 1 - (1 - span(t, 0, CFG.enter.end)) ** 2;   // ease-out: static camera -> tracking
  const ld = CFG.enter.lead * (1 - e);
  const o = smoother(span(t, CFG.orbit.start, CFG.orbit.end));
  const th = THREE.MathUtils.degToRad(lerp(CFG.orbit.fromDeg, CFG.orbit.toDeg, o));
  const R = lerp(CFG.orbit.fromR, CFG.orbit.toR, o);
  cam.set(-R * Math.cos(th), lerp(CFG.orbit.fromH, CFG.orbit.toH, o), carZ + ld - R * Math.sin(th));
  aim.set(0, CFG.look.height, carZ + ld + lerp(CFG.look.fromAhead, CFG.look.toAhead, smoother(span(t, CFG.look.start, CFG.look.end))));
  camera.position.copy(cam);
  camera.lookAt(aim);

  sun.position.set(-6, 12, carZ + 4);
  sun.target.position.set(0, 0, carZ);
  layoutRoad(carZ);

  const lp = span(t, 0, CFG.loader.end);
  pct.textContent = `Loading ${Math.round(lp * 100)}%`;
  fill.style.width = `${lp * 100}%`;
  loader.style.opacity = lp >= 1 ? 0 : 1;
}

// ---- Loop / controls ----
const loader = document.getElementById('loader'), pct = document.getElementById('pct'), fill = document.getElementById('fill');
const scrub = document.getElementById('scrub');
const debug = window.INTRO_DEBUG || new URLSearchParams(location.search).has('debug');
let t = 0, playing = false, last = 0;

function resize() {
  const a = innerWidth / innerHeight;
  camera.aspect = a;
  // keep at least ~60deg horizontal FOV so the car stays framed on narrower windows
  camera.fov = Math.max(CFG.fov, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(30)) / a)));
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
resize();

const replay = () => { t = 0; playing = true; };
document.getElementById('replay').onclick = replay;
addEventListener('keydown', (e) => e.key.toLowerCase() === 'r' && replay());
if (debug) {
  scrub.style.display = 'block';
  scrub.oninput = () => { playing = false; t = scrub.value * CFG.duration; };
}

pose(0);
renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (playing) t += dt;
  if (debug && playing) scrub.value = Math.min(1, t / CFG.duration);
  pose(t);
  renderer.render(scene, camera);
});

// Preload first; the intro clock starts only once assets are ready.
loaded.then(() => { renderer.compile(scene, camera); replay(); });
window.__intro = { CFG, seek: (s) => { playing = false; t = s; }, replay };
