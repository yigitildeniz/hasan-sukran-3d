import * as THREE from 'three';
import { beamTexture } from '../world/textures';
import type { SchoolSpots } from '../world/School';
import type { AtakentSpots } from '../world/Atakent';

export interface MissionHUDState {
  index: number;
  total: number;
  title: string;
  objective: string;
  hint: string;
  completedAll: boolean;
  score: number;
  targetPos: THREE.Vector3 | null;
  targetColor: string;
}

export interface MissionCallbacks {
  onToast: (title: string, detail?: string, tone?: 'gold' | 'green' | 'red') => void;
  onMissionComplete: (title: string, reward: number) => void;
  onPickup: () => void;
}

interface PageItem {
  pos: THREE.Vector3;
  mesh: THREE.Group;
  collected: boolean;
}

/**
 * 3-mission starter campaign for Atakent: Okul Hikâyesi:
 * 1. "Sabah Yoklaması: 6-G" — Enter school, attend Mihrican's math class & check in with Sefa & Betül.
 * 2. "Kayıp Sınav Kâğıtları" — Recover 3 blown-away study pages in the school grounds & return to 6-G.
 * 3. "Atakent Simit Operasyonu" — Ride a vehicle to Simitçi Amca, deliver warm simits to Mert in Atakent Park, return to Kantin.
 */
export class MissionSystem {
  missionIndex = 0; // 0, 1, 2; 3 = free roam
  step = 0;
  score = 0;
  completedMissions = 0;

  private marker: THREE.Group;
  private markerMat: THREE.MeshBasicMaterial;
  private ringMesh: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;
  private pages: PageItem[] = [];
  private activeTarget: THREE.Vector3 | null = null;
  private targetColor = '#f5c542';
  private interactLabel: string | null = null;
  private interactPos: THREE.Vector3 | null = null;
  private interactRadius = 2.6;

