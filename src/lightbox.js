// Enlarge a piece of work straight out of its billboard: the media grows from the board's screen rect to a
// big centred view (FLIP), with a one-line caption. Click anywhere, Esc or × to put it back.
// AI explorations show the live site (screenshot behind it while it loads) plus an "Open" link.

export function openLightbox(item, fromRect, onClose) {
  const root = document.createElement('div');
  root.className = 'lightbox';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', item.title);

  let media;
  if (item.link) {
    media = document.createElement('div');
    media.className = 'lb-media lb-frame';
    media.style.backgroundImage = `url("${item.thumb}")`;
    media.append(Object.assign(document.createElement('iframe'), { src: item.link, title: item.title, allow: 'autoplay; fullscreen' }));
  } else if (item.video) {
    media = Object.assign(document.createElement('video'), { src: item.video, poster: item.thumb, muted: true, loop: true, autoplay: true, playsInline: true });
    media.className = 'lb-media';
  } else {
    media = Object.assign(document.createElement('img'), { src: item.thumb, alt: item.title });
    media.className = 'lb-media';
  }
  const cap = document.createElement('div');
  cap.className = 'lb-cap';
  cap.append(Object.assign(document.createElement('b'), { textContent: item.title }));
  for (const tag of item.tags ?? []) cap.append(Object.assign(document.createElement('span'), { className: 'lb-tag', textContent: tag }));
  if (item.desc) cap.append(Object.assign(document.createElement('span'), { className: 'lb-desc', textContent: item.desc }));
  if (item.link) cap.append(Object.assign(document.createElement('a'), { className: 'lb-open', href: item.link, target: '_blank', rel: 'noopener', textContent: 'Open ↗' }));
  const x = Object.assign(document.createElement('button'), { type: 'button', className: 'lb-close', textContent: '×' });
  x.setAttribute('aria-label', 'Close');
  root.append(media, cap, x);
  document.body.append(root);

  // FLIP: measure the final box, start it scaled down onto the billboard, then let it grow
  const flip = (r) => {
    if (!r) return 'scale(.92)';
    const f = media.getBoundingClientRect();
    return `translate(${r.x + r.w / 2 - (f.x + f.width / 2)}px, ${r.y + r.h / 2 - (f.y + f.height / 2)}px) scale(${r.w / f.width}, ${r.h / f.height})`;
  };
  media.style.transform = flip(fromRect());
  root.getBoundingClientRect();
  requestAnimationFrame(() => { root.classList.add('open'); media.style.transform = ''; });

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    removeEventListener('keydown', onKey, true);
    root.classList.remove('open');
    media.style.transform = flip(fromRect());
    setTimeout(() => { root.remove(); onClose?.(); }, 550);
  };
  // capture phase: while open, keys never reach the driving controls
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    e.stopImmediatePropagation();
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
  };
  addEventListener('keydown', onKey, true);
  root.addEventListener('click', (e) => { if (!e.target.closest('.lb-open, iframe')) close(); });
  x.focus();
}
