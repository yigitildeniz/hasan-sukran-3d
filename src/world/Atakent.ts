import * as THREE from 'three';
import { materials } from './materials';
import { facadeTextures, rand, signTexture, worldUVBox } from './textures';
import { boxMM, groundPlane, type WorldContext } from './types';
import { CONFIG } from '../game/config';
import { buildCommercialStrip, type CommercialSpots } from './CommercialStrip';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export interface VehicleSpawn {
  kind: 'car' | 'scooter' | 'escooter';
  pos: THREE.Vector3;
  heading: number;
  color: string;
  name: string;
}

export interface AtakentSpots {
  spawn: THREE.Vector3;
  spawnYaw: number;
  simitCart: THREE.Vector3;
  parkFriend: THREE.Vector3;
  busStop: THREE.Vector3;
  commercial: CommercialSpots;
  vehicles: VehicleSpawn[];
}

type Span = [number, number];
const ROADS_X: Span[] = [[-154, -146], [-62, -52], [48, 58], [144, 152]];
const ROADS_Z: Span[] = [[-132, -124], [-52, -44], [30, 40], [113, 123]];
const SIDEWALK = 4;

const APT_COLORS = ['#e8dcc0', '#e9d79c', '#e7b99a', '#c3ccd0', '#ece9e2', '#d9c7a7', '#e3c4b4'];

/**
 * Atakent Mahallesi (Etimesgut / Ankara): a grid of avenues around the school with
 * typical 4–8 storey pastel apartment blocks with hipped tile roofs, the commercial
 * shop strip & car park next to the school, a simit cart, a mosque, a park and a bus stop.
 */
