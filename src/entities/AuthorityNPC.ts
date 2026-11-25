import * as THREE from 'three';
import { CONFIG } from '../game/config';
import type { CollisionWorld } from '../systems/Collision';
import { assets } from '../systems/AssetLoader';
import { iconTexture, nameTagTexture } from '../world/textures';
import { CharacterModel, type CharacterLook } from './Character';

export type NPCState = 'patrol' | 'suspicious' | 'chase' | 'search';

export interface AuthoritySpec {
  id: string;
  name: string;
  role: string;
  color: string;
  modelKey: string;
  look: CharacterLook;
  waypoints: THREE.Vector3[];
  /** Multiplier for detection speed (Principal is extra sharp). */
  sharpness?: number;
  barks: string[];
}

export interface PlayerPerception {
  pos: THREE.Vector3;
  crouching: boolean;
  sprinting: boolean;
  hidden: boolean;
  inVehicle: boolean;
  infiltrating: boolean; // in restricted room or riding vehicle on school yard
  inSchool: boolean;
  heat: number;
}

/**
 * Patrolling school authority NPCs:
 * - Müdür Mehmet Sait Bildirici
 * - Müdür Yardımcısı Bülent Hoca
 * - Müdür Yardımcısı Ragıp Hoca
 *
 * Uses a vision cone + line-of-sight ray test + hearing radius, transitioning cleanly
 * between patrol, suspicious, chase and search states.
 */
export class AuthorityNPC {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly pos = new THREE.Vector3();
  readonly model: CharacterModel;
  readonly barks: string[];

  heading = 0;
  state: NPCState = 'patrol';
  alert = 0; // 0..1 suspicion meter
  seesPlayer = false;

  private waypoints: THREE.Vector3[];
  private wpIndex = 0;
  private waitTimer = 0;
  private searchTimer = 0;
  private lastKnown = new THREE.Vector3();
  private sharpness: number;
  private statusSprite: THREE.Sprite;
  private warnTex: THREE.Texture;
  private chaseTex: THREE.Texture;
  private stuckTimer = 0;
  private lastPos = new THREE.Vector3();

