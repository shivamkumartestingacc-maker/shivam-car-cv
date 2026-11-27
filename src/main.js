import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadCar } from './car.js';
import { createBillboards } from './billboards.js';
import { caseStudies } from './content.js';

// ---- Choreography knobs. Car, camera and scene are tuned independently here. ----
const CFG = {
  duration: 5.6,            // total intro length (s)
  speed: 14,                // car speed (m/s), constant the whole time
  enter: { lead: 10 },           // stage 1: camera starts `lead` m ahead (car off-screen left) at rest, then ramps to car speed
  orbit: {                  // stage 2: camera swings from side to rear around the car
    start: 1.8, end: 5.0,   // smootherstep over this span: gentle start, gentle settle
    fromDeg: 0, toDeg: 90,  // 0 = side view (car moves left -> right), 90 = directly behind
    fromR: 8.5, toR: 8,     // distance from car
    fromH: 1.0, toH: 2.4,   // camera height
  },
  look: { height: 0.6, fromAhead: 0, toAhead: 14, start: 3.2, end: 5.4 }, // aim pushes ahead to reveal the road, once camera is mostly behind
  loader: { end: 2.4 },     // loading % runs over this span, then fades
  fov: 35,
  colors: { bg: 0xecebe8, ground: 0xe4e2de, road: 0x9a9a98, paint: 0xffffff },
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
// Dark zebra crossings painted across the road at intervals.
const CROSS = 110, CROSSINGS = 4, BARS = 8;
const zebra = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.55, 3.2), new THREE.MeshBasicMaterial({ color: 0x3a3a3a }), CROSSINGS * BARS);
// Instances are re-laid every frame around the car, so skip culling (their bounds are computed once and go stale).
dashes.frustumCulled = edges.frustumCulled = poles.frustumCulled = zebra.frustumCulled = false;
scene.add(dashes, edges, poles, zebra);
const boards = createBillboards(scene, caseStudies);

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
  b = Math.floor(z / CROSS) * CROSS; // nearest crossing behind the car, then the next ones ahead
  for (let i = 0; i < CROSSINGS; i++) for (let k = 0; k < BARS; k++)
    zebra.setMatrixAt(i * BARS + k, m.compose(p.set(-3.5 + k, 0.011, b + i * CROSS), flat, one));
  dashes.instanceMatrix.needsUpdate = edges.instanceMatrix.needsUpdate = poles.instanceMatrix.needsUpdate = zebra.instanceMatrix.needsUpdate = true;
}

// ---- Car (black, badges removed, SHIVAM plate: see car.js) ----
const car = new THREE.Group();
scene.add(car);
let wheels = [], radius = 0.34;
const loaded = loadCar({ url: window.INTRO_MODEL }).then((c) => { car.add(c.group); wheels = c.wheels; radius = c.radius; });

// ---- Timeline: everything derived from t, so it can be scrubbed and replayed ----
const cam = new THREE.Vector3(), aim = new THREE.Vector3();
function pose(t) {
  const carZ = CFG.speed * t;
  car.position.z = carZ;
  for (const w of wheels) w.rotation.x = -carZ / radius;

  // camera velocity ramps 0 -> car speed with a smootherstep, never moving backwards. The ramp time is chosen so
  // the lead is used up exactly when speeds match: Tr = 2 * lead / speed. (x^6 - 3x^5 + 2.5x^4 = integral of smootherstep)
  const { lead } = CFG.enter, Tr = (2 * lead) / CFG.speed, x = Math.min(t / Tr, 1);
  const ld = lead - CFG.speed * (t - Tr * (x ** 6 - 3 * x ** 5 + 2.5 * x ** 4) - Math.max(0, t - Tr));
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
  boards.update(carZ);

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

// Click a billboard -> `portfolio:open` with its case-study id (the overlay deck hooks in here).
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
renderer.domElement.addEventListener('click', (e) => {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const id = ray.intersectObjects(boards.panels)[0]?.object.userData.id;
  if (id) dispatchEvent(new CustomEvent('portfolio:open', { detail: { id } }));
});

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
loaded.then(() => { renderer.compile(scene, camera); renderer.render(scene, camera); replay(); }); // warm shaders + shadow map first
window.__intro = { CFG, get cam() { return +camera.position.z.toFixed(2); }, seek: (s) => { playing = false; t = s; }, replay };