export function buildAtakent(ctx: WorldContext): AtakentSpots {
  const M = materials();
  const H = CONFIG.world.half;

  // ground
  groundPlane(ctx, -H - 200, H + 200, -H - 200, H + 200, 0, M.dirt, 14);
  ctx.map.push({ x0: -H, z0: -H, x1: H, z1: H, color: '#a99c7c', layer: 0 });

  // world boundary
  for (const [x0, x1, z0, z1] of [[-H - 2, -H, -H, H], [H, H + 2, -H, H], [-H, H, -H - 2, -H], [-H, H, H, H + 2]])
    ctx.collision.addBox(x0, x1, 0, 50, z0, z1);

  // ------------------------------------------------------------- roads + sidewalks
  const roadMat = M.asphalt;
  const roadPlane = (x0: number, x1: number, z0: number, z1: number, alongX: boolean) => {
    const len = alongX ? x1 - x0 : z1 - z0;
    const wid = alongX ? z1 - z0 : x1 - x0;
    const g = new THREE.PlaneGeometry(len, wid);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * len) / 9);
    g.rotateX(-Math.PI / 2);
    if (!alongX) g.rotateY(Math.PI / 2);
    const m = new THREE.Mesh(g, roadMat);
    m.position.set((x0 + x1) / 2, 0.025, (z0 + z1) / 2);
    m.receiveShadow = true;
    ctx.root.add(m);
  };
  for (const [z0, z1] of ROADS_Z) {
    roadPlane(-H, H, z0, z1, true);
    groundPlane(ctx, -H, H, z0 - SIDEWALK, z0, 0.015, M.sidewalk, 2);
    groundPlane(ctx, -H, H, z1, z1 + SIDEWALK, 0.015, M.sidewalk, 2);
    ctx.map.push({ x0: -H, z0: z0 - SIDEWALK, x1: H, z1: z1 + SIDEWALK, color: '#c9c2b4', layer: 1 });
    ctx.map.push({ x0: -H, z0, x1: H, z1, color: '#4a4d52', layer: 4 });
  }
  for (const [x0, x1] of ROADS_X) {
    roadPlane(x0, x1, -H, H, false);
    groundPlane(ctx, x0 - SIDEWALK, x0, -H, H, 0.015, M.sidewalk, 2);
    groundPlane(ctx, x1, x1 + SIDEWALK, -H, H, 0.015, M.sidewalk, 2);
    ctx.map.push({ x0: x0 - SIDEWALK, z0: -H, x1: x1 + SIDEWALK, z1: H, color: '#c9c2b4', layer: 1 });
    ctx.map.push({ x0, z0: -H, x1, z1: H, color: '#4a4d52', layer: 4 });
  }
  // intersections: plain asphalt patches hide lane markings
  for (const [x0, x1] of ROADS_X)
    for (const [z0, z1] of ROADS_Z) groundPlane(ctx, x0, x1, z0, z1, 0.032, M.asphaltPlain, 4);
  // zebra crossing in front of the school gate
  const zebra = new THREE.MeshStandardMaterial({ color: '#f1efe8', roughness: 0.7 });
  for (let i = 0; i < 6; i++) {
    const x = -10.5 + i * 1.0;
    groundPlane(ctx, x, x + 0.55, 30.6, 39.4, 0.034, zebra, 0);
  }
  // street lamps + roadside trees (strictly clear of roads, intersections, gates & parking driveways)
  const inClearDriveway = (x: number, z: number): boolean => {
    // School main gate & front crossing
    if (x > -19 && x < 3 && z > 22 && z < 45) return true;
    // School east gate + commercial parking west entrance
    if (x > 42 && x < 66 && z > 4 && z < 24) return true;
    // Commercial parking south entrance off Atakent Caddesi
    if (x > 60 && x < 84 && z > 20 && z < 34) return true;
    // Bus stop & simit cart frontage
    if (x > -42 && x < -30 && z > 39 && z < 46) return true;
    if (x > 10 && x < 19 && z > 39 && z < 46) return true;
    return false;
  };

  for (let x = -H + 10; x < H; x += 26) {
    for (const [z0, z1] of ROADS_Z) {
      if (!insideRoadX(x, 3) && !inClearDriveway(x, z0 - 1.2)) {
        ctx.props.addLamp(x, z0 - 1.2, -Math.PI / 2);
      }
      const x2 = x + 13;
      if ((x / 26) % 2 < 1 && !insideRoadX(x2, 3) && !inClearDriveway(x2, z1 + 1.2)) {
        ctx.props.addLamp(x2, z1 + 1.2, Math.PI / 2);
      }
    }
  }
  for (let z = -H + 10; z < H; z += 30) {
    for (const [x0] of ROADS_X) {
      if (insideRoadZ(z, 3) || inClearDriveway(x0 - 1.2, z)) continue;
      ctx.props.addLamp(x0 - 1.2, z, 0);
    }
  }
  for (let x = -H + 4; x < H; x += 13) {
    for (const [z0, z1] of ROADS_Z) {
      if (rand() < 0.3) continue;
      if (z0 === 30 && x > -50 && x < 86) continue; // school & commercial strip frontage stays clear
      const tx1 = x + rand() * 2.5;
      if (!insideRoadX(tx1, 4) && !inClearDriveway(tx1, z1 + 2.8)) {
        ctx.props.addTree(tx1, z1 + 2.8, 0.8 + rand() * 0.4);
      }
      const tx2 = x + rand() * 2.5;
      if (rand() < 0.5 && !insideRoadX(tx2, 4) && !inClearDriveway(tx2, z0 - 2.8)) {
        ctx.props.addTree(tx2, z0 - 2.8, 0.8 + rand() * 0.4);
      }
    }
  }

  // ------------------------------------------------------------- city blocks
  let commercial!: CommercialSpots;
  const xs = spans(ROADS_X, H), zs = spans(ROADS_Z, H);
  for (const [bx0, bx1] of xs)
    for (const [bz0, bz1] of zs) {
      const b = { x0: bx0 + SIDEWALK, x1: bx1 - SIDEWALK, z0: bz0 + SIDEWALK, z1: bz1 - SIDEWALK };
      if (b.x0 === -48 && b.z0 === -40) continue; // school lot
      if (b.x0 === 62 && b.z0 === -40) { commercial = buildCommercialStrip(ctx); continue; }
      if (b.x0 === 62 && b.z0 === 44) { buildPark(ctx, b); continue; }
      if (b.x0 === -142 && b.z0 === 44) { buildMosque(ctx, b); continue; }
      fillApartments(ctx, b, b.x0 === -48 && b.z0 === 44);
    }

  // ------------------------------------------------------------- Atakent Caddesi spots
  // Simit cart (cleanly positioned on south sidewalk, leaving clear walking lane)
  const simit = V(14, 0, 42.6);
  buildSimitCart(ctx, simit);

  // Bus stop
  const bus = V(-36, 0, 42.6);
  boxMM(ctx, bus.x - 2.5, bus.x + 2.5, 0, 2.6, bus.z + 0.9, bus.z + 1.0, M.glass, { cast: false });
  boxMM(ctx, bus.x - 2.7, bus.x + 2.7, 2.6, 2.75, bus.z - 0.6, bus.z + 1.1, M.metalDark, { collide: false });
  boxMM(ctx, bus.x - 2.0, bus.x + 2.0, 0, 0.45, bus.z + 0.4, bus.z + 0.85, M.metal);
  const durak = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.5), new THREE.MeshStandardMaterial({
    map: signTexture(['DURAK', 'Atakent • Etimesgut'], { w: 360, h: 100, bg: '#1d3a6b', fg: '#fff' }),
  }));
  durak.position.set(bus.x, 2.25, bus.z + 0.84);
  durak.rotation.y = Math.PI;
  ctx.root.add(durak);

  // distant hills (Ankara steppe silhouette)
  const hillMat = new THREE.MeshStandardMaterial({ color: '#9b8a6a', roughness: 1, flatShading: true });
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + rand() * 0.2;
    const r = 520 + rand() * 120;
    const hill = new THREE.Mesh(new THREE.ConeGeometry(110 + rand() * 90, 40 + rand() * 50, 7), hillMat);
    hill.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    hill.scale.z = 0.6;
    hill.rotation.y = rand() * 3;
    ctx.root.add(hill);
  }

  return {
    spawn: V(-16, 0, 42.3),
    spawnYaw: 0, // facing north towards the school
    simitCart: simit,
    parkFriend: V(96, 0, 74),
    busStop: bus,
    commercial,
    vehicles: [
      { kind: 'scooter', pos: V(-10.5, 0, 42.6), heading: Math.PI / 2, color: '#d23b2f', name: 'Motorlu Scooter' },
      { kind: 'escooter', pos: V(-0.5, 0, 28.6), heading: Math.PI / 2, color: '#19c37d', name: 'E-Scooter' },
      { kind: 'car', pos: V(30, 0, 37.6), heading: Math.PI / 2, color: '#f2f2ee', name: 'Tofaş Şahin' },
      { kind: 'car', pos: V(-40, 0, 32.4), heading: -Math.PI / 2, color: '#b8202a', name: 'Renault Toros' },
      { kind: 'car', pos: V(72.6, 0, -28.4), heading: Math.PI, color: '#2d5ea8', name: 'Fiat Doblo' },
      { kind: 'scooter', pos: V(60.5, 0, 52), heading: 0, color: '#f2c230', name: 'Motorlu Scooter' },
      { kind: 'car', pos: V(-54.4, 0, 70), heading: 0, color: '#3b3f44', name: 'Tofaş Kartal' },
    ],
  };

  function insideRoadX(x: number, pad: number): boolean {
    return ROADS_X.some(([a, b]) => x > a - pad - SIDEWALK && x < b + pad + SIDEWALK);
  }
  function insideRoadZ(z: number, pad: number): boolean {
    return ROADS_Z.some(([a, b]) => z > a - pad - SIDEWALK && z < b + pad + SIDEWALK);
  }
}

