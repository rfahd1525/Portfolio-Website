import * as THREE from 'three';
import { InkRenderer, NO_INK } from './toon.js';
import { buildWorld } from './world.js';
import { loadFonts } from './textures.js';
import { loadCustomModels } from './custom-models.js';
import { projects, contact, loadRoblox, fallbackRoblox, formatCount } from './data.js';
import { Arcade, GAMES } from './arcade.js';
import { LofiPlayer } from './music.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

const EYE = 1.6;           // eye height (m)
const RADIUS = 0.24;       // how close you can get to furniture
const SPEED = 1.6;         // walking speed (m/s); hold Shift for double
const BOUNDS = { minX: -2.78, maxX: 2.78, minZ: -2.33, maxZ: 2.33 };
// Standing near the door, looking across at the desk and window.
const START = { x: 0.95, z: 1.9, yaw: 0.19, pitch: -0.13 };

// Furniture you bump into (bounding boxes are measured at runtime).
const SOLID = ['desk', 'chair', 'bed', 'cabinet', 'plant', 'wardrobe', 'console'];

// Where the camera goes for things that open a panel.
const FOCUS = {
    projects: { position: V(0.2, 1.24, -1.08), target: V(0.2, 1.1, -2.0) },
    roblox: { position: V(0.12, 1.14, -1.2), target: V(-0.27, 0.92, -1.9) },
    shelf: { position: V(-1.5, 1.7, -0.62), target: V(-2.6, 1.6, -1.15) },
    about: { position: V(-1.25, 1.55, 1.15), target: V(-2.75, 1.52, 1.15) },
    contact: { position: V(-0.5, 1.3, -1.36), target: V(-0.46, 0.79, -1.74) },
    arcade: { position: V(-0.75, 1.02, 1.22), target: V(-0.75, 0.89, 2.15) }
};

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
const CAT_LINES = ['mrrp?', 'purrr', '*slow blink*', 'mrow!', 'purrrrrr'];
const FOCUS_FOV = 50;

const TIMES = {
    dusk: {
        hemiSky: '#b9a8ff', hemiGround: '#e9b3c4', hemi: 1.9,
        sun: '#ffb36b', sunI: 2.6, fill: '#ffe6f0', fillI: 0.8,
        lamp: 0.5, fairy: 0, fairyGlow: 1, dust: '#ffe2b0', stars: 0.25
    },
    night: {
        hemiSky: '#5058b4', hemiGround: '#3b2d5e', hemi: 1.15,
        sun: '#8fa6ff', sunI: 1.4, fill: '#8c96ff', fillI: 0.3,
        lamp: 0.95, fairy: 0.7, fairyGlow: 1.7, dust: '#c3ceff', stars: 0.95
    }
};

const GLOW = new THREE.Color('#6b5aa8');
const MOUSE_SENS = 0.0022;
const TOUCH_SENS = 0.006;

const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = t => 1 - Math.pow(1 - t, 3);
const clamp = THREE.MathUtils.clamp;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lookDir = (yaw, pitch, out = new THREE.Vector3()) =>
    out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));

