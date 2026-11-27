import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadCar } from './car.js';

// ---- Choreography + look. Every motion derives from one clock `t`, so it can be scrubbed and replayed. ----
const CFG = {
  duration: 8,                                  // last moving frame; afterwards the scene renders only on demand
  car: { startZ: -22, speed: 8, brakeAt: 5.2, stopAt: 6.8 },
  loading: { end: 2.2 },                        // stripes paint across the screen 0 -> 100% (cinematic, not network time)
  stripe: { fromZ: -12, toZ: 13, horizonBy: 3.6 }, // paint tip during loading, then it runs off to the horizon
  track: { from: 1.6, to: 3.2 },                // camera holds over the floor, then eases into following the car
  orbit: { start: 2.2, end: 5.4, snap: 3,       // snap: 2 = soft, 3-4 = quick middle, firm settle
           fromAz: 35, toAz: 0,                 // azimuth: 35 = stripes run diagonally on screen, 0 = straight behind
           fromEl: 84, toEl: 13,                // elevation: 84 = bird's-eye, 12 = low chase
           fromR: 28, toR: 8.6, roll: 4 },      // roll: slight dutch angle mid-move (degrees)
  push: { r: 0.8, from: 5.4, to: 8 },           // slow push-in once behind the car
  look: { toH: 0.8, ahead: 6, from: 3.4, to: 5.6 },
  lettering: { fadeFrom: 2.4, fadeTo: 3.0 },   // floor LOADING + counter fade once loaded
  colors: { ground: '#ede4cf', sky: '#e9dfca', red: '#e1312b', gap: '#f7f2e7', ink: '#1a1a1a', sun: '#fff1dc', fill: '#a9bccf' },
};

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const span = (t, a, b) => clamp01((t - a) / (b - a));
const smoother = (x) => x * x * x * (x * (x * 6 - 15) + 10);
const inOut = (x, k) => (x < 0.5 ? (2 * x) ** k / 2 : 1 - (2 - 2 * x) ** k / 2);
const lerp = THREE.MathUtils.lerp, rad = THREE.MathUtils.degToRad;

// ---- Renderer: capped pixel ratio, one shadow map, no post-processing ----
const coarse = matchMedia('(pointer: coarse)').matches;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2));
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
document.body.prepend(renderer.domElement);
const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
scene.background = new THREE.Color(CFG.colors.sky);
scene.fog = new THREE.Fog(CFG.colors.sky, 30, 170);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 500);

// Low warm sun from the car's left -> long shadow to the right; cool sky fill tints the shadow slate-blue.
const sun = new THREE.DirectionalLight(CFG.colors.sun, 3.2);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(coarse ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 60 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
sun.shadow.radius = 3;
scene.add(sun, sun.target, new THREE.HemisphereLight(CFG.colors.fill, CFG.colors.ground, 0.55));

// ---- Floor: cream ground + red double racing stripe. The stripe IS the loading bar. ----
const lambert = (o) => new THREE.MeshLambertMaterial(o);
const flat = (w, l, mat, x, y) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, 0);
  m.receiveShadow = true;
  scene.add(m);
  return m;
};
// Floor layers never write depth and draw first (renderOrder), so the stripes can't z-fight the ground.
const ground = flat(900, 900, lambert({ color: CFG.colors.ground, depthWrite: false }), 0, 0);
ground.renderOrder = -2;
const STRIPE_TAIL = -300;
const stripeParts = [                               // [width, x, colour] — two red bands, light gap and outer pinstripes
  [0.95, -0.6, CFG.colors.red], [0.95, 0.6, CFG.colors.red],
  [0.25, 0, CFG.colors.gap], [0.12, -1.2, CFG.colors.gap], [0.12, 1.2, CFG.colors.gap],
].map(([w, x, c]) => { const m = flat(w, 1, lambert({ color: c, depthWrite: false }), x, 0.002); m.renderOrder = -1; return m; });
function paintTo(tip) {
  for (const m of stripeParts) { m.scale.y = tip - STRIPE_TAIL; m.position.z = (tip + STRIPE_TAIL) / 2; }
}

// Floor lettering runs WITH the direction of travel (reads bottom -> top on screen), like gallery floor tape.
const FONT = '"Anton", Impact, "Arial Narrow", sans-serif';
function decal(w, l, x, cw, ch) {
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso;
  const m = flat(l, w, lambert({ map: tex, transparent: true, depthWrite: false }), x, 0.004);
  m.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); // canvas right -> +z (travel), canvas up -> +x
  return { m, c, x: c.getContext('2d'), tex };
}
const word = decal(1.9, 9, 2.75, 2048, 432);
const count = decal(2.2, 4.6, -2.8, 1024, 490);
function drawWord() {
  const { x, c, tex } = word;
  x.clearRect(0, 0, c.width, c.height);
  x.fillStyle = CFG.colors.ink;
  x.font = `${c.height * 0.95}px ${FONT}`;
  x.textBaseline = 'middle';
  x.letterSpacing = `${c.height * 0.05}px`;
  x.fillText('LOADING', 0, c.height * 0.54);
  tex.needsUpdate = true;
}
let shown = -1;
function drawCount(p) {
  if (p === shown) return;
  shown = p;
  const { x, c, tex } = count;
  x.clearRect(0, 0, c.width, c.height);
  x.fillStyle = CFG.colors.red;
  x.font = `${c.height * 0.95}px ${FONT}`;
  x.textBaseline = 'middle';
  x.textAlign = 'right';
  x.fillText(`${p}%`, c.width, c.height * 0.54);
  tex.needsUpdate = true;
}