function spans(roads: Span[], H: number): Span[] {
  const out: Span[] = [];
  let prev = -H;
  for (const [a, b] of roads) {
    out.push([prev, a]);
    prev = b;
  }
  out.push([prev, H]);
  return out.map(([a, b]) => [a === -H ? -H - SIDEWALK + 6 : a, b === H ? H + SIDEWALK - 6 : b] as Span);
}

interface Block { x0: number; x1: number; z0: number; z1: number }

const aptMats = new Map<string, THREE.Material>();
function aptMaterial(color: string, balcony: boolean): THREE.Material {
  const key = `${color}-${balcony}`;
  let m = aptMats.get(key);
  if (!m) {
    const [map, rough] = facadeTextures(`apt-${key}`, {
      wall: color, wallDark: shadeHex(color), frame: '#f4f2ec', win: [0.24, 0.18, 0.76, 0.72], balcony, band: shadeHex(color),
    });
    m = new THREE.MeshStandardMaterial({ map, roughnessMap: rough, roughness: 1, metalness: 0.04 });
    aptMats.set(key, m);
  }
  return m;
}
function shadeHex(c: string): string {
  const n = parseInt(c.slice(1), 16);
  const f = (v: number) => Math.round(v * 0.82).toString(16).padStart(2, '0');
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

const roofMat = new THREE.MeshStandardMaterial({ color: '#a4462e', roughness: 0.8, flatShading: true });
const shopMat = (() => {
  const [map, rough] = facadeTextures('shop', { wall: '#d8d2c6', wallDark: '#3a3a3a', frame: '#2b2f33', win: [0.06, 0.12, 0.94, 0.9] });
  return new THREE.MeshStandardMaterial({ map, roughnessMap: rough, roughness: 1 });
})();

function apartment(ctx: WorldContext, x0: number, x1: number, z0: number, z1: number, floors: number, shopFront: boolean): void {
  const M = materials();
  const color = APT_COLORS[Math.floor(rand() * APT_COLORS.length)];
  const facade = aptMaterial(color, rand() < 0.6);
  const groundH = 3.2, fh = 3.0;
  const top = groundH + floors * fh;
  const w = x1 - x0, d = z1 - z0;
  boxMM(ctx, x0, x1, 0, groundH, z0, z1, shopFront ? shopMat : [facade, facade, M.roof, M.roof, facade, facade], {}, worldUVBox(w, groundH, d, 3.2, shopFront ? groundH : fh));
  boxMM(ctx, x0, x1, groundH, top, z0, z1, [facade, facade, M.roof, M.roof, facade, facade], { collide: false }, worldUVBox(w, top - groundH, d, 3.2, fh));
  ctx.collision.addBox(x0, x1, groundH, top, z0, z1);
  if (rand() < 0.65) {
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1), roofMat);
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(w + 0.8, 2.6, d + 0.8);
    roof.position.set((x0 + x1) / 2, top + 1.3, (z0 + z1) / 2);
    roof.castShadow = true;
    ctx.root.add(roof);
  } else {
    boxMM(ctx, x0, x1, top, top + 0.6, z0, z0 + 0.25, M.parapet, { collide: false });
    boxMM(ctx, x0, x1, top, top + 0.6, z1 - 0.25, z1, M.parapet, { collide: false });
    boxMM(ctx, x0 + 1, x0 + 2.4, top, top + 1.4, z0 + 1, z0 + 2.4, M.metal, { collide: false });
  }
  ctx.map.push({ x0, z0, x1, z1, color: '#d8cdb8', layer: 5 });
}

