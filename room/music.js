// A small lo-fi loop for the record player, synthesised with Web Audio so
// there's no audio file to download. Fmaj7 - Em7 - Dm7 - Cmaj7 at 72 bpm,
// swung eighths, soft kick/snare/hat and some vinyl crackle.

const BPM = 72;
const EIGHTH = 60 / BPM / 2;
const SWING = 0.06;

// MIDI notes
const CHORDS = [
    [53, 57, 60, 64], // Fmaj7
    [52, 55, 59, 62], // Em7
    [50, 53, 57, 60], // Dm7
    [48, 52, 55, 59]  // Cmaj7
];
// One note (or null) per eighth across the four bars.
const MELODY = [
    76, null, 72, null, 74, null, null, 69,
    71, null, 67, null, 69, null, 71, null,
    72, null, 69, null, 65, null, 67, 69,
    67, null, null, 64, 62, null, 64, null
];
const KICK = [1, 0, 0, 0, 0, 1, 0, 0];
const SNARE = [0, 0, 1, 0, 0, 0, 1, 0];

const freq = n => 440 * Math.pow(2, (n - 69) / 12);

export class LofiPlayer {
    constructor() {
        this.ctx = null;
        this.playing = false;
    }

    setup() {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ctx = this.ctx = new Ctx();

        this.master = ctx.createGain();
        this.master.gain.value = 0;
        const tone = ctx.createBiquadFilter();
        tone.type = 'lowpass';
        tone.frequency.value = 1900;
        tone.Q.value = 0.6;
        this.master.connect(tone).connect(ctx.destination);

        // White noise for drums.
        const len = ctx.sampleRate;
        this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

        // Vinyl crackle: sparse clicks, looped.
        const crackle = ctx.createBuffer(1, len * 2, ctx.sampleRate);
        const c = crackle.getChannelData(0);
        for (let i = 0; i < c.length; i++) c[i] = Math.random() < 0.0009 ? (Math.random() * 2 - 1) : (Math.random() * 2 - 1) * 0.012;
        const src = ctx.createBufferSource();
        src.buffer = crackle;
        src.loop = true;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 1200;
        const g = ctx.createGain();
        g.gain.value = 0.18;
        src.connect(hp).connect(g).connect(this.master);
        src.start();
    }

    toggle() {
        if (this.playing) this.stop(); else this.start();
        return this.playing;
    }

    start() {
        if (!this.ctx) this.setup();
        const ctx = this.ctx;
        clearTimeout(this.suspendTimer);
        ctx.resume();
        this.playing = true;
        this.step = 0;
        this.next = ctx.currentTime + 0.12;
        this.master.gain.cancelScheduledValues(ctx.currentTime);
        this.master.gain.setTargetAtTime(0.42, ctx.currentTime, 0.4);
        clearInterval(this.timer);
        this.timer = setInterval(() => this.schedule(), 25);
    }

    stop() {
        if (!this.ctx || !this.playing) return;
        this.playing = false;
        clearInterval(this.timer);
        this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
        // Let the fade finish, then stop the audio thread (saves battery).
        clearTimeout(this.suspendTimer);
        this.suspendTimer = setTimeout(() => { if (!this.playing) this.ctx.suspend(); }, 700);
    }

    schedule() {
        while (this.next < this.ctx.currentTime + 0.15) {
            this.play(this.step, this.next + (this.step % 2 ? SWING : 0));
            this.next += EIGHTH;
            this.step = (this.step + 1) % 32;
        }
    }

    play(step, t) {
        const bar = Math.floor(step / 8), beat = step % 8;
        if (beat === 0) CHORDS[bar].forEach(n => this.pad(freq(n), t, EIGHTH * 8));
        if (MELODY[step]) this.pluck(freq(MELODY[step]), t);
        if (KICK[beat]) this.kick(t);
        if (SNARE[beat]) this.snare(t);
        this.hat(t, beat % 2 ? 0.035 : 0.055);
    }

    voice(type, f, t, peak, attack, decay, detune = 0) {
        const ctx = this.ctx;
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f;
        o.detune.value = detune;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(peak, t + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
        o.connect(g).connect(this.master);
        o.start(t);
        o.stop(t + attack + decay + 0.05);
    }

    pad(f, t, len) {
        this.voice('triangle', f, t, 0.035, 0.25, len, -7);
        this.voice('triangle', f, t, 0.035, 0.25, len, 7);
    }

    pluck(f, t) {
        this.voice('sine', f, t, 0.09, 0.01, 0.6);
        this.voice('triangle', f * 2, t, 0.015, 0.01, 0.25);
    }

    kick(t) {
        const ctx = this.ctx;
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(120, t);
        o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.55, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
        o.connect(g).connect(this.master);
        o.start(t);
        o.stop(t + 0.35);
    }

    noiseHit(t, type, f, peak, len) {
        const ctx = this.ctx;
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        const filter = ctx.createBiquadFilter();
        filter.type = type;
        filter.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(peak, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + len);
        src.connect(filter).connect(g).connect(this.master);
        src.start(t, Math.random() * 0.5);
        src.stop(t + len + 0.02);
    }

    snare(t) {
        this.noiseHit(t, 'bandpass', 1700, 0.22, 0.18);
        this.voice('sine', 190, t, 0.08, 0.002, 0.08);
    }

    hat(t, peak) {
        this.noiseHit(t, 'highpass', 7000, peak, 0.04);
    }
}
