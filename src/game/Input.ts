/** Keyboard + mouse input with pointer lock and per-frame "just pressed" edge detection. */
export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;
  locked = false;
  onLockChange: ((locked: boolean) => void) | null = null;

  constructor(private element: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    window.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      const code = `Mouse${e.button}`;
      if (!this.down.has(code)) this.pressed.add(code);
      this.down.add(code);
    });
    window.addEventListener('mouseup', (e) => this.down.delete(`Mouse${e.button}`));
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.element;
      if (!this.locked) this.down.clear();
      this.onLockChange?.(this.locked);
    });
  }

  requestLock(): void {
    const req = this.element.requestPointerLock() as unknown;
    if (req instanceof Promise) req.catch(() => undefined);
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  axis(neg: string[], pos: string[]): number {
    let v = 0;
    if (neg.some((c) => this.down.has(c))) v -= 1;
    if (pos.some((c) => this.down.has(c))) v += 1;
    return v;
  }

  consumeMouse(): { dx: number; dy: number } {
    const r = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return r;
  }

  /** Call at the end of every frame. */
  endFrame(): void {
    this.pressed.clear();
  }
}