function fillApartments(ctx: WorldContext, b: Block, marketBlock: boolean): void {
  const cw = 24, cd = 22;
  const nx = Math.max(1, Math.floor((b.x1 - b.x0) / cw));
  const nz = Math.max(1, Math.floor((b.z1 - b.z0) / cd));
  const sx = (b.x1 - b.x0) / nx, sz = (b.z1 - b.z0) / nz;
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const cx = b.x0 + sx * (i + 0.5), cz = b.z0 + sz * (j + 0.5);
      const front = marketBlock && j === 0;
      if (!front && rand() < 0.14) {
        ctx.props.addTree(cx, cz, 1.2);
        ctx.props.addTree(cx + 5, cz - 3, 1.0);
        continue;
      }
      const w = Math.min(sx - 6, 12 + rand() * 5), d = Math.min(sz - 6, 10 + rand() * 4);
      let x0 = cx - w / 2, z0 = cz - d / 2;
      if (front) { z0 = b.z0 + 2; }
      apartment(ctx, x0, x0 + w, z0, z0 + d, 3 + Math.floor(rand() * 5), front);
      if (rand() < 0.6) ctx.props.addTree(x0 - 2, z0 + d + 2, 0.9 + rand() * 0.4);
    }
}

function buildPark(ctx: WorldContext, b: Block): void {
  const M = materials();
  groundPlane(ctx, b.x0, b.x1, b.z0, b.z1, 0.01, M.grass, 6);
  ctx.map.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, color: '#7fa65a', layer: 3, label: 'PARK' });
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  // paths
  groundPlane(ctx, b.x0, b.x1, cz - 1.5, cz + 1.5, 0.018, M.sidewalk, 2);
  groundPlane(ctx, cx - 1.5, cx + 1.5, b.z0, b.z1, 0.018, M.sidewalk, 2);
  ctx.map.push({ x0: b.x0, z0: cz - 1.5, x1: b.x1, z1: cz + 1.5, color: '#cfc6b2', layer: 4 });
  ctx.map.push({ x0: cx - 1.5, z0: b.z0, x1: cx + 1.5, z1: b.z1, color: '#cfc6b2', layer: 4 });
  // fountain
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.2, 0.6, 24), M.concrete);
  basin.position.set(cx, 0.3, cz);
  basin.castShadow = basin.receiveShadow = true;
  const water = new THREE.Mesh(new THREE.CircleGeometry(3.7, 24), new THREE.MeshPhysicalMaterial({ color: '#4d8fb0', roughness: 0.05, metalness: 0.1, transmission: 0, envMapIntensity: 1.6 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(cx, 0.55, cz);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 2, 10), M.concrete);
  spout.position.set(cx, 1, cz);
  ctx.root.add(basin, water, spout);
  ctx.collision.addBox(cx - 3.6, cx + 3.6, 0, 0.6, cz - 3.6, cz + 3.6);
  ctx.collision.addBox(cx - 0.5, cx + 0.5, 0, 2, cz - 0.5, cz + 0.5);
  // trees, benches, bushes
  for (let i = 0; i < 46; i++) {
    const x = b.x0 + 3 + rand() * (b.x1 - b.x0 - 6), z = b.z0 + 3 + rand() * (b.z1 - b.z0 - 6);
    if (Math.abs(x - cx) < 5 || Math.abs(z - cz) < 5) continue;
    ctx.props.addTree(x, z, 0.9 + rand() * 0.6);
  }
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    ctx.props.addBench(cx + i * 8, cz - 2.6, 0);
  }
  for (let i = 0; i < 10; i++) {
    const x = b.x0 + 4 + rand() * (b.x1 - b.x0 - 8), z = b.z1 - 4 - rand() * 12;
    ctx.props.addBush(x, z, 1.2);
    ctx.hideSpots.push({ pos: new THREE.Vector3(x, 0, z), radius: 1.4 });
  }
  // playground
  const px = b.x0 + 14, pz = b.z0 + 12;
  const red = new THREE.MeshStandardMaterial({ color: '#d8432f', roughness: 0.5 });
  const yellow = new THREE.MeshStandardMaterial({ color: '#f2c230', roughness: 0.5 });
  boxMM(ctx, px, px + 2, 0, 2, pz, pz + 2, red);
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 4), yellow);
  slide.position.set(px + 1, 1, pz + 3.6);
  slide.rotation.x = 0.5;
  slide.castShadow = true;
  ctx.root.add(slide);
  for (const dx of [0, 4]) boxMM(ctx, px + 6 + dx, px + 6.15 + dx, 0, 2.4, pz, pz + 0.15, M.metal);
  boxMM(ctx, px + 6, px + 10.15, 2.4, 2.5, pz, pz + 0.15, M.metal, { collide: false });
  ctx.map.push({ x0: px, z0: pz, x1: px + 10, z1: pz + 5, color: '#c98b4a', layer: 4 });
}

