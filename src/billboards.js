import * as THREE from 'three';

// Road boards, recycled ahead of the car so the road can be endless. Two layouts:
//  'bridge' — big landscape panel on a gantry spanning the road (case studies)
//  'side'   — portrait panel on posts beside the road, alternating sides (motion / visuals / AI)
// The panel shows the work itself (image, or a playing video for motion); its title sits on a small plate.
// Items: { id, title, label, thumb, video? }. Panels carry userData.id for click handling. setItems() swaps content.
const LAYOUTS = {
  bridge: { W: 12, H: 4.8, lift: 5.2, start: 140, spacing: 150, count: 4 },
  side: { W: 3.6, H: 5, lift: 1.6, start: 50, spacing: 38, count: 7, x: 12.5, turn: 0.35 },
};
const SPAN = 14, BAR = 0.3; // bridge: distance between legs (road is 8.4 wide), beam/leg thickness

const images = new Map();
const loadImage = (src) => {
  if (!images.has(src)) images.set(src, new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }));
  return images.get(src);
};
const canvasTex = (w, h, draw) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  draw(c.getContext('2d'), w, h);
  return t;
};

// the work, cover-fitted, nothing on top of it
function artwork(item, W, H) {
  const w = W > H ? 1024 : 600, h = Math.round((w * H) / W);
  const tex = canvasTex(w, h, (x) => { x.fillStyle = '#1b1b1c'; x.fillRect(0, 0, w, h); });
  if (item.thumb) loadImage(item.thumb).then((img) => {
    if (!img) return;
    const x = tex.image.getContext('2d'), s = Math.max(w / img.width, h / img.height);
    x.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s);
    tex.needsUpdate = true;
  });
  return tex;
}

// small title plate: label + title
function plate(item) {
  return canvasTex(1024, 160, (x, w, h) => {
    x.fillStyle = '#f6f3ec'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#8a867f'; x.font = '600 34px system-ui, sans-serif';
    x.fillText(item.label.toUpperCase(), 40, 56);
    x.fillStyle = '#1a1a1a'; x.font = '700 58px system-ui, sans-serif';
    x.fillText(item.title, 40, 124, w - 80);
  });
}

export function createBillboards(scene, layout = 'bridge') {
  const L = LAYOUTS[layout], bridge = layout === 'bridge';
  const frame = new THREE.MeshStandardMaterial({ color: 0x1d1d1d, roughness: 0.6 });
  const top = L.lift + L.H + 0.3;
  const capW = bridge ? 6 : L.W, capH = capW * 160 / 1024;
  const panelGeo = new THREE.BoxGeometry(L.W, L.H, 0.12), capGeo = new THREE.PlaneGeometry(capW, capH).rotateY(Math.PI);
  const legGeo = new THREE.BoxGeometry(bridge ? BAR : 0.16, top, bridge ? BAR : 0.16);
  const beamGeo = new THREE.BoxGeometry(SPAN + BAR, BAR, BAR);
  let list = [], fronts = [], caps = [], shown = true;

  const pool = Array.from({ length: L.count }, () => {
    const g = new THREE.Group();
    const panel = new THREE.Mesh(panelGeo, [frame, frame, frame, frame, frame, frame]); // index 5 = -z face, toward the chase camera
    panel.position.y = L.lift + L.H / 2;
    const cap = new THREE.Mesh(capGeo, frame);
    cap.position.set(0, bridge ? top + capH / 2 + 0.05 : L.lift - capH / 2 - 0.08, -0.07); // above the gantry / under the side panel
    g.add(panel, cap);
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
    // each board owns one <video>, so at most `count` videos ever play
    const video = Object.assign(document.createElement('video'), { muted: true, loop: true, playsInline: true, crossOrigin: 'anonymous' });
    const vtex = new THREE.VideoTexture(video);
    vtex.colorSpace = THREE.SRGBColorSpace;
    return { g, panel, cap, video, vmat: new THREE.MeshBasicMaterial({ map: vtex }), slot: -1 };
  });

  return {
    panels: pool.map((b) => b.panel),
    setItems(items) {
      list = items;
      for (const m of [...fronts, ...caps]) { m.map.dispose(); m.dispose(); }
      fronts = list.map((item) => new THREE.MeshBasicMaterial({ map: artwork(item, L.W, L.H) })); // unlit: the work reads true
      caps = list.map((item) => new THREE.MeshBasicMaterial({ map: plate(item) }));
      pool.forEach((b) => { b.slot = -1; });
    },
    set visible(v) {
      shown = v;
      pool.forEach((b) => { b.g.visible = v; if (!v) b.video.pause(); });
    },
    update(z) {
      if (!list.length) return;
      const first = Math.max(0, Math.floor((z - L.start) / L.spacing));
      pool.forEach((b, k) => {
        const slot = first + k, side = slot % 2 ? 1 : -1;
        b.g.position.set(bridge ? 0 : side * L.x, 0, L.start + slot * L.spacing);
        b.g.rotation.y = bridge ? 0 : side * L.turn; // side boards angle toward the oncoming car
        if (b.slot !== slot) {
          b.slot = slot;
          const item = list[slot % list.length];
          b.panel.userData.id = item.id;
          b.cap.material = caps[slot % list.length];
          if (item.video) {
            b.video.src = item.video;
            b.video.poster = item.thumb;
            b.panel.material[5] = b.vmat;
            if (shown) b.video.play().catch(() => {});
          } else {
            b.video.pause();
            b.video.removeAttribute('src');
            b.panel.material[5] = fronts[slot % list.length];
          }
        }
      });
    },
  };
}
