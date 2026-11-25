import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CONFIG } from './config';
import { Input } from './Input';
import { CollisionWorld } from '../systems/Collision';
import { HeatSystem } from '../systems/HeatSystem';
import { MissionSystem } from '../systems/MissionSystem';
import { ShopSystem } from '../systems/ShopSystem';
import { SoundEngine } from '../systems/Audio';
import { progressService } from '../services/firebase';
import { Environment } from '../world/Environment';
import { PropField } from '../world/Props';
import { buildSchool, type SchoolSpots } from '../world/School';
import { buildAtakent, type AtakentSpots } from '../world/Atakent';
import type { WorldContext, Zone } from '../world/types';
import { Player } from '../entities/Player';
import { Vehicle } from '../entities/Vehicle';
import { AuthorityNPC } from '../entities/AuthorityNPC';
import { FriendlyNPC } from '../entities/FriendlyNPC';
import { LOOKS } from '../entities/Character';
import { HUD } from '../ui/HUD';

/**
 * Main game coordinator tying together the Three.js renderer, GTA 6-inspired
 * daylight environment, Hasan Şükran Saruhan Ortaokulu + Atakent world, player,
 * vehicles, patrolling authority NPCs, heat, missions, audio, HUD and persistence.
 */
export class Game {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private input: Input;
  private env: Environment;
  private world: WorldContext;
  private schoolSpots: SchoolSpots;
  private atakentSpots: AtakentSpots;
  private player: Player;
  private vehicles: Vehicle[] = [];
  private authorities: AuthorityNPC[] = [];
  private friendlies: FriendlyNPC[] = [];
  private heat = new HeatSystem();
  private missions: MissionSystem;
  private shops: ShopSystem;
  private audio = new SoundEngine();
  private hud: HUD;

  private clock = new THREE.Clock();
  private elapsed = 0;
  private startedOnce = false;
  private thirdPersonVehicle = false;
  private detentionLockTimer = 0;
  private highScore = 0;
  private rafId = 0;

  constructor(canvasHost: HTMLElement, hudHost: HTMLElement) {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CONFIG.graphics.maxPixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    canvasHost.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 1200);
    // Layer 0 = world + vehicles + NPCs; layer 1 = first-person body (only seen by sun shadows & mirror)
    this.camera.layers.set(0);

