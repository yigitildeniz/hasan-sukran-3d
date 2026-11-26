import * as THREE from 'three';
import { CONFIG } from '../game/config';
import type { Input } from '../game/Input';
import type { CollisionWorld } from '../systems/Collision';
import { assets } from '../systems/AssetLoader';
import { CharacterModel, LOOKS } from './Character';
import type { HideSpot } from '../world/types';
import type { Vehicle } from './Vehicle';

/**
 * First-person 6th-grade student protagonist.
 * Uses a streetwear CharacterModel on layer 1 while on foot so the body casts accurate
 * shadows and appears in the corridor mirror without obstructing the FPP camera.
 */
export class Player {
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  readonly model: CharacterModel;

  yaw = 0;
  pitch = 0;
  stamina: number = CONFIG.player.staminaMax;
  grounded = true;
  crouching = false;
  sprinting = false;
  hidden = false;
  speed = 0;
  speedMultiplier = 1;
  vehicle: Vehicle | null = null;

  private smoothYaw = 0;
  private smoothPitch = 0;
  private eyeY: number = CONFIG.player.eye;
  private bobPhase = 0;
  private stepAccum = 0;
  private currentFov = 72;
  private vehicleCamSnap = false;
  private inThirdPerson = false;
  private shake = 0;

  /** Short camera shake (collisions, hard braking). amount 0..1 */
  addShake(amount: number): void {
    this.shake = Math.min(1, this.shake + amount);
  }

  constructor(scene: THREE.Scene) {
    this.model = new CharacterModel(LOOKS.student);
    this.model.setLayer(1);
    scene.add(this.model.root);
    assets.swapIn('player', this.model.body, () => {
      this.model.setLayer(this.vehicle && this.inThirdPerson ? 0 : 1);
    });
  }

  teleport(target: THREE.Vector3, yaw?: number): void {
    this.pos.copy(target);
    this.vel.set(0, 0, 0);
    this.grounded = true;
    this.crouching = false;
    this.sprinting = false;
    if (yaw !== undefined) {
      this.yaw = yaw;
      this.smoothYaw = yaw;
      this.pitch = 0;
      this.smoothPitch = 0;
    }
    this.syncModel(0.016);
  }

  enterVehicle(v: Vehicle, thirdPerson = false): void {
    if (this.vehicle) return;
    this.vehicle = v;
    v.occupied = true;
    this.crouching = false;
    this.sprinting = false;
    this.vel.set(0, 0, 0);
    this.inThirdPerson = thirdPerson;
    // Keep driver body on layer 1 in 1st-person (shadows/reflections only, never blocks view)
    // and on layer 0 in 3rd-person so the player is visible riding/driving from outside.
    this.model.setLayer(thirdPerson ? 0 : 1);
    this.yaw = v.heading;
    this.smoothYaw = v.heading;
    this.pitch = thirdPerson ? -0.14 : -0.04;
    this.smoothPitch = this.pitch;
    this.vehicleCamSnap = true;
  }

  setVehicleCameraMode(thirdPerson: boolean): void {
    this.inThirdPerson = thirdPerson;
    if (!this.vehicle) return;
    this.model.setLayer(thirdPerson ? 0 : 1);
    this.yaw = this.vehicle.heading;
    this.smoothYaw = this.vehicle.heading;
    this.pitch = thirdPerson ? -0.14 : -0.04;
    this.smoothPitch = this.pitch;
    this.vehicleCamSnap = true;
  }

  exitVehicle(collision: CollisionWorld): void {
    const v = this.vehicle;
    if (!v) return;
    v.occupied = false;
    this.vehicle = null;
    this.model.setLayer(1);

    // Try left side, right side, then rear
    const offsets = [
      new THREE.Vector3(-v.halfWidth - 0.85, 0, 0),
      new THREE.Vector3(v.halfWidth + 0.85, 0, 0),
      new THREE.Vector3(0, 0, v.halfLength + 1.0),
    ];
    let placed = false;
    for (const off of offsets) {
      off.applyAxisAngle(new THREE.Vector3(0, 1, 0), v.heading);
      const cand = v.pos.clone().add(off);
      cand.y = collision.groundHeight(cand.x, cand.z, CONFIG.player.radius, v.pos.y, CONFIG.player.stepHeight);
      const test = cand.clone();
      const blocked = collision.resolveCircle(test, CONFIG.player.radius, CONFIG.player.height, CONFIG.player.stepHeight);
      if (!blocked || test.distanceTo(cand) < 0.35) {
        this.pos.copy(test);
        placed = true;
        break;
      }
    }
    if (!placed) {
      this.pos.copy(v.pos).add(new THREE.Vector3(0, 0.2, v.halfLength + 1.2));
    }
    this.yaw = v.heading;
    this.smoothYaw = v.heading;
    this.pitch = 0;
    this.smoothPitch = 0;
  }

