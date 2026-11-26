import type * as THREE from 'three';
import type { CommercialSpots } from '../world/CommercialStrip';

export type NoodleState = 'none' | 'raw' | 'boiling' | 'hot';

export interface ShopHUDState {
  money: number;
  stationeryCount: number;
  stationeryTotal: number;
  noodleState: NoodleState;
  boilProgress: number; // 0..1
}

export interface ShopCallbacks {
  onToast: (title: string, detail?: string, tone?: 'gold' | 'green' | 'red') => void;
  onPickup: () => void;
  onInteract?: () => void;
  onKettleStart?: () => void;
  onNoodleReady?: () => void;
  onAddScore: (pts: number) => void;
  onRestoreStamina: () => void;
}

const BOIL_DURATION = 3.5;
const NOODLE_PRICE = 30;

/**
 * Handles interactive neighborhood shops beside Hasan Şükran Saruhan Ortaokulu:
 * - Aktaş Kırtasiye: buy a small set of stationery items
 * - Manav & Kasap: rich visual storefront, no purchasing allowed
 * - Kardeşler Market: buy noodle -> boil/pour hot water at kettle -> consume hot noodle
 */
export class ShopSystem {
  money = 150;
  readonly stationeryOwned = new Set<string>();
  noodleState: NoodleState = 'none';
  boilProgress = 0;

  private boilTimer = 0;
  private bubbleTick = 0;

  constructor(private spots: CommercialSpots, private cb: ShopCallbacks) {}

  addMoney(amount: number): void {
    this.money += amount;
  }

  /** Dev/Mod Menu helper: grants all Aktaş Kırtasiye stationery items. */
  grantAllStationery(): void {
    for (const item of this.spots.stationery) {
      this.stationeryOwned.add(item.id);
    }
    this.cb.onPickup();
    this.cb.onToast('Mod Menü', 'Tüm Aktaş Kırtasiye ürünleri çantana eklendi!', 'green');
  }

  /** Dev/Mod Menu helper: gives a ready-to-drink hot noodle cup. */
  grantHotNoodle(): void {
    this.noodleState = 'hot';
    this.boilProgress = 1;
    this.boilTimer = BOIL_DURATION;
    this.cb.onPickup();
    this.cb.onToast('Mod Menü', 'Hazır Sıcak Noodle eklendi! İçmek için [Q] tuşuna bas.', 'green');
  }

  /** Returns [E] prompt text when player is near a shop counter/shelf/kettle. */
  getPrompt(playerPos: THREE.Vector3, inVehicle: boolean): string | null {
    if (inVehicle) return null;

    // 1) Aktaş Kırtasiye stands
    for (const item of this.spots.stationery) {
      if (Math.hypot(playerPos.x - item.pos.x, playerPos.z - item.pos.z) <= 2.3) {
        if (this.stationeryOwned.has(item.id)) {
          return `${item.name} (Zaten alındı)`;
        }
        return `${item.name} satın al (₺${item.price})`;
      }
    }

    // 2) Manav & Kasap (view-only, purchasing disabled)
    if (Math.hypot(playerPos.x - this.spots.manavKasap.x, playerPos.z - this.spots.manavKasap.z) <= 3.2) {
      return 'Manav & Kasap — Şu an satış yok';
    }

    // 3) Kardeşler Market — Noodle shelf
    if (Math.hypot(playerPos.x - this.spots.noodleShelf.x, playerPos.z - this.spots.noodleShelf.z) <= 2.5) {
      if (this.noodleState === 'none') {
        return `Noodle satın al (₺${NOODLE_PRICE})`;
      }
      if (this.noodleState === 'raw') {
        return 'Noodle elinde — Sıcak Su (Kettle) köşesine git';
      }
      if (this.noodleState === 'boiling') {
        return 'Kettle’da su kaynıyor...';
      }
      return 'Sıcak Noodle hazır! İçmek için [Q]';
    }

    // 4) Kardeşler Market — Hot water / Kettle counter
    if (Math.hypot(playerPos.x - this.spots.kettleStation.x, playerPos.z - this.spots.kettleStation.z) <= 2.6) {
      if (this.noodleState === 'raw') {
        return 'Suyu kaynat ve Noodle’a sıcak su doldur';
      }
      if (this.noodleState === 'boiling') {
        return `Sıcak su dolduruluyor (%${Math.round(this.boilProgress * 100)})`;
      }
      if (this.noodleState === 'hot') {
        return 'Sıcak Noodle’ı al ve iç';
      }
      return 'Sıcak Su (Kettle) — Önce Noodle Rafı’ndan noodle al';
    }

    return null;
  }