    // Subtle GTA 6-style sunlit bloom post-processing
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (CONFIG.graphics.bloom) {
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.18,
        0.55,
        0.92,
      );
      this.composer.addPass(bloom);
    }
    this.composer.addPass(new OutputPass());

    this.input = new Input(this.renderer.domElement);
    this.env = new Environment(this.scene, this.renderer);

    // Build World
    const root = new THREE.Group();
    this.scene.add(root);
    const collision = new CollisionWorld();
    const props = new PropField(root, collision);
    this.world = {
      root,
      collision,
      map: [],
      hideSpots: [],
      zones: [],
      props,
      updaters: [],
      viewer: new THREE.Vector3(),
    };

    this.schoolSpots = buildSchool(this.world);
    this.atakentSpots = buildAtakent(this.world);
    this.world.props.build();

    // Entities
    this.player = new Player(this.scene);
    this.player.teleport(this.atakentSpots.spawn, this.atakentSpots.spawnYaw);

    for (const vSpawn of this.atakentSpots.vehicles) {
      this.vehicles.push(new Vehicle(vSpawn, this.scene));
    }

    this.authorities = [
      new AuthorityNPC(
        {
          id: 'principal',
          name: 'Mehmet Sait Bildirici',
          role: 'Okul Müdürü',
          color: '#ff4757',
          modelKey: 'principal',
          look: LOOKS.principal,
          waypoints: this.schoolSpots.patrolPrincipal,
          sharpness: 1.35,
          barks: ['Dur bakalım evladım!', 'Bahçede koşmak yasak!', 'Doğru odama gel!'],
        },
        this.scene,
      ),
      new AuthorityNPC(
        {
          id: 'bulent',
          name: 'Bülent Hoca',
          role: 'Müdür Yardımcısı',
          color: '#f5c542',
          modelKey: 'bulent',
          look: LOOKS.bulent,
          waypoints: this.schoolSpots.patrolBulent,
          sharpness: 1.15,
          barks: ['Koridorda koşma!', 'Sınıfına dön bakalım!', 'Seni gördüm!'],
        },
        this.scene,
      ),
      new AuthorityNPC(
        {
          id: 'ragip',
          name: 'Ragıp Hoca',
          role: 'Müdür Yardımcısı',
          color: '#ff7b54',
          modelKey: 'ragip',
          look: LOOKS.ragip,
          waypoints: this.schoolSpots.patrolRagip,
          sharpness: 1.1,
          barks: ['Nereye kaçıyorsun!', 'Okul sınırları içinde dikkatli ol!', 'Yaklaşıyorum!'],
        },
        this.scene,
      ),
    ];

    this.friendlies = [
      new FriendlyNPC(
        {
          id: 'emre',
          name: 'Emre',
          role: '6-G Sınıf Arkadaşı',
          color: '#57d38c',
          modelKey: 'emre',
          look: LOOKS.emre,
          pos: this.schoolSpots.classmateSeat,
          heading: Math.PI,
          sit: true,
        },
        this.scene,
      ),
      new FriendlyNPC(
        {
          id: 'zeynep',
          name: 'Zeynep',
          role: '6-G • Atakent Parkı',
          color: '#a78bfa',
          modelKey: 'zeynep',
          look: LOOKS.zeynep,
          pos: this.atakentSpots.parkFriend,
          heading: -Math.PI * 0.75,
        },
        this.scene,
      ),
      new FriendlyNPC(
        {
          id: 'simitci',
          name: 'Simitçi Amca',
          role: 'Atakent Caddesi',
          color: '#f5c542',
          modelKey: 'simitci',
          look: LOOKS.simitci,
          pos: this.atakentSpots.simitCart.clone().add(new THREE.Vector3(1.5, 0, 0.2)),
          heading: 0,
        },
        this.scene,
      ),
    ];

    // HUD + Missions
    this.hud = new HUD(hudHost, this.world.map, () => {
      this.audio.unlock();
      this.startedOnce = true;
      this.input.requestLock();
    });

    this.missions = new MissionSystem(this.scene, this.schoolSpots, this.atakentSpots, {
      onToast: (title, detail, tone) => this.hud.showToast(title, detail, tone),
      onMissionComplete: (title, reward) => {
        this.audio.missionComplete();
        this.shops.addMoney(50);
        this.hud.showToast(`GÖREV TAMAMLANDI: ${title}`, `+${reward} Puan ve +₺50 Harçlık kazandın!`, 'gold', 4.5);
        this.persistProgress();
      },
      onPickup: () => this.audio.pickup(),
    });

    this.shops = new ShopSystem(this.atakentSpots.commercial, {
      onToast: (title, detail, tone) => this.hud.showToast(title, detail, tone),
      onPickup: () => this.audio.pickup(),
      onAddScore: (pts) => {
        this.missions.score += pts;
        this.persistProgress();
      },
      onRestoreStamina: () => {
        this.player.stamina = CONFIG.player.staminaMax;
      },
    });

    this.input.onLockChange = (locked) => {
      this.hud.setPaused(!locked, this.startedOnce, this.highScore);
      if (!locked) this.audio.setEngine(false, 0, false);
    };

    window.addEventListener('resize', () => this.onResize());

    progressService.load().then((saved) => {
      this.highScore = saved.highScore;
      this.heat.detentions = saved.detentions;
    });

    // Initial render so the player sees the vibrant Atakent world behind the start screen
    this.player.update(0.016, this.input, this.world.collision, this.world.hideSpots, this.camera, false);
    this.env.update(this.player.pos);
    this.startLoop();
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  private startLoop(): void {
    const tick = () => {
      this.rafId = requestAnimationFrame(tick);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      this.step(dt);
    };
    tick();
  }

  private currentZone(): Zone | null {
    const { x, z } = this.player.pos;
    for (const zone of this.world.zones) {
      if (x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ) {
        return zone;
      }
    }
    return null;
  }

  private nearestVehicle(): Vehicle | null {
    let best: Vehicle | null = null;
    let bestD = 3.4;
    for (const v of this.vehicles) {
      if (v.occupied) continue;
      const d = Math.hypot(v.pos.x - this.player.pos.x, v.pos.z - this.player.pos.z);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    return best;
  }

  private triggerDetention(officer: AuthorityNPC): void {
    this.detentionLockTimer = 2.4;
    this.audio.whistle();
    this.heat.recordDetention();
    if (this.player.vehicle) {
      this.player.exitVehicle(this.world.collision);
    }
    const bark = officer.barks[Math.floor(Math.random() * officer.barks.length)];
    this.hud.showDetention(officer.name, bark);
    this.player.teleport(this.schoolSpots.detention, 0);
    for (const npc of this.authorities) npc.resetToPatrol();
    this.persistProgress();
  }

  private persistProgress(): void {
    this.highScore = Math.max(this.highScore, this.missions.score);
    progressService.save({
      completedMissions: this.missions.completedMissions,
      highScore: this.highScore,
      detentions: this.heat.detentions,
      updatedAt: new Date().toISOString(),
    });
  }

  private step(dt: number): void {
    this.elapsed += dt;

    // World animations (waving Turkish flag, corridor mirror culling)
    this.world.viewer.copy(this.camera.position);
    for (const up of this.world.updaters) up(this.elapsed, dt);

    if (this.input.locked) {
      // Utility toggles
      if (this.input.wasPressed('KeyM')) {
        this.audio.muted = !this.audio.muted;
        this.hud.showToast(this.audio.muted ? 'Ses Kapatıldı' : 'Ses Açıldı', '', 'gold', 1.6);
      }
      if (this.input.wasPressed('KeyV') && this.player.vehicle) {
        this.thirdPersonVehicle = !this.thirdPersonVehicle;
        this.player.setVehicleCameraMode(this.thirdPersonVehicle);
        this.hud.showToast(
          this.thirdPersonVehicle ? 'Kamera: 3. Şahıs (Takip)' : 'Kamera: 1. Şahıs (Kokpit)',
          '',
          'gold',
          1.4,
        );
      }
      if (this.input.wasPressed('KeyR') && this.missions.missionIndex >= 3) {
        this.missions.restartCampaign();
        this.hud.showToast('Görevler Yeniden Başladı', 'Sabah Yoklaması: 6-G', 'gold');
      }

      if (this.detentionLockTimer > 0) {
        this.detentionLockTimer -= dt;
      } else {
        // Vehicle enter / exit
        const nearV = this.nearestVehicle();
        if (this.input.wasPressed('KeyF')) {
          if (this.player.vehicle) {
            this.player.exitVehicle(this.world.collision);
          } else if (nearV) {
            this.player.enterVehicle(nearV, this.thirdPersonVehicle);
            this.hud.showToast(nearV.name, 'Sürmek için WASD · Fren: Space · Kamera: [V]', 'green', 2.4);
          }
        }

        // Mission / shop / world interaction
        if (this.input.wasPressed('KeyE')) {
          const handled = this.missions.tryInteract(this.player.pos, !!this.player.vehicle);
          if (!handled) {
            this.shops.tryInteract(this.player.pos, !!this.player.vehicle);
          }
        }
        if (this.input.wasPressed('KeyQ')) {
          this.shops.consumeHotNoodle();
        }

        // Update vehicles
        for (const v of this.vehicles) {
          v.update(dt, v.occupied ? this.input : null, this.world.collision);
        }

        // Update player & footsteps
        const stepSound = this.player.update(
          dt,
          this.input,
          this.world.collision,
          this.world.hideSpots,
          this.camera,
          this.thirdPersonVehicle,
        );
        if (stepSound) this.audio.footstep(this.player.sprinting);

        // Engine sound
        if (this.player.vehicle) {
          this.audio.setEngine(true, this.player.vehicle.speed, this.player.vehicle.kind === 'escooter');
        } else {
          this.audio.setEngine(false, 0, false);
        }

        // Zone & infractions
        const zone = this.currentZone();
        const inSchool = !!zone?.school;
        const restricted = !!zone?.restricted;
        const vehicleInSchool = inSchool && !!this.player.vehicle;
        const infiltrating = restricted || vehicleInSchool;

        if (restricted) {
          if (this.heat.addHeat(3, `${zone!.label} — Yasak Bölge!`)) {
            this.audio.alert();
            this.hud.showToast('Yasak Bölge!', `${zone!.label} içine izinsiz girdin!`, 'red');
          }
        } else if (vehicleInSchool) {
          if (this.heat.addHeat(2, 'Okul Bahçesinde Araç!')) {
            this.audio.alert();
            this.hud.showToast('Dikkat!', 'Okul bahçesine araçla girmek yasak!', 'red');
          }
        }

        // Update patrolling authority NPCs
        let anySpotted = false;
        let chasers = 0;
        let caughtBy: AuthorityNPC | null = null;

        for (const npc of this.authorities) {
          const res = npc.update(
            dt,
            {
              pos: this.player.pos,
              crouching: this.player.crouching,
              sprinting: this.player.sprinting,
              hidden: this.player.hidden,
              inVehicle: !!this.player.vehicle,
              infiltrating,
              inSchool,
              heat: this.heat.stars,
            },
            this.world.collision,
          );
          if (res.spotted) anySpotted = true;
          if (npc.state === 'chase') chasers += 1;
          if (res.startedChase) {
            const bark = npc.barks[Math.floor(Math.random() * npc.barks.length)];
            this.audio.alert();
            this.hud.showToast(npc.name, `"${bark}"`, 'red', 2.8);
            this.heat.addHeat(Math.max(1, chasers), `${npc.name} peşinde!`);
          }
          if (res.caught) caughtBy = npc;
        }

        if (chasers >= 2 && this.heat.stars < 3) {
          this.heat.addHeat(3, 'Disiplin Alarmı!');
        }
        if (anySpotted) this.heat.refreshSight();
        this.heat.update(dt, anySpotted, this.player.hidden);

        if (caughtBy) {
          this.triggerDetention(caughtBy);
        }

        // Friendly NPCs, Shops & Missions
        for (const f of this.friendlies) f.update(dt, this.player.pos);
        this.missions.update(this.elapsed, this.player.pos);
        if (this.shops.update(dt, this.elapsed)) {
          this.audio.boilBubble();
        }
      }

      this.input.endFrame();
    }

    // Update shadow frustum & HUD
    this.env.update(this.player.pos);
    const zone = this.currentZone();
    const zoneLabel = zone
      ? zone.label
      : this.player.pos.x > 58 && this.player.pos.z > 40
        ? 'Atakent Parkı'
        : this.player.pos.x < -60 && this.player.pos.z > 40
          ? 'Atakent Camii Civarı'
          : 'Atakent Mahallesi • Etimesgut';

    const nearV = this.player.vehicle ? null : this.nearestVehicle();
    const missionPrompt = this.missions.getInteractionPrompt(this.player.pos);
    const shopPrompt = missionPrompt ? null : this.shops.getPrompt(this.player.pos, !!this.player.vehicle);
    const shopState = this.shops.hudState();
    this.hud.update(dt, {
      playerPos: this.player.pos,
      playerYaw: this.player.yaw,
      staminaRatio: this.player.stamina / CONFIG.player.staminaMax,
      hidden: this.player.hidden,
      zoneLabel,
      vehicle: this.player.vehicle,
      thirdPerson: this.thirdPersonVehicle,
      heat: this.heat.snapshot(),
      mission: this.missions.hudState(),
      shop: shopState,
      interactPrompt: missionPrompt ?? shopPrompt,
      consumePrompt: shopState.noodleState === 'hot' ? 'Sıcak Noodle İç (+Enerji)' : null,
      vehiclePrompt: this.player.vehicle
        ? `${this.player.vehicle.name} aracından in`
        : nearV
          ? `${nearV.name} sür`
          : null,
      npcs: this.authorities,
      vehicles: this.vehicles,
      time: this.elapsed,
    });

    this.composer.render();
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.renderer.dispose();
  }
}
