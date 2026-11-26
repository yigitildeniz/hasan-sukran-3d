import * as THREE from 'three';

export interface CharacterLook {
  skin: string;
  hair: string;
  hairStyle: 'short' | 'balding' | 'long' | 'cap';
  top: string;
  topStyle: 'suit' | 'hoodie' | 'sweater' | 'jacket' | 'apron';
  shirt?: string;
  bottom: string;
  shoes: string;
  tie?: string;
  glasses?: boolean;
  mustache?: string;
  backpack?: string;
  capColor?: string;
  accent?: string;
  scale?: number;
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, rough = 0.75, metal = 0): THREE.MeshStandardMaterial {
  const k = `${color}-${rough}-${metal}`;
  let m = matCache.get(k);
  if (!m) matCache.set(k, (m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal })));
  return m;
}

/**
 * Procedural low-poly humanoid with simple procedural animation (walk/run/sit/wave/crouch).
 * Root origin is at the feet, facing -Z. Swap for a skinned .glb later via AssetLoader.
 */
export class CharacterModel {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group(); // procedural geometry lives here (swappable)
  private hips = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private lLeg = new THREE.Group();
  private rLeg = new THREE.Group();
  private lArm = new THREE.Group();
  private rArm = new THREE.Group();
  private phase = Math.random() * 10;
  private bob = 0;

