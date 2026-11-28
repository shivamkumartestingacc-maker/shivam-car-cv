// Case-study decks. One folder per case study: public/work/<id>/deck.md plus its images/videos.
// Format (see public/work/README.md):
//   title: ...            <- meta lines first (title, thumb)
//   thumb: cover.jpg
//   ---                   <- each "---" line starts a new slide
//   # Slide heading / ## Sub-heading / plain paragraphs / - bullets / ![caption](file.mp4 or .jpg)

const folder = (id) => `./work/${id}/`;

function parseSlide(block, url) {
  const parts = [];
  let para = [];
  const flush = () => { if (para.length) parts.push({ t: 'p', text: para.join(' ') }); para = []; };
  for (const raw of block.split('\n')) {
    const line = raw.trim();
    const media = line.match(/^!\[(.*?)\]\((.+?)\)$/), link = line.match(/^\[(.+?)\]\((.+?)\)$/);
    if (!line) flush();
    else if (media) { flush(); parts.push({ t: 'media', alt: media[1], src: url(media[2]) }); }
    else if (link) { flush(); parts.push({ t: 'a', text: link[1], href: url(link[2]) }); }
    else if (line.startsWith('## ')) { flush(); parts.push({ t: 'h3', text: line.slice(3) }); }
    else if (line.startsWith('# ')) { flush(); parts.push({ t: 'h2', text: line.slice(2) }); }
    else if (/^[-*] /.test(line)) { flush(); parts.push({ t: 'li', text: line.slice(2) }); }
    else para.push(line);
  }
  flush();
  return parts;
}

export async function loadDeck(id) {
  const res = await fetch(folder(id) + 'deck.md');
  if (!res.ok) throw new Error(`deck ${id}: ${res.status}`);
  const [head, ...blocks] = (await res.text()).split(/^---[ \t]*$/m);
  const meta = Object.fromEntries(head.split('\n').map((l) => l.match(/^(\w+):\s*(.+)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
  const url = (f) => (/^https?:/.test(f) ? f : folder(id) + f);
  return {
    id,
    title: meta.title || id,
    thumb: meta.thumb ? url(meta.thumb) : '',
    slides: blocks.map((b) => parseSlide(b, url)).filter((s) => s.length),
  };
}

function renderSlide(parts) {
  const slide = document.createElement('section');
  slide.className = 'slide';
  const copy = document.createElement('div');
  copy.className = 'copy';
  let list = null;
  for (const p of parts) {
    if (p.t === 'media') {
      const video = /\.(mp4|webm)$/i.test(p.src);
      const m = document.createElement(video ? 'video' : 'img');
      if (video) { m.muted = true; m.loop = true; m.playsInline = true; m.preload = 'metadata'; }
      else { m.alt = p.alt; m.loading = 'lazy'; }
      m.src = p.src;
      m.className = 'media';
      slide.append(m);
      slide.classList.add('has-media');
      continue;
    }
    if (p.t === 'li') {
      if (!list) copy.append((list = document.createElement('ul')));
      list.append(Object.assign(document.createElement('li'), { textContent: p.text }));
      continue;
    }
    list = null;
    if (p.t === 'a') {
      copy.append(Object.assign(document.createElement('a'), { textContent: `${p.text} ↗`, href: p.href, target: '_blank', rel: 'noopener', className: 'deck-link' }));
      continue;
    }
    copy.append(Object.assign(document.createElement(p.t), { textContent: p.text }));
  }
  slide.prepend(copy);
  return slide;
}

// Full-screen deck overlay. Left/Right (or A/D, swipe, buttons) change slide; Esc or Close exits.
// fromRect(): screen rect of the clicked billboard; the deck grows out of it and shrinks back into it on close.
export function openDeck(deck, onClose, fromRect = () => null) {
  const root = document.createElement('div');
  root.className = 'deck';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', deck.title);
  root.innerHTML = `
    <header><span class="deck-title"></span><span class="deck-count"></span><button class="deck-close" type="button">Close</button></header>
    <div class="deck-track"></div>
    <button class="deck-nav deck-prev" type="button" aria-label="Previous slide">&larr;</button>
    <button class="deck-nav deck-next" type="button" aria-label="Next slide">&rarr;</button>
    <div class="deck-progress"><i></i></div>`;
  root.querySelector('.deck-title').textContent = deck.title;
  const count = root.querySelector('.deck-count'), bar = root.querySelector('.deck-progress i');
  const slides = deck.slides.map(renderSlide);
  root.querySelector('.deck-track').append(...slides);

  let i = 0;
  const go = (n) => {
    i = Math.max(0, Math.min(slides.length - 1, n));
    slides.forEach((s, k) => {
      s.classList.toggle('on', k === i);
      s.style.transform = `translateX(${(k - i) * 100}%)`;
      s.setAttribute('aria-hidden', String(k !== i));
      for (const v of s.querySelectorAll('video')) k === i ? v.play().catch(() => {}) : v.pause(); // only the visible slide plays
    });
    count.textContent = `${String(i + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`;
    bar.style.width = `${((i + 1) / slides.length) * 100}%`;
  };

  const clip = (r) => (r ? `inset(${r.y}px ${innerWidth - r.x - r.w}px ${innerHeight - r.y - r.h}px ${r.x}px round 6px)` : 'inset(0 round 0)');
  const close = () => {
    removeEventListener('keydown', onKey, true);
    root.classList.remove('open');
    const r = fromRect();
    if (r) root.style.clipPath = clip(r); else root.classList.add('fade');
    setTimeout(() => { root.remove(); onClose?.(); }, 800);
  };
  // capture phase + stopImmediatePropagation: while the deck is open, keys never reach the driving controls
  const onKey = (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === 'ArrowRight' || k === 'd') go(i + 1);
    else if (k === 'ArrowLeft' || k === 'a') go(i - 1);
    else if (k === 'Escape') close();
    else if (![' ', 'ArrowUp', 'ArrowDown', 'w', 's'].includes(k)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  addEventListener('keydown', onKey, true);
  root.querySelector('.deck-prev').onclick = () => go(i - 1);
  root.querySelector('.deck-next').onclick = () => go(i + 1);
  root.querySelector('.deck-close').onclick = close;
  let x0 = null;
  root.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
  root.addEventListener('pointerup', (e) => { if (x0 !== null && Math.abs(e.clientX - x0) > 50) go(i + (e.clientX < x0 ? 1 : -1)); x0 = null; });

  const r = fromRect();
  root.style.clipPath = clip(r);
  if (!r) root.classList.add('fade');
  document.body.append(root);
  go(0);
  root.getBoundingClientRect(); // commit the start state so the expansion animates
  requestAnimationFrame(() => { root.classList.remove('fade'); root.classList.add('open'); root.style.clipPath = clip(null); });
  root.querySelector('.deck-close').focus();
}
