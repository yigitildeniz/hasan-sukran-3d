import * as THREE from 'three';

export interface AABB {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  /** Fences, railings: block movement but not line of sight. */
  seeThrough?: boolean;
  tag?: string;
}

const CELL = 8;

/**
 * Lightweight static collision world made of axis-aligned boxes in a spatial hash.
 * Characters are vertical capsules approximated as circles in XZ with a height range;
 * boxes whose top is within `stepHeight` of the feet are treated as walkable (stairs, curbs).
 */
export class CollisionWorld {
  readonly boxes: AABB[] = [];
  private grid = new Map<number, AABB[]>();
  private stamp = new Map<AABB, number>();
  private queryId = 0;

  private key(cx: number, cz: number): number {
    return (cx + 1000) * 4096 + (cz + 1000);
  }

  add(box: AABB): AABB {
    // Normalize extents defensively so inverted coordinates never cause phantom snags
    const norm: AABB = {
      ...box,
      minX: Math.min(box.minX, box.maxX),
      maxX: Math.max(box.minX, box.maxX),
      minY: Math.min(box.minY, box.maxY),
      maxY: Math.max(box.minY, box.maxY),
      minZ: Math.min(box.minZ, box.maxZ),
      maxZ: Math.max(box.minZ, box.maxZ),
    };
    this.boxes.push(norm);
    const x0 = Math.floor(norm.minX / CELL), x1 = Math.floor(norm.maxX / CELL);
    const z0 = Math.floor(norm.minZ / CELL), z1 = Math.floor(norm.maxZ / CELL);
    for (let cx = x0; cx <= x1; cx++)
      for (let cz = z0; cz <= z1; cz++) {
        const k = this.key(cx, cz);
        let arr = this.grid.get(k);
        if (!arr) this.grid.set(k, (arr = []));
        arr.push(norm);
      }
    return norm;
  }

  addBox(minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number, opts: Partial<AABB> = {}): AABB {
    return this.add({ minX, maxX, minY, maxY, minZ, maxZ, ...opts });
  }

  /** Register an object's world-space bounding box. */
  addObject(obj: THREE.Object3D, opts: Partial<AABB> = {}): AABB {
    obj.updateWorldMatrix(true, true);
    const b = new THREE.Box3().setFromObject(obj);
    return this.addBox(b.min.x, b.max.x, b.min.y, b.max.y, b.min.z, b.max.z, opts);
  }

  query(minX: number, maxX: number, minZ: number, maxZ: number, out: AABB[] = []): AABB[] {
    out.length = 0;
    const id = ++this.queryId;
    const x0 = Math.floor(minX / CELL), x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL), z1 = Math.floor(maxZ / CELL);
    for (let cx = x0; cx <= x1; cx++)
      for (let cz = z0; cz <= z1; cz++) {
        const arr = this.grid.get(this.key(cx, cz));
        if (!arr) continue;
        for (const b of arr) {
          if (this.stamp.get(b) === id) continue;
          this.stamp.set(b, id);
          if (b.maxX < minX || b.minX > maxX || b.maxZ < minZ || b.minZ > maxZ) continue;
          out.push(b);
        }
      }
    return out;
  }

  private tmp: AABB[] = [];

  private static circleOverlaps(b: AABB, x: number, z: number, r: number): boolean {
    const cx = Math.max(b.minX, Math.min(x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
    const dx = x - cx, dz = z - cz;
    return dx * dx + dz * dz < r * r;
  }

  /** Highest walkable surface under a circle that is reachable from feetY (<= feetY + stepHeight). */
  groundHeight(x: number, z: number, r: number, feetY: number, stepHeight: number): number {
    let h = 0;
    const list = this.query(x - r, x + r, z - r, z + r, this.tmp);
    for (const b of list) {
      if (b.maxY > feetY + stepHeight) continue;
      if (b.maxY <= h) continue;
      if (CollisionWorld.circleOverlaps(b, x, z, r * 0.7)) h = b.maxY;
    }
    return h;
  }

  /** Pushes a circle (feet position) out of blocking boxes. Returns true if any collision happened. */
  resolveCircle(pos: THREE.Vector3, r: number, height: number, stepHeight: number): boolean {
    let hit = false;
    for (let iter = 0; iter < 4; iter++) {
      let bestPush = 0;
      let pushX = 0;
      let pushZ = 0;
      const list = this.query(pos.x - r, pos.x + r, pos.z - r, pos.z + r, this.tmp);
      for (const b of list) {
        if (b.maxY <= pos.y + stepHeight) continue; // walkable / below
        if (b.minY >= pos.y + height) continue; // above head
        const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
        const dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        let px = 0, pz = 0, pen = 0;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          pen = r - d;
          px = (dx / d) * pen;
          pz = (dz / d) * pen;
        } else {
          // centre inside the box: push out along the shallowest axis
          const pl = pos.x - b.minX + r, pr = b.maxX - pos.x + r;
          const pb = pos.z - b.minZ + r, pf = b.maxZ - pos.z + r;
          const m = Math.min(pl, pr, pb, pf);
          pen = m;
          if (m === pl) px = -pl; else if (m === pr) px = pr; else if (m === pb) pz = -pb; else pz = pf;
        }
        if (pen > bestPush) {
          bestPush = pen;
          pushX = px;
          pushZ = pz;
        }
      }
      if (bestPush <= 1e-6) break;
      pos.x += pushX;
      pos.z += pushZ;
      hit = true;
    }
    return hit;
  }

  /** 2D segment vs boxes at a given height. Used for NPC line-of-sight. */
  segmentBlocked(ax: number, az: number, bx: number, bz: number, y: number): boolean {
    const list = this.query(Math.min(ax, bx), Math.max(ax, bx), Math.min(az, bz), Math.max(az, bz), this.tmp);
    const dx = bx - ax, dz = bz - az;
    for (const b of list) {
      if (b.seeThrough) continue;
      if (y < b.minY || y > b.maxY) continue;
      let t0 = 0, t1 = 1;
      if (Math.abs(dx) < 1e-9) {
        if (ax < b.minX || ax > b.maxX) continue;
      } else {
        let ta = (b.minX - ax) / dx, tb = (b.maxX - ax) / dx;
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) continue;
      }
      if (Math.abs(dz) < 1e-9) {
        if (az < b.minZ || az > b.maxZ) continue;
      } else {
        let ta = (b.minZ - az) / dz, tb = (b.maxZ - az) / dz;
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) continue;
      }
      return true;
    }
    return false;
  }
}
