// All portfolio content lives here. The scene reads it; nothing else needs editing to add work.

// Dock shown once the car comes to rest. `id` is sent in a `portfolio:nav` event on click.
export const dock = {
  nav: [
    { id: 'gear', label: 'Gear' },
    { id: 'menu', label: 'Menu' },
    { id: 'ux', label: 'UX case study' },
    { id: 'motion', label: 'Motion' },
    { id: 'visuals', label: 'Visuals' },
    { id: 'ai', label: 'AI exploration' },
  ],
  // Pedals = contact links. Replace the placeholder hrefs.
  contacts: [
    { id: 'brake', label: 'Brake', href: 'mailto:hello@example.com' },
    { id: 'accelerator', label: 'Accelerator', href: '#' },
    { id: 'clutch', label: 'Clutch', href: '#' },
  ],
};

// Case studies become billboards along the road (next iteration).
// at: metres along the road from where the car stops. side: 'left' | 'right'.
// slides: the deck shown in the overlay when the billboard is clicked.
export const caseStudies = [
  // { id: 'checkout', title: 'Checkout redesign', thumb: '/work/checkout.jpg', at: 40, side: 'right', slides: [] },
];

// Small vertical sideboards for Motion / Visuals / AI work (next iteration).
export const sideboards = [
  // { id: 'reel-01', category: 'motion', media: '/work/reel.mp4', at: 60, side: 'left' },
];
