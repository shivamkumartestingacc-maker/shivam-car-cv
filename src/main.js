import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadCar } from './car.js';
import { createBillboards } from './billboards.js';
import { caseStudies, motion, visuals, ai, gears, contacts } from './content.js';
import { loadDeck, openDeck } from './deck.js';
import { openLightbox } from './lightbox.js';
import { createSky, createTrees, createPetals, createBenches, createSkyline } from './scenery.js';
import { createEngineSound } from './sound.js';

// ---- Choreography knobs. Car, camera and scene are tuned independently here. ----
const CFG = {
  duration: 5.6,            // total intro length (s)
  speed: 9,                 // car speed during the intro (m/s); it keeps cruising at this after
  drive: { max: 16, reverse: 6, accel: 6, brake: 12 }, // after the intro: arrows/WASD drive, Space stops
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
// Instances are re-laid every frame around the car, so skip culling (their bounds are computed once and go stale).
dashes.frustumCulled = edges.frustumCulled = false;
scene.add(dashes, edges);
const sky = createSky(scene), trees = createTrees(scene), petals = createPetals(scene), benches = createBenches(scene), skyline = createSkyline(scene);
// Gear = what the road shows. Case studies go on the bridges; motion / visuals / AI on roadside boards.
const bridges = createBillboards(scene, 'bridge'), sideBoards = createBillboards(scene, 'side');
const LABEL = { motion: 'Motion', visuals: 'Visual', ai: 'AI exploration' };
const SETS = { motion, visuals, ai };
let gear = 'case', decks = [];
const decksReady = Promise.all(caseStudies.map((id) => loadDeck(id).catch((e) => console.warn(e))))
  .then((list) => {
    decks = list.filter(Boolean);
    bridges.setItems(decks.map((d, i) => ({ id: d.id, title: d.title, thumb: d.thumb, label: `Case study ${String(i + 1).padStart(2, '0')}` })));
  });
function setGear(id) {
  gear = id;
  bridges.visible = id === 'case';
  sideBoards.visible = id !== 'case';
  if (id !== 'case') sideBoards.setItems(SETS[id].map((it) => ({ ...it, label: LABEL[id] })));
  const i = gears.findIndex((g) => g.id === id), pin = document.querySelector('.pin');
  for (const b of document.querySelectorAll('.place')) b.setAttribute('aria-pressed', String(b.dataset.gear === id));
  pin.style.left = `${PLACES[i]}%`;
  pin.querySelector('svg').innerHTML = ICONS[id];
  pin.querySelector('.pin-label').textContent = gears[i].label;
  pin.classList.remove('drop'); void pin.offsetWidth; pin.classList.add('drop'); // little bounce on arrival
}
const activeBoards = () => (gear === 'case' ? bridges : sideBoards);

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
  dashes.instanceMatrix.needsUpdate = edges.instanceMatrix.needsUpdate = true;
}

// ---- Car (black, badges removed, SHIVAM plate: see car.js) ----
const car = new THREE.Group();
scene.add(car);
let carApi = null;
const loaded = loadCar({ url: window.INTRO_MODEL }).then((c) => { car.add(c.group); carApi = c; });

// ---- Timeline: everything derived from t, so it can be scrubbed and replayed ----
const cam = new THREE.Vector3(), aim = new THREE.Vector3();
function pose(t, carZ) {
  car.position.z = carZ;
  if (carApi) {
    for (const w of carApi.wheels) w.rotation.x = -carZ / carApi.radius;
    carApi.setBrake(drive.brake);
  }

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
  activeBoards().update(carZ);
  trees.update(carZ);
  benches.update(carZ);
  skyline.update(carZ);
  sky.update(camera);

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

// ---- Driving after the intro: Up/Right/W/D forward, Down/Left/S/A back, Space stops (to read a billboard) ----
const drive = { z: 0, v: CFG.speed, stopped: false, brake: 0 };
const held = new Set();
const FWD = ['ArrowUp', 'ArrowRight', 'w', 'd'], BACK = ['ArrowDown', 'ArrowLeft', 's', 'a'];
const keyOf = (e) => (e.key.length === 1 ? e.key.toLowerCase() : e.key);
let deckOpen = false;

addEventListener('keydown', (e) => {
  const k = keyOf(e);
  if (k === 'r' && !deckOpen) return replay();
  const g = gears.find((x) => x.key === k);
  if (g && !deckOpen) return setGear(g.id);
  if (FWD.includes(k) || BACK.includes(k)) { held.add(k); drive.stopped = false; }
  else if (k === ' ') drive.stopped = true;
  else return;
  e.preventDefault(); // arrows/space must not scroll the page
});
addEventListener('keyup', (e) => held.delete(keyOf(e)));
addEventListener('blur', () => held.clear());

function driveStep(dt) {
  const { max, reverse, accel, brake } = CFG.drive;
  const fwd = FWD.some((k) => held.has(k)), back = BACK.some((k) => held.has(k));
  // no key held = cruise control: keep the current speed
  const target = drive.stopped || deckOpen ? 0 : fwd ? max : back ? -reverse : drive.v;
  const slowing = Math.abs(target) < Math.abs(drive.v);
  const step = (slowing ? brake : accel) * dt;
  drive.v += Math.max(-step, Math.min(step, target - drive.v));
  drive.z += drive.v * dt; // distance driven since the intro ended (intro clock is frozen at its end)
  drive.brake += ((slowing && Math.abs(drive.v) > 0.05) || drive.stopped ? 1 - drive.brake : -drive.brake) * Math.min(1, dt * 8);
}

// Feeble engine sound: starts on the first click/key (browser rule); the Sound button mutes it.
const engine = createEngineSound();
const soundBtn = document.getElementById('sound');
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => engine.start(), { once: true });
soundBtn.onclick = () => { engine.start(); soundBtn.textContent = engine.toggle() ? 'Sound off' : 'Sound on'; };