  /** Handles [E] press at any shop spot. Returns true if handled. */
  tryInteract(playerPos: THREE.Vector3, inVehicle: boolean): boolean {
    if (inVehicle) return false;

    // 1) Aktaş Kırtasiye
    for (const item of this.spots.stationery) {
      if (Math.hypot(playerPos.x - item.pos.x, playerPos.z - item.pos.z) <= 2.3) {
        if (this.stationeryOwned.has(item.id)) {
          this.cb.onToast('Aktaş Kırtasiye', `${item.name} zaten çantanda.`, 'gold');
          return true;
        }
        if (this.money < item.price) {
          this.cb.onToast('Yetersiz Harçlık', `${item.name} için ₺${item.price} gerekiyor.`, 'red');
          return true;
        }
        this.money -= item.price;
        this.stationeryOwned.add(item.id);
        this.cb.onPickup();
        this.cb.onAddScore(40);
        this.cb.onToast(
          `Aktaş Kırtasiye: ${item.name} Alındı`,
          `Kalan harçlık: ₺${this.money} • (${this.stationeryOwned.size}/${this.spots.stationery.length} ürün)`,
          'green',
        );
        return true;
      }
    }

    // 2) Manav & Kasap — non-purchasable
    if (Math.hypot(playerPos.x - this.spots.manavKasap.x, playerPos.z - this.spots.manavKasap.z) <= 3.2) {
      this.cb.onInteract?.();
      this.cb.onToast('Manav & Kasap', 'Şu an perakende satış yapılmıyor (buradan ürün satın alınamaz).', 'gold');
      return true;
    }

    // 3) Kardeşler Market — Noodle shelf
    if (Math.hypot(playerPos.x - this.spots.noodleShelf.x, playerPos.z - this.spots.noodleShelf.z) <= 2.5) {
      if (this.noodleState === 'none') {
        if (this.money < NOODLE_PRICE) {
          this.cb.onToast('Yetersiz Harçlık', `Noodle almak için ₺${NOODLE_PRICE} gerekiyor.`, 'red');
          return true;
        }
        this.money -= NOODLE_PRICE;
        this.noodleState = 'raw';
        this.boilProgress = 0;
        this.cb.onPickup();
        this.cb.onToast(
          'Kardeşler Market: Noodle Alındı!',
          'Şimdi hemen yandaki Sıcak Su / Kettle tezgahında suyu kaynat ve doldur.',
          'green',
        );
        return true;
      }
      if (this.noodleState === 'raw') {
        this.cb.onToast('Sıcak Su Gerekli', 'Kettle tezgahına gidip [E] ile suyu kaynat!', 'gold');
        return true;
      }
      if (this.noodleState === 'hot') {
        return this.consumeHotNoodle();
      }
      return true;
    }

    // 4) Kardeşler Market — Kettle / Hot Water station
    if (Math.hypot(playerPos.x - this.spots.kettleStation.x, playerPos.z - this.spots.kettleStation.z) <= 2.6) {
      if (this.noodleState === 'raw') {
        this.noodleState = 'boiling';
        this.boilTimer = 0;
        this.boilProgress = 0;
        this.cb.onKettleStart?.();
        this.cb.onToast('Kettle Çalıştı!', 'Su kaynıyor ve noodle bardağına sıcak su ekleniyor...', 'gold');
        return true;
      }
      if (this.noodleState === 'boiling') {
        this.cb.onToast('Hazırlanıyor...', `Sıcak su ekleniyor (%${Math.round(this.boilProgress * 100)})`, 'gold');
        return true;
      }
      if (this.noodleState === 'hot') {
        return this.consumeHotNoodle();
      }
      this.cb.onInteract?.();
      this.cb.onToast('Kardeşler Market', 'Önce Noodle Rafı’ndan noodle satın al (₺30).', 'gold');
      return true;
    }

    return false;
  }

  /** Consumes prepared hot noodle (triggered via [Q] anywhere or [E] at kettle). */
  consumeHotNoodle(): boolean {
    if (this.noodleState !== 'hot') return false;
    this.noodleState = 'none';
    this.boilProgress = 0;
    this.cb.onRestoreStamina();
    this.cb.onAddScore(60);
    this.cb.onPickup();
    this.cb.onToast('Afiyet Olsun! Sıcak Noodle İçildi', 'Enerjin %100 yenilendi ve +60 Puan kazandın!', 'green');
    return true;
  }

  /** Updates kettle boiling timer and 3D steam/LED animation. Returns true when a boiling bubble sound should play. */
  update(dt: number, time: number): boolean {
    let bubblePulse = false;
    if (this.noodleState === 'boiling') {
      this.boilTimer += dt;
      this.boilProgress = Math.min(1, this.boilTimer / BOIL_DURATION);
      this.bubbleTick += dt;
      if (this.bubbleTick >= 0.45) {
        this.bubbleTick = 0;
        bubblePulse = true;
      }
      if (this.boilTimer >= BOIL_DURATION) {
        this.noodleState = 'hot';
        this.boilProgress = 1;
        this.cb.onNoodleReady?.();
        this.cb.onToast('Sıcak Noodle Hazır!', 'İçmek için tezgâhta [E] veya her yerden [Q] tuşuna bas!', 'green');
      }
    }

    this.spots.kettleVisuals.setBoiling(this.noodleState === 'boiling', this.boilProgress, time);
    return bubblePulse;
  }

  hudState(): ShopHUDState {
    return {
      money: this.money,
      stationeryCount: this.stationeryOwned.size,
      stationeryTotal: this.spots.stationery.length,
      noodleState: this.noodleState,
      boilProgress: this.boilProgress,
    };
  }
}
