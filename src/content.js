// Portfolio content lives here; the scene and dock read it.

// GEAR 1 — case studies, shown on the overhead billboard bridges in this order.
// Each id is a folder: public/work/<id>/deck.md (+ cover and slide media). Format: public/work/README.md
export const caseStudies = ['paytm-upi-rewards', 'footer-games', 'vudio-onboarding'];

// GEARS 2-4 — shown on vertical roadside boards. thumb = board image; media = what opens on click (image, .gif or .mp4).
const M = './media/';
export const motion = [
  { id: 'windmill', title: 'Windmill', desc: 'Sails, clouds and mist over a meadow, animated in Figma. Shown at Figma Config India.', thumb: M + 'motion/windmill.jpg', media: M + 'motion/windmill.mp4' },
  { id: 'zepto', title: 'Zepto Independence Day', desc: 'Festive home screen with lotus flowers drifting behind the search bar.', thumb: M + 'motion/zepto.jpg', media: M + 'motion/zepto.mp4' },
  { id: 'swiggy-gita', title: 'Swiggy Gita', desc: 'Illustrated Gita scene: Krishna and Arjuna on a chariot.', thumb: M + 'motion/swiggy-gita.jpg', media: M + 'motion/swiggy-gita.mp4' },
  { id: 'macintosh', title: 'Macintosh', desc: 'A classic Mac that boots up and says hello.', thumb: M + 'motion/macintosh.jpg', media: M + 'motion/macintosh.mp4' },
  { id: 'blinkit', title: 'Blinkit', desc: 'A delight burst on the Blinkit home screen.', thumb: M + 'motion/blinkit.jpg', media: M + 'motion/blinkit.mp4' },
  { id: 'coffee', title: 'Coffee order', desc: 'Pick a drink, drop it in the cup, watch it pour.', thumb: M + 'motion/coffee.jpg', media: M + 'motion/coffee.mp4' },
  { id: 'et-money', title: 'ET Money review prompt', desc: "Rating prompt, inspired by Jayant Mandan's work for ET Money.", thumb: M + 'motion/et-money.jpg', media: M + 'motion/et-money.mp4' },
  { id: 'framer', title: 'Framer logo', desc: 'The Framer mark folding into place.', thumb: M + 'motion/framer.jpg', media: M + 'motion/framer.mp4' },
  { id: 'zomato-christmas', title: 'Zomato Christmas', desc: 'A snowy Christmas card for Zomato.', thumb: M + 'motion/zomato-christmas.jpg', media: M + 'motion/zomato-christmas.mp4' },
  { id: 'pixel-pusher', title: 'Pixel Pusher Party', desc: 'Pixel-art party invite with Figma masking and motion.', thumb: M + 'motion/pixel-pusher-party.gif', media: M + 'motion/pixel-pusher-party.gif' },
];
export const visuals = [
  { id: 'mac', title: 'Mac', desc: 'Macintosh illustration with a Hindi greeting. Figma.', thumb: M + 'visual/macintosh-illustration.jpg' },
  { id: 'independence-day', title: 'Independence Day', desc: '75 years of independence, for StartEx. Photoshop.', thumb: M + 'visual/independence-day.png' },
  { id: 'kargil-diwas', title: 'Kargil Diwas', desc: 'Tribute to Kargil Vijay Diwas. Photoshop.', thumb: M + 'visual/kargil-diwas.jpg' },
  { id: 'sakura', title: 'Sakura', desc: 'Spring portrait with cherry blossoms. Photoshop.', thumb: M + 'visual/sakura.jpg' },
  { id: 'classie-hippie', title: 'Classie Hippie', desc: 'Warm, outdoorsy cafe visual. Photoshop.', thumb: M + 'visual/classie-hippie.jpg' },
];
// tags: tools used. All built with Claude as the coding agent; Lotus Boat also used Figma.
export const ai = [
  { id: 'lotus-boat', title: 'Lotus Boat', desc: 'Draw a path and row a boat through a lotus pond.', tags: ['Claude', 'Figma'], thumb: M + 'ai/lotus-boat.jpg', link: 'https://lotusandboat.vercel.app/' },
  { id: 'ramayan', title: 'Ananta', desc: 'A scroll story before the first light: the cosmic ocean, the lotus and Narayana, drawn in particles.', tags: ['Claude'], thumb: M + 'ai/ramayan.jpg', link: 'https://ramayan-scroll.vercel.app/' },
  { id: 'typing-defense', title: 'Typing Defense', desc: 'An isometric typing defense: walkers march down three lanes, every typed word is a shot.', tags: ['Claude'], thumb: M + 'ai/typing-defense.jpg', link: 'https://typingarcade.vercel.app/' },
  { id: 'linkedin-writer', title: 'LinkedIn Writer', desc: 'A post editor with a live LinkedIn preview and writing checks.', tags: ['Claude'], thumb: M + 'ai/linkedin-writer.jpg', link: 'https://linkedinwriter-woad.vercel.app/' },
  { id: 'hold-the-road', title: 'Hold The Road', desc: 'A five-act archer game: hunt in the night woods, then break into the fort and the palace.', tags: ['Claude'], thumb: M + 'ai/hold-the-road.jpg', link: 'https://shooting-game-red-tau.vercel.app/' },
  { id: 'type-arcade', title: 'Type Arcade', desc: 'A stick-figure typing shooter drawn in hairlines. Every correct letter is a bullet.', tags: ['Claude'], thumb: M + 'ai/type-arcade.jpg', link: 'https://hairlinetyping.vercel.app/' },
];

// Dock gears (left). key = keyboard shortcut.
export const gears = [
  { id: 'case', key: '1', short: 'C', label: 'Case studies' },
  { id: 'motion', key: '2', short: 'M', label: 'Motion' },
  { id: 'visuals', key: '3', short: 'V', label: 'Visuals' },
  { id: 'ai', key: '4', short: 'A', label: 'AI' },
];

// Dock pedals (right) = contact.
export const contacts = [
  { pedal: 'Clutch', label: 'LinkedIn', href: 'https://www.linkedin.com/in/shivam-kumar-ui-ux-design/' },
  { pedal: 'Brake', label: 'Email', href: 'mailto:shivamatdesign@gmail.com' },
  { pedal: 'Accelerator', label: 'WhatsApp', href: 'https://wa.me/919523425411' },
  { pedal: 'Horn', label: 'X', href: 'https://x.com/shivamkrux' },
];