  constructor(
    scene: THREE.Scene,
    private school: SchoolSpots,
    private atakent: AtakentSpots,
    private cb: MissionCallbacks,
  ) {
    // Glowing GTA-style objective beam + ground ring
    this.marker = new THREE.Group();
    this.markerMat = new THREE.MeshBasicMaterial({
      map: beamTexture(),
      color: '#f5c542',
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.95, 16, 20, 1, true), this.markerMat);
    beam.position.y = 8;
    this.ringMat = new THREE.MeshBasicMaterial({
      color: '#f5c542',
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    this.ringMesh = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.15, 32).rotateX(-Math.PI / 2), this.ringMat);
    this.ringMesh.position.y = 0.08;
    this.marker.add(beam, this.ringMesh);
    scene.add(this.marker);

    // Collectible study pages for Mission 2
    const paperMat = new THREE.MeshStandardMaterial({
      color: '#fffdf2',
      emissive: '#f5c542',
      emissiveIntensity: 0.45,
      roughness: 0.4,
    });
    for (const p of this.school.pages) {
      const g = new THREE.Group();
      const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 0.56), paperMat);
      sheet.rotation.z = 0.2;
      const halo = new THREE.Mesh(
        new THREE.RingGeometry(0.45, 0.62, 20).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: '#57d38c', side: THREE.DoubleSide, transparent: true, opacity: 0.8 }),
      );
      halo.position.y = -0.78;
      g.add(sheet, halo);
      g.position.set(p.x, p.y + 0.88, p.z);
      g.visible = false;
      scene.add(g);
      this.pages.push({ pos: p.clone(), mesh: g, collected: false });
    }

    this.setupMission(0);
  }

  restartCampaign(): void {
    this.score = 0;
    this.completedMissions = 0;
    this.setupMission(0);
  }

  /** Dev/Mod Menu helper: immediately completes the currently active mission. */
  completeCurrentMission(): boolean {
    if (this.missionIndex === 0) {
      this.completeMission('Sabah Yoklaması: 6-G', 250);
      this.setupMission(1);
      return true;
    }
    if (this.missionIndex === 1) {
      for (const p of this.pages) {
        p.collected = true;
        p.mesh.visible = false;
      }
      this.completeMission('Kayıp Sınav Kâğıtları', 350);
      this.setupMission(2);
      return true;
    }
    if (this.missionIndex === 2) {
      this.completeMission('Atakent Simit Operasyonu', 500);
      this.setupMission(3);
      return true;
    }
    return false;
  }

  /** Dev/Mod Menu helper: completes all remaining missions at once. */
  completeAllMissions(): void {
    while (this.missionIndex < 3) {
      this.completeCurrentMission();
    }
  }

  private setupMission(index: number): void {
    this.missionIndex = index;
    this.step = 0;
    for (const p of this.pages) {
      p.collected = false;
      p.mesh.visible = index === 1;
    }
    this.refreshTarget();
  }

  private refreshTarget(): void {
    this.interactLabel = null;
    this.interactPos = null;
    this.interactRadius = 2.8;

    if (this.missionIndex === 0) {
      this.targetColor = '#f5c542';
      if (this.step === 0) {
        this.activeTarget = this.school.entrance;
      } else {
        this.activeTarget = this.school.sefaSeat;
        this.interactLabel = 'Sefa & Betül ile yoklama ver (6-G)';
        this.interactPos = this.school.sefaSeat;
        this.interactRadius = 3.4;
      }
    } else if (this.missionIndex === 1) {
      this.targetColor = '#57d38c';
      const remaining = this.pages.find((p) => !p.collected);
      if (remaining) {
        this.activeTarget = remaining.pos;
        this.interactLabel = 'Kayıp sınav notunu al';
        this.interactPos = remaining.pos;
        this.interactRadius = 2.4;
      } else {
        this.targetColor = '#f5c542';
        this.activeTarget = this.school.desk6G;
        this.interactLabel = 'Notları 6-G sırasına bırak';
        this.interactPos = this.school.desk6G;
        this.interactRadius = 3.0;
      }
    } else if (this.missionIndex === 2) {
      this.targetColor = '#ff7b54';
      if (this.step === 0) {
        this.activeTarget = this.atakent.simitCart;
        this.interactLabel = 'Simitçi Amca’dan sıcak simit al';
        this.interactPos = this.atakent.simitCart;
        this.interactRadius = 4.2;
      } else if (this.step === 1) {
        this.activeTarget = this.atakent.parkFriend;
        this.interactLabel = 'Mert’e simitleri teslim et';
        this.interactPos = this.atakent.parkFriend;
        this.interactRadius = 4.2;
      } else {
        this.targetColor = '#57d38c';
        this.activeTarget = this.school.kantin;
        this.interactLabel = 'Kantin’de soluklan ve görevi bitir';
        this.interactPos = this.school.kantin;
        this.interactRadius = 3.6;
      }
    } else {
      this.activeTarget = null;
    }

    if (this.activeTarget) {
      this.marker.visible = true;
      this.marker.position.copy(this.activeTarget);
      this.markerMat.color.set(this.targetColor);
      this.ringMat.color.set(this.targetColor);
    } else {
      this.marker.visible = false;
    }
  }

  /** Returns prompt text if the player can press [E] right now. */
  getInteractionPrompt(playerPos: THREE.Vector3): string | null {
    if (!this.interactLabel || !this.interactPos) return null;
    const d = Math.hypot(playerPos.x - this.interactPos.x, playerPos.z - this.interactPos.z);
    return d <= this.interactRadius ? this.interactLabel : null;
  }

  /** Call when player presses [E]. Returns true if an interaction happened. */
  tryInteract(playerPos: THREE.Vector3, inVehicle: boolean): boolean {
    if (!this.interactLabel || !this.interactPos) return false;
    const d = Math.hypot(playerPos.x - this.interactPos.x, playerPos.z - this.interactPos.z);
    if (d > this.interactRadius) return false;

    if (this.missionIndex === 0 && this.step === 1) {
      this.completeMission('Sabah Yoklaması: 6-G', 250);
      this.setupMission(1);
      this.cb.onToast('Yeni Görev', 'Bahçeye uçan 3 sınav kâğıdını topla!', 'green');
      return true;
    }

    if (this.missionIndex === 1) {
      const targetPage = this.pages.find(
        (p) => !p.collected && Math.hypot(playerPos.x - p.pos.x, playerPos.z - p.pos.z) <= 2.6,
      );
      if (targetPage) {
        targetPage.collected = true;
        targetPage.mesh.visible = false;
        this.score += 75;
        this.cb.onPickup();
        const done = this.pages.filter((p) => p.collected).length;
        this.cb.onToast(`Not Alındı (${done}/${this.pages.length})`, done === this.pages.length ? 'Şimdi 6-G sınıfına dön!' : 'Diğer kâğıdı bul.', 'green');
        this.refreshTarget();
        return true;
      }
      if (this.pages.every((p) => p.collected)) {
        this.completeMission('Kayıp Sınav Kâğıtları', 350);
        this.setupMission(2);
        this.cb.onToast('Yeni Görev', 'Bir scooter/araca [F] ile bin ve Atakent Caddesi’ne git!', 'gold');
        return true;
      }
    }

    if (this.missionIndex === 2) {
      if (this.step === 0) {
        this.step = 1;
        this.score += 100;
        this.cb.onPickup();
        this.cb.onToast('Sıcak Simitler Alındı', 'Atakent Parkı’ndaki Mert’e ulaştır!' + (inVehicle ? '' : ' ([F] ile araca binebilirsin)'), 'gold');
        this.refreshTarget();
        return true;
      }
      if (this.step === 1) {
        this.step = 2;
        this.score += 150;
        this.cb.onPickup();
        this.cb.onToast('Mert: Süpersin!', 'Şimdi okul bahçesindeki Kantin’e dön.', 'green');
        this.refreshTarget();
        return true;
      }
      if (this.step === 2) {
        this.completeMission('Atakent Simit Operasyonu', 500);
        this.setupMission(3);
        this.cb.onToast('Tüm Başlangıç Görevleri Tamamlandı!', 'Atakent’te serbest gezebilir veya [R] ile görevleri baştan oynayabilirsin.', 'gold');
        return true;
      }
    }

    return false;
  }

  private completeMission(title: string, reward: number): void {
    this.score += reward;
    this.completedMissions = Math.max(this.completedMissions, this.missionIndex + 1);
    this.cb.onMissionComplete(title, reward);
  }

  update(t: number, playerPos: THREE.Vector3): void {
    // Animate marker
    if (this.marker.visible) {
      const s = 1 + Math.sin(t * 4) * 0.14;
      this.ringMesh.scale.set(s, s, 1);
      this.marker.rotation.y = t * 0.6;
    }

    // Animate collectible pages & auto-point nearest page
    if (this.missionIndex === 1) {
      let nearest: PageItem | null = null;
      let bestDist = Infinity;
      for (const p of this.pages) {
        if (p.collected) continue;
        p.mesh.position.y = p.pos.y + 0.85 + Math.sin(t * 3 + p.pos.x) * 0.14;
        p.mesh.rotation.y = t * 1.4;
        const d = Math.hypot(playerPos.x - p.pos.x, playerPos.z - p.pos.z);
        if (d < bestDist) {
          bestDist = d;
          nearest = p;
        }
      }
      if (nearest && this.activeTarget !== nearest.pos) {
        this.activeTarget = nearest.pos;
        this.interactPos = nearest.pos;
        this.marker.position.copy(nearest.pos);
      }
    }

    // Automatic waypoint transition on Mission 1 step 0 (reaching entrance)
    if (this.missionIndex === 0 && this.step === 0) {
      const d = Math.hypot(playerPos.x - this.school.entrance.x, playerPos.z - this.school.entrance.z);
      if (d < 3.6) {
        this.step = 1;
        this.cb.onToast('Okula Girdin', 'Mihrican’ın matematik dersine yetiş — 6-G’de Sefa & Betül yan yana seni bekliyor!', 'gold');
        this.refreshTarget();
      }
    }
  }

  hudState(): MissionHUDState {
    if (this.missionIndex === 0) {
      return {
        index: 1,
        total: 3,
        title: 'Sabah Yoklaması: 6-G',
        objective: this.step === 0 ? 'Okulun ana giriş kapısından içeri gir' : '6-G sınıfında yan yana oturan Sefa & Betül ile yoklama ver [E]',
        hint: 'Mihrican Matematik dersini anlatıyor; koridorda koşmadan sınıfa gir!',
        completedAll: false,
        score: this.score,
        targetPos: this.activeTarget,
        targetColor: this.targetColor,
      };
    }
    if (this.missionIndex === 1) {
      const got = this.pages.filter((p) => p.collected).length;
      return {
        index: 2,
        total: 3,
        title: 'Kayıp Sınav Kâğıtları',
        objective:
          got < this.pages.length
            ? `Bahçeye uçan sınav notlarını topla (${got}/${this.pages.length}) [E]`
            : 'Toplanan notları 6-G sınıfına götür [E]',
        hint: 'Çalıların içinde [C] ile eğilerek gizlenebilirsin.',
        completedAll: false,
        score: this.score,
        targetPos: this.activeTarget,
        targetColor: this.targetColor,
      };
    }
    if (this.missionIndex === 2) {
      const obj =
        this.step === 0
          ? 'Atakent Caddesi’ndeki Simitçi Amca’ya git [E]'
          : this.step === 1
            ? 'Atakent Parkı’ndaki Mert’e simitleri götür [E]'
            : 'Okul bahçesindeki Kantin’e dön [E]';
      return {
        index: 3,
        total: 3,
        title: 'Atakent Simit Operasyonu',
        objective: obj,
        hint: 'Scooter veya arabaya [F] ile bin; [V] ile kamera açısını değiştir.',
        completedAll: false,
        score: this.score,
        targetPos: this.activeTarget,
        targetColor: this.targetColor,
      };
    }
    return {
      index: 3,
      total: 3,
      title: 'Serbest Keşif — Atakent',
      objective: 'Okulu ve Etimesgut Atakent sokaklarını dilediğince keşfet',
      hint: 'Okul yanındaki Aktaş Kırtasiye ve Kardeşler Market’e uğra, veya [R] ile görevleri sıfırla.',
      completedAll: true,
      score: this.score,
      targetPos: null,
      targetColor: '#57d38c',
    };
  }
}
