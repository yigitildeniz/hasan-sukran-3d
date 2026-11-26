import * as THREE from 'three';
import type { Input } from '../game/Input';
import type { CollisionWorld } from '../systems/Collision';
import { assets } from '../systems/AssetLoader';
import { CONFIG } from '../game/config';
import type { VehicleSpawn } from '../world/Atakent';
import { surfaceAt, type SurfaceInfo } from '../world/surfaces';

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

const sharedVehicleAssets = (() => {
  let cache: {
    dark: THREE.MeshStandardMaterial;
    chrome: THREE.MeshStandardMaterial;
    tire: THREE.MeshStandardMaterial;
    glass: THREE.MeshPhysicalMaterial;
    headLight: THREE.MeshStandardMaterial;
    carWheel: THREE.BufferGeometry;
    carHub: THREE.BufferGeometry;
    scooterWheel: THREE.BufferGeometry;
    escooterWheel: THREE.BufferGeometry;
  } | null = null;
  return () => {
    if (!cache) {
      cache = {
        dark: new THREE.MeshStandardMaterial({ color: '#1f2328', roughness: 0.7, metalness: 0.3 }),
        chrome: new THREE.MeshStandardMaterial({ color: '#d8dee4', roughness: 0.2, metalness: 0.9 }),
        tire: new THREE.MeshStandardMaterial({ color: '#18181a', roughness: 0.9 }),
        glass: new THREE.MeshPhysicalMaterial({
          color: '#a8cbe0',
          roughness: 0.05,
          metalness: 0.1,
          transparent: true,
          opacity: 0.18,
          depthWrite: false,
        }),
        headLight: new THREE.MeshStandardMaterial({ color: '#fff8de', emissive: '#fff2c2', emissiveIntensity: 1.4 }),
        carWheel: new THREE.CylinderGeometry(0.32, 0.32, 0.22, 14).rotateZ(Math.PI / 2),
        carHub: new THREE.CylinderGeometry(0.16, 0.16, 0.24, 10).rotateZ(Math.PI / 2),
        scooterWheel: new THREE.CylinderGeometry(0.24, 0.24, 0.14, 12).rotateZ(Math.PI / 2),
        escooterWheel: new THREE.CylinderGeometry(0.13, 0.13, 0.08, 10).rotateZ(Math.PI / 2),
      };
    }
    return cache;
  };
})();

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
  /** Signed forward speed (m/s). */
  speed = 0;
  steer = 0;
  occupied = false;

  /** World-space planar velocity (allows lateral slide / drift). */
  readonly vel = new THREE.Vector3();
  /** 0..1 lateral slip amount (tyre squeal / skid audio). */
  slip = 0;
  /** Impact speed (m/s) of a collision during the last update, 0 if none. */
  impact = 0;
  braking = false;
  throttle = 0;
  /** Smoothed longitudinal acceleration (m/s²) for camera pitch / body dive. */
  longAccel = 0;
  surface: SurfaceInfo = surfaceAt(0, 0);

  private spec: Spec;
  private wheels: THREE.Object3D[] = [];
  private frontPivots: THREE.Object3D[] = [];
  private handleBar: THREE.Object3D | null = null;
  private brakeLights: THREE.MeshStandardMaterial[] = [];
  private readonly spawnPos = new THREE.Vector3();
  private readonly spawnHeading: number;
  private rumblePhase = 0;
  private sleeping = true;

  constructor(spawn: VehicleSpawn, scene: THREE.Scene) {
    this.kind = spawn.kind;
    this.name = spawn.name;
    this.spec = SPECS[spawn.kind];
    this.halfWidth = this.spec.halfWidth;
    this.halfLength = this.spec.halfLength;
    this.pos.copy(spawn.pos);
    this.heading = spawn.heading;
    this.spawnPos.copy(spawn.pos);
    this.spawnHeading = spawn.heading;

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

  get maxSpeed(): number {
    return this.spec.maxSpeed;
  }

  update(dt: number, input: Input | null, collision: CollisionWorld, speedMultiplier = 1): void {
    const s = this.spec;
    const mult = Math.max(0.5, speedMultiplier);
    this.impact = 0;
    this.headingDelta = 0;

    let throttle = 0;
    let steerInput = 0;
    let handbrake = false;
    if (this.occupied && input) {
      throttle = input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']);
      steerInput = input.axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']);
      handbrake = input.isDown('Space');
    }
    this.throttle = throttle;

    // Parked & at rest: skip physics entirely (cheap for all idle vehicles in the world)
    if (!this.occupied && this.vel.lengthSq() < 0.0004) {
      if (!this.sleeping) {
        this.vel.set(0, 0, 0);
        this.speed = 0;
        this.slip = 0;
        this.braking = false;
        this.longAccel = 0;
        this.steer = 0;
        this.body.rotation.set(0, 0, 0);
        this.body.position.y = 0;
        if (this.frontPivots.length) for (const p of this.frontPivots) p.rotation.y = 0;
        if (this.handleBar) this.handleBar.rotation.y = 0;
        for (const bl of this.brakeLights) bl.emissiveIntensity = 0.15;
        this.sleeping = true;
      }
      return;
    }
    this.sleeping = false;

    const surf = surfaceAt(this.pos.x, this.pos.z);
    this.surface = surf;

    // --- decompose velocity into forward / lateral components
    let fx = -Math.sin(this.heading), fz = -Math.cos(this.heading);
    let rx = Math.cos(this.heading), rz = -Math.sin(this.heading);
    let vf = this.vel.x * fx + this.vel.z * fz;
    let vl = this.vel.x * rx + this.vel.z * rz;
    const prevVf = vf;

    const top = s.maxSpeed * mult * surf.speed;
    const braking =
      this.occupied && (handbrake || (throttle < 0 && vf > 0.6) || (throttle > 0 && vf < -0.6));
    this.braking = braking;

    if (braking) {
      const decel = s.brake * mult * (handbrake ? 0.8 : 1) * (0.55 + 0.45 * surf.grip) * dt;
      vf = Math.abs(vf) <= decel ? 0 : vf - Math.sign(vf) * decel;
    } else if (throttle > 0) {
      // Gradual acceleration curve: strong pull at low speed, tapering near top speed
      const ratio = THREE.MathUtils.clamp(vf / top, 0, 1);
      const curve = 1 - ratio * ratio * 0.82;
      vf = Math.min(Math.max(vf, top), vf + s.accel * mult * curve * (0.7 + 0.3 * surf.grip) * dt);
    } else if (throttle < 0) {
      vf = Math.max(-s.reverseSpeed * mult, vf - s.accel * 0.7 * mult * dt);
    }

    // Rolling resistance (stronger on grass / dirt) and gentle bleed-off above surface top speed
    const roll = s.drag * surf.drag * (throttle === 0 ? 1 : 0.25) * dt;
    vf = Math.abs(vf) <= roll ? 0 : vf - Math.sign(vf) * roll;
    if (vf > top) vf -= (vf - top) * (1 - Math.exp(-dt * 2.2));

    // --- steering: less lock at high speed for stability
    const speedAbs = Math.abs(vf);
    const lockScale = 1 - Math.min(0.55, speedAbs / (s.maxSpeed * 1.6));
    this.steer += (steerInput * lockScale - this.steer) * (1 - Math.exp(-dt * 9));

    // Recompose with old axes, then rotate the chassis: forward momentum becomes lateral slip
    this.vel.x = fx * vf + rx * vl;
    this.vel.z = fz * vf + rz * vl;
    if (speedAbs > 0.08) {
      const sf = Math.min(1, speedAbs / 4.5);
      const yaw = this.steer * s.turnRate * sf * Math.sign(vf) * dt;
      this.heading += yaw;
      this.headingDelta = yaw;
    }
    fx = -Math.sin(this.heading); fz = -Math.cos(this.heading);
    rx = Math.cos(this.heading); rz = -Math.sin(this.heading);
    vf = this.vel.x * fx + this.vel.z * fz;
    vl = this.vel.x * rx + this.vel.z * rz;

    // Lateral tyre grip: weaker with handbrake, sharp turns at speed, and loose surfaces => slide
    const baseGrip = this.kind === 'car' ? 7.2 : 9.5;
    const sharp = Math.abs(this.steer) * Math.min(1, speedAbs / (s.maxSpeed * 0.7));
    const grip = baseGrip * surf.grip * (handbrake ? 0.28 : 1) * (1 - 0.45 * sharp);
    vl *= Math.exp(-grip * dt);
    this.vel.x = fx * vf + rx * vl;
    this.vel.z = fz * vf + rz * vl;
    this.slip = THREE.MathUtils.clamp(Math.abs(vl) / 5, 0, 1);

    // --- integrate with sub-steps (no tunnelling through thin walls at high speed)
    const travel = Math.hypot(this.vel.x, this.vel.z) * dt;
    const steps = Math.min(6, Math.max(1, Math.ceil(travel / 0.3)));
    const sdt = dt / steps;
    const bound = CONFIG.world.half - 2.5;
    for (let i = 0; i < steps; i++) {
      this.pos.x += this.vel.x * sdt;
      this.pos.z += this.vel.z * sdt;
      if (Math.abs(this.pos.x) > bound) { this.pos.x = Math.sign(this.pos.x) * bound; this.vel.x *= -0.2; }
      if (Math.abs(this.pos.z) > bound) { this.pos.z = Math.sign(this.pos.z) * bound; this.vel.z *= -0.2; }
      this.resolveCollisions(collision, fx, fz);
    }

    // Safety net: never leave the playable world
    if (!Number.isFinite(this.pos.x) || !Number.isFinite(this.pos.z) || !Number.isFinite(this.vel.x)) {
      this.pos.copy(this.spawnPos);
      this.heading = this.spawnHeading;
      this.vel.set(0, 0, 0);
    }

    const radius = this.kind === 'car' ? 0.9 : 0.4;
    const gy = collision.groundHeight(this.pos.x, this.pos.z, radius, this.pos.y, 0.3);
    this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 18);
    if (Math.abs(gy - this.pos.y) < 0.005) this.pos.y = gy;

    this.speed = this.vel.x * fx + this.vel.z * fz;
    const rawAccel = (this.speed - prevVf) / Math.max(dt, 1e-3);
    this.longAccel += (THREE.MathUtils.clamp(rawAccel, -40, 40) - this.longAccel) * (1 - Math.exp(-dt * 8));

    this.root.position.copy(this.pos);
    this.root.rotation.y = this.heading;

    // --- chassis animation: roll, dive/squat, surface rumble
    const sp = Math.abs(this.speed);
    const latRatio = THREE.MathUtils.clamp(vl / 6, -1, 1);
    const kBody = 1 - Math.exp(-dt * 10);
    if (this.kind === 'car') {
      const rollTarget = this.steer * Math.min(1, sp / 14) * 0.045 + latRatio * 0.03;
      this.body.rotation.z += (rollTarget - this.body.rotation.z) * kBody;
    } else {
      const leanTarget = -this.steer * Math.min(1, sp / 9) * 0.26 - latRatio * 0.08;
      this.body.rotation.z += (leanTarget - this.body.rotation.z) * kBody;
    }
    const pitchTarget = THREE.MathUtils.clamp(this.longAccel * 0.0035, -0.055, 0.04);
    this.body.rotation.x += (pitchTarget - this.body.rotation.x) * kBody;
    this.rumblePhase += dt * (6 + sp * 2.2);
    this.body.position.y = Math.sin(this.rumblePhase) * surf.rough * 0.018 * Math.min(1, sp / 5);

    // Wheel spin, visible front-wheel / handlebar steering angle
    const wheelR = this.kind === 'car' ? 0.32 : this.kind === 'scooter' ? 0.24 : 0.13;
    const spin = (-this.speed * dt) / wheelR;
    for (const w of this.wheels) w.rotation.x += spin;
    const steerAngle = this.steer * (this.kind === 'car' ? 0.5 : 0.45);
    for (const p of this.frontPivots) p.rotation.y = steerAngle;
    if (this.handleBar) this.handleBar.rotation.y = this.kind === 'car' ? 0 : steerAngle;
    if (this.kind === 'car' && this.handleBar) this.handleBar.rotation.z = -this.steer * 1.6;
    for (const bl of this.brakeLights) {
      bl.emissiveIntensity = braking ? 2.4 : this.occupied ? 0.8 : 0.15;
    }
  }

  /** Multi-circle chassis collision with velocity reflection (no snagging, no launching). */
  private resolveCollisions(collision: CollisionWorld, fx: number, fz: number): void {
    const probes = this.kind === 'car' ? [-1.12, 1.12] : this.kind === 'scooter' ? [-0.45, 0.45] : [0];
    const r = this.kind === 'car' ? 0.92 : this.kind === 'scooter' ? 0.36 : 0.34;
    let nx = 0, nz = 0;
    for (const off of probes) {
      const p = Vehicle.tmp.set(this.pos.x + fx * off, this.pos.y, this.pos.z + fz * off);
      const bx = p.x, bz = p.z;
      if (collision.resolveCircle(p, r, 1.5, 0.3)) {
        const dx = p.x - bx, dz = p.z - bz;
        // Cap per-probe correction so a deep overlap never "launches" the vehicle
        const len = Math.hypot(dx, dz);
        const cap = len > 0.6 ? 0.6 / len : 1;
        this.pos.x += dx * cap;
        this.pos.z += dz * cap;
        nx += dx;
        nz += dz;
      }
    }
    const nl = Math.hypot(nx, nz);
    if (nl < 1e-6) return;
    nx /= nl; nz /= nl;
    const vn = this.vel.x * nx + this.vel.z * nz;
    if (vn < 0) {
      // Remove inbound component with small bounce, scrub tangential speed a bit
      const restitution = 0.22;
      this.vel.x -= (1 + restitution) * vn * nx;
      this.vel.z -= (1 + restitution) * vn * nz;
      const tx = this.vel.x - (this.vel.x * nx + this.vel.z * nz) * nx;
      const tz = this.vel.z - (this.vel.x * nx + this.vel.z * nz) * nz;
      const scrub = 0.12 + Math.min(0.5, -vn * 0.04);
      this.vel.x -= tx * scrub;
      this.vel.z -= tz * scrub;
      this.impact = Math.max(this.impact, -vn);
    }
  }

  private static tmp = new THREE.Vector3();

  private buildProcedural(hexColor: string): void {
    const shared = sharedVehicleAssets();
    const paint = new THREE.MeshPhysicalMaterial({
      color: hexColor,
      roughness: 0.22,
      metalness: 0.35,
      clearcoat: 0.85,
      clearcoatRoughness: 0.15,
    });
    const { dark, chrome, tire, glass, headLight } = shared;
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

      // Wheels (shared geometries across all cars)
      const wGeo = shared.carWheel;
      const hubGeo = shared.carHub;
      for (const [wx, wz] of [[-0.86, -1.28], [0.86, -1.28], [-0.86, 1.28], [0.86, 1.28]]) {
        const wg = new THREE.Group();
        wg.add(new THREE.Mesh(wGeo, tire), new THREE.Mesh(hubGeo, chrome));
        this.wheels.push(wg);
        if (wz < 0) {
          // Front wheels sit in a steering pivot so the steer angle is clearly visible
          const pivot = new THREE.Group();
          pivot.position.set(wx, 0.32, wz);
          pivot.add(wg);
          this.frontPivots.push(pivot);
          this.body.add(pivot);
        } else {
          wg.position.set(wx, 0.32, wz);
          this.body.add(wg);
        }
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

      const wGeo = shared.scooterWheel;
      for (const wz of [-0.66, 0.64]) {
        this.addTwoWheel(wGeo, tire, 0.24, wz);
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

      const wGeo = shared.escooterWheel;
      for (const wz of [-0.48, 0.48]) {
        this.addTwoWheel(wGeo, tire, 0.13, wz);
      }
      this.body.add(deck, trim, barGroup, tl);
    }

    this.body.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        // Tiny parts (lights, bars, hubs) don't need to cast shadows
        m.geometry.computeBoundingSphere();
        const r = m.geometry.boundingSphere?.radius ?? 1;
        m.castShadow = r > 0.15;
        m.receiveShadow = r > 0.3;
      }
    });
  }

  /** Two-wheeler wheel: the front one goes into a steering pivot. */
  private addTwoWheel(geo: THREE.BufferGeometry, mat: THREE.Material, radius: number, wz: number): void {
    const w = new THREE.Mesh(geo, mat);
    this.wheels.push(w);
    if (wz < 0) {
      const pivot = new THREE.Group();
      pivot.position.set(0, radius, wz);
      pivot.add(w);
      this.frontPivots.push(pivot);
      this.body.add(pivot);
    } else {
      w.position.set(0, radius, wz);
      this.body.add(w);
    }
  }
}
