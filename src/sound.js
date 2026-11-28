// Very quiet engine hum + road noise, synthesised with Web Audio (no audio files). Pitch and level follow speed.
// Browsers only allow audio after a user gesture, so it starts on the first click or key press.
const LEVEL = 0.035; // master volume: deliberately feeble

export function createEngineSound() {
  let ctx = null, master, hum1, hum2, roadGain, humGain, muted = false;

  function start() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : LEVEL;
    master.connect(ctx.destination);

    // engine: two detuned saws through a low-pass filter = soft, distant hum
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 0.7;
    humGain = ctx.createGain();
    humGain.gain.value = 0.5;
    lp.connect(humGain).connect(master);
    hum1 = ctx.createOscillator(); hum2 = ctx.createOscillator();
    hum1.type = hum2.type = 'sawtooth';
    hum1.connect(lp); hum2.connect(lp);
    hum1.start(); hum2.start();

    // road/tyre noise: looping white noise through a band-pass
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf; noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.5;
    roadGain = ctx.createGain();
    roadGain.gain.value = 0;
    noise.connect(bp).connect(roadGain).connect(master);
    noise.start();
  }

  return {
    start,
    get muted() { return muted; },
    toggle() {
      muted = !muted;
      if (ctx) master.gain.setTargetAtTime(muted ? 0 : LEVEL, ctx.currentTime, 0.1);
      return muted;
    },
    // speed in m/s (negative = reversing), max = top speed
    update(speed, max) {
      if (!ctx) return;
      const k = Math.min(1, Math.abs(speed) / max), now = ctx.currentTime;
      hum1.frequency.setTargetAtTime(38 + k * 70, now, 0.15);
      hum2.frequency.setTargetAtTime((38 + k * 70) * 2.01, now, 0.15);
      humGain.gain.setTargetAtTime(0.35 + k * 0.5, now, 0.2);
      roadGain.gain.setTargetAtTime(k * 0.6, now, 0.2);
    },
  };
}
