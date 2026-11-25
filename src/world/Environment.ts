import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { CONFIG, COLORS } from '../game/config';

/**
 * Warm Ankara late-morning daylight: physically based sky, strong directional sun with
 * soft shadows that follow the player, hemisphere fill, atmospheric fog and a PMREM
 * environment map for reflective glass / car paint.
 */
export class Environment {
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly sunDir = new THREE.Vector3();
  private sky: Sky;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    scene.fog = new THREE.Fog(COLORS.fog, 90, 420);

    this.sky = new Sky();
    this.sky.scale.setScalar(4500);
    const u = this.sky.material.uniforms;
    u['turbidity'].value = 5.5;
    u['rayleigh'].value = 1.35;
    u['mieCoefficient'].value = 0.004;
    u['mieDirectionalG'].value = 0.82;

    const elevation = THREE.MathUtils.degToRad(40);
    const azimuth = THREE.MathUtils.degToRad(155);
    this.sunDir.setFromSphericalCoords(1, Math.PI / 2 - elevation, azimuth);
    u['sunPosition'].value.copy(this.sunDir);
    scene.add(this.sky);

    this.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x8a7a62, 0.85);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff1dc, 3.1);
    this.sun.castShadow = true;
    const s = this.sun.shadow;
    s.mapSize.set(CONFIG.graphics.shadowMapSize, CONFIG.graphics.shadowMapSize);
    const e = CONFIG.graphics.shadowExtent;
    s.camera.left = -e; s.camera.right = e; s.camera.top = e; s.camera.bottom = -e;
    s.camera.near = 1; s.camera.far = 320;
    s.bias = -0.0004;
    s.normalBias = 0.035;
    s.radius = 2.5;
    // Layer 1 holds the first-person body: hidden from the main camera, still casts shadows.
    s.camera.layers.enable(1);
    scene.add(this.sun, this.sun.target);

    // Reflection environment from the sky itself.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const skyCopy = new Sky();
    skyCopy.scale.setScalar(1000);
    const u2 = skyCopy.material.uniforms;
    for (const k of Object.keys(u)) {
      const v = u[k].value;
      u2[k].value = v && typeof v === 'object' && 'clone' in v ? (v as THREE.Vector3).clone() : v;
    }
    envScene.add(skyCopy);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(900, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x6b6458 }));
    ground.position.y = -5;
    envScene.add(ground);
    const env = pmrem.fromScene(envScene, 0.02).texture;
    scene.environment = env;
    (scene as THREE.Scene & { environmentIntensity?: number }).environmentIntensity = 0.55;
    pmrem.dispose();
  }

  /** Keep the shadow frustum centred on the player, snapped to texels to avoid shimmering. */
  update(focus: THREE.Vector3): void {
    const texel = (CONFIG.graphics.shadowExtent * 2) / CONFIG.graphics.shadowMapSize;
    const fx = Math.round(focus.x / texel) * texel;
    const fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx + this.sunDir.x * 150, this.sunDir.y * 150, fz + this.sunDir.z * 150);
    this.sky.position.set(focus.x, 0, focus.z);
  }
}