const replay = () => { t = 0; playing = true; Object.assign(drive, { z: 0, v: CFG.speed, stopped: false, brake: 0 }); held.clear(); };
document.getElementById('replay').onclick = replay;
if (debug) {
  scrub.style.display = 'block';
  scrub.oninput = () => { playing = false; t = scrub.value * CFG.duration; drive.z = 0; };
}

// ---- Billboards: hover shows a pointer, click opens that case study's deck (and stops the car) ----
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
const boardAt = (e) => {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.intersectObjects(activeBoards().panels)[0]?.object.userData.id;
};
renderer.domElement.addEventListener('pointermove', (e) => { renderer.domElement.style.cursor = boardAt(e) ? 'pointer' : ''; });
// Screen rectangle of a billboard panel (its projected bounding box), for the open/close transition.
const corner = new THREE.Vector3();
function screenRect(panel) {
  const { min, max } = panel.geometry.boundingBox ?? (panel.geometry.computeBoundingBox(), panel.geometry.boundingBox);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < 8; i++) {
    corner.set(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z).applyMatrix4(panel.matrixWorld).project(camera);
    if (corner.z > 1) return null; // behind the camera
    const x = ((corner.x + 1) / 2) * innerWidth, y = ((1 - corner.y) / 2) * innerHeight;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
renderer.domElement.addEventListener('click', (e) => {
  const id = boardAt(e);
  const item = gear === 'case' ? null : SETS[gear].find((x) => x.id === id);
  const deck = gear === 'case' && decks.find((d) => d.id === id);
  if ((!deck && !item) || deckOpen) return;
  const panel = activeBoards().panels.find((p) => p.userData.id === id && ray.intersectObject(p).length);
  if (item) { // work boards just enlarge in place
    deckOpen = true;
    return openLightbox(item, () => screenRect(panel), () => { deckOpen = false; });
  }
  deckOpen = true;
  openDeck(deck, () => { deckOpen = false; }, () => screenRect(panel)); // the car brakes to a stop behind the deck
});

// ---- Dock: a faded street map. Sections are places on it; a location pin sits on the one selected.
//      Contact stamps at the right end. ----
const dockEl = document.getElementById('dock');
let lift = 0;
const ICONS = { // 24px line icons inside the pin
  case: '<path d="M4 8h16v11H4z M9 8V5h6v3 M4 13h16"/>',
  motion: '<path d="M8 5l11 7-11 7z"/>',
  visuals: '<path d="M4 5h16v14H4z M4 16l5-5 4 4 3-3 4 4"/><circle cx="15.5" cy="9" r="1.5"/>',
  ai: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
};
const PLACES = [14, 38, 61, 84]; // x positions (%) of the sections along the map
function streetMap() { // light, procedural map: parks, water, roads, a few faint place names
  let seed = 9;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const parks = Array.from({ length: 9 }, () => `<ellipse cx="${r() * 1000}" cy="${r() * 200}" rx="${30 + r() * 60}" ry="${14 + r() * 26}" transform="rotate(${r() * 60 - 30} 0 0)"/>`).join('');
  const minor = Array.from({ length: 26 }, () => { const x = r() * 1000, y = r() * 200; return `<path d="M${x} ${y} l${r() * 160 - 80} ${r() * 120 - 60}"/>`; }).join('');
  const names = ['Pixel Park', 'Kerning Lake', 'Grid Common', 'Bezier Heights', 'Prototype Bay', 'Layer Lane'];
  const labels = names.map((n, i) => `<text x="${60 + i * 160 + r() * 40}" y="${40 + r() * 130}">${n}</text>`).join('');
  return `<svg class="streets" viewBox="0 0 1000 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="1000" height="200" fill="#f7f6f2"/>
    <g fill="#dcebc9" opacity=".75">${parks}</g>
    <path d="M-20 150 C 140 120, 240 175, 380 140 S 620 60, 760 95 S 940 150, 1020 120" fill="none" stroke="#cfe1ef" stroke-width="16"/>
    <ellipse cx="250" cy="55" rx="55" ry="22" fill="#cfe1ef"/>
    <g fill="none" stroke="#e6e3dc" stroke-width="2">${minor}</g>
    <g fill="none" stroke="#e1ded6" stroke-width="9"><path d="M0 95 C 200 70, 420 120, 1000 80"/><path d="M520 0 C 500 80, 560 140, 540 200"/><path d="M120 200 C 160 120, 90 60, 180 0"/></g>
    <g fill="none" stroke="#ffffff" stroke-width="6"><path d="M0 95 C 200 70, 420 120, 1000 80"/><path d="M520 0 C 500 80, 560 140, 540 200"/><path d="M120 200 C 160 120, 90 60, 180 0"/></g>
    <g font-family="system-ui, sans-serif" font-size="13" font-weight="600" fill="#b7b3ab" letter-spacing=".5">${labels}</g>
  </svg>`;
}
dockEl.innerHTML = `
  <div class="dock-map">${streetMap()}
    ${gears.map((g, i) => `<button type="button" class="place" data-gear="${g.id}" style="left:${PLACES[i]}%" aria-pressed="false" title="${g.label} (${g.key})"><i></i><span>${g.label}</span></button>`).join('')}
    <div class="pin" aria-hidden="true"><div class="pin-head"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"></svg></div><b class="pin-label"></b></div>
  </div>
  <div class="stamps">${contacts.map((c, i) => `<a class="stamp" style="--c:${c.colour};--r:${[-5, 3, -2, 6][i % 4]}deg" href="${c.href}" target="_blank" rel="noopener" title="${c.label}"><span class="stamp-face"><b>${c.glyph}</b><small>${c.label}</small></span></a>`).join('')}</div>`;
dockEl.addEventListener('click', (e) => { const b = e.target.closest('.place'); if (b) setGear(b.dataset.gear); });
setGear('case');

pose(0, 0);
renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (playing) {
    if (t < CFG.duration) t = Math.min(CFG.duration, t + dt); // intro clock stops at the end; driving takes over
    else driveStep(dt);
  }
  if (debug && playing) scrub.value = t / CFG.duration;
  const uiOn = t >= CFG.duration && !deckOpen;
  dockEl.classList.toggle('on', uiOn);
  // lens shift: once the dock shows, the frame slides up so the car sits clear of it
  lift += ((uiOn ? dockEl.offsetHeight + 30 : 0) - lift) * Math.min(1, dt * 3);
  camera.setViewOffset(innerWidth, innerHeight, 0, lift, innerWidth, innerHeight);
  pose(t, CFG.speed * t + drive.z);
  petals.update(dt, CFG.speed * t + drive.z);
  engine.update(t < CFG.duration ? CFG.speed : drive.v, CFG.drive.max);
  renderer.render(scene, camera);
});

// Preload car + case-study decks; the intro clock starts only once assets are ready.
Promise.all([loaded, decksReady]).then(() => { renderer.compile(scene, camera); renderer.render(scene, camera); replay(); }); // warm shaders + shadow map first
window.__intro = { CFG, get t() { return t; }, get v() { return drive.v; },
  boardScreen() { // debug/test helper: screen position of the nearest billboard ahead
    const v = new THREE.Vector3();
    const byZ = activeBoards().panels.map((p) => [p, p.getWorldPosition(new THREE.Vector3()).z]).sort((a, b) => a[1] - b[1]);
    for (const [p] of byZ) {
      p.getWorldPosition(v);
      if (v.z < camera.position.z + 5) continue;
      v.project(camera);
      if (Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95) return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
    }
    return null;
  },
  get cam() { return +camera.position.z.toFixed(2); }, seek: (s) => { playing = false; t = s; drive.z = 0; }, replay };
