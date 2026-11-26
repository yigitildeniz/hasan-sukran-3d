/**
 * Ground surface lookup used by vehicle physics (grip / top-speed / rolling drag) and footstep audio.
 * Road layout constants live here so world building and physics always agree.
 */
export type Span = [number, number];

export const ROADS_X: Span[] = [[-154, -146], [-62, -52], [48, 58], [144, 152]];
export const ROADS_Z: Span[] = [[-132, -124], [-52, -44], [30, 40], [113, 123]];
export const SIDEWALK = 4;

export type SurfaceKind = 'asphalt' | 'concrete' | 'sidewalk' | 'grass' | 'dirt';

export interface SurfaceInfo {
  kind: SurfaceKind;
  /** Lateral tyre grip multiplier (1 = dry asphalt). */
  grip: number;
  /** Top-speed multiplier. */
  speed: number;
  /** Rolling drag multiplier. */
  drag: number;
  /** Visual / audio roughness 0..1 (body rumble, tyre noise). */
  rough: number;
}

const SURFACES: Record<SurfaceKind, SurfaceInfo> = {
  asphalt: { kind: 'asphalt', grip: 1.0, speed: 1.0, drag: 1.0, rough: 0.0 },
  concrete: { kind: 'concrete', grip: 0.94, speed: 0.9, drag: 1.15, rough: 0.15 },
  sidewalk: { kind: 'sidewalk', grip: 0.88, speed: 0.82, drag: 1.25, rough: 0.3 },
  grass: { kind: 'grass', grip: 0.6, speed: 0.6, drag: 1.9, rough: 0.65 },
  dirt: { kind: 'dirt', grip: 0.68, speed: 0.7, drag: 1.6, rough: 0.55 },
};

interface Rect { x0: number; x1: number; z0: number; z1: number; kind: SurfaceKind }

// Hand-placed paved areas (checked before the generic road grid)
const RECTS: Rect[] = [
  // Commercial strip: parking lot + driveways (asphalt), shopfront promenade
  { x0: 62, x1: 82, z0: -32, z1: 22, kind: 'asphalt' },
  { x0: 65, x1: 79, z0: 22, z1: 30, kind: 'asphalt' },
  { x0: 58, x1: 62, z0: 6, z1: 20, kind: 'asphalt' },
  { x0: 82, x1: 86, z0: -32, z1: 22, kind: 'sidewalk' },
  { x0: 62, x1: 140, z0: -40, z1: 26, kind: 'concrete' },
  // School lot (yard + alleys)
  { x0: -48, x1: 44, z0: -40, z1: 26, kind: 'concrete' },
  // Atakent park
  { x0: 62, x1: 140, z0: 44, z1: 109, kind: 'grass' },
];

const inSpan = (v: number, [a, b]: Span, pad = 0) => v >= a - pad && v <= b + pad;

export function surfaceAt(x: number, z: number): SurfaceInfo {
  for (const s of ROADS_X) if (inSpan(x, s)) return SURFACES.asphalt;
  for (const s of ROADS_Z) if (inSpan(z, s)) return SURFACES.asphalt;
  for (const r of RECTS) {
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return SURFACES[r.kind];
  }
  for (const s of ROADS_X) if (inSpan(x, s, SIDEWALK)) return SURFACES.sidewalk;
  for (const s of ROADS_Z) if (inSpan(z, s, SIDEWALK)) return SURFACES.sidewalk;
  return SURFACES.dirt;
}
