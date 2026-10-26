/* Tide Keeper — sons synthétisés avec la Web Audio API (aucun fichier audio). */
window.Sfx = (() => {
  'use strict';
  let ac = null;
  let master = null;
  let muted = false;
  let noiseBuf = null;
  const VOLUME = 0.5;

  function init() {
    if (ac) {
      if (ac.state === 'suspended') ac.resume();
      return;
    }
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain();
      master.gain.value = muted ? 0 : VOLUME;
      master.connect(ac.destination);
      startAmbient();
    } catch (e) {
      ac = null;
    }
  }

  function envelope(g, t0, attack, dur, vol) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + dur);
  }

  function tone(freq, dur, opt = {}) {
    if (!ac) return;
    const { type = 'sine', vol = 0.2, slide = 0, delay = 0, attack = 0.01 } = opt;
    const t0 = ac.currentTime + delay;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + attack + dur);
    envelope(g, t0, attack, dur, vol);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + attack + dur + 0.05);
  }

  function getNoise() {
    if (noiseBuf) return noiseBuf;
    const len = ac.sampleRate * 2;
    noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  function noise(dur, opt = {}) {
    if (!ac) return;
    const { vol = 0.2, freq = 1000, q = 1, type = 'lowpass', delay = 0, attack = 0.01 } = opt;
    const t0 = ac.currentTime + delay;
    const src = ac.createBufferSource();
    src.buffer = getNoise();
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ac.createGain();
    envelope(g, t0, attack, dur, vol);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0, Math.random());
    src.stop(t0 + attack + dur + 0.05);
  }

  // Ressac : bruit brun filtré, modulé lentement comme une houle.
  function startAmbient() {
    const len = ac.sampleRate * 4;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 480;
    const g = ac.createGain();
    g.gain.value = 0.14;
    const lfo = ac.createOscillator();
    lfo.frequency.value = 0.11;
    const lg = ac.createGain();
    lg.gain.value = 0.07;
    lfo.connect(lg);
    lg.connect(g.gain);
    lfo.start();
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start();
  }

  return {
    init,
    dock() {
      tone(523, 0.18, { type: 'triangle', vol: 0.18 });
      tone(784, 0.25, { type: 'triangle', vol: 0.15, delay: 0.09 });
      tone(1046, 0.3, { type: 'sine', vol: 0.08, delay: 0.18 });
    },
    oil() {
      tone(330, 0.12, { vol: 0.15 });
      tone(440, 0.18, { vol: 0.12, delay: 0.07 });
    },
    sink() {
      tone(160, 0.8, { type: 'sawtooth', vol: 0.1, slide: -110 });
      noise(0.7, { vol: 0.25, freq: 500 });
    },
    hurt() {
      tone(90, 0.5, { type: 'square', vol: 0.1, slide: -40 });
      noise(0.4, { vol: 0.3, freq: 300 });
    },
    burn() {
      noise(0.12, { vol: 0.05, freq: 3500, type: 'bandpass', q: 0.8 });
    },
    kill() {
      noise(0.35, { vol: 0.18, freq: 1800, type: 'bandpass' });
      tone(220, 0.35, { type: 'sawtooth', vol: 0.07, slide: -150 });
    },
    horn() {
      tone(98, 1.2, { type: 'sawtooth', vol: 0.14, attack: 0.08 });
      tone(73.4, 1.2, { type: 'sawtooth', vol: 0.09, attack: 0.1 });
      noise(1.0, { vol: 0.05, freq: 200, attack: 0.1 });
    },
    night() {
      tone(196, 0.9, { vol: 0.12, attack: 0.1 });
      tone(233, 0.9, { vol: 0.08, delay: 0.25, attack: 0.1 });
    },
    dawn() {
      [392, 494, 587, 784].forEach((f, i) => tone(f, 0.5, { type: 'triangle', vol: 0.1, delay: i * 0.12 }));
    },
    click() {
      tone(880, 0.06, { type: 'square', vol: 0.04 });
    },
    over() {
      [392, 330, 262, 196].forEach((f, i) => tone(f, 0.6, { type: 'triangle', vol: 0.12, delay: i * 0.22 }));
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.setTargetAtTime(muted ? 0 : VOLUME, ac.currentTime, 0.05);
      return muted;
    },
    get muted() {
      return muted;
    },
  };
})();
