import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toon, noInk } from './toon.js';
import * as tex from './textures.js';
import { projects } from './data.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function add(parent, geometry, material, x = 0, y = 0, z = 0, { cast = true, receive = true } = {}) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = receive;
    parent.add(m);
    return m;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
// Faceted look for low-poly organic shapes (toon materials have no flatShading).
const flat = geo => { const g = geo.index ? geo.toNonIndexed() : geo; g.computeVertexNormals(); return g; };
const rbox = (w, h, d, r = 0.02) => new RoundedBoxGeometry(w, h, d, 3, r);

function group(parent, name, x = 0, y = 0, z = 0) {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    parent.add(g);
    return g;
}

const C = {
    wall: '#f6e2d0',
    wallEdge: '#e2c3ad',
    wainscot: '#b9b0e6',
    trim: '#fff7ee',
    wood: '#eab889',
    woodDark: '#b9774f',
    white: '#f8f1e8',
    ink: '#2a1d3d',
    accent: '#d94660',
    plum: '#3a3150'
};

export function buildWorld(scene) {
    const world = {
        interactive: [],
        named: new Map(),
        updaters: [],
        lights: {},
        sky: {}
    };
    const root = group(scene, 'room');
    const glow = tex.glowTexture();
    const register = (obj, name) => { obj.name = name; world.named.set(name, obj); return obj; };
    const interact = (object, info) => { object.userData.interactive = info; world.interactive.push(object); return object; };
    const glowSprite = (color, size, parent, x, y, z, opacity = 0.8) => {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({
            map: glow, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending
        }));
        s.scale.setScalar(size);
        s.position.set(x, y, z);
        parent.add(noInk(s));
        return s;
    };

    // Little particle bursts: hearts for the cat, confetti for secrets.
    const heartMap = tex.heartTexture();
    const confettiGeo = new THREE.PlaneGeometry(0.018, 0.03);
    const confettiColors = ['#ffd84d', '#3553e8', '#d94660', '#86d3c8', '#ffffff', '#b9a8ff'];
    const bursts = [];
    world.burst = (pos, kind, count = 30) => {
        for (let i = 0; i < count; i++) {
            const hearts = kind === 'hearts';
            const obj = hearts
                ? new THREE.Sprite(new THREE.SpriteMaterial({ map: heartMap, transparent: true, depthWrite: false }))
                : new THREE.Mesh(confettiGeo, new THREE.MeshBasicMaterial({ color: confettiColors[i % confettiColors.length], side: THREE.DoubleSide, transparent: true }));
            obj.position.copy(pos);
            if (hearts) obj.scale.setScalar(0.045 + Math.random() * 0.025);
            root.add(noInk(obj));
            const r = () => Math.random() * 2 - 1;
            bursts.push({
                obj, hearts, age: 0,
                life: hearts ? 1.4 + Math.random() * 0.5 : 2.4,
                vel: hearts ? V(r() * 0.08, 0.22 + Math.random() * 0.12, r() * 0.08) : V(r() * 1.1, 1.4 + Math.random() * 1.2, r() * 1.1),
                spin: V(r() * 8, r() * 8, r() * 8)
            });
        }
    };
    world.updaters.push((dt) => {
        for (let i = bursts.length - 1; i >= 0; i--) {
            const b = bursts[i];
            b.age += dt;
            if (!b.hearts) {
                b.vel.y -= 3.2 * dt;
                b.vel.multiplyScalar(1 - dt * 0.8);
                b.obj.rotation.x += b.spin.x * dt;
                b.obj.rotation.y += b.spin.y * dt;
            }
            b.obj.position.addScaledVector(b.vel, dt);
            if (b.obj.position.y < 0.01) { b.obj.position.y = 0.01; b.vel.set(0, 0, 0); }
            b.obj.material.opacity = Math.min(1, (b.life - b.age) * 2);
            if (b.age >= b.life) {
                root.remove(b.obj);
                b.obj.material.dispose();
                bursts.splice(i, 1);
            }
        }
    });

    buildShell(root, world, register, interact);
    buildWindow(root, world, register, interact);
    buildDesk(root, world, register, interact, glowSprite);
    buildRobloxFigure(root, world, register, interact);
    buildShelf(root, world, register, interact);
    buildBedAndCat(root, world, register, interact);
    buildDecor(root, world, register, interact, glowSprite);
    buildLights(scene, world);
    buildDust(root, world, glow);

    return world;
}

// ---------------------------------------------------------------- shell

function buildShell(root, world, register, interact) {
    // Floor slab, textured on top only.
    const floorTop = toon('#ffffff', { map: tex.floorTexture() });
    const slabSide = toon('#8a5a46');
    const floor = add(root, box(5.56, 0.2, 4.66), [slabSide, slabSide, floorTop, slabSide, slabSide, slabSide], 0, -0.1, 0, { cast: false });
    register(floor, 'floor');

    const paper = tex.wallTexture(C.wall, '#efcfbb');
    paper.repeat.set(1 / 0.55, 1 / 0.55);
    const wallFace = toon('#ffffff', { map: paper });
    const wallSide = toon(C.wallEdge);
    const extrude = shape => new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: false });
    const rect = (x0, y0, x1, y1, path = new THREE.Shape()) => {
        path.moveTo(x0, y0); path.lineTo(x1, y0); path.lineTo(x1, y1); path.lineTo(x0, y1); path.closePath();
        return path;
    };

    // Back wall with the window, front wall with the door. Walls run 0.16
    // past the floor on every side so the corners close up.
    const back = rect(-2.94, -0.2, 2.94, 2.95);
    back.holes.push(rect(-0.45, 1.15, 0.85, 2.25, new THREE.Path()));
    register(add(root, extrude(back), [wallFace, wallSide], 0, 0, -2.49), 'backWall');

    const front = rect(-2.94, -0.2, 2.94, 2.95);
    front.holes.push(rect(1.15, 0, 2.05, 2.08, new THREE.Path()));
    register(add(root, extrude(front), [wallFace, wallSide], 0, 0, 2.33), 'frontWall');

    const side = rect(0, -0.2, 4.98, 2.95);
    const leftWall = add(root, extrude(side), [wallFace, wallSide], -2.94, 0, 2.49);
    leftWall.rotation.y = Math.PI / 2;
    register(leftWall, 'leftWall');
    const rightWall = add(root, extrude(side), [wallFace, wallSide], 2.94, 0, -2.49);
    rightWall.rotation.y = -Math.PI / 2;
    register(rightWall, 'rightWall');

    const ceiling = add(root, box(5.88, 0.12, 4.98), toon('#f7eff6'), 0, 3.01, 0, { receive: true });
    register(ceiling, 'ceiling');

    // Two-tone wainscot, rail and skirting on all four walls.
    const wain = toon(C.wainscot);
    const trim = toon(C.trim);
    const band = (y, h, inset, mat) => {
        add(root, box(5.56, h, inset), mat, 0, y, -2.33 + inset / 2);
        add(root, box(inset, h, 4.66 - 2 * inset), mat, -2.78 + inset / 2, y, 0);
        add(root, box(inset, h, 4.66 - 2 * inset), mat, 2.78 - inset / 2, y, 0);
        // Front wall, either side of the door; the ends tuck inside the door frame.
        add(root, box(3.93, h, inset), mat, -0.815, y, 2.33 - inset / 2);
        add(root, box(0.73, h, inset), mat, 2.415, y, 2.33 - inset / 2);
    };
    band(0.44, 0.88, 0.03, wain);
    band(0.89, 0.05, 0.06, trim);
    band(0.05, 0.1, 0.05, trim);
    // Crown moulding
    add(root, box(5.56, 0.06, 0.05), trim, 0, 2.92, -2.305);
    add(root, box(0.05, 0.06, 4.56), trim, -2.755, 2.92, 0);
    add(root, box(0.05, 0.06, 4.56), trim, 2.755, 2.92, 0);
    add(root, box(5.56, 0.06, 0.05), trim, 0, 2.92, 2.305);

    // Door (click it to leave)
    const door = register(group(root, 'door', 1.6, 0, 2.33), 'door');
    // Frame sits 1.2 cm inside the opening (0.9 x 2.08) so nothing is coplanar with the wall.
    add(door, box(0.08, 2.068, 0.22), trim, -0.478, 1.034, 0);
    add(door, box(0.08, 2.068, 0.22), trim, 0.478, 1.034, 0);
    add(door, box(1.036, 0.08, 0.22), trim, 0, 2.108, 0);
    const slab = group(door, 'doorSlab', -0.44, 0, 0.06);
    const doorMat = toon('#f1e4d4');
    add(slab, box(0.88, 2.06, 0.045), doorMat, 0.44, 1.03, 0);
    add(slab, box(0.62, 0.72, 0.012), toon('#e6d3bf'), 0.44, 1.5, -0.028);
    add(slab, box(0.62, 0.62, 0.012), toon('#e6d3bf'), 0.44, 0.52, -0.028);
    add(slab, new THREE.SphereGeometry(0.03, 10, 8), toon('#e0b04a'), 0.8, 1.0, -0.05);
    add(slab, box(0.03, 0.1, 0.012), toon('#e0b04a'), 0.8, 1.0, -0.028);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.12), new THREE.MeshBasicMaterial({ map: tex.doorSignTexture() }));
    sign.position.set(0.44, 1.62, -0.036);
    sign.rotation.y = Math.PI;
    slab.add(noInk(sign));
    interact(door, { id: 'door', label: 'door', hint: 'back to the 2D site' });
    // Light switch for the ceiling light
    const sw = register(group(root, 'switch', 0.95, 1.2, 2.322), 'switch');
    add(sw, box(0.08, 0.12, 0.015), toon('#ffffff'), 0, 0, 0);
    world.switchToggle = add(sw, box(0.022, 0.045, 0.014), toon('#e2dcef'), 0, 0, -0.012);
    interact(sw, { id: 'switch', label: 'light switch', hint: 'ceiling light' });

    // Ceiling light + glow-in-the-dark stars
    const lightBase = add(root, new THREE.CylinderGeometry(0.28, 0.3, 0.06, 24), toon('#ffffff'), 0, 2.92, 0, { cast: false });
    lightBase.name = 'ceilingLight';
    const diffuser = new THREE.Mesh(new THREE.CircleGeometry(0.25, 24).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#fff3dc' }));
    diffuser.position.set(0, 2.888, 0);
    root.add(noInk(diffuser));
    world.ceilingLight = diffuser;
    world.ceilingGlow = noInk(new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.glowTexture(), color: '#fff4dc', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })));
    world.ceilingGlow.position.set(0, 2.86, 0);
    world.ceilingGlow.scale.setScalar(1.6);
    root.add(world.ceilingGlow);

    const starShape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
        const a = i / 10 * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 ? 0.026 : 0.06;
        i ? starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const starGeo = new THREE.ShapeGeometry(starShape).rotateX(Math.PI / 2);
    const starMat = new THREE.MeshBasicMaterial({ color: '#d9ffb0', transparent: true, opacity: 0.35, depthWrite: false });
    world.stars = starMat;
    [[-1.6, -1.2], [-1.1, 0.6], [-2.1, 1.4], [0.8, 0.9], [1.6, -0.6], [-0.5, 1.6], [1.9, 1.6], [-1.9, -0.2], [0.9, -1.5], [-0.6, -0.7], [2.1, 0.2]].forEach(([x, z], i) => {
        const st = new THREE.Mesh(starGeo, starMat);
        st.position.set(x, 2.947, z);
        st.rotation.y = i * 0.7;
        st.scale.setScalar(0.7 + (i % 3) * 0.25);
        root.add(noInk(st));
    });
}

