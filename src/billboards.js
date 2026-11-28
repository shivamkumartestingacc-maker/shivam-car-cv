import * as THREE from 'three';

// Road boards, recycled ahead of the car so the road can be endless. Two layouts:
//  'bridge' — big landscape panel on a gantry spanning the road (case studies)
//  'side'   — portrait panel on posts beside the road, alternating sides (motion / visuals / AI)
// Items: { id, title, label, thumb }. Each panel carries userData.id for click handling. setItems() swaps content live.
const LAYOUTS = {
  bridge: { W: 12, H: 4.8, lift: 5.2, start: 140, spacing: 150, count: 4 },
  side: { W: 3.6, H: 5, lift: 1.4, start: 50, spacing: 38, count: 7, x: 12.5, turn: 0.35 },
};
const SPAN = 14, BAR = 0.3; // bridge: distance between legs (road is 8.4 wide), beam/leg thickness

const images = new Map();
const loadImage = (src) => {
  if (!images.has(src)) images.set(src, new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }));
  return images.get(src);
};

function artwork(item, W, H) {
  const c = document.createElement('canvas');
  c.width = W > H ? 1024 : 600; c.height = Math.round((c.width * H) / W);
  const x = c.getContext('2d'), w = c.width, h = c.height, k = w / 1024 * (W > H ? 1 : 1.6);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const draw = (img) => {
    x.fillStyle = '#151515';
    x.fillRect(0, 0, w, h);
    if (img) {
      const s = Math.max(w / img.width, h / img.height);
      x.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s);
      const g = x.createLinearGradient(0, h * 0.5, 0, h);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.75)');
      x.fillStyle = g;
      x.fillRect(0, h * 0.5, w, h * 0.5);
    }
    x.fillStyle = '#c9c6c0';
    x.font = `600 ${34 * k}px system-ui, sans-serif`;
    x.fillText(item.label.toUpperCase(), 48 * k, h - 120 * k);
    x.fillStyle = '#f4f2ee';
    x.font = `700 ${64 * k}px system-ui, sans-serif`;
    x.fillText(item.title, 48 * k, h - 52 * k, w - 96 * k);
    tex.needsUpdate = true;
  };
  draw();
  if (item.thumb) loadImage(item.thumb).then((img) => img && draw(img));
  return tex;
}

export function createBillboards(scene, layout = 'bridge') {
  const L = LAYOUTS[layout], bridge = layout === 'bridge';
  const frame = new THREE.MeshStandardMaterial({ color: 0x1d1d1d, roughness: 0.6 });
  const top = L.lift + L.H + 0.3;
  const panelGeo = new THREE.BoxGeometry(L.W, L.H, 0.12);
  const legGeo = new THREE.BoxGeometry(bridge ? BAR : 0.16, top, bridge ? BAR : 0.16);
  const beamGeo = new THREE.BoxGeometry(SPAN + BAR, BAR, BAR);
  let list = [], fronts = [];

  const pool = Array.from({ length: L.count }, () => {
    const g = new THREE.Group();
    const panel = new THREE.Mesh(panelGeo, [frame, frame, frame, frame, frame, frame]); // index 5 = -z face, toward the chase camera
    panel.position.y = L.lift + L.H / 2;
    g.add(panel);
    const legX = bridge ? SPAN / 2 : L.W * 0.32;
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, frame);
      leg.position.set(s * legX, top / 2, 0.2);
      g.add(leg);
    }
    if (bridge) for (const y of [L.lift - 0.15, top - BAR / 2]) { // beams above and below the panel
      const beam = new THREE.Mesh(beamGeo, frame);
      beam.position.set(0, y, 0.2);
      g.add(beam);
    }
    g.traverse((o) => { o.castShadow = true; });
    scene.add(g);
    return { g, panel, slot: -1 };
  });

  return {
    panels: pool.map((b) => b.panel),
    setItems(items) {
      list = items;
      fronts.forEach((m) => { m.map.dispose(); m.dispose(); });
      fronts = list.map((item) => new THREE.MeshBasicMaterial({ map: artwork(item, L.W, L.H) })); // unlit: artwork reads true
      pool.forEach((b) => { b.slot = -1; });
    },
    set visible(v) { pool.forEach((b) => { b.g.visible = v; }); },
    update(z) {
      if (!list.length) return;
      const first = Math.max(0, Math.floor((z - L.start) / L.spacing));
      pool.forEach((b, k) => {
        const slot = first + k, side = slot % 2 ? 1 : -1;
        b.g.position.set(bridge ? 0 : side * L.x, 0, L.start + slot * L.spacing);
        b.g.rotation.y = bridge ? 0 : side * L.turn; // side boards angle toward the oncoming car
        if (b.slot !== slot) {
          b.slot = slot;
          const n = slot % list.length;
          b.panel.material[5] = fronts[n];
          b.panel.userData.id = list[n].id;
        }
      });
    },
  };
}
