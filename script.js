import { loadRoblox, formatCount } from './room/data.js';

// ===== Theme =====
const root = document.documentElement;
const themeToggle = document.getElementById('themeToggle');
const themeColor = document.querySelector('meta[name="theme-color"]');

function setTheme(dark) {
    if (dark) root.dataset.theme = 'dark';
    else delete root.dataset.theme;
    themeToggle?.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    themeColor?.setAttribute('content', dark ? '#15121c' : '#f4efe4');
    try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch { /* private mode */ }
}
setTheme(root.dataset.theme === 'dark');
themeToggle?.addEventListener('click', () => setTheme(root.dataset.theme !== 'dark'));

// ===== Small things =====
const toastEl = document.getElementById('toast');
function toast(text) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add('is-on');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => toastEl.classList.remove('is-on'), 2200);
}

document.querySelectorAll('[data-copy]').forEach(btn => btn.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        toast('Copied ' + btn.dataset.copy);
    } catch {
        toast(btn.dataset.copy);
    }
}));

const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();

// ===== Roblox numbers (assets/roblox.json is refreshed on every deploy) =====
loadRoblox().then(rb => {
    const summary = document.querySelector('[data-roblox-summary]');
    if (summary) {
        summary.textContent = `The Roblox games I make. ${rb.games.length} out so far with ${formatCount(rb.totalVisits)} visits between them, and ${rb.members.toLocaleString('en')} members in the community.`;
    }
    const icons = document.querySelector('[data-roblox-icons]');
    if (icons && rb.games.length) {
        icons.replaceChildren(...rb.games.filter(g => g.img).slice(0, 8).map(g => {
            const img = new Image(28, 28);
            img.src = g.img;
            img.alt = '';
            img.loading = 'lazy';
            return img;
        }));
    }
});

// ===== Snowy =====
// Type "snowy" anywhere on the page.
let typed = '';
document.addEventListener('keydown', e => {
    if (document.body.classList.contains('in-room') || e.key.length !== 1) return;
    typed = (typed + e.key.toLowerCase()).slice(-5);
    if (typed === 'snowy') { typed = ''; snowyWalk(); }
});

function snowyWalk() {
    if (document.querySelector('.snowy')) return;
    const cat = document.createElement('div');
    cat.className = 'snowy';
    cat.innerHTML = `<svg viewBox="0 0 120 70" width="120" height="70" aria-hidden="true">
        <path class="snowy-tail" d="M18 38 C2 30 4 10 14 12" fill="none" stroke="#1d1726" stroke-width="7" stroke-linecap="round"/>
        <path class="snowy-tail" d="M18 38 C2 30 4 10 14 12" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>
        <ellipse cx="50" cy="40" rx="34" ry="17" fill="#fff" stroke="#1d1726" stroke-width="3"/>
        <g class="snowy-legs" stroke="#1d1726" stroke-width="3" fill="#fff">
            <rect x="26" y="48" width="9" height="16" rx="4"/><rect x="66" y="48" width="9" height="16" rx="4"/>
        </g>
        <circle cx="88" cy="30" r="17" fill="#fff" stroke="#1d1726" stroke-width="3"/>
        <path d="M76 18 L78 4 L88 14 Z M92 14 L102 4 L101 19 Z" fill="#fff" stroke="#1d1726" stroke-width="3" stroke-linejoin="round"/>
        <path d="M84 30 q3 3 6 0 M94 30 q3 3 6 0" fill="none" stroke="#1d1726" stroke-width="2.5" stroke-linecap="round"/>
        <circle cx="97" cy="36" r="2" fill="#ff8fa3"/>
    </svg><span class="snowy-say">mrrp</span>`;
    cat.addEventListener('click', () => {
        cat.classList.add('is-talking');
        setTimeout(() => cat.classList.remove('is-talking'), 1200);
    });
    document.body.appendChild(cat);
    cat.addEventListener('animationend', e => { if (e.animationName === 'snowy-walk') cat.remove(); });
}

