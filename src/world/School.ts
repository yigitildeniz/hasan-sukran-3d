import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { materials } from './materials';
import { blackboardTexture, flagTexture, signTexture, worldUVBox, yardTexture } from './textures';
import { boxMM, groundPlane, type WorldContext } from './types';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export interface SchoolSpots {
  gate: THREE.Vector3;
  entrance: THREE.Vector3;
  lobby: THREE.Vector3;
  desk6G: THREE.Vector3;
  sefaSeat: THREE.Vector3;
  betulSeat: THREE.Vector3;
  teacherSpot: THREE.Vector3;
  kantin: THREE.Vector3;
  indoorKantin: THREE.Vector3;
  detention: THREE.Vector3;
  pages: THREE.Vector3[];
  patrolPrincipal: THREE.Vector3[];
  patrolBulent: THREE.Vector3[];
  patrolRagip: THREE.Vector3[];
}

// Building constants (metres)
const FLOOR = 0.6; // ground-floor slab height (building sits on a plinth)
const GF_TOP = 4.0; // top of ground floor
const FLOOR_H = 3.4;
const UPPER_FLOORS = 4; // => 5 storeys total
const ROOF = GF_TOP + FLOOR_H * UPPER_FLOORS; // 17.6
const BAY = 3.6; // window bay width

// Wing A (long wing, faces the yard to the south) and wing B (short wing, faces the yard to the west)
const A = { x0: -40, x1: 20, z0: -30, z1: -16 };
const B = { x0: 20, x1: 34, z0: -30, z1: 12 };
// School lot
export const LOT = { x0: -48, x1: 44, z0: -40, z1: 26 };

/**
 * Hasan Şükran Saruhan Ortaokulu, reconstructed from the reference photo:
 * L-shaped 5-storey block, warm terracotta upper facades, dark burgundy brick base,
 * rows of white-framed windows, stepped/recessed main entrance with signage + stairs,
 * and a wide yard with painted markings. Ground floor of wing A is fully walkable.
 */
