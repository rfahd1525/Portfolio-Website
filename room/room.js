import * as THREE from 'three';
import { InkRenderer, NO_INK, noInk } from './toon.js';
import { buildWorld } from './world.js';
import { loadFonts } from './textures.js';
import { loadCustomModels } from './custom-models.js';
import { projects, games, studio, contact } from './data.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

const EYE = 1.55;          // standing eye height (m)
const RADIUS = 0.24;       // how close you can get to furniture
const SPEED = 1.7;         // walking speed (m/s)
const BOUNDS = { minX: -2.78, maxX: 2.78, minZ: -2.33, maxZ: 2.33 };
// Standing near the door, looking across at the desk and window.
const START = { x: 0.95, z: 1.9, yaw: 0.19, pitch: -0.13 };

// Furniture you bump into (bounding boxes are measured at runtime).
const SOLID = ['desk', 'chair', 'bed', 'cabinet', 'beanbag', 'plant', 'wardrobe', 'console'];

// Where the camera goes for things that open a panel.
const FOCUS = {
    projects: { position: V(0.2, 1.24, -1.08), target: V(0.2, 1.1, -2.0) },
    roblox: { position: V(0.12, 1.14, -1.2), target: V(-0.27, 0.92, -1.9) },
    shelf: { position: V(-1.5, 1.7, -0.62), target: V(-2.6, 1.6, -1.15) },
    about: { position: V(-1.25, 1.55, 1.15), target: V(-2.75, 1.52, 1.15) },
    contact: { position: V(-0.5, 1.3, -1.36), target: V(-0.46, 0.79, -1.74) }
};
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

