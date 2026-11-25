import * as THREE from 'three';
import type { CollisionWorld, AABB } from '../systems/Collision';
import type { PropField } from './Props';

export interface Zone {
  id: string;
  label: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  restricted?: boolean;
  /** Part of the school premises (sprinting / vehicles are infractions). */
  school?: boolean;
}

export interface HideSpot {
  pos: THREE.Vector3;
  radius: number;
}

export interface MapFeature {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  color: string;
  layer: number; // draw order
  label?: string;
}

export interface WorldContext {
  root: THREE.Group;
  collision: CollisionWorld;
  map: MapFeature[];
  hideSpots: HideSpot[];
  zones: Zone[];
  props: PropField;
  updaters: ((t: number, dt: number) => void)[];
  /** Current camera position (updated by the game each frame). */
  viewer: THREE.Vector3;
}

export interface BoxOpts {
  cast?: boolean;
  receive?: boolean;
  collide?: boolean;
  seeThrough?: boolean;
  tag?: string;
  parent?: THREE.Object3D;
}

/** Create a box mesh from min/max extents, optionally registering a collider. */
export function boxMM(
  ctx: WorldContext,
  x0: number, x1: number, y0: number, y1: number, z0: number, z1: number,
  mat: THREE.Material | THREE.Material[],
  opts: BoxOpts = {},
  geometry?: THREE.BufferGeometry,
): THREE.Mesh {
  const w = x1 - x0, h = y1 - y0, d = z1 - z0;
  const mesh = new THREE.Mesh(geometry ?? new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  mesh.castShadow = opts.cast ?? true;
  mesh.receiveShadow = opts.receive ?? true;
  (opts.parent ?? ctx.root).add(mesh);
  if (opts.collide ?? true) {
    const box: AABB = { minX: x0, maxX: x1, minY: y0, maxY: y1, minZ: z0, maxZ: z1 };
    if (opts.seeThrough) box.seeThrough = true;
    if (opts.tag) box.tag = opts.tag;
    ctx.collision.add(box);
  }
  return mesh;
}

/** Plane lying on the ground with world-scaled UVs. */
export function groundPlane(
  ctx: WorldContext,
  x0: number, x1: number, z0: number, z1: number, y: number,
  mat: THREE.Material, tile = 1, receive = true,
): THREE.Mesh {
  const w = x1 - x0, d = z1 - z0;
  const g = new THREE.PlaneGeometry(w, d);
  if (tile > 0) {
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * d) / tile);
  }
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  m.receiveShadow = receive;
  ctx.root.add(m);
  return m;
}
