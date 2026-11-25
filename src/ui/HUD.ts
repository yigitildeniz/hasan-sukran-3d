import type * as THREE from 'three';
import './styles.css';
import { Minimap } from './Minimap';
import type { MapFeature } from '../world/types';
import type { AuthorityNPC } from '../entities/AuthorityNPC';
import type { Vehicle } from '../entities/Vehicle';
import type { HeatSnapshot } from '../systems/HeatSystem';
import type { MissionHUDState } from '../systems/MissionSystem';
import type { ShopHUDState } from '../systems/ShopSystem';

export interface HUDUpdate {
  playerPos: THREE.Vector3;
  playerYaw: number;
  staminaRatio: number;
  hidden: boolean;
  zoneLabel: string;
  vehicle: Vehicle | null;
  thirdPerson: boolean;
  heat: HeatSnapshot;
  mission: MissionHUDState;
  shop: ShopHUDState;
  interactPrompt: string | null;
  vehiclePrompt: string | null;
  consumePrompt: string | null;
  npcs: AuthorityNPC[];
  vehicles: Vehicle[];
  time: number;
}

/**
 * Sleek GTA 6-inspired translucent HUD:
 * - Top-left: rotating radar minimap, zone name, stealth badge, stamina bar
 * - Top-right: 3-star discipline heat meter, score, vehicle speedometer
 * - Left: active mission tracker card
 * - Bottom-center: [E] / [F] contextual prompts
 * - Overlays: Start/Pause modal + Detention banner + Toast notifications
 */
export class HUD {
  readonly minimap: Minimap;

  private zoneNameEl: HTMLElement;
  private stealthEl: HTMLElement;
  private staminaFillEl: HTMLElement;
  private starsEls: HTMLElement[];
  private heatLabelEl: HTMLElement;
  private scoreValEl: HTMLElement;
  private speedCardEl: HTMLElement;
  private speedNumEl: HTMLElement;
  private vehicleNameEl: HTMLElement;
  private missionKickerEl: HTMLElement;
  private missionTitleEl: HTMLElement;
  private missionObjEl: HTMLElement;
  private missionHintEl: HTMLElement;
  private promptEEl: HTMLElement;
  private promptETextEl: HTMLElement;
  private promptFEl: HTMLElement;
  private promptFTextEl: HTMLElement;
  private promptQEl: HTMLElement;
  private promptQTextEl: HTMLElement;
  private moneyTagEl: HTMLElement;
  private bagTagEl: HTMLElement;
  private noodleStatusEl: HTMLElement;
  private noodleTextEl: HTMLElement;
  private boilTrackEl: HTMLElement;
  private boilFillEl: HTMLElement;
  private toastBoxEl: HTMLElement;
  private toastTitleEl: HTMLElement;
  private toastDetailEl: HTMLElement;
  private overlayEl: HTMLElement;
  private playBtnEl: HTMLButtonElement;
  private overlaySubEl: HTMLElement;
  private detentionEl: HTMLElement;
  private detentionSubEl: HTMLElement;

  private toastTimer = 0;

