import * as THREE from 'three';
import type { Input } from '../game/Input';
import type { CollisionWorld } from '../systems/Collision';
import { assets } from '../systems/AssetLoader';
import { CONFIG } from '../game/config';
import type { VehicleSpawn } from '../world/Atakent';

export type VehicleKind = 'car' | 'scooter' | 'escooter';

interface Spec {
  maxSpeed: number;
  reverseSpeed: number;
  accel: number;
  brake: number;
  drag: number;
  turnRate: number;
  halfWidth: number;
  halfLength: number;
  seatOffset: THREE.Vector3;
  eyeOffset: THREE.Vector3;
  chaseDist: number;
  chaseHeight: number;
  chaseLookAhead: number;
  chaseLookHeight: number;
  modelKey: string;
}

const SPECS: Record<VehicleKind, Spec> = {
  car: {
    maxSpeed: 21,
    reverseSpeed: 7,
    accel: 12.5,
    brake: 20,
    drag: 2.2,
    turnRate: 2.05,
    halfWidth: 0.92,
    halfLength: 2.05,
    seatOffset: new THREE.Vector3(-0.36, 0.42, 0.14),
    // Forward & slightly elevated above steering wheel, clear view through windshield & over hood
    eyeOffset: new THREE.Vector3(-0.36, 1.38, -0.44),
    chaseDist: 6.2,
    chaseHeight: 2.75,
    chaseLookAhead: 4.5,
    chaseLookHeight: 1.25,
    modelKey: 'car',
  },
  scooter: {
    maxSpeed: 16.5,
    reverseSpeed: 4,
    accel: 11.5,
    brake: 16,
    drag: 2.4,
    turnRate: 2.5,
    halfWidth: 0.42,
    halfLength: 0.95,
    seatOffset: new THREE.Vector3(0, 0.36, 0.22),
    // Forward & slightly above handlebar/dash so road & bars are unobstructed
    eyeOffset: new THREE.Vector3(0, 1.58, -0.26),
    chaseDist: 4.3,
    chaseHeight: 2.2,
    chaseLookAhead: 3.5,
    chaseLookHeight: 1.15,
    modelKey: 'scooter',
  },
  escooter: {
    maxSpeed: 12.5,
    reverseSpeed: 3,
    accel: 10.5,
    brake: 15,
    drag: 2.8,
    turnRate: 2.9,
    halfWidth: 0.34,
    halfLength: 0.68,
    seatOffset: new THREE.Vector3(0, 0.18, 0.14),
    // Clear eye-level above handlebar stem looking over the bar and road ahead
    eyeOffset: new THREE.Vector3(0, 1.76, -0.22),
    chaseDist: 3.9,
    chaseHeight: 2.15,
    chaseLookAhead: 3.2,
    chaseLookHeight: 1.15,
    modelKey: 'escooter',
  },
};

/**
 * Drivable cars, mopeds/scooters and electric scooters with responsive GTA-style handling,
 * first-person dashboard/handlebar view, wheel spin, lean and optional .glb model swap.
 */
export class Vehicle {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly pos = new THREE.Vector3();
  readonly kind: VehicleKind;
  readonly name: string;
  readonly halfWidth: number;
  readonly halfLength: number;

  heading: number;
  headingDelta = 0;
  speed = 0;
  steer = 0;
  occupied = false;

  private spec: Spec;
  private wheels: THREE.Object3D[] = [];
  private handleBar: THREE.Object3D | null = null;
  private brakeLights: THREE.MeshStandardMaterial[] = [];

  constructor(spawn: VehicleSpawn, scene: THREE.Scene) {
    this.kind = spawn.kind;
    this.name = spawn.name;
    this.spec = SPECS[spawn.kind];
    this.halfWidth = this.spec.halfWidth;
    this.halfLength = this.spec.halfLength;
    this.pos.copy(spawn.pos);
    this.heading = spawn.heading;

    this.root.add(this.body);
    this.buildProcedural(spawn.color);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.heading;
    scene.add(this.root);

    assets.swapIn(this.spec.modelKey, this.body);
  }