  /** Returns true when a footstep sound should trigger. */
  update(
    dt: number,
    input: Input,
    collision: CollisionWorld,
    hideSpots: HideSpot[],
    camera: THREE.PerspectiveCamera,
    thirdPersonVehicle: boolean,
  ): boolean {
    const { dx, dy } = input.consumeMouse();
    const sens = CONFIG.player.mouseSensitivity;
    this.yaw -= dx * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * sens, -1.38, 1.38);

    const kLook = 1 - Math.exp(-dt * 26);
    this.smoothYaw += (this.yaw - this.smoothYaw) * kLook;
    this.smoothPitch += (this.pitch - this.smoothPitch) * kLook;

    if (this.vehicle) {
      this.updateInVehicle(dt, camera, thirdPersonVehicle, collision);
      return false;
    }

    const fwdInput = input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']);
    const sideInput = input.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
    const moving = fwdInput !== 0 || sideInput !== 0;

    if (input.wasPressed('KeyC') || input.wasPressed('ControlLeft')) {
      this.crouching = !this.crouching;
    }

    const wantsSprint = (input.isDown('ShiftLeft') || input.isDown('ShiftRight')) && fwdInput > 0 && !this.crouching;
    if (wantsSprint && this.stamina > 2) {
      this.sprinting = true;
      this.stamina = Math.max(0, this.stamina - CONFIG.player.staminaDrain * dt);
    } else {
      this.sprinting = false;
      const regen = moving ? CONFIG.player.staminaRegen * 0.65 : CONFIG.player.staminaRegen;
      this.stamina = Math.min(CONFIG.player.staminaMax, this.stamina + regen * dt);
    }

    const maxSpd =
      (this.crouching
        ? CONFIG.player.crouchSpeed
        : this.sprinting
          ? CONFIG.player.sprintSpeed
          : CONFIG.player.walkSpeed) * this.speedMultiplier;

    const sin = Math.sin(this.smoothYaw);
    const cos = Math.cos(this.smoothYaw);
    let moveX = -sin * fwdInput + cos * sideInput;
    let moveZ = -cos * fwdInput - sin * sideInput;
    const len = Math.hypot(moveX, moveZ);
    if (len > 0) {
      moveX = (moveX / len) * maxSpd;
      moveZ = (moveZ / len) * maxSpd;
    }

    const accel = this.grounded ? 14 : 4.5;
    const kMove = 1 - Math.exp(-dt * accel);
    this.vel.x += (moveX - this.vel.x) * kMove;
    this.vel.z += (moveZ - this.vel.z) * kMove;

    if (this.grounded && input.wasPressed('Space')) {
      this.vel.y = CONFIG.player.jumpVelocity;
      this.grounded = false;
      this.crouching = false;
    }

    this.vel.y -= CONFIG.player.gravity * dt;

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    const h = this.crouching ? CONFIG.player.crouchHeight : CONFIG.player.height;
    collision.resolveCircle(this.pos, CONFIG.player.radius, h, CONFIG.player.stepHeight);