// ---------------------------------------------------------------- window

function buildWindow(root, world, register, interact) {
    const frameMat = toon(C.trim);
    const win = group(root, 'window', 0.2, 1.7, -2.41);
    const W = 1.3, H = 1.1, T = 0.07, D = 0.24;
    // The frame sits 1.2 cm inside the hole so its faces never share a plane with the wall's.
    const e = 0.012, iw = W / 2 - e, ih = H / 2 - e;
    add(win, box(2 * (iw + T), T, D), frameMat, 0, ih + T / 2, 0);
    add(win, box(2 * (iw + T), T, D), frameMat, 0, -ih - T / 2, 0);
    add(win, box(T, 2 * ih, D), frameMat, -iw - T / 2, 0, 0);
    add(win, box(T, 2 * ih, D), frameMat, iw + T / 2, 0, 0);
    add(win, box(0.035, 2 * ih, 0.06), frameMat, 0, 0, 0);
    add(win, box(2 * iw, 0.035, 0.05), frameMat, 0, 0.12, 0);
    const sill = add(win, box(W + 0.3, 0.04, 0.3), frameMat, 0, -H / 2 - 0.07, 0.14);
    sill.name = 'sill';

    // Curtains: boxes with sine folds.
    const curtainMat = toon('#ffb7a8');
    const curtain = (x) => {
        const g = new THREE.BoxGeometry(0.42, 1.55, 0.03, 24, 1, 1);
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + Math.sin(p.getX(i) * 38) * 0.03);
        g.computeVertexNormals();
        return add(win, g, curtainMat, x, -0.1, 0.24);
    };
    curtain(-0.86);
    curtain(0.86);
    add(win, new THREE.CylinderGeometry(0.018, 0.018, 2.3, 8).rotateZ(Math.PI / 2), toon(C.woodDark), 0, 0.72, 0.25);

    // Little cactus on the sill.
    add(win, new THREE.CylinderGeometry(0.05, 0.04, 0.08, 8), toon('#d9774b'), 0.5, -H / 2 - 0.01, 0.15);
    const cactus = add(win, flat(new THREE.CapsuleGeometry(0.028, 0.06, 3, 8)), toon('#5fb57a'), 0.5, -H / 2 + 0.08, 0.15);
    add(win, flat(new THREE.CapsuleGeometry(0.014, 0.03, 3, 6).rotateZ(-0.9)), cactus.material, 0.53, -H / 2 + 0.09, 0.15);

    // The window pane marks the stencil buffer; everything outside (sky,
    // branch) only draws where it's set, so it never pokes out past the walls.
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({
        colorWrite: false, depthWrite: false,
        stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp
    }));
    pane.position.set(0, 0, -0.02);
    pane.renderOrder = -1;
    win.add(noInk(pane));
    const outside = (mat) => {
        Object.assign(mat, { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc });
        return mat;
    };

    // Sky: two painted planes we crossfade between for day and night.
    const skyGeo = new THREE.PlaneGeometry(7.5, 5.2);
    const dusk = new THREE.Mesh(skyGeo, outside(new THREE.MeshBasicMaterial({ map: tex.skyTexture('dusk'), fog: false })));
    const night = new THREE.Mesh(skyGeo, outside(new THREE.MeshBasicMaterial({ map: tex.skyTexture('night'), transparent: true, opacity: 0, fog: false, depthWrite: false })));
    dusk.position.set(0.2, 1.7, -5.2);
    night.position.set(0.2, 1.7, -5.15);
    dusk.renderOrder = night.renderOrder = 10;
    root.add(noInk(dusk), noInk(night));
    world.sky = { dusk, night };

    // Sakura branch outside for some depth.
    const bark = outside(toon('#6b4250', { unique: true }));
    const petals = outside(toon('#ffc3d6'));
    const petalsDark = outside(toon('#f497b6'));
    const branch = register(group(root, 'sakura', -0.75, 2.2, -3.3), 'sakura');
    const limb = (len, r, rz, x, y, z) => {
        const m = add(branch, new THREE.CylinderGeometry(r * 0.55, r, len, 6), bark, x, y, z, { receive: false });
        m.rotation.set(0, 0, rz);
        return m;
    };
    limb(1.5, 0.045, -1.2, 0.55, 0.1, 0);
    limb(0.5, 0.022, -0.55, 0.9, 0.18, 0.02);
    limb(0.45, 0.02, -1.9, 0.75, -0.05, 0.02);
    const blossom = flat(new THREE.IcosahedronGeometry(1, 0));
    [[1.25, 0.32, 0.09], [1.1, 0.42, 0.07], [0.95, 0.3, 0.1], [0.75, 0.38, 0.08], [0.55, 0.22, 0.09],
        [0.35, 0.3, 0.07], [0.95, -0.12, 0.08], [1.1, -0.04, 0.065], [0.15, 0.2, 0.08], [1.3, 0.14, 0.07],
        [0.65, 0.05, 0.06], [0.45, 0.42, 0.06]].forEach(([x, y, r], i) => {
        const b = add(branch, blossom, i % 3 ? petals : petalsDark, x, y, (i % 4) * 0.03, { receive: false });
        b.scale.setScalar(r);
        b.rotation.set(i, i * 2, 0);
    });
    branch.traverse(o => { o.renderOrder = 10; });
    noInk(branch);

    interact(win, { id: 'window', label: 'window', hint: 'change the time of day' });
    register(win, 'window');
}

