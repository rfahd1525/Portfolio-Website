// The games on the TV. Everything draws into a 320x180 canvas that the room
// uses as the TV screen texture.
//
// Buttons: up / down / left / right, a (start, flap, launch), b (back to menu).

export const W = 320;
export const H = 180;

const MONO = '"JetBrains Mono", ui-monospace, monospace';
const TITLE = '"Dela Gothic One", "Arial Black", sans-serif';
const C = {
    bg: '#15132b', panel: '#221f45', ink: '#ffffff', dim: '#8d89b8',
    yellow: '#ffd84d', mint: '#86d3c8', pink: '#ff6b9a', blue: '#8ea0ff', red: '#ff5d6c'
};

export const GAMES = [
    { id: 'snake', name: 'SNAKE', help: 'arrows to steer' },
    { id: 'pong', name: 'PONG', help: 'up / down, first to 5' },
    { id: 'bricks', name: 'BRICKS', help: 'left / right, A to launch' },
    { id: 'ghost', name: 'GHOST FLAP', help: 'A or up to flap' }
];

const rand = (a, b) => a + Math.random() * (b - a);
const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export class Arcade {
    constructor({ onScore } = {}) {
        this.canvas = document.createElement('canvas');
        this.canvas.width = W;
        this.canvas.height = H;
        this.ctx = this.canvas.getContext('2d');
        this.onScore = onScore;
        this.held = new Set();
        this.mode = 'attract';   // attract | menu | play | over
        this.cursor = 0;
        this.t = 0;
        try { this.best = JSON.parse(localStorage.getItem('arcade-best')) || {}; } catch { this.best = {}; }
        this.draw();
    }

    // ------------------------------------------------------------ outside API

    wake() { if (this.mode === 'attract') this.mode = 'menu'; }

    sleep() {
        this.held.clear();
        this.mode = 'attract';
    }

    start(id) {
        const i = GAMES.findIndex(g => g.id === id);
        if (i >= 0) this.cursor = i;
        this.game = GAMES[this.cursor].id;
        this.score = 0;
        this.mode = 'play';
        this[`${this.game}Init`]();
    }

    press(button) {
        this.held.add(button);
        if (this.mode === 'attract') { this.mode = 'menu'; return; }
        if (this.mode === 'menu') {
            if (button === 'up') this.cursor = (this.cursor + GAMES.length - 1) % GAMES.length;
            if (button === 'down') this.cursor = (this.cursor + 1) % GAMES.length;
            if (button === 'a') this.start();
            return;
        }
        if (this.mode === 'over') {
            if (button === 'a') this.start();
            if (button === 'b') this.mode = 'menu';
            return;
        }
        if (button === 'b') { this.mode = 'menu'; return; }
        this[`${this.game}Press`]?.(button);
    }

    release(button) { this.held.delete(button); }

    tick(dt) {
        this.t += dt;
        if (this.mode === 'play') this[`${this.game}Tick`](Math.min(dt, 1 / 30));
        this.draw();
    }

    gameOver(label = 'GAME OVER') {
        this.mode = 'over';
        this.overLabel = label;
        const prev = this.best[this.game] || 0;
        this.newBest = this.score > prev;
        if (this.newBest) {
            this.best[this.game] = this.score;
            try { localStorage.setItem('arcade-best', JSON.stringify(this.best)); } catch { /* private mode */ }
        }
        this.onScore?.(this.game, this.score);
    }

    // ------------------------------------------------------------ drawing

    text(str, x, y, { size = 10, color = C.ink, font = MONO, align = 'left' } = {}) {
        const ctx = this.ctx;
        ctx.font = `${size}px ${font}`;
        ctx.textAlign = align;
        ctx.textBaseline = 'top';
        ctx.fillStyle = color;
        ctx.fillText(str, x, y);
    }

    draw() {
        const ctx = this.ctx;
        ctx.fillStyle = C.bg;
        ctx.fillRect(0, 0, W, H);
        if (this.mode === 'attract') this.drawAttract();
        else if (this.mode === 'menu') this.drawMenu();
        else {
            this[`${this.game}Draw`]();
            this.text(`${this.score}`, W - 8, 6, { color: C.yellow, align: 'right' });
            if (this.mode === 'over') this.drawOver();
        }
        // Scanlines
        ctx.fillStyle = 'rgba(0,0,0,0.13)';
        for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    }

    hills() {
        const ctx = this.ctx;
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#3d3a8f'); g.addColorStop(0.6, '#c46aa5'); g.addColorStop(1, '#ffc6a8');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        const px = 10;
        ctx.fillStyle = '#5a3f8f';
        for (let x = 0; x < W; x += px) {
            const h = 36 + Math.round((Math.sin(x * 0.03 + this.t * 0.2) * 18 + Math.sin(x * 0.08) * 10) / px) * px;
            ctx.fillRect(x, H - h, px, h);
        }
        ctx.fillStyle = '#2f2557';
        for (let x = 0; x < W; x += px) {
            const h = 18 + Math.round((Math.sin(x * 0.05 + 2 - this.t * 0.3) * 10) / px) * px;
            ctx.fillRect(x, H - h, px, h);
        }
    }

    drawAttract() {
        this.hills();
        this.text('ROOM ARCADE', W / 2, 46, { size: 26, font: TITLE, align: 'center' });
        if (Math.floor(this.t * 2) % 2 === 0) this.text('PRESS START', W / 2, 92, { size: 12, align: 'center' });
        this.text('4 games inside', W / 2, 112, { size: 9, color: '#ffe7f0', align: 'center' });
    }

    drawMenu() {
        this.hills();
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(21,19,43,0.82)';
        ctx.fillRect(60, 16, 200, 148);
        this.text('PICK A GAME', W / 2, 24, { size: 14, font: TITLE, align: 'center', color: C.yellow });
        GAMES.forEach((g, i) => {
            const y = 54 + i * 22;
            const on = i === this.cursor;
            if (on) { ctx.fillStyle = C.blue; ctx.fillRect(70, y - 3, 180, 17); }
            this.text(g.name, 80, y, { size: 11, color: on ? C.bg : C.ink });
            this.text(`best ${this.best[g.id] || 0}`, 240, y + 1, { size: 9, color: on ? C.bg : C.dim, align: 'right' });
        });
        this.text(GAMES[this.cursor].help, W / 2, 146, { size: 9, color: C.mint, align: 'center' });
    }

    drawOver() {
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(21,19,43,0.85)';
        ctx.fillRect(70, 50, 180, 80);
        this.text(this.overLabel, W / 2, 58, { size: 16, font: TITLE, align: 'center', color: this.overLabel === 'YOU WIN' ? C.mint : C.pink });
        this.text(`score ${this.score}${this.newBest ? '  new best!' : ''}`, W / 2, 86, { size: 10, align: 'center', color: C.yellow });
        this.text('A retry   B menu', W / 2, 108, { size: 9, align: 'center', color: C.dim });
    }

    // ------------------------------------------------------------ snake

    snakeInit() {
        this.cell = 10;
        this.cols = W / this.cell;
        this.rows = (H - 20) / this.cell;
        this.snake = [{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }];
        this.dir = { x: 1, y: 0 };
        this.nextDir = this.dir;
        this.stepTime = 0;
        this.placeFood();
    }

    placeFood() {
        do {
            this.food = { x: Math.floor(rand(0, this.cols)), y: Math.floor(rand(0, this.rows)) };
        } while (this.snake.some(s => s.x === this.food.x && s.y === this.food.y));
    }

    snakePress(b) {
        const d = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[b];
        if (d && (d.x !== -this.dir.x || d.y !== -this.dir.y)) this.nextDir = d;
    }

    snakeTick(dt) {
        this.stepTime += dt;
        const every = Math.max(0.055, 0.12 - this.score * 0.003);
        if (this.stepTime < every) return;
        this.stepTime = 0;
        this.dir = this.nextDir;
        const head = { x: this.snake[0].x + this.dir.x, y: this.snake[0].y + this.dir.y };
        if (head.x < 0 || head.y < 0 || head.x >= this.cols || head.y >= this.rows || this.snake.some(s => s.x === head.x && s.y === head.y)) {
            this.gameOver();
            return;
        }
        this.snake.unshift(head);
        if (head.x === this.food.x && head.y === this.food.y) { this.score++; this.placeFood(); }
        else this.snake.pop();
    }

    snakeDraw() {
        const ctx = this.ctx, c = this.cell, top = 20;
        ctx.fillStyle = C.panel;
        ctx.fillRect(0, top, W, H - top);
        this.text('SNAKE', 8, 6, { color: C.mint });
        ctx.fillStyle = C.pink;
        ctx.fillRect(this.food.x * c + 2, top + this.food.y * c + 2, c - 4, c - 4);
        this.snake.forEach((s, i) => {
            ctx.fillStyle = i === 0 ? C.yellow : C.mint;
            ctx.fillRect(s.x * c + 1, top + s.y * c + 1, c - 2, c - 2);
        });
    }

    // ------------------------------------------------------------ pong

    pongInit() {
        this.me = { x: 10, y: H / 2 - 16, w: 5, h: 32 };
        this.cpu = { x: W - 15, y: H / 2 - 16, w: 5, h: 32 };
        this.cpuScore = 0;
        this.serve(1);
    }

    serve(dir) {
        this.ball = { x: W / 2, y: H / 2, w: 5, h: 5, vx: 120 * dir, vy: rand(-60, 60) };
        this.wait = 0.8;
    }

    pongTick(dt) {
        const sp = 170 * dt;
        if (this.held.has('up')) this.me.y -= sp;
        if (this.held.has('down')) this.me.y += sp;
        this.me.y = Math.max(16, Math.min(H - this.me.h - 4, this.me.y));
        // The CPU is good but not perfect.
        const aim = this.ball.y - this.cpu.h / 2 + Math.sin(this.t * 1.7) * 10;
        this.cpu.y += Math.max(-115 * dt, Math.min(115 * dt, aim - this.cpu.y));
        this.cpu.y = Math.max(16, Math.min(H - this.cpu.h - 4, this.cpu.y));
        if (this.wait > 0) { this.wait -= dt; return; }
        const b = this.ball;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.y < 16) { b.y = 16; b.vy = Math.abs(b.vy); }
        if (b.y > H - b.h - 4) { b.y = H - b.h - 4; b.vy = -Math.abs(b.vy); }
        for (const p of [this.me, this.cpu]) {
            if (hit(b, p)) {
                const off = (b.y + b.h / 2 - (p.y + p.h / 2)) / (p.h / 2);
                b.vx = -b.vx * 1.06;
                b.vy = off * 150;
                b.x = p === this.me ? p.x + p.w : p.x - b.w;
            }
        }
        if (b.x < -10) {
            this.cpuScore++;
            if (this.cpuScore >= 5) this.gameOver(); else this.serve(1);
        }
        if (b.x > W + 10) {
            this.score++;
            if (this.score >= 5) this.gameOver('YOU WIN'); else this.serve(-1);
        }
    }

    pongDraw() {
        const ctx = this.ctx;
        this.text('PONG', 8, 4, { color: C.mint });
        this.text(`${this.score} : ${this.cpuScore}`, W / 2, 4, { color: C.ink, align: 'center' });
        ctx.fillStyle = C.panel;
        for (let y = 18; y < H; y += 10) ctx.fillRect(W / 2 - 1, y, 2, 5);
        ctx.fillStyle = C.mint; ctx.fillRect(this.me.x, this.me.y, this.me.w, this.me.h);
        ctx.fillStyle = C.pink; ctx.fillRect(this.cpu.x, this.cpu.y, this.cpu.w, this.cpu.h);
        ctx.fillStyle = C.yellow; ctx.fillRect(this.ball.x, this.ball.y, this.ball.w, this.ball.h);
    }

    // ------------------------------------------------------------ bricks

    bricksInit() {
        this.level = 1;
        this.lives = 3;
        this.layBricks();
    }

    layBricks() {
        const colors = [C.pink, C.yellow, C.mint, C.blue, '#c9a2ff'];
        this.bricks = [];
        for (let r = 0; r < 5; r++) for (let c = 0; c < 10; c++) {
            this.bricks.push({ x: 10 + c * 30, y: 24 + r * 11, w: 28, h: 9, color: colors[r] });
        }
        this.resetBall();
    }

    resetBall() {
        this.paddle = { x: W / 2 - 22, y: H - 14, w: 44, h: 5 };
        this.ball = { x: W / 2 - 2, y: H - 20, w: 5, h: 5, vx: 0, vy: 0, stuck: true };
    }

    bricksPress(b) {
        if (b === 'a' && this.ball.stuck) {
            this.ball.stuck = false;
            this.ball.vx = rand(-70, 70);
            this.ball.vy = -(130 + this.level * 15);
        }
    }

    bricksTick(dt) {
        const p = this.paddle, b = this.ball;
        if (this.held.has('left')) p.x -= 230 * dt;
        if (this.held.has('right')) p.x += 230 * dt;
        p.x = Math.max(0, Math.min(W - p.w, p.x));
        if (b.stuck) { b.x = p.x + p.w / 2 - 2; return; }
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.x < 0) { b.x = 0; b.vx = Math.abs(b.vx); }
        if (b.x > W - b.w) { b.x = W - b.w; b.vx = -Math.abs(b.vx); }
        if (b.y < 18) { b.y = 18; b.vy = Math.abs(b.vy); }
        if (hit(b, p) && b.vy > 0) {
            const off = (b.x + b.w / 2 - (p.x + p.w / 2)) / (p.w / 2);
            b.vx = off * 160;
            b.vy = -Math.abs(b.vy);
        }
        const brick = this.bricks.find(k => hit(b, k));
        if (brick) {
            this.bricks.splice(this.bricks.indexOf(brick), 1);
            b.vy = -b.vy;
            this.score++;
            if (!this.bricks.length) { this.level++; this.layBricks(); }
        }
        if (b.y > H) {
            this.lives--;
            if (this.lives <= 0) this.gameOver(); else this.resetBall();
        }
    }

    bricksDraw() {
        const ctx = this.ctx;
        this.text(`BRICKS  ${'♥'.repeat(this.lives)}`, 8, 4, { color: C.mint });
        this.bricks.forEach(k => { ctx.fillStyle = k.color; ctx.fillRect(k.x, k.y, k.w, k.h); });
        ctx.fillStyle = C.ink; ctx.fillRect(this.paddle.x, this.paddle.y, this.paddle.w, this.paddle.h);
        ctx.fillStyle = C.yellow; ctx.fillRect(this.ball.x, this.ball.y, this.ball.w, this.ball.h);
        if (this.ball.stuck && Math.floor(this.t * 2) % 2 === 0) this.text('A to launch', W / 2, H / 2, { size: 9, color: C.dim, align: 'center' });
    }

    // ------------------------------------------------------------ ghost flap

    ghostInit() {
        this.g = { x: 70, y: H / 2, vy: 0 };
        this.pillars = [];
        this.spawn = 0;
        this.started = false;
    }

    ghostPress(b) {
        if (b === 'a' || b === 'up') { this.g.vy = -165; this.started = true; }
    }

    ghostTick(dt) {
        const g = this.g;
        if (!this.started) { g.y = H / 2 + Math.sin(this.t * 3) * 6; return; }
        g.vy += 520 * dt;
        g.y += g.vy * dt;
        this.spawn -= dt;
        if (this.spawn <= 0) {
            this.spawn = 1.55;
            const gap = 62;
            const top = rand(30, H - gap - 20);
            this.pillars.push({ x: W + 10, top, gap, passed: false });
        }
        const box = { x: g.x - 7, y: g.y - 7, w: 14, h: 14 };
        for (const p of this.pillars) {
            p.x -= 85 * dt;
            if (!p.passed && p.x + 22 < g.x) { p.passed = true; this.score++; }
            if (hit(box, { x: p.x, y: 0, w: 22, h: p.top }) || hit(box, { x: p.x, y: p.top + p.gap, w: 22, h: H })) { this.gameOver(); return; }
        }
        this.pillars = this.pillars.filter(p => p.x > -30);
        if (g.y > H - 6 || g.y < 0) this.gameOver();
    }

    ghostDraw() {
        const ctx = this.ctx;
        const sky = ctx.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, '#0f1030'); sky.addColorStop(1, '#3b3577');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff6d8';
        ctx.beginPath(); ctx.arc(260, 34, 14, 0, Math.PI * 2); ctx.fill();
        for (const p of this.pillars) {
            ctx.fillStyle = '#6b6394';
            ctx.fillRect(p.x, 0, 22, p.top);
            ctx.fillRect(p.x, p.top + p.gap, 22, H);
            ctx.fillStyle = '#8d86b8';
            ctx.fillRect(p.x - 2, p.top - 6, 26, 6);
            ctx.fillRect(p.x - 2, p.top + p.gap, 26, 6);
        }
        const g = this.g;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(g.x, g.y - 2, 8, Math.PI, 0);
        ctx.lineTo(g.x + 8, g.y + 7);
        for (let i = 0; i < 4; i++) ctx.lineTo(g.x + 8 - (i + 0.5) * 4, g.y + (i % 2 ? 7 : 4));
        ctx.lineTo(g.x - 8, g.y + 7);
        ctx.fill();
        ctx.fillStyle = C.bg;
        ctx.fillRect(g.x - 4, g.y - 3, 2, 3);
        ctx.fillRect(g.x + 2, g.y - 3, 2, 3);
        this.text('GHOST FLAP', 8, 4, { color: C.mint });
        if (!this.started) this.text('A to flap', W / 2, H - 30, { size: 10, align: 'center', color: C.yellow });
    }
}
