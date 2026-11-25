import { CONFIG } from '../game/config';

export interface HeatSnapshot {
  stars: number; // 0..3
  seen: boolean;
  reason: string;
  cooldownRatio: number; // 0..1 while cooling down
  detentions: number;
}

/**
 * GTA-style 3-star school discipline / heat system.
 * - 1 star: Running in corridor / caught acting suspicious
 * - 2 stars: Chased by authority / riding vehicle in school yard
 * - 3 stars: Entering restricted rooms (Müdür Odası / Öğretmenler Odası) or multiple chasers
 */
export class HeatSystem {
  stars = 0;
  seen = false;
  reason = '';
  detentions = 0;

  private decayTimer = 0;
  private stepTimer = 0;

  addHeat(targetStars: number, reason: string): boolean {
    const prev = this.stars;
    if (targetStars > this.stars) {
      this.stars = Math.min(3, targetStars);
    }
    this.reason = reason;
    this.decayTimer = CONFIG.heat.decayDelay;
    this.stepTimer = CONFIG.heat.decayInterval;
    return this.stars > prev;
  }

  refreshSight(): void {
    this.seen = true;
    this.decayTimer = CONFIG.heat.decayDelay;
    this.stepTimer = CONFIG.heat.decayInterval;
  }

  clear(): void {
    this.stars = 0;
    this.seen = false;
    this.reason = '';
    this.decayTimer = 0;
    this.stepTimer = 0;
  }

  recordDetention(): void {
    this.detentions += 1;
    this.clear();
  }

  update(dt: number, anySpotted: boolean, hidden: boolean): void {
    this.seen = anySpotted;
    if (this.stars <= 0) return;

    if (anySpotted) {
      this.decayTimer = CONFIG.heat.decayDelay;
      this.stepTimer = CONFIG.heat.decayInterval;
      return;
    }

    const rate = hidden ? 1.85 : 1.0;
    if (this.decayTimer > 0) {
      this.decayTimer = Math.max(0, this.decayTimer - dt * rate);
      return;
    }

    this.stepTimer -= dt * rate;
    if (this.stepTimer <= 0) {
      this.stars = Math.max(0, this.stars - 1);
      if (this.stars === 0) {
        this.reason = '';
      } else {
        this.stepTimer = CONFIG.heat.decayInterval;
      }
    }
  }

  snapshot(): HeatSnapshot {
    const cooldownRatio =
      this.stars > 0 && !this.seen
        ? 1 - this.decayTimer / CONFIG.heat.decayDelay
        : 0;
    return {
      stars: this.stars,
      seen: this.seen,
      reason: this.reason,
      cooldownRatio: Math.max(0, Math.min(1, cooldownRatio)),
      detentions: this.detentions,
    };
  }
}
