import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createCar } from './car.js';
import { dock } from './content.js';

// ---- Choreography + look. Every motion below derives from one clock `t`, so it can be scrubbed/replayed. ----
const CFG = {
  duration: 7.5,                               // last moving frame; after this the scene renders only on demand
  car: { startZ: -16, speed: 9, brakeAt: 4.4, stopAt: 6.0 },
  track: { from: 1.2, to: 3.0 },               // camera holds on the floor, then eases into following the car
  orbit: { start: 1.4, end: 5.0, snap: 3,      // snap: 2 = soft, 3-4 = quick middle, firm settle
           fromDeg: -25, toDeg: 90,            // -25 = front three-quarter, 0 = side, 90 = straight behind
           fromR: 10, toR: 9.5, fromH: 9, toH: 2.4 },
  push: { r: 0.9, from: 5.0, to: 7.5 },        // slow push-in once behind the car
  look: { fromH: 0, toH: 1.1, ahead: 12, from: 3.6, to: 5.6 },
  loading: { end: 2.0 },                       // floor counter 0 -> 100 (cinematic, not network time)
  floorFade: { from: 2.6, to: 4.0 },           // red floor -> night
  road: { from: 3.6, to: 5.0 },                // road appears only once the rear is coming round
  dockAt: 5.6,
  colors: { floor: '#c8102e', ink: '#0a0a0a', night: '#0e0c0c', ground: '#151313', road: '#090909', paint: '#efece6', glow: '#ff5a3c' },
};

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const span = (t, a, b) => clamp01((t - a) / (b - a));
const smoother = (x) => x * x * x * (x * (x * 6 - 15) + 10);
const inOut = (x, k) => (x < 0.5 ? (2 * x) ** k / 2 : 1 - (2 - 2 * x) ** k / 2);
const lerp = THREE.MathUtils.lerp;
const C = Object.fromEntries(Object.entries(CFG.colors).map(([k, v]) => [k, new THREE.Color(v)]));

// ---- Renderer: capped pixel ratio, no shadow maps, no post-processing ----
const coarse = matchMedia('(pointer: coarse)').matches;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2));
renderer.toneMapping = THREE.NeutralToneMapping; // keeps the brand red red
document.body.prepend(renderer.domElement);
const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
scene.background = C.floor.clone();
scene.fog = new THREE.Fog(C.floor.clone(), 25, 140);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const ENV = { studio: 0.45, night: 0.25 }; // reflections on the black paint: lit studio -> night

const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 500);
const key = new THREE.DirectionalLight(0xffffff, 1.4);
scene.add(key, key.target, new THREE.HemisphereLight(0xffffff, 0x221a1a, 0.5));

// ---- Helpers ----
const canvasTex = (w, h, draw) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
};
const flat = (w, l, mat, y) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), mat); m.rotation.x = -Math.PI / 2; m.position.y = y; scene.add(m); return m; };
const basic = (o) => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, ...o });
const glowTex = (inner) => canvasTex(256, 256, (x) => {
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, inner); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
});

// ---- Floor: starts as a full red painted floor carrying the loading counter ----
const ground = flat(800, 800, new THREE.MeshBasicMaterial({ color: C.floor.clone() }), 0);
const FONT = '"Anton", Impact, "Arial Narrow", sans-serif';

// Floor lettering is laid along the direction of travel (+z) and read from the side camera.
const floorDecal = (w, l, tex, z, x = 0) => {
  const m = flat(w, l, basic({ map: tex }), 0.004);
  m.rotation.set(-Math.PI / 2, 0, -Math.PI / 2 + 0.18); // canvas right -> +z, canvas up -> away from camera; slight diagonal like painted signage
  m.position.set(x, 0.004, z);
  return m;
};
const drawWord = (x, w, h) => {
  x.clearRect(0, 0, w, h);
  x.fillStyle = CFG.colors.ink;
  x.font = `${h * 0.9}px ${FONT}`;
  x.textBaseline = 'middle';
  x.letterSpacing = `${h * 0.04}px`;
  x.fillText('LOADING', 0, h * 0.54);
};
const word = floorDecal(12, 3, canvasTex(2048, 512, drawWord), 0, 2.4);  // far row
const digitsCanvas = document.createElement('canvas');
digitsCanvas.width = 1024; digitsCanvas.height = 512;
const digitsTex = new THREE.CanvasTexture(digitsCanvas);
digitsTex.colorSpace = THREE.SRGBColorSpace;
digitsTex.anisotropy = aniso;
const digits = floorDecal(7, 3.5, digitsTex, -0.5, -1.9);         // near row; the car drives between and over both
let shownPct = -1;
function drawPct(p) {
  if (p === shownPct) return;
  shownPct = p;
  const x = digitsCanvas.getContext('2d'), { width: w, height: h } = digitsCanvas;
  x.clearRect(0, 0, w, h);
  x.fillStyle = CFG.colors.ink;
  x.font = `${h * 0.95}px ${FONT}`;
  x.textBaseline = 'middle';
  x.fillText(String(p).padStart(3, '0'), 0, h * 0.55);
  x.font = `${h * 0.32}px ${FONT}`;
  x.fillText('%', w * 0.78, h * 0.3);
  digitsTex.needsUpdate = true;
}
const stripe = flat(1.1, 300, basic({ color: C.ink }), 0.003);   // painted band, like gallery floor tape
stripe.position.x = 5.2;
const floorPaint = [word.material, digits.material, stripe.material];