// ---------------------------------------------------------------- desk

function buildDesk(root, world, register, interact, glowSprite) {
    const desk = register(group(root, 'desk', 0.2, 0, -1.9), 'desk');
    const white = toon(C.white);
    add(desk, box(1.74, 0.05, 0.68), toon(C.wood), 0, 0.745, 0);
    // Drawer unit on the left, legs on the right.
    add(desk, box(0.44, 0.72, 0.62), white, -0.62, 0.36, 0);
    const drawerFront = toon('#ffd3b0');
    const knob = toon(C.plum);
    [0.58, 0.36, 0.14].forEach(y => {
        add(desk, box(0.4, 0.19, 0.02), drawerFront, -0.62, y, 0.315);
        add(desk, box(0.1, 0.022, 0.02), knob, -0.62, y + 0.04, 0.33);
    });
    add(desk, box(0.05, 0.72, 0.05), white, 0.82, 0.36, 0.28);
    add(desk, box(0.05, 0.72, 0.05), white, 0.82, 0.36, -0.28);
    add(desk, box(0.04, 0.04, 0.6), white, 0.82, 0.08, 0);

    // Monitor
    const monitor = register(group(desk, 'monitor', 0, 0.77, -0.1), 'monitor');
    const dark = toon('#2d2a40');
    add(monitor, box(0.26, 0.015, 0.17), dark, 0, 0.008, -0.02);
    add(monitor, box(0.045, 0.24, 0.03), dark, 0, 0.13, -0.06);
    add(monitor, box(0.72, 0.43, 0.035), dark, 0, 0.34, -0.02);
    add(monitor, box(0.5, 0.3, 0.05), dark, 0, 0.33, -0.06);
    const screen = new tex.Screen(projects);
    world.screen = screen;
    const display = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.39), new THREE.MeshBasicMaterial({ map: screen.texture, toneMapped: false }));
    display.position.set(0, 0.34, -0.0015);
    monitor.add(noInk(display));
    glowSprite('#8fb4ff', 1.4, monitor, 0, 0.34, 0.06, 0.18);
    interact(monitor, { id: 'projects', label: 'computer', hint: 'projects' });

    // Keyboard with instanced keys
    const keyboard = register(group(desk, 'keyboard', -0.02, 0.77, 0.2), 'keyboard');
    add(keyboard, box(0.44, 0.018, 0.15), white, 0, 0.009, 0);
    const keyGeo = box(0.024, 0.012, 0.024);
    const keys = new THREE.InstancedMesh(keyGeo, toon('#ffe9d6'), 14 * 4);
    const m4 = new THREE.Matrix4();
    let k = 0;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 14; c++) {
        m4.makeTranslation(-0.195 + c * 0.03, 0.022, -0.05 + r * 0.032);
        keys.setMatrixAt(k++, m4);
    }
    keys.castShadow = true; keys.receiveShadow = true;
    keyboard.add(keys);
    add(keyboard, box(0.2, 0.012, 0.024), toon('#ffb3c7'), 0, 0.022, 0.078);

    // Mouse + pad
    add(desk, box(0.3, 0.004, 0.24), toon('#5a4a8f'), 0.42, 0.772, 0.2, { cast: false });
    const mouse = add(desk, new THREE.SphereGeometry(1, 12, 8), white, 0.42, 0.782, 0.2);
    mouse.scale.set(0.032, 0.018, 0.05);

    // Mug with steam
    const mug = register(group(desk, 'mug', 0.62, 0.77, 0.24), 'mug');
    interact(mug, { id: 'mug', label: 'mug', hint: 'take a sip' });
    add(mug, new THREE.CylinderGeometry(0.042, 0.038, 0.1, 14), toon('#ffd25e'), 0, 0.05, 0);
    add(mug, new THREE.TorusGeometry(0.026, 0.008, 6, 12, Math.PI), toon('#ffd25e'), 0.045, 0.05, 0).rotation.z = -Math.PI / 2;
    add(mug, new THREE.CircleGeometry(0.036, 14).rotateX(-Math.PI / 2), toon('#6b3e2a'), 0, 0.092, 0, { cast: false });
    const steamMat = new THREE.SpriteMaterial({ map: tex.glowTexture(), color: '#ffffff', transparent: true, opacity: 0.0, depthWrite: false });
    const puffs = [0, 1, 2].map(i => {
        const s = new THREE.Sprite(steamMat.clone());
        s.userData.phase = i / 3;
        mug.add(noInk(s));
        return s;
    });
    const sip = { t: 0 };
    world.mug = { poke() { sip.t = 1.2; } };
    world.updaters.push((dt, t) => {
        sip.t = Math.max(0, sip.t - dt);
        const lift = Math.sin(Math.min(1, sip.t / 1.2) * Math.PI);
        mug.position.y = 0.77 + lift * 0.08;
        mug.rotation.z = lift * 0.5;
        puffs.forEach(s => {
            const p = (t * 0.35 + s.userData.phase) % 1;
            s.position.set(Math.sin(p * 6 + s.userData.phase * 4) * 0.015, 0.11 + p * 0.22, 0);
            s.scale.setScalar(0.04 + p * 0.07);
            s.material.opacity = Math.sin(p * Math.PI) * (0.35 + lift * 0.4);
        });
    });

    // Desk lamp
    const lamp = register(group(desk, 'lamp', 0.74, 0.77, -0.16), 'lamp');
    const lampMat = toon('#ffffff');
    const rod = (x1, y1, x2, y2, r) => {
        const len = Math.hypot(x2 - x1, y2 - y1);
        const m = add(lamp, new THREE.CylinderGeometry(r, r, len, 8), lampMat, (x1 + x2) / 2, (y1 + y2) / 2, 0);
        m.rotation.z = Math.atan2(x1 - x2, y2 - y1);
        return m;
    };
    add(lamp, new THREE.CylinderGeometry(0.075, 0.085, 0.025, 14), lampMat, 0, 0.012, 0);
    rod(0, 0.02, -0.07, 0.34, 0.011);
    add(lamp, new THREE.SphereGeometry(0.02, 10, 8), toon(C.accent), -0.07, 0.34, 0);
    rod(-0.07, 0.34, -0.25, 0.42, 0.01);
    const shade = add(lamp, new THREE.ConeGeometry(0.075, 0.11, 14, 1, true), toon(C.accent, { side: THREE.DoubleSide }), -0.28, 0.4, 0);
    shade.rotation.z = -0.5;
    const bulb = add(lamp, new THREE.SphereGeometry(0.026, 10, 8), new THREE.MeshBasicMaterial({ color: '#fff3c4' }), -0.3, 0.365, 0, { cast: false });
    const lampGlow = glowSprite('#ffd68a', 0.5, lamp, -0.31, 0.35, 0, 0.9);
    world.lamp = { bulb, glow: lampGlow, on: true, group: lamp };
    interact(lamp, { id: 'lamp', label: 'lamp', hint: 'click to toggle' });

    // Rubik's cube
    const cube = register(buildCube(desk, world), 'rubiks');
    cube.position.set(-0.33, 0.77 + 0.03, 0.2);
    cube.rotation.y = 0.5;
    interact(cube, { id: 'cube', label: 'cube', hint: 'click to twist' });

    // Phone
    const phone = register(group(desk, 'phone', -0.66, 0.772, 0.16), 'phone');
    phone.rotation.y = 0.35;
    add(phone, rbox(0.075, 0.01, 0.15, 0.004), toon('#2d2a40'), 0, 0.005, 0);
    const ps = new THREE.Mesh(new THREE.PlaneGeometry(0.066, 0.135).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex.phoneTexture() }));
    ps.position.y = 0.0105;
    phone.add(noInk(ps));
    interact(phone, { id: 'contact', label: 'phone', hint: 'contact' });

    // Book stack in the back corner
    const stack = register(group(desk, 'bookstack', -0.7, 0.77, -0.17), 'bookstack');
    ['#4ab0c8', '#d94660', '#ffd25e'].forEach((col, i) => {
        const b = add(stack, box(0.2 - i * 0.015, 0.035, 0.27 - i * 0.02), [toon('#fff6e6'), toon(col), toon(col), toon(col), toon('#fff6e6'), toon(col)], 0, 0.018 + i * 0.035, 0);
        b.rotation.y = (i - 1) * 0.12;
    });

    // Chair, pushed back a little
    const chair = register(group(root, 'chair', 1.22, 0, -0.78), 'chair');
    chair.rotation.y = -1.3;
    const seatMat = toon(C.accent);
    const darkMat = toon(C.plum);
    add(chair, rbox(0.52, 0.09, 0.5, 0.035), seatMat, 0, 0.5, 0);
    add(chair, rbox(0.5, 0.72, 0.09, 0.04), seatMat, 0, 0.93, 0.25).rotation.x = -0.12;
    add(chair, rbox(0.32, 0.12, 0.1, 0.04), darkMat, 0, 1.2, 0.29).rotation.x = -0.12;
    add(chair, rbox(0.06, 0.3, 0.06, 0.02), darkMat, -0.27, 0.62, 0.05);
    add(chair, rbox(0.06, 0.3, 0.06, 0.02), darkMat, 0.27, 0.62, 0.05);
    add(chair, rbox(0.08, 0.035, 0.3, 0.015), darkMat, -0.27, 0.77, 0.0);
    add(chair, rbox(0.08, 0.035, 0.3, 0.015), darkMat, 0.27, 0.77, 0.0);
    add(chair, new THREE.CylinderGeometry(0.03, 0.03, 0.36, 8), toon('#c9c4d6'), 0, 0.28, 0);
    for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2;
        const leg = add(chair, box(0.3, 0.035, 0.05), darkMat, Math.cos(a) * 0.15, 0.07, Math.sin(a) * 0.15);
        leg.rotation.y = -a;
        add(chair, new THREE.SphereGeometry(0.03, 8, 6), darkMat, Math.cos(a) * 0.29, 0.03, Math.sin(a) * 0.29);
    }
}