function buildMosque(ctx: WorldContext, b: Block): void {
  const M = materials();
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  groundPlane(ctx, cx - 22, cx + 22, cz - 20, cz + 20, 0.01, M.sidewalk, 2);
  const stone = new THREE.MeshStandardMaterial({ color: '#e6dccb', roughness: 0.8 });
  const lead = new THREE.MeshStandardMaterial({ color: '#7d8a92', roughness: 0.35, metalness: 0.6 });
  boxMM(ctx, cx - 9, cx + 9, 0, 9, cz - 9, cz + 9, stone);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(7.5, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), lead);
  dome.position.set(cx, 9, cz);
  dome.castShadow = true;
  ctx.root.add(dome);
  for (const [dx, dz] of [[9, 0], [-9, 0], [0, 9], [0, -9]]) {
    const hd = new THREE.Mesh(new THREE.SphereGeometry(3.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), lead);
    hd.position.set(cx + dx * 0.75, 9, cz + dz * 0.75);
    ctx.root.add(hd);
  }
  const crescent = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4), new THREE.MeshStandardMaterial({ color: '#d4af37', metalness: 1, roughness: 0.3 }));
  crescent.position.set(cx, 17.6, cz);
  ctx.root.add(crescent);
  const mx = cx + 12, mz = cz + 9;
  const minaret = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 32, 12), stone);
  minaret.position.set(mx, 16, mz);
  minaret.castShadow = true;
  const balcony = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.3, 0.8, 12), stone);
  balcony.position.set(mx, 24, mz);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.0, 6, 12), lead);
  cap.position.set(mx, 35, mz);
  cap.castShadow = true;
  ctx.root.add(minaret, balcony, cap);
  ctx.collision.addBox(mx - 1.1, mx + 1.1, 0, 32, mz - 1.1, mz + 1.1);
  ctx.map.push({ x0: cx - 9, z0: cz - 9, x1: cx + 9, z1: cz + 9, color: '#e6dccb', layer: 5, label: 'CAMİ' });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.props.addTree(cx + Math.cos(a) * 26, cz + Math.sin(a) * 24, 1.1);
  }
}