// ---- Road: invisible until the rear view. Ground/asphalt slide with the car (featureless), markings repeat. ----
const road = flat(9, 800, basic({ color: C.road, opacity: 0 }), 0.002);
const paint = basic({ color: C.paint, opacity: 0 });
const DASH = 9, DASHES = 40, EDGE = 3, EDGES = 120;
const dashes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 3.2), paint, DASHES);
const edges = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.12, EDGE), paint, EDGES * 2);
scene.add(dashes, edges);
const mtx = new THREE.Matrix4(), vec = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
const down = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
function layoutRoad(z) {
  ground.position.z = road.position.z = z + 300;
  let b = Math.floor(z / DASH) * DASH - 3 * DASH;
  for (let i = 0; i < DASHES; i++) dashes.setMatrixAt(i, mtx.compose(vec.set(0, 0.006, b + i * DASH), down, one));
  b = Math.floor(z / EDGE) * EDGE - 3 * EDGE;
  for (let i = 0; i < EDGES; i++) for (const s of [0, 1]) edges.setMatrixAt(i * 2 + s, mtx.compose(vec.set(s ? 4.2 : -4.2, 0.006, b + i * EDGE), down, one));
  dashes.instanceMatrix.needsUpdate = edges.instanceMatrix.needsUpdate = true;
}

// Night light: warm horizon glow behind the car + a headlight pool ahead, so a black car still reads.
const horizon = new THREE.Mesh(new THREE.PlaneGeometry(320, 110), basic({ map: glowTex(CFG.colors.glow), blending: THREE.AdditiveBlending, opacity: 0, fog: false }));
horizon.rotation.y = Math.PI;
scene.add(horizon);
const haze = flat(360, 140, basic({ map: glowTex(CFG.colors.glow), blending: THREE.AdditiveBlending, opacity: 0, fog: false }), 0.01); // same glow on the ground, so the horizon has no hard edge
const pool = flat(9, 22, basic({ map: glowTex('rgba(255,244,230,0.8)'), blending: THREE.AdditiveBlending, opacity: 0 }), 0.008);
const rim = new THREE.DirectionalLight(CFG.colors.glow, 0); // backlight from the glow: outlines roof and shoulders of the black car
scene.add(rim, rim.target);

// ---- Car ----
const car = createCar();
scene.add(car.group);

// ---- Camera framing that holds on any screen shape ----
const view = { reach: 1 }; // distance multiplier for narrow / portrait screens
function resize() {
  const a = innerWidth / innerHeight;
  camera.aspect = a;
  camera.fov = Math.min(55, 35 * Math.sqrt(Math.max(1, 1.6 / a)));
  const wide = Math.tan(THREE.MathUtils.degToRad(17.5)) * 1.6;            // horizontal reach of the 16:10 design
  view.reach = Math.max(1, wide / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * a)) ** 0.7;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  dirty = true;
}

// ---- Timeline ----
function carZ(t) {
  const { startZ, speed, brakeAt, stopAt } = CFG.car;
  if (t <= brakeAt) return startZ + speed * t;
  const d = stopAt - brakeAt, u = span(t, brakeAt, stopAt);
  return startZ + speed * brakeAt + (speed * d * (1 - (1 - u) ** 3)) / 3; // ease to a stop, velocity continuous
}

