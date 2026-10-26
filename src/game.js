/* Tide Keeper — gardien de phare.
 * Canvas 2D, JavaScript pur, aucune dépendance.
 * Le monde est un disque centré sur l'île (0,0) ; l'écran est mis à l'échelle autour.
 */
(() => {
  'use strict';

  // ---------------------------------------------------------------- outils
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const hyp = Math.hypot;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  function angDiff(a, b) {
    let d = (a - b) % TAU;
    if (d > Math.PI) d -= TAU;
    else if (d < -Math.PI) d += TAU;
    return d;
  }

  // ---------------------------------------------------------------- réglages
  const ISLAND_R = 46;
  const WORLD_R = 520;
  const SPAWN_R = 600;
  const VIEW_R = 490;
  const BEST_KEY = 'tidekeeper.best';

  const MON = {
    crawler:   { hp: 40,  r: 15, sp: 17, score: 60,  limbs: 5, body: '#2a1a3a', limb: '#3d2552', eye: '#7df9ff' },
    eel:       { hp: 22,  r: 10, sp: 32, score: 80,  limbs: 2, body: '#14263a', limb: '#1d3a52', eye: '#ff4d6d' },
    leviathan: { hp: 170, r: 28, sp: 9,  score: 250, limbs: 7, body: '#2b0f24', limb: '#451a3a', eye: '#ffb703' },
  };
  const HULLS = ['#8a4b2a', '#5b3a29', '#3f5d7a', '#7a2f2f'];
  const UPGRADES = {
    wide:   { name: 'Lentille de Fresnel', desc: 'Faisceau large 25 % plus ouvert.', max: 3, icon: '◐' },
    reach:  { name: 'Miroir poli', desc: 'Portée du faisceau +20 %.', max: 3, icon: '➶' },
    burn:   { name: 'Cristal ardent', desc: 'La lumière brûle 35 % plus fort.', max: 4, icon: '✶' },
    tank:   { name: 'Grand réservoir', desc: '+40 d’huile max, réservoir rempli.', max: 3, icon: '▮' },
    thrift: { name: 'Mèche économe', desc: 'Consommation d’huile −22 %.', max: 3, icon: '≈' },
    hull:   { name: 'Charpentier du port', desc: '+1 vie maximum, et une vie rendue.', max: 3, icon: '⚓︎' },
    horn:   { name: 'Corne de bronze', desc: 'Recharge de la corne −30 %.', max: 3, icon: '◎' },
    pilot:  { name: 'Pilote du port', desc: 'Navires guidés plus rapides, et guidés plus longtemps.', max: 2, icon: '➤' },
  };

  // ---------------------------------------------------------------- canvas
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const dark = document.createElement('canvas');
  const dctx = dark.getContext('2d');
  let W = 0, H = 0, DPR = 1, CX = 0, CY = 0, S = 1;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    dark.width = canvas.width;
    dark.height = canvas.height;
    CX = W / 2;
    CY = H / 2;
    // En portrait on zoome un peu : sinon tout devient minuscule sur téléphone.
    S = Math.max(Math.min(W, H) / (2 * VIEW_R), Math.max(W, H) / (2 * VIEW_R * 1.7));
  }
  // Rayon du monde visible sur le petit côté de l'écran (pour placer les récifs à l'écran).
  const visibleR = () => Math.min(440, Math.max(300, Math.min(W, H) / (2 * S) - 35));
  window.addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------------- DOM
  const $ = (id) => document.getElementById(id);
  const ui = {
    hud: $('hud'), night: $('hNight'), lives: $('hLives'), score: $('hScore'), combo: $('hCombo'),
    oil: $('hOil'), horn: $('hHorn'), banner: $('banner'), vignette: $('vignette'),
    touch: $('touch'), tFocus: $('tFocus'), tHorn: $('tHorn'),
    btnPause: $('btnPause'), btnMute: $('btnMute'),
    bestTitle: $('bestTitle'), dawnTitle: $('dawnTitle'), dawnStats: $('dawnStats'), cards: $('cards'),
    overTitle: $('overTitle'), overStats: $('overStats'),
  };
  const isTouch = window.matchMedia('(pointer: coarse)').matches;

  function showOverlay(id) {
    for (const o of document.querySelectorAll('.overlay')) o.classList.toggle('show', o.id === id);
  }

  function loadBest() {
    try { return parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) { return 0; }
  }
  function saveBest(v) {
    try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) { /* stockage indisponible */ }
  }
  const fmt = (n) => Math.round(n).toLocaleString('fr-FR');

  let bannerTimer = 0;
  function banner(text, sub = '') {
    ui.banner.innerHTML = text + (sub ? `<small>${sub}</small>` : '');
    ui.banner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => ui.banner.classList.remove('show'), 2200);
  }
  let vignetteTimer = 0;
  function flashDanger() {
    ui.vignette.style.transition = 'none';
    ui.vignette.style.opacity = '1';
    clearTimeout(vignetteTimer);
    vignetteTimer = setTimeout(() => {
      ui.vignette.style.transition = 'opacity 0.6s ease-out';
      ui.vignette.style.opacity = '0';
    }, 60);
  }

  // ---------------------------------------------------------------- génération
  function genRocks(n, existing = []) {
    const rocks = existing.slice();
    let tries = 0;
    while (rocks.length < n && tries < 800) {
      tries++;
      const a = rand(0, TAU);
      const d = rand(140, visibleR());
      const r = rand(13, 28);
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      if (rocks.some((o) => hyp(o.x - x, o.y - y) < o.r + r + 55)) continue;
      const pts = [];
      const k = randi(6, 9);
      for (let i = 0; i < k; i++) {
        const aa = (i / k) * TAU + rand(-0.25, 0.25);
        const rr = r * rand(0.75, 1.15);
        pts.push([Math.cos(aa) * rr, Math.sin(aa) * rr]);
      }
      rocks.push({ x, y, r, pts, phase: rand(0, TAU) });
    }
    return rocks;
  }

  function genWaves() {
    const w = [];
    for (let i = 0; i < 260; i++) {
      w.push({ x: rand(-1000, 1000), y: rand(-800, 800), l: rand(8, 22), p: rand(0, TAU), s: rand(0.5, 1.4) });
    }
    return w;
  }

  // ---------------------------------------------------------------- état
  let G = null;
  let best = loadBest();

  function newGame(state = 'play') {
    G = {
      state,
      t: 0,
      night: 0,
      score: 0,
      lives: 3,
      maxLives: 3,
      oil: 100,
      oilMax: 100,
      combo: 0,
      ships: [],
      monsters: [],
      barrels: [],
      particles: [],
      rocks: genRocks(10),
      waves: genWaves(),
      queue: [],
      nightT: 0,
      beamA: -Math.PI / 2,
      keyAim: -Math.PI / 2,
      aimMode: 'pointer',
      hornCD: 0,
      hornCDMax: 1,
      shake: 0,
      overT: null,
      dawnT: null,
      burnT: 0,
      up: { wide: 0, reach: 0, burn: 0, tank: 0, thrift: 0, hull: 0, horn: 0, pilot: 0 },
      stats: { docked: 0, sunk: 0, killed: 0 },
      nightStats: { docked: 0, sunk: 0, killed: 0, score0: 0 },
    };
  }

  const comboMult = () => Math.min(4, 1 + Math.floor(G.combo / 3) * 0.5);

  // ---------------------------------------------------------------- entrées
  const pointer = { x: CX, y: CY - 100 };
  const touches = new Set();
  const keys = { l: false, r: false };
  let mouseFocus = false, keyFocus = false, btnFocus = false;

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' && !e.isPrimary) return;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    if (G) G.aimMode = 'pointer';
  });
  canvas.addEventListener('pointerdown', (e) => {
    Sfx.init();
    if (e.pointerType === 'touch') {
      touches.add(e.pointerId);
      if (e.isPrimary) { pointer.x = e.clientX; pointer.y = e.clientY; }
      if (touches.size >= 2) mouseFocus = true;
    } else {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      if (e.button === 0) mouseFocus = true;
      else if (e.button === 2) horn();
    }
    if (G) G.aimMode = 'pointer';
  });
  const endPointer = (e) => {
    if (e.pointerType === 'touch') {
      touches.delete(e.pointerId);
      if (touches.size < 2) mouseFocus = false;
    } else if (e.button === 0) {
      mouseFocus = false;
    }
  };
  window.addEventListener('pointerup', endPointer);
  window.addEventListener('pointercancel', endPointer);

  window.addEventListener('keydown', (e) => {
    switch (e.code) {
      case 'Space': keyFocus = true; e.preventDefault(); break;
      case 'KeyF': case 'KeyE': horn(); break;
      case 'KeyP': case 'Escape': togglePause(); break;
      case 'KeyM': toggleMute(); break;
      case 'ArrowLeft': case 'KeyA': case 'KeyQ': keys.l = true; startKeyAim(); e.preventDefault(); break;
      case 'ArrowRight': case 'KeyD': keys.r = true; startKeyAim(); e.preventDefault(); break;
      case 'Enter':
        if (G.state === 'title' || G.state === 'over') start();
        break;
      case 'Digit1': case 'Digit2': case 'Digit3': {
        if (G.state === 'dawn') {
          const card = ui.cards.children[Number(e.code.slice(-1)) - 1];
          if (card) card.click();
        }
        break;
      }
      default: break;
    }
  });
  window.addEventListener('keyup', (e) => {
    switch (e.code) {
      case 'Space': keyFocus = false; break;
      case 'ArrowLeft': case 'KeyA': case 'KeyQ': keys.l = false; break;
      case 'ArrowRight': case 'KeyD': keys.r = false; break;
      default: break;
    }
  });
  function startKeyAim() {
    if (G && G.aimMode !== 'key') {
      G.aimMode = 'key';
      G.keyAim = G.beamA;
    }
  }

  const holdBtn = (el, on, off) => {
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); Sfx.init(); el.classList.add('active'); on(); });
    const up = () => { el.classList.remove('active'); off(); };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
  };
  holdBtn(ui.tFocus, () => { btnFocus = true; }, () => { btnFocus = false; });
  holdBtn(ui.tHorn, () => horn(), () => {});

  ui.btnMute.addEventListener('click', () => { Sfx.init(); toggleMute(); });
  ui.btnPause.addEventListener('click', () => togglePause());
  $('btnStart').addEventListener('click', () => start());
  $('btnRestart').addEventListener('click', () => start());
  $('btnResume').addEventListener('click', () => togglePause());
  $('btnQuit').addEventListener('click', () => gameOver(true));

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G && G.state === 'play') togglePause();
  });

  function toggleMute() {
    const m = Sfx.toggleMute();
    ui.btnMute.classList.toggle('off', m);
    ui.btnMute.setAttribute('aria-label', m ? 'Activer le son' : 'Couper le son');
  }

  function togglePause() {
    if (!G) return;
    if (G.state === 'play') {
      G.state = 'paused';
      showOverlay('pause');
    } else if (G.state === 'paused') {
      G.state = 'play';
      showOverlay(null);
    }
  }

  // ---------------------------------------------------------------- déroulé
  function start() {
    Sfx.init();
    Sfx.click();
    newGame('play');
    showOverlay(null);
    ui.hud.classList.remove('hidden');
    ui.btnPause.classList.remove('hidden');
    ui.touch.classList.toggle('hidden', !isTouch);
    hudCache = {};
    startNight();
  }

  function pickMonster(n) {
    const r = Math.random();
    if (n >= 5 && r < 0.15 + 0.03 * n) return 'leviathan';
    if (n >= 3 && r < 0.5) return 'eel';
    return 'crawler';
  }

  function startNight() {
    G.night++;
    const n = G.night;
    if (n > 1 && n % 2 === 1) G.rocks = genRocks(Math.min(16, G.rocks.length + 1), G.rocks);
    const ships = 3 + n * 2;
    const mons = 1 + Math.floor(n * 1.7);
    const barrels = 1 + Math.floor(n / 2);
    const dur = 30 + n * 6;
    const q = [];
    for (let i = 0; i < ships; i++) q.push({ t: 1.5 + (i / ships) * dur + rand(-1.5, 1.5), kind: 'ship' });
    for (let i = 0; i < mons; i++) q.push({ t: 5 + (i / mons) * dur + rand(-2, 2), kind: pickMonster(n) });
    for (let i = 0; i < barrels; i++) q.push({ t: rand(6, dur), kind: 'barrel' });
    q.sort((a, b) => a.t - b.t);
    G.queue = q;
    G.nightT = 0;
    G.dawnT = null;
    G.nightStats = { docked: 0, sunk: 0, killed: 0, score0: G.score };
    G.state = 'play';
    const subs = [
      'Les navires cherchent ta lumière',
      'Quelque chose remue sous les vagues',
      'La brume s’épaissit',
      'Les abysses s’impatientent',
      'Tiens bon, gardien',
    ];
    banner(`Nuit ${n}`, n === 1 ? 'Guide les navires jusqu’à l’île' : pick(subs));
    Sfx.night();
  }

  function endNight() {
    const ns = G.nightStats;
    const perfect = ns.sunk === 0;
    const bonus = 100 * G.night + (perfect ? 150 * G.night : 0);
    G.score += bonus;
    G.oil = Math.min(G.oilMax, G.oil + 40);
    G.barrels = [];
    G.state = 'dawn';
    Sfx.dawn();

    ui.dawnTitle.textContent = `Nuit ${G.night} survécue`;
    ui.dawnStats.innerHTML = [
      stat(ns.docked, 'navires à quai'),
      stat(ns.killed, 'créatures brûlées'),
      stat(ns.sunk, 'naufrages'),
      stat('+' + fmt(bonus), perfect ? 'bonus nuit parfaite' : 'bonus de l’aube', true),
    ].join('');

    const pool = Object.keys(UPGRADES).filter((k) => G.up[k] < UPGRADES[k].max);
    const choices = [];
    while (choices.length < 3 && pool.length) {
      choices.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    ui.cards.innerHTML = '';
    choices.forEach((k, i) => {
      const u = UPGRADES[k];
      const b = document.createElement('button');
      b.className = 'card';
      const lv = Array.from({ length: u.max }, (_, j) => `<i class="${j < G.up[k] + 1 ? 'on' : ''}"></i>`).join('');
      b.innerHTML = `<div class="ic">${u.icon}</div><div class="nm">${u.name}</div><div class="ds">${u.desc}</div><div class="lv">${lv}</div>${isTouch ? '' : `<div class="key">Touche ${i + 1}</div>`}`;
      b.addEventListener('click', () => {
        applyUpgrade(k);
        Sfx.click();
        showOverlay(null);
        startNight();
      });
      ui.cards.appendChild(b);
    });
    showOverlay('dawn');
  }

  const stat = (v, label, hl = false) => `<div class="stat${hl ? ' hl' : ''}"><b>${typeof v === 'number' ? fmt(v) : v}</b><span>${label}</span></div>`;

  function applyUpgrade(k) {
    G.up[k]++;
    if (k === 'tank') {
      G.oilMax += 40;
      G.oil = G.oilMax;
    } else if (k === 'hull') {
      G.maxLives++;
      G.lives = Math.min(G.maxLives, G.lives + 1);
    }
  }

  function gameOver(quit = false) {
    if (!G || G.state === 'over' || G.state === 'title') return;
    G.state = 'over';
    const isBest = G.score > best;
    if (isBest) {
      best = G.score;
      saveBest(best);
    }
    Sfx.over();
    ui.overTitle.textContent = quit ? 'Relève de la garde' : isBest ? 'Nouveau record' : 'Naufrage';
    const survived = Math.max(0, G.night - 1);
    ui.overStats.innerHTML = [
      stat(G.score, 'score', true),
      stat(survived, survived > 1 ? 'nuits survécues' : 'nuit survécue'),
      stat(G.stats.docked, 'navires sauvés'),
      stat(best, 'record'),
    ].join('');
    ui.hud.classList.add('hidden');
    ui.btnPause.classList.add('hidden');
    ui.touch.classList.add('hidden');
    showOverlay('over');
  }

  // ---------------------------------------------------------------- faisceau
  function beamParams() {
    const u = G.up;
    const weak = G.oil <= 0;
    const focus = (mouseFocus || keyFocus || btnFocus) && !weak && G.state === 'play';
    let half = focus ? 0.12 : 0.36 * (1 + 0.25 * u.wide);
    let length = (focus ? 540 : 320) * (1 + 0.2 * u.reach);
    if (weak) {
      length = 150;
      half = 0.3;
    }
    const dps = (focus ? 60 : 22) * (1 + 0.35 * u.burn) * (weak ? 0.3 : 1);
    return { half, length, dps, focus, weak };
  }

  function inBeam(x, y, r, bp) {
    const d = hyp(x, y);
    if (d > bp.length + r) return false;
    if (d < ISLAND_R) return true;
    const a = Math.atan2(y, x);
    return Math.abs(angDiff(a, G.beamA)) <= bp.half + Math.asin(Math.min(1, r / d));
  }

  // ---------------------------------------------------------------- particules
  function burst(x, y, n, opt = {}) {
    const { color = '255,220,160', speed = 60, life = 0.8, size = 2.2, glow = true } = opt;
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const s = rand(0.2, 1) * speed;
      G.particles.push({ type: 'dot', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * rand(0.6, 1), max: life, color, size: size * rand(0.6, 1.3), glow });
    }
  }
  function floatText(x, y, text, color = '#ffd793') {
    G.particles.push({ type: 'text', x, y, vx: 0, vy: -22, life: 1.3, max: 1.3, text, color });
  }
  function ring(x, y, maxR, color = '160,210,255', life = 1) {
    G.particles.push({ type: 'ring', x, y, vx: 0, vy: 0, life, max: life, maxR, color });
  }

  // ---------------------------------------------------------------- apparitions
  function spawn(kind) {
    const a = rand(0, TAU);
    const x = Math.cos(a) * SPAWN_R;
    const y = Math.sin(a) * SPAWN_R;
    if (kind === 'ship') {
      G.ships.push({
        x, y, h: Math.atan2(-y, -x), sp: 20 + G.night * 1.2, r: 10,
        drift: (Math.random() < 0.5 ? -1 : 1) * rand(0.35, 0.85),
        seed: rand(0, 100), guided: 0, state: 'sail', sinkT: 0, hull: pick(HULLS), sail: rand(0, TAU),
      });
    } else if (kind === 'barrel') {
      const d = rand(260, visibleR() + 10);
      G.barrels.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, life: 28, dir: Math.random() < 0.5 ? 1 : -1, spin: rand(0, TAU), pulled: false, fade: 0 });
    } else {
      const T = MON[kind];
      const hp = T.hp * (1 + 0.08 * (G.night - 1));
      G.monsters.push({
        kind, x, y, hp, maxHp: hp, r: T.r, sp: T.sp * (1 + 0.03 * G.night),
        seed: rand(0, 100), hit: 0, stun: 0, pvx: 0, pvy: 0, state: 'swim', dieT: 0, h: Math.atan2(-y, -x),
      });
    }
  }

  // ---------------------------------------------------------------- événements
  function loseLife(x, y) {
    if (G.overT !== null) return;
    G.lives--;
    G.combo = 0;
    G.shake = 0.5;
    G.nightStats.sunk++;
    flashDanger();
    Sfx.hurt();
    if (x !== undefined) floatText(x, y - 14, '−1', '#ff6b7a');
    if (G.lives <= 0) G.overT = 1.4;
  }

  function sinkShip(s) {
    if (s.state !== 'sail') return;
    s.state = 'sink';
    s.sinkT = 0;
    G.stats.sunk++;
    burst(s.x, s.y, 18, { color: '220,240,255', speed: 50, life: 1, size: 2, glow: false });
    Sfx.sink();
    loseLife(s.x, s.y);
  }

  function dock(s) {
    s.dead = true;
    G.combo++;
    const mult = comboMult();
    const pts = Math.round(100 * mult);
    G.score += pts;
    G.oil = Math.min(G.oilMax, G.oil + 15);
    G.stats.docked++;
    G.nightStats.docked++;
    floatText(s.x, s.y - 12, `+${pts}`);
    burst(s.x, s.y, 14, { color: '255,214,140', speed: 45, life: 0.9 });
    Sfx.dock();
  }

  function killMonster(m) {
    m.state = 'die';
    m.dieT = 0;
    const pts = MON[m.kind].score;
    G.score += pts;
    G.stats.killed++;
    G.nightStats.killed++;
    floatText(m.x, m.y - m.r, `+${pts}`, '#ffb36b');
    burst(m.x, m.y, 26 + m.r, { color: '255,150,70', speed: 90, life: 1.1, size: 2.6 });
    Sfx.kill();
  }

  function horn() {
    if (!G || G.state !== 'play' || G.hornCD > 0) return;
    G.hornCD = G.hornCDMax = 15 * Math.pow(0.7, G.up.horn);
    ring(0, 0, 380, '170,215,255', 1.1);
    ring(0, 0, 260, '170,215,255', 0.8);
    for (const m of G.monsters) {
      const d = hyp(m.x, m.y);
      if (d < 380 && m.state === 'swim') {
        const k = 0.4 + (380 - d) / 380;
        m.pvx += (m.x / d) * 240 * k;
        m.pvy += (m.y / d) * 240 * k;
        m.stun = 1.5;
      }
    }
    G.shake = Math.max(G.shake, 0.25);
    Sfx.horn();
  }

  // ---------------------------------------------------------------- mise à jour
  function updateShip(s, dt, bp) {
    if (s.state === 'sink') {
      s.sinkT += dt;
      if (s.sinkT > 1.4) s.dead = true;
      return;
    }
    const d = hyp(s.x, s.y);
    if (inBeam(s.x, s.y, s.r, bp)) s.guided = 1.0 + 0.6 * G.up.pilot;
    else s.guided = Math.max(0, s.guided - dt);

    const toIsland = Math.atan2(-s.y, -s.x);
    let desired;
    if (s.guided > 0) {
      // Cap sur l'île en contournant les récifs.
      let vx = Math.cos(toIsland);
      let vy = Math.sin(toIsland);
      for (const r of G.rocks) {
        const dx = s.x - r.x;
        const dy = s.y - r.y;
        const dd = hyp(dx, dy);
        const range = r.r + 60;
        if (dd < range) {
          const w = ((range - dd) / range) * 2.2;
          vx += (dx / dd) * w;
          vy += (dy / dd) * w;
        }
      }
      desired = Math.atan2(vy, vx);
    } else {
      // Perdu dans la brume : il approche en spirale, au petit bonheur.
      desired = toIsland + s.drift + Math.sin(G.t * 0.6 + s.seed) * 0.5;
      if (d > WORLD_R + 60) desired = toIsland;
    }
    const turn = (s.guided > 0 ? 2.6 : 1.1) * dt;
    s.h += clamp(angDiff(desired, s.h), -turn, turn);
    const sp = s.sp * (s.guided > 0 ? 1.35 * (1 + 0.3 * G.up.pilot) : 1);
    s.x += Math.cos(s.h) * sp * dt;
    s.y += Math.sin(s.h) * sp * dt;
    s.sail += dt;

    for (const r of G.rocks) {
      if (hyp(s.x - r.x, s.y - r.y) < r.r * 0.9 + s.r * 0.8) {
        sinkShip(s);
        return;
      }
    }
    if (d < ISLAND_R + 6) dock(s);
  }

  function updateMonster(m, dt, bp) {
    if (m.state === 'die') {
      m.dieT += dt;
      if (m.dieT > 0.8) m.dead = true;
      return false;
    }
    const lit = inBeam(m.x, m.y, m.r, bp);
    m.hit = lit ? Math.min(1, m.hit + dt * 6) : Math.max(0, m.hit - dt * 3);
    if (lit) {
      m.hp -= bp.dps * dt;
      if (Math.random() < dt * (bp.focus ? 30 : 14)) {
        G.particles.push({ type: 'dot', x: m.x + rand(-m.r, m.r) * 0.7, y: m.y + rand(-m.r, m.r) * 0.7, vx: rand(-15, 15), vy: rand(-35, -10), life: 0.7, max: 0.7, color: '255,150,60', size: rand(1.5, 3), glow: true });
      }
      if (m.hp <= 0) {
        killMonster(m);
        return false;
      }
    }
    if (m.stun > 0) m.stun -= dt;

    const toIsland = Math.atan2(-m.y, -m.x);
    const eel = m.kind === 'eel';
    m.h = toIsland + Math.sin(G.t * (eel ? 5 : 2) + m.seed) * (eel ? 0.6 : 0.35);
    let sp = m.sp;
    if (lit) sp *= bp.focus ? 0.12 : 0.35;
    if (m.stun > 0) sp = 0;
    m.x += Math.cos(m.h) * sp * dt + m.pvx * dt;
    m.y += Math.sin(m.h) * sp * dt + m.pvy * dt;
    const damp = Math.exp(-3 * dt);
    m.pvx *= damp;
    m.pvy *= damp;

    for (const s of G.ships) {
      if (s.state === 'sail' && hyp(s.x - m.x, s.y - m.y) < m.r + s.r * 0.8) sinkShip(s);
    }
    if (hyp(m.x, m.y) < ISLAND_R + m.r * 0.6) {
      m.dead = true;
      burst(m.x, m.y, 20, { color: '200,120,255', speed: 70, life: 0.9 });
      loseLife(m.x, m.y);
    }
    return lit;
  }

  function updateBarrel(b, dt, bp) {
    b.fade = Math.min(1, b.fade + dt);
    b.spin += dt * 1.5;
    if (inBeam(b.x, b.y, 8, bp)) b.pulled = true;
    const d = hyp(b.x, b.y);
    if (b.pulled) {
      b.x -= (b.x / d) * 60 * dt;
      b.y -= (b.y / d) * 60 * dt;
    } else {
      const a = Math.atan2(b.y, b.x) + b.dir * (10 / d) * dt;
      b.x = Math.cos(a) * d;
      b.y = Math.sin(a) * d;
      b.life -= dt;
      if (b.life < 0) b.dead = true;
    }
    if (hyp(b.x, b.y) < ISLAND_R + 4) {
      b.dead = true;
      G.oil = Math.min(G.oilMax, G.oil + 25);
      floatText(b.x, b.y - 10, '+25 huile', '#ffe3a8');
      Sfx.oil();
    }
  }

  function updateParticles(dt) {
    for (const p of G.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.type === 'dot') {
        p.vx *= Math.exp(-1.5 * dt);
        p.vy *= Math.exp(-1.5 * dt);
      }
      p.life -= dt;
    }
    G.particles = G.particles.filter((p) => p.life > 0);
  }

  function updateWaves(dt) {
    for (const w of G.waves) {
      w.x += 6 * w.s * dt;
      if (w.x > 1000) w.x = -1000;
    }
  }

  function update(dt) {
    if (!G) return;
    if (G.state === 'paused') return;
    G.t += dt;
    updateWaves(dt);
    updateParticles(dt);
    G.shake = Math.max(0, G.shake - dt);

    if (G.state === 'title' || G.state === 'over') {
      G.beamA += dt * 0.45;
      return;
    }
    if (G.state === 'dawn') return;

    // Visée
    let target;
    if (G.aimMode === 'key') {
      G.keyAim += ((keys.r ? 1 : 0) - (keys.l ? 1 : 0)) * 3.2 * dt;
      target = G.keyAim;
    } else {
      target = Math.atan2(pointer.y - CY, pointer.x - CX);
    }
    G.beamA += angDiff(target, G.beamA) * (1 - Math.exp(-dt * 22));

    const bp = beamParams();

    // Huile
    const drain = (bp.focus ? 7 : 1.5) * (1 - 0.22 * G.up.thrift);
    G.oil = Math.max(0, G.oil - drain * dt);
    G.hornCD = Math.max(0, G.hornCD - dt);

    // Apparitions
    G.nightT += dt;
    while (G.queue.length && G.queue[0].t <= G.nightT) spawn(G.queue.shift().kind);

    for (const s of G.ships) updateShip(s, dt, bp);
    let burning = false;
    for (const m of G.monsters) if (updateMonster(m, dt, bp)) burning = true;
    for (const b of G.barrels) updateBarrel(b, dt, bp);
    G.ships = G.ships.filter((s) => !s.dead);
    G.monsters = G.monsters.filter((m) => !m.dead);
    G.barrels = G.barrels.filter((b) => !b.dead);

    G.burnT -= dt;
    if (burning && G.burnT <= 0) {
      Sfx.burn();
      G.burnT = 0.14;
    }

    if (G.overT !== null) {
      G.overT -= dt;
      if (G.overT <= 0) gameOver();
      return;
    }

    if (!G.queue.length && !G.ships.length && !G.monsters.length) {
      if (G.dawnT === null) G.dawnT = 1.4;
      G.dawnT -= dt;
      if (G.dawnT <= 0) endNight();
    }
  }

  // ---------------------------------------------------------------- rendu
  function cone(c, a, half, length) {
    c.beginPath();
    c.moveTo(0, 0);
    c.arc(0, 0, length, a - half, a + half);
    c.closePath();
  }
  function circle(c, x, y, r) {
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
  }

  function worldTransform(c, sx, sy) {
    c.setTransform(DPR * S, 0, 0, DPR * S, DPR * (CX + sx), DPR * (CY + sy));
  }

  function drawOcean() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const g = ctx.createRadialGradient(CX, CY, 0, CX, CY, Math.max(W, H) * 0.75);
    g.addColorStop(0, '#12405c');
    g.addColorStop(0.5, '#0a2639');
    g.addColorStop(1, '#03101b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawWaves() {
    ctx.strokeStyle = 'rgba(170,215,255,0.22)';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const w of G.waves) {
      const y = w.y + Math.sin(G.t * w.s + w.p) * 4;
      ctx.moveTo(w.x - w.l, y);
      ctx.quadraticCurveTo(w.x, y - 4 * Math.sin(G.t * 1.3 + w.p), w.x + w.l, y);
    }
    ctx.stroke();
  }

  function drawRocks() {
    for (const r of G.rocks) {
      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.strokeStyle = 'rgba(220,240,255,0.35)';
      ctx.lineWidth = 2;
      circle(ctx, 0, 0, r.r * 1.3 + Math.sin(G.t * 2 + r.phase) * 2);
      ctx.stroke();
      ctx.fillStyle = '#26303b';
      ctx.beginPath();
      r.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#44505d';
      ctx.beginPath();
      r.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * 0.6 - 3, y * 0.6 - 3) : ctx.moveTo(x * 0.6 - 3, y * 0.6 - 3)));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawIsland() {
    ctx.fillStyle = 'rgba(90,190,200,0.22)';
    circle(ctx, 0, 0, ISLAND_R + 16 + Math.sin(G.t * 1.5) * 1.5);
    ctx.fill();
    ctx.fillStyle = '#cdb47c';
    circle(ctx, 0, 0, ISLAND_R);
    ctx.fill();
    ctx.fillStyle = '#4e7a45';
    circle(ctx, -3, -3, ISLAND_R - 11);
    ctx.fill();
    ctx.fillStyle = '#3f6638';
    circle(ctx, -14, 10, 9);
    ctx.fill();
    circle(ctx, 12, -16, 7);
    ctx.fill();
    // Ponton
    ctx.save();
    ctx.rotate(0.75);
    ctx.fillStyle = '#7a5a3a';
    ctx.fillRect(ISLAND_R - 10, -4, 24, 8);
    ctx.restore();
    // Phare vu du dessus
    ctx.fillStyle = '#f1ece2';
    circle(ctx, 0, 0, 15);
    ctx.fill();
    ctx.strokeStyle = '#c4423a';
    ctx.lineWidth = 3.5;
    circle(ctx, 0, 0, 11);
    ctx.stroke();
    ctx.fillStyle = '#1b2733';
    circle(ctx, 0, 0, 7.5);
    ctx.fill();
  }

  function drawShip(s) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.h);
    if (s.state === 'sink') {
      const k = s.sinkT / 1.4;
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.rotate(k * 0.9);
      ctx.scale(1 - 0.5 * k, 1 - 0.5 * k);
    } else {
      ctx.strokeStyle = 'rgba(220,240,255,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-11, -4);
      ctx.lineTo(-26, -10);
      ctx.moveTo(-11, 4);
      ctx.lineTo(-26, 10);
      ctx.stroke();
    }
    ctx.fillStyle = s.hull;
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.quadraticCurveTo(6, -7.5, -11, -6);
    ctx.lineTo(-11, 6);
    ctx.quadraticCurveTo(6, 7.5, 15, 0);
    ctx.fill();
    ctx.fillStyle = '#d8c69c';
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.quadraticCurveTo(5, -4.5, -8, -3.6);
    ctx.lineTo(-8, 3.6);
    ctx.quadraticCurveTo(5, 4.5, 11, 0);
    ctx.fill();
    const belly = 3 + Math.sin(s.sail * 2) * 1;
    ctx.fillStyle = '#f5f1e6';
    ctx.beginPath();
    ctx.moveTo(1, -10);
    ctx.quadraticCurveTo(1 + belly + 3, 0, 1, 10);
    ctx.lineTo(-1.5, 10);
    ctx.quadraticCurveTo(-1.5 + belly, 0, -1.5, -10);
    ctx.fill();
    ctx.restore();
  }

  function drawMonster(m) {
    const T = MON[m.kind];
    const R = m.r;
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(m.h);
    if (m.state === 'die') {
      const k = Math.max(0.01, 1 - m.dieT / 0.8);
      ctx.globalAlpha = k;
      ctx.scale(k, k);
    }
    ctx.strokeStyle = T.limb;
    ctx.lineCap = 'round';
    const eel = m.kind === 'eel';
    for (let i = 0; i < T.limbs; i++) {
      const off = (i - (T.limbs - 1) / 2) * R * (eel ? 0.5 : 0.36);
      const wv = Math.sin(G.t * (eel ? 9 : 6) + i * 1.3 + m.seed) * R * 0.45;
      const reach = eel ? 3.2 : 2.1;
      ctx.lineWidth = R * (eel ? 0.45 : 0.28);
      ctx.beginPath();
      ctx.moveTo(-R * 0.4, off);
      ctx.quadraticCurveTo(-R * (reach * 0.6), off + wv, -R * reach, off * 1.6 - wv);
      ctx.stroke();
    }
    ctx.fillStyle = T.body;
    ctx.beginPath();
    ctx.ellipse(0, 0, eel ? R * 1.5 : R, eel ? R * 0.65 : R * 0.86, 0, 0, TAU);
    ctx.fill();
    if (m.hit > 0) {
      ctx.fillStyle = `rgba(255,140,60,${m.hit * 0.45})`;
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBarrel(b) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.spin);
    ctx.globalAlpha = b.fade * Math.min(1, b.pulled ? 1 : b.life / 3);
    ctx.fillStyle = '#7b5532';
    ctx.fillRect(-7, -5, 14, 10);
    ctx.fillStyle = '#3d2a19';
    ctx.fillRect(-4, -5, 2, 10);
    ctx.fillRect(2, -5, 2, 10);
    ctx.restore();
  }

  function drawDarkness(bp, sx, sy) {
    dctx.setTransform(1, 0, 0, 1, 0, 0);
    dctx.globalCompositeOperation = 'source-over';
    dctx.clearRect(0, 0, dark.width, dark.height);
    dctx.fillStyle = 'rgba(1,5,12,0.86)';
    dctx.fillRect(0, 0, dark.width, dark.height);
    worldTransform(dctx, sx, sy);
    dctx.globalCompositeOperation = 'destination-out';

    let g = dctx.createRadialGradient(0, 0, ISLAND_R * 0.6, 0, 0, ISLAND_R * 2.6);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    dctx.fillStyle = g;
    circle(dctx, 0, 0, ISLAND_R * 2.6);
    dctx.fill();

    {
      let flicker = 1;
      if (G.oil < 15 && G.state === 'play') flicker = 0.7 + Math.random() * 0.3;
      g = dctx.createRadialGradient(0, 0, 0, 0, 0, bp.length);
      g.addColorStop(0, `rgba(0,0,0,${flicker})`);
      g.addColorStop(0.7, `rgba(0,0,0,${0.85 * flicker})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      dctx.fillStyle = g;
      dctx.globalAlpha = 0.35;
      cone(dctx, G.beamA, bp.half * 1.3, bp.length);
      dctx.fill();
      dctx.globalAlpha = 1;
      cone(dctx, G.beamA, bp.half, bp.length);
      dctx.fill();
    }

    for (const s of G.ships) {
      if (s.state !== 'sail') continue;
      g = dctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 26);
      g.addColorStop(0, 'rgba(0,0,0,0.5)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      dctx.fillStyle = g;
      circle(dctx, s.x, s.y, 26);
      dctx.fill();
    }
    dctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(dark, 0, 0);
  }

  function drawLight(bp) {
    ctx.globalCompositeOperation = 'lighter';
    const warm = bp.focus ? '255,236,190' : '255,196,110';
    const base = bp.weak ? 0.25 : bp.focus ? 0.6 : 0.5;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, bp.length);
    g.addColorStop(0, `rgba(${warm},${base})`);
    g.addColorStop(0.55, `rgba(${warm},${base * 0.45})`);
    g.addColorStop(1, `rgba(${warm},0)`);
    ctx.fillStyle = g;
    ctx.globalAlpha = 0.4;
    cone(ctx, G.beamA, bp.half * 1.3, bp.length);
    ctx.fill();
    ctx.globalAlpha = 1;
    cone(ctx, G.beamA, bp.half, bp.length);
    ctx.fill();
    const lg = ctx.createRadialGradient(0, 0, 0, 0, 0, 34);
    lg.addColorStop(0, 'rgba(255,230,170,0.9)');
    lg.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = lg;
    circle(ctx, 0, 0, 34);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fff6dc';
    circle(ctx, 0, 0, 4);
    ctx.fill();
  }

  function glowDot(x, y, r, rgb, a = 1) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
    g.addColorStop(0, `rgba(${rgb},${a})`);
    g.addColorStop(0.35, `rgba(${rgb},${a * 0.5})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    circle(ctx, x, y, r * 3);
    ctx.fill();
  }

  function hexToRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  }

  function drawOverlays() {
    // Écume des récifs, à peine visible dans le noir
    ctx.strokeStyle = 'rgba(200,230,255,0.07)';
    ctx.lineWidth = 2;
    for (const r of G.rocks) {
      circle(ctx, r.x, r.y, r.r * 1.3 + Math.sin(G.t * 2 + r.phase) * 2);
      ctx.stroke();
    }
    // Lanternes des navires + anneau de guidage
    ctx.globalCompositeOperation = 'lighter';
    for (const s of G.ships) {
      if (s.state !== 'sail') continue;
      const lx = s.x - Math.cos(s.h) * 9;
      const ly = s.y - Math.sin(s.h) * 9;
      glowDot(lx, ly, 2.4, '255,200,110', 0.75 + Math.sin(G.t * 7 + s.seed) * 0.15);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const s of G.ships) {
      if (s.state !== 'sail' || s.guided <= 0) continue;
      ctx.strokeStyle = `rgba(255,205,120,${Math.min(1, s.guided) * 0.7})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.lineDashOffset = -G.t * 20;
      circle(ctx, s.x, s.y, 18);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Reflet des barils
    for (const b of G.barrels) {
      const blink = Math.max(0, Math.sin(G.t * 4 + b.spin * 3));
      if (blink > 0.85) glowDot(b.x, b.y, 1.6, '255,255,255', (blink - 0.85) * 5 * b.fade);
    }
    // Yeux des créatures
    ctx.globalCompositeOperation = 'lighter';
    for (const m of G.monsters) {
      const T = MON[m.kind];
      const k = m.state === 'die' ? Math.max(0, 1 - m.dieT / 0.8) : 1;
      const R = m.r * k;
      const c = Math.cos(m.h);
      const s = Math.sin(m.h);
      const fx = m.kind === 'eel' ? R * 1.1 : R * 0.5;
      const eyes = m.kind === 'leviathan' ? [-0.35, 0, 0.35] : [-0.3, 0.3];
      const rgb = hexToRgb(T.eye);
      for (const e of eyes) {
        const ox = fx;
        const oy = e * R;
        const ex = m.x + c * ox - s * oy;
        const ey = m.y + s * ox + c * oy;
        glowDot(ex, ey, Math.max(1.2, R * 0.09), rgb, 0.9 * k);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    // Barres de vie
    for (const m of G.monsters) {
      if (m.state !== 'swim' || m.hp >= m.maxHp) continue;
      const w = m.r * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(m.x - w / 2, m.y - m.r - 10, w, 3);
      ctx.fillStyle = '#ff9b52';
      ctx.fillRect(m.x - w / 2, m.y - m.r - 10, (w * Math.max(0, m.hp)) / m.maxHp, 3);
    }
  }

  function drawParticles() {
    for (const p of G.particles) {
      const a = Math.max(0, p.life / p.max);
      if (p.type === 'dot') {
        if (p.glow) {
          ctx.globalCompositeOperation = 'lighter';
          glowDot(p.x, p.y, p.size * 0.6, p.color, a);
          ctx.globalCompositeOperation = 'source-over';
        } else {
          ctx.fillStyle = `rgba(${p.color},${a * 0.8})`;
          circle(ctx, p.x, p.y, p.size);
          ctx.fill();
        }
      } else if (p.type === 'ring') {
        const k = 1 - a;
        ctx.strokeStyle = `rgba(${p.color},${a * 0.6})`;
        ctx.lineWidth = 3 * a + 1;
        circle(ctx, p.x, p.y, ISLAND_R + k * (p.maxR - ISLAND_R));
        ctx.stroke();
      } else if (p.type === 'text') {
        ctx.globalAlpha = Math.min(1, a * 1.5);
        ctx.fillStyle = p.color;
        ctx.font = '700 15px Outfit, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.text, p.x, p.y);
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawAimHint(bp) {
    // Petite ligne pointillée vers le curseur pour aider à viser
    if (G.state !== 'play' || G.aimMode !== 'pointer' || isTouch) return;
    ctx.strokeStyle = 'rgba(255,220,160,0.12)';
    ctx.setLineDash([2, 8]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.cos(G.beamA) * 20, Math.sin(G.beamA) * 20);
    ctx.lineTo(Math.cos(G.beamA) * bp.length, Math.sin(G.beamA) * bp.length);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function render() {
    if (!G) return;
    const bp = beamParams();
    const sk = G.shake * 10;
    const sx = sk ? rand(-sk, sk) : 0;
    const sy = sk ? rand(-sk, sk) : 0;

    drawOcean();
    worldTransform(ctx, sx, sy);
    drawWaves();
    drawRocks();
    for (const b of G.barrels) drawBarrel(b);
    for (const s of G.ships) drawShip(s);
    for (const m of G.monsters) drawMonster(m);
    drawIsland();

    drawDarkness(bp, sx, sy);

    worldTransform(ctx, sx, sy);
    drawLight(bp);
    drawAimHint(bp);
    drawOverlays();
    drawParticles();

    updateHud();
  }

  // ---------------------------------------------------------------- HUD
  let hudCache = {};
  function setText(el, key, val) {
    if (hudCache[key] !== val) {
      hudCache[key] = val;
      el.textContent = val;
    }
  }
  function updateHud() {
    if (G.state === 'title' || G.state === 'over') return;
    setText(ui.night, 'n', `Nuit ${G.night}`);
    setText(ui.score, 's', fmt(G.score));
    const mult = comboMult();
    setText(ui.combo, 'c', mult > 1 ? `série ×${String(mult).replace('.', ',')}` : '');
    const oilPct = Math.round((G.oil / G.oilMax) * 1000) / 10;
    if (hudCache.o !== oilPct) {
      hudCache.o = oilPct;
      ui.oil.style.width = oilPct + '%';
      ui.oil.classList.toggle('low', G.oil < 20);
    }
    const hornPct = G.hornCD > 0 ? Math.round((1 - G.hornCD / G.hornCDMax) * 100) : 100;
    if (hudCache.h !== hornPct) {
      hudCache.h = hornPct;
      ui.horn.style.width = hornPct + '%';
      ui.horn.classList.toggle('ready', hornPct >= 100);
    }
    const lv = `${G.lives}/${G.maxLives}`;
    if (hudCache.l !== lv) {
      hudCache.l = lv;
      ui.lives.innerHTML = Array.from({ length: G.maxLives }, (_, i) => `<span class="life${i < G.lives ? '' : ' lost'}"></span>`).join('');
    }
  }

  // ---------------------------------------------------------------- boucle
  newGame('title');
  G.rocks = genRocks(11);
  ui.bestTitle.textContent = best ? `Record : ${fmt(best)}` : '';

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Accès de débogage / tests automatisés
  window.TideKeeper = { get state() { return G; }, start, spawn: (k) => spawn(k), horn };
})();