  constructor(container: HTMLElement, mapFeatures: MapFeature[], onPlayClick: () => void) {
    this.minimap = new Minimap(mapFeatures);

    container.innerHTML = `
      <div class="hud-top-left">
        <div class="hud-panel radar-wrap">
          <span class="radar-cardinal n">K</span>
          <span class="radar-cardinal s">G</span>
          <span class="radar-cardinal w">B</span>
          <span class="radar-cardinal e">D</span>
        </div>
        <div class="hud-panel zone-strip">
          <div class="zone-row">
            <span class="zone-name">Atakent Caddesi</span>
            <span class="stealth-pill">GİZLENDİN</span>
          </div>
          <div class="stamina-track"><div class="stamina-fill"></div></div>
        </div>
      </div>

      <div class="hud-top-right">
        <div class="hud-panel status-card">
          <div class="heat-group">
            <div class="stars-row">
              <span class="star">★</span>
              <span class="star">★</span>
              <span class="star">★</span>
            </div>
            <span class="heat-label">Sakin</span>
          </div>
          <div class="score-box">
            <div class="score-val">0</div>
            <div class="score-sub">Puan</div>
          </div>
        </div>
        <div class="hud-panel bag-card">
          <div class="bag-row">
            <span class="money-tag">₺150</span>
            <span class="bag-tag">Kırtasiye: 0/3</span>
          </div>
          <div class="noodle-status">
            <span class="noodle-text"></span>
            <div class="boil-track"><div class="boil-fill"></div></div>
          </div>
        </div>
        <div class="hud-panel speed-card">
          <span class="speed-num">0</span>
          <span class="speed-unit">km/s</span>
          <span class="vehicle-name">Scooter</span>
        </div>
      </div>

      <div class="hud-panel mission-card">
        <div class="mission-kicker">GÖREV 1 / 3</div>
        <div class="mission-title">Sabah Yoklaması: 6-G</div>
        <div class="mission-obj">Okulun ana giriş kapısından içeri gir</div>
        <div class="mission-hint"></div>
      </div>

      <div class="crosshair"></div>

      <div class="hud-panel toast-box gold">
        <div class="toast-title"></div>
        <div class="toast-detail"></div>
      </div>

      <div class="prompt-stack">
        <div class="hud-panel prompt-pill" data-prompt="e">
          <span class="keycap">E</span>
          <span class="prompt-text"></span>
        </div>
        <div class="hud-panel prompt-pill" data-prompt="q">
          <span class="keycap">Q</span>
          <span class="prompt-text"></span>
        </div>
        <div class="hud-panel prompt-pill" data-prompt="f">
          <span class="keycap">F</span>
          <span class="prompt-text"></span>
        </div>
      </div>

      <div class="hud-panel controls-bar">
        <span><b>WASD</b> Hareket</span>
        <span><b>Shift</b> Koş</span>
        <span><b>C</b> Eğil/Gizlen</span>
        <span><b>E</b> Al/Etkileş</span>
        <span><b>F</b> Araç</span>
        <span><b>V</b> Kamera</span>
        <span><b>M</b> Ses</span>
      </div>

      <div class="detention-banner">
        <div class="detention-title">YAKALANDIN!</div>
        <div class="detention-sub">Müdür Odası’nda kısa bir uyarı aldın...</div>
      </div>

      <div class="overlay">
        <div class="overlay-card">
          <div class="brand-tag">ETİMESGUT • ATAKENT MAHALLESİ</div>
          <h1>Atakent: Okul Hikâyesi</h1>
          <p class="overlay-sub">
            Hasan Şükran Saruhan Ortaokulu ve Ankara Etimesgut Atakent sokaklarında geçen 3D açık dünya okul simülasyonu.
            Müdür Mehmet Sait Bildirici, Bülent Hoca ve Ragıp Hoca’ya yakalanmadan görevleri tamamla; okul yanındaki dükkanlara uğra!
          </p>
          <div class="keys-grid">
            <div><span class="keycap">WASD</span> Yürü / Sür</div>
            <div><span class="keycap">Shift</span> Koş (Bahçede dikkat!)</div>
            <div><span class="keycap">Space</span> Zıpla / Fren</div>
            <div><span class="keycap">C</span> Eğil ve Çalıda Gizlen</div>
            <div><span class="keycap">E</span> Etkileşim / Görev</div>
            <div><span class="keycap">F</span> Araca Bin / İn</div>
            <div><span class="keycap">V</span> Araç Kamerası (1./3. Şahıs)</div>
            <div><span class="keycap">Esc</span> Duraklat</div>
          </div>
          <button class="play-btn" type="button">OYUNA BAŞLA</button>
        </div>
      </div>
    `;

    const radarWrap = container.querySelector('.radar-wrap')!;
    radarWrap.prepend(this.minimap.canvas);

    this.zoneNameEl = container.querySelector('.zone-name')!;
    this.stealthEl = container.querySelector('.stealth-pill')!;
    this.staminaFillEl = container.querySelector('.stamina-fill')!;
    this.starsEls = Array.from(container.querySelectorAll('.star'));
    this.heatLabelEl = container.querySelector('.heat-label')!;
    this.scoreValEl = container.querySelector('.score-val')!;
    this.speedCardEl = container.querySelector('.speed-card')!;
    this.speedNumEl = container.querySelector('.speed-num')!;
    this.vehicleNameEl = container.querySelector('.vehicle-name')!;
    this.missionKickerEl = container.querySelector('.mission-kicker')!;
    this.missionTitleEl = container.querySelector('.mission-title')!;
    this.missionObjEl = container.querySelector('.mission-obj')!;
    this.missionHintEl = container.querySelector('.mission-hint')!;
    this.promptEEl = container.querySelector('[data-prompt="e"]')!;
    this.promptETextEl = this.promptEEl.querySelector('.prompt-text')!;
    this.promptQEl = container.querySelector('[data-prompt="q"]')!;
    this.promptQTextEl = this.promptQEl.querySelector('.prompt-text')!;
    this.promptFEl = container.querySelector('[data-prompt="f"]')!;
    this.promptFTextEl = this.promptFEl.querySelector('.prompt-text')!;
    this.moneyTagEl = container.querySelector('.money-tag')!;
    this.bagTagEl = container.querySelector('.bag-tag')!;
    this.noodleStatusEl = container.querySelector('.noodle-status')!;
    this.noodleTextEl = container.querySelector('.noodle-text')!;
    this.boilTrackEl = container.querySelector('.boil-track')!;
    this.boilFillEl = container.querySelector('.boil-fill')!;
    this.toastBoxEl = container.querySelector('.toast-box')!;
    this.toastTitleEl = container.querySelector('.toast-title')!;
    this.toastDetailEl = container.querySelector('.toast-detail')!;
    this.overlayEl = container.querySelector('.overlay')!;
    this.playBtnEl = container.querySelector('.play-btn')!;
    this.overlaySubEl = container.querySelector('.overlay-sub')!;
    this.detentionEl = container.querySelector('.detention-banner')!;
    this.detentionSubEl = container.querySelector('.detention-sub')!;

    this.playBtnEl.addEventListener('click', () => onPlayClick());
  }