// ---- Car ----
let car = null;
const ready = loadCar({ url: window.INTRO_MODEL }).then((c) => { car = c; scene.add(c.group); });

// ---- Framing that holds on any screen shape ----
const view = { reach: 1 };
function resize() {
  const a = innerWidth / innerHeight;
  camera.aspect = a;
  camera.fov = Math.min(55, 35 * Math.sqrt(Math.max(1, 1.6 / a)));
  const wide = Math.tan(rad(17.5)) * 1.6;
  view.reach = Math.max(1, wide / (Math.tan(rad(camera.fov / 2)) * a)) ** 0.7;
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

const aim = new THREE.Vector3();
function pose(t) {
  const z = carZ(t);
  if (car) {
    car.group.position.z = z;
    for (const w of car.wheels) w.rotation.x = -z / car.radius;
    car.setBrake(smoother(span(t, CFG.car.brakeAt, CFG.car.brakeAt + 0.3)));
  }

  // loading = paint tip sweeping across the screen; then the stripe races off to the horizon
  const p = span(t, 0, CFG.loading.end);
  const { fromZ, toZ, horizonBy } = CFG.stripe;
  const tip = t <= CFG.loading.end ? lerp(fromZ, toZ, p) : lerp(toZ, 600, span(t, CFG.loading.end, horizonBy) ** 2);
  paintTo(tip);
  drawCount(Math.round(p * 100));
  count.m.position.z = Math.min(tip, toZ) - 2.6;   // the counter rides just behind the paint tip
  word.m.material.opacity = count.m.material.opacity = 1 - smoother(span(t, CFG.lettering.fadeFrom, CFG.lettering.fadeTo));

  // camera: anchor holds over the floor, then follows the car; spherical orbit around it
  const anchor = lerp(0, z, smoother(span(t, CFG.track.from, CFG.track.to)));
  const o = inOut(span(t, CFG.orbit.start, CFG.orbit.end), CFG.orbit.snap);
  const az = rad(lerp(CFG.orbit.fromAz, CFG.orbit.toAz, o));
  const el = rad(lerp(CFG.orbit.fromEl, CFG.orbit.toEl, o));
  const R = (lerp(CFG.orbit.fromR, CFG.orbit.toR, o) - CFG.push.r * smoother(span(t, CFG.push.from, CFG.push.to))) * view.reach;
  const ahead = CFG.look.ahead * smoother(span(t, CFG.look.from, CFG.look.to));
  aim.set(0, CFG.look.toH * o, anchor + ahead);
  camera.position.set(-Math.sin(az) * Math.cos(el) * R, Math.sin(el) * R, anchor - Math.cos(az) * Math.cos(el) * R);
  camera.lookAt(aim);
  camera.rotateZ(rad(CFG.orbit.roll) * Math.sin(Math.PI * o));

  sun.position.set(12, 7, z + 3);  // low sun -> long shadow
  sun.target.position.set(0, 0, z);
  ground.position.z = z;
}

// ---- Loop: renders every frame while things move, then only on demand ----
const scrub = document.getElementById('scrub');
const debug = window.INTRO_DEBUG || new URLSearchParams(location.search).has('debug');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let t = 0, playing = false, last = 0, dirty = true, frames = 0, slow = 0;

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
    // one-time downgrade on slow devices: average frame > 22ms -> pixel ratio 1, smaller shadow map
    if (++frames > 20 && frames <= 80) slow += dt;
    if (frames === 80 && slow / 60 > 0.022 && renderer.getPixelRatio() > 1) {
      renderer.setPixelRatio(1);
      sun.shadow.mapSize.setScalar(1024);
      sun.shadow.map?.dispose(); sun.shadow.map = null;
      resize();
    }
  } else if (!dirty) return;
  dirty = false;
  pose(t);
  renderer.render(scene, camera);
});

// Preload car + floor font, then start the clock (the intro never depends on network speed).
pose(0);
Promise.all([ready, Promise.race([document.fonts.load(`100px ${FONT}`), new Promise((r) => setTimeout(r, 1500))])]).then(() => {
  drawWord();
  shown = -1;
  renderer.compile(scene, camera);
  replay();
});

window.__intro = { CFG, get car() { return car; }, seek: (s) => { playing = false; t = s; dirty = true; }, replay };