  constructor(spec: AuthoritySpec, scene: THREE.Scene) {
    this.id = spec.id;
    this.name = spec.name;
    this.role = spec.role;
    this.waypoints = spec.waypoints.map((w) => w.clone());
    this.sharpness = spec.sharpness ?? 1;
    this.barks = spec.barks;

    this.pos.copy(this.waypoints[0]);
    this.lastPos.copy(this.pos);

    this.model = new CharacterModel(spec.look);
    this.model.root.position.copy(this.pos);
    scene.add(this.model.root);

    // Floating name tag (kept when .glb is swapped in)
    const tag = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: nameTagTexture(spec.name, spec.role, spec.color), transparent: true, depthTest: false }),
    );
    tag.scale.set(1.9, 0.48, 1);
    tag.position.set(0, 2.28, 0);
    tag.userData.keepOnSwap = true;
    this.model.root.add(tag);

    this.warnTex = iconTexture('?', '#f5c542');
    this.chaseTex = iconTexture('!', '#ff4757');
    this.statusSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.warnTex, transparent: true, depthTest: false }),
    );
    this.statusSprite.scale.set(0.45, 0.45, 1);
    this.statusSprite.position.set(0, 2.75, 0);
    this.statusSprite.visible = false;
    this.statusSprite.userData.keepOnSwap = true;
    this.model.root.add(this.statusSprite);

    assets.swapIn(spec.modelKey, this.model.body);
  }

  resetToPatrol(): void {
    this.state = 'patrol';
    this.alert = 0;
    this.seesPlayer = false;
    this.waitTimer = 0;
    this.searchTimer = 0;
    this.wpIndex = 0;
    this.pos.copy(this.waypoints[0]);
    this.model.root.position.copy(this.pos);
    this.statusSprite.visible = false;
  }

  /**
   * Updates AI perception and locomotion.
   * Returns `{ spotted, caught, bark }` events for the game/heat system.
   */
  update(
    dt: number,
    player: PlayerPerception,
    collision: CollisionWorld,
  ): { spotted: boolean; caught: boolean; startedChase: boolean } {
    const prevState = this.state;
    const dx = player.pos.x - this.pos.x;
    const dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);

    // Is the player doing something worth noticing?
    const infraction =
      player.infiltrating ||
      (player.inSchool && (player.sprinting || player.inVehicle)) ||
      player.heat > 0;

    // Vision cone check
    const fx = -Math.sin(this.heading);
    const fz = -Math.cos(this.heading);
    const dot = dist > 0.001 ? (dx * fx + dz * fz) / dist : 1;
    const halfFovCos = Math.cos(THREE.MathUtils.degToRad(CONFIG.npc.viewFovDeg * 0.5));

    const visRange = player.hidden
      ? 2.8
      : player.crouching
        ? CONFIG.npc.viewRange * 0.58
        : CONFIG.npc.viewRange;

    let visible = false;
    if (dist < visRange && (dot > halfFovCos || dist < 2.6)) {
      const eyeY = Math.max(this.pos.y, player.pos.y) + 1.35;
      visible = !collision.segmentBlocked(this.pos.x, this.pos.z, player.pos.x, player.pos.z, eyeY);
    }

    const heard =
      (player.inVehicle && dist < CONFIG.npc.hearVehicle && player.inSchool) ||
      (player.sprinting && dist < CONFIG.npc.hearSprint && player.inSchool);

    this.seesPlayer = visible && (infraction || this.state === 'chase' || dist < 4.5);

    if ((visible && infraction) || heard) {
      const rate = (player.infiltrating ? 2.4 : player.heat > 0 ? 2.8 : 1.15) * this.sharpness * (1 + Math.max(0, 1 - dist / visRange));
      this.alert = Math.min(1, this.alert + rate * dt);
      this.lastKnown.copy(player.pos);
      if (this.alert >= 1 || (player.heat >= 1 && visible)) {
        this.state = 'chase';
        this.searchTimer = CONFIG.npc.loseSightSeconds;
      } else if (this.state === 'patrol' && this.alert > 0.28) {
        this.state = 'suspicious';
      }
    } else if (this.state === 'chase') {
      if (visible && !player.hidden) {
        this.lastKnown.copy(player.pos);
        this.searchTimer = CONFIG.npc.loseSightSeconds;
      } else {
        this.searchTimer -= dt;
        if (this.searchTimer <= 0) {
          this.state = 'search';
          this.searchTimer = 4.5;
        }
      }
    } else if (this.state === 'search') {
      this.searchTimer -= dt;
      this.alert = Math.max(0, this.alert - 0.16 * dt);
      if (this.searchTimer <= 0) {
        this.state = 'patrol';
      }
    } else {
      this.alert = Math.max(0, this.alert - 0.35 * dt);
      if (this.state === 'suspicious' && this.alert < 0.08) {
        this.state = 'patrol';
      }
    }

    // Movement
    let speed = 0;
    let target: THREE.Vector3 | null = null;
    if (this.state === 'chase') {
      target = visible && !player.hidden ? player.pos : this.lastKnown;
      speed = CONFIG.npc.runSpeed * (this.id === 'ragip' ? 1.04 : 1.0);
    } else if (this.state === 'suspicious' || this.state === 'search') {
      target = this.lastKnown;
      speed = CONFIG.npc.walkSpeed * 1.35;
    } else {
      if (this.waitTimer > 0) {
        this.waitTimer -= dt;
      } else {
        target = this.waypoints[this.wpIndex];
        speed = CONFIG.npc.walkSpeed;
        if (Math.hypot(target.x - this.pos.x, target.z - this.pos.z) < 0.9) {
          this.wpIndex = (this.wpIndex + 1) % this.waypoints.length;
          this.waitTimer = 1.2 + Math.random() * 1.8;
          target = null;
          speed = 0;
        }
      }
    }

    if (target && speed > 0) {
      const tx = target.x - this.pos.x;
      const tz = target.z - this.pos.z;
      const td = Math.hypot(tx, tz);
      if (td > 0.35) {
        const desiredHeading = Math.atan2(-tx, -tz);
        const diff = THREE.MathUtils.euclideanModulo(desiredHeading - this.heading + Math.PI, Math.PI * 2) - Math.PI;
        this.heading += diff * (1 - Math.exp(-dt * 9));

        const step = Math.min(td, speed * dt);
        this.pos.x += (tx / td) * step;
        this.pos.z += (tz / td) * step;

        const hit = collision.resolveCircle(this.pos, 0.36, 1.75, 0.5);
        if (hit) {
          // Sidestep around corners smoothly
          this.stuckTimer += dt;
          const perp = this.stuckTimer > 0.35 ? 1 : -1;
          this.pos.x += (-tz / td) * speed * 0.55 * dt * perp;
          this.pos.z += (tx / td) * speed * 0.55 * dt * perp;
          collision.resolveCircle(this.pos, 0.36, 1.75, 0.5);
          if (this.stuckTimer > 2.2 && this.state === 'patrol') {
            this.wpIndex = (this.wpIndex + 1) % this.waypoints.length;
            this.stuckTimer = 0;
          }
        } else {
          this.stuckTimer = Math.max(0, this.stuckTimer - dt);
        }

        this.pos.y = collision.groundHeight(this.pos.x, this.pos.z, 0.34, this.pos.y, 0.5);
      } else if (this.state === 'search') {
        this.heading += dt * 1.4; // look around
        speed = 0;
      }
    }

    const actualSpeed = this.pos.distanceTo(this.lastPos) / Math.max(dt, 0.001);
    this.lastPos.copy(this.pos);

    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.heading;
    this.model.update(dt, Math.min(actualSpeed, 7), {
      wave: this.state === 'chase' && dist < 8,
    });

    // Status sprite above head
    if (this.state === 'chase') {
      this.statusSprite.visible = true;
      (this.statusSprite.material as THREE.SpriteMaterial).map = this.chaseTex;
    } else if (this.state === 'suspicious' || this.state === 'search') {
      this.statusSprite.visible = true;
      (this.statusSprite.material as THREE.SpriteMaterial).map = this.warnTex;
    } else {
      this.statusSprite.visible = false;
    }

    const catchDist = player.inVehicle ? CONFIG.npc.catchDistance + 0.55 : CONFIG.npc.catchDistance;
    const caught =
      this.state === 'chase' &&
      dist < catchDist &&
      Math.abs(this.pos.y - player.pos.y) < 1.3 &&
      !player.hidden;

    return {
      spotted: this.state === 'chase' && visible && !player.hidden,
      caught,
      startedChase: prevState !== 'chase' && this.state === 'chase',
    };
  }
}