  getSeatWorldPos(): THREE.Vector3 {
    return this.spec.seatOffset
      .clone()
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), this.heading)
      .add(this.pos);
  }

  getFirstPersonEyeWorld(): THREE.Vector3 {
    return this.spec.eyeOffset
      .clone()
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), this.heading)
      .add(this.pos);
  }

  getChaseCameraConfig(): { dist: number; height: number; lookAhead: number; lookHeight: number } {
    return {
      dist: this.spec.chaseDist,
      height: this.spec.chaseHeight,
      lookAhead: this.spec.chaseLookAhead,
      lookHeight: this.spec.chaseLookHeight,
    };
  }

  get kmh(): number {
    return Math.round(Math.abs(this.speed) * 3.6);
  }

  update(dt: number, input: Input | null, collision: CollisionWorld, speedMultiplier = 1): void {
    const s = this.spec;
    const mult = Math.max(0.5, speedMultiplier);
    let throttle = 0;
    let steerInput = 0;
    let braking = false;

    if (this.occupied && input) {
      throttle = input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']);
      steerInput = input.axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']);
      braking = input.isDown('Space') || (throttle < 0 && this.speed > 0.5);
    }

    if (braking && this.occupied) {
      const decel = s.brake * mult * dt;
      if (Math.abs(this.speed) <= decel) this.speed = 0;
      else this.speed -= Math.sign(this.speed) * decel;
    } else if (throttle > 0) {
      this.speed = Math.min(s.maxSpeed * mult, this.speed + s.accel * mult * dt);
    } else if (throttle < 0) {
      this.speed = Math.max(-s.reverseSpeed * mult, this.speed - s.accel * mult * 0.8 * dt);
    } else {
      const drag = s.drag * dt;
      if (Math.abs(this.speed) <= drag) this.speed = 0;
      else this.speed -= Math.sign(this.speed) * drag;
    }

    const kSteer = 1 - Math.exp(-dt * 11);
    this.steer += (steerInput - this.steer) * kSteer;

    const prevHeading = this.heading;
    if (Math.abs(this.speed) > 0.08) {
      const speedFactor = Math.min(1, Math.abs(this.speed) / 4.5);
      const dir = this.speed >= 0 ? 1 : -1;
      this.heading += this.steer * s.turnRate * speedFactor * dir * dt;
    }
    this.headingDelta = this.heading - prevHeading;

    // Move along -Z forward vector
    const fx = -Math.sin(this.heading);
    const fz = -Math.cos(this.heading);
    const prevX = this.pos.x;
    const prevZ = this.pos.z;
    this.pos.x += fx * this.speed * dt;
    this.pos.z += fz * this.speed * dt;

    // World bounds
    const bound = CONFIG.world.half - 2.5;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -bound, bound);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -bound, bound);

    // Collision check using circular approximation (front + rear points for cars)
    const radius = this.kind === 'car' ? 0.98 : 0.44;
    const hit = collision.resolveCircle(this.pos, radius, 1.5, 0.22);
    if (hit) {
      const moved = Math.hypot(this.pos.x - prevX, this.pos.z - prevZ);
      if (moved < Math.abs(this.speed) * dt * 0.5) {
        this.speed *= -0.22;
      } else {
        this.speed *= 0.72;
      }
    }

    this.pos.y = collision.groundHeight(this.pos.x, this.pos.z, radius, this.pos.y, 0.35);

    this.root.position.copy(this.pos);
    this.root.rotation.y = this.heading;

    // Subtle body lean (scooters lean into turns, cars roll slightly outward)
    const leanTarget =
      this.kind === 'car'
        ? this.steer * Math.min(1, Math.abs(this.speed) / 14) * 0.04
        : -this.steer * Math.min(1, Math.abs(this.speed) / 9) * 0.22;
    this.body.rotation.z += (leanTarget - this.body.rotation.z) * (1 - Math.exp(-dt * 10));

    // Wheel spin & handlebar turn
    const spin = -this.speed * dt * (this.kind === 'escooter' ? 6 : 3.2);
    for (const w of this.wheels) w.rotation.x += spin;
    if (this.handleBar) this.handleBar.rotation.y = this.steer * 0.45;
    for (const bl of this.brakeLights) {
      bl.emissiveIntensity = braking ? 2.4 : this.occupied ? 0.8 : 0.15;
    }
  }

  private buildProcedural(hexColor: string): void {
    const paint = new THREE.MeshPhysicalMaterial({
      color: hexColor,
      roughness: 0.22,
      metalness: 0.35,
      clearcoat: 0.85,
      clearcoatRoughness: 0.15,
    });
    const dark = new THREE.MeshStandardMaterial({ color: '#1f2328', roughness: 0.7, metalness: 0.3 });
    const chrome = new THREE.MeshStandardMaterial({ color: '#d8dee4', roughness: 0.2, metalness: 0.9 });
    const tire = new THREE.MeshStandardMaterial({ color: '#18181a', roughness: 0.9 });
    const glass = new THREE.MeshPhysicalMaterial({
      color: '#a8cbe0',
      roughness: 0.05,
      metalness: 0.1,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    });
    const headLight = new THREE.MeshStandardMaterial({ color: '#fff8de', emissive: '#fff2c2', emissiveIntensity: 1.4 });
    const tailLight = new THREE.MeshStandardMaterial({ color: '#c8102e', emissive: '#ff1f3d', emissiveIntensity: 0.25 });
    this.brakeLights.push(tailLight);

    if (this.kind === 'car') {
      // Classic Turkish sedan silhouette (Tofaş Şahin / Toros / Doblo)
      const lower = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.56, 4.05), paint);
      lower.position.y = 0.56;
      const bumperF = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.2, 0.18), dark);
      bumperF.position.set(0, 0.36, -2.04);
      const bumperR = bumperF.clone();
      bumperR.position.z = 2.04;

      // Cabin pillars + higher roof (airy hollow interior for unobstructed FPP view)
      const roof = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.09, 1.95), paint);
      roof.position.set(0, 1.62, 0.2);
      const hood = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.08, 1.15), paint);
      hood.position.set(0, 0.86, -1.42);
      const dash = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.22, 0.42), dark);
      dash.position.set(0, 0.9, -0.74);
      const steering = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.022, 8, 16), dark);
      steering.position.set(-0.36, 1.03, -0.5);
      steering.rotation.x = 0.35;
      this.handleBar = steering;

      // Thin A/C pillars
      for (const sx of [-0.74, 0.74]) {
        const aPillar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.8, 0.07), paint);
        aPillar.position.set(sx, 1.24, -0.82);
        aPillar.rotation.x = 0.24;
        const cPillar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.11), paint);
        cPillar.position.set(sx, 1.24, 1.12);
        cPillar.rotation.x = -0.2;
        this.body.add(aPillar, cPillar);
      }

      // Windshield & rear glass
      const wind = new THREE.Mesh(new THREE.PlaneGeometry(1.44, 0.76), glass);
      wind.position.set(0, 1.25, -0.85);
      wind.rotation.x = -0.24;
      const rearWind = new THREE.Mesh(new THREE.PlaneGeometry(1.44, 0.72), glass);
      rearWind.position.set(0, 1.25, 1.16);
      rearWind.rotation.y = Math.PI;
      rearWind.rotation.x = -0.2;

      // Grille, headlights, taillights, Turkish plate (06 ATK 06)
      const grille = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.24, 0.06), dark);
      grille.position.set(0, 0.62, -2.03);
      for (const sx of [-0.66, 0.66]) {
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.08), headLight);
        hl.position.set(sx, 0.62, -2.02);
        const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.08), tailLight);
        tl.position.set(sx, 0.64, 2.02);
        this.body.add(hl, tl);
      }

      // Wheels
      const wGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 16).rotateZ(Math.PI / 2);
      const hubGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.24, 12).rotateZ(Math.PI / 2);
      for (const [wx, wz] of [[-0.86, -1.28], [0.86, -1.28], [-0.86, 1.28], [0.86, 1.28]]) {
        const wg = new THREE.Group();
        wg.position.set(wx, 0.32, wz);
        wg.add(new THREE.Mesh(wGeo, tire), new THREE.Mesh(hubGeo, chrome));
        this.wheels.push(wg);
        this.body.add(wg);
      }

      this.body.add(lower, bumperF, bumperR, roof, hood, dash, steering, wind, rearWind, grille);
    } else if (this.kind === 'scooter') {
      // Moped / Motorlu Scooter
      const deck = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 1.35), paint);
      deck.position.set(0, 0.34, 0.05);
      const rearBody = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.44, 0.78), paint);
      rearBody.position.set(0, 0.56, 0.36);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.66), dark);
      seat.position.set(0, 0.82, 0.28);
      const frontShield = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.66, 0.22), paint);
      frontShield.position.set(0, 0.68, -0.58);
      frontShield.rotation.x = 0.18;

      const barGroup = new THREE.Group();
      barGroup.position.set(0, 1.04, -0.52);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.68, 8).rotateZ(Math.PI / 2), chrome);
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.1), headLight);
      hl.position.set(0, 0.02, -0.1);
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.14), dark);
      dash.position.set(0, 0.03, 0);
      barGroup.add(bar, hl, dash);
      this.handleBar = barGroup;

      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.06), tailLight);
      tl.position.set(0, 0.66, 0.76);

      const wGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.14, 14).rotateZ(Math.PI / 2);
      for (const wz of [-0.66, 0.64]) {
        const w = new THREE.Mesh(wGeo, tire);
        w.position.set(0, 0.24, wz);
        this.wheels.push(w);
        this.body.add(w);
      }

      this.body.add(deck, rearBody, seat, frontShield, barGroup, tl);
    } else {
      // Standing E-Scooter (Martı / BinBin style)
      const deck = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 1.05), dark);
      deck.position.set(0, 0.16, 0.02);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.85), paint);
      trim.position.set(0, 0.16, 0.02);

      const barGroup = new THREE.Group();
      barGroup.position.set(0, 0.18, -0.45);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.032, 1.04, 10), paint);
      stem.position.set(0, 0.52, 0);
      stem.rotation.x = 0.12;
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.54, 8).rotateZ(Math.PI / 2), dark);
      bar.position.set(0, 1.02, 0.06);
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.08), headLight);
      hl.position.set(0, 0.98, 0.0);
      barGroup.add(stem, bar, hl);
      this.handleBar = barGroup;

      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.04), tailLight);
      tl.position.set(0, 0.2, 0.55);

      const wGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.08, 12).rotateZ(Math.PI / 2);
      for (const wz of [-0.48, 0.48]) {
        const w = new THREE.Mesh(wGeo, tire);
        w.position.set(0, 0.13, wz);
        this.wheels.push(w);
        this.body.add(w);
      }
      this.body.add(deck, trim, barGroup, tl);
    }

    this.body.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
  }
}