function buildCube(parent, world) {
    const cube = new THREE.Group();
    cube.name = 'rubiks';
    const size = 0.019;
    const colors = { px: '#d94660', nx: '#ff9a3c', py: '#ffffff', ny: '#ffd93d', pz: '#3fbf6a', nz: '#3d6fd8' };
    const black = toon('#1f1a2e');
    const geo = new RoundedBoxGeometry(size * 0.96, size * 0.96, size * 0.96, 2, 0.002);
    const cubies = [];
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
        const mats = [
            x === 1 ? toon(colors.px) : black, x === -1 ? toon(colors.nx) : black,
            y === 1 ? toon(colors.py) : black, y === -1 ? toon(colors.ny) : black,
            z === 1 ? toon(colors.pz) : black, z === -1 ? toon(colors.nz) : black
        ];
        // RoundedBoxGeometry has no face groups, so stickers go on as thin boxes.
        const c = new THREE.Mesh(geo, black);
        c.position.set(x * size, y * size, z * size);
        c.castShadow = true;
        const sticker = (axis, sign, mat) => {
            const s = new THREE.Mesh(box(axis === 'x' ? 0.001 : size * 0.78, axis === 'y' ? 0.001 : size * 0.78, axis === 'z' ? 0.001 : size * 0.78), mat);
            s.position[axis] = sign * size * 0.485;
            c.add(s);
        };
        if (x) sticker('x', x, mats[x === 1 ? 0 : 1]);
        if (y) sticker('y', y, mats[y === 1 ? 2 : 3]);
        if (z) sticker('z', z, mats[z === 1 ? 4 : 5]);
        cube.add(c);
        cubies.push(c);
    }
    parent.add(cube);

    let turning = null;
    const pivot = new THREE.Group();
    cube.add(pivot);
    world.cube = {
        twist() {
            if (turning) return;
            const axis = ['x', 'y', 'z'][Math.floor(Math.random() * 3)];
            const layer = Math.floor(Math.random() * 3) - 1;
            pivot.rotation.set(0, 0, 0);
            cube.updateMatrixWorld(true);
            cubies.filter(c => Math.round(c.position[axis] / size) === layer).forEach(c => pivot.attach(c));
            turning = { axis, t: 0, dir: Math.random() < 0.5 ? 1 : -1 };
        }
    };
    world.updaters.push(dt => {
        if (!turning) return;
        turning.t = Math.min(1, turning.t + dt * 4);
        const e = 1 - Math.pow(1 - turning.t, 3);
        pivot.rotation[turning.axis] = e * Math.PI / 2 * turning.dir;
        if (turning.t === 1) {
            cube.updateMatrixWorld(true);
            [...pivot.children].forEach(c => {
                cube.attach(c);
                c.position.set(Math.round(c.position.x / size) * size, Math.round(c.position.y / size) * size, Math.round(c.position.z / size) * size);
            });
            pivot.rotation.set(0, 0, 0);
            turning = null;
        }
    });
    // Start scrambled.
    for (let i = 0; i < 12; i++) {
        world.cube.twist();
        for (let s = 0; s < 6; s++) world.updaters[world.updaters.length - 1](0.05);
    }
    return cube;
}

// ---------------------------------------------------------------- roblox figure

function buildRobloxFigure(root, world, register, interact) {
    const desk = world.named.get('desk');
    const fig = register(group(desk, 'roblox', -0.47, 0.77, 0.0), 'roblox');
    fig.rotation.y = 0.45;

    // Green studded baseplate with a name plaque.
    const plate = toon('#4fb35f');
    add(fig, box(0.17, 0.018, 0.17), plate, 0, 0.009, 0);
    const studGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.008, 10);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        if ((i === 1 || i === 2) && (j === 1 || j === 2)) continue;
        add(fig, studGeo, plate, -0.063 + i * 0.042, 0.022, -0.063 + j * 0.042, { cast: false });
    }
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.018), new THREE.MeshBasicMaterial({ map: tex.plaqueTexture('PseudonameGames') }));
    plaque.position.set(0, 0.009, 0.0855);
    fig.add(noInk(plaque));

    const body = group(fig, 'robloxBody', 0, 0.018, 0);
    const skin = toon('#ffd45c', { unique: true });
    const pants = toon('#3f5bd0', { unique: true });
    const shirt = toon('#d94660', { unique: true });
    const shirtFront = toon('#ffffff', { map: tex.shirtTexture(), unique: true });
    const u = 0.05;

    const legL = add(body, box(u * 0.98, u * 2, u), pants, -u / 2, u, 0);
    const legR = add(body, box(u * 0.98, u * 2, u), pants, u / 2, u, 0);
    add(body, box(u * 2, u * 2, u), [shirt, shirt, shirt, shirt, shirtFront, shirt], 0, u * 3, 0);

    const arm = (side) => {
        const pivot = group(body, side < 0 ? 'armL' : 'armR', side * u * 1.5, u * 3.9, 0);
        add(pivot, box(u * 0.98, u * 2, u), skin, 0, -u * 0.9, 0);
        add(pivot, box(u * 1.02, u * 0.7, u * 1.04), shirt, 0, -u * 0.3, 0);
        return pivot;
    };
    const armL = arm(-1), armR = arm(1);

    const head = group(body, 'head', 0, u * 4.75, 0);
    const r = u * 0.82, h = u * 1.3, b = 0.01;
    const profile = [V(0, -h / 2), V(r - b, -h / 2), V(r, -h / 2 + b), V(r, h / 2 - b), V(r - b, h / 2), V(0, h / 2)].map(v => new THREE.Vector2(v.x, v.y));
    add(head, new THREE.LatheGeometry(profile, 20), skin, 0, 0, 0);
    const face = new THREE.Mesh(
        new THREE.CylinderGeometry(r + 0.0012, r + 0.0012, h * 0.82, 20, 1, true, -0.95, 1.9),
        new THREE.MeshBasicMaterial({ map: tex.faceTexture(), transparent: true, depthWrite: false })
    );
    face.position.y = -h * 0.06;
    head.add(noInk(face));

    // Spiky anime hair.
    const hair = toon('#2e2650', { unique: true });
    add(head, flat(new THREE.SphereGeometry(r * 1.1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)), hair, 0, h * 0.3, 0);
    const spike = (x, y, z, rx, rz, len = 0.045, rad = 0.018) => {
        const s = add(head, flat(new THREE.ConeGeometry(rad, len, 5)), hair, x, y, z);
        s.rotation.set(rx, 0, rz);
    };
    spike(0, h * 0.75, 0, 0, 0, 0.05);
    spike(-0.025, h * 0.65, 0.012, 0.3, 0.7);
    spike(0.026, h * 0.65, 0.01, 0.3, -0.75);
    spike(-0.02, h * 0.6, -0.025, -0.6, 0.5);
    spike(0.02, h * 0.6, -0.025, -0.6, -0.5);
    spike(0, h * 0.62, -0.035, -1.0, 0, 0.05);
    spike(-0.022, h * 0.33, r * 0.9, 2.5, 0.2, 0.035, 0.014);
    spike(0.004, h * 0.34, r * 0.98, 2.6, -0.1, 0.03, 0.013);
    spike(0.028, h * 0.33, r * 0.88, 2.5, -0.35, 0.034, 0.013);
    spike(-0.044, h * 0.15, 0.01, 0.1, 2.7, 0.04, 0.014);
    spike(0.044, h * 0.15, 0.01, 0.1, -2.7, 0.04, 0.014);

    const state = { jump: 0 };
    world.roblox = {
        poke() { state.jump = 1.4; }
    };
    world.updaters.push((dt, t) => {
        const bob = Math.sin(t * 2.2);
        body.position.y = 0.018 + Math.max(0, bob) * 0.002;
        head.rotation.z = Math.sin(t * 1.1) * 0.06;
        armL.rotation.x = Math.sin(t * 2.2) * 0.12;
        armR.rotation.x = -Math.sin(t * 2.2) * 0.12;
        armR.rotation.z = 0;
        legL.rotation.x = legR.rotation.x = 0;
        if (state.jump > 0) {
            state.jump = Math.max(0, state.jump - dt);
            const p = 1.4 - state.jump;
            if (p < 0.5) body.position.y += Math.sin(p / 0.5 * Math.PI) * 0.07;
            body.rotation.y = p < 0.5 ? p / 0.5 * Math.PI * 2 : 0;
            armR.rotation.z = Math.min(1, p * 4) * 2.6;
            armR.rotation.x = Math.sin(p * 18) * 0.35;
            armL.rotation.z = p < 0.5 ? -0.6 : 0;
        } else {
            body.rotation.y = 0;
        }
    });
    interact(fig, { id: 'roblox', label: 'roblox figure', hint: 'my roblox games' });
}

