import * as THREE from 'three';

// Objects on this layer are drawn normally but skipped by the outline pass
// (glows, particles, decals, the sky).
export const NO_INK = 1;

let ramp;
function toonRamp() {
    if (ramp) return ramp;
    // Indexed by dot(N, L) remapped to 0..1: away / grazing / lit.
    ramp = new THREE.DataTexture(new Uint8Array([70, 150, 255, 255]), 4, 1, THREE.RedFormat);
    ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
    ramp.generateMipmaps = false;
    ramp.needsUpdate = true;
    return ramp;
}

const shared = new Map();

// Shared cel-shaded material per colour. Pass `unique` when the material
// will be mutated (hover glow, colour changes).
export function toon(color, { unique = false, ...opts } = {}) {
    const key = typeof color === 'number' ? color : String(color);
    if (!unique && !Object.keys(opts).length && shared.has(key)) return shared.get(key);
    const mat = new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(), ...opts });
    if (!unique && !Object.keys(opts).length) shared.set(key, mat);
    return mat;
}

export function toonize(material) {
    const src = Array.isArray(material) ? material[0] : material;
    return new THREE.MeshToonMaterial({
        color: src.color ? src.color.clone() : new THREE.Color(0xffffff),
        map: src.map || null,
        emissive: src.emissive ? src.emissive.clone() : new THREE.Color(0),
        emissiveMap: src.emissiveMap || null,
        transparent: src.transparent,
        opacity: src.opacity,
        alphaTest: src.alphaTest,
        side: src.side,
        gradientMap: toonRamp()
    });
}

export function noInk(object) {
    object.traverse(o => o.layers.set(NO_INK));
    return object;
}

const vertex = /* glsl */`
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const fragment = /* glsl */`
#include <packing>
uniform sampler2D tColor;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform vec2 texel;
uniform float cameraNear;
uniform float cameraFar;
uniform vec3 ink;
varying vec2 vUv;

float invDepth(vec2 uv) {
    float z = texture2D(tDepth, uv).x;
    return -1.0 / perspectiveDepthToViewZ(z, cameraNear, cameraFar);
}
vec3 nrm(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }

void main() {
    vec4 color = texture2D(tColor, vUv);

    vec2 dx = vec2(texel.x, 0.0);
    vec2 dy = vec2(0.0, texel.y);

    // 1/z is linear across a plane in screen space, so its Laplacian is ~0
    // on flat surfaces and spikes at silhouettes and creases.
    float w0 = invDepth(vUv);
    float lap = abs(invDepth(vUv + dx) + invDepth(vUv - dx) + invDepth(vUv + dy) + invDepth(vUv - dy) - 4.0 * w0);
    lap /= max(w0, 1e-4);

    vec3 n0 = nrm(vUv);
    float nd = 0.0;
    nd += 1.0 - dot(n0, nrm(vUv + dx));
    nd += 1.0 - dot(n0, nrm(vUv - dx));
    nd += 1.0 - dot(n0, nrm(vUv + dy));
    nd += 1.0 - dot(n0, nrm(vUv - dy));

    float edge = max(smoothstep(0.015, 0.05, lap), smoothstep(0.55, 1.1, nd)) * 0.92;

    // Premultiplied "ink over colour" so lines also land on the transparent
    // background around the diorama.
    gl_FragColor = vec4(color.rgb * (1.0 - edge) + ink * edge, color.a * (1.0 - edge) + edge);
    #include <colorspace_fragment>
}`;

// Renders the scene, a normals+depth pass for edge detection, then composites
// ink lines over the colour image.
export class InkRenderer {
    constructor(renderer, scene, camera) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;

        this.colorTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4, stencilBuffer: true });
        this.normalTarget = new THREE.WebGLRenderTarget(1, 1, { depthTexture: new THREE.DepthTexture(1, 1) });
        this.normalMaterial = new THREE.MeshNormalMaterial();

        this.material = new THREE.ShaderMaterial({
            vertexShader: vertex,
            fragmentShader: fragment,
            uniforms: {
                tColor: { value: this.colorTarget.texture },
                tNormal: { value: this.normalTarget.texture },
                tDepth: { value: this.normalTarget.depthTexture },
                texel: { value: new THREE.Vector2() },
                cameraNear: { value: camera.near },
                cameraFar: { value: camera.far },
                ink: { value: new THREE.Color('#2a1d3d') }
            },
            depthTest: false,
            depthWrite: false
        });

        const tri = new THREE.BufferGeometry();
        tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
        tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
        this.quad = new THREE.Mesh(tri, this.material);
        this.quad.frustumCulled = false;
        this.quadScene = new THREE.Scene();
        this.quadScene.add(this.quad);
        this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        // Shadows only need rendering once per frame, for the colour pass.
        renderer.shadowMap.autoUpdate = false;

        this.clear = new THREE.Color(0.5, 0.5, 1);
        this.savedClear = new THREE.Color();
    }

    setSize(width, height, pixelRatio) {
        const w = Math.max(1, Math.floor(width * pixelRatio));
        const h = Math.max(1, Math.floor(height * pixelRatio));
        this.colorTarget.setSize(w, h);
        this.normalTarget.setSize(w, h);
        // Line weight follows the pixel ratio so it reads the same on any screen.
        const t = Math.max(1, pixelRatio * 0.85);
        this.material.uniforms.texel.value.set(t / w, t / h);
    }

    render() {
        const { renderer, scene, camera } = this;

        const background = scene.background;
        const savedAlpha = renderer.getClearAlpha();
        renderer.getClearColor(this.savedClear);

        camera.layers.disable(NO_INK);
        scene.overrideMaterial = this.normalMaterial;
        scene.background = null;
        renderer.setClearColor(this.clear, 1);
        renderer.setRenderTarget(this.normalTarget);
        renderer.clear();
        renderer.render(scene, camera);

        camera.layers.enable(NO_INK);
        scene.overrideMaterial = null;
        scene.background = background;
        renderer.setClearColor(this.savedClear, savedAlpha);
        renderer.setRenderTarget(this.colorTarget);
        renderer.shadowMap.needsUpdate = true;
        renderer.clear();
        renderer.render(scene, camera);

        this.material.uniforms.cameraNear.value = camera.near;
        this.material.uniforms.cameraFar.value = camera.far;
        renderer.setRenderTarget(null);
        renderer.render(this.quadScene, this.quadCamera);
    }

    dispose() {
        this.colorTarget.dispose();
        this.normalTarget.dispose();
        this.normalMaterial.dispose();
        this.material.dispose();
        this.quad.geometry.dispose();
    }
}
