// A quiet synthesized room tone plus a soft whoosh when a card comes off the wall.
// Nothing is downloaded; it's all Web Audio, and it only starts after a click.
export class Ambience {
  constructor() {
    this.ctx = null;
    this.on = false;
  }

  _build() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    filter.Q.value = 0.6;
    filter.connect(master);

    // three slow, slightly detuned voices: A, E, C#
    [[110, 'sine', 0.5], [164.81, 'triangle', 0.18], [277.18, 'sine', 0.07], [110.6, 'sine', 0.35]].forEach(([f, type, g]) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const gain = ctx.createGain();
      gain.gain.value = g;
      o.connect(gain).connect(filter);
      o.start();
    });

    // breathe the filter
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();

    // shared noise buffer for whooshes
    const len = ctx.sampleRate * 1.2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.ctx = ctx;
    this.master = master;
    this.noise = buf;
  }

  toggle() {
    if (!this.ctx) this._build();
    this.on = !this.on;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(this.on ? 0.07 : 0, t, 0.6);
    return this.on;
  }

  whoosh() {
    if (!this.on || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(2400, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start(t);
    src.stop(t + 1);
  }
}
