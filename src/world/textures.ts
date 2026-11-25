import * as THREE from 'three';

/** Procedural canvas textures so the game looks good with zero external assets. */

type Ctx = CanvasRenderingContext2D;

function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function toTexture(c: HTMLCanvasElement, srgb = true, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

let seed = 1337;
export function rand(): number {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

function noise(ctx: Ctx, w: number, h: number, amount: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const v = Math.floor(rand() * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${amount * rand()})`;
    ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2);
  }
}

const cache = new Map<string, THREE.Texture>();
function cached<T extends THREE.Texture>(key: string, make: () => T): T {
  let t = cache.get(key) as T | undefined;
  if (!t) cache.set(key, (t = make()));
  return t;
}

export interface FacadeOpts {
  wall: string;
  wallDark: string;
  frame: string;
  /** window rect in 0..1 (x0,y0,x1,y1) from top-left */
  win: [number, number, number, number];
  bricks?: boolean;
  balcony?: boolean;
  band?: string;
}

/** One window bay. Returns [colorMap, roughnessMap]. */
export function facadeTextures(key: string, o: FacadeOpts): [THREE.Texture, THREE.Texture] {
  const color = cached(`facade-c-${key}`, () => {
    const S = 256;
    const [c, ctx] = canvas(S, S);
    ctx.fillStyle = o.wall;
    ctx.fillRect(0, 0, S, S);
    if (o.bricks) {
      for (let y = 0; y < S; y += 10) {
        const off = (y / 10) % 2 ? 12 : 0;
        for (let x = -24; x < S; x += 24) {
          const l = 0.85 + rand() * 0.25;
          ctx.fillStyle = shade(o.wall, l);
          ctx.fillRect(x + off + 1, y + 1, 22, 8);
        }
      }
    } else {
      noise(ctx, S, S, 0.08, 2500);
    }
    if (o.band) {
      ctx.fillStyle = o.band;
      ctx.fillRect(0, S - 18, S, 18);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(0, S - 18, S, 2);
    }
    const [x0, y0, x1, y1] = o.win.map((v) => v * S);
    if (x1 <= x0) return toTexture(c);
    // recess shadow
    ctx.fillStyle = o.wallDark;
    ctx.fillRect(x0 - 6, y0 - 6, x1 - x0 + 12, y1 - y0 + 14);
    // frame
    ctx.fillStyle = o.frame;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    // glass
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, '#9fc1d8');
    g.addColorStop(0.45, '#3d5f7a');
    g.addColorStop(1, '#1d3043');
    const f = 7;
    ctx.fillStyle = g;
    ctx.fillRect(x0 + f, y0 + f, x1 - x0 - 2 * f, y1 - y0 - 2 * f);
    // reflection streak
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.moveTo(x0 + f, y0 + (y1 - y0) * 0.55);
    ctx.lineTo(x0 + (x1 - x0) * 0.45, y0 + f);
    ctx.lineTo(x0 + (x1 - x0) * 0.62, y0 + f);
    ctx.lineTo(x0 + f, y0 + (y1 - y0) * 0.8);
    ctx.fill();
    // mullions
    ctx.fillStyle = o.frame;
    ctx.fillRect((x0 + x1) / 2 - 3, y0, 6, y1 - y0);
    ctx.fillRect(x0, y0 + (y1 - y0) * 0.3 - 3, x1 - x0, 6);
    // sill
    ctx.fillStyle = '#d9d4ca';
    ctx.fillRect(x0 - 8, y1, x1 - x0 + 16, 6);
    if (o.balcony) {
      ctx.fillStyle = 'rgba(40,40,45,0.85)';
      ctx.fillRect(x0 - 14, y1 - (y1 - y0) * 0.38, x1 - x0 + 28, 4);
      for (let x = x0 - 14; x < x1 + 14; x += 9) ctx.fillRect(x, y1 - (y1 - y0) * 0.38, 2, (y1 - y0) * 0.38 + 6);
    }
    return toTexture(c);
  });
  const rough = cached(`facade-r-${key}`, () => {
    const S = 128;
    const [c, ctx] = canvas(S, S);
    ctx.fillStyle = '#e6e6e6';
    ctx.fillRect(0, 0, S, S);
    const [x0, y0, x1, y1] = o.win.map((v) => v * S);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(x0 + 3, y0 + 3, x1 - x0 - 6, y1 - y0 - 6);
    return toTexture(c, false);
  });
  return [color, rough];
}

export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
}

export function asphaltTexture(): THREE.Texture {
  return cached('asphalt', () => {
    const S = 256;
    const [c, ctx] = canvas(S, S);
    ctx.fillStyle = '#3b3d40';
    ctx.fillRect(0, 0, S, S);
    noise(ctx, S, S, 0.25, 9000);
    // centre dashed line (texture repeats along U)
    ctx.fillStyle = '#e8e2cf';
    ctx.fillRect(0, S / 2 - 3, S * 0.5, 6);
    // edge lines
    ctx.fillStyle = 'rgba(235,235,235,0.8)';
    ctx.fillRect(0, 10, S, 4);
    ctx.fillRect(0, S - 14, S, 4);
    return toTexture(c);
  });
}

export function plainAsphaltTexture(): THREE.Texture {
  return cached('asphalt-plain', () => {
    const S = 256;
    const [c, ctx] = canvas(S, S);
    ctx.fillStyle = '#3b3d40';
    ctx.fillRect(0, 0, S, S);
    noise(ctx, S, S, 0.25, 9000);
    return toTexture(c);
  });
}

export function sidewalkTexture(): THREE.Texture {
  return cached('sidewalk', () => {
    const S = 128;
    const [c, ctx] = canvas(S, S);
    ctx.fillStyle = '#b9b2a6';
    ctx.fillRect(0, 0, S, S);
    noise(ctx, S, S, 0.12, 1500);
    ctx.strokeStyle = 'rgba(80,70,60,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= S; i += 32) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke();
    }
    return toTexture(c);
  });
}

export function grassTexture(): THREE.Texture {
  return cached('grass', () => {
    const S = 256;
    const [c, ctx] = canvas(S, S);
    ctx.fillStyle = '#6f8f45';
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 9000; i++) {
      const g = 110 + rand() * 70;
      ctx.fillStyle = `rgba(${g * 0.55},${g},${g * 0.35},0.5)`;
      ctx.fillRect(rand() * S, rand() * S, 1, 2 + rand() * 3);
    }
    // dry patches (Ankara steppe feel)
    for (let i = 0; i < 18; i++) {
      ctx.fillStyle = `rgba(170,150,95,${0.12 + rand() * 0.15})`;
      ctx.beginPath();
      ctx.arc(rand() * S, rand() * S, 8 + rand() * 22, 0, Math.PI * 2);
      ctx.fill();
    }
    return toTexture(c);
  });
}

export function dirtTexture(): THREE.Texture {
  return cached('dirt', () => {
    const S = 256;
    const [c, ctx] = canvas(S, S);
    ctx.fillStyle = '#a89878';
    ctx.fillRect(0, 0, S, S);
    noise(ctx, S, S, 0.2, 7000);
    for (let i = 0; i < 25; i++) {
      ctx.fillStyle = `rgba(110,140,70,${0.15 + rand() * 0.2})`;
      ctx.beginPath();
      ctx.arc(rand() * S, rand() * S, 6 + rand() * 18, 0, Math.PI * 2);
      ctx.fill();
    }
    return toTexture(c);
  });
}

/** School yard with painted assembly lines, basketball court and markings. Size in metres. */
export function yardTexture(w: number, h: number): THREE.Texture {
  return cached(`yard-${w}x${h}`, () => {
    const ppm = 16;
    const [c, ctx] = canvas(w * ppm, h * ppm);
    const W = c.width, H = c.height;
    ctx.fillStyle = '#a7a39b';
    ctx.fillRect(0, 0, W, H);
    noise(ctx, W, H, 0.12, 40000);
    // expansion joints
    ctx.strokeStyle = 'rgba(60,55,50,0.25)';
    ctx.lineWidth = 2;
    for (let x = 0; x < W; x += 4 * ppm) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 4 * ppm) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    const m = (v: number) => v * ppm;
    // Basketball court: x 4..24, y 16..38 (local metres from yard's NW corner)
    ctx.fillStyle = '#3f6e8e';
    ctx.fillRect(m(4), m(18), m(20), m(22));
    ctx.fillStyle = '#b4573d';
    ctx.fillRect(m(5), m(19), m(18), m(20));
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.strokeRect(m(5), m(19), m(18), m(20));
    ctx.beginPath(); ctx.moveTo(m(5), m(29)); ctx.lineTo(m(23), m(29)); ctx.stroke();
    ctx.beginPath(); ctx.arc(m(14), m(29), m(1.8), 0, Math.PI * 2); ctx.stroke();
    ctx.strokeRect(m(12), m(19), m(4), m(5));
    ctx.strokeRect(m(12), m(34), m(4), m(5));
    ctx.beginPath(); ctx.arc(m(14), m(19), m(6.75), 0, Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(m(14), m(39), m(6.75), Math.PI, Math.PI * 2); ctx.stroke();
    // Assembly (tören) lines in front of the entrance: rows of yellow dashes
    ctx.fillStyle = '#f2c230';
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 10; col++) {
        ctx.fillRect(m(30 + col * 1.6), m(9 + row * 1.6), m(1.0), m(0.18));
      }
    }
    // class labels
    ctx.font = `bold ${m(0.9)}px Segoe UI, Arial`;
    ctx.fillStyle = '#ffffff';
    ['5-A', '5-B', '6-A', '6-B', '6-G', '7-A', '7-B', '8-A'].forEach((t, i) => {
      ctx.fillText(t, m(27.4), m(9.4 + i * 1.6));
    });
    // Big circle
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(m(54), m(32), m(5), 0, Math.PI * 2); ctx.stroke();
    // walkway to the gate
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let y = m(22); y < H - m(1); y += m(2)) {
      ctx.fillRect(m(37), y, m(0.25), m(1.1));
      ctx.fillRect(m(42), y, m(0.25), m(1.1));
    }
    // Hopscotch
    ctx.lineWidth = 4;
    for (let i = 0; i < 6; i++) ctx.strokeRect(m(60), m(6 + i * 1.2), m(1.2), m(1.2));
    return toTexture(c, true, false);
  });
}

export function signTexture(lines: string[], opts: { bg?: string; fg?: string; w?: number; h?: number; font?: string; border?: string } = {}): THREE.Texture {
  const w = opts.w ?? 1024, h = opts.h ?? 160;
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = opts.bg ?? '#f5f1e6';
  ctx.fillRect(0, 0, w, h);
  if (opts.border) {
    ctx.strokeStyle = opts.border;
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, w - 10, h - 10);
  }
  ctx.fillStyle = opts.fg ?? '#1c2a4a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lh = h / (lines.length + 0.4);
  lines.forEach((l, i) => {
    ctx.font = opts.font ?? `bold ${Math.round(lh * (i === 0 ? 0.62 : 0.45))}px Segoe UI, Arial`;
    ctx.fillText(l, w / 2, lh * (i + 0.7));
  });
  return toTexture(c, true, false);
}

export function blackboardTexture(): THREE.Texture {
  return cached('blackboard', () => {
    const [c, ctx] = canvas(1024, 384);
    ctx.fillStyle = '#25382e';
    ctx.fillRect(0, 0, 1024, 384);
    noise(ctx, 1024, 384, 0.06, 6000);
    ctx.fillStyle = 'rgba(240,240,230,0.92)';
    ctx.font = 'bold 64px Segoe UI, Arial';
    ctx.fillText('6-G', 40, 90);
    ctx.font = '40px Segoe UI, Arial';
    ctx.fillText('25 Kasım — Matematik', 40, 160);
    ctx.fillText('Kesirler: 3/4 + 1/8 = 7/8', 40, 230);
    ctx.fillText('Ödev: s. 112, 1-10', 40, 300);
    ctx.font = 'italic 34px Segoe UI, Arial';
    ctx.fillText('Nöbetçi: Emre & Zeynep', 620, 350);
    return toTexture(c, true, false);
  });
}

export function flagTexture(): THREE.Texture {
  return cached('flag-tr', () => {
    const [c, ctx] = canvas(300, 200);
    ctx.fillStyle = '#e30a17';
    ctx.fillRect(0, 0, 300, 200);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(105, 100, 50, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e30a17';
    ctx.beginPath(); ctx.arc(118, 100, 40, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 9.5 : 25;
      const a = (i * Math.PI) / 5;
      ctx.lineTo(178 + Math.cos(a) * r, 100 + Math.sin(a) * r);
    }
    ctx.fill();
    return toTexture(c, true, false);
  });
}

/** Floating name tag above NPCs. */
export function nameTagTexture(name: string, role: string, color: string): THREE.Texture {
  const [c, ctx] = canvas(512, 128);
  ctx.fillStyle = 'rgba(12,14,18,0.72)';
  roundRect(ctx, 4, 4, 504, 120, 26);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillRect(22, 30, 8, 68);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 40px Segoe UI, Arial';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 46, 50);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '28px Segoe UI, Arial';
  ctx.fillText(role, 46, 94);
  return toTexture(c, true, false);
}

export function iconTexture(symbol: string, color: string): THREE.Texture {
  return cached(`icon-${symbol}-${color}`, () => {
    const [c, ctx] = canvas(128, 128);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(64, 64, 56, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.font = 'bold 86px Segoe UI, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, 64, 70);
    return toTexture(c, true, false);
  });
}

/** Vertical gradient for GTA-style mission marker beams. */
export function beamTexture(): THREE.Texture {
  return cached('beam', () => {
    const [c, ctx] = canvas(4, 128);
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0.9)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 128);
    return toTexture(c, false, false);
  });
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Scale a BoxGeometry's per-face UVs so textures tile in world units (tileU x tileV metres). */
export function worldUVBox(w: number, h: number, d: number, tileU: number, tileV: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // face order: +x, -x, +y, -y, +z, -z ; 4 verts each
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [fu, fv] = dims[f];
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      uv.setXY(idx, (uv.getX(idx) * fu) / tileU, (uv.getY(idx) * fv) / tileV);
    }
  }
  uv.needsUpdate = true;
  return g;
}