export function buildSchool(ctx: WorldContext): SchoolSpots {
  const M = materials();
  const W = 0.3; // wall thickness

  // ---------------------------------------------------------------- lot ground + yard
  groundPlane(ctx, LOT.x0, LOT.x1, LOT.z0, LOT.z1, 0.004, M.lotConcrete, 2);
  const yw = A.x1 - LOT.x0, yh = LOT.z1 - A.z1; // 68 x 42
  const yardMat = new THREE.MeshStandardMaterial({ map: yardTexture(yw, yh), roughness: 0.88 });
  groundPlane(ctx, LOT.x0, A.x1, A.z1, LOT.z1, 0.012, yardMat, 0);
  ctx.map.push(
    { x0: LOT.x0, z0: LOT.z0, x1: LOT.x1, z1: LOT.z1, color: '#9a958c', layer: 2 },
    { x0: -44, z0: 2, x1: -24, z1: 24, color: '#a85a42', layer: 3 },
    { x0: A.x0, z0: A.z0, x1: A.x1, z1: A.z1, color: '#c06646', layer: 5, label: 'OKUL' },
    { x0: B.x0, z0: B.z0, x1: B.x1, z1: B.z1, color: '#c06646', layer: 5 },
  );

  // ---------------------------------------------------------------- materials per face
  const ext = M.brickWindows, int = M.interior;
  const faces = (out: number): THREE.Material[] => {
    const arr: THREE.Material[] = [int, int, M.stone, M.stone, int, int];
    if (out >= 0) arr[out] = ext;
    return arr;
  };
  const wall = (x0: number, x1: number, z0: number, z1: number, out: number) =>
    boxMM(ctx, x0, x1, FLOOR, GF_TOP, z0, z1, faces(out), {}, worldUVBox(x1 - x0, GF_TOP - FLOOR, z1 - z0, BAY, FLOOR_H));

  // ---------------------------------------------------------------- WING A ground floor (walkable)
  boxMM(ctx, A.x0, A.x1, 0, FLOOR, A.z0, A.z1, M.stone); // plinth / slab
  groundPlane(ctx, A.x0 + W, A.x1 - W, A.z0 + W, A.z1 - W, FLOOR + 0.002, M.floorTile, 1.2);
  // exterior walls ( +x=0, -x=1, +z=4, -z=5 )
  const doorA = { x0: -13, x1: -7 };
  wall(A.x0, doorA.x0, A.z1 - W, A.z1, 4);
  wall(doorA.x1, A.x1, A.z1 - W, A.z1, 4);
  wall(A.x0, A.x1, A.z0, A.z0 + W, 5);
  wall(A.x0, A.x0 + W, A.z0, -20.5, 1);
  wall(A.x0, A.x0 + W, -17.5, A.z1, 1);
  // East end of corridor: open 3.2 m archway into the indoor Kantin (z: -20.2..-17.0)
  wall(A.x1 - W, A.x1, A.z0, -20.2, -1);
  wall(A.x1 - W, A.x1, -17.0, A.z1, -1);
  boxMM(ctx, A.x1 - W, A.x1, 3.05, GF_TOP, -20.2, -17.0, int, { collide: false });
  boxMM(ctx, A.x1 - W - 0.04, A.x1 + 0.04, FLOOR, 3.05, -20.28, -20.2, M.wood, { collide: false });
  boxMM(ctx, A.x1 - W - 0.04, A.x1 + 0.04, FLOOR, 3.05, -17.0, -16.92, M.wood, { collide: false });
  boxMM(ctx, A.x1 - W - 0.04, A.x1 + 0.04, 2.98, 3.08, -20.28, -16.92, M.wood, { collide: false });
  const corridorKantinSign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 0.48),
    new THREE.MeshStandardMaterial({
      map: signTexture(['OKUL KANTİNİ →'], { w: 560, h: 104, bg: '#f2c230', fg: '#1e293b', border: '#1e293b' }),
    }),
  );
  corridorKantinSign.position.set(A.x1 - W - 0.03, 3.45, -18.6);
  corridorKantinSign.rotation.y = -Math.PI / 2;
  ctx.root.add(corridorKantinSign);
  // west side door steps
  boxMM(ctx, A.x0 - 1.2, A.x0, 0, 0.4, -20.5, -17.5, M.concrete);
  boxMM(ctx, A.x0 - 2.4, A.x0 - 1.2, 0, 0.2, -20.5, -17.5, M.concrete);

  // corridor wall with classroom doors
  const rooms = [
    { x0: -40, x1: -28, name: '6-A' },
    { x0: -28, x1: -16, name: '6-B' },
    { x0: -16, x1: -4, name: 'MÜDÜR ODASI' },
    { x0: -4, x1: 8, name: '6-G' },
    { x0: 8, x1: 20, name: 'ÖĞRETMENLER ODASI' },
  ];
  const CZ = -21; // corridor wall centre
  let cursor = A.x0 + W;
  for (const r of rooms) {
    const d0 = r.x0 + 1.5, d1 = r.x0 + 3.3;
    if (d0 > cursor) wall(cursor, d0, CZ - 0.15, CZ + 0.15, -1);
    cursor = d1;
    // door sign
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(r.name.length > 4 ? 2.2 : 1.1, 0.32),
      new THREE.MeshStandardMaterial({ map: signTexture([r.name], { w: r.name.length > 4 ? 512 : 256, h: 72, bg: '#1d3a6b', fg: '#ffffff' }) }),
    );
    sign.position.set((d0 + d1) / 2, 3.45, CZ + 0.17);
    ctx.root.add(sign);
    // door frame
    boxMM(ctx, d0 - 0.08, d0, FLOOR, 3.0, CZ - 0.2, CZ + 0.2, M.wood, { collide: false });
    boxMM(ctx, d1, d1 + 0.08, FLOOR, 3.0, CZ - 0.2, CZ + 0.2, M.wood, { collide: false });
    boxMM(ctx, d0, d1, 2.92, 3.0, CZ - 0.2, CZ + 0.2, M.wood, { collide: false });
    // overhead door fill
    boxMM(ctx, d0, d1, 3.0, GF_TOP, CZ - 0.15, CZ + 0.15, int, { collide: false });
  }
  wall(cursor, A.x1 - W, CZ - 0.15, CZ + 0.15, -1);
  for (const x of [-28, -16, -4, 8]) wall(x - 0.15, x + 0.15, A.z0 + W, CZ - 0.15, -1);

  // ceiling lights
  const panel = (x: number, z: number) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.4), M.lightPanel);
    p.rotation.x = Math.PI / 2;
    p.position.set(x, GF_TOP - 0.02, z);
    ctx.root.add(p);
  };
  for (let x = -36; x < 19; x += 6) panel(x, -18.6);
  for (const r of rooms) for (const dz of [-27.5, -24]) { panel(r.x0 + 4, dz); panel(r.x0 + 8, dz); }
  const corridorLight = new THREE.PointLight(0xfff4e0, 14, 34, 1.4);
  corridorLight.position.set(-10, 3.6, -18.6);
  const classLight = new THREE.PointLight(0xfff4e0, 10, 16, 1.4);
  classLight.position.set(2, 3.6, -25.5);
  ctx.root.add(corridorLight, classLight);

  // lockers + notice board along the corridor
  for (let x = -38; x < -15; x += 1.0) {
    if (x > -14.5) break;
    boxMM(ctx, x, x + 0.95, FLOOR, FLOOR + 1.9, A.z1 - W - 0.5, A.z1 - W, M.locker, { collide: false });
  }
  ctx.collision.addBox(-38, -15.05, FLOOR, FLOOR + 1.9, A.z1 - W - 0.5, A.z1 - W);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.3), new THREE.MeshStandardMaterial({
    map: signTexture(['DUYURULAR', 'Bilim Fuarı: 2 Aralık', 'Satranç Turnuvası • Kütüphane'], { w: 768, h: 336, bg: '#c49a62', fg: '#2a1d10', border: '#6b4a2a' }),
  }));
  board.position.set(12, 2.2, CZ + 0.17);
  ctx.root.add(board);

  // Mirror in the corridor (you can see your streetwear outfit here)
  const mirror = new Reflector(new THREE.PlaneGeometry(2.6, 1.9), {
    textureWidth: 512, textureHeight: 380, color: 0xb8c4c8, clipBias: 0.003,
  });
  mirror.position.set(4, 1.85, A.z1 - W - 0.02);
  mirror.rotation.y = Math.PI;
  const camLayers = (mirror as unknown as { camera?: THREE.Camera }).camera;
  camLayers?.layers.enableAll();
  ctx.root.add(mirror);
  boxMM(ctx, 2.6, 5.4, 0.85, 2.85, A.z1 - W - 0.03, A.z1 - W, M.metalDark, { collide: false, cast: false });
  const mirrorPos = mirror.position.clone();
  ctx.updaters.push(() => {
    const v = ctx.viewer;
    mirror.visible = v.distanceTo(mirrorPos) < 16 && v.z < A.z1 && v.z > A.z0;
  });

  // ---------------------------------------------------------------- 6-G classroom
  const deskTops: THREE.Vector3[] = [];
  const addDesk = (x: number, z: number) => {
    deskTops.push(V(x, 0, z));
    ctx.collision.addBox(x - 0.6, x + 0.6, FLOOR, FLOOR + 0.77, z - 0.28, z + 0.28);
  };
  const g6 = rooms[3];
  for (const col of [-2.0, 0.8, 3.6, 6.4])
    for (const row of [-26.2, -24.6, -23.0]) addDesk(g6.x0 + 4 + col - 0.4, row);
  for (const r of [rooms[0], rooms[1]])
    for (const col of [3, 6, 9]) for (const row of [-26.2, -24.2]) addDesk(r.x0 + col, row);
  const dtGeo = new THREE.BoxGeometry(1.2, 0.05, 0.55);
  const dfGeo = new THREE.BoxGeometry(1.1, 0.7, 0.05);
  const seatGeo = new THREE.BoxGeometry(0.42, 0.04, 0.4);
  const backGeo = new THREE.BoxGeometry(0.42, 0.42, 0.04);
  const legGeo = new THREE.BoxGeometry(0.36, 0.42, 0.36);
  const parts: [THREE.BufferGeometry, THREE.Material, (p: THREE.Vector3, o: THREE.Vector3) => void][] = [
    [dtGeo, M.deskTop, (p, o) => o.set(p.x, FLOOR + 0.745, p.z)],
    [dfGeo, M.metalDark, (p, o) => o.set(p.x, FLOOR + 0.37, p.z - 0.22)],
    [seatGeo, M.chairBlue, (p, o) => o.set(p.x - 0.25, FLOOR + 0.44, p.z + 0.6)],
    [backGeo, M.chairBlue, (p, o) => o.set(p.x - 0.25, FLOOR + 0.68, p.z + 0.8)],
    [legGeo, M.metalDark, (p, o) => o.set(p.x - 0.25, FLOOR + 0.21, p.z + 0.6)],
  ];
  const mtx = new THREE.Matrix4(), o = new THREE.Vector3();
  for (const [geo, mat, place] of parts) {
    const im = new THREE.InstancedMesh(geo, mat, deskTops.length);
    deskTops.forEach((p, i) => { place(p, o); im.setMatrixAt(i, mtx.makeTranslation(o.x, o.y, o.z)); });
    im.castShadow = im.receiveShadow = true;
    ctx.root.add(im);
  }
  // Extra chair right beside Sefa's seat so Sefa & Betül sit side-by-side at the same 6-G double desk
  const sharedDeskX = g6.x0 + 4 + 0.8 - 0.4; // 0.4
  const betulChairX = sharedDeskX + 0.3; // 0.7 (Sefa is at 0.15)
  const sharedChairZ = -24.6 + 0.6; // -24.0
  boxMM(ctx, betulChairX - 0.21, betulChairX + 0.21, FLOOR + 0.42, FLOOR + 0.46, sharedChairZ - 0.2, sharedChairZ + 0.2, M.chairBlue, { collide: false });
  boxMM(ctx, betulChairX - 0.21, betulChairX + 0.21, FLOOR + 0.46, FLOOR + 0.88, sharedChairZ + 0.18, sharedChairZ + 0.22, M.chairBlue, { collide: false });
  boxMM(ctx, betulChairX - 0.18, betulChairX + 0.18, FLOOR, FLOOR + 0.42, sharedChairZ - 0.18, sharedChairZ + 0.18, M.metalDark, { collide: false });

  // blackboard + teacher desk + Atatürk portrait
  const bb = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.5), new THREE.MeshStandardMaterial({ map: blackboardTexture(), roughness: 0.9 }));
  bb.position.set(g6.x0 + 6, 2.1, A.z0 + W + 0.02);
  ctx.root.add(bb);
  boxMM(ctx, g6.x0 + 3.8, g6.x0 + 8.2, 1.3, 1.35, A.z0 + W, A.z0 + W + 0.1, M.wood, { collide: false });
  const portrait = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.1), new THREE.MeshStandardMaterial({
    map: signTexture(['ATATÜRK', '1881 – 1938'], { w: 256, h: 320, bg: '#3b3328', fg: '#e8dcc0', border: '#c9a24a' }),
  }));
  portrait.position.set(g6.x0 + 6, 3.4, A.z0 + W + 0.02);
  ctx.root.add(portrait);
  boxMM(ctx, g6.x0 + 5, g6.x0 + 7, FLOOR, FLOOR + 0.78, -28.4, -27.7, M.wood);
  // principal office furniture
  const po = rooms[2];
  boxMM(ctx, po.x0 + 4, po.x0 + 8, FLOOR, FLOOR + 0.8, -27.6, -26.6, M.wood);
  boxMM(ctx, po.x0 + 1, po.x0 + 4, FLOOR, FLOOR + 0.8, -23.4, -22.4, M.chairBlue);
  const pp = portrait.clone();
  pp.position.set(po.x0 + 6, 2.6, A.z0 + W + 0.02);
  ctx.root.add(pp);
  // teachers' room table
  const tr = rooms[4];
  boxMM(ctx, tr.x0 + 2, tr.x0 + 10, FLOOR, FLOOR + 0.78, -26.5, -24.5, M.woodLight);

  // ---------------------------------------------------------------- upper floors (exterior shell)
  const shell = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, facade: THREE.Material, under: THREE.Material) => {
    const mats = [facade, facade, M.roof, under, facade, facade];
    boxMM(ctx, x0, x1, y0, y1, z0, z1, mats, { collide: false }, worldUVBox(x1 - x0, y1 - y0, z1 - z0, BAY, FLOOR_H));
  };
  shell(A.x0, A.x1, A.z0, A.z1, GF_TOP, ROOF, M.terracotta, M.ceiling);
  // Wing B: north solid block + WALKABLE INDOOR KANTİN (z: -22..-10) + south solid block
  boxMM(ctx, B.x0, B.x1, 0, GF_TOP, B.z0, -22, ext, {}, worldUVBox(B.x1 - B.x0, GF_TOP, 8, BAY, GF_TOP));
  boxMM(ctx, B.x0, B.x1, 0, GF_TOP, -10, B.z1, ext, {}, worldUVBox(B.x1 - B.x0, GF_TOP, B.z1 + 10, BAY, GF_TOP));

  // ---- Walkable Indoor School Kantin (x: 20..34, z: -22..-10), accessible directly from corridor!
  boxMM(ctx, B.x0, B.x1, 0, FLOOR, -22, -10, M.stone); // plinth / floor slab
  groundPlane(ctx, B.x0, B.x1 - W, -22 + W, -10 - W, FLOOR + 0.002, M.floorTile, 1.2);
  // Perimeter walls around indoor Kantin (leaving west corridor doorway z: -20.2..-17.0 completely open!)
  wall(B.x1 - W, B.x1, -22, -10, 0); // east exterior wall
  wall(B.x0, B.x1, -22, -22 + W, -1); // north divider wall
  wall(B.x0, B.x1, -10 - W, -10, -1); // south divider wall
  wall(B.x0, B.x0 + W, -16.0, -10, 1); // west yard-facing exterior wall south of corridor
  // Bright interior lights
  for (const [kx, kz] of [[24, -18.5], [24, -13.5], [30, -18.5], [30, -13.5]]) panel(kx, kz);
  const kantinLight = new THREE.PointLight(0xfff4df, 14, 20, 1.3);
  kantinLight.position.set(27, 3.6, -16);
  ctx.root.add(kantinLight);
  // Serving counter (x: 28.6..29.9, z: -20.8..-11.2)
  boxMM(ctx, 28.6, 29.9, FLOOR, FLOOR + 0.98, -20.8, -11.2, M.woodLight);
  boxMM(ctx, 28.5, 29.95, FLOOR + 0.96, FLOOR + 1.04, -20.85, -11.15, M.white, { collide: false });
  // Tost makinesi (toast press) + heating LED on counter
  boxMM(ctx, 28.9, 29.55, FLOOR + 1.04, FLOOR + 1.24, -17.4, -16.6, M.metalDark, { collide: false });
  const tostLed = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.04, 0.06),
    new THREE.MeshStandardMaterial({ color: '#ff3b30', emissive: '#ff3b30', emissiveIntensity: 1.8 }),
  );
  tostLed.position.set(28.88, FLOOR + 1.15, -16.8);
  ctx.root.add(tostLed);
  // Snack / tost / simit display boxes along counter
  const snackColors = ['#f59e0b', '#ef4444', '#22c55e', '#3b82f6', '#eab308'];
  snackColors.forEach((col, i) => {
    const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 });
    boxMM(ctx, 28.95, 29.45, FLOOR + 1.04, FLOOR + 1.24, -15.6 + i * 0.85, -15.0 + i * 0.85, mat, { collide: false, cast: false });
  });
  // Beverage refrigerator on back east wall (ayran & fruit juice)
  boxMM(ctx, 32.1, 33.4, FLOOR, FLOOR + 2.2, -20.6, -14.2, M.white);
  boxMM(ctx, 32.02, 32.1, FLOOR + 0.35, FLOOR + 2.05, -20.2, -14.6, M.glass, { collide: false, cast: false });
  // Menu board behind the counter
  const kantinMenu = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 1.2),
    new THREE.MeshStandardMaterial({
      map: signTexture(['OKUL KANTİNİ', 'Kaşarlı Tost ₺25 • Ayran ₺10 • Simit ₺15 • Çikolata ₺12'], {
        w: 960, h: 240, bg: '#1e293b', fg: '#ffd166', border: '#f59e0b',
      }),
    }),
  );
  kantinMenu.position.set(B.x1 - W - 0.03, 2.55, -12.6);
  kantinMenu.rotation.y = -Math.PI / 2;
  ctx.root.add(kantinMenu);
  // Two small indoor kantin tables near south side (clear of entrance walkway!)
  for (const tx of [23.2, 26.0]) {
    boxMM(ctx, tx - 0.55, tx + 0.55, FLOOR, FLOOR + 0.76, -12.8, -11.7, M.deskTop);
  }

  shell(B.x0, B.x1, B.z0, B.z1, GF_TOP, ROOF, M.terracotta, M.ceiling);
  // floor slab lines (thin horizontal cornices give depth to the facade)
  for (let f = 0; f <= UPPER_FLOORS; f++) {
    const y = GF_TOP + f * FLOOR_H;
    boxMM(ctx, A.x0 - 0.12, A.x1, y - 0.06, y + 0.1, A.z1, A.z1 + 0.14, M.parapet, { collide: false, receive: false });
    boxMM(ctx, B.x0 - 0.14, B.x0, y - 0.06, y + 0.1, A.z1, B.z1 + 0.14, M.parapet, { collide: false, receive: false });
    boxMM(ctx, B.x0, B.x1, y - 0.06, y + 0.1, B.z1, B.z1 + 0.14, M.parapet, { collide: false, receive: false });
  }
  // parapets
  const par = (x0: number, x1: number, z0: number, z1: number) => boxMM(ctx, x0, x1, ROOF, ROOF + 0.8, z0, z1, M.parapet, { collide: false });
  par(A.x0, A.x1, A.z0, A.z0 + 0.3); par(A.x0, A.x1, A.z1 - 0.3, A.z1); par(A.x0, A.x0 + 0.3, A.z0, A.z1);
  par(B.x1 - 0.3, B.x1, B.z0, B.z1); par(B.x0, B.x1, B.z1 - 0.3, B.z1); par(B.x0, B.x0 + 0.3, A.z1, B.z1); par(B.x0, B.x1, B.z0, B.z0 + 0.3);
  boxMM(ctx, -24, -18, ROOF, ROOF + 2.6, -27, -22, M.parapet, { collide: false });
  boxMM(ctx, 24, 30, ROOF, ROOF + 1.6, -6, 0, M.metal, { collide: false });

  // ---------------------------------------------------------------- stepped main entrance
  const E = { x0: -14.5, x1: -5.5 };
  shell(E.x0, E.x1, A.z1, A.z1 + 1.0, GF_TOP + 0.4, ROOF + 0.8, M.terracottaDark, M.ceiling);
  boxMM(ctx, E.x0, E.x1, 0, FLOOR, A.z1, -13.6, M.stone);
  boxMM(ctx, E.x0, E.x1, 0, 0.4, -13.6, -13.0, M.concrete);
  boxMM(ctx, E.x0, E.x1, 0, 0.2, -13.0, -12.4, M.concrete);
  boxMM(ctx, E.x0 - 0.2, E.x1 + 0.2, GF_TOP - 0.1, GF_TOP + 0.4, A.z1, -12.2, M.white, { collide: false });
  boxMM(ctx, E.x0 + 0.2, E.x0 + 0.8, 0, GF_TOP - 0.1, -12.9, -12.3, M.brick);
  boxMM(ctx, E.x1 - 0.8, E.x1 - 0.2, 0, GF_TOP - 0.1, -12.9, -12.3, M.brick);
  // entrance glass doors (frames only, doorway open)
  for (const x of [doorA.x0, -10, doorA.x1]) boxMM(ctx, x - 0.05, x + 0.05, FLOOR, GF_TOP, A.z1 - 0.2, A.z1 - 0.1, M.metalDark, { collide: false });
  boxMM(ctx, doorA.x0, doorA.x1, 3.0, 3.08, A.z1 - 0.2, A.z1 - 0.1, M.metalDark, { collide: false });
  boxMM(ctx, doorA.x0, doorA.x1, 3.08, GF_TOP, A.z1 - 0.17, A.z1 - 0.13, M.glass, { collide: false, cast: false });
  // signage
  const signMat = new THREE.MeshStandardMaterial({
    map: signTexture(['HASAN ŞÜKRAN SARUHAN ORTAOKULU', 'ATAKENT MAH. • ETİMESGUT / ANKARA'], { w: 1400, h: 220, bg: '#f6f2e8', fg: '#16326b', border: '#16326b' }),
    roughness: 0.4,
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 1.35), signMat);
  sign.position.set((E.x0 + E.x1) / 2, GF_TOP + 1.25, A.z1 + 1.02);
  ctx.root.add(sign);
  const mebSign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.45), new THREE.MeshStandardMaterial({
    map: signTexture(['T.C. MİLLÎ EĞİTİM BAKANLIĞI'], { w: 700, h: 100, bg: '#c8102e', fg: '#ffffff' }),
  }));
  mebSign.position.set((E.x0 + E.x1) / 2, GF_TOP + 0.15, -12.19);
  ctx.root.add(mebSign);

  // ---------------------------------------------------------------- kantin (wing B, yard side)
  const kDoor = new THREE.Mesh(new THREE.PlaneGeometry(2, 2.5), new THREE.MeshStandardMaterial({ color: '#4a3424', roughness: 0.6 }));
  kDoor.position.set(B.x0 - 0.02, 1.25, -6);
  kDoor.rotation.y = -Math.PI / 2;
  const kSign = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.6), new THREE.MeshStandardMaterial({
    map: signTexture(['KANTİN'], { w: 512, h: 100, bg: '#f2c230', fg: '#2a1d10' }),
    emissive: '#332200',
  }));
  kSign.position.set(B.x0 - 0.03, 3.1, -6);
  kSign.rotation.y = -Math.PI / 2;
  ctx.root.add(kDoor, kSign);

  // ---------------------------------------------------------------- perimeter fence + gates
  const fenceTex = (() => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.fillRect(6, 0, 7, 128); g.fillRect(38, 0, 7, 128);
    g.fillRect(0, 6, 64, 6); g.fillRect(0, 116, 64, 6);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    return t;
  })();
  const fenceMat = new THREE.MeshStandardMaterial({ color: '#3d5a4c', alphaMap: fenceTex, alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.45 });
  fenceMat.map = fenceTex; // also drives shadow cut-out
  const fence = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const t = 0.15;
    const bx0 = alongX ? Math.min(x0, x1) : x0 - t, bx1 = alongX ? Math.max(x0, x1) : x0 + t;
    const bz0 = alongX ? z0 - t : Math.min(z0, z1), bz1 = alongX ? z0 + t : Math.max(z0, z1);
    boxMM(ctx, bx0, bx1, 0, 0.55, bz0, bz1, M.concrete, { seeThrough: true });
    ctx.collision.addBox(bx0, bx1, 0.55, 2.2, bz0, bz1, { seeThrough: true });
    const g = new THREE.PlaneGeometry(len, 1.65);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len / 0.5);
    const p = new THREE.Mesh(g, fenceMat);
    p.position.set((x0 + x1) / 2, 0.55 + 0.825, (z0 + z1) / 2);
    if (!alongX) p.rotation.y = Math.PI / 2;
    p.castShadow = true;
    ctx.root.add(p);
  };
  fence(LOT.x0, LOT.z1, -14, LOT.z1);
  fence(-2, LOT.z1, LOT.x1, LOT.z1);
  fence(LOT.x0, LOT.z0, LOT.x1, LOT.z0);
  fence(LOT.x0, LOT.z0, LOT.x0, -12);
  fence(LOT.x0, -6, LOT.x0, LOT.z1);
  fence(LOT.x1, LOT.z0, LOT.x1, 14);
  fence(LOT.x1, 20, LOT.x1, LOT.z1);
  const pillar = (x: number, z: number) => boxMM(ctx, x - 0.35, x + 0.35, 0, 3.6, z - 0.35, z + 0.35, M.brick);
  pillar(-14.3, LOT.z1); pillar(-1.7, LOT.z1); pillar(LOT.x0, -12.3); pillar(LOT.x0, -5.7); pillar(LOT.x1, 13.7); pillar(LOT.x1, 20.3);
  boxMM(ctx, -14.6, -1.4, 3.6, 4.5, LOT.z1 - 0.25, LOT.z1 + 0.25, M.metalDark, { collide: false });
  const gateSignMat = new THREE.MeshStandardMaterial({
    map: signTexture(['HASAN ŞÜKRAN SARUHAN ORTAOKULU'], { w: 1400, h: 110, bg: '#16326b', fg: '#ffffff' }),
  });
  for (const side of [1, -1]) {
    const gs = new THREE.Mesh(new THREE.PlaneGeometry(12.6, 0.8), gateSignMat);
    gs.position.set(-8, 4.05, LOT.z1 + side * 0.26);
    if (side < 0) gs.rotation.y = Math.PI;
    ctx.root.add(gs);
  }

  // ---------------------------------------------------------------- yard furniture
  // basketball hoops
  for (const [z, dir] of [[1.6, 1], [24.4, -1]] as const) {
    boxMM(ctx, -34.1, -33.9, 0, 3.4, z - 0.1, z + 0.1, M.metal);
    boxMM(ctx, -34.9, -33.1, 2.9, 4.0, z + dir * 0.4 - 0.04, z + dir * 0.4 + 0.04, M.white, { collide: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.02, 6, 16), M.red);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(-34, 3.05, z + dir * 0.7);
    ctx.root.add(ring);
  }
  // ---------------------------------------------------------------- Atatürk Köşesi & Bayrak Direği
  // Positioned neatly beside the entrance ceremonial area (x: -24.2..-19.8, z: -12.6..-9.8),
  // clear of the main walkway, basketball court and patrol lanes.
  const marbleMat = new THREE.MeshStandardMaterial({ color: '#ece9e2', roughness: 0.32, metalness: 0.05 });
  const marbleTrimMat = new THREE.MeshStandardMaterial({ color: '#c7c1b6', roughness: 0.5 });
  const bronzeMat = new THREE.MeshStandardMaterial({ color: '#a87d44', roughness: 0.3, metalness: 0.78 });

  // Low walkable ceremonial step (height 0.14 <= stepHeight, zero snagging)
  boxMM(ctx, -24.2, -19.8, 0, 0.14, -12.6, -9.8, marbleTrimMat, { collide: false });
  boxMM(ctx, -24.0, -20.0, 0.14, 0.18, -12.4, -10.0, marbleMat, { collide: false });

  // Main marble pedestal (clean, tight collider only on the plinth itself)
  const bx = -22.6, bz = -11.2;
  boxMM(ctx, bx - 0.58, bx + 0.58, 0.18, 1.52, bz - 0.58, bz + 0.58, marbleMat, { tag: 'ataturk-pedestal' });
  boxMM(ctx, bx - 0.68, bx + 0.68, 0.18, 0.34, bz - 0.68, bz + 0.68, marbleTrimMat, { collide: false });
  boxMM(ctx, bx - 0.64, bx + 0.64, 1.46, 1.56, bz - 0.64, bz + 0.64, marbleTrimMat, { collide: false });

  // Engraved front plaque facing the school yard (+Z)
  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(0.96, 0.76),
    new THREE.MeshStandardMaterial({
      map: signTexture(['MUSTAFA KEMAL', 'ATATÜRK', 'NE MUTLU TÜRKÜM DİYENE'], {
        w: 512, h: 400, bg: '#262320', fg: '#e9cfa0', border: '#c49b52',
      }),
      roughness: 0.4,
    }),
  );
  plaque.position.set(bx, 0.9, bz + 0.59);
  ctx.root.add(plaque);

  // Sculpted bronze Atatürk bust cleanly centered on top of pedestal
  const bustGroup = new THREE.Group();
  bustGroup.position.set(bx, 1.56, bz);
  const bustBase = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.12, 16), bronzeMat);
  bustBase.position.y = 0.06;
  const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.28, 0.24), bronzeMat);
  shoulders.position.y = 0.26;
  const lapelL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.24, 0.26), bronzeMat);
  lapelL.position.set(-0.11, 0.27, 0.02);
  lapelL.rotation.z = 0.22;
  const lapelR = lapelL.clone();
  lapelR.position.x = 0.11;
  lapelR.rotation.z = -0.22;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.14, 12), bronzeMat);
  neck.position.y = 0.45;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 14), bronzeMat);
  head.scale.set(0.92, 1.12, 0.98);
  head.position.set(0, 0.64, 0.01);
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.04, 0.05), bronzeMat);
  brow.position.set(0, 0.69, 0.14);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.165, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.48), bronzeMat);
  hair.position.set(0, 0.67, -0.01);
  hair.rotation.x = -0.25;
  bustGroup.add(bustBase, shoulders, lapelL, lapelR, neck, head, brow, hair);
  bustGroup.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
  });
  ctx.root.add(bustGroup);

  // Flag pole symmetrically placed right beside the bust on the same marble plinth
  const fx = -20.6, fz = -11.2;
  boxMM(ctx, fx - 0.25, fx + 0.25, 0.18, 0.56, fz - 0.25, fz + 0.25, marbleTrimMat);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 10, 8), M.metal);
  pole.position.set(fx, 5.18, fz);
  pole.castShadow = true;
  ctx.root.add(pole);
  const flagGeo = new THREE.PlaneGeometry(2.4, 1.6, 16, 8);
  flagGeo.translate(1.2, 0, 0);
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ map: flagTexture(), side: THREE.DoubleSide, roughness: 0.8 }));
  flag.position.set(fx + 0.05, 9.15, fz);
  flag.castShadow = true;
  ctx.root.add(flag);
  const fpos = flagGeo.attributes.position as THREE.BufferAttribute;
  const base = Float32Array.from(fpos.array as Float32Array);
  ctx.updaters.push((t) => {
    for (let i = 0; i < fpos.count; i++) {
      const x = base[i * 3];
      fpos.setZ(i, Math.sin(x * 2.2 - t * 5) * 0.16 * x + Math.sin(base[i * 3 + 1] * 3 + t * 3) * 0.04 * x);
    }
    fpos.needsUpdate = true;
  });

  // Indoor Atatürk Köşesi cleanly mounted on the lobby wall (zero floor obstruction)
  const indoorAtaturk = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 1.35),
    new THREE.MeshStandardMaterial({
      map: signTexture(['ATATÜRK KÖŞESİ', 'İstiklâl Marşı • Gençliğe Hitabe'], {
        w: 768, h: 400, bg: '#5a1e22', fg: '#f4e8ce', border: '#d4af37',
      }),
    }),
  );
  indoorAtaturk.position.set(-10, 2.25, CZ + 0.17);
  ctx.root.add(indoorAtaturk);

  // trees, bushes, benches
  for (let x = LOT.x0 + 3; x < LOT.x1 - 2; x += 7) {
    if (x > -17 && x < 1) continue;
    ctx.props.addTree(x, LOT.z1 - 1.6, 0.9 + Math.random() * 0.3);
  }
  for (let x = LOT.x0 + 4; x < LOT.x1 - 2; x += 9) ctx.props.addTree(x, LOT.z0 + 1.5, 1.0);
  const bush = (x: number, z: number, s = 1) => {
    ctx.props.addBush(x, z, s);
    ctx.hideSpots.push({ pos: V(x, 0, z), radius: 1.25 * s });
  };
  [-2, 1.5, 5, 8.5].forEach((z) => bush(LOT.x0 + 1.6, z, 1.1));
  bush(-28.0, -14.8); bush(-31.0, -14.8); bush(-1.8, -14.8); bush(1.4, -14.8);
  bush(41.5, -12, 1.2); bush(41.5, -25, 1.2); bush(-30, -37.8, 1.2);
  ctx.props.addBench(B.x0 - 1.4, 3, -Math.PI / 2);
  ctx.props.addBench(B.x0 - 1.4, 8, -Math.PI / 2);
  ctx.props.addBench(0, LOT.z1 - 2.8, Math.PI);
  ctx.props.addBench(7, LOT.z1 - 2.8, Math.PI);

  // ---------------------------------------------------------------- zones
  ctx.zones.push(
    { id: 'office', label: 'Müdür Odası', minX: -16, maxX: -4, minZ: A.z0, maxZ: CZ, restricted: true, school: true },
    { id: 'teachers', label: 'Öğretmenler Odası', minX: 8, maxX: 20, minZ: A.z0, maxZ: CZ, restricted: true, school: true },
    { id: '6g', label: '6-G Sınıfı', minX: -4, maxX: 8, minZ: A.z0, maxZ: CZ, school: true },
    { id: 'kantin_ic', label: 'Okul Kantini', minX: B.x0, maxX: B.x1, minZ: -22, maxZ: -10, school: true },
    { id: 'corridor', label: 'Koridor', minX: A.x0, maxX: A.x1, minZ: A.z0, maxZ: A.z1, school: true },
    { id: 'school', label: 'Okul Bahçesi', minX: LOT.x0, maxX: LOT.x1, minZ: LOT.z0, maxZ: LOT.z1, school: true },
  );

  return {
    gate: V(-8, 0, LOT.z1),
    entrance: V(-10, FLOOR, -15),
    lobby: V(-10, FLOOR, -18.6),
    desk6G: V(g6.x0 + 4 + 3.6 - 0.4 - 0.25, FLOOR, -24.6 + 0.6),
    sefaSeat: V(sharedDeskX - 0.26, FLOOR, sharedChairZ),
    betulSeat: V(betulChairX, FLOOR, sharedChairZ),
    teacherSpot: V(g6.x0 + 4.3, FLOOR, -28.0),
    kantin: V(B.x0 - 0.9, 0, -6),
    indoorKantin: V(28.0, FLOOR, -16.0),
    detention: V(-10, FLOOR, -18.8),
    pages: [V(-22, 0, -35.5), V(39.5, 0, -18), V(-40.5, 0, 21.5)],
    patrolPrincipal: [V(-10, 0, -8.2), V(-26, 0, -7.0), V(-22, 0, 12), V(-8, 0, 21), V(10, 0, 19), V(14, 0, -6)],
    patrolBulent: [V(-36, FLOOR, -18.6), V(-10, FLOOR, -18.6), V(16, FLOOR, -18.6), V(-1.6, FLOOR, -18.6), V(-1.2, FLOOR, -22.1), V(-1.6, FLOOR, -18.6)],
    patrolRagip: [V(-8, 0, 21), V(38, 0, 21), V(39, 0, 16), V(39, 0, -35), V(-44, 0, -35), V(-44, 0, -9), V(-30, 0, 21)],
  };
}