// ---------------------------------------------------------------- shelf

function buildShelf(root, world, register, interact) {
    const shelf = register(group(root, 'shelf', -2.65, 1.5, -1.15), 'shelf');
    const wood = toon(C.wood);
    add(shelf, box(0.26, 0.03, 1.2), wood, 0, 0, 0);
    add(shelf, box(0.2, 0.1, 0.03), toon(C.white), -0.02, -0.06, -0.5);
    add(shelf, box(0.2, 0.1, 0.03), toon(C.white), -0.02, -0.06, 0.5);

    const page = toon('#fff6e6');
    let z = -0.55;
    world.books = [];
    projects.forEach((p, i) => {
        const height = 0.22 + ((i * 37) % 7) * 0.012;
        const thick = 0.048 + ((i * 13) % 3) * 0.008;
        const cover = toon(p.color);
        const spine = toon('#ffffff', { map: tex.spineTexture(p, i), unique: true });
        const book = new THREE.Group();
        book.name = `book-${p.id}`;
        add(book, box(0.17, height, thick), [spine, cover, page, page, cover, cover], 0, height / 2, 0);
        book.position.set(0.02, 0.015, z + thick / 2);
        if (i === 6) { book.rotation.x = 0.16; book.position.y += 0.004; }
        shelf.add(book);
        world.books.push(book);
        interact(book, { id: 'project', project: p.id, label: p.name, hint: 'project' });
        z += thick + 0.006 + (i === 6 ? 0.03 : 0);
    });

    // A couple of objects on the end of the shelf.
    add(shelf, new THREE.CylinderGeometry(0.045, 0.035, 0.07, 8), toon('#ffffff'), 0, 0.05, 0.4);
    const succ = toon('#7cc48f');
    for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        const leaf = add(shelf, flat(new THREE.ConeGeometry(0.014, 0.06, 4)), succ, Math.cos(a) * 0.016, 0.1, 0.4 + Math.sin(a) * 0.016);
        leaf.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
    }
    const frame = add(shelf, box(0.02, 0.13, 0.1), toon(C.plum), 0.02, 0.08, 0.25);
    frame.rotation.z = 0.12;
}

// ---------------------------------------------------------------- bed + cat

function buildBedAndCat(root, world, register, interact) {
    const bed = register(group(root, 'bed', -2.13, 0, 1.2), 'bed');
    const wood = toon('#d9a27a');
    add(bed, box(1.12, 0.26, 2.06), wood, 0, 0.15, 0);
    add(bed, box(1.14, 0.78, 0.08), wood, 0, 0.39, -1.02);
    add(bed, rbox(1.04, 0.17, 1.98, 0.05), toon('#fffaf3'), 0, 0.36, 0.01);
    const blanket = add(bed, rbox(1.08, 0.07, 1.35, 0.03), toon('#ffffff', { map: tex.blanketTexture() }), 0, 0.46, 0.33);
    blanket.name = 'blanket';
    add(bed, rbox(0.62, 0.12, 0.34, 0.05), toon('#ffe0ea'), 0, 0.5, -0.72).rotation.x = -0.12;

    const cat = register(group(bed, 'cat', 0.08, 0.5, 0.5), 'cat');
    cat.rotation.y = -0.6;
    // Snowy
    const fur = toon('#f7f4f2');
    const furLight = toon('#ffffff');
    const earPink = toon('#ffc4d2');
    const torso = add(cat, flat(new THREE.SphereGeometry(1, 10, 7)), fur, 0, 0.06, 0);
    torso.scale.set(0.17, 0.085, 0.12);
    const head = group(cat, 'catHead', 0.15, 0.07, 0.04);
    add(head, flat(new THREE.SphereGeometry(0.068, 10, 7)), fur, 0, 0, 0);
    add(head, flat(new THREE.SphereGeometry(0.03, 8, 6)), furLight, 0.05, -0.015, 0.0);
    const earL = add(head, flat(new THREE.ConeGeometry(0.026, 0.05, 4)), fur, 0.0, 0.06, -0.035);
    const earR = add(head, flat(new THREE.ConeGeometry(0.026, 0.05, 4)), fur, 0.0, 0.06, 0.035);
    earL.rotation.x = -0.35; earR.rotation.x = 0.35;
    [[-0.035, -0.35], [0.035, 0.35]].forEach(([z, rx]) => {
        const inner = add(head, flat(new THREE.ConeGeometry(0.014, 0.03, 4)), earPink, 0.008, 0.058, z * 0.95);
        inner.rotation.x = rx;
    });
    const lidMat = toon(C.ink);
    [-0.028, 0.028].forEach(z => {
        const lid = add(head, new THREE.TorusGeometry(0.012, 0.0028, 4, 8, Math.PI), lidMat, 0.062, 0.008, z);
        lid.rotation.set(0, Math.PI / 2, Math.PI);
    });
    add(head, new THREE.SphereGeometry(0.008, 6, 4), toon('#ff8fa3'), 0.07, -0.006, 0);
    const tailCurve = new THREE.CatmullRomCurve3([V(-0.15, 0.03, 0), V(-0.19, 0.03, 0.08), V(-0.1, 0.025, 0.15), V(0.04, 0.02, 0.15)]);
    const tail = add(cat, new THREE.TubeGeometry(tailCurve, 12, 0.02, 6), fur, 0, 0, 0);

    // Floating z's
    const zMap = tex.letterTexture('z');
    const zs = [0, 1, 2].map(i => {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: zMap, transparent: true, depthWrite: false }));
        s.userData.phase = i / 3;
        cat.add(noInk(s));
        return s;
    });

    const state = { awake: 0, pets: 0 };
    world.cat = {
        // Returns how many times he's been petted this visit.
        poke() {
            state.awake = 2.2;
            world.burst(cat.localToWorld(V(0.16, 0.18, 0.04)), 'hearts', 5);
            return ++state.pets;
        }
    };
    world.updaters.push((dt, t) => {
        torso.scale.y = 0.085 + Math.sin(t * 1.6) * 0.004;
        tail.rotation.y = Math.sin(t * 0.8) * 0.08;
        if (state.awake > 0) {
            state.awake = Math.max(0, state.awake - dt);
            const p = Math.sin(Math.min(1, (2.2 - state.awake) * 3) * Math.PI / 2) * Math.min(1, state.awake * 2);
            head.rotation.z = p * 0.35;
            head.position.y = 0.07 + p * 0.03;
            earL.rotation.z = Math.sin(t * 30) * 0.2 * p;
            tail.rotation.y = Math.sin(t * 9) * 0.35 * p;
        } else {
            head.rotation.z = 0;
            head.position.y = 0.07;
        }
        zs.forEach(s => {
            const p = (t * 0.25 + s.userData.phase) % 1;
            s.position.set(0.18 + p * 0.05, 0.16 + p * 0.22, 0.04 + Math.sin(p * 5) * 0.03);
            s.scale.setScalar(0.035 + p * 0.04);
            s.material.opacity = state.awake > 0 ? 0 : Math.sin(p * Math.PI);
        });
    });
    interact(cat, { id: 'cat', label: 'snowy', hint: 'pet him' });
    interact(bed, { id: 'bed', label: 'bed', hint: 'take a nap' });
}

