import * as THREE from 'three';

// Roadside billboards: one per case study, repeating in order and alternating sides as the car drives.
// Artwork comes from content.js (title + optional thumb image). Each panel carries userData.id for click handling.
const W = 6, H = 3.4, LIFT = 2.6;   // panel size and height above the road (m)
const X = 8.2, TILT = 0.22;          // distance from road centre, angle toward the road (rad)

function artwork(item, i) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = Math.round((1024 * H) / W);
  const x = c.getContext('2d'), w = c.width, h = c.height;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const draw = (img) => {
    x.fillStyle = '#151515';
    x.fillRect(0, 0, w, h);
    if (img) {
      const s = Math.max(w / img.width, h / img.height);
      x.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s);
      x.fillStyle = 'rgba(0,0,0,.45)';
      x.fillRect(0, h * 0.6, w, h * 0.4);
    }
    x.fillStyle = '#9a9a98';
    x.font = '600 34px system-ui, sans-serif';
    x.fillText(`CASE STUDY ${String(i + 1).padStart(2, '0')}`, 56, h - 150);
    x.fillStyle = '#f4f2ee';
    x.font = '700 72px system-ui, sans-serif';
    x.fillText(item.title, 56, h - 72);
    tex.needsUpdate = true;
  };
  draw();
  if (item.thumb) {
    const img = new Image();
    img.onload = () => draw(img);
    img.src = item.thumb;
  }
  return tex;
}

export function createBillboards(scene, items, { start = 120, spacing = 70, count = 5 } = {}) {
  const list = items.length ? items : [1, 2, 3].map((n) => ({ id: `placeholder-${n}`, title: 'Coming soon' }));
  const fronts = list.map((item, i) => new THREE.MeshBasicMaterial({ map: artwork(item, i) })); // unlit: artwork reads true
  const frame = new THREE.MeshStandardMaterial({ color: 0x1d1d1d, roughness: 0.6 });
  const panelGeo = new THREE.BoxGeometry(W, H, 0.12), postGeo = new THREE.BoxGeometry(0.14, LIFT, 0.14);

  // A small pool of boards is recycled ahead of the car, so the road can be endless.
  const pool = Array.from({ length: count }, () => {
    const g = new THREE.Group();
    const panel = new THREE.Mesh(panelGeo, [frame, frame, frame, frame, frame, fronts[0]]); // index 5 = -z face, toward the chase camera
    panel.position.y = LIFT + H / 2;
    panel.castShadow = true;
    g.add(panel);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, frame);
      post.position.set(s * W * 0.3, LIFT / 2, 0);
      post.castShadow = true;
      g.add(post);
    }
    scene.add(g);
    return { g, panel, slot: -1 };
  });

  return {
    panels: pool.map((b) => b.panel),
    update(z) {
      const first = Math.max(0, Math.floor((z - start) / spacing));
      pool.forEach((b, k) => {
        const slot = first + k, side = slot % 2 ? 1 : -1;
        b.g.position.set(side * X, 0, start + slot * spacing);
        b.g.rotation.y = side * TILT;
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