function buildSimitCart(ctx: WorldContext, p: THREE.Vector3): void {
  const M = materials();
  const red = new THREE.MeshStandardMaterial({ color: '#c8102e', roughness: 0.45, metalness: 0.2 });
  boxMM(ctx, p.x - 0.9, p.x + 0.9, 0.5, 1.1, p.z - 0.5, p.z + 0.5, red);
  boxMM(ctx, p.x - 0.85, p.x + 0.85, 1.1, 1.75, p.z - 0.45, p.z + 0.45, M.glass, { collide: false, cast: false });
  boxMM(ctx, p.x - 0.9, p.x + 0.9, 1.75, 1.82, p.z - 0.5, p.z + 0.5, red, { collide: false });
  // simits inside the glass case
  const simitMat = new THREE.MeshStandardMaterial({ color: '#b4692c', roughness: 0.7 });
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.04, 6, 14), simitMat);
    s.rotation.x = Math.PI / 2 - 0.3;
    s.position.set(p.x - 0.6 + (i % 3) * 0.6, 1.2 + Math.floor(i / 3) * 0.22, p.z);
    ctx.root.add(s);
  }
  for (const dx of [-0.6, 0.6]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 14), M.metalDark);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(p.x + dx, 0.28, p.z + 0.52);
    ctx.root.add(wheel);
  }
  const umbrella = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.5, 10, 1, true), new THREE.MeshStandardMaterial({ color: '#f5f1e6', side: THREE.DoubleSide }));
  umbrella.position.set(p.x, 2.6, p.z);
  umbrella.castShadow = true;
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8), M.metal);
  stick.position.set(p.x, 2.1, p.z);
  ctx.root.add(umbrella, stick);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.3), new THREE.MeshStandardMaterial({
    map: signTexture(['SİMİT  ₺15'], { w: 400, h: 75, bg: '#f2c230', fg: '#5a1a10' }),
  }));
  sign.position.set(p.x, 0.8, p.z - 0.51);
  sign.rotation.y = Math.PI;
  ctx.root.add(sign);
  ctx.map.push({ x0: p.x - 1, z0: p.z - 1, x1: p.x + 1, z1: p.z + 1, color: '#c8102e', layer: 6 });
}