  setPaused(paused: boolean, startedOnce: boolean, highScore = 0): void {
    this.overlayEl.classList.toggle('hidden', !paused);
    if (startedOnce) {
      this.playBtnEl.textContent = 'DEVAM ET';
      if (highScore > 0) {
        this.overlaySubEl.textContent = `Oyun duraklatıldı. En yüksek skor: ${highScore} puan. Devam etmek için tıkla.`;
      }
    }
  }

  showToast(title: string, detail = '', tone: 'gold' | 'green' | 'red' = 'gold', seconds = 3.8): void {
    this.toastBoxEl.className = `hud-panel toast-box ${tone} visible`;
    this.toastTitleEl.textContent = title;
    this.toastDetailEl.textContent = detail;
    this.toastTimer = seconds;
  }

  showDetention(officerName: string, message: string): void {
    this.detentionSubEl.textContent = `${officerName}: "${message}" — Koridorda kısa bir uyarı aldın!`;
    this.detentionEl.classList.add('visible');
    setTimeout(() => this.detentionEl.classList.remove('visible'), 2500);
  }

  update(dt: number, state: HUDUpdate): void {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastBoxEl.classList.remove('visible');
    }

    this.zoneNameEl.textContent = state.zoneLabel;
    this.stealthEl.classList.toggle('active', state.hidden);
    this.staminaFillEl.style.width = `${Math.round(state.staminaRatio * 100)}%`;

    // Heat stars
    const { stars, seen, reason } = state.heat;
    this.starsEls.forEach((el, idx) => {
      const lit = idx < stars;
      el.classList.toggle('lit', lit && !seen);
      el.classList.toggle('chased', lit && seen);
    });
    this.heatLabelEl.classList.toggle('alert', stars > 0);
    this.heatLabelEl.textContent =
      stars === 0
        ? 'Sakin'
        : seen
          ? reason || 'Takip Ediliyorsun!'
          : 'Gözden Kayboldun — Bekle';

    this.scoreValEl.textContent = String(state.mission.score);

    // Shop / pocket money / noodle kettle status
    this.moneyTagEl.textContent = `₺${state.shop.money}`;
    this.bagTagEl.textContent = `Kırtasiye: ${state.shop.stationeryCount}/${state.shop.stationeryTotal}`;
    if (state.shop.noodleState === 'none') {
      this.noodleStatusEl.classList.remove('visible');
    } else {
      this.noodleStatusEl.classList.add('visible');
      if (state.shop.noodleState === 'raw') {
        this.noodleTextEl.textContent = 'Noodle (Sıcak su ekle)';
        this.boilTrackEl.style.display = 'none';
      } else if (state.shop.noodleState === 'boiling') {
        this.noodleTextEl.textContent = `Su Kaynıyor… %${Math.round(state.shop.boilProgress * 100)}`;
        this.boilTrackEl.style.display = 'block';
        this.boilFillEl.style.width = `${Math.round(state.shop.boilProgress * 100)}%`;
      } else {
        this.noodleTextEl.textContent = 'Sıcak Noodle Hazır! [Q]';
        this.boilTrackEl.style.display = 'block';
        this.boilFillEl.style.width = '100%';
      }
    }

    // Vehicle HUD
    if (state.vehicle) {
      this.speedCardEl.classList.add('visible');
      this.speedNumEl.textContent = String(state.vehicle.kmh);
      this.vehicleNameEl.textContent = `${state.vehicle.name} · ${state.thirdPerson ? '3. Şahıs' : '1. Şahıs'}`;
    } else {
      this.speedCardEl.classList.remove('visible');
    }

    // Mission card
    this.missionKickerEl.textContent = state.mission.completedAll
      ? 'SERBEST MOD'
      : `GÖREV ${state.mission.index} / ${state.mission.total}`;
    this.missionTitleEl.textContent = state.mission.title;
    this.missionObjEl.textContent = state.mission.objective;
    this.missionHintEl.textContent = state.mission.hint;

    // Context prompts
    if (state.interactPrompt) {
      this.promptEEl.classList.add('visible');
      this.promptETextEl.textContent = state.interactPrompt;
    } else {
      this.promptEEl.classList.remove('visible');
    }

    if (state.consumePrompt) {
      this.promptQEl.classList.add('visible');
      this.promptQTextEl.textContent = state.consumePrompt;
    } else {
      this.promptQEl.classList.remove('visible');
    }

    if (state.vehiclePrompt) {
      this.promptFEl.classList.add('visible');
      this.promptFTextEl.textContent = state.vehiclePrompt;
    } else {
      this.promptFEl.classList.remove('visible');
    }

    // Minimap
    this.minimap.render(
      state.playerPos,
      state.playerYaw,
      !!state.vehicle,
      state.npcs,
      state.vehicles,
      state.mission.targetPos,
      state.mission.targetColor,
      state.time,
    );
  }
}