    const floorY = collision.groundHeight(this.pos.x, this.pos.z, CONFIG.player.radius, this.pos.y, CONFIG.player.stepHeight);
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= floorY) {
      this.pos.y = floorY;
      this.vel.y = 0;
      this.grounded = true;
    } else if (this.pos.y - floorY < 0.08 && this.vel.y <= 0) {
      this.pos.y = floorY;
      this.vel.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    // Clamp to world bounds
    const bound = CONFIG.world.half - 1.5;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -bound, bound);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -bound, bound);

    this.speed = Math.hypot(this.vel.x, this.vel.z);

    // Check stealth hiding in bushes
    this.hidden = false;
    if (this.crouching) {
      for (const spot of hideSpots) {
        const dxS = this.pos.x - spot.pos.x;
        const dzS = this.pos.z - spot.pos.z;
        if (dxS * dxS + dzS * dzS <= (spot.radius + 0.35) * (spot.radius + 0.35)) {
          this.hidden = true;
          break;
        }
      }
    }

    // Smooth camera height + subtle head-bob + dynamic sprint FOV
    const targetEye = this.crouching ? CONFIG.player.crouchEye : CONFIG.player.eye;
    this.eyeY += (targetEye - this.eyeY) * (1 - Math.exp(-dt * 12));

    let stepTriggered = false;
    if (this.grounded && this.speed > 0.4) {
      const freq = this.sprinting ? 12.5 : this.crouching ? 6.5 : 8.8;
      this.bobPhase += dt * freq;
      this.stepAccum += dt * this.speed;
      const stride = this.sprinting ? 2.2 : 1.75;
      if (this.stepAccum >= stride) {
        this.stepAccum = 0;
        stepTriggered = true;
      }
    }
    const bobAmp = this.grounded ? Math.min(1, this.speed / 4) * (this.sprinting ? 0.055 : 0.028) : 0;
    const bobY = Math.sin(this.bobPhase) * bobAmp;
    const bobX = Math.cos(this.bobPhase * 0.5) * bobAmp * 0.6;

    camera.position.set(
      this.pos.x + cos * bobX,
      this.pos.y + this.eyeY + bobY,
      this.pos.z - sin * bobX,
    );
    camera.rotation.order = 'YXZ';
    camera.rotation.y = this.smoothYaw;
    camera.rotation.x = this.smoothPitch;
    camera.rotation.z = THREE.MathUtils.lerp(camera.rotation.z, -sideInput * 0.018, 1 - Math.exp(-dt * 10));

    const targetFov = this.sprinting ? 80 : this.crouching ? 68 : 72;
    if (Math.abs(this.currentFov - targetFov) > 0.05) {
      this.currentFov += (targetFov - this.currentFov) * (1 - Math.exp(-dt * 8));
      camera.fov = this.currentFov;
      camera.updateProjectionMatrix();
    }

    this.syncModel(dt);
    return stepTriggered;
  }

  private updateInVehicle(
    dt: number,
    camera: THREE.PerspectiveCamera,
    thirdPerson: boolean,
    collision: CollisionWorld,
  ): void {
    const v = this.vehicle!;
    this.pos.copy(v.pos);
    this.speed = Math.abs(v.speed);
    this.hidden = false;
    this.stamina = Math.min(CONFIG.player.staminaMax, this.stamina + CONFIG.player.staminaRegen * dt);

    // Sync driver visibility layer when switching between 1st-person and 3rd-person
    if (this.inThirdPerson !== thirdPerson) {
      this.setVehicleCameraMode(thirdPerson);
    }

    // Position driver body in seat
    const seatWorld = v.getSeatWorldPos();
    this.model.root.position.copy(seatWorld);
    this.model.root.rotation.y = v.heading;
    this.model.update(dt, 0, { sit: v.kind !== 'escooter' });

    // Follow vehicle steering immediately so turning corners never lags into A-pillars
    if (v.headingDelta !== 0) {
      this.yaw += v.headingDelta;
      this.smoothYaw += v.headingDelta;
    }

    // Free-look offset relative to vehicle heading (auto-recenters gently while moving)
    const relYaw = THREE.MathUtils.euclideanModulo(this.yaw - v.heading + Math.PI, Math.PI * 2) - Math.PI;
    if (Math.abs(v.speed) > 0.8) {
      const recenter = 1 - Math.exp(-dt * (thirdPerson ? 3.2 : 4.0));
      this.yaw -= relYaw * recenter;
      this.smoothYaw -= relYaw * recenter;
    }

    camera.rotation.order = 'YXZ';
    const speedK = THREE.MathUtils.clamp(Math.abs(v.speed) / Math.max(1, v.maxSpeed), 0, 1.2);
    // Brake dive / acceleration squat pitch (negative longAccel = braking = look slightly down)
    const accelTilt = THREE.MathUtils.clamp(v.longAccel * 0.0035, -0.06, 0.035);
    // Shake decays quickly; random jitter scaled by intensity
    this.shake *= Math.exp(-dt * 6.5);
    const sh = this.shake;
    const jx = (Math.random() - 0.5) * sh * 0.14;
    const jy = (Math.random() - 0.5) * sh * 0.1;
    const jroll = (Math.random() - 0.5) * sh * 0.05;

    if (thirdPerson) {
      const cfg = v.getChaseCameraConfig();
      const camYaw = this.smoothYaw;
      const clampedPitch = THREE.MathUtils.clamp(this.smoothPitch, -0.35, 0.35);
      // Pull the chase camera back & up a little as speed builds
      const dist = cfg.dist + speedK * 1.8;
      const height = cfg.height + speedK * 0.35;

      const pivot = new THREE.Vector3(v.pos.x, v.pos.y + 1.45, v.pos.z);
      const desired = new THREE.Vector3(
        v.pos.x + Math.sin(camYaw) * dist,
        Math.max(v.pos.y + 1.25, v.pos.y + height - clampedPitch * 1.6),
        v.pos.z + Math.cos(camYaw) * dist,
      );

      // Collision-safe pullback so the chase camera never clips inside walls/buildings
      const safeTarget = desired.clone();
      if (collision.segmentBlocked(pivot.x, pivot.z, desired.x, desired.z, Math.min(desired.y, pivot.y + 0.4))) {
        let lo = 0.22;
        let hi = 1.0;
        for (let i = 0; i < 6; i++) {
          const mid = (lo + hi) * 0.5;
          const mx = THREE.MathUtils.lerp(pivot.x, desired.x, mid);
          const mz = THREE.MathUtils.lerp(pivot.z, desired.z, mid);
          if (collision.segmentBlocked(pivot.x, pivot.z, mx, mz, pivot.y)) {
            hi = mid;
          } else {
            lo = mid;
          }
        }
        const safeT = Math.max(0.22, lo - 0.08);
        safeTarget.lerpVectors(pivot, desired, safeT);
        safeTarget.y = Math.max(v.pos.y + 1.5, safeTarget.y);
      }

      if (this.vehicleCamSnap) {
        camera.position.copy(safeTarget);
        this.vehicleCamSnap = false;
      } else {
        camera.position.lerp(safeTarget, 1 - Math.exp(-dt * 14));
      }

      const lookAt = new THREE.Vector3(
        v.pos.x - Math.sin(v.heading) * cfg.lookAhead,
        v.pos.y + cfg.lookHeight + accelTilt * 6,
        v.pos.z - Math.cos(v.heading) * cfg.lookAhead,
      );
      camera.position.x += jx;
      camera.position.y += jy;
      camera.lookAt(lookAt);
      camera.rotateZ(jroll);
      camera.position.x -= jx;
      camera.position.y -= jy;
    } else {
      // First-person cockpit / handlebar camera: attached directly (zero lag behind seat/roof!)
      const eyeWorld = v.getFirstPersonEyeWorld();
      // Lean back slightly with speed (head pressed back), forward under braking
      const back = speedK * 0.1 - accelTilt * 0.6;
      eyeWorld.x += Math.sin(v.heading) * back + jx * 0.5;
      eyeWorld.z += Math.cos(v.heading) * back;
      eyeWorld.y += jy * 0.5;
      camera.position.copy(eyeWorld);
      this.vehicleCamSnap = false;
      camera.rotation.y = this.smoothYaw;
      camera.rotation.x = THREE.MathUtils.clamp(this.smoothPitch + accelTilt, -0.45, 0.5);
      camera.rotation.z = -v.steer * Math.min(1, Math.abs(v.speed) / 14) * (v.kind === 'car' ? 0.025 : 0.09) + jroll;
    }

    const targetFov = 74 + Math.min(13, Math.abs(v.speed) * 0.65);
    if (Math.abs(this.currentFov - targetFov) > 0.05) {
      this.currentFov += (targetFov - this.currentFov) * (1 - Math.exp(-dt * 6));
      camera.fov = this.currentFov;
      camera.updateProjectionMatrix();
    }
  }

  private syncModel(dt: number): void {
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.smoothYaw;
    this.model.update(dt, this.speed, {
      crouch: this.crouching,
      airborne: !this.grounded,
    });
  }
}