  constructor(look: CharacterLook) {
    const s = look.scale ?? 1;
    this.root.add(this.body);
    this.body.scale.setScalar(s);
    this.body.add(this.hips);
    this.hips.position.y = 0.92;
    this.hips.add(this.torso, this.lLeg, this.rLeg);

    const skin = mat(look.skin, 0.6);
    const top = mat(look.top, look.topStyle === 'suit' ? 0.55 : 0.85);
    const bottom = mat(look.bottom, 0.8);
    const shoes = mat(look.shoes, 0.5);

    // pelvis
    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.21), bottom);
    pelvis.position.y = 0.02;
    this.hips.add(pelvis);

    // legs
    for (const [leg, x] of [[this.lLeg, -0.1], [this.rLeg, 0.1]] as const) {
      leg.position.set(x, 0, 0);
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(look.topStyle === 'hoodie' ? 0.085 : 0.075, 0.68, 4, 8), bottom);
      thigh.position.y = -0.43;
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.1, 0.28), shoes);
      shoe.position.set(0, -0.87, -0.05);
      leg.add(thigh, shoe);
      if (look.accent) {
        const sole = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.035, 0.285), mat(look.accent, 0.5));
        sole.position.set(0, -0.915, -0.05);
        leg.add(sole);
      }
    }

    // torso
    const bulk = look.topStyle === 'hoodie' ? 1.12 : 1;
    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.19 * bulk, 0.3, 4, 10), top);
    chest.scale.set(1.08, 1, 0.62);
    chest.position.y = 0.36;
    this.torso.add(chest);
    if (look.topStyle === 'suit' || look.topStyle === 'jacket') {
      const shirt = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.3), mat(look.shirt ?? '#ffffff', 0.7));
      shirt.position.set(0, 0.5, -0.125);
      shirt.rotation.y = Math.PI;
      this.torso.add(shirt);
    }
    if (look.topStyle === 'sweater' && look.shirt) {
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 6, 12), mat(look.shirt));
      collar.rotation.x = Math.PI / 2;
      collar.position.y = 0.6;
      this.torso.add(collar);
    }
    if (look.topStyle === 'apron') {
      const apron = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.6), mat('#f4f4f0'));
      apron.position.set(0, 0.2, -0.13);
      apron.rotation.y = Math.PI;
      this.torso.add(apron);
    }
    if (look.tie) {
      const tie = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.26, 0.02), mat(look.tie, 0.5));
      tie.position.set(0, 0.46, -0.128);
      this.torso.add(tie);
    }
    if (look.topStyle === 'hoodie') {
      const hood = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.05, 6, 12), top);
      hood.rotation.x = Math.PI / 2 - 0.3;
      hood.position.set(0, 0.6, 0.04);
      this.torso.add(hood);
      if (look.accent) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.27), mat(look.accent, 0.6));
        stripe.position.y = 0.3;
        this.torso.add(stripe);
      }
    }
    if (look.backpack) {
      const bp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.38, 0.14), mat(look.backpack, 0.7));
      bp.position.set(0, 0.36, 0.17);
      this.torso.add(bp);
    }

    // arms
    for (const [arm, x] of [[this.lArm, -0.25], [this.rArm, 0.25]] as const) {
      arm.position.set(x * bulk, 0.56, 0);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.058 * bulk, 0.5, 4, 8), top);
      upper.position.y = -0.3;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), skin);
      hand.position.y = -0.62;
      arm.add(upper, hand);
      this.torso.add(arm);
    }

    // head
    this.head.position.y = 0.66;
    this.torso.add(this.head);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8), skin);
    neck.position.y = 0.02;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 12), skin);
    skull.scale.set(0.95, 1.1, 1);
    skull.position.y = 0.17;
    this.head.add(neck, skull);
    const eyeMat = mat('#1a1a1a', 0.3);
    for (const x of [-0.042, 0.042]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 4), eyeMat);
      eye.position.set(x, 0.19, -0.112);
      this.head.add(eye);
    }
    const hairMat = mat(look.hair, 0.9);
    if (look.hairStyle === 'balding') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.035, 6, 14, Math.PI * 1.4), hairMat);
      ring.rotation.set(Math.PI / 2, 0, -Math.PI * 0.2 + Math.PI);
      ring.position.set(0, 0.2, 0.01);
      this.head.add(ring);
    } else {
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.127, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
      hair.scale.set(0.97, 1.12, 1.03);
      hair.position.set(0, 0.18, 0.01);
      hair.rotation.x = -0.25;
      this.head.add(hair);
      if (look.hairStyle === 'long') {
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, 0.08), hairMat);
        back.position.set(0, 0.06, 0.09);
        this.head.add(back);
      }
    }
    if (look.hairStyle === 'cap') {
      const capMat = mat(look.capColor ?? '#111111', 0.6);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.132, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), capMat);
      cap.position.y = 0.2;
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.015, 0.12), capMat);
      brim.position.set(0, 0.2, 0.16); // worn backwards
      this.head.add(cap, brim);
    }
    if (look.mustache) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.02), mat(look.mustache, 0.9));
      m.position.set(0, 0.115, -0.118);
      this.head.add(m);
    }
    if (look.glasses) {
      const gm = mat('#151515', 0.3, 0.6);
      for (const x of [-0.045, 0.045]) {
        const lens = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 4, 12), gm);
        lens.position.set(x, 0.19, -0.122);
        this.head.add(lens);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.006), gm);
      bridge.position.set(0, 0.195, -0.122);
      this.head.add(bridge);
    }

    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
    });
  }

  /** Put every mesh on a single render layer (layer 1 = first-person body: shadows/mirror only). */
  setLayer(layer: number): void {
    this.root.traverse((o) => o.layers.set(layer));
  }

  update(dt: number, speed: number, state: { crouch?: boolean; sit?: boolean; wave?: boolean; airborne?: boolean } = {}): void {
    const run = Math.min(1, speed / 5.5);
    const amp = Math.min(1, speed / 2.5) * (0.55 + run * 0.35);
    this.phase += dt * (2.2 + speed * 1.6);
    const sw = Math.sin(this.phase) * amp;
    const k = 1 - Math.exp(-dt * 12);
    const lerp = (g: THREE.Object3D, ax: 'x' | 'z', v: number) => (g.rotation[ax] += (v - g.rotation[ax]) * k);

    if (state.sit) {
      lerp(this.lLeg, 'x', Math.PI / 2); lerp(this.rLeg, 'x', Math.PI / 2);
      lerp(this.lArm, 'x', 0.6); lerp(this.rArm, 'x', 0.6);
      this.hips.position.y += (0.5 - this.hips.position.y) * k;
      lerp(this.torso, 'x', 0);
      return;
    }
    if (state.airborne) {
      lerp(this.lLeg, 'x', 0.5); lerp(this.rLeg, 'x', -0.2);
      lerp(this.lArm, 'x', -0.8); lerp(this.rArm, 'x', 0.6);
    } else {
      lerp(this.lLeg, 'x', sw + (state.crouch ? 0.9 : 0));
      lerp(this.rLeg, 'x', -sw + (state.crouch ? 0.9 : 0));
      lerp(this.lArm, 'x', -sw * 0.9);
      lerp(this.rArm, 'x', state.wave ? Math.PI * 0.9 : sw * 0.9);
    }
    this.rArm.rotation.z = state.wave ? Math.sin(this.phase * 2.5) * 0.4 : 0;
    this.lArm.rotation.z = -0.06;
    lerp(this.torso, 'x', state.crouch ? 0.35 : -run * 0.18);
    this.bob = Math.abs(Math.cos(this.phase)) * 0.04 * amp;
    const hipY = (state.crouch ? 0.62 : 0.92) + this.bob;
    this.hips.position.y += (hipY - this.hips.position.y) * k;
  }
}

