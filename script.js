// ===== Performance Utilities =====
const throttle = (fn, wait) => {
    let last = 0;
    return (...args) => {
        const now = Date.now();
        if (now - last >= wait) { last = now; fn(...args); }
    };
};

// ===== Cached DOM Elements =====
const cursor = document.querySelector('.cursor');
const cursorFollower = document.querySelector('.cursor-follower');
const heroVisual = document.getElementById('heroVisual');
const orbContainer = document.getElementById('orbContainer');
const typingText = document.querySelector('.typing-text');
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.nav-link');
const nav = document.querySelector('.navbar');
const statsSec = document.querySelector('.about-visual');
const projectCards = document.querySelectorAll('.project-card');
const hoverElements = document.querySelectorAll('a, button, .project-card, .skill-tag, .social-link');
const revealElements = document.querySelectorAll('.section-header,.project-card,.about-text,.stats-card,.contact-link-item,.contact-form-container');

// ===== Animation State =====
let mouseX = 0, mouseY = 0, followerX = 0, followerY = 0;
let orbSx = 0, orbSy = 0, orbTx = 0, orbTy = 0;
let statsAnimated = false;

// ===== Unified Animation Loop =====
(function animationLoop() {
    if (!document.hidden) {
        followerX += (mouseX - followerX) * 0.15;
        followerY += (mouseY - followerY) * 0.15;
        if (cursorFollower) {
            cursorFollower.style.left = followerX + 'px';
            cursorFollower.style.top = followerY + 'px';
        }

        if (heroVisual && orbContainer) {
            orbSx += (orbTx - orbSx) * 0.08;
            orbSy += (orbTy - orbSy) * 0.08;
            orbContainer.style.transform = `translate(${orbSx}px,${orbSy}px)`;
        }
    }

    requestAnimationFrame(animationLoop);
})();

// ===== Custom Cursor (Throttled) =====
document.addEventListener('mousemove', throttle(e => {
    mouseX = e.clientX; mouseY = e.clientY;
    if (cursor) { cursor.style.left = mouseX + 'px'; cursor.style.top = mouseY + 'px'; }
}, 8), { passive: true });

hoverElements.forEach(el => {
    el.addEventListener('mouseenter', () => cursorFollower?.classList.add('hover'));
    el.addEventListener('mouseleave', () => cursorFollower?.classList.remove('hover'));
});

// ===== Particle Colors =====
const DARK_PARTICLES = ['#e8503a', '#4ab0c8', '#e8a040'];
const LIGHT_PARTICLES = ['#c03a28', '#2880a0', '#b87820'];

function getParticleColors() {
    return document.documentElement.dataset.theme === 'light' ? LIGHT_PARTICLES : DARK_PARTICLES;
}

// ===== Particles =====
(function createParticles() {
    const c = document.getElementById('particles');
    if (!c) return;
    const colors = getParticleColors();
    for (let i = 0; i < 45; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.style.cssText = `left:${Math.random() * 100}%;animation-delay:${Math.random() * 15}s;animation-duration:${10 + Math.random() * 10}s;background:${colors[Math.floor(Math.random() * colors.length)]};width:${2 + Math.random() * 3}px;height:${2 + Math.random() * 3}px`;
        c.appendChild(p);
    }
})();

function updateParticleColors() {
    const colors = getParticleColors();
    document.querySelectorAll('.particle').forEach(p => {
        p.style.background = colors[Math.floor(Math.random() * colors.length)];
    });
}

// ===== Interactive Sphere =====
if (heroVisual && orbContainer) {
    heroVisual.addEventListener('mousemove', e => {
        const r = heroVisual.getBoundingClientRect();
        const rx = e.clientX - r.left - r.width / 2, ry = e.clientY - r.top - r.height / 2;
        const d = Math.sqrt(rx * rx + ry * ry);
        if (d < 200 && d > 0) { const s = (200 - d) / 200; orbTx = -rx / d * 80 * s; orbTy = -ry / d * 80 * s; }
        else { orbTx = orbTy = 0; }
    }, { passive: true });
    heroVisual.addEventListener('mouseleave', () => orbTx = orbTy = 0, { passive: true });
}

