import * as THREE from 'three';
import { toonize } from './toon.js';

// Loads models listed in assets/models/manifest.json (Blender → glTF Binary).
// See the README for the format. Returns the objects that were added.
export async function loadCustomModels(world, scene) {
    const base = new URL('../assets/models/', import.meta.url);
    let manifest;
    try {
        const res = await fetch(new URL('manifest.json', base), { cache: 'no-cache' });
        if (!res.ok) return [];
        manifest = await res.json();
    } catch {
        return [];
    }
    const entries = (manifest.models || []).filter(m => m && m.file);
    if (!entries.length) return [];

    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();
    const room = scene.getObjectByName('room') || scene;
    const added = [];

    await Promise.all(entries.map(async entry => {
        let gltf;
        try {
            gltf = await loader.loadAsync(new URL(entry.file, base).href);
        } catch (err) {
            console.warn(`[room] couldn't load ${entry.file}`, err);
            return;
        }
        const model = gltf.scene;
        model.name = entry.name || entry.file;
        model.traverse(o => {
            if (!o.isMesh) return;
            if (entry.toon !== false) o.material = toonize(o.material);
            o.castShadow = entry.shadows !== false;
            o.receiveShadow = true;
        });

        const old = entry.replace ? world.named.get(entry.replace) : null;
        if (entry.replace && !old) console.warn(`[room] nothing called "${entry.replace}" to replace`);
        const parent = old?.parent || room;
        if (old) {
            model.position.copy(old.position);
            model.rotation.copy(old.rotation);
            hideOwnParts(old, world);
            const info = old.userData.interactive;
            if (info) {
                model.userData.interactive = info;
                const i = world.interactive.indexOf(old);
                if (i >= 0) world.interactive[i] = model;
                delete old.userData.interactive;
            }
        }
        if (entry.position) model.position.fromArray(entry.position);
        if (entry.rotation) model.rotation.set(...entry.rotation.map(THREE.MathUtils.degToRad));
        if (entry.scale !== undefined) {
            if (Array.isArray(entry.scale)) model.scale.fromArray(entry.scale);
            else model.scale.setScalar(entry.scale);
        }
        parent.add(model);
        if (entry.name) world.named.set(entry.name, model);
        added.push(model);
    }));
    return added;
}

// Hide what belongs to `old` itself but keep anything that is its own
// named object (e.g. replacing the desk keeps the monitor sitting on it).
function hideOwnParts(old, world) {
    if (old.isMesh) { old.visible = false; return; }
    const keep = new Set(world.named.values());
    old.children.forEach(child => {
        if (!keep.has(child)) child.visible = false;
    });
}