/** Character presets. */
export const LOOKS = {
  student: {
    skin: '#e0b18e', hair: '#2a1b12', hairStyle: 'cap', capColor: '#111214',
    top: '#2b2f45', topStyle: 'hoodie', accent: '#ff5a36', bottom: '#7a7458', shoes: '#f2f2f2',
    backpack: '#e2711d', scale: 0.84,
  },
  principal: {
    skin: '#d9a77f', hair: '#9a9a9a', hairStyle: 'short', top: '#1f2a44', topStyle: 'suit',
    shirt: '#ffffff', tie: '#a3162b', bottom: '#1c2438', shoes: '#18120e', glasses: true, mustache: '#8d8d8d', scale: 1.0,
  },
  bulent: {
    skin: '#d6a17a', hair: '#2b2420', hairStyle: 'balding', top: '#6b4e37', topStyle: 'jacket',
    shirt: '#a9c6e8', tie: '#22345e', bottom: '#3a3a3e', shoes: '#2a1d14', mustache: '#2b2420', scale: 0.98,
  },
  ragip: {
    skin: '#cf9c76', hair: '#151515', hairStyle: 'short', top: '#2f4f3a', topStyle: 'sweater',
    shirt: '#e8e2d4', bottom: '#4a4337', shoes: '#1b1b1b', glasses: true, mustache: '#151515', scale: 1.04,
  },
  sefa: {
    skin: '#e6b998', hair: '#3b2414', hairStyle: 'short', top: '#c62f2f', topStyle: 'hoodie',
    accent: '#ffffff', bottom: '#2e4a7a', shoes: '#ffffff', backpack: '#2f6fd6', scale: 0.82,
  },
  betul: {
    skin: '#e9c0a0', hair: '#5a3220', hairStyle: 'long', top: '#6a4c9c', topStyle: 'jacket',
    shirt: '#ffffff', bottom: '#2b2b3a', shoes: '#f0f0f0', scale: 0.8,
  },
  mihrican: {
    skin: '#e5b899', hair: '#3d261a', hairStyle: 'long', top: '#1d4f6b', topStyle: 'jacket',
    shirt: '#f6f2e8', bottom: '#252b38', shoes: '#1f1a18', glasses: true, scale: 0.96,
  },
  mert: {
    skin: '#e0b08a', hair: '#251a12', hairStyle: 'short', top: '#2b7a52', topStyle: 'hoodie',
    accent: '#f5c542', bottom: '#333b4a', shoes: '#f2f2f2', scale: 0.83,
  },
  simitci: {
    skin: '#c99670', hair: '#d0d0d0', hairStyle: 'cap', capColor: '#f4f4f0', top: '#6c6c6c', topStyle: 'apron',
    bottom: '#3d3a35', shoes: '#222', mustache: '#d0d0d0', scale: 0.97,
  },
} satisfies Record<string, CharacterLook>;