// ===== 3D room =====
// The room is a separate module (three.js + the scene); it only loads when
// someone asks for it. A full-screen "warp" covers the swap both ways.
const roomEl = document.getElementById('room');
const warpEl = document.getElementById('warp');
const warpCanvas = warpEl?.querySelector('.warp-lines');
const warpStatus = warpEl?.querySelector('.warp-status');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const pageParts = [document.querySelector('.nav'), document.querySelector('main'), document.querySelector('.footer')];

let roomModule = null;
let room = null;
let roomState = 'out'; // out | entering | in | leaving
let returnFocus = null;
let pushedHash = false;

const loadRoomModule = () => (roomModule ||= import('./room/room.js'));

const tween = (ms, fn) => new Promise(resolve => {
    const t0 = performance.now();
    const step = now => {
        const k = Math.min(1, (now - t0) / ms);
        fn(k);
        if (k < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
});

// Manga-style speed lines rushing toward a point.
function drawLines(origin, strength, cover) {
    if (!warpCanvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = innerWidth, h = innerHeight;
    if (warpCanvas.width !== Math.round(w * dpr)) { warpCanvas.width = Math.round(w * dpr); warpCanvas.height = Math.round(h * dpr); }
    const ctx = warpCanvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (strength <= 0) return;
    const reach = Math.hypot(Math.max(origin.x, w - origin.x), Math.max(origin.y, h - origin.y));
    ctx.fillStyle = cover > 0.5 ? `rgba(251,246,236,${0.5 * strength})` : `rgba(29,23,38,${0.85 * strength})`;
    const count = 110;
    for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const inner = reach * (1 - strength * (0.55 + Math.random() * 0.35));
        const spread = (0.004 + Math.random() * 0.012);
        ctx.beginPath();
        ctx.moveTo(origin.x + Math.cos(a) * inner, origin.y + Math.sin(a) * inner);
        ctx.lineTo(origin.x + Math.cos(a - spread) * reach, origin.y + Math.sin(a - spread) * reach);
        ctx.lineTo(origin.x + Math.cos(a + spread) * reach, origin.y + Math.sin(a + spread) * reach);
        ctx.fill();
    }
}

function setCover(v) { warpEl?.style.setProperty('--cover', v.toFixed(3)); }

async function warpIn(origin) {
    warpEl.hidden = false;
    document.body.classList.add('warping');
    if (reduceMotion.matches) { await tween(200, k => setCover(k)); return; }
    await tween(650, k => {
        drawLines(origin, Math.min(1, k * 1.6), k);
        setCover(Math.max(0, (k - 0.45) / 0.55));
    });
}

async function warpOut(origin) {
    if (reduceMotion.matches) {
        await tween(250, k => setCover(1 - k));
    } else {
        await tween(550, k => {
            drawLines(origin, (1 - k) * 0.7, 1 - k);
            setCover(1 - k);
        });
    }
    drawLines(origin, 0, 0);
    warpEl.hidden = true;
    document.body.classList.remove('warping');
}

function originOf(el) {
    if (!el) return { x: innerWidth / 2, y: innerHeight / 2 };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

async function enterRoom(trigger) {
    if (roomState !== 'out' || !roomEl) return;
    roomState = 'entering';
    returnFocus = trigger || document.activeElement;
    const origin = originOf(trigger);
    const loading = loadRoomModule();

    await warpIn(origin);
    warpStatus.textContent = 'loading the room…';
    try {
        const { mountRoom } = await loading;
        if (!room) {
            roomEl.hidden = false;
            room = await mountRoom(roomEl, { onExit: () => leaveRoom() });
        }
    } catch (err) {
        console.error(err);
        roomEl.hidden = true;
        warpStatus.textContent = '';
        roomState = 'out';
        await warpOut(origin);
        toast("The 3D room couldn't start here (it needs WebGL).");
        if (location.hash === '#room') history.replaceState(null, '', location.pathname + location.search);
        return;
    }
    warpStatus.textContent = '';
    roomEl.hidden = false;
    document.body.classList.add('in-room');
    pageParts.forEach(el => el && (el.inert = true));
    room.start();
    if (location.hash !== '#room') { history.pushState({ room: true }, '', '#room'); pushedHash = true; }
    roomState = 'in';
    roomEl.querySelector('.room-exit')?.focus({ preventScroll: true });
    await warpOut({ x: innerWidth / 2, y: innerHeight / 2 });
}

async function leaveRoom({ fromHistory = false } = {}) {
    if (roomState !== 'in') return;
    roomState = 'leaving';
    const origin = { x: innerWidth / 2, y: innerHeight / 2 };
    await warpIn(origin);
    room.stop();
    roomEl.hidden = true;
    document.body.classList.remove('in-room');
    pageParts.forEach(el => el && (el.inert = false));
    if (!fromHistory) {
        if (pushedHash) history.back();
        else history.replaceState(null, '', location.pathname + location.search);
    }
    pushedHash = false;
    roomState = 'out';
    returnFocus?.focus?.({ preventScroll: true });
    await warpOut(originOf(returnFocus));
}

document.querySelectorAll('[data-enter-room]').forEach(btn => {
    btn.addEventListener('click', () => enterRoom(btn));
    // Start downloading three.js as soon as someone looks interested.
    btn.addEventListener('pointerenter', loadRoomModule, { once: true });
    btn.addEventListener('focus', loadRoomModule, { once: true });
});

window.addEventListener('popstate', () => {
    if (location.hash === '#room') enterRoom(null);
    else leaveRoom({ fromHistory: true });
});

if (location.hash === '#room') enterRoom(null);

// ===== Rubik's cube =====

class RubiksCube {
    constructor(containerId, cubeId, moveCountId) {
        this.container = document.getElementById(containerId);
        this.cubeEl = document.getElementById(cubeId);
        this.moveCountEl = document.getElementById(moveCountId);
        if (!this.cubeEl) return;

        this.size = window.innerWidth <= 640 ? 46 : 58;
        this.gap = 2;

        this.colors = {
            U: '#ffffff',
            D: '#ffeb3b',
            F: '#4caf50',
            B: '#2196f3',
            L: '#ff9800',
            R: '#f44336'
        };

        this.moveMap = {
            'U':  { axis: 'y', layer: -1, angle: -90 },
            "U'": { axis: 'y', layer: -1, angle: 90  },
            'D':  { axis: 'y', layer:  1, angle: 90  },
            "D'": { axis: 'y', layer:  1, angle: -90 },
            'F':  { axis: 'z', layer:  1, angle: 90  },
            "F'": { axis: 'z', layer:  1, angle: -90 },
            'B':  { axis: 'z', layer: -1, angle: -90 },
            "B'": { axis: 'z', layer: -1, angle: 90  },
            'L':  { axis: 'x', layer: -1, angle: -90 },
            "L'": { axis: 'x', layer: -1, angle: 90  },
            'R':  { axis: 'x', layer:  1, angle: 90  },
            "R'": { axis: 'x', layer:  1, angle: -90 },
        };

        this.isAnimating = false;
        this.moveQueue = [];
        this.moveCount = 0;
        this.isScrambling = false;
        this.rotX = -25;
        this.rotY = -40;

        this.cubies = [];
        this.init();
        this.setupEvents();
    }

    init() {
        this.moveCount = 0;
        this.moveQueue = [];
        this.isScrambling = false;
        if (this.moveCountEl) this.moveCountEl.textContent = '0';
        this.buildCube();
    }

    buildCube() {
        this.cubeEl.innerHTML = '';
        this.cubies = [];

        const half = this.size / 2;

        for (let x = -1; x <= 1; x++) {
            for (let y = -1; y <= 1; y++) {
                for (let z = -1; z <= 1; z++) {
                    const cubie = document.createElement('div');
                    cubie.className = 'cubie';
                    cubie.pos = { x, y, z };
                    cubie.rotMatrix = [1, 0, 0, 0, 1, 0, 0, 0, 1];

                    this.updateCubieTransform(cubie);

                    const faces = [
                        { dir: 'F', show: z === 1,  transform: `translateZ(${half}px)`,           normal: [0, 0, 1]  },
                        { dir: 'B', show: z === -1, transform: `rotateY(180deg) translateZ(${half}px)`, normal: [0, 0, -1] },
                        { dir: 'U', show: y === -1, transform: `rotateX(90deg) translateZ(${half}px)`,  normal: [0, -1, 0] },
                        { dir: 'D', show: y === 1,  transform: `rotateX(-90deg) translateZ(${half}px)`, normal: [0, 1, 0]  },
                        { dir: 'R', show: x === 1,  transform: `rotateY(90deg) translateZ(${half}px)`,  normal: [1, 0, 0]  },
                        { dir: 'L', show: x === -1, transform: `rotateY(-90deg) translateZ(${half}px)`, normal: [-1, 0, 0] }
                    ];

                    faces.forEach(({ dir, show, transform, normal }) => {
                        const face = document.createElement('div');
                        face.className = 'cubie-face';
                        face.style.width  = `${this.size - 1}px`;
                        face.style.height = `${this.size - 1}px`;
                        face.style.transform = transform;
                        face.style.background = show ? this.colors[dir] : '#111';
                        if (show) { face.dataset.color = this.colors[dir]; face.normal = normal; }
                        if (!show) face.classList.add('black-face');
                        cubie.appendChild(face);
                    });

                    this.cubeEl.appendChild(cubie);
                    this.cubies.push(cubie);
                }
            }
        }
        this.updateView();
    }

    updateCubieTransform(cubie) {
        const offset = this.size + this.gap;
        const half = this.size / 2;
        const { x, y, z } = cubie.pos;
        const m = cubie.rotMatrix;

        const mStr = `matrix3d(
            ${m[0]}, ${m[3]}, ${m[6]}, 0,
            ${m[1]}, ${m[4]}, ${m[7]}, 0,
            ${m[2]}, ${m[5]}, ${m[8]}, 0,
            ${x * offset}, ${y * offset}, ${z * offset}, 1
        )`;

        cubie.style.cssText = `
            position: absolute;
            left: 50%; top: 50%;
            width: ${this.size}px; height: ${this.size}px;
            margin-left: ${-half}px; margin-top: ${-half}px;
            transform-style: preserve-3d;
            transform: ${mStr};
        `;
    }

    move(notation) {
        const m = this.moveMap[notation];
        if (m) this.animateRotation(m.axis, m.layer, m.angle);
    }

    animateRotation(axis, layer, angle) {
        if (this.isAnimating) {
            if (this.moveQueue.length < 5) this.moveQueue.push({ axis, layer, angle });
            return;
        }
        this.isAnimating = true;

        const group = this.cubies.filter(c => Math.round(c.pos[axis]) === layer);

        const pivot = document.createElement('div');
        pivot.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;transform-style:preserve-3d;transition:transform 0.2s linear;';
        this.cubeEl.appendChild(pivot);
        group.forEach(c => pivot.appendChild(c));

        const upAxis = axis.toUpperCase();
        requestAnimationFrame(() => requestAnimationFrame(() => {
            pivot.style.transform = `rotate${upAxis}(${angle}deg)`;
        }));

        const onFinish = () => {
            pivot.removeEventListener('transitionend', onFinish);
            this.finishMove(axis, layer, angle, group, pivot);
        };
        pivot.addEventListener('transitionend', onFinish);
    }

    finishMove(axis, layer, angle, group, pivot) {
        const rad = angle * Math.PI / 180;
        const sin = Math.sin(rad);
        const cos = Math.cos(rad);

        let rM;
        if (axis === 'x')      rM = [1, 0, 0,   0, cos, -sin,  0, sin, cos];
        else if (axis === 'y') rM = [cos, 0, sin, 0, 1, 0,     -sin, 0, cos];
        else                   rM = [cos, -sin, 0, sin, cos, 0,  0, 0, 1];

        group.forEach(c => {
            const { x, y, z } = c.pos;
            let nx = x, ny = y, nz = z;
            if (axis === 'x')      { ny = y * cos - z * sin; nz = y * sin + z * cos; }
            else if (axis === 'y') { nx = x * cos + z * sin; nz = -x * sin + z * cos; }
            else                   { nx = x * cos - y * sin; ny = x * sin + y * cos; }
            c.pos = { x: Math.round(nx), y: Math.round(ny), z: Math.round(nz) };
            c.rotMatrix = this.mult3x3(rM, c.rotMatrix);
            this.updateCubieTransform(c);
            this.cubeEl.appendChild(c);
        });
        pivot.remove();

        if (!this.isScrambling) {
            this.moveCount++;
            if (this.moveCountEl) this.moveCountEl.textContent = this.moveCount;
        }
        this.isAnimating = false;

        if (this.moveQueue.length > 0) {
            this.processQueue();
        } else {
            if (this.isScrambling) this.isScrambling = false;
            this.checkSolved();
        }
    }

    processQueue() {
        if (this.moveQueue.length > 0) {
            const next = this.moveQueue.shift();
            this.animateRotation(next.axis, next.layer, next.angle);
        }
    }

    mult3x3(a, b) {
        const c = new Array(9);
        for (let i = 0; i < 3; i++)
            for (let j = 0; j < 3; j++) {
                let sum = 0;
                for (let k = 0; k < 3; k++) sum += a[i * 3 + k] * b[k * 3 + j];
                c[i * 3 + j] = sum;
            }
        return c;
    }

    checkSolved() {
        const colorDir = {
            [this.colors.U]: { axis: 1, val: -1 },
            [this.colors.D]: { axis: 1, val:  1 },
            [this.colors.F]: { axis: 2, val:  1 },
            [this.colors.B]: { axis: 2, val: -1 },
            [this.colors.R]: { axis: 0, val:  1 },
            [this.colors.L]: { axis: 0, val: -1 }
        };

        const solved = this.cubies.every(c => {
            return Array.from(c.children).filter(f => f.dataset.color).every(face => {
                const sn = face.normal;
                const m = c.rotMatrix;
                const nx = m[0]*sn[0] + m[1]*sn[1] + m[2]*sn[2];
                const ny = m[3]*sn[0] + m[4]*sn[1] + m[5]*sn[2];
                const nz = m[6]*sn[0] + m[7]*sn[1] + m[8]*sn[2];
                const expected = colorDir[face.dataset.color];
                return [nx, ny, nz][expected.axis] * expected.val > 0.9;
            });
        });

        if (solved && this.moveCount > 0) this.celebrate();
    }

    updateView() {
        this.cubeEl.style.transform = `rotateX(${this.rotX}deg) rotateY(${this.rotY}deg)`;
    }

    setupEvents() {
        let isDragging = false;
        let startX = 0, startY = 0;
        let lastX = 0, lastY = 0;
        let hasMoved = false;

        // Safe coordinate extraction from mouse or touch events
        const getXY = e => {
            if (e.touches) {
                if (!e.touches.length) return null;
                return { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
            return { x: e.clientX, y: e.clientY };
        };

        const onDragStart = e => {
            if (e.target.closest('button')) return;
            const pt = getXY(e);
            if (!pt) return;
            isDragging = true;
            hasMoved = false;
            startX = pt.x; startY = pt.y;
            lastX  = pt.x; lastY  = pt.y;
            if (this.container) this.container.style.cursor = 'grabbing';
        };

        const onDragMove = e => {
            if (!isDragging) return;
            const pt = getXY(e);
            if (!pt) return;

            const rawDx = pt.x - lastX;
            const rawDy = pt.y - lastY;

            if (!hasMoved) {
                if (Math.abs(pt.x - startX) + Math.abs(pt.y - startY) < 4) return;
                hasMoved = true;
            }

            // Clamp deltas to prevent wild spinning when mouse moves fast
            const dx = Math.max(-22, Math.min(22, rawDx));
            const dy = Math.max(-22, Math.min(22, rawDy));

            this.rotY += dx * 0.35;
            this.rotX -= dy * 0.35;
            this.rotX = Math.max(-90, Math.min(90, this.rotX));
            this.updateView();

            lastX = pt.x;
            lastY = pt.y;

            if (e.cancelable) e.preventDefault();
        };

        const onDragEnd = () => {
            isDragging = false;
            hasMoved = false;
            if (this.container) this.container.style.cursor = 'grab';
        };

        if (!this.container) return;
        this.container.addEventListener('mousedown', onDragStart);
        this.container.addEventListener('touchstart', onDragStart, { passive: true });
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('touchmove', onDragMove, { passive: false });
        document.addEventListener('mouseup', onDragEnd);
        document.addEventListener('touchend', onDragEnd);
        document.addEventListener('visibilitychange', () => { if (document.hidden) onDragEnd(); });

        document.querySelectorAll('.face-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const move = btn.dataset.move;
                if (move) this.move(move);
            });
        });

        window.addEventListener('keydown', e => {
            if (document.body.classList.contains('in-room') || e.metaKey || e.ctrlKey || e.altKey) return;
            const key = e.key.toUpperCase();
            if (['U', 'D', 'F', 'B', 'L', 'R'].includes(key)) {
                this.move(e.shiftKey ? key + "'" : key);
            }
        });

        document.getElementById('scrambleBtn')?.addEventListener('click', () => this.scramble());
        document.getElementById('resetBtn')?.addEventListener('click', () => {
            this.moveQueue = [];
            this.isAnimating = false;
            this.init();
        });
    }

    scramble() {
        if (this.isAnimating) return;
        const moves = ['U', "U'", 'D', "D'", 'F', "F'", 'B', "B'", 'L', "L'", 'R', "R'"];
        for (let i = 0; i < 25; i++) {
            const move = moves[Math.floor(Math.random() * moves.length)];
            const params = this.moveMap[move];
            if (params) this.moveQueue.push(params);
        }
        this.moveCount = 0;
        if (this.moveCountEl) this.moveCountEl.textContent = '0';
        this.isScrambling = true;
        this.processQueue();
    }

    celebrate() {
        const colors = ['#3553e8', '#ffd84d', '#1d1726', '#e9a8c8', '#86d3c8', '#ffffff'];
        for (let i = 0; i < 80; i++) {
            const p = document.createElement('div');
            Object.assign(p.style, {
                position: 'fixed',
                width: '10px', height: '10px',
                borderRadius: '50%',
                background: colors[Math.floor(Math.random() * colors.length)],
                left: Math.random() * 100 + 'vw',
                top: '-10px',
                zIndex: '9999',
                transition: `transform ${1.5 + Math.random()}s ease-out, opacity 2s`
            });
            document.body.appendChild(p);
            setTimeout(() => {
                p.style.transform = `translateY(100vh) rotate(${Math.random() * 720}deg)`;
                p.style.opacity = '0';
            }, 50);
            setTimeout(() => p.remove(), 3000);
        }
    }
}

new RubiksCube('rubiksContainer', 'rubiksCube', 'moveCount');

// ===== Konami code =====
const konami = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
let konamiAt = 0;
document.addEventListener('keydown', e => {
    if (document.body.classList.contains('in-room')) return;
    konamiAt = e.key === konami[konamiAt] ? konamiAt + 1 : (e.key === konami[0] ? 1 : 0);
    if (konamiAt === konami.length) {
        konamiAt = 0;
        document.body.animate([{ filter: 'hue-rotate(0deg)' }, { filter: 'hue-rotate(360deg)' }], { duration: 2000, iterations: 2 });
    }
});

console.log('%cHi. The source for this site is at github.com/rfahd1525/Portfolio-Website', 'font: 13px monospace');