// ===== Typing Effect =====
const phrases = ['Full-Stack Developer', 'AI Enthusiast', 'Problem Solver', 'Software Developer', 'CS Student @ Western'];
let pi = 0, ci = 0, del = false;
(function type() {
    if (!typingText) return;
    const p = phrases[pi];
    typingText.textContent = p.substring(0, del ? --ci : ++ci);
    let sp = del ? 50 : 100;
    if (!del && ci === p.length) { del = true; sp = 2000; }
    else if (del && ci === 0) { del = false; pi = (pi + 1) % phrases.length; sp = 500; }
    setTimeout(type, sp);
})();

// ===== Navbar Scroll Handler (uses CSS class, not inline styles) =====
let scrollTicking = false;
const handleScroll = () => {
    const scrollTop = window.scrollY;

    sections.forEach(s => {
        if (scrollTop > s.offsetTop - 100 && scrollTop <= s.offsetTop + s.offsetHeight) {
            navLinks.forEach(l => { l.classList.toggle('active', l.getAttribute('href') === '#' + s.id); });
        }
    });

    nav?.classList.toggle('scrolled', scrollTop > 50);

    scrollTicking = false;
};

window.addEventListener('scroll', () => {
    if (!scrollTicking) {
        requestAnimationFrame(handleScroll);
        scrollTicking = true;
    }
}, { passive: true });

// Smooth scroll
document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    document.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth' });
}));

// ===== Mobile Menu Toggle =====
const hamburger = document.querySelector('.hamburger');
const navLinksEl = document.querySelector('.nav-links');
const navActions = document.querySelector('.nav-actions');

hamburger?.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navLinksEl?.classList.toggle('active');
    navActions?.classList.toggle('active');
});

navLinksEl?.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
        hamburger?.classList.remove('active');
        navLinksEl?.classList.remove('active');
        navActions?.classList.remove('active');
    });
});

// ===== Theme Toggle (Circular Ripple) =====
const themeToggle = document.getElementById('themeToggle');

// Load saved theme before paint
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'light') {
    document.documentElement.dataset.theme = 'light';
}

themeToggle?.addEventListener('click', e => {
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const goingLight = document.documentElement.dataset.theme !== 'light';

    // Radius to cover the entire viewport from the click origin
    const maxR = Math.sqrt(
        Math.max(cx, window.innerWidth - cx) ** 2 +
        Math.max(cy, window.innerHeight - cy) ** 2
    ) + 50;

    const overlay = document.createElement('div');
    overlay.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:99999', 'pointer-events:none',
        `background:${goingLight ? '#eef2f8' : '#0c0e14'}`,
        `clip-path:circle(0px at ${cx}px ${cy}px)`,
        'transition:clip-path 0.62s cubic-bezier(0.4,0,0.2,1)'
    ].join(';');
    document.body.appendChild(overlay);

    // Trigger expand
    requestAnimationFrame(() => requestAnimationFrame(() => {
        overlay.style.clipPath = `circle(${maxR}px at ${cx}px ${cy}px)`;
    }));

    // Switch theme once overlay covers the screen, then fade out
    setTimeout(() => {
        document.documentElement.dataset.theme = goingLight ? 'light' : 'dark';
        localStorage.setItem('theme', goingLight ? 'light' : 'dark');
        updateParticleColors();

        overlay.style.transition = 'opacity 0.28s ease';
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 300);
    }, 580);
});

