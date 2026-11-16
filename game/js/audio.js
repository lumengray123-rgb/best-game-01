// All sound is synthesized with WebAudio — no audio files, no network.
// Short oscillator blips for actions, a slow detuned pad for the night's hum.

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.padNodes = null;
    this.lastPlay = {};
  }

  // Browsers require a user gesture before audio starts; call from a click/key.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.startPad();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  // A low ambient drone: two detuned sines through a lowpass, gently breathing.
  startPad() {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const oscA = ctx.createOscillator();
    oscA.type = 'sine';
    oscA.frequency.value = 55;
    const oscB = ctx.createOscillator();
    oscB.type = 'sine';
    oscB.frequency.value = 55.4;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    oscA.start();
    oscB.start();
    lfo.start();
    this.padNodes = { gain };
  }

  // One short tone: a frequency sweep with an exponential decay envelope.
  blip({ freq, freqEnd, dur, type, vol, when = 0 }) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // Rate-limit a named sound so a crowded frame doesn't clip the mix.
  throttle(name, minGapMs) {
    const now = performance.now();
    if (now - (this.lastPlay[name] || 0) < minGapMs) return false;
    this.lastPlay[name] = now;
    return true;
  }

  shoot() {
    if (!this.throttle('shoot', 70)) return;
    this.blip({ freq: 880, freqEnd: 520, dur: 0.09, type: 'triangle', vol: 0.10 });
  }

  hit() {
    if (!this.throttle('hit', 50)) return;
    this.blip({ freq: 240, freqEnd: 120, dur: 0.07, type: 'square', vol: 0.06 });
  }

  enemyDie() {
    if (!this.throttle('die', 60)) return;
    this.blip({ freq: 420, freqEnd: 60, dur: 0.22, type: 'sawtooth', vol: 0.09 });
  }

  pickup() {
    if (!this.throttle('pickup', 55)) return;
    this.blip({ freq: 1320, freqEnd: 1760, dur: 0.08, type: 'sine', vol: 0.09 });
  }

  levelUp() {
    this.blip({ freq: 523, dur: 0.14, type: 'triangle', vol: 0.14 });
    this.blip({ freq: 659, dur: 0.14, type: 'triangle', vol: 0.14, when: 0.09 });
    this.blip({ freq: 784, dur: 0.22, type: 'triangle', vol: 0.16, when: 0.18 });
  }

  hurt() {
    if (!this.throttle('hurt', 200)) return;
    this.blip({ freq: 160, freqEnd: 55, dur: 0.28, type: 'sawtooth', vol: 0.18 });
  }

  nova() {
    this.blip({ freq: 180, freqEnd: 900, dur: 0.35, type: 'sine', vol: 0.16 });
    this.blip({ freq: 90, freqEnd: 40, dur: 0.4, type: 'triangle', vol: 0.14 });
  }

  dash() {
    this.blip({ freq: 300, freqEnd: 900, dur: 0.12, type: 'sine', vol: 0.08 });
  }

  click() {
    this.blip({ freq: 660, dur: 0.06, type: 'triangle', vol: 0.08 });
  }

  surge() {
    this.blip({ freq: 110, freqEnd: 220, dur: 0.5, type: 'sawtooth', vol: 0.12 });
    this.blip({ freq: 165, freqEnd: 330, dur: 0.5, type: 'sawtooth', vol: 0.08, when: 0.08 });
  }

  gameOver() {
    this.blip({ freq: 392, dur: 0.4, type: 'triangle', vol: 0.14 });
    this.blip({ freq: 311, dur: 0.4, type: 'triangle', vol: 0.14, when: 0.3 });
    this.blip({ freq: 233, dur: 0.7, type: 'triangle', vol: 0.14, when: 0.6 });
  }
}