export async function mountRoom(host, { onExit } = {}) {
    injectStyles();
    await loadFonts();

    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    } catch (err) {
        throw new Error('WebGL is not available', { cause: err });
    }
    const touch = matchMedia('(pointer: coarse)').matches;
    // Resolution: capped by device, and lowered automatically if frames are slow.
    const maxRatio = Math.min(window.devicePixelRatio || 1, touch ? 1.5 : 2);
    const minRatio = touch ? 0.75 : 1;
    let pixelRatio = maxRatio;
    renderer.setPixelRatio(pixelRatio);
    renderer.setClearColor('#1b1530', 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    host.innerHTML = hudMarkup(touch);
    host.classList.toggle('is-touch', touch);
    host.querySelector('.room-stage').appendChild(renderer.domElement);
    renderer.domElement.classList.add('room-canvas');

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 40);

    const world = buildWorld(scene);
    if (touch) world.lights.sun.shadow.mapSize.set(1024, 1024);
    const ink = new InkRenderer(renderer, scene, camera, { samples: touch || maxRatio >= 2 ? 2 : 4 });
    const room = scene.getObjectByName('room');

    // The TV shows the arcade; the record player plays the lo-fi loop.
    const arcade = new Arcade();
    const tvTexture = new THREE.CanvasTexture(arcade.canvas);
    tvTexture.colorSpace = THREE.SRGBColorSpace;
    tvTexture.magFilter = THREE.NearestFilter;
    tvTexture.generateMipmaps = false;
    world.tvScreen.material.map?.dispose();
    world.tvScreen.material.map = tvTexture;
    world.tvScreen.material.needsUpdate = true;
    const music = new LofiPlayer();

    // Roblox games + member count (refreshed by the deploy workflow).
    let rb = fallbackRoblox();
    loadRoblox().then(data => { rb = data; });

    const ui = {
        stage: host.querySelector('.room-stage'),
        cross: host.querySelector('.room-cross'),
        crossLabel: host.querySelector('.room-cross-label'),
        start: host.querySelector('.room-start'),
        joy: host.querySelector('.room-joy'),
        knob: host.querySelector('.room-joy-knob'),
        panel: host.querySelector('.room-panel'),
        panelBody: host.querySelector('.room-panel-body'),
        toast: host.querySelector('.room-toast'),
        hint: host.querySelector('.room-hint'),
        fade: host.querySelector('.room-fade')
    };
    const hideHint = () => ui.hint?.classList.add('is-gone');

    // --------------------------------------------------------------- state

    const fp = {
        pos: new THREE.Vector3(START.x, 0, START.z),
        yaw: START.yaw, pitch: START.pitch,
        vel: new THREE.Vector2(),
        keys: new Set(),
        joy: new THREE.Vector2(),
        bob: 0,
        fov: 62
    };

    const state = {
        running: false,
        mode: 'intro',          // intro | walk | travel | focus
        focus: null,
        locked: false,          // pointer captured (desktop)
        lockFailed: false,      // no pointer lock: fall back to drag-to-look
        time: 'dusk',
        timeK: 0,
        lampOn: true,
        lampK: 1,
        ceilingOn: false,
        ceilingK: 0,
        disco: 0,
        pointer: new THREE.Vector2(-9, -9),
        parallax: new THREE.Vector2(),
        target: null,           // what the crosshair (or cursor) is on
        pulse: 0,
        viewOffset: 0,
        viewOffsetTarget: 0,
        size: { w: 1, h: 1 },
        tween: null,
        lookAt: new THREE.Vector3(),
        focusPos: new THREE.Vector3(),
        focusTarget: new THREE.Vector3()
    };

    // Highlighting changes emissive, so interactive things get their own materials.
    const prepared = new WeakSet();
    const prepare = obj => {
        obj.traverse(o => {
            if (!o.isMesh || prepared.has(o)) return;
            prepared.add(o);
            const cl = m => (m && m.isMeshToonMaterial ? m.clone() : m);
            o.material = Array.isArray(o.material) ? o.material.map(cl) : cl(o.material);
        });
    };
    world.interactive.forEach(prepare);

    const setGlow = (obj, k) => {
        if (!obj) return;
        obj.traverse(o => {
            if (!o.isMesh) return;
            (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
                if (m && m.isMeshToonMaterial) m.emissive.copy(GLOW).multiplyScalar(k);
            });
        });
    };

    // --------------------------------------------------------------- collision

    let colliders = [];
    const measure = () => {
        colliders = SOLID.map(name => world.named.get(name)).filter(Boolean).map(o => new THREE.Box3().setFromObject(o, true));
    };
    measure();

    const blocked = (x, z) => {
        if (x < BOUNDS.minX + RADIUS || x > BOUNDS.maxX - RADIUS || z < BOUNDS.minZ + RADIUS || z > BOUNDS.maxZ - RADIUS) return true;
        return colliders.some(b => x > b.min.x - RADIUS && x < b.max.x + RADIUS && z > b.min.z - RADIUS && z < b.max.z + RADIUS);
    };
    // Axis-separated so you slide along furniture instead of sticking to it.
    const move = (dx, dz) => {
        const x0 = fp.pos.x, z0 = fp.pos.z;
        if (!blocked(x0 + dx, z0)) fp.pos.x += dx;
        if (!blocked(fp.pos.x, z0 + dz)) fp.pos.z += dz;
        return Math.hypot(fp.pos.x - x0, fp.pos.z - z0);
    };

    // --------------------------------------------------------------- sizing

    const baseFov = () => (state.size.w / state.size.h < 1 ? 80 : 62);
    const resize = () => {
        const r = ui.stage.getBoundingClientRect();
        const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
        state.size = { w, h };
        renderer.setSize(w, h, false);
        ink.setSize(w, h, pixelRatio);
        camera.aspect = w / h;
        fp.fov = baseFov();
        if (state.mode === 'walk') camera.fov = fp.fov;
        applyViewOffset();
    };
    const applyViewOffset = () => {
        const { w, h } = state.size;
        const o = state.viewOffset;
        if (Math.abs(o) < 0.5) camera.clearViewOffset();
        else if (w > 860) camera.setViewOffset(w, h, o, 0, w, h);
        else camera.setViewOffset(w, h, 0, o, w, h);
        camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(ui.stage);

    // --------------------------------------------------------------- pointer lock

    const canvas = renderer.domElement;
    const canLock = !touch && 'requestPointerLock' in canvas;
    const lock = () => {
        if (!canLock || state.lockFailed || state.locked) return;
        try {
            const p = canvas.requestPointerLock();
            p?.catch?.(() => { state.lockFailed = true; updateHud(); });
        } catch {
            state.lockFailed = true;
        }
    };
    const unlock = () => { if (document.pointerLockElement === canvas) document.exitPointerLock(); };
    const onLockChange = () => {
        state.locked = document.pointerLockElement === canvas;
        if (state.locked) lockedAt = performance.now();
        else fp.keys.delete('run');
        updateHud();
    };
    const onLockError = () => { state.lockFailed = true; updateHud(); };
    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('pointerlockerror', onLockError);

    // The "click to look around" card shows whenever you're walking without the mouse captured.
    const updateHud = () => {
        const walking = state.mode === 'walk' || state.mode === 'intro';
        ui.start.hidden = touch || state.lockFailed || state.locked || !walking || !state.running;
        ui.cross.hidden = touch || !state.locked || state.mode !== 'walk';
        host.classList.toggle('is-locked', state.locked);
    };

    // --------------------------------------------------------------- camera moves

    const eyePos = () => V(fp.pos.x, EYE, fp.pos.z);

    const flyTo = (position, target, fov, duration, done) => {
        state.tween = {
            t: 0, duration,
            fromPos: camera.position.clone(), toPos: position.clone(),
            fromLook: state.lookAt.clone(), toLook: target.clone(),
            fromFov: camera.fov, toFov: fov,
            done
        };
    };

    // relock: pass true when called from a click, so the mouse is captured again straight away.
    const backToWalking = (relock = false) => {
        closePanel();
        if (state.focus === 'arcade') arcade.sleep();
        if (state.mode === 'walk') return;
        state.mode = 'travel';
        state.focus = null;
        updateHud();
        if (relock) lock();
        const eye = eyePos();
        flyTo(eye, eye.clone().add(lookDir(fp.yaw, fp.pitch)), fp.fov, 0.9, () => { state.mode = 'walk'; updateHud(); });
    };

    const focusOn = (key, panel, panelArg) => {
        const f = FOCUS[key];
        fp.keys.clear();
        fp.joy.set(0, 0);
        unlock();
        state.mode = 'travel';
        state.focus = key;
        updateHud();
        openPanel(panel, panelArg);
        if (key === 'arcade') arcade.wake();
        flyTo(f.position, f.target, FOCUS_FOV, 1.0, () => {
            state.mode = 'focus';
            state.focusPos.copy(f.position);
            state.focusTarget.copy(f.target);
        });
    };

    // --------------------------------------------------------------- panels

    const panels = {
        projects: (highlight) => `
            <p class="rp-kicker">~/projects</p>
            <h2 class="rp-title">Things I've built</h2>
            <ol class="rp-projects">
                ${projects.map((p, i) => `
                <li class="${p.id === highlight ? 'is-current' : ''}" id="rp-${p.id}">
                    <span class="rp-num">${String(i + 1).padStart(2, '0')}</span>
                    <div>
                        <h3>${esc(p.name)}</h3>
                        <p class="rp-stack">${esc(p.stack)}</p>
                        <p>${esc(p.blurb)}</p>
                        <a href="${p.url}" target="_blank" rel="noopener">source &#8599;</a>
                    </div>
                </li>`).join('')}
            </ol>`,
        roblox: () => `
            <p class="rp-kicker">roblox</p>
            <h2 class="rp-title">${esc(rb.name)}</h2>
            <p>The Roblox games I make. ${rb.games.length} out so far with ${formatCount(rb.totalVisits)} visits between them, and ${rb.members.toLocaleString('en')} members in the community.</p>
            <ul class="rp-games">
                ${rb.games.map(g => `
                <li>
                    <img src="${esc(g.img || '')}" alt="" width="64" height="64" loading="lazy">
                    <div>
                        <h3>${esc(g.name)} <span>${formatCount(g.visits)} visits</span></h3>
                        <p>${esc(g.blurb)}</p>
                        <a href="${esc(g.url)}" target="_blank" rel="noopener">play on roblox &#8599;</a>
                    </div>
                </li>`).join('')}
            </ul>
            <a class="rp-more" href="${esc(rb.url)}" target="_blank" rel="noopener">community page &#8599;</a>
            <p class="rp-stack">updated ${rb.updated.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}</p>`,
        about: () => `
            <p class="rp-kicker">about</p>
            <h2 class="rp-title">Rawad Fahd</h2>
            <p>Fourth-year Computer Science at Western University. I've been writing code for about eight years.</p>
            <p>Lately that means Roblox games, a 2D engine in C++, and teaching an agent to play Block Blast.</p>
            <p>Languages I use the most: Python, C++, JavaScript, Java and Luau.</p>`,
        arcade: () => `
            <p class="rp-kicker">console</p>
            <h2 class="rp-title">Room Arcade</h2>
            <ul class="rp-arcade">
                ${GAMES.map(g => `<li><button type="button" data-game="${g.id}">${g.name}<span>${g.help}</span></button></li>`).join('')}
            </ul>
            <div class="rp-pad" aria-label="Controller">
                <button type="button" data-btn="up" aria-label="Up">&#9650;</button>
                <button type="button" data-btn="left" aria-label="Left">&#9664;</button>
                <button type="button" data-btn="right" aria-label="Right">&#9654;</button>
                <button type="button" data-btn="down" aria-label="Down">&#9660;</button>
                <button type="button" data-btn="b" class="rp-b">B</button>
                <button type="button" data-btn="a" class="rp-a">A</button>
            </div>
            <p class="rp-stack">keyboard: arrows or WASD move &middot; Space / Enter = A &middot; X = B (menu) &middot; Esc to stand up</p>`,
        contact: () => `
            <p class="rp-kicker">contact</p>
            <h2 class="rp-title">Say hi</h2>
            <p>Email is the best way to reach me.</p>
            <button class="rp-copy" type="button" data-copy="${contact.email}">${contact.email}<span>copy</span></button>
            <ul class="rp-links">
                <li><a href="${contact.github}" target="_blank" rel="noopener">GitHub &#8599;</a></li>
                <li><a href="${contact.linkedin}" target="_blank" rel="noopener">LinkedIn &#8599;</a></li>
                <li><a href="mailto:${contact.email}">Open mail app &#8599;</a></li>
            </ul>`
    };

    const openPanel = (name, arg) => {
        ui.panelBody.innerHTML = panels[name](arg);
        ui.panel.dataset.panel = name;
        ui.panel.hidden = false;
        requestAnimationFrame(() => ui.panel.classList.add('is-open'));
        ui.panelBody.scrollTop = 0;
        if (arg) host.querySelector(`#rp-${arg}`)?.scrollIntoView({ block: 'center' });
        const r = ui.panel.getBoundingClientRect();
        state.viewOffsetTarget = state.size.w > 860 ? Math.min(r.width, state.size.w * 0.45) / 2 : Math.min(state.size.h * 0.5, 420) / 2;
    };
    const closePanel = () => {
        ui.panel.classList.remove('is-open');
        state.viewOffsetTarget = 0;
        clearTimeout(closePanel.t);
        closePanel.t = setTimeout(() => { if (!ui.panel.classList.contains('is-open')) ui.panel.hidden = true; }, 300);
    };

    ui.panel.addEventListener('click', e => {
        const game = e.target.closest('[data-game]');
        if (game) { arcade.start(game.dataset.game); game.blur(); return; }
        const btn = e.target.closest('[data-copy]');
        if (!btn) return;
        navigator.clipboard?.writeText(btn.dataset.copy).then(() => toast('copied'), () => toast(btn.dataset.copy));
    });
    // On-screen controller (works with touch or mouse).
    ui.panel.addEventListener('pointerdown', e => {
        const b = e.target.closest('[data-btn]');
        if (!b) return;
        e.preventDefault();
        b.setPointerCapture?.(e.pointerId);
        arcade.press(b.dataset.btn);
        const up = () => { arcade.release(b.dataset.btn); b.removeEventListener('pointerup', up); b.removeEventListener('pointercancel', up); };
        b.addEventListener('pointerup', up);
        b.addEventListener('pointercancel', up);
    });

    const toast = (text, ms = 1700) => {
        ui.toast.textContent = text;
        ui.toast.classList.add('is-on');
        clearTimeout(toast.t);
        toast.t = setTimeout(() => ui.toast.classList.remove('is-on'), ms);
    };

    // --------------------------------------------------------------- easter eggs

    const startDisco = () => {
        state.disco = 9;
        host.classList.add('is-disco');
        if (!music.playing) { music.start(); world.turntable.playing = true; }
        toast('disco mode');
    };

    const nap = () => {
        if (ui.fade.classList.contains('is-on')) return;
        ui.fade.classList.add('is-on');
        setTimeout(() => {
            setTime(state.time === 'dusk' ? 'night' : 'dusk');
            state.timeK = state.time === 'night' ? 1 : 0;
            ui.fade.classList.remove('is-on');
            toast(state.time === 'night' ? 'you slept until night' : 'you slept until sunset');
        }, 1100);
    };

    // --------------------------------------------------------------- actions

    let pulledBook = null;
    let catPets = 0;
    const act = (info, target) => {
        switch (info.id) {
            case 'projects': focusOn('projects', 'projects'); break;
            case 'project': {
                const book = world.books.find(b => b.name === `book-${info.project}`);
                if (book) pulledBook = book;
                focusOn('shelf', 'projects', info.project);
                break;
            }
            case 'roblox': world.roblox.poke(); focusOn('roblox', 'roblox'); break;
            case 'about': focusOn('about', 'about'); break;
            case 'contact': focusOn('contact', 'contact'); break;
            case 'window': setTime(state.time === 'dusk' ? 'night' : 'dusk'); break;
            case 'lamp': state.lampOn = !state.lampOn; break;
            case 'cube': world.cube.twist(); break;
            case 'cat': {
                catPets = world.cat.poke();
                if (catPets === 5) { world.cat.love(); toast('Snowy likes you now'); }
                else toast(CAT_LINES[(catPets - 1) % CAT_LINES.length]);
                break;
            }
            case 'door': unlock(); onExit?.(); break;
            case 'arcade': focusOn('arcade', 'arcade'); break;
            case 'music': world.turntable.playing = music.toggle(); toast(music.playing ? 'now playing: lo-fi loop' : 'music off'); break;
            case 'switch': state.ceilingOn = !state.ceilingOn; break;
            case 'fairy': world.lightsColour.next(); break;
            case 'wardrobe':
                if (world.wardrobe.toggle()) setTimeout(() => toast('boo!'), 600);
                break;
            case 'trophy': world.wardrobe.trophy(); toast('you found it'); break;
            case 'bed': nap(); break;
            case 'plant': world.plant.poke(); toast('watered'); break;
            case 'mug': world.mug.poke(); toast('still warm'); break;
            case 'poster': if (target) world.wobble(target); break;
            case 'calendar': toast(new Date().toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })); break;
        }
    };

    const setTime = (time) => {
        state.time = time;
        host.querySelector('[data-chip="time"]').textContent = time === 'night' ? 'sunset' : 'night';
    };

    host.querySelectorAll('[data-chip]').forEach(btn => btn.addEventListener('click', () => {
        const c = btn.dataset.chip;
        if (c === 'time') act({ id: 'window' });
        else if (c === 'shelf') act({ id: 'project', project: projects[0].id });
        else act({ id: c });
    }));
    host.querySelector('.room-close').addEventListener('click', () => backToWalking(true));
    host.querySelector('.room-exit').addEventListener('click', () => { unlock(); onExit?.(); });

    // --------------------------------------------------------------- keyboard

    const KEYS = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r', ShiftLeft: 'run', ShiftRight: 'run' };
    const typing = () => /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    const ARCADE_KEYS = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'a', Enter: 'a', KeyZ: 'a', KeyX: 'b', Backspace: 'b' };
    let konamiAt = 0;
    const onKeyDown = e => {
        if (!state.running || typing() || e.metaKey || e.ctrlKey || e.altKey) return;
        konamiAt = e.key === KONAMI[konamiAt] ? konamiAt + 1 : (e.key === KONAMI[0] ? 1 : 0);
        if (konamiAt === KONAMI.length) { konamiAt = 0; startDisco(); }
        if (e.key === 'Escape' && state.focus) { e.preventDefault(); backToWalking(false); return; }
        if (state.focus === 'arcade') {
            const b = ARCADE_KEYS[e.code];
            if (b) { e.preventDefault(); if (!e.repeat) arcade.press(b); }
            return;
        }
        if ((e.code === 'KeyE' || e.code === 'Enter') && state.mode === 'walk' && state.target && (state.locked || state.lockFailed)) {
            e.preventDefault();
            act(state.target.userData.interactive, state.target);
            return;
        }
        const k = KEYS[e.code];
        if (!k) return;
        if (e.code.startsWith('Arrow')) e.preventDefault();
        if (state.mode === 'focus' && k !== 'run') backToWalking(false);
        fp.keys.add(k);
    };
    const onKeyUp = e => {
        const k = KEYS[e.code];
        if (k) fp.keys.delete(k);
        const b = ARCADE_KEYS[e.code];
        if (b) arcade.release(b);
    };
    const onBlur = () => fp.keys.clear();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    // --------------------------------------------------------------- picking

    const raycaster = new THREE.Raycaster();
    raycaster.layers.enableAll();
    const isShown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
    // First solid thing at a screen point, ignoring glows and decals.
    const firstHit = (point) => {
        raycaster.setFromCamera(point, camera);
        const hits = raycaster.intersectObject(room, true);
        for (const hit of hits) {
            if (hit.object.isSprite || hit.object.isPoints) continue;
            if (hit.object.layers.mask === (1 << NO_INK) && !hit.object.parent?.userData.interactive) continue;
            if (!isShown(hit.object)) continue;
            return hit;
        }
        return null;
    };
    const interactiveOf = hit => {
        for (let o = hit?.object; o; o = o.parent) if (o.userData.interactive) return o;
        return null;
    };
    const CENTER = new THREE.Vector2(0, 0);
    const aimPoint = () => (state.locked && state.mode === 'walk' ? CENTER : state.pointer);

    // --------------------------------------------------------------- mouse + touch

    const setPointer = e => {
        const r = canvas.getBoundingClientRect();
        state.pointer.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    const turn = (dx, dy, sens) => {
        fp.yaw -= dx * sens;
        fp.pitch = clamp(fp.pitch - dy * sens, -1.35, 1.35);
    };

    // Locked mouse: movement turns the head. Chrome sometimes reports one huge
    // jump right after the lock starts, so skip the first event and any outliers.
    let lockedAt = 0;
    const onMouseMove = e => {
        if (!state.locked || state.mode !== 'walk') return;
        if (performance.now() - lockedAt < 80 || Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
        turn(e.movementX, e.movementY, MOUSE_SENS);
    };
    document.addEventListener('mousemove', onMouseMove);

    let drag = null;
    canvas.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        setPointer(e);
        if (state.locked) {
            // Clicking with the mouse captured uses whatever's under the crosshair.
            if (state.mode === 'walk' && state.target) act(state.target.userData.interactive, state.target);
            return;
        }
        drag = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false };
        if (touch || state.lockFailed) canvas.setPointerCapture?.(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
        if (state.locked) return;
        setPointer(e);
        if (!drag) return;
        if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) drag.moved = true;
        if (drag.moved && state.mode === 'walk' && (touch || state.lockFailed)) {
            hideHint();
            turn(e.clientX - drag.lx, e.clientY - drag.ly, touch ? TOUCH_SENS : MOUSE_SENS * 1.6);
        }
        drag.lx = e.clientX;
        drag.ly = e.clientY;
    });
    canvas.addEventListener('pointercancel', () => { drag = null; });
    canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !state.locked) state.pointer.set(-9, -9); });
    canvas.addEventListener('pointerup', e => {
        if (state.locked) return;
        const wasDrag = !drag || drag.moved;
        drag = null;
        if (wasDrag || state.mode === 'intro' || state.mode === 'travel') return;
        setPointer(e);
        if (state.mode === 'focus') {
            const target = interactiveOf(firstHit(state.pointer));
            if (target) act(target.userData.interactive, target);
            else backToWalking(true);
            return;
        }
        if (touch || state.lockFailed) {
            const target = interactiveOf(firstHit(state.pointer));
            if (target) act(target.userData.interactive, target);
            return;
        }
        lock();
    });

    // On-screen joystick for touch screens.
    let joyId = null;
    const joyMove = e => {
        const r = ui.joy.getBoundingClientRect();
        const max = r.width / 2;
        let dx = e.clientX - (r.left + max), dy = e.clientY - (r.top + max);
        const d = Math.hypot(dx, dy);
        if (d > max) { dx *= max / d; dy *= max / d; }
        fp.joy.set(dx / max, dy / max);
        ui.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const joyEnd = () => { joyId = null; fp.joy.set(0, 0); ui.knob.style.transform = ''; };
    ui.joy.addEventListener('pointerdown', e => {
        joyId = e.pointerId;
        ui.joy.setPointerCapture(e.pointerId);
        if (state.mode === 'focus') backToWalking(false);
        hideHint();
        joyMove(e);
    });
    ui.joy.addEventListener('pointermove', e => { if (e.pointerId === joyId) joyMove(e); });
    ui.joy.addEventListener('pointerup', joyEnd);
    ui.joy.addEventListener('pointercancel', joyEnd);

    // --------------------------------------------------------------- your own models

    loadCustomModels(world, scene).then(added => {
        if (!added.length) return;
        world.interactive.forEach(prepare);
        measure();
    });

    // --------------------------------------------------------------- loop

    const timer = new THREE.Timer();
    timer.connect(document);
    const colorA = new THREE.Color(), colorB = new THREE.Color();
    const lerpColor = (target, a, b, k) => target.copy(colorA.set(a)).lerp(colorB.set(b), k);
    const tmp = new THREE.Vector3();
    const tmp2 = new THREE.Vector2();
    let raf = 0;
    let pickFrame = 0;
    let arcadeAcc = 0;

    const walk = (dt) => {
        let ix = 0, iz = 0;
        if (fp.keys.has('f')) iz -= 1;
        if (fp.keys.has('b')) iz += 1;
        if (fp.keys.has('l')) ix -= 1;
        if (fp.keys.has('r')) ix += 1;
        ix += fp.joy.x;
        iz += fp.joy.y;
        const want = tmp2.set(0, 0);
        const mag = Math.min(1, Math.hypot(ix, iz));
        if (mag > 0.05) {
            const s = Math.sin(fp.yaw), c = Math.cos(fp.yaw);
            const speed = SPEED * mag * (fp.keys.has('run') ? 2 : 1);
            want.set(ix * c + iz * s, -ix * s + iz * c).normalize().multiplyScalar(speed);
        }
        fp.vel.lerp(want, Math.min(1, dt * 10));
        let moved = 0;
        const steps = Math.ceil(fp.vel.length() * dt / 0.02) || 1;
        for (let i = 0; i < steps; i++) moved += move(fp.vel.x * dt / steps, fp.vel.y * dt / steps);
        const pace = Math.min(1, moved / Math.max(dt, 1e-4) / SPEED);
        fp.bob += dt * 9 * pace;
        const bob = Math.sin(fp.bob) * 0.016 * pace;

        camera.position.set(fp.pos.x, EYE + bob, fp.pos.z);
        state.lookAt.copy(camera.position).add(lookDir(fp.yaw, fp.pitch, tmp));
        camera.lookAt(state.lookAt);
        if (Math.abs(camera.fov - fp.fov) > 0.01) {
            camera.fov += (fp.fov - camera.fov) * Math.min(1, dt * 10);
            camera.updateProjectionMatrix();
        }
    };

    // Is an object in front of the camera? (skip texture uploads when not)
    const frustum = new THREE.Frustum(), projView = new THREE.Matrix4();
    const onScreen = o => frustum.intersectsObject(o);

    // Watch frame times; if the device struggles, drop the resolution a notch.
    const perf = { acc: 0, frames: 0, settle: 2 };
    const adaptResolution = (dt) => {
        if (state.mode !== 'walk' || pixelRatio <= minRatio) return;
        if ((perf.settle -= dt) > 0) return;
        perf.acc += dt;
        perf.frames++;
        if (perf.frames < 90) return;
        const avg = perf.acc / perf.frames;
        perf.acc = 0;
        perf.frames = 0;
        if (avg > 1 / 40) {
            pixelRatio = Math.max(minRatio, pixelRatio - 0.25);
            renderer.setPixelRatio(pixelRatio);
            resize();
            perf.settle = 1.5;
        }
    };

    const frame = (now) => {
        raf = requestAnimationFrame(frame);
        if (document.hidden) return;
        timer.update(now);
        const dt = Math.min(timer.getDelta(), 0.05);
        const t = timer.getElapsed();

        // Camera
        if (state.tween) {
            const tw = state.tween;
            tw.t = Math.min(1, tw.t + dt / tw.duration);
            const k = state.mode === 'intro' ? easeOut(tw.t) : easeInOut(tw.t);
            camera.position.lerpVectors(tw.fromPos, tw.toPos, k);
            state.lookAt.lerpVectors(tw.fromLook, tw.toLook, k);
            camera.lookAt(state.lookAt);
            camera.fov = THREE.MathUtils.lerp(tw.fromFov, tw.toFov, k);
            camera.updateProjectionMatrix();
            if (tw.t === 1) { state.tween = null; tw.done?.(); }
        } else if (state.mode === 'focus') {
            const px = state.pointer.x < -2 ? 0 : clamp(state.pointer.x, -1, 1);
            const py = state.pointer.y < -2 ? 0 : clamp(state.pointer.y, -1, 1);
            state.parallax.lerp(tmp2.set(px, py).multiplyScalar(state.focus === 'arcade' ? 0 : 1), 0.05);
            const right = tmp.subVectors(state.focusTarget, state.focusPos).cross(camera.up).normalize();
            camera.position.copy(state.focusPos).addScaledVector(right, state.parallax.x * 0.04).addScaledVector(camera.up, state.parallax.y * 0.025);
            camera.lookAt(state.focusTarget);
        } else if (state.mode === 'walk') {
            walk(dt);
        }

        if (Math.abs(state.viewOffset - state.viewOffsetTarget) > 0.5) {
            state.viewOffset += (state.viewOffsetTarget - state.viewOffset) * Math.min(1, dt * 6);
            applyViewOffset();
        } else if (state.viewOffset !== state.viewOffsetTarget) {
            state.viewOffset = state.viewOffsetTarget;
            applyViewOffset();
        }

        // Lighting: time of day + lamp
        const goal = state.time === 'night' ? 1 : 0;
        state.timeK += Math.sign(goal - state.timeK) * Math.min(Math.abs(goal - state.timeK), dt * 0.9);
        const lampGoal = state.lampOn ? 1 : 0;
        state.lampK += Math.sign(lampGoal - state.lampK) * Math.min(Math.abs(lampGoal - state.lampK), dt * 6);
        const k = easeInOut(state.timeK);
        const A = TIMES.dusk, B = TIMES.night, L = world.lights;
        lerpColor(L.hemi.color, A.hemiSky, B.hemiSky, k);
        lerpColor(L.hemi.groundColor, A.hemiGround, B.hemiGround, k);
        L.hemi.intensity = THREE.MathUtils.lerp(A.hemi, B.hemi, k);
        lerpColor(L.sun.color, A.sun, B.sun, k);
        L.sun.intensity = THREE.MathUtils.lerp(A.sunI, B.sunI, k);
        lerpColor(L.fill.color, A.fill, B.fill, k);
        L.fill.intensity = THREE.MathUtils.lerp(A.fillI, B.fillI, k);
        L.lamp.intensity = THREE.MathUtils.lerp(A.lamp, B.lamp, k) * state.lampK;
        L.fairy.intensity = THREE.MathUtils.lerp(A.fairy, B.fairy, k);
        world.fairyBoost = THREE.MathUtils.lerp(A.fairyGlow, B.fairyGlow, k);
        world.sky.night.material.opacity = k;
        world.sky.night.visible = k > 0.001;
        world.stars.opacity = THREE.MathUtils.lerp(A.stars, B.stars, k);
        lerpColor(world.dust.material.color, A.dust, B.dust, k);
        world.lamp.glow.material.opacity = 0.9 * state.lampK;
        world.lamp.bulb.material.color.set('#7d6a55').lerp(colorA.set('#fff3c4'), state.lampK);

        // The book you picked slides out while you're looking at the shelf.
        world.books.forEach(b => {
            const want = (state.focus === 'shelf' && b === pulledBook) ? 0.09 : 0;
            b.position.x += (0.02 + want - b.position.x) * Math.min(1, dt * 8);
        });

        projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(projView);
        world.screen.tick(dt, onScreen(world.screenMesh));
        adaptResolution(dt);
        world.updaters.forEach(fn => fn(dt, t));

        // Arcade: full speed while you're playing, a lazy attract loop otherwise.
        arcadeAcc += dt;
        if (state.focus === 'arcade' || (arcadeAcc > 0.1 && onScreen(world.tvScreen))) {
            arcade.tick(arcadeAcc);
            arcadeAcc = 0;
            tvTexture.needsUpdate = true;
        }

        // Ceiling light
        state.ceilingK += Math.sign((state.ceilingOn ? 1 : 0) - state.ceilingK) * Math.min(Math.abs((state.ceilingOn ? 1 : 0) - state.ceilingK), dt * 5);
        world.lights.ceiling.intensity = state.ceilingK * 1.6;
        world.ceilingLight.material.color.set('#d9cfc6').lerp(colorA.set('#fffbe9'), state.ceilingK);
        world.ceilingGlow.material.opacity = state.ceilingK * 0.55;
        world.switchToggle.rotation.x = state.ceilingOn ? -0.4 : 0.4;

        // Disco
        if (state.disco > 0) {
            state.disco -= dt;
            world.lightsColour.disco(t);
            if (state.disco <= 0) { host.classList.remove('is-disco'); world.lightsColour.reset(); }
        }

        // What are we pointing at? (crosshair when walking with the mouse captured,
        // otherwise the cursor). Every other frame is plenty.
        if (++pickFrame % 2 === 0) {
            const aim = aimPoint();
            const usable = (state.mode === 'walk' && (state.locked || state.lockFailed)) || state.mode === 'focus' || (touch && state.mode === 'walk');
            const hit = usable && aim.x > -2 && !touch ? interactiveOf(firstHit(aim)) : null;
            if (hit !== state.target) {
                if (state.pulse <= 0) setGlow(state.target, 0);
                state.target = hit;
                canvas.classList.toggle('is-pointing', !!hit && !state.locked);
                ui.cross.classList.toggle('is-on', !!hit);
                if (hit) {
                    const i = hit.userData.interactive;
                    ui.crossLabel.innerHTML = `<b>${esc(i.label)}</b> ${esc(i.hint)}${state.locked ? ' <kbd>E</kbd>' : ''}`;
                } else {
                    ui.crossLabel.textContent = '';
                }
            }
        }

        // Right after you arrive, everything clickable glows twice so you know what to try.
        if (state.pulse > 0) {
            state.pulse = Math.max(0, state.pulse - dt);
            const p = Math.sin((1 - state.pulse / 2.4) * Math.PI * 2) ** 2;
            world.interactive.forEach(o => setGlow(o, o === state.target ? 1 : p * 0.9));
        } else if (state.target) {
            setGlow(state.target, 1);
        }

        // Door swings open a little when you point at it.
        const slab = world.named.get('door')?.getObjectByName('doorSlab');
        if (slab) slab.rotation.y += ((state.target?.name === 'door' ? 0.28 : 0) - slab.rotation.y) * Math.min(1, dt * 6);

        ink.render();
    };

    // Compile every shader now, while the transition still covers the screen,
    // so walking in doesn't stutter. One offscreen frame builds the outline pass too.
    if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, camera);
    else renderer.compile(scene, camera);
    resize();
    camera.position.set(START.x, EYE, START.z);
    camera.lookAt(START.x, EYE, START.z - 1);
    ink.render();

    // --------------------------------------------------------------- public

    return {
        start() {
            if (state.running) return;
            state.running = true;
            host.hidden = false;
            resize();
            timer.reset();

            fp.pos.set(START.x, 0, START.z);
            fp.yaw = START.yaw;
            fp.pitch = START.pitch;
            fp.vel.set(0, 0);
            fp.keys.clear();
            fp.joy.set(0, 0);
            state.focus = null;
            state.pulse = 0;
            closePanel();

            // Arrive: a short glide in from the doorway.
            const eye = eyePos();
            const look = eye.clone().add(lookDir(fp.yaw, fp.pitch));
            camera.position.copy(eye).add(V(-0.25, 0.1, 0.2));
            state.lookAt.copy(look).add(V(0, 0.05, 0));
            camera.fov = fp.fov + 12;
            camera.lookAt(state.lookAt);
            camera.updateProjectionMatrix();
            state.mode = 'intro';
            updateHud();
            flyTo(eye, look, fp.fov, 1.2, () => {
                state.mode = 'walk';
                state.pulse = 2.4;
                updateHud();
            });
            cancelAnimationFrame(raf);
            frame();
        },
        stop() {
            state.running = false;
            unlock();
            music.stop();
            world.turntable.playing = false;
            arcade.sleep();
            state.disco = 0;
            host.classList.remove('is-disco');
            cancelAnimationFrame(raf);
            fp.keys.clear();
            world.interactive.forEach(o => setGlow(o, 0));
            state.target = null;
            updateHud();
        },
        // For the preview screenshot / debugging.
        debug: {
            scene, camera, world, state, fp, act, setTime, renderer,
            settle() { if (state.tween) state.tween.t = 1 - 1e-6; },
            place(x, z, yaw, pitch) { fp.pos.set(x, 0, z); fp.vel.set(0, 0); fp.yaw = yaw; fp.pitch = pitch; }
        }
    };
}