const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = t => 1 - Math.pow(1 - t, 3);
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
    const coarse = matchMedia('(pointer: coarse)').matches;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.setClearColor('#1b1530', 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    host.innerHTML = hudMarkup(coarse);
    host.querySelector('.room-stage').appendChild(renderer.domElement);
    renderer.domElement.classList.add('room-canvas');

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(62, 1, 0.03, 40);

    const world = buildWorld(scene);
    if (coarse) world.lights.sun.shadow.mapSize.set(1024, 1024);
    const ink = new InkRenderer(renderer, scene, camera);
    const room = scene.getObjectByName('room');

    const ui = {
        stage: host.querySelector('.room-stage'),
        tip: host.querySelector('.room-tip'),
        panel: host.querySelector('.room-panel'),
        panelBody: host.querySelector('.room-panel-body'),
        toast: host.querySelector('.room-toast'),
        hint: host.querySelector('.room-hint')
    };

    // --------------------------------------------------------------- state

    const fp = {
        pos: new THREE.Vector3(START.x, 0, START.z),
        yaw: START.yaw, pitch: START.pitch,
        yawGoal: START.yaw, pitchGoal: START.pitch,
        vel: new THREE.Vector2(),
        keys: new Set(),
        dest: null,
        stuck: 0,
        bob: 0,
        fov: 62,
        zoom: 0
    };

    const state = {
        running: false,
        mode: 'intro',          // intro | walk | travel | focus
        focus: null,
        time: 'dusk',
        timeK: 0,
        lampOn: true,
        lampK: 1,
        pointer: new THREE.Vector2(-9, -9),
        pointerPx: { x: 0, y: 0 },
        parallax: new THREE.Vector2(),
        hovered: null,
        viewOffset: 0,
        viewOffsetTarget: 0,
        size: { w: 1, h: 1 },
        tween: null,
        look: new THREE.Vector3(),
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

    const setGlow = (obj, on) => {
        if (!obj) return;
        obj.traverse(o => {
            if (!o.isMesh) return;
            (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
                if (m && m.isMeshToonMaterial) m.emissive.set(on ? '#4a2f5c' : '#000000');
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
        if (state.mode === 'walk') camera.fov = fp.fov - fp.zoom;
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

    // --------------------------------------------------------------- camera moves

    const eyePos = () => V(fp.pos.x, EYE, fp.pos.z);

    const flyTo = (position, target, fov, duration, done) => {
        state.tween = {
            t: 0, duration,
            fromPos: camera.position.clone(), toPos: position.clone(),
            fromLook: state.look.clone(), toLook: target.clone(),
            fromFov: camera.fov, toFov: fov,
            done
        };
    };

    const backToWalking = () => {
        closePanel();
        if (state.mode === 'walk') return;
        state.mode = 'travel';
        state.focus = null;
        const eye = eyePos();
        flyTo(eye, eye.clone().add(lookDir(fp.yaw, fp.pitch)), fp.fov - fp.zoom, 0.9, () => { state.mode = 'walk'; });
    };

    const focusOn = (key, panel, panelArg) => {
        const f = FOCUS[key];
        fp.dest = null;
        fp.keys.clear();
        state.mode = 'travel';
        state.focus = key;
        openPanel(panel, panelArg);
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
            <h2 class="rp-title">${studio.name}</h2>
            <p>The Roblox games I make. The community has ${studio.members} members as of ${studio.asOf}.</p>
            <ul class="rp-games">
                ${games.map(g => `
                <li>
                    <img src="${g.img}" alt="" width="64" height="64" loading="lazy">
                    <div>
                        <h3>${esc(g.name)} <span>${g.visits} visits</span></h3>
                        <p>${esc(g.blurb)}</p>
                        <a href="${g.url}" target="_blank" rel="noopener">play on roblox &#8599;</a>
                    </div>
                </li>`).join('')}
            </ul>
            <a class="rp-more" href="${studio.url}" target="_blank" rel="noopener">community page &#8599;</a>`,
        about: () => `
            <p class="rp-kicker">about</p>
            <h2 class="rp-title">Rawad Fahd</h2>
            <p>Fourth-year Computer Science at Western University. I've been writing code for about eight years.</p>
            <p>Lately that means Roblox games, a 2D engine in C++, and teaching an agent to play Block Blast.</p>
            <p>Languages I use the most: Python, C++, JavaScript, Java and Luau.</p>`,
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
        const btn = e.target.closest('[data-copy]');
        if (!btn) return;
        navigator.clipboard?.writeText(btn.dataset.copy).then(() => toast('copied'), () => toast(btn.dataset.copy));
    });

    const toast = (text) => {
        ui.toast.textContent = text;
        ui.toast.classList.add('is-on');
        clearTimeout(toast.t);
        toast.t = setTimeout(() => ui.toast.classList.remove('is-on'), 1600);
    };

    // --------------------------------------------------------------- actions

    let pulledBook = null;
    const act = (info) => {
        hideHint();
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
            case 'cat': world.cat.poke(); toast('mrrp?'); break;
            case 'door': onExit?.(); break;
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
    host.querySelector('.room-close').addEventListener('click', backToWalking);
    host.querySelector('.room-exit').addEventListener('click', () => onExit?.());

    const KEYS = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', KeyD: 'r', ArrowLeft: 'tl', ArrowRight: 'tr' };
    const typing = () => /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    const onKeyDown = e => {
        if (!state.running || typing()) return;
        if (e.key === 'Escape' && state.focus) { e.preventDefault(); backToWalking(); return; }
        const k = KEYS[e.code];
        if (!k || e.metaKey || e.ctrlKey || e.altKey) return;
        e.preventDefault();
        if (state.mode === 'focus') backToWalking();
        fp.keys.add(k);
        fp.dest = null;
        hideHint();
    };
    const onKeyUp = e => { const k = KEYS[e.code]; if (k) fp.keys.delete(k); };
    const onBlur = () => fp.keys.clear();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    let hintHidden = false;
    const hideHint = () => {
        if (hintHidden) return;
        hintHidden = true;
        setTimeout(() => ui.hint.classList.add('is-gone'), 1200);
    };

    // --------------------------------------------------------------- picking

    const raycaster = new THREE.Raycaster();
    raycaster.layers.enableAll();
    const isShown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
    const floorLike = new Set([world.named.get('floor'), world.named.get('rug')]);
    // First solid thing under the pointer, ignoring glows and decals.
    const firstHit = () => {
        if (state.pointer.x < -2) return null;
        raycaster.setFromCamera(state.pointer, camera);
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

    // Little ring that marks where you clicked to walk.
    const marker = new THREE.Mesh(
        new THREE.RingGeometry(0.1, 0.14, 28).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false })
    );
    marker.position.y = 0.016;
    room.add(noInk(marker));

    const canvas = renderer.domElement;
    let down = null;
    const setPointer = e => {
        const r = canvas.getBoundingClientRect();
        state.pointer.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        state.pointerPx = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    canvas.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        setPointer(e);
        down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, touch: e.pointerType !== 'mouse' };
        canvas.setPointerCapture?.(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
        setPointer(e);
        if (!down) return;
        if (!down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) {
            down.moved = true;
            hideHint();
            canvas.classList.add('is-dragging');
        }
        if (down.moved && state.mode === 'walk') {
            // Grab-and-drag the view, like a street-view panorama.
            const k = (down.touch ? 0.0055 : 0.0042) * (camera.fov / 62);
            fp.yawGoal += (e.clientX - down.lx) * k;
            fp.pitchGoal = THREE.MathUtils.clamp(fp.pitchGoal + (e.clientY - down.ly) * k, -1.25, 1.2);
        }
        down.lx = e.clientX;
        down.ly = e.clientY;
    });
    const endDrag = () => { down = null; canvas.classList.remove('is-dragging'); };
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('pointerleave', () => { if (!down) state.pointer.set(-9, -9); });
    canvas.addEventListener('pointerup', e => {
        const wasDrag = !down || down.moved;
        endDrag();
        if (wasDrag || state.mode === 'intro' || state.mode === 'travel') return;
        setPointer(e);
        const hit = firstHit();
        const target = interactiveOf(hit);
        if (target) { act(target.userData.interactive); return; }
        if (state.focus) { backToWalking(); return; }
        if (hit && floorLike.has(hit.object) && hit.point.y < 0.05) {
            fp.dest = new THREE.Vector2(
                THREE.MathUtils.clamp(hit.point.x, BOUNDS.minX + RADIUS, BOUNDS.maxX - RADIUS),
                THREE.MathUtils.clamp(hit.point.z, BOUNDS.minZ + RADIUS, BOUNDS.maxZ - RADIUS)
            );
            fp.stuck = 0;
            marker.position.x = hit.point.x;
            marker.position.z = hit.point.z;
            marker.material.opacity = 0.9;
            hideHint();
        }
    });
    canvas.addEventListener('wheel', e => {
        if (state.mode !== 'walk') return;
        e.preventDefault();
        fp.zoom = THREE.MathUtils.clamp(fp.zoom + e.deltaY * 0.02, 0, 24);
    }, { passive: false });

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
    let hoverFrame = 0;

    const walk = (dt) => {
        fp.yaw += (fp.yawGoal - fp.yaw) * Math.min(1, dt * 14);
        fp.pitch += (fp.pitchGoal - fp.pitch) * Math.min(1, dt * 14);
        if (fp.keys.has('tl')) fp.yawGoal += dt * 1.8;
        if (fp.keys.has('tr')) fp.yawGoal -= dt * 1.8;

        // Desired direction from keys or a click-to-walk target.
        let ix = 0, iz = 0;
        if (fp.keys.has('f')) iz -= 1;
        if (fp.keys.has('b')) iz += 1;
        if (fp.keys.has('l')) ix -= 1;
        if (fp.keys.has('r')) ix += 1;
        const want = tmp2.set(0, 0);
        if (ix || iz) {
            const s = Math.sin(fp.yaw), c = Math.cos(fp.yaw);
            want.set(ix * c + iz * s, -ix * s + iz * c).normalize().multiplyScalar(SPEED);
        } else if (fp.dest) {
            const dx = fp.dest.x - fp.pos.x, dz = fp.dest.y - fp.pos.z;
            const d = Math.hypot(dx, dz);
            if (d < 0.06) fp.dest = null;
            else want.set(dx / d, dz / d).multiplyScalar(SPEED * Math.min(1, d / 0.35 + 0.25));
        }
        fp.vel.lerp(want, Math.min(1, dt * 9));
        let moved = 0;
        const steps = Math.ceil(fp.vel.length() * dt / 0.02) || 1;
        for (let i = 0; i < steps; i++) moved += move(fp.vel.x * dt / steps, fp.vel.y * dt / steps);
        if (fp.dest) {
            // Sliding along furniture is fine; only give up when we're really not getting anywhere.
            fp.stuck = moved < fp.vel.length() * dt * 0.12 ? fp.stuck + dt : 0;
            if (fp.stuck > 0.5) fp.dest = null;
        }
        const speed = moved / Math.max(dt, 1e-4);
        fp.bob += dt * 9 * Math.min(1, speed / SPEED);
        const bob = Math.sin(fp.bob) * 0.018 * Math.min(1, speed / SPEED);

        camera.position.set(fp.pos.x, EYE + bob, fp.pos.z);
        state.look.copy(camera.position).add(lookDir(fp.yaw, fp.pitch, tmp));
        camera.lookAt(state.look);
        const fov = fp.fov - fp.zoom;
        if (Math.abs(camera.fov - fov) > 0.01) {
            camera.fov += (fov - camera.fov) * Math.min(1, dt * 10);
            camera.updateProjectionMatrix();
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
            state.look.lerpVectors(tw.fromLook, tw.toLook, k);
            camera.lookAt(state.look);
            camera.fov = THREE.MathUtils.lerp(tw.fromFov, tw.toFov, k);
            camera.updateProjectionMatrix();
            if (tw.t === 1) { state.tween = null; tw.done?.(); }
        } else if (state.mode === 'focus') {
            const px = state.pointer.x < -2 ? 0 : THREE.MathUtils.clamp(state.pointer.x, -1, 1);
            const py = state.pointer.y < -2 ? 0 : THREE.MathUtils.clamp(state.pointer.y, -1, 1);
            state.parallax.lerp(tmp2.set(px, py), 0.05);
            const right = tmp.subVectors(state.focusTarget, state.focusPos).cross(camera.up).normalize();
            camera.position.copy(state.focusPos).addScaledVector(right, state.parallax.x * 0.04).addScaledVector(camera.up, state.parallax.y * 0.025);
            camera.lookAt(state.focusTarget);
        } else if (state.mode === 'walk') {
            walk(dt);
        }
        marker.material.opacity = fp.dest ? 0.6 + Math.sin(t * 6) * 0.25 : Math.max(0, marker.material.opacity - dt * 3);

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

        world.screen.tick(dt);
        world.updaters.forEach(fn => fn(dt, t));

        // Hover (every other frame is plenty)
        if (++hoverFrame % 2 === 0 && (state.mode === 'walk' || state.mode === 'focus') && !(down && down.moved)) {
            const hit = interactiveOf(firstHit());
            if (hit !== state.hovered) {
                setGlow(state.hovered, false);
                setGlow(hit, true);
                state.hovered = hit;
                canvas.classList.toggle('is-pointing', !!hit);
                if (hit) {
                    const i = hit.userData.interactive;
                    ui.tip.innerHTML = `<b>${esc(i.label)}</b> ${esc(i.hint)}`;
                }
                ui.tip.classList.toggle('is-on', !!hit);
            }
            if (hit) ui.tip.style.transform = `translate(${state.pointerPx.x + 16}px, ${state.pointerPx.y + 14}px)`;
        }
        // Door swings open a little when you point at it.
        const slab = world.named.get('door')?.getObjectByName('doorSlab');
        if (slab) slab.rotation.y += ((state.hovered?.name === 'door' ? 0.28 : 0) - slab.rotation.y) * Math.min(1, dt * 6);

        ink.render();
    };

    // --------------------------------------------------------------- public

    return {
        start() {
            if (state.running) return;
            state.running = true;
            host.hidden = false;
            resize();
            timer.reset();

            // Arrive: drop in from above with a wide FOV, then settle at eye height.
            fp.pos.set(START.x, 0, START.z);
            fp.yaw = fp.yawGoal = START.yaw;
            fp.pitch = fp.pitchGoal = START.pitch;
            fp.vel.set(0, 0);
            fp.dest = null;
            fp.zoom = 0;
            fp.keys.clear();
            state.focus = null;
            closePanel();
            const eye = eyePos();
            const look = eye.clone().add(lookDir(fp.yaw, fp.pitch));
            camera.position.copy(eye).add(V(0, 0.9, 0.2));
            state.look.copy(look).add(V(0, -0.6, 0));
            camera.fov = 100;
            camera.lookAt(state.look);
            camera.updateProjectionMatrix();
            state.mode = 'intro';
            flyTo(eye, look, fp.fov, 1.4, () => { state.mode = 'walk'; });
            cancelAnimationFrame(raf);
            frame();
        },
        stop() {
            state.running = false;
            cancelAnimationFrame(raf);
            fp.keys.clear();
            setGlow(state.hovered, false);
            state.hovered = null;
            ui.tip.classList.remove('is-on');
        },
        // For the preview screenshot / debugging.
        debug: {
            scene, camera, world, state, fp, act, setTime,
            settle() { if (state.tween) state.tween.t = 1 - 1e-6; },
            place(x, z, yaw, pitch) {
                fp.pos.set(x, 0, z);
                fp.yaw = fp.yawGoal = yaw;
                fp.pitch = fp.pitchGoal = pitch;
            }
        }
    };
}

function hudMarkup(coarse) {
    const hint = coarse
        ? 'drag to look around &middot; tap the floor to walk &middot; tap things'
        : 'drag to look around &middot; WASD or click the floor to walk &middot; click things';
    return `
    <div class="room-stage"></div>
    <div class="room-tip" aria-hidden="true"></div>
    <header class="room-top">
        <p class="room-name">rawad's room</p>
        <button class="room-exit" type="button">&larr; back to the 2D site</button>
    </header>
    <p class="room-hint">${hint}</p>
    <nav class="room-chips" aria-label="Jump to">
        <button type="button" data-chip="projects">computer</button>
        <button type="button" data-chip="shelf">bookshelf</button>
        <button type="button" data-chip="roblox">roblox figure</button>
        <button type="button" data-chip="about">corkboard</button>
        <button type="button" data-chip="contact">phone</button>
        <button type="button" data-chip="time">night</button>
    </nav>
    <aside class="room-panel" hidden aria-live="polite">
        <button class="room-close" type="button" aria-label="Close">&times;</button>
        <div class="room-panel-body"></div>
    </aside>
    <div class="room-toast" role="status"></div>`;
}

function injectStyles() {
    if (document.getElementById('room-css')) return;
    const link = document.createElement('link');
    link.id = 'room-css';
    link.rel = 'stylesheet';
    link.href = new URL('./room.css', import.meta.url).href;
    document.head.appendChild(link);
}