// ---------------------------------------------------------------- decor

function buildDecor(root, world, register, interact, glowSprite) {
    // Corkboard (about) above the bed
    const cork = register(group(root, 'corkboard', -2.76, 1.55, 1.15), 'corkboard');
    add(cork, box(0.04, 0.78, 1.1), toon(C.woodDark), 0, 0, 0);
    add(cork, box(0.03, 0.7, 1.0), [toon('#ffffff', { map: tex.corkTexture() }), toon('#c99364'), toon('#c99364'), toon('#c99364'), toon('#c99364'), toon('#c99364')], 0.012, 0, 0);
    interact(cork, { id: 'about', label: 'corkboard', hint: 'about me' });

    // Posters on the back wall
    const poster = (kind, x, y, w, h, rz) => {
        const g = group(root, `poster-${kind}`, x, y, -2.32);
        const edge = toon('#ffffff');
        add(g, box(w, h, 0.012), [edge, edge, edge, edge, toon('#ffffff', { map: tex.posterTexture(kind) }), edge], 0, 0, 0, { cast: false });
        g.rotation.z = rz;
        return register(g, `poster-${kind}`);
    };
    const wobbles = [];
    [poster('hello', 1.6, 1.62, 0.5, 0.7, -0.03), poster('blocks', -1.15, 1.72, 0.44, 0.62, 0.025)].forEach(p => {
        const w = { obj: p, base: p.rotation.z, t: 0 };
        wobbles.push(w);
        interact(p, { id: 'poster', label: 'poster', hint: 'straighten it' });
    });
    world.wobble = obj => { const w = wobbles.find(x => x.obj === obj); if (w) w.t = 1.6; };
    world.updaters.push(dt => wobbles.forEach(w => {
        w.t = Math.max(0, w.t - dt);
        w.obj.rotation.z = w.base * (w.t > 0 ? 1 : 1) + Math.sin(w.t * 14) * 0.08 * w.t;
    }));

    // Rug
    const rugMat = toon('#e98fb2');
    register(add(root, new THREE.CylinderGeometry(1.05, 1.05, 0.012, 40), [rugMat, toon('#ffffff', { map: tex.rugTexture() }), rugMat], 0.35, 0.006, 0.35, { cast: false }), 'rug');

    // Floor plant in the back-left corner
    const plant = register(group(root, 'plant', -2.3, 0, -1.92), 'plant');
    add(plant, new THREE.CylinderGeometry(0.17, 0.13, 0.32, 10), toon('#d9774b'), 0, 0.16, 0);
    add(plant, new THREE.CylinderGeometry(0.175, 0.175, 0.04, 10), toon('#c4643c'), 0, 0.31, 0);
    const leafA = toon('#5fb57a');
    const leafB = toon('#3f9a6a');
    const stem = toon('#4a8a5a');
    const stems = [];
    for (let i = 0; i < 9; i++) {
        const a = i / 9 * Math.PI * 2 + (i % 2) * 0.3;
        const tilt = 0.35 + (i % 3) * 0.18;
        const len = 0.55 + (i % 4) * 0.12;
        const s = new THREE.Group();
        s.position.set(0, 0.3, 0);
        s.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt);
        plant.add(s);
        add(s, new THREE.CylinderGeometry(0.008, 0.01, len, 5), stem, 0, len / 2, 0);
        const leaf = add(s, flat(new THREE.SphereGeometry(1, 6, 4)), i % 2 ? leafA : leafB, 0, len + 0.05, 0);
        leaf.scale.set(0.12, 0.17, 0.035);
        leaf.rotation.y = a;
        stems.push({ s, rx: s.rotation.x, rz: s.rotation.z, phase: i });
    }
    const wiggle = { t: 0 };
    world.plant = { poke() { wiggle.t = 1.5; } };
    world.updaters.push((dt, t) => {
        wiggle.t = Math.max(0, wiggle.t - dt);
        stems.forEach(st => {
            const k = Math.sin(t * 12 + st.phase) * 0.12 * wiggle.t + Math.sin(t * 0.9 + st.phase) * 0.015;
            st.s.rotation.x = st.rx + k;
            st.s.rotation.z = st.rz + k * 0.7;
        });
    });
    interact(plant, { id: 'plant', label: 'plant', hint: 'water it' });

    // Low cabinet with a record player under the poster
    const cab = register(group(root, 'cabinet', 1.85, 0, -2.05), 'cabinet');
    add(cab, box(0.95, 0.5, 0.48), toon(C.white), 0, 0.27, 0);
    add(cab, box(0.95, 0.04, 0.48), toon(C.wood), 0, 0.54, 0);
    add(cab, box(0.43, 0.38, 0.02), toon('#ffd3b0'), -0.225, 0.27, 0.245);
    add(cab, box(0.43, 0.38, 0.02), toon('#b9b0e6'), 0.225, 0.27, 0.245);
    [-0.06, 0.06].forEach(x => add(cab, box(0.02, 0.1, 0.02), toon(C.plum), x, 0.3, 0.26));
    [-0.4, 0.4].forEach(x => add(cab, new THREE.CylinderGeometry(0.02, 0.015, 0.04, 6), toon(C.plum), x, 0.02, 0.18));
    const deck = register(group(cab, 'turntable', -0.15, 0.56, 0.02), 'turntable');
    add(deck, box(0.42, 0.07, 0.34), toon('#7a4a3a'), 0, 0.035, 0);
    const platter = add(deck, new THREE.CylinderGeometry(0.14, 0.14, 0.012, 24), toon('#1f1a2e'), -0.04, 0.076, 0);
    add(platter, new THREE.CylinderGeometry(0.05, 0.05, 0.003, 16), toon(C.accent), 0, 0.007, 0);
    const armPivot = group(deck, 'tonearm', 0.16, 0.09, -0.1);
    add(armPivot, new THREE.CylinderGeometry(0.018, 0.018, 0.03, 10), toon('#d9d4e6'), 0, -0.005, 0);
    add(armPivot, box(0.012, 0.012, 0.2), toon('#d9d4e6'), 0, 0, 0.1);
    world.turntable = { playing: false };
    world.updaters.push(dt => {
        const playing = world.turntable.playing;
        if (playing) platter.rotation.y -= dt * 3.5;
        // Arm swings over the record while it plays.
        armPivot.rotation.y += ((playing ? -0.45 : 0.2) - armPivot.rotation.y) * Math.min(1, dt * 4);
    });
    interact(deck, { id: 'music', label: 'record player', hint: 'play some music' });
    // Records leaning against the cabinet
    ['#d94660', '#4ab0c8', '#ffd25e'].forEach((col, i) => {
        const r = add(cab, box(0.31, 0.31, 0.012), toon(col), 0.22 + i * 0.04, 0.72, -0.12 + i * 0.03);
        r.rotation.set(-0.12, 0, -0.05 + i * 0.04);
    });

    // Beanbag in the open corner
    const bag = register(group(root, 'beanbag', 1.55, 0, 0.75), 'beanbag');
    const bagGeo = new THREE.SphereGeometry(0.42, 20, 14);
    const bp = bagGeo.attributes.position;
    for (let i = 0; i < bp.count; i++) {
        const y = bp.getY(i);
        bp.setY(i, y < 0 ? y * 0.35 : y * 0.62);
        if (y > 0.1 && bp.getZ(i) < 0) bp.setY(i, bp.getY(i) + 0.12 * (y / 0.42));
    }
    bagGeo.computeVertexNormals();
    const bean = add(bag, bagGeo, toon('#86d3c8'), 0, 0.16, 0);
    bean.rotation.y = 2.6;
    const squish = { t: 0 };
    world.beanbag = { poke() { squish.t = 1; } };
    world.updaters.push(dt => {
        squish.t = Math.max(0, squish.t - dt * 1.4);
        const k = Math.sin(squish.t * Math.PI * 3) * squish.t * 0.18;
        bean.scale.set(1 + k * 0.6, 1 - k, 1 + k * 0.6);
    });
    interact(bag, { id: 'beanbag', label: 'beanbag', hint: 'flop onto it' });
    const manga = group(bag, 'manga', 0.42, 0, 0.18);
    ['#ffffff', '#d94660', '#4ab0c8', '#ffffff'].forEach((col, i) => {
        const m = add(manga, box(0.13, 0.025, 0.19), [toon('#fff6e6'), toon(col), toon(col), toon(col), toon('#fff6e6'), toon(col)], 0, 0.0125 + i * 0.025, 0);
        m.rotation.y = (i % 2 ? 0.2 : -0.1) + i * 0.05;
    });

    // Wardrobe on the right wall. It opens (there's someone inside), and there's
    // something shiny on top if you look up.
    const wardrobe = register(group(root, 'wardrobe', 2.5, 0, -0.75), 'wardrobe');
    const wood = toon('#f3e6d6');
    const inside = toon('#d8c4ae');
    add(wardrobe, box(0.02, 2.02, 1.04), inside, 0.26, 1.03, 0);
    add(wardrobe, box(0.54, 0.03, 1.04), wood, 0, 2.025, 0);
    add(wardrobe, box(0.54, 0.08, 1.04), wood, 0, 0.06, 0);
    add(wardrobe, box(0.54, 2.02, 0.03), wood, 0, 1.03, -0.505);
    add(wardrobe, box(0.54, 2.02, 0.03), wood, 0, 1.03, 0.505);
    add(wardrobe, box(0.5, 0.025, 0.98), inside, 0.01, 1.92, 0);
    add(wardrobe, new THREE.CylinderGeometry(0.012, 0.012, 0.96, 8).rotateX(Math.PI / 2), toon('#c9c4d6'), 0.04, 1.78, 0);
    [['#d94660', -0.28], ['#3553e8', 0.02], ['#86d3c8', 0.3]].forEach(([col, z]) => {
        const hoodie = group(wardrobe, 'hoodie', 0.04, 1.78, z);
        add(hoodie, new THREE.TorusGeometry(0.03, 0.005, 4, 10, Math.PI).rotateY(Math.PI / 2), toon('#c9c4d6'), 0, 0.01, 0);
        add(hoodie, rbox(0.09, 0.5, 0.3, 0.03), toon(col), 0, -0.3, 0);
        add(hoodie, rbox(0.08, 0.12, 0.14, 0.04), toon(col), 0.02, -0.04, 0);
        hoodie.rotation.x = z * 0.15;
    });
    // The ghost (a nod to Steal a Ghost)
    const ghost = group(wardrobe, 'ghost', 0.0, 0.7, -0.1);
    add(ghost, new THREE.CapsuleGeometry(0.11, 0.14, 6, 14), toon('#fbfaff'), 0, 0, 0);
    [[0.07, -0.045], [0.07, 0.045]].forEach(([y, z]) => add(ghost, new THREE.SphereGeometry(0.018, 8, 6), toon(C.ink), -0.1, y, z));
    [-0.075, 0.075].forEach(z => add(ghost, new THREE.SphereGeometry(0.016, 8, 6), toon('#ffb3c7'), -0.098, 0.03, z));
    ghost.scale.setScalar(0.001);
    // Doors on hinges at the outer edges.
    const doorMat = toon('#e8d7c2');
    const knob = toon(C.plum);
    const leftDoor = group(wardrobe, 'doorL', -0.28, 1.04, -0.52);
    add(leftDoor, box(0.02, 1.92, 0.515), doorMat, 0, 0, 0.2575);
    add(leftDoor, box(0.025, 0.22, 0.025), knob, -0.02, 0.06, 0.47);
    const rightDoor = group(wardrobe, 'doorR', -0.28, 1.04, 0.52);
    add(rightDoor, box(0.02, 1.92, 0.515), doorMat, 0, 0, -0.2575);
    add(rightDoor, box(0.025, 0.22, 0.025), knob, -0.02, 0.06, -0.47);
    // Boxes on top, plus the trophy.
    add(wardrobe, box(0.36, 0.22, 0.4), toon('#c9a27a'), 0.02, 2.15, 0.25);
    add(wardrobe, box(0.3, 0.16, 0.3), toon('#b9b0e6'), 0.02, 2.12, -0.32).rotation.y = 0.15;
    const trophy = register(group(wardrobe, 'trophy', -0.1, 2.04, -0.05), 'trophy');
    const gold = toon('#ffd84d');
    add(trophy, box(0.09, 0.03, 0.09), toon('#8a6a2a'), 0, 0.015, 0);
    add(trophy, new THREE.CylinderGeometry(0.012, 0.02, 0.05, 8), gold, 0, 0.055, 0);
    const cup = [[0, 0], [0.025, 0], [0.05, 0.03], [0.055, 0.08], [0.05, 0.08]].map(([x, y]) => new THREE.Vector2(x, y));
    add(trophy, new THREE.LatheGeometry(cup, 14), toon('#ffd84d', { side: THREE.DoubleSide }), 0, 0.08, 0);
    [-1, 1].forEach(sz => add(trophy, new THREE.TorusGeometry(0.022, 0.006, 6, 10, Math.PI), gold, 0, 0.13, sz * 0.055).rotation.set(0, 0, -Math.PI / 2));
    const sparkle = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.glowTexture(), color: '#fff3b0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sparkle.position.set(0, 0.14, 0);
    trophy.add(noInk(sparkle));

    const wstate = { open: false, k: 0, trophy: 0 };
    world.wardrobe = {
        toggle() { wstate.open = !wstate.open; return wstate.open; },
        trophy() { wstate.trophy = 1; world.burst(trophy.localToWorld(V(0, 0.15, 0)), 'confetti', 60); }
    };
    world.updaters.push((dt, t) => {
        wstate.k += ((wstate.open ? 1 : 0) - wstate.k) * Math.min(1, dt * 5);
        leftDoor.rotation.y = -1.75 * wstate.k;
        rightDoor.rotation.y = 1.75 * wstate.k;
        // The ghost pops out a moment after the doors open.
        const g = Math.max(0, (wstate.k - 0.5) * 2);
        ghost.scale.setScalar(Math.max(0.001, g));
        ghost.position.set(-0.05 - g * 0.35, 0.7 + g * 0.25 + Math.sin(t * 3) * 0.03 * g, -0.1);
        ghost.rotation.z = Math.sin(t * 2) * 0.1 * g;
        sparkle.scale.setScalar(0.08 + Math.max(0, Math.sin(t * 2.2)) * 0.12);
        wstate.trophy = Math.max(0, wstate.trophy - dt);
        trophy.rotation.y = wstate.trophy * Math.PI * 4;
        trophy.position.y = 2.04 + Math.sin(wstate.trophy * Math.PI) * 0.12;
    });
    interact(wardrobe, { id: 'wardrobe', label: 'wardrobe', hint: 'open it' });
    interact(trophy, { id: 'trophy', label: '???', hint: 'shiny' });

    // Pennant and a poster on the right wall
    const pennant = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.28), toon('#ffffff', { map: tex.pennantTexture(), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
    pennant.position.set(2.765, 1.85, 0.95);
    pennant.rotation.set(0, -Math.PI / 2, -0.06);
    root.add(pennant);
    register(pennant, 'pennant');
    const rightPoster = group(root, 'poster-engine', 2.77, 1.62, 1.9);
    rightPoster.rotation.y = -Math.PI / 2;
    add(rightPoster, box(0.44, 0.62, 0.012), [toon('#ffffff'), toon('#ffffff'), toon('#ffffff'), toon('#ffffff'), toon('#ffffff', { map: tex.posterTexture('engine') }), toon('#ffffff')], 0, 0, 0, { cast: false });
    register(rightPoster, 'poster-engine');

    // TV on a low console against the front wall
    const media = register(group(root, 'console', -0.75, 0, 2.11), 'console');
    media.rotation.y = Math.PI;
    add(media, box(1.4, 0.42, 0.42), toon(C.white), 0, 0.23, 0);
    add(media, box(1.4, 0.03, 0.42), toon(C.wood), 0, 0.455, 0);
    [-0.47, 0, 0.47].forEach((x, i) => add(media, box(0.44, 0.32, 0.02), toon(['#ffd3b0', '#b9b0e6', '#ffd3b0'][i]), x, 0.23, 0.215));
    [-0.65, 0.65].forEach(x => add(media, new THREE.CylinderGeometry(0.02, 0.015, 0.03, 6), toon(C.plum), x, 0.015, 0.15));
    const tv = group(media, 'tv', 0, 0.47, -0.05);
    add(tv, box(0.3, 0.02, 0.18), toon('#2d2a40'), 0, 0.01, 0);
    add(tv, box(0.05, 0.1, 0.03), toon('#2d2a40'), 0, 0.07, -0.02);
    add(tv, box(1.02, 0.6, 0.05), toon('#2d2a40'), 0, 0.42, -0.02);
    const tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.54), new THREE.MeshBasicMaterial({ map: tex.tvTexture() }));
    tvScreen.position.set(0, 0.42, 0.0055);
    tv.add(noInk(tvScreen));
    world.tvScreen = tvScreen;
    // Console + controller
    add(media, box(0.3, 0.06, 0.22), toon('#f8f1e8'), 0.5, 0.5, -0.02);
    add(media, box(0.3, 0.008, 0.005), toon('#86d3c8'), 0.5, 0.5, 0.0905);
    const pad = group(media, 'gamepad', -0.48, 0.47, 0.06);
    pad.rotation.y = 0.4;
    add(pad, rbox(0.15, 0.03, 0.08, 0.012), toon('#3a3150'), 0, 0.015, 0);
    [-0.05, 0.05].forEach(x => add(pad, new THREE.CylinderGeometry(0.012, 0.012, 0.012, 8), toon('#86d3c8'), x, 0.035, 0.0));
    interact(media, { id: 'arcade', label: 'game console', hint: 'play something' });

    // Calendar by the door
    const cal = group(root, 'calendar', 0.45, 1.5, 2.322);
    cal.rotation.y = Math.PI;
    add(cal, box(0.32, 0.4, 0.008), [toon('#ffffff'), toon('#ffffff'), toon('#ffffff'), toon('#ffffff'), toon('#ffffff', { map: tex.calendarTexture() }), toon('#ffffff')], 0, 0, 0, { cast: false });
    add(cal, new THREE.SphereGeometry(0.012, 8, 6), toon(C.plum), 0, 0.22, 0.01);
    register(cal, 'calendar');
    interact(cal, { id: 'calendar', label: 'calendar', hint: "what's today?" });

    // Fairy lights along the top of both walls (click to change colours)
    const fairy = register(group(root, 'fairylights'), 'fairylights');
    const wire = toon('#3a3150');
    const bulbs = [];
    const string = (from, to, count, sag) => {
        const pts = [];
        for (let i = 0; i <= count; i++) {
            const t = i / count;
            const p = from.clone().lerp(to, t);
            p.y -= Math.sin(t * Math.PI * 3) ** 2 * sag;
            pts.push(p);
        }
        const curve = new THREE.CatmullRomCurve3(pts);
        add(fairy, new THREE.TubeGeometry(curve, count * 4, 0.004, 4), wire, 0, 0, 0, { cast: false });
        pts.forEach((p, i) => {
            if (i === 0 || i === count) return;
            const col = ['#ffd68a', '#ffb3c7', '#9fe0ff'][i % 3];
            const m = add(fairy, new THREE.SphereGeometry(0.024, 8, 6), new THREE.MeshBasicMaterial({ color: col }), p.x, p.y - 0.02, p.z, { cast: false });
            const g = glowSprite(col, 0.22, fairy, p.x, p.y - 0.02, p.z + 0.02, 0.7);
            bulbs.push({ m, g, phase: i * 1.7 });
        });
    };
    string(V(-2.65, 2.62, -2.27), V(2.6, 2.62, -2.27), 24, 0.12);
    string(V(-2.7, 2.62, -2.2), V(-2.7, 2.62, 2.2), 18, 0.12);
    world.fairy = bulbs;
    const palettes = [['#ffd68a', '#ffb3c7', '#9fe0ff'], ['#ff5d8f', '#ffd84d', '#5df2c4', '#7d8bff'], ['#ffffff', '#dfe8ff'], ['#c9a2ff', '#8ea0ff']];
    let palette = 0;
    const paint = (cols) => bulbs.forEach((b, i) => {
        const c = cols[i % cols.length];
        b.m.material.color.set(c);
        b.g.material.color.set(c);
    });
    world.lightsColour = {
        next() { palette = (palette + 1) % palettes.length; paint(palettes[palette]); },
        // Disco: every bulb cycles through the rainbow.
        disco(t) { bulbs.forEach((b, i) => { b.m.material.color.setHSL((t * 0.5 + i * 0.07) % 1, 0.9, 0.65); b.g.material.color.copy(b.m.material.color); }); },
        reset() { paint(palettes[palette]); }
    };
    interact(fairy, { id: 'fairy', label: 'fairy lights', hint: 'change colour' });
    world.updaters.push((dt, t) => {
        bulbs.forEach(b => {
            const k = 0.55 + 0.45 * Math.sin(t * 2 + b.phase);
            b.g.material.opacity = 0.35 + k * 0.5 * (world.fairyBoost || 1);
        });
    });
}