function hudMarkup(touch) {
    return `
    <div class="room-stage"></div>
    <div class="room-cross" hidden aria-hidden="true"><span class="room-cross-dot"></span><span class="room-cross-label"></span></div>
    <div class="room-start" hidden>
        <p class="room-start-title">Click to look around</p>
        <p class="room-start-keys"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk &middot; mouse looks &middot; click or <kbd>E</kbd> to use things &middot; <kbd>Esc</kbd> frees the cursor</p>
    </div>
    <header class="room-top">
        <p class="room-name">rawad's room</p>
        <button class="room-exit" type="button">&larr; back to the 2D site</button>
    </header>
    ${touch ? '<p class="room-hint">left stick walks &middot; swipe to look &middot; tap things to open them</p>' : ''}
    <div class="room-joy" ${touch ? '' : 'hidden'} aria-hidden="true"><span class="room-joy-knob"></span></div>
    <nav class="room-chips" aria-label="Jump to">
        <button type="button" data-chip="projects">computer</button>
        <button type="button" data-chip="shelf">bookshelf</button>
        <button type="button" data-chip="roblox">roblox figure</button>
        <button type="button" data-chip="about">corkboard</button>
        <button type="button" data-chip="contact">phone</button>
        <button type="button" data-chip="arcade">console</button>
        <button type="button" data-chip="time">night</button>
    </nav>
    <aside class="room-panel" hidden aria-live="polite">
        <button class="room-close" type="button" aria-label="Back">&times;</button>
        <div class="room-panel-body"></div>
    </aside>
    <div class="room-toast" role="status"></div>
    <div class="room-fade" aria-hidden="true"></div>`;
}

function injectStyles() {
    if (document.getElementById('room-css')) return;
    const link = document.createElement('link');
    link.id = 'room-css';
    link.rel = 'stylesheet';
    link.href = new URL('./room.css', import.meta.url).href;
    document.head.appendChild(link);
}