// ===== Stats Counter =====
const statsObs = new IntersectionObserver(e => {
    if (e[0].isIntersecting && !statsAnimated) {
        document.querySelectorAll('.stat-number').forEach(s => {
            const t = +s.dataset.target; let c = 0;
            const i = setInterval(() => {
                c += t / 125;
                s.textContent = (c >= t ? t : Math.floor(c)) + '+';
                if (c >= t) clearInterval(i);
            }, 16);
        });
        statsAnimated = true;
    }
}, { threshold: 0.5 });
if (statsSec) statsObs.observe(statsSec);

// ===== Project Card Tilt =====
projectCards.forEach(c => {
    c.addEventListener('mousemove', e => {
        const r = c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        c.style.transform = `perspective(1000px) rotateX(${(y - r.height / 2) / 20}deg) rotateY(${(r.width / 2 - x) / 20}deg) translateY(-10px)`;
    }, { passive: true });
    c.addEventListener('mouseleave', () => c.style.transform = '', { passive: true });
});

// ==========================================================================
// RUBIK'S CUBE
// ==========================================================================

class RubiksCube {
    constructor(containerId, cubeId, moveCountId) {
        this.container = document.getElementById(containerId);
        this.cubeEl = document.getElementById(cubeId);
        this.moveCountEl = document.getElementById(moveCountId);
        if (!this.cubeEl) return;

        this.size = window.innerWidth <= 768 ? 50 : 65;
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

        const viewBtns = {
            'viewLeft':  () => { this.rotY -= 30; },
            'viewRight': () => { this.rotY += 30; },
            'viewUp':    () => { this.rotX -= 30; },
            'viewDown':  () => { this.rotX += 30; }
        };
        Object.keys(viewBtns).forEach(id => {
            document.getElementById(id)?.addEventListener('click', () => {
                viewBtns[id]();
                this.updateView();
            });
        });

        window.addEventListener('keydown', e => {
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
        const colors = ['#e8503a', '#4ab0c8', '#e8a040', '#c04890', '#f2eef0', '#4ab0c8'];
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

// Initialize Rubik's Cube
const cubeApp = new RubiksCube('rubiksContainer', 'rubiksCube', 'moveCount');

// Contact Form
document.getElementById('contactForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const n  = document.getElementById('name').value;
    const em = document.getElementById('email').value;
    const m  = document.getElementById('message').value;
    window.location.href = `mailto:rfahd15@gmail.com?subject=Portfolio Contact from ${encodeURIComponent(n)}&body=${encodeURIComponent(`From: ${n}\nEmail: ${em}\n\n${m}`)}`;
});

// Scroll Reveal
const revealObs = new IntersectionObserver(e => e.forEach(en => {
    if (en.isIntersecting) {
        en.target.style.opacity = '1';
        en.target.style.transform = 'translateY(0)';
    }
}), { threshold: 0.1 });

revealElements.forEach(el => {
    el.style.cssText = 'opacity:0;transform:translateY(28px);transition:opacity 0.6s,transform 0.6s';
    revealObs.observe(el);
});

// Page Load fade-in
window.addEventListener('load', () => {
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.5s';
    setTimeout(() => document.body.style.opacity = '1', 100);
});

// Dev console
console.log('%c👋 Hello, curious one.', 'font-size:18px;font-weight:bold;color:#e8503a');
console.log('%cContact: rfahd15@gmail.com', 'font-size:13px;color:#4ab0c8');
console.log('%cTry: ↑↑↓↓←→←→BA', 'font-size:11px;color:#e8a040');

let ki = 0;
const kc = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
document.addEventListener('keydown', e => {
    if (e.key === kc[ki]) { ki++; if (ki === kc.length) { easterEgg(); ki = 0; } } else ki = 0;
});
function easterEgg() {
    document.body.style.animation = 'rainbow 2s linear infinite';
    const st = document.createElement('style');
    st.id = 'rainbow-st';
    st.textContent = '@keyframes rainbow{0%{filter:hue-rotate(0)}100%{filter:hue-rotate(360deg)}}';
    document.head.appendChild(st);
    setTimeout(() => { document.body.style.animation = ''; st.remove(); }, 5000);
}