// ---------------------------------------------------------------- lights

function buildLights(scene, world) {
    const hemi = new THREE.HemisphereLight('#b9a8ff', '#e9b3c4', 1.9);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight('#ffb36b', 2.6);
    // From behind-left, so the two walls box it in and light only gets in
    // through the window.
    sun.position.set(-0.9, 3.9, -6.2);
    sun.target.position.set(0.5, 0.3, -0.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -6; sc.right = 6; sc.top = 6; sc.bottom = -6; sc.near = 0.5; sc.far = 20;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.015;
    scene.add(sun, sun.target);

    // Soft fill from the open side of the room so nothing goes muddy.
    const fill = new THREE.DirectionalLight('#ffe6f0', 0.8);
    fill.position.set(4, 3, 5);
    scene.add(fill);

    const lampHead = world.lamp.bulb.getWorldPosition(new THREE.Vector3());
    const lamp = new THREE.PointLight('#ffcf85', 0.5, 3.2, 2);
    lamp.position.copy(lampHead).add(V(0, -0.04, 0));
    scene.add(lamp);

    const monitor = new THREE.PointLight('#8fb4ff', 0.15, 1.6, 2);
    monitor.position.set(0.2, 1.05, -1.6);
    scene.add(monitor);

    const ceiling = new THREE.PointLight('#fff1dc', 0, 7, 1.4);
    ceiling.position.set(0, 2.7, 0);
    scene.add(ceiling);

    const fairy = new THREE.PointLight('#ffc89a', 0.0, 4, 1.5);
    fairy.position.set(-1.2, 2.3, -1.2);
    scene.add(fairy);

    world.lights = { hemi, sun, fill, lamp, monitor, fairy, ceiling };
}

function buildDust(root, world, glow) {
    // Only in the shaft of light from the window.
    const count = 60;
    const pos = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        pos[i * 3] = -0.3 + Math.random() * 1.2;
        pos[i * 3 + 1] = 0.8 + Math.random() * 1.4;
        pos[i * 3 + 2] = -2.1 + Math.random() * 1.0;
        seeds[i] = Math.random() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ map: glow, color: '#ffe2b0', size: 0.012, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
    const dust = new THREE.Points(geo, mat);
    root.add(noInk(dust));
    world.dust = dust;
    world.updaters.push((dt, t) => {
        const p = geo.attributes.position;
        for (let i = 0; i < count; i++) {
            let y = p.getY(i) + dt * 0.03;
            if (y > 2.2) y = 0.8;
            p.setY(i, y);
            p.setX(i, p.getX(i) + Math.sin(t * 0.3 + seeds[i]) * dt * 0.02);
        }
        p.needsUpdate = true;
    });
}
