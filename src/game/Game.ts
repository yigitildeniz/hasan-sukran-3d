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
import { surfaceAt } from '../world/surfaces';
import type { WorldContext, Zone } from '../world/types';
import { Player } from '../entities/Player';
import { Vehicle } from '../entities/Vehicle';
import { AuthorityNPC } from '../entities/AuthorityNPC';
import { FriendlyNPC } from '../entities/FriendlyNPC';
import { MarketDuo } from '../entities/MarketDuo';
import { LOOKS } from '../entities/Character';
import { HUD } from '../ui/HUD';
import { ModMenu } from '../ui/ModMenu';

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
  private marketDuo: MarketDuo;
  private heat = new HeatSystem();
  private missions: MissionSystem;
  private shops: ShopSystem;
  private audio = new SoundEngine();
  private hud: HUD;
  private modMenu: ModMenu;
  private speedMultiplier = 1;

  private clock = new THREE.Clock();
  private elapsed = 0;
  private startedOnce = false;
  private thirdPersonVehicle = false;
  private detentionLockTimer = 0;
  private highScore = 0;
  private rafId = 0;
  private schoolBellTimer = 24;
  private schoolBellHeardOnce = false;
  private mathLessonIdx = 0;

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
    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 760);
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
          id: 'sefa',
          name: 'Sefa',
          role: '6-G Öğrencisi (Yoklama)',
          color: '#57d38c',
          modelKey: 'sefa',
          look: LOOKS.sefa,
          pos: this.schoolSpots.sefaSeat,
          heading: 0, // facing the blackboard
          sit: true,
        },
        this.scene,
      ),
      new FriendlyNPC(
        {
          id: 'betul',
          name: 'Betül',
          role: '6-G Öğrencisi (Yoklama)',
          color: '#a78bfa',
          modelKey: 'betul',
          look: LOOKS.betul,
          pos: this.schoolSpots.betulSeat,
          heading: 0, // facing the blackboard
          sit: true,
        },
        this.scene,
      ),
      new FriendlyNPC(
        {
          id: 'mihrican',
          name: 'Mihri Can',
          role: 'Matematik Öğretmeni • 6-G',
          color: '#38bdf8',
          modelKey: 'mihrican',
          look: LOOKS.mihrican,
          pos: this.schoolSpots.teacherSpot,
          heading: Math.PI, // facing the class
        },
        this.scene,
      ),
      new FriendlyNPC(
        {
          id: 'mert',
          name: 'Mert',
          role: '6-G • Atakent Parkı',
          color: '#34d399',
          modelKey: 'mert',
          look: LOOKS.mert,
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

    this.marketDuo = new MarketDuo(this.scene, this.world.collision, {
      onEnesSpotted: () => {
        this.hud.showToast('Kardeşler Market Önü', 'Bir dakika... Enes Batur mu geçiyor?!', 'gold', 2.4);
      },
      onNisaFreakout: () => {
        this.audio.pickup();
        this.hud.showToast('Nisa: "Aha inanamıyorum!!"', 'Enes Batur tam önlerinden geçiyor!', 'gold', 2.6);
      },
      onPhotoSnap: () => {
        this.audio.cameraShutter();
        this.hud.triggerPhotoMemory(
          'Nisa & Enes Batur Hatırası',
          'Fotoğraf çekildi! Kardeşler Market önünde unutulmaz anı.',
        );
      },
      onSequenceComplete: () => {
        this.hud.showToast('Enes Batur Uzaklaştı', 'Artık Zümra ve Nisa ile [E] tuşuyla konuşabilirsin.', 'green', 3.2);
      },
    });

    // HUD + Audio auto-unlock + Missions
    this.audio.attachAutoUnlock();
    this.hud = new HUD(
      hudHost,
      this.world.map,
      () => {
        this.audio.unlock();
        this.startedOnce = true;
        this.input.requestLock();
      },
      () => {
        this.audio.unlock();
        const muted = this.audio.toggleMute();
        this.hud.showToast(muted ? 'Ses Kapatıldı' : 'Ses Açıldı', '', 'gold', 1.5);
      },
    );
    this.hud.setMuted(this.audio.muted);
    this.audio.onMuteChange = (muted) => this.hud.setMuted(muted);
    window.addEventListener('blur', () => this.audio.silenceLoops());

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
      onInteract: () => this.audio.interact(),
      onKettleStart: () => this.audio.kettleClick(),
      onNoodleReady: () => this.audio.noodleReady(),
      onAddScore: (pts) => {
        this.missions.score += pts;
        this.persistProgress();
      },
      onRestoreStamina: () => {
        this.player.stamina = CONFIG.player.staminaMax;
      },
    });

    this.modMenu = new ModMenu(
      hudHost,
      [
        { id: 'school-front', label: 'Okul Önü' },
        { id: 'shops-parking', label: 'Dükkanlar / Otopark' },
        { id: 'ataturk', label: 'Atatürk Köşesi' },
        { id: 'class-6g', label: '6-G Sınıfı' },
        { id: 'park', label: 'Atakent Parkı' },
      ],
      {
        onToggleOpen: (open) => {
          if (open) {
            if (document.pointerLockElement) document.exitPointerLock();
            this.hud.setPaused(false, this.startedOnce, this.highScore);
            this.audio.silenceLoops();
          } else {
            if (this.startedOnce) {
              this.input.requestLock();
            } else {
              this.hud.setPaused(true, false, this.highScore);
            }
          }
        },
        onSpeedChange: (mult) => {
          this.speedMultiplier = mult;
          this.player.speedMultiplier = mult;
        },
        onTeleport: (id) => this.teleportToPreset(id),
        onCompleteCurrentMission: () => {
          if (!this.missions.completeCurrentMission()) {
            this.hud.showToast('Mod Menü', 'Tüm görevler zaten tamamlanmış.', 'gold');
          }
        },
        onCompleteAllMissions: () => {
          this.missions.completeAllMissions();
          this.hud.showToast('Mod Menü', 'Tüm görevler tamamlandı!', 'green');
        },
        onResetMissions: () => {
          this.missions.restartCampaign();
          this.hud.showToast('Mod Menü', 'Görevler baştan başlatıldı.', 'gold');
        },
        onClearHeat: () => {
          this.heat.clear();
          for (const npc of this.authorities) npc.resetToPatrol();
          this.hud.showToast('Mod Menü', 'Alarm ve takip sıfırlandı.', 'green');
        },
        onGrantPoints: (pts) => {
          this.missions.score += pts;
          this.audio.pickup();
          this.persistProgress();
          this.hud.showToast('Mod Menü', `+${pts} Puan eklendi!`, 'green');
        },
        onGrantMoney: (amount) => {
          this.shops.addMoney(amount);
          this.audio.pickup();
          this.hud.showToast('Mod Menü', `+₺${amount} Harçlık eklendi!`, 'gold');
        },
        onGrantStationery: () => this.shops.grantAllStationery(),
        onGrantHotNoodle: () => this.shops.grantHotNoodle(),
        onRefillStamina: () => {
          this.player.stamina = CONFIG.player.staminaMax;
          this.audio.pickup();
          this.hud.showToast('Mod Menü', 'Enerji %100 dolduruldu!', 'green');
        },
      },
    );

    this.input.onLockChange = (locked) => {
      if (this.modMenu.open) {
        this.hud.setPaused(false, this.startedOnce, this.highScore);
      } else {
        this.hud.setPaused(!locked, this.startedOnce, this.highScore);
      }
      if (!locked) this.audio.silenceLoops();
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

  private teleportToPreset(id: string): void {
    if (this.player.vehicle) {
      this.player.exitVehicle(this.world.collision);
    }
    const targets: Record<string, { pos: THREE.Vector3; yaw: number; label: string }> = {
      'school-front': { pos: new THREE.Vector3(-8, 0, 29.2), yaw: 0, label: 'Okul Önü' },
      'shops-parking': { pos: new THREE.Vector3(73, 0, -4), yaw: -Math.PI / 2, label: 'Dükkanlar / Otopark' },
      ataturk: { pos: new THREE.Vector3(-22.2, 0, -6.2), yaw: 0, label: 'Atatürk Köşesi' },
      'class-6g': { pos: new THREE.Vector3(2.2, 0.6, -22.2), yaw: 0, label: '6-G Sınıfı' },
      park: { pos: new THREE.Vector3(92, 0, 78), yaw: -Math.PI / 4, label: 'Atakent Parkı' },
    };
    const dest = targets[id];
    if (!dest) return;
    this.player.teleport(dest.pos, dest.yaw);
    // Sync camera immediately so the destination is visible right behind the Mod Menu
    this.camera.position.set(dest.pos.x, dest.pos.y + CONFIG.player.eye, dest.pos.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(0, dest.yaw, 0);
    this.hud.showToast('Işınlanıldı', dest.label, 'gold', 2.2);
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
      // Utility toggles (avoid muting on Ctrl+Shift+M Mod Menu shortcut)
      const ctrlHeld = this.input.isDown('ControlLeft') || this.input.isDown('ControlRight');
      if (this.input.wasPressed('KeyM') && !ctrlHeld) {
        const muted = this.audio.toggleMute();
        this.hud.showToast(muted ? 'Ses Kapatıldı' : 'Ses Açıldı', '', 'gold', 1.6);
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
            const exitedKind = this.player.vehicle.kind;
            this.player.exitVehicle(this.world.collision);
            this.audio.vehicleExit(exitedKind);
          } else if (nearV) {
            this.player.enterVehicle(nearV, this.thirdPersonVehicle);
            this.audio.vehicleEnter(nearV.kind);
            this.hud.showToast(nearV.name, 'Sürmek için WASD · Fren: Space · Kamera: [V]', 'green', 2.4);
          }
        }

        // Mission / shop / Zümra & Nisa / Mihri Can math class interaction
        if (this.input.wasPressed('KeyE')) {
          const handled = this.missions.tryInteract(this.player.pos, !!this.player.vehicle);
          if (handled) {
            this.audio.interact();
          } else if (!this.shops.tryInteract(this.player.pos, !!this.player.vehicle)) {
            const duoLines = this.marketDuo.tryInteract(this.player.pos, !!this.player.vehicle);
            if (duoLines) {
              this.audio.interact();
              this.hud.showToast(
                `Zümra: "${duoLines.zumra}"`,
                `Nisa: "${duoLines.nisa}"`,
                'gold',
                4.8,
              );
            } else if (
              !this.player.vehicle &&
              Math.hypot(
                this.player.pos.x - this.schoolSpots.teacherSpot.x,
                this.player.pos.z - this.schoolSpots.teacherSpot.z,
              ) <= 3.2
            ) {
              const mathLines = [
                'Çocuklar kesirlerde payda eşitlemeyi unutmayın: 3/4 + 1/8 = 7/8!',
                'Sefa, Betül tahtadaki 2x + 6 = 14 denklemini kim çözmek ister? x = 4!',
                '6-G harikasınız! Matematik ödevi sayfa 112, 1–10 arası sorular.',
              ];
              const msg = mathLines[this.mathLessonIdx % mathLines.length];
              this.mathLessonIdx += 1;
              this.audio.interact();
              this.hud.showToast('Mihri Can (Matematik Dersi)', msg, 'green', 4.4);
            }
          }
        }
        if (this.input.wasPressed('KeyQ')) {
          this.shops.consumeHotNoodle();
        }

        // Update vehicles + distance visibility culling for FPS
        for (const v of this.vehicles) {
          const dist = Math.hypot(v.pos.x - this.player.pos.x, v.pos.z - this.player.pos.z);
          v.root.visible = v.occupied || dist < 175;
          v.update(dt, v.occupied ? this.input : null, this.world.collision, v.occupied ? this.speedMultiplier : 1);
        }

        // Update player & surface-aware footsteps
        const stepSound = this.player.update(
          dt,
          this.input,
          this.world.collision,
          this.world.hideSpots,
          this.camera,
          this.thirdPersonVehicle,
        );
        if (stepSound) {
          this.audio.footstep(this.player.sprinting, surfaceAt(this.player.pos.x, this.player.pos.z).kind);
        }

        // Engine, tyre skid, crash impact audio & camera shake feedback
        const activeV = this.player.vehicle;
        if (activeV) {
          this.audio.setEngine({
            kind: activeV.kind,
            speed: activeV.speed,
            maxSpeed: activeV.maxSpeed * this.speedMultiplier,
            throttle: activeV.throttle,
          });
          const brakeSkid = activeV.braking && Math.abs(activeV.speed) > 4 ? Math.min(1, Math.abs(activeV.speed) / 14) : 0;
          const slipSkid = activeV.slip > 0.16 && Math.abs(activeV.speed) > 3.5 ? activeV.slip : 0;
          this.audio.setSkid(Math.max(brakeSkid * 0.75, slipSkid));
          if (activeV.impact > 1.8) {
            this.audio.crash(activeV.impact);
            this.player.addShake(Math.min(0.85, activeV.impact / 11));
          } else if (activeV.braking && Math.abs(activeV.speed) > 8) {
            this.player.addShake(0.06 * dt * 10);
          }
        } else {
          this.audio.setEngine(null);
          this.audio.setSkid(0);
        }

        // Zone, ambient school bell & infractions
        const zone = this.currentZone();
        const inSchool = !!zone?.school;
        if (inSchool && !this.schoolBellHeardOnce) {
          this.schoolBellHeardOnce = true;
          this.audio.schoolBell();
        }
        this.schoolBellTimer -= dt;
        if (this.schoolBellTimer <= 0) {
          this.schoolBellTimer = 85;
          if (Math.hypot(this.player.pos.x + 8, this.player.pos.z + 6) < 95) {
            this.audio.schoolBell();
          }
        }
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

        // Friendly NPCs (distance-culled for FPS), Market Duo, Shops (kettle pour loop) & Missions
        for (const f of this.friendlies) {
          const d = Math.hypot(f.pos.x - this.player.pos.x, f.pos.z - this.player.pos.z);
          f.model.root.visible = d < 140;
          if (d < 90) f.update(dt, this.player.pos);
        }
        this.marketDuo.update(dt, this.player.pos);
        this.missions.update(this.elapsed, this.player.pos);
        if (this.shops.update(dt, this.elapsed)) {
          this.audio.boilBubble();
        }
        this.audio.setPour(this.shops.noodleState === 'boiling');
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
    const duoPrompt =
      missionPrompt || shopPrompt ? null : this.marketDuo.getPrompt(this.player.pos, !!this.player.vehicle);
    const teacherPrompt =
      missionPrompt || shopPrompt || duoPrompt || this.player.vehicle
        ? null
        : Math.hypot(
              this.player.pos.x - this.schoolSpots.teacherSpot.x,
              this.player.pos.z - this.schoolSpots.teacherSpot.z,
            ) <= 3.2
          ? 'Mihri Can’ın Matematik Dersini Dinle'
          : null;
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
      interactPrompt: missionPrompt ?? shopPrompt ?? duoPrompt ?? teacherPrompt,
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
    this.modMenu.dispose();
    this.renderer.dispose();
  }
}
