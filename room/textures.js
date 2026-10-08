import * as THREE from 'three';

const DISPLAY = '"Dela Gothic One", "Arial Black", sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, monospace';
const SANS = '"Schibsted Grotesk", system-ui, sans-serif';
const INK = '#2a1d3d';

export async function loadFonts() {
    if (!document.fonts) return;
    try {
        await Promise.race([
            Promise.all([
                document.fonts.load(`40px ${DISPLAY}`),
                document.fonts.load(`20px ${MONO}`),
                document.fonts.load(`700 20px ${SANS}`)
            ]),
            new Promise(r => setTimeout(r, 2500))
        ]);
    } catch { /* fall back to system fonts */ }
}

function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return [c, c.getContext('2d')];
}

function texture(c, { repeat } = {}) {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (repeat) {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(repeat[0], repeat[1]);
    }
    return t;
}

// Deterministic noise so the room looks the same on every visit.
function rng(seed) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    // Safari < 16
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function cloud(ctx, x, y, s, body, light, shade) {
    const puffs = [[0, 0, 1], [0.9, -0.25, 0.8], [1.7, 0.05, 0.7], [-0.85, 0.1, 0.7], [0.4, -0.55, 0.75]];
    ctx.fillStyle = shade;
    puffs.forEach(([px, py, r]) => { ctx.beginPath(); ctx.arc(x + px * s, y + py * s + s * 0.18, r * s, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = body;
    puffs.forEach(([px, py, r]) => { ctx.beginPath(); ctx.arc(x + px * s, y + py * s, r * s, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = light;
    puffs.forEach(([px, py, r]) => { ctx.beginPath(); ctx.arc(x + px * s - r * s * 0.15, y + py * s - r * s * 0.25, r * s * 0.55, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = shade;
    ctx.fillRect(x - 1.6 * s, y + s * 0.62, 4.1 * s, s * 0.6);
}

export function skyTexture(mode) {
    const [c, ctx] = canvas(1024, 768);
    const W = c.width, H = c.height;
    const r = rng(mode === 'night' ? 7 : 3);
    const night = mode === 'night';

    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (night) {
        g.addColorStop(0, '#0b0d2b'); g.addColorStop(0.45, '#1c1f5a');
        g.addColorStop(0.75, '#39327a'); g.addColorStop(1, '#5d4a8e');
    } else {
        g.addColorStop(0, '#2e2b72'); g.addColorStop(0.32, '#6a4597');
        g.addColorStop(0.58, '#d0679c'); g.addColorStop(0.8, '#ff9b74'); g.addColorStop(1, '#ffd29a');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const stars = night ? 220 : 40;
    for (let i = 0; i < stars; i++) {
        const y = r() * H * (night ? 0.7 : 0.3);
        ctx.globalAlpha = (night ? 0.4 : 0.25) + r() * 0.6;
        ctx.fillStyle = '#fff8e6';
        const s = r() < 0.08 ? 2.4 : 1.2;
        ctx.fillRect(r() * W, y, s, s);
    }
    ctx.globalAlpha = 1;

    // Sun / moon with a soft halo.
    const [bx, by, br] = night ? [W * 0.72, H * 0.22, 46] : [W * 0.6, H * 0.74, 78];
    const halo = ctx.createRadialGradient(bx, by, br * 0.6, bx, by, br * 4);
    halo.addColorStop(0, night ? 'rgba(255,246,216,0.35)' : 'rgba(255,240,200,0.75)');
    halo.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = night ? '#fff6d8' : '#fff4d6';
    ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
    if (night) {
        ctx.fillStyle = 'rgba(200,190,220,0.35)';
        [[-14, -8, 9], [12, 10, 7], [8, -16, 5]].forEach(([dx, dy, rr]) => { ctx.beginPath(); ctx.arc(bx + dx, by + dy, rr, 0, Math.PI * 2); ctx.fill(); });
    }

    // Clouds
    const cl = night
        ? ['#2b2a66', '#4a4d99', '#1d1c4d']
        : ['#f7a3b4', '#ffd6c4', '#b65a8e'];
    cloud(ctx, W * 0.18, H * 0.34, 34, ...cl);
    cloud(ctx, W * 0.82, H * 0.46, 26, ...cl);
    cloud(ctx, W * 0.42, H * 0.18, 22, ...cl);

    // Distant hills
    ctx.fillStyle = night ? '#2a2560' : '#9a5a98';
    ctx.beginPath();
    ctx.moveTo(0, H * 0.78);
    for (let x = 0; x <= W; x += 64) ctx.lineTo(x, H * 0.76 - Math.sin(x * 0.006) * 30 - r() * 12);
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();

    // City skyline with lit windows
    const city = night ? '#191741' : '#5b3576';
    let x = -10;
    while (x < W) {
        const bw = 40 + r() * 70, bh = 60 + r() * 150;
        const top = H - 40 - bh;
        ctx.fillStyle = city;
        ctx.fillRect(x, top, bw, bh + 60);
        if (r() < 0.3) ctx.fillRect(x + bw * 0.45, top - 22, 3, 22);
        for (let wy = top + 10; wy < H - 30; wy += 14) {
            for (let wx = x + 7; wx < x + bw - 8; wx += 12) {
                if (r() < (night ? 0.42 : 0.18)) {
                    ctx.fillStyle = r() < 0.8 ? '#ffd889' : '#9fe0ff';
                    ctx.fillRect(wx, wy, 5, 6);
                }
            }
        }
        x += bw + 4;
    }
    return texture(c);
}

export function floorTexture() {
    const [c, ctx] = canvas(512, 512);
    const r = rng(11);
    const rows = 8;
    const h = c.height / rows;
    for (let i = 0; i < rows; i++) {
        let x = -r() * 200;
        while (x < c.width) {
            const w = 160 + r() * 140;
            const tone = 0.92 + r() * 0.12;
            ctx.fillStyle = `rgb(${Math.round(214 * tone)},${Math.round(150 * tone)},${Math.round(104 * tone)})`;
            ctx.fillRect(x, i * h, w, h);
            ctx.fillStyle = 'rgba(120,64,50,0.55)';
            ctx.fillRect(x, i * h, 2, h);
            x += w;
        }
        ctx.fillStyle = 'rgba(120,64,50,0.6)';
        ctx.fillRect(0, i * h, c.width, 2);
        ctx.fillStyle = 'rgba(255,230,200,0.18)';
        ctx.fillRect(0, i * h + 3, c.width, 2);
    }
    return texture(c, { repeat: [2.5, 2.5] });
}

export function wallTexture(base, accent) {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = accent;
    for (let y = 0; y < 256; y += 32) {
        for (let x = (y / 32) % 2 ? 16 : 0; x < 256; x += 32) {
            ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
        }
    }
    return texture(c, { repeat: [7, 3] });
}

export function rugTexture() {
    const [c, ctx] = canvas(512, 512);
    const cx = 256;
    const rings = ['#e98fb2', '#f6d2df', '#e98fb2', '#b56aa0', '#f6d2df', '#e98fb2'];
    rings.forEach((col, i) => {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(cx, cx, 256 - i * 42, 0, Math.PI * 2); ctx.fill();
    });
    ctx.fillStyle = '#fff1f6';
    for (let a = 0; a < 24; a++) {
        const ang = a / 24 * Math.PI * 2;
        ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * 190, cx + Math.sin(ang) * 190, 6, 0, Math.PI * 2); ctx.fill();
    }
    return texture(c);
}

export function blanketTexture() {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = '#8fb8f2';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    for (let i = 0; i < 256; i += 64) { ctx.fillRect(i, 0, 20, 256); ctx.fillRect(0, i, 256, 20); }
    ctx.fillStyle = 'rgba(60,90,170,0.25)';
    for (let i = 32; i < 256; i += 64) { ctx.fillRect(i, 0, 6, 256); ctx.fillRect(0, i, 256, 6); }
    return texture(c, { repeat: [2, 2] });
}

export function glowTexture() {
    const [c, ctx] = canvas(128, 128);
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

export function spineTexture(project, index) {
    const [c, ctx] = canvas(96, 640);
    ctx.fillStyle = project.color;
    ctx.fillRect(0, 0, 96, 640);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(0, 0, 14, 640);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(82, 0, 14, 640);
    ctx.fillStyle = '#f7ecd8';
    ctx.fillRect(0, 36, 96, 10);
    ctx.fillRect(0, 594, 96, 10);
    ctx.save();
    ctx.translate(52, 320);
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = '#fff8ec';
    let size = 40;
    ctx.font = `${size}px ${DISPLAY}`;
    while (ctx.measureText(project.name).width > 470 && size > 18) {
        size -= 2;
        ctx.font = `${size}px ${DISPLAY}`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(project.name, 0, 0);
    ctx.restore();
    ctx.fillStyle = '#fff8ec';
    ctx.font = `22px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(index + 1).padStart(2, '0'), 48, 630);
    return texture(c);
}

export function corkTexture() {
    const [c, ctx] = canvas(1024, 720);
    const r = rng(5);
    ctx.fillStyle = '#c99364';
    ctx.fillRect(0, 0, 1024, 720);
    for (let i = 0; i < 2600; i++) {
        ctx.fillStyle = r() < 0.5 ? 'rgba(120,70,40,0.35)' : 'rgba(240,200,150,0.35)';
        ctx.fillRect(r() * 1024, r() * 720, 3, 3);
    }

    const note = (x, y, w, h, rot, color, lines, size = 40) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.fillStyle = 'rgba(60,30,20,0.25)';
        ctx.fillRect(-w / 2 + 8, -h / 2 + 10, w, h);
        ctx.fillStyle = color;
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.fillStyle = INK;
        ctx.font = `700 ${size}px ${SANS}`;
        ctx.textAlign = 'left';
        lines.forEach((l, i) => ctx.fillText(l, -w / 2 + 26, -h / 2 + 62 + i * size * 1.3));
        ctx.fillStyle = '#d94660';
        ctx.beginPath(); ctx.arc(0, -h / 2 + 18, 11, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    };

    ctx.save();
    ctx.translate(190, 92);
    ctx.rotate(-0.04);
    ctx.fillStyle = '#fffaf0';
    ctx.fillRect(-120, -36, 240, 64);
    ctx.fillStyle = INK;
    ctx.font = `36px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.fillText('about me', 0, 9);
    ctx.restore();

    note(220, 380, 290, 230, 0.05, '#ffe27a', ['4th year CS', '@ Western U'], 32);
    note(530, 300, 290, 230, -0.06, '#ffb3c7', ['coding for', '~8 years'], 32);
    note(830, 200, 290, 230, 0.04, '#9fd8ff', ['roblox dev', 'w/ Pseudoname', 'Games'], 30);
    note(810, 540, 290, 230, -0.03, '#c7f0a8', ['into AI/ML', '+ game dev'], 32);

    // Polaroid of Snowy
    ctx.save();
    ctx.translate(500, 590);
    ctx.rotate(0.07);
    ctx.fillStyle = 'rgba(60,30,20,0.25)';
    ctx.fillRect(-120, -110, 250, 250);
    ctx.fillStyle = '#fffdf6';
    ctx.fillRect(-130, -120, 250, 240);
    ctx.fillStyle = '#9fb8ee';
    ctx.fillRect(-112, -102, 214, 160);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    const blob = (f) => { ctx.beginPath(); f(); ctx.fill(); ctx.stroke(); };
    blob(() => ctx.ellipse(-5, 20, 60, 34, 0, 0, Math.PI * 2));
    blob(() => ctx.arc(-50, -12, 30, 0, Math.PI * 2));
    blob(() => { ctx.moveTo(-74, -30); ctx.lineTo(-70, -62); ctx.lineTo(-52, -40); ctx.closePath(); });
    blob(() => { ctx.moveTo(-44, -40); ctx.lineTo(-30, -62); ctx.lineTo(-26, -30); ctx.closePath(); });
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(-60, -12, 6, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.beginPath(); ctx.arc(-38, -12, 6, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = `28px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillText('snowy', -5, 100);
    ctx.restore();
    return texture(c);
}

export function posterTexture(kind) {
    const [c, ctx] = canvas(512, 720);
    if (kind === 'hello') {
        const g = ctx.createLinearGradient(0, 0, 0, 720);
        g.addColorStop(0, '#ffe3c2'); g.addColorStop(1, '#ff9fb2');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 512, 720);
        ctx.fillStyle = '#d94660';
        ctx.beginPath(); ctx.arc(256, 300, 150, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#7a4a9a';
        ctx.beginPath(); ctx.moveTo(0, 520); ctx.lineTo(140, 380); ctx.lineTo(260, 500); ctx.lineTo(380, 360); ctx.lineTo(512, 480); ctx.lineTo(512, 720); ctx.lineTo(0, 720); ctx.fill();
        ctx.fillStyle = '#4a2d6b';
        ctx.beginPath(); ctx.moveTo(0, 600); ctx.lineTo(200, 500); ctx.lineTo(512, 620); ctx.lineTo(512, 720); ctx.lineTo(0, 720); ctx.fill();
        ctx.fillStyle = INK;
        ctx.font = `64px ${DISPLAY}`;
        ctx.textAlign = 'left';
        ctx.fillText('HELLO,', 30, 92);
        ctx.fillText('WORLD', 30, 160);
        ctx.fillStyle = '#fff8ec';
        ctx.font = `24px ${MONO}`;
        ctx.fillText('printf("%s\\n", msg);', 30, 680);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 10;
        ctx.strokeRect(5, 5, 502, 710);
    } else if (kind === 'engine') {
        ctx.fillStyle = '#f4ead8';
        ctx.fillRect(0, 0, 512, 720);
        ctx.strokeStyle = 'rgba(42,29,61,0.15)';
        ctx.lineWidth = 2;
        for (let x = 0; x < 512; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 720); ctx.stroke(); }
        for (let y = 0; y < 720; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke(); }
        // a little physics scene: ramp, ball, crates
        ctx.fillStyle = INK;
        ctx.beginPath(); ctx.moveTo(40, 470); ctx.lineTo(330, 560); ctx.lineTo(40, 560); ctx.fill();
        ctx.fillStyle = '#d94660';
        ctx.beginPath(); ctx.arc(120, 440, 34, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd25e';
        ctx.fillRect(360, 480, 80, 80);
        ctx.fillRect(390, 400, 80, 80);
        ctx.strokeStyle = INK; ctx.lineWidth = 6;
        ctx.strokeRect(360, 480, 80, 80);
        ctx.strokeRect(390, 400, 80, 80);
        ctx.setLineDash([10, 10]);
        ctx.beginPath(); ctx.moveTo(150, 410); ctx.quadraticCurveTo(260, 300, 380, 390); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = INK;
        ctx.fillRect(0, 560, 512, 160);
        ctx.fillStyle = '#f4ead8';
        ctx.font = `52px ${DISPLAY}`;
        ctx.fillText('CODELESS', 30, 630);
        ctx.fillStyle = '#d94660';
        ctx.fillText('ENGINE', 30, 690);
        ctx.fillStyle = INK;
        ctx.font = `22px ${MONO}`;
        ctx.fillText('C++20 / OpenGL / Box2D', 30, 60);
    } else {
        ctx.fillStyle = '#1f2347';
        ctx.fillRect(0, 0, 512, 720);
        const cols = ['#d94660', '#ffd25e', '#4ab0c8', '#8ad46a', '#b07ce8'];
        const shapes = [
            [[0, 0], [1, 0], [2, 0], [1, 1]],
            [[0, 0], [0, 1], [1, 1], [1, 2]],
            [[0, 0], [1, 0], [0, 1], [1, 1]],
            [[0, 0], [0, 1], [0, 2], [1, 2]],
            [[0, 0], [1, 0], [2, 0], [3, 0]]
        ];
        const cell = 44;
        const place = [[60, 120], [300, 90], [120, 300], [330, 280], [70, 500]];
        shapes.forEach((sh, i) => {
            sh.forEach(([x, y]) => {
                const px = place[i][0] + x * cell, py = place[i][1] + y * cell;
                ctx.fillStyle = cols[i];
                ctx.fillRect(px, py, cell - 4, cell - 4);
                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                ctx.fillRect(px, py, cell - 4, 8);
            });
        });
        ctx.fillStyle = '#fff8ec';
        ctx.font = `50px ${DISPLAY}`;
        ctx.textAlign = 'left';
        ctx.fillText('BLOCK', 36, 660);
        ctx.fillStyle = '#ffd25e';
        ctx.fillText('BLAST', 236, 660);
        ctx.font = `22px ${MONO}`;
        ctx.fillStyle = '#9aa3d8';
        ctx.fillText('ppo + action masking', 36, 60);
    }
    return texture(c);
}

export function doorSignTexture() {
    const [c, ctx] = canvas(340, 120);
    ctx.fillStyle = '#2a1d3d';
    roundRect(ctx, 0, 0, 340, 120, 18);
    ctx.fill();
    ctx.fillStyle = '#ffd25e';
    ctx.font = `40px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('EXIT \u2192 2D', 170, 64);
    return texture(c);
}

export function calendarTexture(now = new Date()) {
    const [c, ctx] = canvas(320, 400);
    ctx.fillStyle = '#fffaf2';
    ctx.fillRect(0, 0, 320, 400);
    ctx.fillStyle = '#d94660';
    ctx.fillRect(0, 0, 320, 92);
    ctx.fillStyle = '#ffffff';
    ctx.font = `46px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.fillText(now.toLocaleString('en', { month: 'short' }).toUpperCase(), 160, 66);
    ctx.font = `20px ${MONO}`;
    ctx.fillStyle = INK;
    const offset = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= days; d++) {
        const i = d - 1 + offset;
        const x = 30 + (i % 7) * 43, y = 136 + Math.floor(i / 7) * 46;
        ctx.fillText(String(d), x, y);
        if (d === now.getDate()) {
            ctx.strokeStyle = '#d94660';
            ctx.lineWidth = 4;
            ctx.beginPath(); ctx.arc(x, y - 7, 19, 0, Math.PI * 2); ctx.stroke();
        }
    }
    return texture(c);
}

export function pennantTexture() {
    const [c, ctx] = canvas(512, 160);
    ctx.fillStyle = '#4f2683';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(512, 80); ctx.lineTo(0, 160); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 26, 160);
    ctx.font = `46px ${DISPLAY}`;
    ctx.textBaseline = 'middle';
    ctx.fillText('WESTERN', 46, 84);
    return texture(c);
}

export function tvTexture() {
    const [c, ctx] = canvas(512, 288);
    const g = ctx.createLinearGradient(0, 0, 0, 288);
    g.addColorStop(0, '#3d3a8f'); g.addColorStop(0.6, '#c46aa5'); g.addColorStop(1, '#ffc6a8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 288);
    // blocky hills, pixel-art style
    const px = 16;
    ctx.fillStyle = '#5a3f8f';
    for (let x = 0; x < 512; x += px) {
        const h = 60 + Math.round((Math.sin(x * 0.02) * 30 + Math.sin(x * 0.051) * 18) / px) * px;
        ctx.fillRect(x, 288 - h, px, h);
    }
    ctx.fillStyle = '#2f2557';
    for (let x = 0; x < 512; x += px) {
        const h = 28 + Math.round((Math.sin(x * 0.035 + 2) * 16) / px) * px;
        ctx.fillRect(x, 288 - h, px, h);
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = `44px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.fillText('PRESS START', 256, 120);
    ctx.font = `16px ${MONO}`;
    ctx.fillText('1 PLAYER   2 PLAYERS', 256, 160);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 0; y < 288; y += 4) ctx.fillRect(0, y, 512, 2);
    return texture(c);
}

// Rubik's cube face: white sticker with a dark border (multiplied by the face colour).
export function stickerTexture() {
    const [c, ctx] = canvas(64, 64);
    ctx.fillStyle = '#1f1a2e';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, 6, 6, 52, 52, 8);
    ctx.fill();
    return texture(c);
}

export function heartTexture() {
    const [c, ctx] = canvas(64, 64);
    ctx.fillStyle = '#ff6b9a';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(32, 54);
    ctx.bezierCurveTo(4, 36, 6, 10, 22, 10);
    ctx.bezierCurveTo(28, 10, 32, 15, 32, 20);
    ctx.bezierCurveTo(32, 15, 36, 10, 42, 10);
    ctx.bezierCurveTo(58, 10, 60, 36, 32, 54);
    ctx.fill();
    ctx.stroke();
    return texture(c);
}

export function letterTexture(letter) {
    const [c, ctx] = canvas(64, 64);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 6;
    ctx.font = `48px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.strokeText(letter, 32, 48);
    ctx.fillText(letter, 32, 48);
    return texture(c);
}

export function faceTexture() {
    const [c, ctx] = canvas(512, 256);
    const eye = (x, flip) => {
        ctx.save();
        ctx.translate(x, 118);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.ellipse(0, 6, 40, 52, 0, 0, Math.PI * 2); ctx.fill();
        const g = ctx.createLinearGradient(0, -40, 0, 50);
        g.addColorStop(0, '#1d2a66'); g.addColorStop(1, '#4f8df0');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(0, 12, 30, 44, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#121633';
        ctx.beginPath(); ctx.ellipse(0, 10, 15, 24, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.ellipse(-12 * flip, -10, 12, 15, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(12 * flip, 32, 6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 12;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.ellipse(0, 6, 42, 54, 0, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
        ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(38 * flip, -30); ctx.lineTo(54 * flip, -42); ctx.stroke();
        ctx.restore();
    };
    eye(166, -1);
    eye(346, 1);
    ctx.fillStyle = 'rgba(255,120,150,0.55)';
    ctx.beginPath(); ctx.ellipse(110, 190, 34, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(402, 190, 34, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(220,70,110,0.8)';
    ctx.lineWidth = 4;
    [[96, 0], [112, 0], [388, 0], [404, 0]].forEach(([x]) => { ctx.beginPath(); ctx.moveTo(x, 198); ctx.lineTo(x + 10, 182); ctx.stroke(); });
    ctx.strokeStyle = INK;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(244, 196, 12, 0.1, Math.PI - 0.1);
    ctx.arc(268, 196, 12, 0.1, Math.PI - 0.1);
    ctx.stroke();
    const t = texture(c);
    t.anisotropy = 1;
    return t;
}

export function shirtTexture() {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = '#d94660';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#c63c2a';
    ctx.fillRect(0, 196, 256, 60);
    ctx.fillStyle = '#fff4e8';
    ctx.font = `86px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PG', 128, 112);
    ctx.strokeStyle = '#fff4e8';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(100, 0); ctx.lineTo(128, 34); ctx.lineTo(156, 0); ctx.stroke();
    return texture(c);
}

export function plaqueTexture(text) {
    const [c, ctx] = canvas(512, 96);
    ctx.fillStyle = '#2a1d3d';
    ctx.fillRect(0, 0, 512, 96);
    ctx.fillStyle = '#ffd25e';
    ctx.font = `40px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 50);
    return texture(c);
}

export function phoneTexture() {
    const [c, ctx] = canvas(256, 512);
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#6a4597'); g.addColorStop(1, '#ff9b74');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 512);
    ctx.fillStyle = '#fff8ec';
    ctx.font = `64px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.fillText('7:42', 128, 130);
    roundRect(ctx, 22, 300, 212, 86, 18);
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.font = `700 24px ${SANS}`;
    ctx.textAlign = 'left';
    ctx.fillText('new message', 40, 336);
    ctx.font = `18px ${MONO}`;
    ctx.fillText('say hi →', 40, 366);
    return texture(c);
}

// The monitor redraws itself while typing, so it keeps its own canvas.
export class Screen {
    constructor(projects) {
        // Drawn in 1024x600 coordinates onto a 768x450 canvas (less to upload).
        [this.canvas, this.ctx] = canvas(768, 450);
        this.texture = texture(this.canvas);
        this.projects = projects;
        this.commands = [
            'git pull',
            'cmake --build build -j8',
            'python train.py --selfplay',
            'git commit -am "fix chair clipping"',
            'git push'
        ];
        this.cmd = 0;
        this.typed = 0;
        this.hold = 0;
        this.blink = 0;
        this.draw();
    }

    // visible: skip the redraw + upload when the monitor is off screen.
    tick(dt, visible = true) {
        this.blink += dt;
        this.acc = (this.acc || 0) + dt;
        if (this.acc < 0.08) return;
        this.acc = 0;
        const full = this.commands[this.cmd];
        if (this.typed < full.length) this.typed++;
        else if ((this.hold += 0.06) > 1.6) {
            this.hold = 0;
            this.typed = 0;
            this.cmd = (this.cmd + 1) % this.commands.length;
        }
        if (visible) this.draw();
    }

    draw() {
        const { ctx } = this;
        const W = 1024, H = 600;
        ctx.setTransform(this.canvas.width / W, 0, 0, this.canvas.height / H, 0, 0);
        ctx.fillStyle = '#16152a';
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = '#24223f';
        ctx.fillRect(0, 0, W, 44);
        ['#ff6b6b', '#ffd25e', '#7ddf8a'].forEach((col, i) => {
            ctx.fillStyle = col;
            ctx.beginPath(); ctx.arc(28 + i * 26, 22, 8, 0, Math.PI * 2); ctx.fill();
        });
        ctx.fillStyle = '#9aa0d0';
        ctx.font = `20px ${MONO}`;
        ctx.textAlign = 'center';
        ctx.fillText('rawad@desk: ~/projects', W / 2, 29);

        ctx.textAlign = 'left';
        ctx.font = `24px ${MONO}`;
        ctx.fillStyle = '#7ddf8a';
        ctx.fillText('$ ls', 28, 92);
        this.projects.forEach((p, i) => {
            const col = i % 2, row = Math.floor(i / 2);
            const x = 28 + col * 490, y = 136 + row * 40;
            ctx.fillStyle = p.color === '#2b2b36' ? '#9aa0d0' : p.color;
            ctx.fillRect(x, y - 18, 16, 16);
            ctx.fillStyle = '#e9e6ff';
            ctx.fillText(p.name.toLowerCase().replace(/ /g, '-') + '/', x + 30, y);
        });

        const y = 136 + Math.ceil(this.projects.length / 2) * 40 + 28;
        ctx.fillStyle = '#7ddf8a';
        ctx.fillText('$', 28, y);
        ctx.fillStyle = '#e9e6ff';
        const text = this.commands[this.cmd].slice(0, this.typed);
        ctx.fillText(text, 56, y);
        if (Math.floor(this.blink * 2) % 2 === 0) {
            const w = ctx.measureText(text).width;
            ctx.fillStyle = '#ffd25e';
            ctx.fillRect(58 + w, y - 22, 13, 28);
        }

        ctx.fillStyle = '#5c5a8a';
        ctx.font = `18px ${MONO}`;
        ctx.fillText('click to open →', W - 210, H - 22);
        this.texture.needsUpdate = true;
    }
}
