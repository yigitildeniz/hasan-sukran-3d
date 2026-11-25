export interface ModTeleportTarget {
  id: string;
  label: string;
}

export interface ModMenuActions {
  onToggleOpen: (open: boolean) => void;
  onSpeedChange: (multiplier: number) => void;
  onTeleport: (targetId: string) => void;
  onCompleteCurrentMission: () => void;
  onCompleteAllMissions: () => void;
  onResetMissions: () => void;
  onClearHeat: () => void;
  onGrantPoints: (points: number) => void;
  onGrantMoney: (amount: number) => void;
  onGrantStationery: () => void;
  onGrantHotNoodle: () => void;
  onRefillStamina: () => void;
}

const SPEED_PRESETS = [1, 1.5, 2, 3];

/**
 * Hidden-by-default developer & testing Mod Menu.
 * Toggle with F2 or Ctrl + Shift + M.
 */
export class ModMenu {
  open = false;
  private root: HTMLElement;
  private speedValueEl: HTMLElement;
  private speedSlider: HTMLInputElement;
  private presetBtns: HTMLButtonElement[];
  private keyHandler: (e: KeyboardEvent) => void;

  constructor(
    container: HTMLElement,
    teleports: ModTeleportTarget[],
    private actions: ModMenuActions,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'mod-menu hud-panel';
    this.root.setAttribute('aria-hidden', 'true');

    const tpButtonsHtml = teleports
      .map((t) => `<button type="button" class="mod-btn" data-tp="${t.id}">${t.label}</button>`)
      .join('');

    const presetButtonsHtml = SPEED_PRESETS.map(
      (s) =>
        `<button type="button" class="mod-chip${s === 1 ? ' active' : ''}" data-speed="${s}">${s.toFixed(1)}x</button>`,
    ).join('');

    this.root.innerHTML = `
      <div class="mod-header">
        <div>
          <div class="mod-kicker">GELİŞTİRİCİ / TEST</div>
          <div class="mod-title">Mod Menü</div>
        </div>
        <button type="button" class="mod-close" title="Kapat (F2)">✕</button>
      </div>

      <div class="mod-section">
        <div class="mod-label-row">
          <span>Hız Çarpanı (Yürüme & Araç)</span>
          <strong class="mod-speed-val">1.0x</strong>
        </div>
        <input class="mod-slider" type="range" min="0.5" max="4" step="0.25" value="1" />
        <div class="mod-chips">${presetButtonsHtml}</div>
      </div>

      <div class="mod-section">
        <div class="mod-section-title">Işınlanma (Teleport)</div>
        <div class="mod-grid">${tpButtonsHtml}</div>
      </div>

      <div class="mod-section">
        <div class="mod-section-title">Görev & Alarm Kontrolü</div>
        <div class="mod-grid">
          <button type="button" class="mod-btn accent-gold" data-act="mission-next">Görevi Tamamla</button>
          <button type="button" class="mod-btn accent-green" data-act="mission-all">Tümünü Tamamla</button>
          <button type="button" class="mod-btn" data-act="mission-reset">Görevleri Sıfırla</button>
          <button type="button" class="mod-btn" data-act="heat-clear">Alarmı Sıfırla</button>
        </div>
      </div>

      <div class="mod-section">
        <div class="mod-section-title">Test Eşyası & Puan</div>
        <div class="mod-grid">
          <button type="button" class="mod-btn accent-green" data-act="add-points">+500 Puan</button>
          <button type="button" class="mod-btn accent-gold" data-act="add-money">+₺200 Harçlık</button>
          <button type="button" class="mod-btn" data-act="give-stationery">Tüm Kırtasiye</button>
          <button type="button" class="mod-btn" data-act="give-noodle">Sıcak Noodle Ver</button>
          <button type="button" class="mod-btn full" data-act="refill-stamina">Enerjiyi %100 Doldur</button>
        </div>
      </div>

      <div class="mod-footer">
        <span class="mod-hotkey">Kısayol: <b>F2</b> veya <b>Ctrl+Shift+M</b></span>
        <button type="button" class="mod-resume">Oyuna Dön</button>
      </div>
    `;

    container.appendChild(this.root);

    this.speedValueEl = this.root.querySelector('.mod-speed-val')!;
    this.speedSlider = this.root.querySelector('.mod-slider')!;
    this.presetBtns = Array.from(this.root.querySelectorAll('.mod-chip'));

    // Speed controls
    this.speedSlider.addEventListener('input', () => {
      this.applySpeed(parseFloat(this.speedSlider.value));
    });
    for (const btn of this.presetBtns) {
      btn.addEventListener('click', () => {
        const val = parseFloat(btn.dataset.speed ?? '1');
        this.applySpeed(val);
      });
    }

    // Teleport buttons
    this.root.querySelectorAll<HTMLButtonElement>('[data-tp]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.tp) this.actions.onTeleport(btn.dataset.tp);
      });
    });

    // Action buttons
    this.root.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        switch (btn.dataset.act) {
          case 'mission-next':
            this.actions.onCompleteCurrentMission();
            break;
          case 'mission-all':
            this.actions.onCompleteAllMissions();
            break;
          case 'mission-reset':
            this.actions.onResetMissions();
            break;
          case 'heat-clear':
            this.actions.onClearHeat();
            break;
          case 'add-points':
            this.actions.onGrantPoints(500);
            break;
          case 'add-money':
            this.actions.onGrantMoney(200);
            break;
          case 'give-stationery':
            this.actions.onGrantStationery();
            break;
          case 'give-noodle':
            this.actions.onGrantHotNoodle();
            break;
          case 'refill-stamina':
            this.actions.onRefillStamina();
            break;
        }
      });
    });

    this.root.querySelector('.mod-close')!.addEventListener('click', () => this.setOpen(false));
    this.root.querySelector('.mod-resume')!.addEventListener('click', () => this.setOpen(false));

    // Global shortcut: F2 or Ctrl + Shift + M (and Escape closes when open)
    this.keyHandler = (e: KeyboardEvent) => {
      const isF2 = e.code === 'F2';
      const isCombo = e.ctrlKey && e.shiftKey && e.code === 'KeyM';
      if (isF2 || isCombo) {
        e.preventDefault();
        e.stopPropagation();
        this.setOpen(!this.open);
        return;
      }
      if (e.code === 'Escape' && this.open) {
        e.preventDefault();
        this.setOpen(false);
      }
    };
    window.addEventListener('keydown', this.keyHandler, true);
  }

  private applySpeed(val: number): void {
    const clamped = Math.max(0.5, Math.min(4, val));
    this.speedSlider.value = String(clamped);
    this.speedValueEl.textContent = `${clamped.toFixed(2).replace(/\.00$/, '.0')}x`;
    for (const btn of this.presetBtns) {
      btn.classList.toggle('active', Math.abs(parseFloat(btn.dataset.speed ?? '0') - clamped) < 0.01);
    }
    this.actions.onSpeedChange(clamped);
  }

  setOpen(next: boolean): void {
    if (this.open === next) return;
    this.open = next;
    this.root.classList.toggle('open', next);
    this.root.setAttribute('aria-hidden', String(!next));
    this.actions.onToggleOpen(next);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.keyHandler, true);
    this.root.remove();
  }
}