const cam = new THREE.Vector3(), aim = new THREE.Vector3(), col = new THREE.Color();
function pose(t) {
  const z = carZ(t);
  car.group.position.z = z;
  for (const w of car.wheels) w.rotation.x = z / car.radius;
  car.setBrake(smoother(span(t, CFG.car.brakeAt, CFG.car.brakeAt + 0.3)));

  // anchor: holds on the floor, then follows the car (zero camera velocity at start, car velocity at end)
  const w = smoother(span(t, CFG.track.from, CFG.track.to));
  const anchor = lerp(0, z, w);
  const o = inOut(span(t, CFG.orbit.start, CFG.orbit.end), CFG.orbit.snap);
  const th = THREE.MathUtils.degToRad(lerp(CFG.orbit.fromDeg, CFG.orbit.toDeg, o));
  const R = (lerp(CFG.orbit.fromR, CFG.orbit.toR, o) - CFG.push.r * smoother(span(t, CFG.push.from, CFG.push.to))) * view.reach;
  const H = lerp(CFG.orbit.fromH, CFG.orbit.toH, o) * view.reach;
  cam.set(-R * Math.cos(th), H, anchor - R * Math.sin(th));
  const ahead = CFG.look.ahead * smoother(span(t, CFG.look.from, CFG.look.to));
  aim.set(0, lerp(CFG.look.fromH, CFG.look.toH, o), anchor + ahead);
  camera.position.copy(cam);
  camera.lookAt(aim);
  key.position.set(-5, 10, z + 6);
  key.target.position.set(0, 0, z);

  // red floor -> night road
  const f = smoother(span(t, CFG.floorFade.from, CFG.floorFade.to));
  col.copy(C.floor).lerp(C.night, f);
  scene.background.copy(col);
  scene.fog.color.copy(col);
  ground.material.color.copy(C.floor).lerp(C.ground, f);
  for (const m of floorPaint) m.opacity = 1 - f;
  scene.environmentIntensity = lerp(ENV.studio, ENV.night, f);
  const r = smoother(span(t, CFG.road.from, CFG.road.to));
  road.material.opacity = paint.opacity = r;
  horizon.material.opacity = r * 0.9;
  haze.material.opacity = r * 0.55;
  rim.intensity = r * 2.5;
  pool.material.opacity = r;
  horizon.position.set(0, 14, z + 170);
  pool.position.z = z + 10;
  haze.position.z = z + 150;
  rim.position.set(0, 7, z + 30);
  rim.target.position.set(0, 0, z);
  layoutRoad(z);

  drawPct(Math.round(span(t, 0, CFG.loading.end) * 100));
  dockEl.classList.toggle('on', t >= CFG.dockAt);
}

// ---- Dock (data from content.js) ----
const dockEl = document.getElementById('dock');
const btn = (i) => `<button type="button" data-id="${i.id}">${i.label}</button>`;
const link = (i) => `<a data-id="${i.id}" href="${i.href}">${i.label}</a>`;
dockEl.innerHTML = `<div class="nav">${dock.nav.map(btn).join('')}</div><span class="sep" aria-hidden="true"></span><div class="pedals">${dock.contacts.map(link).join('')}</div>`;
dockEl.addEventListener('click', (e) => {
  const id = e.target.closest('[data-id]')?.dataset.id;
  if (id) dispatchEvent(new CustomEvent('portfolio:nav', { detail: { id } })); // hook for billboards / overlays
});

// ---- Loop: renders every frame while things move, then only on demand ----
const scrub = document.getElementById('scrub');
const debug = window.INTRO_DEBUG || new URLSearchParams(location.search).has('debug');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let t = 0, playing = false, last = 0, dirty = true;
let slow = 0, frames = 0;

addEventListener('resize', resize);
resize();

const replay = () => { t = reduced ? CFG.duration : 0; playing = !reduced; dirty = true; };
document.getElementById('replay').onclick = replay;
addEventListener('keydown', (e) => e.key.toLowerCase() === 'r' && replay());
if (debug) {
  scrub.hidden = false;
  scrub.oninput = () => { playing = false; t = scrub.value * CFG.duration; dirty = true; };
}

renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (playing) {
    t += dt;
    if (t >= CFG.duration) { t = CFG.duration; playing = false; }
    if (debug) scrub.value = t / CFG.duration;
    // one-time downgrade on slow devices: average frame > 22ms -> pixel ratio 1
    if (++frames > 20 && frames <= 80) slow += dt;
    if (frames === 80 && slow / 60 > 0.022 && renderer.getPixelRatio() > 1) { renderer.setPixelRatio(1); resize(); }
  } else if (!dirty) return;
  dirty = false;
  pose(t);
  renderer.render(scene, camera);
});

// Start once the floor font is ready (max 1.5s wait), so the counter never pops between typefaces.
pose(0);
Promise.race([document.fonts.load(`100px ${FONT}`), new Promise((r) => setTimeout(r, 1500))]).then(() => {
  const c = word.material.map.image;
  drawWord(c.getContext('2d'), c.width, c.height);
  word.material.map.needsUpdate = true;
  shownPct = -1;
  replay();
});

window.__intro = { CFG, seek: (s) => { playing = false; t = s; dirty = true; }, replay };
